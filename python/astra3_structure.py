# ============================================================
# astra3_structure.py
# Astra3: Structural Analysis Toolkit for PDB Rendering Automation
# Created by Andre Aguirre
# Copyright (c) 2026 Andre Aguirre
# Licensed under the GNU General Public License, version 3 or later (GPL-3.0-or-later). See LICENSE file for details.
#
# ------------------------------------------------------------
# MODULE: Structure analysis & processing
# ------------------------------------------------------------
# This module contains the PyMOL structure-analysis logic:
#   - orphaned-state cleanup
#   - the plain-text Overlay_Report.txt builder
#   - per-structure processing (water removal, chain/ligand/ion
#     coloring and naming, N-/C-terminus selection)
#   - all report_* helper functions that inspect a loaded
#     structure (biological assembly, sequence info, secondary
#     structure, ligands, ions, disulfides, flexibility, etc.)
#   - the Protein_Information.txt report builder
#
# No image rendering or HTML report generation happens here.
# See astra3_render_report.py for that. This module depends on
# astra3_core for shared color maps and formatting helpers.
# ------------------------------------------------------------

import time
import re
import difflib
from pymol import cmd

import astra3_align
import astra3_measure

from astra3_core import (
    format_method, engine_name,
    PROTEIN_COLOR_LIST, LIGAND_COLOR_LIST, ION_COLOR_LIST, structure_palette,
    protein_color_map, ligand_color_map, ion_color_map,
    get_color, engine_color, display_date, coordinate_file_line, TERMINUS_COLORS, REFERENCE_ARROW_COLORS, COMPARISON_ARROW_COLORS,
    resolution_classification, format_residue_ranges,
    AA_3TO1, STANDARD_HEAVY_ATOMS, YELLOW, GREEN, RED, WHITE, RESET, BOLD, format_yn_prompt,
    count_missing_residues, _normalize_missing_residue_ranges, resolution_display,
    HOMOMER_RULES, DEFAULT_REDUCE_PRIORITY, chains_text, homomer_rule_outcome, homomer_rule_reason,
    summarize_chain_reduction,
)

# ------------------------------------------------------------
# PURGE / CLEANUP utilities (remove zero-atom selections/objects)
# ------------------------------------------------------------
def reset_session_state():
    """Return PyMOL to a clean slate before an analysis starts.
    Deletes all objects and selections rather than reinitializing: a full
    cmd.reinitialize() would also discard the display settings Astra3
    establishes at startup, and re-applying them per run is slower and easy
    to get subtly wrong.

    Never raises -- a failure here should not stop an analysis that might
    otherwise succeed. Returns the names removed, for disclosure.
    """
    removed = []
    for kind in ("objects", "selections"):
        try:
            names = list(cmd.get_names(kind))
        except Exception:  # noqa: BLE001
            continue
        for name in names:
            try:
                cmd.delete(name)
                removed.append(name)
            except Exception:  # noqa: BLE001 -- one stubborn name must not stop the sweep
                continue
    try:
        # Selections whose atoms have just gone leave their names behind.
        purge_orphaned_state()
    except Exception:  # noqa: BLE001
        pass
    # Colours go to chains, ligands and ions in order of first appearance.
    # Kept from an earlier run, the same ligand could come out a different
    # colour depending on what had been analyzed before it in the session.
    for color_map in (protein_color_map, ligand_color_map, ion_color_map):
        color_map.clear()
    # Surfaces prepared for the previous analysis's structures.
    astra3_measure.forget_surfaces()
    _IN_CHAIN_AS_PROTEIN.clear()
    return removed


def purge_orphaned_state():
    """Conservatively remove zero-atom selections and pseudoobjects."""
    try:
        sels = cmd.get_names("selections")
        for s in list(sels):
            # Astra3's own terminus selections are kept even when empty (every
            # chain too short for termini): later steps and the saved session
            # refer to them by name.
            if s.startswith(("N-Terminus", "C-Terminus")):
                continue
            try:
                if cmd.count_atoms(s) == 0:
                    cmd.delete(s)
            except Exception:
                pass
        objs = cmd.get_names("objects")
        for o in list(objs):
            try:
                cnt = cmd.count_atoms(o)
                if cnt == 0:
                    cmd.delete(o)
            except Exception:
                pass
        for tmp in ("OVERLAY_RENDER_TMP", "temp_overlay_a", "temp_overlay_b"):
            if tmp in cmd.get_names("objects"):
                try:
                    cmd.delete(tmp)
                except Exception:
                    pass
    except Exception:
        pass

# ------------------------------------------------------------
# Overlay Report Variables Defined
# ------------------------------------------------------------

def build_overlay_report(loaded_objs, structure_data, reference_obj, reference_reason,
                        alignment_results, pairwise_matrix, warnings_list):
    lines = []
    lines.append("OVERLAY / ALIGNMENT REPORT")
    lines.append("Generated: " + display_date(with_time=True))
    lines.append("Structures analyzed: " + ", ".join(structure_data[o]["pdb_id"] for o in loaded_objs))
    lines.append("=" * 60)
    lines.append("")

    lines.append("REFERENCE SELECTION")
    lines.append("-" * 60)
    lines.append("Chosen reference: " + structure_data[reference_obj]["pdb_id"])
    lines.append("Reasoning: " + reference_reason)
    lines.append("")

    lines.append("ALIGNMENT SUMMARY")
    lines.append("-" * 60)
    lines.append("Alignment algorithm: least-squares fit of matching protein atoms in")
    lines.append("sequence-paired residues, with iterative outlier rejection. Every")
    lines.append("structure below was aligned directly to the reference, not chained")
    lines.append("through each other.")
    lines.append("")
    for obj in loaded_objs:
        if obj == reference_obj:
            continue
        pid = structure_data[obj]["pdb_id"]
        res = alignment_results.get(obj, {})
        lines.append(pid + " -> " + structure_data[reference_obj]["pdb_id"] + ":")
        if res.get("success"):
            lines.append("  RMSD: %.3f Å" % res["rmsd"])
            lines.append("  Aligned atoms: " + str(res["atoms"]))
            lines.append("  Aligned residues: " + str(res["residues"]))
        else:
            lines.append("  Alignment failed: " + str(res.get("error", "Unknown error")))
        lines.append("  Chains in this structure: " + ", ".join(structure_data[obj]["process_result"]["chain_list"]))
        lines.append("")

    lines.append("PAIRWISE RMSD MATRIX (C-alpha atoms)")
    lines.append("-" * 60)
    if pairwise_matrix:
        for (obj_a, obj_b), rmsd in pairwise_matrix.items():
            pid_a = structure_data[obj_a]["pdb_id"]
            pid_b = structure_data[obj_b]["pdb_id"]
            if rmsd is not None:
                lines.append("  " + pid_a + " vs " + pid_b + ": %.3f Å" % rmsd)
            else:
                lines.append("  " + pid_a + " vs " + pid_b + ": Not available (alignment failed)")
    else:
        lines.append("  Not generated for this run; see warnings below if this was due to")
        lines.append("  the number of structures exceeding the practical limit.")
    lines.append("")

    lines.append("PER-STRUCTURE SUMMARY")
    lines.append("-" * 60)
    for obj in loaded_objs:
        d = structure_data[obj]
        pid = d["pdb_id"]
        pr = d["process_result"]
        hi = d["header_info"]
        lines.append(pid + ":")
        lines.append("  Experimental method: " + format_method(hi))
        lines.append("  Resolution: " + resolution_display(hi))
        lines.append("  Coordinate file: " + coordinate_file_line(hi))
        lines.append("  Chains: " + ", ".join(pr["chain_list"]))

        lines.append("  Detected N-terminal region:")
        if d.get("n_term_residues"):
            for line in format_residue_ranges(d["n_term_residues"], structure_id=pid).split("\n"):
                lines.append("    " + line)
        else:
            lines.append("    None")

        lines.append("  Detected C-terminal region:")
        if d.get("c_term_residues"):
            for line in format_residue_ranges(d["c_term_residues"], structure_id=pid).split("\n"):
                lines.append("    " + line)
        else:
            lines.append("    None")

        lines.append("  Ligands (" + str(len(pr["ligand_info"])) + "): " +
                     (counted_codes(l["resn"] for l in pr["ligand_info"]) if pr["ligand_info"] else "None"))
        lines.append("  Ions (" + str(len(pr["ion_info"])) + "): " +
                     (counted_codes(i["resn"] for i in pr["ion_info"]) if pr["ion_info"] else "None"))

        if d.get("mean_b") is not None:
            lines.append("  Mean C-alpha B-factor: %.2f Å^2 (min %.2f, max %.2f)" % (d["mean_b"], d["min_b"], d["max_b"]))
        else:
            lines.append("  Mean C-alpha B-factor: " + (d.get("b_factor_note") or "Not available"))

        lines.append("  Alternate conformations detected: " + ("Yes" if d["has_altloc"] else "No"))
        lines.append("  Water molecules removed: " + str(pr.get("water_removed", "Not available")))

        if d.get("reduction_used"):
            rm = d.get("reduction_metrics", {})
            lines.append("  Homomer reduction applied: Yes")
            lines.append("    Recommended chain: " + rm.get("recommended_chain", "Unknown"))
            lines.append("    Sequence identity: %.2f%%" % (rm.get("identity", 0.0) * 100.0))
            lines.append("    Sequence coverage: %.2f%%" % (rm.get("coverage", 0.0) * 100.0))
            lines.append("    Length difference: %d residues" % rm.get("length_diff", 0))
            lines.append("    Similarity score: %.2f" % (rm.get("score", 0.0) * 100.0))
            lines.append("    Number of chains reduced: %d" % rm.get("num_redundant", 0))
        else:
            diag = d.get("reduction_diagnostic")
            if diag:
                lines.append("  Homomer reduction: Not applied")
                lines.append("    Diagnostic: " + diag)
        lines.append("")

    lines.append("WARNINGS")
    lines.append("-" * 60)
    if warnings_list:
        for w in warnings_list:
            lines.append("  - " + w)
    else:
        lines.append("  None.")
    lines.append("")

    return "\n".join(lines)

# ------------------------------------------------------------
# STRUCTURE PROCESSING (colors, termini, ligands, ions)
# ------------------------------------------------------------
def counted_codes(codes):
    """"MN × 8, CL × 2": each code once, in order of first appearance."""
    counts = {}
    for code in codes:
        counts[code] = counts.get(code, 0) + 1
    return ", ".join(code if n == 1 else f"{code} × {n}" for code, n in counts.items())


def apply_terminus_colors(n_term_selection, c_term_selection):
    if not TERMINUS_COLORS["enabled"]:
        return
    cmd.color(engine_color(TERMINUS_COLORS["n"]), n_term_selection)
    cmd.color(engine_color(TERMINUS_COLORS["c"]), c_term_selection)


def resi_token(resi):
    """A residue number as written in a PyMOL selection. PyMOL reads a leading
    minus as an open range ("resi -2" selects -2 through 2), so it is escaped:
    "resi \\-2" selects residue -2 alone. Insertion codes pass through."""
    text = str(resi).strip()
    return "\\" + text if text.startswith("-") else text


def resi_expression(resi_list):
    """Several residue numbers as one "resi" argument, e.g. \\-1+0+1."""
    return "+".join(resi_token(r) for r in resi_list)


def resi_sort_key(resv, resi):
    """Compound sort key (resv, insertion_code) for one residue.

    Sorting on resv alone leaves insertion-coded residues (52, 52A, 52B --
    all resv=52) in whatever order the atom stream happened to supply, which
    for terminus selection means the first/last N entries of a chain are not
    reliably its true N-/C-terminal residues. Shared by the coloring path in
    process_structure and get_ordered_ca_coords so both order residues
    identically.
    """
    text = str(resi)
    match = re.match(r"^-?\d+([A-Za-z]?)$", text)
    return (resv, match.group(1) if match else "")


# Minimum occupancy for a residue to count as observed.
#
# A deposited entry can contain atoms that were never observed in the density:
# they carry real coordinates but zero occupancy, flagged by the depositor
# (mmCIF pdbx_unobs_or_zero_occ_residues, PDB REMARK 470/465). PyMOL loads them
# as ordinary atoms, so anything that asks "what is this chain's first residue"
# by reading atoms gets the placeholder, not the first residue anyone actually
# saw.
#
# This is not a rare edge case and it is not cosmetic. A structure whose first
# 42 residues are zero-occupancy placeholders has a "terminus" 42 residues away
# from the one a comparison structure resolves; the two termini then have no
# relation to each other, the offset needed to reconcile them is far outside
# any sane search window, and every terminal measurement is computed between
# non-corresponding regions while looking perfectly well-formed. Those
# placeholder residues also frequently carry backbone atoms only, so PyMOL's
# cartoon draws nothing for them -- the terminus is colored, and invisible.
#
# Zero-occupancy atoms are therefore excluded from every "resolved residue"
# question: terminus selection, sequence extraction, and coordinate ordering.
# They are left in the loaded object (deleting a depositor's data is not this
# program's decision) and their exclusion is always disclosed, never silent.
MIN_OBSERVED_OCCUPANCY = 0.01

# How far the terminus offset search looks for the frame in which two termini
# correspond, in residues.
#
# The default is deliberately small. Its job is ordinary terminal disorder --
# one crystal resolving a few more tail residues than another -- and a narrow
# window is what keeps it from wandering off and finding a plausible-looking
# match somewhere unrelated.
#
# The advanced pass exists for the case the default cannot represent at all:
# two entries of the same protein built from different constructs, where one
# carries an expression tag, a cloning scar, or a whole extra domain ahead of
# the point the other begins. Those differ by tens of residues, not a few, and
# a search that stops at 25 simply reports "these termini do not correspond"
# for a pair whose termini correspond perfectly 40 residues in. The advanced
# range therefore spans a construct-scale difference rather than a disorder-
# scale one.
#
# Cost is not the constraint: the search is a windowed exact-match count per
# offset, linear in the range, and bounded above by the chain length regardless
# of what is asked for. The real constraint is a spurious distant match, which
# is handled by the ties-go-to-the-smaller-offset rule in the search itself and
# by disclosing any large adopted offset rather than applying it quietly.
TERMINUS_SEARCH_EXTRA_DEFAULT = 10
TERMINUS_SEARCH_EXTRA_ADVANCED = 250

# An adopted offset at or above this many residues is no longer an ordinary
# terminal-disorder correction; it means the two structures start at genuinely
# different points in the construct. Always disclosed.
LARGE_TERMINUS_OFFSET = 15

# Lowest terminus identity at which -alwaysmatch applies an offset correction
# without asking. A weaker match is left uncorrected for the person to review.
AUTO_MATCH_MIN_IDENTITY = 0.70


def is_observed_occupancy(q):
    """True when an atom's occupancy marks it as actually observed.

    Anything at or below MIN_OBSERVED_OCCUPANCY is a placeholder coordinate,
    not a measurement. Missing or non-numeric occupancy is treated as observed:
    some file formats and computational models simply do not set it, and
    discarding those residues would be far worse than including them.
    """
    if q is None:
        return True
    try:
        return float(q) > MIN_OBSERVED_OCCUPANCY
    except (TypeError, ValueError):
        return True


def summarize_unobserved_residues(obj, chain_list=None):
    """Report which residues in obj are present as atoms but unobserved
    (zero occupancy), per chain.

    Returns {chain: [resi, ...]} for chains that have any, so the caller can
    disclose them. Never raises.
    """
    found = {}
    try:
        sel = f"({obj}) and polymer.protein and name CA"
        if chain_list:
            chains = "+".join(str(c) for c in chain_list)
            sel += f" and chain {chains}"
        raw = []
        cmd.iterate(sel, "raw.append((chain, resi, q))", space={"raw": raw})
    except Exception:
        return found
    for chain, resi, q in raw:
        if not is_observed_occupancy(q):
            found.setdefault(chain, []).append(resi)
    return found


def group_ca_residues_by_chain(stored_list):
    """Group (chain, resv, resi) Cα records into {chain: [(resv, resi), ...]},
    dropping only true duplicates.

    Deduplication keys on (chain, resi) -- the full residue identifier,
    insertion code included -- not (chain, resv). PyMOL documents resv as the
    residue number EXCLUDING the insertion code, so 52, 52A and 52B all share
    resv=52 and a resv-keyed set silently discards two real residues that have
    coordinates and are measured everywhere else. That made the terminus
    window selected and colored here contain different residues from the one
    get_ordered_ca_coords measures, which is the disagreement a user sees as
    a terminus with fewer residues colored than the window size.

    Alternate locations still produce genuine repeats of one resi; the first
    is kept so the result is deterministic.
    """
    seen = set()
    chains_res = {}
    for record in stored_list:
        chain, resv, resi = record[0], record[1], record[2]
        occupancy = record[3] if len(record) > 3 else None
        if not is_observed_occupancy(occupancy):
            # Unobserved placeholder: excluded from the terminus window, which
            # is otherwise anchored on a residue nobody ever saw.
            continue
        key = (chain, resi)
        if key in seen:
            continue
        seen.add(key)
        chains_res.setdefault(chain, []).append((resv, resi))
    return chains_res


# Number of residues from each end of a chain treated as its N-/C-terminus for
# selection, coloring, and reporting. Matches the tip+orientation window
# (tip_n=5 + orientation_n=5) used by compare_termini's vector math, so the
# colored region and the region actually measured by TERMINI are the same
# residues.
TERMINUS_WINDOW = 10

# Residues behind the Terminal Projection Vector: the terminal residue and the
# three next to it. Short enough to describe the direction the chain is heading
# as it leaves the protein, so it measures something different from the
# orientation vector, which follows the whole ten-residue terminal segment.
TPV_WINDOW = 4

# Chain-length classification for deciding whether a chain is treated as a
# genuine subject protein chain (eligible for N-/C-terminus selection) or
# excluded as a likely bound peptide ligand. Chain length alone cannot
# distinguish "this is a peptide ligand" from "this is the real subject chain
# with most of its length unresolved" -- PyMOL's polymer.protein selector is
# purely geometric (peptide bonds + standard residue names) and has no concept
# of biological role. This is therefore always a heuristic, never a certainty:
# < LIGAND_MAX_CHAIN_LENGTH residues: treated as a ligand -- excluded from
# N-/C-terminus selection, disclosed via a printed warning.
# LIGAND_MAX_CHAIN_LENGTH..PROTEIN_MIN_CHAIN_LENGTH-1 residues: genuinely
# ambiguous -- neither clearly a short peptide nor clearly a full protein
# chain. The user is shown the actual sequence and asked directly rather than
# Astra3 guessing either way. >= PROTEIN_MIN_CHAIN_LENGTH residues: treated as
# a real protein chain, included in N-/C-terminus selection automatically.
LIGAND_MAX_CHAIN_LENGTH = 25
PROTEIN_MIN_CHAIN_LENGTH = 40
# Backward-compatible alias: several places historically referenced this name
# for "the length below which a chain is excluded". Kept pointing at the same
# constant so any lingering reference still means the same threshold rather
# than silently going stale.
MIN_TERMINUS_CHAIN_LENGTH = LIGAND_MAX_CHAIN_LENGTH


def keep_first_model(obj):
    """Reduce a multi-model object (an NMR ensemble) to its first model and
    return how many models the file held.

    PyMOL keeps every model of an ensemble as a state. Coordinates, surface
    areas and images use the current state, but distance selections look
    across all states, so ligand contacts would otherwise combine every
    model. Keeping one model makes every value describe the same one.
    """
    try:
        count = cmd.count_states(obj)
    except Exception:
        return 1
    if count > 1:
        first = "_astra3_first_model"
        cmd.create(first, obj, 1, 1)
        cmd.delete(obj)
        cmd.set_name(first, obj)
    return count


def label_blank_chains(obj):
    """Give protein and nucleic-acid residues that have no chain ID a chain
    letter, and return it (None when nothing was blank).

    Files written by simulation and modelling programs, and some older
    entries, leave the chain column empty. Every per-chain step selects atoms
    by chain, and an empty identifier makes those selections malformed, so
    terminus selection, close-ups and chain matching failed on such files.
    The first letter not already used in the structure is taken; ligands,
    ions and waters keep their blank chain."""
    try:
        if cmd.count_atoms(f"({obj}) and chain '' and polymer") == 0:
            return None
        used = set()
        cmd.iterate(f"({obj})", "used.add(chain)", space={"used": used})
        for letter in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789":
            if letter not in used:
                cmd.alter(f"({obj}) and chain '' and polymer", f"chain='{letter}'")
                cmd.sort(obj)
                return letter
    except Exception:  # noqa: BLE001 -- leave the structure as it was
        return None
    return None


def fill_missing_occupancy(obj):
    """Treat every atom as observed when the file gives no occupancies.

    Zero occupancy marks an atom that was modeled but not seen. A file in
    which every atom is zero (or the column is blank, which reads as zero)
    says nothing about observation: modelling and simulation programs often
    leave the column empty. Taken literally, every residue would count as
    unobserved and the analysis would have nothing to measure. Returns True
    when the occupancies were set to 1."""
    try:
        if cmd.count_atoms(f"({obj})") and cmd.count_atoms(f"({obj}) and q > 0") == 0:
            cmd.alter(f"({obj})", "q = 1.0")
            return True
    except Exception:  # noqa: BLE001 -- leave the structure as it was
        return False
    return False


def natural_chain_key(chain):
    """Sort key putting chains in reading order: A2 before A10."""
    return [(0, int(part), "") if part.isdigit() else (1, 0, part)
            for part in re.split(r"(\d+)", str(chain)) if part != ""]


def chain_label(chain):
    """A chain identifier as written in messages and reports."""
    return f"chain {chain}" if str(chain or "").strip() else "no chain ID"


def _sentence_start(text):
    return text[:1].upper() + text[1:]


def structure_run_notes(name, process_result, models_in_file=1, blank_chain_label=None, occupancy_filled=False):
    """Report warnings about what a structure's analysis covers: which
    model of an ensemble, and which chains were left out of terminus
    selection for being short."""
    notes = []
    if occupancy_filled:
        notes.append(f"{name}: the file gives no occupancies (every atom is blank or zero); all atoms were "
                     f"treated as observed.")
    if blank_chain_label:
        notes.append(f"{name}: the file gives no chain ID for its polymer residues; Astra3 labelled them chain "
                     f"{blank_chain_label}.")
    if models_in_file and models_in_file > 1:
        notes.append(f"{name}: the file holds {models_in_file} models (an ensemble, as deposited for NMR "
                     f"entries); Astra3 analyzed and rendered the first model only.")
    for item in (process_result or {}).get("excluded_short_chains") or []:
        notes.append(f"{name}: chain {item['chain']} has {item['residues']} resolved residues and was excluded "
                     f"from N-/C-terminus selection (terminus analysis needs {PROTEIN_MIN_CHAIN_LENGTH} or more, "
                     f"or {LIGAND_MAX_CHAIN_LENGTH}-{PROTEIN_MIN_CHAIN_LENGTH - 1} with confirmation). It may be a "
                     f"peptide ligand or a chain with unresolved ends.")
    return notes


def b_factor_summary(b_values, method=None):
    """Mean, minimum and maximum of a structure's C-alpha B-factors.

    Returns (mean, min, max, note). The numbers are None, with the reason in
    note, for an NMR entry, whose B-factor column holds no crystallographic
    displacement factors, and for a file whose B-factors are all zero, a
    placeholder rather than a measurement.
    """
    method_text = str(method or "").strip()
    if "NMR" in method_text.upper():
        label = method_text.lower().replace("nmr", "NMR")
        return None, None, None, f"Not applicable ({label})"
    if not b_values:
        return None, None, None, "Not available"
    if all(abs(b) < 1e-6 for b in b_values):
        return None, None, None, "Not recorded in this file"
    # As the file records them. PyMOL keeps B-factors in single precision
    # (72.06 reads back as 72.05999755859375); the shortest single-precision
    # form gives the file's 72.06 under every engine.
    import numpy as np
    b_values = [float(str(np.float32(b))) for b in b_values]
    return sum(b_values) / len(b_values), min(b_values), max(b_values), None


def prompt_ambiguous_chain_length(pdb_id, obj, chain, residue_count, sequence, identical_chains=None):
    """A chain's resolved length falls in the ambiguous 25-40 residue
    zone (LIGAND_MAX_CHAIN_LENGTH..PROTEIN_MIN_CHAIN_LENGTH) -- neither
    short enough to confidently call a bound peptide nor long enough to
    confidently call a full protein chain. Shows the user the actual
    resolved sequence and asks directly whether this chain should be
    treated as a peptide (excluded from N-/C-terminus selection) or as a
    protein chain (included), rather than Astra3 guessing either way.

    Returns True if the chain should be treated as a peptide (excluded),
    False if it should be treated as a protein chain (included). Declining
    (anything other than an explicit yes) defaults to treating it as a
    peptide/ligand -- the safer default, since silently including a bound
    peptide's tail in termini analysis risks skewing results, while
    excluding a genuine short protein chain only means it's left out of
    this one analysis (still visible, still colored by chain, just not
    treated as a terminus).
    """
    print("-" * 50, flush=True)
    print(f"{BOLD}Ambiguous Chain Length{RESET}", flush=True)
    print("-" * 50, flush=True)
    others = [c for c in (identical_chains or []) if c != chain]
    print(f"{WHITE}{pdb_id} chain {chain}: {residue_count} resolved residues "
          f"(between {LIGAND_MAX_CHAIN_LENGTH} and {PROTEIN_MIN_CHAIN_LENGTH}) -- "
          f"could be a bound peptide or a short protein chain.{RESET}", flush=True)
    if others:
        shown = ", ".join(others[:12]) + (f" and {len(others) - 12} more" if len(others) > 12 else "")
        print(f"{WHITE}{len(others)} other chain(s) have exactly the same residues and get the same answer: "
              f"{shown}.{RESET}", flush=True)
    if sequence and set(sequence) == {"X"}:
        print(f"{WHITE}Sequence: not modelled -- all {len(sequence)} residues are of unknown type (UNK) in the "
              f"deposited file.{RESET}", flush=True)
    else:
        print(f"{WHITE}Sequence: {sequence}{RESET}", flush=True)
    print(f"{YELLOW}A peptide/ligand chain is excluded from N-/C-terminus selection and TERMINI "
          f"analysis.{RESET}", flush=True)
    subject = f"chain {chain} of {pdb_id}" if not others else f"chain {chain} of {pdb_id} (and its {len(others)} identical copies)"
    print(f"Is {subject} a peptide/ligand? {format_yn_prompt()}: ", end="", flush=True)
    try:
        choice = input().strip().lower()
    except KeyboardInterrupt:
        print(f"\n{YELLOW}Prompt cancelled: treating chain {chain} as a peptide/ligand by default.{RESET}", flush=True)
        choice = "y"
    is_peptide = choice in ("y", "yes")
    if is_peptide:
        print(f"{WHITE}Chain {chain} will be treated as a peptide/ligand.{RESET}", flush=True)
    else:
        print(f"{WHITE}Chain {chain} will be treated as a protein chain.{RESET}", flush=True)
    print("", flush=True)
    return is_peptide


# Residues built into a protein chain without a standard backbone, such as
# fluorescent-protein chromophores (CRO, PIA, GYS): joined to both neighbours
# by peptide bonds but with no atom named CA, so polymer.protein leaves them
# out and they would be listed as ligands. ChimeraX and the file's polymer
# records count them as protein. Which suits an analysis depends on the
# structure and the question asked of it, so the person decides.
# {object: {(chain, resi)}} of those counted as protein.
_IN_CHAIN_AS_PROTEIN = {}
# "protein" or "ligand" from -chromophoreprotein / -chromophoreligand, or
# None to ask.
_IN_CHAIN_POLICY = None
PEPTIDE_BOND_MAX = 1.9      # Å, C-N distance accepted as a peptide bond


def set_in_chain_residue_policy(policy):
    global _IN_CHAIN_POLICY
    _IN_CHAIN_POLICY = policy


def in_chain_residues(obj, residues):
    """Those of residues ([(chain, resi, resn)], not polymer.protein) that a
    peptide bond joins to the protein residue before and after them."""
    found = []
    for ch, ri, resn in residues:
        sel = f'{obj} and chain "{ch}" and resi "{resi_token(ri)}" and resn "{resn}"'
        backbone = f'{obj} and chain "{ch}" and polymer.protein and name'
        if (cmd.count_atoms(f"({backbone} C) within {PEPTIDE_BOND_MAX} of ({sel})")
                and cmd.count_atoms(f"({backbone} N) within {PEPTIDE_BOND_MAX} of ({sel})")):
            found.append((ch, ri, resn))
    return found


def decide_in_chain_residues(obj, residues):
    """{(chain, resi)} of residues to count as protein in obj, asking the
    person once per object unless a command option already decided."""
    if obj in _IN_CHAIN_AS_PROTEIN or not residues:
        return _IN_CHAIN_AS_PROTEIN.get(obj, set())
    listed = ", ".join(f"{resn} {ri} (chain {ch})" for ch, ri, resn in residues)
    one = len(residues) == 1
    if _IN_CHAIN_POLICY:
        as_protein = _IN_CHAIN_POLICY == "protein"
    else:
        print("-" * 50, flush=True)
        print(f"{BOLD}Residues Built Into the Chain{RESET}", flush=True)
        print("-" * 50, flush=True)
        print(f"{WHITE}{obj}: {listed} {'is' if one else 'are'} joined to the residues on both sides by peptide "
              f"bonds but {'has' if one else 'have'} no standard backbone (no Cα), as a fluorescent-protein "
              f"chromophore does.{RESET}", flush=True)
        if one:
            print(f"{WHITE}Counted as protein, it is part of the chain for normalized B-factors and is not listed "
                  f"as a ligand. Kept as a ligand, its neighbours and contacts are listed with the ligands.{RESET}",
                  flush=True)
        else:
            print(f"{WHITE}Counted as protein, they are part of the chain for normalized B-factors and are not "
                  f"listed as ligands. Kept as ligands, their neighbours and contacts are listed with the "
                  f"ligands.{RESET}", flush=True)
        print(f"Count {listed} of {obj} as part of the protein? {format_yn_prompt()}: ", end="", flush=True)
        try:
            as_protein = input().strip().lower() in ("y", "yes")
        except KeyboardInterrupt:
            print(f"\n{YELLOW}Prompt cancelled: keeping {'it as a ligand' if one else 'them as ligands'}.{RESET}",
                  flush=True)
            as_protein = False
    outcome = "counted as protein" if as_protein else ("kept as a ligand" if one else "kept as ligands")
    option = f" ({'-chromophoreprotein' if as_protein else '-chromophoreligand'})" if _IN_CHAIN_POLICY else ""
    print(f"{WHITE}{listed}: {outcome}{option}.{RESET}", flush=True)
    _IN_CHAIN_AS_PROTEIN[obj] = {(ch, ri) for ch, ri, _resn in residues} if as_protein else set()
    return _IN_CHAIN_AS_PROTEIN[obj]


def inherit_in_chain_decision(source_obj, new_obj):
    """A copy made from source_obj (a reduced object) keeps its decision."""
    if source_obj in _IN_CHAIN_AS_PROTEIN:
        _IN_CHAIN_AS_PROTEIN[new_obj] = set(_IN_CHAIN_AS_PROTEIN[source_obj])


def protein_selection(obj):
    """obj's protein atoms: polymer.protein plus residues built into the chain
    that the person chose to count as protein."""
    extra = "".join(f' or (chain "{ch}" and resi "{resi_token(ri)}")'
                    for ch, ri in sorted(_IN_CHAIN_AS_PROTEIN.get(obj, ())))
    return f"{obj} and (polymer.protein{extra})"


def process_structure(obj, selection_suffix="", capture_water_for_viewer=False,
                      protein_colors=None, deposited_unobserved=None):
    """Process a loaded object: remove water, color chains, name selections.
    capture_water_for_viewer: when True, a water-included copy of obj is
    saved off before water is stripped (see the block below), for the
    GUI's structure viewer's "Show waters" toggle. Defaults to False --
    single-structure analysis is the only caller that passes True, since
    it's the only case with a real per-structure viewer .pdb export
    (save_session() is only ever called once per structure there).

    IMPORTANT: this function can run MORE THAN ONCE for the same obj
    (e.g. once on initial load, again after intra-structure homomer
    reduction re-processes the now-reduced object -- see
    apply_intra_structure_homomer_reduction). A defect from
    an earlier version of this water-capture logic: creating the
    "_wviewer" copy unconditionally on EVERY call left a stray,
    uncolored, unreduced, full-chain duplicate of the ORIGINAL
    structure sitting in the scene for the entire rest of the run --
    it was created before this call's own coloring runs, so it was
    never colored at all (PyMOL's default carbon-color cycling then
    made it look pink), and a homomer-reduction re-run never touches
    an already-existing copy from the FIRST call at all, so it also
    never got reduced. That stray object was then fully visible
    (enabled, unhidden) in every rendered image and the saved .pse
    right alongside the real, correctly-processed object, until
    save_session() finally deleted it at the very end -- exactly
    matching a real, reported symptom (chain reduction visibly working
    in the console log, but the saved session/images still showing an
    extra, uncolored, unreduced, "raw pink" copy of the whole original
    structure). Fixed by deleting any pre-existing copy from an EARLIER
    call unconditionally at the start of every call (whether or not
    THIS call goes on to create a new one), so at most one water copy
    can ever exist at a time -- and it's always deleted and freshly
    recreated from THIS call's own view of obj (so a re-run after
    reduction correctly gets a reduced copy, not a stale full one).
    """
    print("Processing: " + obj, flush=True)

    water_viewer_copy_name_candidate = obj + "_wviewer" + (selection_suffix or "")
    if water_viewer_copy_name_candidate in cmd.get_names("objects"):
        try:
            cmd.delete(water_viewer_copy_name_candidate)
        except Exception:
            pass

    # remove HOH
    # Waters are numbered per chain, so a residue number alone is not unique:
    # counting those collapsed one water per chain into a single water.
    water_count = []
    cmd.iterate(obj + " and (solvent or resn HOH+WAT+DOD+H2O)",
                "water_count.append((segi, chain, resi))", space={'water_count': water_count})
    water_detected = len(set(water_count))

    # Before removing water from the real analysis object below, save a copy
    # of it (waters included) into its own object, ONLY for Astra3's own GUI
    # structure viewer -- see save_session()'s own docstring on why the viewer
    # needs a plain .pdb export at all, and the Viewer page's "Show waters"
    # toggle.pdb file it loads was always generated AFTER this removal, so
    # there was never any water left in it to reveal regardless of the toggle.
    # Water is still unconditionally removed from the actual analysis object
    # immediately below -- this doesn't change what's used for coloring,
    # metrics, the report, or the rendered images at all, only what the
    # viewer-specific .pdb additionally has available. The copy is
    # intentionally named with a "_wviewer" suffix (not underscore-prefixed --
    # see the TPV-vector naming precedent in astra3_render_report.py for why a
    # leading "_" would hide it from PyMOL's own object panel, though this one
    # is deleted before the session is ever saved, so that distinction is
    # mostly moot here) and is deleted again right after save_session() reads
    # from it, so it never lingers as visible clutter in the working PyMOL
    # session either.
    water_viewer_copy_name = None
    if capture_water_for_viewer and water_detected:
        try:
            water_viewer_copy_name = water_viewer_copy_name_candidate
            cmd.create(water_viewer_copy_name, obj)
        except Exception:
            water_viewer_copy_name = None  # best-effort -- the viewer's water toggle simply has nothing to show if this fails, nothing else depends on it

    cmd.remove(obj + " and (solvent or resn HOH+WAT+DOD+H2O)")
    water_removed = water_detected

    try:
        chain_list = cmd.get_chains(obj + " and polymer.protein")
    except Exception:
        chain_list = []

    # A map of this structure's own when it has its own palette. The shared
    # protein_color_map is keyed by chain letter alone, so "A" resolved to
    # whatever colour the FIRST structure's chain A was given and every
    # structure in a comparison came out identically grey -- the palette was
    # passed correctly and then never consulted.
    chain_color_map = {} if protein_colors else protein_color_map

    chain_info = []
    for ch in chain_list:
        # protein_colors, when given, is this structure's own palette in a
        # comparison run, so chains are coloured per structure rather than
        # every structure repeating the same greys.
        col = get_color(ch, chain_color_map, protein_colors or PROTEIN_COLOR_LIST)
        cmd.color(engine_color(col), obj + " and chain " + ch + " and polymer.protein")
        sel_name = "protein-chain_" + ch + selection_suffix
        cmd.select(sel_name, obj + " and chain " + ch + " and polymer.protein")
        print("Chain " + ch + " named " + sel_name + " and colored " + col, flush=True)
        chain_info.append({"chain": ch, "sel_name": sel_name, "color": col})

    # N/C termini from CA atoms.
    #
    # Deduplication keys on (chain, resi) -- the full residue identifier,
    # insertion code included -- not (chain, resv). PyMOL documents resv as
    # the residue number EXCLUDING the insertion code, so 52, 52A and 52B
    # share resv=52 and a resv-keyed set discards two real residues. Those
    # residues still have coordinates and are still measured by
    # get_ordered_ca_coords (which keys on resi), so a resv-keyed dedup here
    # produced a colored/selected terminus window that did not contain the
    # same residues as the measured one.
    stored_list = []
    cmd.iterate(obj + " and polymer.protein and name CA",
                "stored_list.append((chain, int(resv), resi, q))",
                space={'stored_list': stored_list})
    chains_res = group_ca_residues_by_chain(stored_list)

    # Disclose any residues excluded as unobserved. This changes which residues
    # are treated as a chain's termini, so it is never applied silently.
    unobserved = {}
    for chain, resv, resi, q in stored_list:
        if not is_observed_occupancy(q):
            unobserved.setdefault(chain, []).append(resi)
    unobserved_deposited = deposited_numbering_for_unobserved(unobserved, deposited_unobserved)
    for chain in sorted(unobserved):
        excluded = unobserved[chain]
        if chain in unobserved_deposited:
            where = f"{console_residue_ranges(unobserved_deposited[chain])}, numbered as deposited"
        else:
            where = f"resi {console_residue_ranges(excluded)}"
        print(f"{YELLOW}Chain {chain}: {len(excluded)} residue(s) have zero occupancy in the loaded structure "
              f"({where}) and were not observed experimentally. They are excluded from terminus selection, "
              f"sequence comparison and all terminal measurements, so those reflect the first and last "
              f"residues actually resolved. The residues remain in the loaded structure.{RESET}", flush=True)

    # Classify each chain by resolved length (see LIGAND_MAX_CHAIN_LENGTH /
    # PROTEIN_MIN_CHAIN_LENGTH docstring above): short chains are excluded as
    # likely peptide ligands, long chains are included as protein chains, and
    # the ambiguous middle zone is resolved by asking the user directly rather
    # than guessing either way. Always disclosed, never applied silently.
    short_chains_excluded = []
    termini_eligible_chains = {}
    ambiguous_chains = [c for c, reslist in chains_res.items()
                        if LIGAND_MAX_CHAIN_LENGTH <= len(reslist) < PROTEIN_MIN_CHAIN_LENGTH]
    ambiguous_sequences = get_chain_sequences(obj, ambiguous_chains) if ambiguous_chains else {}
    # Copies of the same short protein are asked about once: the answer for
    # one chain applies to every chain with exactly the same residues.
    ambiguous_groups = {}
    for c in ambiguous_chains:
        ambiguous_groups.setdefault(tuple(ambiguous_sequences.get(c, {}).items()) or (c,), []).append(c)
    ambiguous_answers = {}
    for c, reslist in chains_res.items():
        count = len(reslist)
        if count < LIGAND_MAX_CHAIN_LENGTH:
            short_chains_excluded.append((c, count))
        elif count < PROTEIN_MIN_CHAIN_LENGTH:
            seq_by_resv = ambiguous_sequences.get(c, {})
            sequence = "".join(seq_by_resv[rv] for rv in sorted(seq_by_resv)) if seq_by_resv else "(sequence unavailable)"
            group_key = tuple(seq_by_resv.items()) or (c,)
            if group_key not in ambiguous_answers:
                ambiguous_answers[group_key] = prompt_ambiguous_chain_length(
                    obj, obj, c, count, sequence, identical_chains=ambiguous_groups.get(group_key))
            is_peptide = ambiguous_answers[group_key]
            if is_peptide:
                short_chains_excluded.append((c, count))
            else:
                termini_eligible_chains[c] = reslist
        else:
            termini_eligible_chains[c] = reslist
    if short_chains_excluded:
        for c, count in short_chains_excluded:
            if count < LIGAND_MAX_CHAIN_LENGTH:
                print(f"{YELLOW}Chain {c}: only {count} resolved residues, excluded from N-/C-terminus "
                      f"selection (needs {PROTEIN_MIN_CHAIN_LENGTH}+, or {LIGAND_MAX_CHAIN_LENGTH}-"
                      f"{PROTEIN_MIN_CHAIN_LENGTH - 1} with confirmation). May be a peptide ligand or a "
                      f"subject chain with unresolved ends. Verify visually.{RESET}", flush=True)

    n = TERMINUS_WINDOW
    first_all = []
    last_all = []
    for c in termini_eligible_chains:
        reslist = sorted(termini_eligible_chains[c], key=lambda x: resi_sort_key(x[0], x[1]))
        first_all.extend([(c, ri) for r, ri in reslist[:n]])
        last_all.extend([(c, ri) for r, ri in reslist[-n:]])

    first_sel = " or ".join("(chain %s and resi %s)" % (c, resi_token(ri)) for c, ri in first_all) or "none"
    last_sel = " or ".join("(chain %s and resi %s)" % (c, resi_token(ri)) for c, ri in last_all) or "none"
    n_term_name = "N-Terminus" + selection_suffix
    c_term_name = "C-Terminus" + selection_suffix
    if first_sel != "none":
        cmd.select(n_term_name, obj + " and (" + first_sel + ")")
    else:
        cmd.select(n_term_name, "none")
    if last_sel != "none":
        cmd.select(c_term_name, obj + " and (" + last_sel + ")")
    else:
        cmd.select(c_term_name, "none")

    apply_terminus_colors(n_term_name, c_term_name)
    chain_count = len(termini_eligible_chains)
    chain_word = "chain" if chain_count == 1 else "chains"
    print("N-Terminus: %d residues across %d %s" % (len(first_all), chain_count, chain_word), flush=True)
    print("C-Terminus: %d residues across %d %s" % (len(last_all), chain_count, chain_word), flush=True)

    # ligands (organic & not polymer)
    lig_list = []
    cmd.iterate(obj + " and organic and not polymer",
                "lig_list.append((chain, resi, resn))",
                space={'lig_list': lig_list})

    insertion_detected = False
    for c, r, rn in lig_list:
        if re.search(r"[A-Za-z]", str(r)):
            insertion_detected = True

    seen_ligs = set()
    unique_ligs = []
    for item in lig_list:
        if item not in seen_ligs:
            seen_ligs.add(item)
            unique_ligs.append(item)
    in_chain = in_chain_residues(obj, unique_ligs)
    as_protein = decide_in_chain_residues(obj, in_chain)
    unique_ligs = [item for item in unique_ligs if (item[0], item[1]) not in as_protein]

    ligand_info = []
    ligand_name_counts = {}
    for ch, ri, resn in unique_ligs:
        ins_code = ""
        ligand_name_counts[resn] = ligand_name_counts.get(resn, 0) + 1
        same_ligand_total = sum(1 for x in unique_ligs if x[2] == resn)
        if same_ligand_total > 1:
            sel_name_base = "lig_" + resn + "_" + str(ligand_name_counts[resn])
        else:
            # Always prefix with "lig_", even for the common single-instance
            # case. A bare 3-letter code (e.g. "SCN") is also a valid PyMOL
            # selector keyword (resn SCN); naming the selection object itself
            # "SCN" makes later compound selections like "byres ((SCN) around
            # 4.0) ..." ambiguous to PyMOL's parser and can raise Selector-
            # Error, or silently select the wrong atoms, depending on context.
            # Prefixing guarantees the selection name can never collide with
            # selector syntax while resn itself is unchanged everywhere it's
            # displayed.
            sel_name_base = "lig_" + resn
        sel_name = sel_name_base + selection_suffix
        existing_selections = cmd.get_names("selections")
        if sel_name in existing_selections:
            sel_name = sel_name_base + "_" + ch + "_" + ri + selection_suffix
        col = get_color(resn, ligand_color_map, LIGAND_COLOR_LIST)
        # Each dynamic identifier is double-quoted (PyMOL's own syntax for a
        # literal identifier token, e.g. `resn "X"`) rather than spliced in
        # bare. "A1AQW") falls into the same
        # letter-digit-token-is-ambiguous-between-name-and-identifier
        # territory PyMOL's own selection-macro grammar documents for residue
        # fields, and produced exactly the "byres (...) around 4.0 ...
        # Selector-Error" failures, which is why this does not occur with
        # legacy-PDB-sourced structures). Quoting sidesteps the ambiguity
        # outright rather than depending on exactly how the tokenizer
        # resolves it. chain and resi are quoted too, defensively, since
        # mmCIF also permits multi-character chain IDs (e.g. "AA") that carry
        # the same class of risk, even though no case of that failing has
        # been observed.
        sel_string = f'{obj} and chain "{ch}" and resi "{resi_token(ri)}" and resn "{resn}"'
        # Naming a ligand is presentation only: the atoms are in the object
        # either way. A selection that fails to resolve must not discard a
        # structure that has already loaded and been processed -- in a multi-
        # structure run that structure may be the alignment reference, and
        # losing it ends the whole run. The loaded-object list is included
        # because it is the only evidence of why a name did not resolve, and
        # it cannot be recovered afterwards.
        try:
            cmd.select(sel_name, sel_string)
            cmd.color(engine_color(col), sel_name)
        except Exception as ligand_error:
            try:
                present = ", ".join(sorted(cmd.get_names("objects"))) or "(none)"
            except Exception:
                present = "(could not list objects)"
            print(f"{YELLOW}Could not name ligand {resn} ({chain_label(ch)}, residue {ri}) in {obj}: "
                  f"{ligand_error}. The ligand is still present and analysed; only its label was "
                  f"skipped. Objects currently loaded: {present}{RESET}", flush=True)
            continue
        print("Ligand named " + sel_name + " (" + resn + ", " + chain_label(ch) + ", residue " + ri + ") and colored " + col, flush=True)
        ligand_info.append({
            "resn": resn,
            "sel_name": sel_name,
            "chain": ch,
            "resi": ri,
            "ins_code": ins_code,
            "color": col,
            "identity_confirmed": not insertion_detected,
        })

    # ions (inorganic)
    ion_list = []
    cmd.iterate(obj + " and inorganic",
                "ion_list.append((chain, resi, resn))",
                space={'ion_list': ion_list})
    seen_ions = set()
    unique_ions = []
    for item in ion_list:
        if item not in seen_ions:
            seen_ions.add(item)
            unique_ions.append(item)

    ion_counts = {}
    ion_info = []
    for ch, ri, resn in unique_ions:
        col = get_color(resn, ion_color_map, ION_COLOR_LIST)
        ion_counts[resn] = ion_counts.get(resn, 0) + 1
        # Prefixed with "ion_", matching the ligand block's "lig_" prefix
        # above and for the same reason: a bare resn (e.g. "NA", "CA" -- "CA"
        # is also a valid `name` selector value for alpha carbons) used
        # directly as a selection NAME risks colliding with selector syntax in
        # later compound selections. "NA_ion1" -- the count suffix happened to
        # avoid the exact collision, but only by accident, not by the same
        # deliberate guarantee the ligand block documents for itself).
        sel_name_base = "ion_" + resn + "_" + str(ion_counts[resn])
        sel_name = sel_name_base + selection_suffix
        # See the matching comment in the ligand block above: quoting every
        # dynamic identifier (chain/resi/resn) in the SELECTOR STRING is what
        # actually matters for the mmCIF 5-character CCD code / multi-
        # character chain ID cases -- the sel_name prefix fix above only
        # protects the selection's own name, not this.
        sel_string = f'{obj} and chain "{ch}" and resi "{resi_token(ri)}" and resn "{resn}"'
        existing_selections = cmd.get_names("selections")
        if sel_name in existing_selections:
            sel_name = sel_name_base + "_" + ch + "_" + ri + selection_suffix
        cmd.select(sel_name, sel_string)
        cmd.color(engine_color(col), sel_name)
        print("Ion named " + sel_name + " and colored " + col, flush=True)
        ion_info.append({"resn": resn, "sel_name": sel_name, "chain": ch, "resi": ri, "color": col})

    print("Finished processing: " + obj, flush=True)
    return {
        "chain_list": chain_list,
        "chain_info": chain_info,
        # DNA/RNA chains: kept in the model, described, not measured.
        "nucleic_acid_chains": {c: {"type": kind, "nucleotides": n}
                                for c, (kind, n) in sorted(nucleic_acid_chains(obj).items())},
        "ligand_info": ligand_info,
        "ion_info": ion_info,
        "in_chain_residues": [{"chain": ch, "resi": ri, "resn": resn,
                               "counted_as": "protein" if (ch, ri) in as_protein else "ligand"}
                              for ch, ri, resn in in_chain],
        # Resolved residue count per protein chain -- residues with
        # coordinates, which is what every downstream measurement can
        # actually reach. Normally shorter than the deposited sequence, and
        # the figure a report needs in order to state what a window or an
        # alignment was measured against.
        "chain_sequence_lengths": {c: len(reslist) for c, reslist in chains_res.items()},
        # Residues with coordinates that were never observed (zero occupancy).
        # Distinct from header-declared missing residues, which have no
        # coordinates at all -- both matter to a reader, for different reasons.
        "unobserved_residues": {c: list(v) for c, v in unobserved.items()},
        # The same residues in the depositor's numbering, where the file's own
        # record of them could be matched (see deposited_numbering_for_unobserved).
        "unobserved_residues_deposited": unobserved_deposited,
        "n_terminus_count": len(first_all),
        "c_terminus_count": len(last_all),
        "n_term_name": n_term_name,
        "c_term_name": c_term_name,
        "excluded_short_chains": [{"chain": c, "residues": count} for c, count in short_chains_excluded],
        "water_detected": water_detected,
        "water_removed": water_removed,
        "water_viewer_copy_name": water_viewer_copy_name,
    }


# ------------------------------------------------------------
# INTRA-STRUCTURE HOMOMER / OLIGOMER DETECTION
# ------------------------------------------------------------
# Detects near-identical protein chains WITHIN a single loaded structure
# (chain A vs chain B of the same object) -- distinct from OVERLAY's existing
# detect_homomer_reduction_candidates(), which compares chains ACROSS two
# different loaded structures to decide whether one can be reduced to match
# the other for alignment purposes. This module answers a different, simpler
# question: "does this one structure, by itself, contain multiple chains that
# are essentially the same protein?" -- relevant to every command (single-
# structure runs, BATCH, TERMINI), not just OVERLAY.
#
# Detection only. This module never deletes, reduces, or modifies anything by
# itself -- it returns structured candidate data; the interactive Y/n/SKIP
# prompt and any resulting temporary single-chain object are the caller's
# responsibility (see prompt_intra_structure_homomer_reduction below),
# matching the same separation of concerns already used by OVERLAY's reduction
# workflow.
INTRA_HOMOMER_IDENTITY_THRESH = 0.98
INTRA_HOMOMER_COVERAGE_THRESH = 0.95


def get_chain_sequences(obj, chain_list):
    """Return {chain_id: {resv: one_letter_code}} for every chain in
    chain_list. Keyed by residue number (resv) rather than returning a
    plain concatenated string, because plain-string comparison breaks down
    whenever two chains of the same protein have different resolved-residue
    ranges -- e.g. chain A is missing a disordered loop at residues 45-48
    that chain B has resolved. This is completely normal in real
    crystallographic structures (different chains/copies in the asymmetric
    unit routinely resolve slightly different loops), but it means a plain
    string diff sees "everything after the gap is shifted by 4 characters"
    and can badly mis-score two chains that are actually ~100% identical
    over their shared residues. Keying by resv lets compute_sequence_metrics
    compare only the residue numbers both chains actually have, the same
    way compute_local_terminal_rmsd already pairs coordinates by resv rather
    than by list position.
    """
    chain_seqs = {}
    # One pass over the object's CA atoms, bucketed by chain. Selecting each
    # chain separately re-scans the whole object once per chain, which on an
    # assembly with a thousand chains means minutes of work before anything
    # is compared.
    wanted = set(chain_list)
    all_residues = []
    cmd.iterate(obj + " and polymer.protein and name CA and q > 0",
                "all_residues.append((chain, int(resv), resi, resn, q))", space={'all_residues': all_residues})
    by_chain = {ch: [] for ch in chain_list}
    for ch, rv, resi, rn, q in all_residues:
        if ch in wanted:
            by_chain[ch].append((rv, resi, rn, q))
    for ch in chain_list:
        residues = by_chain.get(ch, [])
        # resi (the full identifier, insertion code included) is captured
        # alongside resv. resv alone is documented by PyMOL as excluding the
        # insertion code, so residues 52, 52A and 52B all share resv=52 and
        # collapse into a single dictionary entry -- silently dropping real
        # residues from the sequence. Ordering still uses (resv, code) so the
        # sequence stays in N-to-C order.
        seen = {}
        for rv, resi, rn, q in residues:
            if not is_observed_occupancy(q):
                continue
            code = str(resi)[len(str(rv)):] if str(resi).startswith(str(rv)) else ""
            # Alternate locations produce repeated entries for one residue;
            # the first is kept so the result is deterministic.
            if (rv, code) not in seen:
                seen[(rv, code)] = AA_3TO1.get(rn, "X")
        chain_seqs[ch] = {key: seen[key] for key in sorted(seen)}
    return chain_seqs


def compute_sequence_metrics(seq_a, seq_b):
    """Identity/coverage/length-similarity/composite score between two
    chains, given as {resv: one_letter_code} dicts (see get_chain_sequences).
    Identity is computed only over residue numbers present in BOTH chains --
    a missing loop in one chain simply shrinks the compared overlap, rather
    than desynchronizing every residue after the gap the way a raw string
    diff does. This is the shared primitive behind both OVERLAY's
    cross-structure reduction check and this module's intra-structure
    homomer detection, so both agree on what counts as 'the same chain'.

    Accepts either the new dict form or a legacy plain string (treated as
    positionally-keyed, i.e. {0: s[0], 1: s[1], ...]) for backward
    compatibility with any caller not yet updated -- but dict form should
    always be used for real biological sequences with potential gaps.
    """
    if seq_a is None or seq_b is None:
        len_a = len(seq_a) if seq_a is not None else 0
        len_b = len(seq_b) if seq_b is not None else 0
        return {"identity": 0.0, "coverage": 0.0, "length_diff": abs(len_a - len_b), "score": 0.0}

    if isinstance(seq_a, str):
        seq_a = {i: c for i, c in enumerate(seq_a)}
    if isinstance(seq_b, str):
        seq_b = {i: c for i, c in enumerate(seq_b)}

    shared_resv = set(seq_a) & set(seq_b)
    len_a, len_b = len(seq_a), len(seq_b)
    max_len = max(len_a, len_b) if max(len_a, len_b) > 0 else 1

    if not shared_resv:
        length_diff = abs(len_a - len_b)
        return {"identity": 0.0, "coverage": 0.0, "length_diff": length_diff, "score": 0.0}

    matches = sum(1 for rv in shared_resv if seq_a[rv] == seq_b[rv])
    identity = matches / len(shared_resv)
    # Coverage: how much of the LARGER chain's resolved residues are accounted
    # for by this overlap -- mirrors the original function's intent (coverage
    # relative to the longer/more-complete sequence) while still being
    # computed over the correctly-paired overlap rather than a positionally-
    # misaligned one.
    coverage = len(shared_resv) / max_len
    length_diff = abs(len_a - len_b)
    length_sim = 1.0 - (length_diff / max_len)
    if length_sim < 0:
        length_sim = 0.0
    score = (0.6 * identity) + (0.3 * coverage) + (0.1 * length_sim)
    return {"identity": identity, "coverage": coverage, "length_diff": length_diff, "score": score}


def compute_sequence_metrics_by_order(seq_a_by_resv, seq_b_by_resv):
    """Identity between two chains from DIFFERENT structures, compared by
    residue ORDER along the chain rather than by matching residue NUMBER.

    compute_sequence_metrics (above) matches residues by resv, which is
    correct for comparing two chains within the SAME structure or two
    copies built from the same numbering scheme -- but wrong across two
    independently-deposited PDB entries, which routinely use unrelated
    numbering (different constructs, His-tags, crystallization artifacts
    shifting where residue 1 starts, etc.). Two structures' chain A and
    chain B can be the same protein with completely different resv ranges;
    matching by resv would find zero overlap and wrongly report 0%
    identity. This function instead extracts each chain's sequence in
    N-to-C order (ignoring resv gaps) and searches over a bounded set of
    N-terminal frame shifts for the offset that gives the best ungapped
    positional match, rather than assuming both sequences already start
    at the same point.

    A fixed, zero-tolerance offset (comparing position i of one sequence
    directly against position i of the other, with no shift search) was
    tried first and rejected: it is extremely common for two
    independently-solved crystal structures of the very same protein to
    have a different number of resolved N-terminal residues (a
    disordered tail resolved in one crystal form but not another is
    routine, not an edge case). Even a 1-2 residue offset from that alone
    desynchronizes every position after it, collapsing a genuinely
    ~100%-identical pair down toward chance-level identity -- verified
    directly: a synthetic 162-residue real protein sequence (MpDHFR) with
    just its first 2 residues trimmed from one copy scored 5% identity
    under the old zero-shift comparison despite being the same protein
    over its full shared length. The MAX_FRAME_SHIFT window below is
    intentionally small and local (not a general alignment algorithm) --
    it only needs to absorb ordinary N-terminal disorder differences, not
    align proteins that are actually different lengths internally, which
    remains a genuine low-identity/low-coverage case as intended by
    match_chains_across_structures' and compute_overall_sequence_identity's
    downstream thresholds.
    """
    seq_a = [seq_a_by_resv[rv] for rv in sorted(seq_a_by_resv)]
    seq_b = [seq_b_by_resv[rv] for rv in sorted(seq_b_by_resv)]
    if not seq_a or not seq_b:
        return {"identity": 0.0, "coverage": 0.0, "length_diff": abs(len(seq_a) - len(seq_b))}

    MAX_FRAME_SHIFT = 15  # residues; generous for ordinary N-terminal disorder, small relative to typical domain sizes
    best = None
    # shift > 0 means seq_b's start is trimmed relative to seq_a (seq_b's
    # position 0 aligns to seq_a's position `shift`); shift < 0 is the
    # reverse. shift = 0 reproduces the original, no-offset comparison
    # exactly, so this is a strict superset of the prior behavior, never a
    # worse result for sequences that were already aligned at position 0.
    for shift in range(-MAX_FRAME_SHIFT, MAX_FRAME_SHIFT + 1):
        if shift >= 0:
            a_off, b_off = 0, shift
        else:
            a_off, b_off = -shift, 0
        compare_len = min(len(seq_a) - a_off, len(seq_b) - b_off)
        if compare_len <= 0:
            continue
        matches = sum(1 for i in range(compare_len) if seq_a[a_off + i] == seq_b[b_off + i])
        identity = matches / compare_len
        if best is None or identity > best[0]:
            best = (identity, compare_len)

    identity, compare_len = best
    coverage = compare_len / max(len(seq_a), len(seq_b))
    length_diff = abs(len(seq_a) - len(seq_b))
    return {"identity": identity, "coverage": coverage, "length_diff": length_diff}


def reference_tie_scores(objs, chain_lists):
    """{obj: (mean_similarity, resolved_residues)} for choosing a reference
    among structures tied on ligand count (see
    select_reference_by_ligand_count).

    The similarity of structure A to structure B is the mean, over A's
    chains, of each chain's best score against B's chains, using the chain
    reduction score (0.6 identity + 0.3 coverage + 0.1 length similarity).
    Residues are paired in order, so numbering offsets between entries do
    not lower the score. A structure's value is its mean over every other
    structure in the run; coverage is measured against the longer sequence,
    so a more complete structure scores higher.
    """
    seqs = {obj: get_chain_sequences(obj, list(chain_lists.get(obj) or [])) for obj in objs}

    def pair_score(a, b):
        m = compute_sequence_metrics_by_order(a, b)
        longest = max(len(a), len(b), 1)
        length_sim = max(0.0, 1.0 - m["length_diff"] / longest)
        return 0.6 * m["identity"] + 0.3 * m["coverage"] + 0.1 * length_sim

    scores = {}
    for obj in objs:
        own = [sq for sq in seqs[obj].values() if sq]
        residues = sum(len(sq) for sq in own)
        per_structure = []
        for other in objs:
            if other == obj:
                continue
            theirs = [sq for sq in seqs[other].values() if sq]
            if not own or not theirs:
                per_structure.append(0.0)
                continue
            per_structure.append(sum(max(pair_score(a, b) for b in theirs) for a in own) / len(own))
        scores[obj] = ((sum(per_structure) / len(per_structure)) if per_structure else 0.0, residues)
    return scores


def match_chains_across_structures(ref_obj, ref_chain_list, cmp_obj, cmp_chain_list,
                                   min_identity=0.9, min_coverage=0.7):
    """Pair up reference and comparison chains that are plausibly the same
    protein, EVEN WHEN their chain letters differ (e.g. reference chain A
    vs comparison chain B) -- e.g. after intra-structure homomer reduction
    picks different representative letters in each structure, or simply
    because two independently-deposited entries label chains differently.

    Falls back gracefully: exact letter matches (same chain ID in both)
    are trusted directly without a sequence check, since that was already
    correct behavior and needs no change. Only chains that DON'T share a
    letter with anything in the other structure go through sequence
    matching, using compute_sequence_metrics_by_order (position-based, not
    resv-based -- see that function's docstring for why).

    Returns a list of (ref_chain, cmp_chain, method) tuples, where method
    is "letter" or "sequence" -- callers should disclose which chains were
    matched by sequence rather than by matching IDs, since that's an
    inference, not a certainty read directly from the file.
    """
    ref_set = set(ref_chain_list)
    cmp_set = set(cmp_chain_list)
    matched = []

    letter_matches = ref_set & cmp_set
    for ch in sorted(letter_matches):
        matched.append((ch, ch, "letter"))

    remaining_ref = sorted(ref_set - letter_matches)
    remaining_cmp = sorted(cmp_set - letter_matches)
    if not remaining_ref or not remaining_cmp:
        return matched

    ref_seqs = get_chain_sequences(ref_obj, remaining_ref)
    cmp_seqs = get_chain_sequences(cmp_obj, remaining_cmp)

    # Greedy best-match pairing: for each remaining reference chain, find its
    # best-scoring remaining comparison chain; once a comparison chain is
    # claimed it's removed from the pool so it can't be double-matched.
    available_cmp = list(remaining_cmp)
    for r_ch in remaining_ref:
        best_cmp_ch = None
        best_metrics = None
        for c_ch in available_cmp:
            m = compute_sequence_metrics_by_order(ref_seqs[r_ch], cmp_seqs[c_ch])
            if best_metrics is None or m["identity"] > best_metrics["identity"]:
                best_metrics = m
                best_cmp_ch = c_ch
        if best_cmp_ch is not None and best_metrics["identity"] >= min_identity and best_metrics["coverage"] >= min_coverage:
            matched.append((r_ch, best_cmp_ch, "sequence"))
            available_cmp.remove(best_cmp_ch)

    # Nothing passed the thresholds: compare the most similar pair anyway.
    # The person was warned about the identity and chose to go ahead.
    if not matched:
        scored = [(compute_sequence_metrics_by_order(ref_seqs[r], cmp_seqs[c]), r, c)
                  for r in remaining_ref for c in remaining_cmp]
        scored = [x for x in scored if x[0]["identity"] > 0 or x[0]["coverage"] > 0]
        if scored:
            m, r_ch, c_ch = max(scored, key=lambda x: (x[0]["identity"], x[0]["coverage"]))
            matched.append((r_ch, c_ch, "sequence"))

    return matched


def classify_overall_sequence_identity(identity):
    """Classify whole-structure sequence identity between a reference and
    comparison protein into a severity band, following the standard
    intent of these thresholds: high identity needs no comment, moderate
    identity gets an informational note, and low identity gets
    progressively stronger warnings since it increasingly calls into
    question whether the structures being compared are actually the same
    protein (or a closely related homolog) at all -- which would make
    every downstream alignment/displacement/SASA/B-factor metric hard to
    interpret meaningfully.

    Returns (severity, message) where severity is one of "none", "info",
    "mild", "strong", "high" and message is None for "none" or the
    user-facing text for every other band. Callers decide how to surface
    message (print color, whether to prompt for confirmation, etc.).
    """
    pct = identity * 100.0
    if pct >= 90:
        return "none", None
    if pct >= 75:
        return "info", "Moderately divergent homologs."
    if pct >= 50:
        return "mild", ("Structures share moderate sequence identity. Confirm these are the "
                        "intended comparison proteins.")
    if pct >= 30:
        return "strong", ("Low sequence identity. Alignment and derived metrics may be difficult "
                          "to interpret unless the proteins are known homologs.")
    return "high", ("Very low sequence identity detected. These structures may not represent "
                    "the same protein or closely related homologs. Please verify your inputs "
                    "before interpreting the results.")


# Decisions already made in the current command, keyed by the pair being
# compared. TERMINI performs the identity check twice for the same pair --
# once in align_to() before aligning, and again in its own comparison loop --
# so without this the same warning is printed twice and the same question
# asked twice for one comparison.
_SEQ_IDENTITY_DECISIONS = {}


def reset_sequence_identity_decisions():
    """Clears the per-command cache. Called at the start of each run so a
    decision never carries over between commands."""
    _SEQ_IDENTITY_DECISIONS.clear()


def prompt_overall_sequence_identity(ref_pdb_id, cmp_pdb_id, identity, allow_proceed=True):
    """Print the appropriate severity-banded warning for whole-structure
    sequence identity between ref_pdb_id and cmp_pdb_id (see
    classify_overall_sequence_identity), and for the "mild"/"strong"/
    "high" bands, ask the user to confirm before proceeding -- always
    allowing them to continue anyway (Astra3 warns, it doesn't block;
    the person running the comparison may have a legitimate reason, e.g.
    deliberately comparing distant homologs).

    Returns True if the run should proceed (always True unless the user
    explicitly declines at the prompt), and the (severity, message) pair
    for the caller to record in warnings/reports.
    """
    severity, message = classify_overall_sequence_identity(identity)
    if severity == "none":
        return True, (severity, message)

    # One question per pair per command. A repeat call returns the answer
    # already given rather than asking again.
    cache_key = (ref_pdb_id, cmp_pdb_id)
    if cache_key in _SEQ_IDENTITY_DECISIONS:
        return _SEQ_IDENTITY_DECISIONS[cache_key]

    pct = identity * 100.0
    if severity == "info":
        print(f"{WHITE}{ref_pdb_id} vs {cmp_pdb_id}: {pct:.0f}% overall sequence identity. "
              f"{message}{RESET}", flush=True)
        _SEQ_IDENTITY_DECISIONS[cache_key] = (True, (severity, message))
        return True, (severity, message)

    color = YELLOW if severity == "mild" else RED
    print("-" * 50, flush=True)
    print(f"{BOLD}Sequence Identity Warning{RESET}", flush=True)
    print("-" * 50, flush=True)
    print(f"{color}{ref_pdb_id} vs {cmp_pdb_id}: {pct:.0f}% overall sequence identity.{RESET}", flush=True)
    print(f"{color}{message}{RESET}", flush=True)
    if not allow_proceed:
        _SEQ_IDENTITY_DECISIONS[cache_key] = (True, (severity, message))
        return True, (severity, message)
    print(f"{WHITE}Continue with {cmp_pdb_id} anyway?{RESET} {format_yn_prompt()}: ", end="", flush=True)
    try:
        choice = input().strip().lower()
    except KeyboardInterrupt:
        choice = "n"
    proceed = choice in ("y", "yes")
    if not proceed:
        print(f"{YELLOW}Comparison for {cmp_pdb_id} will be skipped at your request.{RESET}", flush=True)
    print("", flush=True)
    _SEQ_IDENTITY_DECISIONS[cache_key] = (proceed, (severity, message))
    return proceed, (severity, message)


def compute_aligned_sequence_identity(ref_obj, cmp_obj):
    """Sequence identity measured over a structural alignment.

    compute_overall_sequence_identity below compares residues by position
    with only a small N-terminal frame-shift search. That is adequate for
    two structures of the same protein, but it cannot absorb internal
    insertions or deletions -- so for genuine homologs that differ by a few
    indels it reports a figure close to chance, even when the two fold
    identically and superimpose to well under 1 A.

    This measures identity over the residue pairs the sequence alignment used
    for superposition matches (astra3_measure), which is gap-aware by
    construction. Nothing is moved.

    Returns None if an alignment cannot be produced, in which case the
    caller falls back to the positional estimate.
    """
    try:
        mobile = astra3_measure.protein_residues(astra3_measure.atom_table(cmp_obj))
        target = astra3_measure.protein_residues(astra3_measure.atom_table(ref_obj))
        pairs = astra3_measure.pair_chains(mobile, target)
        _P, _Q, n_res, n_same = astra3_measure.paired_atoms(mobile, target, pairs, ca_only=True)
    except Exception:
        return None
    if not n_res:
        return None
    return n_same / n_res

def compute_overall_sequence_identity(ref_obj, ref_chain_list, cmp_obj, cmp_chain_list):
    """Best-effort whole-structure sequence identity between a reference
    and comparison structure, used only for the severity-banded warning
    above -- NOT used for chain matching or alignment (that's
    match_chains_across_structures' job) and does not affect any other
    computed metric.

    Takes the single longest protein chain from each structure (a
    reasonable proxy for "the main subject" when a structure has multiple
    chains) and compares them position-by-position via
    compute_sequence_metrics_by_order. Returns None if either structure
    has no protein chains at all.
    """
    if not ref_chain_list or not cmp_chain_list:
        return None
    ref_seqs = get_chain_sequences(ref_obj, ref_chain_list)
    cmp_seqs = get_chain_sequences(cmp_obj, cmp_chain_list)
    if not ref_seqs or not cmp_seqs:
        return None
    ref_longest = max(ref_chain_list, key=lambda c: len(ref_seqs.get(c, {})))
    cmp_longest = max(cmp_chain_list, key=lambda c: len(cmp_seqs.get(c, {})))
    # Preferred source: identity measured over PyMOL's own structural
    # alignment, which is gap-aware and reflects the superposition the rest
    # of the analysis is built on.
    aligned = compute_aligned_sequence_identity(ref_obj, cmp_obj)
    if aligned is not None:
        return aligned

    # Fallback: gap-aware sequence alignment (affine gaps, BLOSUM62, free
    # terminal gaps). identity_over_shorter is used rather than identity over
    # aligned columns because an alignment covering only a small part of
    # either sequence must not be reportable as a good match.
    ref_seq = "".join(ref_seqs[ref_longest][rv] for rv in sorted(ref_seqs[ref_longest]))
    cmp_seq = "".join(cmp_seqs[cmp_longest][rv] for rv in sorted(cmp_seqs[cmp_longest]))
    try:
        metrics = astra3_align.compare(ref_seq, cmp_seq)
        return metrics["identity_over_shorter"]
    except Exception:
        # Last resort only: positional comparison cannot represent internal
        # indels and under-reports homologs, but it always returns a number.
        legacy = compute_sequence_metrics_by_order(ref_seqs[ref_longest], cmp_seqs[cmp_longest])
        return legacy["identity"]


# ------------------------------------------------------------
# ANALYSIS STATE VALIDATION
# ------------------------------------------------------------
# Every output of a TERMINI run -- the numbers in the report, the coloring in
# the .pse, the close-up renders and their arrows -- is produced from the same
# few pieces of session state at different moments. When one of those pieces
# is wrong, nothing fails: the report still renders, the session still saves,
# and the images still come out, just describing something other than what
# happened. The checks below turn that class of problem into visible output at
# the moments it can occur, so a run that produced inconsistent state says so
# instead of looking identical to a correct one.

def validate_terminus_selections(obj, process_result, label=""):
    """Check one structure's N-/C-terminus selections actually exist, hold
    atoms, and hold the residues they are supposed to.

    Returns a list of human-readable problem strings, empty when the state is
    sound. Never raises: a validation failure must not itself break a run.
    """
    problems = []
    prefix = f"{label or obj}"
    for terminus, key in (("N", "n_term_name"), ("C", "c_term_name")):
        name = (process_result or {}).get(key)
        if not name:
            problems.append(f"{prefix}: no {terminus}-terminus selection was created.")
            continue
        try:
            if name not in cmd.get_names("selections"):
                problems.append(f"{prefix}: {terminus}-terminus selection '{name}' no longer exists in the "
                                f"session. Anything rendered or colored from it will be empty.")
                continue
            atoms = cmd.count_atoms(name)
        except Exception as e:
            problems.append(f"{prefix}: could not inspect {terminus}-terminus selection '{name}' ({e}).")
            continue
        if atoms == 0:
            problems.append(f"{prefix}: {terminus}-terminus selection '{name}' is empty (0 atoms). This "
                            f"terminus will appear uncolored in the session and missing from close-up "
                            f"renders.")
    return problems


def validate_terminus_coloring(obj, process_result, label=""):
    """Check that the residues in each terminus selection actually carry the
    terminus color.

    A selection can exist and hold atoms while the color has since been
    overwritten by a later whole-chain recolor, which is invisible in every
    numeric output but is exactly what a person sees when they open the
    session and find one structure's terminus grey.
    """
    problems = []
    prefix = f"{label or obj}"
    if not TERMINUS_COLORS["enabled"]:
        return problems
    for terminus, key, expected in (("N", "n_term_name", TERMINUS_COLORS["n"]), ("C", "c_term_name", TERMINUS_COLORS["c"])):
        name = (process_result or {}).get(key)
        if not name:
            continue
        try:
            if name not in cmd.get_names("selections"):
                continue
            expected_idx = cmd.get_color_index(engine_color(expected))
            colors = []
            cmd.iterate(name, "colors.append(color)", space={"colors": colors})
        except Exception:
            continue
        if not colors:
            continue
        wrong = sum(1 for c in colors if c != expected_idx)
        if wrong:
            problems.append(f"{prefix}: {wrong} of {len(colors)} atoms in the {terminus}-terminus selection "
                            f"are not {expected}. The terminus was colored and then recolored by a later "
                            f"step, so the session will not match the report.")
    return problems


def validate_metrics_match_selection(obj, process_result, chain, terminus, metrics, label=""):
    """Check that the residues a terminus's metrics were computed over are the
    same residues the session has selected and colored.

    These are produced at different moments -- the selection when the
    structure was processed, the metrics when the comparison ran, and either
    can be revised afterwards by an offset correction. When they disagree, the
    report describes one window and the image shows another.
    """
    problems = []
    if not metrics:
        return problems
    name = (process_result or {}).get("n_term_name" if terminus == "N" else "c_term_name")
    key = "reference_window_resi" if label == "reference" else "comparison_window_resi"
    expected = set(metrics.get(key) or [])
    if not name or not expected:
        return problems
    try:
        if name not in cmd.get_names("selections"):
            return problems
        selected = set()
        cmd.iterate(f"({name}) and chain {chain}", "sel.add(resi)", space={"sel": selected})
    except Exception:
        return problems
    if not selected:
        return problems
    missing = expected - selected
    if missing:
        problems.append(f"{obj} chain {chain}: {len(missing)} residue(s) the {terminus}-terminus metrics were "
                        f"computed over are not in the colored selection ({', '.join(sorted(missing)[:6])}"
                        f"{'...' if len(missing) > 6 else ''}). The report and the session describe different "
                        f"windows.")
    return problems


def purge_scratch_objects(prefixes=("_closeup_", "_astra3_", "_tmp_", "_align")):
    """Delete Astra3's and PyMOL's internal scratch objects and selections.
    cmd.align leaves its working selections (_align1, _align2) behind, and
    those get written into the saved .pse, where they appear as unexplained
    selections in a session a person is meant to be able to open and read.

    Only names carrying a known scratch prefix are touched, so nothing a
    person created is at risk. Returns the removed names; never raises.
    """
    removed = []
    try:
        names = list(cmd.get_names("objects")) + list(cmd.get_names("selections"))
    except Exception:
        return removed
    for name in names:
        if not any(name.startswith(p) for p in prefixes):
            continue
        try:
            cmd.delete(name)
            removed.append(name)
        except Exception:
            continue
    return removed


def validate_no_scratch_objects(prefixes=("_closeup_", "_astra3_", "_tmp_", "_align")):
    """Check no internal scratch objects survive into a saved session.

    Isolation copies and alignment scratch objects are created and deleted
    during rendering. One left behind is saved into the .pse, where it appears
    as a duplicate fragment of the structure with no explanation.
    """
    problems = []
    try:
        names = list(cmd.get_names("objects")) + list(cmd.get_names("selections"))
    except Exception:
        return problems
    leftovers = [n for n in names if any(n.startswith(p) for p in prefixes)]
    if leftovers:
        problems.append(f"Internal scratch objects were still present when the session was saved: "
                        f"{', '.join(sorted(leftovers)[:8])}"
                        f"{'...' if len(leftovers) > 8 else ''}. They will appear in the .pse.")
    return problems


def report_state_problems(problems, warnings_list=None, checkpoint=""):
    """Print any validation problems and add them to the run's warnings.

    Printed as well as recorded because the console is where a person is
    watching while the run happens, and the warnings list is what survives
    into the report afterwards.
    """
    if not problems:
        return False
    where = f" ({checkpoint})" if checkpoint else ""
    print(f"{YELLOW}Session state check{where} found {len(problems)} problem(s):{RESET}", flush=True)
    for p in problems:
        print(f"{YELLOW}  - {p}{RESET}", flush=True)
        if warnings_list is not None:
            warnings_list.append(f"Session state{where}: {p}")
    return True


def _selection_centroid(selection):
    """Mean coordinate of the selection's atoms in one conformation (see
    astra3_measure.one_conformation), or None if it has none. Averaged over
    every listed position, a two-conformation ligand would count twice."""
    try:
        tab = astra3_measure.atom_table(selection, classify=False)
    except Exception:
        return None
    if not tab["n"]:
        return None
    return tuple(float(v) for v in tab["xyz"][astra3_measure.one_conformation(tab)].mean(axis=0))


def find_differential_ligands(ref_process_result, cmp_process_result):
    """Ligands present in one structure but not the other, by residue name.

    Returns (only_in_reference, only_in_comparison) as lists of ligand records
    taken from each structure's own ligand_info.

    Comparison is by residue name, which is what identifies the chemistry: two
    copies of citrate are two instances of one ligand, and both are reported
    individually because they sit in different places and their distances to a
    terminus are different measurements. A ligand present in BOTH structures is
    excluded -- the question this answers is what one structure has that the
    other does not, so a shared cofactor is not a difference and reporting it
    would bury the ones that are.
    """
    def by_resn(pr):
        out = {}
        for lig in ((pr or {}).get("ligand_info") or []):
            out.setdefault(lig["resn"], []).append(lig)
        return out

    ref_map = by_resn(ref_process_result)
    cmp_map = by_resn(cmp_process_result)
    only_ref = [lig for resn, ligs in sorted(ref_map.items()) if resn not in cmp_map for lig in ligs]
    only_cmp = [lig for resn, ligs in sorted(cmp_map.items()) if resn not in ref_map for lig in ligs]
    return only_ref, only_cmp


def compute_ligand_terminus_distances(ref_obj, cmp_obj, ref_process_result, cmp_process_result,
                                      per_chain_results):
    """Distance from each differential ligand's centroid to each terminal
    window centroid, measured after alignment.

    Both structures are already in the same coordinate frame at this point
    (compare_termini aligns the comparison onto the reference before
    measuring), and the terminal centroids in per_chain_results are the
    offset-corrected windows -- so a ligand in one structure can be measured
    against a terminus in the other and the number means something.

    Only ligands present in one structure and absent from the other are
    measured. Every distance is reported against both structures' termini,
    because "how far is this ligand from where the other structure's terminus
    sits" is the comparison worth making when the ligand only exists on one
    side.

    Returns a list of dicts, one per (ligand, chain, terminus) combination.
    Never raises.
    """
    only_ref, only_cmp = find_differential_ligands(ref_process_result, cmp_process_result)
    rows = []
    sources = [(only_ref, ref_obj, "reference"), (only_cmp, cmp_obj, "comparison")]
    for ligands, owner_obj, owner_role in sources:
        # Instances of the same ligand are numbered so two copies of citrate
        # can be told apart in the output (CIT_1, CIT_2).
        counts = {}
        for lig in ligands:
            counts[lig["resn"]] = counts.get(lig["resn"], 0) + 1
        seen = {}
        for lig in ligands:
            seen[lig["resn"]] = seen.get(lig["resn"], 0) + 1
            total = counts[lig["resn"]]
            label = lig["resn"] if total == 1 else f"{lig['resn']}_{seen[lig['resn']]}"
            selection = lig.get("sel_name")
            if not selection:
                selection = f"({owner_obj}) and chain {lig['chain']} and resi {resi_token(lig['resi'])}"
            centroid = _selection_centroid(selection)
            if centroid is None:
                continue
            for chain_key, per_terminus in (per_chain_results or {}).items():
                for terminus in ("N", "C"):
                    metrics = (per_terminus or {}).get(terminus)
                    if not metrics:
                        continue
                    for which, coord_key in (("reference", "reference_centroid"),
                                             ("comparison", "comparison_centroid")):
                        coord = metrics.get(coord_key)
                        if not coord:
                            continue
                        rows.append({
                            "ligand": label,
                            "ligand_resn": lig["resn"],
                            "ligand_chain": lig.get("chain"),
                            "ligand_resi": lig.get("resi"),
                            "present_in": owner_role,
                            "chain": str(chain_key),
                            "terminus": terminus,
                            "terminus_of": which,
                            "distance_angstrom": round(_vec_distance(centroid, coord), 2),
                        })
    return rows


def compute_whole_structure_sequence_metrics(ref_obj, ref_chain_list, cmp_obj, cmp_chain_list):
    """Full sequence comparison between two structures' longest protein
    chains: identity, similarity, per-sequence coverage and both resolved
    lengths.

    compute_overall_sequence_identity returns a single number because that
    is all its warning band needs. A report needs more: identity alone
    cannot separate a conservative substitution from an unrelated residue,
    and cannot separate a well-matched pair from a short high-scoring
    fragment. This runs the same gap-aware alignment used for the terminus
    windows over the whole chain, so the whole-structure figures and the
    terminal figures are produced the same way and can be read side by
    side.

    Returns None if either structure has no protein chains, or the
    alignment cannot be produced.
    """
    if not ref_chain_list or not cmp_chain_list:
        return None
    try:
        ref_seqs = get_chain_sequences(ref_obj, ref_chain_list)
        cmp_seqs = get_chain_sequences(cmp_obj, cmp_chain_list)
        if not ref_seqs or not cmp_seqs:
            return None
        ref_chain = max(ref_chain_list, key=lambda c: len(ref_seqs.get(c, {})))
        cmp_chain = max(cmp_chain_list, key=lambda c: len(cmp_seqs.get(c, {})))
        ref_seq = "".join(ref_seqs[ref_chain][rv] for rv in sorted(ref_seqs[ref_chain]))
        cmp_seq = "".join(cmp_seqs[cmp_chain][rv] for rv in sorted(cmp_seqs[cmp_chain]))
        if not ref_seq or not cmp_seq:
            return None
        m = astra3_align.compare(ref_seq, cmp_seq)
    except Exception:
        return None
    return {
        "reference_chain": ref_chain,
        "comparison_chain": cmp_chain,
        "reference_length": len(ref_seq),
        "comparison_length": len(cmp_seq),
        "identity": m.get("identity"),
        "identity_over_shorter": m.get("identity_over_shorter"),
        "similarity": m.get("similarity"),
        "coverage_reference": m.get("coverage_a"),
        "coverage_comparison": m.get("coverage_b"),
        "aligned_columns": m.get("aligned_columns"),
        "gap_openings": m.get("gap_openings"),
        "largest_indel": m.get("largest_indel"),
    }


def detect_intra_structure_homomer(obj, chain_list):
    """Compare every pair of protein chains WITHIN one structure and group
    chains that are near-identical (>=98% identity/coverage, matching
    INTRA_HOMOMER_*_THRESH) into clusters. Returns a list of cluster dicts:

      [{"chains": ["A", "B", "C"], "recommended_chain": "A",
        "identity": 0.99, "coverage": 0.99, "length_diff": 0, "score": 0.97}, ...]

    Only clusters with 2+ chains are returned (a lone, non-redundant chain
    produces no entry). recommended_chain is the chain with the longest
    resolved sequence in the cluster (a deterministic, reproducible tie-
    breaker -- not a biological judgment about which copy is "canonical").
    Returns [] if fewer than 2 protein chains are present, or none are
    similar enough to cluster.
    """
    if len(chain_list) < 2:
        return []

    seqs = get_chain_sequences(obj, chain_list)
    chains = list(chain_list)
    n = len(chains)

    # Chains with exactly the same residues (same numbers, same types) are
    # identical by definition, so each distinct sequence is compared once
    # rather than every chain against every chain. Large assemblies repeat
    # the same few proteins many times; this turns ~500,000 comparisons for a
    # thousand chains into a few thousand. Coverage can never exceed the
    # shorter/longer length ratio, so pairs that cannot reach the coverage
    # threshold are skipped without comparing.
    seq_key = {c: tuple(seqs.get(c, {}).items()) for c in chains}
    rep_of_key = {}
    for c in chains:
        rep_of_key.setdefault(seq_key[c], c)
    reps = list(rep_of_key.values())
    perfect = {"identity": 1.0, "coverage": 1.0, "length_diff": 0, "score": 1.0}
    rep_metrics_cache = {}
    for i in range(len(reps)):
        for j in range(i + 1, len(reps)):
            a, b = reps[i], reps[j]
            la, lb = len(seqs.get(a, {})), len(seqs.get(b, {}))
            if max(la, lb) == 0 or min(la, lb) / max(la, lb) < INTRA_HOMOMER_COVERAGE_THRESH:
                continue
            rep_metrics_cache[(a, b)] = compute_sequence_metrics(seqs[a], seqs[b])

    class _PairMetrics(dict):
        """pair_metrics.get((ci, cj)) for any two chains, answered from the
        per-sequence comparisons above."""
        def get(self, pair, default=None):
            ci, cj = pair
            if seq_key.get(ci) == seq_key.get(cj):
                return dict(perfect) if seqs.get(ci) else default
            a, b = rep_of_key[seq_key[ci]], rep_of_key[seq_key[cj]]
            return rep_metrics_cache.get((a, b)) or rep_metrics_cache.get((b, a)) or default
    pair_metrics = _PairMetrics()

    def _similar(ci, cj):
        m = pair_metrics.get((ci, cj))
        if m is None:
            return False
        # Identity and coverage (both computed over the resv-matched overlap,
        # see compute_sequence_metrics) are sufficient on their own to
        # determine "same chain, different resolved range" -- raw length_diff
        # is not checked here. Two genuinely identical chains can easily
        # differ in raw length by more than a handful of residues purely
        # because each has its own independent disordered loop unresolved
        # elsewhere in the chain; that's normal and doesn't make them
        # different proteins, so gating on it produced false negatives on real
        # multi-chain structures.
        return (m["identity"] >= INTRA_HOMOMER_IDENTITY_THRESH and
                m["coverage"] >= INTRA_HOMOMER_COVERAGE_THRESH)

    # Union-find style clustering via simple connected-components over the
    # "similar" relation, so a chain similar to two different chains that
    # aren't directly compared to each other still ends up in one group.
    parent = {ch: ch for ch in chains}

    def _find(ch):
        while parent[ch] != ch:
            parent[ch] = parent[parent[ch]]
            ch = parent[ch]
        return ch

    def _union(a, b):
        ra, rb = _find(a), _find(b)
        if ra != rb:
            parent[ra] = rb

    for c in chains:
        if seqs.get(c):
            _union(c, rep_of_key[seq_key[c]])
    for (a, b) in rep_metrics_cache:
        if _similar(a, b):
            _union(a, b)

    groups = {}
    for ch in chains:
        root = _find(ch)
        groups.setdefault(root, []).append(ch)

    clusters = []
    for group_chains in groups.values():
        if len(group_chains) < 2:
            continue
        group_chains = sorted(group_chains)
        # Deterministic recommendation: longest resolved sequence wins;
        # alphabetically-first chain ID breaks ties.
        recommended = max(group_chains, key=lambda c: (len(seqs.get(c, "")), ), default=group_chains[0])
        # Re-resolve tie-break deterministically (max() with a single-key
        # tuple already picks the first max on ties given sorted input).
        best_len = max(len(seqs.get(c, "")) for c in group_chains)
        recommended = next(c for c in group_chains if len(seqs.get(c, "")) == best_len)

        # Representative pairwise metrics for reporting: the pair involving
        # the recommended chain and its closest match, or a same-chain
        # placeholder if something degenerate happened (shouldn't occur given
        # len(group_chains) >= 2).
        rep_metrics = None
        for other in group_chains:
            if other == recommended:
                continue
            m = pair_metrics.get((recommended, other)) or pair_metrics.get((other, recommended))
            if m is not None and (rep_metrics is None or m["score"] > rep_metrics["score"]):
                rep_metrics = m
        if rep_metrics is None:
            rep_metrics = {"identity": 1.0, "coverage": 1.0, "length_diff": 0, "score": 1.0}

        clusters.append({
            "chains": group_chains,
            "recommended_chain": recommended,
            "identity": rep_metrics["identity"],
            "coverage": rep_metrics["coverage"],
            "length_diff": rep_metrics["length_diff"],
            "score": rep_metrics["score"],
        })

    clusters.sort(key=lambda c: c["chains"])
    return clusters


def apply_intra_structure_homomer_reduction(obj, clusters, decisions, selection_suffix="", capture_water_for_viewer=False,
                                            deposited_unobserved=None):
    """Apply user-approved intra-structure homomer reduction decisions by
    DELETING the excluded chains' atoms directly from the loaded object
    (not creating a separate temp object) -- so the object that eventually
    gets saved into the .pse is a literal, minimal representation of what
    was actually analyzed, with nothing extra left over for the user to
    notice and wonder whether the report is accurate.

    clusters is the list returned by detect_intra_structure_homomer for
    this object; decisions is the {cluster_recommended_chain:
    chosen_chain_or_False} dict returned by
    prompt_intra_structure_homomer_reduction for those same clusters --
    chosen_chain may differ from cluster_recommended_chain if the user
    typed a different chain letter at the prompt rather than accepting
    the recommendation, and is a list of chains when the biological
    assembly rule keeps several copies. For every cluster with a truthy
    value, every chain in that cluster except the chosen one(s) is removed
    from obj via cmd.remove, then process_structure is re-run so coloring,
    chain_list, and N-/C-terminus selections all reflect the now-reduced
    object rather than stale pre-reduction state.

    Caller-agnostic: takes obj/clusters/decisions/selection_suffix
    directly rather than an overlay_engine-shaped container, so a caller
    that doesn't have one (single-structure analysis has its own plain
    process_result local variable, not an OverlayExecution's
    structure_data dict) can use this too. Returns (applied,
    new_process_result): applied is a list of (removed_chain,
    kept_chain) tuples, kept_chain being the first chain kept from the
    removed chain's cluster (empty if nothing was approved/removed);
    new_process_result is the freshly-recomputed process_structure()
    result if anything was actually removed, or None otherwise -- the
    caller is responsible for storing both wherever its own state lives
    (an overlay_engine's structure_data dict, or a plain local variable).

    capture_water_for_viewer is forwarded to the re-run process_structure()
    call as-is -- see process_structure's own docstring; only
    single-structure analysis should ever pass True here, for the same
    reason it's the only caller of process_structure itself that does.
    """
    applied = []
    if not decisions:
        return applied, None

    for cluster in clusters:
        recommended = cluster["recommended_chain"]
        decision = decisions.get(recommended)
        if not decision:
            continue
        # decision is True/the recommended chain (accepted as-is), a different
        # chain letter the user explicitly chose instead, or the chains a
        # rule keeps.
        if isinstance(decision, (list, tuple)):
            kept = list(decision)
        else:
            kept = [decision if isinstance(decision, str) else recommended]
        for ch in cluster["chains"]:
            if ch in kept:
                continue
            try:
                cmd.remove(f"{obj} and chain {ch}")
                applied.append((ch, kept[0]))
                print(f"{WHITE}Removed chain {ch} from {obj}, reduced to {chains_text(kept)} only.{RESET}", flush=True)
            except Exception as e:
                print(f"{RED}Failed to remove chain {ch} from {obj}: {e}{RESET}", flush=True)

    new_process_result = None
    if applied:
        # Re-run process_structure so coloring, chain_list, and termini
        # selections all reflect the now-reduced object -- otherwise
        # chain_list would still list the removed chains and downstream code
        # (shared_chains, termini selection) would silently operate on stale
        # pre-reduction state.
        # deposited_unobserved keeps the re-run naming zero-occupancy
        # residues as the depositor did, like the first pass.
        new_process_result = process_structure(obj, selection_suffix=selection_suffix or ("_" + obj),
                                               capture_water_for_viewer=capture_water_for_viewer,
                                               deposited_unobserved=deposited_unobserved)
    return applied, new_process_result


def rank_homomer_chain_by_priority(cluster, ligand_info=None, missing_residues_map=None, priority_order=None):
    """Deterministically choose ONE chain from a homomer cluster's chains,
    for -alwaysreduce (see astra3.py's own flag parsing) -- used to skip
    the interactive prompt entirely while still making a principled,
    reproducible choice instead of always blindly taking
    cluster["recommended_chain"] (which is only a longest-sequence
    tie-break, not a judgment about which copy is more complete or more
    representative).

    priority_order is a list of criterion tokens, evaluated IN ORDER,
    each one narrowing the candidate set to only the chain(s) tied for
    best on that criterion before moving to the next -- exactly the
    cascading-tiebreak behavior specified for this feature (e.g. "rank
    by missing residues first, then least bound ligands, then first
    chain: between 3 structures, none with missing residues and 2 of
    them have 0 ligands -- between those 2, say chain B and C, it picks
    B" -- which is what happens here, since the FINAL fallback
    below is always alphabetically-first, deterministic, and never
    random). Valid tokens:
      "missing"      -- fewest missing (unresolved) residues
      "leastligands" -- fewest bound ligands
      "mostligands"  -- most bound ligands
      "chainA"       -- chain A, if present in this cluster
    Defaults to ["missing", "leastligands", "chainA"] if not given (a
    reasonable default ordering, not a claim that it's the only sensible
    one -- the whole point of priority_order is that this is
    configurable).

    ligand_info is the list of ligand dicts (each with a "chain" key --
    see process_structure's own ligand_info) for the WHOLE structure;
    missing_residues_map is {chain: [ranges]} (see parse_remark_465 /
    parse_missing_residues_cif in astra3_core.py) for the WHOLE
    structure. Both are optional -- if not given (or a chain simply has
    no entry in either), that chain is treated as having zero
    missing residues / zero ligands for the relevant criterion, which is
    the correct behavior for "chainA" (unaffected either way) but
    callers passing neither should generally just use ["chainA"] as
    their priority_order, since "missing"/"leastligands"/"mostligands"
    become no-ops (every chain ties at zero) without real data.

    Returns the chosen chain letter. Always returns something concrete
    (the alphabetically-first chain in the cluster) even if
    priority_order is empty or every criterion in it ties across all
    chains -- this function never fails to make a choice.
    """
    if priority_order is None:
        priority_order = list(DEFAULT_REDUCE_PRIORITY)
    ligand_info = ligand_info or []
    missing_residues_map = missing_residues_map or {}

    def missing_count(ch):
        # Residues, not gaps: one 40-residue disordered loop is worse than
        # two single-residue gaps.
        return count_missing_residues(missing_residues_map.get(ch, []))

    def ligand_count(ch):
        return sum(1 for lig in ligand_info if lig.get("chain") == ch)

    candidates = list(cluster["chains"])
    for criterion in priority_order:
        if len(candidates) <= 1:
            break
        if criterion == "missing":
            best = min(missing_count(c) for c in candidates)
            candidates = [c for c in candidates if missing_count(c) == best]
        elif criterion == "leastligands":
            best = min(ligand_count(c) for c in candidates)
            candidates = [c for c in candidates if ligand_count(c) == best]
        elif criterion == "mostligands":
            best = max(ligand_count(c) for c in candidates)
            candidates = [c for c in candidates if ligand_count(c) == best]
        elif criterion == "chainA":
            if "A" in candidates:
                candidates = ["A"]
        # An unrecognized token is silently skipped rather than raising -- a
        # priority_order built from a future/different set of GUI options
        # should degrade to "this criterion didn't narrow anything" rather
        # than crash a whole BATCH run over one bad token.

    # Final fallback: alphabetically first among whatever's left tied --
    # deterministic and reproducible (the SAME cluster on a re-run always
    # yields the SAME chain), never random.
    return sorted(candidates)[0]


def assembly_kept_chains(cluster, assemblies):
    """The chains of one homomer cluster that the depositor's preferred
    biological assembly contains, for the biological assembly rule:
    (chains, assembly, None), or (None, assembly, reason) when the assembly
    records cannot decide. They cannot when the coordinate file declares no
    assembly, when the preferred one lists no chains or none of the
    cluster's, or when it is built from symmetry copies, which are not in the
    coordinate file. assembly is the preferred assembly, or None."""
    from astra3_annotations import preferred_assembly, _assembly_label
    pref = preferred_assembly(assemblies)
    if not pref:
        return None, None, "the coordinate file declares no biological assembly"
    named = f"the depositor's preferred assembly {pref.get('id')} ({_assembly_label(pref)})"
    members = pref.get("chains") or []
    if not members:
        return None, pref, f"{named} lists no chains"
    copies = pref.get("operators") or 1
    if copies > 1:
        return None, pref, (f"{named} is built by applying {copies} symmetry operations, and the copies they "
                            f"add are not in the coordinate file")
    chains = sorted(cluster["chains"], key=natural_chain_key)
    inside = [c for c in chains if c in members]
    if not inside:
        return None, pref, f"{named} contains none of {chains_text(chains)}"
    return inside, pref, None


def prompt_intra_structure_homomer_reduction(pdb_id, clusters, batch_skip_state=None,
                                             auto_decision=None, priority_order=None,
                                             ligand_info=None, missing_residues_map=None, assemblies=None,
                                             assembly_fallback=None):
    """Interactively ask the user, for each detected homomer cluster,
    whether to create a temporary single-chain object (used for downstream
    analysis such as TERMINI) containing only the recommended chain. Never
    modifies or deletes the original structure -- matches the same
    non-destructive guarantee as OVERLAY's existing reduction prompt.

    batch_skip_state, if provided, must be a single-item mutable container
    (e.g. a list: [False]) shared across every structure in a BATCH run.
    Once the user answers SKIP, batch_skip_state[0] is set True and every
    subsequent call for the rest of that BATCH run returns immediately
    without prompting again -- this exists specifically so BATCH doesn't
    block on input() once per structure when the user has already said
    they don't want to review these for the current run.

    auto_decision, if given, is "reduce", "keep" or "assembly" (see
    -alwaysreduce/-keephomomers/-keepassembly in astra3.py's own flag
    parsing) -- skips the interactive prompt (and batch_skip_state):
    "reduce" picks a chain via rank_homomer_chain_by_priority (using
    priority_order, ligand_info, missing_residues_map -- all forwarded
    as-is), "keep" always declines reduction, and "assembly" keeps the
    chains of the depositor's preferred biological assembly (see
    assembly_kept_chains). Where the assembly records cannot decide,
    assembly_fallback ("ask", the default, "reduce" or "keep") decides
    that cluster instead, and only then is the prompt shown. Either way,
    the same summary block is still printed so the run's own output
    remains a complete, reproducible record of what was decided and why.

    In addition to the plain y/n on the recommended chain, the user can
    type a chain letter directly (any letter in that cluster) to use that
    chain instead -- the recommended chain is a deterministic tie-break
    (longest resolved sequence), not necessarily the one the user actually
    wants; not every chain in a homomer cluster is guaranteed identical in
    practice (e.g. one copy may have better-resolved density, a bound
    ligand the others lack, or be the one referenced elsewhere in the
    user's own work), so they should be able to choose directly rather
    than only ever accepting or fully rejecting Astra3's pick.

    Returns (decisions, rule). decisions is a dict
    {cluster_recommended_chain: chosen_chain_or_False} -- keyed by the
    cluster's ORIGINAL recommended_chain (so callers can still find the
    right cluster), value is either the chain the user chose to keep
    (which may differ from recommended_chain), the list of chains the
    biological assembly rule keeps, or False for "no reduction, keep all
    chains in this cluster". Clusters the user skips (via SKIP) are simply
    absent from the returned dict. rule records how each cluster was
    decided, for the reports (see summarize_chain_reduction):
    {"rule", "fallback" (assembly rule only), "priority" (when a reduce
    rule may apply), "clusters": [{"chains", "decided_by", "answer" (asked
    clusters: approved, declined, skipped or unanswered), "assembly"
    ({"id", "label"} of the preferred assembly, assembly rule only),
    "fallback_reason"}]}.
    """
    decisions = {}
    rule = {"rule": auto_decision or "ask"}
    if auto_decision == "assembly":
        rule["fallback"] = assembly_fallback or "ask"
    if "reduce" in (auto_decision, rule.get("fallback")):
        rule["priority"] = list(priority_order or DEFAULT_REDUCE_PRIORITY)
    rule["clusters"] = []

    for cluster in clusters:
        record = {"chains": sorted(cluster["chains"], key=natural_chain_key), "decided_by": auto_decision or "ask"}
        rule["clusters"].append(record)
        if auto_decision is None and batch_skip_state is not None and batch_skip_state[0]:
            record["answer"] = "skipped"
            continue
        chains_str = ", ".join(record["chains"])
        print("-" * 50, flush=True)
        print(f"{BOLD}Intra-Structure Homomer Detected{RESET}", flush=True)
        print("-" * 50, flush=True)
        print(f"Structure: {pdb_id}", flush=True)
        print(f"Chains {chains_str} appear to be the same protein (within this structure).", flush=True)
        print("", flush=True)
        print(f"Recommended chain: {cluster['recommended_chain']}", flush=True)
        print("", flush=True)
        print("Sequence identity: %.1f%%" % (cluster["identity"] * 100.0), flush=True)
        print("Sequence coverage: %.1f%%" % (cluster["coverage"] * 100.0), flush=True)
        print("Length difference: %d residues" % cluster["length_diff"], flush=True)
        print("Similarity score: %.1f" % (cluster["score"] * 100.0), flush=True)
        print("", flush=True)
        # Whether the other chains are partners in the biological unit or
        # crystal copies decides whether reducing changes exposure and
        # contact results, so it is stated before the question.
        if assemblies:
            from astra3_annotations import assembly_context, assembly_for_chain, _assembly_label
            rec = cluster["recommended_chain"]
            others = [c for c in cluster["chains"] if c != rec]
            notes, warns = assembly_context(assemblies, [rec], others)
            pref = assembly_for_chain(assemblies, rec) or {}
            if any("removed, but" in w for w in warns):
                # The same protein can be in the chain's own biological unit
                # (more than one copy per unit, as in an antibody's two heavy
                # chains) and also in other units in the crystal; both are
                # said, as the assembly records give them.
                partners = [c for c in others if c in (pref.get("chains") or [])]
                separate = [c for c in others if c not in partners]
                many = len(partners) > 1
                print(f"{YELLOW}Note: the depositor's biological assembly {pref['id']} ({_assembly_label(pref)}) "
                      f"contains chain{'s' if many else ''} {', '.join(partners)} together with chain {rec}: "
                      f"the same protein, present more than once in one biological unit. Keeping only chain {rec} "
                      f"means solvent exposure, contacts and terminal measurements describe an isolated chain.{RESET}",
                      flush=True)
                if separate:
                    one = len(separate) == 1
                    homes = [assembly_for_chain(assemblies, c) for c in separate]
                    if all(a is not None for a in homes):
                        ids = sorted({str(a["id"]) for a in homes})
                        named = (f"biological assembly {ids[0]}" if len(ids) == 1
                                 else f"biological assemblies {', '.join(ids)}")
                        where = (f"{'belongs' if one else 'belong'} to {named}: "
                                 f"{'a separate copy' if one else 'separate copies'} of the unit")
                    else:
                        where = "is not in that biological assembly" if one else "are not in that biological assembly"
                    print(f"{YELLOW}Chain{'' if one else 's'} {', '.join(separate)} {where}.{RESET}", flush=True)
                print("", flush=True)
            elif notes:
                print(f"{GREEN}Note: {notes[0]}{RESET}", flush=True)
                print("", flush=True)
        print("The original structure will remain unchanged.", flush=True)

        decided_by = auto_decision or "ask"
        if decided_by == "assembly":
            from astra3_annotations import _assembly_label
            inside, pref, reason = assembly_kept_chains(cluster, assemblies)
            if pref:
                record["assembly"] = {"id": pref.get("id"), "label": _assembly_label(pref)}
            if inside:
                every = len(inside) == len(record["chains"])
                decisions[cluster["recommended_chain"]] = False if every else inside
                print(f"{WHITE}Biological assembly rule (-keepassembly): the depositor's preferred assembly "
                      f"{pref.get('id')} ({_assembly_label(pref)}) contains {chains_text(inside)}.{RESET}", flush=True)
                print(f"{WHITE}{'Keeping all chains' if every else 'Using ' + chains_text(inside)}.{RESET}", flush=True)
                continue
            decided_by = rule["fallback"]
            record.update(decided_by=decided_by, fallback_reason=reason)
            print(f"{YELLOW}The biological assembly rule (-keepassembly) cannot decide for chains {chains_str}: "
                  f"{reason}. Using its fallback: {HOMOMER_RULES[decided_by]}.{RESET}", flush=True)
        via = "-keepassembly's fallback" if auto_decision == "assembly" else None
        if decided_by == "reduce":
            chosen_chain = rank_homomer_chain_by_priority(
                cluster, ligand_info=ligand_info, missing_residues_map=missing_residues_map,
                priority_order=priority_order,
            )
            decisions[cluster["recommended_chain"]] = chosen_chain
            print(f"{WHITE}Use only chain {chosen_chain} for this analysis? {GREEN}y{WHITE} "
                  f"(auto-decided via {via or '-alwaysreduce'}, priority: {', '.join(rule['priority'])}){RESET}", flush=True)
            print(f"{WHITE}Using chain {chosen_chain}{' (the recommended chain)' if chosen_chain == cluster['recommended_chain'] else ' instead of the recommended chain ' + cluster['recommended_chain']}.{RESET}", flush=True)
            continue
        if decided_by == "keep":
            decisions[cluster["recommended_chain"]] = False
            print(f"{WHITE}Use only chain {cluster['recommended_chain']} for this analysis? {RED}n{WHITE} "
                  f"(auto-decided via {via or '-keephomomers'}){RESET}", flush=True)
            print(f"{YELLOW}Reduction declined for chains {chains_str}. Continuing with all chains.{RESET}", flush=True)
            continue
        if batch_skip_state is not None and batch_skip_state[0]:
            # Asked as the assembly rule's fallback after a skip this batch.
            record["answer"] = "skipped"
            continue

        skip_suffix = f"{WHITE}/{RESET}skip" if batch_skip_state is not None else ""
        skip_note = " (skip to skip all remaining reviews this run)" if batch_skip_state is not None else ""
        print(f"{WHITE}Or type a chain letter ({chains_str}) to use that chain instead of the "
              f"recommendation.{RESET}", flush=True)
        max_attempts = 10  # same safety cap and reasoning as the offset-correction prompt in this file
        resolved = False
        for attempt in range(max_attempts):
            print(f"Use only chain {cluster['recommended_chain']} for this analysis?{skip_note} "
                  f"{format_yn_prompt()}{skip_suffix}: ", end="", flush=True)
            try:
                choice = input().strip()
            except KeyboardInterrupt:
                print(f"\n{YELLOW}Homomer reduction prompt cancelled by user.{RESET}", flush=True)
                choice = "n"
            choice_lower = choice.lower()

            if batch_skip_state is not None and choice_lower == "skip":
                batch_skip_state[0] = True
                print(f"{YELLOW}Skipping homomer review for the remainder of this batch.{RESET}", flush=True)
                record["answer"] = "skipped"
                resolved = True
                break

            chain_letters_available = {c.upper(): c for c in cluster["chains"]}
            if choice.upper() in chain_letters_available and choice_lower not in ("y", "yes", "n", "no"):
                chosen_chain = chain_letters_available[choice.upper()]
                decisions[cluster["recommended_chain"]] = chosen_chain
                if chosen_chain == cluster["recommended_chain"]:
                    print(f"{WHITE}Using chain {chosen_chain} (the recommended chain).{RESET}", flush=True)
                else:
                    print(f"{WHITE}Using chain {chosen_chain} instead of the recommended chain "
                          f"{cluster['recommended_chain']}.{RESET}", flush=True)
                record["answer"] = "approved"
                resolved = True
                break
            elif choice_lower in ("y", "yes"):
                decisions[cluster["recommended_chain"]] = cluster["recommended_chain"]
                record["answer"] = "approved"
                resolved = True
                break
            elif choice_lower in ("n", "no"):
                decisions[cluster["recommended_chain"]] = False
                print(f"{YELLOW}Reduction declined for chains {chains_str}. Continuing with all chains.{RESET}", flush=True)
                record["answer"] = "declined"
                resolved = True
                break
            else:
                # Not silently treated as "no". Re-prompts instead, up to
                # max_attempts.
                valid_note = f'y, n, a chain letter ({chains_str})' + (", or skip" if batch_skip_state is not None else "")
                print(f"{YELLOW}\"{choice}\" wasn't understood. Please answer {valid_note}.{RESET}", flush=True)

        if not resolved:
            print(f"{YELLOW}No valid answer received after {max_attempts} attempts for chains {chains_str}, "
                  f"continuing with all chains.{RESET}", flush=True)
            decisions[cluster["recommended_chain"]] = False
            record["answer"] = "unanswered"

    return decisions, rule


def create_intra_structure_reduced_object(obj, recommended_chain, selection_suffix=""):
    """Create a temporary single-chain object (obj_REDUCED_<chain>) for use
    as the analysis/alignment target after a user accepts an intra-structure
    homomer reduction. Mirrors OVERLAY's existing temp-object pattern
    (obj_REDUCED_<chain>, built via cmd.create then re-processed for
    coloring/termini) so downstream code (e.g. TERMINI's alignment_obj
    lookup) can treat it identically regardless of which detector produced
    it. Returns the new object name, or None on failure.
    """
    temp_name = f"{obj}_REDUCED_{recommended_chain}"
    if temp_name in cmd.get_names("objects"):
        try:
            cmd.delete(temp_name)
        except Exception:
            pass
    try:
        cmd.create(temp_name, f"{obj} and chain {recommended_chain}")
        inherit_in_chain_decision(obj, temp_name)
        process_structure(temp_name, selection_suffix=selection_suffix or ("_" + temp_name))
        print(f"{GREEN}Temporary single-chain object created: {temp_name}{RESET}", flush=True)
        return temp_name
    except Exception as e:
        print(f"{RED}Failed to create temporary reduced object: {str(e)}{RESET}", flush=True)
        return None


# ------------------------------------------------------------
# REPORT SECTIONS Each function below inspects a loaded structure and returns
# the lines for one section of Protein_Information.txt. Sections that can't be
# determined from PyMOL/the PDB header say so explicitly rather than
# estimating a value.
# ------------------------------------------------------------
def report_biological_assembly(obj, chain_list, chain_reduction=None, assemblies=None, homomer_rule=None):
    chain_seqs = {}
    chain_lengths = {}
    for ch in chain_list:
        residues = []
        cmd.iterate(obj + " and polymer.protein and chain " + ch + " and name CA and q > 0",
                    "residues.append((int(resv), resi, resn))", space={'residues': residues})
        # One entry per residue: a Cα with alternate conformations is one
        # residue, and 52/52A/52B are three.
        unique = {}
        for rv, resi, rn in residues:
            unique.setdefault(resi_sort_key(rv, resi), rn)
        residues = [(key[0], unique[key]) for key in sorted(unique)]
        seq = "".join(AA_3TO1.get(rn, "X") for rv, rn in residues)
        chain_seqs[ch] = seq
        chain_lengths[ch] = len(residues)

    unique_seqs = set(chain_seqs.values())
    nucleic = nucleic_acid_chains(obj)
    if len(chain_list) == 0:
        assembly_guess = "No protein chains detected."
    elif len(chain_list) == 1 and nucleic:
        # 1AAY: one protein chain bound to two DNA strands is not a monomer.
        assembly_guess = "One protein chain (in complex with nucleic acid; see below)."
    elif len(chain_list) == 1:
        assembly_guess = "Monomer (single protein chain in the coordinates)."
    elif len(unique_seqs) == 1:
        assembly_guess = "Homo-%d-mer: all %d chains share an identical resolved sequence." % (len(chain_list), len(chain_list))
    else:
        assembly_guess = "Hetero-oligomer with %d chains (%d distinct resolved sequences)." % (len(chain_list), len(unique_seqs))

    # chain_reduction: [(removed_chain, kept_chain), ...] from a homomer
    # reduction, decided as homomer_rule records (see
    # prompt_intra_structure_homomer_reduction). chain_list is then the
    # analyzed chains only, so the deposited entry is described from both.
    outcome = homomer_rule_outcome(homomer_rule, chain_reduction) if homomer_rule else None
    if chain_reduction:
        removed = sorted({r for r, _k in chain_reduction})
        reduced = [c for c in outcome["clusters"] if c["removed"]] if outcome else []
        kept = sorted({k for c in reduced for k in c["kept"]} if reduced else {k for _r, k in chain_reduction})
        how = "; ".join(dict.fromkeys(homomer_rule_reason(outcome, c) for c in reduced)) or "approved by user"
        deposited = sorted(set(chain_list) | set(removed))
        removed_text = (("chain " + removed[0] + " was removed as a near-identical copy") if len(removed) == 1
                        else ("chains " + ", ".join(removed[:-1]) + " and " + removed[-1]
                              + " were removed as near-identical copies"))
        kept_text = ("chain " + kept[0]) if len(kept) == 1 else ("chains " + ", ".join(kept))
        assembly_guess = ("%d protein chains deposited (%s); %s "
                          "(homomer reduction, %s), so this analysis covers %s only."
                          % (len(deposited), ", ".join(deposited), removed_text, how, kept_text))

    assembly_lines = []
    if assemblies:
        from astra3_annotations import preferred_assembly, assembly_context
        pref = preferred_assembly(assemblies)
        assembly_lines.append("Depositor's biological assemblies (from the coordinate file):")
        for a in assemblies:
            copies = f", {a.get('operators')} symmetry copies" if (a.get("operators") or 1) > 1 else ""
            assembly_lines.append(f"  Assembly {a.get('id')}{' (preferred)' if a is pref else ''}: "
                                  f"{a.get('oligomeric_details') or 'oligomeric state not stated'}"
                                  f"{', ' + a['defined_by'] + '-defined' if a.get('defined_by') else ''}, "
                                  f"chains {', '.join(a.get('chains') or []) or 'not listed'}{copies}")
        removed = [r for r, _k in (chain_reduction or [])]
        notes, warns = assembly_context(assemblies, chain_list, removed)
        for line in notes + warns:
            assembly_lines.append("  " + line[0].upper() + line[1:])

    lines = []
    lines.append("BIOLOGICAL ASSEMBLY")
    lines.append("-" * 60)
    lines.append("Number of protein chains: " + str(len(chain_list)))
    lines.append("Chain IDs: " + ", ".join(chain_list) if chain_list else "None")
    for ch in chain_list:
        lines.append("  " + obj + " Chain " + ch + ": " + str(chain_lengths.get(ch, 0)) + " resolved residues")
    lines.append("Assembly (based on this entry): " + assembly_guess)
    if nucleic:
        lines.append("Nucleic-acid chains in the coordinates: " + ", ".join(
            f"{c} ({kind}, {n} nucleotides)" for c, (kind, n) in sorted(nucleic.items())))
    lines.extend(assembly_lines)
    if outcome and outcome["clusters"]:
        lines.append(f"Redundant chains (homomers), rule: {HOMOMER_RULES[outcome['rule']]}"
                     + (f", falling back to {HOMOMER_RULES[outcome['fallback']]}" if outcome.get("fallback") else ""))
        lines.extend("  " + note for note in summarize_chain_reduction(chain_reduction, obj.upper(), "this", homomer_rule))
    lines.append("Note: this reflects the chains present in the coordinate")
    lines.append("file, not necessarily the full biological assembly, which may involve")
    lines.append("crystal symmetry mates (see REMARK 350 in the original PDB file for")
    lines.append("the depositor's authoritative biological assembly definition).")
    lines.append("")
    return lines


def report_sequence_info(obj, chain_list):
    lines = []
    lines.append("SEQUENCE INFORMATION")
    lines.append("-" * 60)
    for ch in chain_list:
        stored = []
        # Zero-occupancy residues were not observed; counting them as resolved
        # would disagree with the HTML report and the terminus selection.
        cmd.iterate(obj + " and polymer.protein and chain " + ch + " and name CA and q > 0",
                    "stored.append(int(resv))", space={'stored': stored})
        resnums = sorted(set(stored))
        lines.append(obj + " Chain " + ch + ": " + str(len(resnums)) + " resolved residues")
        if len(resnums) > 0:
            lines.append("  Resolved range: " + str(resnums[0]) + " - " + str(resnums[-1]))
            gaps = []
            for idx in range(len(resnums) - 1):
                current = resnums[idx]
                nxt = resnums[idx + 1]
                if nxt - current > 1:
                    gaps.append(str(current + 1) + "-" + str(nxt - 1))
            if gaps:
                lines.append("  Gaps in residue numbering: " + ", ".join(gaps))
                lines.append("  (A gap can be unobserved residues or residues that were never part of the deposited")
                lines.append("  construct; the depositor's own list of unobserved residues is under WARNINGS /")
                lines.append("  STRUCTURAL NOTES, and the construct's reference segments under MUTATIONS.)")
            else:
                lines.append("  No internal gaps detected within resolved coordinate residues.")
                lines.append("  Residues absent from the coordinate file cannot be distinguished as unresolved experimental residues or residues absent from the deposited construct without comparison to the reference sequence.")
    lines.append("")

    # Heavy-atom heuristic
    stored_atoms = []
    # Observed atoms only: a zero-occupancy atom was not seen in the
    # experiment, and unobserved residues are already reported on their own.
    cmd.iterate(obj + " and polymer.protein and not hydro and not name H* and q > 0",
                "stored_atoms.append((chain, resi, resn, name))",
                space={'stored_atoms': stored_atoms})

    residue_atoms = {}
    for c, ri, rn, atom_name in stored_atoms:
        residue_atoms.setdefault((c, ri, rn), set()).add(atom_name)

    flagged = []
    for (c, ri, rn), atoms in residue_atoms.items():
        expected = STANDARD_HEAVY_ATOMS.get(rn)
        if expected is not None and len(atoms) < expected:
            flagged.append((c, ri, rn, len(atoms), expected))

    flagged.sort(key=lambda x: (x[0], int(x[1]) if str(x[1]).lstrip("-").isdigit() else 0))

    lines.append("Potentially unresolved atoms or incomplete side-chain coordinates (heuristic:")
    lines.append("fewer heavy atoms than expected for that residue type; verify visually):")
    if flagged:
        for c, ri, rn, atom_count, expected in flagged:
            lines.append("  " + obj + " Chain %s, %s%s: %d of %d expected heavy atoms present"
                         % (c, rn, ri, atom_count, expected))
    else:
        lines.append("  None detected by this heuristic.")
    lines.append("")
    return lines


def report_secondary_structure(obj, chain_list):
    lines = []
    lines.append("SECONDARY STRUCTURE")
    lines.append("-" * 60)
    lines.append(f"(Assigned by {engine_name()} on loading: the file's helix and sheet records, or its own detection)")
    for ch in chain_list:
        stored = []
        cmd.iterate(obj + " and polymer.protein and chain " + ch + " and name CA and q > 0",
                    "stored.append((int(resv), resi, ss))", space={'stored': stored})
        # Observed residues only, one entry per residue (alternate
        # conformations of a Cα share its secondary structure).
        per_residue = {}
        for rv, resi, ss in stored:
            per_residue.setdefault(resi_sort_key(rv, resi), ss)
        stored = [(key[0], per_residue[key]) for key in sorted(per_residue)]

        ranges = {"H": [], "S": []}
        current_type = None
        range_start = None
        prev_resv = None
        for resv, ss in stored:
            simple = ss if ss in ("H", "S") else "L"
            if simple != current_type or (prev_resv is not None and resv - prev_resv > 1):
                if current_type in ("H", "S") and range_start is not None:
                    ranges[current_type].append((range_start, prev_resv))
                current_type = simple
                range_start = resv
            prev_resv = resv
        if current_type in ("H", "S") and range_start is not None:
            ranges[current_type].append((range_start, prev_resv))

        lines.append(obj + " Chain " + ch + ":")
        lines.append("  Alpha helices: " + str(len(ranges["H"])))
        for start, end in ranges["H"]:
            lines.append("    " + str(start) + "-" + str(end))
        lines.append("  Beta strands: " + str(len(ranges["S"])))
        for start, end in ranges["S"]:
            lines.append("    " + str(start) + "-" + str(end))
    lines.append("")
    return lines


def report_ligands(ligand_info):
    lines = []
    lines.append("LIGANDS")
    lines.append("-" * 60)
    if not ligand_info:
        lines.append("None detected.")
        lines.append("")
        return lines
    for lig in ligand_info:
        lines.append("Original PDB name: " + lig["resn"])
        lines.append("  Session identifier: " + lig["sel_name"])
        lines.append("  Chain: " + lig["chain"] + "   Residue number: " + lig["resi"])
        if lig.get("identity_confirmed") is False:
            lines.append("  Warning: insertion code or ambiguous residue numbering detected; ligand identity and automatic naming cannot be fully confirmed.")
        lines.append("  Assigned color: " + lig["color"])
    lines.append("")
    return lines


# Shortest distance between non-bonded N/O atoms that is physically possible
# (hydrogen-bonded N/O pairs are about 2.5-3.2 A apart).
POLAR_CONTACT_MIN_DISTANCE = 2.2


def _alt_codes(selection):
    """Alternate-conformation codes (A, B, ...) present in a selection."""
    codes = set()
    try:
        cmd.iterate(selection, "codes.add(alt)", space={"codes": codes})
    except Exception:
        return []
    return sorted(c for c in codes if c and c.strip())


def conformation_pairs(selection_a, selection_b, reach=6.0):
    """(a, b) selection pairs that each describe ONE physically consistent
    state, for any distance-based analysis.

    Atoms in different alternate conformations never coexist, so measuring
    between them invents contacts (1AKE: "polar contacts" of 0.52 A between
    AP5 and Arg167). Atoms without a code are present in every state.
    Zero-occupancy atoms were not observed (and may be placeholders a loader
    added for unobserved residues), so they are never measured. With no
    alternate conformations nearby this is a single, unfiltered pair."""
    observed_a = f"({selection_a}) and q > 0"
    observed_b = f"({selection_b}) and q > 0"
    codes = sorted(set(_alt_codes(observed_a)) | set(_alt_codes(f"({observed_b}) within {reach} of ({observed_a})")))
    if not codes:
        return [(observed_a, observed_b)]
    return [(f"({observed_a}) and (alt '' or alt {c})", f"({observed_b}) and (alt '' or alt {c})") for c in codes]


def analyze_ligand_environment(obj, ligand_info):
    """Compute structural (not biological) ligand-environment data for every
    ligand in ligand_info, using only PyMOL's own geometric calculations:

      - nearby_residues: protein residues with an atom within 4.0 Å of the
        ligand (cmd.iterate over a distance-based selection)
      - polar_contacts: ligand N/O atoms within 3.5 Å of protein N/O atoms
        (cmd.find_pairs), each resolved to the specific residue/chain/atom
        on both sides

    This returns geometric observations only. A close N/O contact is a
    *possible* hydrogen bond by distance -- it does not confirm donor/
    acceptor geometry, bond angle, or that a hydrogen bond actually forms.
    Detailed interaction typing (salt bridges, pi-stacking, confirmed H-bond
    geometry) is out of scope and would require a dedicated tool (e.g. PLIP,
    Arpeggio); Astra3 does not attempt to replicate that analysis.

    Returns a dict, keyed by the ligand's sel_name, of:
      {
        "nearby_residues": [{"chain":.., "resi":.., "resn":..}, ...],
        "polar_contacts": [{"ligand_atom":.., "protein_chain":.., "protein_resi":..,
                             "protein_resn":.., "protein_atom":.., "distance_angstrom":..}, ...],
        "polar_contact_count": int or None (None if find_pairs failed),
      }
    On any per-ligand PyMOL error, that ligand's entry is filled with None/[]
    values rather than omitted, so callers can distinguish "computed, found
    nothing" from "could not be computed" for this ligand.
    """
    results = {}
    # Only this structure's own protein: with several structures loaded (as
    # in OVERLAY and TERMINI), another one deposited in the same frame would
    # otherwise lend its residues to this ligand's contacts.
    own_protein = f"({protein_selection(obj)})"
    counted = sorted(_IN_CHAIN_AS_PROTEIN.get(obj, ()))
    for lig in ligand_info:
        sel_name = lig["sel_name"]
        entry = {"nearby_residues": [], "polar_contacts": [], "polar_contact_count": None}

        try:
            # PyMOL parses "byres X and polymer.protein and name CA" as
            # byres(X and polymer.protein and name CA), which finds only
            # residues whose alpha carbon lies within the cutoff and misses
            # every side-chain contact. The inner parentheses make byres
            # expand the residue of any contacting atom, which is what a
            # contact residue is.
            near_residues = []
            near_sel = "_astra3_near_contacts"
            for lig_state, prot_state in conformation_pairs(sel_name, own_protein):
                cmd.select(near_sel, "byres ((" + lig_state + ") around 4.0 and (" + prot_state + "))")
                cmd.iterate(near_sel + " and name CA", "near_residues.append((chain, resi, resn))",
                            space={'near_residues': near_residues})
                # Residues built into the chain and counted as protein have no CA.
                for ch, ri in counted:
                    cmd.iterate(f'{near_sel} and chain "{ch}" and resi "{resi_token(ri)}"',
                                "near_residues.append((chain, resi, resn))", space={'near_residues': near_residues})
                cmd.delete(near_sel)
            entry["nearby_residues"] = [
                # By chain, then residue number in numeric order: sorting the
                # numbers as text put 107 and 108 ahead of 56.
                {"chain": c, "resi": ri, "resn": rn}
                for c, ri, rn in sorted(set(near_residues),
                                        key=lambda r: (r[0], int(re.sub(r"[^0-9-]", "", r[1]) or 0), r[1], r[2]))
            ]
        except Exception:
            entry["nearby_residues"] = None

        try:
            pairs = []
            for lig_state, prot_state in conformation_pairs(sel_name, own_protein):
                for pair in cmd.find_pairs("(" + lig_state + ") and (elem N+O)",
                                           "(" + prot_state + ") and (elem N+O)", cutoff=3.5):
                    if pair not in pairs:
                        pairs.append(pair)
            resolved_pairs = []
            overlapping = []
            for (model_a, idx_a), (model_b, idx_b) in pairs:
                lig_atom_info = []
                cmd.iterate(f"{model_a} and index {idx_a}", "lig_atom_info.append((chain, resi, resn, name, alt))",
                            space={'lig_atom_info': lig_atom_info})
                prot_atom_info = []
                cmd.iterate(f"{model_b} and index {idx_b}", "prot_atom_info.append((chain, resi, resn, name, alt))",
                            space={'prot_atom_info': prot_atom_info})
                if lig_atom_info and prot_atom_info:
                    lc, lri, lrn, latom, lalt = lig_atom_info[0]
                    pc, pri, prn, patom, palt = prot_atom_info[0]
                    # Atoms in different alternate conformations never exist
                    # together, so their distance is not a contact: in 1AKE
                    # it produced "contacts" of 0.52 and 1.46 A. Pairs within
                    # one conformation, or with an atom that has none, count.
                    if lalt and palt and lalt != palt:
                        continue
                    if lalt:
                        latom = f"{latom} (alt {lalt})"
                    if palt:
                        patom = f"{patom} (alt {palt})"
                    try:
                        dist = cmd.get_distance(f"{model_a} and index {idx_a}", f"{model_b} and index {idx_b}")
                    except Exception:
                        dist = None
                    record = {
                        "ligand_atom": latom,
                        "protein_chain": pc,
                        "protein_resi": pri,
                        "protein_resn": prn,
                        "protein_atom": patom,
                        "distance_angstrom": round(dist, 2) if isinstance(dist, (int, float)) else None,
                    }
                    # No two non-bonded N/O atoms sit closer than about 2.2 A.
                    # Closer pairs are overlapping positions -- typically
                    # alternative conformations the depositor gave the same
                    # letter (1AKE: AP5 and Arg167 "alt B", 0.52 A) -- so they
                    # are reported apart from contacts, not as contacts.
                    if isinstance(dist, (int, float)) and dist < POLAR_CONTACT_MIN_DISTANCE:
                        overlapping.append(record)
                    else:
                        resolved_pairs.append(record)
            # In a fixed order, so a report lists them the same way every run.
            def _contact_order(r):
                return (r["ligand_atom"], r["protein_chain"], int(re.sub(r"[^0-9-]", "", r["protein_resi"]) or 0),
                        r["protein_resi"], r["protein_atom"])
            resolved_pairs.sort(key=_contact_order)
            overlapping.sort(key=_contact_order)
            entry["polar_contacts"] = resolved_pairs
            entry["overlapping_pairs"] = overlapping
            entry["polar_contact_count"] = len(resolved_pairs)
        except Exception:
            entry["polar_contact_count"] = None
            entry["polar_contacts"] = None

        results[sel_name] = entry
    return results


# ------------------------------------------------------------
# TERMINI: comparative N-/C-terminus structural analysis
# ------------------------------------------------------------
# All measurements here are taken directly from atomic coordinates after the
# comparison structure has been superposed onto the reference (astra3_measure
# moves its coordinates in place, so coordinates read afterwards are already
# in the reference's frame). This module only reports geometric observations (distances, angles,
# RMSD) computed from those coordinates; it does not predict biological
# effect, tag behavior, or binding consequence of any kind.
import math


def _vec_sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _vec_add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def _vec_scale(v, s):
    return (v[0] * s, v[1] * s, v[2] * s)


def _vec_dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _vec_mag(a):
    return math.sqrt(_vec_dot(a, a))


def _vec_distance(a, b):
    return _vec_mag(_vec_sub(a, b))


def _centroid(coords):
    if not coords:
        return None
    n = len(coords)
    sx = sum(c[0] for c in coords)
    sy = sum(c[1] for c in coords)
    sz = sum(c[2] for c in coords)
    return (sx / n, sy / n, sz / n)


def _angle_between(v1, v2):
    """Angle in degrees between two vectors, or None if either is zero-length."""
    m1, m2 = _vec_mag(v1), _vec_mag(v2)
    if m1 == 0 or m2 == 0:
        return None
    cos_theta = _vec_dot(v1, v2) / (m1 * m2)
    cos_theta = max(-1.0, min(1.0, cos_theta))  # guard against float drift outside [-1, 1]
    return math.degrees(math.acos(cos_theta))


def get_ordered_ca_coords(obj, chain):
    """Return [(resi_str, resv_int, (x,y,z)), ...] for one chain's protein Cα
    atoms, in true N-to-C sequence order.

    Sorts by (resv, insertion_code) as a compound key, not resv alone.
    PyMOL's own resv is explicitly documented as "the residue number as
    an integer, EXCLUDING insertion code" -- so residues 52, 52A, 52B
    all share resv=52, and sorting by resv alone leaves their relative
    order entirely dependent on whatever order cmd.iterate_state happened
    to enumerate them in. For a normally-deposited RCSB file that's
    sequence order anyway (atoms are enumerated in file/deposition
    order, which is sequential for well-formed entries), so this rarely
    surfaces -- but it is not a guarantee, and a structure that has been
    edited, merged, or re-saved (or simply an unusual but valid file
    from a non-RCSB source) can have insertion-coded residues appear
    out of sequence order in the atom stream, which would silently
    corrupt N-/C-terminus identification (the first/last entries of
    this list are what downstream code treats as the termini). Parsing
    the insertion code out of resi and sorting on (resv, code) makes
    the true sequence order explicit and independent of enumeration
    order, rather than relying on incidental sort stability.
    """
    raw = []
    cmd.iterate_state(1, f"({obj}) and chain {chain} and polymer.protein and name CA",
                       "raw.append((resi, resv, x, y, z, q))", space={"raw": raw})
    seen = set()
    deduped = []
    for resi, resv, x, y, z, q in raw:
        # Zero-occupancy atoms carry coordinates but were never observed. They
        # must not define this chain's first or last residue -- see
        # MIN_OBSERVED_OCCUPANCY.
        if not is_observed_occupancy(q):
            continue
        if resi in seen:
            continue
        seen.add(resi)
        # Split the insertion code (a trailing letter, if any) out of resi for
        # sorting purposes only -- resi itself is kept intact in the returned
        # tuple, unchanged from before.
        insertion_code = resi_sort_key(resv, resi)[1]
        deduped.append((resi, resv, (x, y, z), insertion_code))
    deduped.sort(key=lambda t: (t[1], t[3]))
    return [(resi, resv, coords) for resi, resv, coords, _code in deduped]


def compute_terminus_vectors(ordered_coords, terminus, tip_n=TERMINUS_WINDOW // 2, orientation_n=TERMINUS_WINDOW // 2, offset=0):
    """From one chain's ordered Cα coordinates, compute the data needed for
    terminus comparison: the tip residue, tip-region centroid, an
    orientation vector, and a Terminal Projection Vector (TPV).

    terminus is "N" or "C". Returns None if the chain has fewer residues
    than needed for the requested window sizes (metrics involving that
    chain are then reported as unavailable rather than computed on a
    truncated/misleading window).

    offset shifts the window inward from the raw terminus by that many
    residues before measuring -- e.g. offset=1 on an N-terminus skips the
    very first resolved residue and starts the tip/orientation window at
    the second. Used to recompute metrics against a sequence-corrected
    window (see match_terminus_windows) once a user has approved excluding
    a leading/trailing residue that doesn't correspond to the other
    structure's terminus. offset=0 (default) reproduces the original,
    uncorrected behavior exactly.
    """
    needed = tip_n + orientation_n + offset
    if len(ordered_coords) < needed:
        return None

    if terminus == "N":
        windowed = ordered_coords[offset:]
        tip_window = windowed[:tip_n]
        orient_near = windowed[:tip_n]
        orient_far = windowed[tip_n:tip_n + orientation_n]
        tip_resi, tip_resv, tip_xyz = windowed[0]
    else:
        windowed = ordered_coords[:len(ordered_coords) - offset] if offset else ordered_coords
        tip_window = windowed[-tip_n:]
        orient_far = windowed[-(tip_n + orientation_n):-tip_n]
        orient_near = windowed[-tip_n:]
        tip_resi, tip_resv, tip_xyz = windowed[-1]

    tip_centroid = _centroid([c for _, _, c in tip_window])
    near_centroid = _centroid([c for _, _, c in orient_near])
    far_centroid = _centroid([c for _, _, c in orient_far])

    # Orientation vector: direction the chain runs FROM this terminus INTO the
    # protein body. Spec definition: N-term = centroid(1-5) -> centroid(6-10);
    # C-term = centroid(last10-6) -> centroid(last5). Both read in the chain's
    # N-to-C direction.
    if terminus == "N":
        orientation_vec = _vec_sub(far_centroid, near_centroid)   # (6-10) - (1-5)
    else:
        orientation_vec = _vec_sub(near_centroid, far_centroid)   # (last5) - (last10-6)

    # Terminal Projection Vector (TPV): the direction the chain is heading as it
    # leaves the protein, from the centroid of the residues next to the tip to
    # the tip Ca itself, pointing outward at both termini. It covers the last
    # TPV_WINDOW residues, the final turn of the chain; the orientation vector
    # covers the whole ten-residue segment. Computed from resolved coordinates
    # only.
    tpv_n = max(2, min(TPV_WINDOW, tip_n + orientation_n))
    tpv_base = windowed[1:tpv_n] if terminus == "N" else windowed[-tpv_n:-1]
    tpv = _vec_sub(tip_xyz, _centroid([c for _, _, c in tpv_base]))

    return {
        "tip_resi": tip_resi,
        "tip_resv": tip_resv,
        "tip_coord": tip_xyz,
        "tip_centroid": tip_centroid,
        "orientation_vector": orientation_vec,
        "tpv": tpv,
        "tpv_residues": tpv_n,
        # Full TERMINUS_WINDOW-sized resi list (not just the tip_n subset used
        # for the vector math above), respecting the same offset -- this is
        # the same window process_structure colors/labels as the terminus, so
        # SASA/B-factor analysis can be computed over exactly what the report
        # and coloring already call "the terminus" rather than a separately-
        # defined window.
        "window_resi": [resi for resi, _, _ in (windowed[:TERMINUS_WINDOW] if terminus == "N" else windowed[-TERMINUS_WINDOW:])],
    }


def refresh_terminus_surface_metrics(result, ref_obj, cmp_obj, chain, cmp_chain=None):
    """Re-measure SASA and normalized B-factor for a terminus whose window did
    not change, after residues elsewhere in either structure were removed.
    Both depend on the whole structure (surroundings and average B-factor),
    so values measured before the removal would not match the structure the
    report and session describe. Updates result in place."""
    if not result:
        return result
    cmp_chain = cmp_chain or chain
    ref_w = result.get("reference_window_resi") or []
    cmp_w = result.get("comparison_window_resi") or []
    values = {
        "sasa_reference": compute_terminus_sasa(ref_obj, chain, ref_w),
        "sasa_comparison": compute_terminus_sasa(cmp_obj, cmp_chain, cmp_w),
        "bnorm_reference": compute_terminus_bnorm(ref_obj, chain, ref_w),
        "bnorm_comparison": compute_terminus_bnorm(cmp_obj, cmp_chain, cmp_w),
    }
    delta_sasa = (values["sasa_comparison"] - values["sasa_reference"]
                  if values["sasa_reference"] is not None and values["sasa_comparison"] is not None else None)
    delta_bnorm = (values["bnorm_comparison"] - values["bnorm_reference"]
                   if values["bnorm_reference"] is not None and values["bnorm_comparison"] is not None else None)
    result.update({
        "sasa_reference_angstrom2": round(values["sasa_reference"], 1) if values["sasa_reference"] is not None else None,
        "sasa_comparison_angstrom2": round(values["sasa_comparison"], 1) if values["sasa_comparison"] is not None else None,
        "delta_sasa_angstrom2": round(delta_sasa, 1) if delta_sasa is not None else None,
        "sasa_classification": classify_sasa_shift(delta_sasa),
        "bnorm_reference": round(values["bnorm_reference"], 3) if values["bnorm_reference"] is not None else None,
        "bnorm_comparison": round(values["bnorm_comparison"], 3) if values["bnorm_comparison"] is not None else None,
        "delta_bnorm": round(delta_bnorm, 3) if delta_bnorm is not None else None,
        "bnorm_classification": classify_bnorm_shift(delta_bnorm),
    })
    return result


def compute_terminus_sasa(obj, chain, window_resi):
    """Solvent-accessible surface area (A^2) of the given terminus window,
    measured on the full object (not an isolated copy), so burial by other
    chains and ligands is reflected. See astra3_measure.window_sasa for the
    atoms used and astra3_geometry for the method.

    Returns None if window_resi is empty or the window has no atoms.
    """
    if not window_resi:
        return None
    # Shrake-Rupley in Astra3 itself (astra3_measure / astra3_geometry), over
    # one conformation of every observed atom of obj, so neighbouring chains
    # and ligands shield the window as they do in the structure.
    try:
        return astra3_measure.window_sasa(obj, chain, list(window_resi))
    except Exception:
        return None


# Whole-protein mean B of each object as deposited, recorded before a terminus
# offset correction first removes residues from it, so every terminus is
# normalized by the same protein (see compute_terminus_bnorm). Cleared when a
# TERMINI run starts.
_PROTEIN_MEAN_B = {}


def forget_protein_mean_b():
    _PROTEIN_MEAN_B.clear()


def _mean_b(selection):
    """Occupancy-weighted mean B of a selection's atoms, or None. Weighted so
    each atom site counts once: alternate conformations share a site in
    proportion to their occupancies."""
    rows = []
    cmd.iterate(selection, "rows.append((q, b))", space={"rows": rows})
    total = sum(q for q, _ in rows)
    return sum(q * b for q, b in rows) / total if total > 0 else None


def _protein_selection(obj):
    # Zero-occupancy atoms were not observed; their B-factor (often 0) is not
    # a measurement and would pull the protein average down.
    return f"({protein_selection(obj)}) and q > 0"


def compute_terminus_bnorm(obj, chain, window_resi):
    """Normalized B-factor of the given terminus window: occupancy-weighted
    mean B-factor of the window's atoms divided by that of the whole protein
    as deposited (every observed polymer.protein atom of obj, including any
    a terminus correction later removed) -- Bnorm > 1 means this terminus is
    more flexible than the protein average, Bnorm < 1 means more rigid.

    Returns None if either the window or the whole-protein selection has
    no atoms, or if B-factors aren't meaningfully populated (e.g. a
    computationally-generated model with all B-factors at a placeholder
    value of 0 everywhere -- Bnorm would be undefined/0-over-0 in that
    case, so this is reported as unavailable rather than as a real 0).
    """
    if not window_resi:
        return None
    term_sel = f"{_protein_selection(obj)} and chain {chain} and resi {resi_expression(window_resi)}"
    try:
        mean_term_b = _mean_b(term_sel)
        # The whole protein as deposited, also after an offset correction has
        # removed residues from obj.
        mean_protein_b = _PROTEIN_MEAN_B.get(obj) or _mean_b(_protein_selection(obj))
        if mean_term_b is None or not mean_protein_b:
            return None
        return mean_term_b / mean_protein_b
    except Exception:
        return None


# A terminus window's change in solvent-accessible surface is labelled as more
# exposed or more buried only above this many Å². 26 Å² is a quarter of
# glycine's maximum accessible surface (104 Å², Tien et al. 2013, PLoS ONE
# 8:e80635): the smallest change that can carry even the smallest residue
# across the 25% relative-accessibility line that best separates surface from
# interior residues (Levy 2010, J Mol Biol 403:660-670).
SASA_SHIFT_THRESHOLD = 26.0

# A change in normalized B-factor is labelled as rigidified or flexible only
# above this value. Since B = 8*pi^2*<u^2>, a change of 0.2 in B relative to the
# protein average is about a 10% change in relative RMS atomic displacement
# (sqrt(1.2) = 1.10). B-factors also shift with resolution, refinement and
# crystal packing (Sun et al. 2019, Chem Rev 119:1626-1665), so smaller
# differences are not labelled as a change.
BNORM_SHIFT_THRESHOLD = 0.2


def classify_sasa_shift(delta_sasa, threshold=SASA_SHIFT_THRESHOLD):
    """Classify a \u0394SASA value (Å²) as More Exposed/Unmasked, More
    Buried/Masked, or Little change (see SASA_SHIFT_THRESHOLD)."""
    if delta_sasa is None:
        return "Unavailable"
    if delta_sasa > threshold:
        return "More Exposed/Unmasked"
    if delta_sasa < -threshold:
        return "More Buried/Masked"
    return "Little change"


def classify_bnorm_shift(delta_bnorm, threshold=BNORM_SHIFT_THRESHOLD):
    """Classify a \u0394Bnorm value as Rigidified, Disordered/Flexible, or
    Little change (see BNORM_SHIFT_THRESHOLD)."""
    if delta_bnorm is None:
        return "Unavailable"
    if delta_bnorm < -threshold:
        return "Rigidified"
    if delta_bnorm > threshold:
        return "Disordered/Flexible"
    return "Little change"


# Minimum number of paired residues required before a local terminal RMSD is
# computed at all. Three points is the least that describes a spatial
# relationship rather than a coincidence, but an RMSD over three residues is
# not the same measurement as one over fifteen -- so the pair count is
# returned with the value and reported alongside it, never dropped.
MIN_RMSD_RESIDUE_PAIRS = 3


def _max_symmetric_eigenvalue(matrix, sweeps=64):
    """Largest eigenvalue of a small symmetric matrix, by cyclic Jacobi
    rotations. Deterministic and dependency-free."""
    a = [list(row) for row in matrix]
    n = len(a)
    for _ in range(sweeps):
        if sum(a[i][j] ** 2 for i in range(n) for j in range(n) if i != j) < 1e-24:
            break
        for p in range(n - 1):
            for q in range(p + 1, n):
                if a[p][q] == 0.0:
                    continue
                theta = (a[q][q] - a[p][p]) / (2.0 * a[p][q])
                t = (1.0 if theta >= 0 else -1.0) / (abs(theta) + math.sqrt(theta * theta + 1.0))
                c = 1.0 / math.sqrt(t * t + 1.0)
                s = t * c
                for k in range(n):
                    akp, akq = a[k][p], a[k][q]
                    a[k][p] = c * akp - s * akq
                    a[k][q] = s * akp + c * akq
                for k in range(n):
                    apk, aqk = a[p][k], a[q][k]
                    a[p][k] = c * apk - s * aqk
                    a[q][k] = s * apk + c * aqk
    return max(a[i][i] for i in range(n))


def superposed_rmsd(pairs):
    """RMSD (A) between paired points after their best rigid superposition
    (rotation and translation, never a reflection), or None for fewer than
    MIN_RMSD_RESIDUE_PAIRS pairs.

    Uses the quaternion formulation: the minimum RMSD follows from the largest
    eigenvalue of a 4x4 matrix built from the centred coordinates, so no
    matrix library is needed.
    """
    n = len(pairs)
    if n < MIN_RMSD_RESIDUE_PAIRS:
        return None
    ca = _centroid([a for a, _ in pairs])
    cb = _centroid([b for _, b in pairs])
    A = [_vec_sub(a, ca) for a, _ in pairs]
    B = [_vec_sub(b, cb) for _, b in pairs]
    S = [[sum(x[i] * y[j] for x, y in zip(A, B)) for j in range(3)] for i in range(3)]
    sxx, sxy, sxz = S[0]
    syx, syy, syz = S[1]
    szx, szy, szz = S[2]
    N = [[sxx + syy + szz, syz - szy, szx - sxz, sxy - syx],
         [syz - szy, sxx - syy - szz, sxy + syx, szx + sxz],
         [szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy],
         [sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz]]
    largest = _max_symmetric_eigenvalue(N)
    e0 = sum(v[0] ** 2 + v[1] ** 2 + v[2] ** 2 for v in A) + sum(v[0] ** 2 + v[1] ** 2 + v[2] ** 2 for v in B)
    return math.sqrt(max(0.0, (e0 - 2.0 * largest) / n))


def compute_local_terminal_rmsd_detail(ref_obj, cmp_obj, chain, terminus, window=15, ref_offset=0, cmp_offset=0, cmp_chain=None, residue_pairs=None):
    """RMSD (Å) over the first/last `window` Cα atoms of one chain, comparing
    ref_obj and cmp_obj (both already aligned into the same coordinate
    frame), together with the number of residues the value was actually
    computed from.

    Returns a dict:

        {"rmsd": float, "rmsd_refit": float, "residues_used": int,
         "residues_requested": int, "residues_available_reference": int,
         "residues_available_comparison": int, "pairing": str}

    "rmsd" is measured in place, where the atoms sit after the whole-chain
    superposition, so it includes any rigid shift of the terminus as well as
    any change in its shape. "rmsd_refit" uses the same pairs after
    superposing the two windows onto each other, which removes the shift and
    leaves only the shape difference. It is never larger than "rmsd".

    or None if either structure lacks enough residues on this chain, or if
    fewer than MIN_RMSD_RESIDUE_PAIRS residues could be paired.

    The requested window is TERMINUS_WINDOW, matching the window the residue
    pairing itself comes from.

    residues_used is the count that matters and can still be smaller than
    residues_requested. Only residues present on BOTH structures can be
    paired: unresolved residues (present in the deposited sequence but with
    no coordinates), residues dropped by an offset correction, and residues
    the alignment leaves unpaired all reduce it. A 15-residue window that
    yields 6 pairs produces a real RMSD over 6 residues, and a report that
    prints the value without the count invites the reader to assume 15.
    Callers must carry residues_used through to whatever they display.

    ref_offset/cmp_offset independently shift each structure's window
    inward from its raw terminus before measuring (see
    compute_terminus_vectors' offset parameter for the same idea) -- used
    to recompute this metric against a sequence-corrected window once a
    user approves excluding a leading/trailing residue that doesn't
    correspond to the other structure's terminus.

    cmp_chain, if given, is the comparison structure's chain letter when it
    differs from `chain` (the reference's letter) -- e.g. after a
    letter-mismatched cross-structure match (see match_chains_across_structures).
    Defaults to `chain` for full backward compatibility with same-letter
    callers.
    """
    if cmp_chain is None:
        cmp_chain = chain
    ref_coords = get_ordered_ca_coords(ref_obj, chain)
    cmp_coords = get_ordered_ca_coords(cmp_obj, cmp_chain)
    if len(ref_coords) < window + ref_offset or len(cmp_coords) < window + cmp_offset:
        return None

    if terminus == "N":
        ref_window = ref_coords[ref_offset:ref_offset + window]
        cmp_window = cmp_coords[cmp_offset:cmp_offset + window]
    else:
        ref_end = len(ref_coords) - ref_offset
        cmp_end = len(cmp_coords) - cmp_offset
        ref_window = ref_coords[max(0, ref_end - window):ref_end]
        cmp_window = cmp_coords[max(0, cmp_end - window):cmp_end]

    # Preferred pairing: the correspondence established by aligning the two
    # terminal sequences (see match_terminus_windows). Pairing by residue
    # number instead assumes both structures share a numbering scheme, which
    # independently deposited entries routinely do not -- two entries can use
    # unrelated numbering for the same protein, so resv equality either finds
    # no overlap at all or, worse, pairs residues that merely happen to carry
    # the same number while sitting at different points in the fold. The
    # latter produces a plausible-looking RMSD from a meaningless pairing.
    if residue_pairs:
        ref_by_resi = {resi: xyz for resi, _, xyz in ref_window}
        cmp_by_resi = {resi: xyz for resi, _, xyz in cmp_window}
        paired = [(ref_by_resi[r], cmp_by_resi[c]) for r, c in residue_pairs
                  if r in ref_by_resi and c in cmp_by_resi]
        if len(paired) >= MIN_RMSD_RESIDUE_PAIRS:
            sq = [_vec_distance(a, b) ** 2 for a, b in paired]
            return {
                "rmsd": math.sqrt(sum(sq) / len(sq)),
                "rmsd_refit": superposed_rmsd(paired),
                "residues_used": len(paired),
                "residues_requested": window,
                "residues_available_reference": len(ref_window),
                "residues_available_comparison": len(cmp_window),
                "pairing": "alignment",
            }

    # Fallback when no alignment-derived pairing is available. Keyed on resi
    # (the full residue identifier, insertion code included) rather than the
    # bare integer, so 52, 52A and 52B remain distinct residues.
    ref_by_resi = {resi: xyz for resi, _, xyz in ref_window}
    cmp_by_resi = {resi: xyz for resi, _, xyz in cmp_window}
    shared = sorted(set(ref_by_resi) & set(cmp_by_resi))
    if len(shared) < MIN_RMSD_RESIDUE_PAIRS:
        return None

    sq_diffs = [_vec_distance(ref_by_resi[r], cmp_by_resi[r]) ** 2 for r in shared]
    return {
        "rmsd": math.sqrt(sum(sq_diffs) / len(sq_diffs)),
        "rmsd_refit": superposed_rmsd([(ref_by_resi[r], cmp_by_resi[r]) for r in shared]),
        "residues_used": len(shared),
        "residues_requested": window,
        "residues_available_reference": len(ref_window),
        "residues_available_comparison": len(cmp_window),
        "pairing": "residue-number",
    }


def compute_local_terminal_rmsd(ref_obj, cmp_obj, chain, terminus, window=15, ref_offset=0, cmp_offset=0, cmp_chain=None, residue_pairs=None):
    """Local terminal RMSD as a bare float, or None.

    Thin wrapper over compute_local_terminal_rmsd_detail for callers that
    only want the value. Anything that reports the number to a user should
    use the detail form instead, so the residue count travels with it.
    """
    detail = compute_local_terminal_rmsd_detail(ref_obj, cmp_obj, chain, terminus, window,
                                                ref_offset, cmp_offset, cmp_chain, residue_pairs)
    return detail["rmsd"] if detail else None


def get_terminus_sequence(ordered_coords, terminus, window=TERMINUS_WINDOW, extra=10):
    """Return a one-letter sequence string for the residues at one end of a
    chain, plus a bit extra context, for use in terminus sequence matching
    (get_terminus_sequence itself only returns the window+extra actually
    resolved -- callers decide how much of it to use). window+extra residues
    are pulled from the terminus end so the offset-search in
    match_terminus_windows below has room to look past a short insertion or
    numbering offset without needing a second PyMOL query.

    Returns (sequence_str, ordered_subset) where ordered_subset is the same
    (resi, resv, coord) tuples get_ordered_ca_coords produces, in N-to-C
    order, for the residues the sequence was built from. Both are read via
    cmd.iterate against the resi values already collected by
    get_ordered_ca_coords, so no atom coordinates are refetched.
    """
    pull = window + extra
    if terminus == "N":
        subset = ordered_coords[:pull]
    else:
        subset = ordered_coords[-pull:]
    if not subset:
        return "", []
    resi_list = [resi for resi, _, _ in subset]
    return resi_list, subset


def _resn_for_resis(obj, chain, resi_list):
    """One-letter sequence for a specific ordered list of resi strings on
    one chain, preserving the caller's ordering rather than re-sorting."""
    if not resi_list:
        return ""
    lookup = {}
    resi_set = set(resi_list)
    raw = []
    cmd.iterate(f"({obj}) and chain {chain} and polymer.protein and name CA",
                "raw.append((resi, resn))", space={"raw": raw})
    for resi, resn in raw:
        if resi in resi_set:
            lookup[resi] = AA_3TO1.get(resn, "X")
    return "".join(lookup.get(r, "X") for r in resi_list)


def match_terminus_windows(ref_obj, cmp_obj, chain, terminus, window=TERMINUS_WINDOW,
                           search_extra=TERMINUS_SEARCH_EXTRA_DEFAULT, min_identity=0.8, cmp_chain=None):
    """Determine whether the reference and comparison structures' termini
    actually correspond to the same point in the sequence, tolerating a
    short offset (e.g. the comparison has 2 extra residues at this terminus
    that the reference lacks, or vice versa) before declaring a mismatch.

    Approach: pull `window + search_extra` residues from this terminus on
    both structures, then try every alignment offset (-search_extra..
    +search_extra) between the two extended sequences, scoring each by
    exact-match count over the overlapping region. The best-scoring offset
    is adopted as the frame; the terminus is then re-evaluated for identity
    over `window` residues in that frame. For example, for AEGKYLEA against
    GKAEGKYLEA, shifting the longer sequence by 2
    finds a perfect match that a naive first-N-residues comparison would
    miss entirely.

    Returns a dict:
      {
        "identity": float (0-1) over the matched window at the best offset,
        "offset": int (residues the comparison is shifted relative to the
                   reference at this terminus; 0 = no offset needed),
        "reference_window_resi": [...] the reference resi's actually used
                   for coloring/reporting once offset is applied,
        "comparison_window_resi": [...] same for the comparison,
        "reference_seq": str, "comparison_seq": str (the window actually compared),
        "confident_match": bool (identity >= min_identity),
      }
    Returns None if either structure has too few residues at this terminus
    to attempt a comparison at all.

    cmp_chain, if given, is the comparison structure's chain letter when it
    differs from `chain` (the reference's letter). Defaults to `chain`.
    """
    if cmp_chain is None:
        cmp_chain = chain
    ref_coords = get_ordered_ca_coords(ref_obj, chain)
    cmp_coords = get_ordered_ca_coords(cmp_obj, cmp_chain)
    if len(ref_coords) < window or len(cmp_coords) < window:
        return None

    ref_resi_ext, ref_subset = get_terminus_sequence(ref_coords, terminus, window, search_extra)
    cmp_resi_ext, cmp_subset = get_terminus_sequence(cmp_coords, terminus, window, search_extra)
    if not ref_resi_ext or not cmp_resi_ext:
        return None

    ref_seq_ext = _resn_for_resis(ref_obj, chain, ref_resi_ext)
    cmp_seq_ext = _resn_for_resis(cmp_obj, cmp_chain, cmp_resi_ext)

    # For the N-terminus, offsets shift from the start of the extended
    # sequence; for the C-terminus, the "tip" is the far end, so offsets are
    # applied from the end instead. Represent both uniformly by always
    # comparing from the "tip side": index 0 = the very first/last residue.
    if terminus == "C":
        ref_seq_tip_first = ref_seq_ext[::-1]
        cmp_seq_tip_first = cmp_seq_ext[::-1]
        ref_resi_tip_first = list(reversed(ref_resi_ext))
        cmp_resi_tip_first = list(reversed(cmp_resi_ext))
    else:
        ref_seq_tip_first = ref_seq_ext
        cmp_seq_tip_first = cmp_seq_ext
        ref_resi_tip_first = ref_resi_ext
        cmp_resi_tip_first = cmp_resi_ext

    best = None
    for offset in range(-search_extra, search_extra + 1):
        # offset > 0: comparison has `offset` extra residues before its true
        # terminus match point (skip them in the comparison sequence). offset
        # < 0: reference has the extra residues instead (skip in ref).
        if offset >= 0:
            r_seq = ref_seq_tip_first
            c_seq = cmp_seq_tip_first[offset:]
        else:
            r_seq = ref_seq_tip_first[-offset:]
            c_seq = cmp_seq_tip_first
        compare_len = min(len(r_seq), len(c_seq), window)
        if compare_len < min(window, 5):
            continue
        r_window = r_seq[:compare_len]
        c_window = c_seq[:compare_len]
        matches = sum(1 for a, b in zip(r_window, c_window) if a == b)
        identity = matches / compare_len
        if best is None or identity > best["identity"] or (identity == best["identity"] and abs(offset) < abs(best["offset"])):
            best = {"identity": identity, "offset": offset, "compare_len": compare_len}

    if best is None:
        return None

    offset = best["offset"]
    compare_len = best["compare_len"]
    if offset >= 0:
        ref_window_resi_tf = ref_resi_tip_first[:compare_len]
        cmp_window_resi_tf = cmp_resi_tip_first[offset:offset + compare_len]
    else:
        ref_window_resi_tf = ref_resi_tip_first[-offset:-offset + compare_len]
        cmp_window_resi_tf = cmp_resi_tip_first[:compare_len]

    # Restore N-to-C order for display/reporting regardless of which terminus
    # this was.
    if terminus == "C":
        ref_window_resi = list(reversed(ref_window_resi_tf))
        cmp_window_resi = list(reversed(cmp_window_resi_tf))
    else:
        ref_window_resi = ref_window_resi_tf
        cmp_window_resi = cmp_window_resi_tf

    ref_seq_display = _resn_for_resis(ref_obj, chain, ref_window_resi)
    cmp_seq_display = _resn_for_resis(cmp_obj, cmp_chain, cmp_window_resi)

    # Explicit residue correspondence for the matched window.
    #
    # The offset search above shifts one window relative to the other, which
    # handles a terminus that simply starts a few residues earlier or later.
    # It cannot represent an insertion or deletion INSIDE the window: from
    # that point on, every subsequent residue is compared against the wrong
    # partner, and the resulting identity and any structural pairing built on
    # it are both wrong.
    #
    # A gap-aware alignment of the two windows produces the actual
    # correspondence, which is then carried as explicit (ref_resi, cmp_resi)
    # pairs so downstream structural work follows the alignment rather than
    # re-deriving a pairing from residue numbers. Both windows are in
    # tip-first order here, so this is identical for N and C termini.
    residue_pairs = []
    align_metrics = None
    try:
        ref_win_seq = _resn_for_resis(ref_obj, chain, ref_window_resi_tf)
        cmp_win_seq = _resn_for_resis(cmp_obj, cmp_chain, cmp_window_resi_tf)
        align_metrics = astra3_align.compare(ref_win_seq, cmp_win_seq, prescreen=False)
        # Aligned with their unobserved residues in place, so the residues
        # either side of a gap in one structure are not paired with unrelated
        # ones in the other.
        ref_res, ref_seq = astra3_measure.gapped_sequence(ref_obj, chain, ref_window_resi_tf, ref_win_seq)
        cmp_res, cmp_seq = astra3_measure.gapped_sequence(cmp_obj, cmp_chain, cmp_window_resi_tf, cmp_win_seq)
        for ri, ci in astra3_align.aligned_pairs(ref_seq, cmp_seq):
            if ri < len(ref_res) and ci < len(cmp_res) and ref_res[ri] is not None and cmp_res[ci] is not None:
                residue_pairs.append((ref_res[ri], cmp_res[ci]))
    except Exception:
        # Falls back to the offset-only result, which remains correct for
        # windows that differ by a shift alone.
        residue_pairs = []
        align_metrics = None

    # "Before" sequences: the naive first/last-`window` selection each
    # structure would show with NO offset correction applied (offset=0),
    # regardless of what the best-scoring offset turned out to be. Derived
    # from the already-fetched extended sequences rather than a fresh PyMOL
    # query. Used by the approval prompt to show the user exactly what would
    # change, before any correction is applied.
    ref_naive_seq = ref_seq_ext[:window] if terminus == "N" else ref_seq_ext[-window:]
    cmp_naive_seq = cmp_seq_ext[:window] if terminus == "N" else cmp_seq_ext[-window:]
    ref_naive_resi = ref_resi_ext[:window] if terminus == "N" else ref_resi_ext[-window:]
    cmp_naive_resi = cmp_resi_ext[:window] if terminus == "N" else cmp_resi_ext[-window:]

    ref_offset = max(0, -offset)
    cmp_offset = max(0, offset)
    # Residues excluded by the correction: the ones strictly closer to the tip
    # than the corrected window's first residue, in N-to-C order (i.e. exactly
    # what a physical trim would delete from that end of the chain). Only one
    # side is ever non-empty for a given offset -- the reference has extras
    # when offset < 0, the comparison when offset > 0.
    ref_excluded_tf = ref_resi_tip_first[:ref_offset]
    cmp_excluded_tf = cmp_resi_tip_first[:cmp_offset]
    ref_excluded_resi = list(reversed(ref_excluded_tf)) if terminus == "C" else ref_excluded_tf
    cmp_excluded_resi = list(reversed(cmp_excluded_tf)) if terminus == "C" else cmp_excluded_tf

    return {
        "identity": best["identity"],
        "offset": offset,
        "compare_len": compare_len,
        "reference_window_resi": ref_window_resi,
        "comparison_window_resi": cmp_window_resi,
        "reference_seq": ref_seq_display,
        "comparison_seq": cmp_seq_display,
        "reference_naive_seq": ref_naive_seq,
        "comparison_naive_seq": cmp_naive_seq,
        "reference_naive_resi": ref_naive_resi,
        "comparison_naive_resi": cmp_naive_resi,
        # Exact resi's a physical trim should delete from each structure's
        # object (empty on the side that had no extra residues at this
        # terminus). Used by reconcile_termini_coloring to actually remove the
        # excluded residues from the .pse, not just recolor around them.
        "reference_excluded_resi": ref_excluded_resi,
        "comparison_excluded_resi": cmp_excluded_resi,
        "confident_match": best["identity"] >= min_identity,
        # True when, even at the best-scoring offset, fewer than a full
        # `window` residues of overlap were available on both sides (e.g. a
        # structure is simply too short past the offset point to supply a full
        # 10-residue window). Recoloring should not silently pad this with
        # unrelated residues -- the caller should warn instead.
        "window_gap": compare_len < window,
        # Explicit correspondence from the gap-aware alignment of the two
        # windows: [(reference_resi, comparison_resi), ...] in tip-first
        # order. Empty if the alignment could not be produced, in which case
        # callers fall back to their previous pairing.
        "residue_pairs": residue_pairs,
        # Auditability: what was asked for, what existed, and what was
        # actually compared, so a report can never imply more residues were
        # examined than the structures supplied.
        "search_extra": search_extra,
        "large_offset": abs(offset) >= LARGE_TERMINUS_OFFSET,
        "requested_window": window,
        "available_reference": len(ref_resi_ext),
        "available_comparison": len(cmp_resi_ext),
        "analyzed_residues": compare_len,
        "alignment_method": "gotoh-affine/blosum62" if residue_pairs else "offset-search",
        "alignment_identity": (align_metrics or {}).get("identity"),
        "alignment_similarity": (align_metrics or {}).get("similarity"),
        "alignment_coverage_reference": (align_metrics or {}).get("coverage_a"),
        "alignment_coverage_comparison": (align_metrics or {}).get("coverage_b"),
        "alignment_gap_openings": (align_metrics or {}).get("gap_openings"),
    }


def refresh_terminus_residue_cache(structure_data, obj):
    """Re-read the (possibly just-recolored) N-/C-terminus selections for
    one structure and refresh structure_data[obj]'s cached
    n_term_residues/c_term_residues lists in place. Needed after
    reconcile_termini_coloring reassigns those selections mid-run --
    otherwise the cached lists captured at load time (before any TERMINI
    offset correction) would silently disagree with what's actually
    colored/selected in the PyMOL session.
    """
    d = structure_data.get(obj)
    if d is None:
        return
    n_terms, c_terms = [], []
    try:
        cmd.iterate(d["n_term_name"], "items.append((chain, resi))", space={"items": n_terms})
        cmd.iterate(d["c_term_name"], "items.append((chain, resi))", space={"items": c_terms})
        d["n_term_residues"] = sorted(set(n_terms))
        d["c_term_residues"] = sorted(set(c_terms))
    except Exception:
        pass


def console_residue_ranges(items):
    """Residue numbers for console messages: runs of three or more become
    ranges ("425-441"), shorter runs are listed ("281, 282"). Accepts residue
    numbers (insertion codes allowed) or ranges already in the missing-residue
    format ("385-388C")."""
    items = [str(x).strip() for x in (items or [])]
    if any(re.match(r"^-?\d+[A-Za-z]?-", x) for x in items):
        ranges = items  # already ranges
    else:
        ranges = _normalize_missing_residue_ranges({"_": items})["_"] if items else []
    out = []
    for r in ranges:
        m = re.match(r"^(-?\d+)-(-?\d+)$", r)
        if m and int(m.group(2)) == int(m.group(1)) + 1:
            out.extend([m.group(1), m.group(2)])
        else:
            out.append(r)
    return ", ".join(out)


def deposited_numbering_for_unobserved(unobserved, deposited):
    """{chain: ranges} naming each chain's zero-occupancy residues as the
    depositor numbered them.

    deposited is the mmCIF file's own _pdbx_unobs_or_zero_occ_residues map
    (unobserved and zero-occupancy residues). A structure loaded from mmCIF
    can carry a zero-occupancy position for such residues, numbering
    positions inside a gap that spans insertion codes by counting back from
    the next observed residue: 1ERJ's 385-388C loaded as 425-431. When a
    chain's zero-occupancy count equals the file's count, the file's record
    is the authoritative list of the same residues and is used instead.
    """
    out = {}
    for chain, resis in (unobserved or {}).items():
        listed = (deposited or {}).get(chain)
        if listed and count_missing_residues(listed) == len(resis):
            out[chain] = list(listed)
    return out


def _format_resi_range(window_resi):
    """Compact display for a contiguous resi list, e.g. '493-502' instead
    of '493,494,495,496,497,498,499,500,501,502'. Falls back to a
    comma-joined list if the resi's aren't a clean contiguous integer run
    (shouldn't normally happen for a terminus window, but stay safe rather
    than crash on an unexpected resi format like an insertion code)."""
    try:
        ints = [int(r) for r in window_resi]
    except (ValueError, TypeError):
        return ",".join(window_resi)
    if not ints:
        return ""
    if len(ints) == 1:
        return str(ints[0])
    is_contiguous = all(ints[i + 1] == ints[i] + 1 for i in range(len(ints) - 1))
    if is_contiguous:
        return f"{ints[0]}-{ints[-1]}"
    return ",".join(str(i) for i in ints)


def apply_corrected_terminus_window(obj, chain, terminus, window_resi, n_term_name, c_term_name):
    """Re-select and recolor one structure's N- or C-terminus selection to
    an explicit, already-determined list of resi's (from
    match_terminus_windows' offset-corrected window), replacing whatever
    process_structure originally picked via naive first/last-N-by-number
    slicing. Only the requested terminus (N or C) is touched; the other
    terminus's existing selection is left as-is.

    Excluded residues themselves are removed from the object separately by
    remove_excluded_terminus_residues (called by reconcile_termini_coloring
    before this function) -- this function only handles selecting and
    coloring the residues that remain.

    n_term_name/c_term_name must be the existing selection names created by
    process_structure for this object (process_result["n_term_name"] /
    ["c_term_name"]) -- reused rather than creating new selection objects,
    so every other part of Astra3 that already references those names
    (rendering, reports, CSV/JSON export) picks up the correction for free.

    Prints a short confirmation (residue range, atom count, color) -- never
    silent, so a failed or empty correction is always visible rather than
    looking identical to a successful one.
    """
    target_name = n_term_name if terminus == "N" else c_term_name
    if not window_resi:
        print(f"{YELLOW}No corrected {terminus}-terminus residues to apply for {obj} chain {chain} "
              f"(empty window). Selection '{target_name}' left unchanged.{RESET}", flush=True)
        return
    sel_expr = " or ".join(f"(chain {chain} and resi {resi_token(ri)})" for ri in window_resi)
    full_sel = f"{obj} and ({sel_expr})"
    try:
        atom_count = cmd.select(target_name, full_sel)
        resi_range = _format_resi_range(window_resi)
        if TERMINUS_COLORS["enabled"]:
            color = TERMINUS_COLORS["n" if terminus == "N" else "c"]
            color_code = GREEN if terminus == "N" else RED
            cmd.color(engine_color(color), target_name)
            print(f"{WHITE}{obj} chain {chain}: resi {resi_range} recolored {color_code}{color}{RESET}.", flush=True)
        else:
            print(f"{WHITE}{obj} chain {chain}: resi {resi_range} selected.{RESET}", flush=True)
        if atom_count == 0:
            print(f"{YELLOW}Warning: the corrected selection matched 0 atoms, '{target_name}' is now "
                  f"empty. This usually means the resi list doesn't match this object's actual residue "
                  f"numbering.{RESET}", flush=True)
    except Exception as e:
        print(f"{RED}Could not apply corrected {terminus}-terminus window for {obj} chain {chain}: {e}{RESET}", flush=True)


def _format_terminus_diff_line(label, seq, label_width=22):
    """One line of the before/after diff table: a fixed-width label
    followed by the sequence. Kept as plain fixed-width text so the two
    lines stay character-aligned regardless of terminal width.

    label_width should be computed by the caller from the ACTUAL pair of
    labels being printed together (see show_termini_offset_and_confirm's
    own call sites) rather than assumed as a fixed constant -- a
    structure ID longer than the old hardcoded 22 (an imported AST-XXXX
    ID is short, but nothing enforces a hard cap on a real PDB ID's
    length in principle) would silently overflow past a fixed width with
    no truncation, breaking alignment between the two lines with no
    warning. Sizing to the real longest label in THIS pair guarantees
    both lines always start their sequence at the same column,
    regardless of how long either ID happens to be.
    """
    return f"  {label:<{label_width}}{seq}"


def show_termini_offset_and_confirm(pdb_id_ref, pdb_id_cmp, chain, n_match_result, c_match_result,
                                    window=TERMINUS_WINDOW, cmp_chain=None, auto_decision=None,
                                    allow_advanced=True):
    """Show one combined before/after summary covering BOTH the N-terminus
    and C-terminus offset findings for one chain pair, then ask a SINGLE
    y/n confirmation that applies to whichever of the two need a
    correction. Only termini with a nonzero offset (i.e. actually needing a
    decision) are shown -- pass None for whichever terminus doesn't need
    one; if both are None this returns False without printing or asking
    anything.

    auto_decision, if given, is "always" or "never" (see -alwaysmatch/
    -nevermatch in astra3.py's own flag parsing) -- skips the interactive
    y/n prompt entirely and applies that decision, still printing the
    same before/after summary so the run's own output stays a complete,
    reproducible record of what happened and why, just without blocking
    on input(). "always" applies a correction only when the match reaches
    AUTO_MATCH_MIN_IDENTITY; a weaker one is left uncorrected and reported
    under "auto_held" so the caller can say why.

    Returns True if the user approved (applies to every terminus passed
    in), False otherwise -- both termini are always corrected or declined
    together, since there's no real reason to want only one corrected.
    """
    if cmp_chain is None:
        cmp_chain = chain
    active = [(t, mr) for t, mr in (("N", n_match_result), ("C", c_match_result)) if mr is not None]
    if not active:
        return False
    chain_label = f"chain {chain}" if chain == cmp_chain else f"{pdb_id_ref} chain {chain} / {pdb_id_cmp} chain {cmp_chain}"

    print("-" * 60, flush=True)
    print(f"{BOLD}{WHITE}Terminus Offset Detected:{RESET}{WHITE} {chain_label}{RESET}", flush=True)
    print("-" * 60, flush=True)
    trim_notes = []
    for terminus, match_result in active:
        term_color = GREEN if terminus == "N" else RED
        trimmed_count = abs(match_result["offset"])
        trimmed_from = pdb_id_cmp if match_result["offset"] > 0 else pdb_id_ref
        # The N-terminus window reads from the start of the chain, so a
        # correction there trims from the front; the C-terminus window reads
        # from the end, so a correction there trims from the back.
        position_word = "first" if terminus == "N" else "last"
        trim_notes.append(f"{position_word} {trimmed_count} residue(s) of {trimmed_from} ({terminus}-terminus)")

        print(f"{term_color}{terminus}-terminus{RESET}{WHITE}: {pdb_id_ref} and {pdb_id_cmp} don't align at "
              f"the naive first/last {window} residues. Shifting by {trimmed_count} residue(s) gives a "
              f"{match_result['identity']*100:.0f}% match over {match_result['compare_len']} residues.{RESET}", flush=True)
        # See _format_terminus_diff_line's own docstring for why this is
        # computed from the real label pair rather than assumed fixed -- the
        # previous flat 22 is kept as a floor (preserving the same spacious
        # look for ordinary 4-character PDB IDs), only extended beyond that if
        # a label would otherwise genuinely overflow and silently misalign.
        diff_label_width = max(len(pdb_id_ref) + 1, len(pdb_id_cmp) + 1, 20) + 2
        print(f"{WHITE}  Before:{RESET}", flush=True)
        print(_format_terminus_diff_line(pdb_id_ref + ":", match_result["reference_naive_seq"], diff_label_width), flush=True)
        print(_format_terminus_diff_line(pdb_id_cmp + ":", match_result["comparison_naive_seq"], diff_label_width), flush=True)
        print(f"{WHITE}  After:{RESET}", flush=True)
        print(_format_terminus_diff_line(pdb_id_ref + ":", match_result["reference_seq"], diff_label_width), flush=True)
        print(_format_terminus_diff_line(pdb_id_cmp + ":", match_result["comparison_seq"], diff_label_width), flush=True)
        print("", flush=True)

    # One question per terminus. The two ends of a chain are independent
    # measurements: one can line up cleanly while the other does not, and a
    # single decision covering both forces an all-or-nothing answer to two
    # unrelated questions. Each terminus is asked about on its own terms,
    # with its own trim description and its own escalation offer.
    approved_termini = []
    auto_held = {}
    escalate = False
    max_attempts = 10  # safety cap against a non-interactive caller looping forever

    for terminus, match_result in active:
        trimmed_count = abs(match_result["offset"])
        trimmed_from = pdb_id_cmp if match_result["offset"] > 0 else pdb_id_ref
        trimmed_chain = cmp_chain if match_result["offset"] > 0 else chain
        position_word = "first" if terminus == "N" else "last"
        term_color = GREEN if terminus == "N" else RED

        residue_word = "residue" if trimmed_count == 1 else "residues"
        question = (f"Trim {trimmed_count} {residue_word} from the {terminus}-terminus of {trimmed_from} "
                    f"chain {trimmed_chain}?")
        print(f"{YELLOW}The {term_color}{terminus}-terminus{RESET}{YELLOW} correction removes the {position_word} "
              f"{trimmed_count} {residue_word} of {trimmed_from} chain {trimmed_chain} from the structure, "
              f"coloring, labeling, and numeric metrics.{RESET}", flush=True)

        # Escalation is offered only where it can actually help: this
        # terminus is not confident by the system's existing standard
        # (match_terminus_windows marks a window confident at identity >=
        # min_identity), and a more thorough pass has not already been run.
        # Offering it on a confident match, or after the deepest analysis,
        # would advertise an option that does nothing.
        this_weak = not match_result.get("confident_match", False)
        offer_advanced = this_weak and allow_advanced

        if auto_decision is not None:
            approved = auto_decision == "always"
            identity = match_result.get("identity") or 0.0
            held = approved and identity < AUTO_MATCH_MIN_IDENTITY
            if held:
                approved = False
                auto_held[terminus] = {"identity": identity, "threshold": AUTO_MATCH_MIN_IDENTITY}
                reason = (f"not applied automatically: a {identity * 100:.0f}% match is below the "
                          f"{AUTO_MATCH_MIN_IDENTITY * 100:.0f}% -alwaysmatch requires")
            else:
                reason = f"auto-decided via {'-alwaysmatch' if approved else '-nevermatch'}"
            print(f"{WHITE}{question} {format_yn_prompt()}: {GREEN if approved else RED}{'y' if approved else 'n'}{WHITE} "
                  f"({reason}){RESET}", flush=True)
            if approved:
                approved_termini.append(terminus)
                print(f"{WHITE}Correction applied.{RESET}", flush=True)
            elif held:
                print(f"{YELLOW}Correction left for review, keeping the original naive window. Run without "
                      f"-alwaysmatch to decide it at the prompt.{RESET}", flush=True)
            else:
                print(f"{YELLOW}Correction declined, keeping the original naive window.{RESET}", flush=True)
            print("", flush=True)
            continue

        if offer_advanced:
            print(f"{YELLOW}Match confidence is low. Type {BOLD}advanced{RESET}{YELLOW} to try a more "
                  f"thorough alignment for this terminus before deciding.{RESET}", flush=True)

        for _attempt in range(max_attempts):
            print(f"{question} {format_yn_prompt()}: ", end="", flush=True)
            try:
                choice = input().strip().lower()
            except KeyboardInterrupt:
                print(f"\n{YELLOW}Correction prompt cancelled by user, keeping the original naive "
                      f"window.{RESET}", flush=True)
                choice = "n"
            if choice in ("y", "yes"):
                approved_termini.append(terminus)
                print(f"{WHITE}Correction applied.{RESET}", flush=True)
                break
            if choice in ("n", "no"):
                print(f"{YELLOW}Correction declined, keeping the original naive window.{RESET}", flush=True)
                break
            if choice in ("advanced", "advanced alignment", "escalate"):
                if offer_advanced:
                    escalate = terminus
                    break
                # Explains why rather than repeating "answer y or n", which
                # gave no indication whether the word was wrong or simply
                # not applicable here.
                if not allow_advanced:
                    print(f"{WHITE}This is already the most thorough alignment available.{RESET}", flush=True)
                else:
                    print(f"{WHITE}This terminus already matches confidently, so a more thorough "
                          f"alignment would not change it.{RESET}", flush=True)
                continue
            print(f'{YELLOW}"{choice}" wasn\'t understood. Please answer y or n.{RESET}', flush=True)
        print("", flush=True)
        if escalate:
            break

    return {"approved": bool(approved_termini), "termini": approved_termini, "escalate": escalate,
            "auto_held": auto_held}


def remove_excluded_terminus_residues(obj, chain, excluded_resi, pdb_id, terminus):
    """Physically delete excluded_resi from obj (a real cmd.remove, not just
    a selection change) so a terminus offset correction is reflected in the
    actual structure and the saved .pse, not only in which atoms happen to
    be colored. Returns True if any atoms were removed.

    This mirrors apply_intra_structure_homomer_reduction's approach: once
    the user approves a correction, the excluded residues are gone from the
    object entirely, so there is nothing left in the session that still
    looks like it belongs to this terminus. Recoloring alone is not
    sufficient here -- a selection change does not undo color already
    painted onto now-excluded atoms, so those residues would otherwise
    remain visibly green/red even after being dropped from the terminus
    selection.
    """
    if not excluded_resi:
        return False
    sel = f"{obj} and chain {chain} and resi {resi_expression(excluded_resi)}"
    try:
        removed_count = cmd.count_atoms(sel)
        if removed_count == 0:
            return False
        if obj not in _PROTEIN_MEAN_B:
            _PROTEIN_MEAN_B[obj] = _mean_b(_protein_selection(obj))
        cmd.remove(sel)
        resi_ints = sorted(int(r) for r in excluded_resi if r.lstrip("-").isdigit())
        resi_label = f"{resi_ints[0]}-{resi_ints[-1]}" if len(resi_ints) > 1 else str(resi_ints[0]) if resi_ints else ",".join(excluded_resi)
        print(f"{WHITE}Removed resi {resi_label} ({terminus}-terminus correction) from {pdb_id} "
              f"chain {chain}, {removed_count} atom(s) deleted from the session.{RESET}", flush=True)
        return True
    except Exception as e:
        print(f"{RED}Could not remove excluded {terminus}-terminus residues from {pdb_id} chain {chain}: {e}{RESET}", flush=True)
        return False


def reconcile_termini_coloring(ref_obj, cmp_obj, chain, terminus, match_result,
                               ref_n_term_name, ref_c_term_name, cmp_n_term_name, cmp_c_term_name,
                               ref_pdb_id, cmp_pdb_id, cmp_chain=None):
    """Apply an ALREADY-APPROVED offset correction: physically remove the
    excluded residue(s) from whichever structure had them, then recolor
    both structures' terminus selections to the shared, offset-aligned
    window. Caller (TerminiExecution.run) is responsible for obtaining
    approval via prompt_terminus_offset_correction first -- this function
    no longer decides or asks anything itself, it only applies what's been
    approved. No-ops if offset is 0 (nothing to correct) -- callers should
    not reach this function at all in that case, but it's a safe no-op
    regardless.

    cmp_chain, if given, is the comparison structure's chain letter when it
    differs from `chain` (the reference's letter). Defaults to `chain`.
    """
    if cmp_chain is None:
        cmp_chain = chain
    if match_result is None or match_result.get("offset", 0) == 0:
        return

    if match_result.get("window_gap"):
        # Even the best-scoring offset can't supply a full window of
        # overlapping residues on both sides -- don't guess further or pad
        # with unrelated residues; just tell the user there will be a gap.
        print(f"{YELLOW}{terminus}-terminus: after aligning {ref_pdb_id} (chain {chain}) and "
              f"{cmp_pdb_id} (chain {cmp_chain}), there are fewer than {TERMINUS_WINDOW} corresponding "
              f"residues available at this terminus on at least one structure. The colored/labeled "
              f"window will be shorter than usual for this comparison rather than padded with unrelated "
              f"residues.{RESET}", flush=True)

    remove_excluded_terminus_residues(ref_obj, chain, match_result.get("reference_excluded_resi"), ref_pdb_id, terminus)
    remove_excluded_terminus_residues(cmp_obj, cmp_chain, match_result.get("comparison_excluded_resi"), cmp_pdb_id, terminus)

    apply_corrected_terminus_window(ref_obj, chain, terminus, match_result["reference_window_resi"],
                                    ref_n_term_name, ref_c_term_name)
    apply_corrected_terminus_window(cmp_obj, cmp_chain, terminus, match_result["comparison_window_resi"],
                                    cmp_n_term_name, cmp_c_term_name)


def prompt_terminus_mismatch(pdb_id_ref, pdb_id_cmp, chain, terminus, match_result, window=TERMINUS_WINDOW, cmp_chain=None):
    """Print a warning (never blocking, since TERMINI already reports
    numeric results independently of this check) when a terminus match is
    not confident, showing both structures' terminus sequences so the user
    can judge for themselves whether these are really the same terminus of
    the same protein. This is purely informational -- Astra3 does not
    decide for the user whether a mismatched terminus is scientifically
    meaningful; it only surfaces the sequences so a human can.
    """
    if cmp_chain is None:
        cmp_chain = chain
    chain_label = f"chain {chain}" if chain == cmp_chain else f"{pdb_id_ref} chain {chain} / {pdb_id_cmp} chain {cmp_chain}"
    print("-" * 50, flush=True)
    print(f"Terminus Sequence Check: {terminus}-terminus, {chain_label}", flush=True)
    print("-" * 50, flush=True)
    if match_result is None:
        print(f"{YELLOW}Could not compare {terminus}-terminus sequences for {pdb_id_ref} vs "
              f"{pdb_id_cmp}, {chain_label} (insufficient resolved residues).{RESET}", flush=True)
        print("", flush=True)
        return
    identity_pct = match_result["identity"] * 100.0
    if match_result["confident_match"]:
        offset_note = "" if match_result["offset"] == 0 else f" (after correcting for a {abs(match_result['offset'])}-residue offset)"
        print(f"{GREEN}Termini appear to correspond ({identity_pct:.0f}% identity over "
              f"{window} residues{offset_note}).{RESET}", flush=True)
    else:
        print(f"{YELLOW}Low sequence similarity at this terminus ({identity_pct:.0f}% identity, even "
              f"after testing offsets up to 10 residues). This may mean {pdb_id_ref} and {pdb_id_cmp} "
              f"do not share the same {terminus}-terminus, or that this region is highly divergent "
              f"between them. Numeric TERMINI results above are still reported, but treat this "
              f"terminus comparison with caution.{RESET}", flush=True)
        print(f"{WHITE}{pdb_id_ref} ({window} residues): {match_result['reference_seq']}{RESET}", flush=True)
        print(f"{WHITE}{pdb_id_cmp} ({window} residues): {match_result['comparison_seq']}{RESET}", flush=True)
    print("", flush=True)


def _build_terminus_metrics_dict(chain, ref_vecs, cmp_vecs, local_rmsd, sequence_match,
                                 offset_applied=None, comparison_chain=None,
                                 sasa_reference=None, sasa_comparison=None,
                                 bnorm_reference=None, bnorm_comparison=None,
                                 local_rmsd_detail=None):
    """Assemble one terminus's metrics dict from already-computed vector data.
    Shared by compare_termini's initial (naive) pass and
    recompute_terminus_metrics' offset-corrected pass, so the two paths can
    never produce a differently-shaped result or silently diverge in which
    fields get populated.

    offset_applied, if given, records {"reference": int, "comparison": int}
    -- the per-structure offsets actually used to compute this dict, so the
    report/JSON/CSV can show whether a given row reflects the raw window or
    a user-approved correction, rather than that being invisible after the
    fact.

    comparison_chain, if given, records the comparison structure's actual
    chain letter when it differs from `chain` (the reference's letter) --
    e.g. when match_chains_across_structures paired chains with different
    IDs. Defaults to `chain` so existing same-letter callers/reports are
    unaffected.

    sasa_reference/sasa_comparison (Å²) and bnorm_reference/bnorm_comparison
    are this terminus's SASA and normalized B-factor on each structure (see
    compute_terminus_sasa/compute_terminus_bnorm) -- None when unavailable
    (e.g. no B-factors present). \u0394SASA and \u0394Bnorm are derived here rather
    than by the caller, so every caller reports the same delta convention
    (comparison minus reference) and the same None-propagation behavior.
    """
    if comparison_chain is None:
        comparison_chain = chain
    if local_rmsd_detail is not None and local_rmsd is None:
        local_rmsd = local_rmsd_detail.get("rmsd")
    detail = local_rmsd_detail or {}
    # Residues the window-based metrics were actually measured over. The
    # window sizes are requests, not guarantees: only residues with
    # coordinates exist to be measured, so a 10-residue terminus window on a
    # chain whose last three residues are unresolved is a 7-residue
    # measurement. These counts make that visible in every output rather
    # than leaving the requested size to be assumed.
    ref_window_resi = ref_vecs.get("window_resi") or []
    cmp_window_resi = cmp_vecs.get("window_resi") or []
    tip_displacement = _vec_distance(ref_vecs["tip_coord"], cmp_vecs["tip_coord"])
    centroid_displacement = _vec_distance(ref_vecs["tip_centroid"], cmp_vecs["tip_centroid"])
    orientation_change = _angle_between(ref_vecs["orientation_vector"], cmp_vecs["orientation_vector"])
    tpv_angle_change = _angle_between(ref_vecs["tpv"], cmp_vecs["tpv"])

    delta_sasa = None
    if sasa_reference is not None and sasa_comparison is not None:
        delta_sasa = sasa_comparison - sasa_reference
    delta_bnorm = None
    if bnorm_reference is not None and bnorm_comparison is not None:
        delta_bnorm = bnorm_comparison - bnorm_reference

    return {
        "chain": chain,
        "comparison_chain": comparison_chain,
        "tip_resi_reference": ref_vecs["tip_resi"],
        "tip_resi_comparison": cmp_vecs["tip_resi"],
        "tip_displacement_angstrom": round(tip_displacement, 2),
        "centroid_displacement_angstrom": round(centroid_displacement, 2),
        "orientation_change_degrees": round(orientation_change, 1) if orientation_change is not None else None,
        "tpv_angle_change_degrees": round(tpv_angle_change, 1) if tpv_angle_change is not None else None,
        "tpv_window_residues": ref_vecs.get("tpv_residues"),
        "local_rmsd_angstrom": round(local_rmsd, 2) if local_rmsd is not None else None,
        "local_rmsd_refit_angstrom": (round(detail["rmsd_refit"], 2)
                                      if detail.get("rmsd_refit") is not None else None),
        "local_rmsd_residues_used": detail.get("residues_used"),
        "local_rmsd_residues_requested": detail.get("residues_requested"),
        "local_rmsd_pairing": detail.get("pairing"),
        "terminus_window_requested": TERMINUS_WINDOW,
        "terminus_window_measured_reference": len(ref_window_resi),
        "terminus_window_measured_comparison": len(cmp_window_resi),
        "reference_window_resi": list(ref_window_resi),
        "comparison_window_resi": list(cmp_window_resi),
        "reference_tip_coord": ref_vecs["tip_coord"],
        "comparison_tip_coord": cmp_vecs["tip_coord"],
        "reference_centroid": ref_vecs["tip_centroid"],
        "comparison_centroid": cmp_vecs["tip_centroid"],
        "reference_orientation_vector": ref_vecs["orientation_vector"],
        "comparison_orientation_vector": cmp_vecs["orientation_vector"],
        "reference_tpv": ref_vecs["tpv"],
        "comparison_tpv": cmp_vecs["tpv"],
        "sequence_match": sequence_match,
        "offset_applied": offset_applied,
        "sasa_reference_angstrom2": round(sasa_reference, 1) if sasa_reference is not None else None,
        "sasa_comparison_angstrom2": round(sasa_comparison, 1) if sasa_comparison is not None else None,
        "delta_sasa_angstrom2": round(delta_sasa, 1) if delta_sasa is not None else None,
        "sasa_classification": classify_sasa_shift(delta_sasa),
        "bnorm_reference": round(bnorm_reference, 3) if bnorm_reference is not None else None,
        "bnorm_comparison": round(bnorm_comparison, 3) if bnorm_comparison is not None else None,
        "delta_bnorm": round(delta_bnorm, 3) if delta_bnorm is not None else None,
        "bnorm_classification": classify_bnorm_shift(delta_bnorm),
    }


def recompute_terminus_metrics(ref_obj, cmp_obj, chain, terminus, sequence_match,
                               tip_n=TERMINUS_WINDOW // 2, orientation_n=TERMINUS_WINDOW // 2,
                               local_rmsd_window=TERMINUS_WINDOW, cmp_chain=None):
    """Recompute one terminus's full metrics dict after
    reconcile_termini_coloring has ALREADY physically removed the excluded
    residue(s) from whichever structure had them (see that function). This
    is the numeric counterpart to that visual/structural correction --
    called only after explicit user approval, so the report's numbers and
    the recolored selections are always measuring the same window rather
    than silently disagreeing.

    Because the excluded residues are already gone from the object by the
    time this runs, no offset is applied here (offset=0 on both sides):
    get_ordered_ca_coords naturally returns the already-corrected window as
    the plain first/last N residues. Applying sequence_match["offset"]
    again on top of already-removed atoms would double-skip residues.

    cmp_chain, if given, is the comparison structure's chain letter when it
    differs from `chain` (the reference's letter). Defaults to `chain`.
    """
    if cmp_chain is None:
        cmp_chain = chain

    ref_coords = get_ordered_ca_coords(ref_obj, chain)
    cmp_coords = get_ordered_ca_coords(cmp_obj, cmp_chain)
    ref_vecs = compute_terminus_vectors(ref_coords, terminus, tip_n, orientation_n, offset=0)
    cmp_vecs = compute_terminus_vectors(cmp_coords, terminus, tip_n, orientation_n, offset=0)
    if ref_vecs is None or cmp_vecs is None:
        return None
    rmsd_detail = compute_local_terminal_rmsd_detail(ref_obj, cmp_obj, chain, terminus, local_rmsd_window,
                                                     ref_offset=0, cmp_offset=0, cmp_chain=cmp_chain,
                                                     residue_pairs=(sequence_match or {}).get("residue_pairs"))
    local_rmsd = rmsd_detail["rmsd"] if rmsd_detail else None
    sasa_ref = compute_terminus_sasa(ref_obj, chain, ref_vecs.get("window_resi"))
    sasa_cmp = compute_terminus_sasa(cmp_obj, cmp_chain, cmp_vecs.get("window_resi"))
    bnorm_ref = compute_terminus_bnorm(ref_obj, chain, ref_vecs.get("window_resi"))
    bnorm_cmp = compute_terminus_bnorm(cmp_obj, cmp_chain, cmp_vecs.get("window_resi"))
    removed_offset = sequence_match.get("offset", 0)
    offset_applied = {
        "reference": max(0, -removed_offset),
        "comparison": max(0, removed_offset),
        "residues_physically_removed": True,
    }
    return _build_terminus_metrics_dict(chain, ref_vecs, cmp_vecs, local_rmsd, sequence_match,
                                        offset_applied=offset_applied,
                                        comparison_chain=cmp_chain,
                                        sasa_reference=sasa_ref, sasa_comparison=sasa_cmp,
                                        bnorm_reference=bnorm_ref, bnorm_comparison=bnorm_cmp,
                                        local_rmsd_detail=rmsd_detail)


def compare_termini(ref_obj, cmp_obj, chain, tip_n=TERMINUS_WINDOW // 2, orientation_n=TERMINUS_WINDOW // 2, local_rmsd_window=TERMINUS_WINDOW, cmp_chain=None):
    """Compute all TERMINI metrics for one chain, comparing cmp_obj against
    ref_obj (both must already be aligned into the same coordinate frame,
    e.g. via cmd.align). Returns a dict with "N" and "C" keys, each either
    a metrics dict or None if that terminus couldn't be measured (too few
    residues, no shared numbering, etc.) -- callers should report those
    explicitly as unavailable rather than omitting them silently.

    cmp_chain, if given, is the comparison structure's chain letter when it
    differs from `chain` (the reference's letter) -- e.g. when
    match_chains_across_structures paired chains with different letters.
    Defaults to `chain` for full backward compatibility.

    This always computes the RAW/naive window (offset=0 on both sides) --
    it does not apply any sequence-based correction itself. Each result's
    "sequence_match" field carries the match_terminus_windows finding for
    that terminus; callers that want the corrected numbers (after user
    approval) should call recompute_terminus_metrics with that same
    sequence_match once approved.
    """
    if cmp_chain is None:
        cmp_chain = chain
    ref_coords = get_ordered_ca_coords(ref_obj, chain)
    cmp_coords = get_ordered_ca_coords(cmp_obj, cmp_chain)

    result = {"N": None, "C": None}
    for terminus in ("N", "C"):
        ref_vecs = compute_terminus_vectors(ref_coords, terminus, tip_n, orientation_n)
        cmp_vecs = compute_terminus_vectors(cmp_coords, terminus, tip_n, orientation_n)
        if ref_vecs is None or cmp_vecs is None:
            continue

        # The sequence match is resolved first: it supplies the residue
        # correspondence the RMSD pairing depends on.
        try:
            sequence_match = match_terminus_windows(ref_obj, cmp_obj, chain, terminus, window=tip_n + orientation_n, cmp_chain=cmp_chain)
        except Exception as e:
            # Print so the cause is diagnosable instead of invisible.
            print(f"{YELLOW}Terminus sequence matching failed for chain {chain}/{cmp_chain} ({terminus}-terminus): "
                  f"{type(e).__name__}: {e}{RESET}", flush=True)
            sequence_match = None

        rmsd_detail = compute_local_terminal_rmsd_detail(ref_obj, cmp_obj, chain, terminus, local_rmsd_window,
                                                         cmp_chain=cmp_chain,
                                                         residue_pairs=(sequence_match or {}).get("residue_pairs"))
        local_rmsd = rmsd_detail["rmsd"] if rmsd_detail else None

        # Solvent accessibility and flexibility shifts at this terminus,
        # computed over the same TERMINUS_WINDOW-sized window as the
        # coloring/report (ref_vecs["window_resi"]/cmp_vecs["window_resi"]),
        # in the FULL loaded object so real burial context (other chains,
        # ligands) is reflected -- see compute_terminus_sasa's docstring.
        sasa_ref = compute_terminus_sasa(ref_obj, chain, ref_vecs.get("window_resi"))
        sasa_cmp = compute_terminus_sasa(cmp_obj, cmp_chain, cmp_vecs.get("window_resi"))
        bnorm_ref = compute_terminus_bnorm(ref_obj, chain, ref_vecs.get("window_resi"))
        bnorm_cmp = compute_terminus_bnorm(cmp_obj, cmp_chain, cmp_vecs.get("window_resi"))

        result[terminus] = _build_terminus_metrics_dict(chain, ref_vecs, cmp_vecs, local_rmsd, sequence_match,
                                                         offset_applied={"reference": 0, "comparison": 0},
                                                         comparison_chain=cmp_chain,
                                                         sasa_reference=sasa_ref, sasa_comparison=sasa_cmp,
                                                         bnorm_reference=bnorm_ref, bnorm_comparison=bnorm_cmp,
                                                         local_rmsd_detail=rmsd_detail)
    return result



# Terminus arrow colours (REFERENCE_ARROW_COLORS, COMPARISON_ARROW_COLORS) are
# defined with the other palettes in astra3_core.


def comparison_arrow_colors(index):
    """(N-terminus, C-terminus) arrow colours for the index-th comparison.

    The list wraps, so the number of comparisons in a run is never capped
    by it.
    """
    return COMPARISON_ARROW_COLORS[max(0, index) % len(COMPARISON_ARROW_COLORS)]


def draw_termini_vectors(cgo_name, comparison_results, vector_length=8.0, dash_length=0.3, dash_gap=0.15,
                         shaft_radius=0.15, head_radius=0.35, comparison_index=0):
    """Draw CGO objects visualizing terminus orientation vectors and
    centroid-to-centroid displacement for one comparison structure's results
    (the per-chain dict returned by compare_termini).

    Each arrow is that structure's orientation vector (see
    compute_terminus_vectors), the overall direction of its last ten
    residues, drawn pointing out of the protein at both termini. The angle
    between a reference arrow and a comparison arrow is the orientation
    change.

    Color scheme:
      Reference N vector: orange    Reference C vector: pink
      Comparison vectors: one pair per comparison (comparison_arrow_colors)
      Centroid displacement: dashed white line
    (N-/C-terminus TIP RESIDUES themselves stay green/red -- that is a
    separate, always-on coloring from apply_terminus_colors, not these
    vectors; see the report's own legend text for the same distinction.)

    Each vector is drawn as a genuine arrow (cylinder shaft + cone head,
    matching the reference TPV-visualization snippet this was checked
    against) rather than a plain CGO line -- a bare LINES primitive has
    no arrowhead and reads as a thin, directionless stick regardless of
    color, which is what this replaces.

    Vectors are drawn anchored at each structure's tip centroid, scaled
    to a fixed on-screen length (vector_length, in Å) rather than the
    vector's raw magnitude, since vectors from a few Å of Cα atoms
    window of Cα atoms are already short and a raw-length arrow would
    be hard to see; only the *direction* is meaningful for this
    visualization, not the drawn length.

    Returns the CGO object name on success, or None if nothing could be
    drawn (e.g. every chain returned None from compare_termini).
    """
    try:
        from pymol import cgo
    except Exception:
        return None

    # The reference's pair; each comparison's comes from comparison_arrow_colors.
    COLOR_REF_N = REFERENCE_ARROW_COLORS[0]     # orange by default
    COLOR_REF_C = REFERENCE_ARROW_COLORS[1]     # pink by default
    COLOR_DASH = (0.85, 0.85, 0.85)   # light grey/white dashed connector

    def _arrow_segment(origin, direction, color):
        # A real arrow -- cylinder shaft + cone head -- not a bare CGO line.
        # Signature against PyMOL's own CGO primitive reference (CYLINDER:
        # x1,y1,z1, x2,y2,z2, radius, r1,g1,b1, r2,g2,b2 -- two colors for a
        # gradient, same color used for both ends here; CONE: x1,y1,z1,
        # x2,y2,z2, radius1, radius2, r1,g1,b1, r2,g2,b2, cap1, cap2),
        # matching the same construction as the reference TPV-arrow snippet
        # this was checked against.
        mag = _vec_mag(direction)
        if mag == 0:
            return []
        unit = _vec_scale(direction, 1.0 / mag)
        tip = _vec_add(origin, _vec_scale(unit, vector_length))
        head_len = min(vector_length * 0.35, 2.5)
        shaft_end = _vec_add(origin, _vec_scale(unit, vector_length - head_len))
        r, g, b = color
        return [
            cgo.CYLINDER, origin[0], origin[1], origin[2], shaft_end[0], shaft_end[1], shaft_end[2],
            shaft_radius, r, g, b, r, g, b,
            cgo.CONE, shaft_end[0], shaft_end[1], shaft_end[2], tip[0], tip[1], tip[2],
            head_radius, 0.0, r, g, b, r, g, b, 1.0, 0.0,
        ]

    def _dashed_segment(a, b, color):
        total = _vec_distance(a, b)
        if total == 0:
            return []
        direction = _vec_scale(_vec_sub(b, a), 1.0 / total)
        segments = []
        t = 0.0
        drawing = True
        while t < total:
            step = dash_length if drawing else dash_gap
            t_next = min(t + step, total)
            if drawing:
                p1 = _vec_add(a, _vec_scale(direction, t))
                p2 = _vec_add(a, _vec_scale(direction, t_next))
                segments += [
                    cgo.VERTEX, p1[0], p1[1], p1[2],
                    cgo.VERTEX, p2[0], p2[1], p2[2],
                ]
            t = t_next
            drawing = not drawing
        if not segments:
            return []
        return [
            cgo.LINEWIDTH, 1.5,
            cgo.BEGIN, cgo.LINES,
            cgo.COLOR, color[0], color[1], color[2],
        ] + segments + [cgo.END]

    def _outward(vector, terminus):
        # Orientation vectors run N-to-C, which at an N-terminus points into
        # the protein. Arrows are drawn pointing out of it at both ends; the
        # angle between two arrows, the orientation change, is the same
        # either way.
        return vector if terminus == "C" else tuple(-v for v in vector)

    obj_data = []
    for chain, per_terminus in comparison_results.items():
        for terminus, metrics in per_terminus.items():
            if metrics is None:
                continue
            cmp_n_color, cmp_c_color = comparison_arrow_colors(comparison_index)
            ref_color = COLOR_REF_N if terminus == "N" else COLOR_REF_C
            cmp_color = cmp_n_color if terminus == "N" else cmp_c_color

            ref_arrow = _arrow_segment(metrics["reference_centroid"],
                                       _outward(metrics["reference_orientation_vector"], terminus), ref_color)
            cmp_arrow = _arrow_segment(metrics["comparison_centroid"],
                                       _outward(metrics["comparison_orientation_vector"], terminus), cmp_color)
            obj_data += ref_arrow
            obj_data += cmp_arrow
            obj_data += _dashed_segment(metrics["reference_centroid"], metrics["comparison_centroid"], COLOR_DASH)

            # An arrow pair with one arrow missing is the hard case to read: a
            # close-up showing one arrow looks like a finished picture, so the
            # absent one reads as a rendering fault rather than as a terminus
            # whose orientation vector could not be measured. The warning above
            # only fires when NOTHING at all was drawable, which is why a
            # single missing arrow passed without comment.
            for label, drawn_arrow in (("reference", ref_arrow), ("comparison", cmp_arrow)):
                if not drawn_arrow:
                    print(f"{YELLOW}No {terminus}-terminus arrow drawn for the {label} structure "
                          f"(chain {chain}): its orientation vector has zero length, so it has no "
                          f"direction to point in. The other arrow and the connecting line are "
                          f"unaffected.{RESET}", flush=True)

    # Check the actual accumulated CGO data, not a separately-tracked flag --
    # _arrow_segment/_dashed_segment can each legitimately return [] (e.g. a
    # zero-magnitude orientation vector, or identical centroids), and a flag
    # set unconditionally inside the loop would desync from whether any
    # segment actually contributed real geometry. cmd.load_cgo([], name) does
    # not raise, but also does not register a selectable object -- calling
    # code must never receive a name back that isn't real, or later selections
    # referencing it (e.g. during rendering) fail with Selector-Error.
    if not obj_data:
        print(f"{YELLOW}TERMINI visualization skipped for '{cgo_name}': no drawable vectors "
              f"(every terminus had a zero-length orientation vector or identical centroids).{RESET}", flush=True)
        return None

    try:
        cmd.load_cgo(obj_data, cgo_name)
        import astra3_window
        astra3_window.remember_cgo(cgo_name, obj_data)
    except Exception as e:
        print(f"{YELLOW}TERMINI visualization skipped for '{cgo_name}': cmd.load_cgo raised: {e}{RESET}", flush=True)
        return None

    try:
        existing_names = cmd.get_names("objects")
    except Exception as e:
        print(f"{YELLOW}TERMINI visualization skipped for '{cgo_name}': could not verify it was "
              f"created (cmd.get_names raised: {e}).{RESET}", flush=True)
        return None
    if cgo_name not in existing_names:
        print(f"{YELLOW}TERMINI visualization skipped for '{cgo_name}': cmd.load_cgo did not raise, "
              f"but no object by that name exists afterward (cmd.get_names('objects') returned "
              f"{len(existing_names)} name(s), this one was not among them). Continuing without "
              f"the vector overlay for this comparison; the numeric TERMINI results above are "
              f"unaffected.{RESET}", flush=True)
        return None

    return cgo_name


def report_binding_sites(obj, ligand_info, ligand_environment=None):
    """Build the BINDING SITE INFORMATION text section.

    ligand_environment, if provided, must be the return value of
    analyze_ligand_environment(obj, ligand_info) -- passing it in avoids
    recomputing the same PyMOL geometry twice when both the TXT report and
    another export (HTML/CSV/JSON) need this data in the same run. If not
    provided, it is computed here so this function still works standalone.
    """
    lines = []
    lines.append("BINDING SITE INFORMATION")
    lines.append("-" * 60)
    lines.append("Nearby residues: any protein residue with an atom within 4.0 Å")
    lines.append("of the ligand. Possible polar atom pairs: ligand N/O atoms within")
    lines.append("3.5 Å of protein N/O atoms. These are geometric atom pairs only and do")
    lines.append("not confirm hydrogen bonds, donor/acceptor status, or specific")
    lines.append("interactions.")
    lines.append("Detailed interaction typing, such as salt bridges,")
    lines.append("pi-stacking, and pi-cation contacts, requires dedicated interaction")
    lines.append("analysis tools (e.g. PLIP, Arpeggio) and is not computed here.")
    lines.append("")
    if not ligand_info:
        lines.append("No ligands to report on.")
        lines.append("")
        return lines

    if ligand_environment is None:
        ligand_environment = analyze_ligand_environment(obj, ligand_info)

    for lig in ligand_info:
        sel_name = lig["sel_name"]
        env = ligand_environment.get(sel_name, {})
        near_unique = env.get("nearby_residues") or []
        polar_count = env.get("polar_contact_count")
        if polar_count is None:
            polar_count = "Not available"

        lines.append(sel_name + " (" + chain_label(lig["chain"]) + ", residue " + lig["resi"] + "):")
        if lig.get("identity_confirmed") is False:
            lines.append("  Warning: insertion code or ambiguous residue numbering detected; ligand identity and automatic naming cannot be fully confirmed.")
        lines.append("  Nearby residues (within 4.0 Å): " + str(len(near_unique)))
        for r in near_unique:
            lines.append("    " + _sentence_start(chain_label(r["chain"])) + ", " + r["resn"] + r["resi"])
        lines.append("  Possible polar atom pairs (N/O within 3.5 Å): " + str(polar_count))
        polar_contacts = env.get("polar_contacts")
        if polar_contacts:
            for pc in polar_contacts:
                dist_str = f"{pc['distance_angstrom']} Å" if pc.get("distance_angstrom") is not None else "distance not available"
                lines.append(f"    {pc['ligand_atom']} ... {pc['protein_resn']}{pc['protein_resi']} ({chain_label(pc['protein_chain'])}) {pc['protein_atom']}, {dist_str}")
        overlapping = env.get("overlapping_pairs") or []
        if overlapping:
            lines.append(f"  Left out: {len(overlapping)} N/O pair(s) closer than {POLAR_CONTACT_MIN_DISTANCE} Å, which no "
                         f"real contact can be -- overlapping atom positions, usually alternative conformations the "
                         f"depositor labelled with the same letter:")
            for pc in overlapping:
                lines.append(f"    {pc['ligand_atom']} ... {pc['protein_resn']}{pc['protein_resi']} ({chain_label(pc['protein_chain'])}) "
                             f"{pc['protein_atom']}, {pc['distance_angstrom']} Å")
    lines.append("")
    return lines


def report_ions(obj, ion_info):
    lines = []
    lines.append("IONS")
    lines.append("-" * 60)
    lines.append("Coordinating atoms: protein N/O/S atoms within 2.6 Å of the")
    lines.append("ion (one fixed geometric cutoff for every ion; longer contacts are not counted).")
    lines.append("")
    if not ion_info:
        lines.append("None detected.")
        lines.append("")
        return lines

    for ion in ion_info:
        sel_name = ion["sel_name"]
        coordinating = []
        for ion_state, prot_state in conformation_pairs(sel_name, obj + " and polymer.protein"):
            cmd.iterate("(" + prot_state + " and (elem O+N+S)) within 2.6 of (" + ion_state + ")",
                        "coordinating.append((chain, resi, resn, name))", space={'coordinating': coordinating})
        coord_unique = sorted(set(coordinating))

        lines.append(sel_name + " (" + ion["resn"] + ", " + chain_label(ion["chain"]) + ", residue " + ion["resi"] + "):")
        if coord_unique:
            for c, ri, rn, an in coord_unique:
                lines.append("    " + _sentence_start(chain_label(c)) + ", " + rn + ri + ", atom " + an)
        else:
            lines.append("    No coordinating protein atoms found within 2.6 Å.")
    lines.append("")
    return lines


NUCLEIC_TYPES = {"DA": "DNA", "DC": "DNA", "DG": "DNA", "DT": "DNA", "DI": "DNA", "DU": "DNA",
                 "A": "RNA", "C": "RNA", "G": "RNA", "U": "RNA", "I": "RNA"}


def nucleic_acid_chains(obj):
    """{chain: (kind, residue count)} for DNA/RNA polymer chains. These are
    macromolecules, not hetero groups, and are described as such."""
    rows = []
    try:
        cmd.iterate(f"({obj}) and polymer.nucleic and name P+C1'", "rows.append((chain, resi, resn))", space={"rows": rows})
    except Exception:
        return {}
    per_chain = {}
    for chain, resi, resn in rows:
        per_chain.setdefault(chain, {})[resi] = resn
    out = {}
    for chain, residues in per_chain.items():
        kinds = {NUCLEIC_TYPES.get(r, "nucleic acid") for r in residues.values()}
        out[chain] = ("DNA" if kinds == {"DNA"} else "RNA" if kinds == {"RNA"} else "nucleic acid", len(residues))
    return out


def report_hetatm_audit(obj, process_result):
    lines = []
    lines.append("HETATM AUDIT")
    lines.append("-" * 60)

    atom_records = []
    hetatm_records = []

    cmd.iterate(obj + " and polymer.protein",
                "atom_records.append(1)",
                space={'atom_records': atom_records})

    # Hetero groups only: DNA and RNA chains are polymers, reported below,
    # not unclassified residues (1AAY listed DA/DC/DG/DT here).
    cmd.iterate(obj + " and not polymer.protein and not polymer.nucleic and not resn HOH",
                "hetatm_records.append((resn, resi))",
                space={'hetatm_records': hetatm_records})
    nucleic = nucleic_acid_chains(obj)

    unclassified = []
    known_ligands = set(l["resn"] for l in process_result.get("ligand_info", []))
    known_ions = set(i["resn"] for i in process_result.get("ion_info", []))

    for resn, resi in set(hetatm_records):
        if resn not in known_ligands and resn not in known_ions:
            unclassified.append(resn)

    lines.append("ATOM records analyzed: " + str(len(atom_records)) + " records")
    lines.append("HETATM records analyzed: " + str(len(hetatm_records)) + " records")
    lines.append("Protein chains detected: " + str(len(process_result.get("chain_list", []))) + " chains")
    if nucleic:
        lines.append("Nucleic-acid chains detected: " + ", ".join(
            f"{c} ({kind}, {n} nucleotides)" for c, (kind, n) in sorted(nucleic.items())))
    lines.append("Ligands detected: " + str(len(process_result.get("ligand_info", []))) + " ligands")
    lines.append("Ions detected: " + str(len(process_result.get("ion_info", []))) + " ions")
    lines.append("Water molecules removed: " + str(process_result.get("water_removed", "Not available")) + " molecules")
    if unclassified:
        lines.append("Unclassified hetero residues: " + ", ".join(sorted(set(unclassified))))
    else:
        lines.append("Unclassified hetero residues: None detected")
    lines.append("")
    return lines

def report_domains(annotations=None):
    lines = []
    lines.append("DOMAINS")
    lines.append("-" * 60)
    if annotations is not None:
        from astra3_annotations import text_domain_lines
        lines.extend(text_domain_lines(annotations.get("rcsb")))
        lines.append("")
        return lines
    lines.append("Domain boundaries cannot be confidently determined from structure")
    lines.append("coordinates alone. This normally requires a domain-annotation")
    lines.append("database (e.g. Pfam, InterPro, CATH/SCOP), which is not queried by")
    lines.append("this script.")
    lines.append("")
    return lines

def report_disulfides(obj):
    lines = []
    lines.append("DISULFIDE BONDS")
    lines.append("-" * 60)
    sg_atoms = []
    cmd.iterate_state(1, obj + " and resn CYS and name SG and q > 0",
                       "sg_atoms.append((chain, resi, alt, x, y, z))",
                       space={'sg_atoms': sg_atoms})
    bonds = []
    seen_pairs = set()
    for a in range(len(sg_atoms)):
        for b in range(a + 1, len(sg_atoms)):
            c1, r1, a1, x1, y1, z1 = sg_atoms[a]
            c2, r2, a2, x2, y2, z2 = sg_atoms[b]
            # Two conformations of one cysteine are not a disulfide, and
            # conformations of different cysteines that never coexist are not
            # bonded to each other.
            if (c1, r1) == (c2, r2) or (a1 and a2 and a1 != a2):
                continue
            dist = ((x1 - x2) ** 2 + (y1 - y2) ** 2 + (z1 - z2) ** 2) ** 0.5
            key = tuple(sorted([(c1, r1), (c2, r2)]))
            if dist <= 2.5 and key not in seen_pairs:
                seen_pairs.add(key)
                bonds.append((c1, r1, c2, r2, dist))
    if bonds:
        for c1, r1, c2, r2, dist in bonds:
            lines.append("  Chain %s Cys%s to Chain %s Cys%s (%.2f Å)" % (c1, r1, c2, r2, dist))
    else:
        lines.append("  None detected (no SG-SG pairs within 2.5 Å).")
    lines.append("")
    return lines

def report_mutations(annotations=None, chains=None):
    lines = []
    lines.append("MUTATIONS")
    lines.append("-" * 60)
    if annotations is not None:
        from astra3_annotations import text_mutation_lines
        lines.extend(text_mutation_lines(annotations.get("file"), annotations.get("rcsb"), chains))
        lines.append("")
        return lines
    lines.append("Not available. Identifying mutations relative to the deposited")
    lines.append("construct requires comparing this structure against an external")
    lines.append("reference sequence (e.g. UniProt), which this script does not query.")
    lines.append("")
    return lines

def report_crystal_contacts():
    lines = []
    lines.append("CRYSTAL CONTACTS")
    lines.append("-" * 60)
    lines.append("Not computed in this version. Crystal contacts require generating")
    lines.append("symmetry mates from the file's space group (" +
                 ("ChimeraX's sym command" if engine_name() == "ChimeraX" else "PyMOL's cmd.symexp") + " can")
    lines.append("do this when CRYST1 data is present) and are a reasonable candidate")
    lines.append("for a future update.")
    lines.append("")
    return lines

def residue_ca_bfactors(selection):
    """[(chain, resi, resn, B)] with one entry per residue: the
    occupancy-weighted B of its observed Cα atoms. A residue modeled in
    alternate conformations has several Cα atoms; listing each would count
    it twice in averages and rankings."""
    rows = []
    cmd.iterate(f"({selection}) and polymer.protein and name CA and q > 0",
                "rows.append((chain, resi, resn, b, q))", space={"rows": rows})
    acc = {}
    order = []
    for chain, resi, resn, b, q in rows:
        key = (chain, resi)
        if key not in acc:
            acc[key] = [resn, 0.0, 0.0]
            order.append(key)
        acc[key][1] += b * q
        acc[key][2] += q
    return [(c, r, acc[(c, r)][0], acc[(c, r)][1] / acc[(c, r)][2]) for c, r in order if acc[(c, r)][2] > 0]


def report_flexibility(obj, method=None):
    lines = []
    lines.append("FLEXIBILITY (B-FACTOR)")
    lines.append("-" * 60)
    lines.append("Per-residue B-factor from the deposited structure (CA atoms; residues with zero")
    lines.append("occupancy were not observed and are excluded).")
    b_list = residue_ca_bfactors(obj)
    if not b_list:
        lines.append("No data available.")
        lines.append("")
        return lines
    # An NMR entry's B-factor column, or one left at zero, holds no
    # displacement factors to rank residues by.
    note = b_factor_summary([b for _c, _r, _n, b in b_list], method)[3]
    if note:
        lines.append(note + ".")
        lines.append("")
        return lines

    most_flexible = sorted(b_list, key=lambda x: x[3], reverse=True)[:10]
    most_rigid = sorted(b_list, key=lambda x: x[3])[:10]

    lines.append("Most flexible residues (highest B-factor):")
    for c, ri, rn, b in most_flexible:
        lines.append("  Chain %s, %s%s: B = %.2f" % (c, rn, ri, b))
    lines.append("Most rigid residues (lowest B-factor):")
    for c, ri, rn, b in most_rigid:
        lines.append("  Chain %s, %s%s: B = %.2f" % (c, rn, ri, b))
    lines.append("")
    return lines

def report_structure_validation(header_info, annotations=None):
    lines = []
    lines.append("STRUCTURE VALIDATION")
    lines.append("-" * 60)
    # The depositor's values from the coordinate file, falling back to the
    # refinement statistics RCSB reports when the file header has none.
    validation = ((annotations or {}).get("rcsb") or {}).get("validation") or {}
    for label, header_key, rcsb_key in (("R-work", "r_work", "r_work"), ("R-free", "r_free", "r_free")):
        value = header_info.get(header_key)
        if value and "not found" not in str(value).lower():
            # mmCIF stores these as e.g. 0.2280000; R-factors read to three
            # decimals. Anything that is not a number is shown as written.
            try:
                value = f"{float(value):.3f}"
            except (TypeError, ValueError):
                pass
            kind = " -- reported as the overall R-value; the entry has no test set" if (
                header_key == "r_work" and (header_info or {}).get("r_work_kind") == "observed") else ""
            lines.append(f"{label}: {value} (depositor, from the file header{kind})")
        elif validation.get(rcsb_key) is not None:
            lines.append(f"{label}: {validation[rcsb_key]:.3f} (from RCSB PDB's refinement record; not in the file header)")
        else:
            lines.append(f"{label}: not reported for this entry")
    if annotations is not None:
        from astra3_annotations import text_validation_lines
        lines.extend(text_validation_lines(annotations.get("rcsb")))
        lines.append("")
        return lines
    lines.append("Ramachandran statistics: Not available (requires an external")
    lines.append("  validation tool, e.g. MolProbity, not run by this script).")
    lines.append("Clashscore: Not available (same limitation as above).")
    lines.append("")
    return lines

def report_water_summary(process_result):
    lines = []
    lines.append("WATER REMOVAL SUMMARY")
    lines.append("-" * 60)
    lines.append("Water molecules detected: " + str(process_result.get("water_detected", "Not available")))
    lines.append("Water molecules removed: " + str(process_result.get("water_removed", "Not available")))
    lines.append("")
    return lines

def build_protein_information(obj, header_info, process_result, ligand_environment=None, chain_reduction=None,
                              annotations=None, homomer_rule=None):
    lines = []
    obj = obj.upper()
    lines.append(obj + " INFORMATION REPORT")
    lines.append("PDB ID: " + obj)
    lines.append("Generated: " + display_date(with_time=True))
    lines.append("Coordinate file: " + coordinate_file_line(header_info))
    lines.append("=" * 60)
    lines.append("")
    lines.append("EXPERIMENTAL INFORMATION")
    lines.append("-" * 60)
    lines.append("Experimental Method: " + format_method(header_info))
    lines.append("Resolution: " + resolution_display(header_info))
    lines.append("Resolution classification: " + resolution_classification(header_info.get("resolution")))
    lines.append("")
    lines.append("General guide:")
    lines.append("  < 1.5 Å : Exceptional")
    lines.append("  1.5-2.0 Å : Excellent")
    lines.append("  2.0-2.5 Å : Good")
    lines.append("  2.5-3.0 Å : Moderate")
    lines.append("  3.0 Å or more : Lower classification for atomic details")
    lines.append("")

    lines.extend(report_biological_assembly(obj, process_result["chain_list"], chain_reduction=chain_reduction,
                                            assemblies=((annotations or {}).get("file") or {}).get("assemblies"),
                                            homomer_rule=homomer_rule))
    lines.extend(report_sequence_info(obj, process_result["chain_list"]))
    lines.extend(report_secondary_structure(obj, process_result["chain_list"]))
    lines.extend(report_ligands(process_result["ligand_info"]))
    lines.extend(report_water_summary(process_result))
    lines.extend(report_hetatm_audit(obj, process_result))
    lines.extend(report_binding_sites(obj, process_result["ligand_info"], ligand_environment=ligand_environment))
    lines.extend(report_ions(obj, process_result["ion_info"]))
    lines.extend(report_domains(annotations))
    lines.extend(report_disulfides(obj))
    lines.extend(report_mutations(annotations, process_result.get("chain_list")))
    lines.extend(report_crystal_contacts())
    lines.extend(report_flexibility(obj, header_info.get("method")))
    lines.extend(report_structure_validation(header_info, annotations))

    lines.append("ADDITIONAL INFORMATION")
    lines.append("-" * 60)
    lines.append("N-Terminus selection: first %d resolved residues per chain (%d total)"
                  % (TERMINUS_WINDOW, process_result["n_terminus_count"]))
    lines.append("C-Terminus selection: last %d resolved residues per chain (%d total)"
                  % (TERMINUS_WINDOW, process_result["c_terminus_count"]))
    lines.append(f"Report generated by Astra3 using {engine_name()} and the")
    lines.append("PDB header of the fetched structure. Sections marked as unavailable")
    lines.append("were left unavailable rather than estimated.")
    lines.append("")

    return "\n".join(lines)



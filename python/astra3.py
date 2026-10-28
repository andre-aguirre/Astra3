# ============================================================
# astra3.py
# Structural Analysis Toolkit for PDB Rendering Automation
# Created by Andre Aguirre
# Copyright (c) 2026 Andre Aguirre
# If Astra3 contributes to published research, please cite:
# Aguirre A. Astra3: Structural Analysis Toolkit for PDB Rendering Automation. 2026.
# Licensed under the GNU General Public License, version 3 or later (GPL-3.0-or-later).
# See LICENSE file for details.
# LinkedIn: https://www.linkedin.com/in/andre-alain-aguirre/
#
# Structural biology batch pipeline for PyMOL.
#
# For each PDB ID entered, this script:
#   - fetches the structure
#   - removes water
#   - colors + names every protein chain, ligand, and ion
#     (same color always reused for the same chain/ligand/ion
#     name across every structure processed in this run)
#   - selects/colors the first and last 10 resolved residues of each
#     protein chain as N-Terminus / C-Terminus
#   - saves a finished PyMOL session (.pse), falling back to a
#     plain .pdb only if the .pse save fails
#   - renders 6 high-resolution, transparent-background images
#   - writes a Protein_Information.txt report built only from
#     data actually available in PyMOL and the PDB header (no
#     fabricated values -- sections that can't be determined
#     say so explicitly)
#
# Special commands (typed at the "Enter a PDB ID" prompt):
#   DONE   - finish and quit
#   -t     - runs a full analysis of 1AKE into a single,
#            always-overwritten TEST/ folder (regression check)
#   OVERLAY  - aligns multiple structures through the registered
#            overlay-operation dispatcher
#
# Folder layout produced (per PDB ID):
#   <ID>Protein_outputs/
#	Astra3_Report.html
#       Session/
#           <ID>.pse   (or <ID>.pdb if .pse saving fails)
#           Protein_Information.txt
#       Images/
#           view_front.png, view_back.png, ... (6 angles)
#
# ------------------------------------------------------------
# MODULE: Entry point & orchestration
# ------------------------------------------------------------
# This is the file you run in PyMOL. It contains:
#   - load_structure_source / _run_single_analysis / run_single_analysis
#   - the OVERLAY pipeline: OverlayRequest, OverlayOperationRegistry,
#     OverlayExecution, AlignmentOverlayHandler, and the OVERLAY command
#     parsers
#   - the interactive command loop (the "Enter a PDB ID" prompt)
#
# Astra3 is split across four files that must stay together in
# the same folder:
#   astra3_core.py           - shared constants, paths, registry
#   astra3_structure.py      - structure analysis / processing
#   astra3_render_report.py  - image rendering & HTML report
#   astra3.py                - this file: orchestration + main loop
# ------------------------------------------------------------

import os
import re
import sys

# These modules sit inside the installed app, and the engine that imports
# them runs on Astra3's behalf. Writing bytecode next to them modifies an
# installed app, which macOS blocks and reports to the user.
sys.dont_write_bytecode = True
import time
import itertools
import difflib
from dataclasses import dataclass
from pathlib import Path

# astra3.py is always shipped in the same folder as its sibling modules
# (astra3_core.py, astra3_structure.py, astra3_render_report.py). PyMOL runs
# this file by exec'ing its source into a namespace it reuses across every
# `run` invocation, NOT via a real Python import -- so sys.path never gets
# this folder added automatically, and the sibling imports below fail with
# ModuleNotFoundError unless PyMOL's cwd happens to already be this folder.
#
# The correct, reliable way to find this file's own path here is __script__,
# NOT __file__. PyMOL's own parsing.py sets global_ns['__script__'] = file
# immediately before exec'ing the script's source -- this is freshly
# overwritten on every single `run` invocation, so it is always this exact
# file's real path, however Astra3 was launched (an interactive `run
# astra3.py`, or PyMOL spawned directly with `-cq astra3.py` as
# pymol-bridge.js does).
#
# __file__ is NOT a safe substitute here: plain exec() with a compiled
# filename does NOT auto-populate __file__ (verified directly -- a bare exec()
# leaves it undefined, raising NameError if referenced). Yet `global_ns` is
# the SAME dict PyMOL reuses across every `run` call in a session, so if
# __file__ was ever set in it by something else (PyMOL's own startup, an
# earlier script, an earlier import) it can persist as a stale leftover with
# no connection to astra3.py at all -- silently resolving to the wrong
# directory rather than raising, which is the failure mode this
# replaces: no crash on this line, but sys.path gets the wrong folder added,
# and the very next import still fails with ModuleNotFoundError.
_this_script = globals().get("__script__") or globals().get("__file__")
if _this_script:
    _THIS_DIR = os.path.dirname(os.path.abspath(_this_script))
    if _THIS_DIR not in sys.path:
        sys.path.insert(0, _THIS_DIR)
else:
    # Neither is set -- extremely unlikely for any real launch path (both the
    # GUI's spawn and a manual `run astra3.py` set __script__), but if it ever
    # happens, fail with a clear, actionable message instead of a confusing
    # ModuleNotFoundError two lines down with no explanation of why.
    print("Astra3 could not determine its own file location (neither "
          "__script__ nor __file__ is set). This usually means astra3.py "
          "was run in an unsupported way. Launch it via `run astra3.py` "
          "or let the Astra3 app start PyMOL itself.", flush=True)

# Under ChimeraX and the Astra3 Engine, Astra3's own engine stands in for
# PyMOL (astra3_chimerax).
if os.environ.get("ASTRA3_ENGINE", "").strip().lower() == "chimerax":
    import astra3_chimerax
    astra3_chimerax.install(globals().get("session"))
elif os.environ.get("ASTRA3_ENGINE", "").strip().lower() == "astra3":
    import astra3_engine
    astra3_engine.install()

from pymol import cmd

# Astra3's modules may be distributed as bytecode, which CPython will only
# load under the exact minor version that produced it. PyMOL supplies its own
# interpreter, so a mismatch between the build machine and the installed
# PyMOL surfaces here as an opaque "bad magic number" ImportError. Translated
# into something that identifies the cause and the fix.
try:
    import astra3_core as _astra3_core_probe  # noqa: F401
except ImportError as _import_error:
    if "bad magic number" in str(_import_error) or "magic number" in str(_import_error):
        _v = "%d.%d" % sys.version_info[:2]
        print("", flush=True)
        print("Astra3 cannot start: its modules were built for a different "
              "version of Python than the one PyMOL is using.", flush=True)
        print(f"  PyMOL is running Python {_v} ({sys.executable})", flush=True)
        print("  The installed Astra3 modules were compiled for a different version.", flush=True)
        print("", flush=True)
        print("This is a packaging mismatch, not a problem with your structure "
              "or your PyMOL installation. Reinstall Astra3 using a build made "
              "for this PyMOL version.", flush=True)
        raise SystemExit(1)
    raise

from astra3_core import (structure_file_kind, structure_file_stem, structure_file_problem, engine_name, engine_label,
    read_structure_text, coordinate_file_record,
    
    GREEN, RED, YELLOW, BLUE, VIOLET, CYAN, WHITE, BOLD, RESET,
    STAR_LIGHT, STAR_PASTEL, STAR_DARK, ASTRA_PURPLE,
    BASE_DIR, BASE_DIR_STR, FETCH_DIR, PROTEIN_OUTPUTS_DIR,
    active_operation_objects, OperationCancelled,
    clear_cancellation, check_for_cancellation, cancel_active_operation,
    register_structure, resolve_structure, is_ast_id, loaded_structures,
    get_output_folders, get_overlay_output_folders, get_termini_output_folders,
    clear_stale_run_images, report_cleared_images, summarize_chain_reduction, homomer_rule_outcome, HOMOMER_RULES,
    select_reference_by_ligand_count, structure_palette,
    describe_fetch_failure,
    parse_header, parse_remark_465, parse_header_cif, parse_missing_residues_cif,
    parse_structure_ids_with_format_flags, MMCIF_FLAG,
    AA_3TO1, OVERLAY_PROTEIN_COLORS, OVERLAY_LIGAND_COLORS, format_yn_prompt, engine_color, load_color_palette,
    load_functional_readouts, ASTRA3_VERSION,
)
from astra3_security import (
    validate_structure_id, InvalidStructureIdError, classic_pdb_id, is_extended_only_id,
    validate_input_file, InvalidPathError, UnsupportedFileTypeError,
    open_path_in_file_manager, AstraSecurityError,
)
from astra3_structure import (forget_protein_mean_b, inherit_in_chain_decision, set_in_chain_residue_policy,
    residue_ca_bfactors, b_factor_summary, keep_first_model, structure_run_notes,
    label_blank_chains, fill_missing_occupancy,
    TERMINUS_WINDOW,
    reset_session_state, refresh_terminus_surface_metrics, reference_tie_scores,
    build_overlay_report, apply_terminus_colors, process_structure,
    build_protein_information, purge_orphaned_state, analyze_ligand_environment,
    compare_termini, draw_termini_vectors, recompute_terminus_metrics,
    prompt_terminus_mismatch, show_termini_offset_and_confirm, match_terminus_windows,
    reconcile_termini_coloring, refresh_terminus_residue_cache,
    detect_intra_structure_homomer, prompt_intra_structure_homomer_reduction,
    create_intra_structure_reduced_object, apply_intra_structure_homomer_reduction,
    get_chain_sequences, compute_sequence_metrics, match_chains_across_structures,
    compute_overall_sequence_identity, compute_whole_structure_sequence_metrics,
    prompt_overall_sequence_identity, classify_overall_sequence_identity,
    reset_sequence_identity_decisions,
    TERMINUS_SEARCH_EXTRA_ADVANCED, LARGE_TERMINUS_OFFSET,
    validate_terminus_selections, validate_terminus_coloring,
    validate_metrics_match_selection, validate_no_scratch_objects, purge_scratch_objects,
    compute_ligand_terminus_distances,
    report_state_problems,
)
from astra3_render_report import (
    save_session, render_views, take_pictures, render_termini_closeups,
    append_warnings_structural_notes, generate_html_report, generate_json_export,
    generate_single_structure_csv, generate_overlay_csv,
    generate_termini_json, generate_termini_csv, generate_termini_html_report,
    _comparison_display_order, viewer_structure_labels,
)

# ------------------------------------------------------------
# HELPERS: load_structure_source, single-run analysis, run wrappers
# ------------------------------------------------------------
import astra3_measure as measure
from astra3_annotations import (parse_file_annotations, collect_annotations, annotation_warnings,
                                header_info_for_import, reset_import_entry_decisions)


def homomer_rule_flags(auto_decision, priority_order, assembly_fallback):
    """The flags that choose a homomer rule, for the command a report records
    as reproducing its run."""
    flags = {"keep": ["-keephomomers"], "assembly": ["-keepassembly"], "reduce": ["-alwaysreduce"]}.get(auto_decision, [])
    if auto_decision == "assembly" and assembly_fallback:
        flags.append("-assemblyfallback:" + assembly_fallback)
    if priority_order and "reduce" in (auto_decision, assembly_fallback):
        flags.append("-reducepriority:" + ",".join(priority_order))
    return flags


def record_intra_reduction(d, applied, homomer_clusters, homomer_rule):
    """Record an intra-structure homomer reduction on a structure_data entry
    so OVERLAY and TERMINI reports state it the way single-structure reports
    do: which chain was kept, on what evidence and by which rule, or that it
    was offered and declined."""
    if homomer_clusters:
        d["homomer_rule"] = homomer_rule_outcome(homomer_rule, applied)
    if applied:
        kept = sorted({k for _r, k in applied})
        cluster = next((c for c in homomer_clusters or [] if kept and kept[0] in (c.get("chains") or [])), {})
        d["reduction_used"] = True
        d["reduction_metrics"] = {
            "recommended_chain": kept[0] if kept else None,
            "identity": cluster.get("identity") or 0.0,
            "coverage": cluster.get("coverage") or 0.0,
            "length_diff": cluster.get("length_diff") or 0,
            "score": cluster.get("score") or 0.0,
            "num_redundant": len(applied),
        }
    elif homomer_clusters:
        d["reduction_used"] = False
        d["reduction_diagnostic"] = "Reduction was offered and not applied; all chains were analyzed."
    return d

def carry_water_counts(previous, reprocessed):
    """Chain reduction re-processes the structure after its waters were
    already removed, so the second pass always finds none. The run's water
    record is the first pass's; keep it on the result the reports use."""
    if not previous or not reprocessed:
        return reprocessed
    if (reprocessed.get("water_detected") or 0) == 0 and (previous.get("water_detected") or 0) > 0:
        for key in ("water_detected", "water_removed"):
            reprocessed[key] = previous.get(key)
        if not reprocessed.get("water_viewer_copy_name") and previous.get("water_viewer_copy_name"):
            reprocessed["water_viewer_copy_name"] = previous["water_viewer_copy_name"]
    return reprocessed


def mmcif_unobserved_map(header_info):
    """The file's own unobserved/zero-occupancy residue record, when it came
    from mmCIF (whose list covers exactly the residues loaded with zero
    occupancy); None otherwise."""
    hi = header_info or {}
    if str(hi.get("missing_residues_source") or "").startswith("mmCIF"):
        return hi.get("missing_residues_map")
    return None


MISSING_RESIDUES_SOURCE_LABEL = {
    "pdb": "PDB REMARK 465",
    "cif": "mmCIF pdbx_unobs_or_zero_occ_residues",
}


def header_info_from_downloaded_files(new_files, fetched_format, fetched_id=None, before_files=None):
    """Read a fetched structure's downloaded file (if any survived --
    AST_ID/imported structures never reach this, see callers) and parse
    header_info + the missing-residues map from it, using whichever
    parser matches the format that was actually fetched.

    fetched_format is the ACTUAL format obtained (from
    load_structure_source's returned metadata) -- not necessarily what
    was requested, since a request can silently fall back to the other
    format (see load_structure_source's own disclosure print for that
    case). Using the true fetched format here, rather than the
    requested one, is what keeps header parsing from silently coming
    back empty whenever a fallback occurred: a -mmCIF request that fell
    back to legacy PDB must still be parsed as PDB text, and vice versa.

    Returns (header_info, downloaded_files_deleted) where header_info
    already has 'missing_residues_map' and 'missing_residues_source'
    populated, matching every existing header_info consumer's expected
    shape.
    """
    ext = ".cif" if fetched_format == "cif" else ".pdb"
    raw_text = ""
    read_from = None
    for f in new_files:
        full_path = Path(FETCH_DIR) / f
        if full_path.is_file() and f.lower().endswith(ext):
            with open(full_path, "r", errors="replace") as fh:
                raw_text = fh.read()
            read_from = full_path
            break
    # PyMOL's fetch reads a file of the right name already in its fetch
    # directory instead of downloading again, so nothing new appears. The
    # existing file is read for its header but left in place, since this run
    # did not create it.
    if not raw_text and fetched_id and before_files:
        wanted = f"{str(fetched_id).strip().lower()}{ext}"
        for f in before_files:
            if f.lower() == wanted and (Path(FETCH_DIR) / f).is_file():
                with open(Path(FETCH_DIR) / f, "r", errors="replace") as fh:
                    raw_text = fh.read()
                read_from = Path(FETCH_DIR) / f
                break
    # Taken now: the downloaded file is removed below.
    coordinate_file = coordinate_file_record(read_from, name=f"{str(fetched_id or '').strip().upper()}{ext}") if read_from else None
    if fetched_format == "cif":
        header_info = parse_header_cif(raw_text)
        header_info["missing_residues_map"] = parse_missing_residues_cif(raw_text)
    else:
        header_info = parse_header(raw_text)
        header_info["missing_residues_map"] = parse_remark_465(raw_text)
    header_info["missing_residues_source"] = MISSING_RESIDUES_SOURCE_LABEL.get(fetched_format, "Unknown")
    # Provenance for the reports and Methods text, and the depositor's own
    # reference-sequence and sequence-difference declarations. The entry ID
    # is recorded only when it is a plain PDB ID, which is what lets RCSB
    # annotations be requested later (imported files never reach here).
    header_info["fetched_format"] = fetched_format
    header_info["retrieved_at"] = time.strftime("%Y-%m-%d")
    header_info["coordinate_file"] = coordinate_file
    entry_match = re.match(r"^(PDB_[A-Za-z0-9]{8}|[A-Za-z0-9]{4})", str(fetched_id or "").strip(), re.I)
    header_info["rcsb_entry_id"] = entry_match.group(1).upper() if entry_match else None
    header_info["file_annotations"] = parse_file_annotations(raw_text, fetched_format)

    deleted = []
    for f in new_files:
        full_path = Path(FETCH_DIR) / f
        if full_path.is_file():
            try:
                full_path.unlink()
                deleted.append(f)
            except Exception:
                pass
    return header_info, deleted


# A PDB entry code is four characters (wwPDB accession format: four
# characters, the first a digit). PyMOL's own fetch reads a fifth character as
# a chain within that entry, so "1AKEA" resolves to chain A of entry 1AKE --
# a different analysis from the whole entry, run without ever saying so. The
# five-character form is a real, useful thing to ask for; it just should not
# be assumed.
ENTRY_PLUS_CHAIN_RE = re.compile(r"^([0-9][A-Za-z0-9]{3})([A-Za-z0-9])$")


def prompt_chain_suffix(structure_id):
    """Ask whether a five-character ID meant an entry plus a chain.

    Returns the ID to load: the five-character form (that one chain) or the
    four-character entry (every chain in it). Asked before anything is
    fetched, so neither answer costs a download of the wrong thing.
    """
    match = ENTRY_PLUS_CHAIN_RE.match(structure_id or "")
    if not match:
        return structure_id
    entry, chain = match.group(1), match.group(2)

    print("-" * 50, flush=True)
    print(f"{BOLD}Chain Suffix Detected{RESET}", flush=True)
    print("-" * 50, flush=True)
    print(f"Entry: {entry}", flush=True)
    print(f"Chain: {chain}", flush=True)
    print("", flush=True)
    print("A PDB entry ID is four characters. A fifth is read as a chain inside", flush=True)
    print(f"that entry, so '{structure_id}' means chain {chain} of entry {entry}.", flush=True)
    print("", flush=True)
    print(f"{WHITE}Answering no analyzes the whole entry, every chain in it.{RESET}", flush=True)

    max_attempts = 10  # same safety cap and reasoning as the homomer prompt
    for _ in range(max_attempts):
        print(f"Analyze only chain {chain} of {entry}? {format_yn_prompt()}: ", end="", flush=True)
        try:
            choice = input().strip().lower()
        except KeyboardInterrupt:
            # Taken as typed: the smaller of the two analyses, and the one the
            # command literally asked for. The cancellation checkpoint that
            # follows the load stops the run in either case.
            print("", flush=True)
            return structure_id
        if choice in ("y", "yes"):
            print(f"{WHITE}Using chain {chain} of {entry}.{RESET}", flush=True)
            return structure_id
        if choice in ("n", "no"):
            print(f"{WHITE}Using the whole entry {entry}, all chains.{RESET}", flush=True)
            return entry
        # Not silently taken as either answer: the two choices analyze
        # different things, and guessing which was meant is how the
        # five-character form went unremarked in the first place.
        print(f"{YELLOW}Please answer y or n.{RESET}", flush=True)

    print(f"{YELLOW}No answer recognized. Continuing with '{structure_id}' as typed.{RESET}", flush=True)
    return structure_id


def _legal_name(name):
    """The name PyMOL would actually give an object: reserved words such as
    "model" or "all" get a trailing underscore, spaces become underscores."""
    try:
        return cmd.get_legal_name(str(name))
    except Exception:  # noqa: BLE001
        return re.sub(r"[^A-Za-z0-9_.+-]", "_", str(name))


def _unique_object_name(preferred):
    """A PyMOL object name that no loaded object or selection uses. PyMOL
    matches names case-insensitively, so "model" and "MODEL" collide."""
    base = _legal_name(str(preferred or "structure").strip() or "structure")
    taken = {n.lower() for n in cmd.get_names("all")}
    name, n = base, 2
    while name.lower() in taken:
        name, n = _legal_name(f"{base.rstrip('_') or base}_{n}"), n + 1
    return name


def _is_molecule(obj):
    try:
        return cmd.get_type(obj) == "object:molecule" and cmd.count_atoms(f"({obj})") > 0
    except Exception:  # noqa: BLE001
        return False


def _starts_with_bom(path):
    """True when a coordinate file (gzipped or not) starts with a UTF-8 byte-order mark."""
    import gzip
    opener = gzip.open if str(path).lower().endswith(".gz") else open
    try:
        with opener(path, "rb") as fh:
            return fh.read(3) == b"\xef\xbb\xbf"
    except Exception:  # noqa: BLE001 -- the load itself reports an unreadable file
        return False


def _load_parked(load):
    """Call load() with all existing objects renamed out of the way, so it
    cannot overwrite them. Loaded objects whose names clash with existing
    ones get a numeric suffix.

    Returns (loaded object names, {name in file: name given here})."""
    parked = {}
    for i, obj in enumerate(cmd.get_names("objects")):
        tmp = f"_astra3_parked_{i}"
        cmd.set_name(obj, tmp)
        parked[tmp] = obj
    try:
        load()
    finally:
        arrived = [o for o in cmd.get_names("objects") if o not in parked]
        renamed = {}
        taken = {v.lower() for v in parked.values()}
        for obj in arrived:
            if obj.lower() in taken:
                new = obj
                n = 2
                while new.lower() in taken or new.lower() in {a.lower() for a in arrived if a != obj}:
                    new, n = f"{obj}_{n}", n + 1
                cmd.set_name(obj, new)
                renamed[obj] = new
                taken.add(new.lower())
        for tmp, original in parked.items():
            cmd.set_name(tmp, original)
    return [renamed.get(o, o) for o in arrived], renamed


def _combine_parts(objects, name):
    """Merge `objects` into one object called `name` and return [name].

    If two of them share a chain ID, merging would fuse two different
    chains, so `objects` is returned unchanged instead."""
    seen = set()
    for obj in objects:
        chains = set(cmd.get_chains(f"({obj})"))
        if chains & seen:
            return objects
        seen |= chains
    tmp = _unique_object_name("_astra3_combined")
    cmd.create(tmp, " or ".join(f"({o})" for o in objects))
    for obj in objects:
        cmd.delete(obj)
    cmd.set_name(tmp, name)
    return [name]


def load_file_isolated(path, preferred_name=None):
    """Load a local structure file without touching anything already loaded.

    Coordinate files always get a new object, so x.pdb and x.cif (or
    model.pdb from two folders) never load into each other. Sessions and
    mmCIF files are loaded via _load_parked, since their objects take their
    names from the file.

    A file with several structures (the objects of a session, or the data
    blocks of a multi-block mmCIF, which PyMOL writes when several objects
    are saved together) becomes one object named after the file, unless
    their chain IDs clash (see _combine_parts).

    Returns (molecule_objects, other_new_objects, renamed, parts): renamed
    maps names in the file to the names used here; parts lists the file's
    structures by their names in the file when there was more than one.
    """
    name = None
    if str(path).lower().endswith(".pse"):
        if engine_name() == "PyMOL":
            # PyMOL loads a session by unpickling it, which runs any code the file holds. Astra3's reader
            # accepts only the classes a PyMOL session contains and raises SessionError for anything else.
            from astra3_pse import load_session_dict
            load_session_dict(path)
        loaded, renamed = _load_parked(lambda: cmd.load(path, partial=1))
    else:
        name = _unique_object_name(preferred_name or structure_file_stem(path))
        kind = structure_file_kind(path)

        def load():
            if engine_name() == "PyMOL" and _starts_with_bom(path):
                # PyMOL's mmCIF reader stops at a UTF-8 byte-order mark (left by some
                # Windows editors); the text is handed over without it.
                cmd.load_raw(read_structure_text(path), kind, name)
            else:
                # The format is given, so PyMOL also reads an upper-case .GZ name.
                cmd.load(path, name, format=kind)

        if kind != "cif":
            before = set(cmd.get_names("objects"))
            load()
            loaded = [o for o in cmd.get_names("objects") if o not in before]
            return [o for o in loaded if _is_molecule(o)], [o for o in loaded if not _is_molecule(o)], {}, []
        loaded, renamed = _load_parked(load)
    molecules = [o for o in loaded if _is_molecule(o)]
    others = [o for o in loaded if not _is_molecule(o)]
    parts = []
    if len(molecules) > 1:
        own_name = {v: k for k, v in renamed.items()}
        parts = [own_name.get(o, o) for o in molecules]
        molecules = _combine_parts(molecules, name or _unique_object_name(preferred_name or structure_file_stem(path)))
    elif molecules and name and molecules[0] != name:
        # Multi-block file with a single molecule: name it after the file,
        # as for a single-block file.
        cmd.set_name(molecules[0], name)
        molecules = [name]
    return molecules, others, renamed, parts


# Answers to the session-labels question for the current command, by AST
# ID, so an ID used twice in one command is only asked about once. Cleared
# at the start of each command.
_SESSION_LABEL_DECISIONS = {}


def reset_session_label_decisions():
    _SESSION_LABEL_DECISIONS.clear()


def _session_labels(obj):
    """Visible labels on obj's atoms, as [(chain, resn, resi, atom name, text)].

    Only PyMOL sessions carry labels. PyMOL shows a label only where the
    label representation is on, and astra3_pse reads only those for the
    other engines, so every engine finds the same set."""
    found = []
    selection = f"({obj}) and rep labels" if engine_name() == "PyMOL" else f"({obj})"
    cmd.iterate(selection, "found.append((chain, resn, resi, name, label))", space={"found": found})
    return [f for f in found if str(f[4]).strip()]


def settle_session_labels(obj, resolved):
    """Ask whether to clear obj's PyMOL-session labels for this command, and
    clear them if so. The imported file itself is never changed."""
    labels = _session_labels(obj)
    if not labels:
        return
    key = resolved.get("ast_id") or obj
    clear = _SESSION_LABEL_DECISIONS.get(key)
    if clear is None:
        who = f"{resolved.get('ast_id') or obj} ({resolved.get('display_name') or obj})"
        listed = ", ".join(f'"{text}" on {chain}/{resn} {resi} {atom}' for chain, resn, resi, atom, text in labels[:5])
        if len(labels) > 5:
            listed += f" and {len(labels) - 5} more"
        print(f"{WHITE}{who} has {len(labels)} label{'' if len(labels) == 1 else 's'} from its PyMOL session: "
              f"{listed}. Kept labels appear in this analysis's images and saved session.{RESET}", flush=True)
        clear = False
        for _ in range(10):  # same safety cap as the other prompts
            print(f"Clear the labels of {resolved.get('ast_id') or obj} for this analysis? {format_yn_prompt()}: ",
                  end="", flush=True)
            try:
                choice = input().strip().lower()
            except KeyboardInterrupt:
                # Treat as "keep"; the cancellation check after the load
                # stops the run.
                print("", flush=True)
                break
            if choice in ("y", "yes"):
                clear = True
                break
            if choice in ("n", "no"):
                break
            print(f"{YELLOW}Please answer y or n.{RESET}", flush=True)
        _SESSION_LABEL_DECISIONS[key] = clear
    if clear:
        cmd.alter(f"({obj})", "label=''")
        print(f"{WHITE}Labels cleared for this analysis; the file itself is unchanged.{RESET}", flush=True)
    else:
        print(f"{WHITE}Labels kept.{RESET}", flush=True)


def load_structure_source(structure_id, requested_format="pdb"):
    """Load a structure by AST-ID or by fetching a PDB ID.

    requested_format ("pdb" or "cif") only affects the PDB_ID branch --
    it selects which format is tried FIRST. AST_ID structures were
    already imported from a specific local file and have no fetch
    format to choose. Legacy default ("pdb") preserves every existing
    call site's behavior exactly when a caller doesn't pass this.
    """
    # Validate BEFORE resolve_structure/cmd.fetch ever see this value -- this
    # is the one chokepoint every fetch path (single-ID, OVERLAY, TERMINI,
    # BATCH) funnels through, so validating here covers all of them at once
    # rather than needing a check at each call site. A syntactically AST-
    # shaped ID that isn't actually registered is rejected here too, rather
    # than silently falling through to be treated as a literal PDB ID and
    # handed to cmd.fetch() under that string. See astra3_security.py.
    typed_id = str(structure_id or "").strip()
    structure_id = validate_structure_id(structure_id, known_ast_ids=loaded_structures)
    if classic_pdb_id(typed_id):
        print(f"{WHITE}{typed_id} is the extended form of PDB ID {structure_id}.{RESET}", flush=True)
    # Asked here rather than at any single call site: this is the chokepoint
    # every fetch path funnels through, so OVERLAY, TERMINI and BATCH get the
    # same question for free.
    structure_id = prompt_chain_suffix(structure_id)
    resolved = resolve_structure(structure_id)
    if resolved["type"] == "AST_ID":
        # Every command that analyses an imported structure comes through
        # here, so this is where the labels question is asked.
        if resolved.get("object_name") in cmd.get_names("objects"):
            settle_session_labels(resolved["object_name"], resolved)
            return resolved["object_name"], resolved
        path = resolved["path"]
        if not os.path.isfile(path):
            # Imported files are re-read on every analysis. If the file is
            # gone, unregister every ID that came from it. The app watches for
            # the "Imported file missing:" line to update its import list.
            gone = sorted(i for i, entry in loaded_structures.items() if entry.get("path") == path)
            for ast_id in gone:
                loaded_structures.pop(ast_id, None)
            print(f"{YELLOW}Imported file missing: {path} was moved or deleted. {', '.join(gone)} no longer "
                  f"{'works' if len(gone) == 1 else 'work'}; import the file again to use it.{RESET}", flush=True)
            raise Exception(f"{resolved.get('display_name') or os.path.basename(path)} could not be read.")
        known_object_name = resolved.get("object_name")
        molecules, others, renamed, _parts = load_file_isolated(path, known_object_name)
        if not molecules:
            raise Exception(f"Failed to load structure from {path}")
        if len(molecules) > 1 or str(path).lower().endswith(".pse"):
            # Keep only the object this AST ID was registered for (a session's
            # object, or one of a file's structures kept separate). Anything
            # else loaded from the file would end up in its images and session.
            own = resolved.get("part") or known_object_name
            wanted = renamed.get(own, own)
            obj = wanted if wanted in molecules else molecules[0]
            for extra in [o for o in molecules + others if o != obj]:
                try:
                    cmd.delete(extra)
                except Exception:  # noqa: BLE001
                    pass
        else:
            obj = molecules[0]
        resolved["object_name"] = obj
        active_operation_objects.add(obj)
        settle_session_labels(obj, resolved)
        return obj, resolved
    else:
        # Re-running the same structure ID within one PyMOL session can leave
        # a stale object of the same name in the scene (with its own leftover
        # camera/view state) from a previous run. cmd.fetch's exact behavior
        # when an object of that name already exists is version-dependent --
        # rather than relying on it, explicitly clear any colliding object
        # first so every fetch is guaranteed to produce a genuinely fresh
        # object. This prevents images intermittently saving blank: a
        # stale/empty selection during orient+zoom silently leaves the camera
        # wherever the previous run left it, and ray-tracing then captures
        # nothing but background.
        likely_name = structure_id.strip().lower()
        for stale_name in (likely_name, likely_name.upper()):
            if stale_name in cmd.get_names("objects"):
                try:
                    cmd.delete(stale_name)
                except Exception:
                    pass
        # Deleting a stale object above does not automatically clean up named
        # selections that were built from its atoms (e.g. the per-ligand/per-
        # ion selections process_structure creates, "lig_NDP_1" etc.) -- PyMOL
        # selections are atom-membership sets, so a selection built purely
        # from the deleted object's atoms collapses to zero atoms once those
        # atoms are gone, but the name itself still exists in
        # cmd.get_names("selections") until something explicitly removes it.
        # purge_orphaned_state() (called once at the very start of
        # _run_single_analysis, before this function even runs) cannot catch
        # this: it runs BEFORE the stale object above is deleted, so at the
        # moment it ran, those selections still had real atoms and correctly
        # looked alive. If left alone, a re-run's freshly created selection of
        # the exact same name can then collide with this now-empty stale entry
        # (process_structure's own collision check looks at
        # cmd.get_names("selections"), which still lists it), or a PyMOL-
        # internal reference to the zero-atom stale selection can surface as a
        # Selector-Error during later geometry queries (e.g.
        # analyze_ligand_environment's "byres (X around 4.0)" selections) that
        # reused the id but got the collision-renamed variant instead. Re-
        # running the same zero-atom sweep here, right after the deletion that
        # actually creates the zero-atom selections, closes that gap.
        purge_orphaned_state()
        # requested_format picks which fetch is tried first; the other format
        # is always the fallback if the first attempt returns no new objects.
        # This preserves the pre-existing PDB-first, mmCIF-fallback behavior
        # when requested_format="pdb" (the default, used by every caller that
        # doesn't pass -mmCIF), and mirrors it (mmCIF-first, PDB-fallback)
        # when the user explicitly asked for mmCIF -- so a -mmCIF request that
        # RCSB genuinely can't serve as mmCIF still has the same recovery path
        # legacy PDB requests already had, rather than a one-way street.
        if is_extended_only_id(structure_id):
            requested_format = "cif"  # extended-ID entries are issued in mmCIF only
        first_format = "cif" if requested_format == "cif" else "pdb"
        second_format = "pdb" if first_format == "cif" else "cif"

        before_objects = cmd.get_names("objects")
        before_files = set(os.listdir(FETCH_DIR))
        cmd.fetch(structure_id, type=first_format)
        after_objects = cmd.get_names("objects")
        new_objects = [o for o in after_objects if o not in before_objects]
        fetched_format = first_format if new_objects else None
        if len(new_objects) == 0:
            # Neither format is guaranteed to exist for every current RCSB
            # entry independent of the other (legacy PDB-format files in
            # particular aren't mirrored for some entries, regardless of the
            # structure's age or size) -- retry once with the other format
            # before concluding the ID itself is invalid. mmCIF is universally
            # available for every current PDB entry, so a pdb-first attempt
            # that fails here almost always recovers on the cif retry; a cif-
            # first attempt (explicit -mmCIF request) recovers on the rarer
            # case where mmCIF itself is unavailable but legacy PDB still is.
            for stale_name in (likely_name, likely_name.upper()):
                if stale_name in cmd.get_names("objects"):
                    try:
                        cmd.delete(stale_name)
                    except Exception:
                        pass
            before_objects = cmd.get_names("objects")
            try:
                cmd.fetch(structure_id, type=second_format)
            except Exception:
                pass
            after_objects = cmd.get_names("objects")
            new_objects = [o for o in after_objects if o not in before_objects]
            if new_objects:
                fetched_format = second_format
        after_files = set(os.listdir(FETCH_DIR))
        new_files = after_files - before_files
        if len(new_objects) == 0:
            # A failed fetch has two very different causes and the fix differs:
            # a wrong ID is a typo, no network is an environment problem. The
            # message used to name only the first, which sends someone to
            # re-check an ID that was never wrong.
            raise Exception(describe_fetch_failure(structure_id))

        # An object exists -- but it may hold no atoms. PyMOL's fetch accepts a
        # trailing chain identifier, so a mistyped 5-character id like "1ERTJ"
        # is read as entry 1ERT plus chain J. When that chain does not exist it
        # prints "no such chain" and leaves a zero-atom object behind, which
        # every later step processed without complaint: the run reported
        # success, the interface showed a completion notification, and a
        # history entry appeared for an analysis that never had a structure in
        # it.
        loaded_atoms = 0
        for candidate in new_objects:
            try:
                loaded_atoms += cmd.count_atoms(f"%{candidate}")
            except Exception:  # noqa: BLE001 -- an unreadable object counts as empty
                continue
        if loaded_atoms == 0:
            for empty_name in new_objects:
                try:
                    cmd.delete(empty_name)
                except Exception:  # noqa: BLE001
                    pass
            hint = ""
            if len(structure_id) == 5:
                hint = (f" A 5-character id is read as a 4-character entry plus a chain, so "
                        f"'{structure_id}' means entry '{structure_id[:4]}' chain "
                        f"'{structure_id[4:]}' -- an entry without that chain loads nothing.")
            raise Exception(f"'{structure_id}' did not load any atoms; check the ID.{hint}")

        obj = new_objects[-1]
        active_operation_objects.add(obj)
        if fetched_format != requested_format:
            # The requested format wasn't what actually got used (fell back to
            # the other one) -- disclose this rather than silently
            # substituting, consistent with Astra3 never silently applying a
            # different decision than what was asked for. Doesn't block the
            # run; the structure still loads and analysis still proceeds on
            # whichever format was actually obtained.
            fmt_label = {"pdb": "legacy PDB", "cif": "mmCIF"}
            print(f"{YELLOW}{structure_id}: requested {fmt_label[requested_format]} format was not available; "
                  f"fetched as {fmt_label[fetched_format]} instead.{RESET}", flush=True)
        return obj, {
            "type": "PDB_ID", "object_name": obj, "new_files": new_files,
            "before_files": before_files, "after_files": after_files,
            "structure_id": structure_id, "requested_format": requested_format,
            "fetched_format": fetched_format,
        }


def _run_single_analysis(structure_id, is_test=False, image_quality="medium", image_skip=False, report_skip=False, render_only=False, csv_export=False, homomer_skip_state=None, requested_format="pdb", homomer_auto_decision=None, homomer_priority_order=None, homomer_assembly_fallback=None):
    # Clean slate. Anything left by a previous run in this same PyMOL session
    # -- renamed reduction products, per-chain selections, CGO overlays --
    # made a re-run behave differently from a first run.
    cleared = reset_session_state()
    if cleared:
        print(f"{YELLOW}Cleared {len(cleared)} object(s)/selection(s) left by a previous run.{RESET}",
              flush=True)
    reset_import_entry_decisions()
    reset_session_label_decisions()
    try:
        obj, resolved = load_structure_source(structure_id, requested_format=requested_format)
    except Exception as e:
        print(f"{RED}{str(e)}{RESET}", flush=True)
        print("", flush=True)
        return None
    check_for_cancellation()
    obj = obj.upper()
    # obj is uppercased for display and for naming the output folder. It is
    # NOT necessarily the literal name PyMOL holds: a fetched structure is
    # created under the ID as passed, but an IMPORTED one is named after its
    # file, so "6f7r.cif" loads as "6f7r" and this makes obj "6F7R".
    #
    # That is safe for everything selection-based below, because PyMOL matches
    # names case-insensitively inside the selection language. Any code that
    # compares obj against cmd.get_names() must do the same -- see
    # render_views, which compared exactly and aborted every imported run.
    #
    # Renaming the object to match was tried and does not work: PyMOL treats
    # the two spellings as the same name, so a case-only set_name reports
    # success and changes nothing.

    header_info = {}
    if resolved.get("type") == "PDB_ID":
        new_files = resolved.get("new_files", set())
        fetched_format = resolved.get("fetched_format", "pdb")
        header_info, deleted = header_info_from_downloaded_files(
            new_files, fetched_format, resolved.get("structure_id"), resolved.get("before_files"))
        for f in deleted:
            print(f"{GREEN}Removed temporary download: {f}{RESET}", flush=True)
    elif resolved.get("type") == "AST_ID":
        header_info = header_info_for_import(resolved)
    else:
        header_info = {"method": "Unknown", "resolution": "Unknown", "r_work": "Unknown", "r_free": "Unknown", "missing_residues_map": None, "missing_residues_source": None}
    measure.register_unobserved(obj, header_info.get("missing_residues_map"))

    output_dir, session_dir, images_dir = get_output_folders(obj, is_test=is_test)
    # Output folders are named from the structure IDs, so re-running the same
    # analysis reuses this folder. Clear Astra3's own images from any previous
    # run first, or its output sits alongside this run's and is presented as
    # part of it.
    report_cleared_images(clear_stale_run_images(images_dir), images_dir)

    # The Viewer page's own "Show waters" toggle is hidden accordingly (see
    # ViewerPage's own `selected?.kind === "single"` gate in app.jsx) so it
    # doesn't promise something that isn't actually being delivered.
    models_in_file = keep_first_model(obj)
    blank_chain_label = label_blank_chains(obj)
    occupancy_filled = fill_missing_occupancy(obj)
    process_result = process_structure(obj, deposited_unobserved=mmcif_unobserved_map(header_info))
    check_for_cancellation()

    # Intra-structure homomer detection: flags chains within THIS structure
    # that are near-identical (e.g. crystallographic copies of the same
    # protein), and -- if the user approves -- actually reduces the loaded
    # object down to just the kept chain(s), the same way OVERLAY/TERMINI
    # already do.
    chain_reduction_applied = []
    homomer_clusters = []
    homomer_rule = None
    try:
        homomer_clusters = detect_intra_structure_homomer(obj, process_result.get("chain_list", [])) or []
        if homomer_clusters:
            decisions, decided = prompt_intra_structure_homomer_reduction(
                obj, homomer_clusters, batch_skip_state=homomer_skip_state,
                auto_decision=homomer_auto_decision, priority_order=homomer_priority_order,
                ligand_info=process_result.get("ligand_info"), missing_residues_map=header_info.get("missing_residues_map"),
                assemblies=(header_info.get("file_annotations") or {}).get("assemblies"),
                assembly_fallback=homomer_assembly_fallback,
            )
            chain_reduction_applied, new_process_result = apply_intra_structure_homomer_reduction(
                obj, homomer_clusters, decisions, selection_suffix="_" + obj,
                deposited_unobserved=mmcif_unobserved_map(header_info),
            )
            homomer_rule = homomer_rule_outcome(decided, chain_reduction_applied)
            if new_process_result is not None:
                process_result = carry_water_counts(process_result, new_process_result)
    except Exception as e:
        print(f"{YELLOW}Intra-structure homomer detection encountered an error and will be skipped: {e}{RESET}", flush=True)
    check_for_cancellation()

    # Every report below describes the analyzed object. When chains were
    # removed by homomer reduction, the deposited entry's missing-residue
    # records for those chains no longer describe anything that was analyzed,
    # and the reduction itself has to be recorded so readers know the
    # results cover one chain chosen from several.
    removed_chains = {removed for removed, _kept in chain_reduction_applied}
    missing_residues_all = header_info.get("missing_residues_map")
    if removed_chains and isinstance(missing_residues_all, dict):
        missing_residues_analyzed = {ch: ranges for ch, ranges in missing_residues_all.items() if ch not in removed_chains}
    else:
        missing_residues_analyzed = missing_residues_all
    reduction_metrics = None
    reduction_diagnostic = None
    reduction_warnings = []
    if chain_reduction_applied:
        kept_chains = sorted({kept for _removed, kept in chain_reduction_applied})
        cluster = next((c for c in homomer_clusters if kept_chains[0] in c.get("chains", [])), {})
        reduction_metrics = {
            "recommended_chain": kept_chains[0],
            "identity": cluster.get("identity") or 0.0,
            "coverage": cluster.get("coverage") or 0.0,
            "length_diff": cluster.get("length_diff") or 0,
            "score": cluster.get("score") or 0.0,
            "num_redundant": len(chain_reduction_applied),
        }
    elif homomer_clusters:
        reduction_diagnostic = "Reduction was offered and not applied; all chains were analyzed."
    if homomer_rule:
        reduction_warnings = summarize_chain_reduction(chain_reduction_applied, obj.upper(), "this", homomer_rule)
    reduction_warnings = list(reduction_warnings) + structure_run_notes(obj, process_result, models_in_file,
                                                                        blank_chain_label, occupancy_filled)

    # Computed once here (not inside build_protein_information) so the same
    # PyMOL geometry calculations back both the TXT report and the
    # HTML/JSON/CSV exports below, instead of running cmd.find_pairs/
    # cmd.iterate a second time for each output format.
    ligand_environment = analyze_ligand_environment(obj, process_result["ligand_info"])
    check_for_cancellation()
    if report_skip or render_only:
        print(f"{YELLOW}Report skipped by user (-skipreport).{RESET}", flush=True)
    else:
        annotations = collect_annotations(header_info, process_result.get("chain_list", []))
        txt_n_terms, txt_c_terms = [], []
        try:
            cmd.iterate(process_result["n_term_name"], "items.append((chain, resi))", space={"items": txt_n_terms})
            cmd.iterate(process_result["c_term_name"], "items.append((chain, resi))", space={"items": txt_c_terms})
        except Exception:  # noqa: BLE001 -- cross-checks simply find no terminus overlaps
            pass
        annotation_notes = annotation_warnings(obj.upper(), annotations["file"], annotations["rcsb"],
                                               txt_n_terms, txt_c_terms, ligand_environment,
                                               process_result.get("chain_list", []),
                                               [removed for removed, _kept in chain_reduction_applied])
        report_text = build_protein_information(obj, header_info, process_result, ligand_environment=ligand_environment,
                                                 chain_reduction=chain_reduction_applied, annotations=annotations,
                                                 homomer_rule=homomer_rule)
        report_path = os.path.join(session_dir, obj.upper() + "_Information.txt")
        with open(report_path, "w", encoding="utf-8") as fh:
            fh.write(report_text)
            lines_acc = []
            append_warnings_structural_notes(lines_acc, {obj.upper(): missing_residues_analyzed},
                                             missing_residues_sources={obj.upper(): header_info.get('missing_residues_source')},
                                             structures_unobserved={obj.upper(): process_result.get('unobserved_residues')},
                                             structures_unobserved_deposited={
                                                 obj.upper(): process_result.get('unobserved_residues_deposited')})
            if annotation_notes:
                if not lines_acc:
                    lines_acc.extend(["WARNINGS / STRUCTURAL NOTES", "-" * 60])
                lines_acc.append("")
                lines_acc.append("Annotation cross-checks:")
                lines_acc.extend("  - " + note for note in annotation_notes)
            if lines_acc:
                fh.write("\n".join(lines_acc))
        print(f"{GREEN}Report saved: {report_path}{RESET}", flush=True)
    check_for_cancellation()

    try:
        purge_scratch_objects()
        save_session(obj, session_dir, water_viewer_copy_name=process_result.get("water_viewer_copy_name"),
                     structure_labels={obj: resolved.get("ast_id") or obj.upper()})
        check_for_cancellation()
    except Exception as e:
        print(f"{RED}Session save failed: {str(e)}{RESET}", flush=True)

    if image_skip or render_only:
        print(f"{YELLOW}Images skipped by user (-skipimage). Report and session generation complete.{RESET}", flush=True)
    else:
        os.makedirs(images_dir, exist_ok=True)
        take_pictures(obj, images_dir, image_quality=image_quality)

    # Build structure_data for SINGLE report generation
    try:
        if not report_skip and not render_only:
            n_terms = []
            c_terms = []
            b_values = []
            try:
                cmd.iterate(process_result["n_term_name"], "items.append((chain, resi))", space={"items": n_terms})
            except Exception:
                n_terms = []
            try:
                cmd.iterate(process_result["c_term_name"], "items.append((chain, resi))", space={"items": c_terms})
            except Exception:
                c_terms = []
            try:
                b_values = [b for _c, _r, _n, b in residue_ca_bfactors(obj)]
            except Exception:
                b_values = []
            mean_b, min_b, max_b, b_note = b_factor_summary(b_values, (header_info or {}).get("method"))
            has_altloc = cmd.count_atoms(obj + ' and polymer.protein and not alt ""') > 0
            structure_data = {
                obj: {
                    "pdb_id": obj,
                    "header_info": header_info,
                    "process_result": process_result,
                    "n_term_name": process_result.get("n_term_name"),
                    "c_term_name": process_result.get("c_term_name"),
                    "n_term_residues": sorted(set(n_terms)),
                    "c_term_residues": sorted(set(c_terms)),
                    "mean_b": mean_b,
                    "min_b": min_b,
                    "max_b": max_b,
                    "b_factor_note": b_note,
                    "models_in_file": models_in_file,
                    "has_altloc": has_altloc,
                    "alignment_obj": obj,
                    "reduction_used": bool(chain_reduction_applied),
                    "reduction_metrics": reduction_metrics,
                    "reduction_diagnostic": reduction_diagnostic,
                    "chain_reduction_applied": [
                        {"removed_chain": removed, "kept_chain": kept} for removed, kept in chain_reduction_applied
                    ],
                    "homomer_rule": homomer_rule,
                    "missing_residues": missing_residues_analyzed,
                    "ligand_environment": ligand_environment,
                    "annotations": annotations,
                }
            }
            # Generate the single-structure HTML report (separate presentation from OVERLAY)
            try:
                analysis_id = obj
                # The options this run actually used, so the reports and the
                # Methods text record a command that reproduces it.
                command_flags = []
                if requested_format == "cif":
                    command_flags.append("-mmCIF")
                if not (image_skip or render_only):
                    command_flags.append("-" + image_quality)
                if image_skip:
                    command_flags.append("-skipimage")
                if csv_export:
                    command_flags.append("-csv")
                # The homomer rule decides which chains were analyzed.
                command_flags.extend(homomer_rule_flags(homomer_auto_decision, homomer_priority_order,
                                                        homomer_assembly_fallback))
                command_str = " ".join([structure_id] + command_flags)
                run_parameters = {"mode": "single", "image_quality": image_quality,
                                  "images_rendered": not (image_skip or render_only)}
                generate_html_report(output_dir, analysis_id, command_str, structure_data, {}, {}, list(reduction_warnings),
                                     run_parameters=run_parameters)
            except Exception as e:
                print(f"{YELLOW}Failed to generate HTML report for single-structure run: {e}{RESET}", flush=True)
            try:
                generate_json_export(output_dir, analysis_id, command_str, structure_data, {}, {}, list(reduction_warnings),
                                     run_parameters=run_parameters)
            except Exception as e:
                print(f"{YELLOW}Failed to generate JSON export for single-structure run: {e}{RESET}", flush=True)
            if csv_export:
                try:
                    generate_single_structure_csv(output_dir, structure_data, list(reduction_warnings))
                except Exception as e:
                    print(f"{YELLOW}Failed to generate CSV export for single-structure run: {e}{RESET}", flush=True)
    except Exception:
        # non-fatal: report generation is optional for single runs
        pass

    # Clean up object (single-structure run)
    try:
        cmd.delete(obj)
    except Exception:
        pass
    print(f"{BLUE}Output folder: {output_dir}{RESET}", flush=True)
    return obj


def run_single_analysis(structure_id, is_test=False, image_quality="medium", image_skip=False,
                        report_skip=False, render_only=False, csv_export=False, homomer_skip_state=None,
                        requested_format="pdb", homomer_auto_decision=None, homomer_priority_order=None,
                        homomer_assembly_fallback=None):
    try:
        return _run_single_analysis(structure_id, is_test, image_quality, image_skip,
                                    report_skip, render_only, csv_export, homomer_skip_state,
                                    requested_format=requested_format, homomer_auto_decision=homomer_auto_decision,
                                    homomer_priority_order=homomer_priority_order,
                                    homomer_assembly_fallback=homomer_assembly_fallback)
    except (KeyboardInterrupt, OperationCancelled):
        cancel_active_operation()
        print(f"{YELLOW}Analysis cancelled. Cleaning up and returning to the PDB prompt.{RESET}", flush=True)
        return None
    except Exception as e:  # noqa: BLE001 -- one structure's failure must not end the session
        print(f"{RED}Analysis of {structure_id} failed: {e}{RESET}", flush=True)
        return None
    finally:
        active_operation_objects.clear()
        clear_cancellation()


# ------------------------------------------------------------
# OVERLAY subsystem: request/registry classes, the alignment handler, and the
# argument parsers used by the OVERLAY command.
# ------------------------------------------------------------
@dataclass
class OverlayRequest:
    structure_ids: list
    reference_override: str = None
    image_quality: str = "medium"
    image_skip: bool = False
    report_skip: bool = False
    render_only: bool = False
    csv_export: bool = False
    format_map: dict = None  # {structure_id_upper: "pdb"|"cif"}, from a -mmCIF flag
    homomer_auto_decision: str = None  # "reduce"|"keep"|"assembly"|None -- see prompt_intra_structure_homomer_reduction's own auto_decision
    homomer_priority_order: list = None  # see rank_homomer_chain_by_priority
    homomer_assembly_fallback: str = None  # "ask"|"reduce"|"keep"|None, for "assembly"


class OverlayOperationRegistry:
    def __init__(self):
        self._handlers = {}

    def register(self, name, handler):
        self._handlers[name.upper()] = handler

    def has(self, name):
        return name.upper() in self._handlers

    def dispatch(self, name, request):
        handler = self._handlers.get(name.upper())
        if handler is None:
            raise ValueError("Unknown OVERLAY operation: " + name)
        return handler.execute(request)


class OverlayExecution:
    """Shared state and primitives used by every registered overlay operation."""
    # Same thresholds and reasoning as TERMINI's intra-structure homomer
    # detector (INTRA_HOMOMER_IDENTITY_THRESH/COVERAGE_THRESH in
    # astra3_structure.py): identity and coverage, both computed over the
    # resv-matched overlap via the shared compute_sequence_metrics, are
    # sufficient on their own to determine "same chain, different resolved
    # range".
    HOMOMER_IDENTITY_THRESH = 0.98
    HOMOMER_COVERAGE_THRESH = 0.95

    def __init__(self, request):
        self.request = request
        self.structure_data = {}
        self.failed_structures = []
        self.warnings = []
        self.alignment_results = {}
        self.pairwise_matrix = {}
        self.reduction_temp_objects = []

    @property
    def loaded_objects(self):
        return list(self.structure_data.keys())

    def validate(self):
        unique_ids, duplicates = [], set()
        for structure_id in self.request.structure_ids:
            sid = structure_id.upper()
            if sid in unique_ids:
                duplicates.add(sid)
            else:
                unique_ids.append(sid)
        if duplicates:
            print(f"{RED}Duplicate structure ID(s) requested: {', '.join(sorted(duplicates))}. Please choose different structures to align.{RESET}", flush=True)
            return None
        if len(unique_ids) < 2:
            print(f"{RED}OVERLAY requires at least two different structures.{RESET}", flush=True)
            return None
        return unique_ids

    def header_info_for(self, resolved, meta):
        if resolved.get("type") == "AST_ID":
            return header_info_for_import(resolved)
        if resolved.get("type") != "PDB_ID":
            return {"method": "Imported", "resolution": "Not available", "r_work": "Not available", "r_free": "Not available", "missing_residues_map": None, "missing_residues_source": None}
        fetched_format = meta.get("fetched_format", "pdb")
        header, _deleted = header_info_from_downloaded_files(
            meta.get("new_files", set()), fetched_format, meta.get("structure_id"), meta.get("before_files"))
        return header

    def load_and_prepare(self, structure_ids, format_map=None):
        """format_map: optional {structure_id_upper: "pdb"|"cif"} of
        per-ID fetch format requests (from a -mmCIF flag). Structure IDs
        not present in format_map default to "pdb", identical to every
        pre-existing call site that doesn't pass this at all.
        """
        format_map = format_map or {}
        # Clean slate, as for single-structure runs: structures loaded by
        # earlier commands (imports included) must not be saved into this
        # run's session or viewer file.
        cleared = reset_session_state()
        if cleared:
            print(f"{YELLOW}Cleared {len(cleared)} object(s)/selection(s) left by a previous run.{RESET}", flush=True)
        # Shared by OVERLAY and TERMINI, so this is the one place both
        # commands reliably pass through. Answers to the sequence-identity
        # question are scoped to a single command and must not carry over.
        reset_sequence_identity_decisions()
        reset_import_entry_decisions()
        reset_session_label_decisions()
        print(f"{YELLOW}Starting alignment of {len(structure_ids)} structures: {', '.join(structure_ids)}{RESET}", flush=True)
        for structure_id in structure_ids:
            resolved = resolve_structure(structure_id)
            display_name = resolved.get("display_name", structure_id)
            # Downloading is the slowest step in a run and produced no output
            # at all, so a large entry on a slow connection looked like the
            # program had stopped. Announced before it starts, not after.
            if resolved.get("type") == "PDB_ID":
                print(f"{WHITE}Fetching {display_name} from the PDB...{RESET}", flush=True)
            try:
                requested_format = format_map.get(structure_id.upper(), "pdb")
                obj, meta = load_structure_source(structure_id, requested_format=requested_format)
                check_for_cancellation()
                obj = obj.upper()
                header_info = self.header_info_for(resolved, meta)
                measure.register_unobserved(obj, (header_info or {}).get("missing_residues_map"))
                check_for_cancellation()
                # Load order decides the palette. The first structure loaded
                # is the reference in the overwhelming majority of runs, and
                # where the reference is chosen later the colours are still
                # distinct per structure, which is what these are for.
                models_in_file = keep_first_model(obj)
                blank_chain_label = label_blank_chains(obj)
                occupancy_filled = fill_missing_occupancy(obj)
                process_result = process_structure(obj, selection_suffix="_" + obj,
                                                   deposited_unobserved=mmcif_unobserved_map(header_info),
                                                   protein_colors=structure_palette(len(self.loaded_objects)))
                self.warnings.extend(structure_run_notes(obj, process_result, models_in_file, blank_chain_label,
                                                         occupancy_filled))
                check_for_cancellation()
                ligand_environment = analyze_ligand_environment(obj, process_result["ligand_info"])
                check_for_cancellation()
                n_terms, c_terms, b_values = [], [], []
                cmd.iterate(process_result["n_term_name"], "items.append((chain, resi))", space={"items": n_terms})
                cmd.iterate(process_result["c_term_name"], "items.append((chain, resi))", space={"items": c_terms})
                b_values = [b for _c, _r, _n, b in residue_ca_bfactors(obj)]
                self.structure_data[obj] = {
                    "pdb_id": display_name,
                    # The literal token the user typed for this structure
                    # (e.g. "AST-5391" for an imported/offline file), kept
                    # separately from "pdb_id" above. for an AST-XXXX import,
                    # "pdb_id" here is resolve_structure()'s own display_name,
                    # which for an import is the ORIGINAL FILENAME stored at
                    # register_structure() time (see astra3.py's IMPORT
                    # handler), not the AST-XXXX id itself, and "obj" is
                    # whatever object name load_structure_source() derived
                    # from that (also not the AST-XXXX id). The reference-
                    # structure lookup below only checked pdb_id/obj, so
                    # whenever the FIRST structure in an OVERLAY/TERMINI
                    # request was specified by its AST-XXXX id, the only way
                    # to reference an imported, offline, or unpublished .pse
                    # structure at all (there is no real PDB ID to type for
                    # one), that lookup could never match, even though both
                    # structures had just finished processing successfully
                    # seconds earlier. This is not specific to a structure's
                    # file happening to share a name with a real published PDB
                    # entry; it reproduces for any AST-XXXX reference,
                    # including a genuinely unpublished file with no real ID
                    # at all.
                    "requested_id": structure_id,
                    "header_info": header_info,
                    "process_result": process_result,
                    "n_term_name": process_result["n_term_name"],
                    "c_term_name": process_result["c_term_name"],
                    "n_term_residues": sorted(set(n_terms)),
                    "c_term_residues": sorted(set(c_terms)),
                    **dict(zip(("mean_b", "min_b", "max_b", "b_factor_note"),
                               b_factor_summary(b_values, (header_info or {}).get("method")))),
                    "models_in_file": models_in_file,
                    "has_altloc": cmd.count_atoms(obj + ' and polymer.protein and not alt ""') > 0,
                    "alignment_obj": obj,
                    "reduction_used": False,
                    "reduction_metrics": None,
                    "reduction_diagnostic": None,
                    "missing_residues": header_info.get('missing_residues_map', None),
                    "ligand_environment": ligand_environment,
                }
            except (KeyboardInterrupt, OperationCancelled):
                raise
            except Exception as error:
                self.failed_structures.append(structure_id)
                self.warnings.append(structure_id + ": could not be loaded, skipped entirely.")
                print(f"{RED}Could not load '{structure_id}' ({display_name}): skipping. {error}{RESET}", flush=True)

    def _get_chain_sequences(self, obj):
        # Delegates to the shared, resv-keyed implementation in
        # astra3_structure.py (get_chain_sequences) rather than keeping a
        # second, separately-maintained copy here. See get_chain_sequences'
        # docstring for why resv-keying matters.
        chains = self.structure_data[obj]["process_result"]["chain_list"]
        return get_chain_sequences(obj, chains)

    def _compute_sequence_metrics(self, seq_a, seq_b):
        # Delegates to the shared, resv-aware implementation in
        # astra3_structure.py (compute_sequence_metrics) -- see
        # _get_chain_sequences above for why the old local copy was removed.
        return compute_sequence_metrics(seq_a, seq_b)

    def detect_homomer_reduction_candidates(self):
        objs = self.loaded_objects
        if len(objs) < 2:
            return
        seqs_by_obj = {}
        for obj in objs:
            seqs_by_obj[obj] = self._get_chain_sequences(obj)
        for multi_obj in objs:
            chains_multi = list(seqs_by_obj[multi_obj].keys())
            if len(chains_multi) <= 1:
                continue
            for target_obj in objs:
                if target_obj == multi_obj:
                    continue
                chains_target = list(seqs_by_obj[target_obj].keys())
                if len(chains_target) >= len(chains_multi):
                    continue
                candidates = []
                diagnostics = []
                for ch in chains_multi:
                    seq_ch = seqs_by_obj[multi_obj][ch]
                    best_metrics = None
                    best_target_chain = None
                    for t_ch in chains_target:
                        seq_t = seqs_by_obj[target_obj][t_ch]
                        metrics = self._compute_sequence_metrics(seq_ch, seq_t)
                        if best_metrics is None or metrics["score"] > best_metrics["score"]:
                            best_metrics = metrics
                            best_target_chain = t_ch
                    candidates.append((ch, best_target_chain, best_metrics))
                    diagnostics.append((ch, best_target_chain, best_metrics))
                redundant_chains = [c for c in candidates if
                                    c[2]["identity"] >= self.HOMOMER_IDENTITY_THRESH and
                                    c[2]["coverage"] >= self.HOMOMER_COVERAGE_THRESH]
                if not redundant_chains:
                    diag_msgs = []
                    for ch, tgt, m in diagnostics:
                        if m["identity"] < self.HOMOMER_IDENTITY_THRESH:
                            diag_msgs.append(f"Chain {ch} vs {tgt}: low identity ({m['identity']*100:.1f}%)")
                        elif m["coverage"] < self.HOMOMER_COVERAGE_THRESH:
                            diag_msgs.append(f"Chain {ch} vs {tgt}: low coverage ({m['coverage']*100:.1f}%)")
                        else:
                            diag_msgs.append(f"Chain {ch} vs {tgt}: ambiguous (identity={m['identity']*100:.1f}%, coverage={m['coverage']*100:.1f}%)")
                    self.structure_data[multi_obj]["reduction_diagnostic"] = "; ".join(diag_msgs[:3])
                    continue
                recommended = max(redundant_chains, key=lambda x: x[2]["score"])
                recommended_chain = recommended[0]
                recommended_metrics = recommended[2]
                num_redundant = len(redundant_chains)
                identity_pct = recommended_metrics["identity"] * 100.0
                coverage_pct = recommended_metrics["coverage"] * 100.0
                length_diff = recommended_metrics["length_diff"]
                similarity_score = recommended_metrics["score"] * 100.0
                print("-" * 50, flush=True)
                print("Homomeric Chain Reduction Detected", flush=True)
                print("-" * 50, flush=True)
                print("Structure: %s" % self.structure_data[multi_obj]["pdb_id"], flush=True)
                print("Protein chains: " + ", ".join(chains_multi), flush=True)
                print("Redundant chains detected: %d" % num_redundant, flush=True)
                print("", flush=True)
                print("Recommended chain: %s" % recommended_chain, flush=True)
                print("", flush=True)
                print("Sequence identity: %.1f%%" % identity_pct, flush=True)
                print("Sequence coverage: %.1f%%" % coverage_pct, flush=True)
                print("Length difference: %d residues" % length_diff, flush=True)
                print("Similarity score: %.1f" % similarity_score, flush=True)
                print("", flush=True)
                print("The original structure will remain unchanged.", flush=True)
                print(f"Use only chain {recommended_chain} for alignment? {format_yn_prompt()}: ", end="", flush=True)
                try:
                    choice = input().strip().lower()
                except KeyboardInterrupt:
                    print(f"\n{YELLOW}Homomer reduction prompt cancelled by user.{RESET}", flush=True)
                    choice = "n"
                if choice == "y" or choice == "yes":
                    temp_name = f"{multi_obj}_REDUCED_{recommended_chain}"
                    if temp_name in cmd.get_names("objects"):
                        try:
                            cmd.delete(temp_name)
                        except Exception:
                            pass
                    try:
                        cmd.create(temp_name, f"{multi_obj} and chain {recommended_chain}")
                        inherit_in_chain_decision(multi_obj, temp_name)
                        self.reduction_temp_objects.append(temp_name)
                        self.structure_data[multi_obj]["alignment_obj"] = temp_name
                        self.structure_data[multi_obj]["reduction_used"] = True
                        self.structure_data[multi_obj]["reduction_metrics"] = {
                            "recommended_chain": recommended_chain,
                            "identity": recommended_metrics["identity"],
                            "coverage": recommended_metrics["coverage"],
                            "length_diff": recommended_metrics["length_diff"],
                            "score": recommended_metrics["score"],
                            "num_redundant": num_redundant,
                        }
                        process_structure(temp_name, selection_suffix="_" + temp_name)
                        print(f"{GREEN}Temporary single-chain object created: {temp_name}{RESET}", flush=True)
                    except Exception as e:
                        print(f"{RED}Failed to create temporary reduced object: {str(e)}{RESET}", flush=True)
                else:
                    print(f"{YELLOW}Reduction declined by user. Continuing without chain reduction for {multi_obj}.{RESET}", flush=True)
                    self.structure_data[multi_obj]["reduction_used"] = False
                    self.structure_data[multi_obj]["reduction_diagnostic"] = "User declined suggested reduction."
                break

    def choose_reference(self):
        loaded = self.loaded_objects
        if self.request.reference_override:
            requested = self.request.reference_override.upper()
            for obj in loaded:
                # An AST-XXXX -reference (the way to name an imported structure
                # as the reference) matches through requested_id, since neither
                # obj nor pdb_id holds the AST-XXXX token once the structure's
                # display and object names are resolved.
                if obj == requested or self.structure_data[obj]["pdb_id"].upper() == requested or self.structure_data[obj].get("requested_id", "") == requested:
                    return obj, "Manually specified by user (-reference" + requested + ")."
            self.warnings.append("Requested reference '" + requested + "' was not loaded; automatic selection was used.")
        # Shared with TERMINI via astra3_core so both commands select a
        # reference by the same rule rather than each having its own.
        ligand_counts = {obj: len(self.structure_data[obj]["process_result"]["ligand_info"]) for obj in loaded}
        fewest = min(ligand_counts.values()) if ligand_counts else 0
        tied = [obj for obj in loaded if ligand_counts[obj] == fewest]
        tie_scores = None
        if len(tied) > 1:
            try:
                tie_scores = reference_tie_scores(
                    loaded, {obj: self.structure_data[obj]["process_result"].get("chain_list", []) for obj in loaded})
            except Exception as e:  # noqa: BLE001
                self.warnings.append(f"Sequence comparison for choosing the reference failed ({e}); "
                                     "the tie was broken by resolved residues and structure ID only.")
        labels = {obj: self.structure_data[obj]["pdb_id"] for obj in loaded}
        return select_reference_by_ligand_count(loaded, ligand_counts, tie_scores=tie_scores, labels=labels)

    def apply_presentation_colors(self, reference_obj):
        non_reference_index = 0
        for obj in self.loaded_objects:
            check_for_cancellation()

            # Determine protein overlay color
            if obj == reference_obj:
                protein_color = OVERLAY_PROTEIN_COLORS[0]
            else:
                non_reference_index += 1
                protein_color = OVERLAY_PROTEIN_COLORS[1 + ((non_reference_index - 1) % (len(OVERLAY_PROTEIN_COLORS) - 1))]

            # --- PROTEIN COLORING ---
            for chain in self.structure_data[obj]["process_result"]["chain_list"]:
                target_sel = f"{obj} and chain {chain} and polymer.protein"
                cmd.color(protein_color, target_sel)

            # --- LIGAND COLORING ---
            for ligand_index, ligand in enumerate(self.structure_data[obj]["process_result"]["ligand_info"]):
                ligand_color = OVERLAY_LIGAND_COLORS[ligand_index % len(OVERLAY_LIGAND_COLORS)]
                cmd.color(engine_color(ligand_color), ligand["sel_name"])

            # --- TERMINI COLORING ---
            apply_terminus_colors(self.structure_data[obj]["n_term_name"], self.structure_data[obj]["c_term_name"])

    def align_to(self, reference_obj):
        ref_chain_list = self.structure_data[reference_obj]["process_result"].get("chain_list", [])
        for obj in self.loaded_objects:
            check_for_cancellation()
            if obj == reference_obj:
                continue
            # Whole-structure sequence identity check, same severity bands and
            # confirm-to-proceed behavior as TERMINI's equivalent check -- see
            # compute_overall_sequence_identity's docstring. A warning only;
            # declining skips alignment for this one comparison structure, the
            # rest of the run continues.
            cmp_chain_list = self.structure_data[obj]["process_result"].get("chain_list", [])
            try:
                overall_identity = compute_overall_sequence_identity(reference_obj, ref_chain_list, obj, cmp_chain_list)
                # Full figures for the report. The warning above only needs a
                # single number; the report needs similarity and per-sequence
                # coverage too, so the whole-structure comparison can be read
                # the same way as the per-terminus one.
                self.structure_data[obj]["whole_structure_sequence"] = \
                    compute_whole_structure_sequence_metrics(reference_obj, ref_chain_list, obj, cmp_chain_list)
            except Exception as e:
                print(f"{YELLOW}Could not compute overall sequence identity for {self.structure_data[obj]['pdb_id']}: {e}{RESET}", flush=True)
                overall_identity = None
            if overall_identity is not None:
                proceed, (severity, sev_message) = prompt_overall_sequence_identity(
                    self.structure_data[reference_obj]["pdb_id"], self.structure_data[obj]["pdb_id"], overall_identity,
                )
                if severity not in ("none", "info"):
                    self.warnings.append(
                        f"{self.structure_data[obj]['pdb_id']}: {overall_identity*100:.0f}% overall sequence "
                        f"identity vs reference {self.structure_data[reference_obj]['pdb_id']}: {sev_message}"
                    )
                if not proceed:
                    self.alignment_results[obj] = {"success": False, "error": "Skipped by user due to low sequence identity."}
                    continue
            try:
                src = self.structure_data[obj].get("alignment_obj", obj)
                tgt = self.structure_data[reference_obj].get("alignment_obj", reference_obj)
                # The fit may be computed on a single-chain copy (homomer
                # reduction), but the structure itself is what has to move:
                # the copy is deleted before the session and images are made.
                move = (src,) if src == obj else (src, obj)
                result = measure.superpose(src, tgt, move=move)
                check_for_cancellation()
                self.alignment_results[obj] = {"success": True, "rmsd": result["rmsd"], "atoms": result["atoms"],
                                               "residues": result["residues"], "paired_atoms": result["paired_atoms"],
                                               "chain_pairs": result["chain_pairs"]}
                print(f"{GREEN}Aligned {self.structure_data[obj]['pdb_id']} to {self.structure_data[reference_obj]['pdb_id']}: {WHITE}\033[1mRMSD {result['rmsd']:.3f} Å ({result['atoms']} atoms)\033[0m{RESET}", flush=True)
            except (KeyboardInterrupt, OperationCancelled):
                raise
            except Exception as error:
                self.alignment_results[obj] = {"success": False, "error": str(error)}
                self.warnings.append(self.structure_data[obj]["pdb_id"] + ": alignment failed (" + str(error) + ").")
                print(f"{RED}{self.structure_data[obj]['pdb_id']}: alignment failed ({error}).{RESET}", flush=True)

    def calculate_pairwise_rmsd(self):
        if len(self.loaded_objects) > 8:
            self.warnings.append("Pairwise RMSD matrix skipped: more than 8 structures were loaded.")
            return
        for obj_a, obj_b in itertools.combinations(self.loaded_objects, 2):
            check_for_cancellation()
            try:
                src_a = self.structure_data[obj_a].get("alignment_obj", obj_a)
                src_b = self.structure_data[obj_b].get("alignment_obj", obj_b)
                # Measured only: nothing is moved.
                self.pairwise_matrix[(obj_a, obj_b)] = measure.superpose(src_a, src_b, ca_only=True)["rmsd"]
                check_for_cancellation()
            except (KeyboardInterrupt, OperationCancelled):
                raise
            except Exception:
                self.pairwise_matrix[(obj_a, obj_b)] = None

    def export(self, reference_obj, reference_reason):
        check_for_cancellation()
        ids = [self.structure_data[obj]["pdb_id"] for obj in self.loaded_objects]
        output_dir, session_dir, images_dir = get_overlay_output_folders(ids)
        report_cleared_images(clear_stale_run_images(images_dir), images_dir, self.warnings)
        for tmp in list(self.reduction_temp_objects):
            try:
                if tmp in cmd.get_names("objects"):
                    cmd.delete(tmp)
            except Exception:
                pass
        purge_scratch_objects()
        save_session("Overlay_Session", session_dir, structure_labels=viewer_structure_labels(self.structure_data))
        check_for_cancellation()
        temp_render_name = "OVERLAY_RENDER_TMP"
        try:
            selection_expr = " or ".join(self.loaded_objects)
            if temp_render_name in cmd.get_names("objects"):
                cmd.delete(temp_render_name)
            check_for_cancellation()
            if self.request.image_skip or self.request.render_only:
                print(f"{YELLOW}Images skipped by user.{RESET}", flush=True)
            else:
                os.makedirs(images_dir, exist_ok=True)
                # The combined views draw the loaded objects themselves. Merging
                # them into one object would join structures that share chain
                # and residue numbering into a single broken cartoon trace.
                render_views(selection_expr, images_dir, self.request.image_quality,
                             frame_selection=selection_expr, label="aligned overlay")
                check_for_cancellation()
                # Per-pair sets, one subfolder per comparison structure, the
                # same layout TERMINI writes. The combined shot above answers
                # "do these all superimpose"; it cannot answer "where does
                # THIS one differ from the reference", because with more than
                # two structures every comparison is drawn over every other.
                # render_views draws only what its selection names, so each
                # pass here is genuinely that pair alone.
                ref_pid = self.structure_data[reference_obj]["pdb_id"]
                # With two structures there is one comparison, and the combined
                # views above already show exactly that pair; drawing it again
                # into a subfolder would only duplicate them. TERMINI follows
                # the same rule.
                pair_objs = [o for o in self.loaded_objects if o != reference_obj]
                for cmp_obj in (pair_objs if len(pair_objs) > 1 else []):
                    if cmp_obj == reference_obj:
                        continue
                    check_for_cancellation()
                    cmp_pid = self.structure_data[cmp_obj]["pdb_id"]
                    # Named for the object, matching how TERMINI names its own
                    # per-comparison folders, so both run types lay out their
                    # images the same way on disk.
                    pair_dir = os.path.join(images_dir, cmp_obj)
                    os.makedirs(pair_dir, exist_ok=True)
                    pair_selection = reference_obj + " or " + cmp_obj
                    print(f"{YELLOW}Rendering {ref_pid} vs {cmp_pid}...{RESET}", flush=True)
                    render_views(pair_selection, pair_dir, self.request.image_quality,
                                 frame_selection=pair_selection,
                                 label=f"{ref_pid} vs {cmp_pid}")
        finally:
            try:
                if temp_render_name in cmd.get_names("objects"):
                    cmd.delete(temp_render_name)
            except Exception:
                pass
        if not self.request.report_skip and not self.request.render_only:
            report = build_overlay_report(self.loaded_objects, self.structure_data, reference_obj, reference_reason, self.alignment_results, self.pairwise_matrix, self.warnings)
            report_path = os.path.join(session_dir, "Overlay_Report.txt")
            with open(report_path, "w", encoding="utf-8") as handle:
                handle.write(report)
                structures_missing = {self.structure_data[o]["pdb_id"]: self.structure_data[o].get("missing_residues", None) for o in self.loaded_objects}
                structures_missing_sources = {self.structure_data[o]["pdb_id"]: self.structure_data[o].get("header_info", {}).get("missing_residues_source") for o in self.loaded_objects}
                lines_acc = []
                structures_unobserved = {
                    self.structure_data[o]["pdb_id"]: (self.structure_data[o].get("process_result") or {}).get("unobserved_residues")
                    for o in self.loaded_objects
                }
                append_warnings_structural_notes(lines_acc, structures_missing,
                                                 missing_residues_sources=structures_missing_sources,
                                                 structures_unobserved=structures_unobserved,
                                                 structures_unobserved_deposited={
                                                     self.structure_data[o]["pdb_id"]:
                                                         (self.structure_data[o].get("process_result") or {}).get(
                                                             "unobserved_residues_deposited")
                                                     for o in self.loaded_objects})
                if lines_acc:
                    handle.write("\n".join(lines_acc))
            check_for_cancellation()
            print(f"{GREEN}Overlay report saved: {report_path}{RESET}", flush=True)
            try:
                analysis_id = "Overlay_" + "_".join(ids)
                command_str = reproducing_command(
                    "OVERLAY", self.request.structure_ids, self.request.format_map, self.request.reference_override,
                    self.request.image_quality,
                    images_rendered=not (self.request.image_skip or self.request.render_only),
                    image_skip=self.request.image_skip, csv_export=self.request.csv_export)
                overlay_run_parameters = {"mode": "overlay", "image_quality": self.request.image_quality,
                                          "images_rendered": not (getattr(self.request, "image_skip", False)
                                                                  or getattr(self.request, "render_only", False))}
                generate_html_report(output_dir, analysis_id, command_str, self.structure_data, self.alignment_results, self.pairwise_matrix, self.warnings, reference_obj=reference_obj, reference_reason=reference_reason,
                                     run_parameters=overlay_run_parameters)
            except Exception as e:
                print(f"{YELLOW}Failed to generate HTML report: {e}{RESET}", flush=True)
            try:
                generate_json_export(output_dir, analysis_id, command_str, self.structure_data, self.alignment_results, self.pairwise_matrix, self.warnings, reference_obj=reference_obj, reference_reason=reference_reason,
                                     run_parameters=overlay_run_parameters)
            except Exception as e:
                print(f"{YELLOW}Failed to generate JSON export: {e}{RESET}", flush=True)
            if self.request.csv_export:
                try:
                    generate_overlay_csv(output_dir, self.structure_data, self.alignment_results, self.pairwise_matrix, self.warnings, reference_obj=reference_obj, reference_reason=reference_reason)
                except Exception as e:
                    print(f"{YELLOW}Failed to generate CSV export: {e}{RESET}", flush=True)
        print(f"{BLUE}Output folder: {output_dir}{RESET}", flush=True)
        return ids

    def cleanup(self):
        try:
            for tmp in list(self.reduction_temp_objects):
                try:
                    if tmp in cmd.get_names("objects"):
                        cmd.delete(tmp)
                except Exception:
                    pass
            for obj in self.loaded_objects:
                try:
                    cmd.delete(obj)
                except Exception:
                    pass
            for data in self.structure_data.values():
                try:
                    cmd.delete(data["n_term_name"])
                except Exception:
                    pass
                try:
                    cmd.delete(data["c_term_name"])
                except Exception:
                    pass
        except KeyboardInterrupt:
            pass


class AlignmentOverlayHandler:
    def execute(self, request):
        execution = OverlayExecution(request)
        try:
            structure_ids = execution.validate()
            if structure_ids is None:
                return None
            execution.load_and_prepare(structure_ids, format_map=request.format_map)

            # Intra-structure homomer detection: catches a structure with
            # redundant chains WITHIN ITSELF (e.g. a homodimer where chain A
            # and chain B are the same protein) -- a different, narrower
            # question than detect_homomer_reduction_candidates below, which
            # only compares chain counts ACROSS structures and can never fire
            # when, say, every loaded structure has the same number of chains,
            # or only one structure is loaded so far.
            for obj in list(execution.loaded_objects):
                d = execution.structure_data[obj]
                try:
                    homomer_clusters = detect_intra_structure_homomer(obj, d["process_result"].get("chain_list", []))
                    if homomer_clusters:
                        decisions, decided = prompt_intra_structure_homomer_reduction(
                            d["pdb_id"], homomer_clusters,
                            # The request is this method's parameter; the
                            # handler itself is a stateless singleton and
                            # holds no request.
                            auto_decision=request.homomer_auto_decision, priority_order=request.homomer_priority_order,
                            ligand_info=d["process_result"].get("ligand_info"),
                            missing_residues_map=d.get("header_info", {}).get("missing_residues_map"),
                            assemblies=((d.get("header_info") or {}).get("file_annotations") or {}).get("assemblies"),
                            assembly_fallback=request.homomer_assembly_fallback,
                        )
                        applied, new_process_result = apply_intra_structure_homomer_reduction(
                            obj, homomer_clusters, decisions, selection_suffix="_" + obj,
                            deposited_unobserved=mmcif_unobserved_map(d.get("header_info")),
                        )
                        if new_process_result is not None:
                            d["process_result"] = carry_water_counts(d.get("process_result"), new_process_result)
                            d["n_term_name"] = new_process_result["n_term_name"]
                            d["c_term_name"] = new_process_result["c_term_name"]
                            d["alignment_obj"] = obj
                            d["chain_reduction_applied"] = [
                                {"removed_chain": removed, "kept_chain": kept} for removed, kept in applied
                            ]
                        record_intra_reduction(d, applied, homomer_clusters, decided)
                        execution.warnings.extend(
                            summarize_chain_reduction(applied, d["pdb_id"], "OVERLAY", decided))
                except Exception as e:
                    print(f"{YELLOW}Intra-structure homomer detection encountered an error for {d['pdb_id']} "
                          f"and will be skipped: {e}{RESET}", flush=True)

            try:
                execution.detect_homomer_reduction_candidates()
            except Exception as e:
                print(f"{YELLOW}Homomer detection encountered an error and will be skipped: {str(e)}{RESET}", flush=True)
            if len(execution.loaded_objects) < 2:
                print(f"{RED}Fewer than two structures loaded successfully. Cannot align.{RESET}", flush=True)
                return None
            reference_obj, reason = execution.choose_reference()
            print(f"{WHITE}Reference structure: {VIOLET}{execution.structure_data[reference_obj]['pdb_id']}{RESET}", flush=True)
            print(f"{WHITE}Reason: {reason}{RESET}", flush=True)
            execution.apply_presentation_colors(reference_obj)
            execution.align_to(reference_obj)
            execution.calculate_pairwise_rmsd()
            return execution.export(reference_obj, reason)
        except (KeyboardInterrupt, OperationCancelled):
            cancel_active_operation()
            print(f"{YELLOW}OVERLAY cancelled. Cleaning up and returning to the PDB prompt.{RESET}", flush=True)
            return None
        finally:
            execution.cleanup()
            active_operation_objects.clear()
            clear_cancellation()


OVERLAY_OPERATIONS = OverlayOperationRegistry()
OVERLAY_OPERATIONS.register("ALIGN", AlignmentOverlayHandler())


class TerminiExecution:
    """Comparative N-/C-terminus structural analysis (the TERMINI command).

    Reuses OverlayExecution purely as a loading/alignment engine (composition,
    not inheritance) -- OverlayExecution already knows how to resolve
    AST-XXXX/PDB IDs, load structures, build structure_data, and run
    cmd.align, none of which is specific to OVERLAY's own reference-selection
    or homomer-reduction logic. TerminiExecution only adds what's actually
    new: per-chain terminus geometry (via compare_termini), visualization,
    and the TERMINI-specific output artifacts.

    The first structure_id is always the reference; every other structure
    is independently aligned and compared to it. No pairwise matrix is
    computed (unlike OVERLAY) since TERMINI's comparisons are always
    reference-vs-each, never comparison-vs-comparison.
    """

    def __init__(self, structure_ids, image_quality="medium", image_skip=False,
                 report_skip=False, render_only=False, csv_export=False,
                 tip_n=5, orientation_n=5, local_rmsd_window=TERMINUS_WINDOW, format_map=None,
                 homomer_auto_decision=None, homomer_priority_order=None, homomer_assembly_fallback=None,
                 termini_auto_decision=None, reference_override=None):
        self.structure_ids = structure_ids
        self.reference_override = reference_override
        self.image_quality = image_quality
        self.image_skip = image_skip
        self.report_skip = report_skip
        self.render_only = render_only
        self.csv_export = csv_export
        self.tip_n = tip_n
        self.orientation_n = orientation_n
        self.local_rmsd_window = local_rmsd_window
        self.format_map = format_map or {}
        self.homomer_auto_decision = homomer_auto_decision
        self.homomer_priority_order = homomer_priority_order
        self.homomer_assembly_fallback = homomer_assembly_fallback
        self.termini_auto_decision = termini_auto_decision
        self._overlay_engine = None
        self.results = {}       # {comparison_obj: {chain: {"N":..., "C":...}}}
        self.warnings = []
        self.failed_comparisons = []
        # {structure_id_upper: [{"readout_name":..., "value":...,
        # "terminus":..., "units":...}, ...]} Auto-detected from readouts.csv
        # in the working folder, if present (see load_functional_readouts) --
        # empty dict when no such file exists, so every downstream consumer
        # can treat "no readouts" and "file not found" identically without a
        # special case.
        self.functional_readouts = {}

    def _recolor_for_reference(self, reference_obj):
        """Give the reference the reference colours once it is known.

        Colours are assigned as structures load, before a reference can be
        chosen: the automatic choice compares every structure's ligands, so
        it needs all of them loaded first. When the chosen reference was not
        the first structure loaded, it had a comparison hue and whichever
        structure loaded first had the grey. OVERLAY colours by reference
        already; this brings TERMINI in line, reusing the same per-chain
        palette order process_structure applied, and puts the green/red
        terminus windows back on top.
        """
        engine = self._overlay_engine
        loaded = list(engine.loaded_objects)
        if not loaded or loaded[0] == reference_obj or reference_obj not in engine.structure_data:
            return
        order = [reference_obj] + [o for o in loaded if o != reference_obj]
        for index, obj in enumerate(order):
            data = engine.structure_data.get(obj) or {}
            chain_info = (data.get("process_result") or {}).get("chain_info") or []
            palette = structure_palette(index)
            try:
                for chain_index, info in enumerate(chain_info):
                    color = palette[chain_index % len(palette)]
                    cmd.color(color, f"{obj} and chain {info['chain']} and polymer.protein")
                    info["color"] = color
                if data.get("n_term_name") and data.get("c_term_name"):
                    apply_terminus_colors(data["n_term_name"], data["c_term_name"])
            except Exception as recolor_error:  # noqa: BLE001
                self.warnings.append(f"{data.get('pdb_id', obj)}: could not apply reference colours "
                                     f"({recolor_error}).")

    def validate(self):
        unique_ids, duplicates = [], set()
        for sid in self.structure_ids:
            u = sid.upper()
            if u in unique_ids:
                duplicates.add(u)
            else:
                unique_ids.append(u)
        if duplicates:
            print(f"{RED}Duplicate structure ID(s) requested: {', '.join(sorted(duplicates))}. Please choose different structures.{RESET}", flush=True)
            return None
        if len(unique_ids) < 2:
            print(f"{RED}TERMINI requires a reference structure and at least one comparison structure.{RESET}", flush=True)
            return None
        return unique_ids

    def run(self):
        structure_ids = self.validate()
        if structure_ids is None:
            return None
        forget_protein_mean_b()

        try:
            self.functional_readouts = load_functional_readouts()
        except Exception as e:
            print(f"{YELLOW}Could not load readouts.csv: {e}{RESET}", flush=True)
            self.functional_readouts = {}
        matched_ids = [sid for sid in structure_ids if sid.upper() in self.functional_readouts]
        if matched_ids:
            print(f"{WHITE}Functional readouts found in readouts.csv for: {', '.join(matched_ids)}{RESET}", flush=True)

        overlay_request = OverlayRequest(structure_ids, reference_override=self.reference_override,
                                         homomer_auto_decision=self.homomer_auto_decision,
                                         homomer_priority_order=self.homomer_priority_order,
                                         homomer_assembly_fallback=self.homomer_assembly_fallback)
        self._overlay_engine = OverlayExecution(overlay_request)
        self._overlay_engine.load_and_prepare(structure_ids, format_map=self.format_map)
        # Notes from loading (a structure that could not be loaded, an ensemble
        # reduced to its first model, a chain too short for termini) belong in
        # the TERMINI report as well.
        self.warnings.extend(w for w in self._overlay_engine.warnings if w not in self.warnings)

        # Checked here for every structure TERMINI actually loaded (reference
        # and comparisons alike), before alignment, so the user is informed
        # regardless of which structure the redundancy is in.
        for obj in list(self._overlay_engine.loaded_objects):
            d = self._overlay_engine.structure_data[obj]
            try:
                homomer_clusters = detect_intra_structure_homomer(obj, d["process_result"].get("chain_list", []))
                if homomer_clusters:
                    decisions, decided = prompt_intra_structure_homomer_reduction(
                        d["pdb_id"], homomer_clusters,
                        auto_decision=self.homomer_auto_decision, priority_order=self.homomer_priority_order,
                        ligand_info=d["process_result"].get("ligand_info"),
                        missing_residues_map=d.get("header_info", {}).get("missing_residues_map"),
                        assemblies=((d.get("header_info") or {}).get("file_annotations") or {}).get("assemblies"),
                        assembly_fallback=self.homomer_assembly_fallback,
                    )
                    applied, new_process_result = apply_intra_structure_homomer_reduction(
                        obj, homomer_clusters, decisions, selection_suffix="_" + obj,
                        deposited_unobserved=mmcif_unobserved_map(d.get("header_info")),
                    )
                    if new_process_result is not None:
                        d["process_result"] = carry_water_counts(d.get("process_result"), new_process_result)
                        d["n_term_name"] = new_process_result["n_term_name"]
                        d["c_term_name"] = new_process_result["c_term_name"]
                        d["alignment_obj"] = obj
                        d["chain_reduction_applied"] = [
                            {"removed_chain": removed, "kept_chain": kept} for removed, kept in applied
                        ]
                    record_intra_reduction(d, applied, homomer_clusters, decided)
                    self.warnings.extend(summarize_chain_reduction(applied, d["pdb_id"], "TERMINI", decided))
            except Exception as e:
                print(f"{YELLOW}Intra-structure homomer detection encountered an error for {d['pdb_id']} "
                      f"and will be skipped: {e}{RESET}", flush=True)
        check_for_cancellation()

        # Reference selection matches OVERLAY: the structure with the fewest
        # bound ligands, unless one was named with -reference.
        #
        # Fewest ligands is the same rule and the same reasoning as OVERLAY --
        # the less ligand-encumbered structure is the more neutral baseline.
        reference_obj, reference_reason = self._overlay_engine.choose_reference()
        self.warnings.extend(w for w in self._overlay_engine.warnings if w not in self.warnings)
        if reference_obj is None:
            print(f"{RED}No reference structure could be selected. Cannot continue.{RESET}", flush=True)
            self._overlay_engine.cleanup()
            return None
        self.reference_reason = reference_reason
        ref_pid = self._overlay_engine.structure_data[reference_obj]["pdb_id"]
        print(f"{GREEN}Reference structure: {ref_pid} -- {reference_reason}{RESET}", flush=True)

        comparison_objs = [o for o in self._overlay_engine.loaded_objects if o != reference_obj]
        if not comparison_objs:
            print(f"{RED}No comparison structures loaded successfully. Cannot continue.{RESET}", flush=True)
            self._overlay_engine.cleanup()
            return None

        print(f"{WHITE}Reference structure: {VIOLET}{self._overlay_engine.structure_data[reference_obj]['pdb_id']}{RESET}", flush=True)
        self._recolor_for_reference(reference_obj)
        self._overlay_engine.align_to(reference_obj)
        check_for_cancellation()

        ref_data = self._overlay_engine.structure_data[reference_obj]
        ref_chain_list = ref_data["process_result"]["chain_list"]

        for cmp_obj in comparison_objs:
            check_for_cancellation()
            cmp_data = self._overlay_engine.structure_data[cmp_obj]
            align_res = self._overlay_engine.alignment_results.get(cmp_obj, {})
            if align_res.get("success") is False:
                skip_msg = cmp_data["pdb_id"] + ": alignment to reference failed, TERMINI comparison skipped."
                print(f"{RED}{skip_msg}{RESET}", flush=True)
                self.warnings.append(skip_msg)
                self.failed_comparisons.append(cmp_data["pdb_id"])
                continue

            cmp_chain_list = cmp_data["process_result"]["chain_list"]

            # Whole-structure sequence identity check: independent of the per-
            # chain matching below, this asks the broader question "are these
            # plausibly the same protein at all", with a severity-banded
            # warning (and, for low-identity bands, a confirm-to-proceed
            # prompt) since alignment/displacement/SASA /B-factor metrics all
            # become hard to interpret meaningfully once two structures aren't
            # actually the same protein or a close homolog. Purely a warning
            # -- declining skips only this one comparison, the rest of the run
            # continues normally.
            try:
                overall_identity = compute_overall_sequence_identity(reference_obj, ref_chain_list, cmp_obj, cmp_chain_list)
                cmp_data["whole_structure_sequence"] = \
                    compute_whole_structure_sequence_metrics(reference_obj, ref_chain_list, cmp_obj, cmp_chain_list)
            except Exception as e:
                print(f"{YELLOW}Could not compute overall sequence identity for {cmp_data['pdb_id']}: {e}{RESET}", flush=True)
                overall_identity = None
            if overall_identity is not None:
                proceed, (severity, sev_message) = prompt_overall_sequence_identity(
                    ref_data["pdb_id"], cmp_data["pdb_id"], overall_identity,
                )
                if severity not in ("none", "info"):
                    self.warnings.append(
                        f"{cmp_data['pdb_id']}: {overall_identity*100:.0f}% overall sequence identity "
                        f"vs reference {ref_data['pdb_id']}: {sev_message}"
                    )
                if not proceed:
                    self.failed_comparisons.append(cmp_data["pdb_id"])
                    continue

            try:
                chain_pairs = match_chains_across_structures(reference_obj, ref_chain_list, cmp_obj, cmp_chain_list)
            except Exception as e:
                print(f"{YELLOW}Chain matching failed for {cmp_data['pdb_id']} vs reference: {e}{RESET}", flush=True)
                chain_pairs = []
            if not chain_pairs:
                skip_msg = (cmp_data["pdb_id"] + ": no protein chains could be matched to the reference "
                           "(by ID or by sequence); TERMINI comparison skipped.")
                # Printed immediately, not just recorded for the report -- a
                # comparison being dropped entirely is a severe outcome a user
                # needs to notice in the moment, not discover later by opening
                # the HTML/JSON after the run has finished.
                print(f"{RED}{skip_msg}{RESET}", flush=True)
                self.warnings.append(skip_msg)
                self.failed_comparisons.append(cmp_data["pdb_id"])
                continue

            for ref_chain, cmp_chain, match_method in chain_pairs:
                if match_method == "sequence":
                    self.warnings.append(
                        f"{cmp_data['pdb_id']}: chain {cmp_chain} was matched to reference chain {ref_chain} "
                        f"by sequence similarity (chain IDs differ). Verify this pairing is the intended one."
                    )

            per_chain_results = {}
            for ref_chain, cmp_chain, match_method in chain_pairs:
                check_for_cancellation()
                chain_key = ref_chain if ref_chain == cmp_chain else f"{ref_chain}/{cmp_chain}"
                per_chain_results[chain_key] = compare_termini(
                    reference_obj, cmp_obj, ref_chain,
                    tip_n=self.tip_n, orientation_n=self.orientation_n,
                    local_rmsd_window=self.local_rmsd_window,
                    cmp_chain=cmp_chain,
                )

                # Gather both termini's findings before printing/asking
                # anything, so N and C are shown together in one combined
                # summary instead of two separate near-duplicate blocks.
                match_results = {}
                for terminus in ("N", "C"):
                    metrics = per_chain_results[chain_key][terminus]
                    if metrics is None:
                        self.warnings.append(
                            f"{cmp_data['pdb_id']} chain {cmp_chain} (ref chain {ref_chain}): {terminus}-terminus "
                            f"could not be measured (fewer resolved residues than required for the tip/orientation window)."
                        )
                        match_results[terminus] = None
                        continue
                    match_results[terminus] = metrics.get("sequence_match")

                offset_needed = {t: mr for t, mr in match_results.items() if mr is not None and mr.get("offset", 0) != 0}
                approved = False
                approved_termini = []
                auto_held = {}
                if offset_needed:
                    # One combined summary, as before, but the answer is
                    # recorded per terminus: the two ends can genuinely differ
                    # (one lines up, the other does not), and forcing a single
                    # decision on both discards that.
                    decision = show_termini_offset_and_confirm(
                        ref_data["pdb_id"], cmp_data["pdb_id"], ref_chain,
                        offset_needed.get("N"), offset_needed.get("C"),
                        window=self.tip_n + self.orientation_n, cmp_chain=cmp_chain,
                        auto_decision=self.termini_auto_decision,
                    )
                    approved = bool(decision.get("approved"))
                    approved_termini = list(decision.get("termini") or [])
                    auto_held = dict(decision.get("auto_held") or {})
                    if decision.get("escalate"):
                        # A more thorough alignment was requested. The matches
                        # are recomputed with a wider search before the same
                        # summary is shown again, so the interaction the person
                        # sees is unchanged apart from better numbers.
                        escalated_terminus = decision.get("escalate")
                        print(f"{YELLOW}Running a more thorough alignment for the "
                              f"{escalated_terminus}-terminus...{RESET}", flush=True)
                        try:
                            improved = match_terminus_windows(
                                reference_obj, cmp_obj, ref_chain, escalated_terminus,
                                window=self.tip_n + self.orientation_n,
                                search_extra=TERMINUS_SEARCH_EXTRA_ADVANCED, cmp_chain=cmp_chain)
                        except Exception:
                            improved = None
                        if improved is not None:
                            match_results[escalated_terminus] = improved
                            if escalated_terminus in offset_needed:
                                offset_needed[escalated_terminus] = improved
                        decision = show_termini_offset_and_confirm(
                            ref_data["pdb_id"], cmp_data["pdb_id"], ref_chain,
                            offset_needed.get("N"), offset_needed.get("C"),
                            window=self.tip_n + self.orientation_n, cmp_chain=cmp_chain,
                            auto_decision=self.termini_auto_decision,
                            allow_advanced=False,  # this is the deepest analysis available
                        )
                        approved = bool(decision.get("approved"))
                        approved_termini = list(decision.get("termini") or [])
                        auto_held = dict(decision.get("auto_held") or {})

                corrected_termini = []
                for terminus in ("N", "C"):
                    match_result = match_results.get(terminus)
                    if match_result is None:
                        continue

                    offset = match_result.get("offset", 0)
                    if offset != 0:
                        # Coloring, labeling, AND the numeric metrics (tip
                        # displacement, orientation, TPV, local RMSD) all stay
                        # on the original naive window unless the combined
                        # prompt above was approved.
                        if approved and terminus in approved_termini:
                            try:
                                reconcile_termini_coloring(
                                    reference_obj, cmp_obj, ref_chain, terminus, match_result,
                                    ref_data["n_term_name"], ref_data["c_term_name"],
                                    cmp_data["n_term_name"], cmp_data["c_term_name"],
                                    ref_data["pdb_id"], cmp_data["pdb_id"],
                                    cmp_chain=cmp_chain,
                                )
                            except Exception as e:
                                print(f"{YELLOW}Could not reconcile {terminus}-terminus coloring for "
                                      f"{cmp_data['pdb_id']} chain {cmp_chain}: {e}{RESET}", flush=True)
                            try:
                                recomputed = recompute_terminus_metrics(
                                    reference_obj, cmp_obj, ref_chain, terminus, match_result,
                                    tip_n=self.tip_n, orientation_n=self.orientation_n,
                                    local_rmsd_window=self.local_rmsd_window,
                                    cmp_chain=cmp_chain,
                                )
                                corrected_termini.append(terminus)
                                if recomputed is not None:
                                    per_chain_results[chain_key][terminus] = recomputed
                                else:
                                    print(f"{YELLOW}Corrected window for {cmp_data['pdb_id']} chain {cmp_chain} "
                                          f"({terminus}-terminus) was too short to recompute numeric metrics "
                                          f"-- numbers remain on the original naive window.{RESET}", flush=True)
                            except Exception as e:
                                print(f"{YELLOW}Could not recompute {terminus}-terminus metrics for "
                                      f"{cmp_data['pdb_id']} chain {cmp_chain}: {e}{RESET}", flush=True)
                            trimmed_id = cmp_data["pdb_id"] if offset > 0 else ref_data["pdb_id"]
                            n_trim = abs(offset)
                            trimmed_chain = cmp_chain if offset > 0 else ref_chain
                            how = ("automatically (-alwaysmatch)" if self.termini_auto_decision == "always"
                                   else "with user approval")
                            self.warnings.append(
                                f"{cmp_data['pdb_id']} vs reference {ref_data['pdb_id']}, chain {cmp_chain}: "
                                f"{terminus}-terminus window offset-corrected {how} "
                                f"({'first' if terminus == 'N' else 'last'} {n_trim} residue{'s' if n_trim != 1 else ''} "
                                f"of {trimmed_id} chain {trimmed_chain} removed); coloring and numeric metrics "
                                f"reflect the corrected window."
                                + (" The residues were removed from the reference itself, so any later comparison "
                                   "in this run is measured against the trimmed reference." if offset < 0 else "")
                            )
                            if abs(offset) >= LARGE_TERMINUS_OFFSET:
                                # An offset this large is not terminal
                                # disorder: the two structures begin at
                                # different points in the construct (an
                                # expression tag, a cloning scar, a different
                                # domain boundary). Said plainly, because the
                                # corrected window is then measuring a region
                                # one structure has and the other does not
                                # start until much later.
                                self.warnings.append(
                                    f"{cmp_data['pdb_id']} chain {cmp_chain} (ref chain {ref_chain}): the "
                                    f"{terminus}-terminus offset of {abs(offset)} residues is larger than ordinary "
                                    f"terminal disorder. The two structures most likely begin at different points in "
                                    f"the construct. Confirm the corrected window is the region you intended to "
                                    f"compare."
                                )
                        elif terminus in auto_held:
                            held = auto_held[terminus]
                            self.warnings.append(
                                f"{cmp_data['pdb_id']} chain {cmp_chain} (ref chain {ref_chain}): {terminus}-terminus "
                                f"offset correction was not applied automatically. The best match was "
                                f"{held['identity'] * 100:.0f}% identity, below the {held['threshold'] * 100:.0f}% "
                                f"-alwaysmatch requires, so match confidence is too low to correct without review. "
                                f"Coloring and numeric metrics remain on the original naive window, which may not "
                                f"compare corresponding residues."
                            )
                        else:
                            who = "by -nevermatch" if self.termini_auto_decision == "never" else "by the user"
                            self.warnings.append(
                                f"{cmp_data['pdb_id']} chain {cmp_chain} (ref chain {ref_chain}): {terminus}-terminus "
                                f"offset correction was declined {who}; coloring and numeric metrics remain "
                                f"on the original naive window."
                            )
                    elif match_result.get("identity", 1.0) < 1.0:
                        # Offset is 0 (no shift needed) but the termini still
                        # aren't perfectly identical -- e.g. a single
                        # substituted residue, not an insertion or deletion.
                        # Always reported now, with the severity of the
                        # wording still scaled by how low identity actually is
                        # via prompt_terminus_mismatch/ confident_match.
                        prompt_terminus_mismatch(ref_data["pdb_id"], cmp_data["pdb_id"], ref_chain, terminus,
                                                 match_result, window=self.tip_n + self.orientation_n,
                                                 cmp_chain=cmp_chain)
                        self.warnings.append(
                            f"{cmp_data['pdb_id']} chain {cmp_chain} (ref chain {ref_chain}): {terminus}-terminus "
                            f"sequence identity vs reference is {match_result['identity']*100:.0f}% (not 100%); "
                            f"see the sequence comparison for the exact residue(s) that differ."
                        )
                # A correction removes residues from one structure, which
                # changes that structure's surroundings and average B-factor.
                # The other terminus is re-measured on the same corrected
                # structures, so both termini describe what the session holds.
                if corrected_termini:
                    for other in ("N", "C"):
                        if other not in corrected_termini and per_chain_results.get(chain_key, {}).get(other):
                            try:
                                refresh_terminus_surface_metrics(per_chain_results[chain_key][other], reference_obj,
                                                                 cmp_obj, ref_chain, cmp_chain=cmp_chain)
                            except Exception as e:  # noqa: BLE001
                                print(f"{YELLOW}Could not re-measure {other}-terminus SASA and B-factor for "
                                      f"{cmp_data['pdb_id']} chain {cmp_chain}: {e}{RESET}", flush=True)
            self.results[cmp_obj] = per_chain_results

            # Distances from ligands unique to one structure to each terminal
            # centroid. Measured here, after alignment and after any approved
            # offset correction, so both the ligand and the terminus windows
            # are in their final positions.
            try:
                cmp_data["ligand_terminus_distances"] = compute_ligand_terminus_distances(
                    reference_obj, cmp_obj,
                    self._overlay_engine.structure_data[reference_obj].get("process_result"),
                    self._overlay_engine.structure_data[cmp_obj].get("process_result"),
                    per_chain_results)
            except Exception as e:
                self.warnings.append(
                    f"{cmp_data['pdb_id']}: ligand-to-terminus distances could not be computed ({e}). "
                    f"Every other measurement in this run is unaffected."
                )
            refresh_terminus_residue_cache(self._overlay_engine.structure_data, reference_obj)
            refresh_terminus_residue_cache(self._overlay_engine.structure_data, cmp_obj)

            # Checkpoint: measurement is finished and any approved offset
            # correction has been applied, but nothing has been rendered or
            # saved yet. This is the last moment at which the session state
            # and the numbers can still be compared against each other before
            # both are committed to images, a .pse and a report. A structure
            # whose terminus selection is empty or has been recolored by a
            # later step produces a correct-looking report next to a session
            # that shows something else, which is not detectable afterwards.
            problems = []
            for role, obj_name in (("reference", reference_obj), ("comparison", cmp_obj)):
                pr = self._overlay_engine.structure_data[obj_name].get("process_result")
                pid = self._overlay_engine.structure_data[obj_name]["pdb_id"]
                problems += validate_terminus_selections(obj_name, pr, label=f"{pid} ({role})")
                problems += validate_terminus_coloring(obj_name, pr, label=f"{pid} ({role})")
            for chain_key, per_terminus in per_chain_results.items():
                ref_ch, _, cmp_ch = str(chain_key).partition("/")
                cmp_ch = cmp_ch or ref_ch
                for terminus, metrics in per_terminus.items():
                    problems += validate_metrics_match_selection(
                        reference_obj, self._overlay_engine.structure_data[reference_obj].get("process_result"),
                        ref_ch, terminus, metrics, label="reference")
                    problems += validate_metrics_match_selection(
                        cmp_obj, self._overlay_engine.structure_data[cmp_obj].get("process_result"),
                        cmp_ch, terminus, metrics, label="comparison")
            report_state_problems(problems, self.warnings, checkpoint="after terminus reconciliation")

        return reference_obj, comparison_objs

    def draw_visualizations(self):
        """Draw and return {comparison_obj: cgo_name} for every comparison
        that produced at least one measurable terminus.

        NOTE: this method is not currently called by the live TERMINI
        command handler (which draws/renders/deletes its own CGO inline,
        per comparison, immediately after rendering -- see the TERMINI
        command handler's use of draw_termini_vectors directly). Kept for
        now since removing a class method outright is a bigger, less
        obviously-safe change than leaving unused code in place; if
        nothing ever comes to call this, it's a candidate for removal.
        """
        drawn = {}
        for cmp_obj, per_chain_results in self.results.items():
            cgo_name = "termini_viz_" + cmp_obj
            result = draw_termini_vectors(cgo_name, per_chain_results)
            if result:
                drawn[cmp_obj] = result
        return drawn

    def cleanup(self):
        if self._overlay_engine is not None:
            self._overlay_engine.cleanup()


def reproducing_command(name, structure_ids, format_map=None, reference_override=None, image_quality="medium",
                        images_rendered=True, image_skip=False, csv_export=False, extra_flags=()):
    """The command that repeats a multi-structure run with the same options,
    as reports and the Methods text record it."""
    parts = [name]
    for sid in structure_ids:
        parts.append(str(sid))
        if (format_map or {}).get(str(sid).upper()) == "cif":
            parts.append("-mmCIF")
    if reference_override:
        parts.append("-reference" + str(reference_override))
    if images_rendered:
        parts.append("-" + image_quality)
    if image_skip:
        parts.append("-skipimage")
    parts.extend(extra_flags)
    if csv_export:
        parts.append("-csv")
    return " ".join(parts)


def parse_overlay_arguments(tokens):
    """Returns (pdb_ids, reference_override, format_map).

    format_map is {structure_id_upper: "pdb"|"cif"}, built in the same
    single pass as pdb_ids/reference_override rather than via a second,
    separate parsing pass over the same tokens (see
    parse_structure_ids_with_format_flags in astra3_core.py) -- OVERLAY's
    -reference<ID> / -reference <ID> flag can itself consume a following
    token as its value, and only this loop actually knows when that
    happened. Running -mmCIF detection as a fully separate pass over the
    raw tokens would misread that consumed reference-value token as a
    structure ID in its own right, double-counting it. Keeping both
    concerns in one loop is what avoids that.
    """
    pdb_ids = []
    reference_override = None
    format_map = {}
    idx = 0
    while idx < len(tokens):
        token = tokens[idx]
        if token.lower() == MMCIF_FLAG:
            if pdb_ids:
                format_map[pdb_ids[-1]] = "cif"
            idx += 1
            continue
        if token.startswith("-"):
            if token.lower().startswith("-reference"):
                refval = token[len("-reference"):]
                if refval:
                    reference_override = refval.upper()
                elif idx + 1 < len(tokens):
                    reference_override = tokens[idx + 1].upper()
                    idx += 1
            idx += 1
            continue
        pdb_ids.append(token.upper())
        idx += 1
    return pdb_ids, reference_override, format_map


def parse_overlay_invocation(tokens):
    operation = "ALIGN"
    if tokens and OVERLAY_OPERATIONS.has(tokens[0]):
        operation = tokens[0].upper()
        tokens = tokens[1:]
    structure_ids, reference_override, format_map = parse_overlay_arguments(tokens)
    return operation, structure_ids, reference_override, format_map


def _normalize_batch_ids(raw_id_format_pairs):
    """Normalize a list of (structure_id, format) pairs for BATCH
    processing -- uppercases each ID, drops anything blank, and removes
    duplicate IDs while preserving the first occurrence's position (and
    that occurrence's format), so BATCH processes each requested
    structure exactly once, in the order the user listed it.

    Takes (id, format) pairs rather than bare ID strings so a per-line
    '-mmCIF' (inline BATCH) or trailing '-mmCIF' token (BATCH file) can
    ride along with its ID through deduplication, instead of being
    handled as a separate parallel list that could drift out of sync
    with the deduplicated ID list's order/length.
    """
    seen = set()
    normalized = []
    for raw_id, fmt in raw_id_format_pairs:
        sid = raw_id.strip().upper()
        if not sid:
            continue
        if sid in seen:
            continue
        seen.add(sid)
        normalized.append((sid, fmt))
    return normalized


def parse_batch_file(file_path):
    """Read a BATCH input file: one structure ID per line, blank lines and
    lines starting with '#' ignored. A line may optionally end with
    '-mmCIF' (case-insensitive) to request that one structure be fetched
    as mmCIF, e.g. "9BOX -mmCIF" or "9BOX  -mmCIF  # some note".

    Returns (id_format_pairs, error) where id_format_pairs is a list of
    (structure_id, "pdb"|"cif") tuples and error is a human-readable
    string if the file couldn't be read, else None.
    """
    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as fh:
            raw_lines = fh.readlines()
    except Exception as e:
        return [], f"Could not read batch file '{file_path}': {e}"

    pairs = []
    for line in raw_lines:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("#"):
            continue
        # Allow inline trailing comments too, e.g. "1AKE  # reference structure"
        stripped = stripped.split("#", 1)[0].strip()
        if not stripped:
            continue
        tokens = stripped.split()
        fmt = "pdb"
        if tokens and tokens[-1].lower() == MMCIF_FLAG:
            fmt = "cif"
            tokens = tokens[:-1]
        # Everything remaining on the line is treated as the one structure ID
        # for that line (a batch file is one ID per line, not a token stream)
        # -- rejoin defensively in case of stray internal whitespace rather
        # than silently taking only the first token and dropping the rest.
        sid = " ".join(tokens).strip()
        if sid:
            pairs.append((sid, fmt))
    return pairs, None


# ------------------------------------------------------------
# MAIN INTERACTIVE LOOP
# ------------------------------------------------------------
print(f"{WHITE}============================================================{RESET}", flush=True)
print(f"{STAR_LIGHT}        *       .     {STAR_PASTEL}*{RESET}{STAR_LIGHT}        .        {STAR_DARK}*{RESET}{STAR_LIGHT}       .{RESET}", flush=True)
print(f"{STAR_PASTEL}   .       {STAR_LIGHT}*{RESET}{STAR_PASTEL}          *        {STAR_DARK}.{RESET}{STAR_PASTEL}          {STAR_LIGHT}*{RESET}", flush=True)
print(f"{ASTRA_PURPLE}                         ASTRA3{RESET}", flush=True)
print(f"{WHITE}      Structural Analysis Toolkit for PDB Rendering Automation{RESET}", flush=True)
print(f"{WHITE}                         v{ASTRA3_VERSION}{RESET}", flush=True)
print(f"{WHITE}                 Created by Andre Aguirre{RESET}", flush=True)
print(f"{STAR_DARK}   *       {STAR_LIGHT}.        {STAR_PASTEL}*        {STAR_LIGHT}.        {STAR_DARK}*{RESET}", flush=True)
print(f"{WHITE}============================================================{RESET}", flush=True)
print("", flush=True)
print(f"{CYAN}Astra3{RESET}{WHITE} > {engine_name()} ready. Script is loaded.{RESET}", flush=True)
# Read by the desktop app for the engine indicator in its top bar.
print(f"{WHITE}Engine: {engine_label()}{RESET}", flush=True)
print(f"{ASTRA_PURPLE}Working folder: {BASE_DIR_STR}{RESET}", flush=True)
print("", flush=True)
# ------------------------------------------------------------
# The interactive loop. PyMOL runs headless (-cq) with this script as its
# startup script on every platform, so the loop runs on PyMOL's main thread
# and returning from it ends the session.
# ------------------------------------------------------------
def _astra3_main():
    processed_list = []
    purge_orphaned_state()

    while True:
        sys.stdout.flush()
        print(f"{CYAN}Astra3{RESET}{WHITE} > Enter a PDB ID:{RESET}", flush=True)
        try:
            user_input = input("> ").strip()
        except KeyboardInterrupt:
            print(f"\n{YELLOW}Cancelled. Ready for the next command.{RESET}", flush=True)
            continue
        except EOFError:
            # Input closed: the app quit or stopped this session. Exit PyMOL
            # rather than leave an idle process behind.
            cmd.quit()
            break
        if user_input == "":
            continue
        parts = user_input.split()
        pdb_command = parts[0].upper() if parts else ""
        flags = [p.lower() for p in parts[1:]]
        image_quality = "medium"
        image_skip = False
        report_skip = False
        render_only = False
        csv_export = False
        if "-low" in flags:
            image_quality = "low"
        elif "-excellent" in flags:
            image_quality = "excellent"
        if "-skipimage" in flags:
            image_skip = True
        if "-skipreport" in flags:
            report_skip = True
        if "-ro" in flags:
            render_only = True
        if "-csv" in flags:
            csv_export = True
        # TERMINI-specific -- ignored by every other command, same as -csv is
        # effectively single-structure/OVERLAY-oriented but harmless if present
        # elsewhere. Close-ups are on by default (they're the main point of the
        # vector visualization); this is an explicit opt-out for someone who wants
        # the whole-structure views without the extra render time/output.
        termini_skip_closeups = "-skipcloseup" in flags

        # Homomer-reduction auto-decision -- skips the interactive prompt entirely
        # (see prompt_intra_structure_homomer_reduction's own auto_decision
        # parameter). -alwaysreduce always picks a chain via
        # rank_homomer_chain_by_priority; -keephomomers always keeps every chain;
        # -keepassembly keeps the chains of the depositor's preferred biological
        # assembly. Several at once resolve to the more conservative choice, in
        # that order: keeping chains never destroys data, so it's the safer
        # thing to default to on a contradictory command rather than picking
        # one arbitrarily or raising an error mid-run.
        homomer_auto_decision = None
        if "-keephomomers" in flags:
            homomer_auto_decision = "keep"
        elif "-keepassembly" in flags:
            homomer_auto_decision = "assembly"
        elif "-alwaysreduce" in flags:
            homomer_auto_decision = "reduce"

        # What -keepassembly does where the assembly records cannot decide,
        # e.g. "-assemblyfallback:reduce": ask (the default), reduce or keep.
        homomer_assembly_fallback = None
        for flag in flags:
            if flag.startswith("-assemblyfallback:"):
                homomer_assembly_fallback = flag.split(":", 1)[1].strip()
                if homomer_assembly_fallback not in ("ask", "reduce", "keep"):
                    print(f"{YELLOW}{flag} is not ask, reduce or keep; the biological assembly rule falls back to "
                          f"asking.{RESET}", flush=True)
                    homomer_assembly_fallback = None
                break

        # Priority order for -alwaysreduce (and -keepassembly's reduce
        # fallback), e.g. "-reducepriority:missing,leastligands,chainA" --
        # colon-separated from the flag name, comma-separated for the ranked
        # list itself. Falls back to rank_homomer_chain_by_priority's own
        # default ordering when -alwaysreduce is given without this. Flags
        # arrive in lower case, so each criterion is restored to its own name.
        homomer_priority_order = None
        for flag in flags:
            if flag.startswith("-reducepriority:"):
                names = {name.lower(): name for name in ("missing", "leastligands", "mostligands", "chainA")}
                homomer_priority_order = [names.get(tok.strip(), tok.strip())
                                          for tok in flag.split(":", 1)[1].split(",") if tok.strip()]
                break

        # Terminus-offset-correction auto-decision -- same pattern, see
        # show_termini_offset_and_confirm's own auto_decision parameter. TERMINI-
        # specific in practice (single-structure/OVERLAY never call that
        # function), but parsed globally like every other flag here.
        termini_auto_decision = None
        if "-nevermatch" in flags:
            termini_auto_decision = "never"
        elif "-alwaysmatch" in flags:
            termini_auto_decision = "always"

        # Residues built into the chain without a standard backbone
        # (chromophores): counted as protein or kept as ligands without
        # asking. Both present at once keeps them as ligands, the behaviour
        # without either option.
        set_in_chain_residue_policy("ligand" if "-chromophoreligand" in flags
                                    else "protein" if "-chromophoreprotein" in flags else None)

        requested_format = "cif" if MMCIF_FLAG in flags else "pdb"
        command = pdb_command.upper()
        # Every analysis names the engine and version it runs with, so each
        # run's own transcript says which one produced it.
        if command not in ("IMPORT", "CHANGEDIR", "DONE"):
            print(f"{WHITE}Engine: {engine_label()}{RESET}", flush=True)
            palette_note = load_color_palette()
            if palette_note:
                print(palette_note, flush=True)
        # IMPORT
        if command == "IMPORT":
            print(f"{WHITE}Enter file path:{RESET}", flush=True)
            try:
                import_path_raw = input("> ").strip()
            except KeyboardInterrupt:
                print(f"\n{YELLOW}Import cancelled. Ready for the next command.{RESET}", flush=True)
                continue
            # validate_input_file centralizes the existence/file-vs-directory/
            # extension checks this used to do ad hoc with os.path.isfile +
            # os.path.splitext, and additionally resolves the path (handles "." /
            # ".." segments and symlinks via Path.resolve()) rather than using the
            # raw string the person typed -- IMPORT is intentionally unrestricted
            # in WHICH file the person can choose (that's the whole point of the
            # command), only in what TYPE of file, so this doesn't add any new
            # restriction, just resolves + validates the same checks that already
            # existed.
            try:
                # mmCIF is accepted alongside legacy PDB and PyMOL sessions.
                # PyMOL loads it natively, and it is the format the PDB now
                # issues for entries too large for the legacy format, so refusing
                # it locally meant a file Astra3 could fetch itself could not be
                # opened from disk.
                import_path = str(validate_input_file(import_path_raw, [".pdb", ".ent", ".pse", ".cif", ".mmcif", ".gz"]))
                if structure_file_kind(import_path) is None:
                    raise UnsupportedFileTypeError(import_path)
            except InvalidPathError as e:
                print(f"{RED}{e}{RESET}", flush=True)
                continue
            except UnsupportedFileTypeError:
                print(f"{RED}Only .pdb, .ent, .cif, .mmcif and .pse files are supported for import "
                      f"(coordinate files may also be gzip-compressed, e.g. .cif.gz).{RESET}", flush=True)
                continue
            kind = structure_file_kind(import_path)
            if kind != "pse":
                problem = structure_file_problem(import_path)
                if problem:
                    print(f"{RED}Could not import {os.path.basename(import_path)}: {problem}{RESET}", flush=True)
                    continue
            try:
                new_objects, other_objects, renamed, file_parts = load_file_isolated(import_path)
            except KeyboardInterrupt:
                print(f"{YELLOW}Import cancelled. Ready for the next command.{RESET}", flush=True)
                continue
            except Exception as e:
                detail = re.sub(r"^\s*Error:\s*", "", str(e)).strip()
                print(f"{RED}Could not import {os.path.basename(import_path)}: the file could not be read as "
                      f"{'a PyMOL session' if kind == 'pse' else 'a structure'} ({detail}). It may be incomplete "
                      f"or damaged; downloading it again usually fixes this.{RESET}", flush=True)
                continue
            # Arrows, maps and other non-structure objects from a session are
            # not structures to analyze.
            for extra in other_objects:
                try:
                    cmd.delete(extra)
                except Exception:  # noqa: BLE001
                    pass
            if not new_objects:
                print(f"{RED}No protein or nucleic-acid structure was found in {import_path}{RESET}", flush=True)
                continue
            # Astra3 analyzes polymers. A file of only water, or only ligands
            # and ions, would otherwise run the whole pipeline and produce an
            # empty report.
            without_polymer = [o for o in new_objects if cmd.count_atoms(f"({o}) and polymer") == 0]
            if without_polymer:
                for o in without_polymer:
                    only_water = cmd.count_atoms(f"({o}) and not solvent") == 0
                    what = "only water" if only_water else "no protein or nucleic acid (only ligands, ions or other small molecules)"
                    print(f"{RED}{os.path.basename(import_path)}{' (' + o + ')' if len(new_objects) > 1 else ''} "
                          f"contains {what}, so there is nothing for Astra3 to analyze.{RESET}", flush=True)
                    try:
                        cmd.delete(o)
                    except Exception:  # noqa: BLE001
                        pass
                new_objects = [o for o in new_objects if o not in without_polymer]
                if not new_objects:
                    continue
            display_name_base = os.path.basename(import_path)
            # Two imports with the same file name (model.pdb from two folders)
            # would read identically in every report; both are then named with
            # their folder.
            parent = os.path.basename(os.path.dirname(os.path.abspath(import_path))) or "/"
            clashes = [e for e in loaded_structures.values()
                       if os.path.basename(str(e.get("path", ""))).lower() == display_name_base.lower()
                       and os.path.abspath(str(e.get("path", ""))) != os.path.abspath(import_path)]
            if clashes:
                for e in clashes:
                    if e.get("display_name", "").lower() == display_name_base.lower():
                        e_parent = os.path.basename(os.path.dirname(os.path.abspath(e["path"]))) or "/"
                        e["display_name"] = f"{display_name_base} ({e_parent})"
                display_name_base = f"{display_name_base} ({parent})"
            holder = "session" if kind == "pse" else "file"
            if kind == "pse":
                # Measurements, CGOs, maps etc. are not part of a structure and
                # are dropped on every engine: they don't move with the atoms,
                # so OVERLAY/TERMINI superposition would leave them misplaced.
                # (Labels are atom properties; see settle_session_labels.)
                try:
                    from astra3_pse import session_extras
                    extras = session_extras(import_path)
                except Exception:  # noqa: BLE001 -- the session loaded; this is only a notice
                    extras = []
                if extras:
                    kinds = {}
                    for extra_name, extra_kind in extras:
                        kinds.setdefault(extra_kind, []).append(extra_name)
                    listed = "; ".join(f"{len(names)} {k}{'' if len(names) == 1 else 's'} ({', '.join(names)})"
                                       for k, names in kinds.items())
                    print(f"{WHITE}Not imported from the session: {listed}. Only structures and their labels "
                          f"are imported.{RESET}", flush=True)
            if file_parts and len(new_objects) == 1:
                print(f"{WHITE}This {holder} holds {len(file_parts)} structures ({', '.join(file_parts)}), imported as "
                      f"one structure.{RESET}", flush=True)
            elif file_parts:
                print(f"{YELLOW}This {holder} holds {len(file_parts)} structures ({', '.join(file_parts)}) that share chain "
                      f"IDs, so each is imported as a separate structure.{RESET}", flush=True)
            # "IMPORT AST-1234 AST-5678" reuses those IDs; the app sends this
            # when an engine restarts so existing IDs stay valid. Ignored
            # unless there is exactly one free, well-formed ID per structure.
            requested = [p.upper() for p in parts[1:]]
            if requested and (len(requested) != len(new_objects) or len(set(requested)) != len(requested)
                              or any(not re.fullmatch(r"AST-\d{4}", r) or r in loaded_structures for r in requested)):
                print(f"{YELLOW}Requested IDs ({' '.join(requested)}) can't be used for this file; assigning "
                      f"new ones.{RESET}", flush=True)
                requested = []
            own_name = {v: k for k, v in renamed.items()}
            registered_ids = []
            for k, object_name in enumerate(new_objects):
                part = own_name.get(object_name, object_name) if len(new_objects) > 1 else None
                display_name = display_name_base if part is None else f"{display_name_base} ({part})"
                ast_id = register_structure("AST_ID", import_path, object_name, display_name, part=part,
                                            ast_id=requested[k] if requested else None)
                registered_ids.append((ast_id, display_name))
            print(f"{GREEN}Import successful.{RESET}", flush=True)
            for ast_id, display_name in registered_ids:
                print(f"{WHITE}Temporary ID: {CYAN}\033[1m{ast_id}\033[0m{RESET}{WHITE}  Name: {display_name}{RESET}", flush=True)
            print(f"{WHITE}Type: {kind.upper() if kind != 'cif' else 'mmCIF'}{RESET}", flush=True)
            print(f"{YELLOW}Session only. These ID(s) disappear after Astra closes.{RESET}", flush=True)
            print("", flush=True)
            continue
        elif command == "CHANGEDIR":
            # Lets the user update the saved PyMOL executable location from inside
            # a running session (e.g. after moving/updating PyMOL) without needing
            # to quit Astra3 and edit Tools/pymol_path.txt by hand. New path is
            # added as the FIRST line so it becomes the preferred path on next
            # launch, without discarding any previously saved paths (they remain
            # as fallbacks -- see astra3.command's own path-detection logic, which
            # this mirrors).
            tools_dir = os.path.join(BASE_DIR, "Tools")
            pymol_path_file = os.path.join(tools_dir, "pymol_path.txt")
            existing_paths = []
            if os.path.isfile(pymol_path_file):
                with open(pymol_path_file, "r") as fh:
                    existing_paths = [line.strip() for line in fh if line.strip()]
            if existing_paths:
                print(f"{WHITE}Currently saved PyMOL location(s):{RESET}", flush=True)
                for p in existing_paths:
                    print(f"{WHITE}  {p}{RESET}", flush=True)
            else:
                print(f"{WHITE}No PyMOL location is currently saved.{RESET}", flush=True)
            print("", flush=True)
            print(f"{WHITE}Enter the new full path to your PyMOL executable, then press Enter.{RESET}", flush=True)
            if sys.platform == "win32":
                print(f"{WHITE}(Typical Windows path: %LOCALAPPDATA%\\Schrodinger\\PyMOL2\\PyMOLWin.exe){RESET}", flush=True)
            else:
                print(f"{WHITE}(Typical Mac path: /Applications/PyMOL.app/Contents/MacOS/PyMOL){RESET}", flush=True)
            new_path = input("> ").strip()
            # Windows has no real equivalent of Unix's executable bit --
            # os.access(path, os.X_OK) on Windows just checks the file exists,
            # regardless of whether it's genuinely runnable, so relying on it
            # there would be misleading (it would look like a real validation but
            # wouldn't actually validate anything extra beyond existence). Use the
            # same "does this path point at an existing file" check the launcher
            # itself uses on Windows, and keep the stricter executable-bit check
            # on Mac/Linux where it's meaningful.
            if sys.platform == "win32":
                path_is_valid = bool(new_path) and os.path.isfile(new_path)
            else:
                path_is_valid = bool(new_path) and os.path.isfile(new_path) and os.access(new_path, os.X_OK)
            if path_is_valid:
                os.makedirs(tools_dir, exist_ok=True)
                updated_paths = [new_path] + [p for p in existing_paths if p != new_path]
                with open(pymol_path_file, "w") as fh:
                    fh.write("\n".join(updated_paths) + "\n")
                print(f"{GREEN}Saved. This path will be used on the next Astra3 launch:{RESET}", flush=True)
                print(f"{WHITE}{new_path}{RESET}", flush=True)
                print(f"{YELLOW}Note: the currently running PyMOL session is unaffected; this only "
                      f"changes what's used the next time Astra3 starts.{RESET}", flush=True)
            else:
                print(f"{RED}That path doesn't point to a valid executable. Nothing was changed.{RESET}", flush=True)
            print("", flush=True)
        elif command == "DONE":
            if processed_list:
                print(f"{WHITE}Open the Protein_outputs folder?{RESET} {format_yn_prompt()}: ", end="", flush=True)
                open_choice = input().strip().lower()
                if open_choice == "y":
                    # open_path_in_file_manager uses subprocess.run([...]) /
                    # os.startfile (never a shell) instead of the previous
                    # os.system(f'open "{path}"') -- os.system always invokes a
                    # shell to interpret its argument, which was unnecessary here
                    # and is the exact pattern this project's security hardening
                    # pass removes throughout. See astra3_security.py.
                    open_path_in_file_manager(PROTEIN_OUTPUTS_DIR)
            break
        elif command == "-T":
            print(f"{YELLOW}Running -t mode on 1AKE ...{RESET}", flush=True)
            result = run_single_analysis("1AKE", is_test=True, image_quality=image_quality, image_skip=image_skip, report_skip=report_skip, render_only=render_only, csv_export=csv_export)
            if result:
                processed_list.append("TEST(1AKE)")
            print(f"{GREEN}Ready for next command.{RESET}", flush=True)
            print("", flush=True)
        elif command == "BATCH":
            batch_args = parts[1:]
            # Drop any -flags from the argument list before deciding file-vs-
            # inline, so "BATCH 1AKE 4AKE -low" doesn't treat "-low" as a
            # structure ID. -mmCIF is excluded from this drop (kept alongside the
            # IDs) since unlike -low/-skipimage/etc it's per-ID, not a run-wide
            # flag -- parse_structure_ids_with_format_flags below is what actually
            # attaches it to the ID immediately preceding it.
            batch_args_no_flags = [a for a in batch_args if not a.startswith("-") or a.lower() == MMCIF_FLAG]
            if not batch_args_no_flags:
                print(f"{RED}BATCH requires structure IDs or a batch file, e.g. BATCH 1AKE 4AKE 2AK3 or BATCH batch.txt{RESET}", flush=True)
                print("", flush=True)
            else:
                # A single argument ending in a common text-file extension is
                # treated as a batch file; anything else (or multiple arguments)
                # is inline IDs. (A lone "-mmCIF" with nothing else can't be a
                # filename, so this check naturally still only matches real
                # filenames.)
                first_arg = batch_args_no_flags[0]
                looks_like_file = len(batch_args_no_flags) == 1 and os.path.splitext(first_arg)[1].lower() in (".txt", ".csv", ".list")
                if looks_like_file:
                    # A relative batch-file argument is resolved relative to
                    # BASE_DIR (matching the pre-existing behavior for a bare
                    # filename like "batch.txt" sitting next to Astra3), but the
                    # person can also point this at any file elsewhere on their
                    # own filesystem with an absolute or ".."-relative path --
                    # same as IMPORT, this is intentionally NOT confined to
                    # BASE_DIR (that would break the legitimate "my batch list
                    # lives in a different folder" case). validate_input_file
                    # still resolves the path properly (Path.resolve(), handling
                    # "." / ".." / symlinks) and checks existence/file-type before
                    # it's ever opened, rather than the previous os.path.isfile on
                    # an unresolved, possibly-relative string.
                    candidate_path = first_arg if os.path.isabs(first_arg) else os.path.join(BASE_DIR, first_arg)
                    try:
                        file_path = str(validate_input_file(candidate_path, [".txt", ".csv", ".list"]))
                        raw_id_format_pairs, file_error = parse_batch_file(file_path)
                        if file_error:
                            print(f"{RED}{file_error}{RESET}", flush=True)
                            print("", flush=True)
                            raw_id_format_pairs = None
                    except InvalidPathError:
                        print(f"{RED}Batch file not found: {candidate_path}{RESET}", flush=True)
                        print("", flush=True)
                        raw_id_format_pairs = None
                    except UnsupportedFileTypeError as e:
                        print(f"{RED}{e}{RESET}", flush=True)
                        print("", flush=True)
                        raw_id_format_pairs = None
                else:
                    raw_id_format_pairs, batch_unattached_flags = parse_structure_ids_with_format_flags(batch_args_no_flags)
                    if batch_unattached_flags:
                        print(f"{YELLOW}-mmCIF with no preceding structure ID was ignored ({batch_unattached_flags} occurrence(s)).{RESET}", flush=True)

                if raw_id_format_pairs is not None:
                    batch_id_format_pairs = _normalize_batch_ids(raw_id_format_pairs)
                    batch_ids = [sid for sid, _fmt in batch_id_format_pairs]
                    batch_format_map = {sid: fmt for sid, fmt in batch_id_format_pairs}
                    if not batch_ids:
                        print(f"{RED}No valid structure IDs found for BATCH.{RESET}", flush=True)
                        print("", flush=True)
                    else:
                        dropped = len(raw_id_format_pairs) - len(batch_ids)
                        print(f"{YELLOW}BATCH: {len(batch_ids)} structure(s) queued" + (f" ({dropped} duplicate/blank entr{'y' if dropped == 1 else 'ies'} skipped)" if dropped else "") + f".{RESET}", flush=True)
                        print(f"{WHITE}Queue: {', '.join(batch_ids)}{RESET}", flush=True)
                        print("", flush=True)
                        batch_succeeded = []
                        batch_failed = []
                        batch_homomer_skip_state = [False]
                        for i, batch_id in enumerate(batch_ids, start=1):
                            print(f"{CYAN}[{i}/{len(batch_ids)}]{RESET} {YELLOW}Processing: {batch_id}{RESET}", flush=True)
                            try:
                                batch_result = run_single_analysis(batch_id, is_test=False, image_quality=image_quality,
                                                                   image_skip=image_skip, report_skip=report_skip, render_only=render_only, csv_export=csv_export,
                                                                   homomer_skip_state=batch_homomer_skip_state,
                                                                   requested_format=batch_format_map.get(batch_id, "pdb"),
                                                                   homomer_auto_decision=homomer_auto_decision,
                                                                   homomer_priority_order=homomer_priority_order,
                                                                   homomer_assembly_fallback=homomer_assembly_fallback)
                            except Exception as e:
                                # run_single_analysis already handles its own
                                # errors internally; this is a final safety net so
                                # one bad structure can never abort the rest of
                                # the batch.
                                print(f"{RED}Unexpected error processing {batch_id}: {e}{RESET}", flush=True)
                                batch_result = None
                            if batch_result:
                                batch_succeeded.append(batch_result)
                                processed_list.append(batch_result)
                            else:
                                batch_failed.append(batch_id)
                            print("", flush=True)
                        print(f"{WHITE}BATCH complete: {GREEN}{len(batch_succeeded)} succeeded{RESET}{WHITE}, "
                              f"{RED}{len(batch_failed)} failed{RESET}{WHITE}.{RESET}", flush=True)
                        if batch_failed:
                            print(f"{RED}Failed: {', '.join(batch_failed)}{RESET}", flush=True)
                        print(f"{GREEN}Ready for next command.{RESET}", flush=True)
                        print("", flush=True)
        elif command == "TERMINI":
            # Parsed with OVERLAY's own parser so TERMINI accepts -reference the
            # same way, and so the -mmCIF handling stays identical between the two
            # rather than being maintained twice.
            termini_ids, termini_reference_override, termini_format_map = parse_overlay_arguments(parts[1:])
            if len(termini_ids) < 2:
                print(f"{RED}TERMINI requires a reference structure and at least one comparison structure, "
                      f"e.g. TERMINI AST-0001 AST-0002 AST-0003{RESET}", flush=True)
                print("", flush=True)
            else:
                termini_engine = TerminiExecution(termini_ids, image_quality=image_quality, image_skip=image_skip,
                                                  report_skip=report_skip, render_only=render_only, csv_export=csv_export,
                                                  format_map=termini_format_map, homomer_auto_decision=homomer_auto_decision,
                                                  homomer_priority_order=homomer_priority_order,
                                                  homomer_assembly_fallback=homomer_assembly_fallback,
                                                  termini_auto_decision=termini_auto_decision,
                                                  reference_override=termini_reference_override)
                try:
                    run_outcome = termini_engine.run()
                    if run_outcome is None:
                        print("", flush=True)
                    else:
                        reference_obj, comparison_objs = run_outcome
                        check_for_cancellation()
                        visualization_images = {}
                        closeup_images = {}
                        combined_images = []
                        # Imported structures are named by file, as in OVERLAY,
                        # so the same files always write to the same folder.
                        output_dir, session_dir, images_dir = get_termini_output_folders(
                            [(resolve_structure(i).get("display_name") or i) if is_ast_id(i) else i
                             for i in termini_ids])
                        # The session and the report's Analysis ID take the
                        # folder's name, so an imported file's session is not
                        # named after an ID that ends with this session.
                        termini_run_name = os.path.basename(output_dir.rstrip(os.sep))
                        if termini_run_name.endswith("_Output"):
                            termini_run_name = termini_run_name[:-len("_Output")]
                        report_cleared_images(clear_stale_run_images(images_dir), images_dir,
                                              termini_engine.warnings)
                        # A per-comparison subfolder under Images/ only exists to
                        # prevent filename collisions when TERMINI compares the
                        # reference against MULTIPLE structures at once (each
                        # comparison would otherwise overwrite the same
                        # view_front.png, etc.) -- with exactly one comparison
                        # (reference + 1, len(termini_ids) == 2, the common case),
                        # there's nothing to collide with, so the subfolder is
                        # just unnecessary nesting for no reason. Single-structure
                        # analysis has never had this subfolder either, for the
                        # same reason.
                        termini_needs_subfolders = len(termini_ids) > 2
                        # Whole-structure views and close-ups are independent
                        # switches: either, both, or neither can be produced.
                        # Whole-structure views also follow render_only.
                        do_core_images = not (image_skip or render_only)
                        do_closeups = not termini_skip_closeups
                        # Best match first, the order the report lists them in.
                        # Rendering in that order keeps the console in step with
                        # the report, and each comparison's position is what
                        # picks its arrow colours, so the close-ups and the
                        # report's colour key cannot disagree.
                        ranked_comparisons = _comparison_display_order(
                            termini_engine._overlay_engine.structure_data, reference_obj,
                            results=termini_engine.results)
                        ranked_comparisons += [o for o in termini_engine.results if o not in ranked_comparisons]
                        # With three or more structures every image lives in a
                        # per-comparison subfolder, so the run had no whole-run
                        # image and no view of the structures together. The same
                        # six views OVERLAY writes of everything aligned, at the
                        # top level. No terminus arrows: those belong to the
                        # close-ups, where each comparison is shown on its own.
                        if termini_needs_subfolders and do_core_images:
                            try:
                                combined_sel = " or ".join(termini_engine._overlay_engine.loaded_objects)
                                os.makedirs(images_dir, exist_ok=True)
                                render_views(combined_sel, images_dir, image_quality,
                                             label="all structures", frame_selection=combined_sel)
                                # Listed from disk rather than assumed: render_views
                                # reports an aborted render on the console only, and
                                # the stale-image sweep above has already removed
                                # anything an earlier run left at this level.
                                combined_images = sorted(
                                    str(p.relative_to(output_dir))
                                    for p in Path(images_dir).glob("view_*.png") if p.is_file()
                                )
                                if not combined_images:
                                    termini_engine.warnings.append(
                                        "Combined all-structure view was not written; see the console "
                                        "output for the render step.")
                            except (KeyboardInterrupt, OperationCancelled):
                                raise
                            except Exception as combined_error:
                                termini_engine.warnings.append(
                                    "Combined all-structure view could not be rendered: "
                                    + str(combined_error) + ".")

                        if do_core_images or do_closeups:
                            for cmp_index, cmp_obj in enumerate(ranked_comparisons):
                                check_for_cancellation()
                                cmp_pid = termini_engine._overlay_engine.structure_data[cmp_obj]["pdb_id"]
                                ref_structure_data = termini_engine._overlay_engine.structure_data[reference_obj]
                                cmp_structure_data = termini_engine._overlay_engine.structure_data[cmp_obj]
                                cmp_images_dir = Path(images_dir) / cmp_obj if termini_needs_subfolders else Path(images_dir)
                                cmp_images_dir.mkdir(parents=True, exist_ok=True)

                                # Close-ups first, before the main wide shots
                                # below -- isolated per-terminus renders with the
                                # real orientation arrows (see render_termini_closeups'
                                # own docstring in astra3_render_report.py for why
                                # this uses cmd.create() copies rather than
                                # hiding/fading the rest of either structure). One
                                # close-up dict per matched chain, since a multi-
                                # chain comparison (e.g. a homodimer) can have
                                # more than one chain_key. Gated on do_closeups
                                # alone now, independent of whether core images
                                # are also being rendered this run.
                                closeups_for_cmp = []
                                if do_closeups:
                                    print(f"{YELLOW}Rendering close-up terminus views for {cmp_pid}...{RESET}", flush=True)
                                    for chain_key, per_chain_result in termini_engine.results[cmp_obj].items():
                                        check_for_cancellation()
                                        per_chain_closeups = render_termini_closeups(
                                            reference_obj, cmp_obj, chain_key, per_chain_result,
                                            ref_structure_data, cmp_structure_data,
                                            str(cmp_images_dir), image_quality=image_quality,
                                            comparison_index=cmp_index,
                                        )
                                        if per_chain_closeups:
                                            closeups_for_cmp.append({"chain": chain_key, **per_chain_closeups})
                                if closeups_for_cmp:
                                    closeup_images[cmp_pid] = closeups_for_cmp

                                # Main six-view whole-structure render. No CGO
                                # vector overlay here anymore -- the orientation arrows
                                # are now the close-ups' whole purpose (a clear,
                                # unobstructed, correctly-framed view of exactly
                                # the vectors that matter), and drawing every
                                # terminus's arrows again here, tiny and layered
                                # over a full whole-structure orientation shot,
                                # was cluttered and hard to read. Gated on
                                # do_core_images alone now, independent of close-
                                # ups -- a close-ups-only run (core images off)
                                # genuinely renders nothing here.
                                rendered_pngs = []
                                if do_core_images:
                                    print(f"{YELLOW}Rendering whole-structure views for {cmp_pid}...{RESET}", flush=True)
                                    frame_selection = reference_obj + " or " + cmp_obj
                                    take_pictures(frame_selection, str(cmp_images_dir), image_quality=image_quality,
                                                 frame_selection=frame_selection,
                                                 label=f"{ref_structure_data['pdb_id']} vs {cmp_pid}")
                                    rendered_pngs = sorted(
                                        str(p.relative_to(output_dir)) for p in cmp_images_dir.glob("*.png")
                                        if not p.name.startswith("closeup_")  # close-ups get their own gallery section, not mixed into the wide-shot one
                                    )
                                if rendered_pngs:
                                    visualization_images[cmp_pid] = rendered_pngs
                                closeup_count = sum(len(images) for entry in closeups_for_cmp for images in
                                                   (entry.get("N", []), entry.get("C", [])))
                                total_for_cmp = len(rendered_pngs) + closeup_count
                                print(f"{GREEN}{total_for_cmp} image(s) rendered for {cmp_pid} "
                                      f"({len(rendered_pngs)} whole-structure, {closeup_count} close-up).{RESET}", flush=True)
                            # Total across every comparison in this run -- TERMINI
                            # can render noticeably more images than a single-
                            # structure run once close-ups are counted (up to 2
                            # angles x 2 termini x however many chains matched,
                            # PER comparison), so a person watching the console
                            # has a clear sense of how much work just happened,
                            # not just per-comparison counts that could be easy to
                            # lose track of across several comparisons.
                            grand_total = sum(len(v) for v in visualization_images.values()) + sum(
                                len(images) for per_chain_list in closeup_images.values()
                                for entry in per_chain_list for images in (entry.get("N", []), entry.get("C", []))
                            )
                            print(f"{GREEN}{grand_total} image(s) rendered in total across "
                                  f"{len(visualization_images)} comparison(s).{RESET}", flush=True)
                        else:
                            print(f"{YELLOW}Images skipped by user.{RESET}", flush=True)

                        if not report_skip and not render_only:
                            analysis_id = termini_run_name
                            command_str = reproducing_command(
                                "TERMINI", termini_ids, termini_format_map, termini_reference_override, image_quality,
                                images_rendered=not render_only and not (image_skip and termini_skip_closeups),
                                image_skip=image_skip, csv_export=csv_export,
                                extra_flags=["-skipcloseup"] if termini_skip_closeups else [])
                            # Checkpoint: rendering is complete and the session is
                            # about to be written. Rendering creates isolation
                            # copies and toggles object visibility; anything it
                            # left behind is about to be saved into the .pse the
                            # person opens.
                            # Remove the scratch selections cmd.align leaves behind
                            # before writing the session, then verify nothing else
                            # survived. Detecting them and saving them anyway left
                            # the person with a warning and a polluted .pse.
                            purge_scratch_objects()
                            report_state_problems(validate_no_scratch_objects(), termini_engine.warnings,
                                                  checkpoint="before saving session")
                            try:
                                save_session(termini_run_name, session_dir,
                                             structure_labels=viewer_structure_labels(
                                                 termini_engine._overlay_engine.structure_data))
                            except Exception as e:
                                print(f"{YELLOW}Failed to save TERMINI session: {e}{RESET}", flush=True)
                            try:
                                generate_termini_html_report(output_dir, analysis_id, command_str, reference_obj,
                                                             termini_engine._overlay_engine.structure_data,
                                                             termini_engine.results, termini_engine.warnings,
                                                             visualization_images=visualization_images,
                                                             closeup_images=closeup_images,
                                                             combined_images=combined_images,
                                                             functional_readouts=termini_engine.functional_readouts,
                                                             alignment_results=termini_engine._overlay_engine.alignment_results,
                                                             run_parameters={"mode": "termini", "image_quality": image_quality,
                                                                             "images_rendered": not (image_skip or render_only)})
                            except Exception as e:
                                print(f"{YELLOW}Failed to generate TERMINI HTML report: {e}{RESET}", flush=True)
                            try:
                                generate_termini_json(output_dir, reference_obj,
                                                      termini_engine._overlay_engine.structure_data,
                                                      termini_engine.results, termini_engine.warnings, command_str,
                                                      functional_readouts=termini_engine.functional_readouts,
                                                      run_parameters={"mode": "termini", "image_quality": image_quality,
                                                                      "images_rendered": not (image_skip or render_only)})
                            except Exception as e:
                                print(f"{YELLOW}Failed to generate TERMINI JSON export: {e}{RESET}", flush=True)
                            if csv_export:
                                try:
                                    generate_termini_csv(output_dir, reference_obj,
                                                         termini_engine._overlay_engine.structure_data,
                                                         termini_engine.results,
                                                         functional_readouts=termini_engine.functional_readouts)
                                except Exception as e:
                                    print(f"{YELLOW}Failed to generate TERMINI CSV export: {e}{RESET}", flush=True)
                        else:
                            print(f"{YELLOW}Report skipped by user (-skipreport).{RESET}", flush=True)

                        if termini_engine.warnings:
                            print(f"{YELLOW}Note: {len(termini_engine.warnings)} run-level warning(s) "
                                  f"recorded; see the HTML/JSON reports for full text.{RESET}", flush=True)

                        print(f"{BLUE}Output folder: {output_dir}{RESET}", flush=True)
                        processed_list.append("TERMINI(" + ", ".join(termini_ids) + ")")
                        print(f"{GREEN}Ready for next command.{RESET}", flush=True)
                        print("", flush=True)
                except (KeyboardInterrupt, OperationCancelled):
                    cancel_active_operation()
                    print(f"{YELLOW}TERMINI cancelled. Cleaning up and returning to the PDB prompt.{RESET}", flush=True)
                    print("", flush=True)
                except Exception as e:  # noqa: BLE001 -- one failed comparison must not end the session
                    print(f"{RED}TERMINI failed: {e}{RESET}", flush=True)
                    print("", flush=True)
                finally:
                    termini_engine.cleanup()
                    active_operation_objects.clear()
                    clear_cancellation()
        elif command == "OVERLAY":
            overlay_operation, overlay_pdb_ids, overlay_reference_override, overlay_format_map = parse_overlay_invocation(parts[1:])
            overlay_render_only = "-ro" in [p.lower() for p in parts[1:]]
            if len(overlay_pdb_ids) < 2:
                print(f"{RED}OVERLAY requires at least two structures, e.g. OVERLAY 3FXI 1RO6 or OVERLAY AST-0001 1AKE{RESET}", flush=True)
                print("", flush=True)
            else:
                overlay_request = OverlayRequest(overlay_pdb_ids, overlay_reference_override, image_quality, image_skip, report_skip, overlay_render_only, csv_export, overlay_format_map, homomer_auto_decision, homomer_priority_order, homomer_assembly_fallback)
                try:
                    overlay_result = OVERLAY_OPERATIONS.dispatch(overlay_operation, overlay_request)
                except Exception as e:  # noqa: BLE001 -- one failed overlay must not end the session
                    print(f"{RED}OVERLAY failed: {e}{RESET}", flush=True)
                    overlay_result = None
                if overlay_result:
                    processed_list.append("OVERLAY(" + ", ".join(overlay_result) + ")")
                print(f"{GREEN}Ready for next command.{RESET}", flush=True)
                print("", flush=True)
        elif command != "":
            print(f"{YELLOW}Processing: {pdb_command}{RESET}", flush=True)
            result = run_single_analysis(pdb_command, is_test=False, image_quality=image_quality, image_skip=image_skip, report_skip=report_skip, render_only=render_only, csv_export=csv_export, requested_format=requested_format, homomer_auto_decision=homomer_auto_decision, homomer_priority_order=homomer_priority_order, homomer_assembly_fallback=homomer_assembly_fallback)
            if result:
                processed_list.append(result)
            print(f"{WHITE}Ready for next PDB.{RESET}", flush=True)
            print("", flush=True)

    print("", flush=True)
    print(f"{WHITE}============================================================{RESET}", flush=True)
    if processed_list:
        print(f"{WHITE}Process complete! Your structural analysis is finished.{RESET}", flush=True)
        if render_only:
            print(f"{WHITE}Only the {engine_name()} session was generated (render-only mode).{RESET}", flush=True)
        elif report_skip and image_skip:
            print(f"{WHITE}Only the {engine_name()} session was generated. Reports and images were skipped.{RESET}", flush=True)
        elif report_skip:
            print(f"{WHITE}{engine_name()} sessions and structural images were generated. Reports were skipped.{RESET}", flush=True)
        elif image_skip:
            print(f"{WHITE}Your report and {engine_name()} session were generated without image rendering.{RESET}", flush=True)
        else:
            print(f"{WHITE}Your report, {engine_name()} session, and structural images were generated.{RESET}", flush=True)
        print(f"{VIOLET}Processed: {', '.join(processed_list)}{RESET}", flush=True)
    else:
        print(f"{WHITE}No structures were processed. Astra3 closed without generating analysis files.{RESET}", flush=True)

    print("", flush=True)
    print(f"{WHITE}============================================================{RESET}", flush=True)

    print("", flush=True)
    cmd.quit()


_astra3_main()

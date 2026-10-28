# ============================================================
# astra3_measure.py
# Astra3: Structural Analysis Toolkit for PDB Rendering Automation
# Created by Andre Aguirre
# Copyright (c) 2026 Andre Aguirre
# Licensed under the GNU General Public License, version 3 or later (GPL-3.0-or-later).
# See LICENSE file for details.
# ============================================================
#
# The one place measurements read atoms out of the molecular viewer. Atoms
# come out as plain arrays; everything computed from them (surface area,
# superposition, residue pairing) is done by astra3_geometry and
# astra3_align, so the numbers do not depend on the viewer or its version.
#
# Atom rules shared by every measurement here:
#   - one conformation: atoms without an alternate location, plus the first
#     alternate location each residue lists (as for Cα atoms elsewhere);
#   - observed atoms only: zero occupancy marks an atom that was modeled but
#     not seen, so it neither counts nor shields anything;
#   - hydrogens are left out of surface area (see astra3_geometry).
# ============================================================

import functools
import re

import numpy as np

import astra3_align
import astra3_geometry as geometry
from astra3_core import AA_3TO1, expand_missing_residues

try:
    from pymol import cmd
except Exception:  # noqa: BLE001 -- another engine supplies cmd
    cmd = None

_FIELDS = ("model", "segi", "chain", "resi", "resn", "name", "alt", "elem", "q", "b", "x", "y", "z", "protein")


def atom_table(selection, state=1, classify=True):
    """Atoms of a selection as arrays, in the viewer's atom order.

    classify=False leaves out the protein flag, which takes a second pass
    over the atoms, for a caller that does not read it."""
    rows = []
    cmd.iterate_state(state, f"({selection})",
                      "_rows.append((segi, chain, resi, resn, name, alt, elem, q, b, x, y, z, index, model))",
                      space={"_rows": rows})
    protein = set()
    if classify:
        cmd.iterate_state(state, f"({selection}) and polymer.protein", "_prot.add(index)",
                          space={"_prot": protein})
    if not rows:
        empty = {k: np.array([]) for k in _FIELDS}
        empty.update({"xyz": np.zeros((0, 3)), "n": 0, "protein": np.zeros(0, dtype=bool)})
        return empty
    cols = list(zip(*rows))
    tab = {
        "segi": np.array(cols[0], dtype=object), "chain": np.array(cols[1], dtype=object),
        "resi": np.array(cols[2], dtype=object), "resn": np.array(cols[3], dtype=object),
        "name": np.array(cols[4], dtype=object), "alt": np.array(cols[5], dtype=object),
        "elem": np.array(cols[6], dtype=object),
        "q": np.array(cols[7], dtype=np.float64), "b": np.array(cols[8], dtype=np.float64),
        "xyz": np.column_stack((cols[9], cols[10], cols[11])).astype(np.float64),
        "protein": np.array([i in protein for i in cols[12]], dtype=bool) if classify else None,
        "model": np.array(cols[13], dtype=object),
        "n": len(rows),
    }
    return tab


def one_conformation(tab):
    """Mask keeping atoms without an alternate location plus each residue's
    first-listed alternate location."""
    keep = np.ones(tab["n"], dtype=bool)
    first = {}
    for i in range(tab["n"]):
        alt = tab["alt"][i]
        if not alt:
            continue
        key = (tab["segi"][i], tab["chain"][i], tab["resi"][i])
        kept = first.setdefault(key, alt)
        if alt != kept:
            keep[i] = False
    return keep


def observed(tab):
    return tab["q"] > 0


def window_sasa(selection, chain, window_resi):
    """Solvent-accessible surface area (A^2) of the residues window_resi in
    chain, measured in the context of every observed atom of selection (one
    conformation). None when the window has no atoms."""
    if not window_resi:
        return None
    return selection_surface(selection).window_area(chain, window_resi)


class SelectionSurface:
    """The accessible surface of a selection's observed atoms (one
    conformation), for measuring residue windows in their real surroundings."""

    # What a surface is computed from; the other columns do not affect it.
    FIELDS = ("xyz", "q", "segi", "chain", "resi", "alt", "elem")

    def __init__(self, tab):
        self.tab = tab
        self.use = one_conformation(tab) & observed(tab)
        self.heavy = np.array([not geometry.is_hydrogen(e) for e in tab["elem"]], dtype=bool)
        self.resi = [str(r) for r in tab["resi"].tolist()]
        self.surface = geometry.Surface(tab["xyz"][self.use], tab["elem"][self.use])

    def built_from(self, tab):
        return self.tab["n"] == tab["n"] and all(np.array_equal(self.tab[k], tab[k]) for k in self.FIELDS)

    def window_area(self, chain, window_resi):
        tab, use = self.tab, self.use
        if tab["n"] == 0:
            return None
        wanted = {str(r) for r in window_resi}
        window = use & (tab["chain"] == chain) & np.array([r in wanted for r in self.resi], dtype=bool)
        if not (window & self.heavy).any():
            return None
        measure = np.flatnonzero(window[use])
        return float(self.surface.areas(measure)[measure].sum())


_surfaces = {}


def selection_surface(selection):
    """The SelectionSurface of a selection. A terminus comparison measures
    several windows of the same structure, and preparing a large structure
    costs more than measuring a window, so the last one built is reused.

    The atoms are read from the viewer every time and compared with the ones
    it was built from: a structure that has been moved, trimmed or reloaded
    under the same name gets a new surface."""
    tab = atom_table(selection, classify=False)
    kept = _surfaces.get(selection)
    if kept is None or not kept.built_from(tab):
        kept = _surfaces[selection] = SelectionSurface(tab)
    return kept


def forget_surfaces():
    """Drops the surfaces kept by selection_surface (between analyses)."""
    _surfaces.clear()


# ------------------------------------------------------------
# Residue pairing and superposition
# ------------------------------------------------------------

# Residues each loaded object's file lists as unobserved (REMARK 465 or
# _pdbx_unobs_or_zero_occ_residues), {object: {chain: [(number, insertion
# code)]}}. Sequence alignments include them as placeholders, so a gap in an
# alignment falls where residues are missing from the model, as when chains
# are aligned through their full deposited sequences (ChimeraX's matchmaker,
# gemmi's alignment to SEQRES). Aligned on the observed residues alone, the
# residues either side of a gap can be paired with unrelated ones.
_UNOBSERVED = {}


def register_unobserved(obj, missing_map):
    """Record obj's unobserved residues from its {chain: [ranges]} map."""
    if not obj:
        return
    key = str(obj).upper()
    if missing_map:
        _UNOBSERVED[key] = {str(ch): expand_missing_residues(r) for ch, r in missing_map.items()}
    else:
        _UNOBSERVED.pop(key, None)


def _unobserved(obj, chain):
    return _UNOBSERVED.get(str(obj).upper(), {}).get(str(chain), [])


def _resi_key(resi):
    """(number, insertion code) of a residue identifier such as 52 or 52A."""
    m = re.match(r"^(-?\d+)([A-Za-z]?)$", str(resi).strip())
    return (int(m.group(1)), m.group(2).upper()) if m else None


def gapped_sequence(obj, chain, resi_list, sequence):
    """resi_list (consecutive residues of one chain, in either direction) and
    its one-letter sequence, with every unobserved residue lying between two
    neighbours inserted as None and "X"."""
    missing = _unobserved(obj, chain)
    letters = dict(zip(resi_list, sequence))
    residues = list(resi_list[:1])
    for a, b in zip(resi_list, resi_list[1:]):
        ka, kb = _resi_key(a), _resi_key(b)
        if missing and ka is not None and kb is not None:
            lo, hi = min(ka, kb), max(ka, kb)
            residues += [None] * sum(1 for u in missing if lo < u < hi)
        residues.append(b)
    return residues, "".join("X" if r is None else letters[r] for r in residues)


def protein_residues(tab):
    """{chain: [(resi, resn, {atom name: xyz})]} in file order, one
    conformation, observed heavy atoms only; unobserved residues the file
    lists come in as placeholders (resi, "", {}) at their place in the chain."""
    use = tab["protein"] & one_conformation(tab) & observed(tab)
    use &= np.array([not geometry.is_hydrogen(e) for e in tab["elem"]], dtype=bool)
    chains = {}
    owner = {}
    last = None
    for i in np.flatnonzero(use):
        key = (tab["segi"][i], tab["chain"][i], tab["resi"][i])
        residues = chains.setdefault(tab["chain"][i], [])
        if key != last:
            residues.append((tab["resi"][i], tab["resn"][i], {}))
            owner.setdefault(tab["chain"][i], tab["model"][i])
            last = key
        residues[-1][2].setdefault(tab["name"][i], tab["xyz"][i])
    for chain, residues in chains.items():
        missing = _unobserved(owner.get(chain), chain)
        if missing:
            chains[chain] = _with_placeholders(residues, missing)
    return chains


def _with_placeholders(residues, missing):
    """residues with a placeholder (resi, "", {}) for each unobserved residue,
    placed before the first observed residue numbered after it."""
    pending = list(missing)
    out = []
    for row in residues:
        k = _resi_key(row[0])
        while pending and k is not None and pending[0] < k:
            number, code = pending.pop(0)
            out.append((f"{number}{code}", "", {}))
        out.append(row)
    out += [(f"{number}{code}", "", {}) for number, code in pending]
    return out


def _observed_count(residues):
    """Residues with coordinates (placeholders not counted)."""
    return sum(1 for r in residues if r[2])


def _sequence(residues):
    return "".join(AA_3TO1.get(resn, "X") for _resi, resn, _atoms in residues)


@functools.lru_cache(maxsize=256)
def _aligned_pairs(seq_m, seq_t):
    return tuple(astra3_align.aligned_pairs(seq_m, seq_t))


def correspondence(rm, rt, strict=True):
    """Residue index pairs [(i, j)] the sequence alignment of two chains
    establishes.

    strict: the pairs are returned only when one sequence is contained in
    the other, or when their identity reaches the HSSP threshold for the
    number of pairs (see astra3_align.homology_threshold); otherwise [].
    This decides which chains are the same protein. A semi-global alignment
    always pairs something, even between unrelated proteins.
    strict=False returns the alignment's pairs regardless, for superposing
    chains the person chose to compare after the identity warning."""
    seq_m, seq_t = _sequence(rm), _sequence(rt)
    if not seq_m or not seq_t:
        return []
    # Pairs involving an unobserved placeholder are not pairs of residues.
    pairs = [(i, j) for i, j in _aligned_pairs(seq_m, seq_t) if rm[i][2] and rt[j][2]]
    if not pairs or not strict:
        return list(pairs)
    same = sum(1 for i, j in pairs if rm[i][1] == rt[j][1])
    if same == len(pairs) == min(_observed_count(rm), _observed_count(rt)):
        return list(pairs)
    if 100.0 * same / len(pairs) >= astra3_align.homology_threshold(len(pairs)):
        return list(pairs)
    return []


def pair_chains(mobile, target):
    """Which chains to superpose on which, as [(mobile_chain, target_chain)].

    Chains with the same identifier are paired when their sequences
    correspond (see correspondence). Each remaining mobile chain is then
    paired with the remaining target chain it shares the most identical
    residues with, among those it corresponds to. When no chain corresponds
    to any other, the structures are still compared: each mobile chain is
    paired with the target chain whose alignment has the most identical
    residues (then the most pairs), so a superposition is always attempted.
    """
    pairs = [(c, c) for c in mobile if c in target and correspondence(mobile[c], target[c])]
    rest_m = [c for c in mobile if c not in {m for m, _t in pairs}]
    rest_t = [c for c in target if c not in {t for _m, t in pairs}]
    for cm in rest_m:
        best, best_c = 0, None
        sm = _sequence(mobile[cm])
        for ct in rest_t:
            st = _sequence(target[ct])
            # Cheap screen before the full alignment, as in astra3_align.compare.
            if min(len(sm), len(st)) >= 25 and astra3_align.kmer_containment(sm, st) < 0.02:
                continue
            found = correspondence(mobile[cm], target[ct])
            same = sum(1 for i, j in found if mobile[cm][i][1] == target[ct][j][1])
            if same > best:
                best, best_c = same, ct
        if best_c is not None:
            pairs.append((cm, best_c))
            rest_t.remove(best_c)
    if pairs:
        return pairs
    for cm in rest_m:
        best, best_c = (0, 0), None
        for ct in rest_t:
            found = correspondence(mobile[cm], target[ct], strict=False)
            same = sum(1 for i, j in found if mobile[cm][i][1] == target[ct][j][1])
            if found and (same, len(found)) > best:
                best, best_c = (same, len(found)), ct
        if best_c is not None:
            pairs.append((cm, best_c))
            rest_t.remove(best_c)
    return pairs


def paired_atoms(mobile, target, chain_pairs, ca_only=False):
    """Coordinates of matching atoms in corresponding residues. Returns
    (mobile_xyz, target_xyz, residue_pairs, identical_residue_pairs)."""
    P, Q = [], []
    n_res = 0
    n_same = 0
    for cm, ct in chain_pairs:
        rm, rt = mobile.get(cm, []), target.get(ct, [])
        if not rm or not rt:
            continue
        for i, j in correspondence(rm, rt, strict=False):
            am, at = rm[i][2], rt[j][2]
            names = ["CA"] if ca_only else [nm for nm in am if nm in at]
            got = False
            for nm in names:
                if nm in am and nm in at:
                    P.append(am[nm]); Q.append(at[nm]); got = True
            if got:
                n_res += 1
                n_same += int(rm[i][1] == rt[j][1])
    return np.array(P).reshape(-1, 3), np.array(Q).reshape(-1, 3), n_res, n_same


def superpose(mobile_sel, target_sel, move=(), ca_only=False):
    """Superpose mobile_sel onto target_sel and move the objects in `move`
    by the fitted transform. Returns rmsd, atoms (kept after outlier
    rejection), paired_atoms, residues (sequence-aligned residue pairs that
    contributed atoms), identity (share of those pairs with the same residue
    type) and chain_pairs. Raises ValueError when fewer than 3 atoms pair."""
    mobile = protein_residues(atom_table(mobile_sel))
    target = protein_residues(atom_table(target_sel))
    chain_pairs = pair_chains(mobile, target)
    P, Q, n_res, n_same = paired_atoms(mobile, target, chain_pairs, ca_only=ca_only)
    if len(P) < 3:
        raise ValueError("fewer than 3 matching atoms between the structures, so they cannot be superposed")
    fit = geometry.superpose(P, Q)
    for obj in move:
        apply_transform(obj, fit["rotation"], fit["translation"])
    return {
        "rmsd": fit["rmsd"], "atoms": fit["atoms"], "paired_atoms": fit["initial_atoms"],
        "initial_rmsd": fit["initial_rmsd"], "cycles": fit["cycles_run"], "residues": n_res,
        "identity": (n_same / n_res) if n_res else None, "chain_pairs": chain_pairs,
        "rotation": fit["rotation"], "translation": fit["translation"],
    }


def apply_transform(obj, rotation, translation):
    """Move every atom of obj (all states) by x -> R x + t."""
    r = np.asarray(rotation, dtype=np.float64)
    t = np.asarray(translation, dtype=np.float64)
    matrix = [r[0, 0], r[0, 1], r[0, 2], t[0],
              r[1, 0], r[1, 1], r[1, 2], t[1],
              r[2, 0], r[2, 1], r[2, 2], t[2],
              0.0, 0.0, 0.0, 1.0]
    cmd.transform_selection(f"({obj})", [float(v) for v in matrix], state=0, homogenous=1)

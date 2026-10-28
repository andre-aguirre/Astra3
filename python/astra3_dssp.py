# ============================================================
# astra3_dssp.py
# Astra3: Structural Analysis Toolkit for PDB Rendering Automation
# Created by Andre Aguirre
# Copyright (c) 2026 Andre Aguirre
# Licensed under the GNU General Public License, version 3 or later (GPL-3.0-or-later).
# See LICENSE file for details.
# ============================================================
#
# Secondary structure by the DSSP method, for the Astra3 Engine:
#
#   Kabsch W, Sander C (1983). Dictionary of protein secondary structure:
#   pattern recognition of hydrogen-bonded and geometrical features.
#   Biopolymers 22, 2577-2637. doi:10.1002/bip.360221211
#
# Written from the paper. Backbone hydrogen bonds come from the paper's
# electrostatic energy; helices (H, G, I) from consecutive n-turns; strands
# (E) from ladders of beta bridges, joined across beta bulges. Where the paper
# and the reference implementation, mkdssp (DSSP 4; Hekkelman ML et al. 2025,
# bioRxiv 2025.04.11.648460), differ, this follows mkdssp: pi-helices take
# precedence over alpha-helices, bridges may join residues two apart, and
# residues are read in the chain's order. The engine shows H, G and I as
# helix and E as strand; isolated bridges (B), turns and bends are loop, as
# in PyMOL's cartoon.
#
# Used only for files without helix and sheet records; astra3_chimerax
# reads those records when the file has them.
# ============================================================

import numpy as np

# The paper's electrostatic hydrogen-bond energy: q1 q2 f with partial
# charges 0.42e and 0.20e and f = 332, in kcal/mol.
COUPLING = 0.42 * 0.20 * 332.0
HBOND_CUTOFF = -0.5          # kcal/mol: a bond when the energy is below this
MIN_ENERGY = -9.9            # kcal/mol: used when atoms overlap (< 0.5 A)
MIN_DISTANCE = 0.5           # A
CA_CUTOFF = 9.0              # A: only residues this close can be bonded
PEPTIDE_BOND_MAX = 2.5       # A: a longer C-N distance is a chain break

LOOP, BRIDGE, STRAND, HELIX_3, HELIX_4, HELIX_5 = "L", "B", "E", "G", "H", "I"


class _Residue:
    __slots__ = ("chain", "n", "ca", "c", "o", "h", "proline", "atoms", "index",
                 "acceptors", "donors", "break_before")

    def __init__(self, chain, n, ca, c, o, proline, atoms):
        self.chain = chain
        self.n, self.ca, self.c, self.o = n, ca, c, o
        self.h = None
        self.proline = proline
        self.atoms = atoms
        self.index = 0
        # The two lowest-energy bonds of this residue's N-H (to acceptors) and
        # of its C=O (to donors): [(energy, residue index)].
        self.acceptors = [(0.0, -1), (0.0, -1)]
        self.donors = [(0.0, -1), (0.0, -1)]
        self.break_before = True


def _backbone(mol):
    """The protein residues with N, CA, C and O, in file order, from the
    first state. For alternate locations the first one listed is used."""
    from astra3_chimerax import F_PROTEIN
    xyz = mol.coords[0]
    out = []
    for start, stop in mol.residue_bounds():
        if not mol.flags[start] & F_PROTEIN:
            continue
        found = {}
        for i in range(start, stop):
            name = str(mol.atom_name[i])
            if name in ("N", "CA", "C", "O") and name not in found and not np.isnan(xyz[i]).any():
                found[name] = xyz[i].astype(np.float64)
        if len(found) < 4:
            continue
        out.append(_Residue(str(mol.chain[start]), found["N"], found["CA"], found["C"], found["O"],
                            str(mol.resn[start]).upper() == "PRO", (start, stop)))
    # In file order (atom serial numbers), which is the chain's order. The
    # molecule keeps residues sorted by number, as PyMOL does, and a chain
    # numbered out of order (2QZV: 3T-12T before 1, 2, 3) would otherwise read
    # as broken between every residue.
    serial = mol.field("ID")
    out.sort(key=lambda r: int(serial[r.atoms[0]:r.atoms[1]].min()))
    return out


def _place_hydrogens(residues):
    """Chain breaks, and each N-H hydrogen: 1.0 A from N, opposite the
    previous residue's C=O. A residue after a break has none."""
    for k, r in enumerate(residues):
        r.index = k
        if k == 0:
            continue
        p = residues[k - 1]
        if p.chain == r.chain and np.linalg.norm(p.c - r.n) <= PEPTIDE_BOND_MAX:
            r.break_before = False
            co = p.c - p.o
            r.h = r.n + co / np.linalg.norm(co)


def _energy(donor, acceptor):
    """Energy of the bond from donor's N-H to acceptor's C=O, kcal/mol."""
    d_on = np.linalg.norm(acceptor.o - donor.n)
    d_ch = np.linalg.norm(acceptor.c - donor.h)
    d_oh = np.linalg.norm(acceptor.o - donor.h)
    d_cn = np.linalg.norm(acceptor.c - donor.n)
    if min(d_on, d_ch, d_oh, d_cn) < MIN_DISTANCE:
        return MIN_ENERGY
    e = COUPLING * (1.0 / d_on + 1.0 / d_ch - 1.0 / d_oh - 1.0 / d_cn)
    return max(round(e, 3), MIN_ENERGY)


def _keep(best, energy, index):
    if energy < best[0][0]:
        best[1] = best[0]
        best[0] = (energy, index)
    elif energy < best[1][0]:
        best[1] = (energy, index)


def _neighbor_pairs(residues):
    """(i, j), i < j, of residues whose CA atoms are within CA_CUTOFF."""
    ca = np.array([r.ca for r in residues])
    cells = {}
    keys = np.floor(ca / CA_CUTOFF).astype(np.int64)
    for k, key in enumerate(map(tuple, keys)):
        cells.setdefault(key, []).append(k)
    pairs = []
    cutoff2 = CA_CUTOFF * CA_CUTOFF
    for key, members in cells.items():
        near = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    near += cells.get((key[0] + dx, key[1] + dy, key[2] + dz), [])
        near = np.array(sorted(near))
        for i in members:
            others = near[near > i]
            if not len(others):
                continue
            d2 = ((ca[others] - ca[i]) ** 2).sum(axis=1)
            for j in others[d2 < cutoff2]:
                pairs.append((i, int(j)))
    return pairs


def _hydrogen_bonds(residues):
    """Each residue's two strongest bonds as donor and as acceptor. The N-H
    of a residue and the C=O of the one before it share a peptide bond and
    are not paired; prolines have no N-H."""
    for i, j in _neighbor_pairs(residues):
        a, b = residues[i], residues[j]
        for donor, acceptor in ((a, b), (b, a)):
            if donor.h is None or donor.proline or donor.index == acceptor.index + 1:
                continue
            e = _energy(donor, acceptor)
            _keep(donor.acceptors, e, acceptor.index)
            _keep(acceptor.donors, e, donor.index)


def _bond_set(residues):
    """{(co, nh)}: Hbond(co, nh) in the paper's notation, the C=O of residue
    co bonded to the N-H of residue nh. A bond is one of the two strongest of
    the N-H with an energy below the cutoff."""
    bonds = set()
    for r in residues:
        for energy, index in r.acceptors:
            if index >= 0 and energy < HBOND_CUTOFF:
                bonds.add((index, r.index))
    return bonds


def _no_break(residues, first, last):
    return all(not residues[k].break_before for k in range(first + 1, last + 1))


def _assign(residues):
    """DSSP codes, one per residue."""
    n = len(residues)
    ss = [LOOP] * n
    bonds = _bond_set(residues)

    def hbond(co, nh):
        return (co, nh) in bonds

    # Beta bridges (i, j), j >= i + 2, in the order DSSP visits them (i, then
    # j ascending), collected into ladders as they are found. Only pairs with
    # a bond between i - 1..i + 1 and j - 1..j + 1 can be bridges.
    candidates = set()
    for co, nh in bonds:
        for a in (co - 1, co, co + 1):
            for b in (nh - 1, nh, nh + 1):
                i, j = min(a, b), max(a, b)
                if 1 <= i < n - 4 and i + 2 <= j < n - 1:
                    candidates.add((i, j))
    ladders = []
    for i, j in sorted(candidates):
        if not _no_break(residues, i - 1, i + 1) or not _no_break(residues, j - 1, j + 1):
            continue
        kind = None
        if (hbond(i - 1, j) and hbond(j, i + 1)) or (hbond(j - 1, i) and hbond(i, j + 1)):
            kind = "parallel"
        elif (hbond(i, j) and hbond(j, i)) or (hbond(i - 1, j + 1) and hbond(j - 1, i + 1)):
            kind = "antiparallel"
        if kind is not None:
            for ladder in ladders:
                if ladder["kind"] != kind or i != ladder["i"][-1] + 1:
                    continue
                if kind == "parallel" and ladder["j"][-1] + 1 == j:
                    ladder["i"].append(i)
                    ladder["j"].append(j)
                    break
                if kind == "antiparallel" and ladder["j"][0] - 1 == j:
                    ladder["i"].append(i)
                    ladder["j"].insert(0, j)
                    break
            else:
                ladders.append({"kind": kind, "i": [i], "j": [j]})

    # Ladders joined across a beta bulge: a gap of at most one residue on one
    # strand and four on the other. Gaps are counted forward only (negative
    # ones never join).
    def gap(a, b):
        return b - a if b >= a else 1 << 30

    ladders.sort(key=lambda b: (b["i"][0], b["j"][0]))
    k = 0
    while k < len(ladders):
        m = k + 1
        while m < len(ladders):
            a, b = ladders[k], ladders[m]
            ibi, iei, jbi, jei = a["i"][0], a["i"][-1], a["j"][0], a["j"][-1]
            ibj, iej, jbj, jej = b["i"][0], b["i"][-1], b["j"][0], b["j"][-1]
            joinable = (a["kind"] == b["kind"]
                        and _no_break(residues, min(ibi, ibj), max(iei, iej))
                        and _no_break(residues, min(jbi, jbj), max(jei, jej))
                        and gap(iei, ibj) < 6 and not (iei >= ibj and ibi <= iej))
            if joinable:
                if a["kind"] == "parallel":
                    bulge = (gap(jei, jbj) < 6 and gap(iei, ibj) < 3) or gap(jei, jbj) < 3
                else:
                    bulge = (gap(jej, jbi) < 6 and gap(iei, ibj) < 3) or gap(jej, jbi) < 3
                if bulge:
                    a["i"] = sorted(set(a["i"] + b["i"]))
                    a["j"] = sorted(set(a["j"] + b["j"]))
                    del ladders[m]
                    continue
            m += 1
        k += 1
    for ladder in ladders:
        code = STRAND if len(ladder["i"]) > 1 else BRIDGE
        for side in ("i", "j"):
            for r in range(min(ladder[side]), max(ladder[side]) + 1):
                if ss[r] != STRAND:
                    ss[r] = code

    # n-turns at i: Hbond(i, i + n). Two consecutive n-turns, at i - 1 and i,
    # make residues i to i + n - 1 a helix: H for n = 4, G for 3, I for 5.
    starts = {}
    for stride in (3, 4, 5):
        starts[stride] = [i + stride < n and hbond(i, i + stride) and _no_break(residues, i, i + stride)
                          for i in range(n)]
    for i in range(1, n - 4):
        if starts[4][i] and starts[4][i - 1]:
            for r in range(i, i + 4):
                ss[r] = HELIX_4
    # pi-helices take precedence over alpha-helices, as in DSSP 2.1 and later
    # (Cooley RB et al. 2010, J Mol Biol 404:232-246).
    for stride, code in ((3, HELIX_3), (5, HELIX_5)):
        allowed = (LOOP, code, HELIX_4) if code == HELIX_5 else (LOOP, code)
        for i in range(1, n - stride):
            if starts[stride][i] and starts[stride][i - 1]:
                span = range(i, i + stride)
                if all(ss[r] in allowed for r in span):
                    for r in span:
                        ss[r] = code
    return ss


def dssp_codes(mol):
    """[(residue atom bounds, DSSP code)] for the molecule's protein
    residues that have a full backbone."""
    residues = _backbone(mol)
    if not residues:
        return []
    _place_hydrogens(residues)
    _hydrogen_bonds(residues)
    return [(r.atoms, code) for r, code in zip(residues, _assign(residues))]


def assign_to_molecule(mol):
    """Sets mol.ss the way PyMOL stores it: "H" helix, "S" strand, "L" loop
    for protein atoms, "" for the rest. Returns False when the molecule has
    no protein backbone to assign."""
    from astra3_chimerax import F_PROTEIN
    codes = dssp_codes(mol)
    ss = np.array(["L" if f & F_PROTEIN else "" for f in mol.flags], dtype=object)
    shown = {HELIX_4: "H", HELIX_3: "H", HELIX_5: "H", STRAND: "S"}
    for (start, stop), code in codes:
        if code in shown:
            ss[start:stop] = shown[code]
    mol.ss = ss
    return bool(codes)

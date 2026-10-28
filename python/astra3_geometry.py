# ============================================================
# astra3_geometry.py
# Astra3: Structural Analysis Toolkit for PDB Rendering Automation
# Created by Andre Aguirre
# Copyright (c) 2026 Andre Aguirre
# Licensed under the GNU General Public License, version 3 or later (GPL-3.0-or-later).
# See LICENSE file for details.
# ============================================================
#
# Structural measurements computed by Astra3 itself, from atom records, so a
# result does not depend on which molecular viewer loaded the structure or on
# that viewer's version. The viewer only supplies coordinates; every number
# Astra3 reports from here follows the published method and the fixed
# parameters stated below.
#
# Solvent-accessible surface area
#   Shrake A, Rupley JA (1973) J Mol Biol 79:351-371. Each atom is a sphere of
#   its van der Waals radius plus a 1.4 A water probe; its accessible area is
#   the fraction of points on that sphere not inside any neighbouring sphere.
#   Points are placed by the golden-section spiral, 10000 per atom. Radii are Bondi's (1964,
#   J Phys Chem 68:441-451); elements Bondi does not list use 2.0 A. These are
#   the radii Biopython's ShrakeRupley uses. The points are fixed in the
#   structure's principal-axes frame (see principal_frame), so the area does
#   not change when the structure is rotated, as it is by superposition; with
#   points fixed in space instead, rotating 1HPV chain A by 0.06 degrees moved
#   the area of its last ten residues by 0.1 A^2. Hydrogens are left
#   out: whether a file carries them
#   depends on how it was deposited, not on the structure, and counting them
#   would make the same protein's surface depend on the file it came from.
#
# Superposition
#   Kabsch W (1976) Acta Cryst A32:922-923, least-squares rotation by singular
#   value decomposition with a reflection check. Outliers are rejected
#   iteratively: after each fit, pairs further apart than cutoff x RMSD are
#   dropped and the fit repeated, for at most `cycles` rounds. With the
#   defaults (5 cycles, 2.0) this is the refinement PyMOL's align documents.
#
# Only numpy is required. Both PyMOL and ChimeraX ship it.
# ============================================================

import math

import numpy as np

SASA_PROBE_RADIUS = 1.4
# Points per atom sphere. At 10000 a terminus window's area is within about
# 0.5 A^2 of the converged value (checked against 50000 on 1XGD and 6F7R);
# at 960 the error reached 3.5 A^2, a real share of the 26 A^2 threshold.
# Astra3 computes only the atoms it reports (see shrake_rupley's measure),
# which keeps this affordable.
SASA_SPHERE_POINTS = 10000
DEFAULT_RADIUS = 2.0

# Bondi (1964) van der Waals radii, keyed by upper-case element symbol.
VDW_RADII = {
    "H": 1.20, "HE": 1.40, "C": 1.70, "N": 1.55, "O": 1.52, "F": 1.47,
    "NA": 2.27, "MG": 1.73, "P": 1.80, "S": 1.80, "CL": 1.75, "K": 2.75,
    "CA": 2.31, "NI": 1.63, "CU": 1.40, "ZN": 1.39, "SE": 1.90, "BR": 1.85,
    "CD": 1.58, "I": 1.98, "HG": 1.55,
}

SUPERPOSE_CYCLES = 5
SUPERPOSE_CUTOFF = 2.0


def vdw_radius(element):
    return VDW_RADII.get(str(element or "").strip().upper(), DEFAULT_RADIUS)


def is_hydrogen(element):
    return str(element or "").strip().upper() in ("H", "D")


def sphere_points(n=SASA_SPHERE_POINTS):
    """n points spread evenly over the unit sphere (golden-section spiral)."""
    k = np.arange(n, dtype=np.float64)
    dz = 2.0 / n
    z = 1.0 - dz / 2.0 - k * dz
    r = np.sqrt(np.clip(1.0 - z * z, 0.0, None))
    longitude = k * (math.pi * (3.0 - math.sqrt(5.0)))
    return np.column_stack((np.cos(longitude) * r, np.sin(longitude) * r, z))


def principal_frame(coords):
    """coords moved to their centroid and rotated onto their principal axes,
    each axis signed so the coordinates' third moment along it is positive.
    The result depends only on the atoms' relative positions, so a surface
    sampled with fixed sphere points gives the same area however the
    structure was oriented (superposed or not, in any engine)."""
    centered = coords - coords.mean(axis=0)
    if len(centered) < 3:
        return centered
    _, vectors = np.linalg.eigh(centered.T @ centered)
    frame = centered @ vectors
    signs = np.where(np.sum(frame ** 3, axis=0) < 0, -1.0, 1.0)
    frame *= signs
    if np.linalg.det(vectors * signs) < 0:
        frame[:, 0] *= -1.0
    return frame


def shrake_rupley(coords, elements, probe=SASA_PROBE_RADIUS, n_points=SASA_SPHERE_POINTS, measure=None):
    """Accessible surface area (A^2) of each atom.

    coords: (N, 3) array. elements: N element symbols. Hydrogens are given
    zero area and do not occlude other atoms (see the module notes). Every
    atom passed in counts as part of the environment, so the caller decides
    what surrounds the atoms it will sum: pass one conformation of the whole
    structure, ligands included, to measure a region in its real context.
    measure: optional boolean mask or index list of the atoms whose area is
    wanted; the others are still occluders but are not computed (left 0).
    """
    return Surface(coords, elements, probe, n_points).areas(measure)


_ADJACENT_CELLS = [(a, b, c) for a in (-1, 0, 1) for b in (-1, 0, 1) for c in (-1, 0, 1)]


class Surface:
    """The accessible surface of a fixed set of atoms, measured on request.

    What depends only on the atoms as a whole (the frame the sphere points
    are fixed in, the radii, the spatial hash) is worked out once, so several
    groups of atoms can be measured against the same surroundings, and an
    atom's area is kept once it has been measured. In a large structure that
    preparation costs as much as measuring a terminus window."""

    def __init__(self, coords, elements, probe=SASA_PROBE_RADIUS, n_points=SASA_SPHERE_POINTS):
        coords = np.asarray(coords, dtype=np.float64).reshape(-1, 3)
        self.n_atoms = len(coords)
        self.n_points = n_points
        self._areas = {}
        heavy = np.array([not is_hydrogen(e) for e in elements], dtype=bool) if self.n_atoms else np.zeros(0, dtype=bool)
        self.heavy = np.flatnonzero(heavy)          # the atoms that have a surface
        if self.heavy.size == 0:
            return
        radii = np.array([vdw_radius(e) for e in elements], dtype=np.float64) + probe
        self.xyz = principal_frame(coords[self.heavy])
        self.rad = radii[self.heavy]
        self.unit = sphere_points(n_points)
        # Spatial hash: atoms can only touch within twice the largest radius,
        # so each atom is compared only with atoms in its own and adjacent cells.
        cell = 2.0 * self.rad.max()
        self.keys = np.floor(self.xyz / cell).astype(np.int64).tolist()
        self.cells = {}
        for i, key in enumerate(map(tuple, self.keys)):
            self.cells.setdefault(key, []).append(i)

    def areas(self, measure=None):
        """Area (A^2) of each atom, as shrake_rupley returns it."""
        area = np.zeros(self.n_atoms)
        if self.heavy.size == 0:
            return area
        if measure is None:
            todo = range(len(self.xyz))
        else:
            wanted = np.zeros(self.n_atoms, dtype=bool)
            wanted[np.asarray(measure)] = True
            todo = np.flatnonzero(wanted[self.heavy]).tolist()
        for i in todo:
            if i not in self._areas:
                self._areas[i] = self._area(i)
            area[self.heavy[i]] = self._areas[i]
        return area

    def _area(self, i):
        xyz, rad = self.xyz, self.rad
        kx, ky, kz = self.keys[i]
        near = []
        for a, b, c in _ADJACENT_CELLS:
            near.extend(self.cells.get((kx + a, ky + b, kz + c), ()))
        near = np.array([j for j in near if j != i], dtype=np.int64)
        points = self.unit * rad[i] + xyz[i]
        if near.size:
            d = np.linalg.norm(xyz[near] - xyz[i], axis=1)
            touching = d < rad[i] + rad[near]
            near, d = near[touching], d[touching]
        if near.size:
            # A point is buried if it lies inside any neighbour's sphere, so
            # one found buried needs no further testing. The spheres reaching
            # furthest into this one are tried first, a few at a time: most
            # points are gone after the first handful, and the rest of the
            # neighbours are tested against what is left. Which points
            # survive does not depend on the order.
            near = near[np.argsort(d - rad[near], kind="stable")]
            start, size = 0, 1
            while start < near.size and len(points):
                part = near[start:start + size]
                diff = points[:, None, :] - xyz[part][None, :, :]
                inside = (np.einsum("pnk,pnk->pn", diff, diff) < (rad[part] ** 2)[None, :]).any(axis=1)
                points = points[~inside]
                start += size
                size *= 2
        return len(points) * (4.0 * math.pi * rad[i] * rad[i] / self.n_points)


def kabsch(mobile, target, weights=None):
    """Rotation R and translation t that best place mobile onto target
    (least squares): mobile @ R.T + t ~ target."""
    p = np.asarray(mobile, dtype=np.float64)
    q = np.asarray(target, dtype=np.float64)
    w = np.ones(len(p)) if weights is None else np.asarray(weights, dtype=np.float64)
    w = w / w.sum()
    pc = (w[:, None] * p).sum(axis=0)
    qc = (w[:, None] * q).sum(axis=0)
    h = ((p - pc) * w[:, None]).T @ (q - qc)
    u, _s, vt = np.linalg.svd(h)
    d = np.sign(np.linalg.det(vt.T @ u.T))
    rot = vt.T @ np.diag([1.0, 1.0, d]) @ u.T
    return rot, qc - pc @ rot.T


def rmsd(a, b):
    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64)
    return float(np.sqrt(((a - b) ** 2).sum(axis=1).mean())) if len(a) else float("nan")


def superpose(mobile, target, cycles=SUPERPOSE_CYCLES, cutoff=SUPERPOSE_CUTOFF):
    """Fit mobile onto target with iterative outlier rejection.

    Returns a dict: rotation, translation, rmsd and atoms over the pairs kept,
    initial_atoms, the boolean mask of kept pairs, and cycles_run. The fit is
    done on all pairs first; each later cycle drops pairs deviating by more
    than cutoff x RMSD and refits, stopping early once nothing is dropped.
    Fewer than 3 kept pairs cannot define a rotation, so rejection never goes
    below that.
    """
    p = np.asarray(mobile, dtype=np.float64)
    q = np.asarray(target, dtype=np.float64)
    if len(p) != len(q) or len(p) < 3:
        raise ValueError("superpose needs at least 3 paired atoms")
    keep = np.ones(len(p), dtype=bool)
    rot, trans = kabsch(p, q)
    initial = rmsd(p @ rot.T + trans, q)
    cycles_run = 0
    for _ in range(cycles):
        dev = np.linalg.norm(p @ rot.T + trans - q, axis=1)
        current = math.sqrt((dev[keep] ** 2).mean())
        # An exact fit (a structure against an identical copy) leaves only
        # rounding noise, which must not be mistaken for outliers.
        if current < 1e-6:
            break
        new_keep = keep & (dev <= cutoff * current)
        if new_keep.sum() == keep.sum() or new_keep.sum() < 3:
            break
        keep = new_keep
        rot, trans = kabsch(p[keep], q[keep])
        cycles_run += 1
    moved = p @ rot.T + trans
    return {
        "rotation": rot,
        "translation": trans,
        "rmsd": rmsd(moved[keep], q[keep]),
        "atoms": int(keep.sum()),
        "initial_atoms": int(len(p)),
        "initial_rmsd": initial,
        "mask": keep,
        "cycles_run": cycles_run,
    }


def apply_transform(coords, rotation, translation):
    return np.asarray(coords, dtype=np.float64) @ np.asarray(rotation).T + np.asarray(translation)

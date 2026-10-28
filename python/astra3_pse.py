# ============================================================
# astra3_pse.py
# Astra3: Structural Analysis Toolkit for PDB Rendering Automation
# Created by Andre Aguirre
# Copyright (c) 2026 Andre Aguirre
# Licensed under the GNU General Public License, version 3 or later (GPL-3.0-or-later).
# See LICENSE file for details.
# ============================================================
#
# PyMOL session files (.pse) without PyMOL.
#
# A .pse file is a Python pickle of PyMOL's session: nested lists of
# numbers and strings in the layout open-source PyMOL writes (format 3.0).
#
#   write_session: the Astra3 Engine's session, so PyMOL opens the scene
#                  Astra3 drew (structures, colors, cartoon, ligand sticks,
#                  ion spheres, termini arrows, camera, white background).
#   read_session:  the molecules in a session, so one can be imported with
#                  any engine. It accepts only plain values: anything else
#                  in the file (which a pickle could use to run code) stops
#                  the import.
#
# Sessions saved with PyMOL's pse_binary_dump setting on, or by PyMOL
# versions before 1.8, store atoms differently and are not read here.
# ============================================================

import codecs
import io
import os
import pickle

import numpy as np

SESSION_VERSION = 3000000   # the format PyMOL 3.x writes

# PyMOL's atom flags (see PyMOL's "flag" command): protein and nucleic acid
# classes, and the bits PyMOL reserves for itself.
FLAG_PROTEIN = 1 << 6
FLAG_NUCLEIC = 1 << 7
FLAG_IGNORE = 1 << 25          # left out of surfaces
FLAG_POLYMER = 1 << 27
FLAG_SOLVENT = 1 << 28
FLAG_ORGANIC = 1 << 29
FLAG_INORGANIC = 1 << 30
FLAG_GUIDE = 1 << 31           # the atom cartoons are traced through

# Representation bits, and what PyMOL shows for each class on loading.
REP_STICKS, REP_SPHERES, REP_NB_SPHERES, REP_CARTOON, REP_LINES, REP_NONBONDED = 1, 2, 16, 32, 128, 2048
REP_LABELS = 8

# Global settings: (index, type) with type 1 bool, 2 int, 3 float, 5 color.
SETTING_BG_RGB = (6, 5)
SETTING_ANTIALIAS = (12, 2)
SETTING_RAY_OPAQUE_BACKGROUND = (137, 2)
SETTING_FIELD_OF_VIEW = (152, 3)
SETTING_RAY_TRACE_MODE = (468, 2)
SETTING_CGO_LIGHTING = (671, 2)

# Van der Waals radii (A) as PyMOL assigns them on loading: Bondi (1964)
# where Bondi gives one, 1.80 otherwise. They set sphere sizes.
VDW = {"H": 1.2, "D": 1.2, "HE": 1.4, "LI": 1.82, "BE": 1.8, "B": 1.85, "C": 1.7, "N": 1.55, "O": 1.52,
       "F": 1.47, "NE": 1.54, "NA": 2.27, "MG": 1.73, "AL": 2.0, "SI": 2.1, "P": 1.8, "S": 1.8, "CL": 1.75,
       "AR": 1.88, "K": 2.75, "MN": 1.73, "NI": 1.63, "CU": 1.4, "ZN": 1.39, "GA": 1.87, "AS": 1.85,
       "SE": 1.9, "BR": 1.85, "KR": 2.02, "PD": 1.63, "AG": 1.72, "CD": 1.58, "IN": 1.93, "SN": 2.17,
       "TE": 2.06, "I": 1.98, "XE": 2.16, "PT": 1.75, "AU": 1.66, "HG": 1.55, "TL": 1.96, "PB": 2.02,
       "U": 1.86}
DEFAULT_VDW = 1.8

ELEMENTS = ("H HE LI BE B C N O F NE NA MG AL SI P S CL AR K CA SC TI V CR MN FE CO NI CU ZN GA GE AS SE BR KR "
            "RB SR Y ZR NB MO TC RU RH PD AG CD IN SN SB TE I XE CS BA LA CE PR ND PM SM EU GD TB DY HO ER TM "
            "YB LU HF TA W RE OS IR PT AU HG TL PB BI PO AT RN FR RA AC TH PA U NP PU AM CM BK CF ES FM MD NO "
            "LR RF DB SG BH HS MT DS RG CN NH FL MC LV TS OG").split()
ATOMIC_NUMBER = {e: k + 1 for k, e in enumerate(ELEMENTS)}
ATOMIC_NUMBER["D"] = 1

# Covalent radii (A), Cordero et al. (2008) Dalton Trans. 2832-2838, for
# finding bonds from distances; 1.50 for elements not listed.
COVALENT = {"H": 0.31, "D": 0.31, "B": 0.84, "C": 0.76, "N": 0.71, "O": 0.66, "F": 0.57, "SI": 1.11,
            "P": 1.07, "S": 1.05, "CL": 1.02, "SE": 1.20, "BR": 1.20, "I": 1.39, "AS": 1.19}
BOND_TOLERANCE = 0.45
BOND_MIN = 0.4


# ------------------------------------------------------------
# Writing
# ------------------------------------------------------------

def _pymol_flags(mol, engine):
    out = np.zeros(mol.n, dtype=np.int64)
    f = mol.flags
    out |= np.where(f & engine.F_POLYMER, FLAG_POLYMER, 0)
    out |= np.where(f & engine.F_PROTEIN, FLAG_PROTEIN, 0)
    out |= np.where(f & engine.F_NUCLEIC, FLAG_NUCLEIC | FLAG_IGNORE, 0)
    out |= np.where(f & engine.F_SOLVENT, FLAG_SOLVENT | FLAG_IGNORE, 0)
    out |= np.where(f & engine.F_ORGANIC, FLAG_ORGANIC | FLAG_IGNORE, 0)
    out |= np.where(f & engine.F_INORGANIC, FLAG_INORGANIC | FLAG_IGNORE, 0)
    out |= np.where(f & engine.F_GUIDE, FLAG_GUIDE, 0)
    return out


def _representations(mol, engine):
    """What PyMOL shows for each class when it loads a structure: cartoon
    for polymers, sticks for ligands, spheres for ions, and water as
    nonbonded points."""
    f = mol.flags
    reps = np.zeros(mol.n, dtype=np.int64)
    reps[(f & engine.F_POLYMER) != 0] = REP_CARTOON
    reps[(f & engine.F_ORGANIC) != 0] = REP_STICKS | REP_NB_SPHERES
    reps[(f & engine.F_INORGANIC) != 0] = REP_SPHERES
    reps[(f & engine.F_SOLVENT) != 0] = REP_LINES | REP_NONBONDED
    # Show kept session labels.
    reps[np.array([bool(str(t)) for t in mol.label], dtype=bool)] |= REP_LABELS
    return reps


def find_bonds(mol, engine):
    """Covalent bonds of the first state from distances: within a residue,
    plus peptide (C-N), nucleic (O3'-P) and disulfide (SG-SG) links between
    residues. Atoms in different alternate locations are not bonded, nor
    two hydrogens, nor ions and water to other residues."""
    xyz = mol.coords[0]
    has = ~np.isnan(xyz).any(axis=1)
    idx = np.flatnonzero(has)
    if len(idx) < 2:
        return []
    elems = [str(e).upper() for e in mol.elem]
    radius = np.array([COVALENT.get(e, 1.5) for e in elems])
    residue_of = np.zeros(mol.n, dtype=np.int64)
    for k, (start, stop) in enumerate(mol.residue_bounds()):
        residue_of[start:stop] = k
    names = [str(n) for n in mol.atom_name]
    links = {("C", "N"), ("N", "C"), ("O3'", "P"), ("P", "O3'"), ("SG", "SG")}
    bonds = []
    for a, b in _bonding_distance_pairs(xyz, idx, radius):
        if elems[a] in ("H", "D") and elems[b] in ("H", "D"):
            continue
        alt_a, alt_b = str(mol.alt[a]), str(mol.alt[b])
        if alt_a and alt_b and alt_a != alt_b:
            continue
        if residue_of[a] != residue_of[b]:
            if (names[a], names[b]) not in links:
                continue
            if (mol.flags[a] | mol.flags[b]) & (engine.F_SOLVENT | engine.F_INORGANIC):
                continue
        bonds.append((a, b))
    return bonds


def _bonding_distance_pairs(xyz, idx, radius):
    """[(a, b)], a < b, for the atoms in idx that lie at bonding distance:
    further apart than BOND_MIN and closer than their covalent radii plus
    BOND_TOLERANCE. Ordered by a, then by the cell b is in (the 27 cells
    around a's, x outermost), then by b; a session lists bonds in that order."""
    cell = 2.5
    keys = np.floor(xyz[idx] / cell).astype(np.int64)
    kx, ky, kz = (_renumbered(keys[:, k]) for k in range(3))
    wide_y, wide_z = int(ky.max()) + 2, int(kz.max()) + 2
    code = (kx * wide_y + ky) * wide_z + kz
    by_cell = np.argsort(code, kind="stable")      # atoms of one cell together, in idx order
    code = code[by_cell]
    found_a, found_b = [], []
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                # Each atom with every atom of the cell at this offset from its own.
                there = code + ((dx * wide_y + dy) * wide_z + dz)
                first = np.searchsorted(code, there, "left")
                count = np.searchsorted(code, there, "right") - first
                a = np.repeat(np.arange(len(code)), count)
                b = np.repeat(first - (np.cumsum(count) - count), count) + np.arange(len(a))
                a, b = by_cell[a], by_cell[b]
                later = b > a
                a, b = idx[a[later]], idx[b[later]]
                d = np.linalg.norm(xyz[b] - xyz[a], axis=1)
                ok = (d > BOND_MIN) & (d < radius[b] + radius[a] + BOND_TOLERANCE)
                found_a.append(a[ok])
                found_b.append(b[ok])
    a, b = np.concatenate(found_a), np.concatenate(found_b)
    by_atom = np.argsort(a, kind="stable")          # keeps each atom's pairs in the order found
    return list(zip(a[by_atom].tolist(), b[by_atom].tolist()))


def _renumbered(values):
    """Integers renumbered from 1 so that equal ones stay equal and
    neighbours (one apart) stay neighbours, every wider gap becoming two.
    A grid cell's three numbers then combine into a single one without
    overflow, however far apart the coordinates are."""
    distinct, inverse = np.unique(values, return_inverse=True)
    step = np.where(distinct[1:] > distinct[:-1] + 1, 2, 1)
    return np.concatenate([[1], 1 + np.cumsum(step)]).astype(np.int64)[inverse]


def _atom_list(mol, i, reps, flags, bonded):
    elem = str(mol.elem[i])
    upper = elem.upper()
    resv = int(mol.resv[i])
    ss = str(mol.ss[i])
    return [resv, str(mol.chain[i]), str(mol.alt[i]), str(mol.resi[i]), str(mol.segi[i]), str(mol.resn[i]),
            str(mol.atom_name[i]), elem, "", str(mol.label[i]), ss if ss in ("H", "S", "L") else "",
            1 if upper in ("H", "D") else 0, 0, int(mol.priority[i]), float(mol.b[i]), float(mol.q[i]),
            VDW.get(upper, DEFAULT_VDW), 0.0, int(mol.formal_charge[i]), int(mol.hetatm[i]), int(reps[i]),
            int(mol.color[i]), int(mol.ID[i]), 0, int(flags[i]) & 0xFFFFFFFF, 1 if bonded[i] else 0,
            0, 0, 0, 0, 0, ATOMIC_NUMBER.get(upper, 0), 0, 0, 0, 0.0, int(mol.rank[i]), 0, 0, 0, 0,
            0.0, 0.0, 0.0, 0.0, 0.0, 0.0, ""]


def _coordinate_set(xyz, n):
    present = np.flatnonzero(~np.isnan(xyz).any(axis=1))
    atm_to_idx = [-1] * n
    for k, i in enumerate(present):
        atm_to_idx[int(i)] = k
    coords = [float(v) for v in xyz[present].reshape(-1)]
    return [len(present), n, coords, [int(i) for i in present], atm_to_idx, "", [None],
            None, None, None, None, None, None]


def _object_base(kind, name, color, reps, extent=None, settings=None, enabled=True):
    low, high = extent if extent is not None else ([0.0, 0.0, 0.0], [0.0, 0.0, 0.0])
    return [kind, name, color, reps, [float(v) for v in low], [float(v) for v in high],
            1 if extent is not None else 0, 0, settings, 1 if enabled else 0, 0, [0.0] * 16, 0, None]


def _molecule_entry(mol, engine):
    reps = _representations(mol, engine)
    flags = _pymol_flags(mol, engine)
    bonds = find_bonds(mol, engine)
    bonded = np.zeros(mol.n, dtype=bool)
    for a, b in bonds:
        bonded[a] = bonded[b] = True
    atoms = [_atom_list(mol, i, reps, flags, bonded) for i in range(mol.n)]
    states = [_coordinate_set(mol.coords[s], mol.n) for s in range(len(mol.coords))]
    data = [_object_base(1, mol.name, 26, 0, enabled=mol.enabled), len(states), len(bonds), mol.n, states, None,
            [[a, b, 1, -1, 0, 0, 0] for a, b in bonds], atoms, 0, 0, None, 0, -1, mol.n, None, None]
    return [mol.name, 0, 1 if mol.enabled else 0, None, 1, data, ""]


def _cgo_extent(data):
    """The extent of a CGO list's cylinders and cones (x1..z2 and radius)."""
    points = []
    i = 0
    while i < len(data):
        op = int(data[i])
        if op in (9, 27):
            v = data[i + 1:i + 8]
            r = v[6]
            points += [[v[0] - r, v[1] - r, v[2] - r], [v[0] + r, v[1] + r, v[2] + r],
                       [v[3] - r, v[4] - r, v[5] - r], [v[3] + r, v[4] + r, v[5] + r]]
            i += 14 if op == 9 else 17
        elif op == 4:
            points.append(data[i + 1:i + 4])
            i += 4
        elif op == 7:
            v = data[i + 1:i + 5]
            points += [[v[0] - v[3], v[1] - v[3], v[2] - v[3]], [v[0] + v[3], v[1] + v[3], v[2] + v[3]]]
            i += 5
        elif op == 6:
            i += 4
        elif op in (2, 10, 11, 25):
            i += 2
        else:
            i += 1
    if not points:
        return None
    p = np.array(points, dtype=np.float64)
    return p.min(axis=0), p.max(axis=0)


def _cgo_entry(obj):
    data = [float(x) for x in obj.data]
    base = _object_base(6, obj.name, 0, 2060287, extent=_cgo_extent(data), settings=[[SETTING_CGO_LIGHTING[0],
                        SETTING_CGO_LIGHTING[1], 1]], enabled=obj.enabled)
    return [obj.name, 0, 1 if obj.enabled else 0, None, 6, [base, 1, [[[len(data), data]]]], ""]


def _selection_entry(selection, molecules):
    """A named selection as PyMOL stores it: per object, its atoms' indices."""
    parts = []
    for mol in molecules:
        uids = selection.members.get(id(mol))
        if not uids:
            continue
        index = [int(i) for i in np.flatnonzero(np.isin(mol.uid, np.fromiter(uids, dtype=np.int64)))]
        if index:
            parts.append([mol.name, index, [1] * len(index)])
    if not parts:
        return None
    return [selection.name, 1, 1 if selection.enabled else 0, None, -1, parts, ""]


def _session_view(view, fov):
    """PyMOL's 18-number view in the session's layout (a 4 x 4 rotation).
    The last number is the field of view, negative for perspective."""
    v = [float(x) for x in view]
    if v[17] < 0:
        v[17] = -abs(float(fov))
    return v[0:3] + [0.0] + v[3:6] + [0.0] + v[6:9] + [0.0, 0.0, 0.0, 0.0, 1.0] + v[9:18]


def _color_index(rgb, engine):
    rgb = tuple(round(float(c), 4) for c in rgb[:3])
    for name in ("white", "black"):
        index, value = engine.COLORS[name]
        if tuple(round(float(c), 4) for c in value) == rgb:
            return index
    for _name, (index, value) in engine.COLORS.items():
        if tuple(round(float(c), 4) for c in value) == rgb:
            return index
    return 0


def session_dict(engine=None):
    """The current scene (all objects astra3_chimerax holds, with their
    shown/hidden state) as PyMOL's session dictionary."""
    if engine is None:
        import astra3_chimerax as engine
    store = engine.STORE
    names = [None]
    molecules = [o for o in store.names.values() if isinstance(o, engine.Molecule)]
    for obj in store.names.values():
        if isinstance(obj, engine.Molecule):
            names.append(_molecule_entry(obj, engine))
        elif isinstance(obj, engine.CGOObject):
            names.append(_cgo_entry(obj))
        elif isinstance(obj, engine.Selection):
            entry = _selection_entry(obj, molecules)
            if entry is not None:
                names.append(entry)
    used = set()
    for obj in store.names.values():
        if isinstance(obj, engine.Molecule):
            used.update(int(c) for c in np.unique(obj.color))
    builtin_max = 5387
    colors = []
    for name, (index, rgb) in engine.COLORS.items():
        if index > builtin_max and index in used:
            colors.append([name, int(index), [float(c) for c in rgb], 1, 0, [0.0, 0.0, 0.0], 0])
    settings = [[SETTING_BG_RGB[0], SETTING_BG_RGB[1], _color_index(store.bg, engine)]]
    for name, (index, kind) in (("antialias", SETTING_ANTIALIAS), ("ray_trace_mode", SETTING_RAY_TRACE_MODE),
                                ("ray_opaque_background", SETTING_RAY_OPAQUE_BACKGROUND),
                                ("field_of_view", SETTING_FIELD_OF_VIEW)):
        value = store.settings.get(name)
        if value is None:
            continue
        try:
            settings.append([index, kind, float(value) if kind == 3 else int(float(value))])
        except ValueError:
            continue
    view = store.view or engine._default_view()
    return {
        "version": SESSION_VERSION, "names": names, "settings": settings, "colors": colors,
        "color_ext": [], "view": _session_view(view, engine._fov()), "view_dict": {}, "unique_settings": [],
        "selector_secrets": [], "editor": [], "cache": [], "main": [0, 0],
        "movie": [0, 0, [0.0] * 25, 0, None, None, None], "moviescenes": [[], []],
        "wizard": pickle.dumps([], 1),
    }


def write_session(path, scene=None):
    """Writes a PyMOL session of everything astra3_chimerax holds. scene is
    accepted for the graphics interface and not needed."""
    session = session_dict()
    temp = str(path) + ".tmp"
    with open(temp, "wb") as fh:
        pickle.dump(session, fh, 1)
    os.replace(temp, path)


# ------------------------------------------------------------
# Reading
# ------------------------------------------------------------

class SessionError(Exception):
    pass


class _Storage:
    """Stands in for pymol.Session_Storage (data plug-ins keep in a session)."""

    def __setstate__(self, state):
        pass


class _SafeUnpickler(pickle.Unpickler):
    """Accepts the two classes PyMOL's own sessions contain and nothing else."""

    ALLOWED = {("_codecs", "encode"): codecs.encode,
               ("pymol", "Session_Storage"): _Storage}

    def find_class(self, module, name):
        try:
            return self.ALLOWED[(module, name)]
        except KeyError:
            raise SessionError(f"the file holds a Python object ({module}.{name}) that a PyMOL session "
                               f"does not contain, so it was not opened") from None


def load_session_dict(path):
    with open(path, "rb") as fh:
        data = fh.read()
    if data[:2] == b"\x1f\x8b":
        import gzip
        data = gzip.decompress(data)
    try:
        session = _SafeUnpickler(io.BytesIO(data), encoding="latin1").load()
    except SessionError:
        raise
    except Exception as e:  # noqa: BLE001 -- any malformed pickle
        raise SessionError(f"not a readable PyMOL session ({type(e).__name__})") from None
    if not isinstance(session, dict) or "names" not in session:
        raise SessionError("not a PyMOL session")
    return session


def _text(value):
    return value.decode("latin1") if isinstance(value, bytes) else str(value)


# Non-molecule object types in a session, by PyMOL's type number
# (layer1/PyMOLObject.h). Groups (12) are omitted: they only contain other
# objects.
_OBJECT_KINDS = {2: "map", 3: "mesh", 4: "measurement", 5: "callback", 6: "drawing object", 7: "surface",
                 8: "gadget", 9: "calculator", 10: "slice", 11: "alignment", 13: "volume"}


def session_extras(path):
    """[(name, kind)] for a session's non-molecule objects (measurements,
    CGOs, maps, ...), read from the file so the result is engine-independent."""
    out = []
    for entry in load_session_dict(path).get("names") or []:
        if entry and len(entry) > 4 and entry[4] in _OBJECT_KINDS:
            out.append((_text(entry[0]), _OBJECT_KINDS[entry[4]]))
    return out


def _molecule_records(entry, engine):
    """(records, ss by residue) of one molecule object in a session."""
    data = entry[5]
    if not isinstance(data, list) or len(data) < 8:
        raise SessionError("an object in the session has an unknown layout")
    atoms = data[7]
    states = data[4] or []
    if not isinstance(atoms, list):
        raise SessionError("its atoms are stored in PyMOL's binary format (pse_binary_dump); open it in "
                           "PyMOL, run: set pse_binary_dump, 0, and save it again")
    records = []
    ss = {}
    for model, cset in enumerate(states, start=1):
        if not cset:
            continue
        coords, idx_to_atm = cset[2], cset[3]
        if idx_to_atm is None:
            idx_to_atm = list(range(len(coords) // 3))
        for k, i in enumerate(idx_to_atm):
            a = atoms[i]
            if len(a) < 20 or not isinstance(a[6], (str, bytes)) or not isinstance(a[14], float):
                raise SessionError("its atoms are stored in a layout from a PyMOL version before 1.8")
            r = engine._Record()
            resv = int(a[0])
            resi = _text(a[3])
            r.resv = resv
            r.ins = resi[len(str(resv)):] if resi.startswith(str(resv)) else ""
            r.chain, r.alt, r.segi = _text(a[1]), _text(a[2]), _text(a[4])
            r.resn, r.name, r.elem = _text(a[5]), _text(a[6]), _text(a[7]).upper()
            r.b, r.q = float(a[14]), float(a[15])
            r.formal_charge = int(a[18])
            r.hetatm = bool(a[19])
            r.ID = int(a[22])
            r.xyz = (float(coords[3 * k]), float(coords[3 * k + 1]), float(coords[3 * k + 2]))
            r.model = model
            r.label_seq = None
            r.entity = None
            # Only labels PyMOL actually shows (label representation on).
            r.label = _text(a[9]) if isinstance(a[9], (str, bytes)) and int(a[20]) & REP_LABELS else ""
            records.append(r)
            code = _text(a[10])
            if code in ("H", "S"):
                ss[(r.chain, resv, r.ins)] = code
    return records, ss


def read_session(path, engine=None):
    """[(object name, Molecule)] for the molecule objects in a PyMOL
    session, with the coordinates of every state and the session's
    secondary structure."""
    if engine is None:
        import astra3_chimerax as engine
    session = load_session_dict(path)
    out = []
    for entry in session.get("names") or []:
        if not entry or len(entry) < 6 or entry[4] != 1:
            continue
        name = _text(entry[0])
        records, ss = _molecule_records(entry, engine)
        if not records:
            continue
        mol = engine.Molecule.from_records(engine._legal_name(name), records)
        protein = (mol.flags & engine.F_PROTEIN) != 0
        values = []
        for i in range(mol.n):
            if not protein[i]:
                values.append("")
                continue
            resv = int(mol.resv[i])
            values.append(ss.get((str(mol.chain[i]), resv, str(mol.resi[i])[len(str(resv)):]), "L"))
        mol.ss = np.array(values, dtype=object)
        mol.enabled = bool(entry[2])
        out.append((mol.name, mol))
    if not out:
        raise SessionError("the session holds no molecules")
    return out

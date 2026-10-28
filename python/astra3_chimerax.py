# ============================================================
# astra3_chimerax.py
# Astra3: Structural Analysis Toolkit for PDB Rendering Automation
# Created by Andre Aguirre
# Copyright (c) 2026 Andre Aguirre
# Licensed under the GNU General Public License, version 3 or later (GPL-3.0-or-later).
# See LICENSE file for details.
# ============================================================
#
# Runs Astra3 under UCSF ChimeraX instead of PyMOL.
#
# Astra3 drives its molecular engine through PyMOL's `cmd` interface. Under
# ChimeraX this module provides that interface: it reads coordinate files,
# holds the atoms, evaluates Astra3's selections and runs its iterate/alter
# expressions. It follows PyMOL's own rules for everything a number depends
# on -- how residues are classed (protein, nucleic acid, water, ligand, ion),
# the order atoms are listed in, alternate locations kept as separate atoms,
# and the precedence of selection operators -- so an analysis gives the same
# results under either engine. ChimeraX supplies what only a graphics program
# can: secondary structure, images and the session file (astra3_chimerax_scene).
#
# install() puts this module in place of `pymol` before Astra3 imports it.
# ============================================================

import ast
import collections
import fnmatch
import functools
import gzip
import math
import os
import re
import sys
import types
import urllib.request

import numpy as np

# ------------------------------------------------------------
# PyMOL's residue classes (layer2/AtomInfo.cpp, layer3/Selector.cpp)
# ------------------------------------------------------------
PROTEIN_RESN = {"ALA", "ARG", "ASN", "ASP", "CYS", "CYX", "GLN", "GLU", "GLY", "HID", "HIE", "HIP", "HIS",
                "ILE", "LEU", "LYS", "MEE", "MET", "MSE", "PHE", "PRO", "PTR", "SER", "THR", "TRP", "TYR", "VAL"}
PNA_RESN = {"APN", "CPN", "GPN", "TPN", "IPN"}
NUCLEIC_RESN = {"A", "C", "G", "I", "T", "U", "DA", "DC", "DG", "DI", "DT", "DU"} | PNA_RESN
WATER_RESN = {"HOH", "H2O", "HOD", "DOD", "TIP", "T3P", "T4P", "WAT", "SOL", "SPC"}

F_POLYMER, F_PROTEIN, F_NUCLEIC, F_SOLVENT, F_ORGANIC, F_INORGANIC, F_GUIDE = 1, 2, 4, 8, 16, 32, 64

METALS = {"LI", "BE", "NA", "MG", "AL", "K", "CA", "SC", "TI", "V", "CR", "MN", "FE", "CO", "NI", "CU", "ZN",
          "GA", "RB", "SR", "Y", "ZR", "NB", "MO", "TC", "RU", "RH", "PD", "AG", "CD", "IN", "SN", "CS", "BA",
          "LA", "CE", "PR", "ND", "PM", "SM", "EU", "GD", "TB", "DY", "HO", "ER", "TM", "YB", "LU", "HF", "TA",
          "W", "RE", "OS", "IR", "PT", "AU", "HG", "TL", "PB", "BI", "PO", "FR", "RA", "AC", "TH", "PA", "U"}
BACKBONE_NAMES = {"CA", "C", "N", "O", "OXT", "P", "OP1", "OP2", "OP3", "O1P", "O2P", "O3P", "C1'", "C2'",
                  "O2'", "C3'", "O3'", "C4'", "O4'", "C5'", "O5'"}

# Names PyMOL will not give an object or selection, because the selection
# language reads them as keywords; it appends an underscore instead.
RESERVED_NAMES = set("""
+ - a. acc. acceptors all alt altloc and around b backbone bb. bc. bca. be. beyond bf. bm. bo. bonded
bound_to br. bs. bto. bycalpha bycell bychain byfrag byfragment bymol bymolecule byobj byobject byres byresi
byresidue byring byseg bysegi bysegment c. cartoon_color center chain color custom deloc. delocalized don.
donors e. elem element enabled expand extend f. fc. first fixed flag formal_charge fxd. gap guide h. hba.
hbd. het hetatm hydro hydrogens i. id idx. in index ino. inorganic l. label last like m. masked metals model
msk. n. name nbr. near_to neighbor none not nt. nto. numeric_type o. object or org. organic origin p.
partial_charge pc. pepseq pol. polymer polymer.nucleic polymer.protein pr. present protected ps. q r. rank
rep resi resid resident residue resn resname restrained ribbon_color rst. s. sc. segi segid segment
sidechain sol. solvent ss state stereo symbol text_type tt. v. visible w. within x x. xt. y z
""".split())

# PyMOL's named colors that Astra3 uses: name -> (PyMOL color index, RGB).
# The indices are PyMOL's own, so code that compares an atom's color with
# get_color_index() reads the same values under either engine.
COLORS = {
    "white": (0, (1, 1, 1)), "black": (1, (0, 0, 0)), "blue": (2, (0, 0, 1)), "green": (3, (0, 1, 0)),
    "red": (4, (1, 0, 0)), "cyan": (5, (0, 1, 1)), "yellow": (6, (1, 1, 0)), "magenta": (8, (1, 0, 1)),
    "salmon": (9, (1, 0.6, 0.6)), "slate": (11, (0.5, 0.5, 1)), "hotpink": (12, (1, 0, 0.5)),
    "orange": (13, (1, 0.5, 0)), "marine": (17, (0, 0.5, 1)), "purple": (19, (0.75, 0, 0.75)),
    "teal": (20, (0, 0.75, 0.75)), "forest": (22, (0.2, 0.6, 0.2)), "deepblue": (23, (0.25, 0.25, 0.65)),
    "grey": (24, (0.5, 0.5, 0.5)), "carbon": (26, (0.2, 1, 0.2)), "brightorange": (30, (1, 0.7, 0.2)),
    "pink": (48, (1, 0.65, 0.85)), "firebrick": (49, (0.698, 0.13, 0.13)),
    "chocolate": (50, (0.555, 0.222, 0.111)), "brown": (51, (0.65, 0.32, 0.17)),
    "wheat": (52, (0.99, 0.82, 0.65)), "violet": (53, (1, 0.5, 1)),
    "lightmagenta": (154, (1, 0.2, 0.8)), "paleyellow": (5256, (1, 1, 0.5)),
    "aquamarine": (5257, (0.5, 1, 1)), "deepsalmon": (5258, (1, 0.5, 0.5)),
    "palegreen": (5259, (0.65, 0.9, 0.65)), "lightblue": (5263, (0.75, 0.75, 1)),
    "lightorange": (5264, (1, 0.8, 0.5)), "palecyan": (5265, (0.8, 1, 1)),
    "raspberry": (5268, (0.7, 0.3, 0.4)), "sand": (5269, (0.72, 0.55, 0.3)),
    "dirtyviolet": (5272, (0.7, 0.5, 0.5)), "lightpink": (5274, (1, 0.75, 0.87)),
    "skyblue": (5277, (0.2, 0.5, 0.8)), "bluewhite": (5278, (0.85, 0.85, 1)),
    "gold": (5354, (1, 0.819608, 0.137255)),
    "tv_red": (32, (1, 0.2, 0.2)), "tv_green": (33, (0.2, 1, 0.2)), "tv_blue": (34, (0.3, 0.3, 1)),
    "deepteal": (5262, (0.1, 0.6, 0.6)), "lightteal": (5266, (0.4, 0.7, 0.7)),
    "violetpurple": (5271, (0.55, 0.25, 0.6)),
}
# PyMOL's grey ramp: greyNN is index 54 + NN, value NN/99.
for _n in range(100):
    COLORS["grey%02d" % _n if _n < 10 else "grey%d" % _n] = (54 + _n, (_n / 99.0,) * 3)
    COLORS["gray%02d" % _n if _n < 10 else "gray%d" % _n] = (54 + _n, (_n / 99.0,) * 3)
COLORS["gray"] = COLORS["grey"]
_COLOR_BY_INDEX = {}
for _name, (_idx, _rgb) in COLORS.items():
    _COLOR_BY_INDEX.setdefault(_idx, _rgb)

# Colors PyMOL gives atoms on loading: carbon by object, the rest by element.
ELEMENT_COLORS = {"C": 26, "N": 2, "O": 4, "S": 6, "H": 0, "P": 13, "SE": 13}


class CmdException(Exception):
    pass


def single(xyz):
    """Coordinates as PyMOL holds them, in single precision, so a
    measurement is the same to the last digit under every engine."""
    return np.asarray(xyz, dtype=np.float64).astype(np.float32).astype(np.float64)


# ------------------------------------------------------------
# Element and atom-order rules (port of AtomInfoAssignParameters)
# ------------------------------------------------------------

def guess_element(name, resn):
    """Element from an atom name, as PyMOL guesses it when the file gives none."""
    n = name
    while n[:1].isdigit() and len(n) > 1:
        n = n[1:]
    e = n[:2]
    if not e:
        return ""
    first, second = e[0], e[1:2]
    if first == "C":
        if second == "A":
            if resn.upper() not in ("CA", "CA+"):
                second = ""
        elif second not in ("a", "l", "L", "u", "U", "o", "O", "s", "S", "r", "R"):
            second = ""
    elif first == "H":
        if second != "e":
            second = ""
    elif first in ("D", "Q"):
        second = ""
    elif first == "N":
        if second not in ("i", "I", "a", "A", "b", "B"):
            second = ""
    elif first == "S":
        if second not in ("e", "E", "r", "R", "c", "C", "b", "B"):
            second = ""
    elif first == "O":
        if second != "s":
            second = ""
    e = first + second
    if len(e) == 2 and e not in ("LP", "PS"):
        e = e[0] + e[1].lower()
    return "H" if e == "D" else e


def _digits_value(text, start, value, stop_on_prime=False):
    """PyMOL's in-place number reading for atom-name priorities."""
    i = start
    while i < len(text):
        ch = text[i]
        if stop_on_prime:
            if ch == "P":
                return value - 200
            if ch in ("*", "'"):
                return -100 - value
            if not ch.isdigit():
                break
        value = value * 10 + (ord(ch) - 48)
        i += 1
    return value


def atom_priority(name, elem):
    """Sort priority of an atom name within its residue (PyMOL, standard order)."""
    n = name
    while n[:1].isdigit() and len(n) > 1:
        n = n[1:]
    if not n or n[0].upper() != (elem[:1].upper() if elem else ""):
        return 1000
    c0 = n[0]
    c1 = n[1] if len(n) > 1 else ""
    if c0 in "NCOS":
        if c1 == "":
            return {"N": 1, "C": 3, "O": 4}.get(c0, 1000)
        if c1 == "A":
            return 2 if c0 == "C" else 5
        table = {"B": 6, "G": 7, "D": 8, "E": 9, "Z": 10, "H": 11, "I": 12, "J": 13, "K": 14, "L": 15,
                 "M": 16, "N": 17}
        if c1 in table:
            return table[c1]
        if c1 == "X" or c1.isdigit():
            # PyMOL's switch falls through from 'X' into the digit case.
            return _digits_value(n, 1, 0, stop_on_prime=True) + 300
        return 500
    if c0 == "P":
        return 20
    if c0 in "DH":
        if c1 == "":
            return 1001
        table = {"A": 1003, "B": 1003, "G": 1004, "D": 1005, "E": 1006, "Z": 1007, "H": 1008, "I": 1009,
                 "J": 1010, "K": 1011, "L": 1012, "M": 1013, "N": 1002, "X": 1999}
        if c1 in table:
            return table[c1]
        if c1.isdigit():
            value = 1020
            for ch in n[1:]:
                value = value * 10 + (ord(ch) - 48)
            return value + 25
        return 1500
    return 1000


def _name_sort_key(name):
    stripped = name[1:] if name[:1].isdigit() else name
    return (stripped.lower(), name.lower())


# ------------------------------------------------------------
# Coordinate file readers
# ------------------------------------------------------------

_ATOM_FIELDS = ("segi", "chain", "resi", "resn", "atom_name", "alt", "elem", "ss", "text_type", "label")
_NUM_FIELDS = ("q", "b", "resv", "ID", "rank", "color", "hetatm", "formal_charge", "flags", "priority",
               "partial_charge")


class _Record:
    __slots__ = ("segi", "chain", "resv", "ins", "resn", "name", "alt", "elem", "q", "b", "hetatm", "ID",
                 "formal_charge", "xyz", "model", "label_seq", "entity", "label")


def _strings(values):
    """A numpy array of Python strings (load() has a parameter named
    `object`, PyMOL's own signature, so the builtin is not used there)."""
    return np.array(list(values), dtype=object)


def _read_text(path):
    opener = gzip.open if str(path).lower().endswith(".gz") else open
    with opener(path, "rb") as fh:
        return fh.read().decode("utf-8-sig", errors="replace")


def _pdb_int(text, default=0):
    text = text.strip()
    if not text:
        return default
    try:
        return int(text)
    except ValueError:
        pass
    # Hybrid-36, used for serial and residue numbers beyond the column width.
    try:
        if text[0].isupper():
            return int(text, 36) - 10 * 36 ** (len(text) - 1) + 10 ** len(text)
        return int(text, 36) + 16 * 36 ** (len(text) - 1) + 10 ** len(text)
    except ValueError:
        return default


def _pdb_float(text, blank, invalid):
    """A numeric column as PyMOL reads it: `blank` when the column is empty
    or missing, `invalid` when it holds something else."""
    text = text.strip()
    if not text:
        return blank
    try:
        return float(text.split()[0])
    except ValueError:
        return invalid


def _pdb_element(line, literal, bogus_alignment):
    """Element of a PDB atom record: the element column when it holds a
    symbol, otherwise from the alignment of the atom name, as PyMOL reads it."""
    field = line[76:78].split()
    elem = field[0] if field else ""
    if elem and elem[0].isalpha() and (len(elem) == 1 or elem[1].isalpha()):
        return elem
    a, b = literal[0], literal[1]
    if (a == " " or a.isdigit()) and "A" <= b <= "Z":
        return b
    if "A" <= a <= "Z" and b.isalpha():
        if "A" <= b <= "Z":
            return a if (bogus_alignment or a == "H") else a + b.lower()
        return a + b
    return ""


def parse_pdb(text):
    """Atom records and helix/sheet ranges of a PDB-format file."""
    records = []
    model = 1
    reading = True        # atoms after ENDMDL count only once another MODEL starts
    closed = False
    helices, sheets = [], []
    lines = text.splitlines()
    # PyMOL trusts two-letter names in column 13 as elements only when no
    # atom name in the file is indented the standard way.
    bogus_alignment = not any(l[:6] in ("ATOM  ", "HETATM") and l[12:13] == " " and l[13:14] not in (" ", "")
                              for l in lines)
    for line in lines:
        tag = line[:6]
        if tag == "MODEL ":
            if closed:
                model += 1
                closed = False
            reading = True
            continue
        if tag == "ENDMDL":
            closed = True
            reading = False
            continue
        if tag == "HELIX ":
            helices.append((line[19:20], _pdb_int(line[21:25]), line[25:26].strip(),
                            line[31:32], _pdb_int(line[33:37]), line[37:38].strip()))
            continue
        if tag == "SHEET ":
            sheets.append((line[21:22], _pdb_int(line[22:26]), line[26:27].strip(),
                           line[32:33], _pdb_int(line[33:37]), line[37:38].strip()))
            continue
        if tag not in ("ATOM  ", "HETATM") or not reading:
            continue
        if len(line) < 54:
            continue
        r = _Record()
        r.hetatm = tag == "HETATM"
        r.ID = _pdb_int(line[6:11])
        literal = line[12:16].ljust(4)
        r.name = literal.strip()
        r.alt = line[16:17].strip()
        r.resn = line[17:21].strip()
        r.chain = line[21:22].strip()
        r.resv = _pdb_int(line[22:26])
        r.ins = line[26:27].strip()
        try:
            r.xyz = (float(line[30:38]), float(line[38:46]), float(line[46:54]))
        except ValueError:
            continue
        r.q = _pdb_float(line[54:60], 0.0, 1.0)
        r.b = _pdb_float(line[60:66], 0.0, 0.0)
        r.segi = line[72:76].strip()
        r.elem = _pdb_element(line, literal, bogus_alignment)
        charge = line[78:80].strip()
        r.formal_charge = 0
        if len(charge) == 2 and charge[0].isdigit() and charge[1] in "+-":
            r.formal_charge = int(charge[0]) * (1 if charge[1] == "+" else -1)
        r.model = model
        records.append(r)
    return records, {"helix": helices, "sheet": sheets}


_QUOTED = "\x00"   # marks a token that was quoted, so it is always a value


def split_cif_blocks(text):
    """Split CIF text into [(block name, block text)], in file order. Lines
    inside semicolon text fields never start a block."""
    blocks = []
    name, start, in_text = None, 0, False
    lines = text.splitlines(keepends=True)
    offset = 0
    for line in lines:
        if line.startswith(";"):
            in_text = not in_text
        elif not in_text and line[:5].lower() == "data_":
            if name is not None:
                blocks.append((name, text[start:offset]))
            name, start = line[5:].split()[0] if line[5:].split() else "", offset
        offset += len(line)
    if name is None:
        return [("", text)]
    blocks.append((name, text[start:]))
    return blocks


def _cif_tokens(text):
    """Tokens of a CIF file. Quoted values come back prefixed with _QUOTED."""
    tokens = []
    token_re = re.compile(r"""\s*('(?:[^']|'(?=\S))*'(?=\s|$)|"(?:[^"]|"(?=\S))*"(?=\s|$)|\S+)""")
    lines = text.splitlines()
    i, n = 0, len(lines)
    while i < n:
        line = lines[i]
        if line.startswith(";"):
            block = [line[1:]]
            i += 1
            while i < n and not lines[i].startswith(";"):
                block.append(lines[i])
                i += 1
            i += 1
            tokens.append(_QUOTED + "\n".join(block).strip())
            continue
        i += 1
        if "'" not in line and '"' not in line:
            words = line.split()
            for k, w in enumerate(words):
                if w.startswith("#"):
                    del words[k:]
                    break
            tokens.extend(words)
            continue
        pos = 0
        while True:
            m = token_re.match(line, pos)
            if not m:
                break
            tok = m.group(1)
            pos = m.end()
            if tok.startswith("#"):
                break
            if tok[0] in "'\"" and len(tok) >= 2 and tok[-1] == tok[0]:
                tokens.append(_QUOTED + tok[1:-1])
            else:
                tokens.append(tok)
    return tokens


def parse_cif_categories(text, wanted):
    """{category: (items, rows)} for the wanted categories of the first data
    block; rows are lists of values in item order."""
    wanted = {w.lower() for w in wanted}
    out = {}
    tokens = _cif_tokens(text)
    i, n, blocks = 0, len(tokens), 0

    def is_value(tok):
        return tok[:1] == _QUOTED or not (tok[:1] == "_" or tok.lower() == "loop_" or tok[:5].lower() == "data_")

    while i < n:
        tok = tokens[i]
        if tok[:1] == _QUOTED:
            i += 1
        elif tok[:5].lower() == "data_":
            blocks += 1
            if blocks > 1:
                break
            i += 1
        elif tok.lower() == "loop_":
            i += 1
            tags = []
            while i < n and tokens[i][:1] == "_":
                tags.append(tokens[i])
                i += 1
            start = i
            while i < n:
                t = tokens[i]
                c = t[:1]
                if c == "_" or (c in "lLdD" and (t.lower() == "loop_" or t[:5].lower() == "data_")):
                    break
                i += 1
            if not tags:
                continue
            category = tags[0].split(".")[0].lower()
            w = len(tags)
            if (i - start) % w:
                raise CmdException("Parsing CIF file failed: truncated loop")
            if category in wanted:
                items = [t.split(".", 1)[1] if "." in t else t for t in tags]
                values = [v[1:] if v[:1] == _QUOTED else v for v in tokens[start:i]]
                out[category] = (items, [values[k:k + w] for k in range(0, len(values), w)])
        elif tok[:1] == "_":
            category = tok.split(".")[0].lower()
            has_value = i + 1 < n and is_value(tokens[i + 1])
            if category in wanted:
                items, rows = out.setdefault(category, ([], [[]]))
                items.append(tok.split(".", 1)[1] if "." in tok else tok)
                v = tokens[i + 1] if has_value else ""
                rows[0].append(v[1:] if v[:1] == _QUOTED else v)
            i += 2 if has_value else 1
        else:
            i += 1
    return out


def _cif_rows(cats, category):
    """Rows of a category as dicts (small categories only)."""
    items, rows = cats.get(category, ([], []))
    return [dict(zip(items, r)) for r in rows]


def _cif_value(row, *keys, default=""):
    for k in keys:
        v = row.get(k)
        if v is not None and v not in ("?", "."):
            return v
    return default


def _missing_ca_records(cats, records):
    """A CA atom without coordinates for each residue of a protein chain's
    sequence that the file has no atoms for, as PyMOL adds them (its
    add_missing_ca): they mark the gaps and termini a model leaves out."""
    polypeptide = set()
    sequences = {}
    for row in _cif_rows(cats, "_entity_poly"):
        if _cif_value(row, "type").lower().startswith("polypeptide"):
            entity = _cif_value(row, "entity_id")
            polypeptide.add(entity)
            one = row.get("pdbx_seq_one_letter_code")
            if one is not None and one not in ("?", "."):
                seq = []
                k = 0
                text = "".join(one.split())
                while k < len(text):
                    if text[k] == "(":
                        end = text.find(")", k)
                        if end < 0:
                            break
                        seq.append(text[k + 1:end])
                        k = end + 1
                    else:
                        seq.append(_ONE_TO_THREE.get(text[k], "UNK"))
                        k += 1
                sequences[entity] = seq
    if not any("pdbx_seq_one_letter_code" in r for r in _cif_rows(cats, "_entity_poly")):
        for row in _cif_rows(cats, "_entity_poly_seq"):
            seq = sequences.setdefault(_cif_value(row, "entity_id"), [])
            num = _pdb_int(_cif_value(row, "num"))
            if num >= 1:
                seq.extend([""] * (num - len(seq)))
                seq[num - 1] = _cif_value(row, "mon_id")
    scheme = {}
    for row in _cif_rows(cats, "_pdbx_poly_seq_scheme"):
        pdb_num = _cif_value(row, "pdb_seq_num")
        if pdb_num:
            scheme.setdefault(_cif_value(row, "asym_id"), {})[_pdb_int(_cif_value(row, "seq_id"))] = (
                _pdb_int(pdb_num), _cif_value(row, "pdb_ins_code"))
    added = []

    def fill(ref, upto, seq, sch, current, at_terminus, prev_resv):
        if not ref.label_seq:
            return current
        if current == 0:
            at_terminus = True
        current += 1
        while current < upto:
            resn = seq[current - 1] if 1 <= current <= len(seq) else ""
            if resn:
                if sch is not None and current in sch:
                    resv, ins = sch[current]
                else:
                    resv, ins = current + (ref.resv - ref.label_seq), ""
                    if not at_terminus and ((prev_resv is not None and resv <= prev_resv) or resv >= ref.resv):
                        current += 1
                        continue
                r = _Record()
                r.segi, r.chain, r.resn, r.name, r.alt, r.elem = ref.segi, ref.chain, resn, "CA", "", "C"
                r.resv, r.ins, r.q, r.b, r.hetatm, r.ID, r.formal_charge = resv, ins, 0.0, 0.0, False, -1, 0
                r.xyz, r.model, r.label_seq, r.entity = None, 1, current, ref.entity
                added.append(r)
            current += 1
        return current

    current, seq, sch, entity = 0, None, None, None
    for i, r in enumerate(records):
        if i == 0 or r.chain != records[i - 1].chain or r.entity != entity:
            if seq is not None and i > 0:
                fill(records[i - 1], len(seq) + 1, seq, sch, current, True, None)
            current, seq, sch, entity = 0, None, None, r.entity
            if r.entity in polypeptide:
                seq = sequences.get(r.entity)
                sch = scheme.get(r.segi) if scheme else None
        elif r.label_seq == records[i - 1].label_seq:
            continue
        if seq is not None:
            current = fill(r, r.label_seq, seq, sch, current, False, records[i - 1].resv if i > 0 else None)
    if seq is not None and records:
        fill(records[-1], len(seq) + 1, seq, sch, current, True, None)
    return added


_ONE_TO_THREE = {"A": "ALA", "B": "ASX", "C": "CYS", "D": "ASP", "E": "GLU", "F": "PHE", "G": "GLY", "H": "HIS",
                 "I": "ILE", "K": "LYS", "L": "LEU", "M": "MET", "N": "ASN", "O": "HOH", "P": "PRO", "Q": "GLN",
                 "R": "ARG", "S": "SER", "T": "THR", "V": "VAL", "W": "TRP", "Y": "TYR", "Z": "GLX"}


def parse_cif(text):
    """Atom records and helix/sheet ranges of an mmCIF file, read the way
    PyMOL reads them (author chain, residue number and atom names; the
    label chain becomes the segment ID)."""
    cats = parse_cif_categories(text, ("_atom_site", "_struct_conf", "_struct_sheet_range", "_entity_poly",
                                       "_entity_poly_seq", "_pdbx_poly_seq_scheme"))
    items, rows = cats.get("_atom_site", ([], []))
    col = {name: k for k, name in enumerate(items)}

    def getter(*names):
        idx = [col[nm] for nm in names if nm in col]

        def get(row):
            for k in idx:
                v = row[k]
                if v != "?" and v != ".":
                    return v
            return ""
        return get

    g_group, g_id = getter("group_PDB"), getter("id")
    g_name, g_alt = getter("auth_atom_id", "label_atom_id"), getter("label_alt_id")
    g_resn, g_chain = getter("auth_comp_id", "label_comp_id"), getter("auth_asym_id", "label_asym_id")
    g_segi, g_resv = getter("label_asym_id"), getter("auth_seq_id", "label_seq_id")
    g_ins, g_q, g_b = getter("pdbx_PDB_ins_code"), getter("occupancy"), getter("B_iso_or_equiv")
    g_elem, g_charge = getter("type_symbol"), getter("pdbx_formal_charge")
    g_model = getter("pdbx_PDB_model_num")
    g_label_seq, g_entity = getter("label_seq_id"), getter("label_entity_id")
    kx, ky, kz = col.get("Cartn_x"), col.get("Cartn_y"), col.get("Cartn_z")
    records = []
    models = {}
    if kx is None or ky is None or kz is None:
        rows = []
    for row in rows:
        try:
            xyz = (float(row[kx]), float(row[ky]), float(row[kz]))
        except ValueError:
            continue
        r = _Record()
        r.xyz = xyz
        r.hetatm = g_group(row).upper() == "HETATM"
        r.ID = _pdb_int(g_id(row))
        r.name = g_name(row)
        r.alt = g_alt(row)
        r.resn = g_resn(row)
        r.chain = g_chain(row)
        r.segi = g_segi(row)
        r.resv = _pdb_int(g_resv(row))
        r.ins = g_ins(row)
        r.q = _pdb_float(g_q(row), 1.0, 1.0)
        r.b = _pdb_float(g_b(row), 0.0, 0.0)
        elem = g_elem(row)
        r.elem = elem if elem.isalpha() else ""
        r.formal_charge = _pdb_int(g_charge(row))
        r.model = models.setdefault(g_model(row) or "1", len(models) + 1)
        r.label_seq = _pdb_int(g_label_seq(row))
        r.entity = g_entity(row)
        records.append(r)
    records += _missing_ca_records(cats, [r for r in records if r.model == 1])
    helices = [(_cif_value(h, "beg_auth_asym_id", "beg_label_asym_id"),
                _pdb_int(_cif_value(h, "beg_auth_seq_id", "beg_label_seq_id")),
                _cif_value(h, "pdbx_beg_PDB_ins_code"),
                _cif_value(h, "end_auth_asym_id", "end_label_asym_id"),
                _pdb_int(_cif_value(h, "end_auth_seq_id", "end_label_seq_id")),
                _cif_value(h, "pdbx_end_PDB_ins_code"))
               for h in _cif_rows(cats, "_struct_conf") if _cif_value(h, "conf_type_id").upper().startswith("HELX")]
    sheets = [(_cif_value(s, "beg_auth_asym_id", "beg_label_asym_id"),
               _pdb_int(_cif_value(s, "beg_auth_seq_id", "beg_label_seq_id")),
               _cif_value(s, "pdbx_beg_PDB_ins_code"),
               _cif_value(s, "end_auth_asym_id", "end_label_asym_id"),
               _pdb_int(_cif_value(s, "end_auth_seq_id", "end_label_seq_id")),
               _cif_value(s, "pdbx_end_PDB_ins_code"))
              for s in _cif_rows(cats, "_struct_sheet_range")]
    return records, {"helix": helices, "sheet": sheets}


# ------------------------------------------------------------
# Molecules
# ------------------------------------------------------------

_uid_counter = [0]


def _new_uids(n):
    start = _uid_counter[0]
    _uid_counter[0] += n
    return np.arange(start, start + n, dtype=np.int64)


class Molecule:
    """One molecular object: per-atom fields as arrays, coordinates per state."""

    kind = "object:molecule"

    def __init__(self, name):
        self.name = name
        self.enabled = True
        self.n = 0
        for f in _ATOM_FIELDS:
            setattr(self, f, np.array([], dtype=object))
        for f in _NUM_FIELDS:
            setattr(self, f, np.array([], dtype=np.float64 if f in ("q", "b", "partial_charge") else np.int64))
        self.uid = np.array([], dtype=np.int64)
        self.coords = np.zeros((1, 0, 3))
        self.source_path = None
        self._columns = {}

    # -- distinct values -------------------------------------------------
    def column(self, *fields):
        """(codes, values) for a field, or for several fields taken together:
        its distinct values in order of first appearance and, for each atom,
        the position of its own value among them.

        A structure has tens of thousands of atoms but only a few dozen atom
        names, residue names or chains, so a selection word is tested once
        per distinct value and the answer spread over the atoms by code. Kept
        until a field's array is replaced; _set_field, the one place that
        writes into an array, discards it."""
        arrays = tuple(self.field(f) for f in fields)
        kept = self._columns.get(fields)
        if kept is None or any(a is not b for a, b in zip(kept[0], arrays)):
            lists = [a.tolist() for a in arrays]
            index = {}
            codes = np.fromiter((index.setdefault(v, len(index)) for v in (lists[0] if len(lists) == 1 else zip(*lists))),
                                dtype=np.int64, count=len(lists[0]))
            kept = (arrays, codes, list(index))
            self._columns[fields] = kept
        return kept[1], kept[2]

    # -- construction --------------------------------------------------
    @classmethod
    def from_records(cls, name, records, ss_ranges=None, later_models_update=True):
        """A molecule from file records. Each model becomes a state. As in
        PyMOL, an atom present in any model is part of the molecule (with no
        coordinates in the states that lack it). For PDB files PyMOL lets each
        later model replace the B-factor and occupancy of the atoms it holds
        (later_models_update); for mmCIF the first model's values stay."""
        mol = cls(name)
        models = sorted({r.model for r in records})
        state_of = {m: k for k, m in enumerate(models)}
        # Every record of the first model is an atom. A later model's record
        # is the atom with the same identifiers (the k-th such record matching
        # the k-th such atom); one without a match adds an atom.
        atoms_by_key = {}
        base = []
        placed = []
        seen = {}
        for r in records:
            # Placeholders for unobserved residues (no coordinates) never
            # stand for an atom another model has.
            key = (r.segi, r.chain, r.resv, r.ins, r.resn, r.name, r.alt, r.xyz is None)
            occurrence = seen.get((r.model, key), 0)
            seen[(r.model, key)] = occurrence + 1
            same = atoms_by_key.setdefault(key, [])
            if occurrence < len(same):
                i = same[occurrence]
            else:
                i = len(base)
                same.append(i)
                base.append(r)
            placed.append((state_of[r.model], i, r))
        n = len(base)
        mol.n = n
        mol.segi = _strings(r.segi for r in base)
        mol.chain = _strings(r.chain for r in base)
        mol.resn = _strings(r.resn for r in base)
        mol.atom_name = _strings(r.name for r in base)
        mol.alt = _strings(r.alt for r in base)
        mol.resv = np.array([r.resv for r in base], dtype=np.int64)
        mol.resi = _strings(f"{r.resv}{r.ins}" for r in base)
        elems = [r.elem if r.elem else guess_element(r.name, r.resn) for r in base]
        mol.elem = _strings(elems)
        mol.q = np.zeros(n)
        mol.b = np.zeros(n)
        mol.hetatm = np.array([1 if r.hetatm else 0 for r in base], dtype=np.int64)
        mol.ID = np.array([r.ID for r in base], dtype=np.int64)
        mol.rank = np.arange(n, dtype=np.int64)
        mol.formal_charge = np.array([r.formal_charge for r in base], dtype=np.int64)
        mol.partial_charge = np.zeros(n)
        mol.priority = np.array([atom_priority(r.name, e) for r, e in zip(base, elems)], dtype=np.int64)
        mol.ss = _strings([""] * n)
        mol.text_type = _strings([""] * n)
        # Labels only come from PyMOL sessions (see astra3_pse).
        mol.label = _strings(getattr(r, "label", "") or "" for r in base)
        mol.flags = np.zeros(n, dtype=np.int64)
        mol.color = np.zeros(n, dtype=np.int64)
        mol.uid = _new_uids(n)
        coords = np.full((len(models), n, 3), np.nan)
        filled = np.zeros(n, dtype=bool)
        for state, i, r in placed:
            if r.xyz is not None:
                coords[state, i] = r.xyz
            if later_models_update or not filled[i]:
                mol.b[i] = r.b
                mol.q[i] = r.q
                filled[i] = True
        mol.coords = single(coords)
        mol._sort()
        mol.classify()
        mol.color = mol._initial_colors()
        if ss_ranges:
            mol.assign_ss_ranges(ss_ranges)
        return mol

    # Atom names are kept in .atom_name (.name is the object's name); they
    # appear as "name" in iterate and selections, as in PyMOL.
    def _sort(self):
        if self.n == 0:
            return
        resn_key = [str(x).lower() for x in self.resn]
        # Residues with equal number but different insertion codes keep the
        # order they came in (PyMOL's rank-assisted sort).
        first_rank = {}
        for i in range(self.n):
            first_rank.setdefault((self.segi[i], self.chain[i], int(self.resv[i]), self.resi[i]), i)
        keys = []
        for i in range(self.n):
            rk = first_rank[(self.segi[i], self.chain[i], int(self.resv[i]), self.resi[i])]
            bulk = (not self.resv[i]) and self.hetatm[i]
            within = (int(self.rank[i]),) if bulk else (
                int(self.priority[i]), _name_sort_key(str(self.atom_name[i])), str(self.alt[i]), int(self.rank[i]))
            keys.append((str(self.segi[i]), str(self.chain[i]), int(self.resv[i]), rk, resn_key[i], within))
        order = sorted(range(self.n), key=lambda i: keys[i])
        self.take(np.array(order, dtype=np.int64))

    def take(self, idx):
        idx = np.asarray(idx, dtype=np.int64)
        for f in _ATOM_FIELDS:
            setattr(self, f, getattr(self, f)[idx])
        for f in _NUM_FIELDS:
            setattr(self, f, getattr(self, f)[idx])
        self.uid = self.uid[idx]
        self.coords = self.coords[:, idx, :]
        self.n = len(idx)
        self._columns = {}

    def copy_subset(self, name, mask, states=None):
        mol = Molecule(name)
        idx = np.flatnonzero(mask)
        for f in _ATOM_FIELDS:
            setattr(mol, f, getattr(self, f)[idx].copy())
        for f in _NUM_FIELDS:
            setattr(mol, f, getattr(self, f)[idx].copy())
        mol.uid = _new_uids(len(idx))
        coords = self.coords[:, idx, :]
        if states is not None:
            coords = coords[[s for s in states if 0 <= s < len(coords)]]
            if len(coords) == 0:
                coords = self.coords[:1, idx, :]
        mol.coords = coords.copy()
        mol.n = len(idx)
        mol.source_path = self.source_path
        return mol

    def _initial_colors(self):
        colors = np.zeros(self.n, dtype=np.int64)
        for i, e in enumerate(self.elem):
            colors[i] = ELEMENT_COLORS.get(str(e).upper(), 24)
        return colors

    # -- residue classes ----------------------------------------------
    def residue_bounds(self):
        """[(start, stop)] of consecutive atoms forming one residue."""
        bounds = []
        start = 0
        for i in range(1, self.n + 1):
            if i == self.n or not self._same_residue(i, i - 1):
                bounds.append((start, i))
                start = i
        return bounds

    def _same_residue(self, i, j):
        return (self.resv[i] == self.resv[j] and self.chain[i] == self.chain[j] and
                self.hetatm[i] == self.hetatm[j] and self.resi[i] == self.resi[j] and
                self.segi[i] == self.segi[j] and str(self.resn[i]).upper() == str(self.resn[j]).upper())

    def classify(self):
        """PyMOL's per-residue classification into protein, nucleic acid,
        solvent, organic and inorganic (SelectorClassifyAtoms)."""
        self.flags = np.zeros(self.n, dtype=np.int64)
        if self.n == 0:
            return
        xyz = self.coords[0]
        names = [str(x) for x in self.atom_name]
        elems = [str(e).upper() for e in self.elem]
        bounds = self.residue_bounds()
        residue_of = np.empty(self.n, dtype=np.int64)
        for k, (start, stop) in enumerate(bounds):
            residue_of[start:stop] = k
        # Peptide and phosphodiester bonds, judged by distance as PyMOL's
        # distance-based connectivity would bond them. Only a bond to another
        # residue counts: folate's glutamate (FFO, FOL) has its own N, CA, C
        # and O joined by an amide inside the residue, and PyMOL leaves it
        # a ligand.
        idx_n = [i for i, nm in enumerate(names) if nm == "N" and elems[i] == "N"]
        idx_c = [i for i, nm in enumerate(names) if nm == "C" and elems[i] == "C"]
        idx_p = [i for i, nm in enumerate(names) if nm == "P" and elems[i] == "P"]
        idx_o3 = [i for i, nm in enumerate(names) if nm in ("O3'", "O3*") and elems[i] == "O"]

        def bonded(a_list, b_list, cutoff=1.9):
            found = set()
            if not a_list or not b_list:
                return found
            a = np.array(a_list)
            b = np.array(b_list)
            a = a[~np.isnan(xyz[a]).any(axis=1)]
            b = b[~np.isnan(xyz[b]).any(axis=1)]
            # Each atom is measured against the partners in its own and the
            # adjacent cells only; a partner within the cutoff is always there.
            cell = max(cutoff, 1.0)
            cells = _cells(xyz[b], cell)
            c2 = cutoff * cutoff
            for i, key in zip(a.tolist(), _cell_keys(xyz[a], cell)):
                rows = _in_adjacent_cells(cells, key)
                if not rows:
                    continue
                near = b[rows]
                d = xyz[near] - xyz[i]
                close = near[np.einsum("ij,ij->i", d, d) <= c2]
                if (residue_of[close] != residue_of[i]).any():
                    found.add(i)
            return found

        c_bonded_to_n = bonded(idx_c, idx_n)
        n_bonded_to_c = bonded(idx_n, idx_c)
        o3_bonded_to_p = bonded(idx_o3, idx_p)
        p_bonded_to_o3 = bonded(idx_p, idx_o3)
        for start, stop in bounds:
            resn = str(self.resn[start])
            het = bool(self.hetatm[start])
            guide = None
            # PyMOL compares the first three letters of protein and water
            # names (TIP3 is water), nucleic acid names in full.
            if not het and resn[:3] in PROTEIN_RESN:
                mask = F_POLYMER | F_PROTEIN
            elif (not het or resn in PNA_RESN) and resn in NUCLEIC_RESN:
                mask = F_POLYMER | F_NUCLEIC
            elif resn[:3] in WATER_RESN:
                mask = F_SOLVENT
            else:
                found = set()
                only_h = True
                carbon = False
                for i in range(start, stop):
                    e, nm = elems[i], names[i]
                    if e != "H" and e != "D":
                        only_h = False
                    if e == "C":
                        carbon = True
                        if nm == "C":
                            found.add("C")
                            if i in c_bonded_to_n:
                                found.add("cn")
                        elif nm == "CA":
                            found.add("CA")
                            guide = i
                        elif nm in ("C3'", "C3*"):
                            found.add("C3")
                            guide = i
                        elif nm in ("C4'", "C4*"):
                            found.add("C4")
                        elif nm in ("C5'", "C5*"):
                            found.add("C5")
                    elif e == "N" and nm == "N":
                        found.add("N")
                        if i in n_bonded_to_c:
                            found.add("nc")
                    elif e == "O":
                        if nm == "O":
                            found.add("O")
                        elif nm.startswith("OH2"):
                            found.add("OH2")
                        elif nm in ("O3'", "O3*"):
                            found.add("O3")
                            if i in o3_bonded_to_p:
                                found.add("o3p")
                        elif nm in ("O5'", "O5*"):
                            found.add("O5")
                    elif e == "P" and nm == "P" and i in p_bonded_to_o3:
                        found.add("po3")
                if {"CA", "N", "C", "O"} <= found and ({"cn", "nc"} & found):
                    mask = F_POLYMER | F_PROTEIN
                elif {"O3", "C3", "C4", "C5", "O5"} <= found and ({"o3p", "po3"} & found):
                    mask = F_POLYMER | F_NUCLEIC
                elif carbon:
                    mask = F_ORGANIC
                elif ("O" in found or "OH2" in found) and stop - start == 1:
                    mask = F_SOLVENT
                elif not only_h:
                    mask = F_INORGANIC
                else:
                    mask = 0
            self.flags[start:stop] = mask
            if mask & F_POLYMER and guide is None:
                for i in range(start, stop):
                    if elems[i] == "C" and (names[i] == "CA" or names[i] in ("C4'", "C4*")):
                        guide = i
                        break
                if guide is None and mask & F_NUCLEIC:
                    for i in range(start, stop):
                        if elems[i] == "C" and names[i] in ("C3'", "C3*"):
                            guide = i
                            break
            if guide is not None:
                self.flags[guide] |= F_GUIDE

    def assign_ss_ranges(self, ranges):
        """Helix/sheet records -> ss 'H'/'S'; other polymer residues 'L'."""
        is_polymer = (self.flags & F_PROTEIN) != 0
        ss = np.array(["L" if p else "" for p in is_polymer], dtype=object)
        chain_codes, chains = self.column("chain")
        residue_codes, residues = self.column("resv", "resi")
        # (number, insertion code) of each distinct residue identifier.
        positions = [(int(v), str(resi)[len(str(int(v))):]) for v, resi in residues]
        for code, key in (("H", "helix"), ("S", "sheet")):
            for c1, r1, i1, c2, r2, i2 in ranges.get(key, []):
                in_chain = np.array([c == c1 for c in chains], dtype=bool)
                in_range = np.array([(r1, i1) <= p <= (r2, i2) for p in positions], dtype=bool)
                ss[is_polymer & in_chain[chain_codes] & in_range[residue_codes]] = code
        self.ss = ss

    # -- iteration helpers ---------------------------------------------
    def field(self, f):
        return self.atom_name if f == "name" else getattr(self, f)


class CGOObject:
    kind = "object:cgo"

    def __init__(self, name, data):
        self.name = name
        self.data = list(data)
        self.enabled = True
        self.n = 0


# ------------------------------------------------------------
# The session store
# ------------------------------------------------------------

class Store:
    def __init__(self):
        self.reset()

    def reset(self):
        self.names = {}          # lower name -> object or Selection, in creation order
        self.settings = dict(_DEFAULT_SETTINGS)
        # A PDB mirror, like PyMOL's fetch_host setting.
        if os.environ.get("ASTRA3_FETCH_HOST"):
            self.settings["fetch_host"] = os.environ["ASTRA3_FETCH_HOST"]
        self.bg = (0.0, 0.0, 0.0)
        self.view = None
        self.frame_radius = None   # set by zoom: the radius the camera frames
        self.ray_size = None
        self.next_color = 0

    def molecules(self):
        return [o for o in self.names.values() if isinstance(o, Molecule)]

    def objects(self):
        return [o for o in self.names.values() if isinstance(o, (Molecule, CGOObject))]

    def get(self, name):
        return self.names.get(str(name).lower())

    def add(self, obj):
        """Add, or replace in place: an existing name keeps its position."""
        self.names[obj.name.lower()] = obj

    def rename(self, obj, new_name):
        """Rename keeping the object's position in the creation order."""
        old_key = obj.name.lower()
        obj.name = new_name
        self.names = {(new_name.lower() if k == old_key else k): v
                      for k, v in self.names.items() if not (k == new_name.lower() and v is not obj)}

    def remove_name(self, name):
        self.names.pop(str(name).lower(), None)


class Selection:
    kind = "selection"

    def __init__(self, name, members):
        self.name = name
        self.members = members      # {id(molecule): set(uid)}
        self.enabled = True


_DEFAULT_SETTINGS = {
    "slab": "50.00000", "antialias": "1", "ray_trace_mode": "0", "ray_opaque_background": "1",
    "opaque_background": "1", "fetch_path": ".", "fetch_host": "rcsb", "field_of_view": "20.00000",
    "orthoscopic": "off", "cartoon_transparency": "0.00000",
}

STORE = Store()


# ------------------------------------------------------------
# Selection language
# ------------------------------------------------------------

_SEL1 = {
    "name": "name", "n.": "name", "n;": "name",
    "resn": "resn", "resname": "resn", "r.": "resn", "r;": "resn",
    "resi": "resi", "residue": "resi", "resident": "resi", "resid": "resi", "i.": "resi", "i;": "resi",
    "chain": "chain", "c.": "chain", "c;": "chain",
    "segi": "segi", "segid": "segi", "segment": "segi", "s.": "segi", "s;": "segi",
    "alt": "alt", "altloc": "alt",
    "elem": "elem", "element": "elem", "symbol": "elem", "e.": "elem", "e;": "elem",
    "index": "index", "idx.": "index", "id": "ID", "rank": "rank",
    "ss": "ss", "model": "model", "object": "model", "m.": "model", "m;": "model", "o.": "model",
    "state": "state", "color": "color", "text_type": "text_type", "tt.": "text_type", "tt;": "text_type",
}
_SEL2 = {"b": "b", "q": "q", "x": "x", "y": "y", "z": "z", "formal_charge": "formal_charge",
         "fc.": "formal_charge", "partial_charge": "partial_charge", "pc.": "partial_charge"}
_SEL0 = {
    "all": "all", "*": "all", "none": "none", "enabled": "enabled", "visible": "enabled", "v.": "enabled",
    "present": "present", "pr.": "present", "hydro": "hydro", "hydrogens": "hydro", "h.": "hydro",
    "h;": "hydro", "hetatm": "hetatm", "het": "hetatm", "polymer": "polymer", "pol.": "polymer",
    "polymer.protein": "protein", "protein": "protein", "pro.": "protein",
    "polymer.nucleic": "nucleic", "nucleic": "nucleic", "nuc.": "nucleic",
    "organic": "organic", "org.": "organic", "inorganic": "inorganic", "ino.": "inorganic",
    "solvent": "solvent", "sol.": "solvent", "guide": "guide", "metals": "metals",
    "backbone": "backbone", "bb.": "backbone", "sidechain": "sidechain", "sc.": "sidechain",
}
_PREFIX = {"not": ("not", 0x70), "!": ("not", 0x70),
           "byres": ("byres", 0x20), "byresi": ("byres", 0x20), "byresidue": ("byres", 0x20),
           "br.": ("byres", 0x20), "br;": ("byres", 0x20), "b;": ("byres", 0x20),
           "bychain": ("bychain", 0x20), "bc.": ("bychain", 0x20),
           "byobject": ("byobject", 0x20), "byobj": ("byobject", 0x20), "bo.": ("byobject", 0x20),
           "bo;": ("byobject", 0x20),
           "bysegment": ("byseg", 0x20), "byseg": ("byseg", 0x20), "bysegi": ("byseg", 0x20),
           "bs.": ("byseg", 0x20),
           "bymolecule": ("bymol", 0x20), "bymol": ("bymol", 0x20), "bm.": ("bymol", 0x20),
           "first": ("first", 0x30), "last": ("last", 0x30)}
_INFIX = {"and": ("and", 0x60), "&": ("and", 0x60), "or": ("or", 0x40), "|": ("or", 0x40),
          "+": ("or", 0x40), "-": ("andnot", 0x60), "in": ("in", 0x40), "like": ("like", 0x40),
          "within": ("within", 0x30), "w.": ("within", 0x30), "beyond": ("beyond", 0x30),
          "be.": ("beyond", 0x30), "near_to": ("near_to", 0x30), "nto.": ("near_to", 0x30)}
_POSTFIX = {"around": ("around", 0x30), "a.": ("around", 0x30), "expand": ("expand", 0x30),
            "x.": ("expand", 0x30)}


def _tokenize(text):
    tokens = []
    i, n = 0, len(text)
    while i < n:
        ch = text[i]
        if ch.isspace():
            i += 1
            continue
        if ch in "()":
            tokens.append(ch)
            i += 1
            continue
        if ch in "'\"":
            j = text.find(ch, i + 1)
            if j < 0:
                raise CmdException(f"Selector-Error: unterminated quote in '{text}'")
            tokens.append(("quoted", text[i + 1:j]))
            i = j + 1
            continue
        j = i
        while j < n and not text[j].isspace() and text[j] not in "()":
            j += 1
        word = text[i:j]
        if word.startswith("!") and len(word) > 1:
            tokens.append("!")
            word = word[1:]
        tokens.append(word)
        i = j
    return tokens


class _Parser:
    def __init__(self, text):
        self.text = text
        self.tokens = _tokenize(text)
        self.pos = 0

    def error(self, what):
        raise CmdException(f"Selector-Error: {what} in '{self.text}'")

    def peek(self):
        return self.tokens[self.pos] if self.pos < len(self.tokens) else None

    def next(self):
        tok = self.peek()
        if tok is None:
            self.error("unexpected end")
        self.pos += 1
        return tok

    def word(self):
        tok = self.next()
        return tok[1] if isinstance(tok, tuple) else tok

    def parse(self):
        node = self.expr(0)
        if self.peek() is not None:
            self.error(f"unexpected '{self.peek()}'")
        return node

    def expr(self, rbp):
        left = self.nud()
        while True:
            tok = self.peek()
            if tok is None or tok == ")" or isinstance(tok, tuple):
                break
            low = tok.lower()
            if low in _INFIX:
                op, bp = _INFIX[low]
                if bp <= rbp:
                    break
                self.next()
                if op in ("within", "beyond", "near_to"):
                    dist = self._number()
                    of = self.word().lower()
                    if of != "of":
                        self.error(f"expected 'of' after {op}")
                    right = self.expr(bp)
                    left = (op, left, right, dist)
                else:
                    right = self.expr(bp)
                    left = (op, left, right)
            elif low in _POSTFIX:
                op, bp = _POSTFIX[low]
                if bp <= rbp:
                    break
                self.next()
                left = (op, left, self._number())
            else:
                # Two operands in a row: PyMOL reads that as an error.
                self.error(f"unexpected '{tok}'")
        return left

    def _number(self):
        w = self.word()
        try:
            return float(w)
        except ValueError:
            self.error(f"expected a number, got '{w}'")

    def nud(self):
        tok = self.next()
        if tok == "(":
            node = self.expr(0)
            if self.next() != ")":
                self.error("missing )")
            return node
        if isinstance(tok, tuple):
            return ("name", tok[1])
        low = tok.lower()
        if low in _PREFIX:
            op, bp = _PREFIX[low]
            return (op, self.expr(bp))
        if low in _SEL0:
            return ("class", _SEL0[low])
        if low in _SEL1:
            return ("prop", _SEL1[low], self.word())
        if low in _SEL2:
            opr = self.word()
            m = re.fullmatch(r"(<=|>=|!=|<|>|=)(.*)", opr)
            if m and m.group(2):
                return ("cmp", _SEL2[low], m.group(1), float(m.group(2)))
            if opr not in ("<", ">", "=", "<=", ">=", "!="):
                self.error(f"expected a comparison after {low}")
            return ("cmp", _SEL2[low], opr, self._number())
        if tok.startswith("%"):
            return ("name", tok[1:])
        if tok.startswith("?"):
            return ("optname", tok[1:])
        if "/" in tok:
            return ("macro", tok)
        return ("name", tok)


def _list_values(text):
    return [] if text == "" else text.split("+")


def _word_test(pattern):
    """The test one selection word applies to a value: equality, or a match
    with PyMOL's wildcards (* for any run of characters, % for one)."""
    if "*" in pattern or "%" in pattern:
        regex = re.compile("^" + re.escape(pattern).replace(r"\*", ".*").replace("%", ".") + "$")
        return lambda text: regex.match(text) is not None
    return lambda text: text == pattern


def _match_words(mol, field, patterns, ignore_case=True):
    """Atoms of mol whose field matches any of the patterns."""
    codes, values = mol.column(field)
    texts = [str(v).lower() if ignore_case else str(v) for v in values]
    hit = np.zeros(len(values), dtype=bool)
    for pattern in patterns:
        matches = _word_test(pattern.lower() if ignore_case else pattern)
        for k, text in enumerate(texts):
            if matches(text):
                hit[k] = True
    return hit[codes]


def _values_in(mol, field, wanted):
    """Atoms of mol whose field, in upper case, is one of wanted."""
    codes, values = mol.column(field)
    return np.array([str(v).upper() in wanted for v in values], dtype=bool)[codes]


def _resi_number(text):
    m = re.fullmatch(r"(-?\d+)([A-Za-z]?)", text)
    if not m:
        return None
    return int(m.group(1)), m.group(2).upper()


def _match_resi(mol, spec):
    # A residue is identified by its number together with the text it was
    # written as, so each distinct pair is tested once.
    codes, residues = mol.column("resv", "resi")
    written = [str(resi).upper() for _resv, resi in residues]
    hit = np.zeros(len(residues), dtype=bool)
    for tok in _list_values(spec):
        t = tok.replace("\\-", "~")
        m = re.fullmatch(r"(~?\d+[A-Za-z]?)[-:](~?\d+[A-Za-z]?)", t)
        if m:
            lo = _resi_number(m.group(1).replace("~", "-"))
            hi = _resi_number(m.group(2).replace("~", "-"))
            if lo is None or hi is None:
                continue
            top = (hi[0], hi[1] or "~")
            for k, (resv, resi) in enumerate(residues):
                v = int(resv)
                if lo <= (v, str(resi)[len(str(v)):].upper()) <= top:
                    hit[k] = True
            continue
        exact = t.replace("~", "-").upper()
        wildcard = _word_test(exact) if "*" in exact else None
        for k, text in enumerate(written):
            if wildcard(text) if wildcard else text == exact:
                hit[k] = True
    return hit[codes]


def _match_ints(values, spec):
    out = np.zeros(len(values), dtype=bool)
    for tok in _list_values(spec):
        m = re.fullmatch(r"(-?\d+)[-:](-?\d+)", tok)
        if m:
            out |= (values >= int(m.group(1))) & (values <= int(m.group(2)))
        else:
            try:
                out |= values == int(tok)
            except ValueError:
                raise CmdException(f"Selector-Error: '{tok}' is not a number")
    return out


def _resolve_name(name, optional=False):
    if name.lower() == "sele" and STORE.get("sele") is None:
        return {}
    obj = STORE.get(name)
    if obj is None and ("*" in name or "?" in name):
        hits = [o for o in STORE.names.values() if fnmatch.fnmatch(o.name.lower(), name.lower())]
        result = {}
        for o in hits:
            for k, v in _resolve_object(o).items():
                result[k] = result.get(k, False) | v
        return result
    if obj is None:
        if optional:
            return {}
        raise CmdException(f"Selector-Error: Invalid selection name \"{name}\".")
    return _resolve_object(obj)


def _resolve_object(obj):
    if isinstance(obj, CGOObject):
        # As in PyMOL, a drawing object holds no atoms and is not a selection.
        raise CmdException(f"Selector-Error: Invalid selection name \"{obj.name}\".")
    if isinstance(obj, Molecule):
        return {id(obj): np.ones(obj.n, dtype=bool)}
    if isinstance(obj, Selection):
        out = {}
        for mol in STORE.molecules():
            members = obj.members.get(id(mol))
            if members:
                out[id(mol)] = np.isin(mol.uid, np.fromiter(members, dtype=np.int64))
        return out
    return {}


def _empty_masks():
    return {id(m): np.zeros(m.n, dtype=bool) for m in STORE.molecules()}


def _full(masks):
    out = _empty_masks()
    for k, v in masks.items():
        if k in out:
            out[k] = v.copy()
    return out


def _residue_groups(mol, level):
    """Group id per atom for byres / bychain / byseg / byobject."""
    if level == "byobject" or mol.n == 0:
        return np.zeros(mol.n, dtype=np.int64)
    segi, chain = mol.column("segi")[0], mol.column("chain")[0]
    if level == "byres":
        resn_codes, resn_values = mol.column("resn")
        upper = {}
        resn = np.array([upper.setdefault(str(v).upper(), len(upper)) for v in resn_values], dtype=np.int64)[resn_codes]
        hetatm = np.unique(mol.hetatm, return_inverse=True)[1]
        return _same_in_all([segi, chain, mol.column("resv", "resi")[0], hetatm, resn])
    if level == "bychain":
        return _same_in_all([segi, chain])
    return segi if level == "byseg" else chain


def _same_in_all(columns):
    """An integer per atom that two atoms share exactly when their codes
    agree in every column."""
    combined = columns[0]
    for codes in columns[1:]:
        # Renumbered from zero at each step, so the product stays far inside
        # 64 bits. unique() numbers with the platform's index type, which is
        # 32 bits under WebAssembly.
        renumbered = np.unique(combined, return_inverse=True)[1].astype(np.int64)
        combined = renumbered * (int(codes.max()) + 1) + codes
    return combined


def _neighbors(a_xyz, b_xyz, cutoff):
    """Boolean mask over a: within cutoff of any b. Atoms without
    coordinates (NaN) are never near anything."""
    hit = np.zeros(len(a_xyz), dtype=bool)
    b_xyz = b_xyz[~np.isnan(b_xyz).any(axis=1)] if len(b_xyz) else b_xyz
    if len(a_xyz) == 0 or len(b_xyz) == 0:
        return hit
    lo = b_xyz.min(axis=0) - cutoff
    hi = b_xyz.max(axis=0) + cutoff
    with np.errstate(invalid="ignore"):
        cand = np.flatnonzero(((a_xyz >= lo) & (a_xyz <= hi)).all(axis=1))
    if cand.size == 0:
        return hit
    c2 = cutoff * cutoff
    # Grid hash on b so each candidate checks only nearby cells.
    cell = max(cutoff, 1.0)
    cells = _cells(b_xyz, cell)
    for ci, key in zip(cand, _cell_keys(a_xyz[cand], cell)):
        near = _in_adjacent_cells(cells, key)
        if near:
            d = b_xyz[near] - a_xyz[ci]
            if (np.einsum("ij,ij->i", d, d) <= c2).any():
                hit[ci] = True
    return hit


def _cell_keys(xyz, cell):
    """The cube of side `cell` each point lies in, as (i, j, k)."""
    return map(tuple, np.floor(xyz / cell).astype(np.int64).tolist())


def _cells(xyz, cell):
    """{cube: [row, ...]} for the points of xyz."""
    cells = {}
    for row, key in enumerate(_cell_keys(xyz, cell)):
        cells.setdefault(key, []).append(row)
    return cells


def _in_adjacent_cells(cells, key):
    """Rows of the points in a cube and the 26 around it."""
    kx, ky, kz = key
    rows = []
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                rows.extend(cells.get((kx + dx, ky + dy, kz + dz), ()))
    return rows


def _all_xyz(masks, state=0):
    parts = []
    for mol in STORE.molecules():
        m = masks.get(id(mol))
        if m is None or not m.any():
            continue
        st = min(state, len(mol.coords) - 1)
        xyz = mol.coords[st][m]
        parts.append(xyz[~np.isnan(xyz).any(axis=1)])
    return np.concatenate(parts) if parts else np.zeros((0, 3))


# Selections joined by and, or and - parse into a tree nested down its left
# side, one level per operator: N- and C-terminus windows over every chain of
# a large entry are thousands of terms. Such a chain is combined in a loop
# rather than by recursion, which Python stops at its recursion limit, and
# a test repeated in it (chain A, resi 5) is made once (see _LeafTests).
_BOOLEAN_OPS = ("and", "or", "andnot")
_LEAF_OPS = ("prop", "class", "cmp")


def _leaves(node):
    """The leaf tests of a parsed selection, one per occurrence."""
    pending = [node]
    while pending:
        node = pending.pop()
        if node[0] in _LEAF_OPS:
            yield node
        else:
            pending.extend(part for part in node[1:] if isinstance(part, tuple))


class _LeafTests:
    """The leaf results of one selection while it is evaluated. A test that
    occurs more than once is made once and kept only until its last
    occurrence, so a long selection holds few masks at a time."""

    def __init__(self, root):
        self.uses = collections.Counter(_leaves(root))
        self.kept = {}

    def masks(self, node, mols):
        self.uses[node] -= 1
        found = self.kept.get(node)
        if found is None:
            found = _evaluate_leaf(node, mols)
            if self.uses[node] > 0:
                self.kept[node] = found
        elif self.uses[node] <= 0:
            del self.kept[node]
        return found


def evaluate(node, tests=None):
    """{id(molecule): bool mask} for a parsed selection. tests carries the
    leaf results of the whole selection while its parts are evaluated."""
    op = node[0]
    mols = STORE.molecules()
    if tests is None:
        tests = _LeafTests(node)
    if op in _LEAF_OPS:
        return tests.masks(node, mols)
    if op in _BOOLEAN_OPS:
        return _evaluate_boolean_chain(node, mols, tests)
    if op == "name":
        return _full(_resolve_name(node[1]))
    if op == "optname":
        return _full(_resolve_name(node[1], optional=True))
    if op == "macro":
        return _evaluate_macro(node[1])
    if op == "not":
        inner = evaluate(node[1], tests)
        return {id(m): ~inner.get(id(m), np.zeros(m.n, dtype=bool)) for m in mols}
    if op in ("in", "like"):
        a = evaluate(node[1], tests)
        b = evaluate(node[2], tests)
        keys = set()
        for m in mols:
            mb = b.get(id(m))
            if mb is not None:
                for i in np.flatnonzero(mb):
                    keys.add(_atom_identity(m, i, op == "in"))
        out = {}
        for m in mols:
            ma = a.get(id(m), np.zeros(m.n, dtype=bool))
            out[id(m)] = ma & np.array([_atom_identity(m, i, op == "in") in keys for i in range(m.n)], dtype=bool)
        return out
    if op in ("byres", "bychain", "byobject", "byseg", "bymol"):
        inner = evaluate(node[1], tests)
        out = {}
        level = "bychain" if op == "bymol" else op
        for m in mols:
            mi = inner.get(id(m), np.zeros(m.n, dtype=bool))
            if not mi.any():
                out[id(m)] = mi
                continue
            gid = _residue_groups(m, level)
            out[id(m)] = np.isin(gid, np.unique(gid[mi]))
        return out
    if op in ("first", "last"):
        inner = evaluate(node[1], tests)
        out = _empty_masks()
        ordered = mols if op == "first" else list(reversed(mols))
        for m in ordered:
            mi = inner.get(id(m))
            if mi is not None and mi.any():
                idx = np.flatnonzero(mi)
                out[id(m)][idx[0] if op == "first" else idx[-1]] = True
                break
        return out
    if op in ("within", "beyond", "near_to", "around", "expand"):
        if op in ("around", "expand"):
            a = {id(m): np.ones(m.n, dtype=bool) for m in mols}
            b = evaluate(node[1], tests)
            dist = node[2]
        else:
            a = evaluate(node[1], tests)
            b = evaluate(node[2], tests)
            dist = node[3]
        target = _all_xyz(b)
        out = {}
        for m in mols:
            ma = a.get(id(m), np.zeros(m.n, dtype=bool))
            near = np.zeros(m.n, dtype=bool)
            if ma.any() and len(target):
                idx = np.flatnonzero(ma)
                near[idx] = _neighbors(m.coords[0][idx], target, dist)
            mb = b.get(id(m), np.zeros(m.n, dtype=bool))
            if op == "within":
                out[id(m)] = near
            elif op == "beyond":
                out[id(m)] = ma & ~near
            elif op == "near_to":
                out[id(m)] = near & ~mb
            elif op == "around":
                out[id(m)] = near & ~mb
            else:
                out[id(m)] = near | mb
        return out
    raise CmdException(f"Selector-Error: unsupported operator '{op}'")


def _evaluate_boolean_chain(node, mols, tests):
    """and, or and andnot nodes nested down the left side, combined in the
    order they were written: the innermost left operand first, then each
    right operand outwards."""
    rights = []
    while node[0] in _BOOLEAN_OPS:
        rights.append((node[0], node[2]))
        node = node[1]
    acc = evaluate(node, tests)
    for op, right in reversed(rights):
        b = evaluate(right, tests)
        out = {}
        for m in mols:
            x = acc.get(id(m), np.zeros(m.n, dtype=bool))
            y = b.get(id(m), np.zeros(m.n, dtype=bool))
            out[id(m)] = x & y if op == "and" else (x | y if op == "or" else x & ~y)
        acc = out
    return acc


def _evaluate_leaf(node, mols):
    """Masks for a class word (polymer, hydro), a property test (chain A,
    resi 5) or a comparison (b > 30)."""
    op = node[0]
    out = {}
    if op == "class":
        cls = node[1]
        for mol in mols:
            if cls == "all":
                m = np.ones(mol.n, dtype=bool)
            elif cls == "none":
                m = np.zeros(mol.n, dtype=bool)
            elif cls == "enabled":
                m = np.full(mol.n, bool(mol.enabled))
            elif cls == "present":
                m = np.ones(mol.n, dtype=bool)
            elif cls == "hydro":
                m = _values_in(mol, "elem", ("H", "D"))
            elif cls == "hetatm":
                m = mol.hetatm.astype(bool)
            elif cls == "metals":
                m = _values_in(mol, "elem", METALS)
            elif cls in ("backbone", "sidechain"):
                bb = _values_in(mol, "name", BACKBONE_NAMES)
                poly = (mol.flags & F_POLYMER) != 0
                m = poly & bb if cls == "backbone" else poly & ~bb
            else:
                bit = {"polymer": F_POLYMER, "protein": F_PROTEIN, "nucleic": F_NUCLEIC,
                       "solvent": F_SOLVENT, "organic": F_ORGANIC, "inorganic": F_INORGANIC,
                       "guide": F_GUIDE}[cls]
                m = (mol.flags & bit) != 0
            out[id(mol)] = m
        return out
    if op == "prop":
        field, spec = node[1], node[2]
        for mol in mols:
            if field in ("name", "resn", "segi", "alt", "elem", "text_type"):
                m = _match_words(mol, field, _list_values(spec) or [""])
            elif field == "chain":
                m = _match_words(mol, "chain", _list_values(spec) or [""], ignore_case=False)
            elif field == "resi":
                m = _match_resi(mol, spec)
            elif field == "index":
                m = _match_ints(np.arange(1, mol.n + 1), spec)
            elif field in ("ID", "rank", "color"):
                m = _match_ints(getattr(mol, field), spec)
            elif field == "ss":
                codes = set()
                for part in _list_values(spec):
                    codes.update(part.upper() if part else [""])
                m = _values_in(mol, "ss", codes)
            elif field == "model":
                pats = [p.lower() for p in _list_values(spec)]
                m = np.full(mol.n, any(fnmatch.fnmatch(mol.name.lower(), p) for p in pats))
            elif field == "state":
                m = np.full(mol.n, 1 <= int(float(spec)) <= len(mol.coords))
            else:
                raise CmdException(f"Selector-Error: unsupported property '{field}'")
            out[id(mol)] = m
        return out
    field, opr, value = node[1], node[2], node[3]
    for mol in mols:
        if field in ("x", "y", "z"):
            vals = mol.coords[0][:, "xyz".index(field)]
        else:
            vals = getattr(mol, field).astype(np.float64)
        out[id(mol)] = {"<": vals < value, ">": vals > value, "=": np.isclose(vals, value, atol=1e-3),
                        "<=": vals <= value, ">=": vals >= value, "!=": ~np.isclose(vals, value, atol=1e-3)}[opr]
    return out


def _atom_identity(mol, i, with_name):
    key = (mol.segi[i], mol.chain[i], mol.resi[i], str(mol.resn[i]).upper())
    return key + (str(mol.atom_name[i]).upper(), mol.alt[i]) if with_name else key


def _evaluate_macro(text):
    """/object/segi/chain/resn`resi/name macros."""
    parts = text.split("/")
    if text.startswith("/"):
        parts = parts[1:]
        fields = ["model", "segi", "chain", "resi", "name"]
    else:
        fields = ["model", "segi", "chain", "resi", "name"][-len(parts):] if len(parts) < 5 else \
            ["model", "segi", "chain", "resi", "name"]
    node = ("class", "all")
    for field, value in zip(fields, parts):
        if value == "":
            continue
        if field == "resi" and "`" in value:
            resn, resi = value.split("`", 1)
            node = ("and", node, ("prop", "resn", resn))
            value = resi
            if not value:
                continue
        if field == "model":
            node = ("and", node, ("name", value))
        else:
            node = ("and", node, ("prop", field, value))
    return evaluate(node)


def select_masks(selection):
    text = str(selection or "").strip()
    if not text:
        return _empty_masks()
    return evaluate(_Parser(text).parse())


def _selected(selection):
    """[(molecule, index array)] in object order."""
    masks = select_masks(selection)
    out = []
    for mol in STORE.molecules():
        m = masks.get(id(mol))
        if m is not None and m.any():
            out.append((mol, np.flatnonzero(m)))
    return out


# ------------------------------------------------------------
# iterate / alter
# ------------------------------------------------------------

_ALTERABLE = ("name", "resn", "resi", "chain", "segi", "alt", "elem", "q", "b", "ss", "text_type", "label",
              "formal_charge", "partial_charge", "ID", "color", "type")

def _texts(array, idx):
    return [str(v) for v in array[idx].tolist()]


# What an iterate or alter expression can read about an atom, under the name
# PyMOL gives it: name -> function(molecule, atom indices, state index) giving
# the values for those atoms as plain Python objects. x, y and z exist only
# when a state is given (iterate_state, alter_state).
_ATOM_VALUES = {
    "model": lambda mol, idx, st: [mol.name] * len(idx),
    "index": lambda mol, idx, st: (idx + 1).tolist(),
    "ID": lambda mol, idx, st: mol.ID[idx].tolist(),
    "rank": lambda mol, idx, st: mol.rank[idx].tolist(),
    "name": lambda mol, idx, st: _texts(mol.atom_name, idx),
    "resn": lambda mol, idx, st: _texts(mol.resn, idx),
    "resi": lambda mol, idx, st: _texts(mol.resi, idx),
    "resv": lambda mol, idx, st: mol.resv[idx].tolist(),
    "chain": lambda mol, idx, st: _texts(mol.chain, idx),
    "segi": lambda mol, idx, st: _texts(mol.segi, idx),
    "alt": lambda mol, idx, st: _texts(mol.alt, idx),
    "elem": lambda mol, idx, st: _texts(mol.elem, idx),
    "q": lambda mol, idx, st: mol.q[idx].tolist(),
    "b": lambda mol, idx, st: mol.b[idx].tolist(),
    "ss": lambda mol, idx, st: _texts(mol.ss, idx),
    "color": lambda mol, idx, st: mol.color[idx].tolist(),
    "type": lambda mol, idx, st: ["HETATM" if h else "ATOM" for h in mol.hetatm[idx].tolist()],
    "formal_charge": lambda mol, idx, st: mol.formal_charge[idx].tolist(),
    "partial_charge": lambda mol, idx, st: mol.partial_charge[idx].tolist(),
    "text_type": lambda mol, idx, st: _texts(mol.text_type, idx),
    "label": lambda mol, idx, st: _texts(mol.label, idx),
    "flags": lambda mol, idx, st: mol.flags[idx].tolist(),
    "state": lambda mol, idx, st: [1 if st is None else st + 1] * len(idx),
    "protons": lambda mol, idx, st: [0] * len(idx),
    "vdw": lambda mol, idx, st: [0.0] * len(idx),
    "x": lambda mol, idx, st: mol.coords[st][idx, 0].tolist(),
    "y": lambda mol, idx, st: mol.coords[st][idx, 1].tolist(),
    "z": lambda mol, idx, st: mol.coords[st][idx, 2].tolist(),
}
_COORDINATES = ("x", "y", "z")
# Through these an expression could reach a value without naming it.
_INDIRECT_LOOKUPS = {"locals", "vars", "globals", "dir", "eval", "exec"}

def _names_in(code):
    names = set(code.co_names)
    for const in code.co_consts:
        if hasattr(const, "co_names"):
            names |= _names_in(const)
    return names


# Astra3 runs a few dozen distinct expressions, most of them thousands of
# times; the limit only keeps expressions built from data (chain='B') from
# accumulating over a long batch.
@functools.lru_cache(maxsize=256)
def _compile(expression):
    """(code, names, value): the compiled expression, the atom values it
    reads or sets, and whether it is a plain value (see _row_function). Only
    the values named are prepared for each atom, which is most of the cost
    of iterating over a large structure."""
    code = compile(expression, "<iterate>", "exec")
    used = _names_in(code)
    indirect = bool(used & _INDIRECT_LOOKUPS)
    if indirect:
        used = set(_ATOM_VALUES)
    return code, tuple(name for name in _ATOM_VALUES if name in used), not indirect and _is_plain_value(expression)


# Inside these a name is looked up differently in a function than in the
# statement exec() runs for each atom (or, for :=, is assigned).
_OWN_SCOPE = (ast.Lambda, ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp, ast.NamedExpr)


def _is_plain_value(expression):
    """Whether an iterate expression is one value to compute (a call such as
    rows.append((chain, resi)), say) with nothing inside it that has a scope
    of its own."""
    try:
        tree = ast.parse(expression, mode="eval")
    except SyntaxError:
        return False
    return not any(isinstance(node, _OWN_SCOPE) for node in ast.walk(tree))


@functools.lru_cache(maxsize=256)
def _row_code(expression, read):
    parameters = ast.arguments(posonlyargs=[], args=[ast.arg(arg=name) for name in read], vararg=None,
                               kwonlyargs=[], kw_defaults=[], kwarg=None, defaults=[])
    tree = ast.Expression(body=ast.Lambda(args=parameters, body=ast.parse(expression, mode="eval").body))
    return compile(ast.fix_missing_locations(tree), "<iterate>", "eval")


def _row_function(expression, read, space):
    """A function of the atom values in `read` computing a plain-value
    expression, with the caller's namespace for every other name: the same
    lookups exec() makes with one atom's values as its local names, without
    building that namespace and entering exec() for every atom."""
    return eval(_row_code(expression, tuple(read)), space)


def _run_expression(selection, expression, space, state=None, alter=False):
    if space is None:
        space = _GLOBAL_SPACE
    code, names, plain_value = _compile(expression)
    had_builtins = "__builtins__" in space
    try:
        return _run_code(selection, expression if plain_value and not alter else None, code, names, space, state, alter)
    finally:
        # exec() adds __builtins__ to the caller's namespace; PyMOL does not.
        if not had_builtins:
            space.pop("__builtins__", None)


def _run_code(selection, plain_value, code, names, space, state, alter):
    """Runs code for each selected atom. plain_value is the expression when
    it can be computed by _row_function instead (never when altering)."""
    count = 0
    for mol, idx in _selected(selection):
        st = None
        if state is not None:
            st = min(max(state, 0), len(mol.coords) - 1)
            idx = idx[~np.isnan(mol.coords[st][idx]).any(axis=1)]
        read = [n for n in names if st is not None or n not in _COORDINATES]
        if alter and st is not None:
            # An expression that moves an atom along one axis still needs
            # the other two to place it.
            read += [n for n in _COORDINATES if n not in read]
        values = [_ATOM_VALUES[n](mol, idx, st) for n in read]
        if plain_value is not None:
            row = _row_function(plain_value, read, space)
            for atom in (zip(*values) if values else ((),) * len(idx)):
                row(*atom)
                count += 1
            continue
        settable = [f for f in _ALTERABLE if f in read]
        for k, i in enumerate(idx.tolist()):
            ns = {n: column[k] for n, column in zip(read, values)}
            before = dict(ns) if alter else None
            exec(code, space, ns)
            count += 1
            if alter:
                for f in settable:
                    if ns.get(f) != before.get(f):
                        _set_field(mol, i, f, ns[f])
                if st is not None and any(ns.get(c) != before.get(c) for c in _COORDINATES):
                    mol.coords[st][i] = single((ns["x"], ns["y"], ns["z"]))
    return count


def _set_field(mol, i, f, value):
    mol._columns.clear()
    if f == "name":
        mol.atom_name[i] = str(value)
    elif f == "resi":
        text = str(value)
        mol.resi[i] = text
        m = re.match(r"-?\d+", text)
        mol.resv[i] = int(m.group(0)) if m else 0
    elif f == "type":
        mol.hetatm[i] = 1 if str(value).upper() == "HETATM" else 0
    elif f in ("q", "b", "partial_charge"):
        getattr(mol, f)[i] = float(value)
    elif f in ("formal_charge", "ID", "color"):
        getattr(mol, f)[i] = int(value)
    else:
        getattr(mol, f)[i] = str(value)


class _Stored:
    pass


_GLOBAL_SPACE = {"stored": _Stored()}


# ------------------------------------------------------------
# View (PyMOL's 18-number camera) and rendering state
# ------------------------------------------------------------

def _view_parts(view):
    v = list(view)
    # Elements 0-8: model-to-camera rotation, stored column-major.
    rot = np.array([[v[0], v[3], v[6]], [v[1], v[4], v[7]], [v[2], v[5], v[8]]], dtype=np.float64)
    return rot, np.array(v[9:12]), np.array(v[12:15]), v[15], v[16], v[17]


def _make_view(rot, cam, origin, front, back, fov_flag):
    r = np.asarray(rot, dtype=np.float64)
    return (r[0, 0], r[1, 0], r[2, 0], r[0, 1], r[1, 1], r[2, 1], r[0, 2], r[1, 2], r[2, 2],
            float(cam[0]), float(cam[1]), float(cam[2]), float(origin[0]), float(origin[1]), float(origin[2]),
            float(front), float(back), float(fov_flag))


def _default_view():
    return _make_view(np.eye(3), (0.0, 0.0, -50.0), (0.0, 0.0, 0.0), 40.0, 100.0, -1.0)


def _fov():
    try:
        return float(STORE.settings.get("field_of_view", 20.0))
    except ValueError:
        return 20.0


def camera_place(view=None):
    """(rotation, position) of the camera in model space: the columns of
    rotation are the camera's x, y and z axes; the camera looks along -z."""
    rot, cam, origin, _f, _b, _o = _view_parts(view or STORE.view or _default_view())
    position = origin - rot.T @ cam
    return rot.T, position


# ------------------------------------------------------------
# The ChimeraX side (astra3_chimerax_scene supplies the real one)
# ------------------------------------------------------------

class _NoGraphics:
    """Used when no ChimeraX session is available (tests): no secondary
    structure beyond the file's records, and no images or sessions."""

    name = "none"

    def assign_secondary_structure(self, mol, path):
        return False

    def render(self, png_path, width, height, scene):
        raise CmdException("no ChimeraX session is available to render images")

    def save_session(self, path, scene):
        raise CmdException("no ChimeraX session is available to save a session")

    def version(self):
        return os.environ.get("ASTRA3_ENGINE_VERSION", "")

    def close(self):
        pass


GRAPHICS = _NoGraphics()


# PyMOL's default label_size (14 px) relative to its default 480 px window
# height; ray-traced images keep the same proportion.
LABEL_HEIGHT_FRACTION = 14.0 / 480.0


def scene_labels(mol, atoms=None):
    """[(atom index, text)] for labelled atoms, optionally only among `atoms`."""
    idx = range(mol.n) if atoms is None else atoms
    return [(int(i), str(mol.label[i])) for i in idx if str(mol.label[i]).strip()]


def label_height(scene):
    """Label height in A matching PyMOL's label size at the centre of the view."""
    view = scene["view"]
    distance = abs(float(view[11])) or 50.0
    return 2.0 * distance * math.tan(math.radians(float(scene["fov"]) / 2.0)) * LABEL_HEIGHT_FRACTION


def scene_description():
    """What is shown, for the graphics side: enabled molecules (atoms,
    state-1 coordinates, colors, classes) and drawing objects, the camera,
    background and settings."""
    mols = []
    for mol in STORE.molecules():
        if not mol.enabled or mol.n == 0:
            continue
        mols.append(mol)
    cgos = [o for o in STORE.objects() if isinstance(o, CGOObject) and o.enabled]
    return {
        "molecules": mols, "cgo": cgos, "view": STORE.view or _default_view(), "fov": _fov(),
        "frame": ((_view_parts(STORE.view)[2], STORE.frame_radius)
                  if STORE.view is not None and STORE.frame_radius else None),
        "background": STORE.bg, "opaque": STORE.settings.get("ray_opaque_background", "1") not in ("0", "off"),
        "colors": _COLOR_BY_INDEX,
    }


# ------------------------------------------------------------
# cmd
# ------------------------------------------------------------

def _legal_name(name):
    raw = str(name).encode("utf-8")
    chars = []
    for byte in raw:
        ch = chr(byte)
        if ch.isascii() and (ch.isalnum() or ch in "+-._^"):
            chars.append(ch)
        else:
            chars.append("\x01")
    text = "".join(chars).lstrip("\x01").rstrip("\x01")
    text = re.sub("\x01+", "_", text)
    if text.lower() in RESERVED_NAMES:
        text += "_"
    return text


def _parse_color(color):
    if isinstance(color, (int, np.integer)):
        return int(color)
    text = str(color).strip().lower()
    if text in COLORS:
        return COLORS[text][0]
    if re.fullmatch(r"-?\d+", text):
        return int(text)
    raise CmdException(f"Unknown color '{color}'")


def _object_name_list(name):
    text = str(name or "").strip()
    if text in ("", "all", "*"):
        return list(STORE.names.values())
    out = []
    for token in re.split(r"[\s,]+", text):
        if not token:
            continue
        if "*" in token or "?" in token:
            out += [o for o in STORE.names.values() if fnmatch.fnmatch(o.name.lower(), token.lower())]
        else:
            obj = STORE.get(token)
            if obj is not None:
                out.append(obj)
    return out


class _Cmd(types.ModuleType):
    """PyMOL's cmd, as far as Astra3 uses it."""

    CmdException = CmdException

    # -- loading --------------------------------------------------------
    def load(self, filename, object="", state=0, format="", finish=1, discrete=-1, quiet=1, multiplex=None,
             zoom=-1, partial=0, **kw):
        path = str(filename)
        low = path.lower()
        base = low[:-3] if low.endswith(".gz") else low
        if not os.path.isfile(path):
            raise CmdException(f"Unable to open file '{path}'")
        if base.endswith(".pse"):
            return self._load_session(path, partial)
        text = _read_text(path)
        is_cif = format == "cif" or base.endswith((".cif", ".mmcif"))
        stem = os.path.basename(base).rsplit(".", 1)[0]
        blocks = split_cif_blocks(text) if is_cif else []
        if len(blocks) > 1:
            # Like PyMOL: each block becomes an object named after the block
            # (the requested object name is ignored), replacing any object
            # with that name.
            names = []
            for block, block_text in blocks:
                records, ss = parse_cif(block_text)
                if records:
                    names.append(self._add_molecule(_legal_name(block or stem), records, ss, path, True,
                                                    ss_text=block_text))
            if not names:
                raise CmdException("no atoms were found in the file")
            return names[0]
        records, ss = parse_cif(text) if is_cif else parse_pdb(text)
        if not records:
            raise CmdException("no atoms were found in the file")
        return self._add_molecule(_legal_name(object or stem), records, ss, path, is_cif)

    def _add_molecule(self, name, records, ss, path, is_cif, ss_text=None):
        mol = Molecule.from_records(name, records, ss_ranges=ss if (ss["helix"] or ss["sheet"]) else None,
                                    later_models_update=not is_cif)
        mol.source_path = path
        if not (ss["helix"] or ss["sheet"]):
            if ss_text is None:
                assigned = GRAPHICS.assign_secondary_structure(mol, path)
            else:
                # Give ChimeraX only this block; it reads every block of a
                # file, and blocks sharing a chain ID would get mixed up.
                import tempfile
                fd, block_path = tempfile.mkstemp(suffix=".cif")
                try:
                    with os.fdopen(fd, "w", encoding="utf-8") as fh:
                        fh.write(ss_text)
                    assigned = GRAPHICS.assign_secondary_structure(mol, block_path)
                finally:
                    try:
                        os.remove(block_path)
                    except OSError:
                        pass
            if not assigned:
                mol.ss = _strings(["L" if f & F_PROTEIN else "" for f in mol.flags])
        STORE.add(mol)
        if STORE.view is None:
            self.zoom(name)
        return name

    def _load_session(self, path, partial):
        """The molecules of a PyMOL session (astra3_pse reads it). As in
        PyMOL, partial=0 replaces everything loaded and partial=1 adds the
        session's objects, replacing any of the same name."""
        import astra3_pse
        try:
            loaded = astra3_pse.read_session(path, sys.modules[__name__])
        except astra3_pse.SessionError as e:
            raise CmdException(f"Could not open the PyMOL session {os.path.basename(path)}: {e}") from None
        if not partial:
            STORE.reset()
        for name, mol in loaded:
            if STORE.get(name) is not None:
                STORE.remove_name(name)
            mol.source_path = path
            STORE.add(mol)
        if STORE.view is None:
            self.zoom(" or ".join(name for name, _mol in loaded))
        return loaded[0][0]

    def fetch(self, code, name="", state=0, finish=1, discrete=-1, multiplex=-2, zoom=-1, type="", async_=0,
              path="", file=None, quiet=1, **kw):
        code = str(code).strip()
        kind = (type or "cif").lower()
        if kind not in ("pdb", "cif"):
            kind = "cif"
        entry, chain = code, ""
        if re.fullmatch(r"[0-9][A-Za-z0-9]{3}[A-Za-z0-9]{1,2}", code):
            entry, chain = code[:4], code[4:]
        fetch_dir = path or STORE.settings.get("fetch_path") or "."
        os.makedirs(fetch_dir, exist_ok=True)
        local = os.path.join(fetch_dir, f"{entry.lower()}.{kind}")
        if not os.path.isfile(local):
            data = None
            for url in _fetch_urls(entry, kind):
                try:
                    with urllib.request.urlopen(url, timeout=60) as resp:
                        data = resp.read()
                    break
                except Exception:  # noqa: BLE001 -- try the next location
                    continue
            if data is None:
                print(f" Error-fetch: unable to load '{entry.lower()}'.", flush=True)
                return -1
            if data[:2] == b"\x1f\x8b":
                data = gzip.decompress(data)
            with open(local, "wb") as fh:
                fh.write(data)
        obj_name = self.load(local, name or code)
        if chain:
            mol = STORE.get(obj_name)
            keep = _match_words(mol, "chain", [chain], ignore_case=False)
            if not keep.any():
                print(f" Error: no such chain '{chain}'", flush=True)
            mol.take(np.flatnonzero(keep))
            mol.classify()
        return obj_name

    # -- names and objects ---------------------------------------------
    def get_names(self, type="public_objects", enabled_only=0, selection="", **kw):
        out = []
        for obj in STORE.names.values():
            is_sel = isinstance(obj, Selection)
            if type in ("objects", "public_objects", "public_nongroup_objects", "nongroup_objects") and is_sel:
                continue
            if type in ("selections", "public_selections") and not is_sel:
                continue
            if type.startswith("public") and obj.name.startswith("_"):
                continue
            if enabled_only and not getattr(obj, "enabled", True):
                continue
            out.append(obj.name)
        return out

    def get_type(self, name, quiet=1):
        obj = STORE.get(name)
        if obj is None:
            raise CmdException(f"unrecognized name '{name}'")
        return obj.kind

    def get_legal_name(self, name):
        return _legal_name(name)

    def count_atoms(self, selection="(all)", quiet=1, state=0, domain="", **kw):
        return int(sum(int(m.sum()) for m in select_masks(selection).values()))

    def select(self, name, selection="", enable=1, quiet=1, merge=0, state=0, domain="", **kw):
        if selection == "":
            name, selection = "sele", name
        masks = select_masks(selection)
        members = {}
        count = 0
        for mol in STORE.molecules():
            m = masks.get(id(mol))
            if m is not None and m.any():
                members[id(mol)] = set(int(u) for u in mol.uid[m])
                count += int(m.sum())
        STORE.add(Selection(_legal_name(name), members))
        return count

    def delete(self, name):
        for obj in _object_name_list(name):
            STORE.remove_name(obj.name)
            if isinstance(obj, Molecule):
                for other in STORE.names.values():
                    if isinstance(other, Selection):
                        other.members.pop(id(obj), None)

    def set_name(self, old_name, new_name):
        obj = STORE.get(old_name)
        if obj is None:
            raise CmdException(f"'{old_name}' not found")
        STORE.rename(obj, _legal_name(new_name))

    def create(self, name, selection, source_state=0, target_state=0, discrete=0, zoom=-1, quiet=1,
               singletons=0, extract=None, copy_properties=False, **kw):
        parts = _selected(selection)
        name = _legal_name(name)
        states = None if not source_state or source_state < 0 else [source_state - 1]
        if states is not None:
            parts = [(m, idx[~np.isnan(m.coords[min(states[0], len(m.coords) - 1)][idx]).any(axis=1)])
                     for m, idx in parts]
            parts = [(m, idx) for m, idx in parts if len(idx)]
        if not parts:
            mol = Molecule(name)
        elif len(parts) == 1:
            src, idx = parts[0]
            mask = np.zeros(src.n, dtype=bool)
            mask[idx] = True
            mol = src.copy_subset(name, mask, states)
        else:
            pieces = []
            for src, idx in parts:
                mask = np.zeros(src.n, dtype=bool)
                mask[idx] = True
                pieces.append(src.copy_subset(name, mask, states))
            mol = _concat(name, pieces)
            mol._sort()
        STORE.add(mol)
        return None

    def remove(self, selection, quiet=1, state=0, **kw):
        masks = select_masks(selection)
        for mol in STORE.molecules():
            m = masks.get(id(mol))
            if m is not None and m.any():
                mol.take(np.flatnonzero(~m))

    def sort(self, name=""):
        for obj in _object_name_list(name):
            if isinstance(obj, Molecule):
                obj._sort()

    def count_states(self, selection="(all)", quiet=1):
        masks = select_masks(selection)
        n = 0
        for mol in STORE.molecules():
            m = masks.get(id(mol))
            if m is not None and m.any():
                n = max(n, len(mol.coords))
        return n

    def get_chains(self, selection="(all)", state=0, quiet=1):
        # Sorted, like PyMOL, rather than in file order.
        chains = set()
        for mol, idx in _selected(selection):
            chains.update(str(c) for c in mol.chain[idx])
        return sorted(chains)

    def enable(self, name="all", parents=0):
        for obj in _object_name_list(name):
            obj.enabled = True

    def disable(self, name="all"):
        for obj in _object_name_list(name):
            obj.enabled = False

    def load_cgo(self, object, name, state=0, quiet=1, **kw):
        STORE.add(CGOObject(_legal_name(name), object))

    def reinitialize(self, what="everything", object=""):
        STORE.reset()

    # -- per-atom data --------------------------------------------------
    def iterate(self, selection, expression, quiet=1, space=None):
        return _run_expression(selection, expression, space, state=None)

    def iterate_state(self, state, selection, expression, quiet=1, space=None, atomic=1):
        st = int(state) - 1 if int(state) > 0 else 0
        return _run_expression(selection, expression, space, state=st)

    def alter(self, selection, expression, quiet=1, space=None):
        # Like PyMOL, atoms are not re-sorted until sort() is called.
        return _run_expression(selection, expression, space, state=None, alter=True)

    def alter_state(self, state, selection, expression, quiet=1, space=None, atomic=1):
        st = int(state) - 1 if int(state) > 0 else 0
        return _run_expression(selection, expression, space, state=st, alter=True)

    def get_distance(self, atom1="pk1", atom2="pk2", state=-1, quiet=1):
        a = _single_atom(atom1)
        b = _single_atom(atom2)
        return float(np.linalg.norm(a - b))

    def find_pairs(self, selection1, selection2, state1=1, state2=1, cutoff=3.5, mode=0, angle=45):
        s1 = _selected(selection1)
        s2 = _selected(selection2)
        out = []
        if not s1 or not s2:
            return out
        b_xyz = np.concatenate([m.coords[min(int(state2) - 1, len(m.coords) - 1)][idx] for m, idx in s2])
        b_ref = [(m.name, int(i) + 1) for m, idx in s2 for i in idx]
        c2 = float(cutoff) ** 2
        for m, idx in s1:
            xyz = m.coords[min(int(state1) - 1, len(m.coords) - 1)]
            for i in idx:
                d = b_xyz - xyz[i]
                close = np.flatnonzero(np.einsum("ij,ij->i", d, d) <= c2)
                for j in close:
                    if b_ref[j] != (m.name, int(i) + 1):
                        out.append(((m.name, int(i) + 1), b_ref[j]))
        # PyMOL lists pairs in the order of the second selection's atoms.
        order = {ref: k for k, ref in enumerate(b_ref)}
        first = {(m.name, int(i) + 1): k for k, (m, i) in enumerate((m, i) for m, idx in s1 for i in idx)}
        out.sort(key=lambda pair: (order[pair[1]], first[pair[0]]))
        return out

    def transform_selection(self, selection, matrix, state=0, log=0, homogenous=0, transpose=0):
        mat = np.array([float(x) for x in matrix], dtype=np.float64).reshape(4, 4)
        if transpose:
            mat = mat.T
        if not homogenous:
            # PyMOL's TTT form: pre-translation in the bottom row.
            pre = mat[3, :3].copy()
            mat = mat.copy()
            mat[:3, 3] = mat[:3, 3] + mat[:3, :3] @ pre
            mat[3, :3] = 0.0
        rot, trans = mat[:3, :3], mat[:3, 3]
        for mol, idx in _selected(selection):
            states = range(len(mol.coords)) if int(state) <= 0 else [int(state) - 1]
            for st in states:
                if st < len(mol.coords):
                    mol.coords[st][idx] = single(mol.coords[st][idx] @ rot.T + trans)

    # -- colors ----------------------------------------------------------
    def color(self, color, selection="(all)", quiet=1, flags=0):
        idx = _parse_color(color)
        for mol, sel in _selected(selection):
            mol.color[sel] = idx

    def set_color(self, name, rgb, mode=0, quiet=1):
        key = str(name).strip().lower()
        if not key or key in RESERVED_NAMES:
            raise CmdException(f"Invalid color name '{name}'")
        values = tuple(float(v) for v in rgb)
        if len(values) != 3:
            raise CmdException("set_color needs three values")
        if any(v > 1 for v in values):
            values = tuple(v / 255.0 for v in values)
        index = COLORS[key][0] if key in COLORS else max(5387, max(_COLOR_BY_INDEX)) + 1
        COLORS[key] = (index, values)
        _COLOR_BY_INDEX[index] = values

    def get_color_index(self, color):
        try:
            return _parse_color(color)
        except CmdException:
            return -1

    def get_color_tuple(self, name, mode=0):
        idx = _parse_color(name)
        rgb = _COLOR_BY_INDEX.get(idx)
        if rgb is None:
            raise CmdException(f"Unknown color index {idx}")
        return tuple(float(v) for v in rgb)

    def bg_color(self, color="black"):
        idx = _parse_color(color)
        STORE.bg = tuple(_COLOR_BY_INDEX.get(idx, (0, 0, 0)))

    # -- settings --------------------------------------------------------
    def set(self, name, value=1, selection="", state=0, updates=1, log=0, quiet=1):
        STORE.settings[str(name)] = str(value)

    def get(self, name, selection="", state=0, quiet=1):
        if str(name) not in STORE.settings:
            raise CmdException(f"Error: unknown Setting: '{name}'.")
        return STORE.settings[str(name)]

    def clip(self, mode, distance, selection=None, state=0):
        if STORE.view is None:
            STORE.view = _default_view()
        rot, cam, origin, front, back, fov = _view_parts(STORE.view)
        if str(mode) == "slab":
            mid = -cam[2]
            half = float(distance) / 2.0
            front, back = max(mid - half, 0.01), mid + half
        STORE.view = _make_view(rot, cam, origin, front, back, fov)

    # -- camera ----------------------------------------------------------
    def get_view(self, output=1, quiet=1):
        if STORE.view is None:
            STORE.view = _default_view()
        return tuple(STORE.view)

    def set_view(self, view, animate=0, quiet=1, hand=1):
        if isinstance(view, str):
            view = [float(x) for x in re.findall(r"-?\d+\.?\d*(?:[eE][-+]?\d+)?", view)]
        if len(view) < 18:
            raise CmdException("set_view needs 18 numbers")
        STORE.view = tuple(float(x) for x in view[:18])

    def turn(self, axis, angle):
        if STORE.view is None:
            STORE.view = _default_view()
        rot, cam, origin, front, back, fov = _view_parts(STORE.view)
        a = math.radians(float(angle))
        c, s = math.cos(a), math.sin(a)
        if axis == "x":
            r = np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
        elif axis == "y":
            r = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
        else:
            r = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
        STORE.view = _make_view(r @ rot, cam, origin, front, back, fov)

    def orient(self, selection="(all)", state=0, animate=0):
        xyz = _selection_xyz(selection)
        if len(xyz) == 0:
            return
        center = xyz.mean(axis=0)
        if len(xyz) >= 3:
            cov = np.cov((xyz - center).T)
            vals, vecs = np.linalg.eigh(cov)
            axes = vecs[:, np.argsort(vals)[::-1]].T
            for k in range(2):
                if axes[k][np.argmax(np.abs(axes[k]))] < 0:
                    axes[k] = -axes[k]
            axes[2] = np.cross(axes[0], axes[1])
            rot = axes
        else:
            rot = np.eye(3)
        if STORE.view is None:
            STORE.view = _default_view()
        _r, cam, origin, front, back, fov = _view_parts(STORE.view)
        STORE.view = _make_view(rot, cam, center, front, back, fov)
        self.zoom(selection)

    def zoom(self, selection="all", buffer=0.0, state=0, complete=0, animate=0):
        xyz = _selection_xyz(selection)
        if len(xyz) == 0:
            return
        if STORE.view is None:
            STORE.view = _default_view()
        rot, _cam, _origin, _front, _back, fov_flag = _view_parts(STORE.view)
        # As PyMOL zooms: on the centroid, to the farthest atom (complete)
        # or to the largest extent along x, y or z, with the clipping
        # planes 1.2 radii either side.
        center = xyz.mean(axis=0)
        if complete:
            radius = float(np.linalg.norm(xyz - center, axis=1).max())
        else:
            radius = float(np.maximum(xyz.max(axis=0) - center, center - xyz.min(axis=0)).max())
        radius = max(radius + float(buffer), 1.0)
        STORE.frame_radius = radius
        distance = radius / math.tan(math.radians(_fov()) / 2.0)
        STORE.view = _make_view(rot, (0.0, 0.0, -distance), center, max(distance - 1.2 * radius, 0.01),
                                distance + 1.2 * radius, fov_flag)

    # -- images and files --------------------------------------------------
    def ray(self, width=0, height=0, antialias=-1, angle=0.0, shift=0.0, renderer=-1, quiet=1, async_=0):
        STORE.ray_size = (int(width), int(height))

    def png(self, filename, width=0, height=0, dpi=-1.0, ray=0, quiet=1, prior=0, format=0):
        w, h = int(width or 0), int(height or 0)
        if not (w and h):
            w, h = STORE.ray_size or (1024, 768)
        GRAPHICS.render(str(filename), w, h, scene_description())
        return 1

    def save(self, filename, selection="(all)", state=-1, format="", ref="", ref_state=-1, quiet=1, **kw):
        path = str(filename)
        low = path.lower()
        if low.endswith((".pse", ".cxs")):
            GRAPHICS.save_session(path, scene_description())
            return
        if low.endswith((".pdb", ".ent")):
            write_pdb(path, selection)
            return
        raise CmdException(f"cannot save '{path}' in this format")

    def sync(self, timeout=1.0, poll=0.05):
        return None

    def refresh(self):
        return None

    def interrupt(self):
        return None

    def get_version(self):
        return (GRAPHICS.version() or "", 0.0, 0)

    def quit(self, code=0):
        GRAPHICS.close()
        sys.stdout.flush()
        if os.environ.get("ASTRA3_ENGINE", "").strip().lower() == "astra3":
            raise SystemExit(int(code or 0))  # the Astra3 Engine ends its own process
        os._exit(int(code or 0))


def _fetch_urls(entry, kind):
    host = str(STORE.settings.get("fetch_host", "rcsb"))
    code = entry.lower()
    if host.startswith("http"):
        mid = code[1:3]
        if kind == "pdb":
            return [f"{host.rstrip('/')}/data/structures/divided/pdb/{mid}/pdb{code}.ent.gz"]
        return [f"{host.rstrip('/')}/data/structures/divided/mmCIF/{mid}/{code}.cif.gz"]
    # Extended IDs are written in lower case, as the PDBx/mmCIF dictionary has them.
    name = code if code.startswith("pdb_") else entry.upper()
    return [f"https://files.rcsb.org/download/{name}.{kind}.gz",
            f"https://files.rcsb.org/download/{name}.{kind}"]


def _single_atom(selection):
    parts = _selected(selection)
    if sum(len(idx) for _m, idx in parts) != 1:
        raise CmdException(f"'{selection}' must hold exactly one atom")
    mol, idx = parts[0]
    return mol.coords[0][idx[0]]


def _selection_xyz(selection):
    parts = []
    for mol, idx in _selected(selection):
        xyz = mol.coords[0][idx]
        parts.append(xyz[~np.isnan(xyz).any(axis=1)])
    return np.concatenate(parts) if parts else np.zeros((0, 3))


def _concat(name, pieces):
    mol = Molecule(name)
    for f in _ATOM_FIELDS:
        setattr(mol, f, np.concatenate([getattr(p, f) for p in pieces]))
    for f in _NUM_FIELDS:
        setattr(mol, f, np.concatenate([getattr(p, f) for p in pieces]))
    mol.uid = np.concatenate([p.uid for p in pieces])
    n_states = min(len(p.coords) for p in pieces)
    mol.coords = np.concatenate([p.coords[:n_states] for p in pieces], axis=1)
    mol.n = int(sum(p.n for p in pieces))
    return mol


def _pdb_lines(parts):
    """ATOM/HETATM records (state 1) for [(molecule, atom indices)]."""
    lines = []
    serial = 0
    numbering = {}      # residue identifier -> (number, insertion code)
    for mol, idx in parts:
        idx = np.asarray(idx, dtype=np.int64)
        idx = idx[~np.isnan(mol.coords[0][idx]).any(axis=1)]
        # Whole columns as Python values: a record per atom is formatted far
        # faster from these than from one array element at a time.
        atoms = zip(_texts(mol.chain, idx), _texts(mol.atom_name, idx), _texts(mol.elem, idx),
                    _texts(mol.resi, idx), _texts(mol.alt, idx), _texts(mol.resn, idx), _texts(mol.segi, idx),
                    mol.hetatm[idx].tolist(), mol.formal_charge[idx].tolist(), mol.q[idx].tolist(),
                    mol.b[idx].tolist(), mol.coords[0][idx].tolist())
        last_chain = None
        for chain, name, elem, resi, alt, resn, segi, hetatm, charge, q, b, (x, y, z) in atoms:
            if last_chain is not None and chain != last_chain:
                lines.append("TER")
            last_chain = chain
            serial += 1
            elem = elem.upper()
            if len(name) < 4 and len(elem) == 1:
                name = " " + name
            if resi not in numbering:
                m = re.fullmatch(r"(-?\d+)(\D?)", resi)
                numbering[resi] = (m.group(1), m.group(2)) if m else (resi[:4], "")
            resseq, ins = numbering[resi]
            charge = int(charge)
            charge_text = f"{abs(charge)}{'+' if charge > 0 else '-'}" if charge else "  "
            lines.append("%-6s%5s %-4s%1s%-4s%1s%4s%1s   %8.3f%8.3f%8.3f%6.2f%6.2f      %-4s%2s%2s" % (
                "HETATM" if hetatm else "ATOM", serial if serial < 100000 else "*****", name[:4],
                alt[:1], resn[:4], chain[:1], resseq[-4:], ins[:1],
                x, y, z, float(q), float(b), segi[:4], elem[:2].rjust(2), charge_text))
    lines.append("END")
    return lines


def write_pdb(path, selection="(all)"):
    """PDB-format coordinates of a selection (state 1), as PyMOL writes them."""
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(_pdb_lines(_selected(selection))) + "\n")


def write_molecule_pdb(path, mol):
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(_pdb_lines([(mol, np.arange(mol.n))])) + "\n")


# ------------------------------------------------------------
# Installation
# ------------------------------------------------------------

def _cgo_module():
    cgo = types.ModuleType("pymol.cgo")
    for k, v in {"POINTS": 0.0, "LINES": 1.0, "LINE_LOOP": 2.0, "LINE_STRIP": 3.0, "TRIANGLES": 4.0,
                 "TRIANGLE_STRIP": 5.0, "TRIANGLE_FAN": 6.0, "STOP": 0.0, "NULL": 1.0, "BEGIN": 2.0,
                 "END": 3.0, "VERTEX": 4.0, "NORMAL": 5.0, "COLOR": 6.0, "SPHERE": 7.0, "CYLINDER": 9.0,
                 "LINEWIDTH": 10.0, "WIDTHSCALE": 11.0, "ALPHA": 25.0, "CONE": 27.0}.items():
        setattr(cgo, k, v)
    return cgo


def install(session=None, graphics=None):
    """Make `from pymol import cmd` give this engine. graphics, if given,
    replaces the ChimeraX scene (tests); otherwise one is built from the
    ChimeraX session."""
    global GRAPHICS
    if graphics is not None:
        GRAPHICS = graphics
    elif session is not None:
        import astra3_chimerax_scene
        GRAPHICS = astra3_chimerax_scene.ChimeraXGraphics(session)
    pymol = types.ModuleType("pymol")
    cmd = _Cmd("pymol.cmd")
    pymol.cmd = cmd
    pymol.cgo = _cgo_module()
    pymol.CmdException = CmdException
    pymol.stored = _GLOBAL_SPACE["stored"]
    invocation = types.ModuleType("pymol.invocation")
    invocation.options = None
    pymol.invocation = invocation
    pymol.__path__ = []
    sys.modules["pymol"] = pymol
    sys.modules["pymol.cmd"] = cmd
    sys.modules["pymol.cgo"] = pymol.cgo
    sys.modules["pymol.invocation"] = invocation
    return cmd

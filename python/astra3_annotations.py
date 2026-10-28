"""
Astra3: structure annotations -- sequence differences, reference sequences,
wwPDB validation, and domain assignments.

Two sources, kept separate and always named in every report:

  1. The downloaded coordinate file itself (no network needed). Its
     SEQADV/DBREF records (legacy PDB) or _struct_ref_seq_dif, _struct_ref
     and _struct_ref_seq categories (mmCIF) are the depositor's own
     declarations of the reference sequence and of every place the modeled
     construct differs from it (engineered mutations, expression tags,
     cloning artifacts, conflicts, variants).

  2. The RCSB PDB Data API (data.rcsb.org), only for entries fetched by PDB
     ID: the wwPDB validation summary and per-residue outliers, UniProt
     mapping, RCSB's own residue-level differences from UniProt, and
     Pfam/CATH/ECOD/SCOP domain assignments. Every response is kept and
     saved with the run, so a report can be traced to exactly the data it
     was built from.

Nothing here is estimated. A value is either read from one of these
sources, with the source named, or reported as unavailable with the reason.

Residue numbers shown to the user are always the author numbering used in
the coordinate file (what PyMOL shows as resi, including insertion codes).
RCSB positions are entity sequence positions; they are converted with the
instance's own auth_to_entity_poly_seq_mapping, never by offset arithmetic.
"""

import gzip
import json
import os
import re
import time
import urllib.error
import urllib.request
from xml.etree import ElementTree

try:
    from astra3_core import ASTRA3_VERSION
except Exception:  # noqa: BLE001 -- allows the parsers to be unit-tested standalone
    ASTRA3_VERSION = "unknown"


# ------------------------------------------------------------
# mmCIF reading
# ------------------------------------------------------------

def _cif_value(token):
    if token is None:
        return None
    return None if token in ("?", ".") else token


def _cif_tokenize(lines):
    """Split mmCIF data lines into value tokens.

    Handles the three mmCIF value forms: bare words, quoted strings (a quote
    only closes when followed by whitespace or end of line, so O'BRIEN-style
    embedded quotes survive), and ;-delimited multi-line text fields.
    """
    tokens = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith(";"):
            block = [line[1:]]
            i += 1
            while i < len(lines) and not lines[i].startswith(";"):
                block.append(lines[i])
                i += 1
            i += 1  # the closing ';' line
            tokens.append("\n".join(block).strip())
            continue
        j, n = 0, len(line)
        while j < n:
            c = line[j]
            if c.isspace():
                j += 1
                continue
            if c == "#":
                break
            if c in ("'", '"'):
                k = j + 1
                while k < n and not (line[k] == c and (k + 1 == n or line[k + 1].isspace())):
                    k += 1
                tokens.append(line[j + 1:k])
                j = k + 1
                continue
            k = j
            while k < n and not line[k].isspace():
                k += 1
            tokens.append(line[j:k])
            j = k
        i += 1
    return tokens


def cif_category(raw_text, category):
    """Rows of one mmCIF category as a list of {column: value} dicts.

    mmCIF writes a category with several rows as a loop_ and a category with
    a single row as plain "_category.column value" lines; both are read.
    Missing values ('?', '.') come back as None.
    """
    if not raw_text:
        return []
    lines = raw_text.splitlines()
    prefix = "_" + category + "."

    i = 0
    while i < len(lines):
        if lines[i].strip() == "loop_":
            j = i + 1
            cols = []
            while j < len(lines) and lines[j].strip().startswith("_"):
                cols.append(lines[j].strip().split()[0])
                j += 1
            if cols and cols[0].startswith(prefix):
                k = j
                data = []
                while k < len(lines):
                    t = lines[k]
                    ts = t.strip()
                    if not t.startswith(";") and (ts.startswith("_") or ts == "loop_"
                                                  or ts.startswith("data_") or ts.startswith("#")):
                        break
                    data.append(t)
                    k += 1
                toks = _cif_tokenize(data)
                names = [c[len(prefix):] for c in cols]
                width = len(names)
                rows = []
                for r in range(0, len(toks) - width + 1, width):
                    rows.append({names[x]: _cif_value(toks[r + x]) for x in range(width)})
                return rows
            i = j
            continue
        i += 1

    record = {}
    i = 0
    while i < len(lines):
        s = lines[i].strip()
        if s.startswith(prefix):
            parts = s.split(None, 1)
            name = parts[0][len(prefix):]
            if len(parts) == 2:
                toks = _cif_tokenize([parts[1]])
                record[name] = _cif_value(toks[0]) if toks else None
                i += 1
                continue
            if i + 1 < len(lines) and lines[i + 1].startswith(";"):
                k = i + 1
                block = [lines[k]]
                k += 1
                while k < len(lines) and not lines[k].startswith(";"):
                    block.append(lines[k])
                    k += 1
                block.append(";")
                toks = _cif_tokenize(block)
                record[name] = _cif_value(toks[0]) if toks else None
                i = k + 1
                continue
            toks = _cif_tokenize([lines[i + 1]]) if i + 1 < len(lines) else []
            record[name] = _cif_value(toks[0]) if toks else None
            i += 2
            continue
        i += 1
    return [record] if record else []


# ------------------------------------------------------------
# Depositor declarations in the coordinate file
# ------------------------------------------------------------

# How the PDB describes a residue that differs from the reference sequence.
# Grouped only to decide which ones are construct additions rather than
# sequence changes; the depositor's exact wording is always kept.
_CONSTRUCT_ADDITION_TERMS = ("expression tag", "cloning artifact", "linker", "initiating methionine",
                             "leader sequence", "insertion")


def _classify_difference(details):
    text = (details or "").strip().lower()
    if not text:
        return "unspecified"
    if "engineered" in text or "mutation" in text:
        return "engineered mutation"
    if any(term in text for term in _CONSTRUCT_ADDITION_TERMS):
        return "construct addition"
    if "conflict" in text:
        return "conflict"
    if "variant" in text:
        return "variant"
    if "deletion" in text:
        return "deletion"
    if "microheterogeneity" in text:
        return "microheterogeneity"
    if "chromophore" in text:
        return "chromophore"
    return "other"


def _strip(value):
    value = (value or "").strip()
    return value or None


def _parse_seqadv(raw_text):
    diffs = []
    for line in raw_text.splitlines():
        if not line.startswith("SEQADV"):
            continue
        line = line.ljust(80)
        resname = _strip(line[12:15])
        chain = _strip(line[16:17])
        num = _strip(line[18:22])
        icode = _strip(line[22:23])
        details = _strip(line[49:70])
        diffs.append({
            "chain": chain,
            "residue": resname,
            "residue_number": (num + icode) if (num and icode) else num,
            "database": _strip(line[24:28]),
            "accession": _strip(line[29:38]),
            "reference_residue": _strip(line[39:42]),
            "reference_number": _strip(line[43:48]),
            "details": details,
            "category": _classify_difference(details),
        })
    return diffs


def _parse_dbref(raw_text):
    refs = []
    pending_long = {}
    for line in raw_text.splitlines():
        rec = line[:6]
        line80 = line.ljust(80)
        if rec == "DBREF ":
            beg = _strip(line80[14:18]); beg_i = _strip(line80[18:19])
            end = _strip(line80[20:24]); end_i = _strip(line80[24:25])
            refs.append({
                "chain": _strip(line80[12:13]),
                "database": _strip(line80[26:32]),
                "accession": _strip(line80[33:41]),
                "entry_name": _strip(line80[42:54]),
                "structure_range": _range_label((beg or "") + (beg_i or ""), (end or "") + (end_i or "")),
                "reference_range": _range_label(_strip(line80[55:60]), _strip(line80[62:67])),
            })
        elif rec == "DBREF1":
            chain = _strip(line80[12:13])
            beg = _strip(line80[14:18]); beg_i = _strip(line80[18:19])
            end = _strip(line80[20:24]); end_i = _strip(line80[24:25])
            pending_long[chain] = {
                "chain": chain,
                "database": _strip(line80[26:32]),
                "entry_name": _strip(line80[47:67]),
                "structure_range": _range_label((beg or "") + (beg_i or ""), (end or "") + (end_i or "")),
            }
        elif rec == "DBREF2":
            chain = _strip(line80[12:13])
            head = pending_long.pop(chain, {"chain": chain, "database": None, "entry_name": None, "structure_range": None})
            head["accession"] = _strip(line80[18:40])
            head["reference_range"] = _range_label(_strip(line80[45:55]), _strip(line80[57:67]))
            refs.append(head)
    return refs


def _parse_struct_ref_seq_dif(raw_text):
    diffs = []
    for row in cif_category(raw_text, "struct_ref_seq_dif"):
        num = row.get("pdbx_auth_seq_num")
        icode = row.get("pdbx_pdb_ins_code")
        details = row.get("details")
        diffs.append({
            "chain": row.get("pdbx_pdb_strand_id"),
            "residue": row.get("mon_id"),
            "residue_number": (num + icode) if (num and icode) else num,
            "database": row.get("pdbx_seq_db_name"),
            "accession": row.get("pdbx_seq_db_accession_code"),
            "reference_residue": row.get("db_mon_id"),
            "reference_number": row.get("pdbx_seq_db_seq_num"),
            "details": details,
            "category": _classify_difference(details),
        })
    return diffs


def _parse_struct_ref(raw_text):
    by_id = {row.get("id"): row for row in cif_category(raw_text, "struct_ref")}
    refs = []
    for row in cif_category(raw_text, "struct_ref_seq"):
        ref = by_id.get(row.get("ref_id"), {})
        beg = (row.get("pdbx_auth_seq_align_beg") or "") + (row.get("pdbx_seq_align_beg_ins_code") or "")
        end = (row.get("pdbx_auth_seq_align_end") or "") + (row.get("pdbx_seq_align_end_ins_code") or "")
        refs.append({
            "chain": row.get("pdbx_strand_id"),
            "database": ref.get("db_name"),
            "accession": row.get("pdbx_db_accession") or ref.get("pdbx_db_accession"),
            "entry_name": ref.get("db_code"),
            "structure_range": _range_label(beg, end),
            "reference_range": _range_label(row.get("db_align_beg"), row.get("db_align_end")),
        })
    return refs


def _display_date(value):
    """See astra3_core.display_date."""
    from astra3_core import display_date
    return display_date(value) if value else value


def _display_ranges(text):
    """See astra3_core.display_ranges; empty values stay empty."""
    if text in (None, ""):
        return text
    from astra3_core import display_ranges
    return display_ranges(text)


def _range_label(beg, end):
    beg = (beg or "").strip()
    end = (end or "").strip()
    if not beg and not end:
        return None
    if beg == end or not end:
        return beg
    return f"{beg}-{end}"


# ------------------------------------------------------------
# Biological assemblies declared in the coordinate file
# ------------------------------------------------------------
# The deposited coordinates are the asymmetric unit. The depositor's
# biological assembly says which chains form the functional unit and how
# many copies of each, generated by symmetry, it contains. Astra3 does not
# build assemblies; it uses them to say whether removing chains removed real
# partners, and whether chains analyzed together are one unit or crystal
# neighbors.

def _defined_by(text):
    t = (text or "").lower()
    if "author" in t and "software" in t:
        return "author and software"
    if "author" in t:
        return "author"
    if "software" in t or "pisa" in t:
        return "software"
    return None


def _count_operators(expr):
    """Number of operators in an mmCIF oper_expression: '1', '1,2', '1-60',
    or products of parenthesized groups such as '(1-60)(61-88)'."""
    expr = (expr or "").replace(" ", "")
    if not expr:
        return 1
    groups = re.findall(r"\(([^)]*)\)", expr) or [expr]
    total = 1
    for g in groups:
        n = 0
        for item in g.split(","):
            if "-" in item:
                a, _, b = item.partition("-")
                try:
                    n += int(b) - int(a) + 1
                except ValueError:
                    n += 1
            elif item:
                n += 1
        total *= max(n, 1)
    return total


def _parse_assemblies_cif(raw_text):
    label_to_auth = {}
    for row in cif_category(raw_text, "pdbx_poly_seq_scheme"):
        if row.get("asym_id") and row.get("pdb_strand_id"):
            label_to_auth.setdefault(row["asym_id"], row["pdb_strand_id"])
    assemblies = {}
    for row in cif_category(raw_text, "pdbx_struct_assembly"):
        aid = row.get("id")
        if not aid:
            continue
        try:
            count = int(row.get("oligomeric_count")) if row.get("oligomeric_count") else None
        except ValueError:
            count = None
        assemblies[aid] = {"id": aid, "defined_by": _defined_by(row.get("details")),
                           "oligomeric_details": row.get("oligomeric_details"), "oligomeric_count": count,
                           "chains": [], "operators": 1}
    for row in cif_category(raw_text, "pdbx_struct_assembly_gen"):
        a = assemblies.get(row.get("assembly_id"))
        if not a:
            continue
        for asym in (row.get("asym_id_list") or "").split(","):
            auth = label_to_auth.get(asym.strip())
            if auth and auth not in a["chains"]:
                a["chains"].append(auth)
        a["operators"] = max(a["operators"], _count_operators(row.get("oper_expression")))
    return list(assemblies.values())


def _parse_assemblies_pdb(raw_text):
    assemblies = []
    current = None
    for line in raw_text.splitlines():
        if not line.startswith("REMARK 350"):
            continue
        body = line[10:].strip()
        m = re.match(r"BIOMOLECULE:\s*(\S+)", body)
        if m:
            current = {"id": m.group(1), "defined_by": None, "oligomeric_details": None,
                       "oligomeric_count": None, "chains": [], "operators": 0}
            assemblies.append(current)
            continue
        if current is None:
            continue
        m = re.match(r"AUTHOR DETERMINED BIOLOGICAL UNIT:\s*(.+)", body)
        if m:
            current["oligomeric_details"] = m.group(1).strip().lower()
            current["defined_by"] = "author"
            continue
        m = re.match(r"SOFTWARE DETERMINED QUATERNARY STRUCTURE:\s*(.+)", body)
        if m:
            if current["defined_by"] is None:
                current["oligomeric_details"] = m.group(1).strip().lower()
                current["defined_by"] = "software"
            elif current["defined_by"] == "author":
                current["defined_by"] = "author and software"
            continue
        m = re.match(r"(?:APPLY THE FOLLOWING TO CHAINS|AND CHAINS):\s*(.+)", body)
        if m:
            for c in re.split(r"[,\s]+", m.group(1)):
                if c and c not in current["chains"]:
                    current["chains"].append(c)
            continue
        if re.match(r"BIOMT1\s", body):
            current["operators"] += 1
    for a in assemblies:
        a["operators"] = max(a["operators"], 1)
    return assemblies


def preferred_assembly(assemblies):
    for a in assemblies or []:
        if a.get("defined_by") and "author" in a["defined_by"]:
            return a
    return (assemblies or [None])[0]


def _assembly_label(a):
    parts = [a.get("oligomeric_details") or "oligomeric state not stated"]
    if a.get("defined_by"):
        parts.append(f"{a['defined_by']}-defined")
    return ", ".join(parts)


def assembly_for_chain(assemblies, chain):
    """The assembly a chain belongs to, preferring an author-defined one."""
    candidates = [a for a in assemblies or [] if chain in (a.get("chains") or [])]
    for a in candidates:
        if a.get("defined_by") and "author" in a["defined_by"]:
            return a
    return candidates[0] if candidates else None


def assembly_context(assemblies, chains, removed_chains=None):
    """Plain-language statements about the analyzed chains' biological
    context, from the depositor's assembly definitions. Returns
    (notes, warnings): notes describe; warnings are cases where a measured
    value no longer describes the biological unit."""
    notes, warnings = [], []
    if not assemblies:
        return notes, warnings
    chains = [c for c in chains or [] if c]
    removed = [c for c in removed_chains or [] if c]
    home = {c: assembly_for_chain(assemblies, c) for c in chains}
    kept_assemblies = []
    for c, a in home.items():
        if a is not None and all(a is not k for k in kept_assemblies):
            kept_assemblies.append(a)

    partner_warned = False
    for a in kept_assemblies:
        members = a.get("chains") or []
        partners = [r for r in removed if r in members]
        kept_here = [c for c in chains if c in members]
        if partners:
            partner_warned = True
            warnings.append(
                f"chain{'s' if len(partners) > 1 else ''} {', '.join(partners)} {'were' if len(partners) > 1 else 'was'} "
                f"removed, but the depositor's biological assembly {a['id']} ({_assembly_label(a)}) contains "
                f"{'them' if len(partners) > 1 else 'it'} together with chain{'s' if len(kept_here) > 1 else ''} "
                f"{', '.join(kept_here)}. Solvent exposure, contacts and terminal measurements therefore describe "
                f"{'an isolated chain' if len(kept_here) == 1 else 'part of the complex'} rather than the full biological assembly.")
    if removed and kept_assemblies and not partner_warned:
        a = kept_assemblies[0]
        notes.append(f"the removed chain{'s' if len(removed) > 1 else ''} ({', '.join(removed)}) "
                     f"{'are' if len(removed) > 1 else 'is'} not part of the depositor's biological assembly {a['id']} "
                     f"({_assembly_label(a)}) that contains chain {', '.join(c for c in chains if c in (a.get('chains') or []))}; "
                     f"keeping one chain matches the biological unit.")

    if len(chains) > 1 and len(kept_assemblies) > 1 and all(home[c] is not None for c in chains):
        labels = sorted({_assembly_label(a) for a in kept_assemblies})
        warnings.append(
            f"the depositor defines chains {', '.join(chains)} as parts of separate biological units (assemblies "
            f"{', '.join(a['id'] for a in kept_assemblies)}: {'; '.join(labels)}), so contacts between them come from "
            f"crystal packing. Exposure and contact results measured with all chains present include burial by "
            f"neighboring copies.")

    for a in kept_assemblies:
        if (a.get("operators") or 1) > 1:
            members = a.get("chains") or []
            warnings.append(
                f"the depositor's biological assembly {a['id']} ({_assembly_label(a)}) is built by applying "
                f"{a['operators']} symmetry operations to chain{'s' if len(members) > 1 else ''} {', '.join(members)}; "
                f"the partner copies are not in the deposited coordinates, so exposure at their interface is overestimated.")
    return notes, warnings

def parse_file_annotations(raw_text, file_format):
    """Depositor-declared reference sequences and sequence differences.

    file_format is "cif" or "pdb". Returns
      {"reference_sequences": [...], "sequence_differences": [...],
       "source": "<record names>", "available": bool}
    'available' is False only when the file text itself was unavailable;
    a file that declares no differences is available with an empty list.
    """
    if not raw_text:
        return {"reference_sequences": [], "sequence_differences": [], "source": None, "available": False}
    if file_format == "cif":
        return {
            "reference_sequences": _parse_struct_ref(raw_text),
            "sequence_differences": _parse_struct_ref_seq_dif(raw_text),
            "assemblies": _parse_assemblies_cif(raw_text),
            "source": "mmCIF _struct_ref / _struct_ref_seq / _struct_ref_seq_dif",
            "assembly_source": "mmCIF _pdbx_struct_assembly / _pdbx_struct_assembly_gen",
            "available": True,
        }
    return {
        "reference_sequences": _parse_dbref(raw_text),
        "sequence_differences": _parse_seqadv(raw_text),
        "assemblies": _parse_assemblies_pdb(raw_text),
        "source": "PDB DBREF / SEQADV records",
        "assembly_source": "PDB REMARK 350",
        "available": True,
    }


# ------------------------------------------------------------
# RCSB PDB Data API
# ------------------------------------------------------------

# Overridable only so tests can point Astra3 at a local fixture server.
RCSB_DATA_API = os.environ.get("ASTRA3_RCSB_DATA_API", "https://data.rcsb.org/rest/v1/core").rstrip("/")
# wwPDB validation reports are read from the same host as structure files
# (overridable, like the Data API, for a local fixture server).
RCSB_FILES_HOST = os.environ.get("ASTRA3_FETCH_HOST", "https://files.rcsb.org").rstrip("/")
RCSB_TIMEOUT_SECONDS = 10
# Very large complexes (ribosomes, viral capsids) have hundreds of chains.
# Astra3 only needs the chains it analyzed; this bounds the worst case.
RCSB_MAX_REQUESTS = 60

_PDB_ID_RE = re.compile(r"^[0-9][A-Za-z0-9]{3}$")
# An entry RCSB can be asked about: a 4-character PDB ID or an extended one.
_ENTRY_ID_RE = re.compile(r"^(?:[A-Za-z0-9]{4}|pdb_[A-Za-z0-9]{8})$", re.I)


def rcsb_entry_id(entry_id):
    """An entry ID as RCSB writes it: 1AKE, or pdb_1000AXYZ for an
    extended ID."""
    pid = str(entry_id or "").strip().upper()
    return "pdb_" + pid[4:] if pid.startswith("PDB_") else pid

_DOMAIN_INSTANCE_TYPES = ("CATH", "ECOD", "SCOP", "SCOP2_FAMILY", "SCOP2_SUPERFAMILY", "SCOP2B_SUPERFAMILY")
# Per-residue validation features RCSB publishes. Which of these exist
# varies by entry: for some entries RCSB lists no Ramachandran or rotamer
# residues even though the entry-wide summary reports a percentage, which is
# why unlisted_outlier_notes() says so rather than implying there are none.
_OUTLIER_TYPES = {
    "RAMACHANDRAN_OUTLIER": "ramachandran",
    "ROTAMER_OUTLIER": "rotamer",
    "RSRZ_OUTLIER": "rsrz",
    "CLASHES": "clashes",
    "ANGLE_OUTLIERS": "angle",
    "BOND_OUTLIERS": "bond",
}
# RSRZ is published as the value for every residue, not as a list of
# outliers. wwPDB defines an RSRZ outlier as a real-space fit Z-score
# greater than 2, which is the threshold applied here.
RSRZ_OUTLIER_THRESHOLD = 2.0


class _RcsbSession:
    def __init__(self, timeout):
        self.timeout = timeout
        self.requests = []
        self.raw = {}
        self.count = 0

    def get(self, path):
        """GET one Data API document. Returns (json_or_None, http_status)."""
        if self.count >= RCSB_MAX_REQUESTS:
            raise _RequestBudgetExceeded()
        self.count += 1
        url = f"{RCSB_DATA_API}/{path}"
        return self._record(url, self._fetch(url))

    def get_each(self, paths):
        """get() for each path in turn, as a generator. The documents are
        requested together, a few at a time, where this Python can start
        threads (PyMOL, ChimeraX; not the Astra3 Engine), since a structure
        with many chains otherwise waits on one small request per chain.

        Everything a caller can see is as if they were requested one after
        another: the order answers arrive in, what is recorded, the request
        limit, and the request at which a failure is raised. Only requests
        that would have been made anyway are sent, with one exception: when
        one fails, the few in flight beside it have gone out too; their
        answers are dropped unrecorded."""
        urls = [f"{RCSB_DATA_API}/{path}" for path in paths]
        ahead = urls[:max(0, RCSB_MAX_REQUESTS - self.count)]
        started = _start_together(self._fetch, ahead) if len(ahead) > 1 else None
        try:
            for k, url in enumerate(urls):
                if self.count >= RCSB_MAX_REQUESTS:
                    raise _RequestBudgetExceeded()
                self.count += 1
                yield self._record(url, started[k].result() if started else self._fetch(url))
        finally:
            # After a failure or an interrupt, what has not gone out is not
            # sent: with RCSB unreachable each request waits out its timeout.
            for request in started or ():
                request.cancel()

    def _fetch(self, url, parse=None, accept="application/json"):
        """One request, touching nothing shared (so several can run at
        once): (document, status, seconds), or the exception it ended in.
        parse turns the body into the document (JSON by default)."""
        req = urllib.request.Request(url, headers={
            "User-Agent": f"Astra3/{ASTRA3_VERSION}",
            "Accept": accept,
        })
        started = time.time()
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                body = resp.read()
                status = resp.status
            doc = parse(body) if parse else json.loads(body.decode("utf-8"))
        except Exception as e:  # noqa: BLE001 -- recorded and raised by _record, in the caller's order
            return e
        return doc, status, round(time.time() - started, 2)

    def get_validation_report(self, entry_id):
        """The Entry attributes of the entry's wwPDB validation report.
        Returns (attributes_or_None, http_status), counted and recorded like
        a Data API request."""
        if self.count >= RCSB_MAX_REQUESTS:
            raise _RequestBudgetExceeded()
        self.count += 1
        pid = str(entry_id).lower()
        url = f"{RCSB_FILES_HOST}/pub/pdb/validation_reports/{pid[1:3]}/{pid}/{pid}_validation.xml.gz"
        return self._record(url, self._fetch(url, parse=_report_entry_attributes, accept="application/xml"))

    def _record(self, url, outcome):
        if isinstance(outcome, urllib.error.HTTPError):
            self.requests.append({"url": url, "status": outcome.code})
            if outcome.code == 404:
                return None, 404
        if isinstance(outcome, Exception):
            raise outcome
        doc, status, seconds = outcome
        self.requests.append({"url": url, "status": status, "seconds": seconds})
        self.raw[url] = doc
        return doc, status


# Requests in flight at once: about what a browser allows itself per site.
RCSB_CONCURRENT_REQUESTS = 6


def _start_together(fetch, urls):
    """A future for fetch(url) for each url, several in flight at a time.
    None where this Python cannot start threads; the caller then asks one
    at a time."""
    try:
        from concurrent.futures import ThreadPoolExecutor
        pool = ThreadPoolExecutor(max_workers=min(RCSB_CONCURRENT_REQUESTS, len(urls)))
        started = [pool.submit(fetch, url) for url in urls]
    except (ImportError, RuntimeError):
        return None
    pool.shutdown(wait=False)   # nothing more is coming; its threads end with the last request
    return started


class _RequestBudgetExceeded(Exception):
    pass


def _first(value):
    if isinstance(value, list):
        return value[0] if value else None
    return value


def _num(value):
    try:
        return None if value is None else float(value)
    except (TypeError, ValueError):
        return None


def _validation_summary(entry):
    geometry = _first(entry.get("pdbx_vrpt_summary_geometry")) or {}
    diffraction = _first(entry.get("pdbx_vrpt_summary_diffraction")) or {}
    em = _first(entry.get("pdbx_vrpt_summary_em")) or {}
    summary = _first(entry.get("pdbx_vrpt_summary")) or {}
    refine = _first(entry.get("refine")) or {}
    values = {
        "clashscore": _num(geometry.get("clashscore")),
        "r_work": _num(refine.get("ls_R_factor_R_work") if refine.get("ls_R_factor_R_work") is not None
                       else refine.get("ls_R_factor_obs")),
        "r_free": _num(refine.get("ls_R_factor_R_free")),
        "percent_ramachandran_outliers": _num(geometry.get("percent_ramachandran_outliers")),
        "percent_rotamer_outliers": _num(geometry.get("percent_rotamer_outliers")),
        "percent_rsrz_outliers": _num(diffraction.get("percent_RSRZ_outliers")),
        "rfree_dcc": _num(diffraction.get("DCC_Rfree")),
        "q_score": _num(diffraction.get("Q_score") if diffraction.get("Q_score") is not None else em.get("Q_score")),
        "atom_inclusion_backbone": _num(em.get("atom_inclusion_backbone")),
        "report_creation_date": summary.get("report_creation_date"),
    }
    if all(v is None for k, v in values.items() if k != "report_creation_date"):
        return None
    return values


# Summary statistics the Data API sometimes leaves out (for some entries a
# value of zero is absent rather than 0.0): the Data API category that
# publishes each, and its attribute in the wwPDB validation report.
_REPORT_ATTRIBUTES = {
    "clashscore": ("pdbx_vrpt_summary_geometry", "clashscore"),
    "percent_ramachandran_outliers": ("pdbx_vrpt_summary_geometry", "percent-rama-outliers"),
    "percent_rotamer_outliers": ("pdbx_vrpt_summary_geometry", "percent-rota-outliers"),
    "percent_rsrz_outliers": ("pdbx_vrpt_summary_diffraction", "percent-RSRZ-outliers"),
}


def _report_entry_attributes(body):
    """The Entry element's attributes from a (gzipped) validation report."""
    if body[:2] == b"\x1f\x8b":
        body = gzip.decompress(body)
    entry = ElementTree.fromstring(body).find("Entry")
    return dict(entry.attrib) if entry is not None else None


def _fill_from_validation_report(values, entry, pid, session):
    """Fill the statistics the Data API left out from the wwPDB validation
    report, the source it copies them from. Asked for only when the API
    publishes that kind of summary for the entry but omits the value."""
    if not values:
        return
    missing = [key for key, (category, _attr) in _REPORT_ATTRIBUTES.items()
               if values.get(key) is None and entry.get(category)]
    if not missing:
        return
    try:
        attributes, _status = session.get_validation_report(pid)
    except (urllib.error.URLError, OSError, ValueError, ElementTree.ParseError):
        return      # the values stay unknown; nothing else depends on them
    if not attributes:
        return
    for key in missing:
        values[key] = _num(attributes.get(_REPORT_ATTRIBUTES[key][1]))
    values["filled_from_validation_report"] = [key for key in missing if values.get(key) is not None] or None


def _seq_to_auth(mapping, sequence_length=None):
    """Convert an entity sequence position to the author numbering.

    Microheterogeneity (one position modeled as two residue types, e.g. Pro22
    and Ser22 in crambin, PDB 1EJG) makes RCSB list that author number twice
    in auth_to_entity_poly_seq_mapping, while the features number positions
    along the one-letter sequence. Left uncorrected every position after the
    first such site shifts: 1EJG's Ile35 was reported as Ile33 and its domains
    ended at 44 instead of 46. Consecutive repeats of the same author number
    are collapsed when the mapping is longer than the sequence."""
    mapping = list(mapping or [])
    if sequence_length and len(mapping) > sequence_length:
        collapsed = []
        for value in mapping:
            if not collapsed or str(collapsed[-1]) != str(value):
                collapsed.append(value)
        if len(collapsed) == sequence_length:
            mapping = collapsed

    def convert(seq_id):
        try:
            idx = int(seq_id) - 1
        except (TypeError, ValueError):
            return None
        if mapping and 0 <= idx < len(mapping):
            return str(mapping[idx])
        return None
    return convert


def _positions_to_ranges(positions, to_auth):
    ranges = []
    for pos in positions or []:
        beg = to_auth(pos.get("beg_seq_id"))
        end = to_auth(pos.get("end_seq_id", pos.get("beg_seq_id")))
        if beg is None or end is None:
            continue
        ranges.append(beg if beg == end else f"{beg}-{end}")
    return ranges


def _outlier_residues(positions, to_auth, comp_ids=None):
    """One entry per flagged residue.

    RCSB merges consecutive flagged residues into a single position starting
    at beg_seq_id. The run's length is given by end_seq_id when present, and
    otherwise by the position's values array, which holds one value per
    residue (the same layout as RSRZ). Every residue in the run is listed, not
    only the first. Residue names come from the entity sequence; the position
    itself names only its first residue (beg_comp_id)."""
    out = []
    seen = set()
    for pos in positions or []:
        try:
            beg = int(pos.get("beg_seq_id"))
        except (TypeError, ValueError):
            continue
        end = beg
        try:
            if pos.get("end_seq_id") is not None:
                end = int(pos.get("end_seq_id"))
            elif isinstance(pos.get("values"), list) and pos["values"]:
                end = beg + len(pos["values"]) - 1
        except (TypeError, ValueError):
            end = beg
        for seq_id in range(beg, max(beg, end) + 1):
            auth = to_auth(seq_id)
            if auth is None or auth in seen:
                continue
            seen.add(auth)
            comp = comp_ids[seq_id - 1] if comp_ids and 0 < seq_id <= len(comp_ids) else None
            if seq_id == beg and pos.get("beg_comp_id"):
                comp = pos.get("beg_comp_id")
            out.append({"residue": comp or None, "residue_number": auth})
    return out


def _entity_comp_ids(entity):
    """The residue name at each entity sequence position (list index =
    position - 1). Modified residues keep their own component ID (MSE rather
    than the MET the canonical one-letter sequence would imply)."""
    poly = entity.get("entity_poly") or {}
    canonical = (poly.get("pdbx_seq_one_letter_code_can") or "").replace("\n", "").replace(" ", "")
    raw = (poly.get("pdbx_seq_one_letter_code") or "").replace("\n", "").replace(" ", "")
    ids = []
    for m in re.finditer(r"\(([^)]+)\)|([A-Za-z])", raw):
        ids.append(m.group(1).upper() if m.group(1) else _THREE_LETTER.get(m.group(2).upper()))
    if not ids or (canonical and len(ids) != len(canonical)):
        ids = [_THREE_LETTER.get(ch.upper()) for ch in canonical]
    return ids


# Domain databases as RCSB names their instance features, in the label the
# report shows. RCSB's "SCOP" features are SCOPe domains (sids such as
# d1erjc_); SCOP2 assignments arrive under their own SCOP2_* types.
_DOMAIN_LABELS = {"SCOP": "SCOPe"}


def _range_start(ranges):
    for r in ranges or []:
        m = re.match(r"^(-?\d+)", str(r))
        if m:
            return int(m.group(1))
    return float("inf")


def _sort_domains(domains):
    """Grouped by database in the order RCSB lists them, then by position
    along the chain, so repeated domains (e.g. WD40 blades) read in order."""
    # A discontinuous domain (e.g. SCOPe d1akea1: 1-121 and 157-214) can
    # arrive as one feature per segment; it is one domain, shown as one row.
    # Only SCOPe and ECOD IDs name a single domain in a single entry (d1akea1,
    # e1akeA1); Pfam, CATH and SCOP2 IDs name families, and repeats of one
    # family (the WD40 blades of 1ERJ) are separate domains that stay apart.
    merged, by_key = [], {}
    for dom in domains:
        key = (dom.get("database"), dom.get("id"))
        if dom.get("id") and dom.get("database") in ("SCOPe", "ECOD") and key in by_key:
            target = by_key[key]
            target["ranges"] = sorted(set(target.get("ranges") or []) | set(dom.get("ranges") or []), key=lambda r: _range_start([r]))
            continue
        dom = dict(dom, ranges=list(dom.get("ranges") or []))
        by_key[key] = dom
        merged.append(dom)
    first_seen = {}
    for dom in merged:
        first_seen.setdefault(dom.get("database"), len(first_seen))
    return sorted(merged, key=lambda d: (first_seen[d.get("database")], _range_start(d.get("ranges"))))


_THREE_LETTER = {"A": "ALA", "R": "ARG", "N": "ASN", "D": "ASP", "C": "CYS", "Q": "GLN", "E": "GLU", "G": "GLY",
                 "H": "HIS", "I": "ILE", "L": "LEU", "K": "LYS", "M": "MET", "F": "PHE", "P": "PRO", "S": "SER",
                 "T": "THR", "W": "TRP", "Y": "TYR", "V": "VAL"}


def _rsrz_outliers(positions, to_auth, seq=""):
    """RSRZ positions carry one value per residue over a run of residues
    starting at beg_seq_id. Residues above the wwPDB threshold are the
    outliers; the value is kept so the report can show it."""
    out = []
    for pos in positions or []:
        beg = pos.get("beg_seq_id")
        values = pos.get("values") or []
        if beg is None:
            continue
        try:
            beg = int(beg)
        except (TypeError, ValueError):
            continue
        for offset, value in enumerate(values):
            try:
                z = float(value)
            except (TypeError, ValueError):
                continue
            if z <= RSRZ_OUTLIER_THRESHOLD:
                continue
            auth = to_auth(beg + offset)
            if auth is not None:
                # RSRZ positions carry no residue names; the entity sequence does.
                one = seq[beg + offset - 1] if 0 < beg + offset <= len(seq) else None
                out.append({"residue": _THREE_LETTER.get(one) if one else None, "residue_number": auth,
                            "value": round(z, 2)})
    return out


def _uniprot_position(entity, seq_id, accession):
    for align in entity.get("rcsb_polymer_entity_align") or []:
        if (align.get("reference_database_name") or "").lower() != "uniprot":
            continue
        if accession and align.get("reference_database_accession") != accession:
            continue
        for region in align.get("aligned_regions") or []:
            beg = region.get("entity_beg_seq_id")
            ref = region.get("ref_beg_seq_id")
            length = region.get("length")
            if None in (beg, ref, length):
                continue
            if beg <= seq_id < beg + length:
                return ref + (seq_id - beg)
    return None


def _chain_annotations(entity, instance):
    ids = instance.get("rcsb_polymer_entity_instance_container_identifiers") or {}
    seq = ((entity.get("entity_poly") or {}).get("pdbx_seq_one_letter_code_can") or "").replace("\n", "")
    to_auth = _seq_to_auth(ids.get("auth_to_entity_poly_seq_mapping") or [], len(seq) if seq else None)
    ent_ids = entity.get("rcsb_polymer_entity_container_identifiers") or {}
    comp_ids = _entity_comp_ids(entity)

    uniprot = []
    for ref in ent_ids.get("reference_sequence_identifiers") or []:
        if (ref.get("database_name") or "").lower() == "uniprot":
            uniprot.append({
                "accession": ref.get("database_accession"),
                "reference_sequence_coverage": _num(ref.get("reference_sequence_coverage")),
                "entity_sequence_coverage": _num(ref.get("entity_sequence_coverage")),
            })
    primary_acc = uniprot[0]["accession"] if len(uniprot) == 1 else None

    domains = []
    uniprot_differences = []
    construct_artifacts = []
    for feat in entity.get("rcsb_polymer_entity_feature") or []:
        ftype = feat.get("type")
        if ftype == "Pfam":
            domains.append({"database": "Pfam", "id": feat.get("feature_id"), "name": feat.get("name"),
                            "ranges": _positions_to_ranges(feat.get("feature_positions"), to_auth)})
        elif ftype in ("mutation", "artifact"):
            for pos in feat.get("feature_positions") or []:
                beg = pos.get("beg_seq_id")
                end = pos.get("end_seq_id", beg)
                if beg is None:
                    continue
                for s in range(int(beg), int(end if end is not None else beg) + 1):
                    auth = to_auth(s)
                    record = {
                        "residue_number": auth,
                        "residue_one_letter": seq[s - 1] if 0 < s <= len(seq) else None,
                        "entity_position": s,
                    }
                    if ftype == "mutation":
                        record["uniprot_accession"] = primary_acc
                        record["uniprot_position"] = _uniprot_position(entity, s, primary_acc) if primary_acc else None
                        uniprot_differences.append(record)
                    else:
                        construct_artifacts.append(record)

    outliers = {v: [] for v in _OUTLIER_TYPES.values()}
    outliers.setdefault("rsrz", [])
    for feat in instance.get("rcsb_polymer_instance_feature") or []:
        ftype = feat.get("type")
        if ftype in _DOMAIN_INSTANCE_TYPES:
            domains.append({"database": _DOMAIN_LABELS.get(ftype, ftype.replace("_", " ")), "id": feat.get("feature_id"),
                            "name": feat.get("name"),
                            "ranges": _positions_to_ranges(feat.get("feature_positions"), to_auth)})
        elif ftype == "RSRZ":
            outliers["rsrz"].extend(_rsrz_outliers(feat.get("feature_positions"), to_auth, seq))
        elif ftype in _OUTLIER_TYPES:
            outliers[_OUTLIER_TYPES[ftype]].extend(_outlier_residues(feat.get("feature_positions"), to_auth, comp_ids))

    return {
        "entity_id": ids.get("entity_id"),
        "asym_id": ids.get("asym_id"),
        "description": (entity.get("rcsb_polymer_entity") or {}).get("pdbx_description"),
        "depositor_mutation_text": (entity.get("rcsb_polymer_entity") or {}).get("pdbx_mutation"),
        "uniprot": uniprot,
        "domains": _sort_domains(domains),
        "uniprot_differences": uniprot_differences,
        "construct_artifacts": construct_artifacts,
        "outliers": outliers,
        "numbering_mapped": bool(ids.get("auth_to_entity_poly_seq_mapping")),
    }


def fetch_rcsb_annotations(pdb_id, chains, timeout=RCSB_TIMEOUT_SECONDS):
    """Validation, UniProt mapping and domains for the analyzed chains.

    Returns a dict with 'status' one of:
      ok              everything requested was retrieved
      partial         some chains could not be retrieved (reason given)
      unavailable     RCSB could not be reached, or returned no entry
      not_applicable  the structure is not a PDB entry (e.g. an imported file)
    and '_raw', the retrieved documents keyed by URL, for saving with the run.
    """
    result = {
        "status": "unavailable",
        "reason": None,
        "source": "RCSB PDB Data API (data.rcsb.org)",
        "retrieved": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "entry_id": None,
        "validation": None,
        "chains": {},
        "requests": [],
        "_raw": {},
    }
    pid = (pdb_id or "").strip()
    if not _ENTRY_ID_RE.match(pid):
        result["status"] = "not_applicable"
        result["reason"] = "not a PDB entry (imported or locally supplied structure)"
        return result
    pid = rcsb_entry_id(pid)
    result["entry_id"] = pid
    wanted = [c for c in (chains or []) if c]

    session = _RcsbSession(timeout)
    try:
        entry, status = session.get(f"entry/{pid}")
        if entry is None:
            result["reason"] = f"RCSB has no entry {pid} (HTTP {status})"
            return result
        result["validation"] = _validation_summary(entry)
        _fill_from_validation_report(result["validation"], entry, pid, session)

        entity_ids = (entry.get("rcsb_entry_container_identifiers") or {}).get("polymer_entity_ids") or []
        remaining = set(wanted)
        for eid in entity_ids:
            if not remaining:
                break
            entity, _ = session.get(f"polymer_entity/{pid}/{eid}")
            if not entity:
                continue
            ids = entity.get("rcsb_polymer_entity_container_identifiers") or {}
            auth_chains = ids.get("auth_asym_ids") or []
            needed = [c for c in auth_chains if c in remaining]
            if not needed:
                continue
            asym_ids = list(ids.get("asym_ids") or [])
            # The label chain usually equals the author chain; try those first.
            asym_ids.sort(key=lambda a: (a not in needed, a))
            # Instances are asked for in this order until every needed chain
            # is found. An instance answers for one chain at most, so as many
            # as there are chains still missing are certain to be asked for,
            # and can be asked for together.
            asked = 0
            while asked < len(asym_ids) and remaining.intersection(needed):
                together = asym_ids[asked:asked + len(remaining.intersection(needed))]
                asked += len(together)
                for instance, _ in session.get_each([f"polymer_entity_instance/{pid}/{asym}" for asym in together]):
                    if not instance:
                        continue
                    auth = (instance.get("rcsb_polymer_entity_instance_container_identifiers") or {}).get("auth_asym_id")
                    if auth in remaining:
                        result["chains"][auth] = _chain_annotations(entity, instance)
                        remaining.discard(auth)
        if remaining:
            result["status"] = "partial"
            result["reason"] = "no RCSB annotation found for chain(s) " + ", ".join(sorted(remaining))
        else:
            result["status"] = "ok"
    except _RequestBudgetExceeded:
        result["status"] = "partial" if result["chains"] or result["validation"] else "unavailable"
        result["reason"] = f"stopped after {RCSB_MAX_REQUESTS} requests (very large entry)"
    except (urllib.error.URLError, OSError, ValueError) as e:
        reason = getattr(e, "reason", None) or e
        if result["chains"] or result["validation"]:
            result["status"] = "partial"
            result["reason"] = f"connection interrupted: {reason}"
        else:
            result["status"] = "unavailable"
            result["reason"] = f"could not reach RCSB ({reason})"
    finally:
        result["requests"] = session.requests
        result["_raw"] = session.raw
    return result


def save_annotation_records(session_dir, records):
    """Write everything a run's annotation sections were built from, including
    the raw RCSB responses, next to the run's other session files.

    records is [(structure ID, file annotations, RCSB result)] for every
    structure of the run. The file is written once and holds this run only:
    output folders are reused when the same structures are analyzed again,
    and what an earlier run left there is not this run's provenance."""
    try:
        os.makedirs(session_dir, exist_ok=True)
        path = os.path.join(session_dir, "Astra3_Annotation_Sources.json")
        sources = {}
        for structure_id, file_annotations, rcsb in records:
            sources[structure_id] = {
                "coordinate_file_declarations": file_annotations,
                "rcsb": {k: v for k, v in (rcsb or {}).items() if k != "_raw"},
                "rcsb_raw_responses": (rcsb or {}).get("_raw", {}),
            }
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(json.dumps(sources, indent=2, default=str))
        return path
    except Exception:  # noqa: BLE001 -- the provenance file is supplementary; never fail a run over it
        return None


# ------------------------------------------------------------
# Cross-checks: annotations against what the analysis measured
# ------------------------------------------------------------

def _residue_keys(items):
    keys = set()
    for chain, resi in items or []:
        keys.add((str(chain), str(resi)))
    return keys


def annotation_warnings(structure_id, file_annotations, rcsb, n_term, c_term, ligand_environment=None,
                        analyzed_chains=None, removed_chains=None):
    """Warnings for places where an annotation changes how a measured value
    should be read. Only concrete overlaps between an annotated residue and
    a residue Astra3 used are reported -- never general advice."""
    warnings = []
    identity_note = import_identity_warning((rcsb or {}).get("import_identity"))
    if identity_note:
        warnings.append(identity_note)
    analyzed = set(analyzed_chains or [])
    n_keys = _residue_keys(n_term)
    c_keys = _residue_keys(c_term)
    ligand_keys = set()
    for env in (ligand_environment or {}).values():
        for item in env.get("nearby_residues") or []:
            if isinstance(item, (list, tuple)) and len(item) >= 2:
                ligand_keys.add((str(item[0]), str(item[1])))
            elif isinstance(item, dict):
                ligand_keys.add((str(item.get("chain")), str(item.get("resi"))))

    def where(chain, number):
        places = []
        if (chain, number) in n_keys:
            places.append("the N-terminus window")
        if (chain, number) in c_keys:
            places.append("the C-terminus window")
        if (chain, number) in ligand_keys:
            places.append("a ligand's contact residues")
        return places

    # One warning per structure, chain and kind, listing the residues by
    # where they fall, rather than one line per residue.
    order = ["the N-terminus window", "the C-terminus window", "a ligand's contact residues"]
    place_label = {"the N-terminus window": "N-terminus window", "the C-terminus window": "C-terminus window",
                   "a ligand's contact residues": "ligand contact residues"}
    grouped = {}  # (chain, subject) -> {place: [items]}

    def add(chain, subject, places, item):
        slot = grouped.setdefault((chain, subject), {})
        for place in places:
            items = slot.setdefault(place, [])
            if item not in items:
                items.append(item)

    for diff in (file_annotations or {}).get("sequence_differences") or []:
        chain, number = diff.get("chain"), diff.get("residue_number")
        if not chain or not number or (analyzed and chain not in analyzed):
            continue
        places = where(chain, number)
        if not places:
            continue
        label = f"{diff.get('residue') or '?'}{number}"
        detail = diff.get("details") or diff.get("category")
        if diff.get("category") == "construct addition":
            add(chain, "residues that are not part of the native protein (declared by the depositor), so measurements "
                       "there describe the construct rather than the natural sequence", places, f"{label} ('{detail}')")
        else:
            add(chain, "residues that differ from the reference sequence (declared by the depositor)", places,
                f"{label} ('{detail}')")

    plural = {"ramachandran": "Ramachandran outliers", "rotamer": "side-chain rotamer outliers",
              "rsrz": "real-space fit (RSRZ) outliers", "clashes": "residues with steric clashes",
              "angle": "bond-angle outliers", "bond": "bond-length outliers"}
    for chain, ann in ((rcsb or {}).get("chains") or {}).items():
        for kind, residues in (ann.get("outliers") or {}).items():
            for res in residues:
                places = where(chain, res.get("residue_number"))
                if places:
                    add(chain, f"{plural.get(kind, kind)} in the wwPDB validation report", places,
                        f"{res.get('residue') or 'residue '}{res.get('residue_number')}")

    for (chain, subject), by_place in grouped.items():
        parts = [f"{place_label[p]}: {', '.join(by_place[p])}" for p in order if p in by_place]
        warnings.append(f"{structure_id} chain {chain}: {subject} -- " + "; ".join(parts) + ".")
    # Whether removing chains removed real partners, or keeping chains kept
    # crystal neighbours, changes how exposure and contacts read.
    _notes, assembly_warns = assembly_context((file_annotations or {}).get("assemblies"), analyzed_chains, removed_chains)
    warnings.extend(f"{structure_id}: {w}" for w in assembly_warns)
    return warnings


# ------------------------------------------------------------
# Plain-text report sections (Protein Information .txt)
# ------------------------------------------------------------

def _fmt(value, suffix=""):
    if value is None:
        return "Not reported"
    return f"{value:.2f}{suffix}" if isinstance(value, float) else f"{value}{suffix}"


def _fmt_r(value):
    """R-factors are conventionally given to three decimals; at two, 0.265
    and 0.266 read as a 0.01 disagreement."""
    return f"{value:.3f}" if isinstance(value, (int, float)) else "not reported"


def _metric_text(key, value, suffix=""):
    return _fmt_r(value) if key == "rfree_dcc" else f"{value:.2f}{suffix}"


def construct_gap_notes(refs):
    """Where one chain maps to non-adjacent stretches of the same reference
    sequence, the residues between them are not in the construct at all.
    They are absent by design, not unobserved, so they appear in no
    missing-residue list; this says so explicitly."""
    by_chain = {}
    for r in refs or []:
        m = re.match(r"^\s*(-?\d+)\s*-\s*(-?\d+)\s*$", str(r.get("reference_range") or ""))
        if not m or not r.get("chain") or not r.get("accession"):
            continue
        by_chain.setdefault((r["chain"], r["accession"]), []).append((int(m.group(1)), int(m.group(2))))
    notes = []
    for (chain, acc), spans in by_chain.items():
        spans.sort()
        for (a0, a1), (b0, b1) in zip(spans, spans[1:]):
            if b0 > a1 + 1:
                gap = f"{a1 + 1}" if b0 == a1 + 2 else f"{a1 + 1}-{b0 - 1}"
                notes.append(f"Chain {chain}: reference residues {gap} of {acc} are not part of the deposited "
                             f"construct (the chain maps to {a0}-{a1} and {b0}-{b1}). They are absent by design, "
                             f"not unobserved, so no missing-residue list includes them.")
    return notes


def depositor_r_values(validation, header_info=None):
    """(R-work, R-free) as the depositor reported them: RCSB's refinement
    record first, then the coordinate file's own header."""
    v = validation or {}
    hi = header_info or {}
    r_work, r_free = v.get("r_work"), v.get("r_free")
    if r_work is None:
        r_work = _num(hi.get("r_work"))
    if r_free is None:
        r_free = _num(hi.get("r_free"))
    return r_work, r_free


def rcsb_status_line(rcsb):
    if not rcsb:
        return "RCSB annotations: not retrieved."
    status = rcsb.get("status")
    if status == "ok":
        return f"Source: {rcsb.get('source')}, retrieved {_display_date(rcsb.get('retrieved'))}."
    if status == "partial":
        return f"Source: {rcsb.get('source')}, retrieved {_display_date(rcsb.get('retrieved'))} (incomplete: {rcsb.get('reason')})."
    if status == "not_applicable":
        return f"RCSB annotations: not applicable ({rcsb.get('reason')})."
    return f"RCSB annotations: unavailable ({rcsb.get('reason')})."


def text_validation_lines(rcsb):
    """The wwPDB validation metrics. A metric RCSB does not report for an
    entry is named and marked as not reported, never shown as zero or
    silently left out."""
    lines = []
    status = (rcsb or {}).get("status")
    v = (rcsb or {}).get("validation")
    if not v:
        reason = ("not reported for this entry" if status in ("ok", "partial")
                  else (rcsb or {}).get("reason") or "not retrieved")
        lines.append(f"wwPDB validation metrics: {reason}.")
        return lines
    lines.append("wwPDB validation report (via RCSB PDB; values describe the whole entry, all chains):")
    for key, label, suffix in (("clashscore", "Clashscore", ""),
                               ("percent_ramachandran_outliers", "Ramachandran outliers", "%"),
                               ("percent_rotamer_outliers", "Sidechain rotamer outliers", "%"),
                               ("percent_rsrz_outliers", "RSRZ outliers (real-space fit)", "%"),
                               ("rfree_dcc", "R-free recalculated by wwPDB (DCC)", ""),
                               ("q_score", "Q-score", ""),
                               ("atom_inclusion_backbone", "Backbone atom inclusion (EM)", "")):
        value = v.get(key)
        if value is None and key in ("q_score", "atom_inclusion_backbone"):
            continue  # method-specific: only shown when the entry has them
        if key == "rfree_dcc":
            r_work, r_free = depositor_r_values(v)
            if r_work is not None or r_free is not None:
                lines.append(f"  R-work / R-free (depositor): {_fmt_r(r_work)} / {_fmt_r(r_free)}")
        lines.append(f"  {label}: " + (_metric_text(key, value, suffix) if value is not None
                                       else "not reported for this entry by the wwPDB validation report"))
    if v.get("report_creation_date"):
        lines.append("  Validation report date: " + _display_date(str(v.get("report_creation_date"))[:10]))
    for chain, ann in sorted(((rcsb or {}).get("chains") or {}).items()):
        o = ann.get("outliers") or {}
        parts = []
        for kind, label in (("ramachandran", "Ramachandran"), ("rotamer", "rotamer"), ("rsrz", "RSRZ"),
                            ("clashes", "clash"), ("angle", "bond angle"), ("bond", "bond length")):
            items = o.get(kind) or []
            if items:
                parts.append(f"{label}: " + ", ".join(f"{i.get('residue') or ''}{i.get('residue_number')}" for i in items[:15])
                             + (f" (+{len(items) - 15} more)" if len(items) > 15 else ""))
        if parts:
            lines.append(f"  Chain {chain} outlier residues -- " + "; ".join(parts))
    for note in unlisted_outlier_notes(rcsb):
        lines.append("  " + note)
    lines.append("  " + rcsb_status_line(rcsb))
    return lines


def unlisted_outlier_notes(rcsb):
    """The validation summary covers the whole entry; the per-residue lists
    cover only the analyzed chains, and RCSB does not always include every
    outlier type per residue. Say so when a type has a nonzero summary but
    no residues listed, rather than letting the absence read as 'none'."""
    v = (rcsb or {}).get("validation") or {}
    chains = (rcsb or {}).get("chains") or {}
    notes = []
    for key, kind, label in (("percent_ramachandran_outliers", "ramachandran", "Ramachandran"),
                             ("percent_rotamer_outliers", "rotamer", "rotamer")):
        pct = v.get(key)
        if not pct:
            continue
        listed = sum(len((c.get("outliers") or {}).get(kind) or []) for c in chains.values())
        if listed == 0:
            notes.append(f"The entry-wide summary reports {pct:.2f}% {label} outliers, but RCSB's per-residue data "
                         f"for the analyzed chain(s) does not list them, so they are not shown here. The full wwPDB "
                         f"validation report names each one.")
    return notes


def text_mutation_lines(file_annotations, rcsb, analyzed_chains):
    lines = []
    analyzed = set(analyzed_chains or [])
    fa = file_annotations or {}
    refs = [r for r in fa.get("reference_sequences") or [] if not analyzed or r.get("chain") in analyzed]
    diffs = [d for d in fa.get("sequence_differences") or [] if not analyzed or d.get("chain") in analyzed]
    if not fa.get("available"):
        lines.append("Depositor sequence declarations: not available (coordinate file header not readable).")
    else:
        if refs:
            lines.append("Reference sequences declared by the depositor:")
            for r in refs:
                lines.append(f"  Chain {r.get('chain')}: {r.get('database') or '?'} {r.get('accession') or '?'}"
                             + (f" ({r.get('entry_name')})" if r.get("entry_name") else "")
                             + (f", structure residues {_display_ranges(r.get('structure_range'))}" if r.get("structure_range") else "")
                             + (f" = reference {_display_ranges(r.get('reference_range'))}" if r.get("reference_range") else ""))
            for note in construct_gap_notes(refs):
                lines.append("  " + note)
        else:
            lines.append("Reference sequences declared by the depositor: none.")
        if diffs:
            lines.append("Differences from the reference sequence, as declared by the depositor:")
            for d in diffs:
                ref = ""
                if d.get("reference_residue") or d.get("reference_number"):
                    ref = f" (reference {d.get('reference_residue') or '?'}{d.get('reference_number') or ''})"
                lines.append(f"  Chain {d.get('chain')}, {d.get('residue') or '-'}{d.get('residue_number') or ''}{ref}: "
                             f"{d.get('details') or 'no description'}")
        else:
            lines.append("Differences from the reference sequence declared by the depositor: none.")
        lines.append(f"  Source: {fa.get('source')}.")
    chains = (rcsb or {}).get("chains") or {}
    rcsb_diff_lines = []
    for chain, ann in sorted(chains.items()):
        for u in ann.get("uniprot_differences") or []:
            pos = f" (UniProt {u.get('uniprot_accession')} position {u.get('uniprot_position')})" if u.get("uniprot_position") else ""
            rcsb_diff_lines.append(f"  Chain {chain}, {u.get('residue_one_letter') or '?'}{u.get('residue_number') or '(unnumbered)'}{pos}")
    if (rcsb or {}).get("status") in ("ok", "partial"):
        if rcsb_diff_lines:
            lines.append("Residues RCSB PDB identifies as differing from UniProt:")
            lines.extend(rcsb_diff_lines)
        else:
            lines.append("Residues RCSB PDB identifies as differing from UniProt: none.")
        lines.append("  " + rcsb_status_line(rcsb))
    return lines


def text_domain_lines(rcsb):
    lines = []
    chains = (rcsb or {}).get("chains") or {}
    if (rcsb or {}).get("status") not in ("ok", "partial"):
        lines.append("Domain assignments: " + rcsb_status_line(rcsb).split(": ", 1)[-1])
        return lines
    any_domain = False
    for chain, ann in sorted(chains.items()):
        for d in ann.get("domains") or []:
            any_domain = True
            ranges = _display_ranges(", ".join(d.get("ranges") or [])) or "positions not mapped"
            lines.append(f"  Chain {chain}: {d.get('database')} {d.get('id') or ''} {d.get('name') or ''} -- residues {ranges}".replace("  --", " --"))
    if any_domain:
        lines.insert(0, "Domain assignments integrated by RCSB PDB (residue numbers as in the coordinate file):")
    else:
        lines.append("Domain assignments: none recorded by RCSB PDB for the analyzed chains.")
    lines.append("  " + rcsb_status_line(rcsb))
    return lines


# ------------------------------------------------------------
# Collection for a run
# ------------------------------------------------------------

try:
    from astra3_core import GREEN, YELLOW, RESET
except Exception:  # noqa: BLE001
    GREEN = YELLOW = RESET = ""

_EMPTY_FILE_ANNOTATIONS = {"reference_sequences": [], "sequence_differences": [], "source": None, "available": False}


# ------------------------------------------------------------
# Imported files that are PDB entries
# ------------------------------------------------------------

_IMPORT_FORMATS = {".pdb": "pdb", ".ent": "pdb", ".cif": "cif", ".mmcif": "cif"}
_IMPORT_MISSING_SOURCE = {"pdb": "PDB REMARK 465 (imported file)",
                          "cif": "mmCIF pdbx_unobs_or_zero_occ_residues (imported file)"}
# One answer per imported structure per command. Cleared at the start of each
# run, so an answer given for one analysis is never applied to a later one
# without being asked again.
_IMPORT_ENTRY_DECISIONS = {}


def reset_import_entry_decisions():
    """Clears the per-command answers. Called at the start of each run."""
    _IMPORT_ENTRY_DECISIONS.clear()


def entry_id_from_header(raw_text, fmt):
    """The PDB ID a coordinate file names for itself, or None: the HEADER
    record's idCode (columns 63-66) in PDB format, _entry.id in mmCIF."""
    text = raw_text or ""
    if fmt == "cif":
        m = re.search(r"^_entry\.id\s+['\"]?([0-9][A-Za-z0-9]{3}|pdb_[A-Za-z0-9]{8})['\"]?\s*$", text, re.M | re.I)
        return _file_entry_id(m.group(1)) if m else None
    for line in text.splitlines()[:5]:
        if line.startswith("HEADER"):
            candidate = line[62:66].strip()
            return candidate.upper() if _PDB_ID_RE.match(candidate) else None
    return None


def entry_id_from_filename(path):
    """A PDB ID used as the file name (3fxi.pdb, 3FXI.cif, pdb3fxi.ent)."""
    from astra3_core import structure_file_stem
    stem = structure_file_stem(path)
    m = re.match(r"^(?:pdb)?([0-9][A-Za-z0-9]{3})$|^(pdb_[A-Za-z0-9]{8})$", stem, re.I)
    return _file_entry_id(m.group(1) or m.group(2)) if m else None


def _file_entry_id(found):
    """An entry ID read from a file, its 4-character form when it has one."""
    from astra3_security import classic_pdb_id
    return classic_pdb_id(found) or rcsb_entry_id(found)


def confirm_import_entry(ast_id, file_label, entry_id, source, ask=input, say=print, check=None):
    """Ask whether an imported file is the PDB entry it appears to be, so the
    entry's public RCSB data can be used for it. Returns the confirmed ID or
    None. Nothing is sent anywhere unless the answer is yes."""
    key = (ast_id or file_label or "").upper()
    if key in _IMPORT_ENTRY_DECISIONS:
        return _IMPORT_ENTRY_DECISIONS[key]
    try:
        from astra3_core import format_yn_prompt, WHITE, YELLOW, RESET, BOLD
    except Exception:  # noqa: BLE001 -- plain text when run standalone
        format_yn_prompt = lambda: "(y/n)"  # noqa: E731
        WHITE = YELLOW = RESET = BOLD = ""
    evidence = "names itself as" if source == "header" else "is named after"
    say("-" * 50, flush=True)
    say(f"{BOLD}Imported File Matches a PDB Entry{RESET}", flush=True)
    say("-" * 50, flush=True)
    say(f"{ast_id or 'The imported structure'} ({file_label}) {evidence} PDB entry {entry_id}.", flush=True)
    say(f"If it is that entry, Astra3 can add {entry_id}'s public validation, reference-sequence and domain data "
        f"from RCSB PDB to the report. Only the ID {entry_id} is sent; the file never leaves this computer.", flush=True)
    say(f"{WHITE}If the file was edited, that data describes the deposited entry, not the edits.{RESET}", flush=True)
    answer = _ask_yn(f"Use RCSB data for {entry_id} in this analysis? {format_yn_prompt()}: ", ask, say, YELLOW, RESET)
    if not answer:
        say(f"{WHITE}Using only what the file itself contains.{RESET}", flush=True)
        _IMPORT_ENTRY_DECISIONS[key] = None
        return None
    # Checked now, while the person is here to act on it, rather than
    # discovered later as an empty report section.
    while True:
        status = (check or check_entry)(entry_id)
        if status == "ok":
            say(f"{WHITE}Treating {ast_id or file_label} as PDB entry {entry_id}.{RESET}", flush=True)
            _IMPORT_ENTRY_DECISIONS[key] = entry_id
            return entry_id
        if status == "not_found":
            say(f"{YELLOW}RCSB PDB has no entry {entry_id}, so there is no public data to add. Continuing with what "
                f"the file itself contains.{RESET}", flush=True)
            _IMPORT_ENTRY_DECISIONS[key] = None
            return None
        say(f"{YELLOW}RCSB PDB cannot be reached right now.{RESET}", flush=True)
        say(f"The imported structure still works offline: it is analyzed from the file as usual. What needs a "
            f"connection is {entry_id}'s public data -- validation metrics, reference sequence and domains -- and "
            f"checking that {entry_id} exists.", flush=True)
        say(f"{WHITE}Answering no continues now without that data.{RESET}", flush=True)
        retry = _ask_yn(f"Try again to reach RCSB for {entry_id}? {format_yn_prompt()}: ", ask, say, YELLOW, RESET,
                        max_attempts=None)
        if not retry:
            say(f"{WHITE}Continuing without RCSB data for {entry_id}.{RESET}", flush=True)
            # Not remembered: a later structure in this run may reach RCSB.
            return None


def _ask_yn(prompt, ask, say, yellow="", reset="", max_attempts=10):
    """True for y, False for n or an interrupted/unanswered prompt."""
    attempts = 0
    while max_attempts is None or attempts < max_attempts:
        attempts += 1
        say(prompt, end="", flush=True)
        try:
            choice = ask().strip().lower()
        except (KeyboardInterrupt, EOFError):
            say("", flush=True)
            return False
        if choice in ("y", "yes"):
            return True
        if choice in ("n", "no"):
            return False
        say(f"{yellow}Please answer y or n.{reset}", flush=True)
    return False


def check_entry(entry_id, timeout=RCSB_TIMEOUT_SECONDS):
    """'ok' when RCSB has the entry, 'not_found' when it does not, 'offline'
    when RCSB cannot be reached. Sends only the ID, like every other lookup."""
    url = f"{RCSB_DATA_API}/entry/{rcsb_entry_id(entry_id)}"
    req = urllib.request.Request(url, headers={"User-Agent": f"Astra3/{ASTRA3_VERSION}", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return "ok" if resp.status == 200 else "offline"
    except urllib.error.HTTPError as e:
        return "not_found" if e.code == 404 else "offline"
    except Exception:  # noqa: BLE001 -- DNS failure, timeout, refused: all mean unreachable
        return "offline"


def header_info_for_import(resolved, ask=input, say=print, check=None):
    """header_info for an imported structure.

    The file's own header is read locally (method, resolution, R-factors,
    missing residues, depositor assemblies and sequence declarations), which
    is what lets homomer reduction say whether other chains are partners.
    When the file names a PDB entry, the person is asked whether it is that
    entry; only then is RCSB contacted for it, as for a fetched structure.
    """
    info = {"method": "Imported", "resolution": "Not available", "r_work": "Not available",
            "r_free": "Not available", "missing_residues_map": None, "missing_residues_source": None}
    path = (resolved or {}).get("path")
    from astra3_core import structure_file_kind, read_structure_text, coordinate_file_record
    if path:
        info["coordinate_file"] = coordinate_file_record(path)
    fmt = structure_file_kind(path)
    if not path or fmt not in ("pdb", "cif"):
        return info  # e.g. a .pse session: no header to read
    try:
        raw = read_structure_text(path)
    except Exception:  # noqa: BLE001 -- unreadable header: analyze from coordinates only
        return info
    try:
        from astra3_core import parse_header, parse_header_cif, parse_remark_465, parse_missing_residues_cif
        header = parse_header_cif(raw) if fmt == "cif" else parse_header(raw)
        for key in ("method", "resolution", "r_work", "r_free"):
            value = header.get(key)
            if value and value != "Not found in header":
                info[key] = value
        # Only a file that carries the records can say what is missing; a
        # file without them (e.g. one PyMOL wrote) leaves this unknown.
        has_records = ("REMARK 465" in raw) if fmt == "pdb" else ("_pdbx_unobs_or_zero_occ_residues." in raw)
        if has_records:
            info["missing_residues_map"] = parse_missing_residues_cif(raw) if fmt == "cif" else parse_remark_465(raw)
            info["missing_residues_source"] = _IMPORT_MISSING_SOURCE[fmt]
    except Exception:  # noqa: BLE001 -- header data is supplementary for an import
        pass
    info["file_annotations"] = parse_file_annotations(raw, fmt)
    entry, source = entry_id_from_header(raw, fmt), "header"
    if not entry:
        entry, source = entry_id_from_filename(path), "file name"
    if entry:
        file_label = os.path.basename(str(path))
        ast_id = (resolved or {}).get("ast_id")
        confirmed = confirm_import_entry(ast_id, file_label, entry, source, ask=ask, say=say, check=check)
        if confirmed:
            info["rcsb_entry_id"] = confirmed
            info["import_entry_confirmed"] = {"ast_id": ast_id, "entry_id": confirmed, "file": file_label,
                                              "evidence": source}
    return info


def import_identity_warning(identity):
    """The report warning for an import the person identified as a PDB entry."""
    if not identity:
        return None
    who = identity.get("ast_id") or identity.get("file") or "The imported structure"
    entry = identity.get("entry_id")
    evidence = "header" if identity.get("evidence") == "header" else "file name"
    return (f"{who} ({identity.get('file')}): identified as PDB entry {entry} with user approval (from its {evidence}); "
            f"validation, reference-sequence and domain data in this report are RCSB PDB's records for {entry} as "
            f"deposited, and describe this file only as far as it is unedited.")


def collect_annotations(header_info, chains):
    """File declarations plus RCSB data for one analyzed structure.

    RCSB is contacted only for structures that were fetched by PDB ID
    (header_info['rcsb_entry_id'] is set when the download is parsed).
    """
    hi = header_info or {}
    file_ann = hi.get("file_annotations") or dict(_EMPTY_FILE_ANNOTATIONS)
    entry = hi.get("rcsb_entry_id")
    if entry:
        print(f"Retrieving validation and annotation data from RCSB for {entry}...", flush=True)
        rcsb = fetch_rcsb_annotations(entry, chains)
        if rcsb["status"] == "ok":
            print(f"{GREEN}Validation and annotation data retrieved for {entry}.{RESET}", flush=True)
        elif rcsb["status"] == "partial":
            print(f"{YELLOW}Annotation data for {entry} is incomplete: {rcsb['reason']}.{RESET}", flush=True)
        else:
            print(f"{YELLOW}Annotation data unavailable for {entry}: {rcsb['reason']}. "
                  f"Those report sections will say so.{RESET}", flush=True)
    else:
        rcsb = {"status": "not_applicable", "reason": "not a PDB entry (imported or locally supplied structure)",
                "source": "RCSB PDB Data API (data.rcsb.org)", "retrieved": None, "entry_id": None,
                "validation": None, "chains": {}, "requests": [], "_raw": {}}
    if hi.get("import_entry_confirmed"):
        rcsb["import_identity"] = hi["import_entry_confirmed"]
    return {"file": file_ann, "rcsb": rcsb}


def ensure_structure_annotations(d):
    """Annotations for one structure_data entry, collected once per run."""
    if d.get("annotations") is None:
        d["annotations"] = collect_annotations(d.get("header_info"), (d.get("process_result") or {}).get("chain_list"))
    return d["annotations"]


def _declared_accessions(ann, chains):
    accs = set()
    for chain in chains:
        for u in (((ann.get("rcsb") or {}).get("chains") or {}).get(chain) or {}).get("uniprot") or []:
            if u.get("accession"):
                accs.add(u["accession"])
    if not accs:
        for r in (ann.get("file") or {}).get("reference_sequences") or []:
            if r.get("chain") in chains and (r.get("database") or "").upper() in ("UNP", "UNIPROT") and r.get("accession"):
                accs.add(r["accession"])
    return accs


def _reference_start(ann, chains):
    """UniProt start of the modeled construct, when unambiguous."""
    starts = set()
    for r in (ann.get("file") or {}).get("reference_sequences") or []:
        if r.get("chain") in chains and r.get("reference_range"):
            head = re.match(r"^\s*(-?\d+)", str(r["reference_range"]))
            if head:
                starts.add(int(head.group(1)))
    return starts.pop() if len(starts) == 1 else None


_OFFSET_RE = re.compile(
    r"^(?P<pair>.+?), chain (?P<chain>\S+): (?P<term>[NC])-terminus window offset-corrected with user approval "
    r"\((?P<detail>[^)]*)\); coloring and numeric metrics reflect the corrected window\.$")


def consolidate_offset_warnings(warnings):
    """Merge the N- and C-terminus correction lines for the same pair and
    chain into one, keeping every other warning as it is and in order."""
    out, merged = [], {}
    for w in warnings or []:
        m = _OFFSET_RE.match(w or "")
        if not m:
            out.append(w)
            continue
        key = (m.group("pair"), m.group("chain"))
        if key not in merged:
            merged[key] = []
            out.append(key)
        merged[key].append((m.group("term"), m.group("detail")))
    result = []
    for item in out:
        if isinstance(item, tuple):
            parts = merged[item]
            if len(parts) == 1:
                term, detail = parts[0]
                result.append(f"{item[0]}, chain {item[1]}: {term}-terminus window offset-corrected with user approval "
                              f"({detail}); coloring and numeric metrics reflect the corrected window.")
            else:
                details = "; ".join(f"{t}-terminus: {d}" for t, d in sorted(parts))
                result.append(f"{item[0]}, chain {item[1]}: terminus windows offset-corrected with user approval "
                              f"({details}); coloring and numeric metrics reflect the corrected windows.")
        else:
            result.append(item)
    return result


def structure_annotation_warnings(structure_data, reference_obj=None):
    """Per-structure cross-checks plus, for multi-structure runs, the
    differences between structures that change how a comparison reads."""
    warnings = []
    for obj, d in structure_data.items():
        ann = d.get("annotations")
        if not ann:
            continue
        chains = (d.get("process_result") or {}).get("chain_list") or []
        removed = [(r.get("removed_chain") if isinstance(r, dict) else r[0]) for r in d.get("chain_reduction_applied") or []]
        warnings.extend(annotation_warnings(d.get("pdb_id") or obj, ann.get("file"), ann.get("rcsb"),
                                            d.get("n_term_residues"), d.get("c_term_residues"),
                                            d.get("ligand_environment"), chains, removed))

    if len(structure_data) > 1:
        ref_key = reference_obj if reference_obj in structure_data else next(iter(structure_data))
        ref = structure_data[ref_key]
        ref_ann = ref.get("annotations") or {}
        ref_chains = (ref.get("process_result") or {}).get("chain_list") or []
        ref_id = ref.get("pdb_id") or ref_key
        ref_accs = _declared_accessions(ref_ann, ref_chains)
        ref_start = _reference_start(ref_ann, ref_chains)
        mutated = {}
        for obj, d in structure_data.items():
            ann = d.get("annotations") or {}
            chains = (d.get("process_result") or {}).get("chain_list") or []
            eng = [f"{x.get('residue') or '?'}{x.get('residue_number') or ''}"
                   for x in (ann.get("file") or {}).get("sequence_differences") or []
                   if x.get("category") == "engineered mutation" and x.get("chain") in chains]
            mutated[d.get("pdb_id") or obj] = eng
            if obj == ref_key:
                continue
            sid = d.get("pdb_id") or obj
            accs = _declared_accessions(ann, chains)
            if ref_accs and accs and not (ref_accs & accs):
                warnings.append(f"{sid} and the reference {ref_id} map to different UniProt entries "
                                f"({', '.join(sorted(accs))} vs {', '.join(sorted(ref_accs))}); the comparison is between "
                                f"different proteins or isoforms, not two states of one protein.")
            start = _reference_start(ann, chains)
            if ref_start is not None and start is not None and start != ref_start and ref_accs & accs:
                warnings.append(f"{sid}'s modeled construct begins at UniProt residue {start} and {ref_id}'s at "
                                f"{ref_start}; first-residue terminus windows cover different parts of the protein "
                                f"unless offset-corrected.")
        with_mut = {k: v for k, v in mutated.items() if v}
        if with_mut and len(with_mut) < len(mutated):
            parts = [f"{k} ({', '.join(v[:6])}{'...' if len(v) > 6 else ''})" for k, v in with_mut.items()]
            warnings.append("Engineered mutations are declared for only some of the compared structures: "
                            + "; ".join(parts) + ". Differences near these residues may reflect the mutation.")
    seen = set()
    unique = []
    for w in warnings:
        if w not in seen:
            seen.add(w)
            unique.append(w)
    return unique


# ------------------------------------------------------------
# HTML report sections
# ------------------------------------------------------------

import html as _html


def _e(value):
    return _html.escape("" if value is None else str(value))


def _status_note(rcsb):
    return f"<p class='muted-note'>{_e(rcsb_status_line(rcsb))}</p>"


def html_validation_rows(ann, chains=None):
    """Rows for a Property/Value table (used in multi-structure blocks)."""
    rows_out = []
    assemblies = ((ann or {}).get("file") or {}).get("assemblies") or []
    home = assembly_for_chain(assemblies, (chains or [None])[0]) if chains else preferred_assembly(assemblies)
    if home:
        copies = f", {home['operators']} symmetry copies" if (home.get("operators") or 1) > 1 else ""
        rows_out.append(f"<tr><td>Biological assembly (depositor)</td><td>Assembly {_e(home.get('id'))}: "
                        f"{_e(_assembly_label(home))}, chains {_e(', '.join(home.get('chains') or []))}{_e(copies)}</td></tr>")
    return rows_out + _validation_rows(ann)


def _validation_rows(ann):
    rcsb = (ann or {}).get("rcsb") or {}
    v = rcsb.get("validation")
    if not v:
        reason = "Not available for this entry" if rcsb.get("status") in ("ok", "partial") else (rcsb.get("reason") or "Not retrieved")
        return [f"<tr><td>wwPDB validation</td><td>{_e(reason)}</td></tr>"]
    rows = []
    for key, label, suffix in (("clashscore", "Clashscore", ""),
                               ("percent_ramachandran_outliers", "Ramachandran outliers", "%"),
                               ("percent_rotamer_outliers", "Rotamer outliers", "%"),
                               ("percent_rsrz_outliers", "RSRZ outliers", "%")):
        if v.get(key) is not None:
            rows.append(f"<tr><td>{label} (wwPDB)</td><td>{v[key]:.2f}{suffix}</td></tr>")
    return rows


def html_annotation_section(d, tip=None, title_prefix=""):
    """The 'Validation & Sequence Annotations' section. Closed by default:
    it is long, and it is reference material rather than the result.

    tip, when given, is the report's info-bubble helper, so metrics carry
    their own explanation of what they are and how to read them.
    """
    info = tip if callable(tip) else (lambda key: "")
    ann = d.get("annotations") or {}
    rcsb = ann.get("rcsb") or {}
    fa = ann.get("file") or {}
    chains = (d.get("process_result") or {}).get("chain_list") or []
    out = [f"<details class='section'><summary><h2>{_e(title_prefix)}Validation &amp; Sequence Annotations</h2>"
           "<span class='chevron'></span></summary><div class='section-body'>"]

    assemblies = fa.get("assemblies") or []
    if assemblies:
        pref = preferred_assembly(assemblies)
        out.append("<h3 style='margin-top:0;'>Biological Assembly</h3>")
        out.append("<div class='table-wrap'><table><tr><th>Assembly</th><th>Oligomeric state</th><th>Defined by</th>"
                   "<th>Chains in the file</th><th>Symmetry copies</th></tr>")
        for a in assemblies:
            star = " (preferred)" if a is pref else ""
            out.append(f"<tr><td>{_e(a.get('id'))}{star}</td><td>{_e(a.get('oligomeric_details') or 'not stated')}</td>"
                       f"<td>{_e(a.get('defined_by') or 'not stated')}</td><td>{_e(', '.join(a.get('chains') or []))}</td>"
                       f"<td>{_e(a.get('operators', 1))}</td></tr>")
        out.append("</table></div>")
        removed = [(r.get("removed_chain") if isinstance(r, dict) else r[0]) for r in d.get("chain_reduction_applied") or []]
        notes, warns = assembly_context(assemblies, chains, removed)
        for line in notes + warns:
            out.append(f"<p class='muted-note'>{_e(line[0].upper() + line[1:])}</p>")
        out.append(f"<p class='muted-note'>Source: {_e(fa.get('assembly_source'))} in the coordinate file. "
                   f"Astra3 analyzes the deposited chains; it does not build the assembly.</p>")
    out.append("<h3>wwPDB Validation</h3>")
    v = rcsb.get("validation")
    if v:
        out.append("<div class='table-wrap'><table><tr><th>Metric</th><th>Value</th></tr>")
        for key, label, suffix, tip_key in (("clashscore", "Clashscore", "", "clashscore"),
                                            ("percent_ramachandran_outliers", "Ramachandran outliers", "%", "ramachandran_outliers"),
                                            ("percent_rotamer_outliers", "Side-chain rotamer outliers", "%", "rotamer_outliers"),
                                            ("percent_rsrz_outliers", "RSRZ outliers (real-space fit)", "%", "rsrz_outliers"),
                                            ("rfree_dcc", "R-free recalculated by wwPDB (DCC)", "", "rfree_dcc"),
                                            ("q_score", "Q-score", "", None),
                                            ("atom_inclusion_backbone", "Backbone atom inclusion (EM)", "", None)):
            value = v.get(key)
            if value is None and tip_key is None:
                continue  # method-specific: only shown when the entry has them
            if key == "rfree_dcc":
                r_work, r_free = depositor_r_values(v, d.get("header_info"))
                if r_work is not None or r_free is not None:
                    out.append(f"<tr><td>R-work / R-free (depositor){info('r_factors')}</td>"
                               f"<td>{_fmt_r(r_work)} / {_fmt_r(r_free)}</td></tr>")
            shown = (_metric_text(key, value, suffix) if value is not None
                     else "<span class='muted-note'>Not reported for this entry</span>")
            out.append(f"<tr><td>{label}{info(tip_key) if tip_key else ''}</td><td>{shown}</td></tr>")
        if v.get("report_creation_date"):
            out.append(f"<tr><td>Validation report date</td><td>{_e(_display_date(str(v['report_creation_date'])[:10]))}</td></tr>")
        out.append("</table></div>")
        entry_id = rcsb.get("entry_id")
        link = ""
        if entry_id and _PDB_ID_RE.match(str(entry_id)):
            url = f"https://files.rcsb.org/validation/view/{str(entry_id).lower()}_full_validation.pdf"
            link = (f" The <a href='{_e(url)}' target='_blank' rel='noopener'>full wwPDB validation report for "
                    f"{_e(str(entry_id).upper())}</a> lists every flagged residue.")
        out.append("<p class='muted-note'>These values describe the whole deposited entry (all chains), as published "
                   "by wwPDB. The residue lists below cover the analyzed chain(s) only." + link + "</p>")
        outlier_rows = []
        for chain, c in sorted((rcsb.get("chains") or {}).items()):
            for kind, label in (("ramachandran", "Ramachandran"), ("rotamer", "Rotamer"), ("rsrz", "RSRZ"),
                                ("clashes", "Clash"), ("angle", "Bond angle"), ("bond", "Bond length")):
                items = (c.get("outliers") or {}).get(kind) or []
                if items:
                    outlier_rows.append(f"<tr><td>{_e(chain)}</td><td>{label}</td><td>{len(items)}</td><td>"
                                        + _e(", ".join(f"{i.get('residue') or ''}{i.get('residue_number')}"
                                                       + (f" (Z {i['value']})" if i.get("value") is not None else "")
                                                       for i in items))
                                        + "</td></tr>")
        if outlier_rows:
            out.append("<div class='table-wrap'><table><tr><th>Chain</th><th>Outlier type</th><th>Count</th><th>Residues</th></tr>")
            out.extend(outlier_rows)
            out.append("</table></div>")
        for note in unlisted_outlier_notes(rcsb):
            out.append(f"<p class='muted-note'>{_e(note)}</p>")
    else:
        out.append("<p class='muted-note'>Validation metrics: "
                   + _e("not available for this entry" if rcsb.get("status") in ("ok", "partial") else (rcsb.get("reason") or "not retrieved"))
                   + ".</p>")

    out.append("<h3>Reference Sequence &amp; Mutations</h3>")
    refs = [r for r in fa.get("reference_sequences") or [] if not chains or r.get("chain") in chains]
    diffs = [x for x in fa.get("sequence_differences") or [] if not chains or x.get("chain") in chains]
    if not fa.get("available"):
        out.append("<p class='muted-note'>The coordinate file's sequence declarations were not available.</p>")
    else:
        if refs:
            out.append("<div class='table-wrap'><table><tr><th>Chain</th><th>Database</th><th>Accession</th><th>Structure residues</th><th>Reference residues</th></tr>")
            for r in refs:
                acc = _e(r.get("accession"))
                if (r.get("database") or "").upper() in ("UNP", "UNIPROT") and r.get("accession"):
                    acc = f"<a href='https://www.uniprot.org/uniprotkb/{_e(r['accession'])}/entry' target='_blank' rel='noopener'>{acc}</a>"
                out.append(f"<tr><td>{_e(r.get('chain'))}</td><td>{_e(r.get('database'))}</td><td>{acc}</td>"
                           f"<td>{_e(_display_ranges(r.get('structure_range')))}</td><td>{_e(_display_ranges(r.get('reference_range')))}</td></tr>")
            out.append("</table></div>")
            for note in construct_gap_notes(refs):
                out.append(f"<p class='muted-note'>{_e(note)}</p>")
        if diffs:
            out.append("<div class='table-wrap'><table><tr><th>Chain</th><th>Residue</th><th>Reference</th><th>Depositor's description</th></tr>")
            for x in diffs:
                ref = f"{x.get('reference_residue') or ''}{x.get('reference_number') or ''}" or "-"
                out.append(f"<tr><td>{_e(x.get('chain'))}</td><td>{_e((x.get('residue') or '-') + (x.get('residue_number') or ''))}</td>"
                           f"<td>{_e(ref)}</td><td>{_e(x.get('details') or 'not described')}</td></tr>")
            out.append("</table></div>")
        else:
            out.append("<p class='muted-note'>The depositor declares no differences from the reference sequence for the analyzed chains.</p>")
        out.append(f"<p class='muted-note'>Source: {_e(fa.get('source'))} in the coordinate file.</p>")
    unp_rows = []
    for chain, c in sorted((rcsb.get("chains") or {}).items()):
        for u in c.get("uniprot_differences") or []:
            pos = f"{u.get('uniprot_accession')} {u.get('uniprot_position')}" if u.get("uniprot_position") else "-"
            unp_rows.append(f"<tr><td>{_e(chain)}</td><td>{_e((u.get('residue_one_letter') or '?') + str(u.get('residue_number') or ''))}</td><td>{_e(pos)}</td></tr>")
    if rcsb.get("status") in ("ok", "partial"):
        if unp_rows:
            out.append("<p class='muted-note' style='margin-bottom:6px;'>Residues RCSB PDB identifies as differing from UniProt:</p>")
            out.append("<div class='table-wrap'><table><tr><th>Chain</th><th>Residue</th><th>UniProt position</th></tr>")
            out.extend(unp_rows)
            out.append("</table></div>")
        else:
            out.append("<p class='muted-note'>RCSB PDB identifies no residues differing from UniProt in the analyzed chains.</p>")

    out.append("<h3>Domains</h3>")
    out.append("<p class='muted-note' style='margin-top:0;'>Domain names are as each database provides them through "
               "RCSB PDB; Astra3 does not check or reinterpret them.</p>")
    dom_rows = []
    for chain, c in sorted((rcsb.get("chains") or {}).items()):
        for dom in c.get("domains") or []:
            dom_rows.append(f"<tr><td>{_e(chain)}</td><td>{_e(dom.get('database'))}</td><td>{_e(dom.get('id'))}</td>"
                            f"<td>{_e(dom.get('name'))}</td><td>{_e(_display_ranges(', '.join(dom.get('ranges') or [])) or 'not mapped')}</td></tr>")
    if dom_rows:
        out.append("<div class='table-wrap'><table><tr><th>Chain</th><th>Database</th><th>ID</th><th>Name</th><th>Residues</th></tr>")
        out.extend(dom_rows)
        out.append("</table></div>")
    elif rcsb.get("status") in ("ok", "partial"):
        out.append("<p class='muted-note'>No domain assignments are recorded by RCSB PDB for the analyzed chains.</p>")
    else:
        out.append("<p class='muted-note'>Domain assignments: " + _e(rcsb.get("reason") or "not retrieved") + ".</p>")
    out.append(_status_note(rcsb))
    out.append("</div></details>")
    return out


def html_methods_section(paragraphs, references):
    """Collapsed Methods section with a copy button, for the end of a report.

    The text to copy lives in the button's data attribute, not in a hidden
    element, so selecting and copying the page never picks up a second copy.
    References are written with their numbers so copied text keeps them."""
    text_lines = list(paragraphs)
    if references:
        text_lines.append("References")
        text_lines.extend(f"[{i}] {r}" for i, r in enumerate(references, start=1))
    plain = "\n\n".join(text_lines)
    out = ["<details class='section'><summary><h2>Methods</h2><span class='chevron'></span></summary><div class='section-body'>"]
    out.append("<p class='muted-note' style='margin-top:0;color:var(--astra-purple-dark);'>A description of exactly what Astra3 did in this run, "
               "for a paper's Methods section. Review it against your full protocol before publishing.</p>")
    for p in paragraphs:
        out.append(f"<p>{_e(p)}</p>")
    if references:
        out.append("<p style='margin-bottom:4px;'><strong>References</strong></p>")
        for i, r in enumerate(references, start=1):
            out.append(f"<p style='margin:2px 0;'>[{i}] {_e(r)}</p>")
    out.append("<button type='button' class='button' data-methods-text=\"" + _html.escape(plain, quote=True) + "\" "
               "onclick=\"(function(b){var t=b.getAttribute('data-methods-text');"
               "var done=function(){b.textContent='Copied';setTimeout(function(){b.textContent='Copy Methods text';},1600);};"
               "var fallback=function(){var a=document.createElement('textarea');a.value=t;a.style.position='fixed';a.style.opacity='0';"
               "document.body.appendChild(a);a.select();try{document.execCommand('copy');}catch(e){}document.body.removeChild(a);done();};"
               "if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(done,fallback);}else{fallback();}})(this)\">"
               "Copy Methods text</button>")
    out.append("</div></details>")
    return out

"""
Astra3: Methods text.

Builds a Methods paragraph a researcher can paste into a paper, from the
same recorded data the HTML, JSON and text reports are built from. Every
statement is conditional on something this run actually did or recorded:
a step that did not happen is not described, and a value that was not
recorded is not stated. Numbers that come from the analysis itself (cutoffs,
window sizes, image dimensions) are read from the constants the analysis
uses, so the text cannot drift from the code.
"""

import re

from astra3_core import ASTRA3_VERSION, engine_name, display_date, homomer_rule_method
from astra3_structure import TERMINUS_WINDOW

def _image_dimensions(image_quality):
    from astra3_render_report import image_dimensions
    return image_dimensions(image_quality)


# Cutoffs used by analyze_ligand_environment, report_disulfides and the ion
# coordination report in astra3_structure.py.
LIGAND_CONTACT_CUTOFF_A = 4.0
POLAR_CONTACT_CUTOFF_A = 3.5
DISULFIDE_CUTOFF_A = 2.5
ION_COORDINATION_CUTOFF_A = 2.6

REFERENCES = {
    "pdb": "Berman HM et al. (2000) The Protein Data Bank. Nucleic Acids Res 28:235-242.",
    "tien": "Tien MZ et al. (2013) Maximum allowed solvent accessibilites of residues in proteins. PLoS ONE "
            "8:e80635.",
    "levy": "Levy ED (2010) A simple definition of structural regions in proteins and its use in analyzing "
            "interface evolution. J Mol Biol 403:660-670.",
    "sun": "Sun Z et al. (2019) Utility of B-factors in protein science: interpreting rigidity, flexibility, and "
           "internal motion and engineering thermostability. Chem Rev 119:1626-1665.",
    "ramos": "Ramos NG et al. (2022) The reproducible normality of the crystallographic B-factor. Anal Biochem "
             "645:114594.",
    "rcsb": "Burley SK et al. (2025) Updated resources for exploring experimentally-determined PDB structures and "
            "Computed Structure Models at the RCSB Protein Data Bank. Nucleic Acids Res 53:D564-D574.",
    "kabsch": "Kabsch W (1976) A solution for the best rotation to relate two sets of vectors. Acta Cryst A32:922-923.",
    "chimerax": "Meng EC, Goddard TD, Pettersen EF, Couch GS, Pearson ZJ, Morris JH, Ferrin TE (2023) UCSF ChimeraX: "
                "Tools for structure building and analysis. Protein Sci 32:e4792.",
    "dssp": "Kabsch W, Sander C (1983) Dictionary of protein secondary structure: pattern recognition of "
            "hydrogen-bonded and geometrical features. Biopolymers 22:2577-2637.",
    "3dmol": "Rego N, Koes D (2015) 3Dmol.js: molecular visualization with WebGL. Bioinformatics 31:1322-1324.",
    "blosum": "Henikoff S, Henikoff JG (1992) Amino acid substitution matrices from protein blocks. Proc Natl Acad Sci "
              "USA 89:10915-10919.",
    "shrake": "Shrake A, Rupley JA (1973) Environment and exposure to solvent of protein atoms. Lysozyme and insulin. "
              "J Mol Biol 79:351-371.",
    "bondi": "Bondi A (1964) van der Waals volumes and radii. J Phys Chem 68:441-451.",
    "wwpdb_validation": "Gore S et al. (2017) Validation of structures in the Protein Data Bank. Structure 25:1916-1927.",
    "Pfam": "Mistry J et al. (2021) Pfam: The protein families database in 2021. Nucleic Acids Res 49:D412-D419.",
    "CATH": "Sillitoe I et al. (2021) CATH: increased structural coverage of functional space. Nucleic Acids Res 49:D266-D273.",
    "ECOD": "Cheng H et al. (2014) ECOD: an evolutionary classification of protein domains. PLoS Comput Biol 10:e1003926.",
    "SCOPe": "Chandonia JM et al. (2022) SCOPe: improvements to the structural classification of proteins - extended database to facilitate variant interpretation and machine learning. Nucleic Acids Res 50:D553-D559.",
    "SCOP2": "Andreeva A et al. (2020) The SCOP database in 2020: expanded classification of representative family and superfamily domains of known protein structures. Nucleic Acids Res 48:D376-D382.",
}


def _join(items):
    items = [i for i in items if i]
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    return ", ".join(items[:-1]) + " and " + items[-1]


def _is_placeholder(value):
    return value in (None, "") or str(value).strip().lower() in ("not found in header", "not available", "unknown")


_METHOD_NAMES = {
    "X-RAY DIFFRACTION": "X-ray diffraction",
    "ELECTRON MICROSCOPY": "electron microscopy",
    "SOLUTION NMR": "solution NMR",
    "SOLID-STATE NMR": "solid-state NMR",
    "NEUTRON DIFFRACTION": "neutron diffraction",
    "ELECTRON CRYSTALLOGRAPHY": "electron crystallography",
    "FIBER DIFFRACTION": "fiber diffraction",
}


def _method_phrase(hi):
    method = hi.get("method")
    res = hi.get("resolution")
    if _is_placeholder(method):
        return None
    key = str(method).strip().upper().replace("_", " ")
    phrase = _METHOD_NAMES.get(key, str(method).strip().lower())
    if not _is_placeholder(res):
        phrase += f", {res} Å resolution"
    return phrase


def _display_name(d):
    name = str(d.get("pdb_id") or "the structure")
    return name[:-len(" (imported)")] if name.endswith(" (imported)") else name


def _pymol_version():
    try:
        from astra3_render_report import get_pymol_version_string
        version = get_pymol_version_string()
    except Exception:  # noqa: BLE001
        return None
    return None if str(version).strip().lower() in ("", "not detected", "unknown") else version


def _engine_runtime():
    """"Python 3.14.2 and NumPy 2.4.6 in Pyodide 314.0.7" under the Astra3
    Engine."""
    try:
        from astra3_engine import runtime_text
        return runtime_text()
    except Exception:  # noqa: BLE001
        return "Python in WebAssembly"


def _reason_clause(reason):
    """A reference-selection reason as a mid-sentence clause: trailing period
    dropped and an ordinary leading word lowercased ("Automatically selected"),
    while an identifier such as 1XGD or AST-1789 keeps its case. A reason of
    two sentences (a ligand tie and what broke it) is joined with a semicolon,
    so the clause stays one sentence inside its parentheses."""
    text = str(reason).strip().rstrip(".")
    if len(text) > 1 and text[0].isupper() and text[1].islower():
        text = text[0].lower() + text[1:]
    text = re.sub(r"\. ([A-Z])(?=[a-z])", lambda m: "; " + m.group(1).lower(), text)
    return text


def _source_sentences(structures):
    """One sentence per retrieval (grouped by format and date), one for
    user-supplied files."""
    fetched = {}
    imported = []
    for d in structures:
        hi = d.get("header_info") or {}
        name = _display_name(d)
        if hi.get("fetched_format"):
            method = _method_phrase(hi)
            key = (hi.get("fetched_format"), hi.get("retrieved_at"))
            fetched.setdefault(key, []).append(f"{name} ({method})" if method else name)
        else:
            imported.append(name)
    out = []
    for (fmt, when), names in fetched.items():
        fmt_label = "mmCIF" if fmt == "cif" else "PDB"
        verb = "were" if len(names) > 1 else "was"
        out.append(f"{_join(names)} {verb} retrieved from the RCSB Protein Data Bank {{ref:pdb}}{{ref:rcsb}} in {fmt_label} format"
                   + (f" on {display_date(when)}" if when else ""))
    if imported:
        out.append(f"{_join(imported)} {'were' if len(imported) > 1 else 'was'} loaded from "
                   f"{'user-supplied coordinate files' if len(imported) > 1 else 'a user-supplied coordinate file'}")
    for d in structures:
        identity = (d.get("header_info") or {}).get("import_entry_confirmed")
        if identity:
            who = identity.get("ast_id") or _display_name(d)
            out.append(f"{who} was identified by the user as PDB entry {identity.get('entry_id')}, and RCSB PDB "
                       f"{{ref:pdb}} records for that entry were used for its validation, reference-sequence and "
                       f"domain annotations")
    return out


def _reduction_sentence(d):
    applied = d.get("chain_reduction_applied") or []
    pairs = []
    for item in applied:
        if isinstance(item, dict):
            pairs.append((item.get("removed_chain"), item.get("kept_chain")))
        elif isinstance(item, (list, tuple)) and len(item) == 2:
            pairs.append((item[0], item[1]))
    metrics = d.get("reduction_metrics") or {}
    pid = _display_name(d)
    rule = d.get("homomer_rule") or {}
    reduced = [c for c in rule.get("clusters") or [] if c.get("removed")]
    if pairs:
        removed = sorted({r for r, _k in pairs if r})
        kept = sorted({k for c in reduced for k in c["kept"]} if reduced else {k for _r, k in pairs if k})
        how = " and ".join(dict.fromkeys(homomer_rule_method(rule, c) for c in reduced)) or "with the user's approval"
        stats = []
        if metrics.get("identity"):
            stats.append(f"{float(metrics['identity']) * 100:.1f}% sequence identity")
        if metrics.get("coverage"):
            stats.append(f"{float(metrics['coverage']) * 100:.1f}% coverage")
        stat_text = f" ({_join(stats)})" if stats else ""
        return (f"Chain{'s' if len(removed) > 1 else ''} {_join(removed)} of {pid} "
                f"{'were' if len(removed) > 1 else 'was'} identified as {'copies' if len(removed) > 1 else 'a copy'} "
                f"of chain {_join(kept)}{stat_text} and removed {how}, so {pid} was analyzed as "
                f"chain {_join(kept)} only.")
    if d.get("reduction_used") and metrics.get("recommended_chain"):
        return f"{pid} was reduced to chain {metrics['recommended_chain']} (identical chains removed with the user's approval)."
    return None


def _structure_processing_sentences(d):
    pr = d.get("process_result") or {}
    out = []
    removed = pr.get("water_removed")
    detected = pr.get("water_detected")
    if isinstance(removed, int) and removed > 0:
        if isinstance(detected, int) and detected == removed:
            out.append(f"All {removed} water molecules were removed.")
        else:
            out.append(f"{removed} water molecules were removed.")
    ligands = sorted({l.get("resn") for l in pr.get("ligand_info") or [] if l.get("resn")})
    ions = sorted({i.get("resn") for i in pr.get("ion_info") or [] if i.get("resn")})
    if ligands:
        out.append(f"Bound ligands ({_join(ligands)}) were identified from hetero groups; protein residues with any "
                   f"atom within {LIGAND_CONTACT_CUTOFF_A:.1f} Å of a ligand were recorded as its contact residues, and "
                   f"ligand-protein nitrogen/oxygen pairs within {POLAR_CONTACT_CUTOFF_A:.1f} Å as possible polar "
                   f"contacts (geometric criteria only).")
    if ions:
        out.append(f"Ions ({_join(ions)}) were identified, with protein N/O/S atoms within "
                   f"{ION_COORDINATION_CUTOFF_A:.1f} Å reported as coordinating atoms.")
    nucleic = _nucleic_text(pr)
    if nucleic:
        out.append(f"Nucleic-acid chains ({nucleic}) were kept in the model; terminus selection and residue "
                   f"counts cover protein chains only.")
    return out


def _nucleic_text(pr):
    """"I and J, DNA" for a process result's nucleic-acid chains, or ""."""
    nucleic = pr.get("nucleic_acid_chains") or {}
    if not nucleic:
        return ""
    kinds = sorted({v["type"] for v in nucleic.values()})
    return f"{_join(list(nucleic))}, {_join(kinds)}"


def _merged_processing_sentences(structures):
    """Processing sentences for several structures. Each criterion is stated
    once, with the structures it applies to named inside it, so a count or a
    ligand list is never left without the structure it belongs to."""
    out = []
    water = []
    all_complete = True
    ligand_parts = []
    ion_parts = []
    nucleic_parts = []
    for d in structures:
        pr = d.get("process_result") or {}
        name = _display_name(d)
        removed = pr.get("water_removed")
        detected = pr.get("water_detected")
        if isinstance(removed, int) and removed > 0:
            water.append(f"{name}, {removed}")
            if not (isinstance(detected, int) and detected == removed):
                all_complete = False
        ligands = sorted({l.get("resn") for l in pr.get("ligand_info") or [] if l.get("resn")})
        ions = sorted({i.get("resn") for i in pr.get("ion_info") or [] if i.get("resn")})
        if ligands:
            ligand_parts.append(f"{name}: {_join(ligands)}")
        if ions:
            ion_parts.append(f"{name}: {_join(ions)}")
        if _nucleic_text(pr):
            nucleic_parts.append(f"{name}: {_nucleic_text(pr)}")
    if water:
        lead = ("All water molecules were removed" if all_complete
                else "Water molecules were removed")
        out.append(f"{lead} ({'; '.join(water)}).")
    if ligand_parts:
        out.append(f"Bound ligands were identified from hetero groups ({'; '.join(ligand_parts)}); protein residues "
                   f"with any atom within {LIGAND_CONTACT_CUTOFF_A:.1f} Å of a ligand were recorded as its contact "
                   f"residues, and ligand-protein nitrogen/oxygen pairs within {POLAR_CONTACT_CUTOFF_A:.1f} Å as "
                   f"possible polar contacts (geometric criteria only).")
    if ion_parts:
        out.append(f"Ions were identified ({'; '.join(ion_parts)}), with protein N/O/S atoms within "
                   f"{ION_COORDINATION_CUTOFF_A:.1f} Å reported as coordinating atoms.")
    if nucleic_parts:
        out.append(f"Nucleic-acid chains were kept in the models ({'; '.join(nucleic_parts)}); terminus "
                   f"selection and residue counts cover protein chains only.")
    return out


def _annotation_sentences(structure_data):
    """What validation/annotation data was used, and from where."""
    out = []
    refs = []
    rcsb_ok = []
    dates = set()
    report_dates = set()
    dbs = set()
    file_decl = False
    for d in structure_data.values():
        ann = d.get("annotations") or {}
        rcsb = ann.get("rcsb") or {}
        if (ann.get("file") or {}).get("available"):
            file_decl = True
        if rcsb.get("status") in ("ok", "partial"):
            rcsb_ok.append(d.get("pdb_id"))
            if rcsb.get("retrieved"):
                dates.add(str(rcsb["retrieved"]))
            v = rcsb.get("validation") or {}
            if v.get("report_creation_date"):
                report_dates.add(str(v["report_creation_date"])[:10])
            for chain in (rcsb.get("chains") or {}).values():
                for dom in chain.get("domains") or []:
                    db = (dom.get("database") or "").split(" ")[0]
                    # SCOPe (classic sids such as d1erjc_) and SCOP2 are
                    # separate classifications with separate citations.
                    if db in ("SCOP", "SCOPe"):
                        db = "SCOPe"
                    elif db.startswith("SCOP2"):
                        db = "SCOP2"
                    if db:
                        dbs.add(db)
    if rcsb_ok:
        shown = list(dict.fromkeys(display_date(d) for d in sorted(dates)))
        when = f", retrieved {_join(shown)}" if shown else ""
        out.append(f"Validation metrics (clashscore, Ramachandran and side-chain rotamer outliers, and real-space fit "
                   f"outliers where applicable) were taken from the wwPDB validation report {{ref:wwpdb_validation}}"
                   f"{' dated ' + _join([display_date(d) for d in sorted(report_dates)]) if report_dates else ''}, and UniProt mappings"
                   f"{' and domain assignments (' + _join([db + ' {ref:' + db + '}' for db in sorted(dbs)]) + ')' if dbs else ''} from the RCSB PDB Data API{when}.")
        refs.append("wwpdb_validation")
        refs.extend(sorted(dbs))
    if file_decl:
        out.append("Differences between the modeled sequence and its reference sequence are reported as declared by the "
                   "depositor in the coordinate file (SEQADV or _struct_ref_seq_dif records).")
    return out, refs


def _in_chain_sentences(structures):
    """How residues built into a chain without a standard backbone
    (chromophores) were treated, as the person chose."""
    out = []
    for counted_as in ("protein", "ligand"):
        named = [f"{r['resn']} {r['resi']} of {_display_name(d)}" for d in structures
                 for r in ((d.get("process_result") or {}).get("in_chain_residues") or [])
                 if r["counted_as"] == counted_as]
        if named:
            one = len(named) == 1
            treated = ("counted as part of the protein" if counted_as == "protein"
                       else "treated as a ligand" if one else "treated as ligands")
            out.append(f"{_join(named)}, built into the protein chain without a standard backbone, "
                       f"{'was' if one else 'were'} {treated}.")
    return out


def build_methods_text(mode, structure_data, command_str=None, run_parameters=None,
                       reference_id=None, reference_reason=None, warnings_list=None, superposed_ids=None):
    """Return (methods_paragraphs, references) for this run.

    mode: "single", "overlay" or "termini". superposed_ids, if given, names
    the structures that were superposed on the reference; the others are
    left out of the superposition sentence.
    """
    run_parameters = run_parameters or {}
    structures = list(structure_data.values())
    paragraphs = []

    sources = _source_sentences(structures)
    pymol = _pymol_version()
    chimerax = engine_name() == "ChimeraX"
    own_engine = engine_name() == "Astra3 Engine"
    if chimerax:
        software = f"Astra3 v{ASTRA3_VERSION} with UCSF ChimeraX{(' ' + pymol) if pymol else ''} {{ref:chimerax}}"
    elif own_engine:
        software = f"Astra3 v{ASTRA3_VERSION} with the Astra3 Engine ({_engine_runtime()})"
    else:
        software = f"Astra3 v{ASTRA3_VERSION}" + (f" with PyMOL {pymol} (Schrödinger, LLC)" if pymol else " with PyMOL (Schrödinger, LLC)")
    # Each source sentence opens with a structure name, kept as written:
    # capitalising it would turn a file such as y.cif into "Y.cif".
    first = (". ".join(sources) + ". ") if sources else ""
    p1 = f"{first}{'The structure was' if len(structures) == 1 else 'Structures were'} analyzed with {software}."
    paragraphs.append(p1)

    p2 = []
    for d in structures:
        r = _reduction_sentence(d)
        if r:
            p2.append(r)
    per_structure = [_structure_processing_sentences(d) for d in structures]
    if len(structures) == 1:
        p2.extend(per_structure[0])
    else:
        p2.extend(_merged_processing_sentences(structures))
    from astra3_structure import PROTEIN_MIN_CHAIN_LENGTH
    p2.extend(_in_chain_sentences(structures))
    ensembles = [f"{_display_name(d)} ({d['models_in_file']} models)" for d in structures
                 if (d.get("models_in_file") or 1) > 1]
    if ensembles:
        p2.append(f"For {_join(ensembles)}, deposited as an ensemble of models, only the first model was analyzed.")
    excluded = [f"chain {e['chain']} of {_display_name(d)} ({e['residues']} resolved residues)"
                for d in structures for e in ((d.get("process_result") or {}).get("excluded_short_chains") or [])]
    excluded_text = (f"; {_join(excluded)} {'was' if len(excluded) == 1 else 'were'} excluded from terminus "
                     f"selection as shorter than {PROTEIN_MIN_CHAIN_LENGTH} residues" if excluded else "")
    p2.append(f"N- and C-terminal regions were defined as the first and last {TERMINUS_WINDOW} resolved residues of "
              f"each protein chain{excluded_text}. Disulfide bonds were identified as cysteine SG-SG distances of "
              f"{DISULFIDE_CUTOFF_A:.1f} Å or less. "
              + ("Secondary structure is as assigned by ChimeraX on loading (the file's helix and sheet records "
                 "when present, otherwise DSSP {ref:dssp})." if chimerax else
                 "Secondary structure is the file's helix and sheet records when present, otherwise DSSP "
                 "{ref:dssp}." if own_engine else
                 "Secondary structure is as assigned by PyMOL on loading (the file's helix and sheet records "
                 "when present, otherwise PyMOL's DSS algorithm)."))
    paragraphs.append(" ".join(p2))

    if mode == "overlay" and len(structures) > 1 and superposed_ids != set():
        ref = (reference_id[:-len(" (imported)")] if reference_id and reference_id.endswith(" (imported)") else reference_id) or "the reference structure"
        reason = f" ({_reason_clause(reference_reason)})" if reference_reason else ""
        others = [_display_name(d) for d in structures if d.get("pdb_id") != reference_id
                  and (superposed_ids is None or d.get("pdb_id") in superposed_ids)]
        paragraphs.append(
            f"{_join(others)} {'were' if len(others) > 1 else 'was'} superposed onto {ref}{reason} by least-squares "
            f"fitting {{ref:kabsch}} of matching protein atoms in residues paired by sequence alignment of the chains' "
            f"full sequences, unobserved residues included (BLOSUM62 "
            f"{{ref:blosum}}, affine gap penalties), with up to 5 cycles rejecting atom pairs further apart than "
            f"2.0 × RMSD. RMSD values are reported over the atoms retained.")
    elif mode == "termini" and len(structures) > 1 and superposed_ids != set():
        ref = (reference_id[:-len(" (imported)")] if reference_id and reference_id.endswith(" (imported)") else reference_id) or "the reference structure"
        reason = f" ({_reason_clause(reference_reason)})" if reference_reason else ""
        others = [_display_name(d) for d in structures if d.get("pdb_id") != reference_id
                  and (superposed_ids is None or d.get("pdb_id") in superposed_ids)]
        from astra3_structure import TPV_WINDOW, AUTO_MATCH_MIN_IDENTITY
        corrected = any("offset-corrected" in (w or "") for w in (warnings_list or []))
        auto_corrected = any("offset-corrected automatically" in (w or "") for w in (warnings_list or []))
        half = TERMINUS_WINDOW // 2
        how = (f"automatically where the terminal sequences matched at {AUTO_MATCH_MIN_IDENTITY * 100:.0f}% "
               f"identity or higher" if auto_corrected else "with the user's approval")
        paragraphs.append(
            f"The termini of {_join(others)} were compared with those of {ref}{reason} after superposition by "
            f"least-squares fitting {{ref:kabsch}} of matching protein atoms in residues paired by sequence alignment "
            f"of the chains' full sequences, unobserved residues included (BLOSUM62 "
            f"{{ref:blosum}}), with up to 5 cycles rejecting atom pairs further apart than 2.0 × RMSD. For each terminus, Astra3 reports the displacement of the terminal Cα atom; the "
            f"displacement of the centroid of the outermost {half} Cα atoms; the change in orientation of the terminal "
            f"segment, as the angle between vectors from the centroid of the outermost {half} Cα atoms to that of the "
            f"next {half}; the change in the terminal projection vector, from the centroid of the {TPV_WINDOW - 1} Cα "
            f"atoms adjacent to the terminal residue to the terminal Cα; the Cα RMSD over the {TERMINUS_WINDOW}-residue "
            f"window, both in place after superposition and after superposing the window alone; the change in "
            f"solvent-accessible surface area (Shrake-Rupley {{ref:shrake}}, 1.4 Å probe, Bondi radii {{ref:bondi}}; "
            f"hydrogens and unobserved atoms excluded); and the change in normalized "
            f"B-factor (the window's mean B-factor divided by that of the whole protein as deposited; B-factors are compared "
            f"normalized because raw values are not reproducible between datasets {{ref:ramos}}). These are geometric "
            f"measurements on aligned coordinates. Changes in solvent-accessible surface area of 26 Å² or less (a "
            f"quarter of glycine's maximum accessible surface {{ref:tien}}, enough to move even glycine across the "
            f"25% relative-accessibility boundary between surface and interior residues {{ref:levy}}) and changes in "
            f"normalized B-factor of 0.2 or less (about 10% in RMS displacement, since B = 8π²⟨u²⟩ {{ref:sun}}) are "
            f"reported as little change. Both cut-offs are Astra3's, derived from these values."
            + (f" Where the terminal residues of a structure were offset relative to the reference, the comparison "
               f"window was shifted to matching residues {how}." if corrected else ""))

    ann_sentences, ann_refs = _annotation_sentences(structure_data)
    if ann_sentences:
        paragraphs.append(" ".join(ann_sentences))

    if run_parameters.get("images_rendered"):
        w, h = _image_dimensions(run_parameters.get("image_quality") or "medium")
        how = ("rendered in ChimeraX" if chimerax else "rendered with 3Dmol.js {ref:3dmol}" if own_engine
               else "ray-traced in PyMOL")
        paragraphs.append(f"Images were {how} at {w} × {h} pixels from six orthogonal viewpoints.")

    # Number references in order of first citation; list only cited ones.
    import re as _re
    order = []
    for p in paragraphs:
        for key in _re.findall(r"\{ref:([A-Za-z0-9_]+)\}", p):
            if key in REFERENCES and key not in order:
                order.append(key)
    numbered = []
    for p in paragraphs:
        numbered.append(_re.sub(r"\{ref:([A-Za-z0-9_]+)\}",
                                lambda m: f"[{order.index(m.group(1)) + 1}]" if m.group(1) in order else "", p))
    # Adjacent citations read as one bracket: [1, 2] rather than [1][2].
    paragraphs = [_re.sub(r"\]\[", ", ", p) for p in numbered]
    ordered_refs = [REFERENCES[k] for k in order]
    return paragraphs, ordered_refs


def methods_plain_text(paragraphs, references, command_str=None, generated=None):
    lines = []
    lines.append("METHODS (generated by Astra3 v" + ASTRA3_VERSION + (", " + generated if generated else "") + ")")
    lines.append("")
    for p in paragraphs:
        lines.append(p)
        lines.append("")
    if references:
        lines.append("References")
        for i, r in enumerate(references, start=1):
            lines.append(f"[{i}] {r}")
        lines.append("")
    if command_str:
        lines.append(f"Astra3 command: {command_str}")
    lines.append("Review this text against your own protocol before publishing; it describes only what Astra3 did.")
    return "\n".join(lines) + "\n"

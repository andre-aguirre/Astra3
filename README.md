# Astra3 for macOS

**Structural Analysis Toolkit for PDB Rendering Automation**

Version 2.0.1 · macOS 12 or later · universal (Intel and Apple Silicon)

[Website](https://andre-aguirre.github.io/Astra3/) ·
[Documentation](https://andre-aguirre.github.io/Astra3/docs/) ·
[Download](https://andre-aguirre.github.io/Astra3/download/) ·
[Changelog](https://andre-aguirre.github.io/Astra3/changelog/)

Astra3 automates the structure work otherwise repeated by hand in PyMOL or
UCSF ChimeraX. Give it a PDB ID or a local file, and it fetches the
structure, removes water, colours and labels every chain, ligand and ion
the same way each time, measures what the coordinates allow, renders six
views, and writes a report of what it found and what it could not.

It can also:

- **Overlay** structures on a reference, with RMSD and a pairwise RMSD
  matrix
- **Compare termini**: how far each N- and C-terminus moved and how much
  it turned, with close-up images
- **Batch** a list of structures without stopping for each one
- **Find related structures** of the same protein in the PDB

Everything is done from the app; the same commands also work in its
Advanced Console.

---

## What's new in 2.0.1

- **Three engines.** Astra3 runs with UCSF ChimeraX as well as PyMOL, and
  its own Astra3 Engine runs on computers with neither. All
  three run the same analysis code.
- **Measured by Astra3.** Superposition and surface area are computed by
  Astra3, so they no longer depend on the engine. Surface areas can differ
  by a few Å² from earlier versions, which used PyMOL's estimate.
- **Input files on record.** Each report gives every coordinate file's
  name, size and SHA-256.
- **Drawing window.** Images can be listed in a window as they are made
  (Settings > Drawing window).
- **Color Palette** page for the colours of chains, ligands, ions, termini
  and close-up arrows.
- **PyMOL sessions** import under every engine, read without PyMOL; a file
  holding anything but session data is refused unopened.
- **Checked input.** `.ent` and gzip-compressed files import. Empty,
  binary, truncated or misnamed files, and files of only water or only
  ligands, are refused with the reason. Extended IDs (`pdb_00001ake`)
  work, and a failed download says whether the entry does not exist or
  RCSB could not be reached.
- **Low sequence identity** brings a warning and, if you continue, a
  superposition of the closest pair instead of a stop.
- **Quick View** on the 3D Viewer page opens a PDB entry, or a file
  imported this session, without running an analysis.
- **Biological assembly rule** for redundant chains in Batch: keep the
  chains of the depositor's preferred assembly (one chain of a monomer,
  both of a dimer), with a fallback for entries whose assembly records
  cannot decide. Every report states the rule that decided.
- **Reports** list DNA and RNA chains, count repeated ligands and ions
  (`MN × 8`), and record each run's options, engine and engine version.
- **Fixes.** Ligands with amino-acid atom names (the glutamate of folate
  in FFO, for example) count as ligands under every engine. Ligand
  contacts count only the ligand's own structure, not others in the same
  OVERLAY or TERMINI run. PyMOL on Python 3.7 to 3.9 no longer stops with
  "name 'int' is not defined". The hidden ChimeraX that draws images ends
  with its analysis engine, a cancelled run no longer leaves a second
  engine running, and a ChimeraX you open yourself is never taken by
  Astra3's. Entries with thousands of chains (3J3Q) no longer fail with
  "maximum recursion depth exceeded"; the largest of them need PyMOL or
  ChimeraX (see Limitations).
- **Changed defaults.** Images are medium quality unless chosen otherwise
  (previously excellent). Astra3 needs macOS 12 Monterey or later
  (previously 10.15), and links in reports and in the app open in your web
  browser.

**Earlier versions.** 1.9.2 added orientation and Terminal Projection
Vector angle changes and local RMSD to TERMINI, with orientation arrows in
close-ups. 1.9.1 moved Astra3 to the GNU GPL. 1.9.0 added Related
Structures, wwPDB validation, reference sequences, domains and the Methods
paragraph. Every release is in the
[changelog](https://andre-aguirre.github.io/Astra3/changelog/).

---

## Install

**Requirements:** macOS 12 Monterey or later, on an Intel or Apple Silicon
Mac, and either [PyMOL](https://pymol.org/) (open-source or Incentive,
built on Python 3.7 or newer, as current releases are) or
[UCSF ChimeraX](https://www.cgl.ucsf.edu/chimerax/) (tested with 1.11 and
1.12). With neither, analyses run in the Astra3 Engine.

1. Download `Astra3-2.0.1-universal.dmg` from the
   [download page](https://andre-aguirre.github.io/Astra3/download/) or
   [GitHub Releases](https://github.com/andre-aguirre/Astra3/releases)
   (the `.zip` there holds the same app).
2. Open the `.dmg` and drag **Astra3** into **Applications**.
3. Open Astra3. It is signed and notarized by Apple, so it opens without a
   Gatekeeper warning.

**Finding PyMOL and ChimeraX.** Astra3 looks for PyMOL as `PyMOL.app` in
`/Applications` or `~/Applications`, in Homebrew (`/opt/homebrew/bin/pymol`,
`/usr/local/bin/pymol`) and in conda installs (`miniconda3`, `anaconda3`,
`miniforge3`, `mambaforge`, in your home folder, `~/opt` or `/opt`, and
their environments), and for ChimeraX as `ChimeraX.app` or
`ChimeraX-1.x.app` in either Applications folder. If it finds neither, a
setup dialog asks you to pick one or to use the Astra3 Engine. You can
pick `PyMOL.app` or `ChimeraX.app` itself; Astra3 finds the program
inside. A PyMOL is checked by starting it briefly, and one built on Python
older than 3.7 is refused with a message saying so; the first start of an
Intel PyMOL on Apple Silicon can take a while. Either location can be
changed in **Settings > Analysis engine**.

| What | Where |
|---|---|
| Results | `~/Documents/Astra3/Protein_outputs/` (change it in Settings) |
| App settings and run history | `~/Library/Application Support/Astra3/` |
| Engine locations, output folder, colour palette | `~/Library/Application Support/Astra3/tools/` |
| PyMOL diagnostic log | `pymol-diagnostic.log` in the same `tools` folder |

If the results folder is on the Desktop or in Documents or Downloads,
macOS asks once for permission. If that was denied, analyses fail when
saving; allow it under System Settings → Privacy & Security → Files and
Folders.

**From source.** The `python/` and `gui/` folders are the whole app. With
Node 22.12 or newer:

```
cd gui
npm ci
npm start
```

`npm run build:mac:universal` builds the app; `npm run vendor` re-downloads
the bundled React, 3Dmol.js and Pyodide files and checks them against their
SHA-256.

---

## Engines

All three engines run the same analysis code, so their measurements agree
to within rounding.

| Engine | Session files | Open session shows it in |
|---|---|---|
| PyMOL | `.pse` | PyMOL |
| UCSF ChimeraX | `.cxs` | ChimeraX |
| Astra3 Engine | `.pse`, and a `.cxc` that rebuilds the scene in ChimeraX | Astra3's 3D Viewer |

PyMOL is used when installed, then ChimeraX; the Astra3 Engine runs when
neither is, or when you choose it. The top bar shows the engine in use and
switches it, and Settings marks each engine green (works), amber (set but
does not run) or red (not set up). PyMOL and ChimeraX run in the
background and report in Astra3's console. The Astra3 Engine draws images
with PyMOL's camera and proportions, shading by burial, depth cue and thin
outlines, and records each image's camera and structures in the PNG.

**Drawing window.** Set Settings > Drawing window to In a window to see
each image as it is made, grouped by analysis. Choosing an image turns the
3D view to its camera; drag along the view's edge to rotate it in the
plane of the screen. **Reset** goes back to the image's camera, **Save
image** saves the turned view, and images drag out of the list as files.

---

## Using the app

- **Home**: fetch a structure by ID, or start an Overlay, Termini, Batch
  or import run.
- **Single Structure**: a PDB ID, with images (Low, Medium or Excellent),
  reports (HTML, JSON, text), CSV, or the session alone. Fetch format is
  mmCIF or legacy PDB, with a fallback to the other.
- **Overlay** and **Termini**: two or more structures, fetched or
  imported. The reference is chosen automatically or by you. When a
  structure holds several copies of the same protein, Astra3 asks, always
  keeps one, or keeps all, as set. Termini adds close-ups of each terminus.
- **Batch**: IDs one per line, or a text file of them. Each structure is
  analysed on its own, and a failure does not stop the queue; ten or more
  ask for confirmation first (Settings > Behavior). Redundant chains can
  also follow the biological assembly rule (below).
- **Import Local**: `.pdb`, `.cif`, `.mmcif`, `.ent` or `.pse`, gzipped or
  not. Each file gets an `AST-XXXX` ID that works anywhere a PDB ID does
  until Astra3 closes. If a file names a PDB entry and you confirm it is
  that entry, the report adds the entry's validation, sequence and domain
  data.
- **Related Structures**: every experimental entry of the same protein
  (same UniProt entry), with method, resolution, ligands, mutations and
  coverage, marked as suited to Overlay or Termini and with warnings
  (construct boundaries, low resolution, NMR ensembles, extra copies,
  partner proteins, unmodelled residues). Selected entries go straight to
  Overlay, Termini or Batch.
- **Reports**: every finished analysis, newest first, batches grouped,
  with the report, its images, the output folder and the session a click
  away. **Copy figure** copies a group of images with its colour key as
  one picture.
- **3D Viewer**: any finished analysis in 3D (3Dmol.js), with each chain,
  ligand and ion recoloured, hidden or drawn its own way. Click a residue
  to select it; Shift+click adds more. **Quick View**, under the list,
  opens a PDB ID or an imported file's temporary ID without an analysis.
- **Summary** and **History**: recent runs with key results and engine;
  every run, with favourites, deletion and disk use.
- **Color Palette**: the colours given in turn to chains, ligands and
  ions, the terminus colours and the TERMINI close-up arrows; used from
  the next run.
- **Settings**: defaults (image quality, fetch format, output folder),
  what to open when a run ends, theme and font, engines, drawing window.
- **Advanced Console**: the command line behind the app (commands below).

Cmd+F finds text in the console, Related Structures and this README; the
keyboard icon in the top bar lists every shortcut.

---

## What Astra3 does to each structure

1. **Fetches or loads** it: by PDB ID (mmCIF or legacy PDB) or from a
   local file.
2. **Removes water.**
3. **Colours and names** every protein chain, ligand and ion, the same
   colour for the same chain letter, ligand code or ion throughout a run.
   Names carry a prefix (`lig_SCN`, `ion_ZN_1`) so they cannot clash with
   the engine's keywords.
4. **Marks the termini**: the first and last ten resolved residues of
   every protein chain.
5. **Describes each ligand's surroundings**: protein residues within
   4.0 Å, and possible polar contacts (ligand and protein N/O atoms within
   3.5 Å; distances, not confirmed hydrogen bonds).
6. **Detects redundant chains** (a homodimer, for example) and asks, or
   follows your setting, whether to keep one.
7. **Saves a session**, and a plain `.pdb` for the 3D Viewer.
8. **Renders six views** (front, back, left, right, top, bottom) on a
   transparent background.
9. **Writes the reports** (HTML, text, JSON, a Methods paragraph, and CSV
   when asked), all from the same results.

---

## How things are measured

### Superposition and RMSD

Residues are paired by sequence alignment (BLOSUM62), and matching atoms
in paired residues are superposed by least-squares fitting (Kabsch). Up
to five refinement cycles set aside pairs further apart than 2.0 × RMSD;
the RMSD is over the pairs kept. OVERLAY also reports a pairwise Cα RMSD
matrix.

Chains are paired by ID when their sequences correspond, otherwise by
sequence. Two chains correspond when one sequence lies within the other,
or when their alignment's identity reaches the HSSP threshold for its
length ([Sander & Schneider 1991](https://doi.org/10.1002/prot.340090107)).
If no pair passes, Astra3 warns and, if you continue, superposes the most
similar pair. TERMINI pairs chains by ID, then by sequence at 90% identity
over 70% coverage.

### Reference structure

OVERLAY and TERMINI measure everything relative to one reference: by
default the structure with the fewest bound ligands, then the one most
similar in sequence to the others, then the one with most resolved
residues, then the first by ID. The order you enter them in never decides.
This is a heuristic, not a quality judgement; the report says which
structure was chosen and why, and you can choose it yourself.

### TERMINI measurements

For each chain matched to the reference, each terminus gets:

- **Tip displacement**: distance between the two terminal Cα atoms after
  superposition.
- **Centroid displacement**: distance between the centroids of the five
  terminal Cα atoms, steadier than the tip alone.
- **Orientation change**: how much the last ten residues, as one segment,
  have turned: the angle between the vectors from the centroid of the
  outer five Cα atoms to that of the inner five. Close-ups draw this
  vector as an arrow.
- **Terminal Projection Vector (TPV) angle change**: how much the very end
  has changed direction. The TPV runs from the centroid of the three Cα
  atoms before the terminal residue to the terminal Cα. A large TPV change
  with a small orientation change means the segment stayed put while its
  tip turned; for a tag fused at that end (HiBiT, FLAG, HA, GFP), the TPV
  shows which way the chain points where the tag joins.
- **Local RMSD**: Cα RMSD over the ten-residue window, in place (after
  superposing the whole structure: a shift of the end plus any change in
  its shape) and refit (after superposing the two windows: the change in
  shape alone).
- **Surface area change** (Shrake-Rupley, 1.4 Å probe, Bondi radii, in a
  frame fixed to the structure) and **normalized B-factor change** (the
  window's mean B-factor over the protein's). Labels apply above 26 Å²
  (more exposed or more buried; a quarter of
  [glycine's maximum accessible surface](https://doi.org/10.1371/journal.pone.0080635))
  and above 0.2 (rigidified or more flexible; about 10% in RMS
  displacement, since B = 8π²⟨u²⟩,
  [Sun et al. 2019](https://doi.org/10.1021/acs.chemrev.8b00290)). Both
  cut-offs are Astra3's, derived from these values; smaller changes read
  Little change.

A terminus with too few resolved residues, or a chain without a
counterpart, is reported as unavailable.

### Terminus offsets

Two structures of the same protein often start or end at different
residues. Astra3 compares the terminal windows of each pair over ten
residues either way and adopts the offset with the highest identity (80%
or more is a confident match). If it is not confident, it offers a
thorough search over 250 residues (type `advanced` at the prompt) for
constructs that differ by a tag or a domain. It shows each terminus before
and after, names the structure and chain that would be trimmed, and
changes nothing without your approval. Offsets of 15 residues or more are
always disclosed.

### Redundant chains

When a structure holds several copies of the same protein, Astra3
recommends one chain and asks, unless told in advance to keep one or keep
all. The chain kept has the fewest missing residues, then the fewest bound
ligands (or the most, if set), then is chain A, then comes first
alphabetically, so a structure always resolves the same way. The order of
these rules can be changed by dragging on the Overlay, Termini and Batch
pages.

Batch can instead keep the chains of the depositor's preferred biological
assembly: one chain of a monomer, both of a dimer. When an entry's assembly
records are missing, or the assembly is built from symmetry copies not in
the file, a fallback decides: ask, keep one chain by the order above, or
keep all. Every report states the rule that decided.

---

## Reports and output files

A report holds:

- **Summary**: method, resolution, protein and nucleic-acid chains,
  ligands, ions, water removed
- **Structure quality**: mean Cα B-factor, alternate conformations, and
  wwPDB validation (clashscore and Ramachandran, rotamer and real-space
  fit outliers, with the residues)
- **Chains**: terminus ranges and missing residues (`REMARK 465` or its
  mmCIF equivalent)
- **Reference sequence and mutations** declared by the depositor, and
  **domains** from Pfam, CATH, ECOD and SCOP, in the structure's numbering
- **Ligands**: nearby residues and possible polar contacts
- **Disulfides** (Sγ–Sγ within 2.5 Å), unclassified hetero atoms, and
  waters
- **OVERLAY and TERMINI** results, with colour keys on every image group
- **Warnings**, in their own section
- **Input files**: each coordinate file's name, size and SHA-256
- **Methods**: what was done, with references, ready to adapt for a paper

Info icons explain each value, sections fold, a switch turns on dark mode,
and the footer records the Astra3 version and the engine and its version.
Validation, sequence and domain data come from RCSB PDB; when they cannot
be retrieved (offline, say), the report says so.

```
Protein_outputs/
    1AKE_Output/
        Astra3_Report.html
        Images/            view_front.png, view_back.png, view_left.png,
                           view_right.png, view_top.png, view_bottom.png
        Session/
            1AKE.pse                       (1AKE.cxs with ChimeraX)
            1AKE.cxc, 1AKE_files/          (Astra3 Engine: the scene for ChimeraX)
            1AKE.pdb                       (for the 3D Viewer)
            1AKE_Information.txt           (text report)
            Astra3_Report.json, Methods.txt
            Astra3_Annotation_Sources.json (the RCSB data the report used)
            Astra3_Export.csv, Ligand_Environment.csv  (with CSV export)
```

OVERLAY writes `Overlay_<IDs>_Output/` (with `Overlay_Session.pse`,
`Overlay_Report.txt`, and `Overlay_Summary.csv` and
`Pairwise_RMSD_Matrix.csv` with CSV export), and TERMINI writes
`Termini_<IDs>_Output/` (with `Termini_Analysis.json`, the close-ups, and
`Termini_Analysis.csv` with CSV export). Running the same
IDs or files again replaces the earlier results. JSON holds the same
values as the report, with `null` for anything unavailable. An output
folder can be moved or shared whole: the HTML report links its images and
session by relative path.

---

## Reproducibility and provenance

| What | Where it is recorded |
|---|---|
| Input | PDB ID, format and download date (Methods), or the imported file's name; for both, the coordinate file's name, size and SHA-256 (Input Files, the text report, JSON `coordinate_file`) |
| Astra3, engine and versions | Report footer, Methods, JSON `astra3_version`, `engine`, `engine_version` |
| Method and thresholds | Methods (also `Methods.txt`), JSON `alignment_method` |
| Parameters | JSON `command` and `run_parameters` |
| Chains used | JSON `chains`, `reduction_used`, `reference_structure`, `reference_selection_reason` |
| RCSB data | `Astra3_Annotation_Sources.json`: every RCSB response used, the requests made, and when |
| Session and images | The engine's session and the processed structure; Astra3 Engine images carry their camera and structures in the PNG |

**What repeats.** The same command, engine, engine version and input
write the same reports; only dates, timings and the temporary `AST-`
numbers of imported files differ.

**What can differ:**

- **Between engines**: measurements agree to within rounding, not digit
  for digit, since each engine holds coordinates at its own precision (in
  testing, RMSDs differed by less than 0.000001 Å and one surface area by
  0.1 Å² after rounding). Secondary structure, images and sessions are
  the engine's own.
- **Over time**: wwPDB revises entries now and then, and RCSB updates its
  validation and annotation data. With the download date, the RCSB
  responses and the file's SHA-256 on record, a later download can be
  checked against the report. The downloaded file is not kept; to keep a
  run exactly, keep its output folder.
- **Imported files**: the SHA-256 is of the file as given (a `.gz` is not
  unpacked first), so `shasum -a 256 <file>` gives the same value. For a
  PDB ID it is of the uncompressed file from RCSB.

---

## Advanced Console commands

The Advanced Console is Astra3's command line (prompt:
`Enter a PDB ID:`).

| Command | What it does |
|---|---|
| `1AKE` | Analyse one structure |
| `OVERLAY 3FXI 1RO6 1ROR` | Superpose structures on a reference |
| `TERMINI 1XGD 6F7R 4JIR` | Compare termini against a reference |
| `BATCH 1AKE 4AKE 2AK3`, `BATCH list.txt` | Analyse several structures in turn; a file lists one ID per line (`#` starts a comment) |
| `IMPORT` | Load a local file (asks for its path) |
| `-t` | Test run: analyse 1AKE into a `TEST/` folder |
| `DONE` | End the session |

Options go after the IDs:

| Option | Effect |
|---|---|
| `-low`, `-medium`, `-excellent` | Image quality (medium unless set) |
| `-skipimage` | No images |
| `-skipreport` | No reports |
| `-ro` | Save the session only |
| `-csv` | Also write CSV files |
| `-mmCIF` | Fetch as mmCIF (legacy PDB otherwise); in OVERLAY and TERMINI it applies to the ID before it |
| `-reference<ID>` | Choose the reference (OVERLAY, TERMINI) |
| `-skipcloseup` | No close-up images (TERMINI) |
| `-alwaysmatch`, `-nevermatch` | Accept terminus offsets at 70% identity or higher, or decline all (TERMINI) |
| `-alwaysreduce`, `-keephomomers` | Always keep one chain of a redundant set, or keep all |
| `-keepassembly` | Keep the chains of the depositor's preferred biological assembly (one of a monomer, both of a dimer) |
| `-assemblyfallback:ask`, `:reduce`, `:keep` | What `-keepassembly` does when the file has no usable assembly records, or its assembly is built from symmetry copies not in the file (ask unless set) |
| `-chromophoreprotein`, `-chromophoreligand` | Count residues built into a chain without a standard backbone (chromophores such as CRO) as protein, or keep them as ligands, without asking |
| `-reducepriority:missing,leastligands,chainA` | Order used to choose that chain (`mostligands` reverses the ligand rule), also for `-assemblyfallback:reduce` |

---

## Limitations

- **Not a prediction tool.** Astra3 reports what is in the file and what
  can be measured from it; it does not predict structure, function,
  stability, binding or biological effect.
- **Contacts are distances**: a possible polar contact is an N/O pair
  within 3.5 Å, without hydrogen-bond geometry. Salt bridges and stacking
  are not typed.
- **Crystal contacts are not analysed**, so a terminal difference caused
  by packing is not flagged.
- **A terminus is the last resolved residue**; unmodelled tails cannot be
  measured. **The TPV describes the chain, not a tag**: how a fused tag
  behaves has to be tested experimentally.
- **Missing residues** come from the file's own records.
- **Disulfides are geometric** (Sγ–Sγ within 2.5 Å).
- **Superposition is sequence-guided**, not a structural alignment such as
  TM-align; for distant homologs the RMSD may not reflect a shared fold.
- **Imported IDs last one session.**
- **Images** keep orientation and colours but are not pixel-identical
  across engines, versions or graphics hardware.
- **Astra3 Engine.** It writes a ChimeraX command file
  (`.cxc`), not a `.cxs`, and cannot import `.cxs` sessions, whose internal
  layout can change with any ChimeraX release; open the `.cxc` in
  ChimeraX and save a `.cxs` there. PyMOL sessions saved with
  `pse_binary_dump` on, or by PyMOL before 1.8, cannot be imported without
  PyMOL. For files without helix and sheet records, secondary structure
  comes from DSSP and can differ slightly from PyMOL's. TERMINI close-ups
  may show a terminus from the side opposite to PyMOL's. Its memory is
  limited to 4 GB, so the largest entries (3J3Q, 2.4 million atoms) stop
  with an error under it and need PyMOL or ChimeraX.
- **ChimeraX** shows its Dock icon for a moment the first time it draws
  images in a session, because it needs a window to render.

---

## Privacy

Astra3 has no accounts, analytics or telemetry. It contacts only the RCSB
Protein Data Bank, for the public structures and data you ask for.
Results, imported files and settings stay on your Mac. See
`PRIVACY.md` or the [privacy page](https://andre-aguirre.github.io/Astra3/privacy/).

---

## License and citation

Copyright (C) 2026 Andre Aguirre

Astra3 is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free
Software Foundation, either version 3 of the License, or (at your option)
any later version. It is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See `LICENSE` for
the full terms.

Versions up to and including 1.9.0 were published under the MIT License;
copies obtained under those terms keep them. Version 1.9.1 and later are
licensed under the GNU GPL, version 3 or later.

The app includes **3Dmol.js** (BSD 3-Clause License, Copyright 2014
University of Pittsburgh and contributors) for the 3D Viewer. **PyMOL**
and **UCSF ChimeraX** are separate programs, not distributed with Astra3;
the Astra3 Engine needs neither. Every bundled third-party license,
including the notices 3Dmol.js carries for GLmol, Three.js and jQuery, is
in `gui/THIRD_PARTY_NOTICES.txt`.

If Astra3 contributes to published research, please cite:

> Aguirre, A. (2026). Astra3: Structural Analysis Toolkit for PDB
> Rendering Automation [Computer software]. Version 2.0.1.
> https://github.com/andre-aguirre/Astra3
> https://doi.org/10.5281/zenodo.22928159

`CITATION.cff` has the same in machine-readable form. Please also cite the
engine you used:

> PyMOL: The PyMOL Molecular Graphics System, Schrödinger, LLC.
>
> ChimeraX: Meng EC et al. (2023) UCSF ChimeraX: Tools for structure
> building and analysis. Protein Sci 32:e4792.
>
> 3D viewer: Rego N, Koes D (2015) 3Dmol.js: molecular visualization with
> WebGL. Bioinformatics 31:1322-1324.

Created by Andre Aguirre ·
[LinkedIn](https://www.linkedin.com/in/andre-alain-aguirre/)

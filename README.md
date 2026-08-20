# Astra3

**Structural Analysis Toolkit for PDB Rendering Automation**

Astra3 is a PyMOL automation toolkit for structural biologists who need
consistent, reproducible processing of PDB structures without hand-running
the same twenty PyMOL commands every time. Point it at a PDB ID (or a local
`.pdb`/`.pse` file), and it fetches the structure, cleans it up, colors and
labels it deterministically, renders a full set of high-resolution images,
and writes reports (HTML, plain text, and JSON) describing exactly what it
found, and just as importantly, what it *did not* find, rather than
guessing.

Astra3 runs as a PyMOL script, and it is also available as a desktop
application (Electron) that wraps that same script with a graphical
interface, an interactive 3D structure viewer, and live console output, so
command syntax does not have to be memorized to use it. Both interfaces run
the identical underlying script and produce identical output; the desktop
app does not reimplement any analysis logic of its own.

Beyond single-structure analysis, Astra3 also supports:

- **OVERLAY**, multi-structure alignment with RMSD, aligned atom/residue
  counts, and a pairwise RMSD matrix
- **TERMINI**, comparative N-/C-terminus structural analysis across aligned
  structures (displacement, rotation, local RMSD), including close-up
  renders of the terminus vectors
- **BATCH**, unattended processing of many structures in one run, with
  optional automatic handling of redundant chains so a batch does not have
  to pause for input on every structure
- Both legacy PDB and mmCIF fetch formats, with automatic fallback if the
  requested format is not available
- Optional **CSV** exports and always-on **JSON** exports alongside the
  HTML/text reports, so results can feed downstream analysis pipelines

---

## Goal and design philosophy

Astra3 is meant to be a **reliable structural analysis assistant, not a
black-box predictor**. Every feature in the codebase is built around five
rules:

1. **Scientific accuracy.** Values reported are either read directly from
   PyMOL, computed deterministically from atomic coordinates, or parsed
   from the PDB file's own header/REMARK records. Nothing is estimated or
   inferred to fill a gap.
2. **Reproducibility.** The same input structure and the same command run
   twice should produce the same coloring, the same selections, the same
   session, and the same report content.
3. **Clear separation of known vs. unavailable data.** If something cannot
   be determined from the structure or header alone (domain boundaries,
   mutations relative to a reference sequence, crystal contacts), the
   report says so explicitly instead of guessing or omitting the section
   silently.
4. **No fabricated biological conclusions.** Astra3 will not invent a
   biological interpretation it cannot support with the data in front of
   it. Geometric proximity is reported as geometric proximity; a close N/O
   contact is a *possible* polar interaction by distance, never asserted
   as a confirmed hydrogen bond.
5. **Modular architecture.** The codebase is split into focused modules
   (see "Project layout" below), and every export format (HTML, TXT, JSON,
   CSV) is built from the same underlying data object per command, so they
   can never disagree with each other.

If you are evaluating output from Astra3, you should be able to trace every
number in a report back to either PyMOL's own geometry calculations or the
PDB file's header. There is no hidden modeling step in between.

---

## What Astra3 does, end to end

For every structure it processes, Astra3:

1. **Fetches or loads** the structure (by PDB ID, in legacy PDB or mmCIF
   format, or from a local `.pdb`/`.pse` file via `IMPORT`).
2. **Removes water** molecules.
3. **Colors and names every protein chain, ligand, and ion**
   deterministically. The same chain letter, ligand code, or ion name is
   always assigned the same color across every structure processed in a
   given run, so multi-panel figures stay visually consistent. Ligand and
   ion selection names are always prefixed (e.g. `lig_SCN`) so they can
   never collide with PyMOL's own selection-language keywords.
4. **Selects and colors the N-terminal and C-terminal residues** of every
   protein chain.
5. **Analyzes the structural environment around every ligand**, protein
   residues within 4.0 Å, and possible polar contacts (ligand N/O atoms
   within 3.5 Å of protein N/O atoms), using PyMOL's own geometry
   calculations (`cmd.find_pairs`, `cmd.iterate`). This is reported as a
   geometric observation, not a confirmed hydrogen-bond or interaction
   analysis; detailed interaction typing (salt bridges, pi-stacking) is
   out of scope and would need a dedicated tool such as PLIP or Arpeggio.
6. **Detects redundant chains within a structure** (a homodimer, for
   example) and asks whether to keep just one representative chain, or
   proceeds automatically per your own configured preference (see
   "Redundant chains" below).
7. **Saves a finished PyMOL session** (`.pse`), automatically falling back
   to a plain `.pdb` only if the `.pse` save itself fails. A separate
   plain-coordinate `.pdb` is always also written alongside it,
   specifically so the desktop app's 3D viewer has a file to load.
8. **Renders six high-resolution, transparent-background images**, front,
   back, left, right, top, and bottom views, at a quality level you
   choose.
9. **Writes reports**: `Protein_Information.txt`, a self-contained
   `Astra3_Report.html`, and an `Astra3_Report.json` export, all built
   from the same underlying analysis, so they never disagree with each
   other. A CSV export is also available on request (see `-csv` below).

Everything lands in a predictable, portable output folder (see below) that
can be moved or shared as a unit. Image paths, session links, and the logo
in the HTML report are all relative, so nothing breaks if the folder moves.

---

## Download and installation

Astra3 is distributed as pre-built downloads on the GitHub Releases page,
organized like this:

```
Astra3/
├── README.md
├── CITATION.cff
├── LICENSE
│
├── Astra3 (MacOS)/
│   ├── Astra3-3.0.0-arm64.dmg
│   └── Astra3-3.0.0-arm64-mac.zip
│
└── Astra3 (Windows)/
```

You do not need Python, Node, or any of Astra3's own source code to run
it -- only [PyMOL](https://pymol.org/) itself, installed separately, since
Astra3 runs its analysis inside PyMOL. Both open-source PyMOL and
Incentive PyMOL work; nothing in Astra3 requires an Incentive-only
feature. The report footer records which one produced the report, along
with the PyMOL version, where that can be determined (see "The 3D
viewer" below for a stated limitation on license-type detection).

### macOS

**Requirements:** macOS 12 or later, Apple Silicon (M1/M2/M3/M4 or later),
[PyMOL](https://pymol.org/) installed separately.

1. Download `Astra3-3.0.0-arm64.dmg` (or the `.zip`, which contains the
   same signed app) from `Astra3 (MacOS)/`.
2. Open the `.dmg` file.
3. Drag **Astra3** into your **Applications** folder.
4. Open Astra3 from Applications.
5. On first launch, select your PyMOL installation when prompted (for
   example `/Applications/PyMOL.app/Contents/MacOS/PyMOL`). Astra3 saves
   this so you are not asked again.

The macOS build is Developer ID signed and notarized by Apple -- no
Gatekeeper override should be needed to open it.

### Windows

**Windows support is currently untested and console-only.** There is no
packaged Windows desktop app yet; `Astra3 (Windows)/` contains the script
itself (`astra3.py` and its three companion modules) plus `astra3.bat`,
the launcher.

**Requirements:** [PyMOL](https://pymol.org/) installed separately.

1. Download the contents of `Astra3 (Windows)/` and keep every file in
   the same folder.
2. Double-click `astra3.bat`.
3. On first run, it asks for the full path to your PyMOL executable (for
   example `C:\Program Files\PyMOL\PyMOLWin.exe`) and saves it for future
   runs.

`astra3.bat` starts PyMOL in quiet command-line mode (`-cq`), so the
console window that opens is the interface you interact with -- no PyMOL
GUI window appears. Since this path hasn't been verified end-to-end on a
real Windows machine yet, please report anything that doesn't work as
expected.

---

## Commands

Astra3 runs as an interactive prompt: `Enter a PDB ID (or -help):`. Type a
command and press Enter. Type `-help` at any time to print the full
command reference from inside the running session.

### Single-structure analysis

```
<PDB ID>
```

Analyzes a single structure. Example: `1ABC`

**Flags** (append after the ID, space-separated; every command below that
accepts flags accepts this same set):

| Flag | Effect |
|---|---|
| `-low` | Render lower-quality images (faster) |
| `-medium` | Render medium-quality images |
| `-excellent` | Render excellent-quality images (**default**) |
| `-skipimage` | Skip image rendering; generate only the report/session |
| `-skipreport` | Skip report generation (HTML/TXT/JSON/CSV); generate only the session and images |
| `-ro` | Render-only mode, save the PyMOL session without generating reports or images |
| `-csv` | Also write a CSV export to `Session/` (opt-in, off by default) |
| `-mmCIF` | Fetch as mmCIF instead of legacy PDB |

Legacy PDB is tried first by default. If a structure is not available in
that format, Astra3 automatically falls back to mmCIF.

Example: `1ABC -medium -csv`

### OVERLAY, multi-structure alignment

```
OVERLAY <id> <id> [<id> ...]
```

Aligns two or more structures onto a shared reference structure using
PyMOL's `cmd.align` (sequence-guided iterative structural superposition).

Example:
```
OVERLAY 3FXI 1RO6 1ROR
```

**Reference selection.** By default, Astra3 automatically picks the
structure with the *fewest bound ligands* as the reference (on the
reasoning that a more sparsely bound structure is generally a cleaner
alignment target), and records that reasoning in the report. This is a
heuristic, not a structural-quality assessment; you can override it:

```
-reference<ID>
```

Example: `OVERLAY 3FXI 1RO6 1ROR -reference1RO6`

If the requested reference ID was not one of the structures loaded, Astra3
falls back to automatic selection and adds a note to the report rather
than silently ignoring the request.

OVERLAY accepts all the flags listed above, including `-csv`, plus a
per-structure `-mmCIF` attached directly after a specific ID, for example
`OVERLAY 6DK3 9BOX -mmCIF` fetches only `9BOX` as mmCIF.

OVERLAY produces:
- An RMSD summary per aligned structure (aligned atoms, aligned residues)
- A full pairwise RMSD matrix (C-alpha based) across every loaded
  structure, not just each structure vs. the reference
- A combined aligned-overlay render
- The same `Astra3_Report.html` / session / JSON / warnings structure as a
  single-structure run
- With `-csv`: `Overlay_Summary.csv` and `Pairwise_RMSD_Matrix.csv` (kept
  as two separate files rather than one, since a per-structure summary
  and a per-pair comparison do not share a natural row structure)

### TERMINI, comparative terminus structural analysis

```
TERMINI <reference> <comparison1> [comparison2 ...]
```

Quantifies how much a protein's N- and C-termini move and reorient
relative to a reference structure, after alignment. The **first**
structure listed is always the reference; every other structure is
independently aligned to it and compared.

Example:
```
TERMINI AST-0001 AST-0002 AST-0003
```

For each shared protein chain between the reference and a comparison
structure, TERMINI computes, independently for the N-terminus and the
C-terminus (the two are never compared to each other):

- **Tip displacement**, distance (angstroms) between the terminal
  residue's C-alpha before and after alignment
- **Centroid displacement**, distance between the centroid of the first
  (or last) residues, a more stable measure than the single tip residue
- **Orientation change**, angle between the reference's and the
  comparison's terminus orientation vector
- **Terminal Projection Vector (TPV) angle change**, an angle describing
  how much the direction a fusion tag would project outward from the
  terminus has changed. This is a **geometric extrapolation of resolved
  backbone coordinates only**; it approximates, but does not predict, how
  an attached tag (for example HiBiT, FLAG, HA, or GFP) would actually
  behave.
- **Local terminal RMSD**, isolating local conformational change from
  global backbone RMSD

If a chain has too few resolved residues near a terminus to compute these
windows, or two structures share no chain IDs at all, that comparison is
reported as unavailable rather than estimated.

**Renders.** TERMINI produces two sets of images per comparison: the
standard whole-structure views, and a set of close-up terminus renders
showing the TPV arrows directly (reference N-/C-terminus in blue/pink,
comparison N-/C-terminus in cyan/orange, with a white dashed line
connecting corresponding terminal centroids). Two camera angles are
rendered per terminus, so a vector that happens to be foreshortened from
one viewing angle is unlikely to be foreshortened from both. The arrows
are also retained in the saved `.pse` session, disabled by default; they
can be enabled from PyMOL's own object panel for closer inspection there.
Close-up rendering is on by default; `-skipcloseup` disables it if only
the wide shots are needed.

TERMINI accepts the same flags as single-structure analysis (`-low`,
`-medium`, `-excellent`, `-skipimage`, `-skipreport`, `-ro`, `-csv`,
`-mmCIF`, per structure), plus `-skipcloseup` and the terminus-offset
auto-decision flags below, and produces:
- `Astra3_Report.html` with a Terminal Structural Analysis section
  (summary table, largest N-/C-terminal displacement and rotation, and
  the embedded whole-structure and close-up visualizations)
- `Termini_Analysis.json`
- With `-csv`: `Termini_Analysis.csv` (one row per structure/chain,
  columns for every metric above, N and C side by side)

**Terminus alignment offsets.** When two termini do not quite line up at
the naive window boundary, TERMINI asks whether to shift and trim to
correct it, showing a before/after comparison of the affected residues.
`-alwaysmatch` always applies the correction without asking; `-nevermatch`
always declines it without asking. Both print the same before/after
summary either way, so the run's own console output stays a complete
record of what was decided.

### Redundant chains (homomers)

When a structure contains multiple chains that are the same protein (a
homodimer, for example), Astra3 flags this and asks how to proceed. By
default it recommends keeping the single longest resolved chain and asks
for confirmation, decline, or a manually specified chain letter.

For BATCH runs, or for any run where an interactive prompt is not wanted,
this decision can be set in advance instead:

| Flag | Effect |
|---|---|
| `-alwaysreduce` | Always select a chain and reduce; never prompt |
| `-keephomomers` | Never reduce; always keep every chain |
| `-reducepriority:<order>` | Sets how `-alwaysreduce` selects a chain (see below) |

`-reducepriority` takes a comma-separated, ordered list of criteria. Each
criterion narrows the candidate chains to whichever are still tied on
that criterion before the next criterion is applied:

- `missing`, fewest missing (unresolved) residues
- `leastligands` / `mostligands`, fewest or most bound ligands
- `chainA`, chain A, if present in the cluster

The default order, used when `-reducepriority` is not specified, is
`missing,leastligands,chainA`. If every criterion in the list is
exhausted and chains remain tied, the alphabetically first chain is
selected. This final step is deterministic, so the same structure
resolves the same way on every run. Worked example: three chains, none
with missing residues, two of them (chains B and C) both with zero bound
ligands. `missing` does not narrow the set, since all three are tied.
`leastligands` narrows it to B and C, which are still tied with each
other. The alphabetical fallback then selects B.

The desktop app's Batch, Overlay, and Termini pages provide a drag-and-drop
version of this ranking, along with a toggle for the ligand criterion's
direction (fewest versus most), so the flag string does not need to be
written by hand.

### BATCH, unattended multi-structure processing

```
BATCH <id> <id> [<id> ...]
```
or
```
BATCH <file>
```

Processes multiple structures one after another, without stopping the
whole run if one fails.

Examples:
```
BATCH 1AKE 4AKE 2AK3
BATCH batch.txt
```

A batch file has one structure ID per line; blank lines and lines
starting with `#` are ignored. IDs are normalized (case-insensitive) and
deduplicated before processing. Each structure gets its own output
folder, exactly as if it had been run individually. BATCH accepts the
same flags as single-structure analysis, including the redundant-chain
auto-decision flags above, applied to every structure in the batch.

### IMPORT, load a local structure file

```
IMPORT
```

Prompts for a file path. Accepts `.pdb` and `.pse` files. The imported
structure is assigned a temporary `AST-XXXX` ID that you can then use
like a PDB ID for the rest of the session, including inside
`OVERLAY`/`TERMINI`. This ID is **session-only**; it disappears once
Astra3 closes, so if you need to refer back to an imported structure,
note the ID it prints or process it before ending the session.

### -t, regression test

```
-t
```

Runs a full single-structure analysis on `1AKE` into a single,
always-overwritten `TEST/` folder. Useful as a quick smoke test that your
PyMOL/Astra3 setup is working correctly, and as a regression check after
modifying the code.

### DONE, finish

```
DONE
```

Ends the session and closes PyMOL. If any structures were processed,
you will be asked whether to open the output folder (uses `open` on
macOS, `os.startfile` on Windows, `xdg-open` on Linux).

---

## The 3D viewer (desktop app)

Every completed run writes a plain-coordinate `.pdb` export alongside its
`.pse` session file, specifically so the viewer has a file to load.
PyMOL's own session format is binary, and the structure file originally
downloaded by Astra3 is deleted after processing, so this export is the
only coordinate-bearing artifact that remains for the viewer.

The viewer is built with **3Dmol.js**, a WebGL-based molecular
visualization library:

> Rego, N., and Koes, D. (2015). 3Dmol.js: molecular visualization with
> WebGL. *Bioinformatics*, 31(8), 1322-1324.
> https://doi.org/10.1093/bioinformatics/btu829

3Dmol.js is distributed under a BSD 3-Clause license; see its own
repository at https://github.com/3dmol/3Dmol.js for full license terms,
and "License" below for how Astra3 reproduces that notice.

A few notes on current viewer behavior:

- **Chain and ligand recoloring apply per structure**, including in
  OVERLAY/TERMINI comparisons where two independently loaded structures
  can share a chain letter (both using chain A, for example) in the
  combined file PyMOL writes for such runs. The viewer distinguishes
  these using each block's real atom serial numbers rather than the
  chain letter alone, so recoloring one occurrence does not affect the
  other.
- The report footer records the PyMOL version and license type used to
  produce the report, where those can be determined. PyMOL does not
  expose a documented, version-stable way to distinguish an
  Educational-tier Incentive license from a paid one; that specific
  distinction is reported as not determinable through the API rather
  than guessed at.

---

## Output folder structure

**Single-structure runs** produce a folder under `Protein_outputs/`:

```
Protein_outputs/
    <ID>_Output/
        Astra3_Report.html
        Session/
            <ID>.pse                    (or <ID>.pdb if .pse saving fails)
            <ID>.pdb                    (plain-coordinate export, for the viewer)
            Protein_Information.txt
            Astra3_Report.json
            Astra3_Export.csv           (only with -csv)
            Ligand_Environment.csv      (only with -csv; header-only if no ligands present)
        Images/
            view_front.png
            view_back.png
            view_left.png
            view_right.png
            view_top.png
            view_bottom.png
```

**OVERLAY runs** produce `Protein_outputs/Overlay_<ids>_Output/`, with the
same `Astra3_Report.html`/`Session/`/`Images/` structure, plus
`Overlay_Summary.csv` and `Pairwise_RMSD_Matrix.csv` in `Session/` when
`-csv` is used.

**TERMINI runs** produce `Protein_outputs/Termini_<ids>_Output/`, with
`Termini_Analysis.json` always in `Session/`, `Termini_Analysis.csv` there
too with `-csv`. For a single comparison (one reference plus one
comparison structure), images are written directly into `Images/`. Once
three or more structures are involved (multiple comparisons against one
reference), each comparison gets its own subfolder under
`Images/<comparison>/`, since otherwise their `view_front.png` and
similarly named files would overwrite one another. Close-up renders
(`closeup_Nterm_A_angle1.png`, and so on) are written alongside the wide
shots either way.

The HTML report is fully self-contained (embedded CSS, no external
dependencies, no internet required to view it) and uses only relative
paths to images and the session file, so the whole output folder can be
zipped, moved, or shared as a unit without breaking anything.

---

## What's in the report

`Protein_Information.txt`, `Astra3_Report.html`, and `Astra3_Report.json`
cover the same underlying data, organized as:

- **Structure quality**, experimental method, resolution, chain list,
  ligands, ions, mean C-alpha B-factor and B-factor range, alternate
  conformations, water-removal status
- **Chain analysis**, N-terminus/C-terminus residue ranges per chain and
  missing-residue ranges (parsed from PDB `REMARK 465`, or the equivalent
  mmCIF field, when present)
- **Sequence and secondary structure summaries**
- **Ligand and ion listings**, including automatically detected
  binding-site residues and possible polar contacts near each ligand
- **HETATM audit**, a check for HETATM records that were not cleanly
  classified as a recognized ligand, ion, or water
- **Disulfide bonds**, detected geometrically (Cys S-gamma to S-gamma
  pairs within 2.5 angstroms), not inferred from annotation
- **Water summary**
- **Warnings / structural notes**, missing residues, chain-reduction
  events, and other conditions worth a researcher's attention, kept in a
  dedicated section separate from the main summary

Several report sections are **explicit "not available" stubs by design**,
rather than silently omitted or filled with a guess:

- **Domains.** Domain boundaries require an external annotation database
  (Pfam, InterPro, CATH/SCOP) that Astra3 does not query.
- **Mutations.** Identifying mutations relative to a deposited construct
  requires comparison against an external reference sequence (for example
  UniProt) that Astra3 does not query.
- **Crystal contacts.** Not computed in the current version; this would
  require generating symmetry mates from the file's space group.

This is intentional: Astra3 would rather tell you a section is not
available than fabricate a plausible-looking answer.

The footer includes the Astra3 version, the PyMOL version and license
(where determinable), and a citation block. See "License" below for the
exact citation text.

### JSON export

`Astra3_Report.json` (single-structure/OVERLAY) and `Termini_Analysis.json`
(TERMINI) contain the same validated data as the HTML/TXT report,
structured for programmatic use. Values that are unavailable in the
source data (for example a resolution not found in the PDB header) are
written as JSON `null` rather than a placeholder string, so downstream
tooling can distinguish "unknown" from a real value without
string-matching Astra3's specific wording.

### CSV export (`-csv`, opt-in)

CSV is never generated by default. When requested, the schema depends on
the command:

- **Single-structure/BATCH**, `Astra3_Export.csv`, one row per structure
- **OVERLAY**, `Overlay_Summary.csv` (one row per structure) and
  `Pairwise_RMSD_Matrix.csv` (one row per structure pair), kept separate
  since they do not share a row structure
- **TERMINI**, `Termini_Analysis.csv`, one row per structure/chain
- **Ligand environment** (single-structure and OVERLAY),
  `Ligand_Environment.csv`, one row per (ligand, nearby residue) pair,
  written automatically alongside the other CSV output whenever `-csv` is
  used (the file is always created; it simply has no data rows if the
  structure has no ligands)

---

## Limitations

Please read this section before relying on Astra3 output for anything
publication- or decision-critical.

- **Not a modeling or prediction tool.** Astra3 reports what is present
  in the structure/header data, or what can be measured geometrically
  from PyMOL coordinates. It does not predict structure, function,
  stability, binding affinity, or biological effect of any kind.
- **Domain, mutation, and crystal-contact analysis are not implemented.**
  These sections exist in the report specifically to say so; do not
  mistake their presence for partial support.
- **Ligand-environment analysis reports geometric proximity, not
  confirmed interactions.** A "possible polar contact" is an N/O pair
  within 3.5 angstroms; it does not confirm hydrogen-bond donor/acceptor
  geometry or that a bond actually forms. Salt bridges, pi-stacking, and
  other interaction typing are not computed.
- **The Terminal Projection Vector (TERMINI) is a geometric
  extrapolation, not a prediction.** It approximates the direction a
  terminal fusion tag would initially project from the backbone, based
  only on resolved coordinate geometry; it does not model how a tag
  would actually fold, move, or behave once attached.
- **Missing-residue detection depends on `REMARK 465`**, or the
  equivalent mmCIF field, being present in the source file. Structures
  without this information will show missing-residue data as
  unavailable, not as "none missing."
- **Disulfide detection is purely geometric** (S-gamma to S-gamma
  distance of 2.5 angstroms or less) and does not distinguish
  biologically relevant disulfides from close contacts that happen to
  fall within that cutoff in a given conformation.
- **OVERLAY's automatic reference selection is a heuristic** (fewest
  bound ligands), not a structural-quality metric. For anything where
  reference choice matters scientifically, use `-reference<ID>`
  explicitly and note the choice in your own methods.
- **Alignment is sequence-guided structural superposition via PyMOL's
  `cmd.align`**, not a specialized structural-alignment algorithm (for
  example, no TM-align/DALI-style topology-independent alignment). It
  performs well for homologous structures but is not designed for
  remote-homology or fold-recognition alignment. TERMINI relies on this
  same alignment before computing any terminus comparison.
- **TERMINI requires a shared chain ID** between the reference and each
  comparison structure to compute a comparison for that chain; if none
  exists, or if a terminus has too few resolved residues for the
  tip/orientation window, that comparison is reported as unavailable.
- **Requires PyMOL to run.** Astra3 is not a standalone application; it
  depends on `cmd` (PyMOL's Python API) throughout, and the desktop app
  is a wrapper around the same script rather than a separate
  implementation.
- **Fetching structures by PDB ID requires internet access.** Offline use
  is only possible via `IMPORT` with a local `.pdb`/`.pse` file.
- **Imported (`AST-XXXX`) structures are session-only.** There is
  currently no persistent registry across separate Astra3 launches.
- **Rendering is deterministic in orientation and coloring logic, but not
  pixel-identical across PyMOL versions or hardware.** Ray-tracing output
  can vary slightly across PyMOL versions, GPUs, or OS-level font/
  anti-aliasing differences, even though the same selection/coloring/
  camera logic is applied every time.
- **Windows launcher (`astra3.bat`) has not been tested yet on Windows.**
  It mirrors the macOS/Linux launcher's logic, including PyMOL path
  detection and confirmation, but if you hit an issue specific to a
  Windows console/PyMOL build, please open an issue with the exact
  output.

---

## For developers: building from source

Everything above describes using a downloaded release. If you're working
from the source repository instead (contributing, or building your own
copy), the source is laid out like this:

```
python/
    astra3.py                  Entry point: interactive command loop,
                                OVERLAY orchestration (OverlayRequest,
                                OverlayExecution), TERMINI orchestration
                                (TerminiExecution, reusing OverlayExecution
                                for loading/alignment), BATCH processing,
                                single-structure run orchestration, and
                                redundant-chain / terminus auto-decision
                                flag parsing
    astra3_core.py              Shared constants, terminal colors,
                                cancellation handling, base-directory
                                detection, the AST-XXXX structure
                                registry, shared chain/ligand/ion color
                                maps, PDB/mmCIF header parsing,
                                output-folder helpers, and PyMOL
                                version/license detection
    astra3_structure.py         Structure processing: water removal,
                                chain/ligand/ion coloring and naming,
                                N-/C-terminus selection, all report_*
                                section builders, the ligand-environment
                                geometry module, homomer detection and
                                priority ranking, and the TERMINI
                                terminus-comparison and TPV vector
                                geometry
    astra3_render_report.py     Session saving, image rendering
                                (including TERMINI close-ups), and every
                                report/export format: Astra3_Report.html,
                                Protein_Information.txt,
                                Astra3_Report.json, and all CSV exports
    astra3.command / astra3.bat Launchers (macOS/Linux and Windows
                                respectively)

gui/
    electron/                  Main process: PyMOL subprocess management,
                                filesystem access, and IPC handlers
    renderer/                  Application UI (React, bundled with
                                esbuild): one page per command, the 3D
                                viewer, live console, history, and
                                settings
```

All four Python files must stay together in the same folder;
`astra3.py` imports from the other three, which is what makes each
concern editable independently (for example, report styling or a new
export format only touches `astra3_render_report.py`, never the analysis
logic in `astra3_structure.py`). The GUI never duplicates the analysis
logic; it constructs a command string and passes it to the same script.

To run the script directly from a source checkout without the GUI at
all, `run /path/to/astra3.py` from within PyMOL, or use
`astra3.command`/`astra3.bat` as a launcher -- both start PyMOL in quiet
command-line mode (`-cq`) and ask for your PyMOL executable path on
first run.

To run the desktop app from source:

```
cd gui
npm install
npm start
```

To build a distributable:

```
npm run build:mac    # or build:win
```

---

## License

Astra3 itself is released under the MIT License. See `LICENSE` for
details.

The desktop app bundles or depends on third-party components under their
own licenses, most notably **3Dmol.js** (BSD 3-Clause License, Copyright
2014 University of Pittsburgh and contributors) for structure
visualization, and **PyMOL**, which is required separately and is not
distributed with Astra3. The full text of every bundled third-party
license, and the additional notices 3Dmol.js's own license carries for
GLmol, Three.js, and jQuery, is reproduced in `gui/THIRD_PARTY_NOTICES.txt`.

If Astra3 contributes to published research, please cite:

> Aguirre, A. (2026). Astra3: Structural Analysis Toolkit for PDB
> Rendering Automation [Computer software].
> https://github.com/andre-aguirre/Astra3

A machine-readable citation is also available in `CITATION.cff`.

The 3Dmol.js citation for the structure viewer (see "The 3D viewer" above)
is also reproduced in `gui/THIRD_PARTY_NOTICES.txt` alongside its license
text.

Created by Andre Aguirre.
[LinkedIn](https://www.linkedin.com/in/andre-alain-aguirre/)

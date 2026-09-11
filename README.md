# Astra3

**Structural Analysis Toolkit for PDB Rendering Automation**

Version 1.8.0

Astra3 is a PyMOL automation toolkit for structural biologists who need
consistent, reproducible processing of PDB structures without hand-running
the same twenty PyMOL commands every time. Point it at a PDB ID (or a local
`.pdb`, `.cif`, or `.pse` file), and it fetches the structure, cleans it up, colors and
labels it deterministically, renders a full set of high-resolution images,
and writes reports (HTML, plain text, and JSON) describing exactly what it
found, and just as importantly, what it did not find, rather than
guessing.

Astra3 is a desktop application with a graphical interface, an interactive
3D structure viewer, and live console output, so command syntax does not
have to be memorized. The same commands are available through the interface
and through the built-in console, and both produce identical output.

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

## What's new in 1.8.0

**Run progress and outcomes**

- **Progress bars** on every kind of run, above the console that produced
  them. Progress follows the stages Astra3 prints, and through rendering it
  counts images as they are saved, so the bar moves in step with the work.
  Where the image count is not known in advance, as in a terminus
  comparison, the estimate corrects itself from the run's own output.
- **Time remaining**, measured from how long this run's images are actually
  taking. Before enough have been saved to measure a rate, no estimate is
  offered rather than a guessed one.
- **Cancelling a run now ends it.** A cancelled analysis previously returned
  to the prompt the same way a finished one did, so it reported success.
  Cancelling now marks the run cancelled, removes the partial output it had
  written, and records no history entry. OVERLAY and TERMINI discard the
  whole comparison, since a comparison missing one of its structures is not
  a partial answer.
- **Cancellation cleanup is scoped to the run that was cancelled.** Output
  folders are named for the structure, so re-running one reuses the folder
  its previous run wrote into; only what the cancelled run itself wrote is
  removed.
- **A structure ID that cannot be fetched is reported as a failure**, in
  red, with the reason left in the console. Previously a nonexistent ID
  produced a completion notification and a history entry with nothing
  behind it.
- **BATCH** stopped part-way keeps the structures that finished and is
  recorded as cancelled rather than failed; one stopped before any
  structure finished records nothing at all.

**Structures and input**

- **Local file imports work end to end.** An imported structure is named
  for its file, and one internal check compared that name case-sensitively
  where PyMOL does not, so every imported run completed its analysis and
  then stopped at the render step.
- **Imports accept `.cif` and `.mmcif`**, which the analysis had always
  supported but the file picker did not offer.
- **A five-character ID is recognised as an entry plus a chain.** `1AKEA`
  means chain A of entry `1AKE` to PyMOL. Astra3 now asks which was meant
  before fetching anything, rather than silently analysing one chain.
- **Fetch format is not requested for imported structures**, which are read
  from the registered file in whatever format it already is.

**3D viewer**

- **Ions are recolourable**, and the colour panel opens beside whatever was
  clicked rather than at the foot of the ligand list.
- **Per-item representations.** Chains, ligands and ions each have their
  own representation control, so a single ion can be drawn as sticks while
  the rest stay spheres. Anything left on Default follows the global
  buttons.
- **Per-item show/hide** for every ligand and ion. Group switches work as
  hide-all-then-show-one: switching a group off hides each of its members,
  and turning one back on leaves the rest hidden.
- **Reset View resets the view**, not just the camera: colours,
  representations, hidden items, painted residues, selection and background
  all return to how the structure was first drawn.
- **Fixed:** a surface could remain on screen permanently if the view was
  reset while it was still being built.

**Documentation**

- **Find-in-page in the README.** Cmd+F opens it, Enter moves to the next
  match and scrolls to it, Shift+Enter goes back. Every match is
  highlighted, with an arrow in the margin beside each line containing one
  and the current match's arrow in accent colour.

**Earlier in 1.8.0**

- **Summary tab**: a visual gallery of recent structures with per-run
  metadata, alignment statistics, and direct actions to open the report,
  session, or output folder.
- **3D viewer: DNA and RNA** are recognised and drawn with the standard
  ribbon-and-ladder representation instead of the protein cartoon.
- **3D viewer: ions** are recognised and drawn as spheres. Previously they
  were styled as sticks, which renders nothing for a single unbonded atom.
- **3D viewer: selection tool**: hover any atom for a readout, click to
  select and recolour the residue. Shift+click builds a multi-residue
  selection, a representation can be chosen for the selected residues, and
  dragging near the edge of the viewport rolls the view.
- **Network status** in the top bar. A failed download distinguishes an
  unreachable host from a mistyped structure ID instead of always blaming
  the ID.
- **Unobserved residues are excluded from measurement.** A deposited
  structure can contain residues with coordinates but zero occupancy, which
  were never seen in the density. These are no longer treated as a chain's
  first or last residue, and every report states which residues were
  excluded.
- **TERMINI: ligand-to-terminus distances.** For ligands present in one
  structure and absent from the other, the report gives the distance from
  each ligand to each terminal window centroid.
- **TERMINI: sequence and residue reporting.** Whole-chain and
  terminus-window comparisons are reported separately, each with identity,
  similarity and per-sequence coverage; local RMSD now states how many
  residue pairs it was computed from.
- **Visibility controls** for chains, ligands, ions, DNA/RNA and waters.
- **History** reports storage used per run and in total, with separate
  actions to clear the list or to clear the list and delete the files.
- **Batch cancellation** stops the whole queue rather than the current
  structure only, and a confirmation is shown before large batches.
- **Fixed:** intra-structure homomer reduction never ran during OVERLAY.
- **Fixed:** rendered images lost their transparent background.
- **Fixed:** a single unnameable ligand could discard an entire structure.
- **Fixed:** the report logo was never embedded in packaged builds.
- **Fixed:** settings could not persist when the app was installed to
  `/Applications`.
- **Fixed:** terminus windows could be anchored on unobserved residues.
- **Fixed:** rendered views could repeat the same camera angle, so
  `view_front` and `view_back` were effectively the same image.
- **Fixed:** images from a previous run of the same comparison remained in
  the output folder and appeared alongside the current run's.
- **Fixed:** PyMOL alignment scratch objects were saved into the `.pse`.
- **Fixed:** the "needs input" indicator stayed lit after a cancelled run.


---

## Goal and design philosophy

Astra3 is meant to be a **reliable structural analysis assistant, not a
black-box predictor**. Every feature is built around five rules:

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
   contact is a possible polar interaction by distance, never asserted
   as a confirmed hydrogen bond.
5. **Consistent exports.** Every export format (HTML, TXT, JSON, CSV) is
   produced from the same result set for a given command, so they cannot
   disagree with each other.

If you are evaluating output from Astra3, you should be able to trace every
number in a report back to either PyMOL's own geometry calculations or the
PDB file's header. There is no hidden modeling step in between.

---

## What Astra3 does, end to end

For every structure it processes, Astra3:

1. **Fetches or loads** the structure (by PDB ID, in legacy PDB or mmCIF
   format, or from a local `.pdb`, `.cif`, or `.pse` file via `IMPORT`).
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
└── Astra3 (MacOS)/
    └── install.md
```

Windows is maintained as a separate distribution with its own build and
release; it is not part of this package.

The `.dmg` and `.zip` themselves are attached to the corresponding
[GitHub Release](https://github.com/andre-aguirre/Astra3/releases),
not stored directly in the repository; `Astra3 (MacOS)/install.md`
points there.

Astra3 requires only [PyMOL](https://pymol.org/), installed separately.
Nothing else needs to be installed. Both open-source PyMOL and
Incentive PyMOL work; nothing in Astra3 requires an Incentive-only
feature. The report footer records which one produced the report, along
with the PyMOL version, where that can be determined (see "The 3D
viewer" below for a stated limitation on license-type detection).

### Installing

**Requirements:** macOS 12 or later, Apple Silicon (M1 or newer),
[PyMOL](https://pymol.org/) installed separately.

1. Download `Astra3-1.8.0-arm64.dmg` (or the `.zip`, which contains the
   same signed app) from the
   [GitHub Releases](https://github.com/andre-aguirre/Astra3/releases)
   page.
2. Open the `.dmg`.
3. Drag **Astra3** into your **Applications** folder.
4. Launch Astra3 from Applications.

The build is Developer ID signed and notarized, so no Gatekeeper override
is required.

### PyMOL discovery

On first launch Astra3 looks for PyMOL automatically in the locations it
is normally installed to:

- `/Applications/PyMOL.app/Contents/MacOS/PyMOL`
- `~/Applications/PyMOL.app/Contents/MacOS/PyMOL`
- `/Applications/PyMOL.app/Contents/bin/pymol`
- Homebrew (`/opt/homebrew/bin/pymol`, `/usr/local/bin/pymol`)
- conda and pip installs under your home directory

If none is found, Settings prompts you to select it. Astra3 verifies the
choice by briefly launching it and confirming it behaves like PyMOL, so a
wrong selection is caught immediately rather than at the first analysis.
Both open-source and Incentive PyMOL work.

### Where Astra3 keeps things

| What | Location |
|---|---|
| Analysis output | `~/Documents/Astra3/Protein_outputs/` (configurable in Settings) |
| Saved settings | `~/Library/Application Support/Astra3/tools/` |
| Diagnostic log | `~/Library/Application Support/Astra3/tools/pymol-diagnostic.log` |

Settings live in Application Support rather than inside the application
bundle, because a signed `.app` cannot be written to without invalidating
its signature, and `/Applications` is not writable by a standard user.

Each run creates `<ID>_Output/` inside the output folder, containing the
rendered images, the HTML and JSON reports, and a `Session/` subfolder
with the `.pse`, the exported `.pdb`, and the text report.

### Permissions

If the output folder is set to Desktop, Documents, or Downloads, macOS
asks once for permission the first time Astra3 writes there. Denying it
causes analyses to fail at the point of saving; you can grant it later
under System Settings → Privacy & Security → Files and Folders.

### Known limitations on macOS

- Apple Silicon only. There is no Intel build.
- PyMOL must be installed separately; Astra3 does not bundle it.
- Opening a `.pse` from within Astra3 launches your configured PyMOL
  directly rather than going through the Finder file association, which
  PyMOL does not always register.

---

## PyMOL Setup

The desktop app actively manages its connection to PyMOL rather than
just trusting whatever was last saved. This section covers what that
looks like in practice.

### Automatic detection

Every time Astra3 launches, it validates the saved PyMOL path before
you can run anything, including a real
check that briefly launches the candidate and confirms it actually
behaves like PyMOL (watching for PyMOL's own startup output). If it
checks out, you'll see a small "PyMOL location verified" notification
in the bottom-right corner and Astra3 is ready to use. This same real
check also runs whenever you change the path in Settings, and a
lighter, instant version of it runs before every individual analysis,
so a problem is caught before it can produce a confusing failure
partway through a run.

### First-launch setup

If Astra3 has never been pointed at a PyMOL installation, a welcome
dialog appears on first launch asking you to connect one. It has a
path field, a Browse button (for picking `PyMOL.app` directly through
a native file picker), and a Confirm button. Selecting `PyMOL.app`
itself works correctly here: Astra3 automatically resolves it down to
the real executable inside the bundle
(`PyMOL.app/Contents/MacOS/PyMOL`) rather than needing you to know
that structure yourself. A small "README Document" link in the dialog
closes it and takes you straight to the Citation & Docs page if you'd
rather read more first. The dialog can also be closed without setting
anything; Astra3 stays usable elsewhere, and the dialog reopens
automatically the next time you try to run something that needs
PyMOL.

### Manual path selection

You can also set or change the PyMOL path anytime from **Settings ->
PyMOL**, using the same Browse button or by typing a path directly.
Either way, the path is validated the same way (a real launch check,
not just a file-existence check) before it's accepted; changing an
already-configured path restarts Astra3 automatically so the new path
takes effect everywhere immediately, not just for the next analysis
you happen to run.

### Recovery if PyMOL becomes unavailable

If PyMOL is later deleted, moved, renamed, has its permissions
changed, or is replaced with something that isn't actually PyMOL, the
same setup dialog reopens automatically the next time it's needed,
with a shorter message ("PyMOL could not be found. Please select a
valid PyMOL installation.") instead of the first-launch welcome text.
You never see a raw backend error for this; Astra3 catches it before
attempting to run anything.

### Validation and troubleshooting

If you select a file that isn't really PyMOL (for example, another
application's executable, or a renamed file), Astra3 rejects it with
"This file does not appear to be a valid PyMOL executable." rather
than accepting it and failing later. If you hit this unexpectedly,
double-check you selected PyMOL's own application/executable, not
something else with a similar name or location.

**Common macOS PyMOL location:**
```
/Applications/PyMOL.app/Contents/MacOS/PyMOL
```

If PyMOL is installed somewhere other than these defaults, use Browse
to locate it directly rather than typing a guessed path.

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
structure with the fewest bound ligands as the reference (on the
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
relative to a reference structure, after alignment. As with OVERLAY,
Astra3 selects the structure with the **fewest bound ligands** as the
reference, on the reasoning that the less ligand-encumbered structure is
the more neutral baseline; every other structure is independently
aligned to it and compared. Ties break on the order the structures were
given. Use `-reference<ID>` to choose the reference yourself. Because
every terminal measurement, the offset correction and the
ligand-to-terminus distances are all expressed relative to the
reference, the report states which structure was chosen and why, and
warns when that is not the first structure named.

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

**Renders.** TERMINI produces two independent sets of images per
comparison: the standard whole-structure views, and a set of close-up
terminus renders showing the TPV arrows directly (reference N-/C-terminus
in orange/pink, comparison N-/C-terminus in cyan/bright yellow, with a
white dashed line connecting corresponding terminal centroids). Two
camera angles are rendered per terminus, so a vector that happens to be
foreshortened from one viewing angle is unlikely to be foreshortened
from both. The arrows are also retained in the saved `.pse` session,
disabled by default; they can be enabled from PyMOL's own object panel
for closer inspection there.

Both sets are controlled independently, by `-skipimage` (whole-structure
views) and `-skipcloseup` (close-ups) respectively; neither one implies
the other:

| `-skipimage` | `-skipcloseup` | Result |
|---|---|---|
| off | off | Both: whole-structure views and close-ups |
| off | on | Whole-structure views only |
| on | off | Close-ups only, no whole-structure views |
| on | on | No images at all |

In the desktop app, this is "Render images" and "Close-up terminus
views" as two separate checkboxes on the Termini page, matching the
same four combinations. Image quality (`-low`/`-medium`/`-excellent`)
applies to whichever of the two is actually being rendered, including a
close-ups-only run with whole-structure views turned off.

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
the naive first/last residues, Astra3 shows a before/after comparison for
each terminus and asks whether to apply the correction. Nothing is changed
without approval.

When both termini need a correction they can be handled independently:
answer `y` to apply both, `n` to apply neither, or `nterm` / `cterm` to
apply only that one. The two ends of a chain frequently differ, and a
single decision for both would discard that.

**How the match is scored.** Astra3 takes the terminal window from each
structure, extends it by a search margin, and tries every offset between
the two extended sequences. Each offset is scored as the fraction of
exactly matching residues over the overlap, and the highest-scoring offset
is adopted as the frame; where two offsets score equally the smaller one
wins, so a nearby explanation is preferred to a distant one. The terminus
is then re-scored over the window in that frame, and treated as a
confident match at **80% identity or above**.

The window is 10 residues per terminus. The ordinary search looks 10
residues either way, which covers ordinary terminal disorder: one crystal
resolving a few more tail residues than another. A narrow search is what
keeps it from wandering off and finding a plausible-looking match somewhere
unrelated.

If that match is not confident, Astra3 offers a more thorough pass before
you decide. Type `advanced` at the prompt (the console also accepts
`escalate`). It runs the same scoring over a search range of **250
residues** either way, for the case the narrow search cannot represent at
all: two entries of the same protein built from different constructs, where
one carries an expression tag, a cloning scar, or a whole extra domain
ahead of the point the other begins. Those differ by tens of residues, and
a search that stops at 10 reports "these termini do not correspond" for a
pair whose termini correspond perfectly 40 residues in. Any adopted offset
of **15 residues or more** is disclosed rather than applied quietly. The
thorough pass is offered only when the quick check is genuinely uncertain,
so most runs never see it.

Terminus matching is deliberately an exact-residue comparison: it is
answering where two chains line up, not how similar they are. Sequence
similarity is a separate question and is reported separately, from a
gap-aware alignment of the whole chain that distinguishes exact identity
from conservative-substitution similarity, and both from how much of each
sequence was actually compared, so a high score over very few residues
cannot be mistaken for strong evidence.

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
macOS, and the platform equivalent elsewhere).

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
> WebGL. Bioinformatics, 31(8), 1322-1324.
> https://doi.org/10.1093/bioinformatics/btu829

3Dmol.js is distributed under a BSD 3-Clause license; see its own
repository at https://github.com/3dmol/3Dmol.js for full license terms,
and "License" below for how Astra3 reproduces that notice.

The viewer is interactive: chains, ligands and ions can each be recoloured
and given their own representation, individually shown or hidden, and
reset. Clicking any of them opens its controls in place. **Reset View**
returns the structure to how it was first drawn, camera included.

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
- **Requires PyMOL to run.** Astra3 performs its analysis through PyMOL and
  cannot run without it installed.
- **Fetching structures by PDB ID requires internet access.** Offline use
  is only possible via `IMPORT` with a local `.pdb`, `.cif`, or `.pse` file.
- **Imported (`AST-XXXX`) structures are session-only.** There is
  currently no persistent registry across separate Astra3 launches.
- **Rendering is deterministic in orientation and coloring logic, but not
  pixel-identical across PyMOL versions or hardware.** Ray-tracing output
  can vary slightly across PyMOL versions, GPUs, or OS-level font/
  anti-aliasing differences, even though the same selection/coloring/
  camera logic is applied every time.

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

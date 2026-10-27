/**
 * Central site configuration.
 *
 * Everything that changes between releases lives here: the version, download
 * links, platform availability and release notes. Pages and components read
 * from this file, so none of these values are repeated in markup.
 *
 * Platform availability is set per platform below. Every download button,
 * platform card, note and page heading reads `status` and `url`, so changing
 * them here is the only edit a platform launch or withdrawal needs.
 */

export type PlatformStatus = 'available' | 'comingSoon';

export interface Release {
  version: string;
  date: string; // ISO date
  items: [title: string, detail: string][];
}

const githubUrl = 'https://github.com/andre-aguirre/Astra3';
/** Zenodo concept DOI: always resolves to the newest archived release. */
const doi = '10.5281/zenodo.22928159';

export const CONFIG = {
  name: 'Astra3',
  fullName: 'Structural Analysis Toolkit for PDB Rendering Automation',
  version: '2.0.1',
  githubUrl,
  doi,
  doiUrl: `https://doi.org/${doi}`,
  releasesUrl: `${githubUrl}/releases`,
  /** Always resolves to the newest GitHub release, so the site needs no rebuild when a .dmg changes. */
  latestReleaseUrl: `${githubUrl}/releases/latest`,
  contactEmail: 'andreaguirre20@outlook.com',
  linkedinUrl: 'https://www.linkedin.com/in/andre-alain-aguirre/',
  /** A YouTube/Vimeo embed URL or a local /video path. null shows "Demo video coming soon". */
  demoVideoUrl: null as string | null,

  platforms: {
    macos: {
      status: 'available' as PlatformStatus,
      name: 'macOS',
      /** null → latestReleaseUrl */
      url: null as string | null,
      requirements: 'macOS 12 Monterey or later',
      arch: 'Universal: Intel and Apple Silicon',
      formats: '.dmg · .zip',
      signing: 'Developer ID signed and notarized',
    },
    windows: {
      status: 'available' as PlatformStatus,
      name: 'Windows',
      /** Microsoft Store product page. */
      url: 'https://apps.microsoft.com/detail/9PKK58GQP8QX' as string | null,
      requirements: 'Windows 10 or Windows 11, 64-bit',
      arch: 'x64',
      channel: 'Microsoft Store',
      updates: 'Installed and kept up to date by the Microsoft Store',
    },
  },

  releases: [
    {
      version: '2.0.1',
      date: '2026-10-31',
      items: [
        ['Astra3 Engine (test build)', 'a third engine that is part of Astra3, for computers without PyMOL or ChimeraX. It runs the same analysis and saves a PyMOL .pse and a ChimeraX .cxc.'],
        ['ChimeraX', 'Astra3 runs with UCSF ChimeraX as well as PyMOL, and their measurements agree to within rounding. The top bar shows the engine in use and switches between them.'],
        ['Measurements', 'superposition (Kabsch least squares) and surface area (Shrake-Rupley) are computed by Astra3, so they no longer depend on the engine. Surface-area values can differ by a few Å² from earlier versions.'],
        ['Residue pairing', 'chains are aligned through their full sequences, unobserved residues included, as ChimeraX’s matchmaker does. Superposition and terminus values change where two structures have different gaps.'],
        ['Normalized B-factor', 'divided by the mean over the protein as deposited, also when a terminus correction removes residues.'],
        ['Ligand centroid', 'taken over one conformation of the ligand (the first listed), as for every other measurement.'],
        ['Secondary structure', 'Astra3’s own assignment follows mkdssp for π-helices, residue order and bridges between residues two apart.'],
        ['Header values', 'mmCIF files give the refinement resolution, the value the PDB lists for the entry; R values written by SHELXL are read; a validation statistic missing from the RCSB Data API is read from the wwPDB validation report.'],
        ['Chromophores', 'for a residue built into the chain without a standard backbone (such as CRO), Astra3 asks whether to count it as protein or keep it as a ligand, and records the choice. -chromophoreprotein and -chromophoreligand decide without asking.'],
        ['Input files on record', 'each report gives every coordinate file’s name, size and SHA-256.'],
        ['Drawing window', 'Settings > Drawing window lists each image as it is made, under any engine, and can turn and save its 3D view.'],
        ['Color Palette', 'a page under Advanced Console sets the colours used for chains, ligands, ions, termini and arrows.'],
        ['PyMOL sessions', 'import under every engine, read without PyMOL; a file holding anything but session data is refused unopened.'],
        ['Files', 'import accepts .ent and gzip-compressed files; an empty, binary, truncated or misnamed file, or one of only water or only ligands, is refused with the reason.'],
        ['PDB IDs', 'extended IDs (pdb_00001ake) are accepted, and a failed download says whether the entry does not exist or RCSB could not be reached.'],
        ['Low sequence identity', 'brings a warning and, if you continue, a superposition of the closest pair instead of a stop.'],
        ['Reports', 'list DNA and RNA chains, count repeated ligands and ions (MN × 8), and record each run’s options, engine and engine version.'],
        ['Ligands', 'residues with amino-acid atom names (the glutamate of folate in FFO, for example) count as ligands under every engine, and ligand contacts count only residues of the ligand’s own structure in OVERLAY and TERMINI.'],
        ['PyMOL on Python 3.7 to 3.9', 'no longer stops with “name \'int\' is not defined”.'],
        ['Image quality', 'medium unless another is chosen (previously excellent).'],
        ['Links', 'in reports and in the app open in your web browser.'],
        ['macOS 12', 'the app runs on Electron 43, which needs macOS 12 Monterey or later (previously 10.15).'],
      ],
    },
    {
      version: '1.9.2',
      date: '2026-09-25',
      items: [
        ['TERMINI', 'orientation change and Terminal Projection Vector angle change for each terminus, with local RMSD in place and refit.'],
        ['Orientation arrows', 'close-ups draw each terminus’s orientation vector, pointing out of the protein at both ends.'],
        ['Copy figure', 'in the app’s report view, copies a group of images and its colour key as one full-quality picture, transparent on macOS.'],
        ['Report images', 'the report view in the app shows its images, loaded once when the report opens.'],
        ['3D viewer', 'ligands and ions are listed under the chain they belong to, with one switch for each.'],
        ['Advanced Console', 'Astra3 starts when the console opens, and every command gets a reply.'],
        ['Methods section', 'exact metric definitions, each structure’s ligands and ions named, and the current RCSB citation.'],
        ['Short chains', 'structures whose chains are all too short for termini complete normally.'],
        ['B-factors', 'NMR entries report B-factor statistics as not applicable; files with all-zero B-factors as not recorded.'],
        ['NMR ensembles', 'the first model is used for every measurement, and the report says so.'],
        ['Change labels', 'solvent-exposure and B-factor labels apply above 26 Å² and 0.2, thresholds from published definitions.'],
        ['Imports', 'each imported file stays its own structure, even with a name already in use, and files sharing a name are told apart by folder.'],
        ['PyMOL', 'a PyMOL too old for Astra3 is named as such; Windows also finds PyMOL in conda installs.'],
      ],
    },
    {
      version: '1.9.1',
      date: '2026-09-23',
      items: [
        ['License', 'Astra3 is now licensed under the GNU General Public License, version 3 or later. Earlier versions were MIT.'],
        ['macOS 26', 'the window shadow is off on macOS 26 and later, avoiding a system-wide slowdown that affects Electron apps of this generation there.'],
        ['Apple Silicon', 'an Intel-only PyMOL on a Mac without Rosetta is now explained, with the command to install Rosetta.'],
        ['PyMOL detection', 'also checks miniforge and mambaforge installs on macOS.'],
        ['Privacy Policy', 'lists the macOS and Windows storage locations separately.'],
      ],
    },
    {
      version: '1.9.0',
      date: '2026-09-20',
      items: [
        ['Related Structures tab', 'finds every experimental entry of the same protein, with method, resolution, ligands, mutations and coverage, suggests OVERLAY or TERMINI use, and warns before you run.'],
        ['Validation data', 'from the wwPDB validation report: clashscore, Ramachandran, rotamer and real-space fit outliers, with the outlier residues.'],
        ['Reference sequence and mutations', 'the UniProt reference and every declared difference, plus residues the PDB identifies as differing.'],
        ['Domains', 'from Pfam, CATH, ECOD, SCOPe and SCOP2, in the structure’s own numbering.'],
        ['Cross-checks', 'warnings when outliers, mutations or tags fall in a terminus window or ligand contacts, and when compared structures differ.'],
        ['Methods section', 'a ready-to-paste Methods paragraph with references, also saved as Methods.txt.'],
        ['Reproducibility', 'reports record the exact command options, and outside data is saved with each run.'],
        ['Imported PDB entries', 'an imported file that names a PDB entry can use that entry’s public data, with your approval; its own header now informs chain-reduction prompts.'],
        ['3D viewer', 'selections keep their representation, stand out in a bright highlight with a moving outline, stay within one structure, and can be hidden; chains are labelled by structure.'],
        ['Works offline', 'analyses complete without the PDB, and reports say what is unavailable.'],
      ],
    },
    {
      version: '1.8.1',
      date: '2026-09-16',
      items: [
        ['Local file imports', '(.pdb, .cif, .mmcif) run end to end; a five-character ID asks whether a chain was meant.'],
        ['Progress bars', 'follow images as they save, with a time estimate; cancelling ends the run.'],
        ['Consistent colours', 'grey for the reference, then sky blue, yellow and onward in OVERLAY and TERMINI.'],
        ['Combined views', 'for OVERLAY and multi-comparison TERMINI runs.'],
        ['TERMINI close-ups', 'with per-comparison arrow colours and a colour key.'],
        ['Reports', 'colour keys, a dark mode switch, info icons, foldable sections, Terminus Sequences, Structural Interpretation and ligand-to-terminus distances.'],
        ['Images tab, Summary page and 3D viewer', 'improvements, including ion recolouring and a full Reset View.'],
      ],
    },
    {
      version: '1.8.0',
      date: '2026-09-11',
      items: [
        ['Analysis workflows', 'multi-selection for OVERLAY and TERMINI, a visual Summary view, zero-occupancy handling, and advanced TERMINI search for large offsets.'],
        ['Progress tracking', 'based on real analysis stages, with time estimates and better cancellation.'],
        ['3D viewer', 'orientation controls, per-item representations, DNA/RNA support and a full Reset View.'],
        ['History', 'storage usage display and deleting entries with or without their files.'],
        ['Local structures', 'more reliable .pdb, .cif, .mmcif and .pse imports.'],
        ['Documentation', 'find-in-page with match highlighting.'],
      ],
    },
  ] satisfies Release[],

  screenshots: [
    ['home', 'Astra3’s home screen: fetch a structure by ID, run OVERLAY or TERMINI comparisons, process a batch, or import a local file.'],
    ['analysis-complete', 'A single-structure analysis finishing: PyMOL runs in the background while Astra3 streams live console output and saves the report, session, and six images.'],
    ['viewer-3d', 'An interactive 3D viewer built into Astra3, with chain visibility, representation styles, and camera controls.'],
    ['report-summary', 'The HTML report explains what changed and why, down to displacement, rotation, and burial at each terminus.'],
    ['report-images', 'Ray-traced views from six angles are generated automatically for every analysis and organized for easy review.'],
    ['batch', 'Batch mode processes a whole queue of structures unattended, with the same reports and images for each one.'],
    ['termini-question', 'Astra3 asks before making a change, like trimming a misaligned terminus, and describes exactly why.'],
    ['summary-tab', 'A visual summary of every recent analysis, so you can jump back into any report, session, or output folder.'],
  ] as [string, string][],
} as const;

export const macDownloadUrl = CONFIG.platforms.macos.url ?? CONFIG.latestReleaseUrl;

/** Platforms that can be downloaded right now, in display order. */
export const availablePlatforms = (['macos', 'windows'] as const).filter((k) => CONFIG.platforms[k].status === 'available' && (k === 'macos' || CONFIG.platforms.windows.url));
export const windowsAvailable = availablePlatforms.includes('windows');
/** "macOS and Windows", or just the one that is available. */
export const platformNames = availablePlatforms.map((k) => CONFIG.platforms[k].name).join(' and ');

/**
 * Central site configuration.
 *
 * Everything that changes between releases lives here: the version, download
 * links, platform availability and release notes. Pages and components read
 * from this file, so none of these values are repeated in markup.
 *
 * When Microsoft Store certification completes:
 *   platforms.windows.status = 'available'
 *   platforms.windows.url    = '<Microsoft Store link>'
 * and rebuild. Every Windows button, note and card switches automatically.
 */

export type PlatformStatus = 'available' | 'comingSoon';

export interface Release {
  version: string;
  date: string; // ISO date
  items: [title: string, detail: string][];
}

const githubUrl = 'https://github.com/andre-aguirre/Astra3';

export const CONFIG = {
  name: 'Astra3',
  fullName: 'Structural Analysis Toolkit for PDB Rendering Automation',
  version: '1.9.0',
  githubUrl,
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
      requirements: 'macOS 12 or later',
      arch: 'Apple Silicon (M1 or newer)',
      formats: '.dmg · .zip',
      signing: 'Developer ID signed and notarized',
    },
    windows: {
      status: 'comingSoon' as PlatformStatus,
      name: 'Windows',
      /** Microsoft Store link once certification completes. */
      url: null as string | null,
      channel: 'Microsoft Store',
    },
  },

  releases: [
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

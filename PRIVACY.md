# Astra3 Privacy Policy

**Effective date:** September 21, 2026 (updated for Astra3 1.9.0)
**Applies to:** Astra3 for Windows (including the Microsoft Store version) and Astra3 for macOS

Astra3 is a desktop application for protein structure analysis, created by Andre Aguirre. This policy explains what information Astra3 handles, where it goes, and what stays on your computer.

## The short version

- Astra3 does **not** collect, store, sell, or share personal information.
- Astra3 has **no** accounts, sign-in, analytics, advertising, tracking, telemetry, or crash reporting.
- Your analyses, imported files, and results stay on **your own computer**.
- The only information that leaves your computer is what is needed to download and look up **public** protein structure data you ask for, sent to the RCSB Protein Data Bank.

## Information Astra3 sends over the internet

Astra3 contacts one organization: the **RCSB Protein Data Bank** (rcsb.org), a public scientific archive. It uses these RCSB services:

| Service | When Astra3 uses it | What the request contains |
|---|---|---|
| Structure downloads (files.rcsb.org) | When you analyze a structure by its PDB ID | The PDB ID |
| Connection check (files.rcsb.org) | Periodically while Astra3 is open, to tell you when you are offline | Nothing about you or your work |
| Data API (data.rcsb.org) | When a report is created for a structure downloaded by PDB ID, or for an imported file you have confirmed is a specific PDB entry, to add validation, reference-sequence and domain information | The PDB ID and the chain identifiers being analyzed |
| Search API (search.rcsb.org) | When you use the Related Structures tab | The UniProt accession of the protein you searched for or, for a protein with no UniProt entry, that public PDB entry's protein sequence |
| Structure images (cdn.rcsb.org) | When the Related Structures tab shows results | The PDB IDs of the listed entries, to load RCSB's published picture of each |

Every request also carries the standard technical information any internet request includes, such as your IP address. All the data exchanged is public data from the Protein Data Bank. The Protein Data Bank handles these requests under its own privacy policy, available at rcsb.org; Astra3 does not receive or keep any record of them beyond the data returned.

Astra3 never uploads your imported files, your results, your reports, or your settings anywhere. Structures you import from your own files are not looked up online, with one exception you control: when an imported file names a PDB entry (for example, 3FXI), Astra3 asks whether the file is that entry. Only if you answer yes does it request that entry's public data, sending only the PDB ID, exactly as for a structure downloaded by its ID. Imported structures work fully offline; without a connection, only that entry's public data is unavailable.

Reports contain links to UniProt (uniprot.org) for reference sequences and to the wwPDB validation report on rcsb.org. Nothing is sent to either unless you click one of those links, which opens it in your web browser.

## Information stored on your computer

Astra3 keeps the following **only on your own computer**. None of it is sent to the developer or to anyone else.

| What | Why | Where |
|---|---|---|
| Analysis results (images, PyMOL sessions, reports, Methods text, exports) | These are what you asked Astra3 to produce | The output folder shown in Settings (by default, `Astra3/Protein_outputs` in your user folder) |
| A copy of the public Protein Data Bank data each report used | So every report can be traced to exactly the data it was built from | The same run's `Session` folder |
| Settings (theme, image quality, fonts, and similar preferences) | So Astra3 remembers your choices | Astra3's app data folder |
| Run history | So you can reopen past results from within Astra3 | Astra3's app data folder |
| Your PyMOL location and chosen output folder | So Astra3 can find PyMOL and save results where you want | `Astra3/config` in your user folder |
| A PyMOL diagnostic log | To help diagnose problems starting PyMOL; it is never sent anywhere | `Astra3/config` in your user folder |
| Files you import | Analyzed locally; only copied into your output folder as part of your results | Wherever you keep them, plus your output folder |

Reports you create can contain file and folder names from your computer. They only leave your computer if you choose to share them.

## PyMOL

Astra3 runs its analysis inside your own separately installed copy of PyMOL. PyMOL is third-party software, and your use of it is governed by the terms and privacy practices of its provider (the open-source PyMOL project or Schrödinger, Inc.). Astra3 reads PyMOL's version and license type only to record them in the reports it generates on your computer.

## How you obtained Astra3

Astra3 itself collects nothing, but the service you downloaded it from may:

- **Microsoft Store (Windows).** Microsoft handles purchases, downloads, installation, and updates under the Microsoft Privacy Statement. Microsoft may provide developers with aggregated, non-identifying statistics such as download counts and app health reports. Astra3 does not add to what Microsoft collects.
- **GitHub (macOS and Windows downloads).** GitHub hosts the release files under the GitHub Privacy Statement. On macOS, Apple may verify the app's notarization when you first open it, under Apple's privacy policy.

## Deleting your data

Because everything is stored locally, you are in complete control:

- Delete any results by deleting them from your output folder.
- Remove Astra3's configuration by deleting the `Astra3` folder in your user folder (this also removes the default output folder, so move any results you want to keep first).
- Uninstalling the Microsoft Store version removes the app and its app data folder. Uninstalling any other version removes the app but leaves its app data folder, which you can delete yourself: `%APPDATA%\Astra3` on Windows, `~/Library/Application Support/Astra3` on macOS.
- In every case your output folder is kept unless you delete it, so you never lose results by accident.

There is nothing to request from the developer, because the developer holds no data about you.

## Children

Astra3 is a scientific tool intended for general and educational use. It does not knowingly collect information from anyone, including children, because it collects no personal information at all.

## Security

Astra3 does not operate servers or store your data remotely, so there is no remote copy of your information that could be exposed. All requests to the Protein Data Bank use encrypted connections (HTTPS).

## Changes to this policy

If Astra3 ever changes how it handles information, this policy will be updated before or alongside that change, and the effective date above will change. Any future feature that sends information anywhere new will be described here first.

## Contact

Questions about this policy or about Astra3:
**Andre Aguirre**
Email: andreaguirre20@outlook.com
Project page: https://github.com/andre-aguirre/Astra3

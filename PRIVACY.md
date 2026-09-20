# Astra3 Privacy Policy

**Effective date:** September 20, 2026
**Applies to:** Astra3 for Windows (including the Microsoft Store version) and Astra3 for macOS

Astra3 is a desktop application for protein structure analysis, created by Andre Aguirre. This policy explains what information Astra3 handles, where it goes, and what stays on your computer.

## The short version

- Astra3 does **not** collect, store, sell, or share personal information.
- Astra3 has **no** accounts, sign-in, analytics, advertising, tracking, telemetry, or crash reporting.
- Your analyses, imported files, and results stay on **your own computer**.
- The only information that leaves your computer is the request needed to download a public protein structure you ask for, sent to the RCSB Protein Data Bank.

## Information Astra3 sends over the internet

Astra3 contacts one external service: the **RCSB Protein Data Bank** (rcsb.org), a public scientific archive.

1. **Structure downloads.** When you enter a PDB ID (for example, 1AKE), Astra3 asks PyMOL to download that public structure file from the Protein Data Bank. The request contains only the structure ID and the standard technical information any internet request includes, such as your IP address.
2. **Connection check.** While Astra3 is open, it periodically checks whether files.rcsb.org can be reached, so it can tell you when you are offline. This check sends no information about you or your work.

The Protein Data Bank handles these requests under its own privacy policy, available at rcsb.org. Astra3 does not receive or keep any record of them.

Astra3 never uploads your imported files, your results, your reports, or your settings anywhere.

## Information stored on your computer

Astra3 keeps the following **only on your own computer**. None of it is sent to the developer or to anyone else.

| What | Why | Where |
|---|---|---|
| Analysis results (images, PyMOL sessions, reports, exports) | These are what you asked Astra3 to produce | The output folder shown in Settings (by default, `Astra3/Protein_outputs` in your user folder) |
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
- Uninstalling Astra3 removes the app and its app data folder. Your output folder is kept unless you delete it, so you never lose results by accident.

There is nothing to request from the developer, because the developer holds no data about you.

## Children

Astra3 is a scientific tool intended for general and educational use. It does not knowingly collect information from anyone, including children, because it collects no personal information at all.

## Security

Astra3 does not operate servers or store your data remotely, so there is no remote copy of your information that could be exposed. Downloads from the Protein Data Bank use encrypted connections (HTTPS).

## Changes to this policy

If Astra3 ever changes how it handles information, this policy will be updated before or alongside that change, and the effective date above will change. Any future feature that sends information anywhere new will be described here first.

## Contact

Questions about this policy or about Astra3:
**Andre Aguirre**
Email: andreaguirre20@outlook.com
Project page: https://github.com/andre-aguirre/Astra3

# ============================================================
# astra3_security.py
# Astra3: Structural Analysis Toolkit for PDB Rendering Automation
# Created by Andre Aguirre
# Copyright (c) 2026 Andre Aguirre
# If Astra3 contributes to published research, please cite:
# Aguirre A. Astra3: Structural Analysis Toolkit for PDB Rendering Automation. 2026.
# Licensed under the GNU General Public License, version 3 or later (GPL-3.0-or-later).
# See LICENSE file for details.
# LinkedIn: https://www.linkedin.com/in/andre-alain-aguirre/
#
# ------------------------------------------------------------
# MODULE: Security & input validation utilities
# ------------------------------------------------------------
# Checks for any user-controlled value (a typed structure ID, an imported
# file path, a batch-file line, a folder name derived from one of those)
# before it becomes a filesystem path, a PyMOL fetch or object name, or a
# subprocess argument. Nothing here talks to PyMOL or the network; invalid
# values raise AstraSecurityError, which callers report as an error line.
#
# Astra3 is a local, single-user tool with no server, accounts or telemetry.
# The risks addressed are a crafted ID, batch line or AST token reading or
# writing outside the output folder, and shell metacharacters reaching a
# subprocess. A hostile multi-user host, a malicious PyMOL build or a
# compromised RCSB are out of scope.
# ------------------------------------------------------------

import os
import re
from pathlib import Path


class AstraSecurityError(Exception):
    """Base class for every validation failure in this module. Callers
    typically catch this (or a subclass) and print RED + str(e) exactly
    like Astra3's other user-facing validation errors, rather than
    letting a raw traceback surface for ordinary bad input."""
    pass


class InvalidStructureIdError(AstraSecurityError):
    pass


class InvalidPathError(AstraSecurityError):
    pass


class PathTraversalError(AstraSecurityError):
    pass


class UnsupportedFileTypeError(AstraSecurityError):
    pass


# ------------------------------------------------------------
# STRUCTURE / AST ID VALIDATION
# ------------------------------------------------------------
# Identifiers Astra3 accepts: 4-character PDB IDs ("1AKE"), 5-character
# entry-plus-chain codes ("1A00A", which PyMOL's fetch accepts) and other
# short accession codes, all [A-Za-z0-9] of 3 to 8 characters; and wwPDB's
# extended IDs ("pdb_00001ake"). Permissive within that shape, so no ID
# Astra3 can fetch is rejected. A well-formed ID that is not an entry fails
# at download.
STRUCTURE_ID_RE = re.compile(r"^(?:[A-Za-z0-9]{3,8}|PDB_[A-Za-z0-9]{8})$", re.IGNORECASE)

# wwPDB's extended PDB ID. Every existing entry's extended ID is its
# 4-character ID behind "pdb_0000" (pdb_00001ake is 1AKE). Entries issued
# once the 4-character IDs run out have only the extended ID, and are
# distributed in mmCIF only.
EXTENDED_ID_RE = re.compile(r"^PDB_([A-Za-z0-9]{8})$", re.IGNORECASE)


def classic_pdb_id(structure_id):
    """The 4-character PDB ID an extended ID stands for (pdb_00001ake ->
    1AKE), or None when it is not one."""
    m = EXTENDED_ID_RE.match(str(structure_id or "").strip())
    if m and m.group(1).startswith("0000"):
        return m.group(1)[4:].upper()
    return None


def is_extended_only_id(structure_id):
    """True for an extended ID with no 4-character form (mmCIF only)."""
    sid = str(structure_id or "").strip()
    return bool(EXTENDED_ID_RE.match(sid)) and classic_pdb_id(sid) is None

# AST IDs are only created by generate_ast_id() in astra3_core.py, and
# is_ast_id() is only true for one in loaded_structures. A string that merely
# looks like one (typed, or in a shared batch file) is matched here and
# rejected before it can reach cmd.fetch() as a structure ID.
AST_ID_RE = re.compile(r"^AST-\d{4}$")

MAX_STRUCTURE_ID_LENGTH = 12  # generous upper bound; the longest shape above is an extended ID


def validate_structure_id(raw_id, known_ast_ids=None):
    """Validate a structure identifier (typed at the prompt, read from a
    batch file, or part of an OVERLAY/TERMINI command) before it is used to
    build a path or passed to cmd.fetch().

    known_ast_ids: the registered AST IDs (loaded_structures from
    astra3_core.py, or its keys). When given, an AST-shaped ID that is not
    registered is rejected instead of being fetched from RCSB as a PDB ID.

    Returns the normalized ID (stripped, upper case); an extended ID of an
    existing entry comes back as its 4-character ID. Raises
    InvalidStructureIdError with a message for the person. Every ID shape
    Astra3 can fetch or resolve is accepted.
    """
    if raw_id is None:
        raise InvalidStructureIdError("No structure ID was provided.")
    candidate = raw_id.strip()
    if not candidate:
        raise InvalidStructureIdError("Structure ID cannot be empty.")
    if len(candidate) > MAX_STRUCTURE_ID_LENGTH:
        raise InvalidStructureIdError(
            f"'{raw_id}' is too long to be a valid structure ID "
            f"(max {MAX_STRUCTURE_ID_LENGTH} characters)."
        )
    candidate = candidate.upper()

    if candidate.startswith("AST-"):
        if not AST_ID_RE.match(candidate):
            raise InvalidStructureIdError(
                f"'{raw_id}' looks like a temporary AST ID but isn't in the expected "
                f"AST-#### format."
            )
        if known_ast_ids is not None and candidate not in known_ast_ids:
            raise InvalidStructureIdError(
                f"'{raw_id}' is not a currently registered AST ID for this session. "
                f"Temporary AST IDs only exist until Astra3 closes; use IMPORT to "
                f"register the file again if needed."
            )
        return candidate

    if not STRUCTURE_ID_RE.match(candidate):
        raise InvalidStructureIdError(
            f"'{raw_id}' isn't a valid PDB/structure ID. Structure IDs must be "
            f"3-8 letters/digits or an extended PDB ID (e.g. '1AKE', '9BOX', 'pdb_00001ake')."
        )
    return classic_pdb_id(candidate) or candidate


# ------------------------------------------------------------
# PATH SAFETY: normalization, containment, and traversal prevention
# ------------------------------------------------------------
def safe_join(base_dir, *parts):
    """Join base_dir with the given parts and check that the resolved
    result is still inside base_dir. For any path built from a value a person
    or a file supplied (a structure ID, an imported file's name, a batch-file
    line) that must stay inside an output, session or images folder.

    The check compares resolved paths (Path.resolve() and relative_to()). A
    string-prefix test would accept "/a/bc" for base "/a/b" and would not
    resolve ".." or symlinks. A part that merely contains ".." ("1..A") is
    fine; only a path that resolves outside base_dir is refused.

    Returns the resolved Path. Raises PathTraversalError when the path would
    leave base_dir.
    """
    base_resolved = Path(base_dir).resolve()
    candidate = base_resolved.joinpath(*[str(p) for p in parts])
    target_resolved = candidate.resolve()
    try:
        target_resolved.relative_to(base_resolved)
    except ValueError:
        raise PathTraversalError(
            f"Refusing to access a path outside the expected directory "
            f"({target_resolved} is not inside {base_resolved})."
        )
    return target_resolved


def safe_output_dirname(identifier_or_ids, suffix="_Output"):
    """A directory name built from one or more structure identifiers, for
    get_output_folders() and the like.

    IDs normally arrive validated (validate_structure_id), but an imported
    file's display name can hold any character. Everything except letters,
    digits, underscore and hyphen becomes an underscore, so no path separator
    or ".." can reach the name.
    """
    if isinstance(identifier_or_ids, (list, tuple)):
        raw = "_".join(str(x) for x in identifier_or_ids)
    else:
        raw = str(identifier_or_ids)
    # Letters, digits, underscore and hyphen; everything else, path separators
    # and dots included, becomes an underscore.
    cleaned = re.sub(r"[^A-Za-z0-9_\-]", "_", raw)
    cleaned = re.sub(r"_+", "_", cleaned).strip("_")
    if not cleaned:
        cleaned = "structure"
    return cleaned + suffix


def validate_output_path(path, base_dir, must_be_dir=False):
    """Check that `path` resolves inside `base_dir` before Astra3 writes
    to it. A final check for output paths built from supplied values, in
    addition to building them with safe_join().

    Returns the resolved Path. Raises PathTraversalError when it is outside
    base_dir, or InvalidPathError when must_be_dir is True and something
    other than a directory is already there.
    """
    base_resolved = Path(base_dir).resolve()
    target_resolved = Path(path).resolve()
    try:
        target_resolved.relative_to(base_resolved)
    except ValueError:
        raise PathTraversalError(
            f"Refusing to write output outside the expected directory "
            f"({target_resolved} is not inside {base_resolved})."
        )
    if must_be_dir and target_resolved.exists() and not target_resolved.is_dir():
        raise InvalidPathError(f"Expected a directory but found a file at {target_resolved}.")
    return target_resolved


# ------------------------------------------------------------
# INPUT FILE VALIDATION (IMPORT, BATCH file, etc.)
# ------------------------------------------------------------
def validate_input_file(path, allowed_extensions, must_exist=True):
    """Validate a file a person points Astra3 at (IMPORT's structure
    file, a BATCH list).

    allowed_extensions: extensions with or without the leading dot ("pdb" or
    ".pdb"), compared case-insensitively.

    Checks, in order: the path is not empty; (if must_exist) it exists; it is
    a file, not a directory; its extension is allowed. File contents are not
    examined here; structure_file_problem and the loader do that.

    Returns the resolved Path. Raises InvalidPathError or
    UnsupportedFileTypeError with a message for the person.
    """
    if not path or not str(path).strip():
        raise InvalidPathError("No file path was provided.")

    normalized_exts = set()
    for ext in allowed_extensions:
        ext = ext.lower()
        if not ext.startswith("."):
            ext = "." + ext
        normalized_exts.add(ext)

    resolved = Path(str(path).strip()).expanduser().resolve()

    if must_exist and not resolved.exists():
        raise InvalidPathError(f"File does not exist: {resolved}")
    if must_exist and not resolved.is_file():
        raise InvalidPathError(f"Expected a file but found a directory: {resolved}")

    if resolved.suffix.lower() not in normalized_exts:
        allowed_display = ", ".join(sorted(normalized_exts))
        raise UnsupportedFileTypeError(
            f"Unsupported file type '{resolved.suffix or '(none)'}' for {resolved.name}. "
            f"Supported types: {allowed_display}"
        )
    return resolved


# ------------------------------------------------------------
# SUBPROCESS SAFETY
# ------------------------------------------------------------
def open_path_in_file_manager(target_path):
    """Show a file or folder in Finder, Explorer or the file manager.

    No shell is involved, so the path is passed as written whatever it
    contains: `open` on macOS and `xdg-open` on Linux through subprocess with
    an argument list, os.startfile on Windows. A failure (no such program, no
    permission) is ignored; this is a convenience.
    """
    import subprocess
    import sys as _sys

    path_str = str(target_path)
    try:
        if _sys.platform == "darwin":
            subprocess.run(["open", path_str], check=True)
        elif _sys.platform == "win32":
            os.startfile(path_str)  # never invokes a shell; Windows-native, no subprocess needed
        else:
            subprocess.run(["xdg-open", path_str], check=True)
    except Exception:
        pass

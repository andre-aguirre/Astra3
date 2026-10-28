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
# Centralizes the checks Astra3 needs wherever a user-controlled value
# (a typed structure ID, an imported file path, a batch-file line, an
# output folder name derived from one of those) is about to become a
# filesystem path, a PyMOL fetch/object-name argument, or a subprocess
# argument. Nothing in this file talks to PyMOL, the filesystem beyond
# existence/type checks, or the network directly -- it only decides
# "is this value safe to use," and raises a clear, typed error when it
# isn't. Every caller is expected to catch AstraSecurityError (or its
# subclasses) and print the existing project's normal RED-colored
# error line, exactly as astra3.py already does for other invalid-input
# cases -- see each call site for the exact wording.
#
# Threat model this module addresses (see the project's own security
# audit for the full writeup): Astra3 is a local, single-user desktop
# tool with no server, no auth, and no telemetry. The realistic risks
# here are a crafted structure ID / batch-file line / AST-style token
# causing Astra3 to read or write outside its own output directory
# (path traversal), or a value reaching a shell/subprocess call in a
# way that lets shell metacharacters do something unintended. This
# module is deliberately NOT designed against a hostile multi-user
# server environment, malicious PyMOL builds, or a compromised RCSB --
# none of those apply to how Astra3 is actually used.
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
# Calibrated against the real identifier shapes Astra3 needs to accept, not an
# arbitrary tightened pattern -- see PyMOL's own `fetch` and `load`
# documentation and RCSB's extended-CCD-ID announcement: - classic 4-character
# PDB IDs, e.g. "1AKE" - 5-character single-chain codes (4-letter PDB + chain
# letter), e.g. "1A00A" -- PyMOL 1.6+ supports these directly in fetch() -
# RCSB's newer extended alphanumeric IDs (the 5-character CCD-style codes
# Astra3 already handles for mmCIF ligands elsewhere in this project, e.g.
# "A1AQW") -- structure-level accession codes follow the same "letters and
# digits, a handful of characters" shape All of the above are just
# [A-Za-z0-9], typically 3-6 characters. This validator is deliberately
# permissive within that character class and length range rather than
# hardcoding "exactly 4 uppercase letters + digits", specifically so it
# doesn't reject a legitimate ID Astra3 is already able to fetch and analyze
# today. An ID of the right shape that is not an entry is caught when the
# download fails. wwPDB's extended IDs ("pdb_" and eight letters or digits,
# e.g. "pdb_00001ake") are accepted too.
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

# AST IDs are ALWAYS generated internally by generate_ast_id() in
# astra3_core.py ("AST-%04d" % random.randint(1, 9999)) -- a user can never
# type an arbitrary string and have it become a valid AST ID; is_ast_id() only
# returns True for a string that already exists as a key in the internally-
# populated loaded_structures dict. This pattern exists so that a string which
# merely LOOKS like an AST ID (typed by a user, or found in a shared batch
# file) is recognized and rejected with a clear message before it can fall
# through to the PDB-fetch branch and reach cmd.fetch() as a raw, unvalidated
# "structure_id".
AST_ID_RE = re.compile(r"^AST-\d{4}$")

MAX_STRUCTURE_ID_LENGTH = 12  # generous upper bound; the longest shape above is an extended ID


def validate_structure_id(raw_id, known_ast_ids=None):
    """Validate a user-supplied structure identifier (typed at the
    prompt, read from a batch file, or embedded in an OVERLAY/TERMINI
    command) BEFORE it is used to build a filesystem path or passed to
    cmd.fetch().

    known_ast_ids: optional iterable/mapping of currently-registered
    AST IDs (pass loaded_structures from astra3_core.py, or its
    .keys()) -- when given, a syntactically AST-shaped ID that isn't
    actually registered is rejected outright rather than silently
    falling through to be treated as a PDB ID and fetched from RCSB
    under that literal string.

    Returns the normalized (uppercased, stripped) ID on success; an
    extended ID of an existing entry comes back as its 4-character ID.
    Raises InvalidStructureIdError with a clear, user-facing message
    on any rejection. Never raises for any ID shape Astra3 could
    already legitimately fetch or resolve today.
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
                f"Temporary AST IDs only exist until Astra3 closes -- use IMPORT to "
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
    """Join base_dir with the given path parts and verify the RESOLVED
    result is still inside base_dir. Use this anywhere Astra3 builds a
    path from a user-influenced value (a structure ID, an AST display
    name, anything read from a batch file) that is meant to stay
    inside a specific output/session/images directory.

    Uses resolved-path comparison (Path.resolve() +
    PurePath.relative_to()) rather than a string-prefix check, per the
    the safer choice -- a prefix check like
    str(target).startswith(str(base)) is fooled by e.g. base_dir
    "/a/b" matching a sibling directory "/a/bc", and doesn't resolve
    ".." segments or symlinks the way Path.resolve() does.

    Returns the resolved, safe Path. Raises PathTraversalError if the
    joined path would resolve outside base_dir.

    This does NOT reject a part merely for containing ".." as a
    substring -- e.g. "1..A" or a filename with dots in it is fine as
    long as the final resolved location is still inside base_dir. Only
    the actual escape is rejected, per the project's explicit
    preference for resolved-path validation over blind ".." string
    matching.
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
    """Build a filesystem-safe directory name fragment from one or more
    structure identifiers, for use in get_output_folders() and friends.

    Structure IDs reaching this point should already have passed
    validate_structure_id() (which restricts them to [A-Za-z0-9], 3-8
    chars, or an extended ID) -- this function is a second, cheap layer of defense that
    strips anything that isn't alphanumeric/underscore/hyphen before
    the name is used in a path, so even a value that reached here
    through some path OTHER than validate_structure_id() (display
    names for imported files can contain arbitrary characters from the
    original filename, for instance) can't inject path separators or
    ".." segments into the resulting directory name.
    """
    if isinstance(identifier_or_ids, (list, tuple)):
        raw = "_".join(str(x) for x in identifier_or_ids)
    else:
        raw = str(identifier_or_ids)
    # Keep letters, digits, underscore, hyphen, and space (existing output
    # folder names already use these, e.g. "AST-0001_Output" and multi-
    # structure names like "Overlay_6DK3_9BOX_Output") -- strip everything
    # else, INCLUDING path separators and ".." sequences, rather than trying
    # to enumerate every dangerous character.
    cleaned = re.sub(r"[^A-Za-z0-9_\-]", "_", raw)
    cleaned = re.sub(r"_+", "_", cleaned).strip("_")
    if not cleaned:
        cleaned = "structure"
    return cleaned + suffix


def validate_output_path(path, base_dir, must_be_dir=False):
    """Validate that `path` is a safe location to write Astra3 output
    to: it must resolve to somewhere inside `base_dir`. Use this as a
    final check before os.makedirs()/open(...) on any output path built
    from user-influenced components, in addition to (not instead of)
    building the path with safe_join() in the first place -- defense
    in depth for the rare case a path reaches a write call without
    having gone through safe_join().

    Returns the resolved Path. Raises PathTraversalError if outside
    base_dir, or InvalidPathError if must_be_dir is True and an
    existing path at that location is not a directory.
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
    """Validate a file the user is pointing Astra3 at for import/reading
    (IMPORT's structure file, a BATCH .txt file, etc.).

    allowed_extensions: iterable of extensions WITHOUT the leading dot
    is also accepted (e.g. "pdb" or ".pdb" both work), compared
    case-insensitively.

    Checks, in order:
      1. the path is non-empty and resolves cleanly
      2. (if must_exist) something actually exists there
      3. it is a FILE, not a directory (a directory passed where a
         file was expected is a common source of confusing downstream
         errors, and is now caught here with a clear message instead)
      4. its extension is one of allowed_extensions

    This intentionally does NOT try to sniff or validate file CONTENT
    (e.g. parsing the PDB/PSE format itself) -- that is PyMOL's job
    when it loads the file, and duplicating it here would risk
    rejecting a legitimate-but-unusual structure file Astra3 could
    otherwise handle fine. This function only answers "is this a real
    file of a type Astra3 is supposed to accept," matching the
    aim of avoiding unnecessarily restrictive
    validation.

    Returns the resolved Path on success. Raises InvalidPathError or
    UnsupportedFileTypeError with a clear message on failure.
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
    """Cross-platform 'reveal this file/folder in Finder/Explorer/file
    manager' -- replaces the previous os.system(f'open "{path}"') /
    os.system(f'xdg-open "{path}"') calls, which invoke a real shell
    (os.system always does) even though the path being opened wasn't
    attacker-controlled in practice. Using subprocess.run with an
    argument list removes shell interpretation entirely, so this stays
    safe regardless of what target_path ever contains (spaces,
    parentheses, unicode -- all handled correctly, since the OS/exec
    layer receives the path as a single argument rather than a
    shell-parsed string).

    macOS uses `open`, Windows uses os.startfile (no subprocess needed
    -- os.startfile never invokes a shell), Linux uses `xdg-open`.
    Silently no-ops on failure (missing `open`/`xdg-open`, permissions,
    etc.), matching the previous behavior's bare `except Exception:
    pass` -- this is a convenience action, not a critical one, and
    failing loudly here would be disproportionate.
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

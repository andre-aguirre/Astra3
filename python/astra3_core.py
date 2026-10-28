# ============================================================
# astra3_core.py
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
# MODULE: Core utilities
# ------------------------------------------------------------
# This module holds everything the rest of Astra3 depends on:
#   - imports & terminal color codes
#   - Ctrl+C / cancellation handling
#   - base-directory & output-folder detection
#   - the AST-XXXX temporary structure registry
#   - shared color maps/lists used to keep chain/ligand/ion
#     coloring consistent across every structure processed
#     in a run
#   - PDB header (HEADER / RESOLUTION / REMARK 465) parsing
#   - small formatting helpers (resolution classification,
#     compact residue-range formatting)
#
# Nothing in this file performs PyMOL structural analysis,
# rendering, or report generation: see astra3_structure.py
# and astra3_render_report.py for those. This file is imported
# by every other Astra3 module.
# ------------------------------------------------------------


from pymol import cmd
import os
import sys
import signal
import time
import re
import random
import shutil
import itertools
import csv
import json
from collections import Counter
from dataclasses import dataclass
import difflib
from pathlib import Path
import html as html_escape
import tempfile
import base64  # added for embedding logo in HTML
from astra3_security import safe_join, safe_output_dirname, PathTraversalError, classic_pdb_id


# cmd.iterate/alter expressions are evaluated in the namespace passed as
# `space`. Before Python 3.10, a namespace without __builtins__ gets none when
# PyMOL evaluates it, so int(), len() and the like raise NameError in a PyMOL
# built on Python 3.7-3.9. Every namespace is given the builtins here.
def _with_builtins(function, space_position):
    import builtins

    def wrapper(*args, **kwargs):
        space = kwargs.get("space", args[space_position] if len(args) > space_position else None)
        if isinstance(space, dict) and "__builtins__" not in space:
            space["__builtins__"] = builtins
        return function(*args, **kwargs)
    wrapper.__name__ = getattr(function, "__name__", "wrapper")
    wrapper.__doc__ = getattr(function, "__doc__", None)
    wrapper._astra3_builtins = True
    return wrapper


for _name, _position in (("iterate", 3), ("alter", 3), ("iterate_state", 4), ("alter_state", 4)):
    _function = getattr(cmd, _name, None)
    if _function is not None and not getattr(_function, "_astra3_builtins", False):
        setattr(cmd, _name, _with_builtins(_function, _position))

# Terminal colors
#
# On Windows, a real console window does not always interpret ANSI escape
# codes as colors out of the box; it depends on whether
# ENABLE_VIRTUAL_TERMINAL_PROCESSING has been turned on for that console,
# which varies across Windows versions/configurations (recent Windows 10/11
# generally enable it by default, but this is not universally guaranteed).
# Without it, every RED/GREEN/etc. code below would print as literal garbage
# characters instead of color in a plain console window. This only
# matters for that raw console path: when PyMOL is spawned by the desktop app
# instead (stdout piped, not a real console), GetStdHandle/SetConsoleMode
# below harmlessly no-ops on a non-console handle, and pymol-bridge.js's own
# stripAnsi() already removes these codes before the GUI ever displays a line,
# so nothing here affects that path either way.
if sys.platform == "win32":
    try:
        import ctypes
        _STD_OUTPUT_HANDLE = -11
        _ENABLE_VIRTUAL_TERMINAL_PROCESSING = 0x0004
        _kernel32 = ctypes.windll.kernel32
        _stdout_handle = _kernel32.GetStdHandle(_STD_OUTPUT_HANDLE)
        _current_mode = ctypes.c_uint32()
        if _kernel32.GetConsoleMode(_stdout_handle, ctypes.byref(_current_mode)):
            _kernel32.SetConsoleMode(_stdout_handle, _current_mode.value | _ENABLE_VIRTUAL_TERMINAL_PROCESSING)
    except Exception:
        # Best-effort only. If this fails for any reason (no real console, an
        # unusual Windows configuration, ctypes unavailable in some restricted
        # environment), colors simply don't render; every print() call below
        # still works correctly either way.
        pass

RED = "\033[91m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
VIOLET = "\033[95m"
CYAN = "\033[96m"
WHITE = "\033[97m"
RESET = "\033[0m"
BOLD = "\033[1m"

# ------------------------------------------------------------
# Cancellation handling & SIGINT integration
# ------------------------------------------------------------
class OperationCancelled(Exception):
    """Internal control-flow signal for a user-requested cancellation."""


cancel_requested = False


def clear_cancellation():
    global cancel_requested
    cancel_requested = False


def check_for_cancellation():
    if cancel_requested:
        raise OperationCancelled


def handle_sigint(signum, frame):
    """Turn terminal Ctrl+C into a cancellable PyMOL operation interrupt."""
    global cancel_requested
    cancel_requested = True
    try:
        cmd.interrupt()
    except Exception:
        pass


signal.signal(signal.SIGINT, handle_sigint)

# Astra3's own version -- single source of truth, imported by the report
# generators so every report type states the same version.
ASTRA3_VERSION = "2.0.1"


def display_date(value=None, with_time=False):
    """A date as reports show it: MM-DD-YYYY, with HH:MM (24-hour, local time)
    when with_time is set. value is None for now, "YYYY-MM-DD", a local
    "YYYY-MM-DD HH:MM:SS", or a UTC stamp ending in "Z" or "+00:00", which is
    shown in local time. Anything else is returned as it is. JSON exports keep
    ISO dates; this is only for what people read."""
    import calendar
    if value is None:
        stamp = time.localtime()
    else:
        text = str(value).strip()
        m = re.match(r"^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(\.\d+)?(Z|[+-]00:?00)?)?$", text)
        if not m:
            return text
        y, mo, d, hh, mm, ss, _frac, utc = m.groups()
        if hh is None:
            return f"{mo}-{d}-{y}"
        fields = (int(y), int(mo), int(d), int(hh), int(mm), int(ss or 0), 0, 0, -1)
        stamp = time.localtime(calendar.timegm(fields)) if utc else time.localtime(time.mktime(fields))
    return time.strftime("%m-%d-%Y %H:%M" if with_time else "%m-%d-%Y", stamp)


def engine_name():
    """The molecular engine running Astra3, as the app sets ASTRA3_ENGINE:
    "ChimeraX", "Astra3 Engine", otherwise "PyMOL"."""
    engine = os.environ.get("ASTRA3_ENGINE", "").strip().lower()
    return {"chimerax": "ChimeraX", "astra3": "Astra3 Engine"}.get(engine, "PyMOL")


def engine_label():
    """The engine and its version as the console and the app's top bar show
    them ("PyMOL v3.1.8", "ChimeraX v1.9"); the name alone when the version
    is unknown."""
    version = get_pymol_version_string()
    return f"{engine_name()} v{version}" if version[:1].isdigit() else engine_name()


def session_extension():
    """File extension of the session the engine saves."""
    return ".cxs" if engine_name() == "ChimeraX" else ".pse"


def get_pymol_version_string():
    """PyMOL's own version number, for the report footer's reproducibility
    line. cmd.get_version() is real, stable, documented PyMOL API --
    confirmed against PyMOL's own command reference -- returning a tuple
    whose first element is the human-readable version string (e.g.
    "3.1.8"); future versions may have more version components than
    today's (major.minor.patch), so this reads the string PyMOL itself
    already formatted rather than assuming a fixed number of parts.
    """
    try:
        version_tuple = cmd.get_version()
        if version_tuple and len(version_tuple) > 0 and version_tuple[0]:
            return str(version_tuple[0])
    except Exception:
        pass
    return "Not detected"


def get_pymol_license_string():
    """Best-effort PyMOL license/edition detection for the report
    footer's reproducibility line.

    HONEST LIMITATION: unlike get_version(), PyMOL has no single stable,
    documented API call across versions that just reports "Educational"
    vs "Incentive" vs "Open-Source" -- checked directly against PyMOL's
    own command reference and API-only function list before writing
    this, rather than guessing at a plausible-sounding attribute name.
    What IS real, sourced directly from PyMOL's own modules/pymol/
    invocation.py (its own command-line-flag documentation there
    explicitly notes "-n INTERNAL - do not use (incentive_product=1)"),
    is pymol.invocation.options.incentive_product -- the flag PyMOL's
    own launcher sets and its own C extension reads to decide whether
    to enable Incentive-only features at all, confirmed further by
    PyMOL's own wiki documentation on scripting PyMOL from Python
    (User:Speleo3), which uses pymol.invocation.options directly as the
    live config object passed into PyMOL's own core at startup. This
    distinguishes Incentive builds from Open-Source builds. It does NOT
    distinguish Educational-use-only Incentive from a paid Incentive
    subscription -- both present as the same incentive_product flag,
    since that distinction lives in the license FILE PyMOL loaded,
    which has no exposed read API. Rather than guess at that finer
    distinction, this reports what can actually be verified and says so
    plainly for anything it can't. Wrapped defensively: if the attribute
    ever moves or isn't present in some build, this degrades to "not
    detected" rather than crashing report generation.
    """
    if engine_name() == "ChimeraX":
        return "UCSF ChimeraX (free for non-commercial use)"
    if engine_name() == "Astra3 Engine":
        return "GPL-3.0-or-later (part of Astra3)"
    try:
        from pymol import invocation
        if getattr(invocation, "options", None) is not None:
            if getattr(invocation.options, "incentive_product", False):
                return "Incentive (exact tier -- Educational or licensed -- not distinguishable via API)"
            return "Open-Source"
    except Exception:
        pass
    return "Not automatically detected"

# Pastel star colors for ASTRA3 terminal header
STAR_LIGHT = "\033[38;5;229m"
STAR_PASTEL = "\033[38;5;221m"
STAR_DARK = "\033[38;5;179m"
ASTRA_PURPLE = "\033[1;38;5;135m"

# GUI hints
try:
    cmd.set("internal_gui_width", 300)
    cmd.set("internal_gui_height", 250)
except Exception:
    pass
try:
    cmd.set("show_frame", 0)
except Exception:
    pass

# ------------------------------------------------------------
# ROBUST BASE DIRECTORY DETECTION (safe for PyMOL run)
# ------------------------------------------------------------
def _is_within_any(path: Path, prefixes):
    """Return True if path is inside any prefix (conservative)."""
    try:
        p_resolved = path.resolve()
    except Exception:
        return False
    for prefix in prefixes:
        # The file system root is no interpreter's own folder (WebAssembly
        # Python in the Astra3 Engine reports sys.prefix as "/").
        if prefix is None or prefix.parent == prefix:
            continue
        try:
            pref_resolved = prefix.resolve()
            try:
                if p_resolved.is_relative_to(pref_resolved):
                    return True
            except Exception:
                if str(p_resolved).startswith(str(pref_resolved)):
                    return True
        except Exception:
            try:
                if str(p_resolved).startswith(str(prefix)):
                    return True
            except Exception:
                pass
    return False


def find_launcher_dir(start: Path):
    """Walk up a few levels searching for astra3.command (Mac/Linux) or
    -- the launcher identifies the
    Astra3 install folder equally well, so both are checked rather than
    assuming one platform's launcher filename."""
    p = start.resolve()
    for _ in range(6):
        if (p / "astra3.command").exists() or (p / "astra3.bat").exists():
            return p
        if p.parent == p:
            break
        p = p.parent
    return None


def detect_base_dir():
    """Determine a safe base directory for Astra outputs."""
    prefixes = set()
    try:
        prefixes.add(Path(sys.prefix).resolve())
    except Exception:
        pass
    try:
        pymol_mod = Path(cmd.__file__).resolve().parent
        prefixes.add(pymol_mod)
    except Exception:
        pass

    # 1) environment override
    env = os.environ.get("ASTRA3_BASE_DIR")
    if env:
        try:
            p = Path(env).resolve()
            if not _is_within_any(p, prefixes):
                return p
        except Exception:
            pass

    # 2) script file location (when run directly)
    sf = globals().get("__file__")
    if sf:
        try:
            sfp = Path(sf).resolve().parent
            if sfp.exists() and not _is_within_any(sfp, prefixes):
                return sfp
        except Exception:
            pass

    # 3) sys.argv hints
    for arg in sys.argv:
        try:
            if "astra3" in str(arg).lower():
                cand = Path(arg).resolve()
                if cand.is_file():
                    parent = cand.parent
                    if not _is_within_any(parent, prefixes):
                        return parent
        except Exception:
            pass

    # 4) search upward from cwd
    try:
        cwd = Path.cwd().resolve()
        launcher_dir = find_launcher_dir(cwd)
        if launcher_dir and not _is_within_any(launcher_dir, prefixes):
            return launcher_dir
    except Exception:
        pass

    # 5) search from home
    try:
        home = Path.home().resolve()
        launcher_dir = find_launcher_dir(home)
        if launcher_dir and not _is_within_any(launcher_dir, prefixes):
            return launcher_dir
    except Exception:
        pass

    # 6) use cwd if writable and not inside PyMOL install
    try:
        cwd = Path.cwd().resolve()
        if not _is_within_any(cwd, prefixes):
            try:
                test_dir = cwd / ".astra3_write_test"
                test_dir.mkdir(parents=True, exist_ok=True)
                shutil.rmtree(str(test_dir))
                return cwd
            except Exception:
                pass
    except Exception:
        pass

    # 7) fallback to home
    try:
        return Path.home().resolve()
    except Exception:
        return Path(tempfile.gettempdir()).resolve()


# Determine and prepare base/output folders
BASE_DIR_PATH = detect_base_dir()
BASE_DIR = str(BASE_DIR_PATH)
BASE_DIR_STR = str(BASE_DIR_PATH)
OUTPUT_DIR_PATH = BASE_DIR_PATH / "Protein_outputs"
try:
    OUTPUT_DIR_PATH.mkdir(parents=True, exist_ok=True)
except PermissionError:
    try:
        fallback = Path.home().resolve() / "Astra3_output"
        fallback.mkdir(parents=True, exist_ok=True)
        OUTPUT_DIR_PATH = fallback
    except Exception:
        fallback2 = Path(tempfile.gettempdir()) / "Astra3_output"
        fallback2.mkdir(parents=True, exist_ok=True)
        OUTPUT_DIR_PATH = fallback2
except Exception:
    try:
        OUTPUT_DIR_PATH.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass

PROTEIN_OUTPUTS_DIR = os.path.join(BASE_DIR, "Protein_outputs")
os.makedirs(PROTEIN_OUTPUTS_DIR, exist_ok=True)
# Where PyMOL's fetch keeps what it downloads. A folder of Astra3's own: fetch loads a file of the
# right name already in its fetch folder instead of downloading, so using the folder a person keeps
# their own files in could load one of those files as the RCSB entry.
FETCH_DIR = os.path.join(BASE_DIR, ".astra3_fetch")
os.makedirs(FETCH_DIR, exist_ok=True)
try:
    cmd.set("fetch_path", FETCH_DIR)
except Exception:
    pass
# Coordinates as deposited. A few older entries (2DHB, for one) keep their
# atoms in a non-standard crystal frame; PyMOL by default moves them into the
# standard frame on loading, so its coordinates would differ from the PDB
# file, from RCSB and from ChimeraX. The structure itself is unchanged by
# that move, but overlays start from a different position.
try:
    cmd.set("pdb_insure_orthogonal", 0)
except Exception:
    pass

# ------------------------------------------------------------
# UNIFIED STRUCTURE REGISTRY (must be defined before any OVERLAY logic uses
# it)
# ------------------------------------------------------------
loaded_structures = {}
active_operation_objects = set()


def cancel_active_operation():
    """Remove partial objects created by the active command after Ctrl+C."""
    for obj in list(active_operation_objects):
        try:
            cmd.delete(obj)
        except Exception:
            pass
    active_operation_objects.clear()


def generate_ast_id():
    while True:
        candidate = "AST-%04d" % random.randint(1, 9999)
        if candidate not in loaded_structures:
            return candidate


def register_structure(structure_type, path, object_name, display_name, part=None, ast_id=None):
    """part: the structure's name inside its file (session object or mmCIF
    data block) when a file's structures are registered separately.
    ast_id: use this ID instead of a new one, if it is free."""
    if ast_id is None or ast_id in loaded_structures:
        ast_id = generate_ast_id()
    loaded_structures[ast_id] = {
        "type": structure_type,
        "path": path,
        "object_name": object_name,
        "display_name": display_name,
        "part": part,
    }
    return ast_id


def is_ast_id(identifier):
    return identifier.upper().startswith("AST-") and identifier.upper() in loaded_structures


def resolve_structure(identifier):
    identifier = identifier.upper()
    if is_ast_id(identifier):
        resolved = loaded_structures[identifier].copy()
        resolved["type"] = "AST_ID"
        resolved["ast_id"] = identifier
        return resolved
    return {
        "type": "PDB_ID",
        "path": None,
        "object_name": None,
        "display_name": classic_pdb_id(identifier) or identifier,
    }


# ------------------------------------------------------------
# STRUCTURE-ID TOKEN PARSING (shared by every command that accepts PDB IDs on
# the command line: the bare single-ID prompt, OVERLAY, TERMINI, BATCH)
# ------------------------------------------------------------
MMCIF_FLAG = "-mmcif"


def parse_structure_ids_with_format_flags(tokens, other_flag_prefixes=None):
    """Parse a token list into structure IDs, each tagged with its
    requested fetch format ('pdb' or 'cif'), honoring an optional
    per-ID '-mmCIF' flag.

    The -mmCIF flag applies ONLY to the single structure ID immediately
    preceding it in the token list -- it never propagates forward or
    backward beyond that one ID. This matches how -reference<ID> and
    other per-token flags already behave elsewhere in Astra3: a flag is
    read in the position it appears, not applied globally to the whole
    command.

    Examples (tokens after the command word itself):
        ["9BOX"]                       -> [("9BOX", "pdb")]
        ["9BOX", "-mmCIF"]             -> [("9BOX", "cif")]
        ["6DK3", "9BOX", "-mmCIF"]     -> [("6DK3", "pdb"), ("9BOX", "cif")]
        ["6DK3", "-mmCIF", "9BOX"]     -> [("6DK3", "cif"), ("9BOX", "pdb")]

    A -mmCIF flag with no preceding structure ID (e.g. it's the first
    token, or the previous token was itself a different flag) is
    ignored rather than raising -- it has nothing to attach to, so it
    is simply dropped. This is a deliberate "warn, don't block" choice
    consistent with the rest of Astra3, though callers may want to
    print their own notice in that case using the returned
    `unattached_flag_count`.

    other_flag_prefixes: an optional iterable of lowercase flag
    prefixes (e.g. ("-reference",)) that this function should also
    recognize as flags (so they're skipped rather than misread as a
    structure ID) without assigning them any format-flag meaning.
    Every other_flag_prefixes match, and any bare '-something' token,
    is treated as "not a structure ID" and skipped; it is the caller's
    job to separately parse flags it cares about (this function's only
    job is the ID/format pairing).

    Returns (id_format_pairs, unattached_flag_count) where
    id_format_pairs is a list of (structure_id_upper, "pdb"|"cif")
    tuples in the order the IDs were given, and unattached_flag_count
    is how many -mmCIF flags could not be attached to a preceding ID.
    """
    other_flag_prefixes = tuple(p.lower() for p in (other_flag_prefixes or ()))
    pairs = []
    unattached_flag_count = 0
    idx = 0
    while idx < len(tokens):
        token = tokens[idx]
        lowered = token.lower()
        if lowered == MMCIF_FLAG:
            if pairs:
                last_id, _ = pairs[-1]
                pairs[-1] = (last_id, "cif")
            else:
                unattached_flag_count += 1
            idx += 1
            continue
        if lowered.startswith("-") or any(lowered.startswith(p) for p in other_flag_prefixes):
            # Not a structure ID (either a recognized other-flag, or an
            # unrecognized '-' token) -- skip it. -reference<ID>'s own
            # optional trailing-token value (e.g. "-reference 1ABC" with a
            # space) is intentionally NOT consumed here; that pairing is
            # parse_overlay_arguments' job, run separately on the same token
            # list.
            idx += 1
            continue
        pairs.append((token.upper(), "pdb"))
        idx += 1
    return pairs, unattached_flag_count


# ------------------------------------------------------------
# COLOR PALETTES (including OVERLAY palettes)
# ------------------------------------------------------------
# Protein chain colors: neutral greys/browns so ligands and termini coloring
# (green/red) stand out clearly against them.
PROTEIN_COLOR_LIST = ["grey80", "grey60", "grey40", "brown", "wheat", "dirtyviolet", "sand", "grey90"]

# Per-structure palettes for multi-structure runs.
#
# PROTEIN_COLOR_LIST cycles by CHAIN within one structure, which is right for
# a single structure and wrong for a comparison: every structure's chain A
# came out grey80, so an overlay of three was three identical greys and the
# reference was indistinguishable from the comparisons.
#
# The reference keeps the greys it has always had. Each comparison takes a
# distinct hue, in an order chosen to stay legible against grey and against
# each other. The list cycles, so a run is never limited by its length.
# The first colour of each list is the one OVERLAY_PROTEIN_COLORS gives the
# same structure, so a single-chain structure is drawn in one colour whether
# it appears in an OVERLAY or a TERMINI run.
REFERENCE_COLOR_LIST = ["grey50", "grey70", "grey85", "grey35"]
COMPARISON_COLOR_LISTS = [
    ["skyblue", "lightblue", "slate"],
    ["yellow", "gold", "paleyellow"],
    ["forest", "palegreen", "green"],
    ["purple", "violet", "lightmagenta"],
    ["pink", "lightpink", "hotpink"],
    ["cyan", "teal", "aquamarine"],
    ["raspberry", "firebrick", "salmon"],
    ["blue", "deepblue", "marine"],
    ["orange", "brightorange", "lightorange"],
    ["chocolate", "sand", "wheat"],
]


def structure_palette(index):
    """Colour list for the index-th structure of a comparison run.

    index 0 is the reference. Any index beyond the palette wraps, so the
    number of structures in a run is never capped by this.
    """
    if index <= 0:
        return list(REFERENCE_COLOR_LIST)
    return list(COMPARISON_COLOR_LISTS[(index - 1) % len(COMPARISON_COLOR_LISTS)])



# Ligand colors: vibrant, high-contrast hues that read clearly against the
# neutral protein greys/browns and don't collide with the green/red used for
# N-/C-terminus coloring elsewhere. Black is a legitimate PyMOL color but
# reads as "no color" / background at a glance, so it's placed last as a
# fallback only once every other color in the list has been used, rather than
# being one of the first colors a ligand is likely to get.
LIGAND_COLOR_LIST = ["yellow", "hotpink", "marine", "orange", "purple", "cyan", "magenta", "deepsalmon", "black"]

# Ion colors: softer/pastel variants so ions read as distinct from both the
# bolder ligand palette above and the protein/termini colors, without
# competing for visual attention (ions are usually numerous and small).
ION_COLOR_LIST = ["lightpink", "paleyellow", "palecyan", "lightblue", "bluewhite", "aquamarine", "lightorange", "wheat"]

# Overlay palettes (used for multi-structure overlays)
OVERLAY_PROTEIN_COLORS = ["grey", "skyblue", "yellow", "forest", "purple", "pink", "cyan", "raspberry",
                          "blue", "orange", "chocolate"]
if len(OVERLAY_PROTEIN_COLORS) < 2:
    OVERLAY_PROTEIN_COLORS = ["grey", "blue"]
# Same vibrant, non-black-first, non-green/red/grey/brown philosophy as
# LIGAND_COLOR_LIST above, kept as a separate list since OVERLAY renders
# multiple structures' ligands together and benefits from its own rotation.
OVERLAY_LIGAND_COLORS = ["yellow", "hotpink", "marine", "orange", "purple", "cyan", "magenta", "deepsalmon", "black"]

# N- and C-terminus colours, and whether terminus windows are coloured.
TERMINUS_COLORS = {"enabled": True, "n": "green", "c": "red"}

# Terminus arrow colours (RGB, 0-1) in TERMINI close-ups, (N, C) per pair.
# The reference keeps orange (N) and pink (C) in every close-up -- it is the
# same structure in every pair, so a stable colour is what makes it findable.
# Each comparison takes its own pair by its position in the report's
# best-match order; a run with one comparison uses cyan and bright yellow.
# The list wraps, so the number of comparisons is never capped by it.
REFERENCE_ARROW_COLORS = [(1.0, 0.5, 0.0), (1.0, 0.4, 0.7)]
COMPARISON_ARROW_COLORS = [
    ((0.0, 1.0, 1.0), (1.0, 1.0, 0.0)),    # cyan / bright yellow
    ((0.2, 0.6, 1.0), (0.6, 1.0, 0.2)),    # azure / lime
    ((1.0, 0.4, 1.0), (1.0, 0.75, 0.2)),   # magenta / amber
    ((0.4, 1.0, 0.7), (0.8, 0.5, 1.0)),    # mint / lilac
    ((1.0, 0.55, 0.4), (0.5, 0.9, 1.0)),   # coral / ice
]
_DEFAULT_REFERENCE_ARROWS = list(REFERENCE_ARROW_COLORS)
_DEFAULT_COMPARISON_ARROWS = list(COMPARISON_ARROW_COLORS)
_DEFAULT_ARROW_HEX = {
    "reference": ["#FF8000", "#FF66B3"],
    "comparisons": [["#00FFFF", "#FFFF00"], ["#3399FF", "#99FF33"], ["#FF66FF", "#FFBF33"],
                    ["#66FFB3", "#CC80FF"], ["#FF8C66", "#80E6FF"]],
}
# The defaults as the page shows them, mapped back to their exact values, so
# an unchanged arrow colour is drawn exactly as before.
_ARROW_RGB_BY_HEX = dict(zip(
    _DEFAULT_ARROW_HEX["reference"] + [h for pair in _DEFAULT_ARROW_HEX["comparisons"] for h in pair],
    _DEFAULT_REFERENCE_ARROWS + [rgb for pair in _DEFAULT_COMPARISON_ARROWS for rgb in pair]))

# The colours above as shipped. The Color Palette page in the app can replace
# them; a run then reads the saved palette from ASTRA3_PALETTE_FILE.
DEFAULT_PALETTE = {
    "chains": list(PROTEIN_COLOR_LIST),
    "ligands": list(LIGAND_COLOR_LIST),
    "ions": list(ION_COLOR_LIST),
    "termini": dict(TERMINUS_COLORS),
    "arrows": {"reference": list(_DEFAULT_ARROW_HEX["reference"]),
               "comparisons": [list(p) for p in _DEFAULT_ARROW_HEX["comparisons"]]},
}

# Named colours the Color Palette page offers. Each is a PyMOL colour name the
# ChimeraX engine also defines (astra3_chimerax.COLORS). Any other colour is
# saved as #RRGGBB.
PALETTE_NAMED_COLORS = frozenset("""
grey90 grey80 grey70 grey60 grey50 grey40 grey30 wheat sand brown chocolate dirtyviolet
skyblue slate deepblue deepteal forest violetpurple raspberry firebrick
yellow hotpink marine orange purple cyan magenta deepsalmon brightorange lightmagenta tv_blue gold black
lightpink paleyellow palecyan lightblue bluewhite aquamarine lightorange palegreen pink salmon lightteal
green red tv_green tv_red blue white
""".split())
_HEX_COLOR = re.compile(r"^#[0-9A-Fa-f]{6}$")


def _palette_color(value):
    """A palette entry as stored: a named colour, or #RRGGBB in upper case.
    None for anything else."""
    text = str(value or "").strip()
    if _HEX_COLOR.match(text):
        return text.upper()
    return text.lower() if text.lower() in PALETTE_NAMED_COLORS else None


def _palette_list(values):
    if not isinstance(values, list) or not 1 <= len(values) <= 24:
        return None
    colors = [_palette_color(v) for v in values]
    return colors if all(colors) else None


def _palette_arrows(arrows):
    """The saved arrow colours, checked; the defaults when none were saved."""
    if arrows is None:
        return DEFAULT_PALETTE["arrows"]
    reference = _palette_list(arrows.get("reference"))
    pairs = arrows.get("comparisons")
    if not reference or len(reference) != 2 or not isinstance(pairs, list) or not 1 <= len(pairs) <= 12:
        return None
    comparisons = [_palette_list(p) for p in pairs]
    if not all(p and len(p) == 2 for p in comparisons):
        return None
    return {"reference": reference, "comparisons": comparisons}


def _arrow_rgb(value):
    """RGB (0-1) for an arrow colour: a default exactly as before, any other
    #RRGGBB from its digits, a named colour from the engine."""
    if value in _ARROW_RGB_BY_HEX:
        return _ARROW_RGB_BY_HEX[value]
    if _HEX_COLOR.match(value):
        return tuple(int(value[i:i + 2], 16) / 255.0 for i in (1, 3, 5))
    return tuple(float(v) for v in cmd.get_color_tuple(value))


def load_color_palette():
    """Apply the palette saved by the app, or the defaults when there is none.

    The lists are changed in place, so every module that imported them sees
    the same colours. Returns a line for the console: None for the defaults,
    otherwise what was used."""
    palette = DEFAULT_PALETTE
    note = None
    path = os.environ.get("ASTRA3_PALETTE_FILE", "").strip()
    if path and os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as handle:
                saved = json.load(handle)
            termini = saved.get("termini") or {}
            custom = {
                "chains": _palette_list(saved.get("chains")),
                "ligands": _palette_list(saved.get("ligands")),
                "ions": _palette_list(saved.get("ions")),
                "termini": {"enabled": termini.get("enabled"), "n": _palette_color(termini.get("n")),
                            "c": _palette_color(termini.get("c"))},
                "arrows": _palette_arrows(saved.get("arrows")),
            }
            if (None in (custom["chains"], custom["ligands"], custom["ions"], custom["termini"]["n"],
                         custom["termini"]["c"], custom["arrows"])
                    or not isinstance(custom["termini"]["enabled"], bool)):
                raise ValueError("an entry is not a colour Astra3 accepts")
            palette = custom
            note = f"{WHITE}Colors: custom palette{RESET}"
        except Exception as error:  # noqa: BLE001
            note = f"{YELLOW}The saved color palette could not be read ({error}). Default colors are used.{RESET}"
    PROTEIN_COLOR_LIST[:] = palette["chains"]
    LIGAND_COLOR_LIST[:] = palette["ligands"]
    OVERLAY_LIGAND_COLORS[:] = palette["ligands"]
    ION_COLOR_LIST[:] = palette["ions"]
    TERMINUS_COLORS.clear()
    TERMINUS_COLORS.update(palette["termini"])
    try:
        REFERENCE_ARROW_COLORS[:] = [_arrow_rgb(c) for c in palette["arrows"]["reference"]]
        COMPARISON_ARROW_COLORS[:] = [tuple(_arrow_rgb(c) for c in pair) for pair in palette["arrows"]["comparisons"]]
    except Exception as error:  # noqa: BLE001
        REFERENCE_ARROW_COLORS[:] = _DEFAULT_REFERENCE_ARROWS
        COMPARISON_ARROW_COLORS[:] = _DEFAULT_COMPARISON_ARROWS
        note = f"{YELLOW}The saved arrow colors could not be used ({error}). Default arrow colors are used.{RESET}"
    return note


def engine_color(value):
    """The engine colour name for a palette entry. A #RRGGBB entry is defined
    as astra3_rrggbb first; a named colour is returned as it is."""
    text = str(value)
    if not _HEX_COLOR.match(text):
        return text
    name = "astra3_" + text[1:].lower()
    cmd.set_color(name, [int(text[i:i + 2], 16) / 255.0 for i in (1, 3, 5)])
    return name


protein_color_map = {}
ligand_color_map = {}
ion_color_map = {}


def get_color(name, color_map, color_list):
    if name in color_map:
        return color_map[name]
    used_count = len(color_map)
    color = color_list[used_count % len(color_list)]
    color_map[name] = color
    return color


def format_yn_prompt():
    """Return the colored '(y/n)' fragment used by every Y/n confirmation
    prompt in Astra3 (e.g. 'Apply this correction? (y/n): '), so every such
    prompt in the codebase looks identical rather than each call site
    hand-rolling its own color codes -- lowercase y and n, y in green, n in
    red, matching the DONE-command 'open output folder?' prompt exactly
    (plain lowercase, no default-answer capitalization).
    """
    return f"{WHITE}({RESET}{GREEN}y{RESET}{WHITE}/{RESET}{RED}n{RESET}{WHITE}){RESET}"


# ------------------------------------------------------------
# small reference tables used by reports
# ------------------------------------------------------------
AA_3TO1 = {
    "ALA": "A", "ARG": "R", "ASN": "N", "ASP": "D", "CYS": "C",
    "GLN": "Q", "GLU": "E", "GLY": "G", "HIS": "H", "ILE": "I",
    "LEU": "L", "LYS": "K", "MET": "M", "PHE": "F", "PRO": "P",
    "SER": "S", "THR": "T", "TRP": "W", "TYR": "Y", "VAL": "V"
}
STANDARD_HEAVY_ATOMS = {
    "GLY": 4, "ALA": 5, "SER": 6, "CYS": 6, "THR": 7, "VAL": 7,
    "LEU": 8, "ILE": 8, "PRO": 7, "ASN": 8, "ASP": 8, "MET": 8,
    "GLU": 9, "GLN": 9, "LYS": 9, "HIS": 10, "ARG": 11, "PHE": 11,
    "TYR": 12, "TRP": 14
}

# ------------------------------------------------------------
# OUTPUT FOLDER HELPERS
# ------------------------------------------------------------
def get_output_folders(obj, is_test=False):
    """Return (output_dir, session_dir, images_dir) for single-structure runs."""
    if is_test:
        output_dir = os.path.join(PROTEIN_OUTPUTS_DIR, "TEST")
        if os.path.exists(output_dir):
            shutil.rmtree(output_dir)
    else:
        # safe_output_dirname strips anything that isn't a letter, digit,
        # underscore, or hyphen (so a crafted obj like "../../evil" can't walk
        # the resulting path outside PROTEIN_OUTPUTS_DIR), and safe_join
        # independently verifies the final resolved path is still inside
        # PROTEIN_OUTPUTS_DIR before it's ever created or written to -- two
        # independent layers rather than relying on either check alone. See
        # astra3_security.py.
        output_dir = str(safe_join(PROTEIN_OUTPUTS_DIR, safe_output_dirname(obj)))
    session_dir = os.path.join(output_dir, "Session")
    images_dir = os.path.join(output_dir, "Images")
    os.makedirs(session_dir, exist_ok=True)
    return output_dir, session_dir, images_dir


def get_overlay_output_folders(pdb_ids):
    """Return output/session/images folders for OVERLAY output."""
    if len(pdb_ids) <= 4:
        name_part = "_".join(pdb_ids)
    else:
        name_part = "_".join(pdb_ids[:4]) + "_and_" + str(len(pdb_ids) - 4) + "_more"
    output_dir = str(safe_join(PROTEIN_OUTPUTS_DIR, safe_output_dirname("Overlay_" + name_part)))
    session_dir = os.path.join(output_dir, "Session")
    images_dir = os.path.join(output_dir, "Images")
    os.makedirs(session_dir, exist_ok=True)
    os.makedirs(images_dir, exist_ok=True)
    return output_dir, session_dir, images_dir


# Filename prefixes Astra3 itself generates into an Images folder. Used to
# clear a run's own stale output without touching anything a person put there.
ASTRA3_GENERATED_IMAGE_PREFIXES = ("view_", "closeup_", "TPV_")


def clear_stale_run_images(images_dir):
    """Remove Astra3-generated images left in images_dir by a previous run.

    Output folders are named deterministically from the structure IDs, so
    every run of the same pair writes into the same Images folder. Nothing
    cleared it between runs, so files from an earlier run stayed alongside the
    new ones and were presented as part of the current result.

    That is not a cosmetic duplicate. Chain matching, offset corrections and
    which residues count as resolved can all differ between two runs of the
    same pair, so a stale file can show a different chain pairing or a
    terminus window the current run would not produce -- indistinguishable,
    in a folder listing, from output that is current. A close-up whose
    filename encodes chain "A/B" survives a later run that matched "A" to
    "A", and both then appear as though the run produced both.

    Only files matching Astra3's own generated prefixes are removed, so
    anything a person saved into the folder is left alone. Returns the list
    of removed filenames for disclosure; never raises.
    """
    removed = []
    try:
        entries = os.listdir(images_dir)
    except OSError:
        return removed
    for name in entries:
        if not name.lower().endswith(".png"):
            continue
        if not name.startswith(ASTRA3_GENERATED_IMAGE_PREFIXES):
            continue
        full = os.path.join(images_dir, name)
        try:
            if os.path.isfile(full):
                os.remove(full)
                removed.append(name)
        except OSError:
            # A file held open by a viewer is not worth failing a run over;
            # it stays, and the caller's disclosure reports what did go.
            continue
    return removed


def report_cleared_images(removed, images_dir, warnings_list=None):
    """Print and record what clear_stale_run_images removed."""
    if not removed:
        return
    print(f"{YELLOW}Removed {len(removed)} image(s) left in {images_dir} by a previous run of this same "
          f"comparison. Output folders are named after the structures, so a re-run reuses the folder; "
          f"clearing it keeps the images in this folder matching this run.{RESET}", flush=True)
    if warnings_list is not None:
        warnings_list.append(
            f"{len(removed)} image(s) from a previous run of this comparison were removed from the output "
            f"folder before rendering, so the images shown belong to this run only."
        )


# Structure files Astra3 reads from disk. Coordinate files may be gzip
# compressed (as RCSB serves them); a PyMOL session may not.
COORDINATE_EXTENSIONS = (".pdb", ".ent", ".cif", ".mmcif")
SESSION_EXTENSIONS = (".pse",)


def structure_file_kind(path):
    """'pdb', 'cif' or 'pse' for a supported file name, else None. A trailing
    .gz is looked through."""
    name = os.path.basename(str(path or "")).lower()
    if name.endswith(".gz"):
        name = name[:-3]
        if name.endswith(SESSION_EXTENSIONS):
            return None
    ext = os.path.splitext(name)[1]
    if ext in (".pdb", ".ent"):
        return "pdb"
    if ext in (".cif", ".mmcif"):
        return "cif"
    if ext == ".pse":
        return "pse"
    return None


def structure_file_stem(path):
    """File name without its structure extension(s): 1abc.cif.gz -> 1abc."""
    name = os.path.basename(str(path or ""))
    if name.lower().endswith(".gz"):
        name = name[:-3]
    return os.path.splitext(name)[0]


def read_structure_text(path, limit=None):
    """Text of a coordinate file, decompressed if gzipped, with any
    byte-order mark removed. limit reads only the first `limit` bytes."""
    import gzip
    opener = gzip.open if str(path).lower().endswith(".gz") else open
    with opener(path, "rb") as fh:
        data = fh.read() if limit is None else fh.read(limit)
    return data.decode("utf-8-sig", errors="replace")


def coordinate_file_record(path, name=None):
    """What identifies the file a structure's coordinates were read from:
    its name, its size, and the SHA-256 of its bytes exactly as they are on
    disk (a .gz is not unpacked first), so that sha256sum or certutil on the
    same file gives the same value. A PDB entry can be revised and two local
    files can share a name; the checksum tells them apart afterwards.
    None when the file cannot be read."""
    import hashlib
    digest, size = hashlib.sha256(), 0
    try:
        with open(path, "rb") as fh:
            for block in iter(lambda: fh.read(1 << 20), b""):
                digest.update(block)
                size += len(block)
    except OSError:
        return None
    return {"name": name or os.path.basename(str(path)), "bytes": size, "sha256": digest.hexdigest()}


def coordinate_file_line(header_info):
    """A structure's coordinate_file_record as one line of a text report."""
    record = (header_info or {}).get("coordinate_file")
    if not record:
        return "not recorded"
    return f"{record['name']} ({record['bytes']:,} bytes), SHA-256 {record['sha256']}"


def _first_coordinate_marker(path):
    """'cif' when the file reaches an _atom_site loop first, 'pdb' when it reaches an
    ATOM or HETATM record first, None when it reaches neither. Read as a stream, so a
    long header (REMARK, SEQRES) cannot hide the coordinates that follow it."""
    import gzip
    opener = gzip.open if str(path).lower().endswith(".gz") else open
    with opener(path, "rt", encoding="utf-8-sig", errors="replace") as fh:
        for line in fh:
            if line.startswith("_atom_site."):
                return "cif"
            if line.startswith(("ATOM", "HETATM")):
                return "pdb"
    return None


def structure_file_problem(path):
    """A sentence saying why a coordinate file cannot be a structure, or None
    when it looks like one. Checked before loading, so an empty, binary or
    misnamed file gets a specific answer instead of a parser error."""
    import gzip
    import zlib
    try:
        if os.path.getsize(path) == 0:
            return "The file is empty."
        head = read_structure_text(path, limit=65536)
        # A few characters that are not UTF-8 (an accented name in a header
        # written as Latin-1) do not make a file binary; NUL bytes or a large
        # share of unreadable characters do.
        if "\x00" in head or head.count("\ufffd") > max(20, len(head) // 20):
            return "The file is not a text structure file (it contains binary data)."
        kind = structure_file_kind(path)
        if kind in ("pdb", "cif"):
            marker = _first_coordinate_marker(path)
            if kind == "pdb" and marker != "pdb":
                if marker == "cif":
                    return "The file holds mmCIF data but is named as a PDB file; rename it to .cif."
                return "The file has no ATOM or HETATM records, so it holds no coordinates."
            if kind == "cif" and marker != "cif":
                if marker == "pdb":
                    return "The file holds PDB-format data but is named as mmCIF; rename it to .pdb."
                return "The file has no _atom_site records, so it holds no coordinates."
    # gzip.BadGzipFile is Python 3.8+; a PyMOL on Python 3.7 raises OSError.
    except (getattr(gzip, "BadGzipFile", EOFError), EOFError, zlib.error):
        return ("The file name ends in .gz but the file is not complete gzip data: it may have been cut off "
                "while downloading or copying. If it is not compressed, remove .gz from the name.")
    except OSError as e:
        return f"The file could not be read ({e.strerror or e})."
    except Exception:  # noqa: BLE001
        return "The file could not be read."
    return None


# Host Astra3 downloads structures from, named in download-failure messages.
STRUCTURE_HOST = "files.rcsb.org"


def describe_fetch_failure(structure_id, host=STRUCTURE_HOST, check=None):
    """Failure message for a fetch that produced nothing, naming the cause.

    An empty fetch means either the ID does not exist or the download never
    happened. Those need opposite responses, so RCSB is asked directly
    whether the entry exists (only the ID is sent). A bare connection test
    is not enough: behind a proxy or firewall the host can accept a
    connection while every download is refused.
    """
    entry = str(structure_id or "").strip().upper()
    if len(entry) in (5, 6) and entry[:1].isdigit():
        entry = entry[:4]  # an entry ID plus a chain
    try:
        if check is None:
            from astra3_annotations import check_entry as check
        status = check(entry)
    except Exception:  # noqa: BLE001
        status = None
    if status == "not_found":
        return f"Could not load '{structure_id}': the PDB has no entry {entry}. Check the ID and try again."
    if status == "ok":
        return (f"Could not load '{structure_id}': RCSB has entry {entry}, but the download into {engine_name()} failed. "
                f"Try again; if it keeps failing, a firewall or proxy may be blocking {engine_name()}'s downloads.")
    if status == "offline":
        return (f"Could not download '{structure_id}': RCSB ({host}) could not be reached. Check the internet "
                f"connection; a firewall, proxy or VPN can also block it.")
    return (f"Could not load '{structure_id}'. This is usually a mistyped ID, but the network could not be "
            f"checked, so a connection problem cannot be ruled out.")


def select_reference_by_ligand_count(loaded_objects, ligand_counts, tie_scores=None, labels=None):
    """Pick the reference: the structure with the fewest bound ligands.

    Returns (object_name, reason). Shared by OVERLAY and TERMINI so both
    commands frame a comparison the same way. The order structures were
    named in never decides. Structures tied on ligands are ranked by
    tie_scores, {obj: (mean_similarity, resolved_residues)}: first the highest
    mean sequence similarity to the other structures in the run (identity,
    coverage and length, weighted as in chain reduction), then the most
    resolved residues, then the structure ID alphabetically.

    The less ligand-encumbered structure is the more neutral baseline: its
    termini and surfaces are least likely to have been displaced by something
    bound to it, so differences measured against it are more readily
    attributable to the other structure. Among equals, the most complete and
    most representative one gives every comparison the most to measure.
    """
    if not loaded_objects:
        return None, "No structures were loaded."
    fewest = min(ligand_counts.get(obj, 0) for obj in loaded_objects)
    tied = [obj for obj in loaded_objects if ligand_counts.get(obj, 0) == fewest]
    base = f"Automatically selected as the structure with the fewest bound ligands ({fewest})"
    if len(tied) == 1:
        return tied[0], base + "."
    tie_scores = tie_scores or {}
    labels = labels or {}

    def label(obj):
        return str(labels.get(obj, obj))

    def rank_key(obj):
        similarity, residues = tie_scores.get(obj, (0.0, 0))
        return (-round(similarity, 6), -int(residues), label(obj).upper())

    ranked = sorted(tied, key=rank_key)
    reference, runner_up = ranked[0], ranked[1]
    ref_key, next_key = rank_key(reference), rank_key(runner_up)
    others = ", ".join(label(obj) for obj in ranked[1:])
    similarity, residues = tie_scores.get(reference, (0.0, 0))
    if ref_key[0] != next_key[0]:
        decided = (f"it has the highest mean sequence similarity to the other structures "
                   f"({similarity * 100:.1f}; identity, coverage and length weighted as in chain reduction)")
    elif ref_key[1] != next_key[1]:
        decided = f"with equal sequence similarity, it has the most resolved residues ({residues})"
    else:
        decided = "with equal sequence similarity and resolved residues, it comes first by structure ID"
    return reference, f"{base}. Tied on ligands with {others}; {decided}."


# ------------------------------------------------------------
# Redundant chains (homomers): the rules a run can apply to them, and how
# reports state the one applied
# ------------------------------------------------------------
# Named as the app's Batch page names them. "ask" is the question put at the
# prompt; "assembly" keeps the chains of the depositor's preferred biological
# assembly and falls back to one of the others when the assembly records
# cannot decide.
HOMOMER_RULES = {"ask": "Ask each time", "assembly": "Biological assembly",
                 "reduce": "Always reduce", "keep": "Keep all chains"}
# rank_homomer_chain_by_priority's criteria when no order is given, and their
# names in reports.
DEFAULT_REDUCE_PRIORITY = ("missing", "leastligands", "chainA")
REDUCE_PRIORITY_LABELS = {"missing": "fewest missing residues", "leastligands": "fewest bound ligands",
                          "mostligands": "most bound ligands", "chainA": "chain A"}


def chains_text(chains):
    """'chain A', 'chains A and B', 'chains A, B and C'."""
    chains = list(chains)
    if len(chains) == 1:
        return f"chain {chains[0]}"
    return f"chains {', '.join(chains[:-1])} and {chains[-1]}"


def homomer_rule_outcome(rule, applied):
    """The rule record of prompt_intra_structure_homomer_reduction with each
    cluster's chains as the reduction left them, kept and removed. applied
    holds the (removed, kept) pairs of the chains actually removed."""
    removed = {r for r, _k in applied or []}
    clusters = [dict(c, kept=[ch for ch in c["chains"] if ch not in removed],
                     removed=[ch for ch in c["chains"] if ch in removed])
                for c in rule.get("clusters") or []]
    return dict(rule, clusters=clusters)


def _reduce_rule_text(rule):
    priority = rule.get("priority") or DEFAULT_REDUCE_PRIORITY
    return f"Always reduce rule, priority: {', '.join(REDUCE_PRIORITY_LABELS.get(p, p) for p in priority)}"


def homomer_rule_reason(rule, cluster):
    """How one cluster of redundant chains was decided, as a report states it
    in parentheses after "intra-structure homomer reduction"."""
    decided_by = cluster.get("decided_by") or "ask"
    if decided_by == "assembly":
        assembly = cluster.get("assembly") or {}
        kept = cluster.get("kept") or []
        contains = ("all of them" if len(kept) == len(cluster["chains"]) and len(kept) > 1
                    else chains_text(kept))
        return (f"Biological assembly rule: the depositor's preferred assembly {assembly.get('id')} "
                f"({assembly.get('label')}) contains {contains}")
    if decided_by == "reduce":
        reason = _reduce_rule_text(rule)
    elif decided_by == "keep":
        reason = "Keep all chains rule"
    else:
        reason = {"declined": "declined by user", "skipped": "review skipped by user for the rest of the batch",
                  "unanswered": "no valid answer was given"}.get(cluster.get("answer"), "approved by user")
    if cluster.get("fallback_reason"):
        if decided_by == "ask":
            reason = f"{HOMOMER_RULES['ask']}, {reason}"
        reason = (f"Biological assembly rule could not decide ({cluster['fallback_reason']}), so its fallback "
                  f"applied: {reason}")
    return reason


def homomer_rule_method(rule, cluster):
    """How a reduced cluster's chains were removed, as the Methods text puts
    it after "removed"."""
    decided_by = cluster.get("decided_by") or "ask"
    if decided_by == "ask":
        how = "with the user's approval"
    elif decided_by == "assembly":
        assembly = cluster.get("assembly") or {}
        return f"by the biological assembly rule (not in the depositor's preferred assembly {assembly.get('id')})"
    else:
        how = f"by the {HOMOMER_RULES[decided_by].lower()} rule"
    if cluster.get("fallback_reason"):
        how += " (the fallback of the biological assembly rule, which could not decide)"
    return how


def summarize_chain_reduction(applied, pdb_id, command_label, rule):
    """One note per cluster of redundant chains: the chains removed or kept,
    and the rule that decided (rule: see prompt_intra_structure_homomer_reduction).

    Chains removed from one cluster make one note, not one per chain: a
    tetramer reduced to a single chain produced three near-identical warnings
    that differed only by a letter, which pushed the lines that need
    attention down the list. Reduced clusters come first, in order of the
    chains kept, then the clusters whose chains were all kept.
    """
    outcome = homomer_rule_outcome(rule, applied)
    lines = []
    for cluster in sorted((c for c in outcome["clusters"] if c["removed"]), key=lambda c: sorted(c["kept"])):
        removed, kept = sorted(cluster["removed"]), cluster["kept"]
        one = len(kept) == 1
        lines.append(
            f"{pdb_id}: {chains_text(removed)} {'was' if len(removed) == 1 else 'were'} removed from the session "
            f"(intra-structure homomer reduction, {homomer_rule_reason(outcome, cluster)}); only "
            f"{chains_text(kept)} {'was' if one else 'were'} used for {command_label} analysis and "
            f"{'remains' if one else 'remain'} in the saved .pse."
        )
    for cluster in outcome["clusters"]:
        if not cluster["removed"]:
            lines.append(
                f"{pdb_id}: {chains_text(cluster['chains'])} are the same protein and "
                f"{'both' if len(cluster['chains']) == 2 else 'all'} were kept for {command_label} analysis "
                f"(intra-structure homomer reduction, {homomer_rule_reason(outcome, cluster)})."
            )
    return lines


def get_termini_output_folders(pdb_ids):
    """Return output/session/images folders for TERMINI output."""
    if len(pdb_ids) <= 4:
        name_part = "_".join(pdb_ids)
    else:
        name_part = "_".join(pdb_ids[:4]) + "_and_" + str(len(pdb_ids) - 4) + "_more"
    output_dir = str(safe_join(PROTEIN_OUTPUTS_DIR, safe_output_dirname("Termini_" + name_part)))
    session_dir = os.path.join(output_dir, "Session")
    images_dir = os.path.join(output_dir, "Images")
    os.makedirs(session_dir, exist_ok=True)
    os.makedirs(images_dir, exist_ok=True)
    return output_dir, session_dir, images_dir


# ------------------------------------------------------------
# HEADER / REMARK parsers and small utilities
# ------------------------------------------------------------
def resolution_display(header_info):
    """Resolution as a reader should see it: "2.30 Å"; "Not applicable
    (solution NMR)" for NMR, which has no resolution; otherwise "Not reported"
    rather than a placeholder with a unit attached."""
    hi = header_info or {}
    raw = str(hi.get("resolution") or "").strip()
    try:
        float(raw)
        return f"{raw} Å"
    except ValueError:
        pass
    if "NMR" in str(hi.get("method") or "").upper():
        return "Not applicable (solution NMR)"
    if raw in ("", "Not found in header", "Unknown"):
        return "Not reported in the file header"
    return raw


def format_method(header_info):
    """The experimental method for display, worded like a missing resolution
    when the file does not state it."""
    raw = str((header_info or {}).get("method") or "").strip()
    if raw in ("", "Not found in header", "Unknown", "Not available"):
        return "Not reported in the file header"
    return raw


def parse_header(raw_text):
    info = {}
    method_match = re.search(r"^EXPDTA\s+(.+?)\s*$", raw_text, re.MULTILINE)
    info["method"] = method_match.group(1).strip() if method_match else "Not found in header"
    res_match = re.search(r"REMARK\s+2\s+RESOLUTION\.\s+([\d.]+)\s+ANGSTROMS", raw_text)
    info["resolution"] = res_match.group(1).strip() if res_match else "Not found in header"
    # SHELXL writes these lines with ", NO CUTOFF" (and a second set for
    # F>4SIG(F)); the no-cutoff values are the ones the wwPDB reports as the
    # entry's R and R-free.
    rwork_match = re.search(r"REMARK\s+3\s+R VALUE\s*\(WORKING SET(?:, NO CUTOFF)?\)\s*:\s*([\d.]+)", raw_text)
    if not rwork_match:
        # Older entries (no test set) report only the overall R-value.
        rwork_match = re.search(r"REMARK\s+3\s+R VALUE\s*\(WORKING \+ TEST SET(?:, NO CUTOFF)?\)\s*:\s*([\d.]+)", raw_text)
        if rwork_match:
            info["r_work_kind"] = "observed"
    info["r_work"] = rwork_match.group(1).strip() if rwork_match else "Not found in header"
    rfree_match = re.search(r"REMARK\s+3\s+FREE R VALUE\s*(?:\(NO CUTOFF\))?\s*:\s*([\d.]+)", raw_text)
    info["r_free"] = rfree_match.group(1).strip() if rfree_match else "Not found in header"
    return info


def load_functional_readouts(base_dir=None):
    """Look for readouts.csv in base_dir (defaults to Astra3's working
    folder, BASE_DIR) and, if present, parse it into
    {structure_id_upper: [{"readout_name": str, "value": str,
    "terminus": str or None, "units": str or None}, ...]}.

    Expected columns (header row required, case-insensitive column
    names): structure_id, readout_name, value, and optionally terminus
    (N/C, for a readout specific to one terminus) and units (a display
    string like 'RFU' or 'nM', never assumed or invented if omitted).
    Extra/unrecognized columns are ignored rather than rejected, so a
    user's existing lab spreadsheet with additional columns doesn't need
    to be trimmed down first.

    Returns an empty dict (not an error) if the file doesn't exist -- this
    is an optional, auto-detected input, not a required one. Malformed
    rows are skipped individually with a printed warning rather than
    aborting the whole file, since one bad row shouldn't discard
    everything else a user has already entered correctly.
    """
    if base_dir is None:
        base_dir = BASE_DIR
    path = os.path.join(base_dir, "readouts.csv")
    if not os.path.isfile(path):
        return {}

    readouts = {}
    try:
        with open(path, "r", encoding="utf-8-sig", newline="") as fh:
            reader = csv.DictReader(fh)
            if reader.fieldnames is None:
                print(f"{YELLOW}readouts.csv was found but appears to be empty; ignoring.{RESET}", flush=True)
                return {}
            # Case-insensitive column lookup, since a user-maintained CSV
            # (e.g. exported from a spreadsheet) may not match casing exactly.
            field_map = {f.strip().lower(): f for f in reader.fieldnames}
            required = ("structure_id", "readout_name", "value")
            missing = [r for r in required if r not in field_map]
            if missing:
                print(f"{YELLOW}readouts.csv is missing required column(s): {', '.join(missing)}. "
                      f"Expected at least: structure_id, readout_name, value. Ignoring this file.{RESET}", flush=True)
                return {}
            for i, row in enumerate(reader, start=2):  # start=2: header is row 1
                sid = (row.get(field_map["structure_id"]) or "").strip()
                name = (row.get(field_map["readout_name"]) or "").strip()
                value = (row.get(field_map["value"]) or "").strip()
                if not sid or not name or not value:
                    print(f"{YELLOW}readouts.csv row {i}: missing structure_id, readout_name, or value; skipped.{RESET}", flush=True)
                    continue
                terminus = None
                if "terminus" in field_map:
                    raw_term = (row.get(field_map["terminus"]) or "").strip().upper()
                    if raw_term in ("N", "C"):
                        terminus = raw_term
                units = None
                if "units" in field_map:
                    raw_units = (row.get(field_map["units"]) or "").strip()
                    if raw_units:
                        units = raw_units
                readouts.setdefault(sid.upper(), []).append({
                    "readout_name": name,
                    "value": value,
                    "terminus": terminus,
                    "units": units,
                })
    except Exception as e:
        print(f"{YELLOW}Could not read readouts.csv ({type(e).__name__}: {e}); continuing without it.{RESET}", flush=True)
        return {}

    return readouts


def parse_remark_465(raw_text):
    """Conservative REMARK 465 parser. Returns {chain: [ranges], ...} or {}."""
    if not raw_text:
        return {}
    lines = raw_text.splitlines()
    missing = {}
    for ln in lines:
        if ln.startswith("REMARK 465"):
            content = ln[10:].strip()
            # Chain IDs are captured as [A-Za-z0-9]+ (one or more characters),
            # not a single character -- legacy PDB is nominally one-char chain
            # IDs, but some large legacy entries do use multi-char chain IDs,
            # and a single-char capture here would silently truncate those
            # (e.g. "AA" read as just "A"), quietly merging two different
            # chains' missing-residue data together under one wrong key.
            m = re.search(r"CHAIN[:\s]+([A-Za-z0-9]+)[:\s-]*(.*)", content, re.IGNORECASE)
            if m and m.group(2).strip():
                ch = m.group(1).strip()
                rest = m.group(2).strip()
                parts = [p.strip() for p in re.split(r"[,;]", rest) if p.strip()]
                for p in parts:
                    if re.match(r"^\d+(-\d+)?$", p):
                        missing.setdefault(ch, []).append(p)
            else:
                # Standard PDB REMARK 465 data-line format is "RES C
                # SSSEQI[ICode]" -- residue name, then chain ID, then sequence
                # number, optionally followed by a single-letter insertion
                # code (e.g. "SER A 134" or "GLY H 100A"), per the wwPDB
                # format spec and every real REMARK 465 block (verified
                # against actual PDB entries, e.g. 1QG8). The residue name
                # always comes FIRST, not a leading digit -- a prior version
                # of this regex required the line to start with \d+, which
                # never matches this format at all (residue names are
                # letters), so every REMARK 465 block in this format was
                # silently parsed as zero missing residues.
                # Entries whose models differ carry the model number first
                # ("M RES C SSSEQI" in the block's own column header); it is
                # optional and ignored here, since a residue missing from any
                # model is reported once.
                m2 = re.match(r"^(?:\d+\s+)?([A-Za-z0-9]{1,3})\s+([A-Za-z0-9])\s+(-?\d+)([A-Za-z]?)\s*$", content)
                if m2:
                    ch = m2.group(2).strip()
                    # The insertion code is part of the residue's identity:
                    # 388, 388A, 388B and 388C are four different residues.
                    missing.setdefault(ch, []).append((int(m2.group(3)), m2.group(4).upper()))
    return _normalize_missing_residue_ranges(missing)


def _normalize_missing_residue_ranges(missing):
    """Shared by parse_remark_465 and parse_missing_residues_cif: takes
    {chain: [residues]} and collapses each chain's residues into compact
    ranges, e.g. {"A": [12, 13, 14, 20]} -> {"A": ["12-14", "20"]}.

    A residue is a (number, insertion code) pair; plain numbers and "a-b"
    strings are accepted too. Insertion codes are kept: 385, 386, 387, 388,
    388A, 388B, 388C becomes "385-388C". A run never continues from an
    insertion-code residue to a plain number (52, 52A, 52B, 53 gives "52-52B",
    "53"), so no range ever hides a residue its endpoints do not show.
    """
    normalized = {}
    for ch, items in missing.items():
        residues = set()
        for it in items:
            if isinstance(it, tuple):
                try:
                    residues.add((int(it[0]), str(it[1] or "").strip().upper()))
                except (TypeError, ValueError):
                    pass
                continue
            text = str(it).strip()
            span = re.match(r"^(-?\d+)\s*-\s*(-?\d+)$", text)
            if span:
                a, b = int(span.group(1)), int(span.group(2))
                residues.update((n, "") for n in range(min(a, b), max(a, b) + 1))
                continue
            single = re.match(r"^(-?\d+)([A-Za-z]?)$", text)
            if single:
                residues.add((int(single.group(1)), single.group(2).upper()))
        normalized[ch] = _format_residue_runs(sorted(residues))
    return normalized


def _next_insertion_code(code):
    if not code:
        return "A"
    return chr(ord(code) + 1) if code < "Z" else None


def _format_residue_runs(residues):
    """Sorted (number, insertion code) pairs -> ["385-388C", "432-441"]."""
    runs = []
    start = prev = None
    for num, code in residues:
        if prev is not None:
            pnum, pcode = prev
            if (num == pnum and code == _next_insertion_code(pcode)) or (num == pnum + 1 and not code and not pcode):
                prev = (num, code)
                continue
            runs.append((start, prev))
        start = prev = (num, code)
    if prev is not None:
        runs.append((start, prev))
    out = []
    for (a, ac), (b, bc) in runs:
        lo, hi = f"{a}{ac}", f"{b}{bc}"
        out.append(lo if lo == hi else f"{lo}-{hi}")
    return out


_NEGATIVE_START_RANGE = re.compile(r"(?<![\w-])(-\d+[A-Za-z]?)-(-?\d+[A-Za-z]?)(?!\w)")


def display_ranges(text):
    """Residue ranges as shown in reports. A range that starts below zero is
    written "-3 to 37", since "-3-37" can be misread."""
    return _NEGATIVE_START_RANGE.sub(r"\1 to \2", str(text))


_MISSING_RANGE_RE = re.compile(r"^(-?\d+)([A-Z]?)(?:-(-?\d+)([A-Z]?))?$")


def _range_residues(text):
    """[(number, insertion code)] of one range formatted by
    _normalize_missing_residue_ranges: "12-14", "385-388C", "388A-388C"."""
    m = _MISSING_RANGE_RE.match(str(text).strip().upper())
    if not m:
        return []
    a, ac = int(m.group(1)), m.group(2)
    if m.group(3) is None:
        return [(a, ac)]
    b, bc = int(m.group(3)), m.group(4)
    if a == b:
        if not bc:
            return [(a, ac)]
        codes = [chr(c) for c in range(ord(ac) if ac else ord("A"), ord(bc) + 1)]
        return ([] if ac else [(a, "")]) + [(a, code) for code in codes]
    # A run only reaches insertion codes at its end (see above).
    return [(n, "") for n in range(a, b + 1)] + ([(b, chr(c)) for c in range(ord("A"), ord(bc) + 1)] if bc else [])


def expand_missing_residues(ranges):
    """Every residue in ranges, as sorted (number, insertion code) pairs."""
    return sorted({residue for r in ranges or [] for residue in _range_residues(r)})


def count_missing_residues(ranges):
    """Number of residues in ranges formatted by
    _normalize_missing_residue_ranges ("12-14" is 3, "385-388C" is 7).
    The number of ranges is the number of gaps, not of residues."""
    return sum(len(_range_residues(r)) for r in ranges or [])


# ------------------------------------------------------------
# mmCIF metadata parsing (parallels parse_header/parse_remark_465 above, which
# only understand legacy PDB text cards). A structure fetched with the -mmCIF
# flag downloads a .cif file instead of a .pdb file -- these two functions are
# what let header_info and the missing-residues map still get populated from
# that file instead of silently staying empty, which is what would otherwise
# happen since the legacy parsers only ever looked for '.pdb'-named downloads.
#
# Field names verified against the wwPDB PDBx/mmCIF dictionary
# (mmcif.wwpdb.org) rather than assumed: _exptl.method -- experimental method
# _reflns.d_resolution_high -- resolution (Å), when present
# _refine.ls_d_res_high -- fallback resolution field, some entries populate
# this instead _refine.ls_R_factor_R_work -- R-work _refine.ls_R_factor_R_free
# -- R-free _pdbx_unobs_or_zero_occ_residues -- missing-residue loop, the
# mmCIF analog of REMARK 465 (wwPDB's own PDB-101 documentation describes it
# as such)
# ------------------------------------------------------------
def _cif_scalar_value(raw_text, tag):
    """Extract a single scalar (non-loop) mmCIF value, e.g. for a line
    like `_exptl.method 'X-RAY DIFFRACTION'` or `_exptl.method
    X-RAY_DIFFRACTION` (unquoted, single token). Returns the value with
    surrounding quotes stripped, or None if the tag isn't present as a
    scalar assignment (e.g. it only appears as a loop_ column header,
    which this function deliberately does not attempt to parse -- a
    loop value needs row/column alignment, not a one-line regex).
    """
    # Match "_tag 'quoted value'" / "_tag \"quoted value\"" / "_tag bareword"
    # on one line. re.MULTILINE + ^ anchors to the start of each line so this
    # doesn't accidentally match the tag name appearing inside an unrelated
    # quoted string elsewhere in the file.
    pattern = re.escape(tag) + r"[ \t]+(?:'([^']*)'|\"([^\"]*)\"|(\S+))"
    m = re.search(r"^" + pattern, raw_text, re.MULTILINE)
    if not m:
        return None
    value = m.group(1) if m.group(1) is not None else (m.group(2) if m.group(2) is not None else m.group(3))
    value = value.strip() if value else value
    if value in (None, "", "?", "."):
        # mmCIF's own conventions for "not present" (?) and "explicitly
        # inapplicable" (.) -- treat both as absent, not as a literal value.
        return None
    return value


def parse_header_cif(raw_text):
    """mmCIF equivalent of parse_header. Same return shape:
    {"method": ..., "resolution": ..., "r_work": ..., "r_free": ...},
    each defaulting to "Not found in header" exactly like the legacy
    PDB parser, so every downstream caller (report text, HTML, JSON)
    works identically regardless of which parser populated header_info.
    """
    info = {}
    method = _cif_scalar_value(raw_text, "_exptl.method")
    info["method"] = method if method else "Not found in header"

    # Resolution: the refinement's high-resolution limit,
    # _refine.ls_d_res_high, which is the resolution the PDB gives for an
    # entry (REMARK 2 of the PDB-format file, RCSB's resolution_combined) and
    # what gemmi reads. Cryo-EM entries give theirs in
    # _em_3d_reconstruction.resolution. _reflns.d_resolution_high, the limit
    # of the measured data, is used only when neither is present: it can
    # differ (4W61: data 2.000 A, refinement 2.01 A).
    resolution = _cif_scalar_value(raw_text, "_refine.ls_d_res_high")
    if not resolution:
        resolution = _cif_scalar_value(raw_text, "_em_3d_reconstruction.resolution")
    if not resolution:
        resolution = _cif_scalar_value(raw_text, "_reflns.d_resolution_high")
    info["resolution"] = resolution if resolution else "Not found in header"

    r_work = _cif_scalar_value(raw_text, "_refine.ls_R_factor_R_work")
    if not r_work:
        # Older entries (no test set) report only the overall R-value, which
        # is then the refinement R; it is labelled as such where shown.
        r_work = _cif_scalar_value(raw_text, "_refine.ls_R_factor_obs")
        if r_work:
            info["r_work_kind"] = "observed"
    info["r_work"] = r_work if r_work else "Not found in header"

    r_free = _cif_scalar_value(raw_text, "_refine.ls_R_factor_R_free")
    info["r_free"] = r_free if r_free else "Not found in header"

    return info


def parse_missing_residues_cif(raw_text):
    """mmCIF equivalent of parse_remark_465. Returns the same shape,
    {chain: [formatted ranges]}, built from the
    _pdbx_unobs_or_zero_occ_residues loop instead of REMARK 465 text
    lines.

    This loop's row format is a fixed, ordered set of whitespace-
    separated columns declared immediately above the data rows (see
    the loop_ header). Astra3 parses it defensively rather than
    assuming a fixed column count/order across every possible mmCIF
    file: it reads the declared column names first and looks up
    auth_asym_id/auth_comp_id/auth_seq_id by their position in THAT
    file's declared order, not by a hardcoded index. Rows are
    terminated by the next '#' comment line or the next loop_/tag,
    matching standard mmCIF loop syntax.
    """
    if not raw_text:
        return {}
    category = "_pdbx_unobs_or_zero_occ_residues."
    lines = raw_text.splitlines()

    # Find the loop_ block whose column tags start with our category.
    loop_start = None
    for i, ln in enumerate(lines):
        if ln.strip() == "loop_":
            # Peek ahead: does the next non-blank line declare a column in our
            # category?
            j = i + 1
            while j < len(lines) and lines[j].strip().startswith(category):
                j += 1
            if j > i + 1:
                loop_start = i
                columns_end = j
                break
    if loop_start is None:
        return {}

    columns = [lines[k].strip() for k in range(loop_start + 1, columns_end)]
    try:
        idx_chain = columns.index(category + "auth_asym_id")
        idx_seq = columns.index(category + "auth_seq_id")
    except ValueError:
        # Without the chain and number columns there is nothing usable;
        # return empty rather than guessing positions.
        return {}
    # Optional columns: the insertion code (388A is not 388), and the polymer
    # flag, since this category also lists unobserved non-polymer residues,
    # which are not missing residues of a chain.
    idx_ins = columns.index(category + "PDB_ins_code") if category + "PDB_ins_code" in columns else None
    idx_poly = columns.index(category + "polymer_flag") if category + "polymer_flag" in columns else None

    missing = {}
    for ln in lines[columns_end:]:
        stripped = ln.strip()
        if not stripped or stripped.startswith("#"):
            break
        if stripped.startswith("_") or stripped == "loop_":
            break
        # Every column in this category is a short identifier or number, so
        # a whitespace split is enough; no quoted multi-word values occur.
        fields = stripped.split()
        if len(fields) <= max(idx_chain, idx_seq):
            continue
        if idx_poly is not None and len(fields) > idx_poly and fields[idx_poly].upper() == "N":
            continue
        chain = fields[idx_chain].strip()
        seq = fields[idx_seq].strip()
        if not chain or chain == "?" or chain == ".":
            continue
        code = ""
        if idx_ins is not None and len(fields) > idx_ins and fields[idx_ins] not in ("?", "."):
            code = fields[idx_ins].strip().upper()
        if re.match(r"^-?\d+$", seq):
            missing.setdefault(chain, []).append((int(seq), code))
    return _normalize_missing_residue_ranges(missing)


def resolution_classification(resolution_str):
    """
    Classify resolution string (from PDB header) into human-friendly categories.
    Returns a string describing the resolution class or 'Not applicable' if it can't be parsed.
    """
    try:
        r = float(resolution_str)
    except (ValueError, TypeError):
        return "Not applicable"
    if r < 1.5:
        return "Exceptional"
    elif r < 1.6:
        return "Excellent (borderline with Exceptional)"
    elif r < 2.0:
        return "Excellent"
    elif r < 2.1:
        return "Good (borderline with Excellent)"
    elif r < 2.5:
        return "Good"
    elif r < 2.6:
        return "Moderate (borderline with Good)"
    elif r < 3.0:
        return "Moderate"
    else:
        return "Lower classification for atomic details"


def format_residue_ranges(residue_list, structure_id=None):
    """Convert list of (chain, resi) to compact chain-based ranges."""
    if not residue_list:
        return "None"
    chains = {}
    for chain, resi in residue_list:
        try:
            resi_int = int(resi)
        except (ValueError, TypeError):
            continue
        chains.setdefault(chain, []).append(resi_int)
    formatted = []
    for chain in sorted(chains):
        residues = sorted(set(chains[chain]))
        ranges = []
        start = residues[0]
        previous = residues[0]
        for residue in residues[1:]:
            if residue == previous + 1:
                previous = residue
            else:
                if start == previous:
                    ranges.append(str(start))
                else:
                    ranges.append(f"{start}-{previous}")
                start = residue
                previous = residue
        if start == previous:
            ranges.append(str(start))
        else:
            ranges.append(f"{start}-{previous}")
        line = f"Chain {chain}: resi {', '.join(ranges)}"
        if structure_id:
            line = f"{structure_id} " + line
        formatted.append(line)
    return "\n".join(formatted)

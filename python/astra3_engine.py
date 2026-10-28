# ============================================================
# astra3_engine.py
# Astra3: Structural Analysis Toolkit for PDB Rendering Automation
# Created by Andre Aguirre
# Copyright (c) 2026 Andre Aguirre
# Licensed under the GNU General Public License, version 3 or later (GPL-3.0-or-later).
# See LICENSE file for details.
# ============================================================
#
# The Astra3 Engine: Astra3 with neither PyMOL nor ChimeraX.
#
# The app runs this Python as WebAssembly (Pyodide) in its own process
# (gui/engine/astra3-engine.js). The analysis is the one the other engines
# run: astra3_chimerax stands in for PyMOL's cmd, reading the files and
# evaluating Astra3's selections with PyMOL's rules. This module supplies the
# rest:
#
#   - secondary structure for files without helix and sheet records
#     (astra3_dssp, the DSSP method);
#   - images: each scene is handed to the app, which draws it with 3Dmol.js
#     styled after PyMOL (gui/electron/engine-window.js);
#   - sessions: a PyMOL session (.pse, astra3_pse) and a ChimeraX command
#     file (.cxc) that rebuilds the same scene, so either program opens it;
#   - input, network and sleeping for Python inside the app (_astra3_host).
# ============================================================

import builtins
import io
import json
import os
import re
import sys
import tempfile
import time

try:
    import _astra3_host as HOST
except ImportError:  # run outside the app (tests)
    HOST = None

ENGINE_NAME = "Astra3 Engine"
CTRL_C = "\x03"


# ------------------------------------------------------------
# The computer's paths
# ------------------------------------------------------------

def host_platform():
    return getattr(HOST, "platform", None) or os.environ.get("ASTRA3_HOST_PLATFORM") or sys.platform


def host_path(path):
    """A path as the computer names it. On Windows, Python sees drive C: as
    /C:/ (gui/engine/astra3-engine.js mounts each drive there)."""
    text = str(path)
    if host_platform() == "win32":
        m = re.match(r"^/([A-Za-z]):(/.*)?$", text)
        if m:
            return m.group(1) + ":" + (m.group(2) or "/").replace("/", "\\")
    return text


def python_path(path):
    """The inverse of host_path, for paths the app hands over."""
    text = str(path)
    if host_platform() == "win32":
        m = re.match(r"^([A-Za-z]):[\\/](.*)$", text)
        if m:
            return "/" + m.group(1).upper() + ":/" + m.group(2).replace("\\", "/")
    return text


# ------------------------------------------------------------
# Python inside the app: sleep, input, network
# ------------------------------------------------------------

def _sleep(seconds):
    """time.sleep without keeping a processor core busy (WebAssembly
    Python's own sleep spins). Waits in short steps so a cancel is seen."""
    seconds = float(seconds)
    if seconds < 0:
        raise ValueError("sleep length must be non-negative")
    end = time.monotonic() + seconds
    while True:
        left = end - time.monotonic()
        if left <= 0:
            return
        HOST.sleep(min(left, 0.1))


_builtin_input = builtins.input


def _input(prompt=""):
    """input(), where a cancel from the app (Ctrl+C) is a KeyboardInterrupt,
    as in a terminal. Some of Astra3's questions take Ctrl+C as "no"; the
    cancel then stays requested, so the run stops at its next checkpoint and
    is not left waiting at a later question. It is cleared back at the
    command prompt."""
    core = sys.modules.get("astra3_core")
    at_command_prompt = sys._getframe(1).f_code.co_name == "_astra3_main"
    if core is not None and getattr(core, "cancel_requested", False):
        if at_command_prompt:
            core.cancel_requested = False
        else:
            raise KeyboardInterrupt
    line = _builtin_input(prompt)
    if line == CTRL_C:
        if core is not None and not at_command_prompt:
            core.cancel_requested = True
        raise KeyboardInterrupt
    return line


class _Response(io.BytesIO):
    """What urllib.request.urlopen returns, as far as Astra3 uses it."""

    def __init__(self, body, status, reason, url, headers):
        super().__init__(body)
        self.status = self.code = status
        self.reason = self.msg = reason
        self.url = url
        self.headers = headers

    def getcode(self):
        return self.status

    def geturl(self):
        return self.url

    def info(self):
        return self.headers

    def getheader(self, name, default=None):
        return self.headers.get(name, default)


_builtin_urlopen = None


def urlopen(url, data=None, timeout=None, *args, **kwargs):
    """urllib.request.urlopen for http(s), made by the app's process (Python
    here has no sockets). Errors are urllib's own: HTTPError for an error
    status, URLError when the server cannot be reached."""
    import http.client
    import urllib.error
    import urllib.request
    request = url if isinstance(url, urllib.request.Request) else urllib.request.Request(str(url))
    if data is not None:
        request.data = data
    full_url = request.full_url
    if not full_url.lower().startswith(("http://", "https://")):
        return _builtin_urlopen(request, timeout=timeout or 60)
    headers = dict(request.header_items())
    body = request.data
    if isinstance(body, str):
        body = body.encode("utf-8")
    try:
        wait = float(timeout)
    except (TypeError, ValueError):
        wait = 60.0
    reply = HOST.fetch(full_url, request.get_method(), json.dumps(headers),
                       bytes(body) if body is not None else None, wait)
    error = getattr(reply, "error", None)
    if error:
        raise urllib.error.URLError(str(error))
    message = http.client.HTTPMessage()
    for key, value in json.loads(reply.headers):
        message[key] = value
    content = reply.body.to_bytes()
    response = _Response(content, int(reply.status), str(reply.reason or ""), str(reply.url or full_url), message)
    if response.status >= 400:
        raise urllib.error.HTTPError(full_url, response.status, response.reason, message, response)
    return response


def _open_folder(path):
    """Shows a folder in Finder or File Explorer, through the app."""
    graphics = _current_graphics()
    if graphics is not None:
        try:
            graphics.request({"kind": "open", "path": host_path(os.path.abspath(str(path)))}, timeout=30)
        except Exception:  # noqa: BLE001 -- a convenience, as with the other engines
            pass


def setup_host():
    """Puts the app's input, network and sleep in place of Python's own."""
    global _builtin_urlopen
    if HOST is None:
        return
    import urllib.request
    time.sleep = _sleep
    builtins.input = _input
    if _builtin_urlopen is None:
        _builtin_urlopen = urllib.request.urlopen
        urllib.request.urlopen = urlopen
    try:
        import astra3_security
        astra3_security.open_path_in_file_manager = _open_folder
    except ImportError:
        pass
    # Pyodide points tempfile at its own /tmp, which on Windows exists only
    # inside Python (only the drives are shared with the computer), so the
    # app could not open the scene files written there. The computer's temp
    # folder is used instead. On macOS /tmp is the computer's own.
    if host_platform() == "win32":
        host_tmp = os.environ.get("TMPDIR", "")
        if host_tmp and os.path.isdir(host_tmp):
            tempfile.tempdir = host_tmp


def run_script(path):
    """Runs astra3.py as the main program; returns its exit status."""
    setup_host()
    namespace = {"__name__": "__main__", "__file__": path, "__builtins__": builtins}
    with open(path, "r", encoding="utf-8") as fh:
        code = compile(fh.read(), path, "exec")
    try:
        exec(code, namespace)
    except SystemExit as e:
        sys.stdout.flush()
        return e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
    sys.stdout.flush()
    return 0


def install():
    """Makes `from pymol import cmd` give Astra3's engine (astra3_chimerax)
    with this module drawing the images. Called by astra3.py."""
    import astra3_chimerax
    setup_host()
    graphics = _current_graphics()
    if graphics is None:
        graphics = Astra3EngineGraphics()
    cmd = astra3_chimerax.install(graphics=graphics)
    return cmd


def _current_graphics():
    module = sys.modules.get("astra3_chimerax")
    graphics = getattr(module, "GRAPHICS", None) if module else None
    return graphics if isinstance(graphics, Astra3EngineGraphics) else None


# ------------------------------------------------------------
# Versions
# ------------------------------------------------------------

def runtime_versions():
    """{"python": "3.14.2", "pyodide": "314.0.7", "numpy": "2.4.6"}, for
    the Methods text and the JSON export."""
    import numpy as np
    return {"python": "%d.%d.%d" % sys.version_info[:3],
            "pyodide": str(getattr(HOST, "pyodide_version", "") or ""),
            "numpy": np.__version__}


def runtime_text():
    """"Python 3.14.2 and NumPy 2.4.6 in Pyodide 314.0.7"."""
    v = runtime_versions()
    inside = f" in Pyodide {v['pyodide']}" if v["pyodide"] else ""
    return f"Python {v['python']} and NumPy {v['numpy']}{inside}"


# ------------------------------------------------------------
# Scenes
# ------------------------------------------------------------

def image_title(scene, png_path):
    """The name an image is listed under in the drawing window: its
    structures and file name, or only the file name for Astra3's own working
    objects (TERMINI close-ups)."""
    names = [str(m.name) for m in scene["molecules"] if not str(m.name).startswith("_")]
    base = os.path.basename(str(png_path))
    return f"{', '.join(names)}: {base}" if names else base


def is_closeup(scene):
    """A TERMINI close-up: only the terminus windows Astra3 draws for it."""
    names = [str(m.name) for m in scene["molecules"]]
    return bool(names) and all(n.startswith("_closeup_") for n in names)


def _scene_order(mol):
    """Atom indices in the order a scene's PDB file lists them: polymer
    (ATOM) records first, then hetero groups, as in a PDB entry. 3Dmol draws
    strand arrowheads only when a chain's residues come first."""
    import numpy as np
    het = np.asarray(mol.hetatm, dtype=bool)
    return np.concatenate([np.flatnonzero(~het), np.flatnonzero(het)])


def _written_atoms(mol):
    """Indices of the atoms written to a scene's PDB file, in order: those
    with coordinates in the first state (as astra3_chimerax writes them)."""
    import numpy as np
    order = _scene_order(mol)
    return order[~np.isnan(mol.coords[0][order]).any(axis=1)].tolist()


def _residue_key(mol, i):
    resv = int(mol.resv[i])
    return str(mol.chain[i]), resv, str(mol.resi[i])[len(str(resv)):], str(mol.segi[i])


def ss_runs(mol):
    """[(chain, "H" or "S", (resn, resv, icode) first, (...) last)]: runs of
    helix or strand in file order, read from the CA atoms."""
    import astra3_chimerax as engine
    runs = []
    current = None
    previous = None
    for i in range(mol.n):
        if not mol.flags[i] & engine.F_PROTEIN or str(mol.atom_name[i]) != "CA":
            continue
        chain, resv, icode, _segi = _residue_key(mol, i)
        if previous is not None and previous[:3] == (chain, resv, icode):
            continue  # an alternate location of the same CA
        ss = str(mol.ss[i])
        kind = ss if ss in ("H", "S") else None
        here = (str(mol.resn[i]), resv, icode)
        broken = previous is None or previous[0] != chain or resv - previous[1] > 1
        if current and (kind != current[1] or broken):
            runs.append(tuple(current))
            current = None
        if kind and current is None:
            current = [chain, kind, here, here]
        elif kind:
            current[3] = here
        previous = (chain, resv, icode)
    if current:
        runs.append(tuple(current))
    return runs


def write_scene_pdb(path, mol):
    """The molecule's first state as PDB, with HELIX and SHEET records from
    its secondary structure so a viewer draws the cartoon Astra3 assigned."""
    import astra3_chimerax as engine
    records = []
    helix = strand = 0
    for chain, kind, (s_resn, s_resv, s_ins), (e_resn, e_resv, e_ins) in ss_runs(mol):
        if kind == "H":
            helix += 1
            records.append("HELIX  %3d %3s %3s %1s %4d%1s %3s %1s %4d%1s%2d%30s %5d" % (
                helix % 1000, str(helix % 1000), s_resn[:3], chain[:1], s_resv, s_ins[:1], e_resn[:3],
                chain[:1], e_resv, e_ins[:1], 1, "", 0))
        else:
            strand += 1
            records.append("SHEET  %3d %3s %1d %3s %1s%4d%1s %3s %1s%4d%1s%2d" % (
                1, "S%d" % (strand % 100), 1, s_resn[:3], chain[:1], s_resv, s_ins[:1], e_resn[:3],
                chain[:1], e_resv, e_ins[:1], 0))
    # No END record: 3Dmol discards the HELIX and SHEET records when it
    # reads a bare END line and works out its own secondary structure.
    lines = [line for line in engine._pdb_lines([(mol, _scene_order(mol))]) if line != "END"]
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(records + lines) + "\n")


def _ranges(numbers):
    """[1, 2, 3, 7] -> [[1, 3], [7, 7]]."""
    out = []
    for n in numbers:
        if out and n == out[-1][1] + 1:
            out[-1][1] = n
        else:
            out.append([n, n])
    return out


def cgo_primitives(cgo_objects):
    """PyMOL CGO lists as drawing primitives the renderer reads: cylinders,
    cones, spheres and line segments, each with its colors."""
    out = []
    for obj in cgo_objects:
        data = [float(x) for x in obj.data]
        i = 0
        color = [1.0, 1.0, 1.0]
        vertices = []
        mode = None
        while i < len(data):
            op = int(data[i])
            if op == 9:          # CYLINDER x1 y1 z1 x2 y2 z2 r rgb1 rgb2
                v = data[i + 1:i + 14]
                out.append({"type": "cylinder", "from": v[0:3], "to": v[3:6], "radius": v[6],
                            "color": v[7:10], "color2": v[10:13]})
                i += 14
            elif op == 27:       # CONE x1 y1 z1 x2 y2 z2 r1 r2 rgb1 rgb2 cap1 cap2
                v = data[i + 1:i + 17]
                out.append({"type": "cone", "from": v[0:3], "to": v[3:6], "radius": v[6], "radius2": v[7],
                            "color": v[8:11], "color2": v[11:14]})
                i += 17
            elif op == 7:        # SPHERE x y z r
                v = data[i + 1:i + 5]
                out.append({"type": "sphere", "center": v[0:3], "radius": v[3], "color": list(color)})
                i += 5
            elif op == 6:        # COLOR r g b
                color = data[i + 1:i + 4]
                i += 4
            elif op == 2:        # BEGIN mode
                mode = int(data[i + 1])
                vertices = []
                i += 2
            elif op == 4:        # VERTEX x y z
                vertices.append((data[i + 1:i + 4], list(color)))
                i += 4
            elif op == 3:        # END: LINES are vertex pairs, LINE_STRIP a path
                if mode in (1, 3):
                    pairs = (zip(vertices[0::2], vertices[1::2]) if mode == 1
                             else zip(vertices[:-1], vertices[1:]))
                    for (a, ca), (b, _cb) in pairs:
                        out.append({"type": "line", "from": a, "to": b, "color": ca})
                vertices = []
                i += 1
            elif op in (10, 11):  # LINEWIDTH / WIDTHSCALE w
                i += 2
            elif op == 25:       # ALPHA a
                i += 2
            elif op == 0:        # STOP
                break
            else:
                i += 1
    return out


BURIAL_RADIUS = 10.0   # A


def burial(points, radius=BURIAL_RADIUS):
    """How buried each point is, 0 (most exposed in the scene) to 1 (most
    buried): the number of other atoms within radius, scaled between the
    5th and 95th percentiles of the scene. The renderer darkens buried
    atoms by it, so shading follows the structure's real packing rather
    than a screen-space guess."""
    import numpy as np
    points = np.asarray(points, dtype=np.float64)
    n = len(points)
    if n == 0:
        return np.zeros(0)
    keys = np.floor(points / radius).astype(np.int64)
    cells = {}
    for k, key in enumerate(map(tuple, keys)):
        cells.setdefault(key, []).append(k)
    counts = np.zeros(n)
    r2 = radius * radius
    for key, members in cells.items():
        near = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    near += cells.get((key[0] + dx, key[1] + dy, key[2] + dz), [])
        here = points[members]
        there = points[near]
        d2 = ((here[:, None, :] - there[None, :, :]) ** 2).sum(axis=2)
        counts[members] = (d2 < r2).sum(axis=1) - 1
    low, high = np.percentile(counts, 5), np.percentile(counts, 95)
    if high <= low:
        return np.zeros(n)
    return np.clip((counts - low) / (high - low), 0.0, 1.0)


_latest_burial = {}     # "points" and their "burial", for the scene drawn last


def scene_burial(points):
    """burial(points), kept from one image to the next: a run draws the same
    atoms from several directions, and burial does not depend on the view."""
    import numpy as np
    kept = _latest_burial.get("points")
    if kept is None or kept.shape != points.shape or not np.array_equal(kept, points):
        _latest_burial["burial"] = burial(points)
        _latest_burial["points"] = points
    return _latest_burial["burial"]


def scene_job(kind, output, width, height, scene, workdir, title=""):
    """The scene as the renderer reads it: one PDB file per structure with
    each atom's color, which atoms are sticks and spheres, the drawing
    objects, PyMOL's camera (view and field of view), size and background."""
    import astra3_chimerax as engine
    job = {"kind": kind, "output": host_path(os.path.abspath(output)), "title": title,
           "size": [int(width), int(height)], "background": [float(c) for c in scene["background"]],
           "opaque": bool(scene["opaque"]), "view": [float(v) for v in scene["view"]],
           "fov": float(scene["fov"]), "structures": [], "palette": {}, "cgo": cgo_primitives(scene["cgo"])}
    import astra3_pse
    import numpy as np
    written = [_written_atoms(mol) for mol in scene["molecules"]]
    xyz = [mol.coords[0][idx] for mol, idx in zip(scene["molecules"], written)]
    shown = np.concatenate(xyz) if xyz else np.zeros((0, 3))
    buried = scene_burial(shown)
    start = 0
    for k, (mol, idx) in enumerate(zip(scene["molecules"], written)):
        pdb = os.path.join(workdir, f"structure_{k + 1}.pdb")
        write_scene_pdb(pdb, mol)
        colors, sticks, spheres = [], [], []
        for serial, i in enumerate(idx, start=1):
            index = int(mol.color[i])
            colors.append(index)
            if str(index) not in job["palette"]:
                job["palette"][str(index)] = [float(c) for c in scene["colors"].get(index, (0.5, 0.5, 0.5))]
            flags = int(mol.flags[i])
            if flags & engine.F_INORGANIC:
                radius = astra3_pse.VDW.get(str(mol.elem[i]).upper(), astra3_pse.DEFAULT_VDW)
                spheres.append([serial, radius])
            elif flags & engine.F_ORGANIC:
                sticks.append(serial)
        # Session labels, at their atoms' positions.
        labels = [{"xyz": [float(c) for c in mol.coords[0][i]], "text": text}
                  for i, text in engine.scene_labels(mol, idx)]
        job["structures"].append({"name": mol.name, "pdb": host_path(pdb), "colors": colors,
                                  "burial": [round(float(b), 3) for b in buried[start:start + len(idx)]],
                                  "sticks": _ranges(sticks), "spheres": spheres, "labels": labels})
        start += len(idx)
    origin = np.array(job["view"][12:15])
    job["radius"] = float(np.linalg.norm(shown - origin, axis=1).max()) if len(shown) else 10.0
    job["closeup"] = is_closeup(scene)
    # Label height as a fraction of image height (PyMOL's default).
    job["label_fraction"] = engine.LABEL_HEIGHT_FRACTION
    return job


# ------------------------------------------------------------
# The graphics side of astra3_chimerax for this engine
# ------------------------------------------------------------

class EngineError(RuntimeError):
    pass


class Astra3EngineGraphics:
    """Secondary structure, images and sessions for astra3_chimerax when
    the Astra3 Engine runs it."""

    name = "astra3"

    def __init__(self):
        jobs = os.environ.get("ASTRA3_ENGINE_JOBS", "").strip()
        self.jobs = python_path(jobs) if jobs else None
        # Inside the app's jobs folder when there is one: the app removes that
        # folder when it stops the engine, which close() never sees.
        self.workdir = tempfile.mkdtemp(prefix="astra3_engine_",
                                        dir=self.jobs if self.jobs and os.path.isdir(self.jobs) else None)
        self.count = 0
        self.titles = {}

    # -- secondary structure ---------------------------------------------
    def assign_secondary_structure(self, mol, path):
        """DSSP (Kabsch and Sander, 1983) for files without helix and sheet
        records; astra3_chimerax uses the file's records when present."""
        import astra3_dssp
        return astra3_dssp.assign_to_molecule(mol)

    # -- the app -------------------------------------------------------------
    def request(self, job, timeout=600):
        """Hands a job to the app and waits for its answer: a JSON file in
        the jobs folder, answered by a .done file beside it."""
        if not self.jobs or not os.path.isdir(self.jobs):
            raise EngineError("The Astra3 Engine draws images through the Astra3 app, and was started "
                              "without it.")
        self.count += 1
        name = "%d_%06d" % (os.getpid(), self.count)
        queued = os.path.join(self.jobs, name + ".json")
        done = os.path.join(self.jobs, name + ".done")
        temp = queued + ".tmp"
        with open(temp, "w", encoding="utf-8") as fh:
            fh.write(json.dumps(job))   # the same text as json.dump, encoded in one pass
        os.replace(temp, queued)
        deadline = time.monotonic() + timeout
        while not os.path.exists(done):
            if time.monotonic() > deadline:
                raise EngineError("The Astra3 app did not finish the image in time.")
            time.sleep(0.05)
        try:
            with open(done, "r", encoding="utf-8") as fh:
                reply = json.load(fh)
        finally:
            # The job first: the app takes a job without a .done file as
            # unanswered and would draw it again, by then possibly from the
            # next scene's structure files.
            for path in (queued, done):
                try:
                    os.remove(path)
                except OSError:
                    pass
        if not reply.get("ok"):
            raise EngineError(reply.get("error") or "The image could not be drawn.")
        return reply

    def render(self, png_path, width, height, scene):
        if os.path.exists(png_path):
            os.remove(png_path)
        job = scene_job("image", png_path, width, height, scene, self.workdir,
                        title=image_title(scene, png_path))
        self.request(job)
        if not os.path.exists(png_path):
            raise EngineError("The Astra3 app did not write the image.")

    def save_session(self, path, scene):
        """A PyMOL session (.pse) and, beside it, a ChimeraX command file
        (.cxc) that opens the same scene in ChimeraX."""
        import astra3_pse
        base = path[:-4] if path.lower().endswith((".pse", ".cxs")) else path
        astra3_pse.write_session(base + ".pse", scene)
        write_chimerax_commands(base + ".cxc", scene)

    def version(self):
        from astra3_core import ASTRA3_VERSION
        return ASTRA3_VERSION

    def close(self):
        import shutil
        shutil.rmtree(self.workdir, ignore_errors=True)


# ------------------------------------------------------------
# ChimeraX command file
# ------------------------------------------------------------

def _hex(rgb):
    return "#%02x%02x%02x" % tuple(max(0, min(255, int(round(255 * float(c))))) for c in rgb[:3])


def _cx_safe(text):
    """One letter or digit, as the scene PDB holds a chain or insertion code (one column there). Anything
    else could be read by ChimeraX as part of a command: it ends a command at a semicolon."""
    return re.sub(r"[^A-Za-z0-9]", "_", str(text)[:1]) if text else ""


def _cx_residues(model, keys):
    """A ChimeraX residue specification for residue keys of one model, a
    chain at a time, each part naming the model: #1/A:5-9,12 #1/B:3."""
    by_chain = {}
    for chain, resv, icode, _segi in keys:
        chain, icode = _cx_safe(chain), _cx_safe(icode)
        tokens = by_chain.setdefault(chain, [])
        if not tokens or tokens[-1] != (resv, icode):
            tokens.append((resv, icode))
    parts = []
    for chain, tokens in by_chain.items():
        out = []
        start = prev = None
        for resv, icode in tokens:
            if prev is not None and not icode and not prev[1] and resv == prev[0] + 1:
                prev = (resv, icode)
                continue
            if start is not None:
                out.append(_cx_range(start, prev))
            start = prev = (resv, icode)
        if start is not None:
            out.append(_cx_range(start, prev))
        parts.append(f"{model}/{chain}:" + ",".join(out) if chain else f"{model}:" + ",".join(out))
    return " ".join(parts)


def _cx_range(start, end):
    first = f"{start[0]}{start[1]}"
    return first if start == end else f"{first}-{end[0]}{end[1]}"


def write_chimerax_commands(path, scene):
    """A .cxc file that rebuilds the scene in ChimeraX the way the ChimeraX
    engine draws it: the structures (PDB files in a folder beside it),
    Astra3's colors, cartoon, ligand sticks, ion spheres, the termini
    arrows (BILD), the same camera and background. ChimeraX runs a .cxc
    from its own folder, so the two can be moved together."""
    import astra3_chimerax as engine
    import astra3_chimerax_scene as cxscene
    folder = path[:-4] + "_files"
    os.makedirs(folder, exist_ok=True)
    stem = os.path.basename(folder)
    lines = ["# Astra3 scene for UCSF ChimeraX, written by the Astra3 Engine.",
             "# Open this file in ChimeraX. The structures are in the " + stem + " folder beside it.",
             "close"]
    for k, mol in enumerate(scene["molecules"], start=1):
        name = f"{k}_{re.sub(r'[^A-Za-z0-9_.-]', '_', mol.name)}.pdb"
        write_scene_pdb(os.path.join(folder, name), mol)
        lines.append(f'open "{stem}/{name}" format pdb')
        spec = f"#{k}"
        residues = {}
        for i in _written_atoms(mol):
            residues.setdefault(_residue_key(mol, i), []).append(i)
        # Ribbons take the color of each residue's CA (C4' in nucleic acids),
        # or of its first atom.
        ribbons = {}
        atoms = {}
        for key, members in residues.items():
            guide = next((i for i in members if str(mol.atom_name[i]) == "CA"), None)
            if guide is None:
                guide = next((i for i in members if str(mol.atom_name[i]) == "C4'"), members[0])
            ribbons.setdefault(int(mol.color[guide]), []).append(key)
            colors = {int(mol.color[i]) for i in members}
            if len(colors) == 1:
                atoms.setdefault(colors.pop(), {"residues": [], "atoms": []})["residues"].append(key)
            else:
                for i in members:
                    atoms.setdefault(int(mol.color[i]), {"residues": [], "atoms": []})["atoms"].append(i)
        for index, keys in ribbons.items():
            rgb = scene["colors"].get(index, (0.5, 0.5, 0.5))
            lines.append(f"color {_cx_residues(spec, keys)} {_hex(rgb)} target c")
        for index, group in atoms.items():
            rgb = scene["colors"].get(index, (0.5, 0.5, 0.5))
            if group["residues"]:
                lines.append(f"color {_cx_residues(spec, group['residues'])} {_hex(rgb)} target a")
            by_residue = {}
            for i in group["atoms"]:
                by_residue.setdefault(_residue_key(mol, i), set()).add(str(mol.atom_name[i]))
            for key, names in by_residue.items():
                lines.append(f"color {_cx_residues(spec, [key])}@{','.join(sorted(names))} {_hex(rgb)} target a")
        lines += [f"hide {spec} target a", f"cartoon {spec}",
                  f"show ({spec} & (ligand | ions)) target a",
                  f"style ({spec} & ligand) stick", f"style ({spec} & ions) sphere"]
    if cxscene._bild_from_cgo(scene["cgo"], os.path.join(folder, "arrows.bild")):
        lines.append(f'open "{stem}/arrows.bild"')
    # Session labels, drawn the same way as by the ChimeraX engine.
    height = engine.label_height(scene)
    labels = [(mol, i, text) for mol in scene["molecules"] for i, text in engine.scene_labels(mol, _written_atoms(mol))]
    for k, (mol, i, text) in enumerate(labels, start=1):
        lines += cxscene.label_commands(f"#{cxscene.LABEL_MODEL_BASE + k}",
                                        {"xyz": [float(c) for c in mol.coords[0][i]], "text": text}, height)
    bg = scene.get("background") or (1, 1, 1)
    lines += ["lighting soft", "graphics silhouettes true width 1.5",
              "set bgColor rgb(%d,%d,%d)" % tuple(int(round(255 * c)) for c in bg[:3]), "clip off"]
    lines += cxscene.camera_commands(cxscene.scene_camera(scene))
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")

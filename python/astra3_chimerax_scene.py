# ============================================================
# astra3_chimerax_scene.py
# Astra3: Structural Analysis Toolkit for PDB Rendering Automation
# Created by Andre Aguirre
# Copyright (c) 2026 Andre Aguirre
# Licensed under the GNU General Public License, version 3 or later (GPL-3.0-or-later).
# See LICENSE file for details.
# ============================================================
#
# The ChimeraX side of the ChimeraX engine (see astra3_chimerax): secondary
# structure, images and session files.
#
# Astra3 runs inside ChimeraX without its window (--nogui), which keeps its
# text interface on standard input and output. ChimeraX cannot draw images
# without a window except on Linux (--offscreen), so on macOS and Windows a
# second, windowed ChimeraX is started the first time an image is needed.
# It draws with its window hidden (checked on macOS: hidden, minimized and
# off-screen windows all save the same image as a visible one). On macOS it
# is launched hidden and in the background (open -g -j) and leaves the Dock,
# so nothing appears while Astra3 renders.
#
# The helper ends when the engine asks, when the engine process is gone
# however it ended (closed, cancelled, crashed or killed), and when its
# folder is removed. macOS sends a person's own ChimeraX launches and file
# opens to the oldest ChimeraX running, which can be the helper; it passes
# them to a new ChimeraX of their own and ends, and the engine starts
# another helper for its next image.
#
# The two processes talk through files in a private temporary folder, not a
# network port: ChimeraX's REST server would make macOS ask whether
# ChimeraX may use the local network, and would accept commands from
# anything that can reach the port.
#
# A scene is handed over as a job file: one PDB file per structure, each
# atom's color, the drawing objects (termini arrows) as a BILD file, and the
# camera. This file is also the script ChimeraX runs to build it, so both
# processes draw a scene the same way.
# ============================================================

import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import time

HELIX, STRAND = "H", "S"


# ------------------------------------------------------------
# Building a scene inside ChimeraX
# ------------------------------------------------------------

def _run(session, command):
    from chimerax.core.commands import run
    return run(session, command, log=False)


class _Quiet:
    """Keeps ChimeraX's log messages out of Astra3's output: without a
    window, ChimeraX prints its log to standard output, which the app reads."""

    def __init__(self, session):
        self.session = session
        self.collator = None
        try:
            from chimerax.core.logger import Collator
            self.collator = Collator(session.logger, "", log_messages=False)
        except Exception:  # noqa: BLE001
            pass

    def __enter__(self):
        if self.collator is not None:
            self.collator.__enter__()
        # Status-line messages ("Changed 0 atom styles") bypass the collator.
        self.logger = getattr(self.session, "logger", None)
        self.status = getattr(self.logger, "status", None)
        if self.status is not None:
            self.logger.status = lambda *a, **k: None
        return self

    def __exit__(self, *exc):
        if self.status is not None:
            self.logger.status = self.status
        if self.collator is not None:
            self.collator.__exit__(*exc)
        return False


def _open(session, path, fmt=None):
    """Open a file without adding it to ChimeraX's Recent Files, which is the
    person's own list. The open command records every file it opens; the
    API it calls does not. Falls back to the command on an older ChimeraX."""
    try:
        kw = {"format_name": fmt} if fmt else {}
        models, _status = session.open_command.open_data(str(path), **kw)
        session.models.add(models)
        return list(models)
    except Exception:  # noqa: BLE001
        command = f"open {_quote(path)}" + (f" format {fmt}" if fmt else "")
        return list(_run(session, command) or [])


def _quote(path):
    return '"' + str(path).replace("\\", "/") + '"'


def build_scene(session, job):
    """Open the job's structures and drawing objects, color them and set
    the camera. Returns the models opened."""
    _run(session, "close")
    models = []
    for entry in job["structures"]:
        opened = _open(session, entry["pdb"], "pdb")
        for model in opened:
            models.append(model)
            _color_structure(model, entry["colors"])
            spec = model.atomspec
            _run(session, f"hide {spec} target a")
            _run(session, f"cartoon {spec}")
            _run(session, f"show ({spec} & (ligand | ions)) target a")
            _run(session, f"style ({spec} & ligand) stick")
            _run(session, f"style ({spec} & ions) sphere")
    if job.get("bild"):
        models += _open(session, job["bild"], "bild")
    labels = [label for entry in job["structures"] for label in entry.get("labels") or []]
    for k, label in enumerate(labels, start=1):
        for command in label_commands(f"#{LABEL_MODEL_BASE + k}", label, job.get("label_height") or 1.0):
            _run(session, command)
    _run(session, "lighting soft")
    # Outlines are drawn in pixels of the final image, so they are scaled with
    # its width to look the same at every image size: 1 px at 1200 px wide,
    # close to PyMOL's ray-traced outline.
    width = (job.get("size") or [0])[0]
    outline = max(1.0, 1.0 * width / 1200.0)
    _run(session, f"graphics silhouettes true width {outline:.2f}")
    bg = job.get("background") or [1, 1, 1]
    _run(session, "set bgColor rgb(%d,%d,%d)" % tuple(int(round(255 * c)) for c in bg[:3]))
    _run(session, "clip off")
    _set_camera(session, job)
    return models


# Model numbers for label markers. ChimeraX hides an atom's label when the
# atom is hidden, and structures are drawn as cartoon with atoms hidden, so
# labels are attached to separate, invisible markers instead.
LABEL_MODEL_BASE = 1000


def label_commands(model_spec, label, height):
    """ChimeraX commands that draw one label at its atom's position: an
    invisible marker carrying a black label, sized to match PyMOL."""
    x, y, z = label["xyz"]
    text = str(label["text"])
    # Quote with whichever quote character the text doesn't contain; if it
    # has both, double quotes become single quotes.
    quoted = f"'{text}'" if '"' in text and "'" not in text else '"' + text.replace('"', "'") + '"'
    return [f"marker {model_spec} position {x:.3f},{y:.3f},{z:.3f} color black radius 0.001",
            f"label {model_spec} atoms text {quoted} color black bgColor none height {height:.3f}"]


def _color_structure(model, colors):
    """colors: {"chain|number|icode|atom name": [r, g, b]} as written by the
    engine. Ribbons take the color of their residue's CA (or first) atom,
    as in PyMOL."""
    atoms = model.atoms
    rgba = atoms.colors.copy()
    residues = atoms.residues
    keys = [f"{c}|{n}|{i.strip()}|{a}" for c, n, i, a in
            zip(residues.chain_ids, residues.numbers, residues.insertion_codes, atoms.names)]
    for k, key in enumerate(keys):
        rgb = colors.get(key)
        if rgb is not None:
            rgba[k, :3] = [int(round(255 * v)) for v in rgb]
    atoms.colors = rgba
    res = model.residues
    ribbon = res.ribbon_colors.copy()
    for k, r in enumerate(res):
        guide = r.find_atom("CA") or r.find_atom("C4'") or (r.atoms[0] if len(r.atoms) else None)
        if guide is not None:
            ribbon[k] = guide.color
    res.ribbon_colors = ribbon


def camera_commands(camera, size=None):
    """The ChimeraX commands that set a job's camera: the camera's axes from
    the scene, backed off from the framed sphere until it fits the image."""
    axes = camera["axes"]         # camera x, y, z axes in scene coordinates
    center = camera["center"]
    radius = max(float(camera["radius"]), 1.0)
    fov = float(camera.get("fov", 20.0))
    width, height = size or (1, 1)
    half_h = math.radians(fov) / 2.0
    half_v = math.atan(math.tan(half_h) * float(height) / float(width))
    distance = radius / math.sin(min(half_h, half_v))
    z = axes[2]
    pos = [center[k] + distance * z[k] for k in range(3)]
    numbers = []
    for row in range(3):
        numbers += [axes[0][row], axes[1][row], axes[2][row], pos[row]]
    commands = [f"camera mono fieldOfView {fov:.4f}",
                "view matrix camera " + ",".join(f"{v:.6f}" for v in numbers)]
    slab = camera.get("slab")
    if slab:
        # PyMOL's clipping slab around its view origin, with its fog from
        # 45% of the slab's depth (fog_start), as the Astra3 Engine draws;
        # TERMINI close-ups fog lightly, from 80%. ChimeraX otherwise fades
        # over the depth of everything shown.
        ox, oy, oz, half = slab[:4]
        start = 0.8 if camera.get("closeup") else 0.45
        commands += [f"clip near {-half:.3f} far {half:.3f} position {ox:.3f},{oy:.3f},{oz:.3f}",
                     f"lighting depthCue true depthCueStart {start} depthCueEnd 1"]
    return commands


def _set_camera(session, job):
    for command in camera_commands(job["camera"], job.get("size")):
        _run(session, command)


def render_job(session, job):
    build_scene(session, job)
    width, height = job["size"]
    transparent = "false" if job.get("opaque") else "true"
    _run(session, f"save {_quote(job['output'])} width {int(width)} height {int(height)} supersample 3 "
                  f"transparentBackground {transparent}")


def session_job(session, job):
    build_scene(session, job)
    _run(session, f"save {_quote(job['output'])} format session")


def run_job_file(session, path):
    with open(path, "r", encoding="utf-8") as fh:
        job = json.load(fh)
    if job.get("kind") == "session":
        session_job(session, job)
    else:
        render_job(session, job)


def _hide_window(session):
    """Hide the windowed ChimeraX's window; it still draws. On macOS it
    also leaves the Dock and the menu bar."""
    window = getattr(getattr(session, "ui", None), "main_window", None)
    if window is not None:
        try:
            window.hide()
        except Exception:  # noqa: BLE001 -- cosmetic; drawing still works
            pass
    if sys.platform == "darwin":
        try:
            _mac_accessory_app()
        except Exception:  # noqa: BLE001
            pass


def _mac_accessory_app():
    """[NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory]
    then [NSApp deactivate]: no Dock icon, no menu bar, focus handed back."""
    import ctypes
    import ctypes.util
    objc = ctypes.cdll.LoadLibrary(ctypes.util.find_library("objc"))
    ctypes.cdll.LoadLibrary(ctypes.util.find_library("AppKit"))
    objc.objc_getClass.restype = ctypes.c_void_p
    objc.objc_getClass.argtypes = [ctypes.c_char_p]
    objc.sel_registerName.restype = ctypes.c_void_p
    objc.sel_registerName.argtypes = [ctypes.c_char_p]
    address = ctypes.cast(objc.objc_msgSend, ctypes.c_void_p).value
    send = ctypes.CFUNCTYPE(ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p)(address)
    send_long = ctypes.CFUNCTYPE(ctypes.c_byte, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_long)(address)
    app = send(objc.objc_getClass(b"NSApplication"), objc.sel_registerName(b"sharedApplication"))
    if app:
        send_long(app, objc.sel_registerName(b"setActivationPolicy:"), 1)
        send(app, objc.sel_registerName(b"deactivate"))


def _process_alive(pid):
    if sys.platform.startswith("win"):
        # Not os.kill: on Windows signal 0 is CTRL_C_EVENT.
        import ctypes
        k32 = ctypes.windll.kernel32
        handle = k32.OpenProcess(0x1000, False, pid)
        if not handle:
            return False
        code = ctypes.c_ulong()
        ok = k32.GetExitCodeProcess(handle, ctypes.byref(code))
        k32.CloseHandle(handle)
        return bool(ok) and code.value == 259
    try:
        os.kill(pid, 0)
    except PermissionError:
        return True
    except OSError:
        return False
    return True


def _write_json(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh)
    os.replace(tmp, path)


def _end(session):
    """Ends the helper. ChimeraX's own quit closes its windows and, on macOS,
    leaves ending the program to its last visible window closing, which never
    happens with the window hidden; the process is ended here instead."""
    try:
        session.ui.quit()
    except Exception:  # noqa: BLE001 -- the process ends either way
        pass
    os._exit(0)


# A file opened from the Finder arrives just after the activation that comes
# with it, so a request is acted on once its events have stopped this long
# (seconds).
_OWN_OPEN_SETTLE = 0.5


def _watch_own_opens(session):
    """Collects the person's own ChimeraX launches and file opens that macOS
    hands to the helper (see the header). Opened files are kept out of the
    hidden scene and passed on by _hand_over."""
    from Qt.QtCore import QEvent, QObject

    class OwnOpens(QObject):
        def __init__(self):
            super().__init__()
            self.files = []
            self.last = None

        def eventFilter(self, obj, event):
            kind = event.type()
            if kind == QEvent.Type.FileOpen:
                if event.file():
                    self.files.append(event.file())
                self.last = time.monotonic()
                return True
            if kind == QEvent.Type.ApplicationActivate:
                self.last = time.monotonic()
            return False

        def due(self):
            return self.last is not None and time.monotonic() - self.last >= _OWN_OPEN_SETTLE

    watcher = OwnOpens()
    session.ui.installEventFilter(watcher)
    return watcher


def _hand_over(files):
    """Opens a ChimeraX of the person's own with the files they opened. -n
    makes it a new instance, so macOS cannot send it back to the helper."""
    bundle = _mac_bundle(sys.executable)
    if not bundle:
        return
    try:
        subprocess.Popen(["open", "-n", "-a", bundle] + list(files), stdin=subprocess.DEVNULL,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except OSError:
        pass


def _run_queue(session, queue):
    """Draws every job waiting in the queue, oldest first, and answers each
    with a .done file. A job is renamed .run while it is drawn, which tells
    the engine it was taken (see ChimeraXGraphics._helper_run)."""
    for name in sorted(os.listdir(queue)):
        if not name.endswith(".json"):
            continue
        waiting = os.path.join(queue, name)
        taken = waiting[:-5] + ".run"
        os.replace(waiting, taken)
        try:
            with _Quiet(session):
                run_job_file(session, taken)
            reply = {"ok": True}
        except Exception as e:  # noqa: BLE001 -- reported to the engine
            reply = {"ok": False, "error": str(e) or type(e).__name__}
        _write_json(waiting[:-5] + ".done", reply)
        os.remove(taken)


def serve(session, workdir, parent_pid):
    """The windowed helper's loop: draws the jobs put in workdir/queue, and
    ends when the engine asks (a quit file), when the engine process or the
    folder is gone, or after passing on the person's own ChimeraX open.
    Nothing may escape from the timer: ChimeraX shows uncaught errors in a
    dialog, which would be the hidden helper's only window."""
    from Qt.QtCore import QTimer
    queue = os.path.join(workdir, "queue")
    if not os.path.isdir(queue):
        _end(session)  # the engine gave up on this helper before it started
    _hide_window(session)
    own_opens = _watch_own_opens(session) if sys.platform == "darwin" else None
    state = {"busy": False}

    def tick():
        if state["busy"]:
            return
        if not _process_alive(parent_pid):
            shutil.rmtree(workdir, ignore_errors=True)
            _end(session)
        if not os.path.isdir(queue) or os.path.exists(os.path.join(workdir, "quit")):
            _end(session)
        if own_opens is not None and own_opens.due():
            _hand_over(own_opens.files)
            _end(session)
        state["busy"] = True
        try:
            _run_queue(session, queue)
        except OSError:
            pass  # the folder went away during a job; the next tick ends the helper
        finally:
            state["busy"] = False

    timer = QTimer()
    timer.timeout.connect(tick)
    timer.start(200)
    session._astra3_server = timer
    try:
        _write_json(os.path.join(workdir, "ready"), {"pid": os.getpid()})
    except OSError:
        _end(session)


# ------------------------------------------------------------
# The engine's side: jobs, secondary structure, the render helper
# ------------------------------------------------------------

def _bild_from_cgo(cgo_objects, path):
    """PyMOL CGO lists (cylinders, cones, line segments) as a BILD file."""
    lines = []
    for obj in cgo_objects:
        data = list(obj.data)
        i = 0
        color = (1.0, 1.0, 1.0)
        vertices = []
        while i < len(data):
            op = int(data[i])
            if op == 9:          # CYLINDER x1 y1 z1 x2 y2 z2 r rgb1 rgb2
                x1, y1, z1, x2, y2, z2, r, cr, cg, cb = data[i + 1:i + 11]
                lines.append(f".color {cr:.3f} {cg:.3f} {cb:.3f}")
                lines.append(f".cylinder {x1:.3f} {y1:.3f} {z1:.3f} {x2:.3f} {y2:.3f} {z2:.3f} {r:.3f}")
                i += 14
            elif op == 27:       # CONE x1 y1 z1 x2 y2 z2 r1 r2 rgb1 rgb2 cap1 cap2
                x1, y1, z1, x2, y2, z2, r1 = data[i + 1:i + 8]
                cr, cg, cb = data[i + 9:i + 12]
                lines.append(f".color {cr:.3f} {cg:.3f} {cb:.3f}")
                lines.append(f".cone {x1:.3f} {y1:.3f} {z1:.3f} {x2:.3f} {y2:.3f} {z2:.3f} {r1:.3f}")
                i += 17
            elif op == 6:        # COLOR r g b
                color = tuple(data[i + 1:i + 4])
                i += 4
            elif op == 4:        # VERTEX x y z
                vertices.append(tuple(data[i + 1:i + 4]))
                i += 4
            elif op == 2:        # BEGIN mode
                vertices = []
                i += 2
            elif op == 3:        # END: line segments from vertex pairs
                lines.append(".color %.3f %.3f %.3f" % color)
                for a, b in zip(vertices[0::2], vertices[1::2]):
                    lines.append(".cylinder %.3f %.3f %.3f %.3f %.3f %.3f 0.06" % (a + b))
                vertices = []
                i += 1
            elif op == 10:       # LINEWIDTH w
                i += 2
            else:
                i += 1
    if not lines:
        return None
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    return path


def _mac_bundle(exe):
    """The .app bundle holding exe on macOS, else None."""
    if sys.platform != "darwin":
        return None
    path = os.path.abspath(exe)
    i = path.find(".app/")
    return path[:i + 4] if i > 0 and os.path.isdir(path[:i + 4]) else None


class _ReadyFileProcess:
    """The helper when started through `open`: its process id comes from the
    ready file it writes, and it is watched through that id."""

    def __init__(self, ready, launcher):
        self.ready = ready
        self.launcher = launcher
        self.pid = None

    def poll(self):
        if self.pid is None:
            try:
                with open(self.ready, "r", encoding="utf-8") as fh:
                    self.pid = int(json.load(fh)["pid"])
            except (OSError, ValueError, KeyError):
                # `open` itself failing counts as closed; _helper_start
                # limits how long the ready file may take.
                code = self.launcher.poll()
                return code if code not in (None, 0) else None
        return None if _process_alive(self.pid) else 0

    def wait(self, timeout=None):
        deadline = time.time() + (timeout or 0)
        while self.poll() is None:
            if timeout is not None and time.time() > deadline:
                raise subprocess.TimeoutExpired("chimerax", timeout)
            time.sleep(0.1)
        return 0

    def kill(self):
        if self.pid is not None:
            try:
                import signal
                os.kill(self.pid, signal.SIGKILL)
            except OSError:
                pass


def scene_camera(scene):
    """The camera of a scene: PyMOL's view axes, and the sphere it frames
    (the one zoom framed, or one around all atoms)."""
    import astra3_chimerax as engine
    import numpy as np
    rotation, _position = engine.camera_place(scene["view"])
    frame = scene.get("frame")
    if frame is None or not scene["molecules"]:
        xyz = np.concatenate([m.coords[0] for m in scene["molecules"]]) if scene["molecules"] else np.zeros((1, 3))
        xyz = xyz[~np.isnan(xyz).any(axis=1)] if len(xyz) else xyz
        if not len(xyz):
            xyz = np.zeros((1, 3))
        center = xyz.mean(axis=0)
        frame = (center, float(np.linalg.norm(xyz - center, axis=1).max()) + 2.0)
    # The slab the Astra3 Engine clips and fogs within: the atoms drawn,
    # around PyMOL's view origin, with 4 A to spare.
    origin = np.array(scene["view"][12:15], dtype=float)
    drawn = [m.coords[0] for m in scene["molecules"]]
    drawn = np.concatenate(drawn) if drawn else np.zeros((0, 3))
    drawn = drawn[~np.isnan(drawn).any(axis=1)] if len(drawn) else drawn
    half = (float(np.linalg.norm(drawn - origin, axis=1).max()) if len(drawn) else 10.0) + 4.0
    return {"axes": [list(map(float, rotation[:, c])) for c in range(3)],
            "center": list(map(float, frame[0])), "radius": float(frame[1]), "fov": scene["fov"],
            "slab": [float(origin[0]), float(origin[1]), float(origin[2]), half],
            "closeup": bool(scene["molecules"]) and all(str(m.name).startswith("_closeup_") for m in scene["molecules"])}


class ChimeraXGraphics:
    """Secondary structure, images and sessions for astra3_chimerax."""

    name = "chimerax"

    def __init__(self, session):
        self.session = session
        # Inside the app's jobs folder when there is one: the app removes that
        # folder when it stops the engine, which close() never sees.
        jobs = os.environ.get("ASTRA3_ENGINE_JOBS", "").strip()
        self.workdir = tempfile.mkdtemp(prefix="astra3_cx_", dir=jobs if jobs and os.path.isdir(jobs) else None)
        self.helper = None
        self.queue = None
        # Without a window ChimeraX can draw only on Linux (--offscreen).
        self._inprocess = None if sys.platform.startswith("linux") else False

    # -- secondary structure ---------------------------------------------
    def assign_secondary_structure(self, mol, path):
        """ChimeraX's assignment: the file's helix and sheet records when
        present, otherwise its DSSP implementation."""
        low = str(path).lower()
        low = low[:-3] if low.endswith(".gz") else low
        fmt = "mmcif" if low.endswith((".cif", ".mmcif")) else "pdb"
        try:
            with _Quiet(self.session):
                opened = _open(self.session, path, fmt)
        except Exception:  # noqa: BLE001
            return False
        try:
            ss = {}
            for model in opened:
                res = getattr(model, "residues", None)
                if res is None:
                    continue
                for chain, number, icode, helix, strand in zip(res.chain_ids, res.numbers, res.insertion_codes,
                                                                res.is_helix, res.is_strand):
                    ss[(chain, int(number), icode.strip())] = HELIX if helix else (STRAND if strand else "L")
            if not ss:
                return False
            import numpy as np
            from astra3_chimerax import F_PROTEIN
            out = []
            for i in range(mol.n):
                if not mol.flags[i] & F_PROTEIN:
                    out.append("")
                    continue
                v = int(mol.resv[i])
                icode = str(mol.resi[i])[len(str(v)):]
                out.append(ss.get((str(mol.chain[i]), v, icode), "L"))
            mol.ss = np.array(out, dtype=object)
            return True
        finally:
            with _Quiet(self.session):
                for model in opened:
                    try:
                        self.session.models.close([model])
                    except Exception:  # noqa: BLE001
                        pass

    # -- jobs --------------------------------------------------------------
    def _job(self, kind, output, width, height, scene):
        import astra3_chimerax as engine
        job = {"kind": kind, "output": os.path.abspath(output), "structures": [],
               "size": [int(width), int(height)], "background": list(scene["background"]),
               "opaque": bool(scene["opaque"]), "bild": None}
        for k, mol in enumerate(scene["molecules"]):
            pdb = os.path.join(self.workdir, f"structure_{k + 1}.pdb")
            engine.write_molecule_pdb(pdb, mol)
            colors = {}
            for i in range(mol.n):
                v = int(mol.resv[i])
                icode = str(mol.resi[i])[len(str(v)):]
                key = f"{mol.chain[i]}|{v}|{icode}|{mol.atom_name[i]}"
                colors.setdefault(key, list(scene["colors"].get(int(mol.color[i]), (0.5, 0.5, 0.5))))
            labels = [{"xyz": [float(c) for c in mol.coords[0][i]], "text": text} for i, text in engine.scene_labels(mol)]
            job["structures"].append({"pdb": pdb, "colors": colors, "labels": labels})
        job["label_height"] = engine.label_height(scene)
        job["bild"] = _bild_from_cgo(scene["cgo"], os.path.join(self.workdir, "arrows.bild"))
        job["camera"] = scene_camera(scene)
        path = os.path.join(self.workdir, f"{kind}_job.json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(job, fh)
        return job, path

    def render(self, png_path, width, height, scene):
        job, path = self._job("image", png_path, width, height, scene)
        if os.path.exists(png_path):
            os.remove(png_path)
        if self._inprocess is not False:
            try:
                with _Quiet(self.session):
                    render_job(self.session, job)
                self._inprocess = True
            except Exception:  # noqa: BLE001 -- no offscreen rendering here; use the windowed helper
                if self._inprocess:
                    raise
                self._inprocess = False
        if self._inprocess is False:
            self._helper_run(path)
        if not os.path.exists(png_path):
            raise RuntimeError("ChimeraX did not write the image")

    def save_session(self, path, scene):
        """Saved by the windowed helper when it is already running (it draws
        the scene exactly as the images were drawn), otherwise here, with the
        helper as the fallback where this ChimeraX has no window."""
        if path.lower().endswith(".pse"):
            path = path[:-4] + ".cxs"
        job, job_path = self._job("session", path, 1, 1, scene)
        if os.path.exists(path):
            os.remove(path)
        if self._helper_alive():
            self._helper_run(job_path)
        else:
            try:
                with _Quiet(self.session):
                    session_job(self.session, job)
            except Exception:  # noqa: BLE001
                if self._inprocess is not False:
                    raise
            if not os.path.exists(path) and self._inprocess is False:
                self._helper_run(job_path)
        if not os.path.exists(path):
            raise RuntimeError("ChimeraX did not write the session")

    # -- the windowed helper (macOS, Windows) --------------------------------
    def _helper_alive(self):
        return self.helper is not None and self.helper.poll() is None

    def _helper_start(self):
        exe = os.environ.get("ASTRA3_CHIMERAX_GUI", "").strip()
        if not exe or not os.path.exists(exe):
            raise RuntimeError("Images need ChimeraX with its window, and its program was not found "
                               "(set by the Astra3 app as ASTRA3_CHIMERAX_GUI).")
        self.queue = os.path.join(self.workdir, "queue")
        os.makedirs(self.queue, exist_ok=True)
        for name in ("ready", "quit"):
            try:
                os.remove(os.path.join(self.workdir, name))
            except OSError:
                pass
        command = (f"runscript {_quote(os.path.abspath(__file__))} --serve "
                   f"{_quote(self.workdir)} {os.getpid()}")
        flags = 0
        if sys.platform.startswith("win"):
            flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
        args = ["--nostatus", "--notools", "--cmd", command]
        bundle = _mac_bundle(exe)
        ready = os.path.join(self.workdir, "ready")
        if bundle:
            # Hidden (-j), in the background (-g), as its own instance (-n),
            # and as its own app rather than Astra3's child.
            launcher = subprocess.Popen(["open", "-g", "-j", "-n", "-a", bundle, "--args"] + args,
                                        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                        stderr=subprocess.DEVNULL, env=env)
            self.helper = _ReadyFileProcess(ready, launcher)
        else:
            # Its window can show for a moment on Windows. The app watches
            # for this line to say what the window was.
            print("Starting ChimeraX in the background to draw images and save the session; "
                  "its window may appear briefly.", flush=True)
            self.helper = subprocess.Popen([exe] + args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                           stderr=subprocess.DEVNULL, creationflags=flags, env=env)
        deadline = time.time() + 180
        while not os.path.exists(ready):
            if self.helper.poll() is not None:
                raise RuntimeError("ChimeraX closed while starting")
            if time.time() > deadline:
                self.close()
                raise RuntimeError("ChimeraX did not start in time")
            time.sleep(0.2)

    # How many times one job may outlive its helper before it is drawn. A
    # helper ends without taking the job when it passes on the person's own
    # ChimeraX open (see serve); the job then waits for the next helper.
    HELPER_REPLACEMENTS = 2

    def _helper_run(self, job_path, timeout=600):
        if not self._helper_alive():
            self._helper_start()
        self._jobs = getattr(self, "_jobs", 0) + 1
        queued = os.path.join(self.queue, f"{self._jobs:06d}.json")
        done = queued[:-5] + ".done"
        os.replace(job_path, queued)
        deadline = time.time() + timeout
        replaced = 0
        while not os.path.exists(done):
            if not self._helper_alive() and not os.path.exists(done):
                if not os.path.exists(queued) or replaced >= self.HELPER_REPLACEMENTS:
                    raise RuntimeError("ChimeraX closed while drawing")
                replaced += 1
                self._helper_start()
                continue
            if time.time() > deadline:
                self.close()
                raise RuntimeError("ChimeraX did not finish drawing in time")
            time.sleep(0.05)
        with open(done, "r", encoding="utf-8") as fh:
            reply = json.load(fh)
        os.remove(done)
        if not reply.get("ok"):
            raise RuntimeError(f"ChimeraX: {reply.get('error')}")

    def version(self):
        v = os.environ.get("ASTRA3_ENGINE_VERSION", "").strip()
        if v:
            return v
        try:
            from chimerax.core import version as cx_version
            return str(cx_version)
        except Exception:  # noqa: BLE001
            return ""

    def close(self):
        if self._helper_alive():
            try:
                with open(os.path.join(self.workdir, "quit"), "w", encoding="utf-8"):
                    pass
            except OSError:
                pass
            try:
                self.helper.wait(timeout=10)
            except Exception:  # noqa: BLE001
                self.helper.kill()
        self.helper = None
        shutil.rmtree(self.workdir, ignore_errors=True)


# Run inside the windowed ChimeraX:
#   runscript astra3_chimerax_scene.py --serve <folder> <Astra3 process id>
if "session" in globals() and len(sys.argv) > 3 and sys.argv[-3] == "--serve":
    sys.dont_write_bytecode = True
    serve(globals()["session"], sys.argv[-2], int(sys.argv[-1]))

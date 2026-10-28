"""Astra3: the drawing window for PyMOL and ChimeraX runs.

The Astra3 app can list each image as it is made, with a 3D view turned to
that image's camera (Settings > Drawing). The Astra3 Engine draws its images
in that window itself. Under PyMOL and ChimeraX, the image is drawn by the
program as before, and the scene it was drawn from is handed to the window
afterwards: a JSON file in the folder the app watches (ASTRA3_ENGINE_JOBS),
as the Astra3 Engine's own jobs are, read once and removed by the app.

Nothing is written unless the window is shown (the app leaves a
"window.on" file in the folder while it is), so runs with the window off do
no extra work.
"""

import itertools
import json
import os
import types

# CGO objects Astra3 drew in PyMOL, by name: PyMOL does not hand their
# geometry back, so it is kept as it is loaded (see astra3_structure).
CGO = {}

_COUNT = itertools.count(1)


def _jobs_dir():
    folder = os.environ.get("ASTRA3_ENGINE_JOBS", "").strip()
    if folder and os.path.isdir(folder) and os.path.exists(os.path.join(folder, "window.on")):
        return folder
    return None


def wanted():
    return _jobs_dir() is not None


def remember_cgo(name, data):
    CGO[str(name)] = list(data)


def _pymol_scene(cmd):
    """The shown scene in PyMOL, in the form the Astra3 Engine draws from."""
    import numpy as np
    import astra3_chimerax as engine
    names = [n for n in cmd.get_names("objects", enabled_only=1)]
    molecules, cgos, colors = [], [], {}
    for name in names:
        kind = cmd.get_type(name)
        if kind == "object:molecule":
            rows = []
            cmd.iterate_state(1, f"%{name}", "rows.append((segi, chain, resi, resn, name, alt, elem, ss, q, b, "
                              "resv, color, type == 'HETATM', formal_charge, x, y, z))", space={"rows": rows})
            if not rows:
                continue
            mol = engine.Molecule(name)
            mol.n = len(rows)
            columns = list(zip(*rows))
            for k, field in enumerate(("segi", "chain", "resi", "resn", "atom_name", "alt", "elem", "ss")):
                setattr(mol, field, np.array([str(v) for v in columns[k]], dtype=object))
            for field in ("text_type", "label"):
                setattr(mol, field, np.array([""] * mol.n, dtype=object))
            mol.q = np.array(columns[8], dtype=np.float64)
            mol.b = np.array(columns[9], dtype=np.float64)
            mol.resv = np.array(columns[10], dtype=np.int64)
            mol.color = np.array(columns[11], dtype=np.int64)
            mol.hetatm = np.array(columns[12], dtype=np.int64)
            mol.formal_charge = np.array(columns[13], dtype=np.int64)
            for field in ("ID", "rank", "priority"):
                setattr(mol, field, np.arange(mol.n, dtype=np.int64))
            mol.partial_charge = np.zeros(mol.n)
            mol.uid = np.arange(mol.n, dtype=np.int64)
            mol.coords = np.array([[row[14:17] for row in rows]], dtype=np.float64)
            mol.classify()
            molecules.append(mol)
            for index in set(int(c) for c in mol.color):
                colors[index] = tuple(float(c) for c in cmd.get_color_tuple(index))
        elif kind == "object:cgo" and name in CGO:
            cgos.append(types.SimpleNamespace(name=name, data=CGO[name]))
    background = (1.0, 1.0, 1.0)
    try:
        background = tuple(float(c) for c in cmd.get_color_tuple(cmd.get("bg_rgb")))
    except Exception:  # noqa: BLE001 -- a named or listed colour PyMOL could not resolve
        pass
    return {"molecules": molecules, "cgo": cgos, "view": list(cmd.get_view()),
            "fov": float(cmd.get("field_of_view")), "background": background,
            "opaque": cmd.get_setting_int("ray_opaque_background") == 1, "colors": colors}


def show_image(png_path, width, height, engine_key):
    """Hands the window the scene an image was just drawn from. Never
    raises: the image is already saved, and the window is a view of it."""
    folder = _jobs_dir()
    if folder is None or engine_key == "astra3":
        return
    try:
        import astra3_engine
        if engine_key == "chimerax":
            import astra3_chimerax
            scene = astra3_chimerax.scene_description()
        else:
            from pymol import cmd
            scene = _pymol_scene(cmd)
        if not scene["molecules"]:
            return
        name = "show_%d_%06d" % (os.getpid(), next(_COUNT))
        files = os.path.join(folder, name + "_files")
        os.makedirs(files, exist_ok=True)
        job = astra3_engine.scene_job("show", png_path, width, height, scene, files,
                                      title=astra3_engine.image_title(scene, png_path))
        job["files"] = files
        temp = os.path.join(folder, name + ".json.tmp")
        with open(temp, "w", encoding="utf-8") as fh:
            fh.write(json.dumps(job))   # the same text as json.dump, encoded in one pass
        os.replace(temp, os.path.join(folder, name + ".json"))
    except Exception:  # noqa: BLE001 -- the window is optional; the image is saved
        pass

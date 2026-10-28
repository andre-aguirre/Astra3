# ============================================================
# astra3_render_report.py
# Astra3: Structural Analysis Toolkit for PDB Rendering Automation
# Created by Andre Aguirre
# Copyright (c) 2026 Andre Aguirre
# Licensed under the GNU General Public License, version 3 or later (GPL-3.0-or-later). See LICENSE file for details.
#
# ------------------------------------------------------------
# MODULE: Session saving, image rendering, and report generation
# ------------------------------------------------------------
# This module owns everything that turns a processed PyMOL
# structure into deliverables on disk:
#   - save_session         -> writes the .pse (or .pdb fallback)
#   - render_views          -> the 6-angle PNG rendering pipeline
#   - take_pictures         -> convenience wrapper around render_views
#   - append_warnings_structural_notes -> shared warnings text
#   - generate_html_report  -> the polished Astra3_Report.html
#                              generator (single-structure and
#                              overlay/alignment modes)
#
# This is the module to edit for report styling/layout changes
# or rendering behavior. It depends on astra3_core for shared
# constants/paths and on astra3_structure for purge_orphaned_state
# and draw_termini_vectors (the latter used by
# render_termini_closeups, below, to draw a orientation arrow overlay
# scoped to a single terminus).
# ------------------------------------------------------------

import os
import math
import time
import json
import csv
import re
from pathlib import Path
import html as html_escape
import base64

from pymol import cmd

from astra3_core import (
    format_method, engine_name, session_extension,
    GREEN, RED, YELLOW, WHITE, RESET,
    BASE_DIR, check_for_cancellation, format_residue_ranges, count_missing_residues, resolution_display, display_ranges,
    display_date,
    ASTRA3_VERSION, get_pymol_version_string, get_pymol_license_string,
)
from astra3_security import safe_join, safe_output_dirname
from astra3_structure import (purge_orphaned_state, draw_termini_vectors, TERMINUS_WINDOW, chain_label,
                              comparison_arrow_colors,
                              REFERENCE_ARROW_COLORS)

# ------------------------------------------------------------
# Session save, image capture, and HTML report generator (save_session,
# render_views, take_pictures, generate_html_report)
# ------------------------------------------------------------
VIEWER_STRUCTURE_REMARK = "REMARK 999 ASTRA3 STRUCTURE"


def viewer_structure_labels(structure_data):
    """{PyMOL object: label} for the viewer file: the AST-XXXX ID a person
    typed for an import, otherwise the PDB ID."""
    labels = {}
    for obj, d in (structure_data or {}).items():
        requested = str(d.get("requested_id") or "")
        labels[obj] = requested.upper() if requested.upper().startswith("AST-") else str(d.get("pdb_id") or obj).upper()
    return labels


def _tag_viewer_segments(structure_labels):
    """Marks each object's atoms with a segment tag (S1, S2, ...) so the
    viewer can tell which structure an atom belongs to. Returns the tag map
    and what is needed to restore the original segment IDs afterwards."""
    tags, restore = {}, []
    for i, (o, label) in enumerate(structure_labels.items(), start=1):
        tag = f"S{i}"
        originals = {}
        try:
            # Parenthesized: PyMOL's iterate and alter match a bare object
            # name only in its exact case, and these names are upper-cased
            # (an imported x.cif loads as "x" and is labelled "X").
            cmd.iterate(f"({o})", "originals[index] = segi", space={"originals": originals})
            cmd.alter(f"({o})", f"segi='{tag}'")
        except Exception:  # noqa: BLE001 -- an object that cannot be tagged is simply left unlabeled
            continue
        tags[tag] = label
        restore.append((o, originals))
    return tags, restore


def _restore_viewer_segments(restore):
    for o, originals in restore:
        try:
            cmd.alter(f"({o})", "segi = originals.get(index, '')", space={"originals": originals})
        except Exception:  # noqa: BLE001
            pass


def _prepend_structure_remarks(pdb_path, tags):
    """One REMARK line per structure: 'REMARK 999 ASTRA3 STRUCTURE S1 1XGD'
    ('*' when the file holds a single structure and atoms carry no tag)."""
    with open(pdb_path, "r", encoding="utf-8", errors="replace") as fh:
        body = fh.read()
    head = "".join(f"{VIEWER_STRUCTURE_REMARK} {tag} {label}\n" for tag, label in tags.items())
    with open(pdb_path, "w", encoding="utf-8") as fh:
        fh.write(head + body)


def save_session(obj, session_dir, water_viewer_copy_name=None, structure_labels=None):
    """Save the final PyMOL session for this object, AND a plain-coordinate
    .pdb copy alongside it.

    The .pdb copy exists specifically for Astra3's own GUI structure
    viewer (see the Electron app's Viewer page) -- the .pse PyMOL session
    format is proprietary and binary; there is no way for a web-based
    renderer (3Dmol.js, or anything else) to read it directly, and
    Astra3's own downloaded source .pdb/.cif file is deliberately deleted
    after processing (see _run_single_analysis's cleanup) to avoid
    littering the working directory with stale downloads. Without this
    second export, there would be no surviving artifact anywhere with
    real atom coordinates for the viewer to load once a run finishes --
    this closes that gap at the one place both outputs are already
    being written, rather than the GUI trying to reconstruct coordinates
    some other way.

    water_viewer_copy_name, if given (see process_structure's own
    "water_viewer_copy_name" return field), is a separate object
    holding a water-INCLUDED copy of obj, saved BEFORE Astra3's
    unconditional water removal ran. When present, the viewer's .pdb
    export is built from THIS object instead of obj itself -- so the
    Viewer page's "Show waters" toggle has real water atoms to reveal,
    without changing what obj itself (used for the real analysis,
    metrics, report, and rendered images) ever contained. Deleted
    after use either way, so it never lingers as clutter in the
    working PyMOL session.

    Returns (pse_path_or_None, pdb_path_or_None) so callers can report
    exactly what was actually written.
    """
    purge_orphaned_state()
    # obj is normally a PyMOL object name here (post cmd.fetch/cmd.load, which
    # PyMOL itself sanitizes when assigning object names), so this is lower-
    # risk in practice than the output-folder construction functions in
    # astra3_core.py -- but it is still a value that ultimately traces back to
    # user input, and this is cheap to make unconditionally safe rather than
    # relying on that assumption holding forever. safe_output_dirname (despite
    # the name, it just sanitizes a string to a safe filename fragment) strips
    # anything that isn't alphanumeric/underscore/hyphen; safe_join
    # independently verifies the final resolved path stays inside session_dir.
    safe_name = safe_output_dirname(obj, suffix="")
    pse_path = str(safe_join(session_dir, safe_name + session_extension()))
    pdb_path = str(safe_join(session_dir, safe_name + ".pdb"))

    saved_pse = None
    try:
        cmd.save(pse_path)
        print("Session saved: " + pse_path, flush=True)
        saved_pse = pse_path
    except Exception as e:
        print(f"{engine_name()} session save failed ({e}).", flush=True)

    pdb_source_obj = obj
    if water_viewer_copy_name and water_viewer_copy_name in cmd.get_names("objects"):
        pdb_source_obj = water_viewer_copy_name
    elif obj not in cmd.get_names("objects"):
        # obj is not always a real PyMOL object name -- OVERLAY/TERMINI pass a
        # synthetic label here ("Overlay_Session", "Termini_<ids>") used only
        # as a filename fragment via safe_output_dirname, never as an actual
        # loaded object. The previous version of this function always called
        # cmd.save(pdb_path) with NO selection argument at all, which PyMOL's
        # own documentation confirms defaults to "(all)" -- correctly saving
        # every currently loaded object together for these multi-structure
        # cases. Passing that same fake label as an explicit selection
        # argument (as this function started doing when water-copy support was
        # added) is what broke this: PyMOL's selector engine correctly rejects
        # a name that isn't a real object or named selection ("Selector-Error:
        # Invalid selection name"), which is the exact error this was
        # confirmed to produce for a real TERMINI run. None means "no
        # selection filter" to cmd.save, restoring the original, correct
        # "(all)" behavior for these callers.
        pdb_source_obj = None

    saved_pdb = None
    # Which structure each atom belongs to, for the viewer's labels ("1XGD
    # (Chain A)") and so a click selects a residue in one structure only.
    # Tagged after the .pse is written and restored right after, so the
    # session keeps the depositor's own segment IDs.
    viewer_tags, restore = {}, []
    if structure_labels:
        if pdb_source_obj is not None or len(structure_labels) == 1:
            viewer_tags = {"*": next(iter(structure_labels.values()))}
        else:
            viewer_tags, restore = _tag_viewer_segments(structure_labels)
    try:
        try:
            if pdb_source_obj is not None:
                cmd.save(pdb_path, pdb_source_obj)
            else:
                cmd.save(pdb_path)
        finally:
            _restore_viewer_segments(restore)
        if viewer_tags:
            try:
                _prepend_structure_remarks(pdb_path, viewer_tags)
            except OSError:
                pass
        if saved_pse:
            print("Structure also exported as PDB for the viewer: " + pdb_path, flush=True)
        else:
            print("Structure saved as PDB fallback: " + pdb_path, flush=True)
        saved_pdb = pdb_path
    except Exception as e2:
        print("PDB export failed: " + str(e2), flush=True)

    if water_viewer_copy_name and water_viewer_copy_name in cmd.get_names("objects"):
        try:
            cmd.delete(water_viewer_copy_name)
        except Exception:
            pass

    return saved_pse, saved_pdb


def image_dimensions(image_quality):
    if image_quality == "low":
        return 1200, 900
    if image_quality == "medium":
        return 2000, 1500
    return 3000, 2250


# Shared by render_views (the standard six-view render) and
# render_termini_closeup (the single-shot close-up render added for TERMINI's
# up-close terminus images). Pulled to module level so there is exactly one
# implementation of "reliably save a ray-traced PNG" for every image Astra3
# produces.
#
# A PNG save never raises just because
# the frame is blank -- a blank capture is still a syntactically valid,
# correctly-sized PNG -- so every previous layer of try/except here saw "no
# exception" and reported success, even though the image was empty. This
# matches the exact symptom reported: fast (no real ray trace time spent),
# correctly-dimensioned, but transparent/blank output, with no visible error
# anywhere.
#
# Fix: verify the file that actually got written, rather than only checking
# whether the write call raised. A real ray-traced molecular scene at these
# resolutions compresses to a substantial PNG (dense, non-uniform pixel data
# defeats PNG's run-length/filter compression); a blank or near-blank
# transparent/white frame compresses to a tiny fraction of that, reliably and
# by a wide margin -- this is a property of PNG's compression, not a PyMOL-
# specific heuristic, so it holds regardless of what caused the blank frame.
# MIN_CONTENT_BYTES is set far below what any real render produces, so it only
# catches genuinely blank/near-blank output, not just "simple" renders.
MIN_CONTENT_BYTES = 8000
MAX_RAY_ATTEMPTS = 3


def _logo_data_uri():
    """The Astra3 logo as a base64 data URI, or None if not found.

    Searched across several locations. BASE_DIR is the *output* base and
    has no Tools folder in a packaged application, so a lookup rooted there
    alone finds nothing once installed. Shipping the image alongside this
    module makes it resolve wherever Astra3 is installed and however the
    output folder is configured.

    Embedded rather than linked so the report remains a single
    self-contained file when moved or emailed.
    """
    candidates = []
    env_logo = os.environ.get("ASTRA3_LOGO")
    if env_logo:
        candidates.append(Path(env_logo))
    try:
        candidates.append(Path(__file__).resolve().parent / "astra3_logo.png")
    except Exception:
        pass
    for candidate in candidates:
        try:
            if candidate.is_file():
                with open(candidate, "rb") as lf:
                    return "data:image/png;base64," + base64.b64encode(lf.read()).decode("ascii")
        except OSError:
            continue
    return None


def _png_has_alpha(path):
    """True if the PNG at `path` carries an alpha channel.

    Reads the IHDR colour-type byte directly rather than importing an
    imaging library, since PyMOL's bundled Python may not have one and a
    missing dependency must never prevent an image from being saved.
    Colour types 4 (grey+alpha) and 6 (RGBA) carry alpha.
    """
    try:
        with open(path, "rb") as fh:
            head = fh.read(26)
        if len(head) < 26 or head[:8] != b"\x89PNG\r\n\x1a\n":
            return False
        return head[25] in (4, 6)
    except OSError:
        return False


def _png_has_visible_pixels(path):
    """True if a PNG with an alpha channel has any pixel that is not fully
    transparent, False if every pixel is, None if that cannot be told (no
    alpha channel, or an unexpected file). Rendered with a transparent
    background, an image with nothing in view filters to all-zero bytes, so
    this reads the decompressed data without decoding the filters."""
    import struct
    import zlib
    try:
        data = Path(path).read_bytes()
        if data[:8] != b"\x89PNG\r\n\x1a\n":
            return None
        pos, idat, header = 8, [], None
        while pos + 8 <= len(data):
            length = struct.unpack(">I", data[pos:pos + 4])[0]
            kind = data[pos + 4:pos + 8]
            chunk = data[pos + 8:pos + 8 + length]
            pos += 12 + length
            if kind == b"IHDR":
                header = struct.unpack(">IIBBBBB", chunk)
            elif kind == b"IDAT":
                idat.append(chunk)
            elif kind == b"IEND":
                break
        if not header or header[3] not in (4, 6) or header[2] != 8 or header[6] != 0:
            return None
        width, height, _depth, colour = header[:4]
        row = 1 + width * (4 if colour == 6 else 2)
        raw = zlib.decompress(b"".join(idat))
        if len(raw) < row * height:
            return None
        for r in range(height):
            if raw[r * row + 1:(r + 1) * row].strip(b"\x00"):
                return True
        return False
    except Exception:  # noqa: BLE001
        return None


def _looks_blank(path):
    try:
        if not Path(path).is_file():
            return True
        visible = _png_has_visible_pixels(path)
        if visible is not None:
            # A small molecule seen edge-on can fill only a few pixels and
            # compress to a tiny file; it is still a real image.
            return not visible
        return Path(path).stat().st_size < MIN_CONTENT_BYTES
    except Exception:
        return True  # can't verify -- treat as unverified/blank rather than assume success


def _safe_save_png(file_path, w, h):
    last_error = None
    # Recorded once per image, before any attempt. PyMOL's OpenGL context
    # belongs to its main thread; since the interactive loop moved onto a
    # worker thread, ray runs from that worker. If rendering is happening off
    # the main thread, that is the difference between an image with content
    # and a blank file, and nothing else in the output distinguishes the two.
    try:
        import threading as _threading
        _render_diag(f"{Path(file_path).name}: ray on thread "
                     f"{_threading.current_thread().name!r} "
                     f"(main={_threading.current_thread() is _threading.main_thread()})")
    except Exception:  # noqa: BLE001 -- tracing must never break a render
        pass
    for attempt in range(1, MAX_RAY_ATTEMPTS + 1):
        try:
            if attempt % 2 == 1:
                # cmd.ray may block until rasterization is complete; that's desired
                cmd.ray(w, h)
                # cmd.ray() has already fixed the output dimensions. Passing
                # them again here makes PyMOL resize and re-acquire the image
                # instead of writing the ray buffer, which composites it
                # against an opaque background and discards the alpha channel.
                cmd.png(str(file_path), dpi=300)
            else:
                # Alternate to the single-call ray=1 form on retry, in case
                # the failure is specific to the separate cmd.ray() call
                # rather than rendering itself -- both are legitimate,
                # genuinely-ray-tracing paths (unlike ray=0 with no prior ray,
                # which is the unsafe front-buffer grab this function no
                # longer falls back to).
                cmd.png(str(file_path), width=w, height=h, dpi=300, ray=1)
            if not _looks_blank(file_path):
                if not _png_has_alpha(file_path):
                    # Warned rather than raised: the render succeeded and the
                    # file is usable. This exists because a lost transparent
                    # background is otherwise invisible without inspecting the
                    # file.
                    print(f"{YELLOW}Note: {Path(file_path).name} saved without a transparent "
                          f"background (opaque). The image itself is fine.{RESET}", flush=True)
                # The app's drawing window, when it is shown, lists the image
                # with a 3D view of its scene.
                import astra3_window
                astra3_window.show_image(str(file_path), w, h, os.environ.get("ASTRA3_ENGINE", "pymol"))
                return True
            last_error = "ray completed but output file looks blank/near-empty"
        except Exception as e:
            last_error = str(e)
        if attempt < MAX_RAY_ATTEMPTS:
            print(f"{YELLOW}Render attempt {attempt} for {Path(file_path).name} did not produce "
                  f"verified content ({last_error}); retrying...{RESET}", flush=True)

    # Every ray-traced attempt either raised or produced verified-blank
    # output. Deliberately NOT falling back to a raw ray=0-with-no-prior- ray
    # front-buffer grab here -- that path is what silently produced blank
    # images in the first place (see comment above); a fallback that can
    # silently "succeed" while writing nothing is worse than a loud, visible
    # failure the person can act on.
    print(f"{RED}Render failed for {Path(file_path).name} after {MAX_RAY_ATTEMPTS} attempts "
          f"({last_error}). This image was NOT saved reliably. If this keeps happening, "
          f"check {engine_name()}'s window isn't minimized/occluded during rendering, or restart {engine_name()}.{RESET}",
          flush=True)
    return False


def rotate_view_matrix(view, degrees, axis="y"):
    """Return `view` with its camera rotated `degrees` about a screen axis.

    axis is "y" (vertical, giving front/right/back/left) or "x" (horizontal,
    giving top/bottom).

    PyMOL's 18-float view: elements 0-8 are the 3x3 rotation matrix in row-
    major order, mapping world space into camera space. Rotating the camera
    about its own vertical axis is a right-multiplication of that block by a
    standard Y rotation; the remaining 9 elements (camera position, origin of
    rotation, clipping planes, field of view) are carried through untouched,
    which is what keeps framing and slab identical across the four views.

    Pure arithmetic, so it can be tested without PyMOL.
    """
    if not view or len(view) < 18:
        return view
    radians = math.radians(degrees)
    cos_a, sin_a = math.cos(radians), math.sin(radians)
    r = list(view[0:9])

    # Post-multiply: new = current @ Rotation.
    #
    # This reproduces cmd.turn's own geometry, which is what these six views
    # were framed with for their whole history and what they should keep
    # looking like. An earlier attempt switched to pre-multiplication on the
    # theory that duplicate views were a rotation-axis error; they were not.
    # Post- and pre-multiplication both yield six distinct cameras -- the
    # duplicates came from cmd.turn not being applied before the render, not
    # from the axis it turned about. Changing the multiplication order only
    # re-framed every view, tilting them off the orientation cmd.orient had
    # chosen.
    def _mul(rot):
        return [
            sum(r[row * 3 + k] * rot[k * 3 + col] for k in range(3))
            for row in range(3) for col in range(3)
        ]

    if axis == "x":
        # They are computed here for the same reason the Y views are.
        # Rotation about the horizontal screen axis -> top / bottom.
        rotated = _mul([1, 0, 0,
                        0, cos_a, -sin_a,
                        0, sin_a, cos_a])
    else:
        # Rotation about the vertical screen axis -> right / back / left.
        rotated = _mul([cos_a, 0, sin_a,
                        0, 1, 0,
                        -sin_a, 0, cos_a])
    return tuple(rotated) + tuple(view[9:18])


def _render_diag(message):
    """One-off render tracing, on only when ASTRA3_RENDER_DIAG=1.

    Answers three questions that cannot be told apart from the outside:
    which thread ray runs on, whether set_view actually took effect, and how
    many atoms the selection resolved to at the moment of the render.
    """
    # Off unless asked for. Set ASTRA3_RENDER_DIAG=1 to trace which camera each
    # view was rendered from and which thread ray ran on -- the two things that
    # cannot be told apart from the output files alone.
    if os.environ.get("ASTRA3_RENDER_DIAG") == "1":
        print(f"{YELLOW}[render] {message}{RESET}", flush=True)


def _apply_rotation(degrees, axis="y"):
    """Turn the camera `degrees` about `axis`, and make sure it took effect.
    cmd.turn is the primary path, because it defines the framing these six
    views have always had -- reproducing it by hand risks re-framing every
    image, which is what happened when the arithmetic was swapped for
    it wholesale.

    The problem cmd.turn alone had was never the axis; it was that the turn
    was not guaranteed to be applied before cmd.ray ran, so several views
    rendered from whatever camera happened to be current and came out
    identical.

    If the view is unchanged after the turn, the arithmetic form is applied
    directly as a fallback. It computes the same product cmd.turn does, so
    the framing matches either way.
    """
    if degrees == 0:
        _render_diag(f"axis={axis} deg=0 (no rotation applied)")
        return
    before = cmd.get_view()
    cmd.turn(axis, degrees)
    # Forces the queued turn to complete: get_view cannot return a matrix it
    # has not applied yet.
    after = cmd.get_view()
    if any(abs(a - b) > 1e-4 for a, b in zip(before[:9], after[:9])):
        _render_diag(f"axis={axis} deg={degrees} applied by cmd.turn")
        return
    wanted = rotate_view_matrix(before, degrees, axis)
    cmd.set_view(wanted)
    got = cmd.get_view()
    same = all(abs(a - b) < 1e-4 for a, b in zip(got[:9], wanted[:9]))
    _render_diag(f"axis={axis} deg={degrees} cmd.turn did not take effect; "
                 f"set_view fallback applied: {same}")


def resolve_render_selection(requested):
    """Return a selection that actually resolves to atoms, or None.

    render_views was handed a structure id and trusted it. On a re-run in the
    same PyMOL session that id can no longer name a loaded object -- homomer
    reduction rebuilds the object under a different name, and the stale-object
    sweep deletes the original -- so the selection resolved to nothing. ray
    then completed against an empty scene and wrote a blank PNG, three times
    per view, and the failure surfaced as "output file looks blank" with a
    suggestion to check for an occluded window. The window was never involved.

    Resolution order:
      1. The name as given.
      2. "%name", PyMOL's explicit object-name prefix. A bare name beginning
         with a digit ("1ERJ") is ambiguous in a selection expression, which
         is exactly the shape of id this program is usually handed.
      3. A case-insensitive match among loaded objects.
      4. An object whose name contains the id, which is what reduction
         produces (protein-chain_C_1ERJ).
      5. Any loaded polymer, so a renamed object still renders something
         rather than a blank file.

    Returns None only when nothing is loaded at all -- a real condition that
    the caller should report rather than render past.
    """
    def _resolves(sel):
        try:
            return cmd.count_atoms(sel) > 0
        except Exception:  # noqa: BLE001 -- an invalid selector raises rather than returning 0
            return False

    if not requested:
        return None
    if _resolves(requested):
        return requested

    # A selection that names a CGO alongside molecular objects ("1XGD or
    # 6F7R or TPV_all_6F7R") cannot be atom-counted as a whole: PyMOL raises
    # "Invalid selection name" for the CGO. When every term is a loaded
    # object and the molecular ones have atoms, the selection is valid as
    # written and must not fall through to the fallbacks below.
    try:
        loaded_upper = {n.upper() for n in cmd.get_names("objects")}
    except Exception:  # noqa: BLE001
        loaded_upper = set()
    terms = [t.strip() for t in re.split(r"\s+or\s+", str(requested), flags=re.IGNORECASE)]
    if (len(terms) > 1 and loaded_upper
            and all(re.fullmatch(r"[A-Za-z0-9_]+", t) for t in terms)
            and all(t.upper() in loaded_upper for t in terms)
            and any(_resolves(t) or _resolves(f"%{t}") for t in terms)):
        return requested

    quoted = f"%{requested}"
    if _resolves(quoted):
        return quoted

    try:
        objects = list(cmd.get_names("objects"))
    except Exception:  # noqa: BLE001
        objects = []

    wanted = str(requested).lower()
    for name in objects:
        if name.lower() == wanted and _resolves(f"%{name}"):
            return f"%{name}"
    for name in objects:
        if wanted in name.lower() and _resolves(f"%{name}"):
            return f"%{name}"
    if _resolves("polymer"):
        return "polymer"
    return None


def _flush_camera():
    """Force queued camera commands to execute before anything renders.

    Astra3 drives PyMOL from a background thread (see the AppHang work-around
    in the Windows launcher), and camera commands issued from a non-GUI thread
    are queued rather than applied immediately. cmd.ray() then rasterizes
    whatever camera state has actually been applied, which is not necessarily
    the one just requested -- so a view rendered right after a cmd.turn() can
    capture the previous view's camera. Two files then differ only by
    anti-aliasing noise while claiming to be different angles.

    Cheap to call and safe to call redundantly; a failure here must never
    abort a render.
    """
    try:
        cmd.sync()
    except Exception:
        pass


def _orient(sel):
    """cmd.orient with a result that doesn't depend on the previous camera.

    PyMOL's orient chooses each principal axis's sign to minimise rotation
    from the current view (ExecutiveOrient), so the same structure can come
    out flipped depending on what was shown before. The rotation is reset
    first so the result is reproducible, then the axis signs are normalised
    the way astra3_chimerax's orient does it: x and y each point along their
    largest component and z completes a right-handed frame.

    view[0:9] holds the camera axes as rows, column-major: axis k is
    view[k], view[k + 3], view[k + 6].
    """
    view = list(cmd.get_view())
    view[0:9] = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]
    cmd.set_view(view)
    cmd.orient(sel)
    view = cmd.get_view()
    if not view or len(view) < 18:
        return
    view = list(view)
    flip = []
    for k in range(2):
        axis = (view[k], view[k + 3], view[k + 6])
        # max() keeps the first of equal values, as numpy's argmax does.
        largest = max(range(3), key=lambda i: abs(axis[i]))
        flip.append(axis[largest] < 0)
    if not any(flip):
        return
    # Reversing one axis reverses depth as well, to stay right-handed;
    # reversing both leaves depth as it was.
    negate = [flip[0], flip[1], flip[0] != flip[1]]
    for k in range(3):
        if negate[k]:
            for i in (k, k + 3, k + 6):
                view[i] = -view[i]
    cmd.set_view(view)


def _safe_orient_zoom(sel):
    """cmd.orient/cmd.zoom on a selection that includes a CGO object can
    raise the same 'Invalid selection name' Selector-Error documented for
    cmd.count_atoms (see render_views' own validation block) -- CGOs are
    atomless and PyMOL's selector engine does not resolve that
    combination cleanly in every command that has to evaluate it
    internally. Both calls are wrapped so that quirk degrades to
    'camera isn't framed for this step' rather than a visible crash; the
    molecular objects in the selection still render correctly since PNG
    output only depends on what's currently in view, not on
    orient/zoom succeeding perfectly. Shared by render_views and
    render_termini_closeup for the same reason as _safe_save_png above.
    """
    try:
        _orient(sel)
    except Exception:
        pass
    try:
        cmd.zoom(sel, buffer=3)
    except Exception:
        pass
    # Applied before the caller's rotation is issued, so the rotation composes
    # with the orientation it was meant to follow.
    _flush_camera()


def _apply_standard_render_settings():
    """Background/quality settings shared by every Astra3 render (the
    standard six views AND the TERMINI close-ups) -- pulled out so both
    paths always produce visually consistent output and a future tweak
    only needs to happen in one place. Returns prev_slab for
    _restore_render_settings to hand back to cmd.set("slab", ...)
    afterward.
    """
    try:
        prev_slab = cmd.get("slab")
    except Exception:
        prev_slab = None
    try:
        cmd.bg_color("white")
        # keep transparent background attempt, but ray rendering below will
        # produce correct content PyMOL renamed this setting and kept the old
        # name as an alias; which one a given build honours varies, so both
        # are set.
        for _bg_setting in ("ray_opaque_background", "opaque_background"):
            try:
                cmd.set(_bg_setting, 0)
            except Exception:
                pass
        cmd.set("antialias", 2)
        cmd.set("ray_trace_mode", 1)
        try:
            cmd.clip("slab", 10000)
        except Exception:
            pass
    except Exception:
        pass
    return prev_slab


def _restore_render_settings(prev_slab):
    try:
        if prev_slab is not None:
            cmd.set("slab", prev_slab)
    except Exception:
        pass


def render_views(selection, images_dir, image_quality="medium", label="structure", frame_selection=None,
                 only_views=None):
    """Render the standard six views with deterministic orientation & slab guards.

    frame_selection, if given, is used for cmd.orient/cmd.zoom (camera
    framing) instead of `selection`. `selection` itself is still what gets
    rendered/rayed. This matters when `selection` combines molecular
    objects with a CGO overlay (e.g. TERMINI's vector visualization): CGO
    objects are atomless, and PyMOL's selector engine does not reliably
    resolve orient/zoom against a selection that includes one, even though
    the same combined selection renders/rays just fine. Passing a
    molecular-only frame_selection avoids that failure mode entirely rather
    than relying on try/except to silently no-op the camera commands (which
    would otherwise risk reproducing the blank-image bug with no visible
    error at all). Defaults to `selection` for full backward compatibility
    with every other caller.
    """
    # Resolve the selection before anything is rendered. An id that no longer
    # names a loaded object produces six blank files and eighteen wasted ray
    # traces, reported as a rendering fault rather than the naming problem it
    # is.
    resolved = resolve_render_selection(selection)
    if resolved is None:
        print(f"{RED}Nothing is loaded to render for {label}: '{selection}' does not match any object "
              f"in the session. No images were written.{RESET}", flush=True)
        return []
    try:
        _render_diag(f"{label}: selection {resolved!r} resolves to "
                     f"{cmd.count_atoms(resolved)} atom(s)")
    except Exception:  # noqa: BLE001
        pass
    if resolved != selection:
        print(f"{YELLOW}Rendering '{resolved}' -- '{selection}' no longer names a loaded object "
              f"(objects are renamed by chain reduction and re-runs).{RESET}", flush=True)
        selection = resolved
        if frame_selection is None:
            frame_selection = resolved

    if frame_selection is None:
        frame_selection = selection
    check_for_cancellation()
    # A trimmed set says how many views it holds, so the progress display
    # does not expect the full six from it.
    view_note = f" ({len(only_views)} views)" if only_views else ""
    print(f"{YELLOW}Taking pictures of: {label}{view_note}{RESET}", flush=True)
    print(f"{YELLOW}Saving images to: {WHITE}{images_dir}{RESET}", flush=True)

    # Validate the selection before rendering, without using cmd.count_atoms()
    # on the whole (possibly compound) selection string: PyMOL's atom-counter
    # is documented to raise a misleading "Invalid selection name" error
    # whenever any operand in the expression is a CGO/non-atomic object --
    # CGOs have no atoms by definition, and PyMOL's selector engine does not
    # handle that combination cleanly (see e.g. the well-known "Show contacts"
    # PyMOL script's own workaround for this exact behavior). TERMINI
    # selections legitimately combine molecular objects with a CGO
    # visualization overlay, so a plain count_atoms() check here would wrongly
    # reject a perfectly valid render.
    #
    # Instead: split the selection on top-level " or "/" and " boundaries
    # (best-effort -- this only needs to handle the simple space-joined
    # object-name selections Astra3 itself builds, not arbitrary user-typed
    # selection algebra) and confirm every plain object-name-looking token
    # actually exists via cmd.get_names(), which -- unlike count_atoms --
    # correctly includes CGO/non-molecular objects. Only the tokens that look
    # like real molecular selections get atom-counted.
    # Defined up front: the render-scoping block further down reads this, and
    # it is only assigned inside the branch below.
    plain_name_tokens = []
    try:
        existing_names = set(cmd.get_names("objects")) | set(cmd.get_names("selections"))
    except Exception:
        existing_names = None

    if existing_names is not None:
        tokens = [t.strip() for t in re.split(r"\s+(?:or|and)\s+", selection, flags=re.IGNORECASE)]
        plain_name_tokens = [t for t in tokens if re.fullmatch(r"[A-Za-z0-9_]+", t)]
        # Compared case-insensitively, because that is how PyMOL itself
        # matches names: "6F7R" and "6f7r" are one object to it, and a
        # selection naming either resolves. An imported structure is named
        # after its file ("6f7r.cif" -> "6f7r") while the analysis refers to
        # it in upper case, so an exact comparison here declared the object
        # missing and aborted the render after the whole run had succeeded.
        existing_upper = {n.upper() for n in existing_names}
        missing = [t for t in plain_name_tokens if t.upper() not in existing_upper]
        if missing:
            # The names that ARE loaded are printed alongside the ones that
            # are not. Without them this message states only that something
            # is missing, which is the one thing already known -- and the
            # difference between the two lists is what identifies the cause.
            loaded = ", ".join(sorted(existing_names)) or "none"
            print(f"{RED}Render aborted: selection '{selection}' references a name that does not "
                  f"exist in the current PyMOL session ({', '.join(missing)}). Loaded right "
                  f"now: {loaded}. This usually means leftover/stale state from a previous "
                  f"run. If this keeps happening, restart PyMOL and try again.{RESET}", flush=True)
            return

    # Separately confirm there is at least one real atom to render. Counted
    # against frame_selection (molecular-only when the caller provides one)
    # rather than the full `selection`, which may include a CGO overlay that
    # cmd.count_atoms cannot reliably evaluate (see note above).
    try:
        atom_count = cmd.count_atoms(frame_selection)
    except Exception:
        atom_count = None
    if atom_count == 0:
        print(f"{RED}Render aborted: selection '{selection}' has no atoms. This usually means "
              f"leftover state from a previous run in this PyMOL session. If this keeps "
              f"happening, restart PyMOL and try again.{RESET}", flush=True)
        return

    # Everything not named in the selection is switched off for the
    # duration of the render, and switched back on afterwards.
    #
    # The selection only ever controlled framing: it decides what the
    # camera is oriented and zoomed on, not what is drawn. Every other
    # loaded object stayed visible and was raytraced along with it. A
    # TERMINI run comparing three structures therefore produced three
    # sets of images that each showed all three, correctly labelled as a
    # pairwise comparison and showing something else entirely. Only
    # objects that were enabled are recorded, so nothing the caller had
    # deliberately hidden gets switched back on.
    hidden_for_render = []
    if plain_name_tokens:
        wanted = {t.upper() for t in plain_name_tokens}
        try:
            for name in cmd.get_names("objects", enabled_only=1):
                if name.upper() not in wanted:
                    cmd.disable(name)
                    hidden_for_render.append(name)
        except Exception:
            # Never fail a render over this: a scene that shows too much
            # is worse than one that shows the right thing, but both beat
            # no image at all.
            for name in hidden_for_render:
                try:
                    cmd.enable(name)
                except Exception:
                    pass
            hidden_for_render = []

    prev_slab = _apply_standard_render_settings()

    width, height = image_dimensions(image_quality)

    def finish_render_step():
        # ensure internal PyMOL processing is flushed and allow cancellation
        try:
            cmd.sync()
        except Exception:
            pass
        check_for_cancellation()

    # Camera angles are applied by rewriting the view matrix directly rather
    # than by asking PyMOL to turn the camera.
    #
    # cmd.turn() is a request against PyMOL's own camera state, and whether it
    # has been applied by the time cmd.ray() rasterizes is not something the
    # caller controls -- Astra3 drives PyMOL from a background thread, where
    # commands are queued. The visible result was view_front.png and
    # view_back.png coming out as the same camera, differing only by
    # anti-aliasing noise. Adding a sync between the turn and the ray did not
    # fix it, which is what ruled the race out as the whole explanation.
    #
    # get_view/set_view is not a request: set_view installs the matrix, and
    # the next ray uses it. Rotating the 3x3 rotation block here also makes
    # each view independent of the one before it. One orient, one baseline,
    # six derived cameras.
    #
    # Every view used to re-run orient and then ask cmd.turn to rotate from
    # wherever that left the camera. That made each image depend on two things
    # behaving identically six times over: orient returning the same camera,
    # and turn composing from it rather than from the previous view's result.
    # When either slipped, whole pairs collapsed onto the same picture -- left
    # matching right, top matching bottom -- while front and back still
    # differed, because a 180 turn survives a compounding error that +/-90
    # does not.
    #
    # Capturing the oriented camera once and computing each view from THAT
    # baseline removes the dependency: no view is derived from another, so no
    # view can inherit another's error. It also drops five orient/zoom passes
    # per structure, which is the slowest part of this loop.
    _safe_orient_zoom(frame_selection)
    baseline = None
    try:
        candidate = cmd.get_view()
        # A view is 18 floats. Anything else means get_view did not return a
        # real camera, and deriving six views from it would produce six wrong
        # ones rather than failing.
        if candidate and len(candidate) >= 18:
            baseline = tuple(candidate)
    except Exception as e:  # noqa: BLE001
        _render_diag(f"could not read a baseline view ({e})")
    if baseline is None:
        # Worth saying out loud. The per-view cmd.turn fallback below has a
        # demonstrated failure on this exact set: turning -90 and +90 from the
        # same starting camera produced byte-identical images, so left/right
        # and top/bottom came out as one view each while front/back (180
        # apart) were fine. Deriving every camera from one baseline matrix
        # avoids relying on turn at all.
        print(f"{YELLOW}Could not establish a camera baseline for {label}; falling back to per-view "
              f"turns. Opposite views (left/right, top/bottom) may come out identical.{RESET}",
              flush=True)

    views = [
        ("front", 0, "y"),
        ("right", -90, "y"),
        ("back", 180, "y"),
        ("left", 90, "y"),
        ("top", -90, "x"),
        ("bottom", 90, "x"),
    ]
    # only_views trims the set without changing how any of them is
    # derived: every view still comes from the one baseline camera, so a
    # trimmed render is identical to the corresponding subset of a full
    # one rather than a separately-oriented scene.
    if only_views:
        wanted = [v.lower() for v in only_views]
        views = [v for v in views if v[0] in wanted]

    failed_views = []

    for view_name, degrees, axis in views:
        check_for_cancellation()
        if baseline is not None:
            # Absolute: derived from the baseline, never from the camera the
            # previous view left behind.
            try:
                wanted = rotate_view_matrix(baseline, degrees, axis) if degrees else baseline
                cmd.set_view(wanted)
                # Read back: set_view is queued like any other command, and a
                # camera that has not landed renders the previous view.
                got = cmd.get_view()
                applied = all(abs(a - b) < 1e-4 for a, b in zip(got[:9], wanted[:9]))
                _render_diag(f"{view_name}: set from baseline ({axis} {degrees}) applied={applied}")
                if not applied:
                    # Retry the same absolute camera rather than re-orienting:
                    # the baseline is still valid, and another orient/zoom
                    # pass is the slowest thing in this loop.
                    cmd.set_view(wanted)
                    _render_diag(f"{view_name}: re-applied baseline camera")
            except Exception as e:  # noqa: BLE001
                _render_diag(f"{view_name}: baseline camera failed ({e})")
        else:
            _safe_orient_zoom(frame_selection)
            try:
                _apply_rotation(degrees, axis)
            except Exception:
                pass
        saved = _safe_save_png(Path(images_dir) / ("view_" + view_name + ".png"), width, height)
        finish_render_step()
        if saved:
            print(f"{GREEN}Saved view_{view_name}.png{RESET}", flush=True)
        else:
            failed_views.append(view_name)

    for name in hidden_for_render:
        try:
            cmd.enable(name)
        except Exception:
            # The object went away mid-render (a cancel clearing the
            # session). Nothing to restore it to.
            pass

    if failed_views:
        print(f"{RED}{len(failed_views)} of {len(views)} view(s) could not be saved reliably "
              f"({', '.join(failed_views)}); see the render-failure message(s) above for {label}.{RESET}", flush=True)
    else:
        print(f"{GREEN}All views saved for: {label}{RESET}", flush=True)
    print("", flush=True)


def take_pictures(obj, images_dir, image_quality="medium", frame_selection=None, label=None):
    # `obj` may be a composite selection expression ("A or B") when several
    # structures are framed together. That is correct as a selection but reads
    # poorly as a caption, so callers can supply the wording separately.
    render_views(obj, images_dir, image_quality, label=label or obj, frame_selection=frame_selection)


def _safe_chain_key_for_filename(chain_key):
    """chain_key from TERMINI's per_chain_results is either a single
    chain letter ("A") or "ref/cmp" when the matched chains differ
    ("A/B") -- "/" is a path separator and cannot appear in a filename.
    """
    return re.sub(r"[^A-Za-z0-9_-]", "-", chain_key)


def render_termini_closeup(frame_selection, render_selection, images_dir, filename, image_quality="medium",
                           extra_turn_y=0):
    """Render ONE tight, isolated close-up PNG. Unlike render_views'
    orient (built for whole-structure framing, buffer=3, four
    90-degree-apart views plus top/bottom), this is deliberately a
    single, closer shot with a small corrective turn after orient --
    orient's principal-axis alignment already tends to put a short
    backbone segment's long axis along screen-horizontal rather than
    pointing at the camera, but a short, near-straight or helical
    terminus window can still orient close to end-on; the extra turn
    is a cheap, reliable safeguard against a close-up that ends up
    looking straight down the segment instead of across it.

    extra_turn_y, if given, adds this many additional degrees of
    rotation around the vertical axis on top of the standard 25-degree
    corrective turn -- used by render_termini_closeups to render a
    second angle (90 degrees further around) for the same terminus, so
    a vector that happens to be foreshortened from one camera position
    is very unlikely to also be foreshortened from the other.

    Returns True/False (whether the file was verified non-blank),
    exactly like render_views' own per-view result -- callers should
    treat a False return as "this one image didn't save", not raise.
    """
    check_for_cancellation()
    prev_slab = _apply_standard_render_settings()
    width, height = image_dimensions(image_quality)
    try:
        _safe_orient_zoom(frame_selection)
        try:
            cmd.zoom(frame_selection, buffer=2)  # tighter than render_views' buffer=3 -- this is meant to read as a close-up, not another wide shot
        except Exception:
            pass
        try:
            cmd.turn("y", 25 + extra_turn_y)
            _flush_camera()
        except Exception:
            pass
        saved = _safe_save_png(Path(images_dir) / filename, width, height)
        try:
            cmd.sync()
        except Exception:
            pass
        check_for_cancellation()
        if saved:
            print(f"{GREEN}Saved {filename}{RESET}", flush=True)
        else:
            print(f"{RED}Close-up render failed for {filename}; see the render-failure message above.{RESET}", flush=True)
        return saved
    finally:
        _restore_render_settings(prev_slab)


def _chains_from_chain_key(chain_key):
    """Split a chain key into (reference_chain, comparison_chain).

    match_chains_across_structures can pair chains whose letters differ, in
    which case the key is "A/B" -- reference chain first. A plain key means
    both structures use the same letter.
    """
    text = str(chain_key)
    if "/" in text:
        ref, _, cmp_ = text.partition("/")
        return ref.strip(), cmp_.strip()
    return text, text


def render_termini_closeups(reference_obj, cmp_obj, chain_key, per_chain_result,
                            ref_structure_data, cmp_structure_data,
                            images_dir, image_quality="medium", comparison_index=0):
    """Render one close-up PNG per available terminus (N and/or C) for one
    matched chain of one TERMINI comparison: reference and comparison
    structures' already-red/green-colored terminus windows (see
    apply_terminus_colors in astra3_structure.py), isolated with a TPV
    arrow overlay scoped to just this one terminus.

    Isolation technique, two parts:
    1. cmd.create() copies of JUST the terminus-window atoms
       (ref_structure_data["n_term_name"]/["c_term_name"], the exact
       same named selections already used for the red/green coloring)
       into their own temporary objects.
    2. reference_obj and cmp_obj themselves are DISABLED for the
       duration of this render, then re-enabled afterward. ray/png
       render everything currently enabled in the scene -- there is no
       per-render selection filter -- so isolation copies alone would
       still show the rest of the protein behind the close-up.
       cmd.disable()/cmd.enable() toggle a whole object's visibility
       without touching its representation state (unlike a
       per-selection cartoon_transparency fade, which PyMOL does not
       apply reliably), so the main six-view render that runs right
       after this is unaffected either way.

    Returns {terminus: [image_path, ...]} -- two close-up angles per
    terminus rendered (rotated 90 degrees apart), so a vector that
    happens to point mostly toward/away from one camera (foreshortened,
    hard to read) is very unlikely to also be foreshortened in the
    other. A terminus with nothing rendered is simply absent from the
    dict, not present with an empty list.

    Side effect beyond the return value: for each terminus actually
    rendered, a real CGO object named "Orientation_<cmp_obj>_chain<chain>_
    <terminus>term" is left in the PyMOL session, DISABLED (not
    deleted, not enabled) -- so it never appears in the main six-view
    whole-structure render that runs right after this, but survives
    into the final saved .pse, where the person can click it on in
    PyMOL's own object panel to see the same orientation arrows shown in the
    close-up PNG, labeled by comparison/chain/terminus.
    """
    closeups = {}
    safe_chain = _safe_chain_key_for_filename(chain_key)

    for terminus in ("N", "C"):
        metrics = per_chain_result.get(terminus)
        if metrics is None:
            continue
        check_for_cancellation()

        term_key = "n_term_name" if terminus == "N" else "c_term_name"
        ref_term_sel = ref_structure_data.get(term_key)
        cmp_term_sel = cmp_structure_data.get(term_key)
        if not ref_term_sel or not cmp_term_sel:
            continue

        # Scope the isolation copies to the chain this close-up is actually
        # about. The n_term_name/c_term_name selections cover EVERY eligible
        # chain in their structure, so creating from them unscoped pulls in
        # the termini of every other chain as well -- on a multi-chain entry
        # that renders several unrelated terminus pairs into one image, which
        # reads as "the arrows are pointing at nothing" because the framing is
        # then centred on a group of unrelated windows rather than this one.
        ref_chain, cmp_chain_letter = _chains_from_chain_key(chain_key)
        ref_term_sel = f"({ref_term_sel}) and chain {ref_chain}"
        cmp_term_sel = f"({cmp_term_sel}) and chain {cmp_chain_letter}"

        temp_ref = f"_closeup_ref_{cmp_obj}_{safe_chain}_{terminus}"
        temp_cmp = f"_closeup_cmp_{cmp_obj}_{safe_chain}_{terminus}"
        # NOT underscore-prefixed, unlike temp_ref/temp_cmp above -- PyMOL
        # treats a leading "_" as an internal/hidden name by its own
        # convention, so a name like "_closeup_viz_..." would never even
        # appear for the user to toggle. This object is real, meaningful
        # output -- the actual orientation arrows -- kept in the final saved session
        # (not deleted like the temp_ref/temp_cmp isolation copies below)
        # precisely so it shows up, labeled and toggleable, in PyMOL's own
        # object panel when the person opens the .pse. Safe to leave loaded
        # indefinitely: CGO objects are atomless, so purge_orphaned_state()'s
        # "delete anything with 0 atoms" sweep (which also runs again inside
        # save_session() itself, right before the final .pse write) never
        # touches it -- count_atoms() raises on a CGO object rather than
        # returning 0, and that exception is caught and skipped, not treated
        # as "delete this".
        viz_name = f"Orientation_{cmp_obj}_chain{safe_chain}_{terminus}term"
        for stale in (temp_ref, temp_cmp, viz_name):
            if stale in cmd.get_names("objects"):
                cmd.delete(stale)

        try:
            cmd.create(temp_ref, ref_term_sel)
            cmd.create(temp_cmp, cmp_term_sel)
        except Exception as e:
            print(f"{YELLOW}Could not isolate {terminus}-terminus for close-up render "
                  f"(chain {chain_key}): {e}{RESET}", flush=True)
            for stale in (temp_ref, temp_cmp):
                try:
                    cmd.delete(stale)
                except Exception:
                    pass
            continue

        if cmd.count_atoms(temp_ref) == 0 or cmd.count_atoms(temp_cmp) == 0:
            # Shouldn't happen if compare_termini already measured this
            # terminus (metrics is not None implies the window existed), but
            # never render broken/incomplete geometry silently.
            for stale in (temp_ref, temp_cmp):
                try:
                    cmd.delete(stale)
                except Exception:
                    pass
            continue

        # Scoped to just this one chain+terminus -- the whole point of the
        # close-up is one clear arrow pair, not every terminus in the
        # comparison layered on top of each other.
        # comparison_index picks this comparison's own arrow colours, the
        # same pair the report's close-up key names for it.
        drawn = draw_termini_vectors(viz_name, {chain_key: {terminus: metrics}},
                                     comparison_index=comparison_index)

        frame_selection = temp_ref + " or " + temp_cmp
        render_selection = frame_selection
        if drawn:
            render_selection += " or " + drawn

        # Everything except this close-up's own scaffolding is switched off
        # for the duration of the render. ray/png draw everything currently
        # enabled, with no per-render selection filter, and the isolation
        # copies above only ever ADDED geometry -- they never removed the
        # originals from the scene.
        #
        # Disabling just the reference and comparison sufficed while a run
        # held two structures and nothing else. With a third structure
        # loaded, that one stayed enabled and was raytraced into the
        # background of a view whose whole purpose is an unobstructed look
        # at one terminus pair.
        #
        # try/finally guarantees these are re-enabled even if rendering
        # raises, so a failure here can never leave the session with a
        # structure silently missing.
        keep_enabled = {temp_ref.upper(), temp_cmp.upper()}
        if drawn:
            keep_enabled.add(str(drawn).upper())
        hidden_objects = []
        try:
            for name in cmd.get_names("objects", enabled_only=1):
                if name.upper() not in keep_enabled:
                    cmd.disable(name)
                    hidden_objects.append(name)
        except Exception:
            pass
        try:
            saved_paths = []
            # Two angles per terminus, not one -- a second view rotated 90
            # degrees around the vertical axis from the first, so a vector
            # pointing mostly toward/away from the first camera
            # (foreshortened, hard to read) is very unlikely to also be
            # foreshortened in the second.
            for angle_idx, extra_turn in enumerate((0, 90)):
                filename = f"closeup_{terminus}term_{safe_chain}_angle{angle_idx + 1}.png"
                saved = render_termini_closeup(frame_selection, render_selection, images_dir, filename,
                                               image_quality, extra_turn_y=extra_turn)
                if saved:
                    saved_paths.append(str(Path(images_dir) / filename))
        finally:
            # Only what this render switched off is switched back on, so
            # anything already hidden stays hidden.
            for name in hidden_objects:
                try:
                    cmd.enable(name)
                except Exception:
                    pass

        # temp_ref/temp_cmp were only ever scaffolding for this one render --
        # the person already has the real, full reference_obj and cmp_obj in
        # the session with everything these isolated copies contain and more,
        # so keeping them around would just be confusing duplicate clutter.
        # The CGO (drawn), in contrast, is real new information found nowhere
        # else -- kept, but DISABLED rather than left enabled: ray-traced
        # renders show whatever is currently enabled in the whole scene
        # (there's no per-render selection filter -- see render_views' own
        # docstring on this), so an enabled CGO here would leak into the main
        # six-view whole-structure render that runs right after this in
        # astra3.py, undoing the "only in the close-ups" separation that
        # render is specifically meant to have now. Disabled here, it's
        # invisible until the person explicitly clicks it on in PyMOL's own
        # object panel after opening the saved session -- exactly the "enabled
        # from view in the session file" behavior.
        for stale in (temp_ref, temp_cmp):
            try:
                cmd.delete(stale)
            except Exception:
                pass
        if drawn:
            try:
                cmd.disable(drawn)
            except Exception:
                pass

        if saved_paths:
            closeups[terminus] = saved_paths

    return closeups


def append_unobserved_residue_notes(lines_accumulator, structures_unobserved, deposited_numbering=None):
    """Report zero-occupancy residues per structure, alongside the missing-
    residue table.

    structures_unobserved is {struct_id: {chain: [resi, ...]}}, as produced by
    process_structure. Written for every command that reports structural notes
    -- single-structure, OVERLAY and TERMINI -- because the consequence is not
    specific to terminal analysis. A zero-occupancy residue has coordinates but
    was never seen in the density, so it is a placeholder position rather than
    a measurement, and any geometry computed over it is describing a guess.
    Astra3 excludes these residues from resolved-residue counts, sequence
    extraction and terminus selection, which changes what a chain's reported
    first and last residues are, so the exclusion is always stated rather than
    applied silently.
    """
    entries = {sid: chains for sid, chains in (structures_unobserved or {}).items() if chains}
    if not entries:
        return
    lines_accumulator.append("Unobserved Residues (zero occupancy in the loaded structure):")
    lines_accumulator.append("")
    lines_accumulator.append("| Structure | Chain | Unobserved Residues | Count |")
    lines_accumulator.append("|---|---|---|---|")
    for struct_id in sorted(entries):
        for chain in sorted(entries[struct_id]):
            residues = entries[struct_id][chain]
            if not residues:
                continue
            deposited = (deposited_numbering or {}).get(struct_id, {}).get(chain)
            shown = ", ".join(deposited) if deposited else _compact_resi_range(residues)
            lines_accumulator.append(f"| {struct_id} | {chain} | {shown} | {len(residues)} |")
    lines_accumulator.append("")
    lines_accumulator.append("These residues have zero occupancy in the loaded structure, meaning they were not "
                             "observed experimentally. Where the file's own record of them is available, they are "
                             "numbered as the depositor numbered them. They are excluded from residue counts, sequence "
                             "comparison and terminus selection, so a chain's reported first and last "
                             "residues are its first and last OBSERVED residues and may differ from the "
                             "ends of the deposited sequence. The residues remain in the loaded structure "
                             "and session.")
    lines_accumulator.append("")


def append_warnings_structural_notes(lines_accumulator, structures_missing_info, missing_residues_sources=None,
                                     structures_unobserved=None, structures_unobserved_deposited=None):
    """missing_residues_sources: optional {struct_id: source_label} (e.g.
    "PDB REMARK 465" or "mmCIF pdbx_unobs_or_zero_occ_residues", from
    header_info['missing_residues_source'] -- see
    header_info_from_downloaded_files in astra3.py). Falls back to "PDB
    REMARK 465" for any struct_id not present, which preserves every
    existing caller's behavior exactly for callers that don't pass this
    (they were always legacy-PDB-only before -mmCIF existed).
    """
    missing_residues_sources = missing_residues_sources or {}
    lines_accumulator.append("WARNINGS / STRUCTURAL NOTES")
    lines_accumulator.append("-" * 60)
    if not structures_missing_info:
        lines_accumulator.append("No missing residue information reported.")
        lines_accumulator.append("")
        append_unobserved_residue_notes(lines_accumulator, structures_unobserved, structures_unobserved_deposited)
        return

    lines_accumulator.append("Missing Residue Information:")
    lines_accumulator.append("")
    lines_accumulator.append("| Structure | Chain | Missing Residues | Source |")
    lines_accumulator.append("|---|---|---|---|")
    any_entry = False
    sources_used = set()
    unknown_structures = []
    for struct_id, chain_map in structures_missing_info.items():
        source_label = missing_residues_sources.get(struct_id) or "PDB REMARK 465"
        if chain_map is None:
            unknown_structures.append(struct_id)
            lines_accumulator.append(f"| {struct_id} | - | The imported file carries no unobserved-residue records | N/A |")
            continue
        if not chain_map:
            lines_accumulator.append(f"| {struct_id} | - | None detected | {source_label} |")
            sources_used.add(source_label)
            continue
        for ch, ranges in chain_map.items():
            if not ranges:
                lines_accumulator.append(f"| {struct_id} | {ch} | None detected | {source_label} |")
            else:
                any_entry = True
                lines_accumulator.append(f"| {struct_id} | {ch} | {display_ranges(', '.join(ranges))} | {source_label} |")
            sources_used.add(source_label)
    if not any_entry:
        lines_accumulator.append("")
        if unknown_structures and not sources_used:
            # An imported file without those records says nothing either way:
            # a file with no missing residues looks exactly the same as one
            # whose records were stripped.
            who = ", ".join(unknown_structures)
            lines_accumulator.append(f"{who}: the file has no REMARK 465 or mmCIF unobserved-residue records, so whether "
                                     f"residues are missing cannot be told from it. A file with none looks the same as one "
                                     f"whose records were removed.")
        elif len(sources_used) == 1:
            lines_accumulator.append(f"No missing residues detected in {next(iter(sources_used))} metadata.")
        else:
            lines_accumulator.append("No missing residues detected in the available metadata.")
    lines_accumulator.append("")
    append_unobserved_residue_notes(lines_accumulator, structures_unobserved, structures_unobserved_deposited)
    return


# ---------------------------------------------------------------------------
# Explanations behind the small "i" icons. Each entry is a title and a list of
# (heading, html) sections. Only the entries a report actually uses are
# written into it. Text describes what a value means and how it is measured,
# at the level a reader needs to judge it.
# ---------------------------------------------------------------------------
_INFO_TIPS = {
    "tip_displacement": ("Tip displacement", [
        ("What it shows", "How far the very last resolved residue at this end has moved."),
        ("How it's calculated", "After the comparison structure is aligned onto the reference, the distance "
         "between the C&alpha; atoms of the two terminal residues: the first resolved residue for an "
         "N-terminus, the last for a C-terminus, after any approved offset."),
        ("Reading it", "Rests on a single residue, so a loose end can move a lot on its own. Compare it with "
         "centroid displacement: a large tip shift with a small centroid shift means only the very end differs."),
    ]),
    "centroid_displacement": ("Centroid displacement", [
        ("What it shows", "How far the end region as a whole has moved."),
        ("How it's calculated", "The centroid (average position) of the five terminal C&alpha; atoms is found in "
         "each structure after alignment, and the distance between the two centroids is reported."),
        ("Reading it", "Less sensitive to one flexible residue than tip displacement. This is the distance the "
         "white dashed line spans in the close-up views."),
    ]),
    "orientation_change": ("Orientation change", [
        ("What it shows", "How much the last ten residues of the chain, taken as one segment, have turned between the "
         "two structures."),
        ("How it's calculated", "In each structure, Astra3 draws an arrow along the terminal segment, between the "
         "average position (centroid) of its outer five C&alpha; atoms and that of its inner five. The value is the "
         "angle between the reference and comparison arrows: 0&deg; means they point the same way, 180&deg; the "
         "opposite way. The close-up views draw this arrow, pointing out of the protein."),
        ("Reading it", "Because it averages ten residues, one loose residue changes it very little. Read it next to "
         "the TPV angle, which looks only at the last four."),
    ]),
    "tpv_angle": ("TPV angle change", [
        ("What it shows", "How much the very end of the chain has changed direction. The terminal projection vector "
         "(TPV) is an arrow at the last resolved residue, pointing the way the chain is heading as it ends."),
        ("How it's calculated", "In each structure, the arrow runs from the average position (centroid) of the three "
         "C&alpha; atoms just before the terminal residue to the terminal residue's own C&alpha;, so it points out "
         "of the protein. The value is the angle between the reference and comparison arrows: 0&deg; means the end "
         "points the same way in both, 180&deg; the opposite way."),
        ("Reading it", "It uses only the last four residues, so it shows how the final turn of the chain has moved. "
         "A large TPV change with a small orientation change means the segment stayed in place while its tip "
         "turned. For a tag or label attached at this terminus, the TPV shows which way the chain points where the "
         "tag joins; how the tag itself sits has to be tested experimentally. The TPV is reported as a number only; "
         "the arrows in the close-up images show orientation."),
    ]),
    "local_rmsd": ("Local RMSD (in place)", [
        ("What it shows", "How far the ten-residue end region sits from the reference once the whole chains are "
         "aligned."),
        ("How it's calculated", "C&alpha; atoms in the terminus window are paired using the sequence alignment "
         "(by residue number where no alignment pairing is available). The value is the root-mean-square of the "
         "paired distances where the atoms sit after the whole-chain alignment; the window is not superposed again "
         "on its own. At least three pairs are required."),
        ("Reading it", "Includes both a shift of the whole end and any change in its shape. Compare it with the refit "
         "value: a large in-place value with a small refit value means the end moved as a rigid piece. When fewer "
         "residues could be paired than the window holds, the number used is shown beside the value."),
    ]),
    "local_rmsd_refit": ("Local RMSD (refit)", [
        ("What it shows", "How much the shape of the ten-residue end region differs, with its position taken out."),
        ("How it's calculated", "The same residue pairs as the in-place value, after the two terminus windows are superposed onto "
         "each other on their own (the best-fitting rotation and translation). The value is the "
         "root-mean-square distance that remains."),
        ("Reading it", "Never larger than the in-place value. Near zero means the end kept its shape even if it moved; "
         "close to the in-place value means the difference is mostly a change in shape."),
        ("Source", "<a href='https://doi.org/10.1002/jcc.20110' target='_blank' rel='noopener'>Coutsias et al. "
         "2004</a> (optimal superposition by quaternions, which never mirrors a structure)."),
    ]),
    "identity": ("Identity", [
        ("What it shows", "The share of aligned positions where both structures have the same residue."),
        ("How it's calculated", "The two sequences are aligned, allowing gaps. Identity is identical positions "
         "divided by aligned positions; positions opposite a gap are not counted."),
        ("Reading it", "Always read it with coverage. A short fragment that matches well scores a high identity "
         "while covering very little of either sequence."),
    ]),
    "similarity": ("Similarity", [
        ("What it shows", "Like identity, but also counting substitutions that keep a residue's character."),
        ("How it's calculated", "Identical positions plus conservative substitutions, divided by aligned positions. "
         "A substitution counts as conservative when a standard amino-acid substitution matrix scores it zero or "
         "higher."),
        ("Reading it", "Similarity is never lower than identity. A large gap between the two means many "
         "substitutions, most of them conservative."),
    ]),
    "coverage": ("Coverage", [
        ("What it shows", "How much of each structure's own sequence the alignment spans."),
        ("How it's calculated", "Aligned positions divided by that structure's length: its whole resolved chain in the "
         "whole-chain table, its terminal residues in the terminus table. Reference and comparison are "
         "reported separately because one alignment can cover most of a short sequence and little of a "
         "long one."),
        ("Reading it", "High identity at low coverage means only a short fragment matches."),
    ]),
    "resolved_length": ("Resolved residues", [
        ("What it shows", "The number of residues that have coordinates in the deposited model."),
        ("How it's calculated", "Residues in each protein chain with a C&alpha; atom. Residues listed in the sequence "
         "but not modelled are not counted, so this is normally lower than the deposited sequence length. The "
         "whole-chain sequence comparison uses the longest protein chain of each structure."),
    ]),
    "residues_compared": ("Residues compared", [
        ("What it shows", "How many positions of the ten-residue terminus window were actually aligned."),
        ("Reading it", "Shown in bold when fewer than ten could be compared, for example when residues near the end "
         "are unresolved in one structure. Identity and similarity describe only the positions compared."),
    ]),
    "offset": ("Offset", [
        ("What it shows", "A shift applied to one structure's terminus window so corresponding residues are "
         "compared."),
        ("Reading it", "Two structures of the same protein often start or end at different points in the construct. "
         "When an offset was approved during the run, every measurement at that terminus uses the shifted window, "
         "and the offset is shown beside that structure's row. Highlighted residues differ from the reference."),
    ]),
    "unmeasurable": ("Missing and unobserved residues", [
        ("Missing", "Listed in the deposited sequence but with no coordinates, as recorded in the file header (PDB "
         "REMARK 465 or the mmCIF unobserved-residue records)."),
        ("Unobserved", "Present with coordinates but zero occupancy: placeholder positions the depositor marked as never "
         "seen in the density."),
        ("Why it matters", "Both are excluded from every measurement, so a reported terminus is the first or last observed "
         "residue, which may differ from the first or last deposited residue."),
    ]),
    "ligand_distance": ("Ligand-to-terminus distance", [
        ("What it shows", "The straight-line distance from a ligand to a terminus."),
        ("How it's calculated", "After alignment, from the centroid of the ligand's atoms to the centroid of the five terminal "
         "C&alpha; atoms. Both structures share one coordinate frame, so a ligand in one can be measured "
         "against the terminus of either: <strong>Present In</strong> names which structure has the "
         "ligand, <strong>Terminus Of</strong> which structure's terminus the distance is measured to."),
        ("Reading it", "Only ligands present in one structure and absent from the other are listed. Repeated copies are "
         "numbered (CIT_1, CIT_2). A centroid distance does not measure contact or binding."),
    ]),
    "delta_sasa": ("&Delta;SASA", [
        ("What it shows", "The change in how exposed to solvent the terminus is."),
        ("How it's calculated", "Solvent-accessible surface area of every atom in the ten-residue terminus window, traced by a "
         "rolling 1.4 &Aring; probe over the full structure (one conformation, observed heavy atoms), so packing "
         "against other chains and ligands counts as burial. &Delta;SASA is the comparison value minus the reference value, in "
         "&Aring;&sup2;."),
        ("Reading it", "Positive: the terminus is more exposed in the comparison structure. Negative: more buried."),
        ("Source", "<a href='https://doi.org/10.1016/0022-2836(71)90324-x' target='_blank' rel='noopener'>Lee &amp; "
         "Richards 1971</a> (definition); computed by Astra3 with the <a href='https://doi.org/10.1016/0022-2836(73)90011-9' "
         "target='_blank' rel='noopener'>Shrake &amp; Rupley 1973</a> method and Bondi radii."),
    ]),
    "sasa_shift": ("SASA shift", [
        ("How it's labelled", "<strong>More Exposed/Unmasked</strong> when &Delta;SASA is above +26 &Aring;&sup2;, <strong>More "
         "Buried/Masked</strong> below &minus;26 &Aring;&sup2;, and <strong>Little change</strong> in "
         "between."),
        ("Why 26 &Aring;&sup2;", "It is a quarter of <a href='https://doi.org/10.1371/journal.pone.0080635' target='_blank' "
         "rel='noopener'>glycine's maximum solvent-accessible surface</a> (104 &Aring;&sup2;): the "
         "smallest change that can carry even the smallest residue across the <a "
         "href='https://doi.org/10.1016/j.jmb.2010.09.028' target='_blank' rel='noopener'>25% "
         "relative-accessibility line</a> that best separates surface from interior residues. Smaller "
         "changes over a ten-residue window are labelled Little change."),
        ("Source", "<a href='https://doi.org/10.1371/journal.pone.0080635' target='_blank' rel='noopener'>Tien et "
         "al. 2013</a>; <a href='https://doi.org/10.1016/j.jmb.2010.09.028' target='_blank' "
         "rel='noopener'>Levy 2010</a>."),
    ]),
    "delta_bnorm": ("&Delta; Normalized B-factor", [
        ("What it shows", "The change in how mobile the terminus is modelled, relative to the rest of each protein."),
        ("How it's calculated", "In each structure, the normalized B-factor is the occupancy-weighted mean B-factor of the terminus "
         "window's observed atoms divided by that of all observed protein atoms (B<sub>norm</sub> = B / B<sub>avg</sub>). "
         "Raw B-factors are not reproducible between datasets and normalized ones are (<a "
         "href='https://doi.org/10.1016/j.ab.2022.114594' target='_blank' rel='noopener'>Ramos et al. 2022</a>). "
         "Above 1 is more mobile than that protein's average. The value is comparison minus reference."),
        ("Limitations", "Dividing by each structure's own average removes differences in overall B-factor level, such as "
         "those from resolution and refinement. Local effects remain: a terminus in a crystal contact, or "
         "refined differently from the rest of the chain, shifts its value, and B-factors reflect static "
         "disorder as well as motion. Shown as N/A where a structure has no usable B-factors."),
        ("Source", "<a href='https://doi.org/10.1016/j.ab.2022.114594' target='_blank' rel='noopener'>Ramos et al. "
         "2022</a> (normalization); <a href='https://doi.org/10.1021/acs.chemrev.8b00290' target='_blank' "
         "rel='noopener'>Sun et al. 2019</a> (limitations)."),
    ]),
    "flex_shift": ("Flexibility shift", [
        ("How it's labelled", "<strong>Rigidified</strong> when &Delta; normalized B-factor is below &minus;0.2, "
         "<strong>Disordered/Flexible</strong> above +0.2, and <strong>Little change</strong> in between."),
        ("Why 0.2", "Since <a href='https://doi.org/10.1021/acs.chemrev.8b00290' target='_blank' rel='noopener'>B = "
         "8&pi;&sup2;&lang;u&sup2;&rang;</a>, a change of 0.2 in B relative to the protein average is "
         "about a 10% change in relative RMS atomic displacement. B-factors also shift with resolution, "
         "refinement and crystal packing, so smaller differences are labelled Little change."),
        ("Reading it", "Describes how the terminus is modelled relative to each protein's own average. B-factors combine "
         "motion with static disorder, so the label describes the model."),
        ("Source", "<a href='https://doi.org/10.1021/acs.chemrev.8b00290' target='_blank' rel='noopener'>Sun et al. "
         "2019</a>."),
    ]),
    "closeup_arrows": ("Close-up arrows", [
        ("Arrows", "Each arrow is that structure's orientation vector: the overall direction of its last ten "
         "residues, drawn from its terminal centroid and pointing out of the protein. The angle between the "
         "reference and comparison arrows is the orientation change. The "
         "reference keeps the same pair of colours in every close-up; each comparison has its own pair, named "
         "beside its heading."),
        ("Colour key", "The boxes above each comparison's close-ups name which colour is which structure's "
         "N- and C-terminus arrow."),
        ("Other marks", "The white dashed line joins the two terminal centroids. The residues shown are the "
         "terminus windows themselves, coloured as in the rest of the report."),
    ]),
    "rmsd": ("RMSD", [
        ("What it shows", "How closely a comparison structure superimposes on the reference, in &Aring;."),
        ("How it's calculated", "Residues are paired by sequence alignment and matching atoms are superposed by "
         "least-squares fitting, then refined over up to 5 cycles that set aside atom pairs further apart than "
         "2.0 &times; RMSD. RMSD is the "
         "root-mean-square distance over the atom pairs kept."),
        ("Reading it", "Lower is closer. Because outliers are set aside, read it together with the number of aligned "
         "atoms: a low RMSD over few atoms describes only part of the structure."),
    ]),
    "aligned_atoms": ("Aligned atoms", [
        ("What it shows", "The number of atom pairs kept in the final superposition."),
        ("Reading it", "Atoms in flexible or differing regions are set aside during refinement, so this is usually "
         "well below the total. A low count means the RMSD describes only a core region."),
    ]),
    "aligned_residues": ("Aligned residues", [
        ("What it shows", "The number of residues paired by the sequence alignment that guides the superposition."),
        ("Reading it", "Compare it with resolved residues: close to the resolved count means nearly the whole chain "
         "was matched."),
    ]),
    "pairwise_rmsd": ("Pairwise RMSD matrix", [
        ("What it shows", "The RMSD between every pair of structures, including pairs without the reference."),
        ("How it's calculated", "Each pair is aligned independently using protein C&alpha; atoms only, so values differ from the "
         "alignment table above, which uses all matched atoms."),
        ("Reading it", "Symmetric, with zeros on the diagonal. Useful for spotting which structures resemble each other "
         "most."),
    ]),
    "mean_b": ("Mean C&alpha; B-factor", [
        ("What it shows", "The average B-factor of the protein's C&alpha; atoms, in &Aring;&sup2;, with the lowest "
         "and highest values as the range."),
        ("Reading it", "B-factors reflect atomic displacement and how well-defined the density is: higher means more "
         "mobile or less certain. They depend on resolution and refinement, so compare them between structures "
         "with caution."),
    ]),
    "altloc": ("Alternate conformations", [
        ("What it shows", "<strong>Yes</strong> when at least one protein atom carries an alternate location "
         "identifier: the model gives more than one position for part of a residue, usually a side chain."),
    ]),
    "clashscore": ("Clashscore", [
        ("What it is", "The number of serious atomic overlaps per 1,000 atoms, counted by MolProbity for the wwPDB "
         "validation report. Two non-bonded atoms clash when they overlap by 0.4 Å or more."),
        ("How to read it", "Lower is better; 0 means no serious overlaps were found. What counts as typical depends on "
         "resolution, so compare an entry with others at similar resolution."),
        ("Why it matters", "Clashes mark places where the model is physically strained, so side-chain positions and contacts "
         "involving those residues are less certain."),
    ]),
    "ramachandran_outliers": ("Ramachandran outliers", [
        ("What it is", "The percentage of residues whose backbone angles (phi and psi) fall in combinations almost "
         "never seen in well-determined structures, as assessed by MolProbity."),
        ("How to read it", "Lower is better. Well-refined structures usually sit well under 0.5%. A high percentage "
         "suggests backbone modelling problems."),
        ("Why it matters", "An outlier residue's backbone conformation may be wrong, which matters if it sits in a "
         "region you are measuring, such as a terminus or a binding site."),
    ]),
    "rotamer_outliers": ("Side-chain rotamer outliers", [
        ("What it is", "The percentage of side chains whose torsion angles do not match any commonly observed "
         "rotamer, as assessed by MolProbity."),
        ("How to read it", "Lower is better. Unusual side-chain conformations are more common in older or "
         "lower-resolution entries, where side-chain density is weaker."),
        ("Why it matters", "A flagged side chain may be modelled in the wrong conformation, which affects any "
         "contact or interaction that depends on it."),
    ]),
    "rsrz_outliers": ("RSRZ outliers (real-space fit)", [
        ("What it is", "The percentage of residues that fit the experimental electron density poorly. RSRZ is a "
         "standardised real-space fit score; wwPDB counts a residue as an outlier above 2."),
        ("How to read it", "Lower is better. This is only available for structures with electron density (X-ray), "
         "and is not reported for every entry."),
        ("Why it matters", "It shows where the model is least supported by the experimental data, regardless of how "
         "reasonable its geometry looks."),
    ]),
    "rfree_dcc": ("R-free recalculated by wwPDB (DCC)", [
        ("What it is", "R-free measures how well the model predicts reflections held back from refinement. wwPDB "
         "recalculates it from the deposited data with the DCC program, independently of the depositor's own value."),
        ("How to read it", "Lower is better, and the value scales with resolution: roughly 0.2 or below is typical "
         "for a well-refined structure at high resolution. A recalculated value far from the depositor's is worth "
         "investigating."),
        ("Why it matters", "It is the standard guard against over-fitting, and is the best single indicator of how "
         "well the model is supported by the data."),
    ]),
    "r_factors": ("R-work / R-free (depositor)", [
        ("What it is", "The depositor's own R-factors from refinement. R-work measures agreement with the reflections "
         "used in refinement; R-free, with a set held back from it."),
        ("How to read it", "Lower is better. R-free is normally a few hundredths above R-work; a much larger gap can "
         "mean over-fitting. Compare with wwPDB's recalculated R-free below it."),
    ]),
    "water_removed": ("Water removed", [
        ("What it shows", "The number of water molecules removed before analysis and rendering. Waters are not part "
         "of any measurement in this report."),
    ]),
    "nearby_residues": ("Nearby residues", [
        ("What it shows", "Protein residues with any atom within 4.0 &Aring; of any atom of the ligand."),
    ]),
    "polar_contacts": ("Possible polar contacts", [
        ("What it shows", "Pairs of ligand nitrogen or oxygen atoms and protein nitrogen or oxygen atoms within 3.5 &Aring; "
         "of each other."),
        ("Reading it", "A distance check only. Hydrogen-bond angles are not assessed, so these are candidate hydrogen "
         "bonds."),
    ]),
    "missing_residues": ("Missing residues", [
        ("What it shows", "Residues in the deposited sequence that have no coordinates in the model."),
        ("How it's found", "Read from the file header: PDB REMARK 465 or the mmCIF unobserved-residue records, as "
         "named in the Source column. <strong>None detected</strong> means the header lists none; a file without "
         "that header information cannot be checked."),
    ]),
}


def _tip(key):
    """The small "i" button that opens one explanation."""
    title = _INFO_TIPS[key][0]
    plain = re.sub(r"&[a-z]+;", "", re.sub(r"<[^>]+>", "", title))
    return (f"<button type='button' class='info-tip' data-tip='{key}' "
            f"aria-label='About {html_escape.escape(plain)}'>i</button>")


def _info_tip_library(page_html):
    """The explanations a page uses, in a hidden container its script reads."""
    used = []
    for key in re.findall(r"data-tip='([a-z_]+)'", page_html):
        if key in _INFO_TIPS and key not in used:
            used.append(key)
    if not used:
        return ""
    parts = ["<div id='astra3-tip-library' hidden>"]
    for key in used:
        title, sections = _INFO_TIPS[key]
        parts.append(f"<div data-tip-content='{key}'><div class='tip-title'>{title}</div>")
        for heading, body in sections:
            parts.append(f"<div class='tip-section'><div class='tip-heading'>{heading}</div>"
                         f"<p>{body}</p></div>")
        parts.append("</div>")
    parts.append("</div>")
    parts.append(_INFO_TIP_SCRIPT)
    return "".join(parts)


# One popover for the whole page. Hover opens it on a pointer device and
# leaving closes it; a click or tap pins it open until the close button, a
# click elsewhere, Escape, or another icon. Positioned under the icon, or
# above when there is no room below, and kept inside the window.
_INFO_TIP_SCRIPT = """<script>(function(){
var lib=document.getElementById('astra3-tip-library');if(!lib)return;
var pop=document.createElement('div');pop.className='tip-pop';pop.setAttribute('role','dialog');pop.hidden=true;
document.body.appendChild(pop);
var current=null,pinned=false,hideTimer=null,showTimer=null;
var hoverable=window.matchMedia&&window.matchMedia('(hover: hover) and (pointer: fine)').matches;
function place(btn){
  var r=btn.getBoundingClientRect(),vw=document.documentElement.clientWidth,vh=window.innerHeight;
  var w=Math.min(400,vw-24);pop.style.width=w+'px';
  var left=Math.max(12,Math.min(r.left+r.width/2-28,vw-w-12));
  pop.style.left=(left+window.scrollX)+'px';
  var h=pop.offsetHeight,below=vh-r.bottom,top;
  if(below>=h+16||below>=r.top){top=r.bottom+8;pop.classList.remove('tip-above');}
  else{top=r.top-h-8;pop.classList.add('tip-above');}
  pop.style.top=(top+window.scrollY)+'px';
}
function open(btn,pin){
  var src=lib.querySelector("[data-tip-content='"+btn.getAttribute('data-tip')+"']");if(!src)return;
  clearTimeout(hideTimer);
  if(current&&current!==btn)current.classList.remove('is-open');
  if(current!==btn||pop.hidden){
    pop.innerHTML="<div class='tip-head'><span class='tip-badge'>i</span></div>";
    var head=pop.firstChild,title=src.querySelector('.tip-title').cloneNode(true);head.appendChild(title);
    var close=document.createElement('button');close.type='button';close.className='tip-close';
    close.setAttribute('aria-label','Close');close.innerHTML='&times;';
    close.addEventListener('click',function(){hide(true);});head.appendChild(close);
    var body=document.createElement('div');body.className='tip-body';
    src.querySelectorAll('.tip-section').forEach(function(s){body.appendChild(s.cloneNode(true));});
    pop.appendChild(body);
  }
  current=btn;pinned=pinned||!!pin;btn.classList.add('is-open');btn.setAttribute('aria-expanded','true');
  pop.hidden=false;place(btn);
}
function hide(force){
  if(pinned&&!force)return;
  pop.hidden=true;pinned=false;
  if(current){current.classList.remove('is-open');current.setAttribute('aria-expanded','false');}
  current=null;
}
document.addEventListener('click',function(e){
  var btn=e.target.closest&&e.target.closest('.info-tip');
  if(btn){e.preventDefault();e.stopPropagation();
    if(current===btn&&pinned){hide(true);}else{pinned=false;open(btn,true);}return;}
  if(!pop.hidden&&!pop.contains(e.target))hide(true);
},true);
if(hoverable){
  document.addEventListener('mouseover',function(e){
    var btn=e.target.closest&&e.target.closest('.info-tip');
    if(btn&&!pinned){clearTimeout(hideTimer);clearTimeout(showTimer);showTimer=setTimeout(function(){open(btn,false);},120);}
    else if(pop.contains(e.target)){clearTimeout(hideTimer);}
  });
  document.addEventListener('mouseout',function(e){
    var leaving=e.target.closest&&(e.target.closest('.info-tip')||(pop.contains(e.target)?pop:null));
    if(!leaving)return;
    var to=e.relatedTarget;
    if(to&&(pop.contains(to)||(current&&current.contains(to))))return;
    clearTimeout(showTimer);hideTimer=setTimeout(function(){hide(false);},180);
  });
}
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!pop.hidden){var b=current;hide(true);if(b)b.focus();}});
window.addEventListener('resize',function(){if(current&&!pop.hidden)place(current);});
window.addEventListener('beforeprint',function(){hide(true);});
})();</script>"""


# Applies a saved dark theme before the page paints, so a reader who chose it
# does not see a white flash on every open. Storage can be unavailable (a
# file opened with storage blocked), which simply leaves the light theme.
_THEME_BOOT_SCRIPT = (
    "<script>document.documentElement.classList.add('js-on');"
    "try{if(localStorage.getItem('astra3-report-theme')==='dark')"
    "document.documentElement.setAttribute('data-theme','dark');}catch(e){}</script>"
)


def _theme_switch_html():
    """A small light/dark switch under the header details. Hidden until its
    script runs, so a viewer that blocks scripts never shows a control that
    does nothing. Printing always uses the light theme."""
    return (
        "<label class='theme-switch' hidden>"
        "<input type='checkbox' id='astra3-theme-toggle' aria-label='Dark mode'>"
        "<span class='theme-track'><span class='theme-thumb'></span></span>"
        "<span class='theme-label'>Dark</span></label>"
        "<script>(function(){"
        "var root=document.documentElement;"
        "var box=document.getElementById('astra3-theme-toggle');"
        "if(!box)return;"
        "box.parentNode.hidden=false;"
        "box.checked=root.getAttribute('data-theme')==='dark';"
        "box.addEventListener('change',function(){"
        "if(box.checked){root.setAttribute('data-theme','dark');}else{root.removeAttribute('data-theme');}"
        "try{localStorage.setItem('astra3-report-theme',box.checked?'dark':'light');}catch(e){}"
        "});"
        "var wasDark=false;"
        "window.addEventListener('beforeprint',function(){"
        "wasDark=root.getAttribute('data-theme')==='dark';if(wasDark)root.removeAttribute('data-theme');});"
        "window.addEventListener('afterprint',function(){if(wasDark)root.setAttribute('data-theme','dark');});"
        "})();</script>"
    )


def _astra3_report_css():
    """Shared CSS for generate_html_report and generate_termini_html_report,
    so both templates stay visually consistent without duplicating ~290 lines
    of stylesheet text."""
    return """
    /* Terminus sequence table -- one box, one row per structure, reference
       first. Differences from the reference are marked on the residue itself,
       which scales to any number of comparisons where a connector line
       between two adjacent rows does not. */
    .seqbox { border: 1px solid #e3ddef; border-radius: 10px; padding: 4px 14px 12px;
      background: #faf8fd; }
    .seqgroup-head { font-size: 12px; color: #6b6478; letter-spacing: 0.02em;
      margin: 12px 0 6px; font-weight: 600; }
    .seqgrid { border-collapse: separate; border-spacing: 2px 2px; margin: 0; width: auto; }
    .seqgrid td { border: none; padding: 0; }
    .seqlabel { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 11.5px; color: #3a3346; text-align: right; padding: 0 10px 0 0 !important;
      white-space: nowrap; }
    .seqlabel-tag { color: #8b83a0; font-size: 10px; margin-left: 5px; }
    .seqres { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12.5px; text-align: center; min-width: 17px; padding: 2px 0 !important;
      border-radius: 3px; background: #ffffff; border: 1px solid #ece7f4 !important;
      color: #3a3346; }
    .seqrow-ref .seqres { background: #f4f0fa; border-color: #ded4ef !important; }
    .seqres-diff { background: #4a2b6b; border-color: #4a2b6b !important; color: #ffffff; }
    .seqmeta { font-size: 11px; color: #6b6478; padding: 0 0 0 12px !important;
      white-space: nowrap; }
    .button-row { margin: 12px 0 0; }

    /* Structural Interpretation: one block per comparison. */
    .interp-divider { border: none; border-top: 1px solid #e3ddef; margin: 16px 0 12px; }
    .interp-head { font-size: 12px; font-weight: 700; color: #4a2b6b; letter-spacing: 0.03em;
      text-transform: uppercase; margin-bottom: 2px; }

    /* Image group dividers. A label and a rule -- enough to tell sections
       apart when scanning, not enough to compete with the section heading. */
    .img-group-head { display: flex; align-items: center; gap: 10px;
      margin: 22px 0 10px; font-size: 12px; font-weight: 600; color: #6b6478;
      letter-spacing: 0.04em; text-transform: uppercase; }
    .img-group-head::after { content: ""; flex: 1; height: 1px; background: #e3ddef; }
    .img-group-head:first-child { margin-top: 4px; }
    .img-group-note { font-weight: 400; text-transform: none; letter-spacing: 0;
      color: #8b83a0; font-size: 11.5px; }
    /* Foldable tables (see the script at the end of the document). The toggle
       sits at the right-hand end of the header row and folds away only the
       body rows, so the column headings stay on screen and a folded table is
       still labelled. The arrow is drawn with borders rather than set as a
       glyph: the report's font stack has no triangle, so a character escape
       renders as a missing-glyph box. */
    .table-wrap { position: relative; }
    .table-fold-toggle { position: absolute; top: 0; left: -18px; height: 38px;
      display: flex; align-items: center; justify-content: center; width: 18px;
      padding: 0; background: none; border: none; cursor: pointer;
      color: #b7b0c6; }
    .table-fold-toggle:hover { color: #6b6478; }
    .table-fold-arrow { display: inline-block; width: 0; height: 0;
      border-left: 4px solid transparent; border-right: 4px solid transparent;
      border-top: 5px solid currentColor; transition: transform 120ms ease; }
    .table-wrap.is-folded .table-fold-arrow { transform: rotate(-90deg); }
    .table-wrap.is-folded table tr:not(:first-child) { display: none; }

    :root {
      --astra-purple: #4a2b6b;
      --astra-purple-dark: #35204d;
      --astra-purple-light: #f4f0fa;
      --astra-accent: #7c5ba6;
      --ink: #1f2430;
      --ink-soft: #4b5262;
      --line: #e3e1ea;
      --line-soft: #edecf3;
      --surface: #ffffff;
      --surface-alt: #faf9fc;
      --warn-bg: #fff8e6;
      --warn-border: #f0c34d;
      --warn-ink: #7a5b00;
      --ok: #2f7d4f;
      --radius: 10px;
      --shadow: 0 1px 2px rgba(31,36,48,0.04), 0 4px 14px rgba(31,36,48,0.06);
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      margin: 0; padding: 0;
      color: var(--ink);
      background: var(--surface-alt);
      line-height: 1.5;
      font-size: 15px;
    }
    .page { max-width: 1120px; margin: 0 auto; padding: 32px 28px 64px; }

    /* ---------- Header / Branding ---------- */
    .report-header {
      background: linear-gradient(135deg, var(--astra-purple) 0%, var(--astra-purple-dark) 100%);
      border-radius: var(--radius);
      color: #fff;
      padding: 28px 32px;
      display: flex;
      align-items: center;
      gap: 22px;
      box-shadow: var(--shadow);
      margin-bottom: 24px;
      flex-wrap: wrap;
    }
    .report-header img.logo {
      height: 62px; width: auto;
      background: rgba(255,255,255,0.08);
      border-radius: 8px;
      padding: 6px;
      flex-shrink: 0;
    }
    .report-header .title-block { flex: 1 1 320px; min-width: 240px; }
    .report-header h1 {
      margin: 0 0 2px 0;
      font-size: 1.7em;
      font-weight: 700;
      letter-spacing: 0.2px;
    }
    .report-header .subtitle {
      margin: 0;
      font-size: 0.92em;
      color: rgba(255,255,255,0.82);
      font-weight: 400;
    }
    .report-header .meta-block {
      display: grid;
      grid-template-columns: auto auto;
      gap: 2px 14px;
      font-size: 0.82em;
      color: rgba(255,255,255,0.92);
      text-align: right;
    }
    .report-header .meta-block .label { color: rgba(255,255,255,0.62); text-align: right; }
    .report-header .meta-block .value { font-weight: 600; text-align: left; word-break: break-word; }

    .command-line {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      padding: 12px 18px;
      margin-bottom: 24px;
      font-size: 0.85em;
      color: var(--ink-soft);
      box-shadow: var(--shadow);
    }
    .command-line code {
      background: var(--astra-purple-light);
      color: var(--astra-purple-dark);
      padding: 2px 8px;
      border-radius: 5px;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 0.95em;
      word-break: break-all;
    }

    /* ---------- Section shell ---------- */
    .section {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      margin-bottom: 22px;
      overflow: hidden;
    }
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 16px 22px;
      border-bottom: 1px solid var(--line-soft);
      background: var(--surface-alt);
    }
    .section-header h2 {
      margin: 0;
      font-size: 1.08em;
      color: var(--astra-purple-dark);
      font-weight: 700;
      letter-spacing: 0.1px;
      display: flex;
      align-items: center;
      gap: 9px;
    }
    .section-header .badge {
      font-size: 0.72em;
      font-weight: 600;
      color: var(--astra-accent);
      background: var(--astra-purple-light);
      padding: 3px 9px;
      border-radius: 999px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .section-body { padding: 20px 22px; }
    .section h3 {
      font-size: 0.95em;
      color: var(--astra-purple-dark);
      margin: 18px 0 10px;
      font-weight: 700;
    }
    .section-body > h3:first-child { margin-top: 0; }

    /* ---------- Collapsible sections ---------- */
    details.section { padding: 0; }
    details.section > summary {
      list-style: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 16px 22px;
      background: var(--surface-alt);
      border-bottom: 1px solid var(--line-soft);
    }
    details.section > summary::-webkit-details-marker { display: none; }
    details.section > summary h2 {
      margin: 0; font-size: 1.08em; color: var(--astra-purple-dark); font-weight: 700;
      display: flex; align-items: center; gap: 9px;
    }
    /* The chevron is drawn with borders: the report's font stack has no
       triangle glyph, and the fallback rendered as a barely visible mark. */
    .chevron {
      flex-shrink: 0;
      display: inline-flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; border-radius: 50%;
      background: var(--astra-purple-light);
      border: 1px solid var(--line);
    }
    .chevron::before {
      content: ""; width: 7px; height: 7px;
      border-right: 2.5px solid var(--astra-accent);
      border-bottom: 2.5px solid var(--astra-accent);
      transform: translateX(-1.5px) rotate(-45deg);
      transition: transform 0.15s ease;
    }
    details[open] > summary .chevron::before { transform: translateY(-1.5px) rotate(45deg); }
    details.section > summary:hover .chevron,
    details.structure-block > summary:hover .chevron { border-color: var(--astra-accent); }
    details.structure-block > summary {
      list-style: none; cursor: pointer;
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
    }
    details.structure-block > summary::-webkit-details-marker { display: none; }
    details.structure-block > summary .chevron { width: 24px; height: 24px; background: #fff; }
    details.structure-block:not([open]) > summary { border-bottom: none; }
    details.section > .section-body { padding: 20px 22px; }

    /* ---------- Executive summary ---------- */
    .exec-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 14px;
    }
    .exec-card {
      background: var(--surface-alt);
      border: 1px solid var(--line-soft);
      border-left: 3px solid var(--astra-purple);
      border-radius: 8px;
      padding: 12px 14px;
    }
    .exec-card .exec-label {
      font-size: 0.72em;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--ink-soft);
      font-weight: 600;
      margin-bottom: 4px;
    }
    .exec-card .exec-value {
      font-size: 1.05em;
      font-weight: 700;
      color: var(--ink);
      word-break: break-word;
    }
    .exec-card.highlight { border-left-color: var(--ok); }
    .exec-card .exec-value .exec-detail { font-size: 0.72em; font-weight: 500; color: var(--ink-soft); }

    /* ---------- Tables ---------- */
    table { border-collapse: collapse; width: 100%; margin-bottom: 4px; font-size: 0.92em; }
    caption { text-align: left; font-weight: 600; color: var(--astra-purple-dark); padding: 4px 0 8px; font-size: 0.95em; }
    th, td { padding: 9px 12px; text-align: left; vertical-align: top; border-bottom: 1px solid var(--line-soft); }
    th {
      background: var(--astra-purple-light);
      color: var(--astra-purple-dark);
      font-weight: 700;
      font-size: 0.85em;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      border-bottom: 1px solid var(--line);
    }
    tr:last-child td { border-bottom: none; }
    tbody tr:hover { background: var(--surface-alt); }
    .table-wrap { overflow-x: auto; margin-bottom: 14px; }
    .table-wrap:last-child { margin-bottom: 0; }

    /* ---------- Structure block (per-structure card within a section) ---------- */
    .structure-block {
      border: 1px solid var(--line-soft);
      border-radius: 8px;
      margin-bottom: 16px;
      overflow: hidden;
    }
    .structure-block:last-child { margin-bottom: 0; }
    .structure-block-header {
      background: var(--astra-purple-light);
      color: var(--astra-purple-dark);
      font-weight: 700;
      padding: 10px 16px;
      font-size: 0.95em;
    }
    .structure-block-body { padding: 14px 16px; }

    /* ---------- Images ---------- */
    .images { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
    .image-card {
      border: 1px solid var(--line-soft);
      border-radius: 8px;
      background: var(--surface-alt);
      overflow: hidden;
      transition: box-shadow 0.15s ease;
    }
    .image-card:hover { box-shadow: var(--shadow); }
    .image-card .image-frame {
      background: repeating-conic-gradient(#f1eff6 0% 25%, #ffffff 0% 50%) 50% / 18px 18px;
      display: flex; align-items: center; justify-content: center; padding: 10px;
    }
    .image-card img { max-width: 100%; max-height: 240px; height: auto; display: block; margin: 0 auto; }
    .image-caption {
      text-align: center; font-size: 0.78em; padding: 8px 10px;
      color: var(--ink-soft); word-break: break-all;
      border-top: 1px solid var(--line-soft); background: var(--surface);
    }

    /* ---------- Buttons ---------- */
    .button {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 11px 20px;
      background: var(--astra-purple);
      color: #fff !important;
      text-decoration: none;
      border-radius: 7px;
      font-weight: 600;
      font-size: 0.92em;
      box-shadow: var(--shadow);
      transition: background 0.15s ease;
    }
    .button:hover { background: var(--astra-purple-dark); }
    .button .icon { font-size: 1.05em; }
    .muted-note { color: var(--ink-soft); font-size: 0.9em; }

    /* ---------- Warnings ---------- */
    .warn-list { background: var(--warn-bg); border: 1px solid var(--warn-border); color: var(--warn-ink);
      border-radius: 8px; padding: 14px 18px; margin: 0; }
    .warn-list ul { margin: 0; padding-left: 18px; }
    .warn-list li { margin-bottom: 6px; }
    .warn-list li:last-child { margin-bottom: 0; }
    .no-warn {
      background: #f1f8f3; border: 1px solid #cfe8d7; color: var(--ok);
      border-radius: 8px; padding: 12px 18px; font-size: 0.92em; font-weight: 600;
    }

    /* ---------- Footer ---------- */
    .report-footer {
      text-align: center; font-size: 0.8em; color: var(--ink-soft);
      margin-top: 32px; padding-top: 18px; border-top: 1px solid var(--line);
    }

    /* Header details with the theme switch beneath them. The switch sits in
       the header's bottom padding and the details move up to make room, so
       the header keeps its height and nothing below it moves. A header
       narrow enough to wrap stacks the switch under the details instead. */
    .report-header { position: relative; }
    .meta-col { display: flex; flex-direction: column; align-items: flex-end; gap: 6px;
      transform: translateY(-9px); }
    .theme-switch { position: absolute; right: 0; top: 100%; margin-top: 5px;
      display: inline-flex; align-items: center; gap: 6px;
      cursor: pointer; font-size: 0.72em; color: rgba(255,255,255,0.62); user-select: none; }
    .theme-switch[hidden] { display: none; }
    @media (max-width: 760px) {
      .meta-col { transform: none; }
      .theme-switch { position: relative; right: auto; top: auto; margin-top: 0; }
    }
    .theme-switch input { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; }
    .theme-track { position: relative; width: 26px; height: 14px; border-radius: 999px;
      background: rgba(255,255,255,0.18); transition: background 0.15s ease; }
    .theme-thumb { position: absolute; top: 2px; left: 2px; width: 10px; height: 10px;
      border-radius: 50%; background: #fff; transition: transform 0.15s ease; }
    .theme-switch:hover { color: rgba(255,255,255,0.85); }
    .theme-switch input:checked + .theme-track { background: rgba(255,255,255,0.42); }
    .theme-switch input:checked + .theme-track .theme-thumb { transform: translateX(12px); }
    .theme-switch input:focus-visible + .theme-track { outline: 2px solid rgba(255,255,255,0.7); outline-offset: 2px; }

    /* Colour keys above image groups: small boxed entries on the same pale
       tint as the section headers. */
    .color-key { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 12px; }
    .key-item { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px;
      border-radius: 7px; background: var(--surface-alt); border: 1px solid var(--line-soft);
      font-size: 0.8em; color: var(--ink-soft); line-height: 1.4; }
    .key-item strong { color: var(--ink); font-weight: 600; margin-right: 2px; }
    .key-swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0;
      box-shadow: inset 0 0 0 1px rgba(0,0,0,0.22); }
    .key-item > strong + .key-swatch ~ .key-swatch { margin-left: 6px; }
    .key-note { color: var(--ink-soft); font-size: 0.95em; margin-left: -2px; }

    /* Explanation icons and their popover. The icons only appear when the
       page's script runs, since without it they would open nothing. */
    .info-tip { display: none; }
    html.js-on .info-tip {
      display: inline-flex; align-items: center; justify-content: center;
      width: 15px; height: 15px; margin: 0 0 0 5px; padding: 0; vertical-align: 1px;
      border-radius: 50%; border: 1.4px solid var(--astra-accent); background: transparent;
      color: var(--astra-accent); font: italic 700 9.5px/1 Georgia, "Times New Roman", serif;
      text-transform: none; letter-spacing: 0; cursor: pointer; flex-shrink: 0;
      transition: background 0.12s ease, color 0.12s ease;
    }
    html.js-on .info-tip:hover, html.js-on .info-tip.is-open {
      background: var(--astra-accent); color: var(--surface); }
    html.js-on .info-tip:focus-visible { outline: 2px solid var(--astra-accent); outline-offset: 2px; }
    .exec-label .info-tip { vertical-align: 0; }
    .tip-pop {
      position: absolute; z-index: 1000; max-width: calc(100vw - 24px);
      background: var(--surface); color: var(--ink);
      border: 1px solid var(--line); border-radius: 12px;
      box-shadow: 0 12px 34px rgba(31,24,48,0.18), 0 2px 6px rgba(31,24,48,0.08);
      font-size: 14px; line-height: 1.55; text-align: left; overflow: hidden;
      animation: tip-in 0.12s ease-out;
    }
    .tip-pop[hidden] { display: none; }
    @keyframes tip-in { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: none; } }
    .tip-pop.tip-above { animation-name: tip-in-above; }
    @keyframes tip-in-above { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
    .tip-head {
      display: flex; align-items: center; gap: 10px; padding: 12px 12px 11px 16px;
      background: var(--astra-purple-light); border-bottom: 1px solid var(--line-soft);
    }
    .tip-badge {
      display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
      width: 22px; height: 22px; border-radius: 50%; background: var(--astra-purple); color: #fff;
      font: italic 700 13px/1 Georgia, "Times New Roman", serif;
    }
    .tip-title { flex: 1; font-weight: 700; font-size: 1.02em; color: var(--astra-purple-dark); }
    .tip-close {
      flex-shrink: 0; width: 26px; height: 26px; border-radius: 50%; border: none; background: transparent;
      color: var(--ink-soft); font-size: 20px; line-height: 1; cursor: pointer; padding: 0 0 2px;
    }
    .tip-close:hover { background: var(--line-soft); color: var(--ink); }
    .tip-body { padding: 6px 16px 14px; max-height: min(60vh, 460px); overflow-y: auto; }
    .tip-section { padding: 9px 0 0; }
    .tip-section + .tip-section { border-top: 1px solid var(--line-soft); margin-top: 9px; }
    .tip-heading {
      font-size: 0.7em; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--astra-accent); margin-bottom: 3px;
    }
    .tip-section p { margin: 0; color: var(--ink); }
    .tip-section strong { color: var(--astra-purple-dark); }
    @media print { .info-tip, .tip-pop { display: none !important; } }

    /* Dark theme. The palette variables carry most of it; the rules after
       them cover the few places that set a colour directly. */
    :root[data-theme='dark'] {
      color-scheme: dark;
      --astra-purple: #7a55ad;
      --astra-purple-dark: #d9ccf0;
      --astra-purple-light: #2a2338;
      --astra-accent: #b99ae6;
      --ink: #e7e4ee;
      --ink-soft: #aaa4b8;
      --line: #36313f;
      --line-soft: #2b2834;
      --surface: #1c1a22;
      --surface-alt: #15141a;
      --warn-bg: #2c2514;
      --warn-border: #7d6320;
      --warn-ink: #efcf78;
      --ok: #62c68b;
      --shadow: 0 1px 2px rgba(0,0,0,0.35), 0 4px 14px rgba(0,0,0,0.35);
    }
    :root[data-theme='dark'] .report-header { background: linear-gradient(135deg, #3d2659 0%, #221533 100%); }
    :root[data-theme='dark'] .button:hover { background: #8d66c2; }
    :root[data-theme='dark'] a { color: var(--astra-accent); }
    :root[data-theme='dark'] .image-card .image-frame {
      background: repeating-conic-gradient(#211f28 0% 25%, #1a1920 0% 50%) 50% / 18px 18px; }
    :root[data-theme='dark'] .no-warn { background: #15261c; border-color: #2c5a3e; }
    :root[data-theme='dark'] details.structure-block > summary .chevron { background: var(--surface); }
    :root[data-theme='dark'] .citation-box { background: #24212c !important; }
    :root[data-theme='dark'] .table-fold-toggle { color: #6f6880; }
    :root[data-theme='dark'] .table-fold-toggle:hover { color: #b5aec4; }
    :root[data-theme='dark'] .img-group-head { color: #aaa4b8; }
    :root[data-theme='dark'] .img-group-head::after { background: var(--line); }
    :root[data-theme='dark'] .img-group-note { color: #8a8398; }
    :root[data-theme='dark'] .interp-divider { border-top-color: var(--line); }
    :root[data-theme='dark'] .interp-head { color: var(--astra-accent); }
    :root[data-theme='dark'] .seqbox { background: #19171f; border-color: var(--line); }
    :root[data-theme='dark'] .seqgroup-head,
    :root[data-theme='dark'] .seqmeta { color: #aaa4b8; }
    :root[data-theme='dark'] .seqlabel { color: #d6d1e0; }
    :root[data-theme='dark'] .seqlabel-tag { color: #8a8398; }
    :root[data-theme='dark'] .seqres { background: #211f28; border-color: #302c3a !important; color: #e2dfea; }
    :root[data-theme='dark'] .seqrow-ref .seqres { background: #2a2338; border-color: #3d3350 !important; }
    :root[data-theme='dark'] .seqres-diff { background: #8d66c2; border-color: #8d66c2 !important; color: #ffffff; }
    :root[data-theme='dark'] .tip-pop { box-shadow: 0 14px 38px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.4); }
    :root[data-theme='dark'] .tip-badge { background: #8d66c2; }
    :root[data-theme='dark'] .key-swatch { box-shadow: inset 0 0 0 1px rgba(255,255,255,0.18); }

    @media print {
      body { background: #fff; }
      .section, details.section { box-shadow: none; break-inside: avoid; }
      .theme-switch { display: none !important; }
      /* On paper a wide table cannot scroll: it wraps to the page instead of
         being cut off at the margin. */
      .table-wrap { overflow: visible !important; }
      .table-wrap table:not(.seqgrid) { width: 100% !important; table-layout: auto; font-size: 0.82em; }
      .table-wrap table:not(.seqgrid) th, .table-wrap table:not(.seqgrid) td {
        white-space: normal !important; overflow-wrap: anywhere; word-break: normal; }
      .table-fold-toggle { display: none !important; }
      tr, .image-card { break-inside: avoid; }
    }
    """


def append_astra3_citation_footer(html, now):
    """Append the standard Astra3 report footer (generation timestamp +
    the copyable citation block with its copy-to-clipboard button/script)
    to an in-progress HTML report's line list. Shared verbatim by every
    report type (single-structure, OVERLAY, TERMINI) so the citation block
    is guaranteed byte-identical everywhere rather than each report
    generator maintaining its own copy that could drift out of sync.

    html: the list of HTML string fragments being built up (mutated via
    .append, matching every other report-building helper in this module).
    now: the already-formatted generation timestamp string.
    """
    html.append("<div class='report-footer'>Astra3 &middot; Structural Analysis Toolkit for PDB Rendering Automation &middot; Report generated " + html_escape.escape(now) + "</div>")
    html.append(
        "<div class='report-footer' style='margin-top:2px;'>"
        "Astra3 Version: " + html_escape.escape(ASTRA3_VERSION) +
        f" &middot; {engine_name()} Version: " + html_escape.escape(get_pymol_version_string()) +
        f" &middot; {engine_name()} License: " + html_escape.escape(get_pymol_license_string()) +
        "</div>"
    )
    html.append(
        "<div style='margin-top:10px; padding-top:10px; border-top:1px solid var(--line-soft); "
        "text-align:center; font-size:0.72em; line-height:1.6; color:var(--ink-soft);'>"
        "Renders and metrics in this report were generated automatically via Astra3. "
        "If this output contributes to a publication, please cite:"
        "<div class='citation-box' style='margin:8px auto 0; max-width:640px; display:flex; align-items:center; gap:8px; "
        "background:#e8e8e8; border:1px solid var(--line-soft); border-radius:6px; "
        "padding:8px 10px; text-align:left;'>"
        "<span id='astra3-citation-text' style='flex:1; font-family:\"SFMono-Regular\",Consolas,\"Liberation Mono\",Menlo,monospace; "
        "font-size:0.95em; color:var(--ink-soft); word-break:break-word;'>"
        "Aguirre, A. (2026). Astra3: Structural Analysis Toolkit for PDB Rendering Automation [Computer software]. "
        "Version " + html_escape.escape(ASTRA3_VERSION) + ". "
        "<a href='https://github.com/andre-aguirre/Astra3' style='color:var(--astra-accent); text-decoration:none;'>"
        "https://github.com/andre-aguirre/Astra3</a>, "
        "<a href='https://doi.org/10.5281/zenodo.22928159' style='color:var(--astra-accent); text-decoration:none;'>"
        "https://doi.org/10.5281/zenodo.22928159</a></span>"
        "<button id='astra3-citation-copy-btn' onclick='astra3CopyCitation(this)' "
        "style='flex-shrink:0; cursor:pointer; font-size:0.85em; font-family:inherit; "
        "color:var(--ink-soft); background:var(--surface); border:1px solid var(--line); "
        "border-radius:4px; padding:4px 9px; line-height:1.4;' "
        "onmouseover=\"this.style.background='var(--line-soft)'\" "
        "onmouseout=\"this.style.background='var(--surface)'\">Copy</button>"
        "</div>"
        "</div>"
        "<script>"
        "function astra3CopyCitation(btn){"
        "var el=document.getElementById('astra3-citation-text');"
        "var text=el.innerText||el.textContent;"
        "function done(){var orig=btn.textContent;btn.textContent='Copied';"
        "setTimeout(function(){btn.textContent=orig;},1500);}"
        "if(navigator.clipboard&&navigator.clipboard.writeText){"
        "navigator.clipboard.writeText(text).then(done).catch(function(){astra3FallbackCopy(text,done);});"
        "}else{astra3FallbackCopy(text,done);}"
        "}"
        "function astra3FallbackCopy(text,done){"
        "var ta=document.createElement('textarea');ta.value=text;"
        "ta.style.position='fixed';ta.style.opacity='0';"
        "document.body.appendChild(ta);ta.focus();ta.select();"
        "try{document.execCommand('copy');}catch(e){}"
        "document.body.removeChild(ta);done();"
        "}"
        "</script>"
    )


# ------------------------------------------------------------
# Annotations and Methods, shared by every report type
# ------------------------------------------------------------

def _merge_warnings(base, extra):
    merged = list(base or [])
    for w in extra or []:
        if w not in merged:
            merged.append(w)
    return merged


def _prepare_annotations(structure_data, reference_obj, warnings_list):
    """Make sure every structure has its annotations (collected once per run
    and reused by every report), and add the cross-check warnings they
    produce. HTML and JSON call this in turn and get identical results."""
    from astra3_annotations import ensure_structure_annotations, structure_annotation_warnings
    for d in structure_data.values():
        try:
            ensure_structure_annotations(d)
        except Exception as e:  # noqa: BLE001 -- a report must never fail because annotations did
            print(f"{YELLOW}Annotation data could not be prepared: {e}{RESET}", flush=True)
            d["annotations"] = {"file": {"available": False, "reference_sequences": [], "sequence_differences": [], "source": None},
                                "rcsb": {"status": "unavailable", "reason": f"internal error: {e}", "chains": {}, "validation": None}}
    try:
        extra = structure_annotation_warnings(structure_data, reference_obj)
    except Exception as e:  # noqa: BLE001
        print(f"{YELLOW}Annotation cross-checks could not run: {e}{RESET}", flush=True)
        extra = []
    from astra3_annotations import consolidate_offset_warnings
    return consolidate_offset_warnings(_merge_warnings(warnings_list, extra))


def _json_annotations(d):
    ann = d.get("annotations") or {}
    rcsb = {k: v for k, v in (ann.get("rcsb") or {}).items() if k != "_raw"}
    return {"coordinate_file": ann.get("file"), "rcsb": rcsb}


def _methods_for(mode, structure_data, command_str, run_parameters, reference_obj, reference_reason, warnings_list,
                 superposed_objs=None):
    from astra3_methods import build_methods_text
    ref_id = (structure_data.get(reference_obj) or {}).get("pdb_id") if reference_obj else None
    superposed_ids = None
    if superposed_objs is not None:
        superposed_ids = {(structure_data.get(o) or {}).get("pdb_id") for o in superposed_objs}
    try:
        return build_methods_text(mode, structure_data, command_str, run_parameters or {}, ref_id,
                                  reference_reason, warnings_list, superposed_ids)
    except Exception as e:  # noqa: BLE001
        print(f"{YELLOW}Methods text could not be generated: {e}{RESET}", flush=True)
        return None, None


def _write_methods_and_sources(session_dir, structure_data, paragraphs, references, command_str, now):
    from astra3_methods import methods_plain_text
    from astra3_annotations import save_annotation_records
    if paragraphs:
        try:
            with open(Path(session_dir) / "Methods.txt", "w", encoding="utf-8") as fh:
                fh.write(methods_plain_text(paragraphs, references, command_str, now))
        except Exception as e:  # noqa: BLE001
            print(f"{YELLOW}Failed to write Methods.txt: {e}{RESET}", flush=True)
    records = []
    for obj, d in structure_data.items():
        ann = d.get("annotations") or {}
        records.append((d.get("pdb_id") or obj, ann.get("file"), ann.get("rcsb")))
    save_annotation_records(str(session_dir), records)


def generate_html_report(output_dir, analysis_id, command_str,
                         structure_data, alignment_results, pairwise_matrix, warnings_list,
                         reference_obj=None, reference_reason=None, run_parameters=None):
    """Generate a portable HTML report saved into output_dir.

    This function supports two presentation modes:
    - OVERLAY/ALIGNMENT mode: when multiple structures are present or alignment_results/pairwise_matrix are non-empty.
      Keeps existing overlay-style report (unchanged behavior/content).
    - SINGLE/RENDER mode: when a single structure was analyzed and no alignment was performed.
      Uses a separate single-structure template that does NOT show alignment-specific sections.

    reference_obj / reference_reason are optional and, when supplied by the overlay pathway,
    are surfaced only in the presentation layer (Executive Summary card). No analysis,
    alignment, or file-handling logic is affected by these optional arguments.
    """
    outdir = Path(output_dir)
    html_path = outdir / "Astra3_Report.html"
    now = display_date(with_time=True)
    title = f"Astra3 Report - {analysis_id}"
    css = _astra3_report_css()

    logo_data_uri = _logo_data_uri()

    # Collect images (relative paths) and deduplicate preserving order.
    # Per-pair subfolders (OVERLAY and TERMINI both write one per comparison)
    # are walked as well, so a comparison's own views are not left on disk
    # unreferenced by the report that describes them.
    images_rel = []
    images_dir = outdir / "Images"
    if images_dir.exists():
        seen = set()
        exts = (".png", ".jpg", ".jpeg", ".svg")
        for p in sorted(images_dir.iterdir()):
            if p.suffix.lower() in exts:
                rel = Path("Images") / p.name
                if rel.as_posix() not in seen:
                    images_rel.append(rel)
                    seen.add(rel.as_posix())
        for sub_dir in sorted(d for d in images_dir.iterdir() if d.is_dir()):
            for p in sorted(sub_dir.iterdir()):
                if p.suffix.lower() in exts:
                    rel = Path("Images") / sub_dir.name / p.name
                    if rel.as_posix() not in seen:
                        images_rel.append(rel)
                        seen.add(rel.as_posix())

    # Find session file relative path if present
    session_dir = outdir / "Session"
    pse_rel = None
    if session_dir.exists():
        pse_files = sorted([p for p in session_dir.iterdir() if p.suffix.lower() == session_extension()])
        if pse_files:
            pse_rel = Path("Session") / pse_files[0].name

    # Determine report mode: overlay/align vs single render
    is_overlay_mode = False
    try:
        # Overlay mode if multiple structures OR alignment/pairwise data present
        if len(structure_data) > 1:
            is_overlay_mode = True
        elif alignment_results and any(alignment_results.values()):
            is_overlay_mode = True
        elif pairwise_matrix:
            is_overlay_mode = True
    except Exception:
        is_overlay_mode = False

    input_structures_str = ', '.join(html_escape.escape(structure_data[d]['pdb_id']) for d in structure_data)
    mode_badge = "Overlay / Alignment Analysis" if is_overlay_mode else "Structure Rendering Analysis"
    warnings_list = _prepare_annotations(structure_data, reference_obj, warnings_list)

    html = []
    html.append("<!doctype html>")
    html.append("<html><head><meta charset='utf-8'>")
    html.append(f"<title>{html_escape.escape(title)}</title>")
    html.append(f"<style>{css}</style>")
    html.append(_THEME_BOOT_SCRIPT)
    html.append("</head><body>")
    html.append("<div class='page'>")

    # ---------------- Header / Branding ----------------
    html.append("<div class='report-header'>")
    if logo_data_uri:
        html.append(f"<img class='logo' src='{logo_data_uri}' alt='Astra3 Logo'>")
    html.append("<div class='title-block'>")
    html.append("<h1>Astra3</h1>")
    html.append("<p class='subtitle'>Structural Analysis Toolkit for PDB Rendering Automation</p>")
    html.append("</div>")
    html.append("<div class='meta-col'><div class='meta-block'>")
    html.append(f"<span class='label'>Analysis ID</span><span class='value'>{html_escape.escape(analysis_id)}</span>")
    html.append(f"<span class='label'>Date</span><span class='value'>{now}</span>")
    html.append(f"<span class='label'>Version</span><span class='value'>Astra3 v{html_escape.escape(ASTRA3_VERSION)}</span>")
    html.append(f"<span class='label'>Report Type</span><span class='value'>{html_escape.escape(mode_badge)}</span>")
    html.append("</div>")
    html.append(_theme_switch_html())
    html.append("</div>")
    html.append("</div>")

    # ---------------- Command / input line ----------------
    html.append("<div class='command-line'>")
    html.append(f"<strong>Input structures:</strong> {input_structures_str} &nbsp;&nbsp;|&nbsp;&nbsp; ")
    html.append(f"<strong>Command:</strong> <code>{html_escape.escape(command_str)}</code>")
    html.append("</div>")

    # ---------------- Executive Summary ----------------
    html.append("<div class='section'><div class='section-header'><h2>Executive Summary</h2>")
    html.append(f"<span class='badge'>{html_escape.escape(mode_badge)}</span></div>")
    html.append("<div class='section-body'><div class='exec-grid'>")

    def _exec_card(label, value, highlight=False, tip=None):
        cls = "exec-card highlight" if highlight else "exec-card"
        tip_html = _tip(tip) if tip else ""
        html.append(f"<div class='{cls}'><div class='exec-label'>{html_escape.escape(label)}{tip_html}</div><div class='exec-value'>{value}</div></div>")

    def _append_ligand_environment_section(d):
        """Append a Ligand Environment section (nearby residues + possible polar
        contacts) for one structure's data dict d, if it has any ligands.
        Geometric observations only -- see the same disclaimer used in the
        TXT report's BINDING SITE INFORMATION section.
        """
        pr = d.get("process_result", {}) or {}
        ligand_info = pr.get("ligand_info", [])
        if not ligand_info:
            return
        env = d.get("ligand_environment") or {}
        html.append("<h3>Ligand Environment</h3>")
        html.append("<p class='muted-note'>Nearby residues" + _tip("nearby_residues") + " and possible polar contacts" + _tip("polar_contacts") + " "
                    "for each ligand.</p>")
        for lig in ligand_info:
            sel_name = lig.get("sel_name")
            lig_env = env.get(sel_name, {})
            near = lig_env.get("nearby_residues")
            polar_contacts = lig_env.get("polar_contacts")
            polar_count = lig_env.get("polar_contact_count")
            # Folded by default: a ligand with many contacts runs to dozens of rows.
            html.append(f"<details class='structure-block'><summary class='structure-block-header'><span>"
                        f"{html_escape.escape(lig.get('resn',''))} &middot; {html_escape.escape(chain_label(lig.get('chain','')))}, "
                        f"residue {html_escape.escape(lig.get('resi',''))}</span><span class='chevron'></span></summary>"
                        f"<div class='structure-block-body'>")
            if near is None:
                html.append("<p class='muted-note'>Nearby-residue data unavailable for this ligand.</p>")
            elif not near:
                html.append("<p class='muted-note'>No protein residues found within 4.0 &Aring;.</p>")
            else:
                html.append("<div class='table-wrap'><table><tr><th>Chain</th><th>Residue</th></tr>")
                for r in near:
                    html.append(f"<tr><td>{html_escape.escape(r['chain'])}</td><td>{html_escape.escape(r['resn'] + r['resi'])}</td></tr>")
                html.append("</table></div>")
            count_display = polar_count if polar_count is not None else "Not available"
            html.append(f"<p class='muted-note' style='margin-bottom:6px;'>Possible polar contacts (N/O within 3.5 &Aring;): {html_escape.escape(str(count_display))}</p>")
            overlapping_pairs = lig_env.get("overlapping_pairs") or []
            if overlapping_pairs:
                shown = "; ".join(f"{p['ligand_atom']} / {p['protein_resn']}{p['protein_resi']} {p['protein_atom']} ({p['distance_angstrom']} &Aring;)"
                                  for p in overlapping_pairs[:8])
                html.append(f"<p class='muted-note'>Left out: {len(overlapping_pairs)} pair(s) closer than 2.2 &Aring;, which no real "
                            f"contact can be. These are overlapping positions, usually alternative conformations labelled with "
                            f"the same letter: {html_escape.escape(shown).replace('&amp;Aring;', '&Aring;')}.</p>")
            if polar_contacts:
                html.append("<div class='table-wrap'><table><tr><th>Ligand atom</th><th>Protein residue</th><th>Protein atom</th><th>Distance</th></tr>")
                for pc in polar_contacts:
                    dist_display = f"{pc['distance_angstrom']} &Aring;" if pc.get("distance_angstrom") is not None else "Not available"
                    html.append(f"<tr><td>{html_escape.escape(pc.get('ligand_atom',''))}</td>"
                                f"<td>{html_escape.escape(pc.get('protein_resn','') + pc.get('protein_resi','') )} ({html_escape.escape(chain_label(pc.get('protein_chain','')))})</td>"
                                f"<td>{html_escape.escape(pc.get('protein_atom',''))}</td><td>{dist_display}</td></tr>")
                html.append("</table></div>")
            html.append("</div></details>")

    if is_overlay_mode:
        ref_pid = None
        if reference_obj is not None and reference_obj in structure_data:
            ref_pid = structure_data[reference_obj]["pdb_id"]
        # Same opening pair as the TERMINI report: the reference, then how
        # many structures were compared against it.
        _exec_card("Reference Structure", html_escape.escape(ref_pid) if ref_pid else "Not available", highlight=True)
        _exec_card("Comparisons", str(max(0, len(structure_data) - 1)))
        _exec_card("Alignment Method", "Least-squares fit <span class='exec-detail'>(sequence-paired atoms, iterative outlier rejection)</span>")

        # Aggregate RMSD / residues across successful alignments for a quick-glance summary
        successful = [r for r in alignment_results.values() if r.get("success")]
        if successful:
            rmsd_vals = [r.get("rmsd") for r in successful if r.get("rmsd") is not None]
            residues_vals = [r.get("residues") for r in successful if isinstance(r.get("residues"), (int, float))]
            rmsd_display = f"{min(rmsd_vals):.3f} – {max(rmsd_vals):.3f} Å" if rmsd_vals else "N/A"
            # Per structure rather than a single sum, matching how
            # Resolution and Experimental Method are already reported. A
            # total across comparisons is not a quantity anything is
            # measured in: each alignment covers its own residue count
            # against the reference, and adding them describes no
            # alignment that was actually performed.
            per_structure = []
            for obj, entry in alignment_results.items():
                if not entry.get("success"):
                    continue
                count = entry.get("residues")
                if not isinstance(count, (int, float)):
                    continue
                pid = structure_data.get(obj, {}).get("pdb_id", obj)
                per_structure.append(f"{pid}: {int(count)} residues")
            # One per line rather than a comma run: these are a list of
            # structures, and a reader scans them by structure.
            residues_display = "<br>".join(per_structure) if per_structure else "N/A"
        else:
            rmsd_display, residues_display = "N/A", "N/A"
        _exec_card("RMSD Range", rmsd_display, tip="rmsd")
        # Residues with coordinates in each structure's protein chains, so a
        # missing-residue gap lowers the count.
        resolved_lines = []
        for obj in structure_data:
            d_res = structure_data[obj]
            lengths = (d_res.get("process_result") or {}).get("chain_sequence_lengths") or {}
            label_pid = html_escape.escape(str(d_res.get("pdb_id", obj)))
            if not lengths:
                resolved_lines.append(f"{label_pid}: N/A")
                continue
            total = sum(int(v) for v in lengths.values())
            line = f"{label_pid}: {total} residues"
            if len(lengths) > 1:
                per_chain = ", ".join(f"{html_escape.escape(str(ch))}: {int(lengths[ch])}" for ch in sorted(lengths))
                line += f" <span class='exec-detail'>({per_chain})</span>"
            resolved_lines.append(line)
        _exec_card("Resolved Residues (per structure)", "<br>".join(resolved_lines) if resolved_lines else "N/A",
                   tip="resolved_length")
        _exec_card("Aligned Residues (per structure)", residues_display, tip="aligned_residues")
    else:
        single_key = next(iter(structure_data.keys()))
        sd = structure_data[single_key]
        hi_exec = sd.get("header_info", {})
        # Four cards for one structure: a reference or alignment method has no
        # meaning without something to compare against.
        pr_exec = sd.get("process_result") or {}
        lengths = pr_exec.get("chain_sequence_lengths") or {}
        if lengths:
            resolved_value = f"{sum(int(v) for v in lengths.values())} residues"
            if len(lengths) > 1:
                per_chain = ", ".join(f"{html_escape.escape(str(ch))}: {int(lengths[ch])}" for ch in sorted(lengths))
                resolved_value += f" <span class='exec-detail'>({per_chain})</span>"
        else:
            resolved_value = "N/A"
        _exec_card("Resolved Residues", resolved_value, tip="resolved_length")
        chain_list = pr_exec.get("chain_list") or []
        if chain_list:
            chains_value = (f"{len(chain_list)} <span class='exec-detail'>("
                            f"{html_escape.escape(', '.join(str(c) for c in chain_list))})</span>")
        else:
            chains_value = "N/A"
        _exec_card("Protein Chains", chains_value)
        resolution_value = html_escape.escape(resolution_display(hi_exec))
        _exec_card("Resolution", resolution_value)
        _exec_card("Experimental Method", html_escape.escape(format_method(hi_exec)))

    # Resolution / experimental method summary (overlay mode: list per structure compactly)
    if is_overlay_mode:
        res_summary = "<br>".join(
            f"{html_escape.escape(structure_data[o]['pdb_id'])}: {html_escape.escape(resolution_display(structure_data[o].get('header_info')))}"
            for o in structure_data
        )
        method_summary = "<br>".join(
            f"{html_escape.escape(structure_data[o]['pdb_id'])}: {html_escape.escape(format_method(structure_data[o].get('header_info')))}"
            for o in structure_data
        )
        _exec_card("Resolution (per structure)", res_summary)
        _exec_card("Experimental Method (per structure)", method_summary)

    html.append("</div></div></div>")

    if is_overlay_mode:
        # Keep existing overlay-style presentation (identical underlying content/data)
        html.append("<details class='section' open><summary><h2>Alignment Summary</h2><span class='chevron'></span></summary><div class='section-body'>")
        html.append("<p class='muted-note' style='margin-top:0;'>Algorithm: least-squares fit of matching atoms in sequence-aligned residues, with iterative outlier rejection</p>")
        html.append("<div class='table-wrap'><table>")
        html.append("<tr><th>Structure</th><th>RMSD (Å)" + _tip("rmsd") + "</th><th>Aligned atoms" + _tip("aligned_atoms") + "</th>"
                    "<th>Aligned residues" + _tip("aligned_residues") + "</th><th>Chains analyzed</th></tr>")
        for obj in structure_data:
            pid = html_escape.escape(structure_data[obj]["pdb_id"])
            res = alignment_results.get(obj, {})
            if res.get("success"):
                rmsd = f"{res.get('rmsd'):.3f}"
                atoms = str(res.get("atoms", "-"))
                residues = str(res.get("residues", "-"))
            elif res:
                rmsd = "Alignment failed"
                atoms = "-"
                residues = "-"
            else:
                rmsd = "-"
                atoms = "-"
                residues = "-"
            chains = ", ".join(structure_data[obj]["process_result"]["chain_list"]) if structure_data[obj]["process_result"]["chain_list"] else "None"
            html.append(f"<tr><td>{pid}</td><td>{rmsd}</td><td>{atoms}</td><td>{residues}</td><td>{html_escape.escape(chains)}</td></tr>")
        html.append("</table></div>")

        html.append("<h3>Pairwise RMSD Matrix (Cα)" + _tip("pairwise_rmsd") + "</h3>")
        if pairwise_matrix:
            ids = list(structure_data.keys())
            html.append("<div class='table-wrap'><table><tr><th></th>")
            for a in ids:
                html.append(f"<th>{html_escape.escape(structure_data[a]['pdb_id'])}</th>")
            html.append("</tr>")
            for a in ids:
                html.append(f"<tr><th>{html_escape.escape(structure_data[a]['pdb_id'])}</th>")
                for b in ids:
                    if a == b:
                        html.append("<td>0.000</td>")
                    else:
                        val = pairwise_matrix.get((a, b)) or pairwise_matrix.get((b, a))
                        html.append(f"<td>{('%.3f' % val) if val is not None else 'N/A'}</td>")
                html.append("</tr>")
            html.append("</table></div>")
        else:
            html.append("<p class='muted-note'>No pairwise RMSD matrix was generated for this run.</p>")
        html.append("</div></details>")

        # Per-structure sections (reuse existing layout, grouped as collapsible structure cards)
        html.append("<details class='section' open><summary><h2>Per-Structure Details</h2><span class='chevron'></span></summary>")
        html.append("<div class='section-body'>")
        for obj in structure_data:
            d = structure_data[obj]
            pid = html_escape.escape(d["pdb_id"])
            hi = d.get("header_info", {})
            pr = d.get("process_result", {})
            html.append("<details class='structure-block'>")
            html.append(f"<summary class='structure-block-header'><span>Structure: {pid}</span><span class='chevron'></span></summary>")
            html.append("<div class='structure-block-body'>")
            html.append("<h3 style='margin-top:0;'>Structure Quality</h3>")
            html.append("<div class='table-wrap'><table>")
            html.append("<tr><th>Property</th><th>Value</th></tr>")
            html.append(f"<tr><td>Experimental Method</td><td>{html_escape.escape(format_method(hi))}</td></tr>")
            html.append(f"<tr><td>Resolution</td><td>{html_escape.escape(resolution_display(hi))}</td></tr>")
            chains_val = ", ".join(pr.get('chain_list', [])) if pr.get('chain_list') else "None"
            html.append(f"<tr><td>Protein Chains</td><td>{html_escape.escape(chains_val)}</td></tr>")
            ligs = _counted_codes(l['resn'] for l in pr.get('ligand_info', [])) if pr.get('ligand_info') else "None"
            html.append(f"<tr><td>Ligands</td><td>{html_escape.escape(ligs)}</td></tr>")
            ions = _counted_codes(i['resn'] for i in pr.get('ion_info', [])) if pr.get('ion_info') else "None"
            html.append(f"<tr><td>Ions</td><td>{html_escape.escape(ions)}</td></tr>")
            if d.get('mean_b') is not None:
                html.append(f"<tr><td>Mean Cα B-factor" + _tip("mean_b") + f"</td><td>{d['mean_b']:.2f} Å²" + "</td></tr>")
                html.append(f"<tr><td>B-factor Range</td><td>{d['min_b']:.2f} - {d['max_b']:.2f} Å²</td></tr>")
            else:
                html.append("<tr><td>Mean Cα B-factor" + _tip("mean_b") + f"</td><td>{html_escape.escape(d.get('b_factor_note') or 'Not available')}</td></tr>")
            html.append(f"<tr><td>Alternate Conformations" + _tip("altloc") + f"</td><td>{'Yes' if d.get('has_altloc') else 'No'}</td></tr>")
            html.append(f"<tr><td>Water Removed" + _tip("water_removed") + f"</td><td>{pr.get('water_removed','Not available')}</td></tr>")
            from astra3_annotations import html_validation_rows
            html.extend(html_validation_rows(d.get("annotations"), pr.get("chain_list")))
            html.append("</table></div>")
            from astra3_annotations import html_annotation_section
            html.extend(html_annotation_section(d, tip=_tip, title_prefix=f"{d.get('pdb_id') or obj}: "))

            html.append("<h3>Chain Analysis</h3>")
            html.append("<div class='table-wrap'><table><tr><th>Chain</th><th>N-Terminus</th><th>C-Terminus</th><th>Missing Residues</th></tr>")
            for ch in pr.get('chain_list', []):
                n_lines = [l for l in d.get('n_term_residues', []) if l[0] == ch] if d.get('n_term_residues') else []
                c_lines = [l for l in d.get('c_term_residues', []) if l[0] == ch] if d.get('c_term_residues') else []
                n_display = format_residue_ranges(n_lines, structure_id=d['pdb_id']) if n_lines else "None"
                c_display = format_residue_ranges(c_lines, structure_id=d['pdb_id']) if c_lines else "None"
                missing_map = d.get('missing_residues')
                if missing_map is None:
                    missing_text = "Metadata unavailable"
                else:
                    mlist = missing_map.get(ch, [])
                    missing_text = display_ranges(", ".join(mlist)) if mlist else "None detected"
                html.append(f"<tr><td>{html_escape.escape(ch)}</td><td>{html_escape.escape(n_display)}</td><td>{html_escape.escape(c_display)}</td><td>{html_escape.escape(missing_text)}</td></tr>")
            html.append("</table></div>")
            _append_ligand_environment_section(d)
            html.append("</div></details>")
        html.append("</div></details>")

        # Images and session (overlay path will display same way)
        html.append("<details class='section' open><summary><h2>Image Gallery</h2><span class='chevron'></span></summary><div class='section-body'>")
        if images_rel:
            # Grouped: the combined overlay first, then one group per
            # comparison subfolder. With three or more structures the
            # subfolder images are the only per-pair views there are, and an
            # ungrouped grid gives no indication which pair a tile belongs to.
            combined = [i for i in images_rel if len(i.parts) <= 2]
            grouped = {}
            for img in images_rel:
                if len(img.parts) > 2:
                    grouped.setdefault(img.parts[1], []).append(img)
            gallery_ref = reference_obj if reference_obj in structure_data else None

            def _gallery_obj(folder):
                for o in structure_data:
                    if str(o).lower() == str(folder).lower() or \
                            str(structure_data[o].get("pdb_id", "")).lower() == str(folder).lower():
                        return o
                return None

            def _gallery_key(objs):
                items = []
                if gallery_ref is not None:
                    items.append(_structure_key_item(structure_data[gallery_ref].get("pdb_id", gallery_ref),
                                                     _protein_color_hex(gallery_ref, structure_data[gallery_ref]),
                                                     "reference"))
                for o in objs:
                    if o is not None and o != gallery_ref:
                        items.append(_structure_key_item(structure_data[o].get("pdb_id", o),
                                                         _protein_color_hex(o, structure_data[o])))
                return _color_key(items)

            if combined:
                if grouped:
                    html.append(_image_group_head("All structures", "combined overlay"))
                html.append(_gallery_key([_gallery_obj(g) for g in grouped] if grouped
                                         else [o for o in structure_data if o != gallery_ref]))
                html.append("<div class='images'>")
                for img in combined:
                    html.append(f"<div class='image-card'><div class='image-frame'><img src='{html_escape.escape(img.as_posix())}' alt='{html_escape.escape(img.name)}'></div><div class='image-caption'>{html_escape.escape(img.name)}</div></div>")
                html.append("</div>")
            for group_name in grouped:
                html.append(_image_group_head(html_escape.escape(group_name), "aligned to reference"))
                html.append(_gallery_key([_gallery_obj(group_name)]))
                html.append("<div class='images'>")
                for img in grouped[group_name]:
                    html.append(f"<div class='image-card'><div class='image-frame'><img src='{html_escape.escape(img.as_posix())}' alt='{html_escape.escape(img.name)}'></div><div class='image-caption'>{html_escape.escape(img.name)}</div></div>")
                html.append("</div>")
        else:
            html.append("<p class='muted-note'>No images found.</p>")
        html.append("</div></details>")

        html.append(f"<div class='section'><div class='section-header'><h2>{engine_name()} Session</h2></div><div class='section-body'>")
        if pse_rel:
            html.append(f"<a class='button' href='{html_escape.escape(pse_rel.as_posix())}' download><span class='icon'>&#8635;</span> Open {engine_name()} Session</a>")
        else:
            html.append("<p class='muted-note'>No session file found.</p>")
        html.append("</div></div>")

        html.append("<div class='section'><div class='section-header'><h2>Warnings &amp; Structural Notes</h2></div><div class='section-body'>")
        if warnings_list:
            warnings_list = prioritize_warnings(warnings_list)
            html.append("<div class='warn-list'><ul>")
            for w in warnings_list:
                html.append(f"<li>{html_escape.escape(w)}</li>")
            html.append("</ul></div>")
        else:
            html.append("<div class='no-warn'>No warnings detected.</div>")
        html.append("</div></div>")

        html.append("<details class='section'><summary><h2>Missing Residue Information</h2><span class='chevron'></span></summary>")
        html.append("<div class='section-body'><div class='table-wrap'>")
        html.append("<table><tr><th>Structure</th><th>Chain</th><th>Missing Residues" + _tip("missing_residues") + "</th><th>Source</th></tr>")
        for obj in structure_data:
            d = structure_data[obj]
            pid = html_escape.escape(d['pdb_id'])
            missing_map = d.get('missing_residues')
            source_label = html_escape.escape(d.get("header_info", {}).get("missing_residues_source") or "PDB REMARK 465")
            if missing_map is None:
                html.append(f"<tr><td>{pid}</td><td>-</td><td>The imported file carries no unobserved-residue records</td><td>N/A</td></tr>")
            elif not missing_map:
                html.append(f"<tr><td>{pid}</td><td>-</td><td>None detected</td><td>{source_label}</td></tr>")
            else:
                for ch, ranges in missing_map.items():
                    if ranges:
                        html.append(f"<tr><td>{pid}</td><td>{html_escape.escape(ch)}</td><td>{html_escape.escape(display_ranges(', '.join(ranges)))}</td><td>{source_label}</td></tr>")
                    else:
                        html.append(f"<tr><td>{pid}</td><td>{html_escape.escape(ch)}</td><td>None detected</td><td>{source_label}</td></tr>")
        html.append("</table></div></div></details>")

    else:
        # SINGLE/RENDER mode: produce a report tailored to single-structure
        # analysis Use Analysis Summary (no alignment content) There should be
        # exactly one entry in structure_data for single run
        single_obj_key = next(iter(structure_data.keys()))
        d = structure_data[single_obj_key]
        pid = html_escape.escape(d.get("pdb_id", single_obj_key))
        hi = d.get("header_info", {})
        pr = d.get("process_result", {})

        html.append("<div class='section'><div class='section-header'><h2>Analysis Summary</h2></div><div class='section-body'><div class='table-wrap'>")
        html.append("<table>")
        html.append("<tr><th>Property</th><th>Value</th></tr>")
        html.append(f"<tr><td>Structure analyzed</td><td>{pid}</td></tr>")
        html.append(f"<tr><td>Identifier</td><td>{html_escape.escape(single_obj_key)}</td></tr>")
        html.append(f"<tr><td>Command executed</td><td>{html_escape.escape(command_str)}</td></tr>")
        html.append(f"<tr><td>Date generated</td><td>{now}</td></tr>")
        num_chains = len(pr.get("chain_list", []))
        html.append(f"<tr><td>Protein chains</td><td>{num_chains}</td></tr>")
        nucleic = pr.get("nucleic_acid_chains") or {}
        if nucleic:
            html.append("<tr><td>Nucleic-acid chains</td><td>" + html_escape.escape(", ".join(
                f"{c} ({v['type']}, {v['nucleotides']} nucleotides)" for c, v in nucleic.items())) + "</td></tr>")
        html.append(f"<tr><td>Experimental method</td><td>{html_escape.escape(format_method(hi))}</td></tr>")
        html.append(f"<tr><td>Resolution</td><td>{html_escape.escape(resolution_display(hi))}</td></tr>")
        ligs = _counted_codes(l['resn'] for l in pr.get('ligand_info', [])) if pr.get('ligand_info') else "None"
        html.append(f"<tr><td>Ligands</td><td>{html_escape.escape(ligs)}</td></tr>")
        ions = _counted_codes(i['resn'] for i in pr.get('ion_info', [])) if pr.get('ion_info') else "None"
        html.append(f"<tr><td>Ions</td><td>{html_escape.escape(ions)}</td></tr>")
        html.append(f"<tr><td>Water removal</td><td>Detected: {pr.get('water_detected','Not available')}, Removed: {pr.get('water_removed','Not available')}</td></tr>")
        html.append("</table></div></div></div>")

        # Detailed structure section
        html.append("<div class='section'><div class='section-header'><h2>Structure Details</h2></div><div class='section-body'>")
        html.append("<h3 style='margin-top:0;'>Structure Quality</h3>")
        html.append("<div class='table-wrap'><table>")
        html.append("<tr><th>Property</th><th>Value</th></tr>")
        chains_val = ", ".join(pr.get('chain_list', [])) if pr.get('chain_list') else "None"
        html.append(f"<tr><td>Protein Chains</td><td>{html_escape.escape(chains_val)}</td></tr>")
        html.append(f"<tr><td>Assigned chain colors</td><td>{html_escape.escape(', '.join(c['chain'] + ':' + c['color'] for c in pr.get('chain_info', [])) if pr.get('chain_info') else 'None')}</td></tr>")
        html.append(f"<tr><td>Ligands (session identifiers)</td><td>{html_escape.escape(', '.join(l['sel_name'] for l in pr.get('ligand_info', [])) if pr.get('ligand_info') else 'None')}</td></tr>")
        html.append(f"<tr><td>Ions (session identifiers)</td><td>{html_escape.escape(', '.join(i['sel_name'] for i in pr.get('ion_info', [])) if pr.get('ion_info') else 'None')}</td></tr>")
        if d.get('mean_b') is not None:
            html.append(f"<tr><td>Mean Cα B-factor" + _tip("mean_b") + f"</td><td>{d['mean_b']:.2f} Å² (min {d['min_b']:.2f}, max {d['max_b']:.2f})" + "</td></tr>")
        else:
            html.append("<tr><td>Mean Cα B-factor" + _tip("mean_b") + f"</td><td>{html_escape.escape(d.get('b_factor_note') or 'Not available')}</td></tr>")
        html.append(f"<tr><td>Alternate conformations</td><td>{'Yes' if d.get('has_altloc') else 'No'}</td></tr>")
        html.append("</table></div>")

        # Chain analysis table with N/C termini and missing residues
        html.append("<h3>Chain Analysis</h3>")
        html.append(f"<div class='table-wrap'><table><tr><th>Chain</th><th>N-Terminus (first {TERMINUS_WINDOW})</th><th>C-Terminus (last {TERMINUS_WINDOW})</th><th>Missing Residues</th></tr>")
        for ch in pr.get('chain_list', []):
            n_list = [it for it in d.get('n_term_residues', []) if it[0] == ch] if d.get('n_term_residues') else []
            c_list = [it for it in d.get('c_term_residues', []) if it[0] == ch] if d.get('c_term_residues') else []
            n_display = format_residue_ranges(n_list, structure_id=d['pdb_id']) if n_list else "None"
            c_display = format_residue_ranges(c_list, structure_id=d['pdb_id']) if c_list else "None"
            excluded = {e["chain"]: e["residues"] for e in (pr.get("excluded_short_chains") or [])}
            if not n_list and not c_list and ch in excluded:
                n_display = c_display = f"Excluded ({excluded[ch]} residues)"
            missing_map = d.get('missing_residues')
            if missing_map is None:
                missing_text = "Metadata unavailable"
            else:
                mlist = missing_map.get(ch, [])
                missing_text = display_ranges(", ".join(mlist)) if mlist else "None detected"
            html.append(f"<tr><td>{html_escape.escape(ch)}</td><td>{html_escape.escape(n_display)}</td><td>{html_escape.escape(c_display)}</td><td>{html_escape.escape(missing_text)}</td></tr>")
        html.append("</table></div>")
        _append_ligand_environment_section(d)
        html.append("</div></div>")

        from astra3_annotations import html_annotation_section
        html.extend(html_annotation_section(d, tip=_tip))

        # Images: embed actual images once each
        html.append("<details class='section' open><summary><h2>Image Gallery</h2><span class='chevron'></span></summary><div class='section-body'>")
        if images_rel:
            # Grouped: the combined overlay first, then one group per
            # comparison subfolder. With three or more structures the
            # subfolder images are the only per-pair views there are, and an
            # ungrouped grid gives no indication which pair a tile belongs to.
            combined = [i for i in images_rel if len(i.parts) <= 2]
            grouped = {}
            for img in images_rel:
                if len(img.parts) > 2:
                    grouped.setdefault(img.parts[1], []).append(img)
            if combined:
                if grouped:
                    html.append(_image_group_head("All structures", "combined overlay"))
                html.append("<div class='images'>")
                for img in combined:
                    html.append(f"<div class='image-card'><div class='image-frame'><img src='{html_escape.escape(img.as_posix())}' alt='{html_escape.escape(img.name)}'></div><div class='image-caption'>{html_escape.escape(img.name)}</div></div>")
                html.append("</div>")
            for group_name in grouped:
                html.append(_image_group_head(html_escape.escape(group_name), "aligned to reference"))
                html.append("<div class='images'>")
                for img in grouped[group_name]:
                    html.append(f"<div class='image-card'><div class='image-frame'><img src='{html_escape.escape(img.as_posix())}' alt='{html_escape.escape(img.name)}'></div><div class='image-caption'>{html_escape.escape(img.name)}</div></div>")
                html.append("</div>")
        else:
            html.append("<p class='muted-note'>No images found.</p>")
        html.append("</div></details>")

        # Session link
        html.append(f"<div class='section'><div class='section-header'><h2>{engine_name()} Session</h2></div><div class='section-body'>")
        if pse_rel:
            html.append(f"<a class='button' href='{html_escape.escape(pse_rel.as_posix())}' download><span class='icon'>&#8635;</span> Open {engine_name()} Session</a>")
        else:
            html.append("<p class='muted-note'>No session file found.</p>")
        html.append("</div></div>")

        # Warnings and missing-residue table (single-structure)
        html.append("<div class='section'><div class='section-header'><h2>Warnings &amp; Structural Notes</h2></div><div class='section-body'>")
        if warnings_list:
            warnings_list = prioritize_warnings(warnings_list)
            html.append("<div class='warn-list'><ul>")
            for w in warnings_list:
                html.append(f"<li>{html_escape.escape(w)}</li>")
            html.append("</ul></div>")
        else:
            html.append("<div class='no-warn'>No warnings detected.</div>")
        html.append("</div></div>")

        html.append("<details class='section'><summary><h2>Missing Residue Information</h2><span class='chevron'></span></summary>")
        html.append("<div class='section-body'><div class='table-wrap'>")
        html.append("<table><tr><th>Chain</th><th>Missing Residues" + _tip("missing_residues") + "</th><th>Source</th></tr>")
        missing_map = d.get('missing_residues')
        source_label = html_escape.escape(hi.get("missing_residues_source") or "PDB REMARK 465")
        if missing_map is None:
            html.append("<tr><td>-</td><td>The imported file carries no unobserved-residue records</td><td>N/A</td></tr>")
        elif not missing_map:
            html.append(f"<tr><td>-</td><td>None detected</td><td>{source_label}</td></tr>")
        else:
            for ch, ranges in missing_map.items():
                if ranges:
                    n_missing = count_missing_residues(ranges)
                    html.append(f"<tr><td>{html_escape.escape(ch)}</td><td>{html_escape.escape(display_ranges(', '.join(ranges)))} "
                                f"({n_missing} residue{'s' if n_missing != 1 else ''})</td><td>{source_label}</td></tr>")
                else:
                    html.append(f"<tr><td>{html_escape.escape(ch)}</td><td>None detected</td><td>{source_label}</td></tr>")
        html.append("</table></div></div></details>")

    html.extend(_input_files_section(structure_data))
    methods_paragraphs, methods_refs = _methods_for(
        (run_parameters or {}).get("mode") or ("overlay" if is_overlay_mode else "single"),
        structure_data, command_str, run_parameters, reference_obj, reference_reason, warnings_list,
        [o for o, r in alignment_results.items() if r.get("success")] if alignment_results else None)
    if methods_paragraphs:
        from astra3_annotations import html_methods_section
        html.extend(html_methods_section(methods_paragraphs, methods_refs))

    append_astra3_citation_footer(html, now)
    html.append("</div>")  # .page
    html.append("\n<script>\n/* Every table starts open and can be folded away. Some run long, and a reader\n   scrolling for one section should not have to scroll a full residue table to\n   get past it. Only the body rows fold: the header row stays, so a folded\n   table still says what it was. Applied here rather than at each of the\n   emission sites so no table markup has to change. */\n(function () {\n  var wraps = document.querySelectorAll('.table-wrap');\n  for (var i = 0; i < wraps.length; i++) {\n    (function (wrap) {\n      var table = wrap.querySelector('table');\n      if (!table) return;\n      var bodyRows = table.querySelectorAll('tr').length - 1;\n      if (bodyRows < 1) return;\n      var btn = document.createElement('button');\n      btn.type = 'button';\n      btn.className = 'table-fold-toggle';\n      var arrow = document.createElement('span');\n      arrow.className = 'table-fold-arrow';\n      btn.title = bodyRows + (bodyRows === 1 ? ' row' : ' rows');\n      btn.appendChild(arrow);\n      btn.setAttribute('aria-expanded', 'true');\n      btn.addEventListener('click', function () {\n        var folded = wrap.classList.toggle('is-folded');\n        btn.setAttribute('aria-expanded', folded ? 'false' : 'true');\n      });\n      wrap.appendChild(btn);\n    })(wraps[i]);\n  }\n})();\n/* Printing opens every folded section, structure and table so a printed or\n   PDF report is complete, then restores what the reader had folded. */\n(function () {\n  var reopened = [], unfolded = [];\n  window.addEventListener('beforeprint', function () {\n    var ds = document.querySelectorAll('details:not([open])');\n    for (var i = 0; i < ds.length; i++) { ds[i].open = true; reopened.push(ds[i]); }\n    var ws = document.querySelectorAll('.table-wrap.is-folded');\n    for (var j = 0; j < ws.length; j++) { ws[j].classList.remove('is-folded'); unfolded.push(ws[j]); }\n  });\n  window.addEventListener('afterprint', function () {\n    while (reopened.length) reopened.pop().open = false;\n    while (unfolded.length) unfolded.pop().classList.add('is-folded');\n  });\n})();\n</script>\n")
    html.append("</body></html>")

    try:
        page_html = "\n".join(html)
        page_html = page_html.replace("</body></html>", _info_tip_library(page_html) + "</body></html>")
        with open(html_path, "w", encoding="utf-8") as fh:
            fh.write(page_html)
        print(f"{GREEN}HTML report saved: {html_path}{RESET}", flush=True)
    except Exception as e:
        print(f"{RED}Failed to write HTML report: {e}{RESET}", flush=True)
    return str(html_path)


def generate_json_export(output_dir, analysis_id, command_str,
                         structure_data, alignment_results, pairwise_matrix, warnings_list,
                         reference_obj=None, reference_reason=None, run_parameters=None):
    """Write Astra3_Report.json into output_dir/Session, alongside the .pse
    session file and Protein_Information.txt, built from the same validated
    data passed to generate_html_report -- no independent recalculation, so
    the JSON, HTML, and TXT reports for a given run can never disagree.

    Fields left unavailable in the source data (e.g. resolution not found in
    a PDB header) are written as JSON null rather than a placeholder string,
    so downstream tooling can distinguish "unknown" from a real value without
    string-matching against text like "Not available".
    """
    outdir = Path(output_dir)
    session_dir = outdir / "Session"
    session_dir.mkdir(parents=True, exist_ok=True)
    json_path = session_dir / "Astra3_Report.json"
    now = time.strftime("%Y-%m-%d %H:%M:%S")
    warnings_list = _prepare_annotations(structure_data, reference_obj, warnings_list)

    def _none_if_placeholder(value):
        """PyMOL/header parsing uses human-readable placeholder strings like
        'Not available' or 'Not found in header' for missing data. Convert
        those to real JSON null so JSON consumers get a proper unavailable
        marker instead of having to know Astra3's specific placeholder text."""
        if isinstance(value, str) and value.strip().lower() in (
            "not available", "not found in header", "unknown", "none", "n/a"
        ):
            return None
        return value

    is_overlay_mode = len(structure_data) > 1 or bool(alignment_results) or bool(pairwise_matrix)

    structures_out = []
    for obj, d in structure_data.items():
        hi = d.get("header_info", {}) or {}
        pr = d.get("process_result", {}) or {}
        missing_map = d.get("missing_residues")
        structures_out.append({
            "structure_id": d.get("pdb_id", obj),
            "internal_object": obj,
            # The PDB entry an imported file was confirmed to be, if any.
            "confirmed_pdb_entry": (hi.get("import_entry_confirmed") or {}).get("entry_id"),
            # Name, size and SHA-256 of the file the coordinates were read from.
            "coordinate_file": hi.get("coordinate_file"),
            "experimental_method": _none_if_placeholder(hi.get("method")),
            "resolution_angstrom": _none_if_placeholder(hi.get("resolution")),
            "r_work": _none_if_placeholder(hi.get("r_work")),
            "r_free": _none_if_placeholder(hi.get("r_free")),
            "chains": pr.get("chain_list", []),
            "nucleic_acid_chains": [{"chain": c, "type": v["type"], "nucleotides": v["nucleotides"]}
                                    for c, v in (pr.get("nucleic_acid_chains") or {}).items()],
            "ligands": [
                {
                    "code": l.get("resn"),
                    "chain": l.get("chain"),
                    "residue_number": l.get("resi"),
                    "insertion_code": l.get("ins_code") or None,
                    "session_identifier": l.get("sel_name"),
                    "assigned_color": l.get("color"),
                    "identity_confirmed": l.get("identity_confirmed", True),
                    "nearby_residues": (d.get("ligand_environment") or {}).get(l.get("sel_name"), {}).get("nearby_residues"),
                    "polar_contact_count": (d.get("ligand_environment") or {}).get(l.get("sel_name"), {}).get("polar_contact_count"),
                    "polar_contacts": (d.get("ligand_environment") or {}).get(l.get("sel_name"), {}).get("polar_contacts"),
                }
                for l in pr.get("ligand_info", [])
            ],
            "ions": [
                {"code": i.get("resn"), "chain": i.get("chain"), "residue_number": i.get("resi"),
                 "session_identifier": i.get("sel_name"), "assigned_color": i.get("color")}
                for i in pr.get("ion_info", [])
            ],
            "in_chain_residues": _in_chain_rows(pr),
            "water_detected": pr.get("water_detected"),
            "water_removed": pr.get("water_removed"),
            "mean_ca_bfactor": d.get("mean_b"),
            "mean_ca_bfactor_note": d.get("b_factor_note"),
            "min_ca_bfactor": d.get("min_b"),
            "max_ca_bfactor": d.get("max_b"),
            "has_alternate_conformations": d.get("has_altloc"),
            "n_terminus_residues": d.get("n_term_residues", []),
            "c_terminus_residues": d.get("c_term_residues", []),
            # None (not {}) means "metadata unavailable for this structure" --
            # e.g. an imported structure with no REMARK 465 to parse. An empty
            # dict means the metadata was checked and nothing was missing.
            "missing_residues_by_chain": missing_map,
            # Residues per chain. The lists above hold ranges, so their
            # lengths count gaps, not residues.
            "missing_residue_count_by_chain": (
                {ch: count_missing_residues(r) for ch, r in missing_map.items()} if missing_map is not None else None),
            "missing_residues_available": missing_map is not None,
            "reduction_used": d.get("reduction_used", False),
            "reduction_metrics": d.get("reduction_metrics"),
            "reduction_diagnostic": d.get("reduction_diagnostic"),
            # How each cluster of redundant chains was decided, when there was one.
            **({"homomer_rule": d["homomer_rule"]} if d.get("homomer_rule") else {}),
            "annotations": _json_annotations(d),
        })

    alignment_out = None
    pairwise_out = None
    if is_overlay_mode:
        alignment_out = []
        for obj, res in (alignment_results or {}).items():
            pid = structure_data.get(obj, {}).get("pdb_id", obj)
            entry = {"structure_id": pid, "success": bool(res.get("success"))}
            if res.get("success"):
                entry["rmsd_angstrom"] = res.get("rmsd")
                entry["aligned_atoms"] = res.get("atoms")
                entry["aligned_residues"] = res.get("residues")
            else:
                entry["error"] = res.get("error")
            alignment_out.append(entry)

        pairwise_out = []
        for (obj_a, obj_b), rmsd in (pairwise_matrix or {}).items():
            pairwise_out.append({
                "structure_a": structure_data.get(obj_a, {}).get("pdb_id", obj_a),
                "structure_b": structure_data.get(obj_b, {}).get("pdb_id", obj_b),
                "rmsd_angstrom": rmsd,
            })

    reference_pid = None
    if reference_obj is not None and reference_obj in structure_data:
        reference_pid = structure_data[reference_obj]["pdb_id"]

    methods_paragraphs, methods_refs = _methods_for(
        (run_parameters or {}).get("mode") or ("overlay" if is_overlay_mode else "single"),
        structure_data, command_str, run_parameters, reference_obj, reference_reason, warnings_list,
        [o for o, r in alignment_results.items() if r.get("success")] if alignment_results else None)
    export_obj = {
        "astra3_version": ASTRA3_VERSION,
        "engine": engine_name(),
        "engine_version": get_pymol_version_string(),
        "engine_license": get_pymol_license_string(),
        # Kept for scripts written before ChimeraX; null under ChimeraX.
        "pymol_version": get_pymol_version_string() if engine_name() == "PyMOL" else None,
        "pymol_license": get_pymol_license_string() if engine_name() == "PyMOL" else None,
        "analysis_id": analysis_id,
        "report_type": "overlay_alignment" if is_overlay_mode else "structure_rendering",
        "generated": now,
        "command": command_str,
        "structures_analyzed": len(structure_data),
        "reference_structure": reference_pid,
        "reference_selection_reason": reference_reason,
        "alignment_method": "Least-squares fit (Kabsch) of matching atoms in sequence-aligned residues; up to 5 cycles rejecting pairs beyond 2.0 x RMSD" if is_overlay_mode else None,
        "structures": structures_out,
        "alignment_results": alignment_out,
        "pairwise_rmsd_matrix": pairwise_out,
        "warnings": prioritize_warnings(warnings_list) if warnings_list else [],
        "run_parameters": run_parameters or None,
        "methods": {"paragraphs": methods_paragraphs or [], "references": methods_refs or []},
    }

    try:
        with open(json_path, "w", encoding="utf-8") as fh:
            json.dump(export_obj, fh, indent=2, sort_keys=False, default=str)
        _write_methods_and_sources(session_dir, structure_data, methods_paragraphs, methods_refs, command_str,
                                   display_date(with_time=True))
        print(f"{GREEN}JSON export saved: {json_path}{RESET}", flush=True)
    except Exception as e:
        print(f"{RED}Failed to write JSON export: {e}{RESET}", flush=True)
    return str(json_path)


# ------------------------------------------------------------
# CSV export (-csv, opt-in only -- never generated by default)
# ------------------------------------------------------------
# CSV is built from the same structure_data/alignment_results/pairwise_matrix
# used by the HTML/TXT/JSON reports -- no independent recalculation. Fields
# not currently captured as structured data anywhere else in Astra3 (e.g.
# disulfide bond count, which today only exists as report text inside
# report_disulfides()) are intentionally left out of the CSV schema rather
# than being recomputed a second time or estimated; adding that field properly
# means having report_disulfides() return structured data that
# _run_single_analysis/OverlayExecution store back into structure_data, which
# is a larger change than the CSV export itself.
def _shown_path(path):
    """A path as the computer names it. Python in the Astra3 Engine sees drive C: of a Windows
    computer as /C:/; everywhere else the path is already the computer's own."""
    if os.environ.get("ASTRA3_ENGINE", "").strip().lower() == "astra3":
        try:
            from astra3_engine import host_path
            return host_path(str(path))
        except Exception:  # noqa: BLE001 -- the path as Python sees it is still a usable record
            pass
    return str(path)


def _csv_cell(value):
    """A text cell that a spreadsheet would run as a formula (starting with =, +, -, @, a tab or a
    carriage return) is written with a leading apostrophe. Numbers, negative ones included, are
    written as they are."""
    if isinstance(value, str) and value[:1] in ("=", "+", "-", "@", "\t", "\r"):
        try:
            float(value)
        except ValueError:
            return "'" + value
    return value


class _CsvDictWriter(csv.DictWriter):
    def writerow(self, rowdict):
        return super().writerow({k: _csv_cell(v) for k, v in rowdict.items()})


class _CsvWriter:
    def __init__(self, fh):
        self._writer = csv.writer(fh)

    def writerow(self, row):
        return self._writer.writerow([_csv_cell(v) for v in row])


def _csv_none_if_placeholder(value):
    """Match generate_json_export's placeholder handling so CSV and JSON
    agree on what counts as an unavailable value."""
    if isinstance(value, str) and value.strip().lower() in (
        "not available", "not found in header", "unknown", "none", "n/a"
    ):
        return ""
    if value is None:
        return ""
    return value


def _write_ligand_environment_csv(session_dir, structure_data):
    """Write Ligand_Environment.csv: one row per (ligand, nearby residue) pair,
    plus polar-contact distance columns when a polar contact was found for
    that specific residue. Kept as its own file (rather than folded into
    Astra3_Export.csv / Overlay_Summary.csv) because a structure can have
    multiple ligands, each with a variable number of nearby residues -- that
    doesn't fit a one-row-per-structure schema without either truncating data
    or repeating the same structure row many times.
    """
    csv_path = session_dir / "Ligand_Environment.csv"
    fieldnames = [
        "structure_id", "ligand_code", "ligand_chain", "ligand_residue",
        "nearby_residue_chain", "nearby_residue", "possible_polar_contact",
        "contact_ligand_atom", "contact_protein_atom", "contact_distance_angstrom",
    ]
    any_rows = False
    try:
        with open(csv_path, "w", newline="", encoding="utf-8") as fh:
            writer = _CsvDictWriter(fh, fieldnames=fieldnames)
            writer.writeheader()
            for obj, d in structure_data.items():
                pid = d.get("pdb_id", obj)
                pr = d.get("process_result", {}) or {}
                env = d.get("ligand_environment") or {}
                for lig in pr.get("ligand_info", []):
                    sel_name = lig.get("sel_name")
                    lig_env = env.get(sel_name, {})
                    near = lig_env.get("nearby_residues")
                    polar_contacts = lig_env.get("polar_contacts") or []
                    # Index polar contacts by protein residue so a nearby-
                    # residue row can show whether that specific residue also
                    # had a possible polar contact, without duplicating
                    # unrelated rows.
                    contacts_by_residue = {}
                    for pc in polar_contacts:
                        key = (pc.get("protein_chain"), pc.get("protein_resi"))
                        contacts_by_residue.setdefault(key, []).append(pc)

                    if not near:
                        writer.writerow({
                            "structure_id": pid, "ligand_code": lig.get("resn", ""),
                            "ligand_chain": lig.get("chain", ""), "ligand_residue": lig.get("resi", ""),
                            "nearby_residue_chain": "", "nearby_residue": "",
                            "possible_polar_contact": "", "contact_ligand_atom": "",
                            "contact_protein_atom": "", "contact_distance_angstrom": "",
                        })
                        any_rows = True
                        continue

                    for r in near:
                        key = (r["chain"], r["resi"])
                        matching_contacts = contacts_by_residue.get(key, [{}])
                        for pc in matching_contacts:
                            writer.writerow({
                                "structure_id": pid,
                                "ligand_code": lig.get("resn", ""),
                                "ligand_chain": lig.get("chain", ""),
                                "ligand_residue": lig.get("resi", ""),
                                "nearby_residue_chain": r["chain"],
                                "nearby_residue": r["resn"] + r["resi"],
                                "possible_polar_contact": "Yes" if pc else "No",
                                "contact_ligand_atom": pc.get("ligand_atom", ""),
                                "contact_protein_atom": pc.get("protein_atom", ""),
                                "contact_distance_angstrom": pc.get("distance_angstrom", ""),
                            })
                            any_rows = True
        if any_rows:
            print(f"{GREEN}CSV export saved: {csv_path}{RESET}", flush=True)
        return str(csv_path)
    except Exception as e:
        print(f"{RED}Failed to write Ligand_Environment.csv: {e}{RESET}", flush=True)
        return None


def prioritize_warnings(warnings_list):
    """Orders warnings so the ones that affect interpretation come first.

    Warnings were emitted in the order they happened, which put routine
    bookkeeping ("chain B was removed, approved by user") above findings that
    call the whole comparison into question ("60% overall sequence identity").
    A reader scanning the list sees the least important items first and may
    stop before reaching the one that matters.

    The ordering below is by consequence, not by severity of wording:

      1. Whether the structures are comparable at all. Low sequence identity
         means every downstream number may be describing unrelated proteins.
      2. Whether a comparison could be performed. A failed or skipped
         alignment means results are absent rather than wrong.
      3. Whether the measurement is reliable. Low-confidence matches,
         unresolved residues and missing data affect the numbers themselves.
      4. What was changed, with approval. Chain reductions and offset
         corrections are deliberate and expected; they explain the numbers
         rather than undermining them.

    Ordering is stable within each band, so the original sequence is
    preserved among warnings of equal weight.
    """
    def rank(text):
        low = str(text).lower()
        # Homomer notes say "same protein" and "missing residues" about the
        # rule that decided them; they are band 4 whatever words they use.
        if "intra-structure homomer reduction" in low:
            return 4
        if "sequence identity" in low or "same protein" in low or "closely related" in low:
            return 0
        if "failed" in low or "skipped" in low or "could not" in low or "cannot" in low:
            return 1
        if ("confidence" in low or "unresolved" in low or "missing" in low
                or "not available" in low or "insufficient" in low):
            return 2
        if "approved by user" in low or "user approval" in low or "offset-corrected" in low:
            return 4
        return 3
    return [w for _, _, w in sorted(
        ((rank(w), i, w) for i, w in enumerate(warnings_list)),
        key=lambda t: (t[0], t[1]))]


def generate_single_structure_csv(output_dir, structure_data, warnings_list):
    """Write Astra3_Export.csv into output_dir/Session: one row per structure,
    for a single-structure or BATCH run. Triggered only by the -csv flag.
    """
    warnings_list = _prepare_annotations(structure_data, None, warnings_list)
    outdir = Path(output_dir)
    session_dir = outdir / "Session"
    session_dir.mkdir(parents=True, exist_ok=True)
    csv_path = session_dir / "Astra3_Export.csv"
    fieldnames = [
        "structure_id", "experimental_method", "resolution_angstrom",
        "chains", "ligands", "ions", "water_molecules_removed",
        "mean_ca_bfactor", "missing_residues", "alternate_conformations",
        "structural_warnings", "output_location",
    ]
    try:
        with open(csv_path, "w", newline="", encoding="utf-8") as fh:
            writer = _CsvDictWriter(fh, fieldnames=fieldnames)
            writer.writeheader()
            for obj, d in structure_data.items():
                hi = d.get("header_info", {}) or {}
                pr = d.get("process_result", {}) or {}
                missing_map = d.get("missing_residues")
                if missing_map is None:
                    missing_display = "Unavailable"
                elif not any(missing_map.values()):
                    missing_display = "None detected"
                else:
                    missing_display = "; ".join(
                        f"{ch}: {display_ranges(', '.join(ranges))}" for ch, ranges in missing_map.items() if ranges
                    )
                writer.writerow({
                    "structure_id": d.get("pdb_id", obj),
                    "experimental_method": _csv_none_if_placeholder(hi.get("method")),
                    "resolution_angstrom": _csv_none_if_placeholder(hi.get("resolution")),
                    "chains": ", ".join(pr.get("chain_list", [])),
                    "ligands": ", ".join(l.get("resn", "") for l in pr.get("ligand_info", [])),
                    "ions": ", ".join(i.get("resn", "") for i in pr.get("ion_info", [])),
                    "water_molecules_removed": _csv_none_if_placeholder(pr.get("water_removed")),
                    "mean_ca_bfactor": d.get("mean_b") if d.get("mean_b") is not None else "",
                    "missing_residues": missing_display,
                    "alternate_conformations": "Yes" if d.get("has_altloc") else "No",
                    "structural_warnings": "; ".join(warnings_list) if warnings_list else "",
                    "output_location": _shown_path(outdir),
                })
        print(f"{GREEN}CSV export saved: {csv_path}{RESET}", flush=True)
    except Exception as e:
        print(f"{RED}Failed to write CSV export: {e}{RESET}", flush=True)
    _write_ligand_environment_csv(session_dir, structure_data)
    return str(csv_path)


def generate_overlay_csv(output_dir, structure_data, alignment_results, pairwise_matrix,
                       warnings_list, reference_obj=None, reference_reason=None):
    """Write Overlay_Summary.csv (one row per aligned structure) and
    Pairwise_RMSD_Matrix.csv (one row per structure pair) into
    output_dir/Session.

    Kept as two separate files rather than one combined CSV because the two
    tables have different keys/shapes (per-structure alignment stats vs.
    pairwise comparisons) -- forcing them into one file would mean either
    duplicating rows or leaving most cells blank on every row.
    """
    outdir = Path(output_dir)
    session_dir = outdir / "Session"
    session_dir.mkdir(parents=True, exist_ok=True)
    summary_path = session_dir / "Overlay_Summary.csv"
    pairwise_path = session_dir / "Pairwise_RMSD_Matrix.csv"
    reference_pid = None
    if reference_obj is not None and reference_obj in structure_data:
        reference_pid = structure_data[reference_obj]["pdb_id"]

    summary_fields = [
        "structure_id", "is_reference", "reference_structure", "reference_selection_reason",
        "rmsd_to_reference_angstrom", "aligned_atoms", "aligned_residues",
        "alignment_success", "alignment_error", "chain_reduction_used",
        "structural_warnings",
    ]
    try:
        with open(summary_path, "w", newline="", encoding="utf-8") as fh:
            writer = _CsvDictWriter(fh, fieldnames=summary_fields)
            writer.writeheader()
            for obj, d in structure_data.items():
                pid = d.get("pdb_id", obj)
                res = (alignment_results or {}).get(obj, {})
                is_ref = (obj == reference_obj)
                row = {
                    "structure_id": pid,
                    "is_reference": "Yes" if is_ref else "No",
                    "reference_structure": reference_pid or "",
                    "reference_selection_reason": reference_reason or "",
                    "rmsd_to_reference_angstrom": "",
                    "aligned_atoms": "",
                    "aligned_residues": "",
                    "alignment_success": "",
                    "alignment_error": "",
                    "chain_reduction_used": "Yes" if d.get("reduction_used") else "No",
                    "structural_warnings": "",
                }
                if is_ref:
                    row["alignment_success"] = "N/A (reference structure)"
                elif res:
                    row["alignment_success"] = "Yes" if res.get("success") else "No"
                    if res.get("success"):
                        row["rmsd_to_reference_angstrom"] = res.get("rmsd", "")
                        row["aligned_atoms"] = res.get("atoms", "")
                        row["aligned_residues"] = res.get("residues", "")
                    else:
                        row["alignment_error"] = res.get("error", "")
                writer.writerow(row)
        print(f"{GREEN}CSV export saved: {summary_path}{RESET}", flush=True)
    except Exception as e:
        print(f"{RED}Failed to write Overlay_Summary.csv: {e}{RESET}", flush=True)

    try:
        with open(pairwise_path, "w", newline="", encoding="utf-8") as fh:
            writer = _CsvWriter(fh)
            writer.writerow(["structure_a", "structure_b", "rmsd_angstrom"])
            for (obj_a, obj_b), rmsd in (pairwise_matrix or {}).items():
                pid_a = structure_data.get(obj_a, {}).get("pdb_id", obj_a)
                pid_b = structure_data.get(obj_b, {}).get("pdb_id", obj_b)
                writer.writerow([pid_a, pid_b, rmsd if rmsd is not None else ""])
        print(f"{GREEN}CSV export saved: {pairwise_path}{RESET}", flush=True)
    except Exception as e:
        print(f"{RED}Failed to write Pairwise_RMSD_Matrix.csv: {e}{RESET}", flush=True)

    if warnings_list:
        print(f"{YELLOW}Note: {len(warnings_list)} run-level warning(s) are recorded in the HTML/JSON/TXT reports; see those for full warning text.{RESET}", flush=True)

    _write_ligand_environment_csv(session_dir, structure_data)
    return str(summary_path), str(pairwise_path)


# ------------------------------------------------------------
# TERMINI export (Termini_Analysis.csv / .json / HTML section)
# ------------------------------------------------------------
def _termini_rows(structure_data, reference_obj, results):
    """Flatten TerminiExecution.results into one row per (comparison
    structure, chain, terminus) -- the shape both the CSV and JSON writers
    below iterate over, so the two formats can never disagree on content.
    """
    ref_pid = structure_data[reference_obj]["pdb_id"]
    rows = []
    for cmp_obj, per_chain in results.items():
        cmp_pid = structure_data[cmp_obj]["pdb_id"]
        for chain, per_terminus in per_chain.items():
            for terminus in ("N", "C"):
                metrics = per_terminus.get(terminus)
                rows.append({
                    "reference_structure": ref_pid,
                    "comparison_structure": cmp_pid,
                    "chain": chain,
                    "terminus": terminus,
                    "metrics": metrics,  # None if unavailable for this chain/terminus
                })
    return rows


def generate_termini_json(output_dir, reference_obj, structure_data, results, warnings_list, command_str, functional_readouts=None,
                          run_parameters=None):
    """Write Termini_Analysis.json into output_dir/Session, using the same
    structure/placeholder conventions as generate_json_export (None for
    unavailable values, no independent recalculation -- built from the
    TerminiExecution.results object that also backs the CSV and HTML output).

    functional_readouts, if given, is the {structure_id_upper: [...]} dict
    from load_functional_readouts (see astra3_core.py) -- user-supplied
    experimental/functional data (e.g. signal change, affinity shift) tied
    to a structure by ID, auto-detected from readouts.csv. Included
    verbatim as its own top-level section; never computed or altered here.
    """
    outdir = Path(output_dir)
    session_dir = outdir / "Session"
    session_dir.mkdir(parents=True, exist_ok=True)
    json_path = session_dir / "Termini_Analysis.json"
    now = time.strftime("%Y-%m-%d %H:%M:%S")

    rows = _termini_rows(structure_data, reference_obj, results)
    comparisons_out = []
    for row in rows:
        m = row["metrics"]
        comparisons_out.append({
            "comparison_structure": row["comparison_structure"],
            "chain": row["chain"],
            "terminus": row["terminus"],
            "available": m is not None,
            "tip_displacement_angstrom": m["tip_displacement_angstrom"] if m else None,
            "centroid_displacement_angstrom": m["centroid_displacement_angstrom"] if m else None,
            "orientation_change_degrees": m["orientation_change_degrees"] if m else None,
            "tpv_angle_change_degrees": m["tpv_angle_change_degrees"] if m else None,
            "tpv_window_residues": m.get("tpv_window_residues") if m else None,
            "local_rmsd_angstrom": m["local_rmsd_angstrom"] if m else None,
            "local_rmsd_refit_angstrom": m.get("local_rmsd_refit_angstrom") if m else None,
            # Provenance for the RMSD above. Only residues resolved in both
            # structures can be paired, so residues_used is routinely lower
            # than the requested window and is what the value should be read
            # against.
            "local_rmsd_residues_used": m.get("local_rmsd_residues_used") if m else None,
            "local_rmsd_residues_requested": m.get("local_rmsd_residues_requested") if m else None,
            "local_rmsd_pairing": m.get("local_rmsd_pairing") if m else None,
            "terminus_window_requested": m.get("terminus_window_requested") if m else None,
            "terminus_window_measured_reference": m.get("terminus_window_measured_reference") if m else None,
            "terminus_window_measured_comparison": m.get("terminus_window_measured_comparison") if m else None,
            "reference_tip_residue": m["tip_resi_reference"] if m else None,
            "comparison_tip_residue": m["tip_resi_comparison"] if m else None,
            "sasa_reference_angstrom2": m.get("sasa_reference_angstrom2") if m else None,
            "sasa_comparison_angstrom2": m.get("sasa_comparison_angstrom2") if m else None,
            "delta_sasa_angstrom2": m.get("delta_sasa_angstrom2") if m else None,
            "sasa_classification": m.get("sasa_classification") if m else None,
            "bnorm_reference": m.get("bnorm_reference") if m else None,
            "bnorm_comparison": m.get("bnorm_comparison") if m else None,
            "delta_bnorm": m.get("delta_bnorm") if m else None,
            "bnorm_classification": m.get("bnorm_classification") if m else None,
            # Sequence figures for this terminus window. Identity alone
            # cannot distinguish a conservative substitution from an
            # unrelated residue, and cannot distinguish a well-matched
            # window from a short high-scoring fragment -- similarity and
            # per-sequence coverage are exported alongside it for that
            # reason.
            "sequence_identity": (m.get("sequence_match") or {}).get("alignment_identity") if m else None,
            "sequence_similarity": (m.get("sequence_match") or {}).get("alignment_similarity") if m else None,
            "sequence_coverage_reference": (m.get("sequence_match") or {}).get("alignment_coverage_reference") if m else None,
            "sequence_coverage_comparison": (m.get("sequence_match") or {}).get("alignment_coverage_comparison") if m else None,
            "sequence_residues_analyzed": (m.get("sequence_match") or {}).get("analyzed_residues") if m else None,
            # How far the offset search looked, and whether the adopted offset
            # is larger than ordinary terminal disorder. A large offset means
            # the two structures begin at different points in the construct.
            "terminus_offset_search_range": (m.get("sequence_match") or {}).get("search_extra") if m else None,
            "terminus_offset_is_large": (m.get("sequence_match") or {}).get("large_offset") if m else None,
        })

    resolved_chain_lengths_out = {}
    for obj, d in structure_data.items():
        lengths = (d.get("process_result") or {}).get("chain_sequence_lengths")
        if lengths:
            resolved_chain_lengths_out[d["pdb_id"]] = dict(lengths)

    chain_reductions_out = []
    for obj, d in structure_data.items():
        reductions = d.get("chain_reduction_applied")
        if reductions:
            for r in reductions:
                chain_reductions_out.append({
                    "structure": d["pdb_id"],
                    "removed_chain": r["removed_chain"],
                    "kept_chain": r["kept_chain"],
                })
    homomer_rules_out = {d["pdb_id"]: d["homomer_rule"] for d in structure_data.values() if d.get("homomer_rule")}

    functional_readouts_out = []
    if functional_readouts:
        for obj, d in structure_data.items():
            pid = d["pdb_id"]
            entries = functional_readouts.get(pid.upper())
            if entries:
                for e in entries:
                    functional_readouts_out.append({
                        "structure": pid,
                        "readout_name": e["readout_name"],
                        "value": e["value"],
                        "terminus": e.get("terminus"),
                        "units": e.get("units"),
                    })

    warnings_list = _prepare_annotations(structure_data, reference_obj, warnings_list)
    methods_paragraphs, methods_refs = _methods_for("termini", structure_data, command_str, run_parameters,
                                                    reference_obj, None, warnings_list, list(results))
    export_obj = {
        "astra3_version": ASTRA3_VERSION,
        "engine": engine_name(),
        "engine_version": get_pymol_version_string(),
        "engine_license": get_pymol_license_string(),
        # Kept for scripts written before ChimeraX; null under ChimeraX.
        "pymol_version": get_pymol_version_string() if engine_name() == "PyMOL" else None,
        "pymol_license": get_pymol_license_string() if engine_name() == "PyMOL" else None,
        "report_type": "termini_analysis",
        "generated": now,
        "command": command_str,
        "reference_structure": structure_data[reference_obj]["pdb_id"],
        "coordinate_files": {d.get("pdb_id", obj): (d.get("header_info") or {}).get("coordinate_file")
                             for obj, d in structure_data.items()},
        "comparisons": comparisons_out,
        "resolved_chain_lengths": resolved_chain_lengths_out,
        # Centroid distances from ligands unique to one structure to each
        # terminal window centroid, measured after alignment. Straight-line
        # centroid separations, not contact or binding distances.
        "ligand_terminus_distances": _ligand_terminus_rows(structure_data, results),
        # Residues that could not be measured, split by reason -- "missing"
        # (declared in the header, no coordinates) and "unobserved" (real
        # coordinates, zero occupancy, never seen in the density). Unobserved
        # residues are excluded from terminus selection and every terminal
        # measurement, so a reported terminus is the first or last OBSERVED
        # residue, not necessarily the first or last deposited one.
        "unmeasurable_residues": _residue_coverage_rows(structure_data, reference_obj, results),
        "chain_reductions_applied": chain_reductions_out,
        # How each structure's clusters of redundant chains were decided.
        **({"homomer_rules": homomer_rules_out} if homomer_rules_out else {}),
        "in_chain_residues": {(d.get("pdb_id") or obj): _in_chain_rows(d.get("process_result"))
                              for obj, d in structure_data.items()},
        "functional_readouts": functional_readouts_out,
        "warnings": prioritize_warnings(warnings_list) if warnings_list else [],
        "structure_annotations": {(d.get("pdb_id") or obj): _json_annotations(d) for obj, d in structure_data.items()},
        "run_parameters": run_parameters or None,
        "methods": {"paragraphs": methods_paragraphs or [], "references": methods_refs or []},
        "metric_definitions": {
            "tip_displacement_angstrom": "Distance between the terminal C-alpha atoms of the reference and "
                                         "comparison after superposition.",
            "centroid_displacement_angstrom": "Distance between the centroids of the five terminal C-alpha atoms.",
            "orientation_change_degrees": "Angle between vectors from the centroid of the five terminal C-alpha "
                                          "atoms to the centroid of the next five inward.",
            "tpv_angle_change_degrees": "Angle between Terminal Projection Vectors, each from the centroid of the "
                                        "three C-alpha atoms next to the terminal residue to the terminal C-alpha.",
            "local_rmsd_angstrom": "C-alpha RMSD over the paired terminus-window residues, in place after the "
                                   "whole-chain superposition (no refit).",
            "local_rmsd_refit_angstrom": "C-alpha RMSD over the same pairs after superposing the two terminus "
                                         "windows onto each other.",
            "sasa_classification": "More Exposed/Unmasked or More Buried/Masked when the change in terminus-window "
                                   "SASA is above 26 A^2, a quarter of glycine's 104 A^2 maximum accessible surface "
                                   "(Tien et al. 2013) at the 25% relative-accessibility boundary between surface "
                                   "and interior residues (Levy 2010); Little change otherwise.",
            "bnorm_classification": "Disordered/Flexible or Rigidified when the change in normalized B-factor is "
                                    "above 0.2, about a 10% change in relative RMS atomic displacement since "
                                    "B = 8*pi^2*<u^2> (see Sun et al. 2019 on the limits of B-factor comparisons); "
                                    "Little change otherwise.",
        },
        "notes": (
            "Terminal Projection Vector (TPV) angle change is how much the direction the "
            "chain points at its last resolved residue has turned, measured from the last "
            "four resolved residues; for a tag attached at that terminus it shows which way "
            "the chain points where the tag joins. \u0394SASA is comparison minus reference solvent "
            "accessible surface area (\u00c5\u00b2) over the terminus window, computed by Astra3 "
            "(Shrake-Rupley, 1.4 \u00c5 probe, Bondi radii, one conformation, observed heavy atoms) "
            "on the full structure (so burial from other chains/ligands is reflected); positive "
            "values indicate increased exposure. "
            "Normalized B-factor is the occupancy-weighted mean B-factor of the terminal window "
            "divided by that of the entire protein. \u0394 Normalized B-factor is the comparison "
            "structure's normalized terminal B-factor minus that of the reference structure. "
            "Because crystallographic B-factors depend on experimental conditions, crystal "
            "packing, and refinement procedures, normalized B-factors should be interpreted "
            "as relative within-structure measures of terminal flexibility rather than "
            "absolute measures of flexibility across independently solved structures. Both "
            "are reported as None/unavailable where a structure lacks usable B-factors or "
            "the terminus selection has no atoms. local_rmsd_residues_used is the number of "
            "residue pairs each local RMSD was actually computed from; it is frequently lower "
            "than local_rmsd_residues_requested, because only residues resolved in both "
            "structures can be paired. Read every local RMSD against its residues_used value "
            "rather than against the requested window. local_rmsd_angstrom is measured in place "
            "after the whole-chain superposition, so it includes any rigid shift of the terminus; "
            "local_rmsd_refit_angstrom uses the same pairs after superposing the terminus windows "
            "alone, so it reflects only a change in shape. resolved_chain_lengths gives each "
            "structure's per-chain count of residues with coordinates, which is normally "
            "shorter than the deposited sequence. sequence_similarity counts substitutions "
            "between residues of comparable size, charge or polarity in addition to exact "
            "matches, and the coverage values give the share of each structure's terminal "
            "residues the comparison spans: high identity at low coverage describes a short "
            "matching fragment rather than a well-matched terminus. functional_readouts is user-supplied data "
            "from readouts.csv (if present in the working folder) and is not computed or "
            "verified by Astra3. All other metrics are direct measurements on "
            "aligned coordinates and do not represent a biological interpretation. If "
            "chain_reductions_applied is non-empty, the removed chain(s) were deleted from "
            "the corresponding structure's loaded object before analysis and are not "
            "present in this run's saved session."
        ),
    }

    try:
        with open(json_path, "w", encoding="utf-8") as fh:
            json.dump(export_obj, fh, indent=2, sort_keys=False, default=str)
        _write_methods_and_sources(session_dir, structure_data, methods_paragraphs, methods_refs, command_str,
                                   display_date(with_time=True))
        print(f"{GREEN}JSON export saved: {json_path}{RESET}", flush=True)
    except Exception as e:
        print(f"{RED}Failed to write Termini_Analysis.json: {e}{RESET}", flush=True)
    return str(json_path)


def generate_termini_csv(output_dir, reference_obj, structure_data, results, functional_readouts=None):
    """Write Termini_Analysis.csv into output_dir/Session, one row per
    comparison structure (matching the exact column list from the TERMINI
    spec). When a structure has multiple protein chains, one row is written
    per chain, with the chain identified in its own column so multi-chain
    structures don't silently collapse into a single ambiguous row.

    functional_readouts, if given, is the {structure_id_upper: [...]} dict
    from load_functional_readouts (see astra3_core.py) -- written as a
    second, separate table appended after the main one (readouts are
    per-structure, not per-chain/terminus, so mixing them into the main
    row structure would misrepresent what they describe). User-supplied
    data, written verbatim; never computed here.
    """
    outdir = Path(output_dir)
    session_dir = outdir / "Session"
    session_dir.mkdir(parents=True, exist_ok=True)
    csv_path = session_dir / "Termini_Analysis.csv"
    fieldnames = [
        "Structure", "Chain",
        "N Tip Displacement (A)", "N Centroid Displacement (A)",
        "N Orientation Change (deg)", "N TPV Angle Change (deg)", "N Local RMSD (A)", "N Local RMSD Refit (A)",
        "N RMSD Residues Used", "N RMSD Residues Requested",
        "N Delta SASA (A2)", "N SASA Shift", "N Delta Bnorm", "N Flexibility Shift",
        "N Sequence Identity", "N Sequence Similarity",
        "N Coverage Reference", "N Coverage Comparison",
        "C Tip Displacement (A)", "C Centroid Displacement (A)",
        "C Orientation Change (deg)", "C TPV Angle Change (deg)", "C Local RMSD (A)", "C Local RMSD Refit (A)",
        "C RMSD Residues Used", "C RMSD Residues Requested",
        "C Delta SASA (A2)", "C SASA Shift", "C Delta Bnorm", "C Flexibility Shift",
        "C Sequence Identity", "C Sequence Similarity",
        "C Coverage Reference", "C Coverage Comparison",
    ]

    def _get(m, key):
        return m.get(key, "") if m else ""

    def _seq(m, key):
        """Value from a terminus's sequence_match, blank when absent.

        Identity, similarity and coverage were already computed per matched
        window; exporting them here means the CSV carries the same figures
        the report shows rather than only the geometry.
        """
        if not m:
            return ""
        value = (m.get("sequence_match") or {}).get(key)
        return "" if value is None else round(value, 3)

    try:
        with open(csv_path, "w", newline="", encoding="utf-8") as fh:
            writer = _CsvDictWriter(fh, fieldnames=fieldnames)
            writer.writeheader()
            for cmp_obj, per_chain in results.items():
                cmp_pid = structure_data[cmp_obj]["pdb_id"]
                for chain, per_terminus in per_chain.items():
                    n = per_terminus.get("N")
                    c = per_terminus.get("C")
                    writer.writerow({
                        "Structure": cmp_pid,
                        "Chain": chain,
                        "N Tip Displacement (A)": _get(n, "tip_displacement_angstrom"),
                        "N Centroid Displacement (A)": _get(n, "centroid_displacement_angstrom"),
                        "N Orientation Change (deg)": _get(n, "orientation_change_degrees"),
                        "N TPV Angle Change (deg)": _get(n, "tpv_angle_change_degrees"),
                        "N Local RMSD (A)": _get(n, "local_rmsd_angstrom"),
                        "N Local RMSD Refit (A)": _get(n, "local_rmsd_refit_angstrom"),
                        "N RMSD Residues Used": _get(n, "local_rmsd_residues_used"),
                        "N RMSD Residues Requested": _get(n, "local_rmsd_residues_requested"),
                        "N Delta SASA (A2)": _get(n, "delta_sasa_angstrom2"),
                        "N SASA Shift": _get(n, "sasa_classification"),
                        "N Delta Bnorm": _get(n, "delta_bnorm"),
                        "N Flexibility Shift": _get(n, "bnorm_classification"),
                        "N Sequence Identity": _seq(n, "alignment_identity"),
                        "N Sequence Similarity": _seq(n, "alignment_similarity"),
                        "N Coverage Reference": _seq(n, "alignment_coverage_reference"),
                        "N Coverage Comparison": _seq(n, "alignment_coverage_comparison"),
                        "C Tip Displacement (A)": _get(c, "tip_displacement_angstrom"),
                        "C Centroid Displacement (A)": _get(c, "centroid_displacement_angstrom"),
                        "C Orientation Change (deg)": _get(c, "orientation_change_degrees"),
                        "C TPV Angle Change (deg)": _get(c, "tpv_angle_change_degrees"),
                        "C Local RMSD (A)": _get(c, "local_rmsd_angstrom"),
                        "C Local RMSD Refit (A)": _get(c, "local_rmsd_refit_angstrom"),
                        "C RMSD Residues Used": _get(c, "local_rmsd_residues_used"),
                        "C RMSD Residues Requested": _get(c, "local_rmsd_residues_requested"),
                        "C Delta SASA (A2)": _get(c, "delta_sasa_angstrom2"),
                        "C SASA Shift": _get(c, "sasa_classification"),
                        "C Delta Bnorm": _get(c, "delta_bnorm"),
                        "C Flexibility Shift": _get(c, "bnorm_classification"),
                        "C Sequence Identity": _seq(c, "alignment_identity"),
                        "C Sequence Similarity": _seq(c, "alignment_similarity"),
                        "C Coverage Reference": _seq(c, "alignment_coverage_reference"),
                        "C Coverage Comparison": _seq(c, "alignment_coverage_comparison"),
                    })
            if functional_readouts:
                fh.write("\n")
                readout_writer = _CsvDictWriter(fh, fieldnames=["Structure", "Readout Name", "Value", "Terminus", "Units"])
                readout_writer.writeheader()
                for obj, d in structure_data.items():
                    pid = d["pdb_id"]
                    entries = functional_readouts.get(pid.upper())
                    if entries:
                        for e in entries:
                            readout_writer.writerow({
                                "Structure": pid,
                                "Readout Name": e["readout_name"],
                                "Value": e["value"],
                                "Terminus": e.get("terminus") or "",
                                "Units": e.get("units") or "",
                            })
        print(f"{GREEN}CSV export saved: {csv_path}{RESET}", flush=True)
    except Exception as e:
        print(f"{RED}Failed to write Termini_Analysis.csv: {e}{RESET}", flush=True)
    return str(csv_path)


def _angle_cell(value):
    """An angle in degrees for a table cell, or N/A when it was not measured."""
    return "N/A" if value is None else f"{value}&deg;"


def _local_rmsd_cell(metrics, key="local_rmsd_angstrom"):
    """Local RMSD (in place by default, or the refit value), with the residue
    count appended only when it fell short.

    The count used to have its own column, which was noise on every ordinary
    run: it read the same on every row and only ever mattered in the
    exceptional case. Shown inline where it applies, absent where it does
    not.
    """
    value = metrics.get(key)
    if value is None:
        return "N/A"
    used = metrics.get("local_rmsd_residues_used")
    requested = metrics.get("local_rmsd_residues_requested")
    if used is not None and requested is not None and used < requested:
        return f"{value} &Aring; <strong>({used} of {requested} residues)</strong>"
    return f"{value} &Aring;"


def _residues_measured_cell(metrics):
    """Render "used / requested" for a terminus row's Local RMSD, flagging
    the shortfall case.

    A bare RMSD figure carries no indication of how many residues produced
    it, and the two are not interchangeable: unresolved residues, an
    offset correction, and unpaired alignment columns all shrink the count
    below the requested window without changing how the number prints.
    Where fewer residues were used than requested, the cell says so
    explicitly rather than leaving the window size to be inferred.
    """
    used = metrics.get("local_rmsd_residues_used")
    requested = metrics.get("local_rmsd_residues_requested")
    if used is None:
        return "N/A"
    if requested is None:
        return str(used)
    if used < requested:
        return f"<strong>{used}</strong> of {requested}"
    return f"{used} of {requested}"


def _stability_phrase(metrics):
    """One short clause describing a terminus's exposure and flexibility
    shift, or None when neither was measurable.

    Kept to a clause rather than a paragraph: the numbers themselves are in
    the Terminal Metrics Summary Table, and the interpretation section only
    needs to say which direction they point. The previous wording restated
    each value in a sentence of its own, which buried the one comparison a
    reader is looking for.
    """
    parts = []
    delta_sasa = metrics.get("delta_sasa_angstrom2")
    sasa_class = metrics.get("sasa_classification")
    if delta_sasa is not None and sasa_class not in (None, "Unavailable"):
        if sasa_class == "More Exposed/Unmasked":
            parts.append(f"became more solvent-exposed (+{abs(delta_sasa)} &Aring;&sup2;)")
        elif sasa_class == "More Buried/Masked":
            parts.append(f"became more buried (&minus;{abs(delta_sasa)} &Aring;&sup2;)")
        else:
            sign = "+" if delta_sasa >= 0 else "&minus;"
            parts.append(f"changed little in solvent exposure ({sign}{abs(delta_sasa)} &Aring;&sup2;)")

    delta_bnorm = metrics.get("delta_bnorm")
    bnorm_class = metrics.get("bnorm_classification")
    if delta_bnorm is not None and bnorm_class not in (None, "Unavailable"):
        if bnorm_class == "Disordered/Flexible":
            parts.append(f"is modelled more flexibly (&Delta;Bnorm +{abs(delta_bnorm)})")
        elif bnorm_class == "Rigidified":
            parts.append(f"is modelled more rigidly (&Delta;Bnorm &minus;{abs(delta_bnorm)})")
        else:
            sign = "+" if delta_bnorm >= 0 else "&minus;"
            parts.append(f"changed little in relative B-factor (&Delta;Bnorm {sign}{abs(delta_bnorm)})")

    if not parts:
        return None
    return " and ".join(parts)


def _terminus_interpretation_line(row):
    """One line summarising a single terminus: displacement, rotation, RMSD
    with its residue count, and the exposure/flexibility direction.

    Every figure is prefixed with the terminus it belongs to. The previous
    version described the largest difference and then continued into
    unlabelled sentences about SASA and B-factor, leaving it ambiguous which
    terminus those referred to.
    """
    m = row["metrics"]
    term = f"{row['terminus']}-terminus"
    bits = [f"tip displacement {m['tip_displacement_angstrom']} &Aring;"]
    if m.get("orientation_change_degrees") is not None:
        bits.append(f"orientation change {m['orientation_change_degrees']}&deg;")
    if m.get("tpv_angle_change_degrees") is not None:
        bits.append(f"TPV rotation {m['tpv_angle_change_degrees']}&deg;")
    if m.get("local_rmsd_angstrom") is not None:
        used = m.get("local_rmsd_residues_used")
        requested = m.get("local_rmsd_residues_requested")
        rmsd_text = f"local RMSD {m['local_rmsd_angstrom']} &Aring; in place"
        if m.get("local_rmsd_refit_angstrom") is not None:
            rmsd_text += f" and {m['local_rmsd_refit_angstrom']} &Aring; refit"
        if used is not None and requested is not None and used < requested:
            rmsd_text += f" over {used} of {requested} residues"
        bits.append(rmsd_text)
    line = (f"<strong>{html_escape.escape(row['comparison_structure'])} chain "
            f"{html_escape.escape(row['chain'])}, {term}:</strong> " + ", ".join(bits) + ".")
    phrase = _stability_phrase(m)
    if phrase:
        line += f" This terminus {phrase}."
    return line


def _in_chain_rows(process_result):
    """Residues built into a chain without a standard backbone (chromophores)
    and whether the person counted each as protein or kept it as a ligand."""
    return [{"chain": r["chain"], "residue_number": r["resi"], "code": r["resn"], "counted_as": r["counted_as"]}
            for r in (process_result or {}).get("in_chain_residues") or []]


def _ligand_terminus_rows(structure_data, results):
    """Flattened ligand-to-terminus distance rows across every comparison.

    Shared by the HTML section and the JSON export so both describe the same
    set; computing it twice in two places is how they drift apart.
    """
    rows = []
    for cmp_obj in results:
        data = structure_data.get(cmp_obj) or {}
        for row in (data.get("ligand_terminus_distances") or []):
            rows.append({**row, "comparison_structure": data.get("pdb_id", str(cmp_obj))})
    return rows


def _residue_coverage_rows(structure_data, reference_obj, results):
    """Per-structure account of residues that exist in the deposited sequence
    but cannot be measured, split by reason.

    Two different things get conflated as "missing" and they are not the same:

      missing        declared in the header (PDB REMARK 465, mmCIF
                     pdbx_unobs_or_zero_occ_residues) and carrying no
                     coordinates at all. Nothing to measure, nothing to draw.

      unobserved     present as atoms with real coordinates but zero
                     occupancy -- placeholder positions the depositor marked
                     as never seen in the density. These load like ordinary
                     atoms, which is why they are dangerous: left in,
                     they can define a chain's terminus and put every terminal
                     measurement on a region nobody observed.

    Both reduce what a report can actually claim, so both are stated.
    """
    rows = []
    order = [reference_obj] + [o for o in results if o != reference_obj]
    for obj in order:
        data = structure_data.get(obj) or {}
        pr = data.get("process_result") or {}
        unobserved = pr.get("unobserved_residues") or {}
        missing_map = (data.get("header_info") or {}).get("missing_residues_map") or data.get("missing_residues") or {}
        source = (data.get("header_info") or {}).get("missing_residues_source")
        if not unobserved and not missing_map:
            continue
        rows.append({
            "structure": data.get("pdb_id", str(obj)),
            "role": "reference" if obj == reference_obj else "comparison",
            "unobserved": {c: list(v) for c, v in unobserved.items()},
            "missing": missing_map,
            "source": source,
        })
    return rows


def _compact_resi_range(items):
    """'43-52' for a contiguous run, otherwise a comma-joined list.

    Falls back rather than raising on insertion codes or any other resi shape
    that is not a clean integer run.
    """
    try:
        ints = sorted({int(x) for x in items})
    except (TypeError, ValueError):
        return ",".join(str(x) for x in items)
    if not ints:
        return ""
    runs = []
    start = prev = ints[0]
    for value in ints[1:]:
        if value == prev + 1:
            prev = value
            continue
        runs.append((start, prev))
        start = prev = value
    runs.append((start, prev))
    return ", ".join(str(a) if a == b else f"{a}-{b}" for a, b in runs)


# Residue lists reach here in two shapes: actual residue numbers, and
# pre-formatted range strings like "587-671" built elsewhere. Counting the
# list length works for the first and is badly wrong for the second -- it
# reports the number of RANGES, so "587-671", 85 residues, was summarised as
# (1), and "0,103-107,587-671" as (3).
RESI_RANGE_RE = re.compile(r"^\s*(-?\d+)\s*-\s*(-?\d+)\s*$")


def _summarize_residue_items(items):
    """Return (residue_count, group_count, display_text) for a residue list.

    Handles integers, numeric strings, and "start-end" range strings, so the
    count means residues either way and the group count is what is actually
    shown.
    """
    ints = []
    all_numeric = True
    for item in items:
        try:
            ints.append(int(str(item).strip()))
        except (TypeError, ValueError):
            all_numeric = False
            break

    if all_numeric and ints:
        text = _compact_resi_range(ints)
        return len(ints), len([p for p in text.split(",") if p.strip()]), text

    total = 0
    groups = 0
    pieces = []
    for item in items:
        text = str(item).strip()
        match = RESI_RANGE_RE.match(text)
        if match:
            start, end = sorted((int(match.group(1)), int(match.group(2))))
            total += end - start + 1
            text = str(start) if start == end else f"{start}-{end}"
        else:
            # An insertion code ("52A") or anything else unparseable is one
            # residue; it is never silently dropped from the count.
            total += 1
        groups += 1
        pieces.append(text)
    return total, groups, ", ".join(pieces)


def _residue_count_label(total, groups):
    """"85 residues in 1 range", or just "3 residues" when each is its own."""
    residues = f"{total} residue" if total == 1 else f"{total} residues"
    if groups >= total:
        return residues
    ranges = f"{groups} range" if groups == 1 else f"{groups} ranges"
    return f"{residues} in {ranges}"


def _residue_list_summary(by_chain, limit=3):
    """Compact "A: 1-42 (42 residues)" summary for a {chain: [resi,...]} map."""
    if not by_chain:
        return "None"
    parts = []
    for chain in sorted(by_chain):
        items = by_chain[chain]
        if not items:
            continue
        try:
            total, groups, text = _summarize_residue_items(items)
        except Exception:
            text = ", ".join(str(x) for x in items)
            total = groups = len(items)
        parts.append(f"{chain}: {text} ({_residue_count_label(total, groups)})")
    if not parts:
        return "None"
    if len(parts) > limit:
        return "; ".join(parts[:limit]) + f"; +{len(parts) - limit} more chain(s)"
    return "; ".join(parts)


def _sequence_comparison_rows(structure_data, reference_obj, results):
    """Per-comparison sequence figures for the Sequence Comparison section.

    Reads the alignment metrics match_terminus_windows already produced for
    each terminus (identity, similarity, per-sequence coverage, residues
    analyzed) plus each structure's resolved chain length. Nothing here is
    recomputed -- these values were being calculated and then discarded at
    report time.
    """
    ref_pid = structure_data[reference_obj]["pdb_id"]
    out = []
    for cmp_obj, per_chain in results.items():
        cmp_pid = structure_data[cmp_obj]["pdb_id"]
        for chain_key, termini in (per_chain or {}).items():
            for terminus in ("N", "C"):
                m = (termini or {}).get(terminus)
                if not m:
                    continue
                sm = m.get("sequence_match") or {}
                if sm.get("alignment_identity") is None and sm.get("identity") is None:
                    continue
                out.append({
                    "reference_structure": ref_pid,
                    "comparison_structure": cmp_pid,
                    "chain": str(chain_key),
                    "terminus": terminus,
                    "identity": sm.get("alignment_identity", sm.get("identity")),
                    "similarity": sm.get("alignment_similarity"),
                    "coverage_reference": sm.get("alignment_coverage_reference"),
                    "coverage_comparison": sm.get("alignment_coverage_comparison"),
                    "analyzed_residues": sm.get("analyzed_residues"),
                    "requested_window": sm.get("requested_window"),
                    "available_reference": sm.get("available_reference"),
                    "available_comparison": sm.get("available_comparison"),
                })
    return out


def _terminus_sequence_pairs(structure_data, reference_obj, results):
    """Terminal sequences grouped by chain and terminus, reference first.

    One entry per (chain, terminus), carrying the reference sequence once and
    a row per comparison structure beneath it. Grouping this way is what lets
    a three-structure run read as one block per terminus rather than one block
    per pair, and it extends to any number of comparisons.

    The sequences are the windows match_terminus_windows actually compared,
    after any approved offset, so a column compares residues that correspond.
    """
    ref_pid = structure_data.get(reference_obj, {}).get("pdb_id", reference_obj)
    groups = {}
    order = []
    for cmp_obj, per_chain in (results or {}).items():
        cmp_pid = structure_data.get(cmp_obj, {}).get("pdb_id", cmp_obj)
        for chain_key, termini in (per_chain or {}).items():
            for terminus in ("N", "C"):
                m = (termini or {}).get(terminus)
                if not m:
                    continue
                sm = m.get("sequence_match") or {}
                ref_seq = (sm.get("reference_seq") or "").strip()
                cmp_seq = (sm.get("comparison_seq") or "").strip()
                if not ref_seq or not cmp_seq:
                    continue
                key = (str(chain_key), terminus)
                if key not in groups:
                    groups[key] = {
                        "chain": str(chain_key),
                        "terminus": terminus,
                        "reference_structure": ref_pid,
                        "reference_seq": ref_seq,
                        "comparisons": [],
                    }
                    order.append(key)
                groups[key]["comparisons"].append({
                    "structure": cmp_pid,
                    "sequence": cmp_seq,
                    "identity": sm.get("identity"),
                    "offset": sm.get("offset", 0) or 0,
                })
    return [groups[k] for k in order]


def _comparison_display_order(structure_data, reference_obj, results=None,
                              alignment_results=None, loaded_objects=None):
    """Comparison structures, best-matching first.

    Ordered by how well each one matches the reference -- mean terminus
    identity where TERMINI measured it, otherwise alignment RMSD. Ties and
    unmeasurable structures keep their original order, so the sequence is
    always stable for a given run.

    The ordering is never stated in the report. It is a way of putting the
    most relevant comparison at the top of a long images section, not a
    finding, and labelling it as one would give it more weight than it has.
    """
    order = list(loaded_objects or (results or {}).keys())
    order = [o for o in order if o != reference_obj]

    def score(obj):
        idents = []
        for termini in ((results or {}).get(obj) or {}).values():
            for terminus in ("N", "C"):
                sm = ((termini or {}).get(terminus) or {}).get("sequence_match") or {}
                value = sm.get("identity")
                if isinstance(value, (int, float)):
                    idents.append(float(value))
        if idents:
            return (0, -(sum(idents) / len(idents)))
        entry = (alignment_results or {}).get(obj) or {}
        if entry.get("success") and isinstance(entry.get("rmsd"), (int, float)):
            return (1, float(entry["rmsd"]))
        return (2, 0.0)

    return sorted(order, key=lambda o: (score(o), order.index(o)))


def _input_files_section(structure_data):
    """The coordinate file each structure was read from, with its SHA-256,
    as a report section: what a reader needs to confirm that a later copy of
    an entry, or of a local file, is the one this report describes."""
    # Folded, like Methods: provenance a reader opens when they need it.
    html = ["<details class='section'><summary><h2>Input Files</h2><span class='chevron'></span></summary><div class='section-body'>",
            "<div class='table-wrap'><table>",
            "<tr><th>Structure</th><th>Coordinate file</th><th>Size (bytes)</th><th>SHA-256</th></tr>"]
    for obj, d in structure_data.items():
        record = (d.get("header_info") or {}).get("coordinate_file")
        pid = html_escape.escape(str(d.get("pdb_id") or obj))
        if record:
            html.append(f"<tr><td>{pid}</td><td>{html_escape.escape(record['name'])}</td><td>{record['bytes']:,}</td>"
                        f"<td style='word-break:break-all;font-family:monospace;'>{record['sha256']}</td></tr>")
        else:
            html.append(f"<tr><td>{pid}</td><td colspan='3'>Not recorded</td></tr>")
    html.append("</table></div>")
    html.append("<p class='muted-note'>The checksum is of the file as Astra3 read it: for a PDB ID, the "
                "uncompressed file downloaded from RCSB; for an imported file, the file as given.</p>")
    html.append("</div></details>")
    return html


def _counted_codes(codes):
    """"MN × 8, CL × 2": each code once, in order of first appearance."""
    counts = {}
    for code in codes:
        counts[code] = counts.get(code, 0) + 1
    return ", ".join(code if n == 1 else f"{code} × {n}" for code, n in counts.items())


def _rgb_hex(rgb):
    """PyMOL 0-1 RGB as a CSS hex colour."""
    return "#" + "".join(f"{max(0, min(255, round(float(v) * 255))):02x}" for v in rgb)


def _color_key(items_html):
    """A row of small boxed key entries."""
    items = [i for i in items_html if i]
    return f"<div class='color-key'>{''.join(items)}</div>" if items else ""


def _arrow_key_item(name, n_rgb, c_rgb):
    """One boxed entry: "1XGD [swatch] N-terminus [swatch] C-terminus"."""
    return (f"<span class='key-item'><strong>{html_escape.escape(str(name))}</strong>"
            f"<span class='key-swatch' style='background:{_rgb_hex(n_rgb)}'></span>N-terminus"
            f"<span class='key-swatch' style='background:{_rgb_hex(c_rgb)}'></span>C-terminus</span>")


def _structure_key_item(name, hex_color, note=None):
    """One boxed entry: "[swatch] 1XGD", with an optional quiet note."""
    if not hex_color:
        return ""
    extra = f"<span class='key-note'>{html_escape.escape(note)}</span>" if note else ""
    return (f"<span class='key-item'><span class='key-swatch' style='background:{hex_color}'></span>"
            f"<strong>{html_escape.escape(str(name))}</strong>{extra}</span>")


def _protein_color_hex(obj, structure_entry=None):
    """The colour a structure's protein is drawn in, read back from the
    session rather than from the palette it was meant to get, so the key is
    right however the colours were assigned. The most common colour among
    C-alpha atoms outside the green/red terminus windows. None when the
    object is not loaded or has no protein."""
    try:
        sel = f"({obj}) and polymer.protein and name CA"
        pr = (structure_entry or {}).get("process_result") or {}
        existing = set(cmd.get_names("selections") or [])
        windows = [n for n in (pr.get("n_term_name"), pr.get("c_term_name")) if n and n in existing]
        counts = {}
        if windows:
            try:
                cmd.iterate(sel + " and not (" + " or ".join(windows) + ")",
                            "counts[color] = counts.get(color, 0) + 1", space={"counts": counts})
            except Exception:  # noqa: BLE001
                counts = {}
        if not counts:
            cmd.iterate(sel, "counts[color] = counts.get(color, 0) + 1", space={"counts": counts})
        if not counts:
            return None
        return _rgb_hex(cmd.get_color_tuple(max(counts, key=counts.get)))
    except Exception:  # noqa: BLE001
        return None


def _image_group_head(title, note=None):
    """A quiet divider between image groups: a label and a rule, no shouting."""
    # The middot is part of the text, not a CSS gap, so copied text reads
    # the same as the rendered page.
    extra = f"<span class='img-group-note'>&middot; {note}</span>" if note else ""
    return f"<div class='img-group-head'><span>{title}</span>{extra}</div>"


def _pct(value):
    """Percentage string for a 0-1 fraction, or N/A."""
    if value is None:
        return "N/A"
    return f"{value * 100:.0f}%"


def generate_termini_html_report(output_dir, analysis_id, command_str, reference_obj,
                                 structure_data, results, warnings_list, visualization_images=None,
                                 closeup_images=None, functional_readouts=None,
                                 alignment_results=None, combined_images=None, run_parameters=None):
    """Generate Astra3_Report.html for a TERMINI run: a summary table, the
    largest N-/C-terminal displacement and rotation across all comparisons,
    and per-comparison detail with any rendered visualization images.

    visualization_images, if given, is {comparison_pdb_id: [image_paths...]}
    of already-rendered whole-structure PNGs (relative to output_dir) to
    embed -- these no longer include the TPV vector overlay (see
    closeup_images below for that).

    closeup_images, if given, is {comparison_pdb_id: [{"chain": chain_key,
    "N": path_or_None, "C": path_or_None}, ...]} of the isolated,
    per-terminus close-up renders WITH the real orientation arrows (see
    render_termini_closeups in this module) -- displayed in their own
    gallery section, before the whole-structure visualization_images
    gallery, since they're the more legible, direct answer to "what do the
    termini actually look like" that the wide shots alone weren't.

    functional_readouts, if given, is the {structure_id_upper: [...]} dict
    from load_functional_readouts (see astra3_core.py) -- user-supplied
    experimental/functional data (e.g. signal change, affinity shift) tied
    to a structure by ID, auto-detected from readouts.csv. Displayed
    verbatim in its own section when present; never computed or altered.
    """
    outdir = Path(output_dir)
    html_path = outdir / "Astra3_Report.html"
    now = display_date(with_time=True)
    warnings_list = _prepare_annotations(structure_data, reference_obj, warnings_list)
    title = f"Astra3 Report - {analysis_id}"
    css = _astra3_report_css()
    visualization_images = visualization_images or {}
    # Top-level views of every structure aligned together, written only for
    # runs with two or more comparisons. Paths are relative to output_dir.
    combined_images = combined_images or []
    closeup_images = closeup_images or {}

    logo_data_uri = _logo_data_uri()

    rows = _termini_rows(structure_data, reference_obj, results)
    available_rows = [r for r in rows if r["metrics"] is not None]

    def _largest(term, key):
        candidates = [r for r in available_rows
                      if r["terminus"] == term and r["metrics"].get(key) is not None]
        if not candidates:
            return None
        best = max(candidates, key=lambda r: r["metrics"][key])
        return best

    largest_n_disp = _largest("N", "tip_displacement_angstrom")
    largest_c_disp = _largest("C", "tip_displacement_angstrom")
    largest_n_rot = _largest("N", "orientation_change_degrees")
    largest_c_rot = _largest("C", "orientation_change_degrees")

    ref_pid = structure_data[reference_obj]["pdb_id"]
    input_structures_str = html_escape.escape(ref_pid) + ", " + ", ".join(
        html_escape.escape(structure_data[o]["pdb_id"]) for o in results
    )

    html = []
    html.append("<!doctype html>")
    html.append("<html><head><meta charset='utf-8'>")
    html.append(f"<title>{html_escape.escape(title)}</title>")
    html.append(f"<style>{css}</style>")
    html.append(_THEME_BOOT_SCRIPT)
    html.append("</head><body>")
    html.append("<div class='page'>")

    html.append("<div class='report-header'>")
    if logo_data_uri:
        html.append(f"<img class='logo' src='{logo_data_uri}' alt='Astra3 Logo'>")
    html.append("<div class='title-block'>")
    html.append("<h1>Astra3</h1>")
    html.append("<p class='subtitle'>Structural Analysis Toolkit for PDB Rendering Automation</p>")
    html.append("</div>")
    html.append("<div class='meta-col'><div class='meta-block'>")
    html.append(f"<span class='label'>Analysis ID</span><span class='value'>{html_escape.escape(analysis_id)}</span>")
    html.append(f"<span class='label'>Date</span><span class='value'>{now}</span>")
    html.append(f"<span class='label'>Version</span><span class='value'>Astra3 v{html_escape.escape(ASTRA3_VERSION)}</span>")
    html.append(f"<span class='label'>Report Type</span><span class='value'>Terminal Structural Analysis</span>")
    html.append("</div>")
    html.append(_theme_switch_html())
    html.append("</div>")
    html.append("</div>")

    html.append("<div class='command-line'>")
    html.append(f"<strong>Input structures:</strong> {input_structures_str} &nbsp;&nbsp;|&nbsp;&nbsp; ")
    html.append(f"<strong>Command:</strong> <code>{html_escape.escape(command_str)}</code>")
    html.append("</div>")

    # The saved session, offered the same way the single-structure and overlay
    # reports offer it. A TERMINI report is the one most likely to send someone
    # back into PyMOL -- the terminus arrows are in that .pse.
    session_dir = Path(output_dir) / "Session"
    pse_rel = None
    if session_dir.exists():
        pse_files = sorted([f for f in session_dir.iterdir() if f.suffix.lower() == session_extension()])
        if pse_files:
            pse_rel = Path("Session") / pse_files[0].name

    # ---------------- Executive Summary ----------------
    html.append("<div class='section'><div class='section-header'><h2>Executive Summary</h2>")
    html.append("<span class='badge'>Terminal Structural Analysis</span></div>")
    html.append("<div class='section-body'><div class='exec-grid'>")

    def _exec_card(label, value, highlight=False, tip=None):
        cls = "exec-card highlight" if highlight else "exec-card"
        tip_html = _tip(tip) if tip else ""
        html.append(f"<div class='{cls}'><div class='exec-label'>{html_escape.escape(label)}{tip_html}</div><div class='exec-value'>{value}</div></div>")

    _exec_card("Reference Structure", html_escape.escape(ref_pid), highlight=True)
    _exec_card("Comparisons", str(len(results)))
    if largest_n_disp:
        _exec_card("Largest N-Terminal Displacement", tip="tip_displacement", value=
                   f"{largest_n_disp['metrics']['tip_displacement_angstrom']} &Aring; "
                   f"<span class='exec-detail'>({html_escape.escape(largest_n_disp['comparison_structure'])}, chain {html_escape.escape(largest_n_disp['chain'])})</span>")
    if largest_c_disp:
        _exec_card("Largest C-Terminal Displacement", tip="tip_displacement", value=
                   f"{largest_c_disp['metrics']['tip_displacement_angstrom']} &Aring; "
                   f"<span class='exec-detail'>({html_escape.escape(largest_c_disp['comparison_structure'])}, chain {html_escape.escape(largest_c_disp['chain'])})</span>")
    if largest_n_rot:
        _exec_card("Largest N-Terminal Rotation", tip="orientation_change", value=
                   f"{largest_n_rot['metrics']['orientation_change_degrees']}&deg; "
                   f"<span class='exec-detail'>({html_escape.escape(largest_n_rot['comparison_structure'])}, chain {html_escape.escape(largest_n_rot['chain'])})</span>")
    if largest_c_rot:
        _exec_card("Largest C-Terminal Rotation", tip="orientation_change", value=
                   f"{largest_c_rot['metrics']['orientation_change_degrees']}&deg; "
                   f"<span class='exec-detail'>({html_escape.escape(largest_c_rot['comparison_structure'])}, chain {html_escape.escape(largest_c_rot['chain'])})</span>")

    # The same per-structure facts the OVERLAY summary carries. Every
    # comparison here is aligned to the reference before any terminus is
    # measured, so how much of each chain that alignment covered, and at what
    # resolution each structure was solved, both bear on how much weight the
    # displacements below can carry. Experimental method is left out: these
    # runs are overwhelmingly all-X-ray, and eight cards fill the grid evenly
    # where nine would leave one stranded.
    aligned_rows = []
    for cmp_obj in results:
        entry = (alignment_results or {}).get(cmp_obj) or {}
        count = entry.get("residues")
        if entry.get("success") and isinstance(count, (int, float)):
            cmp_pid = structure_data.get(cmp_obj, {}).get("pdb_id", cmp_obj)
            aligned_rows.append(f"{html_escape.escape(cmp_pid)}: {int(count)} residues")
    _exec_card("Aligned Residues (per structure)",
               "<br>".join(aligned_rows) if aligned_rows else "N/A", tip="aligned_residues")

    res_rows = []
    for obj in structure_data:
        pid = structure_data[obj].get("pdb_id", obj)
        res_rows.append(f"{html_escape.escape(pid)}: {html_escape.escape(resolution_display(structure_data[obj].get('header_info')))}")
    _exec_card("Resolution (per structure)", "<br>".join(res_rows) if res_rows else "N/A")

    html.append("</div></div></div>")

    # ---------------- Summary table ----------------
    html.append("<div class='section'><div class='section-header'><h2>Terminal Structural Analysis</h2></div><div class='section-body'>")
    html.append("<p class='muted-note' style='margin-top:0;'>Every comparison structure is superposed on the reference "
                "before measurement.</p>")
    html.append("<div class='table-wrap'><table>")
    html.append("<tr><th>Structure</th><th>Chain</th><th>Terminus</th><th>Tip Displacement" + _tip("tip_displacement") + "</th>"
                "<th>Centroid Displacement" + _tip("centroid_displacement") + "</th>"
                "<th>Orientation Change" + _tip("orientation_change") + "</th>"
                "<th>TPV Angle Change" + _tip("tpv_angle") + "</th>"
                "<th>Local RMSD (in place)" + _tip("local_rmsd") + "</th>"
                "<th>Local RMSD (refit)" + _tip("local_rmsd_refit") + "</th></tr>")
    for row in rows:
        m = row["metrics"]
        pid = html_escape.escape(row["comparison_structure"])
        ch = html_escape.escape(row["chain"])
        term = row["terminus"]
        if m is None:
            html.append(f"<tr><td>{pid}</td><td>{ch}</td><td>{term}</td><td colspan='6'>Not available "
                        f"(insufficient resolved residues near this terminus)</td></tr>")
            continue
        html.append(f"<tr><td>{pid}</td><td>{ch}</td><td>{term}</td>"
                    f"<td>{m['tip_displacement_angstrom']} &Aring;</td>"
                    f"<td>{m['centroid_displacement_angstrom']} &Aring;</td>"
                    f"<td>{_angle_cell(m.get('orientation_change_degrees'))}</td>"
                    f"<td>{_angle_cell(m.get('tpv_angle_change_degrees'))}</td>"
                    f"<td>{_local_rmsd_cell(m)}</td>"
                    f"<td>{_local_rmsd_cell(m, 'local_rmsd_refit_angstrom')}</td></tr>")
    html.append("</table></div>")
    html.append("</div></div>")

    # ---------------- Sequence Comparison ----------------
    # Two separate questions, so two separate tables. "Are these the same
    # protein?" is answered over the whole chain; "do their termini
    # correspond?" is answered over the terminus window only. Presenting one
    # set of numbers for both invites a whole-structure figure to be read as
    # a statement about a terminus, or the reverse.
    seq_rows = _sequence_comparison_rows(structure_data, reference_obj, results)
    html.append("<div class='section'><div class='section-header'><h2>Sequence Comparison</h2></div><div class='section-body'>")
    html.append("<p class='muted-note' style='margin-top:0;'>The first table asks whether these are the same "
                "protein; the second asks whether their ends correspond. A pair can match over the whole chain "
                "and still have unrelated termini.</p>")

    # --- whole protein ---
    html.append("<h3 style='margin-bottom:4px;'>Whole protein chain</h3>")
    html.append("<div class='table-wrap'><table>")
    html.append("<tr><th>Structure</th><th>Role</th><th>Chain</th><th>Resolved Length (residues)" + _tip("resolved_length") + "</th>"
                "<th>Identity" + _tip("identity") + "</th><th>Similarity" + _tip("similarity") + "</th>"
                "<th>Coverage (reference)" + _tip("coverage") + "</th><th>Coverage (comparison)" + _tip("coverage") + "</th></tr>")
    ref_lengths = (structure_data[reference_obj].get("process_result") or {}).get("chain_sequence_lengths") or {}
    ref_len_str = ", ".join(f"{ch}: {ref_lengths[ch]}" for ch in sorted(ref_lengths)) or "Not available"
    html.append(f"<tr><td>{html_escape.escape(ref_pid)}</td><td>reference</td><td>N/A</td>"
                f"<td>{html_escape.escape(ref_len_str)}</td>"
                f"<td colspan='4' class='muted-note'>Baseline: every row below is measured against this structure</td></tr>")
    for cmp_obj in results:
        data = structure_data.get(cmp_obj) or {}
        pid = data.get("pdb_id", str(cmp_obj))
        lengths = (data.get("process_result") or {}).get("chain_sequence_lengths") or {}
        len_str = ", ".join(f"{ch}: {lengths[ch]}" for ch in sorted(lengths)) or "Not available"
        ws = data.get("whole_structure_sequence")
        if ws:
            html.append(f"<tr><td>{html_escape.escape(pid)}</td><td>comparison</td>"
                        f"<td>{html_escape.escape(str(ws.get('comparison_chain', '')))}</td>"
                        f"<td>{html_escape.escape(len_str)}</td>"
                        f"<td>{_pct(ws.get('identity'))}</td>"
                        f"<td>{_pct(ws.get('similarity'))}</td>"
                        f"<td>{_pct(ws.get('coverage_reference'))}</td>"
                        f"<td>{_pct(ws.get('coverage_comparison'))}</td></tr>")
        else:
            html.append(f"<tr><td>{html_escape.escape(pid)}</td><td>comparison</td><td>N/A</td>"
                        f"<td>{html_escape.escape(len_str)}</td>"
                        f"<td colspan='4'>Not available</td></tr>")
    html.append("</table></div>")

    # --- termini ---
    html.append("<h3 style='margin-top:20px;margin-bottom:4px;'>Terminus windows only</h3>")
    if seq_rows:
        html.append("<div class='table-wrap'><table>")
        html.append("<tr><th>Structure</th><th>Chain</th><th>Terminus</th><th>Identity" + _tip("identity") + "</th>"
                    "<th>Similarity" + _tip("similarity") + "</th>"
                    "<th>Coverage (reference)" + _tip("coverage") + "</th><th>Coverage (comparison)" + _tip("coverage") + "</th>"
                    "<th>Residues Compared" + _tip("residues_compared") + "</th></tr>")
        for r in seq_rows:
            analyzed = r["analyzed_residues"]
            requested = r["requested_window"]
            if analyzed is None:
                compared = "N/A"
            elif requested is not None and analyzed < requested:
                compared = f"<strong>{analyzed}</strong> of {requested}"
            else:
                compared = f"{analyzed} of {requested}" if requested is not None else str(analyzed)
            html.append(f"<tr><td>{html_escape.escape(r['comparison_structure'])}</td>"
                        f"<td>{html_escape.escape(r['chain'])}</td>"
                        f"<td>{r['terminus']}</td>"
                        f"<td>{_pct(r['identity'])}</td>"
                        f"<td>{_pct(r['similarity'])}</td>"
                        f"<td>{_pct(r['coverage_reference'])}</td>"
                        f"<td>{_pct(r['coverage_comparison'])}</td>"
                        f"<td>{compared}</td></tr>")
        html.append("</table></div>")
    else:
        html.append("<p class='muted-note'>No terminus sequence comparison data was available for this run.</p>")
    html.append("</div></div>")

    # ---------------- Terminus Sequences ----------------
    # One box, one row per structure, the reference first. No connectors
    # between rows: with several comparisons a connector can only ever join
    # two adjacent rows, which says nothing useful about the rest and implies
    # a pairing that is not there.
    seq_groups = _terminus_sequence_pairs(structure_data, reference_obj, results)
    if seq_groups:
        html.append("<div class='section'><div class='section-header'><h2>Terminus Sequences" + _tip("offset") + "</h2>")
        html.append("<span class='badge'>Reference first</span></div><div class='section-body'>")
        html.append("<p class='muted-note'>The residues compared at each terminus, after any "
                    "approved offset. Reading down a column compares residues that correspond. "
                    "Residues differing from the reference are highlighted.</p>")
        html.append("<div class='seqbox'>")
        for group in seq_groups:
            ref_seq = group["reference_seq"]
            html.append(f"<div class='seqgroup-head'>Chain {html_escape.escape(group['chain'])} "
                        f"&nbsp;&middot;&nbsp; {group['terminus']}-terminus</div>")
            html.append("<table class='seqgrid'>")
            html.append("<tr class='seqrow seqrow-ref'>"
                        f"<td class='seqlabel'>{html_escape.escape(group['reference_structure'])}"
                        "<span class='seqlabel-tag'>reference</span></td>"
                        + "".join(f"<td class='seqres'>{html_escape.escape(c)}</td>" for c in ref_seq)
                        + "<td class='seqmeta'></td></tr>")
            for comp in group["comparisons"]:
                cells = []
                for i, c in enumerate(comp["sequence"]):
                    same = i < len(ref_seq) and c == ref_seq[i]
                    cls = "seqres" if same else "seqres seqres-diff"
                    cells.append(f"<td class='{cls}'>{html_escape.escape(c)}</td>")
                meta = _pct(comp["identity"])
                if comp["offset"]:
                    meta += (f" &middot; offset {comp['offset']:+d}")
                html.append("<tr class='seqrow'>"
                            f"<td class='seqlabel'>{html_escape.escape(comp['structure'])}</td>"
                            + "".join(cells)
                            + f"<td class='seqmeta'>{meta}</td></tr>")
            html.append("</table>")
        html.append("</div>")
        html.append("</div></div>")

    # ---------------- Residue Coverage ----------------
    # What could not be measured, and why. A terminal measurement is only as
    # meaningful as the residues that were available to make it, and two
    # different kinds of absence affect it differently -- see
    # _residue_coverage_rows for the distinction.
    coverage_rows = _residue_coverage_rows(structure_data, reference_obj, results)
    html.append("<div class='section'><div class='section-header'><h2>Unmeasurable Residues" + _tip("unmeasurable") + "</h2></div><div class='section-body'>")
    if coverage_rows:
        html.append("<p class='muted-note' style='margin-top:0;'>Residues that could not be measured and were "
                    "excluded from every measurement.</p>")
        html.append("<div class='table-wrap'><table>")
        html.append("<tr><th>Structure</th><th>Role</th><th>Unobserved (zero occupancy)</th>"
                    "<th>Missing (no coordinates)</th></tr>")
        for r in coverage_rows:
            html.append(f"<tr><td>{html_escape.escape(r['structure'])}</td><td>{r['role']}</td>"
                        f"<td>{html_escape.escape(_residue_list_summary(r['unobserved']))}</td>"
                        f"<td>{html_escape.escape(_residue_list_summary(r['missing']))}</td></tr>")
        html.append("</table></div>")
        pass
    else:
        html.append("<p class='muted-note' style='margin-top:0;'>Every residue in the deposited sequence of each "
                    "structure has observed coordinates. No residues were excluded from measurement.</p>")
    html.append("</div></div>")

    # ---------------- Ligand-to-Terminus Distances ----------------
    # Only ligands one structure has and the other does not. A cofactor bound
    # to both is not a difference between them, and listing it would bury the
    # ones that are.
    ligand_rows = _ligand_terminus_rows(structure_data, results)
    html.append("<details class='section' open><summary><h2>Ligand-to-Terminus Distances</h2>"
                "<span class='chevron'></span></summary><div class='section-body'>")
    if ligand_rows:
        html.append("<p class='muted-note' style='margin-top:0;'>Ligands present in only one structure of each "
                    "pair, measured after alignment.</p>")
        # One folded block per comparison structure, in the same best-match-
        # first order as the image sections. The table runs to four rows per
        # ligand (two termini, measured from each structure), so a run with a
        # few ligands per comparison was long enough to bury everything below.
        ordered_pids = [structure_data.get(o, {}).get("pdb_id", o)
                        for o in _comparison_display_order(structure_data, reference_obj, results=results)]
        groups = {}
        for r in ligand_rows:
            groups.setdefault(str(r.get("comparison_structure") or ""), []).append(r)
        group_order = [pid for pid in ordered_pids if pid in groups]
        group_order += sorted(k for k in groups if k not in group_order)
        ref_pid = structure_data.get(reference_obj, {}).get("pdb_id", reference_obj)
        for cmp_pid in group_order:
            rows_for = groups[cmp_pid]
            n_ligands = len({r["ligand"] for r in rows_for})
            html.append("<details class='structure-block'>")
            html.append(f"<summary class='structure-block-header'><span>{html_escape.escape(str(ref_pid))} vs "
                        f"{html_escape.escape(cmp_pid or 'comparison')} &middot; {n_ligands} "
                        f"ligand{'s' if n_ligands != 1 else ''}</span><span class='chevron'></span></summary>")
            html.append("<div class='structure-block-body'><div class='table-wrap'><table>")
            html.append("<tr><th>Ligand</th><th>Present In</th><th>Ligand Chain</th>"
                        "<th>Terminus Chain</th><th>Terminus</th><th>Terminus Of</th><th>Distance" + _tip("ligand_distance") + "</th></tr>")
            for r in sorted(rows_for, key=lambda x: (x["ligand"], x["chain"], x["terminus"], x["terminus_of"])):
                html.append(f"<tr><td>{html_escape.escape(r['ligand'])}</td>"
                            f"<td>{html_escape.escape(str(r['present_in']))}</td>"
                            f"<td>{html_escape.escape(str(r.get('ligand_chain') or '')) or 'N/A'}</td>"
                            f"<td>{html_escape.escape(r['chain'])}</td>"
                            f"<td>{r['terminus']}</td>"
                            f"<td>{html_escape.escape(r['terminus_of'])}</td>"
                            f"<td>{r['distance_angstrom']} &Aring;</td></tr>")
            html.append("</table></div></div></details>")
    else:
        html.append("<p class='muted-note' style='margin-top:0;'>No ligand is present in one structure and "
                    "absent from the other. Ligands bound to both are excluded.</p>")
    html.append("</div></details>")

    # ---------------- Terminal Metrics Summary Table (SASA / B-factor) ----------------
    html.append("<div class='section'><div class='section-header'><h2>Terminal Metrics Summary Table</h2></div><div class='section-body'>")
    html.append("<p class='muted-note' style='margin-top:0;'>Comparison minus reference, over each ten-residue "
                "terminus window.</p>")
    html.append("<div class='table-wrap'><table>")
    html.append("<tr><th>Structure</th><th>Chain</th><th>Terminus</th><th>&Delta;SASA (&Aring;&sup2;)" + _tip("delta_sasa") + "</th>"
                "<th>SASA Shift" + _tip("sasa_shift") + "</th><th>&Delta; Normalized B-factor" + _tip("delta_bnorm") + "</th>"
                "<th>Flexibility Shift" + _tip("flex_shift") + "</th></tr>")
    for row in rows:
        m = row["metrics"]
        pid = html_escape.escape(row["comparison_structure"])
        ch = html_escape.escape(row["chain"])
        term = row["terminus"]
        if m is None:
            html.append(f"<tr><td>{pid}</td><td>{ch}</td><td>{term}</td><td colspan='4'>Not available</td></tr>")
            continue
        delta_sasa = m.get("delta_sasa_angstrom2")
        delta_bnorm = m.get("delta_bnorm")
        html.append(f"<tr><td>{pid}</td><td>{ch}</td><td>{term}</td>"
                    f"<td>{delta_sasa if delta_sasa is not None else 'N/A'}</td>"
                    f"<td>{html_escape.escape(m.get('sasa_classification') or 'Unavailable')}</td>"
                    f"<td>{delta_bnorm if delta_bnorm is not None else 'N/A'}</td>"
                    f"<td>{html_escape.escape(m.get('bnorm_classification') or 'Unavailable')}</td></tr>")
    html.append("</table></div>")
    html.append("</div></div>")

    # ---------------- Functional Readouts ---------------- Shown only when
    # readouts.csv was found in the working folder and had at least one row
    # matching a structure ID in this run. This is user-supplied
    # experimental/functional data (e.g. signal change, affinity shift) --
    # displayed verbatim next to the structural metrics above for side-by-side
    # comparison; Astra3 does not compute, validate, or interpret these
    # values.
    any_readouts = functional_readouts and any(
        functional_readouts.get(structure_data[o]["pdb_id"].upper()) for o in structure_data
    )
    if any_readouts:
        html.append("<div class='section'><div class='section-header'><h2>Functional Readouts</h2></div><div class='section-body'>")
        html.append("<p class='muted-note' style='margin-top:0;'>User-supplied data from readouts.csv, shown "
                    "alongside the structural metrics above for reference. Not computed or verified by Astra3.</p>")
        html.append("<div class='table-wrap'><table>")
        html.append("<tr><th>Structure</th><th>Readout</th><th>Value</th><th>Terminus</th></tr>")
        for o in structure_data:
            pid = structure_data[o]["pdb_id"]
            entries = functional_readouts.get(pid.upper())
            if not entries:
                continue
            for e in entries:
                value_display = html_escape.escape(e["value"])
                if e.get("units"):
                    value_display += " " + html_escape.escape(e["units"])
                term_display = e.get("terminus") or "N/A"
                html.append(f"<tr><td>{html_escape.escape(pid)}</td>"
                            f"<td>{html_escape.escape(e['readout_name'])}</td>"
                            f"<td>{value_display}</td><td>{term_display}</td></tr>")
        html.append("</table></div>")
        html.append("</div></div>")

    # ---------------- Chain Reductions Applied ---------------- Shown only
    # when at least one structure had a chain physically removed (intra-
    # structure homomer reduction, approved by the user) before this analysis
    # ran. The removal is real and permanent for THIS session -- the report
    # says so explicitly and names exactly which chain was removed and which
    # was kept, so the saved .pse and this report can never be silently out of
    # sync with each other.
    any_reduction = any(structure_data[o].get("chain_reduction_applied") for o in structure_data)
    if any_reduction:
        # The rows come from the rule record, which names every chain kept
        # (the biological assembly rule can keep more than one per cluster).
        reduced = {o: [c for c in (structure_data[o].get("homomer_rule") or {}).get("clusters") or [] if c["removed"]]
                   for o in structure_data}
        asked = all(c.get("decided_by") == "ask" for clusters in reduced.values() for c in clusters)
        html.append("<div class='section'><div class='section-header'><h2>Chain Reductions Applied</h2></div><div class='section-body'>")
        if asked:
            html.append("<p class='muted-note' style='margin-top:0;'>One or more structures contained multiple "
                        "near-identical protein chains (e.g. a homodimer/homotetramer). The user was prompted and "
                        "approved reducing each structure below to a single representative chain BEFORE alignment "
                        "and measurement. The removed chain(s) were deleted from the loaded object and are not "
                        "present in the saved session for this run.</p>")
        else:
            html.append("<p class='muted-note' style='margin-top:0;'>One or more structures contained multiple "
                        "near-identical protein chains (e.g. a homodimer/homotetramer) and were reduced BEFORE "
                        "alignment and measurement, by the rule stated for each in the notes. The removed chain(s) "
                        "were deleted from the loaded object and are not present in the saved session for this "
                        "run.</p>")
        html.append("<div class='table-wrap'><table><tr><th>Structure</th><th>Chain Removed</th><th>Chain Kept</th></tr>")
        for o in structure_data:
            reductions = structure_data[o].get("chain_reduction_applied")
            if not reductions:
                continue
            pid = html_escape.escape(structure_data[o]["pdb_id"])
            # One row per cluster, listing every chain removed from it. A
            # tetramer reduced to one chain otherwise produced three rows that
            # differed only by a letter and read as three separate events.
            rows = [(c["kept"], c["removed"]) for c in reduced[o]]
            if not rows:
                by_kept = {}
                for r in reductions:
                    by_kept.setdefault(r["kept_chain"], []).append(r["removed_chain"])
                rows = [([kept], removed) for kept, removed in by_kept.items()]
            for kept, removed in sorted(rows, key=lambda row: sorted(row[0])):
                html.append(f"<tr><td>{pid}</td><td>{html_escape.escape(', '.join(sorted(removed)))}</td>"
                            f"<td>{html_escape.escape(', '.join(kept))}</td></tr>")
        html.append("</table></div>")
        html.append("</div></div>")

    # Both image maps are keyed by display pid; the ordering helper works in
    # object names, so map one onto the other and fall back to the map's own
    # order for anything it cannot score.
    ref_pid_label = structure_data.get(reference_obj, {}).get("pdb_id", reference_obj)
    _pid_of = {obj: structure_data.get(obj, {}).get("pdb_id", obj) for obj in (results or {})}
    _ranked_pids = [_pid_of[o] for o in _comparison_display_order(
        structure_data, reference_obj, results=results)]

    def _ordered_pids(image_map):
        keys = list(image_map.keys())
        ranked = [p for p in _ranked_pids if p in image_map]
        return ranked + [k for k in keys if k not in ranked]

    # ---------------- Close-up Terminus Views ---------------- Isolated, per-
    # terminus close-ups with the real orientation arrows -- see
    # render_termini_closeups' own docstring for why these are isolated
    # (cmd.create() copies of just the terminus window, not the whole
    # structure) and framed differently from the wide shots below. Displayed
    # first: a direct, unobstructed view of exactly the vectors a TERMINI
    # comparison is actually about, rather than starting with a whole-
    # structure orientation shot.
    if closeup_images:
        html.append("<div class='section'><div class='section-header'><h2>Close-up Terminus Views</h2></div><div class='section-body'>")
        html.append("<p class='muted-note' style='margin-top:0;'>Orientation arrows at each terminus"
                    + _tip("closeup_arrows") + ", with a colour key for each comparison.</p>")
        # Grouped per comparison, best-matching first. With three or more
        # structures an ungrouped grid runs every comparison's close-ups
        # together, and the only thing telling 1XGD-vs-6F7R apart from
        # 1XGD-vs-4JIR is a caption on each tile.
        closeup_order = [pid for pid in _ordered_pids(closeup_images)]
        for pid in closeup_order:
            per_chain_list = closeup_images.get(pid) or []
            # The colour index is the comparison's place among ALL ranked
            # comparisons, which is the index its close-ups were drawn with,
            # not its place among those that happened to produce close-ups.
            arrow_index = _ranked_pids.index(pid) if pid in _ranked_pids else closeup_order.index(pid)
            cmp_n, cmp_c = comparison_arrow_colors(arrow_index)
            ref_n, ref_c = REFERENCE_ARROW_COLORS
            if len(closeup_order) > 1:
                html.append(_image_group_head(
                    f"{html_escape.escape(ref_pid_label)} vs {html_escape.escape(pid)}",
                    "terminus close-ups"))
            html.append(_color_key([_arrow_key_item(ref_pid_label, ref_n, ref_c),
                                    _arrow_key_item(pid, cmp_n, cmp_c)]))
            html.append("<div class='images'>")
            for entry in per_chain_list:
                chain_label = html_escape.escape(entry.get("chain", ""))
                for terminus in ("N", "C"):
                    # entry.get(terminus) is a LIST of image paths --
                    # render_termini_closeups renders two angles per terminus
                    # (see its own docstring), not one.
                    img_paths = entry.get(terminus) or []
                    for angle_idx, img in enumerate(img_paths, start=1):
                        img_path = Path(img)
                        try:
                            rel_path = img_path.relative_to(Path(output_dir))
                        except ValueError:
                            rel_path = img_path
                        angle_note = f" (angle {angle_idx})" if len(img_paths) > 1 else ""
                        caption = f"{html_escape.escape(pid)} &middot; chain {chain_label} &middot; {terminus}-terminus{angle_note}"
                        html.append(f"<div class='image-card'><div class='image-frame'><img src='{html_escape.escape(rel_path.as_posix())}' "
                                    f"alt='{html_escape.escape(img_path.name)}'></div><div class='image-caption'>{caption}</div></div>")
            html.append("</div>")
        html.append("</div></div>")

    # ---------------- Visualizations ----------------
    html.append("<div class='section'><div class='section-header'><h2>Visualizations</h2></div><div class='section-body'>")
    html.append("<p class='muted-note' style='margin-top:0;'>Whole-structure views of each comparison, aligned to the reference. "
                "The orientation arrows are shown in the Close-up Terminus Views section above.</p>")

    obj_of_pid = {str(structure_data[o].get("pdb_id", o)): o for o in structure_data}
    ref_hex = _protein_color_hex(reference_obj, structure_data.get(reference_obj))

    def _pair_key(pid_list):
        items = [_structure_key_item(ref_pid_label, ref_hex, "reference")]
        for one in pid_list:
            o = obj_of_pid.get(str(one))
            if o is not None:
                items.append(_structure_key_item(one, _protein_color_hex(o, structure_data.get(o))))
        return _color_key(items)

    if combined_images:
        html.append(_image_group_head("All structures", "combined view"))
        html.append(_pair_key(_ranked_pids))
        html.append("<div class='images'>")
        for img in combined_images:
            img_path = Path(img)
            view_caption = img_path.stem.replace("view_", "").capitalize()
            html.append(f"<div class='image-card'><div class='image-frame'><img src='{html_escape.escape(img_path.as_posix())}' "
                        f"alt='{html_escape.escape(img_path.name)}'></div><div class='image-caption'>"
                        f"All structures &middot; {html_escape.escape(view_caption)}</div></div>")
        html.append("</div>")
    if visualization_images:
        vis_order = _ordered_pids(visualization_images)
        for pid in vis_order:
            img_list = visualization_images.get(pid) or []
            if len(vis_order) > 1:
                html.append(_image_group_head(
                    f"{html_escape.escape(ref_pid_label)} vs {html_escape.escape(pid)}",
                    "whole structure"))
            html.append(_pair_key([pid]))
            html.append("<div class='images'>")
            for img in img_list:
                img_path = Path(img)
                html.append(f"<div class='image-card'><div class='image-frame'><img src='{html_escape.escape(img_path.as_posix())}' "
                            f"alt='{html_escape.escape(img_path.name)}'></div><div class='image-caption'>"
                            f"{html_escape.escape(pid)} &middot; {html_escape.escape(img_path.stem.replace('view_', '').capitalize())}</div></div>")
            html.append("</div>")
    elif not combined_images:
        html.append("<p class='muted-note'>No visualization images were generated for this run.</p>")
    html.append("</div></div>")

    # ---------------- PyMOL Session ----------------
    # Placed where the single-structure and overlay reports put it: after the
    # images, before the warnings.
    html.append(f"<div class='section'><div class='section-header'><h2>{engine_name()} Session</h2></div><div class='section-body'>")
    if pse_rel:
        html.append(f"<a class='button' href='{html_escape.escape(pse_rel.as_posix())}' download>"
                    f"<span class='icon'>&#8635;</span> Open {engine_name()} Session</a>")
    else:
        html.append("<p class='muted-note'>No session file found.</p>")
    html.append("</div></div>")

    # ---------------- Warnings ----------------
    html.append("<div class='section'><div class='section-header'><h2>Warnings &amp; Structural Notes</h2></div><div class='section-body'>")
    # Same order as the JSON export and the other report types: most
    # consequential first, approved corrections last.
    warnings_list = prioritize_warnings(warnings_list) if warnings_list else warnings_list
    if warnings_list:
        html.append("<div class='warn-list'><ul>")
        for w in warnings_list:
            html.append(f"<li>{html_escape.escape(w)}</li>")
        html.append("</ul></div>")
    else:
        html.append("<div class='no-warn'>No warnings detected.</div>")
    html.append("</div></div>")

    # ---------------- Structural Interpretation ---------------- Dynamically
    # generated from the already-computed per-row metrics
    # (largest_n_disp/largest_c_disp, the same tip-displacement rankings used
    # for the executive summary cards above) -- no separate calculation, just
    # a plain-language readout of results already produced by
    # compare_termini/recompute_terminus_metrics.
    html.append("<div class='section'><div class='section-header'><h2>Structural Interpretation</h2></div><div class='section-body'>")
    disp_candidates = [r for r in (largest_n_disp, largest_c_disp) if r is not None]
    if disp_candidates:
        largest_overall = max(disp_candidates, key=lambda r: r["metrics"]["tip_displacement_angstrom"])
        html.append(f"<p style='margin-top:0;'>Largest observed conformational difference: "
                    f"<strong>{html_escape.escape(largest_overall['comparison_structure'])} "
                    f"{largest_overall['terminus']}-terminus</strong>.</p>")
        # Both termini are listed, each labelled, so the exposure and
        # flexibility statements are attached to a named terminus and the two
        # can be compared directly rather than one being described in prose
        # and the other mentioned only as an aside.
        # One block per comparison, not just the single structure that happened
        # to hold the largest displacement. With three or more structures the
        # previous form described one comparison and left the others with no
        # readout at all, even though each was measured in full.
        by_comparison = {}
        for row in available_rows:
            by_comparison.setdefault(row["comparison_structure"], []).append(row)

        ordered_names = []
        for cmp_obj in _comparison_display_order(structure_data, reference_obj, results=results):
            pid = structure_data.get(cmp_obj, {}).get("pdb_id", cmp_obj)
            if pid in by_comparison:
                ordered_names.append(pid)
        ordered_names += [n for n in by_comparison if n not in ordered_names]

        for index, cmp_name in enumerate(ordered_names):
            rows_for = by_comparison[cmp_name]
            if index:
                html.append("<hr class='interp-divider'>")
            if len(ordered_names) > 1:
                html.append(f"<div class='interp-head'>{html_escape.escape(cmp_name)}</div>")
            html.append("<ul style='margin-top:4px;'>")
            for row in sorted(rows_for, key=lambda r: r["terminus"]):
                html.append(f"<li>{_terminus_interpretation_line(row)}</li>")
            html.append("</ul>")

            # The same exposure comparison as before, now computed from this
            # structure's own two termini rather than from whichever structures
            # happened to hold the largest N and the largest C.
            n_row = next((r for r in rows_for if r["terminus"] == "N"), None)
            c_row = next((r for r in rows_for if r["terminus"] == "C"), None)
            if n_row and c_row:
                n_sasa = n_row["metrics"].get("delta_sasa_angstrom2")
                c_sasa = c_row["metrics"].get("delta_sasa_angstrom2")
                from astra3_structure import SASA_SHIFT_THRESHOLD
                if n_sasa is not None and c_sasa is not None:
                    if abs(n_sasa) <= SASA_SHIFT_THRESHOLD and abs(c_sasa) <= SASA_SHIFT_THRESHOLD:
                        html.append(f"<p>Neither terminus changed solvent exposure by more than "
                                    f"{SASA_SHIFT_THRESHOLD:g} &Aring;&sup2;.</p>")
                    elif abs(n_sasa - c_sasa) < 1.0:
                        html.append("<p>Both termini shifted solvent exposure by a comparable amount.</p>")
                    else:
                        bigger = "N" if abs(n_sasa) > abs(c_sasa) else "C"
                        html.append(f"<p>The larger change in solvent exposure is at the "
                                    f"<strong>{bigger}-terminus</strong> "
                                    f"(N: {n_sasa:+} &Aring;&sup2;, C: {c_sasa:+} &Aring;&sup2;).</p>")
        html.append("<p class='muted-note'>Geometric measurements on aligned coordinates, not evidence of "
                    "altered function. &Delta;Bnorm is a relative comparison only.</p>")
    else:
        html.append("<p class='muted-note' style='margin-top:0;'>No terminus displacement data was available "
                    "to summarize for this run.</p>")
    html.append("</div></div>")

    from astra3_annotations import html_annotation_section
    for _obj, _d in structure_data.items():
        html.extend(html_annotation_section(_d, tip=_tip, title_prefix=f"{_d.get('pdb_id') or _obj}: "))

    html.extend(_input_files_section(structure_data))
    methods_paragraphs, methods_refs = _methods_for("termini", structure_data, command_str, run_parameters,
                                                    reference_obj, None, warnings_list, list(results))
    if methods_paragraphs:
        from astra3_annotations import html_methods_section
        html.extend(html_methods_section(methods_paragraphs, methods_refs))

    append_astra3_citation_footer(html, now)
    html.append("</div>")
    html.append("\n<script>\n/* Every table starts open and can be folded away. Some run long, and a reader\n   scrolling for one section should not have to scroll a full residue table to\n   get past it. Only the body rows fold: the header row stays, so a folded\n   table still says what it was. Applied here rather than at each of the\n   emission sites so no table markup has to change. */\n(function () {\n  var wraps = document.querySelectorAll('.table-wrap');\n  for (var i = 0; i < wraps.length; i++) {\n    (function (wrap) {\n      var table = wrap.querySelector('table');\n      if (!table) return;\n      var bodyRows = table.querySelectorAll('tr').length - 1;\n      if (bodyRows < 1) return;\n      var btn = document.createElement('button');\n      btn.type = 'button';\n      btn.className = 'table-fold-toggle';\n      var arrow = document.createElement('span');\n      arrow.className = 'table-fold-arrow';\n      btn.title = bodyRows + (bodyRows === 1 ? ' row' : ' rows');\n      btn.appendChild(arrow);\n      btn.setAttribute('aria-expanded', 'true');\n      btn.addEventListener('click', function () {\n        var folded = wrap.classList.toggle('is-folded');\n        btn.setAttribute('aria-expanded', folded ? 'false' : 'true');\n      });\n      wrap.appendChild(btn);\n    })(wraps[i]);\n  }\n})();\n/* Printing opens every folded section, structure and table so a printed or\n   PDF report is complete, then restores what the reader had folded. */\n(function () {\n  var reopened = [], unfolded = [];\n  window.addEventListener('beforeprint', function () {\n    var ds = document.querySelectorAll('details:not([open])');\n    for (var i = 0; i < ds.length; i++) { ds[i].open = true; reopened.push(ds[i]); }\n    var ws = document.querySelectorAll('.table-wrap.is-folded');\n    for (var j = 0; j < ws.length; j++) { ws[j].classList.remove('is-folded'); unfolded.push(ws[j]); }\n  });\n  window.addEventListener('afterprint', function () {\n    while (reopened.length) reopened.pop().open = false;\n    while (unfolded.length) unfolded.pop().classList.add('is-folded');\n  });\n})();\n</script>\n")
    html.append("</body></html>")

    try:
        page_html = "\n".join(html)
        page_html = page_html.replace("</body></html>", _info_tip_library(page_html) + "</body></html>")
        with open(html_path, "w", encoding="utf-8") as fh:
            fh.write(page_html)
        print(f"{GREEN}HTML report saved: {html_path}{RESET}", flush=True)
    except Exception as e:
        print(f"{RED}Failed to write HTML report: {e}{RESET}", flush=True)
    return str(html_path)
// ============================================================
// Astra3: the drawing window (renderer/engine.html)
// ============================================================
// Draws each scene the Astra3 Engine hands over and returns it as PNG.
// 3Dmol.js builds the geometry (cartoon, sticks, spheres); the look is
// Astra3's own:
//
//   - PyMOL's camera, taken over exactly: its view matrix and its 20 degree
//     field of view, so images frame structures as PyMOL frames them;
//   - shading by burial: each atom is darkened by how packed its
//     surroundings are (atom density within 10 A, measured on the structure
//     in astra3_engine.py), so pockets and the core read as depth without a
//     screen-space approximation;
//   - depth cue toward the background, as PyMOL fogs, and thin dark
//     outlines of a set pixel width, as ChimeraX's silhouettes and PyMOL's
//     ray_trace_mode 1;
//   - supersampling: drawn at twice the size and reduced with high-quality
//     filtering;
//   - termini arrows drawn from PyMOL's CGO primitives, cones meshed here.
//
// Drawing happens out of sight. The window (off unless chosen in Settings)
// lists the images and shows a 3D view to turn by hand, set to the camera of
// the image chosen in the list, with Reset (back to that camera) and Save
// image (the turned view, drawn like the images).
// ============================================================
"use strict";

(() => {
  const $3D = window.$3Dmol;
  const CAMERA_Z = 150;            // 3Dmol's camera distance from its rotation centre
  const BURIAL_SHADE = 0.15;       // darkest a fully buried atom gets (fraction removed)
  // A gamma curve on the finished image (and the window's 3D view): PyMOL's
  // ray tracer adds ambient and specular light 3Dmol's lighting lacks, so
  // without it shaded sides read darker. 0.8 matches PyMOL's greys and
  // greens and keeps colours saturated, where a lift toward white did not.
  const GAMMA = 0.8;
  const DEPTH_CUE = { fogStart: 0.45, fogEnd: 1.0 };   // PyMOL's fog_start
  // TERMINI close-ups show a few residues; fog over their short depth would
  // wash out the far side, so it starts late and stays light.
  const CLOSEUP_DEPTH_CUE = { fogStart: 0.8, fogEnd: 1.0 };
  const OUTLINE_PX_PER_1200 = 0.7; // outline width in pixels at a 1200-pixel-wide image
  const STICK_RADIUS = 0.25;       // PyMOL's stick_radius
  // Flat strands without arrowheads: 3Dmol's arrowheads are rounded where
  // PyMOL's are cut square, so they are left out rather than drawn unlike.
  const CARTOON = {
    loop: { width: 0.22, thickness: 0.44 },
    strand: { width: 1.45, thickness: 0.42 },
    helix: { width: 1.35, thickness: 0.5, style: "oval" },
  };
  const EDGE_FRACTION = 0.1;       // the band along the 3D view's edges that rotates in plane
  const ROLL_DEGREES_PER_PIXEL = 0.4;
  const MAX_CANVAS = 8192;

  const statusEl = document.getElementById("status");
  const markEl = document.getElementById("mark");
  const liveEl = document.getElementById("live");
  const shotsEl = document.getElementById("shots");
  const stageEl = document.getElementById("stage");
  const hintEl = document.getElementById("hint");
  const toolsEl = document.getElementById("tools");

  let capture = null;      // { viewer, size, key }
  let live = null;         // the window's 3D view: { viewer, key }

  const setStatus = (text, busy) => {
    statusEl.textContent = text;
    markEl.classList.toggle("busy", !!busy);
  };

  // -- colour ---------------------------------------------------------------
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const hex = (rgb) => "#" + rgb.slice(0, 3).map((c) => Math.round(clamp01(c) * 255).toString(16).padStart(2, "0")).join("");
  // Darkens toward a cool shadow rather than toward grey, so buried colours
  // keep their hue.
  const shaded = (rgb, burial) => {
    const k = 1 - BURIAL_SHADE * clamp01(burial || 0);
    return [rgb[0] * k, rgb[1] * k, rgb[2] * (k + (1 - k) * 0.12)];
  };
  const TONE = (() => {
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i += 1) lut[i] = Math.round(255 * Math.pow(i / 255, GAMMA));
    return lut;
  })();

  // -- camera ---------------------------------------------------------------
  // PyMOL's view: elements 0-8 the model-to-camera rotation (column-major),
  // 9-11 the camera position relative to the rotation origin, 12-14 the
  // origin. 3Dmol places a point at R (v + modelGroup) + rotationGroup and
  // looks from z = CAMERA_Z, so the two agree when modelGroup = -origin and
  // rotationGroup = camera position + (0, 0, CAMERA_Z).
  function quaternion(m) {
    const [r00, r01, r02, r10, r11, r12, r20, r21, r22] = m;
    const trace = r00 + r11 + r22;
    let x, y, z, w;
    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1.0);
      w = 0.25 / s; x = (r21 - r12) * s; y = (r02 - r20) * s; z = (r10 - r01) * s;
    } else if (r00 > r11 && r00 > r22) {
      const s = 2.0 * Math.sqrt(1.0 + r00 - r11 - r22);
      w = (r21 - r12) / s; x = 0.25 * s; y = (r01 + r10) / s; z = (r02 + r20) / s;
    } else if (r11 > r22) {
      const s = 2.0 * Math.sqrt(1.0 + r11 - r00 - r22);
      w = (r02 - r20) / s; x = (r01 + r10) / s; y = 0.25 * s; z = (r12 + r21) / s;
    } else {
      const s = 2.0 * Math.sqrt(1.0 + r22 - r00 - r11);
      w = (r10 - r01) / s; x = (r02 + r20) / s; y = (r12 + r21) / s; z = 0.25 * s;
    }
    return [x, y, z, w];
  }
  function applyCamera(viewer, job) {
    const v = job.view;
    // Row-major model-to-camera rotation from PyMOL's column-major storage.
    const rotation = [v[0], v[3], v[6], v[1], v[4], v[7], v[2], v[5], v[8]];
    const [qx, qy, qz, qw] = quaternion(rotation);
    const radius = Math.max(job.radius || 10, 1) + 4;
    viewer.setSlab(-radius, radius);
    viewer.setView([-v[12], -v[13], -v[14], CAMERA_Z + v[11], qx, qy, qz, qw, v[9], v[10]]);
  }

  // -- drawing objects --------------------------------------------------------
  const xyz = (p) => ({ x: p[0], y: p[1], z: p[2] });
  function addCone(viewer, base, tip, radius, rgb) {
    const axis = [tip[0] - base[0], tip[1] - base[1], tip[2] - base[2]];
    const length = Math.hypot(...axis) || 1;
    const a = axis.map((c) => c / length);
    const helper = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
    const norm = (p) => { const n = Math.hypot(...p) || 1; return p.map((c) => c / n); };
    const u = norm(cross(a, helper));
    const w = cross(a, u);
    const segments = 32;
    const vertexArr = [];
    const normalArr = [];
    const faceArr = [];
    const slope = radius / length;
    for (let i = 0; i < segments; i += 1) {
      const t0 = (2 * Math.PI * i) / segments;
      const t1 = (2 * Math.PI * (i + 1)) / segments;
      const rim = (t) => base.map((b, k) => b + radius * (Math.cos(t) * u[k] + Math.sin(t) * w[k]));
      const side = (t) => norm(u.map((_, k) => Math.cos(t) * u[k] + Math.sin(t) * w[k] + slope * a[k]));
      const start = vertexArr.length;
      // Side triangle, then the base.
      [rim(t0), rim(t1), tip].forEach((p) => vertexArr.push(xyz(p)));
      [side(t0), side(t1), side((t0 + t1) / 2)].forEach((n) => normalArr.push(xyz(n)));
      faceArr.push(start, start + 1, start + 2);
      [rim(t1), rim(t0), base].forEach((p) => vertexArr.push(xyz(p)));
      for (let k = 0; k < 3; k += 1) normalArr.push(xyz(a.map((c) => -c)));
      faceArr.push(start + 3, start + 4, start + 5);
    }
    viewer.addCustom({ vertexArr, normalArr, faceArr, color: hex(rgb) });
  }
  function addPrimitives(viewer, cgo) {
    for (const p of cgo || []) {
      if (p.type === "cylinder") {
        viewer.addCylinder({ start: xyz(p.from), end: xyz(p.to), radius: p.radius, color: hex(p.color), fromCap: 1, toCap: 1 });
      } else if (p.type === "cone") {
        addCone(viewer, p.from, p.to, p.radius, p.color);
      } else if (p.type === "sphere") {
        viewer.addSphere({ center: xyz(p.center), radius: p.radius, color: hex(p.color) });
      } else if (p.type === "line") {
        viewer.addCylinder({ start: xyz(p.from), end: xyz(p.to), radius: 0.06, color: hex(p.color) });
      }
    }
  }

  // -- the scene -------------------------------------------------------------
  function sceneKey(job, pdbs) {
    return JSON.stringify([pdbs, job.structures.map((s) => [s.colors, s.burial, s.sticks, s.spheres, s.labels]),
      job.palette, job.cgo, job.background, job.opaque, !!job.closeup]);
  }
  function build(viewer, job, pdbs) {
    viewer.clear();
    job.structures.forEach((structure, k) => {
      const model = viewer.addModel(pdbs[k], "pdb", { keepH: true });
      const colorOf = (atom) => {
        const i = atom.serial - 1;
        const rgb = job.palette[String(structure.colors[i])] || [0.5, 0.5, 0.5];
        return hex(shaded(rgb, structure.burial ? structure.burial[i] : 0));
      };
      // PyMOL's cartoon proportions: loops a round 0.2 A tube, strands a
      // flat arrow, helices an oval ribbon (half-widths in A).
      model.setStyle({}, { cartoon: { colorfunc: colorOf, ...CARTOON.loop } });
      model.setStyle({ ss: "s" }, { cartoon: { colorfunc: colorOf, ...CARTOON.strand } });
      model.setStyle({ ss: "h" }, { cartoon: { colorfunc: colorOf, ...CARTOON.helix } });
      const sticks = [];
      for (const [a, b] of structure.sticks || []) for (let s = a; s <= b; s += 1) sticks.push(s);
      if (sticks.length) model.setStyle({ serial: sticks }, { stick: { radius: STICK_RADIUS, colorfunc: colorOf } }, true);
      for (const [serial, radius] of structure.spheres || []) {
        model.setStyle({ serial }, { sphere: { radius, colorfunc: colorOf } }, true);
      }
    });
    addPrimitives(viewer, job.cgo);
    addLabels(viewer, job);
    viewer.enableFog(job.closeup ? CLOSEUP_DEPTH_CUE : DEPTH_CUE);
    viewer.zoomTo();
  }
  // Session labels at their atoms: black, no background, sized like PyMOL's
  // (job.label_fraction of the image height). 3Dmol sizes labels in canvas
  // pixels.
  function addLabels(viewer, job) {
    const pixelsHigh = viewer.getCanvas().clientHeight || 480;
    const fontSize = Math.max(8, Math.round(pixelsHigh * (job.label_fraction || 14 / 480)));
    for (const structure of job.structures) {
      for (const label of structure.labels || []) {
        viewer.addLabel(label.text, {
          position: xyz(label.xyz), fontSize, fontColor: "black", backgroundOpacity: 0,
          alignment: "center", inFront: true,
        });
      }
    }
  }
  // 3Dmol measures outline width in model units (A); converted here from
  // pixels at the camera's distance, so the outline is the same few pixels
  // whatever the zoom: about 1 px at 1200 px wide, in proportion above.
  function outline(viewer, job, pixelsHigh, pixels, cameraDistance) {
    const distance = Math.max(1, cameraDistance || -job.view[11]);
    const fov = ((job.fov || 20) * Math.PI) / 180;
    const angstromPerPixel = (2 * distance * Math.tan(fov / 2)) / Math.max(1, pixelsHigh);
    viewer.setViewStyle({ style: "outline", color: "black", width: pixels * angstromPerPixel });
  }

  // -- full-size image -------------------------------------------------------
  function captureViewer(job, scale) {
    const [w, h] = job.size;
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.round((w * scale) / dpr);
    const cssH = Math.round((h * scale) / dpr);
    const background = job.background || [1, 1, 1];
    const sizeKey = `${cssW}x${cssH}:${job.opaque ? 1 : 0}`;
    if (!capture || capture.size !== sizeKey) {
      stageEl.innerHTML = "";
      const box = document.createElement("div");
      box.style.cssText = `position:relative;width:${cssW}px;height:${cssH}px`;
      stageEl.appendChild(box);
      const viewer = $3D.createViewer(box, {
        backgroundColor: hex(background), backgroundAlpha: job.opaque ? 1 : 0, antialias: true, upscale: false,
      });
      capture = { viewer, size: sizeKey, key: null };
    }
    capture.viewer.setBackgroundColor(hex(background), job.opaque ? 1 : 0);
    return capture;
  }

  function toPng(canvas, w, h) {
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const ctx = out.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, w, h);
    const image = ctx.getImageData(0, 0, w, h);
    const d = image.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = TONE[d[i]];
      d[i + 1] = TONE[d[i + 1]];
      d[i + 2] = TONE[d[i + 2]];
    }
    ctx.putImageData(image, 0, 0);
    return out.toDataURL("image/png");
  }

  // True when nothing was drawn at all (every pixel transparent).
  function isEmpty(canvas) {
    const probe = document.createElement("canvas");
    probe.width = 64;
    probe.height = 48;
    const ctx = probe.getContext("2d");
    ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, 64, 48);
    const data = ctx.getImageData(0, 0, 64, 48).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return false;
    return true;
  }

  function draw(job, pdbs, retried) {
    const [w, h] = job.size;
    const scale = Math.max(1, Math.min(2, Math.floor(MAX_CANVAS / Math.max(w, h))));
    const slot = captureViewer(job, scale);
    const key = sceneKey(job, pdbs);
    if (slot.key !== key) {
      build(slot.viewer, job, pdbs);
      slot.key = key;
    }
    outline(slot.viewer, job, h, OUTLINE_PX_PER_1200 * Math.max(1, w / 1200));
    applyCamera(slot.viewer, job);
    slot.viewer.render();
    // A drawing surface that was not ready gives an empty image; it is made
    // again once rather than saved blank.
    if (!retried && !job.opaque && pdbs.some((p) => p && p.length) && isEmpty(slot.viewer.getCanvas())) {
      stageEl.innerHTML = "";
      capture = null;
      return draw(job, pdbs, true);
    }
    return toPng(slot.viewer.getCanvas(), w, h);
  }

  // -- the window --------------------------------------------------------------
  // The window is optional (Settings > Astra3 Engine) and hidden by default;
  // images are drawn the same either way. When it is shown, the 3D view
  // follows each image as it is drawn, and choosing an image in the list
  // turns the view to that image's camera.
  const THEMES = {
    dark: { background: "#0F1216" },
    light: { background: "#F6F7F9" },
  };
  let visible = false;
  let theme = "dark";
  let showing = null;      // the shot in the 3D view
  let runCount = 0;        // images since the structures last changed
  let runKey = null;
  const scenes = new Map(); // scene key -> { job, pdbs, uses }
  const shots = [];

  function thumbnail(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const w = 320;
        const h = Math.max(1, Math.round((img.height / img.width) * w));
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/png"));
      };
      img.onerror = () => resolve(url);
      img.src = url;
    });
  }

  function liveViewer() {
    if (!live) {
      const box = document.createElement("div");
      box.style.cssText = "position:absolute;inset:0";
      liveEl.prepend(box);
      live = { viewer: $3D.createViewer(box, { backgroundColor: THEMES[theme].background, antialias: true }), key: null };
    }
    return live;
  }

  function show(shot) {
    showing = shot;
    shotsEl.querySelectorAll(".shot").forEach((b) => b.classList.toggle("on", b.dataset.id === String(shot.id)));
    hintEl.hidden = false;
    toolsEl.hidden = false;
    if (!visible) return;
    const scene = scenes.get(shot.key);
    if (!scene) return;
    const slot = liveViewer();
    if (slot.key !== shot.key) {
      build(slot.viewer, scene.job, scene.pdbs);
      slot.key = shot.key;
    }
    applyCamera(slot.viewer, shot.job);
    outline(slot.viewer, shot.job, liveEl.clientHeight, OUTLINE_PX_PER_1200);
    slot.viewer.render();
  }

  // Reset: back to the camera of the image in the view.
  function resetView() {
    if (showing) show(showing);
  }

  // Save image: the view as it is now, turned or zoomed, drawn like the
  // images themselves (full size, supersampled, outlined) and saved as PNG.
  async function saveView() {
    if (!showing || !live || !visible) return;
    const scene = scenes.get(showing.key);
    if (!scene) return;
    const job = showing.job;
    const [w, h] = job.size;
    const scale = Math.max(1, Math.min(2, Math.floor(MAX_CANVAS / Math.max(w, h))));
    const slot = captureViewer(job, scale);
    if (slot.key !== showing.key) {
      build(slot.viewer, scene.job, scene.pdbs);
      slot.key = showing.key;
    }
    applyCamera(slot.viewer, job);
    const view = live.viewer.getView();
    slot.viewer.setView(view);
    outline(slot.viewer, job, h, OUTLINE_PX_PER_1200 * Math.max(1, w / 1200), CAMERA_Z - view[3]);
    slot.viewer.render();
    const url = toPng(slot.viewer.getCanvas(), w, h);
    const name = `${(showing.title.split(": ").pop() || "view").replace(/\.png$/i, "")}_turned.png`;
    const saved = await window.astra3Engine.save({ png: url.slice(url.indexOf(",") + 1), name, near: showing.output, title: showing.title });
    if (saved) setStatus(`Saved ${saved}`, false);
  }

  // Dragging along the view's outer edge turns the structure in the plane
  // of the screen, as in Astra3's 3D Viewer; the rest of the view orbits.
  function edgeRoll() {
    let rolling = false;
    let axis = "vertical";
    let sign = 1;
    let last = null;
    liveEl.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || !live || e.target.closest(".tools")) return;
      const rect = liveEl.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const mx = rect.width * EDGE_FRACTION;
      const my = rect.height * EDGE_FRACTION;
      const onLeft = x < mx;
      const onRight = x > rect.width - mx;
      const onTop = y < my;
      const onBottom = y > rect.height - my;
      if (!onLeft && !onRight && !onTop && !onBottom) return;
      const depthX = onLeft ? x : onRight ? rect.width - x : Infinity;
      const depthY = onTop ? y : onBottom ? rect.height - y : Infinity;
      if (depthX <= depthY) {
        axis = "vertical";
        sign = onRight ? -1 : 1;
      } else {
        axis = "horizontal";
        sign = onBottom ? 1 : -1;
      }
      rolling = true;
      last = { x: e.clientX, y: e.clientY };
      e.stopPropagation();
      e.preventDefault();
    }, true);
    window.addEventListener("mousemove", (e) => {
      if (!rolling || !live) return;
      const travel = axis === "vertical" ? e.clientY - last.y : e.clientX - last.x;
      last = { x: e.clientX, y: e.clientY };
      const delta = travel * ROLL_DEGREES_PER_PIXEL * sign;
      if (!delta) return;
      live.viewer.rotate(delta, "vz");
      live.viewer.render();
      e.stopPropagation();
      e.preventDefault();
    }, true);
    window.addEventListener("mouseup", () => { rolling = false; }, true);
  }

  function forget(shot) {
    const scene = scenes.get(shot.key);
    if (scene && --scene.uses <= 0) scenes.delete(shot.key);
  }

  function addShot(job, pdbs, key, thumb, seconds) {
    if (!scenes.has(key)) scenes.set(key, { job, pdbs, uses: 0 });
    scenes.get(key).uses += 1;
    const shot = {
      id: shots.length ? shots[0].id + 1 : 1, key, job, seconds,
      title: job.title || "image", output: job.output,
    };
    shots.unshift(shot);
    if (shotsEl.querySelector(".empty")) shotsEl.innerHTML = "";
    const group = currentGroup || startGroup("");
    const button = document.createElement("button");
    button.className = "shot";
    button.type = "button";
    button.dataset.id = String(shot.id);
    button.draggable = true;
    button.title = "Show this view. Drag the image out to copy the file.";
    const img = document.createElement("img");
    img.src = thumb;
    img.draggable = false;
    const meta = document.createElement("div");
    meta.className = "meta";
    const name = document.createElement("span");
    name.textContent = shot.title;
    const time = document.createElement("span");
    time.textContent = seconds == null ? `${job.size[0]}×${job.size[1]}` : `${job.size[0]}×${job.size[1]} · ${seconds.toFixed(1)} s`;
    meta.append(name, time);
    button.append(img, meta);
    button.addEventListener("click", () => {
      show(shot);
      setStatus(`Showing ${shot.title} (${job.size[0]} × ${job.size[1]})`, false);
    });
    button.addEventListener("dragstart", (event) => {
      event.preventDefault();
      if (shot.output) window.astra3Engine.drag(shot.output);
    });
    shot.button = button;
    group.items.prepend(button);
    while (shots.length > 60) {
      const old = shots.pop();
      forget(old);
      const items = old.button.parentElement;
      old.button.remove();
      if (items && !items.children.length && items.parentElement !== currentGroup?.el) items.parentElement.remove();
    }
    return shot;
  }

  // Each analysis is its own group in the list, newest first, headed by its
  // command; images go into the group of the run that made them.
  let currentGroup = null;
  function startGroup(label) {
    if (shotsEl.querySelector(".empty")) shotsEl.innerHTML = "";
    const el = document.createElement("section");
    el.className = "run";
    const head = document.createElement("h3");
    head.textContent = label || "Images";
    const items = document.createElement("div");
    el.append(head, items);
    shotsEl.prepend(el);
    if (currentGroup && !currentGroup.items.children.length) currentGroup.el.remove();
    currentGroup = { el, items };
    return currentGroup;
  }

  // A new analysis: the last run's scene leaves the 3D view, and its images
  // start a new group.
  window.astra3Engine.onRun(({ label }) => {
    startGroup(label);
    showing = null;
    runKey = null;
    runCount = 0;
    toolsEl.hidden = true;
    if (live) {
      live.viewer.clear();
      live.key = null;
      live.viewer.render();
    }
    setStatus(`Waiting for the first image of ${label}`, false);
  });

  // The 3D view follows the window's size; without this its drawing surface
  // keeps the size it had when the window was hidden or minimized, and the
  // view looks frozen.
  const refit = () => {
    if (!live) return;
    live.viewer.resize();
    live.viewer.render();
  };
  new ResizeObserver(refit).observe(liveEl);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refit(); });

  edgeRoll();
  document.getElementById("reset").addEventListener("click", resetView);
  document.getElementById("save").addEventListener("click", () => { saveView().catch(() => {}); });

  window.astra3Engine.onStatus((status) => {
    if (status.theme && THEMES[status.theme] && status.theme !== theme) {
      theme = status.theme;
      document.documentElement.dataset.theme = theme;
      if (live) {
        live.viewer.setBackgroundColor(THEMES[theme].background, 1);
        live.viewer.render();
      }
    }
    if (typeof status.visible === "boolean") {
      const wasVisible = visible;
      visible = status.visible;
      if (visible && !wasVisible && showing) show(showing);
      else if (visible) refit();
    }
  });

  // An image PyMOL or ChimeraX drew, with the scene it was drawn from.
  window.astra3Engine.onShow(async ({ job, pdbs, png }) => {
    const url = `data:image/png;base64,${png}`;
    const key = sceneKey(job, pdbs);
    if (key !== runKey) {
      runKey = key;
      runCount = 0;
    }
    runCount += 1;
    const names = job.structures.map((st) => st.name).filter(Boolean).join(", ");
    const shot = addShot(job, pdbs, key, await thumbnail(url), null);
    show(shot);
    setStatus(`Added ${shot.title} · ${runCount} image${runCount === 1 ? "" : "s"}${names ? ` of ${names}` : ""}`, false);
  });

  window.astra3Engine.onJob(({ id, job, pdbs }) => {
    setStatus(`Drawing ${job.title || "image"} (${job.size[0]} × ${job.size[1]})`, true);
    const started = performance.now();
    // Let the status paint before the work starts.
    setTimeout(async () => {
      let url;
      try {
        url = draw(job, pdbs);
      } catch (e) {
        setStatus(`Could not draw ${job.title || "image"}: ${(e && e.message) || e}`, false);
        window.astra3Engine.finish(id, { ok: false, error: String((e && e.message) || e) });
        return;
      }
      const seconds = (performance.now() - started) / 1000;
      window.astra3Engine.finish(id, { ok: true, png: url.slice(url.indexOf(",") + 1) });
      const key = capture.key;
      if (key !== runKey) {
        runKey = key;
        runCount = 0;
      }
      runCount += 1;
      const names = job.structures.map((s) => s.name).filter(Boolean).join(", ");
      const shot = addShot(job, pdbs, key, await thumbnail(url), seconds);
      show(shot);
      setStatus(`Drew ${shot.title} in ${seconds.toFixed(1)} s · ${runCount} image${runCount === 1 ? "" : "s"}${names ? ` of ${names}` : ""}`, false);
    }, 16);
  });
  window.astra3Engine.ready();
})();

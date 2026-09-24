// Hero visual: real structures drawn as cartoons with 3Dmol.js, the same
// library Astra3's own viewer uses. The library and the coordinate files are
// served from this site (public/vendor, public/models), so nothing is
// requested from anywhere else. Coordinates are backbone-only copies of the
// PDB entries with their helix and sheet records.
const STRUCTURES = [
  // The 1ERJ and 3FXI copies are rigidly rotated (no mirroring) so each
  // faces the viewer broadside. zoom < 1 leaves a margin so a structure
  // never reaches the captions while it turns.
  { file: 'models/1erj-c.pdb', label: 'PDB 1ERJ · TUP1 WD40 DOMAIN', axis: 'z', speed: 0.35, zoom: 0.9 },
  { file: 'models/1ake-a.pdb', label: 'PDB 1AKE · ADENYLATE KINASE', axis: 'y', speed: 0.45, zoom: 0.85 },
  { file: 'models/3fxi.pdb', label: 'PDB 3FXI · TLR4 · MD-2 COMPLEX', axis: 'y', speed: 0.4, zoom: 0.9 },
];
// Astra3's render colours: grey chains, green N-terminus, red C-terminus.
const GREY = '#a3a9b3', N_COLOUR = '#3ecf6a', C_COLOUR = '#ef4b3f', WINDOW = 10;
const HOLD_MS = 14000, FADE_MS = 700;

function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }
  catch { return false; }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.$3Dmol) return resolve();
    const s = document.createElement('script');
    s.src = src; s.async = true; s.onload = () => resolve(); s.onerror = reject;
    document.head.appendChild(s);
  });
}

function styleModel(viewer, model) {
  viewer.setStyle({}, { cartoon: { color: GREY, thickness: 0.35 } });
  const chains = {};
  for (const a of model.selectedAtoms({})) {
    const c = chains[a.chain] || (chains[a.chain] = { min: Infinity, max: -Infinity });
    c.min = Math.min(c.min, a.resi); c.max = Math.max(c.max, a.resi);
  }
  for (const [chain, { min, max }] of Object.entries(chains)) {
    viewer.setStyle({ chain, resi: `${min}-${min + WINDOW - 1}` }, { cartoon: { color: N_COLOUR, thickness: 0.35 } });
    viewer.setStyle({ chain, resi: `${max - WINDOW + 1}-${max}` }, { cartoon: { color: C_COLOUR, thickness: 0.35 } });
  }
}

/** Returns false when WebGL is unavailable, so the caller can fall back. */
export async function initHero3D(host, labelEl, countEl, base, reduceMotion) {
  if (!webglAvailable()) return false;
  try { await loadScript(`${base}vendor/3Dmol-min.js`); } catch { return false; }
  const $3Dmol = window.$3Dmol;
  const viewer = $3Dmol.createViewer(host, { backgroundAlpha: 0, antialias: true, cartoonQuality: 12 });
  viewer.setBackgroundColor(0x000000, 0);
  const cache = {};
  let index = 0, visible = true, spinning = false;

  const setSpin = (on) => {
    const want = on && !reduceMotion;
    const s = STRUCTURES[index];
    if (want) viewer.spin(s.axis, s.speed); else if (spinning) viewer.spin(false);
    spinning = want;
  };

  async function show(i) {
    const s = STRUCTURES[i];
    const text = cache[s.file] || (cache[s.file] = await (await fetch(base + s.file)).text());
    viewer.clear();
    const model = viewer.addModel(text, 'pdb');
    styleModel(viewer, model);
    viewer.zoomTo();
    viewer.zoom(s.zoom || 0.85);
    viewer.render();
    labelEl.textContent = s.label;
    countEl.textContent = `${String(i + 1).padStart(2, '0')} / ${String(STRUCTURES.length).padStart(2, '0')}`;
  }

  await show(0);
  host.classList.add('ready');
  setSpin(true);

  new IntersectionObserver(([e]) => { visible = e.isIntersecting; setSpin(visible); }).observe(host);
  addEventListener('resize', () => { viewer.resize(); viewer.render(); }, { passive: true });

  if (!reduceMotion) {
    setInterval(async () => {
      if (!visible || document.hidden) return;
      host.classList.remove('ready');
      await new Promise((r) => setTimeout(r, FADE_MS));
      index = (index + 1) % STRUCTURES.length;
      await show(index);
      setSpin(visible);
      host.classList.add('ready');
    }, HOLD_MS);
  }
  return true;
}

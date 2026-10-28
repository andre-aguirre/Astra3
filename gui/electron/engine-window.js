// ============================================================
// Astra3: the Astra3 Engine's drawing side (Electron main process)
// ============================================================
// The Astra3 Engine (engine/astra3-engine.js) runs the analysis in its own
// process and hands each image over as a job: a JSON file in a folder this
// module watches (python/astra3_engine.py writes it). The scene is drawn in
// the drawing window (renderer/engine.html), hidden unless chosen in
// Settings, written as PNG, and answered with a .done file beside the job. The same folder carries the
// engine's other requests to the app (showing a folder).
//
// Under PyMOL and ChimeraX, the program draws each image itself and the
// scene is handed over afterwards ("show" jobs, python/astra3_window.py),
// only while the window is set to show: a "window.on" file in the folder
// says so.
//
// Files rather than a pipe, as with ChimeraX's helper: the engine's
// standard input and output already carry Astra3's own console.
// ============================================================

const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { BrowserWindow, app, dialog, ipcMain, nativeImage, shell } = require("electron");

const POLL_MS = 80;
const JOB_TIMEOUT_MS = 5 * 60 * 1000;

// -- PNG text chunks ------------------------------------------------------
// Each image carries its scene (camera, field of view, structures, size and
// engine) in a PNG text chunk, so the exact view can be read back from the
// image itself.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
// iTXt (UTF-8, compressed) chunks placed right after the header chunk.
function withText(png, entries) {
  const ihdrEnd = 8 + 4 + 4 + 13 + 4;
  const chunks = entries.map(([keyword, text]) => pngChunk("iTXt", Buffer.concat([
    Buffer.from(keyword, "latin1"), Buffer.from([0, 1, 0, 0, 0]), zlib.deflateSync(Buffer.from(text, "utf-8")),
  ])));
  return Buffer.concat([png.subarray(0, ihdrEnd), ...chunks, png.subarray(ihdrEnd)]);
}

class EngineRenderer {
  constructor({ getShowWindow, getVersion }) {
    this.getShowWindow = getShowWindow || (() => false);
    this.getVersion = getVersion || (() => "");
    this.theme = "dark";
    this.written = new Set(); // images this window drew, the only files it may drag out
    this.window = null;
    this.windowReady = null;
    this.pending = new Map(); // job id -> { resolve, timer }
    this.nextId = 1;
    this.jobsDir = null;
    this.timer = null;
    this.busy = false;
    ipcMain.on("engine:done", (_event, id, result) => {
      const waiting = this.pending.get(id);
      if (!waiting) return;
      clearTimeout(waiting.timer);
      this.pending.delete(id);
      waiting.resolve(result || { ok: false, error: "no answer" });
    });
    // Save image: the window's current view, drawn like the images.
    ipcMain.handle("engine:save", async (event, payload) => {
      if (!this.window || event.sender !== this.window.webContents || !payload || typeof payload.png !== "string") return null;
      const near = typeof payload.near === "string" && this.written.has(payload.near) ? path.dirname(payload.near) : app.getPath("pictures");
      const name = String(payload.name || "view.png").replace(/[\\/:*?"<>|]/g, "_");
      const { canceled, filePath } = await dialog.showSaveDialog(this.window, {
        title: "Save image", defaultPath: path.join(near, name), filters: [{ name: "PNG image", extensions: ["png"] }],
      });
      if (canceled || !filePath) return null;
      fs.writeFileSync(filePath, withText(Buffer.from(payload.png, "base64"), [
        ["Software", `Astra3 Engine ${this.getVersion()}`.trim()],
        ["Title", String(payload.title || "")],
      ]));
      return path.basename(filePath);
    });
    ipcMain.on("engine:drag", (event, file) => {
      if (!this.window || event.sender !== this.window.webContents) return;
      if (typeof file !== "string" || !this.written.has(file) || !fs.existsSync(file)) return;
      const icon = nativeImage.createFromPath(file);
      event.sender.startDrag({ file, icon: icon.isEmpty() ? icon : icon.resize({ width: 96 }) });
    });
  }

  // A fresh, private folder for one engine process's jobs.
  newJobsDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "astra3_engine_jobs_"));
  }

  watch(jobsDir) {
    this.stop();
    this.jobsDir = jobsDir;
    this.markShown();
    this.timer = setInterval(() => this.poll(), POLL_MS);
  }

  // The marker PyMOL and ChimeraX runs check before handing a scene over.
  markShown() {
    if (!this.jobsDir) return;
    const marker = path.join(this.jobsDir, "window.on");
    try {
      if (this.getShowWindow()) fs.writeFileSync(marker, "1");
      else fs.rmSync(marker, { force: true });
    } catch { /* the folder is gone with its run */ }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.jobsDir) {
      // Synchronous, so it also finishes when the app is quitting.
      try { fs.rmSync(this.jobsDir, { recursive: true, force: true }); } catch { /* still in use; it is in the temp folder */ }
    }
    this.jobsDir = null;
  }

  async poll() {
    if (this.busy || !this.jobsDir) return;
    let names;
    try {
      names = fs.readdirSync(this.jobsDir).filter((n) => n.endsWith(".json")).sort();
    } catch {
      return;
    }
    if (!names.length) return;
    this.busy = true;
    const dir = this.jobsDir;
    try {
      for (const name of names) {
        const jobPath = path.join(dir, name);
        const donePath = jobPath.slice(0, -5) + ".done";
        if (fs.existsSync(donePath)) continue;
        if (name.startsWith("show_")) {
          // Nobody waits on these: shown if the window is, then removed.
          let job = null;
          try {
            job = JSON.parse(fs.readFileSync(jobPath, "utf-8"));
            await this.show(job);
          } catch { /* a scene that cannot be shown is skipped */ }
          fs.rmSync(jobPath, { force: true });
          if (job && typeof job.files === "string" && path.dirname(job.files) === dir) {
            fs.rmSync(job.files, { recursive: true, force: true });
          }
          continue;
        }
        let reply;
        try {
          const job = JSON.parse(fs.readFileSync(jobPath, "utf-8"));
          reply = await this.run(job);
        } catch (e) {
          reply = { ok: false, error: (e && e.message) || String(e) };
        }
        const temp = donePath + ".tmp";
        fs.writeFileSync(temp, JSON.stringify(reply));
        fs.renameSync(temp, donePath);
      }
    } finally {
      this.busy = false;
    }
  }

  async run(job) {
    if (job.kind === "open") {
      const error = await shell.openPath(job.path);
      return error ? { ok: false, error } : { ok: true };
    }
    if (job.kind !== "image") return { ok: false, error: `Unknown request: ${job.kind}` };
    const pdbs = job.structures.map((s) => fs.readFileSync(s.pdb, "utf-8"));
    const started = Date.now();
    const result = await this.draw(job, pdbs);
    if (!result.ok) return result;
    this.reshowIfPending();
    const png = Buffer.from(result.png, "base64");
    const scene = {
      engine: "Astra3 Engine", version: this.getVersion(), title: job.title, size: job.size,
      view: job.view, fieldOfView: job.fov, structures: job.structures.map((s) => s.name),
    };
    fs.writeFileSync(job.output, withText(png, [
      ["Software", `Astra3 Engine ${this.getVersion()}`.trim()],
      ["Astra3 scene", JSON.stringify(scene)],
    ]));
    this.written.add(job.output);
    return { ok: true, seconds: (Date.now() - started) / 1000 };
  }

  // An image PyMOL or ChimeraX drew: listed in the window with its scene.
  async show(job) {
    if (!this.getShowWindow()) return;
    const pdbs = job.structures.map((s) => fs.readFileSync(s.pdb, "utf-8"));
    const png = fs.readFileSync(job.output).toString("base64");
    this.written.add(job.output);
    await this.ensureWindow();
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents.send("engine:show", { job, pdbs, png });
    this.reshowIfPending();
  }

  ensureWindow() {
    if (this.window && !this.window.isDestroyed()) return this.windowReady;
    const show = !!this.getShowWindow();
    this.creating = true;
    this.window = new BrowserWindow({
      width: 980,
      height: 720,
      minWidth: 640,
      minHeight: 480,
      title: "Astra3 Drawing",
      show,
      backgroundColor: this.theme === "light" ? "#F6F7F9" : "#0F1216",
      webPreferences: {
        preload: path.join(__dirname, "engine-preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    this.creating = false;
    if (show) this.window.showInactive();
    this.windowReady = new Promise((resolve) => ipcMain.once("engine:ready", () => {
      this.sendStatus();
      if (this.runLabel) this.window.webContents.send("engine:run", { label: this.runLabel });
      resolve();
    }));
    // The 3D view redraws whenever the window is back on screen.
    for (const name of ["show", "restore", "focus"]) this.window.on(name, () => this.sendStatus());
    // Closing the window hides it; drawing goes on in the background, and
    // the next analysis brings it back (see analysisStarted).
    this.window.on("close", (event) => {
      event.preventDefault();
      this.setVisible(false);
    });
    this.window.on("closed", () => {
      this.window = null;
      // Images still being drawn are answered, so the engine is never left waiting.
      for (const [id, waiting] of this.pending) {
        clearTimeout(waiting.timer);
        waiting.resolve({ ok: false, error: "The drawing window was closed while drawing." });
        this.pending.delete(id);
      }
    });
    this.window.loadFile(path.join(__dirname, "..", "renderer", "engine.html"));
    return this.windowReady;
  }

  async draw(job, pdbs) {
    await this.ensureWindow();
    const id = this.nextId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, error: "The image took too long to draw." });
      }, JOB_TIMEOUT_MS);
      this.pending.set(id, { resolve, timer });
      this.window.webContents.send("engine:job", { id, job, pdbs });
    });
  }

  sendStatus() {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents.send("engine:status", { visible: this.window.isVisible(), theme: this.theme });
  }

  // Shows or hides the window (Settings > Astra3 Engine), if it is open.
  setVisible(visible) {
    this.markShown();
    if (!this.window || this.window.isDestroyed()) return;
    if (visible) this.window.showInactive();
    else this.window.hide();
    this.sendStatus();
  }

  // A new analysis. Its images start a new group in the window, the last
  // run's scene is cleared, and a window closed or minimized during the last
  // run comes back with this run's first image -- not before, so it is not
  // in front of any question the run asks first.
  analysisStarted(command) {
    if (!this.getShowWindow()) return;
    this.reshowPending = true;
    // Kept for a window opened later in this run, so its group is named too.
    this.runLabel = String(command || "").split(/\s+/).filter((t) => t && !t.startsWith("-")).join(" ");
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents.send("engine:run", { label: this.runLabel });
  }

  // Called once an image is in the window.
  reshowIfPending() {
    if (!this.reshowPending || !this.window || this.window.isDestroyed()) return;
    this.reshowPending = false;
    if (!this.getShowWindow()) return;
    if (this.window.isMinimized()) this.window.restore();
    if (!this.window.isVisible()) this.window.showInactive();
    // Also when it was only behind other windows: brought to the front
    // without taking the keyboard from the app.
    this.window.moveTop();
    this.sendStatus();
  }

  // Follows Astra3's light or dark appearance.
  setTheme(theme) {
    this.theme = theme === "light" ? "light" : "dark";
    if (this.window && !this.window.isDestroyed()) this.window.setBackgroundColor(this.theme === "light" ? "#F6F7F9" : "#0F1216");
    this.sendStatus();
  }

  close() {
    this.stop();
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
  }
}

module.exports = { EngineRenderer, withText };

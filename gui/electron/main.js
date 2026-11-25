// ============================================================
// Astra3: Electron main process
// ============================================================
// Owns the window, native dialogs, filesystem access and the engine process.
// The sandboxed renderer reaches all of these only through the IPC handlers
// below (see preload.js).
// ============================================================

const { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeImage, session, clipboard } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { macWindowShadowAllowed, describePymolLaunchError } = require("./mac-compat");
const { execFileSync, spawn } = require("child_process");
const outputLocation = require("./output-location");
const runFolders = require("./run-folders");

const isMac = process.platform === "darwin";
const isDev = !app.isPackaged;


// Per-user settings live in Application Support, never in the signed app
// bundle, where writing breaks the signature and may not be permitted.
// Settings a development checkout kept in gui/tools are migrated once.
function resolveToolsDir() {
  const dir = path.join(app.getPath("userData"), "tools");
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // Callers report write failures.
  }
  return dir;
}
const TOOLS_DIR = resolveToolsDir();

// Packaged builds skip this: any tools folder inside the app came from the
// build machine, not from the person using it.
function migrateLegacyToolsFiles() {
  if (app.isPackaged) return;
  const legacyDirs = [path.join(__dirname, "..", "tools")];
  for (const name of ["pymol_path.txt", "output_dir.txt", "engine.txt", "chimerax_path.txt"]) {
    const target = path.join(TOOLS_DIR, name);
    if (fs.existsSync(target)) continue;
    for (const dir of legacyDirs) {
      const source = path.join(dir, name);
      try {
        if (fs.existsSync(source)) {
          fs.copyFileSync(source, target);
          break;
        }
      } catch {
        // Unreadable; try the next location.
      }
    }
  }
}
migrateLegacyToolsFiles();
const PYMOL_PATH_FILE = path.join(TOOLS_DIR, "pymol_path.txt");
const ENGINE_FILE = path.join(TOOLS_DIR, "engine.txt");
const CHIMERAX_PATH_FILE = path.join(TOOLS_DIR, "chimerax_path.txt");

// Analysis engine: PyMOL unless ChimeraX or the Astra3 Engine is chosen in Settings.
const ENGINES = new Set(["pymol", "chimerax", "astra3"]);
function readEngine() {
  try {
    const value = fs.readFileSync(ENGINE_FILE, "utf-8").trim().toLowerCase();
    if (ENGINES.has(value)) return value;
  } catch {
    // Never chosen: the default applies.
  }
  return "pymol";
}
function writeEngine(engine) {
  if (!ENGINES.has(engine)) throw new Error(`Unknown engine: ${engine}`);
  fs.mkdirSync(TOOLS_DIR, { recursive: true });
  fs.writeFileSync(ENGINE_FILE, engine, "utf-8");
}

// ChimeraX installs as ChimeraX.app or ChimeraX-<version>.app; the newest
// version is preferred when several are installed.
function compareVersionsDesc(a, b) {
  const pa = (a.match(/\d+/g) || []).map(Number);
  const pb = (b.match(/\d+/g) || []).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    if ((pb[i] || 0) !== (pa[i] || 0)) return (pb[i] || 0) - (pa[i] || 0);
  }
  return 0;
}
function chimeraxCandidates() {
  const home = app.getPath("home");
  const found = [];
  for (const dir of ["/Applications", path.join(home, "Applications")]) {
    let names = [];
    try {
      names = fs.readdirSync(dir).filter((n) => /^ChimeraX.*\.app$/i.test(n));
    } catch {
      continue;
    }
    names.sort(compareVersionsDesc);
    for (const n of names) found.push(path.join(dir, n, "Contents", "MacOS", "ChimeraX"));
  }
  found.push("/usr/local/bin/chimerax", "/opt/homebrew/bin/chimerax");
  return found;
}
function autodetectChimeraxPath() {
  for (const candidate of chimeraxCandidates()) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // Not installed there.
    }
  }
  return null;
}
function readChimeraxPath() {
  let saved = null;
  try {
    saved = fs.readFileSync(CHIMERAX_PATH_FILE, "utf-8").trim().split(/\r?\n/)[0].trim() || null;
  } catch {
    saved = null;
  }
  if (saved) {
    try {
      if (fs.statSync(saved).isFile()) return saved;
    } catch {
      // Moved or removed since it was chosen: detect again.
    }
  }
  return autodetectChimeraxPath();
}
function writeChimeraxPath(newPath) {
  fs.mkdirSync(TOOLS_DIR, { recursive: true });
  fs.writeFileSync(CHIMERAX_PATH_FILE, newPath, "utf-8");
}
// "UCSF ChimeraX version: 1.8 (2024-06-10)" -> "1.8". null when the program
// does not answer like ChimeraX.
function chimeraxVersion(exePath) {
  return new Promise((resolve) => {
    if (!exePath) { resolve(null); return; }
    let out = "";
    let child;
    try {
      child = spawn(exePath, ["--version"], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
    } catch {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => { try { child.kill(); } catch { /* already gone */ } resolve(null); }, 60000);
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    child.on("error", () => { clearTimeout(timer); resolve(null); });
    child.on("close", () => {
      clearTimeout(timer);
      const m = out.match(/ChimeraX version:\s*([0-9][0-9A-Za-z.\-]*)/i);
      resolve(m ? m[1] : null);
    });
  });
}

// The chosen engine if it works, else the first that does (PyMOL, ChimeraX,
// Astra3 Engine). null when none is available; the setup dialog then asks.
const ENGINE_NAMES = { pymol: "PyMOL", chimerax: "ChimeraX", astra3: "Astra3 Engine" };
function isFilePath(p) {
  try {
    return !!p && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}
function engineStatus() {
  const preferred = readEngine();
  const pymolPath = readPymolPath();
  const chimeraxPath = readChimeraxPath();
  const available = {
    pymol: !!pymolPath && verifyPymolPath(pymolPath),
    chimerax: isFilePath(chimeraxPath),
    astra3: astra3EngineReady(),
  };
  // The chosen engine when it works; otherwise PyMOL, then ChimeraX, and the
  // Astra3 Engine last, when neither program is installed.
  const engine = available[preferred] ? preferred : ["pymol", "chimerax", "astra3"].find((e) => available[e]) || null;
  // A location set but not working (amber in the interface) differs from
  // none at all (red).
  const configured = { pymol: !!pymolPath, chimerax: !!chimeraxPath, astra3: available.astra3 };
  let chosen = false;
  try {
    chosen = fs.existsSync(ENGINE_FILE);
  } catch {
    chosen = false;
  }
  return {
    engine, preferred, available, configured, chosen,
    programs: available.pymol || available.chimerax,
    pymolPath: available.pymol ? pymolPath : null,
    chimeraxPath: available.chimerax ? chimeraxPath : null,
  };
}
function effectiveEngine() {
  return engineStatus().engine || readEngine();
}

// Usual PyMOL locations on macOS, most likely first: the Schrodinger
// installer, Homebrew, conda environments and pip.
function macPymolCandidates() {
  const home = app.getPath("home");
  const candidates = [
    "/Applications/PyMOL.app/Contents/MacOS/PyMOL",
    path.join(home, "Applications", "PyMOL.app", "Contents", "MacOS", "PyMOL"),
    "/Applications/PyMOL.app/Contents/bin/pymol",
    "/opt/homebrew/bin/pymol",
    "/usr/local/bin/pymol",
  ];
  // conda installs (pymol-open-source or pymol-bundle), in the base
  // environment or a named one. The Anaconda and Miniconda graphical
  // installers use ~/opt; the command-line installers use the home folder.
  const condaNames = ["miniconda3", "anaconda3", "miniforge3", "mambaforge", "micromamba"];
  const condaRoots = [];
  for (const parent of [home, path.join(home, "opt"), "/opt"]) {
    for (const name of condaNames) condaRoots.push(path.join(parent, name));
  }
  condaRoots.push("/opt/homebrew/Caskroom/miniforge/base", "/usr/local/Caskroom/miniforge/base");
  for (const root of condaRoots) {
    candidates.push(path.join(root, "bin", "pymol"));
    let envs = [];
    try {
      envs = fs.readdirSync(path.join(root, "envs"));
    } catch {
      // No environments, or no such install.
    }
    for (const env of envs) candidates.push(path.join(root, "envs", env, "bin", "pymol"));
  }
  candidates.push(path.join(home, ".local", "bin", "pymol"));
  return candidates;
}

// Requires a file, so an empty folder left by an uninstall does not count.
function autodetectPymolPath() {
  for (const candidate of macPymolCandidates()) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // Not installed here.
    }
  }
  return null;
}

function readPymolPath() {
  let saved = null;
  try {
    saved = fs.readFileSync(PYMOL_PATH_FILE, "utf-8").trim().split(/\r?\n/)[0].trim() || null;
  } catch {
    saved = null;
  }
  // PyMOL may have moved since it was chosen; fall back to detection.
  if (saved) {
    try {
      if (fs.statSync(saved).isFile()) return saved;
    } catch {
      // Fall through to detection.
    }
  }
  return autodetectPymolPath();
}

// An executable file. X_OK alone also passes directories, including .app
// bundles, which spawn() cannot run.
function verifyPymolPath(candidatePath) {
  if (!candidatePath) return false;
  try {
    fs.accessSync(candidatePath, fs.constants.X_OK);
    const ok = fs.statSync(candidatePath).isFile();
    logPymolEvent("verifyPymolPath", { candidatePath, result: ok, reason: ok ? "file exists and is executable" : "exists but is not a file (likely a directory/.app bundle)" });
    return ok;
  } catch (e) {
    logPymolEvent("verifyPymolPath", { candidatePath, result: false, reason: e.code || e.message });
    return false;
  }
}

function writePymolPath(newPath) {
  fs.mkdirSync(TOOLS_DIR, { recursive: true });
  fs.writeFileSync(PYMOL_PATH_FILE, newPath, "utf-8");
}

// The file dialog returns a picked .app bundle as is; spawn() needs the
// executable inside. Reads CFBundleExecutable from Info.plist, falls back to
// the bundle's name, and otherwise returns the path unchanged so
// verifyPymolPath rejects it.
function resolveAppBundleExecutable(selectedPath) {
  if (!selectedPath || !selectedPath.endsWith(".app")) return selectedPath;
  let stat;
  try {
    stat = fs.statSync(selectedPath);
  } catch {
    return selectedPath;
  }
  if (!stat.isDirectory()) return selectedPath;

  const infoPlistPath = path.join(selectedPath, "Contents", "Info.plist");
  try {
    const json = execFileSync("plutil", ["-convert", "json", "-o", "-", infoPlistPath], { encoding: "utf-8" });
    const info = JSON.parse(json);
    if (info.CFBundleExecutable) {
      const resolved = path.join(selectedPath, "Contents", "MacOS", info.CFBundleExecutable);
      if (fs.existsSync(resolved)) return resolved;
    }
  } catch {
    // Fall back to the name-based guess.
  }

  const bundleName = path.basename(selectedPath, ".app");
  const guessed = path.join(selectedPath, "Contents", "MacOS", bundleName);
  return fs.existsSync(guessed) ? guessed : selectedPath;
}

// ------------------------------------------------------------
// PyMOL diagnostic log for support requests. Never shown in the interface,
// which gives plain-language messages instead. Kept to the last 500 lines.
const PYMOL_LOG_FILE = path.join(TOOLS_DIR, "pymol-diagnostic.log");
function logPymolEvent(event, details = {}) {
  try {
    fs.mkdirSync(TOOLS_DIR, { recursive: true });
    const line = `[${new Date().toISOString()}] ${event} ${JSON.stringify(details)}\n`;
    let existing = "";
    try { existing = fs.readFileSync(PYMOL_LOG_FILE, "utf-8"); } catch { /* start a new log */ }
    const lines = (existing + line).split("\n").filter(Boolean);
    const trimmed = lines.slice(-500).join("\n") + "\n";
    fs.writeFileSync(PYMOL_LOG_FILE, trimmed, "utf-8");
  } catch {
    // Best effort; logging must never break the caller.
  }
  console.log(`[pymol] ${event}`, details);
}

// Confirms a candidate is PyMOL by running a small script with the same
// "-cq <script>" invocation used for astra3.py. The script prints a marker
// with a computed value, so a match shows Python ran.
//
// lastPymolVerifyProblem explains a failure with a specific fix (for example
// an Intel-only PyMOL on Apple silicon without Rosetta), else null.
let lastPymolVerifyProblem = null;

// A first launch can be slow (Gatekeeper, or Rosetta translating an Intel
// PyMOL on Apple silicon), so a real PyMOL is given time to answer.
function verifyIsRealPymol(candidatePath, timeoutMs = 60000) {
  lastPymolVerifyProblem = null;
  return new Promise((resolve) => {
    let settled = false;
    let proc;
    let tempScriptPath;
    const cleanup = () => {
      if (tempScriptPath) {
        try { fs.unlinkSync(tempScriptPath); } catch { /* already removed, or never created */ }
      }
    };
    const finish = (result, why) => {
      if (settled) return;
      settled = true;
      try { proc?.kill(); } catch { /* already exited */ }
      cleanup();
      logPymolEvent("verifyIsRealPymol", { candidatePath, result, reason: why });
      resolve(result);
    };

    const marker = "ASTRA3_PYMOL_CHECK";
    try {
      tempScriptPath = path.join(os.tmpdir(), `astra3-pymol-check-${Date.now()}-${Math.random().toString(36).slice(2)}.py`);
      // Written so Python 2 can run it too, so an old PyMOL is identified by
      // its version instead of failing with a syntax error.
      fs.writeFileSync(tempScriptPath, `import sys\nprint("${marker}_" + str(21 + 21) + "_py%d.%d" % tuple(sys.version_info[:2]))\n`, "utf-8");
    } catch (e) {
      finish(false, `could not write temp verification script: ${e.message}`);
      return;
    }

    try {
      proc = spawn(candidatePath, ["-cq", tempScriptPath], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
    } catch (e) {
      finish(false, `spawn threw synchronously: ${e.message}`);
      return;
    }

    proc.on("error", (e) => {
      const explained = describePymolLaunchError(e, candidatePath, process.platform, process.arch, os.release());
      if (explained) lastPymolVerifyProblem = explained;
      finish(false, explained || `spawn error event: ${e.message}`);
    });

    let combined = "";
    const versionRe = new RegExp(`${marker}_42_py(\\d+)\\.(\\d+)`);
    const checkOutput = (chunk) => {
      if (settled) return;
      combined += chunk.toString();
      const m = versionRe.exec(combined);
      if (!m) return;
      const major = Number(m[1]);
      const minor = Number(m[2]);
      if (major < 3 || (major === 3 && minor < 7)) {
        lastPymolVerifyProblem = "This PyMOL is too old to run Astra3. Astra3 needs a PyMOL built on Python 3.7 or newer "
          + `(this one uses Python ${major}.${minor}). Install a current PyMOL from pymol.org, then choose it here.`;
        finish(false, `Python ${major}.${minor} is older than 3.7`);
        return;
      }
      finish(true, `verification script ran (Python ${major}.${minor})`);
    };
    proc.stdout?.on("data", checkOutput);
    proc.stderr?.on("data", checkOutput);

    // "close", not "exit": exit can arrive before the last output has been
    // read, which would judge a working PyMOL on partial output.
    proc.on("close", (code) => {
      // PyMOL exits after the script, so a missing marker at exit is a
      // definite failure whatever the exit code.
      finish(versionRe.test(combined) && !lastPymolVerifyProblem, `process exited (code ${code}) with marker ${combined.includes(marker) ? "present" : "absent"}`);
    });

    setTimeout(() => {
      if (!settled) {
        lastPymolVerifyProblem = `PyMOL did not respond within ${timeoutMs / 1000} seconds. If this is its first launch, open PyMOL once on its own, then try again.`;
      }
      finish(false, `no marker output within ${timeoutMs}ms`);
    }, timeoutMs);
  });
}

// The output folder (a Protein_outputs folder) drives both the interface and
// the engine, which gets its parent as ASTRA3_BASE_DIR. output_dir.txt holds
// only a folder chosen in Settings; see output-location.js.
const OUTPUT_DIR_FILE = path.join(TOOLS_DIR, "output_dir.txt");

function readOutputDir() {
  try {
    const raw = fs.readFileSync(OUTPUT_DIR_FILE, "utf-8").trim().split(/\r?\n/)[0].trim();
    return raw || null;
  } catch {
    return null;
  }
}

function writeOutputDir(dir) {
  fs.mkdirSync(TOOLS_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_DIR_FILE, dir, "utf-8");
}

function forgetOutputDir() {
  try {
    fs.rmSync(OUTPUT_DIR_FILE, { force: true });
  } catch {
    // Left in place, it is rejected again at the next start.
  }
}

function defaultOutputDir() {
  return outputLocation.defaultOutputDir(app.getPath("documents"));
}

// Never used for results: updates replace them, and writing into a signed
// macOS bundle invalidates its signature.
function appFolders() {
  const dirs = [path.resolve(__dirname, "..")];
  if (app.isPackaged) dirs.push(process.resourcesPath, path.dirname(process.execPath));
  return dirs.filter(Boolean);
}

function outputEnv() {
  return { platform: process.platform, home: os.homedir(), appDirs: appFolders() };
}

// Resolved once per launch, on first use.
let outputStatePromise = null;
let outputNoticeShown = false;

function establishOutputDir(remembered) {
  if (outputStatePromise) return outputStatePromise;
  outputStatePromise = (async () => {
    const saved = readOutputDir();
    const state = await outputLocation.establishOutputDir({
      saved,
      remembered: saved ? null : remembered,
      defaultDir: defaultOutputDir(),
      fallbackDirs: [path.join(app.getPath("home"), "Astra3", "Protein_outputs")],
      env: outputEnv(),
    });
    // Drop a refused folder so its notice appears once.
    if (state.replaced && state.replaced.source === "saved") forgetOutputDir();
    // A remembered or fallback folder is saved, so later launches use it
    // without asking again.
    if (state.source === "remembered" || state.source === "fallback") writeOutputDir(state.dir);
    return state;
  })();
  return outputStatePromise;
}

// Re-checked at every engine launch in case the folder became unavailable.
async function resolveAstraBaseDir() {
  const state = await establishOutputDir(null);
  const check = await outputLocation.checkOutputDir(state.dir, outputEnv());
  if (!check.ok) {
    throw new Error(`Astra3 can't save results in ${state.dir}. ${outputLocation.describeRefusal(check)} Choose another output folder in Settings.`);
  }
  return path.dirname(check.dir);
}

function protectedFolders() {
  return [app.getPath("home"), app.getPath("documents"), app.getPath("desktop"), app.getPath("downloads")];
}

// python/ beside gui/ in development; Resources/python in a packaged build.
function resolveAstraScriptPath() {
  const devPath = path.join(__dirname, "..", "..", "python", "astra3.py");
  const packagedPath = path.join(process.resourcesPath || "", "python", "astra3.py");
  if (isDev && fs.existsSync(devPath)) return devPath;
  if (fs.existsSync(packagedPath)) return packagedPath;
  if (fs.existsSync(devPath)) return devPath; // last resort, e.g. running packaged=false from an unusual layout
  return null; // reported as an installation problem
}
const ASTRA_SCRIPT_PATH = resolveAstraScriptPath();

// Documents for the Citation & Docs page: the repository root (gui/ for the
// notices) in development, Resources/docs in a packaged build.
function resolveDocPath(filename) {
  const devPath = filename === "THIRD_PARTY_NOTICES.txt"
    ? path.join(__dirname, "..", filename)
    : path.join(__dirname, "..", "..", filename);
  const packagedPath = path.join(process.resourcesPath || "", "docs", filename);
  if (isDev && fs.existsSync(devPath)) return devPath;
  if (fs.existsSync(packagedPath)) return packagedPath;
  if (fs.existsSync(devPath)) return devPath;
  return null;
}

ipcMain.handle("app:getDocPath", (_e, filename) => resolveDocPath(filename));

// ------------------------------------------------------------
// Window
// ------------------------------------------------------------
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: "#0F1216", // matches --bg-0, avoids a white flash on load
    title: "Astra3",
    // Native traffic lights inset into the app's own top bar.
    titleBarStyle: "hiddenInset",
    // Off on macOS 26 and later only; see macWindowShadowAllowed().
    hasShadow: macWindowShadowAllowed(process.platform, os.release(), process.versions.electron),
    // macOS uses the .icns set through Info.plist at build time rather than
    // this runtime option.
    icon: undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, // renderer gets NO direct Node access
      nodeIntegration: false, // required alongside contextIsolation for real isolation
      sandbox: true,
    },
  });
  const sendFullScreen = (value) => {
    try { mainWindow.webContents.send("window:fullscreen-changed", value); } catch { /* window closing */ }
  };
  mainWindow.on("enter-full-screen", () => sendFullScreen(true));
  mainWindow.on("leave-full-screen", () => sendFullScreen(false));


  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));

  if (isDev) {
    // Convenience only during development; never shipped enabled.
    // mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ------------------------------------------------------------
// Application menu
// ------------------------------------------------------------
function buildMenu() {
  const template = [
    ...(isMac
      ? [
          {
            label: "Astra3",
            submenu: [
              {
                label: "About Astra3",
                click: () => showAboutDialog(),
              },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [isMac ? { role: "close" } : { role: "quit" }],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" }, { role: "redo" }, { type: "separator" },
        { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" }, { role: "toggleDevTools" }, { type: "separator" },
        { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "zoom" }, ...(isMac ? [{ type: "separator" }, { role: "front" }] : [{ role: "close" }])],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function showAboutDialog() {
  dialog.showMessageBox(mainWindow, {
    type: "info",
    title: "About Astra3",
    message: "Astra3",
    detail: `Structural Analysis Toolkit for PDB Rendering Automation\nv${app.getVersion()}\n\nCreated by Andre Aguirre`,
    icon: path.join(__dirname, "..", "assets", "icons", "astra3-512.png"),
    buttons: ["OK"],
  });
}

// ------------------------------------------------------------
// App lifecycle
// ------------------------------------------------------------
// Every web permission is refused except clipboard writes (Copy citation),
// so the window never raises a system permission prompt.
const ALLOWED_PERMISSIONS = new Set(["clipboard-sanitized-write"]);
function denyDevicePermissions() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(ALLOWED_PERMISSIONS.has(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission));
}

// ------------------------------------------------------------
// Navigation guard
// ------------------------------------------------------------
// Frames stay on Astra3's own pages (the report frame on its own). http(s) and
// mailto links open in the default browser; any other navigation, including
// a dropped file, is refused.
const APP_PAGE = path.resolve(__dirname, "..", "renderer", "index.html").toLowerCase();
const REPORT_FRAME_PAGE = path.resolve(__dirname, "..", "renderer", "report-frame.html").toLowerCase();

function isLocalPage(url, page) {
  const bare = String(url || "").split(/[?#]/)[0];
  if (!/^file:/i.test(bare)) return false;
  try {
    return path.resolve(require("url").fileURLToPath(bare)).toLowerCase() === page;
  } catch {
    return false;
  }
}

function openInBrowser(url) {
  if (/^(https?:|mailto:)/i.test(String(url || ""))) {
    shell.openExternal(url).catch(() => { /* no browser registered; nothing safer to do */ });
  }
}

app.on("web-contents-created", (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    openInBrowser(url);
    return { action: "deny" };
  });
  contents.on("will-frame-navigate", (event) => {
    const url = String(event.url || "");
    const allowed = event.isMainFrame
      ? isLocalPage(url, APP_PAGE)
      : isLocalPage(url, REPORT_FRAME_PAGE) || /^about:blank(#.*)?$/i.test(url);
    if (allowed) return;
    event.preventDefault();
    openInBrowser(url);
  });
  contents.on("will-attach-webview", (event) => event.preventDefault());
});

app.whenReady().then(() => {
  denyDevicePermissions();
  buildMenu();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  stopPymol();
  if (!isMac) app.quit();
});

app.on("before-quit", () => {
  stopPymol();
  engineRenderer.close();
});

// ------------------------------------------------------------
// PyMOL process management
// ------------------------------------------------------------
// The process itself is handled in pymol-bridge.js. The Astra3 Engine runs
// astra3.py under Pyodide with this app's own executable (engine/
// astra3-engine.js) and draws images in engine-window.js. Packaged builds
// keep engine/ outside the asar archive.
const ENGINE_SCRIPT_PATH = (() => {
  const candidates = [
    path.join(process.resourcesPath || "", "engine", "astra3-engine.js"),
    path.join(__dirname, "..", "engine", "astra3-engine.js"),
  ];
  return candidates.find((p) => isFilePath(p)) || null;
})();
function astra3EngineReady() {
  return !!ENGINE_SCRIPT_PATH && isFilePath(path.join(path.dirname(ENGINE_SCRIPT_PATH), "pyodide", "pyodide.asm.wasm"));
}
// Whether the Astra3 Engine window shows while it draws. Off unless chosen
// in Settings; the images are drawn in the background either way.
const ENGINE_WINDOW_FILE = path.join(TOOLS_DIR, "engine_window.txt");
function readEngineWindowShown() {
  try {
    return fs.readFileSync(ENGINE_WINDOW_FILE, "utf-8").trim() === "show";
  } catch {
    return false;
  }
}
function writeEngineWindowShown(shown) {
  fs.mkdirSync(TOOLS_DIR, { recursive: true });
  fs.writeFileSync(ENGINE_WINDOW_FILE, shown ? "show" : "hide", "utf-8");
}
const { EngineRenderer } = require("./engine-window");
const engineRenderer = new EngineRenderer({
  getShowWindow: readEngineWindowShown,
  getVersion: () => app.getVersion(),
});
// Closing Astra3's own window closes the engine window with it.
app.on("browser-window-created", (_e, win) => {
  if (engineRenderer.creating) return;
  win.once("closed", () => {
    if (BrowserWindow.getAllWindows().every((w) => w === engineRenderer.window)) engineRenderer.close();
  });
});
ipcMain.handle("app:getEngineWindow", async () => readEngineWindowShown());
ipcMain.handle("app:setEngineWindow", async (_e, shown) => {
  writeEngineWindowShown(!!shown);
  engineRenderer.setVisible(!!shown);
  return !!shown;
});
ipcMain.on("app:setTheme", (_e, theme) => engineRenderer.setTheme(theme));

const { PymolBridge } = require("./pymol-bridge");
const pymolBridge = new PymolBridge({
  getPymolPath: readPymolPath,
  getEngine: effectiveEngine,
  getChimeraxPath: readChimeraxPath,
  getAstraScriptPath: () => ASTRA_SCRIPT_PATH,
  getWorkingDir: () => TOOLS_DIR,
  getAstraBaseDir: resolveAstraBaseDir,
  getPaletteFile: () => PALETTE_FILE,
  getAstra3Engine: () => ({ script: ENGINE_SCRIPT_PATH, jobs: engineRenderer }),
});

function stopPymol() {
  pymolBridge.stop();
}

// Forward PyMOL bridge events to the renderer over IPC
pymolBridge.on("log", (payload) => {
  mainWindow?.webContents.send("pymol:log", payload);
});
pymolBridge.on("state", (payload) => {
  mainWindow?.webContents.send("pymol:state", payload);
});

// ------------------------------------------------------------
// IPC handlers: everything the renderer can ask for, each a single
// narrow action.
// ------------------------------------------------------------

// Since Electron 43 a dialog without a starting folder opens in Downloads, so
// each kind of dialog remembers its last folder for the session.
const lastDialogFolder = {};
function dialogStart(kind, fallback) {
  const dir = lastDialogFolder[kind] || fallback;
  return dir && fs.existsSync(dir) ? { defaultPath: dir } : {};
}
function rememberDialogFolder(kind, chosen, isFolder = false) {
  if (chosen) lastDialogFolder[kind] = isFolder ? chosen : path.dirname(chosen);
}
ipcMain.handle("dialog:openFile", async (_e, options = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    ...dialogStart("files"),
    properties: ["openFile", ...(options.multiSelections ? ["multiSelections"] : [])],
    filters: options.filters || [
      { name: "Structure files", extensions: ["pdb", "ent", "cif", "mmcif", "pse", "gz"] },
      { name: "All files", extensions: ["*"] },
    ],
  });
  if (!result.canceled) rememberDialogFolder("files", result.filePaths[0]);
  return result.canceled ? null : result.filePaths;
});

ipcMain.handle("dialog:openFolder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, { ...dialogStart("folder"), properties: ["openDirectory", "createDirectory"] });
  if (!result.canceled) rememberDialogFolder("folder", result.filePaths[0], true);
  return result.canceled ? null : result.filePaths[0];
});

// Settings' PyMOL Browse button: like dialog:openFile, but resolves a picked
// .app bundle to its executable.
ipcMain.handle("dialog:openPymolExecutable", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    ...dialogStart("program", "/Applications"),
    properties: ["openFile"],
    filters: [{ name: "PyMOL", extensions: ["*"] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  rememberDialogFolder("program", result.filePaths[0]);
  return resolveAppBundleExecutable(result.filePaths[0]);
});

// Electron's clipboard rather than the web API, which needs focus and a
// permission the in-app report frame does not reliably have.
const CLIPBOARD_TEXT_LIMIT = 1000000;
ipcMain.handle("clipboard:writeText", (_e, text) => {
  if (typeof text !== "string" || !text || text.length > CLIPBOARD_TEXT_LIMIT) return false;
  clipboard.writeText(text);
  return true;
});
ipcMain.handle("clipboard:writeImage", (_e, dataUri) => {
  if (typeof dataUri !== "string" || !dataUri.startsWith("data:image/png;base64,")) return false;
  const image = nativeImage.createFromDataURL(dataUri);
  if (image.isEmpty()) return false;
  clipboard.writeImage(image);
  return true;
});

ipcMain.handle("fs:readFile", async (_e, filePath) => {
  // Node's errors would reach the interface as errno text, so each is rewritten
  // as a sentence. Still thrown, for callers' .catch handlers.
  try {
    return await fs.promises.readFile(filePath, "utf-8");
  } catch (e) {
    if (e.code === "ENOENT") {
      throw new Error(`This file no longer exists:\n${filePath}\n\nIt may have been moved, renamed, or deleted since the run finished. Re-running the analysis will recreate it.`);
    }
    if (e.code === "EACCES" || e.code === "EPERM") {
      throw new Error(`Astra3 doesn't have permission to read:\n${filePath}\n\nmacOS may be withholding access to this location. Check Privacy & Security settings, or choose an output folder inside your home directory.`);
    }
    if (e.code === "EISDIR") {
      throw new Error(`Expected a file but found a folder:\n${filePath}`);
    }
    throw new Error(`Could not read this file:\n${filePath}\n\n${e.message}`);
  }
});

// File names in a directory; [] when it is missing or unreadable.
ipcMain.handle("fs:listDir", async (_e, dirPath) => {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => e.name);
  } catch {
    return [];
  }
});

// Subdirectory names; [] when missing or unreadable.
// Run folders in a directory with their modification times: [{ name, mtimeMs }].
ipcMain.handle("fs:listRunFolders", async (_e, dirPath) => {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && runFolders.runFolderPath(path.join(dirPath, e.name)))
      .map((e) => ({ name: e.name, mtimeMs: fs.statSync(path.join(dirPath, e.name)).mtimeMs }));
  } catch {
    return [];
  }
});

ipcMain.handle("fs:listSubdirs", async (_e, dirPath) => {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
});

// A local image as a data: URI, since the sandboxed renderer cannot load file:// URLs.
ipcMain.handle("fs:readFileAsDataUri", async (_e, filePath) => {
  // Only images that runs wrote.
  if (!/\.(png|jpe?g)$/i.test(String(filePath || "")) || !runFolders.isInsideRunFolders(filePath)) return null;
  try {
    const data = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
    return `data:${mime};base64,${data.toString("base64")}`;
  } catch (e) {
    return null;
  }
});

ipcMain.handle("fs:openPath", async (_e, targetPath) => {
  // Opens with the default application.
  if (!targetPath) return "No path was provided, so there was nothing to open.";
  if (!runFolders.isInsideRunFolders(targetPath)) {
    return `Astra3 opens only its output folders and the files its runs write, so this was not opened:\n${targetPath}`;
  }
  // LaunchServices would hand ChimeraX files to the oldest running ChimeraX,
  // which can be Astra3's hidden image helper.
  if (/\.(cxs|cxc)$/i.test(targetPath)) return openSessionFile(targetPath);
  if (!fs.existsSync(targetPath)) {
    return `This file no longer exists:\n${targetPath}\n\nIt may have been moved, renamed, or deleted since the run finished. Re-running the analysis will recreate it.`;
  }
  const errorMsg = await shell.openPath(targetPath);
  return errorMsg || null;
});

// A downscaled data: URI for galleries. Full renders (up to 3000x2250) decode
// to about 27 MB each, and a dozen of them exhaust the renderer process.
ipcMain.handle("fs:readImageThumbnail", async (_e, filePath, maxWidth) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const image = nativeImage.createFromPath(filePath);
    if (image.isEmpty()) return null;
    const width = Math.max(64, Math.min(Number(maxWidth) || 520, 1024));
    const size = image.getSize();
    const scaled = size.width > width ? image.resize({ width, quality: "good" }) : image;
    return scaled.toDataURL();
  } catch {
    // The caller shows a placeholder.
    return null;
  }
});

ipcMain.handle("fs:outputUsage", async () => {
  const { dir: outputDir } = await establishOutputDir(null);
  const result = { outputDir, total: 0, folders: {}, byPath: {}, exists: false };
  if (!fs.existsSync(outputDir)) return result;
  result.exists = true;
  let entries;
  try {
    entries = fs.readdirSync(outputDir, { withFileTypes: true });
  } catch (e) {
    return { ...result, error: e.message };
  }
  for (const entry of entries) {
    const full = path.join(outputDir, entry.name);
    if (!runFolders.isAstraRunFolder(full, entry.name)) continue;
    const size = runFolders.directorySizeBytes(full);
    result.folders[entry.name] = size;
    result.byPath[full] = size;
    result.total += size;
  }
  return result;
});

// `folders` are the run folders recorded in History; `everything` also sweeps
// the current output folder. run-folders.js limits what can be deleted.
// Resolves to { ok, results, freed }, one result per requested path.
async function deleteRuns({ folders, everything } = {}) {
  if (pymolBridge.isBusy()) {
    return { ok: false, results: [], freed: 0, error: "Wait for the current analysis to finish before deleting files." };
  }
  const options = { protectedDirs: protectedFolders() };
  const results = [];
  // Several entries can share a folder (re-runs reuse it).
  const done = new Map();
  const key = (p) => (isMac || process.platform === "win32" ? path.resolve(p).toLowerCase() : path.resolve(p));
  let freed = 0;
  const remove = async (requested) => {
    const known = typeof requested === "string" && path.isAbsolute(requested) ? done.get(key(requested)) : null;
    if (known) return { ...known, requested };
    const result = await runFolders.deleteRunFolder(requested, options);
    if (result.path) done.set(key(result.path), result);
    freed += result.freed || 0;
    return result;
  };
  for (const requested of Array.isArray(folders) ? folders : []) results.push(await remove(requested));
  if (everything) {
    const { dir: outputDir } = await establishOutputDir(null);
    let entries = [];
    try {
      entries = fs.readdirSync(outputDir, { withFileTypes: true });
    } catch {
      // Nothing to sweep.
    }
    for (const entry of entries) {
      const full = path.join(outputDir, entry.name);
      if (done.has(key(full)) || !runFolders.isAstraRunFolder(full, entry.name)) continue;
      results.push(await remove(full));
    }
  }
  return { ok: results.every((r) => r.status === "deleted"), results, freed };
}

ipcMain.handle("fs:deleteRuns", async (_e, request) => deleteRuns(request || {}));
// Sizes of History's run folders wherever they are, keyed by requested path.
ipcMain.handle("fs:runSizes", async (_e, folders) => runFolders.runFolderSizes(folders));
ipcMain.handle("fs:clearOutputs", async (_e, request) => deleteRuns({ ...(request || {}), everything: true }));

// Related Structures: RCSB searches run here, where network access and
// timeouts are controlled.
ipcMain.handle("related:find", async (_e, query) => {
  const { findRelatedStructures } = require("./related-structures");
  return findRelatedStructures(query || {});
});

// Quick View: coordinates without an analysis (see quick-view.js).
ipcMain.handle("viewer:quickView", async (_e, request) => {
  const { quickView } = require("./quick-view");
  return quickView(request || {}, pymolBridge.importList());
});

// Opens via LaunchServices so the program is not Astra3's child; otherwise
// macOS attributes its writes to Astra3 and shows a "prevented from modifying
// apps" notice. Returns false when the program is not inside an .app bundle.
function openWithMacApp(exePath, filePath) {
  if (process.platform !== "darwin") return false;
  const m = String(exePath || "").match(/^(.*?\.app)(?:\/|$)/);
  if (!m || !fs.existsSync(m[1])) return false;
  // -n starts a new instance, never Astra3's hidden ChimeraX helper.
  const child = spawn("open", ["-n", "-a", m[1], filePath], { detached: true, stdio: "ignore" });
  child.unref();
  return true;
}

// .cxs/.cxc open in ChimeraX, .pse in PyMOL, or in ChimeraX through the
// matching .cxc when PyMOL is not installed. Returns null or an error message.
function openSessionFile(sessionPath) {
  if (!sessionPath) return "No session file was provided.";
  if (!fs.existsSync(sessionPath)) {
    return `This session file no longer exists:\n${sessionPath}\n\nIt may have been moved or deleted since the run finished. Re-running the analysis will recreate it.`;
  }
  if (/\.(cxs|cxc)$/i.test(sessionPath)) {
    const chimeraxPath = readChimeraxPath();
    if (!chimeraxPath) return "ChimeraX was not found, so this ChimeraX session can't be opened. Set the ChimeraX location in Settings first.";
    try {
      if (openWithMacApp(chimeraxPath, sessionPath)) return null;
      const child = spawn(chimeraxPath, [sessionPath], { detached: true, stdio: "ignore" });
      child.unref();
      return null;
    } catch (e) {
      return `Could not launch ChimeraX to open this session.\n\nChimeraX: ${chimeraxPath}\nSession: ${sessionPath}\n\n${e.message}`;
    }
  }
  const pymolPath = readPymolPath();
  const cxc = sessionPath.replace(/\.pse$/i, ".cxc");
  if (!pymolPath && cxc !== sessionPath && fs.existsSync(cxc)) {
    const chimeraxPath = readChimeraxPath();
    if (!chimeraxPath) {
      return "This session opens in PyMOL (.pse) or ChimeraX (the .cxc file beside it), and neither is installed. The structure can be viewed on the Viewer page.";
    }
    try {
      if (openWithMacApp(chimeraxPath, cxc)) return null;
      const child = spawn(chimeraxPath, [cxc], { detached: true, stdio: "ignore" });
      child.unref();
      return null;
    } catch (e) {
      return `Could not launch ChimeraX to open this session.\n\nChimeraX: ${chimeraxPath}\nSession: ${cxc}\n\n${e.message}`;
    }
  }
  if (!pymolPath) {
    return "No PyMOL application is configured yet, so the session can't be opened. Set the PyMOL location in Settings first.";
  }
  try {
    if (openWithMacApp(pymolPath, sessionPath)) return null;
    const child = spawn(pymolPath, [sessionPath], { detached: true, stdio: "ignore" });
    child.unref();
    return null;
  } catch (e) {
    return `Could not launch PyMOL to open this session.\n\nPyMOL: ${pymolPath}\nSession: ${sessionPath}\n\n${e.message}\n\nCheck that the PyMOL location in Settings is still correct.`;
  }
}

ipcMain.handle("fs:openInPymol", async (_e, sessionPath) => openSessionFile(sessionPath));

// Cleanup after a cancelled run. `newerThan` keeps files from an earlier run
// of the same structure. Names containing path separators are refused.
ipcMain.handle("fs:deleteRunFolders", async (_e, { outputDir, folderNames, newerThan } = {}) => {
  if (!outputDir) return { ok: false, error: "No output folder was given.", deleted: 0, freed: 0, failures: [], results: [] };
  const names = Array.isArray(folderNames) ? folderNames : [];
  const options = { protectedDirs: protectedFolders(), newerThan };
  const results = [];
  for (const raw of names) {
    const name = String(raw || "");
    if (!name || name !== path.basename(name) || name === "." || name === "..") {
      results.push({ requested: name, path: null, status: "refused", message: "It is not a plain folder name.", freed: 0 });
      continue;
    }
    results.push({ ...(await runFolders.deleteRunFolder(path.join(path.resolve(outputDir), name), options)), requested: name });
  }
  const failures = results
    .filter((r) => r.status !== "deleted" && r.status !== "trimmed")
    .map((r) => `${r.requested}: ${r.message}`);
  return {
    ok: failures.length === 0,
    deleted: results.filter((r) => r.status === "deleted" || (r.status === "trimmed" && r.removed > 0)).length,
    freed: results.reduce((sum, r) => sum + (r.freed || 0), 0),
    failures,
    results,
  };
});

// Opens several images together: one Preview window on macOS, each file in
// the default viewer elsewhere.
ipcMain.handle("fs:openImageSet", async (_e, targetPaths) => {
  if (!Array.isArray(targetPaths) || targetPaths.length === 0) {
    return { ok: true, opened: 0, failures: [], mode: "none" };
  }
  const existing = targetPaths.filter((t) => { try { return fs.existsSync(t); } catch { return false; } });
  const failures = targetPaths
    .filter((t) => !existing.includes(t))
    .map((t) => `${path.basename(t)}: file no longer exists`);
  if (existing.length === 0) return { ok: false, opened: 0, failures, mode: "none" };

  if (process.platform === "darwin") {
    try {
      const { spawn } = require("child_process");
      await new Promise((resolve, reject) => {
        const child = spawn("open", ["-a", "Preview", ...existing], { stdio: "ignore" });
        child.on("error", reject);
        child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`Preview exited with code ${code}`))));
      });
      return { ok: failures.length === 0, opened: existing.length, failures, mode: "preview" };
    } catch (e) {
      // Fall back to opening files one by one.
      failures.push(`Preview could not be launched (${e.message}); opened individually instead.`);
    }
  }

  if (process.platform === "win32") {
    let opened = 0;
    for (const target of existing) {
      const err = await shell.openPath(target);
      if (err) failures.push(`${path.basename(target)}: ${err}`);
      else opened += 1;
    }
    return { ok: failures.length === 0, opened, failures, mode: "windows-individual" };
  }

  let opened = 0;
  for (const target of existing) {
    const err = await shell.openPath(target);
    if (err) failures.push(`${path.basename(target)}: ${err}`);
    else opened += 1;
  }
  return { ok: failures.length === 0, opened, failures, mode: "individual" };
});

ipcMain.handle("fs:showInFolder", async (_e, targetPath) => {
  shell.showItemInFolder(targetPath);
});

ipcMain.handle("fs:saveScreenshot", async (_e, { dataUri, suggestedName }) => {
  // Writes a 3D Viewer screenshot (a PNG data: URI) where the person chooses.
  const saveName = suggestedName || "astra3_viewer_screenshot.png";
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: lastDialogFolder.save ? path.join(lastDialogFolder.save, path.basename(saveName)) : saveName,
    filters: [{ name: "PNG Image", extensions: ["png"] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, cancelled: true };
  rememberDialogFolder("save", result.filePath);
  try {
    const base64 = dataUri.replace(/^data:image\/png;base64,/, "");
    fs.writeFileSync(result.filePath, Buffer.from(base64, "base64"));
    return { ok: true, path: result.filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// The interface collapses its own top bar in fullscreen.
ipcMain.handle("window:isFullScreen", async () => (mainWindow ? mainWindow.isFullScreen() : false));

ipcMain.handle("app:getPaths", async () => ({
  home: os.homedir(),
  documents: app.getPath("documents"),
  userData: app.getPath("userData"),
  platform: process.platform,
  defaultOutputDir: defaultOutputDir(),
}));

// A real PyMOL path found on this machine, or null.
ipcMain.handle("app:autodetectPymolPath", async () => autodetectPymolPath());

ipcMain.handle("app:getEngine", async () => effectiveEngine());

// The Color Palette page's colours, saved beside the other settings. astra3.py
// reads the file at the start of each command (ASTRA3_PALETTE_FILE); with no
// file it uses its default colours.
const PALETTE_FILE = path.join(TOOLS_DIR, "color_palette.json");
const PALETTE_COLOR = /^(#[0-9A-Fa-f]{6}|[a-z][a-z0-9_]{0,23})$/;
function cleanPalette(value) {
  const list = (v) => (Array.isArray(v) && v.length >= 1 && v.length <= 24
    && v.every((c) => typeof c === "string" && PALETTE_COLOR.test(c)) ? [...v] : null);
  const termini = (value && value.termini) || {};
  const clean = {
    chains: list(value && value.chains), ligands: list(value && value.ligands), ions: list(value && value.ions),
    termini: { enabled: termini.enabled !== false, n: String(termini.n || ""), c: String(termini.c || "") },
  };
  if (!clean.chains || !clean.ligands || !clean.ions
    || !PALETTE_COLOR.test(clean.termini.n) || !PALETTE_COLOR.test(clean.termini.c)) {
    throw new Error("The color palette has an entry that is not a color.");
  }
  // Terminus arrow colours: optional, absent in palettes saved before them.
  if (value && value.arrows !== undefined) {
    const arrows = value.arrows || {};
    const reference = list(arrows.reference);
    const pairs = Array.isArray(arrows.comparisons) && arrows.comparisons.length >= 1 && arrows.comparisons.length <= 12
      ? arrows.comparisons.map(list) : null;
    if (!reference || reference.length !== 2 || !pairs || pairs.some((pair) => !pair || pair.length !== 2)) {
      throw new Error("The color palette has an arrow entry that is not a color.");
    }
    clean.arrows = { reference, comparisons: pairs };
  }
  return clean;
}
ipcMain.handle("palette:get", async () => {
  try {
    return cleanPalette(JSON.parse(fs.readFileSync(PALETTE_FILE, "utf-8")));
  } catch {
    return null;
  }
});
ipcMain.handle("palette:set", async (_e, value) => {
  if (value == null) {
    fs.rmSync(PALETTE_FILE, { force: true });
    return null;
  }
  const clean = cleanPalette(value);
  fs.mkdirSync(path.dirname(PALETTE_FILE), { recursive: true });
  fs.writeFileSync(PALETTE_FILE + ".tmp", JSON.stringify(clean, null, 2), "utf-8");
  fs.renameSync(PALETTE_FILE + ".tmp", PALETTE_FILE);
  return clean;
});
ipcMain.handle("app:engineStatus", async () => ({
  ...engineStatus(),
  running: pymolBridge.isRunning() ? pymolBridge.engine : null,
}));
// Switching takes effect immediately when idle: the running engine is
// stopped and the next command starts the new one, which re-imports this
// session's files under the same IDs. Refused during a run.
ipcMain.handle("app:setEngine", async (_e, engine) => {
  const wanted = String(engine || "").toLowerCase();
  // Choosing the engine that is already starting or running changes nothing.
  if (pymolBridge.isBusy() && pymolBridge.engine !== wanted) throw new Error("Finish or cancel the current run before switching engines.");
  writeEngine(wanted);
  const status = engineStatus();
  if (pymolBridge.isRunning() && pymolBridge.engine !== status.engine) pymolBridge.stop();
  if (status.engine) pymolBridge.emit("state", { engine: ENGINE_NAMES[status.engine], running: pymolBridge.isRunning() });
  return status;
});
ipcMain.handle("app:getChimeraxPath", async () => readChimeraxPath());
ipcMain.handle("app:setChimeraxPath", async (_e, newPath) => {
  const resolved = resolveAppBundleExecutable(String(newPath || "").trim());
  if (!resolved) throw new Error("No ChimeraX location was given.");
  writeChimeraxPath(resolved);
  // A ChimeraX already running keeps its old location until it is closed.
  if (pymolBridge.isRunning() && pymolBridge.engine === "chimerax" && !pymolBridge.isBusy()) {
    pymolBridge.stop();
    pymolBridge.emit("state", { running: false });
  }
  return resolved;
});
ipcMain.handle("app:chimeraxVersion", async (_e, explicitPath) => chimeraxVersion(resolveAppBundleExecutable(explicitPath) || readChimeraxPath()));
ipcMain.handle("dialog:openChimeraxExecutable", async () => {
  const result = await dialog.showOpenDialog(mainWindow, { ...dialogStart("program", "/Applications"), properties: ["openFile"], filters: [{ name: "ChimeraX", extensions: ["*"] }] });
  if (result.canceled || !result.filePaths[0]) return null;
  rememberDialogFolder("program", result.filePaths[0]);
  return resolveAppBundleExecutable(result.filePaths[0]);
});

ipcMain.handle("app:getPymolPath", async () => readPymolPath());
// Checks explicitPath, or the saved path when none is given.
ipcMain.handle("app:verifyPymolPath", async (_e, explicitPath) => verifyPymolPath(explicitPath || readPymolPath()));
// Slow: launches the candidate (see verifyIsRealPymol).
ipcMain.handle("app:verifyIsRealPymol", async (_e, candidatePath) => verifyIsRealPymol(candidatePath));
ipcMain.handle("app:pymolVerifyProblem", async () => lastPymolVerifyProblem);
ipcMain.handle("app:setPymolPath", async (_e, newPath) => {
  writePymolPath(newPath);
  return true;
});
// Restart after a PyMOL location change, confirmed by the person in Settings.
ipcMain.handle("app:restartApp", async () => {
  app.relaunch();
  app.exit(0);
});
ipcMain.handle("app:getAstraScriptPath", async () => ASTRA_SCRIPT_PATH);
// `remembered` (the interface's last value) is used only when nothing is
// saved. `notice` is returned once per launch.
ipcMain.handle("app:getOutputLocation", async (_e, remembered) => {
  const state = await establishOutputDir(typeof remembered === "string" ? remembered : null);
  const notice = outputNoticeShown ? null : outputLocation.startupNotice(state);
  outputNoticeShown = true;
  return { dir: state.dir, defaultDir: defaultOutputDir(), notice };
});
ipcMain.handle("app:getOutputDir", async () => (await establishOutputDir(null)).dir);
// Validates and saves a folder chosen in Settings. The engine reads its base
// folder only at launch, so an idle running engine is stopped and the next
// command starts one on the new folder.
ipcMain.handle("app:setOutputDir", async (_e, newPath) => {
  if (pymolBridge.isBusy()) return { ok: false, error: "Finish or cancel the current run before changing the output folder." };
  const check = await outputLocation.checkOutputDir(newPath, outputEnv());
  if (!check.ok) return { ok: false, error: outputLocation.describeRefusal(check) };
  const previous = (await establishOutputDir(null)).dir;
  writeOutputDir(check.dir);
  outputStatePromise = Promise.resolve({ dir: check.dir, source: "saved", replaced: null, problem: null });
  const changed = !outputLocation.samePlace(previous, check.dir, process.platform);
  if (changed && pymolBridge.isRunning()) {
    pymolBridge.stop();
    pymolBridge.emit("state", { running: false });
  }
  return { ok: true, dir: check.dir, changed };
});

// PyMOL bridge
ipcMain.handle("pymol:start", async () => pymolBridge.start());
ipcMain.handle("pymol:stop", async () => pymolBridge.stop());
ipcMain.handle("pymol:isRunning", async () => pymolBridge.isRunning());
ipcMain.handle("pymol:runCommand", async (_e, commandString) => pymolBridge.runCommand(commandString));
ipcMain.handle("pymol:runImportCommand", async (_e, filePath) => pymolBridge.runImportCommand(filePath));
ipcMain.handle("pymol:cancel", async () => pymolBridge.cancel());
ipcMain.handle("pymol:answerPrompt", async (_e, answer) => pymolBridge.answerPrompt(answer));
// Current imports, for the Import page.
ipcMain.handle("pymol:imports", async () => pymolBridge.importList());

// App-wide zoom, clamped to 50-200%.
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.0;
const ZOOM_STEP = 0.1;
ipcMain.handle("app:getZoomFactor", () => mainWindow?.webContents.getZoomFactor() ?? 1);
ipcMain.handle("app:setZoomFactor", (_e, factor) => {
  const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, factor));
  mainWindow?.webContents.setZoomFactor(clamped);
  return clamped;
});
ipcMain.handle("app:zoomIn", () => {
  const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, (mainWindow?.webContents.getZoomFactor() ?? 1) + ZOOM_STEP));
  mainWindow?.webContents.setZoomFactor(next);
  return next;
});
ipcMain.handle("app:zoomOut", () => {
  const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, (mainWindow?.webContents.getZoomFactor() ?? 1) - ZOOM_STEP));
  mainWindow?.webContents.setZoomFactor(next);
  return next;
});
ipcMain.handle("app:zoomReset", () => {
  mainWindow?.webContents.setZoomFactor(1);
  return 1;
});

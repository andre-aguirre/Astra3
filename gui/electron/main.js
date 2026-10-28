// ============================================================
// Astra3: Electron main process
// ============================================================
// Owns: the native window, native dialogs, filesystem access, and the PyMOL
// child process. The renderer (React GUI) never touches Node or the
// filesystem directly: see preload.js and the
// contextIsolation/nodeIntegration settings below. All of that goes through
// IPC, handled here.
// ============================================================

const { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeImage, session, clipboard } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { macWindowShadowAllowed, describePymolLaunchError } = require("./mac-compat");
const { execFileSync, spawn } = require("child_process");

const isMac = process.platform === "darwin";
const isDev = !app.isPackaged;


// User-writable state (the chosen PyMOL location, the output folder, the
// diagnostic log) lives in the standard macOS per-user application-support
// directory.
//
// It must NOT live inside the application bundle. A distributed .app is code
// signed with a hardened runtime, and writing into Contents/Resources both
// invalidates that signature and fails outright when the app is installed to
// /Applications by a user without write access there. Configuration that
// belongs to the person, not the program, also has no business inside the
// bundle regardless.
//
// Anything found in a previous in-bundle location is migrated once on first
// run, so an upgrade keeps the settings the person already chose.
function resolveToolsDir() {
  const dir = path.join(app.getPath("userData"), "tools");
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // Reported by the callers that need it; there is no useful recovery here.
  }
  return dir;
}
const TOOLS_DIR = resolveToolsDir();

function migrateLegacyToolsFiles() {
  const legacyDirs = [
    path.join(__dirname, "..", "tools"),
    path.join(process.resourcesPath || "", "tools"),
  ];
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
        // Unreadable legacy file -- fall through to the next location.
      }
    }
  }
}
migrateLegacyToolsFiles();
const PYMOL_PATH_FILE = path.join(TOOLS_DIR, "pymol_path.txt");
const ENGINE_FILE = path.join(TOOLS_DIR, "engine.txt");
const CHIMERAX_PATH_FILE = path.join(TOOLS_DIR, "chimerax_path.txt");

// -- Analysis engine --
// PyMOL unless the person has chosen ChimeraX or the Astra3 Engine in Settings.
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

// Which engine analyses run with: the one chosen in Settings (PyMOL until
// another is chosen) when it is installed, otherwise the other one when it is,
// so a computer with only one of them works without being asked anything.
// None when neither is installed; the setup dialog then asks for either.
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

// Locations a PyMOL installation is normally found in on macOS, in descending
// order of likelihood. Both the app bundle's executable and the plain
// command-line binaries are checked, since which exists depends on whether
// PyMOL came from the Schrodinger installer, Homebrew, conda or pip.
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

// First PyMOL that actually exists on this machine, or null. Checks for a
// file at each candidate rather than assuming a directory implies an install,
// so an empty folder left by an uninstall is not reported as one.
function autodetectPymolPath() {
  for (const candidate of macPymolCandidates()) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // Absent -- the expected result for most entries in a list this broad.
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
  // A saved path that no longer exists is not a usable setting: PyMOL may
  // have been moved, upgraded or removed since it was chosen. Falling back to
  // detection recovers those cases instead of failing at launch with a stale
  // location.
  if (saved) {
    try {
      if (fs.statSync(saved).isFile()) return saved;
    } catch {
      // Fall through to detection.
    }
  }
  return autodetectPymolPath();
}

// Real existence/executability check for a PyMOL path. Accepts an explicit
// path (used by the Settings page to verify whatever is CURRENTLY TYPED in
// the field, before it's necessarily been saved to disk via setPymolPath) or
// falls back to the saved path from pymol_path.txt when no explicit path is
// given (used by the top-bar setup banner, which only cares about the
// currently-active saved path). X_OK alone passes for ANY traversable
// directory, not just real executables -- a directory needs its own execute
// bit set just to be listable/enterable, which has nothing to do with whether
// it's a runnable program. A macOS .app bundle (e.g.
// "/Applications/PyMOL.app", which the Browse dialog's default behavior lets
// a person select directly -- see resolveAppBundleExecutable's own comment)
// is exactly such a directory: fs.accessSync(..., X_OK) on it returns
// successfully even though spawn()'ing it directly fails with EACCES, since
// it isn't actually an executable file. Without isFile() here, this check
// reported a selected .app bundle as "found and executable" (a green
// checkmark in Settings), which is why the problem persisted even after a
// person went to Settings, used Browse, and saved -- Browse returned the
// bundle path, this verification incorrectly approved it, and every
// subsequent PyMOL launch kept failing identically regardless of how many
// times the same path was re-saved.
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

// Resolves a selected macOS .app bundle down to its real internal executable.
// On macOS, Electron's dialog.showOpenDialog treats a .app bundle as a single
// selectable "file" by default (it doesn't let a person navigate INSIDE it
// the way a normal folder works) -- so a person naturally picking "PyMOL.app"
// from /Applications, the only sensible thing to click on in Finder without
// knowing PyMOL's own internal folder layout, gets back the bundle's own
// top-level path (e.g. "/Applications/PyMOL.app"), not the real Unix
// executable spawn() actually needs (e.g.
// "/Applications/PyMOL.app/Contents/MacOS/PyMOL").
//
// Uses macOS's own `plutil` (a standard system utility on every real Mac, not
// a new dependency) to read Contents/Info.plist's CFBundleExecutable -- the
// bundle's own, authoritative declaration of which file inside
// Contents/MacOS/ is the real entry point -- rather than guessing a filename
// from the bundle's own name (which can legitimately differ, and would be
// fragile for any app whose internal executable isn't simply "the bundle name
// minus .app"). Falls back to that same-name guess only if plutil/Info.plist
// parsing fails for some reason, and returns the ORIGINAL path unchanged (not
// a second, potentially-also-wrong guess) if even that isn't a real file --
// verifyPymolPath's own isFile() check then correctly flags it as invalid
// rather than silently accepting a fabricated path.
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
    // plutil missing/failed, or Info.plist malformed -- fall through to the
    // same-name guess below rather than giving up immediately.
  }

  const bundleName = path.basename(selectedPath, ".app");
  const guessed = path.join(selectedPath, "Contents", "MacOS", bundleName);
  return fs.existsSync(guessed) ? guessed : selectedPath;
}

// ------------------------------------------------------------
// Internal-only PyMOL diagnostic log. Never surfaced to the renderer or shown
// in any user-facing UI -- , Astra3's audience is not expected to be
// comfortable reading raw technical errors, so every user-facing PyMOL
// problem gets a plain-language message instead (see PymolSetupDialog in
// app.jsx). This exists purely so a developer investigating a bug report has
// a real, timestamped record of what was actually detected/tried, without
// needing to reproduce the problem live. Capped and rotated by truncating to
// the most recent ~500 lines on write, so it can't grow unbounded over a
// long-running install.
const PYMOL_LOG_FILE = path.join(TOOLS_DIR, "pymol-diagnostic.log");
function logPymolEvent(event, details = {}) {
  try {
    fs.mkdirSync(TOOLS_DIR, { recursive: true });
    const line = `[${new Date().toISOString()}] ${event} ${JSON.stringify(details)}\n`;
    let existing = "";
    try { existing = fs.readFileSync(PYMOL_LOG_FILE, "utf-8"); } catch { /* no log yet, or unreadable -- start a fresh one rather than failing the write */ }
    const lines = (existing + line).split("\n").filter(Boolean);
    const trimmed = lines.slice(-500).join("\n") + "\n";
    fs.writeFileSync(PYMOL_LOG_FILE, trimmed, "utf-8");
  } catch {
    // Logging itself must never be able to break the actual feature it's
    // logging about -- best-effort only.
  }
  console.log(`[pymol] ${event}`, details);
}

// resolveAppBundleExecutable and verifyPymolPath together only ever confirmed
// "this is a real, executable FILE" -- neither one checks whether that file
// is actually PyMOL. Selecting ANY other installed application's real
// executable (reported directly, twice, with two different unrelated apps:
// VLC and X-VPN) resolved correctly to that app's own real binary, passed the
// existing checks cleanly, got saved, and Astra3 tried to launch it with
// PyMOL's own "-cq <script>" arguments -- which an unrelated app naturally
// doesn't understand, producing its own unrelated output (VLC's own CLI
// error; X-VPN launching its own GUI and printing its own internal log lines)
// instead of a clear "that's not PyMOL" message before ever getting that far.
//
// A related case: an
// earlier version of this check only watched passively for PyMOL's own
// startup banner text and never saw it against a real, correctly installed
// PyMOL. A stdin-probing version fixed that specific case but was made
// advisory-only out of caution about a repeat false rejection -- which then
// let X-VPN straight through, since an advisory check that never blocks
// anything provides no real protection at all. Both problems come from the
// same root cause: genuinely not knowing how a bare "-cq" prompt handles raw
// input typed at it.
//
// This version sidesteps that uncertainty rather than guessing again: instead
// of typing anything at PyMOL's own interactive prompt, it writes a tiny
// temporary Python script and launches the candidate with the EXACT SAME "-cq
// <script.py>" invocation pymol-bridge.js already uses for the real astra3.py
// launch (see start() below) -- the one PyMOL interaction this whole app
// already depends on and knows works, rather than a separate, unverified
// assumption about typed-at-the-prompt behavior. If a candidate can't run
// this the same way it would need to run astra3.py itself, it couldn't run a
// real analysis either, so this is testing exactly the right thing. The temp
// script prints a distinctive marker plus a real arithmetic result (so a
// match proves evaluation happened, not just text pass-through) and exits on
// its own -- no indefinite prompt to time out against, no guessing when a
// REPL is "ready" for input.
//
// A plain-language explanation of why the most recent verifyIsRealPymol()
// call failed, when the failure has a specific, fixable cause (an Intel-only
// PyMOL on an Apple Silicon Mac without Rosetta, for example). null when the
// last check passed or failed for the generic "not PyMOL" reason.
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
      try { proc?.kill(); } catch { /* already exited -- this path runs on both success and timeout */ }
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
      const explained = describePymolLaunchError(e, candidatePath, process.platform, process.arch);
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
      // Unlike a bare "-cq" prompt (which real PyMOL sits waiting at
      // indefinitely), running a SCRIPT this way means real PyMOL finishes
      // and exits on its own once the script completes -- matching a real
      // astra3.py run's own eventual "Ready for next PDB." exit. If the
      // marker never appeared before exit, this is a real negative signal
      // regardless of exit code, not just an early-exit heuristic.
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

// Where Astra3 writes its output (Protein_outputs/ and everything under it).
// Astra3's own Python side (astra3_core.py's detect_base_dir()) picks a base
// directory on its own if nothing overrides it -- normally by walking up from
// wherever astra3.py itself lives, which is INSIDE this app's install
// location, not a place a user would expect their analysis results to end up
// or want to browse to. ASTRA3_BASE_DIR is an env var detect_base_dir()
// already checks first (see astra3_core.py) -- setting it here from the same
// value the Settings page shows as "Default output directory" is what makes
// that setting actually control where files go, instead of being a GUI-only
// value nothing downstream ever reads. Persisted the same way pymol_path.txt
// is, so it survives an app restart without the renderer needing to resend it
// on every launch.
const OUTPUT_DIR_FILE = path.join(TOOLS_DIR, "output_dir.txt");

function readOutputDir() {
  try {
    const raw = fs.readFileSync(OUTPUT_DIR_FILE, "utf-8").trim();
    return raw || null;
  } catch {
    return null; // not set yet -- Astra3's own detect_base_dir() fallback applies
  }
}

// Expands a leading "~" to the user's home directory. Electron's own native
// folder picker (dialog.showOpenDialog) always returns real absolute paths
// and never does this, but the shipped default value
// (DEFAULT_SETTINGS.outputDir in app.jsx) uses "~/..." for readability, and
// someone could also type a "~/..." path into the Settings text field
// directly. Without this, that path would reach Python's own
// Path(env).resolve() call literally -- Python does NOT expand "~" there, so
// it would resolve to a bogus "<cwd>/~/..." path instead of the person's
// actual home directory.
function expandHome(p) {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function writeOutputDir(newPath) {
  fs.mkdirSync(TOOLS_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_DIR_FILE, expandHome(newPath), "utf-8");
}

// The GUI's "Default output directory" setting is the Protein_outputs folder
// itself (e.g. ".../Astra3 (MacOS)/Protein_outputs", matching every place the
// renderer builds paths like `${settings.outputDir}/ <ID>_Output`). Astra3's
// own PROTEIN_OUTPUTS_DIR is BASE_DIR + "Protein_outputs" (BASE_DIR is what
// ASTRA3_BASE_DIR overrides) -- so the env var needs to be the PARENT of the
// GUI's outputDir, or Python would append "Protein_outputs" a second time.
// Output location used when the person has not chosen one.
//
// PyMOL writes into a folder literally named "Protein_outputs" beneath
// ASTRA3_BASE_DIR, and the base handed to it is dirname(outputDir) -- so the
// configured path must end in that folder name for the two to agree.
function defaultOutputDir() {
  return path.join(app.getPath("documents"), "Astra3", "Protein_outputs");
}

// Always resolves to a concrete directory. Returning null here would leave
// ASTRA3_BASE_DIR unset, and Astra3 would then fall back to its own guess
// (the process working directory) and write results somewhere the interface
// is not looking.
function resolveAstraBaseDir() {
  const outputDir = readOutputDir() || defaultOutputDir();
  return path.dirname(outputDir);
}

// Recursively totals the bytes under a directory, for the storage figures on
// the History page. Per-entry errors are skipped rather than abandoning the
// total, so one unreadable file costs its own size and not the whole figure.
function directorySizeBytes(target) {
  let total = 0;
  let entries;
  try {
    entries = fs.readdirSync(target, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(target, entry.name);
    try {
      const st = fs.statSync(full);
      if (st.isDirectory()) total += directorySizeBytes(full);
      else if (st.isFile()) total += st.size;
    } catch {
      // Unreadable or vanished mid-walk.
    }
  }
  return total;
}

// True for a directory Astra3 created for a run. Every output folder it makes
// is "<label>_Output". Shared by the size measurement and the delete so the
// figure reported and the set removed are always the same.
function isAstraRunFolder(fullPath, name) {
  if (!/_Output$/i.test(name)) return false;
  try {
    return fs.statSync(fullPath).isDirectory();
  } catch {
    return false;
  }
}

// astra3.py's own location. Unlike the PyMOL executable (which can be
// installed anywhere on the user's machine and genuinely needs a one-time
// picker), astra3.py always ships in the same place relative to this app: a
// "python/" folder next to "gui/" in development, and under
// process.resourcesPath (via the same extraResources mechanism as tools/) in
// a packaged build. There is nothing for the user to configure here, so this
// is computed, not read from a settings file.
function resolveAstraScriptPath() {
  const devPath = path.join(__dirname, "..", "..", "python", "astra3.py");
  const packagedPath = path.join(process.resourcesPath || "", "python", "astra3.py");
  if (isDev && fs.existsSync(devPath)) return devPath;
  if (fs.existsSync(packagedPath)) return packagedPath;
  if (fs.existsSync(devPath)) return devPath; // last resort, e.g. running packaged=false from an unusual layout
  return null; // genuinely missing -- surfaced as a setup error rather than silently guessed at
}
const ASTRA_SCRIPT_PATH = resolveAstraScriptPath();

// Same dev-vs-packaged resolution pattern as resolveAstraScriptPath above,
// for the Citation & Docs page's own README/LICENSE/CITATION.cff/
// THIRD_PARTY_NOTICES.txt viewer -- these live at the repo root (or gui/ for
// THIRD_PARTY_NOTICES.txt) in dev, and under process.resourcesPath/docs/ in a
// packaged build (see package.json's own extraResources entry for these exact
// files).
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
    // hiddenInset keeps the native traffic lights but inlays them into the
    // application's own top bar, which is the standard macOS treatment for an
    // app with a custom toolbar. The buttons remain real system controls, so
    // their behaviour, hit targets and accessibility are unchanged, and macOS
    // hides them automatically in fullscreen.
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
  // Pushed rather than polled, so the interface reacts on the same frame the
  // window actually changes.
  const sendFullScreen = (value) => {
    try { mainWindow.webContents.send("window:fullscreen-changed", value); } catch { /* window closing */ }
  };
  mainWindow.on("enter-full-screen", () => sendFullScreen(true));
  mainWindow.on("leave-full-screen", () => sendFullScreen(false));


  // Load the local, already-built renderer -- never localhost, never a dev
  // server. This is the actual point of the desktop conversion: no `python3
  // -m http.server`, no browser, just a file on disk.
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
// Application menu (minimal, native-feeling; includes an About panel that
// uses the Astra3 icon, per the branding requirement)
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
// Astra3 needs no location, camera, microphone, notifications or other
// device access. Every web permission is refused without asking, so nothing
// in the window can raise a system permission prompt. The one exception is
// writing to the clipboard, which the Copy citation button uses.
const ALLOWED_PERMISSIONS = new Set(["clipboard-sanitized-write"]);
function denyDevicePermissions() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(ALLOWED_PERMISSIONS.has(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission));
}

// ------------------------------------------------------------
// Navigation guard
// ------------------------------------------------------------
// Every window and frame stays on Astra3's own page: the main frame on
// renderer/index.html, subframes (the in-app report) on their srcdoc. A web
// link (http, https, mailto) opens in the person's own browser; anything
// else is refused. This covers report links, target="_blank" links and files
// dropped on the window, none of which should ever load inside the app.
const APP_PAGE = path.resolve(__dirname, "..", "renderer", "index.html").toLowerCase();

function isAppPage(url) {
  const bare = String(url || "").split(/[?#]/)[0];
  if (!/^file:/i.test(bare)) return false;
  try {
    return path.resolve(require("url").fileURLToPath(bare)).toLowerCase() === APP_PAGE;
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
    const allowed = event.isMainFrame ? isAppPage(url) : /^about:(srcdoc|blank)(#.*)?$/i.test(url);
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
// See pymol-bridge.js for the actual spawn/stdin/stdout handling -- kept in
// its own module so this file stays focused on window/app lifecycle. Wired
// together at the bottom of this file.
// -- The Astra3 Engine --
// Astra3's Python run as WebAssembly by this app's own executable (see
// engine/astra3-engine.js), with images drawn in the "Astra3 Engine" window
// (engine-window.js). Packaged builds keep engine/ outside the archive.
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
// IPC handlers: the ONLY surface the renderer can reach, via preload.js's
// contextBridge. Every handler here is deliberately narrow (a specific
// action, not "run arbitrary code") to keep the renderer sandboxed even
// though it's asking a privileged process to do things on its behalf.
// ------------------------------------------------------------

// -- Filesystem / dialogs --
// Since Electron 43 a dialog given no starting folder opens in Downloads, and
// the system no longer returns to the folder last used. Each kind of dialog
// remembers its own folder for the session instead.
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

// Dedicated picker for "select your PyMOL installation" specifically
// (Settings' own Browse button), kept separate from the general
// dialog:openFile handler above (used for structure-file imports, which have
// no reason to special-case .app bundles). See resolveAppBundleExecutable's
// own comment for why this exists: on macOS, .app is selectable as a single
// "file" by default, and the bundle's own top-level path is not what spawn()
// actually needs.
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

// -- Clipboard --
// Copy buttons write through Electron's clipboard, not the web Clipboard API.
// Inside the report's srcdoc frame the web API depends on document focus and
// a permission check, which the in-app report does not reliably have.
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
  // Node's errors cross the IPC boundary verbatim, so a missing file would
  // otherwise surface in the interface as an errno and an internal method
  // name. Each failure is turned into a sentence instead. Thrown rather than
  // returned so existing .catch paths keep working unchanged.
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

// Lists filenames (not full paths) in a directory -- used by the Reports
// page's Images tab to discover which .png files a run actually produced,
// rather than assuming a fixed set of names. Returns [] (not an error) for a
// missing/inaccessible directory, since "no images yet" and "folder doesn't
// exist" should both just render as an empty gallery, not a thrown error the
// caller has to handle specially.
ipcMain.handle("fs:listDir", async (_e, dirPath) => {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => e.name);
  } catch {
    return [];
  }
});

// Same idea, but for subdirectory NAMES rather than files -- used to find a
// run's real output folder by searching for it (matching a prefix/contains
// pattern) rather than assuming an exact computed name. astra3_security.py's
// own sanitization rules (strip anything outside [A-Za-z0-9_-], collapse
// repeats) are simple enough to replicate, but doing so risks drifting out of
// sync if that rule ever changes on the Python side -- searching what's
// actually on disk sidesteps that entirely.
ipcMain.handle("fs:listSubdirs", async (_e, dirPath) => {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
});

// Reads a file and returns it as a data: URI -- used for displaying a local
// PNG in an <img> tag. Electron's renderer runs with contextIsolation/sandbox
// on and no direct filesystem access by design (see the security hardening
// pass), so images can't be pointed at with a bare file:// src the way a
// normal web page could; this mirrors the same read-via-IPC-then-hand-to-the-
// renderer pattern already used for the viewer's .pdb text and report HTML,
// just base64-encoded for binary image data instead of read as UTF-8 text.
ipcMain.handle("fs:readFileAsDataUri", async (_e, filePath) => {
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
  // Opens a file/folder with the OS default handler (e.g. HTML report in the
  // default browser, output folder in Finder/Explorer).
  if (!targetPath) return "No path was provided, so there was nothing to open.";
  // ChimeraX files open in a new ChimeraX: the default handler goes through
  // LaunchServices, which gives a file to the oldest ChimeraX running, and
  // that can be Astra3's hidden image helper.
  if (/\.(cxs|cxc)$/i.test(targetPath)) return openSessionFile(targetPath);
  if (!fs.existsSync(targetPath)) {
    return `This file no longer exists:\n${targetPath}\n\nIt may have been moved, renamed, or deleted since the run finished. Re-running the analysis will recreate it.`;
  }
  const errorMsg = await shell.openPath(targetPath);
  return errorMsg || null;
});

// Total size of the outputs folder plus a per-run breakdown, in one call: the
// History page needs both, and walking the tree twice would double the disk
// work on a large folder.
// Returns a small thumbnail of an image as a data URI.
//
// Astra3's renders are full-resolution ray traces (3000x2250 at excellent
// quality). Handing those to the interface unscaled is not viable: each one
// decodes to roughly 27 MB of bitmap memory regardless of how small it is
// displayed, so a gallery holding a dozen of them exhausts the renderer
// process and the window goes blank. Downscaling here means the interface
// receives a few hundred KB per image instead, and the full-resolution file
// on disk is untouched.
//
// Uses Electron's built-in nativeImage, so this adds no dependency.
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
    // A corrupt or unreadable image is not worth failing the gallery over;
    // the caller falls back to a placeholder card.
    return null;
  }
});

ipcMain.handle("fs:outputUsage", async (_e, outputDir) => {
  const result = { total: 0, folders: {}, exists: false };
  if (!outputDir || !fs.existsSync(outputDir)) return result;
  result.exists = true;
  let entries;
  try {
    entries = fs.readdirSync(outputDir, { withFileTypes: true });
  } catch (e) {
    return { ...result, error: e.message };
  }
  for (const entry of entries) {
    const full = path.join(outputDir, entry.name);
    if (!isAstraRunFolder(full, entry.name)) continue;
    const size = directorySizeBytes(full);
    result.folders[entry.name] = size;
    result.total += size;
  }
  return result;
});

// Deletes every Astra3 run folder inside the outputs directory.
//
// This is the only destructive operation in the application, and the path it
// operates on comes from a text field the user can type anything into. It
// therefore refuses system and personal directories outright, and removes
// only directories matching Astra3's own "<label>_Output" naming -- so a
// folder that also holds the user's own files is left intact.
ipcMain.handle("fs:clearOutputs", async (_e, outputDir) => {
  if (!outputDir) return { ok: false, error: "No output folder is configured." };
  const resolved = path.resolve(outputDir);
  const forbidden = [
    path.parse(resolved).root,
    app.getPath("home"),
    app.getPath("documents"),
    app.getPath("desktop"),
    app.getPath("downloads"),
  ].map((p) => path.resolve(p));
  if (forbidden.includes(resolved)) {
    return { ok: false, error: `Refusing to delete "${resolved}" -- that is a system or personal folder, not an Astra3 outputs folder. Check the output folder setting.` };
  }
  if (!fs.existsSync(resolved)) return { ok: true, deleted: 0, freed: 0, skipped: 0, failures: [] };
  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch (e) {
    return { ok: false, error: `Could not read "${resolved}": ${e.message}` };
  }
  if (!stat.isDirectory()) return { ok: false, error: `"${resolved}" is not a folder.` };

  let deleted = 0;
  let freed = 0;
  let skipped = 0;
  const failures = [];
  for (const entry of fs.readdirSync(resolved, { withFileTypes: true })) {
    const full = path.join(resolved, entry.name);
    if (!isAstraRunFolder(full, entry.name)) { skipped += 1; continue; }
    try {
      const size = directorySizeBytes(full);
      fs.rmSync(full, { recursive: true, force: true });
      deleted += 1;
      freed += size;
    } catch (e) {
      // Reported by name rather than swallowed: a file still open elsewhere
      // is the usual cause and is something the user can act on.
      failures.push(`${entry.name}: ${e.message}`);
    }
  }
  return { ok: failures.length === 0, deleted, freed, skipped, failures };
});

// Opens a PyMOL session by launching the configured PyMOL directly.
//
// macOS will open a .pse through LaunchServices only if PyMOL has registered
// the type, which depends on how it was installed. Launching the executable
// the application already knows about is deterministic and avoids depending
// on that registration.
// Related Structures tab: searches RCSB from the main process, where network
// access and timeouts are controlled; the renderer only displays results.
ipcMain.handle("related:find", async (_e, query) => {
  const { findRelatedStructures } = require("./related-structures");
  return findRelatedStructures(query || {});
});

// Quick View on the 3D Viewer page: a structure's coordinates without an
// analysis (see quick-view.js). Temporary IDs are this session's imports.
ipcMain.handle("viewer:quickView", async (_e, request) => {
  const { quickView } = require("./quick-view");
  return quickView(request || {}, pymolBridge.importList());
});

// On macOS a session opens through LaunchServices (`open -n -a`), so PyMOL or
// ChimeraX runs as itself rather than as Astra3's child. Started as a child,
// anything it changes inside an app bundle is attributed to Astra3, and macOS
// blocks it with a "prevented from modifying apps" notice. Returns false
// when the program is not inside an .app bundle.
function openWithMacApp(exePath, filePath) {
  if (process.platform !== "darwin") return false;
  const m = String(exePath || "").match(/^(.*?\.app)(?:\/|$)/);
  if (!m || !fs.existsSync(m[1])) return false;
  // -n: a new copy, so the session never goes to Astra3's hidden image
  // helper (a ChimeraX already running with its window hidden).
  const child = spawn("open", ["-n", "-a", m[1], filePath], { detached: true, stdio: "ignore" });
  child.unref();
  return true;
}

// Opens a saved session for the person to work in: ChimeraX sessions and
// command files in ChimeraX, PyMOL sessions in PyMOL, and an Astra3 Engine
// session in ChimeraX through the .cxc beside it when PyMOL is not installed.
// Returns null, or a message saying why it could not be opened.
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
    // A session from the Astra3 Engine: its ChimeraX command file opens the
    // same scene in ChimeraX.
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

// Removes only what a given run wrote, judged by modification time, and
// prunes any directory left empty afterwards.
//
// Output folders are named after the structure, so re-running one reuses the
// folder its previous run wrote into. Deleting the whole folder to clean up a
// cancelled re-run therefore took the EARLIER run's output with it -- its
// report included, leaving a History entry pointing at a file that no longer
// existed. Anything older than the cancelled run started is not that run's to
// delete.
function removeEntriesNewerThan(dir, cutoff) {
  let removed = 0;
  let freed = 0;
  let kept = 0;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return { removed, freed, kept: 1 };
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const inner = removeEntriesNewerThan(full, cutoff);
      removed += inner.removed;
      freed += inner.freed;
      if (inner.kept === 0) {
        try { fs.rmdirSync(full); } catch { kept += 1; }
      } else {
        kept += inner.kept;
      }
      continue;
    }
    let stat;
    try { stat = fs.statSync(full); } catch { kept += 1; continue; }
    if (stat.mtimeMs >= cutoff) {
      try { fs.rmSync(full, { force: true }); removed += 1; freed += stat.size; }
      catch { kept += 1; }
    } else {
      kept += 1;
    }
  }
  return { removed, freed, kept };
}

// Deletes a chosen subset of run folders rather than everything in the
// output directory. Reuses the same guards as fs:clearOutputs: the parent
// must not be a system or personal folder, and only directories that look
// like Astra3's own run folders are ever removed, so a folder name supplied
// by the renderer cannot be used to delete something else. Folder names are
// matched by basename only -- any path separator in the input is rejected
// rather than resolved, so a name like "../.." cannot escape the output
// directory.
ipcMain.handle("fs:deleteRunFolders", async (_e, { outputDir, folderNames, newerThan }) => {
  if (!outputDir) return { ok: false, error: "No output folder is configured." };
  if (!Array.isArray(folderNames) || folderNames.length === 0) {
    return { ok: true, deleted: 0, freed: 0, failures: [] };
  }
  const resolved = path.resolve(outputDir);
  const forbidden = [
    path.parse(resolved).root,
    app.getPath("home"),
    app.getPath("documents"),
    app.getPath("desktop"),
    app.getPath("downloads"),
  ].map((p) => path.resolve(p));
  if (forbidden.includes(resolved)) {
    return { ok: false, error: `Refusing to delete inside "${resolved}" -- that is a system or personal folder, not an Astra3 outputs folder.` };
  }
  if (!fs.existsSync(resolved)) return { ok: true, deleted: 0, freed: 0, failures: [] };

  let deleted = 0;
  let freed = 0;
  let skipped = 0;
  const failures = [];
  for (const raw of folderNames) {
    const name = String(raw || "");
    if (!name || name !== path.basename(name) || name === "." || name === "..") {
      failures.push(`${name}: not a plain folder name`);
      continue;
    }
    const full = path.join(resolved, name);
    if (path.dirname(path.resolve(full)) !== resolved) {
      failures.push(`${name}: resolves outside the output folder`);
      continue;
    }
    if (!fs.existsSync(full)) { skipped += 1; continue; }
    if (!isAstraRunFolder(full, name)) { skipped += 1; continue; }
    try {
      // newerThan scopes the delete to one run's own output. Without it the
      // whole folder goes, which is right for History's "clear files" but
      // wrong for cleaning up after a cancelled re-run.
      if (typeof newerThan === "number" && newerThan > 0) {
        const scoped = removeEntriesNewerThan(full, newerThan);
        freed += scoped.freed;
        if (scoped.kept === 0) {
          try { fs.rmdirSync(full); } catch { /* empty either way */ }
        }
        if (scoped.removed > 0) deleted += 1;
      } else {
        const size = directorySizeBytes(full);
        fs.rmSync(full, { recursive: true, force: true });
        deleted += 1;
        freed += size;
      }
    } catch (e) {
      failures.push(`${name}: ${e.message}`);
    }
  }
  return { ok: failures.length === 0, deleted, freed, skipped, failures };
});

// Opens several images as ONE browsable set rather than one window per file.
//
// macOS: Preview accepts multiple paths in a single invocation and shows them
// in one window with its own sidebar/scroller, which is the behaviour asked
// for. Opening each path separately instead produces a stack of windows.
//
// Windows has no direct equivalent -- Photos takes a single file and then
// arrows through that file's containing folder. Opening the first selected
// image gives the closest thing: one window, with the rest reachable by arrow
// key, provided they share a folder. When the selection spans folders the set
// is grouped and the first of each is opened, so nothing is silently dropped.
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
      // Falls through to the per-file path below rather than failing: a
      // missing or renamed Preview is not a reason to open nothing.
      failures.push(`Preview could not be launched (${e.message}); opened individually instead.`);
    }
  }

  if (process.platform === "win32") {
    // Every selected file is opened. An earlier version opened only the first
    // image in each folder, on the reasoning that the Windows viewer can arrow
    // through the rest of the folder -- but selecting four images from one run
    // then opened exactly one, and the other three simply never appeared. The
    // viewer's folder navigation is a convenience, not a substitute for
    // opening what was asked for.
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
  // Viewer screenshots (see renderer's ViewerPage.takeScreenshot) come in as
  // a data: URI from $3Dmol's own pngURI() -- the renderer has no direct
  // filesystem write access by design (see the security hardening pass), so
  // this is the one place that actually decodes and writes the PNG bytes,
  // behind a native "Save As" dialog rather than silently writing somewhere
  // the user didn't choose.
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

// App / environment info -- Fullscreen state, so the interface can collapse
// its own chrome to match. macOS hides the menu bar and window controls
// natively in fullscreen; the application's own top bar has to be told.
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
// Real existence/executability check -- see verifyPymolPath's own comment for
// why getPymolPath() alone (a saved string) is not sufficient to know PyMOL
// is actually installed and runnable. explicitPath lets a caller check a
// candidate BEFORE it's saved (e.g. Settings verifying whatever is currently
// typed); omitted or falsy falls back to the currently-saved path.
ipcMain.handle("app:verifyPymolPath", async (_e, explicitPath) => verifyPymolPath(explicitPath || readPymolPath()));
// Real "is this actually PyMOL" check -- see verifyIsRealPymol's own comment.
// Deliberately separate from app:verifyPymolPath above (a fast, synchronous
// file check) since this one actually launches the candidate and can take a
// few seconds; callers explicitly opt into the slower, stronger check rather
// than paying its cost on every keystroke.
ipcMain.handle("app:verifyIsRealPymol", async (_e, candidatePath) => verifyIsRealPymol(candidatePath));
ipcMain.handle("app:pymolVerifyProblem", async () => lastPymolVerifyProblem);
ipcMain.handle("app:setPymolPath", async (_e, newPath) => {
  writePymolPath(newPath);
  return true;
});
// Explicit, user-confirmed app restart -- used specifically after changing
// the PyMOL executable path in Settings (: a changed path can't safely take
// effect for an ALREADY launched PyMOL process, since pymol-bridge.js only
// reads it fresh at the start of a new start() call, and a full relaunch is
// the simplest, safest way to guarantee every part of the app -- not just the
// next spawned PyMOL process -- is working from the new path). app.relaunch()
// queues a new launch of this same app; app.exit(0) then quits the current
// instance immediately (a clean, intentional exit, not a crash) so the queued
// relaunch actually starts.
ipcMain.handle("app:restartApp", async () => {
  app.relaunch();
  app.exit(0);
});
// astra3.py's location is resolved automatically (see resolveAstraScriptPath
// above) -- there is nothing for the user to set, so only a getter is
// exposed, used by the setup-status banner to confirm the script was found.
ipcMain.handle("app:getAstraScriptPath", async () => ASTRA_SCRIPT_PATH);
ipcMain.handle("app:getOutputDir", async () => readOutputDir());
ipcMain.handle("app:setOutputDir", async (_e, newPath) => {
  writeOutputDir(newPath);
  // PyMOL only reads ASTRA3_BASE_DIR once, at its own startup -- a change
  // here has no effect on an already-running PyMOL process. Report that back
  // so the renderer can tell the person a restart is needed, instead of the
  // setting silently appearing to do nothing if they change it mid-session.
  return { ok: true, requiresRestart: pymolBridge.isRunning() };
});

// -- PyMOL bridge --
ipcMain.handle("pymol:start", async () => pymolBridge.start());
ipcMain.handle("pymol:stop", async () => pymolBridge.stop());
ipcMain.handle("pymol:isRunning", async () => pymolBridge.isRunning());
ipcMain.handle("pymol:runCommand", async (_e, commandString) => pymolBridge.runCommand(commandString));
ipcMain.handle("pymol:runImportCommand", async (_e, filePath) => pymolBridge.runImportCommand(filePath));
ipcMain.handle("pymol:cancel", async () => pymolBridge.cancel());
ipcMain.handle("pymol:answerPrompt", async (_e, answer) => pymolBridge.answerPrompt(answer));
// Current imports, for the Import page.
ipcMain.handle("pymol:imports", async () => pymolBridge.importList());

// App-wide zoom -- for accessibility, some scientists reading dense
// report/console text may want everything larger than the app's default
// sizing. Uses Electron's own webContents zoom API (the same mechanism a real
// browser's Cmd/Ctrl +/-/0 uses) rather than a CSS transform hack: this
// correctly reflows layout, text wrapping, and every measurement-dependent
// bit of the UI together at the new scale, instead of visually
// stretching/blurring a fixed-size render. Clamped to a sane range (50%-200%)
// so it can't be driven to an unusable extreme by repeated key presses.
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

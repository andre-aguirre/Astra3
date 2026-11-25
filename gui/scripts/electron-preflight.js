#!/usr/bin/env node
// ============================================================
// Astra3: Electron installation preflight/diagnostic
// ============================================================
// Run with `npm run preflight`, or through the `prestart` hook in
// package.json. Checks the Electron installation for a partly extracted
// Electron.app or a missing or malformed node_modules/electron/path.txt,
// which Electron reports only as "Electron failed to install correctly".
//
// It inspects the installation and reports what it finds. With --repair
// it also fixes the two problems described above runRepair(); it never
// downloads or re-signs anything.
// ============================================================

const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const os = require("os");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const ELECTRON_DIR = path.join(PROJECT_ROOT, "node_modules", "electron");
const PATH_TXT = path.join(ELECTRON_DIR, "path.txt");
const DIST_DIR = path.join(ELECTRON_DIR, "dist");

const args = process.argv.slice(2);
const REPAIR_MODE = args.includes("--repair");
const VERBOSE = args.includes("--verbose");
// --advisory (the prestart hook): report problems without stopping `npm start`.
const ADVISORY_MODE = args.includes("--advisory");

let checksRun = 0;
let checksPassed = 0;
let checksFailed = 0;
let checksWarned = 0;
const failures = []; // collected for the final summary + --repair targeting

function reportPass(label, detail) {
  checksRun++; checksPassed++;
  console.log(`  \x1b[32m\u2713\x1b[0m ${label}` + (detail ? ` \x1b[90m(${detail})\x1b[0m` : ""));
}
function reportFail(label, detail, repairHint) {
  checksRun++; checksFailed++;
  console.log(`  \x1b[31m\u2717\x1b[0m ${label}`);
  if (detail) console.log(`    \x1b[90m${detail}\x1b[0m`);
  failures.push({ label, detail, repairHint });
}
function reportWarn(label, detail) {
  checksRun++; checksWarned++;
  console.log(`  \x1b[33m\u26a0\x1b[0m ${label}` + (detail ? ` \x1b[90m(${detail})\x1b[0m` : ""));
}
function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

// ------------------------------------------------------------
// 1. Electron package exists
// ------------------------------------------------------------
function checkPackageExists() {
  section("1. Electron package");
  if (!fs.existsSync(ELECTRON_DIR)) {
    reportFail(
      "node_modules/electron is missing",
      "Run `npm install` first.",
      "install"
    );
    return false;
  }
  reportPass("node_modules/electron exists");
  return true;
}

// ------------------------------------------------------------
// 2. Electron version matches package.json
// ------------------------------------------------------------
function checkVersionMatches() {
  section("2. Version match");
  let declaredRange = null;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf-8"));
    declaredRange = (pkg.devDependencies && pkg.devDependencies.electron) || (pkg.dependencies && pkg.dependencies.electron);
  } catch (e) {
    reportWarn("Could not read package.json to compare versions", e.message);
    return;
  }
  let installedVersion = null;
  try {
    const electronPkg = JSON.parse(fs.readFileSync(path.join(ELECTRON_DIR, "package.json"), "utf-8"));
    installedVersion = electronPkg.version;
  } catch (e) {
    reportFail("Could not read installed electron package.json", e.message);
    return;
  }
  if (!declaredRange) {
    reportWarn("No electron entry found in package.json dependencies", `installed: ${installedVersion}`);
    return;
  }
  // Compares major versions only, which is enough to catch a stale install
  // left from an earlier version of the project.
  const declaredMajor = (declaredRange.match(/(\d+)/) || [])[1];
  const installedMajor = (installedVersion.match(/^(\d+)/) || [])[1];
  if (declaredMajor && installedMajor && declaredMajor !== installedMajor) {
    reportFail(
      `Installed Electron v${installedVersion} does not match package.json's declared "${declaredRange}"`,
      "A major-version mismatch usually means node_modules/electron is stale. Try `npm install` again.",
    );
  } else {
    reportPass(`Installed version v${installedVersion} matches package.json ("${declaredRange}")`);
  }
}

// ------------------------------------------------------------
// 3/4/5. path.txt existence, contents, and trailing-newline check
// ------------------------------------------------------------
// Electron's index.js does:
//   executablePath = fs.readFileSync(pathFile, 'utf-8')
//   ... path.join(__dirname, 'dist', executablePath)
// with NO trimming of the read value. A trailing newline (e.g. from
// `echo` or `printf '%s\n'` instead of `printf '%s'`) makes
// executablePath literally end in "\n", which path.join preserves,
// producing a path that doesn't exist on disk -> ENOENT when spawned.
function checkPathTxt() {
  section("3-5. path.txt");
  if (!fs.existsSync(PATH_TXT)) {
    reportFail(
      "node_modules/electron/path.txt is missing",
      "This is the file Electron's own index.js reads to find its executable. Without it, Electron throws " +
      '"Electron failed to install correctly" even if the actual Electron.app is fine.',
      "path.txt"
    );
    return;
  }
  reportPass("path.txt exists");

  const raw = fs.readFileSync(PATH_TXT, "utf-8");
  if (raw.length === 0) {
    reportFail("path.txt is empty", null, "path.txt");
    return;
  }

  const hasTrailingNewline = /\r?\n$/.test(raw);
  if (hasTrailingNewline) {
    reportFail(
      "path.txt has a trailing newline",
      `Electron's index.js does not trim this file's contents before using it in path.join(), so a ` +
      `trailing newline becomes part of the executable path and causes ENOENT when Electron tries to ` +
      `spawn itself. Raw bytes: ${JSON.stringify(raw)}`,
      "path.txt"
    );
    return;
  }
  reportPass("path.txt has no trailing newline", JSON.stringify(raw));

  // Expected: "Electron.app/Contents/MacOS/Electron" on macOS,
  // "electron.exe" on Windows, "electron" on Linux. Checked loosely: check 7
  // tests whether the resolved file exists.
  const expectedFragment = process.platform === "darwin" ? "Electron.app"
    : process.platform === "win32" ? ".exe"
    : "electron";
  if (!raw.includes(expectedFragment)) {
    reportWarn(
      `path.txt's contents don't look like a typical ${process.platform} Electron path`,
      `contents: "${raw}"`
    );
  } else {
    reportPass("path.txt contents look plausible for this platform", `"${raw}"`);
  }
}

// ------------------------------------------------------------
// 6/7. Electron.app / executable existence
// ------------------------------------------------------------
function resolveExecutablePath() {
  if (!fs.existsSync(PATH_TXT)) return null;
  // Not trimmed, because Electron does not trim it either.
  const raw = fs.readFileSync(PATH_TXT, "utf-8");
  return path.join(DIST_DIR, raw);
}

function checkAppAndExecutable() {
  section("6-7. Electron.app / executable");
  if (!fs.existsSync(DIST_DIR)) {
    reportFail("node_modules/electron/dist is missing entirely", null, "install");
    return null;
  }
  const distContents = fs.readdirSync(DIST_DIR);
  reportPass(`dist/ exists`, `${distContents.length} entr${distContents.length === 1 ? "y" : "ies"}`);

  if (process.platform === "darwin") {
    const appPath = path.join(DIST_DIR, "Electron.app");
    if (!fs.existsSync(appPath)) {
      reportFail("Electron.app is missing from dist/", null, "reextract");
      return null;
    }
    // An Electron.app with only a few files (about 252 KB) is one whose
    // postinstall extraction stopped partway.
    let fileCount = 0;
    try {
      const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else fileCount++;
        }
      };
      walk(appPath);
    } catch (e) {
      reportWarn("Could not fully walk Electron.app to count files", e.message);
    }
    if (fileCount > 0 && fileCount < 20) {
      reportFail(
        `Electron.app exists but only contains ${fileCount} file(s)`,
        "A healthy Electron.app bundle contains dozens of files (frameworks, resources, the main " +
        "executable, etc). This few files strongly suggests the postinstall extraction was interrupted " +
        "or failed partway through, leaving a corrupt, incomplete app bundle rather than a real one.",
        "reextract"
      );
      return null;
    }
    reportPass("Electron.app looks fully extracted", `${fileCount} files`);
  }

  const execPath = resolveExecutablePath();
  if (!execPath) {
    reportFail("Cannot resolve executable path (path.txt missing)", null, "path.txt");
    return null;
  }
  if (!fs.existsSync(execPath)) {
    reportFail(
      "The executable path.txt points to does not exist",
      `Resolved to: ${execPath}`,
      hasTrailingNewlineInPathTxt() ? "path.txt" : "reextract"
    );
    return null;
  }
  reportPass("Electron executable exists at the path path.txt specifies", execPath);
  return execPath;
}

function hasTrailingNewlineInPathTxt() {
  if (!fs.existsSync(PATH_TXT)) return false;
  return /\r?\n$/.test(fs.readFileSync(PATH_TXT, "utf-8"));
}

// ------------------------------------------------------------
// 8. Architecture match
// ------------------------------------------------------------
function checkArchitecture(execPath) {
  section("8. Architecture");
  if (!execPath) {
    reportWarn("Skipped: no resolved executable to check");
    return;
  }
  const hostArch = os.arch(); // 'arm64', 'x64', etc.
  let electronPkgArch = null;
  try {
    // The binary itself says which architecture it was built for.
    if (process.platform === "darwin" || process.platform === "linux") {
      const fileOut = spawnSync("file", [execPath], { encoding: "utf-8" });
      if (fileOut.status === 0) {
        const out = fileOut.stdout;
        if (/arm64/i.test(out)) electronPkgArch = "arm64";
        else if (/x86_64|x64/i.test(out)) electronPkgArch = "x64";
        if (VERBOSE) console.log(`    file(1) output: ${out.trim()}`);
      }
    }
  } catch (e) {
    // `file` is unavailable; the architecture is reported as unknown.
  }
  if (!electronPkgArch) {
    reportWarn("Could not determine the Electron binary's architecture (the `file` command may be unavailable)");
    return;
  }
  const hostArchNormalized = hostArch === "arm64" ? "arm64" : (hostArch === "x64" ? "x64" : hostArch);
  if (electronPkgArch !== hostArchNormalized) {
    reportFail(
      `Electron binary is ${electronPkgArch} but this machine is ${hostArchNormalized}`,
      "Running an x64 Electron under Rosetta on Apple Silicon (or vice versa) can work but is slower and " +
      "occasionally surfaces confusing native-module errors. Prefer reinstalling with the matching arch.",
    );
  } else {
    reportPass(`Electron binary architecture (${electronPkgArch}) matches host (${hostArchNormalized})`);
  }
}

// ------------------------------------------------------------
// 9. Executable is runnable (present and executable)
// ------------------------------------------------------------
function checkRunnable(execPath) {
  section("9. Executable permissions");
  if (!execPath) {
    reportWarn("Skipped: no resolved executable to check");
    return;
  }
  try {
    fs.accessSync(execPath, fs.constants.X_OK);
    reportPass("Executable has execute permission");
  } catch (e) {
    reportFail(
      "Executable does not have execute permission",
      `${execPath}; try: chmod +x "${execPath}"`,
    );
  }
}

// ------------------------------------------------------------
// 10. Code signing state (macOS only), for development. A release build
// also needs notarization (scripts/notarize.js).
// ------------------------------------------------------------
function checkCodeSigning(execPath) {
  if (process.platform !== "darwin") {
    return; // codesign and spctl are macOS tools
  }
  section("10. Code signing (macOS, development-only signal)");
  if (!execPath) {
    reportWarn("Skipped: no resolved executable to check");
    return;
  }
  const appPath = path.join(DIST_DIR, "Electron.app");
  if (!fs.existsSync(appPath)) {
    reportWarn("Skipped: Electron.app not found");
    return;
  }

  const verifyResult = spawnSync("codesign", ["--verify", "--deep", "--strict", appPath], { encoding: "utf-8" });
  if (verifyResult.status === 0) {
    reportPass("codesign --verify passes (app is validly signed, at least ad hoc)");
  } else {
    reportFail(
      "codesign --verify failed",
      (verifyResult.stderr || "").trim() ||
        "The app's signature is missing or broken. For local development this can be fixed with an ad-hoc " +
        "signature; this is NOT sufficient " +
        "for distributing a built app to other people, only for running it yourself.",
    );
  }

  const spctlResult = spawnSync("spctl", ["--assess", "--type", "execute", appPath], { encoding: "utf-8" });
  const spctlOutput = ((spctlResult.stdout || "") + (spctlResult.stderr || "")).trim();
  if (/revoked/i.test(spctlOutput)) {
    reportFail(
      "macOS Gatekeeper reports this Electron build's notarization has been REVOKED",
      "This is a real, upstream fact about this specific cached Electron download; not a false " +
      "positive to work around by disabling Gatekeeper globally. An ad-hoc local signature " +
      "(codesign --sign -) lets YOU run it for development; it does not un-revoke the original " +
      "signature or make the app suitable for distribution to others.",
    );
  } else if (spctlResult.status === 0) {
    reportPass("Gatekeeper assessment passes");
  } else {
    reportWarn("Gatekeeper assessment did not pass (but notarization was not reported as revoked)", spctlOutput.split("\n")[0]);
  }
}

// ------------------------------------------------------------
// 11. Electron can actually launch
// ------------------------------------------------------------
function checkCanLaunch(execPath) {
  section("11. Electron launch test");
  if (!execPath) {
    reportWarn("Skipped: no resolved executable to check");
    return;
  }
  try {
    const result = spawnSync(execPath, ["--version"], { encoding: "utf-8", timeout: 15000 });
    if (result.error) {
      reportFail("Electron --version failed to run", result.error.message);
      return;
    }
    if (result.status !== 0) {
      reportFail("Electron --version exited non-zero", (result.stderr || "").trim() || `exit code ${result.status}`);
      return;
    }
    reportPass("Electron launches and reports its version", (result.stdout || "").trim());
  } catch (e) {
    reportFail("Electron --version threw an exception", e.message);
  }
}

// ------------------------------------------------------------
// 12. Renderer can build
// ------------------------------------------------------------
function checkRendererBuilds() {
  section("12. Renderer build");
  const esbuildBin = findEsbuildBinary();
  const rendererEntry = path.join(PROJECT_ROOT, "renderer", "app.jsx");
  if (!fs.existsSync(rendererEntry)) {
    reportFail("renderer/app.jsx not found", rendererEntry);
    return;
  }
  if (!esbuildBin) {
    reportWarn(
      "esbuild not found (checked node_modules/.bin/esbuild)",
      "Run `npm install` to get the build:renderer script's dependency, then re-run this check.",
    );
    return;
  }
  const outFile = path.join(os.tmpdir(), `astra3-preflight-bundle-${Date.now()}.js`);
  const result = spawnSync(esbuildBin, [
    rendererEntry, "--bundle",
    "--jsx-factory=React.createElement", "--jsx-fragment=React.Fragment",
    "--external:react", "--external:react-dom",
    `--outfile=${outFile}`, "--format=iife",
  ], { encoding: "utf-8" });
  if (result.status === 0) {
    let size = null;
    try { size = fs.statSync(outFile).size; } catch (e) {}
    reportPass("renderer/app.jsx compiles cleanly with esbuild", size ? `${(size / 1024).toFixed(1)} KB` : null);
    try { fs.unlinkSync(outFile); } catch (e) {}
  } else {
    reportFail("renderer/app.jsx failed to compile", (result.stderr || "").trim());
  }
}

function findEsbuildBinary() {
  // On Windows, node_modules/.bin holds a .cmd shim, which Node no longer
  // starts without a shell (since 18.20.2 / 20.12.2); esbuild's own
  // executable needs none.
  if (process.platform === "win32") {
    const native = path.join(PROJECT_ROOT, "node_modules", "@esbuild", `win32-${process.arch}`, "esbuild.exe");
    if (fs.existsSync(native)) return native;
  }
  const localBin = path.join(PROJECT_ROOT, "node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
  if (fs.existsSync(localBin)) return localBin;
  // Otherwise a global install, as build:renderer would use.
  try {
    const globalPath = execFileSync(process.platform === "win32" ? "where" : "which", ["esbuild"], { encoding: "utf-8" }).trim().split("\n")[0];
    if (globalPath && fs.existsSync(globalPath)) return globalPath;
  } catch (e) {}
  return null;
}

// ------------------------------------------------------------
// 13. Astra3 can launch: starts the app, checks it is still running after
// four seconds, then ends it. The interface itself is not exercised.
// ------------------------------------------------------------
function checkAstraLaunches(execPath) {
  section("13. Astra3 launch smoke test");
  if (!execPath) {
    reportWarn("Skipped: no resolved Electron executable");
    return;
  }
  const mainEntry = path.join(PROJECT_ROOT, "electron", "main.js");
  if (!fs.existsSync(mainEntry)) {
    reportFail("electron/main.js not found", mainEntry);
    return;
  }
  console.log("  Launching Astra3 for a 4-second smoke test (checks the process stays alive; this does not verify UI interaction)...");
  const child = spawnSync(execPath, [PROJECT_ROOT, "--no-sandbox"], {
    encoding: "utf-8",
    timeout: 4000,
  });
  // Ended by the timeout (status null, SIGTERM) means the app was still
  // running: a pass. A crash exits earlier with a non-zero status.
  if (child.signal === "SIGTERM" && child.status === null) {
    reportPass("Astra3 stayed running for the full smoke-test window (no immediate crash)");
  } else if (child.error) {
    reportFail("Failed to launch Astra3", child.error.message);
  } else if (child.status !== 0 && child.status !== null) {
    reportFail(
      "Astra3 exited immediately with a non-zero status",
      `exit code ${child.status}` + (child.stderr ? `\n    stderr: ${child.stderr.trim().split("\n").slice(0, 5).join("\n    ")}` : ""),
    );
  } else {
    reportWarn("Astra3 exited before the smoke-test window ended (may be normal for a fast clean exit, or may indicate a startup problem)", `exit code ${child.status}`);
  }
}

// ------------------------------------------------------------
// --repair fixes two of the problems found above, logging each action
// before taking it:
//  1. path.txt missing, wrong or ending in a newline: rewritten locally.
//  2. A partly extracted Electron.app: re-extracted from Electron's local
//     download cache (~/Library/Caches/electron on macOS,
//     %LOCALAPPDATA%\electron\Cache on Windows, ~/.cache/electron on Linux),
//     which `npm install` filled. When the cache has no complete file, it
//     says so and stops.
//
// It never downloads anything and never changes code signing.
// ------------------------------------------------------------
function findElectronCacheDir() {
  // The order @electron/get uses.
  if (process.env.ELECTRON_CACHE) return process.env.ELECTRON_CACHE;
  if (process.env.electron_config_cache) return process.env.electron_config_cache;
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Caches", "electron");
  if (process.platform === "win32") return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "electron", "Cache");
  return path.join(os.homedir(), ".cache", "electron");
}

function findCachedElectronZip(version) {
  const cacheDir = findElectronCacheDir();
  if (!fs.existsSync(cacheDir)) return null;
  const platform = process.platform;
  const arch = os.arch();
  const expectedName = `electron-v${version}-${platform}-${arch}.zip`;
  // The cache holds <hash>/<file name>; the hash differs by release.
  let hashDirs;
  try {
    hashDirs = fs.readdirSync(cacheDir, { withFileTypes: true }).filter((e) => e.isDirectory());
  } catch (e) {
    return null;
  }
  for (const dir of hashDirs) {
    const candidate = path.join(cacheDir, dir.name, expectedName);
    if (fs.existsSync(candidate)) {
      const stat = fs.statSync(candidate);
      // An Electron zip is tens of MB; a much smaller one is an
      // incomplete download and is not extracted.
      if (stat.size < 10 * 1024 * 1024) {
        console.log(`  Found a cached zip at ${candidate} but it's only ${(stat.size / 1024).toFixed(0)} KB; too small to be a real Electron build. Skipping it.`);
        continue;
      }
      return candidate;
    }
  }
  return null;
}

function reextractElectronApp(zipPath) {
  console.log(`  Re-extracting ${path.basename(zipPath)} into ${DIST_DIR} ...`);
  // The partial extraction is removed first, so no fragment of it remains.
  const appPath = process.platform === "darwin" ? path.join(DIST_DIR, "Electron.app") : null;
  if (appPath && fs.existsSync(appPath)) {
    fs.rmSync(appPath, { recursive: true, force: true });
  }
  fs.mkdirSync(DIST_DIR, { recursive: true });

  let result;
  if (process.platform === "darwin") {
    // ditto keeps the bundle's symlinks and extended attributes.
    result = spawnSync("ditto", ["-xk", zipPath, DIST_DIR], { encoding: "utf-8" });
  } else if (process.platform === "win32") {
    // Expand-Archive is part of PowerShell 5 and later.
    result = spawnSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -Path "${zipPath}" -DestinationPath "${DIST_DIR}" -Force`], { encoding: "utf-8" });
  } else {
    result = spawnSync("unzip", ["-o", zipPath, "-d", DIST_DIR], { encoding: "utf-8" });
  }
  if (result.error || result.status !== 0) {
    console.log(`  Extraction failed: ${(result.error && result.error.message) || (result.stderr || "").trim()}`);
    return false;
  }
  console.log("  Extraction complete.");
  return true;
}

function runRepair() {
  console.log("\n\x1b[1m--repair: attempting safe, narrow fixes for detected problems\x1b[0m\n");

  const appCorrupt = failures.some((f) => f.repairHint === "reextract");
  if (appCorrupt) {
    console.log("Detected a corrupt/partially-extracted Electron.app. Looking for an already-downloaded");
    console.log("copy in Electron's local cache to re-extract from (this does NOT download anything --");
    console.log("it only reuses a file npm's own install already put on disk)...");
    let version = null;
    try {
      version = JSON.parse(fs.readFileSync(path.join(ELECTRON_DIR, "package.json"), "utf-8")).version;
    } catch (e) {}
    if (!version) {
      console.log("  Could not determine the installed Electron version to look for. Run `npm install` again instead.");
    } else {
      const zipPath = findCachedElectronZip(version);
      if (!zipPath) {
        console.log(`  No usable cached zip found for v${version} (${process.platform}-${os.arch()}) in ${findElectronCacheDir()}.`);
        console.log("  This means the download itself likely failed, not just the extraction --");
        console.log("  re-run `npm install` to have npm download it again.");
      } else {
        console.log(`  Found cached archive: ${zipPath}`);
        if (reextractElectronApp(zipPath)) {
          console.log("  Re-run `npm run preflight` to confirm the fix.");
        }
      }
    }
  }

  const repairable = failures.filter((f) => f.repairHint === "path.txt");
  if (repairable.length === 0 && !appCorrupt) {
    console.log("Nothing in the detected failures is safely auto-repairable by this script.");
    console.log("See the failures above for what to do manually (often just `npm install` again,");
    console.log("or re-extracting node_modules/electron/dist).");
    return;
  }
  if (repairable.length === 0) return;
  if (!fs.existsSync(DIST_DIR)) {
    console.log("Cannot repair path.txt: node_modules/electron/dist doesn't exist. Run `npm install` first.");
    return;
  }
  let candidate = null;
  if (process.platform === "darwin") {
    const appPath = path.join(DIST_DIR, "Electron.app");
    if (fs.existsSync(path.join(appPath, "Contents", "MacOS", "Electron"))) {
      candidate = "Electron.app/Contents/MacOS/Electron";
    }
  } else if (process.platform === "win32") {
    if (fs.existsSync(path.join(DIST_DIR, "electron.exe"))) candidate = "electron.exe";
  } else {
    if (fs.existsSync(path.join(DIST_DIR, "electron"))) candidate = "electron";
  }
  if (!candidate) {
    console.log(`Cannot determine the correct path.txt contents for this platform; the expected `);
    console.log(`Electron binary was not found under ${DIST_DIR}. This likely means the extraction`);
    console.log(`itself is incomplete, which this script cannot safely repair (that requires`);
    console.log(`re-running \`npm install\` or manually re-extracting the cached archive).`);
    console.log(`Not writing path.txt with an unverified guess.`);
    return;
  }
  console.log(`Writing node_modules/electron/path.txt with contents: "${candidate}" (no trailing newline)`);
  // No trailing newline: Electron joins this value into a path without
  // trimming it, so a newline breaks the path.
  fs.writeFileSync(PATH_TXT, candidate);
  console.log("Done. Re-run this script (without --repair) to confirm the fix.");
}

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------
function main() {
  console.log("Astra3 Electron preflight\n" + "=".repeat(40));
  console.log(`Platform: ${process.platform} / ${os.arch()}  |  Node: ${process.version}`);

  const packageOk = checkPackageExists();
  if (packageOk) {
    checkVersionMatches();
    checkPathTxt();
    const execPath = checkAppAndExecutable();
    checkArchitecture(execPath);
    checkRunnable(execPath);
    checkCodeSigning(execPath);
    checkCanLaunch(execPath);
    checkRendererBuilds();
    checkAstraLaunches(execPath);
  }

  console.log("\n" + "=".repeat(40));
  console.log(`${checksPassed} passed, ${checksWarned} warned, ${checksFailed} failed (${checksRun} checks total)`);

  if (checksFailed > 0) {
    console.log("\nRe-run with --repair to fix what can be repaired automatically.");
    if (REPAIR_MODE) {
      runRepair();
    } else {
      console.log("Run `npm run preflight:repair` to attempt the narrow set of fixes this script knows how to apply safely.");
    }
    if (!ADVISORY_MODE) {
      process.exitCode = 1;
    }
  } else {
    console.log("\nAll checks passed.");
  }
}

main();

// ============================================================
// Astra3: macOS version and architecture compatibility
// ============================================================
// Behaviour that depends on which macOS release or which Mac architecture
// Astra3 is running on. Kept separate from main.js so each rule can be tested
// without starting Electron.
// ============================================================

// Darwin kernel major version for a given os.release() string
// ("19.6.0" is macOS 10.15, "25.0.0" is macOS 26). The kernel version is used
// rather than process.getSystemVersion() because macOS 26 reports itself as
// "16.0" to applications linked against an older SDK, which older Electron
// releases are; uname() is not subject to that compatibility shim.
function darwinMajor(release) {
  const major = parseInt(String(release || "").split(".")[0], 10);
  return Number.isFinite(major) ? major : 0;
}

// Whether the main window may draw its native shadow.
//
// Electron releases before 36.9.2 / 37.6.0 / 38.2.0 override a private AppKit
// method (-[NSWindow _cornerMask]) that WindowServer calls while computing a
// window's shadow. On macOS 26 that override makes WindowServer recompute the
// shadow continuously, which slows the whole system while the window is open
// (electron/electron#48376). Astra3 ships a fixed release; the shadow is
// turned off only when an older Electron runs it on macOS 26 or later (a
// stale development install, for example): with no shadow, WindowServer never
// asks for the corner mask. This is the same effect as the CHROME_HEADLESS
// workaround, which Chromium implements as setHasShadow:NO.
function macWindowShadowAllowed(platform, release, electronVersion) {
  if (platform !== "darwin") return true;
  if (darwinMajor(release) < 25) return true;
  return electronHasShadowFix(electronVersion);
}

// True for an Electron release that no longer overrides _cornerMask.
function electronHasShadowFix(version) {
  const [major, minor, patch] = String(version || "").split(".").map((n) => parseInt(n, 10) || 0);
  if (major >= 39) return true;
  if (major === 38) return minor >= 2;
  if (major === 37) return minor >= 6;
  if (major === 36) return minor > 9 || (minor === 9 && patch >= 2);
  return false;
}

// A readable explanation for a PyMOL launch failure, or null when the error
// needs no translation.
//
// macOS reports "Bad CPU type in executable" as errno 86, which Node surfaces
// as "spawn Unknown system error -86". On Apple Silicon that means the PyMOL
// build is Intel-only and Rosetta 2 is not installed; on an Intel Mac it means
// the PyMOL build is Apple Silicon-only.
function describePymolLaunchError(err, pymolPath, platform, arch) {
  if (platform !== "darwin" || !err) return null;
  const badCpu = err.errno === -86 || /(^|\D)-86(\D|$)/.test(String(err.code || "")) || /Unknown system error -86\b/.test(String(err.message || ""));
  if (!badCpu) return null;
  if (arch === "arm64") {
    return `The PyMOL at "${pymolPath}" is built for Intel Macs, and this Mac cannot run Intel software until Rosetta is installed. ` +
      "Install Rosetta by running  softwareupdate --install-rosetta  in Terminal, or install a PyMOL build for Apple Silicon, then start the analysis again.";
  }
  return `The PyMOL at "${pymolPath}" is built only for Apple Silicon Macs and cannot run on this Intel Mac. ` +
    "Install a PyMOL build for Intel Macs, then select it in Settings.";
}

// Recognises the output of a PyMOL too old to run Astra3 and says what is
// needed. Astra3's Python code needs Python 3.7 or newer: Python 2 (PyMOL
// 1.x) rejects its syntax, and Python 3.6 lacks the dataclasses module.
// Returns null for any other failure.
function explainStartupFailure(output) {
  const text = String(output || "");
  const python2 = /SyntaxError/.test(text) && /astra3/i.test(text) && !/Python 3\./.test(text)
    || /^\s*File "[^"]*astra3[^"]*", line \d+\s*$[\s\S]*?f"/m.test(text)
    || /ImportError: No module named [^'"]/.test(text);
  const python36 = /No module named '?dataclasses'?/.test(text);
  if (!python2 && !python36) return null;
  return "This PyMOL is too old to run Astra3. Astra3 needs a PyMOL built on Python 3.7 or newer"
    + (python36 ? " (this one uses Python 3.6)" : " (this one uses Python 2)")
    + ". Install a current PyMOL from pymol.org, then choose it in Settings > Analysis engine.";
}

module.exports = { darwinMajor, macWindowShadowAllowed, electronHasShadowFix, describePymolLaunchError, explainStartupFailure };

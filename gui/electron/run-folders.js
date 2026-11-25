// ============================================================
// Astra3: run folders on disk
// ============================================================
// Measures and deletes "<label>_Output" run folders. Only those directly inside a
// Protein_outputs folder are ever deleted, whatever path is requested, and
// each delete reports its outcome. Free of Electron so it can be tested.
// ============================================================
"use strict";

const nodePath = require("path");
const nodeFs = require("fs");
const { execFile } = require("child_process");
const { isInside, samePlace } = require("./output-location");

// "<label>_Output", or "<label>_Output (n)" for a re-run.
const RUN_FOLDER = /_Output(?: \(\d+\))?$/i;
const OUTPUT_FOLDER = /^protein_outputs$/i;

function pathApi(platform) {
  return platform === "win32" ? nodePath.win32 : nodePath.posix;
}

// Shared by the size measurement and the delete so both cover the same folders.
function isAstraRunFolder(fullPath, name, fs = nodeFs) {
  if (!RUN_FOLDER.test(name)) return false;
  try {
    return fs.statSync(fullPath).isDirectory();
  } catch {
    return false;
  }
}

// Unreadable entries are skipped rather than failing the whole total.
function directorySizeBytes(target, fs = nodeFs) {
  let total = 0;
  let entries;
  try {
    entries = fs.readdirSync(target, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = nodePath.join(target, entry.name);
    try {
      const st = fs.statSync(full);
      if (st.isDirectory()) total += directorySizeBytes(full, fs);
      else if (st.isFile()) total += st.size;
    } catch {
      // Vanished or unreadable.
    }
  }
  return total;
}

// Removes files modified at or after `cutoff` and prunes emptied directories.
// A re-run reuses its structure's folder, so cleaning up a cancelled re-run
// must keep what the earlier run wrote.
function removeEntriesNewerThan(dir, cutoff, fs = nodeFs) {
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
    const full = nodePath.join(dir, entry.name);
    if (entry.isDirectory()) {
      const inner = removeEntriesNewerThan(full, cutoff, fs);
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
      try { fs.rmSync(full, { force: true }); removed += 1; freed += stat.size; } catch { kept += 1; }
    } else {
      kept += 1;
    }
  }
  return { removed, freed, kept };
}

// The resolved path when `requested` has the shape of a run folder (absolute,
// a run folder name, directly inside a Protein_outputs folder), else null.
function runFolderPath(requested, platform = process.platform) {
  const p = pathApi(platform);
  if (typeof requested !== "string" || !requested || !p.isAbsolute(requested)) return null;
  const full = p.resolve(requested);
  if (!RUN_FOLDER.test(p.basename(full)) || !OUTPUT_FOLDER.test(p.basename(p.dirname(full)))) return null;
  return full;
}

// Sizes of run folders by requested path; null for anything that is not a
// run folder or no longer exists.
function runFolderSizes(requested, options = {}) {
  const fs = options.fs || nodeFs;
  const sizes = {};
  for (const target of Array.isArray(requested) ? requested : []) {
    const full = runFolderPath(target, options.platform);
    let isDir = false;
    try {
      isDir = !!full && fs.lstatSync(full).isDirectory();
    } catch {
      isDir = false;
    }
    sizes[target] = isDir ? directorySizeBytes(full, fs) : null;
  }
  return sizes;
}

// Controlled Folder Access is on when the setting is 1 (2 is audit only).
// Queried only after Windows refuses a change, then cached.
let controlledFolderAccess = null;
function controlledFolderAccessOn(run = execFile) {
  if (controlledFolderAccess) return controlledFolderAccess;
  controlledFolderAccess = new Promise((resolve) => {
    try {
      run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "(Get-MpPreference).EnableControlledFolderAccess"],
        { timeout: 8000, windowsHide: true }, (err, stdout) => resolve(!err && String(stdout).trim() === "1"));
    } catch {
      resolve(false);
    }
  });
  return controlledFolderAccess;
}

const missingMessage = (target) => `It wasn't found at ${target}. It may have been moved, renamed or deleted outside Astra3.`;
const MESSAGES = {
  "in-use": "A file in it is open in another program. Close that program and try again.",
  blocked: "Windows Security is blocking Astra3 from changing files in this folder (Controlled folder access). "
    + "Allow Astra3 under Virus & threat protection > Ransomware protection, or choose an output folder outside Documents in Settings.",
  "not-run-folder": "It is not a folder Astra3 created for a run, so it was left alone.",
  protected: "It is a system or personal folder, so it was left alone.",
  failed: "It could not be deleted.",
};

function deniedMessage(platform) {
  if (platform === "darwin") {
    return "Astra3 isn't allowed to delete it. If macOS asked whether Astra3 may use this folder and it was refused, "
      + "allow it under System Settings > Privacy & Security > Files and Folders.";
  }
  if (platform === "win32") {
    return "Windows didn't allow it to be deleted. A file in it may be open in another program; close it and try again.";
  }
  return "Astra3 isn't allowed to delete it.";
}

async function classifyFailure(err, platform, options) {
  const code = err && err.code;
  if (code === "EBUSY" || code === "ENOTEMPTY") return { status: "in-use", message: MESSAGES["in-use"] };
  if (code === "EPERM" || code === "EACCES") {
    if (platform === "win32" && await (options.controlledFolderAccessOn || controlledFolderAccessOn)()) {
      return { status: "blocked", message: MESSAGES.blocked };
    }
    return { status: "denied", message: deniedMessage(platform) };
  }
  if (code === "ENOENT") return { status: "missing" };
  return { status: "failed", message: MESSAGES.failed };
}

// Deletes the run folder at `requested`, a full path as the run reported it.
//
//   options.protectedDirs   never deleted, never contain a deleted folder, and
//                           never the direct parent of one
//   options.newerThan       delete only files written since this time
//   options.fs              injectable for tests
//
// Resolves to { requested, path, status, message, freed }. status is one of
// deleted, trimmed (newerThan kept older files), missing, refused, in-use,
// denied, blocked or failed.
async function deleteRunFolder(requested, options = {}) {
  const platform = options.platform || process.platform;
  const fs = options.fs || nodeFs;
  const p = pathApi(platform);
  const result = { requested, path: null, status: "refused", message: MESSAGES["not-run-folder"], freed: 0 };
  const full = runFolderPath(requested, platform);
  if (!full) return result;
  result.path = full;
  const parent = p.dirname(full);
  const protectedDirs = (options.protectedDirs || []).filter(Boolean);
  if (protectedDirs.some((dir) => samePlace(dir, parent, platform) || isInside(dir, full, platform))) {
    return { ...result, message: MESSAGES.protected };
  }

  let stat;
  try {
    stat = await fs.promises.lstat(full);
  } catch (err) {
    const failure = await classifyFailure(err, platform, options);
    return { ...result, ...failure, message: failure.status === "missing" ? missingMessage(full) : failure.message };
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) return result;

  const before = directorySizeBytes(full, fs);
  if (typeof options.newerThan === "number" && options.newerThan > 0) {
    const scoped = removeEntriesNewerThan(full, options.newerThan, fs);
    if (scoped.kept === 0) {
      try { fs.rmdirSync(full); } catch { /* checked below */ }
    }
    const gone = !fs.existsSync(full);
    return { ...result, status: gone ? "deleted" : "trimmed", message: null, freed: scoped.freed, removed: scoped.removed };
  }

  let failure = null;
  try {
    // Retries cover the brief locks Windows indexing and antivirus take on new files.
    await fs.promises.rm(full, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch (err) {
    failure = await classifyFailure(err, platform, options);
  }
  // On Windows a folder with an open handle can outlive a successful rm, so
  // the outcome is judged by what is left on disk.
  let remains = false;
  try {
    await fs.promises.lstat(full);
    remains = true;
  } catch {
    remains = false;
  }
  const freed = remains ? Math.max(0, before - directorySizeBytes(full, fs)) : before;
  if (!remains) return { ...result, status: "deleted", message: null, freed };
  if (!failure || failure.status === "missing") failure = { status: "in-use", message: MESSAGES["in-use"] };
  return { ...result, ...failure, freed };
}

// True for a Protein_outputs folder, or for anything inside one of its run
// folders: the only places the interface opens or reads files from. A path is
// judged after its links are resolved, so a link in a run folder cannot point
// elsewhere; a missing path is judged as written.
function isInsideRunFolders(requested, platform = process.platform, fs = nodeFs) {
  const p = pathApi(platform);
  if (typeof requested !== "string" || !requested || !p.isAbsolute(requested)) return false;
  let full = p.resolve(requested);
  try {
    full = fs.realpathSync(full);
  } catch {
    // Missing or unreadable.
  }
  if (OUTPUT_FOLDER.test(p.basename(full))) return true;
  for (let dir = full; ; dir = p.dirname(dir)) {
    if (runFolderPath(dir, platform)) return true;
    if (p.dirname(dir) === dir) return false;
  }
}

module.exports = {
  isAstraRunFolder,
  isInsideRunFolders,
  runFolderPath,
  runFolderSizes,
  directorySizeBytes,
  removeEntriesNewerThan,
  deleteRunFolder,
  controlledFolderAccessOn,
};

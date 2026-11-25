// ============================================================
// Astra3: where analysis results are saved
// ============================================================
// The single definition of the output folder, shared by the interface and
// the engine (ASTRA3_BASE_DIR is its parent). Free of Electron so it can be
// tested; main.js supplies the folders and platform.
// ============================================================
"use strict";

const nodePath = require("path");
const nodeFs = require("fs");

const OUTPUT_FOLDER = "Protein_outputs";

function pathApi(platform) {
  return platform === "win32" ? nodePath.win32 : nodePath.posix;
}

// Linux file systems are case-sensitive; macOS and Windows ones normally are not.
function caseFold(platform) {
  return platform === "linux" ? (s) => s : (s) => s.toLowerCase();
}

function defaultOutputDir(documentsDir, platform = process.platform) {
  return pathApi(platform).join(documentsDir, "Astra3", OUTPUT_FOLDER);
}

// Python does not expand "~", and a typed path can contain one.
function expandHome(p, home, platform = process.platform) {
  if (p === "~") return home;
  if (p.startsWith("~/") || p.startsWith("~\\")) return pathApi(platform).join(home, p.slice(2));
  return p;
}

// Python writes to <base>/Protein_outputs and is given this folder's parent as
// the base, so the setting must end in Protein_outputs.
function withOutputFolder(dir, platform = process.platform) {
  const p = pathApi(platform);
  const normalized = p.normalize(dir);
  const root = p.parse(normalized).root;
  const trimmed = normalized.length > root.length ? normalized.replace(/[\\/]+$/, "") : normalized;
  if (p.basename(trimmed).toLowerCase() === OUTPUT_FOLDER.toLowerCase()) return trimmed;
  return p.join(trimmed, OUTPUT_FOLDER);
}

// A path written for the other OS. Windows accepts "/Users/..." as a path on
// the current drive, so it has to be caught by its form.
function forOtherSystem(raw, platform = process.platform) {
  if (platform === "win32") return /^[\\/](?![\\/])/.test(raw);
  return /^[A-Za-z]:([\\/]|$)/.test(raw) || /^\\\\/.test(raw);
}

function samePlace(a, b, platform) {
  const p = pathApi(platform);
  const fold = caseFold(platform);
  return fold(p.resolve(a)) === fold(p.resolve(b));
}

// True when child is parent itself or inside it.
function isInside(child, parent, platform = process.platform) {
  const p = pathApi(platform);
  const fold = caseFold(platform);
  const rel = p.relative(fold(p.resolve(parent)), fold(p.resolve(child)));
  return rel === "" || (!rel.startsWith("..") && !p.isAbsolute(rel));
}

function reasonForError(err) {
  switch (err && err.code) {
    case "EACCES":
    case "EPERM":
      return "denied";
    case "ENOENT":
    case "ENODEV":
    case "ENXIO":
      return "unavailable";
    case "EROFS":
      return "read-only";
    case "ENOTDIR":
    case "EEXIST":
      return "not-folder";
    default:
      return "failed";
  }
}

function refuse(reason, input, dir, err) {
  return { ok: false, reason, input, dir: dir || null, code: (err && err.code) || null };
}

// Creates the folder if needed and checks it is writable. Resolves to
// { ok: true, dir } with links resolved (Python reports resolved paths), or
// { ok: false, reason }.
//
//   env.appDirs   the app's own folders, which never hold results
//   env.fs        injectable for tests
async function checkOutputDir(raw, env = {}) {
  const platform = env.platform || process.platform;
  const fs = env.fs || nodeFs;
  const p = pathApi(platform);
  const input = String(raw == null ? "" : raw).trim();
  if (!input) return refuse("empty", input);
  if (forOtherSystem(input, platform)) return refuse("other-system", input);
  const expanded = expandHome(input, env.home || "", platform);
  if (!p.isAbsolute(expanded)) return refuse("not-absolute", input);
  const dir = withOutputFolder(p.resolve(expanded), platform);
  if ((env.appDirs || []).some((appDir) => appDir && isInside(dir, appDir, platform))) {
    return refuse("inside-app", input, dir);
  }
  try {
    await fs.promises.mkdir(dir, { recursive: true });
    const stat = await fs.promises.stat(dir);
    if (!stat.isDirectory()) return refuse("not-folder", input, dir);
    const probe = p.join(dir, `.astra3-write-check-${process.pid}-${Date.now()}`);
    await fs.promises.writeFile(probe, "");
    await fs.promises.rm(probe, { force: true });
  } catch (err) {
    return refuse(reasonForError(err), input, dir, err);
  }
  let real = dir;
  try {
    real = await fs.promises.realpath(dir);
  } catch {
    // Keep the unresolved path.
  }
  return { ok: true, dir: real };
}

const REASON_TEXT = {
  "empty": "No folder was given.",
  "other-system": "That location is written for a different kind of computer, so it does not exist on this one.",
  "not-absolute": "That is not a complete folder location.",
  "inside-app": "That folder is inside the Astra3 app, which cannot hold results.",
  "denied": "Astra3 is not allowed to save files there.",
  "unavailable": "That drive or folder is not available on this computer.",
  "read-only": "That location is read-only.",
  "not-folder": "Something other than a folder is already at that location.",
  "failed": "Astra3 could not save files there.",
};

function permissionHint(platform) {
  if (platform === "darwin") {
    return "If macOS asked whether Astra3 may use this folder and it was refused, allow it under System Settings > Privacy & Security > Files and Folders.";
  }
  if (platform === "win32") {
    return "If Controlled folder access is on in Windows Security, allow Astra3 under Virus & threat protection > Ransomware protection, or choose a folder outside Documents.";
  }
  return "";
}

function describeRefusal(result, platform = process.platform) {
  const text = REASON_TEXT[result && result.reason] || REASON_TEXT.failed;
  const hint = result && result.reason === "denied" ? permissionHint(platform) : "";
  return hint ? `${text} ${hint}` : text;
}

// Picks the folder at startup: the saved one (output_dir.txt), else the one
// the interface remembers, else the default, else the first usable fallback
// (used when Documents is protected, e.g. by Controlled Folder Access).
// Resolves to { dir, source, replaced, defaultProblem, problem }: `replaced`
// is a refused candidate, `defaultProblem` why the default was passed over,
// `problem` set when nothing is usable.
async function establishOutputDir({ saved, remembered, defaultDir, fallbackDirs = [], env }) {
  const candidate = saved ? { value: saved, source: "saved" } : remembered ? { value: remembered, source: "remembered" } : null;
  let replaced = null;
  if (candidate) {
    const result = await checkOutputDir(candidate.value, env);
    if (result.ok) return { dir: result.dir, source: candidate.source, replaced: null, defaultProblem: null, problem: null };
    replaced = { ...result, source: candidate.source };
  }
  const preferred = await checkOutputDir(defaultDir, env);
  if (preferred.ok) return { dir: preferred.dir, source: "default", replaced, defaultProblem: null, problem: null };
  for (const dir of fallbackDirs) {
    const result = await checkOutputDir(dir, env);
    if (result.ok) return { dir: result.dir, source: "fallback", replaced, defaultProblem: preferred, problem: null };
  }
  return { dir: defaultDir, source: "default", replaced, defaultProblem: null, problem: preferred };
}

function startupNotice(state, platform = process.platform) {
  if (!state) return null;
  if (state.problem) {
    return {
      title: "Results can't be saved",
      message: `Astra3 can't save results in:\n${state.dir}\n\n${describeRefusal(state.problem, platform)}\n\nChoose another output folder in Settings.`,
    };
  }
  if (state.source === "fallback") {
    const before = state.replaced ? `Astra3 couldn't use the output folder in its settings:\n${state.replaced.input}\n\n` : "";
    return {
      title: "Output folder changed",
      message: `${before}Astra3 can't save results in your Documents folder. ${describeRefusal(state.defaultProblem, platform)}\n\nResults will be saved in:\n${state.dir}\n\nYou can choose another folder in Settings.`,
    };
  }
  if (state.replaced) {
    return {
      title: "Output folder changed",
      message: `Astra3 couldn't use the output folder in its settings:\n${state.replaced.input}\n\n${describeRefusal(state.replaced, platform)}\n\nResults will be saved in:\n${state.dir}\n\nYou can choose another folder in Settings.`,
    };
  }
  return null;
}

module.exports = {
  OUTPUT_FOLDER,
  defaultOutputDir,
  expandHome,
  withOutputFolder,
  forOtherSystem,
  isInside,
  samePlace,
  checkOutputDir,
  describeRefusal,
  establishOutputDir,
  startupNotice,
};

#!/usr/bin/env node
/**
 * Fails the build if the packed app contains settings files, a tools/
 * folder, or absolute home-folder paths in Astra3's own files.
 *
 * Runs as electron-builder's afterPack hook, before signing, or by hand:
 *
 *   node scripts/check-package.js <folder holding the packed app>
 *
 * Vendored third-party files are skipped: they contain their own build
 * paths and are pinned by SHA-256 in scripts/vendor-deps.sh.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const SETTINGS_FILES = new Set([
  "pymol_path.txt", "output_dir.txt", "engine.txt", "chimerax_path.txt", "engine_window.txt",
  "color_palette.json", "pymol-diagnostic.log",
]);
const TEXT_FILE = /\.(js|mjs|cjs|jsx|py|json|html|htm|txt|md|cff|cxc|css)$/i;
const THIRD_PARTY = /(^|\/)(engine\/pyodide|renderer\/vendor|node_modules)\//;
const PLACEHOLDER_NAMES = new Set(["username", "user", "you", "name", "yourname", "shared", "public", "default"]);
// /Users/<name>/, /home/<name>/ and C:\Users\<name>\, including the escaped
// backslashes found in source strings.
const HOME_PATH = /(?:\/Users\/|\/home\/|[A-Za-z]:(?:\\\\|\\|\/)Users(?:\\\\|\\|\/))([A-Za-z0-9._ -]+?)(?=\\|\/)/g;

function homePathsIn(text) {
  const found = [];
  for (const match of text.matchAll(HOME_PATH)) {
    const name = match[1].trim();
    if (!name || /^\.+$/.test(name) || PLACEHOLDER_NAMES.has(name.toLowerCase())) continue;
    found.push(match[0] + "...");
  }
  return found;
}

// relPath uses forward slashes; read() returns the file's contents.
function checkEntry(relPath, read) {
  const problems = [];
  const name = relPath.split("/").pop();
  if (SETTINGS_FILES.has(name.toLowerCase())) problems.push(`${relPath}: a settings file`);
  else if (/(^|\/)tools\//i.test(relPath)) problems.push(`${relPath}: inside a tools folder`);
  if (TEXT_FILE.test(name) && !THIRD_PARTY.test(relPath)) {
    const paths = homePathsIn(read().toString("utf-8"));
    if (paths.length) problems.push(`${relPath}: absolute path ${paths.slice(0, 3).join(", ")}`);
  }
  return problems;
}

// The files in an asar archive: { relPath, read() } for each.
function asarEntries(archivePath) {
  const fd = fs.openSync(archivePath, "r");
  try {
    const sizeBuf = Buffer.alloc(8);
    fs.readSync(fd, sizeBuf, 0, 8, 0);
    const headerSize = sizeBuf.readUInt32LE(4);
    const headerBuf = Buffer.alloc(headerSize);
    fs.readSync(fd, headerBuf, 0, headerSize, 8);
    const jsonLength = headerBuf.readUInt32LE(4);
    const header = JSON.parse(headerBuf.toString("utf-8", 8, 8 + jsonLength));
    const base = 8 + headerSize;
    const entries = [];
    const walk = (node, prefix) => {
      for (const [entryName, child] of Object.entries(node.files || {})) {
        const rel = prefix ? `${prefix}/${entryName}` : entryName;
        if (child.files) { walk(child, rel); continue; }
        if (child.link || child.unpacked) { entries.push({ relPath: rel, read: () => Buffer.alloc(0) }); continue; }
        const size = Number(child.size) || 0;
        const offset = base + Number(child.offset || 0);
        entries.push({
          relPath: rel,
          read: () => {
            const fd2 = fs.openSync(archivePath, "r");
            try {
              const out = Buffer.alloc(size);
              fs.readSync(fd2, out, 0, size, offset);
              return out;
            } finally {
              fs.closeSync(fd2);
            }
          },
        });
      }
    };
    walk(header, "");
    return entries;
  } finally {
    fs.closeSync(fd);
  }
}

// Checks Contents/Resources (macOS) or resources\ (Windows), including app.asar.
function checkResources(resourcesDir) {
  const problems = [];
  const walk = (dir, rel) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (/^tools$/i.test(entry.name)) problems.push(`${relPath}/: a tools folder`);
        walk(full, relPath);
      } else if (entry.isFile() && /\.asar$/i.test(entry.name)) {
        for (const inner of asarEntries(full)) problems.push(...checkEntry(`${relPath}/${inner.relPath}`, inner.read));
      } else if (entry.isFile()) {
        problems.push(...checkEntry(relPath, () => fs.readFileSync(full)));
      }
    }
  };
  walk(resourcesDir, "");
  return problems;
}

function resourcesDirs(appOutDir) {
  const dirs = [];
  for (const entry of fs.readdirSync(appOutDir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.endsWith(".app")) dirs.push(path.join(appOutDir, entry.name, "Contents", "Resources"));
  }
  const win = path.join(appOutDir, "resources");
  if (fs.existsSync(win)) dirs.push(win);
  return dirs.filter((d) => fs.existsSync(d));
}

function checkAppOutDir(appOutDir) {
  const dirs = resourcesDirs(appOutDir);
  if (dirs.length === 0) return [`${appOutDir}: no packed app found`];
  return dirs.flatMap(checkResources);
}

async function afterPack(context) {
  const problems = checkAppOutDir(context.appOutDir);
  if (problems.length) {
    throw new Error(`The packed app holds files from the build computer:\n  ${problems.join("\n  ")}`);
  }
}

module.exports = afterPack;
module.exports.default = afterPack;
module.exports.checkEntry = checkEntry;
module.exports.checkResources = checkResources;
module.exports.checkAppOutDir = checkAppOutDir;
module.exports.homePathsIn = homePathsIn;
module.exports.asarEntries = asarEntries;

if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: node scripts/check-package.js <folder holding the packed app>");
    process.exit(2);
  }
  const problems = checkAppOutDir(path.resolve(target));
  if (problems.length) {
    console.error(`The packed app holds files from the build computer:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  console.log("No settings files or build-computer paths in the packed app.");
}

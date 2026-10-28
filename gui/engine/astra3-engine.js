// ============================================================
// astra3-engine.js
// Astra3: Structural Analysis Toolkit for PDB Rendering Automation
// Created by Andre Aguirre
// Copyright (c) 2026 Andre Aguirre
// Licensed under the GNU General Public License, version 3 or later (GPL-3.0-or-later).
// See LICENSE file for details.
// ============================================================
//
// The Astra3 Engine: runs astra3.py on a computer with neither PyMOL nor
// ChimeraX.
//
// Python here is CPython compiled to WebAssembly (Pyodide, in ./pyodide),
// run by the app's own Node: the app starts its own executable with
// ELECTRON_RUN_AS_NODE=1. The analysis is the same Python the other engines
// run; astra3_chimerax stands in for PyMOL's cmd, and astra3_engine.py hands
// each image to the app, which draws it (electron/engine-window.js).
//
//   ELECTRON_RUN_AS_NODE=1 <Astra3 executable> astra3-engine.js <astra3.py>
//
// Commands are read on standard input and the output is written to standard
// output, as with PyMOL's -c mode. A line holding only Ctrl+C (\x03) cancels
// the running command, as Ctrl+C does in a terminal.
//
// Python runs on a worker thread, so this thread stays free to read input,
// take a cancel and make network requests while Python waits for them.
// ============================================================
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const util = require("util");
const { Worker, MessageChannel, isMainThread, parentPort, receiveMessageOnPort, workerData } = require("worker_threads");

const PYODIDE_DIR = path.join(__dirname, "pyodide");
const NUMPY_WHEEL = "numpy-2.4.6-cp314-cp314-pyemscripten_2026_0_wasm32.whl";
const CTRL_C = "\x03";
const SIGINT = 2;

// ------------------------------------------------------------
// This thread: input, cancel, network
// ------------------------------------------------------------

function main() {
  const script = process.argv[2] ? path.resolve(process.argv[2]) : "";
  if (!script || !fs.existsSync(script)) {
    process.stderr.write(`Astra3 Engine: astra3.py was not found (${script || "no path given"}).\n`);
    process.exit(2);
  }
  if (!fs.existsSync(path.join(path.dirname(script), "astra3_core.py"))) {
    process.stderr.write("Astra3 Engine: Astra3's Python modules are not present as source files (.py). This build "
      + "compiled them for one Python version (ASTRA3_COMPILE_WITH), which the Astra3 Engine cannot load; "
      + "rebuild without it, or use PyMOL or ChimeraX.\n");
    process.exit(2);
  }
  // A signal number for Python, read by Pyodide between instructions.
  const interrupt = new Int32Array(new SharedArrayBuffer(4));
  // Set to 1 when an answer for the worker has been posted on the port.
  const handoff = new Int32Array(new SharedArrayBuffer(4));
  const { port1, port2 } = new MessageChannel();
  const worker = new Worker(__filename, {
    workerData: { script, interrupt, handoff, port: port2, cwd: process.cwd() },
    transferList: [port2],
  });

  const lines = [];
  let partial = "";
  let ended = false;
  let waiting = false; // Python is waiting for a line

  const answer = (message, transfer) => {
    port1.postMessage(message, transfer || []);
    Atomics.store(handoff, 0, 1);
    Atomics.notify(handoff, 0);
  };
  const serveInput = () => {
    if (!waiting) return;
    if (Atomics.load(interrupt, 0) === SIGINT) {
      Atomics.store(interrupt, 0, 0);
      waiting = false;
      answer({ line: CTRL_C });
    } else if (lines.length) {
      waiting = false;
      answer({ line: lines.shift() });
    } else if (ended) {
      waiting = false;
      answer({ line: null });
    }
  };
  // A cancel while Python waits at a prompt ends the wait; otherwise Python
  // sees it as SIGINT at its next instruction.
  const cancel = () => {
    if (waiting) {
      waiting = false;
      answer({ line: CTRL_C });
    } else {
      Atomics.store(interrupt, 0, SIGINT);
    }
  };

  process.stdin.setEncoding("utf-8");
  process.stdin.on("data", (chunk) => {
    const parts = (partial + chunk).split(/\r?\n/);
    partial = parts.pop();
    for (const line of parts) {
      if (line === CTRL_C) cancel();
      else lines.push(line);
    }
    serveInput();
  });
  process.stdin.on("end", () => {
    if (partial) lines.push(partial);
    partial = "";
    ended = true;
    serveInput();
  });
  process.on("SIGINT", cancel);

  worker.on("message", (m) => {
    if (m.type === "input") {
      waiting = true;
      serveInput();
    } else if (m.type === "fetch") {
      fetchFor(m).then((reply) => answer(reply, reply.body ? [reply.body.buffer] : []));
    }
  });
  worker.on("error", (e) => {
    process.stderr.write(`Astra3 Engine stopped: ${(e && e.stack) || e}\n`);
    process.exit(1);
  });
  worker.on("exit", (code) => process.exit(code));
}

// One HTTP request for Python's urllib (astra3_engine.urlopen). A GET whose
// connection drops before an answer (a server closing a reused connection)
// is tried once more; HTTP errors and timeouts are returned as they are.
async function fetchFor({ url, method, headers, body, timeout }) {
  const verb = method || "GET";
  for (let attempt = 1; ; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, Number(timeout) || 60) * 1000);
    try {
      const res = await fetch(url, {
        method: verb, headers: headers || {}, body: body || undefined,
        redirect: "follow", signal: controller.signal,
      });
      const data = new Uint8Array(await res.arrayBuffer());
      return { status: res.status, reason: res.statusText, url: res.url, headers: [...res.headers], body: data };
    } catch (e) {
      const timedOut = e && e.name === "AbortError";
      if (!timedOut && attempt < 2 && (verb === "GET" || verb === "HEAD")) continue;
      const reason = timedOut ? "timed out" : String((e && e.cause && e.cause.message) || (e && e.message) || e);
      return { error: reason };
    } finally {
      clearTimeout(timer);
    }
  }
}

// ------------------------------------------------------------
// The worker thread: Python
// ------------------------------------------------------------

const WINDOWS = process.platform === "win32";
const WIN_ABSOLUTE = /^([A-Za-z]):[\\/]/;

// Windows paths are seen by Python as /C:/Users/...: each drive is mounted
// at /<letter>:. Elsewhere Python sees the computer's own paths.
function toPython(p) {
  if (!WINDOWS) return p;
  const m = WIN_ABSOLUTE.exec(p);
  return m ? `/${m[1].toUpperCase()}:/` + p.slice(3).replace(/\\/g, "/") : p;
}

function inputToPython(line) {
  if (!WINDOWS) return line;
  return line.replace(/(^|[\s"'=])([A-Za-z]):[\\/]([^"'\r\n]*)/g,
    (_m, lead, drive, rest) => `${lead}/${drive.toUpperCase()}:/${rest.replace(/\\/g, "/")}`);
}

function outputToHost(text) {
  if (!WINDOWS) return text;
  // A colour code can come straight before a path ("\x1b[97m/C:/...").
  return text.replace(/(^|[^A-Za-z0-9_.\/]|\x1b\[[0-9;]*m)\/([A-Za-z]):\/([^"'<>|\r\n\x1b]*)/g,
    (_m, lead, drive, rest) => `${lead}${drive}:\\${rest.replace(/\//g, "\\")}`);
}

// The computer's folders, mounted at the same place in Python's file system,
// except those Python's own runtime uses.
function hostMounts() {
  if (WINDOWS) {
    const mounts = [];
    for (let code = 67; code <= 90; code += 1) { // C to Z
      const drive = `${String.fromCharCode(code)}:\\`;
      try {
        if (fs.statSync(drive).isDirectory()) mounts.push([`/${drive[0]}:`, drive]);
      } catch {
        // No such drive.
      }
    }
    return mounts;
  }
  const skip = new Set(["dev", "proc", "sys", "lib", "lib32", "lib64", "libx32"]);
  const mounts = [];
  for (const name of fs.readdirSync("/")) {
    if (skip.has(name)) continue;
    try {
      if (fs.statSync(`/${name}`).isDirectory()) mounts.push([`/${name}`, `/${name}`]);
    } catch {
      // Unreadable or a dangling link.
    }
  }
  return mounts;
}

function pythonEnvironment(script) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== "string" || key === "ELECTRON_RUN_AS_NODE" || key.startsWith("NODE_")) continue;
    env[key] = WINDOWS && WIN_ABSOLUTE.test(value) && !value.includes(";") ? toPython(value) : value;
  }
  env.HOME = toPython(os.homedir());
  env.TMPDIR = toPython(os.tmpdir());
  env.PYTHONDONTWRITEBYTECODE = "1";
  env.PYTHONIOENCODING = "utf-8";
  env.ASTRA3_ENGINE = "astra3";
  env.ASTRA3_HOST_PLATFORM = process.platform;
  env.ASTRA3_SCRIPT = toPython(script);
  return env;
}

// Writes all of data to a file descriptor, waiting out a full pipe.
const pause = new Int32Array(new SharedArrayBuffer(4));
function writeAll(fd, data) {
  let offset = 0;
  while (offset < data.length) {
    try {
      offset += fs.writeSync(fd, data, offset, data.length - offset);
    } catch (e) {
      if (e.code !== "EAGAIN") throw e;
      Atomics.wait(pause, 0, 0, 5);
    }
  }
}

async function worker() {
  const { script, interrupt, handoff, port, cwd } = workerData;
  // Pyodide's own messages go to stderr: stdout carries Astra3's output,
  // which the app reads.
  for (const name of ["log", "info", "warn", "error", "debug"]) {
    console[name] = (...args) => writeAll(2, Buffer.from(util.format(...args) + "\n"));
  }
  const ask = (message) => {
    Atomics.store(handoff, 0, 0);
    parentPort.postMessage(message);
    Atomics.wait(handoff, 0, 0);
    const received = receiveMessageOnPort(port);
    return received ? received.message : { error: "no answer" };
  };

  const { loadPyodide } = require(path.join(PYODIDE_DIR, "pyodide.js"));
  const py = await loadPyodide({ indexURL: PYODIDE_DIR + path.sep, env: pythonEnvironment(script) });
  // Pyodide takes the package name from the text after the last "/", so a
  // Windows path is given with forward slashes (Node reads it either way).
  const wheel = path.join(PYODIDE_DIR, NUMPY_WHEEL).split(path.sep).join("/");
  await py.loadPackage(wheel, { messageCallback: () => {}, errorCallback: (m) => console.error(m) });

  const FS = py.FS;
  const NODEFS = FS.filesystems.NODEFS;
  // Windows sets the read-only attribute on folders such as Downloads only
  // to mark them as customised; it does not stop files being written there.
  // Node reports such a folder without write permission, and Python's file
  // system would then refuse every file saved in it. Folders are given their
  // write bits back; Windows still checks every actual write.
  if (WINDOWS) {
    const getMode = NODEFS.getMode;
    NODEFS.getMode = (p) => {
      const mode = getMode(p);
      return FS.isDir(mode) ? mode | 0o222 : mode;
    };
  }
  // Python sees the computer's folders through NODEFS, and the file system
  // remembers every name it has looked up there. A file or folder removed
  // or replaced outside the engine (from the History page, in Finder or
  // Explorer, or by another program) would stay remembered: making it again
  // would fail with "File exists" although nothing is on disk. A remembered
  // name on a NODEFS folder is therefore checked against the disk before it
  // is used, and forgotten when it is gone or has changed between file and
  // folder.
  const onDisk = (node) => {
    try {
      return fs.lstatSync(NODEFS.realPath(node)).isDirectory() === FS.isDir(node.mode);
    } catch {
      return false;
    }
  };
  const lookupNode = FS.lookupNode;
  FS.lookupNode = (parent, name) => {
    for (let node = FS.nameTable[FS.hashName(parent.id, name)]; node; node = node.name_next) {
      if (node.parent.id !== parent.id || node.name !== name) continue;
      if (node.mount.type === NODEFS && !onDisk(node)) FS.hashRemoveNode(node);
      break;
    }
    return lookupNode(parent, name);
  };
  for (const [mountPoint, hostRoot] of hostMounts()) {
    try {
      FS.mkdirTree(mountPoint);
      FS.mount(NODEFS, { root: hostRoot }, mountPoint);
    } catch (e) {
      console.error(`Astra3 Engine: ${hostRoot} is not available to Python (${e.message || e}).`);
    }
  }

  const decoder = { 1: new util.TextDecoder("utf-8"), 2: new util.TextDecoder("utf-8") };
  const writer = (fd) => ({
    isatty: false,
    write(buffer) {
      if (WINDOWS) {
        writeAll(fd, Buffer.from(outputToHost(decoder[fd].decode(buffer, { stream: true })), "utf-8"));
      } else {
        writeAll(fd, buffer);
      }
      return buffer.length;
    },
  });
  py.setStdout(writer(1));
  py.setStderr(writer(2));
  py.setStdin({
    stdin: () => {
      const reply = ask({ type: "input" });
      if (reply.line === null || reply.line === undefined) return null;
      return inputToPython(reply.line) + "\n";
    },
  });
  py.setInterruptBuffer(interrupt);

  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  py.registerJsModule("_astra3_host", {
    platform: process.platform,
    pyodide_version: py.version,
    // Sleeps without spinning; Pyodide's own time.sleep keeps a core busy.
    sleep: (seconds) => { Atomics.wait(sleeper, 0, 0, Math.max(0, seconds * 1000)); },
    fetch: (url, method, headersJson, body, timeout) => {
      const reply = ask({
        type: "fetch", url, method,
        headers: headersJson ? JSON.parse(headersJson) : {},
        body: body ? Buffer.from(body.toJs ? body.toJs() : body) : null,
        timeout,
      });
      if (reply.error) return { error: reply.error };
      return {
        status: reply.status, reason: reply.reason, url: reply.url,
        headers: JSON.stringify(reply.headers), body: reply.body,
      };
    },
  });

  py.globals.set("_astra3_cwd", toPython(cwd));
  py.globals.set("_astra3_script", toPython(script));
  try {
    py.runPython(`
import os, sys
sys.dont_write_bytecode = True
try:
    os.chdir(_astra3_cwd)
except OSError:
    pass
sys.argv = [_astra3_script]
sys.path.insert(0, os.path.dirname(_astra3_script))
import astra3_engine
astra3_engine.run_script(_astra3_script)
`);
  } catch (e) {
    const text = String((e && e.message) || e);
    // SystemExit ends the program; anything else is a crash worth showing.
    const exit = /SystemExit: (\d+)?/.exec(text);
    if (exit) process.exit(Number(exit[1] || 0));
    writeAll(2, Buffer.from(text + "\n"));
    process.exit(1);
  }
  process.exit(0);
}

if (isMainThread) {
  main();
} else {
  worker().catch((e) => {
    writeAll(2, Buffer.from(`Astra3 Engine could not start: ${(e && e.stack) || e}\n`));
    process.exit(1);
  });
}

#!/usr/bin/env node
/**
 * Stages the Python that ships inside the application bundle.
 *
 * By default this copies source. Bytecode compilation is available but is
 * OFF unless explicitly requested, for a reason that is worth stating
 * plainly:
 *
 *   CPython bytecode is only loadable by the exact minor version that
 *   produced it. Astra3's modules are imported by PyMOL's own bundled
 *   interpreter, whose version is chosen by whoever installed PyMOL and
 *   varies between PyMOL releases and between machines. A .pyc compiled on
 *   the build machine therefore fails to import on any user whose PyMOL
 *   ships a different Python, with "bad magic number".
 *
 * To compile anyway, set ASTRA3_COMPILE_WITH to the interpreter that the
 * target PyMOL uses, for example:
 *
 *   ASTRA3_COMPILE_WITH=/Applications/PyMOL.app/Contents/bin/python \
 *     npm run build:python
 *
 * That produces bytecode matching that PyMOL, and is only appropriate when
 * the PyMOL version in use is known and controlled. The build refuses to
 * guess an interpreter for this reason. The Astra3 Engine runs its own
 * Python and needs the source, so a bytecode build has no Astra3 Engine.
 *
 * Output: build/python-dist/
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "..", "python");
const OUT = path.join(__dirname, "..", "build", "python-dist");

// Executed as a file path (astra3.py by PyMOL or ChimeraX, the scene script by
// ChimeraX's runscript); a .pyc cannot be substituted here.
const KEEP_AS_SOURCE = new Set(["astra3.py", "astra3_chimerax_scene.py"]);

const compiler = process.env.ASTRA3_COMPILE_WITH || null;

function interpreterVersion(bin) {
  const out = execFileSync(bin, ["-c", "import sys;print('%d.%d' % sys.version_info[:2])"], { encoding: "utf-8" });
  return out.trim();
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let mode = "source";
let version = null;
if (compiler) {
  if (!fs.existsSync(compiler)) {
    console.error(`ASTRA3_COMPILE_WITH points at "${compiler}", which does not exist.`);
    process.exit(1);
  }
  version = interpreterVersion(compiler);
  mode = "bytecode";
}

const staged = [];
for (const name of fs.readdirSync(SRC).sort()) {
  const full = path.join(SRC, name);
  if (fs.statSync(full).isDirectory()) continue;

  if (mode === "bytecode" && name.endsWith(".py") && !KEEP_AS_SOURCE.has(name)) {
    const target = path.join(OUT, name.replace(/\.py$/, ".pyc"));
    execFileSync(compiler, [
      "-c",
      "import py_compile,sys; py_compile.compile(sys.argv[1], cfile=sys.argv[2], doraise=True, optimize=2)",
      full, target,
    ], { stdio: "inherit" });
    staged.push(`${name} -> ${path.basename(target)}`);
  } else {
    fs.copyFileSync(full, path.join(OUT, name));
    staged.push(name);
  }
}

console.log(`Mode: ${mode}${version ? ` (Python ${version})` : ""}`);
for (const s of staged) console.log(`  ${s}`);
if (mode === "bytecode") {
  console.log(`\nThese modules will ONLY import under Python ${version}.`);
  console.log("If the installed PyMOL bundles a different Python, the application will fail to start.");
} else {
  console.log("\nSource staged. Set ASTRA3_COMPILE_WITH=<pymol python> to compile instead.");
}

#!/usr/bin/env node
/**
 * Stages the Python that ships inside the application bundle.
 *
 * By default this copies source. CPython bytecode loads only under the
 * minor version that produced it, and Astra3's modules are imported by the
 * interpreter of whatever PyMOL is installed, which varies between PyMOL
 * releases and between computers. A .pyc made on the build computer
 * therefore fails with "bad magic number" wherever PyMOL's Python differs.
 *
 * To compile anyway, set ASTRA3_COMPILE_WITH to the interpreter that the
 * target PyMOL uses, for example:
 *
 *   ASTRA3_COMPILE_WITH=/Applications/PyMOL.app/Contents/bin/python \
 *     npm run build:python
 *
 * That suits only a known, fixed PyMOL, so the build never guesses an
 * interpreter. The Astra3 Engine runs its own Python and needs the source,
 * so a bytecode build has no Astra3 Engine.
 *
 * Output: build/python-dist/
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const SRC = process.env.ASTRA3_PYTHON_SRC || path.join(__dirname, "..", "..", "python");
const OUT = process.env.ASTRA3_PYTHON_DIST || path.join(__dirname, "..", "build", "python-dist");

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

// Anything else in python/ (batch lists, settings, run output) belongs to
// the computer that built the app.
const SHIPPED = /^(astra3[A-Za-z0-9_]*\.py|astra3_logo\.png)$/;

const staged = [];
const left = [];
for (const name of fs.readdirSync(SRC).sort()) {
  const full = path.join(SRC, name);
  if (fs.statSync(full).isDirectory()) continue;
  if (!SHIPPED.test(name)) {
    left.push(name);
    continue;
  }

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
if (left.length) console.log(`Not staged: ${left.join(", ")}`);
if (mode === "bytecode") {
  console.log(`\nThese modules will ONLY import under Python ${version}.`);
  console.log("If the installed PyMOL bundles a different Python, the application will fail to start.");
} else {
  console.log("\nSource staged. Set ASTRA3_COMPILE_WITH=<pymol python> to compile instead.");
}

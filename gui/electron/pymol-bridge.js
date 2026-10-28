// ============================================================
// Astra3: PyMOL process bridge (Electron main process only)
// ============================================================
// This is the ONLY place in the whole application that spawns PyMOL or talks
// to Astra3's own command grammar. It deliberately does not know anything
// about the GUI's pages/forms -- it accepts exactly the same command strings
// a person would type at Astra3's own "Enter a PDB ID:" prompt
// (e.g. "9BOX -low -csv", "OVERLAY 6DK3 9BOX -mmCIF") and returns/emits the
// same stdout Astra3 already prints. No parallel command language, no
// duplicated grammar -- by design, the GUI and Advanced Console share one
// interface.
//
// The stdout PARSING (progress/prompt/ completion detection) depends on the
// ANSI-stripping step below, because every regex here was being tested
// against raw, ANSI- color-coded text (Astra3 colors nearly every line --
// e.g. format_yn_prompt() in astra3_core.py interleaves color codes between
// every character of "(y/n)" itself), so literally none of PROMPT_RE,
// PROGRESS_MARKERS, or the "Ready for next" completion check could ever
// match.
// ============================================================

const { spawn } = require("child_process");
const { EventEmitter } = require("events");
const readline = require("readline");
const { describePymolLaunchError, explainStartupFailure } = require("./mac-compat");

// How long a launch may take to reach the ready prompt. A first launch can be
// slow (Gatekeeper checks, or an Intel PyMOL translated by Rosetta on Apple
// silicon), so this is generous; a launch that takes longer is reported as a
// failure instead of being sent commands it cannot yet read.
const READY_TIMEOUT_MS = 90000;

// Strips ANSI/SGR color escape sequences (e.g. "\x1b[92m", "\x1b[0m",
// "\x1b[38;5;229m") so pattern matching below can test against the actual
// TEXT of a line, not the raw bytes -- see the file header above for why this
// matters: every color constant in astra3_core.py
// (RED/GREEN/YELLOW/.../RESET, plus the 256-color STAR_*/ASTRA_PURPLE banner
// colors) is exactly this shape, and Astra3 wraps color codes around most of
// what it prints, including interleaved between individual characters
// (format_yn_prompt() puts a color code before AND after each of "(", "y",
// "/", "n", ")" individually). Scoped precisely to "ESC [ <digits/semicolons>
// m" -- the SGR form, which is the only ANSI sequence type Astra3 ever emits
// -- rather than a more exotic general-purpose ANSI-stripping pattern that
// would be harder to verify covers exactly what's actually used here and
// nothing more.
function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

// Astra3's own y/n prompts always end in this exact shape, per
// astra3_core.py's format_yn_prompt() (e.g. "Use only chain A for this
// analysis? (y/n): "). Matching on the trailing "(y/n):" is deliberately
// loose about the question text, since Astra3 has several different prompts
// that all share this ending.
//
// IMPORTANT: every real prompt in astra3_core.py/astra3_structure.py is
// printed with print(..., end="", flush=True) -- there is NO trailing newline
// before Astra3 calls input() and blocks. This is deliberate on the Python
// side (a real interactive terminal expects the cursor to sit right after
// "(y/n): " on the same line, not on a fresh line below it) but it has a real
// consequence here: Node's readline 'line' event ONLY fires on a newline
// character, so a naive line-buffered read of stdout would NEVER see the
// prompt text at all -- the process would appear to just hang with no visible
// prompt and no way to answer. This is handled below by accumulating raw
// stdout chunks (not readline) and checking the unterminated trailing
// fragment against this same regex on every chunk, in addition to normal
// line-by-line handling for everything else.
const PROMPT_RE = /\(y\/n\)(?:\/\w+)*:\s*$/i;
const ENGINE_LINE_RE = /^\s*(?:>\s*)?Engine:\s*(PyMOL|ChimeraX|Astra3 Engine)(?:\s+v?([0-9][^\s]*))?/;

// Astra3's own "this run was cancelled" prints -- "Analysis cancelled.
// Cleaning up and returning to the PDB prompt." and the OVERLAY/TERMINI/Import
// forms of it, plus the bare "Cancelled. Ready for the next command."
//
// A cancel that lands on one of astra3.py's own check_for_cancellation()
// checkpoints returns to the prompt EXACTLY like a successful run does: same
// "Ready for next..." line, same prompt. Without reading these notices the
// completion check below cannot tell the two apart,.
const RUN_CANCELLED_RE = /^(?:Analysis|OVERLAY|TERMINI|BATCH|Import) cancelled\b|^Cancelled\. Ready for/i;

// How long cancel() waits for a graceful SIGINT cancel to actually take
// effect before force-killing the whole PyMOL process instead. Long enough
// that a normal in-progress-loop cancellation (which Astra3's own
// check_for_cancellation() checkpoints handle fine) has time to land; short
// enough that someone who cancelled while a prompt was blocking input() --
// which SIGINT can never unblock on its own, see cancel()'s own comment --
// isn't left staring at "Cancelling..." for long before the app gives up and
// resets for them.
const FORCE_CANCEL_TIMEOUT_MS = 4000;

// A conservative set of "this line means the run reached roughly this far
// along" markers, built from print statements that appear verbatim in
// astra3.py / astra3_structure.py / astra3_render_report.py. Order matters
// only in that later matches overwrite the progress value if a later stage's
// line arrives.
const PROGRESS_MARKERS = [
  [/^Processing:/, 10],
  [/^Chain \S+ named/, 20],
  [/^N-Terminus:/, 30],
  [/^Ligand named/, 35],
  [/Intra-Structure Homomer Detected/, 45],
  [/^Report saved:/, 60],
  [/^Session saved:/, 70],
  [/^Taking pictures of:/, 75],
  [/^Saved view_/, 85],
  [/^HTML report saved:/, 97],
  [/^JSON export saved:/, 100],
];

class PymolBridge extends EventEmitter {
  constructor({ getPymolPath, getAstraScriptPath, getWorkingDir, getAstraBaseDir, getEngine, getChimeraxPath, getPaletteFile, getAstra3Engine }) {
    super();
    this.getPymolPath = getPymolPath;
    this.getEngine = getEngine || (() => "pymol");
    this.getChimeraxPath = getChimeraxPath || (() => null);
    this.getAstraScriptPath = getAstraScriptPath;
    this.getWorkingDir = getWorkingDir;
    this.getAstraBaseDir = getAstraBaseDir;
    this.getPaletteFile = getPaletteFile;
    this.getAstra3Engine = getAstra3Engine || (() => null);
    this.proc = null;
    this._stdoutBuffer = ""; // raw, unterminated tail of stdout not yet resolved into a complete line or a detected prompt
    // Recent complete output lines, kept so a prompt can be interpreted with
    // the lines that preceded it. Alternatives are often stated above the
    // question rather than in it ("Or type a chain letter (A, B)..."), so the
    // question alone is not enough to tell whether a typed answer is valid.
    this._recentLines = [];
    this._pendingPrompt = null; // { resolve } while awaiting a y/n answer
    this._pendingCommand = null; // { resolve, reject } for the in-flight runCommand()
    this._startPromise = null; // the in-flight launch, while start() waits for the ready prompt
    this._cancelledRun = false; // whether the in-flight command was cancelled rather than completed
    this._lastSessionPath = null; // most recent "Session saved: <path>" seen during the current run, reset per command
    this._lastReportPath = null; // most recent "HTML report saved: <path>" -- same lifecycle
    this._lastOutputAt = 0; // timestamp of the most recent stdout line -- see cancel()'s force-kill logic
    this._readyResolvers = []; // pending { resolve } callbacks waiting for astra3.py's own "Enter a PDB ID" ready-prompt -- see _handleLine and start()'s own comment on the launch race this exists to fix
    // { triggerRegex, response } while a command needs an automatic follow-up
    // answer WITHOUT surfacing a user-facing prompt at all -- see
    // runImportCommand's own comment for why IMPORT needs this (its "Enter
    // file path:" question has an answer the GUI already knows, since the
    // person picked the file through the GUI's own file picker/drop zone, not
    // something to ask them again). Cleared the instant it fires (one-shot)
    // so it can never accidentally fire twice or leak into a later, unrelated
    // command.
    this._autoRespond = null;
    // Real AST-XXXX IDs (and their PyMOL object names) astra3.py actually
    // registered during the CURRENT command, parsed straight from its own
    // "Temporary ID: AST-XXXX Name: <name>" print (see the IMPORT command
    // handler in astra3.py) -- reset per command, same lifecycle as
    // _lastSessionPath just above.
    this._lastRegisteredIds = [];
    // Bumped by every start(), and captured by closure in every event handler
    // that start() registers (stdout "data", stderr "line", process "exit").
    this._generation = 0;
    // Files imported this session, newest first: { path, entries: [{ id,
    // name }] }. Imports only live as long as the engine process, which is
    // restarted by engine switches, forced cancels and crashes, so each new
    // engine re-imports these under the same IDs (_restoreImports).
    this.imports = [];
    // Sequence number added to every "log" event. Results and log lines
    // reach the renderer over separate IPC channels, so each result carries
    // the number of its last line (lastLogSeq) and the renderer waits for it.
    this._logSeq = 0;
  }

  emit(event, payload) {
    if (event === "log" && payload) payload = { ...payload, seq: ++this._logSeq };
    return super.emit(event, payload);
  }

  // Imported structures for the Import page, one entry per ID, newest first.
  importList() {
    return this.imports.flatMap((record) => record.entries.map((e) => ({ id: e.id, name: e.name, path: record.path })));
  }

  // Removes these IDs from the import list and notifies the renderer.
  _dropImports(ids) {
    if (!ids.length) return;
    const before = this.importList().length;
    this.imports = this.imports
      .map((record) => ({ ...record, entries: record.entries.filter((e) => !ids.includes(e.id)) }))
      .filter((record) => record.entries.length > 0);
    if (this.importList().length !== before) this.emit("state", { imports: this.importList() });
  }

  _engineName() {
    return { pymol: "PyMOL", chimerax: "ChimeraX", astra3: "Astra3 Engine" }[this.engine] || "PyMOL";
  }

  // Whether the engine process is still alive. Not ChildProcess.killed, which
  // Node sets for any signal sent, including the SIGINT of a cancel: Astra3
  // handles that and goes on running, and taken for stopped it would be left
  // running beside the next engine started.
  isRunning() {
    return !!this.proc && this.proc.exitCode === null && this.proc.signalCode === null;
  }

  // A launch or a command is in progress.
  isBusy() {
    return !!this._startPromise || !!this._pendingCommand;
  }

  // Starts PyMOL running Astra3's own script.
  //
  // IMPORTANT: astra3.py is an interactive script written to be run via
  // PyMOL's own `run <path>,main` command typed AFTER PyMOL has already
  // started (that's what astra3.command does, and it's why the very first
  // line PyMOL itself prints is "PyMOL>run .../astra3.py,main" in every real
  // session transcript). Launching PyMOL with only `-cq` and no script
  // argument starts a bare PyMOL prompt that was never told to run Astra3 at
  // all -- every "command" written to its stdin after that gets interpreted
  // as raw PyMOL syntax instead of an Astra3 command, which PyMOL silently
  // fails on under -q (quiet) with no visible error, and the bridge's "Ready
  // for next command" detector never fires because Astra3 itself never
  // actually started -- matching exactly the "freezes immediately, no output
  // at all" symptom this was built to fix.
  //
  // Passing the script path directly as a PyMOL command-line argument (`pymol
  // -cq /path/to/astra3.py`) is the equivalent, non-interactive way to get
  // the same result -- PyMOL runs the given script on startup, same as typing
  // `run astra3.py` at its own prompt would.
  // One launch at a time. A second caller during a launch (the console
  // opening, then a command typed straight away) waits for that launch's
  // ready prompt instead of starting another or writing to a process that
  // is not reading input yet.
  start() {
    if (this._startPromise) return this._startPromise;
    if (this.isRunning()) return Promise.resolve({ ok: true, alreadyRunning: true });
    this._startPromise = this._launch().finally(() => { this._startPromise = null; });
    return this._startPromise;
  }

  // Resolves once PyMOL is running and past its ready prompt, launching it
  // if needed.
  _ensureStarted() {
    if (this.isRunning() && !this._startPromise) return Promise.resolve({ ok: true });
    return this.start();
  }

  async _launch() {
    if (this.isRunning()) return { ok: true, alreadyRunning: true };
    this._recentLines = [];
    this._stdoutBuffer = ""; // reset in case this is a restart after a previous process's stop()/crash

    // The analysis engine chosen in Settings. Both run astra3.py the same
    // way -- a script reading commands on stdin -- so everything after the
    // launch is shared.
    const wanted = this.getEngine();
    const engine = wanted === "chimerax" || wanted === "astra3" ? wanted : "pymol";
    this.engine = engine;
    const engineName = { pymol: "PyMOL", chimerax: "ChimeraX", astra3: "Astra3 Engine" }[engine];
    // The Astra3 Engine is this app's own executable running
    // engine/astra3-engine.js, with images drawn by the app (own.jobs).
    const own = engine === "astra3" ? this.getAstra3Engine() : null;
    // The app's jobs folder: the Astra3 Engine's images, and for every
    // engine the scenes shown in the drawing window (python/astra3_window.py).
    const jobs = (this.getAstra3Engine() || {}).jobs || null;
    if (engine === "astra3" && !(own && own.script)) {
      const msg = "The Astra3 Engine's files are missing from this installation. Reinstall Astra3, or choose PyMOL or ChimeraX in Settings > Analysis engine.";
      this.emit("log", { text: msg, tone: "error" });
      return { ok: false, error: msg };
    }
    const pymolPath = engine === "astra3" ? process.execPath
      : engine === "chimerax" ? this.getChimeraxPath() : this.getPymolPath();
    if (!pymolPath) {
      const msg = "Neither PyMOL nor ChimeraX was found -- open Settings > Analysis engine and choose where either one is installed (one-time setup).";
      this.emit("log", { text: msg, tone: "error" });
      return { ok: false, error: msg };
    }
    this.emit("state", { engine: engineName });
    const scriptPath = this.getAstraScriptPath();
    if (!scriptPath) {
      // This is not a user-configuration problem (astra3.py's location is
      // resolved automatically, not picked by the user) -- reaching this
      // means the install itself is missing python/astra3.py, which is a
      // packaging/installation problem, not something Settings can fix.
      const msg = "Could not find astra3.py alongside this app. Your Astra3 installation may be incomplete or damaged -- try reinstalling.";
      this.emit("log", { text: msg, tone: "error" });
      return { ok: false, error: msg };
    }

    // See the constructor's own comment on _generation. Every event handler
    // registered below captures thisGeneration and checks it against
    // this._generation before touching any shared state -- once a NEWER
    // start() call bumps the counter, this process's own (possibly still-
    // dying, not-yet-exited) handlers become no-ops.
    this._generation += 1;
    const thisGeneration = this._generation;
    // Set by the 'error' handler below if the launch fails asynchronously
    // (the normal case for EACCES/ENOENT -- see that handler's own comment);
    // checked just before the final return so start() reports the real
    // failure immediately instead of waiting out the ready-
    // wait safety net below and then returning a misleading { ok: true }.
    let launchError = null;
    // Output printed before the ready prompt, for the error shown when a
    // launch fails, and whether the process exited while starting.
    let launchCapture = "";
    let awaitingReady = true;
    let exitedDuringStartup = false;
    let startupExitCode = null;

    try {
      // ASTRA3_BASE_DIR: see resolveAstraBaseDir() in main.js for why this
      // needs to be set explicitly. process.env is spread first so PyMOL
      // still gets a normal environment (PATH, etc.) -- only ASTRA3_BASE_DIR
      // is added/overridden, and only when a value is actually configured
      // (getAstraBaseDir() returns null before the person has ever touched
      // the output directory setting, in which case Astra3's own
      // detect_base_dir() fallback chain applies exactly as if this override
      // didn't exist).
      const baseDir = this.getAstraBaseDir ? this.getAstraBaseDir() : null;
      // PYTHONDONTWRITEBYTECODE: the engine must not write __pycache__ into an
      // app bundle (Astra3's own or its own); macOS blocks that and names
      // Astra3 in a "prevented from modifying apps" notice.
      const env = { ...process.env, PYTHONDONTWRITEBYTECODE: "1", ASTRA3_ENGINE: engine };
      // Images are drawn by a windowed ChimeraX (its no-window mode cannot
      // render on macOS); on macOS it is the same program.
      if (engine === "chimerax") env.ASTRA3_CHIMERAX_GUI = pymolPath;
      if (baseDir) env.ASTRA3_BASE_DIR = baseDir;
      if (this.getPaletteFile) env.ASTRA3_PALETTE_FILE = this.getPaletteFile();
      if (own) env.ELECTRON_RUN_AS_NODE = "1";
      if (jobs) {
        env.ASTRA3_ENGINE_JOBS = jobs.newJobsDir();
        jobs.watch(env.ASTRA3_ENGINE_JOBS);
      }
      // ChimeraX runs the script in its no-window mode, where a script reads
      // stdin and prints to stdout as PyMOL's -c mode does. --exit closes it
      // when the script ends; --nostatus keeps status-line chatter out of the
      // output the app parses. ChimeraX runs the --script value as
      // "runscript <value>", which splits on spaces, so the path is quoted.
      const args = engine === "astra3" ? [own.script, scriptPath]
        : engine === "chimerax"
          ? ["--nogui", "--exit", "--nostatus", ...(process.platform === "linux" ? ["--offscreen"] : []), "--script", `"${scriptPath}"`]
          : ["-cq", scriptPath];
      this.proc = spawn(pymolPath, args, {
        cwd: this.getWorkingDir(),
        stdio: ["pipe", "pipe", "pipe"],
        env,
      });
    } catch (e) {
      const msg = `Failed to launch ${engineName} at "${pymolPath}": ${e.message}`;
      this.emit("log", { text: msg, tone: "error" });
      return { ok: false, error: msg };
    }

    this.proc.stdout.setEncoding("utf-8");
    this.proc.stdout.on("data", (chunk) => {
      if (thisGeneration !== this._generation) return; // stale process, superseded by a newer start() -- ignore
      if (awaitingReady && launchCapture.length < 4000) launchCapture += chunk;
      this._handleStdoutChunk(chunk);
    });

    // spawn() does NOT throw synchronously for most real-world launch
    // failures (a missing executable, wrong permissions, or -- -- selecting a
    // macOS .app bundle instead of the real binary inside it). Node reports
    // those asynchronously via an 'error' event on the returned ChildProcess
    // instead. With no listener for that event anywhere, Node's own default
    // behavior for an unhandled 'error' event is to THROW it, which crashes
    // the entire Electron main process with exactly the "Uncaught Exception:
    // Error: spawn ... EACCES" dialog this produces -- not a bug in the
    // spawned command itself, a bug in this file never listening for the one
    // event that actually reports that class of failure. The try/catch around
    // the spawn() call above only ever catches synchronous throws (a
    // genuinely malformed options object, for example), which is a real but
    // much rarer failure mode than this.
    this.proc.on("error", (err) => {
      if (thisGeneration !== this._generation) return;
      const msg = (engine === "pymol" && describePymolLaunchError(err, pymolPath, process.platform, process.arch)) || `Failed to launch ${engineName} at "${pymolPath}": ${err.message}`;
      launchError = msg;
      this.emit("log", { text: msg, tone: "error" });
      this.emit("state", { running: false, exitCode: null, launchError: msg });
      this.proc = null;
      if (this._pendingCommand) {
        this._pendingCommand.reject(new Error(msg));
        this._pendingCommand = null;
      }
      // Drains the ready-wait Promise below immediately instead of leaving it
      // to the ready timeout -- without this, start() would still wait out
      // the whole timeout before returning, and
      // even then would return the wrong { ok: true } since nothing else
      // checked launchError.
      if (this._readyResolvers.length > 0) {
        const resolvers = this._readyResolvers;
        this._readyResolvers = [];
        resolvers.forEach((resolve) => resolve());
      }
    });

    const stderrRl = readline.createInterface({ input: this.proc.stderr });
    stderrRl.on("line", (line) => {
      if (thisGeneration !== this._generation) return;
      if (awaitingReady && launchCapture.length < 4000) launchCapture += line + "\n";
      this.emit("log", { text: line, tone: "error" });
    });

    this.proc.on("exit", (code) => {
      if (thisGeneration !== this._generation) {
        // A newer process has already replaced this one -- this exit event
        // belongs to a stale, superseded process (e.g. one this same instance
        // force-killed via stop(), whose actual OS-level termination only
        // completed after a new start() already ran). Touching
        // _pendingCommand/_pendingPrompt here would corrupt whatever the NEW
        // process is currently doing, so this is a deliberate no-op rather
        // than the normal cleanup below.
        return;
      }
      if (jobs) jobs.stop();
      this.emit("state", { running: false, exitCode: code });
      this.proc = null;
      if (awaitingReady) {
        exitedDuringStartup = true;
        startupExitCode = code;
      }
      // If PyMOL exits (crash, ModuleNotFoundError, killed, whatever) while a
      // command was in flight or a y/n prompt was pending, those promises
      // must be settled here. Without this, runCommand()'s caller (see
      // app.jsx's runAstraCommand) awaits forever: its finally-block never
      // runs, isBusy never clears, and the whole app appears permanently
      // "busy" with no way to recover except force-quitting the app itself.
      // This was the root cause behind the console hanging after a crash AND
      // behind "Could not cancel: PyMOL is not running" (cancel() correctly
      // saw this.proc as null, but nothing had told the stuck UI that the run
      // was actually over).
      if (this._pendingCommand) {
        const err = new Error(
          code === 0
            ? `${engineName} exited before this command finished.`
            : `${engineName} exited unexpectedly (code ${code}) while this command was running. Check the console log above for the Python traceback.`
        );
        this._pendingCommand.reject(err);
        this._pendingCommand = null;
      }
      if (this._pendingPrompt) {
        // _pendingPrompt here is just a marker (not a promise -- the real
        // promise blocking the UI lives in app.jsx's onPrompt, waiting on the
        // renderer's PromptDialog). Rejecting _pendingCommand above already
        // unblocks that promise chain, but the PromptDialog itself is still
        // open with no way to dismiss it. Emitting a null prompt tells the
        // renderer to close it.
        this._pendingPrompt = null;
        this.emit("state", { prompt: null, promptClosedReason: "process-exited" });
      }
      this._stdoutBuffer = ""; // stale partial-line state from the dead process, never useful after exit
      this._recentLines = []; // likewise: prompt context from a dead process must not describe a new one
    });

    this.emit("state", { running: true });

    // A launch that ends before the ready prompt stops the wait once all of
    // its output has been read ("close" comes after the last output; "exit"
    // can come before it), so the error can quote what PyMOL printed.
    const startupProc = this.proc;
    startupProc.once("close", (code) => {
      if (!awaitingReady || thisGeneration !== this._generation) return;
      exitedDuringStartup = true;
      if (startupExitCode === null) startupExitCode = code;
      const resolvers = this._readyResolvers;
      this._readyResolvers = [];
      resolvers.forEach((resolve) => resolve());
    });

    // spawn() returning does NOT mean astra3.py is actually ready for input
    // -- it means the OS process exists, which is well before Python has even
    // finished importing its own modules, let alone printed the startup
    // banner and reached its own "Enter a PDB ID:" ready-prompt.
    // runCommand() wrote straight to stdin the instant start() returned, so a
    // command typed while PyMOL was still launching landed in the OS pipe
    // buffer well before Python ever called input(). Waiting for the real
    // ready-prompt line here means nothing is EVER written to stdin before
    // Python has genuinely called input() and is actually listening.
    // this._readyResolvers is drained by _handleLine the moment that exact
    // line arrives (see there); a generous timeout is a safety net only, not
    // the normal path.
    let timedOut = false;
    await new Promise((resolve) => {
      const timer = setTimeout(() => { timedOut = true; resolve(); }, READY_TIMEOUT_MS);
      this._readyResolvers.push(() => { clearTimeout(timer); resolve(); });
    });
    awaitingReady = false;

    if (thisGeneration !== this._generation) {
      return { ok: false, error: `${engineName} was stopped before it finished starting.` };
    }
    if (!launchError && exitedDuringStartup) {
      const captured = launchCapture.trim();
      const reason = engine === "pymol" ? explainStartupFailure(captured) : null;
      const codeText = startupExitCode === null ? "unknown" : String(startupExitCode);
      launchError = reason
        ? `${reason}\n${engineName}: ${pymolPath}`
        : captured
          ? `${engineName} exited during startup (exit code ${codeText}) before it was ready to receive commands.\n${engineName}: ${pymolPath}\nOutput before it exited:\n${captured}`
          : `${engineName} exited during startup (exit code ${codeText}) without printing anything.\n${engineName}: ${pymolPath}\nCheck that the ${engineName} location in Settings points at a working installation.`;
      this.emit("log", { text: launchError, tone: "error" });
    }
    if (!launchError && timedOut) {
      const captured = launchCapture.trim();
      launchError = `${engineName} started but Astra3 did not become ready within ${READY_TIMEOUT_MS / 1000} seconds.\n${engineName}: ${pymolPath}`
        + (captured ? `\nOutput so far:\n${captured}` : "");
      this.emit("log", { text: launchError, tone: "error" });
      this.stop();
    }
    if (launchError) return { ok: false, error: launchError };
    await this._restoreImports(engineName);
    return { ok: true };
  }

  // Re-imports this session's files into a freshly started engine under
  // their existing IDs. Runs before the launch resolves, so the command that
  // triggered the launch can use them. Files that can no longer be read are
  // dropped; if the engine dies part-way, the rest are kept for next time.
  async _restoreImports(engineName) {
    if (this.imports.length === 0) return;
    const count = this.imports.length;
    this.emit("log", { text: `Importing ${count} file${count === 1 ? "" : "s"} again in ${engineName}, under the same IDs.`, tone: "muted" });
    const restored = [];
    let changed = false;
    // Oldest first, in the order they were originally imported.
    const pending = this.imports.slice().reverse();
    while (pending.length) {
      const record = pending[0];
      const file = record.path.split(/[\\/]/).pop();
      let result;
      try {
        result = await this._dispatch(`IMPORT ${record.entries.map((e) => e.id).join(" ")}`, { autoRespond: record.path });
      } catch {
        break;
      }
      pending.shift();
      const got = result.registeredIds || [];
      if (got.length === 0) {
        changed = true;
        this.emit("log", { text: `${file} could not be imported again (it may have been moved or deleted); ${record.entries.map((e) => e.id).join(", ")} no longer ${record.entries.length === 1 ? "works" : "work"}. Import it again to use it.`, tone: "warning" });
        continue;
      }
      if (got.map((e) => `${e.id} ${e.name}`).join("|") !== record.entries.map((e) => `${e.id} ${e.name}`).join("|")) {
        changed = true;
        this.emit("log", { text: `${file} has changed since it was imported; it is now ${got.map((e) => e.id).join(", ")}.`, tone: "warning" });
      }
      restored.push({ path: record.path, entries: got });
    }
    // Keep newest-first order; files not reached stay for the next launch.
    this.imports = [...restored.reverse(), ...pending.reverse()];
    if (changed) this.emit("state", { imports: this.importList() });
  }

  stop() {
    // Invalidates this process's generation immediately -- before even kill()
    // is called -- so any stdout/stderr/exit event this now-dying process
    // fires afterward (kill() sends a termination signal but does not
    // guarantee instant death) is recognized as stale by the generation check
    // in start()'s handlers and ignored, rather than mutating shared state a
    // subsequent start() call's NEW process is now relying on.
    this._generation += 1;
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
    // Every engine gets a jobs folder (the drawing window's scenes; the Astra3
    // Engine's images), so every engine's is removed here.
    const own = this.getAstra3Engine();
    if (own && own.jobs) own.jobs.stop();
    if (this._pendingCommand) {
      this._pendingCommand.reject(new Error(`${this._engineName()} was stopped`));
      this._pendingCommand = null;
    }
    // A pending prompt marker (and the renderer's own dialog state) must also
    // be cleared here. During that window, the renderer's prompt dialog could
    // still be showing (or reappear) for a run that Astra3's own side had
    // already been forcibly torn down for.
    if (this._pendingPrompt) {
      this._pendingPrompt = null;
      this.emit("state", { prompt: null, promptClosedReason: "process-stopped" });
    }
  }

  // Cancels the CURRENTLY RUNNING command without killing the PyMOL process
  // itself -- equivalent to pressing Ctrl+C at a real terminal running
  // astra3.py, which astra3_core.py's own handle_sigint() is already built to
  // catch (see the project's cancellation infrastructure:
  // check_for_cancellation(), OperationCancelled). SIGINT is not available on
  // Windows the same way; child_process.kill falls back to forcibly
  // terminating the process there instead, since there is no equivalent
  // "interrupt but keep running" signal on that platform for a console
  // subprocess in this configuration.
  //
  // KNOWN LIMITATION this works around: astra3_core.py's handle_sigint only
  // sets a flag that's checked at specific checkpoints inside a running
  // analysis loop (check_for_cancellation()) -- it does NOT raise anything
  // itself, which means it does NOT unblock PyMOL if it's currently sitting
  // inside a blocking input() call waiting for a y/n-style prompt answer"
  // behavior, and this handler never re-raises that itself). This arms a
  // bounded fallback: force the whole PyMOL process closed (stop()) if the
  // SAME command is still pending AND nothing new has been printed for
  // FORCE_CANCEL_TIMEOUT_MS.
  //
  // Deliberately evidence-based (polls for silence) rather than a single
  // fixed-delay shot: a multi-structure TERMINI/OVERLAY cancellation can
  // legitimately take several seconds to clean up (deleting temp objects per
  // structure, closing out image writes in progress) while still printing
  // progress the whole time -- a flat "force-kill N seconds after cancel()
  // was called, no matter what" could fire WHILE that legitimate cleanup was
  // still actively happening and about to finish on its own, killing a
  // process that wasn't actually stuck. Checking for silence (no new output)
  // is what actually distinguishes "genuinely blocked on an unanswered prompt
  // with zero further output" from "still working."
  cancel() {
    if (!this.isRunning()) return { ok: false, error: `${this._engineName()} is not running.` };
    if (!this._pendingCommand) return { ok: false, error: "No command is currently running." };

    // Recorded before the signal goes out, so the result this run resolves
    // with says it was cancelled however Astra3 chooses to end -- at one of
    // its own checkpoints, or not at all.
    this._cancelledRun = true;

    const pendingAtCancelTime = this._pendingCommand;
    if (this.engine === "astra3") {
      // The Astra3 Engine reads a line holding only Ctrl+C as a cancel, on
      // every platform, so it is not restarted on Windows.
      this.proc.stdin.write("\x03\n");
      this.emit("log", { text: "Sent cancel to the Astra3 Engine.", tone: "muted" });
    } else if (process.platform === "win32") {
      this.stop(); // no graceful interrupt available; this is a full restart of the PyMOL process on Windows
      return { ok: true };
    } else {
      this.proc.kill("SIGINT");
      this.emit("log", { text: `Sent cancel signal to ${this._engineName()}.`, tone: "muted" });
    }

    const checkForStillStuck = () => {
      // Only relevant if THIS SAME command is still the one pending -- if
      // it's null (finished) or a different object (a new command started
      // since), the graceful cancel already worked (or this cancel() call is
      // simply stale) and there's nothing to force.
      if (this._pendingCommand !== pendingAtCancelTime) return;
      const silentFor = Date.now() - this._lastOutputAt;
      if (silentFor >= FORCE_CANCEL_TIMEOUT_MS) {
        this.emit("log", {
          text: `Cancel didn't take effect within a few seconds (${this._engineName()} can't be interrupted while drawing an image or waiting for an answer), so it was closed. It restarts with the next command, with imported files restored.`,
          tone: "warning",
        });
        this.stop();
        return;
      }
      // Still pending but has printed something recently -- genuinely
      // working, not stuck. Check again once whatever time remains until it
      // WOULD have been silent for the full timeout elapses.
      setTimeout(checkForStillStuck, FORCE_CANCEL_TIMEOUT_MS - silentFor);
    };
    setTimeout(checkForStillStuck, FORCE_CANCEL_TIMEOUT_MS);

    return { ok: true };
  }

  // Writes one command exactly as a person would type it at Astra3's own
  // prompt, and resolves once that run appears to have finished (a "Ready for
  // next PDB." / "Ready for next command." line, per astra3.py's own prompt
  // text) or a bounded timeout elapses.
  async runCommand(commandString) {
    const startResult = await this._ensureStarted();
    if (!startResult.ok) return startResult;
    if (this._pendingCommand) {
      return { ok: false, error: "A command is already running." };
    }
    const own = this.getAstra3Engine();
    if (own && own.jobs && own.jobs.analysisStarted) own.jobs.analysisStarted(commandString);
    return this._dispatch(commandString);
  }

  // Sends one command line and resolves when Astra3 prompts for the next.
  // autoRespond answers IMPORT's "Enter file path:" prompt.
  _dispatch(commandString, { autoRespond = null } = {}) {
    return new Promise((resolve, reject) => {
      this._pendingCommand = { resolve, reject };
      this._cancelledRun = false; // a fresh command has not been cancelled
      this._lastSessionPath = null; // this run hasn't saved a session yet -- don't carry over a stale path from the previous command
      this._lastReportPath = null;
      this._lastRegisteredIds = []; // same reasoning -- don't carry over a stale registration list from the previous command
      this._autoRespond = autoRespond === null ? null : { triggerRegex: /Enter file path:\s*$/i, response: autoRespond };
      this.emit("log", { text: commandString, tone: "command" });
      this.proc.stdin.write(commandString + "\n");
    });
  }

  // Runs astra3.py's own IMPORT command end-to-end, including its second
  // interactive step -- Astra3 does not accept the file path as part of the
  // initial "IMPORT" command line at all; it always prints "Enter file path:"
  // and blocks on a separate input() call (see the IMPORT handler in
  // astra3.py). filePath is the REAL absolute path the person picked,
  // resolved on the renderer side via Electron's webUtils.getPathForFile()
  // (see preload.js) -- this writes "IMPORT", arms a one-shot auto-respond
  // for the "Enter file path:" line with that path as the answer (see
  // _handleLine's own auto-respond check), and waits for the command to
  // finish exactly like runCommand() does, since IMPORT loops back to the
  // same top-level "Enter a PDB ID:" prompt when it's done either
  // way (success or a rejected file).
  //
  // Resolves with the same shape runCommand() does, PLUS registeredIds -- the
  // real AST-XXXX id(s) astra3.py itself assigned (parsed from its own
  // "Temporary ID: ..." prints), not a client-side guess.
  //
  // Successful imports are recorded in this.imports so later engines can
  // restore them.
  async runImportCommand(filePath) {
    const startResult = await this._ensureStarted();
    if (!startResult.ok) return startResult;
    if (this._pendingCommand) {
      return { ok: false, error: "A command is already running." };
    }
    const result = await this._dispatch("IMPORT", { autoRespond: filePath });
    if (result.registeredIds && result.registeredIds.length) {
      this.imports.unshift({ path: filePath, entries: result.registeredIds });
      this.emit("state", { imports: this.importList() });
    }
    return result;
  }

  // Answers a pending y/n prompt (the renderer showed a native dialog for it;
  // this writes the chosen answer to PyMOL's stdin).
  answerPrompt(answer) {
    if (!this._pendingPrompt) return { ok: false, error: "No prompt is pending." };
    this.proc.stdin.write(answer + "\n");
    this._pendingPrompt = null;
    return { ok: true };
  }

  // Processes one raw chunk of stdout. Complete, newline-terminated lines are
  // handled exactly as before (progress markers, "Ready for next" completion
  // detection, tone classification for the console). The unterminated
  // remainder (if any) -- which is where a real y/n prompt lives, since
  // Astra3 prints those with end="" and never a trailing newline -- is
  // checked against PROMPT_RE on every chunk, so a prompt is detected the
  // moment it actually arrives rather than never.
  _handleStdoutChunk(chunk) {
    this._stdoutBuffer += chunk;

    const lines = this._stdoutBuffer.split("\n");
    // The last element is whatever came after the final '\n' in the buffer so
    // far -- NOT a complete line yet (or the whole thing, if no '\n' has
    // arrived at all). Keep it in the buffer; process everything before it as
    // complete lines.
    this._stdoutBuffer = lines.pop();

    for (const line of lines) {
      this._handleLine(line);
    }

    // Check the still-unterminated tail for a prompt. This is the actual fix:
    // without this, a prompt ending in "(y/n): " with no trailing newline
    // would sit in this._stdoutBuffer forever, invisible to _handleLine, and
    // the run would appear to hang with no way to respond.
    //
    // Tested against the ANSI-stripped buffer, not the raw one --
    // format_yn_prompt() in astra3_core.py interleaves a color code between
    // EVERY character of "(y/n)" (e.g. the literal bytes are
    // ESC[97m(ESC[0mESC[92myESC[0m...), so the raw buffer never contains the
    // literal substring "(y/n):" at all and this could never match before
    // stripping.
    if (PROMPT_RE.test(stripAnsi(this._stdoutBuffer))) {
      const promptText = this._stdoutBuffer.trim();
      this._stdoutBuffer = ""; // consumed -- this text won't also show up prefixed to the next real line later
      this.emit("log", { text: promptText, tone: this._classifyTone(promptText) });
      this._pendingPrompt = {};
      // Not every prompt sharing the "(y/n): " ending is strictly yes/no --
      // e.g. intra-structure homomer reduction accepts "y", "n", a specific
      // chain letter, or (during BATCH) "skip". Rather than trying to regex-
      // detect which exact prompt this is (fragile, and would need updating
      // every time a new prompt shape is added in Python), every prompt is
      // offered BOTH the y/n quick-tap buttons AND a free-text field -- the
      // UI decides how to present that, this just always provides both
      // options through.
      //
      // No separate "context" field here (an earlier version captured a
      // rolling buffer of recent lines and displayed them again inside the
      // prompt box) -- every page that shows this inline prompt already shows
      // its own live console feed directly above it, so duplicating that
      // content inside the box just repeated text the person had already seen
      // scroll by seconds earlier, with no new information.
      // Free text is offered only when the prompt genuinely accepts more than
      // y/n. Astra3 signals that in the prompt itself: either by listing extra
      // options inside the parentheses ("(y/n)/skip:") or by spelling out an
      // alternative above it ("Or type a chain letter (A, B) to use that chain
      // instead"). Offering a text box on a question with exactly two valid
      // answers invites input that can only be rejected.
      // The alternatives are usually stated on an EARLIER line than the
      // question itself -- "Or type a chain letter (A, B) to use that chain
      // instead." sits above "Use only chain B for this analysis? (y/n):".
      // Looking at the question alone therefore missed them and disabled the
      // text box on prompts that genuinely accept a typed answer. The recent
      // output is considered alongside it.
      const recentContext = (this._recentLines || []).slice(-6).map((l) => stripAnsi(l)).join("\n");
      const stripped = stripAnsi(promptText) + "\n" + recentContext;
      const acceptsMore =
        /\(y\/n\)\s*\/\s*\w/i.test(stripped) ||          // (y/n)/skip
        /\(\s*y\s*\/\s*n\s*\/[^)]+\)/i.test(stripped) ||  // (y/n/something)
        /\bor type\b/i.test(stripped) ||                  // "Or type a chain letter..."
        /\btype \w+ to\b/i.test(stripped) ||              // "Type advanced to try a more thorough..."
        /\bchain letter\b/i.test(stripped);
      this.emit("state", {
        prompt: { text: promptText, options: ["y", "n"], allowFreeText: acceptsMore },
      });
    }
  }

  _handleLine(line) {
    // Kept short deliberately: this is context for interpreting the next
    // prompt, not a scrollback buffer.
    this._recentLines.push(line);
    if (this._recentLines.length > 8) this._recentLines.shift();

    this.emit("log", { text: line, tone: this._classifyTone(line) });

    this._lastOutputAt = Date.now(); // see cancel()'s force-kill logic -- evidence the process is still alive and doing something, not silently stuck

    // Match against the ANSI-stripped text, not the raw line -- most of these
    // source prints are color-wrapped (e.g. "Report saved:" is actually
    // printed as {GREEN}Report saved: ...{RESET}, so the raw line starts with
    // an escape code, not the letter "R", and every ^-anchored regex below
    // would silently never match). A few of these particular prints happen to
    // be plain today, but stripping unconditionally means this stays correct
    // even if that changes later, rather than being a fragile, one-off "this
    // specific print isn't colored right now" assumption.
    const clean = stripAnsi(line);

    // "Engine: PyMOL 3.1.6.1", printed by astra3.py as it starts, names the
    // engine and version shown in the top bar.
    const engineMatch = ENGINE_LINE_RE.exec(clean);
    if (engineMatch) this.emit("state", { engine: engineMatch[1], engineVersion: engineMatch[2] || null });
    // astra3.py prints this when an imported file has disappeared; it has
    // already unregistered the IDs.
    if (/^(?:> )?Imported file missing:/.test(clean)) this._dropImports(clean.match(/AST-\d+/g) || []);

    // Astra3 saying so itself, which also covers a cancel that came from
    // somewhere other than cancel() -- a real Ctrl+C in an attached
    // terminal, say.
    if (RUN_CANCELLED_RE.test(clean)) this._cancelledRun = true;

    // Auto-respond: writes a known answer to stdin the instant a specific
    // trigger line appears, with NO user-facing prompt shown at all -- see
    // runImportCommand's own comment for why IMPORT's "Enter file path:"
    // question is answered this way instead of going through the normal
    // global-prompt UI: the GUI already knows the answer (the person picked
    // the file through its own file picker), so asking again would just be a
    // redundant, confusing extra step. Checked before the y/n PROMPT_RE below
    // so this can take priority for the one specific line it's armed for;
    // cleared immediately so it only ever fires once per arm.
    if (this._autoRespond && this._autoRespond.triggerRegex.test(clean)) {
      const response = this._autoRespond.response;
      this._autoRespond = null;
      this.proc.stdin.write(response + "\n");
      return; // this line was consumed as the trigger, not real output to classify/emit further below
    }

    // Captures every "Temporary ID: AST-XXXX Name: <name>" line astra3.py's
    // own IMPORT handler prints (one per registered object -- a .pse can
    // register more than one at once). Reset per command alongside
    // _lastSessionPath below, included in the resolved result so a caller
    // like runImportCommand can report back the REAL id(s) PyMOL actually
    // assigned, rather than a client-side guess.random(), never actually
    // registered with the running PyMOL process at all, which is why using
    // that fabricated ID in any later command was correctly rejected by
    // validate_structure_id's known_ast_ids check.
    const registeredMatch = /^Temporary ID:\s*(AST-\d+)\s+Name:\s*(.+?)\s*$/.exec(clean);
    if (registeredMatch) {
      this._lastRegisteredIds.push({ id: registeredMatch[1], name: registeredMatch[2] });
    }

    // Drains every pending _waitUntilReady-style waiter the instant
    // astra3.py's own real ready-prompt line arrives -- see start()'s own
    // comment for the launch race this exists to fix. Matched with the same
    // "Enter a PDB ID" fragment the completion-detection check below already
    // uses (that one fires on every subsequent return to the prompt, this one
    // only cares about the very FIRST time it's ever seen, at startup).
    if (this._readyResolvers.length > 0 && /Enter a PDB ID(?: \(or -help\))?:\s*$/i.test(clean)) {
      const resolvers = this._readyResolvers;
      this._readyResolvers = [];
      resolvers.forEach((resolve) => resolve());
    }

    for (const [re, value] of PROGRESS_MARKERS) {
      if (re.test(clean)) {
        this.emit("state", { progress: value });
        break;
      }
    }

    // Captures the real session (.pse) path Astra3 itself just wrote,
    // straight from its own "Session saved: <path>" print (see save_session()
    // in astra3_render_report.py). This is the ONLY reliable way to know
    // where a run's output actually landed -- trying to reconstruct the
    // output folder name in the renderer from the structure ID/label
    // (guessing at astra3_security.py's safe_output_dirname() sanitization
    // rules) drifts out of sync for anything beyond a single plain ID:
    // OVERLAY and TERMINI both build their folder names with a different
    // scheme ("Overlay_" / "Termini_" prefixes, IDs joined differently) that
    // a GUI-side guess got wrong. astra3_render_report.py's own
    // save_session() also always writes a sibling .pdb next to the .pse (same
    // folder, same base name) specifically so a real path this is loadable
    // elsewhere -- so this one captured path is enough to derive both.
    const sessionMatch = /^Session saved: (.+\.(?:pse|cxs))\s*$/.exec(clean);
    if (sessionMatch) {
      this._lastSessionPath = sessionMatch[1];
    }

    // Astra3 prints the report's full path, so it is captured rather than
    // derived. Deriving it from the session path means walking up the
    // directory tree, which is both fragile and unnecessary when the exact
    // path is already on the line.
    const reportMatch = /^HTML report saved: (.+\.html)\s*$/.exec(clean);
    if (reportMatch) {
      this._lastReportPath = reportMatch[1];
    }

    // Astra3's own "ready for input again" lines close out a run. Both real
    // prints are color-wrapped ({GREEN}Ready for next command.{RESET} /
    // {WHITE}Ready for next PDB.{RESET}), so this must also match against the
    // stripped text -- this exact ^-anchored check against the raw line was
    // the direct cause of runs that finished successfully on Astra3's own
    // side (visible in its own printed "Ready for next..." line) but stayed
    // stuck showing "processing" in the GUI forever, since _pendingCommand
    // was never resolved.
    //
    // The top-level "Astra3 > Enter a PDB ID:" REPL prompt itself is printed
    // at the start of EVERY loop iteration regardless of which branch handled
    // the previous input, making it a universal "whatever just happened is
    // over" signal that covers every command shape, not just the ones that
    // happen to print "Ready for next...". A command is finished when
    // astra3.py asks for the next one. Its "Ready for next" line comes just
    // before that prompt; ending the command there let the prompt that
    // follows end the NEXT command before its own output arrived.
    if (/Enter a PDB ID(?: \(or -help\))?:\s*$/i.test(clean)) {
      if (this._pendingCommand) {
        this._pendingCommand.resolve({
          ok: true,
          // The caller cannot tell a cancelled run from a finished one by
          // any other means: both end at the same prompt line.
          cancelled: this._cancelledRun === true,
          sessionPath: this._lastSessionPath || null,
          reportPath: this._lastReportPath || null,
          registeredIds: this._lastRegisteredIds.slice(),
          // Sequence number of this prompt line; see _logSeq.
          lastLogSeq: this._logSeq,
        });
        this._pendingCommand = null;
        this._cancelledRun = false;
        this._lastSessionPath = null; // don't leak this run's path into the next command's result if the next run fails before saving its own
        this._lastRegisteredIds = []; // same reasoning -- don't leak this run's registered IDs into the next command's result
      }
    }
  }

  _classifyTone(line) {
    // Tested against ANSI-stripped text -- same reasoning as _handleLine
    // above: "Report saved"/"HTML report saved"/etc. are all printed color-
    // wrapped, so the raw line doesn't start with the literal text these
    // patterns anchor on.
    const clean = stripAnsi(line);
    if (/^\s*Error-fetch|^\s*Selector-Error|error/i.test(clean)) return "error";
    if (/warning/i.test(clean)) return "warning";
    if (/^(Report saved|Session saved|HTML report saved|JSON export saved|Finished processing|Saved view_)/.test(clean)) return "success";
    return "muted";
  }
}

module.exports = { PymolBridge };

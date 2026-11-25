// ============================================================
// Astra3: engine process bridge (main process only)
// ============================================================
// Starts PyMOL, ChimeraX or the Astra3 Engine running astra3.py, writes the
// same command lines a person would type at its prompt, and parses its output:
// progress, y/n prompts, saved paths and the return to the command prompt.
// Astra3 colours nearly everything it prints, so output is matched after
// stripping ANSI codes.
// ============================================================

const os = require("os");
const { spawn } = require("child_process");
const { EventEmitter } = require("events");
const readline = require("readline");
const { describePymolLaunchError, intelEngineNotice, explainStartupFailure } = require("./mac-compat");

// A first launch can be slow (Gatekeeper, or Rosetta translating an Intel
// PyMOL), so this is generous. A launch that takes longer is reported as
// failed rather than sent commands it cannot read yet.
const READY_TIMEOUT_MS = 90000;

// SGR colour codes only, the one escape sequence Astra3 prints.
function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

// Astra3's y/n prompts end in "(y/n):" (format_yn_prompt). They are printed
// without a newline before input() blocks, so they are looked for in the
// unterminated tail of stdout as well as in complete lines.
const PROMPT_RE = /\(y\/n\)(?:\/\w+)*:\s*$/i;
const PYTHON_LINE_RE = /^\s*(?:>\s*)?Python:\s*\S+\s*\(([^)]+)\)\s*$/;
const ENGINE_LINE_RE = /^\s*(?:>\s*)?Engine:\s*(PyMOL|ChimeraX|Astra3 Engine)(?:\s+v?([0-9][^\s]*))?/;

// Printed when a run is cancelled. A cancel taken at a checkpoint returns to
// the prompt exactly like a finished run, so these lines are what tell the
// two apart.
const RUN_CANCELLED_RE = /^(?:Analysis|OVERLAY|TERMINI|BATCH|Import) cancelled\b|^Cancelled\. Ready for/i;

// How long cancel() waits for a graceful stop before killing the process.
// SIGINT cannot interrupt a blocking input(), so a cancel at a prompt needs
// this fallback.
const FORCE_CANCEL_TIMEOUT_MS = 4000;

// Lines that mark how far a run has got. A later stage's line overrides an
// earlier one.
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
    this._stdoutBuffer = ""; // unterminated tail of stdout
    // Recent lines give a prompt its context: alternatives such as "Or type a
    // chain letter (A, B)" are printed above the question.
    this._recentLines = [];
    this._pendingPrompt = null; // { resolve } while awaiting a y/n answer
    this._pendingCommand = null; // { resolve, reject } for the in-flight runCommand()
    this._startPromise = null; // the in-flight launch, while start() waits for the ready prompt
    this._cancelledRun = false;
    this._lastSessionPath = null; // "Session saved:" path of the current command
    this._lastReportPath = null; // "HTML report saved:" path of the current command
    this._lastOutputAt = 0; // time of the last stdout line, for cancel()
    this._readyResolvers = []; // callers waiting for the first "Enter a PDB ID" prompt
    // One-shot automatic answer, used by IMPORT for its "Enter file path:"
    // question: { triggerRegex, response }.
    this._autoRespond = null;
    // AST IDs registered by the current command ("Temporary ID: ..." lines).
    this._lastRegisteredIds = [];
    // Bumped by every start(), and captured by closure in every event handler
    // that start() registers (stdout "data", stderr "line", process "exit").
    this._generation = 0;
    // Files imported this session, newest first: { path, entries: [{ id, name }] }.
    // Imports live only as long as the engine process, so a restarted engine
    // re-imports them under the same IDs (_restoreImports).
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

  // Not ChildProcess.killed, which is also set by the SIGINT of a cancel that
  // Astra3 survives; treating that as stopped would leave it running beside
  // the next engine.
  isRunning() {
    return !!this.proc && this.proc.exitCode === null && this.proc.signalCode === null;
  }

  // A launch or a command is in progress.
  isBusy() {
    return !!this._startPromise || !!this._pendingCommand;
  }

  // Starts the engine running astra3.py, passed as the script argument
  // ("pymol -cq astra3.py"). Without it PyMOL starts a bare prompt and treats
  // every command as PyMOL syntax.
  //
  // One launch at a time: a caller arriving mid-launch waits for the same
  // ready prompt.
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
    this._stdoutBuffer = "";

    // Every engine runs astra3.py as a script reading commands on stdin, so
    // everything after the launch is shared.
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
      const msg = "Neither PyMOL nor ChimeraX was found. Open Settings > Analysis engine and choose where either one is installed.";
      this.emit("log", { text: msg, tone: "error" });
      return { ok: false, error: msg };
    }
    this.emit("state", { engine: engineName });
    const scriptPath = this.getAstraScriptPath();
    if (!scriptPath) {
      // An installation problem, not a setting.
      const msg = "Could not find astra3.py alongside this app. The installation may be incomplete or damaged; try reinstalling.";
      this.emit("log", { text: msg, tone: "error" });
      return { ok: false, error: msg };
    }

    // Refuse to start if the output folder is unusable, rather than let Python
    // write somewhere the interface is not looking.
    let baseDir = null;
    try {
      baseDir = this.getAstraBaseDir ? await this.getAstraBaseDir() : null;
    } catch (e) {
      const msg = (e && e.message) || "Astra3 can't save results in the output folder. Choose another output folder in Settings.";
      this.emit("log", { text: msg, tone: "error" });
      return { ok: false, error: msg };
    }

    // Handlers below ignore events once a newer start() has bumped _generation,
    // so a dying process cannot touch the new one's state.
    this._generation += 1;
    const thisGeneration = this._generation;
    // Set by the asynchronous 'error' event (EACCES, ENOENT), so start() reports
    // the real failure instead of waiting out the ready timeout.
    let launchError = null;
    // Output printed before the ready prompt, for the error shown when a
    // launch fails, and whether the process exited while starting.
    let launchCapture = "";
    let awaitingReady = true;
    let exitedDuringStartup = false;
    let startupExitCode = null;

    try {
      // PYTHONDONTWRITEBYTECODE: writing __pycache__ into an app bundle (Astra3's
      // or the engine's) is blocked by macOS with a notice naming Astra3.
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
      // ChimeraX's no-window mode reads stdin like PyMOL's -c. --exit closes it when
      // the script ends, --nostatus keeps status chatter out of the output, and the
      // path is quoted because --script values are split on spaces.
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
      if (thisGeneration !== this._generation) return; // superseded process
      if (awaitingReady && launchCapture.length < 4000) launchCapture += chunk;
      this._handleStdoutChunk(chunk);
    });

    // Most launch failures (missing executable, permissions, an .app bundle
    // instead of its binary) arrive as an asynchronous 'error' event, which
    // would crash the main process if unhandled.
    this.proc.on("error", (err) => {
      if (thisGeneration !== this._generation) return;
      const msg = (engine === "pymol" && describePymolLaunchError(err, pymolPath, process.platform, process.arch, os.release())) || `Failed to launch ${engineName} at "${pymolPath}": ${err.message}`;
      launchError = msg;
      this.emit("log", { text: msg, tone: "error" });
      this.emit("state", { running: false, exitCode: null, launchError: msg });
      this.proc = null;
      if (this._pendingCommand) {
        this._pendingCommand.reject(new Error(msg));
        this._pendingCommand = null;
      }
      // Settle the ready wait now rather than at its timeout.
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
        // A superseded process exiting late; the new one's state is not ours.
        return;
      }
      if (jobs) jobs.stop();
      this.emit("state", { running: false, exitCode: code });
      this.proc = null;
      if (awaitingReady) {
        exitedDuringStartup = true;
        startupExitCode = code;
      }
      // Settle an in-flight command or prompt, or the interface would stay busy
      // forever after a crash.
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
        // Closes the renderer's prompt dialog; the rejection above has already
        // ended the command.
        this._pendingPrompt = null;
        this.emit("state", { prompt: null, promptClosedReason: "process-exited" });
      }
      this._stdoutBuffer = "";
      this._recentLines = [];
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

    // The process exists well before astra3.py reaches input(). Commands are
    // held until its "Enter a PDB ID:" prompt appears; the timeout is only a
    // safety net.
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

  // Re-imports this session's files under their existing IDs before the launch
  // resolves, so the command that triggered it can use them. Unreadable files
  // are dropped.
  async _restoreImports(engineName) {
    if (this.imports.length === 0) return;
    const count = this.imports.length;
    this.emit("log", { text: `Importing ${count} file${count === 1 ? "" : "s"} again in ${engineName}, under the same IDs.`, tone: "muted" });
    const restored = [];
    let changed = false;
    // Oldest first, in import order.
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
    // Invalidate first: kill() is not instant, and events from the dying process
    // must not touch a successor's state.
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
    // Close any open prompt dialog for the run that was torn down.
    if (this._pendingPrompt) {
      this._pendingPrompt = null;
      this.emit("state", { prompt: null, promptClosedReason: "process-stopped" });
    }
  }

  // Cancels the running command, like Ctrl+C in a terminal: astra3_core's
  // SIGINT handler stops at the next check_for_cancellation(). On Windows
  // kill() terminates the process instead.
  //
  // SIGINT cannot unblock input(), so if the command is still pending and has
  // printed nothing for FORCE_CANCEL_TIMEOUT_MS the process is stopped. Silence
  // is the test, not elapsed time, because cleaning up a multi-structure run
  // can take several seconds while it keeps printing.
  cancel() {
    if (!this.isRunning()) return { ok: false, error: `${this._engineName()} is not running.` };
    if (!this._pendingCommand) return { ok: false, error: "No command is currently running." };

    // Recorded first, so the result reports a cancel however Astra3 ends the run.
    this._cancelledRun = true;

    const pendingAtCancelTime = this._pendingCommand;
    if (this.engine === "astra3") {
      // The Astra3 Engine reads a line holding only Ctrl+C as a cancel, on
      // every platform, so it is not restarted on Windows.
      this.proc.stdin.write("\x03\n");
      this.emit("log", { text: "Sent cancel to the Astra3 Engine.", tone: "muted" });
    } else if (process.platform === "win32") {
      this.stop(); // no SIGINT on Windows
      return { ok: true };
    } else {
      this.proc.kill("SIGINT");
      this.emit("log", { text: `Sent cancel signal to ${this._engineName()}.`, tone: "muted" });
    }

    const checkForStillStuck = () => {
      // Finished, or another command has started: nothing to force.
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
      // Still printing, so still working; check again later.
      setTimeout(checkForStillStuck, FORCE_CANCEL_TIMEOUT_MS - silentFor);
    };
    setTimeout(checkForStillStuck, FORCE_CANCEL_TIMEOUT_MS);

    return { ok: true };
  }

  // Writes one command line and resolves when Astra3 returns to its prompt.
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
      this._cancelledRun = false;
      this._lastSessionPath = null;
      this._lastReportPath = null;
      this._lastRegisteredIds = [];
      this._autoRespond = autoRespond === null ? null : { triggerRegex: /Enter file path:\s*$/i, response: autoRespond };
      this.emit("log", { text: commandString, tone: "command" });
      this.proc.stdin.write(commandString + "\n");
    });
  }

  // IMPORT asks "Enter file path:" separately, so the path the person picked
  // is answered automatically. Resolves like runCommand, plus registeredIds:
  // the AST IDs Astra3 assigned. Successful imports are recorded in
  // this.imports for later engines.
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

  // Writes the person's answer to a pending prompt.
  answerPrompt(answer) {
    if (!this._pendingPrompt) return { ok: false, error: "No prompt is pending." };
    this.proc.stdin.write(answer + "\n");
    this._pendingPrompt = null;
    return { ok: true };
  }

  // Complete lines go to _handleLine; the unterminated tail is checked for a
  // prompt, which Astra3 prints without a newline.
  _handleStdoutChunk(chunk) {
    this._stdoutBuffer += chunk;

    const lines = this._stdoutBuffer.split("\n");
    // The last element is the unterminated tail; keep it buffered.
    this._stdoutBuffer = lines.pop();

    for (const line of lines) {
      this._handleLine(line);
    }

    // format_yn_prompt colours each character of "(y/n)", so only the stripped
    // text can match.
    if (PROMPT_RE.test(stripAnsi(this._stdoutBuffer))) {
      const promptText = this._stdoutBuffer.trim();
      this._stdoutBuffer = ""; // consumed by the prompt
      this.emit("log", { text: promptText, tone: this._classifyTone(promptText) });
      this._pendingPrompt = {};
      // Free text is offered only when the prompt accepts more than y/n, either
      // inside the parentheses ("(y/n)/skip:") or on a line above ("Or type a
      // chain letter (A, B) ..."), so recent output is checked too.
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
    // Context for the next prompt, not scrollback.
    this._recentLines.push(line);
    if (this._recentLines.length > 8) this._recentLines.shift();

    this.emit("log", { text: line, tone: this._classifyTone(line) });

    this._lastOutputAt = Date.now();

    // Most of these prints are colour-wrapped, so anchored patterns need the
    // stripped text.
    const clean = stripAnsi(line);

    // "Engine: PyMOL 3.1.6.1", printed by astra3.py as it starts, names the
    // engine and version shown in the top bar.
    const engineMatch = ENGINE_LINE_RE.exec(clean);
    if (engineMatch) this.emit("state", { engine: engineMatch[1], engineVersion: engineMatch[2] || null });
    // "Python: 3.10.12 (x86_64)", printed once as astra3.py starts, gives the
    // architecture of the engine's own interpreter.
    const pythonMatch = PYTHON_LINE_RE.exec(clean);
    if (pythonMatch) {
      const notice = intelEngineNotice(this._engineName(), pythonMatch[1], process.platform, process.arch);
      if (notice) this.emit("log", { text: notice, tone: "warning" });
    }
    // astra3.py prints this when an imported file has disappeared; it has
    // already unregistered the IDs.
    if (/^(?:> )?Imported file missing:/.test(clean)) this._dropImports(clean.match(/AST-\d+/g) || []);

    // Also covers a cancel that did not come from cancel(), such as Ctrl+C in a
    // terminal.
    if (RUN_CANCELLED_RE.test(clean)) this._cancelledRun = true;

    // Checked before PROMPT_RE so an armed auto-answer wins; fires once.
    if (this._autoRespond && this._autoRespond.triggerRegex.test(clean)) {
      const response = this._autoRespond.response;
      this._autoRespond = null;
      this.proc.stdin.write(response + "\n");
      return;
    }

    // One line per registered object; a .pse can register several.
    const registeredMatch = /^Temporary ID:\s*(AST-\d+)\s+Name:\s*(.+?)\s*$/.exec(clean);
    if (registeredMatch) {
      this._lastRegisteredIds.push({ id: registeredMatch[1], name: registeredMatch[2] });
    }

    // The first "Enter a PDB ID" prompt releases callers waiting for the launch.
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

    // The paths Astra3 prints are the only reliable record of where a run wrote:
    // OVERLAY and TERMINI folder names cannot be rebuilt from the IDs. A .pdb is
    // always saved beside the .pse.
    const sessionMatch = /^Session saved: (.+\.(?:pse|cxs))\s*$/.exec(clean);
    if (sessionMatch) {
      this._lastSessionPath = sessionMatch[1];
    }

    // The report path is printed in full, so it is captured as is.
    const reportMatch = /^HTML report saved: (.+\.html)\s*$/.exec(clean);
    if (reportMatch) {
      this._lastReportPath = reportMatch[1];
    }

    // A command is finished when astra3.py asks for the next one. Its "Ready for
    // next" line comes just before that prompt; ending the command there would
    // let the prompt that follows end the next command before its output arrived.
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
        this._lastSessionPath = null;
        this._lastRegisteredIds = [];
      }
    }
  }

  _classifyTone(line) {
    // Matched on stripped text; these lines are colour-wrapped.
    const clean = stripAnsi(line);
    if (/^\s*Error-fetch|^\s*Selector-Error|error/i.test(clean)) return "error";
    if (/warning/i.test(clean)) return "warning";
    if (/^(Report saved|Session saved|HTML report saved|JSON export saved|Finished processing|Saved view_)/.test(clean)) return "success";
    return "muted";
  }
}

module.exports = { PymolBridge };

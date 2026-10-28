// ============================================================
// Astra3: preload script
// ============================================================
// Runs in an isolated context with access to Node/Electron APIs, but the
// renderer (React GUI) can ONLY reach what's explicitly exposed here via
// contextBridge. This is the enforcement point for "renderer has no
// unrestricted Node.js access" -- nothing here lets the renderer run
// arbitrary shell commands or read arbitrary files outside these specific,
// narrow calls.
// ============================================================

const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("astra3Native", {
  // -- dialogs / filesystem --
  openFileDialog: (options) => ipcRenderer.invoke("dialog:openFile", options),
  // Dedicated PyMOL-executable picker (Settings' own Browse button) --
  // resolves a selected macOS .app bundle down to its real internal
  // executable automatically.
  openPymolExecutableDialog: () => ipcRenderer.invoke("dialog:openPymolExecutable"),
  openFolderDialog: () => ipcRenderer.invoke("dialog:openFolder"),
  readFile: (path) => ipcRenderer.invoke("fs:readFile", path),
  // Clipboard writes, through the main process. Each resolves to true once
  // the clipboard holds the text or PNG data URI.
  copyText: (text) => ipcRenderer.invoke("clipboard:writeText", text),
  copyImage: (dataUri) => ipcRenderer.invoke("clipboard:writeImage", dataUri),
  getDocPath: (filename) => ipcRenderer.invoke("app:getDocPath", filename),
  listDir: (path) => ipcRenderer.invoke("fs:listDir", path),
  listSubdirs: (path) => ipcRenderer.invoke("fs:listSubdirs", path),
  readFileAsDataUri: (path) => ipcRenderer.invoke("fs:readFileAsDataUri", path),
  // Downscaled copy of an image, for galleries. Full-resolution renders are
  // far too large to hold in the interface at any meaningful count.
  readImageThumbnail: (path, maxWidth) => ipcRenderer.invoke("fs:readImageThumbnail", path, maxWidth),
  openPath: (path) => ipcRenderer.invoke("fs:openPath", path),
  // Opens a .pse by launching the configured PyMOL directly, rather than
  // relying on a LaunchServices association that may not be registered.
  openInPymol: (path) => ipcRenderer.invoke("fs:openInPymol", path),
  // Storage figures for the History page: total plus a per-run breakdown.
  outputUsage: (dir) => ipcRenderer.invoke("fs:outputUsage", dir),
  // Deletes Astra3's run folders. Guarded in the main process.
  clearOutputs: (dir) => ipcRenderer.invoke("fs:clearOutputs", dir),
  // Deletes only the named run folders inside dir. Guarded on the main-process
  // side the same way clearOutputs is -- see fs:deleteRunFolders.
  deleteRunFolders: (outputDir, folderNames, newerThan) => ipcRenderer.invoke("fs:deleteRunFolders", { outputDir, folderNames, newerThan }),
  // Opens several images as one browsable set -- see fs:openImageSet.
  openImageSet: (paths) => ipcRenderer.invoke("fs:openImageSet", paths),
  isFullScreen: () => ipcRenderer.invoke("window:isFullScreen"),
  // Returns an unsubscribe function so a React effect can clean up after
  // itself; without one every remount would stack another listener.
  onFullScreenChange: (cb) => {
    const handler = (_e, value) => cb(value);
    ipcRenderer.on("window:fullscreen-changed", handler);
    return () => ipcRenderer.removeListener("window:fullscreen-changed", handler);
  },
  showInFolder: (path) => ipcRenderer.invoke("fs:showInFolder", path),
  saveScreenshot: (dataUri, suggestedName) => ipcRenderer.invoke("fs:saveScreenshot", { dataUri, suggestedName }),

  // -- app / environment --
  getPaths: () => ipcRenderer.invoke("app:getPaths"),
  getPymolPath: () => ipcRenderer.invoke("app:getPymolPath"),
  // A real PyMOL location found on this machine, or null.
  autodetectPymolPath: () => ipcRenderer.invoke("app:autodetectPymolPath"),
  // Real existence/executability check, not just "a path string was saved" --
  // see main.js's own verifyPymolPath comment. Pass an explicit path to check
  // a candidate before it's saved (e.g. a freshly-typed value in Settings);
  // omit it to check the currently-saved path.
  verifyPymolPath: (explicitPath) => ipcRenderer.invoke("app:verifyPymolPath", explicitPath),
  // Real "is this actually PyMOL" check -- launches the candidate briefly and
  // watches for its own identifying startup text. Slower than verifyPymolPath
  // (a few seconds, not instant), so callers use it deliberately (e.g. right
  // before committing a path change), not on every keystroke. See main.js's
  // own verifyIsRealPymol comment.
  verifyIsRealPymol: (candidatePath) => ipcRenderer.invoke("app:verifyIsRealPymol", candidatePath),
  // Specific cause of the last failed verifyIsRealPymol, or null.
  pymolVerifyProblem: () => ipcRenderer.invoke("app:pymolVerifyProblem"),
  setPymolPath: (newPath) => ipcRenderer.invoke("app:setPymolPath", newPath),
  // Analysis engine: "pymol" (default) or "chimerax", and ChimeraX's location.
  getEngine: () => ipcRenderer.invoke("app:getEngine"),
  getEngineWindow: () => ipcRenderer.invoke("app:getEngineWindow"),
  setEngineWindow: (shown) => ipcRenderer.invoke("app:setEngineWindow", shown),
  setTheme: (theme) => ipcRenderer.send("app:setTheme", theme),
  setEngine: (engine) => ipcRenderer.invoke("app:setEngine", engine),
  engineStatus: () => ipcRenderer.invoke("app:engineStatus"),
  // Color Palette page: the saved palette, or null for the default colours.
  getPalette: () => ipcRenderer.invoke("palette:get"),
  setPalette: (palette) => ipcRenderer.invoke("palette:set", palette),
  getChimeraxPath: () => ipcRenderer.invoke("app:getChimeraxPath"),
  setChimeraxPath: (newPath) => ipcRenderer.invoke("app:setChimeraxPath", newPath),
  chimeraxVersion: (explicitPath) => ipcRenderer.invoke("app:chimeraxVersion", explicitPath),
  openChimeraxExecutableDialog: () => ipcRenderer.invoke("dialog:openChimeraxExecutable"),
  // Explicit, user-confirmed restart after a PyMOL path change -- see
  // main.js's own app:restartApp comment.
  restartApp: () => ipcRenderer.invoke("app:restartApp"),
  // astra3.py's location is resolved automatically by the main process; this
  // is read-only, used only to confirm setup succeeded.
  getAstraScriptPath: () => ipcRenderer.invoke("app:getAstraScriptPath"),
  // Where Astra3 writes output (Protein_outputs/ and everything under it).
  // setOutputDir's result includes requiresRestart: true if PyMOL was already
  // running, since it only reads this at its own startup.
  getOutputDir: () => ipcRenderer.invoke("app:getOutputDir"),
  setOutputDir: (newPath) => ipcRenderer.invoke("app:setOutputDir", newPath),

  // -- PyMOL bridge --
  pymolStart: () => ipcRenderer.invoke("pymol:start"),
  findRelatedStructures: (query) => ipcRenderer.invoke("related:find", query),
  // Coordinates for the 3D Viewer from a PDB ID or a temporary ID, without
  // an analysis: { ok, text, ... } or { ok: false, error }.
  quickView: (request) => ipcRenderer.invoke("viewer:quickView", request),
  pymolStop: () => ipcRenderer.invoke("pymol:stop"),
  pymolIsRunning: () => ipcRenderer.invoke("pymol:isRunning"),
  pymolRunCommand: (commandString) => ipcRenderer.invoke("pymol:runCommand", commandString),
  pymolRunImportCommand: (filePath) => ipcRenderer.invoke("pymol:runImportCommand", filePath),
  pymolImports: () => ipcRenderer.invoke("pymol:imports"),
  // Resolves a browser File object (from a drop event or <input type="file">)
  // to its real absolute filesystem path. Must be called from the preload
  // script per Electron's own webUtils docs (the renderer has no direct
  // access to this API even with the File object itself passed across the
  // context bridge). webUtils.getPathForFile is the current, non-deprecated
  // way to do this; the legacy File.path property this superseded was removed
  // starting in Electron 32 (see Electron's own breaking-changes doc), so
  // this falls back to file.path only if webUtils genuinely isn't present in
  // whatever Electron build is actually running, rather than assuming one or
  // the other exists.
  getPathForFile: (file) => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === "function") {
        return webUtils.getPathForFile(file);
      }
    } catch (e) {
      // fall through to the legacy property below
    }
    return file.path || null;
  },
  pymolCancel: () => ipcRenderer.invoke("pymol:cancel"),
  pymolAnswerPrompt: (answer) => ipcRenderer.invoke("pymol:answerPrompt", answer),
  getZoomFactor: () => ipcRenderer.invoke("app:getZoomFactor"),
  setZoomFactor: (factor) => ipcRenderer.invoke("app:setZoomFactor", factor),
  zoomIn: () => ipcRenderer.invoke("app:zoomIn"),
  zoomOut: () => ipcRenderer.invoke("app:zoomOut"),
  zoomReset: () => ipcRenderer.invoke("app:zoomReset"),

  // -- PyMOL bridge events (log lines, state changes/prompts) --
  onPymolLog: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("pymol:log", handler);
    return () => ipcRenderer.removeListener("pymol:log", handler);
  },
  onPymolState: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("pymol:state", handler);
    return () => ipcRenderer.removeListener("pymol:state", handler);
  },
});

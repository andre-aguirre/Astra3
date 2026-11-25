// ============================================================
// Astra3: preload script
// ============================================================
// The renderer's only access to the main process: each function below maps
// to one narrow IPC handler in main.js.
// ============================================================

const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("astra3Native", {
  // Dialogs and files
  openFileDialog: (options) => ipcRenderer.invoke("dialog:openFile", options),
  // Resolves a picked .app bundle to its executable.
  openPymolExecutableDialog: () => ipcRenderer.invoke("dialog:openPymolExecutable"),
  openFolderDialog: () => ipcRenderer.invoke("dialog:openFolder"),
  readFile: (path) => ipcRenderer.invoke("fs:readFile", path),
  // Resolve to true once the clipboard holds the text or PNG data URI.
  copyText: (text) => ipcRenderer.invoke("clipboard:writeText", text),
  copyImage: (dataUri) => ipcRenderer.invoke("clipboard:writeImage", dataUri),
  getDocPath: (filename) => ipcRenderer.invoke("app:getDocPath", filename),
  listDir: (path) => ipcRenderer.invoke("fs:listDir", path),
  listSubdirs: (path) => ipcRenderer.invoke("fs:listSubdirs", path),
  listRunFolders: (path) => ipcRenderer.invoke("fs:listRunFolders", path),
  readFileAsDataUri: (path) => ipcRenderer.invoke("fs:readFileAsDataUri", path),
  // Downscaled image for galleries; full renders are too large to hold.
  readImageThumbnail: (path, maxWidth) => ipcRenderer.invoke("fs:readImageThumbnail", path, maxWidth),
  openPath: (path) => ipcRenderer.invoke("fs:openPath", path),
  // Opens a session file in PyMOL or ChimeraX (see openSessionFile).
  openInPymol: (path) => ipcRenderer.invoke("fs:openInPymol", path),
  // Size of the output folder in use, total and per run.
  outputUsage: () => ipcRenderer.invoke("fs:outputUsage"),
  // Sizes of run folders by full path (null when missing or not a run folder).
  runSizes: (folders) => ipcRenderer.invoke("fs:runSizes", folders),
  // Deletes run folders by full path; resolves to a result per folder.
  deleteRuns: (folders) => ipcRenderer.invoke("fs:deleteRuns", { folders }),
  // As deleteRuns, plus every run folder in the output folder.
  clearOutputs: (folders) => ipcRenderer.invoke("fs:clearOutputs", { folders }),
  // Cleanup after a cancelled run; see fs:deleteRunFolders.
  deleteRunFolders: (outputDir, folderNames, newerThan) => ipcRenderer.invoke("fs:deleteRunFolders", { outputDir, folderNames, newerThan }),
  openImageSet: (paths) => ipcRenderer.invoke("fs:openImageSet", paths),
  isFullScreen: () => ipcRenderer.invoke("window:isFullScreen"),
  // Returns an unsubscribe function for effect cleanup.
  onFullScreenChange: (cb) => {
    const handler = (_e, value) => cb(value);
    ipcRenderer.on("window:fullscreen-changed", handler);
    return () => ipcRenderer.removeListener("window:fullscreen-changed", handler);
  },
  showInFolder: (path) => ipcRenderer.invoke("fs:showInFolder", path),
  saveScreenshot: (dataUri, suggestedName) => ipcRenderer.invoke("fs:saveScreenshot", { dataUri, suggestedName }),

  // App and environment
  getPaths: () => ipcRenderer.invoke("app:getPaths"),
  getPymolPath: () => ipcRenderer.invoke("app:getPymolPath"),
  // A detected PyMOL location, or null.
  autodetectPymolPath: () => ipcRenderer.invoke("app:autodetectPymolPath"),
  // Checks explicitPath, or the saved path when omitted.
  verifyPymolPath: (explicitPath) => ipcRenderer.invoke("app:verifyPymolPath", explicitPath),
  // Launches the candidate to confirm it is PyMOL; takes a few seconds.
  verifyIsRealPymol: (candidatePath) => ipcRenderer.invoke("app:verifyIsRealPymol", candidatePath),
  // Specific cause of the last failed verifyIsRealPymol, or null.
  pymolVerifyProblem: () => ipcRenderer.invoke("app:pymolVerifyProblem"),
  setPymolPath: (newPath) => ipcRenderer.invoke("app:setPymolPath", newPath),
  // Analysis engine: "pymol" (default), "chimerax" or "astra3".
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
  restartApp: () => ipcRenderer.invoke("app:restartApp"),
  getAstraScriptPath: () => ipcRenderer.invoke("app:getAstraScriptPath"),
  // The output folder is decided by the main process. getOutputLocation
  // resolves to { dir, defaultDir, notice }; setOutputDir to { ok, dir } or
  // { ok: false, error }.
  getOutputLocation: (remembered) => ipcRenderer.invoke("app:getOutputLocation", remembered),
  getOutputDir: () => ipcRenderer.invoke("app:getOutputDir"),
  setOutputDir: (newPath) => ipcRenderer.invoke("app:setOutputDir", newPath),

  // Engine
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
  // The filesystem path of a dropped or picked File. webUtils is only usable
  // from preload; File.path was removed in Electron 32.
  getPathForFile: (file) => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === "function") {
        return webUtils.getPathForFile(file);
      }
    } catch (e) {
      // Fall back to File.path.
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

  // Engine events: log lines, state changes and prompts
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

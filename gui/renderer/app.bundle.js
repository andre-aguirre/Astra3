(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // renderer/run-paths.js
  var require_run_paths = __commonJS({
    "renderer/run-paths.js"(exports, module) {
      "use strict";
      function runFolderOfPath(p) {
        if (typeof p !== "string") return null;
        const match = /^(?:.*[/\\])?[^/\\]*_Output(?: \(\d+\))?(?=[/\\]|$)/i.exec(p);
        return match ? match[0] : null;
      }
      function runFolderForEntry2(entry) {
        if (!entry) return null;
        return runFolderOfPath(entry.reportPath) || runFolderOfPath(entry.sessionPath) || null;
      }
      function folderName(p) {
        const parts = String(p || "").split(/[/\\]/).filter(Boolean);
        return parts[parts.length - 1] || String(p || "");
      }
      function planDeletion2(selected, history) {
        const byId = new Map((history || []).map((h) => [h.id, h]));
        const owners = /* @__PURE__ */ new Map();
        const groups = [];
        const unknown = /* @__PURE__ */ new Map();
        const add = (entry) => {
          const folder = runFolderForEntry2(entry);
          if (!folder) {
            unknown.set(entry.id, entry);
            return;
          }
          if (!owners.has(folder)) owners.set(folder, /* @__PURE__ */ new Set());
          owners.get(folder).add(entry.id);
        };
        for (const entry of selected || []) {
          if (entry.kind === "batch") {
            const children = (Array.isArray(entry.batchEntryIds) ? entry.batchEntryIds : []).map((id) => byId.get(id)).filter(Boolean);
            if (children.length === 0) {
              unknown.set(entry.id, entry);
              continue;
            }
            groups.push({ id: entry.id, children: children.map((c) => c.id) });
            children.forEach(add);
          } else {
            add(entry);
          }
        }
        return { folders: [...owners.keys()], owners, groups, unknown: [...unknown.values()] };
      }
      function settleDeletion2(plan, results) {
        const byRequest = new Map((results || []).map((r) => [r.requested, r]));
        const removed = /* @__PURE__ */ new Set();
        const problems = [];
        for (const [folder, ids] of plan.owners) {
          const result = byRequest.get(folder);
          if (result && result.status === "deleted") {
            ids.forEach((id) => removed.add(id));
          } else {
            problems.push({ folder, ids: [...ids], message: result && result.message || "It was not deleted." });
          }
        }
        for (const group of plan.groups) {
          if (group.children.every((id) => removed.has(id))) removed.add(group.id);
        }
        for (const entry of plan.unknown) {
          problems.push({ folder: null, ids: [entry.id], message: "Astra3 has no record of where this run's files were saved." });
        }
        return { removedIds: [...removed], problems };
      }
      function describeProblems2(problems, history, limit = 3) {
        const labels = new Map((history || []).map((h) => [h.id, h.label]));
        const lines = problems.slice(0, limit).map((p) => {
          const name = p.ids.map((id) => labels.get(id)).filter(Boolean)[0] || (p.folder ? folderName(p.folder) : "A run");
          return `${name}: ${p.message}`;
        });
        if (problems.length > limit) lines.push(`...and ${problems.length - limit} more.`);
        return lines.join("\n");
      }
      module.exports = { runFolderOfPath, runFolderForEntry: runFolderForEntry2, folderName, planDeletion: planDeletion2, settleDeletion: settleDeletion2, describeProblems: describeProblems2 };
    }
  });

  // renderer/app.jsx
  var import_run_paths = __toESM(require_run_paths());
  var { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } = React;
  var Icon = ({ name, size = 16, ...props }) => {
    const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round", ...props };
    const paths = {
      home: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M3 11.5 12 4l9 7.5" }), /* @__PURE__ */ React.createElement("path", { d: "M5.5 10v9a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1v-9" })),
      analysis: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "11", cy: "11", r: "7" }), /* @__PURE__ */ React.createElement("path", { d: "M20 20l-4.5-4.5" }), /* @__PURE__ */ React.createElement("path", { d: "M8 11h6M11 8v6" })),
      reports: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" }), /* @__PURE__ */ React.createElement("path", { d: "M15 3v5h5" }), /* @__PURE__ */ React.createElement("path", { d: "M8.5 13h7M8.5 16.5h7M8.5 9.5h3" })),
      citation: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M7 8c-1.5 0-2.5 1.2-2.5 3s1 3.5 2.5 3.5c.5 0 .8-.2.8-.2L7 17" }), /* @__PURE__ */ React.createElement("path", { d: "M14 8c-1.5 0-2.5 1.2-2.5 3s1 3.5 2.5 3.5c.5 0 .8-.2.8-.2L14 17" }), /* @__PURE__ */ React.createElement("rect", { x: "3", y: "4", width: "18", height: "16", rx: "2" })),
      viewer: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M12 3 3 7.5 12 12l9-4.5L12 3Z" }), /* @__PURE__ */ React.createElement("path", { d: "M3 16.5 12 21l9-4.5" }), /* @__PURE__ */ React.createElement("path", { d: "M3 12l9 4.5 9-4.5" })),
      batch: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("rect", { x: "3.5", y: "4", width: "17", height: "4.2", rx: "1" }), /* @__PURE__ */ React.createElement("rect", { x: "3.5", y: "10", width: "17", height: "4.2", rx: "1" }), /* @__PURE__ */ React.createElement("rect", { x: "3.5", y: "16", width: "17", height: "4.2", rx: "1" }), /* @__PURE__ */ React.createElement("path", { d: "M17 6.1h1.5M17 12.1h1.5M17 18.1h1.5" })),
      settings: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "3" }), /* @__PURE__ */ React.createElement("path", { d: "M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" })),
      console: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("rect", { x: "3", y: "4", width: "18", height: "16", rx: "2" }), /* @__PURE__ */ React.createElement("path", { d: "M7 9l3 3-3 3M13 15h4" })),
      overlay: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("rect", { x: "4", y: "4", width: "12", height: "12", rx: "1.5" }), /* @__PURE__ */ React.createElement("rect", { x: "9", y: "9", width: "12", height: "12", rx: "1.5", fill: "var(--bg-1)" })),
      termini: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M4 12h4" }), /* @__PURE__ */ React.createElement("circle", { cx: "4", cy: "12", r: "1.5", fill: "currentColor" }), /* @__PURE__ */ React.createElement("path", { d: "M10 12c2-6 6-6 8 0" }), /* @__PURE__ */ React.createElement("circle", { cx: "20", cy: "12", r: "1.5", fill: "currentColor" })),
      import: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M12 3v12" }), /* @__PURE__ */ React.createElement("path", { d: "M7 10l5 5 5-5" }), /* @__PURE__ */ React.createElement("path", { d: "M4 20h16" })),
      history: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M3 12a9 9 0 1 0 3-6.7" }), /* @__PURE__ */ React.createElement("path", { d: "M3 4v5h5" }), /* @__PURE__ */ React.createElement("path", { d: "M12 8v4l3 2" })),
      plus: /* @__PURE__ */ React.createElement("path", { d: "M12 5v14M5 12h14" }),
      minus: /* @__PURE__ */ React.createElement("path", { d: "M5 12h14" }),
      x: /* @__PURE__ */ React.createElement("path", { d: "M6 6l12 12M18 6 6 18" }),
      check: /* @__PURE__ */ React.createElement("path", { d: "M5 12l4.5 4.5L19 7" }),
      wifi: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M2 8.5a16 16 0 0 1 20 0" }), /* @__PURE__ */ React.createElement("path", { d: "M5.5 12a11 11 0 0 1 13 0" }), /* @__PURE__ */ React.createElement("path", { d: "M9 15.5a6 6 0 0 1 6 0" }), /* @__PURE__ */ React.createElement("path", { d: "M12 19h.01" })),
      chevronRight: /* @__PURE__ */ React.createElement("path", { d: "M9 6l6 6-6 6" }),
      chevronDown: /* @__PURE__ */ React.createElement("path", { d: "M6 9l6 6 6-6" }),
      chevronUp: /* @__PURE__ */ React.createElement("path", { d: "M6 15l6-6 6 6" }),
      search: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "11", cy: "11", r: "7" }), /* @__PURE__ */ React.createElement("path", { d: "M21 21l-4.3-4.3" })),
      folder: /* @__PURE__ */ React.createElement("path", { d: "M3.5 6.5A1.5 1.5 0 0 1 5 5h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5v-11Z" }),
      file: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" }), /* @__PURE__ */ React.createElement("path", { d: "M15 3v5h5" })),
      play: /* @__PURE__ */ React.createElement("path", { d: "M7 4.5v15l13-7.5-13-7.5Z" }),
      upload: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M12 16V4" }), /* @__PURE__ */ React.createElement("path", { d: "M7 9l5-5 5 5" }), /* @__PURE__ */ React.createElement("path", { d: "M4 16v3.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V16" })),
      star: /* @__PURE__ */ React.createElement("path", { d: "M12 3.5l2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8L12 3.5Z" }),
      starFilled: /* @__PURE__ */ React.createElement("path", { d: "M12 3.5l2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8L12 3.5Z", fill: "currentColor" }),
      externalLink: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M14 4h6v6" }), /* @__PURE__ */ React.createElement("path", { d: "M10 14 20 4" }), /* @__PURE__ */ React.createElement("path", { d: "M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" })),
      trash: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M4 7h16" }), /* @__PURE__ */ React.createElement("path", { d: "M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" }), /* @__PURE__ */ React.createElement("path", { d: "M9.5 11v6M14.5 11v6" }), /* @__PURE__ */ React.createElement("path", { d: "M9 4h6l1 3H8l1-3Z" })),
      grip: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "9", cy: "6", r: "1.2", fill: "currentColor", stroke: "none" }), /* @__PURE__ */ React.createElement("circle", { cx: "9", cy: "12", r: "1.2", fill: "currentColor", stroke: "none" }), /* @__PURE__ */ React.createElement("circle", { cx: "9", cy: "18", r: "1.2", fill: "currentColor", stroke: "none" }), /* @__PURE__ */ React.createElement("circle", { cx: "15", cy: "6", r: "1.2", fill: "currentColor", stroke: "none" }), /* @__PURE__ */ React.createElement("circle", { cx: "15", cy: "12", r: "1.2", fill: "currentColor", stroke: "none" }), /* @__PURE__ */ React.createElement("circle", { cx: "15", cy: "18", r: "1.2", fill: "currentColor", stroke: "none" })),
      bell: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" }), /* @__PURE__ */ React.createElement("path", { d: "M10 21a2 2 0 0 0 4 0" })),
      clock: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "8.5" }), /* @__PURE__ */ React.createElement("path", { d: "M12 7.5V12l3 2" })),
      alertTriangle: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M10.6 3.9 2.4 18.5A1.5 1.5 0 0 0 3.7 21h16.6a1.5 1.5 0 0 0 1.3-2.5L13.4 3.9a1.5 1.5 0 0 0-2.8 0Z" }), /* @__PURE__ */ React.createElement("path", { d: "M12 9.5v4.2" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "16.7", r: "0.9", fill: "currentColor", stroke: "none" })),
      info: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "8.5" }), /* @__PURE__ */ React.createElement("path", { d: "M12 11v5.5" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "8", r: "0.9", fill: "currentColor", stroke: "none" })),
      copy: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("rect", { x: "9", y: "9", width: "11", height: "11", rx: "1.5" }), /* @__PURE__ */ React.createElement("path", { d: "M5.5 15H5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 5 3h9A1.5 1.5 0 0 1 15.5 4.5V5" })),
      dot: /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "4", fill: "currentColor", stroke: "none" }),
      image: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("rect", { x: "3.5", y: "4.5", width: "17", height: "15", rx: "1.5" }), /* @__PURE__ */ React.createElement("circle", { cx: "9", cy: "10", r: "1.7" }), /* @__PURE__ */ React.createElement("path", { d: "M4 17l5-5 3.5 3.5L17 11l3 3" })),
      pin: /* @__PURE__ */ React.createElement("path", { d: "M12 21s7-7.4 7-12.5A7 7 0 0 0 5 8.5C5 13.6 12 21 12 21Zm0-9.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" }),
      keyboard: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("rect", { x: "3", y: "6", width: "18", height: "12", rx: "2" }), /* @__PURE__ */ React.createElement("path", { d: "M6.5 10h.01M9.5 10h.01M12.5 10h.01M15.5 10h.01M6.5 14h11" })),
      palette: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M12 3a9 9 0 1 0 0 18c1 0 1.6-.5 1.6-1.4 0-.4-.2-.8-.2-1.2 0-.9.7-1.4 1.6-1.4H17a4 4 0 0 0 4-4c0-5.5-4.5-10-9-10Z" }), /* @__PURE__ */ React.createElement("circle", { cx: "7.5", cy: "11", r: "1.1", fill: "currentColor", stroke: "none" }), /* @__PURE__ */ React.createElement("circle", { cx: "10.5", cy: "7", r: "1.1", fill: "currentColor", stroke: "none" }), /* @__PURE__ */ React.createElement("circle", { cx: "15", cy: "8", r: "1.1", fill: "currentColor", stroke: "none" })),
      refresh: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M20 12a8 8 0 1 1-2.6-5.9" }), /* @__PURE__ */ React.createElement("path", { d: "M20 4v5h-5" })),
      cube: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z" }), /* @__PURE__ */ React.createElement("path", { d: "M4 7.5 12 12l8-4.5" }), /* @__PURE__ */ React.createElement("path", { d: "M12 12v9" })),
      related: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "6", cy: "6", r: "2.5" }), /* @__PURE__ */ React.createElement("circle", { cx: "18", cy: "6", r: "2.5" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "18", r: "2.5" }), /* @__PURE__ */ React.createElement("path", { d: "M8.5 6h7M7.2 8.2l3.6 7.6M16.8 8.2l-3.6 7.6" })),
      layers: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M12 3 3 8l9 5 9-5-9-5Z" }), /* @__PURE__ */ React.createElement("path", { d: "M3 12l9 5 9-5" }), /* @__PURE__ */ React.createElement("path", { d: "M3 16l9 5 9-5" })),
      eye: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "2.7" })),
      eyeOff: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M3.5 3.5l17 17" }), /* @__PURE__ */ React.createElement("path", { d: "M10.6 5.2A9.7 9.7 0 0 1 12 5c6 0 9.5 7 9.5 7a13.8 13.8 0 0 1-3.1 3.9M6.3 6.7C4 8.3 2.5 12 2.5 12s3.5 7 9.5 7c1.4 0 2.6-.3 3.7-.8" }), /* @__PURE__ */ React.createElement("path", { d: "M9.9 9.9a2.7 2.7 0 0 0 3.8 3.8" }))
    };
    return /* @__PURE__ */ React.createElement("svg", { ...common }, paths[name] || null);
  };
  var AstraLogo = ({ size = 32, animated = false }) => /* @__PURE__ */ React.createElement(
    "img",
    {
      src: "./assets/astra3-logo.png",
      alt: "Astra3",
      width: size,
      height: size,
      className: animated ? "astra-logo-spin" : "",
      style: { display: "block", objectFit: "contain" },
      draggable: false
    }
  );
  var AstraWordmark = ({ size = "md" }) => /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } }, /* @__PURE__ */ React.createElement(AstraLogo, { size: size === "lg" ? 40 : 30 }), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", lineHeight: 1.1 } }, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, fontSize: size === "lg" ? 22 : 17, letterSpacing: "0.01em" } }, "Astra3"), size === "lg" && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--text-1)", letterSpacing: "0.04em" } }, "STRUCTURAL ANALYSIS TOOLKIT")));
  var Button = ({ variant = "secondary", size = "md", icon, iconRight, children, className = "", style, ...props }) => {
    const base = {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      fontFamily: "var(--font-ui)",
      fontWeight: 600,
      cursor: "pointer",
      border: "1px solid transparent",
      borderRadius: "var(--radius-md)",
      transition: "all 120ms ease",
      whiteSpace: "nowrap"
    };
    const sizes = {
      sm: { padding: "5px 10px", fontSize: 12 },
      md: { padding: "8px 14px", fontSize: 13 },
      lg: { padding: "11px 18px", fontSize: 14 }
    };
    const variants = {
      primary: { background: "var(--accent)", color: "var(--text-on-accent)", borderColor: "var(--accent)" },
      secondary: { background: "var(--bg-3)", color: "var(--text-0)", borderColor: "var(--line-1)" },
      ghost: { background: "transparent", color: "var(--text-1)", borderColor: "transparent" },
      danger: { background: "transparent", color: "var(--coral)", borderColor: "var(--line-1)" },
      gold: { background: "var(--gold)", color: "#2B1D06", borderColor: "var(--gold)" },
      // Solid green/red for y/n answer buttons, where colour is the main cue.
      confirm: { background: "var(--sage)", color: "#0A1F14", borderColor: "var(--sage)" },
      decline: { background: "var(--coral)", color: "#2A0A08", borderColor: "var(--coral)" }
    };
    return /* @__PURE__ */ React.createElement(
      "button",
      {
        className: `astra-btn astra-btn-${variant} ${className}`,
        style: { ...base, ...sizes[size], ...variants[variant], opacity: props.disabled ? 0.45 : 1, cursor: props.disabled ? "not-allowed" : "pointer", ...style },
        ...props
      },
      icon && /* @__PURE__ */ React.createElement(Icon, { name: icon, size: size === "sm" ? 13 : 15 }),
      children,
      iconRight && /* @__PURE__ */ React.createElement(Icon, { name: iconRight, size: size === "sm" ? 13 : 15 })
    );
  };
  var IconButton = ({ name, size = 16, title, active, className = "", ...props }) => /* @__PURE__ */ React.createElement(
    "button",
    {
      title,
      className: `astra-iconbtn ${className}`.trim(),
      style: {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 30,
        height: 30,
        borderRadius: "var(--radius-sm)",
        border: "1px solid transparent",
        background: active ? "var(--accent-wash)" : "transparent",
        color: active ? "var(--accent-bright)" : "var(--text-1)",
        cursor: "pointer",
        transition: "all 120ms ease"
      },
      ...props
    },
    /* @__PURE__ */ React.createElement(Icon, { name, size })
  );
  var Badge = ({ tone = "neutral", children, dot, style }) => {
    const tones = {
      neutral: { bg: "var(--bg-3)", fg: "var(--text-1)", bd: "var(--line-1)" },
      accent: { bg: "var(--accent-wash)", fg: "var(--accent-bright)", bd: "transparent" },
      success: { bg: "var(--sage-wash)", fg: "var(--sage)", bd: "transparent" },
      warning: { bg: "var(--amber-wash)", fg: "var(--amber)", bd: "transparent" },
      error: { bg: "var(--coral-wash)", fg: "var(--coral)", bd: "transparent" },
      violet: { bg: "rgba(110,142,232,0.14)", fg: "var(--violet)", bd: "transparent" },
      gold: { bg: "var(--gold-wash)", fg: "var(--gold-bright)", bd: "transparent" }
    };
    const t = tones[tone];
    return /* @__PURE__ */ React.createElement("span", { style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      padding: "2px 8px",
      fontSize: 11,
      fontWeight: 600,
      borderRadius: 20,
      background: t.bg,
      color: t.fg,
      border: `1px solid ${t.bd}`,
      letterSpacing: "0.01em",
      lineHeight: 1.7,
      ...style
    } }, dot && /* @__PURE__ */ React.createElement("span", { style: { width: 5, height: 5, borderRadius: "50%", background: t.fg } }), children);
  };
  var Card = ({ children, style = {}, onClick, hover = false, className = "" }) => /* @__PURE__ */ React.createElement(
    "div",
    {
      onClick,
      className: `astra-card ${hover ? "astra-card-hover" : ""} ${className}`,
      style: {
        background: "var(--bg-1)",
        border: "1px solid var(--line-0)",
        borderRadius: "var(--radius-lg)",
        cursor: onClick ? "pointer" : "default",
        ...style
      }
    },
    children
  );
  var TextInput = React.forwardRef(({ icon, mono, style = {}, ...props }, ref) => /* @__PURE__ */ React.createElement("div", { style: { position: "relative", display: "flex", alignItems: "center" } }, icon && /* @__PURE__ */ React.createElement("span", { style: { position: "absolute", left: 10, color: "var(--text-2)", display: "flex" } }, /* @__PURE__ */ React.createElement(Icon, { name: icon, size: 14 })), /* @__PURE__ */ React.createElement(
    "input",
    {
      ref,
      ...props,
      style: {
        // --bg-1 on the --bg-0 page, like the Home cards; a --bg-0 field has no
        // contrast and its hairline alone is too faint in the dark theme.
        width: "100%",
        background: "var(--bg-1)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-md)",
        color: "var(--text-0)",
        padding: icon ? "9px 10px 9px 32px" : "9px 10px",
        fontSize: 13,
        fontFamily: mono ? "var(--font-mono)" : "var(--font-ui)",
        outline: "none",
        transition: "border-color 120ms ease",
        ...style
      },
      onFocus: (e) => {
        e.target.style.borderColor = "var(--accent)";
        props.onFocus && props.onFocus(e);
      },
      onBlur: (e) => {
        e.target.style.borderColor = "var(--line-1)";
        props.onBlur && props.onBlur(e);
      }
    }
  )));
  var SegmentedControl = ({ options, value, onChange, disabled = false, wrap = false }) => /* @__PURE__ */ React.createElement("div", { style: { display: "inline-flex", flexWrap: wrap ? "wrap" : "nowrap", background: "var(--bg-0)", borderRadius: "var(--radius-md)", padding: 3, border: "1px solid var(--line-0)", opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? "none" : "auto" } }, options.map((opt) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: opt.value,
      onClick: () => onChange(opt.value),
      disabled,
      style: {
        padding: "6px 13px",
        fontSize: 12.5,
        fontWeight: 600,
        borderRadius: "calc(var(--radius-md) - 2px)",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 120ms ease",
        background: value === opt.value ? "var(--accent)" : "transparent",
        color: value === opt.value ? "var(--text-on-accent)" : "var(--text-1)",
        display: "inline-flex",
        alignItems: "center",
        gap: 6
      }
    },
    opt.icon && /* @__PURE__ */ React.createElement(Icon, { name: opt.icon, size: 13 }),
    opt.label
  )));
  var Checkbox = ({ checked, onChange, label, description }) => /* @__PURE__ */ React.createElement("label", { style: { display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", padding: "8px 0" } }, /* @__PURE__ */ React.createElement(
    "div",
    {
      onClick: (e) => {
        e.preventDefault();
        onChange(!checked);
      },
      style: {
        width: 18,
        height: 18,
        borderRadius: 5,
        marginTop: 1,
        flexShrink: 0,
        border: `1.5px solid ${checked ? "var(--accent)" : "var(--line-1)"}`,
        background: checked ? "var(--accent)" : "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 120ms ease"
      }
    },
    checked && /* @__PURE__ */ React.createElement(Icon, { name: "check", size: 12, stroke: "var(--text-on-accent)", strokeWidth: 2.6 })
  ), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: 500, color: "var(--text-0)" } }, label), description && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--text-1)", marginTop: 1 } }, description)));
  var Toggle = ({ checked, onChange }) => /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => onChange(!checked),
      style: {
        width: 38,
        height: 22,
        borderRadius: 20,
        border: "none",
        cursor: "pointer",
        background: checked ? "var(--accent)" : "var(--bg-3)",
        position: "relative",
        transition: "background 150ms ease",
        flexShrink: 0
      }
    },
    /* @__PURE__ */ React.createElement("span", { style: {
      position: "absolute",
      top: 3,
      left: checked ? 19 : 3,
      width: 16,
      height: 16,
      borderRadius: "50%",
      background: checked ? "var(--text-on-accent)" : "var(--text-1)",
      transition: "left 150ms ease"
    } })
  );
  var Tooltip = ({ text, children, align = "center", placement = "top", block = false }) => {
    const [show, setShow] = useState(false);
    const [beside, setBeside] = useState(null);
    useEffect(() => {
      if (!text) setShow(false);
    }, [text]);
    if (!text) return children;
    const alignStyle = align === "right" ? { right: 0, left: "auto", transform: "none" } : align === "left" ? { left: 0, transform: "none" } : { left: "50%", transform: "translateX(-50%)" };
    const placementStyle = placement === "right" ? { position: "fixed", left: beside ? beside.left : 0, top: beside ? beside.top : 0, transform: "translateY(-50%)" } : placement === "bottom" ? { top: "calc(100% + 6px)", bottom: "auto" } : { bottom: "calc(100% + 6px)", top: "auto" };
    const enter = (e) => {
      if (placement === "right") {
        const r = e.currentTarget.getBoundingClientRect();
        setBeside({ left: r.right + 8, top: r.top + r.height / 2 });
      }
      setShow(true);
    };
    return /* @__PURE__ */ React.createElement("div", { style: { position: "relative", display: block ? "flex" : "inline-flex" }, onMouseEnter: enter, onMouseLeave: () => setShow(false) }, children, show && /* @__PURE__ */ React.createElement("div", { style: {
      position: "absolute",
      ...placement === "right" ? placementStyle : { ...placementStyle, ...alignStyle },
      background: "var(--bg-3)",
      color: "var(--text-0)",
      fontSize: 11.5,
      padding: "5px 9px",
      borderRadius: "var(--radius-sm)",
      whiteSpace: "nowrap",
      zIndex: 200,
      border: "1px solid var(--line-1)",
      boxShadow: "var(--shadow-sm)",
      pointerEvents: "none"
    } }, text));
  };
  function stripAnsi(text) {
    return text.replace(/\x1b\[[0-9;]*m/g, "");
  }
  var RENDER_FLOOR = 38;
  var RENDER_CEILING = 95;
  var FINISHING_PCT = 97;
  var VIEWS_PER_RENDER = 6;
  var CLOSEUPS_PER_COMPARISON = 4;
  var ASSUMED_IMAGE_MS = 2e4;
  var TAIL_MS = 4e3;
  var ANALYSIS_STAGES = [
    { pct: 5, seconds: 15, label: "Loading structures", test: /^(Fetching |Processing: |Starting alignment of )/ },
    { pct: 12, seconds: 12, label: "Reading chains", test: /^(Chain \S+ named |Ligand named |Ion named |N-Terminus: |C-Terminus: )/ },
    { pct: 18, seconds: 10, label: "Structures loaded", test: /^Finished processing:/ },
    { pct: 24, seconds: 12, label: "Aligning", test: /^(Aligned \S+ to |Reference structure:)/ },
    { pct: 30, seconds: 5, label: "Writing report", test: /^(Report saved:|Overlay report saved:)/ },
    { pct: 34, seconds: 6, label: "Saving session", test: /^Session saved:/ },
    {
      pct: RENDER_FLOOR,
      seconds: 0,
      label: "Rendering views",
      test: /^(Taking pictures of:|Saving images to:|Rendering close-up terminus views for|Rendering whole-structure views for)/
    }
  ];
  var RUN_LINE_IMAGE_SAVED = /^Saved (view_|closeup_)/;
  var RUN_LINE_VIEW_GROUP = /^Taking pictures of:/;
  var RUN_LINE_CLOSEUP_GROUP = /^Rendering close-up terminus views for/;
  var RUN_LINE_COMPARISON_DONE = /^(\d+) image\(s\) rendered for /;
  var RUN_LINE_FINISHED = /^(HTML report saved:|Output folder:|Process complete!)/;
  function newRunScan() {
    return {
      stageIndex: -1,
      stageAt: 0,
      imagesSaved: 0,
      imageTimes: [],
      viewImages: 0,
      closeupGroups: 0,
      comparisonsDone: 0,
      lastComparisonImages: 0,
      finished: false
    };
  }
  function applyRunLine(scan, entry) {
    const raw = typeof entry === "string" ? entry : entry && entry.text || "";
    const text = stripAnsi(raw).trim();
    if (!text) return;
    const at = entry && typeof entry.at === "number" ? entry.at : 0;
    for (let i = ANALYSIS_STAGES.length - 1; i > scan.stageIndex; i -= 1) {
      if (ANALYSIS_STAGES[i].test.test(text)) {
        scan.stageIndex = i;
        scan.stageAt = at || scan.stageAt;
        break;
      }
    }
    if (RUN_LINE_IMAGE_SAVED.test(text)) {
      scan.imagesSaved += 1;
      if (at) {
        scan.imageTimes.push(at);
        if (scan.imageTimes.length > 8) scan.imageTimes.shift();
      }
      return;
    }
    if (RUN_LINE_VIEW_GROUP.test(text)) {
      const trimmed = /\((\d+) views?\)\s*$/.exec(text);
      scan.viewImages += trimmed ? Number(trimmed[1]) : VIEWS_PER_RENDER;
      return;
    }
    if (RUN_LINE_CLOSEUP_GROUP.test(text)) {
      scan.closeupGroups += 1;
      return;
    }
    const summary = RUN_LINE_COMPARISON_DONE.exec(text);
    if (summary) {
      scan.comparisonsDone += 1;
      scan.lastComparisonImages = Number(summary[1]) || 0;
      return;
    }
    if (RUN_LINE_FINISHED.test(text)) scan.finished = true;
  }
  function expectedImageCount(scan, plan) {
    const announced = scan.viewImages + scan.closeupGroups * CLOSEUPS_PER_COMPARISON;
    let expected = Math.max(plan && plan.images || 0, announced, scan.imagesSaved);
    const comparisons = plan && plan.comparisons || 0;
    if (scan.comparisonsDone > 0 && comparisons > scan.comparisonsDone) {
      const left = comparisons - scan.comparisonsDone;
      expected = Math.max(expected, scan.imagesSaved + scan.lastComparisonImages * left);
    }
    return expected;
  }
  function measuredImageMs(scan) {
    const times = scan.imageTimes;
    if (!times || times.length < 3) return null;
    const gaps = [];
    for (let i = 1; i < times.length; i += 1) gaps.push(times[i] - times[i - 1]);
    gaps.sort((a, b) => a - b);
    const mid = gaps[Math.floor(gaps.length / 2)];
    return mid > 0 ? mid : null;
  }
  function projectRunProgress(scan, plan, now) {
    const expected = expectedImageCount(scan, plan);
    const measured = measuredImageMs(scan);
    const atRenderStage = scan.stageIndex === ANALYSIS_STAGES.length - 1;
    const rendering = scan.imagesSaved > 0 || expected > 0 && atRenderStage;
    let pct;
    let label;
    if (rendering) {
      const total = Math.max(expected, scan.imagesSaved, 1);
      const done = Math.min(scan.imagesSaved, total);
      const slice = (RENDER_CEILING - RENDER_FLOOR) / total;
      pct = RENDER_FLOOR + slice * done;
      if (done < total) {
        const lastAt = scan.imageTimes.length ? scan.imageTimes[scan.imageTimes.length - 1] : scan.stageAt;
        const since = now && lastAt ? Math.max(0, now - lastAt) : 0;
        pct += slice * Math.min(0.9, since / (measured || ASSUMED_IMAGE_MS));
      }
      label = `Rendering images (${done} of ${total})`;
    } else {
      const stage = ANALYSIS_STAGES[scan.stageIndex];
      if (!stage) {
        pct = 0;
        label = "Starting";
      } else {
        const skippingImages = !!plan && plan.images === 0;
        const lastReachable = ANALYSIS_STAGES.length - (skippingImages ? 2 : 1);
        const next = scan.stageIndex < lastReachable ? ANALYSIS_STAGES[scan.stageIndex + 1] : null;
        const ceiling = next ? next.pct : skippingImages ? RENDER_CEILING : RENDER_FLOOR;
        const gap = Math.max(0, ceiling - stage.pct);
        const elapsed = now && scan.stageAt ? Math.max(0, now - scan.stageAt) : 0;
        pct = stage.pct + (stage.seconds > 0 ? gap * 0.85 * (1 - Math.exp(-elapsed / (stage.seconds * 1e3))) : 0);
        label = stage.label;
      }
    }
    if (scan.finished) {
      pct = Math.max(pct, FINISHING_PCT);
      label = "Finishing";
    }
    let remainingMs = null;
    if (measured && !scan.finished) {
      const left = Math.max(0, expected - scan.imagesSaved);
      if (left > 0) {
        const lastAt = scan.imageTimes[scan.imageTimes.length - 1] || 0;
        const inFlight = now && lastAt ? Math.max(0, now - lastAt) : 0;
        remainingMs = Math.max(0, left * measured - inFlight) + TAIL_MS;
      }
    }
    return {
      pct: Math.max(0, Math.min(pct, FINISHING_PCT)),
      label,
      imagesSaved: scan.imagesSaved,
      imagesExpected: expected,
      finished: scan.finished,
      remainingMs
    };
  }
  function batchProgressFrom(queue, itemFraction) {
    const list = queue || [];
    const total = list.length || 1;
    const complete = list.filter((j) => j.status === "complete").length;
    const failed = list.filter((j) => j.status === "failed").length;
    const cancelled = list.filter((j) => j.status === "cancelled").length;
    const done = complete + failed;
    const fraction = Math.max(0, Math.min(0.99, itemFraction || 0));
    const value = cancelled ? complete === 0 ? 100 : complete / total * 100 : Math.min(100, (done + fraction) / total * 100);
    return {
      value,
      complete,
      failed,
      cancelled,
      done,
      // Amber when any failed; red when stopped.
      tone: cancelled ? "coral" : failed ? "amber" : done === list.length && list.length > 0 ? "sage" : "accent",
      label: cancelled ? complete === 0 ? "Cancelled" : `Cancelled at ${complete} of ${list.length}` : `${done} of ${list.length} processed`,
      showValue: !cancelled
    };
  }
  function formatRemaining(ms) {
    if (ms === null || ms === void 0 || !isFinite(ms)) return null;
    const seconds = Math.round(ms / 1e3);
    if (seconds < 15) return "a few seconds left";
    if (seconds < 60) return `~${Math.round(seconds / 10) * 10}s left`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `~${minutes} min left`;
    return `~${Math.round(minutes / 60)} hr left`;
  }
  var ProgressBar = ({ value, tone = "accent", label, animated = false, showValue = true, hint = null }) => {
    const colors = { accent: "var(--accent)", amber: "var(--amber)", sage: "var(--sage)", coral: "var(--coral)" };
    const width = Math.max(0, Math.min(100, Number(value) || 0));
    return /* @__PURE__ */ React.createElement("div", null, label && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11.5, color: "var(--text-1)", marginBottom: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, label), /* @__PURE__ */ React.createElement("span", { style: { display: "flex", gap: 8, flexShrink: 0 } }, hint && /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-2)" } }, hint), showValue && /* @__PURE__ */ React.createElement("span", { className: "mono" }, Math.round(width), "%"))), /* @__PURE__ */ React.createElement("div", { style: { height: 6, background: "var(--bg-0)", borderRadius: 4, overflow: "hidden", border: "1px solid var(--line-0)" } }, /* @__PURE__ */ React.createElement("div", { className: animated ? "astra-progress-stripe" : "", style: {
      width: `${width}%`,
      height: "100%",
      background: colors[tone],
      transition: "width 300ms ease",
      borderRadius: 4
    } })));
  };
  function useNow(active, intervalMs = 500) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
      if (!active) return void 0;
      setNow(Date.now());
      const id = setInterval(() => setNow(Date.now()), intervalMs);
      return () => clearInterval(id);
    }, [active, intervalMs]);
    return now;
  }
  function useRunScan(lines) {
    const held = useRef({ count: 0, scan: newRunScan() });
    const feed = lines || [];
    if (feed.length < held.current.count) held.current = { count: 0, scan: newRunScan() };
    if (feed.length > held.current.count) {
      for (let i = held.current.count; i < feed.length; i += 1) applyRunLine(held.current.scan, feed[i]);
      held.current.count = feed.length;
    }
    return held.current.scan;
  }
  function RunProgressBar({ lines, plan, outcome, prefix }) {
    const active = !outcome;
    const now = useNow(active);
    const scan = useRunScan(lines);
    const reachedRef = useRef(0);
    if (!lines || lines.length === 0) reachedRef.current = 0;
    const state = projectRunProgress(scan, plan || {}, now);
    if (state.pct > reachedRef.current) reachedRef.current = state.pct;
    const reached = reachedRef.current;
    const tone = outcome === "complete" ? "sage" : outcome === "cancelled" ? "coral" : outcome === "failed" ? "amber" : "accent";
    const label = outcome === "complete" ? "Complete" : outcome === "cancelled" ? `Cancelled at ${Math.round(reached)}%` : outcome === "failed" ? `Failed at ${Math.round(reached)}%` : prefix ? `${prefix} \xB7 ${state.label}` : state.label;
    return /* @__PURE__ */ React.createElement(
      ProgressBar,
      {
        value: outcome === "complete" ? 100 : reached,
        tone,
        label,
        animated: active,
        showValue: !outcome || outcome === "complete",
        hint: active ? formatRemaining(state.remainingMs) : null
      }
    );
  }
  function BatchProgressBar({ queue, itemLines, itemPlan, running, startedAt }) {
    const now = useNow(running);
    const scan = useRunScan(itemLines);
    const reachedRef = useRef({ startedAt: 0, pct: 0 });
    if (reachedRef.current.startedAt !== startedAt) reachedRef.current = { startedAt, pct: 0 };
    const itemFraction = running ? projectRunProgress(scan, itemPlan || {}, now).pct / 100 : 0;
    const state = batchProgressFrom(queue, itemFraction);
    if (state.value > reachedRef.current.pct) reachedRef.current.pct = state.value;
    let hint = null;
    if (running && startedAt && state.done >= 1) {
      const perItem = (now - startedAt) / (state.done + itemFraction);
      const left = Math.max(0, (queue.length || 1) - state.done - itemFraction);
      if (perItem > 0 && left > 0) hint = formatRemaining(perItem * left);
    }
    return /* @__PURE__ */ React.createElement(
      ProgressBar,
      {
        value: state.cancelled ? state.value : Math.min(100, reachedRef.current.pct),
        tone: state.tone,
        label: state.label,
        showValue: state.showValue,
        hint,
        animated: running
      }
    );
  }
  var Spinner = ({ size = 14 }) => /* @__PURE__ */ React.createElement("svg", { className: "astra-spin", width: size, height: size, viewBox: "0 0 24 24", fill: "none" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "9.5", stroke: "var(--line-1)", strokeWidth: "2.5" }), /* @__PURE__ */ React.createElement("path", { d: "M21.5 12a9.5 9.5 0 0 0-9.5-9.5", stroke: "var(--accent)", strokeWidth: "2.5", strokeLinecap: "round" }));
  var EmptyState = ({ icon, title, description, action }) => /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px", textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { width: 52, height: 52, borderRadius: 14, background: "var(--bg-2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-2)", marginBottom: 16 } }, /* @__PURE__ */ React.createElement(Icon, { name: icon, size: 24 })), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 14.5, fontWeight: 600, color: "var(--text-0)", marginBottom: 5 } }, title), description && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5, color: "var(--text-1)", maxWidth: 340, marginBottom: action ? 18 : 0, wordBreak: "break-word" } }, description), action);
  var ToastContext = createContext(null);
  var useToast = () => useContext(ToastContext);
  var ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);
    const push = useCallback((toast) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((t) => [...t, { id, tone: "neutral", duration: 4200, ...toast }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), toast.duration || 4200);
    }, []);
    const dismiss = (id) => setToasts((t) => t.filter((x) => x.id !== id));
    const toneIcon = { success: "check", error: "alertTriangle", warning: "alertTriangle", neutral: "info" };
    const toneColor = { success: "var(--sage)", error: "var(--coral)", warning: "var(--amber)", neutral: "var(--accent)" };
    return /* @__PURE__ */ React.createElement(ToastContext.Provider, { value: { push } }, children, /* @__PURE__ */ React.createElement("div", { style: { position: "fixed", bottom: 20, right: 20, display: "flex", flexDirection: "column", gap: 8, zIndex: 1e3, width: 340 } }, toasts.map((t) => /* @__PURE__ */ React.createElement("div", { key: t.id, className: "astra-toast-in", style: {
      background: "var(--bg-2)",
      border: "1px solid var(--line-1)",
      borderRadius: "var(--radius-md)",
      padding: "12px 14px",
      display: "flex",
      gap: 10,
      alignItems: "flex-start",
      boxShadow: "var(--shadow-lg)"
    } }, /* @__PURE__ */ React.createElement("span", { style: { color: toneColor[t.tone], flexShrink: 0, marginTop: 1 } }, /* @__PURE__ */ React.createElement(Icon, { name: toneIcon[t.tone], size: 16 })), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, t.title && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: 600, marginBottom: 2 } }, t.title), t.message && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--text-1)" } }, t.message)), /* @__PURE__ */ React.createElement("button", { onClick: () => dismiss(t.id), style: { background: "none", border: "none", color: "var(--text-2)", cursor: "pointer", padding: 2 } }, /* @__PURE__ */ React.createElement(Icon, { name: "x", size: 13 }))))));
  };
  var AstraBridgeUnavailable = class {
    on() {
      return () => {
      };
    }
    off() {
    }
    async runCommand() {
      throw new Error("Analyses run only in the Astra3 desktop app.");
    }
    async runImportCommand() {
      throw new Error("Analyses run only in the Astra3 desktop app.");
    }
    async cancel() {
      return { ok: false, error: "Cancel is available only in the desktop app." };
    }
  };
  var AstraBridgeElectron = class {
    constructor() {
      this._listeners = {};
      this._promptResolvers = [];
      this._lastSeq = 0;
      this._seqWaiters = [];
      window.astra3Native.onPymolLog(({ text, tone, seq }) => {
        this.emit("log-line", { text, tone });
        if (typeof seq === "number" && seq > this._lastSeq) this._lastSeq = seq;
        this._seqWaiters = this._seqWaiters.filter((w) => this._lastSeq >= w.seq ? (w.resolve(), false) : true);
      });
      window.astra3Native.onPymolState((state) => this.emit("state", state));
    }
    on(event, cb) {
      (this._listeners[event] ||= []).push(cb);
      return () => this.off(event, cb);
    }
    off(event, cb) {
      this._listeners[event] = (this._listeners[event] || []).filter((f) => f !== cb);
    }
    emit(event, payload) {
      (this._listeners[event] || []).forEach((cb) => cb(payload));
    }
    // Resolves once log line `seq` has arrived, or after 3 s. Results and log
    // lines use separate IPC channels, so a result can arrive before the last
    // lines of its run.
    _receivedThrough(seq) {
      if (typeof seq !== "number" || this._lastSeq >= seq) return Promise.resolve();
      return new Promise((resolve) => {
        const waiter = { seq, resolve };
        this._seqWaiters.push(waiter);
        setTimeout(() => {
          this._seqWaiters = this._seqWaiters.filter((w) => w !== waiter);
          resolve();
        }, 3e3);
      });
    }
    // Runs one command, forwarding its output and prompts to the callbacks
    // until its last log line has arrived.
    async _run(invoke, failure, { onLog, onProgress, onPrompt, onPromptClosed } = {}) {
      const offLog = this.on("log-line", ({ text, tone }) => onLog && onLog(text, tone));
      const offState = this.on("state", async (state) => {
        if (typeof state.progress === "number") onProgress && onProgress(state.progress);
        if (state.prompt) {
          const answer = await onPrompt(state.prompt);
          window.astra3Native.pymolAnswerPrompt(answer);
        }
        if (state.prompt === null && onPromptClosed) onPromptClosed();
      });
      try {
        const result = await invoke();
        if (!result.ok) throw new Error(result.error || failure);
        await this._receivedThrough(result.lastLogSeq);
        return result;
      } finally {
        offLog();
        offState();
      }
    }
    runCommand(commandString, handlers) {
      return this._run(() => window.astra3Native.pymolRunCommand(commandString), "Command failed", handlers);
    }
    // IMPORT asks for the file path interactively; pymol-bridge.js answers it.
    runImportCommand(filePath, handlers) {
      return this._run(() => window.astra3Native.pymolRunImportCommand(filePath), "Import failed", handlers);
    }
    async cancel() {
      return window.astra3Native.pymolCancel();
    }
  };
  var AppContext = createContext(null);
  var useApp = () => useContext(AppContext);
  function dirnameOf(p) {
    if (!p) return "";
    const cut = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
    return cut > 0 ? p.slice(0, cut) : "";
  }
  function joinPath(base, ...parts) {
    if (!base) return parts.join("/");
    const sep = base.includes("\\") && !base.includes("/") ? "\\" : "/";
    return [base.replace(/[/\\]+$/, ""), ...parts].join(sep);
  }
  var AST_ID_RE = /^AST-\d+$/i;
  var EXTENDED_ONLY_ID_RE = /^PDB_(?!0000)[A-Z0-9]{8}$/i;
  var ENGINE_NAMES = { pymol: "PyMOL", chimerax: "ChimeraX", astra3: "Astra3 Engine" };
  var engineKey = (name) => Object.keys(ENGINE_NAMES).find((k) => ENGINE_NAMES[k] === name) || "pymol";
  async function checkEnginePath(engine, candidate) {
    const p = String(candidate || "").trim();
    if (!p) return { error: `Enter where ${ENGINE_NAMES[engine]} is installed.` };
    const file = p.split(/[\\/]/).filter(Boolean).pop() || "";
    if (engine === "pymol") {
      if (/chimerax/i.test(file)) return { error: "This is ChimeraX, not PyMOL. Enter it as the ChimeraX location instead." };
      if (!await window.astra3Native.verifyPymolPath(p)) return { error: "This file does not appear to be a valid PyMOL executable." };
      if (!await window.astra3Native.verifyIsRealPymol(p)) {
        return { error: await window.astra3Native.pymolVerifyProblem() || "This file does not appear to be a valid PyMOL executable." };
      }
      return {};
    }
    if (/pymol/i.test(file)) return { error: "This is PyMOL, not ChimeraX. Enter it as the PyMOL location instead." };
    const version = await window.astra3Native.chimeraxVersion(p);
    return version ? { version } : { error: "This program does not appear to be ChimeraX." };
  }
  var structureSourceLabel = (id, format) => AST_ID_RE.test(String(id || "").trim()) ? "Import" : format === "cif" ? "mmCIF" : "PDB";
  var RUN_OUTPUT_PATH_LINE = /^(?:Session saved|Report saved|Overlay report saved|HTML report saved|JSON export saved|CSV export saved|Saving images to|Structure also exported as PDB for the viewer|Structure saved as PDB fallback|Output folder):\s*(\S.*?)\s*$/;
  function runFolderFromLines(lines) {
    const feed = lines || [];
    for (let i = feed.length - 1; i >= 0; i -= 1) {
      const entry = feed[i];
      const text = stripAnsi(typeof entry === "string" ? entry : entry && entry.text || "").trim();
      const match = RUN_OUTPUT_PATH_LINE.exec(text);
      if (!match) continue;
      const raw = match[1];
      const sep = raw.includes("\\") && !raw.includes("/") ? "\\" : "/";
      const parts = raw.split(/[/\\]/);
      for (let j = parts.length - 1; j >= 0; j -= 1) {
        if (/_Output(?: \(\d+\))?$/i.test(parts[j])) {
          return { parent: parts.slice(0, j).join(sep), name: parts[j] };
        }
      }
    }
    return null;
  }
  function runProducedOutput(lines) {
    return (lines || []).some((entry) => {
      const text = stripAnsi(typeof entry === "string" ? entry : entry && entry.text || "").trim();
      return RUN_OUTPUT_PATH_LINE.test(text) || /^Saved (view_|closeup_)/.test(text);
    });
  }
  async function discardRunOutput(lines, fallbackId, outputDir, startedAt) {
    let target = runFolderFromLines(lines);
    if (!target && fallbackId && outputDir) {
      target = { parent: outputDir, name: `${String(fallbackId).toUpperCase()}_Output` };
    }
    if (!target || !target.parent || !target.name) return false;
    try {
      const removed = await window.astra3Native?.deleteRunFolders?.(target.parent, [target.name], startedAt || 0);
      return !!(removed && removed.deleted);
    } catch {
      return false;
    }
  }
  function formatBytes(bytes) {
    if (!bytes || bytes < 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
  }
  var MAC_PYMOL_EXAMPLE = "/Applications/PyMOL.app/Contents/MacOS/PyMOL";
  var DEFAULT_SETTINGS = {
    defaultQuality: "medium",
    defaultFormat: "cif",
    outputDir: "~/Documents/Astra3/Protein_outputs",
    pymolPath: "",
    // Off by default: on Windows, opening an .html for the first time raises a
    // "How do you want to open this file?" chooser.
    autoOpenReport: false,
    autoOpenSession: false,
    completionSound: true,
    theme: "dark",
    confirmBeforeBatch: true,
    contentFont: "IBM Plex Mono"
  };
  var CONTENT_FONT_GROUPS = [
    {
      label: "Bundled with Astra3",
      options: [
        { label: "IBM Plex Mono", family: "'IBM Plex Mono', ui-monospace, monospace" },
        { label: "Inter", family: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif" },
        { label: "Nunito", family: "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif" }
      ]
    },
    {
      label: "System sans-serif",
      options: [
        { label: "Helvetica Neue", family: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
        { label: "Arial", family: "Arial, 'Helvetica Neue', Helvetica, sans-serif" },
        { label: "Verdana", family: "Verdana, Geneva, sans-serif" },
        { label: "Tahoma", family: "Tahoma, Geneva, sans-serif" },
        { label: "Trebuchet MS", family: "'Trebuchet MS', sans-serif" },
        { label: "Segoe UI", family: "'Segoe UI', Tahoma, sans-serif" },
        { label: "Calibri", family: "Calibri, Candara, sans-serif" },
        { label: "Century Gothic", family: "'Century Gothic', sans-serif" },
        { label: "Futura", family: "Futura, 'Century Gothic', sans-serif" },
        { label: "Optima", family: "Optima, 'Segoe UI', sans-serif" },
        { label: "Gill Sans", family: "'Gill Sans', 'Gill Sans MT', sans-serif" },
        { label: "Avenir", family: "Avenir, 'Avenir Next', sans-serif" }
      ]
    },
    {
      label: "System serif",
      options: [
        { label: "Times New Roman", family: "'Times New Roman', Times, serif" },
        { label: "Georgia", family: "Georgia, 'Times New Roman', serif" },
        { label: "Palatino", family: "Palatino, 'Palatino Linotype', serif" },
        { label: "Baskerville", family: "Baskerville, 'Times New Roman', serif" },
        { label: "Garamond", family: "Garamond, Baskerville, serif" },
        { label: "Cambria", family: "Cambria, Georgia, serif" },
        { label: "Didot", family: "Didot, Georgia, serif" },
        { label: "Bookman Old Style", family: "'Bookman Old Style', 'URW Bookman', serif" }
      ]
    },
    {
      label: "System monospace",
      options: [
        { label: "Menlo", family: "Menlo, Monaco, 'Courier New', monospace" },
        { label: "Monaco", family: "Monaco, Menlo, monospace" },
        { label: "Consolas", family: "Consolas, 'Andale Mono', monospace" },
        { label: "Courier New", family: "'Courier New', Courier, monospace" },
        { label: "Andale Mono", family: "'Andale Mono', monospace" }
      ]
    },
    {
      label: "System display / decorative",
      options: [
        { label: "Comic Sans MS", family: "'Comic Sans MS', 'Comic Sans', cursive" },
        { label: "Papyrus", family: "Papyrus, fantasy" },
        { label: "Impact", family: "Impact, 'Arial Black', sans-serif" },
        { label: "Copperplate", family: "Copperplate, 'Copperplate Gothic Light', serif" },
        { label: "Brush Script MT", family: "'Brush Script MT', cursive" },
        { label: "Chalkboard", family: "Chalkboard, 'Comic Sans MS', cursive" },
        { label: "Marker Felt", family: "'Marker Felt', cursive" },
        { label: "American Typewriter", family: "'American Typewriter', 'Courier New', serif" }
      ]
    }
  ];
  var CONTENT_FONT_LOOKUP = Object.fromEntries(
    CONTENT_FONT_GROUPS.flatMap((g) => g.options).map((o) => [o.label, o.family])
  );
  var QUICK_VIEW_LIMIT = 30;
  function AppProvider({ children }) {
    const [settings, setSettings] = useState(() => {
      try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem("astra3_settings") || "{}") };
      } catch {
        return DEFAULT_SETTINGS;
      }
    });
    const [history, setHistory] = useState(() => {
      try {
        return JSON.parse(localStorage.getItem("astra3_history")) || [];
      } catch {
        return [];
      }
    });
    const [quickViews, setQuickViews] = useState(() => {
      try {
        return JSON.parse(localStorage.getItem("astra3_quickviews")) || [];
      } catch {
        return [];
      }
    });
    const sessionStartTime = useRef(Date.now()).current;
    const [consoleLog, setConsoleLog] = useState([
      { text: "Astra3: Structural Analysis Toolkit", tone: "info" }
    ]);
    const [activeJobs, setActiveJobs] = useState([]);
    const [isBusy, setIsBusy] = useState(false);
    const isBusyRef = useRef(false);
    const holdLockGenerationRef = useRef(0);
    const [pendingStructureSeed, setPendingStructureSeed] = useState(null);
    const [pendingPromptPage, setPendingPromptPage] = useState(null);
    const [completionPulse, setCompletionPulse] = useState(0);
    const [selectedReportId, setSelectedReportId] = useState(null);
    const [selectedViewerId, setSelectedViewerId] = useState(null);
    const [prompt, setPrompt] = useState(null);
    const [setupStatus, setSetupStatus] = useState(null);
    const [platform, setPlatform] = useState(null);
    const [homeDir, setHomeDir] = useState(null);
    const [outputNotice, setOutputNotice] = useState(null);
    const bridge = useMemo(() => typeof window !== "undefined" && window.astra3Native ? new AstraBridgeElectron() : new AstraBridgeUnavailable(), []);
    const [engineInfo, setEngineInfo] = useState(() => {
      const blank = {
        engine: "pymol",
        name: "PyMOL",
        version: null,
        running: false,
        error: null,
        versions: {},
        available: null,
        none: false
      };
      try {
        const saved = JSON.parse(localStorage.getItem("astra3_engine") || "{}");
        const engine = ENGINE_NAMES[saved.engine] ? saved.engine : "pymol";
        const versions = saved.versions && typeof saved.versions === "object" ? saved.versions : {};
        return { ...blank, engine, name: ENGINE_NAMES[engine], version: versions[engine] || null, versions };
      } catch {
        return blank;
      }
    });
    const refreshEngineStatus = useCallback(async () => {
      if (!window.astra3Native?.engineStatus) return null;
      const status = await window.astra3Native.engineStatus();
      setEngineInfo((e) => {
        const engine = status.running || status.engine || status.preferred || "pymol";
        return {
          ...e,
          engine,
          name: ENGINE_NAMES[engine],
          version: e.versions[engine] || null,
          available: status.available,
          configured: status.configured,
          none: !status.engine && !status.running,
          running: status.running === engine,
          error: engine === e.engine ? e.error : null
        };
      });
      return status;
    }, []);
    const rememberEngineVersion = useCallback((engine, version) => {
      if (!version) return;
      setEngineInfo((e) => ({ ...e, versions: { ...e.versions, [engine]: version }, version: e.engine === engine ? version : e.version }));
    }, []);
    const switchEngine = useCallback(async (engine) => {
      const result = await window.astra3Native.setEngine(engine);
      await refreshEngineStatus();
      return result;
    }, [refreshEngineStatus]);
    useEffect(() => {
      refreshEngineStatus().catch(() => {
      });
      return bridge.on("state", (state) => {
        setEngineInfo((e) => {
          const next = { ...e };
          if (state.engine) {
            const engine = engineKey(state.engine);
            if (engine !== e.engine) {
              next.engine = engine;
              next.name = state.engine;
              next.version = e.versions[engine] || null;
              next.error = null;
            }
            next.none = false;
          }
          if (state.engineVersion) {
            next.version = state.engineVersion;
            next.versions = { ...e.versions, [next.engine]: state.engineVersion };
          }
          if (typeof state.running === "boolean") {
            next.running = state.running;
            if (state.running) next.error = null;
          }
          if (state.launchError) next.error = state.launchError;
          return next;
        });
      });
    }, [bridge, refreshEngineStatus]);
    useEffect(() => {
      try {
        localStorage.setItem("astra3_engine", JSON.stringify({ engine: engineInfo.engine, versions: engineInfo.versions }));
      } catch {
      }
    }, [engineInfo.engine, engineInfo.versions]);
    const isElectron = typeof window !== "undefined" && !!window.astra3Native;
    useEffect(() => {
      localStorage.setItem("astra3_settings", JSON.stringify(settings));
    }, [settings]);
    useEffect(() => {
      localStorage.setItem("astra3_history", JSON.stringify(history));
    }, [history]);
    useEffect(() => {
      localStorage.setItem("astra3_quickviews", JSON.stringify(quickViews));
    }, [quickViews]);
    useEffect(() => {
      const light = settings.theme === "light";
      document.documentElement.setAttribute("data-theme", light ? "light" : "dark");
      if (window.astra3Native?.setTheme) window.astra3Native.setTheme(light ? "light" : "dark");
    }, [settings.theme]);
    useEffect(() => {
      const family = CONTENT_FONT_LOOKUP[settings.contentFont] || settings.contentFont || CONTENT_FONT_LOOKUP[DEFAULT_SETTINGS.contentFont];
      document.documentElement.style.setProperty("--font-body-rounded", family);
    }, [settings.contentFont]);
    useEffect(() => {
      if (!isElectron) return;
      Promise.all([
        window.astra3Native.getPaths(),
        window.astra3Native.getPymolPath ? window.astra3Native.getPymolPath() : Promise.resolve(null)
      ]).then(([paths, pymolPath]) => {
        if (!paths) return;
        setPlatform(paths.platform);
        setHomeDir(paths.home || null);
        const patch = {};
        if ((pymolPath || "") !== settings.pymolPath) patch.pymolPath = pymolPath || "";
        if (Object.keys(patch).length > 0) updateSettings(patch);
      });
    }, [isElectron]);
    useEffect(() => {
      if (!isElectron || !window.astra3Native.getOutputLocation) return;
      const remembered = settings.outputDir && settings.outputDir !== DEFAULT_SETTINGS.outputDir ? settings.outputDir : null;
      window.astra3Native.getOutputLocation(remembered).then((location) => {
        if (!location || !location.dir) return;
        if (location.dir !== settings.outputDir) updateSettings({ outputDir: location.dir });
        if (location.notice) setOutputNotice(location.notice);
      }).catch(() => {
      });
    }, [isElectron]);
    useEffect(() => {
      if (!isElectron) {
        setSetupStatus({ pymolOk: true, scriptOk: true, isFirstLaunch: false });
        return;
      }
      let cancelled = false;
      Promise.all([refreshEngineStatus(), window.astra3Native.getAstraScriptPath()]).then(([status, scriptPath]) => {
        if (cancelled) return;
        const found = !!(status && status.engine);
        const needsSetup = !status || !status.programs && !status.chosen || !found;
        setSetupStatus({
          pymolOk: !needsSetup,
          scriptOk: !!scriptPath,
          isFirstLaunch: needsSetup,
          available: status ? status.available : null,
          engine: status ? status.engine : null,
          fallbackFrom: found && status.engine !== status.preferred ? status.preferred : null
        });
      }).catch(() => {
        if (!cancelled) setSetupStatus({ pymolOk: true, scriptOk: true, isFirstLaunch: false });
      });
      return () => {
        cancelled = true;
      };
    }, [isElectron]);
    const updateSettings = (patch) => setSettings((s) => ({ ...s, ...patch }));
    const logSeqRef = useRef(0);
    const appendLog = useCallback((text, tone = "muted") => {
      const n = logSeqRef.current++;
      setConsoleLog((l) => {
        const next = l.length >= SESSION_LOG_MAX_LINES ? l.slice(l.length - SESSION_LOG_MAX_LINES + 1) : l.slice();
        next.push({ text, tone, n });
        return next;
      });
    }, []);
    const engineRef = useRef(engineInfo.engine);
    useEffect(() => {
      engineRef.current = engineInfo.engine;
    }, [engineInfo.engine]);
    const addHistoryEntry = useCallback((entry) => {
      const id = Math.random().toString(36).slice(2);
      setHistory((h) => [{ id, timestamp: Date.now(), favorite: false, engine: engineRef.current, ...entry }, ...h]);
      return id;
    }, []);
    const toggleFavorite = (id) => setHistory((h) => h.map((e) => e.id === id ? { ...e, favorite: !e.favorite } : e));
    const deleteHistoryEntry = (id) => setHistory((h) => h.filter((e) => e.id !== id));
    const clearHistory = useCallback(() => setHistory([]), []);
    const addQuickView = useCallback((entry) => {
      const added = { id: Math.random().toString(36).slice(2), timestamp: Date.now(), kind: "quickview", status: "complete", ...entry };
      const same = (e) => e.structureId === added.structureId && (e.path || null) === (added.path || null);
      setQuickViews((list) => [added, ...list.filter((e) => !same(e))].slice(0, QUICK_VIEW_LIMIT));
      return added;
    }, []);
    const removeQuickView = useCallback((id) => setQuickViews((list) => list.filter((e) => e.id !== id)), []);
    const runAstraCommand = useCallback(async (commandString, { silent = false, originPage = null, onLog: callerOnLog, holdLock = false, lockToken = null, bridgeCall = null } = {}) => {
      if (isElectron) {
        const status = await refreshEngineStatus();
        if (status && !status.engine && !status.running) {
          setSetupStatus((s) => ({ pymolOk: false, scriptOk: s?.scriptOk ?? true, isFirstLaunch: false }));
          const err = new Error("Neither PyMOL nor ChimeraX could be found. Select either installation to continue.");
          appendLog(err.message, "error");
          throw err;
        }
      }
      const holdsLockAlready = lockToken !== null && lockToken === holdLockGenerationRef.current;
      if (isBusyRef.current && !holdsLockAlready) {
        const err = new Error("Astra3 is already running a command. Wait for it to finish, or cancel it from the Advanced Console.");
        appendLog(err.message, "error");
        throw err;
      }
      isBusyRef.current = true;
      setIsBusy(true);
      cancelRequestedRef.current = false;
      appendLog(commandString, "command");
      const jobId = Math.random().toString(36).slice(2);
      setActiveJobs((j) => [...j, { id: jobId, command: commandString, progress: 0, status: "running" }]);
      const runLines = [];
      let bridgeEchoSeen = false;
      const recordLine = (text, tone) => {
        const entry = { text, tone, at: Date.now() };
        runLines.push(entry);
        if (tone === "command" && !bridgeEchoSeen && text === commandString) {
          bridgeEchoSeen = true;
          callerOnLog && callerOnLog(entry, runLines);
          return;
        }
        appendLog(text, tone);
        callerOnLog && callerOnLog(entry, runLines);
      };
      try {
        const callFn = bridgeCall || ((cmd, opts) => bridge.runCommand(cmd, opts));
        const result = await callFn(commandString, {
          onLog: recordLine,
          onProgress: (value2) => setActiveJobs((j) => j.map((job) => job.id === jobId ? { ...job, progress: value2 } : job)),
          // Prompts go to the single global dialog, whichever page is visible.
          onPrompt: (rawPrompt) => new Promise((resolve) => {
            setPrompt({ ...rawPrompt, resolve });
            if (originPage) setPendingPromptPage(originPage);
          }),
          onPromptClosed: () => {
            setPrompt((p) => {
              p?.resolve(null);
              return null;
            });
            setPendingPromptPage((current) => originPage && current === originPage ? null : current);
          }
        });
        const wasCancelled = result?.cancelled === true;
        const producedOutput = runProducedOutput(runLines);
        const isAnalysis = originPage === "single" || originPage === "overlay" || originPage === "termini" || originPage === "batch";
        setActiveJobs((j) => j.map((job) => job.id === jobId ? { ...job, status: wasCancelled ? "cancelled" : isAnalysis && !producedOutput ? "failed" : "complete", progress: 100 } : job));
        setTimeout(() => setActiveJobs((j) => j.filter((job) => job.id !== jobId)), 2500);
        if (!wasCancelled && producedOutput && !silent && (originPage === "single" || originPage === "overlay" || originPage === "termini")) {
          setCompletionPulse(Math.random());
        }
        return { ...result, produced: producedOutput, lines: runLines };
      } catch (e) {
        setActiveJobs((j) => j.map((job) => job.id === jobId ? { ...job, status: cancelRequestedRef.current ? "cancelled" : "failed" } : job));
        setTimeout(() => setActiveJobs((j) => j.filter((job) => job.id !== jobId)), 2500);
        if (e && e.message && !runLines.some((l) => l.text === e.message)) appendLog(e.message, "error");
        e.lines = runLines;
        throw e;
      } finally {
        if (!holdLock) {
          isBusyRef.current = false;
          setIsBusy(false);
        }
      }
    }, [bridge, appendLog, refreshEngineStatus]);
    useEffect(() => {
      if (!bridge || typeof bridge.on !== "function") return void 0;
      return bridge.on("log-line", ({ text, tone }) => {
        if (!isBusyRef.current) appendLog(text, tone);
      });
    }, [bridge, appendLog]);
    const acquireLock = useCallback(() => {
      if (isBusyRef.current) return null;
      isBusyRef.current = true;
      setIsBusy(true);
      cancelRequestedRef.current = false;
      holdLockGenerationRef.current += 1;
      return holdLockGenerationRef.current;
    }, []);
    const releaseLock = useCallback(() => {
      isBusyRef.current = false;
      setIsBusy(false);
      holdLockGenerationRef.current += 1;
    }, []);
    const sequenceCancelRef = useRef(false);
    const cancelRequestedRef = useRef(false);
    const sequenceActiveRef = useRef(false);
    const cancelRun = useCallback(async () => {
      sequenceCancelRef.current = true;
      cancelRequestedRef.current = true;
      setPrompt((p) => {
        if (p) p.resolve("n");
        return null;
      });
      setPendingPromptPage(null);
      const result = bridge.cancel ? await bridge.cancel() : { ok: false };
      if (!result.ok && sequenceActiveRef.current) {
        return { ok: true, note: "The queue will stop after the current step." };
      }
      return result;
    }, [bridge]);
    const answerPrompt = useCallback((answer) => {
      setPrompt((p) => {
        p?.resolve(answer);
        return null;
      });
      setPendingPromptPage(null);
    }, []);
    useEffect(() => {
      if (!prompt && pendingPromptPage && !isBusy) setPendingPromptPage(null);
    }, [prompt, pendingPromptPage, isBusy]);
    const value = {
      settings,
      updateSettings,
      history,
      addHistoryEntry,
      toggleFavorite,
      deleteHistoryEntry,
      clearHistory,
      quickViews,
      addQuickView,
      removeQuickView,
      consoleLog,
      appendLog,
      activeJobs,
      runAstraCommand,
      isBusy,
      acquireLock,
      releaseLock,
      cancelRun,
      cancelRequestedRef,
      sequenceCancelRef,
      sequenceActiveRef,
      bridge,
      isElectron,
      pendingStructureSeed,
      setPendingStructureSeed,
      pendingPromptPage,
      setPendingPromptPage,
      completionPulse,
      setCompletionPulse,
      selectedReportId,
      setSelectedReportId,
      selectedViewerId,
      setSelectedViewerId,
      sessionStartTime,
      engineInfo,
      refreshEngineStatus,
      switchEngine,
      rememberEngineVersion,
      prompt,
      answerPrompt,
      setupStatus,
      platform,
      homeDir,
      outputNotice,
      setOutputNotice
    };
    return /* @__PURE__ */ React.createElement(AppContext.Provider, { value }, children);
  }
  var NAV_ITEMS = [
    { id: "home", label: "Home", icon: "home" },
    { id: "single", label: "Single Structure", icon: "analysis" },
    { id: "overlay", label: "Overlay", icon: "overlay" },
    { id: "termini", label: "Termini", icon: "termini" },
    { id: "batch", label: "Batch", icon: "batch" },
    { id: "import", label: "Import Local", icon: "import" },
    { id: "reports", label: "Reports", icon: "reports" },
    { id: "viewer", label: "3D Viewer", icon: "viewer" },
    { id: "summary", label: "Summary", icon: "cube" },
    { id: "related", label: "Related Structures", icon: "related" },
    { id: "history", label: "History", icon: "history" }
  ];
  var NAV_BOTTOM = [
    { id: "settings", label: "Settings", icon: "settings" },
    { id: "console", label: "Advanced Console", icon: "console" },
    { id: "palette", label: "Color Palette", icon: "palette" },
    { id: "citation", label: "Citation & Docs", icon: "citation" }
  ];
  var CONNECTION_PROBE_HOST = "files.rcsb.org";
  var CONNECTION_PROBE_URL = `https://${CONNECTION_PROBE_HOST}/`;
  var CONNECTION_POLL_MS = 3e4;
  var CONNECTION_GOOD_MS = 1200;
  var CONNECTION_FAIR_MS = 4e3;
  var CONNECTION_TIMEOUT_MS = 9e3;
  var CONNECTION_STATES = {
    strong: { color: "var(--sage)", label: "Strong connection", detail: "Structure downloads should be quick." },
    medium: { color: "var(--amber)", label: "Moderate connection", detail: "Structure downloads may be slow." },
    weak: { color: "var(--coral)", label: "Weak connection", detail: "Structure downloads may time out." },
    offline: { color: "var(--text-2)", label: "No connection", detail: "Structures cannot be downloaded. Check that you are connected to a network." },
    unknown: { color: "var(--text-2)", label: "Checking connection", detail: "" }
  };
  function useConnectionQuality() {
    const [state, setState] = useState("unknown");
    const [latency, setLatency] = useState(null);
    const probeRef = useRef(null);
    useEffect(() => {
      let cancelled = false;
      const probe = async () => {
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          if (!cancelled) {
            setState("offline");
            setLatency(null);
          }
          return;
        }
        const started = Date.now();
        const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = setTimeout(() => controller?.abort(), CONNECTION_TIMEOUT_MS);
        try {
          await fetch(CONNECTION_PROBE_URL, { method: "HEAD", mode: "no-cors", cache: "no-store", signal: controller?.signal });
          const elapsed = Date.now() - started;
          if (cancelled) return;
          setLatency(elapsed);
          setState(elapsed <= CONNECTION_GOOD_MS ? "strong" : elapsed <= CONNECTION_FAIR_MS ? "medium" : "weak");
        } catch {
          if (!cancelled) {
            setState("offline");
            setLatency(null);
          }
        } finally {
          clearTimeout(timer);
        }
      };
      probeRef.current = probe;
      probe();
      const interval = setInterval(probe, CONNECTION_POLL_MS);
      const onChange = () => probe();
      window.addEventListener("online", onChange);
      window.addEventListener("offline", onChange);
      return () => {
        cancelled = true;
        clearInterval(interval);
        window.removeEventListener("online", onChange);
        window.removeEventListener("offline", onChange);
      };
    }, []);
    return { state, latency, refresh: probeRef.current || (() => {
    }) };
  }
  function SlowNetworkNotice({ active }) {
    const { state, latency } = useConnectionQuality();
    const slow = state === "medium" || state === "weak" || state === "offline";
    if (!active || !slow) return null;
    return /* @__PURE__ */ React.createElement("div", { style: {
      display: "flex",
      alignItems: "center",
      gap: 9,
      marginBottom: 12,
      padding: "9px 12px",
      borderRadius: "var(--radius-md)",
      background: "var(--amber-wash, rgba(217,164,65,0.12))",
      border: "1px solid var(--amber)",
      color: "var(--text-1)",
      fontSize: 11.5
    } }, /* @__PURE__ */ React.createElement(Spinner, { size: 13 }), /* @__PURE__ */ React.createElement("span", null, state === "offline" ? "No connection detected. Structure downloads will fail until it returns." : `Connection is slow${latency ? ` (${latency} ms)` : ""} . Downloading a structure may take a while. This will clear on its own.`));
  }
  function engineDotColor(engineInfo, engine) {
    if (!engineInfo.available) return "var(--text-2)";
    const works = !!engineInfo.available[engine];
    const failed = engine === engineInfo.engine && !!engineInfo.error;
    const located = engineInfo.configured ? !!engineInfo.configured[engine] : works;
    if (works && !failed) return "var(--sage)";
    if (located || failed) return "var(--amber)";
    return "var(--coral)";
  }
  function EngineDot({ engine }) {
    const { engineInfo } = useApp();
    return /* @__PURE__ */ React.createElement("span", { style: { display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: engineDotColor(engineInfo, engine), marginRight: 7, verticalAlign: "middle", flexShrink: 0 } });
  }
  function EngineIndicator({ onOpenSettings }) {
    const { engineInfo, switchEngine, isBusy } = useApp();
    const toast = useToast();
    const [open, setOpen] = useState(false);
    const [switching, setSwitching] = useState(false);
    const containerRef = useRef(null);
    useEffect(() => {
      if (!open) return void 0;
      const handler = (e) => {
        if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
      };
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, [open]);
    const labelOf = (engine) => {
      const v = engineInfo.versions?.[engine];
      return `${ENGINE_NAMES[engine]}${v ? ` v${v}` : ""}`;
    };
    const label = engineInfo.none ? "No engine" : labelOf(engineInfo.engine);
    const color = engineInfo.none ? "var(--coral)" : engineDotColor(engineInfo, engineInfo.engine);
    const state = engineInfo.none ? "neither PyMOL nor ChimeraX was found" : engineInfo.error ? "could not start" : engineInfo.running ? "running" : "starts with the first analysis";
    const choose = async (engine) => {
      setSwitching(true);
      try {
        await switchEngine(engine);
        setOpen(false);
      } catch (e) {
        toast.push({ tone: "error", title: "Engine not switched", message: e.message });
      } finally {
        setSwitching(false);
      }
    };
    return /* @__PURE__ */ React.createElement("div", { ref: containerRef, style: { position: "relative" } }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setOpen((o) => !o),
        "aria-label": `Analysis engine: ${label}, ${state}`,
        "aria-expanded": open,
        style: {
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          padding: "4px 8px 4px 10px",
          background: "var(--bg-1)",
          border: "1px solid var(--line-0)",
          borderRadius: 999,
          fontSize: 11.5,
          fontWeight: 600,
          color: "var(--text-1)",
          cursor: "pointer",
          fontFamily: "var(--font-ui)",
          whiteSpace: "nowrap"
        }
      },
      /* @__PURE__ */ React.createElement("span", { style: { width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 } }),
      label,
      /* @__PURE__ */ React.createElement(Icon, { name: "chevronDown", size: 11 })
    ), open && /* @__PURE__ */ React.createElement("div", { className: "astra-modal-in", style: {
      position: "absolute",
      top: "calc(100% + 8px)",
      right: 0,
      width: 250,
      background: "var(--bg-2)",
      border: "1px solid var(--line-1)",
      borderRadius: "var(--radius-md)",
      padding: 12,
      boxShadow: "var(--shadow-lg)",
      zIndex: 300
    } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5, fontWeight: 700, marginBottom: 8 } }, "Analysis engine"), ["pymol", "chimerax", "astra3"].map((engine) => {
      const installed = engineInfo.available ? !!engineInfo.available[engine] : engine === engineInfo.engine;
      const inUse = !engineInfo.none && engine === engineInfo.engine;
      const canSwitch = installed && !inUse && !isBusy && !switching;
      return /* @__PURE__ */ React.createElement(
        "button",
        {
          key: engine,
          onClick: () => {
            if (canSwitch) choose(engine);
          },
          disabled: !canSwitch,
          style: {
            display: "flex",
            width: "100%",
            alignItems: "center",
            gap: 8,
            padding: "7px 8px",
            marginBottom: 3,
            border: `1px solid ${inUse ? "var(--accent)" : "var(--line-0)"}`,
            borderRadius: "var(--radius-sm)",
            background: inUse ? "var(--bg-1)" : "transparent",
            color: "var(--text-0)",
            cursor: canSwitch ? "pointer" : "default",
            textAlign: "left",
            fontFamily: "var(--font-ui)"
          }
        },
        /* @__PURE__ */ React.createElement("span", { style: { width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: engineDotColor(engineInfo, engine) } }),
        /* @__PURE__ */ React.createElement("span", { style: { flex: 1, fontSize: 12, fontWeight: 600 } }, labelOf(engine)),
        /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: inUse ? "var(--accent)" : "var(--text-2)" } }, inUse ? "In use" : !installed ? "Not set up" : switching ? "" : isBusy ? "" : "Switch")
      );
    }), isBusy && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--text-2)", marginTop: 4 } }, "Finish or cancel the current run to switch."), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          setOpen(false);
          if (onOpenSettings) onOpenSettings();
        },
        style: { marginTop: 8, background: "none", border: "none", padding: 0, color: "var(--accent)", fontSize: 11.5, cursor: "pointer", fontFamily: "var(--font-ui)" }
      },
      "Engine settings"
    )));
  }
  function ConnectionIndicator() {
    const { state, latency, refresh } = useConnectionQuality();
    const [expanded, setExpanded] = useState(false);
    const containerRef = useRef(null);
    const meta = CONNECTION_STATES[state] || CONNECTION_STATES.unknown;
    const offline = state === "offline";
    useEffect(() => {
      if (!expanded) return;
      const handler = (e) => {
        if (containerRef.current && !containerRef.current.contains(e.target)) setExpanded(false);
      };
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, [expanded]);
    const dot = /* @__PURE__ */ React.createElement("span", { style: { position: "relative", display: "inline-flex", width: 15, height: 15, alignItems: "center", justifyContent: "center" } }, /* @__PURE__ */ React.createElement(Icon, { name: "wifi", size: 15 }), offline && // A slash as well as the muted colour, so "no connection" reads
    // without depending on colour alone.
    /* @__PURE__ */ React.createElement("span", { style: {
      position: "absolute",
      left: 1,
      top: 7,
      width: 14,
      height: 1.5,
      background: "var(--text-2)",
      transform: "rotate(-45deg)",
      borderRadius: 1
    } }));
    return /* @__PURE__ */ React.createElement("div", { ref: containerRef, style: { display: "flex", alignItems: "center", position: "relative" } }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          if (!expanded) refresh();
          setExpanded((v) => !v);
        },
        title: "Network connection",
        style: {
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 6,
          display: "flex",
          alignItems: "center",
          color: offline ? "var(--text-2)" : meta.color,
          opacity: state === "unknown" ? 0.5 : 1
        }
      },
      dot
    ), expanded && /* @__PURE__ */ React.createElement("div", { style: {
      position: "absolute",
      top: "calc(100% + 6px)",
      right: 0,
      zIndex: 60,
      width: 250,
      background: "var(--bg-1)",
      border: "1px solid var(--line-1)",
      borderRadius: "var(--radius-md)",
      padding: 12,
      boxShadow: "var(--shadow-md, 0 8px 24px rgba(0,0,0,0.28))"
    } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { color: offline ? "var(--text-2)" : meta.color, display: "flex" } }, dot), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12.5, fontWeight: 600, color: "var(--text-0)" } }, meta.label)), latency !== null && /* @__PURE__ */ React.createElement("div", { className: "mono", style: { fontSize: 11, color: "var(--text-1)", marginBottom: 6 } }, latency, " ms to ", CONNECTION_PROBE_HOST), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--text-2)", lineHeight: 1.5 } }, meta.detail), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: refresh,
        style: {
          marginTop: 10,
          width: "100%",
          padding: "5px 0",
          fontSize: 11,
          cursor: "pointer",
          background: "none",
          border: "1px solid var(--line-1)",
          borderRadius: "var(--radius-sm)",
          color: "var(--text-1)"
        }
      },
      "Check again"
    )));
  }
  function NavRail({ page, setPage, collapsed, setCollapsed }) {
    const { activeJobs, isBusy, pendingPromptPage } = useApp();
    const runningPageId = useMemo(() => {
      const job = activeJobs.find((j) => j.status === "running");
      if (!job) return null;
      const cmd = job.command.toUpperCase();
      if (cmd.startsWith("OVERLAY")) return "overlay";
      if (cmd.startsWith("TERMINI")) return "termini";
      if (cmd.startsWith("AST-")) return "import";
      return null;
    }, [activeJobs]);
    return /* @__PURE__ */ React.createElement("div", { style: {
      width: collapsed ? 60 : 210,
      flexShrink: 0,
      background: "var(--bg-1)",
      borderRight: "1px solid var(--line-0)",
      display: "flex",
      flexDirection: "column",
      transition: "width 160ms ease",
      overflow: "hidden"
    } }, /* @__PURE__ */ React.createElement("div", { style: { height: 22, flexShrink: 0, WebkitAppRegion: "drag" } }), /* @__PURE__ */ React.createElement("div", { style: { padding: collapsed ? "18px 0" : "18px 16px", display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between", WebkitAppRegion: "drag" } }, /* @__PURE__ */ React.createElement("div", { onClick: () => setPage("home"), style: { cursor: "pointer", WebkitAppRegion: "no-drag" } }, collapsed ? /* @__PURE__ */ React.createElement(AstraLogo, { size: 30 }) : /* @__PURE__ */ React.createElement(AstraWordmark, null))), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, overflowY: "auto", padding: "6px 8px" } }, NAV_ITEMS.map((item) => /* @__PURE__ */ React.createElement(
      NavButton,
      {
        key: item.id,
        item,
        active: page === item.id,
        onClick: () => setPage(item.id),
        collapsed,
        running: isBusy && (runningPageId === item.id || item.id === "console" && !runningPageId),
        pendingPrompt: pendingPromptPage === item.id
      }
    ))), /* @__PURE__ */ React.createElement("div", { style: { padding: "8px", borderTop: "1px solid var(--line-0)" } }, NAV_BOTTOM.map((item) => /* @__PURE__ */ React.createElement(
      NavButton,
      {
        key: item.id,
        item,
        active: page === item.id,
        onClick: () => setPage(item.id),
        collapsed,
        running: isBusy && (runningPageId === item.id || item.id === "console" && !runningPageId),
        pendingPrompt: pendingPromptPage === item.id
      }
    )), /* @__PURE__ */ React.createElement(
      NavButton,
      {
        item: { id: "collapse", label: collapsed ? "Expand" : "Collapse", icon: "chevronRight" },
        active: false,
        onClick: () => setCollapsed(!collapsed),
        collapsed,
        iconStyle: { transform: collapsed ? "none" : "rotate(180deg)" }
      }
    )));
  }
  function NavButton({ item, active, onClick, collapsed, badge, iconStyle, running, pendingPrompt }) {
    return /* @__PURE__ */ React.createElement(Tooltip, { block: true, placement: "right", text: collapsed ? item.label : pendingPrompt ? "Needs your input" : "" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick,
        className: `astra-nav-btn ${pendingPrompt ? "astra-nav-btn-alert" : ""}`,
        style: {
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 11,
          padding: collapsed ? "9px 0" : "9px 11px",
          marginBottom: 2,
          justifyContent: collapsed ? "center" : "flex-start",
          background: pendingPrompt ? "var(--coral-wash)" : active ? "var(--accent-wash)" : "transparent",
          color: pendingPrompt ? "var(--coral)" : active ? "var(--accent-bright)" : "var(--text-1)",
          border: pendingPrompt ? "1px solid var(--coral)" : "1px solid transparent",
          borderRadius: "var(--radius-md)",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 500,
          transition: "all 120ms ease",
          position: "relative"
        }
      },
      /* @__PURE__ */ React.createElement("span", { style: { display: "flex", flexShrink: 0, ...iconStyle } }, /* @__PURE__ */ React.createElement(Icon, { name: pendingPrompt ? "alertTriangle" : item.icon, size: 16 })),
      !collapsed && /* @__PURE__ */ React.createElement("span", { style: { flex: 1, minWidth: 0, textAlign: "left", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, item.label),
      !collapsed && pendingPrompt && /* @__PURE__ */ React.createElement("span", { className: "astra-nav-alert-dot", style: { width: 7, height: 7, borderRadius: "50%", background: "var(--coral)", flexShrink: 0 } }),
      !collapsed && !pendingPrompt && running && /* @__PURE__ */ React.createElement(Spinner, { size: 12 }),
      !collapsed && !pendingPrompt && badge && /* @__PURE__ */ React.createElement(Badge, { tone: "amber" }, badge),
      collapsed && pendingPrompt && /* @__PURE__ */ React.createElement("span", { className: "astra-nav-alert-dot", style: { position: "absolute", top: 6, right: 12, width: 7, height: 7, borderRadius: "50%", background: "var(--coral)", boxShadow: "0 0 0 2px var(--bg-1)" } }),
      collapsed && !pendingPrompt && (running || badge) && /* @__PURE__ */ React.createElement("span", { style: { position: "absolute", top: 4, right: 10, width: 7, height: 7, borderRadius: "50%", background: running ? "var(--accent)" : "var(--amber)" }, className: running ? "astra-cursor-blink" : "" })
    ));
  }
  var KEYBOARD_SHORTCUTS = [
    { keys: "\u2318 1\u20139", desc: "Jump to a sidebar page" },
    { keys: "\u2318 Enter", desc: "Run the current form / console command" },
    { keys: "\u2191 / \u2193", desc: "Advanced Console: cycle command history" },
    { keys: "\u2318 F", desc: "Find in the Advanced Console, Related Structures or README" },
    { keys: "Esc", desc: "Dismiss a prompt or popover" },
    { keys: "\u2318 =", desc: "Zoom in" },
    { keys: "\u2318 \u2212", desc: "Zoom out" },
    { keys: "\u2318 0", desc: "Reset zoom to 100%" }
  ];
  function KeyboardShortcutsPanel({ onClose }) {
    return /* @__PURE__ */ React.createElement("div", { className: "astra-modal-in", style: {
      position: "absolute",
      top: "calc(100% + 8px)",
      right: 0,
      width: 280,
      background: "var(--bg-2)",
      border: "1px solid var(--line-1)",
      borderRadius: "var(--radius-md)",
      padding: 14,
      boxShadow: "var(--shadow-lg)",
      zIndex: 300
    } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5, fontWeight: 700, marginBottom: 10 } }, "Keyboard shortcuts"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, KEYBOARD_SHORTCUTS.map((s) => /* @__PURE__ */ React.createElement("div", { key: s.keys, style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11.5, color: "var(--text-1)" } }, s.desc), /* @__PURE__ */ React.createElement("span", { className: "mono", style: { fontSize: 11, background: "var(--bg-0)", border: "1px solid var(--line-1)", borderRadius: 4, padding: "2px 6px", flexShrink: 0 } }, s.keys)))));
  }
  function NotificationsPanel({ onClose }) {
    const { history } = useApp();
    const recent = history.slice(0, 6);
    return /* @__PURE__ */ React.createElement("div", { className: "astra-modal-in", style: {
      position: "absolute",
      top: "calc(100% + 8px)",
      right: 0,
      width: 300,
      background: "var(--bg-2)",
      border: "1px solid var(--line-1)",
      borderRadius: "var(--radius-md)",
      padding: 14,
      boxShadow: "var(--shadow-lg)",
      zIndex: 300
    } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5, fontWeight: 700, marginBottom: 10 } }, "Recent activity"), recent.length === 0 ? /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--text-1)" } }, "Nothing yet. Completed and failed runs will show up here.") : /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, recent.map((h) => /* @__PURE__ */ React.createElement("div", { key: h.id, style: { display: "flex", alignItems: "center", gap: 8 } }, /* @__PURE__ */ React.createElement("span", { style: { width: 6, height: 6, borderRadius: "50%", background: h.status === "complete" ? "var(--sage)" : h.status === "failed" ? "var(--coral)" : "var(--amber)", flexShrink: 0 } }), /* @__PURE__ */ React.createElement("span", { className: "mono", style: { fontSize: 11.5, fontWeight: 600, flex: 1 } }, h.label), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10.5, color: "var(--text-2)" } }, timeAgo(h.timestamp))))));
  }
  function ZoomControl({ zoomFactor, zoomIn, zoomOut, zoomReset }) {
    const [expanded, setExpanded] = useState(false);
    const containerRef = useRef(null);
    useEffect(() => {
      if (!expanded) return;
      const handler = (e) => {
        if (containerRef.current && !containerRef.current.contains(e.target)) setExpanded(false);
      };
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, [expanded]);
    return /* @__PURE__ */ React.createElement("div", { ref: containerRef, style: { display: "flex", alignItems: "center" } }, expanded ? /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 2, border: "1px solid var(--line-1)", borderRadius: "var(--radius-md)", padding: 2 } }, /* @__PURE__ */ React.createElement(Tooltip, { text: "Zoom out (Ctrl/Cmd -)", align: "right", placement: "bottom" }, /* @__PURE__ */ React.createElement(IconButton, { name: "minus", onClick: zoomOut })), /* @__PURE__ */ React.createElement(Tooltip, { text: "Reset zoom (Ctrl/Cmd 0)", align: "right", placement: "bottom" }, /* @__PURE__ */ React.createElement("button", { onClick: zoomReset, style: { background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--text-1)", padding: "0 4px", fontFamily: "var(--font-mono)", minWidth: 34 } }, Math.round((zoomFactor || 1) * 100), "%")), /* @__PURE__ */ React.createElement(Tooltip, { text: "Zoom in (Ctrl/Cmd =)", align: "right", placement: "bottom" }, /* @__PURE__ */ React.createElement(IconButton, { name: "plus", onClick: zoomIn })), /* @__PURE__ */ React.createElement(Tooltip, { text: "Collapse zoom controls", align: "right", placement: "bottom" }, /* @__PURE__ */ React.createElement(IconButton, { name: "search", active: true, onClick: () => setExpanded(false) }))) : /* @__PURE__ */ React.createElement(Tooltip, { text: "Zoom controls", align: "right", placement: "bottom" }, /* @__PURE__ */ React.createElement(IconButton, { name: "search", onClick: () => setExpanded(true) })));
  }
  function TopBar({ page, setPage, zoomFactor, zoomIn, zoomOut, zoomReset }) {
    const { activeJobs, isBusy, cancelRun } = useApp();
    const toast = useToast();
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [edgeHover, setEdgeHover] = useState(false);
    useEffect(() => {
      if (!window.astra3Native?.onFullScreenChange) return;
      window.astra3Native.isFullScreen?.().then(setIsFullScreen).catch(() => {
      });
      return window.astra3Native.onFullScreenChange(setIsFullScreen);
    }, []);
    useEffect(() => {
      if (!isFullScreen) {
        setEdgeHover(false);
        return;
      }
      const onMove = (e) => setEdgeHover(e.clientY <= (edgeHoverRef.current ? 56 : 4));
      window.addEventListener("pointermove", onMove);
      return () => window.removeEventListener("pointermove", onMove);
    }, [isFullScreen]);
    const edgeHoverRef = useRef(false);
    edgeHoverRef.current = edgeHover;
    const hidden = isFullScreen && !edgeHover;
    const pageTitle = [...NAV_ITEMS, ...NAV_BOTTOM].find((n) => n.id === page)?.label || "Astra3";
    const [openPanel, setOpenPanel] = useState(null);
    const [cancelling, setCancelling] = useState(false);
    useEffect(() => {
      if (!openPanel) return;
      const onKey = (e) => {
        if (e.key === "Escape") setOpenPanel(null);
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [openPanel]);
    useEffect(() => {
      if (!isBusy) setCancelling(false);
    }, [isBusy]);
    const handleCancel = async () => {
      setCancelling(true);
      const result = await cancelRun();
      if (result?.ok) {
        toast.push({ tone: "neutral", title: "Cancelling", message: result.note || "Stopping the current analysis." });
      } else if (result?.error) {
        toast.push({ tone: "error", title: "Could not cancel", message: result.error });
        setCancelling(false);
      }
    };
    return /* @__PURE__ */ React.createElement("div", { style: {
      height: 52,
      flexShrink: 0,
      borderBottom: "1px solid var(--line-0)",
      background: "var(--bg-0)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      // Extra right padding leaves room for the native minimise/maximise/
      // close buttons, which now sit over the app's own top bar. Without it
      // the zoom and notification controls would end up underneath them.
      padding: "0 20px",
      position: isFullScreen ? "absolute" : "relative",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 40,
      transform: hidden ? "translateY(-100%)" : "translateY(0)",
      transition: "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
      // The bar doubles as the window's drag handle now that the system
      // titlebar is hidden. Interactive children opt back out below.
      WebkitAppRegion: "drag"
    } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 14.5, fontWeight: 600 } }, pageTitle), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 14, WebkitAppRegion: "no-drag" } }, activeJobs.length > 0 && (() => {
      const runningCount = activeJobs.filter((j) => j.status === "running").length;
      if (runningCount > 0) {
        return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-1)" } }, /* @__PURE__ */ React.createElement(Spinner, { size: 13 }), runningCount, " job", runningCount > 1 ? "s" : "", " running");
      }
      const anyCancelled = activeJobs.some((j) => j.status === "cancelled");
      const anyFailed = activeJobs.some((j) => j.status === "failed");
      return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: anyCancelled ? "var(--amber)" : anyFailed ? "var(--coral)" : "var(--sage)" } }, /* @__PURE__ */ React.createElement(Icon, { name: anyCancelled || anyFailed ? "alertTriangle" : "check", size: 13 }), anyCancelled ? "Job cancelled" : anyFailed ? "Job failed" : activeJobs.length > 1 ? "All jobs complete" : "Job complete");
    })(), isBusy && /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: handleCancel,
        disabled: cancelling,
        title: "Cancel the currently running Astra3 command",
        style: {
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          fontSize: 12.5,
          fontWeight: 700,
          fontFamily: "var(--font-ui)",
          border: "1px solid var(--coral)",
          borderRadius: "var(--radius-md)",
          background: "var(--coral)",
          color: "#fff",
          cursor: cancelling ? "not-allowed" : "pointer",
          opacity: cancelling ? 0.6 : 1
        }
      },
      cancelling ? /* @__PURE__ */ React.createElement(Spinner, { size: 12 }) : /* @__PURE__ */ React.createElement(Icon, { name: "x", size: 13 }),
      cancelling ? "Cancelling\u2026" : "Cancel"
    ), /* @__PURE__ */ React.createElement(EngineIndicator, { onOpenSettings: () => setPage && setPage("settings") }), /* @__PURE__ */ React.createElement(ConnectionIndicator, null), zoomIn && /* @__PURE__ */ React.createElement(ZoomControl, { zoomFactor, zoomIn, zoomOut, zoomReset }), /* @__PURE__ */ React.createElement("div", { style: { position: "relative" } }, /* @__PURE__ */ React.createElement(Tooltip, { text: openPanel ? "" : "Keyboard shortcuts", align: "right", placement: "bottom" }, /* @__PURE__ */ React.createElement(IconButton, { name: "keyboard", active: openPanel === "keys", onClick: () => setOpenPanel(openPanel === "keys" ? null : "keys") })), openPanel === "keys" && /* @__PURE__ */ React.createElement(KeyboardShortcutsPanel, null)), /* @__PURE__ */ React.createElement("div", { style: { position: "relative" } }, /* @__PURE__ */ React.createElement(Tooltip, { text: openPanel ? "" : "Notifications", align: "right", placement: "bottom" }, /* @__PURE__ */ React.createElement(IconButton, { name: "bell", active: openPanel === "notifications", onClick: () => setOpenPanel(openPanel === "notifications" ? null : "notifications") })), openPanel === "notifications" && /* @__PURE__ */ React.createElement(NotificationsPanel, null)), openPanel && /* @__PURE__ */ React.createElement("div", { onClick: () => setOpenPanel(null), style: { position: "fixed", inset: 0, zIndex: 250 } })));
  }
  function DropZone({ onFiles, accept = ".pdb,.ent,.cif,.mmcif,.pse,.gz", compact = false }) {
    const [dragOver, setDragOver] = useState(false);
    const inputRef = useRef(null);
    const resolveFiles = (rawFiles) => {
      const hasPathResolver = typeof window !== "undefined" && window.astra3Native?.getPathForFile;
      return rawFiles.map((f) => ({
        // A compressed coordinate file (1abc.cif.gz) is described by the
        // format inside it.
        name: f.name,
        size: f.size,
        ext: f.name.toLowerCase().replace(/\.gz$/, "").split(".").pop(),
        path: hasPathResolver ? window.astra3Native.getPathForFile(f) : null,
        file: f
        // raw File object kept too, for any consumer (e.g. Batch's .txt reader) that still wants to read its contents directly rather than go through a filesystem path
      }));
    };
    const handleDrop = (e) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files || []);
      if (files.length) onFiles(resolveFiles(files));
    };
    return /* @__PURE__ */ React.createElement(
      "div",
      {
        onDragOver: (e) => {
          e.preventDefault();
          setDragOver(true);
        },
        onDragLeave: () => setDragOver(false),
        onDrop: handleDrop,
        onClick: () => inputRef.current?.click(),
        style: {
          border: `1.5px dashed ${dragOver ? "var(--accent)" : "var(--line-1)"}`,
          borderRadius: "var(--radius-lg)",
          padding: compact ? "22px 16px" : "38px 20px",
          background: dragOver ? "var(--accent-wash)" : "var(--bg-1)",
          textAlign: "center",
          cursor: "pointer",
          transition: "all 150ms ease"
        }
      },
      /* @__PURE__ */ React.createElement(
        "input",
        {
          ref: inputRef,
          type: "file",
          multiple: true,
          accept,
          style: { display: "none" },
          onChange: (e) => {
            const f = Array.from(e.target.files || []);
            if (f.length) onFiles(resolveFiles(f));
          }
        }
      ),
      /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "center", marginBottom: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { width: 42, height: 42, borderRadius: 12, background: "var(--bg-2)", display: "flex", alignItems: "center", justifyContent: "center", color: dragOver ? "var(--accent)" : "var(--text-1)" } }, /* @__PURE__ */ React.createElement(Icon, { name: "upload", size: 20 }))),
      /* @__PURE__ */ React.createElement("div", { style: { fontSize: compact ? 12.5 : 13.5, fontWeight: 600, marginBottom: 3 } }, dragOver ? "Drop to import" : "Drag and drop structures here"),
      /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--text-1)" } }, accept.includes(".pse") ? ".pdb, .cif / .mmcif or .pse (also .gz) \xB7 or click to browse" : `${accept.split(",").join(", ")} \xB7 or click to browse`)
    );
  }
  function HomePage({ setPage, openQuickAnalyze }) {
    const { history, toggleFavorite } = useApp();
    const toast = useToast();
    const recent = history.slice(0, 5);
    const handleFiles = (files) => {
      toast.push({ tone: "neutral", title: "Opening Import page", message: `Drop ${files.length} file(s) there to import ${files.length === 1 ? "it" : "them"}.` });
      setPage("import");
    };
    return /* @__PURE__ */ React.createElement(PageScroll, null, /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 1040, margin: "0 auto", padding: "48px 32px 60px" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 22, marginBottom: 40 } }, /* @__PURE__ */ React.createElement(AstraLogo, { size: 64, animated: true }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em" } }, "Astra3"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13.5, color: "var(--text-1)", marginTop: 2 } }, "Structural Analysis Toolkit for PDB Rendering Automation"))), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 } }, /* @__PURE__ */ React.createElement(QuickAction, { icon: "analysis", title: "Fetch by ID", desc: "Analyze a PDB or mmCIF entry", onClick: () => setPage("single") }), /* @__PURE__ */ React.createElement(QuickAction, { icon: "overlay", title: "Overlay", desc: "Align & compare structures", onClick: () => setPage("overlay") }), /* @__PURE__ */ React.createElement(QuickAction, { icon: "termini", title: "Termini", desc: "Compare N-/C-termini", onClick: () => setPage("termini") }), /* @__PURE__ */ React.createElement(QuickAction, { icon: "batch", title: "Batch", desc: "Process a queue of IDs", onClick: () => setPage("batch") })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(SectionLabel, null, "Import a local structure"), /* @__PURE__ */ React.createElement(DropZone, { onFiles: handleFiles })), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 32 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 } }, /* @__PURE__ */ React.createElement(SectionLabel, { style: { marginBottom: 0 } }, "Recent analyses"), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", onClick: () => setPage("history") }, "View all", /* @__PURE__ */ React.createElement(Icon, { name: "chevronRight", size: 13 }))), recent.length === 0 ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "clock", title: "No analyses yet", description: "Structures you analyze will show up here for quick access." }) : /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } }, recent.map((h) => /* @__PURE__ */ React.createElement(HistoryRow, { key: h.id, entry: h, onToggleFavorite: () => toggleFavorite(h.id), setPage, compact: true }))))), /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 900, margin: "36px auto 0", padding: "0 32px" } }, /* @__PURE__ */ React.createElement(CitationBlock, null)));
  }
  function CitationBlock() {
    const [copied, setCopied] = useState(false);
    const citationText = "Aguirre, A. (2026). Astra3: Structural Analysis Toolkit for PDB Rendering Automation [Computer software]. Version 2.0.3. https://github.com/andre-aguirre/Astra3, https://doi.org/10.5281/zenodo.22928159";
    const copyCitation = () => {
      const write = window.astra3Native?.copyText ? window.astra3Native.copyText(citationText) : navigator.clipboard?.writeText(citationText).then(() => true);
      Promise.resolve(write).then((ok) => {
        if (!ok) return;
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }).catch(() => {
      });
    };
    return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, background: "var(--bg-1)", border: "1px solid var(--line-0)", borderRadius: "var(--radius-md)", padding: "10px 12px" } }, /* @__PURE__ */ React.createElement(Icon, { name: "citation", size: 16, style: { color: "var(--text-2)", flexShrink: 0 } }), /* @__PURE__ */ React.createElement("span", { className: "mono", style: { flex: 1, fontSize: 11.5, color: "var(--text-1)", wordBreak: "break-word" } }, "Aguirre, A. (2026). Astra3: Structural Analysis Toolkit for PDB Rendering Automation [Computer software]. Version 2.0.3.", " ", /* @__PURE__ */ React.createElement("a", { href: "https://github.com/andre-aguirre/Astra3", target: "_blank", rel: "noreferrer", style: { color: "var(--accent)", textDecoration: "none" } }, "github.com/andre-aguirre/Astra3"), ",", " ", /* @__PURE__ */ React.createElement("a", { href: "https://doi.org/10.5281/zenodo.22928159", target: "_blank", rel: "noreferrer", style: { color: "var(--accent)", textDecoration: "none" } }, "doi.org/10.5281/zenodo.22928159")), /* @__PURE__ */ React.createElement(
      Button,
      {
        variant: "secondary",
        size: "sm",
        icon: copied ? "check" : "copy",
        onClick: copyCitation,
        className: "astra-citation-btn",
        style: { flexShrink: 0 }
      },
      copied ? "Copied" : "Copy citation"
    ));
  }
  function renderMarkdownLite(md) {
    const lines = md.split("\n");
    const blocks = [];
    let i = 0;
    const renderInline = (text) => {
      const parts = [];
      let rest = text;
      const re = /(\*\*(.+?)\*\*|`(.+?)`|\[(.+?)\]\((.+?)\))/;
      let key = 0;
      while (rest.length) {
        const m = re.exec(rest);
        if (!m) {
          parts.push(rest);
          break;
        }
        if (m.index > 0) parts.push(rest.slice(0, m.index));
        if (m[2] !== void 0) parts.push(/* @__PURE__ */ React.createElement("strong", { key: key++ }, m[2]));
        else if (m[3] !== void 0) parts.push(/* @__PURE__ */ React.createElement("code", { key: key++, className: "mono", style: { background: "var(--bg-2)", padding: "1px 5px", borderRadius: 4, fontSize: "0.92em" } }, m[3]));
        else if (m[4] !== void 0) parts.push(/* @__PURE__ */ React.createElement("a", { key: key++, href: m[5], target: "_blank", rel: "noreferrer", style: { color: "var(--accent)" } }, m[4]));
        rest = rest.slice(m.index + m[0].length);
      }
      return parts;
    };
    while (i < lines.length) {
      const line = lines[i];
      if (line.startsWith("```")) {
        const codeLines = [];
        i++;
        while (i < lines.length && !lines[i].startsWith("```")) {
          codeLines.push(lines[i]);
          i++;
        }
        i++;
        blocks.push(/* @__PURE__ */ React.createElement("pre", { key: blocks.length, className: "mono", style: { background: "var(--bg-2)", padding: 12, borderRadius: "var(--radius-md)", overflowX: "auto", fontSize: 12, lineHeight: 1.6 } }, codeLines.join("\n")));
        continue;
      }
      if (/^#{1,3}\s/.test(line)) {
        const level = line.match(/^#+/)[0].length;
        const text = line.replace(/^#+\s*/, "");
        const Tag = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
        blocks.push(/* @__PURE__ */ React.createElement(Tag, { key: blocks.length, style: { marginTop: level === 1 ? 4 : 22, marginBottom: 8, fontWeight: 700, fontSize: level === 1 ? 20 : level === 2 ? 16 : 14 } }, renderInline(text)));
        i++;
        continue;
      }
      if (/^---+$/.test(line.trim())) {
        blocks.push(/* @__PURE__ */ React.createElement("hr", { key: blocks.length, style: { border: "none", borderTop: "1px solid var(--line-0)", margin: "18px 0" } }));
        i++;
        continue;
      }
      if (/^\s*[-*]\s/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*[-*]\s/.test(lines[i])) {
          let item = lines[i].replace(/^\s*[-*]\s/, "");
          i++;
          while (i < lines.length && lines[i].trim() && !/^\s*[-*]\s/.test(lines[i]) && !/^#{1,3}\s/.test(lines[i]) && !/^---+$/.test(lines[i].trim()) && !lines[i].startsWith("```") && !/^\|.*\|\s*$/.test(lines[i])) {
            item += " " + lines[i].trim();
            i++;
          }
          items.push(item);
        }
        blocks.push(/* @__PURE__ */ React.createElement("ul", { key: blocks.length, style: { margin: "6px 0", paddingLeft: 20 } }, items.map((it, idx) => /* @__PURE__ */ React.createElement("li", { key: idx, style: { marginBottom: 3, fontSize: 13, lineHeight: 1.6 } }, renderInline(it)))));
        continue;
      }
      if (/^\s*\d+\.\s/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) {
          let item = lines[i].replace(/^\s*\d+\.\s/, "");
          i++;
          while (i < lines.length && lines[i].trim() && !/^\s*(\d+\.|[-*])\s/.test(lines[i]) && !/^#{1,3}\s/.test(lines[i]) && !lines[i].startsWith("```")) {
            item += " " + lines[i].trim();
            i++;
          }
          items.push(item);
        }
        blocks.push(/* @__PURE__ */ React.createElement("ol", { key: blocks.length, style: { margin: "6px 0", paddingLeft: 22 } }, items.map((it, idx) => /* @__PURE__ */ React.createElement("li", { key: idx, style: { marginBottom: 3, fontSize: 13, lineHeight: 1.6 } }, renderInline(it)))));
        continue;
      }
      if (/^>/.test(line)) {
        const paras = [[]];
        while (i < lines.length && /^>/.test(lines[i])) {
          const text = lines[i].replace(/^>\s?/, "");
          if (text.trim()) paras[paras.length - 1].push(text.trim());
          else paras.push([]);
          i++;
        }
        blocks.push(/* @__PURE__ */ React.createElement("blockquote", { key: blocks.length, style: { margin: "8px 0", padding: "2px 0 2px 14px", borderLeft: "3px solid var(--line-1)" } }, paras.filter((pl) => pl.length).map((pl, idx) => /* @__PURE__ */ React.createElement("p", { key: idx, style: { margin: "4px 0", fontSize: 13, lineHeight: 1.6, color: "var(--text-1)" } }, renderInline(pl.join(" "))))));
        continue;
      }
      if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
        const splitRow = (row) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
        const headerCells = splitRow(line);
        i += 2;
        const rows = [];
        while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) {
          rows.push(splitRow(lines[i]));
          i++;
        }
        blocks.push(
          /* @__PURE__ */ React.createElement("div", { key: blocks.length, style: { overflowX: "auto", margin: "10px 0" } }, /* @__PURE__ */ React.createElement("table", { style: { borderCollapse: "collapse", width: "100%", fontSize: 12.5 } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, headerCells.map((c, ci) => /* @__PURE__ */ React.createElement("th", { key: ci, style: { textAlign: "left", padding: "6px 10px", borderBottom: "1.5px solid var(--line-1)", color: "var(--text-0)", fontWeight: 700 } }, renderInline(c))))), /* @__PURE__ */ React.createElement("tbody", null, rows.map((r, ri) => /* @__PURE__ */ React.createElement("tr", { key: ri }, r.map((c, ci) => /* @__PURE__ */ React.createElement("td", { key: ci, style: { padding: "6px 10px", borderBottom: "1px solid var(--line-0)", color: "var(--text-1)", verticalAlign: "top" } }, renderInline(c))))))))
        );
        continue;
      }
      if (line.trim() === "") {
        i++;
        continue;
      }
      const paraLines = [];
      while (i < lines.length && lines[i].trim() !== "" && !/^#{1,3}\s/.test(lines[i]) && !lines[i].startsWith("```") && !/^\s*([-*]|\d+\.)\s/.test(lines[i]) && !/^>/.test(lines[i]) && !/^---+$/.test(lines[i].trim())) {
        paraLines.push(lines[i]);
        i++;
      }
      blocks.push(/* @__PURE__ */ React.createElement("p", { key: blocks.length, style: { margin: "6px 0", fontSize: 13, lineHeight: 1.7, color: "var(--text-1)" } }, renderInline(paraLines.join(" "))));
    }
    return blocks;
  }
  var FIND_HIT_CLASS = "astra-find-hit";
  var FIND_CURRENT_CLASS = "astra-find-hit-current";
  function clearFindHighlights(root2) {
    if (!root2) return;
    for (const mark of Array.from(root2.querySelectorAll("mark." + FIND_HIT_CLASS))) {
      const parent = mark.parentNode;
      if (!parent) continue;
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parent.normalize();
    }
    const overlay = root2.querySelector(".astra-find-arrows");
    if (overlay) overlay.remove();
  }
  function highlightFindMatches(root2, text) {
    clearFindHighlights(root2);
    const needle = (text || "").toLowerCase();
    if (!root2 || !needle.trim()) return [];
    const textNodes = [];
    const walker = document.createTreeWalker(root2, NodeFilter.SHOW_TEXT, null);
    let node = walker.nextNode();
    while (node) {
      if (node.nodeValue && node.nodeValue.toLowerCase().includes(needle)) textNodes.push(node);
      node = walker.nextNode();
    }
    const hits = [];
    for (const textNode of textNodes) {
      let cursor = textNode;
      for (; ; ) {
        const value = cursor.nodeValue || "";
        const idx = value.toLowerCase().indexOf(needle);
        if (idx === -1) break;
        const matched = cursor.splitText(idx);
        const rest = matched.splitText(needle.length);
        const mark = document.createElement("mark");
        mark.className = FIND_HIT_CLASS;
        mark.textContent = matched.nodeValue;
        if (matched.parentNode) matched.parentNode.replaceChild(mark, matched);
        hits.push(mark);
        cursor = rest;
      }
    }
    return hits;
  }
  function drawFindArrows(root2, hits, currentIndex) {
    if (!root2) return;
    const existing = root2.querySelector(".astra-find-arrows");
    if (existing) existing.remove();
    if (!hits.length) return;
    const overlay = document.createElement("div");
    overlay.className = "astra-find-arrows";
    root2.appendChild(overlay);
    const lines = /* @__PURE__ */ new Map();
    hits.forEach((hit, i) => {
      const key = Math.round(hit.offsetTop);
      const line = lines.get(key);
      if (line) {
        if (i === currentIndex) line.current = true;
      } else {
        lines.set(key, { top: hit.offsetTop, height: hit.offsetHeight, current: i === currentIndex });
      }
    });
    for (const line of lines.values()) {
      const arrow = document.createElement("span");
      arrow.className = "astra-find-arrow" + (line.current ? " is-current" : "");
      arrow.textContent = "\u25B6";
      arrow.style.top = `${line.top}px`;
      arrow.style.height = `${line.height}px`;
      overlay.appendChild(arrow);
    }
  }
  var PageActiveContext = createContext(true);
  function useFindShortcut(onFind) {
    const active = useContext(PageActiveContext);
    const activeRef = useRef(active);
    activeRef.current = active;
    const onFindRef = useRef(onFind);
    onFindRef.current = onFind;
    useEffect(() => {
      const onKey = (e) => {
        if (!activeRef.current || !(e.metaKey || e.ctrlKey) || String(e.key).toLowerCase() !== "f") return;
        e.preventDefault();
        onFindRef.current();
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, []);
  }
  function ReadmeFindBar({
    query,
    setQuery,
    status,
    setStatus,
    contentRef,
    placeholder = "Find in README\u2026",
    arrows = true,
    onClose,
    contentVersion,
    autoFocus = false,
    style
  }) {
    const [currentIndex, setCurrentIndex] = useState(-1);
    const currentIndexRef = useRef(-1);
    const [totalMatches, setTotalMatches] = useState(0);
    const hitsRef = useRef([]);
    const searchedRef = useRef("");
    const boxRef = useRef(null);
    const focusInput = () => {
      const input = boxRef.current && boxRef.current.querySelector("input");
      if (input) {
        input.focus();
        input.select();
      }
    };
    useFindShortcut(focusInput);
    useEffect(() => {
      if (autoFocus) focusInput();
    }, []);
    useEffect(() => () => clearFindHighlights(contentRef.current), [contentRef]);
    useEffect(() => {
      if (contentVersion === void 0 || !searchedRef.current) return;
      const hits = highlightFindMatches(contentRef.current, searchedRef.current);
      hitsRef.current = hits;
      const kept = hits.length ? Math.min(Math.max(currentIndexRef.current, 0), hits.length - 1) : -1;
      hits.forEach((hit, i) => hit.classList.toggle(FIND_CURRENT_CLASS, i === kept));
      currentIndexRef.current = kept;
      setCurrentIndex(kept);
      setTotalMatches(hits.length);
      setStatus(hits.length ? "found" : "not-found");
    }, [contentVersion]);
    const goTo = (index, hits) => {
      const list = hits || hitsRef.current;
      if (!list.length) return;
      const wrapped = (index % list.length + list.length) % list.length;
      list.forEach((hit, i) => hit.classList.toggle(FIND_CURRENT_CLASS, i === wrapped));
      if (arrows) drawFindArrows(contentRef.current, list, wrapped);
      list[wrapped].scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      currentIndexRef.current = wrapped;
      setCurrentIndex(wrapped);
    };
    const runFind = (text, backwards) => {
      const trimmed = (text || "").trim();
      if (!trimmed) {
        clearFindHighlights(contentRef.current);
        hitsRef.current = [];
        searchedRef.current = "";
        setStatus(null);
        setCurrentIndex(-1);
        setTotalMatches(0);
        currentIndexRef.current = -1;
        return;
      }
      if (searchedRef.current !== trimmed) {
        const hits = highlightFindMatches(contentRef.current, trimmed);
        hitsRef.current = hits;
        searchedRef.current = trimmed;
        setTotalMatches(hits.length);
        setStatus(hits.length ? "found" : "not-found");
        if (!hits.length) {
          setCurrentIndex(-1);
          return;
        }
        goTo(0, hits);
        return;
      }
      if (!hitsRef.current.length) return;
      goTo(currentIndex + (backwards ? -1 : 1));
    };
    return /* @__PURE__ */ React.createElement("div", { ref: boxRef, className: onClose ? "astra-modal-in" : void 0, style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10, ...style } }, /* @__PURE__ */ React.createElement(
      TextInput,
      {
        icon: "search",
        placeholder,
        value: query,
        onChange: (e) => {
          setQuery(e.target.value);
          setStatus(null);
          setCurrentIndex(-1);
          setTotalMatches(0);
          searchedRef.current = "";
          if (!e.target.value.trim()) clearFindHighlights(contentRef.current);
        },
        onKeyDown: (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            runFind(query, e.shiftKey);
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setQuery("");
            runFind("", false);
            if (onClose) onClose();
          }
        },
        style: { maxWidth: 260 }
      }
    ), /* @__PURE__ */ React.createElement(Tooltip, { text: "Previous match", align: "top" }, /* @__PURE__ */ React.createElement(IconButton, { name: "chevronUp", onClick: () => runFind(query, true), disabled: !query.trim() })), /* @__PURE__ */ React.createElement(Tooltip, { text: "Next match", align: "top" }, /* @__PURE__ */ React.createElement(IconButton, { name: "chevronDown", onClick: () => runFind(query, false), disabled: !query.trim() })), status === "found" && query.trim() && totalMatches > 0 && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11.5, color: "var(--text-2)" } }, currentIndex + 1, " of ", totalMatches), status === "not-found" && query.trim() && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11.5, color: "var(--coral)" } }, "No matches"), onClose && /* @__PURE__ */ React.createElement(Tooltip, { text: "Close (Esc)", align: "right" }, /* @__PURE__ */ React.createElement(IconButton, { name: "x", onClick: () => {
      clearFindHighlights(contentRef.current);
      onClose();
    } })));
  }
  function CitationPage() {
    const { isElectron } = useApp();
    const [readmeText, setReadmeText] = useState(null);
    const [loadError, setLoadError] = useState(null);
    const [licenseModal, setLicenseModal] = useState(null);
    const [findQuery, setFindQuery] = useState("");
    const [findStatus, setFindStatus] = useState(null);
    const readmeRef = useRef(null);
    const renderedReadme = useMemo(() => readmeText === null ? null : renderMarkdownLite(readmeText), [readmeText]);
    useEffect(() => {
      if (!isElectron) {
        setLoadError("Available in the desktop app.");
        return;
      }
      let cancelled = false;
      window.astra3Native.getDocPath("README.md").then((path) => {
        if (!path) {
          if (!cancelled) setLoadError("Could not locate README.md.");
          return;
        }
        return window.astra3Native.readFile(path).then((text) => {
          if (!cancelled) setReadmeText(text);
        });
      }).catch((e) => {
        if (!cancelled) setLoadError(e?.message || "Could not read README.md.");
      });
      return () => {
        cancelled = true;
      };
    }, [isElectron]);
    const openDoc = async (filename) => {
      if (!isElectron) return;
      const path = await window.astra3Native.getDocPath(filename);
      if (!path) return;
      const text = await window.astra3Native.readFile(path);
      setLicenseModal({ filename, text });
    };
    return /* @__PURE__ */ React.createElement(PageScroll, null, /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 820, margin: "0 auto", padding: "28px 32px 60px" } }, /* @__PURE__ */ React.createElement(SectionLabel, null, "Citation"), /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 24 } }, /* @__PURE__ */ React.createElement(CitationBlock, null)), /* @__PURE__ */ React.createElement(SectionLabel, null, "License & third-party notices"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 28 } }, /* @__PURE__ */ React.createElement(Button, { variant: "secondary", size: "sm", icon: "citation", onClick: () => openDoc("LICENSE") }, "Astra3 License (GNU GPL v3)"), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", onClick: () => openDoc("THIRD_PARTY_NOTICES.txt") }, "Third-party notices"), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", onClick: () => openDoc("CITATION.cff") }, "CITATION.cff"), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", onClick: () => openDoc("PRIVACY.md") }, "Privacy Policy")), /* @__PURE__ */ React.createElement(SectionLabel, null, "Documentation (README)"), readmeText !== null && !loadError && /* @__PURE__ */ React.createElement(
      ReadmeFindBar,
      {
        query: findQuery,
        setQuery: setFindQuery,
        status: findStatus,
        setStatus: setFindStatus,
        contentRef: readmeRef
      }
    ), /* @__PURE__ */ React.createElement(Card, { style: { padding: 24 } }, loadError ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "alertTriangle", title: "Could not load README", description: loadError }) : readmeText === null ? /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, color: "var(--text-1)", fontSize: 13, padding: 20 } }, /* @__PURE__ */ React.createElement(Spinner, { size: 16 }), " Loading README\u2026") : (
      /* position:relative anchors the gutter arrows, which are
         absolutely positioned against this container. */
      /* @__PURE__ */ React.createElement("div", { ref: readmeRef, style: { position: "relative" } }, renderedReadme)
    ))), licenseModal && /* @__PURE__ */ React.createElement("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }, onClick: () => setLicenseModal(null) }, /* @__PURE__ */ React.createElement("div", { className: "astra-modal-in", style: { width: "min(720px, 90vw)", maxHeight: "80vh", display: "flex", flexDirection: "column", background: "var(--bg-1)", border: "1px solid var(--line-1)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)" }, onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("div", { style: { padding: "14px 18px", borderBottom: "1px solid var(--line-0)", display: "flex", alignItems: "center", justifyContent: "space-between" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 13.5, fontWeight: 600 } }, licenseModal.filename === "PRIVACY.md" ? "Privacy Policy" : licenseModal.filename), /* @__PURE__ */ React.createElement(IconButton, { name: "x", title: "Close", onClick: () => setLicenseModal(null) })), licenseModal.filename.endsWith(".md") ? /* @__PURE__ */ React.createElement("div", { style: { padding: 18, overflow: "auto", fontSize: 12.5, lineHeight: 1.6 } }, renderMarkdownLite(licenseModal.text)) : /* @__PURE__ */ React.createElement("pre", { className: "mono", style: { margin: 0, padding: 18, overflow: "auto", fontSize: 11.5, lineHeight: 1.7, whiteSpace: "pre-wrap" } }, licenseModal.text))));
  }
  function QuickAction({ icon, title, desc, onClick }) {
    return /* @__PURE__ */ React.createElement(Card, { hover: true, onClick, style: { padding: 16 } }, /* @__PURE__ */ React.createElement("div", { style: { width: 34, height: 34, borderRadius: 9, background: "var(--accent-wash)", color: "var(--accent-bright)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 } }, /* @__PURE__ */ React.createElement(Icon, { name: icon, size: 17 })), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13.5, fontWeight: 600, marginBottom: 3 } }, title), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--text-1)" } }, desc));
  }
  function CollapsibleSection({ title, count, defaultOpen = true, children, style }) {
    const [open, setOpen] = useState(defaultOpen);
    return /* @__PURE__ */ React.createElement("div", { style }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setOpen((o) => !o),
        style: {
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          marginBottom: open ? 12 : 6,
          fontSize: 11.5,
          fontWeight: 700,
          color: "var(--text-1)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          textAlign: "left"
        }
      },
      /* @__PURE__ */ React.createElement("span", { style: { display: "inline-flex", transition: "transform 160ms ease", transform: open ? "rotate(90deg)" : "rotate(0deg)" } }, /* @__PURE__ */ React.createElement(Icon, { name: "chevronRight", size: 11 })),
      title,
      count != null && count !== "" ? ` (${count})` : ""
    ), open && children);
  }
  function SectionLabel({ children, style }) {
    return /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, fontWeight: 700, color: "var(--text-1)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12, ...style } }, children);
  }
  function PageScroll({ children, style }) {
    return /* @__PURE__ */ React.createElement("div", { style: { flex: 1, overflowY: "auto", ...style } }, children);
  }
  function BusyLock({ active, children }) {
    return /* @__PURE__ */ React.createElement("div", { style: { position: "relative" } }, /* @__PURE__ */ React.createElement("div", { style: { opacity: active ? 0.45 : 1, pointerEvents: active ? "none" : "auto", transition: "opacity 150ms ease", filter: active ? "grayscale(0.3)" : "none" } }, children), active && /* @__PURE__ */ React.createElement("div", { style: {
      position: "absolute",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(0,0,0,0.02)",
      zIndex: 5
    } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, background: "var(--bg-2)", border: "1px solid var(--line-1)", borderRadius: "var(--radius-md)", padding: "8px 14px", boxShadow: "var(--shadow-md)" } }, /* @__PURE__ */ React.createElement(Spinner, { size: 13 }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, color: "var(--text-1)" } }, "Astra3 is busy with another task"))));
  }
  var KIND_META = {
    single: { icon: "analysis", label: "Single" },
    overlay: { icon: "overlay", label: "Overlay" },
    termini: { icon: "termini", label: "Termini" },
    batch: { icon: "batch", label: "Batch" }
  };
  var STATUS_META = {
    complete: { tone: "success", label: "Complete" },
    failed: { tone: "error", label: "Failed" },
    running: { tone: "warning", label: "Running" },
    // Only a BATCH: a queue stopped part-way kept the structures it finished.
    // Amber, since it was stopped rather than failed.
    cancelled: { tone: "warning", label: "Cancelled" }
  };
  function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1e3);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }
  function displayDate(value, withTime = false) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value ?? "");
    const p = (n) => String(n).padStart(2, "0");
    const day = `${p(d.getMonth() + 1)}-${p(d.getDate())}-${d.getFullYear()}`;
    return withTime ? `${day} ${p(d.getHours())}:${p(d.getMinutes())}` : day;
  }
  function HistoryRow({
    entry,
    onToggleFavorite,
    onDelete,
    setPage,
    compact,
    sizeBytes = 0,
    selectable = false,
    selected = false,
    onToggleSelect
  }) {
    const k = KIND_META[entry.kind];
    const s = STATUS_META[entry.status];
    const { setSelectedReportId } = useApp();
    const openInReports = () => {
      if (!setPage) return;
      setSelectedReportId(entry.id);
      setPage("reports");
    };
    const onRowClick = selectable ? () => onToggleSelect && onToggleSelect(entry.id) : openInReports;
    return /* @__PURE__ */ React.createElement(
      Card,
      {
        hover: true,
        style: {
          padding: compact ? "10px 14px" : "13px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          // Only set when selected: Card spreads this after its defaults, so an explicit
          // undefined would remove the border and surface.
          ...selected ? { border: "1px solid var(--accent)", background: "var(--bg-2)" } : {}
        },
        onClick: onRowClick
      },
      selectable && /* @__PURE__ */ React.createElement(
        "div",
        {
          role: "checkbox",
          "aria-checked": selected,
          "aria-label": `Select ${entry.label}`,
          style: {
            width: 18,
            height: 18,
            borderRadius: 5,
            flexShrink: 0,
            cursor: "pointer",
            border: `1.5px solid ${selected ? "var(--accent, #4a9eff)" : "var(--text-2)"}`,
            background: selected ? "var(--accent, #4a9eff)" : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          },
          onClick: (e) => {
            e.stopPropagation();
            onToggleSelect && onToggleSelect(entry.id);
          }
        },
        selected && /* @__PURE__ */ React.createElement(Icon, { name: "check", size: 12 })
      ),
      /* @__PURE__ */ React.createElement("div", { style: { width: 32, height: 32, borderRadius: 8, background: "var(--bg-2)", color: "var(--text-1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 } }, /* @__PURE__ */ React.createElement(Icon, { name: k.icon, size: 15 })),
      /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } }, /* @__PURE__ */ React.createElement("span", { className: "mono", style: { fontSize: 13, fontWeight: 600 } }, entry.label), /* @__PURE__ */ React.createElement(Badge, { tone: s.tone, dot: true }, s.label)), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--text-1)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, k.label, " \xB7 ", historyMetaText(entry.meta), " \xB7 ", timeAgo(entry.timestamp), sizeBytes > 0 ? ` \xB7 ${formatBytes(sizeBytes)}` : "")),
      /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 2 }, onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement(
        IconButton,
        {
          name: entry.favorite ? "starFilled" : "star",
          active: entry.favorite,
          title: "Favorite",
          onClick: onToggleFavorite,
          className: `astra-fav-btn${entry.favorite ? " is-favorite" : ""}`,
          style: entry.favorite ? { color: "var(--amber)" } : {}
        }
      ), onDelete && /* @__PURE__ */ React.createElement(IconButton, { name: "trash", title: "Remove", onClick: onDelete }))
    );
  }
  function polarPoint(cx, cy, r, angle) {
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  }
  function donutSlicePath(cx, cy, rOuter, rInner, startAngle, endAngle) {
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    const [x1, y1] = polarPoint(cx, cy, rOuter, startAngle);
    const [x2, y2] = polarPoint(cx, cy, rOuter, endAngle);
    const [x3, y3] = polarPoint(cx, cy, rInner, endAngle);
    const [x4, y4] = polarPoint(cx, cy, rInner, startAngle);
    return [
      `M ${x1} ${y1}`,
      `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${x3} ${y3}`,
      `A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4} ${y4}`,
      "Z"
    ].join(" ");
  }
  var KIND_LABELS = { single: "Single", overlay: "Overlay", termini: "Termini", batch: "Batch" };
  var KIND_COLORS = {
    single: "var(--accent)",
    overlay: "var(--violet)",
    termini: "var(--sage)",
    batch: "var(--gold)"
  };
  function HistoryDonut({ history, totalBytes, folderBytesByKind }) {
    const [hovered, setHovered] = useState(null);
    const [entered, setEntered] = useState(false);
    useEffect(() => {
      const t = setTimeout(() => setEntered(true), 20);
      return () => clearTimeout(t);
    }, []);
    const counts = {};
    for (const h of history) counts[h.kind] = (counts[h.kind] || 0) + 1;
    const data = Object.keys(KIND_LABELS).filter((k) => counts[k]).map((k) => ({ kind: k, label: KIND_LABELS[k], value: counts[k], color: KIND_COLORS[k] }));
    const total = history.length;
    if (total === 0) return null;
    const size = 132;
    const cx = size / 2;
    const cy = size / 2;
    const rOuter = 58;
    const rInner = 38;
    const gap = 0.035;
    let angle = -Math.PI / 2;
    const slices = data.map((d) => {
      const sweep = d.value / total * Math.PI * 2;
      const s = { ...d, start: angle, end: angle + Math.max(sweep - gap, 0.01) };
      angle += sweep;
      return s;
    });
    const active = hovered !== null ? slices[hovered] : null;
    return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 18 } }, /* @__PURE__ */ React.createElement("div", { style: { position: "relative", width: size, height: size, flexShrink: 0 } }, /* @__PURE__ */ React.createElement(
      "svg",
      {
        width: size,
        height: size,
        viewBox: `0 0 ${size} ${size}`,
        style: {
          // The whole chart eases in with a slight scale+rotate, which
          // reads as the slices sweeping into place without needing per-
          // slice path interpolation.
          transform: entered ? "scale(1) rotate(0deg)" : "scale(0.86) rotate(-14deg)",
          opacity: entered ? 1 : 0,
          transition: "transform 620ms cubic-bezier(0.22, 1, 0.36, 1), opacity 420ms ease-out"
        }
      },
      slices.map((s, i) => /* @__PURE__ */ React.createElement(
        "path",
        {
          key: s.kind,
          d: donutSlicePath(cx, cy, rOuter, rInner, s.start, s.end),
          fill: s.color,
          onMouseEnter: () => setHovered(i),
          onMouseLeave: () => setHovered(null),
          style: {
            cursor: "default",
            // Non-hovered slices fade back so the hovered one reads
            // clearly, matching the reference component's behaviour.
            opacity: hovered === null || hovered === i ? 1 : 0.32,
            transformOrigin: `${cx}px ${cy}px`,
            transform: hovered === i ? "scale(1.055)" : "scale(1)",
            transition: "opacity 180ms ease, transform 240ms cubic-bezier(0.22, 1, 0.36, 1)",
            transitionDelay: entered ? "0ms" : `${i * 70}ms`
          }
        }
      ))
    ), /* @__PURE__ */ React.createElement(
      "div",
      {
        style: {
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none"
        }
      },
      /* @__PURE__ */ React.createElement("div", { style: { fontSize: 21, fontWeight: 600, color: "var(--text-0)", lineHeight: 1 } }, active ? active.value : total),
      /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: "var(--text-2)", marginTop: 3, letterSpacing: 0.3 } }, active ? active.label : "Analyses")
    )), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 } }, slices.map((s, i) => /* @__PURE__ */ React.createElement(
      "div",
      {
        key: s.kind,
        onMouseEnter: () => setHovered(i),
        onMouseLeave: () => setHovered(null),
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          opacity: hovered === null || hovered === i ? 1 : 0.45,
          transition: "opacity 180ms ease"
        }
      },
      /* @__PURE__ */ React.createElement("span", { style: { width: 9, height: 9, borderRadius: 3, background: s.color, flexShrink: 0 } }),
      /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-1)" } }, s.label),
      /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-2)", marginLeft: "auto", paddingLeft: 10, fontVariantNumeric: "tabular-nums" } }, s.value, folderBytesByKind && folderBytesByKind[s.kind] > 0 ? ` \xB7 ${formatBytes(folderBytesByKind[s.kind])}` : "")
    ))));
  }
  function OutputFolderInfo({ current, others }) {
    const [open, setOpen] = useState(false);
    const boxRef = useRef(null);
    useEffect(() => {
      if (!open) return void 0;
      const onPointer = (e) => {
        if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
      };
      const onKey = (e) => {
        if (e.key === "Escape") setOpen(false);
      };
      document.addEventListener("mousedown", onPointer);
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("mousedown", onPointer);
        document.removeEventListener("keydown", onKey);
      };
    }, [open]);
    if (!current) return null;
    const row = (dir, detail) => /* @__PURE__ */ React.createElement("div", { key: dir, style: { display: "flex", alignItems: "flex-start", gap: 8, marginTop: 6 } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { className: "mono", style: { fontSize: 11, color: "var(--text-0)" } }, dir.split(/(?<=[/\\])/).map((part, i) => /* @__PURE__ */ React.createElement(React.Fragment, { key: i }, part, /* @__PURE__ */ React.createElement("wbr", null)))), detail && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--text-2)", marginTop: 2 } }, detail)), /* @__PURE__ */ React.createElement(Button, { variant: "secondary", size: "sm", onClick: () => window.astra3Native?.openPath(dir) }, "Open"));
    return /* @__PURE__ */ React.createElement("span", { ref: boxRef, style: { position: "relative", display: "inline-flex", verticalAlign: "middle" } }, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        title: current,
        "aria-label": "Output folder details",
        "aria-expanded": open,
        onClick: () => setOpen((v) => !v),
        style: { display: "inline-flex", marginLeft: 4, padding: 2, border: 0, background: "none", cursor: "pointer", color: open || others.length ? "var(--text-1)" : "var(--text-2)" }
      },
      /* @__PURE__ */ React.createElement(Icon, { name: "folder", size: 12 })
    ), open && /* @__PURE__ */ React.createElement(
      "div",
      {
        role: "dialog",
        "aria-label": "Output folders",
        style: {
          position: "absolute",
          right: 0,
          top: "calc(100% + 6px)",
          zIndex: 30,
          width: 380,
          maxWidth: "70vw",
          padding: "10px 12px 12px",
          background: "var(--bg-1)",
          border: "1px solid var(--line-1)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-md)",
          textAlign: "left"
        }
      },
      /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--text-2)", letterSpacing: 0.3 } }, "Sizes are for this output folder"),
      row(current),
      others.length > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--text-2)", letterSpacing: 0.3, marginTop: 12 } }, "Runs in History saved in other folders"), others.map((o) => row(o.dir, `${o.runs} ${o.runs === 1 ? "run" : "runs"}${o.bytes ? ` \xB7 ${formatBytes(o.bytes)}` : ""}`)))
    ));
  }
  function HistoryPage({ setPage }) {
    const { history, toggleFavorite, deleteHistoryEntry, clearHistory, settings, isElectron, isBusy } = useApp();
    const toast = useToast();
    const [query, setQuery] = useState("");
    const [filterKind, setFilterKind] = useState("all");
    const [favOnly, setFavOnly] = useState(false);
    const [usage, setUsage] = useState(null);
    const [runSizes, setRunSizes] = useState({});
    const [confirming, setConfirming] = useState(null);
    const [working, setWorking] = useState(false);
    const [selectMode, setSelectMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState(() => /* @__PURE__ */ new Set());
    const entryFolders = useMemo(() => [...new Set(history.map(import_run_paths.runFolderForEntry).filter(Boolean))], [history]);
    const refreshUsage = useCallback(() => {
      if (!isElectron) return;
      window.astra3Native.outputUsage().then(setUsage).catch(() => setUsage(null));
      window.astra3Native.runSizes(entryFolders).then((sizes) => setRunSizes(sizes || {})).catch(() => setRunSizes({}));
    }, [isElectron, settings.outputDir, entryFolders]);
    useEffect(() => {
      refreshUsage();
    }, [refreshUsage, history.length]);
    useEffect(() => {
      if (isBusy) setConfirming(null);
    }, [isBusy]);
    useEffect(() => {
      const onFocus = () => refreshUsage();
      window.addEventListener("focus", onFocus);
      return () => window.removeEventListener("focus", onFocus);
    }, [refreshUsage]);
    const sizeForEntry = useCallback((entry) => {
      const folder = (0, import_run_paths.runFolderForEntry)(entry);
      if (!folder) return 0;
      return runSizes[folder] ?? usage?.byPath?.[folder] ?? 0;
    }, [usage, runSizes]);
    const bytesByKind = {};
    for (const h of history) {
      const size = sizeForEntry(h);
      if (size) bytesByKind[h.kind] = (bytesByKind[h.kind] || 0) + size;
    }
    const exitSelectMode = useCallback(() => {
      setSelectMode(false);
      setSelectedIds(/* @__PURE__ */ new Set());
    }, []);
    const toggleSelected = useCallback((id) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }, []);
    const selectedEntries = history.filter((h) => selectedIds.has(h.id));
    const hasSelection = selectMode && selectedEntries.length > 0;
    const selectedBytes = selectedEntries.reduce((sum, h) => sum + sizeForEntry(h), 0);
    const selectedBytesByKind = {};
    for (const h of selectedEntries) {
      const size = sizeForEntry(h);
      if (size) selectedBytesByKind[h.kind] = (selectedBytesByKind[h.kind] || 0) + size;
    }
    const currentOutputDir = usage?.outputDir || settings.outputDir || "";
    const otherFolders = useMemo(() => {
      const byDir = /* @__PURE__ */ new Map();
      for (const folder of entryFolders) {
        const dir = dirnameOf(folder);
        if (!dir || dir.toLowerCase() === currentOutputDir.toLowerCase()) continue;
        const o = byDir.get(dir) || { dir, runs: 0, bytes: 0 };
        o.runs += 1;
        o.bytes += runSizes[folder] || 0;
        byDir.set(dir, o);
      }
      return [...byDir.values()];
    }, [entryFolders, runSizes, currentOutputDir]);
    const filtered = history.filter((h) => {
      if (favOnly && !h.favorite) return false;
      if (filterKind !== "all" && h.kind !== filterKind) return false;
      if (query && !h.label.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
    const doClearHistory = () => {
      clearHistory();
      setConfirming(null);
      toast.push({ tone: "success", title: "History cleared", message: "Your analysis files were left untouched." });
    };
    const doDeleteSelected = () => {
      for (const h of selectedEntries) deleteHistoryEntry(h.id);
      const count = selectedEntries.length;
      exitSelectMode();
      setConfirming(null);
      toast.push({
        tone: "success",
        title: `${count} ${count === 1 ? "entry" : "entries"} removed`,
        message: "The analysis files for those runs were left untouched."
      });
    };
    const deleteWithFiles = async (entries, everything) => {
      const plan = (0, import_run_paths.planDeletion)(entries, history);
      const result = everything ? await window.astra3Native.clearOutputs(plan.folders) : await window.astra3Native.deleteRuns(plan.folders);
      if (result && result.error) {
        toast.push({ tone: "error", title: "Could not delete files", message: result.error });
        return;
      }
      const { removedIds, problems } = (0, import_run_paths.settleDeletion)(plan, result && result.results || []);
      for (const id of removedIds) deleteHistoryEntry(id);
      const freed = formatBytes(result && result.freed || 0);
      const removed = removedIds.length;
      if (problems.length === 0) {
        toast.push({
          tone: "success",
          title: everything ? "History and files cleared" : `${removed} ${removed === 1 ? "run" : "runs"} deleted`,
          message: `${freed} freed from disk.`
        });
        return;
      }
      const kept = new Set(problems.flatMap((p) => p.ids)).size;
      toast.push({
        tone: removed > 0 ? "warning" : "error",
        title: removed > 0 ? `Deleted ${removed} ${removed === 1 ? "run" : "runs"} (${freed} freed); ${kept} kept` : `Nothing was deleted; ${kept} ${kept === 1 ? "run" : "runs"} kept`,
        message: `${(0, import_run_paths.describeProblems)(problems, history)}

${kept === 1 ? "It stays" : "They stay"} in History. Delete from list removes ${kept === 1 ? "it" : "them"} without touching any files.`,
        duration: 12e3
      });
    };
    const doDeleteSelectedWithFiles = async () => {
      setWorking(true);
      try {
        await deleteWithFiles(selectedEntries, false);
        exitSelectMode();
      } catch (e) {
        toast.push({ tone: "error", title: "Could not delete files", message: e?.message || "Something went wrong while deleting the selected run folders." });
      } finally {
        setWorking(false);
        setConfirming(null);
        refreshUsage();
      }
    };
    const doClearEverything = async () => {
      if (isBusy) {
        toast.push({ tone: "error", title: "Analysis in progress", message: "Wait for the current analysis to finish before deleting files." });
        setConfirming(null);
        return;
      }
      setWorking(true);
      try {
        await deleteWithFiles(history, true);
      } catch (e) {
        toast.push({ tone: "error", title: "Could not delete files", message: e?.message || "Something went wrong while deleting the output folders." });
      } finally {
        setWorking(false);
        setConfirming(null);
        refreshUsage();
      }
    };
    return /* @__PURE__ */ React.createElement(PageScroll, null, /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 900, margin: "0 auto", padding: "28px 32px 60px" } }, history.length > 0 && /* @__PURE__ */ React.createElement(Card, { style: { padding: "16px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement(
      HistoryDonut,
      {
        history: hasSelection ? selectedEntries : history,
        totalBytes: hasSelection ? selectedBytes : usage?.total || 0,
        folderBytesByKind: hasSelection ? selectedBytesByKind : bytesByKind
      }
    ), /* @__PURE__ */ React.createElement("div", { style: { marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { textAlign: "right" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--text-2)", letterSpacing: 0.3 } }, hasSelection ? `${selectedEntries.length} of ${history.length} selected` : "Output folder", /* @__PURE__ */ React.createElement(OutputFolderInfo, { current: currentOutputDir, others: otherFolders })), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 17, fontWeight: 600, color: "var(--text-0)", fontVariantNumeric: "tabular-nums" } }, hasSelection ? selectedBytes > 0 ? formatBytes(selectedBytes) : "" : usage && usage.total > 0 ? formatBytes(usage.total) : "")), isBusy && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--amber)", textAlign: "right", maxWidth: 300, lineHeight: 1.5 } }, "An analysis is running. Clearing is unavailable until it finishes, so its output isn't deleted mid-write."), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" } }, /* @__PURE__ */ React.createElement(
      Button,
      {
        variant: selectMode ? "primary" : "secondary",
        icon: "check",
        onClick: () => selectMode ? exitSelectMode() : setSelectMode(true),
        disabled: working || isBusy
      },
      selectMode ? "Done" : "Select"
    ), selectMode && /* @__PURE__ */ React.createElement(
      Button,
      {
        variant: "secondary",
        onClick: () => setSelectedIds((prev) => prev.size === filtered.length ? /* @__PURE__ */ new Set() : new Set(filtered.map((h) => h.id))),
        disabled: working || isBusy || filtered.length === 0
      },
      selectedIds.size === filtered.length && filtered.length > 0 ? "Select none" : "Select all"
    ), /* @__PURE__ */ React.createElement(
      Button,
      {
        variant: "secondary",
        icon: "trash",
        onClick: () => setConfirming(hasSelection ? "selected" : "history"),
        disabled: working || isBusy || selectMode && !hasSelection
      },
      hasSelection ? `Delete ${selectedEntries.length} from list` : "Clear history"
    ), /* @__PURE__ */ React.createElement(
      Button,
      {
        variant: "secondary",
        icon: "trash",
        onClick: () => setConfirming(hasSelection ? "selectedFiles" : "everything"),
        disabled: working || isBusy || selectMode && !hasSelection
      },
      hasSelection ? `Delete ${selectedEntries.length} + files` : "Clear history & files"
    )))), confirming && /* @__PURE__ */ React.createElement(Card, { style: { padding: "16px 18px", marginBottom: 16, border: "1px solid var(--coral)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: 600, color: "var(--text-0)", marginBottom: 6 } }, confirming === "history" ? `Remove all ${history.length} entries from this list?` : confirming === "everything" ? `Remove all ${history.length} entries and delete every analysis file?` : confirming === "selected" ? `Remove ${selectedEntries.length} selected ${selectedEntries.length === 1 ? "entry" : "entries"} from this list?` : `Remove ${selectedEntries.length} selected ${selectedEntries.length === 1 ? "entry" : "entries"} and delete their files?`), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--text-1)", marginBottom: 12, lineHeight: 1.6 } }, confirming === "history" ? /* @__PURE__ */ React.createElement(React.Fragment, null, "Your rendered images, reports and sessions stay on disk in", " ", /* @__PURE__ */ React.createElement("span", { className: "mono", style: { color: "var(--text-0)" } }, settings.outputDir), ". Only this list is cleared.") : confirming === "selected" ? /* @__PURE__ */ React.createElement(React.Fragment, null, "The files for ", selectedEntries.length === 1 ? "this run" : "these runs", " stay on disk in", " ", /* @__PURE__ */ React.createElement("span", { className: "mono", style: { color: "var(--text-0)" } }, settings.outputDir), ". Only the selected ", selectedEntries.length === 1 ? "entry is" : "entries are", " removed from this list.") : confirming === "selectedFiles" ? /* @__PURE__ */ React.createElement(React.Fragment, null, "This permanently deletes the run folder", selectedEntries.length === 1 ? "" : "s", " for the selected ", selectedEntries.length === 1 ? "run" : "runs", selectedBytes > 0 ? `, freeing ${formatBytes(selectedBytes)}` : "", ". Images, reports, JSON exports and sessions for ", selectedEntries.length === 1 ? "that run" : "those runs", " will all be gone. Every other run is left untouched. This cannot be undone.") : /* @__PURE__ */ React.createElement(React.Fragment, null, "This permanently deletes every run folder inside", " ", /* @__PURE__ */ React.createElement("span", { className: "mono", style: { color: "var(--text-0)" } }, settings.outputDir), ", and the folder of every run listed here", usage ? `, freeing at least ${formatBytes(usage.total)}` : "", ". Images, reports, JSON exports and sessions will all be gone. This cannot be undone.")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React.createElement(Button, { variant: "secondary", onClick: () => setConfirming(null), disabled: working }, "Cancel"), /* @__PURE__ */ React.createElement(
      Button,
      {
        variant: "danger",
        icon: "trash",
        disabled: working,
        onClick: confirming === "history" ? doClearHistory : confirming === "selected" ? doDeleteSelected : confirming === "selectedFiles" ? doDeleteSelectedWithFiles : doClearEverything
      },
      working ? "Deleting..." : confirming === "history" ? "Clear history" : confirming === "selected" ? `Remove ${selectedEntries.length}` : confirming === "selectedFiles" ? `Delete ${selectedEntries.length} + files` : "Delete everything"
    ))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 10, marginBottom: 16 } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement(TextInput, { icon: "search", placeholder: "Search history by ID...", value: query, onChange: (e) => setQuery(e.target.value) })), /* @__PURE__ */ React.createElement(
      SegmentedControl,
      {
        value: filterKind,
        onChange: setFilterKind,
        options: [{ value: "all", label: "All" }, { value: "single", label: "Single" }, { value: "overlay", label: "Overlay" }, { value: "termini", label: "Termini" }, { value: "batch", label: "Batch" }]
      }
    ), /* @__PURE__ */ React.createElement(Button, { variant: favOnly ? "primary" : "secondary", icon: favOnly ? "starFilled" : "star", onClick: () => setFavOnly(!favOnly) }, "Favorites")), filtered.length === 0 ? (
      // An empty history, or one hidden by the filters.
      history.length === 0 ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "history", title: "No analyses yet", description: "Runs you complete will be listed here." }) : /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(
        EmptyState,
        {
          icon: "history",
          title: `All ${history.length} ${history.length === 1 ? "analysis is" : "analyses are"} hidden by the filters above`,
          description: "Your history is intact; the search box, kind filter or Favorites toggle is hiding every entry."
        }
      ), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "center", marginTop: 12 } }, /* @__PURE__ */ React.createElement(Button, { variant: "secondary", icon: "refresh", onClick: () => {
        setQuery("");
        setFilterKind("all");
        setFavOnly(false);
      } }, "Clear filters")))
    ) : /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } }, filtered.map((h) => /* @__PURE__ */ React.createElement(
      HistoryRow,
      {
        key: h.id,
        entry: h,
        setPage,
        sizeBytes: sizeForEntry(h),
        selectable: selectMode,
        selected: selectedIds.has(h.id),
        onToggleSelect: toggleSelected,
        onToggleFavorite: () => toggleFavorite(h.id),
        onDelete: () => deleteHistoryEntry(h.id)
      }
    )))));
  }
  var SUMMARY_STARS = [
    { top: "12%", left: "7%", size: 3, duration: 3.4, delay: 0.2 },
    { top: "22%", left: "17%", size: 2, duration: 2.8, delay: 1.1 },
    { top: "9%", left: "34%", size: 2.5, duration: 3.9, delay: 0.7 },
    { top: "15%", left: "63%", size: 2, duration: 3.1, delay: 1.6 },
    { top: "8%", left: "78%", size: 3, duration: 2.6, delay: 0.4 },
    { top: "20%", left: "91%", size: 2.5, duration: 3.6, delay: 1.3 },
    { top: "44%", left: "4%", size: 2, duration: 3.2, delay: 0.9 },
    { top: "58%", left: "95%", size: 3, duration: 2.9, delay: 1.8 },
    { top: "74%", left: "88%", size: 2, duration: 3.5, delay: 0.6 },
    { top: "86%", left: "72%", size: 2.5, duration: 3, delay: 1.4 }
  ];
  function SummaryStars() {
    return /* @__PURE__ */ React.createElement("div", { "aria-hidden": true, style: { position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" } }, SUMMARY_STARS.map((st, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: {
      position: "absolute",
      top: st.top,
      left: st.left,
      width: st.size,
      height: st.size,
      borderRadius: "50%",
      background: SETUP_STAR_COLORS[i % SETUP_STAR_COLORS.length],
      // Dimmer than the setup screen's: there it is the whole point of
      // the visual, here it is background texture behind real content.
      opacity: 0.5,
      boxShadow: `0 0 ${st.size * 2.5}px ${SETUP_STAR_COLORS[i % SETUP_STAR_COLORS.length]}`,
      animation: `astra-star-fade-in 1.4s ease-out ${st.delay}s both, astra-star-twinkle ${st.duration}s ease-in-out ${st.delay + 1.4}s infinite`
    } })));
  }
  var PREFERRED_FRONT = [/view_front\.png$/i, /front/i];
  var PREFERRED_BACK = [/view_back\.png$/i, /back/i, /view_right\.png$/i, /view_left\.png$/i];
  function pickCardViews(pngFiles) {
    const files = pngFiles.filter((f) => /\.png$/i.test(f));
    if (files.length === 0) return { front: null, back: null };
    const firstMatch = (patterns, exclude) => {
      for (const pattern of patterns) {
        const hit = files.find((f) => pattern.test(f) && f !== exclude);
        if (hit) return hit;
      }
      return null;
    };
    const front = firstMatch(PREFERRED_FRONT, null) || files[0];
    const back = firstMatch(PREFERRED_BACK, front) || files.find((f) => f !== front) || null;
    return { front, back };
  }
  function describeView(filename) {
    if (!filename) return "";
    const base = filename.replace(/^.*[\\/]/, "").replace(/\.png$/i, "");
    const cleaned = base.replace(/^view[_-]?/i, "").replace(/[_-]+/g, " ").trim();
    if (!cleaned) return "View";
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  var SUMMARY_SPACING = 300;
  var SUMMARY_MAX_VISIBLE = 4;
  var SUMMARY_CARD_W = 340;
  var SUMMARY_CARD_H = 400;
  function summaryItemTransform(offset) {
    const abs = Math.abs(offset);
    const x = offset * SUMMARY_SPACING;
    const z = -Math.min(abs, 3) * 130;
    const rotateY = Math.max(-52, Math.min(52, -offset * 34));
    const scale = Math.max(0.5, 1 - abs * 0.2);
    const opacity = abs > SUMMARY_MAX_VISIBLE ? 0 : Math.max(0.18, 1 - abs * 0.34);
    return { x, z, rotateY, scale, opacity };
  }
  function summarizeCodes(codes, max = 4) {
    const unique = [...new Set(codes.filter(Boolean))];
    if (unique.length === 0) return "";
    const shown = unique.slice(0, max).join(", ");
    return unique.length > max ? `${shown}\u2026` : shown;
  }
  var SUMMARY_MAX_FACTS = 4;
  function summaryMethodLabel(run, batchChildIds) {
    if (run.kind === "overlay") return "Overlay";
    if (run.kind === "termini") return "Termini";
    const note = String(run.meta || "");
    if (batchChildIds.has(run.id) || /via batch/i.test(note)) return "Batch";
    if (/via advanced console/i.test(note)) return "Advanced Console";
    return "Single Structure";
  }
  function SummaryPage({ setPage }) {
    const { history, settings, isElectron, setSelectedViewerId } = useApp();
    const toast = useToast();
    const runs = history.filter((h) => h.status === "complete" && h.kind !== "batch").slice(0, 24).reverse();
    const [index, setIndex] = useState(Math.max(0, runs.length - 1));
    const [offset, setOffset] = useState(0);
    const [dragging, setDragging] = useState(false);
    const [flipped, setFlipped] = useState({});
    const [hovered, setHovered] = useState(null);
    const [assets, setAssets] = useState({});
    const dragRef = useRef(null);
    const velocityRef = useRef(0);
    const rafRef = useRef(null);
    const active = runs[index] || null;
    useEffect(() => {
      if (index > runs.length - 1) setIndex(Math.max(0, runs.length - 1));
    }, [runs.length, index]);
    useEffect(() => {
      if (!isElectron || runs.length === 0) return;
      let cancelled = false;
      const wanted = runs.slice(Math.max(0, index - 1), index + 2).filter((r) => !assets[r.id]);
      if (wanted.length === 0) return;
      (async () => {
        for (const run of wanted) {
          if (cancelled) return;
          const folder = await resolveRealOutputFolder(run, settings).catch(() => null);
          if (!folder || cancelled) continue;
          let image = null;
          let backPath = null;
          let frontLabel = "";
          let backLabel = "";
          let meta2 = null;
          try {
            const files = await window.astra3Native.listDir(joinPath(folder, "Images"));
            const views = pickCardViews(files);
            if (views.front) {
              image = await window.astra3Native.readImageThumbnail(joinPath(folder, "Images", views.front), 520);
              frontLabel = describeView(views.front);
            }
            if (views.back) {
              backPath = joinPath(folder, "Images", views.back);
              backLabel = describeView(views.back);
            }
          } catch {
          }
          for (const jsonName of ["Astra3_Report.json", "Termini_Analysis.json"]) {
            try {
              const raw = await window.astra3Native.readFile(joinPath(folder, "Session", jsonName));
              meta2 = JSON.parse(raw);
              break;
            } catch {
            }
          }
          if (!cancelled) {
            setAssets((a) => {
              const next = { ...a, [run.id]: { image, backPath, backImage: null, frontLabel, backLabel, meta: meta2, folder } };
              const ids = Object.keys(next);
              if (ids.length > 12) {
                const keep = new Set(runs.slice(Math.max(0, index - 3), index + 4).map((r) => r.id));
                for (const id of ids) {
                  if (!keep.has(id) && Object.keys(next).length > 12) delete next[id];
                }
              }
              return next;
            });
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [index, runs.length, isElectron, settings]);
    const settle = useCallback((from, targetIndex) => {
      cancelAnimationFrame(rafRef.current);
      let current = from;
      const step = () => {
        current += (0 - current) * 0.18;
        if (Math.abs(current) < 2e-3) {
          setOffset(0);
          setIndex(targetIndex);
          return;
        }
        setOffset(current);
        rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);
    }, []);
    const onPointerDown = (e) => {
      if (runs.length === 0) return;
      cancelAnimationFrame(rafRef.current);
      dragRef.current = { startX: e.clientX, startOffset: offset, lastX: e.clientX, lastT: performance.now(), moved: false, pointerId: e.pointerId, node: e.currentTarget };
      setDragging(true);
    };
    const onPointerMove = (e) => {
      if (!dragRef.current) return;
      const d = dragRef.current;
      const travelled = Math.abs(e.clientX - d.startX);
      if (!d.moved && travelled > 4) {
        d.moved = true;
        d.node?.setPointerCapture?.(d.pointerId);
      }
      if (!d.moved) return;
      const now = performance.now();
      const dt = Math.max(1, now - d.lastT);
      velocityRef.current = (e.clientX - d.lastX) / dt;
      d.lastX = e.clientX;
      d.lastT = now;
      setOffset(d.startOffset + (e.clientX - d.startX) / SUMMARY_SPACING);
    };
    const onPointerUp = () => {
      if (!dragRef.current) return;
      const wasDrag = dragRef.current.moved;
      dragRef.current = null;
      setDragging(false);
      if (!wasDrag) {
        velocityRef.current = 0;
        return;
      }
      const momentum = velocityRef.current * 4;
      const raw = index - (offset + momentum);
      const target = Math.max(0, Math.min(runs.length - 1, Math.round(raw)));
      const residual = offset - (index - target);
      setIndex(target);
      settle(residual, target);
      velocityRef.current = 0;
    };
    const go = useCallback((delta) => {
      cancelAnimationFrame(rafRef.current);
      setOffset(0);
      setIndex((i) => Math.max(0, Math.min(runs.length - 1, i + delta)));
    }, [runs.length]);
    const wheelLockRef = useRef(0);
    const onWheel = (e) => {
      const amount = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(amount) < 4) return;
      const now = performance.now();
      if (now - wheelLockRef.current < 220) return;
      wheelLockRef.current = now;
      go(amount > 0 ? 1 : -1);
    };
    useEffect(() => {
      const onKey = (e) => {
        if (e.key === "ArrowLeft") go(-1);
        if (e.key === "ArrowRight") go(1);
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [go]);
    useEffect(() => () => cancelAnimationFrame(rafRef.current), []);
    const withFolder = async (fn, failTitle) => {
      if (!active) return;
      const folder = assets[active.id]?.folder || await resolveRealOutputFolder(active, settings).catch(() => null);
      if (!folder) {
        toast.push({ tone: "error", title: failTitle, message: "This run's output folder could not be located on disk. It may have been moved or deleted." });
        return;
      }
      const err = await fn(folder);
      if (err) toast.push({ tone: "error", title: failTitle, message: err });
    };
    const openReport = () => withFolder(
      (folder) => window.astra3Native.openPath(active.reportPath || joinPath(folder, "Astra3_Report.html")),
      "Could not open report"
    );
    const openSession = () => {
      if (active.engine === "astra3") {
        setSelectedViewerId(active.id);
        setPage("viewer");
        return;
      }
      return openSessionFile();
    };
    const openSessionFile = () => withFolder(async (folder) => {
      if (active.sessionPath) return window.astra3Native.openInPymol(active.sessionPath);
      const files = await window.astra3Native.listDir(joinPath(folder, "Session"));
      const pse = files.find((f) => /\.(pse|cxs)$/i.test(f));
      if (!pse) return "No session file was found in this run's Session folder.";
      return window.astra3Native.openInPymol(joinPath(folder, "Session", pse));
    }, "Could not open session");
    const openFolder = () => withFolder((folder) => window.astra3Native.openPath(folder), "Could not open output folder");
    const meta = active ? assets[active.id]?.meta : null;
    const batchChildIds = useMemo(() => {
      const { batchGroups } = groupCompletedByBatch(history, runs);
      return new Set(batchGroups.flatMap((g) => g.children.map((c) => c.id)));
    }, [history, runs]);
    const methodLabel = active ? summaryMethodLabel(active, batchChildIds) : "";
    const structures = meta?.structures || [];
    const isComparison = active?.kind === "overlay" || active?.kind === "termini";
    const subLabel = (() => {
      if (!active) return "";
      if (isComparison) {
        const count = structures.length || String(active.label || "").split(/\s+vs\s+|,\s*/).filter(Boolean).length;
        const ref = meta?.reference_structure;
        return [ref ? `Reference ${ref}` : null, count > 1 ? `${count} structures` : null].filter(Boolean).join("  \xB7  ");
      }
      const st = structures[0];
      if (!st) return "";
      const bits = [];
      const res = Number.parseFloat(st.resolution_angstrom);
      if (Number.isFinite(res)) bits.push(`${st.resolution_angstrom} \xC5`);
      if (st.experimental_method) bits.push(String(st.experimental_method));
      return bits.join("  \xB7  ");
    })();
    const facts = (() => {
      if (!active || !meta) return [];
      const out = [];
      const range = (values, digits) => {
        const lo = Math.min(...values).toFixed(digits);
        const hi = Math.max(...values).toFixed(digits);
        return lo === hi ? lo : `${lo}\u2013${hi}`;
      };
      if (active.kind === "overlay") {
        const results = Array.isArray(meta.alignment_results) ? meta.alignment_results : [];
        const aligned = results.filter((a) => a.success !== false && typeof a.rmsd_angstrom === "number");
        const failed = results.filter((a) => a.success === false);
        if (aligned.length) {
          const to = meta.reference_structure ? ` to ${meta.reference_structure}` : "";
          out.push(`RMSD${to}: ${range(aligned.map((a) => a.rmsd_angstrom), 3)} \xC5`);
        }
        if (aligned.length > 1) {
          const best = aligned.reduce((b, a) => a.rmsd_angstrom < b.rmsd_angstrom ? a : b);
          out.push(`Closest match: ${best.structure_id} (${best.rmsd_angstrom.toFixed(3)} \xC5)`);
        }
        if (failed.length) out.push(`${failed.length} alignment${failed.length === 1 ? "" : "s"} failed`);
        const resolutions = structures.map((st) => Number.parseFloat(st.resolution_angstrom)).filter(Number.isFinite);
        if (resolutions.length) out.push(`Resolution ${range(resolutions, 2)} \xC5`);
      } else if (active.kind === "termini") {
        const comparisons = Array.isArray(meta.comparisons) ? meta.comparisons : [];
        const measured = comparisons.filter((c) => c.available && typeof c.tip_displacement_angstrom === "number");
        for (const end of ["N", "C"]) {
          const atEnd = measured.filter((c) => c.terminus === end);
          if (!atEnd.length) continue;
          const top = atEnd.reduce((b, c) => c.tip_displacement_angstrom > b.tip_displacement_angstrom ? c : b);
          out.push(`Largest ${end}-terminal shift: ${top.tip_displacement_angstrom.toFixed(2)} \xC5 (${top.comparison_structure})`);
        }
        const rmsds = measured.map((c) => c.local_rmsd_angstrom).filter((v) => typeof v === "number");
        if (rmsds.length) out.push(`Local RMSD (in place) ${range(rmsds, 2)} \xC5`);
        const unavailable = comparisons.length - comparisons.filter((c) => c.available).length;
        if (unavailable > 0) out.push(`${unavailable} terminus measurement${unavailable === 1 ? "" : "s"} unavailable`);
      } else {
        const st = structures[0];
        if (st) {
          const chains = st.chains || [];
          if (chains.length) out.push(`${chains.length} chain${chains.length === 1 ? "" : "s"} (${summarizeCodes(chains, 6)})`);
          const ligs = st.ligands || [];
          const ions = st.ions || [];
          const bound = [];
          if (ligs.length) bound.push(`${ligs.length} ligand${ligs.length === 1 ? "" : "s"} (${summarizeCodes(ligs.map((l) => l.code), 3)})`);
          if (ions.length) bound.push(`${ions.length} ion${ions.length === 1 ? "" : "s"} (${summarizeCodes(ions.map((i) => i.code), 3)})`);
          if (bound.length) out.push(bound.join("  \xB7  "));
          if (st.missing_residues_available && st.missing_residues_by_chain) {
            const total = Object.values(st.missing_residues_by_chain).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
            if (total > 0) out.push(`${total} missing residue${total === 1 ? "" : "s"}`);
          }
          if (typeof st.mean_ca_bfactor === "number") out.push(`Mean C\u03B1 B-factor ${st.mean_ca_bfactor.toFixed(1)} \xC5\xB2`);
          if (st.reduction_used) out.push("Reduced to a single chain");
        }
      }
      return out.slice(0, SUMMARY_MAX_FACTS);
    })();
    if (runs.length === 0) {
      return /* @__PURE__ */ React.createElement(PageScroll, null, /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 720, margin: "0 auto", padding: "80px 32px" } }, /* @__PURE__ */ React.createElement(
        EmptyState,
        {
          icon: "viewer",
          title: "No structures yet",
          description: "Completed analyses appear here as a visual gallery. Run a structure to get started."
        }
      )));
    }
    return /* @__PURE__ */ React.createElement(
      "div",
      {
        style: { position: "relative", height: "100%", overflow: "hidden", background: "var(--bg-0)", userSelect: "none" },
        onWheel
      },
      /* @__PURE__ */ React.createElement(SummaryStars, null),
      /* @__PURE__ */ React.createElement("div", { style: {
        position: "absolute",
        left: "50%",
        top: "44%",
        transform: "translate(-50%, -50%)",
        width: 760,
        height: 760,
        pointerEvents: "none",
        background: "radial-gradient(circle, var(--accent-wash) 0%, transparent 62%)",
        opacity: 0.9
      } }),
      /* @__PURE__ */ React.createElement("div", { style: {
        position: "absolute",
        left: "50%",
        top: "44%",
        transform: "translate(-50%, -50%)",
        width: 340,
        height: 340,
        pointerEvents: "none",
        background: "radial-gradient(circle, var(--accent) 0%, transparent 68%)",
        opacity: 0.16,
        filter: "blur(30px)"
      } }),
      /* @__PURE__ */ React.createElement("div", { style: {
        position: "absolute",
        top: 20,
        left: 0,
        right: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none"
      } }, /* @__PURE__ */ React.createElement("div", { style: {
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: "0.28em",
        color: "var(--text-2)",
        textTransform: "uppercase"
      } }, "Recent Structures")),
      /* @__PURE__ */ React.createElement(
        "div",
        {
          onPointerDown,
          onPointerMove,
          onPointerUp,
          onPointerCancel: onPointerUp,
          style: {
            position: "absolute",
            inset: 0,
            perspective: 1400,
            cursor: dragging ? "grabbing" : "grab",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }
        },
        /* @__PURE__ */ React.createElement("div", { style: { position: "relative", transformStyle: "preserve-3d", width: 0, height: 0 } }, runs.map((run, i) => {
          const rel = i - index + offset;
          if (Math.abs(rel) > SUMMARY_MAX_VISIBLE + 1) return null;
          const t = summaryItemTransform(rel);
          const asset = assets[run.id];
          const isActive = Math.round(-offset + index) === i;
          const isFlipped = !!flipped[run.id] && !!asset?.backPath;
          const isHovered = hovered === run.id && isActive && !dragging;
          return /* @__PURE__ */ React.createElement(
            "div",
            {
              key: run.id,
              onMouseEnter: () => setHovered(run.id),
              onMouseLeave: () => setHovered(null),
              onClick: () => {
                if (!isActive) {
                  go(i - index);
                  return;
                }
                if (!asset?.backPath) return;
                setFlipped((f) => ({ ...f, [run.id]: !f[run.id] }));
                if (!asset.backImage) {
                  window.astra3Native.readImageThumbnail(asset.backPath, 520).then((img) => {
                    if (img) setAssets((a) => a[run.id] ? { ...a, [run.id]: { ...a[run.id], backImage: img } } : a);
                  }).catch(() => {
                  });
                }
              },
              style: {
                position: "absolute",
                left: 0,
                top: 0,
                width: SUMMARY_CARD_W,
                height: SUMMARY_CARD_H,
                marginLeft: -SUMMARY_CARD_W / 2,
                marginTop: -SUMMARY_CARD_H / 2,
                // No hover scale on the card: scaling magnifies its rasterised layer and
                // blurs it. The hover zoom shrinks the image's padding instead (see the img
                // below), which re-rasterises it at the new size.
                transform: `translate3d(${t.x}px, 0, ${t.z}px) rotateY(${t.rotateY}deg) scale(${t.scale})`,
                opacity: t.opacity,
                // No transition while dragging; the transform already follows the pointer.
                transition: dragging ? "none" : "transform 420ms cubic-bezier(0.22, 1, 0.36, 1), opacity 300ms ease",
                transformStyle: "preserve-3d",
                cursor: isActive && asset?.backPath ? "pointer" : void 0
              }
            },
            /* @__PURE__ */ React.createElement("div", { style: {
              position: "absolute",
              inset: 0,
              transformStyle: "preserve-3d",
              transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
              transition: "transform 620ms cubic-bezier(0.22, 1, 0.36, 1)"
            } }, /* @__PURE__ */ React.createElement(SummaryCardFace, { active: isActive }, asset?.image ? /* @__PURE__ */ React.createElement(
              "img",
              {
                src: asset.image,
                alt: run.label,
                draggable: false,
                style: {
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  // Less padding gives a bigger protein without scaling; see the transform note
                  // above.
                  padding: isHovered ? 4 : 18,
                  transition: "padding 260ms cubic-bezier(0.22, 1, 0.36, 1)"
                }
              }
            ) : /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: 16 } }, /* @__PURE__ */ React.createElement("div", { className: "mono", style: { fontSize: 20, fontWeight: 700, color: "var(--text-1)" } }, run.label), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--text-2)", marginTop: 6 } }, asset ? "No rendered image" : "Loading\u2026")), isActive && !isFlipped && ENGINE_NAMES[run.engine] && /* @__PURE__ */ React.createElement("div", { style: {
              position: "absolute",
              top: 10,
              left: 0,
              right: 0,
              textAlign: "center",
              fontSize: 9.5,
              letterSpacing: "0.12em",
              color: "var(--text-2)",
              textTransform: "uppercase"
            } }, "Processed with ", ENGINE_NAMES[run.engine]), isActive && asset?.backPath && !isFlipped && /* @__PURE__ */ React.createElement("div", { style: {
              position: "absolute",
              bottom: 10,
              left: 0,
              right: 0,
              textAlign: "center",
              fontSize: 9.5,
              letterSpacing: "0.12em",
              color: "var(--text-2)",
              textTransform: "uppercase"
            } }, asset.backLabel ? `Click to see ${asset.backLabel.toLowerCase()}` : "Click to flip")), /* @__PURE__ */ React.createElement(SummaryCardFace, { active: isActive, back: true }, asset?.backImage && /* @__PURE__ */ React.createElement(
              "img",
              {
                src: asset.backImage,
                alt: `${run.label} back view`,
                draggable: false,
                style: { width: "100%", height: "100%", objectFit: "contain", padding: 14 }
              }
            ), /* @__PURE__ */ React.createElement("div", { style: {
              position: "absolute",
              bottom: 10,
              left: 0,
              right: 0,
              textAlign: "center",
              fontSize: 9.5,
              letterSpacing: "0.12em",
              color: "var(--text-2)",
              textTransform: "uppercase"
            } }, asset?.backLabel || "Second view")))
          );
        }))
      ),
      /* @__PURE__ */ React.createElement("div", { style: {
        position: "absolute",
        left: "50%",
        bottom: 116,
        transform: "translateX(-50%)",
        width: 260,
        height: 3,
        borderRadius: 2,
        background: "var(--line-0)"
      } }, /* @__PURE__ */ React.createElement("div", { style: {
        height: "100%",
        borderRadius: 2,
        background: "var(--accent)",
        width: `${runs.length <= 1 ? 100 : 100 / runs.length}%`,
        marginLeft: `${runs.length <= 1 ? 0 : index / runs.length * 100}%`,
        transition: dragging ? "none" : "margin-left 420ms cubic-bezier(0.22, 1, 0.36, 1)"
      } })),
      /* @__PURE__ */ React.createElement("div", { style: {
        position: "absolute",
        left: "50%",
        bottom: 96,
        transform: "translateX(-50%)",
        fontSize: 10,
        color: "var(--text-2)",
        letterSpacing: "0.14em"
      } }, index + 1, " / ", runs.length),
      active && /* @__PURE__ */ React.createElement("div", { style: {
        position: "absolute",
        left: 32,
        bottom: 28,
        maxWidth: 560,
        pointerEvents: "auto"
      } }, /* @__PURE__ */ React.createElement("div", { key: active.id, className: "astra-summary-fade" }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 30, fontWeight: 700, color: "var(--text-0)", lineHeight: 1.1 } }, methodLabel), /* @__PURE__ */ React.createElement("div", { className: "mono", style: {
        fontSize: 15,
        fontWeight: 600,
        color: "var(--text-1)",
        marginTop: 6,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
      } }, active.label), subLabel && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--accent)", letterSpacing: "0.12em", marginTop: 6, textTransform: "uppercase" } }, subLabel), facts.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--text-1)", marginTop: 10, lineHeight: 1.7 } }, facts.map((f) => /* @__PURE__ */ React.createElement("div", { key: f, style: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, f))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, color: "var(--text-2)", marginTop: 8 } }, timeAgo(active.timestamp)), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement(Button, { variant: "primary", size: "sm", icon: "reports", onClick: openReport }, "Open Report"), /* @__PURE__ */ React.createElement(Button, { variant: "secondary", size: "sm", icon: "cube", onClick: openSession }, "Open Session"), /* @__PURE__ */ React.createElement(Button, { variant: "secondary", size: "sm", icon: "folder", onClick: openFolder }, "Output Folder"), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "viewer", onClick: () => {
        setSelectedViewerId(active.id);
        setPage("viewer");
      } }, "View in 3D")))),
      /* @__PURE__ */ React.createElement("button", { onClick: () => go(-1), disabled: index === 0, style: summaryArrowStyle("left", index === 0), "aria-label": "Previous structure" }, /* @__PURE__ */ React.createElement(Icon, { name: "chevronRight", size: 16, style: { transform: "rotate(180deg)" } })),
      /* @__PURE__ */ React.createElement("button", { onClick: () => go(1), disabled: index >= runs.length - 1, style: summaryArrowStyle("right", index >= runs.length - 1), "aria-label": "Next structure" }, /* @__PURE__ */ React.createElement(Icon, { name: "chevronRight", size: 16 }))
    );
  }
  function SummaryCardFace({ children, active, back }) {
    return /* @__PURE__ */ React.createElement("div", { style: {
      position: "absolute",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "var(--radius-lg)",
      background: active ? "var(--bg-1)" : "var(--bg-2)",
      border: `1px solid ${active ? "var(--accent-dim)" : "var(--line-0)"}`,
      boxShadow: active ? "var(--shadow-lg)" : "var(--shadow-sm)",
      overflow: "hidden",
      backfaceVisibility: "hidden",
      WebkitBackfaceVisibility: "hidden",
      transform: back ? "rotateY(180deg)" : "none"
    } }, children);
  }
  function summaryArrowStyle(side, disabled) {
    return {
      position: "absolute",
      top: "44%",
      [side]: 24,
      transform: "translateY(-50%)",
      width: 36,
      height: 36,
      borderRadius: "50%",
      background: "var(--bg-2)",
      border: "1px solid var(--line-0)",
      color: disabled ? "var(--text-2)" : "var(--text-0)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: disabled ? "default" : "pointer",
      opacity: disabled ? 0.35 : 1,
      boxShadow: "var(--shadow-sm)"
    };
  }
  var ANSI_COLOR_MAP = {
    "91": "var(--coral)",
    // RED
    "92": "var(--sage)",
    // GREEN
    "93": "var(--amber)",
    // YELLOW
    "94": "var(--violet)",
    // BLUE
    "95": "var(--accent)",
    // VIOLET
    "96": "var(--accent-bright)",
    // CYAN
    "97": "var(--text-0)",
    // WHITE
    "38;5;229": "var(--gold-bright)",
    // STAR_LIGHT (banner only)
    "38;5;221": "var(--gold)",
    // STAR_PASTEL (banner only)
    "38;5;179": "var(--amber)",
    // STAR_DARK (banner only)
    "1;38;5;135": "var(--accent-bright)"
    // ASTRA_PURPLE (banner only)
  };
  function parseAnsiSegments(text) {
    const segments = [];
    let currentColor = null;
    let lastIndex = 0;
    const re = /\x1b\[([0-9;]*)m/g;
    let match;
    while ((match = re.exec(text)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ text: text.slice(lastIndex, match.index), color: currentColor });
      }
      const code = match[1];
      if (code === "0" || code === "") {
        currentColor = null;
      } else if (ANSI_COLOR_MAP[code]) {
        currentColor = ANSI_COLOR_MAP[code];
      }
      lastIndex = re.lastIndex;
    }
    if (lastIndex < text.length) {
      segments.push({ text: text.slice(lastIndex), color: currentColor });
    }
    return segments;
  }
  var ConsoleLine = React.memo(function ConsoleLine2({ text, tone, plain = false }) {
    const toneColor = {
      command: "var(--accent-bright)",
      info: "var(--text-0)",
      success: "var(--sage)",
      error: "var(--coral)",
      warning: "var(--amber)",
      muted: "var(--text-1)",
      prompt: "var(--violet)",
      highlight: "var(--gold)"
    };
    const fallbackColor = toneColor[tone] || "var(--text-0)";
    const segments = plain ? [{ text: stripAnsi(text), color: null }] : parseAnsiSegments(text);
    return /* @__PURE__ */ React.createElement("div", { style: { whiteSpace: "pre-wrap", wordBreak: "break-word" } }, tone === "command" ? /* @__PURE__ */ React.createElement("span", { style: { color: "var(--accent)" } }, "astra3> ") : null, segments.map((seg, i) => /* @__PURE__ */ React.createElement("span", { key: i, style: { color: seg.color || fallbackColor } }, seg.text)));
  });
  var CONSOLE_MAX_RENDERED_LINES = 300;
  var SESSION_LOG_MAX_LINES = 1e4;
  function LiveConsole({
    lines,
    height = 260,
    title = "Console output",
    showCursor = false,
    onRespond,
    fillHeight = false,
    maxLines = CONSOLE_MAX_RENDERED_LINES,
    droppedBefore = 0,
    bodyRef,
    followOutput = true
  }) {
    const { prompt, answerPrompt } = useApp();
    const endRef = useRef(null);
    const [freeText, setFreeText] = useState("");
    useEffect(() => {
      if (followOutput) endRef.current?.scrollIntoView({ block: "end" });
    }, [lines, followOutput]);
    useEffect(() => {
      setFreeText("");
    }, [prompt]);
    const visibleLines = lines.length > maxLines ? lines.slice(-maxLines) : lines;
    const truncated = lines.length - visibleLines.length;
    const lastLine = lines[lines.length - 1];
    const endedInError = lastLine?.tone === "error";
    const submitFreeText = () => {
      const trimmed = freeText.trim();
      if (trimmed) answerPrompt(trimmed);
    };
    const fillHeightStyle = fillHeight ? { height: 445, maxHeight: "calc(100vh - 140px)" } : {};
    const bodyStyle = fillHeight ? { flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 12px", fontSize: 12, lineHeight: 1.7 } : { height, overflowY: "auto", padding: "10px 12px", fontSize: 12, lineHeight: 1.7 };
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { background: "var(--console-bg)", border: "1px solid var(--line-0)", borderRadius: "var(--radius-md)", overflow: "hidden", ...fillHeight ? { display: "flex", flexDirection: "column" } : {}, ...fillHeightStyle } }, /* @__PURE__ */ React.createElement("div", { style: { padding: "8px 12px", borderBottom: "1px solid var(--line-0)", display: "flex", alignItems: "center", gap: 8, background: "var(--bg-1)" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 5 } }, /* @__PURE__ */ React.createElement("span", { style: { width: 8, height: 8, borderRadius: "50%", background: "#4a4e58" } }), /* @__PURE__ */ React.createElement("span", { style: { width: 8, height: 8, borderRadius: "50%", background: "#4a4e58" } }), /* @__PURE__ */ React.createElement("span", { style: { width: 8, height: 8, borderRadius: "50%", background: "#4a4e58" } })), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--text-1)", fontWeight: 600 } }, title)), /* @__PURE__ */ React.createElement("div", { className: "mono", ref: bodyRef, style: bodyStyle }, truncated > 0 && /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-2)", fontStyle: "italic", marginBottom: 6 } }, "\u2026 ", truncated, " earlier line", truncated === 1 ? "" : "s", " hidden. Scroll up in the Advanced Console for the full session log \u2026"), truncated === 0 && droppedBefore > 0 && /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-2)", fontStyle: "italic", marginBottom: 6 } }, "\u2026 The first ", droppedBefore.toLocaleString(), " line", droppedBefore === 1 ? "" : "s", " of this session are no longer kept; the Advanced Console holds the most recent ", SESSION_LOG_MAX_LINES.toLocaleString(), " lines \u2026"), visibleLines.map((l, i) => /* @__PURE__ */ React.createElement(ConsoleLine, { key: l.n ?? truncated + i, text: l.text, tone: l.tone })), showCursor && !prompt && /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-2)", display: "flex", alignItems: "center" } }, /* @__PURE__ */ React.createElement("span", { style: { color: "var(--accent)" } }, "astra3>"), "\xA0", /* @__PURE__ */ React.createElement("span", { className: "astra-cursor-blink" }, "\u2588")), /* @__PURE__ */ React.createElement("div", { ref: endRef })), endedInError && onRespond && !prompt && /* @__PURE__ */ React.createElement("div", { style: { padding: "8px 12px", borderTop: "1px solid var(--line-0)", background: "var(--coral-wash)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--coral)" } }, "This run ended with an error."), /* @__PURE__ */ React.createElement(Button, { variant: "secondary", size: "sm", icon: "console", onClick: onRespond }, "Respond in Console"))), prompt && /* @__PURE__ */ React.createElement("div", { className: "mono", style: { marginTop: 12, padding: 14, border: "1px solid var(--amber)", borderRadius: "var(--radius-sm)", background: "var(--bg-2)", boxShadow: "var(--shadow-md)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--amber)", fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement(Icon, { name: "alertTriangle", size: 12 }), " Astra3 needs your input"), /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 12 } }, /* @__PURE__ */ React.createElement(ConsoleLine, { text: prompt.text, tone: "muted", plain: true })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } }, (prompt.options || ["y", "n"]).map((opt) => /* @__PURE__ */ React.createElement(
      Button,
      {
        key: opt,
        variant: opt === "y" ? "confirm" : opt === "n" ? "decline" : "secondary",
        size: "sm",
        onClick: () => answerPrompt(opt),
        className: "mono"
      },
      opt
    )), prompt.allowFreeText && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 140 } }, /* @__PURE__ */ React.createElement(
      TextInput,
      {
        mono: true,
        placeholder: "Or type another answer\u2026",
        value: freeText,
        onChange: (e) => setFreeText(e.target.value),
        onKeyDown: (e) => {
          if (e.key === "Enter") submitFreeText();
        },
        style: { fontSize: 12 }
      }
    )), /* @__PURE__ */ React.createElement(Button, { variant: "secondary", size: "sm", onClick: submitFreeText, disabled: !freeText.trim() }, "Submit"))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: "var(--text-2)", marginTop: 10 } }, "Astra3 is paused until you answer. You can also answer from the Advanced Console.")));
  }
  function SingleStructurePage({ setPage }) {
    const { settings, runAstraCommand, addHistoryEntry, isElectron, isBusy, cancelRun, cancelRequestedRef, pendingStructureSeed, setPendingStructureSeed, setSelectedViewerId, engineInfo } = useApp();
    const toast = useToast();
    const [pdbId, setPdbId] = useState("");
    useEffect(() => {
      if (pendingStructureSeed?.kind === "single" && pendingStructureSeed.items?.length) {
        setPdbId(pendingStructureSeed.items[0].id);
        setPendingStructureSeed(null);
      }
    }, [pendingStructureSeed]);
    const [format, setFormat] = useState(settings.defaultFormat);
    const [quality, setQuality] = useState(settings.defaultQuality);
    const [opts, setOpts] = useState({ report: true, images: true, csv: false, sessionOnly: false, renderOnly: false });
    const [busy, setBusy] = useState(false);
    useDefaultSync(settings, [
      { key: "defaultFormat", current: format, setCurrent: setFormat },
      { key: "defaultQuality", current: quality, setCurrent: setQuality }
    ], busy);
    const [cancelling, setCancelling] = useState(false);
    const [runOutcome, setRunOutcome] = useState(null);
    const [runPrefix, setRunPrefix] = useState("");
    const [lines, setLines] = useState([]);
    const renderPlan = useMemo(() => ({ images: opts.images ? VIEWS_PER_RENDER : 0 }), [opts.images]);
    const otherPageBusy = isBusy && !busy;
    const buildCommand = () => {
      const flags = [];
      if (opts.images) {
        if (quality === "low") flags.push("-low");
        if (quality === "medium") flags.push("-medium");
        if (quality === "excellent") flags.push("-excellent");
      }
      if (format === "cif" && !AST_ID_RE.test(pdbId.trim())) flags.push("-mmCIF");
      if (!opts.images) flags.push("-skipimage");
      if (!opts.report) flags.push("-skipreport");
      if (opts.renderOnly) flags.push("-ro");
      if (opts.csv) flags.push("-csv");
      return [pdbId.trim().toUpperCase(), ...flags].join(" ");
    };
    const runAnalysis = async () => {
      if (!pdbId.trim() || isBusy) return;
      setBusy(true);
      setCancelling(false);
      setRunOutcome(null);
      setLines([]);
      setRunPrefix(pdbId.trim().toUpperCase());
      const startedAt = Date.now();
      const cmd = buildCommand();
      try {
        const result = await runAstraCommand(cmd, {
          originPage: "single",
          onLog: (entry) => setLines((l) => [...l, entry])
          // this run's output only
        });
        if (result?.cancelled || cancelRequestedRef.current) {
          await discardRunOutput(result?.lines, pdbId.trim(), settings.outputDir, startedAt);
          setRunOutcome("cancelled");
          toast.push({ tone: "neutral", title: "Analysis cancelled", message: `${pdbId.trim().toUpperCase()} was not finished, and nothing was saved.` });
          return;
        }
        if (!result?.produced) {
          setRunOutcome("failed");
          toast.push({
            tone: "error",
            title: `Could not analyse ${pdbId.trim().toUpperCase()}`,
            message: "Nothing was produced for this ID. Check it against the console output and try again."
          });
          return;
        }
        setRunOutcome("complete");
        const entryId = addHistoryEntry({ kind: "single", label: pdbId.trim().toUpperCase(), status: "complete", meta: `${quality[0].toUpperCase()}${quality.slice(1)} \xB7 ${structureSourceLabel(pdbId, format)}`, sessionPath: result?.sessionPath || null, reportPath: result?.reportPath || null });
        toast.push({ tone: "success", title: "Analysis complete", message: `${pdbId.trim().toUpperCase()}: report and session saved.` });
        if (settings.autoOpenReport && isElectron && result?.sessionPath) {
          const outputFolder = dirnameOf(dirnameOf(result.sessionPath));
          if (outputFolder) {
            window.astra3Native.openPath(result.reportPath || joinPath(outputFolder, "Astra3_Report.html")).then((err) => {
              if (err) toast.push({ tone: "error", title: "Could not open report", message: err });
            });
          }
        }
        if (settings.autoOpenSession && isElectron && result?.sessionPath && engineInfo?.engine === "astra3") {
          setSelectedViewerId(entryId);
          setPage("viewer");
        } else if (settings.autoOpenSession && isElectron && result?.sessionPath) {
          window.astra3Native.openInPymol(result.sessionPath).then((err) => {
            if (err) toast.push({ tone: "error", title: "Could not open session", message: err });
          }).catch((e) => {
            toast.push({ tone: "error", title: "Could not open session", message: e?.message || "The session could not be opened." });
          });
        }
      } catch (e) {
        if (cancelRequestedRef.current) {
          await discardRunOutput(e?.lines, pdbId.trim(), settings.outputDir, startedAt);
          setRunOutcome("cancelled");
          toast.push({ tone: "neutral", title: "Analysis cancelled", message: `${pdbId.trim().toUpperCase()} was not finished, and nothing was saved.` });
        } else {
          addHistoryEntry({ kind: "single", label: pdbId.trim().toUpperCase(), status: "failed", meta: "Analysis error" });
          toast.push({ tone: "error", title: "Analysis failed", message: e?.message || pdbId.trim().toUpperCase() });
        }
      } finally {
        setBusy(false);
        setRunOutcome((prev) => prev || (cancelRequestedRef.current ? "cancelled" : "failed"));
        setCancelling(false);
      }
    };
    const handleCancel = async () => {
      setCancelling(true);
      const result = await cancelRun();
      if (!result.ok && result.error) {
        toast.push({ tone: "error", title: "Could not cancel", message: result.error });
        setCancelling(false);
      }
    };
    return /* @__PURE__ */ React.createElement(PageScroll, null, /* @__PURE__ */ React.createElement(BusyLock, { active: otherPageBusy }, /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 1040, margin: "0 auto", padding: "28px 32px 60px", display: "grid", gridTemplateColumns: "380px 1fr", gap: 24, alignItems: "start" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(Card, { style: { padding: 20 } }, /* @__PURE__ */ React.createElement(FieldLabel, null, "PDB / mmCIF ID"), /* @__PURE__ */ React.createElement(TextInput, { icon: "search", mono: true, placeholder: "e.g. 1ERJ", value: pdbId, onChange: (e) => setPdbId(e.target.value), onKeyDown: (e) => e.key === "Enter" && !isBusy && runAnalysis() }), EXTENDED_ONLY_ID_RE.test(pdbId.trim()) && /* @__PURE__ */ React.createElement(FieldHint, null, "Entries with extended PDB IDs are issued in mmCIF only."), !AST_ID_RE.test(pdbId.trim()) && !EXTENDED_ONLY_ID_RE.test(pdbId.trim()) && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(FieldLabel, { style: { marginTop: 18 } }, "Fetch format"), /* @__PURE__ */ React.createElement(
      SegmentedControl,
      {
        value: format,
        onChange: setFormat,
        options: settings.defaultFormat === "pdb" ? [{ value: "pdb", label: "Legacy PDB" }, { value: "cif", label: "mmCIF" }] : [{ value: "cif", label: "mmCIF" }, { value: "pdb", label: "Legacy PDB" }]
      }
    ), /* @__PURE__ */ React.createElement(FieldHint, null, settings.defaultFormat === "pdb" ? "Legacy PDB is tried first by default; Astra3 falls back to mmCIF automatically if unavailable." : "mmCIF is tried first by default; Astra3 falls back to legacy PDB automatically if unavailable.")), /* @__PURE__ */ React.createElement(FieldLabel, { style: { marginTop: 18 } }, "Output options"), /* @__PURE__ */ React.createElement("div", { style: { borderTop: "1px solid var(--line-0)", marginTop: 4 } }, /* @__PURE__ */ React.createElement(Checkbox, { checked: opts.report, onChange: (v) => setOpts({ ...opts, report: v }), label: "Generate report", description: "HTML, JSON, and text reports" }), /* @__PURE__ */ React.createElement(Checkbox, { checked: opts.images, onChange: (v) => setOpts({ ...opts, images: v }), label: "Render images", description: "6 PNG views" }), opts.images && /* @__PURE__ */ React.createElement(ImageQualityPicker, { quality, setQuality }), /* @__PURE__ */ React.createElement(Checkbox, { checked: opts.csv, onChange: (v) => setOpts({ ...opts, csv: v }), label: "CSV export", description: "Off by default, opt-in" }), /* @__PURE__ */ React.createElement(Checkbox, { checked: opts.sessionOnly, onChange: (v) => setOpts({ ...opts, sessionOnly: v, images: v ? false : opts.images, report: v ? false : opts.report }), label: "Session only", description: "Skip report + images, save the session only" })), /* @__PURE__ */ React.createElement(FieldLabel, { style: { marginTop: 18 } }, "Output directory"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6 } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 }, title: settings.outputDir }, /* @__PURE__ */ React.createElement(TextInput, { mono: true, icon: "folder", value: settings.outputDir, readOnly: true })), /* @__PURE__ */ React.createElement(Button, { variant: "secondary", size: "md", onClick: () => setPage("settings") }, "Change in Settings")), busy ? /* @__PURE__ */ React.createElement(Button, { variant: "danger", size: "lg", icon: cancelling ? void 0 : "x", onClick: handleCancel, disabled: cancelling, style: { width: "100%", marginTop: 22 } }, cancelling ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Spinner, { size: 14 }), "Cancelling\u2026") : /* @__PURE__ */ React.createElement(React.Fragment, null, "Cancel ", pdbId.toUpperCase())) : /* @__PURE__ */ React.createElement(Button, { variant: "primary", size: "lg", icon: "play", onClick: runAnalysis, disabled: isBusy || !pdbId.trim(), style: { width: "100%", marginTop: 22 } }, "Analyze"), /* @__PURE__ */ React.createElement("div", { className: "mono", style: { fontSize: 10.5, color: "var(--text-2)", marginTop: 10, textAlign: "center" } }, buildCommand() || "..."))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 16 } }, (busy || runOutcome) && /* @__PURE__ */ React.createElement(RunProgressBar, { lines, plan: renderPlan, outcome: runOutcome, prefix: runPrefix }), /* @__PURE__ */ React.createElement(LiveConsole, { lines: busy || lines.length ? lines : [{ text: "Run an analysis to see live output here.", tone: "muted" }], fillHeight: true, onRespond: () => setPage("console") })))));
  }
  function FieldLabel({ children, style }) {
    return /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, fontWeight: 600, color: "var(--text-1)", marginBottom: 7, ...style } }, children);
  }
  function FieldHint({ children }) {
    return /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--text-2)", marginTop: 6, lineHeight: 1.5 } }, children);
  }
  function ImageQualityPicker({ quality, setQuality }) {
    return /* @__PURE__ */ React.createElement("div", { style: { padding: "0 0 10px 28px" } }, /* @__PURE__ */ React.createElement(SegmentedControl, { value: quality, onChange: setQuality, options: [{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "excellent", label: "Excellent" }] }));
  }
  function RunOptionsPanel({ quality, setQuality, opts, setOpts, showTerminiOptions = false, showHomomerOptions = false }) {
    const homomerMode = opts.homomerMode || "ask";
    const homomerPriority = opts.homomerPriority || DEFAULT_HOMOMER_PRIORITY;
    const homomerFallback = opts.homomerFallback || "ask";
    const priorityPicker = /* @__PURE__ */ React.createElement("div", { style: { marginTop: 10 } }, /* @__PURE__ */ React.createElement(
      HomomerPriorityPicker,
      {
        priority: homomerPriority,
        setPriority: (next) => setOpts({ ...opts, homomerPriority: next })
      }
    ));
    const closeupsWanted = showTerminiOptions && opts.termini_closeups !== false;
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(FieldLabel, { style: { marginTop: 18 } }, "Output options"), /* @__PURE__ */ React.createElement("div", { style: { borderTop: "1px solid var(--line-0)", marginTop: 4 } }, /* @__PURE__ */ React.createElement(Checkbox, { checked: opts.report, onChange: (v) => setOpts({ ...opts, report: v }), label: "Generate report", description: "HTML, JSON, and text reports" }), /* @__PURE__ */ React.createElement(
      Checkbox,
      {
        checked: opts.images,
        onChange: (v) => setOpts({ ...opts, images: v }),
        label: "Render images",
        description: "PNG views"
      }
    ), opts.images && /* @__PURE__ */ React.createElement(ImageQualityPicker, { quality, setQuality }), /* @__PURE__ */ React.createElement(Checkbox, { checked: opts.csv, onChange: (v) => setOpts({ ...opts, csv: v }), label: "CSV export", description: "Off by default, opt-in" }), /* @__PURE__ */ React.createElement(Checkbox, { checked: opts.renderOnly, onChange: (v) => setOpts({ ...opts, renderOnly: v }), label: "Session only", description: "Skip report + whole-structure images, save the session only" }), showTerminiOptions && // Independent of Render images: close-ups and the six whole-structure views
    // can be rendered in any combination (do_core_images and do_closeups in
    // astra3.py).
    /* @__PURE__ */ React.createElement(
      Checkbox,
      {
        checked: opts.termini_closeups !== false,
        onChange: (v) => setOpts({ ...opts, termini_closeups: v }),
        label: "Close-up terminus views",
        description: "Two isolated angles per terminus, with orientation arrows"
      }
    ), !opts.images && closeupsWanted && /* @__PURE__ */ React.createElement(ImageQualityPicker, { quality, setQuality })), showHomomerOptions && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(FieldLabel, { style: { marginTop: 18 } }, "Redundant chains (homomers)"), /* @__PURE__ */ React.createElement(FieldHint, { style: { marginTop: -4, marginBottom: 8 } }, "When a structure has multiple chains that are the same protein, Astra3 normally asks whether to keep just one."), /* @__PURE__ */ React.createElement(
      SegmentedControl,
      {
        wrap: true,
        value: homomerMode,
        onChange: (v) => setOpts({ ...opts, homomerMode: v }),
        options: [
          { value: "ask", label: "Ask each time" },
          { value: "assembly", label: "Biological assembly" },
          { value: "reduce", label: "Always reduce" },
          { value: "keep", label: "Keep all chains" }
        ]
      }
    ), homomerMode === "assembly" && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 10 } }, /* @__PURE__ */ React.createElement(FieldHint, null, "Keeps the chains in the depositor's preferred biological assembly: one chain of a monomer, both chains of a dimer, and so on. Each report states which rule decided."), /* @__PURE__ */ React.createElement(FieldLabel, { style: { marginTop: 14, marginBottom: 0 } }, "When the assembly can't decide"), /* @__PURE__ */ React.createElement(FieldHint, null, "The file has no usable assembly records, or its preferred assembly is built from symmetry copies that are not in the file."), /* @__PURE__ */ React.createElement(
      SegmentedControl,
      {
        wrap: true,
        value: homomerFallback,
        onChange: (v) => setOpts({ ...opts, homomerFallback: v }),
        options: [{ value: "ask", label: "Ask each time" }, { value: "reduce", label: "Always reduce" }, { value: "keep", label: "Keep all chains" }]
      }
    ), homomerFallback === "reduce" && priorityPicker), homomerMode === "reduce" && priorityPicker));
  }
  function useDefaultSync(settings, fields, busy) {
    const prevRef = useRef(Object.fromEntries(fields.map((f) => [f.key, settings[f.key]])));
    useEffect(() => {
      if (busy) return;
      fields.forEach(({ key, current, setCurrent }) => {
        if (settings[key] !== prevRef.current[key] && current === prevRef.current[key]) {
          setCurrent(settings[key]);
        }
      });
      prevRef.current = Object.fromEntries(fields.map((f) => [f.key, settings[f.key]]));
    }, [busy, ...fields.map((f) => settings[f.key]), ...fields.map((f) => f.current)]);
  }
  function runOptionFlags(quality, opts, isTermini = false) {
    const flags = [];
    const anyImagesWanted = opts.images || isTermini && opts.termini_closeups !== false;
    if (anyImagesWanted) {
      if (quality === "low") flags.push("-low");
      if (quality === "medium") flags.push("-medium");
      if (quality === "excellent") flags.push("-excellent");
    }
    if (!opts.images) flags.push("-skipimage");
    if (!opts.report) flags.push("-skipreport");
    if (opts.renderOnly) flags.push("-ro");
    if (opts.csv) flags.push("-csv");
    if (opts.termini_closeups === false) flags.push("-skipcloseup");
    const reducePriority = () => {
      if (opts.homomerPriority && opts.homomerPriority.length) {
        flags.push(`-reducepriority:${opts.homomerPriority.join(",")}`);
      }
    };
    if (opts.homomerMode === "reduce") {
      flags.push("-alwaysreduce");
      reducePriority();
    } else if (opts.homomerMode === "keep") {
      flags.push("-keephomomers");
    } else if (opts.homomerMode === "assembly") {
      const fallback = opts.homomerFallback || "ask";
      flags.push("-keepassembly", `-assemblyfallback:${fallback}`);
      if (fallback === "reduce") reducePriority();
    }
    return flags;
  }
  var DEFAULT_HOMOMER_PRIORITY = ["missing", "leastligands", "chainA"];
  var HOMOMER_CRITERION_LABELS = {
    missing: "Fewest missing residues",
    leastligands: "Fewest bound ligands",
    mostligands: "Most bound ligands",
    chainA: "Chain A"
  };
  function HomomerPriorityPicker({ priority, setPriority }) {
    const dragIndex = useRef(null);
    const [dragOverIdx, setDragOverIdx] = useState(null);
    const [draggingIdx, setDraggingIdx] = useState(null);
    const ligandsDirection = priority.includes("mostligands") ? "mostligands" : "leastligands";
    const onDragStart = (idx) => (e) => {
      dragIndex.current = idx;
      setDraggingIdx(idx);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(idx));
    };
    const onDragOver = (idx) => (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverIdx(idx);
    };
    const onDragEnd = () => {
      dragIndex.current = null;
      setDraggingIdx(null);
      setDragOverIdx(null);
    };
    const onDrop = (idx) => (e) => {
      e.preventDefault();
      const from = dragIndex.current;
      setDraggingIdx(null);
      setDragOverIdx(null);
      if (from === null || from === idx) return;
      const next = [...priority];
      const [moved] = next.splice(from, 1);
      next.splice(idx, 0, moved);
      setPriority(next);
      dragIndex.current = null;
    };
    const setLigandsDirection = (newDirection) => {
      setPriority(priority.map((c) => c === "leastligands" || c === "mostligands" ? newDirection : c));
    };
    return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(FieldHint, { style: { marginTop: -2, marginBottom: 8 } }, "Drag to set tiebreak priority. Each step only decides between chains still tied after the ones above it. (Preset order is recommended for most runs.)"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } }, priority.map((criterion, idx) => {
      const isLigandsRow = criterion === "leastligands" || criterion === "mostligands";
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          key: criterion,
          draggable: true,
          onDragStart: onDragStart(idx),
          onDragOver: onDragOver(idx),
          onDrop: onDrop(idx),
          onDragEnd,
          style: {
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 10px",
            background: dragOverIdx === idx && draggingIdx !== idx ? "var(--bg-2)" : "var(--bg-1)",
            border: dragOverIdx === idx && draggingIdx !== idx ? "1px solid var(--accent-bright)" : "1px solid var(--line-0)",
            borderRadius: "var(--radius-md)",
            cursor: "grab",
            opacity: draggingIdx === idx ? 0.5 : 1
          }
        },
        /* @__PURE__ */ React.createElement(Icon, { name: "grip", size: 13, style: { color: "var(--text-2)", flexShrink: 0 } }),
        /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--text-2)", fontFamily: "var(--font-mono)", width: 14, flexShrink: 0 } }, idx + 1),
        /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12.5, color: "var(--text-0)", flex: 1 } }, HOMOMER_CRITERION_LABELS[criterion]),
        isLigandsRow && /* @__PURE__ */ React.createElement(
          SegmentedControl,
          {
            value: ligandsDirection,
            onChange: setLigandsDirection,
            options: [{ value: "leastligands", label: "Fewest" }, { value: "mostligands", label: "Most" }]
          }
        )
      );
    })), /* @__PURE__ */ React.createElement(FieldHint, { style: { marginTop: 8 } }, "If every chain still ties after all of the above, the alphabetically-first chain is used."));
  }
  function StructureListEditor({ items, setItems, allowFormatToggle = true, referenceMode, referenceId, setReferenceId, positionalReference }) {
    const [draft, setDraft] = useState("");
    const dragIndex = useRef(null);
    const [dragOverIdx, setDragOverIdx] = useState(null);
    const [draggingIdx, setDraggingIdx] = useState(null);
    const add = () => {
      const id = draft.trim().toUpperCase();
      if (!id) return;
      if (items.some((i) => i.id === id)) {
        setDraft("");
        return;
      }
      setItems([...items, { id, format: "cif" }]);
      setDraft("");
    };
    const remove = (id) => setItems(items.filter((i) => i.id !== id));
    const toggleFormat = (id) => setItems(items.map((i) => i.id === id ? { ...i, format: i.format === "pdb" ? "cif" : "pdb" } : i));
    const makeReference = (id) => {
      const idx = items.findIndex((i) => i.id === id);
      if (idx <= 0) return;
      const next = [...items];
      const [moved] = next.splice(idx, 1);
      next.unshift(moved);
      setItems(next);
    };
    const onDragStart = (idx) => (e) => {
      dragIndex.current = idx;
      setDraggingIdx(idx);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(idx));
    };
    const onDragOver = (idx) => (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverIdx(idx);
    };
    const onDragEnd = () => {
      dragIndex.current = null;
      setDraggingIdx(null);
      setDragOverIdx(null);
    };
    const onDrop = (idx) => (e) => {
      e.preventDefault();
      const from = dragIndex.current;
      setDraggingIdx(null);
      setDragOverIdx(null);
      if (from === null || from === idx) return;
      const next = [...items];
      const [moved] = next.splice(from, 1);
      next.splice(idx, 0, moved);
      setItems(next);
      dragIndex.current = null;
    };
    return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, marginBottom: 12 } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement(TextInput, { mono: true, icon: "plus", placeholder: "Add PDB ID...", value: draft, onChange: (e) => setDraft(e.target.value), onKeyDown: (e) => e.key === "Enter" && add() })), /* @__PURE__ */ React.createElement(Button, { variant: "secondary", onClick: add, disabled: !draft.trim() }, "Add")), items.length === 0 ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "layers", title: "No structures added", description: "Add PDB IDs above, or drag files onto this page." }) : /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } }, items.map((item, idx) => /* @__PURE__ */ React.createElement(
      "div",
      {
        key: item.id,
        draggable: true,
        onDragStart: onDragStart(idx),
        onDragOver: onDragOver(idx),
        onDrop: onDrop(idx),
        onDragEnd,
        style: {
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "9px 12px",
          background: dragOverIdx === idx && draggingIdx !== idx ? "var(--bg-2)" : "var(--bg-1)",
          border: dragOverIdx === idx && draggingIdx !== idx ? "1px solid var(--accent-bright)" : "1px solid var(--line-0)",
          borderRadius: "var(--radius-md)",
          cursor: "grab",
          opacity: draggingIdx === idx ? 0.5 : 1
        }
      },
      /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-2)" } }, /* @__PURE__ */ React.createElement(Icon, { name: "grip", size: 14 })),
      /* @__PURE__ */ React.createElement("span", { className: "mono", style: { fontSize: 12, color: "var(--text-2)", width: 16 } }, idx + 1),
      /* @__PURE__ */ React.createElement("span", { className: "mono", style: { fontSize: 13, fontWeight: 600, flex: 1 } }, item.id),
      allowFormatToggle && AST_ID_RE.test(item.id) && /* @__PURE__ */ React.createElement(Tooltip, { text: "Imported file, read as it is", align: "left" }, /* @__PURE__ */ React.createElement(Badge, { tone: "neutral" }, "Import")),
      allowFormatToggle && EXTENDED_ONLY_ID_RE.test(item.id) && /* @__PURE__ */ React.createElement(Tooltip, { text: "Entries with extended PDB IDs are issued in mmCIF only", align: "left" }, /* @__PURE__ */ React.createElement(Badge, { tone: "violet" }, "mmCIF")),
      allowFormatToggle && !AST_ID_RE.test(item.id) && !EXTENDED_ONLY_ID_RE.test(item.id) && /* @__PURE__ */ React.createElement(Tooltip, { text: `Click to fetch as ${item.format === "cif" ? "legacy PDB" : "mmCIF"} instead`, align: "left" }, /* @__PURE__ */ React.createElement(Badge, { tone: item.format === "cif" ? "violet" : "neutral" }, /* @__PURE__ */ React.createElement("button", { onClick: () => toggleFormat(item.id), style: { background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, font: "inherit", display: "flex", alignItems: "center", gap: 3 } }, item.format === "cif" ? "mmCIF" : "PDB", /* @__PURE__ */ React.createElement(Icon, { name: "refresh", size: 10 })))),
      (referenceMode || positionalReference) && (() => {
        const isChecked = referenceMode ? referenceId === item.id : idx === 0;
        const handleClick = referenceMode ? () => setReferenceId(item.id) : () => makeReference(item.id);
        return /* @__PURE__ */ React.createElement("label", { style: { display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-1)", cursor: "pointer" } }, /* @__PURE__ */ React.createElement(
          "span",
          {
            onClick: handleClick,
            role: "radio",
            "aria-checked": isChecked,
            style: {
              width: 15,
              height: 15,
              borderRadius: "50%",
              flexShrink: 0,
              cursor: "pointer",
              border: `1.5px solid ${isChecked ? "var(--accent)" : "var(--line-1)"}`,
              background: isChecked ? "var(--accent)" : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 120ms ease",
              boxShadow: isChecked ? "0 0 0 3px var(--accent-wash)" : "none"
            }
          },
          isChecked && /* @__PURE__ */ React.createElement("span", { style: { width: 5, height: 5, borderRadius: "50%", background: "var(--text-on-accent)" } })
        ), "Reference");
      })(),
      /* @__PURE__ */ React.createElement(IconButton, { name: "x", title: "Remove", onClick: () => remove(item.id) })
    ))));
  }
  function OverlayPage({ setPage }) {
    const { runAstraCommand, addHistoryEntry, pendingStructureSeed, setPendingStructureSeed, isBusy, cancelRun, cancelRequestedRef, settings } = useApp();
    const toast = useToast();
    const [items, setItems] = useState([]);
    useEffect(() => {
      if (pendingStructureSeed?.kind === "overlay" && pendingStructureSeed.items?.length) {
        setItems(pendingStructureSeed.items);
        setPendingStructureSeed(null);
      }
    }, [pendingStructureSeed]);
    const [refMode, setRefMode] = useState("auto");
    const [referenceId, setReferenceId] = useState(null);
    const [busy, setBusy] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [runOutcome, setRunOutcome] = useState(null);
    const [runPrefix, setRunPrefix] = useState("");
    const [lines, setLines] = useState([]);
    const [quality, setQuality] = useState(settings.defaultQuality);
    const [opts, setOpts] = useState({ report: true, images: true, csv: false, renderOnly: false });
    useDefaultSync(settings, [{ key: "defaultQuality", current: quality, setCurrent: setQuality }], busy);
    const otherPageBusy = isBusy && !busy;
    const renderPlan = useMemo(() => {
      const comparisons = Math.max(1, items.length - 1);
      return { images: opts.images ? VIEWS_PER_RENDER * (1 + comparisons) : 0 };
    }, [items.length, opts.images]);
    const buildCommand = () => {
      const tokens = ["OVERLAY"];
      items.forEach((it, idx) => {
        tokens.push(it.id);
        if (it.format === "cif" && !AST_ID_RE.test(it.id)) tokens.push("-mmCIF");
      });
      if (refMode === "manual" && referenceId) tokens.push(`-reference${referenceId}`);
      tokens.push(...runOptionFlags(quality, opts));
      return tokens.join(" ");
    };
    const run = async () => {
      if (items.length < 2 || isBusy) return;
      setBusy(true);
      setCancelling(false);
      setLines([]);
      setRunOutcome(null);
      setRunPrefix(items.map((it) => it.id).join(" vs "));
      const startedAt = Date.now();
      try {
        const result = await runAstraCommand(buildCommand(), {
          originPage: "overlay",
          onLog: (entry) => setLines((l) => [...l, entry])
        });
        if (result?.cancelled || cancelRequestedRef.current) {
          await discardRunOutput(result?.lines, null, null, startedAt);
          setRunOutcome("cancelled");
          toast.push({ tone: "neutral", title: "Overlay cancelled", message: "The comparison was not finished, and nothing was saved." });
          return;
        }
        if (!result?.produced) {
          setRunOutcome("failed");
          toast.push({
            tone: "error",
            title: "Overlay did not run",
            message: "No output was produced. Check the structure IDs against the console output and try again."
          });
          return;
        }
        setRunOutcome("complete");
        addHistoryEntry({ kind: "overlay", label: `${items[0].id} vs ${items.slice(1).map((i) => i.id).join(", ")}`, status: "complete", meta: `${items.length} structures${refMode === "auto" ? "" : ` \xB7 ref: ${referenceId}`}`, sessionPath: result?.sessionPath || null, reportPath: result?.reportPath || null });
        toast.push({ tone: "success", title: "Overlay complete", message: `${items.length} structures aligned.` });
      } catch (e) {
        if (cancelRequestedRef.current) {
          await discardRunOutput(e?.lines, null, null, startedAt);
          setRunOutcome("cancelled");
          toast.push({ tone: "neutral", title: "Overlay cancelled", message: "The comparison was not finished, and nothing was saved." });
        } else {
          toast.push({ tone: "error", title: "Overlay failed", message: e?.message });
        }
      } finally {
        setBusy(false);
        setRunOutcome((prev) => prev || (cancelRequestedRef.current ? "cancelled" : "failed"));
        setCancelling(false);
      }
    };
    const handleCancel = async () => {
      setCancelling(true);
      const result = await cancelRun();
      if (!result.ok && result.error) {
        toast.push({ tone: "error", title: "Could not cancel", message: result.error });
        setCancelling(false);
      }
    };
    return /* @__PURE__ */ React.createElement(PageScroll, null, /* @__PURE__ */ React.createElement(BusyLock, { active: otherPageBusy }, /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 1040, margin: "0 auto", padding: "28px 32px 60px", display: "grid", gridTemplateColumns: "380px 1fr", gap: 24, alignItems: "start" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 18 } }, /* @__PURE__ */ React.createElement(Card, { style: { padding: 20 } }, /* @__PURE__ */ React.createElement(FieldLabel, null, "Structures (", items.length, ")"), /* @__PURE__ */ React.createElement(StructureListEditor, { items, setItems, referenceMode: refMode === "manual", referenceId, setReferenceId })), /* @__PURE__ */ React.createElement(Card, { style: { padding: 20 } }, /* @__PURE__ */ React.createElement(FieldLabel, null, "Reference selection"), /* @__PURE__ */ React.createElement(SegmentedControl, { value: refMode, onChange: setRefMode, options: [{ value: "auto", label: "Automatic" }, { value: "manual", label: "Manual" }] }), /* @__PURE__ */ React.createElement(FieldHint, null, refMode === "auto" ? "Astra3 selects the structure with the fewest bound ligands as reference." : "Choose the reference structure from the list above.")), /* @__PURE__ */ React.createElement(Card, { style: { padding: 20 } }, /* @__PURE__ */ React.createElement(RunOptionsPanel, { quality, setQuality, opts, setOpts })), /* @__PURE__ */ React.createElement(Card, { style: { padding: 20 } }, /* @__PURE__ */ React.createElement(SlowNetworkNotice, { active: busy && !runOutcome }), busy ? /* @__PURE__ */ React.createElement(Button, { variant: "danger", size: "lg", icon: cancelling ? void 0 : "x", onClick: handleCancel, disabled: cancelling, style: { width: "100%" } }, cancelling ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Spinner, { size: 14 }), "Cancelling\u2026") : "Cancel Overlay") : /* @__PURE__ */ React.createElement(Button, { variant: "primary", size: "lg", icon: "play", onClick: run, disabled: isBusy || items.length < 2, style: { width: "100%" } }, "Run Overlay"), /* @__PURE__ */ React.createElement("div", { className: "mono", style: { fontSize: 10.5, color: "var(--text-2)", marginTop: 10, textAlign: "center" } }, buildCommand()))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 16 } }, (busy || runOutcome) && /* @__PURE__ */ React.createElement(RunProgressBar, { lines, plan: renderPlan, outcome: runOutcome, prefix: runPrefix }), /* @__PURE__ */ React.createElement(LiveConsole, { lines: busy || lines.length ? lines : [{ text: "Add 2+ structures and run overlay to see live output.", tone: "muted" }], fillHeight: true, onRespond: () => setPage("console") })))));
  }
  function TerminiPage({ setPage }) {
    const { runAstraCommand, addHistoryEntry, pendingStructureSeed, setPendingStructureSeed, isBusy, cancelRun, cancelRequestedRef, settings } = useApp();
    const toast = useToast();
    const [items, setItems] = useState([]);
    useEffect(() => {
      if (pendingStructureSeed?.kind === "termini" && pendingStructureSeed.items?.length) {
        setItems(pendingStructureSeed.items);
        setPendingStructureSeed(null);
      }
    }, [pendingStructureSeed]);
    const [busy, setBusy] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [runOutcome, setRunOutcome] = useState(null);
    const [runPrefix, setRunPrefix] = useState("");
    const [lines, setLines] = useState([]);
    const [quality, setQuality] = useState(settings.defaultQuality);
    const [opts, setOpts] = useState({ report: true, images: true, csv: false, renderOnly: false });
    useDefaultSync(settings, [{ key: "defaultQuality", current: quality, setCurrent: setQuality }], busy);
    const [refMode, setRefMode] = useState("auto");
    const otherPageBusy = isBusy && !busy;
    const renderPlan = useMemo(() => {
      const comparisons = Math.max(1, items.length - 1);
      const perComparison = (opts.images ? VIEWS_PER_RENDER : 0) + (opts.termini_closeups === false ? 0 : CLOSEUPS_PER_COMPARISON);
      const combined = opts.images && comparisons > 1 ? VIEWS_PER_RENDER : 0;
      return { images: comparisons * perComparison + combined, comparisons };
    }, [items.length, opts.images, opts.termini_closeups]);
    const buildCommand = () => {
      const tokens = ["TERMINI"];
      items.forEach((it) => {
        tokens.push(it.id);
        if (it.format === "cif" && !AST_ID_RE.test(it.id)) tokens.push("-mmCIF");
      });
      if (refMode === "manual" && items.length > 0) tokens.push(`-reference${items[0].id}`);
      tokens.push(...runOptionFlags(quality, opts, true));
      return tokens.join(" ");
    };
    const run = async () => {
      if (items.length < 2 || isBusy) return;
      setBusy(true);
      setCancelling(false);
      setLines([]);
      setRunOutcome(null);
      setRunPrefix(items.map((it) => it.id).join(" vs "));
      const startedAt = Date.now();
      try {
        const result = await runAstraCommand(buildCommand(), {
          originPage: "termini",
          onLog: (entry) => setLines((l) => [...l, entry])
        });
        if (result?.cancelled || cancelRequestedRef.current) {
          await discardRunOutput(result?.lines, null, null, startedAt);
          setRunOutcome("cancelled");
          toast.push({ tone: "neutral", title: "Comparison cancelled", message: "The comparison was not finished, and nothing was saved." });
          return;
        }
        if (!result?.produced) {
          setRunOutcome("failed");
          toast.push({
            tone: "error",
            title: "Comparison did not run",
            message: "No output was produced. Check the structure IDs against the console output and try again."
          });
          return;
        }
        setRunOutcome("complete");
        addHistoryEntry({ kind: "termini", label: `${items[0].id} vs ${items.slice(1).map((i) => i.id).join(", ")}`, status: "complete", meta: `${items.length} structures`, sessionPath: result?.sessionPath || null, reportPath: result?.reportPath || null });
        toast.push({ tone: "success", title: "Termini comparison complete" });
      } catch (e) {
        if (cancelRequestedRef.current) {
          await discardRunOutput(e?.lines, null, null, startedAt);
          setRunOutcome("cancelled");
          toast.push({ tone: "neutral", title: "Comparison cancelled", message: "The comparison was not finished, and nothing was saved." });
        } else {
          toast.push({ tone: "error", title: "Comparison failed", message: e?.message });
        }
      } finally {
        setBusy(false);
        setRunOutcome((prev) => prev || (cancelRequestedRef.current ? "cancelled" : "failed"));
        setCancelling(false);
      }
    };
    const handleCancel = async () => {
      setCancelling(true);
      const result = await cancelRun();
      if (!result.ok && result.error) {
        toast.push({ tone: "error", title: "Could not cancel", message: result.error });
        setCancelling(false);
      }
    };
    return /* @__PURE__ */ React.createElement(PageScroll, null, /* @__PURE__ */ React.createElement(BusyLock, { active: otherPageBusy }, /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 1040, margin: "0 auto", padding: "28px 32px 60px", display: "grid", gridTemplateColumns: "380px 1fr", gap: 24, alignItems: "start" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 18 } }, /* @__PURE__ */ React.createElement(Card, { style: { padding: 20 } }, /* @__PURE__ */ React.createElement(FieldLabel, null, "Structures (", items.length, ")"), /* @__PURE__ */ React.createElement(StructureListEditor, { items, setItems, positionalReference: refMode === "manual" })), /* @__PURE__ */ React.createElement(Card, { style: { padding: 20 } }, /* @__PURE__ */ React.createElement(FieldLabel, null, "Reference selection"), /* @__PURE__ */ React.createElement(SegmentedControl, { value: refMode, onChange: setRefMode, options: [{ value: "auto", label: "Automatic" }, { value: "manual", label: "Manual" }] }), /* @__PURE__ */ React.createElement(FieldHint, null, refMode === "auto" ? "Astra3 selects the structure with the fewest bound ligands as reference." : 'Drag to reorder the list above, or use "Make reference" on any entry to move it to the top. The structure at the top is used as the reference.')), /* @__PURE__ */ React.createElement(Card, { style: { padding: 20 } }, /* @__PURE__ */ React.createElement(RunOptionsPanel, { quality, setQuality, opts, setOpts, showTerminiOptions: true })), /* @__PURE__ */ React.createElement(Card, { style: { padding: 20 } }, /* @__PURE__ */ React.createElement(SlowNetworkNotice, { active: busy && !runOutcome }), busy ? /* @__PURE__ */ React.createElement(Button, { variant: "danger", size: "lg", icon: cancelling ? void 0 : "x", onClick: handleCancel, disabled: cancelling, style: { width: "100%" } }, cancelling ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Spinner, { size: 14 }), "Cancelling\u2026") : "Cancel Comparison") : /* @__PURE__ */ React.createElement(Button, { variant: "primary", size: "lg", icon: "play", onClick: run, disabled: isBusy || items.length < 2, style: { width: "100%" } }, "Run Termini Comparison"), /* @__PURE__ */ React.createElement("div", { className: "mono", style: { fontSize: 10.5, color: "var(--text-2)", marginTop: 10, textAlign: "center" } }, buildCommand()))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 16 } }, (busy || runOutcome) && /* @__PURE__ */ React.createElement(RunProgressBar, { lines, plan: renderPlan, outcome: runOutcome, prefix: runPrefix }), /* @__PURE__ */ React.createElement(LiveConsole, { lines: busy || lines.length ? lines : [{ text: "Add a reference plus 1+ comparison structures.", tone: "muted" }], fillHeight: true, onRespond: () => setPage("console") })))));
  }
  function BatchPage({ setPage }) {
    const { runAstraCommand, addHistoryEntry, settings, isBusy, acquireLock, releaseLock, setCompletionPulse, cancelRun, sequenceCancelRef, sequenceActiveRef } = useApp();
    const toast = useToast();
    const [pasteText, setPasteText] = useState("");
    const [showFileImport, setShowFileImport] = useState(false);
    const [queue, setQueue] = useState([]);
    const [running, setRunning] = useState(false);
    const [currentIdx, setCurrentIdx] = useState(-1);
    const [lines, setLines] = useState([]);
    const [quality, setQuality] = useState(settings.defaultQuality);
    const [opts, setOpts] = useState({ report: true, images: true, csv: false, renderOnly: false });
    useDefaultSync(settings, [{ key: "defaultQuality", current: quality, setCurrent: setQuality }], running);
    const otherPageBusy = isBusy && !running;
    const { pendingStructureSeed, setPendingStructureSeed } = useApp();
    useEffect(() => {
      if (pendingStructureSeed?.kind === "batch" && pendingStructureSeed.items?.length && !running) {
        setPasteText(pendingStructureSeed.items.map((it) => it.id + (it.format === "cif" ? " -mmCIF" : "")).join("\n"));
        setPendingStructureSeed(null);
      }
    }, [pendingStructureSeed]);
    const parsePaste = () => {
      const jobs = pasteText.split("\n").map((l) => l.replace(/#.*/, "").trim()).filter(Boolean).map((line) => {
        const mmcif = /-mmCIF/i.test(line);
        const id = line.replace(/-mmCIF/i, "").trim().toUpperCase();
        return { id, format: mmcif ? "cif" : "pdb", status: "queued" };
      });
      setQueue(jobs);
      setLines([]);
      toast.push({ tone: "neutral", title: "Queue built", message: `${jobs.length} structure(s) queued.` });
    };
    const handleFiles = (files) => {
      const entry = files[0];
      const reader = new FileReader();
      reader.onload = () => {
        setPasteText(reader.result);
        setShowFileImport(false);
        toast.push({ tone: "success", title: "File loaded", message: entry.name });
      };
      reader.readAsText(entry.file);
    };
    const cancelRequestedRef = sequenceCancelRef;
    const [batchCancelling, setBatchCancelling] = useState(false);
    const [itemLines, setItemLines] = useState([]);
    const [queueStartedAt, setQueueStartedAt] = useState(0);
    const [pendingConfirm, setPendingConfirm] = useState(null);
    const discardPartialOutput = async (job, lines2, startedAt) => {
      const removed = await discardRunOutput(lines2, job.id, settings.outputDir, startedAt);
      if (removed) {
        toast.push({
          tone: "neutral",
          title: `${job.id} was not finished`,
          message: "Its partial output has been removed."
        });
      }
    };
    const runQueue = async (resumeFailedOnly = false) => {
      if (isBusy) return;
      const targetCount = (resumeFailedOnly ? queue.filter((q) => q.status === "failed") : queue).length;
      if (settings.confirmBeforeBatch !== false && targetCount >= 10 && !pendingConfirm) {
        setPendingConfirm({ resumeFailedOnly, count: targetCount });
        return;
      }
      setPendingConfirm(null);
      cancelRequestedRef.current = false;
      sequenceActiveRef.current = true;
      setBatchCancelling(false);
      const lockToken = acquireLock();
      if (lockToken === null) return;
      setRunning(true);
      setQueueStartedAt(Date.now());
      setLines([]);
      setItemLines([]);
      if (!resumeFailedOnly) {
        setQueue((q) => q.map((j) => ({ ...j, status: "queued" })));
      }
      const targets = resumeFailedOnly ? queue.filter((q) => q.status === "failed") : queue;
      let cancelled = false;
      const createdEntryIds = [];
      for (const job of targets) {
        if (cancelRequestedRef.current) {
          cancelled = true;
          break;
        }
        const idx = queue.findIndex((q) => q.id === job.id);
        setCurrentIdx(idx);
        setQueue((q) => q.map((j, i) => i === idx ? { ...j, status: "running" } : j));
        const cmd = [job.id, job.format === "cif" && !AST_ID_RE.test(job.id) ? "-mmCIF" : "", ...runOptionFlags(quality, opts)].filter(Boolean).join(" ");
        const itemStartedAt = Date.now();
        setItemLines([]);
        setLines((l) => [...l, { text: `> ${cmd}`, tone: "command" }]);
        try {
          const result = await runAstraCommand(cmd, {
            silent: true,
            holdLock: true,
            lockToken,
            originPage: "batch",
            onLog: (entry) => {
              setLines((l) => [...l, entry]);
              setItemLines((l) => [...l, entry]);
            }
          });
          const wasCancelled = result?.cancelled === true || result?.status === "cancelled";
          const producedOutput = result?.produced === true;
          setQueue((q) => q.map((j, i) => i === idx ? { ...j, status: wasCancelled ? "cancelled" : producedOutput ? "complete" : "failed" } : j));
          if (wasCancelled) {
            await discardPartialOutput(job, result?.lines, itemStartedAt);
            cancelled = true;
            break;
          }
          if (!producedOutput) {
            setLines((l) => [...l, { text: `${job.id}: nothing was produced; skipped.`, tone: "error" }]);
            continue;
          }
          const createdId = addHistoryEntry({
            kind: "single",
            label: job.id,
            status: "complete",
            meta: `${quality[0].toUpperCase()}${quality.slice(1)} \xB7 ${structureSourceLabel(job.id, job.format)} \xB7 via Batch`,
            sessionPath: result?.sessionPath || null,
            reportPath: result?.reportPath || null
          });
          if (createdId) createdEntryIds.push(createdId);
        } catch (e) {
          if (cancelRequestedRef.current) {
            setLines((l) => [...l, { text: "Cancelled.", tone: "warning" }]);
            setQueue((q) => q.map((j, i) => i === idx ? { ...j, status: "cancelled" } : j));
            await discardPartialOutput(job, e?.lines, itemStartedAt);
            cancelled = true;
            break;
          }
          setLines((l) => [...l, { text: e?.message || "Command failed", tone: "error" }]);
          setQueue((q) => q.map((j, i) => i === idx ? { ...j, status: "failed" } : j));
        }
      }
      setCurrentIdx(-1);
      sequenceActiveRef.current = false;
      setRunning(false);
      if (cancelled) {
        setQueue((q) => q.map((j) => j.status === "queued" ? { ...j, status: "cancelled" } : j));
      }
      releaseLock();
      const finalQueue = await new Promise((resolve) => setQueue((q) => {
        resolve(q);
        return q;
      }));
      const succeeded = finalQueue.filter((j) => j.status === "complete").length;
      const allDone = !cancelled && succeeded === finalQueue.length;
      if (!cancelled || succeeded > 0) {
        addHistoryEntry({
          kind: "batch",
          label: `Batch: ${finalQueue.length} structures`,
          // Cancelled is not failed: the structures that did finish are real
          // results, and this entry is how they are reached.
          status: cancelled ? "cancelled" : allDone ? "complete" : "failed",
          meta: cancelled ? `Cancelled at ${succeeded}/${finalQueue.length}` : `${succeeded}/${finalQueue.length} succeeded`,
          // Structures this batch completed, for the Reports page's dropdown; a batch
          // has no report of its own.
          batchIds: finalQueue.filter((j) => j.status === "complete").map((j) => j.id),
          // The exact History entries this batch created. Matching on structure IDs
          // let an overlapping re-run claim another batch's runs.
          batchEntryIds: createdEntryIds.slice()
        });
      }
      toast.push({
        tone: cancelled ? "warning" : allDone ? "success" : "warning",
        title: cancelled ? "Batch cancelled" : "Batch finished",
        message: cancelled ? `Stopped after ${succeeded} of ${finalQueue.length}. The rest were not started.` : `${succeeded}/${finalQueue.length} succeeded.`
      });
      if (allDone && finalQueue.length > 0) {
        setCompletionPulse(Math.random());
      }
    };
    const failedCount = queue.filter((q) => q.status === "failed").length;
    const completeCount = queue.filter((q) => q.status === "complete").length;
    const settledCount = completeCount + failedCount;
    const itemPlan = useMemo(() => ({ images: opts.images ? VIEWS_PER_RENDER : 0 }), [opts.images]);
    const statusIcon = { queued: "clock", running: "refresh", complete: "check", failed: "x", cancelled: "x" };
    const statusColor = {
      queued: "var(--text-2)",
      running: "var(--amber)",
      complete: "var(--sage)",
      failed: "var(--coral)",
      cancelled: "var(--coral)"
    };
    return /* @__PURE__ */ React.createElement(PageScroll, null, /* @__PURE__ */ React.createElement(BusyLock, { active: otherPageBusy }, /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 1040, margin: "0 auto", padding: "28px 32px 60px", display: "grid", gridTemplateColumns: "380px 1fr", gap: 24, alignItems: "start" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 18 } }, /* @__PURE__ */ React.createElement(Card, { style: { padding: 20 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 } }, /* @__PURE__ */ React.createElement(FieldLabel, { style: { marginBottom: 0 } }, "Structure IDs"), /* @__PURE__ */ React.createElement(Tooltip, { text: "Import from a .txt file instead" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setShowFileImport((v) => !v),
        style: {
          display: "flex",
          alignItems: "center",
          gap: 5,
          background: showFileImport ? "var(--accent-wash)" : "transparent",
          color: showFileImport ? "var(--accent-bright)" : "var(--text-1)",
          border: "1px solid var(--line-1)",
          borderRadius: "var(--radius-sm)",
          padding: "4px 8px",
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer"
        }
      },
      /* @__PURE__ */ React.createElement(Icon, { name: "upload", size: 12 }),
      ".txt file"
    ))), /* @__PURE__ */ React.createElement(
      "textarea",
      {
        value: pasteText,
        onChange: (e) => setPasteText(e.target.value),
        rows: 6,
        className: "mono",
        style: { width: "100%", background: "var(--bg-1)", border: "1px solid var(--line-1)", borderRadius: "var(--radius-md)", color: "var(--text-0)", padding: 10, fontSize: 12.5, resize: "vertical", outline: "none" },
        placeholder: "1AKE\n4AKE\n1ERJ -mmCIF"
      }
    ), /* @__PURE__ */ React.createElement(FieldHint, null, "One ID per line. Add ", /* @__PURE__ */ React.createElement("code", { className: "mono" }, "-mmCIF"), " after an ID to fetch it as mmCIF."), showFileImport && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 10 } }, /* @__PURE__ */ React.createElement(DropZone, { onFiles: handleFiles, accept: ".txt,.csv,.list", compact: true })), /* @__PURE__ */ React.createElement(Button, { variant: "secondary", size: "md", onClick: parsePaste, style: { width: "100%", marginTop: 12 } }, "Build Queue")), /* @__PURE__ */ React.createElement(Card, { style: { padding: 20 } }, /* @__PURE__ */ React.createElement(RunOptionsPanel, { quality, setQuality, opts, setOpts, showHomomerOptions: true })), queue.length > 0 && /* @__PURE__ */ React.createElement(Card, { style: { padding: 20 } }, pendingConfirm && /* @__PURE__ */ React.createElement("div", { className: "mono", style: { marginBottom: 10, padding: 14, border: "1px solid var(--amber)", borderRadius: "var(--radius-sm)", background: "var(--bg-2)", boxShadow: "var(--shadow-md)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--amber)", fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement(Icon, { name: "alertTriangle", size: 12 }), " Astra3 needs your input"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5, color: "var(--text-0)", marginBottom: 12 } }, "Run ", pendingConfirm.count, " structures?"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement(Button, { variant: "confirm", size: "sm", className: "mono", onClick: () => runQueue(pendingConfirm.resumeFailedOnly) }, "y"), /* @__PURE__ */ React.createElement(Button, { variant: "decline", size: "sm", className: "mono", onClick: () => setPendingConfirm(null) }, "n")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: "var(--text-2)", marginTop: 10 } }, "Batch will not run until you answer.")), /* @__PURE__ */ React.createElement(Button, { variant: "primary", size: "lg", icon: running ? void 0 : "play", onClick: () => runQueue(false), disabled: isBusy, style: { width: "100%" } }, running ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Spinner, { size: 14 }), "Running ", settledCount, "/", queue.length, "\u2026") : `Run Batch (${queue.length})`), running && /* @__PURE__ */ React.createElement(
      Button,
      {
        variant: "danger",
        size: "md",
        icon: batchCancelling ? void 0 : "x",
        disabled: batchCancelling,
        onClick: async () => {
          setBatchCancelling(true);
          const result = await cancelRun();
          if (result?.ok) {
            toast.push({ tone: "neutral", title: "Cancelling batch", message: result.note || "Stopping after the current structure." });
          } else if (result?.error) {
            toast.push({ tone: "error", title: "Could not cancel", message: result.error });
          }
          setBatchCancelling(false);
        },
        style: { width: "100%", marginTop: 8 }
      },
      batchCancelling ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Spinner, { size: 14 }), "Stopping\u2026") : "Cancel batch"
    ), !running && failedCount > 0 && /* @__PURE__ */ React.createElement(Button, { variant: "secondary", size: "md", icon: "refresh", onClick: () => runQueue(true), disabled: isBusy, style: { width: "100%", marginTop: 8 } }, "Resume ", failedCount, " failed job", failedCount > 1 ? "s" : ""))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 16 } }, queue.length > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(SlowNetworkNotice, { active: running }), /* @__PURE__ */ React.createElement(
      BatchProgressBar,
      {
        queue,
        itemLines,
        itemPlan,
        running,
        startedAt: queueStartedAt
      }
    )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(SectionLabel, null, "Queue"), queue.length === 0 ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "batch", title: "No queue built yet", description: "Paste IDs or drop a .txt file, then click Build Queue." }) : /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 5, maxHeight: 230, overflowY: "auto" } }, queue.map((job, i) => /* @__PURE__ */ React.createElement("div", { key: job.id + i, style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "8px 12px",
      borderRadius: "var(--radius-md)",
      background: currentIdx === i ? "var(--accent-wash)" : "var(--bg-1)",
      border: "1px solid var(--line-0)"
    } }, /* @__PURE__ */ React.createElement("span", { style: { color: statusColor[job.status] }, className: job.status === "running" ? "astra-spin" : "" }, /* @__PURE__ */ React.createElement(Icon, { name: statusIcon[job.status], size: 14 })), /* @__PURE__ */ React.createElement("span", { className: "mono", style: { fontSize: 12.5, fontWeight: 600, flex: 1 } }, job.id), AST_ID_RE.test(job.id) ? /* @__PURE__ */ React.createElement(Badge, { tone: "neutral" }, "Import") : job.format === "cif" && /* @__PURE__ */ React.createElement(Badge, { tone: "violet" }, "mmCIF"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--text-2)", textTransform: "capitalize" } }, job.status))))), /* @__PURE__ */ React.createElement(LiveConsole, { lines: running || lines.length ? lines : [{ text: "Batch output will appear here while running.", tone: "muted" }], height: 220, onRespond: () => setPage("console") })))));
  }
  function RcsbThumb({ urls, size = 64 }) {
    const [attempt, setAttempt] = useState(0);
    if (!urls || attempt >= urls.length) return null;
    return /* @__PURE__ */ React.createElement(
      "img",
      {
        src: urls[attempt],
        alt: "",
        loading: "lazy",
        width: size,
        height: size,
        onError: () => setAttempt((n) => n + 1),
        style: {
          width: size,
          height: size,
          objectFit: "contain",
          borderRadius: 6,
          background: "#fff",
          border: "1px solid var(--line-0)",
          flexShrink: 0
        }
      }
    );
  }
  function RelatedPage({ setPage }) {
    const { setPendingStructureSeed, settings } = useApp();
    const toast = useToast();
    const [pdbId, setPdbId] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [selected, setSelected] = useState(() => /* @__PURE__ */ new Set());
    const [ligandFilter, setLigandFilter] = useState("all");
    const [resFilter, setResFilter] = useState("any");
    const [mutantFilter, setMutantFilter] = useState("all");
    const [regionFilter, setRegionFilter] = useState("same");
    const [selectedLigands, setSelectedLigands] = useState([]);
    const [ligandMatch, setLigandMatch] = useState("any");
    const [ligandSearch, setLigandSearch] = useState("");
    const [selectedOrganisms, setSelectedOrganisms] = useState([]);
    const [showFilters, setShowFilters] = useState(false);
    const pageRef = useRef(null);
    const scrollerRef = useRef(null);
    const [showTop, setShowTop] = useState(false);
    const resultsRef = useRef(null);
    const [findOpen, setFindOpen] = useState(false);
    const [findQuery, setFindQuery] = useState("");
    const [findStatus, setFindStatus] = useState(null);
    useFindShortcut(() => setFindOpen(true));
    const closeFind = () => {
      setFindOpen(false);
      setFindQuery("");
      setFindStatus(null);
    };
    useEffect(() => {
      if (!pageRef.current) return void 0;
      let el = pageRef.current.parentElement;
      while (el && el.scrollHeight <= el.clientHeight + 4) el = el.parentElement;
      scrollerRef.current = el;
      if (!el) return void 0;
      const onScroll = () => setShowTop(el.scrollTop > 500);
      el.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
      return () => el.removeEventListener("scroll", onScroll);
    }, [result]);
    const backToTop = () => {
      const el = scrollerRef.current;
      if (el) el.scrollTo({ top: 0, behavior: "smooth" });
    };
    const search = async (id, entityId) => {
      const clean = String(id || "").trim().toUpperCase();
      if (/^AST-\d+$/.test(clean)) {
        setResult({ ok: false, incompatible: true, error: `${clean} is an imported structure, which Related Structures cannot use: it searches the Protein Data Bank from a published entry. If the imported file is a PDB entry (for example 3FXI), search that PDB ID instead.` });
        return;
      }
      if (!/^(?:[A-Z0-9]{4}|PDB_[A-Z0-9]{8})$/.test(clean)) {
        toast.push({ tone: "error", title: "Enter a PDB ID", message: "Related structures need a PDB ID, for example 1AKE or pdb_00001ake." });
        return;
      }
      setLoading(true);
      setSelected(/* @__PURE__ */ new Set());
      if (!entityId) resetFilters();
      try {
        const r = await window.astra3Native.findRelatedStructures({ pdbId: clean, entityId });
        setResult(r);
      } catch (e) {
        setResult({ ok: false, error: e.message });
      } finally {
        setLoading(false);
      }
    };
    const hits = result?.ok ? result.hits : [];
    const minCoverage = result?.thresholds?.sameRegionCoverage ?? 0.7;
    const visible = useMemo(() => hits.filter((h) => {
      if (ligandFilter === "bound" && h.ligandFree) return false;
      if (ligandFilter === "free" && !h.ligandFree) return false;
      if (resFilter !== "any" && (h.resolution == null || h.resolution > parseFloat(resFilter))) return false;
      if (mutantFilter === "hide" && h.mutations > 0) return false;
      if (regionFilter === "same" && h.coverage != null && h.coverage < minCoverage) return false;
      if (selectedLigands.length) {
        const own = h.ligands || [];
        const ok = ligandMatch === "all" ? selectedLigands.every((l) => own.includes(l)) : selectedLigands.some((l) => own.includes(l));
        if (!ok) return false;
      }
      if (selectedOrganisms.length && !selectedOrganisms.includes((h.organism || "").trim().toLowerCase())) return false;
      return true;
    }), [hits, ligandFilter, resFilter, mutantFilter, regionFilter, minCoverage, selectedLigands, ligandMatch, selectedOrganisms]);
    const activeFilters = [
      regionFilter !== "same",
      ligandFilter !== "all",
      resFilter !== "any",
      mutantFilter !== "all",
      selectedLigands.length > 0,
      selectedOrganisms.length > 0
    ].filter(Boolean).length;
    function resetFilters() {
      setRegionFilter("same");
      setLigandFilter("all");
      setResFilter("any");
      setMutantFilter("all");
      setSelectedLigands([]);
      setLigandMatch("any");
      setLigandSearch("");
      setSelectedOrganisms([]);
    }
    const toggleIn = (setter) => (value) => setter((prev) => prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]);
    const toggleLigand = toggleIn(setSelectedLigands);
    const toggleOrganism = toggleIn(setSelectedOrganisms);
    const selectStyle = {
      background: "var(--bg-1)",
      color: "var(--text-0)",
      border: "1px solid var(--line-1)",
      borderRadius: "var(--radius-sm)",
      padding: "5px 8px",
      fontSize: 12,
      maxWidth: 320
    };
    const toggle = (id) => setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    const chosen = visible.filter((h) => selected.has(h.entryId)).map((h) => h.entryId);
    const format = settings.defaultFormat === "pdb" ? "pdb" : "cif";
    const send = (kind, ids) => {
      setPendingStructureSeed({ kind, items: ids.map((id) => ({ id, format })) });
      setPage(kind);
    };
    const pct = (x) => `${Math.round(x * 100)}%`;
    const signed = (n) => n > 0 ? `+${n}` : String(n);
    const severityColor = { high: "var(--coral)", medium: "var(--gold, #b8860b)", low: "var(--text-1)" };
    const suggestionLabel = { overlay: "Overlay", termini: "Termini", state: "Ligand contrast" };
    return /* @__PURE__ */ React.createElement(PageScroll, null, findOpen && /* @__PURE__ */ React.createElement("div", { style: { position: "sticky", top: 12, zIndex: 20, height: 0, display: "flex", justifyContent: "flex-end", paddingRight: 24 } }, /* @__PURE__ */ React.createElement(
      ReadmeFindBar,
      {
        query: findQuery,
        setQuery: setFindQuery,
        status: findStatus,
        setStatus: setFindStatus,
        contentRef: resultsRef,
        placeholder: "Find in results\u2026",
        autoFocus: true,
        onClose: closeFind,
        contentVersion: `${result?.query?.entryId || ""}:${visible.length}:${visible[0]?.entryId || ""}:${visible[visible.length - 1]?.entryId || ""}`,
        style: {
          height: "fit-content",
          marginBottom: 0,
          padding: 6,
          background: "var(--bg-2)",
          border: "1px solid var(--line-1)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-lg)"
        }
      }
    )), /* @__PURE__ */ React.createElement("div", { ref: pageRef, style: { maxWidth: 980, margin: "0 auto", padding: "28px 32px 120px" } }, /* @__PURE__ */ React.createElement(SectionLabel, null, "Find related structures"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1, maxWidth: 340 } }, /* @__PURE__ */ React.createElement(
      TextInput,
      {
        icon: "search",
        mono: true,
        placeholder: "PDB ID, e.g. 1AKE",
        value: pdbId,
        onChange: (e) => setPdbId(e.target.value),
        onKeyDown: (e) => {
          if (e.key === "Enter") search(pdbId);
        }
      }
    )), /* @__PURE__ */ React.createElement(Button, { variant: "primary", icon: "search", disabled: loading, onClick: () => search(pdbId) }, loading ? "Searching\u2026" : "Find related")), /* @__PURE__ */ React.createElement(FieldHint, null, "Finds every experimental PDB entry of the same protein (same UniProt entry), then checks each one against your structure before you run anything."), loading && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-1)", marginTop: 18 } }, /* @__PURE__ */ React.createElement(Spinner, { size: 13 }), " Searching the Protein Data Bank\u2026"), !loading && result && !result.ok && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 22 } }, /* @__PURE__ */ React.createElement(EmptyState, { icon: "alertTriangle", title: result.incompatible ? "Not compatible with imported structures" : "Could not find related structures", description: result.error })), !loading && result?.ok && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 22 } }, /* @__PURE__ */ React.createElement(Card, { style: { padding: "14px 16px" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 14, alignItems: "flex-start" } }, /* @__PURE__ */ React.createElement(RcsbThumb, { key: `q-${result.query.entryId}`, urls: result.query.thumbnails, size: 72 }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("span", { className: "mono", style: { fontWeight: 700, fontSize: 14 } }, result.query.entryId), /* @__PURE__ */ React.createElement(Badge, { tone: "accent" }, result.query.method || "Unknown method", result.query.resolution != null ? ` \xB7 ${result.query.resolution.toFixed(2)} \xC5` : ""), result.query.ligands.length ? /* @__PURE__ */ React.createElement(Badge, { tone: "violet" }, result.query.ligands.join(", ")) : /* @__PURE__ */ React.createElement(Badge, { tone: "neutral" }, "Ligand-free")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5, color: "var(--text-1)", marginTop: 6 } }, result.query.description || "Protein", " \xB7 chain", result.query.chains.length === 1 ? "" : "s", " ", result.query.chains.join(", "), result.basis === "uniprot" ? /* @__PURE__ */ React.createElement(React.Fragment, null, " \xB7 UniProt ", /* @__PURE__ */ React.createElement("span", { className: "mono" }, result.query.accession), result.query.regions.length ? ` residues ${result.query.regions[0][0]}-${result.query.regions[result.query.regions.length - 1][1]}` : "") : " \xB7 no UniProt mapping, matched by sequence (\u226590% identity)"))), result.query.entities.length > 1 && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--text-1)", marginBottom: 6 } }, "This entry has several proteins. Search for:"), /* @__PURE__ */ React.createElement(
      SegmentedControl,
      {
        value: result.query.entityId,
        onChange: (eid) => search(result.query.entryId, eid),
        options: result.query.entities.map((e) => ({ value: e.entityId, label: `${e.description || "Entity " + e.entityId} (${e.chains.join(",")})` }))
      }
    ))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center", margin: "18px 0 10px" } }, /* @__PURE__ */ React.createElement(
      Button,
      {
        variant: showFilters ? "primary" : "secondary",
        size: "sm",
        icon: "search",
        onClick: () => setShowFilters((v) => !v)
      },
      "Filters",
      activeFilters ? ` (${activeFilters})` : ""
    ), activeFilters > 0 && /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", onClick: resetFilters }, "Reset")), showFilters && /* @__PURE__ */ React.createElement(Card, { style: { padding: "14px 16px", marginBottom: 12 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center" } }, /* @__PURE__ */ React.createElement(
      SegmentedControl,
      {
        value: regionFilter,
        onChange: setRegionFilter,
        options: [{ value: "same", label: "Same region" }, { value: "all", label: "Any coverage" }]
      }
    ), /* @__PURE__ */ React.createElement(
      SegmentedControl,
      {
        value: ligandFilter,
        onChange: setLigandFilter,
        options: [{ value: "all", label: "All" }, { value: "bound", label: "With ligands" }, { value: "free", label: "Ligand-free" }]
      }
    ), /* @__PURE__ */ React.createElement(
      SegmentedControl,
      {
        value: resFilter,
        onChange: setResFilter,
        options: [{ value: "any", label: "Any resolution" }, { value: "2.0", label: "\u2264 2.0 \xC5" }, { value: "2.5", label: "\u2264 2.5 \xC5" }, { value: "3.0", label: "\u2264 3.0 \xC5" }]
      }
    ), /* @__PURE__ */ React.createElement(
      SegmentedControl,
      {
        value: mutantFilter,
        onChange: setMutantFilter,
        options: [{ value: "all", label: "Include mutants" }, { value: "hide", label: "Hide mutants" }]
      }
    )), (result.summary.ligandOptions?.length > 0 || result.summary.organismOptions?.length > 1) && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start", marginTop: 14 } }, result.summary.ligandOptions?.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { flex: "1 1 360px", minWidth: 280 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, fontWeight: 600 } }, "Bound ligands"), selectedLigands.length > 1 && /* @__PURE__ */ React.createElement(
      SegmentedControl,
      {
        value: ligandMatch,
        onChange: setLigandMatch,
        options: [{ value: "any", label: "Any selected" }, { value: "all", label: "All selected" }]
      }
    ), selectedLigands.length > 0 && /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", onClick: () => setSelectedLigands([]) }, "Clear")), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        placeholder: "Search ligands by code or name",
        value: ligandSearch,
        onChange: (e) => setLigandSearch(e.target.value),
        style: { ...selectStyle, width: "100%", maxWidth: "none", marginBottom: 6 }
      }
    ), /* @__PURE__ */ React.createElement("div", { style: { maxHeight: 190, overflowY: "auto", border: "1px solid var(--line-0)", borderRadius: "var(--radius-sm)", padding: "4px 6px" } }, result.summary.ligandOptions.filter((o) => {
      const q = ligandSearch.trim().toLowerCase();
      return !q || o.id.toLowerCase().includes(q) || (o.name || "").toLowerCase().includes(q);
    }).map((o) => /* @__PURE__ */ React.createElement("label", { key: o.id, style: { display: "flex", alignItems: "baseline", gap: 7, fontSize: 12, padding: "3px 2px", cursor: "pointer" } }, /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "checkbox",
        checked: selectedLigands.includes(o.id),
        onChange: () => toggleLigand(o.id),
        style: { accentColor: "var(--accent)" }
      }
    ), /* @__PURE__ */ React.createElement("span", { className: "mono", style: { fontWeight: 600 } }, o.id), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }, title: o.name || "" }, o.name || ""), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-1)", whiteSpace: "nowrap" } }, o.count, " of ", result.summary.count, " (", Math.round(o.count / result.summary.count * 100), "%)"))))), result.summary.organismOptions?.length > 1 && /* @__PURE__ */ React.createElement("div", { style: { flex: "0 1 260px", minWidth: 220 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, fontWeight: 600 } }, "Source organisms"), selectedOrganisms.length > 0 && /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", onClick: () => setSelectedOrganisms([]) }, "Clear")), /* @__PURE__ */ React.createElement("div", { style: { maxHeight: 226, overflowY: "auto", border: "1px solid var(--line-0)", borderRadius: "var(--radius-sm)", padding: "4px 6px" } }, result.summary.organismOptions.map((o) => /* @__PURE__ */ React.createElement("label", { key: o.key, style: { display: "flex", alignItems: "baseline", gap: 7, fontSize: 12, padding: "3px 2px", cursor: "pointer" } }, /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "checkbox",
        checked: selectedOrganisms.includes(o.key),
        onChange: () => toggleOrganism(o.key),
        style: { accentColor: "var(--accent)" }
      }
    ), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, fontStyle: "italic" } }, o.name), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-1)" } }, o.count))))))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--text-1)", marginBottom: 10 } }, visible.length, " of ", result.summary.count, " shown \xB7 ", result.summary.ligandBound, " with ligands \xB7 ", result.summary.ligandFree, " ligand-free \xB7 ", result.summary.mutants, " with mutations", result.summary.truncated && ` \xB7 first ${result.summary.count} of ${result.summary.totalFound} entries`), visible.length === 0 ? result.summary.count ? /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(
      EmptyState,
      {
        icon: "search",
        title: `Your filters hide all ${result.summary.count} results`,
        description: "None of the related structures matches every active filter. Reset them, or open Filters to loosen one."
      }
    ), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "center", marginTop: 10 } }, /* @__PURE__ */ React.createElement(Button, { variant: "primary", size: "sm", onClick: resetFilters }, "Reset filters"))) : /* @__PURE__ */ React.createElement(EmptyState, { icon: "search", title: "No related entries", description: "No other experimental entries of this protein are in the PDB." }) : /* @__PURE__ */ React.createElement("div", { ref: resultsRef, style: { display: "flex", flexDirection: "column", gap: 6, position: "relative" } }, visible.map((h) => {
      const isChecked = selected.has(h.entryId);
      return /* @__PURE__ */ React.createElement(Card, { key: h.entryId, style: { padding: "12px 14px", borderColor: isChecked ? "var(--accent)" : "var(--line-0)" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 12, alignItems: "flex-start" } }, /* @__PURE__ */ React.createElement("div", { onClick: () => toggle(h.entryId), style: {
        width: 18,
        height: 18,
        borderRadius: 5,
        flexShrink: 0,
        cursor: "pointer",
        marginTop: 2,
        border: `1.5px solid ${isChecked ? "var(--accent)" : "var(--line-1)"}`,
        background: isChecked ? "var(--accent)" : "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      } }, isChecked && /* @__PURE__ */ React.createElement(Icon, { name: "check", size: 12, stroke: "var(--text-on-accent)", strokeWidth: 2.6 })), /* @__PURE__ */ React.createElement(RcsbThumb, { key: h.entryId, urls: h.thumbnails, size: 64 }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("span", { className: "mono", style: { fontSize: 13, fontWeight: 700 } }, h.entryId), /* @__PURE__ */ React.createElement(Badge, { tone: "accent" }, h.method || "Unknown", h.resolution != null ? ` \xB7 ${h.resolution.toFixed(2)} \xC5` : ""), h.ligandFree ? /* @__PURE__ */ React.createElement(Badge, { tone: "neutral" }, "Ligand-free") : h.ligands.length > 0 && /* @__PURE__ */ React.createElement(Badge, { tone: "violet" }, h.ligands.slice(0, 4).join(", "), h.ligands.length > 4 ? "\u2026" : ""), (h.carbohydrates || []).length > 0 && /* @__PURE__ */ React.createElement(Badge, { tone: "violet" }, "Carbohydrate"), h.ionsOnly && /* @__PURE__ */ React.createElement(Badge, { tone: "neutral" }, "Ions: ", h.ions.slice(0, 3).join(", ")), h.mutations > 0 && /* @__PURE__ */ React.createElement(Badge, { tone: "warning" }, "Mutant"), h.released && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11.5, color: "var(--text-1)" } }, h.released.slice(0, 4))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--text-1)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: h.title || "" }, h.title), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--text-1)", marginTop: 3 } }, h.coverage != null ? /* @__PURE__ */ React.createElement(React.Fragment, null, "UniProt ", h.uniprotRange, " \xB7 covers ", pct(h.coverage), " of ", result.query.entryId, "'s region \xB7 construct N ", signed(h.nOffset), ", C ", signed(h.cOffset)) : "Region comparison unavailable (no UniProt mapping)", h.copies > 1 ? ` \xB7 ${h.copies} copies` : ""), h.suggestions.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 3, marginTop: 7 } }, h.suggestions.map((s, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", gap: 7, alignItems: "baseline", fontSize: 12 } }, /* @__PURE__ */ React.createElement(Badge, { tone: "success" }, suggestionLabel[s.kind] || s.kind), /* @__PURE__ */ React.createElement("span", null, s.reason)))), h.issues.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 3, marginTop: 7 } }, h.issues.map((it, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", gap: 7, alignItems: "flex-start", fontSize: 12, color: severityColor[it.severity] || "var(--text-1)" } }, /* @__PURE__ */ React.createElement(Icon, { name: "alertTriangle", size: 13, style: { flexShrink: 0, marginTop: 2 } }), /* @__PURE__ */ React.createElement("span", null, it.text))))), /* @__PURE__ */ React.createElement(Button, { size: "sm", variant: "ghost", icon: "play", onClick: () => send("single", [h.entryId]) }, "Analyze")));
    })), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--text-1)", marginTop: 16, lineHeight: 1.5 } }, "Source: ", result.source, ", retrieved ", displayDate(result.retrieved, true), ". Related means the same ", result.basis === "uniprot" ? `UniProt entry (${result.query.accession})` : "sequence at \u226590% identity", ". Same region: at least ", pct(minCoverage), " of ", result.query.entryId, "'s UniProt range. Termini suggested when construct boundaries differ by ", result.thresholds.terminusOffsetCorrectable, " residues or fewer. Sulfate, glycerol and other common crystallization additives do not count as ligands."))), showTop && /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: backToTop,
        "aria-label": "Back to top",
        style: {
          position: "sticky",
          bottom: 16,
          left: "100%",
          marginRight: 24,
          width: 38,
          height: 38,
          borderRadius: "50%",
          border: "1px solid var(--line-1)",
          background: "var(--bg-1)",
          color: "var(--text-0)",
          cursor: "pointer",
          boxShadow: "var(--shadow-md)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }
      },
      /* @__PURE__ */ React.createElement(Icon, { name: "chevronUp", size: 16 })
    ), chosen.length > 0 && result?.ok && /* @__PURE__ */ React.createElement("div", { style: { position: "sticky", bottom: 0, background: "var(--bg-1)", borderTop: "1px solid var(--line-0)", padding: "12px 32px", display: "flex", gap: 8, alignItems: "center", justifyContent: "center", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12.5, color: "var(--text-1)", marginRight: 6 } }, chosen.length, " selected"), /* @__PURE__ */ React.createElement(Button, { variant: "primary", icon: "overlay", onClick: () => send("overlay", [result.query.entryId, ...chosen]) }, "Overlay with ", result.query.entryId), /* @__PURE__ */ React.createElement(Button, { variant: "secondary", icon: "termini", onClick: () => send("termini", [result.query.entryId, ...chosen]) }, "Termini (", result.query.entryId, " as reference)"), /* @__PURE__ */ React.createElement(Button, { variant: "secondary", icon: "batch", onClick: () => send("batch", chosen) }, "Batch analyze"), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", onClick: () => setSelected(/* @__PURE__ */ new Set()) }, "Clear")));
  }
  function ImportPage({ setPage }) {
    const { setPendingStructureSeed, runAstraCommand, isBusy, isElectron, bridge } = useApp();
    const toast = useToast();
    const [importedFiles, setImportedFiles] = useState([]);
    const [selected, setSelected] = useState(/* @__PURE__ */ new Set());
    const [importing, setImporting] = useState(false);
    const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
    useEffect(() => {
      if (!isElectron || !window.astra3Native?.pymolImports) return void 0;
      const show = (list) => {
        setImportedFiles((list || []).map(({ id, name, path }) => ({
          astId: id,
          name,
          path,
          ext: String(path || "").toLowerCase().replace(/\.gz$/, "").split(".").pop()
        })));
        setSelected((s) => new Set([...s].filter((id) => (list || []).some((e) => e.id === id))));
      };
      window.astra3Native.pymolImports().then(show).catch(() => {
      });
      return bridge.on("state", (state) => {
        if (state.imports) show(state.imports);
      });
    }, [isElectron, bridge]);
    const handleFiles = async (files) => {
      if (!isElectron) {
        toast.push({ tone: "neutral", title: "Available in the desktop app", message: "Importing local files requires real filesystem access." });
        return;
      }
      if (isBusy) {
        toast.push({ tone: "error", title: "Astra3 is busy", message: "Wait for the current run to finish before importing." });
        return;
      }
      setImporting(true);
      setImportProgress({ done: 0, total: files.length });
      let successCount = 0;
      for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const entry = files[fileIndex];
        setImportProgress({ done: fileIndex, total: files.length });
        const filePath = entry.path;
        if (!filePath) {
          toast.push({ tone: "error", title: "Could not resolve file path", message: entry.name });
          continue;
        }
        try {
          const result = await runAstraCommand("IMPORT", {
            originPage: "import",
            bridgeCall: (_cmd, opts) => bridge.runImportCommand(filePath, opts)
          });
          const registered = result?.registeredIds || [];
          if (registered.length === 0) {
            toast.push({ tone: "error", title: "Import failed", message: `${entry.name}: Astra3 did not register a structure ID. Check the Advanced Console for the exact error.` });
            continue;
          }
          successCount += registered.length;
        } catch (e) {
          toast.push({ tone: "error", title: "Import failed", message: `${entry.name}: ${e?.message || "unknown error"}` });
        }
      }
      setImportProgress({ done: files.length, total: files.length });
      setImporting(false);
      if (successCount > 0) {
        toast.push({ tone: "success", title: "Files imported", message: `${successCount} structure(s) registered with real AST-XXXX IDs.` });
      }
    };
    const analyze = (item) => {
      setPendingStructureSeed({ kind: "single", items: [{ id: item.astId, format: "pdb" }] });
      setPage("single");
    };
    const toggleSelect = (astId) => setSelected((s) => {
      const next = new Set(s);
      next.has(astId) ? next.delete(astId) : next.add(astId);
      return next;
    });
    const launchComparison = (kind) => {
      const ids = importedFiles.filter((f) => selected.has(f.astId)).map((f) => f.astId);
      setPendingStructureSeed({ kind, items: ids.map((id) => ({ id, format: "pdb" })) });
      setPage(kind);
    };
    const extBadge = { pdb: { tone: "accent", label: "PDB" }, ent: { tone: "accent", label: "PDB" }, cif: { tone: "violet", label: "mmCIF" }, mmcif: { tone: "violet", label: "mmCIF" }, pse: { tone: "warning", label: "Session" } };
    const selectedCount = selected.size;
    return /* @__PURE__ */ React.createElement(PageScroll, null, /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 900, margin: "0 auto", padding: "28px 32px 100px" } }, /* @__PURE__ */ React.createElement(SectionLabel, null, "Import local structure files"), /* @__PURE__ */ React.createElement(BusyLock, { active: importing }, /* @__PURE__ */ React.createElement(DropZone, { onFiles: handleFiles, accept: ".pdb,.ent,.pse,.cif,.mmcif,.gz" })), importing && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 10 } }, importProgress.total > 1 ? /* @__PURE__ */ React.createElement(
      ProgressBar,
      {
        value: importProgress.done / importProgress.total * 100,
        label: `Registering file ${Math.min(importProgress.done + 1, importProgress.total)} of ${importProgress.total}`,
        animated: true
      }
    ) : /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-1)" } }, /* @__PURE__ */ React.createElement(Spinner, { size: 13 }), " Registering with Astra3\u2026")), /* @__PURE__ */ React.createElement(FieldHint, null, "Imported files get a temporary ", /* @__PURE__ */ React.createElement("code", { className: "mono" }, "AST-XXXX"), " identifier so they can be referenced by any command, exactly like a fetched PDB ID."), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 28 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 } }, /* @__PURE__ */ React.createElement(SectionLabel, { style: { marginBottom: 0 } }, "Imported files"), importedFiles.length > 0 && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11.5, color: "var(--text-1)" } }, selectedCount > 0 ? `${selectedCount} selected` : "Select 2+ to compare")), importedFiles.length === 0 ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "file", title: "Nothing imported yet", description: "Drop .pdb, .cif/.mmcif or .pse files (gzip-compressed too) above to get started." }) : /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } }, importedFiles.map((item) => {
      const badge = extBadge[item.ext] || { tone: "neutral", label: item.ext.toUpperCase() };
      const isChecked = selected.has(item.astId);
      return /* @__PURE__ */ React.createElement(Card, { key: item.astId, style: { padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, borderColor: isChecked ? "var(--accent)" : "var(--line-0)" } }, /* @__PURE__ */ React.createElement(
        "div",
        {
          onClick: () => toggleSelect(item.astId),
          style: {
            width: 18,
            height: 18,
            borderRadius: 5,
            flexShrink: 0,
            cursor: "pointer",
            border: `1.5px solid ${isChecked ? "var(--accent)" : "var(--line-1)"}`,
            background: isChecked ? "var(--accent)" : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }
        },
        isChecked && /* @__PURE__ */ React.createElement(Icon, { name: "check", size: 12, stroke: "var(--text-on-accent)", strokeWidth: 2.6 })
      ), /* @__PURE__ */ React.createElement("div", { style: { width: 32, height: 32, borderRadius: 8, background: "var(--bg-2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-1)" } }, /* @__PURE__ */ React.createElement(Icon, { name: "file", size: 15 })), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } }, /* @__PURE__ */ React.createElement("span", { className: "mono", style: { fontSize: 12.5, fontWeight: 600 } }, item.astId), /* @__PURE__ */ React.createElement(Badge, { tone: badge.tone }, badge.label)), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--text-1)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, item.name)), /* @__PURE__ */ React.createElement(Button, { variant: "primary", size: "sm", icon: "play", onClick: () => analyze(item) }, "Use in Single Structure"));
    })))), selectedCount >= 2 && /* @__PURE__ */ React.createElement("div", { className: "astra-modal-in", style: {
      position: "fixed",
      bottom: 24,
      left: "50%",
      transform: "translateX(-50%)",
      background: "var(--bg-2)",
      border: "1px solid var(--line-1)",
      borderRadius: "var(--radius-lg)",
      padding: "12px 16px",
      display: "flex",
      alignItems: "center",
      gap: 12,
      boxShadow: "var(--shadow-lg)",
      zIndex: 100
    } }, /* @__PURE__ */ React.createElement(Badge, { tone: "accent" }, selectedCount, " selected"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12.5, color: "var(--text-1)" } }, "Compare these imports:"), /* @__PURE__ */ React.createElement(Button, { variant: "secondary", size: "sm", icon: "overlay", onClick: () => launchComparison("overlay") }, "Overlay"), /* @__PURE__ */ React.createElement(Button, { variant: "secondary", size: "sm", icon: "termini", onClick: () => launchComparison("termini") }, "Termini"), /* @__PURE__ */ React.createElement(IconButton, { name: "x", title: "Clear selection", onClick: () => setSelected(/* @__PURE__ */ new Set()) })));
  }
  function idsFromHistoryEntry(entry) {
    if (entry.kind === "overlay" && entry.label.includes(" + ")) return entry.label.split(" + ").map((s) => s.trim()).filter(Boolean);
    if (entry.kind === "overlay" || entry.kind === "termini") {
      const [first, restStr] = entry.label.split(" vs ");
      const rest = (restStr || "").split(",").map((s) => s.trim()).filter(Boolean);
      return [first?.trim(), ...rest].filter(Boolean);
    }
    return [entry.label.trim()].filter(Boolean);
  }
  async function resolveRealOutputFolder(entry, settings) {
    if (entry.reportPath) {
      const dir = dirnameOf(entry.reportPath);
      if (dir) return dir;
    }
    if (entry.sessionPath) {
      const outputDir = dirnameOf(dirnameOf(entry.sessionPath));
      if (outputDir) return outputDir;
    }
    const ids = idsFromHistoryEntry(entry);
    if (ids.length === 0 || !window.astra3Native) return null;
    try {
      const folders = await window.astra3Native.listRunFolders(settings.outputDir);
      const upperIds = ids.map((id) => id.toUpperCase());
      const when = entry.timestamp || Date.now();
      const match = folders.filter((f) => upperIds.every((id) => f.name.toUpperCase().includes(id))).sort((a, b) => Math.abs(a.mtimeMs - when) - Math.abs(b.mtimeMs - when))[0];
      return match ? joinPath(settings.outputDir, match.name) : null;
    } catch {
      return null;
    }
  }
  function outputFolderNotFoundMessage(entry, sessionStartTime) {
    if (entry.timestamp && entry.timestamp < sessionStartTime) {
      return "This run is from a previous session and its files are no longer available in this location. They may have been moved, renamed, or deleted since the run finished.";
    }
    return "Could not locate this run's output folder. It may have been moved or deleted since the run finished.";
  }
  function comparedStructureIds(exported, reference) {
    const ids = /* @__PURE__ */ new Set();
    for (const c of exported?.comparisons || []) if (c?.comparison_structure) ids.add(String(c.comparison_structure));
    for (const s of exported?.structures || []) if (s?.structure_id) ids.add(String(s.structure_id));
    ids.delete(String(reference));
    return [...ids];
  }
  var VIEW_ORDER = ["front", "back", "top", "bottom", "left", "right"];
  function imageRank(name) {
    const base = name.slice(name.lastIndexOf("/") + 1);
    const view = base.match(/^view_([a-z]+)\.png$/i);
    if (view) {
      const i = VIEW_ORDER.indexOf(view[1].toLowerCase());
      return i === -1 ? 50 : i;
    }
    const close = base.match(/^closeup_(N|C)term_(.+?)_angle(\d+)\.png$/i);
    if (close) return 100 + (close[1].toUpperCase() === "N" ? 0 : 10) + Number(close[3]);
    return 200;
  }
  var IMPORT_EXT_RE = /\.(cif|mmcif|pdb|ent|pse)(\.gz)?(?=$| \()/i;
  function structureDisplayNames(exported) {
    const names = {};
    for (const s of exported?.structures || []) {
      if (!s?.structure_id) continue;
      const id = String(s.structure_id);
      names[id] = s.confirmed_pdb_entry ? String(s.confirmed_pdb_entry) : id.replace(IMPORT_EXT_RE, "");
    }
    return names;
  }
  function structureDisplayName(id, names) {
    const key = String(id);
    return names && names[key] || key.replace(IMPORT_EXT_RE, "");
  }
  function groupRunImages(files, reference, compared = [], names = {}) {
    const folderRank = /* @__PURE__ */ new Map();
    const groups = /* @__PURE__ */ new Map();
    for (const file of files) {
      const slash = file.name.indexOf("/");
      const folder = slash === -1 ? "" : file.name.slice(0, slash);
      const base = slash === -1 ? file.name : file.name.slice(slash + 1);
      const kind = base.startsWith("closeup_") ? "closeup" : "whole";
      if (!folderRank.has(folder)) folderRank.set(folder, folder === "" ? -1 : folderRank.size);
      const key = `${folder}|${kind}`;
      if (!groups.has(key)) groups.set(key, { key, folder, kind, files: [] });
      groups.get(key).files.push(file);
    }
    const subfolders = new Set([...groups.values()].filter((g) => g.folder).map((g) => g.folder));
    if (subfolders.size === 1 && groups.has("|whole")) groups.delete("|whole");
    const soleComparison = subfolders.size === 0 && compared.length === 1 ? compared[0] : null;
    const foldersWithCloseups = new Set([...groups.values()].filter((g) => g.kind === "closeup").map((g) => g.folder));
    return [...groups.values()].sort((x, y) => folderRank.get(x.folder) - folderRank.get(y.folder) || (x.kind === y.kind ? 0 : x.kind === "closeup" ? -1 : 1)).map((g) => ({ ...g, files: [...g.files].sort((a, b) => imageRank(a.name) - imageRank(b.name)) })).map((g) => {
      const other = g.folder || soleComparison;
      if (!other) return { ...g, name: "All structures" };
      const otherName = structureDisplayName(other, names);
      const pair = reference ? `${structureDisplayName(reference, names)} vs ${otherName}` : `${otherName} \xB7 aligned to reference`;
      if (g.kind === "closeup") return { ...g, name: `${pair} \xB7 terminus close-ups` };
      return { ...g, name: foldersWithCloseups.has(g.folder) ? `${pair} \xB7 whole structure` : pair };
    });
  }
  function imageOrderFromReport(html) {
    const order = /* @__PURE__ */ new Map();
    const pattern = /src=['"]Images\/([^'"]+?\.png)['"]/gi;
    let match;
    while ((match = pattern.exec(String(html || ""))) !== null) {
      if (!order.has(match[1])) order.set(match[1], order.size);
    }
    return order;
  }
  function compareImageRefs(a, b, reportOrder) {
    const ia = reportOrder.has(a) ? reportOrder.get(a) : Infinity;
    const ib = reportOrder.has(b) ? reportOrder.get(b) : Infinity;
    if (ia !== ib) return ia - ib;
    const depthA = a.includes("/") ? 1 : 0;
    const depthB = b.includes("/") ? 1 : 0;
    if (depthA !== depthB) return depthA - depthB;
    return a.localeCompare(b);
  }
  function historyMetaText(meta) {
    return String(meta || "").replace(/\s*·\s*auto reference\b/g, "");
  }
  function stripImageFramesKeepCaptions(html) {
    if (!html) return html;
    return html.replace(/<div class='image-frame'><img([^>]*)><\/div>/g, (_whole, attrs) => {
      const src = /\bsrc='([^']*)'/.exec(attrs);
      const alt = /\balt='([^']*)'/.exec(attrs);
      return src ? `<span class='astra3-image-ref' data-src='${src[1]}' data-alt='${alt ? alt[1] : ""}' hidden></span>` : "";
    });
  }
  function groupCompletedByBatch(history, completed) {
    const batchGroups = history.filter((h) => h.kind === "batch" && (Array.isArray(h.batchEntryIds) && h.batchEntryIds.length > 0 || Array.isArray(h.batchIds) && h.batchIds.length > 0)).map((batch) => {
      if (Array.isArray(batch.batchEntryIds) && batch.batchEntryIds.length > 0) {
        const wanted = new Set(batch.batchEntryIds);
        return { batch, children: completed.filter((c) => wanted.has(c.id)) };
      }
      const byLabel = /* @__PURE__ */ new Map();
      for (const c of completed) {
        if (!batch.batchIds.includes(c.label)) continue;
        if (c.timestamp > batch.timestamp || c.timestamp < batch.timestamp - 864e5) continue;
        const existing = byLabel.get(c.label);
        if (!existing || c.timestamp > existing.timestamp) byLabel.set(c.label, c);
      }
      return { batch, children: Array.from(byLabel.values()) };
    }).filter((g) => g.children.length > 0);
    const groupedChildIds = new Set(batchGroups.flatMap((g) => g.children.map((c) => c.id)));
    const ungrouped = completed.filter((h) => !groupedChildIds.has(h.id));
    const ordered = [
      ...batchGroups.map((group) => ({ group, timestamp: group.batch.timestamp })),
      ...ungrouped.map((run) => ({ run, timestamp: run.timestamp }))
    ].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return { batchGroups, ungrouped, ordered };
  }
  var FIGURE_MAX_CELL_WIDTH = 1200;
  var FIGURE_TRANSPARENT = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform || navigator.userAgent || "");
  function safeReportImagePath(src) {
    if (typeof src !== "string" || !/\.(png|jpe?g)$/i.test(src) || /[\\:]/.test(src)) return false;
    const parts = src.split("/");
    return parts.length >= 2 && parts[0] === "Images" && parts.every((part) => part && part !== "." && part !== "..");
  }
  function figurePanelLabel(label) {
    if (!/\.(png|jpe?g)$/i.test(label)) return label;
    const name = label.replace(/\.(png|jpe?g)$/i, "").replace(/^view_/i, "").replace(/_/g, " ").trim();
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : label;
  }
  function sharedContentBox(images) {
    const w = images[0].naturalWidth || images[0].width;
    const h = images[0].naturalHeight || images[0].height;
    const full = { x: 0, y: 0, w, h };
    if (images.some((img) => (img.naturalWidth || img.width) !== w || (img.naturalHeight || img.height) !== h)) return full;
    const scale = Math.min(1, 480 / Math.max(w, h));
    const pw = Math.max(1, Math.round(w * scale));
    const ph = Math.max(1, Math.round(h * scale));
    const probe = document.createElement("canvas");
    probe.width = pw;
    probe.height = ph;
    const ctx = probe.getContext("2d", { willReadFrequently: true });
    let minX = pw, minY = ph, maxX = -1, maxY = -1;
    images.forEach((img) => {
      ctx.clearRect(0, 0, pw, ph);
      ctx.drawImage(img, 0, 0, pw, ph);
      const data = ctx.getImageData(0, 0, pw, ph).data;
      for (let y = 0; y < ph; y++) {
        for (let x = 0; x < pw; x++) {
          const i = (y * pw + x) * 4;
          if (data[i + 3] > 16 && (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245)) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
    });
    if (maxX < 0) return full;
    const margin = Math.round(Math.max(w, h) * 0.04);
    const x0 = Math.max(0, Math.floor(minX / scale) - margin);
    const y0 = Math.max(0, Math.floor(minY / scale) - margin);
    const x1 = Math.min(w, Math.ceil((maxX + 1) / scale) + margin);
    const y1 = Math.min(h, Math.ceil((maxY + 1) / scale) + margin);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  async function composeFigure(group, loadDataUri, options = {}) {
    const images = await Promise.all(group.panels.map(async (panel) => {
      try {
        const uri = await loadDataUri(panel.src);
        if (!uri) return null;
        const img = document.createElement("img");
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = uri;
        });
        if (typeof img.decode === "function") await img.decode().catch(() => {
        });
        return img;
      } catch {
        return null;
      }
    }));
    const missing = group.panels.filter((_, i) => !images[i]).map((panel) => panel.src.split("/").pop());
    if (missing.length) throw new Error(`Could not read ${missing.join(", ")}`);
    const n = images.length;
    const cols = n <= 2 ? n : n === 4 ? 2 : 3;
    const crop = sharedContentBox(images);
    const cellW = Math.min(FIGURE_MAX_CELL_WIDTH, crop.w);
    const unit = cellW / 40;
    const pad = Math.round(unit * 1.2);
    const gap = Math.round(unit * 0.8);
    const labelSize = Math.max(12, Math.round(unit * 1.4));
    const keySize = Math.max(12, Math.round(unit * 1.5));
    const labelH = Math.round(labelSize * 1.9);
    const fontOf = (weight, size) => `${weight} ${size}px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif`;
    const width = pad * 2 + cols * cellW + (cols - 1) * gap;
    const cellH = Math.round(crop.h * cellW / crop.w);
    const cells = images.map((img) => ({ img, h: cellH }));
    const rows = [];
    for (let i = 0; i < n; i += cols) rows.push(cells.slice(i, i + cols));
    const rowHeights = rows.map((row) => Math.max(...row.map((c) => c.h)) + labelH);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const swatch = Math.round(keySize * 0.9);
    const lineH = Math.round(keySize * 1.8);
    const keyLines = [];
    let line = [];
    let lineW = 0;
    group.keyEntries.forEach((entry) => {
      const name = entry.note ? `${entry.name} (${entry.note})` : entry.name;
      ctx.font = fontOf(600, keySize);
      const parts = [{ type: "name", text: name, w: ctx.measureText(name).width + keySize * 0.6 }];
      ctx.font = fontOf(400, keySize);
      entry.swatches.forEach((s) => parts.push({ type: "swatch", color: s.color, text: s.label, w: swatch + keySize * 0.4 + ctx.measureText(s.label).width + keySize * 0.9 }));
      const entryW = parts.reduce((sum, part) => sum + part.w, 0) + keySize * 1.2;
      if (line.length && lineW + entryW > width - pad * 2) {
        keyLines.push(line);
        line = [];
        lineW = 0;
      }
      line.push(parts);
      lineW += entryW;
    });
    if (line.length) keyLines.push(line);
    canvas.width = width;
    canvas.height = pad * 2 + rowHeights.reduce((a, b) => a + b, 0) + gap * (rows.length - 1) + (keyLines.length ? gap + keyLines.length * lineH : 0);
    const transparent = options.transparent === void 0 ? FIGURE_TRANSPARENT : options.transparent;
    if (!transparent) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    let y = pad;
    rows.forEach((row, r) => {
      row.forEach((cell, c) => {
        const x = pad + c * (cellW + gap);
        ctx.drawImage(cell.img, crop.x, crop.y, crop.w, crop.h, x, y, cellW, cell.h);
        const label = figurePanelLabel(group.panels[r * cols + c].label);
        if (label) {
          ctx.font = fontOf(400, labelSize);
          ctx.fillStyle = "#555555";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(label, x + cellW / 2, y + cell.h + labelH / 2, cellW);
        }
      });
      y += rowHeights[r] + gap;
    });
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    let ky = y - gap + (keyLines.length ? gap : 0) + lineH / 2;
    keyLines.forEach((entries) => {
      let kx = pad;
      entries.forEach((parts) => {
        parts.forEach((part) => {
          if (part.type === "name") {
            ctx.font = fontOf(600, keySize);
            ctx.fillStyle = "#222222";
            ctx.fillText(part.text, kx, ky);
          } else {
            ctx.fillStyle = part.color;
            ctx.fillRect(kx, ky - swatch / 2, swatch, swatch);
            ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
            ctx.lineWidth = 1;
            ctx.strokeRect(kx + 0.5, ky - swatch / 2 + 0.5, swatch - 1, swatch - 1);
            ctx.font = fontOf(400, keySize);
            ctx.fillStyle = "#333333";
            ctx.fillText(part.text, kx + swatch + keySize * 0.4, ky);
          }
          kx += part.w;
        });
        kx += keySize * 1.2;
      });
      ky += lineH;
    });
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The figure could not be encoded")), "image/png");
    });
  }
  var REPORT_IMAGE_DISPLAY_WIDTH = 1024;
  var REPORT_THEME_KEY = "astra3-report-theme";
  var REPORT_COPY_TEXT_LIMIT = 2e5;
  var REPORT_FIGURE_PANEL_LIMIT = 48;
  function blobToDataUri(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("The figure could not be read"));
      reader.readAsDataURL(blob);
    });
  }
  function reportFigureSpec(message) {
    const panels = Array.isArray(message.panels) ? message.panels : [];
    if (!panels.length || panels.length > REPORT_FIGURE_PANEL_LIMIT) return null;
    if (!panels.every((panel) => panel && safeReportImagePath(panel.src))) return null;
    const text = (value) => String(value || "").slice(0, 200);
    const list = (value, limit) => Array.isArray(value) ? value.slice(0, limit) : [];
    return {
      panels: panels.map((panel) => ({ src: panel.src, label: text(panel.label) })),
      keyEntries: list(message.key, 64).map((entry) => ({
        name: text(entry && entry.name),
        note: text(entry && entry.note),
        swatches: list(entry && entry.swatches, 16).map((swatch) => ({ color: text(swatch && swatch.color), label: text(swatch && swatch.label) }))
      }))
    };
  }
  function serveReportFrame(frame, html, entry, settings, toast, openInViewer) {
    const native = window.astra3Native;
    const folder = resolveRealOutputFolder(entry, settings).catch(() => null);
    const inFolder = async (parts) => {
      const dir = await folder;
      return dir ? joinPath(dir, ...parts) : null;
    };
    const clicked = () => !navigator.userActivation || navigator.userActivation.isActive;
    const figures = /* @__PURE__ */ new Map();
    const figure = (message) => {
      const spec = reportFigureSpec(message);
      if (!spec) return Promise.reject(new Error("This figure cannot be copied"));
      const key = JSON.stringify(spec);
      if (!figures.has(key)) {
        const loadDataUri = async (src) => {
          const file = await inFolder(src.split("/"));
          return file ? native.readFileAsDataUri(file) : null;
        };
        const made = composeFigure(spec, loadDataUri);
        made.catch(() => figures.delete(key));
        figures.set(key, made);
      }
      return figures.get(key);
    };
    const requests = {
      ready: () => {
        let theme = null;
        try {
          theme = localStorage.getItem(REPORT_THEME_KEY);
        } catch {
          theme = null;
        }
        frame.contentWindow.postMessage({ astra3Report: true, type: "show", html, theme }, "*");
      },
      theme: ({ dark }) => {
        try {
          localStorage.setItem(REPORT_THEME_KEY, dark ? "dark" : "light");
        } catch {
        }
      },
      image: async ({ src }) => {
        if (!safeReportImagePath(src)) return null;
        const file = await inFolder(src.split("/"));
        return file ? native.readImageThumbnail(file, REPORT_IMAGE_DISPLAY_WIDTH) : null;
      },
      prepareFigure: (message) => {
        figure(message).catch(() => {
        });
      },
      copyFigure: async (message) => {
        if (!clicked()) return { ok: false };
        try {
          const uri = await blobToDataUri(await figure(message));
          if (!await native.copyImage(uri)) throw new Error("The clipboard did not accept the picture");
          return { ok: true };
        } catch (err) {
          return { ok: false, error: err && err.message || "" };
        }
      },
      copyText: async ({ text }) => {
        if (!clicked() || typeof text !== "string" || text.length > REPORT_COPY_TEXT_LIMIT) return false;
        return !!await native.copyText(text);
      },
      openFolder: async () => {
        if (!clicked()) return;
        const dir = await folder;
        if (!dir) {
          toast.push({ tone: "error", title: "Could not open", message: "This run's output folder could not be located on disk. It may have been moved or deleted." });
          return;
        }
        const err = await native.openPath(dir);
        if (err) toast.push({ tone: "error", title: "Could not open output folder", message: err });
      },
      openSession: async ({ href }) => {
        if (!clicked() || typeof href !== "string" || !/\.(pse|cxs)$/i.test(href)) return;
        if (entry.engine === "astra3" && openInViewer) {
          openInViewer(entry);
          return;
        }
        const parts = href.replace(/^\.?[/\\]/, "").split(/[/\\]/).filter(Boolean);
        if (!parts.length || parts.some((part) => part === ".." || part === "." || part.includes(":"))) return;
        const file = await inFolder(parts);
        if (!file) {
          toast.push({ tone: "error", title: "Could not open", message: "This run's output folder could not be located on disk. It may have been moved or deleted." });
          return;
        }
        const err = await native.openInPymol(file);
        if (err) toast.push({ tone: "error", title: "Could not open session", message: err });
      },
      shown: () => {
        frame.dataset.report = "shown";
      }
    };
    const onMessage = async (event) => {
      if (!frame.contentWindow || event.source !== frame.contentWindow) return;
      const message = event.data;
      if (!message || message.astra3Report !== true || !Object.hasOwn(requests, message.type)) return;
      let result = null;
      try {
        result = await requests[message.type](message);
      } catch {
        result = null;
      }
      if (typeof message.id === "number" && frame.contentWindow) {
        frame.contentWindow.postMessage({ astra3Report: true, id: message.id, result: result === void 0 ? null : result }, "*");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }
  function ReportsPage({ setPage }) {
    const { history, settings, isElectron, sessionStartTime, setSelectedViewerId } = useApp();
    const toast = useToast();
    const completed = history.filter((h) => h.status === "complete" && h.kind !== "batch");
    const [expandedBatches, setExpandedBatches] = useState({});
    const { batchGroups, ordered } = groupCompletedByBatch(history, completed);
    const [selected, setSelected] = useState(completed[0] || null);
    const { selectedReportId, setSelectedReportId } = useApp();
    useEffect(() => {
      if (!selectedReportId) return;
      const wanted = history.find((h) => h.id === selectedReportId);
      if (wanted) {
        if (wanted.kind === "batch") {
          setExpandedBatches((e) => ({ ...e, [wanted.id]: true }));
          const group = batchGroups.find((g) => g.batch.id === wanted.id);
          if (group && group.children.length > 0) setSelected(group.children[0]);
        } else {
          setSelected(wanted);
        }
      }
      setSelectedReportId(null);
    }, [selectedReportId]);
    const [tab, setTab] = useState("report");
    const [reportHtml, setReportHtml] = useState(null);
    const reportFrame = useRef(null);
    const [reportLoadError, setReportLoadError] = useState(null);
    const [imageFiles, setImageFiles] = useState([]);
    const [imageReference, setImageReference] = useState(null);
    const [imageCompared, setImageCompared] = useState([]);
    const [imageNames, setImageNames] = useState({});
    const imageGroups = useMemo(() => groupRunImages(imageFiles, imageReference, imageCompared, imageNames), [imageFiles, imageReference, imageCompared, imageNames]);
    const [imagesLoading, setImagesLoading] = useState(false);
    const openReportExternally = async (entry) => {
      if (!isElectron) {
        toast.push({ tone: "neutral", title: "Opening in browser", message: "Astra3_Report.html" });
        return;
      }
      const folder = await resolveRealOutputFolder(entry, settings);
      if (!folder) {
        toast.push({ tone: "error", title: "Could not open report", message: outputFolderNotFoundMessage(entry, sessionStartTime) });
        return;
      }
      const err = await window.astra3Native.openPath(entry.reportPath || joinPath(folder, "Astra3_Report.html"));
      if (err) toast.push({ tone: "error", title: "Could not open report", message: err });
    };
    const openOutputFolder = async (entry) => {
      if (!isElectron) {
        toast.push({ tone: "neutral", title: "Opening output folder", message: entry.label });
        return;
      }
      const folder = await resolveRealOutputFolder(entry, settings);
      if (!folder) {
        toast.push({ tone: "error", title: "Could not open output folder", message: outputFolderNotFoundMessage(entry, sessionStartTime) });
        return;
      }
      await window.astra3Native.openPath(folder);
    };
    const openInViewer = (entry) => {
      setSelectedViewerId(entry.id);
      setPage("viewer");
    };
    const openSession = async (entry) => {
      if (entry.engine === "astra3") {
        openInViewer(entry);
        return;
      }
      if (!isElectron) {
        toast.push({ tone: "neutral", title: "Opening session", message: entry.label });
        return;
      }
      if (entry.sessionPath) {
        const err2 = await window.astra3Native.openInPymol(entry.sessionPath);
        if (err2) toast.push({ tone: "error", title: "Could not open session", message: err2 });
        return;
      }
      const folder = await resolveRealOutputFolder(entry, settings);
      if (!folder) {
        toast.push({ tone: "error", title: "Could not open session", message: "Could not locate this run's output folder." });
        return;
      }
      const files = await window.astra3Native.listDir(joinPath(folder, "Session"));
      const pseFile = files.find((f) => /\.(pse|cxs)$/i.test(f));
      if (!pseFile) {
        toast.push({ tone: "error", title: "Could not open session", message: "No session file found in this run's Session folder." });
        return;
      }
      const err = await window.astra3Native.openInPymol(joinPath(folder, "Session", pseFile));
      if (err) toast.push({ tone: "error", title: "Could not open session", message: err });
    };
    const [imageSelectMode, setImageSelectMode] = useState(false);
    const [selectedImages, setSelectedImages] = useState(() => /* @__PURE__ */ new Set());
    const toggleImageSelected = useCallback((name) => {
      setSelectedImages((prev) => {
        const next = new Set(prev);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        return next;
      });
    }, []);
    const openImageExternally = async (entry, filename) => {
      if (!isElectron) {
        toast.push({ tone: "neutral", title: "Opening image", message: filename });
        return;
      }
      const folder = await resolveRealOutputFolder(entry, settings);
      if (!folder) {
        toast.push({ tone: "error", title: "Could not open image", message: "Could not locate this run's output folder." });
        return;
      }
      const err = await window.astra3Native.openPath(joinPath(folder, "Images", filename));
      if (err) toast.push({ tone: "error", title: "Could not open image", message: err });
    };
    const openSelectedImages = async () => {
      if (!isElectron) {
        toast.push({ tone: "neutral", title: "Available in the desktop app", message: "Opening images externally needs the desktop app." });
        return;
      }
      const folder = await resolveRealOutputFolder(selected, settings);
      if (!folder) {
        toast.push({ tone: "error", title: "Could not open images", message: "Could not locate this run's output folder." });
        return;
      }
      const paths = [...selectedImages].map((name) => joinPath(folder, "Images", name));
      const result = await window.astra3Native.openImageSet(paths);
      if (!result || !result.ok && result.opened === 0) {
        toast.push({ tone: "error", title: "Could not open images", message: (result?.failures || []).slice(0, 3).join("\n") || "Something went wrong." });
        return;
      }
      if (result.failures && result.failures.length > 0) {
        toast.push({ tone: "warning", title: `Opened ${result.opened} image(s)`, message: result.failures.slice(0, 3).join("\n") });
      } else if (result.mode === "windows-individual" && result.opened > 1) {
        toast.push({ tone: "neutral", title: `Opened ${result.opened} images`, message: "Windows opens each image in its own viewer window." });
      }
    };
    useEffect(() => {
      if (!selected || !isElectron) {
        setReportHtml(null);
        setReportLoadError(null);
        return;
      }
      let cancelled = false;
      setReportHtml(null);
      setReportLoadError(null);
      resolveRealOutputFolder(selected, settings).then((folder) => {
        if (cancelled) return;
        if (!folder) {
          setReportLoadError("Could not locate this run's output folder. It may have been moved or deleted.");
          return;
        }
        return window.astra3Native.readFile(selected.reportPath || joinPath(folder, "Astra3_Report.html")).then((html) => {
          if (!cancelled) setReportHtml(stripImageFramesKeepCaptions(html));
        }).catch((e) => {
          if (!cancelled) setReportLoadError(e?.message || "Could not read the report file.");
        });
      }).catch((e) => {
        if (!cancelled) setReportLoadError(e?.message || "Something went wrong while locating this run's report.");
      });
      return () => {
        cancelled = true;
      };
    }, [selected, isElectron]);
    useEffect(() => {
      if (reportHtml === null || !selected || !reportFrame.current) return void 0;
      return serveReportFrame(reportFrame.current, reportHtml, selected, settings, toast, openInViewer);
    }, [reportHtml, tab]);
    useEffect(() => {
      if (!selected || !isElectron || tab !== "images") return;
      let cancelled = false;
      setImagesLoading(true);
      setImageFiles([]);
      setImageReference(null);
      resolveRealOutputFolder(selected, settings).then(async (folder) => {
        if (cancelled) return;
        if (!folder) {
          setImagesLoading(false);
          return;
        }
        const imagesDir = joinPath(folder, "Images");
        try {
          const topEntries = await window.astra3Native.listDir(imagesDir);
          const topPngs = topEntries.filter((n) => n.toLowerCase().endsWith(".png"));
          const subdirs = await window.astra3Native.listSubdirs(imagesDir);
          const nested = await Promise.all(subdirs.map(async (sub) => {
            const subDir = `${imagesDir}/${sub}`;
            const files = await window.astra3Native.listDir(subDir);
            return files.filter((n) => n.toLowerCase().endsWith(".png")).map((name) => ({ name: `${sub}/${name}`, path: `${subDir}/${name}` }));
          }));
          const pngRefs = [
            ...topPngs.map((name) => ({ name, path: `${imagesDir}/${name}` })),
            ...nested.flat()
          ];
          let reportOrder = /* @__PURE__ */ new Map();
          try {
            const html = await window.astra3Native.readFile(joinPath(folder, "Astra3_Report.html"));
            reportOrder = imageOrderFromReport(html);
          } catch {
          }
          let reference = null;
          let compared = [];
          let names = {};
          for (const name of ["Astra3_Report.json", "Termini_Analysis.json"]) {
            try {
              const exported = JSON.parse(await window.astra3Native.readFile(joinPath(joinPath(folder, "Session"), name)));
              if (exported && exported.reference_structure) {
                reference = String(exported.reference_structure);
                compared = comparedStructureIds(exported, reference);
                names = structureDisplayNames(exported);
                break;
              }
            } catch {
            }
          }
          if (!cancelled) {
            setImageReference(reference);
            setImageCompared(compared);
            setImageNames(names);
          }
          pngRefs.sort((a, b) => compareImageRefs(a.name, b.name, reportOrder));
          const withData = await Promise.all(pngRefs.map(async (ref) => ({
            name: ref.name,
            dataUri: await window.astra3Native.readImageThumbnail(ref.path, 640)
          })));
          if (!cancelled) {
            setImageFiles(withData.filter((f) => f.dataUri));
            setImagesLoading(false);
          }
        } catch {
          if (!cancelled) setImagesLoading(false);
        }
      });
      return () => {
        cancelled = true;
      };
    }, [selected, isElectron, tab]);
    return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", height: "100%" } }, /* @__PURE__ */ React.createElement("div", { style: { width: 250, borderRight: "1px solid var(--line-0)", overflowY: "auto", padding: 14, flexShrink: 0 } }, /* @__PURE__ */ React.createElement(SectionLabel, null, "Completed analyses"), completed.length === 0 ? /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--text-1)" } }, "No completed analyses yet.") : /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4 } }, ordered.map(({ group, run }) => group ? /* @__PURE__ */ React.createElement("div", { key: group.batch.id }, /* @__PURE__ */ React.createElement("button", { onClick: () => setExpandedBatches((e) => ({ ...e, [group.batch.id]: !e[group.batch.id] })), style: {
      textAlign: "left",
      padding: "8px 10px",
      borderRadius: "var(--radius-sm)",
      border: "none",
      cursor: "pointer",
      background: "transparent",
      color: "var(--text-0)",
      width: "100%",
      display: "flex",
      alignItems: "center",
      gap: 8
    } }, /* @__PURE__ */ React.createElement("span", { style: {
      display: "inline-flex",
      transition: "transform 160ms ease",
      transform: expandedBatches[group.batch.id] ? "rotate(90deg)" : "rotate(0deg)"
    } }, /* @__PURE__ */ React.createElement(Icon, { name: "chevronRight", size: 12 })), /* @__PURE__ */ React.createElement("span", { style: { minWidth: 0 } }, /* @__PURE__ */ React.createElement("span", { className: "mono", style: { fontSize: 12.5, fontWeight: 600, display: "block" } }, group.batch.label), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10.5, color: "var(--text-1)" } }, group.children.length, " report", group.children.length === 1 ? "" : "s", " \xB7 ", timeAgo(group.batch.timestamp)))), expandedBatches[group.batch.id] && group.children.map((h) => /* @__PURE__ */ React.createElement("button", { key: h.id, onClick: () => setSelected(h), style: {
      textAlign: "left",
      padding: "6px 10px 6px 28px",
      borderRadius: "var(--radius-sm)",
      border: "none",
      cursor: "pointer",
      width: "100%",
      background: selected?.id === h.id ? "var(--accent-wash)" : "transparent",
      color: selected?.id === h.id ? "var(--accent-bright)" : "var(--text-0)"
    } }, /* @__PURE__ */ React.createElement("div", { className: "mono", style: { fontSize: 12, fontWeight: 600 } }, h.label)))) : ((h) => /* @__PURE__ */ React.createElement("button", { key: h.id, onClick: () => setSelected(h), style: {
      textAlign: "left",
      padding: "8px 10px",
      borderRadius: "var(--radius-sm)",
      border: "none",
      cursor: "pointer",
      background: selected?.id === h.id ? "var(--accent-wash)" : "transparent",
      color: selected?.id === h.id ? "var(--accent-bright)" : "var(--text-0)"
    } }, /* @__PURE__ */ React.createElement("div", { className: "mono", style: { fontSize: 12.5, fontWeight: 600 } }, h.label), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, color: "var(--text-1)" } }, timeAgo(h.timestamp))))(run)))), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 } }, !selected ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "reports", title: "Select an analysis", description: "Choose a completed analysis on the left to view its report." }) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { padding: "14px 20px", borderBottom: "1px solid var(--line-0)", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12 } }, /* @__PURE__ */ React.createElement("span", { className: "mono", style: { fontSize: 14, fontWeight: 700 } }, selected.label), /* @__PURE__ */ React.createElement(SegmentedControl, { value: tab, onChange: setTab, options: [{ value: "report", label: "Report", icon: "reports" }, { value: "images", label: "Images", icon: "image" }] })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React.createElement(Button, { variant: "gold", size: "sm", icon: "externalLink", onClick: () => openReportExternally(selected) }, "Open externally"), /* @__PURE__ */ React.createElement(Button, { variant: "secondary", size: "sm", icon: "folder", onClick: () => openOutputFolder(selected) }, "Output folder"), /* @__PURE__ */ React.createElement(Button, { variant: "secondary", size: "sm", icon: "cube", onClick: () => openSession(selected) }, "Open session"))), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, overflow: "hidden", padding: tab === "report" ? 16 : 20 } }, tab === "report" ? /* @__PURE__ */ React.createElement("div", { style: { width: "100%", height: "100%", borderRadius: "var(--radius-lg)", overflow: "hidden", border: "1px solid var(--line-0)", boxShadow: "var(--shadow-md)", position: "relative" } }, !isElectron ? /* @__PURE__ */ React.createElement("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" } }, /* @__PURE__ */ React.createElement(EmptyState, { icon: "reports", title: "Available in the desktop app", description: "Report preview reads the real HTML file from disk." })) : reportLoadError ? /* @__PURE__ */ React.createElement("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 } }, /* @__PURE__ */ React.createElement(EmptyState, { icon: "alertTriangle", title: "Could not load report", description: reportLoadError })) : reportHtml === null ? /* @__PURE__ */ React.createElement("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--text-1)", fontSize: 13 } }, /* @__PURE__ */ React.createElement(Spinner, { size: 16 }), " Loading report\u2026") : /* @__PURE__ */ React.createElement(
      "iframe",
      {
        ref: reportFrame,
        title: "report",
        sandbox: "allow-scripts allow-popups",
        src: "report-frame.html",
        style: { width: "100%", height: "100%", border: "none", display: "block" }
      }
    )) : !isElectron ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "image", title: "Available in the desktop app", description: "Rendered images read real .png files from disk." }) : imagesLoading ? /* @__PURE__ */ React.createElement("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--text-1)", fontSize: 13 } }, /* @__PURE__ */ React.createElement(Spinner, { size: 16 }), " Loading images\u2026") : imageFiles.length === 0 ? /* @__PURE__ */ React.createElement(EmptyState, { icon: "image", title: "No rendered images found", description: "This run may have used -skipimage, or its output folder could not be located on disk (it may have been moved, renamed, or deleted since the run finished)." }) : /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", height: "100%", gap: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 } }, /* @__PURE__ */ React.createElement(
      Button,
      {
        variant: imageSelectMode ? "primary" : "secondary",
        icon: "check",
        onClick: () => {
          setImageSelectMode(!imageSelectMode);
          setSelectedImages(/* @__PURE__ */ new Set());
        }
      },
      imageSelectMode ? "Done" : "Select"
    ), imageSelectMode && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
      Button,
      {
        variant: "secondary",
        onClick: () => setSelectedImages((prev) => prev.size === imageFiles.length ? /* @__PURE__ */ new Set() : new Set(imageFiles.map((f) => f.name)))
      },
      selectedImages.size === imageFiles.length && imageFiles.length > 0 ? "Select none" : "Select all"
    ), /* @__PURE__ */ React.createElement(
      Button,
      {
        variant: "primary",
        icon: "externalLink",
        disabled: selectedImages.size === 0,
        onClick: openSelectedImages
      },
      `Open ${selectedImages.size || ""} externally`.replace("  ", " ")
    ), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11.5, color: "var(--text-2)" } }, selectedImages.size, " of ", imageFiles.length, " selected"))), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, overflowY: "auto", flex: 1, minHeight: 0, alignItems: "start", alignContent: "start", gridAutoRows: "min-content" } }, imageGroups.map((group) => /* @__PURE__ */ React.createElement(React.Fragment, { key: group.name }, (imageGroups.length > 1 || group.name !== "All structures") && /* @__PURE__ */ React.createElement("div", { style: {
      gridColumn: "1 / -1",
      display: "flex",
      alignItems: "center",
      gap: 10,
      margin: "10px 0 0",
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: "0.05em",
      textTransform: "uppercase",
      color: "var(--text-2)"
    } }, /* @__PURE__ */ React.createElement("span", null, group.name), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, height: 1, background: "var(--line-0)" } })), group.files.map((f) => {
      const picked = selectedImages.has(f.name);
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          key: f.name,
          style: {
            borderRadius: "var(--radius-md)",
            overflow: "hidden",
            position: "relative",
            display: "flex",
            flexDirection: "column",
            height: "fit-content",
            minWidth: 0,
            border: `1px solid ${picked ? "var(--accent, #4a9eff)" : "var(--line-0)"}`,
            cursor: imageSelectMode ? "pointer" : "default"
          },
          onClick: imageSelectMode ? () => toggleImageSelected(f.name) : void 0
        },
        imageSelectMode && /* @__PURE__ */ React.createElement(
          "div",
          {
            role: "checkbox",
            "aria-checked": picked,
            "aria-label": `Select ${f.name}`,
            style: {
              position: "absolute",
              top: 8,
              left: 8,
              zIndex: 2,
              width: 20,
              height: 20,
              borderRadius: 6,
              border: `1.5px solid ${picked ? "var(--accent, #4a9eff)" : "var(--text-2)"}`,
              background: picked ? "var(--accent, #4a9eff)" : "rgba(0,0,0,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            },
            onClick: (e) => {
              e.stopPropagation();
              toggleImageSelected(f.name);
            }
          },
          picked && /* @__PURE__ */ React.createElement(Icon, { name: "check", size: 13 })
        ),
        /* @__PURE__ */ React.createElement("div", { style: { aspectRatio: "4/3", flex: "0 0 auto", background: "var(--console-bg)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" } }, /* @__PURE__ */ React.createElement("img", { src: f.dataUri, alt: f.name, style: { maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto", objectFit: "contain", display: "block" } })),
        /* @__PURE__ */ React.createElement("div", { style: { padding: "8px 10px", flex: "0 0 auto", fontSize: 11.5, color: "var(--text-1)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, minWidth: 0 } }, /* @__PURE__ */ React.createElement("span", { className: "mono", style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: f.name }, f.name), /* @__PURE__ */ React.createElement(
          IconButton,
          {
            name: "externalLink",
            size: 12,
            onClick: (e) => {
              if (e) e.stopPropagation();
              openImageExternally(selected, f.name);
            },
            title: "Open externally"
          }
        ))
      );
    })))))))));
  }
  var VIEWER_CHAIN_COLORS = ["#AB7ADF", "#6E8EE8", "#F0C361", "#7FBF8A", "#E8614F", "#5FD1C4", "#E888C9", "#8A9BA8"];
  var VIEWER_LIGAND_COLORS = ["#F0C361", "#E8614F", "#6E8EE8", "#7FBF8A", "#AB7ADF", "#5FD1C4"];
  var CHAIN_COLOR_GROUPS = [
    { label: "Structural", colors: ["#AB7ADF", "#6E8EE8", "#3D9B8F", "#5FD1C4", "#3E5FC4"] },
    { label: "Accent", colors: ["#F0C361", "#E8614F", "#E888C9", "#7FBF8A"] },
    { label: "Neutral", colors: ["#8A9BA8", "#C9C4D8", "#5B5470"] }
  ];
  var REP_STYLE_KEY = { cartoon: "cartoon", surface: "cartoon", sticks: "stick", spheres: "sphere", lines: "line" };
  function atomDescriptor(atom) {
    return {
      chain: atom.chain,
      resi: atom.resi,
      resn: atom.resn,
      atomName: atom.atom,
      elem: atom.elem,
      hetflag: !!atom.hetflag,
      // The residue as a whole: what a person means by clicking part of a side
      // chain.
      key: `${atom.chain}|${atom.resi}|${atom.resn}`,
      serial: atom.serial
    };
  }
  var DEFAULT_SELECTION_REP = "keep";
  var RESIDUE_REPS = [
    { id: "keep", label: "Keep current" },
    { id: "licorice", label: "Licorice" },
    { id: "stick", label: "Stick" },
    { id: "sphere", label: "Sphere" },
    { id: "ball-and-stick", label: "Ball & stick" },
    { id: "cartoon", label: "Cartoon" },
    { id: "ribbon", label: "Ribbon" },
    { id: "line", label: "Line" }
  ];
  function colorToRgb(c) {
    if (typeof c === "number") return [c >> 16 & 255, c >> 8 & 255, c & 255];
    if (c && typeof c === "object" && typeof c.r === "number") return [c.r * 255, c.g * 255, c.b * 255];
    if (typeof c === "string") {
      const hex = /^(?:#|0x)?([0-9a-f]{6})$/i.exec(c.trim());
      if (hex) {
        const n = parseInt(hex[1], 16);
        return [n >> 16 & 255, n >> 8 & 255, n & 255];
      }
      try {
        const cc = window.$3Dmol?.CC?.color(c);
        if (cc && typeof cc.r === "number") return [cc.r * 255, cc.g * 255, cc.b * 255];
      } catch {
      }
    }
    return null;
  }
  var SELECTION_HIGHLIGHTS = ["#FFE600", "#00E5FF", "#FF2BD6"];
  function colorDistance(a, b) {
    const rm = (a[0] + b[0]) / 2;
    const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
  }
  function contrastSelectionColor(baseColor, backgroundColor = "#0f0a16") {
    const base = colorToRgb(baseColor);
    const bg = colorToRgb(backgroundColor) || [15, 10, 22];
    let best = SELECTION_HIGHLIGHTS[0];
    let bestScore = -1;
    for (const hex of SELECTION_HIGHLIGHTS) {
      const rgb = colorToRgb(hex);
      const score = Math.min(base ? colorDistance(rgb, base) : Infinity, colorDistance(rgb, bg));
      if (score > bestScore) {
        bestScore = score;
        best = hex;
      }
    }
    return best;
  }
  function residueSelector(item) {
    return item.serials && item.serials.length ? { serial: item.serials } : { chain: item.chain, resi: item.resi };
  }
  function recolorInPlace(glviewer, selector, color, backgroundColor) {
    const groups = /* @__PURE__ */ new Map();
    for (const atom of glviewer.selectedAtoms(selector)) {
      const style = atom.style || {};
      const keys = Object.keys(style).filter((k) => style[k] && typeof style[k] === "object").sort();
      if (!keys.length) continue;
      const target = color || contrastSelectionColor(style[keys[0]].color, backgroundColor);
      const sig = `${keys.join(",")}|${target}`;
      if (!groups.has(sig)) groups.set(sig, { keys, target, serials: [] });
      groups.get(sig).serials.push(atom.serial);
    }
    for (const { keys, target, serials } of groups.values()) {
      const spec = {};
      for (const k of keys) spec[k] = { color: target, colorscheme: void 0, colorfunc: void 0 };
      glviewer.addStyle({ serial: serials }, spec);
    }
  }
  function applyResidueHighlight(glviewer, item, color, rep, backgroundColor) {
    const selector = residueSelector(item);
    if (rep && rep !== "keep") {
      const first = glviewer.selectedAtoms(selector).find((a) => a.style && Object.keys(a.style).length);
      const base = first ? first.style[Object.keys(first.style)[0]]?.color : null;
      const fixed = color || contrastSelectionColor(base, backgroundColor);
      recolorInPlace(glviewer, selector, fixed);
      glviewer.addStyle(selector, residueStyleFor(rep, fixed));
    } else {
      recolorInPlace(glviewer, selector, color, backgroundColor);
    }
  }
  function residueStyleFor(rep, color) {
    switch (rep) {
      case "sphere":
        return { sphere: { color } };
      case "ball-and-stick":
        return { stick: { color, radius: 0.18 }, sphere: { color, scale: 0.28 } };
      case "cartoon":
        return { cartoon: { color } };
      case "ribbon":
        return { cartoon: { color, style: "trace" } };
      case "line":
        return { line: { color } };
      case "stick":
        return { stick: { color, radius: 0.2 } };
      case "licorice":
      default:
        return { stick: { color, radius: 0.3 } };
    }
  }
  var SELECTION_OUTLINE_LIMIT = 40;
  var SVG_NS = "http://www.w3.org/2000/svg";
  function selectionScreenBox(glviewer, atoms, origin, pad = 7) {
    const points = glviewer.modelToScreen(atoms.map((a) => ({ x: a.x, y: a.y, z: a.z })));
    const ox = origin.left + window.pageXOffset;
    const oy = origin.top + window.pageYOffset;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of points) {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      x0 = Math.min(x0, p.x - ox);
      y0 = Math.min(y0, p.y - oy);
      x1 = Math.max(x1, p.x - ox);
      y1 = Math.max(y1, p.y - oy);
    }
    if (!Number.isFinite(x0)) return null;
    return { x: x0 - pad, y: y0 - pad, width: x1 - x0 + 2 * pad, height: y1 - y0 + 2 * pad };
  }
  function createSelectionOutlineLayer(count) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("aria-hidden", "true");
    Object.assign(svg.style, {
      position: "absolute",
      left: "0",
      top: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      overflow: "visible",
      zIndex: "2",
      opacity: "0.8"
    });
    const boxes = [];
    for (let i = 0; i < count; i++) {
      const pair = ["#000000", "#FFFFFF"].map((stroke, j) => {
        const rect = document.createElementNS(SVG_NS, "rect");
        rect.setAttribute("fill", "none");
        rect.setAttribute("stroke", stroke);
        rect.setAttribute("stroke-width", "1.25");
        rect.setAttribute("stroke-dasharray", "4 4");
        rect.setAttribute("rx", "3");
        const march = document.createElementNS(SVG_NS, "animate");
        march.setAttribute("attributeName", "stroke-dashoffset");
        march.setAttribute("from", String(j * 4));
        march.setAttribute("to", String(j * 4 - 16));
        march.setAttribute("dur", "1.2s");
        march.setAttribute("repeatCount", "indefinite");
        rect.appendChild(march);
        rect.style.display = "none";
        svg.appendChild(rect);
        return rect;
      });
      boxes.push(pair);
    }
    return {
      svg,
      place(i, box) {
        for (const rect of boxes[i] || []) {
          if (!box) {
            rect.style.display = "none";
            continue;
          }
          rect.style.display = "";
          rect.setAttribute("x", box.x.toFixed(1));
          rect.setAttribute("y", box.y.toFixed(1));
          rect.setAttribute("width", Math.max(box.width, 1).toFixed(1));
          rect.setAttribute("height", Math.max(box.height, 1).toFixed(1));
        }
      }
    };
  }
  function useMolViewer(mountNode, { pdbText, chains, hetGroups, repMode, visibility, chainColors, ligandColors, itemReps, autoSpin, colorTarget, backgroundColor, onHoverAtom, onPickAtom, onPickBackground, selections, selectionColor, selectionRep, paintedResidues, hiddenResidues }) {
    const viewerRef = useRef(null);
    const surfaceHandleRef = useRef(null);
    const surfaceGenRef = useRef(0);
    const [libraryMissing, setLibraryMissing] = useState(false);
    useEffect(() => {
      if (!mountNode) return;
      if (!window.$3Dmol) {
        setLibraryMissing(true);
        return;
      }
      setLibraryMissing(false);
      const glviewer = window.$3Dmol.createViewer(mountNode, {
        backgroundColor: backgroundColor || "#0f0a16",
        antialias: true
      });
      viewerRef.current = glviewer;
      return () => {
        try {
          glviewer.clear();
        } catch {
        }
        viewerRef.current = null;
      };
    }, [mountNode]);
    useEffect(() => {
      const glviewer = viewerRef.current;
      if (!glviewer || !backgroundColor) return;
      if (typeof glviewer.setBackgroundColor === "function") {
        glviewer.setBackgroundColor(backgroundColor);
        glviewer.render();
      }
    }, [backgroundColor, mountNode]);
    useEffect(() => {
      const glviewer = viewerRef.current;
      if (!glviewer || !pdbText) return;
      glviewer.clear();
      glviewer.addModel(pdbText, "pdb");
      glviewer.zoomTo();
      glviewer.render();
    }, [pdbText]);
    const atomClickAtRef = useRef(0);
    const shiftHeldRef = useRef(false);
    const hoverCbRef = useRef(null);
    const pickCbRef = useRef(null);
    hoverCbRef.current = onHoverAtom;
    const pickBackgroundRef = useRef(null);
    pickBackgroundRef.current = onPickBackground;
    pickCbRef.current = onPickAtom;
    useEffect(() => {
      const glviewer = viewerRef.current;
      if (!glviewer || !pdbText) return;
      glviewer.setStyle({}, {});
      surfaceGenRef.current += 1;
      const surfaceGen = surfaceGenRef.current;
      if (surfaceHandleRef.current) {
        try {
          glviewer.removeSurface(surfaceHandleRef.current);
        } catch {
        }
        surfaceHandleRef.current = null;
      }
      const styleKey = REP_STYLE_KEY[repMode] || "cartoon";
      chains.forEach((chain) => {
        const sel = { ...blockSelector(chain), hetflag: false };
        if (chain.isNucleic) {
          if (!visibility.nucleic || visibility.chains[chain.id] === false) {
            glviewer.setStyle(sel, {});
            return;
          }
          const nucColor = chainColors[chain.id] || "#7FB3E8";
          glviewer.setStyle(sel, { cartoon: { color: nucColor } });
          return;
        }
        if (visibility.chains[chain.id] === false) {
          glviewer.setStyle(sel, {});
          return;
        }
        const color = chainColors[chain.id] || "#AB7ADF";
        const chainRep = (itemReps || {})[chain.id];
        const styleSpec = chainRep ? residueStyleFor(chainRep, color) : {};
        if (!chainRep) {
          if (styleKey === "cartoon") styleSpec.cartoon = { color };
          else if (styleKey === "stick") styleSpec.stick = { color, radius: 0.16 };
          else if (styleKey === "sphere") styleSpec.sphere = { color, scale: 0.35 };
          else if (styleKey === "line") styleSpec.line = { color };
        }
        glviewer.setStyle(sel, styleSpec);
      });
      if (repMode === "surface") {
        const visibleChainIds = chains.filter((c) => visibility.chains[c.id] !== false).map((c) => c.chainLetter || c.id);
        if (visibleChainIds.length && window.$3Dmol.SurfaceType) {
          glviewer.addSurface(window.$3Dmol.SurfaceType.VDW, { opacity: 0.85, colorscheme: "whiteCarbon" }, { chain: visibleChainIds, hetflag: false }).then((handle) => {
            if (surfaceGenRef.current !== surfaceGen) {
              try {
                glviewer.removeSurface(handle);
              } catch {
              }
              glviewer.render();
              return;
            }
            surfaceHandleRef.current = handle;
          });
        }
      }
      hetGroups.filter((g) => g.isIon).forEach((group, i) => {
        const key = group.resn + "|" + group.resi + "|" + group.chain;
        if (!visibility.ions || visibility.hidden[key]) {
          glviewer.setStyle({ ...blockSelector(group), resi: group.resi, resn: group.resn }, {});
          return;
        }
        const color = ligandColors[key] || VIEWER_LIGAND_COLORS[i % VIEWER_LIGAND_COLORS.length];
        const ionStyle = (itemReps || {})[key] ? residueStyleFor(itemReps[key], color) : { sphere: { color, radius: 0.55 } };
        glviewer.setStyle({ ...blockSelector(group), resi: group.resi, resn: group.resn }, ionStyle);
      });
      if (visibility.ligands) {
        hetGroups.filter((g) => g.resn !== "HOH" && !g.isIon).forEach((group, i) => {
          const key = group.resn + "|" + group.resi + "|" + group.chain;
          if (visibility.hidden[key]) {
            glviewer.setStyle({ ...blockSelector(group), resi: group.resi, resn: group.resn }, {});
            return;
          }
          const color = ligandColors[key] || VIEWER_LIGAND_COLORS[i % VIEWER_LIGAND_COLORS.length];
          const ligStyle = (itemReps || {})[key] ? residueStyleFor(itemReps[key], color) : { stick: { color, radius: 0.22 } };
          glviewer.setStyle({ ...blockSelector(group), resi: group.resi, resn: group.resn }, ligStyle);
        });
      }
      if (visibility.waters) {
        glviewer.setStyle({ resn: "HOH" }, { sphere: { color: "#6E8EE8", radius: 0.18 } });
      } else {
        glviewer.setStyle({ resn: "HOH" }, {});
      }
      for (const painted of Object.values(paintedResidues || {})) {
        applyResidueHighlight(glviewer, painted, painted.color, painted.rep, backgroundColor);
      }
      for (const sel of selections || []) {
        applyResidueHighlight(glviewer, sel, selectionColor, selectionRep, backgroundColor);
      }
      for (const hidden of Object.values(hiddenResidues || {})) {
        glviewer.setStyle(residueSelector(hidden), {});
      }
      try {
        glviewer.setHoverable(
          {},
          true,
          (atom) => {
            if (atom) hoverCbRef.current?.(atomDescriptor(atom));
          },
          () => hoverCbRef.current?.(null)
        );
        glviewer.setClickable({}, true, (atom, _v, event) => {
          if (!atom) return;
          atomClickAtRef.current = Date.now();
          pickCbRef.current?.(atomDescriptor(atom), !!(event && event.shiftKey) || shiftHeldRef.current);
        });
      } catch {
      }
      glviewer.render();
    }, [pdbText, chains, hetGroups, repMode, visibility, chainColors, ligandColors, itemReps, selections, selectionColor, selectionRep, paintedResidues, hiddenResidues, backgroundColor]);
    useEffect(() => {
      const glviewer = viewerRef.current;
      const visible = (selections || []).filter((sel) => !(hiddenResidues || {})[sel.key]).slice(0, SELECTION_OUTLINE_LIMIT);
      if (!mountNode || !glviewer || visible.length === 0) return void 0;
      if (window.getComputedStyle(mountNode).position === "static") mountNode.style.position = "relative";
      const layer = createSelectionOutlineLayer(visible.length);
      mountNode.appendChild(layer.svg);
      let frame = 0;
      const draw = () => {
        const origin = mountNode.getBoundingClientRect();
        visible.forEach((sel, i) => {
          const atoms = glviewer.selectedAtoms(residueSelector(sel));
          const box = atoms.length ? selectionScreenBox(glviewer, atoms, origin) : null;
          layer.place(i, box);
        });
        frame = window.requestAnimationFrame(draw);
      };
      draw();
      return () => {
        window.cancelAnimationFrame(frame);
        layer.svg.remove();
      };
    }, [selections, hiddenResidues, mountNode, pdbText]);
    useEffect(() => {
      if (!mountNode) return;
      const onPointerDownCapture = (e) => {
        shiftHeldRef.current = !!e.shiftKey;
        if (e.shiftKey) {
          e.stopPropagation();
        }
      };
      const EDGE_FRACTION = 0.14;
      const ROLL_DEGREES_PER_PIXEL = 0.4;
      let rolling = false;
      let rollAxis = null;
      let rollSign = 1;
      let lastPoint = { x: 0, y: 0 };
      const onMouseDown = (e) => {
        if (e.button !== 0 || e.shiftKey) return;
        const rect = mountNode.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const marginX = rect.width * EDGE_FRACTION;
        const marginY = rect.height * EDGE_FRACTION;
        const onLeft = x < marginX;
        const onRight = x > rect.width - marginX;
        const onTop = y < marginY;
        const onBottom = y > rect.height - marginY;
        if (!onLeft && !onRight && !onTop && !onBottom) return;
        const depthX = onLeft ? x : onRight ? rect.width - x : Infinity;
        const depthY = onTop ? y : onBottom ? rect.height - y : Infinity;
        if (depthX <= depthY) {
          rollAxis = "vertical";
          rollSign = onRight ? -1 : 1;
        } else {
          rollAxis = "horizontal";
          rollSign = onBottom ? 1 : -1;
        }
        rolling = true;
        lastPoint = { x: e.clientX, y: e.clientY };
        e.stopPropagation();
        e.preventDefault();
      };
      const onMouseMove = (e) => {
        if (!rolling) return;
        const glviewer = viewerRef.current;
        if (!glviewer) return;
        const dx = e.clientX - lastPoint.x;
        const dy = e.clientY - lastPoint.y;
        lastPoint = { x: e.clientX, y: e.clientY };
        const travel = rollAxis === "vertical" ? dy : dx;
        const delta = travel * ROLL_DEGREES_PER_PIXEL * rollSign;
        if (delta === 0) return;
        try {
          glviewer.rotate(delta, "vz");
          glviewer.render();
        } catch {
          try {
            glviewer.rotate(delta, "z");
            glviewer.render();
          } catch {
            rolling = false;
          }
        }
        e.stopPropagation();
        e.preventDefault();
      };
      const endRoll = () => {
        rolling = false;
      };
      const onClick = () => {
        const clickedAtom = Date.now() - atomClickAtRef.current < 250;
        if (!clickedAtom) pickBackgroundRef.current?.();
      };
      mountNode.addEventListener("pointerdown", onPointerDownCapture, true);
      mountNode.addEventListener("mousedown", onMouseDown, true);
      window.addEventListener("mousemove", onMouseMove, true);
      window.addEventListener("mouseup", endRoll, true);
      mountNode.addEventListener("click", onClick);
      return () => {
        mountNode.removeEventListener("pointerdown", onPointerDownCapture, true);
        mountNode.removeEventListener("mousedown", onMouseDown, true);
        window.removeEventListener("mousemove", onMouseMove, true);
        window.removeEventListener("mouseup", endRoll, true);
        mountNode.removeEventListener("click", onClick);
      };
    }, [mountNode]);
    useEffect(() => {
      const glviewer = viewerRef.current;
      if (!glviewer) return;
      if (autoSpin) glviewer.spin("y", 0.4);
      else glviewer.spin(false);
    }, [autoSpin, pdbText]);
    const resetView = useCallback(() => {
      const glviewer = viewerRef.current;
      if (!glviewer) return;
      glviewer.zoomTo();
      if (typeof glviewer.getView === "function" && typeof glviewer.setView === "function") {
        const view = glviewer.getView();
        if (Array.isArray(view) && view.length === 8) {
          glviewer.setView([view[0], view[1], view[2], view[3], 0, 0, 0, 1]);
        }
      }
      glviewer.render();
    }, []);
    const captureScreenshot = useCallback(() => {
      const glviewer = viewerRef.current;
      if (!glviewer) return null;
      return glviewer.pngURI ? glviewer.pngURI() : null;
    }, []);
    return { resetView, captureScreenshot, libraryMissing };
  }
  function parsePdbSummary(pdbText) {
    const structureTags = /* @__PURE__ */ new Map();
    const serialInfo = /* @__PURE__ */ new Map();
    const residueSerials = /* @__PURE__ */ new Map();
    const occurrenceInStructure = /* @__PURE__ */ new Map();
    let openStructureLabel = null;
    const chainsMap = /* @__PURE__ */ new Map();
    const hetMap = /* @__PURE__ */ new Map();
    if (!pdbText) return { chains: [], hetGroups: [] };
    const lines = pdbText.split("\n");
    const occurrenceCounts = /* @__PURE__ */ new Map();
    let openBlockChainLetter = null;
    let openBlockKey = null;
    let boundaryPending = true;
    let groupIndex = -1;
    let currentGroupFirstLetter = null;
    for (const line of lines) {
      const record = line.slice(0, 6).trim();
      if (record === "REMARK" && line.startsWith("REMARK 999 ASTRA3 STRUCTURE ")) {
        const [tag, ...label] = line.slice("REMARK 999 ASTRA3 STRUCTURE ".length).trim().split(/\s+/);
        if (tag && label.length) structureTags.set(tag, label.join(" "));
        continue;
      }
      if (record === "TER") {
        boundaryPending = true;
        continue;
      }
      if (record !== "ATOM" && record !== "HETATM") continue;
      const resn = line.slice(17, 20).trim();
      const chainLetter = line.slice(21, 22).trim() || "A";
      const resi = line.slice(22, 26).trim();
      const serial = parseInt(line.slice(6, 11).trim(), 10);
      const structureLabel = structureTags.size ? structureTags.get(line.slice(72, 76).trim()) || structureTags.get("*") || null : null;
      if (boundaryPending || chainLetter !== openBlockChainLetter || structureLabel !== openStructureLabel) {
        const count = (occurrenceCounts.get(chainLetter) || 0) + 1;
        occurrenceCounts.set(chainLetter, count);
        openBlockKey = count > 1 ? `${chainLetter}#${count}` : chainLetter;
        openBlockChainLetter = chainLetter;
        boundaryPending = false;
        if (structureLabel) {
          groupIndex = [...new Set(structureTags.values())].indexOf(structureLabel);
        } else if (currentGroupFirstLetter === null || chainLetter <= currentGroupFirstLetter) {
          groupIndex += 1;
          currentGroupFirstLetter = chainLetter;
        }
        openStructureLabel = structureLabel;
        const occKey = `${structureLabel}|${chainLetter}`;
        occurrenceInStructure.set(occKey, (occurrenceInStructure.get(occKey) || 0) + 1);
      }
      const resKey = `${openBlockKey}|${line.slice(22, 27).trim()}|${resn}`;
      if (Number.isFinite(serial)) {
        serialInfo.set(serial, { blockKey: openBlockKey, resKey, structureLabel });
        if (!residueSerials.has(resKey)) residueSerials.set(resKey, []);
        residueSerials.get(resKey).push(serial);
      }
      if (record === "ATOM") {
        if (!chainsMap.has(openBlockKey)) {
          chainsMap.set(openBlockKey, {
            id: openBlockKey,
            chainLetter,
            occurrence: occurrenceCounts.get(chainLetter),
            resCount: 0,
            nucleicCount: 0,
            serials: [],
            groupIndex,
            structureLabel,
            structureOccurrence: occurrenceInStructure.get(`${structureLabel}|${chainLetter}`) || 1
          });
        }
        const entry = chainsMap.get(openBlockKey);
        entry.resCount++;
        if (NUCLEIC_RESN.has(resn)) entry.nucleicCount++;
        if (Number.isFinite(serial)) entry.serials.push(serial);
      } else if (resn !== "HOH") {
        const key = resn + "|" + resi + "|" + openBlockKey;
        if (!hetMap.has(key)) {
          hetMap.set(key, { resn, resi, chain: openBlockKey, chainLetter, serials: [], groupIndex, structureLabel, isIon: isIonResn(resn) });
        }
        if (Number.isFinite(serial)) hetMap.get(key).serials.push(serial);
      }
    }
    const chains = Array.from(chainsMap.values()).map((c) => ({
      ...c,
      // Majority rule, on atom counts. Nucleotides have far more atoms per
      // residue than the stray het that might sit in the same chain, so a
      // simple majority is a reliable signal here.
      isNucleic: c.resCount > 0 && c.nucleicCount / c.resCount > 0.5
    }));
    const hetGroups = Array.from(hetMap.values()).map((g) => ({
      ...g,
      isIon: g.isIon || g.serials.length === 1
    }));
    return { chains, hetGroups, residueIndex: { serialInfo, residueSerials } };
  }
  function ordinalSuffix(n) {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
    return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th"}`;
  }
  function chainDisplayLabel(c, groupIds) {
    const letter = c.chainLetter || c.id;
    if (c.structureLabel) {
      const occ = c.structureOccurrence || 1;
      return `${c.structureLabel} (Chain ${letter}${occ > 1 ? `; ${ordinalSuffix(occ)} occurrence` : ""})`;
    }
    if (groupIds && c.groupIndex != null && groupIds[c.groupIndex]) return `${groupIds[c.groupIndex]} (Chain ${letter})`;
    return `Chain ${letter}${c.occurrence > 1 ? ` (${ordinalSuffix(c.occurrence)} occurrence)` : ""}`;
  }
  var NUCLEIC_RESN = /* @__PURE__ */ new Set([
    "DA",
    "DC",
    "DG",
    "DT",
    "DU",
    "DI",
    "A",
    "C",
    "G",
    "U",
    "I",
    "+A",
    "+C",
    "+G",
    "+T",
    "+U",
    "ADE",
    "CYT",
    "GUA",
    "THY",
    "URA"
  ]);
  var ION_RESN = /* @__PURE__ */ new Set([
    "NA",
    "K",
    "MG",
    "CA",
    "MN",
    "FE",
    "FE2",
    "CO",
    "NI",
    "CU",
    "CU1",
    "ZN",
    "CD",
    "HG",
    "CL",
    "BR",
    "IOD",
    "F",
    "LI",
    "RB",
    "CS",
    "SR",
    "BA",
    "AL",
    "AU",
    "AG",
    "PT",
    "PB",
    "CR",
    "MO",
    "W",
    "V",
    "SE",
    "SM",
    "GD",
    "EU",
    "YB",
    "LU",
    "TB",
    "HO",
    "ER",
    "NH4",
    "OH"
  ]);
  var POLY_ION_RESN = /* @__PURE__ */ new Set(["SO4", "PO4", "NO3", "CO3", "ACT", "EDO", "GOL", "MES", "TRS", "CAC", "FMT"]);
  function isIonResn(resn) {
    return ION_RESN.has(resn) || POLY_ION_RESN.has(resn);
  }
  function blockSelector(entry) {
    const chainLetter = entry.chainLetter || entry.chain;
    if (entry.serials && entry.serials.length) {
      return { chain: chainLetter, serial: entry.serials };
    }
    return { chain: chainLetter };
  }
  function ViewerPage() {
    const [mountNode, setMountNode] = useState(null);
    const { history, quickViews, addQuickView, removeQuickView, settings, isElectron, sessionStartTime, selectedViewerId, setSelectedViewerId } = useApp();
    const toast = useToast();
    const completed = history.filter((h) => h.status === "complete" && h.kind !== "batch");
    const { batchGroups, ordered } = groupCompletedByBatch(history, completed);
    const [expandedBatches, setExpandedBatches] = useState({});
    const [selected, setSelected] = useState(completed[0] || quickViews[0] || null);
    const listed = [...ordered, ...quickViews.map((run) => ({ run, timestamp: run.timestamp }))].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    const quickViewText = useRef(/* @__PURE__ */ new Map());
    const [quickOpen, setQuickOpen] = useState(false);
    const [quickId, setQuickId] = useState("");
    const [quickBusy, setQuickBusy] = useState(false);
    const [quickError, setQuickError] = useState(null);
    useEffect(() => {
      if (!selectedViewerId) return;
      const wanted = history.find((h) => h.id === selectedViewerId);
      if (wanted) {
        if (wanted.kind === "batch") {
          setExpandedBatches((e) => ({ ...e, [wanted.id]: true }));
          const group = batchGroups.find((g) => g.batch.id === wanted.id);
          if (group && group.children.length > 0) setSelected(group.children[0]);
        } else {
          setSelected(wanted);
        }
      }
      setSelectedViewerId(null);
    }, [selectedViewerId]);
    const [pdbText, setPdbText] = useState(null);
    const [loadError, setLoadError] = useState(null);
    const [loading, setLoading] = useState(false);
    const pdbPathFor = async (entry) => {
      if (entry.sessionPath && /\.(pse|cxs)$/.test(entry.sessionPath)) {
        return entry.sessionPath.slice(0, -4) + ".pdb";
      }
      const folder = await resolveRealOutputFolder(entry, settings);
      if (!folder) return null;
      const files = await window.astra3Native.listDir(`${folder}/Session`);
      const pdbFile = files.find((f) => f.toLowerCase().endsWith(".pdb"));
      return pdbFile ? `${folder}/Session/${pdbFile}` : null;
    };
    useEffect(() => {
      if (!selected) {
        setPdbText(null);
        return;
      }
      setLoading(true);
      setLoadError(null);
      if (!isElectron) {
        setLoading(false);
        setLoadError("Loading real structure data requires the desktop app (file access is not available in this preview).");
        setPdbText(null);
        return;
      }
      let cancelled = false;
      if (selected.kind === "quickview") {
        const kept = quickViewText.current.get(selected.id);
        if (kept) {
          setPdbText(kept);
          setLoading(false);
          return void 0;
        }
        window.astra3Native.quickView({ id: selected.structureId, path: selected.path || null }).then((result) => {
          if (cancelled) return;
          if (result && result.ok) {
            quickViewText.current.set(selected.id, result.text);
            setPdbText(result.text);
          } else {
            setLoadError(result?.error || "Quick View could not load this structure.");
            setPdbText(null);
          }
          setLoading(false);
        });
        return () => {
          cancelled = true;
        };
      }
      pdbPathFor(selected).then((path) => {
        if (cancelled) return;
        if (!path) {
          const isCurrentSession = !selected.timestamp || selected.timestamp >= sessionStartTime;
          setLoadError(isCurrentSession ? `Could not locate the structure file for ${selected.label}. Its output folder may not have been generated yet, may have used -sessiononly/-skipreport, or may have been moved/deleted since the run finished.` : outputFolderNotFoundMessage(selected, sessionStartTime));
          setPdbText(null);
          setLoading(false);
          return;
        }
        window.astra3Native.readFile(path).then((text) => {
          if (cancelled) return;
          setPdbText(text);
          setLoading(false);
        }).catch((e) => {
          if (cancelled) return;
          setLoadError(`Could not read the structure file for ${selected.label}: ${e.message || e}.`);
          setPdbText(null);
          setLoading(false);
        });
      });
      return () => {
        cancelled = true;
      };
    }, [selected, isElectron]);
    const { chains: parsedChains, hetGroups, residueIndex } = useMemo(() => parsePdbSummary(pdbText), [pdbText]);
    const chains = parsedChains.length ? parsedChains : [];
    const groupIdsForLabels = useMemo(() => {
      if (!selected) return null;
      const knownIds = idsFromHistoryEntry(selected);
      if (knownIds.length < 2) return null;
      const maxGroupIndex = Math.max(-1, ...chains.map((c) => c.groupIndex ?? -1));
      if (maxGroupIndex + 1 !== knownIds.length) return null;
      return knownIds;
    }, [selected, chains]);
    const realLigandGroups = hetGroups.filter((g) => g.resn !== "HOH");
    const proteinChains = chains.filter((c) => !c.isNucleic);
    const nucleicChains = chains.filter((c) => c.isNucleic);
    const ionGroups = hetGroups.filter((g) => g.isIon);
    const ligandOnlyGroups = hetGroups.filter((g) => g.resn !== "HOH" && !g.isIon);
    const chainHets = hetGroupsByChain(chains, hetGroups);
    const [repMode, setRepMode] = useState("cartoon");
    const [visibility, setVisibility] = useState({ ligands: true, ions: true, nucleic: true, waters: false, chains: {}, hidden: {} });
    const [chainColors, setChainColors] = useState({});
    const [ligandColors, setLigandColors] = useState({});
    const [itemReps, setItemReps] = useState({});
    const setItemRep = (key, rep) => setItemReps((st) => {
      const next = { ...st };
      if (rep) next[key] = rep;
      else delete next[key];
      return next;
    });
    const [colorTarget, setColorTarget] = useState(null);
    const [closedChainHets, setClosedChainHets] = useState({});
    const [autoSpin, setAutoSpin] = useState(true);
    const [backgroundColor, setBackgroundColor] = useState("#0f0a16");
    useEffect(() => {
      setChainColors((prev) => {
        const next = { ...prev };
        chains.forEach((c, i) => {
          if (!next[c.id]) next[c.id] = VIEWER_CHAIN_COLORS[i % VIEWER_CHAIN_COLORS.length];
        });
        return next;
      });
      setVisibility((prev) => {
        const next = { ...prev, chains: { ...prev.chains } };
        chains.forEach((c) => {
          if (next.chains[c.id] === void 0) next.chains[c.id] = true;
        });
        return next;
      });
    }, [chains]);
    const [hoveredAtom, setHoveredAtom] = useState(null);
    const [selections, setSelections] = useState([]);
    const [selectionColor, setSelectionColor] = useState(null);
    const [selectionRep, setSelectionRep] = useState(DEFAULT_SELECTION_REP);
    const [hiddenResidues, setHiddenResidues] = useState({});
    const [paintedResidues, setPaintedResidues] = useState({});
    const selection = selections.length ? selections[selections.length - 1] : null;
    const commitPainted = useCallback((list, color, rep) => {
      if (!list || list.length === 0) return;
      setPaintedResidues((prev) => {
        const next = { ...prev };
        for (const sel of list) next[sel.key] = { chain: sel.chain, block: sel.block, resi: sel.resi, serials: sel.serials, color, rep };
        return next;
      });
    }, []);
    const clearPaintedOnChain = useCallback((chainId) => {
      setPaintedResidues((prev) => {
        const next = {};
        let changed = false;
        for (const [key, painted] of Object.entries(prev)) {
          if ((painted.block || painted.chain) === chainId) {
            changed = true;
            continue;
          }
          next[key] = painted;
        }
        return changed ? next : prev;
      });
    }, []);
    const setChainColor = useCallback((key, hex) => {
      setChainColors((prev) => ({ ...prev, [key]: hex }));
      clearPaintedOnChain(key);
    }, [clearPaintedOnChain]);
    const resetSelections = useCallback(() => {
      setSelections([]);
      setSelectionRep(DEFAULT_SELECTION_REP);
    }, []);
    const keepSelections = useCallback(() => {
      setSelections((cur) => {
        commitPainted(cur, selectionColor, selectionRep);
        return [];
      });
      setSelectionRep(DEFAULT_SELECTION_REP);
    }, [commitPainted, selectionColor, selectionRep]);
    const { resetView, captureScreenshot, libraryMissing } = useMolViewer(mountNode, {
      pdbText,
      chains,
      hetGroups,
      repMode,
      visibility,
      chainColors,
      ligandColors,
      itemReps,
      autoSpin,
      colorTarget,
      backgroundColor,
      onHoverAtom: setHoveredAtom,
      // Plain click replaces the selection; clicking the only selected residue
      // clears it, so the same click that selects is still the way out.
      // Shift+click adds to or removes from the set without disturbing the
      // rest.
      onPickAtom: (picked, additive) => setSelections((cur) => {
        const info = residueIndex?.serialInfo?.get(picked.serial);
        const atom = info ? {
          ...picked,
          key: info.resKey,
          block: info.blockKey,
          structure: info.structureLabel,
          serials: residueIndex.residueSerials.get(info.resKey)
        } : picked;
        if (additive) {
          if (cur.some((sel) => sel.key === atom.key)) return cur.filter((sel) => sel.key !== atom.key);
          return [...cur, atom];
        }
        if (cur.length === 1 && cur[0].key === atom.key) return [];
        return [atom];
      }),
      // Clicking empty space abandons the selection entirely.
      onPickBackground: resetSelections,
      selections,
      selectionColor,
      selectionRep,
      paintedResidues,
      hiddenResidues
    });
    const resetEverything = useCallback(() => {
      resetView();
      setRepMode("cartoon");
      setChainColors({});
      setLigandColors({});
      setItemReps({});
      setVisibility({ ligands: true, ions: true, nucleic: true, waters: false, chains: {}, hidden: {} });
      setPaintedResidues({});
      setHiddenResidues({});
      setSelections([]);
      setSelectionColor(null);
      setSelectionRep(DEFAULT_SELECTION_REP);
      setBackgroundColor("#0f0a16");
      setColorTarget(null);
    }, [resetView]);
    useEffect(() => {
      setSelections([]);
      setPaintedResidues({});
      setHiddenResidues({});
      setSelectionRep(DEFAULT_SELECTION_REP);
      setHoveredAtom(null);
    }, [pdbText]);
    const selectionHidden = selections.length > 0 && selections.every((sel) => hiddenResidues[sel.key]);
    const toggleSelectionHidden = useCallback(() => {
      setHiddenResidues((prev) => {
        const next = { ...prev };
        if (selections.every((sel) => prev[sel.key])) {
          for (const sel of selections) delete next[sel.key];
        } else {
          for (const sel of selections) next[sel.key] = { chain: sel.chain, resi: sel.resi, serials: sel.serials };
        }
        return next;
      });
    }, [selections]);
    const hiddenCount = Object.keys(hiddenResidues).length;
    const toggleChainVis = (id) => setVisibility((v) => ({ ...v, chains: { ...v.chains, [id]: !v.chains[id] } }));
    const groupKeyOf = (g) => g.resn + "|" + g.resi + "|" + g.chain;
    const anyGroupVisible = (list) => list.some((g) => !visibility.hidden[groupKeyOf(g)]);
    const setGroupVis = (list, show, flag) => setVisibility((st) => ({
      ...st,
      [flag]: true,
      hidden: { ...st.hidden, ...Object.fromEntries(list.map((g) => [groupKeyOf(g), !show])) }
    }));
    const toggleGroupVis = (key) => setVisibility((v) => ({ ...v, hidden: { ...v.hidden, [key]: !v.hidden[key] } }));
    const isGroupHidden = (key) => visibility.hidden[key] === true;
    const openQuickView = async (event) => {
      event.preventDefault();
      if (quickBusy) return;
      if (!isElectron) {
        setQuickError("Quick View needs the Astra3 desktop app.");
        return;
      }
      setQuickBusy(true);
      setQuickError(null);
      let result;
      try {
        result = await window.astra3Native.quickView({ id: quickId });
      } catch (e) {
        result = { ok: false, error: `Quick View failed: ${e.message || e}` };
      }
      setQuickBusy(false);
      if (!result || !result.ok) {
        setQuickError(result?.error || "Quick View could not load this structure.");
        return;
      }
      const imported = result.kind === "import";
      const entry = addQuickView({
        label: result.id,
        structureId: result.id,
        source: result.kind,
        format: result.format,
        path: imported ? result.path : null,
        name: imported ? result.name : null
      });
      quickViewText.current.set(entry.id, result.text);
      setSelected(entry);
      setQuickId("");
      if (result.note) toast.push({ tone: "neutral", title: "Quick View", message: result.note });
    };
    const openSession = async () => {
      if (!selected) return;
      if (!isElectron) {
        toast.push({ tone: "neutral", title: "Opening session", message: selected.label });
        return;
      }
      if (selected.sessionPath) {
        const err2 = await window.astra3Native.openInPymol(selected.sessionPath);
        if (err2) toast.push({ tone: "error", title: "Could not open session", message: err2 });
        return;
      }
      const folder = await resolveRealOutputFolder(selected, settings);
      if (!folder) {
        toast.push({ tone: "error", title: "Could not open session", message: "Could not locate this run's output folder." });
        return;
      }
      const files = await window.astra3Native.listDir(`${folder}/Session`);
      const pseFile = files.find((f) => /\.(pse|cxs)$/i.test(f));
      if (!pseFile) {
        toast.push({ tone: "error", title: "Could not open session", message: "No session file found in this run's Session folder." });
        return;
      }
      const err = await window.astra3Native.openInPymol(`${folder}/Session/${pseFile}`);
      if (err) toast.push({ tone: "error", title: "Could not open session", message: err });
    };
    const takeScreenshot = async () => {
      const uri = captureScreenshot();
      if (!uri) {
        toast.push({ tone: "error", title: "Screenshot failed", message: "Viewer isn't ready yet." });
        return;
      }
      if (isElectron) {
        const saved = await window.astra3Native.saveScreenshot(uri, `${selected?.label || "structure"}_viewer.png`);
        if (!saved || saved.cancelled) return;
        if (!saved.ok) {
          toast.push({ tone: "error", title: "Screenshot not saved", message: saved.error || "" });
          return;
        }
      } else {
        downloadDataUri(uri, `${selected?.label || "structure"}_viewer.png`);
      }
      toast.push({ tone: "success", title: "Screenshot saved" });
    };
    return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", height: "100%" } }, /* @__PURE__ */ React.createElement("div", { style: { width: 220, borderRight: "1px solid var(--line-0)", overflowY: "auto", padding: 14, flexShrink: 0 } }, /* @__PURE__ */ React.createElement(SectionLabel, null, "Completed analyses"), listed.length === 0 ? /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "var(--text-1)" } }, "No completed analyses yet.") : /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4 } }, listed.map(({ group, run }) => group ? /* @__PURE__ */ React.createElement("div", { key: group.batch.id }, /* @__PURE__ */ React.createElement("button", { onClick: () => setExpandedBatches((e) => ({ ...e, [group.batch.id]: !e[group.batch.id] })), style: {
      textAlign: "left",
      padding: "8px 10px",
      borderRadius: "var(--radius-sm)",
      border: "none",
      cursor: "pointer",
      background: "transparent",
      color: "var(--text-0)",
      width: "100%",
      display: "flex",
      alignItems: "center",
      gap: 8
    } }, /* @__PURE__ */ React.createElement("span", { style: {
      display: "inline-flex",
      transition: "transform 160ms ease",
      transform: expandedBatches[group.batch.id] ? "rotate(90deg)" : "rotate(0deg)"
    } }, /* @__PURE__ */ React.createElement(Icon, { name: "chevronRight", size: 12 })), /* @__PURE__ */ React.createElement("span", { style: { minWidth: 0 } }, /* @__PURE__ */ React.createElement("span", { className: "mono", style: { fontSize: 12.5, fontWeight: 600, display: "block" } }, group.batch.label), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10.5, color: "var(--text-1)" } }, group.children.length, " structure", group.children.length === 1 ? "" : "s", " \xB7 ", timeAgo(group.batch.timestamp)))), expandedBatches[group.batch.id] && group.children.map((h) => /* @__PURE__ */ React.createElement("button", { key: h.id, onClick: () => setSelected(h), style: {
      textAlign: "left",
      padding: "6px 10px 6px 28px",
      borderRadius: "var(--radius-sm)",
      border: "none",
      cursor: "pointer",
      width: "100%",
      background: selected?.id === h.id ? "var(--accent-wash)" : "transparent",
      color: selected?.id === h.id ? "var(--accent-bright)" : "var(--text-0)"
    } }, /* @__PURE__ */ React.createElement("div", { className: "mono", style: { fontSize: 12, fontWeight: 600 } }, h.label)))) : ((h) => {
      const row = /* @__PURE__ */ React.createElement("button", { key: h.id, onClick: () => setSelected(h), style: {
        textAlign: "left",
        padding: "8px 10px",
        borderRadius: "var(--radius-sm)",
        border: "none",
        cursor: "pointer",
        background: selected?.id === h.id ? "var(--accent-wash)" : "transparent",
        color: selected?.id === h.id ? "var(--accent-bright)" : "var(--text-0)",
        flex: 1,
        minWidth: 0
      } }, /* @__PURE__ */ React.createElement("div", { className: "mono", style: { fontSize: 12.5, fontWeight: 600 } }, h.label), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, color: "var(--text-1)" } }, timeAgo(h.timestamp), h.kind === "quickview" ? " \xB7 Quick View" : ""));
      if (h.kind !== "quickview") return row;
      return /* @__PURE__ */ React.createElement("div", { key: h.id, style: { display: "flex", alignItems: "center", gap: 2 } }, row, /* @__PURE__ */ React.createElement(Tooltip, { text: "Remove from this list" }, /* @__PURE__ */ React.createElement(IconButton, { name: "x", size: 13, onClick: () => {
        removeQuickView(h.id);
        if (selected?.id === h.id) setSelected(null);
      } })));
    })(run))), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--line-0)" } }, /* @__PURE__ */ React.createElement("button", { onClick: () => {
      setQuickOpen((v) => !v);
      setQuickError(null);
    }, style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      width: "100%",
      padding: "6px 2px",
      border: "none",
      background: "transparent",
      color: "var(--text-0)",
      cursor: "pointer",
      fontSize: 12.5,
      fontWeight: 600
    } }, /* @__PURE__ */ React.createElement("span", { style: { display: "inline-flex", transition: "transform 160ms ease", transform: quickOpen ? "rotate(90deg)" : "rotate(0deg)" } }, /* @__PURE__ */ React.createElement(Icon, { name: "chevronRight", size: 12 })), "Quick View"), quickOpen && /* @__PURE__ */ React.createElement("form", { onSubmit: openQuickView, style: { marginTop: 6 } }, /* @__PURE__ */ React.createElement(
      TextInput,
      {
        mono: true,
        autoFocus: true,
        value: quickId,
        onChange: (e) => {
          setQuickId(e.target.value);
          setQuickError(null);
        },
        placeholder: "1AKE or AST-0001",
        "aria-label": "PDB ID or temporary ID",
        spellCheck: false
      }
    ), /* @__PURE__ */ React.createElement(Button, { type: "submit", variant: "secondary", size: "sm", icon: "viewer", disabled: quickBusy || !quickId.trim(), style: { width: "100%", marginTop: 8 } }, quickBusy ? "Opening\u2026" : "Open"), quickError ? /* @__PURE__ */ React.createElement("div", { role: "alert", style: { fontSize: 11, color: "var(--coral)", marginTop: 8, lineHeight: 1.5, wordBreak: "break-word" } }, quickError) : /* @__PURE__ */ React.createElement(FieldHint, null, "A PDB ID, or a temporary ID from the Import page. The structure opens here without an analysis.")))), !selected ? /* @__PURE__ */ React.createElement("div", { style: { flex: 1, display: "flex" } }, /* @__PURE__ */ React.createElement(EmptyState, { icon: "viewer", title: "Select an analysis", description: "Choose a completed analysis on the left to load it into the viewer, or open any structure with Quick View." })) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { flex: 1, position: "relative" } }, /* @__PURE__ */ React.createElement("div", { ref: setMountNode, style: { position: "absolute", inset: 0 } }), libraryMissing ? /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 30 } }, /* @__PURE__ */ React.createElement(EmptyState, { icon: "alertTriangle", title: "3D renderer failed to load", description: "renderer/vendor/3Dmol-min.js is missing. Run scripts/vendor-deps.sh (needs internet access once), then relaunch Astra3." })) : /* @__PURE__ */ React.createElement(React.Fragment, null, loading && /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,10,22,0.7)" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, color: "var(--text-1)", fontSize: 13 } }, /* @__PURE__ */ React.createElement(Spinner, { size: 16 }), "Loading structure\u2026")), loadError && /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 30, background: "rgba(10,8,14,0.85)" } }, /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 480, background: "var(--bg-2)", border: "1px solid var(--coral)", borderRadius: "var(--radius-lg)", padding: 20, boxShadow: "var(--shadow-lg)" } }, /* @__PURE__ */ React.createElement(EmptyState, { icon: "alertTriangle", title: "Could not load structure", description: loadError })))), /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", top: 14, left: 14, display: "flex", alignItems: "center", gap: 10 } }, /* @__PURE__ */ React.createElement("span", { className: "mono", style: { fontSize: 13, fontWeight: 700, background: "var(--bg-2)", padding: "6px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--line-0)" } }, selected.label, selected.kind === "quickview" && selected.name ? ` \xB7 ${selected.name}` : "")), /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", bottom: 14, left: 14, right: 14, fontSize: 11, color: "var(--text-2)", lineHeight: 1.6, pointerEvents: "none" } }, "Drag to orbit \xB7 drag near an edge to rotate \xB7 middle-click/ctrl+drag to pan \xB7 scroll to zoom \xB7 click an atom to select \xB7 shift+click for several"), (hoveredAtom || selection) && /* @__PURE__ */ React.createElement("div", { className: "mono", style: {
      // Raised above the controls hint rather than sharing its
      // line: the two overlapped whenever a selection was active,
      // and the hint is what a newcomer needs to still be able to
      // read.
      position: "absolute",
      bottom: 46,
      right: 14,
      maxWidth: 300,
      fontSize: 11,
      lineHeight: 1.6,
      textAlign: "right",
      background: "var(--bg-2)",
      border: "1px solid var(--line-0)",
      borderRadius: "var(--radius-sm)",
      padding: "8px 11px",
      boxShadow: "var(--shadow-sm)",
      pointerEvents: "none"
    } }, (() => {
      const a = hoveredAtom || selection;
      const isSel = !hoveredAtom && selection;
      return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-0)", fontWeight: 600 } }, a.resn, " ", a.resi, /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-2)", fontWeight: 400 } }, " \xB7 chain ", a.chain)), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--text-1)" } }, a.atomName, a.elem ? ` (${a.elem})` : "", a.hetflag ? " \xB7 hetero" : ""), /* @__PURE__ */ React.createElement("div", { style: { color: isSel ? "var(--gold)" : "var(--text-2)", fontSize: 10, marginTop: 2 } }, isSel ? "Selected. Click again to clear" : "Click to select"));
    })()), /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", top: 14, right: 14, display: "flex", gap: 6 } }, /* @__PURE__ */ React.createElement(Tooltip, { text: libraryMissing ? "" : autoSpin ? "Stop auto-rotation" : "Start auto-rotation" }, /* @__PURE__ */ React.createElement(IconButton, { name: "refresh", active: autoSpin, disabled: libraryMissing, onClick: () => setAutoSpin(!autoSpin) })), /* @__PURE__ */ React.createElement(Tooltip, { text: libraryMissing ? "" : "Reset view, colors and representations" }, /* @__PURE__ */ React.createElement(IconButton, { name: "cube", disabled: libraryMissing, onClick: resetEverything })), selected?.engine !== "astra3" && selected?.kind !== "quickview" && /* @__PURE__ */ React.createElement(Button, { variant: "secondary", size: "sm", icon: "cube", onClick: openSession }, "Open session"), /* @__PURE__ */ React.createElement(Button, { variant: "secondary", size: "sm", icon: "image", onClick: takeScreenshot }, "Screenshot"))), /* @__PURE__ */ React.createElement("div", { style: { width: 260, borderLeft: "1px solid var(--line-0)", padding: 16, overflowY: "auto", flexShrink: 0 } }, /* @__PURE__ */ React.createElement(SectionLabel, null, "Representation"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4, marginBottom: 20 } }, [["cartoon", "layers"], ["surface", "cube"], ["sticks", "grip"], ["spheres", "dot"], ["lines", "termini"]].map(([mode, icon]) => /* @__PURE__ */ React.createElement("button", { key: mode, onClick: () => setRepMode(mode), style: {
      display: "flex",
      alignItems: "center",
      gap: 9,
      padding: "8px 10px",
      borderRadius: "var(--radius-md)",
      border: "none",
      cursor: "pointer",
      background: repMode === mode ? "var(--accent-wash)" : "transparent",
      color: repMode === mode ? "var(--accent-bright)" : "var(--text-1)",
      fontSize: 12.5,
      fontWeight: 500,
      textTransform: "capitalize"
    } }, /* @__PURE__ */ React.createElement(Icon, { name: icon, size: 14 }), mode))), /* @__PURE__ */ React.createElement(SectionLabel, null, "Camera"), /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 20 } }, /* @__PURE__ */ React.createElement(VisRow, { label: "Auto-rotate", checked: autoSpin, onChange: setAutoSpin })), /* @__PURE__ */ React.createElement(CollapsibleSection, { title: "Visibility", style: { marginBottom: 20 } }, proteinChains.length > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, proteinChains.length === 1 ? /* @__PURE__ */ React.createElement(
      VisRow,
      {
        label: `Protein Chain (${proteinChains[0].chainLetter || proteinChains[0].id})`,
        checked: visibility.chains[proteinChains[0].id] !== false,
        onChange: () => toggleChainVis(proteinChains[0].id)
      }
    ) : (
      /* The master switch only; individual chains are toggled in the Chains
         section. */
      /* @__PURE__ */ React.createElement(
        VisRow,
        {
          label: `Protein Chains (${proteinChains.length})`,
          checked: proteinChains.some((c) => visibility.chains[c.id] !== false),
          onChange: (v) => setVisibility((st) => ({
            ...st,
            chains: { ...st.chains, ...Object.fromEntries(proteinChains.map((c) => [c.id, v])) }
          }))
        }
      )
    )), realLigandGroups.length > 0 && /* @__PURE__ */ React.createElement(
      VisRow,
      {
        label: "Ligands",
        checked: anyGroupVisible(realLigandGroups),
        onChange: (v) => setGroupVis(realLigandGroups, v, "ligands")
      }
    ), hetGroups.some((g) => g.isIon) && /* @__PURE__ */ React.createElement(
      VisRow,
      {
        label: "Ions",
        checked: anyGroupVisible(ionGroups),
        onChange: (v) => setGroupVis(ionGroups, v, "ions")
      }
    ), nucleicChains.length > 0 && /* @__PURE__ */ React.createElement(VisRow, { label: `DNA / RNA (${nucleicChains.length})`, checked: visibility.nucleic, onChange: (v) => setVisibility((st) => ({ ...st, nucleic: v })) })), /* @__PURE__ */ React.createElement(CollapsibleSection, { title: "Chains", count: chains.length || "" }, chains.length === 0 && !loading && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--text-2)" } }, "No chain data loaded yet."), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4 } }, chains.map((c) => /* @__PURE__ */ React.createElement(React.Fragment, { key: c.id }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "6px 2px" } }, /* @__PURE__ */ React.createElement("button", { onClick: () => toggleChainVis(c.id), style: { background: "none", border: "none", cursor: "pointer", color: visibility.chains[c.id] !== false ? "var(--text-0)" : "var(--text-2)" } }, /* @__PURE__ */ React.createElement(Icon, { name: visibility.chains[c.id] !== false ? "eye" : "eyeOff", size: 14 })), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12.5, fontWeight: 600, flex: 1 } }, chainDisplayLabel(c, groupIdsForLabels)), /* @__PURE__ */ React.createElement("button", { onClick: () => setColorTarget(colorTarget?.kind === "chain" && colorTarget.key === c.id ? null : { kind: "chain", key: c.id }), style: {
      width: 18,
      height: 18,
      borderRadius: 5,
      background: chainColors[c.id] || "#AB7ADF",
      border: "1.5px solid var(--line-1)",
      cursor: "pointer"
    } })), /* @__PURE__ */ React.createElement(
      ChainHetRows,
      {
        entry: chainHets[c.id],
        open: !closedChainHets[c.id],
        onToggleOpen: () => setClosedChainHets((s) => ({ ...s, [c.id]: !s[c.id] })),
        isVisible: anyGroupVisible,
        onSetVisible: setGroupVis
      }
    )))), colorTarget?.kind === "chain" && (() => {
      const key = colorTarget.key;
      const label = chains.find((c) => c.id === key);
      return /* @__PURE__ */ React.createElement(
        RecolorPanel,
        {
          title: `Recolor chain ${label?.chainLetter || key}`,
          color: chainColors[key],
          fallback: "#AB7ADF",
          onPick: (hex) => setChainColor(key, hex),
          rep: itemReps[key],
          onRep: (r) => setItemRep(key, r),
          defaultRepLabel: repMode
        }
      );
    })()), ionGroups.length > 0 && /* @__PURE__ */ React.createElement(CollapsibleSection, { title: "Ions", count: ionGroups.length, style: { marginTop: 20 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 3 } }, ionGroups.map((g, i) => {
      const ionKey = g.resn + "|" + g.resi + "|" + g.chain;
      const defaultColor = VIEWER_LIGAND_COLORS[i % VIEWER_LIGAND_COLORS.length];
      return /* @__PURE__ */ React.createElement("div", { key: ionKey, style: { display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "var(--text-1)", padding: "3px 0", opacity: isGroupHidden(ionKey) ? 0.45 : 1 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => toggleGroupVis(ionKey), title: isGroupHidden(ionKey) ? "Show" : "Hide", style: { background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", color: isGroupHidden(ionKey) ? "var(--text-2)" : "var(--text-0)" } }, /* @__PURE__ */ React.createElement(Icon, { name: isGroupHidden(ionKey) ? "eyeOff" : "eye", size: 13 })), /* @__PURE__ */ React.createElement("button", { onClick: () => setColorTarget(colorTarget?.kind === "ion" && colorTarget.key === ionKey ? null : { kind: "ion", key: ionKey }), style: {
        width: 14,
        height: 14,
        borderRadius: "50%",
        background: ligandColors[ionKey] || defaultColor,
        border: "1.5px solid var(--line-1)",
        cursor: "pointer",
        flexShrink: 0,
        padding: 0
      } }), /* @__PURE__ */ React.createElement("span", { className: "mono" }, g.resn), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-2)" } }, "chain ", g.chainLetter || g.chain, ", res ", g.resi));
    })), colorTarget?.kind === "ion" && (() => {
      const key = colorTarget.key;
      const idx = ionGroups.findIndex((g) => g.resn + "|" + g.resi + "|" + g.chain === key);
      if (idx < 0) return null;
      const target = ionGroups[idx];
      return /* @__PURE__ */ React.createElement(
        RecolorPanel,
        {
          title: `Recolor ${target.resn} (chain ${target.chainLetter || target.chain}, res ${target.resi})`,
          color: ligandColors[key],
          fallback: VIEWER_LIGAND_COLORS[idx % VIEWER_LIGAND_COLORS.length],
          onPick: (hex) => setLigandColors((st) => ({ ...st, [key]: hex })),
          rep: itemReps[key],
          onRep: (r) => setItemRep(key, r),
          defaultRepLabel: "sphere"
        }
      );
    })()), ligandOnlyGroups.length > 0 && /* @__PURE__ */ React.createElement(CollapsibleSection, { title: "Ligands", count: ligandOnlyGroups.length, style: { marginTop: 20 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 3 } }, ligandOnlyGroups.map((g, i) => {
      const ligandKey = g.resn + "|" + g.resi + "|" + g.chain;
      const defaultColor = VIEWER_LIGAND_COLORS[i % VIEWER_LIGAND_COLORS.length];
      return /* @__PURE__ */ React.createElement("div", { key: ligandKey, style: { display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "var(--text-1)", padding: "3px 0", opacity: isGroupHidden(ligandKey) ? 0.45 : 1 } }, /* @__PURE__ */ React.createElement("button", { onClick: () => toggleGroupVis(ligandKey), title: isGroupHidden(ligandKey) ? "Show" : "Hide", style: { background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", color: isGroupHidden(ligandKey) ? "var(--text-2)" : "var(--text-0)" } }, /* @__PURE__ */ React.createElement(Icon, { name: isGroupHidden(ligandKey) ? "eyeOff" : "eye", size: 13 })), /* @__PURE__ */ React.createElement("button", { onClick: () => setColorTarget(colorTarget?.kind === "ligand" && colorTarget.key === ligandKey ? null : { kind: "ligand", key: ligandKey }), style: {
        width: 14,
        height: 14,
        borderRadius: "50%",
        background: ligandColors[ligandKey] || defaultColor,
        border: "1.5px solid var(--line-1)",
        cursor: "pointer",
        flexShrink: 0,
        padding: 0
      } }), /* @__PURE__ */ React.createElement("span", { className: "mono" }, g.resn), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--text-2)" } }, "chain ", g.chainLetter || g.chain, ", res ", g.resi));
    })), colorTarget?.kind === "ligand" && (() => {
      const key = colorTarget.key;
      const idx = ligandOnlyGroups.findIndex((g) => g.resn + "|" + g.resi + "|" + g.chain === key);
      if (idx < 0) return null;
      const target = ligandOnlyGroups[idx];
      return /* @__PURE__ */ React.createElement(
        RecolorPanel,
        {
          title: `Recolor ${target.resn} (chain ${target.chainLetter || target.chain}, res ${target.resi})`,
          color: ligandColors[key],
          fallback: VIEWER_LIGAND_COLORS[idx % VIEWER_LIGAND_COLORS.length],
          onPick: (hex) => setLigandColors((st) => ({ ...st, [key]: hex })),
          rep: itemReps[key],
          onRep: (r) => setItemRep(key, r),
          defaultRepLabel: "stick"
        }
      );
    })()), !selection && hiddenCount > 0 && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 20, fontSize: 11.5, color: "var(--text-2)" } }, /* @__PURE__ */ React.createElement("span", null, hiddenCount, " residue", hiddenCount === 1 ? "" : "s", " hidden"), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "eye", onClick: () => setHiddenResidues({}) }, "Show all")), selection && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(SectionLabel, { style: { marginTop: 20 } }, "Selected"), /* @__PURE__ */ React.createElement("div", { style: { background: "var(--bg-2)", borderRadius: "var(--radius-md)", padding: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 } }, /* @__PURE__ */ React.createElement("div", { className: "mono", style: { fontSize: 12, fontWeight: 600, color: "var(--text-0)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, selection.resn, " ", selection.resi), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: toggleSelectionHidden,
        title: selectionHidden ? "Show the selected residues" : "Hide the selected residues",
        "aria-label": selectionHidden ? "Show the selected residues" : "Hide the selected residues",
        style: {
          background: "none",
          border: "none",
          padding: 2,
          cursor: "pointer",
          flexShrink: 0,
          color: selectionHidden ? "var(--text-2)" : "var(--text-0)",
          display: "flex"
        }
      },
      /* @__PURE__ */ React.createElement(Icon, { name: selectionHidden ? "eyeOff" : "eye", size: 14 })
    )), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, color: "var(--text-2)", marginBottom: 10 } }, selection.structure ? `${selection.structure} \xB7 ` : "", "chain ", selection.chain, " \xB7 ", selection.atomName, selections.length > 1 && ` \xB7 ${selections.length} residues selected`), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10.5, color: "var(--text-2)", marginBottom: 10 } }, "Shift+click to add or remove residues. Clicking empty space discards the selection."), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 } }, /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "color",
        value: /^#[0-9A-Fa-f]{6}$/.test(selectionColor || "") ? selectionColor : "#FFFFFF",
        onChange: (e) => setSelectionColor(e.target.value),
        title: "Open color wheel",
        style: { width: 34, height: 34, padding: 0, border: "1.5px solid var(--line-1)", borderRadius: "var(--radius-sm)", background: "none", cursor: "pointer", flexShrink: 0 }
      }
    ), selectionColor ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(HexColorInput, { value: selectionColor, onCommit: (hex) => setSelectionColor(hex) }), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", onClick: () => setSelectionColor(null), title: "Yellow, cyan or magenta, whichever stands out from the residue and the background" }, "Auto")) : /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10.5, color: "var(--text-2)", lineHeight: 1.4 } }, "Auto: yellow, cyan or magenta, whichever stands out from both the residue and the background")), /* @__PURE__ */ React.createElement("label", { style: { display: "block", fontSize: 10.5, color: "var(--text-2)", marginBottom: 4 } }, "Representation"), /* @__PURE__ */ React.createElement(
      "select",
      {
        value: selectionRep,
        onChange: (e) => setSelectionRep(e.target.value),
        style: {
          width: "100%",
          marginBottom: 10,
          padding: "6px 8px",
          fontSize: 11.5,
          background: "var(--bg-1)",
          color: "var(--text-0)",
          border: "1px solid var(--line-1)",
          borderRadius: "var(--radius-sm)",
          cursor: "pointer"
        }
      },
      RESIDUE_REPS.map((rep) => /* @__PURE__ */ React.createElement("option", { key: rep.id, value: rep.id }, rep.label))
    ), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6 } }, /* @__PURE__ */ React.createElement(
      Button,
      {
        variant: "secondary",
        size: "sm",
        icon: "check",
        onClick: keepSelections,
        style: {
          flex: 1,
          color: "var(--sage)",
          borderColor: "var(--sage)",
          background: "var(--sage-wash)"
        }
      },
      "Keep colour"
    ), /* @__PURE__ */ React.createElement(
      Button,
      {
        variant: "secondary",
        size: "sm",
        icon: "x",
        onClick: () => {
          setPaintedResidues((prev) => {
            const next = { ...prev };
            for (const sel of selections) delete next[sel.key];
            return next;
          });
          resetSelections();
        },
        style: {
          flex: 1,
          color: "var(--coral)",
          borderColor: "var(--coral)",
          background: "var(--coral-wash)"
        }
      },
      "Cancel"
    )))), /* @__PURE__ */ React.createElement(SectionLabel, { style: { marginTop: 20 } }, "Background"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 2px" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12.5, color: "var(--text-0)" } }, "Background color"), /* @__PURE__ */ React.createElement("button", { onClick: () => setColorTarget(colorTarget?.kind === "background" ? null : { kind: "background", key: "background" }), style: {
      width: 18,
      height: 18,
      borderRadius: 5,
      background: backgroundColor,
      border: "1.5px solid var(--line-1)",
      cursor: "pointer"
    } })), colorTarget?.kind === "background" && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 6, padding: 10, background: "var(--bg-2)", borderRadius: "var(--radius-md)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--text-1)", marginBottom: 10 } }, "Viewer background"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 } }, /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "color",
        value: /^#[0-9A-Fa-f]{6}$/.test(backgroundColor || "") ? backgroundColor : "#0F0A16",
        onChange: (e) => setBackgroundColor(e.target.value),
        title: "Open color wheel",
        style: {
          width: 34,
          height: 34,
          padding: 0,
          border: "1.5px solid var(--line-1)",
          borderRadius: "var(--radius-sm)",
          background: "none",
          cursor: "pointer",
          flexShrink: 0
        }
      }
    ), /* @__PURE__ */ React.createElement(HexColorInput, { value: backgroundColor, onCommit: setBackgroundColor })), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 9.5, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 } }, "Quick select"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } }, ["#FFFFFF", "#D9D9D9", "#B0B0B0", "#808080", "#4A4A4A", "#26222E", "#0F0A16", "#000000"].map((c) => /* @__PURE__ */ React.createElement(Tooltip, { key: c, text: c, align: "left" }, /* @__PURE__ */ React.createElement("button", { onClick: () => setBackgroundColor(c), style: {
      width: 20,
      height: 20,
      borderRadius: 6,
      background: c,
      border: backgroundColor?.toUpperCase() === c ? "2px solid var(--accent-bright)" : "1.5px solid var(--line-1)",
      cursor: "pointer"
    } }))))))));
  }
  function downloadDataUri(dataUri, filename) {
    const a = document.createElement("a");
    a.href = dataUri;
    a.download = filename;
    a.click();
  }
  function hetGroupsByChain(chains, hetGroups) {
    const firstSerial = (item) => item.serials && item.serials.length ? item.serials[0] : Infinity;
    const byChain = {};
    for (const g of hetGroups) {
      if (g.resn === "HOH") continue;
      const candidates = chains.filter((c) => c.chainLetter === g.chainLetter && (!c.structureLabel || !g.structureLabel || c.structureLabel === g.structureLabel));
      if (!candidates.length) continue;
      const start = firstSerial(g);
      const earlier = candidates.filter((c) => firstSerial(c) <= start);
      const owner = earlier.length ? earlier.reduce((best, c) => firstSerial(c) > firstSerial(best) ? c : best) : candidates[0];
      if (!byChain[owner.id]) byChain[owner.id] = { ligands: [], ions: [] };
      byChain[owner.id][g.isIon ? "ions" : "ligands"].push(g);
    }
    return byChain;
  }
  function ChainHetRows({ entry, open, onToggleOpen, isVisible, onSetVisible }) {
    if (!entry) return null;
    const kinds = [["Ligands", entry.ligands, "ligands"], ["Ions", entry.ions, "ions"]].filter(([, list]) => list.length > 0);
    if (!kinds.length) return null;
    const names = (list) => [...new Set(list.map((g) => g.resn))].join(", ");
    return /* @__PURE__ */ React.createElement("div", { style: { marginLeft: 22, marginBottom: 4 } }, /* @__PURE__ */ React.createElement("button", { onClick: onToggleOpen, "aria-expanded": open, style: {
      background: "none",
      border: "none",
      cursor: "pointer",
      padding: "0 0 2px 0",
      display: "flex",
      alignItems: "center",
      gap: 4,
      fontSize: 11.5,
      color: "var(--text-2)"
    } }, /* @__PURE__ */ React.createElement(Icon, { name: open ? "chevronDown" : "chevronRight", size: 12 }), "Bound to this chain"), open && kinds.map(([label, list, flag]) => {
      const shown = isVisible(list);
      return /* @__PURE__ */ React.createElement("div", { key: flag, style: { display: "flex", alignItems: "center", gap: 8, padding: "2px 0 2px 16px" } }, /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: () => onSetVisible(list, !shown, flag),
          title: `${shown ? "Hide" : "Show"} this chain's ${label.toLowerCase()}`,
          style: { background: "none", border: "none", cursor: "pointer", color: shown ? "var(--text-0)" : "var(--text-2)" }
        },
        /* @__PURE__ */ React.createElement(Icon, { name: shown ? "eye" : "eyeOff", size: 13 })
      ), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, color: shown ? "var(--text-0)" : "var(--text-2)" } }, label, " (", list.length, ")"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "var(--text-2)", flex: 1, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, names(list)));
    }));
  }
  function VisRow({ label, checked, onChange }) {
    return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12.5, color: "var(--text-0)" } }, label), /* @__PURE__ */ React.createElement(Toggle, { checked, onChange }));
  }
  function RecolorPanel({ title, color, fallback, onPick, rep, onRep, defaultRepLabel }) {
    const active = color || fallback;
    return /* @__PURE__ */ React.createElement("div", { style: { marginTop: 10, padding: 10, background: "var(--bg-2)", borderRadius: "var(--radius-md)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--text-1)", marginBottom: 10 } }, title), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 } }, /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "color",
        value: /^#[0-9A-Fa-f]{6}$/.test(active) ? active : fallback,
        onChange: (e) => onPick(e.target.value),
        title: "Open color wheel",
        style: {
          width: 34,
          height: 34,
          padding: 0,
          border: "1.5px solid var(--line-1)",
          borderRadius: "var(--radius-sm)",
          background: "none",
          cursor: "pointer",
          flexShrink: 0
        }
      }
    ), /* @__PURE__ */ React.createElement(HexColorInput, { value: active, onCommit: onPick, width: 104 })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, CHAIN_COLOR_GROUPS.map((group) => /* @__PURE__ */ React.createElement("div", { key: group.label }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 9.5, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 } }, group.label), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } }, group.colors.map((c) => /* @__PURE__ */ React.createElement(Tooltip, { key: c, text: c, align: "left" }, /* @__PURE__ */ React.createElement("button", { onClick: () => onPick(c), style: {
      width: 20,
      height: 20,
      borderRadius: 6,
      background: c,
      border: active === c ? "2px solid var(--text-0)" : "1.5px solid var(--line-1)",
      cursor: "pointer"
    } }))))))), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 9.5, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 } }, "Representation"), /* @__PURE__ */ React.createElement(
      "select",
      {
        value: rep || "",
        onChange: (e) => onRep(e.target.value || null),
        style: {
          width: "100%",
          padding: "6px 8px",
          fontSize: 11.5,
          background: "var(--bg-1)",
          color: "var(--text-0)",
          border: "1px solid var(--line-1)",
          borderRadius: "var(--radius-sm)",
          cursor: "pointer"
        }
      },
      /* @__PURE__ */ React.createElement("option", { value: "" }, "Default (", defaultRepLabel, ")"),
      RESIDUE_REPS.map((r) => /* @__PURE__ */ React.createElement("option", { key: r.id, value: r.id }, r.label))
    )));
  }
  function HexColorInput({ value, onCommit, width }) {
    const [draft, setDraft] = useState(value);
    const lastCommitted = useRef(value);
    useEffect(() => {
      if (value !== lastCommitted.current) {
        setDraft(value);
        lastCommitted.current = value;
      }
    }, [value]);
    const normalize = (raw) => {
      let v = raw.trim();
      if (!v.startsWith("#")) v = "#" + v;
      if (/^#[0-9A-Fa-f]{3}$/.test(v)) {
        v = "#" + v.slice(1).split("").map((c) => c + c).join("");
      }
      return /^#[0-9A-Fa-f]{6}$/.test(v) ? v.toUpperCase() : null;
    };
    const commit = () => {
      const normalized = normalize(draft);
      if (normalized) {
        lastCommitted.current = normalized;
        setDraft(normalized);
        onCommit(normalized);
      } else {
        setDraft(value);
      }
    };
    const isValid = normalize(draft) !== null;
    return /* @__PURE__ */ React.createElement(
      TextInput,
      {
        mono: true,
        value: draft,
        onChange: (e) => setDraft(e.target.value),
        onBlur: commit,
        onKeyDown: (e) => {
          if (e.key === "Enter") {
            commit();
            e.target.blur();
          }
        },
        placeholder: "#RRGGBB",
        maxLength: 7,
        style: {
          width: width || void 0,
          flex: width ? "0 0 auto" : 1,
          fontSize: 12,
          borderColor: isValid ? void 0 : "var(--coral)"
        }
      }
    );
  }
  function SettingsPage() {
    const { settings, updateSettings, isElectron, engineInfo } = useApp();
    const toast = useToast();
    const save = () => toast.push({ tone: "success", title: "Settings saved" });
    const [pymolVerified, setPymolVerified] = useState(null);
    const [savedPymolPath, setSavedPymolPath] = useState(null);
    const [pendingPymolPath, setPendingPymolPath] = useState(null);
    const [pathValidating, setPathValidating] = useState(false);
    const [pathValidationError, setPathValidationError] = useState(null);
    useEffect(() => {
      if (!isElectron) return;
      window.astra3Native.getPymolPath().then((p) => {
        updateSettings({ pymolPath: p || "" });
        setSavedPymolPath(p || null);
      }).catch(() => {
      });
    }, [isElectron, engineInfo.available?.pymol]);
    useEffect(() => {
      if (!isElectron || !settings.pymolPath) {
        setPymolVerified(null);
        return;
      }
      let cancelled = false;
      window.astra3Native.verifyPymolPath(settings.pymolPath).then((ok) => {
        if (!cancelled) setPymolVerified(ok);
      }).catch(() => {
        if (!cancelled) setPymolVerified(null);
      });
      return () => {
        cancelled = true;
      };
    }, [isElectron, settings.pymolPath]);
    const requestPymolPathChange = (candidate, fromBrowse = false) => {
      if (!candidate) return;
      if (candidate === savedPymolPath) {
        if (fromBrowse) toast.push({ tone: "neutral", title: "PyMOL location unchanged", message: "Astra3 is already using this PyMOL." });
        return;
      }
      setPathValidationError(null);
      setPendingPymolPath(candidate);
    };
    const confirmPymolPathChange = async () => {
      if (!pendingPymolPath || pathValidating) return;
      setPathValidating(true);
      setPathValidationError(null);
      const check = await checkEnginePath("pymol", pendingPymolPath);
      if (check.error) {
        setPathValidating(false);
        setPathValidationError(check.error);
        return;
      }
      await window.astra3Native.setPymolPath(pendingPymolPath);
      await window.astra3Native.restartApp();
    };
    const cancelPymolPathChange = () => {
      if (savedPymolPath) updateSettings({ pymolPath: savedPymolPath });
      setPendingPymolPath(null);
      setPathValidationError(null);
    };
    const browsePymol = async () => {
      if (!isElectron) {
        toast.push({ tone: "neutral", title: "Native picker", message: "Available in the desktop app." });
        return;
      }
      const picked = await window.astra3Native.openPymolExecutableDialog();
      if (picked) {
        updateSettings({ pymolPath: picked });
        requestPymolPathChange(picked, true);
      }
    };
    const browseOutputDir = async () => {
      if (!isElectron) {
        toast.push({ tone: "neutral", title: "Native picker", message: "Available in the desktop app." });
        return;
      }
      const picked = await window.astra3Native.openFolderDialog();
      if (picked) commitOutputDir(picked);
    };
    const outputDirAtFocus = useRef(null);
    const commitOutputDir = async (candidate) => {
      if (!isElectron) return;
      let result;
      try {
        result = await window.astra3Native.setOutputDir(candidate);
      } catch (e) {
        result = { ok: false, error: e?.message || "The output folder could not be changed." };
      }
      if (result && result.ok) {
        updateSettings({ outputDir: result.dir });
        return;
      }
      const current = await window.astra3Native.getOutputDir().catch(() => null);
      if (current) updateSettings({ outputDir: current });
      toast.push({
        tone: "error",
        title: "Output folder not changed",
        message: `${result && result.error || "That folder can't hold results."}${current ? `

Results are still saved in:
${current}` : ""}`,
        duration: 9e3
      });
    };
    return /* @__PURE__ */ React.createElement(PageScroll, null, /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 640, margin: "0 auto", padding: "28px 32px 60px" } }, /* @__PURE__ */ React.createElement(Card, { style: { padding: 22, marginBottom: 16 } }, /* @__PURE__ */ React.createElement(SectionLabel, null, "Defaults"), /* @__PURE__ */ React.createElement(SettingRow, { label: "Default render quality", desc: "Used for new Single Structure / Overlay / Termini runs" }, /* @__PURE__ */ React.createElement(SegmentedControl, { value: settings.defaultQuality, onChange: (v) => updateSettings({ defaultQuality: v }), options: [{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "excellent", label: "Excellent" }] })), /* @__PURE__ */ React.createElement(SettingRow, { label: "Default fetch format", desc: settings.defaultFormat === "pdb" ? "Legacy PDB is tried first; Astra3 falls back to mmCIF automatically if unavailable" : "mmCIF is tried first; Astra3 falls back to legacy PDB automatically if unavailable" }, /* @__PURE__ */ React.createElement(
      SegmentedControl,
      {
        value: settings.defaultFormat,
        onChange: (v) => updateSettings({ defaultFormat: v }),
        options: settings.defaultFormat === "pdb" ? [{ value: "pdb", label: "Legacy PDB" }, { value: "cif", label: "mmCIF" }] : [{ value: "cif", label: "mmCIF" }, { value: "pdb", label: "Legacy PDB" }]
      }
    )), /* @__PURE__ */ React.createElement(SettingRow, { label: "Default output directory", stacked: true }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6 } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement(TextInput, { mono: true, icon: "folder", value: settings.outputDir, onFocus: (e) => {
      outputDirAtFocus.current = e.target.value;
    }, onChange: (e) => updateSettings({ outputDir: e.target.value }), onBlur: (e) => {
      if (e.target.value !== outputDirAtFocus.current) commitOutputDir(e.target.value);
    }, onKeyDown: (e) => {
      if (e.key === "Enter") e.currentTarget.blur();
    } })), /* @__PURE__ */ React.createElement(Button, { variant: "secondary", onClick: browseOutputDir }, "Browse")))), /* @__PURE__ */ React.createElement(EngineSettings, null, /* @__PURE__ */ React.createElement(SettingRow, { label: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(EngineDot, { engine: "pymol" }), "PyMOL location"), desc: "Changing this restarts Astra3.", stacked: true }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, alignItems: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement(
      TextInput,
      {
        mono: true,
        icon: "cube",
        value: settings.pymolPath,
        placeholder: "Not found",
        onChange: (e) => updateSettings({ pymolPath: e.target.value }),
        onBlur: (e) => {
          if (isElectron) requestPymolPathChange(e.target.value);
        }
      }
    )), /* @__PURE__ */ React.createElement(Button, { variant: "secondary", onClick: browsePymol }, "Browse")), isElectron && pymolVerified === false && /* @__PURE__ */ React.createElement(FieldHint, null, "PyMOL was not found at this path. Install PyMOL from pymol.org if you haven't, or Browse to its actual location."), isElectron && !settings.pymolPath && /* @__PURE__ */ React.createElement(FieldHint, null, "PyMOL was not found on this computer. Install it from pymol.org, or Browse to it."))), /* @__PURE__ */ React.createElement(DrawingWindowSettings, null), pendingPymolPath && /* @__PURE__ */ React.createElement("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400 } }, /* @__PURE__ */ React.createElement("div", { className: "astra-modal-in", style: { width: "min(440px, 90vw)", background: "var(--bg-1)", border: "1px solid var(--line-1)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", padding: 24 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 12 } }, /* @__PURE__ */ React.createElement(Icon, { name: "alertTriangle", size: 18, style: { color: "var(--amber)" } }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 15, fontWeight: 700 } }, "Restart Astra3?")), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 13, color: "var(--text-1)", lineHeight: 1.6, margin: "0 0 20px" } }, "Changing the PyMOL executable location requires Astra3 to restart so the new path takes effect everywhere. Astra3 will close and reopen automatically."), pathValidationError && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 16, color: "var(--coral)", fontSize: 12 } }, /* @__PURE__ */ React.createElement(Icon, { name: "alertTriangle", size: 13, style: { flexShrink: 0 } }), pathValidationError), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "flex-end", gap: 8 } }, /* @__PURE__ */ React.createElement(Button, { variant: "secondary", onClick: cancelPymolPathChange, disabled: pathValidating }, "Cancel"), /* @__PURE__ */ React.createElement(Button, { variant: "primary", onClick: confirmPymolPathChange, disabled: pathValidating }, pathValidating ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Spinner, { size: 14 }), "Checking\u2026") : "Restart now")))), /* @__PURE__ */ React.createElement(Card, { style: { padding: 22, marginBottom: 16 } }, /* @__PURE__ */ React.createElement(SectionLabel, null, "Behavior"), /* @__PURE__ */ React.createElement(SettingRow, { label: "Auto-open report", desc: "Open the HTML report automatically when an analysis finishes" }, /* @__PURE__ */ React.createElement(Toggle, { checked: settings.autoOpenReport, onChange: (v) => updateSettings({ autoOpenReport: v }) })), /* @__PURE__ */ React.createElement(SettingRow, { label: "Auto-open session", desc: "Open the generated session when an analysis finishes" }, /* @__PURE__ */ React.createElement(Toggle, { checked: settings.autoOpenSession, onChange: (v) => updateSettings({ autoOpenSession: v }) })), /* @__PURE__ */ React.createElement(SettingRow, { label: "Confirm before large batch runs", desc: "Ask before running a batch of 10+ structures" }, /* @__PURE__ */ React.createElement(Toggle, { checked: settings.confirmBeforeBatch, onChange: (v) => updateSettings({ confirmBeforeBatch: v }) })), /* @__PURE__ */ React.createElement(SettingRow, { label: "Completion sound", desc: "Play a short sound alongside the glow when an analysis finishes" }, /* @__PURE__ */ React.createElement(Toggle, { checked: settings.completionSound, onChange: (v) => updateSettings({ completionSound: v }) }))), /* @__PURE__ */ React.createElement(Card, { style: { padding: 22 } }, /* @__PURE__ */ React.createElement(SectionLabel, null, "Appearance"), /* @__PURE__ */ React.createElement(SettingRow, { label: "Theme", desc: "Applies immediately across the whole app" }, /* @__PURE__ */ React.createElement(SegmentedControl, { value: settings.theme, onChange: (v) => updateSettings({ theme: v }), options: [{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }] })), /* @__PURE__ */ React.createElement(SettingRow, { label: "Content font", desc: "Body text, card copy, and descriptions. Tabs and inputs keep their own fixed typeface and are unaffected." }, /* @__PURE__ */ React.createElement(
      "select",
      {
        value: settings.contentFont,
        onChange: (e) => updateSettings({ contentFont: e.target.value }),
        style: {
          width: "100%",
          maxWidth: 280,
          background: "var(--bg-0)",
          border: "1px solid var(--line-1)",
          borderRadius: "var(--radius-md)",
          color: "var(--text-0)",
          padding: "9px 10px",
          fontSize: 13,
          fontFamily: "var(--font-ui)",
          outline: "none",
          cursor: "pointer"
        }
      },
      CONTENT_FONT_GROUPS.map((group) => /* @__PURE__ */ React.createElement("optgroup", { key: group.label, label: group.label }, group.options.map((opt) => /* @__PURE__ */ React.createElement("option", { key: opt.label, value: opt.label }, opt.label))))
    ))), /* @__PURE__ */ React.createElement(Button, { variant: "primary", size: "lg", onClick: save, style: { marginTop: 20 } }, "Save Settings")));
  }
  function EngineSettings({ children }) {
    const { isElectron, engineInfo, switchEngine, refreshEngineStatus, rememberEngineVersion, isBusy } = useApp();
    const toast = useToast();
    const [cxPath, setCxPath] = useState("");
    const [cxSaved, setCxSaved] = useState(null);
    const [cxState, setCxState] = useState(null);
    const [switching, setSwitching] = useState(false);
    useEffect(() => {
      if (!isElectron || !window.astra3Native.getChimeraxPath) return;
      window.astra3Native.getChimeraxPath().then((p) => {
        setCxPath(p || "");
        setCxSaved(p || null);
        if (!p) return;
        window.astra3Native.chimeraxVersion(p).then((v) => {
          if (v) {
            setCxState({ version: v });
            rememberEngineVersion("chimerax", v);
          }
        }).catch(() => {
        });
      }).catch(() => {
      });
    }, [isElectron, engineInfo.available?.chimerax]);
    const applyChimeraxPath = async (candidate) => {
      const value = String(candidate || "").trim();
      if (!value || value === cxSaved) return;
      setCxPath(value);
      setCxState("checking");
      const check = await checkEnginePath("chimerax", value);
      if (check.error) {
        setCxState({ error: check.error });
        toast.push({ tone: "error", title: "Not ChimeraX", message: check.error });
        return;
      }
      const saved = await window.astra3Native.setChimeraxPath(value);
      setCxPath(saved);
      setCxSaved(saved);
      setCxState({ version: check.version });
      rememberEngineVersion("chimerax", check.version);
      await refreshEngineStatus();
      toast.push({ tone: "success", title: "ChimeraX location saved", message: `ChimeraX v${check.version}` });
    };
    const browse = async () => {
      if (!isElectron) {
        toast.push({ tone: "neutral", title: "Native picker", message: "Available in the desktop app." });
        return;
      }
      const picked = await window.astra3Native.openChimeraxExecutableDialog();
      if (picked) applyChimeraxPath(picked);
    };
    const choose = async (value) => {
      if (value === engineInfo.engine && !engineInfo.none) return;
      if (!engineInfo.available?.[value]) {
        toast.push({ tone: "error", title: `${ENGINE_NAMES[value]} not set up`, message: `Enter the ${ENGINE_NAMES[value]} location below first.` });
        return;
      }
      setSwitching(true);
      try {
        await switchEngine(value);
      } catch (e) {
        toast.push({ tone: "error", title: "Engine not switched", message: e.message });
      } finally {
        setSwitching(false);
      }
    };
    const cxHint = cxState === "checking" ? "Checking\u2026" : cxState?.error ? cxState.error : cxState?.version ? `ChimeraX v${cxState.version} found.` : cxPath ? null : "ChimeraX was not found on this computer. Install it from cgl.ucsf.edu/chimerax, or Browse to it.";
    return /* @__PURE__ */ React.createElement(Card, { style: { padding: 22, marginBottom: 16 } }, /* @__PURE__ */ React.createElement(SectionLabel, null, "Analysis engine"), /* @__PURE__ */ React.createElement(SettingRow, { label: "Engine", desc: "Used for analysis and images. A switch applies from the next analysis.", stacked: true }, /* @__PURE__ */ React.createElement(
      SegmentedControl,
      {
        value: engineInfo.none ? null : engineInfo.engine,
        onChange: choose,
        disabled: isBusy || switching,
        options: [{ value: "pymol", label: "PyMOL" }, { value: "chimerax", label: "ChimeraX" }, { value: "astra3", label: "Astra3 Engine" }]
      }
    ), isBusy && /* @__PURE__ */ React.createElement(FieldHint, null, "Finish or cancel the current run to switch."), engineInfo.engine === "chimerax" && !engineInfo.none && /* @__PURE__ */ React.createElement(FieldHint, null, "Measurements agree with the other engines to within rounding. ChimeraX saves sessions as .cxs."), engineInfo.engine === "astra3" && !engineInfo.none && /* @__PURE__ */ React.createElement(FieldHint, null, "Measurements agree with the other engines to within rounding. The Astra3 Engine saves each session for PyMOL (.pse) and for ChimeraX (.cxc).")), children, /* @__PURE__ */ React.createElement(SettingRow, { label: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(EngineDot, { engine: "chimerax" }), "ChimeraX location"), desc: "Used when ChimeraX is the engine.", stacked: true }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, alignItems: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement(
      TextInput,
      {
        mono: true,
        icon: "cube",
        value: cxPath,
        placeholder: "Not found",
        onChange: (e) => setCxPath(e.target.value),
        onBlur: (e) => {
          if (isElectron) applyChimeraxPath(e.target.value);
        }
      }
    )), /* @__PURE__ */ React.createElement(Button, { variant: "secondary", onClick: browse }, "Browse")), cxHint && /* @__PURE__ */ React.createElement(FieldHint, null, cxHint)));
  }
  function DrawingWindowSettings() {
    const { isElectron } = useApp();
    const [engineWindowShown, setEngineWindowShown] = useState(false);
    useEffect(() => {
      if (isElectron && window.astra3Native.getEngineWindow) {
        window.astra3Native.getEngineWindow().then((v) => setEngineWindowShown(!!v)).catch(() => {
        });
      }
    }, [isElectron]);
    if (!isElectron || !window.astra3Native.getEngineWindow) return null;
    return /* @__PURE__ */ React.createElement(Card, { style: { padding: 22, marginBottom: 16 } }, /* @__PURE__ */ React.createElement(SectionLabel, null, "Drawing window"), /* @__PURE__ */ React.createElement(SettingRow, { label: "Images", desc: "For every engine; the images are the same either way. The window lists each image as it is made; choosing one turns its 3D view to that image's camera.", stacked: true }, /* @__PURE__ */ React.createElement(
      SegmentedControl,
      {
        value: engineWindowShown ? "window" : "background",
        onChange: (v) => {
          const shown = v === "window";
          setEngineWindowShown(shown);
          window.astra3Native.setEngineWindow(shown).catch(() => {
          });
        },
        options: [{ value: "background", label: "In the background" }, { value: "window", label: "In a window" }]
      }
    )));
  }
  function SettingRow({ label, desc, children, stacked }) {
    return /* @__PURE__ */ React.createElement("div", { style: { display: stacked ? "block" : "flex", alignItems: "center", justifyContent: "space-between", gap: 20, padding: "13px 0", borderTop: "1px solid var(--line-0)" } }, /* @__PURE__ */ React.createElement("div", { style: { marginBottom: stacked ? 8 : 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: 500 } }, label), desc && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--text-1)", marginTop: 2 } }, desc)), children);
  }
  var PALETTE_HEX = {
    grey90: "#E8E8E8",
    grey80: "#CECECE",
    grey70: "#B4B4B4",
    grey60: "#9B9B9B",
    grey50: "#818181",
    grey40: "#676767",
    grey30: "#4D4D4D",
    wheat: "#FCD1A6",
    sand: "#B88C4D",
    brown: "#A6522B",
    chocolate: "#8E391C",
    dirtyviolet: "#B28080",
    skyblue: "#3380CC",
    slate: "#8080FF",
    deepblue: "#4040A6",
    deepteal: "#1A9999",
    forest: "#339933",
    violetpurple: "#8C4099",
    raspberry: "#B24D66",
    firebrick: "#B22121",
    yellow: "#FFFF00",
    hotpink: "#FF0080",
    marine: "#0080FF",
    orange: "#FF8000",
    purple: "#BF00BF",
    cyan: "#00FFFF",
    magenta: "#FF00FF",
    deepsalmon: "#FF8080",
    brightorange: "#FFB233",
    lightmagenta: "#FF33CC",
    tv_blue: "#4D4DFF",
    gold: "#FFD123",
    black: "#000000",
    lightpink: "#FFBFDE",
    paleyellow: "#FFFF80",
    palecyan: "#CCFFFF",
    lightblue: "#BFBFFF",
    bluewhite: "#D9D9FF",
    aquamarine: "#80FFFF",
    lightorange: "#FFCC80",
    palegreen: "#A6E5A6",
    pink: "#FFA6D9",
    salmon: "#FF9999",
    lightteal: "#66B2B2",
    green: "#00FF00",
    red: "#FF0000",
    tv_green: "#33FF33",
    tv_red: "#FF3333",
    blue: "#0000FF",
    white: "#FFFFFF"
  };
  var DEFAULT_PALETTE = {
    chains: ["grey80", "grey60", "grey40", "brown", "wheat", "dirtyviolet", "sand", "grey90"],
    ligands: ["yellow", "hotpink", "marine", "orange", "purple", "cyan", "magenta", "deepsalmon", "black"],
    ions: ["lightpink", "paleyellow", "palecyan", "lightblue", "bluewhite", "aquamarine", "lightorange", "wheat"],
    termini: { enabled: true, n: "green", c: "red" },
    arrows: {
      reference: ["#FF8000", "#FF66B3"],
      comparisons: [["#00FFFF", "#FFFF00"], ["#3399FF", "#99FF33"], ["#FF66FF", "#FFBF33"], ["#66FFB3", "#CC80FF"], ["#FF8C66", "#80E6FF"]]
    }
  };
  var ARROW_NAMES = {
    "#FF8000": "orange",
    "#FF66B3": "pink",
    "#00FFFF": "cyan",
    "#FFFF00": "bright yellow",
    "#3399FF": "azure",
    "#99FF33": "lime",
    "#FF66FF": "magenta",
    "#FFBF33": "amber",
    "#66FFB3": "mint",
    "#CC80FF": "lilac",
    "#FF8C66": "coral",
    "#80E6FF": "ice"
  };
  var PALETTE_PRESETS = {
    chains: [
      { label: "Neutral", colors: ["grey90", "grey80", "grey70", "grey60", "grey50", "grey40", "grey30", "wheat", "sand", "brown", "chocolate", "dirtyviolet"] },
      { label: "Strong", colors: ["skyblue", "slate", "deepblue", "deepteal", "forest", "violetpurple", "raspberry", "firebrick"] }
    ],
    ligands: [
      { label: "Vivid", colors: ["yellow", "hotpink", "marine", "orange", "purple", "cyan", "magenta", "deepsalmon", "brightorange", "lightmagenta", "tv_blue", "gold", "black"] }
    ],
    ions: [
      { label: "Pastel", colors: ["lightpink", "paleyellow", "palecyan", "lightblue", "bluewhite", "aquamarine", "lightorange", "wheat", "palegreen", "pink", "salmon", "lightteal"] }
    ],
    termini: [
      { label: "Strong", colors: ["green", "red", "tv_green", "tv_red", "blue", "marine", "orange", "yellow", "magenta", "cyan", "purple", "white"] }
    ],
    arrows: [
      { label: "Bright", colors: Object.keys(ARROW_NAMES) }
    ]
  };
  var PALETTE_MAX_COLORS = 24;
  var paletteHex = (color) => PALETTE_HEX[color] || color;
  var paletteName = (color) => ARROW_NAMES[color] || color;
  var samePalette = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function PaletteChip({ color, selected, onClick, label, size = 34 }) {
    return /* @__PURE__ */ React.createElement(Tooltip, { text: paletteName(color) }, /* @__PURE__ */ React.createElement("button", { onClick, style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0, cursor: "pointer" } }, /* @__PURE__ */ React.createElement("span", { style: {
      width: size,
      height: size,
      borderRadius: size > 30 ? 9 : 7,
      background: paletteHex(color),
      border: "1.5px solid var(--line-1)",
      transition: "box-shadow 120ms ease",
      boxShadow: selected ? "0 0 0 2px var(--bg-1), 0 0 0 4px var(--accent)" : "none"
    } }), label && /* @__PURE__ */ React.createElement("span", { className: "mono", style: { fontSize: 10, color: selected ? "var(--accent-bright)" : "var(--text-2)" } }, label)));
  }
  function PaletteEditor({ color, presets, onPick, onMove, onRemove, canMoveLeft, canMoveRight, canRemove, removeLabel = "Remove" }) {
    const hex = paletteHex(color);
    const moveButton = (dir, enabled) => /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => onMove(dir),
        disabled: !enabled,
        className: "astra-iconbtn",
        title: dir < 0 ? "Move earlier" : "Move later",
        style: { display: "flex", padding: 5, background: "none", border: "1px solid var(--line-1)", borderRadius: "var(--radius-sm)", color: "var(--text-1)", cursor: enabled ? "pointer" : "not-allowed", opacity: enabled ? 1 : 0.4 }
      },
      /* @__PURE__ */ React.createElement(Icon, { name: "chevronRight", size: 14, style: dir < 0 ? { transform: "rotate(180deg)" } : void 0 })
    );
    return /* @__PURE__ */ React.createElement("div", { className: "astra-modal-in", style: { marginTop: 14, padding: 14, background: "var(--bg-2)", borderRadius: "var(--radius-md)" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 } }, /* @__PURE__ */ React.createElement(Tooltip, { text: "Open color wheel", align: "left" }, /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "color",
        value: hex.toLowerCase(),
        onChange: (e) => onPick(e.target.value.toUpperCase()),
        style: { width: 34, height: 34, padding: 0, border: "1.5px solid var(--line-1)", borderRadius: "var(--radius-sm)", background: "none", cursor: "pointer", flexShrink: 0 }
      }
    )), /* @__PURE__ */ React.createElement(HexColorInput, { value: hex, onCommit: onPick, width: 104 }), (PALETTE_HEX[color] || ARROW_NAMES[color]) && /* @__PURE__ */ React.createElement("span", { className: "mono", style: { fontSize: 11, color: "var(--text-2)" } }, paletteName(color)), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }), onMove && moveButton(-1, canMoveLeft), onMove && moveButton(1, canMoveRight), onRemove && /* @__PURE__ */ React.createElement(Button, { variant: "danger", size: "sm", icon: "trash", onClick: onRemove, disabled: !canRemove }, removeLabel)), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, presets.map((group) => /* @__PURE__ */ React.createElement("div", { key: group.label }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 9.5, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 } }, group.label), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } }, group.colors.map((c) => /* @__PURE__ */ React.createElement(Tooltip, { key: c, text: paletteName(c), align: "left" }, /* @__PURE__ */ React.createElement("button", { onClick: () => onPick(c), style: {
      width: 22,
      height: 22,
      borderRadius: 6,
      background: paletteHex(c),
      cursor: "pointer",
      border: color === c ? "2px solid var(--text-0)" : "1.5px solid var(--line-1)"
    } }))))))));
  }
  function PaletteSection({ title, desc, colors, presets, selected, setSelected, onChange, isDefault, onReset, children }) {
    const pick = (index, color) => onChange(colors.map((c, i) => i === index ? color : c));
    const move = (index, dir) => {
      const next = [...colors];
      [next[index], next[index + dir]] = [next[index + dir], next[index]];
      onChange(next);
      setSelected(index + dir);
    };
    const remove = (index) => {
      onChange(colors.filter((_, i) => i !== index));
      setSelected(null);
    };
    const add = () => {
      const suggested = presets.flatMap((g) => g.colors).find((c) => !colors.includes(c)) || colors[colors.length - 1];
      onChange([...colors, suggested]);
      setSelected(colors.length);
    };
    return /* @__PURE__ */ React.createElement(Card, { style: { padding: 22, marginBottom: 16 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 } }, /* @__PURE__ */ React.createElement(SectionLabel, { style: { marginBottom: 4 } }, title), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", onClick: onReset, disabled: isDefault }, "Reset")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--text-1)", marginBottom: 14 } }, desc), children || /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" } }, colors.map((c, i) => /* @__PURE__ */ React.createElement(
      PaletteChip,
      {
        key: i,
        color: c,
        label: String(i + 1),
        selected: selected === i,
        onClick: () => setSelected(selected === i ? null : i)
      }
    )), colors.length < PALETTE_MAX_COLORS && /* @__PURE__ */ React.createElement(Tooltip, { text: "Add a color" }, /* @__PURE__ */ React.createElement("button", { onClick: add, className: "astra-iconbtn", style: {
      width: 34,
      height: 34,
      borderRadius: 9,
      border: "1.5px dashed var(--line-1)",
      background: "none",
      color: "var(--text-1)",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    } }, /* @__PURE__ */ React.createElement(Icon, { name: "plus", size: 15 })))), !children && selected !== null && selected < colors.length && /* @__PURE__ */ React.createElement(
      PaletteEditor,
      {
        color: colors[selected],
        presets,
        onPick: (c) => pick(selected, c),
        onMove: (dir) => move(selected, dir),
        canMoveLeft: selected > 0,
        canMoveRight: selected < colors.length - 1,
        onRemove: () => remove(selected),
        canRemove: colors.length > 1
      }
    ));
  }
  function ArrowPaletteSection({ arrows, selectedKey, select, onChange, isDefault, onReset }) {
    const pairs = [["Reference", arrows.reference], ...arrows.comparisons.map((pair, i) => [`Comparison ${i + 1}`, pair])];
    const keyOf = (pairIndex2, end2) => `${pairIndex2}:${end2}`;
    const [pairIndex, end] = selectedKey ? selectedKey.split(":").map(Number) : [null, null];
    const setColor = (pi, endIndex, color) => {
      const swap = (pair) => pair.map((c, i) => i === endIndex ? color : c);
      onChange(pi === 0 ? { ...arrows, reference: swap(arrows.reference) } : { ...arrows, comparisons: arrows.comparisons.map((pair, j) => j === pi - 1 ? swap(pair) : pair) });
    };
    const addPair = () => {
      const defaults = DEFAULT_PALETTE.arrows.comparisons;
      onChange({ ...arrows, comparisons: [...arrows.comparisons, defaults[arrows.comparisons.length % defaults.length]] });
    };
    const removePair = (pi) => {
      onChange({ ...arrows, comparisons: arrows.comparisons.filter((_, j) => j !== pi - 1) });
      select(null);
    };
    return /* @__PURE__ */ React.createElement(Card, { style: { padding: "18px 22px", marginBottom: 16 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 } }, /* @__PURE__ */ React.createElement(SectionLabel, { style: { marginBottom: 4 } }, "Termini arrows"), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", onClick: onReset, disabled: isDefault }, "Reset")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11.5, color: "var(--text-1)", marginBottom: 14 } }, "TERMINI close-ups. The reference keeps its pair in every close-up; comparisons take the numbered pairs in order."), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-end" } }, pairs.map(([label, pair], pi) => /* @__PURE__ */ React.createElement("div", { key: pi, style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9.5, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em" } }, label), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6 } }, pair.map((c, endIndex) => /* @__PURE__ */ React.createElement(
      PaletteChip,
      {
        key: endIndex,
        size: 26,
        color: c,
        label: endIndex === 0 ? "N" : "C",
        selected: selectedKey === keyOf(pi, endIndex),
        onClick: () => select(selectedKey === keyOf(pi, endIndex) ? null : keyOf(pi, endIndex))
      }
    ))))), arrows.comparisons.length < 12 && /* @__PURE__ */ React.createElement(Tooltip, { text: "Add a comparison pair" }, /* @__PURE__ */ React.createElement("button", { onClick: addPair, className: "astra-iconbtn", style: {
      width: 26,
      height: 26,
      marginBottom: 19,
      borderRadius: 7,
      border: "1.5px dashed var(--line-1)",
      background: "none",
      color: "var(--text-1)",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    } }, /* @__PURE__ */ React.createElement(Icon, { name: "plus", size: 13 })))), selectedKey && pairIndex < pairs.length && /* @__PURE__ */ React.createElement(
      PaletteEditor,
      {
        color: pairs[pairIndex][1][end],
        presets: PALETTE_PRESETS.arrows,
        onPick: (c) => setColor(pairIndex, end, c),
        onRemove: pairIndex > 0 ? () => removePair(pairIndex) : void 0,
        canRemove: arrows.comparisons.length > 1,
        removeLabel: "Remove pair"
      }
    ));
  }
  function PalettePage() {
    const toast = useToast();
    const [palette, setPalette] = useState(null);
    const [selected, setSelected] = useState({ group: null, index: null });
    const [savedFlash, setSavedFlash] = useState(false);
    const saveTimer = useRef(null);
    const flashTimer = useRef(null);
    useEffect(() => {
      let cancelled = false;
      (async () => {
        const saved = window.astra3Native?.getPalette ? await window.astra3Native.getPalette().catch(() => null) : null;
        if (!cancelled) setPalette(saved ? { ...saved, arrows: saved.arrows || DEFAULT_PALETTE.arrows } : DEFAULT_PALETTE);
      })();
      return () => {
        cancelled = true;
      };
    }, []);
    useEffect(() => () => {
      clearTimeout(saveTimer.current);
      clearTimeout(flashTimer.current);
    }, []);
    const update = (next) => {
      setPalette(next);
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        if (!window.astra3Native?.setPalette) return;
        try {
          await window.astra3Native.setPalette(samePalette(next, DEFAULT_PALETTE) ? null : next);
          setSavedFlash(true);
          clearTimeout(flashTimer.current);
          flashTimer.current = setTimeout(() => setSavedFlash(false), 1600);
        } catch (e) {
          toast.push({ tone: "error", title: "Palette not saved", message: String(e?.message || e) });
        }
      }, 300);
    };
    if (!palette) return /* @__PURE__ */ React.createElement(PageScroll, null);
    const selectFor = (group) => ({
      selected: selected.group === group ? selected.index : null,
      setSelected: (index) => setSelected({ group: index === null ? null : group, index })
    });
    const listSection = (group, title, desc) => /* @__PURE__ */ React.createElement(
      PaletteSection,
      {
        title,
        desc,
        colors: palette[group],
        presets: PALETTE_PRESETS[group],
        ...selectFor(group),
        onChange: (colors) => update({ ...palette, [group]: colors }),
        isDefault: samePalette(palette[group], DEFAULT_PALETTE[group]),
        onReset: () => {
          update({ ...palette, [group]: DEFAULT_PALETTE[group] });
          setSelected({ group: null, index: null });
        }
      }
    );
    const termini = palette.termini;
    const terminusKey = selected.group === "termini" ? selected.index : null;
    const setTermini = (patch) => update({ ...palette, termini: { ...termini, ...patch } });
    return /* @__PURE__ */ React.createElement(PageScroll, null, /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 680, margin: "0 auto", padding: "28px 32px 60px" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12, marginBottom: 18 } }, /* @__PURE__ */ React.createElement("span", { style: { flex: 1, fontSize: 12, color: "var(--text-1)" } }, "Colors are used in order and repeat. Click a color to change it. Changes apply from the next run, in PyMOL and ChimeraX."), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11.5, color: "var(--sage)", opacity: savedFlash ? 1 : 0, transition: "opacity 200ms ease", display: "flex", alignItems: "center", gap: 4 } }, /* @__PURE__ */ React.createElement(Icon, { name: "check", size: 13 }), "Saved"), /* @__PURE__ */ React.createElement(
      Button,
      {
        variant: "secondary",
        size: "sm",
        icon: "refresh",
        disabled: samePalette(palette, DEFAULT_PALETTE),
        onClick: () => {
          update(DEFAULT_PALETTE);
          setSelected({ group: null, index: null });
        }
      },
      "Restore defaults"
    )), listSection("chains", "Protein chains", "Single-structure and BATCH runs. OVERLAY and TERMINI color by structure."), listSection("ligands", "Ligands", "One color per ligand type."), listSection("ions", "Ions", "One color per ion type."), /* @__PURE__ */ React.createElement(
      PaletteSection,
      {
        title: "Termini",
        desc: "The N- and C-terminal residues of every protein chain.",
        colors: [termini.n, termini.c],
        presets: PALETTE_PRESETS.termini,
        selected: terminusKey,
        setSelected: () => {
        },
        onChange: () => {
        },
        isDefault: samePalette(termini, DEFAULT_PALETTE.termini),
        onReset: () => {
          update({ ...palette, termini: DEFAULT_PALETTE.termini });
          setSelected({ group: null, index: null });
        }
      },
      /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 18, opacity: termini.enabled ? 1 : 0.4, pointerEvents: termini.enabled ? "auto" : "none" } }, [["n", "N-terminus"], ["c", "C-terminus"]].map(([key, label]) => /* @__PURE__ */ React.createElement(
        PaletteChip,
        {
          key,
          color: termini[key],
          label,
          selected: terminusKey === key,
          onClick: () => setSelected(terminusKey === key ? { group: null, index: null } : { group: "termini", index: key })
        }
      ))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12.5 } }, "Color termini"), /* @__PURE__ */ React.createElement(Toggle, { checked: termini.enabled, onChange: (v) => {
        setTermini({ enabled: v });
        if (!v) setSelected({ group: null, index: null });
      } }))),
      termini.enabled && terminusKey && /* @__PURE__ */ React.createElement(
        PaletteEditor,
        {
          color: termini[terminusKey],
          presets: PALETTE_PRESETS.termini,
          onPick: (c) => setTermini({ [terminusKey]: c })
        }
      )
    ), /* @__PURE__ */ React.createElement(
      ArrowPaletteSection,
      {
        arrows: palette.arrows,
        selectedKey: selected.group === "arrows" ? selected.index : null,
        select: (key) => setSelected(key === null ? { group: null, index: null } : { group: "arrows", index: key }),
        onChange: (arrows) => update({ ...palette, arrows }),
        isDefault: samePalette(palette.arrows, DEFAULT_PALETTE.arrows),
        onReset: () => {
          update({ ...palette, arrows: DEFAULT_PALETTE.arrows });
          setSelected({ group: null, index: null });
        }
      }
    )));
  }
  function ConsolePage() {
    const { consoleLog, runAstraCommand, isBusy, prompt, answerPrompt, addHistoryEntry, setCompletionPulse, cancelRequestedRef } = useApp();
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const [history, setHistory] = useState([]);
    const [histIdx, setHistIdx] = useState(-1);
    const lockedByOther = isBusy && !busy && !prompt;
    const inputRef = useRef(null);
    useEffect(() => {
      const native = window.astra3Native;
      if (!native || !native.pymolStart || !native.pymolIsRunning) return;
      native.pymolIsRunning().then((running) => running ? null : native.pymolStart()).catch(() => {
      });
    }, []);
    const submit = async () => {
      if (!input.trim()) return;
      const text = input.trim();
      if (prompt) {
        setHistory((h) => [text, ...h]);
        setHistIdx(-1);
        setInput("");
        answerPrompt(text);
        return;
      }
      if (isBusy) return;
      const cmd = text;
      setHistory((h) => [cmd, ...h]);
      setHistIdx(-1);
      setInput("");
      setBusy(true);
      try {
        const consoleStartedAt = Date.now();
        const result = await runAstraCommand(cmd, { originPage: "console" });
        if (result?.cancelled || cancelRequestedRef.current) {
          await discardRunOutput(result?.lines, null, null, consoleStartedAt);
        } else if (result?.sessionPath || result?.reportPath) {
          const id = cmd.split(/\s+/).find((t) => t && !t.startsWith("-"));
          setCompletionPulse(Math.random());
          addHistoryEntry({
            kind: "single",
            label: (id || cmd).toUpperCase(),
            status: "complete",
            meta: "via Advanced Console",
            sessionPath: result.sessionPath || null,
            reportPath: result.reportPath || null
          });
        }
      } catch (e) {
      } finally {
        setBusy(false);
        inputRef.current?.focus();
      }
    };
    const [findOpen, setFindOpen] = useState(false);
    const [findQuery, setFindQuery] = useState("");
    const [findStatus, setFindStatus] = useState(null);
    const consoleBodyRef = useRef(null);
    useFindShortcut(() => setFindOpen(true));
    const closeFind = () => {
      setFindOpen(false);
      setFindQuery("");
      setFindStatus(null);
      inputRef.current?.focus();
    };
    const onKeyDown = (e) => {
      if (e.key === "Enter") submit();
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const ni = Math.min(histIdx + 1, history.length - 1);
        setHistIdx(ni);
        if (history[ni]) setInput(history[ni]);
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const ni = Math.max(histIdx - 1, -1);
        setHistIdx(ni);
        setInput(ni === -1 ? "" : history[ni]);
      }
    };
    return /* @__PURE__ */ React.createElement(PageScroll, { style: { padding: "24px 32px 40px", maxWidth: 900, margin: "0 auto" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12, marginBottom: 14 } }, /* @__PURE__ */ React.createElement(Badge, { tone: "violet", style: { padding: "5px 12px", whiteSpace: "nowrap", flexShrink: 0 } }, "Power users"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, color: "var(--text-1)" } }, "Existing Astra3 command syntax works exactly as it does today. GUI actions also appear here, and vice versa.")), /* @__PURE__ */ React.createElement("div", { style: { position: "relative" } }, /* @__PURE__ */ React.createElement(
      LiveConsole,
      {
        lines: consoleLog,
        height: 480,
        title: "astra3.py: interactive session",
        showCursor: !isBusy || !!prompt,
        maxLines: Infinity,
        droppedBefore: consoleLog[0]?.n || 0,
        bodyRef: consoleBodyRef,
        followOutput: !findOpen
      }
    ), findOpen && /* @__PURE__ */ React.createElement(
      ReadmeFindBar,
      {
        query: findQuery,
        setQuery: setFindQuery,
        status: findStatus,
        setStatus: setFindStatus,
        contentRef: consoleBodyRef,
        placeholder: "Find in console\u2026",
        arrows: false,
        autoFocus: true,
        contentVersion: consoleLog[consoleLog.length - 1]?.n ?? consoleLog.length,
        onClose: closeFind,
        style: {
          position: "absolute",
          top: 44,
          right: 14,
          zIndex: 5,
          marginBottom: 0,
          padding: 6,
          background: "var(--bg-2)",
          border: "1px solid var(--line-1)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-lg)"
        }
      }
    )), lockedByOther && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 12, color: "var(--amber)" } }, /* @__PURE__ */ React.createElement(Spinner, { size: 12 }), "A GUI action is currently running. The console will unlock automatically when it finishes."), prompt && !busy && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 12, color: "var(--amber)" } }, /* @__PURE__ */ React.createElement(Icon, { name: "alertTriangle", size: 13 }), "A run started elsewhere is waiting for an answer. Type it below and press Enter."), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement(
      TextInput,
      {
        ref: inputRef,
        mono: true,
        placeholder: prompt ? "Type your answer (y, n, or a value)\u2026" : lockedByOther ? "Astra3 is busy\u2026" : "Enter a PDB ID, OVERLAY, TERMINI, BATCH, -help...",
        value: input,
        onChange: (e) => setInput(e.target.value),
        onKeyDown,
        disabled: lockedByOther
      }
    )), /* @__PURE__ */ React.createElement(Button, { variant: "primary", onClick: submit, disabled: lockedByOther || !input.trim() }, busy ? /* @__PURE__ */ React.createElement(Spinner, { size: 13 }) : prompt ? "Answer" : "Run")));
  }
  var _sharedAudioCtx = null;
  function getAudioContext() {
    if (typeof window === "undefined") return null;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    if (!_sharedAudioCtx) {
      try {
        _sharedAudioCtx = new Ctor();
      } catch {
        return null;
      }
    }
    return _sharedAudioCtx;
  }
  if (typeof window !== "undefined") {
    const unlock = () => {
      const ctx = getAudioContext();
      if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {
      });
    };
    window.addEventListener("pointerdown", unlock, { passive: true, capture: true });
    window.addEventListener("keydown", unlock, { passive: true, capture: true });
  }
  function playCompletionChime() {
    const ctx = getAudioContext();
    if (!ctx) return;
    const play = () => {
      try {
        const now = ctx.currentTime + 0.04;
        [{ freq: 1046.5, start: 0 }, { freq: 1318.5, start: 0.09 }].forEach(({ freq, start }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0, now + start);
          gain.gain.linearRampToValueAtTime(0.18, now + start + 0.015);
          gain.gain.exponentialRampToValueAtTime(1e-4, now + start + 0.35);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + start);
          osc.stop(now + start + 0.4);
        });
      } catch {
      }
    };
    if (ctx.state === "suspended") ctx.resume().then(play).catch(() => {
    });
    else play();
  }
  function CompletionPulse() {
    const { completionPulse, settings } = useApp();
    const [active, setActive] = useState(false);
    const firstRenderRef = useRef(true);
    useEffect(() => {
      if (firstRenderRef.current) {
        firstRenderRef.current = false;
        return;
      }
      if (!completionPulse) return;
      setActive(true);
      const t = setTimeout(() => setActive(false), 2e3);
      if (settings.completionSound !== false) playCompletionChime();
      return () => clearTimeout(t);
    }, [completionPulse]);
    if (!active) return null;
    return /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "astra-completion-pulse",
        style: { position: "fixed", inset: 0, pointerEvents: "none", zIndex: 500 }
      }
    );
  }
  var SETUP_STAR_COLORS = ["#FFD54A", "#FFF3C4", "#FFC93C", "#FDE9A0", "#FFE066", "#FFF6D8"];
  var SETUP_STARS = [
    { top: "16%", left: "20%", size: 4, duration: 3.2, delay: 0 },
    { top: "26%", left: "80%", size: 3, duration: 2.6, delay: 0.6 },
    { top: "68%", left: "13%", size: 3.5, duration: 3.8, delay: 1.1 },
    { top: "78%", left: "84%", size: 4, duration: 2.9, delay: 0.3 },
    { top: "10%", left: "50%", size: 3, duration: 3.4, delay: 1.6 },
    { top: "88%", left: "48%", size: 3.5, duration: 2.7, delay: 0.9 },
    { top: "42%", left: "8%", size: 3, duration: 3.1, delay: 1.9 },
    { top: "40%", left: "92%", size: 4.5, duration: 2.4, delay: 0.4 },
    { top: "6%", left: "30%", size: 3, duration: 3.6, delay: 1.3 },
    { top: "6%", left: "70%", size: 3.5, duration: 2.9, delay: 0.7 },
    { top: "94%", left: "24%", size: 3, duration: 3.3, delay: 1.7 },
    { top: "94%", left: "72%", size: 4, duration: 2.5, delay: 1 }
  ];
  function SetupStarField() {
    const fadeInDuration = 1.1;
    return /* @__PURE__ */ React.createElement(React.Fragment, null, SETUP_STARS.map((s, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: "astra-setup-star", style: {
      top: s.top,
      left: s.left,
      width: s.size,
      height: s.size,
      background: SETUP_STAR_COLORS[i % SETUP_STAR_COLORS.length],
      color: SETUP_STAR_COLORS[i % SETUP_STAR_COLORS.length],
      // Fade-in holds the star transparent through its delay (fill-mode both),
      // then the twinkle starts where the fade-in ends.
      animation: `astra-setup-star-in ${fadeInDuration}s ease-out ${s.delay}s both, astra-setup-star-twinkle ${s.duration}s ease-in-out ${s.delay + fadeInDuration}s infinite`
    } })));
  }
  function PymolSetupDialog({ page, setPage }) {
    const { setupStatus, isElectron, updateSettings, platform, switchEngine, rememberEngineVersion } = useApp();
    const [dismissed, setDismissed] = useState(false);
    const [engine, setEngine] = useState("pymol");
    const [pathInput, setPathInput] = useState("");
    const [validating, setValidating] = useState(false);
    const [validationError, setValidationError] = useState(null);
    const [restarting, setRestarting] = useState(false);
    useEffect(() => {
      setDismissed(false);
    }, [setupStatus]);
    if (!isElectron || !setupStatus || page === "settings" || dismissed) return null;
    const { pymolOk, scriptOk, isFirstLaunch } = setupStatus;
    if (pymolOk && scriptOk) return null;
    if (!scriptOk) {
      return /* @__PURE__ */ React.createElement("div", { className: "astra-setup-backdrop" }, /* @__PURE__ */ React.createElement(SetupStarField, null), /* @__PURE__ */ React.createElement("div", { className: "astra-modal-in", style: { width: "min(420px, 90vw)", background: "var(--bg-1)", border: "1px solid var(--line-1)", borderRadius: "var(--radius-lg)", padding: 28, textAlign: "center", position: "relative" } }, /* @__PURE__ */ React.createElement("button", { onClick: () => setDismissed(true), title: "Close", style: { position: "absolute", top: 14, right: 14, background: "none", border: "none", cursor: "pointer", color: "var(--text-2)", padding: 4 } }, /* @__PURE__ */ React.createElement(Icon, { name: "x", size: 15 })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "center", marginBottom: 14 } }, /* @__PURE__ */ React.createElement(AstraLogo, { size: 40 })), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 13.5, color: "var(--text-0)", lineHeight: 1.6, margin: 0 } }, "astra3.py could not be located alongside this app. The install itself may be missing files; reinstalling Astra3 may fix this.")));
    }
    const pickEngine = (value) => {
      setEngine(value);
      setPathInput("");
      setValidationError(null);
    };
    const browse = async () => {
      const picked = engine === "pymol" ? await window.astra3Native.openPymolExecutableDialog() : await window.astra3Native.openChimeraxExecutableDialog();
      if (picked) {
        setPathInput(picked);
        setValidationError(null);
      }
    };
    const confirm = async () => {
      if (!pathInput.trim() || validating || restarting) return;
      setValidating(true);
      setValidationError(null);
      const check = await checkEnginePath(engine, pathInput);
      if (check.error) {
        setValidating(false);
        setValidationError(check.error);
        return;
      }
      if (engine === "pymol") {
        const resolvedPath = await window.astra3Native.setPymolPath(pathInput);
        updateSettings({ pymolPath: resolvedPath });
      } else {
        await window.astra3Native.setChimeraxPath(pathInput);
        rememberEngineVersion("chimerax", check.version);
      }
      try {
        await switchEngine(engine);
      } catch (e) {
        setValidating(false);
        setValidationError(e.message);
        return;
      }
      if (isFirstLaunch) {
        setValidating(false);
        setDismissed(true);
      } else {
        setRestarting(true);
        await window.astra3Native.restartApp();
      }
    };
    const openReadme = () => {
      setDismissed(true);
      setPage("citation");
    };
    const chooseAstra3Engine = async () => {
      setValidationError(null);
      try {
        await switchEngine("astra3");
        setDismissed(true);
      } catch (e) {
        setValidationError(String(e.message || e).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ""));
      }
    };
    const placeholder = engine === "pymol" ? MAC_PYMOL_EXAMPLE : platform === "win32" ? "C:\\Program Files\\ChimeraX\\bin\\ChimeraX.exe" : "/Applications/ChimeraX.app";
    return /* @__PURE__ */ React.createElement("div", { className: "astra-setup-backdrop" }, /* @__PURE__ */ React.createElement(SetupStarField, null), /* @__PURE__ */ React.createElement("div", { className: "astra-modal-in astra-setup-glow", style: { width: "min(480px, 92vw)", background: "var(--bg-1)", border: "1px solid var(--line-1)", borderRadius: "var(--radius-lg)", padding: 32, position: "relative" } }, /* @__PURE__ */ React.createElement("button", { onClick: () => setDismissed(true), title: "Close", style: { position: "absolute", top: 14, right: 14, background: "none", border: "none", cursor: "pointer", color: "var(--text-2)", padding: 4 } }, /* @__PURE__ */ React.createElement(Icon, { name: "x", size: 15 })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "center", marginBottom: 18 } }, /* @__PURE__ */ React.createElement(AstraLogo, { size: 48, animated: true })), isFirstLaunch ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 17, fontWeight: 700, textAlign: "center", marginBottom: 8 } }, "Welcome to Astra3"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 13, color: "var(--text-1)", lineHeight: 1.6, textAlign: "center", margin: "0 0 8px" } }, "Connect PyMOL or ChimeraX, or start now with the Astra3 Engine."), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 12, color: "var(--text-2)", lineHeight: 1.6, textAlign: "center", margin: "0 0 18px" } }, "Astra3 runs its analysis inside PyMOL or UCSF ChimeraX when either is installed, or in its own engine.")) : /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13.5, color: "var(--text-0)", textAlign: "center", lineHeight: 1.6, margin: "0 0 18px" } }, "Neither PyMOL nor ChimeraX could be found. Select either installation, or use the Astra3 Engine."), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "center", marginBottom: 12 } }, /* @__PURE__ */ React.createElement(
      SegmentedControl,
      {
        value: engine,
        onChange: pickEngine,
        disabled: validating || restarting,
        options: [{ value: "pymol", label: "PyMOL" }, { value: "chimerax", label: "ChimeraX" }]
      }
    )), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6 } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement(
      TextInput,
      {
        mono: true,
        icon: "cube",
        placeholder,
        value: pathInput,
        onChange: (e) => {
          setPathInput(e.target.value);
          setValidationError(null);
        }
      }
    )), /* @__PURE__ */ React.createElement(Button, { variant: "secondary", onClick: browse }, "Browse")), validationError && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginTop: 10, color: "var(--coral)", fontSize: 12 } }, /* @__PURE__ */ React.createElement(Icon, { name: "alertTriangle", size: 13, style: { flexShrink: 0 } }), validationError), /* @__PURE__ */ React.createElement(Button, { variant: "primary", size: "lg", onClick: confirm, disabled: validating || restarting || !pathInput.trim(), style: { width: "100%", marginTop: 16 } }, restarting ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Spinner, { size: 14 }), "Restarting Astra3\u2026") : validating ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Spinner, { size: 14 }), "Checking\u2026") : "Confirm"), setupStatus.available?.astra3 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, margin: "18px 0 12px", color: "var(--text-2)", fontSize: 11 } }, /* @__PURE__ */ React.createElement("span", { style: { flex: 1, height: 1, background: "var(--line-0)" } }), "or", /* @__PURE__ */ React.createElement("span", { style: { flex: 1, height: 1, background: "var(--line-0)" } })), /* @__PURE__ */ React.createElement(Button, { variant: "secondary", size: "lg", onClick: chooseAstra3Engine, disabled: validating || restarting, style: { width: "100%" } }, /* @__PURE__ */ React.createElement(AstraLogo, { size: 16 }), "Use Astra3 Engine"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.55, textAlign: "center", margin: "8px 0 0" } }, "Nothing else to install. The same measurements and images, with every session saved for both PyMOL and ChimeraX.")), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", marginTop: 18 } }, /* @__PURE__ */ React.createElement("button", { onClick: openReadme, style: { background: "none", border: "none", color: "var(--text-2)", fontSize: 11, cursor: "pointer", textDecoration: "underline" } }, "README Document"))));
  }
  function PymolVerifiedToast() {
    const { setupStatus, isElectron } = useApp();
    const toast = useToast();
    const shownRef = useRef(false);
    useEffect(() => {
      if (!isElectron || !setupStatus) return;
      const { pymolOk, scriptOk, isFirstLaunch } = setupStatus;
      if (pymolOk && scriptOk && !isFirstLaunch && !shownRef.current) {
        shownRef.current = true;
        if (setupStatus.fallbackFrom) {
          toast.push({
            tone: "neutral",
            title: `${ENGINE_NAMES[setupStatus.fallbackFrom]} not found`,
            message: `Analyses run with ${ENGINE_NAMES[setupStatus.engine || "pymol"]}.`
          });
        }
      }
      if (!pymolOk) shownRef.current = false;
    }, [setupStatus, isElectron]);
    return null;
  }
  var PageErrorBoundary = class extends React.Component {
    constructor(props) {
      super(props);
      this.state = { error: null };
    }
    static getDerivedStateFromError(error) {
      return { error };
    }
    componentDidCatch(error, info) {
      console.error(`Astra3: error rendering the ${this.props.pageId} page`, error, info);
    }
    render() {
      if (!this.state.error) return this.props.children;
      return /* @__PURE__ */ React.createElement("div", { style: { padding: 40, maxWidth: 680, margin: "0 auto" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 15, fontWeight: 600, color: "var(--text-0)", marginBottom: 8 } }, "This page ran into a problem"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12.5, color: "var(--text-1)", lineHeight: 1.7, marginBottom: 16 } }, "The rest of Astra3 is still working, and your analyses and files are unaffected. You can switch to another tab, or try this page again."), /* @__PURE__ */ React.createElement("div", { className: "mono", style: {
        fontSize: 11,
        color: "var(--text-2)",
        background: "var(--bg-2)",
        border: "1px solid var(--line-0)",
        borderRadius: "var(--radius-sm)",
        padding: 12,
        marginBottom: 16,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word"
      } }, String(this.state.error?.message || this.state.error)), /* @__PURE__ */ React.createElement(Button, { variant: "secondary", icon: "refresh", onClick: () => this.setState({ error: null }) }, "Try again"));
    }
  };
  function ChimeraxWindowNotice() {
    const { bridge, platform } = useApp();
    const toast = useToast();
    const pushRef = useRef(toast.push);
    pushRef.current = toast.push;
    useEffect(() => {
      if (platform !== "win32" || !bridge || typeof bridge.on !== "function") return void 0;
      return bridge.on("log-line", ({ text }) => {
        if (!/^(> )?Starting ChimeraX in the background/.test(stripAnsi(String(text || "")).trim())) return;
        pushRef.current({
          tone: "neutral",
          title: "That window was ChimeraX",
          message: "If a window appeared just now, it was ChimeraX starting in the background to draw the images and save the session.",
          duration: 8e3
        });
      });
    }, [bridge, platform]);
    return null;
  }
  function OutputLocationNotice() {
    const { outputNotice, setOutputNotice } = useApp();
    const toast = useToast();
    useEffect(() => {
      if (!outputNotice) return;
      toast.push({ tone: "warning", title: outputNotice.title, message: outputNotice.message, duration: 15e3 });
      setOutputNotice(null);
    }, [outputNotice]);
    return null;
  }
  function AstraApp() {
    const [page, setPage] = useState("home");
    const [collapsed, setCollapsed] = useState(false);
    const [zoomFactor, setZoomFactor] = useState(1);
    useEffect(() => {
      if (typeof window !== "undefined" && window.astra3Native?.getZoomFactor) {
        window.astra3Native.getZoomFactor().then((f) => setZoomFactor(f)).catch(() => {
        });
      }
    }, []);
    const zoomIn = useCallback(async () => {
      if (!window.astra3Native?.zoomIn) return;
      setZoomFactor(await window.astra3Native.zoomIn());
    }, []);
    const zoomOut = useCallback(async () => {
      if (!window.astra3Native?.zoomOut) return;
      setZoomFactor(await window.astra3Native.zoomOut());
    }, []);
    const zoomReset = useCallback(async () => {
      if (!window.astra3Native?.zoomReset) return;
      setZoomFactor(await window.astra3Native.zoomReset());
    }, []);
    useEffect(() => {
      const onKey = (e) => {
        if (!e.metaKey && !e.ctrlKey) return;
        if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          zoomIn();
          return;
        }
        if (e.key === "-" || e.key === "_") {
          e.preventDefault();
          zoomOut();
          return;
        }
        if (e.key === "0") {
          e.preventDefault();
          zoomReset();
          return;
        }
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= NAV_ITEMS.length) {
          e.preventDefault();
          setPage(NAV_ITEMS[n - 1].id);
        }
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, []);
    useEffect(() => {
      const preventDefault = (e) => e.preventDefault();
      document.addEventListener("dragover", preventDefault);
      document.addEventListener("drop", preventDefault);
      return () => {
        document.removeEventListener("dragover", preventDefault);
        document.removeEventListener("drop", preventDefault);
      };
    }, []);
    const pages = {
      home: /* @__PURE__ */ React.createElement(HomePage, { setPage }),
      single: /* @__PURE__ */ React.createElement(SingleStructurePage, { setPage }),
      overlay: /* @__PURE__ */ React.createElement(OverlayPage, { setPage }),
      termini: /* @__PURE__ */ React.createElement(TerminiPage, { setPage }),
      batch: /* @__PURE__ */ React.createElement(BatchPage, { setPage }),
      related: /* @__PURE__ */ React.createElement(RelatedPage, { setPage }),
      import: /* @__PURE__ */ React.createElement(ImportPage, { setPage }),
      reports: /* @__PURE__ */ React.createElement(ReportsPage, { setPage }),
      viewer: /* @__PURE__ */ React.createElement(ViewerPage, null),
      summary: /* @__PURE__ */ React.createElement(SummaryPage, { setPage }),
      history: /* @__PURE__ */ React.createElement(HistoryPage, { setPage }),
      settings: /* @__PURE__ */ React.createElement(SettingsPage, null),
      console: /* @__PURE__ */ React.createElement(ConsolePage, null),
      palette: /* @__PURE__ */ React.createElement(PalettePage, null),
      citation: /* @__PURE__ */ React.createElement(CitationPage, null)
    };
    return /* @__PURE__ */ React.createElement(AppProvider, null, /* @__PURE__ */ React.createElement(ToastProvider, null, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", height: "100vh", width: "100vw" } }, /* @__PURE__ */ React.createElement(PymolSetupDialog, { page, setPage }), /* @__PURE__ */ React.createElement(PymolVerifiedToast, null), /* @__PURE__ */ React.createElement(ChimeraxWindowNotice, null), /* @__PURE__ */ React.createElement(OutputLocationNotice, null), /* @__PURE__ */ React.createElement(CompletionPulse, null), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flex: 1, minHeight: 0 } }, /* @__PURE__ */ React.createElement(NavRail, { page, setPage, collapsed, setCollapsed }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 } }, /* @__PURE__ */ React.createElement(TopBar, { page, setPage, zoomFactor, zoomIn, zoomOut, zoomReset }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column", position: "relative" } }, Object.entries(pages).map(([id, element]) => /* @__PURE__ */ React.createElement("div", { key: id, style: { display: page === id ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 } }, /* @__PURE__ */ React.createElement(PageActiveContext.Provider, { value: page === id }, /* @__PURE__ */ React.createElement(PageErrorBoundary, { pageId: id }, element))))))))));
  }
  var root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(/* @__PURE__ */ React.createElement(AstraApp, null));
})();

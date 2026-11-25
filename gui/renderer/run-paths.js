// ============================================================
// Astra3: History entries and the folders their runs wrote
// ============================================================
// A run's folder is taken from the paths it printed, never rebuilt from the
// output folder setting, so deletes reach the folder the run used.
// ============================================================
"use strict";

// The innermost run folder in a path ("<label>_Output", or "<label>_Output (n)"
// for a re-run), keeping its separators.
function runFolderOfPath(p) {
  if (typeof p !== "string") return null;
  const match = /^(?:.*[/\\])?[^/\\]*_Output(?: \(\d+\))?(?=[/\\]|$)/i.exec(p);
  return match ? match[0] : null;
}

function runFolderForEntry(entry) {
  if (!entry) return null;
  return runFolderOfPath(entry.reportPath) || runFolderOfPath(entry.sessionPath) || null;
}

function folderName(p) {
  const parts = String(p || "").split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || String(p || "");
}

// The folders to delete for these entries. A Batch entry owns no folder; its
// runs are entries of their own (batchEntryIds) and it is removed once they
// all are. Entries with no recorded paths go to `unknown`.
//
// Returns { folders, owners, groups, unknown }; owners maps folder -> entry ids.
function planDeletion(selected, history) {
  const byId = new Map((history || []).map((h) => [h.id, h]));
  const owners = new Map();
  const groups = [];
  const unknown = new Map();
  const add = (entry) => {
    const folder = runFolderForEntry(entry);
    if (!folder) {
      unknown.set(entry.id, entry);
      return;
    }
    if (!owners.has(folder)) owners.set(folder, new Set());
    owners.get(folder).add(entry.id);
  };
  for (const entry of selected || []) {
    if (entry.kind === "batch") {
      const children = (Array.isArray(entry.batchEntryIds) ? entry.batchEntryIds : [])
        .map((id) => byId.get(id))
        .filter(Boolean);
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

// Given the main process's per-folder results, only entries whose folder was
// deleted are removed. Returns { removedIds, problems }, each problem being
// { folder, ids, message }.
function settleDeletion(plan, results) {
  const byRequest = new Map((results || []).map((r) => [r.requested, r]));
  const removed = new Set();
  const problems = [];
  for (const [folder, ids] of plan.owners) {
    const result = byRequest.get(folder);
    if (result && result.status === "deleted") {
      ids.forEach((id) => removed.add(id));
    } else {
      problems.push({ folder, ids: [...ids], message: (result && result.message) || "It was not deleted." });
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

// One line per problem for a toast, naming the run by its History label.
function describeProblems(problems, history, limit = 3) {
  const labels = new Map((history || []).map((h) => [h.id, h.label]));
  const lines = problems.slice(0, limit).map((p) => {
    const name = p.ids.map((id) => labels.get(id)).filter(Boolean)[0] || (p.folder ? folderName(p.folder) : "A run");
    return `${name}: ${p.message}`;
  });
  if (problems.length > limit) lines.push(`...and ${problems.length - limit} more.`);
  return lines.join("\n");
}

module.exports = { runFolderOfPath, runFolderForEntry, folderName, planDeletion, settleDeletion, describeProblems };

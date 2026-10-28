// ============================================================
// Astra3: Quick View (Electron main process)
// ============================================================
// Coordinates for the 3D Viewer without running an analysis: a PDB entry
// fetched from RCSB, or a structure imported this session (an AST temporary
// ID) read from its file. The viewer reads PDB-format text, so mmCIF is
// converted here when the structure fits that format.
// ============================================================

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// The same host Astra3 fetches structure files from (overridable, like the
// engine's, for a local stand-in of RCSB).
const FILES_HOST = (process.env.ASTRA3_FETCH_HOST || "https://files.rcsb.org").replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = 30000;
// The PDB format's fixed columns hold atom serial numbers up to 99,999 and
// one-character chain IDs, and the viewer tells atoms apart by serial number.
const PDB_MAX_ATOMS = 99999;

const PDB_ID_RE = /^[1-9][A-Za-z0-9]{3}$/;
const EXTENDED_ID_RE = /^pdb_([A-Za-z0-9]{8})$/i;
const AST_ID_RE = /^AST-\d{4}$/i;
const STRUCTURE_FILE_RE = /\.(pdb|ent|cif|mmcif)(\.gz)?$/i;

class QuickViewError extends Error {}

// What the person typed, as { kind: "pdb", id, fileId } or { kind: "import", id }.
// fileId is the name RCSB files the entry under.
function parseQuickViewId(text) {
  const raw = String(text || "").trim();
  if (!raw) throw new QuickViewError("Type a PDB ID, such as 1AKE, or a temporary ID from the Import page, such as AST-0001.");
  if (/^AST-/i.test(raw)) {
    if (!AST_ID_RE.test(raw)) throw new QuickViewError(`"${raw}" looks like a temporary ID, but those have four digits: AST-0001.`);
    return { kind: "import", id: raw.toUpperCase() };
  }
  if (PDB_ID_RE.test(raw)) return { kind: "pdb", id: raw.toUpperCase(), fileId: raw.toUpperCase() };
  const extended = EXTENDED_ID_RE.exec(raw);
  if (extended) {
    // Every 4-character entry also has the extended ID pdb_0000 + its ID.
    const classic = extended[1].startsWith("0000") ? extended[1].slice(4).toUpperCase() : null;
    return classic ? { kind: "pdb", id: classic, fileId: classic } : { kind: "pdb", id: raw.toLowerCase(), fileId: raw.toLowerCase() };
  }
  throw new QuickViewError(`"${raw}" is not a PDB ID or a temporary ID. A PDB ID has four characters and starts with a digit (1AKE), or is an extended ID (pdb_00001ake); a temporary ID looks like AST-0001.`);
}

// Network failures in words a person can act on.
function unreachable(e) {
  const code = (e && e.cause && e.cause.code) || "";
  if (e && e.name === "AbortError") return `RCSB did not answer within ${REQUEST_TIMEOUT_MS / 1000} seconds`;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "this computer appears to be offline";
  if (code === "ECONNREFUSED") return "the connection was refused";
  if (code === "ECONNRESET" || code === "UND_ERR_SOCKET") return "the connection was dropped";
  return (e && (code || e.message)) || "unknown error";
}

// The text of a gzip file at RCSB, or null when RCSB has no such file.
async function fetchGzipText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  let body;
  try {
    res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "Astra3" } });
    if (res.status === 404) return null;
    body = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    throw new QuickViewError(`Astra3 could not reach RCSB (${unreachable(e)}). Check the internet connection, then try again.`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new QuickViewError(`RCSB answered with an error (HTTP ${res.status}). Try again in a few minutes.`);
  try {
    return zlib.gunzipSync(body).toString("utf-8");
  } catch {
    throw new QuickViewError("RCSB sent a file that could not be unpacked. Try again in a few minutes.");
  }
}

// Only the first model, as an analysis keeps: the viewer draws one.
function firstModel(pdbText) {
  const lines = String(pdbText).split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    if (line.startsWith("ENDMDL")) break;
    if (!line.startsWith("MODEL ")) out.push(line);
  }
  if (out.length < lines.length && out[out.length - 1] !== "END") out.push("END");
  return out.join("\n");
}

// The tokens of one mmCIF data line. A quoted value ends at a matching quote
// followed by a space or the end of the line, as the format defines.
function cifTokens(line) {
  const out = [];
  let i = 0;
  const n = line.length;
  while (i < n) {
    while (i < n && (line[i] === " " || line[i] === "\t")) i += 1;
    if (i >= n) break;
    const quote = line[i];
    if (quote === "'" || quote === '"') {
      let j = i + 1;
      while (j < n && !(line[j] === quote && (j + 1 === n || line[j + 1] === " " || line[j + 1] === "\t"))) j += 1;
      out.push(line.slice(i + 1, j));
      i = j + 1;
    } else {
      let j = i;
      while (j < n && line[j] !== " " && line[j] !== "\t") j += 1;
      out.push(line.slice(i, j));
      i = j;
    }
  }
  return out;
}

// The lines of a text one at a time: an entry's mmCIF can be hundreds of
// megabytes, and is often refused after its first rows.
function* textLines(text) {
  let start = 0;
  while (start < text.length) {
    let end = text.indexOf("\n", start);
    if (end < 0) end = text.length;
    yield text.charCodeAt(end - 1) === 13 ? text.slice(start, end - 1) : text.slice(start, end);
    start = end + 1;
  }
}

// The rows of the mmCIF atom_site loop, each { column: value }. A row may
// continue over several lines.
function* atomSiteRows(cifText) {
  let afterLoop = false;
  let columns = null;
  let pending = [];
  for (const line of textLines(String(cifText))) {
    if (columns === null) {
      if (afterLoop && line.startsWith("_atom_site.")) columns = [];
      else {
        afterLoop = line.trim() === "loop_";
        continue;
      }
    }
    if (line.startsWith("_atom_site.") && !pending.length) {
      columns.push(line.trim().slice("_atom_site.".length));
      continue;
    }
    if (line.startsWith("#") || line.startsWith("_") || line.startsWith("loop_") || line.startsWith("data_")) return;
    pending.push(...cifTokens(line));
    while (pending.length >= columns.length) {
      const row = {};
      columns.forEach((c, k) => { row[c] = pending[k]; });
      pending = pending.slice(columns.length);
      yield row;
    }
  }
}

// PDB ATOM/HETATM records for an mmCIF file's first model, laid out as
// Astra3 writes them for the viewer after an analysis. Refuses a structure
// the PDB format cannot hold.
function cifToPdb(cifText, label) {
  const value = (row, ...names) => {
    for (const name of names) {
      const v = row[name];
      if (v !== undefined && v !== "?" && v !== ".") return v;
    }
    return "";
  };
  const out = [];
  let model = null;
  let lastChain = null;
  let serial = 0;
  for (const row of atomSiteRows(cifText)) {
    const thisModel = value(row, "pdbx_PDB_model_num") || "1";
    if (model === null) model = thisModel;
    if (thisModel !== model) continue;
    serial += 1;
    if (serial > PDB_MAX_ATOMS) {
      throw new QuickViewError(`${label} has more than ${PDB_MAX_ATOMS.toLocaleString("en-US")} atoms, more than the PDB format the viewer reads can hold. Open it in PyMOL or ChimeraX instead.`);
    }
    const chain = value(row, "auth_asym_id", "label_asym_id");
    if (chain.length > 1) {
      throw new QuickViewError(`${label} uses chain IDs longer than one character (${chain}), which the PDB format the viewer reads cannot hold. Open it in PyMOL or ChimeraX instead.`);
    }
    if (lastChain !== null && chain !== lastChain) out.push("TER");
    lastChain = chain;
    const elem = value(row, "type_symbol").toUpperCase();
    let name = value(row, "auth_atom_id", "label_atom_id");
    if (name.length < 4 && elem.length === 1) name = ` ${name}`;
    const number = (v) => {
      const f = parseFloat(v);
      return Number.isFinite(f) ? f : 0;
    };
    const charge = parseInt(value(row, "pdbx_formal_charge"), 10);
    const chargeText = charge ? `${Math.abs(charge)}${charge > 0 ? "+" : "-"}` : "  ";
    out.push(
      (value(row, "group_PDB") === "HETATM" ? "HETATM" : "ATOM  ")
      + String(serial).padStart(5) + " " + name.slice(0, 4).padEnd(4) + value(row, "label_alt_id").slice(0, 1).padEnd(1)
      + value(row, "auth_comp_id", "label_comp_id").slice(0, 4).padEnd(4) + (chain || " ")
      + value(row, "auth_seq_id", "label_seq_id").slice(-4).padStart(4) + value(row, "pdbx_PDB_ins_code").slice(0, 1).padEnd(1) + "   "
      + number(value(row, "Cartn_x")).toFixed(3).padStart(8) + number(value(row, "Cartn_y")).toFixed(3).padStart(8)
      + number(value(row, "Cartn_z")).toFixed(3).padStart(8)
      + number(value(row, "occupancy") || "1").toFixed(2).padStart(6) + number(value(row, "B_iso_or_equiv")).toFixed(2).padStart(6)
      + "          " + elem.slice(0, 2).padStart(2) + chargeText,
    );
  }
  if (!serial) throw new QuickViewError(`${label} holds no atom coordinates that the viewer can show.`);
  out.push("END");
  return out.join("\n");
}

function readStructureFile(file) {
  const data = fs.readFileSync(file);
  return (/\.gz$/i.test(file) ? zlib.gunzipSync(data) : data).toString("utf-8");
}

async function quickViewEntry(parsed) {
  if (PDB_ID_RE.test(parsed.fileId)) {
    const pdb = await fetchGzipText(`${FILES_HOST}/download/${parsed.fileId}.pdb.gz`);
    if (pdb !== null) return { text: firstModel(pdb), format: "PDB" };
  }
  // Entries too large for the PDB format, and those with only an extended
  // ID, are distributed as mmCIF only.
  const cif = await fetchGzipText(`${FILES_HOST}/download/${parsed.fileId}.cif.gz`);
  if (cif === null) throw new QuickViewError(`RCSB has no entry ${parsed.id}. Check the ID, then try again.`);
  return { text: cifToPdb(cif, parsed.id), format: "mmCIF" };
}

// file, when given, is the file an earlier Quick View of this ID showed:
// a saved entry keeps showing that file after its temporary ID is gone, or
// after the ID has been given to another import.
function quickViewImport(parsed, imports, file) {
  const registered = imports.find((e) => String(e.id).toUpperCase() === parsed.id);
  if (!file && !registered) {
    throw new QuickViewError(`${parsed.id} is not one of this session's imports. Temporary IDs last until Astra3 closes; import the file again on the Import page to get one.`);
  }
  const target = file || registered.path;
  if (/\.pse(\.gz)?$/i.test(target)) {
    throw new QuickViewError(`${parsed.id} comes from a PyMOL session (${path.basename(target)}), which Quick View cannot read. Analyze ${parsed.id} to view it here, or open the session in PyMOL.`);
  }
  if (!STRUCTURE_FILE_RE.test(target)) throw new QuickViewError(`${path.basename(target)} is not a structure file Quick View can read (.pdb, .ent, .cif or .mmcif).`);
  if (!fs.existsSync(target)) {
    throw new QuickViewError(`The file ${parsed.id} came from is no longer at ${target}. Import it again from where it is now.`);
  }
  let text;
  try {
    text = readStructureFile(target);
  } catch (e) {
    throw new QuickViewError(`${path.basename(target)} could not be read (${e.message}).`);
  }
  const isCif = /\.(cif|mmcif)(\.gz)?$/i.test(target);
  const shared = registered && !file ? imports.filter((e) => e.path === target).map((e) => e.id) : [];
  return {
    text: isCif ? cifToPdb(text, parsed.id) : firstModel(text),
    format: isCif ? "mmCIF" : "PDB",
    path: target,
    name: (registered && !file && registered.name) || path.basename(target),
    note: shared.length > 1
      ? `${path.basename(target)} holds ${shared.length} structures (${shared.join(", ")}); Quick View shows the whole file.`
      : null,
  };
}

// { ok: true, id, kind, text, format, path?, name?, note? } or { ok: false, error }.
// request: { id, path? }; imports: this session's imports ({ id, name, path }).
async function quickView(request, imports) {
  try {
    const parsed = parseQuickViewId(request && request.id);
    const loaded = parsed.kind === "import"
      ? quickViewImport(parsed, imports || [], request.path || null)
      : await quickViewEntry(parsed);
    return { ok: true, id: parsed.id, kind: parsed.kind, ...loaded };
  } catch (e) {
    if (e instanceof QuickViewError) return { ok: false, error: e.message };
    return { ok: false, error: `Quick View failed: ${e.message}` };
  }
}

module.exports = { quickView, parseQuickViewId, cifToPdb, firstModel, cifTokens };

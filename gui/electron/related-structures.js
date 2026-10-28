// ============================================================
// Astra3: Related Structures (Electron main process)
// ============================================================
// Finds other PDB entries of the same protein as a query entry and says,
// for each one, what it is useful for and what will go wrong if it is
// compared -- before any analysis is run.
//
// How relatedness is decided:
//   1. The query entry's protein entity is identified, with its UniProt
//      accession and the UniProt residue range its construct covers
//      (RCSB's alignment of the entity to UniProt).
//   2. RCSB's Search API returns every experimental entry with a polymer
//      entity mapped to that same UniProt accession. An entity with no
//      UniProt mapping (e.g. a designed protein) is searched by sequence
//      instead (>= 90% identity), and region comparisons are then marked
//      unavailable rather than guessed.
//   3. RCSB's Data API (GraphQL) supplies each hit's method, resolution,
//      ligands, copies, UniProt coverage, mutation count and validation
//      summary, in batched requests.
//
// Every judgement below is a comparison of recorded values against a
// threshold stated in THRESHOLDS; nothing is inferred beyond that, and each
// suggestion and warning carries the values it was based on.
// ============================================================

const SEARCH_URL = process.env.ASTRA3_RCSB_SEARCH_API || "https://search.rcsb.org/rcsbsearch/v2/query";
const GRAPHQL_URL = process.env.ASTRA3_RCSB_GRAPHQL || "https://data.rcsb.org/graphql";
const REQUEST_TIMEOUT_MS = 20000;
// Detail is fetched for up to this many related entries. The search returns
// entries in no scientifically meaningful order, so a small cap silently
// dropped arbitrary entries (including the only apo structures of some
// proteins). 1,000 covers nearly every protein in the PDB; beyond that the
// page says how many were not examined.
const MAX_ENTRIES = 1000;
const GRAPHQL_BATCH = 100;

const THRESHOLDS = {
  // Share of the query's UniProt region a hit must also contain for a
  // structural comparison to be about the same part of the protein.
  sameRegionCoverage: 0.7,
  // Construct boundaries within this many residues are what Astra3's
  // terminus offset correction handles (it shifts the comparison window).
  terminusOffsetCorrectable: 10,
  lowResolutionAngstrom: 3.0,
  highRamachandranOutlierPercent: 2.0,
  highUnmodeledFraction: 0.2,
  largeEntryAtoms: 100000,
  sequenceSearchIdentity: 0.9,
  minSequenceSearchLength: 20,
};

// Buffers, cryoprotectants, precipitants and common crystallization salts.
// Present in many ligand-free structures, so they do not make an entry
// "ligand-bound". Shown to the user regardless; only the apo/holo label
// ignores them.
const ADDITIVES = new Set([
  "HOH", "DOD", "GOL", "EDO", "PEG", "PG4", "PGE", "1PE", "2PE", "P6G", "PE4", "PE5", "PE8", "12P", "15P", "MPD", "MRD",
  "DMS", "SO4", "PO4", "PI", "ACT", "ACY", "FMT", "TRS", "MES", "EPE", "BME", "DTT", "IMD", "NO3", "SCN", "CIT", "FLC",
  "TAR", "MLI", "BU3", "PGO", "IPA", "EOH", "MOH", "BTB", "NH4", "AZI", "UNX", "UNL", "CAC", "BCT", "OXL", "SIN", "MLA",
  "PEU", "P33", "XPE", "IOD", "BR",
]);
const IONS = new Set([
  "NA", "K", "CL", "MG", "CA", "ZN", "MN", "FE", "FE2", "CO", "NI", "CU", "CU1", "CD", "SR", "BA", "CS", "RB", "LI",
  "HG", "PT", "AU", "AG", "PB", "YB", "SM", "GD", "LU", "TB", "EU", "TL", "F",
]);

const ENTRY_FIELDS = `
  rcsb_id
  struct { title }
  rcsb_accession_info { initial_release_date }
  rcsb_entry_info {
    experimental_method resolution_combined deposited_model_count polymer_entity_count_protein
    deposited_polymer_monomer_count deposited_unmodeled_polymer_monomer_count deposited_atom_count
    nonpolymer_bound_components nonpolymer_entity_count branched_entity_count
  }
  nonpolymer_entities {
    pdbx_entity_nonpoly { comp_id name }
    rcsb_nonpolymer_entity_container_identifiers { auth_asym_ids }
  }
  branched_entities { rcsb_branched_entity { pdbx_description } }
  pdbx_vrpt_summary_geometry { clashscore percent_ramachandran_outliers }
  polymer_entities {
    rcsb_id
    rcsb_polymer_entity_container_identifiers { entity_id auth_asym_ids uniprot_ids }
    rcsb_polymer_entity { pdbx_description pdbx_mutation }
    entity_poly { rcsb_entity_polymer_type rcsb_sample_sequence_length rcsb_mutation_count pdbx_seq_one_letter_code_can }
    rcsb_polymer_entity_align {
      reference_database_name reference_database_accession
      aligned_regions { entity_beg_seq_id ref_beg_seq_id length }
    }
    rcsb_entity_source_organism { scientific_name ncbi_taxonomy_id }
  }`;

class RcsbError extends Error {}

async function httpJson(url, body, requests) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    requests.push({ url, status: null });
    const why = e.name === "AbortError" ? `no response within ${REQUEST_TIMEOUT_MS / 1000} s` : (e.cause?.code || e.message);
    throw new RcsbError(`Could not reach RCSB (${why}).`);
  } finally {
    clearTimeout(timer);
  }
  requests.push({ url, status: res.status });
  if (res.status === 204) return null; // Search API: no results
  const text = await res.text();
  if (!res.ok) {
    let detail = "";
    try { detail = JSON.parse(text).message || ""; } catch { detail = text.slice(0, 200); }
    throw new RcsbError(`RCSB returned HTTP ${res.status}${detail ? `: ${detail}` : ""}.`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new RcsbError("RCSB returned a response Astra3 could not read.");
  }
}

async function graphqlEntries(ids, requests) {
  const out = [];
  for (let i = 0; i < ids.length; i += GRAPHQL_BATCH) {
    const chunk = ids.slice(i, i + GRAPHQL_BATCH);
    const data = await httpJson(GRAPHQL_URL, {
      query: `query ($ids: [String!]!) { entries(entry_ids: $ids) { ${ENTRY_FIELDS} } }`,
      variables: { ids: chunk },
    }, requests);
    if (data?.errors?.length) {
      throw new RcsbError(`RCSB rejected the data request: ${data.errors[0].message}`);
    }
    out.push(...(data?.data?.entries || []).filter(Boolean));
  }
  return out;
}

// ---- pure analysis --------------------------------------------------------

function uniprotRegions(entity, accession) {
  const regions = [];
  for (const align of entity?.rcsb_polymer_entity_align || []) {
    if ((align.reference_database_name || "").toLowerCase() !== "uniprot") continue;
    if (accession && align.reference_database_accession !== accession) continue;
    for (const r of align.aligned_regions || []) {
      if (r.ref_beg_seq_id == null || r.length == null) continue;
      regions.push([r.ref_beg_seq_id, r.ref_beg_seq_id + r.length - 1]);
    }
  }
  return mergeIntervals(regions);
}

function mergeIntervals(intervals) {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [a, b] of sorted) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged;
}

function intervalLength(intervals) {
  return intervals.reduce((n, [a, b]) => n + (b - a + 1), 0);
}

function overlapLength(xs, ys) {
  let n = 0;
  for (const [a, b] of xs) for (const [c, d] of ys) n += Math.max(0, Math.min(b, d) - Math.max(a, c) + 1);
  return n;
}

function entryLigands(entry) {
  // nonpolymer_bound_components only lists components RCSB records as bound,
  // and comes back empty for many entries, which made every structure look
  // ligand-free. The entities themselves are the reliable source; the bound
  // list is kept as a fallback for entries that do not return entities.
  const names = {};
  const fromEntities = (entry?.nonpolymer_entities || [])
    .map((e) => {
      const id = e?.pdbx_entity_nonpoly?.comp_id;
      if (id && e?.pdbx_entity_nonpoly?.name) names[id] = e.pdbx_entity_nonpoly.name;
      return id;
    })
    .filter(Boolean);
  const comps = fromEntities.length ? fromEntities : (entry?.rcsb_entry_info?.nonpolymer_bound_components || []);
  const unique = [...new Set(comps)];
  const carbohydrates = (entry?.branched_entities || [])
    .map((e) => e?.rcsb_branched_entity?.pdbx_description)
    .filter(Boolean);
  return {
    ligands: unique.filter((c) => !ADDITIVES.has(c) && !IONS.has(c)).sort(),
    ions: unique.filter((c) => IONS.has(c)).sort(),
    additives: unique.filter((c) => ADDITIVES.has(c)).sort(),
    carbohydrates,
    ligandNames: names,
  };
}

// RCSB's pre-rendered structure images. Two address layouts are in use; the
// interface tries them in order and shows nothing if neither loads.
function thumbnailUrls(entryId) {
  const id = String(entryId || "").toLowerCase();
  if (!/^[a-z0-9]{4}$/.test(id)) return [];
  return [
    `https://cdn.rcsb.org/images/structures/${id}_assembly-1.jpeg`,
    `https://cdn.rcsb.org/images/structures/${id.slice(1, 3)}/${id}/${id}_assembly-1.jpeg`,
  ];
}

function resolutionOf(entry) {
  const r = entry?.rcsb_entry_info?.resolution_combined;
  const v = Array.isArray(r) ? r[0] : r;
  return typeof v === "number" ? v : null;
}

function proteinEntities(entry) {
  return (entry?.polymer_entities || []).filter(
    (e) => (e.entity_poly?.rcsb_entity_polymer_type || "Protein") === "Protein"
  );
}

function describeQuery(entry, entityId) {
  const proteins = proteinEntities(entry);
  if (!proteins.length) return null;
  const chosen = proteins.find((e) => e.rcsb_polymer_entity_container_identifiers?.entity_id === String(entityId))
    || [...proteins].sort((a, b) => (b.entity_poly?.rcsb_sample_sequence_length || 0) - (a.entity_poly?.rcsb_sample_sequence_length || 0))[0];
  const ids = chosen.rcsb_polymer_entity_container_identifiers || {};
  const accessions = ids.uniprot_ids || [];
  const accession = accessions.length ? accessions[0] : null;
  return {
    entryId: entry.rcsb_id,
    title: entry.struct?.title || null,
    entityId: ids.entity_id,
    description: chosen.rcsb_polymer_entity?.pdbx_description || null,
    chains: ids.auth_asym_ids || [],
    accession,
    otherAccessions: accessions.slice(1),
    regions: accession ? uniprotRegions(chosen, accession) : [],
    sequence: (chosen.entity_poly?.pdbx_seq_one_letter_code_can || "").replace(/\s/g, ""),
    length: chosen.entity_poly?.rcsb_sample_sequence_length || null,
    method: entry.rcsb_entry_info?.experimental_method || null,
    resolution: resolutionOf(entry),
    thumbnails: thumbnailUrls(entry.rcsb_id),
    ...entryLigands(entry),
    entities: proteins.map((e) => ({
      entityId: e.rcsb_polymer_entity_container_identifiers?.entity_id,
      description: e.rcsb_polymer_entity?.pdbx_description || null,
      chains: e.rcsb_polymer_entity_container_identifiers?.auth_asym_ids || [],
      accession: (e.rcsb_polymer_entity_container_identifiers?.uniprot_ids || [])[0] || null,
    })),
  };
}

function assessHit(query, entry, matchedEntityIds) {
  const proteins = proteinEntities(entry);
  const matched = proteins.filter((e) => matchedEntityIds.has(e.rcsb_polymer_entity_container_identifiers?.entity_id)
    || (query.accession && (e.rcsb_polymer_entity_container_identifiers?.uniprot_ids || []).includes(query.accession)));
  const info = entry.rcsb_entry_info || {};
  const resolution = resolutionOf(entry);
  const method = info.experimental_method || null;
  const { ligands, ions, additives, carbohydrates, ligandNames } = entryLigands(entry);
  const copies = matched.reduce((n, e) => n + (e.rcsb_polymer_entity_container_identifiers?.auth_asym_ids || []).length, 0);
  const partners = proteins.length - matched.length;
  const mutations = matched.reduce((n, e) => n + (e.entity_poly?.rcsb_mutation_count || 0), 0);
  const mutationText = matched.map((e) => e.rcsb_polymer_entity?.pdbx_mutation).filter(Boolean).join("; ") || null;

  let coverage = null, nOffset = null, cOffset = null, regions = [];
  if (query.accession && query.regions.length) {
    regions = mergeIntervals(matched.flatMap((e) => uniprotRegions(e, query.accession)));
    if (regions.length) {
      coverage = overlapLength(query.regions, regions) / intervalLength(query.regions);
      nOffset = regions[0][0] - query.regions[0][0];
      cOffset = regions[regions.length - 1][1] - query.regions[query.regions.length - 1][1];
    }
  }

  const suggestions = [];
  const issues = [];
  const pct = (x) => `${Math.round(x * 100)}%`;
  const sameRegion = coverage == null ? null : coverage >= THRESHOLDS.sameRegionCoverage;

  if (sameRegion !== false) {
    suggestions.push({
      kind: "overlay",
      reason: coverage == null ? "Same protein by sequence; region overlap not mapped" : `Covers ${pct(coverage)} of ${query.entryId}'s region`,
    });
  } else {
    issues.push({ severity: "high", text: `Covers only ${pct(coverage)} of ${query.entryId}'s UniProt region: an overlay compares mostly different parts of the protein.` });
  }

  if (sameRegion && nOffset != null) {
    const worst = Math.max(Math.abs(nOffset), Math.abs(cOffset));
    const describe = (off, end) => off === 0 ? null
      : `${end}-terminal construct boundary ${off > 0 ? "starts" : "starts"} ${Math.abs(off)} residue${Math.abs(off) === 1 ? "" : "s"} ${off > 0 ? "later" : "earlier"}`;
    if (worst === 0) {
      suggestions.push({ kind: "termini", reason: "Same construct boundaries as the query" });
    } else if (worst <= THRESHOLDS.terminusOffsetCorrectable) {
      const parts = [describe(nOffset, "N"), cOffset === 0 ? null : `C-terminal boundary ${cOffset > 0 ? "extends" : "ends"} ${Math.abs(cOffset)} residue${Math.abs(cOffset) === 1 ? "" : "s"} ${cOffset > 0 ? "further" : "sooner"}`].filter(Boolean);
      suggestions.push({ kind: "termini", reason: `${parts.join("; ")}: Astra3 will offer an offset correction` });
    } else {
      issues.push({ severity: "high", text: `Construct boundaries differ by up to ${worst} residues (N ${nOffset >= 0 ? "+" : ""}${nOffset}, C ${cOffset >= 0 ? "+" : ""}${cOffset} in UniProt numbering): terminus comparisons would describe different residues.` });
    }
  }

  const queryHolo = query.ligands.length > 0 || (query.carbohydrates || []).length > 0;
  const hitHolo = ligands.length > 0 || carbohydrates.length > 0;
  if (queryHolo !== hitHolo) {
    suggestions.push({
      kind: "state",
      reason: hitHolo ? `Ligand-bound (${ligands.slice(0, 4).join(", ")}${ligands.length > 4 ? ", ..." : ""}) where ${query.entryId} is ligand-free` : `Ligand-free where ${query.entryId} is ligand-bound`,
    });
  } else if (queryHolo && hitHolo) {
    const shared = ligands.filter((l) => query.ligands.includes(l));
    if (!shared.length) suggestions.push({ kind: "state", reason: `Different ligands (${ligands.slice(0, 4).join(", ")}) from ${query.entryId} (${query.ligands.slice(0, 4).join(", ")})` });
  }

  if (resolution != null && resolution > THRESHOLDS.lowResolutionAngstrom) {
    issues.push({ severity: "medium", text: `Resolution ${resolution.toFixed(2)} Å: side-chain and ligand detail is limited.` });
  }
  if (/NMR/i.test(method || "")) {
    const models = info.deposited_model_count;
    issues.push({ severity: "medium", text: `Solution NMR entry${models ? ` (${models} models)` : ""}: coordinates are an ensemble, not a single structure.` });
  }
  if (mutations > 0) {
    issues.push({ severity: "medium", text: `${mutations} residue${mutations === 1 ? "" : "s"} differ${mutations === 1 ? "s" : ""} from UniProt${mutationText ? ` (depositor: ${mutationText})` : ""}: differences near these may reflect the mutation.` });
  }
  if (copies > 1) {
    issues.push({ severity: "low", text: `${copies} copies of this protein: Astra3 will ask whether to analyze one chain.` });
  }
  if (partners > 0) {
    issues.push({ severity: "low", text: `Also contains ${partners} other protein${partners === 1 ? "" : "s"}: contacts and exposure reflect the complex.` });
  }
  const total = info.deposited_polymer_monomer_count;
  const unmodeled = info.deposited_unmodeled_polymer_monomer_count;
  if (total && unmodeled != null && unmodeled / total > THRESHOLDS.highUnmodeledFraction) {
    issues.push({ severity: "medium", text: `${pct(unmodeled / total)} of residues are not modeled: termini and loops may be missing.` });
  }
  const rama = (entry.pdbx_vrpt_summary_geometry || [])[0]?.percent_ramachandran_outliers;
  if (typeof rama === "number" && rama >= THRESHOLDS.highRamachandranOutlierPercent) {
    issues.push({ severity: "medium", text: `${rama.toFixed(1)}% Ramachandran outliers in the wwPDB validation report.` });
  }
  if ((info.deposited_atom_count || 0) > THRESHOLDS.largeEntryAtoms) {
    issues.push({ severity: "low", text: `Very large entry (${info.deposited_atom_count.toLocaleString()} atoms): analysis will be slower.` });
  }

  return {
    entryId: entry.rcsb_id,
    title: entry.struct?.title || null,
    released: entry.rcsb_accession_info?.initial_release_date?.slice(0, 10) || null,
    method,
    resolution,
    ligands, ions, additives, carbohydrates, ligandNames,
    ligandFree: !hitHolo,
    // Ligand-free apart from metal or other ions, which are often structural
    // rather than bound ligands but are worth seeing.
    ionsOnly: !hitHolo && ions.length > 0,
    thumbnails: thumbnailUrls(entry.rcsb_id),
    copies, partners, mutations,
    coverage, nOffset, cOffset,
    uniprotRange: regions.length ? `${regions[0][0]}-${regions[regions.length - 1][1]}` : null,
    organism: matched[0]?.rcsb_entity_source_organism?.[0]?.scientific_name || null,
    clashscore: (entry.pdbx_vrpt_summary_geometry || [])[0]?.clashscore ?? null,
    ramachandranOutliers: typeof rama === "number" ? rama : null,
    suggestions,
    issues,
  };
}

// Sort: same region first, then resolution (unknown last), then newest.
function compareHits(a, b) {
  const bucket = (h) => (h.coverage == null ? 1 : h.coverage >= 0.9 ? 0 : h.coverage >= THRESHOLDS.sameRegionCoverage ? 1 : 2);
  if (bucket(a) !== bucket(b)) return bucket(a) - bucket(b);
  const ra = a.resolution ?? Infinity, rb = b.resolution ?? Infinity;
  if (ra !== rb) return ra - rb;
  return (b.released || "").localeCompare(a.released || "");
}

function summarize(hits) {
  const methods = {};
  for (const h of hits) methods[h.method || "Unknown"] = (methods[h.method || "Unknown"] || 0) + 1;
  // Values worth filtering on, with how many of these structures have them,
  // so the interface can show "NAP (142 of 150)" rather than a bare list.
  const ligandCounts = {};
  const ligandNames = {};
  // Depositors write organism names in different cases ("Homo sapiens" and
  // "HOMO SAPIENS"), which would otherwise split one species into two
  // filter entries. Group case-insensitively and show the commonest form.
  const organismGroups = {};
  for (const h of hits) {
    for (const l of new Set(h.ligands || [])) {
      ligandCounts[l] = (ligandCounts[l] || 0) + 1;
      if (h.ligandNames?.[l]) ligandNames[l] = h.ligandNames[l];
    }
    if (h.organism) {
      const key = h.organism.trim().toLowerCase();
      const group = organismGroups[key] || (organismGroups[key] = { count: 0, forms: {} });
      group.count += 1;
      group.forms[h.organism] = (group.forms[h.organism] || 0) + 1;
    }
  }
  const byCount = (counts) => Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return {
    ligandOptions: byCount(ligandCounts).map(([id, count]) => ({ id, count, name: ligandNames[id] || null })),
    organismOptions: Object.entries(organismGroups)
      .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
      .map(([key, g]) => ({ key, name: byCount(g.forms)[0][0], count: g.count })),
    count: hits.length,
    ligandFree: hits.filter((h) => h.ligandFree).length,
    ligandBound: hits.filter((h) => !h.ligandFree).length,
    mutants: hits.filter((h) => h.mutations > 0).length,
    sameRegion: hits.filter((h) => h.coverage == null || h.coverage >= THRESHOLDS.sameRegionCoverage).length,
    methods,
  };
}

// ---- entry point -----------------------------------------------------------

async function findRelatedStructures({ pdbId, entityId } = {}) {
  const requests = [];
  const retrieved = new Date().toISOString();
  let id = String(pdbId || "").trim().toUpperCase();
  // wwPDB's extended form of an existing entry: pdb_00001ake is 1AKE.
  if (/^PDB_0000[A-Z0-9]{4}$/.test(id)) id = id.slice(8);
  else if (/^PDB_[A-Z0-9]{8}$/.test(id)) id = "pdb_" + id.slice(4);
  if (!/^(?:[A-Z0-9]{4}|pdb_[A-Z0-9]{8})$/.test(id)) {
    return { ok: false, error: "Enter a PDB ID (for example 1AKE or pdb_00001ake). Related structures can only be found for PDB entries, not imported files." };
  }
  try {
    const [queryEntry] = await graphqlEntries([id], requests);
    if (!queryEntry) return { ok: false, error: `RCSB has no entry ${id}.`, requests, retrieved };
    const query = describeQuery(queryEntry, entityId);
    if (!query) return { ok: false, error: `${id} has no protein chains to compare.`, requests, retrieved };

    let searchQuery, basis;
    if (query.accession) {
      basis = "uniprot";
      searchQuery = {
        type: "terminal", service: "text",
        // uniprot_ids is not a searchable attribute; the reference sequence
        // identifiers are (this is RCSB's documented UniProt search).
        parameters: {
          attribute: "rcsb_polymer_entity_container_identifiers.reference_sequence_identifiers.database_accession",
          operator: "exact_match",
          value: query.accession,
        },
      };
    } else if (query.sequence.length >= THRESHOLDS.minSequenceSearchLength) {
      basis = "sequence";
      searchQuery = {
        type: "terminal", service: "sequence",
        parameters: { evalue_cutoff: 0.1, identity_cutoff: THRESHOLDS.sequenceSearchIdentity, sequence_type: "protein", value: query.sequence },
      };
    } else {
      return { ok: false, error: `${id} entity ${query.entityId} has no UniProt mapping and is too short to search by sequence.`, query, requests, retrieved };
    }

    const search = await httpJson(SEARCH_URL, {
      query: searchQuery,
      return_type: "polymer_entity",
      request_options: {
        paginate: { start: 0, rows: 10000 },
        results_content_type: ["experimental"],
        sort: [{ sort_by: "score", direction: "desc" }],
      },
    }, requests);

    const matchedByEntry = new Map();
    for (const r of search?.result_set || []) {
      // "1AKE_1": entry, then entity. Split at the last "_", since an
      // extended entry ID has one of its own.
      const ident = String(r.identifier || "");
      const cut = ident.lastIndexOf("_");
      const entryId = cut > 0 ? ident.slice(0, cut) : ident;
      const eid = cut > 0 ? ident.slice(cut + 1) : "";
      if (!entryId || entryId.toUpperCase() === id.toUpperCase()) continue;
      if (!matchedByEntry.has(entryId)) matchedByEntry.set(entryId, new Set());
      matchedByEntry.get(entryId).add(eid);
    }
    const totalEntries = matchedByEntry.size;
    const entryIds = [...matchedByEntry.keys()].slice(0, MAX_ENTRIES);
    const entries = entryIds.length ? await graphqlEntries(entryIds, requests) : [];
    const hits = entries.map((e) => assessHit(query, e, matchedByEntry.get(e.rcsb_id) || new Set())).sort(compareHits);

    return {
      ok: true,
      basis,
      query,
      hits,
      summary: { ...summarize(hits), totalFound: totalEntries, truncated: totalEntries > entryIds.length },
      thresholds: THRESHOLDS,
      retrieved,
      requests,
      source: "RCSB PDB Search API and Data API",
    };
  } catch (e) {
    if (e instanceof RcsbError) return { ok: false, error: e.message, requests, retrieved };
    return { ok: false, error: `Unexpected problem while searching: ${e.message}`, requests, retrieved };
  }
}

module.exports = {
  findRelatedStructures,
  // exported for tests
  assessHit, describeQuery, compareHits, mergeIntervals, overlapLength, entryLigands, thumbnailUrls, THRESHOLDS,
  MAX_ENTRIES, GRAPHQL_BATCH,
};

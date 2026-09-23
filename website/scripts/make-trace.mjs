// Builds the hero illustration's Cα trace from a real PDB-format file.
//
//   node scripts/make-trace.mjs <file.pdb> [chain] [label]
//   e.g. node scripts/make-trace.mjs ~/Documents/Astra3/Protein_outputs/1ERJ_Output/Session/1ERJ.pdb C "PDB 1ERJ · TUP1 WD40 DOMAIN"
//
// Writes src/lib/trace-data.json: one Cα per residue (first model, first
// alternate location, observed atoms only) and a secondary-structure class
// per residue from Cα geometry (helix: i→i+3 about 5-6 Å; strand: i-2→i+2
// about 13 Å), which only sets the tube width. Coordinates are rounded to
// 0.01 Å. Update the hero's caption to the same label.
import { readFileSync, writeFileSync } from 'node:fs';

const [file, chainArg, label] = process.argv.slice(2);
if (!file) { console.error('usage: node scripts/make-trace.mjs <file.pdb> [chain] [label]'); process.exit(1); }
const ca = [];
const seen = new Set();
for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
  if (line.startsWith('ENDMDL')) break;
  if (!line.startsWith('ATOM') || line.slice(12, 16).trim() !== 'CA') continue;
  const chain = line.slice(21, 22).trim();
  if (chainArg && chain !== chainArg) continue;
  const alt = line.slice(16, 17).trim();
  if (alt && alt !== 'A') continue;
  const occ = parseFloat(line.slice(54, 60));
  if (Number.isFinite(occ) && occ <= 0) continue;
  const res = `${chain}|${line.slice(22, 27).trim()}`;
  if (seen.has(res)) continue;
  seen.add(res);
  ca.push([30, 38, 46].map((c) => Math.round(parseFloat(line.slice(c, c + 8)) * 100) / 100));
}
if (ca.length < 20) { console.error(`only ${ca.length} Cα atoms found${chainArg ? ` in chain ${chainArg}` : ''}`); process.exit(1); }
const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const ss = ca.map((_, i) => {
  const h = (j) => j >= 0 && j + 3 < ca.length && d(ca[j], ca[j + 3]) > 4.5 && d(ca[j], ca[j + 3]) < 6.2;
  if ([i - 3, i - 2, i - 1, i].filter(h).length >= 2) return 1;
  if (i >= 2 && i + 2 < ca.length && d(ca[i - 2], ca[i + 2]) > 12.0) return 2;
  return 0;
});
writeFileSync(new URL('../src/lib/trace-data.json', import.meta.url),
  JSON.stringify({ label: label || file.split('/').pop(), chain: chainArg || null, ca, ss }) + '\n');
console.log(`${ca.length} residues, ${ss.filter((s) => s === 1).length} helix, ${ss.filter((s) => s === 2).length} strand`);

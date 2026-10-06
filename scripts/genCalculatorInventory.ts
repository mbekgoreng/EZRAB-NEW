/**
 * EZRAB PRICING ENGINE — CALCULATOR INVENTORY GENERATOR (PHASE 0 AUDIT, READ-ONLY)
 * Membaca docs/_audit/pricing-sweep.json lalu menghasilkan tabel inventaris markdown
 * dengan kolom sesuai brief audit.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const sweepPath = path.join(process.cwd(), 'docs', '_audit', 'pricing-sweep.json');
const sweep = JSON.parse(fs.readFileSync(sweepPath, 'utf8'));
const rows: any[] = sweep.rows;

const packOrder = ['building', 'residential', 'road', 'drainage', 'bridge', 'irrigation', 'river', 'weir', 'embung', 'dam', 'waterStructure', 'water-structure', 'paving', 'steel', '-'];

const byPack: Record<string, any[]> = {};
for (const r of rows) (byPack[r.pack] ||= []).push(r);

const lines: string[] = [];
lines.push('# EZRAB — Calculator Pricing Inventory (generated)');
lines.push('');
lines.push(`Generated: ${sweep.generatedAt}  `);
lines.push(`Total calculators: **${sweep.totalCalculators}**  `);
lines.push(`MASTER_PRICE_ITEMS: **${sweep.masterPriceItems}** records (82 material / 36 labor / 37 equipment)  `);
lines.push(`Calculators with \`defaultAhspCode\`: **${sweep.countsWithDefaultAhspCode}/${sweep.totalCalculators}**  `);
lines.push(`Calculators with \`defaultUnitPrice\`: **${sweep.countsWithDefaultUnitPrice}/${sweep.totalCalculators}**`);
lines.push('');
lines.push('## Classification summary');
lines.push('');
lines.push('| Classification | Count | Meaning |');
lines.push('|---|---|---|');
const meaning: Record<string, string> = {
  ZERO_PRICE: 'UI renders Rp 0',
  BORONGAN_FALLBACK: 'Unit price invented in UI from calculator title keyword',
  HARDCODED_FALLBACK: 'At least one component priced from a hardcoded UI constant',
  PRICE_DB_MATCH: 'All components resolved from MASTER_PRICE_ITEMS',
  NO_OUTPUT: 'calculate() threw',
};
for (const [k, v] of Object.entries(sweep.byClassification)) lines.push(`| ${k} | ${v} | ${meaning[k] || ''} |`);
lines.push('');

lines.push('## Full inventory');
lines.push('');
lines.push('Columns: `calculator_id` | `pack` | `primary_unit` | `qty` | `mat/lab/eqp lines` | `AHSP code` | `defaultUnitPrice` | `implied unit price` | `grand total` | `pricing source`');
lines.push('');
for (const pack of Object.keys(byPack).sort((a, b) => packOrder.indexOf(a) - packOrder.indexOf(b))) {
  const items = byPack[pack].sort((a, b) => a.id.localeCompare(b.id));
  lines.push(`### pack: \`${pack}\` (${items.length})`);
  lines.push('');
  lines.push('| calculator_id | unit | qty | mat/lab/eqp | AHSP code | defaultUnitPrice | implied Rp/unit | grand total | pricing source |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const r of items) {
    const src = r.classification === 'BORONGAN_FALLBACK'
      ? `BORONGAN ${r.fallbackUnitPriceUsed} (from title)`
      : r.classification === 'ZERO_PRICE'
        ? 'NONE — Rp 0'
        : [...new Set(r.hardcodedBranches as string[])].join(' + ');
    lines.push(`| \`${r.id}\` | ${r.primaryUnit} | ${r.primaryQuantity} | ${r.materialLines}/${r.laborLines}/${r.equipmentLines} | ${r.ahspCode || '**none**'} | ${r.defaultUnitPrice ?? '**none**'} | ${Math.round(r.impliedUnitPrice).toLocaleString('id-ID')} | ${Math.round(r.grandTotal).toLocaleString('id-ID')} | ${src} |`);
  }
  lines.push('');
}

lines.push('## Calculators named in the audit brief — explicit status');
lines.push('');
const briefRequired: [string, string][] = [
  ['Weir Body', 'weir.body'],
  ['Weir Crest & Spillway', 'weir.spillway'],
  ['Upstream / Downstream Apron', 'weir.apron'],
  ['Stilling Basin', 'weir.stilling_basin'],
  ['Weir Wing Wall', 'weir.wing_wall'],
  ['Flushing Sluice Gate', 'weir.flushing_gate'],
  ['Weir Foundation Excavation', 'weir.excavation'],
  ['Weir Backfill', 'weir.backfill'],
  ['Weir Concrete Works', 'weir.concrete'],
  ['Weir Formwork', 'weir.formwork'],
  ['Drainage', 'drainage.outlet'],
  ['U-Ditch', 'drainage.u_ditch'],
  ['Box Culvert', 'drainage.box_culvert'],
  ['Pipe Culvert', 'drainage.pipe_culvert'],
  ['Road', 'road.geometry'],
  ['Bridge', 'bridge.deck'],
  ['Building', 'building.structure.kolom'],
  ['Irrigation', 'irrigation.lining'],
  ['Dam', 'dam.body'],
  ['Embung', 'embung.body'],
  ['Water Structure', 'waterStructure.retaining_wall'],
];
lines.push('| brief name | resolved id | found? | unit | qty | AHSP code | implied Rp/unit | grand total | pricing source |');
lines.push('|---|---|---|---|---|---|---|---|---|');
const knownIds = new Set(rows.map(r => r.id));
for (const [label, id] of briefRequired) {
  const r = rows.find(x => x.id === id);
  if (!r) {
    const near = rows.filter(x => x.id.includes(id.split('.')[1] || '###')).map(x => x.id).slice(0, 4);
    lines.push(`| ${label} | \`${id}\` | **NOT FOUND** | - | - | - | - | - | (near matches: ${near.join(', ') || 'none'}) |`);
    continue;
  }
  const src = r.classification === 'BORONGAN_FALLBACK'
    ? `BORONGAN ${r.fallbackUnitPriceUsed}`
    : r.classification === 'ZERO_PRICE' ? 'NONE — Rp 0' : [...new Set(r.hardcodedBranches as string[])].join(' + ');
  lines.push(`| ${label} | \`${r.id}\` | yes | ${r.primaryUnit} | ${r.primaryQuantity} | ${r.ahspCode || '**none**'} | ${Math.round(r.impliedUnitPrice).toLocaleString('id-ID')} | ${Math.round(r.grandTotal).toLocaleString('id-ID')} | ${src} |`);
}

lines.push('');
lines.push('## Unresolved brief ids — what actually exists');
lines.push('');
lines.push(rows.filter(r => /^(weir|dam|embung|waterStructure)\./.test(r.id)).map(r => `\`${r.id}\``).join(', '));
lines.push('');

fs.writeFileSync(path.join(process.cwd(), 'docs', '_audit', 'calculator-inventory.md'), lines.join('\n'));
console.log('written docs/_audit/calculator-inventory.md');
console.log('rows:', rows.length, ' packs:', Object.keys(byPack).length);
const weir = rows.filter(r => r.pack === 'weir' || r.pack === 'dam' || r.pack === 'embung');
console.log('\nweir/dam/embung calculators:');
for (const r of weir) console.log(`  ${r.id.padEnd(34)} ${r.primaryUnit.padEnd(4)} qty=${String(r.primaryQuantity).padStart(10)} ahsp=${r.ahspCode || 'none'} impl=${Math.round(r.impliedUnitPrice).toLocaleString('id-ID')} cls=${r.classification}`);

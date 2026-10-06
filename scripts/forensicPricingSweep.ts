/**
 * EZRAB PRICING ENGINE — FULL REGISTRY PRICING SWEEP (PHASE 0 AUDIT, READ-ONLY)
 *
 * Menjalankan SETIAP calculator terdaftar dengan nilai default-nya, lalu
 * mereplikasi logika harga UI (QtoCalculatorView.priceBreakdown) untuk
 * mengklasifikasi setiap calculator:
 *
 *   - ZERO_PRICE        : grand total = Rp 0
 *   - HARDCODED_FALLBACK: harga berasal dari konstanta hardcoded di UI
 *   - PRICE_DB_MATCH    : harga berasal dari MASTER_PRICE_ITEMS (155 item)
 *   - BORONGAN_FALLBACK : blok fallback baris 945-978 aktif
 *
 * Hasil ditulis ke docs/_audit/pricing-sweep.json untuk dipakai laporan audit.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { CoreCalculatorRegistry } from '../src/engine/calculatorCore/registry/calculatorRegistry';
import { MASTER_PRICE_ITEMS } from '../src/data/indonesianPrices';

type Class = 'ZERO_PRICE' | 'HARDCODED_FALLBACK' | 'PRICE_DB_MATCH' | 'BORONGAN_FALLBACK' | 'NO_OUTPUT';

interface Row {
  id: string;
  pack: string;
  name: string;
  primaryQuantity: number;
  primaryUnit: string;
  materialLines: number;
  laborLines: number;
  equipmentLines: number;
  grandTotal: number;
  impliedUnitPrice: number;
  classification: Class;
  hardcodedBranches: string[];
  fallbackUnitPriceUsed?: number;
  hasDefaultAhspCode: boolean;
  ahspCode?: string;
  hasDefaultUnitPrice: boolean;
  defaultUnitPrice?: number;
}

function findPriceItem(name: string, category: string) {
  return (MASTER_PRICE_ITEMS as any[]).find(
    (p) =>
      p.category === category &&
      (p.name.toLowerCase().includes(name.toLowerCase()) ||
        name.toLowerCase().includes(p.name.toLowerCase()))
  );
}

function uiMaterialDefaultPrice(name: string, unitPriceEstimate?: number) {
  const match = findPriceItem(name, 'MATERIAL');
  if (match) return { price: match.price, branch: null as string | null };

  let price: number;
  let branch: string;
  if (name.includes('Besi')) { price = 14500; branch = "includes('Besi')"; }
  else if (name.includes('Kawat')) { price = 28000; branch = "includes('Kawat')"; }
  else if (name.includes('Kayu papan')) { price = 3200000; branch = "includes('Kayu papan')"; }
  else if (name.includes('Paku')) { price = 22000; branch = "includes('Paku')"; }
  else if (name.includes('Minyak')) { price = 18000; branch = "includes('Minyak')"; }
  else if (name.includes('Semen')) { price = 72000; branch = "includes('Semen')"; }
  else if (name.includes('Pasir beton') || name.includes('Pasir pasang')) { price = 320000; branch = "includes('Pasir beton'|'Pasir pasang')"; }
  else if (name.includes('Batu split')) { price = 360000; branch = "includes('Batu split')"; }
  else if (name.includes('Air')) { price = 120; branch = "includes('Air')"; }
  else if (name.includes('Bata Ringan')) { price = 750000; branch = "includes('Bata Ringan')"; }
  else if (name.includes('Batu Belah')) { price = 295000; branch = "includes('Batu Belah')"; }
  else { price = unitPriceEstimate || 50000; branch = 'FALLBACK_50000'; }
  return { price, branch };
}

const rows: Row[] = [];

for (const spec of CoreCalculatorRegistry.list()) {
  const s = spec as any;
  const inputs: Record<string, number> = {};
  for (const p of s.parameters || []) {
    if (p.defaultValue !== undefined) inputs[p.id] = p.defaultValue;
  }

  let out: any;
  try {
    out = spec.calculate(inputs);
  } catch (e: any) {
    rows.push({
      id: s.id, pack: s.pack || '-', name: s.name,
      primaryQuantity: 0, primaryUnit: s.primaryUnit || '-',
      materialLines: 0, laborLines: 0, equipmentLines: 0,
      grandTotal: -1, impliedUnitPrice: -1,
      classification: 'NO_OUTPUT',
      hardcodedBranches: [`THROW: ${e?.message || e}`],
      hasDefaultAhspCode: !!s.defaultAhspCode,
      ahspCode: s.defaultAhspCode,
      hasDefaultUnitPrice: s.defaultUnitPrice !== undefined,
      defaultUnitPrice: s.defaultUnitPrice,
    });
    continue;
  }

  let subtotalLabor = 0;
  for (const l of out.labor || []) {
    subtotalLabor += l.hoursOrDays * (l.rateEstimate || (l.role.includes('Pekerja') ? 100000 : l.role.includes('Tukang') ? 145000 : l.role.includes('Kepala') ? 175000 : 200000));
  }

  const branches: string[] = [];
  let subtotalMaterials = 0;
  for (const m of out.materials || []) {
    const { price, branch } = uiMaterialDefaultPrice(m.name, m.unitPriceEstimate);
    if (branch) branches.push(branch);
    subtotalMaterials += m.quantity * price;
  }

  const equipList = out.equipment || [];
  let subtotalEquipment = 0;
  for (const eq of equipList) {
    const match = findPriceItem(eq.name, 'EQUIPMENT');
    subtotalEquipment += eq.quantity * (match ? match.price : (eq.unitPriceEstimate || 45000));
  }

  let grandTotal = subtotalLabor + subtotalMaterials + subtotalEquipment;
  let fallbackUnitPriceUsed: number | undefined;
  let classification: Class =
    branches.length > 0 ? 'HARDCODED_FALLBACK'
    : (subtotalMaterials > 0 || subtotalLabor > 0 || subtotalEquipment > 0) ? 'PRICE_DB_MATCH'
    : 'ZERO_PRICE';

  if (grandTotal === 0 && out.primaryQuantity > 0) {
    const calcName = String(s.title || s.name || '').toLowerCase();
    let fup = 150000;
    if (calcName.includes('galian') || calcName.includes('cut')) fup = 85000;
    else if (calcName.includes('urugan') || calcName.includes('fill')) fup = 120000;
    else if (calcName.includes('beton') || calcName.includes('cor') || calcName.includes('lantai kerja')) fup = 1200000;
    else if (calcName.includes('besi') || calcName.includes('tulangan')) fup = 18000;
    else if (calcName.includes('bekisting')) fup = 175000;
    else if (calcName.includes('pondasi') || calcName.includes('pasangan') || calcName.includes('bata')) fup = 145000;
    else if (calcName.includes('plesteran') || calcName.includes('acian')) fup = 65000;
    else if (calcName.includes('atap') || calcName.includes('baja')) fup = 250000;
    else if (calcName.includes('plafond') || calcName.includes('plafon')) fup = 135000;
    else if (calcName.includes('keramik') || calcName.includes('lantai')) fup = 220000;
    else if (calcName.includes('pengecatan') || calcName.includes('cat')) fup = 45000;
    else if (calcName.includes('pintu') || calcName.includes('jendela')) fup = 3500000;
    else if (calcName.includes('sanitasi') || calcName.includes('pipa') || calcName.includes('drainase')) fup = 250000;
    else if (calcName.includes('listrik') || calcName.includes('kabel')) fup = 350000;
    else if (calcName.includes('jalan') || calcName.includes('paving')) fup = 185000;
    fallbackUnitPriceUsed = fup;
    grandTotal = out.primaryQuantity * fup;
    classification = 'BORONGAN_FALLBACK';
  }

  rows.push({
    id: s.id, pack: s.pack || '-', name: s.name,
    primaryQuantity: out.primaryQuantity,
    primaryUnit: out.primaryUnit,
    materialLines: (out.materials || []).length,
    laborLines: (out.labor || []).length,
    equipmentLines: (out.equipment || []).length,
    grandTotal,
    impliedUnitPrice: out.primaryQuantity > 0 ? grandTotal / out.primaryQuantity : 0,
    classification,
    hardcodedBranches: [...new Set(branches)],
    fallbackUnitPriceUsed,
    hasDefaultAhspCode: !!s.defaultAhspCode,
    ahspCode: s.defaultAhspCode,
    hasDefaultUnitPrice: s.defaultUnitPrice !== undefined,
    defaultUnitPrice: s.defaultUnitPrice,
  });
}

// ---------- report ----------
const total = rows.length;
const byClass: Record<string, Row[]> = {};
for (const r of rows) (byClass[r.classification] ||= []).push(r);

console.log('='.repeat(80));
console.log(`EZRAB PRICING SWEEP — ${total} calculator terdaftar di CoreCalculatorRegistry`);
console.log('='.repeat(80));
for (const k of ['ZERO_PRICE', 'BORONGAN_FALLBACK', 'HARDCODED_FALLBACK', 'PRICE_DB_MATCH', 'NO_OUTPUT']) {
  const n = (byClass[k] || []).length;
  console.log(`  ${k.padEnd(20)} : ${String(n).padStart(4)}  (${((n / total) * 100).toFixed(1)}%)`);
}

console.log(`\n  punya defaultAhspCode : ${rows.filter((r) => r.hasDefaultAhspCode).length}/${total}`);
console.log(`  punya defaultUnitPrice: ${rows.filter((r) => r.hasDefaultUnitPrice).length}/${total}`);

console.log('\n--- ZERO_PRICE (UI menampilkan Rp 0) ---');
for (const r of byClass['ZERO_PRICE'] || []) {
  console.log(`  ${r.id.padEnd(42)} qty=${String(r.primaryQuantity).padStart(12)} ${r.primaryUnit.padEnd(4)} mat=${r.materialLines} lab=${r.laborLines} eq=${r.equipmentLines}`);
}

console.log('\n--- BORONGAN_FALLBACK (harga dikarang di UI dari judul calculator) ---');
const fupCount: Record<string, number> = {};
for (const r of byClass['BORONGAN_FALLBACK'] || []) fupCount[String(r.fallbackUnitPriceUsed)] = (fupCount[String(r.fallbackUnitPriceUsed)] || 0) + 1;
console.log('  distribusi fallbackUnitPrice:', fupCount);
for (const r of (byClass['BORONGAN_FALLBACK'] || []).slice(0, 40)) {
  console.log(`  ${r.id.padEnd(42)} ${r.primaryQuantity} ${r.primaryUnit.padEnd(4)} -> Rp ${Math.round(r.fallbackUnitPriceUsed!).toLocaleString('id-ID')}/${r.primaryUnit} = Rp ${Math.round(r.grandTotal).toLocaleString('id-ID')}`);
}
if ((byClass['BORONGAN_FALLBACK'] || []).length > 40) {
  console.log(`  ... dan ${byClass['BORONGAN_FALLBACK'].length - 40} lainnya (lihat JSON)`);
}

console.log('\n--- HARDCODED_FALLBACK (sebagian harga dari konstanta UI) ---');
const branchCount: Record<string, number> = {};
for (const r of byClass['HARDCODED_FALLBACK'] || []) for (const b of r.hardcodedBranches) branchCount[b] = (branchCount[b] || 0) + 1;
console.log('  distribusi branch:', branchCount);
for (const r of (byClass['HARDCODED_FALLBACK'] || []).slice(0, 60)) {
  console.log(`  ${r.id.padEnd(42)} ${r.materialLines} mat-line -> ${r.hardcodedBranches.join(', ')}`);
}
if ((byClass['HARDCODED_FALLBACK'] || []).length > 60) {
  console.log(`  ... dan ${byClass['HARDCODED_FALLBACK'].length - 60} lainnya (lihat JSON)`);
}

const outDir = path.join(process.cwd(), 'docs', '_audit');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'pricing-sweep.json');
fs.writeFileSync(outPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  totalCalculators: total,
  byClassification: Object.fromEntries(Object.entries(byClass).map(([k, v]) => [k, v.length])),
  countsWithDefaultAhspCode: rows.filter((r) => r.hasDefaultAhspCode).length,
  countsWithDefaultUnitPrice: rows.filter((r) => r.hasDefaultUnitPrice).length,
  masterPriceItems: (MASTER_PRICE_ITEMS as any[]).length,
  rows,
}, null, 2));
console.log(`\n>> JSON lengkap: ${path.relative(process.cwd(), outPath)}`);

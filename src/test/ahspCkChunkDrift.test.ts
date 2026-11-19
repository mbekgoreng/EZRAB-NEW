/**
 * EZRAB — AHSP R2 CK CHUNK DRIFT GUARD (Phase 2 Workstream 2, 2026-11-19)
 *
 * Mengunci perbaikan R014 "Hanger + Support" dan membuktikan sumber kanonis
 * CK dan modul runtime chunked tidak bisa drift diam-diam lagi.
 *
 * Latar: `lolt` (typo unit) hidup di
 * src/data/nationalCostDatabase/ckPriceChunks/materials03.ts sementara sumber
 * kanonis data/ahsp2026/excel_extracted/upah_bahan.json sudah benar (`lot`)
 * sejak R2 — karena tidak ada generator in-repo untuk layout chunked, modul
 * runtime tidak pernah diregenerasi. Generator kini ada:
 * scripts/ahsp2026/generateCkPriceChunks.py. Suite ini adalah penjaga
 * drift-nya: bila kanonis berubah tanpa regenerasi (atau sebaliknya),
 * suite ini gagal dengan nama baris pertama yang berbeda.
 *
 * Jalankan: npx --yes tsx src/test/ahspCkChunkDrift.test.ts
 * (skrip asersi tsx polos — BUKAN vitest; "No test suite found" di vitest
 * adalah keterbatasan harness, bukan regresi.)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OFFICIAL_CK_2026_EQUIPMENT,
  OFFICIAL_CK_2026_LABOR,
  OFFICIAL_CK_2026_MATERIALS,
} from '../data/nationalCostDatabase/officialCiptaKaryaPrices2026';
import { officialAhspRepository } from '../data/nationalCostDatabase/officialAhspRepository';
import { priceResolver2026 } from '../data/priceDatabase2026/resolver';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: string) {
  if (cond) {
    pass++;
    console.log(`  PASS ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

type CkEntry = { code: string; name: string; unit: string; price: number };

/** Aturan filter yang SAMA dengan generateCkPriceChunks.py / generateCiptaKaryaPricesModule.py. */
function isClean(entry: any): boolean {
  const name = String(entry?.name ?? '').trim();
  const price = entry?.price;
  if (!name || ['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(name)) return false;
  if (['uraian', 'satuan', 'harga', 'jumlah'].includes(name.toLowerCase())) return false;
  if (typeof price !== 'number' || !(price > 0)) return false;
  return true;
}

function canon(entry: any): CkEntry {
  return {
    code: entry?.code ?? '',
    name: entry?.name ?? '',
    unit: entry?.unit ?? '',
    price: entry?.price,
  };
}

const UB_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../data/ahsp2026/excel_extracted/upah_bahan.json',
);
const ub = JSON.parse(readFileSync(UB_PATH, 'utf-8')) as Record<string, any[]>;

// ---------------------------------------------------------------------------
// 1. Drift guard: kanonis (terfilter) == runtime, urutan + nilai persis.
// ---------------------------------------------------------------------------
console.log('1. Kanonis vs runtime chunked (drift guard)');
const cases: Array<[string, CkEntry[], any[]]> = [
  ['labor', OFFICIAL_CK_2026_LABOR as CkEntry[], ub.labor],
  ['materials', OFFICIAL_CK_2026_MATERIALS as CkEntry[], ub.materials],
  ['equipment', OFFICIAL_CK_2026_EQUIPMENT as CkEntry[], ub.equipment],
];
const expectedClean: Record<string, number> = { labor: 44, materials: 3075, equipment: 204 };
for (const [kind, runtime, source] of cases) {
  const clean = source.filter(isClean).map(canon);
  check(
    `${kind}: jumlah kanonis terfilter = ${expectedClean[kind]}`,
    clean.length === expectedClean[kind],
    `dapat ${clean.length} — data kanonis berubah; perbarui generator + ekspektasi ini secara sadar`,
  );
  check(
    `${kind}: jumlah runtime = jumlah kanonis terfilter`,
    runtime.length === clean.length,
    `runtime ${runtime.length} vs kanonis ${clean.length}`,
  );
  let firstDiff = -1;
  let diffDetail = '';
  const n = Math.min(runtime.length, clean.length);
  for (let i = 0; i < n; i++) {
    const r = runtime[i];
    const c = clean[i];
    if (r.code !== c.code || r.name !== c.name || r.unit !== c.unit || r.price !== c.price) {
      firstDiff = i;
      diffDetail = `idx ${i}: runtime ${JSON.stringify(r)} vs kanonis ${JSON.stringify(c)}`;
      break;
    }
  }
  check(`${kind}: semua ${n} baris identik urutan + nilai`, firstDiff === -1, diffDetail);
}

// ---------------------------------------------------------------------------
// 2. R014 pin: Hanger + Support.
// ---------------------------------------------------------------------------
console.log('2. R014 Hanger + Support');
const hangerRuntime = (OFFICIAL_CK_2026_MATERIALS as CkEntry[]).filter(
  (e) => e.name === 'Hanger + Support',
);
check('runtime punya tepat 1 Hanger + Support', hangerRuntime.length === 1, `dapat ${hangerRuntime.length}`);
if (hangerRuntime.length === 1) {
  check('unit runtime = lot', hangerRuntime[0].unit === 'lot', `dapat ${hangerRuntime[0].unit}`);
  check('harga runtime = 55000', hangerRuntime[0].price === 55000, `dapat ${hangerRuntime[0].price}`);
}
const allRuntime = [
  ...(OFFICIAL_CK_2026_MATERIALS as CkEntry[]),
  ...(OFFICIAL_CK_2026_LABOR as CkEntry[]),
  ...(OFFICIAL_CK_2026_EQUIPMENT as CkEntry[]),
];
check(
  "tidak ada unit hantu 'lolt' di runtime CK",
  !allRuntime.some((e) => e.unit === 'lolt'),
  `ditemukan: ${allRuntime.filter((e) => e.unit === 'lolt').map((e) => e.name).join(', ')}`,
);

const lotRes: any = priceResolver2026.resolveResourcePrice({
  resourceName: 'Hanger + Support',
  resourceType: 'material',
  unit: 'lot',
  domain: 'CIPTA_KARYA',
});
check('resolver lot → RESOLVED', lotRes.status === 'RESOLVED', `dapat ${lotRes.status}`);
check('resolver lot → Rp55000', lotRes.price === 55000, `dapat ${lotRes.price}`);
check(
  'resolver lot → EXACT_SOURCE_ID',
  lotRes.matchMethod === 'EXACT_SOURCE_ID',
  `dapat ${lotRes.matchMethod}`,
);
const typoRes: any = priceResolver2026.resolveResourcePrice({
  resourceName: 'Hanger + Support',
  resourceType: 'material',
  unit: 'lolt',
  domain: 'CIPTA_KARYA',
});
check('resolver lolt → NOT_FOUND (typo tidak lagi resolve)', typoRes.status === 'NOT_FOUND', `dapat ${typoRes.status}`);
check('resolver lolt → price null', typoRes.price === null, `dapat ${typoRes.price}`);

// ---------------------------------------------------------------------------
// 3. Ke-16 item 5.5.3.1–5.5.3.16: baris Hanger live-resolved Rp55000.
//    Total unitPrice dipin (nilai pasca-perbaikan, terverifikasi 2026-11-19);
//    bila total bergerak, itu perubahan harga nyata yang wajib dijelaskan.
// ---------------------------------------------------------------------------
console.log('3. Komposisi 5.5.3.1–5.5.3.16');
const expectedTotals: Record<string, number> = {
  '5.5.3.1': 522255,
  '5.5.3.2': 642255,
  '5.5.3.3': 762255,
  '5.5.3.4': 882255,
  '5.5.3.5': 1242255,
  '5.5.3.6': 624410,
  '5.5.3.7': 744410,
  '5.5.3.8': 864410,
  '5.5.3.9': 984410,
  '5.5.3.10': 1464410,
  '5.5.3.11': 754390,
  '5.5.3.12': 874390,
  '5.5.3.13': 994390,
  '5.5.3.14': 1114390,
  '5.5.3.15': 1606390,
  '5.5.3.16': 571120,
};
for (let i = 1; i <= 16; i++) {
  const code = `5.5.3.${i}`;
  const item: any = (officialAhspRepository as any).getOfficialAhsp?.(code);
  check(`${code} ada di repository`, item !== undefined && item !== null);
  if (!item) continue;
  const comp: any = priceResolver2026.resolveAhspUnitPrice(item);
  const hanger = (comp.material?.components ?? []).filter(
    (c: any) => c.itemName === 'Hanger + Support',
  );
  check(`${code} status FULL`, comp.pricingStatus === 'FULL', `dapat ${comp.pricingStatus}`);
  check(
    `${code} unitPrice = ${expectedTotals[code]}`,
    comp.unitPrice === expectedTotals[code],
    `dapat ${comp.unitPrice}`,
  );
  check(`${code} tepat 1 baris Hanger`, hanger.length === 1, `dapat ${hanger.length}`);
  if (hanger.length === 1) {
    const h = hanger[0];
    check(
      `${code} Hanger live Rp55000/lot coef 1`,
      h.resolved === true &&
        h.unitPrice === 55000 &&
        h.unit === 'lot' &&
        h.coefficient === 1 &&
        h.subtotalPerUnit === 55000,
      `dapat ${JSON.stringify({ resolved: h.resolved, unitPrice: h.unitPrice, unit: h.unit, coef: h.coefficient, subtotal: h.subtotalPerUnit })}`,
    );
    check(
      `${code} Hanger via LIVE_MASTER_PRICE + EXACT_SOURCE_ID (bukan baked fallback)`,
      h.pricingMode === 'LIVE_MASTER_PRICE' && h.matchMethod === 'EXACT_SOURCE_ID',
      `dapat ${h.pricingMode} / ${h.matchMethod}`,
    );
  }
}

console.log(`\n${pass} lulus, ${fail} gagal`);
if (fail > 0) process.exit(1);

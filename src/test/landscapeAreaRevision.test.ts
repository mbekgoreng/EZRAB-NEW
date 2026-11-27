/**
 * D1 — Revisi ukuran menembus draf (lapisan bersama, multi-kategori).
 *
 * Akar masalah (2026-11-26, kasus live landscape): `extractScopeSpecs`
 * (universalRab.ts) memakai first-wins per (scope, ukuran), dan
 * penyebutan revisi "hanya 895 m2" teratribusi ke scope `demolisi`
 * (kata kunci terdekat) sehingga `lanskap` tetap 10.000 m² dan draf
 * memakai park_area = 10.000 (total Rp766.440.180, bukan revisi).
 *
 * Perbaikan (lapisan bersama, bukan patch landscape — Opsi B):
 *  1. `set()` di `extractScopeSpecs` TETAP first-wins (last-wins murni
 *     DITOLAK: penyebutan linear telanjang mencakup angka lebar/tinggi
 *     sehingga last-wins merusak total pin jalan/pagar/retaining wall).
 *  2. `setRev()`: penyebutan bertanda revisi ("revisi/ubah/koreksi/
 *     ternyata/menjadi/jadi/hanya" dalam ±48 karakter) MENIMPA nilai
 *     scope teratribusi; bila scope itu belum memegang ukuran tersebut
 *     sementara scope lain sudah, revisi dialihkan ke pemegang terdekat.
 *  3. `extractRabNeeds` (rabNeeds.ts): pola luas bangunan menerima
 *     "jadi"/"menjadi" antara jangkar dan angka — revisi luas rumah
 *     ("luas bangunan jadi 150 m2") sebelumnya diabaikan.
 *
 * Rumah TIDAK lewat `scopeSpecs` (kata 'rumah' bukan keyword scope
 * `gedung` — SCOPE_GROUPS universalRab.ts — dan draf rumah dibangun
 * jalur direct `buildDirectRab`, bukan part universal); revisi rumah
 * dipin lewat jalur direct itu (totalArea + floors).
 *
 * Jalankan: npx --yes tsx src/test/landscapeAreaRevision.test.ts
 * (skrip asersi tsx polos — BUKAN vitest.)
 */
import { extractProjectContext } from '../ai-tools/ezrab-ai/projectIntake';
import {
  buildUniversalDraft, computeTotals, effectiveItems, extractUniversalSpec, pricedAmount,
} from '../ai-tools/ezrab-ai/universalRab';
import { buildDirectRab } from '../ai-tools/ezrab-ai/directRab';
import { extractRabNeeds } from '../ai-tools/ezrab-ai/rabNeeds';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: unknown): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else {
    failed++; failures.push(name);
    console.log(`  ✗ ${name}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
  }
}
const close = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

/* ------------------------------------------------------------------ */
/* 1 — Kasus live landscape (owner): 1 hektar → revisi 895 m²         */
/* ------------------------------------------------------------------ */
console.log('== 1 — Landscape live: 1 hektar → revisi hanya 895 m2 ==');
{
  const turns = [
    'Saya mau buat RAB landscape, dana 50 juta, luas 1 hektar',
    'Taman publik',
    'jogging track, playground, area parkir',
    'lahan perlu dibongkar, jadi termasuk revitalisasi',
    'revisi ternyata untuk luas hanya 895 m2',
  ];
  let ctx: ReturnType<typeof extractProjectContext> | null = null;
  for (const t of turns) ctx = extractProjectContext(t, ctx ?? undefined);
  check('1.1 ctx.landAreaM2 === 895 sesudah revisi', ctx!.landAreaM2 === 895, ctx!.landAreaM2);
  const text = `${ctx!.combinedText} (luas 895 m2)`;
  const spec = extractUniversalSpec(text);
  check('1.2 spec.scopeSpecs.lanskap.areaM2 === 895', spec.scopeSpecs['lanskap']?.areaM2 === 895, spec.scopeSpecs);
  check('1.3 revisi TIDAK bocor ke demolisi', spec.scopeSpecs['demolisi']?.areaM2 == null, spec.scopeSpecs);
  check('1.4 spec.areaM2 === 895 (global last-wins)', spec.areaM2 === 895, spec.areaM2);
  const res = buildUniversalDraft(text, 'LAND-URBAN-PARK', { projectId: null });
  check('1.5 draft terbentuk', res.kind === 'draft', res.kind);
  if (res.kind === 'draft') {
    const d = res.draft;
    check('1.6 park_area === 895', d.parts[0].evaluatedParams.park_area === 895, d.parts[0].evaluatedParams);
    check('1.7 num_trees === 45 (default template, TIDAK diubah)', d.parts[0].evaluatedParams.num_trees === 45, d.parts[0].evaluatedParams);
    check('1.8 path_length === 380 (default template, TIDAK diubah)', d.parts[0].evaluatedParams.path_length === 380, d.parts[0].evaluatedParams);
    const items = effectiveItems(d);
    check('1.9 7 item efektif', items.length === 7, items.length);
    const vols = [895, 671.25, 71.6, 76, 45, 31.67, 1.99];
    // Item ⑥ lampu dekoratif = path_length/12 = 380/12 = 31.67 (2 desimal).
    items.forEach((it, i) => {
      check(`1.10.${i + 1} volume item ${i + 1} = ${vols[i]}`, close(it.volume, vols[i], 0.01), it.volume);
      if (it.unitPrice != null) {
        check(`1.11.${i + 1} amount = volume × unitPrice`, close(pricedAmount(it) ?? 0, it.volume * it.unitPrice), `${pricedAmount(it)} vs ${it.volume * it.unitPrice}`);
      }
    });
    check('1.12 item ④ unitPrice AHSP Rp1.236.055 (pin harga resolver)', items[3].unitPrice === 1236055, items[3].unitPrice);
    const t = computeTotals(d);
    check('1.13 estimatedTotal Rp229.928.055', close(t.estimatedTotal, 229928055), t.estimatedTotal);
    check('1.14 verifiedTotal Rp99.310.180 (OFFICIAL ①+④)', close(t.verifiedTotal, 99310180), t.verifiedTotal);
    check('1.15 marketTotal Rp130.617.875 (②+③+⑤)', close(t.marketTotal, 130617875), t.marketTotal);
    check('1.16 unpricedCount === 2, status PARSIAL', t.unpricedCount === 2 && t.status === 'PARSIAL', `${t.unpricedCount}/${t.status}`);
    check('1.17 asumsi "Luas Taman = 895 m² (dari pesan Anda)"', d.assumptions.some((a) => a.includes('Luas Taman = 895 m² (dari pesan Anda)')), d.assumptions.join(' | '));
    check('1.18 asumsi TIDAK mengandung 10000', !d.assumptions.join(' ').includes('10000'), d.assumptions.join(' | '));
    check('1.19 total TIDAK dipin ≤ budget (229jt > 50jt adalah ekspektasi)', t.estimatedTotal > 50_000_000, t.estimatedTotal);
  }
}

/* ------------------------------------------------------------------ */
/* 2 — Gedung / gudang (scope gedung, last-wins)                      */
/* ------------------------------------------------------------------ */
console.log('== 2 — Gedung & gudang ==');
{
  const g = extractUniversalSpec('Buat RAB gedung kantor luas 200 m2, revisi jadi 150 m2');
  check('2.1 gedung: scopeSpecs.gedung.areaM2 === 150', g.scopeSpecs['gedung']?.areaM2 === 150, g.scopeSpecs);
  const gd = buildUniversalDraft('Buat RAB gedung kantor luas 200 m2, revisi jadi 150 m2');
  check('2.2 gedung: draft building_area === 150',
    gd.kind === 'draft' && gd.draft.parts[0].evaluatedParams.building_area === 150,
    gd.kind === 'draft' ? gd.draft.parts[0].evaluatedParams : gd.kind);
  const w = extractUniversalSpec('Buat RAB gudang luas 200 m2, revisi jadi 150 m2');
  check('2.3 gudang: scopeSpecs.gedung.areaM2 === 150', w.scopeSpecs['gedung']?.areaM2 === 150, w.scopeSpecs);
  const wd = buildUniversalDraft('Buat RAB gudang luas 200 m2, revisi jadi 150 m2');
  check('2.4 gudang: draft warehouse_area === 150',
    wd.kind === 'draft' && wd.draft.parts[0].evaluatedParams.warehouse_area === 150,
    wd.kind === 'draft' ? wd.draft.parts[0].evaluatedParams : wd.kind);
}

/* ------------------------------------------------------------------ */
/* 3 — Jembatan: revisi bentang vs revisi panjang                     */
/* ------------------------------------------------------------------ */
console.log('== 3 — Jembatan ==');
{
  const s = extractUniversalSpec('Buat RAB jembatan beton bentang 12 m, revisi bentang 10 m');
  check('3.1 revisi bentang: spanM === 10', s.scopeSpecs['jembatan']?.spanM === 10, s.scopeSpecs);
  const sd = buildUniversalDraft('Buat RAB jembatan beton bentang 12 m, revisi bentang 10 m');
  check('3.2 revisi bentang: draft span_length === 10',
    sd.kind === 'draft' && sd.draft.parts[0].evaluatedParams.span_length === 10,
    sd.kind === 'draft' ? sd.draft.parts[0].evaluatedParams : sd.kind);
  const l = extractUniversalSpec('Buat RAB jembatan beton bentang 12 m panjang 30 m, revisi panjang jadi 25 m');
  check('3.3 revisi panjang: lengthM === 25', l.scopeSpecs['jembatan']?.lengthM === 25, l.scopeSpecs);
  check('3.4 revisi panjang: spanM TETAP 12 (panjang ≠ bentang)', l.scopeSpecs['jembatan']?.spanM === 12, l.scopeSpecs);
  const ld = buildUniversalDraft('Buat RAB jembatan beton bentang 12 m panjang 30 m, revisi panjang jadi 25 m');
  check('3.5 revisi panjang: draft span_length TETAP 12',
    ld.kind === 'draft' && ld.draft.parts[0].evaluatedParams.span_length === 12,
    ld.kind === 'draft' ? ld.draft.parts[0].evaluatedParams : ld.kind);
  // Pin yang sudah ada: jembatan tanpa bentang TETAP needs-spec walau
  // panjang diberikan — revisi panjang tidak boleh "menciptakan" bentang.
  const nl = extractUniversalSpec('Buat RAB jembatan panjang 30 m, revisi panjang jadi 25 m');
  check('3.6 tanpa bentang: spanM tetap null', nl.scopeSpecs['jembatan']?.spanM == null, nl.scopeSpecs);
  check('3.7 tanpa bentang: lengthM revisi === 25', nl.scopeSpecs['jembatan']?.lengthM === 25, nl.scopeSpecs);
  const nld = buildUniversalDraft('Buat RAB jembatan panjang 30 m, revisi panjang jadi 25 m');
  check('3.8 tanpa bentang: draft TETAP needs-spec', nld.kind === 'needs-spec', nld.kind);
}

/* ------------------------------------------------------------------ */
/* 4 — Dinding penahan tanah + drainase                               */
/* ------------------------------------------------------------------ */
console.log('== 4 — Dinding penahan & drainase ==');
{
  const r = extractUniversalSpec('Buat RAB dinding penahan tanah panjang 50 m tinggi 3 m, revisi panjang jadi 40 m');
  check('4.1 dinding penahan: lengthM revisi === 40', r.scopeSpecs['lanskap']?.lengthM === 40, r.scopeSpecs);
  const rd = buildUniversalDraft('Buat RAB dinding penahan tanah panjang 50 m tinggi 3 m, revisi panjang jadi 40 m');
  check('4.2 dinding penahan: draft wall_length === 40, wall_height === 3',
    rd.kind === 'draft' && rd.draft.parts[0].evaluatedParams.wall_length === 40 && rd.draft.parts[0].evaluatedParams.wall_height === 3,
    rd.kind === 'draft' ? rd.draft.parts[0].evaluatedParams : rd.kind);
  const dr = extractUniversalSpec('Buat RAB drainase panjang 500 m, revisi jadi 400 m');
  check('4.3 drainase: lengthM revisi === 400', dr.scopeSpecs['drainase']?.lengthM === 400, dr.scopeSpecs);
  const drd = buildUniversalDraft('Buat RAB drainase panjang 500 m, revisi jadi 400 m');
  check('4.4 drainase: draft channel_length === 400',
    drd.kind === 'draft' && drd.draft.parts[0].evaluatedParams.channel_length === 400,
    drd.kind === 'draft' ? drd.draft.parts[0].evaluatedParams : drd.kind);
}

/* ------------------------------------------------------------------ */
/* 5 — Rumah (jalur direct: buildDirectRab + extractRabNeeds)        */
/* ------------------------------------------------------------------ */
console.log('== 5 — Rumah (jalur direct) ==');
{
  const n1 = extractRabNeeds('Buat RAB rumah tipe 45 2 lantai luas bangunan 200 m2, revisi luas bangunan jadi 150 m2');
  check('5.1 rumah: needs.buildingArea === 150 (revisi)', n1.buildingArea === 150, n1.buildingArea);
  check('5.2 rumah: needs.floors === 2', n1.floors === 2, n1.floors);
  const d1 = buildDirectRab('Buat RAB rumah tipe 45 2 lantai luas bangunan 200 m2, revisi luas bangunan jadi 150 m2');
  check('5.3 rumah: direct totalArea === 150', d1?.totalArea === 150, d1?.totalArea);
  check('5.4 rumah: direct floors === 2', d1?.floors === 2, d1?.floors);
  check('5.5 rumah: direct items > 0 (draf terbentuk)', (d1?.calc?.items?.length ?? 0) > 0, d1?.calc?.items?.length);
  const n2 = extractRabNeeds('Buat RAB rumah tipe 36 2 lantai, revisi luas bangunan jadi 150 m2 dan 3 lantai');
  check('5.6 rumah: revisi luas + lantai → buildingArea 150', n2.buildingArea === 150, n2.buildingArea);
  check('5.7 rumah: revisi luas + lantai → floors 3', n2.floors === 3, n2.floors);
  const d2 = buildDirectRab('Buat RAB rumah tipe 36 2 lantai, revisi luas bangunan jadi 150 m2 dan 3 lantai');
  check('5.8 rumah: direct totalArea === 150, floors === 3', d2?.totalArea === 150 && d2?.floors === 3, { totalArea: d2?.totalArea, floors: d2?.floors });
}

console.log(`\nlandscapeAreaRevision: ${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join('; ')}` : ''}`);
if (failed > 0) process.exit(1);

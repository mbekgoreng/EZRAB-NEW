/**
 * P3B FULL REPAIR (2026-11-13) — kalkulasi RAB kanonis (B-11, §D #10).
 *
 * Menutup konflik B-11 audit Autonomous Estimation: DUA komputasi total
 * (pratinjau draft `computeTotals` vs engine kanonis
 * `recalculateCostSummary`) yang kesetaraannya belum dibuktikan.
 *
 * VERDIK (dibuktikan suite ini, BUKAN disatukan lewat kode):
 * - Keduanya menghitung BESARAN YANG BERBEDA menurut desain, dan kaki
 *   yang sama (biaya langsung) SETARA PERSIS: `estimatedTotal` pratinjau
 *   == `directCost` engine pada item yang sama — termasuk item
 *   PRICE_UNRESOLVED (dikecualikan di kedua sisi), item HSP (tetap masuk
 *   biaya langsung di kedua sisi; pengecualian HSP hanya mempersempit
 *   BASIS O&P di engine), dan item legacy tanpa priceStatus (resolved di
 *   kedua sisi). Bukti terkuat: round-trip draft nyata (jalan beton 1 km)
 *   preview → buildPushPayload → rabItemFactory → engine: selisih Rp0.
 * - Tangga O&P/pajak/kontingensi/markup HANYA ada di engine kanonis;
 *   pratinjau SENGAJA menampilkan biaya langsung saja (pesannya
 *   menyatakan "ESTIMASI di sini berarti total kuantitas × harga katalog
 *   per item"). Karena itu `estimatedTotal` != `grandTotal` bila proyek
 *   mengonfigurasi O&P/pajak — SELISIH INI DIUKUR (temuan terbuka
 *   P3B-O2), bukan bug yang diperbaiki diam-diam: draft tidak membawa
 *   konfigurasi proyek target, dan menampilkan grand total di pratinjau
 *   butuh keputusan owner + threading konfigurasi (menyentuh view.tsx —
 *   di luar pagar P3B).
 * - `computeTotals` TIDAK diganti engine: engine tidak menghitung ember
 *   sumber harga (resmi/database/pasar/manual) + status PARSIAL/ESTIMASI/
 *   LENGKAP yang menjadi isi pratinjau. Tidak ada implementasi ketiga.
 *
 * Cakupan suite:
 *  1. Kesetaraan kaki biaya langsung (fixture sintetis + draft nyata).
 *  2. Default O&P 0%/0% proyek baru; konfigurasi historis dipertahankan.
 *  3. Rekapitulasi memakai engine kanonis (koreksi klaim audit §D #10:
 *     view SUDAH mendelegasikan lewat computeRekapSummary sejak Batch 4
 *     — suite ini menguncinya + golden Premium Demo Rp1.089.879.733).
 *  4. Routing dua engine RAB (parametrik rumah vs katalog 183 template).
 *
 * Temuan terbuka yang DIUKUR (karakterisasi, bukan perilaku yang
 * diinginkan — ubah tes ini bila temuannya diperbaiki):
 *  P3B-O1: subtotal kategori Rekapitulasi memasukkan amount basi item
 *    PRICE_UNRESOLVED (selisih terukur Rp50.000 pada fixture), sementara
 *    tangga uang (directCost/grandTotal) benar mengecualikannya.
 *  P3B-O2: pratinjau universal (biaya langsung saja) vs grand total
 *    pasca-transfer pada proyek O&P 10/5 + PPN 11%: selisih terukur
 *    Rp962.717.700 pada draft jalan beton 1 km.
 *  P3B-O3: tangga parametrik rumah (O&P 5/5 + pajak 11% SELALU, default
 *    engine) vs tangga kanonis proyek baru (O&P 0/0, pajak opt-in):
 *    selisih terukur Rp46.087.768 pada RAB Type 70.
 *
 * Gaya plain-tsx (tanpa vitest — vitest tidak terinstal di sandbox):
 * jalankan dari ROOT repo: `npx --yes tsx src/test/p3bCanonicalCalculation.test.ts`
 */
import { strict as assert } from 'assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  buildUniversalDraft,
  computeTotals,
  totalsFromItems,
  effectiveItems,
  buildPushPayload,
  formatUniversalDraftMessage,
  type UniversalDraft,
} from '../ai-tools/ezrab-ai/universalRab';
import { buildDirectRab, findDirectTemplate } from '../ai-tools/ezrab-ai/directRab';
import { buildSpecRab } from '../ai-tools/ezrab-ai/specRab';
import { specRabHijackGuard, executeIntent, type ChatActionContext } from '../ai-tools/ezrab-ai/actionRegistry';
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';
import { createRabItemRecord } from '../engine/rab/rabItemFactory';
import { computeRekapSummary } from '../components/estimator/rekapSummary';
import { PREMIUM_DEMO_PROJECT, PREMIUM_DEMO_RAB_ITEMS } from '../data/premiumDemoData';
import type { RabItem, Project } from '../types';

// Mock localStorage untuk Node (pola universalRab.test.ts) —
// buildUniversalDraft/executeIntent menyentuh storage.
const storage: Record<string, string> = {};
(global as any).window = {
  localStorage: {
    getItem: (key: string) => storage[key] || null,
    setItem: (key: string, val: string) => { storage[key] = val; },
    removeItem: (key: string) => { delete storage[key]; },
    clear: () => { Object.keys(storage).forEach((k) => delete storage[k]); },
  },
};
(global as any).localStorage = (global as any).window.localStorage;

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  PASS ${name}`);
  } catch (e: any) {
    failed += 1;
    console.log(`  FAIL ${name}: ${e?.message ?? e}`);
  }
}
const eq = (a: unknown, b: unknown, msg: string) => {
  if (a !== b) throw new Error(`${msg} (dapat ${a}, harap ${b})`);
};

// ---------------------------------------------------------------- fixture
// Angka bulat (eksak di float) agar kesetaraan diuji PERSIS, bukan ±tol.
// Biaya langsung berharga: 1.000.000 + 1.000.000 + 300.000 + 500.000
// + 100.000 (legacy) = Rp2.900.000. Item E (UNRESOLVED) dikecualikan.
type DraftSideItem = {
  volume: number; unitPrice?: number | null; priceStatus?: string | null;
  priceSourceKind?: string | null; ahspMappingStatus?: string | null;
};
const FIXTURE_DRAFT: DraftSideItem[] = [
  { volume: 10, unitPrice: 100000, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'OFFICIAL_AHSP' }, // A HSP
  { volume: 5, unitPrice: 200000, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'OFFICIAL_AHSP' }, // B DIRECT
  { volume: 2, unitPrice: 150000, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'MARKET_REFERENCE' }, // C
  { volume: 1, unitPrice: 500000, priceStatus: 'PRICE_MANUAL' }, // D
  { volume: 3, unitPrice: 0, priceStatus: 'PRICE_UNRESOLVED' }, // E sentinel 0
  { volume: 4, unitPrice: 25000 }, // F legacy tanpa priceStatus/kind
];
const DIRECT = 2900000;
const mkRab = (over: Partial<RabItem> & Record<string, unknown>): RabItem =>
  ({ no: 1, projectId: 'p1', code: 'X', category: 'C', description: 'item', volume: 1, unit: 'ls', ...over } as unknown as RabItem);
const FIXTURE_RAB: RabItem[] = [
  mkRab({ id: 'a', amount: 1000000, volume: 10, unitPrice: 100000, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'OFFICIAL_AHSP', priceCostBasis: 'HSP' }),
  mkRab({ id: 'b', amount: 1000000, volume: 5, unitPrice: 200000, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'OFFICIAL_AHSP', priceCostBasis: 'DIRECT_COST' }),
  mkRab({ id: 'c', amount: 300000, volume: 2, unitPrice: 150000, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'MARKET_REFERENCE' }),
  mkRab({ id: 'd', amount: 500000, volume: 1, unitPrice: 500000, priceStatus: 'PRICE_MANUAL' }),
  mkRab({ id: 'e', amount: 0, volume: 3, unitPrice: 0, priceStatus: 'PRICE_UNRESOLVED' }),
  mkRab({ id: 'f', amount: 100000, volume: 4, unitPrice: 25000 }),
];
const proj = (over: Record<string, unknown>): Project =>
  ({ id: 'p1', name: 'P', sections: [], ...over } as unknown as Project);

function draftOf(text: string): UniversalDraft {
  const res = buildUniversalDraft(text);
  assert.equal(res.kind, 'draft', `diharapkan draft, dapat ${res.kind} untuk "${text}"`);
  if (res.kind !== 'draft') throw new Error('unreachable');
  return res.draft;
}
function ctxFor(rawText: string): ChatActionContext {
  return {
    navigate: () => undefined, rawText, currentMenu: 'chat-ai',
    activeProject: null, projects: [], projectTotal: null,
  } as unknown as ChatActionContext;
}

// ------------------------------------------------- 1. kesetaraan kaki langsung
console.log('== 1. Kesetaraan pratinjau vs engine kanonis (kaki biaya langsung) ==');

check('1.1 totalsFromItems fixture: ember + status benar', () => {
  const t = totalsFromItems(FIXTURE_DRAFT);
  eq(t.verifiedTotal, 2000000, 'RESMI = A+B');
  eq(t.marketTotal, 300000, 'pasar = C');
  eq(t.manualTotal, 500000, 'manual = D');
  eq(t.databaseTotal, 100000, 'database = F legacy tanpa kind');
  eq(t.estimatedTotal, DIRECT, 'estimatedTotal = biaya langsung berharga');
  eq(t.unpricedCount, 1, 'hanya E belum berharga');
  eq(t.status, 'PARSIAL', 'ada item belum berharga → PARSIAL');
});

check('1.2 engine directCost == estimatedTotal pratinjau; unresolved == unpriced', () => {
  const t = totalsFromItems(FIXTURE_DRAFT);
  const s = UnifiedProjectEngine.recalculateCostSummary(FIXTURE_RAB, {} as never);
  eq(s.directCost, t.estimatedTotal, 'directCost engine == estimatedTotal pratinjau');
  eq(s.unresolvedItems, t.unpricedCount, 'unresolved engine == unpriced pratinjau');
  eq(s.grandTotal, DIRECT, 'O&P 0% + pajak mati → grand == direct');
});

check('1.3 HSP: pratinjau tak berubah; engine hanya mempersempit basis O&P', () => {
  const t = totalsFromItems(FIXTURE_DRAFT);
  const s = UnifiedProjectEngine.recalculateCostSummary(FIXTURE_RAB, { overheadPercent: 10, profitPercent: 5 } as never);
  eq(s.directCost, t.estimatedTotal, 'item HSP tetap masuk directCost');
  eq(s.overheadAmount, 190000, 'OH 10% × (2.900.000 − 1.000.000 HSP)');
  eq(s.profitAmount, 95000, 'profit 5% × basis non-HSP');
  eq(s.grandTotal, 3185000, 'grand = direct + OH + profit');
});

check('1.4 PPN/PPh on: directCost tetap == estimatedTotal; pajak di atas subtotal', () => {
  const t = totalsFromItems(FIXTURE_DRAFT);
  const s = UnifiedProjectEngine.recalculateCostSummary(FIXTURE_RAB, {
    overheadPercent: 10, profitPercent: 5, ppnEnabled: true, taxPercent: 11, pphEnabled: true, pphPercent: 2,
  } as never);
  eq(s.directCost, t.estimatedTotal, 'pajak tidak menyentuh kaki langsung');
  eq(s.taxAmount, 350350, 'PPN 11% × 3.185.000');
  eq(s.pphAmount, 63700, 'PPh 2% × 3.185.000');
  eq(s.grandTotal, 3599050, 'grand = subtotal + PPN + PPh');
});

check('1.5 item taxIncludedPpn: basis PPN menyusut, directCost tetap == estimatedTotal', () => {
  const t = totalsFromItems(FIXTURE_DRAFT);
  const items = FIXTURE_RAB.map((it) => it.id === 'a' ? { ...it, taxIncludedPpn: true } : it);
  const s = UnifiedProjectEngine.recalculateCostSummary(items, {
    overheadPercent: 10, profitPercent: 5, ppnEnabled: true, taxPercent: 11,
  } as never);
  eq(s.directCost, t.estimatedTotal, 'directCost tak berubah');
  eq(s.taxAmount, 229540, 'PPN 11% × (3.185.000 × 1.900.000/2.900.000)');
});

check('1.6 kontingensi/markup memakai directCost PENUH (termasuk item HSP)', () => {
  const s = UnifiedProjectEngine.recalculateCostSummary(FIXTURE_RAB, {
    contingencyPercent: 2, directorMarkupPercent: 1,
  } as never);
  eq(s.contingencyAmount, 58000, 'kontingensi 2% × 2.900.000 (bukan basis non-HSP)');
  eq(s.directorMarkupTotal, 29000, 'markup 1% × 2.900.000');
  eq(s.grandTotal, 2987000, 'grand = direct + kontingensi + markup');
});

check('1.7 computeTotals draft sintetis == totalsFromItems == engine directCost', () => {
  const draft = {
    id: 'd-p3b', title: 'Draft sintetis P3B', spec: {},
    parts: [{
      scope: { label: 'Jalan' },
      template: { id: 'TPL-P3B', name: 'Template sintetis P3B' },
      evaluatedParams: {},
      generation: {
        items: FIXTURE_DRAFT.map((it, i) => ({
          id: `it-${i}`, description: `Item ${i}`, unit: 'ls', category: 'C', ...it,
        })),
      },
      removedKeys: [], manualPrices: {},
    }],
    assumptions: [], warnings: [], changes: [], versions: [], version: 1,
    createdAt: new Date().toISOString(), lastTransfer: null,
  } as unknown as UniversalDraft;
  const t = computeTotals(draft);
  eq(t.estimatedTotal, DIRECT, 'computeTotals draft sintetis');
  eq(t.estimatedTotal, totalsFromItems(FIXTURE_DRAFT).estimatedTotal, 'computeTotals == totalsFromItems');
  eq(effectiveItems(draft).length, 6, '6 item efektif');
});

check('1.8 round-trip draft NYATA jalan beton 1 km: preview == directCost pasca-transfer (selisih Rp0)', () => {
  const d = draftOf('Buat RAB jalan beton sepanjang 1 km');
  const t = computeTotals(d);
  eq(t.estimatedTotal, 3481800000, 'preview draft jalan beton');
  eq(t.unpricedCount, 0, 'semua item draft jalan berharga');
  const payload = buildPushPayload(d);
  const records = payload.map((p, i) => createRabItemRecord(p as never, 'PRJ-P3B', i));
  const s = UnifiedProjectEngine.recalculateCostSummary(records as never, {} as never);
  eq(s.directCost, t.estimatedTotal, 'directCost pasca-transfer == preview (selisih Rp0)');
  eq(s.unresolvedItems, t.unpricedCount, 'unresolved pasca-transfer == unpriced pratinjau');
  eq(s.grandTotal, t.estimatedTotal, 'proyek baru (O&P 0/0, pajak mati) → grand == preview');
});

check('1.9 pesan pratinjau MENYATAKAN totalnya biaya langsung (bukan grand total)', () => {
  const msg = formatUniversalDraftMessage(draftOf('Buat RAB jalan beton sepanjang 1 km'));
  assert.ok(msg.includes('Total estimasi (termasuk harga database, referensi pasar, dan manual)'), 'label Total estimasi tampil');
  assert.ok(
    msg.includes('ESTIMASI di sini berarti total kuantitas × harga katalog per item'),
    'definisi biaya-langsung tampil di pesan pratinjau',
  );
});

// ------------------------------------------- 2. default O&P & historis
console.log('== 2. Default O&P proyek baru & preservasi konfigurasi historis ==');

check('2.1 proyek baru (tanpa konfigurasi) → O&P 0%/0%, grand == direct', () => {
  const s = UnifiedProjectEngine.recalculateCostSummary(FIXTURE_RAB, {} as never);
  eq(s.overheadPercent, 0, 'fallback overhead 0% (keputusan owner 2026-11-08)');
  eq(s.profitPercent, 0, 'fallback profit 0%');
  eq(s.grandTotal, DIRECT, 'grand == direct');
  const r = computeRekapSummary(FIXTURE_RAB, proj({}));
  eq(r.overheadPct, 0, 'rekap: overhead 0%');
  eq(r.profitPct, 0, 'rekap: profit 0%');
  eq(r.ppnEnabled, false, 'rekap: PPN mati default');
  eq(r.grandTotal, DIRECT, 'rekap: grand == direct');
});

check('2.2 proyek historis O&P 10/5 + PPN: konfigurasi dipertahankan, recalculate idempotent', () => {
  const p = proj({ overheadPercent: 10, profitPercent: 5, ppnPercent: 11, ppnEnabled: true });
  const before = JSON.stringify(p);
  const cfg = { overheadPercent: 10, profitPercent: 5, ppnEnabled: true, taxPercent: 11 } as never;
  const s1 = UnifiedProjectEngine.recalculateCostSummary(FIXTURE_RAB, cfg);
  const s2 = UnifiedProjectEngine.recalculateCostSummary(FIXTURE_RAB, cfg);
  eq(s1.grandTotal, 3535350, 'grand historis = 2.900.000 + 190.000 + 95.000 + PPN 350.350');
  eq(s2.grandTotal, s1.grandTotal, 'recalculate kedua identik (tidak menggandakan O&P)');
  eq(JSON.stringify(p), before, 'objek proyek tidak dimutasi recalculate');
});

check('2.3 nilai eksplisit 0% dipertahankan (bukan fallback)', () => {
  const s = UnifiedProjectEngine.recalculateCostSummary(FIXTURE_RAB, { overheadPercent: 0, profitPercent: 0 } as never);
  eq(s.overheadPercent, 0, '0 eksplisit bertahan');
  eq(s.overheadAmount, 0, 'overhead 0');
});

// ------------------------------------------------------- 3. Rekapitulasi
console.log('== 3. Rekapitulasi memakai engine kanonis ==');

check('3.1 computeRekapSummary == engine pada fixture + konfigurasi yang sama', () => {
  const p = proj({ overheadPercent: 10, profitPercent: 5, ppnPercent: 11, ppnEnabled: true });
  const r = computeRekapSummary(FIXTURE_RAB, p);
  const s = UnifiedProjectEngine.recalculateCostSummary(FIXTURE_RAB, {
    overheadPercent: 10, profitPercent: 5, taxPercent: 11, ppnEnabled: true,
  } as never);
  eq(r.directCost, s.directCost, 'directCost rekap == engine');
  eq(r.overheadNominal, s.overheadAmount, 'overhead rekap == engine');
  eq(r.profitNominal, s.profitAmount, 'profit rekap == engine (Batch 4: dulu tak terbaca)');
  eq(r.ppnNominal, s.taxAmount, 'PPN rekap == engine');
  eq(r.grandTotal, s.grandTotal, 'grandTotal rekap == engine');
  eq(r.unresolvedCount, s.unresolvedItems, 'unresolved rekap == engine');
});

check('3.2 golden Premium Demo via Rekapitulasi: grand Rp1.089.879.733', () => {
  const r = computeRekapSummary(PREMIUM_DEMO_RAB_ITEMS as never, PREMIUM_DEMO_PROJECT as never);
  eq(r.directCost, 892612393, 'directCost Premium Demo');
  eq(r.overheadNominal, 44630620, 'overhead Premium Demo');
  eq(r.profitNominal, 44630620, 'profit Premium Demo');
  eq(r.ppnNominal, 108006100, 'PPN Premium Demo');
  eq(r.grandTotal, 1089879733, 'grandTotal Premium Demo == golden kanonis');
  eq(r.grandTotal, PREMIUM_DEMO_PROJECT.costSummary!.grandTotal, 'rekap == costSummary tersimpan proyek');
  const catSum = r.categoryList.reduce((a, c) => a + c.total, 0);
  eq(catSum - r.directCost, 0, 'Σ subtotal kategori == directCost (data factory bersih)');
});

check('3.3 pin sumber: view mendelegasikan ke computeRekapSummary → recalculateCostSummary', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const viewSrc = readFileSync(join(here, '../components/estimator/EstimatorRekapitulasiView.tsx'), 'utf8');
  const rekapSrc = readFileSync(join(here, '../components/estimator/rekapSummary.ts'), 'utf8');
  assert.ok(viewSrc.includes("from \"./rekapSummary\""), 'view mengimpor computeRekapSummary');
  assert.ok(viewSrc.includes('computeRekapSummary(items, currentProject)'), 'view memakai computeRekapSummary');
  assert.ok(rekapSrc.includes('recalculateCostSummary(items as never'), 'rekapSummary memakai engine kanonis');
});

check('3.4 [P3B-O1 KARAKTERISASI] subtotal kategori memasukkan amount basi UNRESOLVED (selisih terukur Rp50.000)', () => {
  const items = [
    mkRab({ id: 'a', amount: 100000, volume: 1, unitPrice: 100000, priceStatus: 'PRICE_RESOLVED', category: 'CAT-A', sectionName: 'CAT-A' }),
    // Item UNRESOLVED dengan amount basi nonzero (bukan record factory —
    // factory menolkan amount unresolved; data legacy/manual bisa begini).
    mkRab({ id: 'b', amount: 50000, volume: 2, unitPrice: 25000, priceStatus: 'PRICE_UNRESOLVED', category: 'CAT-B', sectionName: 'CAT-B' }),
  ];
  const r = computeRekapSummary(items, proj({}));
  const catSum = r.categoryList.reduce((a, c) => a + c.total, 0);
  eq(r.directCost, 100000, 'tangga uang BENAR mengecualikan unresolved');
  eq(r.grandTotal, 100000, 'grandTotal benar');
  eq(r.unresolvedCount, 1, 'unresolved terhitung');
  eq(catSum - r.directCost, 50000, 'SELISIH TERUKUR: Σ kategori memasukkan amount basi Rp50.000 — temuan terbuka P3B-O1, bukan perilaku yang diinginkan');
});

// ------------------------------------------------- 4. routing dua engine
console.log('== 4. Routing dua engine RAB (parametrik rumah vs katalog template) ==');

check('4.1 rumah bertipe → parametrik: findDirectTemplate + buildDirectRab', () => {
  const m = findDirectTemplate('buatkan rab rumah type 70 2 lantai');
  assert.ok(m !== null, 'type 70 dikenali sebagai template terdaftar');
  const b = buildDirectRab('buatkan rab rumah type 70 2 lantai');
  assert.ok(b !== null, 'buildDirectRab menghasilkan RAB');
  eq(b!.calc.items.length, 25, 'RAB Type 70 = 25 item');
  eq(b!.calc.totalDirectCost, 208541930, 'direct cost parametrik Type 70');
  eq(b!.calc.totalRabCost, 254629698, 'total RAB parametrik Type 70 (tangga 5/5/11)');
  eq(b!.calc.generationResult.overheadPercentage, 5, 'tangga parametrik: OH 5%');
  eq(b!.calc.generationResult.profitPercentage, 5, 'tangga parametrik: profit 5%');
  eq(b!.calc.generationResult.taxPercentage, 11, 'tangga parametrik: pajak 11%');
});

check('4.2 rumah spek bebas → parametrik: buildSpecRab', () => {
  const s = buildSpecRab('buatkan rab rumah 5x10');
  assert.ok(s !== null, 'buildSpecRab menghasilkan RAB rumah spek bebas');
  eq(s!.calc.items.length, 25, 'RAB rumah 5x10 = 25 item');
  eq(s!.calc.totalRabCost, 176024079, 'total RAB parametrik rumah 5x10');
});

check('4.3 non-rumah: hijack guard aktif; jalan → katalog universal', () => {
  eq(specRabHijackGuard('Buatkan RAB kolam renang di halaman rumah 10 x 5 m'), true, 'kolam (primer non-rumah) tidak boleh diklaim mesin rumah');
  eq(specRabHijackGuard('Buat RAB jalan beton sepanjang 1 km'), true, 'jalan tidak boleh diklaim mesin rumah');
  eq(specRabHijackGuard('buatkan rab rumah dengan kolam renang'), false, 'rumah sejati (primer rumah) tidak terpengaruh guard');
  eq(findDirectTemplate('Buat RAB jalan beton sepanjang 1 km'), null, 'jalan tidak cocok template rumah terdaftar');
  const d = draftOf('Buat RAB jalan beton sepanjang 1 km');
  eq(d.parts[0].template.id, 'INFRA-ROAD-RIGID', 'jalan memakai template katalog 183');
});

check('4.4 dispatch CREATE_RAB_DIRECT: rumah typed → push-rab; jalan → push-universal', () => {
  const house = executeIntent('CREATE_RAB_DIRECT', undefined, ctxFor('Buatkan RAB rumah type 70 2 lantai luas bangunan 70m2'));
  assert.ok(house.ok, 'intent rumah typed ok');
  assert.ok((house.actions ?? []).some((a: any) => a.action.kind === 'push-rab'), 'rumah typed → tombol push-rab (jalur parametrik)');
  assert.ok(!(house.actions ?? []).some((a: any) => a.action.kind === 'push-universal'), 'rumah typed TANPA push-universal');
  assert.ok((house.message ?? '').includes('template parametrik'), 'pesan rumah menyebut template parametrik');
  const road = executeIntent('CREATE_RAB_DIRECT', undefined, ctxFor('Buat RAB jalan beton sepanjang 1 km'));
  assert.ok(road.ok, 'intent jalan ok');
  assert.ok((road.actions ?? []).some((a: any) => a.action.kind === 'push-universal'), 'jalan → tombol push-universal (jalur katalog)');
  assert.ok((road.message ?? '').includes('katalog template resmi EZRAB'), 'pesan jalan menyebut katalog template');
});

check('4.5 [P3B-O2 KARAKTERISASI] preview universal vs grand proyek terkonfigurasi: selisih terukur Rp962.717.700', () => {
  const d = draftOf('Buat RAB jalan beton sepanjang 1 km');
  const preview = computeTotals(d).estimatedTotal;
  const payload = buildPushPayload(d);
  const records = payload.map((p, i) => createRabItemRecord(p as never, 'PRJ-P3B', i));
  const s = UnifiedProjectEngine.recalculateCostSummary(records as never, {
    overheadPercent: 10, profitPercent: 5, ppnEnabled: true, taxPercent: 11,
  } as never);
  eq(preview, 3481800000, 'preview = biaya langsung');
  eq(s.grandTotal, 4444517700, 'grand pasca-transfer O&P 10/5 + PPN 11%');
  eq(s.grandTotal - preview, 962717700, 'SELISIH TERUKUR (+27,7%): pratinjau tidak menampilkan O&P/pajak — temuan terbuka P3B-O2, keputusan owner');
});

check('4.6 [P3B-O3 KARAKTERISASI] tangga parametrik vs tangga kanonis proyek baru: selisih terukur Rp46.087.768', () => {
  const b = buildDirectRab('buatkan rab rumah type 70 2 lantai');
  assert.ok(b !== null, 'buildDirectRab non-null');
  const canonicalFresh = UnifiedProjectEngine.recalculateCostSummary(
    [mkRab({ id: 'x', amount: b!.calc.totalDirectCost, volume: 1, unitPrice: b!.calc.totalDirectCost, priceStatus: 'PRICE_RESOLVED' })],
    {} as never,
  );
  eq(canonicalFresh.grandTotal, 208541930, 'kanonis proyek baru (O&P 0/0, pajak mati) == biaya langsung');
  eq(b!.calc.totalRabCost - canonicalFresh.grandTotal, 46087768, 'SELISIH TERUKUR: tangga parametrik (5/5/11 selalu) vs tangga kanonis proyek baru — temuan terbuka P3B-O3, keputusan owner');
});

delete (globalThis as any).window;
delete (globalThis as any).localStorage;

console.log(`\np3bCanonicalCalculation: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

/**
 * W7 — P1 FOLLOW-UPS FU1–FU3 (2026-11-24): live QTO pipeline + engine
 * negativity guards. Defects found by W1 (Wave 1) outside its ownership.
 *
 * FU1 — `computeDeterministicQuantity` (dedToRabPipelineService, the LIVE
 *   QTO path) had no positivity validation: negative dimensions yielded
 *   negative quantities and negative line amounts that reduced the
 *   pipeline subtotal. Now: length/width/height must be finite and > 0,
 *   else no quantity (fail-closed), following W1's INVALID_DIMENSION
 *   precedent in dedQtoCalculationEngine.ts.
 * FU2 — `resolveLatestAHSP` treated unit alignment as only +15 match
 *   score, not a gate: a QTO quantity in m³ could be priced with a
 *   per-m² AHSP price (and worse — a per-batang/per-buah price via the
 *   K-250/K-300 false-positive spec match) with no mismatch flag. Now:
 *   unit mismatch is a GATE — the mapping is still returned (it is a
 *   suggestion, not money), but the price is NOT resolved and the item
 *   is flagged PRICE_INCOMPLETE (UNIT_MISMATCH), per the
 *   validateUnitCompatibility precedent (unitCompatibility.ts).
 * FU3 — `recalculateCostSummary` (unifiedProjectEngine) summed stored
 *   `itm.amount` with no negativity guard: negative amounts from direct
 *   spreadsheet edits entered directCost. Now: negative/non-finite
 *   stored amounts contribute 0. The P3B pin is intact: totalsFromItems
 *   never reads stored amount (it recomputes volume × unitPrice) and
 *   factory records always have amount == volume × unitPrice ≥ 0, so
 *   estimatedTotal == directCost still holds exactly in its domain
 *   (asserted below on the P3B fixture).
 *
 * Plain-tsx style (no vitest — vitest is not installed in the sandbox):
 * run from repo root: `npx --yes tsx src/test/w7P1Followups.test.ts`
 */
import { strict as assert } from 'assert';
import { jsPDF } from 'jspdf';
import { dedToRabPipelineService } from '../services/dedToRabPipelineService';
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';
import { totalsFromItems } from '../ai-tools/ezrab-ai/universalRab';
import type { DimensionExtraction } from '../domain/ded/dedPipelineTypes';
import type { RabItem, RABSection, Project } from '../types';

let passed = 0;
let failed = 0;
// Sequential runner: checks are async (pipeline tests), so queue them.
const queue: Array<() => Promise<void>> = [];
function test(name: string, fn: () => void | Promise<void>): void {
  queue.push(async () => {
    try {
      await fn();
      passed += 1;
      console.log(`  PASS ${name}`);
    } catch (e: any) {
      failed += 1;
      console.log(`  FAIL ${name}: ${e?.message ?? e}`);
    }
  });
}
const eq = (a: unknown, b: unknown, msg: string) => {
  if (a !== b) throw new Error(`${msg} (dapat ${a}, harap ${b})`);
};

const dims = (o: Partial<DimensionExtraction> & { unit?: DimensionExtraction['unit'] }): DimensionExtraction => ({
  unit: 'm³',
  rawSnippets: [],
  scaleVerified: true,
  ...o,
});

const mkRab = (over: Partial<RabItem> & Record<string, unknown>): RabItem =>
  ({ no: 1, projectId: 'p1', code: 'X', category: 'C', description: 'item', volume: 1, unit: 'ls', ...over } as unknown as RabItem);

function createPdfBuffer(lines: string[]): ArrayBuffer {
  const doc = new jsPDF();
  doc.setFontSize(12);
  lines.forEach((line, idx) => {
    doc.text(line, 15, 20 + idx * 10);
  });
  return doc.output('arraybuffer');
}

// ------------------------------------------------------------------ FU1
console.log('== FU1: computeDeterministicQuantity positivity validation ==');

test('FU1.1 negative length → no quantity (was -30 m³)', () => {
  eq(dedToRabPipelineService.computeDeterministicQuantity(dims({ length: -5, width: 2, height: 3 })), undefined, 'length -5 ditolak');
});
test('FU1.2 negative width → no quantity (was -10 m²)', () => {
  eq(dedToRabPipelineService.computeDeterministicQuantity(dims({ length: 5, width: -2, unit: 'm²' })), undefined, 'width -2 ditolak');
});
test('FU1.3 negative height → no quantity', () => {
  eq(dedToRabPipelineService.computeDeterministicQuantity(dims({ length: 5, width: 2, height: -3 })), undefined, 'height -3 ditolak');
});
test('FU1.4 zero length → no quantity (was 0 m³)', () => {
  eq(dedToRabPipelineService.computeDeterministicQuantity(dims({ length: 0, width: 2, height: 3 })), undefined, 'length 0 ditolak');
});
test('FU1.5 NaN length → no quantity (was 0 m² via silent coercion)', () => {
  eq(dedToRabPipelineService.computeDeterministicQuantity(dims({ length: NaN, width: 2, unit: 'm²' })), undefined, 'length NaN ditolak');
});
test('FU1.6 Infinity width → no quantity', () => {
  eq(dedToRabPipelineService.computeDeterministicQuantity(dims({ length: 5, width: Infinity, unit: 'm²' })), undefined, 'width Infinity ditolak');
});
test('FU1.7 negative 1D length → no quantity (was -7 m)', () => {
  eq(dedToRabPipelineService.computeDeterministicQuantity(dims({ length: -7, unit: 'm' })), undefined, 'length 1D -7 ditolak');
});
test('FU1.8 positive control 5×2×3 → 30 m³ (unchanged)', () => {
  const q = dedToRabPipelineService.computeDeterministicQuantity(dims({ length: 5, width: 2, height: 3 }));
  assert.ok(q);
  eq(q?.computedValue, 30, 'volume positif');
  eq(q?.unit, 'm³', 'satuan m³');
});
test('FU1.9 positive control with count 0.3×0.3×3.2×12 → 3.456 m³ (phase11 fixture, unchanged)', () => {
  const q = dedToRabPipelineService.computeDeterministicQuantity(dims({ length: 0.3, width: 0.3, height: 3.2, count: 12 }));
  assert.ok(q);
  eq(q?.computedValue, 3.456, 'volume kolom 12 titik');
});
test('FU1.10 negative count is already harmless: 5×2 with count -3 → 10 m² (count treated as 1)', () => {
  const q = dedToRabPipelineService.computeDeterministicQuantity(dims({ length: 5, width: 2, count: -3, unit: 'm²' }));
  assert.ok(q);
  eq(q?.computedValue, 10, 'count negatif diabaikan, bukan dipakai aritmetika');
});
test('FU1.11 scale-unverified → no quantity (pre-existing behavior preserved)', () => {
  eq(dedToRabPipelineService.computeDeterministicQuantity(dims({ length: 5, width: 2, height: 3, scaleVerified: false })), undefined, 'skala tak terverifikasi tetap ditolak');
});

// ------------------------------------------------------------------ FU2
console.log('== FU2: resolveLatestAHSP unit gate ==');

test('FU2.1 m³ QTO vs per-m² AHSP (lantai keramik) → UNIT_MISMATCH flagged, mapping preserved', () => {
  const r = dedToRabPipelineService.resolveLatestAHSP('Pekerjaan lantai keramik', undefined, 'm³');
  eq(r.ahspCode, '3.9.7.1', 'pemetaan tetap dikembalikan');
  eq(r.sourceType, 'OFFICIAL_AHSP', 'sumber tetap resmi');
  assert.ok(r.unitMismatch, 'unitMismatch terisi');
  eq(r.unitMismatch?.result, 'UNIT_MISMATCH', 'hasil gerbang UNIT_MISMATCH');
  eq(r.unitMismatch?.requestedUnit, 'm³', 'satuan QTO m³');
  eq(r.unitMismatch?.candidateUnit, 'm²', 'satuan AHSP m²');
  assert.ok(r.reason.includes('UNIT_MISMATCH'), 'alasan membawa UNIT_MISMATCH');
});
test('FU2.2 m³ QTO vs per-m² AHSP (cat tembok) → UNIT_MISMATCH', () => {
  const r = dedToRabPipelineService.resolveLatestAHSP('Cat tembok', undefined, 'm³');
  eq(r.ahspCode, '3.8.2', 'pemetaan tetap dikembalikan');
  assert.ok(r.unitMismatch, 'unitMismatch terisi');
  eq(r.unitMismatch?.candidateUnit, 'm²', 'satuan AHSP m²');
});
test('FU2.3 m³ QTO vs per-m² AHSP (bekisting kolom) → UNIT_MISMATCH', () => {
  const r = dedToRabPipelineService.resolveLatestAHSP('Bekisting kolom', undefined, 'm³');
  eq(r.ahspCode, 'A.1.03.2e.1', 'pemetaan tetap dikembalikan');
  assert.ok(r.unitMismatch, 'unitMismatch terisi');
  eq(r.unitMismatch?.result, 'UNIT_MISMATCH', 'hasil gerbang UNIT_MISMATCH');
});
test('FU2.4 WB-03 (Fast Track): K-250 false-positive spec match DIHAPUS — kolom m³ tidak lagi dipetakan ke tiang pancang per batang', () => {
  // WB-03 menghapus akar masalahnya: spec "K-250" tidak lagi cocok
  // substring dengan "jarak 250" (A.3.05.4c.1). FU2.1–FU2.3 tetap
  // menguji gerbang UNIT_MISMATCH pada pemetaan yang sah.
  // FTC (2026-11-24): pin FT "tanpa padanan resmi" (AI_CUSTOM) adalah
  // artefak bug satuan — m³ superskrip tidak pernah sama dengan m3
  // katalog, bonus +15 hilang, skor 27 < 40. Dengan satuan
  // ternormalisasi, kolom cocok SEMANTIK ke item kolom beton per-m³
  // resmi (2.4.3.3) — SEMANTIC, bukan EXACT, karena mutu K-250 tidak
  // token-match teks katalog. Inti WB-03 dipertahankan: TIDAK PERNAH
  // ke tiang pancang per-batang A.3.05.4c.1.
  const r = dedToRabPipelineService.resolveLatestAHSP('Beton Kolom K-250', 'K-250', 'm³');
  eq(r.ahspCode?.startsWith('AI-CUSTOM-'), false, 'ada padanan resmi (bukan AI_CUSTOM)');
  eq(r.ahspCode === 'A.3.05.4c.1', false, 'bukan kecocokan palsu A.3.05.4c.1 per batang');
  eq(r.matchStatus, 'SEMANTIC_MATCH', 'status SEMANTIC_MATCH (mutu tidak terpetakan)');
  eq(r.sourceType, 'OFFICIAL_AHSP', 'sumber OFFICIAL_AHSP');
  eq(r.unitMismatch, undefined, 'gerbang satuan lolos: m³ ≡ m3');
});
test('FU2.5 matching unit → no flag (lantai keramik m²)', () => {
  const r = dedToRabPipelineService.resolveLatestAHSP('Pekerjaan lantai keramik', undefined, 'm²');
  eq(r.ahspCode, '3.9.7.1', 'pemetaan sama');
  eq(r.unitMismatch, undefined, 'tidak ada mismatch bila satuan cocok');
});
test('FU2.6 notation variant m2 ↔ m² → no flag (cat tembok)', () => {
  const r = dedToRabPipelineService.resolveLatestAHSP('Cat tembok', undefined, 'm2');
  eq(r.unitMismatch, undefined, 'm2 dinormalisasi ke m²');
});
test('FU2.7 buah ↔ unit factor-1 synonym → no flag (box culvert per buah, QTO unit)', () => {
  const r = dedToRabPipelineService.resolveLatestAHSP('Pengadaan Box Culvert', undefined, 'unit');
  eq(r.candidates[0]?.unit, 'buah', 'kandidat per buah');
  eq(r.unitMismatch, undefined, 'buah↔unit sinonim hitung faktor 1 — harga dipakai apa adanya');
});
test('FU2.8 no QTO unit → gate not evaluable, mapping unchanged (backward compatible)', () => {
  // WB-03: fixture K-250 lama diganti pemetaan sah — maksud tes tidak
  // berubah: tanpa satuan QTO, gerbang tidak dapat dinilai.
  const r = dedToRabPipelineService.resolveLatestAHSP('Pekerjaan lantai keramik');
  eq(r.ahspCode, '3.9.7.1', 'pemetaan tetap dikembalikan');
  eq(r.sourceType, 'OFFICIAL_AHSP', 'sumber tetap resmi');
  eq(r.unitMismatch, undefined, 'tanpa satuan QTO gerbang tidak dapat dinilai');
});
test('FU2.9 project order: m² project item vs m³ QTO → UNIT_MISMATCH; vs m² → no flag', () => {
  const projectItems = [
    mkRab({ id: 'p1', description: 'Pekerjaan Khusus Proyek Pasang Marmer Import', unit: 'm²', unitPrice: 850000, amount: 850000, ahspCode: 'PROJ-X' }),
  ];
  const bad = dedToRabPipelineService.resolveLatestAHSP('Pekerjaan Khusus Proyek Pasang Marmer Import', undefined, 'm³', projectItems);
  eq(bad.sourceType, 'PROJECT_AHSP', 'urutan proyek tetap');
  assert.ok(bad.unitMismatch, 'unitMismatch terisi pada urutan proyek');
  eq(bad.unitMismatch?.candidateUnit, 'm²', 'satuan proyek m² vs QTO m³');
  const good = dedToRabPipelineService.resolveLatestAHSP('Pekerjaan Khusus Proyek Pasang Marmer Import', undefined, 'm²', projectItems);
  eq(good.unitMismatch, undefined, 'tidak ada mismatch bila satuan cocok');
});

test('FU2.10 end-to-end WB-03: kolom K-250 (m³) cocok SEMANTIK ke item kolom beton resmi, harga terselesaikan lewat gerbang satuan', async () => {
  // WB-03 (Fast Track): kecocokan spek palsu 'k250' ⊂ 'jarak 250'
  // dihapus — kolom K-250 tidak lagi A.3.05.4c.1 per batang +
  // PRICE_INCOMPLETE. FT lalu memin AI_CUSTOM + tanpa harga, tetapi
  // itu artefak bug satuan (m³ ≠ m3, bonus +15 hilang). FTC
  // (2026-11-24) menormalisasi satuan: kolom cocok SEMANTIK ke
  // 2.4.3.3 (Penuangan Beton untuk KOLOM, m³) dan harganya
  // terselesaikan (gerbang lolos: m³ ≡ m3). Sifat keamanan TIDAK
  // berubah: tidak ada harga salah-satuan — harga berasal dari item
  // resmi dengan satuan yang sama, dan item SEMANTIK tetap
  // needs-review (bukan VERIFIED).
  dedToRabPipelineService.resetProjectState();
  const pdf = createPdfBuffer([
    'DED Struktur Kolom S-02',
    'Kolom K1: 0.30 x 0.30 x 3.20 m mutu beton K-250 Count: 12 titik',
  ]);
  const draft = await dedToRabPipelineService.executePipeline({
    projectId: 'PRJ-W7-FU2',
    projectName: 'W7 FU2 gate',
    files: [{ fileName: 'DED_Struktur_Kolom.pdf', buffer: pdf }],
  });
  const kolom = draft.detectedWorkItems.find((w) => w.name.includes('Kolom'));
  assert.ok(kolom, 'item kolom terdeteksi');
  eq(kolom?.quantity, 3.456, 'kuantitas QTO 3.456 m³');
  eq(kolom?.unit, 'm³', 'satuan QTO m³');
  assert.ok(kolom?.ahspCode && !kolom.ahspCode.startsWith('AI-CUSTOM-'), 'ada padanan resmi (bukan AI_CUSTOM)');
  eq(kolom?.ahspCode === 'A.3.05.4c.1', false, 'bukan kecocokan palsu per batang');
  eq(kolom?.ahspMatchStatus, 'SEMANTIC_MATCH', 'status padanan SEMANTIC_MATCH');
  eq(kolom?.ahspSourceType, 'OFFICIAL_AHSP', 'sumber OFFICIAL_AHSP');
  eq(kolom?.isCustomItem, false, 'bukan item custom');
  assert.ok(kolom?.unitPrice && kolom.unitPrice > 0, 'harga diselesaikan dari item resmi per-m³ (bukan Rp145/batang)');
  assert.ok(kolom?.totalPrice && kolom.totalPrice > 0, 'totalPrice terisi (bukan null)');
  eq(kolom?.priceStatus, undefined, 'tanpa unitMismatch, priceStatus tidak diisi saat build');
  assert.ok(!kolom?.ahspMappingReason?.includes('Tidak ditemukan'), 'alasan pemetaan: padanan ditemukan');
  assert.ok(!kolom?.priceSource?.sourceDetail?.includes('Belum memiliki harga resmi'), 'detail sumber harga: harga resmi ada');
  const row = draft.rows.find((r) => r.workItemId === kolom?.id);
  eq(row?.amount, kolom?.totalPrice, 'baris draf amount = totalPrice item');
  assert.ok(draft.subtotal > 0, 'subtotal draf > 0 — harga jujur masuk total');
  eq(draft.subtotal, kolom?.totalPrice, 'subtotal = totalPrice satu-satunya item');
  eq(draft.grandTotal, draft.subtotal, 'grand total = subtotal (tanpa pajak)');
  eq(draft.missingCount, 0, 'item berharga masuk needs-review, bukan missingCount (logika penghitung draf yang sudah ada)');
  assert.ok(draft.needsReviewCount >= 1, 'item SEMANTIK terhitung needs-review');
  assert.ok(
    !draft.missingDataSummary.items.some((m) => m.workItemId === kolom?.id && m.missingFields.includes('Harga Satuan')),
    'missing summary TIDAK lagi mencatat Harga Satuan hilang untuk kolom'
  );
});

test('FU2.11 auto-fill must NOT bypass the gate: unpriced item stays unpriced (AI_CUSTOM, draf sintetis)', async () => {
  // FTC (2026-11-24): kolom K-250 PRJ-W7-FU2 kini BERHARGA (FU2.10),
  // sehingga sifat "item tanpa harga tetap tanpa harga" tidak lagi
  // dapat diuji lewat draf itu. Sifat keamanan ini dipertahankan
  // dengan draf sintetis berisi item AI_CUSTOM tanpa harga (pola yang
  // sama dipakai pin H-06 auto-fill di fastTrackAhsp): auto-fill
  // menandainya PRICE_UNRESOLVED dengan unitPrice null (Phase 2J:
  // tidak pernah mengarang harga). Item custom dihitung "filled"
  // (penandaan eksplisit), bukan "unresolved" — sifat keamanannya
  // sama: tetap tanpa harga, subtotal 0.
  const draftAf: any = {
    projectId: 'PRJ-W7-FU2-11',
    detectedWorkItems: [
      {
        id: 'wi-w7-fu2-11',
        projectId: 'PRJ-W7-FU2-11',
        name: 'Pekerjaan Khusus Tanpa Padanan Resmi',
        category: 'Pekerjaan Khusus',
        quantity: 1,
        unit: 'm3',
        ahspCode: 'AI-CUSTOM-W7-001',
        ahspName: 'Pekerjaan Khusus Tanpa Padanan Resmi',
        unitPrice: undefined,
        totalPrice: undefined,
        status: 'NOT_FOUND',
        confidence: 'LOW',
        evidence: [],
        isCustomItem: true,
        ahspMatchStatus: 'NOT_FOUND',
      },
    ],
    rows: [],
    subtotal: 0,
    ppnEnabled: false,
    pphEnabled: false,
    verifiedCount: 0,
    needsReviewCount: 0,
    missingCount: 0,
  };
  (dedToRabPipelineService as any).projectDrafts.set('PRJ-W7-FU2-11', draftAf);
  const res = dedToRabPipelineService.autoFillMissingWithValidSources('PRJ-W7-FU2-11');
  const kolom = res.updatedDraft.detectedWorkItems.find((w) => w.id === 'wi-w7-fu2-11');
  assert.ok(kolom, 'item custom masih ada sesudah auto-fill');
  eq(kolom?.unitPrice, null, 'auto-fill tidak menghargai item tanpa padanan resmi');
  eq(kolom?.totalPrice, null, 'totalPrice tetap null sesudah auto-fill');
  eq(kolom?.priceStatus, 'PRICE_UNRESOLVED', 'status PRICE_UNRESOLVED');
  eq(kolom?.status, 'NEEDS_REVIEW', 'status NEEDS_REVIEW (bukan VERIFIED — H-06)');
  eq(res.updatedDraft.subtotal, 0, 'subtotal tetap 0 sesudah auto-fill');
});

// ------------------------------------------------------------------ FU3
console.log('== FU3: recalculateCostSummary negativity guard (P3B pin intact) ==');

test('FU3.1 negative stored amount does NOT reduce directCost (was 500.000, now 1.000.000)', () => {
  const items: RabItem[] = [
    mkRab({ id: 'a', amount: 1000000, volume: 10, unitPrice: 100000, priceStatus: 'PRICE_RESOLVED' }),
    mkRab({ id: 'b', amount: -500000, volume: 5, unitPrice: 100000, priceStatus: 'PRICE_RESOLVED' }),
  ];
  const s = UnifiedProjectEngine.recalculateCostSummary(items, {} as never);
  eq(s.directCost, 1000000, 'item negatif berkontribusi 0');
  eq(s.grandTotal, 1000000, 'grand total mengikuti directCost');
});
test('FU3.2 stored item is NOT mutated by recalculate (pure read)', () => {
  const items: RabItem[] = [
    mkRab({ id: 'b', amount: -500000, volume: 5, unitPrice: 100000, priceStatus: 'PRICE_RESOLVED' }),
  ];
  UnifiedProjectEngine.recalculateCostSummary(items, {} as never);
  eq(items[0].amount, -500000, 'nilai sumber tidak diubah; yang digerbangi hanya penjumlahan');
});
test('FU3.3 NaN / Infinity / undefined amounts contribute 0', () => {
  const items: RabItem[] = [
    mkRab({ id: 'a', amount: 1000000, volume: 1, unitPrice: 1000000, priceStatus: 'PRICE_RESOLVED' }),
    mkRab({ id: 'n', amount: NaN, volume: 1, unitPrice: 100, priceStatus: 'PRICE_RESOLVED' }),
    mkRab({ id: 'i', amount: Infinity, volume: 1, unitPrice: 100, priceStatus: 'PRICE_RESOLVED' }),
    mkRab({ id: 'u', amount: undefined, volume: 1, unitPrice: 100, priceStatus: 'PRICE_RESOLVED' }),
  ];
  const s = UnifiedProjectEngine.recalculateCostSummary(items, {} as never);
  eq(s.directCost, 1000000, 'hanya amount finite positif yang dijumlah');
});
test('FU3.4 negative HSP-basis item does NOT widen the O&P base (exemption uses guarded amount)', () => {
  const items: RabItem[] = [
    mkRab({ id: 'a', amount: 2000000, volume: 1, unitPrice: 2000000, priceStatus: 'PRICE_RESOLVED' }),
    mkRab({ id: 'h', amount: -1000000, volume: 1, unitPrice: 1000000, priceStatus: 'PRICE_RESOLVED', priceCostBasis: 'HSP' }),
  ];
  const s = UnifiedProjectEngine.recalculateCostSummary(items, { overheadPercent: 10, profitPercent: 5 } as never);
  eq(s.directCost, 2000000, 'directCost bersih');
  eq(s.overheadAmount, 200000, 'OH 10% × basis 2.000.000 (item HSP negatif tidak memperlebar basis)');
  eq(s.profitAmount, 100000, 'profit 5% × basis 2.000.000');
});
test('FU3.5 negative amount with PPN on: no negative tax, tax on valid directCost only', () => {
  const items: RabItem[] = [
    mkRab({ id: 'a', amount: 1000000, volume: 1, unitPrice: 1000000, priceStatus: 'PRICE_RESOLVED' }),
    mkRab({ id: 'b', amount: -400000, volume: 1, unitPrice: 400000, priceStatus: 'PRICE_RESOLVED' }),
  ];
  const s = UnifiedProjectEngine.recalculateCostSummary(items, { ppnEnabled: true, taxPercent: 11 } as never);
  eq(s.directCost, 1000000, 'directCost bersih');
  eq(s.taxAmount, 110000, 'PPN 11% × 1.000.000');
  eq(s.grandTotal, 1110000, 'grand = direct + PPN');
});
test('FU3.6 PRICE_UNRESOLVED exclusion still works (P3B-O1 money-ladder half)', () => {
  const items: RabItem[] = [
    mkRab({ id: 'a', amount: 100000, volume: 1, unitPrice: 100000, priceStatus: 'PRICE_RESOLVED' }),
    mkRab({ id: 'b', amount: 50000, volume: 2, unitPrice: 25000, priceStatus: 'PRICE_UNRESOLVED' }),
  ];
  const s = UnifiedProjectEngine.recalculateCostSummary(items, {} as never);
  eq(s.directCost, 100000, 'tangga uang mengecualikan unresolved');
  eq(s.unresolvedItems, 1, 'unresolved terhitung');
});
test('FU3.7 P3B PIN intact: totalsFromItems == engine directCost on the P3B positive fixture', () => {
  const draftSide = [
    { volume: 10, unitPrice: 100000, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'OFFICIAL_AHSP' },
    { volume: 5, unitPrice: 200000, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'OFFICIAL_AHSP' },
    { volume: 2, unitPrice: 150000, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'MARKET_REFERENCE' },
    { volume: 1, unitPrice: 500000, priceStatus: 'PRICE_MANUAL' },
    { volume: 3, unitPrice: 0, priceStatus: 'PRICE_UNRESOLVED' },
    { volume: 4, unitPrice: 25000 },
  ];
  const rabSide: RabItem[] = [
    mkRab({ id: 'a', amount: 1000000, volume: 10, unitPrice: 100000, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'OFFICIAL_AHSP', priceCostBasis: 'HSP' }),
    mkRab({ id: 'b', amount: 1000000, volume: 5, unitPrice: 200000, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'OFFICIAL_AHSP', priceCostBasis: 'DIRECT_COST' }),
    mkRab({ id: 'c', amount: 300000, volume: 2, unitPrice: 150000, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'MARKET_REFERENCE' }),
    mkRab({ id: 'd', amount: 500000, volume: 1, unitPrice: 500000, priceStatus: 'PRICE_MANUAL' }),
    mkRab({ id: 'e', amount: 0, volume: 3, unitPrice: 0, priceStatus: 'PRICE_UNRESOLVED' }),
    mkRab({ id: 'f', amount: 100000, volume: 4, unitPrice: 25000 }),
  ];
  const t = totalsFromItems(draftSide);
  const s = UnifiedProjectEngine.recalculateCostSummary(rabSide, {} as never);
  eq(t.estimatedTotal, 2900000, 'estimatedTotal pratinjau');
  eq(s.directCost, t.estimatedTotal, 'pin P3B: directCost engine == estimatedTotal pratinjau');
  eq(s.unresolvedItems, t.unpricedCount, 'unresolved engine == unpriced pratinjau');
});
test('FU3.8 computeCostSummaryFromSections: negative item amount + negative stored subtotal contribute 0', () => {
  const project = { id: 'p1', name: 'P', sections: [] } as unknown as Project;
  const sections: RABSection[] = [
    {
      id: 'sec-1', code: 'DIV-01', name: 'Seksi A', subtotal: 0,
      items: [
        { id: 'a', sectionId: 'sec-1', itemNumber: '1', code: '1', description: 'baik', volume: 1, unit: 'ls', unitPrice: 1000000, totalPrice: 1000000, amount: 1000000, priceStatus: 'PRICE_RESOLVED' },
        { id: 'b', sectionId: 'sec-1', itemNumber: '2', code: '2', description: 'negatif', volume: 1, unit: 'ls', unitPrice: 500000, totalPrice: -500000, amount: -500000, priceStatus: 'PRICE_RESOLVED' },
      ] as any,
    },
    { id: 'sec-2', code: 'DIV-02', name: 'Seksi B (tanpa item)', subtotal: -75000, items: [] },
  ];
  const s = UnifiedProjectEngine.computeCostSummaryFromSections(project, sections);
  eq(s.directCost, 1000000, 'directCost ekspor: hanya jumlah positif yang masuk');
  eq(s.grandTotal, 1000000, 'grandTotal ekspor mengikuti');
});

(async () => {
  for (const run of queue) await run();
  console.log(`\nw7P1Followups: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();

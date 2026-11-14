/**
 * s5QtoEvidence.test.ts — §5 FINAL INTEGRITY REPAIR (2026-11-13):
 * bukti QTO + unit gate (P3C-F1, F2, F5).
 *
 * F1 — `projectItem()` membuang `quantityFormula` + `derivation.notes`:
 *      rumus + catatan derivasi kini dipertahankan melewati proyeksi
 *      DED→lampiran, persistensi localStorage, konversi ke jembatan
 *      QTO, dan info draft (DedQtoDraftInfo.checks).
 * F2 — `calculationFormula` (RABItem) tidak pernah di-assign di src:
 *      kini diisi pemetaan finalisasi DED→RAB HANYA bila rumus NYATA
 *      ada di sumber; tanpa rumus, medan absen dan ekspor Sheet 4
 *      menampilkan 'Tidak tersedia' (fallback yang sudah ada).
 *      BATAS: factory `createRabItemRecord` (allowlist, di luar pagar
 *      S5) masih membuang medan ini — lihat tes karakterisasi di bawah.
 * F5 — jalur tool `check_qto` tanpa unit gate: kini menerapkan gate
 *      unit yang SAMA dengan alur QTO kanonis (requestedUnitByDescription
 *      eksplisit + derivation.resultUnit per item); mismatch DIBLOKIR
 *      tanpa konversi diam-diam; dimensi sumber + deskripsi pengukuran
 *      dipertahankan.
 *
 * Gaya vitest (dijalankan lewat runner/shim sementara — vitest tidak
 * terpasang). Tanpa panggilan provider. Tanpa QuantitySanityGate
 * (aktivasi menunggu threshold owner, P3C-F4 — bukan bagian §5).
 */
import { describe, it, expect } from 'vitest';
import { deriveDindingNetto } from '../ai-tools/ded-ai-estimate/derivation';
import {
  checkQtoAgainstUserDimensions,
  formatQtoCheckLines,
  buildQtoSection,
  type QtoItemLike,
} from '../ai-tools/ezrab-ai/qtoBridge';
import {
  attachDedToProject,
  loadDedAttachment,
  dedItemsAsQto,
  reconcileDedQto,
  buildDedQtoDraftInfo,
  type DedAttachment,
} from '../ai-tools/ezrab-ai/dedQtoIntegration';
import { executeTool } from '../ai-tools/ezrab-ai/toolRegistry';
import {
  mapDedAiItemToRabInput,
  mapFullAiItemToRabInput,
  mapMagicAiItemToRabInput,
} from '../ai-tools/ded-ai-estimate/finalizeMapping';
import { createRabItemRecord } from '../engine/rab/rabItemFactory';
import { volumeFormulaOf, type ExportItemLike } from '../export/fiveSheetPreset';
import type { DedAiItem, DedAiOutput } from '../ai-tools/ded-ai-estimate/types';
import type { FullAiItem } from '../ai-tools/ded-full-ai/types';
import type { AiEstimateWorkItem } from '../ai-estimate/types';

/* ---------- localStorage shim (node) — pola Gate 1 ---------- */
function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
}
(globalThis as Record<string, unknown>).localStorage = makeStorage();

/* ---------- Fixture DED (derivasi NYATA dari derivation.ts) ---------- */

/** Dinding bruto 34 × 3.2 — bukaan tidak diketahui (peringatan nyata di notes). */
const DINDING_BRUTO_DERIVATION = deriveDindingNetto(34, 3.2, null);
/** Dinding netto 34 × 3.2 − bukaan 16.32 (DED). */
const DINDING_NETTO_DERIVATION = deriveDindingNetto(34, 3.2, 16.32, 'DED');

function dedItem(
  over: Partial<DedAiItem> & { id: string; name: string },
): DedAiItem {
  return {
    category: 'Dinding',
    units: 'm2',
    quantity: 108.8,
    quantitySource: 'DED_GEOMETRIC',
    unitPrice: null,
    priceSource: 'UNRESOLVED',
    subtotal: null,
    sourcePages: [1],
    provenance: [],
    stage: 'CALCULATED',
    ...over,
  } as DedAiItem;
}

function dedOutput(items: DedAiItem[]): DedAiOutput {
  return {
    success: true,
    jobId: 'job-s5',
    projectType: 'BANGUNAN',
    mode: 'DETAIL',
    policy: 'FULL_AI',
    projectName: 'Rumah S5',
    fileName: 'ded-s5.pdf',
    pageCount: 1,
    items,
    grandTotal: 0,
    categorySummaries: [],
    coverage: {
      totalItems: items.length,
      itemsWithQuantity: items.length,
      itemsWithPrice: 0,
      itemsFullyResolved: 0,
      itemsUnresolved: items.length,
      partial: false,
    },
    partial: false,
  } as unknown as DedAiOutput;
}

function attachmentWith(items: DedAttachment['items']): DedAttachment {
  return {
    jobId: 'job-s5',
    fileName: 'ded-s5.pdf',
    projectName: 'Rumah S5',
    projectType: 'BANGUNAN',
    mode: 'DETAIL',
    projectId: 'proj-s5',
    receivedAt: '2026-11-13T20:00:00.000Z',
    consumedAt: null,
    items,
    truncatedItems: 0,
    coverage: {
      totalItems: items.length,
      itemsWithQuantity: items.length,
      itemsWithPrice: 0,
      itemsFullyResolved: 0,
      itemsUnresolved: items.length,
      partial: false,
    },
    insufficientDivisions: [],
    decisions: [],
  };
}

const PROJ = 'proj-s5';
async function runCheckQto(args: Record<string, unknown>) {
  return executeTool({ toolName: 'check_qto', args, projectId: PROJ, actor: 'model', channel: 'test' });
}

/* ================= S5-F1: rumus + bukti derivasi bertahan ================= */

describe('S5-F1 quantityFormula + derivation.notes bertahan (proyeksi + persistensi)', () => {
  it('attach→load: rumus + catatan derivasi (peringatan bukaan nyata) bertahan', () => {
    const out = dedOutput([
      dedItem({
        id: 'ded-s5-1',
        name: 'Dinding bata',
        quantity: 108.8,
        quantityFormula: '34 × 3.2 (bruto; bukaan belum diketahui)',
        derivation: DINDING_BRUTO_DERIVATION,
      }),
      dedItem({
        id: 'ded-s5-2',
        name: 'Dinding bata netto',
        quantity: 92.48,
        quantityFormula: '34 × 3.2 − bukaan 16.32',
        derivation: DINDING_NETTO_DERIVATION,
      }),
    ]);
    const attached = attachDedToProject('proj-s5-f1', out);
    expect(attached.ok).toBe(true);
    const loaded = loadDedAttachment('proj-s5-f1');
    expect(loaded).not.toBe(null);
    const bruto = loaded!.items[0];
    expect(bruto.quantityFormula).toBe('34 × 3.2 (bruto; bukaan belum diketahui)');
    // Peringatan nyata dari derivation.ts — dulu dibuang projectItem().
    expect(bruto.derivation?.notes).toContain('Bukaan tidak diketahui');
    expect(bruto.derivation?.notes).toContain('JANGAN kurangi dengan persentase default');
    expect(bruto.derivation?.validationStatus).toBe('ok (bruto, bukaan belum diketahui)');
    expect(bruto.derivation?.inputs).toEqual([
      { name: 'panjang', value: 34, unit: 'm', source: 'DED' },
      { name: 'tinggi', value: 3.2, unit: 'm', source: 'DED' },
    ]);
    const netto = loaded!.items[1];
    expect(netto.quantityFormula).toBe('34 × 3.2 − bukaan 16.32');
    expect(netto.derivation?.notes).toBe('Bruto 108.80 - bukaan 16.32 (DED) = 92.48 m²');
  });

  it('tanpa rumus/catatan: medan absen (tidak dikarang, tidak ada default)', () => {
    const out = dedOutput([
      dedItem({ id: 'ded-s5-3', name: 'Dinding bata polos', quantity: 50 }),
    ]);
    expect(attachDedToProject('proj-s5-f1b', out).ok).toBe(true);
    const loaded = loadDedAttachment('proj-s5-f1b');
    expect(loaded!.items[0].quantityFormula).toBeUndefined();
    expect(loaded!.items[0].derivation).toBeUndefined();
  });

  it('derivation tanpa notes: notes absen, medan derivasi lain tetap bertahan', () => {
    const out = dedOutput([
      dedItem({
        id: 'ded-s5-4',
        name: 'Kolom praktis',
        category: 'Struktur',
        units: 'm3',
        quantity: 0.81,
        quantityFormula: '12 × 0.15 × 0.15 × 3',
        derivation: {
          formulaType: 'kolom_volume',
          inputs: [
            { name: 'jumlah_kolom', value: 12, unit: 'bh', source: 'DED' },
            { name: 'lebar', value: 0.15, unit: 'm', source: 'DED' },
          ],
          result: 0.81,
          resultUnit: 'm3',
          validationStatus: 'ok',
        },
      }),
    ]);
    expect(attachDedToProject('proj-s5-f1c', out).ok).toBe(true);
    const loaded = loadDedAttachment('proj-s5-f1c');
    expect(loaded!.items[0].quantityFormula).toBe('12 × 0.15 × 0.15 × 3');
    expect(loaded!.items[0].derivation?.notes).toBeUndefined();
    expect(loaded!.items[0].derivation?.resultUnit).toBe('m3');
  });

  it('dedItemsAsQto meneruskan rumus + catatan + input derivasi ke jembatan', () => {
    const att = attachmentWith([
      {
        id: 'it-1',
        name: 'Dinding bata',
        category: 'Dinding',
        units: 'm2',
        quantity: 108.8,
        quantitySource: 'DED_GEOMETRIC',
        quantityNote: null,
        quantityFormula: '34 × 3.2 (bruto; bukaan belum diketahui)',
        unitPrice: null,
        priceSource: 'UNRESOLVED',
        sourcePages: [1],
        provenance: [],
        derivation: {
          formulaType: 'dinding_bruto',
          inputs: [
            { name: 'panjang', value: 34, unit: 'm', source: 'DED' },
            { name: 'tinggi', value: 3.2, unit: 'm', source: 'DED' },
          ],
          result: 108.8,
          resultUnit: 'm2',
          validationStatus: 'ok (bruto, bukaan belum diketahui)',
          notes: 'Bruto 108.80 m². Bukaan tidak diketahui — tampilkan sebagai bruto.',
        },
      },
    ]);
    const qto = dedItemsAsQto(att);
    expect(qto).toHaveLength(1);
    expect(qto[0].quantityFormula).toBe('34 × 3.2 (bruto; bukaan belum diketahui)');
    expect(qto[0].derivationNotes).toContain('Bukaan tidak diketahui');
    expect(qto[0].derivationInputs).toEqual([
      { name: 'panjang', value: 34, unit: 'm', source: 'DED' },
      { name: 'tinggi', value: 3.2, unit: 'm', source: 'DED' },
    ]);
  });

  it('reconcileDedQto end-to-end: QtoCheck membawa rumus + catatan + input; baris konteks menampilkannya', () => {
    const att = attachmentWith([
      {
        id: 'it-1',
        name: 'Dinding bata',
        category: 'Dinding',
        units: 'm2',
        quantity: 108.8,
        quantitySource: 'DED_GEOMETRIC',
        quantityNote: null,
        quantityFormula: '34 × 3.2 (bruto; bukaan belum diketahui)',
        unitPrice: null,
        priceSource: 'UNRESOLVED',
        sourcePages: [1],
        provenance: [],
        derivation: {
          formulaType: 'dinding_bruto',
          inputs: [
            { name: 'panjang', value: 34, unit: 'm', source: 'DED' },
            { name: 'tinggi', value: 3.2, unit: 'm', source: 'DED' },
          ],
          result: 108.8,
          resultUnit: 'm2',
          validationStatus: 'ok (bruto, bukaan belum diketahui)',
          notes: 'Bruto 108.80 m². Bukaan tidak diketahui — tampilkan sebagai bruto.',
        },
      },
    ]);
    const { checks } = reconcileDedQto(att, { buildingAreaM2: 108.8 });
    expect(checks).toHaveLength(1);
    expect(checks[0].verdict).toBe('OK');
    expect(checks[0].formula).toBe('34 × 3.2 (bruto; bukaan belum diketahui)');
    expect(checks[0].derivationNotes).toContain('Bukaan tidak diketahui');
    expect(checks[0].derivationInputs).toEqual([
      { name: 'panjang', value: 34, unit: 'm', source: 'DED' },
      { name: 'tinggi', value: 3.2, unit: 'm', source: 'DED' },
    ]);
    const lines = formatQtoCheckLines(checks).join('\n');
    expect(lines).toContain('Rumus: 34 × 3.2 (bruto; bukaan belum diketahui)');
    expect(lines).toContain('Catatan derivasi: Bruto 108.80 m². Bukaan tidak diketahui');
  });

  it('buildDedQtoDraftInfo: checks dengan bukti ikut ke info draft (persistensi draft)', () => {
    const att = attachmentWith([
      {
        id: 'it-1',
        name: 'Dinding bata',
        category: 'Dinding',
        units: 'm2',
        quantity: 108.8,
        quantitySource: 'DED_GEOMETRIC',
        quantityNote: null,
        quantityFormula: '34 × 3.2 (bruto)',
        unitPrice: null,
        priceSource: 'UNRESOLVED',
        sourcePages: [1],
        provenance: [],
        derivation: {
          formulaType: 'dinding_bruto',
          inputs: [{ name: 'panjang', value: 34, unit: 'm', source: 'DED' }],
          result: 108.8,
          resultUnit: 'm2',
          validationStatus: 'ok (bruto, bukaan belum diketahui)',
          notes: 'Bukaan tidak diketahui.',
        },
      },
    ]);
    const { checks } = reconcileDedQto(att, { buildingAreaM2: 108.8 });
    const info = buildDedQtoDraftInfo(att, checks, { buildingAreaM2: 108.8 });
    expect(info.checks[0].formula).toBe('34 × 3.2 (bruto)');
    expect(info.checks[0].derivationNotes).toBe('Bukaan tidak diketahui.');
    expect(info.checks[0].derivationInputs).toEqual([
      { name: 'panjang', value: 34, unit: 'm', source: 'DED' },
    ]);
    // JSON round-trip (bentuk persistensi draft) tidak menghilangkan bukti.
    const reparsed = JSON.parse(JSON.stringify(info)) as typeof info;
    expect(reparsed.checks[0].formula).toBe('34 × 3.2 (bruto)');
    expect(reparsed.checks[0].derivationNotes).toBe('Bukaan tidak diketahui.');
  });
});

/* ================= S5-F2: calculationFormula ================= */

describe('S5-F2 calculationFormula diisi hanya bila rumus nyata ada', () => {
  const stdBase = {
    id: 'dedai-s5', name: 'Plesteran', category: 'Dinding', units: 'm2',
    quantitySource: 'DED_GEOMETRIC', subtotal: null, sourcePages: [1],
    provenance: [], stage: 'CALCULATED',
  } as const;

  it('DED standar: quantityFormula nyata → calculationFormula (kanonis + estimasi)', () => {
    const canon = mapDedAiItemToRabInput(
      { ...stdBase, quantity: 10, unitPrice: 51622, priceSource: 'AHSP_2026', ahspCode: '3.7.4', quantityFormula: '10 × 0.15 × 0.3' } as unknown as DedAiItem,
      'DATABASE',
    );
    expect(canon?.calculationFormula).toBe('10 × 0.15 × 0.3');
    const est = mapDedAiItemToRabInput(
      { ...stdBase, quantity: 5, unitPrice: 850000, priceSource: 'AI_ESTIMATE', quantityFormula: '5 × 2.5 (asumsi)' } as unknown as DedAiItem,
      'DATABASE',
    );
    expect(est?.calculationFormula).toBe('5 × 2.5 (asumsi)');
  });

  it('DED standar: tanpa quantityFormula → calculationFormula absen (eksplisit kosong)', () => {
    const mapped = mapDedAiItemToRabInput(
      { ...stdBase, quantity: 10, unitPrice: 51622, priceSource: 'AHSP_2026', ahspCode: '3.7.4' } as unknown as DedAiItem,
      'DATABASE',
    );
    expect(mapped?.calculationFormula).toBeUndefined();
  });

  it('DED standar: quantityFormula kosong/whitespace → absen (bukan rumus)', () => {
    const empty = mapDedAiItemToRabInput(
      { ...stdBase, quantity: 10, unitPrice: 51622, priceSource: 'AHSP_2026', ahspCode: '3.7.4', quantityFormula: '   ' } as unknown as DedAiItem,
      'DATABASE',
    );
    expect(empty?.calculationFormula).toBeUndefined();
  });

  it('Full AI: quantity.formula nyata → calculationFormula; tanpa → absen', () => {
    const withFormula = mapFullAiItemToRabInput(
      {
        id: 'fullai-s5', name: 'Kolom Praktis', category: 'Struktur',
        quantity: { value: 2, unit: 'm3', formula: '12 × 0.15 × 0.15 × 3', provenance: 'DERIVED', confidence: 'HIGH' },
        price: { unitPrice: 4500000, unit: 'm3', source: 'AHSP_2026', ahspCode: '2.2.1.4.1' },
      } as unknown as FullAiItem,
      'DATABASE',
    );
    expect(withFormula?.calculationFormula).toBe('12 × 0.15 × 0.15 × 3');
    const without = mapFullAiItemToRabInput(
      {
        id: 'fullai-s5b', name: 'Kolom Praktis', category: 'Struktur',
        quantity: { value: 2, unit: 'm3', provenance: 'DERIVED', confidence: 'HIGH' },
        price: { unitPrice: 4500000, unit: 'm3', source: 'AHSP_2026', ahspCode: '2.2.1.4.1' },
      } as unknown as FullAiItem,
      'DATABASE',
    );
    expect(without?.calculationFormula).toBeUndefined();
  });

  it('Magic AI: formula nyata → calculationFormula', () => {
    const mapped = mapMagicAiItemToRabInput({
      id: 'magic-s5', category: 'Struktur', item: 'Kolom K1', workName: 'Kolom K1',
      quantity: 0.81, unit: 'm3', unitPrice: 4500000, quantitySource: 'DED_GEOMETRIC',
      priceSource: 'AI_ESTIMATE', confidence: 'HIGH', sourcePages: [1],
      formula: '12 × 0.15 × 0.15 × 3', assumptions: ['Denah struktur'],
      warnings: [], status: 'VALID', priceStatus: 'PRICE_ESTIMATED',
    } as unknown as AiEstimateWorkItem);
    expect(mapped?.calculationFormula).toBe('12 × 0.15 × 0.15 × 3');
  });

  it('Magic AI: fallback sintetis "Volume geometri …" TIDAK naik menjadi rumus', () => {
    const mapped = mapMagicAiItemToRabInput({
      id: 'magic-s5b', category: 'Struktur', item: 'Kolom K1', workName: 'Kolom K1',
      quantity: 0.81, unit: 'm3', unitPrice: 4500000, quantitySource: 'DED_GEOMETRIC',
      priceSource: 'AI_ESTIMATE', confidence: 'MEDIUM', sourcePages: [1],
      formula: 'Volume geometri Kolom K1 (m3)', assumptions: [],
      warnings: [], status: 'VALID', priceStatus: 'PRICE_ESTIMATED',
    } as unknown as AiEstimateWorkItem);
    expect(mapped?.calculationFormula).toBeUndefined();
  });

  it('Magic AI: formula = gabungan sourceEvidence (teks bukti, bukan rumus) TIDAK naik', () => {
    const mapped = mapMagicAiItemToRabInput({
      id: 'magic-s5c', category: 'Struktur', item: 'Kolom K1', workName: 'Kolom K1',
      quantity: 0.81, unit: 'm3', unitPrice: 4500000, quantitySource: 'DED_GEOMETRIC',
      priceSource: 'AI_ESTIMATE', confidence: 'MEDIUM', sourcePages: [1],
      formula: 'Denah lantai 1; Potongan A-A',
      assumptions: ['Denah lantai 1', 'Potongan A-A'],
      warnings: [], status: 'VALID', priceStatus: 'PRICE_ESTIMATED',
    } as unknown as AiEstimateWorkItem);
    expect(mapped?.calculationFormula).toBeUndefined();
  });

  it('Sheet 4: tanpa calculationFormula → "Tidak tersedia"; dengan → rumus', () => {
    expect(volumeFormulaOf({} as unknown as ExportItemLike)).toBe('Tidak tersedia');
    expect(volumeFormulaOf({ calculationFormula: '10 × 0.15 × 0.3' } as unknown as ExportItemLike)).toBe('10 × 0.15 × 0.3');
  });

  it('F2 (S4): factory allowlist MENERUSKAN calculationFormula ke record RAB', () => {
    const mapped = mapDedAiItemToRabInput(
      { ...stdBase, quantity: 10, unitPrice: 51622, priceSource: 'AHSP_2026', ahspCode: '3.7.4', quantityFormula: '10 × 0.15 × 0.3' } as unknown as DedAiItem,
      'DATABASE',
    );
    expect(mapped?.calculationFormula).toBe('10 × 0.15 × 0.3');
    // Perilaku BARU yang disengaja (S4, lanjutan §5): factory allowlist
    // kini meneruskan medan ini (pola qtoItemId) — rumus yang dipetakan
    // §5 mendarat di record RAB dan mengalir ke Sheet 4. Tes karakterisasi
    // S5 yang mengunci perilaku lama (dibuang factory) dibalik di sini
    // dengan kekuatan asersi yang sama.
    const rec = createRabItemRecord(mapped as never, 'proj-s5', {});
    expect((rec as unknown as { calculationFormula?: string }).calculationFormula).toBe('10 × 0.15 × 0.3');
  });
});

/* ================= S5-F5: check_qto + gate unit kanonis ================= */

describe('S5-F5 check_qto menerapkan gate unit kanonis', () => {
  it('peta eksplisit mismatch → UNIT_MISMATCH + DIBLOKIR (via tool)', async () => {
    const r = await runCheckQto({
      items: [{ description: 'Beton kolom', quantity: 2.5, unit: 'm2' }],
      dimensions: { lengthM: 10, widthM: 8, depthM: 0.5 },
      requestedUnitByDescription: { 'Beton kolom': 'm3' },
    });
    expect(r.ok).toBe(true);
    expect(r.output).toContain('[UNIT_MISMATCH]');
    expect(r.output).toContain('DIBLOKIR');
    expect(r.output).toContain('diminta "m3", QTO memakai "m2"');
  });

  it('peta eksplisit cocok → bukan UNIT_MISMATCH (OK)', async () => {
    const r = await runCheckQto({
      items: [{ description: 'Beton kolom', quantity: 40, unit: 'm3' }],
      dimensions: { lengthM: 10, widthM: 8, depthM: 0.5 },
      requestedUnitByDescription: { 'Beton kolom': 'm3' },
    });
    expect(r.ok).toBe(true);
    expect(r.output).not.toContain('[UNIT_MISMATCH]');
    expect(r.output).toContain('[OK]');
  });

  it('derivation.resultUnit tanpa peta eksplisit → UNIT_MISMATCH, sama seperti alur kanonis', async () => {
    const r = await runCheckQto({
      items: [{
        description: 'Beton kolom', quantity: 2.5, unit: 'm2',
        derivation: { formulaType: 'kolom_volume', resultUnit: 'm3', validationStatus: 'ok' },
      }],
      dimensions: { lengthM: 10, widthM: 8, depthM: 0.5 },
    });
    expect(r.ok).toBe(true);
    expect(r.output).toContain('[UNIT_MISMATCH]');
    // Paritas dengan alur kanonis (reconcileDedQto) pada data yang sama.
    const att = attachmentWith([
      {
        id: 'it-1', name: 'Beton kolom', category: 'Struktur', units: 'm2',
        quantity: 2.5, quantitySource: 'DED_GEOMETRIC', quantityNote: null,
        unitPrice: null, priceSource: 'UNRESOLVED', sourcePages: [1], provenance: [],
        derivation: {
          formulaType: 'kolom_volume',
          inputs: [{ name: 'jumlah_kolom', value: 12, unit: 'bh', source: 'DED' }],
          result: 0.81, resultUnit: 'm3', validationStatus: 'ok',
        },
      },
    ]);
    const { checks } = reconcileDedQto(att, { lengthM: 10, widthM: 8, depthM: 0.5 });
    expect(checks[0].verdict).toBe('UNIT_MISMATCH');
  });

  it('peta eksplisit menang atas derivation bila konflik', async () => {
    const r = await runCheckQto({
      items: [{
        description: 'Beton kolom', quantity: 40, unit: 'm3',
        derivation: { formulaType: 'kolom_volume', resultUnit: 'm2', validationStatus: 'ok' },
      }],
      dimensions: { lengthM: 10, widthM: 8, depthM: 0.5 },
      requestedUnitByDescription: { 'Beton kolom': 'm3' },
    });
    expect(r.ok).toBe(true);
    expect(r.output).not.toContain('[UNIT_MISMATCH]');
    expect(r.output).toContain('[OK]');
  });

  it('konversi tak didukung dicegah: UNIT_MISMATCH tanpa ekspektasi terkonversi', () => {
    const checks = checkQtoAgainstUserDimensions(
      [{ description: 'Beton kolom', quantity: 40, unit: 'm2' }],
      { lengthM: 10, widthM: 8, depthM: 0.5 },
      { requestedUnitByDescription: { 'Beton kolom': 'm3' } },
    );
    expect(checks[0].verdict).toBe('UNIT_MISMATCH');
    // Tidak ada angka hasil konversi: ekspektasi tetap null (diblokir).
    expect(checks[0].expectedFromUserDimensions).toBeNull();
  });

  it('entri peta tidak valid diabaikan (fail-closed, tanpa crash)', async () => {
    const r = await runCheckQto({
      items: [{ description: 'Beton kolom', quantity: 40, unit: 'm3' }],
      dimensions: { lengthM: 10, widthM: 8, depthM: 0.5 },
      requestedUnitByDescription: { 'Beton kolom': 123, 'Lainnya': '   ' },
    });
    expect(r.ok).toBe(true);
    expect(r.output).not.toContain('[UNIT_MISMATCH]');
    expect(r.output).toContain('[OK]');
  });

  it('regresi tanpa peta: output tool = buildQtoSection(checks) (byte-identik, T5-14)', async () => {
    const items: QtoItemLike[] = [{ description: 'Beton K-300', quantity: 12, unit: 'm3' }];
    const dims = { buildingAreaM2: 80 };
    const checks = checkQtoAgainstUserDimensions(items, dims);
    const r = await runCheckQto({ items, dimensions: dims });
    expect(r.ok).toBe(true);
    expect(r.output).toBe(buildQtoSection(checks));
  });

  it('bukti dipertahankan lewat tool: Rumus + input ASUMSI + catatan derivasi tampil', async () => {
    const items: QtoItemLike[] = [{
      description: 'Urugan pasir',
      quantity: 10,
      unit: 'm3',
      quantityFormula: '10 × 8 × 0.125 (asumsi tebal)',
      derivationInputs: [{ name: 'tebal', value: 0.125, unit: 'm', source: 'ASSUMPTION' }],
      derivationNotes: 'Tebal urugan asumsi 12,5 cm — perlu konfirmasi.',
    }];
    const r = await runCheckQto({ items, dimensions: {} });
    expect(r.ok).toBe(true);
    expect(r.output).toContain('[ASSUMPTION]');
    expect(r.output).toContain('Rumus: 10 × 8 × 0.125 (asumsi tebal)');
    expect(r.output).toContain('tebal=0.125m');
    expect(r.output).toContain('Catatan derivasi: Tebal urugan asumsi 12,5 cm');
    // Tingkat jembatan: dimensi sumber + catatan dipertahankan sebagai data.
    const checks = checkQtoAgainstUserDimensions(items, {});
    expect(checks[0].derivationInputs).toEqual([
      { name: 'tebal', value: 0.125, unit: 'm', source: 'ASSUMPTION' },
    ]);
    expect(checks[0].derivationNotes).toBe('Tebal urugan asumsi 12,5 cm — perlu konfirmasi.');
    expect(checks[0].formula).toBe('10 × 8 × 0.125 (asumsi tebal)');
  });

  it('urutan gerbang: kuantitas null + peta mismatch → MISSING (bukan UNIT_MISMATCH)', async () => {
    const r = await runCheckQto({
      items: [{ description: 'Galian tanah', quantity: null, unit: 'm3' }],
      dimensions: { lengthM: 10, widthM: 8, depthM: 0.5 },
      requestedUnitByDescription: { 'Galian tanah': 'm2' },
    });
    expect(r.ok).toBe(true);
    expect(r.output).toContain('[MISSING]');
    expect(r.output).not.toContain('[UNIT_MISMATCH]');
  });

  it('skema: requestedUnitByDescription bertipe salah → INPUT_VALIDATION_FAILED', async () => {
    const r = await runCheckQto({
      items: [{ description: 'Beton kolom', quantity: 40, unit: 'm3' }],
      dimensions: { lengthM: 10, widthM: 8, depthM: 0.5 },
      requestedUnitByDescription: 'm3',
    });
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe('INPUT_VALIDATION_FAILED');
  });
});

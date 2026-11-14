/**
 * S9 (§9 — BUTIR AMAN TERBUKA, FINAL INTEGRITY REPAIR follow-up P0–P6).
 *
 * Membuktikan tiap perbaikan §9 pada jalur kode nyata (tanpa mock atas
 * hal yang diuji) + memin perilaku yang SENGAJA tidak diubah:
 *  S9-1  P3B-O4 — guard batch4RecapAlignment kini pin 2-hop (10/10).
 *  S9-2a P3A-OF-2 — summaryBudget=0 tidak lagi mengklaim cakupan
 *        ringkasan; pesan lama tetap kandidat retrieval.
 *  S9-2b P3A-OF-1 — pelampauan cap dilaporkan eksplisit di
 *        report.truncations; pesan terakhir tetap utuh (tidak dipotong).
 *  S9-3  Fallback satu-item P0 — harga model tidak pernah RESOLVED
 *        (premise tugas ternyata basi: P1 sudah memperbaikinya; suite
 *        ini meminnya agar tidak regresi + alur fallback tetap ada).
 *  S9-4  Fallback template — harga baked tidak pernah RESOLVED;
 *        0 kemunculan unitPriceEstimate di registry terverifikasi ulang;
 *        rabTemplateService:1852 DIDOKUMENTASIKAN konsisten dengan
 *        kontrak S2 (MARKET_REFERENCE = bukti RESOLVED) — tidak diubah.
 *  S9-5  Pelaporan tahap eksekusi deterministik dari log event
 *        (reportedExecutionStage); tanpa event = tanpa klaim tahap.
 *  S9-6  Hash snapshot FNV-1a DIPERTAHANKAN (non-kriptografis,
 *        didokumentasikan) — determinisme + ikatan dibuktikan.
 *  S9-7/8 Tipe: calculationFormula di RabItem (RABItem sudah sejak
 *        HEAD — koreksi premis S4-O1) + field WBS S6-O5; mengalir
 *        factory → normalisasi → ekspor.
 *
 * Gaya vitest (dijalankan runner/shim S9 — vitest TIDAK terinstal).
 * Reset runtime eksplisit per tes (tanpa beforeEach/afterEach).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  buildCanonicalContext,
  CANONICAL_TOTAL_PROMPT_BUDGET,
} from '../ai-tools/ezrab-ai/canonicalContext';
import { resolveTemplatePickerPricing } from '../components/estimator/templatePickerPricing';
import { masterBuildingTemplateRegistry } from '../data/buildingTemplates/masterTemplateRegistry';
import {
  classifyModelPriceProvenance,
  buildAiSuggestedRabItem,
  type AiGeneratedItemState,
} from '../components/estimator/SmartAddWorkItemModal';
import {
  beginExecution,
  finishExecution,
  cancelExecution,
  emitExecutionStage,
  pruneStaleExecutions,
  getExecution,
  getLastExecution,
  subscribeExecution,
  reportedExecutionStage,
  EXECUTION_STALE_AFTER_MS,
  __resetExecutionRuntimeForTests,
} from '../ai-tools/ezrab-ai/executionRuntime';
import {
  fnv1a64Hex,
  canonicalStringify,
  freezeRabSnapshot,
  volumeFormulaOf,
  wbsTraceText,
} from '../export/fiveSheetPreset';
import { createRabItemRecord } from '../engine/rab/rabItemFactory';
import { normalizeSections } from '../engine/unifiedProjectEngine';

const here = dirname(fileURLToPath(import.meta.url));
const readSrc = (rel: string): string =>
  readFileSync(join(here, rel), 'utf8');

/* ================================================================== */
/* S9-1 — P3B-O4: guard batch4RecapAlignment pin 2-hop                 */
/* ================================================================== */

describe('S9-1 — P3B-O4: guard rekapitulasi pin 2-hop (bukan 1-hop basi)', () => {
  it('berkas tes batch4 mengasersi kedua hop delegasi', () => {
    const t = readSrc('./batch4RecapAlignment.test.ts');
    expect(t).toContain('from "./rekapSummary"');
    expect(t).toContain('computeRekapSummary(items, currentProject)');
    expect(t).toContain('recalculateCostSummary(items as never');
  });

  it('asersi 1-hop lama sudah hilang (bukan dilonggarkan — diganti 2-hop)', () => {
    const t = readSrc('./batch4RecapAlignment.test.ts');
    expect(t).not.toContain("src.includes('recalculateCostSummary')");
    expect(t).toContain('2-hop');
  });

  it('rantai delegasi benar-benar ada di kode produksi (view + rekapSummary)', () => {
    const view = readSrc('../components/estimator/EstimatorRekapitulasiView.tsx');
    const rekap = readSrc('../components/estimator/rekapSummary.ts');
    expect(view).toContain('from "./rekapSummary"');
    expect(view).toContain('computeRekapSummary(items, currentProject)');
    expect(rekap).toContain('recalculateCostSummary(items as never');
    // View TIDAK memanggil engine langsung (itulah sebab pin 1-hop basi).
    expect(view).not.toContain('recalculateCostSummary');
  });
});

/* ================================================================== */
/* S9-2 — Residu anggaran P3A (OF-2 diperbaiki; OF-1 dilaporkan)       */
/* ================================================================== */

const PROD_RESERVED = 7747; // reservedChars produksi (addendum G2-F1)

function longHistoryWithOldToken(token: string) {
  const messages = Array.from({ length: 19 }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content:
      i === 0
        ? `${token} pondasi cakar ayam kedalaman 2 meter.`
        : `Pesan riwayat ${i} tentang beton.`,
  }));
  messages.push({
    role: 'user' as const,
    content: 'Berapa total RAB pondasi cakar ayam?',
  });
  return messages;
}

describe('S9-2a — P3A-OF-2: summaryBudget=0 tidak mengklaim cakupan ringkasan', () => {
  it('stored summary + summaryBudget=0: cakupan 0, semua pesan pool jadi kandidat', () => {
    const token = 'TOKEN-LAMA-STORED-S9-UNIK';
    const built = buildCanonicalContext({
      projectId: 'P-S9',
      messages: longHistoryWithOldToken(token),
      dedSection: `DED-${'d'.repeat(2000)}`,
      qtoSection: `QTO-${'q'.repeat(2000)}`,
      storedSummary: {
        text: 'Ringkasan tersimpan: membahas pondasi, beton, sloof, kolom, atap, dan anggaran.',
        messageCount: 9,
        updatedAt: '2026-11-13T00:00:00.000Z',
      } as never,
      reservedChars: PROD_RESERVED,
    });
    expect(built.report.budget.summary).toBe(0);
    expect(built.report.budget.ded).toBe(800);
    expect(built.report.budget.qto).toBe(353);
    // Ringkasan hanya penanda (73 karakter, 0 isi) → cakupan 0.
    expect(built.report.sections.summary.included).toBe(0);
    expect(built.report.retrieval.considered).toBe(19);
    // Pesan lama ke-0 kini dapat di-retrieval (sebelum S9: hilang).
    expect(built.dataBlock.includes(token)).toBe(true);
    // Header jujur: tanpa klaim "mencakup N pesan".
    expect(built.dataBlock).toContain('RINGKASAN PERCAKAPAN (sumber: stored):');
    expect(built.dataBlock).not.toContain('mencakup 9 pesan');
  });

  it('computed summary + summaryBudget=0: cakupan 0, semua pesan pool jadi kandidat', () => {
    const token = 'TOKEN-LAMA-COMPUTED-S9-UNIK';
    const built = buildCanonicalContext({
      projectId: 'P-S9',
      messages: longHistoryWithOldToken(token),
      dedSection: `DED-${'d'.repeat(2000)}`,
      qtoSection: `QTO-${'q'.repeat(2000)}`,
      reservedChars: PROD_RESERVED,
    });
    expect(built.report.budget.summary).toBe(0);
    expect(built.report.summarySource).toBe('computed');
    expect(built.report.sections.summary.included).toBe(0);
    expect(built.report.retrieval.considered).toBe(19);
    expect(built.dataBlock.includes(token)).toBe(true);
  });

  it('kontrol: summaryBudget>0 + stored summary — klaim cakupan TIDAK berubah', () => {
    const built = buildCanonicalContext({
      projectId: 'P-S9',
      messages: longHistoryWithOldToken('TOKEN-KONTROL-S9'),
      storedSummary: {
        text: 'Ringkasan tersimpan: membahas pondasi, beton, sloof, kolom, atap, dan anggaran.',
        messageCount: 9,
        updatedAt: '2026-11-13T00:00:00.000Z',
      } as never,
      reservedChars: 0,
    });
    expect(built.report.budget.summary).toBe(2000);
    expect(built.report.sections.summary.included).toBe(9);
    expect(built.report.retrieval.considered).toBe(10);
  });

  it('aritmetika anggaran produksi tidak berubah oleh koreksi cakupan', () => {
    const built = buildCanonicalContext({
      projectId: 'P-S9',
      messages: [{ role: 'user', content: 'Berapa spek beton dari DED?' }],
      dedSection: `DED-${'d'.repeat(600)}`,
      qtoSection: `QTO-${'q'.repeat(300)}`,
      reservedChars: PROD_RESERVED,
    });
    const b = built.report.budget;
    expect(b.total).toBe(16000);
    expect(b.reserved).toBe(7747);
    expect(b.data).toBe(8253);
    expect(b.facts).toBe(4000);
    expect(b.objective).toBe(800);
    expect(b.draft).toBe(800);
    expect(b.memory).toBe(1500);
    expect(b.ded).toBe(800);
    expect(b.qto).toBe(353);
    expect(b.summary).toBe(0);
  });
});

describe('S9-2b — P3A-OF-1: pelampauan cap dilaporkan, pesan terakhir utuh', () => {
  function worstCase() {
    const specs = Array.from({ length: 40 }, (_, i) => ({
      key: `spek-${i}`,
      label: `Spesifikasi-${i}`,
      value: `Nilai-spesifikasi-${i}-` + 'x'.repeat(120),
      status: 'CONFIRMED' as const,
      source: 'probe-s9',
    }));
    const messages = Array.from({ length: 19 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `Pesan riwayat ${i} tentang beton pondasi kolom sloof.`,
    }));
    messages.push({ role: 'user' as const, content: `PERMINTAAN-RAKSASA-S9 ${'y'.repeat(6500)}` });
    return buildCanonicalContext({
      projectId: 'P-S9',
      messages,
      structuredSpecs: specs as never,
      objectiveSection: 'O'.repeat(1200),
      draftSummary: { title: 'D'.repeat(1200), partCount: 3, itemCount: 40 },
      memorySection: 'M'.repeat(2000),
      dedSection: `DED-${'d'.repeat(2000)}`,
      qtoSection: `QTO-${'q'.repeat(2000)}`,
      reservedChars: PROD_RESERVED,
    });
  }

  it('worst case: pelampauan TERCATAT eksplisit dengan angka persis', () => {
    const built = worstCase();
    // Terukur pasca-S9: prompt 23.183 (+7.183) — MELEBIHI gateway 20.000.
    expect(built.report.promptChars).toBe(23183);
    expect(built.report.promptChars).toBeGreaterThan(20000);
    const over = built.report.truncations.find((t) => t.startsWith('cap prompt 16000 terlampaui'));
    expect(over).toBeDefined();
    expect(over!).toContain('23183 karakter');
    expect(over!).toContain('(+7183)');
    expect(over!).toContain('melebihi batas gateway 20.000');
  });

  it('worst case: pesan terakhir tetap utuh (tidak dipotong demi cap)', () => {
    const built = worstCase();
    expect(built.report.lastMessageOccurrences).toBe(1);
    expect(built.lastUserText.startsWith('PERMINTAAN-RAKSASA-S9')).toBe(true);
    expect(built.lastUserText.length).toBe(6073); // cap 6.000 + penanda
  });

  it('kasus normal (di bawah cap): TIDAK ada entri pelampauan', () => {
    const built = buildCanonicalContext({
      projectId: 'P-S9',
      messages: [{ role: 'user', content: 'Berapa total RAB pondasi?' }],
      reservedChars: PROD_RESERVED,
    });
    expect(built.report.promptChars).toBeLessThanOrEqual(CANONICAL_TOTAL_PROMPT_BUDGET);
    expect(
      built.report.truncations.some((t) => t.startsWith('cap prompt 16000 terlampaui')),
    ).toBe(false);
  });
});

/* ================================================================== */
/* S9-3 — Fallback satu-item P0: harga model tidak pernah RESOLVED     */
/* (premise tugas basi — P1 sudah memperbaikinya; dipin di sini)       */
/* ================================================================== */

describe('S9-3 — Fallback satu-item: harga model tidak pernah RESOLVED', () => {
  const prices: Array<number | null> = [0, 1, 150000, 999999999, null];

  it('classifyModelPriceProvenance: tidak pernah RESOLVED (sweep nilai)', () => {
    for (const p of prices) {
      const c = classifyModelPriceProvenance(p);
      expect(c.priceStatus).not.toBe('PRICE_RESOLVED');
      if (p == null) {
        expect(c.priceStatus).toBe('PRICE_UNRESOLVED');
        expect(c.priceSourceKind).toBe('UNRESOLVED');
        expect(c.priceSourceLabel).toBe('Belum ada harga');
      } else {
        expect(c.priceStatus).toBe('PRICE_ESTIMATED');
        expect(c.priceSourceKind).toBe('EZRAB_ASSUMPTION');
        expect(c.priceSourceLabel).toBe('Estimasi AI');
      }
      expect(c.verificationStatus).toBe('NEEDS_VERIFICATION');
    }
  });

  it('buildAiSuggestedRabItem: payload tidak pernah RESOLVED (termasuk nol eksplisit)', () => {
    const mk = (unitPrice: number | null): AiGeneratedItemState => ({
      code: 'AI.01',
      description: 'Item saran AI S9',
      category: 'Pekerjaan Beton',
      volume: 10,
      unit: 'm³',
      unitPrice,
      notes: 'Dianalisis oleh EZRAB AI.',
    });
    for (const p of [0, 150000, 999999999]) {
      const payload = buildAiSuggestedRabItem(mk(p), 5);
      expect(payload.priceStatus).toBe('PRICE_ESTIMATED');
      expect(payload.priceSourceKind).toBe('EZRAB_ASSUMPTION');
      expect(payload.verificationStatus).toBe('NEEDS_VERIFICATION');
      expect(payload.amount).toBe(Math.round(10 * p));
      expect(payload.unitPrice).toBe(p);
    }
    const nullPayload = buildAiSuggestedRabItem(mk(null), 5);
    expect(nullPayload.priceStatus).toBe('PRICE_UNRESOLVED');
    expect(nullPayload.unitPrice).toBeNull();
    expect(nullPayload.amount).toBeNull();
    expect(nullPayload.totalPrice).toBeNull();
  });

  it('handleSaveAiItem memakai helper P1 (satu-satunya jalur simpan AI)', () => {
    const modal = readSrc('../components/estimator/SmartAddWorkItemModal.tsx');
    expect(modal).toContain(
      'await onAddItem(buildAiSuggestedRabItem(aiGeneratedItem, existingItems.length))',
    );
    expect(modal).not.toContain(
      "aiGeneratedItem.unitPrice == null ? 'PRICE_UNRESOLVED' : 'PRICE_RESOLVED'",
    );
  });

  it('alur fallback satu-item TETAP ADA (tidak dihapus S9)', () => {
    const modal = readSrc('../components/estimator/SmartAddWorkItemModal.tsx');
    expect(modal).toContain('const handleGenerateAiItem = async ()');
    expect(modal).toContain('const handleSaveAiItem = async ()');
    expect(modal).toContain('Analisis cepat satu item di sini (fallback');
  });
});

/* ================================================================== */
/* S9-4 — Fallback template: harga baked tidak pernah RESOLVED         */
/* ================================================================== */

describe('S9-4 — Fallback template: harga baked tidak pernah RESOLVED', () => {
  it('fallback baked (mesin gagal + estimasi baked) → PRICE_ESTIMATED', () => {
    const fake = {
      id: 'tidak-ada-s9',
      workItems: [
        {
          stableId: 'b-1',
          wbsCode: '01.01',
          name: 'Item Baked S9',
          unit: 'm²',
          ahspCandidates: [{ ahspCode: 'X.1', unitPriceEstimate: 123456 }],
        },
        {
          stableId: 'b-2',
          wbsCode: '01.02',
          name: 'Item Tanpa Baked S9',
          unit: 'm²',
          ahspCandidates: [],
        },
      ],
    } as never;
    const map = resolveTemplatePickerPricing(fake);
    const baked = map.get('b-1')!;
    expect(baked.engineOk).toBe(false);
    expect(baked.unitPrice).toBe(123456);
    expect(baked.volume).toBe(1);
    expect(baked.priceStatus).toBe('PRICE_ESTIMATED');
    expect(baked.priceStatus).not.toBe('PRICE_RESOLVED');
    const empty = map.get('b-2')!;
    expect(empty.unitPrice).toBeNull();
    expect(empty.priceStatus).toBe('PRICE_UNRESOLVED');
  });

  it('verifikasi ulang audit: 0 unitPriceEstimate di seluruh registry master (10 template)', () => {
    const all = masterBuildingTemplateRegistry.getAllTemplates();
    expect(all.length).toBe(10);
    let candidatesChecked = 0;
    let violations = 0;
    for (const t of all) {
      for (const w of t.workItems ?? []) {
        for (const c of (w as { ahspCandidates?: Array<{ unitPriceEstimate?: number }> }).ahspCandidates ?? []) {
          candidatesChecked++;
          if (c.unitPriceEstimate != null) violations++;
        }
      }
    }
    expect(candidatesChecked).toBeGreaterThan(0);
    expect(violations).toBe(0);
  });

  it('jalur mesin TIDAK berubah: T36 tetap 24 ber-harga (22 benchmark + 2 official)', () => {
    const tpl = masterBuildingTemplateRegistry
      .getAllTemplates()
      .find((t) => t.id === 'template-house-type-36-single-floor')!;
    const map = resolveTemplatePickerPricing(tpl);
    expect(map.size).toBe(25);
    const priced = [...map.values()].filter((p) => p.unitPrice != null);
    expect(priced.length).toBe(24);
    expect(priced.filter((p) => p.priceKind === 'BENCHMARK').length).toBe(22);
    const official = [...map.values()].filter((p) => p.priceKind === 'OFFICIAL');
    expect(official.length).toBe(2);
    for (const o of official) expect(o.priceStatus).toBe('PRICE_RESOLVED');
    for (const p of map.values()) expect(p.engineOk).toBe(true);
  });

  it('penanda (est.) di picker mengikuti STATUS harga (bukan kind mesin)', () => {
    const modal = readSrc('../components/estimator/SmartAddWorkItemModal.tsx');
    expect(modal).toContain("pricing?.priceStatus === 'PRICE_ESTIMATED' ? ' (est.)' : ''");
    expect(modal).not.toContain("pricing?.priceKind === 'BENCHMARK' ? ' (est.)' : ''");
  });

  it('KARAKTERISASI — cabang fallback ?? di handleSaveTemplateItems dibiarkan (tak terjangkau; pin P1)', () => {
    // P1 membuktikan cabang RESOLVED ini tak terjangkau (pricing undefined
    // ⇒ estPrice null ⇒ UNRESOLVED) dan pin P1 menguncinya; S9 tidak
    // mengubahnya (berkas tes P1 di luar daftar yang diizinkan S9).
    const modal = readSrc('../components/estimator/SmartAddWorkItemModal.tsx');
    expect(modal).toContain(
      "priceStatus: pricing?.priceStatus ?? (estPrice == null ? 'PRICE_UNRESOLVED' : 'PRICE_RESOLVED')",
    );
  });

  it('KARAKTERISASI — rabTemplateService:1852 konsisten kontrak S2 (MARKET_REFERENCE = bukti RESOLVED)', () => {
    // Resolver template: OFFICIAL (katalog kanonis, komposisi FULL) dan
    // MARKET_REFERENCE (material tertaut / harga referensi template)
    // sama-sama membawa kind + label + penjelasan; kind REFERENSI
    // dinyatakan 'BUKAN harga resmi' di penjelasannya — yang dilabeli
    // RESOLVED adalah status keterisian harga berbukti, bukan klaim
    // resmi. Kontrak S2 (hasResolvedPriceEvidence) mengakui
    // MARKET_REFERENCE sebagai bukti RESOLVED — karena itu baris 1852
    // TIDAK diubah S9.
    const svc = readSrc('../services/rabTemplateService.ts');
    expect(svc).toContain("priceStatus: unitPrice == null ? 'PRICE_UNRESOLVED' : 'PRICE_RESOLVED'");
    expect(svc).toContain("kind: 'MARKET_REFERENCE'");
    expect(svc).toContain('BUKAN harga resmi AHSP');
    const universal = readSrc('../ai-tools/ezrab-ai/universalRab.ts');
    expect(universal).toContain('hasResolvedPriceEvidence');
    expect(universal).toContain("'MARKET_REFERENCE'");
  });
});

/* ================================================================== */
/* S9-5 — Pelaporan tahap deterministik dari log event                 */
/* ================================================================== */

describe('S9-5 — Pelaporan tahap deterministik dari log event', () => {
  it('null/undefined → null (tanpa record, tanpa klaim tahap)', () => {
    expect(reportedExecutionStage(null)).toBeNull();
    expect(reportedExecutionStage(undefined)).toBeNull();
  });

  it('begin → preparing; emit berurutan → tahap terakhir; duplikat → tetap', () => {
    __resetExecutionRuntimeForTests();
    const h = beginExecution('conv-s9-1', 'P-S9');
    expect(reportedExecutionStage(getExecution(h.record.requestId))).toBe('preparing');
    emitExecutionStage(h.record.requestId, 'reading-documents');
    expect(reportedExecutionStage(getExecution(h.record.requestId))).toBe('reading-documents');
    emitExecutionStage(h.record.requestId, 'contacting-model');
    emitExecutionStage(h.record.requestId, 'mapping-ahsp');
    expect(reportedExecutionStage(getExecution(h.record.requestId))).toBe('mapping-ahsp');
    emitExecutionStage(h.record.requestId, 'mapping-ahsp'); // duplikat: no-op
    const rec = getExecution(h.record.requestId)!;
    expect(reportedExecutionStage(rec)).toBe('mapping-ahsp');
    expect(rec.stageHistory.filter((e) => e.stage === 'mapping-ahsp')).toHaveLength(1);
  });

  it('finish completed → completed; awaiting-review dipertahankan saat completed', () => {
    __resetExecutionRuntimeForTests();
    const a = beginExecution('conv-s9-2a', 'P-S9');
    emitExecutionStage(a.record.requestId, 'validating');
    finishExecution(a.record.requestId, 'completed');
    expect(reportedExecutionStage(getExecution(a.record.requestId))).toBe('completed');
    const b = beginExecution('conv-s9-2b', 'P-S9');
    emitExecutionStage(b.record.requestId, 'awaiting-review');
    finishExecution(b.record.requestId, 'completed');
    const recB = getExecution(b.record.requestId)!;
    expect(recB.status).toBe('completed');
    expect(reportedExecutionStage(recB)).toBe('awaiting-review');
  });

  it('cancel → cancelled; emit sesudah terminal ditolak (laporan tidak berubah)', () => {
    __resetExecutionRuntimeForTests();
    const h = beginExecution('conv-s9-3', 'P-S9');
    emitExecutionStage(h.record.requestId, 'contacting-model');
    cancelExecution(h.record.requestId);
    expect(reportedExecutionStage(getExecution(h.record.requestId))).toBe('cancelled');
    expect(emitExecutionStage(h.record.requestId, 'validating')).toBeNull();
    expect(reportedExecutionStage(getExecution(h.record.requestId))).toBe('cancelled');
  });

  it('prune interrupted: status berubah, tahap terakhir tetap tahap nyata terakhir', () => {
    __resetExecutionRuntimeForTests();
    const a = beginExecution('conv-s9-4', 'P-S9');
    emitExecutionStage(a.record.requestId, 'contacting-model');
    beginExecution('conv-s9-4', 'P-S9'); // A tersupersede
    const report = pruneStaleExecutions('conv-s9-4', Date.now() + EXECUTION_STALE_AFTER_MS + 1000);
    expect(report.interrupted).toContain(a.record.requestId);
    const recA = getExecution(a.record.requestId)!;
    expect(recA.status).toBe('interrupted');
    expect(reportedExecutionStage(recA)).toBe('contacting-model');
  });

  it('placeholder (belum pernah dieksekusi) → null — tanpa event, tanpa klaim', () => {
    __resetExecutionRuntimeForTests();
    const unsub = subscribeExecution('conv-s9-5-kosong', () => {});
    try {
      const last = getLastExecution('conv-s9-5-kosong')!;
      // Divergensi yang diperbaiki reporter: field stage mengklaim
      // 'completed' padahal histori event KOSONG.
      expect(last.stage).toBe('completed');
      expect(last.stageHistory).toHaveLength(0);
      expect(reportedExecutionStage(last)).toBeNull();
    } finally {
      unsub();
    }
  });

  it('invarian: reported === record.stage pada semua record NYATA di seluruh lifecycle', () => {
    __resetExecutionRuntimeForTests();
    const checkInvariant = (id: string) => {
      const rec = getExecution(id)!;
      expect(reportedExecutionStage(rec)).toBe(rec.stage);
    };
    const h = beginExecution('conv-s9-6', 'P-S9');
    checkInvariant(h.record.requestId);
    for (const s of ['reading-documents', 'contacting-model', 'calculating-quantities', 'validating', 'awaiting-review'] as const) {
      emitExecutionStage(h.record.requestId, s);
      checkInvariant(h.record.requestId);
    }
    finishExecution(h.record.requestId, 'completed');
    checkInvariant(h.record.requestId);
    const h2 = beginExecution('conv-s9-6b', 'P-S9');
    cancelExecution(h2.record.requestId);
    checkInvariant(h2.record.requestId);
  });

  it('UI memakai reporter: view + modal tidak lagi membaca .stage mentah untuk tampil', () => {
    const view = readSrc('../ai-tools/ezrab-ai/view.tsx');
    expect(view).toContain('reportedExecutionStage(activeExec)');
    expect(view).toContain('reportedActiveStage');
    expect(view).not.toContain('activeExec.stage');
    const modal = readSrc('../components/estimator/SmartAddWorkItemModal.tsx');
    expect(modal).toContain('reportedExecutionStage(modalActive)');
    expect(modal).toContain('reportedExecutionStage(active)');
    expect(modal).not.toContain('modalActive.stage');
    expect(modal).not.toContain('active?.stage');
  });
});

/* ================================================================== */
/* S9-6 — Hash snapshot FNV-1a DIPERTAHANKAN (non-kriptografis)        */
/* ================================================================== */

describe('S9-6 — Hash snapshot FNV-1a dipertahankan + terdokumentasi', () => {
  it('vektor uji FNV-1a 64-bit baku (implementasi standar, bukan varian)', () => {
    expect(fnv1a64Hex('')).toBe('cbf29ce484222325'); // basis offset
    expect(fnv1a64Hex('a')).toBe('af63dc4c8601ec8c'); // vektor publik FNV-1a
    expect(fnv1a64Hex('EZRAB-S9-HASH-PIN')).toBe('2ef9acb69c830c93');
  });

  it('deterministik + format hex 16; canonicalStringify mengurutkan kunci', () => {
    expect(fnv1a64Hex('konten-snapshot-S9')).toBe(fnv1a64Hex('konten-snapshot-S9'));
    expect(fnv1a64Hex('konten-snapshot-S9')).toMatch(/^[0-9a-f]{16}$/);
    expect(canonicalStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalStringify({ a: 2, b: 1 })).toBe('{"a":2,"b":1}');
  });

  function mkFreezeInput() {
    const project = {
      id: 'P-S9',
      name: 'Proyek Uji S9',
      currentVersion: 'Rev 01',
      sections: [],
      rabItems: [],
      costSummary: {},
    } as never;
    const sections = [
      {
        id: 'sec-1',
        code: 'A',
        name: 'PEKERJAAN STRUKTUR',
        subtotal: 1000000,
        items: [
          {
            id: 'i-1',
            description: 'Beton K-300 S9',
            volume: 10,
            unit: 'm³',
            unitPrice: 100000,
            amount: 1000000,
            totalPrice: 1000000,
            priceStatus: 'PRICE_RESOLVED',
            verificationStatus: 'VERIFIED',
            wbsCode: '01.01',
            wbsNodeId: 'wbs:jalan',
            wbsMappingStatus: 'CONFIRMED',
          },
        ],
      },
    ] as never;
    const costs = {
      directCost: 1000000,
      overheadAmount: 0,
      profitAmount: 0,
      taxAmount: 0,
      grandTotal: 1000000,
    } as never;
    const summary = {
      pricedCount: 1,
      unpricedCount: 0,
      pricedTotal: 1000000,
      officialTotal: 1000000,
      marketTotal: 0,
      manualTotal: 0,
      otherTotal: 0,
      isPartial: false,
      partialItemCount: 0,
      isMixed: false,
    } as never;
    return { project, sections, costs, summary };
  }

  it('freezeRabSnapshot: konten sama → hash sama; createdAt/actor tidak ikut di-hash', () => {
    const a = mkFreezeInput();
    const b = mkFreezeInput();
    const s1 = freezeRabSnapshot(a.project, a.sections, a.costs, a.summary, {
      actor: 'demo/anonim',
      createdAt: '2026-11-13T10:00:00.000Z',
    });
    const s2 = freezeRabSnapshot(b.project, b.sections, b.costs, b.summary, {
      actor: 'aktor-lain-s9',
      createdAt: '2026-11-14T10:00:00.000Z',
    });
    expect(s1.snapshotHash).toBe(s2.snapshotHash);
    expect(s1.snapshotHash).toMatch(/^[0-9a-f]{16}$/);
    expect(s1.itemCount).toBe(1);
  });

  it('freezeRabSnapshot: hash MENGIKAT isi (amount / wbsCode berubah → hash berubah)', () => {
    const a = mkFreezeInput();
    const base = freezeRabSnapshot(a.project, a.sections, a.costs, a.summary, {
      createdAt: '2026-11-13T10:00:00.000Z',
    });
    const changed = mkFreezeInput();
    (changed.sections[0].items[0] as { amount: number }).amount = 1000001;
    const sChanged = freezeRabSnapshot(changed.project, changed.sections, changed.costs, changed.summary, {
      createdAt: '2026-11-13T10:00:00.000Z',
    });
    expect(sChanged.snapshotHash).not.toBe(base.snapshotHash);
    const stripped = mkFreezeInput();
    delete (stripped.sections[0].items[0] as { wbsCode?: string }).wbsCode;
    const sStripped = freezeRabSnapshot(stripped.project, stripped.sections, stripped.costs, stripped.summary, {
      createdAt: '2026-11-13T10:00:00.000Z',
    });
    expect(sStripped.snapshotHash).not.toBe(base.snapshotHash);
  });

  it('dokumentasi: tujuan non-kriptografis dinyatakan akurat di kode', () => {
    const preset = readSrc('../export/fiveSheetPreset.ts');
    expect(preset).toContain('NON-KRIPTOGRAFIS');
    expect(preset).toContain('sidik jari integritas deterministik');
    expect(preset).toContain('TIDAK BOLEH dipakai untuk membuktikan');
    expect(preset).toContain('BUKAN hash kriptografis');
  });

  it('tidak ada pengganti kriptografis sinkron yang cocok di sisi klien', () => {
    const security = readSrc('../../api/_lib/security.js');
    expect(security).toContain("from 'node:crypto'");
    expect(security).toContain('export function sha256hex');
    const preset = readSrc('../export/fiveSheetPreset.ts');
    // Dokumen BOLEH menyebut nama-nama itu (penjelasan mengapa tidak
    // dipakai — lihat doc fnv1a64Hex); yang dilarang adalah MENGIMPOR
    // / MEMAKAINYA: tidak ada impor node:crypto/security dan tidak ada
    // pemanggilan crypto.subtle.digest / sha256hex.
    const importLines = preset.split('\n').filter((l) => /^\s*import\b/.test(l));
    expect(importLines.some((l) => l.includes('node:crypto'))).toBe(false);
    expect(importLines.some((l) => l.includes('security'))).toBe(false);
    expect(preset).not.toContain('crypto.subtle.digest(');
    expect(preset).not.toContain('sha256hex(');
  });
});

/* ================================================================== */
/* S9-7/8 — Tipe: calculationFormula (RabItem) + field WBS (S6-O5)     */
/* ================================================================== */

describe('S9-7/8 — Deklarasi tipe aditif + aliran field', () => {
  function typeBlock(startMarker: string, endMarker: string): string {
    const src = readSrc('../types/index.ts');
    const start = src.indexOf(startMarker);
    const end = src.indexOf(endMarker, start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    return src.slice(start, end);
  }

  it('RabItem mendeklarasikan calculationFormula (S4-O1 — yang benar-benar kurang)', () => {
    const rab = typeBlock('export interface RabItem {', 'export interface AhspResource {');
    expect(rab).toContain('calculationFormula?: string');
  });

  it('RABItem SUDAH mendeklarasikan calculationFormula sejak HEAD (premise S4-O1 terkoreksi)', () => {
    const item = typeBlock('export interface RABItem {', 'export interface RABSubSection {');
    expect(item).toContain('calculationFormula?: string');
  });

  it('field WBS S6-O5 dideklarasikan di RabItem + RABItem (aditif, opsional)', () => {
    const rab = typeBlock('export interface RabItem {', 'export interface AhspResource {');
    expect(rab).toContain('wbsCode?: string');
    expect(rab).toContain('wbsNodeId?: string');
    expect(rab).toContain("wbsMappingStatus?: 'CONFIRMED' | 'PROVISIONAL' | 'UNMAPPED'");
    expect(rab).toContain('wbsSuggestedNodeId?: string');
    const item = typeBlock('export interface RABItem {', 'export interface RABSubSection {');
    expect(item).toContain('wbsCode?: string');
    expect(item).toContain('wbsNodeId?: string');
    expect(item).toContain("wbsMappingStatus?: 'CONFIRMED' | 'PROVISIONAL' | 'UNMAPPED'");
    expect(item).toContain('wbsSuggestedNodeId?: string');
  });

  it('factory meneruskan calculationFormula + field WBS ke record', () => {
    const rec = createRabItemRecord(
      {
        description: 'Item Rumus S9',
        volume: 10,
        unit: 'm³',
        unitPrice: 100000,
        calculationFormula: '10 × 0.15 × 0.3',
        wbsCode: '01.01',
        wbsNodeId: 'wbs:jalan',
        wbsMappingStatus: 'CONFIRMED',
        wbsSuggestedNodeId: 'wbs:pondasi',
      } as never,
      'P-S9',
    );
    expect((rec as never as { calculationFormula?: string }).calculationFormula).toBe('10 × 0.15 × 0.3');
    expect(rec.wbsCode).toBe('01.01');
    expect((rec as never as { wbsNodeId?: string }).wbsNodeId).toBe('wbs:jalan');
    expect((rec as never as { wbsMappingStatus?: string }).wbsMappingStatus).toBe('CONFIRMED');
    expect((rec as never as { wbsSuggestedNodeId?: string }).wbsSuggestedNodeId).toBe('wbs:pondasi');
  });

  it('normalizeSections meneruskan calculationFormula + field WBS ke RABItem', () => {
    const rec = createRabItemRecord(
      {
        description: 'Item Rumus S9',
        volume: 10,
        unit: 'm³',
        unitPrice: 100000,
        calculationFormula: '10 × 0.15 × 0.3',
        wbsCode: '01.01',
        wbsNodeId: 'wbs:jalan',
        wbsMappingStatus: 'CONFIRMED',
        wbsSuggestedNodeId: 'wbs:pondasi',
      } as never,
      'P-S9',
    );
    const project = {
      id: 'P-S9',
      name: 'Proyek Uji S9',
      currentVersion: 'Rev 01',
      sections: [],
      rabItems: [rec],
      costSummary: {},
    } as never;
    const sections = normalizeSections(project, [rec] as never);
    const flat = sections.flatMap((s) => (s.items || []) as never as Array<Record<string, unknown>>);
    expect(flat.length).toBe(1);
    expect(flat[0].calculationFormula).toBe('10 × 0.15 × 0.3');
    expect(flat[0].wbsCode).toBe('01.01');
    expect(flat[0].wbsNodeId).toBe('wbs:jalan');
    expect(flat[0].wbsMappingStatus).toBe('CONFIRMED');
    expect(flat[0].wbsSuggestedNodeId).toBe('wbs:pondasi');
  });

  it('ekspor membaca field yang dideklarasikan (Sheet 4 rumus + Sheet 2 trace WBS)', () => {
    expect(volumeFormulaOf({ calculationFormula: '10 × 0.15 × 0.3' } as never)).toBe('10 × 0.15 × 0.3');
    expect(volumeFormulaOf({} as never)).toBe('Tidak tersedia');
    const trace = wbsTraceText({
      wbsCode: '01.01',
      wbsNodeId: 'wbs:jalan',
      wbsMappingStatus: 'CONFIRMED',
    } as never);
    expect(trace.startsWith('TERPETAKAN —')).toBe(true);
    expect(trace).toContain('Kode: 01.01');
  });
});

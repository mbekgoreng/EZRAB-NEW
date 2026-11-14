/**
 * P1 (2026-11-13, B-05) — harga model tidak pernah PRICE_RESOLVED.
 *
 * Audit Autonomous Estimation membuktikan pemetaan item AI di
 * SmartAddWorkItemModal melabeli harga model verbatim (angka dari LLM,
 * tanpa bukti resmi) sebagai PRICE_RESOLVED — status yang sama dengan
 * harga terverifikasi — tanpa priceSourceKind sama sekali.
 *
 * Klasifikasi perbaikan (kosakata yang SUDAH ADA, selaras pola kanonis):
 *  - harga model non-null → PRICE_ESTIMATED + priceSourceKind
 *    'EZRAB_ASSUMPTION' + label 'Estimasi AI' + NEEDS_VERIFICATION
 *    (finalizeMapping cabang AI_ESTIMATE + directRabPush estimasi);
 *  - harga null → PRICE_UNRESOLVED + 'UNRESOLVED' + NEEDS_VERIFICATION.
 *
 * Koreksi premis tugas: `isAssumption` / `assumptionNote` /
 * `evidenceDetails` TIDAK ADA di tipe `RabItem` — ketiganya hidup di
 * `RABItem` (tipe DED/dokumen). Saluran provenance `RabItem` adalah
 * `priceSourceKind` + `priceSourceLabel` + `priceSourceExplanation`,
 * dan ketiganya diteruskan factory apa adanya (dibuktikan kelompok
 * "factory" di bawah). Tes ini mengasersi saluran `RabItem` tersebut,
 * bukan field `RABItem` yang tidak bisa menempel di payload onAddItem.
 *
 * Batas null: "null tetap null (bukan 0)" diasersi di boundary modal
 * (payload onAddItem). Record tersimpan memakai sentinel 0 untuk
 * UNRESOLVED menurut kontrak factory yang sudah ada — total tetap
 * mengecualikannya (recalculateCostSummary) — dan itu di luar P1.
 *
 * Run: runner shim vitest (pola run-targeted-p0.sh). `afterAll` /
 * `afterEach` / `beforeAll` adalah NO-OP di shim — suite ini tidak
 * mengandalkannya (tanpa stub global).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  classifyModelPriceProvenance,
  buildAiSuggestedRabItem,
  aiSuggestedTotalNote,
  MODEL_PRICE_SOURCE_LABEL,
  MODEL_PRICE_SOURCE_EXPLANATION,
  MODEL_PRICE_MISSING_LABEL,
  MODEL_PRICE_MISSING_EXPLANATION,
} from '../components/estimator/SmartAddWorkItemModal';
import type { AiGeneratedItemState } from '../components/estimator/SmartAddWorkItemModal';
import { createRabItemRecord } from '../engine/rab/rabItemFactory';

const aiItem = (over: Partial<AiGeneratedItemState> = {}): AiGeneratedItemState => ({
  code: 'AI.01',
  description: 'Pekerjaan plesteran dinding bata',
  category: 'Pekerjaan Dinding',
  volume: 10,
  unit: 'm²',
  unitPrice: 150000,
  notes: 'Dianalisis oleh EZRAB AI.',
  ...over,
});

/* ================================================================== */
/* (a) Harga model non-null TIDAK PERNAH PRICE_RESOLVED               */
/* ================================================================== */

describe('P1 — classifyModelPriceProvenance: harga model tidak pernah PRICE_RESOLVED', () => {
  it('harga model biasa → PRICE_ESTIMATED (bukan RESOLVED)', () => {
    const p = classifyModelPriceProvenance(150000);
    expect(p.priceStatus).toBe('PRICE_ESTIMATED');
    expect(p.priceStatus).not.toBe('PRICE_RESOLVED');
  });

  it('sweep nilai: 1, 0, pecahan, besar — semuanya ESTIMATED, tidak ada RESOLVED', () => {
    for (const v of [1, 0, 0.5, 0.01, 999999999, 1234567.89]) {
      const p = classifyModelPriceProvenance(v);
      expect(p.priceStatus).toBe('PRICE_ESTIMATED');
      expect(p.priceStatus).not.toBe('PRICE_RESOLVED');
    }
  });

  it('nol eksplisit dari model tetap ESTIMATED (bukan RESOLVED ala harga manual)', () => {
    // Aturan "0 eksplisit = harga nyata" di resolvePriceStatus berlaku
    // untuk harga yang dimasukkan user; 0 dari model tetap belum
    // terverifikasi, sehingga plafon jujurnya ESTIMATED.
    const p = classifyModelPriceProvenance(0);
    expect(p.priceStatus).toBe('PRICE_ESTIMATED');
    expect(p.priceSourceKind).toBe('EZRAB_ASSUMPTION');
  });

  it('payload builder: harga model non-null → PRICE_ESTIMATED', () => {
    const payload = buildAiSuggestedRabItem(aiItem({ unitPrice: 87500 }), 4);
    expect(payload.priceStatus).toBe('PRICE_ESTIMATED');
    expect(payload.priceStatus).not.toBe('PRICE_RESOLVED');
    expect(payload.unitPrice).toBe(87500);
    expect(payload.amount).toBe(875000);
    expect(payload.totalPrice).toBe(875000);
  });
});

/* ================================================================== */
/* (b) priceSourceKind + label + penjelasan terisi dengan benar        */
/* ================================================================== */

describe('P1 — provenance harga model terisi lengkap', () => {
  it("priceSourceKind = 'EZRAB_ASSUMPTION' untuk harga model", () => {
    expect(classifyModelPriceProvenance(150000).priceSourceKind).toBe('EZRAB_ASSUMPTION');
    expect(buildAiSuggestedRabItem(aiItem(), 0).priceSourceKind).toBe('EZRAB_ASSUMPTION');
  });

  it("label = 'Estimasi AI' (selaras finalizeMapping cabang AI_ESTIMATE)", () => {
    expect(MODEL_PRICE_SOURCE_LABEL).toBe('Estimasi AI');
    expect(classifyModelPriceProvenance(150000).priceSourceLabel).toBe('Estimasi AI');
    expect(buildAiSuggestedRabItem(aiItem(), 0).priceSourceLabel).toBe('Estimasi AI');
  });

  it('penjelasan menyebut saran model AI + belum terverifikasi', () => {
    const p = classifyModelPriceProvenance(150000);
    expect(p.priceSourceExplanation).toBe(MODEL_PRICE_SOURCE_EXPLANATION);
    expect(p.priceSourceExplanation).toContain('model AI');
    expect(p.priceSourceExplanation).toContain('belum terverifikasi');
    expect(p.priceSourceExplanation).toContain('AHSP');
  });

  it('verificationStatus dipertahankan NEEDS_VERIFICATION', () => {
    expect(classifyModelPriceProvenance(150000).verificationStatus).toBe('NEEDS_VERIFICATION');
    expect(buildAiSuggestedRabItem(aiItem(), 0).verificationStatus).toBe('NEEDS_VERIFICATION');
  });

  it('harga null → kind UNRESOLVED + label/penjelasan "belum ada harga"', () => {
    const p = classifyModelPriceProvenance(null);
    expect(p.priceSourceKind).toBe('UNRESOLVED');
    expect(p.priceSourceLabel).toBe(MODEL_PRICE_MISSING_LABEL);
    expect(p.priceSourceLabel).toBe('Belum ada harga');
    expect(p.priceSourceExplanation).toBe(MODEL_PRICE_MISSING_EXPLANATION);
    expect(p.priceSourceExplanation).toContain('tidak termasuk dalam total');
    expect(p.verificationStatus).toBe('NEEDS_VERIFICATION');
  });
});

/* ================================================================== */
/* (c) Harga hilang tetap null (tidak pernah Rp0) — boundary modal    */
/* ================================================================== */

describe('P1 — harga null tetap null di payload', () => {
  it('harga null → PRICE_UNRESOLVED + unitPrice/amount/totalPrice null', () => {
    const payload = buildAiSuggestedRabItem(aiItem({ unitPrice: null }), 2);
    expect(payload.priceStatus).toBe('PRICE_UNRESOLVED');
    expect(payload.priceSourceKind).toBe('UNRESOLVED');
    expect(payload.unitPrice).toBeNull();
    expect(payload.amount).toBeNull();
    expect(payload.totalPrice).toBeNull();
  });

  it('amount tidak pernah hasil Math.round(v * null) = 0', () => {
    const payload = buildAiSuggestedRabItem(aiItem({ volume: 25, unitPrice: null }), 0);
    expect(payload.amount).not.toBe(0);
    expect(payload.totalPrice).not.toBe(0);
  });
});

/* ================================================================== */
/* (d) Item tanpa kode AHSP tetap dapat disimpan sebagai non-AHSP      */
/* ================================================================== */

describe('P1 — item tanpa AHSP tetap dapat dipakai (non-AHSP, transparan)', () => {
  it("ahspCode '' dipertahankan — tidak dikarang, tidak ditolak", () => {
    const payload = buildAiSuggestedRabItem(aiItem(), 0);
    expect(payload.ahspCode).toBe('');
    // Semua medan wajib penyimpanan tetap terisi: item dapat disimpan.
    expect(payload.description).toBe('Pekerjaan plesteran dinding bata');
    expect(payload.volume).toBe(10);
    expect(payload.unit).toBe('m²');
    expect(payload.category).toBe('Pekerjaan Dinding');
    expect(payload.code).toBe('AI.01');
  });

  it('penomoran mengikuti jumlah item yang sudah ada', () => {
    expect(buildAiSuggestedRabItem(aiItem(), 0).no).toBe(1);
    expect(buildAiSuggestedRabItem(aiItem(), 7).no).toBe(8);
  });

  it('provenance tetap transparan walau tanpa AHSP', () => {
    const payload = buildAiSuggestedRabItem(aiItem(), 0);
    expect(payload.priceSourceKind).toBe('EZRAB_ASSUMPTION');
    expect(payload.verificationStatus).toBe('NEEDS_VERIFICATION');
    expect(payload.priceStatus).toBe('PRICE_ESTIMATED');
  });
});

/* ================================================================== */
/* (e) Total parsial dikomunikasikan (teks PARSIAL)                    */
/* ================================================================== */

describe('P1 — catatan total PARSIAL di pratinjau', () => {
  it('harga estimasi → PARSIAL + menyebut estimasi AI belum terverifikasi', () => {
    const note = aiSuggestedTotalNote(aiItem({ unitPrice: 150000 }));
    expect(note).toContain('PARSIAL');
    expect(note).toContain('TOTAL PARSIAL');
    expect(note).toContain('estimasi AI');
    expect(note).toContain('belum terverifikasi');
    expect(note).toContain('bukan harga resmi AHSP');
  });

  it('harga null → PARSIAL + tidak termasuk dalam total', () => {
    const note = aiSuggestedTotalNote(aiItem({ unitPrice: null }));
    expect(note).toContain('TOTAL PARSIAL');
    expect(note).toContain('belum dapat dihitung');
    expect(note).toContain('tidak termasuk dalam total');
  });

  it('pratinjau JSX merender catatan PARSIAL + penanda (est.) pada harga', () => {
    const modalSrc = readFileSync(
      new URL('../components/estimator/SmartAddWorkItemModal.tsx', import.meta.url),
      'utf8',
    );
    expect(modalSrc).toContain('{aiSuggestedTotalNote(aiGeneratedItem)}');
    expect(modalSrc).toContain("(est.)");
  });
});

/* ================================================================== */
/* Factory: klasifikasi selamat sampai record tersimpan                */
/* ================================================================== */

describe('P1 — klasifikasi selamat melewati createRabItemRecord (factory)', () => {
  it('PRICE_ESTIMATED + EZRAB_ASSUMPTION + label/penjelasan diteruskan factory', () => {
    const payload = buildAiSuggestedRabItem(aiItem(), 0);
    const rec = createRabItemRecord(payload, 'PRJ-P1-TEST');
    expect(rec.priceStatus).toBe('PRICE_ESTIMATED');
    expect(rec.priceSourceKind).toBe('EZRAB_ASSUMPTION');
    expect(rec.priceSourceLabel).toBe('Estimasi AI');
    expect(rec.priceSourceExplanation).toBe(MODEL_PRICE_SOURCE_EXPLANATION);
    expect(rec.verificationStatus).toBe('NEEDS_VERIFICATION');
    expect(rec.unitPrice).toBe(150000);
    expect(rec.amount).toBe(1500000);
  });

  it('item tanpa AHSP tidak mendapat flag UNSAFE dari factory', () => {
    const rec = createRabItemRecord(buildAiSuggestedRabItem(aiItem(), 0), 'PRJ-P1-TEST');
    expect(rec.ahspCode).toBe('');
    expect(rec.ahspIdentityStatus).toBeUndefined();
  });

  it('payload null-harga: factory memakai sentinel 0 + UNRESOLVED (kontrak lama, terdokumentasi)', () => {
    // Boundary modal: null. Factory: sentinel 0 untuk DISPLAY, tetapi
    // priceStatus UNRESOLVED membuat recalculateCostSummary
    // mengecualikannya dari total — bukan Rp0 valid. P1 tidak mengubah
    // kontrak sentinel ini.
    const payload = buildAiSuggestedRabItem(aiItem({ unitPrice: null }), 0);
    expect(payload.unitPrice).toBeNull();
    const rec = createRabItemRecord(payload, 'PRJ-P1-TEST');
    expect(rec.priceStatus).toBe('PRICE_UNRESOLVED');
    expect(rec.priceSourceKind).toBe('UNRESOLVED');
    expect(rec.unitPrice).toBe(0);
    expect(rec.verificationStatus).toBe('NEEDS_VERIFICATION');
  });
});

/* ================================================================== */
/* Kontrak-sumber: handler memakai helper; situs-2 & P0/G3 utuh       */
/* ================================================================== */

describe('P1 — kontrak-sumber modal', () => {
  const modalSrc = readFileSync(
    new URL('../components/estimator/SmartAddWorkItemModal.tsx', import.meta.url),
    'utf8',
  );

  it('handleSaveAiItem memakai buildAiSuggestedRabItem (bukan literal inline)', () => {
    expect(modalSrc).toContain('await onAddItem(buildAiSuggestedRabItem(aiGeneratedItem, existingItems.length))');
  });

  it('ternary lama harga-model → PRICE_RESOLVED sudah hilang', () => {
    expect(modalSrc).not.toContain(
      "aiGeneratedItem.unitPrice == null ? 'PRICE_UNRESOLVED' : 'PRICE_RESOLVED'",
    );
  });

  it('situs-2 template SENGAJA tidak diubah (jalur resolver, bukan model)', () => {
    // resolveTemplatePickerPricing: OFFICIAL (katalog resmi via
    // resolveUnitPrice) → RESOLVED; BENCHMARK → ESTIMATED; null →
    // UNRESOLVED. Cabang `??` RESOLVED tak terjangkau (pricing
    // undefined ⇒ estPrice null ⇒ UNRESOLVED). P1 membiarkannya.
    expect(modalSrc).toContain(
      "priceStatus: pricing?.priceStatus ?? (estPrice == null ? 'PRICE_UNRESOLVED' : 'PRICE_RESOLVED')",
    );
  });

  it('P0 + G3 tidak regresi: handler handoff & helper konteks tetap ada', () => {
    expect(modalSrc).toContain('const handleHandoffToChatAi = async ()');
    expect(modalSrc).toContain('buildSpreadsheetProjectContext');
    expect(modalSrc).toContain('buildSpreadsheetHandoffPayload');
    expect(modalSrc).toContain('Lanjutkan di Chat AI');
  });
});

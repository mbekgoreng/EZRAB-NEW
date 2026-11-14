/**
 * DED-to-RAB — Pemetaan finalisasi ke baris RAB spreadsheet.
 *
 * Latar (temuan audit 2026-10-27): kedua handler finalisasi di view.tsx
 * dulu hanya mengemas provenance ke string `notes`, padahal
 * `createRabItemRecord` TIDAK menyimpan `notes` — sehingga baris fallback
 * "Estimasi AI" mendarat di spreadsheet tanpa penanda apa pun dan
 * mendapat `verificationStatus` default 'VERIFIED' dari factory.
 *
 * Helper murni ini adalah SATU-SATUNYA tempat pemetaan provenance
 * finalisasi DED (standar + Full AI), agar kedua jalur tidak bisa
 * menyimpang diam-diam. Handler hanya memanggil helper ini.
 *
 * Kosakata yang dipakai semuanya sudah didukung factory/tipe RabItem
 * (tidak ada taksonomi status baru):
 * - priceSourceKind: 'OFFICIAL_AHSP' | 'MARKET_REFERENCE' |
 *   'EZRAB_ASSUMPTION' | 'UNRESOLVED' | 'USER_MANUAL'
 *   (src/types/index.ts). Pemetaan kanonisnya di dedProvenance.ts (§8):
 *   - kanonis tervalidasi → 'OFFICIAL_AHSP'
 *   - estimasi AI → 'EZRAB_ASSUMPTION' (perkiraan/asumsi, bukan data
 *     pasar maupun resmi) + label 'Estimasi AI' yang eksplisit
 *   - manual → 'USER_MANUAL' (G-PV-3, 2026-11-13 — dulu kind tidak
 *     diisi karena tidak ada kind yang jujur untuknya)
 * - priceStatus (G-PV-2, 2026-11-13): DITENTUKAN KONTRAK TRANSFER S2
 *   YANG SAMA DENGAN JALUR CHAT AI (transferPriceStatus /
 *   transferVerificationStatus, universalRab.ts) — bukan turunan
 *   factory dari sekadar adanya angka harga. Sebelum G-PV-2, input
 *   finalisasi DED tidak membawa priceStatus sama sekali sehingga
 *   factory menurunkannya via resolvePriceStatus(unitPrice) → SEMUA
 *   item berharga DED (termasuk estimasi AI) mendarat PRICE_RESOLVED.
 *   Kini: kanonis → PRICE_RESOLVED (klaim + bukti kind OFFICIAL_AHSP);
 *   AI → PRICE_ESTIMATED; manual → PRICE_MANUAL; warisan/tak dikenal
 *   → PRICE_ESTIMATED (plafon jujur S2 untuk harga valid tanpa klaim).
 * - verificationStatus: 'VERIFIED' HANYA untuk kanonis tervalidasi;
 *   estimasi AI dan manual → 'NEEDS_VERIFICATION' (bukan verifikasi
 *   independen, dan bukan pula klaim kanonis).
 * - priceCostBasis: 'DIRECT_COST' HANYA untuk cabang AHSP_2026
 *   (harga = Biaya Langsung gerbang kanonis); cabang lain tidak
 *   ditandai (basis tidak terbukti → fail-closed, O&P tetap ditagih).
 * - ahspCode HANYA diteruskan bila priceSource benar-benar AHSP_2026
 *   (kecocokan tervalidasi). Fallback AI tidak pernah membawa kode AHSP,
 *   meski itemnya punya ahspMatch NEEDS_REVIEW/INCOMPLETE.
 *
 * Item tanpa unitPrice mengembalikan null (tidak boleh menjadi baris
 * RAB berharga). Handler sudah menyaringnya, ini pertahanan kedua.
 *
 * S5 (2026-11-13, FINAL INTEGRITY REPAIR §5 — P3C-F2): rumus/dasar
 * hitung kuantitas diteruskan ke `calculationFormula` (RABItem) HANYA
 * bila rumus NYATA ada di sumber (DedAiItem.quantityFormula /
 * FullAiItem.quantity.formula / AiEstimateWorkItem.formula); tanpa
 * rumus, medan absen — ekspor Sheet 4 menampilkan 'Tidak tersedia'
 * (volumeFormulaOf), bukan karangan. BATAS YANG DIKETAHUI: factory
 * `createRabItemRecord` (rabItemFactory.ts, allowlist) saat ini TIDAK
 * meneruskan `calculationFormula`, sehingga rumus yang dipetakan di
 * sini belum mendarat di record RAB sampai factory diperbarui (di luar
 * pagar S5 — lihat laporan S5).
 */

import type { DedAiItem, DedEstimationPolicy } from './types';
import type { FullAiItem } from '../ded-full-ai/types';
import type { AiEstimateWorkItem } from '../../ai-estimate/types';
import { honestVolume } from '../../engine/honestVolume';
import type { PriceStatus, RabItem, VerificationStatus } from '../../types';
// G-PV-2 (DED DUAL MODE §8): kontrak transfer S2 yang sama dengan jalur
// Chat AI — provenance DED memakai kontrak yang sama, bukan turunan
// factory dari sekadar adanya angka harga.
import {
  transferPriceStatus,
  transferVerificationStatus,
  type TransferPriceInput,
} from '../ezrab-ai/universalRab';
import { dedTransferClaim, type DedTransferClaim } from './dedProvenance';

export interface DedFinalizeRabInput {
  description: string;
  volume: number;
  unit: string;
  unitPrice: number;
  category: string;
  ahspCode?: string;
  priceSourceKind?: RabItem['priceSourceKind'];
  /**
   * Status harga transfer (G-PV-2, §8) — hasil kontrak S2
   * (transferPriceStatus) atas klaim provenance DED, BUKAN turunan
   * factory. WAJIB diisi semua mapper: tanpanya factory menurunkannya
   * dari unitPrice dan estimasi AI mendarat PRICE_RESOLVED.
   */
  priceStatus: PriceStatus;
  priceSourceLabel: string;
  priceSourceExplanation: string;
  /**
   * Basis biaya harga satuan (§17.1, Gelombang 2 2026-11-13). Jalur DED
   * memakai unitPrice Biaya Langsung gerbang kanonis (comp.unitPrice —
   * total DHSP TIDAK PERNAH dipakai sebagai harga transfer, keputusan
   * owner 2026-10-27), sehingga cabang AHSP_2026 ditandai 'DIRECT_COST'.
   * Cabang estimasi AI / manual / warisan TIDAK ditandai: harganya bukan
   * komposisi Biaya Langsung yang terbukti — absen = fail-closed, O&P
   * tetap ditagih (perilaku lama).
   */
  priceCostBasis?: RabItem['priceCostBasis'];
  verificationStatus: VerificationStatus;
  /**
   * S5 (P3C-F2): rumus/dasar hitung kuantitas (calculationFormula
   * RABItem) — HANYA diisi bila rumus NYATA ada di sumber; absen =
   * tidak ada data (ekspor menampilkan 'Tidak tersedia').
   */
  calculationFormula?: string;
}

function baseExplanation(policy: DedEstimationPolicy, detail: string): string {
  return `${detail} · Mode: ${policy}`;
}

/**
 * G-PV-2 (§8): terapkan kontrak transfer S2 (universalRab.ts — fungsi
 * yang SAMA dengan yang dipakai buildPushPayload jalur Chat AI) ke
 * klaim provenance satu item DED. Klaim berasal dari dedTransferClaim
 * (dedProvenance.ts); S2 yang memutuskan status akhir:
 * - klaim RESOLVED + bukti (kind OFFICIAL_AHSP) → PRICE_RESOLVED;
 * - klaim RESOLVED TANPA bukti → PRICE_ESTIMATED (plafon jujur);
 * - klaim ESTIMATED / MANUAL dipertahankan apa adanya;
 * - tanpa klaim + harga valid → PRICE_ESTIMATED;
 * - harga tidak valid → PRICE_UNRESOLVED (tidak terjangkau dari
 *   mapper — handler + guard null di atas sudah menyaringnya — tapi
 *   dipertahankan sebagai pertahanan eksplisit).
 * Status verifikasi mengikuti aturan S2 yang sama: status eksplisit
 * dipertahankan; UNRESOLVED selalu NEEDS_VERIFICATION.
 */
function applyTransferContract(
  claim: DedTransferClaim,
  unitPrice: number,
): { priceStatus: PriceStatus; verificationStatus: VerificationStatus } {
  const input: TransferPriceInput = {
    priceStatus: claim.claimedPriceStatus ?? null,
    unitPrice,
    priceSourceKind: claim.priceSourceKind ?? null,
    verificationStatus: claim.claimedVerificationStatus,
  };
  const priceStatus = transferPriceStatus(input);
  return {
    priceStatus,
    verificationStatus: transferVerificationStatus(input, priceStatus),
  };
}

/**
 * S5 (P3C-F2): rumus hanya diteruskan bila benar-benar ada (string
 * tak kosong setelah trim). String kosong/whitespace = tidak ada data
 * (bukan rumus) → undefined, bukan karangan.
 */
function realFormula(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
}

/**
 * S5 (P3C-F2): rumus Magic AI hanya diteruskan bila NYATA. Pipeline
 * Magic AI (aiEstimatePipeline) SELALU mengisi `formula`, dengan dua
 * fallback sintetis bila tidak ada quantityFormula — keduanya BUKAN
 * rumus dan tidak boleh naik menjadi calculationFormula:
 *  (a) label `Volume geometri <nama> (<unit>)` (bukan hitungan);
 *  (b) gabungan sourceEvidence (teks bukti, bukan rumus).
 * Kedua fallback dikenali dengan pencocokan persis terhadap konstruksi
 * pipeline sendiri (bukan tebakan pola): nama/unit dari item yang sama
 * + assumptions (= sourceEvidence masukan pipeline). Rumus nyata
 * (quantityFormula) lolos dari kedua saringan ini.
 */
function magicAiRealFormula(item: AiEstimateWorkItem): string | undefined {
  const f = realFormula(item.formula);
  if (!f) return undefined;
  const name = item.item || item.workName;
  if (f === `Volume geometri ${name} (${item.unit || 'm2'})`) return undefined;
  const evidenceJoined = (item.assumptions ?? []).join('; ');
  if (evidenceJoined !== '' && f === evidenceJoined) return undefined;
  return f;
}

export function mapDedAiItemToRabInput(
  item: DedAiItem,
  policy: DedEstimationPolicy
): DedFinalizeRabInput | null {
  if (item.unitPrice == null || item.quantity == null) return null;
  const calculationFormula = realFormula(item.quantityFormula);
  const common = {
    description: item.name,
    volume: item.quantity,
    unit: item.units,
    unitPrice: item.unitPrice,
    category: item.category,
    // S5 (P3C-F2): rumus nyata DED diteruskan; tanpa rumus, medan absen.
    ...(calculationFormula ? { calculationFormula } : {}),
  };
  if (item.priceSource === 'AHSP_2026' && item.ahspCode) {
    // G-PV-2: klaim RESOLVED + kind OFFICIAL_AHSP (bukti S2) → S2
    // mempertahankan PRICE_RESOLVED + VERIFIED.
    const claim = dedTransferClaim('AHSP_2026');
    const { priceStatus, verificationStatus } = applyTransferContract(claim, item.unitPrice);
    return {
      ...common,
      ahspCode: item.ahspCode,
      priceSourceKind: claim.priceSourceKind,
      priceStatus,
      priceSourceLabel: 'AHSP Kanonis (SE 47/2026)',
      // Harga dari gerbang kanonis DED = Biaya Langsung (comp.unitPrice),
      // bukan DHSP — O&P rekap tetap berlaku (§17.1).
      priceCostBasis: 'DIRECT_COST',
      priceSourceExplanation: baseExplanation(
        policy,
        item.priceAssumptionNote || `AHSP kanonis ${item.ahspCode} — harga tervalidasi database EZRAB.`
      ),
      verificationStatus,
    };
  }
  if (item.priceSource === 'AI_ESTIMATE') {
    // Blok penyelesaian (bila ada) diringkas ke penjelasan persisten:
    // klasifikasi + sumber + tanggal tetap terbaca di baris RAB, bukan
    // hanya di layar hasil DED.
    const c = item.priceCompletion;
    const completionSummary = c
      ? ` [Penyelesaian AI: klasifikasi ${c.classification}` +
        `${c.sourceName ? `; sumber ${c.sourceName}` : ''}` +
        `${c.sourceUrl ? ` (${c.sourceUrl})` : ''}` +
        `${c.sourceDate ? `; data ${c.sourceDate}` : ''}` +
        `; diambil ${c.accessedAt}; keyakinan ${c.confidence}]`
      : '';
    // G-PV-2: klaim ESTIMATED → S2 mempertahankan PRICE_ESTIMATED.
    // Harga AI TIDAK PERNAH RESOLVED/VERIFIED di jalur ini.
    const claim = dedTransferClaim('AI_ESTIMATE');
    const { priceStatus, verificationStatus } = applyTransferContract(claim, item.unitPrice);
    return {
      ...common,
      priceSourceKind: claim.priceSourceKind,
      priceStatus,
      priceSourceLabel: 'Estimasi AI',
      priceSourceExplanation: baseExplanation(
        policy,
        (item.priceAssumptionNote ||
          'Estimasi AI — perkiraan, bukan harga database AHSP EZRAB.') + completionSummary
      ),
      verificationStatus,
    };
  }
  if (item.priceSource === 'USER_INPUT') {
    // G-PV-2 + G-PV-3: klaim MANUAL + kind USER_MANUAL (jujur — dulu
    // kind tidak diisi) → S2 mempertahankan PRICE_MANUAL.
    const claim = dedTransferClaim('USER_INPUT');
    const { priceStatus, verificationStatus } = applyTransferContract(claim, item.unitPrice);
    return {
      ...common,
      priceSourceKind: claim.priceSourceKind,
      priceStatus,
      priceSourceLabel: 'Input User',
      priceSourceExplanation: baseExplanation(
        policy,
        'Harga dimasukkan pengguna secara manual (bukan harga database AHSP).'
      ),
      verificationStatus,
    };
  }
  // UNRESOLVED / sumber tak dikenal: tidak boleh jadi baris berharga.
  // (Cabang ini tidak terjangkau dari handler yang sudah menyaring
  // unitPrice null, tapi dipertahankan sebagai pertahanan eksplisit.)
  return null;
}

/**
 * P0-A (D-02, persetujuan owner 2026-10-31) — mapper finalisasi untuk
 * jalur Magic AI (`DedAnalysisDashboard.handleCommitToProject`).
 *
 * Jalur ini dulu memetakan harga dengan `unitPrice || estimatedUnitPrice
 * || 0`, sehingga item yang harganya TIDAK TERSEDIA masuk RAB sebagai
 * baris Rp0 berstatus resolved/VERIFIED. Mapper ini menutup jalur itu
 * dengan kosakata yang sama seperti dua mapper di atas:
 *
 * - Pipeline Magic TIDAK PERNAH menghasilkan harga kanonis — sumber
 *   harganya hanya 'AI_ESTIMATE' | 'UNRESOLVED'
 *   (src/ai-estimate/types.ts). Karena itu item yang lolos selalu
 *   'EZRAB_ASSUMPTION' + label 'Estimasi AI' + NEEDS_VERIFICATION, dan
 *   `ahspCode` TIDAK PERNAH diteruskan dari jalur ini (meneruskannya
 *   akan mengesankan kaitan resmi yang tidak pernah tervalidasi).
 * - Item ditahan (null) bila: status BLOCKED (total pipeline sendiri
 *   mengecualikannya), priceSource 'UNRESOLVED', priceStatus
 *   'PRICE_UNRESOLVED', atau harga efektif tidak ada/tidak valid.
 *   Harga efektif dibaca nullish (`??`), bukan truthiness.
 * - Harga <= 0 ditahan mengikuti aturan domain pipeline sendiri
 *   (aiEstimateCalculator: harga <= 0 tidak pernah masuk total) — di
 *   jalur AI ini nol bukan harga sah; aturan factory "nol eksplisit =
 *   resolved" berlaku untuk entri manual spreadsheet, bukan jalur ini.
 */
export function mapMagicAiItemToRabInput(
  item: AiEstimateWorkItem
): DedFinalizeRabInput | null {
  if (item.status === 'BLOCKED') return null;
  if (item.priceSource === 'UNRESOLVED' || item.priceStatus === 'PRICE_UNRESOLVED') return null;
  const effectivePrice = item.unitPrice ?? item.estimatedUnitPrice ?? null;
  if (effectivePrice === null || !Number.isFinite(effectivePrice) || effectivePrice <= 0) return null;
  const calculationFormula = magicAiRealFormula(item);
  // G-PV-2: jalur Magic AI memakai kontrak S2 yang sama — klaim
  // ESTIMATED → PRICE_ESTIMATED + NEEDS_VERIFICATION.
  const claim = dedTransferClaim('AI_ESTIMATE');
  const { priceStatus, verificationStatus } = applyTransferContract(claim, effectivePrice);
  return {
    description: item.item || item.workName,
    volume: honestVolume(item.quantity),
    unit: item.unit || 'ls',
    unitPrice: effectivePrice,
    category: item.category,
    // S5 (P3C-F2): rumus nyata Magic AI diteruskan; fallback sintetis
    // pipeline (label/evidence) TIDAK naik menjadi rumus.
    ...(calculationFormula ? { calculationFormula } : {}),
    priceSourceKind: claim.priceSourceKind,
    priceStatus,
    priceSourceLabel: 'Estimasi AI',
    priceSourceExplanation:
      'Estimasi AI (Magic AI) — perkiraan, bukan harga database AHSP EZRAB.',
    verificationStatus,
  };
}

export function mapFullAiItemToRabInput(
  item: FullAiItem,
  policy: DedEstimationPolicy
): DedFinalizeRabInput | null {
  if (item.price.unitPrice == null || item.quantity.value == null) return null;
  const calculationFormula = realFormula(item.quantity.formula);
  const common = {
    description: item.name,
    volume: item.quantity.value,
    unit: item.quantity.unit,
    unitPrice: item.price.unitPrice,
    category: item.category,
    // S5 (P3C-F2): rumus nyata Full AI diteruskan; tanpa rumus, medan absen.
    ...(calculationFormula ? { calculationFormula } : {}),
  };
  if (item.price.source === 'AHSP_2026' && item.price.ahspCode) {
    // G-PV-2: klaim RESOLVED + kind OFFICIAL_AHSP (bukti S2) → S2
    // mempertahankan PRICE_RESOLVED + VERIFIED.
    const claim = dedTransferClaim('AHSP_2026');
    const { priceStatus, verificationStatus } = applyTransferContract(claim, item.price.unitPrice);
    return {
      ...common,
      ahspCode: item.price.ahspCode,
      priceSourceKind: claim.priceSourceKind,
      priceStatus,
      priceSourceLabel: 'AHSP Kanonis (SE 47/2026)',
      // Harga dari gerbang kanonis DED = Biaya Langsung (comp.unitPrice),
      // bukan DHSP — O&P rekap tetap berlaku (§17.1).
      priceCostBasis: 'DIRECT_COST',
      priceSourceExplanation: baseExplanation(
        policy,
        item.price.notes || `AHSP kanonis ${item.price.ahspCode} — harga tervalidasi database EZRAB.`
      ),
      verificationStatus,
    };
  }
  if (item.price.source === 'AI_ESTIMATE') {
    // G-PV-2: klaim ESTIMATED → S2 mempertahankan PRICE_ESTIMATED.
    // Harga AI TIDAK PERNAH RESOLVED/VERIFIED di jalur ini.
    const claim = dedTransferClaim('AI_ESTIMATE');
    const { priceStatus, verificationStatus } = applyTransferContract(claim, item.price.unitPrice);
    return {
      ...common,
      priceSourceKind: claim.priceSourceKind,
      priceStatus,
      priceSourceLabel: 'Estimasi AI',
      priceSourceExplanation: baseExplanation(
        policy,
        item.price.notes ||
          'Estimasi AI — perkiraan, bukan harga database AHSP EZRAB.'
      ),
      verificationStatus,
    };
  }
  if (item.price.source === 'USER_INPUT') {
    // G-PV-2 + G-PV-3: klaim MANUAL + kind USER_MANUAL (jujur — dulu
    // kind tidak diisi) → S2 mempertahankan PRICE_MANUAL.
    const claim = dedTransferClaim('USER_INPUT');
    const { priceStatus, verificationStatus } = applyTransferContract(claim, item.price.unitPrice);
    return {
      ...common,
      priceSourceKind: claim.priceSourceKind,
      priceStatus,
      priceSourceLabel: 'Input User',
      priceSourceExplanation: baseExplanation(
        policy,
        'Harga dimasukkan pengguna secara manual (bukan harga database AHSP).'
      ),
      verificationStatus,
    };
  }
  // VERIFIED_SOURCE warisan (label netral di adapter) maupun sumber tak
  // dikenal: jangan pernah naik jadi kanonis; tandai perlu verifikasi.
  // Catatan: item seperti ini hanya lolos ke sini bila harganya terisi;
  // handler tetap menyaring status READY + subtotal > 0.
  // G-PV-2: tanpa klaim status/kind → S2 memberi plafon jujur
  // PRICE_ESTIMATED untuk harga valid + NEEDS_VERIFICATION.
  const legacyClaim = dedTransferClaim(item.price.source);
  const legacyS2 = applyTransferContract(legacyClaim, item.price.unitPrice);
  return {
    ...common,
    // Label netral yang sama dengan DED_PRICE_SOURCE_LABELS untuk
    // VERIFIED_SOURCE warisan ("belum terverifikasi independen").
    priceStatus: legacyS2.priceStatus,
    priceSourceLabel: 'Belum terverifikasi independen (data lama)',
    priceSourceExplanation: baseExplanation(
      policy,
      'Sumber harga belum terverifikasi independen — bukan harga kanonis AHSP.'
    ),
    verificationStatus: legacyS2.verificationStatus,
  };
}

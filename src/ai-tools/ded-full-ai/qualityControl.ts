/**
 * FULL AI DED ESTIMATE — Pipeline 7 tahap + Quality Control (§6 directive
 * DED-RAB AI Dual Mode, W4 2026-11-13).
 *
 * Modul MURNI (tanpa gateway, tanpa IO): definisi tahap kanonis, rumus
 * total Full AI, dan audit QC single-pass. Service (`service.ts`,
 * `runExecute`) memanggilnya; suite `w4FullAiPipeline.test.ts`
 * mengujinya langsung.
 *
 * KEJUJURAN STRUKTURAL — baca sebelum mengubah:
 * - Tahap 1, 5, 6, 7 adalah pass kode nyata. Tahap 2–4 adalah penalaran
 *   MODEL di dalam SATU panggilan AI — bukan pass terpisah. Jejak tahap
 *   mencatat bukti terukur dari respons itu (jumlah item ber-wbsCode,
 *   jumlah klaim AHSP, dst.), bukan klaim pass yang tidak ada. Jangan
 *   pernah menulis detail jejak yang menyiratkan pass terpisah.
 * - QC adalah audit single-pass TANPA loop revisi otomatis. Karena itu
 *   `revisionIterations` SELALU 0 — angka yang benar, bukan placeholder.
 *   Jangan klaim "multi-pass" / "iterasi ke-N" sampai ada loop revisi
 *   yang benar-benar dieksekusi dan dihitung.
 * - QC tidak pernah memperbaiki item: isu dipertahankan sebagai
 *   warning/unresolved yang terlihat di keluaran.
 */

import type {
  FullAiItem,
  FullAiPipelineStageId,
  FullAiQcCheck,
  FullAiQualityControlReport,
} from './types';
import { verifySubtotal } from './validator';
import { WBS_CATALOGS } from '../ded-ai-estimate/wbsCatalog';

/** Definisi kanonis 7 tahap pipeline Full AI (§6.1–§6.7). */
export const FULL_AI_PIPELINE_STAGES: Array<{
  id: FullAiPipelineStageId;
  order: number;
  name: string;
  description: string;
}> = [
  {
    id: 'DOCUMENT_INTELLIGENCE',
    order: 1,
    name: 'Document Intelligence',
    description: 'Parse dokumen DED + seleksi halaman berprioritas ke dalam teks terkirim.',
  },
  {
    id: 'SCOPE_WBS',
    order: 2,
    name: 'Scope + WBS',
    description: 'Cakupan pekerjaan + pengelompokan WBS — penalaran model di dalam satu panggilan AI.',
  },
  {
    id: 'METHOD_REASONING',
    order: 3,
    name: 'Construction Method Reasoning',
    description: 'Penalaran metode konstruksi (deskripsi, asumsi, rumus) — penalaran model di dalam satu panggilan AI.',
  },
  {
    id: 'AI_AHSP_GENERATION',
    order: 4,
    name: 'AI AHSP Generation',
    description: 'Klaim kode AHSP dari model + resolusi kanonis lewat adapter — klaim model di dalam satu panggilan AI.',
  },
  {
    id: 'AI_PRICING',
    order: 5,
    name: 'AI Pricing',
    description: 'Penyelesaian harga dari referensi pasar eksternal terkurasi (mode FULL_AI saja).',
  },
  {
    id: 'QUANTITY_VOLUME',
    order: 6,
    name: 'Quantity + Volume',
    description: 'Penyelesaian kuantitas dari konteks denah (mode FULL_AI saja).',
  },
  {
    id: 'QUALITY_CONTROL',
    order: 7,
    name: 'Quality Control',
    description: 'Audit single-pass atas item final — tanpa loop revisi otomatis (0 iterasi).',
  },
];

/** Urutan kanonis tahap (untuk validasi jejak): id → order 1..7. */
export const FULL_AI_STAGE_ORDER: Record<FullAiPipelineStageId, number> = Object.fromEntries(
  FULL_AI_PIPELINE_STAGES.map((s) => [s.id, s.order]),
) as Record<FullAiPipelineStageId, number>;

// ---------------------------------------------------------------------------
// Total Full AI — SATU-SATUNYA rumus total jalur ini (G-SP-1)
// ---------------------------------------------------------------------------

/**
 * Total Full AI — ekstraksi VERBATIM penjumlahan inline lama
 * (`service.ts` runExecute: filter subtotal != null && > 0, lalu jumlah).
 * Semantik TIDAK berubah: hanya subtotal terverifikasi positif yang
 * masuk total; item lain dikecualikan dan dihitung terpisah.
 * Kesetaraannya dengan engine kanonis (`recalculateCostSummary`,
 * kaki directCost) dibuktikan suite W4 (G-SP-1), bukan disatukan
 * lewat kode — kedua penghitung tetap ada, dengan bukti selisih Rp0.
 */
export function computeFullAiGrandTotal(items: FullAiItem[]): {
  grandTotal: number;
  includedCount: number;
  excludedCount: number;
} {
  const included = items.filter((it) => it.subtotal != null && it.subtotal > 0);
  return {
    grandTotal: included.reduce((sum, it) => sum + (it.subtotal || 0), 0),
    includedCount: included.length,
    excludedCount: items.length - included.length,
  };
}

// ---------------------------------------------------------------------------
// Quality Control §6.7 — audit single-pass
// ---------------------------------------------------------------------------

export interface FullAiQualityControlContext {
  /** Tipe proyek (untuk katalog WBS). */
  projectType: string;
  /** Ringkasan cakupan dari model (bila ada). */
  scopeSummary?: string;
  /** Jumlah halaman dokumen yang dianalisis. */
  documentPages?: number;
}

const normUnit = (u: string) => u.toLowerCase().replace(/[^a-z0-9]/g, '');
const normName = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Kode WBS katalog DED yang dikenal (semua katalog — kode unik antarkatalog). */
function knownWbsCodes(): { codes: Set<string>; parents: Map<string, string | undefined> } {
  const codes = new Set<string>();
  const parents = new Map<string, string | undefined>();
  for (const nodes of Object.values(WBS_CATALOGS)) {
    for (const n of nodes) {
      codes.add(n.code);
      parents.set(n.code, n.parentCode);
    }
  }
  return { codes, parents };
}

/** Ringkas daftar nama untuk pesan (maks 5 + "dan N lainnya"). */
function summarizeNames(names: string[], max = 5): string {
  if (names.length <= max) return names.map((n) => `"${n}"`).join(', ');
  return `${names.slice(0, max).map((n) => `"${n}"`).join(', ')} dan ${names.length - max} item lainnya`;
}

/**
 * Audit QC §6.7 atas item final Full AI (sesudah pass penyelesaian).
 * MURNI: tidak mengubah item, tidak memanggil gateway, tidak melempar
 * untuk data berbentuk item (item malformed diperlakukan defensif).
 *
 * Pemeriksaan:
 * - scope-completeness: ada item; ringkasan cakupan model ada.
 * - wbs-hierarchy: wbsCode dikenal katalog; induk subkelompok ada;
 *   wbsCode/wbsGroup berpasangan; item tak terklasifikasi dihitung.
 *   (Visibilitas untuk P3D-O6/S6-O2 — sinyal TERCAKUP heuristik di
 *   artefak WBS Chat AI TIDAK diubah modul ini; lihat LAPORAN-W4.)
 * - duplicates: nama+satuan yang sama muncul > 1 kali.
 * - price-quantity-completeness: hitungan READY/NEEDS_CONFIRMATION/
 *   UNRESOLVED + item yang dikecualikan dari total.
 * - unit-formula-consistency: satuan harga vs kuantitas; DERIVED tanpa
 *   rumus (tak teraudit); rumus tanpa kuantitas.
 * - provenance-integrity: AHSP_2026 wajib berkode; VERIFIED_SOURCE
 *   warisan ditandai belum terverifikasi; USER_INPUT berkode AHSP
 *   ditandai; invarian subtotal (verified ⟹ subtotal ada; subtotal ==
 *   round(qty × harga); READY ⟹ subtotal ada); blok penyelesaian
 *   recommendedPrice == harga item.
 */
export function runFullAiQualityControl(
  items: FullAiItem[],
  ctx: FullAiQualityControlContext,
): FullAiQualityControlReport {
  const checks: FullAiQcCheck[] = [];
  const warnings: string[] = [];

  // --- 1. Kelengkapan scope ---
  const scopeSummary = (ctx.scopeSummary || '').trim();
  const scopeIssues: string[] = [];
  if (items.length === 0) scopeIssues.push('tidak ada item pekerjaan yang dihasilkan');
  if (!scopeSummary) scopeIssues.push('ringkasan cakupan (scopeSummary) tidak diberikan model');
  checks.push({
    id: 'scope-completeness',
    title: 'Kelengkapan scope',
    passed: scopeIssues.length === 0,
    severity: items.length === 0 ? 'error' : 'warning',
    detail: items.length === 0
      ? 'Hasil kosong: tidak ada item pekerjaan.'
      : scopeSummary
        ? `${items.length} item; ringkasan cakupan tersedia.`
        : `${items.length} item; ${scopeIssues.join('; ')}.`,
    itemIds: [],
  });
  if (scopeIssues.length > 0) {
    warnings.push(`QC scope: ${scopeIssues.join('; ')}.`);
  }

  // --- 2. Hierarki WBS ---
  const { codes: knownCodes, parents } = knownWbsCodes();
  const unknownCode: FullAiItem[] = [];
  const orphanSubgroup: FullAiItem[] = [];
  const codeWithoutGroup: FullAiItem[] = [];
  const groupWithoutCode: FullAiItem[] = [];
  const unclassified: FullAiItem[] = [];
  for (const it of items) {
    const code = (it.wbsCode || '').trim();
    const group = (it.wbsGroup || '').trim();
    if (!code && !group) {
      unclassified.push(it);
      continue;
    }
    if (code && !knownCodes.has(code)) unknownCode.push(it);
    if (code && knownCodes.has(code)) {
      const parent = parents.get(code);
      if (parent !== undefined && !knownCodes.has(parent)) orphanSubgroup.push(it);
    }
    if (code && !group) codeWithoutGroup.push(it);
    if (!code && group) groupWithoutCode.push(it);
  }
  const wbsOk = unknownCode.length === 0 && orphanSubgroup.length === 0;
  const wbsDetailParts: string[] = [];
  if (unknownCode.length > 0) {
    wbsDetailParts.push(`${unknownCode.length} item memakai kode WBS yang TIDAK dikenal katalog DED (kode dari model, belum tervalidasi): ${summarizeNames(unknownCode.map((i) => `${i.name} [${i.wbsCode}]`))}`);
  }
  if (orphanSubgroup.length > 0) {
    wbsDetailParts.push(`${orphanSubgroup.length} item memakai subkelompok yang induknya tidak ada di katalog: ${summarizeNames(orphanSubgroup.map((i) => i.name))}`);
  }
  if (codeWithoutGroup.length > 0) {
    wbsDetailParts.push(`${codeWithoutGroup.length} item berkode WBS tanpa nama kelompok`);
  }
  if (groupWithoutCode.length > 0) {
    wbsDetailParts.push(`${groupWithoutCode.length} item berkelompok WBS tanpa kode`);
  }
  if (unclassified.length > 0) {
    wbsDetailParts.push(`${unclassified.length} dari ${items.length} item tanpa klasifikasi WBS (wbsCode/wbsGroup kosong)`);
  }
  checks.push({
    id: 'wbs-hierarchy',
    title: 'Hierarki WBS',
    passed: wbsOk && unclassified.length === 0 && codeWithoutGroup.length === 0 && groupWithoutCode.length === 0,
    severity: 'warning',
    detail: wbsDetailParts.length > 0
      ? wbsDetailParts.join('; ') + '.'
      : `Semua ${items.length} item terklasifikasi ke kode WBS katalog yang dikenal.`,
    itemIds: [...unknownCode, ...orphanSubgroup, ...codeWithoutGroup, ...groupWithoutCode, ...unclassified].map((i) => i.id),
  });
  if (wbsDetailParts.length > 0) {
    warnings.push(`QC WBS: ${wbsDetailParts.join('; ')}.`);
  }

  // --- 3. Duplikasi ---
  const byKey = new Map<string, FullAiItem[]>();
  for (const it of items) {
    const key = `${normName(it.name || '')}|${normUnit(it.quantity?.unit || '')}`;
    const bucket = byKey.get(key) || [];
    bucket.push(it);
    byKey.set(key, bucket);
  }
  const dupGroups = [...byKey.values()].filter((g) => g.length > 1);
  const dupItems = dupGroups.flat();
  checks.push({
    id: 'duplicates',
    title: 'Duplikasi item',
    passed: dupGroups.length === 0,
    severity: 'warning',
    detail: dupGroups.length === 0
      ? 'Tidak ada pasangan nama+satuan yang berulang.'
      : `${dupGroups.length} kelompok nama+satuan berulang (${dupItems.length} item): ${summarizeNames(dupGroups.map((g) => `${g[0].name} (${g[0].quantity.unit}) ×${g.length}`))} — kemungkinan item ganda; keduanya dipertahankan, tidak digabung diam-diam.`,
    itemIds: dupItems.map((i) => i.id),
  });
  if (dupGroups.length > 0) {
    warnings.push(`QC duplikasi: ${dupGroups.length} kelompok nama+satuan berulang (${summarizeNames(dupGroups.map((g) => `${g[0].name} (${g[0].quantity.unit}) ×${g.length}`))}) — periksa kemungkinan item ganda.`);
  }

  // --- 4. Kelengkapan harga/kuantitas ---
  const ready = items.filter((i) => i.status === 'READY');
  const needsConfirm = items.filter((i) => i.status === 'NEEDS_CONFIRMATION');
  const unresolved = items.filter((i) => i.status === 'UNRESOLVED' || i.status === 'EXCLUDED');
  const excluded = items.filter((i) => i.subtotal == null);
  const missingQty = items.filter((i) => i.quantity?.value == null);
  const missingPrice = items.filter((i) => i.price?.unitPrice == null);
  const completenessOk = excluded.length === 0;
  checks.push({
    id: 'price-quantity-completeness',
    title: 'Kelengkapan harga/kuantitas',
    passed: completenessOk,
    severity: 'warning',
    detail: completenessOk
      ? `Semua ${items.length} item masuk total (READY).`
      : `${ready.length} READY, ${needsConfirm.length} NEEDS_CONFIRMATION, ${unresolved.length} UNRESOLVED/EXCLUDED; ${excluded.length} item dikecualikan dari total (${missingQty.length} tanpa kuantitas, ${missingPrice.length} tanpa harga) — dipertahankan terlihat sebagai unresolved, bukan dihapus.`,
    itemIds: excluded.map((i) => i.id),
  });
  if (!completenessOk) {
    warnings.push(`QC kelengkapan: ${excluded.length} dari ${items.length} item dikecualikan dari total (${missingQty.length} tanpa kuantitas, ${missingPrice.length} tanpa harga) — tetap ditampilkan sebagai unresolved.`);
  }

  // --- 5. Konsistensi satuan/formula ---
  const unitMismatch: FullAiItem[] = [];
  const derivedNoFormula: FullAiItem[] = [];
  const formulaNoQty: FullAiItem[] = [];
  for (const it of items) {
    const qUnit = it.quantity?.unit || '';
    const pUnit = it.price?.unit || '';
    // Hanya bermakna bila keduanya terisi (satuan kosong sudah ditangkap
    // validator item sebagai MISSING_UNIT / INVALID_PRICE_UNIT).
    if (qUnit && pUnit && normUnit(pUnit) !== normUnit(qUnit)) unitMismatch.push(it);
    if (it.quantity?.provenance === 'DERIVED' && !(it.quantity?.formula || '').trim()) {
      derivedNoFormula.push(it);
    }
    if ((it.quantity?.formula || '').trim() && it.quantity?.value == null) {
      formulaNoQty.push(it);
    }
  }
  const unitFormulaOk = unitMismatch.length === 0 && derivedNoFormula.length === 0 && formulaNoQty.length === 0;
  const ufParts: string[] = [];
  if (unitMismatch.length > 0) {
    ufParts.push(`${unitMismatch.length} item satuan harga tidak cocok dengan satuan kuantitas: ${summarizeNames(unitMismatch.map((i) => `${i.name} (${i.price.unit} vs ${i.quantity.unit})`))}`);
  }
  if (derivedNoFormula.length > 0) {
    ufParts.push(`${derivedNoFormula.length} item DERIVED tanpa rumus (turunan tak teraudit): ${summarizeNames(derivedNoFormula.map((i) => i.name))}`);
  }
  if (formulaNoQty.length > 0) {
    ufParts.push(`${formulaNoQty.length} item berumus tetapi kuantitasnya kosong: ${summarizeNames(formulaNoQty.map((i) => i.name))}`);
  }
  checks.push({
    id: 'unit-formula-consistency',
    title: 'Konsistensi satuan/formula',
    passed: unitFormulaOk,
    severity: 'warning',
    detail: ufParts.length > 0 ? ufParts.join('; ') + '.' : 'Satuan harga cocok dengan satuan kuantitas pada semua item; turunan berumus.',
    itemIds: [...unitMismatch, ...derivedNoFormula, ...formulaNoQty].map((i) => i.id),
  });
  if (ufParts.length > 0) {
    warnings.push(`QC satuan/rumus: ${ufParts.join('; ')}.`);
  }

  // --- 6. Integritas provenance ---
  const ahspNoCode: FullAiItem[] = [];
  const legacyVerified: FullAiItem[] = [];
  const manualWithCode: FullAiItem[] = [];
  const invariantErrors: string[] = [];
  const invariantItems: FullAiItem[] = [];
  const completionMismatch: FullAiItem[] = [];
  for (const it of items) {
    const src = it.price?.source;
    if (src === 'AHSP_2026' && !(it.price?.ahspCode || '').trim()) ahspNoCode.push(it);
    if (src === 'VERIFIED_SOURCE') legacyVerified.push(it);
    if (src === 'USER_INPUT' && (it.price?.ahspCode || '').trim()) manualWithCode.push(it);
    if (it.subtotalVerified && it.subtotal == null) {
      invariantErrors.push(`"${it.name}": subtotalVerified=true tetapi subtotal null`);
      invariantItems.push(it);
    }
    if (it.status === 'READY' && it.subtotal == null) {
      invariantErrors.push(`"${it.name}": status READY tetapi subtotal null`);
      invariantItems.push(it);
    }
    const q = it.quantity?.value;
    const p = it.price?.unitPrice;
    if (typeof q === 'number' && typeof p === 'number' && q > 0 && p > 0) {
      const expected = verifySubtotal(q, p).subtotal;
      if (it.subtotal != null && expected != null && it.subtotal !== expected) {
        invariantErrors.push(`"${it.name}": subtotal Rp${it.subtotal.toLocaleString('id-ID')} ≠ qty × harga Rp${expected.toLocaleString('id-ID')}`);
        invariantItems.push(it);
      }
    }
    const pc = it.price?.priceCompletion ?? it.priceCompletion;
    if (it.price?.filledFromExternalRef && pc?.recommendedPrice != null && p != null && pc.recommendedPrice !== p) {
      completionMismatch.push(it);
    }
  }
  const provParts: string[] = [];
  if (ahspNoCode.length > 0) {
    provParts.push(`${ahspNoCode.length} item mengklaim AHSP_2026 tanpa kode AHSP: ${summarizeNames(ahspNoCode.map((i) => i.name))}`);
  }
  if (legacyVerified.length > 0) {
    provParts.push(`${legacyVerified.length} item bersumber VERIFIED_SOURCE warisan (belum terverifikasi independen): ${summarizeNames(legacyVerified.map((i) => i.name))}`);
  }
  if (manualWithCode.length > 0) {
    provParts.push(`${manualWithCode.length} item USER_INPUT membawa kode AHSP (kode tidak diteruskan ke RAB): ${summarizeNames(manualWithCode.map((i) => i.name))}`);
  }
  if (completionMismatch.length > 0) {
    provParts.push(`${completionMismatch.length} item harga isian referensi tidak sama dengan recommendedPrice blok penyelesaiannya: ${summarizeNames(completionMismatch.map((i) => i.name))}`);
  }
  const provOk = ahspNoCode.length === 0 && legacyVerified.length === 0 && manualWithCode.length === 0
    && completionMismatch.length === 0 && invariantErrors.length === 0;
  checks.push({
    id: 'provenance-integrity',
    title: 'Integritas provenance',
    passed: provOk,
    severity: invariantErrors.length > 0 ? 'error' : 'warning',
    detail: invariantErrors.length > 0
      ? `INVARIAN DILANGGAR: ${invariantErrors.join('; ')}.` + (provParts.length > 0 ? ` ${provParts.join('; ')}.` : '')
      : provParts.length > 0
        ? provParts.join('; ') + '.'
        : 'Provenance konsisten: klaim kanonis berkode, subtotal cocok dengan qty × harga.',
    itemIds: [...ahspNoCode, ...legacyVerified, ...manualWithCode, ...completionMismatch, ...invariantItems].map((i) => i.id),
  });
  if (invariantErrors.length > 0) {
    warnings.push(`QC provenance: INVARIAN DILANGGAR — ${invariantErrors.join('; ')}.`);
  }
  if (provParts.length > 0) {
    warnings.push(`QC provenance: ${provParts.join('; ')}.`);
  }

  const unresolvedIssueCount = checks
    .filter((c) => !c.passed)
    .reduce((acc, c) => acc + Math.max(1, c.itemIds.length), 0);
  const passed = !checks.some((c) => !c.passed && c.severity === 'error');

  return {
    // TIDAK ADA loop revisi otomatis di pipeline ini — 0 adalah jumlah
    // iterasi yang benar-benar dieksekusi. Jangan ubah tanpa loop nyata.
    revisionIterations: 0,
    revisionPassesExecuted: 0,
    checks,
    warnings,
    unresolvedIssueCount,
    passed,
  };
}

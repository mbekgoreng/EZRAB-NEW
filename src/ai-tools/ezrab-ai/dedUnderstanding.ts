/**
 * dedUnderstanding.ts — PEMAHAMAN DED (AI Intelligence Overhaul
 * Fase 4 — Construction Intelligence).
 *
 * DED yang diunggah (jalur KANONIS `DedAiEstimateView` /
 * `DedAiOutput`) → spek/dimensi yang diekstrak masuk ke
 * `StructuredSpec` (bukan teks bebas yang hilang). DED tak lengkap →
 * data yang hilang DINYATAKAN eksplisit (bukan diisi karangan).
 *
 * Pagar ARS-02: modul ini HANYA MEMBACA hasil pipeline kanonis
 * (`DedAiOutput`) — ia TIDAK menyatukan dua pipeline DED, TIDAK
 * mengubah semantik total DED, TIDAK mengubah harga/kuantitas, dan
 * TIDAK memanggil provider. Spek yang dihasilkan berstatus
 * CONFIRMED hanya bila sumbernya DED (derivation input bersumber
 * 'DED' / quantitySource DED); input bersumber ASSUMPTION menjadi
 * spek berstatus ASSUMPTION dengan label yang sama; yang tidak ada
 * di DED menjadi entri `missingData` (bukan spek karangan).
 */

import type {
  DedAiOutput,
  DedAiItem,
  DedAiQuantitySource,
} from '../ded-ai-estimate/types';
import type { StructuredSpec, SpecStatus } from './structuredSpec';
import { SPEC_KEY_META } from './structuredSpec';

export interface DedUnderstandingResult {
  /** Spek terstruktur hasil ekstraksi DED (siap digabung ke structuredSpecs). */
  specs: StructuredSpec[];
  /** Data yang HILANG dari DED — dinyatakan eksplisit, bukan dikarang. */
  missingData: string[];
  /** Ringkasan cakupan DED (jujur: parsial vs lengkap). */
  coverage: {
    totalItems: number;
    itemsWithQuantity: number;
    itemsWithPrice: number;
    itemsFullyResolved: number;
    itemsUnresolved: number;
    partial: boolean;
  };
  /** Divisi yang datanya tidak cukup (dari divisionCoverage DED). */
  insufficientDivisions: string[];
}

const DED_SOURCE = 'DED' as const;

/**
 * Provenans sumber satu spek DED (GATE 4 / 5D): nama berkas (bila
 * output menyebutnya) + halaman sumber item + nama item — dicatat
 * SEADANYA dari output DED kanonis; halaman yang tidak tersedia
 * TIDAK dikarang (frasa halaman dihilangkan, bukan diisi tebakan).
 */
function dedSpecProvenance(
  item: DedAiItem,
  fileName?: string,
): string {
  const parts: string[] = ['DED'];
  if (fileName) parts.push(`"${fileName}"`);
  const pages = (item.sourcePages ?? []).filter((p) => Number.isFinite(p));
  if (pages.length > 0) parts.push(`hal. ${pages.join(', ')}`);
  parts.push(`item "${item.name}"`);
  return parts.join(' · ');
}

/** Dimensi dari derivation inputs bersumber DED/USER (bukan ASSUMPTION). */
function dimensionSpecsFromItem(item: DedAiItem, updatedAt: string, fileName?: string): StructuredSpec[] {
  const out: StructuredSpec[] = [];
  const inputs = item.derivation?.inputs ?? [];
  // Petakan input derivasi yang dikenal ke kunci spek (hanya yang ada
  // di SPEC_KEY_META — kunci tak dikenal tidak dikarang).
  const keyByInputName: Record<string, string> = {
    panjang: 'ded-length',
    lebar: 'ded-width',
    tinggi: 'ded-height',
    luas: 'ded-area',
    volume: 'ded-volume',
  };
  for (const inp of inputs) {
    const key = keyByInputName[inp.name.toLowerCase()];
    if (!key) continue;
    const meta = SPEC_KEY_META[key];
    if (!meta) continue;
    const status: SpecStatus = inp.source === 'ASSUMPTION' ? 'ASSUMPTION' : 'CONFIRMED';
    // GATE 4 (5D): label meta sudah mengandung "(dari DED)" — suffix
    // item ditempel pada label DASAR agar tidak ganda ("Panjang (dari
    // DED) (dari DED: ...)" — temuan visual E2E Gate 4).
    const baseLabel = meta.label.replace(/ \(dari DED\)$/, '');
    out.push({
      key,
      kind: meta.kind,
      label: `${baseLabel} (dari DED: ${item.name})`,
      value: inp.value,
      unit: inp.unit,
      status,
      source: DED_SOURCE,
      updatedAt,
      provenance: dedSpecProvenance(item, fileName),
    });
  }
  // Dimensi mentah (rawDimensions) dicatat sebagai bukti, bukan spek angka.
  return out;
}

function quantitySourceLabel(qs: DedAiQuantitySource | undefined): string {
  switch (qs) {
    case 'DED_EXPLICIT': return 'DED (eksplisit)';
    case 'DED_GEOMETRIC': return 'DED (geometris)';
    case 'DERIVED': return 'turunan DED';
    case 'ASSUMPTION': return 'asumsi';
    case 'USER_INPUT': return 'pengguna';
    case 'AI_INFERENCE': return 'inferensi AI';
    case 'UNRESOLVED': return 'belum ter-resolver';
    default: return qs ?? 'tak diketahui';
  }
}

/**
 * Ekstrak spek + daftar data hilang dari satu hasil DED kanonis.
 * `updatedAt` diisi pemanggil (waktu ekstraksi, ISO).
 */
export function extractSpecsFromDedOutput(
  output: DedAiOutput,
  updatedAt: string = new Date().toISOString(),
): DedUnderstandingResult {
  const specs: StructuredSpec[] = [];
  const missingData: string[] = [];
  const seenKeys = new Set<string>();

  const pushSpec = (s: StructuredSpec): void => {
    const dedupeKey = `${s.key}|${JSON.stringify(s.value)}`;
    if (seenKeys.has(dedupeKey)) return;
    seenKeys.add(dedupeKey);
    specs.push(s);
  };

  for (const item of output.items ?? []) {
    for (const s of dimensionSpecsFromItem(item, updatedAt, output.fileName)) pushSpec(s);
    // Kuantitas / harga hilang per item → missingData eksplisit.
    if (item.quantity == null) {
      missingData.push(`Kuantitas hilang: "${item.name}" (${item.units}) — sumber: ${quantitySourceLabel(item.quantitySource)}; dinyatakan hilang, bukan 0.`);
    }
    if (item.unitPrice == null) {
      missingData.push(`Harga satuan hilang: "${item.name}" — ${item.ahspCode ? `kode AHSP ${item.ahspCode} tercatat tetapi harga tidak ter-resolver` : 'tanpa kode AHSP'}; dinyatakan belum berharga, bukan Rp0.`);
    }
    if (!item.ahspCode && item.priceSource !== 'AHSP_2026') {
      // Bukan "hilang" mutlak (harga bisa dari sumber lain) — dicatat
      // hanya bila harga juga hilang, agar tidak membanjiri daftar.
    }
  }

  // Dimensi proyek dari DED: bila TIDAK SATU PUN spek dimensi
  // terekstrak, nyatakan dimensi proyek hilang.
  const hasDimension = specs.some((s) => s.kind === 'dimension');
  if (!hasDimension) {
    missingData.push('Dimensi proyek (panjang/lebar/tinggi/luas) tidak terekstrak dari DED — tidak diisi karangan; minta dimensi dari pengguna atau DED yang lebih lengkap.');
  }
  // Cakupan DED: parsial bila ada pass gagal / item tak ter-resolver.
  const coverage = {
    totalItems: output.coverage?.totalItems ?? output.items.length,
    itemsWithQuantity: output.coverage?.itemsWithQuantity ?? output.items.filter((i) => i.quantity != null).length,
    itemsWithPrice: output.coverage?.itemsWithPrice ?? output.items.filter((i) => i.unitPrice != null).length,
    itemsFullyResolved: output.coverage?.itemsFullyResolved ?? 0,
    itemsUnresolved: output.coverage?.itemsUnresolved ?? 0,
    partial: output.partial === true,
  };
  if (coverage.partial) {
    missingData.push('Hasil DED dinyatakan PARSIAL oleh pipeline (satu atau lebih pass gagal/dilewati) — hasil ini bukan estimasi lengkap.');
  }
  if (coverage.itemsUnresolved > 0) {
    missingData.push(`${coverage.itemsUnresolved} dari ${coverage.totalItems} item DED belum ter-resolver (kuantitas/harga) — tercantum per item di atas.`);
  }

  const insufficientDivisions = (output.divisionCoverage ?? [])
    .filter((d) => d.status === 'INSUFFICIENT_DATA')
    .map((d) => `${d.divisionCode} ${d.divisionName}`.trim());

  return { specs, missingData, coverage, insufficientDivisions };
}

/** Baris pemahaman DED untuk jawaban / konteks kanonis. */
export function formatDedUnderstandingLines(result: DedUnderstandingResult): string[] {
  const lines: string[] = [
    `Pemahaman DED: ${result.coverage.itemsFullyResolved}/${result.coverage.totalItems} item ter-resolver penuh${result.coverage.partial ? ' (HASIL PARSIAL)' : ''}.`,
  ];
  for (const s of result.specs) {
    lines.push(`• Spek dari DED [${s.status}] ${s.label}: ${s.value}${s.unit ? ` ${s.unit}` : ''}.`);
  }
  if (result.insufficientDivisions.length > 0) {
    lines.push(`• Divisi dengan data tidak cukup: ${result.insufficientDivisions.join(', ')}.`);
  }
  for (const m of result.missingData) {
    lines.push(`• DATA HILANG (bukan karangan): ${m}`);
  }
  return lines;
}

/* ------------------------------------------------------------------ */
/* Wiring Fase 5 — DED → konteks kanonis + memori Fase 2               */
/*                                                                     */
/* `buildDedSection` menghasilkan teks seksi DED untuk builder         */
/* kanonis (canonicalContext.dedSection). `recordDedUnderstanding-     */
/* ToMemory` menulis SATU record project-scope (kunci stabil           */
/* 'ded:understanding', explicitReplacement agar analisis baru         */
/* menggantikan yang lama, bukan menandai konflik) sehingga Chat AI    */
/* dan Copilot melihat hasil DED lewat retrieval memori biasa —       */
/* tanpa jalur baru dan tanpa menyatukan dua pipeline DED (ARS-02).    */
/* Dipanggil DedAiEstimateView saat analisis selesai (bukan saat       */
/* memuat draft lama — agar tidak menduplikasi record).                */
/* ------------------------------------------------------------------ */

import { createMemoryRecord, storeMemoryWithConflictResolution, type MemoryScope } from './memory';

/** Seksi DED siap tempel ke builder kanonis (cap ditegakkan builder). */
export function buildDedSection(output: DedAiOutput, updatedAt?: string): string {
  const result = extractSpecsFromDedOutput(output, updatedAt);
  return formatDedUnderstandingLines(result).join('\n');
}

/** Hasil DED → memori proyek Fase 2 (satu record current per proyek). */
export function recordDedUnderstandingToMemory(
  scope: MemoryScope,
  output: DedAiOutput,
): { ok: boolean; specs: number; missing: number; message: string } {
  if (!scope.projectId) {
    return { ok: false, specs: 0, missing: 0, message: 'DED tidak terikat proyek (targetProjectId kosong) — tidak direkam ke memori.' };
  }
  const result = extractSpecsFromDedOutput(output);
  const content = formatDedUnderstandingLines(result).join('\n').slice(0, 1200);
  try {
    const created = createMemoryRecord({
      userId: scope.userId ?? null,
      projectId: scope.projectId,
      conversationId: scope.conversationId ?? null,
      memoryKey: 'ded:understanding',
      layer: 'project',
      memoryType: 'fact',
      content,
      structuredPayload: {
        jobId: (output as { jobId?: string }).jobId ?? null,
        coverage: result.coverage,
        missingData: result.missingData,
        insufficientDivisions: result.insufficientDivisions,
        specCount: result.specs.length,
        explicitReplacement: true,
      },
      sourceMessageId: null,
      sourceType: 'tool-result',
      provenance: `pemahaman DED kanonis (job ${(output as { jobId?: string }).jobId ?? 'tanpa-id'}) — spek + data hilang, bukan karangan`,
      quality: 'confirmed-fact',
      confidence: 1,
      importance: 2,
    });
    if (!created.ok) {
      return { ok: false, specs: result.specs.length, missing: result.missingData.length, message: `Memori DED ditolak: ${created.message}` };
    }
    const stored = storeMemoryWithConflictResolution(created.value, scope);
    if (!stored.ok) {
      return { ok: false, specs: result.specs.length, missing: result.missingData.length, message: `Memori DED gagal disimpan: ${stored.message}` };
    }
    return { ok: true, specs: result.specs.length, missing: result.missingData.length, message: `Pemahaman DED direkam ke memori proyek (${result.specs.length} spek, ${result.missingData.length} data hilang dinyatakan).` };
  } catch (e) {
    return { ok: false, specs: result.specs.length, missing: result.missingData.length, message: `Memori DED gagal: ${e instanceof Error ? e.message : 'error tak dikenal'}` };
  }
}

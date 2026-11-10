/**
 * DED AI ESTIMATE — Service (src/ai-tools/ded-ai-estimate/service.ts)
 * Standalone pipeline: parse PDF → pick project type → pick FAST/DETAIL → analyze →
 * compute deterministic quantities/prices → finalize → export-ready result.
 *
 * HARD ISOLATION: This file must NOT import AHSP matcher / price resolver / HSD
 * database / masterRegistry / official price database / project price engine, nor
 * any ded-rab-v2/v3 module — KECUALI lewat SATU jembatan terkontrol:
 * src/ai-tools/ded-canonical/canonicalDedPricing (adapter). Adapter itulah
 * yang mengimpor layanan kanonis; mesin ini hanya memanggil matchDedItemToAhsp
 * & resolveDedPriceWithCanonical, dan tidak pernah menerima harga yang tidak
 * melewati gerbang kebijakan + komposisi FULL adapter tersebut.
 */

import { aiToolsProviderClient, AiToolsResult, AiToolsUsage, balancedJsonEnd } from '../providerClient';
import { waitForMinimum, minDelayFor } from '../aiResponseTiming';
import { buildFastPrompt, DedFastOutput, DedFastPromptInput } from './prompts/fast';
import { buildDetailPrompt, DedDetailOutput, DedDetailPromptInput } from './prompts/detail';
import { parseDedPdf, DedParsedDocument } from './parser';
import { attemptQuantityFromDimensionString, parseDimensionsString } from './quantity';
import { evaluateAssumptionBasis, type AssumptionBasisKind } from './assumptionBasis';
import { applyQuantityReasonablenessReview } from './reasonableness';
import { completeDedBatch, derivePlanContext } from './priceCompletion';
import { buildDedUsageFromStandard } from './usageMetadata';
import { resolveDedPriceForPolicy } from './pricing';
import { matchDedItemToAhsp, resolveDedPriceWithCanonical } from '../ded-canonical/canonicalDedPricing';
import { DedAiCalculator } from './calculator';
import { deriveKolomVolume, deriveDindingNetto, derivePlester, DerivationTrail } from './derivation';
import { selectPagesWithTrace, formatPageRanges, SelectedPage } from './analysisTrace';
import { buildDivisionCoverage } from './divisions';
import { groupByWbs } from './wbsClassifier';
import {
  DedAiServiceOptions,
  DedAiOutput,
  DedAiItem,
  DedAiProjectType,
  DedAiMode,
  DedAiQuantitySource,
  DedAiProgressEvent,
  DedPassTraceEntry,
  DedPassSummary,
} from './types';

const PROJECT_TYPES: ReadonlyArray<string> = [
  'BANGUNAN',
  'GEDUNG',
  'BANGUNAN AIR',
  'JALAN',
  'PAVING',
  // Readiness WBS 2026-10-28: tipe eksplisit bendung & irigasi.
  // Tanpa ini, service menolak tipe baru dengan PROJECT_TYPE_UNSUPPORTED
  // meski katalog & prompt sudah mendukungnya.
  'BENDUNGAN',
  'IRIGASI',
  // Sprint 3 (B1): JEMBATAN diselaraskan ke spec — katalog WBS §6 dan
  // ketiga pembangun prompt Sprint 1 sudah menangani token ini (probe
  // gateway menghasilkan 12 item jembatan yang sah); gerbang service
  // adalah satu-satunya titik yang tidak konsisten. Chip UI adalah
  // cakupan workstream lain — di sini hanya gerbang service.
  'JEMBATAN',
];

// Diekspor agar gate validasi ini dapat diuji langsung (tanpa model live).
export function isProjectTypeSupported(v: string): v is DedAiProjectType {
  return PROJECT_TYPES.includes(v);
}

// Diekspor agar lapisan konversi dapat diuji deterministik tanpa model live
// (pola yang sama dengan helper lain di berkas ini).
export function convertAiItem(idx: number, raw: any, mode: DedAiMode, policy?: import('./types').DedEstimationPolicy): DedAiItem {
  const name = String(raw.name || `Pekerjaan ${idx + 1}`);
  const units = String(raw.units || raw.unit || 'm2');
  const dims = raw.dimensions || raw.quantityFormula || '';
  // Sprint 3 (G3): ditandai mergeRawItemsAcrossPasses bila item se-nama
  // se-satuan dengan dimensi berbeda dipertahankan dari pass lain.
  const dedupDimensionConflict = raw?.__dedupDimensionConflict === true;

  const fromDim = attemptQuantityFromDimensionString(units, dims || undefined);
  const rawAIQuantity = typeof raw.quantity === 'number' && Number.isFinite(raw.quantity) ? raw.quantity : null;

  // FASE DED-FIX TASK 1: dimensi tanpa satuan eksplisit -> unresolved, bukan meter.
  // FASE DED-FIX TASK 2: fallback rawAIQuantity HANYA bila model menyatakan
  // quantitySource eksplisit dari DED. Inferensi/asumsi tidak boleh dianggap terverifikasi.
  const rawSourceIsExplicit = raw.quantitySource === 'DED_EXPLICIT';
  let quantity: number | null = fromDim.quantity;
  let quantitySource: DedAiQuantitySource = 'UNRESOLVED';
  let derivation: DerivationTrail | undefined;

  // PHASE 4B: Derivasi terstruktur — hanya jika AI menyediakan inputs lengkap.
  // Helper derivation.ts dipanggil dengan data aktual dari model, bukan mock.
  if (raw.derivation && typeof raw.derivation === 'object') {
    const d = raw.derivation;
    const inputs = Array.isArray(d.inputs) ? d.inputs : [];
    const getInput = (name: string): number | null => {
      const found = inputs.find((i: any) => i && i.name === name && typeof i.value === 'number' && Number.isFinite(i.value));
      return found ? found.value : null;
    };
    const getSource = (name: string): 'DED' | 'USER' | 'ASSUMPTION' => {
      const found = inputs.find((i: any) => i && i.name === name);
      const s = found?.source;
      return s === 'DED' || s === 'USER' ? s : 'ASSUMPTION';
    };

    if (d.formulaType === 'kolom_volume') {
      const trail = deriveKolomVolume(
        getInput('jumlah_kolom') ?? getInput('jumlah') ?? getInput('count'),
        getInput('lebar') ?? getInput('width'),
        getInput('panjang') ?? getInput('length'),
        getInput('tinggi') ?? getInput('height'),
        getSource('jumlah_kolom')
      );
      if (trail.result !== null && trail.validationStatus === 'ok') {
        quantity = trail.result;
        quantitySource = 'DERIVED';
        derivation = trail;
      }
    } else if (d.formulaType === 'dinding_netto' || d.formulaType === 'dinding_bruto') {
      const trail = deriveDindingNetto(
        getInput('panjang') ?? getInput('length'),
        getInput('tinggi') ?? getInput('height'),
        getInput('luas_bukaan') ?? getInput('bukaan'),
        getSource('luas_bukaan')
      );
      if (trail.result !== null && trail.validationStatus.startsWith('ok')) {
        quantity = trail.result;
        quantitySource = 'DERIVED';
        derivation = trail;
      }
    } else if (d.formulaType === 'plester') {
      const trail = derivePlester(
        getInput('luas_bidang') ?? getInput('luas'),
        getInput('jumlah_sisi') ?? getInput('sisi'),
        getSource('jumlah_sisi')
      );
      if (trail.result !== null && trail.validationStatus === 'ok') {
        quantity = trail.result;
        quantitySource = 'DERIVED';
        derivation = trail;
      }
    }
    // Jika derivasi gagal (input tidak lengkap), lanjut ke logika fallback normal.
    // Jangan paksa — quantity tetap null/UNRESOLVED jika tidak ada dasar lain.
  }

  if (derivation && quantity !== null) {
    // Derivasi berhasil — quantitySource sudah DERIVED, skip fallback.
  } else if (fromDim.diameterOnly) {
    // Sprint 3 (B2): hanya diameter yang tercantum — diameter bukan
    // panjang elemen. Kuantitas UNRESOLVED apa pun klaim modelnya.
    quantity = null;
    quantitySource = 'UNRESOLVED';
  } else if (fromDim.ambiguousUnit) {
    quantity = null;
    quantitySource = 'UNRESOLVED';
  } else if (quantity !== null) {
    quantitySource =
      raw.quantitySource === 'DED_EXPLICIT'
        ? 'DED_EXPLICIT'
        : raw.quantitySource === 'ASSUMPTION'
          ? 'ASSUMPTION'
          : 'DED_GEOMETRIC';
  } else if (rawAIQuantity !== null && rawAIQuantity > 0 && rawSourceIsExplicit) {
    quantity = rawAIQuantity;
    quantitySource = 'DED_EXPLICIT';
  } else if (rawAIQuantity !== null && rawAIQuantity > 0) {
    // Inferensi AI tanpa evidence dimensi: tandai asumsi, JANGAN hitung subtotal final.
    quantity = rawAIQuantity;
    quantitySource = 'AI_INFERENCE';
  } else {
    quantity = null;
    quantitySource = 'UNRESOLVED';
  }
  if (quantity !== null && quantity <= 0) {
    quantity = null;
    quantitySource = 'UNRESOLVED';
  }

  // ---------------------------------------------------------------------------
  // TANGGA ASUMSI BERLABEL (keputusan owner 2026-11-08) — FULL_AI SAJA.
  // Mode DATABASE mempertahankan perilaku ketat di atas apa adanya.
  //
  // Filosofi owner: estimasi dikerjakan PENUH sampai ada angka, tetapi
  // setiap angka asumsi WAJIB berlabel + dasarnya dinyatakan dan bisa
  // ditunjukkan. Maka di FULL_AI:
  //  - item yang gagal resolusi deterministik TETAPI punya dasar
  //    terstruktur yang terverifikasi mekanis dari keluaran model itu
  //    sendiri (assumptionBasis.ts) → DIISI sebagai ASSUMPTION, dengan
  //    derivation + rumus tertulis, dan terhitung ke subtotal berlabel.
  //  - angka telanjang (AI_INFERENCE: raw.quantity tanpa dasar yang bisa
  //    ditunjuk) TIDAK lagi dipertahankan sebagai kuantitas — diturunkan
  //    ke UNRESOLVED ("Perlu Input") kecuali dasar terstruktur ditemukan,
  //    dalam hal ini nilai terhitung-dari-dasar yang dipakai (bukan angka
  //    telanjangnya).
  // Pagar lama tidak berubah: diameter-saja tidak menjadi panjang; dimensi
  // ambigu-satuan tetap ditolak sebagai dimensi (hanya sah sebagai asumsi
  // bila model menyatakan satuannya eksplisit — kanal SATUAN_DIASUMSIKAN).
  // ---------------------------------------------------------------------------
  const effectivePolicy = policy ?? 'FULL_AI';
  let assumptionFormula: string | undefined;
  let assumptionNote: string | undefined;
  let assumptionKind: AssumptionBasisKind | undefined;
  if (effectivePolicy === 'FULL_AI' && quantitySource !== 'DERIVED') {
    const basisCtx = {
      units,
      dimensionString: dims ? String(dims) : null,
      ambiguousUnit: fromDim.ambiguousUnit,
      diameterOnly: fromDim.diameterOnly === true,
    };
    if (quantity === null) {
      const basis = evaluateAssumptionBasis(raw, basisCtx);
      if (basis) {
        quantity = basis.quantity;
        quantitySource = 'ASSUMPTION';
        derivation = basis.derivation;
        assumptionFormula = basis.quantityFormula;
        assumptionNote = basis.note;
        assumptionKind = basis.kind;
      }
    } else if (quantitySource === 'AI_INFERENCE') {
      const basis = evaluateAssumptionBasis(raw, basisCtx);
      if (basis) {
        const replaced = Math.abs(basis.quantity - quantity) > 0.0001
          ? ` Angka telanjang model (${quantity}) digantikan nilai terhitung dari dasar terstruktur (${basis.quantity}).`
          : '';
        quantity = basis.quantity;
        quantitySource = 'ASSUMPTION';
        derivation = basis.derivation;
        assumptionFormula = basis.quantityFormula;
        assumptionNote = basis.note + replaced;
        assumptionKind = basis.kind;
      } else {
        quantity = null;
        quantitySource = 'UNRESOLVED';
        assumptionNote =
          'Perlu Input: kuantitas dari model tanpa dasar terstruktur yang bisa ditunjuk ' +
          '(derivation terstruktur / jadwal unit / satuan dimensi yang dinyatakan sebagai asumsi). ' +
          'Mode Full AI tidak menghitung angka telanjang — lengkapi dasar asumsi atau isi kuantitas manual.';
      }
    }
  }

  // Resolusi kanonis dulu (adapter ded-canonical): DATABASE mencoba AHSP
  // dulu; bila tidak ada di database, estimasi AI dipakai sebagai fallback
  // berlabel jelas (keputusan owner 2026-10-27 malam). FULL_AI memakai
  // harga kanonis bila terverifikasi, sisanya estimasi AI + match terlampir
  // untuk review.
  const aiPriceRaw = resolveDedPriceForPolicy(policy, raw.estimatedUnitPrice ?? raw.unitPrice, raw.unitPriceNote);
  // Tangga harga FULL_AI (owner 2026-11-08): estimasi harga AI hanya
  // ditempel bila model menyertakan CATATAN DASAR (unitPriceNote) — harga
  // tanpa dasar tidak ditampilkan sebagai angka. Gerbang ini di lapisan
  // konversi (bukan pricing.ts, yang kontraknya dikunci suite kebijakan)
  // dan hanya menjatuhkan FALLBACK AI: harga kanonis dari adapter di
  // bawah tetap menang bila cocok (tangga: kanonis → estimasi berdasar →
  // belum tersedia). Mode DATABASE tidak berubah.
  const aiPriceBasisNote = typeof raw.unitPriceNote === 'string' ? raw.unitPriceNote.trim() : '';
  const aiPrice =
    effectivePolicy === 'FULL_AI' && aiPriceRaw.priceSource === 'AI_ESTIMATE' && aiPriceBasisNote.length < 4
      ? {
          unitPrice: null,
          priceSource: 'UNRESOLVED' as const,
          note:
            'Estimasi harga AI tidak ditempel: model tidak menyertakan catatan dasar harga (unitPriceNote). ' +
            'Harga tanpa dasar tidak ditampilkan sebagai angka — lengkapi catatan dasar, pilih harga AHSP, atau isi harga manual.',
        }
      : aiPriceRaw;
  const claimedCode = typeof raw.ahspCode === 'string'
    ? raw.ahspCode
    : (typeof raw.code === 'string' ? raw.code : undefined);
  const ahspMatch = matchDedItemToAhsp({
    name,
    unit: units,
    specification: typeof raw.specification === 'string' ? raw.specification : undefined,
    claimedAhspCode: claimedCode,
  });
  const price = resolveDedPriceWithCanonical(policy ?? 'FULL_AI', ahspMatch, {
    unitPrice: aiPrice.unitPrice,
    source: aiPrice.priceSource,
    notes: aiPrice.note,
  });

  // FASE DED-FIX: alasan unresolved spesifik untuk ditampilkan ke pengguna.
  // Bedakan "tidak tercantum di DED" vs "gagal membaca".
  const baseQuantityNote =
    quantitySource === 'UNRESOLVED'
      ? fromDim.diameterOnly
        ? 'Hanya diameter yang tercantum di DED; panjang elemen tidak diketahui — kuantitas perlu input manual.'
        : fromDim.ambiguousUnit
          ? 'Satuan dimensi tidak jelas; perlu verifikasi manual.'
          : dims && dims.trim()
            ? 'Dimensi ditemukan tetapi gagal diparse; periksa manual.'
            : 'Kuantitas tidak tercantum di DED; perlu input manual atau asumsi terdokumentasi.'
      : quantitySource === 'AI_INFERENCE'
        ? 'Kuantitas dari inferensi AI; perlu ditinjau sebelum finalisasi.'
        : quantitySource === 'ASSUMPTION'
          ? 'Kuantitas dari asumsi; perlu ditinjau sebelum finalisasi.'
          : undefined;
  // Sprint 3 (G3): konflik dimensi antar-pass selalu terlihat sebagai
  // catatan review, apa pun catatan dasarnya.
  const quantityNoteWithConflict = dedupDimensionConflict
    ? [baseQuantityNote, 'Item se-nama dan se-satuan dengan dimensi berbeda ditemukan antar-pass — keduanya dipertahankan; perlu review.']
        .filter(Boolean)
        .join(' ')
    : baseQuantityNote;
  // Catatan tangga asumsi selalu tampil (dasar terstruktur yang dipakai,
  // atau alasan spesifik angka telanjang diturunkan ke Perlu Input).
  const quantityNote = assumptionNote
    ? [quantityNoteWithConflict, assumptionNote].filter(Boolean).join(' ')
    : quantityNoteWithConflict;

  return {
    id: `dedai-${idx + 1}`,
    name,
    category: String(raw.category || 'Lain-lain'),
    specification: raw.specification,
    description: raw.specification || name,
    units,
    quantity,
    quantitySource,
    quantityFormula: assumptionFormula || fromDim.formula || raw.quantityFormula || undefined,
    quantityNote,
    rawDimensions: fromDim.rawDimensions || undefined,
    derivation,
    rawAIQuantity,
    unitPrice: price.unitPrice,
    priceSource: price.source,
    ahspCode: price.ahspCode,
    ahspMatch: price.ahspMatch,
    priceAssumptionNote: price.notes,
    subtotal: null,
    // Usulan AI (mode FULL_AI saja; prompt DATABASE tidak memintanya):
    // disimpan terpisah, tidak pernah dipakai sebagai subtotal resmi.
    aiProposedSubtotal:
      typeof raw.proposedSubtotal === 'number' && Number.isFinite(raw.proposedSubtotal)
        ? raw.proposedSubtotal
        : null,
    sourcePages: Array.isArray(raw.sourcePages) ? raw.sourcePages.map(Number).filter(Number.isFinite) : [],
    sourceEvidence: raw.sourceEvidence || undefined,
    provenance: [
      `quantity:${quantitySource}`,
      ...(assumptionKind ? [`assumption-basis:${assumptionKind}`] : []),
      `price:${price.source}`,
      ...(price.ahspCode ? [`ahsp:${price.ahspCode}`] : []),
      quantity !== null ? `qty=${quantity}` : 'qty=null',
      price.unitPrice !== null ? `price=${price.unitPrice}` : 'price=null',
      ...(dedupDimensionConflict ? ['dedup-conflict: dimensi berbeda antar-pass untuk nama+satuan yang sama'] : []),
    ],
    stage: 'PARSE',
  };
}

export type DedAiOutputEnvelope =
  | DedAiOutput
  | {
      success: false;
      errorCode: string;
      stage: string;
      message: string;
      retryable: boolean;
      details?: string[];
    };

export type DedPassOutcomeStatus = 'OK' | 'EMPTY_RESPONSE' | 'MALFORMED_RESPONSE';

export interface DedPassOutcome {
  status: DedPassOutcomeStatus;
  items: any[];
  errorCode?: string;
}

/**
 * F4 (3.5): klasifikasikan hasil satu pass analisis. Tiga keadaan yang dulu
 * melebur menjadi EMPTY_RESPONSE kini dibedakan:
 * - respons tidak ter-parse sebagai JSON / bukan objek → MALFORMED (JSON);
 * - JSON valid tetapi `workItems` hilang atau bukan array → MALFORMED
 *   (format keluaran model tidak sesuai skema) — BUKAN "dokumen kosong";
 * - `workItems` array yang benar-benar kosong → EMPTY (model memang tidak
 *   menemukan pekerjaan pada kelompok halaman ini).
 */
export function classifyPassOutcome(parsedAi: unknown, parseFailed: boolean): DedPassOutcome {
  if (parseFailed || parsedAi == null || typeof parsedAi !== 'object') {
    return { status: 'MALFORMED_RESPONSE', items: [], errorCode: 'MALFORMED_JSON' };
  }
  const workItems = (parsedAi as { workItems?: unknown }).workItems;
  if (!Array.isArray(workItems)) {
    return { status: 'MALFORMED_RESPONSE', items: [], errorCode: 'MALFORMED_RESPONSE' };
  }
  if (workItems.length === 0) {
    return { status: 'EMPTY_RESPONSE', items: [] };
  }
  return { status: 'OK', items: workItems };
}

export type DedPassExecution =
  | { kind: 'PROVIDER_ERROR'; aiError: Extract<AiToolsResult, { success: false }>; retries: number; provider: string | null; model: string | null; requestId: string | null; usage: AiToolsUsage | null }
  | { kind: 'OUTCOME'; outcome: DedPassOutcome; retries: number; provider: string | null; model: string | null; requestId: string | null; usage: AiToolsUsage | null };

/** Sprint 3.1: batas percobaan ulang per pass untuk outcome MALFORMED. */
export const DED_PASS_MAX_MALFORMED_RETRIES = 1;

/**
 * Sprint 3.1 — Eksekusi satu pass dengan retry TERBATAS untuk keluaran
 * MALFORMED (investigasi landscape Sprint 3: satu run gugur
 * MALFORMED_RESPONSE padahal pass yang sama bisa sah pada percobaan
 * berikutnya karena keluaran model tidak deterministik).
 *
 * Aturan main (disengaja sempit):
 * - Hanya outcome MALFORMED_RESPONSE yang dicoba ulang, MAKSIMUM
 *   DED_PASS_MAX_MALFORMED_RETRIES (1) kali, dengan prompt yang sama.
 * - Kegagalan provider/gateway TIDAK dicoba ulang di sini: bisa berupa
 *   auth/kuota/batas biaya, dan semantik lastAiError harus utuh.
 * - Item hanya diambil dari outcome FINAL — percobaan sebelumnya tidak
 *   menyumbang item, jadi retry tidak dapat menggandakan item (dan
 *   finalisasi sendiri dilindungi kunci idempotensi G4).
 * - `retries` dikembalikan agar loop mencatatnya di jejak pass
 *   (passTrace.retryCount) — retry selalu terobservasi, tidak senyap.
 * - Bila percobaan ulang tetap MALFORMED, outcome MALFORMED itulah
 *   hasilnya: tidak pernah diubah menjadi sukses/EMPTY palsu.
 */
export async function executeDedPassAttempt(
  callAi: () => Promise<AiToolsResult>
): Promise<DedPassExecution> {
  let retries = 0;
  for (;;) {
    const aiResult = await callAi();
    if (!aiResult.success) {
      // Hasil error gateway tidak membawa identitas provider/model —
      // null jujur (bukan identitas percobaan sebelumnya).
      return { kind: 'PROVIDER_ERROR', aiError: aiResult, retries, provider: null, model: null, requestId: null, usage: null };
    }
    // SPRINT 4 (Tugas E/F): identitas AKTUAL dari respons gateway pada
    // percobaan ini ditangkap aditif untuk jejak pass & metadata usage.
    // Hanya percobaan FINAL yang dicatat (ia yang menentukan outcome).
    // SPRINT 5 (X3 + plumbing X1/X2): requestId gateway & usage
    // ternormalisasi percobaan final kini ikut ditangkap. requestId
    // kosong ('' dari jalur Node adapter) dinormalkan menjadi null —
    // korelasi yang tidak ada dinyatakan tidak ada, bukan string kosong.
    const attemptProvider = aiResult.provider ?? null;
    const attemptModel = aiResult.model ?? null;
    const attemptRequestId = typeof aiResult.requestId === 'string' && aiResult.requestId !== '' ? aiResult.requestId : null;
    const attemptUsage: AiToolsUsage | null = aiResult.usage ?? null;
    let parsedAi: DedFastOutput | DedDetailOutput | null = null;
    let parseFailed = false;
    if (aiResult.structured != null) {
      parsedAi = aiResult.structured as DedFastOutput | DedDetailOutput;
    } else {
      const recovered = parseDedAiModelResponse(aiResult.content);
      parsedAi = recovered.parsed as DedFastOutput | DedDetailOutput | null;
      parseFailed = recovered.parseFailed;
    }
    const outcome = classifyPassOutcome(parsedAi, parseFailed);
    if (outcome.status === 'MALFORMED_RESPONSE' && retries < DED_PASS_MAX_MALFORMED_RETRIES) {
      retries++;
      continue;
    }
    return { kind: 'OUTCOME', outcome, retries, provider: attemptProvider, model: attemptModel, requestId: attemptRequestId, usage: attemptUsage };
  }
}

/**
 * Sprint 1 (Workstream A): pemulihan respons model untuk pass DED.
 *
 * Urutan pemulihan (deterministik):
 * 1. Pindai objek `{...}` seimbang PERTAMA yang — setelah JSON.parse bersih
 *    (dengan pembersihan koma-ekor yang sama seperti providerClient) —
 *    adalah objek dengan `workItems` berupa array. Ini mencakup JSON murni
 *    dan JSON di dalam pagar markdown (pagar hanyalah prosa di sekeliling
 *    objek), serta JSON yang terbungkus prosa penjelasan: objek payload
 *    didahulukan daripada rentang JSON lain yang mungkin lebih panjang
 *    tetapi bukan payload (heuristik "terpanjang" extractJson bisa memilih
 *    objek contoh dari prosa).
 * 2. Bila tidak ada objek workItems yang sah, jatuh ke extractJson milik
 *    providerClient persis seperti sebelumnya (paritas perilaku lama,
 *    termasuk objek tanpa workItems → MALFORMED_RESPONSE di
 *    classifyPassOutcome).
 * 3. Bila keduanya gagal: parseFailed = true → MALFORMED_JSON. Prosa
 *    markdown murni tanpa objek yang sah TIDAK PERNAH menjadi sukses palsu.
 *
 * Fungsi ini tidak mengubah semantik classifyPassOutcome, kalkulator,
 * harga, atau provenance — ia hanya menentukan objek mana yang dinilai.
 */
export function parseDedAiModelResponse(content: unknown): { parsed: unknown; parseFailed: boolean } {
  if (typeof content !== 'string' || content.trim() === '') {
    return { parsed: null, parseFailed: true };
  }
  const text = content;
  let candidates = 0;
  for (let i = 0; i < text.length && candidates < 200; i++) {
    if (text[i] !== '{') continue;
    candidates++;
    const end = balancedJsonEnd(text, i);
    if (end === -1) continue;
    const slice = text.slice(i, end);
    if (!slice.includes('"workItems"')) continue;
    try {
      const value: unknown = JSON.parse(slice.replace(/,\s*([}\]])/g, '$1'));
      if (value != null && typeof value === 'object' && Array.isArray((value as { workItems?: unknown }).workItems)) {
        return { parsed: value, parseFailed: false };
      }
    } catch {
      /* bukan JSON bersih — lanjutkan pemindaian */
    }
  }
  try {
    return { parsed: aiToolsProviderClient.extractJson<unknown>(text), parseFailed: false };
  } catch {
    return { parsed: null, parseFailed: true };
  }
}

/**
 * F4 (3.5): keputusan error akhir bila tidak ada satu pun item terkumpul.
 * Kegagalan gateway (lastAiError) diteruskan apa adanya. Bila ada pass
 * MALFORMED, errornya adalah kegagalan PEMROSESAN model — pesan tidak boleh
 * menyalahkan isi dokumen. NO_DATA hanya bila semua pass menjawab sah
 * dengan daftar pekerjaan yang memang kosong.
 */
export function decideNoItemsError(
  passStatuses: ReadonlyArray<string>,
  lastAiError: { errorCode: string; stage: string; message: string; retryable: boolean } | null
): { errorCode: string; stage: string; message: string; retryable: boolean } {
  if (lastAiError) {
    return {
      errorCode: lastAiError.errorCode,
      stage: lastAiError.stage,
      message: lastAiError.message,
      retryable: lastAiError.retryable,
    };
  }
  const malformedCount = passStatuses.filter((s) => s === 'MALFORMED_RESPONSE').length;
  if (malformedCount > 0) {
    return {
      errorCode: 'MALFORMED_RESPONSE',
      stage: 'parse-ai',
      message:
        `Model mengembalikan format keluaran yang tidak sesuai pada ${malformedCount} pass ` +
        `(respons bukan daftar pekerjaan yang valid) — ini kegagalan pemrosesan model, ` +
        `bukan berarti DED tidak memuat pekerjaan. Silakan coba lagi.`,
      retryable: true,
    };
  }
  return {
    errorCode: 'NO_DATA',
    stage: 'parse-ai',
    message: 'Model tidak menemukan pekerjaan apa pun di DED.',
    retryable: true,
  };
}

/**
 * Sprint 3 (B1) — Anggaran request per pass. Gateway menolak prompt di
 * atas 20.000 karakter (api/_lib/security.js); Sprint 1 menetapkan
 * disiplin ukuran request gabungan (system + prompt) ≤ 19.500 untuk
 * Dokumen AI. Sprint 2 membuktikan pass DED menembus batas itu (klaster
 * 20–40 halaman) sehingga pass gugur PAYLOAD_TOO_LARGE di balik
 * success:true. Anggaran ini ditegakkan SEBELUM pengiriman, dengan
 * mengukur prompt yang benar-benar akan dikirim.
 */
export const DED_PASS_REQUEST_BUDGET_CHARS = 19500;

export interface DedPassPlanGroup {
  label: string;
  pages: SelectedPage[];
}

export type DedPassPlanEntry =
  | { kind: 'SEND'; label: string; pages: SelectedPage[]; requestChars: number }
  | { kind: 'SKIPPED_BUDGET'; label: string; pages: SelectedPage[]; requestChars: number; reason: string };

/**
 * Sprint 3 (B1) — Perencana pass sadar-anggaran (fungsi murni, dapat
 * diuji). Untuk setiap kelompok, halaman diakumulasi serakah: sebuah
 * halaman ditambahkan hanya bila request terukur (system + prompt,
 * lewat `measure` yang memakai pembangun prompt asli) tetap ≤ budget.
 * Kelompok yang melebihi anggaran DIPECAH menjadi beberapa pass SEND —
 * tidak ada halaman yang dibuang. Satu-satunya pengecualian: satu
 * halaman yang SENDIRIAN sudah melebihi anggaran menjadi entri
 * SKIPPED_BUDGET dengan alasan eksplisit (tidak dikirim untuk gagal).
 */
export function planDedPasses(
  groups: ReadonlyArray<DedPassPlanGroup>,
  measure: (pages: SelectedPage[]) => number,
  budget: number = DED_PASS_REQUEST_BUDGET_CHARS
): DedPassPlanEntry[] {
  const plan: DedPassPlanEntry[] = [];
  for (const group of groups) {
    let current: SelectedPage[] = [];
    let currentChars = 0;
    const flush = () => {
      if (current.length > 0) {
        plan.push({ kind: 'SEND', label: group.label, pages: current, requestChars: currentChars });
        current = [];
        currentChars = 0;
      }
    };
    for (const page of group.pages) {
      const trial = [...current, page];
      const trialChars = measure(trial);
      if (trialChars <= budget) {
        current = trial;
        currentChars = trialChars;
        continue;
      }
      if (current.length > 0) {
        flush();
        const singleChars = measure([page]);
        if (singleChars <= budget) {
          current = [page];
          currentChars = singleChars;
        } else {
          plan.push({
            kind: 'SKIPPED_BUDGET',
            label: group.label,
            pages: [page],
            requestChars: singleChars,
            reason:
              `Halaman ${page.page} sendirian membutuhkan ${singleChars} karakter request ` +
              `(anggaran ${budget}) — tidak dikirim agar tidak gagal PAYLOAD_TOO_LARGE.`,
          });
        }
      } else {
        plan.push({
          kind: 'SKIPPED_BUDGET',
          label: group.label,
          pages: [page],
          requestChars: trialChars,
          reason:
            `Halaman ${page.page} sendirian membutuhkan ${trialChars} karakter request ` +
            `(anggaran ${budget}) — tidak dikirim agar tidak gagal PAYLOAD_TOO_LARGE.`,
        });
      }
    }
    flush();
  }
  return plan;
}

/**
 * Sprint 3 (B1) — Ringkasan status pass untuk envelope. Hasil bersifat
 * parsial bila ada pass yang gagal (FAILED/PARTIAL) atau dilewati
 * (SKIPPED_*) — parsial tidak pernah dilaporkan sebagai sukses penuh.
 */
export function summarizePassOutcomes(
  passTraces: ReadonlyArray<DedPassTraceEntry>
): DedPassSummary {
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  for (const t of passTraces) {
    const s = t.passStatus ?? (
      t.status === 'OK' || t.status === 'EMPTY_RESPONSE'
        ? 'SUCCESS'
        : t.status === 'MALFORMED_RESPONSE'
          ? 'PARTIAL'
          : t.status === 'FAILED'
            ? 'FAILED'
            : t.status
    );
    if (s === 'SUCCESS') succeeded++;
    else if (s === 'SKIPPED_BUDGET' || s === 'SKIPPED_UNSUPPORTED') skipped++;
    else failed++;
  }
  return {
    totalPasses: passTraces.length,
    succeededPasses: succeeded,
    failedPasses: failed,
    skippedPasses: skipped,
    partial: failed > 0 || skipped > 0,
  };
}

/**
 * Sprint 3 (G3) — Sidik dimensi deterministik untuk identitas dedup:
 * nilai numerik terparse dari string dimensi item mentah, terurut.
 * String kosong / tanpa angka → '' (identitas tanpa dimensi).
 */
const numericKey = (n: number): string => String(Math.round(n * 1e6) / 1e6);

export function dimensionSignatureOf(raw: any): string {
  const dims = String(raw?.dimensions || raw?.quantityFormula || '');
  if (!dims.trim()) return '';
  return parseDimensionsString(dims)
    .slice()
    .sort((a, b) => a - b)
    .map(numericKey)
    .join('x');
}

/**
 * Sprint 3 (G3) — Gabung + dedup antar-pass yang sadar dimensi.
 * Kunci identitas = nama ternormalisasi + satuan + sidik dimensi.
 * - Nama+satuan+dimensi sama → digabung seperti perilaku lama (utamakan
 *   item yang kuantitasnya terisi).
 * - Nama+satuan sama tetapi dimensi BERBEDA → kedua item DIPERTAHANKAN;
 *   item sesudah yang pertama ditandai `__dedupDimensionConflict` agar
 *   convertAiItem menempelkan catatan review (dulu salah satunya
 *   tertelan diam-diam: 0,12 m³ vs 0,36 m³ menjadi satu item).
 * - Tanpa dimensi di kedua sisi → tanda tangan '' sama → digabung
 *   seperti perilaku lama.
 */
export function mergeRawItemsAcrossPasses(rawItems: any[]): any[] {
  const keyOf = (raw: any) =>
    `${String(raw.name || '').toLowerCase().replace(/\s+/g, ' ').trim()}|` +
    `${String(raw.units || raw.unit || '').toLowerCase()}|` +
    dimensionSignatureOf(raw);
  const merged = new Map<string, any>();
  const order: any[] = [];
  for (const raw of rawItems) {
    const key = keyOf(raw);
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, raw);
      order.push(raw);
      continue;
    }
    if (prev.quantity == null && typeof raw.quantity === 'number') {
      merged.set(key, raw);
      order[order.indexOf(prev)] = raw;
    }
  }
  const byNameUnit = new Map<string, any[]>();
  for (const item of order) {
    const k = keyOf(item).split('|').slice(0, 2).join('|');
    const arr = byNameUnit.get(k) || [];
    arr.push(item);
    byNameUnit.set(k, arr);
  }
  for (const group of byNameUnit.values()) {
    if (group.length < 2) continue;
    const sigs = new Set(group.map((it) => dimensionSignatureOf(it)));
    if (sigs.size > 1) {
      for (const item of group.slice(1)) item.__dedupDimensionConflict = true;
    }
  }
  return order;
}

/** Halaman sumber minimal untuk verifikasi evidensial kuantitas. */
export interface DedEvidencePage {
  page: number;
  text: string;
}

function sourceNumberSet(pages: ReadonlyArray<DedEvidencePage>): Set<string> {
  const set = new Set<string>();
  for (const p of pages) {
    for (const n of parseDimensionsString(p.text || '')) set.add(numericKey(n));
  }
  return set;
}

/** Varian skala satuan yang wajar untuk satu angka masukan (mm↔cm↔m). */
function numberVariants(n: number): string[] {
  return [n, n * 1000, n / 1000, n * 100, n / 100].map(numericKey);
}

function quantityInputNumbers(item: DedAiItem): number[] {
  const fromDims = item.rawDimensions ? parseDimensionsString(item.rawDimensions) : [];
  if (fromDims.length > 0) return [...new Set(fromDims.filter((n) => n > 0))];
  if (item.quantityFormula) {
    // Hanya kepala formula (string dimensi model) — bagian "(= …)" dan
    // "[konversi …]" adalah hasil hitung aplikasi, bukan masukan.
    const head = item.quantityFormula.split('(')[0].split('[')[0];
    const nums = parseDimensionsString(head).filter((n) => n > 0);
    if (nums.length > 0) return [...new Set(nums)];
  }
  return item.quantity !== null && item.quantity > 0 ? [item.quantity] : [];
}

/**
 * Sprint 3 (B2) — Verifikasi evidensial label kuantitas. Label
 * DED_EXPLICIT / DED_GEOMETRIC adalah klaim bahwa angka-angkanya berasal
 * dari dokumen sumber; klaim model saja TIDAK cukup. Setiap angka
 * masukan dimensi item harus ditemukan di teks sumber (halaman yang
 * disitir item bila ada, dengan fallback seluruh dokumen; varian skala
 * mm↔cm↔m diterima). Bila ada angka yang tidak ditemukan di mana pun:
 * label DITURUNKAN ke AI_INFERENCE — nilai kuantitasnya dipertahankan
 * sebagai estimasi model — dan penurunan dicatat di quantityNote +
 * provenance. Item DERIVED tidak disentuh (input terstrukturnya punya
 * penanda sumber sendiri di derivation.ts).
 */
export function verifyItemQuantityEvidence(item: DedAiItem, pages: ReadonlyArray<DedEvidencePage>): DedAiItem {
  if (item.quantity === null) return item;
  if (item.quantitySource !== 'DED_EXPLICIT' && item.quantitySource !== 'DED_GEOMETRIC') return item;
  const inputs = quantityInputNumbers(item);
  if (inputs.length === 0) return item;
  const cited = item.sourcePages.length > 0
    ? pages.filter((p) => item.sourcePages.includes(p.page))
    : [];
  const missingIn = (set: Set<string>) =>
    inputs.filter((n) => !numberVariants(n).some((v) => set.has(v)));
  let missing: number[];
  if (cited.length > 0) {
    missing = missingIn(sourceNumberSet(cited));
    if (missing.length === 0) return item;
    // Sitiran halaman bisa saja tidak tepat; label hanya gugur bila
    // angkanya tidak ada di SELURUH dokumen.
    const docMissing = missingIn(sourceNumberSet(pages));
    if (docMissing.length === 0) {
      item.provenance = [...item.provenance, 'quantity-evidence: ditemukan di dokumen di luar halaman sitiran'];
      return item;
    }
    missing = docMissing;
  } else {
    missing = missingIn(sourceNumberSet(pages));
    if (missing.length === 0) return item;
  }
  const previous = item.quantitySource;
  item.quantitySource = 'AI_INFERENCE';
  const reason =
    `Kuantitas diturunkan dari ${previous} ke inferensi AI: angka dimensi ` +
    `(${missing.join(', ')}) tidak ditemukan di teks sumber DED — label sumber tidak terverifikasi.`;
  item.quantityNote = [item.quantityNote, reason].filter(Boolean).join(' ');
  item.provenance = [...item.provenance, `quantity:${previous}->AI_INFERENCE(evidence-unverified)`];
  return item;
}

/** Sprint 3 (B2): terapkan verifikasi evidensial ke seluruh item hasil. */
export function applyQuantityEvidenceVerification(
  items: DedAiItem[],
  pages: ReadonlyArray<DedEvidencePage>
): DedAiItem[] {
  for (const item of items) verifyItemQuantityEvidence(item, pages);
  return items;
}

export class DedAiEstimateService {
  public async execute(options: DedAiServiceOptions): Promise<DedAiOutputEnvelope> {
    // Gerbang timing terpusat (spesifikasi 2026-10-27): pembacaan DED =
    // complex → minimum 3 detik sejak tombol ditekan, paralel dengan
    // pipeline (parse + multi-pass AI), bukan sesudahnya.
    const startedAt = Date.now();
    try {
      return await waitForMinimum(startedAt, minDelayFor('complex'), this.run(options));
    } catch (err: any) {
      return {
        success: false,
        errorCode: 'INTERNAL',
        stage: 'ded-ai-estimate:pipeline',
        message: err?.message || 'Kesalahan tidak terduga pada pipeline DED AI.',
        retryable: false,
      };
    }
  }

  private async run(options: DedAiServiceOptions): Promise<DedAiOutputEnvelope> {
    // SPRINT 4 (Tugas E): penangkapan waktu operasi secara aditif untuk
    // metadata usage (startedAt/finishedAt) — tidak mengubah alur.
    const runStartedAt = new Date().toISOString();
    const { projectType, mode } = options;
    const jobId = `dedai-${Date.now()}`;
    const notify = (stage: string, label: string, percent: number, message: string, extra?: { pagesRead?: number; totalPages?: number }) => {
      options.onProgress?.({
        stage,
        label,
        percent,
        message,
        pagesRead: extra?.pagesRead ?? 0,
        totalPages: extra?.totalPages ?? 0,
      } as DedAiProgressEvent);
    };

    if (!isProjectTypeSupported(projectType)) {
      return {
        success: false,
        errorCode: 'PROJECT_TYPE_UNSUPPORTED',
        stage: 'verify',
        message: `Tipe proyek "${projectType}" tidak didukung (pakai: ${PROJECT_TYPES.join(', ')})`,
      } as any;
    }

    // F4 (3.6): label jujur — pipeline ini mengekstrak TEKS saja
    // (parseDedPdf dipanggil dengan withImages: false; gambar tidak dibaca).
    notify('PARSE', 'Membaca DED', 10, 'Mengekstrak teks dari PDF DED…');
    const parsedResult = await parseDedPdf(options.buffer, options.fileName, { withImages: false });
    if (!parsedResult || 'success' in parsedResult) {
      return parsedResult as any; // structured error
    }
    const parsed = parsedResult as DedParsedDocument;

    if (parsed.pages.length === 0) {
      return {
        success: false,
        errorCode: 'NO_DATA',
        stage: 'parse',
        message: 'Tidak ada halaman yang dapat dibaca dari PDF.',
        retryable: false,
      };
    }

    notify('PICK_MODE', mode === 'FAST' ? 'Mode Cepat' : 'Mode Detail', 30, `Menyiapkan model ${mode === 'FAST' ? 'EZRAB Fast Engine' : 'EZRAB Deep Engine'}…`, {
      pagesRead: parsed.pages.length,
      totalPages: parsed.pages.length,
    });

    // === Seleksi halaman TANPA batas buang (owner 2026-10-27) ===
    // Dulu: budget teks (FAST 45.000 / DETAIL 90.000 karakter) + potong
    // per halaman membuang halaman dan memotong item — daftar pekerjaan
    // hasil DED AI jadi sedikit dibanding model lain yang membaca seluruh
    // dokumen. Sekarang: SEMUA halaman berteks dikirim utuh (tidak ada
    // SKIPPED_BUDGET, tidak ada potong per halaman). Halaman dipilih
    // menurut prioritas jenisnya hanya untuk urutan pass. FASE P0: jejak
    // per halaman tetap dicatat lengkap.
    const selection = selectPagesWithTrace(parsed.pages);
    const pageSummaries = selection.selected;
    const pageTrace = selection.trace;
    const buildingType = options.projectType;

    // === Analisis multi-pass per kelompok pekerjaan (FASE P0) ===
    // Satu panggilan dengan plafon token kecil memotong daftar pekerjaan;
    // per kelompok, setiap panggilan punya plafon sendiri (FAST 16.000 /
    // DETAIL 24.000 token) dan hasilnya digabung dengan dedup.
    // Kelompok mengikuti kelompok pekerjaan; satu halaman masuk satu pass,
    // tetapi item hasilnya dapat memetakan ke beberapa divisi (klasifikasi
    // WBS per item) dan duplikasi antar-pass dibuang oleh dedup di bawah.
    const CLUSTERS: Array<{ label: string; types: string[] }> = [
      { label: 'Arsitektur & Ruang', types: ['DENAH', 'SITUASI', 'TAMPAK'] },
      { label: 'Struktur & Pondasi', types: ['STRUKTUR', 'POTONGAN'] },
      { label: 'Atap', types: ['ATAP'] },
      { label: 'Plafond & Lantai', types: ['PLAFOND', 'LANTAI'] },
      { label: 'Kusen, Pintu & Jendela', types: ['JADWAL_KUSEN', 'DETAIL_KUSEN'] },
      { label: 'Sanitair & Plambing', types: ['SANITAIR', 'MEP_PLUMBING'] },
      { label: 'Instalasi Listrik', types: ['MEP_ELECTRICAL', 'MEP'] },
      { label: 'Spesifikasi & Lainnya', types: ['SPESIFIKASI', 'HALAMAN'] },
    ];
    let groups: Array<{ label: string; pages: typeof pageSummaries }> = CLUSTERS
      .map(c => ({ label: c.label, pages: pageSummaries.filter(s => c.types.includes(s.pageType)) }))
      .filter(g => g.pages.length > 0);
    // Dokumen kecil cukup satu pass (hindari latensi/biaya berlipat).
    if (pageSummaries.length <= 10 || groups.length <= 1) {
      groups = [{ label: 'Semua Halaman', pages: pageSummaries }];
    }
    // === Sprint 3 (B1): pecah kelompok menjadi pass SADAR-ANGGARAN ===
    // Ambang lama 60.000 karakter teks per pass mengabaikan plafon
    // gateway (prompt > 20.000 ditolak): klaster 20–40 halaman gugur
    // PAYLOAD_TOO_LARGE di balik success:true (Sprint 2: gedung
    // kehilangan 8/11 pass; irigasi gugur total). Sekarang ukuran
    // request yang SEBENARNYA (system + prompt dari pembangun prompt
    // asli) diukur sebelum pengiriman dan setiap pass dijamin
    // ≤ DED_PASS_REQUEST_BUDGET_CHARS. Ini tetap BUKAN batas buang:
    // kelompok dipecah menjadi lebih banyak pass; satu-satunya halaman
    // yang tidak dikirim adalah halaman yang sendirian sudah melebihi
    // anggaran — dan itu tercatat SKIPPED_BUDGET dengan alasan, bukan
    // hilang diam-diam.
    const pricingPolicy = options.policy ?? 'FULL_AI';
    const buildForPages = (pages: typeof pageSummaries) => mode === 'FAST'
      ? buildFastPrompt({ projectType, buildingType, pageSummaries: pages, pricingPolicy })
      : buildDetailPrompt({ projectType, buildingType, pageSummaries: pages, pricingPolicy });
    const measureRequest = (pages: typeof pageSummaries) => {
      const b = buildForPages(pages);
      return b.system.length + b.prompt.length;
    };
    const passPlan = planDedPasses(groups, measureRequest);
    // Tautkan halaman terpilih ke pass-nya di jejak; halaman pada pass
    // SKIPPED_BUDGET dibalik status jejaknya (UI sudah menampilkannya).
    const traceByPage = new Map(pageTrace.map(t => [t.page, t]));
    passPlan.forEach((entry, gi) => {
      for (const s of entry.pages) {
        const t = traceByPage.get(s.page);
        if (!t) continue;
        t.passIndex = gi;
        t.clusterLabel = entry.label;
        if (entry.kind === 'SKIPPED_BUDGET') {
          t.status = 'SKIPPED_BUDGET';
          t.sentChars = 0;
          t.reason = entry.reason;
        }
      }
    });
    const budgetSkippedCount = pageTrace.filter((t) => t.status === 'SKIPPED_BUDGET').length;

    const maxTokens = mode === 'FAST' ? 16000 : 24000;
    const productId = mode === 'FAST' ? 'DED_AI_FAST' : 'DED_AI_DETAIL';
    const rawItems: any[] = [];
    const passTraces: DedPassTraceEntry[] = [];
    let lastAiError: any = null;

    for (let gi = 0; gi < passPlan.length; gi++) {
      const planEntry = passPlan[gi];
      const passTrace: DedPassTraceEntry = {
        passIndex: gi,
        clusterLabel: planEntry.label,
        pageTypes: [...new Set(planEntry.pages.map(s => s.pageType))],
        pages: planEntry.pages.map(s => s.page),
        productId,
        mode,
        maxTokens,
        status: 'OK',
        itemCount: 0,
        // Sprint 3 (B1): ukuran request terukur dicatat sebagai bukti
        // anggaran ditegakkan sebelum pengiriman.
        requestChars: planEntry.requestChars,
      };

      if (planEntry.kind === 'SKIPPED_BUDGET') {
        // Tidak dikirim — mengirimnya pasti gagal PAYLOAD_TOO_LARGE.
        // Tercatat eksplisit; hasil akhir menjadi parsial, bukan sukses.
        passTrace.status = 'SKIPPED_BUDGET';
        passTrace.passStatus = 'SKIPPED_BUDGET';
        passTrace.reason = planEntry.reason;
        passTraces.push(passTrace);
        continue;
      }

      // Kebijakan harga DIPAKAIKAN ke prompt (sebelumnya prompt tidak
      // menerima policy sehingga selalu meminta harga AI apa pun modenya).
      const built = buildForPages(planEntry.pages);

      notify('ANALYZE', mode === 'FAST' ? 'Menganalisis DED' : 'Analisis mendalam',
        50 + Math.round((gi / passPlan.length) * 25),
        passPlan.length > 1
          ? `Mengirim kelompok halaman ${gi + 1}/${passPlan.length} ke model AI…`
          : 'Mengirim prompt ke model AI untuk analisis…',
        { pagesRead: parsed.pages.length, totalPages: parsed.pages.length });

      // Sprint 3.1: eksekusi + interpretasi + retry MALFORMED terbatas
      // dirangkum executeDedPassAttempt (item hanya dari outcome final).
      const execution = await executeDedPassAttempt(() =>
        aiToolsProviderClient.execute({
          productId,
          prompt: built.prompt,
          systemPrompt: built.system,
          jsonMode: true,
          maxTokens,
          timeoutMs: mode === 'FAST' ? 120000 : 180000,
        })
      );
      passTrace.retryCount = execution.retries;
      // SPRINT 4: identitas aktual percobaan final (null bila provider error).
      passTrace.provider = execution.provider;
      passTrace.model = execution.model;
      // SPRINT 5 (X3): korelasi requestId + usage attempt final per pass.
      passTrace.requestId = execution.requestId;
      passTrace.usage = execution.usage;

      if (execution.kind === 'PROVIDER_ERROR') {
        lastAiError = execution.aiError;
        passTrace.status = 'FAILED';
        passTrace.passStatus = 'FAILED';
        passTrace.errorCode = execution.aiError.errorCode;
        passTraces.push(passTrace);
        continue;
      }

      // F4 (3.5): bedakan format keluaran rusak (MALFORMED) dari dokumen
      // yang memang tidak menghasilkan item (EMPTY) — lihat classifyPassOutcome.
      const outcome = execution.outcome;
      if (outcome.status === 'OK') {
        rawItems.push(...outcome.items);
      }
      passTrace.itemCount = outcome.items.length;
      passTrace.status = outcome.status;
      // Sprint 3 (B1): status semantik — MALFORMED berarti pass terkirim
      // tetapi cakupannya hilang (PARTIAL), bukan sukses.
      passTrace.passStatus = outcome.status === 'MALFORMED_RESPONSE' ? 'PARTIAL' : 'SUCCESS';
      if (outcome.errorCode) passTrace.errorCode = outcome.errorCode;
      passTraces.push(passTrace);
    }

    if (rawItems.length === 0) {
      // Sprint 3 (B1): bila tidak ada item KARENA halaman dilewati
      // anggaran (dan tidak ada kegagalan lain), errornya harus menyebut
      // penyebab sebenarnya — bukan NO_DATA yang menyalahkan dokumen.
      const onlyBudgetSkips =
        !lastAiError &&
        !passTraces.some((t) => t.status === 'MALFORMED_RESPONSE') &&
        passTraces.some((t) => t.status === 'SKIPPED_BUDGET');
      if (onlyBudgetSkips) {
        return {
          success: false,
          errorCode: 'PAYLOAD_TOO_LARGE',
          stage: 'analyze',
          message:
            'Satu atau lebih halaman terlalu besar untuk dikirim ke model dalam anggaran request ' +
            'yang aman (lihat analysisTrace: pass SKIPPED_BUDGET). Tidak ada item yang dihasilkan dari halaman tersebut.',
          retryable: false,
        };
      }
      return {
        success: false,
        ...decideNoItemsError(passTraces.map((t) => t.status), lastAiError),
      };
    }

    // Sprint 3 (G3): gabung + dedup antar-pass yang sadar dimensi —
    // nama+satuan sama tetapi dimensi berbeda TIDAK lagi tertelan.
    const mergedRaws = mergeRawItemsAcrossPasses(rawItems);
    const policy = options.policy ?? 'FULL_AI';
    const items: DedAiItem[] = mergedRaws.map((raw, idx) => convertAiItem(idx, raw, mode, policy));
    // Sprint 3 (B2): label DED_EXPLICIT/DED_GEOMETRIC diverifikasi ke
    // teks sumber SEBELUM kalkulator menghitung — klaim model saja
    // tidak cukup untuk label sumber-terverifikasi.
    applyQuantityEvidenceVerification(items, parsed.pages);
    // Sprint 3.1: evaluator kewajaran kuantitas — anotasi deterministik
    // (quantityReview + penanda quantityNote) atas SETIAP item
    // berkuantitas. Bukti sumber yang sah tidak menjamin skala hasil
    // derivasi masuk akal; evaluator menilai sumbu itu TANPA mengubah
    // nilai/status/provenance apa pun.
    // Sprint 3.2: tipe proyek diteruskan sebagai konteks yang DICATAT
    // evaluator (bukan bukti independen bagi sumbu skala total-item).
    applyQuantityReasonablenessReview(items, { projectType });

    // === Lapisan penyelesaian Full AI (mandat owner 2026-11-10) ===
    // Mode FULL_AI saja: lubang harga dilengkapi dari referensi pasar
    // eksternal terkurasi dan lubang kuantitas dari jalur estimasi
    // kuantitas DED (asumsi berlabel dari konteks denah), di antara
    // konversi dan kalkulator — subtotal tetap dihitung mesin kanonis.
    // Mode DATABASE tidak pernah melewati lapisan ini (dipertahankan
    // persis seperti sebelumnya). Harga kanonis/manual tidak ditimpa.
    let completionReport: import('./types').DedCompletionReport | undefined;
    let finalItems = items;
    if (policy === 'FULL_AI') {
      const completed = completeDedBatch(items, derivePlanContext(items), { policy });
      finalItems = completed.items;
      completionReport = completed.report;
    }

    const output = DedAiCalculator.buildOutput({
      jobId,
      projectType,
      mode,
      policy,
      projectName: options.projectName || 'Proyek DED AI',
      fileName: options.fileName,
      pageCount: parsed.pages.length,
      items: finalItems,
    });
    if (completionReport) output.completionReport = completionReport;

    // === FASE P0: cakupan 12 divisi + jejak analisis ===
    // Coverage dihitung dari item yang sama yang masuk output (diklasifikasi
    // WBS oleh classifier yang sudah ada) — bukan daftar terpisah.
    const wbsGrouped = groupByWbs(output.items, projectType);
    const classifiedItems = [
      ...wbsGrouped.groups.flatMap(g => g.items),
      ...wbsGrouped.unclassified,
    ];
    output.divisionCoverage = buildDivisionCoverage({
      classifiedItems,
      pages: parsed.pages.map(p => ({ page: p.page, pageType: p.pageType })),
      projectType,
    });
    const traceWarnings: string[] = [];
    if (budgetSkippedCount > 0) {
      traceWarnings.push(
        `${budgetSkippedCount} halaman tidak dikirim ke model karena melebihi anggaran request per pass — lihat analysisTrace.pages berstatus SKIPPED_BUDGET.`
      );
    }
    // F4 (3.6): halaman tanpa lapisan teks diperingatkan eksplisit dengan
    // rentang halamannya — bukan diperlakukan sebagai halaman sah.
    if (selection.noTextCount > 0) {
      const noTextPages = pageTrace.filter((t) => t.status === 'NO_TEXT').map((t) => t.page);
      traceWarnings.push(
        `${selection.noTextCount} halaman tanpa lapisan teks tidak dapat dianalisis (kemungkinan hasil scan/gambar — butuh OCR): halaman ${formatPageRanges(noTextPages)}.`
      );
    }
    // Selisih total usulan AI vs total terverifikasi (bila ada) ikut
    // jejak sebagai peringatan — bukan ditimpa diam-diam.
    if (output.totalDiscrepancyNote) traceWarnings.push(output.totalDiscrepancyNote);
    for (const pt of passTraces) {
      if (pt.status === 'FAILED') {
        traceWarnings.push(
          `Pass "${pt.clusterLabel}" (hal. ${pt.pages.join(', ')}) gagal diproses${pt.errorCode ? ` (${pt.errorCode})` : ''} — item dari kelompok ini mungkin tidak lengkap.`
        );
      } else if (pt.status === 'MALFORMED_RESPONSE') {
        traceWarnings.push(
          `Pass "${pt.clusterLabel}" (hal. ${pt.pages.join(', ')}) mengembalikan format keluaran yang tidak sesuai${pt.errorCode ? ` (${pt.errorCode})` : ''}${pt.retryCount ? ` — sudah dicoba ulang ${pt.retryCount}× dan tetap tidak sesuai` : ''} — item dari kelompok ini mungkin tidak lengkap.`
        );
      } else if (pt.status === 'EMPTY_RESPONSE') {
        traceWarnings.push(
          `Pass "${pt.clusterLabel}" (hal. ${pt.pages.join(', ')}) tidak menghasilkan item.`
        );
      } else if (pt.status === 'SKIPPED_BUDGET') {
        traceWarnings.push(
          `Pass "${pt.clusterLabel}" (hal. ${pt.pages.join(', ')}) dilewati anggaran request — halaman ini TIDAK dianalisis${pt.reason ? `: ${pt.reason}` : ''}`
        );
      }
    }
    // Sprint 3 (B1): status kelengkapan eksplisit pada envelope — hasil
    // parsial tidak pernah dibaca sebagai sukses penuh.
    const passSummary = summarizePassOutcomes(passTraces);
    output.partial = passSummary.partial;
    output.passSummary = passSummary;
    if (passSummary.partial) {
      traceWarnings.unshift(
        `Analisis PARSIAL: ${passSummary.succeededPasses} dari ${passSummary.totalPasses} pass berhasil` +
        `${passSummary.failedPasses > 0 ? `, ${passSummary.failedPasses} gagal` : ''}` +
        `${passSummary.skippedPasses > 0 ? `, ${passSummary.skippedPasses} dilewati` : ''} — hasil tidak lengkap.`
      );
    }
    output.analysisTrace = {
      totalPages: parsed.pages.length,
      selectedPageCount: pageSummaries.length,
      skippedPageCount: budgetSkippedCount,

      // Anggaran per pass (Sprint 3 B1); total terkirim dihitung dari
      // jejak halaman aktual (halaman SKIPPED_BUDGET sentChars = 0).
      totalCharsBudget: DED_PASS_REQUEST_BUDGET_CHARS,
      totalCharsSent: pageTrace.reduce((acc, t) => acc + t.sentChars, 0),
      pages: pageTrace,
      passes: passTraces,
      warnings: traceWarnings,
    };

    // HARDENING Tahap 6: catatan usage workflow (metadata kesiapan
    // Unified Credits — bukan tagihan; lihat usageMetadata.ts).
    output.usage = buildDedUsageFromStandard(output, {
      projectId: options.projectId,
      workspaceId: options.workspaceId,
      actorUserId: options.actorUserId,
      startedAt: runStartedAt,
      finishedAt: new Date().toISOString(),
      fileName: options.fileName,
      // F-E2 (keputusan owner 2026-11-10): teruskan kompleksitas pilihan
      // user apa adanya; absen tetap absen (builder mencatat null).
      complexity: options.complexity,
    });

    if (output.coverage.itemsFullyResolved === 0 && output.coverage.totalItems > 0) {
      return {
        success: false,
        errorCode: 'NO_CALCULABLE_ITEMS',
        stage: 'simplify',
        message: 'Tidak ada pekerjaan yang bisa dihitung karena kuantitas/harga kosong atau tidak wajar.',
        retryable: true,
        details: ['Periksa DED atau lengkapi dimensi pada prompt.'].concat(
          output.items.slice(0, 3).map((i) => `${i.name}: ${i.provenance.join(' ')}`)
        ),
      };
    }

    return output;
  }
}

export const dedAiEstimateService = new DedAiEstimateService();

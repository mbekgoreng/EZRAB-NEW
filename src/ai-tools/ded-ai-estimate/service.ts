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

import { aiToolsProviderClient, AiToolsResult } from '../providerClient';
import { waitForMinimum, minDelayFor } from '../aiResponseTiming';
import { buildFastPrompt, DedFastOutput, DedFastPromptInput } from './prompts/fast';
import { buildDetailPrompt, DedDetailOutput, DedDetailPromptInput } from './prompts/detail';
import { parseDedPdf, DedParsedDocument } from './parser';
import { attemptQuantityFromDimensionString } from './quantity';
import { resolveDedPriceForPolicy } from './pricing';
import { matchDedItemToAhsp, resolveDedPriceWithCanonical } from '../ded-canonical/canonicalDedPricing';
import { DedAiCalculator } from './calculator';
import { deriveKolomVolume, deriveDindingNetto, derivePlester, DerivationTrail } from './derivation';
import { selectPagesWithTrace, formatPageRanges } from './analysisTrace';
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
];

// Diekspor agar gate validasi ini dapat diuji langsung (tanpa model live).
export function isProjectTypeSupported(v: string): v is DedAiProjectType {
  return PROJECT_TYPES.includes(v);
}

function convertAiItem(idx: number, raw: any, mode: DedAiMode, policy?: import('./types').DedEstimationPolicy): DedAiItem {
  const name = String(raw.name || `Pekerjaan ${idx + 1}`);
  const units = String(raw.units || raw.unit || 'm2');
  const dims = raw.dimensions || raw.quantityFormula || '';

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

  // Resolusi kanonis dulu (adapter ded-canonical): DATABASE mencoba AHSP
  // dulu; bila tidak ada di database, estimasi AI dipakai sebagai fallback
  // berlabel jelas (keputusan owner 2026-10-27 malam). FULL_AI memakai
  // harga kanonis bila terverifikasi, sisanya estimasi AI + match terlampir
  // untuk review.
  const aiPrice = resolveDedPriceForPolicy(policy, raw.estimatedUnitPrice ?? raw.unitPrice, raw.unitPriceNote);
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

  return {
    id: `dedai-${idx + 1}`,
    name,
    category: String(raw.category || 'Lain-lain'),
    specification: raw.specification,
    description: raw.specification || name,
    units,
    quantity,
    quantitySource,
    quantityFormula: fromDim.formula || raw.quantityFormula || undefined,
    // FASE DED-FIX: alasan unresolved spesifik untuk ditampilkan ke pengguna.
    // Bedakan "tidak tercantum di DED" vs "gagal membaca".
    quantityNote:
      quantitySource === 'UNRESOLVED'
        ? fromDim.ambiguousUnit
          ? 'Satuan dimensi tidak jelas; perlu verifikasi manual.'
          : dims && dims.trim()
            ? 'Dimensi ditemukan tetapi gagal diparse; periksa manual.'
            : 'Kuantitas tidak tercantum di DED; perlu input manual atau asumsi terdokumentasi.'
        : quantitySource === 'AI_INFERENCE'
          ? 'Kuantitas dari inferensi AI; perlu ditinjau sebelum finalisasi.'
          : quantitySource === 'ASSUMPTION'
            ? 'Kuantitas dari asumsi; perlu ditinjau sebelum finalisasi.'
            : undefined,
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
      `price:${price.source}`,
      ...(price.ahspCode ? [`ahsp:${price.ahspCode}`] : []),
      quantity !== null ? `qty=${quantity}` : 'qty=null',
      price.unitPrice !== null ? `price=${price.unitPrice}` : 'price=null',
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
    // Pecah kelompok besar menjadi pass-pass berurutan — INI BUKAN batas
    // buang: semua halaman tetap diproses, hanya dibagi panggilannya agar
    // satu panggilan model tidak timeout dan tidak terpotong token.
    // Ambang 60.000 karakter per pass (~15 ribu token teks) jauh di bawah
    // konteks model, jadi pemecahan ini murni pengaman latensi.
    const PASS_TEXT_CHUNK = 60000;
    const chunkedGroups: typeof groups = [];
    for (const g of groups) {
      let chunk: typeof g.pages = [];
      let chars = 0;
      for (const pg of g.pages) {
        if (chunk.length > 0 && chars + pg.text.length > PASS_TEXT_CHUNK) {
          chunkedGroups.push({ label: g.label, pages: chunk });
          chunk = [];
          chars = 0;
        }
        chunk.push(pg);
        chars += pg.text.length;
      }
      if (chunk.length > 0) chunkedGroups.push({ label: g.label, pages: chunk });
    }
    groups = chunkedGroups;
    // Tautkan halaman terpilih ke pass-nya di jejak.
    const traceByPage = new Map(pageTrace.map(t => [t.page, t]));
    groups.forEach((g, gi) => {
      for (const s of g.pages) {
        const entry = traceByPage.get(s.page);
        if (entry) { entry.passIndex = gi; entry.clusterLabel = g.label; }
      }
    });

    const maxTokens = mode === 'FAST' ? 16000 : 24000;
    const productId = mode === 'FAST' ? 'DED_AI_FAST' : 'DED_AI_DETAIL';
    const rawItems: any[] = [];
    const passTraces: DedPassTraceEntry[] = [];
    let lastAiError: any = null;

    for (let gi = 0; gi < groups.length; gi++) {
      // Kebijakan harga DIPAKAIKAN ke prompt (sebelumnya prompt tidak
      // menerima policy sehingga selalu meminta harga AI apa pun modenya).
      const built = mode === 'FAST'
        ? buildFastPrompt({ projectType, buildingType, pageSummaries: groups[gi].pages, pricingPolicy: options.policy ?? 'FULL_AI' })
        : buildDetailPrompt({ projectType, buildingType, pageSummaries: groups[gi].pages, pricingPolicy: options.policy ?? 'FULL_AI' });

      notify('ANALYZE', mode === 'FAST' ? 'Menganalisis DED' : 'Analisis mendalam',
        50 + Math.round((gi / groups.length) * 25),
        groups.length > 1
          ? `Mengirim kelompok halaman ${gi + 1}/${groups.length} ke model AI…`
          : 'Mengirim prompt ke model AI untuk analisis…',
        { pagesRead: parsed.pages.length, totalPages: parsed.pages.length });

      const aiResult: AiToolsResult = await aiToolsProviderClient.execute({
        productId,
        prompt: built.prompt,
        systemPrompt: built.system,
        jsonMode: true,
        maxTokens,
        timeoutMs: mode === 'FAST' ? 120000 : 180000,
      });

      const passTrace: DedPassTraceEntry = {
        passIndex: gi,
        clusterLabel: groups[gi].label,
        pageTypes: [...new Set(groups[gi].pages.map(s => s.pageType))],
        pages: groups[gi].pages.map(s => s.page),
        productId,
        mode,
        maxTokens,
        status: 'OK',
        itemCount: 0,
      };

      if (!aiResult.success) {
        lastAiError = aiResult;
        passTrace.status = 'FAILED';
        passTrace.errorCode = aiResult.errorCode;
        passTraces.push(passTrace);
        continue;
      }

      let parsedAi: DedFastOutput | DedDetailOutput | null = null;
      let parseFailed = false;
      try {
        parsedAi =
          (aiResult.structured as any) ??
          (mode === 'FAST'
            ? aiToolsProviderClient.extractJson<DedFastOutput>(aiResult.content)
            : aiToolsProviderClient.extractJson<DedDetailOutput>(aiResult.content));
      } catch { parsedAi = null; parseFailed = true; }
      // F4 (3.5): bedakan format keluaran rusak (MALFORMED) dari dokumen
      // yang memang tidak menghasilkan item (EMPTY) — lihat classifyPassOutcome.
      const outcome = classifyPassOutcome(parsedAi, parseFailed);
      if (outcome.status === 'OK') {
        rawItems.push(...outcome.items);
      }
      passTrace.itemCount = outcome.items.length;
      passTrace.status = outcome.status;
      if (outcome.errorCode) passTrace.errorCode = outcome.errorCode;
      passTraces.push(passTrace);
    }

    if (rawItems.length === 0) {
      return {
        success: false,
        ...decideNoItemsError(passTraces.map((t) => t.status), lastAiError),
      };
    }

    // Gabung + dedup antar-pass: kunci nama ternormalisasi + satuan;
    // bila duplikat, utamakan item yang kuantitasnya terisi.
    const merged = new Map<string, any>();
    for (const raw of rawItems) {
      const key = `${String(raw.name || '').toLowerCase().replace(/\s+/g, ' ').trim()}|${String(raw.units || raw.unit || '').toLowerCase()}`;
      const prev = merged.get(key);
      if (!prev || (prev.quantity == null && typeof raw.quantity === 'number')) merged.set(key, raw);
    }
    const policy = options.policy ?? 'FULL_AI';
    const items: DedAiItem[] = [...merged.values()].map((raw, idx) => convertAiItem(idx, raw, mode, policy));

    const output = DedAiCalculator.buildOutput({
      jobId,
      projectType,
      mode,
      policy,
      projectName: options.projectName || 'Proyek DED AI',
      fileName: options.fileName,
      pageCount: parsed.pages.length,
      items,
    });

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
    if (selection.skippedCount > 0) {
      traceWarnings.push(
        `${selection.skippedCount} halaman tidak dikirim ke model — lihat analysisTrace.pages berstatus SKIPPED_BUDGET.`
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
          `Pass "${pt.clusterLabel}" (hal. ${pt.pages.join(', ')}) mengembalikan format keluaran yang tidak sesuai${pt.errorCode ? ` (${pt.errorCode})` : ''} — item dari kelompok ini mungkin tidak lengkap.`
        );
      } else if (pt.status === 'EMPTY_RESPONSE') {
        traceWarnings.push(
          `Pass "${pt.clusterLabel}" (hal. ${pt.pages.join(', ')}) tidak menghasilkan item.`
        );
      }
    }
    output.analysisTrace = {
      totalPages: parsed.pages.length,
      selectedPageCount: pageSummaries.length,
      skippedPageCount: selection.skippedCount,
      // Tanpa budget terpisah lagi: yang tercatat adalah yang terkirim.
      totalCharsBudget: selection.totalCharsSent,
      totalCharsSent: selection.totalCharsSent,
      pages: pageTrace,
      passes: passTraces,
      warnings: traceWarnings,
    };

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

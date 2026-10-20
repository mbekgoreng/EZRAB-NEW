/**
 * DED AI ESTIMATE — Service (src/ai-tools/ded-ai-estimate/service.ts)
 * Standalone pipeline: parse PDF → pick project type → pick FAST/DETAIL → analyze →
 * compute deterministic quantities/prices → finalize → export-ready result.
 *
 * HARD ISOLATION: This file must NOT import AHSP matcher / price resolver / HSD
 * database / masterRegistry / official price database / project price engine, nor
 * any ded-rab-v2/v3 module. It only uses modules inside
 * src/ai-tools/ded-ai-estimate/{parser,prompts,pricing,quantity,calculator,types}
 * plus aiToolsProviderClient/aiModelRegistry.
 */

import { aiToolsProviderClient, AiToolsResult } from '../providerClient';
import { buildFastPrompt, DedFastOutput, DedFastPromptInput } from './prompts/fast';
import { buildDetailPrompt, DedDetailOutput, DedDetailPromptInput } from './prompts/detail';
import { parseDedPdf, DedParsedDocument } from './parser';
import { attemptQuantityFromDimensionString } from './quantity';
import { applyAiEstimatePrice } from './pricing';
import { DedAiCalculator } from './calculator';
import { deriveKolomVolume, deriveDindingNetto, derivePlester, DerivationTrail } from './derivation';
import {
  DedAiServiceOptions,
  DedAiOutput,
  DedAiItem,
  DedAiProjectType,
  DedAiMode,
  DedAiQuantitySource,
  DedAiProgressEvent,
} from './types';

const PROJECT_TYPES: ReadonlyArray<string> = [
  'BANGUNAN',
  'GEDUNG',
  'BANGUNAN AIR',
  'JALAN',
  'PAVING',
];

function isProjectTypeSupported(v: string): v is DedAiProjectType {
  return PROJECT_TYPES.includes(v);
}

function convertAiItem(idx: number, raw: any, mode: DedAiMode): DedAiItem {
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

  const price = applyAiEstimatePrice(raw.estimatedUnitPrice ?? raw.unitPrice, raw.unitPriceNote);

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
    priceSource: price.priceSource,
    priceAssumptionNote: price.note,
    subtotal: null,
    sourcePages: Array.isArray(raw.sourcePages) ? raw.sourcePages.map(Number).filter(Number.isFinite) : [],
    sourceEvidence: raw.sourceEvidence || undefined,
    provenance: [
      `quantity:${quantitySource}`,
      `price:${price.priceSource}`,
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

export class DedAiEstimateService {
  public async execute(options: DedAiServiceOptions): Promise<DedAiOutputEnvelope> {
    try {
      return await this.run(options);
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

    notify('PARSE', 'Membaca DED', 10, 'Mengekstrak teks & gambar dari PDF DED…');
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

    // === Seleksi halaman berbasis jenis halaman (patch kelengkapan 2026-10-21) ===
    // Cara lama memotong teks global 15.000 karakter dari halaman pertama,
    // sehingga hanya ±8 dari 32 halaman yang pernah sampai ke model.
    // Sekarang: halaman dipilih menurut prioritas jenisnya (denah & struktur
    // lebih dulu; MEP/kusen/atap tidak lagi terbuang), budget jauh lebih
    // besar, lalu dianalisis per kelompok (multi-pass) dan digabung.
    const PAGE_TYPE_PRIORITY: Record<string, number> = {
      DENAH: 0, STRUKTUR: 1, POTONGAN: 2, JADWAL_KUSEN: 3, MEP: 4,
      ATAP: 5, TAMPAK: 6, SPESIFIKASI: 7, SITUASI: 8, HALAMAN: 9,
    };
    const TOTAL_TEXT_BUDGET = mode === 'FAST' ? 45000 : 90000;
    const PER_PAGE_TEXT = mode === 'FAST' ? 3000 : 4500;
    const byPriority = [...parsed.pages].sort((a, b) =>
      (PAGE_TYPE_PRIORITY[a.pageType] ?? 9) - (PAGE_TYPE_PRIORITY[b.pageType] ?? 9) || a.page - b.page);
    const pageSummaries: Array<{ page: number; title: string; text: string; pageType: string }> = [];
    let usedChars = 0;
    for (const p of byPriority) {
      const text = (p.text || '').slice(0, PER_PAGE_TEXT);
      if (usedChars + text.length > TOTAL_TEXT_BUDGET && pageSummaries.length >= 4) break;
      usedChars += text.length;
      pageSummaries.push({ page: p.page, title: p.title, text, pageType: p.pageType });
    }
    const buildingType = options.projectType;

    // === Analisis multi-pass per kelompok jenis halaman ===
    // Satu panggilan dengan plafon token kecil memotong daftar pekerjaan;
    // per kelompok, setiap panggilan punya budget sendiri (FAST 8.000 /
    // DETAIL 12.000 token) dan hasilnya digabung dengan dedup.
    const CLUSTERS: string[][] = [
      ['DENAH', 'SITUASI'],
      ['STRUKTUR', 'POTONGAN'],
      ['ATAP', 'TAMPAK'],
      ['JADWAL_KUSEN', 'MEP'],
      ['SPESIFIKASI', 'HALAMAN'],
    ];
    let groups: Array<typeof pageSummaries> = CLUSTERS
      .map(types => pageSummaries.filter(s => types.includes(s.pageType)))
      .filter(g => g.length > 0);
    // Dokumen kecil cukup satu pass (hindari latensi/biaya berlipat).
    if (pageSummaries.length <= 10 || groups.length <= 1) groups = [pageSummaries];

    const maxTokens = mode === 'FAST' ? 8000 : 12000;
    const rawItems: any[] = [];
    let lastAiError: any = null;

    for (let gi = 0; gi < groups.length; gi++) {
      const built = mode === 'FAST'
        ? buildFastPrompt({ projectType, buildingType, pageSummaries: groups[gi] })
        : buildDetailPrompt({ projectType, buildingType, pageSummaries: groups[gi] });

      notify('ANALYZE', mode === 'FAST' ? 'Menganalisis DED' : 'Analisis mendalam',
        50 + Math.round((gi / groups.length) * 25),
        groups.length > 1
          ? `Mengirim kelompok halaman ${gi + 1}/${groups.length} ke model AI…`
          : 'Mengirim prompt ke model AI untuk analisis…',
        { pagesRead: parsed.pages.length, totalPages: parsed.pages.length });

      const aiResult: AiToolsResult = await aiToolsProviderClient.execute({
        productId: mode === 'FAST' ? 'DED_AI_FAST' : 'DED_AI_DETAIL',
        prompt: built.prompt,
        systemPrompt: built.system,
        jsonMode: true,
        maxTokens,
        timeoutMs: mode === 'FAST' ? 120000 : 180000,
      });

      if (!aiResult.success) { lastAiError = aiResult; continue; }

      let parsedAi: DedFastOutput | DedDetailOutput | null = null;
      try {
        parsedAi =
          (aiResult.structured as any) ??
          (mode === 'FAST'
            ? aiToolsProviderClient.extractJson<DedFastOutput>(aiResult.content)
            : aiToolsProviderClient.extractJson<DedDetailOutput>(aiResult.content));
      } catch { parsedAi = null; }
      if (parsedAi && Array.isArray(parsedAi.workItems)) rawItems.push(...parsedAi.workItems);
    }

    if (rawItems.length === 0) {
      if (lastAiError) {
        return {
          success: false,
          errorCode: lastAiError.errorCode,
          stage: lastAiError.stage,
          message: lastAiError.message,
          retryable: lastAiError.retryable,
        };
      }
      return {
        success: false,
        errorCode: 'NO_DATA',
        stage: 'parse-ai',
        message: 'Model tidak menemukan pekerjaan apa pun di DED.',
        retryable: true,
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
    const items: DedAiItem[] = [...merged.values()].map((raw, idx) => convertAiItem(idx, raw, mode));

    const output = DedAiCalculator.buildOutput({
      jobId,
      projectType,
      mode,
      projectName: options.projectName || 'Proyek DED AI',
      fileName: options.fileName,
      pageCount: parsed.pages.length,
      items,
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

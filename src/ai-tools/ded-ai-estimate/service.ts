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
  let quantity: number | null = fromDim.quantity;
  if (quantity === null && rawAIQuantity !== null && rawAIQuantity > 0) {
    quantity = rawAIQuantity;
  }
  if (quantity !== null && quantity <= 0) quantity = null;

  const quantitySource: DedAiQuantitySource =
    raw.quantitySource === 'DED_EXPLICIT'
      ? 'DED_EXPLICIT'
      : raw.quantitySource === 'ASSUMPTION'
        ? 'ASSUMPTION'
        : quantity === null
          ? 'UNRESOLVED'
          : fromDim.quantity !== null
            ? 'DED_GEOMETRIC'
            : 'AI_INFERENCE';

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

    const pageSummaries = parsed.pages.map((p) => ({ page: p.page, title: p.title, text: p.text }));
    const buildingType = options.projectType;

    let systemPrompt: string;
    let prompt: string;
    if (mode === 'FAST') {
      const built = buildFastPrompt({ projectType, buildingType, pageSummaries });
      systemPrompt = built.system;
      prompt = built.prompt;
    } else {
      const built = buildDetailPrompt({ projectType, buildingType, pageSummaries });
      systemPrompt = built.system;
      prompt = built.prompt;
    }

    notify('ANALYZE', mode === 'FAST' ? 'Menganalisis DED' : 'Analisis mendalam', 50, 'Mengirim prompt ke model AI untuk analisis…', {
      pagesRead: parsed.pages.length,
      totalPages: parsed.pages.length,
    });

    const aiResult: AiToolsResult = await aiToolsProviderClient.execute({
      productId: mode === 'FAST' ? 'DED_AI_FAST' : 'DED_AI_DETAIL',
      prompt,
      systemPrompt,
      jsonMode: true,
      maxTokens: mode === 'FAST' ? 4000 : 9000,
      timeoutMs: mode === 'FAST' ? 120000 : 180000,
    });

    if (!aiResult.success) {
      return {
        success: false,
        errorCode: aiResult.errorCode,
        stage: aiResult.stage,
        message: aiResult.message,
        retryable: aiResult.retryable,
      };
    }

    // Parse the JSON contract with robustness.
    let parsedAi: DedFastOutput | DedDetailOutput | null = null;
    try {
      parsedAi =
        (aiResult.structured as any) ??
        (mode === 'FAST'
          ? aiToolsProviderClient.extractJson<DedFastOutput>(aiResult.content)
          : aiToolsProviderClient.extractJson<DedDetailOutput>(aiResult.content));
    } catch {
      return {
        success: false,
        errorCode: 'MALFORMED_JSON',
        stage: 'parse-ai',
        message: 'Model mengembalikan JSON yang tidak dapat dibaca.',
        retryable: true,
      };
    }

    if (!parsedAi || !Array.isArray(parsedAi.workItems) || parsedAi.workItems.length === 0) {
      return {
        success: false,
        errorCode: 'NO_DATA',
        stage: 'parse-ai',
        message: 'Model tidak menemukan pekerjaan apa pun di DED.',
        retryable: true,
      };
    }

    const items: DedAiItem[] = parsedAi.workItems.map((raw, idx) => convertAiItem(idx, raw, mode));

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

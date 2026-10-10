/**
 * FULL AI DED ESTIMATE — Service
 *
 * Terisolasi dari pipeline lama. Menggunakan AI Gateway yang sama
 * (aiToolsProviderClient) dengan productId yang sama, tapi dengan
 * prompt dan validasi yang berbeda.
 *
 * Alur: Upload → Parse → Prompt → AI → Validate → Verify → Output
 */
import { aiToolsProviderClient } from '../providerClient';
import { parseDedPdf } from '../ded-ai-estimate/parser';
import { buildFullAiPrompt } from './prompts';
import { validateFullAiItem, verifySubtotal } from './validator';
import {
  FullAiOutput, FullAiItem, FullAiServiceOptions, FullAiSummary,
} from './types';

// Batas karakter dengan strategi chunking yang transparan
const MAX_TOTAL_CHARS = 60000;  // Lebih besar dari pipeline lama (15000)
const MAX_PAGE_CHARS = 4000;

function buildDocumentText(
  pages: Array<{ page: number; text: string }>,
  onTruncate?: (truncated: boolean, totalChars: number) => void
): { text: string; truncated: boolean; totalChars: number } {
  let text = '';
  let totalChars = 0;
  let truncated = false;

  const parts: string[] = [];
  for (const p of pages) {
    const pageText = (p.text || '').slice(0, MAX_PAGE_CHARS);
    if (totalChars + pageText.length > MAX_TOTAL_CHARS) {
      truncated = true;
      break;
    }
    parts.push(`--- Halaman ${p.page} ---\n${pageText}`);
    totalChars += pageText.length;
  }

  if (onTruncate) onTruncate(truncated, totalChars);
  return { text: parts.join('\n\n'), truncated, totalChars };
}

export class FullAiDedService {
  async execute(options: FullAiServiceOptions): Promise<FullAiOutput> {
    const { mode, projectType } = options;
    const notify = options.onProgress || (() => {});

    try {
      // Tahap 1: Parse dokumen
      notify('PARSE', 10, 'Membaca dokumen DED...');
      const parsed = await parseDedPdf(options.buffer, options.fileName, { withImages: false });

      if ('errorCode' in parsed) {
        return this.errorOutput(mode, {
          code: parsed.errorCode,
          message: parsed.message,
          retryable: parsed.retryable,
        });
      }

      const pages = parsed.pages || [];
      notify('PARSE', 25, `Dokumen dibaca: ${pages.length} halaman`);

      // Tahap 2: Siapkan teks dengan chunking transparan
      let wasTruncated = false;
      const { text: docText, truncated, totalChars } = buildDocumentText(
        pages.map((p: any) => ({ page: p.page, text: p.text || '' })),
        (t) => { wasTruncated = t; }
      );

      const warnings: string[] = [];
      if (truncated) {
        warnings.push(
          `Dokumen dipotong pada ${MAX_TOTAL_CHARS} karakter. ` +
          `Analisis mungkin tidak mencakup seluruh DED.`
        );
      }
      if (totalChars === 0) {
        warnings.push('Tidak ada teks yang dapat diekstrak dari dokumen. Hasil mungkin tidak akurat.');
      }

      // Tahap 3: Panggil AI
      notify('ANALYZE', 40, `Menganalisis DED dengan AI (${mode})...`);
      const { system, prompt } = buildFullAiPrompt({
        projectType,
        documentText: docText,
        pageCount: pages.length,
        mode,
      });

      const productId = mode === 'FAST' ? 'DED_AI_FAST' : 'DED_AI_DETAIL';
      const aiResult = await aiToolsProviderClient.execute({
        productId,
        prompt,
        systemPrompt: system,
        jsonMode: true,
        maxTokens: mode === 'FAST' ? 16000 : 32000,
        timeoutMs: mode === 'FAST' ? 120000 : 240000,
      });

      if (!aiResult.success) {
        return this.errorOutput(mode, {
          code: aiResult.errorCode || 'AI_ERROR',
          message: aiResult.message || 'AI gagal memproses',
          retryable: true,
        });
      }

      // Tahap 4: Parse & validasi
      notify('VALIDATE', 70, 'Memvalidasi hasil AI...');
      let parsedAi: any;
      try {
        parsedAi = aiToolsProviderClient.extractJson(aiResult.content);
      } catch {
        return this.errorOutput(mode, {
          code: 'INVALID_JSON',
          message: 'Respons AI bukan JSON valid',
          retryable: true,
        });
      }

      const rawItems = Array.isArray(parsedAi.items) ? parsedAi.items : [];
      const items: FullAiItem[] = [];
      const allErrors: string[] = [];

      for (let i = 0; i < rawItems.length; i++) {
        const raw = rawItems[i];

        // NORMALISASI: dukung format sederhana (flat) dan format lama (nested)
        // Format flat: { qty: 9.6, unit: "m3", price: 85000, priceUnit: "m3", ... }
        // Format nested: { quantity: { value, unit, ... }, price: { unitPrice, unit, ... } }
        const isFlatPrice = typeof raw.price === 'number';
        const isNestedPrice = raw.price && typeof raw.price === 'object' && !Array.isArray(raw.price);
        const isNestedQty = raw.quantity && typeof raw.quantity === 'object' && !Array.isArray(raw.quantity);
        const normalized = {
          ...raw,
          quantity: isNestedQty ? raw.quantity : {
            value: typeof raw.qty === 'number' ? raw.qty : null,
            unit: raw.unit || '',
            formula: raw.formula || undefined,
            provenance: raw.provenance || 'UNRESOLVED',
            confidence: 'MEDIUM',
            assumptions: raw.assumptions ? [String(raw.assumptions)] : undefined,
          },
          price: isNestedPrice ? raw.price : {
            unitPrice: isFlatPrice ? raw.price : null,
            unit: raw.priceUnit || raw.unit || '',
            source: raw.priceSource || 'AI_ESTIMATE',
            region: 'Jakarta',
            period: '2026',
          },
        };

        const validation = validateFullAiItem(normalized, i);

        if (!validation.valid) {
          allErrors.push(...validation.errors);
          warnings.push(...validation.warnings);
          // Item tidak valid tetap ditampilkan dengan status UNRESOLVED
          // Jangan buang diam-diam
        }

        const q = normalized.quantity || {};
        const p = normalized.price || {};
        const { subtotal } = verifySubtotal(
          typeof q.value === 'number' ? q.value : null,
          typeof p.unitPrice === 'number' ? p.unitPrice : null
        );

        // Tentukan status dan alasan eksklusi (diagnostik spesifik)
        let status: FullAiItem['status'] = 'READY';
        let exclusionReason: FullAiItem['exclusionReason'] = null;

        if (q.value == null) {
          status = 'UNRESOLVED';
          exclusionReason = 'MISSING_QUANTITY';
        } else if (typeof q.value !== 'number' || !Number.isFinite(q.value) || q.value < 0) {
          status = 'UNRESOLVED';
          exclusionReason = 'INVALID_QUANTITY';
        } else if (!q.unit) {
          status = 'UNRESOLVED';
          exclusionReason = 'MISSING_UNIT';
        } else if (q.provenance === 'UNRESOLVED') {
          status = 'UNRESOLVED';
          exclusionReason = 'UNRESOLVED_PROVENANCE';
        } else if (q.provenance === 'NEEDS_CONFIRMATION') {
          status = 'NEEDS_CONFIRMATION';
          exclusionReason = 'NEEDS_CONFIRMATION';
        } else if (p.unitPrice == null) {
          status = 'NEEDS_CONFIRMATION';
          exclusionReason = 'MISSING_UNIT_PRICE';
        } else if (typeof p.unitPrice !== 'number' || !Number.isFinite(p.unitPrice)) {
          status = 'NEEDS_CONFIRMATION';
          exclusionReason = 'INVALID_UNIT_PRICE';
        } else if (p.unitPrice < 0) {
          status = 'NEEDS_CONFIRMATION';
          exclusionReason = 'INVALID_UNIT_PRICE';
        } else if (p.source === 'UNRESOLVED') {
          status = 'NEEDS_CONFIRMATION';
          exclusionReason = 'PRICE_UNRESOLVED';
        } else if (p.unit && q.unit) {
          // Cek kesesuaian satuan
          const norm = (u: string) => u.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (norm(p.unit) !== norm(q.unit)) {
            status = 'NEEDS_CONFIRMATION';
            exclusionReason = 'INVALID_PRICE_UNIT';
          }
        }
        // ASSUMPTION/DERIVED/EXPLICIT dengan qty+harga valid → READY (masuk total)
        // Label asumsi tetap terlihat jelas di UI — bukan status terverifikasi

        // Item UNRESOLVED tidak masuk total tapi tetap ditampilkan
        const includeInTotal = status === 'READY' && subtotal != null && subtotal > 0;

        items.push({
          id: `fullai-${i + 1}`,
          no: raw.no || i + 1,
          wbsCode: raw.wbsCode || undefined,
          wbsGroup: raw.wbsGroup || undefined,
          name: String(raw.name || `Pekerjaan ${i + 1}`),
          description: raw.description || undefined,
          category: String(raw.category || 'Lain-lain'),
          quantity: {
            value: typeof q.value === 'number' ? q.value : null,
            unit: String(q.unit || ''),
            formula: q.formula || undefined,
            steps: Array.isArray(q.steps) ? q.steps : undefined,
            dimensions: q.dimensions || undefined,
            sourcePages: Array.isArray(q.sourcePages) ? q.sourcePages : undefined,
            provenance: q.provenance || 'UNRESOLVED',
            confidence: q.confidence || 'LOW',
            assumptions: Array.isArray(q.assumptions) ? q.assumptions : undefined,
            notes: q.notes || undefined,
          },
          price: {
            unitPrice: typeof p.unitPrice === 'number' ? p.unitPrice : null,
            unit: String(p.unit || q.unit || ''),
            source: p.source || 'UNRESOLVED',
            region: p.region || undefined,
            period: p.period || undefined,
            ahspCode: p.ahspCode || undefined,
            notes: p.notes || undefined,
          },
          subtotal: includeInTotal ? subtotal : null,
          subtotalVerified: true,
          status: includeInTotal ? 'READY' : status,
          exclusionReason: includeInTotal ? null : exclusionReason,
          sourcePages: Array.isArray(raw.sourcePages) ? raw.sourcePages : undefined,
        });

        if (!includeInTotal && exclusionReason) {
          warnings.push(`Item "${raw.name}" tidak masuk total [${exclusionReason}]`);
        }
      }

      // Tahap 5: Hitung total & ringkasan
      notify('FINALIZE', 90, 'Menyusun hasil akhir...');
      const grandTotal = items
        .filter((it) => it.subtotal != null && it.subtotal > 0)
        .reduce((sum, it) => sum + (it.subtotal || 0), 0);

      const summary: FullAiSummary = {
        totalItems: items.length,
        itemsWithQuantity: items.filter((it) => it.quantity.value != null).length,
        itemsWithAssumption: items.filter((it) =>
          it.quantity.provenance === 'ASSUMPTION').length,
        itemsNeedConfirmation: items.filter((it) =>
          it.status === 'NEEDS_CONFIRMATION').length,
        itemsWithAiPrice: items.filter((it) =>
          it.price.source === 'AI_ESTIMATE').length,
        itemsWithVerifiedPrice: items.filter((it) =>
          it.price.source === 'VERIFIED_SOURCE').length,
        itemsUnresolved: items.filter((it) =>
          it.status === 'UNRESOLVED').length,
        excludedFromTotal: items.filter((it) =>
          it.subtotal == null).length,
      };

      let grandTotalNote: string | undefined;
      if (summary.excludedFromTotal > 0) {
        grandTotalNote =
          `Total Rp${grandTotal.toLocaleString('id-ID')} mengecualikan ` +
          `${summary.excludedFromTotal} item yang belum lengkap.`;
      }

      notify('DONE', 100, 'Analisis selesai');

      return {
        success: true,
        mode,
        projectInfo: {
          projectType,
          buildingFunction: parsedAi.projectInfo?.buildingFunction || undefined,
          floorCount: parsedAi.projectInfo?.floorCount || undefined,
          mainDimensions: parsedAi.projectInfo?.mainDimensions || undefined,
          structuralSystem: parsedAi.projectInfo?.structuralSystem || undefined,
          scopeSummary: parsedAi.projectInfo?.scopeSummary || '',
          missingInfo: parsedAi.projectInfo?.missingInfo || undefined,
          ambiguities: parsedAi.projectInfo?.ambiguities || undefined,
        },
        items,
        grandTotal,
        grandTotalNote,
        summary,
        warnings: [...warnings, ...(parsedAi.warnings || [])],
        provenance: {
          model: mode === 'FAST' ? 'gemini-3.5-flash-lite' : 'geminiflash-3.8',
          timestamp: new Date().toISOString(),
          documentPages: pages.length,
          documentChars: totalChars,
        },
      };
    } catch (err: any) {
      return this.errorOutput(mode, {
        code: 'SERVICE_ERROR',
        message: err?.message || 'Terjadi kesalahan',
        retryable: true,
      });
    }
  }

  private errorOutput(
    mode: 'FAST' | 'ADVANCED',
    error: { code: string; message: string; retryable: boolean }
  ): FullAiOutput {
    return {
      success: false,
      mode,
      projectInfo: {
        projectType: '',
        scopeSummary: '',
      },
      items: [],
      grandTotal: null,
      summary: {
        totalItems: 0,
        itemsWithQuantity: 0,
        itemsWithAssumption: 0,
        itemsNeedConfirmation: 0,
        itemsWithAiPrice: 0,
        itemsWithVerifiedPrice: 0,
        itemsUnresolved: 0,
        excludedFromTotal: 0,
      },
      warnings: [],
      error,
      provenance: {
        model: '',
        timestamp: new Date().toISOString(),
        documentPages: 0,
        documentChars: 0,
      },
    };
  }
}

export const fullAiDedService = new FullAiDedService();

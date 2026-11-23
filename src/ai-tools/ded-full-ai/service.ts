/**
 * FULL AI DED ESTIMATE — Service
 *
 * Terisolasi dari pipeline lama. Menggunakan AI Gateway yang sama
 * (aiToolsProviderClient) dengan productId yang sama, tapi dengan
 * prompt dan validasi yang berbeda.
 *
 * Alur: Upload → Parse → Prompt → AI → Validate → Verify → Output
 *
 * W4 (§6 directive DED-RAB AI Dual Mode, 2026-11-13): `runExecute`
 * distrukturkan menjadi 7 tahap eksplisit DI ATAS infrastruktur yang
 * ada (tanpa engine kedua) — jejaknya dilampirkan ke keluaran
 * (`pipelineStages`) dan Tahap 7 menjalankan audit QC single-pass
 * (`qualityControl.ts`). Tahap 2–4 adalah penalaran model di dalam
 * satu panggilan AI PER KELOMPOK halaman (dokumen kecil: satu
 * panggilan; dokumen besar: satu panggilan per kelompok — paginasi
 * tanpa batas pemrosesan 2026-11-19, menggantikan satu panggilan
 * dengan teks terpotong 60.000 karakter); QC tanpa loop revisi
 * (revisionIterations selalu 0).
 */
import { aiToolsProviderClient } from '../providerClient';
import { waitForMinimum, minDelayFor } from '../aiResponseTiming';
import { aiGatewayAuthHeaders } from '../aiGatewayAuth';
// I8 — lapisan vision (ded-vision). Modul ini TIDAK mengimpor matcher
// AHSP / price resolver / database harga / ded-rab-v2/v3 runtime apa pun
// (hanya type-only + SafeDecimalEngine generik lewat geometryQto).
// Render halaman memakai preview parser (parser.ts), BUKAN
// pdfPageService (ded-rab-v2).
import { createGatewayVisionResponder } from '../ded-vision/visionClient';
import type { VisionParseResult } from '../ded-vision/visionClient';
import { VisionCache } from '../ded-vision/visionCache';
import { resolveVisionEnabled } from '../ded-vision/visionEnablement';
import {
  base64LengthOfDataUrl,
  browserSessionVisionCacheStorage,
  coerceToUint8Array,
  computeDocHash,
  createParserPreviewRenderPage,
  matchVisionEvidenceToItem,
  pngDimensionsFromDataUrl,
  runVisionForDedService,
} from '../ded-vision/visionPipeline';
import type {
  ParserPreviewImage,
  VisionDocumentResult,
  VisionPageInput,
} from '../ded-vision/visionPipeline';
import { createVisionAhspMatcher } from '../ded-vision/visionAhsp';
import { parseDedPdf } from '../ded-ai-estimate/parser';
import { PAGE_TYPE_PRIORITY, formatPageRanges, type SelectedPage } from '../ded-ai-estimate/analysisTrace';
import { planDedPasses, DED_PASS_REQUEST_BUDGET_CHARS } from '../ded-ai-estimate/service';
import { expandPagesIntoSegments, segmentBudgetFromEmptyRequest, renderDedPageBlocks, type DedPageSegment } from '../ded-ai-estimate/pageSegments';
import { buildFullAiPrompt, buildFullAiQuantityAssumptionPrompt } from './prompts';
import { validateFullAiItem, verifySubtotal, describeProposedDiscrepancy } from './validator';
import {
  FullAiOutput, FullAiItem, FullAiServiceOptions, FullAiSummary, DedEstimationPolicy, FullAiPriceSource,
  type FullAiStageTraceEntry,
} from './types';
import {
  matchDedItemToAhsp, resolveDedPriceWithCanonical,
  type CanonicalDedMatch, type DedItemForMatch,
  type DedPriceFallback, type DedPriceDecision,
} from '../ded-canonical/canonicalDedPricing';
import {
  resolveDedRabAiMode, modeFromPolicy,
  canUseCanonicalCatalog, canUseExternalPriceReferences,
} from './dataSourcePolicy';
import type { DedRabAiMode } from '../ded-ai-estimate/dedMode';
import {
  findExternalReference, findConflictingReference,
  type ExternalPriceReference,
} from '../ded-ai-estimate/externalPriceReferences';
import {
  classifyQuantity, estimateMissingQuantity, derivePlanContext,
  priceSourceKindFor, buildQuantityAudit,
  type QuantityFillTrace,
} from '../ded-ai-estimate/priceCompletion';
import { referenceIsStale } from '../ded-ai-estimate/priceResearchCache';
import { buildDedUsageFromFullAi } from '../ded-ai-estimate/usageMetadata';
import {
  computeFullAiGrandTotal, runFullAiQualityControl,
} from './qualityControl';
import type { DedAiItem, DedPriceCompletion } from '../ded-ai-estimate/types';

// Tanpa batas pemrosesan (2026-11-19): MAX_TOTAL_CHARS (60.000) dan
// MAX_PAGE_CHARS (4.000) DIHAPUS — dokumen direncanakan menjadi
// kelompok halaman (planFullAiDocument), satu panggilan AI per
// kelompok, masing-masing terukur ≤ anggaran request gateway
// (DED_PASS_REQUEST_BUDGET_CHARS dari mesin standar). Tidak ada teks
// yang dipotong atau dilewat karena budget.

/**
 * F4 (3.3): batas waktu per panggilan AI yang BENAR-BENAR diterapkan.
 * providerClient membatasi semua permintaan pada plafon 300 detik
 * (MAX_TIMEOUT_MS di gateway client — 2026-11-20: 180->300 dtk atas
 * keputusan owner "coba 5 menit aja"). DULU meminta 240 detik untuk mode
 * Mendalam dipotong diam-diam ke plafon 180 dtk sehingga timeout selalu
 * tampak seperti "model lambat". Sekarang kedua mode meminta tepat
 * plafon 300 detik (5 menit — maksimal yang diizinkan fungsi Vercel)
 * dan batasnya dinyatakan terbuka di metadata hasil
 * (provenance.timeoutLimitMs) serta peringatan mode Mendalam.
 */
export const FULL_AI_TIMEOUT_MS = {
  FAST: 300000,
  ADVANCED: 300000,
} as const;

/**
 * F4 (3.7): normalisasi peringatan dari model. Model kadang mengembalikan
 * `warnings` sebagai SATU string — menyebarnya dengan spread akan memecah
 * string menjadi peringatan per karakter. String utuh menjadi satu
 * peringatan; array dipertahankan per elemen (objek dengan field `message`
 * memakai pesannya); nilai lain yang tidak dikenal dibuang, bukan dikarang.
 */
export function normalizeAiWarnings(raw: unknown): string[] {
  if (raw == null) return [];
  if (typeof raw === 'string') return raw.trim() ? [raw] : [];
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      if (entry.trim()) out.push(entry);
    } else if (typeof entry === 'number' || typeof entry === 'boolean') {
      out.push(String(entry));
    } else if (entry && typeof entry === 'object' && typeof (entry as any).message === 'string') {
      out.push((entry as any).message);
    }
  }
  return out;
}

/**
 * F4 (3.1): identitas provider/model yang BENAR-BENAR melayani respons,
 * dibaca dari hasil gateway. Bila respons tidak membawa identitas, hasilnya
 * null ("tidak diketahui") — TIDAK PERNAH diganti tebakan/registry/hardcode,
 * karena rantai gateway dapat failover ke provider lain dari yang diminta.
 */
export function resolveActualProviderModel(result: unknown): {
  provider: string | null;
  model: string | null;
} {
  const r = (result || {}) as { provider?: unknown; model?: unknown };
  const clean = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? v.trim() : null;
  return { provider: clean(r.provider), model: clean(r.model) };
}

/** Satu kelompok halaman = satu panggilan AI. */
export interface FullAiPageGroup {
  /** Segmen halaman dalam kelompok ini (urutan halaman asli). */
  pages: DedPageSegment[];
  /** Ukuran request terukur (system + prompt) untuk kelompok ini. */
  requestChars: number;
}

/** Segmen yang bahkan sendirian melebihi anggaran (backstop; lazimnya kosong). */
export interface FullAiSkippedSegment {
  page: number;
  partIndex?: number;
  partCount?: number;
  reason: string;
}

export interface FullAiDocumentPlan {
  groups: FullAiPageGroup[];
  /** Semua halaman berteks terkirim (tidak ada yang dilewat). */
  includedPages: number[];
  /** Halaman tanpa lapisan teks (scan/gambar) — tidak dapat dianalisis tanpa OCR. */
  emptyTextPages: number[];
  /** Total karakter yang dikirim (jumlah semua segmen). */
  totalChars: number;
  /** Segmen yang bahkan sendirian melebihi anggaran (backstop; lazimnya kosong). */
  skippedSegments: FullAiSkippedSegment[];
}

/**
 * Tanpa batas pemrosesan (2026-11-19) — MENGGANTIKAN buildDocumentText
 * (budget 60.000 karakter + potong 4.000/halaman, DIHAPUS).
 *
 * Seluruh halaman berteks direncanakan ke dalam KELOMPOK halaman
 * (satu panggilan AI per kelompok), masing-masing terukur ≤ anggaran
 * request gateway lewat `measure` (pembangun prompt asli). Halaman
 * panjang dipecah menjadi segmen sebelum perencanaan (pageSegments)
 * — tidak ada teks yang dipotong. Pengurutan prioritas jenis F4 (3.4)
 * (denah/struktur/kusen/… didahulukan) dipertahankan agar
 * halaman-halaman yang berkaitan mengelompok bersama; di dalam
 * kelompok, teks disusun menurut urutan halaman asli dokumen.
 * Fungsi murni, dapat diuji (suite F4 3.4 + noTruncationPagination).
 */
export function planFullAiDocument(
  pages: Array<{ page: number; title?: string; text: string; pageType?: string }>,
  measure: (pages: SelectedPage[]) => number,
  budget: number = DED_PASS_REQUEST_BUDGET_CHARS,
): FullAiDocumentPlan {
  const emptyTextPages: number[] = [];
  const withText: SelectedPage[] = [];
  for (const p of pages) {
    if ((p.text || '').trim()) {
      withText.push({
        page: p.page,
        title: p.title || `Halaman ${p.page}`,
        text: p.text || '',
        pageType: p.pageType || 'HALAMAN',
      });
    } else {
      emptyTextPages.push(p.page);
    }
  }

  const byPriority = [...withText].sort(
    (a, b) =>
      (PAGE_TYPE_PRIORITY[a.pageType || 'HALAMAN'] ?? 10) -
        (PAGE_TYPE_PRIORITY[b.pageType || 'HALAMAN'] ?? 10) ||
      a.page - b.page
  );

  const segmentBudget = segmentBudgetFromEmptyRequest(measure([]), budget);
  const segments = expandPagesIntoSegments(byPriority, segmentBudget);
  const plan = planDedPasses([{ label: 'Semua Halaman', pages: segments }], measure, budget);

  const groups: FullAiPageGroup[] = [];
  const skippedSegments: FullAiSkippedSegment[] = [];
  let totalChars = 0;
  for (const entry of plan) {
    if (entry.kind === 'SKIPPED_BUDGET') {
      for (const s of entry.pages) {
        const seg = s as DedPageSegment;
        skippedSegments.push({
          page: s.page,
          partIndex: seg.partIndex,
          partCount: seg.partCount,
          reason: entry.reason,
        });
      }
      continue;
    }
    // Susun kelompok menurut urutan halaman asli (bagian berurutan).
    // Urutan tidak mengubah ukuran terukur (blok yang sama, pemisah sama).
    const ordered = [...entry.pages].sort(
      (a, b) =>
        a.page - b.page ||
        ((a as DedPageSegment).partIndex ?? 0) - ((b as DedPageSegment).partIndex ?? 0),
    );
    groups.push({ pages: ordered as DedPageSegment[], requestChars: entry.requestChars });
    totalChars += entry.pages.reduce((acc, s) => acc + s.text.length, 0);
  }

  const includedPages = [...new Set(groups.flatMap((g) => g.pages.map((s) => s.page)))].sort(
    (a, b) => a - b,
  );
  return {
    groups,
    includedPages,
    emptyTextPages: emptyTextPages.sort((a, b) => a - b),
    totalChars,
    skippedSegments,
  };
}

/**
 * Dedup RAW antar-kelompok yang KONSERVATIF: hanya item yang identik
 * penuh (nama + satuan + nilai kuantitas + harga satuan sama) yang
 * digabung — karya yang sama terderivasi dari dua kelompok dengan
 * angka identik. Nama+satuan sama tetapi angka BERBEDA dipertahankan
 * keduanya (bisa jadi bagian berbeda dari pekerjaan yang sama;
 * menggabungkannya akan menelan cakupan — pelajaran G3 pipeline
 * standar). mergeRawItemsAcrossPasses standar TIDAK dapat dipakai:
 * ia membaca raw.dimensions/quantityFormula (bentuk standar),
 * sedangkan raw Full AI bersarang (quantity.value, quantity.formula)
 * sehingga sidik dimensinya kosong dan ia akan menggabung
 * berdasarkan nama+satuan saja.
 */
export function dedupFullAiRawItems(rawItems: any[]): { items: any[]; removedCount: number } {
  const keyOf = (raw: any) => {
    const name = String(raw?.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const unit = String(raw?.unit || raw?.quantity?.unit || '').toLowerCase().trim();
    const qty =
      raw?.quantity && typeof raw.quantity === 'object'
        ? raw.quantity.value
        : typeof raw?.qty === 'number'
          ? raw.qty
          : raw?.quantity;
    const price = typeof raw?.price === 'number' ? raw.price : raw?.price?.unitPrice;
    return `${name}|${unit}|${qty ?? ''}|${price ?? ''}`;
  };
  const seen = new Set<string>();
  const items: any[] = [];
  let removedCount = 0;
  for (const raw of rawItems) {
    const key = keyOf(raw);
    if (seen.has(key)) {
      removedCount++;
      continue;
    }
    seen.add(key);
    items.push(raw);
  }
  return { items, removedCount };
}

export { formatPageRanges };

export class FullAiDedService {
  /**
   * Gerbang timing terpusat (spesifikasi 2026-10-27): pembacaan DED =
   * complex → minimum 3 detik sejak tombol ditekan, paralel dengan
   * pipeline (parse + AI + validasi), bukan sesudahnya.
   */
  async execute(options: FullAiServiceOptions): Promise<FullAiOutput> {
    const startedAt = Date.now();
    return waitForMinimum(startedAt, minDelayFor('complex'), this.runExecute(options));
  }

  private async runExecute(options: FullAiServiceOptions): Promise<FullAiOutput> {
    // SPRINT 4 (Tugas E): penangkapan waktu operasi aditif untuk metadata usage.
    const runStartedAt = new Date().toISOString();
    const { mode, projectType } = options;
    // Kebijakan harga (default FULL_AI = perilaku lama).
    const policy: DedEstimationPolicy = options.policy ?? 'FULL_AI';
    // Mode dual DED-RAB (§7, C3): mode eksplisit menang, bila absen
    // diturunkan dari policy. Mode inilah yang menggerbang akses katalog
    // AHSP/harga internal di bawah (bukan policy mentah).
    const rabMode: DedRabAiMode = resolveDedRabAiMode(options.rabMode, policy);
    const notify = options.onProgress || (() => {});

    // W4 (§6): jejak 7 tahap pipeline — dicatat menurut urutan eksekusi
    // nyata dan dilampirkan ke keluaran (field pipelineStages). Tahap
    // 2–4 dicatat sesudah respons model diterima (penalaran model-side).
    const stageTrace: FullAiStageTraceEntry[] = [];
    const markStage = (
      stage: FullAiStageTraceEntry['stage'],
      status: FullAiStageTraceEntry['status'],
      detail: string,
    ) => {
      stageTrace.push({ stage, status, detail });
    };

    try {
      // §6 Tahap 1 — Document Intelligence: parse dokumen
      // I8: withImages:true HANYA bila visionEnabled (default false =
      // teks-saja persis seperti hari ini).
      // I11 — gerbang enablement (visionEnablement.ts): `visionEnabled`
      // saja TIDAK cukup — lingkungan juga harus mengizinkan (env flag
      // VITE_DED_VISION_ENABLED='true' + runtime non-produksi). Di
      // produksi gerbang ini selalu tertutup, apa pun yang diminta caller.
      const visionEnabled = resolveVisionEnabled(options.visionEnabled);
      notify('PARSE', 10, 'Membaca dokumen DED...');
      const parsed = await parseDedPdf(options.buffer, options.fileName, { withImages: visionEnabled });

      if ('errorCode' in parsed) {
        return this.errorOutput(mode, policy, {
          code: parsed.errorCode,
          message: parsed.message,
          retryable: parsed.retryable,
        });
      }

      // Cakupan halaman pilihan pengguna (USULAN BARU ter-ACC 2026-11-10):
      // filter di lapisan ekstraksi, sebelum teks dokumen dibangun —
      // logika AI/harga tidak berubah. Absen/kosong = semua halaman.
      const documentTotalPages = (parsed.pages || []).length;
      let pages = parsed.pages || [];
      let pageScopeApplied: number[] | null = null;
      if (options.pageScope && options.pageScope.length > 0) {
        const wanted = new Set(options.pageScope);
        pages = pages.filter((p: any) => wanted.has(p.page));
        pageScopeApplied = pages.map((p: any) => p.page);
        if (pages.length === 0) {
          return this.errorOutput(mode, policy, {
            code: 'NO_DATA',
            message: 'Tidak ada halaman terpilih yang dapat dibaca dari PDF — periksa kembali pilihan halaman Anda.',
            retryable: false,
          });
        }
      }
      notify('PARSE', 25, `Dokumen dibaca: ${pages.length} halaman`);

      // === I8 — lapisan vision (DEFAULT MATI) ===
      // Berjalan HANYA bila `visionEnabled` di atas true — yaitu bila
      // caller meminta DAN gerbang enablement I11 mengizinkan (env flag
      // VITE_DED_VISION_ENABLED='true' + runtime non-produksi; di
      // produksi selalu tertutup). Gerbang kedua ada di
      // runVisionForDedService. Mode pipeline = rabMode yang sudah
      // ter-resolve di atas (C3: FULL_AI terisolasi dari katalog
      // kanonis/harga internal — guard dievaluasi pipeline). Vision
      // adalah PENGAYA BUKTI: hasilnya dicocokkan ke item sesudah item
      // terbentuk (sebelum QC) dan dilampirkan ke keluaran. Kegagalan
      // vision TIDAK PERNAH menggagalkan lari teks-saja.
      let visionResult: VisionDocumentResult | null = null;
      let visionPageImages: Array<{ page: number; dataUrl: string }> = [];
      const visionWarnings: string[] = [];
      if (visionEnabled) {
        notify('VISION', 20, 'Menganalisis gambar halaman DED (vision)...');
        try {
          const docHash = await computeDocHash(coerceToUint8Array(options.buffer));
          const previews = new Map<number, ParserPreviewImage>();
          for (const p of pages) {
            const previewDataUrl = (p as any).previewDataUrl as string | undefined;
            if (previewDataUrl) {
              const dims = pngDimensionsFromDataUrl(previewDataUrl);
              previews.set(p.page, {
                dataUrl: previewDataUrl,
                widthPx: dims?.widthPx ?? 0,
                heightPx: dims?.heightPx ?? 0,
                base64Length: base64LengthOfDataUrl(previewDataUrl),
              });
              visionPageImages.push({ page: p.page, dataUrl: previewDataUrl });
            }
          }
          const visionInputs: VisionPageInput[] = pages.map((p: any) => {
            const preview = previews.get(p.page);
            return {
              page: p.page,
              title: p.title,
              text: p.text || '',
              hasTextLayer: (p.text || '').trim().length > 0,
              widthPx: preview?.widthPx ?? 0,
              heightPx: preview?.heightPx ?? 0,
              base64Length: preview?.base64Length ?? 0,
              fileName: options.fileName,
            };
          });
          const cacheStorage = browserSessionVisionCacheStorage();
          const visionCache = new VisionCache<VisionParseResult>(
            cacheStorage ? { storage: cacheStorage } : {},
          );
          visionResult = await runVisionForDedService({
            visionEnabled: true,
            responder: options.visionResponder,
            // Responder gateway nyata (lazy factory) + auth yang sama
            // dengan panggilan AI live (aiGatewayAuthHeaders).
            createResponder: () =>
              createGatewayVisionResponder({ getAuthHeaders: aiGatewayAuthHeaders }),
            docHash,
            mode: rabMode,
            pages: visionInputs,
            renderPage: createParserPreviewRenderPage(previews),
            cache: visionCache,
            fileName: options.fileName,
            // I11 Stage 4 — passed for symmetry with the EZRAB_AI
            // service; in FULL_AI mode the pipeline's C3 gate means
            // this matcher is NEVER called (call count 0, verified by
            // the pipeline suite), so no catalog/price data reaches
            // FULL AI.
            ahspMatcher: createVisionAhspMatcher(),
            onProgress: (ev) => {
              notify('VISION', 20, `Menganalisis gambar halaman ${ev.page}...`);
            },
          });
          if (visionResult) {
            visionWarnings.push(
              `Vision: ${visionResult.totalCost.calls} panggilan, ${visionResult.pages.length} halaman dibaca` +
                (visionResult.totalCost.cacheHits > 0 ? ` (${visionResult.totalCost.cacheHits} dari cache)` : '') +
                (visionResult.budgetHit ? ' — anggaran panggilan habis, sebagian halaman NOT_DETECTED.' : '.'),
            );
          }
        } catch (e: any) {
          visionWarnings.push(
            `Lapisan vision gagal dijalankan (${e?.message || 'unknown'}) — hasil teks tetap dipakai; tidak ada bukti visual pada lari ini.`,
          );
          visionResult = null;
          visionPageImages = [];
        }
      }

      // §6 Tahap 1 (lanjutan): rencanakan dokumen menjadi KELOMPOK
      // halaman (tanpa batas pemrosesan 2026-11-19 — menggantikan
      // buildDocumentText yang memotong pada 60.000 karakter total +
      // 4.000/halaman). Setiap kelompok = satu panggilan AI, terukur
      // ≤ anggaran request; seluruh teks terkirim, tidak ada yang dipotong.
      const buildGroupPrompt = (segs: DedPageSegment[], groupIndex: number, groupCount: number) => {
        const body = renderDedPageBlocks(segs);
        const documentText =
          groupCount <= 1
            ? body
            : `[Dokumen diproses dalam ${groupCount} kelompok halaman agar seluruh teks terkirim utuh — ` +
              `ini kelompok ${groupIndex + 1} dari ${groupCount} (halaman ${formatPageRanges(
                [...new Set(segs.map((s) => s.page))].sort((a, b) => a - b),
              )}). ` +
              `Susun item HANYA dari halaman-halaman di bawah ini; jangan mengarang item dari halaman lain.]\n\n${body}`;
        return buildFullAiPrompt({
          projectType,
          documentText,
          pageCount: pages.length,
          mode,
          pricingPolicy: policy,
        });
      };
      // Pengukuran perencanaan memakai teks TANPA spanduk kelompok
      // (jumlah kelompok belum diketahui saat perencanaan). Spanduk
      // (±200 karakter) ditambahkan saat pemanggilan — gabungan
      // system+prompt tetap < 20.000 dan prompt sendiri tetap jauh di
      // bawah batas gateway 20.000 (prompt ≤ gabungan terukur 19.500),
      // sehingga tidak mungkin gagal PAYLOAD_TOO_LARGE karena spanduk.
      const measureFullAiRequest = (segs: SelectedPage[]) => {
        const b = buildFullAiPrompt({
          projectType,
          documentText: renderDedPageBlocks(segs),
          pageCount: pages.length,
          mode,
          pricingPolicy: policy,
        });
        return b.system.length + b.prompt.length;
      };
      const docPlan = planFullAiDocument(
        pages.map((p: any) => ({ page: p.page, title: p.title, text: p.text || '', pageType: p.pageType })),
        measureFullAiRequest,
      );
      const totalChars = docPlan.totalChars;
      const groupCount = docPlan.groups.length;
      markStage(
        'DOCUMENT_INTELLIGENCE',
        'done',
        `${pages.length} halaman dibaca; ${docPlan.includedPages.length} halaman terkirim ke model dalam ${groupCount} kelompok ` +
          `(${totalChars.toLocaleString('id-ID')} karakter; kelompok terbesar ${Math.max(
            0,
            ...docPlan.groups.map((g) => g.requestChars),
          ).toLocaleString('id-ID')} karakter request)` +
          (docPlan.skippedSegments.length > 0 ? '; sebagian segmen tidak dapat dikirim (lihat warnings).' : '.'),
      );

      const warnings: string[] = [];
      if (pageScopeApplied) {
        warnings.push(
          `Cakupan halaman dibatasi pilihan pengguna: ${pageScopeApplied.length} dari ${documentTotalPages} halaman dianalisis (halaman ${formatPageRanges(pageScopeApplied)}). Halaman lain TIDAK dianalisis.`
        );
      }
      if (docPlan.skippedSegments.length > 0) {
        const skippedPages = [...new Set(docPlan.skippedSegments.map((s) => s.page))].sort((a, b) => a - b);
        warnings.push(
          `${docPlan.skippedSegments.length} segmen halaman tidak dapat dikirim ke AI karena bahkan sendirian melebihi ` +
          `anggaran request ${DED_PASS_REQUEST_BUDGET_CHARS.toLocaleString('id-ID')} karakter: halaman ${formatPageRanges(skippedPages)}. ` +
          `Analisis tidak mencakup bagian tersebut.`
        );
      }
      if (docPlan.emptyTextPages.length > 0) {
        warnings.push(
          `${docPlan.emptyTextPages.length} halaman tanpa lapisan teks tidak dapat dianalisis ` +
          `(kemungkinan hasil scan/gambar — butuh OCR): halaman ${formatPageRanges(docPlan.emptyTextPages)}.`
        );
      }
      if (totalChars === 0) {
        warnings.push('Tidak ada teks yang dapat diekstrak dari dokumen. Hasil mungkin tidak akurat.');
      }
      if (mode === 'ADVANCED') {
        warnings.push(
          `Mode Mendalam dibatasi ${Math.round(FULL_AI_TIMEOUT_MS.ADVANCED / 1000)} detik waktu pemrosesan ` +
          `per panggilan AI (plafon gateway). Dokumen sangat besar yang melewati batas ini akan berakhir ` +
          `sebagai timeout pemrosesan — bukan karena model lambat.`
        );
      }

      // §6 Tahap 2–4 (model-side): SATU panggilan AI PER KELOMPOK —
      // Scope+WBS, Construction Method Reasoning, AI AHSP Generation.
      // Kelompok dijalankan berurutan (menghindari lonjakan paralel ke
      // gateway). Kelompok yang keluarannya bukan JSON valid dipecah dua
      // dan dicoba ulang (kedalaman maks 2 — penawar output terpotong
      // plafon token, sama seperti mesin standar). Kegagalan provider
      // pada satu kelompok TIDAK menggugurkan kelompok lain: kelompok
      // itu dicatat gagal dan hasilnya menjadi parsial berlabel.
      // Dokumen tanpa teks sama sekali (0 kelompok) tidak memanggil AI.
      const productId = mode === 'FAST' ? 'DED_AI_FAST' : 'DED_AI_DETAIL';
      const MAX_GROUP_SPLIT_DEPTH = 2;
      const groupQueue: Array<{ group: FullAiPageGroup; depth: number }> =
        docPlan.groups.map((group) => ({ group, depth: 0 }));
      const mergedRawItems: any[] = [];
      const mergedWarnings: string[] = [];
      const mergedProjectInfo: Record<string, any> = {};
      let mergedProposedGrandTotal: number | null = null;
      let lastAiResult: any = null;
      let lastGroupError: { code: string; message: string } | null = null;
      const failedGroups: Array<{ pages: number[]; code: string; message: string }> = [];
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalCachedTokens = 0;
      let executedGroups = 0;
      let totalGroupsPlanned = groupQueue.length;

      const mergeProjectInfoFrom = (info: any) => {
        if (!info || typeof info !== 'object') return;
        for (const field of [
          'buildingFunction',
          'floorCount',
          'mainDimensions',
          'structuralSystem',
          'scopeSummary',
        ] as const) {
          if (mergedProjectInfo[field] == null && info[field] != null && info[field] !== '') {
            mergedProjectInfo[field] = info[field];
          }
        }
        for (const field of ['missingInfo', 'ambiguities'] as const) {
          const arr = Array.isArray(info[field]) ? info[field] : [];
          const existing: any[] = Array.isArray(mergedProjectInfo[field])
            ? mergedProjectInfo[field]
            : [];
          const seen = new Set(existing.map((v) => JSON.stringify(v)));
          for (const v of arr) {
            const k = JSON.stringify(v);
            if (!seen.has(k)) {
              seen.add(k);
              existing.push(v);
            }
          }
          if (existing.length > 0) mergedProjectInfo[field] = existing;
        }
      };

      while (groupQueue.length > 0) {
        const { group, depth } = groupQueue.shift()!;
        const groupPages = [...new Set(group.pages.map((s) => s.page))].sort((a, b) => a - b);
        const built = buildGroupPrompt(group.pages, executedGroups, totalGroupsPlanned);
        notify(
          'ANALYZE',
          40 + Math.round((executedGroups / Math.max(1, totalGroupsPlanned)) * 25),
          totalGroupsPlanned > 1
            ? `Menganalisis DED dengan AI (${mode}) — kelompok ${executedGroups + 1}/${totalGroupsPlanned}…`
            : `Menganalisis DED dengan AI (${mode})...`,
        );
        const groupAiResult = await aiToolsProviderClient.execute({
          productId,
          prompt: built.prompt,
          systemPrompt: built.system,
          jsonMode: true,
          maxTokens: mode === 'FAST' ? 16000 : 32000,
          timeoutMs: FULL_AI_TIMEOUT_MS[mode],
        });
        executedGroups++;
        if (!groupAiResult.success) {
          failedGroups.push({
            pages: groupPages,
            code: groupAiResult.errorCode || 'AI_ERROR',
            message: groupAiResult.message || 'AI gagal memproses',
          });
          lastGroupError = {
            code: groupAiResult.errorCode || 'AI_ERROR',
            message: groupAiResult.message || 'AI gagal memproses',
          };
          continue;
        }
        lastAiResult = groupAiResult;
        totalInputTokens += groupAiResult.usage?.inputTokens ?? 0;
        totalOutputTokens += groupAiResult.usage?.outputTokens ?? 0;
        totalCachedTokens += groupAiResult.usage?.cachedTokens ?? 0;
        let parsedGroup: any;
        try {
          parsedGroup = aiToolsProviderClient.extractJson(groupAiResult.content);
        } catch {
          if (depth < MAX_GROUP_SPLIT_DEPTH && group.pages.length > 1) {
            const mid = Math.ceil(group.pages.length / 2);
            const halves = [group.pages.slice(0, mid), group.pages.slice(mid)];
            for (const half of halves) {
              groupQueue.push({
                group: { pages: half, requestChars: measureFullAiRequest(half) },
                depth: depth + 1,
              });
            }
            totalGroupsPlanned += 1; // 1 induk → 2 anak = +1 bersih
            warnings.push(
              `Kelompok halaman ${formatPageRanges(groupPages)} mengembalikan keluaran bukan JSON valid; ` +
              `kelompok dipecah dua dan dijalankan ulang.`,
            );
            continue;
          }
          failedGroups.push({
            pages: groupPages,
            code: 'INVALID_JSON',
            message: 'Respons AI bukan JSON valid',
          });
          lastGroupError = { code: 'INVALID_JSON', message: 'Respons AI bukan JSON valid' };
          continue;
        }
        const groupItems = Array.isArray(parsedGroup?.items) ? parsedGroup.items : [];
        // RETRY BILA HASIL 0 ITEM (2026-11-20, diagnosis live Preview
        // brxi1ux47): jawaban model yang terpotong plafon output provider
        // (ArxPay 8000 token; Full AI Cepat meminta 16000) dapat ter-parse
        // sebagai JSON VALID dengan items kosong — dulu langsung di-merge
        // sebagai sukses diam-diam (0 item, tanpa percobaan ulang).
        // Sekarang rencana kosong diperlakukan SAMA seperti JSON invalid:
        // pecah grup dua dan jalankan ulang; bila tak bisa dipecah lagi,
        // catat EMPTY_PLAN (bukan sukses diam-diam). Grup berisi (>=1
        // item) tidak berubah perilakunya. projectInfo/warnings rencana
        // kosong sengaja TIDAK di-merge (paralel dengan jalur INVALID_JSON
        // — anak-anak menurunkan ulang dari halaman yang sama).
        if (groupItems.length === 0) {
          if (depth < MAX_GROUP_SPLIT_DEPTH && group.pages.length > 1) {
            const mid = Math.ceil(group.pages.length / 2);
            const halves = [group.pages.slice(0, mid), group.pages.slice(mid)];
            for (const half of halves) {
              groupQueue.push({
                group: { pages: half, requestChars: measureFullAiRequest(half) },
                depth: depth + 1,
              });
            }
            totalGroupsPlanned += 1; // 1 induk → 2 anak = +1 bersih
            warnings.push(
              `Kelompok halaman ${formatPageRanges(groupPages)} mengembalikan rencana tanpa item pekerjaan; ` +
              `kelompok dipecah dua dan dijalankan ulang.`,
            );
            continue;
          }
          failedGroups.push({
            pages: groupPages,
            code: 'EMPTY_PLAN',
            message: 'Respons AI tidak menghasilkan item pekerjaan',
          });
          lastGroupError = { code: 'EMPTY_PLAN', message: 'Respons AI tidak menghasilkan item pekerjaan' };
          continue;
        }
        mergedRawItems.push(...groupItems);
        mergedWarnings.push(...normalizeAiWarnings(parsedGroup.warnings));
        mergeProjectInfoFrom(parsedGroup.projectInfo);
        if (
          mergedProposedGrandTotal == null &&
          typeof parsedGroup.proposedGrandTotal === 'number' &&
          Number.isFinite(parsedGroup.proposedGrandTotal)
        ) {
          mergedProposedGrandTotal = parsedGroup.proposedGrandTotal;
        }
      }

      if (mergedRawItems.length === 0 && failedGroups.length > 0 && lastAiResult == null) {
        // Semua kelompok gagal — perilaku lama dipertahankan (error, bukan hasil kosong).
        return this.errorOutput(mode, policy, {
          code: lastGroupError?.code || 'AI_ERROR',
          message: lastGroupError?.message || 'AI gagal memproses',
          retryable: true,
        });
      }
      for (const fg of failedGroups) {
        warnings.push(
          `Kelompok halaman ${formatPageRanges(fg.pages)} gagal diproses (${fg.code}: ${fg.message}) — ` +
          `item dari halaman tersebut tidak ada di hasil ini.`,
        );
      }

      // Parse & validasi respons model (normalisasi + validateFullAiItem
      // + resolusi kanonis per item).
      notify('VALIDATE', 70, 'Memvalidasi hasil AI...');
      const { items: dedupedRawItems, removedCount: dedupRemoved } =
        dedupFullAiRawItems(mergedRawItems);
      if (dedupRemoved > 0) {
        warnings.push(
          `${dedupRemoved} item duplikat antar-kelompok (nama, satuan, kuantitas, dan harga identik) ` +
          `dihapus agar tidak terhitung dua kali.`,
        );
      }
      const rawItems = dedupedRawItems;
      // Objek gabungan dengan bentuk respons tunggal lama agar seluruh
      // logika hilir (projectInfo, total usulan, warnings model) tidak berubah.
      const parsedAi: any = {
        projectInfo: mergedProjectInfo,
        // Total usulan model hanya bermakna bila SATU kelompok (satu
        // model melihat seluruh dokumen); bila berkelompok, total usulan
        // diambil dari jumlah subtotal usulan item di bawah.
        proposedGrandTotal: groupCount <= 1 ? mergedProposedGrandTotal : null,
        warnings: mergedWarnings,
      };
      // aiResult untuk provenance/usage hilir: hasil panggilan TERAKHIR
      // yang berhasil (identitas provider/model + requestId); token
      // dijumlahkan dari SEMUA panggilan kelompok.
      const aiResult: any = lastAiResult
        ? {
            ...lastAiResult,
            usage: {
              inputTokens: totalInputTokens || null,
              outputTokens: totalOutputTokens || null,
              cachedTokens: totalCachedTokens || null,
            },
          }
        : { success: true, requestId: null, usage: null, provider: null, model: null };
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
            // REKONSILIASI: stempel region/period default untuk harga flat.
            // `region` di sini METADATA PASSTHROUGH semata — tidak ada satu
            // pun keputusan yang membacanya: applyFullAiPricePolicy hanya
            // membaca source; resolveFullAiItemPrice meneruskannya apa
            // adanya (FULL_AI) atau menimpanya 'Nasional' untuk kanonis
            // (EZRAB_AI); adapter tidak menerima region; validator dan
            // completeFullAiPrices tidak membacanya; tidak ada pembaca
            // item.price.region di luar service.ts. Jadi stempel ini
            // TIDAK menggerakkan resolusi/asumsi harga di mode mana pun
            // (termasuk FULL AI) — dibiarkan apa adanya, bukan asumsi
            // Jakarta yang memengaruhi angka.
            region: 'Jakarta',
            period: '2026',
          },
        };

        // §7 (G-IS-6): validator menerima mode agar di FULL_AI ia tidak
        // memeriksa blok penyelesaian terhadap referensi internal.
        const validation = validateFullAiItem(normalized, i, { rabMode });

        // F4 (3.7): peringatan validator SELALU diteruskan; error validator
        // dikumpulkan ke allErrors dan WAJIB muncul di hasil akhir (dulu
        // dikumpulkan lalu hilang tanpa jejak selain warnings).
        warnings.push(...validation.warnings);
        if (!validation.valid) {
          allErrors.push(...validation.errors);
          // Item tidak valid tetap ditampilkan dengan status UNRESOLVED
          // Jangan buang diam-diam
        }

        const q = normalized.quantity || {};
        // Gerbang kebijakan harga (§7, G-IS-2 — kini gerbang NYATA, bukan
        // no-op): di mode FULL_AI klaim harga database yang tak dapat
        // dikonfirmasi tanpa katalog diturunkan jadi estimasi AI; di mode
        // EZRAB_AI harga diteruskan ke adapter — kanonis RESOLVED menang;
        // bila tidak ada di database, estimasi AI dipakai sebagai fallback
        // berlabel jelas (keputusan owner 2026-10-27 malam). Item tanpa
        // harga tetap tampil dengan exclusionReason PRICE_UNRESOLVED di bawah.
        const p = applyFullAiPricePolicy(policy, normalized.price || {}, rabMode);
        // Resolusi harga (§7, G-IS-1): HANYA di mode EZRAB_AI adapter
        // kanonis dipanggil (klaim VERIFIED tidak dipercaya begitu saja;
        // klaim gagal turun jadi estimasi AI berlabel perkiraan). Di mode
        // FULL_AI adapter TIDAK dipanggil sama sekali — estimasi AI
        // dipertahankan apa adanya. Harga USER_INPUT tidak pernah ditimpa
        // di mode mana pun. Logika ini tinggal di resolveFullAiItemPrice
        // (di bawah) agar gerbangnya dapat dibuktikan dengan spy.
        let finalPrice: {
          unitPrice: number | null; unit: string; source: FullAiPriceSource;
          region?: string; period?: string; ahspCode?: string; notes?: string;
        };
        let ahspMatch: CanonicalDedMatch | undefined;
        if (p.source === 'USER_INPUT') {
          finalPrice = {
            unitPrice: typeof p.unitPrice === 'number' ? p.unitPrice : null,
            unit: String(p.unit || q.unit || ''),
            source: 'USER_INPUT',
            region: p.region, period: p.period, ahspCode: p.ahspCode, notes: p.notes,
          };
        } else {
          const resolved = resolveFullAiItemPrice({
            rabMode,
            policy,
            name: String(raw.name || ''),
            quantityUnit: String(q.unit || ''),
            description: typeof raw.description === 'string' ? raw.description : undefined,
            claimedAhspCode: typeof normalized.price?.ahspCode === 'string'
              ? normalized.price.ahspCode
              : undefined,
            price: {
              unitPrice: typeof p.unitPrice === 'number' ? p.unitPrice : null,
              unit: String(p.unit || q.unit || ''),
              source: p.source || 'UNRESOLVED',
              region: p.region,
              period: p.period,
              notes: p.notes,
              ahspCode: p.ahspCode,
            },
          });
          finalPrice = resolved.finalPrice;
          ahspMatch = resolved.ahspMatch;
        }
        // Penyelesaian harga referensi eksternal TIDAK lagi inline di
        // sini: sesudah semua item terbentuk, completeFullAiPrices
        // (SPRINT 4, di bawah) mengisinya dengan blok DedPriceCompletion
        // TERSTRUKTUR yang sama dengan pipeline standar — satu jalur
        // yang dapat diuji, bukan logika tertanam di loop konversi.
        // Mode FULL_AI saja; kanonis/USER_INPUT tidak pernah disentuh
        // karena harganya tidak pernah null di titik ini bila terisi.
        const { subtotal, verified: subtotalComputed } = verifySubtotal(
          typeof q.value === 'number' ? q.value : null,
          finalPrice.unitPrice
        );
        // Usulan AI (mode FULL_AI saja; prompt DATABASE tidak memintanya):
        // disimpan terpisah, tidak pernah dipakai sebagai subtotal resmi.
        // Selisih vs subtotal terverifikasi dicatat — selisih dapat berasal
        // dari aritmetika AI maupun substitusi harga kanonis atas harga AI.
        const aiProposedSubtotal =
          typeof raw.proposedSubtotal === 'number' && Number.isFinite(raw.proposedSubtotal)
            ? raw.proposedSubtotal
            : null;
        const subtotalDiscrepancy = describeProposedDiscrepancy(aiProposedSubtotal, subtotal) || undefined;

        // Tentukan status dan alasan eksklusi (diagnostik spesifik) —
        // satu fungsi murni agar layar hasil (konfirmasi kandidat) memakai
        // aturan yang persis sama dengan service ini.
        const { status, exclusionReason } = resolveFullAiItemStatus(
          { value: q.value, unit: q.unit, provenance: q.provenance },
          { unitPrice: finalPrice.unitPrice, unit: finalPrice.unit, source: finalPrice.source },
        );
        // ASSUMPTION/DERIVED/EXPLICIT dengan qty+harga valid → READY (masuk total)
        // Label asumsi tetap terlihat jelas di UI — bukan status terverifikasi

        // Item UNRESOLVED tidak masuk total tapi tetap ditampilkan
        const includeInTotal = status === 'READY' && subtotal != null && subtotal > 0;

        items.push({
          id: `fullai-${i + 1}`,
          // Penomoran model hanya dipakai bila SATU kelompok; bila
          // berkelompok, tiap kelompok menomori dari 1 sehingga nomor
          // bertabrakan — dinomori ulang berurutan.
          no: groupCount <= 1 ? raw.no || i + 1 : i + 1,
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
            unitPrice: finalPrice.unitPrice,
            unit: finalPrice.unit,
            source: finalPrice.source,
            region: finalPrice.region || undefined,
            period: finalPrice.period || undefined,
            ahspCode: finalPrice.ahspCode || undefined,
            notes: finalPrice.notes || undefined,
            ahspMatch,
          },
          subtotal: includeInTotal ? subtotal : null,
          aiProposedSubtotal,
          // Selisih hanya bermakna bila subtotal terverifikasi ikut total.
          subtotalDiscrepancy: includeInTotal ? subtotalDiscrepancy : undefined,
          // F4 (3.7): hanya true bila subtotal item ini benar-benar terhitung
          // & terverifikasi dari qty × harga yang keduanya ada. Item yang
          // subtotalnya null (harga/volume hilang atau tereksklusi) TIDAK
          // boleh mengklaim terverifikasi.
          subtotalVerified: subtotalComputed && includeInTotal,
          status: includeInTotal ? 'READY' : status,
          exclusionReason: includeInTotal ? null : exclusionReason,
          sourcePages: Array.isArray(raw.sourcePages) ? raw.sourcePages : undefined,
        });

        if (!includeInTotal && exclusionReason) {
          warnings.push(`Item "${raw.name}" tidak masuk total [${exclusionReason}]`);
        }
      }

      // §6 Tahap 2–4 — jejak model-side (DICATAT sesudah respons model
      // diterima; bukti terukur dari respons itu, BUKAN pass terpisah):
      markStage(
        'SCOPE_WBS',
        'done',
        `Model-side dalam ${executedGroups} panggilan AI (kelompok halaman): ${items.filter((it) => it.wbsCode).length} dari ${items.length} item membawa kode WBS; ringkasan cakupan ${parsedAi.projectInfo?.scopeSummary ? 'tersedia' : 'tidak diberikan'}.`,
      );
      markStage(
        'METHOD_REASONING',
        'done',
        `Model-side dalam ${executedGroups} panggilan AI (kelompok halaman): ${items.filter((it) => it.description).length} item berdeskripsi, ${items.filter((it) => (it.quantity.assumptions || []).length > 0).length} item berasumsi, ${items.filter((it) => it.quantity.formula).length} item berumus.`,
      );
      markStage(
        'AI_AHSP_GENERATION',
        'done',
        `Model-side dalam ${executedGroups} panggilan AI (kelompok halaman) + resolusi kanonis per item: ${items.filter((it) => it.price.ahspMatch).length} item melewati resolusi kanonis, ${items.filter((it) => it.price.source === 'AHSP_2026').length} item berharga kanonis AHSP_2026.`,
      );

      // SPRINT 4 (paritas harga): penyelesaian harga referensi
      // eksternal dengan blok DedPriceCompletion terstruktur — jalur
      // yang sama dengan completeDedItem pipeline standar (referensi
      // bersama, penjaga konflik spesifikasi yang sama, klasifikasi
      // basi yang sama). Berjalan SEBELUM pass kuantitas agar isian
      // kuantitas dapat menempelkan quantityBasis ke blok harga.
      // Mode FULL_AI saja.
      if (policy === 'FULL_AI') {
        // §7 (G-IS-5): di mode FULL_AI completeFullAiPrices TIDAK memakai
        // externalPriceReferences — gerbangnya hidup di dalam fungsi itu
        // (dataSourcePolicy); di sini mode hanya diteruskan.
        const filledPrices = completeFullAiPrices(items, { rabMode });
        if (filledPrices > 0) {
          warnings.push(
            `${filledPrices} harga dilengkapi dari referensi pasar eksternal terkurasi (estimasi AI berlabel sumber & blok penyelesaian terstruktur — bukan harga resmi AHSP, perlu tinjauan pengguna).`
          );
        }
      }

      // HARDENING Tahap 4 (paritas pipeline): estimasi kuantitas
      // konteks-denah yang sama dengan pipeline standar, memakai
      // layanan BERSAMA (derivePlanContext / classifyQuantity /
      // estimateMissingQuantity dari ded-ai-estimate/priceCompletion)
      // — bukan implementasi kedua. Mode FULL_AI saja; DATABASE tidak
      // pernah dilengkapi diam-diam.
      // Keputusan owner 2026-11-20 23:18 (Full AI SAJA): sesudah pass
      // konteks, item yang kuantitasnya MASIH kosong diisi asumsi AI
      // (completeFullAiQuantitiesWithAi — satu panggilan tambahan, hanya
      // bila ada yang kosong), lalu kuantitas vs rumus direkonsiliasi
      // deterministik (reconcileFullAiQuantityFormulas), dan warning
      // eksklusi yang sudah basi dibersihkan.
      // Perluasan owner 2026-11-21 00:48 ("biarin AI yang mengatur"):
      // sesudah pass AI, jaring pengaman deterministik
      // (fillFullAiQuantitiesFromFormulas) mengisi item yang nilainya
      // masih kosong tetapi rumusnya dapat dihitung — menutup keadaan
      // live "berumus tetapi kosong" (22 item, run 00:45).
      let filledQtyAi = 0;
      let filledQtyFormula = 0;
      if (policy === 'FULL_AI') {
        const filledQty = completeFullAiQuantities(items);
        if (filledQty > 0) {
          warnings.push(
            `${filledQty} kuantitas dilengkapi dari konteks denah (estimasi berlabel ASSUMPTION — bukan fakta gambar, perlu tinjauan pengguna).`
          );
        }
        const aiFill = await completeFullAiQuantitiesWithAi(items, {
          execute: aiToolsProviderClient.execute.bind(aiToolsProviderClient),
          productId,
          timeoutMs: FULL_AI_TIMEOUT_MS[mode],
          projectType,
        });
        filledQtyAi = aiFill.filled;
        if (aiFill.filled > 0) {
          warnings.push(
            `${aiFill.filled} kuantitas dilengkapi dari asumsi AI (estimasi berlabel ASSUMPTION — bukan fakta gambar, perlu tinjauan pengguna).`
          );
        }
        const formulaFilled = fillFullAiQuantitiesFromFormulas(items);
        filledQtyFormula = formulaFilled;
        if (formulaFilled > 0) {
          warnings.push(
            `${formulaFilled} kuantitas dihitung dari rumus yang dinyatakan item (estimasi berlabel ASSUMPTION — bukan fakta gambar, perlu tinjauan pengguna).`
          );
        }
        if (aiFill.failed) {
          // Hitung sisa kosong SESUDAH jaring pengaman agar angkanya
          // jujur (jaring bisa mengisi sebagian walau pass AI gagal).
          const stillMissing = items.filter((it) => it.quantity?.value == null).length;
          warnings.push(
            `Pass asumsi kuantitas AI gagal (${aiFill.failureMessage}) — ${stillMissing} item tanpa kuantitas tetap dikecualikan dari total.`
          );
        }
        const correctedQty = reconcileFullAiQuantityFormulas(items);
        if (correctedQty > 0) {
          warnings.push(
            `${correctedQty} kuantitas dikoreksi agar sesuai rumus yang dinyatakan (nilai asli model tercatat di catatan item).`
          );
        }
        const freshWarnings = dropStaleExclusionWarnings(warnings, items);
        warnings.length = 0;
        warnings.push(...freshWarnings);
      }

      // §6 Tahap 5–6 — jejak pass penyelesaian (dihitung dari keadaan
      // item sesudah pass; pemanggilan completion di atas tidak diubah):
      markStage(
        'AI_PRICING',
        policy === 'FULL_AI' ? 'done' : 'skipped',
        policy === 'FULL_AI'
          ? `Pass penyelesaian harga: ${items.filter((it) => it.price.filledFromExternalRef).length} item membawa harga isian referensi eksternal (filledFromExternalRef).`
          : 'Dilewati: penyelesaian harga hanya berjalan pada policy FULL_AI.',
      );
      markStage(
        'QUANTITY_VOLUME',
        policy === 'FULL_AI' ? 'done' : 'skipped',
        policy === 'FULL_AI'
          ? `Pass penyelesaian kuantitas: ${items.filter((it) => (it.quantityAudit?.method ?? it.quantity.quantityAudit?.method) === 'plan-context-estimate').length} kuantitas dilengkapi dari konteks denah, ${filledQtyAi} dilengkapi dari asumsi AI, ${filledQtyFormula} dihitung dari rumus item.`
          : 'Dilewati: penyelesaian kuantitas hanya berjalan pada policy FULL_AI.',
      );

      // I8 — cocokkan bukti vision ke item (hanya bila vision jalan).
      // Pencocokan deterministik + konservatif (matchVisionEvidenceToItem):
      // deteksi menempel hanya bila teksnya terikat ke item DAN halamannya
      // termasuk sourcePages item. visionEvidence TIDAK PERNAH mengubah
      // kuantitas/harga/subtotal/status — QC di bawah tidak membacanya.
      if (visionResult) {
        for (const it of items) {
          const evidence = matchVisionEvidenceToItem(
            {
              name: it.name,
              texts: [it.quantity?.formula ?? '', it.quantity?.dimensions ?? ''],
              sourcePages: it.sourcePages ?? [],
            },
            visionResult.pages,
          );
          if (evidence.length > 0) it.visionEvidence = evidence;
        }
      }

      // §6 Tahap 7 — Quality Control: audit single-pass atas item final.
      // TANPA loop revisi otomatis (revisionIterations QC selalu 0); isu
      // dipertahankan sebagai warning/unresolved yang terlihat.
      const qualityControl = runFullAiQualityControl(items, {
        projectType,
        scopeSummary: parsedAi.projectInfo?.scopeSummary,
        documentPages: pages.length,
      });
      markStage(
        'QUALITY_CONTROL',
        'done',
        `Audit single-pass: ${qualityControl.checks.filter((c) => c.passed).length}/${qualityControl.checks.length} pemeriksaan lolos, ${qualityControl.unresolvedIssueCount} isu dipertahankan terlihat, 0 iterasi revisi.`,
      );
      warnings.push(...qualityControl.warnings);
      // I8 — peringatan vision masuk warnings keluaran (dibatasi 20 baris;
      // selengkapnya ada di output.vision.warnings).
      warnings.push(...visionWarnings);
      if (visionResult && visionResult.warnings.length > 0) {
        warnings.push(...visionResult.warnings.slice(0, 20).map((w) => `Vision: ${w}`));
        if (visionResult.warnings.length > 20) {
          warnings.push(
            `Vision: +${visionResult.warnings.length - 20} peringatan lainnya (lihat output.vision.warnings).`,
          );
        }
      }

      // Total: jumlah subtotal terverifikasi — rumus diekstrak ke
      // computeFullAiGrandTotal (semantik persis penjumlahan inline lama;
      // kesetaraan vs engine kanonis dibuktikan suite W4, G-SP-1).
      notify('FINALIZE', 90, 'Menyusun hasil akhir...');
      const { grandTotal } = computeFullAiGrandTotal(items);

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

      // Total usulan AI (mode FULL_AI saja): dari proposedGrandTotal model,
      // atau jumlah aiProposedSubtotal item. Disimpan terpisah; selisih vs
      // total terverifikasi dicatat sebagai peringatan, bukan ditimpa.
      const modelProposedTotal =
        typeof parsedAi.proposedGrandTotal === 'number' && Number.isFinite(parsedAi.proposedGrandTotal)
          ? parsedAi.proposedGrandTotal
          : null;
      const summedProposed = items
        .map((it) => it.aiProposedSubtotal)
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)
        .reduce((a, b) => a + b, 0);
      const aiProposedGrandTotal = modelProposedTotal ?? (summedProposed > 0 ? summedProposed : null);
      const grandDiscrepancy = describeProposedDiscrepancy(aiProposedGrandTotal, grandTotal);
      if (grandDiscrepancy) warnings.push(`Total usulan AI vs terverifikasi: ${grandDiscrepancy}`);

      notify('DONE', 100, 'Analisis selesai');

      const actualProviderModel = resolveActualProviderModel(aiResult);
      return {
        success: true,
        mode,
        policy,
        // HARDENING Tahap 6: metadata usage workflow (bukan tagihan).
        usage: buildDedUsageFromFullAi(
          {
            provenance: actualProviderModel,
            items,
            isPartial: summary.excludedFromTotal > 0,
            warnings,
            fileName: options.fileName,
            productId,
            // SPRINT 5 (X3 + plumbing X1/X2): requestId & usage attempt
            // final dari AiToolsSuccess diteruskan apa adanya; string
            // kosong (jalur Node) → null, usage absen → null.
            requestId: typeof aiResult.requestId === 'string' && aiResult.requestId !== '' ? aiResult.requestId : null,
            inputTokens: aiResult.usage?.inputTokens ?? null,
            outputTokens: aiResult.usage?.outputTokens ?? null,
            cachedTokens: aiResult.usage?.cachedTokens ?? null,
          },
          {
            workflowId: `fullai-${Date.now()}`, policy,
            // G-UI-4 (Dual Mode §3): kompleksitas pilihan user (DETAIL)
            // diteruskan ke catatan usage; absen → null (bukan default).
            complexity: options.complexity,
            startedAt: runStartedAt,
            finishedAt: new Date().toISOString(),
          },
        ),
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
        aiProposedGrandTotal,
        grandTotalNote,
        summary,
        pipelineStages: stageTrace,
        qualityControl,
        // I8 — hasil vision + gambar halaman (hanya bila vision jalan;
        // lari teks-saja tidak membawa kedua field ini).
        vision: visionResult ?? undefined,
        pageImages: visionPageImages.length > 0 ? visionPageImages : undefined,
        // F4 (3.7): error validator per item WAJIB tampil di hasil akhir;
        // peringatan model dinormalisasi (string utuh ≠ peringatan per karakter).
        warnings: [
          ...warnings,
          ...allErrors.map((e) => `Validasi: ${e}`),
          ...normalizeAiWarnings(parsedAi.warnings),
        ],
        // F4 (3.1): identitas AKTUAL dari respons gateway — null bila
        // respons tidak membawanya. Bukan lagi hardcode per mode.
        provenance: {
          ...actualProviderModel,
          timeoutLimitMs: FULL_AI_TIMEOUT_MS[mode],
          timestamp: new Date().toISOString(),
          documentPages: pages.length,
          documentChars: totalChars,
        },
      };
    } catch (err: any) {
      return this.errorOutput(mode, policy, {
        code: 'SERVICE_ERROR',
        message: err?.message || 'Terjadi kesalahan',
        retryable: true,
      });
    }
  }

  private errorOutput(
    mode: 'FAST' | 'ADVANCED',
    policy: DedEstimationPolicy,
    error: { code: string; message: string; retryable: boolean }
  ): FullAiOutput {
    return {
      success: false,
      mode,
      policy,
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
        provider: null,
        model: null,
        timeoutLimitMs: FULL_AI_TIMEOUT_MS[mode],
        timestamp: new Date().toISOString(),
        documentPages: 0,
        documentChars: 0,
      },
    };
  }
}

/**
 * Gerbang kebijakan harga mesin Full AI (murni, service layer).
 * Keputusan owner 2026-10-27 malam (menggantikan aturan lama yang
 * menolak estimasi di mode Database):
 * - FULL_AI: harga diteruskan apa adanya (perilaku lama; validator tetap
 *   memeriksa struktur, satuan, dan aritmetika di tempat lain).
 * - DATABASE: harga diteruskan ke adapter — adapter yang memutuskan:
 *   kanonis RESOLVED menang (AHSP_2026); bila tidak ada di database,
 *   AI_ESTIMATE / klaim VERIFIED yang gagal dikonfirmasi turun jadi
 *   estimasi AI berlabel jelas (perkiraan, bukan harga database).
 *   USER_INPUT tidak pernah disentuh. Gerbang ini sengaja tidak lagi
 *   menul-kan estimasi: menul-kan di sini membuat adapter tidak punya
 *   fallback dan analisis Database gagal total (NO_CALCULABLE_ITEMS).
 */
/**
 * HARDENING Tahap 4 — Paritas kuantitas ded-full-ai dengan pipeline
 * standar. Item Full AI diadaptasi ke bentuk minimal DedAiItem lalu
 * diproses layanan BERSAMA pipeline standar:
 * `derivePlanContext` (konteks denah), `classifyQuantity`
 * (diskriminator MISSING/IMPLAUSIBLE_FRAGMENT/EXPLICIT_ZERO/PRESENT),
 * dan `estimateMissingQuantity` (aturan estimasi konteks yang sama).
 * Isian selalu: provenance ASSUMPTION + formula + daftar asumsi +
 * catatan nilai asli — tidak pernah menyamar sebagai fakta gambar.
 * Nol eksplisit yang disengaja TIDAK diisi (sama seperti standar).
 * Subtotal dihitung ulang lewat verifySubtotal dan status lewat
 * resolveFullAiItemStatus — aturan yang sama dengan loop utama.
 * Mengembalikan jumlah item yang kuantitasnya dilengkapi.
 *
 * SPRINT 4: setiap item yang melewati fungsi ini juga membawa blok
 * audit kuantitas bersama (DedQuantityAudit, klasifikasi 8 kelas
 * DedQuantityClass lewat classifyQuantityProvenance/buildQuantityAudit)
 * — isian konteks terklasifikasi ESTIMATED_FROM_CONTEXT dengan jejak
 * isian lengkap, bukan kosakata provenans terpisah.
 */
/** Adaptasi satu item Full AI ke bentuk minimal DedAiItem untuk
 *  layanan BERSAMA pipeline standar (klasifikasi & audit kuantitas).
 *  Pemetaan provenans disengaja: EXPLICIT (fakta DED versi Full AI)
 *  → DED_EXPLICIT; selain itu kosakata Full AI dipetakan 1:1 dan
 *  sisanya UNRESOLVED — tidak ada kelas yang dikarang di jalur ini. */
function adaptFullAiItemForQuantityServices(it: FullAiItem): DedAiItem {
  return {
    name: it.name,
    units: it.quantity.unit,
    quantity: it.quantity.value,
    quantitySource: it.quantity.provenance === 'USER_INPUT'
      ? 'USER_INPUT'
      : it.quantity.provenance === 'ASSUMPTION'
        ? 'ASSUMPTION'
        : it.quantity.provenance === 'DERIVED'
          ? 'DERIVED'
          : it.quantity.provenance === 'EXPLICIT'
            ? 'DED_EXPLICIT'
            : 'UNRESOLVED',
    quantityFormula: it.quantity.formula,
    quantityNote: it.quantity.notes,
    priceSource: 'UNRESOLVED',
  } as DedAiItem;
}

export function completeFullAiQuantities(items: FullAiItem[]): number {
  const asDed: DedAiItem[] = items.map(adaptFullAiItemForQuantityServices);
  const ctx = derivePlanContext(asDed);
  let filled = 0;
  items.forEach((it, idx) => {
    const cls = classifyQuantity(asDed[idx]);
    if (cls !== 'MISSING' && cls !== 'IMPLAUSIBLE_FRAGMENT') {
      // SPRINT 4: item yang tidak diisi pun membawa blok audit bersama
      // (klasifikasi 8 kelas atas keadaannya sendiri — fakta gambar
      // DRAWING_EXTRACTED, nol EXPLICIT_ZERO, dst.) agar kosakata
      // provenans Full AI tidak lagi terpisah dari pipeline standar.
      const audit = buildQuantityAudit(asDed[idx]);
      it.quantity = { ...it.quantity, quantityAudit: audit };
      it.quantityAudit = audit;
      return;
    }
    const est = estimateMissingQuantity(asDed[idx], ctx);
    if (!est) {
      const audit = buildQuantityAudit(asDed[idx]);
      it.quantity = { ...it.quantity, quantityAudit: audit };
      it.quantityAudit = audit;
      return;
    }
    const original = it.quantity.value;
    it.quantity = {
      ...it.quantity,
      value: est.quantity,
      formula: est.formula,
      provenance: 'ASSUMPTION',
      confidence: 'MEDIUM',
      assumptions: [...(it.quantity.assumptions ?? []), est.basis],
      notes: [it.quantity.notes, `Kuantitas dilengkapi dari konteks denah (nilai asli: ${original == null ? 'kosong' : original}). Estimasi — bukan fakta gambar.`]
        .filter(Boolean)
        .join(' '),
    };
    // SPRINT 4: audit isian dibangun dari item hasil adaptasi SESUDAH
    // pengisian + jejak isian (QuantityFillTrace) lewat helper bersama
    // buildQuantityAudit — klasifikasinya ESTIMATED_FROM_CONTEXT
    // (provenans ASSUMPTION), TIDAK PERNAH DRAWING_EXTRACTED, dengan
    // nilai asli tercatat dan persetujuan PENDING.
    const fillTrace: QuantityFillTrace = { estimate: est, ctx, originalQuantity: original };
    const audit = buildQuantityAudit(adaptFullAiItemForQuantityServices(it), fillTrace);
    it.quantity = { ...it.quantity, quantityAudit: audit };
    it.quantityAudit = audit;
    // Bila item juga membawa blok penyelesaian harga, dasar kuantitas
    // ditempelkan ke blok itu (quantityBasis — paritas markQuantityBasis
    // pipeline standar). Blok harga TIDAK dibuat hanya karena kuantitas
    // terisi: blok harga hanya lahir dari penyelesaian harga.
    const pc = it.price.priceCompletion ?? it.priceCompletion;
    if (pc && !pc.quantityBasis) {
      const withBasis = { ...pc, quantityBasis: est.formula };
      it.price = { ...it.price, priceCompletion: withBasis };
      it.priceCompletion = withBasis;
    }
    const { subtotal } = verifySubtotal(it.quantity.value, it.price.unitPrice);
    const { status, exclusionReason } = resolveFullAiItemStatus(
      { value: it.quantity.value, unit: it.quantity.unit, provenance: it.quantity.provenance },
      { unitPrice: it.price.unitPrice, unit: it.price.unit, source: it.price.source },
    );
    const include = status === 'READY' && subtotal != null && subtotal > 0;
    it.subtotal = include ? subtotal : null;
    it.subtotalVerified = include;
    it.status = include ? 'READY' : status;
    it.exclusionReason = include ? null : exclusionReason;
    filled++;
  });
  return filled;
}

// ---------------------------------------------------------------------------
// KEPUTUSAN OWNER 2026-11-20 23:18 (mode Full AI SAJA): AI boleh mengarang
// harga maupun kuantitas, asal konsisten dengan asumsinya sendiri dan
// tetap berlabel asumsi; AI mengerjakan semuanya. Perluasan 2026-11-21
// 00:48 ("biarin AI yang mengatur"): AI WAJIB mengisi SEMUA kuantitas —
// jalan keluar null di prompt dihapus, rumus item disertakan, dan jaring
// pengaman deterministik ditambahkan. Empat fungsi di bawah ini
// mewujudkan keputusan itu di jalur Full AI — semuanya dipanggil HANYA
// dari blok `policy === 'FULL_AI'` di runExecute; mode EZRAB AI
// (DATABASE) tidak pernah menyentuhnya.
//  - completeFullAiQuantitiesWithAi: pass asumsi AI untuk item yang
//    kuantitasnya masih kosong sesudah pass estimasi konteks-denah
//    (aturan konteks hanya mencakup jenis item tertentu dan butuh
//    konteks denah — tanpa dimensi sama sekali, aturannya tidak jalan
//    dan item dikecualikan; pass ini meminta model mengisi sisanya).
//  - fillFullAiQuantitiesFromFormulas: jaring pengaman deterministik —
//    item yang nilainya masih kosong tetapi rumusnya dapat dihitung
//    diisi dari rumus itu (menutup keadaan live "berumus tetapi kosong").
//  - recomputeQuantityFromFormula + reconcileFullAiQuantityFormulas:
//    cek konsistensi deterministik — angka harus mengikuti rumus/dasar
//    yang dinyatakan. Bila tidak cocok, dipakai hasil hitung ulang dan
//    koreksinya dicatat TERBUKA di catatan item (tidak pernah diam-diam).
//  - dropStaleExclusionWarnings: warning "tidak masuk total" dari loop
//    mapping menjadi basi bila pass penyelesaian mengisi itemnya (sudah
//    terjadi sebelum ini pada isian konteks — item 22 live 23:18 membawa
//    warning basi MISSING_QUANTITY padahal sudah masuk total); dibersihkan
//    sesudah semua pass agar tidak menyesatkan.
// ---------------------------------------------------------------------------

/** Satuan/kata yang BOLEH muncul di antara angka dalam rumus tanpa memutus
 *  ekspresi aritmetika. Kata lain memutus run sehingga rumus prosa (mis.
 *  "1 unit septic tank + resapan untuk satu rumah tinggal 1 lantai")
 *  TIDAK PERNAH salah-dievaluasi sebagai hitungan. */
const FORMULA_UNIT_WORDS = new Set([
  'm²', 'm2', 'm³', 'm3', "m'", 'm', 'mm', 'cm', 'km',
  'kg', 'gr', 'g', 'ton', 'liter', 'l',
  'titik', 'unit', 'buah', 'bh', 'pcs', 'batang', 'lembar', 'sak',
  'drum', 'set', 'paket', 'lot', 'ls', 'per',
]);

/** Satuan hitung (count): kuantitas harus bilangan bulat; pembulatan ke
 *  atas (ceil) diterima sebagai konsisten dengan rumus — aturan yang sama
 *  dengan estimasi konteks (titik penerangan memakai ceil). */
const COUNT_UNITS = new Set([
  'titik', 'unit', 'buah', 'bh', 'pcs', 'batang', 'lembar', 'sak',
  'drum', 'set', 'paket', 'lot', 'ls',
]);

/** Normalisasi token angka gaya Indonesia: "19,45" → 19.45;
 *  "1.000,50" → 1000.5; "19.45" → 19.45. */
function normalizeFormulaNumberToken(token: string): number | null {
  let t = token;
  const hasDot = t.includes('.');
  const hasComma = t.includes(',');
  if (hasDot && hasComma) t = t.replace(/\./g, '').replace(',', '.');
  else if (hasComma) t = t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

type FormulaToken =
  | { kind: 'num'; value: number }
  | { kind: 'op'; value: string }
  | { kind: 'word'; value: string };

/** Tokenisasi rumus: angka, operator (+ - * / kurung; 'x'/'×' → '*',
 *  '÷'/':' → '/'), kata satuan, dan kata lain (pemutus run). Tanda '±'
 *  diabaikan (penanda perkiraan, bukan operator). */
function tokenizeFormula(text: string): FormulaToken[] {
  const toks: FormulaToken[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '±') { i++; continue; }
    if (ch >= '0' && ch <= '9') {
      const m = /^\d+(?:[.,]\d+)*/.exec(text.slice(i));
      const raw = m![0];
      const n = normalizeFormulaNumberToken(raw);
      if (n == null) return [];
      toks.push({ kind: 'num', value: n });
      i += raw.length;
      continue;
    }
    if (ch === '+' || ch === '-' || ch === '−' || ch === '*' || ch === '/' || ch === '(' || ch === ')') {
      toks.push({ kind: 'op', value: ch === '−' ? '-' : ch });
      i++;
      continue;
    }
    if (ch === '×' || ch === '·') { toks.push({ kind: 'op', value: '*' }); i++; continue; }
    if (ch === '÷' || ch === ':') { toks.push({ kind: 'op', value: '/' }); i++; continue; }
    const wm = /^[A-Za-z²³'"/]+/.exec(text.slice(i));
    if (wm) {
      const w = wm[0];
      if (w === 'x' || w === 'X') toks.push({ kind: 'op', value: '*' });
      else toks.push({ kind: 'word', value: w.toLowerCase() });
      i += w.length;
      continue;
    }
    // Karakter lain ('.', '%', ';', dst.): pemutus run.
    toks.push({ kind: 'word', value: '\u0000' });
    i++;
  }
  return toks;
}

/** Evaluator aritmetika aman (tanpa eval): + - * / dan tanda kurung,
 *  shunting-yard. Mengembalikan null bila ekspresi malformed, pembagian
 *  nol, atau hasil non-finite. */
function evaluateArithmeticTokens(tokens: Array<number | string>): number | null {
  const out: Array<number | string> = [];
  const ops: string[] = [];
  const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };
  let prev: number | string | null = null;
  for (const tok of tokens) {
    if (typeof tok === 'number') {
      out.push(tok);
    } else if (tok === '(') {
      ops.push(tok);
    } else if (tok === ')') {
      let found = false;
      while (ops.length > 0) {
        const op = ops.pop()!;
        if (op === '(') { found = true; break; }
        out.push(op);
      }
      if (!found) return null;
    } else if (tok === '+' || tok === '-' || tok === '*' || tok === '/') {
      // Minus unary (di awal / sesudah operator / sesudah '(') → 0 - x.
      if (tok === '-' && (prev === null || prev === '(' || (typeof prev === 'string' && prev in prec))) {
        out.push(0);
      }
      while (
        ops.length > 0 &&
        ops[ops.length - 1] !== '(' &&
        prec[ops[ops.length - 1]] >= prec[tok]
      ) {
        out.push(ops.pop()!);
      }
      ops.push(tok);
    } else {
      return null;
    }
    prev = tok;
  }
  while (ops.length > 0) {
    const op = ops.pop()!;
    if (op === '(') return null;
    out.push(op);
  }
  const stack: number[] = [];
  for (const tok of out) {
    if (typeof tok === 'number') {
      stack.push(tok);
      continue;
    }
    const b = stack.pop();
    const a = stack.pop();
    if (a === undefined || b === undefined) return null;
    let r: number;
    if (tok === '+') r = a + b;
    else if (tok === '-') r = a - b;
    else if (tok === '*') r = a * b;
    else if (tok === '/') {
      if (b === 0) return null;
      r = a / b;
    } else return null;
    if (!Number.isFinite(r)) return null;
    stack.push(r);
  }
  return stack.length === 1 ? stack[0] : null;
}

/**
 * Hitung ulang kuantitas dari rumus yang dinyatakan, bila rumusnya dapat
 * diparse sebagai aritmetika. KONSERVATIF: hanya ekspresi runtut (angka +
 * operator, diselingi paling banyak kata satuan) yang dievaluasi; bagian
 * sesudah '=' pertama (hasil yang dinyatakan model) tidak ikut dihitung.
 * Rumus prosa, rentang ("150-200"), dan rumus tanpa operator menghasilkan
 * null (tidak dievaluasi — BUKAN dianggap salah). Bila ada dua run valid
 * dengan nilai berbeda, hasilnya ambigu → null. Hasil ≤ 0 / non-finite
 * juga null.
 *
 * Contoh live (item 22, 23:18): "Luas lantai 19,45 m² ÷ ±9 m² per titik
 * = 3 titik" → 19,45/9 ≈ 2,16 → untuk satuan hitung "titik", ceil = 3
 * sehingga nilai 3 KONSISTEN (angka "19" yang terbaca di screenshot
 * adalah glyph '±' yang ter-render kecil — bukan 19 m² per titik).
 */
export function recomputeQuantityFromFormula(formula: string | undefined | null): number | null {
  if (!formula || typeof formula !== 'string') return null;
  const beforeEquals = formula.split('=')[0].trim();
  if (!beforeEquals) return null;
  // Rumus yang seluruhnya hanya satu angka (+ satuan opsional): angka itu
  // sendiri pernyataan kuantitasnya ("86", "80 m2").
  const bare = /^(\d+(?:[.,]\d+)*)\s*[a-z²³'"/]*$/i.exec(beforeEquals);
  if (bare) {
    const n = normalizeFormulaNumberToken(bare[1]);
    return n != null && n > 0 ? n : null;
  }
  const toks = tokenizeFormula(beforeEquals);
  if (toks.length === 0) return null;
  // Bangun run-run aritmetika: rangkaian (angka | operator | kata satuan);
  // kata lain memutus run. Setiap run dievaluasi; bila ada dua run valid
  // dengan nilai berbeda → ambigu → null.
  const values: number[] = [];
  let run: FormulaToken[] = [];
  const flush = () => {
    if (run.length > 0) {
      // Buang kata satuan + operator di ujung (mis. ':' dari label "Rumus:").
      const core = run.filter((t) => !(t.kind === 'word' && FORMULA_UNIT_WORDS.has(t.value)));
      while (core.length > 0 && core[0].kind === 'op' && core[0].value !== '(') core.shift();
      while (core.length > 0 && core[core.length - 1].kind === 'op' && core[core.length - 1].value !== ')') core.pop();
      const nums = core.filter((t) => t.kind === 'num').length;
      const hasOp = core.some((t) => t.kind === 'op' && t.value !== '(' && t.value !== ')');
      if (nums >= 2 && hasOp) {
        const expr = core.map((t) => (t.kind === 'num' ? t.value : (t as { value: string }).value));
        const v = evaluateArithmeticTokens(expr as Array<number | string>);
        if (v != null && v > 0) values.push(v);
      }
    }
    run = [];
  };
  for (const t of toks) {
    if (t.kind === 'word' && !FORMULA_UNIT_WORDS.has(t.value)) flush();
    else run.push(t);
  }
  flush();
  if (values.length === 0) return null;
  const first = values[0];
  // Dua run valid dengan nilai berbeda = ambigu (mis. "2 x 3 dan 4 x 5").
  if (values.some((v) => Math.abs(v - first) > Math.max(0.02 * Math.abs(first), 0.05))) return null;
  return first;
}

/**
 * Cek konsistensi deterministik kuantitas vs rumus yang dinyatakan
 * (keputusan owner: "asal sesuai anggapannya"). Untuk tiap item dengan
 * kuantitas numerik > 0 dan rumus yang dapat diparse:
 * - satuan hitung (titik/unit/buah/dst.): nilai diterima bila sama dengan
 *   floor/round/ceil hasil hitung; bila tidak, dikoreksi ke ceil.
 * - satuan kontinu (m²/m³/m/kg/dst.): nilai diterima dalam toleransi
 *   max(2%, 0,05); bila tidak, dikoreksi ke hasil hitung (2 desimal).
 * Koreksi DICATAT TERBUKA di catatan item (nilai asli model + rumus) dan
 * subtotal/status dihitung ulang lewat helper yang sama dengan pass lain.
 * Rumus yang tidak dapat diparse dilewati (bukan dianggap salah); nilai 0
 * eksplisit tidak pernah diubah. Mengembalikan jumlah item yang dikoreksi.
 */
export function reconcileFullAiQuantityFormulas(items: FullAiItem[]): number {
  let corrected = 0;
  for (const it of items) {
    const value = it.quantity?.value;
    const formula = it.quantity?.formula;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) continue;
    if (!formula || typeof formula !== 'string' || !formula.trim()) continue;
    const recomputed = recomputeQuantityFromFormula(formula);
    if (recomputed == null) continue;
    const unitNorm = (it.quantity.unit || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    let target: number | null = null;
    if (COUNT_UNITS.has(unitNorm)) {
      const candidates = [Math.floor(recomputed), Math.round(recomputed), Math.ceil(recomputed)]
        .filter((n) => n > 0);
      if (!candidates.includes(value)) target = Math.ceil(recomputed);
    } else {
      const tol = Math.max(0.02 * Math.abs(recomputed), 0.05);
      if (Math.abs(value - recomputed) > tol) target = Math.round(recomputed * 100) / 100;
    }
    if (target == null || target === value) continue;
    const original = value;
    it.quantity = {
      ...it.quantity,
      value: target,
      notes: [it.quantity.notes, `Kuantitas dikoreksi dari ${original} ke ${target} ${it.quantity.unit} agar sesuai rumus yang dinyatakan (${formula}). Nilai asli model: ${original}.`]
        .filter(Boolean)
        .join(' '),
    };
    // Blok audit dibangun ulang dari keadaan terkoreksi — KECUALI isian
    // konteks-denah yang audinya membawa jejak isian (rumus aturan
    // konteks konsisten menurut konstruksi sehingga praktis tak pernah
    // terkoreksi; jejak isiannya dipertahankan bila pun terjadi).
    const method = it.quantityAudit?.method ?? it.quantity.quantityAudit?.method;
    if (method !== 'plan-context-estimate') {
      const audit = buildQuantityAudit(adaptFullAiItemForQuantityServices(it));
      it.quantity = { ...it.quantity, quantityAudit: audit };
      it.quantityAudit = audit;
    }
    const { subtotal } = verifySubtotal(it.quantity.value, it.price.unitPrice);
    const { status, exclusionReason } = resolveFullAiItemStatus(
      { value: it.quantity.value, unit: it.quantity.unit, provenance: it.quantity.provenance },
      { unitPrice: it.price.unitPrice, unit: it.price.unit, source: it.price.source },
    );
    const include = status === 'READY' && subtotal != null && subtotal > 0;
    it.subtotal = include ? subtotal : null;
    it.subtotalVerified = include;
    it.status = include ? 'READY' : status;
    it.exclusionReason = include ? null : exclusionReason;
    corrected++;
  }
  return corrected;
}

/**
 * Jaring pengaman deterministik (keputusan owner 2026-11-21 00:48 —
 * "biarin AI yang mengatur", mode Full AI SAJA). Berjalan SESUDAH pass
 * asumsi AI: item yang nilainya MASIH kosong tetapi rumusnya dapat
 * dihitung (parser konservatif yang sama dengan rekonsiliasi — hanya
 * ekspresi runtut) DIISI dari rumus itu. Menutup langsung keadaan live
 * 00:45 ("22 item berumus tetapi kuantitasnya kosong"): rumus sudah ada,
 * nilainya yang kosong — dan pass AI mengembalikan 0 isian.
 *
 * Isian berlabel ASSUMPTION + catatan "dihitung dari rumus yang
 * dinyatakan item" + blok audit bersama (ESTIMATED_FROM_CONTEXT,
 * PENDING) + subtotal dihitung ulang — pola yang sama dengan isian
 * asumsi AI. Satuan hitung (titik/unit/buah/dst.) dibulatkan ke atas
 * (ceil), satuan kontinu dibulatkan 2 desimal — semantik yang sama
 * dengan rekonsiliasi. Rumus yang tidak dapat diparse dilewati (item
 * tetap dikecualikan dengan warning yang sudah ada); item tanpa satuan
 * tidak diisi (tak bisa masuk total tanpa satuan); nilai 0 eksplisit
 * tidak pernah diubah (konsisten dengan rekonsiliasi).
 * Mengembalikan jumlah item yang diisi.
 */
export function fillFullAiQuantitiesFromFormulas(items: FullAiItem[]): number {
  let filled = 0;
  for (const it of items) {
    const value = it.quantity?.value;
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) continue;
    if (!it.quantity?.unit || !it.quantity.unit.trim()) continue;
    const formula = it.quantity?.formula;
    if (!formula || typeof formula !== 'string' || !formula.trim()) continue;
    const recomputed = recomputeQuantityFromFormula(formula);
    if (recomputed == null) continue;
    const unitNorm = (it.quantity.unit || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const target = COUNT_UNITS.has(unitNorm)
      ? Math.ceil(recomputed)
      : Math.round(recomputed * 100) / 100;
    if (!Number.isFinite(target) || target <= 0) continue;
    const original = it.quantity.value;
    it.quantity = {
      ...it.quantity,
      value: target,
      provenance: 'ASSUMPTION',
      confidence: 'MEDIUM',
      assumptions: [...(it.quantity.assumptions ?? []), `Kuantitas dihitung dari rumus yang dinyatakan item (${formula}).`],
      notes: [it.quantity.notes, `Kuantitas dihitung dari rumus yang dinyatakan item (nilai asli: ${original == null ? 'kosong' : original}). Estimasi — bukan fakta gambar.`]
        .filter(Boolean)
        .join(' '),
    };
    const audit = buildQuantityAudit(adaptFullAiItemForQuantityServices(it));
    it.quantity = { ...it.quantity, quantityAudit: audit };
    it.quantityAudit = audit;
    const { subtotal } = verifySubtotal(it.quantity.value, it.price.unitPrice);
    const { status, exclusionReason } = resolveFullAiItemStatus(
      { value: it.quantity.value, unit: it.quantity.unit, provenance: it.quantity.provenance },
      { unitPrice: it.price.unitPrice, unit: it.price.unit, source: it.price.source },
    );
    const include = status === 'READY' && subtotal != null && subtotal > 0;
    it.subtotal = include ? subtotal : null;
    it.subtotalVerified = include;
    it.status = include ? 'READY' : status;
    it.exclusionReason = include ? null : exclusionReason;
    filled++;
  }
  return filled;
}

/**
 * Hapus warning eksklusi "tidak masuk total" yang sudah BASI — yaitu
 * warning untuk item yang kini masuk total sesudah pass penyelesaian.
 * Warning dipertahankan bila ada SATU SAJA item bernama sama yang masih
 * dikecualikan (nama duplikat). Warning lain tidak disentuh.
 */
export function dropStaleExclusionWarnings(warnings: string[], items: FullAiItem[]): string[] {
  const includedByName = new Map<string, boolean>();
  for (const it of items) {
    const included = it.subtotal != null && it.subtotal > 0;
    includedByName.set(it.name, (includedByName.get(it.name) ?? true) && included);
  }
  return warnings.filter((w) => {
    const m = /^Item "(.+)" tidak masuk total \[[A-Z_]+\]$/.exec(w);
    if (!m) return true;
    return includedByName.get(m[1]) !== true;
  });
}

export interface FullAiQuantityAssumptionDeps {
  execute: typeof aiToolsProviderClient.execute;
  productId: 'DED_AI_FAST' | 'DED_AI_DETAIL';
  timeoutMs: number;
  projectType: string;
}

export interface FullAiQuantityAssumptionResult {
  attempted: number;
  filled: number;
  failed: boolean;
  failureMessage?: string;
  unfilled: number;
}

/**
 * Pass asumsi kuantitas AI (keputusan owner 2026-11-20 23:18 — mode
 * Full AI SAJA). Berjalan SESUDAH completeFullAiQuantities: untuk item
 * yang kuantitasnya MASIH kosong (aturan konteks tidak mencakupnya /
 * tidak ada konteks denah), SATU panggilan AI tambahan meminta model
 * mengisi kuantitas asumsi + rumus + dasar asumsi per item. Isian selalu
 * provenance ASSUMPTION + formula + dasar + catatan nilai asli, dengan
 * blok audit bersama (klasifikasi ESTIMATED_FROM_CONTEXT, metode
 * 'ai-inference-or-assumption', verifikasi UNVERIFIED, persetujuan
 * PENDING) — tidak pernah menyamar sebagai fakta gambar. Sejak
 * keputusan owner 2026-11-21 00:48 prompt TIDAK LAGI memberi jalan
 * keluar null (wajib isi semua) dan rumus yang sudah dimiliki item
 * disertakan; validasi tetap menolak isian tanpa angka positif /
 * tanpa dasar (asumsi tanpa dasar bukan asumsi) dan item tanpa satuan
 * tetap tidak dimintakan asumsi. Kegagalan transport/parse TIDAK
 * menggagalkan run: dikembalikan failed + pesan, pemanggil mencatat
 * warning jujur. Tanpa item kosong → tanpa panggilan AI.
 */
export async function completeFullAiQuantitiesWithAi(
  items: FullAiItem[],
  deps: FullAiQuantityAssumptionDeps,
): Promise<FullAiQuantityAssumptionResult> {
  const missing = items.filter(
    (it) => it.quantity?.value == null && (it.quantity?.unit || '').trim() !== '',
  );
  if (missing.length === 0) {
    return { attempted: 0, filled: 0, failed: false, unfilled: 0 };
  }
  const ctx = derivePlanContext(items.map(adaptFullAiItemForQuantityServices));
  const contextLines: string[] = [];
  if (ctx.floorAreaM2 != null) contextLines.push(`Luas lantai diketahui ±${ctx.floorAreaM2} m²`);
  if (ctx.ceilingAreaM2 != null) contextLines.push(`Luas plafon diketahui ±${ctx.ceilingAreaM2} m²`);
  if (ctx.buildingPerimeterM != null) contextLines.push(`Keliling bangunan diketahui ±${ctx.buildingPerimeterM} m`);
  if (ctx.roomCount != null) contextLines.push(`Jumlah ruang diketahui ${ctx.roomCount} ruang`);
  if (ctx.doorUnits != null) contextLines.push(`Jumlah pintu diketahui ${ctx.doorUnits} unit`);
  const built = buildFullAiQuantityAssumptionPrompt({
    projectType: deps.projectType,
    contextLines,
    items: missing.map((it) => ({ no: it.no, name: it.name, unit: it.quantity.unit, category: it.category, formula: it.quantity.formula })),
  });
  const result = await deps.execute({
    productId: deps.productId,
    prompt: built.prompt,
    systemPrompt: built.system,
    jsonMode: true,
    maxTokens: 4000,
    timeoutMs: deps.timeoutMs,
  });
  if (!result.success) {
    return {
      attempted: missing.length,
      filled: 0,
      failed: true,
      failureMessage: result.message || result.errorCode || 'AI gagal memproses',
      unfilled: missing.length,
    };
  }
  let parsed: any;
  try {
    parsed = aiToolsProviderClient.extractJson(result.content);
  } catch {
    return {
      attempted: missing.length,
      filled: 0,
      failed: true,
      failureMessage: 'Respons asumsi kuantitas bukan JSON valid',
      unfilled: missing.length,
    };
  }
  const fills: Array<{ no?: unknown; qty?: unknown; formula?: unknown; basis?: unknown }> =
    Array.isArray(parsed?.fills) ? parsed.fills : [];
  const byNo = new Map<number, FullAiItem>();
  for (const it of missing) byNo.set(it.no, it);
  let filled = 0;
  for (const fill of fills) {
    const it = byNo.get(fill?.no as number);
    if (!it) continue;
    const qty = fill?.qty;
    const formula = typeof fill?.formula === 'string' ? fill.formula.trim() : '';
    const basis = typeof fill?.basis === 'string' ? fill.basis.trim() : '';
    // Tanpa angka positif atau tanpa dasar yang dinyatakan → tidak diisi
    // (asumsi tanpa dasar bukan asumsi — item tetap dikecualikan jujur).
    if (typeof qty !== 'number' || !Number.isFinite(qty) || qty <= 0) continue;
    if (!formula && !basis) continue;
    const original = it.quantity.value;
    it.quantity = {
      ...it.quantity,
      value: qty,
      formula: formula || basis,
      provenance: 'ASSUMPTION',
      confidence: 'MEDIUM',
      assumptions: basis ? [...(it.quantity.assumptions ?? []), basis] : it.quantity.assumptions,
      notes: [it.quantity.notes, `Kuantitas dilengkapi dari asumsi AI (nilai asli: ${original == null ? 'kosong' : original}). Estimasi — bukan fakta gambar.`]
        .filter(Boolean)
        .join(' '),
    };
    const audit = buildQuantityAudit(adaptFullAiItemForQuantityServices(it));
    it.quantity = { ...it.quantity, quantityAudit: audit };
    it.quantityAudit = audit;
    const { subtotal } = verifySubtotal(it.quantity.value, it.price.unitPrice);
    const { status, exclusionReason } = resolveFullAiItemStatus(
      { value: it.quantity.value, unit: it.quantity.unit, provenance: it.quantity.provenance },
      { unitPrice: it.price.unitPrice, unit: it.price.unit, source: it.price.source },
    );
    const include = status === 'READY' && subtotal != null && subtotal > 0;
    it.subtotal = include ? subtotal : null;
    it.subtotalVerified = include;
    it.status = include ? 'READY' : status;
    it.exclusionReason = include ? null : exclusionReason;
    filled++;
    byNo.delete(fill.no as number); // satu isian per item (duplikat no diabaikan)
  }
  return { attempted: missing.length, filled, failed: false, unfilled: missing.length - filled };
}

// ---------------------------------------------------------------------------
// SPRINT 4 — Paritas penyelesaian harga ded-full-ai dengan pipeline standar
// ---------------------------------------------------------------------------

/**
 * Bangun blok DedPriceCompletion untuk isian referensi eksternal —
 * semantik yang sama dengan applyReference di priceCompletion.ts
 * pipeline standar: referensi segar → MARKET_REFERENCE; referensi basi
 * → AI_ESTIMATE berpenanda sourceStale + keyakinan LOW; sourceKind
 * diturunkan priceSourceKindFor (tier SUPPLIER_MANUFACTURER →
 * VERIFIED_SUPPLIER, CONTRACTOR_MARKET → MARKET_REFERENCE); status
 * verifikasi UNVERIFIED (referensi pasar BUKAN AHSP resmi); persetujuan
 * PENDING (tidak pernah disetujui diam-diam); harga asli tercatat agar
 * penolakan dapat memulihkan.
 */
export function buildFullAiPriceCompletion(
  ref: ExternalPriceReference,
  opts: {
    originalUnitPrice: number | null;
    originalQuantity?: number | null;
    now?: Date;
    ahspRelated?: boolean;
  },
): DedPriceCompletion {
  const now = opts.now ?? new Date();
  const stale = referenceIsStale(ref, now);
  const classification = stale ? ('AI_ESTIMATE' as const) : ('MARKET_REFERENCE' as const);
  return {
    classification,
    sourceKind: priceSourceKindFor(classification, ref.tier),
    verificationStatus: 'UNVERIFIED',
    userApprovalStatus: 'PENDING',
    recommendedPrice: ref.recommendedPrice,
    rangeMin: ref.rangeMin,
    rangeMax: ref.rangeMax,
    unit: ref.unit,
    scope: ref.scope,
    sourceName: ref.sourceName,
    sourceUrl: ref.sourceUrl,
    sourceDate: ref.sourceDate,
    accessedAt: ref.accessedAt,
    region: ref.region,
    specAssumption: ref.specAssumption,
    confidence: stale ? 'LOW' : ref.confidence,
    method: 'fallback referensi eksternal terkurasi (hierarki tingkat 3–5) — jalur ded-full-ai',
    ahspRelated: opts.ahspRelated ?? false,
    referenceId: ref.id,
    sourceStale: stale || undefined,
    originalUnitPrice: opts.originalUnitPrice,
    originalQuantity: opts.originalQuantity ?? null,
    history: [],
  };
}

/**
 * Blok penanda konflik spesifikasi — cermin blok NEEDS_VERIFICATION
 * completeDedItem pipeline standar: harga TIDAK dipaksa terisi, tetapi
 * alasan gugurnya referensi tercatat terstruktur (bukan hilang diam-
 * diam seperti perilaku Full AI sebelum Sprint 4).
 */
export function buildFullAiConflictPriceCompletion(
  ref: ExternalPriceReference,
  reason: string,
  opts: {
    originalUnitPrice: number | null;
    originalQuantity?: number | null;
    unit: string;
    now?: Date;
    ahspRelated?: boolean;
  },
): DedPriceCompletion {
  const nowIso = (opts.now ?? new Date()).toISOString().slice(0, 10);
  return {
    classification: 'PRICE_UNRESOLVED',
    sourceKind: 'UNRESOLVED',
    verificationStatus: 'NEEDS_VERIFICATION',
    userApprovalStatus: 'NOT_REQUIRED',
    recommendedPrice: null,
    rangeMin: null,
    rangeMax: null,
    unit: opts.unit,
    scope: 'TIDAK_DINYATAKAN',
    accessedAt: nowIso,
    confidence: 'LOW',
    method: `referensi ${ref.id} ditolak: ${reason} — harga dibiarkan kosong menunggu verifikasi spesifikasi`,
    ahspRelated: opts.ahspRelated ?? false,
    referenceId: ref.id,
    specAssumption: ref.specAssumption,
    originalUnitPrice: opts.originalUnitPrice,
    originalQuantity: opts.originalQuantity ?? null,
    history: [],
  };
}

/** Catatan harga string untuk isian referensi (dipertahankan dari
 *  perilaku Hardening: mapper finalisasi RAB membaca price.notes). */
function externalFillNote(ref: ExternalPriceReference, stale: boolean): string {
  const staleNote = stale
    ? ' PERINGATAN: referensi ini BASI (tanggal riset melewati masa segar 30 hari) — perlakukan sebagai estimasi AI berkeyakinan rendah.'
    : '';
  return `Estimasi AI dari referensi pasar eksternal: ${ref.sourceName} (${ref.sourceUrl}), data ${ref.sourceDate}, diambil ${ref.accessedAt}; rentang Rp${ref.rangeMin.toLocaleString('id-ID')}–${ref.rangeMax.toLocaleString('id-ID')}/${ref.unit}, cakupan ${ref.scope === 'TERPASANG_PENUH' ? 'terpasang penuh' : 'material saja'}. Asumsi spek: ${ref.specAssumption} Bukan harga resmi AHSP.${staleNote}`;
}

/**
 * Terapkan SATU referensi eksternal ke item Full AI: harga terisi
 * sebagai AI_ESTIMATE (field source Full AI tidak berubah kosakatanya)
 * + blok DedPriceCompletion terstruktur di price.priceCompletion DAN
 * cerminannya di item.priceCompletion + penanda filledFromExternalRef.
 * Subtotal/status dihitung ulang dengan aturan loop utama yang sama.
 * Mengembalikan item BARU; item masukan tidak diubah.
 */
export function applyFullAiExternalReference(
  item: FullAiItem,
  ref: ExternalPriceReference,
  opts: { now?: Date } = {},
): FullAiItem {
  const now = opts.now ?? new Date();
  const stale = referenceIsStale(ref, now);
  const completion = buildFullAiPriceCompletion(ref, {
    originalUnitPrice: item.price.unitPrice,
    originalQuantity: item.quantity.value,
    now,
    ahspRelated: Boolean(item.price.ahspCode || item.price.ahspMatch),
  });
  const price = {
    ...item.price,
    unitPrice: ref.recommendedPrice,
    unit: ref.unit,
    source: 'AI_ESTIMATE' as const,
    region: ref.region,
    period: ref.accessedAt,
    notes: externalFillNote(ref, stale),
    filledFromExternalRef: true,
    priceCompletion: completion,
  };
  const { subtotal } = verifySubtotal(item.quantity.value, price.unitPrice);
  const { status, exclusionReason } = resolveFullAiItemStatus(
    { value: item.quantity.value, unit: item.quantity.unit, provenance: item.quantity.provenance },
    { unitPrice: price.unitPrice, unit: price.unit, source: price.source },
  );
  const include = status === 'READY' && subtotal != null && subtotal > 0;
  return {
    ...item,
    price,
    priceCompletion: completion,
    subtotal: include ? subtotal : null,
    subtotalVerified: include,
    status: include ? 'READY' : status,
    exclusionReason: include ? null : exclusionReason,
  };
}

/**
 * Pass penyelesaian harga Full AI (SPRINT 4) — padanan completeDedItem
 * untuk jalur ini, berjalan atas item yang sudah terbentuk:
 * - hanya item berharga kosong & bukan USER_INPUT yang dilengkapi;
 * - pencocokan memakai findExternalReference BERSAMA (penjaga konflik
 *   referenceSpecConflict di dalamnya — jalur yang sama dengan standar);
 * - referensi yang gugur konflik TIDAK mengisi harga, tetapi item
 *   membawa blok NEEDS_VERIFICATION lewat findConflictingReference
 *   bersama (paritas Tahap 2 pipeline standar);
 * - harga kanonis AHSP / manual tidak pernah disentuh (tidak kosong).
 * Mengembalikan jumlah harga yang terisi (blok konflik tidak dihitung).
 *
 * §7 (G-IS-5, C3): bila `opts.rabMode` adalah FULL_AI, fungsi ini TIDAK
 * memakai referensi internal sama sekali — mengembalikan 0 dan item
 * dibiarkan apa adanya. Tanpa rabMode, perilaku lama dipertahankan.
 */
export function completeFullAiPrices(
  items: FullAiItem[],
  opts: { now?: Date; rabMode?: DedRabAiMode } = {},
): number {
  if (opts.rabMode !== undefined && !canUseExternalPriceReferences(opts.rabMode)) {
    return 0;
  }
  let filled = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.price.unitPrice != null || it.price.source === 'USER_INPUT') continue;
    const ref = findExternalReference(it.name, it.quantity.unit);
    if (ref) {
      items[i] = applyFullAiExternalReference(it, ref, opts);
      filled++;
      continue;
    }
    const conflict = findConflictingReference(it.name, it.quantity.unit);
    if (conflict) {
      const completion = buildFullAiConflictPriceCompletion(conflict.ref, conflict.reason, {
        originalUnitPrice: it.price.unitPrice,
        originalQuantity: it.quantity.value,
        unit: it.quantity.unit,
        now: opts.now,
        ahspRelated: Boolean(it.price.ahspCode || it.price.ahspMatch),
      });
      items[i] = {
        ...it,
        price: { ...it.price, priceCompletion: completion },
        priceCompletion: completion,
      };
    }
  }
  return filled;
}

/** Blok penyelesaian harga efektif item (bersarang atau cerminan item). */
export function fullAiPriceCompletionOf(item: FullAiItem): DedPriceCompletion | undefined {
  return item.price.priceCompletion ?? item.priceCompletion;
}

/** Blok audit kuantitas efektif item (bersarang atau cerminan item). */
export function fullAiQuantityAuditOf(item: FullAiItem) {
  return item.quantity.quantityAudit ?? item.quantityAudit;
}

/**
 * Terima penyelesaian Full AI (SPRINT 4) — padanan acceptCompletion
 * pipeline standar: aksi pengguna EKSPLISIT yang menandai blok harga &
 * audit kuantitas APPROVED. Nilai usulan diterima apa adanya; status
 * VERIFIKASI tidak berubah (referensi pasar tidak menjadi AHSP resmi,
 * estimasi konteks tidak menjadi fakta gambar) dan sumber harga item
 * tidak berubah. Tanpa blok penyelesaian, item dikembalikan apa adanya.
 */
export function acceptFullAiCompletion(item: FullAiItem): FullAiItem {
  const pc = fullAiPriceCompletionOf(item);
  const qa = fullAiQuantityAuditOf(item);
  if (!pc && !qa) return item;
  const nextPc = pc ? { ...pc, userApprovalStatus: 'APPROVED' as const } : undefined;
  const nextQa = qa ? { ...qa, userApprovalStatus: 'APPROVED' as const } : undefined;
  return {
    ...item,
    price: nextPc ? { ...item.price, priceCompletion: nextPc } : item.price,
    priceCompletion: nextPc,
    quantity: nextQa ? { ...item.quantity, quantityAudit: nextQa } : item.quantity,
    quantityAudit: nextQa,
  };
}

/**
 * Tolak penyelesaian Full AI (SPRINT 4) — padanan rejectCompletion
 * pipeline standar: pulihkan nilai asli & cabut blok isian.
 * - Isian harga (penanda filledFromExternalRef / referenceId pada blok):
 *   harga kembali ke originalUnitPrice blok (isian jalur ini selalu
 *   dari kosong → null, sumber kembali UNRESOLVED), blok dicabut.
 * - Isian kuantitas (metode audit 'plan-context-estimate'): kuantitas
 *   kembali ke originalQuantity audit, provenans kembali UNRESOLVED,
 *   blok audit dicabut.
 * - Blok konflik NEEDS_VERIFICATION (harga tidak pernah terisi):
 *   menolaknya hanya mencabut blok penanda; harga tidak berubah.
 * Adaptasi yang disengaja dari standar: rejectCompletion standar hanya
 * berjalan bila priceCompletion ada (isian kuantitas standar selalu
 * menempelkan blok harga lewat quantityBasis); di jalur Full AI isian
 * kuantitas dapat berdiri sendiri, jadi penolakan di sini berjalan
 * bila SALAH SATU blok ada. Subtotal/status dihitung ulang sesudahnya.
 */
export function rejectFullAiCompletion(item: FullAiItem): FullAiItem {
  const pc = fullAiPriceCompletionOf(item);
  const qa = fullAiQuantityAuditOf(item);
  if (!pc && !qa) return item;
  const hadPriceFill = Boolean(
    item.price.filledFromExternalRef || (pc && pc.referenceId && pc.recommendedPrice != null),
  );
  const hadQuantityFill = qa?.method === 'plan-context-estimate';
  const hadConflictBlock = Boolean(pc && pc.verificationStatus === 'NEEDS_VERIFICATION' && !hadPriceFill);
  if (!hadPriceFill && !hadQuantityFill && !hadConflictBlock) return item;

  let price = item.price;
  let quantity = item.quantity;
  if (hadPriceFill && pc) {
    const restored = pc.originalUnitPrice ?? null;
    price = {
      ...price,
      unitPrice: restored,
      source: restored != null ? price.source : ('UNRESOLVED' as const),
      notes: 'Penyelesaian AI ditolak pengguna — harga dikembalikan ke keadaan sebelum penyelesaian.',
      filledFromExternalRef: undefined,
      priceCompletion: undefined,
    };
  } else if (hadConflictBlock) {
    price = { ...price, priceCompletion: undefined };
  }
  if (hadQuantityFill && qa) {
    quantity = {
      ...quantity,
      value: qa.originalQuantity ?? null,
      provenance: 'UNRESOLVED' as const,
      quantityAudit: undefined,
    };
  }
  const next: FullAiItem = {
    ...item,
    price,
    quantity,
    priceCompletion: hadPriceFill || hadConflictBlock ? undefined : item.priceCompletion,
    quantityAudit: hadQuantityFill ? undefined : item.quantityAudit,
  };
  const { subtotal } = verifySubtotal(next.quantity.value, next.price.unitPrice);
  const { status, exclusionReason } = resolveFullAiItemStatus(
    { value: next.quantity.value, unit: next.quantity.unit, provenance: next.quantity.provenance },
    { unitPrice: next.price.unitPrice, unit: next.price.unit, source: next.price.source },
  );
  const include = status === 'READY' && subtotal != null && subtotal > 0;
  return {
    ...next,
    subtotal: include ? subtotal : null,
    subtotalVerified: include,
    status: include ? 'READY' : status,
    exclusionReason: include ? null : exclusionReason,
  };
}

/**
 * Gerbang kebijakan harga mesin Full AI (§7, G-IS-2) — kini gerbang NYATA,
 * bukan lagi no-op pass-through.
 *
 * - EZRAB_AI: harga diteruskan apa adanya; adapter kanonis yang memutuskan
 *   (kanonis RESOLVED menang, klaim gagal turun jadi estimasi AI).
 *   Perilaku lama persis, termasuk untuk pemanggil 2-argumen lama.
 * - FULL_AI: klaim harga database (AHSP_2026 / VERIFIED_SOURCE) TIDAK
 *   dapat dikonfirmasi tanpa katalog — diturunkan jadi AI_ESTIMATE,
 *   kode AHSP dicabut, angka model dipertahankan (angka model tetap
 *   angka model, hanya labelnya yang jujur), dengan catatan alasannya.
 *   USER_INPUT / AI_ESTIMATE / UNRESOLVED diteruskan apa adanya.
 *
 * Tidak pernah memutasi objek harga masukan: bila menurunkan klaim,
 * mengembalikan objek BARU. Mode eksplisit menang; bila absen, diturunkan
 * dari policy (DATABASE → EZRAB_AI, selain itu FULL_AI).
 */
export function applyFullAiPricePolicy(
  policy: DedEstimationPolicy | undefined,
  price: any,
  rabMode?: DedRabAiMode,
): any {
  const mode = rabMode ?? modeFromPolicy(policy);
  if (canUseCanonicalCatalog(mode)) return price;
  if (price == null || typeof price !== 'object') return price;
  if (price.source === 'AHSP_2026' || price.source === 'VERIFIED_SOURCE') {
    return {
      ...price,
      source: 'AI_ESTIMATE',
      ahspCode: undefined,
      notes: [
        price.notes,
        'Klaim harga database tidak dikonfirmasi di mode Full AI (tanpa akses katalog AHSP) — diperlakukan sebagai estimasi AI.',
      ]
        .filter(Boolean)
        .join(' '),
    };
  }
  return price;
}

/**
 * Resolusi harga satu item Full AI (§7, G-IS-1) — SATU-SATUNYA tempat
 * runExecute mencapai adapter kanonis. Dipisah dari loop agar gerbangnya
 * dapat dibuktikan dengan spy pada boundary (suite w5FullAiIsolation):
 * `deps` memungkinkan penyuntikan resolver tiruan; defaultnya adapter
 * kanonis yang sesungguhnya.
 *
 * - EZRAB_AI: perilaku lama persis — matchDedItemToAhsp lalu
 *   resolveDedPriceWithCanonical; kanonis RESOLVED menang atas estimasi AI.
 * - FULL_AI: adapter TIDAK dipanggil sama sekali (deps tidak disentuh) —
 *   estimasi AI dipertahankan; klaim kanonis yang lolos gerbang (pertahanan
 *   kedua) dinormalisasi jadi AI_ESTIMATE; kode AHSP dicabut karena tak
 *   dapat dikonfirmasi; ahspMatch undefined (tidak ada kandidat review).
 *
 * USER_INPUT tidak masuk ke sini — loop menanganinya sebelum memanggil
 * fungsi ini dan tidak pernah ditimpa di mode mana pun.
 */
export interface FullAiCanonicalDeps {
  matchItem?: (input: DedItemForMatch) => CanonicalDedMatch;
  resolvePrice?: (
    policy: DedEstimationPolicy,
    match: CanonicalDedMatch,
    fallback: DedPriceFallback,
  ) => DedPriceDecision;
}

export function resolveFullAiItemPrice(args: {
  rabMode: DedRabAiMode;
  policy: DedEstimationPolicy;
  name: string;
  quantityUnit: string;
  description?: string;
  claimedAhspCode?: string;
  price: {
    unitPrice: number | null;
    unit: string;
    source: string;
    region?: string;
    period?: string;
    notes?: string;
    ahspCode?: string;
  };
  deps?: FullAiCanonicalDeps;
}): {
  finalPrice: {
    unitPrice: number | null;
    unit: string;
    source: FullAiPriceSource;
    region?: string;
    period?: string;
    ahspCode?: string;
    notes?: string;
  };
  ahspMatch?: CanonicalDedMatch;
} {
  const { rabMode, policy, price } = args;
  if (!canUseCanonicalCatalog(rabMode)) {
    // FULL_AI: tanpa adapter — estimasi AI dipertahankan apa adanya.
    // Pertahanan kedua bila klaim kanonis lolos gerbang harga: labelnya
    // dinormalisasi jadi AI_ESTIMATE (angka tetap angka model).
    const source: FullAiPriceSource =
      price.source === 'AHSP_2026' || price.source === 'VERIFIED_SOURCE'
        ? 'AI_ESTIMATE'
        : price.source === 'AI_ESTIMATE' || price.source === 'UNRESOLVED'
          ? price.source
          : 'UNRESOLVED';
    return {
      finalPrice: {
        unitPrice: price.unitPrice,
        unit: price.unit,
        source,
        region: price.region,
        period: price.period,
        ahspCode: undefined,
        notes: price.notes,
      },
      ahspMatch: undefined,
    };
  }
  const matchItem = args.deps?.matchItem ?? matchDedItemToAhsp;
  const resolvePrice = args.deps?.resolvePrice ?? resolveDedPriceWithCanonical;
  const match = matchItem({
    name: args.name,
    unit: args.quantityUnit,
    specification: args.description,
    claimedAhspCode: args.claimedAhspCode,
  });
  const decision = resolvePrice(policy, match, {
    unitPrice: price.unitPrice,
    source: price.source,
    unit: price.unit,
    notes: price.notes,
    ahspCode: price.ahspCode,
  });
  return {
    finalPrice: {
      unitPrice: decision.unitPrice,
      unit: decision.unit || args.quantityUnit,
      source: decision.source,
      region: decision.source === 'AHSP_2026' ? 'Nasional' : price.region,
      period: decision.source === 'AHSP_2026' ? '2026' : price.period,
      ahspCode: decision.ahspCode,
      notes: decision.notes,
    },
    ahspMatch: match,
  };
}

/**
 * Status + alasan eksklusi satu item Full AI — FUNGSI MURNI yang dipakai
 * service (runExecute) DAN layar hasil (konfirmasi kandidat AHSP), agar
 * keduanya memakai aturan yang persis sama. Disalin dari rantai status
 * inline runExecute (F4 3.7); jangan ubah satu sisi tanpa sisi lain —
 * fungsi inilah satu-satunya sumber aturan ini.
 */
export function resolveFullAiItemStatus(
  quantity: { value: unknown; unit: unknown; provenance: unknown },
  price: { unitPrice: unknown; unit: unknown; source: unknown },
): { status: FullAiItem['status']; exclusionReason: FullAiItem['exclusionReason'] } {
  const qValue = quantity.value;
  const qUnit = typeof quantity.unit === 'string' ? quantity.unit : '';
  const qProv = quantity.provenance;
  const pPrice = price.unitPrice;
  const pUnit = typeof price.unit === 'string' ? price.unit : '';
  const pSource = price.source;
  let status: FullAiItem['status'] = 'READY';
  let exclusionReason: FullAiItem['exclusionReason'] = null;
  if (qValue == null) {
    status = 'UNRESOLVED';
    exclusionReason = 'MISSING_QUANTITY';
  } else if (typeof qValue !== 'number' || !Number.isFinite(qValue) || qValue < 0) {
    status = 'UNRESOLVED';
    exclusionReason = 'INVALID_QUANTITY';
  } else if (!qUnit) {
    status = 'UNRESOLVED';
    exclusionReason = 'MISSING_UNIT';
  } else if (qProv === 'UNRESOLVED') {
    status = 'UNRESOLVED';
    exclusionReason = 'UNRESOLVED_PROVENANCE';
  } else if (qProv === 'NEEDS_CONFIRMATION') {
    status = 'NEEDS_CONFIRMATION';
    exclusionReason = 'NEEDS_CONFIRMATION';
  } else if (pPrice == null) {
    status = 'NEEDS_CONFIRMATION';
    exclusionReason = 'MISSING_UNIT_PRICE';
  } else if (typeof pPrice !== 'number' || !Number.isFinite(pPrice)) {
    status = 'NEEDS_CONFIRMATION';
    exclusionReason = 'INVALID_UNIT_PRICE';
  } else if (pPrice < 0) {
    status = 'NEEDS_CONFIRMATION';
    exclusionReason = 'INVALID_UNIT_PRICE';
  } else if (pSource === 'UNRESOLVED') {
    status = 'NEEDS_CONFIRMATION';
    exclusionReason = 'PRICE_UNRESOLVED';
  } else if (pUnit && qUnit) {
    const norm = (u: string) => u.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (norm(pUnit) !== norm(qUnit)) {
      status = 'NEEDS_CONFIRMATION';
      exclusionReason = 'INVALID_PRICE_UNIT';
    }
  }
  return { status, exclusionReason };
}

export const fullAiDedService = new FullAiDedService();

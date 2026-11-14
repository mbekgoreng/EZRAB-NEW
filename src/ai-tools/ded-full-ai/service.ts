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
 * satu panggilan AI, bukan pass terpisah; QC tanpa loop revisi
 * (revisionIterations selalu 0).
 */
import { aiToolsProviderClient } from '../providerClient';
import { waitForMinimum, minDelayFor } from '../aiResponseTiming';
import { parseDedPdf } from '../ded-ai-estimate/parser';
import { PAGE_TYPE_PRIORITY, formatPageRanges } from '../ded-ai-estimate/analysisTrace';
import { buildFullAiPrompt } from './prompts';
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

// Batas karakter dengan strategi chunking yang transparan
const MAX_TOTAL_CHARS = 60000;  // Lebih besar dari pipeline lama (15000)
const MAX_PAGE_CHARS = 4000;

/**
 * F4 (3.3): batas waktu per panggilan AI yang BENAR-BENAR diterapkan.
 * providerClient membatasi semua permintaan pada plafon 180 detik
 * (MAX_TIMEOUT_MS di gateway client) — meminta 240 detik untuk mode
 * Mendalam dulu dipotong diam-diam sehingga timeout selalu tampak seperti
 * "model lambat". Sekarang permintaan disamakan dengan plafon nyata dan
 * batasnya dinyatakan terbuka di metadata hasil (provenance.timeoutLimitMs)
 * serta peringatan mode Mendalam.
 */
export const FULL_AI_TIMEOUT_MS = {
  FAST: 120000,
  ADVANCED: 180000,
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

export interface FullAiDocumentText {
  text: string;
  totalChars: number;
  /** Ada konten yang tidak terkirim/terpotong (budget, per-halaman, atau halaman kosong). */
  truncated: boolean;
  /** Halaman yang terkirim ke model (seleksi prioritas). */
  includedPages: number[];
  /** Halaman tidak terkirim karena budget karakter habis. */
  skippedPages: number[];
  /** Halaman yang teksnya dipotong pada batas per-halaman. */
  truncatedPages: number[];
  /** Halaman tanpa lapisan teks (scan/gambar) — tidak dapat dianalisis tanpa OCR. */
  emptyTextPages: number[];
}

/**
 * F4 (3.4): seleksi halaman BERPRIORITAS, menggantikan potongan sekuensial
 * lama yang berhenti di halaman pertama yang tidak muat (halaman akhir —
 * sering berisi spesifikasi/jadwal/daftar material — tidak pernah
 * dianalisis, tanpa jejak halaman mana yang hilang).
 *
 * Mengikuti pendekatan pipeline multi-pass (analysisTrace.PAGE_TYPE_PRIORITY):
 * halaman berisi daftar pekerjaan/spesifikasi/jadwal (denah, struktur,
 * kusen, MEP, spesifikasi, …) didahulukan dalam budget; sisanya menyusul
 * sampai budget habis. Teks yang dikirim tetap disusun menurut urutan
 * halaman asli dokumen. Setiap halaman yang terlewat/potong/kosong tercatat
 * eksplisit agar dapat diperingatkan dengan rentang halamannya.
 */
export function buildDocumentText(
  pages: Array<{ page: number; text: string; pageType?: string }>
): FullAiDocumentText {
  const emptyTextPages: number[] = [];
  const withText = pages.filter((p) => {
    if ((p.text || '').trim()) return true;
    emptyTextPages.push(p.page);
    return false;
  });

  const byPriority = [...withText].sort(
    (a, b) =>
      (PAGE_TYPE_PRIORITY[a.pageType || 'HALAMAN'] ?? 10) -
        (PAGE_TYPE_PRIORITY[b.pageType || 'HALAMAN'] ?? 10) ||
      a.page - b.page
  );

  const included = new Map<number, string>();
  const skippedPages: number[] = [];
  const truncatedPages: number[] = [];
  let totalChars = 0;
  let budgetExhausted = false;

  for (const p of byPriority) {
    const fullText = p.text || '';
    const pageText = fullText.slice(0, MAX_PAGE_CHARS);
    if (!budgetExhausted && totalChars + pageText.length > MAX_TOTAL_CHARS) {
      budgetExhausted = true;
    }
    if (budgetExhausted) {
      skippedPages.push(p.page);
      continue;
    }
    if (fullText.length > MAX_PAGE_CHARS) truncatedPages.push(p.page);
    included.set(p.page, pageText);
    totalChars += pageText.length;
  }

  const includedPages = [...included.keys()].sort((a, b) => a - b);
  const parts = includedPages.map(
    (n) => `--- Halaman ${n} ---\n${included.get(n)}`
  );

  return {
    text: parts.join('\n\n'),
    totalChars,
    truncated:
      skippedPages.length > 0 || truncatedPages.length > 0 || emptyTextPages.length > 0,
    includedPages,
    skippedPages: skippedPages.sort((a, b) => a - b),
    truncatedPages: truncatedPages.sort((a, b) => a - b),
    emptyTextPages: emptyTextPages.sort((a, b) => a - b),
  };
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
      notify('PARSE', 10, 'Membaca dokumen DED...');
      const parsed = await parseDedPdf(options.buffer, options.fileName, { withImages: false });

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

      // §6 Tahap 1 (lanjutan): siapkan teks dengan seleksi halaman berprioritas (F4 3.4/3.6)
      const doc = buildDocumentText(
        pages.map((p: any) => ({ page: p.page, text: p.text || '', pageType: p.pageType }))
      );
      const docText = doc.text;
      const totalChars = doc.totalChars;
      markStage(
        'DOCUMENT_INTELLIGENCE',
        'done',
        `${pages.length} halaman dibaca; ${doc.includedPages.length} halaman terkirim ke model (${totalChars.toLocaleString('id-ID')} karakter)` +
          (doc.truncated ? '; sebagian halaman terpotong/kosong (lihat warnings).' : '.'),
      );

      const warnings: string[] = [];
      if (pageScopeApplied) {
        warnings.push(
          `Cakupan halaman dibatasi pilihan pengguna: ${pageScopeApplied.length} dari ${documentTotalPages} halaman dianalisis (halaman ${formatPageRanges(pageScopeApplied)}). Halaman lain TIDAK dianalisis.`
        );
      }
      if (doc.skippedPages.length > 0) {
        warnings.push(
          `Halaman tidak terkirim ke AI karena batas ${MAX_TOTAL_CHARS.toLocaleString('id-ID')} karakter ` +
          `(halaman prioritas jenis didahulukan): halaman ${formatPageRanges(doc.skippedPages)}. ` +
          `Analisis mungkin tidak mencakup seluruh DED.`
        );
      }
      if (doc.truncatedPages.length > 0) {
        warnings.push(
          `Teks halaman dipotong pada ${MAX_PAGE_CHARS.toLocaleString('id-ID')} karakter per halaman: ` +
          `halaman ${formatPageRanges(doc.truncatedPages)}.`
        );
      }
      if (doc.emptyTextPages.length > 0) {
        warnings.push(
          `${doc.emptyTextPages.length} halaman tanpa lapisan teks tidak dapat dianalisis ` +
          `(kemungkinan hasil scan/gambar — butuh OCR): halaman ${formatPageRanges(doc.emptyTextPages)}.`
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

      // §6 Tahap 2–4 (model-side): SATU panggilan AI — Scope+WBS,
      // Construction Method Reasoning, AI AHSP Generation.
      notify('ANALYZE', 40, `Menganalisis DED dengan AI (${mode})...`);
      const { system, prompt } = buildFullAiPrompt({
        projectType,
        documentText: docText,
        pageCount: pages.length,
        mode,
        pricingPolicy: policy,
      });

      const productId = mode === 'FAST' ? 'DED_AI_FAST' : 'DED_AI_DETAIL';
      const aiResult = await aiToolsProviderClient.execute({
        productId,
        prompt,
        systemPrompt: system,
        jsonMode: true,
        maxTokens: mode === 'FAST' ? 16000 : 32000,
        timeoutMs: FULL_AI_TIMEOUT_MS[mode],
      });

      if (!aiResult.success) {
        return this.errorOutput(mode, policy, {
          code: aiResult.errorCode || 'AI_ERROR',
          message: aiResult.message || 'AI gagal memproses',
          retryable: true,
        });
      }

      // Parse & validasi respons model (normalisasi + validateFullAiItem
      // + resolusi kanonis per item).
      notify('VALIDATE', 70, 'Memvalidasi hasil AI...');
      let parsedAi: any;
      try {
        parsedAi = aiToolsProviderClient.extractJson(aiResult.content);
      } catch {
        return this.errorOutput(mode, policy, {
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
        `Model-side dalam satu panggilan AI: ${items.filter((it) => it.wbsCode).length} dari ${items.length} item membawa kode WBS; ringkasan cakupan ${parsedAi.projectInfo?.scopeSummary ? 'tersedia' : 'tidak diberikan'}.`,
      );
      markStage(
        'METHOD_REASONING',
        'done',
        `Model-side dalam satu panggilan AI: ${items.filter((it) => it.description).length} item berdeskripsi, ${items.filter((it) => (it.quantity.assumptions || []).length > 0).length} item berasumsi, ${items.filter((it) => it.quantity.formula).length} item berumus.`,
      );
      markStage(
        'AI_AHSP_GENERATION',
        'done',
        `Model-side dalam satu panggilan AI + resolusi kanonis per item: ${items.filter((it) => it.price.ahspMatch).length} item melewati resolusi kanonis, ${items.filter((it) => it.price.source === 'AHSP_2026').length} item berharga kanonis AHSP_2026.`,
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
      if (policy === 'FULL_AI') {
        const filledQty = completeFullAiQuantities(items);
        if (filledQty > 0) {
          warnings.push(
            `${filledQty} kuantitas dilengkapi dari konteks denah (estimasi berlabel ASSUMPTION — bukan fakta gambar, perlu tinjauan pengguna).`
          );
        }
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
          ? `Pass penyelesaian kuantitas: ${items.filter((it) => (it.quantityAudit?.method ?? it.quantity.quantityAudit?.method) === 'plan-context-estimate').length} kuantitas dilengkapi dari konteks denah.`
          : 'Dilewati: penyelesaian kuantitas hanya berjalan pada policy FULL_AI.',
      );

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

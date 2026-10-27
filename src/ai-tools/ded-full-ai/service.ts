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
import { waitForMinimum, minDelayFor } from '../aiResponseTiming';
import { parseDedPdf } from '../ded-ai-estimate/parser';
import { PAGE_TYPE_PRIORITY, formatPageRanges } from '../ded-ai-estimate/analysisTrace';
import { buildFullAiPrompt } from './prompts';
import { validateFullAiItem, verifySubtotal, describeProposedDiscrepancy } from './validator';
import {
  FullAiOutput, FullAiItem, FullAiServiceOptions, FullAiSummary, DedEstimationPolicy, FullAiPriceSource,
} from './types';
import {
  matchDedItemToAhsp, resolveDedPriceWithCanonical,
  type CanonicalDedMatch,
} from '../ded-canonical/canonicalDedPricing';

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
    const { mode, projectType } = options;
    // Kebijakan harga (default FULL_AI = perilaku lama).
    const policy: DedEstimationPolicy = options.policy ?? 'FULL_AI';
    const notify = options.onProgress || (() => {});

    try {
      // Tahap 1: Parse dokumen
      notify('PARSE', 10, 'Membaca dokumen DED...');
      const parsed = await parseDedPdf(options.buffer, options.fileName, { withImages: false });

      if ('errorCode' in parsed) {
        return this.errorOutput(mode, policy, {
          code: parsed.errorCode,
          message: parsed.message,
          retryable: parsed.retryable,
        });
      }

      const pages = parsed.pages || [];
      notify('PARSE', 25, `Dokumen dibaca: ${pages.length} halaman`);

      // Tahap 2: Siapkan teks dengan seleksi halaman berprioritas (F4 3.4/3.6)
      const doc = buildDocumentText(
        pages.map((p: any) => ({ page: p.page, text: p.text || '', pageType: p.pageType }))
      );
      const docText = doc.text;
      const totalChars = doc.totalChars;

      const warnings: string[] = [];
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

      // Tahap 3: Panggil AI
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

      // Tahap 4: Parse & validasi
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
            region: 'Jakarta',
            period: '2026',
          },
        };

        const validation = validateFullAiItem(normalized, i);

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
        // Gerbang kebijakan harga (service layer): harga diteruskan ke
        // adapter — kanonis RESOLVED menang; bila tidak ada di database,
        // estimasi AI dipakai sebagai fallback berlabel jelas (keputusan
        // owner 2026-10-27 malam). Item tanpa harga tetap tampil dengan
        // exclusionReason PRICE_UNRESOLVED di bawah.
        const p = applyFullAiPricePolicy(policy, normalized.price || {});
        // Resolusi kanonis (adapter ded-canonical): klaim VERIFIED tidak
        // lagi dipercaya begitu saja. Harga kanonis dipakai bila
        // terverifikasi (kedua mode); klaim gagal turun jadi estimasi AI
        // (kedua mode, berlabel perkiraan). Harga USER_INPUT tidak
        // pernah ditimpa.
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
          const claimedCode = typeof normalized.price?.ahspCode === 'string'
            ? normalized.price.ahspCode
            : undefined;
          const match = matchDedItemToAhsp({
            name: String(raw.name || ''),
            unit: String(q.unit || ''),
            specification: typeof raw.description === 'string' ? raw.description : undefined,
            claimedAhspCode: claimedCode,
          });
          ahspMatch = match;
          const decision = resolveDedPriceWithCanonical(policy, match, {
            unitPrice: typeof p.unitPrice === 'number' ? p.unitPrice : null,
            source: p.source || 'UNRESOLVED',
            unit: String(p.unit || q.unit || ''),
            notes: p.notes,
            ahspCode: p.ahspCode,
          });
          finalPrice = {
            unitPrice: decision.unitPrice,
            unit: decision.unit || String(q.unit || ''),
            source: decision.source,
            region: decision.source === 'AHSP_2026' ? 'Nasional' : p.region,
            period: decision.source === 'AHSP_2026' ? '2026' : p.period,
            ahspCode: decision.ahspCode,
            notes: decision.notes,
          };
        }
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

      return {
        success: true,
        mode,
        policy,
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
          ...resolveActualProviderModel(aiResult),
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
export function applyFullAiPricePolicy(
  policy: DedEstimationPolicy | undefined,
  price: any
): any {
  // Keputusan harga kini sepenuhnya di adapter (resolveDedPriceWithCanonical);
  // gerbang dipertahankan sebagai titik lewat agar pemanggil lama & tes
  // tetap memiliki satu tempat kebijakan yang eksplisit.
  void policy;
  return price;
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

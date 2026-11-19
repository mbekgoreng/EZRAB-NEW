/**
 * DOKUMEN AI — Service (src/ai-tools/document-ai/service.ts)
 * Wraps aiToolsProviderClient for the DOKUMEN_AI product. Answers only from the
 * extracted document content. Structured errors, never fabricated success.
 */

import { aiToolsProviderClient } from '../providerClient';
import type { AiToolsResult } from '../providerClient';
import { waitForMinimum, minDelayFor } from '../aiResponseTiming';
import { ENHANCE_TRANSFORM_GUIDANCE, TRANSLATE_LANGUAGE_NAMES, systemForMode } from './prompt';
import {
  DOC_CHUNK_TEXT_BUDGET,
  MAX_AI_REQUEST_CHARS,
  buildDocumentChunks,
  cutAtParagraphBoundary,
  fitTextWithinRequest,
  selectChunksForQuestion,
  splitDocumentPages,
  type DocChunk,
  type DocPage,
} from './chunking';
import { DocCoverageInfo, DokumenAiChatRequest, DokumenAiChatResponse, isTranslateLanguage } from './types';

/** Tanpa batas pemrosesan (2026-11-19): MAX_DOC_CHARS (140.000) DIHAPUS —
 *  tidak ada lagi ambang "dokumen terlalu besar" di jalur mana pun. */

/** Klien AI yang dipakai service — seam injeksi untuk pengujian. */
export type DokumenAiAiClient = Pick<typeof aiToolsProviderClient, 'execute'>;

/**
 * Peristiwa kemajuan analisis untuk UI (layar Proses mockup v2.3).
 * Aditif & opsional: pemanggil yang tidak meneruskan callback tidak
 * merasakan perubahan apa pun.
 *
 * - `percent` memakai kemajuan NYATA dari hitungan potongan (map:
 *   0–90 dari done/total; reduce: 95 sebagai penanda tahap gabung —
 *   100% tidak pernah diklaim sebelum hasil benar-benar kembali).
 * - `percent: null` = tidak ada kemajuan terukur (panggilan tunggal /
 *   retrieval QA) — UI menampilkan spinner + status + waktu jalan,
 *   BUKAN angka palsu.
 * - `done`/`total` adalah hitungan POTONGAN (fase map); 0/0 di fase lain.
 */
export interface DocAiProgressEvent {
  phase: 'map' | 'reduce' | 'single';
  done: number;
  total: number;
  percent: number | null;
  /** Baris status siap tampil, mis. "Menganalisis potongan 3 dari 12…". */
  status: string;
}

export type DocAiProgressCallback = (event: DocAiProgressEvent) => void;

/**
 * Baris cakupan untuk UI, dari objek coverage (BUKAN dari teks balasan).
 * Format: "Cakupan: N dari N halaman diproses · M potongan (K berhasil)".
 * Sama dengan baris yang dilekatkan service ke balasan (coverageLine) —
 * UI memakai fungsi ini agar cakupan tampil SATU kali saja.
 */
export function formatCoverageLine(coverage: DocCoverageInfo): string {
  const failed = coverage.failedChunks > 0 ? `, ${coverage.failedChunks} gagal` : '';
  const base = `Cakupan: ${coverage.processedPages} dari ${coverage.totalPages} halaman diproses · ${coverage.processedChunks} potongan (${coverage.okChunks} berhasil${failed})`;
  return coverage.partial
    ? `${base} — hasil SEBAGIAN, tidak mencakup seluruh dokumen.`
    : `${base}.`;
}

/** Penanda awal baris cakupan yang dilekatkan service ke balasan map-reduce. */
const COVERAGE_LINE_MARKER = '\n\n---\nCakupan analisis:';

/**
 * Hapus baris cakupan yang dilekatkan service di AKHIR balasan
 * (summarizeChunked / mapReduceWholeDocument / compareDocuments),
 * agar UI tidak menampilkan cakupan dua kali (baris UI + teks balasan).
 * Hanya dipotong bila penanda berada di paragraf TERAKHIR — bila ada
 * paragraf lagi sesudahnya, itu bukan lampiran service dan teks
 * dibiarkan utuh.
 */
export function stripCoverageLine(reply: string): string {
  const idx = reply.lastIndexOf(COVERAGE_LINE_MARKER);
  if (idx < 0) return reply;
  const tail = reply.slice(idx + COVERAGE_LINE_MARKER.length);
  if (tail.includes('\n\n')) return reply;
  return reply.slice(0, idx);
}

/**
 * Anggaran teks per SEGMEN ENHANCE — rentang suntingan, bukan unggahan
 * dokumen. Seleksi yang lebih panjang DIBAGI menjadi segmen-segmen
 * (batas paragraf) dan tiap segmen disunting terpisah lalu digabung —
 * bukan ditolak (error SELECTION_TOO_LONG lama DIHAPUS).
 */
export const MAX_ENHANCE_SEGMENT_CHARS = 8_000;

/** Anggaran teks per potongan TRANSLATE — lebih kecil dari potongan
 *  analisis agar hasil terjemahan muat dalam plafon token keluaran. */
const TRANSLATE_CHUNK_TEXT_BUDGET = 8_000;

/** Kedalaman maksimum sintesis hierarkis (reduce bertingkat). */
const MAX_REDUCE_DEPTH = 3;

export class DokumenAiService {
  constructor(private readonly aiClient: DokumenAiAiClient = aiToolsProviderClient) {}

  /**
   * Gerbang timing terpusat (spesifikasi 2026-10-27): analisis dokumen =
   * complex → minimum 3 detik sejak tombol ditekan, paralel dengan
   * provider (bukan sesudahnya). Mencakup ENHANCE, TRANSLATE, dan
   * mode chat/QA/ringkas/ekstrak lainnya.
   */
  public async chat(
    request: DokumenAiChatRequest,
    onProgress?: DocAiProgressCallback,
  ): Promise<DokumenAiChatResponse> {
    const startedAt = Date.now();
    const run =
      request.mode === 'ENHANCE'
        ? this.enhance(request)
        : request.mode === 'TRANSLATE'
          ? this.translate(request)
          : this.runChat(request, onProgress);
    return waitForMinimum(startedAt, minDelayFor('complex'), run);
  }

  private async runChat(
    request: DokumenAiChatRequest,
    onProgress?: DocAiProgressCallback,
  ): Promise<DokumenAiChatResponse> {
    const fullText = request.documentText || '';
    if (!fullText.trim()) {
      return {
        success: false,
        reply: '',
        mode: request.mode,
        errorCode: 'NO_DATA',
        stage: 'document:text',
        message: 'Dokumen kosong — tidak ada teks yang bisa dianalisis.',
      };
    }

    // Tanpa batas pemrosesan (2026-11-19): TIDAK ADA lagi mode yang
    // memotong teks dokumen. SUMMARY → map-reduce atas SEMUA potongan;
    // QA/CHAT → retrieval kata kunci (seleksi relevan, bukan potong);
    // EXTRACT/COMPARE/CHECKLIST → satu panggilan bila muat, map-reduce
    // bila tidak; DRAFT → summarize-then-draft (create) atau revisi
    // per potongan + gabung (revise). Flag `truncated` kini berarti
    // "teks dokumen dipotong" — false di semua jalur ini kecuali kutipan
    // QA yang benar-benar terpotong (selalu berpenanda eksplisit).
    if (request.mode === 'SUMMARY') return this.summarizeChunked(request, fullText, onProgress);
    if (request.mode === 'QA' || request.mode === 'CHAT') return this.askWithRetrieval(request, fullText, onProgress);
    return this.runWholeDocument(request, fullText, onProgress);
  }

  /** Panggilan AI tunggal lewat klien terinjeksi (default: providerClient). */
  private executeAi(
    request: DokumenAiChatRequest,
    systemPrompt: string,
    userPrompt: string,
  ): Promise<AiToolsResult<unknown>> {
    return this.aiClient.execute<unknown>({
      productId: 'DOKUMEN_AI',
      prompt: userPrompt,
      systemPrompt,
      jsonMode: false,
      maxTokens: 4000,
      timeoutMs: request.timeoutMs ?? 120000,
    });
  }

  /**
   * Riwayat percakapan untuk QA kontekstual. Batas 6 turn × 2.000 karakter
   * PERTAHANKAN (riwayat BUKAN teks dokumen — perintah tanpa-batas
   * pemrosesan berlaku untuk dokumen; riwayat penuh akan menenggelamkan
   * kutipan relevan), tetapi pemangkasannya kini DINYATAKAN di dalam
   * prompt agar model tahu konteksnya tidak lengkap.
   */
  private historySection(request: DokumenAiChatRequest): string {
    const history = request.history || [];
    const trimmedTurns = history.length > 6;
    const trimmedText = history.some((t) => t.text.length > 2000);
    const historyBlock = history
      .slice(-6)
      .map((t) => `${t.role === 'user' ? 'Pengguna' : 'AI'}: ${t.text.slice(0, 2000)}`)
      .join('\n');
    if (!historyBlock) return '';
    const note =
      trimmedTurns || trimmedText
        ? ' (Catatan sistem: riwayat dipersingkat — hanya 6 turn terakhir, masing-masing maks 2.000 karakter.)'
        : '';
    return `\n\nPercakapan sebelumnya:${note}\n${historyBlock}`;
  }

  /**
   * Bangun prompt dari builder (fungsi dari teks dokumen) dengan teks yang
   * dipasang ke anggaran request terukur penuh (system + prompt ≤ batas).
   * Mengembalikan prompt final + flag apakah teks dipotong.
   */
  private buildFittedPrompt(
    systemPrompt: string,
    buildPrompt: (docText: string) => string,
    docText: string,
  ): { prompt: string; truncated: boolean } {
    const overhead = buildPrompt('').length;
    const fitted = fitTextWithinRequest(systemPrompt, overhead, docText);
    return { prompt: buildPrompt(fitted.text), truncated: fitted.truncated };
  }

  /* ---------------------------------------------------------------- */
  /* Map-reduce generik (tanpa batas pemrosesan): peta tiap potongan  */
  /* lalu gabung hierarkis — tidak ada teks dokumen yang dipotong.    */
  /* ---------------------------------------------------------------- */

  /**
   * Pecah `text` menjadi bagian-bagian yang masing-masing MUAT dalam
   * anggaran request bila disisipkan ke prompt `buildPrompt`. Dipakai
   * sebagai pengaman bila satu potongan/temuan tidak muat sendirian —
   * pemecahan, BUKAN pemotongan: gabungan bagian = teks asli utuh.
   * `maxChars` (opsional) memaksa anggaran lebih kecil — dipakai
   * ENHANCE agar hasil suntingan tiap segmen muat plafon token keluaran.
   */
  private splitTextToFit(
    systemPrompt: string,
    buildPrompt: (text: string) => string,
    text: string,
    maxChars?: number,
  ): Array<{ text: string; partLabel?: string }> {
    const overhead = buildPrompt('').length;
    const derived = MAX_AI_REQUEST_CHARS - systemPrompt.length - overhead - 100;
    const budget = maxChars != null ? Math.min(derived, maxChars) : derived;
    if (budget < 500 || text.length <= budget) return [{ text }];
    const pieces: string[] = [];
    let rest = text;
    while (rest.length > budget) {
      const cut = cutAtParagraphBoundary(rest, budget);
      const part = cut.text || rest.slice(0, budget);
      pieces.push(part);
      rest = rest.slice(part.length);
    }
    if (rest) pieces.push(rest);
    return pieces.map((t, i) => ({
      text: t,
      partLabel: pieces.length > 1 ? `bagian ${i + 1}/${pieces.length}` : undefined,
    }));
  }

  /** Tahap MAP: jalankan prompt per potongan (sekuensial), temuan UTUH. */
  private async mapOverChunks(
    request: DokumenAiChatRequest,
    chunks: DocChunk[],
    systemPrompt: string,
    buildMapPrompt: (chunk: DocChunk, chunkText: string) => string,
    onProgress?: DocAiProgressCallback,
  ): Promise<{
    outputs: Array<{ chunk: DocChunk; text: string; partLabel?: string }>;
    failures: Array<{ chunk: DocChunk; errorCode?: string; message?: string }>;
  }> {
    const outputs: Array<{ chunk: DocChunk; text: string; partLabel?: string }> = [];
    const failures: Array<{ chunk: DocChunk; errorCode?: string; message?: string }> = [];
    onProgress?.({
      phase: 'map', done: 0, total: chunks.length, percent: 0,
      status: chunks.length > 1 ? `Memulai analisis — ${chunks.length} potongan…` : 'Menganalisis dokumen…',
    });
    // Sekuensial (concurrency 1) demi kontrol biaya & batas provider.
    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      const pieces = this.splitTextToFit(
        systemPrompt,
        (t) => buildMapPrompt(chunk, t),
        chunk.text,
      );
      for (const piece of pieces) {
        const { prompt } = this.buildFittedPrompt(
          systemPrompt,
          (t) => buildMapPrompt(chunk, t),
          piece.text,
        );
        const res = await this.executeAi(request, systemPrompt, prompt);
        if (res.success) {
          outputs.push({ chunk, text: res.content.trim(), partLabel: piece.partLabel });
        } else {
          failures.push({ chunk, errorCode: res.errorCode, message: res.message });
        }
      }
      // Potongan selesai dihitung baik berhasil maupun gagal (cakupan
      // ok/gagal dilaporkan terpisah lewat objek coverage).
      const done = ci + 1;
      onProgress?.({
        phase: 'map', done, total: chunks.length,
        percent: Math.min(90, Math.round((90 * done) / chunks.length)),
        status: `Menganalisis potongan ${done} dari ${chunks.length}…`,
      });
    }
    return { outputs, failures };
  }

  /** Kelompokkan item reduce menjadi batch yang masing-masing muat satu request. */
  private packReduceBatches(
    systemPrompt: string,
    buildReducePrompt: (itemsBlock: string) => string,
    items: Array<{ label: string; text: string; chunks: DocChunk[] }>,
  ): Array<Array<{ label: string; text: string; chunks: DocChunk[] }>> {
    const overhead = buildReducePrompt('').length;
    const budget = MAX_AI_REQUEST_CHARS - systemPrompt.length - overhead - 100;
    // Pecah item raksasa yang sendirian tidak muat (bukan dipotong).
    const flat: Array<{ label: string; text: string; chunks: DocChunk[] }> = [];
    for (const item of items) {
      const rendered = `${item.label}\n${item.text}`;
      if (rendered.length <= budget) {
        flat.push(item);
        continue;
      }
      const pieces = this.splitTextToFit(
        systemPrompt,
        (t) => buildReducePrompt(`${item.label}\n${t}`),
        item.text,
      );
      pieces.forEach((p) => {
        flat.push({
          label: p.partLabel ? `${item.label} (${p.partLabel})` : item.label,
          text: p.text,
          chunks: item.chunks,
        });
      });
    }
    const batches: Array<typeof flat> = [];
    let cur: typeof flat = [];
    let curLen = 0;
    for (const item of flat) {
      const len = `${item.label}\n${item.text}`.length + 2;
      if (cur.length > 0 && curLen + len > budget) {
        batches.push(cur);
        cur = [];
        curLen = 0;
      }
      cur.push(item);
      curLen += len;
    }
    if (cur.length > 0) batches.push(cur);
    return batches;
  }

  /**
   * Tahap REDUCE hierarkis: gabungkan item menjadi satu teks lewat
   * panggilan AI per batch; bila batch > 1, hasil batch digabung lagi
   * di tingkat berikut (kedalaman maks MAX_REDUCE_DEPTH). Bila cap
   * kedalaman tercapai dengan hasil batch > 1, hasil digabung apa
   * adanya (lengkap, hanya belum diringkas menjadi satu narasi).
   * Kegagalan satu batch TIDAK menggugurkan batch lain — potongan
   * batch yang gagal dilaporkan sebagai failedChunks.
   */
  private async reduceBatched(
    request: DokumenAiChatRequest,
    systemPrompt: string,
    buildReducePrompt: (itemsBlock: string) => string,
    items: Array<{ label: string; text: string; chunks: DocChunk[] }>,
    onProgress?: DocAiProgressCallback,
  ): Promise<{
    text: string;
    failedChunks: DocChunk[];
    provider: string | null;
    model: string | null;
    firstError?: string;
  }> {
    let current = items;
    const failedChunks: DocChunk[] = [];
    let provider: string | null = null;
    let model: string | null = null;
    let firstError: string | undefined;
    // Tahap gabung: potongan sudah 100% diproses, hasil akhir belum jadi —
    // 95 adalah penanda tahap (bukan hitungan), status menjelaskan.
    onProgress?.({
      phase: 'reduce', done: 0, total: 0, percent: 95,
      status: 'Menggabungkan hasil potongan…',
    });
    for (let level = 0; level <= MAX_REDUCE_DEPTH; level++) {
      const batches = this.packReduceBatches(systemPrompt, buildReducePrompt, current);
      const next: Array<{ label: string; text: string; chunks: DocChunk[] }> = [];
      for (let bi = 0; bi < batches.length; bi++) {
        const batch = batches[bi];
        const block = batch.map((it) => `${it.label}\n${it.text}`).join('\n\n');
        const res = await this.executeAi(request, systemPrompt, buildReducePrompt(block));
        if (res.success) {
          provider = res.provider ?? provider;
          model = res.model ?? model;
          next.push({
            label: `[Hasil gabungan${level > 0 ? ` tingkat ${level + 1}` : ''} batch ${bi + 1}/${batches.length}]`,
            text: res.content.trim(),
            chunks: batch.flatMap((it) => it.chunks),
          });
        } else {
          failedChunks.push(...batch.flatMap((it) => it.chunks));
          if (firstError == null) firstError = res.message || res.errorCode;
        }
      }
      if (next.length === 0) return { text: '', failedChunks, provider, model, firstError };
      if (next.length === 1) return { text: next[0].text, failedChunks, provider, model, firstError };
      if (level === MAX_REDUCE_DEPTH) {
        return {
          text: next.map((it) => `${it.label}\n${it.text}`).join('\n\n'),
          failedChunks,
          provider,
          model,
          firstError,
        };
      }
      current = next;
    }
    return { text: '', failedChunks, provider, model, firstError }; // tidak terjangkau
  }

  private failedRangesOf(chunks: DocChunk[]): Array<{ start: number; end: number }> {
    const ranges: Array<{ start: number; end: number }> = [];
    for (const c of chunks) {
      const r = { start: c.startPage, end: c.endPage };
      if (!ranges.some((x) => x.start === r.start && x.end === r.end)) ranges.push(r);
    }
    return ranges;
  }

  private buildCoverage(
    pages: Array<{ page: number }>,
    chunks: DocChunk[],
    okChunks: DocChunk[],
    failedChunks: DocChunk[],
  ): DocCoverageInfo {
    const okIdx = new Set(okChunks.map((c) => c.index));
    const failedIdx = new Set(failedChunks.map((c) => c.index));
    // Potongan yang gagal di reduce tidak dihitung berhasil.
    const okCount = [...okIdx].filter((i) => !failedIdx.has(i)).length;
    // Halaman yang tercakup = nomor halaman DISTINCT dalam potongan
    // (halaman raksasa yang terpecah menjadi beberapa potongan tetap
    // dihitung sekali — bukan per potongan).
    const pageSet = new Set<number>();
    for (const c of chunks) {
      for (let p = c.startPage; p <= c.endPage; p++) pageSet.add(p);
    }
    const processedPages = pageSet.size;
    return {
      totalPages: pages.length,
      processedPages,
      totalChunks: chunks.length,
      processedChunks: chunks.length,
      okChunks: okCount,
      failedChunks: failedIdx.size,
      failedPageRanges: this.failedRangesOf(failedChunks),
      partial: failedIdx.size > 0 || processedPages < pages.length,
    };
  }

  /** Gabung dua cakupan (perbandingan dua dokumen) secara numerik. */
  private combineCoverages(a: DocCoverageInfo, b: DocCoverageInfo): DocCoverageInfo {
    return {
      totalPages: a.totalPages + b.totalPages,
      processedPages: a.processedPages + b.processedPages,
      totalChunks: a.totalChunks + b.totalChunks,
      processedChunks: a.processedChunks + b.processedChunks,
      okChunks: a.okChunks + b.okChunks,
      failedChunks: a.failedChunks + b.failedChunks,
      failedPageRanges: [...a.failedPageRanges, ...b.failedPageRanges],
      partial: a.partial || b.partial,
    };
  }

  /** Baris cakupan yang dilekatkan ke balasan mode map-reduce. */
  private coverageLine(coverage: DocCoverageInfo, subject: string): string {
    const rangeText = coverage.failedPageRanges.length
      ? ` (gagal: ${coverage.failedPageRanges
          .map((r) => (r.start === r.end ? `hal. ${r.start}` : `hal. ${r.start}–${r.end}`))
          .join(', ')})`
      : '';
    return coverage.partial
      ? `\n\n---\nCakupan analisis: SEBAGIAN — ${coverage.processedPages} dari ${coverage.totalPages} halaman terbaca diproses dalam ${coverage.processedChunks} dari ${coverage.totalChunks} potongan (${coverage.okChunks} berhasil, ${coverage.failedChunks} gagal${rangeText}). ${subject} ini TIDAK mencakup seluruh dokumen.`
      : `\n\n---\nCakupan analisis: ${coverage.processedPages} dari ${coverage.totalPages} halaman terbaca diproses dalam ${coverage.processedChunks} potongan (semua berhasil).`;
  }

  /**
   * Mode EXTRACT/COMPARE/CHECKLIST/DRAFT: satu panggilan bila dokumen
   * muat; map-reduce (atau strategi DRAFT) bila tidak. TIDAK ADA lagi
   * jalur yang memotong teks agar muat — pemotongan lama (fitText +
   * flag truncated) digantikan paginasi.
   */
  private async runWholeDocument(
    request: DokumenAiChatRequest,
    fullText: string,
    onProgress?: DocAiProgressCallback,
  ): Promise<DokumenAiChatResponse> {
    if (request.mode === 'DRAFT') {
      return request.draftMode === 'revise'
        ? this.draftRevise(request, fullText)
        : this.draftCreate(request, fullText);
    }
    // EXTRACT memakai instruksi pemanggil bila ada (mis. ekstraksi
    // lingkup konstruksi dari orchestrator) — dulu diabaikan diam-diam.
    const extractHead = request.prompt?.trim()
      ? request.prompt.trim()
      : `Ekstrak tabel/spesifikasi dari dokumen "${request.fileName}".`;
    const buildPrompt = (docText: string) =>
      request.mode === 'EXTRACT'
        ? `${extractHead}\n\nDokumen "${request.fileName}":\n\n${docText}`
        : request.mode === 'COMPARE'
          ? `Bandingkan bagian-bagian dokumen "${request.fileName}":\n\n${docText}`
          : request.mode === 'CHECKLIST'
            ? `Periksa kelengkapan dokumen "${request.fileName}" (dokumen konstruksi). Sebutkan bagian/informasi yang ada dan yang belum ada/tidak ditemukan:\n\n${docText}`
            : docText;
    const systemPrompt = systemForMode(request.mode);
    const { prompt, truncated } = this.buildFittedPrompt(systemPrompt, buildPrompt, fullText);
    if (!truncated) {
      // Dokumen kecil: satu panggilan, perilaku lama, tanpa pemotongan.
      // Satu panggilan tidak punya kemajuan potongan yang terukur —
      // laporkan status saja (percent null).
      onProgress?.({ phase: 'single', done: 0, total: 0, percent: null, status: 'Menganalisis dokumen…' });
      const result = await this.executeAi(request, systemPrompt, prompt);
      if (!result.success) {
        return {
          success: false,
          reply: '',
          mode: request.mode,
          errorCode: result.errorCode,
          stage: result.stage,
          message: result.message,
        };
      }
      return {
        success: true,
        reply: result.content,
        mode: request.mode,
        truncated: false,
        provider: result.provider ?? null,
        model: result.model ?? null,
      };
    }
    // Dokumen besar: map-reduce atas SEMUA potongan.
    return this.mapReduceWholeDocument(request, fullText, systemPrompt, onProgress);
  }

  /** EXTRACT/CHECKLIST/COMPARE dokumen besar: map per potongan + reduce hierarkis. */
  private async mapReduceWholeDocument(
    request: DokumenAiChatRequest,
    fullText: string,
    systemPrompt: string,
    onProgress?: DocAiProgressCallback,
  ): Promise<DokumenAiChatResponse> {
    const pages = splitDocumentPages(fullText);
    const chunks = buildDocumentChunks(pages, DOC_CHUNK_TEXT_BUDGET);
    const modeLabel =
      request.mode === 'EXTRACT' ? 'Ekstraksi' : request.mode === 'CHECKLIST' ? 'Daftar periksa' : 'Perbandingan';
    const buildMapPrompt = (chunk: DocChunk, chunkText: string) => {
      const head =
        request.mode === 'EXTRACT'
          ? request.prompt?.trim()
            ? `${request.prompt.trim()}\n(Potongan ${chunk.index + 1} dari ${chunks.length} dokumen "${request.fileName}"; halaman ${chunk.startPage}–${chunk.endPage} — ekstrak HANYA dari potongan ini, jangan menambah dari luar teks.)`
            : `Ekstrak tabel/spesifikasi dari potongan dokumen "${request.fileName}" (potongan ${chunk.index + 1} dari ${chunks.length}; halaman ${chunk.startPage}–${chunk.endPage}). Keluarkan HANYA hasil ekstraksi dari potongan ini — jangan menambah dari luar teks.`
          : request.mode === 'CHECKLIST'
            ? `Periksa kelengkapan pada potongan dokumen "${request.fileName}" (potongan ${chunk.index + 1} dari ${chunks.length}; halaman ${chunk.startPage}–${chunk.endPage}). Untuk tiap aspek kelengkapan dokumen konstruksi yang disinggung potongan ini, nyatakan ADA (dengan kutipan halaman) atau TIDAK DITEMUKAN di potongan ini. Jangan mengarang.`
            : `Ekstrak poin-poin kunci potongan dokumen "${request.fileName}" (potongan ${chunk.index + 1} dari ${chunks.length}; halaman ${chunk.startPage}–${chunk.endPage}) untuk dibandingkan dengan potongan lain: fakta, angka, tanggal, ketentuan, dan hal penting — sebutkan nomor halamannya.`;
      return [head, '', 'TEKS POTONGAN:', chunkText].join('\n');
    };
    const { outputs, failures } = await this.mapOverChunks(request, chunks, systemPrompt, buildMapPrompt, onProgress);
    if (outputs.length === 0) {
      const first = failures[0];
      return {
        success: false,
        reply: '',
        mode: request.mode,
        errorCode: first?.errorCode || 'MODEL_ERROR',
        stage: 'document:chunks',
        message:
          `${modeLabel} gagal: seluruh ${failures.length} potongan dokumen gagal diproses.` +
          (first?.message ? ` Penyebab pertama: ${first.message}` : ''),
        coverage: this.buildCoverage(pages, chunks, [], failures.map((f) => f.chunk)),
        partial: true,
      };
    }
    const buildReducePrompt = (itemsBlock: string) =>
      request.mode === 'EXTRACT'
        ? `Gabungkan hasil ekstraksi per potongan dokumen "${request.fileName}" berikut menjadi SATU hasil ekstraksi utuh. Hapus duplikat persis; pertahankan nomor halaman tiap butir; jangan menambah fakta di luar hasil ekstraksi ini.\n\n${itemsBlock}`
        : request.mode === 'CHECKLIST'
          ? `Gabungkan daftar periksa per potongan dokumen "${request.fileName}" berikut menjadi SATU daftar periksa utuh. Satu aspek yang ADA di potongan mana pun = ADA (sebutkan semua halaman buktinya); aspek yang TIDAK DITEMUKAN di semua potongan = TIDAK DITEMUKAN. Jangan mengarang.\n\n${itemsBlock}`
          : `Bandingkan bagian-bagian dokumen "${request.fileName}" berdasarkan poin-poin kunci per potongan berikut. Sajikan persamaan dan perbedaan persis berdasarkan teks, dengan nomor halaman; bila antar-potongan bertentangan, tampilkan keduanya dan tandai sebagai KONFLIK — jangan memilih diam-diam.\n\n${itemsBlock}`;
    const {
      text: reduced,
      failedChunks: reduceFailed,
      provider,
      model,
      firstError,
    } = await this.reduceBatched(
      request,
      systemPrompt,
      buildReducePrompt,
      outputs.map((o) => ({
        label: `[Potongan ${o.chunk.index + 1} — Halaman ${o.chunk.startPage}–${o.chunk.endPage}${o.partLabel ? ` (${o.partLabel})` : ''}]`,
        text: o.text,
        chunks: [o.chunk],
      })),
      onProgress,
    );
    const failedChunks = [...failures.map((f) => f.chunk), ...reduceFailed];
    const coverage = this.buildCoverage(pages, chunks, outputs.map((o) => o.chunk), failedChunks);
    if (!reduced) {
      return {
        success: false,
        reply: '',
        mode: request.mode,
        errorCode: 'MODEL_ERROR',
        stage: 'document:synthesis',
        message:
          `Ekstraksi per potongan berhasil (${outputs.length} potongan), tetapi penggabungan hasil akhir gagal.` +
          (firstError ? ` Penyebab: ${firstError}` : ''),
        coverage,
        partial: true,
      };
    }
    return {
      success: true,
      reply: reduced + this.coverageLine(coverage, modeLabel),
      mode: request.mode,
      truncated: false,
      partial: coverage.partial,
      coverage,
      provider,
      model,
    };
  }

  /**
   * DRAFT create: draf BARU dari instruksi + dokumen referensi. Bila
   * referensi muat satu panggilan, perilaku lama. Bila tidak: ringkas
   * SELURUH referensi dulu (map-reduce SUMMARY), lalu buat draf dari
   * ringkasan lengkap itu — tidak ada bagian referensi yang dibuang.
   */
  private async draftCreate(
    request: DokumenAiChatRequest,
    fullText: string,
  ): Promise<DokumenAiChatResponse> {
    const systemPrompt = systemForMode('DRAFT');
    const buildPrompt = (docText: string) =>
      `Buatkan draf dokumen berdasarkan instruksi berikut. Gunakan HANYA informasi yang diberikan; jangan mengarang nomor surat, nama pihak, nilai kontrak, atau persetujuan.\n\nInstruksi: ${request.prompt || ''}\n\nKonteks dokumen referensi "${request.fileName}":\n${docText}`;
    const { prompt, truncated } = this.buildFittedPrompt(systemPrompt, buildPrompt, fullText);
    if (!truncated) {
      const result = await this.executeAi(request, systemPrompt, prompt);
      if (!result.success) {
        return {
          success: false,
          reply: '',
          mode: request.mode,
          errorCode: result.errorCode,
          stage: result.stage,
          message: result.message,
        };
      }
      return {
        success: true,
        reply: result.content,
        mode: request.mode,
        truncated: false,
        provider: result.provider ?? null,
        model: result.model ?? null,
      };
    }
    // Referensi besar: ringkas seluruhnya dulu, lalu draf dari ringkasan.
    const summary = await this.summarizeChunked(
      { ...request, mode: 'SUMMARY', prompt: undefined },
      fullText,
    );
    if (!summary.success) {
      return {
        success: false,
        reply: '',
        mode: request.mode,
        errorCode: summary.errorCode,
        stage: summary.stage,
        message: `Draf gagal dibuat: ringkasan dokumen referensi gagal disusun (${summary.message || summary.errorCode}).`,
        coverage: summary.coverage,
        partial: true,
      };
    }
    const draftPrompt = buildPrompt(
      `[Ringkasan lengkap seluruh dokumen referensi — disusun dari semua potongan, bukan potongan awal saja]\n${summary.reply || ''}`,
    );
    const result = await this.executeAi(request, systemPrompt, draftPrompt);
    if (!result.success) {
      return {
        success: false,
        reply: '',
        mode: request.mode,
        errorCode: result.errorCode,
        stage: result.stage,
        message: result.message,
        coverage: summary.coverage,
        partial: summary.partial,
      };
    }
    // Balasan draf TIDAK dilekatkan baris cakupan (isi draf adalah
    // konten dokumen, bukan laporan analisis); cakupan tersedia lewat
    // field coverage/partial/truncated.
    return {
      success: true,
      reply: result.content,
      mode: request.mode,
      truncated: false,
      partial: summary.partial,
      coverage: summary.coverage,
      provider: result.provider ?? null,
      model: result.model ?? null,
    };
  }

  /**
   * DRAFT revise: revisi dokumen yang ADA. Bila muat satu panggilan,
   * perilaku lama. Bila tidak: tiap potongan direvisi terpisah lalu
   * digabung berurutan — isi penuh dipertahankan (bukan diringkas).
   * Potongan yang gagal direvisi dipertahankan ASLI dengan penanda
   * eksplisit di dalam kandidat (bukan dihapus diam-diam).
   */
  private async draftRevise(
    request: DokumenAiChatRequest,
    fullText: string,
  ): Promise<DokumenAiChatResponse> {
    const systemPrompt = systemForMode('DRAFT');
    const buildPrompt = (docText: string) =>
      `Revisi dokumen berikut sesuai instruksi. Kembalikan SELURUH dokumen hasil revisi — jangan meringkas, jangan menghilangkan bagian.\n\nInstruksi revisi: ${request.prompt || ''}\n\nDokumen:\n${docText}`;
    const { prompt, truncated } = this.buildFittedPrompt(systemPrompt, buildPrompt, fullText);
    if (!truncated) {
      const result = await this.executeAi(request, systemPrompt, prompt);
      if (!result.success) {
        return {
          success: false,
          reply: '',
          mode: request.mode,
          errorCode: result.errorCode,
          stage: result.stage,
          message: result.message,
        };
      }
      return {
        success: true,
        reply: result.content,
        mode: request.mode,
        truncated: false,
        provider: result.provider ?? null,
        model: result.model ?? null,
      };
    }
    const pages = splitDocumentPages(fullText);
    const chunks = buildDocumentChunks(pages, DOC_CHUNK_TEXT_BUDGET);
    const buildMapPrompt = (chunk: DocChunk, chunkText: string) =>
      [
        `Revisi potongan dokumen "${request.fileName}" berikut (potongan ${chunk.index + 1} dari ${chunks.length}; halaman ${chunk.startPage}–${chunk.endPage}).`,
        `Instruksi revisi: ${request.prompt || ''}`,
        'Kembalikan HANYA potongan hasil revisi ini secara utuh — jangan meringkas, jangan menghilangkan bagian, jangan menambah isi dari luar potongan. Pertahankan penanda [Halaman N].',
        '',
        'TEKS POTONGAN:',
        chunkText,
      ].join('\n');
    const { outputs, failures } = await this.mapOverChunks(request, chunks, systemPrompt, buildMapPrompt);
    // Satu potongan bisa terpecah menjadi beberapa keluaran (partLabel) —
    // gabungkan per potongan sesuai urutan, jangan timpa. Bila ADA SATU
    // bagian potongan yang gagal, seluruh potongan dipertahankan asli
    // (revisi sebagian lebih menyesatkan daripada teks asli berpenanda).
    const failedIndices = new Set(failures.map((f) => f.chunk.index));
    const outputByIndex = new Map<number, string[]>();
    for (const o of outputs) {
      const arr = outputByIndex.get(o.chunk.index) ?? [];
      arr.push(o.text);
      outputByIndex.set(o.chunk.index, arr);
    }
    const parts: string[] = [];
    for (const chunk of chunks) {
      const revisedPieces = outputByIndex.get(chunk.index);
      if (revisedPieces != null && !failedIndices.has(chunk.index)) {
        parts.push(revisedPieces.join(''));
      } else {
        parts.push(
          `${chunk.text}\n\n[CATATAN SISTEM: potongan halaman ${chunk.startPage}–${chunk.endPage} gagal direvisi — teks asli dipertahankan. Periksa dan revisi bagian ini secara manual.]`,
        );
      }
    }
    if (outputs.length === 0) {
      const first = failures[0];
      return {
        success: false,
        reply: '',
        mode: request.mode,
        errorCode: first?.errorCode || 'MODEL_ERROR',
        stage: 'document:chunks',
        message:
          `Revisi gagal: seluruh ${failures.length} potongan dokumen gagal diproses.` +
          (first?.message ? ` Penyebab pertama: ${first.message}` : ''),
        coverage: this.buildCoverage(pages, chunks, [], failures.map((f) => f.chunk)),
        partial: true,
      };
    }
    const coverage = this.buildCoverage(
      pages,
      chunks,
      outputs.map((o) => o.chunk),
      failures.map((f) => f.chunk),
    );
    return {
      success: true,
      reply: parts.join('\n\n'),
      mode: request.mode,
      truncated: false,
      partial: coverage.partial,
      coverage,
      provider: null,
      model: null,
    };
  }

  /**
   * Bandingkan DUA dokumen (tanpa batas pemrosesan): tiap dokumen
   * diekstrak temuannya per potongan (SEMUA potongan), lalu temuan
   * kedua dokumen dibandingkan lewat reduce hierarkis. Menggantikan
   * jalur lama yang menggabungkan kedua dokumen menjadi satu teks
   * lalu memotongnya (DocAnalyzer memotong tiap dokumen ke 70rb
   * karakter, lalu service memotong gabungannya lagi ke ~19,5rb).
   */
  public async compareDocuments(
    a: { fileName: string; text: string },
    b: { fileName: string; text: string },
    opts?: { timeoutMs?: number; onProgress?: DocAiProgressCallback },
  ): Promise<DokumenAiChatResponse> {
    const startedAt = Date.now();
    const run = this.runCompareDocuments(a, b, opts);
    return waitForMinimum(startedAt, minDelayFor('complex'), run);
  }

  private async runCompareDocuments(
    a: { fileName: string; text: string },
    b: { fileName: string; text: string },
    opts?: { timeoutMs?: number; onProgress?: DocAiProgressCallback },
  ): Promise<DokumenAiChatResponse> {
    if (!(a.text || '').trim() || !(b.text || '').trim()) {
      return {
        success: false,
        reply: '',
        mode: 'COMPARE',
        errorCode: 'NO_DATA',
        stage: 'document:text',
        message: `Perbandingan membutuhkan dua dokumen berteks — dokumen ${!(a.text || '').trim() ? `"${a.fileName}"` : `"${b.fileName}"`} kosong/tanpa teks.`,
      };
    }
    const systemPrompt = systemForMode('COMPARE');
    // Map = ekstraksi poin kunci (system EXTRACT paling cocok); reduce =
    // perbandingan (system COMPARE).
    const mapSystemPrompt = systemForMode('EXTRACT');
    const baseRequest: DokumenAiChatRequest = {
      documentText: '',
      fileName: '',
      mode: 'COMPARE',
      timeoutMs: opts?.timeoutMs,
    };
    // Potongan kedua dokumen dibangun dulu agar progress memakai SATU
    // total gabungan (bukan 0–90% dua kali) — perilaku pemetaan tidak berubah.
    const pagesA = splitDocumentPages(a.text);
    const chunksA = buildDocumentChunks(pagesA, DOC_CHUNK_TEXT_BUDGET);
    const pagesB = splitDocumentPages(b.text);
    const chunksB = buildDocumentChunks(pagesB, DOC_CHUNK_TEXT_BUDGET);
    const totalChunks = chunksA.length + chunksB.length;
    const wrapProgress = (offset: number): DocAiProgressCallback | undefined => {
      const onProgress = opts?.onProgress;
      if (!onProgress) return undefined;
      return (ev) => {
        const done = ev.done + offset;
        onProgress({
          ...ev,
          done,
          total: totalChunks,
          percent: ev.percent == null ? null : Math.min(90, Math.round((90 * done) / totalChunks)),
          status:
            ev.done === 0
              ? `Memulai analisis — ${totalChunks} potongan…`
              : `Menganalisis potongan ${done} dari ${totalChunks}…`,
        });
      };
    };
    const extractFindings = async (
      doc: { fileName: string; text: string },
      pages: DocPage[],
      chunks: DocChunk[],
      progressOffset: number,
    ) => {
      const req = { ...baseRequest, documentText: doc.text, fileName: doc.fileName };
      const { outputs, failures } = await this.mapOverChunks(
        req,
        chunks,
        mapSystemPrompt,
        (chunk, chunkText) =>
          [
            `Ekstrak poin-poin kunci dokumen "${doc.fileName}" dari potongan ini (potongan ${chunk.index + 1} dari ${chunks.length}; halaman ${chunk.startPage}–${chunk.endPage}) untuk dibandingkan dengan dokumen lain: fakta, angka, tanggal, ketentuan, dan hal penting — sebutkan nomor halamannya.`,
            '',
            'TEKS POTONGAN:',
            chunkText,
          ].join('\n'),
        wrapProgress(progressOffset),
      );
      return { pages, chunks, outputs, failures };
    };
    const fa = await extractFindings(a, pagesA, chunksA, 0);
    const fb = await extractFindings(b, pagesB, chunksB, chunksA.length);
    const allOutputs = [...fa.outputs, ...fb.outputs];
    const allFailures = [...fa.failures, ...fb.failures];
    if (allOutputs.length === 0) {
      const first = allFailures[0];
      // Cakupan per dokumen lalu digabung (nomor halaman kedua dokumen
      // bertabrakan — tidak boleh dihitung dalam satu himpunan).
      const coverage = this.combineCoverages(
        this.buildCoverage(fa.pages, fa.chunks, [], fa.failures.map((f) => f.chunk)),
        this.buildCoverage(fb.pages, fb.chunks, [], fb.failures.map((f) => f.chunk)),
      );
      return {
        success: false,
        reply: '',
        mode: 'COMPARE',
        errorCode: first?.errorCode || 'MODEL_ERROR',
        stage: 'document:chunks',
        message:
          `Perbandingan gagal: seluruh potongan kedua dokumen gagal diproses.` +
          (first?.message ? ` Penyebab pertama: ${first.message}` : ''),
        coverage,
        partial: true,
      };
    }
    const labelOf = (docLabel: string, o: { chunk: DocChunk; partLabel?: string }) =>
      `[${docLabel} — Potongan ${o.chunk.index + 1} — Halaman ${o.chunk.startPage}–${o.chunk.endPage}${o.partLabel ? ` (${o.partLabel})` : ''}]`;
    const buildReducePrompt = (itemsBlock: string) =>
      `Bandingkan dua dokumen berikut berdasarkan temuan per potongan:\nDOKUMEN A: "${a.fileName}"\nDOKUMEN B: "${b.fileName}"\n\nSajikan persamaan dan perbedaan persis berdasarkan teks, dengan nomor halaman tiap butir; bila kedua dokumen bertentangan, tampilkan keduanya dan tandai sebagai KONFLIK — jangan memilih diam-diam. Bila suatu aspek hanya ada di satu dokumen, nyatakan hanya ada di dokumen itu.\n\n${itemsBlock}`;
    const {
      text: reduced,
      failedChunks: reduceFailed,
      provider,
      model,
      firstError,
    } = await this.reduceBatched(
      baseRequest,
      systemPrompt,
      buildReducePrompt,
      [
        ...fa.outputs.map((o) => ({ label: labelOf(`Dokumen A "${a.fileName}"`, o), text: o.text, chunks: [o.chunk] })),
        ...fb.outputs.map((o) => ({ label: labelOf(`Dokumen B "${b.fileName}"`, o), text: o.text, chunks: [o.chunk] })),
      ],
      opts?.onProgress,
    );
    // Atribusikan kegagalan reduce per dokumen lewat identitas objek
    // potongan (indeks potongan kedua dokumen bertabrakan).
    const reduceFailedA = reduceFailed.filter((c) => fa.chunks.includes(c));
    const reduceFailedB = reduceFailed.filter((c) => fb.chunks.includes(c));
    const coverage = this.combineCoverages(
      this.buildCoverage(
        fa.pages,
        fa.chunks,
        fa.outputs.map((o) => o.chunk),
        [...fa.failures.map((f) => f.chunk), ...reduceFailedA],
      ),
      this.buildCoverage(
        fb.pages,
        fb.chunks,
        fb.outputs.map((o) => o.chunk),
        [...fb.failures.map((f) => f.chunk), ...reduceFailedB],
      ),
    );
    if (!reduced) {
      return {
        success: false,
        reply: '',
        mode: 'COMPARE',
        errorCode: 'MODEL_ERROR',
        stage: 'document:synthesis',
        message:
          `Ekstraksi per potongan berhasil (${allOutputs.length} potongan), tetapi penyusunan perbandingan akhir gagal.` +
          (firstError ? ` Penyebab: ${firstError}` : ''),
        coverage,
        partial: true,
      };
    }
    return {
      success: true,
      reply: reduced + this.coverageLine(coverage, 'Perbandingan'),
      mode: 'COMPARE',
      truncated: false,
      partial: coverage.partial,
      coverage,
      provider,
      model,
    };
  }

  /* ---------------------------------------------------------------- */
  /* SUMMARY berpotongan (B1–B3): ekstraksi temuan per potongan lalu   */
  /* sintesis hierarkis, dengan cakupan eksplisit dan kegagalan       */
  /* parsial yang dilaporkan apa adanya — tidak pernah ringkasan palsu. */
  /* ---------------------------------------------------------------- */

  private chunkFindingsPrompt(
    request: DokumenAiChatRequest,
    chunk: DocChunk,
    totalChunks: number,
    totalPages: number,
    chunkText: string,
  ): string {
    return [
      `Ekstrak temuan faktual dari potongan dokumen "${request.fileName}" (potongan ${chunk.index + 1} dari ${totalChunks}; halaman ${chunk.startPage}–${chunk.endPage} dari ${totalPages} halaman terbaca).`,
      'Catat HANYA fakta yang benar-benar ada di teks: angka/nilai uang, tanggal, nama pihak/instansi, spesifikasi teknis, kewajiban, risiko, dan hal penting lain — sebutkan nomor halamannya untuk tiap temuan.',
      'Jangan menyimpulkan, jangan menambah informasi di luar teks, dan jangan mengarang. Tulis ringkas sebagai daftar butir (maksimal ±2.400 karakter). Bila potongan tidak memuat fakta penting, tulis tepat: "Tidak ada temuan faktual penting pada potongan ini."',
      '',
      'TEKS POTONGAN:',
      chunkText,
    ].join('\n');
  }

  private async summarizeChunked(
    request: DokumenAiChatRequest,
    fullText: string,
    onProgress?: DocAiProgressCallback,
  ): Promise<DokumenAiChatResponse> {
    const pages = splitDocumentPages(fullText);
    // Tanpa batas pemrosesan (2026-11-19): SEMUA potongan diproses
    // (slice MAX_DOC_CHUNKS lama DIHAPUS); temuan disimpan UTUH
    // (potong 2.600 karakter lama DIHAPUS) dan disintesis hierarkis.
    const chunks = buildDocumentChunks(pages, DOC_CHUNK_TEXT_BUDGET);
    const systemPrompt = systemForMode('SUMMARY');

    const { outputs: findings, failures } = await this.mapOverChunks(
      request,
      chunks,
      systemPrompt,
      (chunk, chunkText) => this.chunkFindingsPrompt(request, chunk, chunks.length, pages.length, chunkText),
      onProgress,
    );

    // Semua potongan gagal → error nyata dengan kode terpetakan pertama,
    // BUKAN ringkasan kosong yang menyamar sebagai sukses.
    if (findings.length === 0) {
      const first = failures[0];
      const coverage = this.buildCoverage(pages, chunks, [], failures.map((f) => f.chunk));
      return {
        success: false,
        reply: '',
        mode: request.mode,
        errorCode: first?.errorCode || 'MODEL_ERROR',
        stage: 'document:chunks',
        message:
          `Ringkasan gagal: seluruh ${failures.length} potongan dokumen gagal diproses.` +
          (first?.message ? ` Penyebab pertama: ${first.message}` : ''),
        coverage,
        partial: true,
      };
    }

    // Sintesis hierarkis: temuan digabung per batch, lalu hasil batch
    // digabung lagi — tidak ada temuan yang dipadatkan/dipotong.
    const synthSystem = systemForMode('SUMMARY');
    const buildSynthPrompt = (findingsBlock: string) =>
      [
        `Susun ringkasan dokumen "${request.fileName}" dari temuan per potongan berikut. Temuan ini sudah diekstrak dari teks asli — jangan menambah fakta di luar temuan ini.`,
        'Struktur: identitas/tujuan dokumen, poin utama, angka & fakta kunci, risiko/catatan penting, kesimpulan. Bila temuan antar-potongan bertentangan, tampilkan keduanya dan tandai sebagai KONFLIK — jangan memilih diam-diam.',
        '',
        findingsBlock,
      ].join('\n');
    const {
      text: summary,
      failedChunks: reduceFailed,
      provider,
      model,
      firstError,
    } = await this.reduceBatched(
      request,
      synthSystem,
      buildSynthPrompt,
      findings.map((f) => ({
        label: `[Potongan ${f.chunk.index + 1} — Halaman ${f.chunk.startPage}–${f.chunk.endPage}${f.partLabel ? ` (${f.partLabel})` : ''}]`,
        text: f.text,
        chunks: [f.chunk],
      })),
      onProgress,
    );
    const failedChunks = [...failures.map((f) => f.chunk), ...reduceFailed];
    const coverage = this.buildCoverage(pages, chunks, findings.map((f) => f.chunk), failedChunks);
    if (!summary) {
      return {
        success: false,
        reply: '',
        mode: request.mode,
        errorCode: 'MODEL_ERROR',
        stage: 'document:synthesis',
        message:
          `Ekstraksi per potongan berhasil (${findings.length} potongan), tetapi penyusunan ringkasan akhir gagal.` +
          (firstError ? ` Penyebab: ${firstError}` : ''),
        coverage,
        partial: true,
      };
    }

    return {
      success: true,
      reply: summary + this.coverageLine(coverage, 'Ringkasan'),
      mode: request.mode,
      // Tidak ada teks yang dipotong di jalur ini; kegagalan potongan
      // dilaporkan lewat partial/coverage, bukan truncated.
      truncated: false,
      partial: coverage.partial,
      coverage,
      provider,
      model,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Tanya Dokumen (B4): retrieval kata kunci deterministik atas      */
  /* potongan yang sama — dokumen utuh TIDAK dikirim ulang.           */
  /* ---------------------------------------------------------------- */

  private async askWithRetrieval(
    request: DokumenAiChatRequest,
    fullText: string,
    onProgress?: DocAiProgressCallback,
  ): Promise<DokumenAiChatResponse> {
    const question = request.prompt || '';
    // QA memakai retrieval + satu panggilan — tidak ada kemajuan potongan
    // yang terukur; laporkan status saja (percent null).
    onProgress?.({ phase: 'single', done: 0, total: 0, percent: null, status: 'Mencari bagian dokumen yang relevan…' });
    const pages = splitDocumentPages(fullText);
    const chunks = buildDocumentChunks(pages, DOC_CHUNK_TEXT_BUDGET);
    const { selected, bestScore } = selectChunksForQuestion(chunks, question, 2);

    // Nol tumpang-tindih kata kunci → batas jujur TANPA panggilan AI.
    // Mengarang jawaban dari konteks yang tidak relevan dilarang.
    // truncated: false — pencarian kata kunci mencakup SEMUA potongan
    // (tidak ada teks yang dipotong); yang tidak ada adalah relevansi.
    if (bestScore <= 0 || selected.length === 0) {
      return {
        success: true,
        reply:
          'Berdasarkan teks dokumen yang terbaca, tidak ditemukan bagian yang relevan untuk menjawab pertanyaan itu — informasi ini tidak tercantum dalam dokumen, atau istilahnya berbeda dari yang dipakai dokumen. Coba rumuskan ulang dengan kata kunci yang dipakai dokumen.',
        mode: request.mode,
        contextInsufficient: true,
        truncated: false,
      };
    }

    // Urutan kirim: skor tertinggi dulu; sertakan potongan tetangga
    // langsung dari potongan terbaik bila belum terpilih (konteks sekitar).
    const chosen: DocChunk[] = selected.map((s) => s.chunk);
    const bestChunk = selected[0].chunk;
    const neighbor = chunks[bestChunk.index + 1];
    if (neighbor && !chosen.some((c) => c.index === neighbor.index)) {
      chosen.push(neighbor);
    }

    const systemPrompt = systemForMode(request.mode);
    onProgress?.({
      phase: 'single', done: 0, total: 0, percent: null,
      status: `Menyusun jawaban dari ${chosen.length} potongan relevan…`,
    });
    const historySection = this.historySection(request);
    const header =
      `Berdasarkan dokumen "${request.fileName}", jawab HANYA dari kutipan berikut. ` +
      'Sebutkan halaman sumber jawaban bila ada. Bila kutipan tidak memuat jawabannya, katakan informasi itu tidak tercantum pada bagian dokumen yang relevan.';
    const buildPrompt = (excerpts: string) =>
      `${header}\n\n${excerpts}${historySection}\n\nPertanyaan: ${question}`;

    // Rakit kutipan mengikuti anggaran request terukur: potongan prioritas
    // lebih dulu; potongan terakhir yang tidak muat penuh dipotong pada
    // BATAS PARAGRAF (bukan tengah kalimat) dan SELALU berpenanda
    // eksplisit — satu-satunya pemotongan teks yang tersisa di
    // Document AI (kutipan QA memang selektif menurut relevansi).
    const overhead = buildPrompt('').length;
    let room = MAX_AI_REQUEST_CHARS - systemPrompt.length - overhead;
    const excerptParts: string[] = [];
    let excerptCut = false;
    for (const chunk of chosen) {
      const label = `[Halaman ${chunk.startPage}–${chunk.endPage}]`;
      const block = `${label}\n${chunk.text}`;
      if (block.length + 2 <= room) {
        excerptParts.push(block);
        room -= block.length + 2;
      } else if (room >= 800) {
        const marker =
          '\n[…kutipan dipotong — sisa potongan ini tidak dikirim karena batas ukuran request; jawab hanya dari kutipan yang tersedia]';
        const cut = cutAtParagraphBoundary(block, Math.max(0, room - marker.length));
        excerptParts.push(cut.text + marker);
        excerptCut = true;
        room = 0;
        break;
      } else {
        break;
      }
    }
    const prompt = buildPrompt(excerptParts.join('\n\n'));
    const result = await this.executeAi(request, systemPrompt, prompt);
    if (!result.success) {
      return {
        success: false,
        reply: '',
        mode: request.mode,
        errorCode: result.errorCode,
        stage: result.stage,
        message: result.message,
      };
    }
    return {
      success: true,
      reply: result.content,
      mode: request.mode,
      // truncated = ada kutipan yang benar-benar terpotong. Seleksi
      // potongan menurut relevansi BUKAN pemotongan (potongan tidak
      // relevan memang tidak dikirim — itu desain retrieval).
      truncated: excerptCut,
      provider: result.provider ?? null,
      model: result.model ?? null,
    };
  }

  /**
   * Mode ENHANCE (polish §5): menyunting TEKS TARGET saja. Seluruh dokumen
   * TIDAK dikirim — konteks minimum hanya nama/jenis dokumen (fileName).
   * Tanpa batas pemrosesan (2026-11-19): seleksi sepanjang apa pun
   * DIBAGI menjadi segmen (batas paragraf, ≤ MAX_ENHANCE_SEGMENT_CHARS),
   * tiap segmen disunting terpisah lalu digabung — error
   * SELECTION_TOO_LONG lama DIHAPUS. Kegagalan satu segmen menggagalkan
   * seluruh penyuntingan (all-or-nothing, seperti perilaku lama saat
   * provider gagal) agar kandidat tidak tercampur suntingan/sebagian.
   */
  private async enhance(request: DokumenAiChatRequest): Promise<DokumenAiChatResponse> {
    const selection = request.selectionText ?? '';
    if (!selection.trim()) {
      return {
        success: false,
        reply: '',
        mode: request.mode,
        errorCode: 'EMPTY_SELECTION',
        stage: 'enhance:selection',
        message: 'Tidak ada teks yang dipilih untuk disempurnakan.',
      };
    }

    const guidance = ENHANCE_TRANSFORM_GUIDANCE[request.transform ?? ''] ?? ENHANCE_TRANSFORM_GUIDANCE.sempurnakan;
    const systemPrompt = systemForMode('ENHANCE');
    const buildPrompt = (segmentText: string, segmentNote: string) => {
      const parts = [
        `Sunting teks target berikut dari dokumen "${request.fileName || 'Dokumen'}". Kembalikan HANYA teks hasil suntingan — tanpa pengantar, tanpa komentar, tanpa penjelasan perubahan.${segmentNote}`,
        `JENIS TRANSFORMASI: ${guidance}`,
      ];
      if (request.prompt?.trim()) {
        parts.push(`INSTRUKSI PENGGUNA: ${request.prompt.trim()}`);
      }
      parts.push(`TEKS TARGET:\n${segmentText}`);
      return parts.join('\n\n');
    };
    // Segmen ≤ MAX_ENHANCE_SEGMENT_CHARS (batas paragraf) agar hasil
    // suntingan tiap segmen muat plafon token keluaran; prompt terukur
    // juga dijamin muat (pengaman bila overhead instruksi pengguna besar).
    const segments = this.splitTextToFit(
      systemPrompt,
      (t) => buildPrompt(t, ''),
      selection,
      MAX_ENHANCE_SEGMENT_CHARS,
    );
    const edited: string[] = [];
    let lastProvider: string | null = null;
    let lastModel: string | null = null;
    for (let i = 0; i < segments.length; i++) {
      const segmentNote =
        segments.length > 1
          ? ` Ini adalah bagian ${i + 1} dari ${segments.length} teks terpilih — sunting bagian ini saja, pertahankan gaya dan istilah konsisten dengan bagian lain.`
          : '';
      const result = await this.aiClient.execute<unknown>({
        productId: 'DOKUMEN_AI',
        prompt: buildPrompt(segments[i].text, segmentNote),
        systemPrompt,
        jsonMode: false,
        maxTokens: 4000,
        timeoutMs: request.timeoutMs ?? 120000,
      });
      if (!result.success) {
        return {
          success: false,
          reply: '',
          mode: request.mode,
          errorCode: result.errorCode,
          stage: result.stage,
          message:
            segments.length > 1
              ? `Penyuntingan gagal pada bagian ${i + 1} dari ${segments.length}: ${result.message}`
              : result.message,
        };
      }
      lastProvider = result.provider ?? lastProvider;
      lastModel = result.model ?? lastModel;
      edited.push(result.content);
    }

    return {
      success: true,
      // Segmen mempartisi seleksi secara eksak — gabung tanpa pemisah.
      reply: edited.join(''),
      mode: request.mode,
      provider: lastProvider,
      model: lastModel,
    };
  }

  /**
   * Mode TRANSLATE (F8): menerjemahkan SELURUH teks dokumen (markdown-lite
   * dari orchestrator) ke bahasa target. Validasi bahasa & kekosongan di
   * sini, sebelum jaringan: bahasa tak dikenal → UNKNOWN_LANGUAGE, dokumen
   * kosong → NO_DATA. Tanpa batas pemrosesan (2026-11-19): dokumen kecil
   * satu panggilan (perilaku lama); dokumen besar diterjemahkan per
   * potongan lalu digabung — pemotongan ekor lama (fitText) DIHAPUS.
   * Potongan yang gagal diterjemahkan dipertahankan ASLI dengan penanda
   * eksplisit (bukan dihapus diam-diam).
   */
  private async translate(request: DokumenAiChatRequest): Promise<DokumenAiChatResponse> {
    const target = request.targetLanguage ?? '';
    if (!isTranslateLanguage(target)) {
      return {
        success: false,
        reply: '',
        mode: request.mode,
        errorCode: 'UNKNOWN_LANGUAGE',
        stage: 'translate:language',
        message: `Bahasa target "${target || '(kosong)'}" tidak didukung. Pilih salah satu bahasa terjemahan yang tersedia.`,
      };
    }
    const fullText = request.documentText || '';
    if (!fullText.trim()) {
      return {
        success: false,
        reply: '',
        mode: request.mode,
        errorCode: 'NO_DATA',
        stage: 'translate:document',
        message: 'Dokumen kosong — tidak ada isi yang bisa diterjemahkan.',
      };
    }
    const lang = TRANSLATE_LANGUAGE_NAMES[target];
    const systemPrompt = systemForMode('TRANSLATE');
    const buildPrompt = (docText: string) =>
      `Terjemahkan dokumen "${request.fileName || 'Dokumen'}" berikut ke bahasa target: ${lang.english} (${lang.native}). ` +
      `Ikuti seluruh aturan preservasi pada instruksi sistem. Keluarkan hanya dokumen hasil terjemahan dalam markdown.\n\n${docText}`;
    const { prompt: userPrompt, truncated } = this.buildFittedPrompt(systemPrompt, buildPrompt, fullText);

    if (!truncated) {
      const result = await this.aiClient.execute<unknown>({
        productId: 'DOKUMEN_AI',
        prompt: userPrompt,
        systemPrompt,
        jsonMode: false,
        maxTokens: 4000,
        timeoutMs: request.timeoutMs ?? 120000,
      });
      if (!result.success) {
        return {
          success: false,
          reply: '',
          mode: request.mode,
          errorCode: result.errorCode,
          stage: result.stage,
          message: result.message,
        };
      }
      return {
        success: true,
        reply: result.content,
        mode: request.mode,
        truncated: false,
        provider: result.provider ?? null,
        model: result.model ?? null,
      };
    }

    // Dokumen besar: terjemahkan per potongan (anggaran lebih kecil agar
    // hasil terjemahan muat plafon token keluaran), lalu gabung berurutan.
    const pages = splitDocumentPages(fullText);
    const chunks = buildDocumentChunks(pages, TRANSLATE_CHUNK_TEXT_BUDGET);
    const buildChunkPrompt = (chunk: DocChunk, chunkText: string) =>
      `Terjemahkan potongan dokumen "${request.fileName || 'Dokumen'}" berikut (potongan ${chunk.index + 1} dari ${chunks.length}; halaman ${chunk.startPage}–${chunk.endPage}) ke bahasa target: ${lang.english} (${lang.native}). ` +
      `Ikuti seluruh aturan preservasi pada instruksi sistem, pertahankan penanda [Halaman N]. Keluarkan hanya potongan hasil terjemahan dalam markdown.\n\n${chunkText}`;
    const { outputs, failures } = await this.mapOverChunks(request, chunks, systemPrompt, buildChunkPrompt);
    if (outputs.length === 0) {
      const first = failures[0];
      return {
        success: false,
        reply: '',
        mode: request.mode,
        errorCode: first?.errorCode || 'MODEL_ERROR',
        stage: 'translate:chunks',
        message:
          `Terjemahan gagal: seluruh ${failures.length} potongan dokumen gagal diproses.` +
          (first?.message ? ` Penyebab pertama: ${first.message}` : ''),
        coverage: this.buildCoverage(pages, chunks, [], failures.map((f) => f.chunk)),
        partial: true,
      };
    }
    // Satu potongan bisa terpecah menjadi beberapa keluaran — gabungkan
    // per potongan sesuai urutan. Potongan yang gagal: teks asli + penanda.
    const failedIndices = new Set(failures.map((f) => f.chunk.index));
    const outputByIndex = new Map<number, string[]>();
    for (const o of outputs) {
      const arr = outputByIndex.get(o.chunk.index) ?? [];
      arr.push(o.text);
      outputByIndex.set(o.chunk.index, arr);
    }
    const parts: string[] = [];
    for (const chunk of chunks) {
      const translatedPieces = outputByIndex.get(chunk.index);
      if (translatedPieces != null && !failedIndices.has(chunk.index)) {
        parts.push(translatedPieces.join(''));
      } else {
        parts.push(
          `${chunk.text}\n\n[CATATAN SISTEM: potongan halaman ${chunk.startPage}–${chunk.endPage} tidak diterjemahkan — teks asli dipertahankan.]`,
        );
      }
    }
    const coverage = this.buildCoverage(
      pages,
      chunks,
      outputs.map((o) => o.chunk),
      failures.map((f) => f.chunk),
    );
    return {
      success: true,
      reply: parts.join('\n\n'),
      mode: request.mode,
      truncated: false,
      partial: coverage.partial,
      coverage,
      provider: null,
      model: null,
    };
  }
}

export const dokumenAiService = new DokumenAiService();

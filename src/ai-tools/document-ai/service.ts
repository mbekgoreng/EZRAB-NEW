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
  CHUNK_FINDING_MAX_CHARS,
  DOC_CHUNK_TEXT_BUDGET,
  MAX_AI_REQUEST_CHARS,
  MAX_DOC_CHUNKS,
  buildDocumentChunks,
  condenseTextsProportionally,
  fitTextWithinRequest,
  measureAiRequestChars,
  selectChunksForQuestion,
  splitDocumentPages,
  type DocChunk,
} from './chunking';
import { DocCoverageInfo, DokumenAiChatRequest, DokumenAiChatResponse, isTranslateLanguage } from './types';

const MAX_DOC_CHARS = 140_000;

/** Klien AI yang dipakai service — seam injeksi untuk pengujian. */
export type DokumenAiAiClient = Pick<typeof aiToolsProviderClient, 'execute'>;

/** Batas teks target ENHANCE — rentang suntingan, bukan unggahan dokumen. */
export const MAX_ENHANCE_SELECTION_CHARS = 8_000;

export class DokumenAiService {
  constructor(private readonly aiClient: DokumenAiAiClient = aiToolsProviderClient) {}

  /**
   * Gerbang timing terpusat (spesifikasi 2026-10-27): analisis dokumen =
   * complex → minimum 3 detik sejak tombol ditekan, paralel dengan
   * provider (bukan sesudahnya). Mencakup ENHANCE, TRANSLATE, dan
   * mode chat/QA/ringkas/ekstrak lainnya.
   */
  public async chat(request: DokumenAiChatRequest): Promise<DokumenAiChatResponse> {
    const startedAt = Date.now();
    const run =
      request.mode === 'ENHANCE'
        ? this.enhance(request)
        : request.mode === 'TRANSLATE'
          ? this.translate(request)
          : this.runChat(request);
    return waitForMinimum(startedAt, minDelayFor('complex'), run);
  }

  private async runChat(request: DokumenAiChatRequest): Promise<DokumenAiChatResponse> {
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

    // Sprint 1 (Workstream B): jalur yang dulu menjejali seluruh dokumen ke
    // satu prompt (selalu 400 untuk dokumen > 20rb karakter) kini dibagi:
    // SUMMARY → pipeline potongan; QA/CHAT → retrieval kata kunci atas
    // potongan yang sama. Mode lain tetap satu panggilan tetapi teksnya
    // DIPASANG ke anggaran request terukur (bukan irisan 140rb yang pasti
    // ditolak gateway) dan pemotongannya dilaporkan lewat flag truncated.
    if (request.mode === 'SUMMARY') return this.summarizeChunked(request, fullText);
    if (request.mode === 'QA' || request.mode === 'CHAT') return this.askWithRetrieval(request, fullText);
    return this.runWholeDocument(request, fullText);
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

  /** Riwayat percakapan untuk QA kontekstual (batasi agar prompt tidak bloat). */
  private historySection(request: DokumenAiChatRequest): string {
    const historyBlock = (request.history || [])
      .slice(-6)
      .map((t) => `${t.role === 'user' ? 'Pengguna' : 'AI'}: ${t.text.slice(0, 2000)}`)
      .join('\n');
    return historyBlock ? `\n\nPercakapan sebelumnya:\n${historyBlock}` : '';
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

  /** Mode satu panggilan (EXTRACT/COMPARE/CHECKLIST/DRAFT): perilaku lama,
   *  tetapi teks dipasang ke anggaran gateway yang sebenarnya. */
  private async runWholeDocument(
    request: DokumenAiChatRequest,
    fullText: string,
  ): Promise<DokumenAiChatResponse> {
    const buildPrompt = (docText: string) =>
      request.mode === 'EXTRACT'
        ? `Ekstrak tabel/spesifikasi dari dokumen "${request.fileName}":\n\n${docText}`
        : request.mode === 'COMPARE'
          ? `Bandingkan bagian-bagian dokumen "${request.fileName}":\n\n${docText}`
          : request.mode === 'CHECKLIST'
            ? `Periksa kelengkapan dokumen "${request.fileName}" (dokumen konstruksi). Sebutkan bagian/informasi yang ada dan yang belum ada/tidak ditemukan:\n\n${docText}`
            : request.mode === 'DRAFT'
              ? `Buatkan draf dokumen berdasarkan instruksi berikut. Gunakan HANYA informasi yang diberikan; jangan mengarang nomor surat, nama pihak, nilai kontrak, atau persetujuan.\n\nInstruksi: ${request.prompt || ''}\n\nKonteks dokumen referensi "${request.fileName}":\n${docText}`
              : docText;
    const systemPrompt = systemForMode(request.mode);
    const { prompt, truncated } = this.buildFittedPrompt(systemPrompt, buildPrompt, fullText);
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
      truncated,
      provider: result.provider ?? null,
      model: result.model ?? null,
    };
  }

  /* ---------------------------------------------------------------- */
  /* SUMMARY berpotongan (B1–B3): ekstraksi temuan per potongan lalu   */
  /* satu sintesis, dengan cakupan eksplisit dan kegagalan parsial     */
  /* yang dilaporkan apa adanya — tidak pernah ringkasan palsu.        */
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
  ): Promise<DokumenAiChatResponse> {
    const pages = splitDocumentPages(fullText);
    const allChunks = buildDocumentChunks(pages, DOC_CHUNK_TEXT_BUDGET);
    const chunks = allChunks.slice(0, MAX_DOC_CHUNKS);
    const capped = allChunks.length > chunks.length;
    const systemPrompt = systemForMode('SUMMARY');

    const findings: Array<{ chunk: DocChunk; text: string }> = [];
    const failures: Array<{ chunk: DocChunk; errorCode?: string; message?: string }> = [];

    // Sekuensial (concurrency 1) demi kontrol biaya & batas provider.
    for (const chunk of chunks) {
      const buildPrompt = (text: string) =>
        this.chunkFindingsPrompt(request, chunk, chunks.length, pages.length, text);
      const { prompt } = this.buildFittedPrompt(systemPrompt, buildPrompt, chunk.text);
      const res = await this.executeAi(request, systemPrompt, prompt);
      if (res.success) {
        const text = res.content.trim();
        findings.push({
          chunk,
          text: text.length > CHUNK_FINDING_MAX_CHARS
            ? `${text.slice(0, CHUNK_FINDING_MAX_CHARS)}\n[temuan dipotong oleh sistem]`
            : text,
        });
      } else {
        failures.push({ chunk, errorCode: res.errorCode, message: res.message });
      }
    }

    const failedRanges: Array<{ start: number; end: number }> = [];
    for (const f of failures) {
      const r = { start: f.chunk.startPage, end: f.chunk.endPage };
      if (!failedRanges.some((x) => x.start === r.start && x.end === r.end)) failedRanges.push(r);
    }
    const processedPages = chunks.length ? chunks[chunks.length - 1].endPage : 0;
    const coverage: DocCoverageInfo = {
      totalPages: pages.length,
      processedPages,
      totalChunks: allChunks.length,
      processedChunks: chunks.length,
      okChunks: findings.length,
      failedChunks: failures.length,
      failedPageRanges: failedRanges,
      partial: capped || failures.length > 0 || processedPages < pages.length,
    };

    // Semua potongan gagal → error nyata dengan kode terpetakan pertama,
    // BUKAN ringkasan kosong yang menyamar sebagai sukses.
    if (findings.length === 0) {
      const first = failures[0];
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

    // Sintesis: gabungkan temuan; bila gabungan melebihi anggaran request,
    // padatkan proporsional dan nyatakan pemadatannya di dalam prompt.
    const labels = findings.map(
      (f) => `[Potongan ${f.chunk.index + 1} — Halaman ${f.chunk.startPage}–${f.chunk.endPage}]`,
    );
    const synthSystem = systemForMode('SUMMARY');
    const buildSynthPrompt = (findingsBlock: string, condensedNote: string) =>
      [
        `Susun ringkasan dokumen "${request.fileName}" dari temuan per potongan berikut. Temuan ini sudah diekstrak dari teks asli — jangan menambah fakta di luar temuan ini.`,
        'Struktur: identitas/tujuan dokumen, poin utama, angka & fakta kunci, risiko/catatan penting, kesimpulan. Bila temuan antar-potongan bertentangan, tampilkan keduanya dan tandai sebagai KONFLIK — jangan memilih diam-diam.',
        condensedNote,
        '',
        findingsBlock,
      ]
        .filter(Boolean)
        .join('\n');
    const findingsJoiner = (texts: string[]) =>
      texts.map((t, i) => `${labels[i]}\n${t}`).join('\n\n');
    const overhead = buildSynthPrompt('', '').length;
    const findingsBudget = Math.max(
      0,
      MAX_AI_REQUEST_CHARS - synthSystem.length - overhead,
    );
    const { texts: condensedTexts, condensed } = condenseTextsProportionally(
      findings.map((f) => f.text),
      findingsBudget - labels.reduce((a, l) => a + l.length + 2, 0),
    );
    const synthPrompt = buildSynthPrompt(
      findingsJoiner(condensedTexts),
      condensed ? '(Catatan sistem: temuan per potongan dipadatkan secara proporsional agar muat dalam batas pemrosesan.)' : '',
    );
    const synth = await this.executeAi(request, synthSystem, synthPrompt);
    if (!synth.success) {
      return {
        success: false,
        reply: '',
        mode: request.mode,
        errorCode: synth.errorCode,
        stage: 'document:synthesis',
        message: `Ekstraksi per potongan berhasil (${findings.length} potongan), tetapi penyusunan ringkasan akhir gagal: ${synth.message}`,
        coverage,
        partial: true,
      };
    }

    const rangeText = failedRanges.length
      ? ` (gagal: ${failedRanges.map((r) => (r.start === r.end ? `hal. ${r.start}` : `hal. ${r.start}–${r.end}`)).join(', ')})`
      : '';
    const coverageLine = coverage.partial
      ? `\n\n---\nCakupan analisis: SEBAGIAN — ${coverage.processedPages} dari ${coverage.totalPages} halaman terbaca diproses dalam ${coverage.processedChunks} dari ${coverage.totalChunks} potongan (${coverage.okChunks} berhasil, ${coverage.failedChunks} gagal${rangeText})${capped ? `; potongan di luar batas ${MAX_DOC_CHUNKS} potongan tidak diproses` : ''}. Ringkasan ini TIDAK mencakup seluruh dokumen.`
      : `\n\n---\nCakupan analisis: ${coverage.processedPages} dari ${coverage.totalPages} halaman terbaca diproses dalam ${coverage.processedChunks} potongan (semua berhasil).`;

    return {
      success: true,
      reply: synth.content.trim() + coverageLine,
      mode: request.mode,
      truncated: coverage.partial,
      partial: coverage.partial,
      coverage,
      provider: synth.provider ?? null,
      model: synth.model ?? null,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Tanya Dokumen (B4): retrieval kata kunci deterministik atas      */
  /* potongan yang sama — dokumen utuh TIDAK dikirim ulang.           */
  /* ---------------------------------------------------------------- */

  private async askWithRetrieval(
    request: DokumenAiChatRequest,
    fullText: string,
  ): Promise<DokumenAiChatResponse> {
    const question = request.prompt || '';
    const pages = splitDocumentPages(fullText);
    const chunks = buildDocumentChunks(pages, DOC_CHUNK_TEXT_BUDGET);
    const { selected, bestScore } = selectChunksForQuestion(chunks, question, 2);

    // Nol tumpang-tindih kata kunci → batas jujur TANPA panggilan AI.
    // Mengarang jawaban dari konteks yang tidak relevan dilarang.
    if (bestScore <= 0 || selected.length === 0) {
      return {
        success: true,
        reply:
          'Berdasarkan teks dokumen yang terbaca, tidak ditemukan bagian yang relevan untuk menjawab pertanyaan itu — informasi ini tidak tercantum dalam dokumen, atau istilahnya berbeda dari yang dipakai dokumen. Coba rumuskan ulang dengan kata kunci yang dipakai dokumen.',
        mode: request.mode,
        contextInsufficient: true,
        truncated: fullText.length > MAX_DOC_CHARS,
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
    const historySection = this.historySection(request);
    const header =
      `Berdasarkan dokumen "${request.fileName}", jawab HANYA dari kutipan berikut. ` +
      'Sebutkan halaman sumber jawaban bila ada. Bila kutipan tidak memuat jawabannya, katakan informasi itu tidak tercantum pada bagian dokumen yang relevan.';
    const buildPrompt = (excerpts: string) =>
      `${header}\n\n${excerpts}${historySection}\n\nPertanyaan: ${question}`;

    // Rakit kutipan mengikuti anggaran request terukur: potongan prioritas
    // lebih dulu; potongan terakhir yang tidak muat penuh dipotong pada
    // sisa ruang (bila sisa ruang masih berarti).
    const overhead = buildPrompt('').length;
    let room = MAX_AI_REQUEST_CHARS - systemPrompt.length - overhead;
    const excerptParts: string[] = [];
    for (const chunk of chosen) {
      const label = `[Halaman ${chunk.startPage}–${chunk.endPage}]`;
      const block = `${label}\n${chunk.text}`;
      if (block.length + 2 <= room) {
        excerptParts.push(block);
        room -= block.length + 2;
      } else if (room >= 800) {
        excerptParts.push(block.slice(0, room));
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
      truncated: chosen.length < chunks.length,
      provider: result.provider ?? null,
      model: result.model ?? null,
    };
  }

  /**
   * Mode ENHANCE (polish §5): menyunting TEKS TARGET saja. Seluruh dokumen
   * TIDAK dikirim — konteks minimum hanya nama/jenis dokumen (fileName).
   * Validasi panjang di sini (sebelum jaringan): kosong → EMPTY_SELECTION,
   * melebihi batas → SELECTION_TOO_LONG. Keduanya error terstruktur.
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
    if (selection.length > MAX_ENHANCE_SELECTION_CHARS) {
      return {
        success: false,
        reply: '',
        mode: request.mode,
        errorCode: 'SELECTION_TOO_LONG',
        stage: 'enhance:selection',
        message: `Teks terpilih ${selection.length} karakter melebihi batas ${MAX_ENHANCE_SELECTION_CHARS} karakter untuk satu kali penyuntingan. Persempit pilihan teks Anda.`,
      };
    }

    const guidance = ENHANCE_TRANSFORM_GUIDANCE[request.transform ?? ''] ?? ENHANCE_TRANSFORM_GUIDANCE.sempurnakan;
    const parts = [
      `Sunting teks target berikut dari dokumen "${request.fileName || 'Dokumen'}". Kembalikan HANYA teks hasil suntingan — tanpa pengantar, tanpa komentar, tanpa penjelasan perubahan.`,
      `JENIS TRANSFORMASI: ${guidance}`,
    ];
    if (request.prompt?.trim()) {
      parts.push(`INSTRUKSI PENGGUNA: ${request.prompt.trim()}`);
    }
    parts.push(`TEKS TARGET:\n${selection}`);
    const userPrompt = parts.join('\n\n');

    const result = await this.aiClient.execute<unknown>({
      productId: 'DOKUMEN_AI',
      prompt: userPrompt,
      systemPrompt: systemForMode('ENHANCE'),
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
      provider: result.provider ?? null,
      model: result.model ?? null,
    };
  }

  /**
   * Mode TRANSLATE (F8): menerjemahkan SELURUH teks dokumen (markdown-lite
   * dari orchestrator) ke bahasa target. Validasi bahasa & kekosongan di
   * sini, sebelum jaringan: bahasa tak dikenal → UNKNOWN_LANGUAGE, dokumen
   * kosong → NO_DATA. Pemotongan memakai batas yang sama dengan mode lain
   * dan dilaporkan lewat flag `truncated` — tidak disembunyikan.
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
    // Sprint 1: pasang ke anggaran request terukur (irisan 140rb lama selalu
    // ditolak gateway); pemotongan tetap dilaporkan lewat flag truncated.
    const systemPrompt = systemForMode('TRANSLATE');
    const buildPrompt = (docText: string) =>
      `Terjemahkan dokumen "${request.fileName || 'Dokumen'}" berikut ke bahasa target: ${lang.english} (${lang.native}). ` +
      `Ikuti seluruh aturan preservasi pada instruksi sistem. Keluarkan hanya dokumen hasil terjemahan dalam markdown.\n\n${docText}`;
    const { prompt: userPrompt, truncated } = this.buildFittedPrompt(systemPrompt, buildPrompt, fullText);

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
      truncated,
      provider: result.provider ?? null,
      model: result.model ?? null,
    };
  }
}

export const dokumenAiService = new DokumenAiService();

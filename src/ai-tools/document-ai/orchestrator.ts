/**
 * DOCUMENT STUDIO — Orchestrator (src/ai-tools/document-ai/orchestrator.ts)
 *
 * Memisahkan intent → handler nyata di atas transport yang sudah ada
 * (DokumenAiService → providerClient → /api/ai/tools/execute). Tidak ada
 * pipeline duplikat dan tidak ada sukses semu: kegagalan provider, keluaran
 * kosong, dan intent tak dikenal selalu menjadi error TERSTRUKTUR.
 *
 * Aturan integritas (master prompt §C–J):
 * - CREATE_DOCUMENT memakai mode DRAFT (system prompt Document Assistant).
 * - REVISE_DOCUMENT mengembalikan KANDIDAT revisi — tidak pernah menerapkan
 *   perubahan ke dokumen pengguna; penerapan adalah keputusan pemanggil.
 * - REVIEW_DOCUMENT deterministik (review.ts), BUKAN panggilan AI.
 * - Ekstraksi adalah hasil AI dari dokumen sumber — bukan data resmi.
 */

import { DokumenAiService, dokumenAiService } from './service';
import { DRAFT_PROMPT_VERSION } from './prompt';
import { TEMPLATE_META, buildFieldBlock, missingRequiredFields, type DocTemplateMeta } from './docTemplates';
import { detectMissingFields, formatContextBlock } from './contextAdapter';
import { reviewDocument, scanIsiMarkers, stripHtml } from './review';
import {
  isDocumentIntent,
  type ContextField,
  type DocumentComparison,
  type DokumenAiChatRequest,
  type DokumenAiChatResponse,
  type IntentRequest,
  type IntentResult,
  type MissingFieldInfo,
} from './types';

/** Transport minimal yang dipakai orchestrator — DokumenAiService memenuhinya; tes menyuntikkan mock. */
export interface DocAiTransport {
  chat(request: DokumenAiChatRequest): Promise<DokumenAiChatResponse>;
}

const SCOPE_EXTRACTION_PROMPT = `Ekstrak LINGKUP PEKERJAAN KONSTRUKSI dari dokumen ini. Keluarkan daftar terstruktur berisi, hanya bila benar-benar tertulis di dokumen:
1. Item/divisi pekerjaan (nama persis seperti tertulis).
2. Spesifikasi atau uraian teknis yang menyertainya.
3. Volume dan satuan bila tertulis (jangan menghitung atau menebak volume yang tidak tertulis).
Tulis "Tidak tercantum dalam dokumen" untuk kategori yang tidak ada. Hasil ini adalah ekstraksi AI dari dokumen sumber, BUKAN data resmi proyek.`;

function fail(intent: IntentRequest['intent'], errorCode: string, stage: string, message: string): IntentResult {
  return { success: false, intent, missingFields: [], errorCode, stage, message };
}

function fromServiceError(intent: IntentRequest['intent'], res: DokumenAiChatResponse): IntentResult {
  return {
    success: false,
    intent,
    missingFields: [],
    errorCode: res.errorCode ?? 'PROVIDER_ERROR',
    stage: res.stage ?? 'provider',
    message: res.message ?? 'Penyedia AI gagal memproses permintaan.',
  };
}

/** Penanda [ISI: ...] pada hasil generate → missingFields pasca-generate. */
function isiMissing(content: string): MissingFieldInfo[] {
  const seen = new Set<string>();
  const out: MissingFieldInfo[] = [];
  for (const marker of scanIsiMarkers(content)) {
    const label = marker.replace(/^\[ISI:\s*/i, '').replace(/\]$/, '').trim() || marker;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({
      key: `isi:${label}`,
      label,
      reason: 'Draf menandai bagian ini sebagai belum tersedia datanya ([ISI: ...]).',
    });
  }
  return out;
}

function templateMissing(meta: DocTemplateMeta | undefined, values: Record<string, string>): MissingFieldInfo[] {
  if (!meta) return [];
  return missingRequiredFields(meta, values).map((label) => {
    const def = meta.fields.find((f) => f.label === label);
    return {
      key: def?.key ?? label,
      label,
      reason: `Field wajib template "${label}" belum diisi sebelum generate.`,
    };
  });
}

function dedupeMissing(list: MissingFieldInfo[]): MissingFieldInfo[] {
  const seen = new Set<string>();
  return list.filter((m) => (seen.has(m.key) ? false : (seen.add(m.key), true)));
}

/** Diff baris sederhana & deterministik (multiset baris ternormalisasi). */
export function compareDocumentTexts(a: string, b: string): DocumentComparison {
  const norm = (s: string) =>
    stripHtml(s)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  const linesA = norm(a);
  const linesB = norm(b);
  const count = (arr: string[]) => {
    const m = new Map<string, number>();
    for (const l of arr) m.set(l, (m.get(l) ?? 0) + 1);
    return m;
  };
  const countA = count(linesA);
  const countB = count(linesB);
  const removedSamples: string[] = [];
  const addedSamples: string[] = [];
  let removed = 0;
  let added = 0;
  let unchanged = 0;
  for (const [line, n] of countA) {
    const inB = countB.get(line) ?? 0;
    unchanged += Math.min(n, inB);
    if (n > inB) {
      removed += n - inB;
      if (removedSamples.length < 10) removedSamples.push(line);
    }
  }
  for (const [line, n] of countB) {
    const inA = countA.get(line) ?? 0;
    if (n > inA) {
      added += n - inA;
      if (addedSamples.length < 10) addedSamples.push(line);
    }
  }
  const summaryText =
    `Perbandingan deterministik (per baris): dokumen A ${linesA.length} baris, dokumen B ${linesB.length} baris; ` +
    `${unchanged} baris sama, ${added} baris hanya di B (baru/berubah), ${removed} baris hanya di A (hilang/berubah).`;
  return {
    linesA: linesA.length,
    linesB: linesB.length,
    addedLines: added,
    removedLines: removed,
    unchangedLines: unchanged,
    addedSamples,
    removedSamples,
    summaryText,
  };
}

export class DocumentStudioOrchestrator {
  private readonly transport: DocAiTransport;

  constructor(transport: DocAiTransport = dokumenAiService) {
    this.transport = transport;
  }

  /** Titik masuk tunggal. Intent tak dikenal → gagal terstruktur, tidak pernah sukses semu. */
  async handle(request: IntentRequest): Promise<IntentResult> {
    if (!isDocumentIntent(request.intent)) {
      return fail(request.intent, 'UNKNOWN_INTENT', 'intent', `Intent "${String(request.intent)}" tidak didukung Document Studio.`);
    }
    switch (request.intent) {
      case 'CREATE_DOCUMENT':
        return this.createDocument(request);
      case 'CREATE_REPORT':
        return this.createReport(request);
      case 'SUMMARIZE_DOCUMENT':
        return this.delegate(request, 'SUMMARY');
      case 'EXTRACT_DATA':
        return this.delegate(request, 'EXTRACT');
      case 'ASK_DOCUMENT':
        return this.ask(request);
      case 'REVIEW_DOCUMENT':
        return this.review(request);
      case 'REVISE_DOCUMENT':
        return this.revise(request);
      case 'COMPARE_DOCUMENTS':
        return this.compare(request);
      case 'EXTRACT_CONSTRUCTION_SCOPE':
        return this.extractScope(request);
    }
  }

  /* ---------------- CREATE ---------------- */

  private async createDocument(request: IntentRequest): Promise<IntentResult> {
    const meta = request.templateMeta;
    const values = request.fieldValues ?? {};
    const contextFields: ContextField[] = request.contextFields ?? [];

    const preMissing = dedupeMissing([
      ...templateMissing(meta, values),
      ...detectMissingFields(contextFields, meta, values),
    ]);

    const docName = request.documentName || request.fileName || meta?.id || 'Dokumen';
    const fieldBlock = buildFieldBlock(meta, values);
    const contextBlock = formatContextBlock(contextFields);
    const prompt = [
      request.instruction?.trim() ||
        `Buatkan draf dokumen "${docName}" sesuai template dan data yang diberikan. Tandai sebagai DRAF.`,
      fieldBlock,
      contextBlock,
    ]
      .filter(Boolean)
      .join('\n\n');

    // Service menolak teks dokumen kosong (NO_DATA) — konteks rakitan menjadi
    // teks pendukung bila pengguna tidak memberi dokumen referensi; terakhir,
    // instruksi pengguna sendiri adalah sumber yang sah (masukan pengguna).
    const documentText = request.documentText?.trim()
      ? request.documentText
      : [fieldBlock, contextBlock].filter(Boolean).join('\n\n') || prompt;

    const res = await this.transport.chat({
      documentText,
      fileName: docName,
      mode: 'DRAFT',
      prompt,
      timeoutMs: request.timeoutMs,
    });
    if (!res.success) return fromServiceError(request.intent, res);

    const content = (res.reply ?? '').trim();
    if (!content) {
      return fail(request.intent, 'EMPTY_RESPONSE', 'generate', 'Penyedia AI mengembalikan draf kosong — tidak ada yang disimpan.');
    }
    return {
      success: true,
      intent: request.intent,
      content,
      missingFields: dedupeMissing([...preMissing, ...isiMissing(content)]),
      promptVersion: DRAFT_PROMPT_VERSION,
    };
  }

  private async createReport(request: IntentRequest): Promise<IntentResult> {
    const meta =
      request.templateMeta ??
      TEMPLATE_META[request.reportKind === 'harian' ? 'laporan-harian' : 'laporan-mingguan'];
    if (!meta) {
      return fail(request.intent, 'NO_TEMPLATE', 'template', 'Template laporan tidak ditemukan dan tidak diberikan pemanggil.');
    }
    return this.createDocument({
      ...request,
      intent: 'CREATE_DOCUMENT',
      templateMeta: meta,
      instruction:
        request.instruction?.trim() ||
        `Buatkan draf laporan ${request.reportKind === 'harian' ? 'harian' : 'mingguan'} proyek berdasarkan data yang diberikan. Hanya gunakan progres/kendala yang benar-benar tersedia; tandai yang belum ada sebagai [ISI: ...].`,
    });
  }

  /* ---------------- Delegasi mode lama ---------------- */

  private async delegate(
    request: IntentRequest,
    mode: 'SUMMARY' | 'EXTRACT',
  ): Promise<IntentResult> {
    if (!request.documentText?.trim()) {
      return fail(request.intent, 'NO_DATA', 'document', 'Tidak ada teks dokumen yang bisa diproses.');
    }
    const res = await this.transport.chat({
      documentText: request.documentText,
      fileName: request.fileName || 'Dokumen',
      mode,
      timeoutMs: request.timeoutMs,
    });
    if (!res.success) return fromServiceError(request.intent, res);
    const content = (res.reply ?? '').trim();
    if (!content) return fail(request.intent, 'EMPTY_RESPONSE', 'generate', 'Penyedia AI mengembalikan hasil kosong.');
    return { success: true, intent: request.intent, content, missingFields: [] };
  }

  private async ask(request: IntentRequest): Promise<IntentResult> {
    if (!request.documentText?.trim()) {
      return fail(request.intent, 'NO_DATA', 'document', 'Tidak ada teks dokumen yang bisa ditanyakan.');
    }
    if (!request.instruction?.trim()) {
      return fail(request.intent, 'NO_QUESTION', 'intent', 'Pertanyaan belum ditulis.');
    }
    const res = await this.transport.chat({
      documentText: request.documentText,
      fileName: request.fileName || 'Dokumen',
      mode: 'QA',
      prompt: request.instruction,
      timeoutMs: request.timeoutMs,
    });
    if (!res.success) return fromServiceError(request.intent, res);
    const content = (res.reply ?? '').trim();
    if (!content) return fail(request.intent, 'EMPTY_RESPONSE', 'generate', 'Penyedia AI mengembalikan jawaban kosong.');
    return { success: true, intent: request.intent, content, missingFields: [] };
  }

  private async extractScope(request: IntentRequest): Promise<IntentResult> {
    if (!request.documentText?.trim()) {
      return fail(request.intent, 'NO_DATA', 'document', 'Tidak ada teks dokumen sumber untuk ekstraksi lingkup.');
    }
    // Transport: mode CHAT dipakai karena template prompt mode EXTRACT pada
    // service tidak menerima instruksi khusus; mode CHAT meneruskan prompt
    // ini apa adanya dengan system prompt "jawab hanya dari dokumen".
    const res = await this.transport.chat({
      documentText: request.documentText,
      fileName: request.fileName || 'Dokumen Sumber',
      mode: 'CHAT',
      prompt: SCOPE_EXTRACTION_PROMPT,
      timeoutMs: request.timeoutMs,
    });
    if (!res.success) return fromServiceError(request.intent, res);
    const content = (res.reply ?? '').trim();
    if (!content) return fail(request.intent, 'EMPTY_RESPONSE', 'extract', 'Ekstraksi lingkup mengembalikan hasil kosong.');
    return {
      success: true,
      intent: request.intent,
      content,
      missingFields: [],
      message: 'Hasil ekstraksi AI dari dokumen sumber — bukan data resmi proyek; verifikasi sebelum dipakai.',
    };
  }

  /* ---------------- REVIEW (deterministik) ---------------- */

  private review(request: IntentRequest): IntentResult {
    const content = request.documentText ?? '';
    if (!content.trim()) {
      return fail(request.intent, 'NO_DATA', 'document', 'Tidak ada isi dokumen yang bisa direview.');
    }
    const findings = reviewDocument(content, request.templateMeta);
    const missingFields = isiMissing(content);
    return { success: true, intent: request.intent, findings, missingFields };
  }

  /* ---------------- REVISE (kandidat, tidak menerapkan) ---------------- */

  private async revise(request: IntentRequest): Promise<IntentResult> {
    const current = request.documentText ?? '';
    if (!current.trim()) {
      return fail(request.intent, 'NO_DATA', 'document', 'Tidak ada isi dokumen yang bisa direvisi.');
    }
    if (!request.instruction?.trim()) {
      return fail(request.intent, 'NO_INSTRUCTION', 'intent', 'Instruksi revisi belum ditulis.');
    }
    const prompt = [
      `Revisi dokumen referensi berikut sesuai instruksi pengguna.`,
      `INSTRUKSI REVISI: ${request.instruction.trim()}`,
      'ATURAN REVISI (wajib): ubah HANYA bagian yang diminta instruksi; pertahankan seluruh bagian lain persis seperti aslinya; jangan mengarang fakta baru (nama, nomor, tanggal, nilai, persetujuan) — bila instruksi membutuhkan data yang tidak tersedia, tandai [ISI: ...]. Keluarkan SELURUH dokumen hasil revisi sebagai KANDIDAT untuk ditinjau pengguna sebelum diterapkan.',
    ].join('\n\n');
    const res = await this.transport.chat({
      documentText: current,
      fileName: request.fileName || 'Draf Dokumen',
      mode: 'DRAFT',
      prompt,
      timeoutMs: request.timeoutMs,
    });
    if (!res.success) return fromServiceError(request.intent, res);
    const content = (res.reply ?? '').trim();
    if (!content) {
      return fail(request.intent, 'EMPTY_RESPONSE', 'revise', 'Penyedia AI mengembalikan revisi kosong — dokumen asli tidak berubah.');
    }
    return {
      success: true,
      intent: request.intent,
      content,
      missingFields: isiMissing(content),
      promptVersion: DRAFT_PROMPT_VERSION,
      message: 'Hasil adalah kandidat revisi — belum diterapkan ke dokumen. Tinjau sebelum menerima.',
    };
  }

  /* ---------------- COMPARE ---------------- */

  private async compare(request: IntentRequest): Promise<IntentResult> {
    const a = request.documentText ?? '';
    const b = request.secondDocumentText ?? '';
    if (!a.trim() || !b.trim()) {
      return fail(
        request.intent,
        'MISSING_SECOND_DOCUMENT',
        'compare',
        'Perbandingan membutuhkan DUA dokumen (documentText dan secondDocumentText).',
      );
    }
    const comparison = compareDocumentTexts(a, b);
    let content = comparison.summaryText;
    let message: string | undefined;
    if (request.useAiNarrative) {
      const res = await this.transport.chat({
        documentText: `DOKUMEN A:\n${a}\n\nDOKUMEN B:\n${b}`,
        fileName: request.fileName || 'Perbandingan Dokumen',
        mode: 'COMPARE',
        timeoutMs: request.timeoutMs,
      });
      if (res.success && (res.reply ?? '').trim()) {
        content = `${comparison.summaryText}\n\nNarasi AI (berdasarkan isi kedua dokumen):\n${res.reply!.trim()}`;
      } else {
        message = 'Narasi AI tidak tersedia (penyedia gagal/kosong) — ringkasan deterministik tetap berlaku.';
      }
    }
    return { success: true, intent: request.intent, content, comparison, missingFields: [], message };
  }
}

export const documentStudioOrchestrator = new DocumentStudioOrchestrator();

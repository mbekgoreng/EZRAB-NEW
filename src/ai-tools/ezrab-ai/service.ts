/**
 * EZRAB AI — Service (src/ai-tools/ezrab-ai/service.ts)
 * Wraps aiToolsProviderClient for the EZRAB_AI product. Builds the prompt from the
 * separate system prompt + conversation history, enforces the registry gate, and
 * returns structured errors — never `Rp0 + SUCCESS` masquerading as a real reply.
 */

import { aiToolsProviderClient } from '../providerClient';
import { EZRAB_AI_SYSTEM_PROMPT } from './prompt';
import { getToolListText } from './tools';
import { ProjectSnapshot } from './projectContext';
import { executeTool } from './toolRegistry';
import type { ExecutionStage } from './executionRuntime';
import {
  assembleChatPrompt,
  buildCanonicalContext,
  CANONICAL_TOTAL_PROMPT_BUDGET,
} from './canonicalContext';
import { EzrabAiRequest, EzrabAiResponse, EzrabAiToolCall, EzrabAiToolResult } from './types';
import { aiToolsError } from '../types';
import { scanToolCalls } from './toolCallParser';
import { resolveAccountSectionForSend } from './accountContext';
/* D-50 (perbaikan verifikasi live 2026-11-16): derivasi saran lanjutan
 * — fungsi murni yang SAMA dengan jalur Copilot (coAssistantService),
 * dipakai ulang tanpa duplikasi logika pemicu. */
import { deriveFollowUpSuggestions } from '../../services/ai/quickActionToken';

/**
 * Satu kunci idempotensi per operasi kirim pengguna. Gateway menghormati
 * header Idempotency-Key (replay idempoten, TTL 120 dtk, hanya respons
 * sukses, ter-scope pemanggil): percobaan ulang untuk operasi yang SAMA
 * memakai kunci yang sama sehingga tidak menciptakan biaya/dokumen
 * duplikat; pesan baru = kunci baru.
 */
function newIdempotencyKey(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `ezrab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * D3 (2026-11-26) — balasan aman bila tool proyek gagal karena tidak ada
 * proyek aktif: error mentah registry (PROJECT_REQUIRED /
 * PROJECT_SCOPE_MISMATCH, "Tool … butuh proyek aktif (projectId) — …")
 * TIDAK PERNAH ditampilkan ke pengguna. Pesan kaleng di bawah adalah
 * satu-satunya teks yang boleh tampil untuk kasus itu.
 */
export const PROJECT_SCOPE_CANNED_REPLY =
  'Siap, kondisi lahan kosong sudah saya catat. Draf RAB yang sudah disusun masih tersimpan sebagai draf sementara — belum terikat ke proyek, jadi saya belum bisa memeriksa item-itemnya satu per satu dari sini. Lanjut ke pratinjau draf untuk melihat ringkasannya, atau sebutkan luas/dimensinya bila mau saya hitung volumenya dari konteks chat ini.';
/** Aksi lanjutan untuk balasan PROJECT_SCOPE di atas (lapisan service;
 *  view belum merender `actions` dari EzrabAiResponse — teks kaleng
 *  sudah menawarkan pratinjau dalam prosa; rendering tombol = tindak
 *  lanjut, lihat laporan D3). */
export const PROJECT_SCOPE_ACTIONS: Array<{ label: string; action: { kind: 'intent'; intent: string; param?: string } }> = [
  { label: 'Susun pratinjau RAB', action: { kind: 'intent', intent: 'RAB_PROJECT_PREVIEW', param: 'generate' } },
  { label: 'Lihat draf', action: { kind: 'intent', intent: 'RAB_PROJECT_PREVIEW' } },
];
export function isProjectScopeErrorCode(code: string | null | undefined): boolean {
  return code === 'PROJECT_REQUIRED' || code === 'PROJECT_SCOPE_MISMATCH';
}
/** Balasan aman bila SEMUA tool call dalam satu giliran gagal karena
 *  alasan BUKAN scope proyek — tanpa token internal apa pun. */
export const ALL_TOOLS_FAILED_REPLY =
  'Maaf, saya belum bisa menjalankan pemeriksaan itu saat ini. Silakan ketuk "Coba Lagi" atau sebutkan luas/dimensinya bila mau saya hitung dari konteks chat ini.';

/**
 * P2 — tahap eksekusi untuk SATU tool call yang benar-benar dijalankan.
 * Pemetaan ini jujur karena setiap tool call adalah event nyata (model
 * memanggilnya, registry mengeksekusinya); tool yang tidak masuk peta
 * (baca proyek, propose_*, pengetahuan) memakai 'running-tools' generik
 * — tidak pernah diklaim sebagai tahap yang lebih spesifik. Tidak ada
 * pemetaan ke 'menyusun WBS' / 'menghitung biaya': tidak ada tool yang
 * melakukan keduanya sebagai satu event bernama.
 */
export function stageForToolCall(toolName: string): ExecutionStage {
  switch (toolName) {
    case 'cari_ahsp':
      return 'mapping-ahsp';
    case 'cari_harga':
      return 'checking-prices';
    case 'hitung_qto':
    case 'volume_persegi':
    case 'luas_dinding':
    case 'subtotal':
    case 'persentase_level':
      return 'calculating-quantities';
    case 'cari_template_rab':
      return 'identifying-items';
    default:
      return 'running-tools';
  }
}

/**
 * P2 — callback tahap per kirim. EzrabAiRequest (types.ts, di luar
 * cakupan P2) tidak mendeklarasikannya — dibaca lewat cast di send(),
 * dan view meneruskannya di dalam argumen `as any` yang sudah ada.
 * Callback TIDAK PERNAH boleh melempar ke send(): setiap emisi
 * dibungkus try/catch di bawah.
 */
export type ExecutionStageCallback = (stage: ExecutionStage) => void;

export class EzrabAiService {
  public async send(request: EzrabAiRequest): Promise<EzrabAiResponse> {
    // P2 — emisi tahap dari event nyata alur kirim ini (bukan timer):
    // 'preparing' saat konteks mulai dirakit; 'reading-documents' bila
    // seksi DED/QTO ikut dalam kirim; 'contacting-model' sebelum fetch
    // provider; satu tahap per tool call yang dieksekusi. Selama satu
    // fetch non-streaming TIDAK ADA event antar-token — tahap tidak
    // berpura-pura maju di dalam fetch itu. Validasi (quality gate)
    // dipancarkan view, bukan di sini (gate hidup di view).
    const onStage = (request as unknown as { onStage?: ExecutionStageCallback }).onStage;
    const emit = (stage: ExecutionStage): void => {
      if (!onStage) return;
      try {
        onStage(stage);
      } catch {
        /* emisi tahap tidak boleh menggagalkan kirim */
      }
    };
    emit('preparing');
    if (request.dedSection || request.qtoSection) emit('reading-documents');
    // FASE B (Full Account Intelligence) — konteks akun server-backed
    // diambil SEBELUM konteks kanonis dirakit, agar seksi AKUN masuk
    // blok DATA dengan anggarannya sendiri. Aturan degradasi:
    // - pemanggil sudah membawa accountSection → dipakai apa adanya
    //   (tanpa fetch; dipakai tes + pemanggil yang sudah punya snapshot);
    // - tanpa sesi → tanpa seksi (identitas tetap anonim, perilaku lama);
    // - server tidak terjangkau → seksi satu baris berlabel tidak
    //   tersedia (ACCOUNT_UNAVAILABLE_SECTION), bukan karangan.
    // Kegagalan APA PUN di sini TIDAK PERNAH menggagalkan kirim.
    // userId scope builder diisi dari identitas sesi terverifikasi bila
    // pemanggil tidak mengisinya (view masih meneruskan null).
    let accountSection: string | null = request.accountSection ?? null;
    let accountUserId: string | null = null;
    if (accountSection == null) {
      try {
        const acct = await resolveAccountSectionForSend();
        accountSection = acct.section;
        accountUserId = acct.userId;
      } catch {
        accountSection = null;
        accountUserId = null;
      }
    }
    // FASE 1 (Canonical Context Intelligence): perakitan konteks TIDAK
    // lagi di sini — satu builder kanonis (canonicalContext.ts) dipakai
    // jalur ini DAN Copilot. Anggaran total, dedupe pesan terakhir,
    // fakta dari state terstruktur, ringkasan, dan retrieval relevan
    // semuanya milik builder; service hanya merakit prompt akhir dari
    // blok data + seksi alat, lalu memanggil provider seperti semula.
    const snapshot: ProjectSnapshot | null = (request as any).projectSnapshot ?? null;
    // Builder kanonis murni (tidak memakai singleton tool) — snapshot
    // baru di-scope ke tool SESUDAH prompt terakit, agar throw validasi
    // scope (snapshot lintas proyek) tidak membocorkan snapshot lama.
    const toolSectionProbe = assembleChatPrompt('', getToolListText());
    // Panjang seksi di luar blok data (alat + aturan bahasa) — dicadangkan
    // dari anggaran total agar prompt rakitan ≤ 16.000 karakter.
    const reservedChars = toolSectionProbe.length;
    const built = buildCanonicalContext({
      userId: request.userId ?? accountUserId,
      projectId: request.projectId ?? snapshot?.projectId ?? null,
      conversationId: request.conversationId ?? request.sessionId ?? null,
      messages: request.messages ?? [],
      projectSnapshot: snapshot,
      projectSummaryText: request.projectSummary ?? null,
      intakeContext: request.intakeContext ?? null,
      rabIntentSpec: request.rabIntentSpec ?? null,
      structuredSpecs: request.structuredSpecs ?? null,
      draftSummary: request.draftSummary ?? null,
      storedSummary: request.storedSummary ?? null,
      memorySection: request.memorySection ?? null,
      memoryReport: request.memoryReport ?? null,
      objectiveSection: request.objectiveSection ?? null,
      dedSection: request.dedSection ?? null,
      qtoSection: request.qtoSection ?? null,
      accountSection: accountSection ?? null,
      reservedChars,
    });
    // Observabilitas: satu baris JSON per kirim — ukuran tiap seksi,
    // jumlah memori/fakta yang diambil, duplikat yang dibuang, dan
    // pemotongan anggaran; memungkinkan verifikasi tanpa menebak.
    try {
      console.info('[canonical-context]', JSON.stringify(built.report));
    } catch {
      /* logging tidak boleh menggagalkan kirim */
    }
    const prompt = assembleChatPrompt(built.dataBlock, getToolListText());
    if (prompt.length > CANONICAL_TOTAL_PROMPT_BUDGET) {
      // Fail-closed yang jujur: guard ini DAPAT menyala — anggaran
      // per-seksi builder tidak menjamin prompt rakitan (blok data +
      // seksi alat + aturan bahasa) selalu ≤ anggaran total, sehingga
      // rakitan yang melebihi anggaran gagal di sini dengan pesan yang
      // dapat ditindaklanjuti — jangan kirim prompt yang pasti ditolak
      // gateway sebagai PAYLOAD_TOO_LARGE.
      return {
        success: false,
        reply: 'Permintaan terlalu besar untuk dikirim (melebihi anggaran konteks). Coba persingkat pesan atau mulai percakapan baru.',
        rawContent: '',
        requestId: '',
        errorCode: 'CONTEXT_BUDGET_EXCEEDED',
      };
    }

    // Scope read-only project tools ke snapshot permintaan ini — dikelola
    // PER TOOL oleh registry (executeTool set/clear di sekitar invoke),
    // bukan sekali untuk seluruh kirim (agar tool kedua tidak kehilangan
    // snapshot bila tool pertama membersihkannya).
    const idempotencyKey = request.idempotencyKey ?? newIdempotencyKey();
    // P2: sinyal yang sudah aborted sebelum fetch → gagal cepat sebagai
    // AbortError (view mengenalinya via isAbortError) TANPA memanggil
    // provider — tidak ada biaya untuk permintaan yang sudah dibatalkan.
    emit('contacting-model');
    request.signal?.throwIfAborted();
    const result = await aiToolsProviderClient.execute<unknown>({
      productId: 'EZRAB_AI',
      mode: request.mode ?? 'fast',
      prompt,
      systemPrompt: EZRAB_AI_SYSTEM_PROMPT,
      jsonMode: false,
      temperature: request.temperature ?? 0.4,
      maxTokens: request.maxTokens ?? 3000,
      timeoutMs: request.timeoutMs ?? 90000,
      idempotencyKey,
      signal: request.signal,
    });

    if (!result.success) {
      return { success: false, reply: result.message, rawContent: '', requestId: '', errorCode: result.errorCode };
    }

    const toolCalls: EzrabAiToolCall[] = [];
    const toolResults: EzrabAiToolResult[] = [];
    // FASE 5A fix: when the model calls a tool, the DETERMINISTIC tool output
    // becomes the reply — never leak the raw tool-call JSON to the user, and
    // never let the model replace tool figures with its own arithmetic.
    // F3: extraction is done by scanToolCalls (balanced, key-order agnostic,
    // up to 3 sequential calls). A malformed call is NEVER executed with
    // silently-emptied args — it is reported as not understood instead.
    let toolReply: string | null = null;
    let toolReplyActions: EzrabAiResponse['actions'];
    let fallbackText = result.content;
    try {
      const scan = scanToolCalls(result.content);
      fallbackText = scan.cleanText;
      if (scan.calls.length > 0) {
        const outputs: string[] = [];
        // D3 (2026-11-26): error tool mentah TIDAK PERNAH menjadi
        // jawaban — cabang di bawah memilah ok vs gagal per panggilan.
        let projectScopeFailures = 0;
        let otherFailures = 0;
        for (const call of scan.calls) {
          // P2: pembatalan menghentikan LANGKAH BERIKUTNYA — cek sebelum
          // SETIAP tool call (bukan hanya sebelum fetch): abort yang
          // tiba sesudah provider merespons (jendela antara fetch dan
          // loop) melempar AbortError di sini, sehingga tidak ada tool
          // yang dieksekusi sesudah cancel dan tidak ada output tool
          // yang ditulis sebagai jawaban.
          request.signal?.throwIfAborted();
          emit(stageForToolCall(call.toolName));
          toolCalls.push({ toolName: call.toolName, args: call.args });
          // FASE 5 — panggilan tool model TIDAK lagi langsung ke runTool:
          // lewat registry kanonis (validasi skema + permission +
          // scope proyek + idempotensi + trail audit yang sama dengan
          // Copilot & orkestrator). Actor 'model': tool konsekwensial
          // tanpa persetujuan pengguna TIDAK dijalankan (awaiting-approval).
          const exec = await executeTool({
            toolName: call.toolName,
            args: call.args,
            projectId: request.projectId ?? snapshot?.projectId ?? null,
            conversationId: request.conversationId ?? request.sessionId ?? null,
            actor: 'model',
            channel: 'chat-ai',
            projectSnapshot: snapshot,
          });
          if (exec.ok) {
            const output = exec.output ?? '';
            toolResults.push({ toolName: call.toolName, ok: true, output });
            outputs.push(output);
          } else {
            // Gagal: catat di toolResults (ok:false, observabilitas)
            // dengan teks AMAN — `exec.error` mentah (nama tool,
            // projectId, kode internal) tidak pernah masuk reply
            // maupun output hasil tool.
            toolResults.push({
              toolName: call.toolName,
              ok: false,
              output: isProjectScopeErrorCode(exec.errorCode)
                ? PROJECT_SCOPE_CANNED_REPLY
                : `Pemeriksaan ${call.toolName} tidak dapat dijalankan.`,
            });
            if (isProjectScopeErrorCode(exec.errorCode)) projectScopeFailures++;
            else otherFailures++;
          }
        }
        // Deterministic: tool output(s) ARE the answer.
        if (outputs.length > 0) {
          toolReply = outputs.join('\n\n');
        } else if (projectScopeFailures > 0 && otherFailures === 0) {
          // Semua tool gagal karena tidak ada proyek aktif: JANGAN
          // gagalkan giliran — jawab dengan prosa model bila ada,
          // kalau tidak pesan kaleng + aksi lanjutan.
          toolReply = fallbackText || PROJECT_SCOPE_CANNED_REPLY;
          toolReplyActions = PROJECT_SCOPE_ACTIONS;
        } else if (projectScopeFailures + otherFailures === scan.calls.length) {
          // Semua tool gagal karena alasan lain: success:false +
          // balasan aman agar view memakai formatAiFailureMessage +
          // jalur "Coba Lagi" (bukan error mentah).
          return {
            success: false,
            reply: ALL_TOOLS_FAILED_REPLY,
            rawContent: result.content,
            requestId: result.requestId,
            errorCode: 'TOOL_EXECUTION_FAILED',
            toolCalls: toolCalls.length ? toolCalls : undefined,
            toolResults: toolResults.length ? toolResults : undefined,
          };
        }
      } else if (scan.malformed) {
        // The model tried to call a tool but the call could not be parsed.
        // Never run it with {} args; answer with the model's remaining
        // prose if any, else a clear "not understood" — never raw JSON.
        toolReply =
          scan.cleanText ||
          'Maaf, perintah yang dibuat model tidak dapat dipahami. Coba ulangi pertanyaanmu dengan kata lain ya.';
      }
    } finally {
      // Registry mengelola snapshot proyek per tool (set/clear di
      // sekitar invoke) — tidak ada snapshot yang bocor ke request berikut.
    }

    const reply = toolReply ?? fallbackText;
    // F3 guard: an empty/whitespace reply must never become an empty chat
    // bubble that looks like a successful answer.
    if (!reply || reply.trim() === '') {
      return {
        success: false,
        reply: 'Model mengembalikan respons kosong. Silakan coba lagi.',
        rawContent: result.content,
        requestId: result.requestId,
        errorCode: 'EMPTY_RESPONSE',
      };
    }
    // D-50 (perbaikan verifikasi live 2026-11-16): balasan gateway live
    // tidak pernah membawa followUpSuggestions — saran ditempel di sisi
    // klien dari pesan pengguna terakhir + balasan FINAL (prosa LLM
    // murni ATAU output tool deterministik — keduanya dapat memuat
    // konteks volume). Pemicu tunggal yang sama dengan Copilot
    // (coAssistantService memakai deriveFollowUpSuggestions yang sama).
    // Cabang gagal di atas sengaja tanpa saran: tidak ada balasan yang
    // bisa ditindaklanjuti. Tanpa excludeActionId: jalur ini tidak
    // pernah menjalankan Quick Action terstruktur (grid Quick Action
    // berjalan lewat coAssistantService, bukan service ini).
    const lastUserMessage = [...(request.messages ?? [])]
      .reverse()
      .find((m) => m.role === 'user');
    const followUpSuggestions = deriveFollowUpSuggestions(
      lastUserMessage?.content ?? '',
      reply,
    );
    return {
      success: true,
      reply,
      rawContent: result.content,
      requestId: result.requestId,
      toolCalls: toolCalls.length ? toolCalls : undefined,
      toolResults: toolResults.length ? toolResults : undefined,
      followUpSuggestions,
      actions: toolReplyActions,
    };
  }
}

export const ezrabAiService = new EzrabAiService();

export function ezrabAiError(stage: string, message: string) {
  return aiToolsError('MODEL_ERROR', `ezrab-ai:${stage}`, message);
}

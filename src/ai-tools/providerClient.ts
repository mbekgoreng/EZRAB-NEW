/**
 * EZRAB AI TOOLS — No-Fallback AI Provider Client
 *
 * The ONLY channel the three AI products use to reach a model.
 * Enforces the registry gate: sends `getModelTarget(productId).model` verbatim.
 * Throws/surfaces MODEL_MISMATCH if anything changes it. Never fabricates success.
 */

import { getModelTarget } from './aiModelRegistry';
import { aiToolsError, AIToolsStructuredError, AIToolsErrorCode } from './types';
import { aiGatewayAuthHeaders } from './aiGatewayAuth';

export type { AIProductId } from './aiModelRegistry';

export interface AiToolsRequest {
  productId: 'EZRAB_AI' | 'DED_AI_FAST' | 'DED_AI_DETAIL' | 'DOKUMEN_AI';
  prompt: string;
  systemPrompt?: string;
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  imageDataBase64?: string;
  imageMimeType?: string;
  pdfDataBase64?: string;
  mode?: 'fast' | 'advanced';
  /** Kunci idempotensi operasi pemanggil. Dikirim apa adanya sebagai
   *  header Idempotency-Key pada panggilan gateway (jalur browser);
   *  klien TIDAK membuat/mengubah kunci — satu operasi = satu kunci,
   *  ditentukan pemanggil. Jalur non-gateway (adapter Node) tidak
   *  terpengaruh. */
  idempotencyKey?: string;
  /**
   * FINAL HARDENING §8 (2026-11-11) — sinyal pembatalan MILIK PEMANGGIL
   * (AbortSignal dari AbortController view), diteruskan apa adanya —
   * klien TIDAK membuat controller pengganti untuknya. Jalur browser:
   * sinyal ini dihubungkan ke controller timeout internal sehingga
   * abort pemanggil membatalkan fetch gateway yang sedang berjalan.
   * Jalur Node: adapter server tidak menerima AbortSignal — sinyal
   * diabaikan di sana (batas terdokumentasi di
   * bukti/timing-cancellation.md). Gateway serverless juga tidak
   * meneruskan disconnect klien ke fetch provider; abort di sini
   * menghentikan MENUNGGU di klien, bukan pekerjaan provider.
   */
  signal?: AbortSignal;
}

/**
 * SPRINT 5 (X2) — Usage provider ternormalisasi (SATU tipe bersama
 * untuk jalur browser & Node). Semua field token `number | null`:
 * null = provider/gateway TIDAK melaporkan angka itu. Nilai absen
 * TIDAK PERNAH dinormalisasi menjadi 0 — nol hanya sah bila provider
 * benar-benar mengukur nol (`usageStatus: 'measured_zero'`).
 * - cachedTokens: token input yang dilayani dari cache (sudah termasuk
 *   di dalam inputTokens menurut pelaporan provider — jangan dijumlah
 *   ulang).
 * - reasoningTokens: token penalaran (sudah termasuk di dalam
 *   outputTokens menurut pelaporan provider).
 */
export interface AiToolsUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedTokens: number | null;
  reasoningTokens: number | null;
  /** Tag sumber pelaporan ('gemini_usageMetadata' | 'oai_usage' | 'node_adapter'); bukan identitas penagih. */
  source: string | null;
}

/** Keadaan bukti usage — selaras skema client-safe gateway (X1/X4). */
export type AiToolsUsageStatus = 'measured' | 'measured_zero' | 'missing' | 'malformed';

/** Satu attempt dalam riwayat failover gateway, bentuk client-safe (X1). */
export interface AiToolsAttemptEvidence {
  provider: string | null;
  model: string | null;
  ok: boolean;
  ms: number | null;
  /** Hanya pada attempt gagal; teks error mentah tidak pernah diteruskan. */
  errorClass?: string;
  usage: AiToolsUsage | null;
  usageStatus: AiToolsUsageStatus;
}

const usageTokenOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

const USAGE_TOKEN_FIELDS = ['inputTokens', 'outputTokens', 'totalTokens', 'cachedTokens', 'reasoningTokens'] as const;

/**
 * Normalisasi usage mentah (respons gateway / adapter Node) menjadi
 * AiToolsUsage + status. Aturan kejujuran: absen → null; rusak →
 * 'malformed' + usage null (tidak pernah menjadi jumlah karangan);
 * semua angka nol persis → 'measured_zero' (berbeda dari 'missing').
 * Pure + exported untuk tes.
 */
export function normalizeAiUsage(
  raw: unknown,
  reportedStatus?: unknown,
): { usage: AiToolsUsage | null; usageStatus: AiToolsUsageStatus } {
  if (raw == null) return { usage: null, usageStatus: 'missing' };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { usage: null, usageStatus: 'malformed' };
  const rec = raw as Record<string, unknown>;
  const usage = {} as AiToolsUsage;
  let numericCount = 0;
  let allZero = true;
  let sawInvalid = false;
  for (const f of USAGE_TOKEN_FIELDS) {
    const v = rec[f];
    if (v === undefined) { usage[f] = null; continue; }
    const n = usageTokenOrNull(v);
    if (n !== null) { usage[f] = n; numericCount++; if (n !== 0) allZero = false; }
    else if (v === null) usage[f] = null;
    else { usage[f] = null; sawInvalid = true; }
  }
  usage.source = typeof rec.source === 'string' ? rec.source : null;
  if (numericCount === 0) {
    if (sawInvalid) return { usage: null, usageStatus: 'malformed' };
    // Tanpa satu pun angka terukur → bentuk kanonik tanpa-bukti:
    // usage null + 'missing' (kerangka semua-null tidak diteruskan).
    return { usage: null, usageStatus: 'missing' };
  }
  const computed: AiToolsUsageStatus = allZero ? 'measured_zero' : 'measured';
  // Status yang dilaporkan gateway (X1) dihormati bila sah & konsisten
  // dengan angka yang lolos normalisasi; selain itu hasil hitung lokal.
  const reported = typeof reportedStatus === 'string' ? reportedStatus : '';
  if ((reported === 'measured' || reported === 'measured_zero') && reported !== computed) {
    return { usage, usageStatus: computed };
  }
  return { usage, usageStatus: computed };
}

/** Normalisasi satu entri attempts[] gateway (X1) — defensif, tanpa fabrikasi. */
export function normalizeAiAttempt(raw: unknown): AiToolsAttemptEvidence | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const { usage, usageStatus } = normalizeAiUsage(rec.usage ?? null, rec.usageStatus);
  const out: AiToolsAttemptEvidence = {
    provider: typeof rec.provider === 'string' ? rec.provider : null,
    model: typeof rec.model === 'string' ? rec.model : null,
    ok: rec.ok === true,
    ms: usageTokenOrNull(rec.ms),
    usage,
    usageStatus,
  };
  if (!out.ok) out.errorClass = typeof rec.errorClass === 'string' ? rec.errorClass : 'unknown';
  return out;
}

export interface AiToolsSuccess<T = unknown> {
  success: true;
  content: string;
  structured: T | null;
  requestId: string;
  /** Identitas provider/model AKTUAL yang melayani (dari respons gateway /
   * adapter), diteruskan agar provenance hasil tidak perlu menebak.
   * null bila sumber tidak menyediakannya — pemanggil wajib jujur soal itu. */
  provider?: string | null;
  model?: string | null;
  /** SPRINT 5 (X2): usage attempt FINAL yang melayani, ternormalisasi.
   * null = tidak dilaporkan (lihat usageStatus); JANGAN dianggap nol. */
  usage?: AiToolsUsage | null;
  /** SPRINT 5 (X2): keadaan bukti usage (measured/measured_zero/missing/malformed). */
  usageStatus?: AiToolsUsageStatus;
  /** SPRINT 5 (X2): riwayat attempt gateway client-safe (X1); jalur Node: undefined (adapter tak mengekspos riwayat). */
  attempts?: AiToolsAttemptEvidence[];
}

export type AiToolsResult<T = unknown> = AiToolsSuccess<T> | AIToolsStructuredError;

const MAX_TIMEOUT_MS = 180_000;

/**
 * Map a gateway HTTP failure onto a user-facing error (Fase 3B).
 * Pure + exported for tests. The server's errorCode distinguishes an AUTH
 * rejection (401 — the gateway refused the request) and a DEMO restriction
 * (403 DEMO_RESTRICTED) from an origin rejection (403) — three causes that
 * used to collapse into one generic message.
 *
 * F3 honesty fix: this build ships with AUTH_ENABLED=false — there is NO
 * sign-in screen the user could go to. The old messages ("Silakan login
 * kembali…") instructed an action that does not exist in the app and hid
 * the real cause. Messages now name the actual cause (the gateway/server
 * refused access) and the actions that actually exist: retry, or check
 * the app's access code (kode akses) that gates this deployment.
 */
export function mapGatewayHttpError(
  status: number,
  serverErrorCode: string,
): { code: AIToolsErrorCode; message: string; retryable: boolean } {
  if (status === 401 || serverErrorCode === 'AUTH_REQUIRED') {
    return {
      code: 'AUTH_REQUIRED',
      message:
        'Akses AI ditolak oleh gerbang server. Coba lagi sebentar lagi; bila tetap gagal, periksa kode akses aplikasi Anda.',
      retryable: false,
    };
  }
  if (serverErrorCode === 'DEMO_RESTRICTED') {
    return {
      code: 'DEMO_RESTRICTED',
      message:
        'Mode Demo tidak mengizinkan permintaan ini. Coba permintaan yang lebih sederhana, atau coba lagi nanti.',
      retryable: false,
    };
  }
  // Audit 2026-10-31 (uji dinamis E6): kode dari perbaikan gateway F1 harus
  // sampai ke pengguna sebagai sebab yang sebenarnya — sebelumnya tertelan
  // pesan generik "gagal memproses" sehingga penolakan kebijakan konten
  // terlihat seperti gangguan layanan.
  if (serverErrorCode === 'CONTENT_REJECTED') {
    return {
      code: 'CONTENT_REJECTED',
      message:
        'Permintaan ditolak oleh kebijakan konten provider AI. Ubah rumusan permintaan Anda, lalu coba lagi.',
      retryable: false,
    };
  }
  if (serverErrorCode === 'AI_BAD_REQUEST') {
    return {
      code: 'AI_BAD_REQUEST',
      message:
        'Permintaan tidak valid untuk provider AI. Persingkat atau sederhanakan permintaan Anda.',
      retryable: false,
    };
  }
  // Sprint 1 (Workstream C): kegagalan ukuran dari validasi gateway harus
  // sampai sebagai sebab sebenarnya — bukan MODEL_ERROR generik. Pesan
  // jujur: muatan terlalu besar untuk satu permintaan; fitur yang mendukung
  // pemrosesan bertahap (mis. Analisis Dokumen) membaginya otomatis.
  if (status === 400 && serverErrorCode === 'PAYLOAD_TOO_LARGE') {
    return {
      code: 'PAYLOAD_TOO_LARGE',
      message:
        'Dokumen/permintaan terlalu besar untuk diproses dalam satu permintaan. Pada fitur yang mendukung, dokumen diproses dalam beberapa bagian; bila Anda melihat pesan ini, persingkat isi yang dikirim lalu coba lagi.',
      retryable: false,
    };
  }
  if (status === 400 && serverErrorCode === 'INVALID_REQUEST') {
    return {
      code: 'INVALID_REQUEST',
      message:
        'Permintaan tidak valid dan ditolak oleh gerbang server sebelum mencapai AI. Periksa isi permintaan Anda, lalu coba lagi.',
      retryable: false,
    };
  }
  const message =
    status === 403
      ? 'AI Online sementara tidak dapat diakses. Silakan coba lagi nanti.'
      : status === 429
        ? 'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.'
        : status >= 500
          ? 'Layanan AI sedang gangguan. Silakan coba lagi nanti.'
          : 'Layanan AI gagal memproses permintaan.';
  return { code: 'MODEL_ERROR', message, retryable: status >= 500 || status === 429 };
}

/**
 * Index just past the balanced close of the JSON value that starts at
 * `start` (text[start] must be '{' or '['), honouring string literals and
 * backslash escapes so braces inside strings don't affect depth.
 * Returns -1 when the value never balances out.
 */
export function balancedJsonEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * Scan `text` for balanced '{'…'}' / '['…']' spans and return the longest
 * one that parses as JSON (after a trailing-comma cleanup), or undefined
 * when nothing parses. Used by extractJson so prose brackets can never
 * hijack payload extraction.
 */
export function scanLongestParseableJson(text: string): unknown {
  let best: unknown = undefined;
  let bestLen = -1;
  let candidates = 0;
  for (let i = 0; i < text.length && candidates < 200; i++) {
    const ch = text[i];
    if (ch !== '{' && ch !== '[') continue;
    candidates++;
    const end = balancedJsonEnd(text, i);
    if (end === -1) continue;
    const slice = text.slice(i, end);
    if (slice.length <= bestLen) continue;
    try {
      best = JSON.parse(slice.replace(/,\s*([}\]])/g, '$1'));
      bestLen = slice.length;
    } catch {
      /* not valid JSON — keep scanning */
    }
  }
  return best;
}

export class AiToolsProviderClient {
  public async execute<T = unknown>(request: AiToolsRequest): Promise<AiToolsResult<T>> {
    const target = getModelTarget(request.productId);
    const isNode = typeof window === 'undefined';
    const stage = request.productId;

    if (isNode) {
      try {
        const { loadServerEnv } = await import(/* @vite-ignore */ '../../server/config/loadServerEnv');
        loadServerEnv();
        const { chatOpenAiCompatible, chatGemini } = await import(/* @vite-ignore */ '../../server/providers/multiProvider/adapters');
        const payload: any = {
          providerId: target.provider,
          modelId: target.model,
          prompt: request.prompt,
          systemPrompt: request.systemPrompt,
          jsonMode: Boolean(request.jsonMode),
          temperature: request.temperature ?? 0.1,
          maxTokens: request.maxTokens ?? 6000,
          timeoutMs: Math.min(request.timeoutMs ?? 60000, MAX_TIMEOUT_MS),
          imageDataBase64: request.imageDataBase64,
          imageMimeType: request.imageMimeType || 'image/png',
          pdfDataBase64: request.pdfDataBase64,
          mode: request.mode,
        };
        const result =
          target.provider === 'gemini'
            ? await chatGemini(payload)
            : await chatOpenAiCompatible(payload);

        if (!result || typeof result.content !== 'string' || result.content.trim() === '') {
          return aiToolsError('EMPTY_RESPONSE', stage, 'Model mengembalikan respons kosong.', { retryable: true });
        }

        let structured: T | null = null;
        if (request.jsonMode) {
          try {
            structured = (result.structuredData as T) ?? this.extractJson<T>(result.content);
          } catch {
            return aiToolsError('MALFORMED_JSON', `${stage}:parse`, 'Respons model tidak valid sebagai JSON.', { retryable: true });
          }
        }

        // SPRINT 5 (X2): adapter Node melaporkan identitas AKTUAL lewat
        // `providerId`/`modelId` — nama field lama (`provider`/`model`)
        // tidak pernah ada di hasil adapter, sehingga fallback target
        // (identitas yang DIMINTA) selalu menang dan menyamar sebagai
        // aktual. Sekarang providerId/modelId dibaca lebih dulu;
        // fallback target hanya bila adapter tak melaporkan apa pun.
        // Token adapter (promptTokens/…) kini diteruskan ternormalisasi;
        // cachedTokens tidak dilaporkan adapter → null (bukan 0).
        const rawResult = result as any;
        const hasNodeTokens =
          rawResult?.promptTokens != null || rawResult?.completionTokens != null ||
          rawResult?.totalTokens != null || rawResult?.reasoningTokens != null;
        const nodeUsage = normalizeAiUsage(hasNodeTokens ? {
          inputTokens: rawResult.promptTokens ?? null,
          outputTokens: rawResult.completionTokens ?? null,
          totalTokens: rawResult.totalTokens ?? null,
          cachedTokens: null,
          reasoningTokens: rawResult.reasoningTokens ?? null,
          source: 'node_adapter',
        } : null);
        return {
          success: true, content: result.content, structured, requestId: '',
          provider: typeof rawResult?.providerId === 'string' ? rawResult.providerId : (rawResult?.provider ?? target.provider),
          model: typeof rawResult?.modelId === 'string' ? rawResult.modelId : (rawResult?.model ?? target.model),
          usage: nodeUsage.usage,
          usageStatus: nodeUsage.usageStatus,
        };
      } catch (err: any) {
        const code = this.classifyError(err);
        return aiToolsError(code, `${stage}:provider`, this.friendly(err, code), { retryable: this.isRetryable(code) });
      }
    }

    // Browser path
    // §8: sinyal pemanggil yang sudah dibatalkan sebelum kirim → gagal
    // segera sebagai pembatalan, tanpa menyentuh jaringan sama sekali.
    if (request.signal?.aborted) {
      return aiToolsError('MODEL_TIMEOUT', `${stage}:http`, 'Permintaan dibatalkan sebelum dikirim.', { retryable: true });
    }
    const controller = new AbortController();
    // §8: hubungkan sinyal pemanggil ke controller internal (timeout
    // tetap milik klien). Listener dilepas sesudah fetch selesai agar
    // tidak menumpuk pada sinyal yang dipakai ulang pemanggil.
    const onCallerAbort = () => controller.abort();
    request.signal?.addEventListener('abort', onCallerAbort, { once: true });
    try {
      const timeoutMs = Math.min(request.timeoutMs ?? 90000, MAX_TIMEOUT_MS);
      const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs + 1000);
      const resp = await fetch('/api/ai/tools/execute', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(await aiGatewayAuthHeaders()),
          ...(request.idempotencyKey ? { 'Idempotency-Key': request.idempotencyKey } : {}),
        },
        body: JSON.stringify({
          productId: request.productId,
          prompt: request.prompt,
          systemPrompt: request.systemPrompt,
          jsonMode: Boolean(request.jsonMode),
          temperature: request.temperature ?? 0.1,
          maxTokens: request.maxTokens ?? 6000,
          timeoutMs,
          imageDataBase64: request.imageDataBase64,
          imageMimeType: request.imageMimeType || 'image/png',
          pdfDataBase64: request.pdfDataBase64,
          mode: request.mode,
        }),
      });
      globalThis.clearTimeout(timer);
      request.signal?.removeEventListener('abort', onCallerAbort);

      if (!resp.ok) {
        /* Phase 3: jangan bocorkan raw JSON / detail internal ke user.
         * Pesan ramah; detail diagnostik tetap di log server via requestId.
         * Fase 3B: errorCode server dibaca untuk membedakan penolakan AUTH
         * (401 — gerbang menolak akses) dan DEMO (403 DEMO_RESTRICTED)
         * dari penolakan origin (403) — ketiganya tadinya melebur jadi satu
         * pesan generik sehingga penyebab asli tak terlihat oleh pengguna. */
        let serverErrorCode = '';
        try {
          const errJson = await resp.json();
          serverErrorCode = String(errJson?.errorCode || '');
        } catch {
          /* body bukan JSON — lanjutkan dengan pemetaan status */
        }
        const mapped = mapGatewayHttpError(resp.status, serverErrorCode);
        return aiToolsError(mapped.code, `${stage}:http`, mapped.message, {
          retryable: mapped.retryable,
        });
      }
      let json: any;
      try {
        json = await resp.json();
      } catch {
        // GATE 6 (5F) — body sukses yang bukan JSON adalah kegagalan FORMAT
        // transport, bukan penolakan provider: tanpa cabang ini, SyntaxError
        // jatuh ke catch umum dan dipetakan ke MODEL_ERROR dengan pesan
        // "Penyedia layanan AI menolak permintaan atau terjadi kesalahan
        // otentikasi" — tuduhan yang keliru untuk body yang rusak. Konvensi
        // yang sama dengan klien DED (copilotMagicF5: 200 non-JSON →
        // MALFORMED_JSON). Retryable: kerusakan body di perbatasan gateway
        // bersifat transien (proxy/gateway glitch).
        return aiToolsError('MALFORMED_JSON', `${stage}:http`, 'Respons layanan AI tidak dapat dibaca (format tidak valid). Silakan coba lagi.', {
          retryable: true,
        });
      }
      if (!json || json.success === false) {
        return aiToolsError(
          json?.errorCode || 'MODEL_ERROR',
          json?.stage || `${stage}:gateway`,
          json?.message || 'Layanan AI gagal memproses permintaan.',
          { retryable: Boolean(json?.retryable) }
        );
      }
      // Mirror the Node path: a "successful" gateway response with empty /
      // whitespace-only content is NOT a success — surface EMPTY_RESPONSE
      // instead of letting callers render an empty bubble/result.
      if (typeof json.content !== 'string' || json.content.trim() === '') {
        return aiToolsError('EMPTY_RESPONSE', `${stage}:http`, 'Model mengembalikan respons kosong.', {
          retryable: true,
        });
      }
      let structured: T | null = null;
      if (request.jsonMode) {
        try {
          structured = (json.structured as T) ?? this.extractJson<T>(json.content);
        } catch {
          return aiToolsError('MALFORMED_JSON', `${stage}:parse`, 'Respons model tidak valid sebagai JSON.', { retryable: true });
        }
      }
      // SPRINT 5 (X2): bukti usage X1 dari gateway diteruskan
      // ternormalisasi. Respons gateway LAMA (tanpa field usage) tetap
      // diterima: usage null + 'missing' — kompatibilitas mundur utuh.
      const gwUsage = normalizeAiUsage(json.usage ?? null, json.usageStatus);
      return {
        success: true, content: json.content, structured, requestId: json.requestId,
        provider: typeof json.provider === 'string' ? json.provider : null,
        model: typeof json.model === 'string' ? json.model : null,
        usage: gwUsage.usage,
        usageStatus: gwUsage.usageStatus,
        attempts: Array.isArray(json.attempts)
          ? json.attempts.map(normalizeAiAttempt).filter((a: AiToolsAttemptEvidence | null): a is AiToolsAttemptEvidence => a !== null)
          : undefined,
      };
    } catch (err: any) {
      request.signal?.removeEventListener('abort', onCallerAbort);
      const code = err?.name === 'AbortError' ? 'MODEL_TIMEOUT' : this.classifyError(err);
      return aiToolsError(code, `${stage}:http`, this.friendly(err, code), { retryable: true });
    }
  }

  public extractJson<T = unknown>(raw: string): T {
    if (!raw || typeof raw !== 'string') {
      throw new Error('AI returned empty response text');
    }
    let text = raw.trim();
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fence && fence[1]) text = fence[1].trim();
    try {
      return JSON.parse(text) as T;
    } catch {
      /* fall through to the balanced-span scan below */
    }
    // F3 fix: the old heuristic decided array-vs-object from the FIRST '['
    // anywhere in the text — prose containing a bracket (e.g. "[gambar: …]"
    // or "[1]") hijacked the slice and the real payload failed to parse.
    // Now: scan every '{'/'[' start, take its string-aware BALANCED span,
    // keep the spans that actually parse, and return the LONGEST one (the
    // model's payload dwarfs any prose bracket). Type is returned as-is.
    const value = scanLongestParseableJson(text);
    if (value !== undefined) return value as T;
    throw new Error(`Failed to parse AI JSON response: ${text.slice(0, 160)}...`);
  }

  private classifyError(err: any): AIToolsErrorCode {
    const msg = String(err?.message || '');
    if (err instanceof Error && err.name === 'AbortError') return 'MODEL_TIMEOUT';
    if (/404|not found|unknown model|does not exist/i.test(msg)) return 'MODEL_PROVIDER_404';
    if (/timeout|timed out|ETIMEDOUT/i.test(msg)) return 'MODEL_TIMEOUT';
    if (/401|403|auth|api key/i.test(msg)) return 'MODEL_ERROR';
    if (/429|rate/i.test(msg)) return 'MODEL_ERROR';
    if (/empty/i.test(msg)) return 'EMPTY_RESPONSE';
    // Audit 2026-10-31 (uji dinamis E7): putus jaringan (fetch TypeError /
    // connection reset) sebelumnya jatuh ke MODEL_ERROR dan diberi label
    // "penyedia menolak / kesalahan otentikasi" — label yang keliru.
    if (err instanceof TypeError || /failed to fetch|network|connection|econnrefused|econnreset|load failed/i.test(msg)) return 'NETWORK_ERROR';
    return 'MODEL_ERROR';
  }

  private isRetryable(code: string): boolean {
    return code === 'MODEL_TIMEOUT' || code === 'MODEL_PROVIDER_404' || code === 'MALFORMED_JSON';
  }

  private friendly(err: any, code: string): string {
    switch (code) {
      case 'MODEL_TIMEOUT':
        return 'Proses AI memakan waktu terlalu lama dan dibatalkan. Silakan coba lagi.';
      case 'MODEL_PROVIDER_404':
        return 'Model yang diminta tidak ditemukan pada penyedia layanan (404). Periksa konfigurasi model.';
      case 'MALFORMED_JSON':
        return err?.message || 'Respons model dalam format yang tidak valid.';
      case 'NETWORK_ERROR':
        return 'Tidak dapat terhubung ke layanan AI. Periksa koneksi internet Anda, lalu coba lagi.';
      case 'MODEL_ERROR':
        return 'Penyedia layanan AI menolak permintaan atau terjadi kesalahan otentikasi.';
      default:
        return err?.message || 'Terjadi kesalahan internal saat menghubungi AI.';
    }
  }
}

export const aiToolsProviderClient = new AiToolsProviderClient();

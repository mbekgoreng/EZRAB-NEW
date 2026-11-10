/**
 * api/_lib/chatFastMetering.js — Adapter integrasi Chat FAST ke batas
 * metering bersama (Unified Credits Sprint 4, Fase 3+4)
 * ============================================================================
 * Berkas BARU, berlingkup SEMPIT: SATU-SATUNYA fitur yang dihubungkan ke
 * batas metering bersama (api/_lib/aiMetering.js) oleh adapter ini adalah
 * Chat FAST — kunci fitur kanonis server 'chat-ai/fast'. Fitur lain
 * (Chat ADVANCED, DED, AI Document, Magic, vision, deterministik) TIDAK
 * disentuh: operasi di luar cakupan berjalan persis seperti sebelumnya.
 *
 * MASALAH DESAIN YANG DIPECAHKAN (brief Sprint 4):
 * Batas metering bersama bersifat fail-closed: saat gerbang
 * AI_METERING_ENABLED mati, beginOperation menolak operasi berbayar
 * dengan AI_METERING_DISABLED. Penolakan itu TIDAK boleh menjatuhkan
 * request Chat FAST biasa. Karena itu adapter ini memeriksa gerbang
 * TERLEBIH DAHULU:
 *
 * - Gerbang MATI (env absen / bukan persis 'true'): adapter mem-BYPASS
 *   metering SEPENUHNYA. Boundary tidak dipanggil sama sekali (nol
 *   operasi, nol reservasi, nol entri ledger, nol debit simulasi) dan
 *   executor berjalan persis seperti jalur lama — hasil dikembalikan
 *   apa adanya (objek yang sama).
 * - Gerbang MENYALA: lifecycle bersama yang ada dijalankan apa adanya
 *   lewat boundary.runMeteredOperation (reserve → execute → record
 *   evidence → settle / release / REQUIRES_REVIEW). Adapter TIDAK
 *   menduplikasi state machine, tarif, atau aturan ledger apa pun.
 *
 * IDENTITAS FITUR DITURUNKAN SERVER (deriveChatFastFeatureKey):
 * - mode 'chat'  → rantai Chat AI standar. Mode ini HANYA bisa dihasilkan
 *   server: api/ai/chat.js memaksanya untuk semua trafiknya, dan
 *   api/ai/tools/execute.js menghasilkannya hanya untuk productId
 *   EZRAB_AI non-advanced. validateAiInput meng-clamp mode klien tak
 *   dikenal ke 'fast', jadi klien tidak bisa mengarang mode 'chat'.
 * - mode 'fast' + productId 'EZRAB_AI' → Chat FAST. Rantai else/'fast'
 *   di executeAI BERBAGI dengan DED_AI_FAST dan DOKUMEN_AI, jadi mode
 *   'fast' TANPA productId EZRAB_AI TIDAK dianggap Chat FAST (kalau
 *   dianggap, fitur lain ikut termeter — di luar cakupan sprint ini).
 * - mode 'advanced' / 'vision', atau productId lain apa pun → BUKAN
 *   Chat FAST (null). Konsisten dengan resolveGatewayFeature di
 *   aiMetering.js: EZRAB_AI + mode advanced → 'chat-ai/advanced'.
 *
 * IDENTITAS AKUN: hanya dari `context` terautentikasi yang disuntikkan
 * server lewat parameter adapter ({ accountId, workspaceId, userId }).
 * Adapter TIDAK menurunkan accountId dari userId (ledger Gen-2 melarang
 * id user dipakai sebagai accountId billing workspace) dan TIDAK
 * memfabrikasi konteks. Saat gerbang menyala TANPA konteks tepercaya
 * atau TANPA boundary yang disuntikkan → FAIL-CLOSED
 * (AUTH_CONTEXT_REQUIRED / METERING_BOUNDARY_UNAVAILABLE) dan provider
 * TIDAK dijalankan. Inilah keadaan produksi hari ini (AUTH_ENABLED=false,
 * belum ada resolver akun billing workspace di jalur gateway) — aktivasi
 * gerbang adalah pekerjaan terpisah sesudah konteks itu ada.
 *
 * FIELD BILLING KLIEN: payload klien (clientPayload) diperiksa terhadap
 * CLIENT_BILLING_FIELDS dari aiMetering.js saat gerbang menyala;
 * kehadiran field apa pun (featureKey, credits, token, accountId,
 * provider, model, harga, settlement, approval, dst.) ditolak eksplisit
 * CLIENT_BILLING_FIELDS_FORBIDDEN. Argumen adapter sendiri TIDAK
 * menerima featureKey dari pemanggil — kunci fitur selalu hasil
 * derivasi server di atas.
 *
 * ESTIMASI RESERVASI: server-side dari panjang teks request
 * (heuristik ±4 karakter/token yang sama dengan tokenMetering.ts
 * simulasi: ceil(chars/4)) + tunjangan output 1000 token (konstanta
 * RESERVATION_OUTPUT_ALLOWANCE_TOKENS aiMetering). Ini ESTIMASI untuk
 * reservasi saja — settlement SELALU dari usage provider aktual yang
 * dikembalikan executor (usage.inputTokens/outputTokens/cachedTokens).
 * Usage hilang/tidak lengkap diteruskan apa adanya ke boundary, yang
 * mengarahkannya ke REQUIRES_REVIEW tanpa angka karangan.
 */
import {
  isAiMeteringEnabled,
  CLIENT_BILLING_FIELDS,
} from './aiMetering.js';

export const CHAT_FAST_FEATURE_KEY = 'chat-ai/fast';
export const CHAT_FAST_PRODUCT_ID = 'EZRAB_AI';

/** Heuristik estimasi token server untuk reservasi (±4 karakter/token). */
export const CHAT_FAST_CHARS_PER_TOKEN = 4;
/** Tunjangan token output reservasi (mirror RESERVATION_OUTPUT_ALLOWANCE_TOKENS). */
export const CHAT_FAST_OUTPUT_ALLOWANCE_TOKENS = 1000;

/**
 * Derivasi server kunci fitur Chat FAST. Mengembalikan 'chat-ai/fast'
 * atau null (bukan Chat FAST → di luar cakupan adapter).
 * input: { mode, productId } — keduanya hasil pemetaan SERVER
 * (productIdToMode handler + productId tervalidasi), bukan field bebas.
 */
export function deriveChatFastFeatureKey(input) {
  const { mode, productId } = input || {};
  if (mode === 'advanced' || mode === 'vision') return null;
  if (mode === 'chat') {
    // productId asing yang menyertai mode chat bukan Chat FAST.
    if (productId && productId !== CHAT_FAST_PRODUCT_ID) return null;
    return CHAT_FAST_FEATURE_KEY;
  }
  if (mode === 'fast' || mode == null || mode === '') {
    // Rantai fast dipakai bersama DED/Dokumen/generik — hanya EZRAB_AI
    // yang terbukti Chat FAST.
    return productId === CHAT_FAST_PRODUCT_ID ? CHAT_FAST_FEATURE_KEY : null;
  }
  return null;
}

export function isChatFastOperation(input) {
  return deriveChatFastFeatureKey(input) !== null;
}

/** Estimasi token input server dari teks request (untuk reservasi). */
export function estimateChatFastServerTokens(input) {
  const { message, systemPrompt } = input || {};
  const chars = String(message || '').length + String(systemPrompt || '').length;
  return {
    tokensIn: Math.ceil(chars / CHAT_FAST_CHARS_PER_TOKEN),
    tokensOutAllowance: CHAT_FAST_OUTPUT_ALLOWANCE_TOKENS,
  };
}

function validContext(context) {
  return Boolean(
    context &&
      typeof context.accountId === 'string' && context.accountId.length > 0 &&
      typeof context.workspaceId === 'string' && context.workspaceId.length > 0 &&
      typeof context.userId === 'string' && context.userId.length > 0,
  );
}

function findForbiddenClientFields(payload) {
  if (!payload || typeof payload !== 'object') return [];
  return CLIENT_BILLING_FIELDS.filter((f) =>
    Object.prototype.hasOwnProperty.call(payload, f));
}

/**
 * Jalankan satu operasi Chat FAST lewat adapter.
 *
 * args: {
 *   mode, productId,          // identitas operasi hasil pemetaan server
 *   env?,                     // sumber env gerbang (default process.env via aiMetering)
 *   context?,                 // konteks terautentikasi server (gerbang ON: wajib)
 *   boundary?,                // createAiMeteringBoundary(...) (gerbang ON: wajib)
 *   idempotencyKey?,          // kunci operasi server (gerbang ON; default dari requestId)
 *   requestId?,
 *   message?, systemPrompt?,  // untuk estimasi reservasi server
 *   serverEstimate?,          // estimasi server eksplisit (mengalahkan heuristik teks)
 *   approvedMaxCredits?,      // batas persetujuan SERVER (kontrak R-4), bukan dari klien
 *   clientPayload?,           // payload klien mentah — HANYA diperiksa, tidak pernah dipercaya
 *   execute,                  // async () => hasil gateway executeAI ({ ok, content, provider, model, usage, ... })
 * }
 *
 * Hasil:
 * - Di luar cakupan / gerbang mati: { metered:false, featureKey, result }
 *   dengan result = objek hasil execute() apa adanya.
 * - Gerbang menyala, provider gagal: { metered:true, ok:false,
 *   status:'RELEASED', record, result } — result adalah hasil gateway
 *   yang gagal itu sendiri agar handler memperlakukannya seperti
 *   kegagalan provider biasa; reservasi sudah dilepas PENUH oleh boundary.
 * - Gerbang menyala, sukses/settle/review: { metered:true, ok:true,
 *   status, record, settledCredits?, releasedCredits?, result }.
 * - Gerbang menyala, ditolak sebelum eksekusi: { metered:true, ok:false,
 *   error, featureKey, result:null } — provider TIDAK pernah dipanggil.
 */
export async function runChatFastWithMetering(args) {
  const a = args || {};
  if (typeof a.execute !== 'function') {
    throw new Error('runChatFastWithMetering: execute wajib berupa fungsi');
  }
  const featureKey = deriveChatFastFeatureKey({ mode: a.mode, productId: a.productId });

  // Di luar cakupan: fitur lain tidak berubah sama sekali.
  if (!featureKey) {
    const result = await a.execute();
    return { metered: false, featureKey: null, result };
  }

  // GERBANG MATI → bypass total. Boundary tidak disentuh; tidak ada
  // operasi/reservasi/entri ledger/debit apa pun yang dibuat.
  if (!isAiMeteringEnabled(a.env)) {
    const result = await a.execute();
    return { metered: false, bypassed: true, featureKey, result };
  }

  // GERBANG MENYALA → fail-closed sebelum provider berjalan.
  if (!validContext(a.context)) {
    return { metered: true, ok: false, error: 'AUTH_CONTEXT_REQUIRED', featureKey, result: null };
  }
  if (!a.boundary || typeof a.boundary.runMeteredOperation !== 'function') {
    return { metered: true, ok: false, error: 'METERING_BOUNDARY_UNAVAILABLE', featureKey, result: null };
  }
  const forbidden = findForbiddenClientFields(a.clientPayload);
  if (forbidden.length > 0) {
    return {
      metered: true, ok: false, error: 'CLIENT_BILLING_FIELDS_FORBIDDEN',
      fields: forbidden, featureKey, result: null,
    };
  }

  const idempotencyKey =
    a.idempotencyKey || (a.requestId ? `chatfast-${a.requestId}` : null);
  const serverEstimate =
    a.serverEstimate || estimateChatFastServerTokens({ message: a.message, systemPrompt: a.systemPrompt });

  let failedGatewayResult = null;
  const run = await a.boundary.runMeteredOperation(
    a.context,
    {
      featureKey,
      idempotencyKey,
      serverEstimate,
      ...(a.approvedMaxCredits != null ? { approvedMaxCredits: a.approvedMaxCredits } : {}),
    },
    async () => {
      const result = await a.execute();
      if (!result || result.ok !== true) {
        // Kegagalan provider: lempar agar boundary melepas reservasi PENUH.
        failedGatewayResult = result || null;
        const err = new Error((result && result.error) || 'PROVIDER_FAILURE');
        err.code = (result && result.errorCode) || 'PROVIDER_FAILURE';
        throw err;
      }
      const u = result.usage || null;
      const usage =
        u && Number.isSafeInteger(u.inputTokens) && Number.isSafeInteger(u.outputTokens)
          ? {
              tokensIn: u.inputTokens,
              tokensOut: u.outputTokens,
              tokensCached: u.cachedTokens == null ? 0 : u.cachedTokens,
            }
          : null; // bukti hilang/tidak lengkap → boundary → REQUIRES_REVIEW
      return { provider: result.provider || null, model: result.model || null, usage, result };
    },
  );

  if (!run.ok && run.status === 'RELEASED' && failedGatewayResult) {
    // Provider gagal dan reservasi sudah dilepas penuh: teruskan hasil
    // gateway yang gagal agar handler menjawab seperti kegagalan biasa.
    return {
      metered: true, ok: false, status: 'RELEASED',
      error: run.error, record: run.record || null, result: failedGatewayResult,
    };
  }
  if (run.duplicate) {
    // Replay idempoten terminal: executor tidak dijalankan ulang dan
    // tidak ada hasil AI baru — jangan karang konten pengganti.
    return {
      metered: true, ok: Boolean(run.ok), duplicate: true,
      status: run.status, error: run.ok ? 'OPERATION_ALREADY_COMPLETED' : run.error,
      record: run.record || null, result: null,
    };
  }
  if (!run.ok) {
    return {
      metered: true, ok: false, error: run.error, status: run.status,
      record: run.record || null, result: null,
    };
  }
  return {
    metered: true, ok: true, status: run.status, record: run.record || null,
    settledCredits: run.settledCredits != null ? run.settledCredits : null,
    releasedCredits: run.releasedCredits != null ? run.releasedCredits : null,
    result: run.result !== undefined ? run.result : null,
  };
}

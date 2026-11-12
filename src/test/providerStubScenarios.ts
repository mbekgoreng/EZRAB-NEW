/**
 * GATE 6 (5F) — Provider Readiness: SKENARIO STUB BERSAMA (DATA, bukan kode
 * per skenario).
 *
 * Modul ini adalah SATU-SATUNYA definisi perilaku stub provider/gateway
 * untuk Gate 6. Dipakai oleh:
 *  - suite `chatPhase5ProviderReadiness.test.ts` (server stub lokal 4286/4287),
 *  - harness E2E `e2e/gate6-harness.mjs` (port 4186, handler gateway ASLI +
 *    transport provider STUB).
 *
 * KEJUJURAN LABEL: semua yang didefinisikan di sini adalah STUB — respons
 * buatan lokal yang meniru BENTUK (shape) respons provider/gateway, BUKAN
 * verifikasi provider nyata. Tidak ada satu pun skenario di sini yang boleh
 * dilabeli "provider terverifikasi". Validasi provider nyata yang sudah ada
 * adalah milik Gelombang D/D2/F (laporan terpisah); gate ini hanya menyiapkan
 * harness agar pengujian semacam itu bisa diulang deterministik nanti.
 *
 * Menambah skenario baru = menambah satu entri data di STUB_PROVIDER_SCENARIOS
 * atau STUB_GATEWAY_SCENARIOS di bawah (plus, bila perlu, satu cabang kecil
 * di resolver). Tidak ada kode harness baru per skenario.
 */

/** Teks penanda jawaban stub yang sah — dipakai E2E untuk mengenali balasan stub. */
export const STUB_VALID_CONTENT =
  '[STUB-GATE6] Ini jawaban stub deterministik dari harness Gate 6 (bukan provider nyata). ' +
  'Pondasi foot plat cocok untuk tanah keras dangkal, sedangkan bore pile dipakai saat daya dukung ' +
  'tanah keras berada dalam. Pemilihan akhir tetap mengikuti hasil penyelidikan tanah.';

/** Konten model dengan panggilan tool yang RUSAK (kurung tak tertutup) — skenario (g). */
export const STUB_TOOL_MALFORMED_CONTENT =
  'Saya akan mencari template yang sesuai. {"tool": "cari_template_rab", "args": {"kata_kunci": "kandang sapi"';

/** Konten model dengan panggilan tool yang args-nya bukan objek — skenario (g) varian 2. */
export const STUB_TOOL_ARGS_NOT_OBJECT_CONTENT =
  'Mencari data. {"tool": "cari_template_rab", "args": "kandang sapi"}';

/** Host upstream provider yang WAJIB dialihkan ke stub / diblokir (tidak pernah dihubungi langsung). */
export const PROVIDER_BASE_HOSTS: readonly string[] = [
  'crown.ai.id',
  'generativelanguage.googleapis.com',
  'api.zyrouter.com',
  'api.atria-asi.ai',
  'inference.dahl.global',
  'api.river.ai',
  'atmorouter.dev',
];

/** Basis URL provider (harus selaras dengan api/_lib/aiGateway.js). */
export const PROVIDER_BASE_URLS: readonly string[] = [
  'https://crown.ai.id/v1',
  'https://generativelanguage.googleapis.com/v1beta',
  'https://api.zyrouter.com/v1',
  'https://api.atria-asi.ai/v1',
  'https://inference.dahl.global/v1',
  'https://api.river.ai/v1',
  'https://atmorouter.dev/v1',
  'https://generativelanguage.googleapis.com/v1beta/openai',
];

/** Nama env kunci provider — dihapus dari env proses harness/suite (diganti kunci DUMMY). */
export const PROVIDER_KEY_ENV_NAMES: readonly string[] = [
  'CROWN_API_KEY',
  'ATMO_API_KEY',
  'ZYROUTER_API_KEY',
  'ZROUTER_API_KEY',
  'GEMINI_API_KEY',
  'ATRIA_API_KEY',
  'DAHL_API_KEY',
  'RIVER_API_KEY',
  'GEMINI_OAI_KEY',
];

/** Kunci DUMMY yang dipakai harness/suite (bukan kunci nyata apa pun). */
export const STUB_DUMMY_KEY = 'stub-dummy-key-gate6-bukan-kunci-nyata';

// ---------------------------------------------------------------------------
// PEMBANGUN BENTUK (shape builders) — meniru bentuk respons asli, tanpa isi nyata
// ---------------------------------------------------------------------------

export function buildOpenAiChatCompletion(
  content: string,
  model: string,
  opts: { id?: string; promptTokens?: number; completionTokens?: number } = {},
): Record<string, unknown> {
  const promptTokens = opts.promptTokens ?? 120;
  const completionTokens = opts.completionTokens ?? 40;
  return {
    id: opts.id ?? 'chatcmpl-stub-gate6',
    object: 'chat.completion',
    created: 1780000000,
    model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
}

export function buildGeminiGenerateContent(
  content: string,
  opts: { promptTokens?: number; candidatesTokens?: number } = {},
): Record<string, unknown> {
  const promptTokens = opts.promptTokens ?? 120;
  const candidatesTokens = opts.candidatesTokens ?? 40;
  return {
    candidates: [
      {
        content: { parts: [{ text: content }], role: 'model' },
        finishReason: 'STOP',
        index: 0,
      },
    ],
    usageMetadata: {
      promptTokenCount: promptTokens,
      candidatesTokenCount: candidatesTokens,
      totalTokenCount: promptTokens + candidatesTokens,
    },
  };
}

export function buildSseBody(chunks: string[], model: string): string {
  const lines: string[] = [];
  for (const c of chunks) {
    lines.push(
      'data: ' +
        JSON.stringify({
          id: 'chatcmpl-stub-sse',
          object: 'chat.completion.chunk',
          model,
          choices: [{ index: 0, delta: { content: c }, finish_reason: null }],
        }),
    );
  }
  lines.push(
    'data: ' +
      JSON.stringify({
        id: 'chatcmpl-stub-sse',
        object: 'chat.completion.chunk',
        model,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 120, completion_tokens: 40, total_tokens: 160 },
      }),
  );
  lines.push('data: [DONE]');
  return lines.join('\n\n') + '\n\n';
}

/** Bentuk sukses gateway /api/ai/tools/execute (lihat handleAiRequest). */
export function buildGatewaySuccess(
  content: string,
  opts: { requestId?: string; provider?: string; model?: string } = {},
): Record<string, unknown> {
  return {
    success: true,
    content,
    model: opts.model ?? 'stub-model-gate6',
    provider: opts.provider ?? 'stub-crown',
    mode: 'chat',
    requestId: opts.requestId ?? 'stub-req-gate6-1',
    durationMs: 12,
    usage: { inputTokens: 120, outputTokens: 40, totalTokens: 160, cachedTokens: null, reasoningTokens: null, source: 'oai_usage' },
    usageStatus: 'measured',
    attempts: [
      {
        provider: opts.provider ?? 'stub-crown',
        model: opts.model ?? 'stub-model-gate6',
        ok: true,
        ms: 12,
        usage: { inputTokens: 120, outputTokens: 40, totalTokens: 160, cachedTokens: null, reasoningTokens: null, source: 'oai_usage' },
        usageStatus: 'measured',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// TABEL SKENARIO PROVIDER (bentuk OpenAI-compatible / Gemini) — untuk gateway ASLI
// ---------------------------------------------------------------------------

export type StubProviderScenarioId =
  | 'valid'
  | 'valid-slow'
  | 'invalid-json'
  | 'empty'
  | 'rate-limit'
  | 'server-error'
  | 'policy'
  | 'sse'
  | 'hang'
  | 'tool-malformed';

export interface StubProviderBehavior {
  /** HTTP status yang dikembalikan stub provider. */
  status: number;
  contentType: string;
  /** Body mentah (string). */
  body: string;
  /** Penundaan sebelum merespons (ms). */
  delayMs: number;
}

export interface StubProviderScenarioDef {
  /** Deskripsi satu baris (dipakai laporan). */
  label: string;
  /** Skenario Gate 6 yang diwakili: (a)..(l). */
  gateScenario: string;
  behavior: StubProviderBehavior;
}

/**
 * Tabel perilaku stub provider. `valid-slow`/`hang` memakai delayMs default
 * yang DITIMPA oleh pemanggil (harness/suite) lewat parameter — delay adalah
 * data, bukan konstanta di kode perilaku.
 */
export const STUB_PROVIDER_SCENARIOS: Record<StubProviderScenarioId, StubProviderScenarioDef> = {
  valid: {
    label: 'STUB: provider menjawab valid (OpenAI-compatible)',
    gateScenario: '(a) respons valid',
    behavior: {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildOpenAiChatCompletion(STUB_VALID_CONTENT, 'stub-model-gate6')),
      delayMs: 0,
    },
  },
  'valid-slow': {
    label: 'STUB: provider menjawab valid sesudah jeda (untuk navigasi/cancel/reload)',
    gateScenario: '(i)/(k)/(l) — jendela interupsi',
    behavior: {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildOpenAiChatCompletion(STUB_VALID_CONTENT, 'stub-model-gate6')),
      delayMs: 12000,
    },
  },
  'invalid-json': {
    label: 'STUB: provider menjawab 200 dengan body bukan-JSON',
    gateScenario: '(b) respons invalid',
    behavior: { status: 200, contentType: 'application/json', body: 'ini bukan json {{{', delayMs: 0 },
  },
  empty: {
    label: 'STUB: provider menjawab 200 dengan content kosong',
    gateScenario: '(c) respons kosong',
    behavior: {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildOpenAiChatCompletion('', 'stub-model-gate6')),
      delayMs: 0,
    },
  },
  'rate-limit': {
    label: 'STUB: provider menjawab HTTP 429',
    gateScenario: '(e) rate limit',
    behavior: {
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'Rate limit exceeded (STUB)', type: 'rate_limit_error', code: 'rate_limit_exceeded' } }),
      delayMs: 0,
    },
  },
  'server-error': {
    label: 'STUB: provider menjawab HTTP 500',
    gateScenario: '(f) outage provider',
    behavior: {
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'Internal server error (STUB)', type: 'server_error', code: 'internal_error' } }),
      delayMs: 0,
    },
  },
  policy: {
    label: 'STUB: provider menolak 400 bernada kebijakan konten (safety)',
    gateScenario: '(b) penolakan kebijakan — tanpa failover',
    behavior: {
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'Request blocked by safety policy (STUB)', type: 'policy_error', code: 'content_policy_violation' } }),
      delayMs: 0,
    },
  },
  sse: {
    label: 'STUB: provider menjawab SSE walau diminta JSON (gaya ZyRouter)',
    gateScenario: '(a) varian SSE',
    behavior: {
      status: 200,
      contentType: 'text/event-stream',
      body: buildSseBody(['[STUB-GATE6] Jawaban ', 'stub SSE ', 'deterministik.'], 'stub-model-gate6'),
      delayMs: 0,
    },
  },
  hang: {
    label: 'STUB: provider menggantung (untuk timeout klien)',
    gateScenario: '(d) timeout',
    behavior: {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildOpenAiChatCompletion(STUB_VALID_CONTENT, 'stub-model-gate6')),
      delayMs: 120000,
    },
  },
  'tool-malformed': {
    label: 'STUB: provider menjawab valid berisi panggilan tool RUSAK',
    gateScenario: '(g) output terstruktur malformed',
    behavior: {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildOpenAiChatCompletion(STUB_TOOL_MALFORMED_CONTENT, 'stub-model-gate6')),
      delayMs: 0,
    },
  },
};

/**
 * Resolver perilaku provider: mengembalikan perilaku untuk satu panggilan.
 * `delayMsOverride` menimpa delay tabel (dipakai harness E2E untuk jendela
 * interupsi yang berbeda-beda tanpa menambah skenario baru).
 * `providerId` memilih bentuk Gemini vs OpenAI-compatible.
 */
export function resolveProviderBehavior(
  scenarioId: StubProviderScenarioId,
  opts: { delayMsOverride?: number; providerId?: string; model?: string } = {},
): StubProviderBehavior {
  const def = STUB_PROVIDER_SCENARIOS[scenarioId];
  if (!def) throw new Error(`Skenario stub provider tak dikenal: ${String(scenarioId)}`);
  const behavior: StubProviderBehavior = { ...def.behavior };
  if (typeof opts.delayMsOverride === 'number') behavior.delayMs = opts.delayMsOverride;
  // Bentuk Gemini native: bangun ulang body sukses dari konten yang sama.
  if (opts.providerId === 'gemini' && (scenarioId === 'valid' || scenarioId === 'valid-slow' || scenarioId === 'hang')) {
    behavior.body = JSON.stringify(buildGeminiGenerateContent(STUB_VALID_CONTENT));
  }
  if (opts.providerId === 'gemini' && scenarioId === 'empty') {
    behavior.body = JSON.stringify(buildGeminiGenerateContent(''));
  }
  return behavior;
}

// ---------------------------------------------------------------------------
// TABEL SKENARIO GATEWAY (bentuk /api/ai/tools/execute) — untuk klien app
// ---------------------------------------------------------------------------

export type StubGatewayScenarioId =
  | 'valid'
  | 'invalid-json'
  | 'success-false'
  | 'empty'
  | 'rate-limit'
  | 'server-error'
  | 'json-malformed-content'
  | 'json-content'
  | 'tool-malformed'
  | 'tool-malformed-pure'
  | 'slow'
  | 'fail-once';

export interface StubGatewayBehavior {
  status: number;
  contentType: string;
  body: string;
  delayMs: number;
}

export interface StubGatewayScenarioDef {
  label: string;
  gateScenario: string;
  behavior: StubGatewayBehavior;
}

export const STUB_GATEWAY_SCENARIOS: Record<StubGatewayScenarioId, StubGatewayScenarioDef> = {
  valid: {
    label: 'STUB: gateway menjawab sukses valid',
    gateScenario: '(a) respons valid',
    behavior: {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildGatewaySuccess(STUB_VALID_CONTENT)),
      delayMs: 0,
    },
  },
  'invalid-json': {
    label: 'STUB: gateway menjawab 200 dengan body bukan-JSON',
    gateScenario: '(b) respons invalid',
    behavior: { status: 200, contentType: 'text/plain', body: 'bukan json {{{', delayMs: 0 },
  },
  'success-false': {
    label: 'STUB: gateway menjawab 200 JSON success:false + errorCode',
    gateScenario: '(b) respons invalid (skema salah)',
    behavior: {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, errorCode: 'MODEL_ERROR', message: 'Layanan AI gagal memproses permintaan. (STUB)', retryable: true }),
      delayMs: 0,
    },
  },
  empty: {
    label: 'STUB: gateway menjawab sukses dengan content kosong',
    gateScenario: '(c) respons kosong',
    behavior: {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildGatewaySuccess('   ')),
      delayMs: 0,
    },
  },
  'rate-limit': {
    label: 'STUB: gateway menjawab HTTP 429 + RATE_LIMITED',
    gateScenario: '(e) rate limit',
    behavior: {
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, error: 'Terlalu banyak permintaan. Coba lagi sebentar. (STUB)', errorCode: 'RATE_LIMITED', retryAfterMs: 60000 }),
      delayMs: 0,
    },
  },
  'server-error': {
    label: 'STUB: gateway menjawab HTTP 502',
    gateScenario: '(f) outage provider',
    behavior: {
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, error: 'AI sedang tidak tersedia. (STUB)' }),
      delayMs: 0,
    },
  },
  'json-malformed-content': {
    label: 'STUB: gateway menjawab sukses, content bukan JSON (untuk jsonMode)',
    gateScenario: '(g) output terstruktur malformed',
    behavior: {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildGatewaySuccess('bukan json sama sekali, hanya prosa (STUB)')),
      delayMs: 0,
    },
  },
  'json-content': {
    label: 'STUB: gateway menjawab sukses, content adalah JSON valid (untuk jsonMode)',
    gateScenario: '(a) respons valid + jsonMode',
    behavior: {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildGatewaySuccess('{"ringkasan": "stub", "nilai": 42}')),
      delayMs: 0,
    },
  },
  'tool-malformed': {
    label: 'STUB: gateway menjawab sukses berisi panggilan tool RUSAK + prosa',
    gateScenario: '(g) output terstruktur malformed (level service)',
    behavior: {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildGatewaySuccess(STUB_TOOL_MALFORMED_CONTENT)),
      delayMs: 0,
    },
  },
  'tool-malformed-pure': {
    label: 'STUB: gateway menjawab sukses berisi HANYA panggilan tool RUSAK (tanpa prosa)',
    gateScenario: '(g) output terstruktur malformed (level service, tanpa prosa)',
    behavior: {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildGatewaySuccess('{"tool": "cari_template_rab", "args": {"kata_kunci": "kandang sapi"')),
      delayMs: 0,
    },
  },
  slow: {
    label: 'STUB: gateway menjawab valid sesudah jeda',
    gateScenario: '(d)/(i) — jendela timeout & cancel',
    behavior: {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildGatewaySuccess(STUB_VALID_CONTENT)),
      delayMs: 3000,
    },
  },
  'fail-once': {
    label: 'STUB: panggilan pertama 502, panggilan berikut valid (untuk retry)',
    gateScenario: '(j) retry sesudah gagal',
    behavior: {
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, error: 'AI sedang tidak tersedia. (STUB fail-once)' }),
      delayMs: 0,
    },
  },
};

export function resolveGatewayBehavior(
  scenarioId: StubGatewayScenarioId,
  opts: { delayMsOverride?: number; callIndex?: number } = {},
): StubGatewayBehavior {
  const def = STUB_GATEWAY_SCENARIOS[scenarioId];
  if (!def) throw new Error(`Skenario stub gateway tak dikenal: ${String(scenarioId)}`);
  // 'fail-once': panggilan pertama gagal, panggilan ke-2+ memakai perilaku 'valid'.
  if (scenarioId === 'fail-once' && (opts.callIndex ?? 0) >= 1) {
    return { ...STUB_GATEWAY_SCENARIOS.valid.behavior };
  }
  const behavior: StubGatewayBehavior = { ...def.behavior };
  if (typeof opts.delayMsOverride === 'number') behavior.delayMs = opts.delayMsOverride;
  return behavior;
}

// ---------------------------------------------------------------------------
// LOG PANGGILAN STUB (tipe bersama suite + harness)
// ---------------------------------------------------------------------------

export interface StubCallRecord {
  at: string;
  /** 'gateway' (Stub A) atau 'provider' (Stub B). */
  layer: 'gateway' | 'provider';
  url: string;
  method: string;
  /** Header Idempotency-Key yang diterima ('' bila tidak ada). */
  idempotencyKey: string;
  /** Model yang diminta (bila ada di body). */
  model: string | null;
  scenarioId: string;
  status: number;
  delayMs: number;
}

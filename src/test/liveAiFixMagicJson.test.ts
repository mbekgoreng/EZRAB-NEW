/**
 * liveAiFixMagicJson.test — REGRESI LIVE-AI-FIX (2026-11-15), Workstream 2.
 *
 * Temuan uji live Preview b8c420a (15 Nov 15:12–15:36): submit Magic AI jalur
 * langsung gagal dengan banner 'Respons model tidak valid sebagai JSON.'
 * sesudah ±60 dtk, 0 item masuk — model live mengembalikan prosa murni /
 * teks terpotong tanpa JSON sama sekali, walau flag response_format /
 * responseMimeType + skema di system prompt sudah diberikan.
 *
 * Perbaikan yang diuji di sini (src/ai-tools/providerClient.ts):
 *  (a) SATU percobaan ulang dengan instruksi JSON-only yang lebih tegas
 *      saat MALFORMED_JSON di jsonMode (titik `:parse` saja);
 *  (b) cuplikan mentah terpotong (maks 200 karakter) di `details` error
 *      untuk diagnosis; `message` (banner user) TIDAK berubah;
 *  (c) affordance coba-lagi di modal TIDAK diubah — tombol
 *      "Analisis dengan AI" sudah aktif kembali sesudah gagal dengan
 *      prompt utuh (diverifikasi manual di SmartAddWorkItemModal.tsx).
 *
 * SELURUH tes memakai STUB LOKAL — klien provider ASLI aplikasi (jalur
 * browser, seam = batas fetch) melawan respons gateway scripted. TIDAK
 * ADA panggilan provider live / berbayar, TIDAK ADA kunci provider.
 *
 * Jalankan: npx --yes tsx src/test/liveAiFixMagicJson.test.ts
 * (dari root repo ~/workspace/ezrab-unified)
 */

import {
  AiToolsProviderClient,
  scanLongestParseableJson,
  rawResponseSnippet,
  malformedJsonParseError,
  deriveJsonRetryIdempotencyKey,
  buildJsonOnlyRetryRequest,
  JSON_ONLY_RETRY_INSTRUCTION,
  JSON_RETRY_EXHAUSTED_NOTE,
  MALFORMED_JSON_SNIPPET_MAX_CHARS,
  type AiToolsRequest,
} from '../ai-tools/providerClient';

// ---------------------------------------------------------------------------
// Harness (gaya repo: assert + check berhitung, runner self-run di bawah)
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`✅ ${name}`);
  } catch (err: any) {
    failed++;
    failures.push(name);
    console.log(`❌ ${name} — ${err?.message || err}`);
  }
}

// ---------------------------------------------------------------------------
// Fixture — cermin skema JSON Magic AI (SmartAddWorkItemModal system prompt)
// ---------------------------------------------------------------------------

const VALID_JSON =
  '{"description":"Plesteran dinding","category":"Pekerjaan Dinding","volume":10,"unit":"m2","unitPrice":null,"notes":"Plesteran 1:4, tebal 15 mm"}';
const FENCED_JSON = '```json\n' + VALID_JSON + '\n```';
// Prosa murni TANPA kurung/siku apa pun — tidak ada span JSON yang bisa di-parse.
const PROSE_1 =
  'Tentu, saya akan membantu mengestimasi pekerjaan plesteran dinding seluas sepuluh meter persegi. ' +
  'Pekerjaan ini meliputi persiapan permukaan dinding, pencampuran adukan semen dan pasir, serta aplikasi plesteran secara merata.';
const PROSE_2 =
  'Baik, berikut penjelasan estimasi pekerjaan plesteran dinding. Pertama siapkan permukaan, ' +
  'kedua campur adukan dengan perbandingan yang tepat, ketiga aplikasikan plesteran dan ratakan. Estimasi ini bersifat perkiraan kasar saja.';
// Prosa dengan siku yang TIDAK bisa di-parse (kasus F3: tidak boleh membajak ekstraksi).
const BRACKET_PROSE = 'Lihat denah pada [lampiran gambar lantai 1] untuk detail ukuran ruangan.';
// JSON terpotong: kurung buka tidak pernah tertutup seimbang.
const TRUNCATED_JSON =
  '{"description":"Plesteran dinding","category":"Pekerjaan Dinding","volume":10,"unit":"m2","unitPrice":null,"notes":"terpotong di tengah kalimat';

const BANNER_MESSAGE = 'Respons model tidak valid sebagai JSON.';

// ---------------------------------------------------------------------------
// Stub fetch — seam batas fetch; respons diulang bila panggilan melebihi skrip
// (sehingga retry berlebih TERTANGKAP oleh asersi jumlah panggilan).
// ---------------------------------------------------------------------------

interface CapturedCall {
  url: string;
  headers: Record<string, string>;
  body: any;
}

function installFetchStub(script: Response[], onCall?: (index: number) => void): {
  calls: CapturedCall[];
  restore: () => void;
} {
  const calls: CapturedCall[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init?: any) => {
    const index = calls.length;
    calls.push({
      url: String(url),
      headers: { ...(init?.headers || {}) },
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    if (onCall) onCall(index);
    return script[Math.min(index, script.length - 1)];
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = originalFetch; } };
}

const gatewayOk = (content: string): Response =>
  new Response(JSON.stringify({ success: true, content, requestId: 'stub-req' }), { status: 200 });

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runLiveAiFixMagicJsonTests(): Promise<void> {
  console.log('🧪 LIVE-AI-FIX MAGIC JSON — REGRESI (stub lokal, tanpa panggilan live)');

  // Jalur browser: providerClient memilih jalur gateway bila `window` ada.
  (globalThis as { window?: unknown }).window = {};
  const client = new AiToolsProviderClient();

  try {
    // =======================================================================
    // UNIT — extractJson / scanLongestParseableJson (perilaku parse yang ada)
    // =======================================================================
    await check('U1 extractJson: JSON valid lolos tidak berubah', () => {
      const v = client.extractJson<Record<string, unknown>>(VALID_JSON);
      assert(v.description === 'Plesteran dinding', 'description terbaca');
      assert(v.volume === 10 && v.unit === 'm2', 'volume/unit terbaca');
      assert(v.unitPrice === null, 'unitPrice null dipertahankan (bukan 0 karangan)');
    });

    await check('U2 extractJson: JSON ber-fence lolos seperti sekarang', () => {
      const v = client.extractJson<Record<string, unknown>>(FENCED_JSON);
      assert(v.description === 'Plesteran dinding', 'fence ```json dilepas lalu parse');
    });

    await check('U3 extractJson: prosa murni melempar', () => {
      let threw = false;
      try { client.extractJson(PROSE_1); } catch { threw = true; }
      assert(threw, 'prosa tanpa JSON harus melempar');
    });

    await check('U4 extractJson: prosa bersiku tak-ter-parse melempar (tanpa hijack)', () => {
      let threw = false;
      try { client.extractJson(BRACKET_PROSE); } catch { threw = true; }
      assert(threw, 'siku prosa [lampiran …] bukan JSON dan harus melempar');
    });

    await check('U5 extractJson: JSON terpotong melempar', () => {
      let threw = false;
      try { client.extractJson(TRUNCATED_JSON); } catch { threw = true; }
      assert(threw, 'JSON tak-seimbang harus melempar');
    });

    await check('U6 scanLongestParseableJson: prosa & terpotong → undefined', () => {
      assert(scanLongestParseableJson(PROSE_1) === undefined, 'prosa murni → undefined');
      assert(scanLongestParseableJson(BRACKET_PROSE) === undefined, 'siku prosa → undefined');
      assert(scanLongestParseableJson(TRUNCATED_JSON) === undefined, 'terpotong → undefined');
    });

    // =======================================================================
    // UNIT — helper perbaikan (murni)
    // =======================================================================
    await check('U7 rawResponseSnippet: teks pendek utuh, panjang dipotong 200 + penanda', () => {
      assert(rawResponseSnippet('abc') === 'abc', 'teks pendek tidak berubah');
      assert(MALFORMED_JSON_SNIPPET_MAX_CHARS === 200, 'batas cuplikan = 200 karakter');
      const long = 'x'.repeat(250);
      const snip = rawResponseSnippet(long);
      assert(snip.startsWith('x'.repeat(200)), 'konten dipotong tepat 200 karakter');
      assert(snip.includes('[dipotong]'), 'penanda pemotongan ada');
      assert(rawResponseSnippet('a  \n  b') === 'a b', 'whitespace diratakan');
      assert(rawResponseSnippet('  ' + PROSE_1 + '  ').length <= 200 + '… [dipotong]'.length, 'cuplikan prosa ≤ 200 + penanda');
    });

    await check('U8 malformedJsonParseError: pesan banner tidak berubah, detail berisi cuplikan', () => {
      const e = malformedJsonParseError('EZRAB_AI', 'prose mentah contoh');
      assert(e.success === false && e.errorCode === 'MALFORMED_JSON', 'kode MALFORMED_JSON');
      assert(e.stage === 'EZRAB_AI:parse', `stage :parse (dapat ${e.stage})`);
      assert(e.message === BANNER_MESSAGE, 'message banner PERSIS seperti sebelumnya');
      assert(e.retryable === true, 'retryable true');
      assert((e.details?.length ?? 0) === 1, 'satu entri detail tanpa retry');
      assert(e.details![0].includes('prose mentah contoh'), 'detail memuat cuplikan mentah');
      const e2 = malformedJsonParseError('EZRAB_AI', 'prosa', { retried: true });
      assert(e2.details!.includes(JSON_RETRY_EXHAUSTED_NOTE), 'catatan retry habis ada bila retried');
    });

    await check('U9 deriveJsonRetryIdempotencyKey: turunan, absen, dan batas 128', () => {
      assert(deriveJsonRetryIdempotencyKey('key-1') === 'key-1:json-retry-1', 'sufiks :json-retry-1');
      assert(deriveJsonRetryIdempotencyKey(undefined) === undefined, 'tanpa kunci → tanpa kunci');
      assert(deriveJsonRetryIdempotencyKey('k'.repeat(115)) === 'k'.repeat(115) + ':json-retry-1', 'batas 128 persis masih lolos');
      assert(deriveJsonRetryIdempotencyKey('k'.repeat(120)) === undefined, '>128 → dihilangkan, bukan dipotong jadi kunci asli');
    });

    await check('U10 buildJsonOnlyRetryRequest: prompt dipertegas, field lain utuh', () => {
      const req: AiToolsRequest = {
        productId: 'EZRAB_AI',
        prompt: 'plesteran dinding 10 m2',
        systemPrompt: 'Anda estimator.',
        jsonMode: true,
        temperature: 0.3,
        maxTokens: 1000,
        timeoutMs: 5000,
        projectId: 'proj-1',
        idempotencyKey: 'key-1',
      };
      const retry = buildJsonOnlyRetryRequest(req);
      assert(retry.prompt === req.prompt + JSON_ONLY_RETRY_INSTRUCTION, 'instruksi JSON-only ditambahkan di akhir prompt');
      assert(retry.prompt.startsWith(req.prompt), 'prompt asli dipertahankan utuh di depan');
      assert(retry.idempotencyKey === 'key-1:json-retry-1', 'kunci turunan');
      assert(retry.temperature === 0.3 && retry.maxTokens === 1000 && retry.timeoutMs === 5000, 'temperature/maxTokens/timeout tidak berubah');
      assert(retry.projectId === 'proj-1' && retry.systemPrompt === 'Anda estimator.' && retry.jsonMode === true, 'konteks lain tidak berubah');
      assert(req.prompt === 'plesteran dinding 10 m2', 'request asli tidak dimutasi');
    });

    // =======================================================================
    // INTEGRASI — execute() jalur browser asli melawan fetch stub
    // =======================================================================
    await check('I1 JSON valid percobaan pertama: sukses, TEPAT 1 fetch, prompt tidak dipertegas', async () => {
      const stub = installFetchStub([gatewayOk(VALID_JSON)]);
      try {
        const r = await client.execute<Record<string, unknown>>({
          productId: 'EZRAB_AI', prompt: 'plesteran dinding 10 m2', jsonMode: true,
          idempotencyKey: 'key-tetap-123', timeoutMs: 10000,
        });
        assert(stub.calls.length === 1, `tepat 1 fetch (dapat ${stub.calls.length})`);
        assert(r.success === true, 'sukses');
        if (r.success) {
          assert((r.structured as any)?.description === 'Plesteran dinding', 'structured ter-parse');
        }
        assert(stub.calls[0].body.prompt === 'plesteran dinding 10 m2', 'prompt percobaan pertama TIDAK ditambahi instruksi');
        assert(stub.calls[0].body.jsonMode === true, 'jsonMode diteruskan');
        assert(stub.calls[0].headers['Idempotency-Key'] === 'key-tetap-123', 'kunci pemanggil dikirim verbatim');
      } finally { stub.restore(); }
    });

    await check('I2 JSON ber-fence: sukses, TEPAT 1 fetch (perilaku lama utuh)', async () => {
      const stub = installFetchStub([gatewayOk(FENCED_JSON)]);
      try {
        const r = await client.execute<Record<string, unknown>>({
          productId: 'EZRAB_AI', prompt: 'plesteran dinding 10 m2', jsonMode: true, timeoutMs: 10000,
        });
        assert(stub.calls.length === 1, `tepat 1 fetch (dapat ${stub.calls.length})`);
        assert(r.success === true && (r as any).structured?.volume === 10, 'fence lolos seperti sekarang');
      } finally { stub.restore(); }
    });

    await check('I3 prosa → prosa: retry TEPAT 1x, kunci turunan, gagal terstruktur + cuplikan', async () => {
      const stub = installFetchStub([gatewayOk(PROSE_1), gatewayOk(PROSE_2)]);
      try {
        const r = await client.execute({
          productId: 'EZRAB_AI', prompt: 'plesteran dinding 10 m2', jsonMode: true,
          idempotencyKey: 'key-magic-1', timeoutMs: 10000,
        });
        assert(stub.calls.length === 2, `tepat 2 fetch (1 retry, dapat ${stub.calls.length})`);
        // Percobaan pertama tidak dipertegas; percobaan kedua dipertegas.
        assert(!stub.calls[0].body.prompt.includes('FORMAT WAJIB'), 'percobaan 1 tanpa instruksi retry');
        assert(stub.calls[1].body.prompt.startsWith('plesteran dinding 10 m2'), 'percobaan 2 memakai prompt asli');
        assert(stub.calls[1].body.prompt.includes(JSON_ONLY_RETRY_INSTRUCTION), 'percobaan 2 membawa instruksi JSON-only');
        assert(stub.calls[1].body.jsonMode === true, 'percobaan 2 tetap jsonMode');
        // Kunci idempotensi: kunci SAMA akan me-replay prosa pertama di gateway.
        assert(stub.calls[0].headers['Idempotency-Key'] === 'key-magic-1', 'percobaan 1 kunci asli');
        assert(stub.calls[1].headers['Idempotency-Key'] === 'key-magic-1:json-retry-1', 'percobaan 2 kunci TURUNAN (anti-replay)');
        // Kegagalan akhir terstruktur; banner tidak berubah.
        assert(r.success === false, 'gagal sesudah retry habis');
        if (!r.success) {
          assert(r.errorCode === 'MALFORMED_JSON', `kode ${r.errorCode}`);
          assert(r.message === BANNER_MESSAGE, 'banner PERSIS seperti sebelumnya');
          assert(r.retryable === true, 'retryable true');
          assert(r.stage === 'EZRAB_AI:parse', `stage :parse (dapat ${r.stage})`);
          assert((r.details?.length ?? 0) === 2, 'detail = cuplikan + catatan retry');
          // 'berikut penjelasan' ada di 200 karakter pertama PROSE_2;
          // 'sepuluh meter persegi' hanya ada di PROSE_1.
          assert(r.details![0].includes('berikut penjelasan'), 'cuplikan berasal dari respons TERAKHIR (percobaan 2)');
          assert(!r.details![0].includes('sepuluh meter persegi'), 'cuplikan BUKAN dari respons pertama');
          assert(r.details![1] === JSON_RETRY_EXHAUSTED_NOTE, 'catatan retry habis');
        }
      } finally { stub.restore(); }
    });

    await check('I4 prosa → JSON valid: sukses pada retry, structured ter-parse', async () => {
      const stub = installFetchStub([gatewayOk(PROSE_1), gatewayOk(VALID_JSON)]);
      try {
        const r = await client.execute<Record<string, unknown>>({
          productId: 'EZRAB_AI', prompt: 'plesteran dinding 10 m2', jsonMode: true, timeoutMs: 10000,
        });
        assert(stub.calls.length === 2, `tepat 2 fetch (dapat ${stub.calls.length})`);
        assert(r.success === true, 'retry menyelamatkan — sukses');
        if (r.success) assert((r.structured as any)?.unit === 'm2', 'structured dari percobaan 2');
      } finally { stub.restore(); }
    });

    await check('I5 JSON terpotong → terpotong: gagal terstruktur sesudah TEPAT 1 retry', async () => {
      const stub = installFetchStub([gatewayOk(TRUNCATED_JSON), gatewayOk(TRUNCATED_JSON)]);
      try {
        const r = await client.execute({
          productId: 'EZRAB_AI', prompt: 'plesteran dinding 10 m2', jsonMode: true, timeoutMs: 10000,
        });
        assert(stub.calls.length === 2, `tepat 2 fetch (dapat ${stub.calls.length})`);
        assert(r.success === false, 'gagal terstruktur');
        if (!r.success) {
          assert(r.errorCode === 'MALFORMED_JSON', `kode ${r.errorCode}`);
          assert(r.message === BANNER_MESSAGE, 'banner tidak berubah');
          assert(r.details![0].includes('Plesteran dinding'), 'cuplikan JSON terpotong ada di detail');
          assert(r.details!.includes(JSON_RETRY_EXHAUSTED_NOTE), 'catatan retry habis');
        }
      } finally { stub.restore(); }
    });

    await check('I6 JSON terpotong → JSON valid: sukses pada retry', async () => {
      const stub = installFetchStub([gatewayOk(TRUNCATED_JSON), gatewayOk(VALID_JSON)]);
      try {
        const r = await client.execute<Record<string, unknown>>({
          productId: 'EZRAB_AI', prompt: 'plesteran dinding 10 m2', jsonMode: true, timeoutMs: 10000,
        });
        assert(stub.calls.length === 2, `tepat 2 fetch (dapat ${stub.calls.length})`);
        assert(r.success === true && (r as any).structured?.description === 'Plesteran dinding', 'retry menyelamatkan');
      } finally { stub.restore(); }
    });

    await check('I7 non-jsonMode + prosa: sukses, TANPA retry (1 fetch)', async () => {
      const stub = installFetchStub([gatewayOk(PROSE_1)]);
      try {
        const r = await client.execute({
          productId: 'EZRAB_AI', prompt: 'jelaskan plesteran', timeoutMs: 10000,
        });
        assert(stub.calls.length === 1, `tanpa jsonMode tidak ada retry (dapat ${stub.calls.length})`);
        assert(r.success === true && (r as any).content === PROSE_1, 'prosa tampil verbatim sebagai sukses');
      } finally { stub.restore(); }
    });

    await check('I8 body 200 bukan-JSON (transport :http): MALFORMED_JSON TANPA retry', async () => {
      const stub = installFetchStub([new Response('bukan json {{{', { status: 200 })]);
      try {
        const r = await client.execute({
          productId: 'EZRAB_AI', prompt: 'plesteran dinding 10 m2', jsonMode: true, timeoutMs: 10000,
        });
        assert(stub.calls.length === 1, `kegagalan transport tidak di-retry (dapat ${stub.calls.length})`);
        assert(r.success === false, 'gagal');
        if (!r.success) {
          assert(r.errorCode === 'MALFORMED_JSON', `kode ${r.errorCode}`);
          assert(r.message.includes('tidak dapat dibaca'), 'pesan transport jujur (bukan tuduhan parse)');
          assert(r.stage === 'EZRAB_AI:http', `stage :http (dapat ${r.stage})`);
        }
      } finally { stub.restore(); }
    });

    await check('I9 sinyal abort sebelum retry: TIDAK ada percobaan kedua', async () => {
      const controller = new AbortController();
      const stub = installFetchStub([gatewayOk(PROSE_1), gatewayOk(VALID_JSON)], (index) => {
        if (index === 0) controller.abort();
      });
      try {
        const r = await client.execute({
          productId: 'EZRAB_AI', prompt: 'plesteran dinding 10 m2', jsonMode: true,
          signal: controller.signal, timeoutMs: 10000,
        });
        assert(stub.calls.length === 1, `abort membatalkan retry (dapat ${stub.calls.length})`);
        assert(r.success === false, 'hasil = kegagalan percobaan pertama');
        if (!r.success) {
          assert(r.errorCode === 'MALFORMED_JSON', `kode ${r.errorCode}`);
          assert(!(r.details || []).includes(JSON_RETRY_EXHAUSTED_NOTE), 'tanpa catatan retry (retry tidak terjadi)');
          assert((r.details?.length ?? 0) === 1, 'detail tetap membawa cuplikan percobaan pertama');
        }
      } finally { stub.restore(); }
    });

    await check('I10 tanpa idempotency key: retry tetap jalan tanpa header kunci', async () => {
      const stub = installFetchStub([gatewayOk(PROSE_1), gatewayOk(PROSE_2)]);
      try {
        const r = await client.execute({
          productId: 'EZRAB_AI', prompt: 'plesteran dinding 10 m2', jsonMode: true, timeoutMs: 10000,
        });
        assert(stub.calls.length === 2, `tepat 2 fetch (dapat ${stub.calls.length})`);
        assert(stub.calls[0].headers['Idempotency-Key'] === undefined, 'percobaan 1 tanpa header kunci');
        assert(stub.calls[1].headers['Idempotency-Key'] === undefined, 'percobaan 2 tanpa header kunci');
        assert(r.success === false && (r as any).errorCode === 'MALFORMED_JSON', 'gagal terstruktur');
      } finally { stub.restore(); }
    });
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }

  console.log('====================================================');
  console.log(`🏁 LIVE-AI-FIX MAGIC JSON: ${passed} lolos, ${failed} gagal dari ${passed + failed} cek`);
  if (failed > 0) console.log(`❌ GAGAL: ${failures.join(', ')}`);
  console.log('====================================================');
  if (failed > 0) process.exitCode = 1;
}

runLiveAiFixMagicJsonTests();

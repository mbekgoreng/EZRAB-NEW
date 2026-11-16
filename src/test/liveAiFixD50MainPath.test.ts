/**
 * D-50 (jalur CHAT AI UTAMA) — Regresi perbaikan verifikasi live EZRAB (16 Nov 2026).
 *
 * Temuan live (Preview 47c7dc9): Chat AI menjawab "hitung volume sloof
 * 15/20 panjang 20 meter" dengan benar (Volume = 0,6 m³, 1 kredit) tapi
 * chip "Hitung Volume" TIDAK MUNCUL. Penyebab terbukti (FAIL1-D50.md):
 * perbaikan 15 Nov mengkabeli permukaan yang SALAH — followUpSuggestions
 * hanya ditempel di jalur Copilot mengambang (coAssistantService), yang
 * bahkan tidak dirender di menu Ezrab Chat AI, sementara Chat AI utama
 * (EzrabAiView → ezrabAiService.send) tidak punya plumbing saran sama
 * sekali (0 kemunculan `followUpSuggestions` di src/ai-tools/ezrab-ai/).
 *
 * File ini mengubah Probe B dari evidence/probe-fail1-d50-main-path.ts
 * menjadi tes regresi PERMANEN. Probe B PRA-FIX mendokumentasikan
 * kegagalan (dikutip dari FAIL1-D50.md §1b + log probe):
 *   - `response.followUpSuggestions === undefined`
 *   - `response.suggestions === undefined`
 *   - kunci respons hanya: success, reply, rawContent, requestId,
 *     toolCalls, toolsResults — padahal reply memuat "0,6 m³".
 * PASCA-FIX, TEST 1 menegaskan kebalikannya: respons yang sama
 * membawa followUpSuggestions ['Hitung Volume'].
 *
 * Perbaikan yang diuji di sini (src/ai-tools/ezrab-ai/):
 *  (1) service.send menempel deriveFollowUpSuggestions() pada balasan
 *      sukses (fungsi pemicu yang SAMA dengan Copilot — tanpa duplikasi);
 *  (2) konteks non-volume & cabang gagal tetap tanpa saran (perilaku lama);
 *  (3) label saran yang ditempel service memetakan ke dialog Quick
 *      Action lokal (kontrak yang dipakai intersepsi klik chip di view).
 *
 * Yang TIDAK diuji file ini (butuh render browser / verifikasi live):
 * penempelan res.followUpSuggestions ke ChatEntry di view.tsx (satu
 * baris), render chip QuickActionFollowUpSuggestions, dan intersepsi
 * klik chip di awal submit() — ketiganya diverifikasi inspeksi kode +
 * tsc (gerbang koordinator) dan menunggu uji live Preview.
 *
 * KEAMANAN TES: TIDAK ADA panggilan AI live berbayar. `fetch` di-stub
 * dan `window` di-shim agar providerClient memakai jalur browser
 * (jalur Node-nya memanggil adapter provider sungguhan — TIDAK BOLEH
 * tersentuh tes ini). Gateway disimulasikan lewat fixture JSON.
 *
 * Jalankan: npx tsx src/test/liveAiFixD50MainPath.test.ts
 */
import { ezrabAiService } from '../ai-tools/ezrab-ai/service';
import {
  QUICK_ACTION_TOKEN_RE,
  buildLocalQuickActionDialogue,
  deriveFollowUpSuggestions,
  resolveQuickActionContract,
  resolveQuickActionFromSuggestion,
} from '../services/ai/quickActionToken';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertNoRawToken(text: string, where: string): void {
  assert(!text.includes('[QUICK_ACTION_TRIGGER'), `Token mentah bocor di ${where}`);
  assert(!QUICK_ACTION_TOKEN_RE.test(text), `Regex token cocok di ${where}`);
}

/**
 * Pertukaran live PERSIS 16 Nov 2026 (verifikasi browser Preview 47c7dc9,
 * menu Ezrab Chat AI) — fixture yang sama dengan Probe B + TEST 9–10
 * liveAiFixD50.test.ts (jalur Copilot).
 */
const LIVE_16NOV_USER = 'hitung volume sloof 15/20 panjang 20 meter';
const LIVE_16NOV_REPLY =
  'Volume sloof 15/20 dengan panjang 20 meter adalah sebagai berikut.\n' +
  'Dimensi: 0,15 m × 0,20 m × 20 m.\n' +
  'Volume = 0,6 m³.';

const NON_VOLUME_USER = 'Ringkas RAB proyek ini.';
const NON_VOLUME_REPLY =
  'Berikut ringkasan proyek Anda: 25 item pekerjaan telah tercatat ' +
  'di spreadsheet RAB. Silakan periksa kembali uraian tiap item.';

export async function runLiveAiFixD50MainPathTests(): Promise<void> {
  console.log('🧪 RUNNING D-50 MAIN-PATH (CHAT AI UTAMA) REGRESSION TESTS');

  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as any).window;

  try {
    // Shim window: providerClient.execute memakai jalur Node (adapter
    // provider SUNGGUHAN) bila window undefined — shim ini memaksanya
    // ke jalur browser yang memakai fetch (di-stub di bawah), sehingga
    // TIDAK ADA panggilan AI live.
    (globalThis as any).window = {};

    // -------------------------------------------------------------------------
    // TEST 1 (PROBE B → REGRESI): pertukaran live PERSIS 16 Nov lewat
    // ezrabAiService.send → respons membawa ['Hitung Volume']
    // -------------------------------------------------------------------------
    // PRA-FIX (Probe B, FAIL1-D50.md §1b): success: true, reply memuat
    // "0,6 m³", TETAPI followUpSuggestions === undefined. Tes ini GAGAL
    // pada kode pra-fix dan LULUS pasca-fix — itulah regresinya.
    let gatewayCalls = 0;
    globalThis.fetch = (async (url: string, _init?: RequestInit) => {
      gatewayCalls += 1;
      assert(String(url) === '/api/ai/tools/execute', `Gateway harus dipanggil di /api/ai/tools/execute, didapat: ${url}`);
      return new Response(
        JSON.stringify({ success: true, content: LIVE_16NOV_REPLY }),
        { status: 200 },
      );
    }) as typeof fetch;

    const liveRes = await ezrabAiService.send({
      messages: [{ role: 'user', content: LIVE_16NOV_USER }],
      mode: 'fast',
    });
    assert(gatewayCalls === 1, `Jalur live harus memanggil gateway tepat 1x, didapat: ${gatewayCalls}`);
    assert(liveRes.success === true, 'Balasan stub gateway harus sukses');
    assert(
      liveRes.reply.includes('0,6 m³'),
      'Balasan harus mempertahankan teks volume dari gateway',
    );
    assert(
      Array.isArray(liveRes.followUpSuggestions) &&
        liveRes.followUpSuggestions.length === 1 &&
        liveRes.followUpSuggestions[0] === 'Hitung Volume',
      `Balasan live 16 Nov di jalur Chat AI utama harus membawa saran ['Hitung Volume'], didapat: ${JSON.stringify(liveRes.followUpSuggestions)} (pra-fix: undefined — lihat FAIL1-D50.md §1b)`,
    );
    assertNoRawToken((liveRes.followUpSuggestions as string[]).join(' '), 'saran balasan live 16 Nov (jalur utama)');
    assertNoRawToken(liveRes.reply, 'teks balasan live 16 Nov (jalur utama)');
    console.log('✅ TEST 1 PASSED: Exact 16-Nov live exchange via ezrabAiService.send carries followUpSuggestions [Hitung Volume] (Probe B regression)');

    // -------------------------------------------------------------------------
    // TEST 2: Konteks non-volume → tanpa saran (perilaku lama dipertahankan)
    // -------------------------------------------------------------------------
    gatewayCalls = 0;
    globalThis.fetch = (async (url: string, _init?: RequestInit) => {
      gatewayCalls += 1;
      assert(String(url) === '/api/ai/tools/execute', `Gateway harus dipanggil di /api/ai/tools/execute, didapat: ${url}`);
      return new Response(
        JSON.stringify({ success: true, content: NON_VOLUME_REPLY }),
        { status: 200 },
      );
    }) as typeof fetch;

    const nonVolumeRes = await ezrabAiService.send({
      messages: [{ role: 'user', content: NON_VOLUME_USER }],
      mode: 'fast',
    });
    assert(gatewayCalls === 1, `Jalur non-volume harus memanggil gateway tepat 1x, didapat: ${gatewayCalls}`);
    assert(nonVolumeRes.success === true, 'Balasan non-volume harus sukses');
    assert(
      nonVolumeRes.followUpSuggestions === undefined,
      `Konteks non-volume harus tanpa saran, didapat: ${JSON.stringify(nonVolumeRes.followUpSuggestions)}`,
    );
    console.log('✅ TEST 2 PASSED: Non-volume context yields no suggestions (old behavior preserved)');

    // -------------------------------------------------------------------------
    // TEST 3: Cabang gagal gateway → tanpa saran (tidak ada balasan yang
    // bisa ditindaklanjuti)
    // -------------------------------------------------------------------------
    gatewayCalls = 0;
    globalThis.fetch = (async (url: string, _init?: RequestInit) => {
      gatewayCalls += 1;
      assert(String(url) === '/api/ai/tools/execute', `Gateway harus dipanggil di /api/ai/tools/execute, didapat: ${url}`);
      return new Response(
        JSON.stringify({ success: false, message: 'Layanan AI gagal memproses permintaan.', errorCode: 'MODEL_ERROR' }),
        { status: 200 },
      );
    }) as typeof fetch;

    const failedRes = await ezrabAiService.send({
      messages: [{ role: 'user', content: LIVE_16NOV_USER }],
      mode: 'fast',
    });
    assert(gatewayCalls === 1, `Jalur gagal harus memanggil gateway tepat 1x, didapat: ${gatewayCalls}`);
    assert(failedRes.success === false, 'Respons gateway success:false harus menjadi success:false');
    assert(
      failedRes.followUpSuggestions === undefined,
      `Cabang gagal tidak boleh membawa saran, didapat: ${JSON.stringify(failedRes.followUpSuggestions)}`,
    );
    console.log('✅ TEST 3 PASSED: Failed gateway response carries no suggestions');

    // -------------------------------------------------------------------------
    // TEST 4 (KONTRAK KLIK CHIP): label saran yang ditempel service (TEST 1)
    // memetakan ke dialog Quick Action lokal — kontrak yang dipakai
    // intersepsi klik chip di view.tsx (submit: resolveQuickActionFrom-
    // Suggestion → buildLocalQuickActionDialogue, tanpa gateway).
    // -------------------------------------------------------------------------
    const chipLabel = (liveRes.followUpSuggestions as string[])[0];
    assert(chipLabel === 'Hitung Volume', `Label chip dari TEST 1 harus 'Hitung Volume', didapat: ${JSON.stringify(chipLabel)}`);
    const contract = resolveQuickActionFromSuggestion(chipLabel);
    assert(contract !== null, 'Label chip harus memetakan ke kontrak Quick Action');
    assert(contract!.actionId === 'HITUNG_VOLUME', 'Label chip harus memetakan ke HITUNG_VOLUME');
    assert(contract!.enabled === true, 'Kontrak hasil pemetaan harus aktif');
    const dialogue = buildLocalQuickActionDialogue(contract!);
    const volumeContract = resolveQuickActionContract('HITUNG_VOLUME');
    assert(dialogue.responseType === 'quick_action_dialogue', 'Dialog harus bertipe quick_action_dialogue');
    assert(dialogue.actionId === 'HITUNG_VOLUME', 'Dialog harus untuk HITUNG_VOLUME');
    assert(dialogue.title === 'Hitung Volume', 'Judul dialog harus label kontrak');
    assert(
      Array.isArray(dialogue.choices) && dialogue.choices.length === volumeContract!.initialChoices.length,
      `Pilihan dialog harus = initialChoices kontrak (${volumeContract!.initialChoices.length})`,
    );
    assert(dialogue.canCancel === true, 'Dialog harus dapat dibatalkan');
    assert(typeof dialogue.sessionId === 'string' && dialogue.sessionId.startsWith('qa_local_'), 'Dialog lokal memakai sessionId qa_local_*');
    assertNoRawToken(dialogue.message, 'teks dialog klik chip');
    assertNoRawToken(dialogue.title, 'judul dialog klik chip');
    // Derivasi yang dipakai service adalah fungsi yang sama dengan
    // Copilot (tanpa duplikasi logika pemicu) — kunci kesetaraan itu.
    const directDerivation = deriveFollowUpSuggestions(LIVE_16NOV_USER, LIVE_16NOV_REPLY);
    assert(
      JSON.stringify(directDerivation) === JSON.stringify(liveRes.followUpSuggestions),
      'Saran service harus identik dengan derivasi langsung (satu pemicu)',
    );
    console.log('✅ TEST 4 PASSED: Chip label from service maps to local HITUNG_VOLUME dialogue (click-intercept contract)');

    console.log('====================================================');
    console.log('🏁 ALL D-50 MAIN-PATH TESTS PASSED (4/4)');
    console.log('====================================================');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = originalWindow;
    }
  }
}

runLiveAiFixD50MainPathTests().catch((err) => {
  console.error('❌ D-50 MAIN-PATH TESTS FAILED:', err);
  process.exit(1);
});

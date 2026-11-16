/**
 * D-50 — Regresi perbaikan uji AI live EZRAB (15 Nov 2026).
 *
 * Temuan live (Preview b8c420a): chip Quick Action 'Hitung Volume'
 * TIDAK PERNAH muncul sesudah balasan AI live, sehingga dialog
 * konfirmasinya tak teruji. Penyebab: balasan gateway live tidak pernah
 * membawa followUpSuggestions — saran hanya ditempel jalur lokal/
 * deterministik, sementara cabang server coAssistantService membangun
 * aiMsg TANPA followUpSuggestions.
 *
 * Perbaikan yang diuji di sini:
 *  (1) balasan live simulasi soal volume → saran 'Hitung Volume';
 *  (2) token mentah [QUICK_ACTION_TRIGGER:…] TIDAK PERNAH muncul di
 *      pesan, saran, maupun dialog (invarian D-50 Batch E);
 *  (3) klik chip (label saran dikirim sebagai pesan) → dialog Quick
 *      Action (QuickActionDialogueData), TANPA panggilan gateway
 *      (tanpa auto-send ke AI, tanpa kredit).
 *
 * Ekstensi 16 Nov 2026 (FAIL-1, verifikasi live Preview 47c7dc9): TEST 9–10
 * mengunci pertukaran live PERSIS ("hitung volume sloof 15/20 panjang
 * 20 meter" → "Volume = 0,6 m³") pada jalur COPILOT. Keduanya LULUS —
 * membuktikan pemicu/regex dan wiring copilot BUKAN penyebab kegagalan
 * live 16 Nov. Penyebab terbukti (FAIL1-D50.md): uji live berjalan di
 * Chat AI UTAMA (EzrabAiView + ezrabAiService), yang tidak punya plumbing
 * followUpSuggestions sama sekali — perbaikannya ada di luar cakupan
 * file ini (service.ts/types.ts/view.tsx di src/ai-tools/ezrab-ai/).
 *
 * KEAMANAN TES: TIDAK ADA panggilan AI live berbayar. `fetch` di-stub
 * dan `window` di-shim agar providerClient memakai jalur browser
 * (jalur Node-nya memanggil adapter provider sungguhan — TIDAK BOLEH
 * tersentuh tes ini). Gateway disimulasikan lewat fixture JSON.
 *
 * Jalankan: npx tsx src/test/liveAiFixD50.test.ts
 */
import {
  QUICK_ACTION_TOKEN_RE,
  buildLocalQuickActionDialogue,
  composeQuickActionSend,
  deriveFollowUpSuggestions,
  resolveQuickActionContract,
  resolveQuickActionFromSuggestion,
  stripQuickActionToken,
} from '../services/ai/quickActionToken';
import { coAssistantService } from '../services/coAssistantService';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertNoRawToken(text: string, where: string): void {
  assert(!text.includes('[QUICK_ACTION_TRIGGER'), `Token mentah bocor di ${where}`);
  assert(!QUICK_ACTION_TOKEN_RE.test(text), `Regex token cocok di ${where}`);
}

/** Balasan gateway live SIMULASI (fixture — bukan panggilan AI nyata). */
const SIMULATED_LIVE_VOLUME_REPLY =
  'Volume beton untuk satu kolom 20x20 setinggi 3 m adalah 0,12 m³. ' +
  'Rumusnya: 0,2 × 0,2 × 3 = 0,12 m³ per kolom. ' +
  'Untuk 10 kolom, total volume beton adalah 1,2 m³.';

const SIMULATED_LIVE_NON_VOLUME_REPLY =
  'Berikut ringkasan proyek Anda: 25 item pekerjaan telah tercatat ' +
  'di spreadsheet RAB. Silakan periksa kembali uraian tiap item.';

/**
 * Pertukaran live PERSIS 16 Nov 2026 (verifikasi browser Preview 47c7dc9,
 * menu Ezrab Chat AI): "hitung volume sloof 15/20 panjang 20 meter" →
 * balasan memuat "Volume = 0,6 m³" (1 kredit). Dipakai TEST 9–10 untuk
 * mengunci bahwa derivasi + wiring COPILOT menangani pertukaran ini —
 * kegagalan live 16 Nov BUKAN pemicu/regex (lihat FAIL1-D50.md: penyebab
 * terbukti adalah permukaan yang salah — Chat AI utama tidak punya
 * plumbing followUpSuggestions sama sekali).
 */
const LIVE_16NOV_USER = 'hitung volume sloof 15/20 panjang 20 meter';
const LIVE_16NOV_REPLY =
  'Volume sloof 15/20 dengan panjang 20 meter adalah sebagai berikut.\n' +
  'Dimensi: 0,15 m × 0,20 m × 20 m.\n' +
  'Volume = 0,6 m³.';

export async function runLiveAiFixD50Tests(): Promise<void> {
  console.log('🧪 RUNNING D-50 LIVE-AI QUICK ACTION REGRESSION TESTS');

  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as any).window;

  try {
    coAssistantService.resetSession();

    // -------------------------------------------------------------------------
    // TEST 1: Balasan live simulasi soal volume → saran 'Hitung Volume'
    // -------------------------------------------------------------------------
    const suggestions = deriveFollowUpSuggestions(
      'Berapa volume beton untuk kolom 20x20 setinggi 3 meter?',
      SIMULATED_LIVE_VOLUME_REPLY,
    );
    assert(
      Array.isArray(suggestions) && suggestions.length === 1 && suggestions[0] === 'Hitung Volume',
      `Derivasi volume harus menghasilkan ['Hitung Volume'], didapat: ${JSON.stringify(suggestions)}`,
    );
    // Sinyal hanya dari balasan (pesan pengguna netral) tetap memicu saran.
    const replyOnly = deriveFollowUpSuggestions('Berapa beton kolom itu?', SIMULATED_LIVE_VOLUME_REPLY);
    assert(
      Array.isArray(replyOnly) && replyOnly[0] === 'Hitung Volume',
      'Sinyal volume dari balasan saja harus memicu saran Hitung Volume',
    );
    // Sinyal hanya dari pesan pengguna (balasan netral) tetap memicu saran.
    const userOnly = deriveFollowUpSuggestions(
      'Tolong hitung volume galian tanah pondasi.',
      'Baik, saya bantu. Silakan berikan dimensi galian.',
    );
    assert(
      Array.isArray(userOnly) && userOnly[0] === 'Hitung Volume',
      'Sinyal volume dari pesan pengguna saja harus memicu saran Hitung Volume',
    );
    console.log('✅ TEST 1 PASSED: Simulated live volume reply produces [Hitung Volume]');

    // -------------------------------------------------------------------------
    // TEST 2: Derivasi negatif — non-volume & aksi yang baru dijalankan
    // -------------------------------------------------------------------------
    const nonVolume = deriveFollowUpSuggestions(
      'Ringkas RAB proyek ini.',
      SIMULATED_LIVE_NON_VOLUME_REPLY,
    );
    assert(nonVolume === undefined, `Konteks non-volume harus tanpa saran, didapat: ${JSON.stringify(nonVolume)}`);
    const excluded = deriveFollowUpSuggestions(
      'Bantu saya menghitung volume pekerjaan',
      SIMULATED_LIVE_VOLUME_REPLY,
      'HITUNG_VOLUME',
    );
    assert(excluded === undefined, 'Aksi yang baru dijalankan tidak boleh disarankan ulang');
    console.log('✅ TEST 2 PASSED: Non-volume context yields no suggestions; just-run action is not re-suggested');

    // -------------------------------------------------------------------------
    // TEST 3: TIDAK ADA token mentah di saran, dialog, dan pengiriman
    // -------------------------------------------------------------------------
    assertNoRawToken((suggestions as string[]).join(' '), 'saran lanjutan');
    const volumeContract = resolveQuickActionContract('HITUNG_VOLUME');
    assert(volumeContract !== null, 'Kontrak HITUNG_VOLUME harus ada dan aktif');
    const dialogue = buildLocalQuickActionDialogue(volumeContract!);
    assertNoRawToken(dialogue.message, 'teks dialog');
    assertNoRawToken(dialogue.title, 'judul dialog');
    const composed = composeQuickActionSend('HITUNG_VOLUME', 'Bantu saya menghitung volume pekerjaan');
    assert(composed !== null, 'composeQuickActionSend HITUNG_VOLUME harus valid');
    assertNoRawToken(composed!.message, 'pesan pengiriman quick action');
    assert(composed!.quickActionId === 'HITUNG_VOLUME', 'quickActionId terstruktur harus HITUNG_VOLUME');
    // Invarian lama tetap: token legacy di-strip sebelum tampil/persist.
    assert(
      stripQuickActionToken('[QUICK_ACTION_TRIGGER:HITUNG_VOLUME] Bantu saya menghitung volume pekerjaan') ===
        'Bantu saya menghitung volume pekerjaan',
      'stripQuickActionToken harus menghapus token legacy',
    );
    console.log('✅ TEST 3 PASSED: No raw [QUICK_ACTION_TRIGGER:...] token in suggestions, dialogue, or send payload');

    // -------------------------------------------------------------------------
    // TEST 4: Pemetaan saran → kontrak (label saja, case-insensitive)
    // -------------------------------------------------------------------------
    const byLabel = resolveQuickActionFromSuggestion('Hitung Volume');
    assert(byLabel !== null && byLabel.actionId === 'HITUNG_VOLUME', 'Label Hitung Volume harus memetakan ke HITUNG_VOLUME');
    assert(byLabel!.enabled === true, 'Kontrak hasil pemetaan harus aktif');
    const byLabelVariant = resolveQuickActionFromSuggestion('  hitung VOLUME  ');
    assert(byLabelVariant !== null && byLabelVariant.actionId === 'HITUNG_VOLUME', 'Variasi kapital/spasi harus tetap memetakan');
    assert(resolveQuickActionFromSuggestion('Hitung Volume QTO') === null, 'Label yang tidak persis (Hitung Volume QTO) tidak boleh memetakan');
    assert(resolveQuickActionFromSuggestion('') === null, 'Saran kosong tidak boleh memetakan');
    assert(resolveQuickActionFromSuggestion('Tidak Ada Aksi') === null, 'Saran tak dikenal tidak boleh memetakan');
    console.log('✅ TEST 4 PASSED: Suggestion label maps to HITUNG_VOLUME contract (exact label only)');

    // -------------------------------------------------------------------------
    // TEST 5: Pemetaan saran → dialog (data QuickActionDialogueRenderer)
    // -------------------------------------------------------------------------
    assert(dialogue.responseType === 'quick_action_dialogue', 'Dialog harus bertipe quick_action_dialogue');
    assert(dialogue.actionId === 'HITUNG_VOLUME', 'Dialog harus untuk HITUNG_VOLUME');
    assert(dialogue.title === 'Hitung Volume', 'Judul dialog harus label kontrak');
    assert(
      Array.isArray(dialogue.choices) && dialogue.choices.length === volumeContract!.initialChoices.length,
      `Pilihan dialog harus = initialChoices kontrak (${volumeContract!.initialChoices.length})`,
    );
    assert(
      dialogue.choices.some((c) => c.id === 'CONCRETE'),
      'Pilihan dialog harus memuat jenis pekerjaan kontrak (CONCRETE)',
    );
    assert(dialogue.canCancel === true, 'Dialog harus dapat dibatalkan');
    assert(dialogue.canGoBack === false, 'Dialog awal tanpa langkah mundur');
    assert(typeof dialogue.sessionId === 'string' && dialogue.sessionId.startsWith('qa_local_'), 'Dialog lokal memakai sessionId qa_local_*');
    console.log('✅ TEST 5 PASSED: Suggestion maps to QuickActionDialogueData (HITUNG_VOLUME, contract choices, cancellable)');

    // -------------------------------------------------------------------------
    // TEST 6: Jalur dialog konfirmasi grid Quick Action tetap utuh
    // -------------------------------------------------------------------------
    const unknown = composeQuickActionSend('TIDAK_ADA', 'Halo');
    assert(unknown === null, 'Aksi tak dikenal harus ditolak composeQuickActionSend (klik diabaikan, bukan dikirim mentah)');
    const emptyPrompt = composeQuickActionSend('HITUNG_VOLUME', '   ');
    assert(emptyPrompt === null, 'Prompt kosong harus ditolak composeQuickActionSend');
    console.log('✅ TEST 6 PASSED: Confirm-dialog compose path intact (unknown/empty actions rejected)');

    // -------------------------------------------------------------------------
    // TEST 7 (INTEGRASI): sendMessage + gateway stub → saran ditempel
    // -------------------------------------------------------------------------
    // Shim window: providerClient.execute memakai jalur Node (adapter
    // provider SUNGGUHAN) bila window undefined — shim ini memaksanya
    // ke jalur browser yang memakai fetch (di-stub di bawah), sehingga
    // TIDAK ADA panggilan AI live.
    (globalThis as any).window = {};
    let gatewayCalls = 0;
    let gatewayBody = '';
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      gatewayCalls += 1;
      gatewayBody = String(init?.body || '');
      assert(String(url) === '/api/ai/tools/execute', `Gateway harus dipanggil di /api/ai/tools/execute, didapat: ${url}`);
      return new Response(
        JSON.stringify({ success: true, content: SIMULATED_LIVE_VOLUME_REPLY }),
        { status: 200 },
      );
    }) as typeof fetch;

    const liveResult = await coAssistantService.sendMessage({
      message: 'Berapa volume beton untuk kolom 20x20 setinggi 3 meter?',
      currentProject: null,
    });
    assert(gatewayCalls === 1, `Jalur live harus memanggil gateway tepat 1x, didapat: ${gatewayCalls}`);
    assert(gatewayBody.includes('EZRAB_AI'), 'Panggilan gateway harus memakai productId EZRAB_AI (rantai chat)');
    assert(liveResult.message.source === 'server', 'Balasan stub gateway harus ber-provenance server');
    assert(
      Array.isArray(liveResult.message.followUpSuggestions) &&
        liveResult.message.followUpSuggestions.length === 1 &&
        liveResult.message.followUpSuggestions[0] === 'Hitung Volume',
      `Balasan live soal volume harus membawa saran ['Hitung Volume'], didapat: ${JSON.stringify(liveResult.message.followUpSuggestions)}`,
    );
    assertNoRawToken(liveResult.message.text, 'teks balasan live');
    assertNoRawToken((liveResult.message.followUpSuggestions as string[]).join(' '), 'saran balasan live');
    console.log('✅ TEST 7 PASSED: Stubbed live gateway reply carries followUpSuggestions [Hitung Volume] (server provenance)');

    // -------------------------------------------------------------------------
    // TEST 8 (INTEGRASI): klik chip 'Hitung Volume' → dialog, TANPA gateway
    // -------------------------------------------------------------------------
    gatewayCalls = 0;
    const chipResult = await coAssistantService.sendMessage({
      message: 'Hitung Volume',
      currentProject: null,
    });
    assert(gatewayCalls === 0, `Klik chip TIDAK BOLEH memanggil gateway (auto-send), didapat: ${gatewayCalls} panggilan`);
    const qa = chipResult.message.quickActionResponse;
    assert(qa != null, 'Klik chip harus menghasilkan quickActionResponse (dialog)');
    assert(qa.responseType === 'quick_action_dialogue', 'quickActionResponse harus bertipe quick_action_dialogue');
    assert(qa.actionId === 'HITUNG_VOLUME', 'Dialog klik chip harus untuk HITUNG_VOLUME');
    assert(
      Array.isArray(qa.choices) && qa.choices.length === volumeContract!.initialChoices.length,
      'Dialog klik chip harus membawa pilihan kontrak',
    );
    assert(qa.canCancel === true, 'Dialog klik chip harus dapat dibatalkan');
    assertNoRawToken(chipResult.message.text, 'teks pesan dialog klik chip');
    assert(chipResult.message.isError !== true, 'Klik chip tidak boleh menghasilkan pesan error');
    console.log('✅ TEST 8 PASSED: Chip click opens QuickActionDialogue (HITUNG_VOLUME) with ZERO gateway calls');

    // -------------------------------------------------------------------------
    // TEST 9 (16 NOV): Pertukaran live PERSIS → derivasi 'Hitung Volume'
    // -------------------------------------------------------------------------
    // Mengunci bahwa pemicu/regex BUKAN penyebab kegagalan live 16 Nov:
    // pesan pengguna memuat "volume" dan balasan memuat "Volume = 0,6 m³".
    const live16Suggestions = deriveFollowUpSuggestions(LIVE_16NOV_USER, LIVE_16NOV_REPLY);
    assert(
      Array.isArray(live16Suggestions) &&
        live16Suggestions.length === 1 &&
        live16Suggestions[0] === 'Hitung Volume',
      `Pertukaran live 16 Nov harus menghasilkan ['Hitung Volume'], didapat: ${JSON.stringify(live16Suggestions)}`,
    );
    assertNoRawToken((live16Suggestions as string[]).join(' '), 'saran pertukaran live 16 Nov');
    console.log('✅ TEST 9 PASSED: Exact 16-Nov live exchange derives [Hitung Volume] (trigger is not the cause)');

    // -------------------------------------------------------------------------
    // TEST 10 (16 NOV, INTEGRASI): gateway stub membalas persis seperti
    // live 16 Nov → coAssistantService menempel saran 'Hitung Volume'
    // -------------------------------------------------------------------------
    gatewayCalls = 0;
    globalThis.fetch = (async (url: string, _init?: RequestInit) => {
      gatewayCalls += 1;
      assert(String(url) === '/api/ai/tools/execute', `Gateway harus dipanggil di /api/ai/tools/execute, didapat: ${url}`);
      return new Response(
        JSON.stringify({ success: true, content: LIVE_16NOV_REPLY }),
        { status: 200 },
      );
    }) as typeof fetch;
    const live16Result = await coAssistantService.sendMessage({
      message: LIVE_16NOV_USER,
      currentProject: null,
    });
    assert(gatewayCalls === 1, `Jalur live 16 Nov harus memanggil gateway tepat 1x, didapat: ${gatewayCalls}`);
    assert(live16Result.message.source === 'server', 'Balasan stub gateway 16 Nov harus ber-provenance server');
    assert(
      Array.isArray(live16Result.message.followUpSuggestions) &&
        live16Result.message.followUpSuggestions.length === 1 &&
        live16Result.message.followUpSuggestions[0] === 'Hitung Volume',
      `Balasan live 16 Nov harus membawa saran ['Hitung Volume'], didapat: ${JSON.stringify(live16Result.message.followUpSuggestions)}`,
    );
    assert(
      live16Result.message.text.includes('0,6 m³'),
      'Balasan live 16 Nov harus mempertahankan teks volume dari gateway',
    );
    assertNoRawToken(live16Result.message.text, 'teks balasan live 16 Nov');
    console.log('✅ TEST 10 PASSED: Stubbed 16-Nov live gateway reply carries followUpSuggestions [Hitung Volume]');

    console.log('====================================================');
    console.log('🏁 ALL D-50 LIVE-AI QUICK ACTION TESTS PASSED (10/10)');
    console.log('====================================================');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = originalWindow;
    }
    coAssistantService.resetSession();
  }
}

runLiveAiFixD50Tests().catch((err) => {
  console.error('❌ D-50 TESTS FAILED:', err);
  process.exit(1);
});

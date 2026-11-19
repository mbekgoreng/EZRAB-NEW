/**
 * B2 — Regresi integritas Copilot (P9) + konteks item terpilih (P11).
 *
 * Audit perintah AI 2026-11-17 (LAPORAN-AKHIR.md § Temuan integritas
 * Copilot + §P9 + §P11, baris matriks 48). Perbaikan yang dikunci di sini:
 *
 *  P9.1 quickActionService: fallback answerStep/confirmSession TIDAK
 *        BOLEH lagi mengklaim sukses ("telah diproses" / "berhasil
 *        diterapkan") tanpa mutasi — harus state ERROR + pesan jujur.
 *  P9.2 QuickActionStateMachine (server): pratinjau RECALCULATE
 *        fabrikasi (Rp32,1 jt → Rp34,25 jt) dihapus; confirmSession
 *        menolak jujur (NOT_APPLIED), bukan COMPLETED palsu.
 *  P9.3 resolveClientWizardStep: harga wizard hardcode dilabeli
 *        ESTIMATED (bukan VERIFIED); pesan pratinjau tidak lagi
 *        mengklaim "presisi standar AHSP PUPR 2026".
 *  P9.4 /help tidak mengiklankan /tambah, /hapus, /ubah; ketiganya
 *        dijawab penolakan jujur + arahan ke Chat AI.
 *  P9.5 handleApplyProposal hanya menerapkan proposal item RAB
 *        (allowlist toolName); proposal non-item ditolak.
 *  P11  coAssistantService membaca selectedRabItem/selectedQtoItem:
 *        "jelaskan item ini" tanpa seleksi dijawab jujur; dengan
 *        seleksi, blok konteks item ditempel ke prompt server.
 *
 * KEAMANAN TES: TIDAK ADA panggilan AI live berbayar. `fetch` di-stub
 * dan `window` di-shim (pola D-50) agar providerClient memakai jalur
 * browser; gateway disimulasikan lewat fixture JSON.
 *
 * Jalankan: npx tsx src/test/copilotIntegrityP9P11.test.ts
 */
import { quickActionService } from '../services/quickActionService';
import {
  coAssistantService,
  resolveClientWizardStep,
  formatSelectedItemSection,
  formatSelectedItemDisplay,
  DEICTIC_SELECTED_ITEM_RE,
  isItemApplyProposal,
} from '../services/coAssistantService';
import { QuickActionStateMachine } from '../../server/services/quickActionStateMachine.js';
import type { RabItem, QTOItem } from '../types';

let passes = 0;
let failures = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passes += 1;
  } else {
    failures += 1;
    console.error(`❌ FAIL: ${message}`);
  }
}

const SAMPLE_RAB_ITEM = {
  id: 'rab-test-1',
  no: 6,
  code: '2.3',
  category: '02. PEKERJAAN TANAH DAN PONDASI',
  description: 'Pasangan Pondasi Batu Kali Belah 1 PC : 5 PP',
  volume: 12.5,
  unit: 'm3',
  unitPrice: 945000,
  amount: 11812500,
  ahspCode: 'A.3.2.1.2',
  priceStatus: 'RESOLVED',
} as unknown as RabItem;

const SAMPLE_RAB_ITEM_NO_PRICE = {
  ...SAMPLE_RAB_ITEM,
  id: 'rab-test-2',
  unitPrice: null,
  amount: null,
  priceStatus: 'PRICE_UNRESOLVED',
} as unknown as RabItem;

const SAMPLE_QTO_ITEM = {
  id: 'QTO-2026-000001',
  projectId: 'PRJ-TEST',
  kode: 'QTO.01.BOWPLANK',
  uraian: 'Pekerjaan Bowplank & Pengukuran',
  quantity: 42.4,
  unit: 'm',
  unitPrice: 42000,
  totalCost: 1780800,
  priceStatus: 'RESOLVED',
} as unknown as QTOItem;

export async function runCopilotIntegrityP9P11Tests(): Promise<void> {
  console.log('🧪 RUNNING B2 COPILOT INTEGRITY (P9) + SELECTED ITEM (P11) TESTS');

  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as any).window;

  try {
    coAssistantService.resetSession();

    // -----------------------------------------------------------------------
    // P9.1 — fallback quickActionService mengaku gagal, bukan sukses palsu
    // -----------------------------------------------------------------------
    globalThis.fetch = (async () => {
      throw new Error('network down (simulasi: endpoint /api/ai/quick-action tidak ada)');
    }) as typeof fetch;

    const answered = await quickActionService.answerStep('qa_local_123', 'UPDATE_ALL_AHSP_STANDARDS');
    assert(answered.currentState === 'ERROR', `P9.1 answerStep fallback harus ERROR, didapat: ${answered.currentState}`);
    assert(!answered.message.includes('telah diproses'), 'P9.1 answerStep tidak boleh mengklaim "telah diproses"');
    assert(answered.message.includes('tidak diproses'), 'P9.1 answerStep harus menyatakan permintaan tidak diproses');
    assert(answered.canGoBack === false, 'P9.1 answerStep ERROR tidak boleh menawarkan tombol Kembali mati');

    const confirmed = await quickActionService.confirmSession('qa_local_123');
    assert(confirmed.currentState === 'ERROR', `P9.1 confirmSession fallback harus ERROR, didapat: ${confirmed.currentState}`);
    assert(!confirmed.message.includes('berhasil diterapkan'), 'P9.1 confirmSession tidak boleh mengklaim "berhasil diterapkan"');
    assert(confirmed.message.includes('Tidak ada perubahan yang diterapkan'), 'P9.1 confirmSession harus menyatakan tidak ada perubahan yang diterapkan');

    // Server merespons non-OK (mis. 404/500) harus jatuh ke fallback jujur yang sama.
    globalThis.fetch = (async () =>
      new Response('not found', { status: 404 }),
    ) as typeof fetch;
    const answered404 = await quickActionService.answerStep('qa_local_123', 'UPDATE_ALL_AHSP_STANDARDS');
    assert(answered404.currentState === 'ERROR', 'P9.1 answerStep pada HTTP 404 harus ERROR');
    const confirmed500 = await (async () => {
      globalThis.fetch = (async () => new Response('err', { status: 500 })) as typeof fetch;
      return quickActionService.confirmSession('qa_local_123');
    })();
    assert(confirmed500.currentState === 'ERROR', 'P9.1 confirmSession pada HTTP 500 harus ERROR');
    console.log('✅ P9.1 PASSED: quickActionService fallbacks fail honestly (ERROR, no false success)');

    // -----------------------------------------------------------------------
    // P9.2 — RECALCULATE tanpa angka fabrikasi; confirm menolak jujur
    // -----------------------------------------------------------------------
    const recalcSession = QuickActionStateMachine.startSession({
      actionId: 'RECALCULATE',
      workspaceId: 'ws-test',
      projectId: 'PRJ-TEST',
    });
    const recalcStep = QuickActionStateMachine.answerStep(recalcSession.sessionId, 'UPDATE_ALL_AHSP_STANDARDS');
    assert(recalcStep.currentState !== 'TOOL_PREVIEW', `P9.2 RECALCULATE tidak boleh masuk TOOL_PREVIEW tanpa data nyata, didapat: ${recalcStep.currentState}`);
    assert(!recalcStep.diffPreview || recalcStep.diffPreview.length === 0, 'P9.2 RECALCULATE tidak boleh membawa diffPreview fabrikasi');
    assert(recalcStep.requiresConfirmation !== true, 'P9.2 RECALCULATE tidak boleh meminta konfirmasi atas pratinjau yang tidak ada');
    for (const fabricated of ['32.100.000', '34.250.000', '35.631.000', '38.017.500', '2.386.500']) {
      assert(!recalcStep.message.includes(fabricated), `P9.2 RECALCULATE tidak boleh memuat angka fabrikasi ${fabricated}`);
    }
    assert(recalcStep.message.includes('tidak dapat dihitung'), 'P9.2 RECALCULATE harus menyatakan pratinjau tidak dapat dihitung');

    const recalcConfirm = await QuickActionStateMachine.confirmSession(recalcSession.sessionId);
    assert(recalcConfirm.currentState === 'ERROR', `P9.2 confirmSession harus ERROR (menolak jujur), didapat: ${recalcConfirm.currentState}`);
    assert((recalcConfirm.resultData as any)?.status === 'NOT_APPLIED', 'P9.2 confirmSession harus berstatus NOT_APPLIED, bukan APPLIED');
    assert(!recalcConfirm.message.includes('berhasil diverifikasi'), 'P9.2 confirmSession tidak boleh mengklaim verifikasi/penyimpanan sukses');
    assert(recalcConfirm.message.includes('Tidak ada perubahan'), 'P9.2 confirmSession harus menyatakan tidak ada perubahan');
    console.log('✅ P9.2 PASSED: RECALCULATE has no fabricated preview; confirm refuses honestly (NOT_APPLIED)');

    // -----------------------------------------------------------------------
    // P9.3 — harga wizard dilabeli ESTIMATED, bukan VERIFIED
    // -----------------------------------------------------------------------
    const preview = resolveClientWizardStep('wiz-test-1', undefined, {}, {
      selectedTemplate: { label: 'Rumah Type 60', area: 60, floorCount: 1 },
    });
    assert(preview.step === 'RAB_PREVIEW', `P9.3 wizard harus mencapai RAB_PREVIEW, didapat: ${preview.step}`);
    assert(Array.isArray(preview.calculatedItems) && preview.calculatedItems.length === 42,
      `P9.3 wizard harus menghasilkan 42 item, didapat: ${preview.calculatedItems?.length}`);
    const verifiedCount = preview.calculatedItems.filter((it: any) => it.verificationStatus === 'VERIFIED').length;
    const estimatedCount = preview.calculatedItems.filter((it: any) => it.verificationStatus === 'ESTIMATED').length;
    assert(verifiedCount === 0, `P9.3 tidak boleh ada item wizard berlabel VERIFIED, didapat: ${verifiedCount}`);
    assert(estimatedCount === 42, `P9.3 semua 42 item wizard harus ESTIMATED, didapat: ${estimatedCount}`);
    assert(!preview.message.includes('secara presisi'), 'P9.3 pesan pratinjau tidak boleh mengklaim "presisi"');
    assert(preview.message.includes('belum terverifikasi'), 'P9.3 pesan pratinjau harus menyatakan harga belum terverifikasi');
    console.log('✅ P9.3 PASSED: wizard prices labelled ESTIMATED (42/42), preview message honest');

    // -----------------------------------------------------------------------
    // P9.4 — /help jujur; /tambah, /hapus, /ubah ditolak dengan arahan
    // -----------------------------------------------------------------------
    const help = await coAssistantService.sendMessage({
      message: '/help',
      currentProject: null,
    });
    assert(!help.message.text.includes('/tambah'), 'P9.4 /help tidak boleh mengiklankan /tambah');
    assert(!help.message.text.includes('/hapus'), 'P9.4 /help tidak boleh mengiklankan /hapus');
    assert(!help.message.text.includes('/ubah'), 'P9.4 /help tidak boleh mengiklankan /ubah');
    assert(help.message.text.includes('/cari') && help.message.text.includes('/total'),
      'P9.4 /help harus tetap memuat perintah yang benar-benar ada (/cari, /total)');
    assert(help.message.text.includes('Chat AI'), 'P9.4 /help harus mengarahkan perubahan RAB ke Chat AI');

    for (const cmd of ['/tambah Pondasi | 5 | m3 | 750000', '/hapus 3', '/ubah 2 volume 10']) {
      const rejected = await coAssistantService.sendMessage({ message: cmd, currentProject: null });
      assert(rejected.message.text.includes('tidak tersedia'), `P9.4 "${cmd}" harus dijawab tidak tersedia, didapat: ${rejected.message.text.slice(0, 80)}`);
      assert(rejected.message.text.includes('Chat AI'), `P9.4 "${cmd}" harus mengarahkan ke Chat AI`);
      assert(!rejected.message.text.includes('berhasil'), `P9.4 "${cmd}" tidak boleh mengklaim sukses`);
    }
    console.log('✅ P9.4 PASSED: /help advertises only real commands; write slashes refused honestly');

    // -----------------------------------------------------------------------
    // P9.5 — hanya proposal item RAB yang boleh diterapkan ke RAB
    // -----------------------------------------------------------------------
    assert(
      isItemApplyProposal({ actionId: 'a1', toolName: 'ADD_RAB_ITEM', parameters: {}, description: 'x', requiresConfirmation: false }),
      'P9.5 ADD_RAB_ITEM harus boleh diterapkan',
    );
    assert(
      isItemApplyProposal({ actionId: 'a2', toolName: 'propose_add_item', parameters: {}, description: 'x', requiresConfirmation: false }),
      'P9.5 propose_add_item harus boleh diterapkan',
    );
    assert(
      !isItemApplyProposal({ actionId: 'a3', toolName: 'OPEN_DOCUMENT_PACKAGE_WIZARD', parameters: { projectId: 'p1' }, description: 'Buka wizard', requiresConfirmation: false }),
      'P9.5 OPEN_DOCUMENT_PACKAGE_WIZARD TIDAK BOLEH diterapkan sebagai baris RAB',
    );
    assert(
      !isItemApplyProposal({ actionId: 'a4', toolName: 'UPDATE_PRICE', parameters: {}, description: 'x', requiresConfirmation: false }),
      'P9.5 UPDATE_PRICE TIDAK BOLEH diterapkan sebagai baris RAB',
    );
    assert(
      !isItemApplyProposal({ actionId: 'a5', toolName: '', parameters: {}, description: 'x', requiresConfirmation: false }),
      'P9.5 toolName kosong TIDAK BOLEH diterapkan sebagai baris RAB',
    );
    console.log('✅ P9.5 PASSED: only item proposals (ADD_RAB_ITEM/propose_add_item) may apply to RAB');

    // -----------------------------------------------------------------------
    // P11 — formatter item terpilih (jujur soal harga null)
    // -----------------------------------------------------------------------
    assert(formatSelectedItemSection(null, null) === null, 'P11 tanpa item terpilih harus null');
    const section = formatSelectedItemSection(SAMPLE_RAB_ITEM, SAMPLE_QTO_ITEM);
    assert(section !== null && section.includes('Pasangan Pondasi Batu Kali Belah 1 PC : 5 PP'), 'P11 section harus memuat uraian item RAB terpilih');
    assert(section !== null && section.includes('A.3.2.1.2'), 'P11 section harus memuat kode AHSP');
    assert(section !== null && section.includes('Rp945.000'), 'P11 section harus memuat harga satuan');
    assert(section !== null && section.includes('Pekerjaan Bowplank & Pengukuran'), 'P11 section harus memuat item QTO terpilih');
    const sectionNoPrice = formatSelectedItemSection(SAMPLE_RAB_ITEM_NO_PRICE, null);
    assert(sectionNoPrice !== null && sectionNoPrice.includes('belum tersedia (bukan Rp0)'),
      'P11 harga null harus ditulis "belum tersedia (bukan Rp0)", bukan Rp0');
    assert(sectionNoPrice !== null && !sectionNoPrice.replaceAll('(bukan Rp0)', '').includes('Rp0'),
      'P11 harga null tidak boleh tampil sebagai nilai Rp0 di luar frasa penjelas "(bukan Rp0)"');
    const display = formatSelectedItemDisplay(SAMPLE_RAB_ITEM, null);
    assert(display !== null && display.includes('12.5 m3'), 'P11 display harus memuat volume + satuan');
    assert(formatSelectedItemDisplay(null, null) === null, 'P11 display tanpa item harus null');

    assert(DEICTIC_SELECTED_ITEM_RE.test('Jelaskan item ini'), 'P11 regex harus cocok "Jelaskan item ini"');
    assert(DEICTIC_SELECTED_ITEM_RE.test('Berapa harga item ini?'), 'P11 regex harus cocok "Berapa harga item ini?"');
    assert(DEICTIC_SELECTED_ITEM_RE.test('Jelaskan item yang dipilih'), 'P11 regex harus cocok "item yang dipilih"');
    assert(!DEICTIC_SELECTED_ITEM_RE.test('Jelaskan item pondasi batu kali'), 'P11 regex TIDAK BOLEH cocok bila nama item disebut');
    assert(!DEICTIC_SELECTED_ITEM_RE.test('Berapa total RAB proyek ini?'), 'P11 regex TIDAK BOLEH cocok pada pertanyaan total proyek');
    console.log('✅ P11 PASSED: selected-item formatters honest (null price ≠ Rp0); deictic regex precise');

    // -----------------------------------------------------------------------
    // P11 — "jelaskan item ini" tanpa seleksi: jawab jujur, tanpa gateway
    // -----------------------------------------------------------------------
    let gatewayCalls = 0;
    (globalThis as any).window = {};
    globalThis.fetch = (async () => {
      gatewayCalls += 1;
      return new Response(JSON.stringify({ success: true, content: 'JAWABAN GATEWAY (tidak boleh dipakai di sini)' }), { status: 200 });
    }) as typeof fetch;

    const noSelection = await coAssistantService.sendMessage({
      message: 'Jelaskan item ini',
      currentProject: null,
    });
    assert(noSelection.message.text.includes('Tidak ada baris yang terpilih'),
      `P11 tanpa seleksi harus menjawab tidak ada baris terpilih, didapat: ${noSelection.message.text.slice(0, 100)}`);
    assert(gatewayCalls === 0, `P11 tanpa seleksi TIDAK BOLEH memanggil gateway (deterministik), panggilan: ${gatewayCalls}`);

    // -----------------------------------------------------------------------
    // P11 — "jelaskan item ini" DENGAN seleksi: konteks ditempel ke prompt
    // -----------------------------------------------------------------------
    let capturedBody = '';
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      gatewayCalls += 1;
      capturedBody = String(init?.body || '');
      return new Response(JSON.stringify({ success: true, content: 'Item tersebut adalah pondasi batu kali.' }), { status: 200 });
    }) as typeof fetch;

    const withSelection = await coAssistantService.sendMessage({
      message: 'Jelaskan item ini',
      currentProject: null,
      selectedRabItem: SAMPLE_RAB_ITEM,
    });
    assert(gatewayCalls === 1, `P11 dengan seleksi harus memanggil gateway sekali, panggilan: ${gatewayCalls}`);
    assert(capturedBody.includes('ITEM RAB TERPILIH'), 'P11 prompt server harus memuat blok ITEM RAB TERPILIH');
    assert(capturedBody.includes('Pasangan Pondasi Batu Kali Belah 1 PC : 5 PP'),
      'P11 prompt server harus memuat uraian item terpilih');
    assert(capturedBody.includes('A.3.2.1.2'), 'P11 prompt server harus memuat kode AHSP item terpilih');
    assert(withSelection.message.text.includes('pondasi batu kali'),
      'P11 balasan gateway harus diteruskan sebagai jawaban');
    console.log('✅ P11 PASSED: deictic without selection answered honestly (no gateway); with selection, context injected into server prompt');

    console.log('====================================================');
    if (failures === 0) {
      console.log(`🏁 ALL B2 COPILOT INTEGRITY TESTS PASSED (${passes}/${passes})`);
    } else {
      console.log(`❌ ${failures} TEST(S) FAILED (${passes} passed)`);
    }
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
  if (failures > 0) process.exit(1);
}

runCopilotIntegrityP9P11Tests().catch((err) => {
  console.error('❌ B2 TESTS FAILED:', err);
  process.exit(1);
});

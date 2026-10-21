/**
 * Test regresi FASE 1 RECOVERY (P1-2) — kredit Chat AI TIDAK boleh terpotong
 * saat request AI gagal.
 *
 * Latar: view.tsx memanggil consume() sesudah `await send()` TANPA memeriksa
 * res.success — terbukti live di production (2026-10-21) memotong saldo
 * simulasi untuk pengiriman yang gagal (403): 10.000 → 9.980 → 9.960 → 9.910.
 *
 * Cakupan tes ini (jujur, tanpa klaim berlebih):
 * - PERILAKU gerbang debit yang benar-benar dipakai view.tsx
 *   (`debitChatCreditOnSuccess` dari chatCreditDebit.ts) terhadap saldo
 *   mockAdapter ASLI: saldo sebelum/sesudah diperiksa, bukan teks error.
 * - Bentuk kegagalan yang sampai ke gerbang adalah kontrak service:
 *   providerClient menormalkan SEMUA kegagalan HTTP/jaringan/timeout menjadi
 *   hasil `success:false`, dan EzrabAiService meneruskannya sebagai
 *   `{ success:false, reply }`. Jadi matriks HTTP diuji sebagai outcome
 *   success:false berlabel sumbernya.
 * - KONTRAK SUMBER view.tsx (pola .src yang dipakai repo): gerbang adalah
 *   satu-satunya jalur debit 'chat-ai', guard busy ada, dan intent lokal
 *   tidak melewati gerbang.
 * - BUKAN tes browser/DOM dan BUKAN idempotensi backend: saldo masih
 *   simulasi frontend (mockAdapter). Pencegahan klik-ganda bertumpu pada
 *   guard `busy` di submit() (terverifikasi sumber) + semantik gerbang
 *   "satu outcome = paling banyak satu debit".
 *
 * Dijalankan via vitest (pola yang sama dengan aiCredits.test.ts).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  debitChatCreditOnSuccess,
  shouldDebitChatCredit,
} from '../ai-tools/ezrab-ai/chatCreditDebit';
import { tariffFor } from '../ai-credits/config';
import { mockConsume, mockGetBalance, mockGetLedger, mockReset } from '../ai-credits/mockAdapter';

const FAST_MAX = tariffFor('chat-ai/fast').max; // 20
const ADV_MAX = tariffFor('chat-ai/advanced').max; // 50
const START = 10_000; // PLAN_CREDITS.starter, dipulihkan mockReset()

/**
 * Tiruan persis langkah debit di view.tsx (jalur online): gerbang menerima
 * hasil send() dan fungsi consume yang sama (mockConsume via hook).
 */
function viewDebitStep(outcome: unknown, mode: 'fast' | 'advanced'): boolean {
  const amount = mode === 'fast' ? FAST_MAX : ADV_MAX;
  return debitChatCreditOnSuccess(outcome as any, () =>
    mockConsume('chat-ai', amount, `Chat AI (${mode}): uji regresi`, {
      model: mode === 'fast' ? 'FAST' : 'ADVANCED',
    }),
  );
}

const balance = () => mockGetBalance().total;
const ledgerCount = () => mockGetLedger().length;

beforeEach(() => {
  mockReset();
});

describe('Fase 1 — debit hanya saat sukses tegas', () => {
  it('1. sukses Cepat: terpotong tepat satu kali sebesar tarif maksimum Cepat', () => {
    const before = balance();
    const debited = viewDebitStep({ success: true, reply: 'Halo!' }, 'fast');
    expect(debited).toBe(true);
    expect(balance()).toBe(before - FAST_MAX);
    expect(ledgerCount()).toBe(1);
  });

  it('2. sukses Mendalam: terpotong tepat satu kali sebesar tarif maksimum Mendalam', () => {
    const before = balance();
    const debited = viewDebitStep({ success: true, reply: 'Analisis…' }, 'advanced');
    expect(debited).toBe(true);
    expect(balance()).toBe(before - ADV_MAX);
    expect(ledgerCount()).toBe(1);
  });

  it('3. satu outcome sukses tidak bisa mendebit dua kali lewat gerbang', () => {
    let calls = 0;
    const outcome = { success: true, reply: 'ok' };
    const ran = debitChatCreditOnSuccess(outcome, () => {
      calls += 1;
    });
    expect(ran).toBe(true);
    expect(calls).toBe(1);
  });
});

describe('Fase 1 — kegagalan TIDAK mengubah saldo (kontrak service success:false)', () => {
  const failures: Array<[string, unknown]> = [
    ['HTTP 403 / origin ditolak', { success: false, reply: 'AI Online sementara tidak dapat diakses. Silakan coba lagi nanti.' }],
    ['HTTP 429 / rate limit', { success: false, reply: 'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.' }],
    ['HTTP 500', { success: false, reply: 'Layanan AI sedang gangguan. Silakan coba lagi nanti.' }],
    ['HTTP 502', { success: false, reply: 'Layanan AI sedang gangguan. Silakan coba lagi nanti.' }],
    ['HTTP 503', { success: false, reply: 'Layanan AI sedang gangguan. Silakan coba lagi nanti.' }],
    ['timeout', { success: false, reply: 'Permintaan melewati batas waktu.' }],
    ['network error', { success: false, reply: 'Tidak dapat menghubungi layanan AI.' }],
    ['respons provider kosong/tidak valid', { success: false, reply: 'Model mengembalikan respons kosong.' }],
    ['kegagalan service umum', { success: false, reply: 'Layanan AI gagal memproses permintaan.' }],
  ];

  for (const [label, outcome] of failures) {
    it(`gagal (${label}) di kedua mode: saldo & ledger tidak berubah`, () => {
      for (const mode of ['fast', 'advanced'] as const) {
        mockReset();
        const before = balance();
        const debited = viewDebitStep(outcome, mode);
        expect(debited).toBe(false);
        expect(balance()).toBe(before);
        expect(balance()).toBe(START);
        expect(ledgerCount()).toBe(0);
      }
    });
  }

  it('reproduksi angka audit live: 2x gagal Cepat + 1x gagal Mendalam → saldo tetap 10.000 (dulu: 9.910)', () => {
    viewDebitStep({ success: false, reply: 'AI Online sementara tidak dapat diakses.' }, 'fast');
    viewDebitStep({ success: false, reply: 'AI Online sementara tidak dapat diakses.' }, 'fast');
    viewDebitStep({ success: false, reply: 'AI Online sementara tidak dapat diakses.' }, 'advanced');
    expect(balance()).toBe(START);
    expect(ledgerCount()).toBe(0);
  });
});

describe('Fase 1 — respons tidak valid / status sukses tidak tegas', () => {
  const invalid: Array<[string, unknown]> = [
    ['null (request dibatalkan sebelum ada hasil)', null],
    ['undefined', undefined],
    ['objek kosong {}', {}],
    ["success string 'true'", { success: 'true' }],
    ['success angka 1', { success: 1 }],
    ['success false eksplisit', { success: false }],
  ];
  for (const [label, outcome] of invalid) {
    it(`${label}: tidak dianggap sukses, saldo tidak berubah`, () => {
      expect(shouldDebitChatCredit(outcome as any)).toBe(false);
      const before = balance();
      expect(viewDebitStep(outcome, 'fast')).toBe(false);
      expect(balance()).toBe(before);
      expect(ledgerCount()).toBe(0);
    });
  }
});

describe('Fase 1 — kontrak sumber view.tsx', () => {
  const viewSrc = readFileSync(
    fileURLToPath(new URL('../ai-tools/ezrab-ai/view.tsx', import.meta.url)),
    'utf8',
  );

  it('gerbang adalah satu-satunya jalur debit chat-ai di view (satu titik panggilan, sesudah send)', () => {
    const gateIdx = viewSrc.indexOf('debitChatCreditOnSuccess(res,');
    const sendIdx = viewSrc.indexOf('await ezrabAiService.send(');
    expect(sendIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeGreaterThan(sendIdx);
    // consume('chat-ai' hanya boleh muncul di dalam callback gerbang.
    const consumeIdx = viewSrc.indexOf("consume('chat-ai'");
    expect(consumeIdx).toBeGreaterThan(gateIdx);
    expect(viewSrc.split("consume('chat-ai'").length - 1).toBe(1);
  });

  it('guard pengiriman ganda (busy) tetap ada di submit()', () => {
    expect(viewSrc).toContain('|| busy) return');
  });

  it('intent lokal tidak melewati gerbang: gerbang hanya muncul sekali (jalur online)', () => {
    // Tepat SATU titik panggilan gerbang (pola panggilan, bukan penyebutan
    // nama di komentar): debitChatCreditOnSuccess(res, …
    expect(viewSrc.split('debitChatCreditOnSuccess(res,').length - 1).toBe(1);
    expect(viewSrc).toContain("import { debitChatCreditOnSuccess } from './chatCreditDebit';");
    const localReturnIdx = viewSrc.indexOf('preRouted.localOnly');
    expect(localReturnIdx).toBeGreaterThan(-1);
    expect(localReturnIdx).toBeLessThan(viewSrc.indexOf('await ezrabAiService.send('));
  });
});

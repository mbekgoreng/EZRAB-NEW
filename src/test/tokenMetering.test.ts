/**
 * Test metering token — Amendemen Spec Billing v1.1 (keputusan owner
 * 2026-11-06): 1 kredit = 200 token terbobot; token terbobot =
 * tokenIn × 1 + tokenOut × 3; kredit = max(1, ceil(terbobot / 200)).
 *
 * Cakupan: rumus konversi murni, estimasi token dari teks, estimasi
 * reservation, dan jalur nyata view (meter → mockConsume) termasuk
 * rincian token yang tersimpan di entri ledger.
 * Dijalankan via tsx (pola tes rumah repo).
 */
import {
  WEIGHTED_TOKENS_PER_CREDIT,
  OUTPUT_TOKEN_WEIGHT,
  estimateTokensFromText,
  weightedTokensFor,
  creditsForTokens,
  meterTokens,
  meterTexts,
  estimateReservationCredits,
} from '../ai-credits/tokenMetering';
import { mockConsume, mockGetBalance, mockGetLedger, mockReset } from '../ai-credits/mockAdapter';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass += 1; console.log(`  PASS ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name}`); }
}

console.log('== Konversi token → kredit (Amendemen v1.1) ==');
check('konstanta 200 token terbobot/kredit', WEIGHTED_TOKENS_PER_CREDIT === 200);
check('bobot output 3', OUTPUT_TOKEN_WEIGHT === 3);
check('ilustrasi owner: 2.000 in + 1.000 out = 5.000 terbobot', weightedTokensFor(2000, 1000) === 5000);
check('ilustrasi owner: 5.000 terbobot = 25 kredit', creditsForTokens(2000, 1000) === 25);
check('DED menengah: 150.000 terbobot ≈ 750 kredit', creditsForTokens(150_000, 0) === 750);
check('pembulatan ke atas: 201 terbobot = 2 kredit', creditsForTokens(201, 0) === 2);
check('minimum 1 kredit untuk pemakaian kecil', creditsForTokens(1, 0) === 1);
check('tanpa token = 0 kredit', creditsForTokens(0, 0) === 0);
check('output lebih mahal: 0 in + 1.000 out = 15 kredit', creditsForTokens(0, 1000) === 15);
check('input saja: 1.000 in + 0 out = 5 kredit', creditsForTokens(1000, 0) === 5);

console.log('== Estimasi token dari teks (simulasi klien) ==');
check('teks kosong = 0', estimateTokensFromText('') === 0);
check('400 karakter = 100 token', estimateTokensFromText('a'.repeat(400)) === 100);
check('401 karakter dibulatkan ke atas = 101', estimateTokensFromText('a'.repeat(401)) === 101);
const chat = meterTexts('a'.repeat(8000), 'b'.repeat(4000));
check('meterTexts: 8.000 char in = 2.000 token', chat.tokensIn === 2000);
check('meterTexts: 4.000 char out = 1.000 token', chat.tokensOut === 1000);
check('meterTexts: total = 25 kredit (ilustrasi owner)', chat.credits === 25);

console.log('== Estimasi reservation ==');
check('reservation: input kosong tetap ≥ tunjangan output (1.000 out → 15)', estimateReservationCredits('') === 15);
check('reservation: 8.000 char riwayat+pesan = 25', estimateReservationCredits('a'.repeat(8000)) === 25);
check('reservation selalu ≥ 1', estimateReservationCredits('halo') >= 1);

console.log('== Jalur nyata: meter → mockConsume → ledger ==');
mockReset();
const start = mockGetBalance().total;
const m = meterTokens(2000, 1000);
const ok = mockConsume('chat-ai', m.credits, 'Chat AI (Cepat): uji metering token', {
  model: 'FAST',
  tokensIn: m.tokensIn,
  tokensOut: m.tokensOut,
  weightedTokens: m.weightedTokens,
});
check('consume berhasil', ok === true);
check('saldo berkurang tepat 25', mockGetBalance().total === start - 25);
const entry = mockGetLedger()[0];
check('ledger mencatat kredit -25', entry.credits === -25);
check('ledger mencatat tokensIn 2000', entry.tokensIn === 2000);
check('ledger mencatat tokensOut 1000', entry.tokensOut === 1000);
check('ledger mencatat weightedTokens 5000', entry.weightedTokens === 5000);
check('saldo tidak cukup → consume menolak (tanpa potongan diam-diam)',
  mockConsume('chat-ai', mockGetBalance().total + 1, 'uji tolak') === false &&
  mockGetBalance().total === start - 25);

console.log(`\nHasil: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);

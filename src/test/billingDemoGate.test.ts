// Suite: Trial Demo 4 Paket Billing — gerbang fitur AI per paket di lapisan
// SIMULASI (src/ai-credits/featureGate.ts + mockAdapter.ts), mengikuti
// Keputusan Owner 2026-11-07 (Amendemen Spec v1.2):
//   - Free = 100 kredit AI SEKALI per akun (habis = habis).
//   - Fitur AI Free HANYA Chat AI (DED AI & AI Document tertutup).
//   - Top-up tidak tersedia untuk Free.
//   - Saldo awal demo: Starter 5.000, Professional 10.000, Business 30.000.
//
// Gaya harness sama seperti billingPlans.test.ts (plain, tanpa vitest).
// Jalankan dari root repo:
//   npx --yes esbuild src/test/billingDemoGate.test.ts --bundle --platform=node --format=cjs --outfile=/tmp/billing-demo-gate.cjs && node /tmp/billing-demo-gate.cjs
import {
  aiFeatureLockedMessage,
  planAllowsAiFeature,
} from '../ai-credits/featureGate';
import {
  mockConsume,
  mockGetBalance,
  mockGetLedger,
  mockReset,
  mockSetPlan,
  mockTopUp,
} from '../ai-credits/mockAdapter';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

console.log('=== Gerbang fitur AI per paket (featureGate) ===');
check("free: chat-ai BOLEH", planAllowsAiFeature('free', 'chat-ai') === true);
check("free: ded-ai TERTOLAK", planAllowsAiFeature('free', 'ded-ai') === false);
check("free: ai-document TERTOLAK", planAllowsAiFeature('free', 'ai-document') === false);
check("starter: chat-ai BOLEH", planAllowsAiFeature('starter', 'chat-ai') === true);
check("starter: ded-ai BOLEH", planAllowsAiFeature('starter', 'ded-ai') === true);
check("starter: ai-document TERTOLAK (locked di plans.ts)", planAllowsAiFeature('starter', 'ai-document') === false);
check("pro: semua fitur BOLEH",
  planAllowsAiFeature('pro', 'chat-ai') && planAllowsAiFeature('pro', 'ded-ai') && planAllowsAiFeature('pro', 'ai-document'));
check("business: semua fitur BOLEH",
  planAllowsAiFeature('business', 'chat-ai') && planAllowsAiFeature('business', 'ded-ai') && planAllowsAiFeature('business', 'ai-document'));
const msgFree = aiFeatureLockedMessage('free', 'ded-ai');
check('pesan penolakan free menyebut Chat AI & MODE DEMO',
  msgFree.includes('hanya Chat AI') && msgFree.includes('MODE DEMO'));
const msgStarter = aiFeatureLockedMessage('starter', 'ai-document');
check('pesan penolakan starter menyebut Professional & MODE DEMO',
  msgStarter.includes('Professional') && msgStarter.includes('MODE DEMO'));

console.log('=== BUG-1: saldo awal Free harus 100 (sekali), bukan 0 ===');
mockReset();
mockSetPlan('free');
check('free: saldo total = 100', mockGetBalance().total === 100);
check('free: bucket langganan = 100', mockGetBalance().subscription === 100);
check('free: chat consume 16 berhasil', mockConsume('chat-ai', 16, 'uji chat free') === true);
check('free: saldo sesudah chat = 84', mockGetBalance().total === 84);
check('free: consume ded-ai di atas saldo gagal wajar', mockConsume('ded-ai', 500, 'uji') === false);
check('free: saldo tidak berubah oleh consume gagal', mockGetBalance().total === 84);

console.log('=== Saldo awal paket berbayar ===');
mockReset();
check('default (starter): 5.000', mockGetBalance().total === 5_000);
mockSetPlan('pro');
check('pro: 10.000', mockGetBalance().total === 10_000);
mockSetPlan('business');
check('business: 30.000', mockGetBalance().total === 30_000);
mockSetPlan('starter');
check('starter: 5.000', mockGetBalance().total === 5_000);

console.log('=== Ganti paket membersihkan bucket top-up/bonus paket sebelumnya ===');
mockReset();
mockTopUp();
check('starter sesudah top-up: total 8.600', mockGetBalance().total === 8_600);
mockSetPlan('pro');
const bPro = mockGetBalance();
check('pro sesudah pindah: topup 0 & bonus 0', bPro.topup === 0 && bPro.bonus === 0);
check('pro sesudah pindah: total tepat 10.000', bPro.total === 10_000);

console.log('=== BUG-4: top-up ditolak untuk Free di adapter ===');
mockReset();
mockSetPlan('free');
const ledgerBefore = mockGetLedger().length;
const resFree = mockTopUp();
check("top-up free: status 'failed'", resFree.status === 'failed');
check('top-up free: totalCredits 0', resFree.totalCredits === 0);
check('top-up free: saldo tetap 100', mockGetBalance().total === 100);
check('top-up free: ledger tidak bertambah', mockGetLedger().length === ledgerBefore);

console.log('=== Top-up paket berbayar tetap berfungsi (simulasi) ===');
mockReset();
const resStarter = mockTopUp();
check("top-up starter: status 'simulated'", resStarter.status === 'simulated');
check('top-up starter: +3.600 (3.000 + bonus 600)', mockGetBalance().total === 8_600);

console.log('=== WS-B: gerbang fitur ditegakkan DI LAPISAN DEBIT (bukan hanya UI) ===');
mockReset();
mockSetPlan('free');
check('free: debit ded-ai DITOLAK walau saldo cukup (100 >= 50)',
  mockConsume('ded-ai', 50, 'uji debit ded free') === false);
check('free: saldo utuh sesudah penolakan ded-ai', mockGetBalance().total === 100);
check('free: debit ai-document DITOLAK walau saldo cukup',
  mockConsume('ai-document', 50, 'uji debit dokumen free') === false);
check('free: saldo utuh sesudah penolakan ai-document', mockGetBalance().total === 100);
mockReset();
check('starter: debit ai-document DITOLAK (locked di matriks kanonis)',
  mockConsume('ai-document', 50, 'uji debit dokumen starter') === false);
check('starter: saldo utuh 5.000', mockGetBalance().total === 5_000);
check('starter: debit ded-ai tetap BOLEH (matriks: dedAi true)',
  mockConsume('ded-ai', 50, 'uji debit ded starter') === true);
check('starter: saldo 4.950 sesudah debit ded sah', mockGetBalance().total === 4_950);

console.log('=== WS-B: idempotency debit via jobReference ===');
mockReset();
check('debit pertama jobReference job-wsb-1 berhasil',
  mockConsume('chat-ai', 25, 'uji idem', { jobReference: 'job-wsb-1' }) === true);
check('saldo 4.975 sesudah debit pertama', mockGetBalance().total === 4_975);
check('debit KEDUA jobReference sama DITOLAK (tidak terpotong dua kali)',
  mockConsume('chat-ai', 25, 'uji idem ulang', { jobReference: 'job-wsb-1' }) === false);
check('saldo tetap 4.975 (tidak ada potongan ganda)', mockGetBalance().total === 4_975);
check('ledger hanya memuat SATU entri untuk job-wsb-1',
  mockGetLedger().filter((e) => e.jobReference === 'job-wsb-1').length === 1);
check('debit jobReference berbeda tetap berhasil',
  mockConsume('chat-ai', 25, 'uji idem lain', { jobReference: 'job-wsb-2' }) === true);
check('saldo 4.950 sesudah debit job lain', mockGetBalance().total === 4_950);

console.log('=== WS-B: jumlah kredit pecahan ditolak (integer-only) ===');
check('debit 4.5 kredit DITOLAK', mockConsume('chat-ai', 4.5, 'uji pecahan') === false);
check('saldo tidak berubah oleh debit pecahan', mockGetBalance().total === 4_950);

console.log(`\nHasil: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);

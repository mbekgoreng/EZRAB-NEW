// Suite W5 (Wave 5 Auth/SaaS): kebijakan billing kanonis + keselarasan
// permukaan + badge kredit DocCreator.
//
// BAGIAN A & C adalah pin yang HARUS lulus: definisi kanonis plans.ts,
// gerbang fitur, penolakan top-up Free di mock, konversi token→kredit,
// dan keberadaan badge kredit di DocCreator.
//
// BAGIAN B adalah pin keselarasan matriks tampilan landing vs plans.ts
// (drift ditemukan W5, 2026-11-24, DITUTUP koordinator hari yang sama):
// matriks landing sempat mengklaim Starter mendapat "Dokumen AI
// (terbatas)", padahal plans.ts kanonis + gerbang runtime menutup
// aiDocuments untuk Starter ('locked'). Ketiga cek di bawah adalah pin
// regresi atas perbaikan itu — JANGAN "memperbaiki" dengan mengubah
// plans.ts, gerbang, atau tes ini. Perbaikan (koordinator 2026-11-24):
//   - src/components/landing/exact/pricingMatrix.ts (baris 'Dokumen AI',
//     sel starter 'limited' → 'no')
//   - src/components/landing/exact/PricingBlocks.tsx (bullet Starter:
//     hapus 'Dokumen AI')
//   - src/components/landing/PricingSection.tsx (fitur Starter: hapus
//     'Dokumen AI')
// Arah perbaikan mengikuti plans.ts (SATU-SATUNYA SUMBER KEBENARAN
// PAKET) + gerbang runtime yang sudah menegakkannya (DocCreator,
// DocAnalyzer, featureGate) — BUKAN sebaliknya.
//
// Jalankan dari root repo: npx --yes tsx src/test/w5BillingPolicy.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PLAN_DEFINITIONS,
  activeAiFeatures,
  getEntitlement,
  isChatAiOnly,
} from '../billing/plans';
import { planAllowsAiFeature, aiFeatureLockedMessage } from '../ai-credits/featureGate';
import {
  mockConsume,
  mockGetBalance,
  mockReset,
  mockSetPlan,
  mockTopUp,
} from '../ai-credits/mockAdapter';
import {
  WEIGHTED_TOKENS_PER_CREDIT,
  creditsForTokens,
} from '../ai-credits/tokenMetering';
import { PRICING_CATEGORIES } from '../components/landing/exact/pricingMatrix';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

const read = (rel: string) =>
  readFileSync(join(process.cwd(), rel), 'utf8');
const count = (src: string, needle: string) =>
  src.split(needle).length - 1;

console.log('=== [A] Kebijakan kanonis plans.ts (terkunci) ===');
check('harga bulanan 0 / 54.999 / 79.999 / 159.999',
  PLAN_DEFINITIONS.free.monthlyPriceIdr === 0
  && PLAN_DEFINITIONS.starter.monthlyPriceIdr === 54_999
  && PLAN_DEFINITIONS.professional.monthlyPriceIdr === 79_999
  && PLAN_DEFINITIONS.business.monthlyPriceIdr === 159_999);
check('Free: kredit initial 100 SEKALI (bukan periodik)',
  PLAN_DEFINITIONS.free.credits.kind === 'initial'
  && PLAN_DEFINITIONS.free.credits.credits === 100);
check('jatah periodik Starter 5.000 / Pro 10.000 / Business 30.000',
  PLAN_DEFINITIONS.starter.credits.kind === 'periodic'
  && PLAN_DEFINITIONS.starter.credits.credits === 5_000
  && PLAN_DEFINITIONS.professional.credits.kind === 'periodic'
  && PLAN_DEFINITIONS.professional.credits.credits === 10_000
  && PLAN_DEFINITIONS.business.credits.kind === 'periodic'
  && PLAN_DEFINITIONS.business.credits.credits === 30_000);
check('batas proyek 1 / 7 / 25 / tanpa batas',
  PLAN_DEFINITIONS.free.projectLimit === 1
  && PLAN_DEFINITIONS.starter.projectLimit === 7
  && PLAN_DEFINITIONS.professional.projectLimit === 25
  && PLAN_DEFINITIONS.business.projectLimit === null);
check('aiDocuments: Free locked / Starter locked / Pro credit-metered / Business full',
  getEntitlement('free', 'aiDocuments') === 'locked'
  && getEntitlement('starter', 'aiDocuments') === 'locked'
  && getEntitlement('professional', 'aiDocuments') === 'credit-metered'
  && getEntitlement('business', 'aiDocuments') === 'full');
check('Free: Chat AI satu-satunya fitur AI aktif',
  isChatAiOnly('free')
  && JSON.stringify(activeAiFeatures('free')) === JSON.stringify(['chat-ai']));
check('Starter: fitur AI aktif tepat chat-ai + ded-ai (tanpa ai-document)',
  JSON.stringify(activeAiFeatures('starter')) === JSON.stringify(['chat-ai', 'ded-ai']));
check('Pro/Business: ketiga fitur AI aktif',
  JSON.stringify(activeAiFeatures('professional')) === JSON.stringify(['chat-ai', 'ded-ai', 'ai-document'])
  && JSON.stringify(activeAiFeatures('business')) === JSON.stringify(['chat-ai', 'ded-ai', 'ai-document']));

console.log('=== [A] Gerbang fitur (featureGate, diturunkan dari plans.ts) ===');
check('Free menolak ded-ai + ai-document, mengizinkan chat-ai',
  !planAllowsAiFeature('free', 'ded-ai')
  && !planAllowsAiFeature('free', 'ai-document')
  && planAllowsAiFeature('free', 'chat-ai'));
check('Starter menolak ai-document, mengizinkan chat-ai + ded-ai',
  !planAllowsAiFeature('starter', 'ai-document')
  && planAllowsAiFeature('starter', 'chat-ai')
  && planAllowsAiFeature('starter', 'ded-ai'));
check('Pro/Business mengizinkan ai-document',
  planAllowsAiFeature('pro', 'ai-document')
  && planAllowsAiFeature('business', 'ai-document'));
check('pesan kunci Free menyebut Chat AI saja + 100 kredit sekali',
  aiFeatureLockedMessage('free', 'ai-document').includes('hanya Chat AI')
  && aiFeatureLockedMessage('free', 'ai-document').includes('100 kredit sekali'));

console.log('=== [A] Mock: top-up Free ditolak, debit fitur terkunci ditolak ===');
mockReset();
mockSetPlan('free');
check('Free: saldo awal tepat 100', mockGetBalance().total === 100);
const freeBefore = mockGetBalance().total;
check('Free: mockTopUp gagal (status failed) + saldo tidak berubah',
  mockTopUp('topup-500').status === 'failed' && mockGetBalance().total === freeBefore);
check('Free: mockConsume ded-ai ditolak walau saldo cukup',
  mockConsume('ded-ai', 50, 'probe W5') === false && mockGetBalance().total === freeBefore);
check('Free: mockConsume ai-document ditolak walau saldo cukup',
  mockConsume('ai-document', 50, 'probe W5') === false && mockGetBalance().total === freeBefore);
check('Free: mockConsume chat-ai diizinkan + memotong saldo',
  mockConsume('chat-ai', 10, 'probe W5') === true && mockGetBalance().total === freeBefore - 10);
mockSetPlan('starter');
check('Starter: mockConsume ai-document ditolak',
  mockConsume('ai-document', 50, 'probe W5') === false);
check('Starter: mockConsume ded-ai diizinkan',
  mockConsume('ded-ai', 50, 'probe W5') === true);
check('Starter: mockTopUp berhasil (simulasi)',
  mockTopUp('topup-500').status === 'simulated');
mockSetPlan('pro');
check('Pro: mockConsume ai-document diizinkan',
  mockConsume('ai-document', 50, 'probe W5') === true);
mockReset();

console.log('=== [A] Metering token: 1 kredit = 200 token terbobot ===');
check('WEIGHTED_TOKENS_PER_CREDIT = 200', WEIGHTED_TOKENS_PER_CREDIT === 200);
check('ilustrasi kalibrasi owner: 2000 in + 1000 out = 25 kredit',
  creditsForTokens(2000, 1000) === 25);
check('DED menengah ±150.000 token terbobot = 750 kredit',
  creditsForTokens(150_000, 0) === 750);
check('tanpa pemakaian = 0 kredit; pemakaian >0 = minimal 1',
  creditsForTokens(0, 0) === 0 && creditsForTokens(1, 0) === 1);

console.log('=== [B] Keselarasan matriks tampilan landing vs plans.ts ===');
const aiCat = PRICING_CATEGORIES.find((c) => c.id === 'ai');
const docRow = aiCat?.rows.find((r) => r.label === 'Dokumen AI');
check('matriks: Dokumen AI Free = no (selaras: locked)',
  (docRow?.values.free as { t: string }).t === 'no');
check('matriks: Dokumen AI Starter = no (selaras: locked)',
  (docRow?.values.starter as { t: string }).t === 'no');
check('matriks: Dokumen AI Pro/Business = yes (selaras: credit-metered/full)',
  (docRow?.values.professional as { t: string }).t === 'yes'
  && (docRow?.values.business as { t: string }).t === 'yes');
const blocksSrc = read('src/components/landing/exact/PricingBlocks.tsx');
check('PricingBlocks bullet Starter tanpa "Dokumen AI"',
  !blocksSrc.includes('RAB AI, Chat AI & Dokumen AI (terbatas)'));
const pricingSrc = read('src/components/landing/PricingSection.tsx');
check('PricingSection fitur Starter tanpa "Dokumen AI"',
  !pricingSrc.includes('RAB AI, Chat AI & Dokumen AI (terbatas)'));
const exactSrc = read('src/components/landing/exact/ExactPricing.tsx');
check('ExactPricing: "AI Documents" hanya muncul mulai Professional (selaras)',
  exactSrc.indexOf('professional:') !== -1
  && exactSrc.indexOf("'AI Documents'") > exactSrc.indexOf('professional:'));

console.log('=== [C] Badge kredit DocCreator (pola DocAnalyzer) ===');
const creatorSrc = read('src/ai-tools/document-ai/components/DocCreator.tsx');
check('DocCreator mengimpor CreditBalance',
  creatorSrc.includes("import { CreditBalance } from '../../../ai-credits/components/CreditBalance';"));
check('DocCreator mengimpor ai-credits.css (gaya badge)',
  creatorSrc.includes("import '../../../ai-credits/ai-credits.css';"));
check('DocCreator me-render badge compact tanpa top-up di 3 situs (funnel, form, editor)',
  count(creatorSrc, '<CreditBalance compact showTopUp={false} />') === 3);
const analyzerSrc = read('src/ai-tools/document-ai/components/DocAnalyzer.tsx');
check('pola acuan DocAnalyzer tetap ada (1 badge compact tanpa top-up)',
  count(analyzerSrc, '<CreditBalance compact showTopUp={false} />') === 1);

console.log(`\nHasil W5: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) {
  console.log('CATATAN: ada cek kebijakan billing yang gagal — lihat baris FAIL di atas.');
  process.exit(1);
}

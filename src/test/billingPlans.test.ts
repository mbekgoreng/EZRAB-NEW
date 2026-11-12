// Suite: Fase 1 fondasi entitlement — definisi paket KANONIS
// (src/billing/plans.ts, tabel owner-approved 2026-10-30) + keselarasan
// tiga permukaan yang membacanya (ai-credits config, landing pricing,
// tab Paket & Billing Pengaturan) + fallback branding fail-closed (P0-3).
//
// Gaya harness sama seperti suite src/test lainnya (plain, tanpa vitest).
// Jalankan dari root repo:
//   npx --yes esbuild src/test/billingPlans.test.ts --bundle --platform=node --format=cjs --outfile=/tmp/billing-plans.cjs && node /tmp/billing-plans.cjs
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  PLAN_IDS,
  PLAN_DEFINITIONS,
  FREE_CALCULATOR_IDS,
  STARTER_SNI_VERIFIED_CALCULATOR_IDS,
  FREE_TEMPLATE_IDS,
  STARTER_TEMPLATE_CATEGORIES,
  getPlanDefinition,
  getEntitlement,
  isPlanId,
  isUnlimitedProjects,
  periodicCredits,
  initialCredits,
  activeAiFeatures,
  isChatAiOnly,
} from '../billing/plans';
import {
  PLAN_CREDITS,
  FREE_INITIAL_CREDITS,
  CREDIT_PLAN_TO_PLAN_ID,
} from '../ai-credits/config';
import { BrandingClient } from '../services/brandingClient';

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: string): void {
  if (cond) {
    pass++;
    console.log(`  PASS ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`);
  }
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log('=== Kanonis: identitas & harga (Master Prompt §3) ===');
check('urutan paket free→business', eq(PLAN_IDS, ['free', 'starter', 'professional', 'business']));
check('isPlanId menerima ID kanonis', isPlanId('professional') && isPlanId('business'));
check("isPlanId menolak id warisan 'pro'", !isPlanId('pro'));
check('nama tampilan', getPlanDefinition('free').displayName === 'Free'
  && getPlanDefinition('starter').displayName === 'Starter'
  && getPlanDefinition('professional').displayName === 'Professional'
  && getPlanDefinition('business').displayName === 'Business');
check('harga Free Rp0', getPlanDefinition('free').monthlyPriceIdr === 0);
check('harga Starter Rp54.999', getPlanDefinition('starter').monthlyPriceIdr === 54_999);
check('harga Professional Rp79.999', getPlanDefinition('professional').monthlyPriceIdr === 79_999);
check('harga Business Rp159.999', getPlanDefinition('business').monthlyPriceIdr === 159_999);

console.log('=== Kanonis: batas proyek ===');
check('Free maks. 1 proyek', getPlanDefinition('free').projectLimit === 1);
check('Starter maks. 7 proyek', getPlanDefinition('starter').projectLimit === 7);
check('Professional maks. 25 proyek', getPlanDefinition('professional').projectLimit === 25);
check('Business tanpa batas = null eksplisit', getPlanDefinition('business').projectLimit === null);
check('isUnlimitedProjects hanya Business',
  isUnlimitedProjects('business') && !isUnlimitedProjects('free')
  && !isUnlimitedProjects('starter') && !isUnlimitedProjects('professional'));

console.log('=== Kanonis: semantik kredit (initial vs periodik) ===');
const freeCredits = getPlanDefinition('free').credits;
check("Free berjenis 'initial'", freeCredits.kind === 'initial');
check('Free 100 kredit awal', freeCredits.kind === 'initial' && freeCredits.credits === 100);
check('periodicCredits(free) = null (bukan periodik)', periodicCredits('free') === null);
check('initialCredits(free) = 100', initialCredits('free') === 100);
check('Starter periodik 5.000/bulan', periodicCredits('starter') === 5_000);
check('Professional periodik 10.000/bulan', periodicCredits('professional') === 10_000);
check('Business periodik 30.000/bulan', periodicCredits('business') === 30_000);
check('initialCredits(paket periodik) = null',
  initialCredits('starter') === null && initialCredits('professional') === null && initialCredits('business') === null);
check("periode periodik = 'monthly'",
  (['starter', 'professional', 'business'] as const).every((id) => {
    const c = PLAN_DEFINITIONS[id].credits;
    return c.kind === 'periodic' && c.period === 'monthly';
  }));

console.log('=== Kanonis: matriks entitlement (§C + O-1..O-13) ===');
const freeCalc = getEntitlement('free', 'calculators');
check('Free: kalkulator restricted-set 13 ID (O-2)',
  freeCalc.kind === 'restricted-set' && freeCalc.calculatorIds.length === 13
  && freeCalc.calculatorIds.includes('BOWPLANK') && freeCalc.calculatorIds.includes('residential.dinding'));
check('FREE_CALCULATOR_IDS konsisten dengan definisi',
  freeCalc.kind === 'restricted-set' && eq(freeCalc.calculatorIds, FREE_CALCULATOR_IDS));
const starterCalc = getEntitlement('starter', 'calculators');
check('Starter: kalkulator sni-verified-set 8 ID interim (O-1)',
  starterCalc.kind === 'sni-verified-set' && starterCalc.calculatorIds.length === 8
  && eq(starterCalc.calculatorIds, STARTER_SNI_VERIFIED_CALCULATOR_IDS));
check('Professional & Business: semua kalkulator',
  getEntitlement('professional', 'calculators').kind === 'all'
  && getEntitlement('business', 'calculators').kind === 'all');
check('AHSP Free & Starter: Cipta Karya saja',
  eq(getEntitlement('free', 'ahspDomains'), ['CIPTA_KARYA'])
  && eq(getEntitlement('starter', 'ahspDomains'), ['CIPTA_KARYA']));
check('AHSP Professional & Business: 4 domain',
  getEntitlement('professional', 'ahspDomains').length === 4
  && getEntitlement('business', 'ahspDomains').includes('SMKK')
  && getEntitlement('business', 'ahspDomains').includes('SUMBER_DAYA_AIR'));
const freeTpl = getEntitlement('free', 'templates');
check('Free: template by ID (Type 36 1FL/2FL)',
  freeTpl.kind === 'template-ids' && eq(freeTpl.templateIds, FREE_TEMPLATE_IDS)
  && eq(FREE_TEMPLATE_IDS, ['HOUSE-T36-1FL', 'HOUSE-T36-2FL']));
const starterTpl = getEntitlement('starter', 'templates');
check('Starter: template 3 kategori utuh (O-3)',
  starterTpl.kind === 'categories' && eq(starterTpl.categories, STARTER_TEMPLATE_CATEGORIES)
  && eq(STARTER_TEMPLATE_CATEGORIES, ['RUMAH_TINGGAL', 'GEDUNG', 'KESEHATAN']));
check('DED AI: Free terkunci, lainnya tersedia',
  getEntitlement('free', 'dedAi') === false && getEntitlement('starter', 'dedAi') === true
  && getEntitlement('professional', 'dedAi') === true && getEntitlement('business', 'dedAi') === true);
check('AI Documents: locked/locked/credit-metered/full (O-6)',
  getEntitlement('free', 'aiDocuments') === 'locked' && getEntitlement('starter', 'aiDocuments') === 'locked'
  && getEntitlement('professional', 'aiDocuments') === 'credit-metered'
  && getEntitlement('business', 'aiDocuments') === 'full');

console.log('=== Keputusan Owner 2026-11-07 (Amendemen Spec v1.2): Free chat-only + 100 sekali ===');
check('Chat AI aktif di semua paket (termasuk Free)',
  getEntitlement('free', 'chatAi') === true && getEntitlement('starter', 'chatAi') === true
  && getEntitlement('professional', 'chatAi') === true && getEntitlement('business', 'chatAi') === true);
check("fitur AI Free TEPAT ['chat-ai'] (DED AI & AI Document nonaktif)",
  eq(activeAiFeatures('free'), ['chat-ai']) && isChatAiOnly('free') === true);
check('fitur AI Starter = chat + DED (Dokumen AI masih locked di plans.ts)',
  eq(activeAiFeatures('starter'), ['chat-ai', 'ded-ai']) && isChatAiOnly('starter') === false);
check('fitur AI Professional & Business = ketiganya',
  eq(activeAiFeatures('professional'), ['chat-ai', 'ded-ai', 'ai-document'])
  && eq(activeAiFeatures('business'), ['chat-ai', 'ded-ai', 'ai-document']));
check('Free 100 kredit SEKALI: kind initial + periodicCredits null (bukan per bulan)',
  freeCredits.kind === 'initial' && freeCredits.credits === 100 && periodicCredits('free') === null);
check('Document Templates: none/bast-only/project-documents-and-schedule/all (O-4)',
  getEntitlement('free', 'documentTemplates') === 'none'
  && getEntitlement('starter', 'documentTemplates') === 'bast-only'
  && getEntitlement('professional', 'documentTemplates') === 'project-documents-and-schedule'
  && getEntitlement('business', 'documentTemplates') === 'all');
check('Finance: locked/locked/available/full (O-7)',
  getEntitlement('free', 'finance') === 'locked' && getEntitlement('starter', 'finance') === 'locked'
  && getEntitlement('professional', 'finance') === 'available'
  && getEntitlement('business', 'finance') === 'full');
check('Reports: rekapitulasi-only/available/full/full (O-8)',
  getEntitlement('free', 'reports') === 'rekapitulasi-only'
  && getEntitlement('starter', 'reports') === 'available'
  && getEntitlement('professional', 'reports') === 'full'
  && getEntitlement('business', 'reports') === 'full');
check('Ekspor Free: PDF limited (O-9) + Excel limited-static',
  getEntitlement('free', 'pdfExport') === 'limited'
  && getEntitlement('free', 'excelExport') === 'limited-static'
  && getEntitlement('starter', 'pdfExport') === 'available'
  && getEntitlement('business', 'excelExport') === 'available');
check('Kolaborasi tim: hanya Professional & Business',
  getEntitlement('free', 'teamCollaboration') === false
  && getEntitlement('starter', 'teamCollaboration') === false
  && getEntitlement('professional', 'teamCollaboration') === true
  && getEntitlement('business', 'teamCollaboration') === true);
check('Peran tim Professional = SUPER_ADMIN/ESTIMATOR/CLIENT',
  eq(getEntitlement('professional', 'teamRoles'), ['SUPER_ADMIN', 'ESTIMATOR', 'CLIENT']));
check('Peran tim Business = mengikuti implementasi terverifikasi',
  getEntitlement('business', 'teamRoles') === 'follow-verified-implementation');
check('Peran tim Free & Starter kosong',
  eq(getEntitlement('free', 'teamRoles'), []) && eq(getEntitlement('starter', 'teamRoles'), []));

console.log('=== Permukaan 1: ai-credits config menurunkan dari kanonis ===');
check("pemetaan 'pro' → 'professional'", CREDIT_PLAN_TO_PLAN_ID.pro === 'professional');
check('PLAN_CREDITS.starter = kanonis Starter', PLAN_CREDITS.starter === periodicCredits('starter'));
check('PLAN_CREDITS.pro = kanonis Professional', PLAN_CREDITS.pro === periodicCredits('professional'));
check('PLAN_CREDITS.business = kanonis Business', PLAN_CREDITS.business === periodicCredits('business'));
check('FREE_INITIAL_CREDITS = 100 dari kanonis', FREE_INITIAL_CREDITS === initialCredits('free'));
check('Free TIDAK punya entri PLAN_CREDITS', !('free' in PLAN_CREDITS));

console.log('=== Permukaan 2: landing pricing menurunkan dari kanonis ===');
const pricingSrc = read('src/components/landing/exact/ExactPricing.tsx');
check('ExactPricing mengimpor modul kanonis', pricingSrc.includes("from '../../../billing/plans'"));
check('ExactPricing memakai getPlanDefinition', pricingSrc.includes('getPlanDefinition'));
check('tidak ada harga menyimpang Rp 59.999', !pricingSrc.includes('59.999') && !pricingSrc.includes('59999'));
check('tidak ada klaim 10/20 Proyek', !pricingSrc.includes('10 Proyek') && !pricingSrc.includes('20 Proyek'));
check("ctaText pins tetap ('Coba Starter'/'Coba Pro')",
  pricingSrc.includes("ctaText: 'Coba Starter'") && pricingSrc.includes("ctaText: 'Coba Pro'"));
check('pengungkapan tahap pengujian tetap ada', pricingSrc.includes('tahap pengujian'));
const blocksSrc = read('src/components/landing/exact/PricingBlocks.tsx');
const matrixSrc = read('src/components/landing/exact/pricingMatrix.ts');
check('kartu Free menampilkan "kredit AI (sekali)", bukan 0/bln (Amendemen v1.2)',
  blocksSrc.includes('kredit AI (sekali)') && !blocksSrc.includes('0 kredit AI/bln'));
check('kartu Free menyatakan Chat AI saja, bukan "Tanpa fitur AI"',
  blocksSrc.includes('hanya untuk Chat AI') && !blocksSrc.includes('Tanpa fitur AI'));
check('matriks: Chat AI Free = terbatas (aktif), RAB AI & Dokumen AI Free = tidak',
  matrixSrc.includes("label: 'Chat AI', values: { free: L")
  && matrixSrc.includes("label: 'RAB AI', values: { free: N")
  && matrixSrc.includes("label: 'Dokumen AI', values: { free: N"));
check('matriks: kredit Free tampil "100 (sekali)", bukan sel credits bulanan',
  matrixSrc.includes("free: T('100 (sekali)')"));
check('ketentuan transparan memuat aturan Free v1.2 (100 sekali, chat saja, tanpa top-up)',
  matrixSrc.includes('100 kredit AI sekali di awal') && matrixSrc.includes('top-up tidak tersedia untuk paket Free'));
check('K8: bullet Starter bebas frasa "Semua kategori" (Starter = Cipta Karya saja, plans.ts)',
  (() => {
    const m = blocksSrc.match(/starter: \[([^\]]*)\]/);
    return !!m && !m[1].includes('Semua kategori') && m[1].includes('AHSP Cipta Karya penuh');
  })());
check('K8: bullet Professional & Business TETAP "Semua kategori" (mereka = 4 domain)',
  (() => {
    const pro = blocksSrc.match(/professional: \[([^\]]*)\]/);
    const biz = blocksSrc.match(/business: \[([^\]]*)\]/);
    return !!pro && !!biz && pro[1].includes('Semua kategori AHSP 2026') && biz[1].includes('Semua kategori AHSP 2026');
  })());
check('K8: matriks SDA/Bina Marga/SMKK Starter = N (tidak tersedia)',
  matrixSrc.includes("label: 'AHSP Sumber Daya Air', values: { free: N, starter: N")
  && matrixSrc.includes("label: 'AHSP Bina Marga', values: { free: N, starter: N")
  && matrixSrc.includes("label: 'AHSP SMKK', values: { free: N, starter: N"));
check('K8: matriks Cipta Karya Starter tetap Y; SDA/BM/SMKK Pro & Business tetap Y',
  matrixSrc.includes("label: 'AHSP Cipta Karya', values: { free: Y, starter: Y")
  && matrixSrc.includes("starter: N, professional: Y, business: Y")); 

console.log('=== Permukaan 3: tab Paket & Billing Pengaturan jujur ===');
const settingsSrc = read('src/components/settings/UnifiedSettingsView.tsx');
check('Settings membaca definisi kanonis', settingsSrc.includes('getPlanDefinition'));
check('Settings berlabel simulasi', settingsSrc.includes('Mode Simulasi — Bukan Langganan Aktif'));
check("tidak ada klaim 'Aktif Terverifikasi'", !settingsSrc.includes('Aktif Terverifikasi'));
check("tidak ada klaim 'Professional Estimator & Enterprise'", !settingsSrc.includes('Professional Estimator & Enterprise'));
check("tidak ada tanggal aktif karangan '31 Desember 2026'", !settingsSrc.includes('31 Desember 2026'));
check('kabel Kotak Saran tetap utuh (file ini juga membawanya)',
  settingsSrc.includes("import { SuggestionComplaintBox } from './SuggestionComplaintBox';")
  && settingsSrc.includes('<SuggestionComplaintBox />'));

console.log('=== Branding fallback fail-closed (P0-3) ===');
const client = new BrandingClient();
const fb = (client as unknown as { getLocalFallback: (id: string) => Record<string, unknown> })
  .getLocalFallback('ws-test-billing-phase1');
check("fallback default paket 'free'", fb.subscriptionPlan === 'free');
check('fallback default watermark WAJIB', fb.isWatermarkRequired === true);
check('fallback default logo kustom TERKUNCI', fb.canUploadLogo === false);
check('fallback identitas tetap kosong (non-entitlement utuh)',
  fb.companyName === '' && fb.address === '' && fb.taxNumber === '');

console.log(`\nHasil: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);

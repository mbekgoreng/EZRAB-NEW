/**
 * W6 — Konsistensi harga/paket di permukaan landing + plafon fungsi Vercel.
 *
 * Akar: PricingSection.tsx (in-app, dipakai WorkspaceView) menampilkan paket
 * usang Free/Basic/Pro/Enterprise Rp0/99.000/199.000/499.000 + batas proyek
 * 1/3/10/∞ — semuanya menyimpang dari kanonis plans.ts — dan TIDAK
 * ditangkap suite mana pun (d02StarterPrice hanya memeriksa FeatureSections
 * + PricingBlocks). Suite ini mengunci: semua permukaan harga landing
 * diturunkan dari src/billing/plans.ts (bukan hardcode), nama paket kanonis
 * (Business, bukan Advanced/Basic/Pro/Enterprise), rumus tahunan 15%, dan
 * inventaris fungsi Vercel tetap ≤ 12 (11 handler + middleware).
 *
 * Jalankan: npx --yes tsx src/test/w6PricingConsistency.test.ts
 * (Skrip tsx mandiri — pola billingPlans / d02StarterPrice.)
 */
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PLAN_DEFINITIONS, PLAN_IDS, getPlanDefinition } from '../billing/plans';

const ROOT = join(import.meta.dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Hapus komentar baris/blok JSX agar klaim historis di komentar tidak
 *  dianggap sebagai teks tampil (mis. FeatureSections menyebut Rp 59.999
 *  sebagai riwayat bug yang sudah diperbaiki). */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

function listFiles(dir: string, ext: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...listFiles(p, ext));
    else if (e.endsWith(ext)) out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// [0] Kanonis plans.ts (sumber kebenaran — bila ini berubah, suite lain
//     (billingPlans) juga harus diperbarui; di sini hanya dipin).
// ---------------------------------------------------------------------------
console.log('[0] Nilai kanonis plans.ts');
check('harga bulanan 0 / 54.999 / 79.999 / 159.999',
  PLAN_DEFINITIONS.free.monthlyPriceIdr === 0 &&
  PLAN_DEFINITIONS.starter.monthlyPriceIdr === 54_999 &&
  PLAN_DEFINITIONS.professional.monthlyPriceIdr === 79_999 &&
  PLAN_DEFINITIONS.business.monthlyPriceIdr === 159_999);
check('nama tampil Free / Starter / Professional / Business',
  PLAN_DEFINITIONS.free.displayName === 'Free' &&
  PLAN_DEFINITIONS.starter.displayName === 'Starter' &&
  PLAN_DEFINITIONS.professional.displayName === 'Professional' &&
  PLAN_DEFINITIONS.business.displayName === 'Business');
check('batas proyek 1 / 7 / 25 / tanpa batas',
  PLAN_DEFINITIONS.free.projectLimit === 1 &&
  PLAN_DEFINITIONS.starter.projectLimit === 7 &&
  PLAN_DEFINITIONS.professional.projectLimit === 25 &&
  PLAN_DEFINITIONS.business.projectLimit === null);
check('Free = 100 kredit SEKALI (initial), bukan periodik',
  PLAN_DEFINITIONS.free.credits.kind === 'initial' &&
  PLAN_DEFINITIONS.free.credits.credits === 100);
check('PLAN_IDS urut free → business',
  JSON.stringify([...PLAN_IDS]) === JSON.stringify(['free', 'starter', 'professional', 'business']));
check('getPlanDefinition(starter) = Rp54.999',
  getPlanDefinition('starter').monthlyPriceIdr === 54_999);

// ---------------------------------------------------------------------------
// [1] PricingSection.tsx (in-app) — diturunkan dari plans.ts, tanpa hardcode.
// ---------------------------------------------------------------------------
console.log('[1] PricingSection.tsx (in-app, dipakai WorkspaceView)');
const pricingSection = read('src/components/landing/PricingSection.tsx');
const pricingSectionCode = stripComments(pricingSection);
check('mengimpor modul kanonis billing/plans',
  pricingSection.includes("from '../../billing/plans'"));
check('memakai getPlanDefinition (bukan literal harga)',
  pricingSection.includes('getPlanDefinition'));
check('tidak ada harga usang 99.000 / 199.000 / 499.000',
  !/99\.?000/.test(pricingSectionCode) &&
  !/199\.?000/.test(pricingSectionCode) &&
  !/499\.?000/.test(pricingSectionCode));
check('tidak ada harga tahunan usang 79.000 / 159.000 / 399.000',
  !/79\.?000/.test(pricingSectionCode) &&
  !/159\.?000/.test(pricingSectionCode) &&
  !/399\.?000/.test(pricingSectionCode));
check('tidak ada nama paket usang Basic / Pro / Enterprise',
  !/\bBasic\b/.test(pricingSectionCode) &&
  !/\bEnterprise\b/.test(pricingSectionCode) &&
  !/name: 'Pro'/.test(pricingSectionCode));
check('tidak ada klaim diskon tahunan 20% (kanonis landing = 15%)',
  !pricingSectionCode.includes('Hemat 20%') && !pricingSectionCode.includes('20%'));
check('rumus tahunan 15% dari harga kanonis (×0.85)',
  pricingSection.includes('0.85'));
check('id section tetap harga-paket (kontrak NEW-05 / d35)',
  pricingSection.includes('id="harga-paket"'));

// ---------------------------------------------------------------------------
// [2] PricingBlocks.tsx (landing #harga + /harga) — diturunkan dari plans.ts.
// ---------------------------------------------------------------------------
console.log('[2] PricingBlocks.tsx (landing + /harga)');
const pricingBlocks = read('src/components/landing/exact/PricingBlocks.tsx');
const pricingBlocksCode = stripComments(pricingBlocks);
check('mengimpor PLAN_DEFINITIONS dari billing/plans',
  pricingBlocks.includes('PLAN_DEFINITIONS') &&
  pricingBlocks.includes("from '../../../billing/plans'"));
check('harga dirender dari monthlyPriceIdr (bukan literal)',
  pricingBlocks.includes('monthlyPriceIdr'));
check('tidak ada literal harga kanonis/usang di file',
  !/54[._]?999/.test(pricingBlocksCode) &&
  !/79[._]?999/.test(pricingBlocksCode) &&
  !/159[._]?999/.test(pricingBlocksCode) &&
  !/99\.?000/.test(pricingBlocksCode));
check('batas proyek kartu cocok kanonis (1 / 7 / 25 / tanpa batas)',
  pricingBlocks.includes("'1 proyek aktif'") &&
  pricingBlocks.includes("'7 proyek aktif'") &&
  pricingBlocks.includes("'25 proyek aktif'") &&
  pricingBlocks.includes("'Proyek tanpa batas'"));
check('Free: 100 kredit AI sekali — hanya untuk Chat AI',
  pricingBlocks.includes('100 kredit AI sekali — hanya untuk Chat AI'));

// ---------------------------------------------------------------------------
// [3] ExactPricing.tsx (mati — tanpa importer) — tetap diturunkan dari plans.
// ---------------------------------------------------------------------------
console.log('[3] ExactPricing.tsx (tanpa importer — dijaga agar tidak menyimpang bila dihidupkan lagi)');
const exactPricing = read('src/components/landing/exact/ExactPricing.tsx');
const exactPricingCode = stripComments(exactPricing);
check('mengimpor modul kanonis billing/plans',
  exactPricing.includes("from '../../../billing/plans'"));
check('memakai getPlanDefinition',
  exactPricing.includes('getPlanDefinition'));
check('tidak ada literal harga bulanan kanonis di file',
  !/54[._]?999/.test(exactPricingCode) &&
  !/79[._]?999/.test(exactPricingCode) &&
  !/159[._]?999/.test(exactPricingCode));

// ---------------------------------------------------------------------------
// [4] pricingMatrix.ts — nama tampil kanonis; 'Advanced' hanya riwayat.
// ---------------------------------------------------------------------------
console.log('[4] pricingMatrix.ts (matriks perbandingan /harga)');
const matrix = read('src/components/landing/exact/pricingMatrix.ts');
const displayNameBlock = matrix.slice(
  matrix.indexOf('PLAN_DISPLAY_NAME'),
  matrix.indexOf('};', matrix.indexOf('PLAN_DISPLAY_NAME')),
);
check("PLAN_DISPLAY_NAME business = 'Business' (bukan 'Advanced')",
  displayNameBlock.includes("business: 'Business'") &&
  !displayNameBlock.includes('Advanced'));
check('Free: kredit 100 (sekali) di matriks AI',
  matrix.includes("T('100 (sekali)')"));
check('ketentuan Free menyebut Amendemen v1.2 (100 sekali, Chat AI saja)',
  matrix.includes('100 kredit AI sekali di awal') &&
  matrix.includes('hanya Chat AI'));

// ---------------------------------------------------------------------------
// [5] Rumus tahunan 15% — nilai ekspektasi (dipakai PricingSection +
//     ExactPricing; bila rumus berubah, kedua komponen harus ikut).
// ---------------------------------------------------------------------------
console.log('[5] Rumus harga tahunan (bulanan setara, diskon 15%)');
check('Starter tahunan = Rp46.749/bln',
  Math.round(54_999 * 0.85) === 46_749);
check('Professional tahunan = Rp67.999/bln',
  Math.round(79_999 * 0.85) === 67_999);
check('Business tahunan = Rp135.999/bln',
  Math.round(159_999 * 0.85) === 135_999);

// ---------------------------------------------------------------------------
// [6] Sapuan landing: tidak ada harga usang di komponen landing mana pun.
// ---------------------------------------------------------------------------
console.log('[6] Sapuan seluruh src/components/landing (di luar komentar)');
const landingFiles = listFiles(join(ROOT, 'src/components/landing'), '.tsx');
const stalePatterns: Array<[RegExp, string]> = [
  [/99\.000/, 'Rp99.000 usang'],
  [/199\.000/, 'Rp199.000 usang'],
  [/499\.000/, 'Rp499.000 usang'],
  [/59\.999/, 'Rp59.999 usang (bug D-02)'],
  [/49\.999/, 'Rp49.999 usang'],
  [/149\.999/, 'Rp149.999 usang'],
];
const staleHits: string[] = [];
for (const f of landingFiles) {
  const code = stripComments(readFileSync(f, 'utf8'));
  for (const [re, label] of stalePatterns) {
    if (re.test(code)) staleHits.push(`${f.replace(`${ROOT}/`, '')}: ${label}`);
  }
}
check(`tidak ada harga usang di ${landingFiles.length} file landing`,
  staleHits.length === 0, staleHits.join('; '));

// ---------------------------------------------------------------------------
// [7] Plafon fungsi Vercel Hobby: 11 handler API + middleware = 12 (maks).
// ---------------------------------------------------------------------------
console.log('[7] Inventaris fungsi Vercel (plafon Hobby = 12)');
const apiFiles = listFiles(join(ROOT, 'api'), '.js')
  .filter((f) => !f.includes(`${join('api', '_lib')}`));
check('11 handler API di luar api/_lib',
  apiFiles.length === 11, `ditemukan ${apiFiles.length}`);
check('middleware.ts ada (fungsi ke-12)',
  existsSync(join(ROOT, 'middleware.ts')));
check('total fungsi (handler + middleware) = 12, tepat di plafon',
  apiFiles.length + 1 === 12);

// ---------------------------------------------------------------------------
// [8] Smoke import: modul harga landing termuat + derivasi jalan.
// ---------------------------------------------------------------------------
console.log('[8] Smoke import modul harga landing');
const pricingSectionMod = await import('../components/landing/PricingSection');
check('PricingSection termuat + mengekspor komponen',
  typeof pricingSectionMod.PricingSection === 'function');
const pricingBlocksMod = await import('../components/landing/exact/PricingBlocks');
check('PricingBlocks termuat + mengekspor PricingCards/PricingComparison',
  typeof pricingBlocksMod.PricingCards === 'function' &&
  typeof pricingBlocksMod.PricingComparison === 'function');
const exactPricingMod = await import('../components/landing/exact/ExactPricing');
check('ExactPricing termuat + mengekspor komponen',
  typeof exactPricingMod.ExactPricing === 'function');

console.log(`\nw6PricingConsistency.test: ${pass} PASS, ${fail} FAIL`);
assert.equal(fail, 0, `${fail} pemeriksaan gagal`);

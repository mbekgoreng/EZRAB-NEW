/**
 * D-25 (Batch G2, P2) — ganti bahasa hanya sebagian: FirstProjectChecklist
 * (0× t()), DashboardTour (0× useI18n), OnboardingTour (string hardcoded).
 * Perbaikan: semua string dipindah ke kamus i18n di KEEMPAT locale
 * (Dictionary = typeof id — tsc gagal bila satu locale tertinggal).
 *
 * Tes ini mengunci:
 *  (1) kunci baru ada & non-kosong di id/en/zh/ms (checklist 11,
 *      tour 19, kunci onboarding baru 21),
 *  (2) komponen yang dikonversi tidak lagi mengandung literal
 *      Indonesia yang dipindahkan (source-level),
 *  (3) kunci nav.butuh_peran_tim (D-33/D-34) ada di keempat locale.
 *
 * DI LUAR CAKUPAN (dicatat jujur): tutorialRegistry + chrome
 * FeatureTutorialPlayer masih Indonesia-only — registry besar yang
 * tidak disebut di lingkup D-25.
 *
 * Jalankan: npx tsx src/test/g2I18nCoverage.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
// tsx menjalankan berkas ini sebagai ESM: __dirname tidak tersedia.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..');

import { dictionaries, type Lang } from '../i18n/dictionaries';

let failures = 0;
let passes = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passes++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${(e as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}
function assertEq(actual: unknown, expected: unknown, msg: string): void {
  if (actual !== expected) {
    throw new Error(`${msg} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}
function readSrc(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), 'utf8');
}
/** Hapus komentar baris dan blok (termasuk JSX) agar literal di
 *  dokumentasi tidak dikira string yang dirender. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

const LANGS: Lang[] = ['id', 'en', 'zh', 'ms'];

const CHECKLIST_KEYS = [
  'progres_kamu', 'mulai_dengan', 'item_dashboard', 'item_proyek',
  'item_buat', 'item_workspace', 'item_rab', 'selesai', 'buka',
  'minimalkan', 'tutup',
];
const TOUR_KEYS = [
  'step1_title', 'step1_body', 'step2_title', 'step2_body',
  'step3_title', 'step3_body', 'step4_title', 'step4_body',
  'step5_title', 'step5_body', 'step6_title', 'step6_body',
  'step7_title', 'step7_body', 'step8_title', 'step8_body',
  'mulai_proyek', 'panduan', 'langkah',
];
const ONBOARDING_NEW_KEYS = [
  'welcome_aria', 'welcome_title', 'welcome_body_a', 'welcome_body_strong',
  'welcome_body_b', 'features_title', 'features_intro',
  'feat_rab_title', 'feat_rab_desc', 'feat_ai_title', 'feat_ai_desc',
  'feat_db_title', 'feat_db_desc', 'start_title', 'start_intro',
  'start_new_title', 'start_new_desc', 'start_dash_title', 'start_dash_desc',
  'start_note', 'mulai_sekarang',
];

console.log('g2I18nCoverage (D-25, D-33/34 dict):');

// --- (1) Kunci ada di keempat locale ---------------------------------------
test('checklist: 11 kunci ada & non-kosong di id/en/zh/ms', () => {
  assertEq(CHECKLIST_KEYS.length, 11, 'checklist key list');
  for (const lang of LANGS) {
    const section = dictionaries[lang].checklist as unknown as Record<string, unknown>;
    assertEq(Object.keys(section).length, 11, `${lang}.checklist size`);
    for (const k of CHECKLIST_KEYS) {
      const v = section[k];
      assert(typeof v === 'string' && v.length > 0, `${lang}.checklist.${k} missing/empty`);
    }
  }
});
test('tour: 19 kunci ada & non-kosong di id/en/zh/ms', () => {
  assertEq(TOUR_KEYS.length, 19, 'tour key list');
  for (const lang of LANGS) {
    const section = dictionaries[lang].tour as unknown as Record<string, unknown>;
    assertEq(Object.keys(section).length, 19, `${lang}.tour size`);
    for (const k of TOUR_KEYS) {
      const v = section[k];
      assert(typeof v === 'string' && v.length > 0, `${lang}.tour.${k} missing/empty`);
    }
  }
});
test('onboarding: 21 kunci baru ada & non-kosong di id/en/zh/ms', () => {
  assertEq(ONBOARDING_NEW_KEYS.length, 21, 'onboarding new key list');
  for (const lang of LANGS) {
    const section = dictionaries[lang].onboarding as unknown as Record<string, unknown>;
    for (const k of ONBOARDING_NEW_KEYS) {
      const v = section[k];
      assert(typeof v === 'string' && v.length > 0, `${lang}.onboarding.${k} missing/empty`);
    }
  }
});
test('nilai id verbatim dari komponen asal (tidak diubah saat pemindahan)', () => {
  const d = dictionaries.id;
  assertEq(d.checklist.progres_kamu, 'Progres Kamu', 'checklist.progres_kamu');
  assertEq(d.tour.step5_title, 'Susun Rencana Anggaran Biaya', 'tour.step5_title');
  assertEq(d.onboarding.welcome_title, 'Selamat datang di EZRAB!', 'onboarding.welcome_title');
  assertEq(d.onboarding.mulai_sekarang, 'Mulai Sekarang', 'onboarding.mulai_sekarang');
});
test('nav.butuh_peran_tim (D-33/D-34) ada di keempat locale', () => {
  for (const lang of LANGS) {
    const v = (dictionaries[lang].nav as unknown as Record<string, unknown>).butuh_peran_tim;
    assert(typeof v === 'string' && (v as string).length > 0, `${lang}.nav.butuh_peran_tim missing/empty`);
  }
  assert(
    dictionaries.id.nav.butuh_peran_tim.includes('peran Tim'),
    'id hint must name the Tim role',
  );
});

// --- (2) Komponen terkonversi: tanpa literal hardcoded (source-level) -------
test('FirstProjectChecklist: memakai t() & tanpa literal lama', () => {
  const src = stripComments(readSrc('components/onboarding/FirstProjectChecklist.tsx'));
  assert(src.includes("t('checklist."), 'must use checklist.* keys');
  for (const lit of ['Progres Kamu', 'Mulai dengan EZRAB', 'Mengenal dashboard', 'Membuat proyek pertama']) {
    assert(!src.includes(`'${lit}'`) && !src.includes(`"${lit}"`) && !src.includes(`>${lit}<`),
      `stale literal still present: ${lit}`);
  }
});
test('DashboardTour: memakai t() & tanpa literal lama', () => {
  const src = stripComments(readSrc('components/onboarding/DashboardTour.tsx'));
  assert(src.includes("t('tour."), 'must use tour.* keys');
  for (const lit of ['Selamat datang di Dashboard EZRAB', 'Susun Rencana Anggaran Biaya', 'Siap Memulai Proyek']) {
    assert(!src.includes(lit), `stale literal still present: ${lit}`);
  }
});
test('OnboardingTour: memakai t() & tanpa literal lama', () => {
  const src = stripComments(readSrc('components/onboarding/OnboardingTour.tsx'));
  assert(src.includes("t('onboarding."), 'must use onboarding.* keys');
  for (const lit of ['Selamat datang di EZRAB!', 'RAB & estimasi biaya konstruksi', 'Mulai Sekarang', 'Buat proyek baru']) {
    assert(!src.includes(lit), `stale literal still present: ${lit}`);
  }
});
test('Spotlight: chrome tombol via t() (common.*) + aria via tour.panduan', () => {
  const src = readSrc('components/onboarding/Spotlight.tsx');
  assert(src.includes("t('common.lewati')") || src.includes('common.lewati'), 'Lewati must use common key');
  assert(src.includes("t('tour.panduan')"), 'aria-label must use tour.panduan');
  assert(src.includes("t('tour.langkah')"), 'kicker must use tour.langkah');
});

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);

/**
 * Kalkulator Volume — penjaga pola HP praktis (ACC owner 2026-11-09).
 *
 * Memeriksa secara statis kontrak penerapan pola mobile pada
 * QtoCalculatorView:
 *  1. Sebelas berkas ikon keluarga ada di src/assets/volcalc-icons/.
 *  2. calcFamilyIcon.ts memuat 11 keluarga kata kunci (spesifik → umum)
 *     dan mengekspor getCalcFamilyIcon dengan fallback null.
 *  3. QtoCalculatorView memakai kelas penanda pola (ikon kartu, chip domain,
 *     kartu ilustrasi) dan melipat daftar otomatis pada lebar <= 767px.
 *  4. Semua aturan pola berada di dalam blok @media (max-width: 767px) di
 *     workspace-mobile-fixes.css — desktop tidak berubah.
 *
 * Run (repo): npx --yes tsx src/test/volcalcMobilePattern.test.ts
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const tsx = readFileSync(join(repo, 'src/components/qto/QtoCalculatorView.tsx'), 'utf8');
const family = readFileSync(join(repo, 'src/components/qto/calcFamilyIcon.ts'), 'utf8');
const css = readFileSync(join(repo, 'src/styles/workspace-mobile-fixes.css'), 'utf8');

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean): void => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ GAGAL: ${name}`); }
};

/** Ekstrak badan aturan CSS untuk satu selektor, dicari mulai dari indeks tertentu. */
const ruleBodyFrom = (selector: string, fromIndex: number): string => {
  const i = css.indexOf(selector, fromIndex);
  if (i < 0) return '';
  const open = css.indexOf('{', i);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
};

/* 1 — sebelas berkas ikon keluarga --------------------------------------- */
const ICON_FILES = [
  'bata.webp', 'bekisting.webp', 'plester.webp', 'galian.webp', 'beton.webp',
  'pondasi.webp', 'tulangan.webp', 'atap.webp', 'jalan.webp', 'drainase.webp',
  'cat.webp',
];
for (const file of ICON_FILES) {
  check(`ikon ${file} ada di src/assets/volcalc-icons/`, existsSync(join(repo, 'src/assets/volcalc-icons', file)));
}

/* 2 — sebelas keluarga kata kunci di calcFamilyIcon.ts -------------------- */
const FAMILIES = [
  'bekisting', 'plester', 'galian', 'tulangan', 'pondasi', 'atap',
  'jalan', 'drainase', 'cat', 'bata', 'beton',
];
for (const fam of FAMILIES) {
  check(`keluarga "${fam}" terdaftar di calcFamilyIcon.ts`, family.includes(`'${fam}'`) || family.includes(`'${fam}.webp'`));
  check(`ikon ${fam}.webp diimpor calcFamilyIcon.ts`, family.includes(`volcalc-icons/${fam}.webp`));
}
check('getCalcFamilyIcon diekspor', family.includes('export function getCalcFamilyIcon'));
check('fallback keluarga tak dikenal = null', family.includes('return null'));
check(
  'urutan spesifik → umum (bekisting sebelum beton)',
  family.indexOf("'bekisting'") >= 0 && family.indexOf("'bekisting'") < family.indexOf("'beton'"),
);
check(
  'urutan spesifik → umum (galian sebelum bata)',
  family.indexOf("'galian'") >= 0 && family.indexOf("'galian'") < family.indexOf("'bata'"),
);

/* 3 — penanda pola di QtoCalculatorView.tsx -------------------------------- */
check('TSX memuat kelas ikon kartu "ezrab-calc-card-icon"', tsx.includes('ezrab-calc-card-icon'));
check('TSX memuat kelas chip domain "ezrab-domain-chips"', tsx.includes('ezrab-domain-chips'));
check('TSX memuat kelas kartu ilustrasi "ezrab-illus-card"', tsx.includes('ezrab-illus-card'));
check('TSX memuat kelas gambar ilustrasi "ezrab-illus-img"', tsx.includes('ezrab-illus-img'));
check('TSX memuat kelas penanda kartu berikon "has-icon"', tsx.includes('has-icon'));
check('TSX mengimpor getCalcFamilyIcon', tsx.includes("from './calcFamilyIcon'"));
check(
  'memilih kalkulator melipat daftar di HP (innerWidth <= 767 → setListMinimized(true))',
  tsx.includes('window.innerWidth <= 767') && tsx.includes('setListMinimized(true)'),
);

/* 4 — aturan pola di dalam blok max-width: 767px --------------------------- */
const mediaIdx = css.indexOf('@media (max-width: 767px)');
check('workspace-mobile-fixes.css punya blok @media (max-width: 767px)', mediaIdx >= 0);

const chipsIdx = css.indexOf('.ezrab-domain-chips');
check('.ezrab-domain-chips muncul setelah blok media 767px pertama', chipsIdx > mediaIdx);
check(
  'chip domain: flex-wrap nowrap + overflow-x auto',
  ruleBodyFrom('.ezrab-domain-chips', mediaIdx).includes('flex-wrap: nowrap') &&
    ruleBodyFrom('.ezrab-domain-chips', mediaIdx).includes('overflow-x: auto'),
);
check(
  'scrollbar chip domain disembunyikan (webkit)',
  css.indexOf('.ezrab-domain-chips::-webkit-scrollbar') > mediaIdx,
);

const gridBody = ruleBodyFrom('.ezrab-calc-card-grid', mediaIdx);
check(
  'grid kartu satu kolom di dalam media 767px (minmax(0, 1fr))',
  gridBody.includes('grid-template-columns: minmax(0, 1fr)'),
);

const cardBody = ruleBodyFrom('.ezrab-calc-card.has-icon', mediaIdx);
check(
  'kartu berikon: baris (flex-direction row) di dalam media 767px',
  cardBody.includes('flex-direction: row'),
);
check(
  'kartu berikon: min-height 56px',
  cardBody.includes('min-height: 56px'),
);

const iconBody = ruleBodyFrom('.ezrab-calc-card-icon', mediaIdx);
check(
  'ikon kartu 40×40 radius 12px di dalam media 767px',
  iconBody.includes('width: 40px') && iconBody.includes('height: 40px') && iconBody.includes('border-radius: 12px'),
);

const illusImgBody = ruleBodyFrom('.ezrab-illus-img', mediaIdx);
check(
  'ilustrasi strip: height 118px di dalam media 767px',
  illusImgBody.includes('height: 118px'),
);
check(
  'kartu ilustrasi: padding 10px di dalam media 767px',
  ruleBodyFrom('.ezrab-illus-card', mediaIdx).includes('padding: 10px'),
);
check(
  'input workbench target sentuh 44px (checkbox/radio dikecualikan)',
  css.indexOf('#active-calculator-workbench input', mediaIdx) > mediaIdx &&
    css.includes(":not([type='checkbox']):not([type='radio'])") &&
    ruleBodyFrom('#active-calculator-workbench input', mediaIdx).includes('min-height: 44px'),
);

console.log(`\nvolcalcMobilePattern: ${pass} lulus, ${fail} gagal`);
if (fail > 0) process.exit(1);

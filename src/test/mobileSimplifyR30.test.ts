/**
 * Penyederhanaan Tampilan HP R30 — penjaga pola (owner 2026-11-10 19:04,
 * 6 screenshot Production: "perbaiki semua tampilannya, buat lebih
 * simple, dan juga untuk pengaturan setting juga").
 *
 * Memeriksa secara statis kontrak R30:
 *  1. workspace-mobile-fixes.css memuat blok R30 di @media ≤767px:
 *     breadcrumb tengah disembunyikan, aksi header proyek grid 2×2,
 *     kartu Informasi Proyek & Pengaturan RAB ringkas (padding 14px,
 *     isian 44px font 16px, simpan selebar kartu), panel Pengaturan
 *     isian font 16px.
 *  2. Class penanda terpasang di TSX: UnifiedBreadcrumb (ez-breadcrumb-mid),
 *     ProjectContextHeader (ez-proj-*), ProjectInfoTab (ez-projinfo*),
 *     EstimatorSettingsView (ez-rabset*).
 *  3. AI Document: bar tab membungkus penuh di HP (document-ai.css),
 *     sub-navigasi grid 2 kolom, chip header tanpa awalan "Tab:".
 *  4. FeaturePageShell: subjudul di-clamp 2 baris di HP.
 *  5. Chat AI: placeholder composer pendek utuh.
 *  6. Kalkulator Volume: tooltip Reset pendek ("Reset parameter") agar
 *     tidak keluar viewport; teks lengkap pindah ke aria-label.
 *
 * Run (repo): npx --yes tsx src/test/mobileSimplifyR30.test.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const read = (rel: string): string => readFileSync(join(repo, rel), 'utf8');

const fixes = read('src/styles/workspace-mobile-fixes.css');
const docCss = read('src/ai-tools/document-ai/document-ai.css');
const fpCss = read('src/components/feature-shell/feature-page-shell.css');
const breadcrumb = read('src/components/navigation/UnifiedBreadcrumb.tsx');
const projHeader = read('src/components/estimator/ProjectContextHeader.tsx');
const projInfo = read('src/components/estimator/ProjectInfoTab.tsx');
const rabSettings = read('src/components/estimator/EstimatorSettingsView.tsx');
const docView = read('src/ai-tools/document-ai/view.tsx');
const chatView = read('src/ai-tools/ezrab-ai/view.tsx');
const qtoView = read('src/components/qto/QtoCalculatorView.tsx');

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean): void => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ GAGAL: ${name}`); }
};

const count = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

const ruleBody = (cssText: string, selector: string, fromIndex = 0): string => {
  let i = cssText.indexOf(selector, fromIndex);
  while (i >= 0) {
    const after = cssText.charAt(i + selector.length);
    if (after === '' || /[\s{,.:#[>+~]/.test(after)) {
      const open = cssText.indexOf('{', i);
      if (open < 0) return '';
      const close = cssText.indexOf('}', open);
      return cssText.slice(open + 1, close);
    }
    i = cssText.indexOf(selector, i + 1);
  }
  return '';
};

/* 1 — blok R30 di CSS perbaikan mobile ------------------------------------ */
const r30Marker = fixes.indexOf('R30.');
check('blok R30 ada di workspace-mobile-fixes.css', r30Marker > 0);
const r30MediaIdx = fixes.indexOf('@media (max-width: 767px)', r30Marker);
check('blok R30 berada di dalam media max-width 767px', r30MediaIdx > r30Marker);

check(
  'R30a: elemen tengah breadcrumb disembunyikan di HP',
  ruleBody(fixes, '.ezrab-breadcrumb .ez-breadcrumb-mid', r30MediaIdx).includes('display: none'),
);
check(
  'R30b: aksi header proyek grid 2 kolom sama lebar',
  ruleBody(fixes, '.ez-proj-actions', r30MediaIdx).includes('grid-template-columns: 1fr 1fr'),
);
check(
  'R30b: tombol aksi header proyek selebar selnya, tinggi 40px',
  ruleBody(fixes, '.ez-proj-action', r30MediaIdx).includes('width: 100%') &&
    ruleBody(fixes, '.ez-proj-action', r30MediaIdx).includes('height: 40px'),
);
check(
  'R30c: kartu Informasi Proyek padding ringkas 14px',
  ruleBody(fixes, '.ez-projinfo-card', r30MediaIdx).includes('padding: 14px'),
);
check(
  'R30c: grid Informasi Proyek satu kolom',
  ruleBody(fixes, '.ez-projinfo-grid', r30MediaIdx).includes('minmax(0, 1fr)'),
);
check(
  'R30c: isian Informasi Proyek font 16px (anti-zoom)',
  ruleBody(fixes, '.ez-projinfo input', r30MediaIdx).includes('font-size: 16px'),
);
check(
  'R30c: tombol simpan Informasi Proyek selebar kartu',
  ruleBody(fixes, '.ez-projinfo-save', r30MediaIdx).includes('width: 100%'),
);
check(
  'R30d: kartu Pengaturan RAB padding ringkas 14px',
  ruleBody(fixes, '.ez-rabset .ezrab-rabs-grid > div', r30MediaIdx).includes('padding: 14px'),
);
check(
  'R30d: tombol aksi Pengaturan RAB berbagi lebar rata',
  ruleBody(fixes, '.ez-rabset-actions > button', r30MediaIdx).includes('flex: 1 1 0'),
);
check(
  'R30e: isian panel Pengaturan font 16px (anti-zoom)',
  ruleBody(fixes, '.ezrab-set-panel input', r30MediaIdx).includes('font-size: 16px'),
);

/* 2 — class penanda di TSX ------------------------------------------------- */
check('UnifiedBreadcrumb: ez-breadcrumb-mid terpasang (4 elemen tengah)', count(breadcrumb, 'ez-breadcrumb-mid') >= 4);
check('ProjectContextHeader: ez-proj-actions terpasang', projHeader.includes('ez-proj-actions'));
check('ProjectContextHeader: 4 tombol ez-proj-action', count(projHeader, 'ez-proj-action"') >= 4);
check('ProjectContextHeader: ez-proj-headcard + ez-proj-crumb-name', projHeader.includes('ez-proj-headcard') && projHeader.includes('ez-proj-crumb-name'));
check('ProjectInfoTab: ez-projinfo + kartu + simpan', projInfo.includes('ez-projinfo') && projInfo.includes('ez-projinfo-card') && projInfo.includes('ez-projinfo-save'));
check('EstimatorSettingsView: ez-rabset + ez-rabset-actions', rabSettings.includes('ez-rabset') && rabSettings.includes('ez-rabset-actions'));

/* 3 — AI Document ------------------------------------------------------------ */
const docMobileIdx = docCss.indexOf('@media (max-width: 767px)');
check('document-ai.css punya blok max-width 767px', docMobileIdx > 0);
check(
  'docai-tabs membungkus (tidak lagi overflow-x terpotong)',
  ruleBody(docCss, '.docai-tabs', docMobileIdx).includes('flex-wrap: wrap') &&
    ruleBody(docCss, '.docai-tabs', docMobileIdx).includes('overflow-x: visible'),
);
check(
  'docai-tabbtn label boleh membungkus (white-space normal)',
  ruleBody(docCss, '.docai-tabbtn', docMobileIdx).includes('white-space: normal'),
);
check(
  'docai-subnav grid 2 kolom sama lebar',
  ruleBody(docCss, '.docai-subnav', docMobileIdx).includes('grid-template-columns: 1fr 1fr'),
);
check(
  'chip header Dokumen AI tanpa awalan "Tab:"',
  !docView.includes('Tab: {TAB_LABELS[tab]}') && docView.includes('{TAB_LABELS[tab]}'),
);

/* 4 — FeaturePageShell ------------------------------------------------------- */
const fpMobileIdx = fpCss.indexOf('@media (max-width: 700px)');
check(
  'fp-sub di-clamp 2 baris di HP',
  ruleBody(fpCss, '.fp-sub', fpMobileIdx).includes('-webkit-line-clamp: 2'),
);

/* 5 — Chat AI ---------------------------------------------------------------- */
check(
  'placeholder composer pendek utuh',
  chatView.includes("'Ketik pesan atau perintah…'") && !chatView.includes('misalnya /template'),
);

/* 6 — Kalkulator Volume: tooltip Reset --------------------------------------- */
check(
  'tooltip Reset pendek di kedua tombol (tidak keluar viewport)',
  count(qtoView, 'title="Reset parameter"') >= 2 &&
    !qtoView.includes('title="Reset parameter kalkulator aktif'),
);
check(
  'teks lengkap Reset tetap ada sebagai aria-label',
  qtoView.includes('aria-label="Reset parameter kalkulator aktif'),
);

console.log(`\nmobileSimplifyR30: ${pass} lulus, ${fail} gagal`);
if (fail > 0) process.exit(1);

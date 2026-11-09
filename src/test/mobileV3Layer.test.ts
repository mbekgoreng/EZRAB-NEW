/**
 * MobileV3 — penjaga lapis presentasi mode HP (Workstream E, FINISH MODE).
 *
 * Memeriksa secara statis kontrak yang menjaga perbaikan non-desain WS-E:
 *  1. Semua aturan shell v3 berada di dalam @media (max-width: 767px) dan
 *     kelas .mv3-* tidak muncul di dalam blok media itu (desktop tak berubah).
 *  2. Target sentuh kontrol utama lapis mobile ≥ 40px: tombol tutup sheet/
 *     menu (.mv3-icon-btn 40px), aksi sheet (min-height 40px), baris menu
 *     (min-height 52px), chip filter (padding → ≥33px adalah pengecualian
 *     terdokumentasi — bukan kontrol utama; yang dijaga di sini: tombol
 *     buat proyek 46px & tinggi bar nav 68px).
 *  3. Pelindung overflow 390px: nilai total RAB & nominal kartu proyek
 *     boleh mematah (overflow-wrap: anywhere), sapaan hero hanya nama yang
 *     nowrap, label total terpotong ellipsis (bukan meluber).
 *  4. Latar cadangan foto hero & kartu terkait (background #0B2A5C) ada —
 *     teks putih tidak pernah di atas latar terang saat foto belum termuat.
 *  5. Safe-area: navbar memakai var(--ezrab-safe-bottom) dan variabel itu
 *     terdefinisi (tokens.css diimpor global.css yang dimuat main.tsx).
 *  6. Semua aset yang diimpor MobileV3.tsx ada di disk.
 *
 * Run (repo): npx --yes tsx src/test/mobileV3Layer.test.ts
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { formatRpShort, projectStatusMeta, projectPhoto, setProyekPhotos } from '../components/mobile/mobileV3Utils';
import type { Project } from '../types';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const css = readFileSync(join(repo, 'src/styles/mobile-v3.css'), 'utf8');
const tsx = readFileSync(join(repo, 'src/components/mobile/MobileV3.tsx'), 'utf8');
const globalCss = readFileSync(join(repo, 'src/styles/global.css'), 'utf8');

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean): void => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ GAGAL: ${name}`); }
};

/** Ekstrak badan aturan CSS untuk satu selektor (aturan pertama yang cocok). */
const ruleBody = (selector: string): string => {
  const i = css.indexOf(selector);
  if (i < 0) return '';
  const open = css.indexOf('{', i);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
};

/* 1 — pagar media query -------------------------------------------------- */
const mediaStart = css.indexOf('@media (max-width: 767px)');
const media1End = css.indexOf('/* ====', mediaStart);
const media1 = css.slice(mediaStart, media1End);
check('blok media 767px pertama berisi aturan shell (.pf-panel)', media1.includes('.pf-panel'));
check('kelas .mv3- TIDAK muncul di dalam blok media shell', !media1.includes('.mv3-'));
check('aturan .mv3-* berada di luar blok media shell', css.indexOf('.mv3-bottom-nav') > media1End);
check('navbar lama disembunyikan hanya di dalam media query', media1.includes('.ezrab-bottom-nav'));

/* 2 — target sentuh ≥ 40px pada kontrol utama ---------------------------- */
check('.mv3-icon-btn 40×40', /width:\s*40px/.test(ruleBody('.mv3-icon-btn')) && /height:\s*40px/.test(ruleBody('.mv3-icon-btn')));
check('aksi sheet min-height 40px', /min-height:\s*40px/.test(ruleBody('.mv3-sheet-actions button')));
check('baris menu min-height 52px', /min-height:\s*52px/.test(ruleBody('.mv3-menu-row')));
check('tombol buat proyek height 46px', /height:\s*46px/.test(ruleBody('.mv3-create-btn')));
check('bar nav height 68px + safe-bottom', /height:\s*calc\(68px \+ var\(--ezrab-safe-bottom/.test(ruleBody('.mv3-bottom-nav')));
check('bar nav flat menempel (bottom: 0, radius 0)', /bottom:\s*0;/.test(ruleBody('.mv3-bottom-nav')) && /border-radius:\s*0;/.test(ruleBody('.mv3-bottom-nav')));
check('bar nav berlayer 3D (gradasi + highlight atas)', /linear-gradient\(180deg, #FFFFFF/.test(ruleBody('.mv3-bottom-nav')) && /inset 0 1px 0 #FFFFFF/.test(ruleBody('.mv3-bottom-nav')));
check('chatbox kartu AI mengecil ke kiri (width 62%)', /width:\s*62%/.test(ruleBody('.mv3-ai-form')));
check('maskot kartu AI kepala 2D besar ke bawah (height 118px, bottom 0)', /height:\s*118px/.test(ruleBody('.mv3-ai-mascot')) && /bottom:\s*0;/.test(ruleBody('.mv3-ai-mascot')));
check('maskot selalu di depan latar (z-index di atas .mv3-ai-main)', /z-index:\s*3/.test(ruleBody('.mv3-ai-mascot')));
check('navbar varian B: titik aktif di bawah ikon', /background:\s*#1D4ED8/.test(ruleBody('.mv3-nav-item.is-active .mv3-nav-under')));
check('navbar varian B: slot profil memakai maskot (img .mv3-nav-mascot)', tsx.includes('mv3-nav-mascot') && /object-fit:\s*contain/.test(ruleBody('.mv3-nav-mascot')));

/* 3 — pelindung overflow -------------------------------------------------- */
check('nilai total RAB overflow-wrap: anywhere', /overflow-wrap:\s*anywhere/.test(ruleBody('.mv3-total-value')));
check('nominal kartu proyek overflow-wrap: anywhere', /overflow-wrap:\s*anywhere/.test(ruleBody('.mv3-project-amount')));
check('nama sapaan hero nowrap (hanya nama)', /white-space:\s*nowrap/.test(ruleBody('.mv3-hero-name')));
check('label total terpotong ellipsis', /text-overflow:\s*ellipsis/.test(ruleBody('.mv3-total-label')));
/* Diubah atas perintah owner 2026-11-09: max-width judul hero 86% → 62%. */
check(' judul hero dibatasi max-width 62%', /max-width:\s*62%/.test(ruleBody('.mv3-hero-title')));

/* 4 — latar cadangan foto -------------------------------------------------- */
check('hero punya background cadangan #0B2A5C', /background:\s*#0B2A5C/.test(ruleBody('.mv3-hero')));
check('kartu terkait punya background cadangan #0B2A5C', /background:\s*#0B2A5C/.test(ruleBody('.mv3-related')));

/* 5 — safe-area ------------------------------------------------------------- */
check('navbar memakai --ezrab-safe-bottom', ruleBody('.mv3-bottom-nav').includes('var(--ezrab-safe-bottom'));
check('tokens.css diimpor oleh global.css (variabel safe-area aktif)', globalCss.includes("tokens.css"));

/* 6 — aset yang diimpor ada di disk ---------------------------------------- */
const utilsTs = readFileSync(join(repo, 'src/components/mobile/mobileV3Utils.ts'), 'utf8');
const importRe = /from\s+'(\.\.\/\.\.\/assets\/[^']+)'/g;
const relImports = [...tsx.matchAll(importRe), ...utilsTs.matchAll(importRe)].map((m) => m[1]);
check(`MobileV3+utils mengimpor ${relImports.length} aset lokal`, relImports.length >= 6);
for (const rel of relImports) {
  check(`aset ada: ${rel.split('/').pop()}`, existsSync(resolve(repo, 'src/components/mobile', rel)));
}
check('MobileV3 mengekspor ulang util murni dari mobileV3Utils', tsx.includes("from './mobileV3Utils'"));
check('logo resmi public/images/ezrab-logo.png ada', existsSync(join(repo, 'public/images/ezrab-logo.png')));

/* 7 — fungsi murni yang diekspor ------------------------------------------- */
check('formatRpShort(0) = "Rp 0"', formatRpShort(0) === 'Rp 0');
check('formatRpShort(1,09 M) berformat M', formatRpShort(1_090_000_000).includes('M'));
check('formatRpShort(5,5 jt)', formatRpShort(5_500_000) === 'Rp 6 jt' || formatRpShort(5_500_000) === 'Rp 5 jt');
const fakeProject = { status: 'in_progress' } as unknown as Project;
check('projectStatusMeta(in_progress) = Sedang Dikerjakan', projectStatusMeta(fakeProject).label === 'Sedang Dikerjakan');
setProyekPhotos(['a.jpg', 'b.jpg', 'c.jpg']);
check('projectPhoto siklik (indeks 3 = indeks 0)', projectPhoto(3) === projectPhoto(0));
check('MobileV3 menyuntik foto proyek saat modul dimuat', tsx.includes('setProyekPhotos([photoProyekA, photoProyekB, photoProyekC])'));

console.log(`\nmobileV3Layer: ${pass} lulus, ${fail} gagal`);
if (fail > 0) process.exit(1);

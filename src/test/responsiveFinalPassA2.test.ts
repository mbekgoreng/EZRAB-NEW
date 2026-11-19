/**
 * Pass akhir responsif A2 — 2026-11-19 (Workstream A2).
 *
 * Penjaga statis perbaikan level kode pada 390px: sisa hardcode/overflow
 * DED v2.3 terang+gelap, pencarian + toolbar database (AHSP Proyek,
 * Resource Library, Material), dan perilaku scroll/modal terkait.
 * Pola yang sama dengan mobileOverhaul.test.ts: class penanda harus
 * terpasang di TSX terkait DAN aturan kunci harus ada di CSS.
 *
 * Run (repo): npx --yes tsx src/test/responsiveFinalPassA2.test.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const read = (rel: string): string => readFileSync(join(repo, rel), 'utf8');

const dedCss = read('src/ai-tools/ded-ai-estimate/dedAi.css');
const docCss = read('src/ai-tools/document-ai/document-ai.css');
const fixes = read('src/styles/workspace-mobile-fixes.css');
const dedResult = read('src/ai-tools/ded-ai-estimate/DedAiResultView.tsx');
const ahsp = read('src/components/project-source/ProjectAhspView.tsx');
const reslib = read('src/components/resources/ResourceLibraryView.tsx');
const mat = read('src/components/materials/MaterialDatabaseView.tsx');

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean): void => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ GAGAL: ${name}`); }
};

/** Semua badan aturan untuk satu selektor (selektor bisa muncul di blok
 *  dasar + blok media). Pemisah sesudah selektor harus sah agar tidak
 *  tertukar nama yang lebih panjang. */
const ruleBodies = (cssText: string, selector: string, fromIndex = 0): string[] => {
  const out: string[] = [];
  let i = cssText.indexOf(selector, fromIndex);
  while (i >= 0) {
    const after = cssText.charAt(i + selector.length);
    if (after === '' || /[\s{,.:#[>+~]/.test(after)) {
      const open = cssText.indexOf('{', i);
      if (open < 0) break;
      const close = cssText.indexOf('}', open);
      out.push(cssText.slice(open + 1, close));
      i = cssText.indexOf(selector, close + 1);
    } else {
      i = cssText.indexOf(selector, i + 1);
    }
  }
  return out;
};
const anyRule = (cssText: string, selector: string, re: RegExp, fromIndex = 0): boolean =>
  ruleBodies(cssText, selector, fromIndex).some((b) => re.test(b));

/* --- Keseimbangan kurung berkas CSS yang diubah ----------------------- */
for (const [name, css] of [['dedAi.css', dedCss], ['document-ai.css', docCss], ['workspace-mobile-fixes.css', fixes]] as const) {
  const open = (css.match(/\{/g) || []).length;
  const close = (css.match(/\}/g) || []).length;
  check(`${name}: kurung kurawal seimbang (${open} buka / ${close} tutup)`, open === close && open > 0);
}

/* --- A. DED v2.3: input edit, kode error, modal Isi Cepat ------------- */
check('DED: .dedai-edit-input punya latar + warna token', anyRule(dedCss, '.dedai-edit-input', /background:\s*var\(--ez-color-surface\)/) && anyRule(dedCss, '.dedai-edit-input', /color:\s*var\(--ez-color-text-primary\)/));
check('DED: .dedai-error code boleh pecah (overflow-wrap)', anyRule(dedCss, '.dedai-error code', /overflow-wrap:\s*anywhere/));
check('DED: .dedai-modal-input 14px desktop', anyRule(dedCss, '.dedai-modal-input', /font-size:\s*14px/));
check('DED: .dedai-modal-input 16px + 44px di HP', anyRule(dedCss, '.dedai-modal-input', /font-size:\s*16px/) && anyRule(dedCss, '.dedai-modal-input', /min-height:\s*44px/));
check('DED: input modal Isi Cepat memakai class dedai-modal-input', dedResult.includes('className="dedai-modal-input"'));
check('DED: fontSize inline 14 pada input modal sudah dipindah ke CSS', !dedResult.includes("fontSize: 14, textAlign: 'right'"));
check('DED: nama + rumus baris modal boleh pecah', (dedResult.match(/overflowWrap: 'anywhere'/g) || []).length >= 2);

/* --- B. DED mode gelap: sisa hardcode --------------------------------- */
check('DED dark: border kartu mode biru terpilih memakai token', anyRule(dedCss, '[data-theme="dark"] .dedai-modecard.blue.selected', /border-color:\s*var\(--ez-hue-blue-text\)/));
check('DED dark: border tombol Lihat gerbang memakai token', anyRule(dedCss, '[data-theme="dark"] .dedai-gate-lihat', /border-color:\s*var\(--ez-hue-blue-border\)/));
check('DED dark: panel Grand Total Full AI berbatas token', anyRule(dedCss, '[data-theme="dark"] .dedai-ftotal', /border:\s*1px solid var\(--ez-color-border\)/));

/* --- C. Document AI: A4 HP, footer, menu/outline ---------------------- */
check('DocAI: .docai-pagefoot membungkus', anyRule(docCss, '.docai-pagefoot', /flex-wrap:\s*wrap/));
check('DocAI HP: tombol menu editor 44px', anyRule(docCss, '.docai-menu button', /min-height:\s*44px/));
check('DocAI HP: item outline 44px', anyRule(docCss, '.docai-outline-item', /min-height:\s*44px/));
const a4Idx = docCss.indexOf('Lembar A4 di HP');
check('DocAI: blok pemulih A4 HP ada (sesudah PAPER SYSTEM)', a4Idx > 0 && a4Idx > docCss.indexOf('PAPER SYSTEM'));
check('DocAI HP: lembar A4 padding ringkas + tinggi proporsional', docCss.indexOf('.docai-page { padding: 26px 18px; min-height: 560px; }', a4Idx) > 0);
check('DocAI HP: prosa A4 min-height dipulihkan', docCss.indexOf('.docai-prose { min-height: 440px; }', a4Idx) > 0);

/* --- D. AHSP Proyek: header, tabel, modal ----------------------------- */
for (const cls of ['ezdb-ahsp-head', 'ezdb-ahsp-headactions', 'ezdb-ahsp-rowact', 'ezdb-ahsp-catmodal', 'ezdb-ahsp-catfilter', 'ezdb-ahsp-customform']) {
  check(`AHSP: class "${cls}" terpasang`, ahsp.includes(cls));
}
check('AHSP: header membungkus', /ezdb-ahsp-head" style=\{\{[^}]*flexWrap: 'wrap'/.test(ahsp));
check('AHSP: tombol header membungkus', /ezdb-ahsp-headactions" style=\{\{[^}]*flexWrap: 'wrap'/.test(ahsp));
check('AHSP: tabel utama min-width 720px (scroll internal)', ahsp.includes('minWidth: 720'));
check('AHSP: tabel katalog min-width 560px', ahsp.includes('minWidth: 560'));
check('AHSP: daftar katalog scroll-x juga', ahsp.includes("overflowY: 'auto', overflowX: 'auto'"));
check('AHSP: input cari katalog memakai .ezdb-search-input', ahsp.includes('className="ezdb-search-input"'));
check('AHSP: baris filter katalog membungkus', /ezdb-ahsp-catfilter" style=\{\{[^}]*flexWrap: 'wrap'/.test(ahsp));
check('AHSP: tombol tutup katalog 44px', ahsp.includes('aria-label="Tutup katalog"') && ahsp.includes('width: 44, height: 44'));
check('AHSP: modal kustom max-height 90vh + scroll', ahsp.includes("maxHeight: '90vh'") && ahsp.includes("overflowY: 'auto'"));

/* --- E. Resource Library: header, tab, toolbar ------------------------ */
for (const cls of ['ezdb-reslib-head', 'ezdb-reslib-toolbar']) {
  check(`ResLib: class "${cls}" terpasang`, reslib.includes(cls));
}
check('ResLib: header membungkus', /ezdb-reslib-head"[\s\S]{0,400}flexWrap: 'wrap'/.test(reslib));
check('ResLib: bar tab membungkus (disclaimer turun)', /padding: '0 24px',[\s\S]{0,200}flexWrap: 'wrap'/.test(reslib));
check('ResLib: strip tab scroll-x internal', reslib.includes("display: 'flex', gap: '20px', overflowX: 'auto', maxWidth: '100%'"));
check('ResLib: kotak cari min-width aman (min(280px, 100%))', reslib.includes("minWidth: 'min(280px, 100%)'"));
check('ResLib: kotak cari utama memakai .ezdb-search-input', reslib.includes('className="ezdb-search-input"'));
check('ResLib: grup aksi toolbar membungkus', /gap: '8px', flexWrap: 'wrap'/.test(reslib));
check('ResLib: ikon cari terpusat vertikal (bukan top 10px)', !reslib.includes("left: '10px', top: '10px'"));

/* --- F. Material: kotak cari + kontrol kanan -------------------------- */
check('Material: class "mat-search-box" terpasang', mat.includes('mat-search-box'));
check('Material: class "mat-search-input" terpasang', mat.includes('mat-search-input'));
check('Material: kontrol kanan toolbar membungkus', /Right Controls[\s\S]{0,200}flexWrap: 'wrap'/.test(mat));

/* --- G. Blok R31 di workspace-mobile-fixes.css ------------------------ */
const r31Idx = fixes.indexOf('R31. Pass akhir responsif A2');
check('R31: blok penanda ada', r31Idx > 0);
const r31 = (sel: string, re: RegExp): boolean => anyRule(fixes, sel, re, r31Idx);
check('R31: tombol header AHSP 44px', r31('.ezdb-ahsp-headactions > button', /min-height:\s*44px/));
check('R31: tombol aksi baris AHSP 44px', r31('.ezdb-ahsp-rowact button', /min-width:\s*44px/) && r31('.ezdb-ahsp-rowact button', /min-height:\s*44px/));
check('R31: tombol modal katalog 44px', r31('.ezdb-ahsp-catmodal button', /min-height:\s*44px/));
check('R31: kotak cari katalog selebar penuh', r31('.ezdb-ahsp-catfilter > div', /flex:\s*1 1 100%/));
check('R31: pemilih domain katalog 100% + 16px + 44px', r31('.ezdb-ahsp-catfilter select', /width:\s*100%/) && r31('.ezdb-ahsp-catfilter select', /font-size:\s*16px/) && r31('.ezdb-ahsp-catfilter select', /min-height:\s*44px/));
check('R31: isian modal kustom 16px', r31('.ezdb-ahsp-customform input', /font-size:\s*16px/));
check('R31: input modal kustom 44px + tombol 44px', r31('.ezdb-ahsp-customform input', /min-height:\s*44px/) && r31('.ezdb-ahsp-customform button', /min-height:\s*44px/));
check('R31: tombol header ResLib 44px', r31('.ezdb-reslib-head button', /min-height:\s*44px/));
check('R31: filter ResLib 16px + 44px', r31('.ezdb-reslib-toolbar select', /font-size:\s*16px/) && r31('.ezdb-reslib-toolbar select', /min-height:\s*44px/));
check('R31: tombol + label Import ResLib 44px', r31('.ezdb-reslib-toolbar button', /min-height:\s*44px/) && r31('.ezdb-reslib-toolbar label', /min-height:\s*44px/));
check('R31: kotak cari Material 44px + font 16px', r31('.mat-search-box', /height:\s*44px/) && r31('.mat-search-input', /font-size:\s*16px/));
check('R31: tombol filter-box Material 44px', r31('.mat-filter-box button', /min-height:\s*44px/));
check('R31: dropdown filter Material 16px + 44px', r31('.mat-filter-box select', /font-size:\s*16px/) && r31('.mat-filter-box select', /min-height:\s*44px/));
check('R31: chevron dropdown dipusatkan ulang (bottom 16px)', r31('.mat-filter-grid-5 > div > svg', /bottom:\s*16px/));

console.log(`\nresponsiveFinalPassA2: ${pass} lulus, ${fail} gagal`);
if (fail > 0) process.exit(1);

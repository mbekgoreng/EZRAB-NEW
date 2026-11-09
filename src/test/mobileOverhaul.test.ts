/**
 * Overhaul Mobile Video Owner 2026-11-09 — penjaga pola R11–R27.
 *
 * Memeriksa secara statis kontrak perbaikan mobile menyeluruh dari audit
 * video HP owner (build Preview 96ec502): untuk tiap area pada katalog
 * cacat, class penanda ezrab-* harus terpasang di TSX terkait DAN aturan
 * kunci harus ada di blok @media (max-width: 767px) pada
 * workspace-mobile-fixes.css (atau mobile-v3.css untuk S2–S4 shell v3).
 *
 * Jujur sesuai implementasi: yang diperiksa hanya pola yang benar-benar
 * diterapkan (scroll-x + min-width tabel, satu kolom, modal ≤100vw−16px,
 * form satu kolom, ruang aman bawah dari pil floating).
 *
 * Run (repo): npx --yes tsx src/test/mobileOverhaul.test.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const read = (rel: string): string => readFileSync(join(repo, rel), 'utf8');

const fixes = read('src/styles/workspace-mobile-fixes.css');
const mv3css = read('src/styles/mobile-v3.css');

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean): void => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ GAGAL: ${name}`); }
};

/**
 * Badan aturan CSS untuk selektor — cocok pada BARIS yang diawali selektor
 * persis (dijangkar ke awal baris) agar tidak tertukar aturan yang berbagi
 * awalan nama, mis. ".mv3-tile" vs ".mv3-tiles", atau ".ezrab-ahsp-modal"
 * vs ".ezrab-ahsp-modal-overlay".
 */
const ruleBody = (cssText: string, selector: string, fromIndex = 0): string => {
  /* Cari selektor sebagai potongan teks, lalu pastikan karakter TEPAT
     sesudahnya adalah pemisah selektor yang sah ({ , . # : [ spasi > + ~
     atau akhir) — bukan kelanjutan nama yang lebih panjang seperti
     ".mv3-tiles" (mencari ".mv3-tile") atau ".ezrab-ahsp-modal-overlay"
     (mencari ".ezrab-ahsp-modal"). Bila tidak sah, lanjut ke kemunculan
     berikutnya. */
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

/* Blok overhaul = bagian sesudah penanda R11 pada workspace-mobile-fixes.css */
const overhaulIdx = fixes.indexOf('OVERHAUL MOBILE VIDEO OWNER');
check('blok overhaul R11+ ada di workspace-mobile-fixes.css', overhaulIdx > 0);
const fx = (sel: string): string => ruleBody(fixes, sel, overhaulIdx);

/* --- S1 TopBar: cluster kanan rapat ------------------------------------- */
check('R11: .ezrab-topbar-right gap 4px', /gap:\s*4px/.test(fx('.ezrab-topbar-right')));
check('R11: pil kredit compact ramping (height 28px)', /height:\s*28px/.test(fx('.ezrab-topbar-right .aic-balance.compact')));
check('R11: koin kredit 16px', /width:\s*16px/.test(fx('.ezrab-topbar-right .aic-balance.compact .aic-coin')));
check('R11: label paket .aic-plan disembunyikan di TopBar HP', /display:\s*none/.test(fx('.ezrab-topbar-right .aic-plan')));
const topbar = read('src/components/navigation/TopBar.tsx');
check('S1-sisa: pil mata uang (min-width 64px, "pil kosong" audit) digating !isNarrowMobile di TopBar', /!isNarrowMobile && \(\s*<div style=\{\{ position: 'relative' \}\} ref=\{currencyRef\}/.test(topbar));

/* --- S6 Breadcrumb satu baris scroll-x ----------------------------------- */
const breadcrumb = read('src/components/navigation/UnifiedBreadcrumb.tsx');
check('S6: class ezrab-breadcrumb terpasang di UnifiedBreadcrumb', breadcrumb.includes('className="ezrab-breadcrumb"'));
check('R12: breadcrumb nowrap + overflow-x auto', /flex-wrap:\s*nowrap/.test(fx('.ezrab-breadcrumb')) && /overflow-x:\s*auto/.test(fx('.ezrab-breadcrumb')));
check('R12: anak breadcrumb tidak menyusut (flex-shrink 0)', /flex-shrink:\s*0/.test(fx('.ezrab-breadcrumb > *')));
check('R12: daun breadcrumb max-width 150px', /max-width:\s*150px/.test(fx('.ezrab-breadcrumb > span')));

/* --- S5 Pil floating Ezrab AI -------------------------------------------- */
check('R13: pil launcher ramping (height 36px)', /height:\s*36px/.test(fx(".pf-panel > div[style*='position: fixed'] .ezrab-touch-target")));
check('R13: ruang aman bawah .pf-main main 120px + safe-area', /padding-bottom:\s*calc\(120px/.test(fx('.pf-main main')));

/* --- S2–S4 Shell MobileV3 (mobile-v3.css) --------------------------------- */
check('S2: judul hero font-size 20px', /font-size:\s*20px/.test(ruleBody(mv3css, '.mv3-hero-title')));
/* Diubah atas perintah owner 2026-11-09: pagar 86% diganti 62%. */
check('S2: judul hero dibatasi max-width 62% (perintah owner 2026-11-09)', /max-width:\s*62%/.test(ruleBody(mv3css, '.mv3-hero-title')));
check('S3: deskripsi kartu AI max-width 60%', /max-width:\s*60%/.test(ruleBody(mv3css, '.mv3-ai-sub')));
check('S4: grid ubin minmax(0, 1fr)', /minmax\(0, 1fr\)/.test(ruleBody(mv3css, '.mv3-tiles')));
check('S4: ubin min-width 0', /min-width:\s*0/.test(ruleBody(mv3css, '.mv3-tile')));
check('S4: label ubin overflow-wrap anywhere + 10px', /overflow-wrap:\s*anywhere/.test(ruleBody(mv3css, '.mv3-tile-label')) && /font-size:\s*10px/.test(ruleBody(mv3css, '.mv3-tile-label')));

/* --- P1 chip filter proyek (verifikasi pola sudah ada) -------------------- */
check('P1: .mv3-filter-row sudah scroll-x satu baris', /overflow-x:\s*auto/.test(ruleBody(mv3css, '.mv3-filter-row')));
check('P1: chip filter flex-shrink 0', /flex-shrink:\s*0/.test(ruleBody(mv3css, '.mv3-filter-chip')));

/* --- P2 pemilih proyek drawer --------------------------------------------- */
const sidebar = read('src/components/layout/Sidebar.tsx');
check('P2: class ezrab-project-picker-btn terpasang di Sidebar', sidebar.includes('ezrab-project-picker-btn'));
check('R14: tombol pemilih width 100% + min-width 0', /width:\s*100%/.test(fx('.ezrab-project-picker-btn')) && /min-width:\s*0/.test(fx('.ezrab-project-picker-btn')));

/* --- V1–V3 Kalkulator Volume ---------------------------------------------- */
const qto = read('src/components/qto/QtoCalculatorView.tsx');
for (const cls of [
  'ezrab-qto-title-row',
  'ezrab-calc-card-topbar',
  'ezrab-calc-card-unit',
  'ezrab-calc-card-text',
  'ezrab-calc-card-desc',
  'ezrab-prov-wrap',
  'ezrab-prov-table',
  'ezrab-prov-note',
  'ezrab-prov-cell',
]) {
  check(`V: class "${cls}" terpasang di QtoCalculatorView`, qto.includes(cls));
}
check('R15: baris judul header membungkus (flex-wrap wrap)', /flex-wrap:\s*wrap/.test(fx('.ezrab-qto-title-row')));
check('R15: lencana satuan flex-shrink 0 + nowrap', /flex-shrink:\s*0/.test(fx('.ezrab-calc-card-unit')) && /white-space:\s*nowrap/.test(fx('.ezrab-calc-card-unit')));
check('R15: deskripsi kartu line-clamp 1 di HP', /line-clamp:\s*1/.test(fx('.ezrab-calc-card-desc')));
check('R16: kartu provenans scroll-x', /overflow-x:\s*auto/.test(fx('.ezrab-prov-wrap')));
check('R16: tabel provenans min-width 560px', /min-width:\s*560px/.test(fx('.ezrab-prov-table')));
check('R16: catatan provenans font 11px lh 1.5', /font-size:\s*11px/.test(fx('.ezrab-prov-note')) && /line-height:\s*1\.5/.test(fx('.ezrab-prov-note')));
check('V3-sisa: provenans dibungkus <details class="ezrab-prov-details"> tertutup bawaan', qto.includes('<details className="ezrab-prov-details">') && qto.includes('<summary className="ezrab-prov-summary">Sumber &amp; dasar harga</summary>'));
check('R28: summary provenans cursor pointer + warna primer', /cursor:\s*pointer/.test(ruleBody(fixes, '.ezrab-prov-summary')) && /var\(--ez-color-primary/.test(ruleBody(fixes, '.ezrab-prov-summary')));
check('R28: penanda ▾ saat details terbuka', ruleBody(fixes, '.ezrab-prov-details[open] > .ezrab-prov-summary').includes('▾'));
check('R28: teks di dalam details provenans 11px lh 1.5', /font-size:\s*11px/.test(ruleBody(fixes, '.ezrab-prov-details > div')) && /line-height:\s*1\.5/.test(ruleBody(fixes, '.ezrab-prov-details > div')));

/* --- Q1–Q2 Rekapitulasi QTO ------------------------------------------------ */
const rekapQto = read('src/components/qto/QtoRekapVolumeView.tsx');
for (const cls of ['ezrab-qto-kpi-grid', 'ezrab-qto-toolbar', 'ezrab-qto-search', 'ezrab-qto-controls']) {
  check(`Q: class "${cls}" terpasang di QtoRekapVolumeView`, rekapQto.includes(cls));
}
check('R17: KPI QTO satu kolom', /grid-template-columns:\s*minmax\(0, 1fr\)/.test(fx('.ezrab-qto-kpi-grid')));
check('R17: pencarian QTO melebar penuh (flex 1 1 100%)', /flex:\s*1 1 100%/.test(fx('.ezrab-qto-search')));
check('R17: kontrol QTO membungkus', /flex-wrap:\s*wrap/.test(fx('.ezrab-qto-controls')));

/* --- J1–J2 Jadwal & Kurva S ------------------------------------------------- */
const manajemen = read('src/components/management/ManajemenProyekView.tsx');
check('J1: class ezrab-sched-table terpasang', manajemen.includes('ezrab-sched-table'));
check('R18: tabel jadwal min-width 640px', /min-width:\s*640px/.test(fx('.ezrab-sched-table')));
const kurva = read('src/components/estimator/EstimatorKurvaSView.tsx');
check('J2: class ezrab-kurva-chart & ezrab-kurva-tablecard terpasang', kurva.includes('ezrab-kurva-chart') && kurva.includes('ezrab-kurva-tablecard'));
check('R18: SVG kurva min-width 640px (kontainer scroll-x)', /min-width:\s*640px/.test(fx('.ezrab-kurva-chart svg')));

/* --- R1–R3 Spreadsheet RAB --------------------------------------------------- */
const metrics = read('src/components/estimator/EstimatorMetrics.tsx');
check('R1: class ezrab-rab-metrics terpasang di EstimatorMetrics', metrics.includes('ezrab-rab-metrics'));
check('R19: metrik RAB satu kolom', /grid-template-columns:\s*minmax\(0, 1fr\)/.test(fx('.ezrab-rab-metrics')));
const sheet = read('src/components/estimator/EstimatorSpreadsheetTable.tsx');
for (const cls of ['ezrab-sheet', 'ezrab-sheet-scroll', 'ezrab-sheet-table', 'ezrab-sheet-desc']) {
  check(`R: class "${cls}" terpasang di EstimatorSpreadsheetTable`, sheet.includes(cls));
}
check('R19: tabel spreadsheet min-width 620px', /min-width:\s*620px/.test(fx('.ezrab-sheet-table')));
check('R19: sel uraian overflow-wrap break-word', /overflow-wrap:\s*break-word/.test(fx('.ezrab-sheet-desc')));

/* --- K1 Rekapitulasi RAB ------------------------------------------------------ */
const rekapRab = read('src/components/estimator/EstimatorRekapitulasiView.tsx');
for (const cls of ['ezrab-rekap-metrics', 'ezrab-rekap-wrap', 'ezrab-rekap-table']) {
  check(`K: class "${cls}" terpasang di EstimatorRekapitulasiView`, rekapRab.includes(cls));
}
check('R20: metrik rekap satu kolom', /grid-template-columns:\s*minmax\(0, 1fr\)/.test(fx('.ezrab-rekap-metrics')));
check('R20: tabel WBS min-width 560px', /min-width:\s*560px/.test(fx('.ezrab-rekap-table')));
check('R20: kolom uraian WBS min-width 180px', /min-width:\s*180px/.test(fx('.ezrab-rekap-table th:nth-child(2)')));

/* --- A1–A2 AHSP ----------------------------------------------------------------- */
const ahspProj = read('src/components/estimator/EstimatorAhspView.tsx');
for (const cls of ['ezrab-ahsp-card', 'ezrab-ahsp-card-head', 'ezrab-ahsp-title', 'ezrab-ahsp-meta', 'ezrab-ahsp-badgerow', 'ezrab-ahsp-price', 'ezrab-ahsp-detail']) {
  check(`A1: class "${cls}" terpasang di EstimatorAhspView`, ahspProj.includes(cls));
}
check('R21: kepala kartu AHSP membungkus', /flex-wrap:\s*wrap/.test(fx('.ezrab-ahsp-card-head')));
check('R21: blok harga AHSP turun (margin-left 0)', /margin-left:\s*0/.test(fx('.ezrab-ahsp-price')));
check('R21: judul AHSP white-space normal', /white-space:\s*normal/.test(fx('.ezrab-ahsp-title')));
check('R21: tabel rincian AHSP min-width 520px', /min-width:\s*520px/.test(fx('.ezrab-ahsp-detail table')));
const explorer = read('src/components/ahsp/AhspExplorerView.tsx');
for (const cls of ['ezrab-ahsp-modal-overlay', 'ezrab-ahsp-modal', 'ezrab-ahsp-modal-body', 'ezrab-ahsp-modal-table', 'ezrab-ahsp-modal-foot']) {
  check(`A2: class "${cls}" terpasang di AhspExplorerView`, explorer.includes(cls));
}
check('R21: modal AHSP ≤100vw−16px', /max-width:\s*calc\(100vw - 16px\)/.test(fx('.ezrab-ahsp-modal')));
check('R21: tabel modal AHSP min-width 620px', /min-width:\s*620px/.test(fx('.ezrab-ahsp-modal-table')));
check('R21: kaki modal AHSP membungkus + tombol flex 1 1 40%', /flex-wrap:\s*wrap/.test(fx('.ezrab-ahsp-modal-foot')) && /flex:\s*1 1 40%/.test(fx('.ezrab-ahsp-modal-foot button')));

/* --- T1–T2 Template RAB ---------------------------------------------------------- */
const tpl = read('src/components/templates/UniversalTemplateConfigurator.tsx');
for (const cls of ['ezrab-tpl-modal-overlay', 'ezrab-tpl-modal', 'ezrab-tpl-split', 'ezrab-tpl-left', 'ezrab-tpl-right', 'ezrab-tpl-target-tabs', 'ezrab-tpl-level-grid']) {
  check(`T: class "${cls}" terpasang di UniversalTemplateConfigurator`, tpl.includes(cls));
}
check('R22: modal template ≤100vw−16px', /max-width:\s*calc\(100vw - 16px\)/.test(fx('.ezrab-tpl-modal')));
check('R22: badan modal menjadi kolom vertikal', /flex-direction:\s*column/.test(fx('.ezrab-tpl-split')));
check('R22: kolom kiri/kanan modal lebar penuh', /width:\s*100%/.test(fx('.ezrab-tpl-left')));
check('R22: grid level satu kolom', /grid-template-columns:\s*1fr/.test(fx('.ezrab-tpl-level-grid')));
check('R22: tab target proyek membungkus', /flex-wrap:\s*wrap/.test(fx('.ezrab-tpl-target-tabs')));

/* --- D1–D2 Database ---------------------------------------------------------------- */
check('R23: kolom nama material sticky kiri 36px', /position:\s*sticky/.test(fx('.mat-table th:nth-child(2)')) && /left:\s*36px/.test(fx('.mat-table th:nth-child(2)')));
const reslib = read('src/components/resources/ResourceLibraryView.tsx');
for (const cls of ['ezrab-reslib-card', 'ezrab-reslib-table', 'ezrab-supplier-grid']) {
  check(`D2: class "${cls}" terpasang di ResourceLibraryView`, reslib.includes(cls));
}
check('R23: kartu Resource Library scroll-x', /overflow-x:\s*auto/.test(fx('.ezrab-reslib-card')));
check('R23: tabel Resource Library min-width 680px', /min-width:\s*680px/.test(fx('.ezrab-reslib-table')));
check('R23: grid pemasok minmax(min(340px, 100%))', /minmax\(min\(340px, 100%\), 1fr\)/.test(fx('.ezrab-supplier-grid')));

/* --- DA1 AI Document ------------------------------------------------------------------ */
check('R24: baris konteks AI Document membungkus', /flex-wrap:\s*wrap/.test(fx('.docai-ctxrow')));
check('R24: nilai konteks selebar penuh di bawah (order 3)', /flex:\s*1 1 100%/.test(fx('.docai-ctxvalue')) && /order:\s*3/.test(fx('.docai-ctxvalue')));

/* --- C1 / L1 / KE1 ---------------------------------------------------------------------- */
const notes = read('src/components/estimator/EstimatorNotesView.tsx');
check('C1: class ezrab-notes-grid terpasang', notes.includes('ezrab-notes-grid'));
check('R25: grid catatan satu kolom', /grid-template-columns:\s*minmax\(0, 1fr\)/.test(fx('.ezrab-notes-grid')));
const laporan = read('src/components/reports/LaporanView.tsx');
for (const cls of ['ezrab-lap-donut-grid', 'ezrab-lap-donut-row', 'ezrab-lap-legend']) {
  check(`L1: class "${cls}" terpasang di LaporanView`, laporan.includes(cls));
}
check('R25: grid donut satu kolom', /grid-template-columns:\s*minmax\(0, 1fr\)/.test(fx('.ezrab-lap-donut-grid')));
check('R25: legenda min-width 200px fleksibel', /min-width:\s*200px/.test(fx('.ezrab-lap-legend')));
const bva = read('src/components/finance/BudgetVsActualCard.tsx');
for (const cls of ['ezrab-bva', 'ezrab-bva-head', 'ezrab-bva-label', 'ezrab-bva-var', 'ezrab-bva-val']) {
  check(`KE1: class "${cls}" terpasang di BudgetVsActualCard`, bva.includes(cls));
}
check('R25: kepala Budget vs Actual membungkus', /flex-wrap:\s*wrap/.test(fx('.ezrab-bva-head')));
check('R25: pil varian nowrap', /white-space:\s*nowrap/.test(fx('.ezrab-bva-var')));

/* --- PG1 / PG2 / DP1 ---------------------------------------------------------------------- */
const settings = read('src/components/settings/UnifiedSettingsView.tsx');
for (const cls of ['ezrab-set-header', 'ezrab-set-titlerow', 'ezrab-set-scopebar', 'ezrab-set-panel', 'ezrab-set-grid2', 'ezrab-set-grid3']) {
  check(`PG: class "${cls}" terpasang di UnifiedSettingsView`, settings.includes(cls));
}
check('R26: grid form pengaturan satu kolom', /grid-template-columns:\s*minmax\(0, 1fr\)/.test(fx('.ezrab-set-grid2')));
check('R26: grid inline lain di panel ikut satu kolom (selektor atribut)', /grid-template-columns:\s*minmax\(0, 1fr\)/.test(fx(".ezrab-set-panel [style*='repeat(2, 1fr)']")));
check('R26: baris judul pengaturan membungkus', /flex-wrap:\s*wrap/.test(fx('.ezrab-set-titlerow')));
const rabSettings = read('src/components/estimator/EstimatorSettingsView.tsx');
check('PG-RAB: class ezrab-rabs-grid terpasang di EstimatorSettingsView', rabSettings.includes('ezrab-rabs-grid'));
check('R26: grid Pengaturan RAB satu kolom', /grid-template-columns:\s*minmax\(0, 1fr\)/.test(fx('.ezrab-rabs-grid')));
const tender = read('src/components/document/TenderDocumentsView.tsx');
for (const cls of ['ezrab-tender-toolbar', 'ezrab-tender-tabs', 'ezrab-tender-filterrow', 'ezrab-tender-search']) {
  check(`DP1: class "${cls}" terpasang di TenderDocumentsView`, tender.includes(cls));
}
check('R26: baris filter dokumen membungkus', /flex-wrap:\s*wrap/.test(fx('.ezrab-tender-filterrow')));
check('R26: pencarian dokumen fleksibel (flex 1 1 160px)', /flex:\s*1 1 160px/.test(fx('.ezrab-tender-search')));

/* --- CA1 Header Chat AI ---------------------------------------------------------------------- */
check('R27: header chat rapat (gap 6px)', /gap:\s*6px/.test(fx('.ezchat2-header')));
check('R27: maskot header chat 32px', /width:\s*32px/.test(fx('.ezchat2-mascot')));
check('R27: nama chat ellipsis wajar (bukan 1 huruf)', /text-overflow:\s*ellipsis/.test(fx('.ezchat2-name')));
check('R27: pil kredit header chat ramping (28px)', /height:\s*28px/.test(fx('.ezchat2-actions .aic-balance.compact')));
check('R27: pemilih mode chat max-width 92px', /max-width:\s*92px/.test(fx('.ezchat2-modesel')));

console.log(`\nmobileOverhaul: ${pass} lulus, ${fail} gagal`);
if (fail > 0) process.exit(1);

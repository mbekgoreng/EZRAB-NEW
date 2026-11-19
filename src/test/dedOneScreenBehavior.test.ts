/**
 * DED One-Screen — perilaku layout baru (2026-11-19).
 *
 * Memeriksa secara statis bahwa restrukturisasi one-screen
 * (DedAiInputView.tsx + blok ONE-SCREEN di dedAi.css) MEMPERTAHANKAN
 * semua interaksi layar input v2.3 — hanya susunannya yang berubah,
 * bukan logikanya. Gaya sama seperti dedDocViewportFit /
 * dedDocPageShell: pemeriksaan string/CSS statis, BUKAN vitest.
 *
 * Cakupan: kartu mode (2, radiogroup, chevron stopPropagation),
 * kedalaman FAST/DETAIL, kompleksitas (DETAIL-only + reset persetujuan),
 * cakupan + scopeError, jenis proyek single-select (7 chip), validasi
 * upload (5 file, 25 MB, PDF-only) + ganti/hapus, dropzone ramping,
 * gerbang tombol mulai, estimasi kredit + persetujuan, preferensi
 * output (4 checkbox + default), strip pratinjau (4 sel, keadaan
 * nyata), panel Pengaturan Tambahan, tombol info scan-note, dan blok
 * CSS ONE-SCREEN (13 kelas dedai-os-*, breakpoint 1100/720, override
 * tombol 46px). Tes fungsi murni (mis. resolvePageScope) TIDAK
 * diduplikasi di sini — sudah ada di tempat lain.
 *
 * Run (repo): npx --yes tsx src/test/dedOneScreenBehavior.test.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const read = (rel: string): string => readFileSync(join(repo, rel), 'utf8');

const dedInput = read('src/ai-tools/ded-ai-estimate/DedAiInputView.tsx');
const dedCss = read('src/ai-tools/ded-ai-estimate/dedAi.css');
const modeCardsSrc = read('src/ai-tools/ded-ai-estimate/dedModeUi.ts');

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean): void => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ GAGAL: ${name}`); }
};
const count = (text: string, sub: string): number => text.split(sub).length - 1;

/* (a) Kartu mode: PERSIS 2, radiogroup, chevron expand tanpa memilih ---- */
const cardsArray = modeCardsSrc.slice(
  modeCardsSrc.indexOf('DED_MODE_CARDS'),
  modeCardsSrc.indexOf('];', modeCardsSrc.indexOf('DED_MODE_CARDS')),
);
check('mode: PERSIS 2 kartu (EZRAB_AI + FULL_AI)',
  count(cardsArray, "mode: '") === 2
  && cardsArray.includes("mode: 'EZRAB_AI'") && cardsArray.includes("mode: 'FULL_AI'"));
check('mode: radiogroup + radio + aria-checked',
  dedInput.includes('role="radiogroup"') && dedInput.includes('role="radio"')
  && dedInput.includes('aria-checked={selected}'));
check('mode: chevron expand dengan stopPropagation (tidak memilih mode)',
  dedInput.includes('dedai-v23-chev') && dedInput.includes('e.stopPropagation()')
  && dedInput.includes('setExpandedModes'));
check('mode: render dari DED_MODE_CARDS + catatan kartu dirender',
  dedInput.includes('DED_MODE_CARDS.map') && dedInput.includes('dedai-modecard-note')
  && dedInput.includes('{card.note}'));

/* (b) Kedalaman FAST / DETAIL -------------------------------------------- */
check('kedalaman: seg FAST/DETAIL memanggil setMode',
  dedInput.includes("setMode('FAST')") && dedInput.includes("setMode('DETAIL')")
  && dedInput.includes("t('ai.ded.input.mode_fast')") && dedInput.includes("t('ai.ded.input.mode_deep')"));

/* (c) Kompleksitas: hanya DETAIL + reset persetujuan ---------------------- */
check('kompleksitas: disabled di luar DETAIL / tanpa izin DED',
  dedInput.includes("disabled={mode !== 'DETAIL' || !dedAllowed}"));
check('kompleksitas: ganti pilihan me-reset creditApproved',
  dedInput.includes('setComplexity(o.value); setCreditApproved(false)'));

/* (d) Cakupan ALL/SELECTED + scope input + scopeError --------------------- */
check('cakupan: seg ALL/SELECTED + input rentang',
  dedInput.includes("setScopeKind('ALL')") && dedInput.includes("setScopeKind('SELECTED')")
  && dedInput.includes('dedai-scopepick') && dedInput.includes('value={scopeSpec}'));
check('cakupan: scopeError menggerbang canStart',
  dedInput.includes('scopeError')
  && dedInput.includes('canStart = validFiles.length > 0 && !scopeError'));

/* (e) Jenis proyek SINGLE-select, 7 chip ---------------------------------- */
check('jenis proyek: 7 opsi PROJECT_TYPE_OPTIONS',
  dedInput.includes('PROJECT_TYPE_OPTIONS')
  && count(dedInput, "t('ai.ded.input.type_") === 7);
check('jenis proyek: single-select (setProjectType, bukan array)',
  dedInput.includes('setProjectType(o.value)') && dedInput.includes('projectType === o.value')
  && !dedInput.includes('projectTypes'));

/* (f) Validasi upload + ganti/hapus --------------------------------------- */
check('upload: batas MAX_FILES=5, MAX_FILE_MB=25, PDF-only',
  dedInput.includes('const MAX_FILES = 5;') && dedInput.includes('const MAX_FILE_MB = 25;')
  && dedInput.includes("f.type === 'application/pdf'") && dedInput.includes('err_pdf_only')
  && dedInput.includes('accept=".pdf,application/pdf"'));
check('upload: handler ganti (replace) + hapus per berkas ada',
  dedInput.includes('startReplace') && dedInput.includes('onReplacePicked')
  && dedInput.includes('setFiles((p) => p.filter((x) => x.id !== f.id))'));

/* (g) Dropzone ramping saat berkas ada ------------------------------------ */
check('dropzone: kelas slim saat files.length > 0 (elemen sama)',
  dedInput.includes('dedai-drop dedai-os-drop') && dedInput.includes('dedai-os-drop-slim')
  && dedInput.includes('files.length > 0'));

/* (h) Gerbang tombol mulai ------------------------------------------------- */
check('mulai: disabled kecuali canStart && creditApproved && dedAllowed',
  dedInput.includes('disabled={!canStart || !creditApproved || !dedAllowed}'));
check('mulai: handleStart menegakkan gerbang yang sama',
  dedInput.includes('if (!canStart || !creditApproved || !dedAllowed) return;'));

/* (i) Estimasi kredit + persetujuan --------------------------------------- */
check('kredit: estimasi memakai tariffFor per kompleksitas',
  dedInput.includes('tariffFor(`ded-ai/${complexity}`)') && dedInput.includes('aic-estimate'));
check('kredit: checkbox persetujuan terikat creditApproved',
  dedInput.includes('checked={creditApproved}') && dedInput.includes('setCreditApproved(e.target.checked)'));
check('kredit: label Kompleksitas & Estimasi Kredit dipertahankan',
  dedInput.includes('Kompleksitas & Estimasi Kredit'));

/* (j) Preferensi output: 4 checkbox + default ----------------------------- */
check('prefs: 4 checkbox terikat outputPrefs.*',
  dedInput.includes('outputPrefs.detailRab') && dedInput.includes('outputPrefs.volume')
  && dedInput.includes('outputPrefs.priceAnalysis') && dedInput.includes('outputPrefs.unresolvedReport'));
check('prefs: default dari DEFAULT_DED_OUTPUT_PREFS, grid 2 kolom',
  dedInput.includes('DEFAULT_DED_OUTPUT_PREFS') && dedInput.includes('dedai-os-prefs2'));

/* (k) Pratinjau: 4 sel keadaan nyata -------------------------------------- */
check('pratinjau: PERSIS 4 sel .pv, selalu terlihat',
  count(dedInput, '<div className="pv">') === 4 && dedInput.includes('dedai-os-preview'));
check('pratinjau: sel terikat stripDocs + lastRunSummary, kosong = "—"',
  dedInput.includes('stripDocs.v') && dedInput.includes('stripDocs.s')
  && dedInput.includes('lastRunSummary.items') && dedInput.includes('lastRunSummary.volumesIdentified')
  && dedInput.includes('lastRunSummary.pricesNeedVerify') && dedInput.includes("'—'"));

/* (l) Pengaturan Tambahan: prefs + deskripsi ------------------------------- */
check('pengaturan: details "Pengaturan Tambahan" memuat prefs lalu deskripsi',
  dedInput.includes('Pengaturan Tambahan')
  && dedInput.indexOf('Pengaturan Tambahan') < dedInput.indexOf('dedai-os-prefs2')
  && dedInput.indexOf('dedai-os-prefs2') < dedInput.indexOf('value={description}'));
check('pengaturan: prefill deskripsi D3e utuh',
  dedInput.includes('setDescription(initialSession.description)'));

/* (m) Tombol info scan-note ----------------------------------------------- */
check('info: tombol info + title + aria-describedby + sr-only span',
  dedInput.includes('dedai-os-info') && dedInput.includes('aria-describedby="dedai-scan-note"')
  && dedInput.includes('id="dedai-scan-note"') && dedInput.includes('dedai-os-sr-only')
  && dedInput.includes("title={`${t('ai.ded.input.notice_a')}"));

/* (n) Blok CSS ONE-SCREEN --------------------------------------------------- */
const osStart = dedCss.indexOf('ONE-SCREEN 2026-11-19');
const osBlock = osStart > 0 ? dedCss.slice(osStart) : '';
const OS_CLASSES = [
  'dedai-os-top', 'dedai-os-col', 'dedai-os-label', 'dedai-os-info', 'dedai-os-sr-only',
  'dedai-os-drop', 'dedai-os-drop-slim', 'dedai-os-files', 'dedai-os-dest', 'dedai-os-credit',
  'dedai-os-preview', 'dedai-os-prefs2', 'dedai-os-startwrap',
];
check('css: blok ONE-SCREEN ada di akhir dedAi.css', osStart > 0);
check('css: ke-13 kelas dedai-os-* ada di blok baru',
  OS_CLASSES.every((c) => osBlock.includes(`.${c}`)));
check('css: grid atas 42fr/58fr + breakpoint tablet 1100 + HP 720',
  osBlock.includes('grid-template-columns: 42fr 58fr')
  && osBlock.includes('@media (max-width: 1100px)')
  && osBlock.includes('@media (max-width: 720px)'));
check('css: override tombol mulai min-height 46px (spesifisitas 0,4,0) — RE-BASELINE FIT FIX 2026-11-19 (48px -> 46px, hemat 2px)',
  osBlock.includes('.dedai-input .dedai-btn.primary.dedai-v23-start')
  && osBlock.includes('min-height: 46px'));
check('css FIT FIX: sub kartu mode elipsis 1 baris + title attr teks lengkap',
  osBlock.includes('.dedai-modecard-sub') && osBlock.includes('text-overflow: ellipsis')
  && dedInput.includes('title={card.subtitle}'));
check('css FIT FIX: tombol seg konfigurasi tanpa wrap (baris Cakupan 1 baris)',
  osBlock.includes('.dedai-v23-cfg .dedai-seg button') && osBlock.includes('white-space: nowrap'));
check('css: sub upload disembunyikan saat dropzone ramping (:has)',
  osBlock.includes(':has(.dedai-os-drop-slim)'));
check('css: tanpa warna hardcode di blok baru (token saja)',
  !/#[0-9a-fA-F]{3}/.test(osBlock) && !/rgba?\(/.test(osBlock));

/* Struktur one-screen + penghapusan §5 ------------------------------------- */
check('struktur: grid atas + 2 kolom + dest + kredit + startwrap',
  dedInput.includes('dedai-os-top') && dedInput.includes('dedai-os-col')
  && dedInput.includes('dedai-os-dest') && dedInput.includes('dedai-os-credit')
  && dedInput.includes('dedai-os-startwrap') && dedInput.includes('Simpan Hasil Ke'));
check('struktur: baris ekspektasi jujur + label Mode Analisis utuh',
  dedInput.includes('dedai-v23-expect') && dedInput.includes('Ekspektasi yang jujur:')
  && dedInput.includes('Mode Analisis'));
check('penghapusan §5: CreditBalance in-page + hint + meta + wrapper CTA hilang',
  !dedInput.includes('CreditBalance') && !dedInput.includes('dedai-v23-hint')
  && !dedInput.includes('dedai-v23-meta') && !dedInput.includes('dedai-v23-cta'));

console.log(`\ndedOneScreenBehavior: ${pass} lulus, ${fail} gagal`);
if (fail > 0) process.exit(1);

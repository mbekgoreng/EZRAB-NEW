/**
 * Pola App Shell DED + AI Document (mockup ter-ACC owner 2026-11-10) —
 * penjaga kontrak komposisi:
 *
 *  - DED Estimate AI + AI Document TIDAK lagi memakai FeatureFullscreenShell
 *    (cangkang fixed inset-0 penutup sidebar); keduanya dirender sebagai
 *    halaman biasa di dalam WorkspaceView lewat FeaturePageShell in-flow.
 *  - FeaturePageShell: bukan fixed, menyediakan konteks footer yang SAMA
 *    (FsFooterContext) agar bar aksi hasil DED (FsFooterPortal) tetap bekerja,
 *    dan TIDAK membawa tombol Kembali/tutup (navigasi lewat sidebar).
 *  - WorkspaceView mengunci scroll halaman hanya untuk menu ded-ai dan
 *    dokumen-ai; <main> kedua menu menjadi kolom flex setinggi sisa viewport.
 *  - Keadaan awal DED (DedAiInputView): kotak upload besar + SATU panel
 *    .dedai-settings (Simpan Hasil Ke, Jenis Proyek, Preferensi Output,
 *    Kompleksitas & Estimasi Kredit) dengan tombol Mulai Analisis menempel
 *    di kaki panel (.dedai-settings-foot). Pemilih mode kini seksi "Mode
 *    Analisis" (PERSIS DUA kartu) di kolom tengah dan Kebijakan Harga
 *    diturunkan dari kartu mode (program Dual Mode W2 G-UI-1, 2026-11-13;
 *    label "Mode AI" lama menamai baris kedalaman FAST/DETAIL, kini
 *    "Kedalaman"). Tarif kompleksitas tetap dari
 *    ai-credits/config (tariffFor) — tidak di-hardcode ulang.
 *  - Keadaan awal AI Document (DocLibrary): dropzone besar + panel
 *    .docai-settings (Mode Analisis Pertama dari getTabs DocAnalyzer, Jenis
 *    Dokumen, Bahasa, Sesudah Analisis, ringkasan dokumen terpilih) dengan
 *    tombol Analisis Dokumen menempel di kaki panel. Mode awal diteruskan
 *    ke DocAnalyzer sebagai initialTab.
 *  - FeatureFullscreenShell TIDAK dihapus pada perubahan ini: file dan
 *    ekspornya tetap ada (nasib akhirnya dicatat di laporan penerapan).
 *
 * Run (repo): npx --yes tsx src/test/dedDocPageShell.test.ts
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const read = (rel: string): string => readFileSync(join(repo, rel), 'utf8');
const has = (rel: string): boolean => existsSync(join(repo, rel));

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean): void => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ GAGAL: ${name}`); }
};

/* --- 1. Shell halaman baru -------------------------------------------------- */
check('FeaturePageShell ada', has('src/components/feature-shell/FeaturePageShell.tsx'));
check('CSS FeaturePageShell ada', has('src/components/feature-shell/feature-page-shell.css'));
const pageShell = read('src/components/feature-shell/FeaturePageShell.tsx');
check('FeaturePageShell in-flow (bukan fixed inset-0)', !pageShell.includes('position: fixed') && !pageShell.includes("position:'fixed'") && pageShell.includes('fp-shell'));
check('FeaturePageShell menyediakan FsFooterContext bersama', pageShell.includes('FsFooterContext.Provider'));
check('FeaturePageShell tanpa tombol Kembali/tutup (navigasi sidebar)', !pageShell.includes('onBack'));
const fpCss = read('src/components/feature-shell/feature-page-shell.css');
check('CSS shell memakai kelas khas fp- (tidak menabrak kelas fitur)', fpCss.includes('.fp-head') && fpCss.includes('.fp-content'));
check('bar aksi footer di dalam shell (hasil DED tetap menempel)', fpCss.includes('.fp-actionbar .fs-actions'));
check('shell halaman punya aturan HP <=700px', fpCss.includes('@media (max-width: 700px)'));
const fsShell = read('src/components/feature-shell/FeatureFullscreenShell.tsx');
check('FsFooterContext diekspor dari shell lama (dipakai bersama)', fsShell.includes('export const FsFooterContext'));
check('FeatureFullscreenShell tetap ada (tidak dihapus)', has('src/components/feature-shell/FeatureFullscreenShell.tsx') && fsShell.includes('export const FeatureFullscreenShell'));

/* --- 2. DED Estimate AI ------------------------------------------------------ */
const dedView = read('src/ai-tools/ded-ai-estimate/view.tsx');
check('DED view memakai FeaturePageShell', dedView.includes('<FeaturePageShell'));
check('DED view TIDAK memakai FeatureFullscreenShell', !dedView.includes('<FeatureFullscreenShell'));
check('DED view meneruskan stepper Input/Progress/Hasil ke shell', dedView.includes('steps={shellSteps}') && dedView.includes("t('ai.ded.input.step_1')"));
const dedInput = read('src/ai-tools/ded-ai-estimate/DedAiInputView.tsx');
check('DED input: tata letak upload + panel (dedai-input-layout)', dedInput.includes('dedai-input-layout'));
check('DED input: dropzone besar tetap ada', dedInput.includes('dedai-drop'));
check('DED input: SATU panel Pengaturan (dedai-settings)', dedInput.includes('dedai-settings') && dedInput.includes('Pengaturan'));
check('DED input: seksi Kebijakan Harga', dedInput.includes('Kebijakan Harga'));
check('DED input: seksi Simpan Hasil Ke', dedInput.includes('Simpan Hasil Ke'));
check('DED input: seksi Jenis Proyek (7 chip dari PROJECT_TYPE_OPTIONS)', dedInput.includes('PROJECT_TYPE_OPTIONS'));
// PERBAIKAN E (2026-11-14): pin lama `dedInput.includes('Mode AI')`
// kedaluwarsa — label "Mode AI" (HEAD:371) menamai baris kedalaman
// FAST/DETAIL, yang program Dual Mode (W2 G-UI-1) beri label akurat
// "Kedalaman"; pemilih mode kini seksi "Mode Analisis" dengan PERSIS DUA
// kartu (DED_MODE_CARDS, dirender sebagai radiogroup .dedai-modecards).
// Pin baru memeriksa pemilih mode yang sebenarnya — lebih kuat
// (3 syarat: label + sumber kartu + wadah render, bukan 1 substring).
check('DED input: seksi Mode Analisis (dua kartu mode)',
  dedInput.includes('Mode Analisis') && dedInput.includes('DED_MODE_CARDS') && dedInput.includes('dedai-modecards'));
check('DED input: seksi Kompleksitas & Estimasi Kredit', dedInput.includes('Kompleksitas & Estimasi Kredit'));
check('DED input: tarif dari ai-credits/config (tariffFor, tanpa hardcode ulang)', dedInput.includes('tariffFor'));
check('DED input: CTA menempel di kaki panel (dedai-settings-foot)', dedInput.includes('dedai-settings-foot') && dedInput.includes("t('ai.ded.input.cta')"));
check('DED input: CTA tidak lagi lewat FsFooterPortal (pindah ke panel)', !dedInput.includes('FsFooterPortal'));
const dedResult = read('src/ai-tools/ded-ai-estimate/DedAiResultView.tsx');
check('DED hasil: footer aksi tetap lewat FsFooterPortal (konteks bersama)', dedResult.includes('FsFooterPortal'));
const dedCss = read('src/ai-tools/ded-ai-estimate/dedAi.css');
check('DED CSS: grid upload + panel 348px', dedCss.includes('.dedai-input-layout') && dedCss.includes('348px'));
check('DED CSS: keadaan input mengunci scroll akar (.dedai.dedai-input)', dedCss.includes('.fp-shell .dedai.dedai-input'));
check('DED CSS: bertumpuk rapi <=1100px', dedCss.includes('@media (max-width: 1100px)'));

/* --- 3. AI Document ---------------------------------------------------------- */
const docView = read('src/ai-tools/document-ai/view.tsx');
check('DocAI view memakai FeaturePageShell', docView.includes('<FeaturePageShell'));
check('DocAI view TIDAK memakai FeatureFullscreenShell', !docView.includes('<FeatureFullscreenShell'));
check('DocAI view: chip tab aktif di header shell (pengganti stepper)', docView.includes('docTabChip'));
check('DocAI view meneruskan mode awal ke DocAnalyzer (initialTab)', docView.includes('initialTab={analyzerInitialTab}'));
check('DocAI view meneruskan pilihan panel ke DocLibrary', docView.includes('onInitialModeChange={setAnalyzerInitialTab}') && docView.includes('onContinueToDed'));
const docLib = read('src/ai-tools/document-ai/components/DocLibrary.tsx');
check('DocLibrary: tata letak upload + panel (docai-lib-layout)', docLib.includes('docai-lib-layout'));
check('DocLibrary: dropzone besar drag & drop', docLib.includes('docai-drop') && docLib.includes('onDrop'));
check('DocLibrary: SATU panel Pengaturan Dokumen (docai-settings)', docLib.includes('docai-settings') && docLib.includes('Pengaturan Dokumen'));
check('DocLibrary: mode analisis dari getTabs DocAnalyzer (bukan daftar baru)', docLib.includes('getTabs(t)'));
check('DocLibrary: seksi Jenis Dokumen terikat filter yang sama (kindFilter)', docLib.includes('setKindFilter'));
check('DocLibrary: seksi Bahasa memakai i18n (setLang)', docLib.includes('setLang'));
check('DocLibrary: seksi Sesudah Analisis (hasil/ded)', docLib.includes("afterAnalysis === 'ded'"));
check('DocLibrary: tombol Analisis Dokumen menempel di kaki panel', docLib.includes('docai-settings-foot') && docLib.includes('Analisis Dokumen'));
check('DocLibrary: aksi baris dipertahankan (Analisis/Unduh/Hapus)', docLib.includes('handleDownload') && docLib.includes('onRemoveDoc') && docLib.includes('onAnalyze(d)'));
const docAna = read('src/ai-tools/document-ai/components/DocAnalyzer.tsx');
check('DocAnalyzer mengekspor AnaTab + getTabs', docAna.includes('export type AnaTab') && docAna.includes('export const getTabs'));
check('DocAnalyzer menerima initialTab sebagai tab awal', docAna.includes('initialTab ??'));
const docCss = read('src/ai-tools/document-ai/document-ai.css');
check('DocAI CSS: grid upload + panel 348px', docCss.includes('.docai-lib-layout') && docCss.includes('348px'));
check('DocAI CSS: baris dokumen terpilih (docai-row-selected)', docCss.includes('.docai-row-selected'));
check('DocAI CSS: bertumpuk rapi <=1100px', docCss.includes('@media (max-width: 1100px)'));

/* --- 4. WorkspaceView: kunci scroll halaman ---------------------------------- */
const ws = read('src/components/dashboard/WorkspaceView.tsx');
check('WorkspaceView: pf-main overflow hidden hanya untuk ded-ai/dokumen-ai', ws.includes("(activeMenu === 'ded-ai' || activeMenu === 'dokumen-ai') ? 'hidden' : 'auto'"));
check('WorkspaceView: main ded-ai kolom flex setinggi sisa viewport', ws.includes("activeMenu === 'ded-ai'") && ws.includes("flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column'"));
check('WorkspaceView: main dokumen-ai kolom flex setinggi sisa viewport', ws.includes("activeMenu === 'dokumen-ai'") && ws.includes('<DokumenAiView'));

console.log(`\ndedDocPageShell: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);

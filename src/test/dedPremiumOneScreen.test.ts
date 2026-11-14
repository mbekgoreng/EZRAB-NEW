/**
 * Redesign Premium One-Screen DED + Tiga Usulan Baru (ter-ACC owner
 * 2026-11-10 21:21, mockup D6/D7) — penjaga kontrak:
 *
 *  1. resolvePageScope (parser) — FUNGSIONAL: rentang, tunggal, campuran,
 *     token tidak sah dilaporkan, di luar dokumen dibuang, spec kosong.
 *  2. Cakupan halaman terhubung NYATA: opsi pageScope ada di kedua
 *     service (standar + Full AI), diterapkan sebagai filter hasil parse
 *     di lapisan ekstraksi, dicatat terbuka di warnings/trace, dan view
 *     meresolusikannya per berkas (array kosong = gagal jujur).
 *  3. Preferensi Output terhubung NYATA: tipe + default di types,
 *     kontrol di InputView, diteruskan view → DedAiResultView, dan
 *     menggerbang tabel/volume/rincian provenans/laporan tak teresolusi
 *     + kolom & lembar ekspor Excel.
 *  4. Strip pratinjau dari keadaan NYATA: InputView menerima
 *     lastRunSummary dari view (dihitung dari output analisis terakhir),
 *     sel dokumen dari probe berkas (probeDedPdf), nilai "—" sebelum ada.
 *  5. Redesign: palet spec di dedAi.css terlingkup .dedai-input, CTA
 *     berlabel "Mulai Analisis DED" (kamus id), kompleksitas hanya aktif
 *     pada mode DETAIL, baris berkas punya aksi ganti + lencana teks.
 *
 * Batas jujur: pemeriksaan UI bersifat statis (kontrak teks/CSS) kecuali
 * resolvePageScope yang dijalankan sungguhan. Bukti visual di dalam
 * workspace tidak dapat diambil dari sandbox (PasscodeGate fail-closed).
 *
 * Run (repo): npx --yes tsx src/test/dedPremiumOneScreen.test.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { resolvePageScope } from '../ai-tools/ded-ai-estimate/parser';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const read = (rel: string): string => readFileSync(join(repo, rel), 'utf8');

const types = read('src/ai-tools/ded-ai-estimate/types.ts');
const service = read('src/ai-tools/ded-ai-estimate/service.ts');
const fullTypes = read('src/ai-tools/ded-full-ai/types.ts');
const fullService = read('src/ai-tools/ded-full-ai/service.ts');
const parserSrc = read('src/ai-tools/ded-ai-estimate/parser.ts');
const input = read('src/ai-tools/ded-ai-estimate/DedAiInputView.tsx');
// PERBAIKAN E (2026-11-14): sumber kartu mode — catatan keterbukaan harga
// (dulu inline di InputView, seksi Kebijakan Harga) kini hidup di sini
// sebagai DED_MODE_CARDS[].note (W2 G-UI-1).
const modeCards = read('src/ai-tools/ded-ai-estimate/dedModeUi.ts');
const view = read('src/ai-tools/ded-ai-estimate/view.tsx');
const result = read('src/ai-tools/ded-ai-estimate/DedAiResultView.tsx');
const dedCss = read('src/ai-tools/ded-ai-estimate/dedAi.css');
const dict = read('src/i18n/dictionaries.ts');

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean): void => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ GAGAL: ${name}`); }
};
const eq = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/* 1 — resolvePageScope fungsional ---------------------------------------- */
check('rentang + tunggal + campuran terurut unik',
  eq(resolvePageScope('1-5, 8, 12, 3', 32).pages, [1, 2, 3, 4, 5, 8, 12]));
check('token tidak sah dilaporkan, bukan dibuang diam-diam',
  eq(resolvePageScope('1, abc, 2-', 10).invalid, ['abc', '2-']));
check('halaman di luar dokumen dibuang',
  eq(resolvePageScope('30-40', 32).pages, [30, 31, 32]));
check('rentang mulai di luar dokumen = invalid',
  eq(resolvePageScope('40-50', 32).invalid, ['40-50']));
check('spec kosong menghasilkan daftar kosong',
  eq(resolvePageScope('  ', 10).pages, []));
check('rentang terbalik invalid', eq(resolvePageScope('9-4', 20).invalid, ['9-4']));

/* 2 — Cakupan halaman terhubung nyata ------------------------------------- */
check('opsi pageScope di DedAiServiceOptions', types.includes('pageScope?: number[]'));
check('service standar memfilter hasil parse menurut pageScope',
  service.includes('options.pageScope') && service.includes('parsed.pages = scopedPages'));
check('service standar mencatat pembatasan secara terbuka',
  service.includes('Cakupan halaman dibatasi pilihan pengguna'));
check('pageCount keluaran tetap total dokumen (bukan halaman terpilih)',
  service.includes('pageCount: documentTotalPages') && service.includes('totalPages: documentTotalPages'));
check('opsi pageScope di FullAiServiceOptions', fullTypes.includes('pageScope?: number[]'));
check('service Full AI memfilter halaman + mencatat peringatan',
  fullService.includes('options.pageScope') && fullService.includes('Cakupan halaman dibatasi pilihan pengguna'));
check('view meresolusi cakupan per berkas', view.includes('resolveSessionPageScope'));
check('view meneruskan pageScope ke kedua service',
  view.includes('pageScope,') && view.includes('pageScope: fullAiScope'));
check('view menggagalkan berkas tanpa halaman terpilih secara jujur',
  view.includes('tidak memiliki halaman dalam rentang terpilih'));
check('probe berkas tersedia di parser', parserSrc.includes('export async function probeDedPdf'));

/* 3 — Preferensi Output terhubung nyata ------------------------------------ */
check('tipe DedOutputPrefs + default ter-ACC di types',
  types.includes('export interface DedOutputPrefs') && types.includes('DEFAULT_DED_OUTPUT_PREFS'));
check('kontrol Preferensi Output di InputView', input.includes('Preferensi Output') && input.includes('outputPrefs'));
check('sesi membawa outputPrefs ke view', input.includes('outputPrefs,') || input.includes('outputPrefs\n'));
check('view meneruskan outputPrefs ke DedAiResultView', view.includes('outputPrefs={session.outputPrefs'));
check('hasil menggerbang Detail RAB', result.includes('prefs.detailRab'));
check('hasil menggerbang volume hero', result.includes('prefs.volume && volumeByUnit.length > 0'));
check('hasil menggerbang rincian provenans', result.includes('prefs.priceAnalysis'));
check('laporan item tak teresolusi ada & digerbang', result.includes('Laporan Item Tak Teresolusi') && result.includes('prefs.unresolvedReport'));
check('ekspor Excel mematuhi preferensi (lembar tak teresolusi)',
  result.includes("'Item Tak Teresolusi'") && result.includes('Ringkasan'));

/* 4 — Strip pratinjau keadaan nyata ------------------------------------------ */
check('InputView menerima lastRunSummary', input.includes('lastRunSummary'));
check('view menghitung lastRunSummary dari output nyata',
  view.includes('const lastRunSummary') && view.includes('pricesNeedVerify'));
check('view meneruskan lastRunSummary ke InputView', view.includes('lastRunSummary={lastRunSummary}'));
check('strip pratinjau dirender di InputView', input.includes('dedai-preview-grid'));
check('sel dokumen dari probe berkas nyata', input.includes('probeDedPdf') && input.includes('halaman · '));

/* 5 — Redesign premium -------------------------------------------------------- */
check('palet spec terlingkup .dedai-input',
  dedCss.includes('--dd-navy: #142B4A') && dedCss.includes('--dd-blue: #2563EB') && dedCss.includes('--dd-border: #E5EAF2'));
check('CTA disabled khas spec (biru pudar #C7D6F5)', dedCss.includes('#C7D6F5'));
check('strip pratinjau bergaya kartu di CSS', dedCss.includes('.dedai-preview .pv'));
check('label CTA kamus id = "Mulai Analisis DED"', dict.includes("cta: 'Mulai Analisis DED'"));
check('CTA memakai kunci kamus yang sama', input.includes("t('ai.ded.input.cta')"));
check('kompleksitas hanya aktif pada DETAIL',
  input.includes("disabled={mode !== 'DETAIL' || !dedAllowed}"));
check('cakupan: segmen Semua halaman / Halaman dipilih',
  input.includes('Semua halaman') && input.includes('Halaman dipilih'));
check('baris berkas: halaman nyata + lencana teks terbaca',
  input.includes('halaman · ') && input.includes('Teks terbaca · siap'));
check('baris berkas: aksi ganti berkas ada', input.includes('startReplace') && input.includes('Ganti berkas'));
check('catatan peninjauan di bawah CTA (spec)',
  input.includes('Estimasi dapat ditinjau dan divalidasi sebelum disimpan ke proyek.'));
// PERBAIKAN E (2026-11-14): pin lama memeriksa string di DedAiInputView —
// kedaluwarsa LOKASI. Program Dual Mode (W2 G-UI-1) menghapus seksi
// Kebijakan Harga dan memindahkan catatan keterbukaannya ke kartu mode
// masing-masing (dedModeUi.ts: DED_MODE_CARDS[].note); kartu Full AI
// membawa disclaimer utuh ("bukan harga resmi AHSP … pengadaan, tender,
// atau kontrak") dan InputView merendernya ({card.note}). Pin baru
// memeriksa teks DI SUMBERNYA + rendernya di InputView — lebih kuat
// (teks 2 frasa + render 2 penanda, bukan 1 substring di 1 berkas).
// Sengaja TIDAK mengembalikan disclaimer mentah ke panel: di EZRAB AI
// MODE harga mengacu database AHSP, sehingga disclaimer blanket di panel
// salah faktual untuk mode itu; penempatan per-kartu adalah pengungkapan
// yang benar per mode. Dijaga juga oleh w2DedModeUi cek 1i.
check('disclaimer harga AI bukan AHSP tetap utuh di kartu Full AI (dirender InputView)',
  modeCards.includes('bukan harga resmi AHSP') && modeCards.includes('pengadaan, tender, atau kontrak')
  && input.includes('dedai-modecard-note') && input.includes('{card.note}'));

console.log(`\ndedPremiumOneScreen: ${pass} lulus, ${fail} gagal`);
if (fail > 0) process.exit(1);

/**
 * W4 — Wave 4 app UX (EZRAB Complete Product Execution).
 * Run: npx tsx src/test/w4AppUxWave4.test.ts
 *
 * Verifikasi (bukan implementasi ulang) + pin perbaikan token W4:
 *  1. Prompt rotate landscape Game Space (perintah owner 2026-11-19):
 *     19 game landscape-native terdeteksi, prompt hanya muncul bila
 *     game landscape + HP portrait + perangkat ringkas + pointer kasar,
 *     dan GameStage merender RotatePrompt (pil mengambang, bisa ditutup).
 *  2. "Lengkapi Data": wizard paket dokumen menyebut sumber yang kurang
 *     per tombol + mengantar ke tab tujuannya; induk meneruskan navigasi;
 *     DocumentWorkspace mencantumkan field yang kurang lalu mengantar
 *     ke tab 'data' tempat field itu diisi.
 *  3. Drift token: PriceManagementPanel + PriceSourceBadge memakai token
 *     --ez-* (bukan abu-abu Tailwind hardcoded) pada permukaan/teks yang
 *     mewarisi latar tema. Badge status semantik (latar berwarna + teks
 *     putih, self-contained) sengaja TIDAK diubah.
 *  4. 390px (pemeriksaan kode): shell fitur + game space + perbaikan
 *     mobile punya blok breakpoint sempit; prompt rotate tidak meluber;
 *     komponen DocAI tanpa lebar minimum kaku.
 */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isLandscapeGame, shouldShowRotatePrompt, specForGame, STAGE_SPECS } from '../game-space/stage';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel: string): string => readFileSync(join(repo, rel), 'utf8');

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ GAGAL: ${name}`);
  }
}

// ---------- 1. Prompt rotate Game Space ----------
const landscapeIds = Object.keys(STAGE_SPECS).filter((id) => isLandscapeGame(id));
check('19 game landscape-native terdeteksi dari STAGE_SPECS', landscapeIds.length === 19);
check(
  'game konstruksi landscape: 7 (bongkar, build, head-soccer, ketapel, lari, selamatkan, tebas)',
  ['bongkar-rumah', 'build-challenge', 'head-soccer-mandor', 'ketapel-konstruksi', 'lari-proyek', 'selamatkan-mandor', 'tebas-material'].every(
    (id) => isLandscapeGame(id),
  ),
);
check(
  'game arcade landscape: 12',
  landscapeIds.filter((id) => id.startsWith('arcade-')).length === 12,
);
check('game portrait/square bukan landscape', !isLandscapeGame('flappy-mandor') && !isLandscapeGame('arcade-chess') && !isLandscapeGame('sudoku-tukang'));
check(
  'prompt muncul: game landscape + HP portrait 390×700 + pointer kasar',
  shouldShowRotatePrompt(specForGame('lari-proyek'), 390, 700, true),
);
check(
  'prompt hilang: HP sudah landscape',
  !shouldShowRotatePrompt(specForGame('lari-proyek'), 700, 390, true),
);
check(
  'prompt hilang: desktop (pointer halus)',
  !shouldShowRotatePrompt(specForGame('lari-proyek'), 390, 700, false),
);
check(
  'prompt hilang: tablet (sisi pendek ≥ 520)',
  !shouldShowRotatePrompt(specForGame('lari-proyek'), 768, 1024, true),
);
check(
  'prompt hilang: game portrait di HP portrait',
  !shouldShowRotatePrompt(specForGame('flappy-mandor'), 390, 700, true),
);

const overlay = read('src/game-space/GameSpaceOverlay.tsx');
const gsCss = read('src/game-space/game-space.css');
check('GameStage merender RotatePrompt bila showRotatePrompt', overlay.includes('{showRotatePrompt && <RotatePrompt'));
check('semua game lewat satu GameStage (specForGame per game)', overlay.includes('<GameStage gameId={activeGame.id} spec={specForGame(activeGame.id)}>'));
check('prompt sopan + menyebut landscape', overlay.includes('Putar HP-mu ke landscape'));
check('prompt bisa ditutup (tombol + state per game)', overlay.includes('rotateDismissed') && overlay.includes('aria-label="Tutup pemberitahuan putar HP"'));
check('prompt non-blocking: pil mengambang absolute', gsCss.includes('.gs-rotate-prompt {') && gsCss.includes('position: absolute'));
check('prompt tidak meluber di HP sempit', gsCss.includes('max-width: calc(100% - 24px)'));
check('prompt hormat prefers-reduced-motion', gsCss.includes('.gs-rotate-prompt { animation: none; }'));

// ---------- 2. "Lengkapi Data" ----------
const wizard = read('src/components/documents/DocumentPackageWizardModal.tsx');
const tender = read('src/components/document/TenderDocumentsView.tsx');
const workspace = read('src/components/document/DocumentWorkspace.tsx');
check(
  'wizard: tombol per sumber menyebut data + tab tujuan (bukan satu tombol umum)',
  wizard.includes("label: 'RAB & Harga', tab: 'rab-estimasi'") &&
    wizard.includes("label: 'Jadwal & Schedule', tab: 'jadwal'"),
);
check(
  'wizard: tidak ada lagi tombol umum "Lengkapi Data Sekarang" yang selalu ke RAB (frasa hanya tersisa di komentar audit F-DP-03)',
  !wizard
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
    .includes('Lengkapi Data Sekarang'),
);
check('induk meneruskan navigasi tab wizard ke luar (bukan menelan)', tender.includes('onNavigateToTab?.(tab)'));
check(
  'workspace: modal mencantumkan jumlah + daftar field yang kurang',
  workspace.includes('data perlu dilengkapi:') && workspace.includes('validation.errors.map'),
);
check("workspace: tombol Lengkapi Data mengantar ke tab 'data' (form Data Dokumen)", workspace.includes("setWorkspaceTab('data')"));
const validation = read('src/document-engine/validationEngine.ts');
check(
  'pesan validasi menyebut nama field ("{label} belum diisi")',
  validation.includes("errors.push(`${field.label} belum diisi`)"),
);

// ---------- 3. Drift token (perbaikan W4) ----------
const panel = read('src/components/pricing/PriceManagementPanel.tsx');
const badge = read('src/components/pricing/PriceSourceBadge.tsx');
check('panel: tanpa latar #fff hardcoded', !panel.includes("background: '#fff'"));
check('panel: tanpa border abu Tailwind (#e5e7eb / #d1d5db)', !panel.includes('#e5e7eb') && !panel.includes('#d1d5db'));
check(
  'panel: teks sekunder memakai token (tanpa #6b7280 di luar STATUS_COLORS)',
  panel.replace(/const STATUS_COLORS[\s\S]*?};/, '').includes('var(--ez-color-text-secondary)') &&
    !panel.replace(/const STATUS_COLORS[\s\S]*?};/, '').includes('#6b7280'),
);
check(
  'panel: teks redup memakai token (tanpa #9ca3af di luar STATUS_COLORS)',
  panel.replace(/const STATUS_COLORS[\s\S]*?};/, '').includes('var(--ez-color-text-muted)') &&
    !panel.replace(/const STATUS_COLORS[\s\S]*?};/, '').includes('#9ca3af'),
);
check(
  'panel: peringatan periode memakai token amber',
  panel.includes('var(--ez-hue-amber-text)') &&
    !panel.replace(/const STATUS_COLORS[\s\S]*?};/, '').includes('#d97706'),
);
check(
  'panel: kartu + tombol memakai token surface/border',
  panel.includes("background: 'var(--ez-color-surface)'") &&
    panel.includes("border: '1px solid var(--ez-color-border-line)'") &&
    panel.includes('var(--ez-color-border-strong)'),
);
check(
  'panel: badge status semantik TIDAK diubah (self-contained, teks putih)',
  panel.includes("DRAFT: '#6b7280'") && panel.includes("APPROVED: '#059669'"),
);
check(
  'badge provenans: label tabel memakai token (tanpa #6b7280)',
  !badge.includes('#6b7280') && badge.includes('var(--ez-color-text-secondary)'),
);

// ---------- 4. 390px (pemeriksaan kode) ----------
const fpCss = read('src/components/feature-shell/feature-page-shell.css');
const mobileFixes = read('src/styles/workspace-mobile-fixes.css');
check('shell fitur punya blok HP ≤700px (header ramping, ctx disembunyikan)', fpCss.includes('@media (max-width: 700px)') && fpCss.includes('.fp-ctx { display: none; }'));
check('shell fitur: stepper bisa digeser horizontal di HP', fpCss.includes('.fp-stepper { margin: 2px 12px 0; padding: 6px 10px; overflow-x: auto; }'));
check('game space punya blok layar kecil ≤480px', gsCss.includes('@media (max-width: 480px)'));
check('perbaikan mobile punya blok ≤400px', mobileFixes.includes('@media (max-width: 400px)'));
check('perbaikan mobile: body di-clip horizontal di HP', mobileFixes.includes('overflow-x: clip !important'));
const funnel = read('src/ai-tools/document-ai/components/DocFunnel.tsx');
const library = read('src/ai-tools/document-ai/components/DocLibrary.tsx');
check(
  'DocAI (Funnel/Library): tanpa lebar minimum kaku ≥300px',
  !/minWidth:\s*['"]?[34]\d\d/.test(funnel) && !/minWidth:\s*['"]?[34]\d\d/.test(library),
);
check('deteksi HP sempit konsisten: ambang 768px satu hook', read('src/components/mobile/useNarrowMobile.ts').includes('window.innerWidth < 768'));

console.log(`\nw4AppUxWave4: ${passed} lulus, ${failed} gagal`);
if (failed > 0) {
  console.log('Gagal:', failures.join(' | '));
  process.exitCode = 1;
}
void assert;

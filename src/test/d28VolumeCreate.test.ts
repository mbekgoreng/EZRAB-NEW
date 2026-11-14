/**
 * D-28 (Batch F, P2) — Volume Calculation membuat proyek diam-diam.
 *
 * Sebelum perbaikan, klik kartu "Volume Calculation" di CreateProjectModal
 * langsung memanggil onCreateProject dengan nama karangan
 * 'Proyek Volume QTO Baru' — tanpa persetujuan eksplisit, tanpa nama
 * dari pengguna, dan tanpa opsi memakai proyek aktif. Kini kartu itu
 * membuka langkah volume_calculation: pengguna memilih memakai proyek
 * aktif (tanpa membuat apa pun) atau membuat proyek baru dengan nama
 * yang ia ketik sendiri.
 *
 * Yang diuji:
 *  1. decideVolumeCalcProjectAction (pure, projectCreationIntent.ts):
 *     tanpa proyek aktif -> create; dengan proyek aktif -> ask; pilihan
 *     pengguna reuse -> reuse-active; pilihan new -> create.
 *  2. Struktural CreateProjectModal.tsx: kartu membuka langkah (bukan
 *     membuat), nama wajib, submit memakai nama pengguna +
 *     creationMethod 'volume_calculation', jalur pakai-ulang menavigasi
 *     tanpa membuat, batal tidak membuat apa pun, literal nama karangan
 *     lama hilang.
 *  3. Tepat EMPAT metode pembuatan proyek dipertahankan.
 *
 * Jalankan: npx tsx src/test/d28VolumeCreate.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
// tsx menjalankan berkas ini sebagai ESM: __dirname tidak tersedia.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { decideVolumeCalcProjectAction } from '../ai-tools/ezrab-ai/projectCreationIntent';

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
function ok(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}
function eq(actual: unknown, expected: unknown, msg: string): void {
  if (actual !== expected) {
    throw new Error(`${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function contains(haystack: string, needle: string, msg: string): void {
  ok(haystack.includes(needle), `${msg} — tidak ditemukan: ${JSON.stringify(needle)}`);
}
function notContains(haystack: string, needle: string, msg: string): void {
  ok(!haystack.includes(needle), `${msg} — seharusnya tidak ada: ${JSON.stringify(needle)}`);
}

const modalPath = path.join(__dirname, '../components/projects/CreateProjectModal.tsx');
const modalSrc = fs.readFileSync(modalPath, 'utf8');

console.log('D-28 — Volume Calculation tidak lagi membuat proyek diam-diam:');

// --- 1. Pure decision helper ---------------------------------------------
// Kontrak helper (mirip decideMagicAiProjectAction): mengembalikan aksi
// string polos. userChoice didahulukan — pemanggil menjamin pilihan
// 'reuse' hanya ditawarkan bila proyek aktif ada (blok tanya di modal
// mensyaratkan `volumeAskChoice && activeProject`; jalur pakai-ulang
// sendiri juga menjaga `if (!activeProject) return;`).
console.log('\n[1] decideVolumeCalcProjectAction:');
test('tanpa proyek aktif -> create (langsung ke form penamaan)', () => {
  eq(decideVolumeCalcProjectAction({ hasActiveProject: false }), 'create', 'action');
});
test('dengan proyek aktif, tanpa pilihan -> ask', () => {
  eq(decideVolumeCalcProjectAction({ hasActiveProject: true }), 'ask', 'action');
});
test('pilihan pengguna reuse -> reuse-active (tanpa pembuatan)', () => {
  eq(
    decideVolumeCalcProjectAction({ hasActiveProject: true, userChoice: 'reuse' }),
    'reuse-active',
    'action',
  );
});
test('pilihan pengguna new -> create', () => {
  eq(
    decideVolumeCalcProjectAction({ hasActiveProject: true, userChoice: 'new' }),
    'create',
    'action',
  );
});
test('userChoice didahulukan atas keadaan proyek', () => {
  eq(
    decideVolumeCalcProjectAction({ hasActiveProject: false, userChoice: 'new' }),
    'create',
    'new menang',
  );
});

// --- 2. Struktural modal --------------------------------------------------
console.log('\n[2] CreateProjectModal.tsx (struktural):');
test('handler kartu Volume membuka langkah, bukan membuat proyek', () => {
  contains(modalSrc, "setActiveStep('volume_calculation')", 'handler mengatur langkah volume_calculation');
  const handler = modalSrc.slice(
    modalSrc.indexOf('const handleVolumeCalcPathway'),
    modalSrc.indexOf('const proceedVolumeReuseActive'),
  );
  ok(handler.length > 0, 'handler handleVolumeCalcPathway ditemukan');
  notContains(handler, 'onCreateProject', 'handler kartu tidak boleh memanggil onCreateProject');
});
test('literal nama karangan lama hilang dari modal', () => {
  notContains(modalSrc, 'Proyek Volume QTO Baru', 'nama karangan lama');
});
test('langkah volume_calculation ada: blok tanya + form penamaan', () => {
  contains(modalSrc, "activeStep === 'volume_calculation'", 'cabang render langkah volume');
  contains(modalSrc, '{volumeAskChoice && activeProject && (', 'blok tanya hanya bila ada proyek aktif');
  contains(modalSrc, 'Hitung di proyek aktif', 'tombol pakai-ulang');
  contains(modalSrc, 'Buat proyek baru', 'tombol buat baru');
  contains(modalSrc, 'volumeName', 'state nama proyek volume');
  contains(modalSrc, 'Buat & Buka Kalkulator', 'tombol submit volume');
});
test('nama proyek wajib sebelum membuat', () => {
  contains(modalSrc, 'disabled={isSubmitting || !volumeName.trim()}', 'submit nonaktif bila nama kosong');
  contains(modalSrc, 'if (!volumeName.trim() || isSubmitting) return;', 'validasi nama kosong di submit');
  contains(modalSrc, 'required', 'input nama bertanda required');
});
test('submit membuat dengan nama pengguna + creationMethod volume_calculation', () => {
  const submit = modalSrc.slice(
    modalSrc.indexOf('const handleVolumeSubmit'),
    modalSrc.indexOf('const handleTemplatePathway'),
  );
  ok(submit.length > 0, 'handleVolumeSubmit ditemukan');
  contains(submit, 'name: volumeName.trim()', 'nama dari input pengguna');
  contains(submit, "creationMethod: 'volume_calculation'", 'metode pembuatan tercatat');
});
test('jalur pakai-ulang menavigasi ke kalkulator tanpa membuat proyek', () => {
  const reuse = modalSrc.slice(
    modalSrc.indexOf('const proceedVolumeReuseActive'),
    modalSrc.indexOf('const handleVolumeSubmit'),
  );
  ok(reuse.length > 0, 'proceedVolumeReuseActive ditemukan');
  contains(reuse, 'if (!activeProject) return;', 'guard tanpa proyek aktif');
  contains(reuse, "onNavigateToTab('qto-vc', activeProject.id)", 'navigasi ke qto-vc dengan id proyek aktif');
  notContains(reuse, 'onCreateProject', 'jalur pakai-ulang tidak membuat proyek');
});
test('batal/kembali dari langkah volume tidak membuat apa pun', () => {
  contains(modalSrc, "onClick={() => setActiveStep('select')}", 'tombol kembali ke pemilihan metode');
  const reset = modalSrc.slice(modalSrc.indexOf('const resetForm'), modalSrc.indexOf('const handleVolumeCalcPathway'));
  contains(reset, "setVolumeName('')", 'reset mengosongkan nama volume');
  contains(reset, 'setVolumeAskChoice(false)', 'reset menutup blok tanya (boolean)');
});

// --- 3. Tepat empat metode ------------------------------------------------
console.log('\n[3] Empat metode pembuatan proyek dipertahankan:');
test('KickoffMethod berisi tepat 4 metode + select', () => {
  contains(
    modalSrc,
    "export type KickoffMethod = 'select' | 'magic_ai' | 'manual' | 'volume_calculation' | 'template';",
    'tipe KickoffMethod tidak berubah',
  );
});
test('tepat 4 kartu metode dirender (satu per metode)', () => {
  contains(modalSrc, "onClick={() => setActiveStep('magic_ai')}", 'kartu Magic AI');
  contains(modalSrc, "onClick={() => setActiveStep('manual')}", 'kartu Manual RAB Builder');
  contains(modalSrc, 'onClick={handleVolumeCalcPathway}', 'kartu Volume Calculation');
  contains(modalSrc, 'onClick={handleTemplatePathway}', 'kartu Template RAB');
});

console.log(`\nHasil D-28: ${passes} lolos, ${failures} gagal`);
if (failures > 0) process.exit(1);
console.log('SEMUA TEST D-28 LOLOS');

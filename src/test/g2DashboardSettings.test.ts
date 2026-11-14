/**
 * Batch G2 — dashboard & settings (D-30, D-33/D-34 + NEW-07, D-76,
 * D-78, D-80, D-81, D-82, D-83).
 *
 * D-30 (P2): "Lihat Analisis" membuka Chat AI kosong — kini membawa
 *   prompt prefill berisi hitungan item tanpa harga resmi.
 * D-33/D-34 (P3): menu Tim/Keamanan membuka Pengaturan generik
 *   (redirect diam-diam ke Profil) — kini menu dinonaktifkan untuk
 *   role tanpa kapabilitas + tab menampilkan panel penjelasan di
 *   tempat. NEW-07: demo role 'qs' TIDAK diberi kapabilitas
 *   (keputusan: manajemen user di mode showcase lebih berisiko
 *   daripada tidak mengiklankan tabnya).
 * D-76 (P2): Settings mengklaim demo "Belum ada item RAB"
 *   (213 item) — kini membaca allRabItems + total kanonis.
 * D-78 (P3): "Jadwal & Kalender Proyek" hanya 2 field tanggal —
 *   copy fix OD-20(a): "Tanggal Proyek".
 * D-80 (P3): label hardcoded "6.164" vs 9.202 — kini live count.
 * D-81 (P3): combobox presisi disabled tanpa penjelasan.
 * D-82 (P3): fallback MENGARANG "Semua engine operasional" saat
 *   belum pernah diaudit — kini jujur.
 * D-83 (P2): formulir feedback menuntut sign-in dari user yang
 *   sudah masuk lewat gerbang kode akses — kini sesi gerbang
 *   diakui; dropdown TopBar menampilkan "Tamu" (bukan seed
 *   SUPER_ADMIN) untuk sesi gerbang (handoff G1 L4).
 *
 * Tes data dipakai bila memungkinkan (prompt, total kanonis,
 * hitungan material, kapabilitas role); sisanya source-level
 * (dinyatakan jujur). Total emas demo (Rp1.089.879.733) dikunci
 * suite cCrossSurface — dijalankan di gerbang integrasi.
 *
 * Jalankan: npx tsx src/test/g2DashboardSettings.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
// tsx menjalankan berkas ini sebagai ESM: __dirname tidak tersedia.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..');

import { unpricedAnalysisPrompt } from '../lib/dashboardInsight';
import { computeProjectInfoTotal } from '../services/projectInfoTotal';
import { MaterialDatabaseService } from '../domain/material/materialDatabaseService';
import { getRoleAccount } from '../auth/roleAccounts';

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
function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}
function assertEq(actual: unknown, expected: unknown, msg: string): void {
  if (actual !== expected) {
    throw new Error(`${msg} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}
function readSrc(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), 'utf8');
}
/** Hapus komentar baris dan blok (termasuk JSX) agar literal di
 *  dokumentasi tidak dikira string yang dirender. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}
function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

console.log('g2DashboardSettings (D-30, D-33/34, NEW-07, D-76, D-78, D-80, D-81, D-82, D-83):');

// --- D-30 ------------------------------------------------------------------
test('D-30: prompt analisis membawa hitungan item di keempat bahasa', () => {
  for (const lang of ['id', 'en', 'zh', 'ms']) {
    const p = unpricedAnalysisPrompt(17, lang);
    assert(p.includes('17'), `${lang}: prompt must carry the count`);
    assert(p.length > 40, `${lang}: prompt must be a real analysis request, not a stub`);
  }
  // Lintas proyek: prompt tidak menyebut satu proyek (hitungan
  // mencakup semua proyek) — tidak ada nama proyek yang dikarang.
  assert(!unpricedAnalysisPrompt(3, 'id').includes('Proyek Demo'), 'prompt must not name a project');
});
test('D-30: kedua dashboard meneruskan prompt ke onOpenMagicAi; Workspace meneruskan ke openEzrabAI', () => {
  for (const f of [
    'components/dashboard/EzrabAiDashboardView.tsx',
    'components/dashboard/EzrabAiDashboardViewClassic.tsx',
  ]) {
    const src = readSrc(f);
    assert(
      src.includes("onOpenMagicAi('chat', unpricedAnalysisPrompt(unpricedCount, lang))"),
      `${f}: button must pass the prefill prompt`,
    );
  }
  const ws = readSrc('components/dashboard/WorkspaceView.tsx');
  assert(
    ws.includes("openEzrabAI({ mode: 'chat', prompt, projectId: currentProjectId"),
    'WorkspaceView must forward prompt as prefill (initialPrompt, not autosend)',
  );
});

// --- D-33/D-34 + NEW-07 ----------------------------------------------------
test('NEW-07: demo role qs TIDAK punya manage-users/manage-security; team punya', () => {
  const qs = getRoleAccount('qs');
  assert(qs, 'qs role must exist');
  assert(!qs.capabilities.includes('manage-users'), 'qs must not manage users (showcase decision)');
  assert(!qs.capabilities.includes('manage-security'), 'qs must not manage security (showcase decision)');
  const team = getRoleAccount('team');
  assert(team, 'team role must exist');
  assert(team.capabilities.includes('manage-users'), 'team must manage users');
  assert(team.capabilities.includes('manage-security'), 'team must manage security');
});
test('D-33/D-34: TopBar menonaktifkan menu Tim/Keamanan tanpa kapabilitas + hint', () => {
  const src = readSrc('components/navigation/TopBar.tsx');
  assert(src.includes('canManageUsers'), 'canManageUsers missing');
  assert(src.includes('canManageSecurity'), 'canManageSecurity missing');
  assert(src.includes('disabledHint'), 'disabledHint missing');
  assert(src.includes("t('nav.butuh_peran_tim')"), 'hint key missing');
  assert(src.includes('aria-disabled'), 'disabled items must be aria-marked');
});
test('D-33/D-34: Settings TIDAK redirect diam-diam; tab terlarang tampil panel penjelasan', () => {
  const src = readSrc('components/settings/UnifiedSettingsView.tsx');
  assert(
    !src.includes('Jika tab aktif tidak diizinkan untuk role saat ini'),
    'the silent-redirect comment/effect must be gone',
  );
  assert(
    !src.includes('if (!isTabAllowed(activeTab)) {'),
    'the redirect effect body must be gone',
  );
  assert(src.includes('const restrictedTab = !isTabAllowed(activeTab)'), 'restrictedTab lookup missing');
  assert(src.includes('restrictedCapability'), 'restrictedCapability missing');
  assert(src.includes("{restrictedTab && ("), 'restricted panel render missing');
});

// --- D-76 ------------------------------------------------------------------
test('D-76: Settings membaca allRabItems (bukan sections[].items yang kosong)', () => {
  const src = readSrc('components/settings/UnifiedSettingsView.tsx');
  assert(src.includes('allRabItems'), 'allRabItems must be destructured from useProject');
  assert(
    src.includes("(allRabItems || []).filter("),
    'project items must be filtered from the flat allRabItems list',
  );
});
test('D-76: total kanonis — proyek kosong null (bukan Rp0); 2 item = jumlahnya', () => {
  assertEq(computeProjectInfoTotal([], null), null, 'empty project → null, not Rp0');
  const info = computeProjectInfoTotal([{ amount: 100000 }, { amount: 200000 }], null);
  assert(info, 'two priced items must produce a total');
  assertEq(info.total, 300000, 'canonical total with default config (0% O&P, tax off)');
});

// --- D-78 ------------------------------------------------------------------
test('D-78: copy jujur "Tanggal Proyek" (OD-20(a)); janji kalender hilang', () => {
  const src = readSrc('components/settings/UnifiedSettingsView.tsx');
  assert(src.includes("label: 'Tanggal Proyek'"), 'project nav label must be Tanggal Proyek');
  assert(!src.includes('Jadwal & Kalender Proyek'), 'calendar promise copy must be gone');
  assert(
    src.includes('Tanggal mulai pelaksanaan dan target serah terima proyek.'),
    'description must describe the two date fields honestly',
  );
});

// --- D-80 ------------------------------------------------------------------
test('D-80: hitungan material live = 9.202 (sumber sama dengan Resources)', () => {
  const count = MaterialDatabaseService.getInstance().getAllMaterials().length;
  assertEq(count, 9202, 'live material count');
});
test('D-80: Settings memakai liveMaterialCount, bukan hardcoded 6.164', () => {
  const src = stripComments(readSrc('components/settings/UnifiedSettingsView.tsx'));
  assert(src.includes('liveMaterialCount'), 'liveMaterialCount missing');
  assert(src.includes('getAllMaterials().length'), 'must read from the same service as Resources');
  assert(!src.includes('6.164'), 'hardcoded 6.164 must be gone');
});

// --- D-81 ------------------------------------------------------------------
test('D-81: combobox presisi disabled disertai penjelasan + arah kontrol proyek', () => {
  const src = readSrc('components/settings/UnifiedSettingsView.tsx');
  assert(
    src.includes('Presisi global dikunci di 2 desimal'),
    'disabled explanation missing',
  );
  assert(
    src.includes('ubah per proyek di tab DED'),
    'explanation must point to the per-project control',
  );
});

// --- D-82 ------------------------------------------------------------------
test('D-82: fallback audit jujur — "Belum pernah diaudit", tanpa klaim sukses', () => {
  const src = readSrc('components/settings/UnifiedSettingsView.tsx');
  assert(
    src.includes("'Belum pernah diaudit — jalankan Uji Koneksi untuk memeriksa engine.'"),
    'honest null-audit fallback missing',
  );
  assert(src.includes("'Belum diperiksa'"), 'null badge/metric must say Belum diperiksa');
  // Frasa fabrikasi lama hanya boleh muncul SEKALI — di dalam komentar
  // yang mendokumentasikan perbaikannya, bukan sebagai nilai tampil.
  assertEq(
    countOccurrences(src, 'Baru saja — Semua engine operasional.'),
    1,
    'fabricated success string must only remain in the documenting comment',
  );
});

// --- D-83 ------------------------------------------------------------------
test('D-83: feedback form mengakui sesi gerbang (gateSession: true) + label jujur', () => {
  const src = readSrc('components/settings/SuggestionComplaintBox.tsx');
  assert(src.includes('gateSession: true'), 'must pass gateSession: true');
  assert(src.includes('(sesi gerbang kode akses)'), 'reporter suffix must name the gate session');
  assert(
    !src.includes("navigateTo('/masuk')"),
    'dead-end /masuk navigation must be gone (email login is disabled)',
  );
});
test('D-83: TopBar menampilkan "Tamu" untuk sesi gerbang (bukan seed SUPER_ADMIN)', () => {
  const src = readSrc('components/navigation/TopBar.tsx');
  assert(src.includes('isGuestSession'), 'guest session detection missing');
  assert(src.includes("name: 'Tamu'"), 'guest display name missing');
  assert(src.includes('Sesi demo — gerbang kode akses'), 'guest email line missing');
  assert(src.includes('displayUser'), 'render sites must use displayUser');
});

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);

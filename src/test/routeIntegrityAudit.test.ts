/**
 * ROUTE INTEGRITY AUDIT — audit kesiapan deploy publik (area API & routes).
 *
 * Memastikan:
 *  1. /app/pekerjaan terdaftar (temuan audit 2026-10-13: route ini 404).
 *  2. /app/enterprise jujur not-found sampai EnterpriseEntryPage di-wire tim UI
 *     (sebelumnya status 'ok' tetapi diam-diam me-render dashboard).
 *  3. Semua route tutorial (paths.*) parse ke status 'ok'.
 *  4. Semua menu yang dikenal nav (routeForMenu) round-trip tanpa 404,
 *     kecuali 'enterprise' yang memang disengaja not-found.
 *  5. Menu WorkspaceView yang tidak punya route (rab-spreadsheet, dst)
 *     tidak boleh menghasilkan 404 bila diakses via URL yang valid.
 *
 * Jalankan: npx tsx src/test/routeIntegrityAudit.test.ts
 */

import { paths, parseWorkspaceRoute, routeForMenu } from '../routing/routes';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function parse(url: string) {
  const [p, q] = url.split('?');
  return parseWorkspaceRoute(p, q || '');
}

// ---------------------------------------------------------------- 1. /app/pekerjaan
console.log('\n[1] /app/pekerjaan (temuan audit 2026-10-13):');
{
  const r = parse(paths.app() + '/pekerjaan');
  check('terdaftar & status ok', r.status === 'ok', JSON.stringify(r));
  check('menu = daftar-pekerjaan', r.menu === 'daftar-pekerjaan', r.menu);
}

// ---------------------------------------------------------------- 2. /app/enterprise
console.log('\n[2] /app/enterprise (soft-404 -> honest 404):');
{
  const r = parse(paths.enterprise());
  check('status not-found (jujur, bukan dashboard diam-diam)', r.status === 'not-found', JSON.stringify(r));
}

// ---------------------------------------------------------------- 3. Route tutorial
console.log('\n[3] Route tutorial (tutorialRegistry memakai paths.*):');
{
  const routes = [
    paths.ahsp(), paths.dashboard(), paths.dedAiEstimate(), paths.dokumenAi(),
    paths.estimate(), paths.magicAi(), paths.management(), paths.projects(),
    paths.qto(), paths.reports(), paths.settings(), paths.volumeCalculation(),
    paths.magicAi('chat'), paths.magicAi('ded-rab'), paths.magicAi('dokumen-ai'),
    paths.settings('bantuan'), paths.finance('overview'),
    paths.materialHarga('labor'), paths.materialHarga('equipment'),
    paths.materialHarga('suppliers'), paths.materialHarga('project-price'),
    paths.tenderDocuments(), paths.subscription(), paths.templates(),
    paths.volumeCalculation(), paths.app(), paths.projects('draft'),
  ];
  let ok = 0;
  for (const u of routes) {
    const r = parse(u);
    if (r.status === 'ok') ok++;
    else console.log(`    ✗ ${u} -> ${JSON.stringify(r)}`);
  }
  check(`${ok}/${routes.length} route tutorial parse ok`, ok === routes.length);
}

// ---------------------------------------------------------------- 4. Menu round-trip
console.log('\n[4] routeForMenu -> parseWorkspaceRoute round-trip:');
{
  const menus = [
    'dashboard', 'proyek', 'rab-estimasi', 'ezrab-ai', 'ded-ai', 'dokumen-ai',
    'magic-ai', 'ai-assistant', 'volume-calculation', 'qto-vc', 'template-rab',
    'ahsp-2026', 'ahsp', 'analisa-ahsp', 'material-harga', 'database-material',
    'material', 'database-upah', 'upah', 'database-alat', 'alat', 'harga-proyek',
    'project-price', 'resource-library', 'suppliers', 'qto', 'qto-rekap',
    'manajemen-proyek', 'laporan', 'boq', 'rekapitulasi', 'dokumen-tender',
    'keuangan-proyek', 'keuangan', 'termin', 'invoice', 'pemasukan',
    'pengeluaran', 'cash-flow', 'subscription', 'pengaturan',
    'daftar-pekerjaan', 'pekerjaan', 'qto-daftar',
  ];
  let ok = 0;
  let total = 0;
  for (const m of menus) {
    for (const pid of [null, 'proj-123']) {
      total++;
      const url = routeForMenu(m, pid);
      const r = parse(url);
      if (r.status === 'ok') ok++;
      else console.log(`    ✗ menu=${m} pid=${pid} -> ${url} => ${JSON.stringify(r)}`);
    }
  }
  check(`${ok}/${total} menu round-trip tanpa 404`, ok === total);
}

// ---------------------------------------------------------------- 5. Route proyek tak dikenal
console.log('\n[5] Modul proyek tak dikenal -> not-found (bukan crash):');
{
  const r = parse('/app/projects/proj-123/modul-tidak-ada');
  check('status not-found', r.status === 'not-found', JSON.stringify(r));
  const r2 = parse('/app/rute-tidak-ada');
  check('route global tak dikenal -> not-found', r2.status === 'not-found', JSON.stringify(r2));
}

// ---------------------------------------------------------------- 6. Fidelity sub-menu RAB
// Temuan 2026-10-19: routeForMenu('rab-spreadsheet'|...) tidak punya case ->
// jatuh ke default (dashboard); sinkronisasi route lalu menimpa activeMenu
// sehingga klik "Spreadsheet" malah mendarat di dashboard. Test lama hanya
// memeriksa status ok (tidak 404) sehingga bug ini lolos. Sekarang menu hasil
// parse HARUS sama persis dengan menu asal, dengan/tanpa project.
console.log('\n[6] Fidelity round-trip sub-menu RAB (temuan 2026-10-19):');
{
  const menus = [
    'rab-spreadsheet', 'rab-rekapitulasi', 'rab-analisa-harga',
    'rab-kurva-s', 'rab-catatan', 'rab-pengaturan',
  ];
  let ok = 0;
  let total = 0;
  for (const m of menus) {
    for (const pid of [null, 'proj-123']) {
      total++;
      const url = routeForMenu(m, pid);
      const r = parse(url);
      const good = r.status === 'ok' && r.menu === m;
      if (!good) console.log(`    ✗ menu=${m} pid=${pid} -> ${url} => ${JSON.stringify(r)}`);
      else ok++;
    }
  }
  check(`${ok}/${total} sub-menu RAB round-trip persis`, ok === total);
  // URL tanpa tab tetap ke tab default (spreadsheet) seperti perilaku lama.
  const r0 = parse(paths.estimate());
  check("paths.estimate() tanpa tab -> 'rab-estimasi'", r0.menu === 'rab-estimasi', r0.menu);
}

console.log(`\nHasil: ${passed} lolos, ${failed} gagal`);
if (failed > 0) {
  console.log('GAGAL:', failures.join(', '));
  process.exit(1);
}
console.log('SEMUA TEST ROUTE INTEGRITY LOLOS');

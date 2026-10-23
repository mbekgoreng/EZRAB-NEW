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

// ---------------------------------------------------------------- 7. Fidelity matriks PENUH (audit routing 2026-10-23)
// Kelas bug 2026-10-19 meluas: bukan hanya sub-menu RAB — menu apa pun yang
// tidak punya case di routeForMenu jatuh ke dashboard (global) / dashboard
// proyek, lalu sinkronisasi route menimpa activeMenu. Bagian ini mengunci
// SELURUH menu yang dikenal (routeForMenu + parse + render WorkspaceView)
// x kedua scope: parse(routeForMenu(menu)) harus mengembalikan menu kanonis
// (alias dipetakan ke kanonisnya dan didokumentasikan di peta ini).
console.log('\n[7] Fidelity round-trip matriks penuh menu x scope (audit 2026-10-23):');
{
  const EXPECTED: Record<string, string> = {
    dashboard: 'dashboard', proyek: 'proyek',
    'rab-estimasi': 'rab-estimasi', 'rab-spreadsheet': 'rab-spreadsheet',
    'rab-rekapitulasi': 'rab-rekapitulasi', 'rab-analisa-harga': 'rab-analisa-harga',
    'rab-kurva-s': 'rab-kurva-s', 'rab-catatan': 'rab-catatan', 'rab-pengaturan': 'rab-pengaturan',
    'daftar-pekerjaan': 'daftar-pekerjaan', pekerjaan: 'daftar-pekerjaan', 'qto-daftar': 'daftar-pekerjaan',
    'ezrab-ai': 'ezrab-ai', 'desain-rab': 'desain-rab', 'ded-ai': 'ded-ai',
    'dokumen-ai': 'dokumen-ai', 'kredit-ai': 'kredit-ai',
    'magic-ai': 'magic-ai', 'ai-assistant': 'magic-ai', 'ded-rab': 'magic-ai',
    'volume-calculation': 'qto-vc', 'qto-vc': 'qto-vc', qto: 'qto', 'qto-rekap': 'qto',
    'template-rab': 'template-rab',
    'ahsp-2026': 'ahsp-2026', ahsp: 'ahsp-2026', 'analisa-ahsp': 'ahsp-2026',
    'material-harga': 'database-material', 'database-material': 'database-material',
    material: 'database-material', harga: 'database-material',
    'database-upah': 'database-upah', upah: 'database-upah',
    'database-alat': 'database-alat', alat: 'database-alat',
    'harga-proyek': 'harga-proyek', 'project-price': 'harga-proyek',
    'resource-library': 'suppliers', suppliers: 'suppliers',
    'manajemen-proyek': 'manajemen-proyek', jadwal: 'jadwal', 'kurva-s': 'kurva-s',
    laporan: 'laporan', boq: 'boq', rekapitulasi: 'rekapitulasi', export: 'laporan',
    'dokumen-tender': 'dokumen-tender',
    'keuangan-proyek': 'keuangan-proyek', keuangan: 'keuangan-proyek', termin: 'keuangan-proyek',
    invoice: 'keuangan-proyek', pemasukan: 'keuangan-proyek', pengeluaran: 'keuangan-proyek',
    'cash-flow': 'keuangan-proyek',
    subscription: 'subscription', 'blog-admin': 'blog-admin', pengaturan: 'pengaturan',
  };
  let ok = 0;
  let total = 0;
  for (const [menu, canonical] of Object.entries(EXPECTED)) {
    for (const pid of [null, 'proj-123']) {
      total++;
      const url = routeForMenu(menu, pid);
      const r = parse(url);
      const good = r.status === 'ok' && r.menu === canonical;
      if (!good) console.log(`    ✗ menu=${menu} pid=${pid} -> ${url} => ${JSON.stringify(r)} (harap ${canonical})`);
      else ok++;
    }
  }
  check(`${ok}/${total} matriks menu x scope round-trip ke menu kanonis`, ok === total);
  // mode ded-rab harus selamat dalam round-trip 'ded-rab'
  const rd = parse(routeForMenu('ded-rab', null));
  check("routeForMenu('ded-rab') mempertahankan mode=ded-rab", rd.mode === 'ded-rab', JSON.stringify(rd));
  const rdp = parse(routeForMenu('ded-rab', 'proj-123'));
  check("routeForMenu('ded-rab', proyek) mempertahankan mode=ded-rab", rdp.mode === 'ded-rab', JSON.stringify(rdp));
}

// ---------------------------------------------------------------- 8. Deep-link global baru
// /app/schedule, /app/curve-s, /app/reports/{boq,recap,rab,ahsp} sebelumnya
// not-found padahal varian proyeknya ada dan view globalnya dirender
// (ManajemenProyekView section / LaporanView tab).
console.log('\n[8] Deep-link global laporan & jadwal (audit 2026-10-23):');
{
  const cases: Array<[string, string]> = [
    ['/app/schedule', 'jadwal'],
    ['/app/curve-s', 'kurva-s'],
    ['/app/reports/boq', 'boq'],
    ['/app/reports/recap', 'rekapitulasi'],
    ['/app/reports/rab', 'laporan'],
    ['/app/reports/ahsp', 'laporan'],
  ];
  let ok = 0;
  for (const [u, menu] of cases) {
    const r = parse(u);
    if (r.status === 'ok' && r.menu === menu && r.scope === 'global') ok++;
    else console.log(`    ✗ ${u} => ${JSON.stringify(r)} (harap ${menu})`);
  }
  check(`${ok}/${cases.length} deep-link global parse ke menu yang benar`, ok === cases.length);
}

console.log(`\nHasil: ${passed} lolos, ${failed} gagal`);
if (failed > 0) {
  console.log('GAGAL:', failures.join(', '));
  process.exit(1);
}
console.log('SEMUA TEST ROUTE INTEGRITY LOLOS');

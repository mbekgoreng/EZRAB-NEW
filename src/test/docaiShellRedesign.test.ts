/**
 * DOCAI SHELL REDESIGN (Child 1 — SHELL, 2026-11-19) — penjaga kontrak
 * komposisi shell workspace (brief §3A–3B, §13 Phase 0 items 2–5, 13–14).
 *
 * Skrip asersi tsx polos (pola dedDocPageShell.test.ts / shellF6.test.ts):
 * pemeriksaan SUMBER (readFileSync), tanpa import vitest. Rendering React
 * tidak dimungkinkan di harness ini, jadi mount tunggal + tidak adanya
 * duplikasi dibuktikan lewat struktur sumber.
 *
 * Kontrak yang diuji:
 *  1. SATU instance sidebar: <Sidebar> tepat satu mount di WorkspaceView,
 *     <TopBar> tepat satu mount, <aside> dan <nav> masing-masing satu di
 *     Sidebar.tsx. (Diagnosis Phase 0: tuduhan duplikasi sidebar TIDAK
 *     terbukti di kode — tidak ada jalur duplikasi; tes ini mengunci
 *     struktur tunggal itu agar tidak regresi diam-diam.)
 *  2. TIDAK ADA render grup nav ganda: tiap label grup tepat sekali,
 *     mainNavItems[0] + slice(1) saling lepas, tiap peta submenu sekali.
 *  3. Dimensi baru: lebar desktop 196px, rel 72px, drawer mobile
 *     min(84vw,290px) tidak berubah, pill toggle mengikuti lebar baru
 *     (192px / 68px), baris menu ringkas 32px.
 *  4. TopBar 46px desktop, 48px HP-sempit dipertahankan, semua kontrol
 *     tetap ada (cari, tema, kurs, bahasa, notifikasi, bantuan, kredit,
 *     akun) — tanpa tombol membesar.
 *  5. Kartu billing + aksi keluar masing-masing dirender tepat sekali.
 *  6. Perilaku collapse dipertahankan: railMode, pill toggle, props
 *     sidebarCollapsed/onToggleCollapse, overflowY ded-ai/dokumen-ai.
 *  7. Jalur duplikasi lain TERTUTUP: Navbar.tsx tidak ter-mount di shell,
 *     CSS rel lawas pf-rail/pf-expand tidak dipakai file shell hidup,
 *     bottom nav HP terkunci di balik isNarrowMobile, drawer tidak bisa
 *     tampil bersamaan dengan sheet menu (backdrop z-9990 menutupinya).
 *  8. premium-frame.css: tidak ada calc min-height 64px dan tidak ada
 *     referensi dimensi lama (256px/54px) — perubahan dimensi tidak
 *     membutuhkan edit CSS shell.
 *
 * Jalankan: npx --yes tsx src/test/docaiShellRedesign.test.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const read = (rel: string): string => readFileSync(join(repo, rel), 'utf8');

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean): void => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ GAGAL: ${name}`); }
};
const count = (src: string, re: RegExp): number => (src.match(re) ?? []).length;

const sidebar = read('src/components/layout/Sidebar.tsx');
const topbar = read('src/components/navigation/TopBar.tsx');
const navbar = read('src/components/navigation/Navbar.tsx');
const ws = read('src/components/dashboard/WorkspaceView.tsx');
const pfCss = read('src/components/layout/premium-frame.css');

/* --- 1. Satu instance shell ------------------------------------------------ */
check('WorkspaceView: tepat SATU mount <Sidebar', count(ws, /<Sidebar/g) === 1);
check('WorkspaceView: tepat SATU mount <TopBar', count(ws, /<TopBar/g) === 1);
check('Sidebar: tepat SATU <aside>', count(sidebar, /<aside/g) === 1);
check('Sidebar: tepat SATU <nav>', count(sidebar, /<nav/g) === 1);
check('Sidebar: SATU cabang gaya isMobile ? drawer : desktop (bukan dua aside)',
  sidebar.includes('isMobile') && sidebar.includes("width: 'min(84vw, 290px)',"));
check('Sidebar: diekspor sekali sebagai komponen bernama', sidebar.includes('export const Sidebar'));

/* --- 2. Tidak ada render grup nav ganda ------------------------------------ */
const groupKeys = ['group_beranda', 'group_volume_qto', 'group_jadwal', 'group_rab', 'group_ai', 'group_data', 'group_lainnya'];
for (const key of groupKeys) {
  check(`Sidebar: label grup ${key} dirender tepat sekali`, count(sidebar, new RegExp(`t\\('nav\\.${key}'\\)`, 'g')) === 1);
}
check('Sidebar: label grup Proyek dirender tepat sekali', count(sidebar, /t\('nav\.proyek'\)/g) === 1);
check('Sidebar: mainNavItems[0] (dashboard) dirender tepat sekali', count(sidebar, /mainNavItems\[0\]/g) === 1);
check('Sidebar: mainNavItems.slice(1) dipetakan tepat sekali', count(sidebar, /mainNavItems\.slice\(1\)/g) === 1);
check('Sidebar: volumeSubItems dipetakan tepat sekali', count(sidebar, /volumeSubItems\.map/g) === 1);
check('Sidebar: rabSubItems dipetakan tepat sekali', count(sidebar, /rabSubItems\.map/g) === 1);
check('Sidebar: databaseSubItems dipetakan tepat sekali', count(sidebar, /databaseSubItems\.map/g) === 1);
check('Sidebar: project picker SATU cabang ternary (!railMode ? picker : ikon rel)',
  sidebar.includes('{(!railMode) ? (') && count(sidebar, /ezrab-project-picker-btn/g) === 1);
check('Sidebar: tombol Buat Proyek Baru tepat sekali', count(sidebar, /t\('nav\.create_project'\)/g) >= 1 && count(sidebar, /Buat Proyek Baru — permanen di sidebar/g) === 1);

/* Destinasi nav utuh (tidak ada yang hilang dalam perampingan). */
const destinations = ['dashboard', 'ezrab-ai', 'ded-ai', 'dokumen-ai', 'template-rab', 'laporan', 'dokumen-tender', 'keuangan-proyek',
  'qto-vc', 'qto', 'manajemen-proyek', 'rab-spreadsheet', 'rab-rekapitulasi', 'database-material', 'ahsp-2026', 'master-pricing', 'pengaturan'];
for (const id of destinations) {
  check(`Sidebar: destinasi '${id}' tetap ada`, sidebar.includes(`'${id}'`));
}

/* --- 3. Dimensi sidebar baru ----------------------------------------------- */
check("Sidebar: lebar desktop 196px (rel 72px dipertahankan)", sidebar.includes("width: railMode ? '72px' : '196px',"));
check('Sidebar: tidak ada lagi lebar lama 256px', !sidebar.includes('256px'));
check("Sidebar: drawer mobile min(84vw, 290px) tidak berubah", sidebar.includes("width: 'min(84vw, 290px)',"));
check('Sidebar: tidak ada lagi baris menu 36px', !sidebar.includes("height: '36px'"));
check('Sidebar: baris 32px = 10 baris nav + tombol tutup drawer + sub-item Database (12)',
  count(sidebar, /height: '32px',/g) === 12);
check('Sidebar: baris 28px = chip picker + sub-item RAB + avatar billing (3)',
  count(sidebar, /height: '28px',/g) === 3);
check('Sidebar: padding baris nav ringkas 0 10px (10 baris)',
  count(sidebar, /padding: railMode \? '0' : '0 10px',/g) === 10);
check('Sidebar: tidak ada lagi padding baris 0 12px', !sidebar.includes("padding: railMode ? '0' : '0 12px',"));
check("Sidebar: pill toggle mengikuti lebar baru (192px / 68px)", sidebar.includes("left: railMode ? '68px' : '192px',"));
check('Sidebar: tidak ada lagi posisi pill lama 252px', !sidebar.includes('252px'));
check("Sidebar: tooltip rel tetap 80px (rel 72px tidak berubah)", sidebar.includes("left: '80px',"));

/* --- 4. TopBar 46px + semua kontrol utuh ----------------------------------- */
check("TopBar: tinggi baris 46px desktop, 48px HP-sempit", topbar.includes("height: isNarrowMobile ? '48px' : '46px',"));
check('TopBar: tidak ada lagi tinggi lama 54px', !topbar.includes("height: isNarrowMobile ? '48px' : '54px',"));
check('TopBar: padding baris ringkas 0 16px desktop', topbar.includes("padding: isNarrowMobile ? '0 12px' : '0 16px',"));
check('TopBar: celah cluster kanan ringkas 8px desktop', topbar.includes("gap: isNarrowMobile ? '6px' : '8px'"));
check('TopBar: kontrol cari tetap ada', topbar.includes('<Search') && topbar.includes('ezrab-topbar-search-input'));
check('TopBar: input cari 32px (muat di header 46px)', topbar.includes("height: '32px',"));
check('TopBar: toggle tema tetap ada', topbar.includes('setTheme') && topbar.includes('<Sun') && topbar.includes('<Moon'));
check('TopBar: pemilih kurs tetap ada', topbar.includes('displayCurrency') && topbar.includes('SUPPORTED_CURRENCIES'));
check('TopBar: pemilih bahasa tetap ada', topbar.includes('LANG_SHORT[lang]') && topbar.includes('LANG_OPTIONS'));
check('TopBar: lonceng notifikasi tetap ada', topbar.includes('<NotificationBell'));
check('TopBar: menu bantuan tetap ada', topbar.includes('HelpCircle') && topbar.includes('Bantuan & Panduan'));
check('TopBar: saldo kredit tetap ada', topbar.includes('<CreditBalance'));
check('TopBar: akun pengguna tetap ada (avatar + dropdown + keluar)', topbar.includes('Menu akun') && topbar.includes('logoutAll'));
check('TopBar: strip breadcrumb tetap ada di bawah baris', topbar.includes('{breadcrumb && ('));

/* --- 5. Kartu billing + aksi keluar masing-masing sekali ------------------- */
check('Sidebar: kartu billing dirender tepat sekali', count(sidebar, /Billing: Paket/g) === 1);
check('Sidebar: avatar billing ringkas 28px',
  sidebar.slice(sidebar.indexOf('Billing saat ini'), sidebar.indexOf('Billing: Paket')).includes("width: '28px',"));
check('Sidebar: tombol tutup drawer mobile tetap 32px (bukan billing)',
  sidebar.slice(sidebar.indexOf('Mobile drawer close'), sidebar.indexOf('Mobile drawer close') + 800).includes("width: '32px',"));
check('Sidebar: aksi keluar (ikon LogOut) tepat sekali', count(sidebar, /<LogOut size=\{16\} \/>/g) === 1);
check('Sidebar: aksi keluar memakai alur terpusat onExitWorkspace', sidebar.includes('if (onExitWorkspace) onExitWorkspace();'));

/* --- 6. Perilaku collapse + overflow dipertahankan -------------------------- */
check('Sidebar: railMode = !isMobile && (sidebarCollapsed || isHidden)',
  sidebar.includes('const railMode = !isMobile && (sidebarCollapsed || isHidden);'));
check('Sidebar: pill toggle memutar lebar penuh ⇄ rel (setIsHidden/onToggleCollapse)',
  sidebar.includes('setIsHidden(false)') && sidebar.includes('onToggleCollapse()') && sidebar.includes('setIsHidden(true)'));
check('Sidebar: pill toggle tanpa auto-expand (aria-pressed=railMode)', sidebar.includes('aria-pressed={railMode}'));
check('Sidebar: props collapse tetap ada di SidebarProps',
  sidebar.includes('sidebarCollapsed: boolean;') && sidebar.includes('onToggleCollapse: () => void;'));
check('WorkspaceView: overflowY ded-ai/dokumen-ai TETAP hidden (tidak diubah)',
  ws.includes("overflowY: (activeMenu === 'ded-ai' || activeMenu === 'dokumen-ai') ? 'hidden' : 'auto',"));
check('WorkspaceView: mount Sidebar meneruskan props collapse',
  ws.includes('sidebarCollapsed={sidebarCollapsed}') && ws.includes('onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}'));

/* --- 7. Jalur duplikasi lain tertutup --------------------------------------- */
check('Navbar: bukan bagian shell — WorkspaceView tidak merujuk Navbar', !ws.includes('Navbar'));
check('Navbar: bukan bagian shell — Sidebar/TopBar tidak merujuk Navbar',
  !sidebar.includes('Navbar') && !topbar.includes('Navbar'));
check('Navbar: header landing (CTA Masuk/Mulai Gratis), bukan nav workspace',
  navbar.includes('Mulai Gratis') && navbar.includes('Beranda') && navbar.includes('#fitur'));
check('CSS rel lawas pf-rail/pf-expand tidak dipakai WorkspaceView', !/pf-rail|pf-expand|pf-drawer|pf-flyout/.test(ws));
check('CSS rel lawas pf-rail/pf-expand tidak dipakai Sidebar', !/pf-rail|pf-expand|pf-drawer|pf-flyout/.test(sidebar));
check('MobileBottomNavV3: tepat SATU mount', count(ws, /<MobileBottomNavV3/g) === 1);
check('MobileBottomNavV3: terkunci di balik isNarrowMobile (<768px)',
  ws.indexOf('{isNarrowMobile && (') !== -1 && ws.indexOf('{isNarrowMobile && (') < ws.indexOf('<MobileBottomNavV3'));
check('WorkspaceView: isNarrowMobile = lebar < 768px', ws.includes('window.innerWidth < 768'));
check('WorkspaceView: isMobile = lebar < 1024px (ambang drawer)', ws.includes('window.innerWidth < 1024'));

/* --- 8. premium-frame.css: tidak butuh edit dimensi ------------------------- */
check('premium-frame.css: tidak ada calc min-height 64px', !pfCss.includes('calc(100vh - 64px)'));
check('premium-frame.css: tidak ada referensi 256px/54px lama', !pfCss.includes('256px') && !pfCss.includes('54px'));
check('premium-frame.css: .pf-main tetap ada (padding-left + min-width)', pfCss.includes('.pf-main {'));
check('WorkspaceView: tidak ada referensi dimensi lama 256px/54px',
  !ws.includes('256px') && !ws.includes("'54px'"));

console.log(`\ndocaiShellRedesign: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);

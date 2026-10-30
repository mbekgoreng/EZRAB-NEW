// Suite: regresi perbaikan audit landing+auth 2026-10-29 (semua temuan
// P2+P3 + batch maskot). Gaya harness sama seperti suite src/test lainnya
// (plain-tsx, tanpa vitest). Aplikasi React penuh tidak dapat di-mount
// headless di sandbox ini, jadi asersi bersifat source-level terhadap
// file yang dirender + keberadaan/ukuran aset publik — dilengkapi gate
// tsc dan suite loginUiDemo/authHardeningR1R2 untuk perilaku.
//
// Jalankan dari root repo:
//   npx --yes esbuild src/test/phaseAContentIntegrity.test.ts --bundle --platform=node --format=cjs --outfile=/tmp/phase-a.cjs && node /tmp/phase-a.cjs
import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: string): void {
  if (cond) {
    pass++;
    console.log(`  PASS ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

console.log('=== LAND-01: pricing jujur soal tahap pengujian ===');
const pricing = read('src/components/landing/exact/ExactPricing.tsx');
check('ada pengungkapan tahap pengujian', pricing.includes('tahap pengujian'));
check('menyatakan paket berbayar belum dapat dibeli', pricing.replace(/\s+/g, ' ').includes('belum dapat dibeli'));
check("CTA tidak lagi 'Pilih Starter/Pro'", !pricing.includes('Pilih Starter') && !pricing.includes('Pilih Pro'));
check("CTA berbayar sekarang 'Coba ...'", pricing.includes("ctaText: 'Coba Starter'") && pricing.includes("ctaText: 'Coba Pro'"));
check("tidak ada lagi teks 'Dibayar Rp'", !pricing.includes('Dibayar Rp'));
const pricingCss = read('src/styles/exact-landing.css');
check('CSS catatan tahap (.ez-pricing-stage-note) ada', pricingCss.includes('.ez-pricing-stage-note'));

console.log('=== LAND-02: klaim tak berdasar hilang, showcase berlabel ===');
const drawings = read('src/components/landing/exact/DrawingsToDecisionsSection.tsx');
check("'DECISION ACCURACY 99.8%' hilang", !drawings.includes('99.8%'));
const hero = read('src/components/landing/cinematic/CinematicHero.tsx');
check("hero tidak lagi menjanjikan 'RAB siap tender'", !hero.includes('RAB siap tender'));
check("hero tidak lagi menjanjikan 'dalam hitungan menit'", !hero.includes('dalam hitungan menit'));
check('hero memakai bahasa draf yang dapat diperiksa', hero.includes('draf RAB'));
const showcase = read('src/components/landing/exact/ExactStackedShowcase.tsx');
check('showcase berlabel ilustrasi antarmuka', showcase.includes('Ilustrasi antarmuka'));

console.log('=== AUTH-02: pesan demo-only eksplisit di kartu ===');
const card = read('src/components/auth/SlidingAuthCard.tsx');
check('subjudul daftar menyebut pendaftaran email belum dibuka', card.includes('Pendaftaran email belum dibuka'));
check('catatan formulir nonaktif selama demo tampil', card.includes('Formulir email nonaktif selama tahap pengujian'));
check('submit ter-guard demoOnly', card.includes("if (demoOnly) {"));
check('input dinonaktifkan saat demoOnly', card.includes('disabled={demoOnly}'));

console.log('=== AUTH-06/AUTH-05/AUTH-09/AUTH-10/A11Y-01/PERF-01 di kartu & route ===');
check('kartu punya callback onModeChange', card.includes('onModeChange'));
check('mode tersinkron dari initialTab', card.includes('setIsSignUp(initialTab === \'daftar\');'));
check('validasi format email per-field', card.includes('Format email tidak valid.'));
check('pesan gabungan lama hilang', !card.includes('Isi email valid dan kata sandi min. 6 karakter.'));
check('error provider dipetakan (friendlyAuthError)', card.includes('friendlyAuthError(r.error.message)'));
check('daftar sadar konfirmasi email (r.session)', card.includes('if (r.session) {'));
check('tombol mata punya aria-pressed', card.includes('aria-pressed={showPassword}'));
check('tracker kursor menghormati reduced-motion', card.includes("matchMedia('(prefers-reduced-motion: reduce)').matches) return;"));
check('scene maskot dimuat lazy', card.includes('React.lazy('));
const routePage = read('src/components/auth/AuthRoutePage.tsx');
check('route page menavigasikan URL saat mode ditukar', routePage.includes('onModeChange={(tab) => {'));
const app = read('src/App.tsx');
check('AUTH-05: App memvalidasi returnTo (/app saja)', app.includes('isSafeInternalReturnTo(returnTo) && isAppPath(returnTo)'));
check('AUTH-03: AboutPage CTA lewat handleOpenAuth', app.includes("onOpenWorkspace={() => handleOpenAuth('daftar')}"));
check('AUTH-07: AuthModal tidak lagi diimpor/di-mount', !app.includes("from './components/auth/AuthModal'") && !app.includes('<AuthModal'));
check('file AuthModal.tsx sudah dihapus', !existsSync(join(root, 'src/components/auth/AuthModal.tsx')));

console.log('=== AUTH-08: satu sumber kebenaran konfigurasi Supabase ===');
const libSupabase = read('src/lib/supabase.ts');
check('lib/supabase mendelegasikan ke isSupabaseReadyForAuth', libSupabase.includes('isSupabaseReadyForAuth(readAuthEnv())'));
const servicesClient = read('src/services/supabaseClient.ts');
check('services/supabaseClient mendelegasikan ke cek yang sama', servicesClient.includes('return isSupabaseReadyForAuth();'));
const rolePanel = read('src/components/auth/RoleLoginPanel.tsx');
check('RoleLoginPanel memakai cek ketat tunggal', rolePanel.includes('isSupabaseReadyForAuth() && !forceDemoRoles'));
check(
  'RoleLoginPanel: hooks sebelum return kondisional (AUTH-07)',
  rolePanel.indexOf('useState<RoleId | null>') < rolePanel.indexOf('if (isSupabaseReadyForAuth()'),
);

console.log('=== NAV-01 / LAND-03 / GATE-01 ===');
const navbar = read('src/components/landing/exact/ExactNavbar.tsx');
check("label menyesatkan 'Masuk ke Workspace' hilang", !navbar.includes('Masuk ke Workspace'));
check('menu mobile punya entri Coba Gratis', navbar.includes("onOpenAuth('daftar')") && navbar.includes('Coba Gratis'));
const infoPages = read('src/components/public/PublicInfoPages.tsx');
check("judul lama 'Masuk/Daftar belum dibuka' hilang", !infoPages.includes("'Masuk belum dibuka'") && !infoPages.includes("'Daftar belum dibuka'") && !app.includes('belum dibuka — EZRAB'));
check('AuthNoticePage menjelaskan peran demo', infoPages.includes('peran demo'));
const gate = read('src/auth/PasscodeGate.tsx');
check("gate tidak lagi mengklaim '4 digit'", !gate.includes('4 digit'));
check('gate input tanpa autoFocus (A11Y-02)', !gate.includes('autoFocus'));

console.log('=== CSS-01 / A11Y / batch maskot ===');
const css = read('src/components/auth/sliding-auth.css');
check("tidak ada sampah '<style>' di CSS", !css.includes('<style>'));
check('aturan .outlined pulih dalam bentuk valid', css.includes('.sac2-card .strokeless-svg .outlined'));
check('aturan transisi .mate-face idle 0.22s pulih', css.includes('.sac2-card[data-mood="idle"] .mate-face { transition: transform 0.22s'));
check('maskot utama diam total: tanpa aturan transform untuk hero/wajah/visor/helmnya (spec final 2026-10-29 malam)', !css.includes('.mate--ezrab { transform') && !css.includes('.mate--ezrab .mate-face { transform') && !css.includes('.mate--ezrab .mate-visor { transform') && !css.includes('.mate--ezrab .mate-helmet { transform'));
check('pop/bounce mengecualikan maskot utama lewat :not() pada aturannya', css.includes('.mate-bounce:not(.mate--ezrab)') && css.includes('.is-logging-in .mate:not(.mate--ezrab)'));
check('default --hx/--hy tetap ada', css.includes('.sac2-card .mate--ezrab { --hx: 0; --hy: 0; }'));
check('shake mati di reduced-motion (A11Y-01)', css.includes('.sac2-card.shake { animation: none !important; }'));
check('.or-text kini #64748b (A11Y-02)', css.includes('.or-text { position: relative; z-index: 1; background: #ffffff; padding: 0 12px; font-size: 11px; color: #64748b; }'));
check('.sac-close punya :focus-visible (A11Y-02)', css.includes('.sac-close:focus-visible'));
check('gaya .sac2-field-error ada (AUTH-09)', css.includes('.sac2-field-error'));
const scene = read('src/components/auth/LoginMatesScene.tsx');
check('mate kuning bermata dua (mata cermin cx=-12)', scene.includes('cx="-12" cy="-78"'));
check('mulut bar kuning terpusat x=-18', scene.includes('x="-18" y="-56"'));
check('arc malu kuning ganda', scene.includes('<g transform="translate(29, 0)">'));

console.log('=== PERF-01 / LAND-04: aset & komponen mati ===');
check('mascot-login-3d.png (842 KB, 0 referensi) terhapus', !existsSync(join(root, 'public/images/mascot-login-3d.png')));
check('construction-cinematic.png (2,25 MB, 0 referensi) terhapus', !existsSync(join(root, 'public/images/construction-cinematic.png')));
const logoSize = statSync(join(root, 'public/images/ez-logo.png')).size;
check(`ez-logo.png terkompresi (< 150 KB, aktual ${logoSize} B)`, logoSize < 150_000);
for (const f of [
  'src/components/landing/exact/ExactHero.tsx',
  'src/components/landing/FeatureGrid.tsx',
  'src/components/landing/FiturUtama.tsx',
  'src/components/landing/AhspDatabaseExplorer.tsx',
  'src/components/landing/InteractiveSpreadsheetPreview.tsx',
]) {
  check(`komponen tak terpakai terhapus: ${f.split('/').pop()}`, !existsSync(join(root, f)));
}
check(
  'PricingSection DIPERTAHANKAN (dipakai WorkspaceView)',
  existsSync(join(root, 'src/components/landing/PricingSection.tsx')),
);

console.log(`\nHASIL: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);

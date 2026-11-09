/**
 * Banner Persetujuan Cookie — penjaga kontrak (owner ACC 2026-11-09).
 *
 * Memeriksa secara statis: helper localStorage (kunci versi, tiga fungsi,
 * gerbang analitik hanya untuk 'accepted'), komponen banner (dua tombol
 * setara, teks jujur inti, cek pilihan tersimpan, tautan privasi ke rute
 * nyata /privacy), CSS (kartu melayang bawah, safe-area, reduced-motion),
 * dan titik pasang: banner dirender dari ExactLandingPage — akar landing
 * yang oleh App.tsx hanya dipakai untuk path publik beranda, sehingga
 * banner tidak ikut tampil di workspace /app.
 *
 * Run (repo): npx --yes tsx src/test/cookieConsent.test.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const read = (rel: string): string => readFileSync(join(repo, rel), 'utf8');

const helper = read('src/lib/cookieConsent.ts');
const banner = read('src/components/landing/CookieConsentBanner.tsx');
const css = read('src/styles/cookie-consent.css');
const landing = read('src/components/landing/ExactLandingPage.tsx');
const app = read('src/App.tsx');
const publicPages = read('src/components/public/PublicInfoPages.tsx');

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean): void => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ ${name}`); }
};

/* --- Helper lib/cookieConsent.ts ------------------------------------------- */
check('helper: kunci penyimpanan versi ezrab-cookie-consent-v1', helper.includes("'ezrab-cookie-consent-v1'"));
check('helper: getCookieConsent ada', /export const getCookieConsent/.test(helper));
check('helper: setCookieConsent ada', /export const setCookieConsent/.test(helper));
check('helper: hasAnalyticsConsent ada', /export const hasAnalyticsConsent/.test(helper));
check('helper: analitik hanya untuk accepted', /getCookieConsent\(\) === 'accepted'/.test(helper));
check('helper: menyimpan stempel waktu (ts: Date.now())', helper.includes('ts: Date.now()'));
check('helper: aman tanpa window (typeof window guard)', helper.includes("typeof window === 'undefined'"));

/* --- Komponen banner -------------------------------------------------------- */
check('banner: membaca pilihan tersimpan saat mount', banner.includes('getCookieConsent()'));
check('banner: menyimpan pilihan lewat setCookieConsent', banner.includes('setCookieConsent(choice)'));
check('banner: jeda tampil ±800ms', banner.includes('800'));
check('banner: tombol Tolak (rejected)', banner.includes("choose('rejected')") && banner.includes('Tolak'));
check('banner: tombol Terima (accepted)', banner.includes("choose('accepted')") && banner.includes('Terima'));
check('banner: region berlabel aksesibel', banner.includes('role="region"') && banner.includes('aria-label="Persetujuan cookie"'));
check('banner: teks jujur — pengukuran hanya bila Terima', banner.includes('pengukuran hanya berjalan bila kamu menekan Terima'));
check('banner: mengimpor CSS khusus cookie-consent', banner.includes("styles/cookie-consent.css"));

/* --- Tautan privasi hanya karena rutenya nyata ------------------------------ */
check('privasi: halaman PrivacyPage nyata ada', publicPages.includes('export const PrivacyPage'));
check('privasi: App merutekan /privacy', app.includes("location.pathname === '/privacy'"));
check('banner: tautan Kebijakan Privasi ke /privacy', banner.includes('href="/privacy"') && banner.includes('Kebijakan Privasi'));

/* --- CSS -------------------------------------------------------------------- */
check('css: kartu melayang fixed di bawah', /position:\s*fixed/.test(css) && /bottom:/.test(css));
check('css: padding aman safe-area HP', css.includes('env(safe-area-inset-bottom'));
check('css: hormati prefers-reduced-motion', css.includes('@media (prefers-reduced-motion: reduce)'));
check('css: font Plus Jakarta Sans', css.includes("'Plus Jakarta Sans'"));
check('css: border landing #E2EAF3', css.toLowerCase().includes('#e2eaf3'));
check('css: aksen biru EZRAB #2563EB', css.toLowerCase().includes('#2563eb'));
check('css: desktop kartu ramping max-width 430px', css.includes('max-width: 430px'));
check('css: z-index 150 (di bawah modal landing 200)', css.includes('z-index: 150'));

/* --- Titik pasang: landing saja, bukan workspace ----------------------------- */
check('pasang: ExactLandingPage merender <CookieConsentBanner />', landing.includes('<CookieConsentBanner />'));
check('pasang: App merender ExactLandingPage untuk path beranda', app.includes('<ExactLandingPage'));

console.log(`\ncookieConsent: ${pass} lulus, ${fail} gagal`);
if (fail > 0) process.exit(1);

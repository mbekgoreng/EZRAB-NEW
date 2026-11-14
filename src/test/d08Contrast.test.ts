/**
 * D-08 (Batch G1, P3) — Kontras rendah teks hero/footer + satu
 * instans D-26 yang nyata ("MasukDaftar").
 *
 * Rasio dihitung di sini dari nilai hex sebenarnya (rumus WCAG
 * 2.1), bukan diambil dari laporan audit:
 * (a) tombol "Jelajahi semua fitur EZRAB": #e8eefb transparan di
 *     atas #F5F8FC = 1,09:1 → kini solid #1D4ED8 + teks putih.
 * (b) tautan navbar #94a3b8 di atas latar terang = 2,56:1 → navbar
 *     kini selalu berlatar gelap (tautan di atas gelap 7,3–7,9:1).
 * (c) teks footer #8498AF di atas putih = 2,96:1 → #5F7694.
 * (d) "MasukDaftar": tombol footer kini block + margin seperti tautan.
 * (e) blur entrance .mrv dihapus (diuji di d06FirstClick).
 *
 * Batas scope: #8498AF lain di landing-ai-showcase.css (header
 * tabel simulasi, teks tile, placeholder composer) adalah bagian
 * ilustrasi simulasi / teks sekunder yang tidak disebut audit —
 * tidak diubah di batch ini; hanya elemen footer yang diperbaiki.
 *
 * Jalankan: npx tsx src/test/d08Contrast.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
// tsx menjalankan berkas ini sebagai ESM: __dirname tidak tersedia.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
/** Hapus komentar // dan blok. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

/** Luminansi relatif WCAG 2.1 untuk hex #rrggbb. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
/** Rasio kontras WCAG antara teks (fg) dan latar (bg). */
function contrast(fg: string, bg: string): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
const AA = 4.5;

const read = (rel: string) => fs.readFileSync(path.join(__dirname, rel), 'utf8');
const workflowSrc = stripComments(read('../components/landing/exact/ExactWorkflow.tsx'));
const criticalCss = stripComments(read('../styles/landing-critical.css'));
const showcaseCss = stripComments(read('../styles/landing-ai-showcase.css'));
const showcaseSrc = stripComments(read('../components/landing/exact/AiShowcase.tsx'));

console.log('D-08 — Kontras WCAG AA (4,5:1 teks normal):');

console.log('\n[1] Rasio terhitung dari hex (bukti numerik):');
test('(a) putih di atas #1D4ED8 (tombol workflow baru) ≥ 4,5:1', () => {
  const r = contrast('#ffffff', '#1D4ED8');
  console.log(`      rasio terhitung: ${r.toFixed(2)}:1`);
  ok(r >= AA, `rasio ${r.toFixed(2)}:1 di bawah AA`);
});
test('(a-lama) #e8eefb di atas #F5F8FC memang gagal (≈1,09:1)', () => {
  const r = contrast('#e8eefb', '#F5F8FC');
  console.log(`      rasio lama terhitung: ${r.toFixed(2)}:1`);
  ok(r < AA, `rasio lama ${r.toFixed(2)}:1 ternyata lolos — asumsi audit salah`);
});
test('(b) #94a3b8 di atas gelap #020617 (navbar baru) ≥ 4,5:1', () => {
  const r = contrast('#94a3b8', '#020617');
  console.log(`      rasio terhitung: ${r.toFixed(2)}:1`);
  ok(r >= AA, `rasio ${r.toFixed(2)}:1 di bawah AA`);
});
test('(b-lama) #94a3b8 di atas putih memang gagal (≈2,56:1)', () => {
  const r = contrast('#94a3b8', '#ffffff');
  console.log(`      rasio lama terhitung: ${r.toFixed(2)}:1`);
  ok(r < AA, `rasio lama ${r.toFixed(2)}:1 ternyata lolos — asumsi audit salah`);
});
test('(c) #5F7694 di atas putih (footer baru) ≥ 4,5:1', () => {
  const r = contrast('#5F7694', '#ffffff');
  console.log(`      rasio terhitung: ${r.toFixed(2)}:1`);
  ok(r >= AA, `rasio ${r.toFixed(2)}:1 di bawah AA`);
});
test('(c-lama) #8498AF di atas putih memang gagal (≈2,96:1)', () => {
  const r = contrast('#8498AF', '#ffffff');
  console.log(`      rasio lama terhitung: ${r.toFixed(2)}:1`);
  ok(r < AA, `rasio lama ${r.toFixed(2)}:1 ternyata lolos — asumsi audit salah`);
});

console.log('\n[2] (a) Tombol workflow kini solid:');
test("background '#1D4ED8' + color '#ffffff'", () => {
  ok(workflowSrc.includes("background: '#1D4ED8'"), 'background solid tidak ada');
  ok(workflowSrc.includes("color: '#ffffff'"), 'teks putih tidak ada');
  ok(!workflowSrc.includes("color: '#e8eefb'"), 'warna lama #e8eefb masih ada');
});

console.log('\n[3] (b) Navbar selalu berlatar gelap:');
test('.ez-nav-dark dasar memakai rgba(2, 6, 23, 0.92)', () => {
  const navRule = criticalCss.match(/\.ez-nav-dark \{[^}]*\}/);
  ok(navRule, 'aturan .ez-nav-dark tidak ditemukan');
  ok(
    navRule![0].includes('background: rgba(2, 6, 23, 0.92)'),
    `.ez-nav-dark bukan gelap: ${navRule![0].slice(0, 120)}`
  );
  ok(!navRule![0].includes('background: transparent'), 'navbar masih transparan');
});

console.log('\n[4] (c/d) Footer: warna + pemisahan tombol:');
test('tautan footer #5F7694', () => {
  const linkRule = showcaseCss.match(/\.ezai-scope \.ezai-footer a \{[^}]*\}/);
  ok(linkRule, 'aturan tautan footer tidak ditemukan');
  ok(linkRule![0].includes('color:#5F7694'), `tautan footer bukan #5F7694: ${linkRule![0]}`);
});
test('tombol footer #5F7694 + block + margin', () => {
  const btnRule = showcaseCss.match(/\.ezai-scope \.ezai-footer button\{[^}]*\}/);
  ok(btnRule, 'aturan tombol footer tidak ditemukan');
  ok(btnRule![0].includes('color:#5F7694'), `tombol footer bukan #5F7694: ${btnRule![0]}`);
  ok(btnRule![0].includes('display:block'), 'tombol footer bukan block');
  ok(btnRule![0].includes('margin-bottom:9px'), 'tombol footer tanpa margin');
});
test('deskripsi footer inline #5F7694', () => {
  ok(showcaseSrc.includes("color: '#5F7694'"), 'deskripsi footer inline bukan #5F7694');
});
test('tombol Masuk/Daftar tidak lagi berdempetan di satu baris', () => {
  ok(
    !showcaseSrc.includes(">Masuk</button><button"),
    'tombol Masuk/Daftar masih berdempetan ("MasukDaftar")'
  );
});

console.log(`\nd08Contrast.test: ${passes} PASS, ${failures} FAIL`);
process.exit(failures ? 1 : 0);

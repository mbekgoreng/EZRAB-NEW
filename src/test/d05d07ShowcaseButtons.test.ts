/**
 * D-05 (Batch G1, P2) — Tombol ilustrasi "Masukkan ke RAB Proyek" /
 * "Unduh PDF" inert (button tanpa onClick).
 * D-07 (Batch G1, P3) — Anchor footer duplikat ("Smart RAB" berbagi
 * #dokumen; keempat tautan Produk berbagi #perkakas).
 *
 * D-05: tidak ada alur nyata yang bermakna dari ilustrasi landing
 * (tanpa konteks proyek; demo terkunci kode) → kedua tombol diganti
 * krom mockup non-interaktif (<span> ber-aria-hidden, kursor
 * default, tanpa efek hover). Pilihan ini dicatat di log Batch G1.
 * D-07: tiap tautan footer kini punya target berbeda — tile bento
 * dan kartu Smart RAB diberi id sendiri.
 *
 * Tes tingkat sumber (tidak ada harness DOM di batch ini).
 *
 * Jalankan: npx tsx src/test/d05d07ShowcaseButtons.test.ts
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
function eq(actual: unknown, expected: unknown, msg: string): void {
  if (actual !== expected) {
    throw new Error(`${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
/** Hapus komentar // dan blok. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

const read = (rel: string) => fs.readFileSync(path.join(__dirname, rel), 'utf8');
const showcaseSrc = stripComments(read('../components/landing/exact/AiShowcase.tsx'));
const showcaseCss = stripComments(read('../styles/landing-ai-showcase.css'));

console.log('D-05/D-07 — Tombol ilustrasi & anchor footer:');

console.log('\n[1] D-05 — tidak ada lagi <button> inert di ilustrasi:');
test('"Masukkan ke RAB Proyek" bukan lagi <button>', () => {
  ok(
    !/<button[^>]*>Masukkan ke RAB Proyek<\/button>/.test(showcaseSrc),
    'tombol inert "Masukkan ke RAB Proyek" masih ada'
  );
});
test('"Unduh PDF" bukan lagi <button>', () => {
  ok(
    !/<button[^>]*>Unduh PDF<\/button>/.test(showcaseSrc),
    'tombol inert "Unduh PDF" masih ada'
  );
});
test('keduanya kini <span> mock-btn ber-aria-hidden', () => {
  ok(
    showcaseSrc.includes(
      '<span className="btn ctaglow mock-btn" aria-hidden="true"'
    ),
    'span mock "Masukkan ke RAB Proyek" tidak ditemukan'
  );
  ok(
    showcaseSrc.includes(
      '<span className="btn dlGlow mock-btn" aria-hidden="true"'
    ),
    'span mock "Unduh PDF" tidak ditemukan'
  );
});
test('CSS: span.btn tanpa kursor pointer & tanpa efek hover', () => {
  ok(
    showcaseCss.includes('.ezai-scope span.btn {cursor:default}'),
    'aturan cursor span.btn tidak ada'
  );
  ok(
    showcaseCss.includes('.ezai-scope span.btn:hover {transform:none;box-shadow:none}'),
    'aturan hover span.btn tidak ada'
  );
});
test('tidak ada <button> tanpa onClick tersisa di AiShowcase', () => {
  // Semua <button> di berkas ini harus punya onClick (tombol nyata)
  // atau type=button + onClick; yang tersisa tanpa handler = inert.
  const buttons = showcaseSrc.match(/<button[^>]*>/g) ?? [];
  const withoutHandler = buttons.filter((b) => !b.includes('onClick'));
  eq(withoutHandler.length, 0, `button tanpa onClick: ${JSON.stringify(withoutHandler)}`);
});

console.log('\n[2] D-07 — tiap tautan footer punya target berbeda:');
test('id target baru ada di AiShowcase', () => {
  for (const id of ['smart-rab', 'kalkulator-volume', 'ahsp-2026', 'spreadsheet-rab', 'kurva-s']) {
    ok(showcaseSrc.includes(`id="${id}"`), `id="${id}" tidak ada`);
  }
});
test('"Smart RAB" menunjuk #smart-rab (bukan #dokumen)', () => {
  ok(showcaseSrc.includes('<a href="#smart-rab">Smart RAB</a>'), 'tautan Smart RAB salah target');
});
test('keempat tautan Produk menunjuk tile masing-masing', () => {
  ok(
    showcaseSrc.includes('<a href="#kalkulator-volume">Kalkulator Volume</a>'),
    'Kalkulator Volume salah target'
  );
  ok(showcaseSrc.includes('<a href="#ahsp-2026">AHSP 2026</a>'), 'AHSP 2026 salah target');
  ok(
    showcaseSrc.includes('<a href="#spreadsheet-rab">Spreadsheet RAB</a>'),
    'Spreadsheet RAB salah target'
  );
  ok(showcaseSrc.includes('<a href="#kurva-s">Kurva S</a>'), 'Kurva S salah target');
});
test('semua href anchor footer unik per label', () => {
  // Ambil blok footer saja, lalu semua href="#..." di dalamnya.
  const footerStart = showcaseSrc.indexOf('<footer className="ezai-footer">');
  const footerEnd = showcaseSrc.indexOf('</footer>', footerStart);
  const footer = showcaseSrc.slice(footerStart, footerEnd);
  const hrefs = [...footer.matchAll(/<a href="#([^"]+)">([^<]+)<\/a>/g)];
  const byLabel = new Map<string, string>();
  for (const [, target, label] of hrefs) {
    if (byLabel.has(label)) {
      throw new Error(`label "${label}" muncul dua kali di footer`);
    }
    byLabel.set(label, target);
  }
  const targets = [...byLabel.values()];
  const uniqueTargets = new Set(targets);
  eq(
    uniqueTargets.size,
    targets.length,
    `target duplikat di footer: ${JSON.stringify(targets)}`
  );
});
test('setiap target anchor footer ada sebagai id di halaman', () => {
  const footerStart = showcaseSrc.indexOf('<footer className="ezai-footer">');
  const footerEnd = showcaseSrc.indexOf('</footer>', footerStart);
  const footer = showcaseSrc.slice(footerStart, footerEnd);
  const targets = [...footer.matchAll(/<a href="#([^"]+)">/g)].map((m) => m[1]);
  for (const target of targets) {
    ok(
      showcaseSrc.includes(`id="${target}"`),
      `target footer #${target} tidak ada id-nya di AiShowcase`
    );
  }
});

console.log(`\nd05d07ShowcaseButtons.test: ${passes} PASS, ${failures} FAIL`);
process.exit(failures ? 1 : 0);

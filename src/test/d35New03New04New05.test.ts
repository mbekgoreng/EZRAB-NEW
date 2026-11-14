/**
 * D-35 (Batch G1, P3) — "Pusat Bantuan & FAQ" mendarat di atas
 * /fitur (timeout 250 ms vs halaman lazy). Perilaku scroll diuji di
 * d04HashScroll; di sini dikunci wiring TopBar-nya.
 * NEW-03 (Batch G1, P3) — Komentar TopBar mengklaim tombol keluar
 * "tidak mengakhiri sesi apa pun" — salah sejak R2 logoutAll.
 * NEW-04 (Batch G1, P3) — 'Super Admin' untuk sesi tanpa identitas
 * (gerbang kode saja) di TopBar + MobileV3.
 * NEW-05 (Batch G1, P3) — id duplikat laten: id="harga" ×3,
 * id="workflow" ×2.
 *
 * Jalankan: npx tsx src/test/d35New03New04New05.test.ts
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
const topBarRaw = read('../components/navigation/TopBar.tsx');
const topBarSrc = stripComments(topBarRaw);
const mobileRaw = read('../components/mobile/MobileV3.tsx');
const mobileSrc = stripComments(mobileRaw);

console.log('D-35 / NEW-03 / NEW-04 / NEW-05:');

console.log('\n[1] D-35 — TopBar memakai hash (scroll diuji di d04):');
test('item FAQ menavigasi ke /fitur#faq', () => {
  ok(topBarSrc.includes("navigateTo('/fitur#faq')"), 'navigateTo(/fitur#faq) tidak ada');
});
test('timeout scroll FAQ 250 ms hilang', () => {
  ok(
    !topBarSrc.includes("document.getElementById('faq')?.scrollIntoView"),
    'scroll timeout lama masih ada'
  );
});

console.log('\n[2] NEW-03 — Komentar keluar menggambarkan logoutAll:');
test('klaim lama "tidak mengakhiri sesi apa pun" hilang TOTAL (termasuk komentar)', () => {
  ok(
    !topBarRaw.includes('tidak mengakhiri sesi apa pun'),
    'klaim salah masih ada di TopBar.tsx'
  );
});
test('komentar baru menyebut logoutAll mengakhiri sesi', () => {
  ok(topBarRaw.includes('logoutAll'), 'komentar tidak menyebut logoutAll');
  ok(
    /mengakhiri (peran|ses|role)/i.test(topBarRaw),
    'komentar tidak menyatakan sesi berakhir'
  );
});
test('tombol keluar memang memanggil logoutAll (komentar jujur)', () => {
  ok(topBarSrc.includes('await logoutAll({'), 'pemanggilan logoutAll tidak ditemukan');
});

console.log('\n[3] NEW-04 — Sesi tanpa identitas dilabeli Tamu:');
test('TopBar: fallback peran = "Tamu"', () => {
  ok(
    topBarSrc.includes("activeRole ? activeRole.name : 'Tamu'"),
    'fallback TopBar bukan Tamu'
  );
});
test('TopBar: tidak ada lagi fallback "Super Admin" pada peran aktif', () => {
  // Polanya spesifik fallback ekspresi — label badge peran
  // ("label: 'Super Admin'") adalah data peran yang sah, bukan fallback.
  ok(
    !topBarSrc.includes("activeRole ? activeRole.name : 'Super Admin'"),
    'fallback Super Admin masih ada di TopBar'
  );
});
test('TopBar: satu-satunya "Super Admin" tersisa = label badge peran', () => {
  const count = (topBarSrc.match(/Super Admin/g) ?? []).length;
  eq(count, 1, `"Super Admin" muncul ${count}× di TopBar (harus 1: badge map)`);
  ok(topBarSrc.includes("label: 'Super Admin'"), 'sisa kemunculan bukan label badge');
});
test('MobileV3: kedua fallback peran = "Tamu"', () => {
  const count = (mobileSrc.match(/activeRole \? activeRole\.name : 'Tamu'/g) ?? []).length;
  eq(count, 2, `fallback Tamu muncul ${count}× di MobileV3 (harus 2)`);
  ok(!mobileSrc.includes(": 'Super Admin'"), 'fallback Super Admin masih ada di MobileV3');
  ok(!mobileSrc.includes('Super Admin'), '"Super Admin" masih ada di MobileV3');
});

console.log('\n[4] NEW-05 — id unik di seluruh src:');
function countIdAttr(id: string): Array<{ file: string; line: number }> {
  // Pindai semua .tsx di src (kecuali tes) untuk atribut id="..." yang
  // sesungguhnya — komentar sudah dihapus agar penjelasan tidak terhitung.
  const hits: Array<{ file: string; line: number }> = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'test') walk(full);
      } else if (entry.name.endsWith('.tsx')) {
        const src = stripComments(fs.readFileSync(full, 'utf8'));
        const lines = src.split('\n');
        lines.forEach((line, i) => {
          if (line.includes(`id="${id}"`)) hits.push({ file: full, line: i + 1 });
        });
      }
    }
  };
  walk(path.join(__dirname, '..'));
  return hits;
}
test('id="harga" tepat 1× (AiShowcase, landing)', () => {
  const hits = countIdAttr('harga');
  eq(hits.length, 1, `id="harga" muncul ${hits.length}×: ${JSON.stringify(hits)}`);
  ok(hits[0].file.endsWith('AiShowcase.tsx'), `id="harga" bukan di AiShowcase: ${hits[0].file}`);
});
test('id="workflow" tepat 1× (AboutWorkflowSection)', () => {
  const hits = countIdAttr('workflow');
  eq(hits.length, 1, `id="workflow" muncul ${hits.length}×: ${JSON.stringify(hits)}`);
  ok(
    hits[0].file.endsWith('AboutWorkflowSection.tsx'),
    `id="workflow" bukan di AboutWorkflowSection: ${hits[0].file}`
  );
});
test('id pengganti ada di tempatnya', () => {
  const pricing = stripComments(read('../components/landing/PricingSection.tsx'));
  const exactPricing = stripComments(read('../components/landing/exact/ExactPricing.tsx'));
  const workflow = stripComments(read('../components/landing/WorkflowSection.tsx'));
  ok(pricing.includes('id="harga-paket"'), 'PricingSection bukan id="harga-paket"');
  ok(exactPricing.includes('id="harga-exact"'), 'ExactPricing bukan id="harga-exact"');
  ok(workflow.includes('id="workflow-arsitektur"'), 'WorkflowSection bukan id="workflow-arsitektur"');
});

console.log(`\nd35New03New04New05.test: ${passes} PASS, ${failures} FAIL`);
process.exit(failures ? 1 : 0);

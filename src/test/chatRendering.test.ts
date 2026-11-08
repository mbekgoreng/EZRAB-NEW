/**
 * chatRendering.test — Suite regresi Premium Response Rendering Engine
 * (renderer sentral src/ai-tools/ezrab-ai/markdown.tsx).
 *
 * Gaya plain-tsx (tanpa vitest): jalankan dari ROOT repo:
 *   npx --yes tsx src/test/chatRendering.test.ts
 *
 * Setiap kasus memeriksa TEKS TERLIHAT (yang benar-benar dibaca pengguna,
 * diekstrak dari HTML hasil renderToStaticMarkup dengan semantik
 * textContent browser) dan/atau struktur HTML bila relevan (satu <ol>,
 * start=, href aman, tidak ada elemen hasil injeksi).
 *
 * Kuota brief: A Markdown 15 · B LaTeX/matematika 15 · C Entitas/escaping 10
 * · D Tabel & daftar ≥10 · E Hitungan konstruksi 10 · F Mata uang/locale 5
 * · G Fragmen streaming 10 · H Keamanan/konten rusak ≥5. Total ≥ 80.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderMarkdown, markdownToPlainText, latexToReadable, decodeHtmlEntitiesOnce } from '../ai-tools/ezrab-ai/markdown';

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

function htmlOf(md: string): string {
  return renderToStaticMarkup(React.createElement(React.Fragment, null, ...renderMarkdown(md)));
}

/** Ekstraksi teks terlihat dengan semantik mirip textContent browser. */
function visibleText(md: string): string {
  let s = htmlOf(md);
  s = s
    .replace(/<td[^>]*>/g, ' | ')
    .replace(/<th[^>]*>/g, ' | ')
    .replace(/<li[^>]*>/g, '\n- ')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<\/(p|tr|h[1-6]|pre|blockquote|div|ul|ol|table)>/g, '\n')
    .replace(/<[^>]+>/g, '');
  // Decode entitas hasil serialisasi SSR tepat satu lintasan (&amp; terakhir).
  s = s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');
  return s
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function visEq(name: string, md: string, expected: string) {
  const v = visibleText(md);
  check(name, v === expected, `visible=${JSON.stringify(v)} expected=${JSON.stringify(expected)}`);
}
function visHas(name: string, md: string, part: string) {
  const v = visibleText(md);
  check(name, v.includes(part), `visible=${JSON.stringify(v)} missing=${JSON.stringify(part)}`);
}
function visNot(name: string, md: string, part: string) {
  const v = visibleText(md);
  check(name, !v.includes(part), `visible=${JSON.stringify(v)} should-not-contain=${JSON.stringify(part)}`);
}
function htmlHas(name: string, md: string, part: string) {
  const h = htmlOf(md);
  check(name, h.includes(part), `html=${h.slice(0, 300)} missing=${JSON.stringify(part)}`);
}
function htmlNot(name: string, md: string, part: string) {
  const h = htmlOf(md);
  check(name, !h.includes(part), `html=${h.slice(0, 300)} should-not-contain=${JSON.stringify(part)}`);
}
function count(hay: string, needle: string): number {
  return hay.split(needle).length - 1;
}

console.log('A. MARKDOWN (15)');
visHas('A1 bold tampil sebagai teks kuat', 'Total **Rp 5.000** ya.', 'Total Rp 5.000 ya.');
htmlHas('A1b bold menjadi <strong>', 'Total **Rp 5.000** ya.', '<strong>Rp 5.000</strong>');
htmlHas('A2 italic terbatasi spasi menjadi <em>', 'nilai *perkiraan* awal', '<em>perkiraan</em>');
htmlNot('A3 snake_case TIDAK menjadi italic', 'gunakan tool cari_ahsp sekarang', '<em>');
visEq('A3b snake_case utuh terlihat', 'gunakan tool cari_ahsp sekarang', 'gunakan tool cari_ahsp sekarang');
htmlHas('A4 heading ## menjadi h4', '## Ringkasan\nIsi teks', '<h4');
htmlHas('A5 heading # menjadi h3', '# Judul Besar\nIsi teks', '<h3');
htmlHas('A6 inline code menjadi <code>', 'pakai `beton K-250` ya', '<code>beton K-250</code>');
visHas('A7 blok kode berpagar tampil utuh', '```\nvolume = 10 * 20\n```', 'volume = 10 * 20');
htmlNot('A8 markdown di dalam blok kode TIDAK diparse', '```\n**bukan bold**\n```', '<strong>');
visHas('A8b isi blok kode terlihat literal', '```\n**bukan bold**\n```', '**bukan bold**');
htmlHas('A9 hr --- menjadi <hr>', 'satu\n\n---\n\ndua', '<hr');
htmlHas('A10 hr *** menjadi <hr>', 'satu\n\n***\n\ndua', '<hr');
htmlHas('A11 blockquote menjadi <blockquote>', '> Catatan: harga belum termasuk PPN', '<blockquote');
htmlHas('A12 paragraf dua baris memakai <br/> asli (regresi F3)', 'baris satu\nbaris dua', 'baris satu<br/>baris dua');
htmlNot('A13 kutipan TIDAK diubah menjadi bold (aturan F3)', 'Dokumen "Berita Acara" sudah siap.', '<strong>Berita Acara</strong>');
visHas('A13b tanda kutip dipertahankan', 'Dokumen "Berita Acara" sudah siap.', '"Berita Acara"');
htmlHas('A14 tautan https menjadi href aman', 'Lihat [panduan](https://ezrab.site/fitur) ya', 'href="https://ezrab.site/fitur"');
visNot('A14b sintaks tautan tidak bocor ke teks', 'Lihat [panduan](https://ezrab.site/fitur) ya', '](https');
htmlHas('A15 bold berisi italic bersarang', '**tebal dan *miring* selesai**', '<em>miring</em>');

console.log('B. LATEX & MATEMATIKA (15)');
visEq('B1 contoh brief: $180 \\text{ m}² \\div 2 = 90 \\text{ m}²$', '$180 \\text{ m}² \\div 2 = 90 \\text{ m}²$', '180 m² ÷ 2 = 90 m²');
visEq('B2 \\times dan ^2', '$10 \\times 20 = 200 \\text{ m}^2$', '10 × 20 = 200 m²');
visEq('B3 \\frac sederhana menjadi a/b', '$\\frac{1}{2} \\times 300 = 150$', '1/2 × 300 = 150');
visEq('B4 \\frac kompleks menjadi (a)/(b)', '$\\frac{a+b}{c}$', '(a+b)/(c)');
htmlHas('B5 $$…$$ satu baris menjadi blok matematika', '$$V = p \\times l \\times t$$', 'md-math-block');
visEq('B5b isi blok matematika terbaca', '$$V = p \\times l \\times t$$', 'V = p × l × t');
visEq('B6 \\(…\\) inline terbaca', '\\(A = 12 \\times 25\\)', 'A = 12 × 25');
visEq('B7 subskrip H_2O', '$H_2O$', 'H₂O');
visEq('B8 superskrip kurung 10^{6}', '$10^{6}$', '10⁶');
visEq('B9 \\pm dan \\%', '$\\pm 5\\%$', '± 5%');
visEq('B10 derajat ^\\circ', '$30^\\circ$', '30°');
visEq('B11 \\le dan \\ge', '$x \\le 10$ dan $y \\ge 5$', 'x ≤ 10 dan y ≥ 5');
visEq('B12 \\sqrt', '$\\sqrt{144} = 12$', '√144 = 12');
visNot('B13 perintah tak dikenal: backslash tidak bocor', '$\\xyz{abc}$', '\\');
visHas('B13b isi perintah tak dikenal tetap tampil terbaca', '$\\xyz{abc}$', 'abc');
visEq('B14 \\text m^2 rapat', '$90 \\text{ m}^2$', '90 m²');
visEq('B15 pangkat gaya teks di luar math', 'Luas 200 m^2 dan volume 8 m^3', 'Luas 200 m² dan volume 8 m³');
check('B16 latexToReadable langsung: \\div', latexToReadable('90 \\div 2') === '90 ÷ 2', latexToReadable('90 \\div 2'));

console.log('C. ENTITAS & ESCAPING (10)');
visEq('C1 &#x20; menjadi spasi', 'Luas&#x20;tanah 300 m²', 'Luas tanah 300 m²');
visEq('C2 &amp; menjadi &', 'Beton &amp; baja', 'Beton & baja');
visEq('C3 decode TEPAT SEKALI: &amp;#x20; tampil sebagai teks &#x20;', 'Kode &#x20; dan &amp;#x20; beda', 'Kode dan &#x20; beda');
visEq('C4 &lt;div&gt; tampil sebagai teks, bukan elemen', '&lt;div&gt; contoh', '<div> contoh');
htmlNot('C4b tidak ada elemen <div> hasil injeksi entitas', '&lt;div&gt; contoh', '<div');
visEq('C5 &quot; menjadi tanda kutip', '&quot;Penting&quot;', '"Penting"');
visEq('C6 entitas numerik &#169; menjadi ©', 'Hak cipta &#169; 2026', 'Hak cipta © 2026');
visNot('C7 &nbsp; tidak tampil mentah', 'Rp&nbsp;1.000 per sak', '&nbsp;');
visHas('C7b teks &nbsp; tetap menyatu', 'Rp&nbsp;1.000 per sak', '1.000 per sak');
visEq('C8 entitas di code span TIDAK didekode', 'tulis `&amp;` apa adanya', 'tulis &amp; apa adanya');
visEq('C9 &times; bernama menjadi ×', '12 &times; 25 = 300', '12 × 25 = 300');
visEq('C10 karakter lolos \\* tampil literal', 'Harga \\*estimasi\\* saja', 'Harga *estimasi* saja');
htmlNot('C10b \\* tidak menjadi italic/bold', 'Harga \\*estimasi\\* saja', '<em>');
check('C11 decodeHtmlEntitiesOnce: &amp;amp; → &amp; (satu kali)', decodeHtmlEntitiesOnce('&amp;amp;') === '&amp;', decodeHtmlEntitiesOnce('&amp;amp;'));

console.log('D. TABEL & DAFTAR (11)');
htmlHas('D1 tabel dasar menjadi <table>', '| Item | Vol |\n|---|---|\n| Galian | 12 |', '<table');
visHas('D1b isi tabel terbaca', '| Item | Vol |\n|---|---|\n| Galian | 12 |', 'Galian');
const rabTable = '| No | Item | Volume | Satuan | Harga | Jumlah |\n|---|---|---|---|---|---|\n| 1 | Galian tanah | 12 | m³ | Rp150.000 | Rp1.800.000 |\n| 2 | Urugan pasir | 8 | m³ | Rp200.000 | Rp1.600.000 |\n| 3 | Beton K-250 | 5 | m³ | Rp1.100.000 | Rp5.500.000 |';
visHas('D2 tabel RAB besar: semua sel terbaca', rabTable, 'Rp5.500.000');
check('D2b tabel RAB: 3 baris data', count(htmlOf(rabTable), '<tr>') === 4, htmlOf(rabTable));
htmlHas('D3 perataan kanan dari ---:', '| Item | Harga |\n|:---|---:|\n| Semen | Rp62.000 |', 'text-align:right');
visHas('D4 baris sel kurang tetap dirender tanpa crash', '| A | B |\n|---|---|\n| Hanya satu |', 'Hanya satu');
{
  const prov = '1. Bata merah — Rp850\n   Sumber: HSPK 2026\n2. Semen — Rp62.000\n   Sumber: survei pasar\n3. Pasir — Rp250.000';
  check('D5 daftar bernomor + provenance tetap SATU <ol>', count(htmlOf(prov), '<ol') === 1, htmlOf(prov));
  visHas('D5b baris Sumber tetap di dalam daftar', prov, 'Sumber: HSPK 2026');
}
htmlHas('D6 daftar mulai nomor 5 memakai start="5"', '5. Lima\n6. Enam', 'start="5"');
{
  const nested = '- Pondasi\n  - Batu kali\n  - Semen\n- Dinding';
  check('D7 daftar bersarang: dua <ul>', count(htmlOf(nested), '<ul') === 2, htmlOf(nested));
  check('D7b daftar bersarang: empat <li>', count(htmlOf(nested), '<li') === 4, htmlOf(nested));
}
{
  const mixed = '- Bahan:\n  1. Semen\n  2. Pasir\n- Alat';
  check('D8 ol bersarang di dalam ul', htmlOf(mixed).includes('<ol') && count(htmlOf(mixed), '<li') === 4, htmlOf(mixed));
}
visHas('D9 task list belum selesai ☐', '- [ ] Cek harga\n- [x] Survei lokasi', '☐ Cek harga');
visHas('D9b task list selesai ☑', '- [ ] Cek harga\n- [x] Survei lokasi', '☑ Survei lokasi');
{
  const cont = '- Item pekerjaan panjang\n  lanjutan penjelasan item';
  check('D10 baris lanjutan bullet tetap satu item', count(htmlOf(cont), '<li') === 1, htmlOf(cont));
  visHas('D10b lanjutan terbaca', cont, 'lanjutan penjelasan item');
}
visHas('D11 daftar tak bernomor dasar', '- Semen\n- Pasir\n- Bata', 'Semen');

console.log('E. HITUNGAN KONSTRUKSI (10)');
visEq('E1 hitungan bertahap tiga baris', 'Luas tanah = panjang × lebar\n= 25 m × 12 m\n= 300 m²', 'Luas tanah = panjang × lebar\n= 25 m × 12 m\n= 300 m²');
htmlHas('E1b baris hasil diberi kelas md-calc', 'Luas tanah = panjang × lebar\n= 25 m × 12 m\n= 300 m²', 'md-calc');
visEq('E2 contoh brief: bold + hitungan', '**Luas tanah:** 12 × 25 = 300 m²', 'Luas tanah: 12 × 25 = 300 m²');
visHas('E3 luas dinding', 'Luas dinding kotor = 20 × 4\n= 80 m²', '= 80 m²');
visEq('E4 volume balok', 'Volume = 10 × 20 × 3 = 600 m³', 'Volume = 10 × 20 × 3 = 600 m³');
visEq('E5 persen atas rupiah', 'Kenaikan 10% dari Rp2.000.000 = Rp2.200.000', 'Kenaikan 10% dari Rp2.000.000 = Rp2.200.000');
visHas('E6 kuantitas negatif dipertahankan', 'Deviasi -5 m² dari rencana', '-5 m²');
visEq('E7 campuran math di tengah kalimat', 'Dengan lebar $b = 4$ m dan tinggi $h = 3$ m', 'Dengan lebar b = 4 m dan tinggi h = 3 m');
visEq('E8 blok math multi-baris', '$$\nV = 2 \\times 3 \\times 4\n$$', 'V = 2 × 3 × 4');
visEq('E9 rasio campuran tidak diubah', 'Campuran 1 : 2 : 3 untuk kolom', 'Campuran 1 : 2 : 3 untuk kolom');
check('E10 plainText ringkasan gudang mempertahankan angka kunci', (() => {
  const p = markdownToPlainText('**Proyek: Gudang**\n- Tapak: 200 m²\n- Lahan: 500 m²\n- Lantai: Asumsi 1 lantai');
  return p.includes('Tapak: 200 m²') && p.includes('Lahan: 500 m²') && p.includes('Asumsi 1 lantai') && !p.includes('**');
})());

console.log('F. MATA UANG & LOCALE ID (5)');
visEq('F1 Rp dengan pemisah ribuan titik', 'Total **Rp1.250.000**', 'Total Rp1.250.000');
visEq('F2 desimal koma tidak diubah', 'Volume 1.234,5 m³', 'Volume 1.234,5 m³');
visEq('F3 Rp per satuan', 'Harga Rp 850.000 /sak', 'Harga Rp 850.000 /sak');
check('F4 plainText mempertahankan total kanonis', markdownToPlainText('Grand total **Rp1.089.879.733**').includes('Rp1.089.879.733'));
visHas('F5 harga di tabel terbaca utuh', '| Item | Harga |\n|---|---|\n| Semen | Rp62.000 |', 'Rp62.000');

console.log('G. FRAGMEN STREAMING (10)');
visEq('G1 bold separuh: teks tampil tanpa penanda mentah', 'Total sementara **Rp 1.250.0', 'Total sementara Rp 1.250.0');
visNot('G1b bold separuh: tidak ada ** terlihat', 'Total sementara **Rp 1.250.0', '**');
visEq('G2 math separuh: terbaca tanpa $ dan backslash', 'Luas = $12 \\times 25', 'Luas = 12 × 25');
visHas('G3 fence separuh: isi kode tetap tampil', '```\nvolume = 10', 'volume = 10');
htmlHas('G4 tabel separuh (header+pemisah) tetap <table>', '| A | B |\n|---|---|', '<table');
visHas('G5 tabel separuh baris data terbaca', '| A | B |\n|---|---|\n| Galian | 12', 'Galian');
visHas('G6 italic separuh: teks tidak hilang', 'teks *belum selesai', 'belum selesai');
visEq('G7 tautan separuh: teks tidak hilang/diduplikasi', 'Lihat [pandu', 'Lihat [pandu');
visEq('G8 heading separuh tampil sebagai heading teks', '## Ringka', 'Ringka');
visHas('G9 daftar separuh tampil', '- satu\n- du', 'satu');
check('G10 render TIDAK melempar untuk semua potongan dokumen contoh', (() => {
  const doc = '## Hasil\nTotal **Rp1.250.000** untuk $10 \\times 20$ m².\n\n| A | B |\n|---|---|\n| x | 1 |\n\n- satu\n  - anak\n- dua\n\n```\ncode\n```\n\n> kutipan &amp; catatan';
  try {
    for (let cut = 0; cut <= doc.length; cut += 7) {
      renderMarkdown(doc.slice(0, cut));
      markdownToPlainText(doc.slice(0, cut));
    }
    return true;
  } catch { return false; }
})());

console.log('H. KEAMANAN & KONTEN RUSAK (6)');
htmlNot('H1 <script> tidak menjadi elemen script', '<script>alert(1)</script> halo', '<script>');
htmlNot('H2 <img onerror> tidak menjadi elemen img', '<img src=x onerror=alert(1)>', '<img');
htmlNot('H3 tautan javascript: tidak menjadi href', 'Klik [ini](javascript:alert(1))', 'javascript:');
visEq('H3b label tautan javascript: tampil bersih tanpa sisa kurung', 'Klik [ini](javascript:alert(1))', 'Klik ini');
htmlNot('H4 tautan data: tidak menjadi href', '[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg)', 'data:text/html');
htmlNot('H5 HTML di inline code tidak menjadi elemen', 'contoh `<b>tebal</b>` ya', '<b>');
htmlNot('H6 tautan vbscript: tidak menjadi href', '[klik](vbscript:msgbox)', 'vbscript:');
visHas('H7 math rusak parah: angka inti tetap tampil', '$\\frac{1}{$', '1');
visNot('H7b math rusak parah: perintah mentah tidak bocor', '$\\frac{1}{$', '\\frac');

console.log('I. KASUS TEPI & HARDENING (lanjutan)');
{
  // Daftar bersarang dalam: 4 tingkat.
  const deep = '- L1\n  - L2\n    - L3\n      - L4';
  check('I1 daftar 4 tingkat: 4 <ul>', count(htmlOf(deep), '<ul') === 4, htmlOf(deep));
  check('I1b daftar 4 tingkat: 4 <li>', count(htmlOf(deep), '<li') === 4, htmlOf(deep));
  visHas('I1c tingkat terdalam terbaca', deep, 'L4');
}
{
  // Item daftar kosong tidak merusak item tetangganya.
  const emptyItem = '- \n- Isi nyata';
  check('I2 item kosong: tetap 2 <li>', count(htmlOf(emptyItem), '<li') === 2, htmlOf(emptyItem));
  visHas('I2b item nyata tetap terbaca', emptyItem, 'Isi nyata');
}
{
  const twoFences = '```\nsatu\n```\n\n```\ndua\n```';
  check('I3 dua blok kode berurutan: 2 pembungkus', count(htmlOf(twoFences), 'md-pre-wrap') === 2, htmlOf(twoFences));
  visHas('I3b isi kedua blok tampil', twoFences, 'dua');
}
visHas('I4 fence tak tertutup: isi tampil sampai akhir', '```js\nconst a = 1;', 'const a = 1;');
htmlHas('I4b fence tak tertutup: bahasa terbaca di kepala blok', '```js\nconst a = 1;', 'md-pre-lang');
visEq('I5 bold tak tertutup: teks tampil tanpa **', 'Total **belum selesai', 'Total belum selesai');
visEq('I6 inline code tak tertutup: teks tidak hilang', 'pakai `kode separuh', 'pakai kode separuh');
{
  const nq = '> luar\n> > dalam bersarang';
  check('I7 blockquote bersarang: 2 <blockquote>', count(htmlOf(nq), '<blockquote') === 2, htmlOf(nq));
  visHas('I7b isi kutipan dalam terbaca', nq, 'dalam bersarang');
}
{
  const escPipe = '| Kolom | Nilai |\n|---|---|\n| Rasio \\| campuran | 1:2 |';
  check('I8 tabel pipa escape: baris data tetap 2 sel', count(htmlOf(escPipe), '<td') === 2, htmlOf(escPipe));
  visHas('I8b pipa escape tampil sebagai pipa literal di selnya', escPipe, 'Rasio | campuran');
}
htmlHas('I9 URL berkurung (wiki) href utuh', '[Fungsi](https://id.wikipedia.org/wiki/Fungsi_(matematika))', 'href="https://id.wikipedia.org/wiki/Fungsi_(matematika)"');
htmlNot('I10 javascript: berkurung ganda tetap ditolak', '[x](javascript:alert(document.cookie))', 'javascript:');
visEq('I11 entitas berulang campur: &amp;amp; → teks &amp; sekali decode', 'Simbol &amp;amp; tampil', 'Simbol &amp; tampil');
visHas('I12 simbol konstruksi unicode utuh', 'Toleransi ± 5 mm, Ø12 mm, sudut 90°, Δ suhu', 'Ø12 mm');
visHas('I12b simbol unicode lain utuh', 'Toleransi ± 5 mm, Ø12 mm, sudut 90°, Δ suhu', 'Δ suhu');
visEq('I13 mata uang Indonesia di plainText utuh', 'Total Rp1.089.879.733', 'Total Rp1.089.879.733');
check('I14 angka sangat panjang tidak diubah/dipotong', visibleText(`Nilai ${'9'.repeat(40)} satuan`).includes('9'.repeat(40)));
visEq('I15 math parsial saat streaming: terbaca tanpa penanda', 'Luas $10 \\times', 'Luas 10 ×');
{
  const longDoc = Array.from({ length: 300 }, (_, n) => `Baris ${n + 1}: volume beton **${n + 1} m³** untuk kolom.`).join('\n\n');
  const t0 = Date.now();
  const hLong = htmlOf(longDoc);
  const dt = Date.now() - t0;
  check('I16 respons sangat panjang (300 paragraf): semua item tampil', count(hLong, 'volume beton') === 300);
  check(`I16b waktu render 300 paragraf < 3000 ms (terukur ${dt} ms)`, dt < 3000, `${dt} ms`);
}
visEq('I17 markdown rusak dari user: ** yatim gugur (konsisten G1), isi inti tampil', '**[{( rusak', '[{( rusak');
htmlNot('I18 injeksi di dalam blok kode tetap teks kode', '```\n<script>alert(1)</script>\n```', '<script>');
htmlNot('I19 injeksi di dalam kutipan tidak menjadi elemen', '> <script>alert(1)</script>', '<script>');
visHas('I19b isi kutipan injeksi tampil sebagai teks', '> <script>alert(1)</script>', 'alert(1)');
{
  // Stres patologis: 20.000 karakter penanda tanpa pasangan + bintang liar.
  const nasty = '*'.repeat(20000) + ' teks ' + '$'.repeat(5000) + '\\'.repeat(5000);
  const t0 = Date.now();
  renderMarkdown(nasty);
  markdownToPlainText(nasty);
  const dt = Date.now() - t0;
  check(`I20 stres patologis 30rb penanda < 3000 ms (terukur ${dt} ms)`, dt < 3000, `${dt} ms`);
}
check('I21 plainText: penanda daftar HILANG, isi & urutan utuh', (() => {
  const p = markdownToPlainText('## Hasil\n- Galian tanah\n  - Volume 12 m³\n1. Urugan\n2. Beton');
  return p.includes('Hasil') && p.includes('Galian tanah') && p.includes('Volume 12 m³')
    && p.includes('Urugan') && p.includes('Beton') && !p.includes('- Galian') && !p.includes('1. Urugan');
})());
check('I22 plainText: tabel sel berformat terbaca (bold & math di sel)', (() => {
  const p = markdownToPlainText('| Item | Harga |\n|---|---|\n| **Semen** | Rp62.000 |');
  return p.includes('Semen | Rp62.000') && !p.includes('**');
})());
check('I23 plainText: blok kode utuh termasuk baris mirip markdown', (() => {
  const p = markdownToPlainText('```\n# bukan heading\n- bukan daftar\n```');
  return p.includes('# bukan heading') && p.includes('- bukan daftar');
})());
check('I24 plainText: task list menjadi simbol yang sama dengan render', (() => {
  const p = markdownToPlainText('- [ ] Cek harga\n- [x] Survei');
  return p.includes('☐ Cek harga') && p.includes('☑ Survei');
})());

console.log(`\nHASIL chatRendering: ${pass} PASS, ${fail} FAIL (total ${pass + fail})`);
if (failures.length) {
  console.log('Gagal:', failures);
  process.exitCode = 1;
}

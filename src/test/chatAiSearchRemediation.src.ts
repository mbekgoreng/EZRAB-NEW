/**
 * Chat AI — Remediasi Batch 1: search reliability (Fase 5 misi, butir 1-7, 11-14).
 *
 * Tes DETERMINISTIK atas engine chat (chatSearch) — bukan tes kualitas model.
 * Tidak ada panggilan model live yang dieksekusi di sini.
 */
import { searchChatAhsp, formatChatAhspResult, normalizeChatQuery } from '../ai-tools/ezrab-ai/chatSearch';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; } else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== 1. Lookup kode eksak valid ===');
{
  const r = searchChatAhsp('3.7.4');
  check('3.7.4 -> FOUND_RELEVANT', r.outcome === 'FOUND_RELEVANT', r.outcome);
  check('3.7.4 -> satu item berkode 3.7.4', r.items.length === 1 && r.items[0].code === '3.7.4');
  check('3.7.4 -> judul plesteran 1SP:4PP', r.items[0].title.toLowerCase().includes('plesteran'));
}

console.log('=== 2. Kode palsu 9.9.9.9 -> NOT_FOUND eksplisit ===');
{
  const r = searchChatAhsp('9.9.9.9');
  check('9.9.9.9 -> NOT_FOUND', r.outcome === 'NOT_FOUND', r.outcome);
  check('9.9.9.9 -> tanpa item', r.items.length === 0);
  check('9.9.9.9 -> pesan menyebut kode', (r.notFoundMessage ?? '').includes('9.9.9.9'));
  check('9.9.9.9 -> pesan menyatakan tidak diganti item lain', (r.notFoundMessage ?? '').includes('tidak diganti'));
}

console.log('=== 3. Plesteran 1:4 mengutamakan 3.7.4 (Q1) ===');
{
  // Param persis yang dilewatkan intent lokal pada Batch 1.
  const r = searchChatAhsp('plesteran dinding campuran 1:4 dan berapa harganya per m2?');
  check('Q1 -> item pertama 3.7.4', r.items.length > 0 && r.items[0].code === '3.7.4', r.items.map((i) => i.code).join(','));
  check('Q1 -> 1.1.2.3 tidak tampil sebagai jawaban', !r.items.some((i) => i.code === '1.1.2.3'));
  check('Q1 -> label jujur PARTIAL (dinding/campuran tak ada di judul)', r.outcome === 'FOUND_PARTIAL', r.outcome);
  check('Q1 -> catatan menyebut istilah tak cocok', (r.note ?? '').includes('dinding'));
  const out = formatChatAhspResult(r);
  check('Q1 -> output memuat 3.7.4', out.includes('[3.7.4]'));
  check('Q1 -> output tidak memuat 1.1.2.3', !out.includes('[1.1.2.3]'));
}

console.log('=== 4. Beton K-225 bukan curing/tiang (Q2) ===');
{
  const r = searchChatAhsp('2026 pekerjaan beton k-225 per m3?');
  check('Q2 -> NOT_FOUND (notasi K tanpa padanan)', r.outcome === 'NOT_FOUND', r.outcome);
  check('Q2 -> tanpa item', r.items.length === 0);
  const out = formatChatAhspResult(r);
  check('Q2 -> output tanpa curing 2.2.1.9', !out.includes('2.2.1.9'));
  check('Q2 -> output tanpa tiang 2.2.2.4', !out.includes('2.2.2.4'));
  check("Q2 -> penjelasan menyebut notasi f'c", out.includes("f'c"));
  check('Q2 -> penjelasan meminta klarifikasi mutu/pekerjaan', out.includes('Sebutkan mutu'));
}

console.log('=== 5. Kloset/closet + anti duduk/dudukan (Q10) ===');
{
  const n = normalizeChatQuery('kloset duduk');
  check('kloset dinormalisasi ke closet', n.terms.includes('closet'), n.terms.join(','));
  const r = searchChatAhsp('kloset duduk dan berapa harganya per buah?');
  check('Q10 -> RELEVANT', r.outcome === 'FOUND_RELEVANT', r.outcome);
  check('Q10 -> item pertama 3.18.3.1', r.items.length > 0 && r.items[0].code === '3.18.3.1');
  check('Q10 -> satuan buah sesuai permintaan', r.items[0].unit === 'buah' && !r.items[0].unitMismatch);
  check('Q10 -> tanpa item "dudukan"', !r.items.some((i) => i.title.toLowerCase().includes('dudukan')));
}

console.log('=== 6. Wiremesh bukan geotekstil/geomembran (Q11) ===');
{
  const r = searchChatAhsp('pasang wiremesh per m2?');
  check('Q11 m2 -> NOT_FOUND (bronjong m3 bukan jawaban m2)', r.outcome === 'NOT_FOUND', r.outcome);
  check('Q11 m2 -> tanpa item valid', r.items.length === 0);
  check('Q11 m2 -> pesan menyebut satuan berbeda', (r.notFoundMessage ?? '').includes('satuan berbeda'));
  const plain = searchChatAhsp('wiremesh');
  check('wiremesh tanpa satuan -> hanya item wiremesh', plain.items.length > 0 && plain.items.every((i) => i.title.toLowerCase().includes('wiremesh')));
  check('wiremesh tanpa satuan -> tanpa geotekstil/geomembran', !plain.items.some((i) => /geotekstil|geomembran/i.test(i.title)));
}

console.log('=== 7. Kueri tak relevan -> NOT_FOUND, bukan daftar generik ===');
{
  const r = searchChatAhsp('asdfghjkl qwerty');
  check('gibberish -> NOT_FOUND', r.outcome === 'NOT_FOUND', r.outcome);
  check('gibberish -> tanpa item', r.items.length === 0);
}

console.log('=== 11. Provenance koefisien vs HSD terpisah ===');
{
  const r = searchChatAhsp('3.7.4');
  const out = formatChatAhspResult(r);
  check('provenance -> sumber koefisien Lampiran VI', out.includes('Sumber koefisien: Lampiran VI SE DJBK No. 47/SE/Dk/2026'));
  check('provenance -> dasar harga komposisi HSD', out.includes('Dasar harga: dihitung dari komposisi (koefisien × HSD:'));
  check('provenance -> nama sumber HSD tercantum', out.includes('Standar Upah Cipta Karya SE 47/2026'));
  check('provenance -> wilayah/periode dinyatakan tidak tercantum', out.includes('Wilayah/periode HSD: tidak tercantum'));
  check('provenance -> tanpa klaim "Status verifikasi: VERIFIED"', !out.includes('Status verifikasi: VERIFIED'));
  check('provenance -> origin COMPOSITION + FULL', r.items[0].priceOrigin === 'COMPOSITION' && r.items[0].pricingStatus === 'FULL');
}

console.log('=== 12. Parsial tetap parsial, belum tersedia tetap null ===');
{
  const partial = searchChatAhsp('A.2.01.b1.1');
  check('A.2.01.b1.1 -> PARTIAL 2/3', partial.items[0].pricingStatus === 'PARTIAL' && partial.items[0].resolvedComponents === 2 && partial.items[0].totalComponents === 3);
  check('A.2.01.b1.1 -> sufiks "Harga parsial"', partial.items[0].priceSuffix.includes('Harga parsial'));
  const missing = searchChatAhsp('A.1.02.4a.1.b');
  check('A.1.02.4a.1.b -> UNAVAILABLE', missing.items[0].priceOrigin === 'UNAVAILABLE');
  check('A.1.02.4a.1.b -> "harga belum tersedia", bukan Rp0', missing.items[0].priceSuffix.includes('harga belum tersedia') && !missing.items[0].priceSuffix.includes('Rp 0'));
}

console.log('=== 13-14. Satuan m2 vs m3: peringatan eksplisit, tanpa konversi diam-diam ===');
{
  const r = searchChatAhsp('beton', { unit: 'm2' });
  check('beton m2 -> PARTIAL (terlalu umum)', r.outcome === 'FOUND_PARTIAL', r.outcome);
  check('beton m2 -> semua item jawaban bersatuan m2', r.items.length > 0 && r.items.every((i) => i.unit === 'm2'));
  check('beton m2 -> ada item bersatuan berbeda yang ditandai', r.flaggedItems.length > 0 && r.flaggedItems.every((i) => i.unit !== 'm2'));
  check('beton m2 -> di antaranya ada item m3', r.flaggedItems.some((i) => i.unit === 'm3'));
  const out = formatChatAhspResult(r);
  check('beton m2 -> peringatan menyebut kedua satuan', out.includes('berbeda dari satuan yang Anda minta (m2)') && out.includes('angka ini per m3'));
  check('beton m2 -> peringatan melarang konversi', out.includes('Jangan dikonversi tanpa data geometri'));
  check('beton m2 -> item m3 tidak bercampur di daftar jawaban', !r.items.some((i) => i.unit === 'm3'));
}

console.log(`\n=== HASIL: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) process.exit(1);

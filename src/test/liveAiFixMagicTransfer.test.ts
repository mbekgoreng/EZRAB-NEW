/**
 * Regresi temuan uji AI live 2026-11-15 (workstream 3, Magic AI jalur
 * 'Lanjutkan di Chat AI' — transfer jawaban ke spreadsheet).
 *
 * Kasus live persis: query 'pekerjaan plesteran dinding 10 m2' dijawab
 * Chat AI sebagai TEKS hasil pencarian AHSP — tanpa kuantitas 10 m2,
 * tanpa draft RAB, tanpa jalur pindah ke spreadsheet (hanya tombol
 * salin). Perbaikan: aksi transfer eksplisit dari jawaban
 * (chatAnswerTransfer.ts + tombol di view.tsx) mengikuti preseden
 * directRabPush — kode diambil dari format kanonis jawaban, harga
 * di-resolve ulang dari resolver resmi, volume dari pesan pengguna,
 * hanya item teratas yang ditransfer (item jawaban adalah alternatif
 * berperingkat, bukan satu set RAB).
 *
 * Tes DETERMINISTIK dengan stub pesan + katalog/resolver nyata — tidak
 * ada panggilan model live, tidak ada store/browser. Penyisipan akhir
 * ke spreadsheet (insertRabItemsVerified, mesin yang sudah ada)
 * TIDAK dites di sini — butuh uji live ulang di Preview.
 * Cara jalan: npx --yes tsx src/test/liveAiFixMagicTransfer.test.ts
 * Exit 0 = semua lulus.
 */
import { searchChatAhsp, formatChatAhspResult } from '../ai-tools/ezrab-ai/chatSearch';
import {
  extractAhspCodesFromAnswer,
  parseRequestedQuantity,
  mapAnswerItemsToPushItems,
  buildAnswerTransfer,
  findPrecedingUserText,
} from '../ai-tools/ezrab-ai/chatAnswerTransfer';
import { formatWorkItemTitle } from '../ai-tools/ezrab-ai/workItemTitle';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

/** Jawaban nyata mesin chat untuk kueri live (bukan teks karangan). */
const LIVE_ANSWER = formatChatAhspResult(searchChatAhsp('pekerjaan plesteran dinding 10 m2'));
const LIVE_USER_TEXT = 'pekerjaan plesteran dinding 10 m2';

console.log('=== 1. Ekstraksi kode dari jawaban kanonis ===');
{
  const codes = extractAhspCodesFromAnswer(LIVE_ANSWER);
  check('live -> 8 kode terekstraksi', codes.length === 8, codes.join(','));
  check('live -> kode pertama 3.7.1 (best match)', codes[0] === '3.7.1', codes.join(','));
  check('live -> [1.1.2.3] tidak ada di jawaban', !codes.includes('1.1.2.3'), codes.join(','));
}

console.log('=== 2. Ekstraksi kode: hanya baris kanonis bernomor ===');
{
  const fixture =
    'Menurut [3.7.4] di atas, harganya sekian.\n' +
    '1. [3.7.4] Pemasangan 1 m2 plesteran 1SP : 4PP tebal 15 mm — m2 — Rp 51.622\n' +
    '2. [3.7.4] Pemasangan 1 m2 plesteran 1SP : 4PP tebal 15 mm — m2 — Rp 51.622\n' +
    '3. [A.1.02.3b.1] 1 m2 Plesteran trasram tebal 1 cm — m2\n' +
    '[Chat AI] ini bukan kode.\n' +
    '4. [1] bukan kode AHSP.\n';
  const codes = extractAhspCodesFromAnswer(fixture);
  check(
    'fixture -> hanya baris bernomor, duplikat dibuang',
    codes.length === 2 && codes[0] === '3.7.4' && codes[1] === 'A.1.02.3b.1',
    codes.join(','),
  );
  check('teks tanpa kode -> []', extractAhspCodesFromAnswer('halo, apa kabar?').length === 0);
  check('teks kosong -> []', extractAhspCodesFromAnswer('').length === 0);
}

console.log('=== 3. Parsing volume dari pesan pengguna ===');
{
  check('10 m2', JSON.stringify(parseRequestedQuantity(LIVE_USER_TEXT)) === '{"volume":10,"unit":"m2"}');
  check(
    'desimal koma 10,5 m2',
    JSON.stringify(parseRequestedQuantity('plesteran 10,5 m2')) === '{"volume":10.5,"unit":"m2"}',
  );
  check('tanpa spasi 10m2', parseRequestedQuantity('plesteran 10m2')?.volume === 10);
  check('m² unicode', parseRequestedQuantity('plesteran 10 m²')?.unit === 'm2');
  check('2 buah', JSON.stringify(parseRequestedQuantity('pasang 2 buah kloset')) === '{"volume":2,"unit":"buah"}');
  check("5 m'", JSON.stringify(parseRequestedQuantity("skoning 5 m'")) === '{"volume":5,"unit":"m\'"}');
  check('tanpa volume -> null', parseRequestedQuantity('berapa harga plesteran?') === null);
  check('jarak 10 m dari jalan -> null (bukan volume)', parseRequestedQuantity('rumah 10 m dari jalan') === null);
  check('nol -> null', parseRequestedQuantity('plesteran 0 m2') === null);
}

console.log('=== 4. Rencana transfer kasus live: hanya item teratas, harga resolver ===');
{
  const codes = extractAhspCodesFromAnswer(LIVE_ANSWER);
  const plan = buildAnswerTransfer(codes, parseRequestedQuantity(LIVE_USER_TEXT));
  check('live -> tepat 1 item ditransfer', plan.items.length === 1, `${plan.items.length} item`);
  check('live -> topCode 3.7.1', plan.topCode === '3.7.1', plan.topCode ?? '(null)');
  check('live -> 7 alternatif dilewati (bukan ditransfer)', plan.skippedAlternatives === 7, `${plan.skippedAlternatives}`);
  const it = plan.items[0];
  check('live -> volume 10 dari pesan pengguna', it?.volume === 10, String(it?.volume));
  check('live -> satuan m2', it?.unit === 'm2', it?.unit ?? '(kosong)');
  check(
    'live -> harga resolver Rp 61.465 (bukan angka teks jawaban)',
    it?.unitPrice === 61465,
    String(it?.unitPrice),
  );
  check('live -> PRICE_RESOLVED (komposisi FULL)', it?.priceStatus === 'PRICE_RESOLVED', it?.priceStatus ?? '');
  check('live -> kind OFFICIAL_AHSP', it?.priceSourceKind === 'OFFICIAL_AHSP', it?.priceSourceKind ?? '');
  check('live -> VERIFIED', it?.verificationStatus === 'VERIFIED', it?.verificationStatus ?? '');
  check('live -> ahspCode 3.7.1', it?.ahspCode === '3.7.1', it?.ahspCode ?? '');
  check(
    'live -> deskripsi judul biasa tanpa awalan [Chat AI]',
    (it?.description ?? '').startsWith('Pemasangan 1 m2 Plesteran') &&
      !(it?.description ?? '').includes('[Chat AI]'),
    (it?.description ?? '').slice(0, 60),
  );
  check('live -> volumeSource AI_GENERATED', it?.volumeSource === 'AI_GENERATED', it?.volumeSource ?? '');
  check('live -> tanpa kode tak dikenal', plan.unknownCodes.length === 0, plan.unknownCodes.join(','));
  check('live -> tanpa mismatch satuan', plan.unitMismatchCodes.length === 0, plan.unitMismatchCodes.join(','));
}

console.log('=== 5. Tanpa volume -> tidak ada item (tidak pernah dikarang) ===');
{
  const plan = buildAnswerTransfer(['3.7.4'], null);
  check('quantity null -> 0 item', plan.items.length === 0);
  check('quantity null -> topCode null', plan.topCode === null);
  const plan2 = buildAnswerTransfer(['3.7.4'], parseRequestedQuantity('berapa harga plesteran?'));
  check('pesan tanpa volume -> 0 item', plan2.items.length === 0);
}

console.log('=== 6. Kode tak dikenal dilewati, jatuh ke kode berikutnya ===');
{
  const plan = buildAnswerTransfer(['9.9.9.9', '3.7.4'], { volume: 10, unit: 'm2' });
  check('kode palsu -> topCode jatuh ke 3.7.4', plan.topCode === '3.7.4', plan.topCode ?? '(null)');
  check('kode palsu -> dilaporkan unknown', plan.unknownCodes.includes('9.9.9.9'), plan.unknownCodes.join(','));
  check('kode palsu -> 1 item', plan.items.length === 1);
  const allFake = buildAnswerTransfer(['9.9.9.9', '8.8.8.8'], { volume: 10, unit: 'm2' });
  check('semua palsu -> 0 item', allFake.items.length === 0);
  check('semua palsu -> keduanya unknown', allFake.unknownCodes.length === 2);
}

console.log('=== 7. Satuan tidak cocok -> dilewati tanpa konversi diam-diam ===');
{
  const plan = buildAnswerTransfer(['3.7.4'], { volume: 5, unit: 'm3' });
  check('m2 vs m3 -> 0 item', plan.items.length === 0);
  check('m2 vs m3 -> dilaporkan mismatch', plan.unitMismatchCodes.includes('3.7.4'), plan.unitMismatchCodes.join(','));
  // Jatuh ke kode berikutnya yang satuannya cocok.
  const plan2 = buildAnswerTransfer(['3.7.4', 'A.2.01.b1.1'], { volume: 5, unit: 'm3' });
  check('mismatch lalu cocok -> topCode A.2.01.b1.1', plan2.topCode === 'A.2.01.b1.1', plan2.topCode ?? '(null)');
}

console.log('=== 8. Kejujuran status harga: parsial & belum tersedia ===');
{
  const partial = buildAnswerTransfer(['A.2.01.b1.1'], { volume: 1, unit: 'm3' });
  const p = partial.items[0];
  check('PARTIAL 2/3 -> PRICE_ESTIMATED (bukan RESOLVED)', p?.priceStatus === 'PRICE_ESTIMATED', p?.priceStatus ?? '');
  check('PARTIAL -> NEEDS_VERIFICATION', p?.verificationStatus === 'NEEDS_VERIFICATION', p?.verificationStatus ?? '');
  check('PARTIAL -> harga Rp 63.720', p?.unitPrice === 63720, String(p?.unitPrice));
  check('PARTIAL -> label menyebut parsial', (p?.priceSourceLabel ?? '').includes('parsial'), p?.priceSourceLabel ?? '');
  const missing = buildAnswerTransfer(['A.1.02.4a.1.b'], { volume: 1, unit: 'm3' });
  const m = missing.items[0];
  check('UNAVAILABLE -> PRICE_UNRESOLVED', m?.priceStatus === 'PRICE_UNRESOLVED', m?.priceStatus ?? '');
  check('UNAVAILABLE -> tanpa unitPrice (bukan Rp0)', m?.unitPrice === undefined, String(m?.unitPrice));
  check('UNAVAILABLE -> kind UNRESOLVED', m?.priceSourceKind === 'UNRESOLVED', m?.priceSourceKind ?? '');
}

console.log('=== 9. Alur keputusan handler (stub pesan, tanpa React/store) ===');
{
  const messages = [
    { role: 'user', content: 'halo' },
    { role: 'assistant', content: 'Halo! Ada yang bisa saya bantu?' },
    { role: 'user', content: LIVE_USER_TEXT },
    { role: 'assistant', content: LIVE_ANSWER },
  ];
  const userText = findPrecedingUserText(messages, 3);
  check('pesan pengguna sebelumnya ditemukan', userText === LIVE_USER_TEXT, userText ?? '(null)');
  const plan = buildAnswerTransfer(
    extractAhspCodesFromAnswer(messages[3].content),
    parseRequestedQuantity(userText),
  );
  check('alur stub -> 1 item 3.7.1 volume 10', plan.items.length === 1 && plan.topCode === '3.7.1' && plan.items[0].volume === 10);
  check(
    'tanpa pesan pengguna sebelumnya -> null',
    findPrecedingUserText([{ role: 'assistant', content: 'x' }], 0) === null,
  );
  // mapAnswerItemsToPushItems (semua kode) tetap tersedia untuk calon multi-pick.
  const all = mapAnswerItemsToPushItems(['3.7.1', '3.7.4'], { volume: 10, unit: 'm2' });
  check('map semua kode -> 2 item', all.items.length === 2, `${all.items.length}`);
}

console.log(`\n=== HASIL: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) process.exit(1);

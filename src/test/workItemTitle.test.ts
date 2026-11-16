/**
 * Regresi perintah owner 16 Nov 2026: awalan "[Chat AI] " dihapus dari
 * uraian hasil Chat AI — judul biasa dengan kapital awal kata.
 *
 * Cara jalan: npx --yes tsx src/test/workItemTitle.test.ts
 * Exit 0 = semua lulus.
 */
import { formatWorkItemTitle, stripChatAiPrefix } from '../ai-tools/ezrab-ai/workItemTitle';

let pass = 0;
let fail = 0;
function check(name: string, actual: string, expected: string) {
  if (actual === expected) {
    pass++;
  } else {
    fail++;
    console.log(`  ✗ ${name}\n    dapat:    ${JSON.stringify(actual)}\n    diharapkan: ${JSON.stringify(expected)}`);
  }
}

console.log('=== stripChatAiPrefix ===');
check('buang satu awalan', stripChatAiPrefix('[Chat AI] Pembersihan Lapangan'), 'Pembersihan Lapangan');
check('buang awalan ganda', stripChatAiPrefix('[Chat AI] [Chat AI] Galian Tanah'), 'Galian Tanah');
check('tanpa awalan tidak berubah', stripChatAiPrefix('Pembersihan Lapangan'), 'Pembersihan Lapangan');
check('awalan di tengah tidak dibuang', stripChatAiPrefix('Pekerjaan [Chat AI] Lainnya'), 'Pekerjaan [Chat AI] Lainnya');
check('teks kosong', stripChatAiPrefix(''), '');
check('hanya awalan', stripChatAiPrefix('[Chat AI] '), '');

console.log('=== formatWorkItemTitle: kasus screenshot owner ===');
check(
  'pembersihan',
  formatWorkItemTitle('[Chat AI] Pembersihan dan Perataan Lapangan Proyek'),
  'Pembersihan dan Perataan Lapangan Proyek',
);
check(
  'bouwplank',
  formatWorkItemTitle('[Chat AI] Pengukuran dan Pemasangan Bouwplank / Bowplank Kayu'),
  'Pengukuran dan Pemasangan Bouwplank / Bowplank Kayu',
);
check(
  'galian s.d',
  formatWorkItemTitle('[Chat AI] Galian Tanah Pondasi Batu Kali (Kedalaman s.d 1m)'),
  'Galian Tanah Pondasi Batu Kali (Kedalaman s.d 1m)',
);
check(
  'urungan cm',
  formatWorkItemTitle('[Chat AI] Urungan Pasir Bawah Pondasi Tebal 5 cm'),
  'Urungan Pasir Bawah Pondasi Tebal 5 cm',
);
check(
  'pasangan 1:5',
  formatWorkItemTitle('[Chat AI] Pasangan Pondasi Batu Kali Belah 1:5'),
  'Pasangan Pondasi Batu Kali Belah 1:5',
);

console.log('=== formatWorkItemTitle: kapitalisasi ===');
check('huruf kecil semua', formatWorkItemTitle('pembersihan dan perataan lapangan'), 'Pembersihan dan Perataan Lapangan');
check('huruf besar semua', formatWorkItemTitle('PEMBERSIHAN DAN PERATAAN LAPANGAN'), 'Pembersihan dan Perataan Lapangan');
check('plesteran katalog', formatWorkItemTitle('Pemasangan 1 m2 plesteran 1SP:1PP tebal 15 mm'), 'Pemasangan 1 m2 Plesteran 1SP:1PP Tebal 15 mm');
check('akronim dipertahankan', formatWorkItemTitle('pembuatan rab dan gambar ded dengan ac'), 'Pembuatan RAB dan Gambar DED dengan AC');
check('satuan tetap kecil', formatWorkItemTitle('pengecatan dinding 10 m2 tebal 2 mm'), 'Pengecatan Dinding 10 m2 Tebal 2 mm');
check('campuran spasi', formatWorkItemTitle('  galian   tanah  pondasi  '), 'Galian Tanah Pondasi');
check('slash KM/WC', formatWorkItemTitle('plafon km/wc tebal 9 mm'), 'Plafon KM/WC Tebal 9 mm');
check('dimensi 25x25', formatWorkItemTitle('pemasangan keramik 25x25 cm'), 'Pemasangan Keramik 25x25 cm');
check('teks kosong', formatWorkItemTitle(''), '');
check('kata pertama penghubung', formatWorkItemTitle('dan lain-lain'), 'Dan Lain-Lain');

console.log(`\nworkItemTitle: ${pass} lulus, ${fail} gagal`);
if (fail > 0) process.exit(1);

/**
 * EZRAB — P0 AHSP 2026 LIVE PRICE INTEGRITY REGRESSION SUITE (2026-10-26)
 *
 * Mengunci perbaikan dari audit P0 "Live Price Integrity" (laporan RAB Hotmix
 * 10 km, Preview commit 23e383d). Setiap angka di sini direproduksi dari HEAD
 * sebelum perbaikan, lalu diverifikasi ulang sesudah perbaikan.
 *
 * Yang TIDAK dibuktikan suite ini (perlu QA browser/manual):
 * - rendering picker "AHSP 2026 / PUPR" dan nota inspector di UI;
 * - harga DHSP total sebagai harga RAB (bukan definisi spreadsheet — spreadsheet
 *   tetap memakai biaya langsung hasil resolver, lihat getAhspDirectPrice);
 * - kelengkapan komponen master BM (material dominan Laston/prime/tack yang
 *   hilang dari daftar komponen — status: terbukti, belum diperbaiki di P0).
 *
 * Jalankan: npx --yes tsx src/test/ahspLivePriceIntegrity.test.ts
 */
import { strict as assert } from 'assert';
import { officialAhspRepository } from '../data/nationalCostDatabase/officialAhspRepository';
import { isQuarantined } from '../data/nationalCostDatabase/ahspQuarantine';
import {
  OFFICIAL_BM_2026_DHSP_MAP,
  OFFICIAL_BM_2026_EQUIPMENT,
} from '../data/nationalCostDatabase/binaMarga2026Adapter';
import { priceResolver2026 } from '../data/priceDatabase2026/resolver';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: string) {
  if (cond) {
    pass++;
    console.log(`  PASS ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

// ---------------------------------------------------------------------------
// 1. Baris korup E.2–E.8 dikarantina (48 komponen sentinel koef 5 / harga 2 /
//    amount 3 + nama berisi angka tersangkut) dan hilang dari jalur harga.
// ---------------------------------------------------------------------------
console.log('1. Karantina E.2–E.8');
for (const code of ['E.2', 'E.3', 'E.4', 'E.5', 'E.6', 'E.7', 'E.8']) {
  check(`${code} isQuarantined`, isQuarantined(code) === true);
  check(`${code} getOfficialAhsp undefined`, officialAhspRepository.getOfficialAhsp(code) === undefined);
  check(`${code} tidak di DHSP map`, OFFICIAL_BM_2026_DHSP_MAP.get(code) === undefined);
}
const activeCodes = new Set(officialAhspRepository.getActiveOfficialAhsp().map((i) => i.code));
for (const code of ['E.2', 'E.3', 'E.4', 'E.5', 'E.6', 'E.7', 'E.8']) {
  check(`${code} tidak di getActiveOfficialAhsp`, !activeCodes.has(code));
}
check(
  'tidak ada record equipment BM berharga 2 (sentinel) di indeks',
  !OFFICIAL_BM_2026_EQUIPMENT.some((e) => e.price === 2),
);

// ---------------------------------------------------------------------------
// 2. Resource E13/E19 kembali ke harga sewa alat yang benar (sebelum perbaikan
//    keduanya resolve ke Rp 2 karena record sentinel menang lewat tiebreak id
//    string: "PRC-BM2026-E-102" < "PRC-BM2026-E-40").
// ---------------------------------------------------------------------------
console.log('2. Resource E13/E19');
const e13 = priceResolver2026.resolveResourcePrice({
  resourceCode: 'E13',
  resourceName: 'jam Motor Grader',
  resourceType: 'equipment',
  unit: 'jam',
  domain: 'BINA_MARGA',
});
check('E13 = 597583.41', e13.price === 597583.41, `dapat ${e13.price}`);
const e19 = priceResolver2026.resolveResourcePrice({
  resourceCode: 'E19',
  resourceName: 'jam Vibratory Roller',
  resourceType: 'equipment',
  unit: 'jam',
  domain: 'BINA_MARGA',
});
check('E19 = 371707.19', e19.price === 371707.19, `dapat ${e19.price}`);

// ---------------------------------------------------------------------------
// 3. E.1 membaik (sebelum: 506844 karena E13/E19 = Rp 2; sesudah: 518308).
//    Definisi spreadsheet TIDAK berubah: tetap biaya langsung hasil resolver.
// ---------------------------------------------------------------------------
console.log('3. E.1 Lapis Fondasi Agregat Kelas A');
const e1 = officialAhspRepository.getOfficialAhsp('E.1')!;
const e1c = priceResolver2026.resolveAhspUnitPrice(e1);
check('E.1 unitPrice = 518308', e1c.unitPrice === 518308, `dapat ${e1c.unitPrice}`);
check('E.1 labor = 1301.15', e1c.labor.subtotalPerUnit === 1301.15, `dapat ${e1c.labor.subtotalPerUnit}`);
check('E.1 material = 436441.03', e1c.material.subtotalPerUnit === 436441.03, `dapat ${e1c.material.subtotalPerUnit}`);
check('E.1 equipment = 80565.53', e1c.equipment.subtotalPerUnit === 80565.53, `dapat ${e1c.equipment.subtotalPerUnit}`);
check('E.1 officialDhspPrice = 570185.84', e1c.officialDhspPrice === 570185.84, `dapat ${e1c.officialDhspPrice}`);

// ---------------------------------------------------------------------------
// 4. Harga spreadsheet (unitPrice resolver) TIDAK berubah untuk item sehat;
//    yang berubah hanya harga DHSP resmi (hspPrice/officialDhspPrice) yang
//    sebelumnya selalu null untuk item BM karena peta DHSP bernilai number
//    tapi dibaca sebagai objek (.unitPrice), plus provenance "(undefined)".
// ---------------------------------------------------------------------------
console.log('4. Definisi spreadsheet tidak berubah; DHSP resmi kini terbaca');
const cases: Array<[string, number, number]> = [
  // [kode, unitPrice spreadsheet (tetap), DHSP resmi (dulu null)]
  ['F.27', 374772, 700221.03],
  ['F.22', 382402, 706623.36],
  ['F.1', 1333, 22131.35],
  ['F.2', 1654, 24255.91],
  ['I.44', 912509, 1003755.73],
  ['I.64', 350368, 1009312.09],
  ['I.95', 473298, 520797.75],
  ['I.124', 342900, 532397.38],
];
for (const [code, unitPrice, dhsp] of cases) {
  const item = officialAhspRepository.getOfficialAhsp(code)!;
  const comp = priceResolver2026.resolveAhspUnitPrice(item);
  check(`${code} unitPrice tetap ${unitPrice}`, comp.unitPrice === unitPrice, `dapat ${comp.unitPrice}`);
  check(`${code} officialDhspPrice = ${dhsp}`, comp.officialDhspPrice === dhsp, `dapat ${comp.officialDhspPrice}`);
  check(`${code} hspPrice = ${dhsp}`, comp.hspPrice === dhsp, `dapat ${comp.hspPrice}`);
  check(
    `${code} provenance menyebut Lampiran V, bukan undefined`,
    !!comp.provenanceSource && comp.provenanceSource.includes('Lampiran V') && !comp.provenanceSource.includes('undefined'),
    `dapat ${comp.provenanceSource}`,
  );
}

// ---------------------------------------------------------------------------
// 5. Satuan I.44/I.64 yang kacau kini terkoreksi lewat overlay deskripsi
//    (sumber: master audit kanonis SE 47/2026 Lampiran V hal. 1824/1877).
// ---------------------------------------------------------------------------
console.log('5. Koreksi satuan I.44/I.64');
const i44 = officialAhspRepository.getOfficialAhsp('I.44')!;
check('I.44 unit = Meter Persegi', i44.unit === 'Meter Persegi', `dapat ${i44.unit}`);
const i64 = officialAhspRepository.getOfficialAhsp('I.64')!;
check('I.64 unit = Buah', i64.unit === 'Buah', `dapat ${i64.unit}`);
check(
  'I.64 name = uraian kanonis lengkap',
  i64.name === 'Engineering Grade, Ukuran Sedang Rambu Peringatan/Larangan/Perintah, Tunggal,',
  `dapat ${i64.name}`,
);

// ---------------------------------------------------------------------------
// P0.1 — Karantina case-insensitive (validasi pra-push 2026-10-27).
// Temuan: isQuarantined membandingkan exact-case, sementara lookup byCode
// mengecilkan huruf query — getOfficialAhsp('e.2') mengembalikan item korup,
// dan WorkItemInspectorDrawer mengecilkan huruf kode sebelum lookup
// (cleanCode = ...toLowerCase()), sehingga item lama berkode E.2 yang dibuka
// di drawer memuat komponen sampah dan bisa tersimpan.
// Kode E.2–E.8 hanya mengandung satu huruf, jadi bentuk huruf-kecil sudah
// menghabiskan semua variasi kapitalisasi untuk ketujuh kode ini.
// ---------------------------------------------------------------------------
console.log('P0.1. Karantina case-insensitive');
import { getQuarantineRecord } from '../data/nationalCostDatabase/ahspQuarantine';
for (const code of ['E.2', 'E.3', 'E.4', 'E.5', 'E.6', 'E.7', 'E.8']) {
  const lower = code.toLowerCase();
  check(`${code} isQuarantined(huruf kecil)`, isQuarantined(lower) === true);
  check(
    `${code} getOfficialAhsp(huruf kecil) undefined`,
    officialAhspRepository.getOfficialAhsp(lower) === undefined,
  );
  check(`${code} hasOfficialAhsp(huruf kecil) false`, officialAhspRepository.hasOfficialAhsp(lower) === false);
  check(`${code} getQuarantineRecord(huruf kecil) ada`, getQuarantineRecord(lower)?.code === code);
}
const activeAll = officialAhspRepository.getActiveOfficialAhsp();
check('jumlah katalog aktif tidak berubah (5725)', activeAll.length === 5725, `dapat ${activeAll.length}`);
check(
  'jumlah katalog aktif Bina Marga tidak berubah (1130)',
  activeAll.filter((i) => i.domain === 'BINA_MARGA').length === 1130,
);
for (const q of ['E.2', 'e.2']) {
  const hits = officialAhspRepository.searchOfficialAhsp(q, { limit: 50 }).map((h) => h.item.code);
  check(
    `pencarian kode "${q}" tidak menawarkan item karantina`,
    !hits.some((c) => ['E.2', 'E.3', 'E.4', 'E.5', 'E.6', 'E.7', 'E.8'].includes(c)),
  );
}
check(
  'harga kanonis lain tidak berubah (E.1 direct tetap 518308)',
  priceResolver2026.resolveAhspUnitPrice(officialAhspRepository.getOfficialAhsp('E.1')!).unitPrice === 518308,
);
check(
  'harga kanonis lain tidak berubah (F.27 direct tetap 374772)',
  priceResolver2026.resolveAhspUnitPrice(officialAhspRepository.getOfficialAhsp('F.27')!).unitPrice === 374772,
);

console.log(`\n${pass} lulus, ${fail} gagal`);
if (fail > 0) process.exit(1);

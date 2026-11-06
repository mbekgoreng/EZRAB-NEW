/**
 * Test database wilayah asli (data/wilayah.ts) — 2026-11-06.
 * Cakupan: kelengkapan & integritas rantai kode Kemendagri, rantai
 * Probolinggo end-to-end (provinsi→kab/kota→kecamatan→desa), pencocokan
 * nilai lama teks bebas, dan kompatibilitas nama provinsi dengan
 * indonesiaRegions (basis resolusi indeks harga). Via tsx.
 */
import {
  getProvinces,
  getRegencies,
  getDistricts,
  getVillages,
  loadAllVillages,
  matchProvinceByName,
  matchRegencyByName,
  matchDistrictByName,
  matchVillageByName,
  WILAYAH_COUNTS,
} from '../data/wilayah';
import { INDONESIA_PROVINCES as LEGACY_PROVINCES } from '../data/indonesiaRegions';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass += 1; console.log(`  PASS ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name}`); }
}

async function main() {
  console.log('== Kelengkapan data ==');
  check('38 provinsi', WILAYAH_COUNTS.provinces === 38);
  check('514 kabupaten/kota', WILAYAH_COUNTS.regencies === 514);
  check('7.285 kecamatan', WILAYAH_COUNTS.districts === 7285);
  const villages = await loadAllVillages();
  check('83.762 desa/kelurahan', villages.length === 83762);
  check('semua kode unik per level',
    new Set(getProvinces().map((p) => p.code)).size === 38 &&
    new Set(getRegencies('35').map((r) => r.code)).size === getRegencies('35').length &&
    new Set(villages.map((v) => v.code)).size === villages.length);

  console.log('== Rantai Probolinggo (domisili owner) ==');
  const jt = matchProvinceByName('Jawa Timur');
  check('Jawa Timur = kode 35', jt?.code === '35');
  check('38 kab/kota di Jawa Timur', getRegencies('35').length === 38);
  const kab = matchRegencyByName('Probolinggo', '35');
  check('"Probolinggo" (teks lama tanpa prefiks) → Kabupaten Probolinggo 35.13',
    kab?.code === '35.13' && kab?.name === 'Kabupaten Probolinggo');
  const kota = matchRegencyByName('Kota Probolinggo', '35');
  check('"Kota Probolinggo" → 35.74 (kota, bukan kabupaten)', kota?.code === '35.74');
  const kec = kab ? matchDistrictByName('Kraksaan', kab.code) : undefined;
  check('Kraksaan = 35.13.14', kec?.code === '35.13.14');
  const desa = kec ? await matchVillageByName('Kraksaan Wetan', kec.code) : undefined;
  check('Desa Kraksaan Wetan ketemu di Kraksaan', !!desa && desa.parentCode === '35.13.14');
  const desaList = kec ? await getVillages(kec.code) : [];
  check('Kraksaan punya >10 desa/kelurahan', desaList.length > 10);

  console.log('== Pencocokan nilai lama ==');
  check('huruf kecil "jawa timur" tetap cocok', matchProvinceByName('jawa timur')?.code === '35');
  check('"jawa" saja TIDAK dicocokkan paksa (tidak ada provinsi bernama itu)',
    matchProvinceByName('jawa') === undefined);
  check('nama ngawur tidak cocok', matchRegencyByName('Kota Fiktif', '35') === undefined);
  check('kabupaten lintas provinsi tidak bocor: "Probolinggo" di provinsi 31 tidak ketemu',
    matchRegencyByName('Probolinggo', '31') === undefined);

  console.log('== Kompatibilitas resolusi harga (nama provinsi) ==');
  const legacyNames = new Set(LEGACY_PROVINCES.map((p) => p.name));
  const newNames = getProvinces().map((p) => p.name);
  const missing = newNames.filter((n) => !legacyNames.has(n));
  const extra = LEGACY_PROVINCES.map((p) => p.name).filter((n) => !newNames.includes(n));
  check('satu-satunya beda nama = Jakarta resmi vs DKI Jakarta (teralias)',
    missing.length === 1 && missing[0] === 'Daerah Khusus Ibukota Jakarta' &&
    extra.length === 1 && extra[0] === 'DKI Jakarta');
  const { findProvinceByName, resolveRegionIndex } = await import('../data/indonesiaRegions');
  check('findProvinceByName("Daerah Khusus Ibukota Jakarta") → DKI Jakarta',
    findProvinceByName('Daerah Khusus Ibukota Jakarta')?.name === 'DKI Jakarta');
  const res = resolveRegionIndex('Daerah Khusus Ibukota Jakarta');
  check('resolveRegionIndex Jakarta resmi: indeks 1,00 & BUKAN fallback',
    res.index === 1.0 && res.isFallback === false && res.region === 'DKI Jakarta');
  const resJatim = resolveRegionIndex('Jawa Timur');
  check('resolveRegionIndex Jawa Timur tetap teresolusi dari namanya',
    resJatim.province === 'Jawa Timur' && typeof resJatim.index === 'number');

  console.log(`\nTOTAL: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
}

main();

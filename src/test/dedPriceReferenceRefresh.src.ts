/**
 * SPRINT 5 Workstream D — Refresh referensi harga terkurasi: status
 * kejujuran pasca-upaya riset ulang.
 *
 * Run: npx esbuild src/test/dedPriceReferenceRefresh.src.ts --bundle
 *      --platform=node --format=cjs
 *      --outfile=/home/hatch/workspace/.ded-sprint5-bundles/dedPriceReferenceRefresh.cjs
 *      && node /home/hatch/workspace/.ded-sprint5-bundles/dedPriceReferenceRefresh.cjs
 *
 * KONTEKS JUJUR: upaya riset ulang Sprint 5 (2026-11-10) TIDAK
 * menghasilkan satu pun verifikasi halaman-sumber: perkakas
 * browser.open gagal total (layanan browser error pada 4 domain
 * independen), sehingga menurut aturan program — hanya halaman yang
 * benar-benar dibuka yang boleh menjadi bukti — TIDAK ADA referensi
 * yang ter-refresh. Konsekuensinya terpin di sini:
 * - Semua 13 record historis UTUH (harga, sumber, tanggal tak berubah).
 * - accessedAt TIDAK diperpanjang artifisial: tetap 2026-11-10 dengan
 *   sourceDate 2026-10-22.
 * - Klasifikasi kesegaran dari tanggal AKTUAL: FRESH sampai 2026-12-10,
 *   STALE sesudahnya; daftar revalidasi memuat 13 record terkurasi.
 * - Provenans basis Jakarta tetap null; tier OFFICIAL_SSH_HSPK tetap
 *   kosong; layanan kanonis tidak mengubah resolver.
 * Lihat docs/audits/DED_SPRINT_5_PRICE_REFERENCE_REFRESH.md.
 */
import {
  EXTERNAL_PRICE_REFERENCES, EXTERNAL_REFERENCES_ACCESSED_AT, findExternalReference,
} from '../ai-tools/ded-ai-estimate/externalPriceReferences';
import {
  listCanonicalReferences, canonicalFreshness, referencesNeedingRevalidation,
  OFFICIAL_SSH_HSPK_REFERENCES,
} from '../ai-tools/ded-ai-estimate/canonicalPriceReferenceService';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('== D-a: record historis terpreservasi persis (refresh BLOCKED, bukan diganti) ==');
check('D-a1 tetap 13 famili terkurasi', EXTERNAL_PRICE_REFERENCES.length === 13);
check('D-a2 accessedAt TIDAK diperpanjang artifisial (tetap 2026-11-10)',
  EXTERNAL_REFERENCES_ACCESSED_AT === '2026-11-10'
  && EXTERNAL_PRICE_REFERENCES.every((r) => r.accessedAt === '2026-11-10'));
check('D-a3 sourceDate historis tetap 2026-10-22 untuk semua record',
  EXTERNAL_PRICE_REFERENCES.every((r) => r.sourceDate === '2026-10-22'));
check('D-a4 harga rekomendasi historis utuh (spot-check 3 famili)',
  EXTERNAL_PRICE_REFERENCES.find((r) => r.id === 'ext-rangka-baja-ringan')?.recommendedPrice === 165000
  && EXTERNAL_PRICE_REFERENCES.find((r) => r.id === 'ext-pintu-p1-double-hpl')?.recommendedPrice === 3500000
  && EXTERNAL_PRICE_REFERENCES.find((r) => r.id === 'ext-phb-box-mcb')?.recommendedPrice === 425000);
check('D-a5 setiap record mempertahankan URL + nama sumber aslinya',
  EXTERNAL_PRICE_REFERENCES.every((r) => typeof r.sourceUrl === 'string' && r.sourceUrl.length > 0
    && typeof r.sourceName === 'string' && r.sourceName.length > 0));

console.log('== D-b: kesegaran berbasis tanggal AKTUAL ==');
const ext = listCanonicalReferences().filter((r) => r.origin === 'EXTERNAL_CURATED');
check('D-b1 pada 2026-11-10 (hari akses) semua terkurasi FRESH',
  ext.every((r) => canonicalFreshness(r, new Date('2026-11-10T00:00:00Z')) === 'FRESH'));
check('D-b2 pada 2026-12-10 (batas TTL 30 hari) masih FRESH',
  ext.every((r) => canonicalFreshness(r, new Date('2026-12-10T00:00:00Z')) === 'FRESH'));
check('D-b3 pada 2026-12-11 semua terkurasi STALE serentak (jurang kebasian)',
  ext.every((r) => canonicalFreshness(r, new Date('2026-12-11T00:00:00Z')) === 'STALE'));
const worklist = referencesNeedingRevalidation(new Date('2026-12-11T00:00:00Z'));
check('D-b4 daftar kerja revalidasi memuat 13 record terkurasi sesudah tenggat',
  ext.every((r) => worklist.stale.some((w) => w.id === r.id)), `stale=${worklist.stale.length} unknown=${worklist.unknownFreshness.length}`);

console.log('== D-c: provenans & hierarki tidak dikarang ==');
const jkt = listCanonicalReferences().filter((r) => r.origin === 'JAKARTA_2026_TABLE');
check('D-c1 provenans Jakarta: URL sumber null untuk semua; accessedAt hanya null atau tanggal riset yang dinyatakan basisnya sendiri (tidak dipinjam dari basis eksternal)',
  jkt.every((r) => r.sourceUrl === null) && jkt.every((r) => r.accessedAt === null || r.accessedAt === '2026-11-10'));
check('D-c2 tier OFFICIAL_SSH_HSPK tetap KOSONG by design', OFFICIAL_SSH_HSPK_REFERENCES.length === 0);
check('D-c3 tidak ada record terkurasi yang mengklaim tier resmi AHSP/SSH',
  ext.every((r) => r.hierarchyTier !== 'OFFICIAL_AHSP' && r.hierarchyTier !== 'OFFICIAL_SSH_HSPK'));

console.log('== D-d: resolver deterministik tidak berubah perilakunya ==');
const resolved = findExternalReference('Pekerjaan Rangka Atap Baja Ringan', 'm2');
check('D-d1 resolver tetap menyelesaikan referensi yang sama seperti sebelum sprint',
  resolved?.id === 'ext-rangka-baja-ringan' && resolved?.recommendedPrice === 165000);
const unresolved = findExternalReference('Pekerjaan Rangka Atap Baja Ringan', 'unit');
check('D-d2 ketidakcocokan satuan tetap tak terpecahkan (null)', unresolved === null);

console.log(`\nHASIL: ${passed} PASS / ${failed} FAIL`);
if (failed > 0) process.exit(1);

/**
 * REGRESI LAYANAN REFERENSI HARGA KANONIS — DED (Sprint 4, Tugas C).
 *
 * Run: npx esbuild src/test/dedCanonicalReferenceService.src.ts --bundle
 *      --platform=node --format=cjs
 *      --outfile=~/workspace/.ded-sprint4-bundles/dedCanonicalReferenceService.cjs
 *      && node ~/workspace/.ded-sprint4-bundles/dedCanonicalReferenceService.cjs
 *
 * Mengunci kontrak lapisan ADITIF:
 * - Penyatuan baca 13 eksternal + 49 Jakarta = 62 record, id unik.
 * - Pemetaan setia: harga/URL/tanggal basis eksternal tidak berubah;
 *   field yang tidak ada di basis Jakarta = null (TAK DIKETAHUI),
 *   tidak dipinjam dari basis lain, tidak difabrikasi.
 * - Hierarki tetap; tier OFFICIAL_SSH_HSPK KOSONG by design.
 * - Kesegaran jujur: basi serentak sesudah 2026-12-10 untuk record
 *   bertanggal akses 2026-11-10; entri tanpa tanggal = UNKNOWN, tidak
 *   pernah diperpanjang artifisial.
 * - Tumpang tindih lintas basis terdeteksi sebagai kandidat audit;
 *   basis asal tidak termutasi oleh layanan.
 */
import {
  listCanonicalReferences, getCanonicalReferenceById, canonicalFreshness,
  referencesNeedingRevalidation, findCrossBaseOverlaps,
  CANONICAL_PRICE_HIERARCHY, OFFICIAL_SSH_HSPK_REFERENCES,
} from '../ai-tools/ded-ai-estimate/canonicalPriceReferenceService';
import { EXTERNAL_PRICE_REFERENCES } from '../ai-tools/ded-ai-estimate/externalPriceReferences';
import { JAKARTA_2026_PRICES } from '../ai-tools/ded-full-ai/jakartaPrices';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const all = listCanonicalReferences();
const ext = all.filter((r) => r.origin === 'EXTERNAL_CURATED');
const jkt = all.filter((r) => r.origin === 'JAKARTA_2026_TABLE');

console.log('== A. Inventaris terpadu ==');
check('A1 total 62 record (13 eksternal + 49 Jakarta)',
  all.length === 62 && ext.length === 13 && jkt.length === 49,
  `total=${all.length} ext=${ext.length} jkt=${jkt.length}`);
check('A2 semua id unik', new Set(all.map((r) => r.id)).size === 62);
check('A3 basis asal utuh (tidak termutasi layanan)',
  EXTERNAL_PRICE_REFERENCES.length === 13 && JAKARTA_2026_PRICES.length === 49);
check('A4 lookup by id bekerja untuk kedua basis',
  getCanonicalReferenceById('ext-rangka-baja-ringan')?.price === 165000
  && (() => { const g = jkt.find((r) => r.description === 'Galian tanah biasa'); return g != null && getCanonicalReferenceById(g.id)?.price === 85000; })());

console.log('== B. Kesetiaan pemetaan ==');
check('B1 pemetaan eksternal setia 1:1 (harga, rentang, URL, tanggal, tier)',
  EXTERNAL_PRICE_REFERENCES.every((src) => {
    const c = ext.find((r) => r.id === src.id)!;
    return c.price === src.recommendedPrice && c.rangeMin === src.rangeMin && c.rangeMax === src.rangeMax
      && c.sourceUrl === src.sourceUrl && c.sourceDate === src.sourceDate && c.accessedAt === src.accessedAt
      && c.unit === src.unit && c.region === src.region && c.confidence === src.confidence
      && c.hierarchyTier === (src.tier === 'SUPPLIER_MANUFACTURER' ? 'VERIFIED_SUPPLIER' : 'MARKET_REFERENCE');
  }));
check('B2 Jakarta: field tak diketahui = null (URL, tanggal data, rentang, keyakinan, kata kunci)',
  jkt.every((r) => r.sourceUrl === null && r.sourceDate === null && r.rangeMin === null
    && r.rangeMax === null && r.confidence === null && r.matchKeywords === null));
check('B3 Jakarta: tepat 12 entri bertanggal akses 2026-11-10 (yang catatan sumbernya menyatakan riset itu); 37 null',
  jkt.filter((r) => r.accessedAt === '2026-11-10').length === 12
  && jkt.filter((r) => r.accessedAt === null).length === 37);
check('B4 Jakarta: tier plafon MARKET_REFERENCE walau selaras entri supplier; satuan m1 ternormalisasi m\'',
  jkt.every((r) => r.hierarchyTier === 'MARKET_REFERENCE')
  && jkt.find((r) => r.description.startsWith('Nok spandek'))?.normalizedUnit === "m'"
  && jkt.find((r) => r.description.startsWith('Nok spandek'))?.unit === 'm1');
check('B5 spesifikasi terstruktur terparse pada model kanonis (beton K-350, cat 2 lapis, gypsum 9 mm)',
  jkt.find((r) => r.description.includes('K-350'))?.structuredSpec.attributes.concreteK?.[0] === '350'
  && jkt.find((r) => r.description.includes('Pengecatan dinding'))?.structuredSpec.attributes.paintCoats?.[0] === '2'
  && ext.find((r) => r.id === 'ext-plafon-gypsum-hollow')?.structuredSpec.attributes.gypsumBoardThicknessMm?.[0] === '9');

console.log('== C. Hierarki & kesegaran ==');
check('C1 hierarki persis AHSP → SSH/HSPK → VERIFIED_SUPPLIER → MARKET_REFERENCE → AI_ESTIMATE → UNRESOLVED',
  CANONICAL_PRICE_HIERARCHY.join('>') === 'OFFICIAL_AHSP>OFFICIAL_SSH_HSPK>VERIFIED_SUPPLIER>MARKET_REFERENCE>AI_ESTIMATE>UNRESOLVED');
check('C2 tier OFFICIAL_SSH_HSPK KOSONG by design (tidak ada record fabrikasi)',
  OFFICIAL_SSH_HSPK_REFERENCES.length === 0
  && all.every((r) => r.hierarchyTier !== 'OFFICIAL_SSH_HSPK' && r.hierarchyTier !== 'OFFICIAL_AHSP'));
check('C3 pada 2026-11-10 semua eksternal FRESH; pada 2026-12-10 masih FRESH (batas TTL); 2026-12-11 STALE',
  ext.every((r) => canonicalFreshness(r, new Date('2026-11-10T00:00:00Z')) === 'FRESH')
  && ext.every((r) => canonicalFreshness(r, new Date('2026-12-10T00:00:00Z')) === 'FRESH')
  && ext.every((r) => canonicalFreshness(r, new Date('2026-12-11T00:00:00Z')) === 'STALE'));
check('C4 entri Jakarta lama UNKNOWN di segala tanggal (tidak diperpanjang artifisial)',
  jkt.filter((r) => r.accessedAt === null)
    .every((r) => canonicalFreshness(r, new Date('2026-11-10T00:00:00Z')) === 'UNKNOWN'));
{
  const need = referencesNeedingRevalidation(new Date('2026-12-11T00:00:00Z'), all);
  check('C5 daftar revalidasi 2026-12-11: 25 basi (13 eksternal + 12 Jakarta selaras) + 37 tak diketahui',
    need.stale.length === 25 && need.unknownFreshness.length === 37,
    `stale=${need.stale.length} unknown=${need.unknownFreshness.length}`);
  const fresh = referencesNeedingRevalidation(new Date('2026-11-10T00:00:00Z'), all);
  check('C6 pada tanggal akses tidak ada yang basi; 37 tetap tak diketahui',
    fresh.stale.length === 0 && fresh.unknownFreshness.length === 37);
}

console.log('== D. Tumpang tindih lintas basis ==');
{
  const overlaps = findCrossBaseOverlaps(all);
  const priceMatches = overlaps.filter((o) => o.kind === 'PRICE_AND_UNIT_MATCH');
  check('D1 13 pasangan harga+satuan selaras persis (12 selaras riset + lisplang/listplank), delta 0',
    priceMatches.length === 13 && priceMatches.every((o) => o.priceDelta === 0),
    priceMatches.map((o) => o.jakarta.id).join(','));
  check('D2 pasangan genteng karang pilang (95.000) TIDAK terpasangkan ke spandek walau harga sama (token nama tak berbagi)',
    !overlaps.some((o) => o.jakarta.description.includes('Genteng karang pilang')));
  const jendelaGeneric = overlaps.find(
    (o) => o.kind === 'NAME_TOKEN_OVERLAP' && o.jakarta.description === 'Jendela kaca + kusen'
      && o.external.id === 'ext-jendela-aluminium-kaca5');
  check('D3 tumpang tindih ambigu terdeteksi: jendela generik Jakarta 650.000 vs aluminium eksternal 900.000 (delta −250.000)',
    jendelaGeneric != null && jendelaGeneric.priceDelta === -250000
    && jendelaGeneric.external.id === 'ext-jendela-aluminium-kaca5');
  check('D4 semua pasangan tumpang tindih bersatuan ternormalisasi sama',
    overlaps.every((o) => o.jakarta.normalizedUnit === o.external.normalizedUnit));
}

console.log(`\nHASIL: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);

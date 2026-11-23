/**
 * universalAhspPricing.test.ts — W8 (Universal Construction Intelligence §8):
 * AHSP + harga kanonis + fix default §14.
 *
 * Suite asersi tsx polos (tanpa vitest): `npx --yes tsx src/test/universalAhspPricing.test.ts`
 *
 * Cakupan:
 *  §1 Alias sinonim AHSP (S3-7) — canonicalDedPricing.ts
 *  §2 Custom AHSP CUSTOM_COMPOSED (S3-12) — komposer + resolver template
 *  §3 Default parametric 0/0 + pajak opt-in (S3-14) — parametricVolumeEngine
 *  §4 [KARAKTERISASI] MARKET_REFERENCE ganda (S3-9) — TIDAK dipisah di W8;
 *      tes ini mengunci perilaku dual-use saat ini untuk pekerjaan split kelak.
 *  §5 G9 MEP — lihat catatan di bawah (subset terverifikasi / dokumentasi).
 *
 * TIDAK dikerjakan di W8 (dokumentasi di laporan, bukan di sini):
 *  - kebijakan regional tunggal (S3-11), band kewajaran per kategori (S3-10),
 *    penyatuan basis harga DIRECT vs HSP (P3B-O3) — butuh keputusan owner.
 */
import { strict as assert } from 'assert';
import { canonicalizeDedSynonyms, matchDedItemToAhsp } from '../ai-tools/ded-canonical/canonicalDedPricing';
import { composeCustomAhspPrice, RabTemplateService } from '../services/rabTemplateService';
import { parametricVolumeEngine } from '../engine/parametricVolumeEngine/parametricVolumeEngine';
import { buildDirectRab } from '../ai-tools/ezrab-ai/directRab';
import type { CustomAhspComponent } from '../types/rabTemplate';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  PASS ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function eq<T>(got: T, want: T, name: string) {
  check(name, got === want, `dapat ${String(got)}, harap ${String(want)}`);
}

// Komponen AHSP 3.7.4 (plesteran 1SP:4PP 15 mm) — data nyata katalog;
// komposisi penuhnya HARUS mereproduksi harga kanonis Rp51.622.
const PLESTERAN_374: CustomAhspComponent[] = [
  { resourceName: 'Pekerja', resourceType: 'labor', coefficient: 0.2, unit: 'OH' },
  { resourceName: 'Tukang batu', resourceType: 'labor', coefficient: 0.1, unit: 'OH' },
  { resourceName: 'Kepala tukang', resourceType: 'labor', coefficient: 0.01, unit: 'OH' },
  { resourceName: 'Mandor', resourceType: 'labor', coefficient: 0.0033, unit: 'OH' },
  { resourceName: 'Semen portland (PC)', resourceType: 'material', coefficient: 6.24, unit: 'kg' },
  { resourceName: 'Pasir pasang (quarry - lokasi pekerjaan)', resourceType: 'material', coefficient: 0.024, unit: 'm3' },
];

console.log('== 1. Alias sinonim AHSP (S3-7) ==');
eq(canonicalizeDedSynonyms('pembesian kolom'), 'penulangan kolom', '1.1 pembesian → penulangan');
eq(canonicalizeDedSynonyms('urugan pasir'), 'timbunan pasir', '1.2 urugan → timbunan');
eq(canonicalizeDedSynonyms('pekerjaan pondasi batu kali'), 'pekerjaan pondasi batu belah', '1.3 batu kali → batu belah');
eq(canonicalizeDedSynonyms('cor beton'), 'pengecoran beton', '1.4 cor beton → pengecoran beton');
eq(canonicalizeDedSynonyms('plester dinding'), 'plesteran dinding', '1.5 plester → plesteran');
eq(canonicalizeDedSynonyms('plesteran dinding'), 'plesteran dinding', '1.6 plesteran TIDAK rusak menjadi plesteranan');
eq(canonicalizeDedSynonyms('bowplank'), 'papan duga', '1.7 bowplank → papan duga (normalisasi)');
eq(canonicalizeDedSynonyms('bouwplank'), 'papan duga', '1.8 bouwplank → papan duga (normalisasi)');
eq(canonicalizeDedSynonyms('pemasangan 1 m2 plesteran 1sp 4pp tebal 15 mm'), 'pemasangan 1 m2 plesteran 1sp 4pp tebal 15 mm', '1.9 teks tanpa alias tidak berubah');

const pembesian = matchDedItemToAhsp({ name: 'Pembesian kolom', unit: 'kg' });
const penulangan = matchDedItemToAhsp({ name: 'Penulangan kolom', unit: 'kg' });
check('1.10 pembesian kolom: kandidat teratas = penulangan 2.2.1.1.3 (skor 125, dulu 70)',
  pembesian.candidates[0]?.code === '2.2.1.1.3' && (pembesian.candidates[0]?.score ?? 0) >= 100,
  `dapat ${pembesian.candidates[0]?.code} skor ${pembesian.candidates[0]?.score}`);
check('1.11 pembesian ≡ penulangan: daftar kandidat identik',
  JSON.stringify(pembesian.candidates.map((c) => c.code)) === JSON.stringify(penulangan.candidates.map((c) => c.code)));
eq(pembesian.status, 'NEEDS_REVIEW', '1.12 pembesian tetap NEEDS_REVIEW (seri ambigu — alias tidak memaksa auto-accept)');

const urugan = matchDedItemToAhsp({ name: 'Urugan pasir', unit: 'm3' });
eq(urugan.candidates[0]?.code, 'A.3.02.1g', '1.13 urugan pasir: kandidat teratas = TIMBUNAN (dulu penggalian 1.2.2.1.1)');
check('1.14 urugan pasir: penggalian bukan lagi kandidat teratas',
  urugan.candidates[0]?.code !== '1.2.2.1.1');

const batuKali = matchDedItemToAhsp({ name: 'Pekerjaan Pondasi Batu Kali', unit: 'm3' });
eq(batuKali.status, 'NEEDS_REVIEW', '1.15 pondasi batu kali tetap NEEDS_REVIEW (kalibrasi Gate C §3.3)');
eq(batuKali.unitPrice, null, '1.16 pondasi batu kali: harga null');
check('1.17 pondasi batu kali: kandidat memuat 2.2.2.1.2 (pondasi batu belah)',
  batuKali.candidates.some((c) => c.code === '2.2.2.1.2'));

const plester = matchDedItemToAhsp({ name: 'Plester dinding 1:4', unit: 'm2' });
const plesteran = matchDedItemToAhsp({ name: 'Plesteran dinding 1:4', unit: 'm2' });
check('1.18 plester dinding 1:4: punya kandidat (dulu NO_MATCH — gerbang kata-isi menolak substring)',
  plester.status === 'NEEDS_REVIEW' && plester.candidates.length > 0, `dapat ${plester.status}, ${plester.candidates.length} kandidat`);
check('1.19 plester ≡ plesteran: daftar kandidat identik',
  JSON.stringify(plester.candidates.map((c) => c.code)) === JSON.stringify(plesteran.candidates.map((c) => c.code)));

const keramik = matchDedItemToAhsp({ name: 'Lantai keramik 25x25 Unpolished', unit: 'm2' });
check('1.20 kalibrasi Gate C utuh: keramik 25x25 → RESOLVED 3.9.8.10 Rp104309',
  keramik.status === 'RESOLVED' && keramik.matchedCode === '3.9.8.10' && keramik.unitPrice === 104309,
  `dapat ${keramik.status} ${keramik.matchedCode} ${keramik.unitPrice}`);

const bowplank = matchDedItemToAhsp({ name: 'Bowplank', unit: 'm' });
eq(bowplank.status, 'NO_MATCH', '1.21 bowplank tetap NO_MATCH — TIDAK ADA target katalog (alias hanya normalisasi; lihat komentar tabel alias)');

console.log('\n== 2. Custom AHSP CUSTOM_COMPOSED (S3-12) ==');
const full = composeCustomAhspPrice(PLESTERAN_374);
eq(full.status, 'FULL', '2.1 komposisi 3.7.4 → FULL');
eq(full.unitPrice, 51622, '2.2 komposisi 3.7.4 = Rp51.622 (harga kanonis — reproduksi eksak)');
eq(full.resolved, 6, '2.3 resolved 6/6');
eq(full.splits.labor, 36910, '2.4 splits tenaga kerja Rp36.910');
eq(full.splits.material, 14712, '2.5 splits material Rp14.712');
eq(full.splits.labor + full.splits.material + full.splits.equipment, 51622, '2.6 splits menjumlah ke harga');
check('2.7 provenance per baris: sumber master tercatat',
  full.lines.every((l) => l.unitPrice != null && l.amount != null && !!l.sourceName));

const partial = composeCustomAhspPrice([
  ...PLESTERAN_374,
  { resourceName: 'Bahan fiktif tidak ada xyz', resourceType: 'material', coefficient: 1, unit: 'kg' },
]);
eq(partial.status, 'PARTIAL', '2.8 satu komponen tak ter-resolve → PARTIAL');
eq(partial.unitPrice, null, '2.9 PARTIAL: harga null (jumlah parsial TIDAK dipakai)');
check('2.10 PARTIAL: daftar hilang menyebut komponen fiktif',
  partial.missing.some((m) => m.resourceName.includes('Bahan fiktif')));

const empty = composeCustomAhspPrice([]);
eq(empty.status, 'MISSING', '2.11 daftar kosong → MISSING');
eq(empty.unitPrice, null, '2.12 daftar kosong: harga null');

const badCoef = composeCustomAhspPrice([
  { resourceName: 'Semen portland (PC)', resourceType: 'material', coefficient: 0, unit: 'kg' },
]);
eq(badCoef.unitPrice, null, '2.13 koefisien 0 → harga null');
check('2.14 koefisien 0 → alasan tercatat', badCoef.missing[0]?.reason.includes('koefisien tidak valid') ?? false);

const svc = new RabTemplateService();
const resolve = (comp: any, mat: number | null = null, meta: any = null) =>
  (svc as any).resolveTemplateComponentPrice(comp, mat, meta);
const baseComp = { id: 'c1', name: 'Plesteran custom', category: '06. PLESTERAN', unit: 'm2', calculationRule: 'luas', variables: ['luas'] };

const rComposed = resolve({ ...baseComp, customComposition: PLESTERAN_374 });
eq(rComposed.kind, 'CUSTOM_COMPOSED', '2.15 resolver: kind CUSTOM_COMPOSED');
eq(rComposed.unitPrice, 51622, '2.16 resolver: harga komposisi Rp51.622');
eq(rComposed.priceCostBasis, 'DIRECT_COST', '2.17 resolver: basis DIRECT_COST (tanpa O&P)');
eq(rComposed.mappingStatus, 'NOT_APPLICABLE', '2.18 resolver: mapping NOT_APPLICABLE (tanpa kode)');
eq(rComposed.label, 'Harga Komposisi Kustom', '2.19 resolver: label komposisi kustom');
check('2.20 resolver: explanation menyebut komponen + dasar harga',
  String(rComposed.explanation).includes('Semen portland') && String(rComposed.explanation).includes('biaya langsung'));

const rFullBaked = resolve({ ...baseComp, unitPrice: 99999, customComposition: PLESTERAN_374 });
eq(rFullBaked.kind, 'CUSTOM_COMPOSED', '2.21 komposisi FULL menang atas harga baked');
eq(rFullBaked.unitPrice, 51622, '2.22 komposisi FULL: harga komposisi dipakai, bukan baked');

const rPartialBaked = resolve({
  ...baseComp,
  unitPrice: 99999,
  customComposition: [...PLESTERAN_374, { resourceName: 'Bahan fiktif xyz', resourceType: 'material', coefficient: 1, unit: 'kg' }],
});
eq(rPartialBaked.kind, 'MARKET_REFERENCE', '2.23 komposisi PARTIAL + baked → jatuh ke baked MARKET_REFERENCE');
eq(rPartialBaked.unitPrice, 99999, '2.24 komposisi PARTIAL: harga baked dipakai (parsial tidak dipakai)');

const rBadCode = resolve({ ...baseComp, ahspCode: 'X.9.9.9', customComposition: PLESTERAN_374 });
eq(rBadCode.kind, 'CUSTOM_COMPOSED', '2.25 kode gagal + komposisi → CUSTOM_COMPOSED');
eq(rBadCode.mappingStatus, 'NEEDS_MAPPING', '2.26 kode gagal: mapping NEEDS_MAPPING dipertahankan');
check('2.27 kode gagal: explanation menyebut kode yang gagal',
  String(rBadCode.explanation).includes('X.9.9.9'));

const rOfficial = resolve({ ...baseComp, ahspCode: '3.7.4', customComposition: PLESTERAN_374 });
eq(rOfficial.kind, 'OFFICIAL_AHSP', '2.28 kode valid + komposisi → gerbang resmi MENANG (komposisi tidak dipakai)');
eq(rOfficial.priceCostBasis, 'HSP', '2.29 kode valid: basis HSP (DHSP)');

const rUnresolved = resolve({ ...baseComp });
eq(rUnresolved.kind, 'UNRESOLVED', '2.30 tanpa kode/komposisi/baked → UNRESOLVED (perilaku lama)');
eq(rUnresolved.unitPrice, null, '2.31 tanpa kode/komposisi/baked → harga null (bukan Rp0)');

console.log('\n== 3. Default parametric 0/0 + pajak opt-in (S3-14 / §14) ==');
const gen5x10 = (extra: Record<string, unknown> = {}) => parametricVolumeEngine.generateRABFromTemplate({
  templateId: 'template-house-type-45-single-floor',
  parameters: { buildingArea: 50, floorCount: 1, buildingWidth: 5, buildingLength: 10 },
  region: 'DKI Jakarta',
  ...extra,
});
const d = gen5x10();
eq(d.overheadPercentage, 0, '3.1 default overhead 0%');
eq(d.profitPercentage, 0, '3.2 default profit 0%');
eq(d.taxPercentage, 0, '3.3 default pajak efektif 0% (opt-in mati)');
eq(d.overheadAmount, 0, '3.4 overhead amount 0');
eq(d.profitAmount, 0, '3.5 profit amount 0');
eq(d.taxAmount, 0, '3.6 tax amount 0');
eq(d.totalDirectCost, 144163865, '3.7 biaya langsung 5x10 tidak berubah (Rp144.163.865)');
eq(d.totalRabCost, 144163865, '3.8 total RAB = biaya langsung (dulu Rp176.024.079 pada tangga 5/5/11)');
eq(d.totalRabCost, d.totalDirectCost + d.overheadAmount + d.profitAmount + d.taxAmount, '3.9 rantai total konsisten');

const dTax = gen5x10({ taxEnabled: true });
eq(dTax.taxPercentage, 11, '3.10 taxEnabled: tarif 11%');
eq(dTax.taxAmount, 15858025, '3.11 taxEnabled: PPN 11% × direct = Rp15.858.025');
eq(dTax.totalRabCost, 160021890, '3.12 taxEnabled: total = direct + PPN');

const dOld = gen5x10({ overheadPercentage: 5, profitPercentage: 5, taxPercentage: 11, taxEnabled: true });
eq(dOld.totalRabCost, 176024079, '3.13 override eksplisit 5/5/11 + flag mereproduksi total lama (jalur override utuh)');

const dTaxNoFlag = gen5x10({ taxPercentage: 11 });
eq(dTaxNoFlag.taxPercentage, 0, '3.14 taxPercentage 11 TANPA flag → tarif efektif 0');
eq(dTaxNoFlag.taxAmount, 0, '3.15 taxPercentage 11 TANPA flag → pajak 0 (flag yang mengaktifkan, bukan tarif)');

const t70 = buildDirectRab('buatkan rab rumah type 70 2 lantai');
assert.ok(t70 !== null, 'buildDirectRab Type 70 non-null');
eq(t70!.calc.totalRabCost, 208541930, '3.16 Type 70: total RAB = biaya langsung Rp208.541.930 (dulu Rp254.629.698)');
eq(t70!.calc.totalRabCost, t70!.calc.totalDirectCost, '3.17 Type 70: selisih tangga parametrik vs kanonis proyek baru = Rp0 (celah P3B-O3 default tertutup)');

console.log('\n== 4. [KARAKTERISASI] MARKET_REFERENCE ganda (S3-9) — TIDAK dipisah di W8 ==');
const rBaked = resolve({ ...baseComp, unitPrice: 12345 });
eq(rBaked.kind, 'MARKET_REFERENCE', '4.1 baked legacy → MARKET_REFERENCE');
eq(rBaked.sourceSupplier, null, '4.2 baked legacy: TANPA metadata pemasok');
eq(rBaked.sourceDate, null, '4.3 baked legacy: TANPA metadata tanggal');
eq(rBaked.sourceRegion, null, '4.4 baked legacy: TANPA metadata wilayah');
const rMaterial = resolve({ ...baseComp }, 77777, { supplier: 'PT Contoh', effectiveDate: '2026-01-01', location: 'Jakarta' });
eq(rMaterial.kind, 'MARKET_REFERENCE', '4.5 material ekosistem → MARKET_REFERENCE (kind SAMA dengan baked — dual-use)');
eq(rMaterial.sourceSupplier, 'PT Contoh', '4.6 material ekosistem: metadata pemasok TERCATAT');
eq(rMaterial.sourceDate, '2026-01-01', '4.7 material ekosistem: metadata tanggal TERCATAT');
eq(rMaterial.sourceRegion, 'Jakarta', '4.8 material ekosistem: metadata wilayah TERCATAT');
check('4.9 S3-9 TERTUNDA: kind TEMPLATE_REFERENCE belum ada — pemisahan butuh koordinasi ember marketTotal (universalRab) + bucket ekspor (priceIntegrity) + hasResolvedPriceEvidence; lihat laporan W8',
  rBaked.kind === rMaterial.kind);

console.log(`\nuniversalAhspPricing: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

/**
 * EZRAB — INTEGRASI KATALOG 180: MAPPING buildingType PROYEK
 *
 * Memverifikasi perbaikan gap integrasi Katalog 180 (laporan Fase L §G):
 * WorkspaceView memakai templateCategoryToBuildingType() saat proyek baru
 * dibuat dari penerapan template. Sebelumnya 11 kategori baru selalu jatuh
 * ke buildingType 'Custom'.
 *
 * Cakupan:
 *  1. Mapping persis untuk SELURUH 27 TemplateCategory — 11 kategori baru
 *     ke label tipenya sendiri; kategori lama PERSIS seperti ternary
 *     historis (regresi), termasuk UTILITAS/CUSTOM/TEMPLATE_SAYA yang
 *     memang selalu 'Custom'.
 *  2. Katalog tetap 180 template resmi dan 52 ID legacy utuh; setiap
 *     template kategori baru terpetakan ke tipe spesifik (bukan 'Custom').
 *  3. Simulasi jalur apply: satu template per kategori baru di-generate
 *     (item RAB nyata dihasilkan) dan buildingType yang akan dicatat ke
 *     proyek adalah label yang benar.
 *  4. Invariant gerbang harga pada item hasil generate jalur apply:
 *     OFFICIAL_AHSP hanya bila ahspMappingStatus VERIFIED dan harga > 0;
 *     item tanpa harga (null) tidak pernah berlabel resmi.
 *  5. (WS-2) Himpunan kategori yang jatuh ke 'Custom' dikunci PERSIS
 *     {UTILITAS, CUSTOM, TEMPLATE_SAYA} — satu-satunya kategori resmi
 *     (bertemplate EZRAB_OFFICIAL) di dalamnya adalah UTILITAS, dengan
 *     alasan model yang terdokumentasi di adapter. Katalog resmi mencakup
 *     tepat 25 kategori berbeda. Kategori lain yang diam-diam jatuh ke
 *     'Custom' = pemetaan hilang = tes gagal.
 *
 * Jalankan: npx --yes tsx src/test/catalogBuildingType.test.ts
 */

import { strict as assert } from 'assert';
import { RabTemplateService } from '../services/rabTemplateService';
import { templateCategoryToBuildingType } from '../services/rabTemplateCatalogAdapter';
import { TemplateCategory } from '../types/rabTemplate';
import { BuildingType } from '../types';

// Mock localStorage for Node test environment (pola sama dengan suite katalog)
const storage: Record<string, string> = {};
(global as any).window = {
  localStorage: {
    getItem: (key: string) => storage[key] || null,
    setItem: (key: string, val: string) => { storage[key] = val; },
    removeItem: (key: string) => { delete storage[key]; },
    clear: () => { Object.keys(storage).forEach(k => delete storage[k]); }
  }
};
(global as any).localStorage = (global as any).window.localStorage;

const NEW_CATEGORIES: Record<string, BuildingType> = {
  PONDASI_GEOTEKNIK: 'Pondasi & Geoteknik',
  JEMBATAN_STRUKTUR: 'Jembatan & Struktur Khusus',
  DRAINASE_SANITASI: 'Drainase & Sanitasi',
  PEKERJAAN_TANAH: 'Pekerjaan Tanah',
  STRUKTUR_BETON_BAJA: 'Struktur Beton & Baja',
  FINISHING_INTERIOR: 'Finishing & Interior',
  ATAP_WATERPROOFING: 'Atap & Waterproofing',
  PERTANIAN_PERKEBUNAN: 'Pertanian & Perkebunan',
  PELABUHAN_PESISIR: 'Pelabuhan & Pesisir',
  FASILITAS_OLAHRAGA: 'Fasilitas Olahraga',
  DEMOLISI_REKONSTRUKSI: 'Demolisi & Rekonstruksi'
};

// Jumlah template per kategori baru sesuai tabel distribusi final Fase C laporan.
const NEW_CATEGORY_COUNTS: Record<string, number> = {
  PONDASI_GEOTEKNIK: 7,
  JEMBATAN_STRUKTUR: 7,
  DRAINASE_SANITASI: 7,
  PEKERJAAN_TANAH: 6,
  STRUKTUR_BETON_BAJA: 7,
  FINISHING_INTERIOR: 6,
  ATAP_WATERPROOFING: 5,
  PERTANIAN_PERKEBUNAN: 5,
  PELABUHAN_PESISIR: 5,
  FASILITAS_OLAHRAGA: 5,
  DEMOLISI_REKONSTRUKSI: 5
};

// Nilai historis ternary WorkspaceView sebelum perbaikan — TIDAK boleh berubah.
const LEGACY_MAPPING: Record<string, BuildingType> = {
  RUMAH_TINGGAL: 'Rumah Tinggal',
  JALAN_TRANSPORTASI: 'Infrastruktur',
  PERKERASAN: 'Infrastruktur',
  SDA_IRIGASI: 'Infrastruktur',
  GEDUNG: 'Gedung Kantor',
  BANGUNAN_TINGGI: 'Gedung Kantor',
  HOTEL_HOSPITALITY: 'Hotel & Resort',
  KESEHATAN: 'Rumah Sakit / Klinik',
  PENDIDIKAN: 'Sekolah / Kampus',
  INDUSTRI: 'Gudang & Pabrik',
  LANDSCAPE_SITE: 'Landscape & Kawasan',
  MEP_SYSTEM: 'MEP & Sistem',
  RENOVASI_MAINTENANCE: 'Renovasi & Maintenance',
  UTILITAS: 'Custom',
  CUSTOM: 'Custom',
  TEMPLATE_SAYA: 'Custom'
};

function run() {
  console.log('=== TEST GROUP 1: Mapping 11 kategori baru ===');
  for (const [cat, expected] of Object.entries(NEW_CATEGORIES)) {
    const actual = templateCategoryToBuildingType(cat as TemplateCategory);
    assert.strictEqual(actual, expected, `${cat}: expected '${expected}', got '${actual}'`);
    assert.notStrictEqual(actual, 'Custom', `${cat} must not fall back to Custom`);
  }
  console.log(`  ✓ PASSED: 11 kategori baru terpetakan ke tipe spesifiknya`);

  console.log('\n=== TEST GROUP 2: Regresi mapping kategori lama ===');
  for (const [cat, expected] of Object.entries(LEGACY_MAPPING)) {
    const actual = templateCategoryToBuildingType(cat as TemplateCategory);
    assert.strictEqual(actual, expected, `${cat} (legacy): expected '${expected}', got '${actual}'`);
  }
  console.log(`  ✓ PASSED: 16 kategori lama persis seperti perilaku historis`);

  console.log('\n=== TEST GROUP 3: Katalog 180 utuh + kategori baru terpetakan ===');
  const svc = RabTemplateService.getInstance();
  const officials = svc.getAllTemplates().filter(t => t.metadata.source === 'EZRAB_OFFICIAL');
  assert.strictEqual(officials.length, 180, `expected 180 official templates, got ${officials.length}`);
  const ids = new Set(officials.map(t => t.id));
  assert.strictEqual(ids.size, 180, 'duplicate template IDs found');
  for (const legacyId of ['HOUSE-T36-1FL', 'HOUSE-T70-1FL', 'INFRA-ROAD-RIGID', 'SDA-DRAIN-UDITCH', 'MEP-COMPLETE-PKG']) {
    assert.ok(ids.has(legacyId), `legacy template ${legacyId} missing`);
  }
  for (const [cat, count] of Object.entries(NEW_CATEGORY_COUNTS)) {
    const inCat = officials.filter(t => t.category === cat);
    assert.strictEqual(inCat.length, count, `${cat}: expected ${count} templates, got ${inCat.length}`);
    for (const t of inCat) {
      assert.strictEqual(
        templateCategoryToBuildingType(t.category),
        NEW_CATEGORIES[cat],
        `${t.id}: wrong buildingType for new category ${cat}`
      );
    }
  }
  console.log('  ✓ PASSED: 180 template, ID unik, distribusi kategori baru sesuai, semua terpetakan spesifik');

  console.log('\n=== TEST GROUP 4: Simulasi jalur apply per kategori baru ===');
  for (const cat of Object.keys(NEW_CATEGORIES)) {
    const t = officials.find(x => x.category === cat)!;
    const result = svc.generateRabFromTemplate(t, {}, undefined, 'PROFESSIONAL', []);
    assert.ok(result.items.length > 0, `${t.id}: apply generated zero items`);
    const wouldBeBuildingType = templateCategoryToBuildingType(t.category);
    assert.strictEqual(wouldBeBuildingType, NEW_CATEGORIES[cat], `${t.id}: project metadata would be wrong`);
    // Invariant gerbang harga pada jalur apply (Fase F tidak berubah):
    for (const item of result.items) {
      if ((item as any).priceSourceKind === 'OFFICIAL_AHSP') {
        assert.strictEqual((item as any).ahspMappingStatus, 'VERIFIED', `${t.id}: OFFICIAL without VERIFIED mapping`);
        assert.ok(typeof item.unitPrice === 'number' && item.unitPrice > 0, `${t.id}: OFFICIAL without positive price`);
      }
      if (item.unitPrice === null) {
        assert.notStrictEqual((item as any).priceSourceKind, 'OFFICIAL_AHSP', `${t.id}: unpriced item labeled OFFICIAL`);
      }
    }
  }
  console.log('  ✓ PASSED: apply menghasilkan item RAB nyata + metadata tipe benar + gerbang harga utuh');

  console.log('\n=== TEST GROUP 5: Himpunan Custom dikunci persis + cakupan kategori katalog ===');
  const ALL_CATEGORIES = [...Object.keys(LEGACY_MAPPING), ...Object.keys(NEW_CATEGORIES)];
  assert.strictEqual(ALL_CATEGORIES.length, 27, `expected 27 TemplateCategory keys, got ${ALL_CATEGORIES.length}`);
  const customSet = ALL_CATEGORIES.filter(
    (cat) => templateCategoryToBuildingType(cat as TemplateCategory) === 'Custom'
  ).sort();
  assert.deepStrictEqual(
    customSet,
    ['CUSTOM', 'TEMPLATE_SAYA', 'UTILITAS'],
    `categories mapping to 'Custom' must be exactly the documented set, got: ${customSet.join(', ')}`
  );
  const officialCats = [...new Set(officials.map((t) => t.category as string))].sort();
  assert.strictEqual(officialCats.length, 25, `expected 25 distinct official categories, got ${officialCats.length}`);
  const officialCustom = officialCats.filter(
    (cat) => templateCategoryToBuildingType(cat as TemplateCategory) === 'Custom'
  );
  assert.deepStrictEqual(
    officialCustom,
    ['UTILITAS'],
    `only UTILITAS may map to 'Custom' among official categories, got: ${officialCustom.join(', ')}`
  );
  console.log('  ✓ PASSED: Custom = tepat {UTILITAS, CUSTOM, TEMPLATE_SAYA}; 25 kategori resmi, hanya UTILITAS ke Custom (alasan terdokumentasi)');

  console.log('\n================================================================');
  console.log('🎉 ALL BUILDING TYPE MAPPING TESTS PASSED (5/5 GROUPS)');
  console.log('================================================================');
}

run();

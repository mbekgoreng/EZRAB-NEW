/**
 * EZRAB — KATALOG TEMPLATE RAB 180 — FULL-CATALOG TEST SUITE (Fase J)
 *
 * Mengiterasi SELURUH 180 template resmi bawaan dan memverifikasi:
 *  1. Jumlah tepat 180, 52 ID legacy utuh, tanpa ID duplikat.
 *  2. Distribusi per kategori sesuai tabel final Katalog 180.
 *  3. Struktur valid: parameter, komponen, satuan, level detail
 *     (setiap template baru memiliki tier COMPREHENSIVE nyata).
 *  4. Generate deterministik (dua kali generate = hasil identik),
 *     volume finite & >= 0, traceability lengkap per item.
 *  5. Integritas harga (Fase F): kode kanonis FULL -> OFFICIAL_AHSP;
 *     kode legacy -> REFERENCE_PRICE (tidak pernah OFFICIAL);
 *     tanpa sumber -> unitPrice null (tidak pernah 0) + total PARTIAL;
 *     unit mismatch -> fail-safe (tidak pernah harga resmi).
 *  6. Komponen opsional hanya muncul bila dipilih / level COMPREHENSIVE.
 *  7. Template kustom pengguna tetap berfungsi & tidak terhitung 180.
 *  8. Adapter Fase C: daftar terpadu katalog + master registry.
 *
 * Jalankan: npx --yes tsx src/test/templateCatalog180.test.ts
 */

import { strict as assert } from 'assert';
import { RabTemplateService } from '../services/rabTemplateService';
import { RabTemplate, TemplateCategory } from '../types/rabTemplate';
import { listUnifiedTemplates, findUnifiedTemplate, catalogToMasterSummary } from '../services/rabTemplateCatalogAdapter';

// Mock localStorage for Node test environment
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

const LEGACY_IDS = ["BLD-APARTMENT-MIDRISE","BLD-BOUTIQUE-VILLA","BLD-EDU-CAMPUS","BLD-EDU-SCHOOL","BLD-HALL-SERBAGUNA","BLD-HEALTH-CLINIC","BLD-HEALTH-HOSPITAL","BLD-HIGHRISE-TOWER","BLD-HOTEL-RESORT","BLD-IND-WAREHOUSE","BLD-IND-WORKSHOP","BLD-OFFICE-MULTI","BLD-RENOV-OFFICE","HOUSE-CUSTOM","HOUSE-KOST-RESIDENCE","HOUSE-T100-2FL","HOUSE-T120-2FL","HOUSE-T150-2FL","HOUSE-T180-2FL","HOUSE-T200-2FL","HOUSE-T250-2FL","HOUSE-T300-2FL","HOUSE-T36-1FL","HOUSE-T36-2FL","HOUSE-T45-1FL","HOUSE-T54-1FL","HOUSE-T60-1FL","HOUSE-T70-1FL","HOUSE-T90-2FL","HOUSE-TOWNHOUSE","HOUSE-VILLA-MODERN","INFRA-ROAD-ASPHALT","INFRA-ROAD-MAINTENANCE","INFRA-ROAD-PEDESTRIAN","INFRA-ROAD-RESIDENTIAL","INFRA-ROAD-RIGID","LAND-FENCE-GATE","LAND-PARK-RESIDENCE","MEP-COMPLETE-PKG","MEP-SOLAR-PV","PAV-INDUSTRI-8CM","PAV-KOMPLEK-6CM","PAV-PEDESTRIAN-INTERLOCK","RENOV-COMMERCIAL-FACADE","RENOV-HOUSE-FULL","SDA-BOX-CULVERT","SDA-DRAIN-UDITCH","SDA-IRRIGATION-STONE","SDA-RETENTION-POND","UTIL-IPAL-WASTE","UTIL-PLUMBING-ELEC","UTIL-PLUMBING-WATER"];

const EXPECTED_CATEGORY_COUNTS: Record<string, number> = {
  RUMAH_TINGGAL: 18,
  JALAN_TRANSPORTASI: 10,
  SDA_IRIGASI: 10,
  PERKERASAN: 7,
  GEDUNG: 8,
  UTILITAS: 8,
  BANGUNAN_TINGGI: 6,
  HOTEL_HOSPITALITY: 6,
  KESEHATAN: 6,
  PENDIDIKAN: 6,
  INDUSTRI: 7,
  LANDSCAPE_SITE: 6,
  MEP_SYSTEM: 9,
  RENOVASI_MAINTENANCE: 8,
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

// Kelompok kerja WBS kanonis (nilai G pada src/data/templateCatalog180/builders.ts).
const VALID_WORK_GROUPS = new Set([
  '01. PEKERJAAN PERSIAPAN', '02. PEKERJAAN TANAH', '03. PEKERJAAN PONDASI',
  '04. PEKERJAAN STRUKTUR', '05. PEKERJAAN DINDING & PARTISI', '06. PEKERJAAN LANTAI',
  '07. PEKERJAAN ATAP & PLAFON', '08. PEKERJAAN KUSEN, PINTU & JENDELA',
  '09. PEKERJAAN FINISHING', '10. PEKERJAAN SANITASI & PLAMBING',
  '11. PEKERJAAN ELEKTRIKAL', '12. PEKERJAAN MEKANIKAL & HVAC',
  '13. PEKERJAAN PERKERASAN', '14. PEKERJAAN DRAINASE',
  '15. PEKERJAAN LANSKAP & EKSTERIOR', '16. PEKERJAAN KHUSUS',
  '17. PEKERJAAN PEMBONGKARAN'
]);

// Kosakata satuan katalog yang terverifikasi (pindai menyeluruh 180 template:
// tepat 14 satuan distinct — daftar ini mengunci kosakata tersebut).
const VALID_UNITS = new Set([
  'm', 'm1', 'm2', 'm3', 'kg', 'ton', 'unit', 'buah', 'titik', 'btg', 'tgl',
  'pohon', 'hari', 'kWp'
]);

function syntheticTemplate(components: any[]): RabTemplate {
  return {
    id: 'SYNTH-CATALOG180-TEST',
    name: 'Template Sintetis Uji Resolver',
    category: 'GEDUNG' as TemplateCategory,
    subcategory: 'Uji',
    description: 'Template sintetis untuk pengujian perilaku resolver harga.',
    estimatedDuration: '1 hari',
    complexity: 'LOW',
    icon: 'FlaskConical',
    parameters: [],
    components,
    workPackages: [],
    metadata: { author: 'EZRAB Test', version: '1.0.0', lastModified: '2026-10-22', source: 'EZRAB_OFFICIAL', isPublic: true }
  } as unknown as RabTemplate;
}

function syntheticComponent(partial: Record<string, any>): any {
  return {
    id: 'synth-c1',
    name: 'Komponen Sintetis',
    category: '01. PEKERJAAN PERSIAPAN',
    unit: 'm3',
    calculationRule: '10',
    formulaInputs: [],
    detailLevel: 'STANDARD',
    ...partial
  };
}

async function runCatalog180Tests() {
  console.log('================================================================');
  console.log('🚀 EZRAB — KATALOG TEMPLATE RAB 180 TEST SUITE');
  console.log('================================================================\n');

  const svc = RabTemplateService.getInstance();
  const officials = svc.getAllTemplates().filter(t => t.metadata.source === 'EZRAB_OFFICIAL');

  // -----------------------------------------------------------------------
  // GROUP 1: JUMLAH, ID LEGACY, TANPA DUPLIKAT
  // -----------------------------------------------------------------------
  console.log('--- TEST GROUP 1: Catalog Count, Legacy IDs, Uniqueness ---');
  assert.strictEqual(officials.length, 180, `Expected exactly 180 official templates, got ${officials.length}`);
  const ids = officials.map(t => t.id);
  assert.strictEqual(new Set(ids).size, 180, 'Duplicate template IDs detected');
  for (const legacyId of LEGACY_IDS) {
    assert.ok(ids.includes(legacyId), `Legacy template missing: ${legacyId}`);
  }
  assert.strictEqual(LEGACY_IDS.length, 52);
  console.log('  ✓ PASSED: 180 official templates, all 52 legacy IDs preserved, no duplicates');

  // -----------------------------------------------------------------------
  // GROUP 2: DISTRIBUSI KATEGORI
  // -----------------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: Category Distribution (25 categories) ---');
  const counts: Record<string, number> = {};
  for (const t of officials) counts[t.category] = (counts[t.category] ?? 0) + 1;
  assert.deepStrictEqual(counts, EXPECTED_CATEGORY_COUNTS);
  console.log('  ✓ PASSED: Category distribution matches the Katalog 180 final table (25 categories)');

  // -----------------------------------------------------------------------
  // GROUP 3: STRUKTUR VALID SELURUH KATALOG
  // -----------------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: Structural Validity (all 180) ---');
  for (const t of officials) {
    assert.ok(t.name && t.name.length > 3, `${t.id}: name too short`);
    assert.ok(t.description && t.description.length > 10, `${t.id}: description missing`);
    assert.ok(Array.isArray(t.parameters), `${t.id}: parameters must be array`);
    assert.ok(Array.isArray(t.components) && t.components.length >= 3, `${t.id}: too few components (${t.components?.length})`);
    const compIds = new Set<string>();
    for (const c of t.components) {
      assert.ok(!compIds.has(c.id), `${t.id}: duplicate component id ${c.id}`);
      compIds.add(c.id);
      assert.ok(c.name && c.name.length > 3, `${t.id}/${c.id}: component name missing`);
      // Template baru wajib memakai kelompok kerja WBS kanonis; template
      // legacy memakai skema kategori historisnya sendiri (tidak diubah).
      if (!LEGACY_IDS.includes(t.id)) {
        assert.ok(VALID_WORK_GROUPS.has(c.category), `${t.id}/${c.id}: invalid work group "${c.category}"`);
      } else {
        assert.ok(typeof c.category === 'string' && c.category.length > 0, `${t.id}/${c.id}: empty work group`);
      }
      assert.ok(VALID_UNITS.has(c.unit), `${t.id}/${c.id}: invalid unit "${c.unit}"`);
      assert.ok(c.calculationRule && c.calculationRule.trim() !== '', `${t.id}/${c.id}: empty calculationRule`);
      assert.ok(['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'].includes(c.detailLevel || 'PROFESSIONAL'), `${t.id}/${c.id}: invalid detailLevel`);
      if (c.unitPrice != null) {
        assert.ok(Number.isFinite(c.unitPrice) && c.unitPrice > 0, `${t.id}/${c.id}: seed unitPrice must be > 0 when present (never 0)`);
      }
      // Formula hanya boleh merujuk parameter yang dideklarasikan.
      for (const inputKey of c.formulaInputs || []) {
        assert.ok(
          t.parameters.some(p => p.key === inputKey),
          `${t.id}/${c.id}: formulaInput "${inputKey}" is not a declared parameter`
        );
      }
    }
    for (const p of t.parameters) {
      assert.ok(p.key && p.label, `${t.id}: parameter missing key/label`);
      if (p.type === 'NUMBER') {
        assert.ok(typeof p.defaultValue === 'number' && Number.isFinite(p.defaultValue as number), `${t.id}/${p.key}: NUMBER parameter needs finite numeric default`);
      }
    }
  }
  console.log('  ✓ PASSED: All 180 templates structurally valid (units, formulas, params, component ids)');

  // -----------------------------------------------------------------------
  // GROUP 4: TEMPLATE BARU — TIER COMPREHENSIVE & METADATA KEJUJURAN
  // -----------------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: New Templates — Comprehensive Tier & Honesty Metadata ---');
  const newTemplates = officials.filter(t => !LEGACY_IDS.includes(t.id));
  assert.strictEqual(newTemplates.length, 128, `Expected 128 new templates, got ${newTemplates.length}`);
  for (const t of newTemplates) {
    assert.ok(t.components.length >= 6, `${t.id}: new template too thin (${t.components.length} components)`);
    assert.ok(t.components.some(c => c.detailLevel === 'STANDARD'), `${t.id}: no STANDARD component`);
    assert.ok(t.components.some(c => c.detailLevel === 'COMPREHENSIVE'), `${t.id}: no COMPREHENSIVE component`);
    assert.ok((t as any).formulaVersion, `${t.id}: formulaVersion missing`);
    assert.ok(Array.isArray(t.assumptions) && t.assumptions!.length > 0, `${t.id}: assumptions missing`);
    assert.ok(Array.isArray(t.exclusions) && t.exclusions!.length > 0, `${t.id}: exclusions missing`);
  }
  console.log('  ✓ PASSED: All 128 new templates carry STANDARD + COMPREHENSIVE tiers, assumptions & exclusions');

  // -----------------------------------------------------------------------
  // GROUP 5: GENERATE SELURUH KATALOG — VOLUME AMAN + TRACEABILITY LENGKAP
  // -----------------------------------------------------------------------
  console.log('\n--- TEST GROUP 5: Full-Catalog Generation Safety & Traceability ---');
  let totalItems = 0;
  let sumOfficial = 0, sumReference = 0, sumUnpriced = 0;
  for (const t of officials) {
    const r = svc.generateRabFromTemplate(t, {}, undefined, 'COMPREHENSIVE', []);
    assert.ok(r.items.length > 0, `${t.id}: generated zero items`);
    assert.strictEqual(r.traceability.length, r.items.length, `${t.id}: traceability length mismatch`);
    assert.ok(r.priceSummary, `${t.id}: priceSummary missing`);
    assert.strictEqual(r.generationStatus, 'COMPLETE', `${t.id}: unexpected generation status`);
    totalItems += r.items.length;
    sumOfficial += r.priceSummary!.officialCount;
    sumReference += r.priceSummary!.referenceCount;
    sumUnpriced += r.priceSummary!.unpricedCount;
    for (const item of r.items) {
      assert.ok(Number.isFinite(item.volume) && item.volume >= 0, `${t.id}: invalid volume ${item.volume} on "${item.description}"`);
      if (item.unitPrice != null) {
        assert.ok(Number.isFinite(item.unitPrice) && item.unitPrice > 0, `${t.id}: invalid unitPrice on "${item.description}"`);
      }
      assert.ok(item.priceSourceKind, `${t.id}: item missing priceSourceKind`);
      assert.ok(item.ahspMappingStatus, `${t.id}: item missing ahspMappingStatus`);
    }
    for (const tr of r.traceability) {
      assert.ok(tr.priceSource, `${t.id}: trace missing priceSource`);
      assert.ok(tr.mappingStatus !== undefined, `${t.id}: trace missing mappingStatus`);
    }
    // Konsistensi ringkasan harga
    const ps = r.priceSummary!;
    assert.strictEqual(
      ps.officialCount + ps.referenceCount + ps.manualCount + ps.unpricedCount,
      ps.totalItems,
      `${t.id}: priceSummary counts do not add up`
    );
    assert.strictEqual(ps.totalStatus, ps.unpricedCount > 0 ? 'PARTIAL' : 'COMPLETE', `${t.id}: totalStatus inconsistent`);
  }
  console.log(`  ✓ PASSED: 180/180 generated safely (${totalItems} items @COMPREHENSIVE defaults)`);
  console.log(`           Price mix — OFFICIAL: ${sumOfficial}, REFERENCE: ${sumReference}, UNPRICED: ${sumUnpriced}`);
  assert.ok(sumOfficial > 0, 'Expected at least some OFFICIAL_AHSP resolutions across the catalog');
  assert.ok(sumReference > 0, 'Expected reference-priced items across the catalog');

  // -----------------------------------------------------------------------
  // GROUP 6: DETERMINISME — DUA KALI GENERATE IDENTIK
  // -----------------------------------------------------------------------
  console.log('\n--- TEST GROUP 6: Deterministic Double Generation ---');
  for (const t of officials) {
    const a = svc.generateRabFromTemplate(t, {}, undefined, 'PROFESSIONAL', []);
    const b = svc.generateRabFromTemplate(t, {}, undefined, 'PROFESSIONAL', []);
    assert.strictEqual(a.items.length, b.items.length, `${t.id}: item count differs between runs`);
    assert.strictEqual(a.totalEstimate, b.totalEstimate, `${t.id}: total differs between runs`);
    for (let i = 0; i < a.items.length; i++) {
      assert.strictEqual(a.items[i].volume, b.items[i].volume, `${t.id}: volume differs at item ${i}`);
      assert.strictEqual(a.items[i].unitPrice, b.items[i].unitPrice, `${t.id}: unitPrice differs at item ${i}`);
    }
  }
  console.log('  ✓ PASSED: Double generation identical for all 180 templates');

  // -----------------------------------------------------------------------
  // GROUP 7: PERILAKU RESOLVER (Fase F)
  // -----------------------------------------------------------------------
  console.log('\n--- TEST GROUP 7: Resolver Behavior (Fase F integrity) ---');
  // 7a. Kode kanonis terverifikasi + satuan cocok -> OFFICIAL_AHSP.
  //     1.2.1.1.2 = "Penggalian Tanah Biasa 1-2 m, volume > 200-1000 m3"
  //     (terbukti FULL pada katalog kanonis repo ini).
  let r = svc.generateRabFromTemplate(
    syntheticTemplate([syntheticComponent({ ahspCode: '1.2.1.1.2', unit: 'm3' })]),
    {}, undefined, 'STANDARD', []
  );
  assert.strictEqual(r.items[0].priceSourceKind, 'OFFICIAL_AHSP', 'Canonical FULL code must resolve OFFICIAL');
  assert.strictEqual(r.items[0].ahspMappingStatus, 'VERIFIED');
  assert.ok(r.items[0].unitPrice != null && r.items[0].unitPrice > 0);
  assert.ok(r.items[0].priceSourceName, 'Official item must carry source metadata');
  console.log('  ✓ 7a canonical FULL code -> OFFICIAL_AHSP + VERIFIED + source metadata');

  // 7b. Kode nyata + satuan tidak kompatibel -> UNIT_MISMATCH, harga referensi (bukan resmi).
  r = svc.generateRabFromTemplate(
    syntheticTemplate([syntheticComponent({ ahspCode: '1.2.1.1.2', unit: 'kg', unitPrice: 5000 })]),
    {}, undefined, 'STANDARD', []
  );
  assert.strictEqual(r.items[0].ahspMappingStatus, 'UNIT_MISMATCH');
  assert.notStrictEqual(r.items[0].priceSourceKind, 'OFFICIAL_AHSP');
  assert.strictEqual(r.items[0].unitPrice, 5000);
  console.log('  ✓ 7b unit mismatch fails safe -> reference price, never official');

  // 7c. Kode nyata + satuan salah + tanpa harga referensi -> null (bukan 0).
  r = svc.generateRabFromTemplate(
    syntheticTemplate([syntheticComponent({ ahspCode: '1.2.1.1.2', unit: 'kg' })]),
    {}, undefined, 'STANDARD', []
  );
  assert.strictEqual(r.items[0].unitPrice, null);
  assert.strictEqual(r.priceSummary!.unpricedCount, 1);
  assert.strictEqual(r.priceSummary!.totalStatus, 'PARTIAL');
  console.log('  ✓ 7c unit mismatch without reference -> null price + PARTIAL total');

  // 7d. Kode karangan -> NEEDS_MAPPING + null (tidak pernah dikarang harganya).
  r = svc.generateRabFromTemplate(
    syntheticTemplate([syntheticComponent({ ahspCode: 'XX.99.99.FAKE', unit: 'm2' })]),
    {}, undefined, 'STANDARD', []
  );
  assert.strictEqual(r.items[0].unitPrice, null);
  assert.strictEqual(r.items[0].ahspMappingStatus, 'NEEDS_MAPPING');
  assert.notStrictEqual(r.items[0].priceSourceKind, 'OFFICIAL_AHSP');
  console.log('  ✓ 7d fabricated code -> NEEDS_MAPPING + null price');

  // 7e. Tanpa kode + harga referensi -> REFERENCE + NOT_APPLICABLE.
  r = svc.generateRabFromTemplate(
    syntheticTemplate([syntheticComponent({ unitPrice: 12345, unit: 'ls' })]),
    {}, undefined, 'STANDARD', []
  );
  assert.strictEqual(r.items[0].priceSourceKind, 'MARKET_REFERENCE');
  assert.strictEqual(r.items[0].ahspMappingStatus, 'NOT_APPLICABLE');
  assert.strictEqual(r.items[0].unitPrice, 12345);
  console.log('  ✓ 7e no-code reference price stays REFERENCE (never relabeled official)');

  // 7f. TIDAK ADA item legacy yang boleh berlabel OFFICIAL_AHSP.
  for (const legacyId of LEGACY_IDS) {
    const t = svc.getTemplateById(legacyId)!;
    const res = svc.generateRabFromTemplate(t, {}, undefined, 'COMPREHENSIVE', []);
    assert.strictEqual(res.priceSummary!.officialCount, 0, `${legacyId}: legacy item labeled OFFICIAL_AHSP`);
    for (const tr of res.traceability) {
      assert.notStrictEqual(tr.priceSource, 'OFFICIAL_AHSP', `${legacyId}: trace claims OFFICIAL_AHSP`);
    }
  }
  console.log('  ✓ 7f all 52 legacy templates: 0 OFFICIAL labels (seed prices are references)');

  // -----------------------------------------------------------------------
  // GROUP 8: KOMPONEN OPSIONAL & LEVEL DETAIL
  // -----------------------------------------------------------------------
  console.log('\n--- TEST GROUP 8: Optional Components & Detail Levels ---');
  const optTpl = syntheticTemplate([
    syntheticComponent({ id: 'base-c', name: 'Base' }),
    syntheticComponent({ id: 'opt-c', name: 'Optional', isOptional: true, unitPrice: 100, detailLevel: 'PROFESSIONAL' })
  ]);
  r = svc.generateRabFromTemplate(optTpl, {}, undefined, 'PROFESSIONAL', []);
  assert.strictEqual(r.items.length, 1, 'Optional component must be excluded when not selected');
  r = svc.generateRabFromTemplate(optTpl, {}, undefined, 'PROFESSIONAL', ['opt-c']);
  assert.strictEqual(r.items.length, 2, 'Optional component must be included when selected');
  r = svc.generateRabFromTemplate(optTpl, {}, undefined, 'COMPREHENSIVE', []);
  assert.strictEqual(r.items.length, 2, 'Optional component must be included at COMPREHENSIVE');
  // Monotonicity level pada katalog nyata: STANDARD <= PROFESSIONAL <= COMPREHENSIVE
  for (const t of officials) {
    const s = svc.generateRabFromTemplate(t, {}, undefined, 'STANDARD', []).items.length;
    const p = svc.generateRabFromTemplate(t, {}, undefined, 'PROFESSIONAL', []).items.length;
    const c = svc.generateRabFromTemplate(t, {}, undefined, 'COMPREHENSIVE', []).items.length;
    assert.ok(s <= p && p <= c, `${t.id}: level counts not monotonic (${s}/${p}/${c})`);
    assert.ok(s > 0, `${t.id}: STANDARD level generates zero items`);
  }
  console.log('  ✓ PASSED: Optional filtering exact; level counts monotonic for all 180 templates');

  // -----------------------------------------------------------------------
  // GROUP 9: TEMPLATE KUSTOM PENGGUNA TIDAK TERHITUNG & TETAP BERFUNGSI
  // -----------------------------------------------------------------------
  console.log('\n--- TEST GROUP 9: Custom User Templates Unaffected ---');
  const custom = svc.saveCustomTemplate({
    name: 'Template Uji Kustom 180',
    category: 'GEDUNG' as TemplateCategory,
    subcategory: 'Uji',
    description: 'Template kustom untuk memastikan CRUD pengguna tidak terganggu katalog 180.',
    estimatedDuration: '1 minggu',
    complexity: 'LOW',
    parameters: [],
    components: [syntheticComponent({ id: 'custom-c1', unitPrice: 1000 })],
    workPackages: []
  } as any);
  assert.ok(svc.getTemplateById(custom.id), 'Custom template must be retrievable');
  const officialsAfter = svc.getAllTemplates().filter(t => t.metadata.source === 'EZRAB_OFFICIAL');
  assert.strictEqual(officialsAfter.length, 180, 'Custom template must not change the official 180 count');
  assert.strictEqual(svc.deleteCustomTemplate(custom.id), true);
  console.log('  ✓ PASSED: Custom template CRUD works; official count stays exactly 180');

  // -----------------------------------------------------------------------
  // GROUP 10: ADAPTER FASE C (KATALOG <-> MASTER REGISTRY)
  // -----------------------------------------------------------------------
  console.log('\n--- TEST GROUP 10: Fase C Unified Adapter ---');
  const unified = listUnifiedTemplates();
  assert.strictEqual(unified.filter(e => e.source === 'CATALOG').length, 180);
  const t36 = findUnifiedTemplate('HOUSE-T36-1FL');
  assert.ok(t36 && t36.source === 'CATALOG' && t36.counterpartId, 'HOUSE-T36-1FL must link to its master-registry counterpart');
  const summary = catalogToMasterSummary(t36!.catalogTemplate!);
  assert.strictEqual(summary.status, 'summary-only');
  assert.ok(summary.workItemCount > 0 && summary.parameterNames.length > 0);
  assert.strictEqual(findUnifiedTemplate('TIDAK-ADA-ID-INI'), undefined);
  console.log(`  ✓ PASSED: Unified list = ${unified.length} entries (180 catalog + master-only), counterparts linked`);

  console.log('\n================================================================');
  console.log('🎉 ALL KATALOG 180 TESTS PASSED SUCCESSFULLY (10/10 GROUPS)');
  console.log('================================================================');
}

runCatalog180Tests().catch(err => {
  console.error('\n❌ KATALOG 180 TEST SUITE FAILED:', err);
  process.exit(1);
});

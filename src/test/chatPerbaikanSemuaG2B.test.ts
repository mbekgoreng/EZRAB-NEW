/**
 * EZRAB — GELOMBANG 2 BLOK B (§17.3 + §17.4 + §17.11) — TEST SUITE
 *
 * Menguji:
 * - G2B-1 (§17.3): penekanan atap tanpa-spek MULTI-GEDUNG (level-aware;
 *   tiap gedung memakai spek atapnya sendiri) + single-building tidak
 *   berubah + total kanonis tidak berubah.
 * - G2B-2 (§17.4): derivasi spek atap jalur TERPANDU dari teks bebas
 *   (eksplisit → CONFIRMED; tanpa sebutan → default spandek berlabel
 *   asumsi; pelewatan eksplisit dihormati).
 * - G2B-3 (§17.11): tipe rumah 54/60/90 di master registry (dapat
 *   dipilih; profil harga diwarisi daftar kerja bersama; hitungan
 *   katalog gabungan 183 TIDAK berubah).
 *
 * Jalankan: npx --yes tsx src/test/chatPerbaikanSemuaG2B.test.ts
 * (HANYA berkas tes ini yang dijalankan pekerja Blok B.)
 */

import { strict as assert } from 'assert';
import * as rab from '../ai-tools/ezrab-ai/universalRab';
import {
  aggregateMultiBuildingRoofSuppression,
  type BuildingRoofCoverage,
} from '../ai-tools/ezrab-ai/multiBuildingRab';
import {
  deriveRoofSpecFromText,
  extractRoofMaterialToken,
} from '../ai-tools/ezrab-ai/specChain';
import type { BuildingModel } from '../ai-tools/ezrab-ai/multiBuilding';
import type { StructuredSpec } from '../ai-tools/ezrab-ai/structuredSpec';
import { findDirectTemplate, buildDirectRab } from '../ai-tools/ezrab-ai/directRab';
import { parseFreeSpec, buildSpecRab } from '../ai-tools/ezrab-ai/specRab';
import { masterBuildingTemplateRegistry } from '../data/buildingTemplates/masterTemplateRegistry';
import { RabTemplateService } from '../services/rabTemplateService';
import { resolveTemplatePickerPricing } from '../components/estimator/templatePickerPricing';

let passed = 0;
let failed = 0;
const failures: string[] = [];
async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  PASS ${name}`);
  } catch (e) {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL ${name}: ${(e as Error).message}`);
  }
}
function eq<T>(actual: T, expected: T, msg: string): void {
  assert.deepEqual(actual, expected, `${msg} (dapat ${JSON.stringify(actual)}, harap ${JSON.stringify(expected)})`);
}
/** Samakan angka dengan toleransi setengah sen (batas ulp float rekonsiliasi). */
function eqRp(actual: number, expected: number, msg: string): void {
  assert.ok(
    Math.abs(actual - expected) < 0.01,
    `${msg} (dapat Rp${actual}, harap Rp${expected})`,
  );
}

function draftOf(text: string, forcedTemplateId?: string, opts?: Parameters<typeof rab.buildUniversalDraft>[2]): rab.UniversalDraft {
  const res = rab.buildUniversalDraft(text, forcedTemplateId, opts);
  assert.equal(res.kind, 'draft', `diharapkan draft, dapat ${res.kind} untuk "${text}"`);
  if (res.kind !== 'draft') throw new Error('unreachable');
  return res.draft;
}

/** Model gedung eksplisit (spanText membawa sebutan material atap gedung itu). */
function mkBuilding(
  id: string, label: string,
  floors: number | null, lengthM: number | null, widthM: number | null,
  span: string,
): BuildingModel {
  return {
    id, label, categoryId: null, floors, floorFunctions: [],
    lengthM, widthM,
    buildingAreaM2: lengthM != null && widthM != null ? lengthM * widthM : null,
    sourceText: span, spanText: span,
  };
}

const NOW = '2026-11-13T00:00:00.000Z';
function S(
  key: string, kind: StructuredSpec['kind'], label: string,
  value: StructuredSpec['value'],
  status: StructuredSpec['status'] = 'CONFIRMED',
  source: StructuredSpec['source'] = 'kuesioner',
): StructuredSpec {
  return { key, kind, label, value, status, source, updatedAt: NOW, supersedes: null };
}

/** Subtotal satu part (item tanpa harga = 0 — sama dengan computeTotals). */
function partSubtotal(part: rab.DraftPart): number {
  return part.generation.items.reduce((s, it) => s + it.volume * (it.unitPrice ?? 0), 0);
}

async function main(): Promise<void> {
  console.log('== G2B-1 (§17.3) — penekanan atap tanpa-spek multi-gedung ==');

  const WAREHOUSE_TEXT =
    'buatkan RAB Gedung A gudang 10 x 20 m atap galvalum + Gedung B gudang 8 x 15 m atap spandek';
  const warehouseBuildings = [
    mkBuilding('gedung-a', 'Gedung A', 1, 20, 10, 'Gedung A gudang 10 x 20 m, atap galvalum'),
    mkBuilding('gedung-b', 'Gedung B', 1, 15, 8, 'Gedung B gudang 8 x 15 m, atap spandek'),
  ];

  await check('G2B-1.01 dua gudang: part atap DITEKAN (total Rp430.480.000, seimbang)', () => {
    const d = draftOf(WAREHOUSE_TEXT, undefined, { buildings: warehouseBuildings });
    eq(d.parts.filter((p) => p.scope.id === 'atap').length, 0, 'tidak ada part atap terpisah');
    eq(d.parts.length, 2, 'tepat 2 part gedung');
    const rec = rab.reconcileMultiBuildingTotals(d);
    eqRp(rec.projectTotal.estimatedTotal, 430480000, 'total proyek dua gudang');
    assert(rec.balanced, 'rekonsiliasi seimbang');
    // Atribusi per gedung (subtotal seksi).
    const secs = rec.sections.filter((s) => s.kind === 'building');
    eq(secs.length, 2, '2 seksi gedung');
    eqRp(secs.find((s) => s.key === 'gedung-a')!.totals.estimatedTotal, 269050000, 'Gedung A Rp269.050.000');
    eqRp(secs.find((s) => s.key === 'gedung-b')!.totals.estimatedTotal, 161430000, 'Gedung B Rp161.430.000');
    // Peringatan penekanan menyebut komponen penutup tiap gedung.
    assert(
      d.warnings.some((w) => w.includes('tidak dibangun terpisah') && w.includes('Gedung A: "Penutup Atap & Dinding Cladding Spandek Zincalume 0.35 mm"')),
      'peringatan penekanan menyebut komponen Gedung A',
    );
    // Galvalum disebut untuk A tetapi tidak ditawarkan template gudang
    // (cladding spandek tetap) → dinyatakan terbuka per gedung; B
    // menyebut spandek (sesuai komponen) → tanpa peringatan itu.
    assert(
      d.warnings.some((w) => w.includes('Gedung A') && w.includes('galvalum') && w.includes('tidak ditawarkan')),
      'peringatan material-tidak-ditawarkan untuk Gedung A',
    );
    assert(
      !d.warnings.some((w) => w.includes('Gedung B') && w.includes('tidak ditawarkan')),
      'tanpa peringatan material untuk Gedung B (spandek sesuai)',
    );
  });

  await check('G2B-1.02 delta penekanan: −Rp114.314.410 (part atap proyek ganda yang dihapus)', () => {
    // Kontrafaktual: teks yang SAMA dengan gedung kantor (tanpa cakupan
    // atap PROFESSIONAL) membangun part atap proyek yang dulu juga
    // dibangun untuk teks gudang — nilainya adalah delta penekanan.
    const counter = draftOf(WAREHOUSE_TEXT, undefined, {
      buildings: [
        mkBuilding('gedung-a', 'Gedung A', 1, 20, 10, 'Gedung A kantor 10 x 20 m'),
        mkBuilding('gedung-b', 'Gedung B', 1, 15, 8, 'Gedung B kantor 8 x 15 m'),
      ],
    });
    const roofPart = counter.parts.find((p) => p.scope.id === 'atap');
    assert(roofPart, 'kontrafaktual harus punya part atap');
    eq(roofPart!.template.id, 'ROOF-METAL-STANDING', 'part atap kontrafaktual');
    eqRp(partSubtotal(roofPart!), 114314410, 'nilai part atap yang dihapus penekanan');
    // Total lama = total baru (dihitung ulang di sini) + part yang
    // dihapus; pekerjaan atap gedung sendiri (cladding spandek) sudah
    // ada di kedua total sehingga bukan bagian delta.
    const newDraft = draftOf(WAREHOUSE_TEXT, undefined, { buildings: warehouseBuildings });
    const newTotal = rab.reconcileMultiBuildingTotals(newDraft).projectTotal.estimatedTotal;
    eqRp(newTotal + partSubtotal(roofPart!), 544794410, 'total lama kontrafaktual Rp544.794.410');
  });

  await check('G2B-1.03 campuran gudang + kantor: part atap DIPERTAHANKAN + peringatan atribusi', () => {
    const d = draftOf(
      'buatkan RAB Gedung A gudang 10 x 20 m + Gedung B 2 lantai 12 x 8 m, atap genteng',
      undefined,
      {
        buildings: [
          mkBuilding('gedung-a', 'Gedung A', 1, 20, 10, 'Gedung A gudang 10 x 20 m'),
          mkBuilding('gedung-b', 'Gedung B', 2, 12, 8, 'Gedung B 2 lantai 12 x 8 m'),
        ],
      },
    );
    const atapParts = d.parts.filter((p) => p.scope.id === 'atap');
    eq(atapParts.length, 1, 'part atap proyek tetap dibangun (kasus campuran)');
    eq(atapParts[0].sectionKind, 'project', 'part atap di tingkat proyek');
    const rec = rab.reconcileMultiBuildingTotals(d);
    eqRp(rec.projectTotal.estimatedTotal, 756423077.76, 'total campuran');
    assert(rec.balanced, 'rekonsiliasi seimbang');
    assert(
      d.warnings.some((w) => w.includes('tetap dibangun di tingkat proyek') && w.includes('Gedung A sudah tercakup') && w.includes('Gedung B belum')),
      'peringatan campuran menyebut gedung tercakup vs belum',
    );
  });

  await check('G2B-1.04 tiap gedung memakai spek atapnya sendiri (override per gedung)', () => {
    // forcedTemplateId MULTITENANT (SELECT roof_material) agar override
    // teramati: penskoran teks mentah memilih WAREHOUSE (atap tetap)
    // untuk 'gudang' — override SELECT tidak teramati lewat teks itu.
    const d = draftOf(WAREHOUSE_TEXT, 'BLD-IND-MULTITENANT', { buildings: warehouseBuildings });
    eq(d.parts.filter((p) => p.scope.id === 'atap').length, 0, 'part atap ditekan');
    const partA = d.parts.find((p) => p.buildingId === 'gedung-a')!;
    const partB = d.parts.find((p) => p.buildingId === 'gedung-b')!;
    eq(partA.evaluatedParams.roof_material, 'galvalum', 'Gedung A memakai galvalum dari span teksnya');
    eq(partB.evaluatedParams.roof_material, 'spandek', 'Gedung B memakai spandek dari span teksnya');
    assert(
      partA.generation.items.some((it) => it.description === 'Penutup Atap Galvalum Gudang'),
      'Gedung A memakai varian Galvalum',
    );
    assert(
      partB.generation.items.some((it) => it.description === 'Penutup Atap Spandek Gudang'),
      'Gedung B memakai varian Spandek',
    );
    assert(
      d.warnings.some((w) => w.includes('Gedung A: "Penutup Atap Galvalum Gudang"') && w.includes('Gedung B: "Penutup Atap Spandek Gudang"')),
      'peringatan penekanan menyebut varian per gedung',
    );
  });

  await check('G2B-1.05 dua gedung kantor + atap genteng: TIDAK ditekan (total Rp902.860.001,76)', () => {
    // BLD-OFFICE-MULTI hanya mendeklarasikan atap lewat komponen
    // COMPREHENSIVE-opsional yang tidak pernah ter-generate di
    // PROFESSIONAL — level-aware: TIDAK tercakup, part atap tetap ada.
    const d = draftOf('buatkan RAB Gedung A 3 lantai 15 x 10 m + Gedung B 2 lantai 12 x 8 m, atap genteng');
    eq(d.parts.filter((p) => p.scope.id === 'atap').length, 1, 'part atap tetap dibangun');
    const rec = rab.reconcileMultiBuildingTotals(d);
    eqRp(rec.projectTotal.estimatedTotal, 902860001.76, 'total kantor + atap');
    assert(rec.balanced, 'rekonsiliasi seimbang');
    assert(
      d.warnings.some((w) => w.includes('dihitung sekali di tingkat proyek')),
      'peringatan tingkat proyek hadir',
    );
  });

  await check('G2B-1.06 contoh kanonis Gate 2 TIDAK BERUBAH: Rp924.102.500', () => {
    // Teks kanonis tidak memuat cakupan atap — §17.3 tidak mengubahnya.
    const d = draftOf('Buatkan RAB Gedung A 3 lantai 15 x 10 m + Gedung B 2 lantai 12 x 8 m, plus jalan akses sepanjang 50 m');
    eq(d.parts.filter((p) => p.scope.id === 'atap').length, 0, 'kanonis tanpa part atap');
    const rec = rab.reconcileMultiBuildingTotals(d);
    eqRp(rec.projectTotal.estimatedTotal, 924102500, 'total kanonis');
    assert(rec.balanced, 'rekonsiliasi seimbang');
  });

  await check('G2B-1.07 single-building TIDAK BERUBAH (jalur Gate 5 utuh)', () => {
    const d = draftOf('buatkan RAB kandang sapi terbuka 17 x 9 m kapasitas 30 ekor penutup atap Galvalum lantai beton miring');
    eq(d.parts.length, 1, 'tepat 1 part (kandang saja)');
    eq(d.parts[0].template.id, 'AGR-LIVESTOCK-BARN', 'template kandang');
    eq(d.parts[0].evaluatedParams.roof_material, 'galvalum', 'override Galvalum jalur Gate 5');
    assert(
      d.warnings.some((w) => w.includes('tidak dibangun terpisah') && w.includes('Penutup Atap Galvalum Kandang')),
      'peringatan penekanan Gate 5 hadir',
    );
  });

  await check('G2B-1.08 unit agregasi: tekan hanya bila SEMUA tercakup', () => {
    const cov = (id: string, covered: boolean): BuildingRoofCoverage => ({
      buildingId: id, label: id, templateId: 'T', templateName: 'T',
      covered, coveringComponent: covered ? 'Atap' : null,
      mentionedMaterial: null, materialOverride: null, materialNotOffered: false,
    });
    eq(aggregateMultiBuildingRoofSuppression([cov('a', true), cov('b', true)]).suppress, true, 'semua tercakup → tekan');
    const mixed = aggregateMultiBuildingRoofSuppression([cov('a', true), cov('b', false)]);
    eq(mixed.suppress, false, 'campuran → dipertahankan');
    eq(mixed.mixed, true, 'campuran ditandai');
    eq(aggregateMultiBuildingRoofSuppression([cov('a', false), cov('b', false)]).suppress, false, 'tak satu pun tercakup → dipertahankan');
    eq(aggregateMultiBuildingRoofSuppression([]).suppress, false, 'tanpa gedung ber-part → tidak ditekan');
  });

  await check('G2B-1.09 unit templateDeclaresRoof level-aware', () => {
    const svc = RabTemplateService.getInstance();
    const office = svc.getTemplateById('BLD-OFFICE-MULTI')!;
    const warehouse = svc.getTemplateById('BLD-IND-WAREHOUSE')!;
    // Kantor: "tercakup" bila semua level dihitung (perilaku Gate 5),
    // TIDAK tercakup bila hanya komponen yang ter-generate di
    // PROFESSIONAL — inilah yang membuat 5E-25 tetap membangun part atap.
    eq(rab.templateDeclaresRoof(office).covered, true, 'kantor tercakup (semua level)');
    eq(rab.templateDeclaresRoof(office, true).covered, false, 'kantor TIDAK tercakup (PROFESSIONAL saja)');
    eq(rab.templateDeclaresRoof(warehouse).covered, true, 'gudang tercakup (semua level)');
    eq(rab.templateDeclaresRoof(warehouse, true).covered, true, 'gudang tercakup (PROFESSIONAL saja)');
  });

  console.log('== G2B-2 (§17.4) — derivasi spek atap jalur terpandu ==');

  const KANDANG_GALV = 'buatkan RAB kandang sapi terbuka 17 x 9 m kapasitas 30 ekor penutup atap Galvalum lantai beton miring';
  const KANDANG_POLOS = 'buatkan RAB kandang sapi terbuka 17 x 9 m kapasitas 30 ekor lantai beton miring';

  await check('G2B-2.01 teks eksplisit → spek CONFIRMED + draft memakai material itu', () => {
    const d = draftOf(KANDANG_GALV, undefined, {
      structuredSpecs: [S('kandang-capacity', 'count', 'Kapasitas kandang', 30)],
    });
    const roof = (d.structuredSpecs ?? []).find((s) => s.key === 'kandang-roof-material');
    assert(roof, 'spek atap terderivasi');
    eq(roof!.value, 'Galvalum', 'nilai spek terderivasi');
    eq(roof!.status, 'CONFIRMED', 'status CONFIRMED (bukan default)');
    eq(roof!.source, 'percakapan', 'sumber percakapan');
    eq(d.parts[0].evaluatedParams.roof_material, 'galvalum', 'draft memakai galvalum');
    assert(
      d.parts[0].generation.items.some((it) => it.description === 'Penutup Atap Galvalum Kandang'),
      'item varian Galvalum hadir',
    );
    assert(
      !d.assumptions.some((a) => a.includes('memakai default template (spandek)')),
      'tanpa asumsi default spandek',
    );
    const cov = d.chainValidation?.specCoverage?.find((c) => c.key === 'kandang-roof-material');
    eq(cov?.status, 'USED', 'spek terderivasi USED di validasi rantai');
  });

  await check('G2B-2.02 tanpa sebutan → default spandek BERLABEL asumsi (perilaku lama)', () => {
    const d = draftOf(KANDANG_POLOS, undefined, {
      structuredSpecs: [S('kandang-capacity', 'count', 'Kapasitas kandang', 30)],
    });
    eq((d.structuredSpecs ?? []).some((s) => s.key === 'kandang-roof-material'), false, 'tanpa spek atap terderivasi');
    eq(d.parts[0].evaluatedParams.roof_material, 'spandek', 'default spandek');
    assert(
      d.assumptions.some((a) => a.includes('Material Penutup Atap memakai default template (spandek)') && a.includes('asumsi')),
      'asumsi default spandek berlabel',
    );
  });

  await check('G2B-2.03 spek atap DILEWATI (UNRESOLVED) dihormati — tidak diisi derivasi', () => {
    const d = draftOf(KANDANG_GALV, undefined, {
      structuredSpecs: [
        S('kandang-capacity', 'count', 'Kapasitas kandang', 30),
        S('kandang-roof-material', 'material', 'Material penutup atap kandang', 'Belum ditentukan', 'UNRESOLVED'),
      ],
    });
    const roof = (d.structuredSpecs ?? []).find((s) => s.key === 'kandang-roof-material');
    eq(roof!.status, 'UNRESOLVED', 'status UNRESOLVED dipertahankan');
    eq(roof!.value, 'Belum ditentukan', 'nilai pelewatan dipertahankan');
    eq(d.parts[0].evaluatedParams.roof_material, 'spandek', 'default spandek (tanpa override)');
  });

  await check('G2B-2.04 gudang-industri: warehouse-roof terderivasi CONFIRMED', () => {
    const d = draftOf('buatkan RAB gudang 10 x 20 m atap galvalum lantai beton', undefined, {
      structuredSpecs: [S('warehouse-floor', 'material', 'Lantai gudang', 'Beton')],
    });
    const roof = (d.structuredSpecs ?? []).find((s) => s.key === 'warehouse-roof');
    assert(roof, 'spek warehouse-roof terderivasi');
    eq(roof!.value, 'Galvalum', 'nilai Galvalum');
    eq(roof!.status, 'CONFIRMED', 'status CONFIRMED');
    eq(roof!.source, 'percakapan', 'sumber percakapan');
  });

  await check('G2B-2.05 gedung: building-roof-type terderivasi → pick deterministik ROOF-TILE-PREMIUM', () => {
    const d = draftOf('buatkan RAB gedung kantor 3 lantai 15 x 10 m atap genteng', undefined, {
      structuredSpecs: [S('building-foundation', 'scope', 'Pondasi', 'Footplat')],
    });
    const roof = (d.structuredSpecs ?? []).find((s) => s.key === 'building-roof-type');
    assert(roof, 'spek building-roof-type terderivasi');
    eq(roof!.value, 'Genteng', 'nilai Genteng');
    const atapPart = d.parts.find((p) => p.scope.id === 'atap');
    assert(atapPart, 'part atap dibangun');
    eq(atapPart!.template.id, 'ROOF-TILE-PREMIUM', 'pick deterministik dari spek terderivasi');
    const cov = d.chainValidation?.specCoverage?.find((c) => c.key === 'building-roof-type');
    eq(cov?.status, 'USED', 'spek terderivasi USED di validasi rantai');
  });

  await check('G2B-2.06 unit deriveRoofSpecFromText: batas-batas', () => {
    eq(deriveRoofSpecFromText('kandang sapi', 'kandang', []), null, 'tanpa sebutan → null');
    eq(deriveRoofSpecFromText('atap galvalum', 'jalan', []), null, 'keluarga tanpa kunci atap → null');
    eq(deriveRoofSpecFromText('atap galvalum', null, []), null, 'tanpa keluarga → null');
    eq(
      deriveRoofSpecFromText('atap galvalum', 'kandang', [S('kandang-roof-material', 'material', 'Atap', 'Spandek')]),
      null,
      'spek atap sudah ada → null',
    );
    // Token mengikuti prioritas extractMaterialToken (satu sumber urutan).
    eq(extractRoofMaterialToken('atap spandek-galvalum'), 'galvalum', 'prioritas galvalum > spandek');
    eq(deriveRoofSpecFromText('atap spandek', 'gudang-industri', [])?.value, 'Spandek', 'label tampilan Spandek');
  });

  console.log('== G2B-3 (§17.11) — tipe rumah 54/60/90 di master registry ==');

  await check('G2B-3.01 registry kini 10 template; T54/T60/T90 terdaftar (status draft, belum direview)', () => {
    const all = masterBuildingTemplateRegistry.getAllTemplates();
    eq(all.length, 10, 'dropdown berisi 10 template');
    for (const [id, code] of [
      ['template-house-type-54-single-floor', 'HOUSE-T54-1FL'],
      ['template-house-type-60-single-floor', 'HOUSE-T60-1FL'],
      ['template-house-type-90-two-floor', 'HOUSE-T90-2FL'],
    ] as const) {
      const byId = masterBuildingTemplateRegistry.getTemplateById(id);
      const byCode = masterBuildingTemplateRegistry.getTemplateById(code);
      assert(byId, `${id} terdaftar`);
      eq(byCode?.id, id, `${code} terdaftar dengan kode yang sama`);
      eq(byId!.status, 'draft', `${id} berstatus draft (baru, belum direview QS)`);
      eq(byId!.reviewStatus.isReviewed, false, `${id} belum direview`);
    }
  });

  await check('G2B-3.02 ketiga tipe dapat dipilih jalur direct (54/60/90 + 54 2 lantai)', () => {
    const cases: Array<[string, number]> = [
      ['buatkan rab rumah type 54', 54],
      ['buatkan rab rumah type 60', 60],
      ['buatkan rab rumah type 90 2 lantai', 180],
      ['buatkan rab rumah type 54 2 lantai', 108],
    ];
    for (const [text, totalArea] of cases) {
      assert(findDirectTemplate(text), `findDirectTemplate cocok: ${text}`);
      const r = buildDirectRab(text);
      assert(r, `buildDirectRab tersusun: ${text}`);
      eq(r!.totalArea, totalArea, `${text}: luas total`);
      eq(r!.calc.items.length, 25, `${text}: 25 item`);
    }
  });

  await check('G2B-3.03 profil harga = T45 (24 ber-harga: 22 benchmark + 2 official; kloset jujur kosong)', () => {
    for (const id of [
      'template-house-type-54-single-floor',
      'template-house-type-60-single-floor',
      'template-house-type-90-two-floor',
    ]) {
      const tpl = masterBuildingTemplateRegistry.getTemplateById(id)!;
      const map = resolveTemplatePickerPricing(tpl);
      eq(map.size, 25, `${id}: 25 item`);
      for (const p of map.values()) eq(p.engineOk, true, `${id}: engineOk`);
      const priced = [...map.values()].filter((p) => p.unitPrice != null);
      eq(priced.length, 24, `${id}: 24 ber-harga`);
      eq(priced.filter((p) => p.priceKind === 'BENCHMARK').length, 22, `${id}: 22 benchmark`);
      eq(priced.filter((p) => p.priceKind === 'OFFICIAL').length, 2, `${id}: 2 official`);
      const unpriced = tpl.workItems
        .filter((w) => map.get(w.stableId)?.unitPrice == null)
        .map((w) => w.defaultAhspCode)
        .sort();
      eq(unpriced, ['A.5.1.1.2'], `${id}: hanya kloset ambigu yang jujur kosong`);
    }
  });

  await check('G2B-3.04 hitungan katalog gabungan 183 TIDAK BERUBAH (registry berbeda)', () => {
    // Master registry (dropdown picker) ≠ katalog RabTemplateService
    // (183 template resmi). Penambahan 3 template master tidak mengubah 183.
    const officials = RabTemplateService.getInstance()
      .getAllTemplates()
      .filter((t) => t.metadata.source === 'EZRAB_OFFICIAL');
    eq(officials.length, 183, 'katalog gabungan tetap 183 template resmi');
  });

  await check('G2B-3.05 parser bebas menolak 54/60/90; type 100 2 lantai tetap konvensi tipe', () => {
    eq(parseFreeSpec('buatkan rab rumah type 54'), null, 'type 54 milik jalur direct');
    eq(parseFreeSpec('buatkan rab rumah type 60'), null, 'type 60 milik jalur direct');
    eq(parseFreeSpec('buatkan rab rumah type 90 2 lantai'), null, 'type 90 milik jalur direct');
    eq(buildSpecRab('buatkan rab rumah type 54'), null, 'buildSpecRab type 54 null');
    const s = parseFreeSpec('buatkan rab rumah type 100 2 lantai')!;
    eq(s.areaSource, 'type', 'type 100: basis konvensi tipe');
    eq(s.typeNumber, 100, 'type 100: nomor tipe');
    eq(s.footprintArea, 100, 'type 100: tapak 100');
    eq(s.totalArea, 200, 'type 100 2 lantai: total 200');
  });

  await check('G2B-3.06 ruang & parameter sesuai katalog (jumlah ruang = luas tipe; KT/KM katalog)', () => {
    const cases: Array<[string, number, number, number, number]> = [
      // [id, jumlah luas ruang, luas bangunan default, KT, KM]
      ['template-house-type-54-single-floor', 54, 54, 3, 1],
      ['template-house-type-60-single-floor', 60, 60, 3, 2],
      ['template-house-type-90-two-floor', 180, 180, 4, 2],
    ];
    for (const [id, spacesSum, area, kt, km] of cases) {
      const tpl = masterBuildingTemplateRegistry.getTemplateById(id)!;
      const sum = tpl.spaces.reduce((s, sp) => s + (sp.defaultArea ?? 0), 0);
      eqRp(sum, spacesSum, `${id}: jumlah luas ruang`);
      eq(tpl.parameters.buildingArea.defaultValue, area, `${id}: luas default`);
      eq(tpl.parameters.bedroomCount.defaultValue, kt, `${id}: ${kt} KT`);
      eq(tpl.parameters.bathroomCount.defaultValue, km, `${id}: ${km} KM`);
    }
  });

  console.log(`\nchatPerbaikanSemuaG2B.test: ${passed} PASS, ${failed} FAIL`);
  if (failures.length) {
    console.log(`Gagal: ${failures.join(' | ')}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * EZRAB — RANTAI SPESIFIKASI → RAB, FASE 2 BAGIAN B — TEST SUITE
 *
 * Menguji src/ai-tools/ezrab-ai/specChain.ts (pemetaan deterministik +
 * validasi) dan integrasinya di universalRab.ts / rabNeeds.ts.
 *
 * CATATAN INTEGRASI (Bagian A belum mendarat saat suite ini ditulis):
 * - `structuredSpec.ts` + `deriveStructuredSpecs` (questionnaire.ts)
 *   BELUM ADA di worktree — suite ini memakai STUB LOKAL bertipe sama
 *   dengan kontrak Bagian A (lihat tipe StructuredSpec di bawah) dan
 *   membangun spek secara literal. Suite ini TIDAK mengimpor
 *   actionRegistry (impor itu gagal dimuat sampai Bagian A mendarat).
 * - Bila Bagian A mengubah bentuk StructuredSpec, stub di sini wajib
 *   diselaraskan; isi tesnya (perilaku) tidak berubah.
 *
 * Jalankan: npx --yes tsx src/test/chatSpecChain.test.ts
 * (HANYA berkas tes ini yang dijalankan subagent Bagian B.)
 */

import { strict as assert } from 'assert';
import {
  buildUniversalDraft,
  extractUniversalSpec,
  mapSpecToParams,
  paramOutOfRangeDetails,
  computeTotals,
  effectiveItems,
  formatUniversalDraftMessage,
  draftReadiness,
  type UniversalDraft,
} from '../ai-tools/ezrab-ai/universalRab';
import {
  MATERIAL_BINDING,
  lookupMaterialBinding,
  resolveDeterministicPick,
  suppressedScopes,
  booleanParamOverrides,
  selectParamOverrides,
  materialStatusForItem,
  validateDraftChain,
  familyIdFromSpecs,
} from '../ai-tools/ezrab-ai/specChain';
import { isNegatedAt } from '../ai-tools/ezrab-ai/rabNeeds';
import { RabTemplateService } from '../services/rabTemplateService';

/* ---- Stub lokal kontrak Bagian A (lihat kepala berkas) ---- */
type SpecStatus = 'CONFIRMED' | 'ASSUMPTION' | 'RECOMMENDATION' | 'UNRESOLVED';
type SpecKind = 'material' | 'dimension' | 'count' | 'scope' | 'quality' | 'condition';
interface StructuredSpec {
  key: string;
  kind: SpecKind;
  label: string;
  value: string | number | string[] | boolean | null;
  unit?: string;
  status: SpecStatus;
  source: 'kuesioner' | 'percakapan' | 'default-template';
  updatedAt: string;
  supersedes?: string | null;
}
const NOW = '2026-11-12T03:00:00.000Z';
function S(
  key: string, kind: SpecKind, label: string,
  value: StructuredSpec['value'],
  status: SpecStatus = 'CONFIRMED',
  source: StructuredSpec['source'] = 'kuesioner',
): StructuredSpec {
  return { key, kind, label, value, status, source, updatedAt: NOW, supersedes: null };
}

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  PASS ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`  FAIL ${name}: ${(e as Error).message}`);
  }
}

function draftOf(text: string, specs?: StructuredSpec[], forcedTemplateId?: string): UniversalDraft {
  const res = buildUniversalDraft(
    text, forcedTemplateId,
    specs ? { structuredSpecs: specs } : undefined,
  );
  assert.equal(res.kind, 'draft', `diharapkan draft, dapat ${res.kind} untuk "${text}"`);
  if (res.kind !== 'draft') throw new Error('unreachable');
  return res.draft;
}

const KANDANG_TEXT =
  // 'lantai beton miring' SENGAJA ada (tanpa kata 'drainase' agar tidak
  // memicu scope drainase mandiri): 'beton' memberi sinyal skor yang
  // membuat Green Roof menang 23 vs 20 seperti rekonstruksi audit §1.
  'buatkan RAB kandang sapi terbuka 17 x 9 m kapasitas 30 ekor penutup atap Galvalum lantai beton miring anggaran 300 juta anggaran 250 juta';
function kandangSpecs(capacity = 30): StructuredSpec[] {
  return [
    S('kandang-capacity', 'count', 'Kapasitas kandang', capacity),
    S('kandang-roof-material', 'material', 'Material penutup atap kandang', 'Galvalum'),
    // kind 'budget' kanonis Bagian A = 'condition'; validasi memakai
    // kunci 'budget', bukan kind-nya.
    S('budget', 'condition', 'Anggaran', 250_000_000),
  ];
}

console.log('== 0. Tanpa opts → perilaku lama (tanpa spek, tanpa validasi) ==');

test('tanpa opts (GATE 5 / 5E): draft kandang TANPA part atap terpisah — cacat audit §1 ditutup', () => {
  // DIPERBARUI TERBUKA (GATE 5 / 5E, 2026-11-12 — gelombang kalibrasi
  // yang tertunda dari Fase 2): cacat audit §1 di jalur TANPA spek
  // (part atap terpisah yang salah — dulu Green Roof skor 23, lalu
  // ROOF-CONCRETE-DECK skor 27 — + atap ganda) DITUTUP oleh penekanan
  // atap tanpa-spek (computeNoSpecRoofSuppression, universalRab):
  // bila template keluarga (kandang/gudang) sudah mendeklarasikan
  // penutup atap, part atap mandiri TIDAK dibangun; material yang
  // disebut pengguna ("Galvalum") diteruskan sebagai override varian
  // SELECT template keluarga. Pin lama (part atap terpisah WAJIB ada)
  // adalah pin CACAT — diganti pin perilaku benar ini. Alur tanpa-spek
  // tetap tanpa validasi rantai (chainValidation/ambiguousPicks
  // undefined) — yang berubah hanya part atapnya.
  const d = draftOf(KANDANG_TEXT);
  assert.equal(d.chainValidation, undefined);
  assert.equal(d.ambiguousPicks, undefined);
  assert.equal(d.parts.length, 1, 'tanpa spek: tepat 1 part (kandang saja)');
  assert.equal(d.parts[0].template.id, 'AGR-LIVESTOCK-BARN', 'tanpa spek: template kandang');
  assert.ok(
    !d.parts.some((p) => p.template.id.startsWith('ROOF-')),
    'tanpa spek: TIDAK BOLEH ada part atap terpisah (cacat §1 ditutup)',
  );
  const items = d.parts[0].generation.items.map((i) => i.description);
  assert.ok(
    items.includes('Penutup Atap Galvalum Kandang'),
    'tanpa spek: Galvalum yang disebut pengguna dihormati sebagai varian atap kandang',
  );
  assert.ok(
    d.warnings.some((w) => w.includes('tidak dibangun terpisah')),
    'tanpa spek: peringatan penekanan atap hadir (transparan, bukan diam-diam)',
  );
});

test('extractUniversalSpec: budget last-match 250 jt + count ekor', () => {
  const spec = extractUniversalSpec(KANDANG_TEXT);
  assert.equal(spec.budgetCap, 250_000_000, 'cap harus kemunculan TERAKHIR (250 jt), bukan first-match 300 jt');
  assert.equal(spec.count, 30, '"30 ekor" harus terbaca sebagai count');
  assert.equal(spec.areaM2, 153, 'tapak 17x9 = 153 m²');
});

console.log('== A. Pemetaan deterministik (specChain, tanpa draft) ==');

test('MATERIAL_BINDING: Galvalum/Asbes kandang AVAILABLE, makadam/foot plat AVAILABLE, telford UNAVAILABLE', () => {
  // DIPERBARUI TERBUKA (keputusan katalog owner 2026-11-12 03:41):
  // Galvalum & Asbes kandang, makadam, dan foot plat kini AVAILABLE —
  // varian ditambahkan ke katalog dengan harga resmi (3.1.3.8 /
  // 3.1.2.1 / F.46 / FND-FOOT-PLAT). Telford tetap UNAVAILABLE
  // (0 hit di data resmi) — bukan pelemahan tes, melainkan perilaku
  // baru yang diperintahkan.
  assert.equal(lookupMaterialBinding('atap-kandang', 'galvalum'), 'AVAILABLE');
  assert.equal(lookupMaterialBinding('atap-kandang', 'asbes'), 'AVAILABLE');
  assert.equal(lookupMaterialBinding('atap-kandang', 'spandek'), 'AVAILABLE');
  assert.equal(lookupMaterialBinding('atap-kandang', 'genteng'), 'AVAILABLE');
  assert.equal(lookupMaterialBinding('atap-gudang', 'spandek'), 'AVAILABLE');
  assert.equal(lookupMaterialBinding('atap-gudang', 'galvalum'), 'AVAILABLE');
  assert.equal(lookupMaterialBinding('atap-gudang', 'zincalume'), 'AVAILABLE');
  assert.equal(lookupMaterialBinding('atap-gudang', 'genteng metal'), 'UNAVAILABLE');
  assert.equal(lookupMaterialBinding('lantai-gudang', 'paving'), 'AVAILABLE');
  assert.equal(lookupMaterialBinding('atap-gedung', 'dak beton'), 'AVAILABLE');
  assert.equal(lookupMaterialBinding('perkerasan-jalan', 'telford'), 'UNAVAILABLE');
  assert.equal(lookupMaterialBinding('perkerasan-jalan', 'makadam'), 'AVAILABLE');
  assert.equal(lookupMaterialBinding('perkerasan-jalan', 'hotmix'), 'AVAILABLE');
  assert.equal(lookupMaterialBinding('pondasi', 'foot plat'), 'AVAILABLE');
  assert.equal(lookupMaterialBinding('pondasi', 'bore pile'), 'AVAILABLE');
  assert.equal(MATERIAL_BINDING['lantai-gudang:beton'], 'UNVERIFIED', 'beton biasa gudang hanya SEBAGIAN → UNVERIFIED');
});

test("resolveDeterministicPick: 'bore pile' → FND-BORED-PILE (alias eksplisit, bukan substring)", () => {
  const ranked = [
    { template: { id: 'FND-BORED-PILE', name: 'Pondasi Bored Pile Gedung' }, score: 20 },
    { template: { id: 'FND-DRIVEN-PILE', name: 'Pondasi Tiang Pancang' }, score: 20 },
  ];
  const got = resolveDeterministicPick(
    { id: 'pondasi' },
    [S('building-foundation', 'scope', 'Pondasi', 'Bore pile')],
    ranked,
  );
  assert.ok(got && got.templateId === 'FND-BORED-PILE');
  const driven = resolveDeterministicPick(
    { id: 'pondasi' },
    [S('building-foundation', 'scope', 'Pondasi', 'Tiang pancang')],
    ranked,
  );
  assert.ok(driven && driven.templateId === 'FND-DRIVEN-PILE');
  // 'bore pile' BUKAN substring 'Bored Pile' — buktikan alias yang bekerja:
  assert.ok(!'Pondasi Bored Pile Gedung (per Titik Bor)'.toLowerCase().includes('bore pile'));
});

test('resolveDeterministicPick: telford / batu kali → null (jangan memaksa template salah); makadam & foot plat → template baru', () => {
  // DIPERBARUI TERBUKA (keputusan katalog owner 2026-11-12 03:41):
  // 'Telford / makadam' dulu null karena KEDUANYA tak ada template;
  // kini makadam punya INFRA-ROAD-MACADAM dan foot plat punya
  // FND-FOOT-PLAT — kasus telford MURNI tetap null, kasus makadam &
  // foot plat kini terpetakan. Bukan pelemahan: telford & batu kali
  // tetap null seperti semula.
  const roadRanked = [
    { template: { id: 'INFRA-ROAD-RIGID', name: 'Jalan Beton Semen' }, score: 20 },
    { template: { id: 'INFRA-ROAD-ASPHALT', name: 'Jalan Aspal Hotmix' }, score: 20 },
    { template: { id: 'INFRA-ROAD-MACADAM', name: 'Jalan Lapis Penetrasi Makadam (Lapen)' }, score: 20 },
  ];
  assert.equal(
    resolveDeterministicPick({ id: 'jalan' }, [S('road-pavement', 'material', 'Perkerasan', 'Telford')], roadRanked),
    null,
  );
  assert.ok(
    resolveDeterministicPick(
      { id: 'jalan' },
      [S('road-pavement', 'material', 'Perkerasan', 'Telford / makadam')],
      roadRanked,
    )?.templateId === 'INFRA-ROAD-MACADAM',
    'nilai gabungan Telford/makadam memetakan ke makadam (varian yang ADA)',
  );
  const fndRanked = [
    { template: { id: 'FND-BORED-PILE', name: 'Pondasi Bored Pile' }, score: 20 },
    { template: { id: 'FND-FOOT-PLAT', name: 'Pondasi Foot Plat / Telapak (Titik Kolom)' }, score: 20 },
  ];
  assert.equal(
    resolveDeterministicPick({ id: 'pondasi' }, [S('building-foundation', 'scope', 'Pondasi', 'Pasangan batu kali')], fndRanked),
    null,
  );
  assert.ok(
    resolveDeterministicPick(
      { id: 'pondasi' },
      [S('building-foundation', 'scope', 'Pondasi', 'Foot plat')],
      fndRanked,
    )?.templateId === 'FND-FOOT-PLAT',
  );
  assert.ok(
    resolveDeterministicPick(
      { id: 'jalan' },
      [S('road-pavement', 'material', 'Perkerasan', 'Aspal hotmix')],
      roadRanked,
    )?.templateId === 'INFRA-ROAD-ASPHALT',
  );
  assert.ok(
    resolveDeterministicPick(
      { id: 'atap' },
      [S('building-roof-type', 'scope', 'Atap', 'Genteng (pelana/limasan)')],
      [{ template: { id: 'ROOF-TILE-PREMIUM', name: 'Atap Genteng Keramik Premium' }, score: 20 }],
    )?.templateId === 'ROOF-TILE-PREMIUM',
  );
  assert.ok(
    resolveDeterministicPick(
      { id: 'atap' },
      [S('building-roof-type', 'scope', 'Atap', 'Dak beton')],
      [{ template: { id: 'ROOF-CONCRETE-DECK', name: 'Dak Beton Atap + Waterproofing (Plat Beton Bertulang)' }, score: 20 }],
    )?.templateId === 'ROOF-CONCRETE-DECK',
  );
});

test("suppressedScopes: road-drainage 'eksisting' → drainase; family kandang/gudang → atap", () => {
  assert.ok(suppressedScopes([S('road-drainage', 'scope', 'Drainase', 'Mengikuti drainase eksisting')], 'jalan').has('drainase'));
  assert.ok(suppressedScopes([S('road-drainage', 'scope', 'Drainase', 'Dengan drainase samping baru')], 'jalan').size === 0);
  assert.ok(suppressedScopes(kandangSpecs(), 'kandang').has('atap'));
  assert.ok(suppressedScopes([S('warehouse-roof', 'material', 'Atap gudang', 'Spandek')], 'gudang-industri').has('atap'));
  assert.equal(suppressedScopes([], null).size, 0);
  assert.equal(familyIdFromSpecs(kandangSpecs()), 'kandang');
});

test('booleanParamOverrides: baru→true, tanpa/eksisting→false; hanya has_drainage', () => {
  assert.deepEqual(booleanParamOverrides([S('road-drainage', 'scope', 'Drainase', 'Dengan drainase samping baru')]), { has_drainage: true });
  assert.deepEqual(booleanParamOverrides([S('road-drainage', 'scope', 'Drainase', 'Tanpa drainase')]), { has_drainage: false });
  assert.deepEqual(booleanParamOverrides([S('road-drainage', 'scope', 'Drainase', 'Mengikuti drainase eksisting')]), { has_drainage: false });
  assert.deepEqual(booleanParamOverrides([]), {});
});

test("materialStatusForItem: 'spandek-galvalum' diminta sbg galvalum; MATCHED/SUBSTITUTED/NOT_APPLICABLE", () => {
  const galv = [S('kandang-roof-material', 'material', 'Atap', 'Galvalum')];
  const st = materialStatusForItem('Penutup Atap Spandek Kandang', galv, 'pertanian');
  assert.equal(st.status, 'SUBSTITUTED');
  assert.equal(st.requestedMaterial, 'galvalum');
  assert.equal(st.itemMaterial, 'spandek');
  const span = [S('kandang-roof-material', 'material', 'Atap', 'Spandek')];
  assert.equal(materialStatusForItem('Penutup Atap Spandek Kandang', span, 'pertanian').status, 'MATCHED');
  // Rangka BUKAN penutup — frame 'Seng' tidak boleh SUBSTITUTED saat
  // penutup yang diminta Galvalum (positif-palsu, ditemukan C2
  // katalog 2026-11-12; perbaikan di materialStatusForItem).
  assert.equal(materialStatusForItem('Rangka Atap Seng Baja Ringan Kandang', galv, 'pertanian').status, 'NOT_APPLICABLE');
  assert.equal(materialStatusForItem('Rangka Atap Pelana Baja Ringan C75 + Genteng Beton', galv, 'gedung').status, 'NOT_APPLICABLE');
  // Varian gabungan 'Spandek / galvalum' = permintaan galvalum (bahan pelapisnya).
  const combined = [S('building-roof-type', 'scope', 'Atap', 'Spandek / galvalum')];
  assert.equal(materialStatusForItem('Penutup Atap Genteng Keramik Glazur', combined, 'gedung').requestedMaterial, 'galvalum');
  assert.equal(materialStatusForItem('Pembersihan & Pengupasan Lahan Kandang', galv, 'pertanian').status, 'NOT_APPLICABLE');
});

console.log('== C1. Kandang: kapasitas 30 ekor tertelusur ==');

test('C1: kapasitas 30 ekor → num_animals=30 (bukan default 60) + spek USED', () => {
  const d = draftOf(KANDANG_TEXT, kandangSpecs(30));
  assert.equal(d.spec.count, 30);
  assert.equal(d.parts.length, 1, 'hanya part pertanian (atap ter-suppress)');
  assert.equal(d.parts[0].template.id, 'AGR-LIVESTOCK-BARN');
  assert.equal(d.parts[0].evaluatedParams.num_animals, 30);
  assert.ok(d.parts[0].evaluatedParams.barn_area === 153);
  const cv = d.chainValidation!;
  assert.ok(cv, 'chainValidation harus ada bila spek diberikan');
  const cap = cv.specCoverage.find((s) => s.key === 'kandang-capacity');
  assert.equal(cap?.status, 'USED');
  assert.ok(cap!.usedBy.some((u) => u.includes('num_animals=30')));
});

console.log('== C2. Galvalum → MATCHED + OFFICIAL_AHSP (keputusan katalog owner 2026-11-12 03:41) ==');

test('C2: atap Galvalum → item Galvalum Rp135.600 OFFICIAL_AHSP (3.1.3.8), tanpa NEEDS_MANUAL_PRICE atap', () => {
  // DITULIS ULANG TERBUKA — perilaku LAMA (item tetap Spandek
  // Rp215.375 MARKET_REFERENCE + NEEDS_MANUAL_PRICE) DIGANTI oleh
  // keputusan katalog owner: Galvalum kini komponen katalog resmi
  // (AGR-LIVESTOCK-BARN, padanan AHSP 3.1.3.8 "atap metal menerus
  // tebal 0,4 mm", Rp135.600/m² FULL via resolver). Kode G.190 &
  // harga Rp215.375 lama DIHAPUS dari template — G.190 di master
  // Bina Marga adalah "Landasan Elastomerik Karet Sintetis", bukan
  // atap, dan Rp215.375 tidak bersumber resmi mana pun.
  const d = draftOf(KANDANG_TEXT, kandangSpecs(30));
  const items = effectiveItems(d);
  const roof = items.find((i) => i.description === 'Penutup Atap Galvalum Kandang');
  assert.ok(roof, 'item atap Galvalum harus ada di part barn');
  assert.equal(roof!.unitPrice, 135600, 'harga resmi resolver 3.1.3.8 (Rp123.274 × 1,1 — lihat laporan)');
  assert.equal(roof!.priceSourceKind, 'OFFICIAL_AHSP', 'harga Galvalum adalah harga resmi AHSP, bukan referensi');
  assert.ok(!items.some((i) => i.description === 'Penutup Atap Spandek Kandang'), 'tidak boleh ada item Spandek pengganti');
  assert.ok(!items.some((i) => i.description.includes('Asbes') || i.description.includes('Genteng Kandang')), 'hanya varian Galvalum yang muncul');
  const cv = d.chainValidation!;
  assert.equal(cv.priceChecks.substituted, 0, 'tidak ada substitusi material di draft ini');
  assert.ok(!cv.materialMismatches.some((m) => m.requested === 'galvalum'), 'tidak boleh ada mismatch galvalum');
  const msg = formatUniversalDraftMessage(d);
  assert.ok(msg.includes('Laporan validasi rantai spesifikasi'), 'seksi validasi harus tampil di pesan draft');
  assert.ok(!msg.includes('NEEDS_MANUAL_PRICE'), 'draft Galvalum tidak boleh lagi menandai NEEDS_MANUAL_PRICE');
  assert.ok(msg.includes('Galvalum') || msg.includes('galvalum'));
});

console.log('== C3. Revisi satu medan tidak menghapus medan lain ==');

test('C3: kapasitas 30→40 — material tetap Galvalum/MATCHED, budget tetap 250 jt', () => {
  const v1 = draftOf(KANDANG_TEXT, kandangSpecs(30));
  const text40 = KANDANG_TEXT.replace('kapasitas 30 ekor', 'kapasitas 40 ekor');
  const v2 = draftOf(text40, kandangSpecs(40));
  assert.equal(v2.parts[0].evaluatedParams.num_animals, 40);
  assert.equal(v2.chainValidation!.budget.cap, 250_000_000);
  // DIPERBARUI TERBUKA (keputusan katalog owner 2026-11-12 03:41):
  // jejak Galvalum kini MATCHED (item Galvalum resmi), bukan
  // SUBSTITUTED Spandek — revisi kapasitas tetap tidak boleh
  // menghapus jejak material itu.
  assert.ok(effectiveItems(v2).some((i) => i.description === 'Penutup Atap Galvalum Kandang'), 'revisi kapasitas tidak boleh menghapus item Galvalum');
  assert.ok(!v2.chainValidation!.materialMismatches.some((m) => m.requested === 'galvalum'), 'tidak boleh muncul mismatch galvalum sesudah revisi');
  assert.equal(v1.chainValidation!.budget.cap, 250_000_000);
});

console.log('== C4. Spek tak terpakai tercatat ==');

test("C4: kandang-manure 'Belum ditentukan' → UNUSED; sekat → UNUSED (tak ada komponen)", () => {
  const specs = [
    ...kandangSpecs(30),
    S('kandang-manure', 'scope', 'Pengelolaan kotoran', 'Belum ditentukan', 'UNRESOLVED'),
    S('kandang-facilities', 'scope', 'Fasilitas kandang', ['Palung pakan & tempat minum', 'Sekat kandang']),
  ];
  const d = draftOf(KANDANG_TEXT, specs);
  const cv = d.chainValidation!;
  const manure = cv.specCoverage.find((s) => s.key === 'kandang-manure');
  assert.equal(manure?.status, 'UNUSED');
  assert.ok(/belum ditentukan/i.test(manure?.reason ?? ''));
  const fac = cv.specCoverage.find((s) => s.key === 'kandang-facilities');
  assert.equal(fac?.status, 'UNUSED');
  assert.ok(/sekat/i.test(fac?.reason ?? ''), 'alasan harus menyebut sekat tak ada komponennya');
});

console.log('== C5. Volume tanpa dasar dimensi berlabel ASSUMPTION ==');

test('C5a: paving_area default 600 m² → ASSUMPTION + FLAG (volume yatim dari panjang 2000 m)', () => {
  // TANPA 'lebar 6 m': dengan lebar, luas terderivasi 2000×6 sehingga
  // paving_area BUKAN default (kasus audit: paving + panjang saja).
  const d = draftOf(
    'buatkan RAB jalan paving blok sepanjang 2 km',
    [S('road-pavement', 'material', 'Perkerasan', 'Paving blok')],
  );
  assert.equal(d.parts[0].template.id, 'PAV-KOMPLEK-6CM');
  const cv = d.chainValidation!;
  const paving = cv.itemLinks.find((i) => i.description.includes('Paving Block K-300'));
  assert.ok(paving, 'item paving harus ada');
  assert.equal(paving!.basis, 'ASSUMPTION');
  assert.ok(paving!.basisDetail.includes('paving_area=600'), `detail harus menyebut default paving_area=600, dapat: ${paving!.basisDetail}`);
  const check = cv.volumeChecks.find((v) => v.description.includes('Paving Block K-300'));
  assert.equal(check?.verdict, 'FLAG');
  assert.ok(/yatim|tidak tertaut/i.test(check?.detail ?? ''));
  const kanstin = cv.itemLinks.find((i) => i.description.includes('Kanstin Beton Pengunci'));
  assert.equal(kanstin?.basis, 'USER_DIMENSION', 'kanstin memakai curb_length dari panjang pengguna (2000 m)');
});

test('C5b: num_docks default 8 → ASSUMPTION + FLAG', () => {
  // Template dipaksa ke BLD-IND-MULTITENANT (template gudang audit):
  // pick teks polos 'gudang 5000 m2' jatuh ke BLD-IND-WAREHOUSE.
  const d = draftOf(
    'buatkan RAB gudang 5000 m2',
    [S('warehouse-roof', 'material', 'Atap gudang', 'Spandek')],
    'BLD-IND-MULTITENANT',
  );
  assert.equal(d.parts[0].template.id, 'BLD-IND-MULTITENANT');
  const cv = d.chainValidation!;
  const dock = cv.itemLinks.find((i) => i.description.includes('Pintu Dock Sectional'));
  assert.ok(dock, 'item dock harus ada');
  assert.equal(dock!.basis, 'ASSUMPTION');
  assert.ok(dock!.basisDetail.includes('num_docks=8'));
  assert.equal(cv.volumeChecks.find((v) => v.description.includes('Pintu Dock Sectional'))?.verdict, 'FLAG');
});

console.log('== C6. Harga hilang = null + unresolved, total parsial ==');

test('C6: lantai kandang 3.10.10 tetap UNRESOLVED (unitPrice null, bukan Rp0)', () => {
  const d = draftOf(KANDANG_TEXT, kandangSpecs(30));
  const floor = effectiveItems(d).find((i) => i.description.startsWith('Lantai Beton Kandang Miring Drainase'));
  assert.ok(floor, 'item lantai kandang harus ada');
  assert.equal(floor!.priceStatus, 'PRICE_UNRESOLVED');
  assert.equal(floor!.unitPrice, null);
  const totals = computeTotals(d);
  assert.ok(totals.unpricedCount >= 1);
  assert.equal(totals.status, 'PARSIAL');
  assert.ok(d.chainValidation!.priceChecks.unresolved >= 1);
});

console.log('== C7. Budget 300→250: cap benar + OVER ==');

test('C7: cap 250 jt (last-match) + validasi OVER dengan diff = total - cap', () => {
  // Tapak 30×15 m (450 m²): total barn-only tetap > 250 jt sehingga
  // verdict OVER bermakna. (Contoh audit 153 m² totalnya 258,48 jt
  // HANYA karena memuat Green Roof — sesudah suppression atap, total
  // barn-only 153 m² jatuh DI BAWAH 250 jt; memakai tapak itu untuk
  // C7 akan menguji UNDER, bukan OVER.)
  const text = 'buatkan RAB kandang sapi terbuka 30 x 15 m kapasitas 30 ekor penutup atap Galvalum anggaran 300 juta anggaran 250 juta';
  const d = draftOf(text, kandangSpecs(30));
  assert.equal(d.spec.budgetCap, 250_000_000);
  const b = d.chainValidation!.budget;
  assert.equal(b.cap, 250_000_000);
  assert.equal(b.verdict, 'OVER');
  assert.equal(b.diff, b.total - 250_000_000);
  assert.ok(b.total > 250_000_000);
  const msg = formatUniversalDraftMessage(d);
  assert.ok(msg.includes('MELEBIHI'), 'pesan harus menyatakan MELEBIHI anggaran');
});

console.log('== C8. Gudang + jalan ==');

test("C8a: gudang 'rolling door saja' → tidak ada part dock/atap baru; atap Spandek MATCHED (varian katalog baru)", () => {
  const specs = [
    S('warehouse-roof', 'material', 'Atap gudang', 'Spandek'),
    S('warehouse-loading', 'scope', 'Loading gudang', 'Tanpa dock — pintu rolling door saja'),
  ];
  // Template dipaksa ke BLD-IND-MULTITENANT (template gudang audit);
  // pick teks polos jatuh ke BLD-IND-WAREHOUSE.
  const d = draftOf('buatkan RAB gudang 5000 m2 penutup atap Spandek tanpa dock', specs, 'BLD-IND-MULTITENANT');
  assert.equal(d.parts.length, 1, 'hanya part gedung (atap ter-suppress, tanpa part dock)');
  assert.equal(d.parts[0].template.id, 'BLD-IND-MULTITENANT');
  assert.ok(!d.parts.some((p) => p.scope.id === 'atap'));
  // DIPERBARUI TERBUKA (keputusan katalog owner 2026-11-12 03:41):
  // Spandek gudang kini komponen resmi (3.1.3.8, Rp135.600/m²
  // OFFICIAL_AHSP) — dulu atap tetap UPVC + SUBSTITUTED.
  const roof = effectiveItems(d).find((i) => i.description === 'Penutup Atap Spandek Gudang');
  assert.ok(roof, 'atap gudang kini Spandek dari varian katalog');
  assert.equal(roof!.unitPrice, 135600);
  assert.equal(roof!.priceSourceKind, 'OFFICIAL_AHSP');
  const st = materialStatusForItem(roof!.description, specs, 'gedung');
  assert.equal(st.status, 'MATCHED');
  assert.equal(st.requestedMaterial, 'spandek');
  assert.equal(st.itemMaterial, 'spandek');
  const loading = d.chainValidation!.specCoverage.find((s) => s.key === 'warehouse-loading');
  assert.equal(loading?.status, 'UNUSED');
  assert.ok(/num_docks/i.test(loading?.reason ?? ''), 'alasan harus jujur: dock tetap dari default template');
  // BATASAN JUJUR: item dock 8 pintu tetap hadir (num_docks tidak
  // dipetakan dari jawaban loading; memaksa 0 akan mengarang semantik
  // — lihat laporan Bagian B).
  const dock = effectiveItems(d).find((i) => i.description.includes('Pintu Dock Sectional'));
  assert.ok(dock, 'item dock tetap ada (batasan terdokumentasi, bukan diam-diam hilang)');
  assert.equal(dock!.volume, 8);
});

test("C8b: road-drainage 'tanpa drainase' → tidak ada part drainase kedua + has_drainage=false", () => {
  const specs = [
    S('road-pavement', 'material', 'Perkerasan', 'Beton / rigid'),
    S('road-drainage', 'scope', 'Drainase jalan', 'Tanpa drainase'),
  ];
  const d = draftOf('buatkan RAB jalan beton sepanjang 2 km lebar 6 m drainase jalan tanpa drainase', specs);
  assert.ok(!d.parts.some((p) => p.scope.id === 'drainase'), 'tidak boleh ada part drainase kedua');
  const road = d.parts.find((p) => p.template.id === 'INFRA-ROAD-RIGID');
  assert.ok(road, 'part jalan rigid harus ada');
  assert.equal(road!.evaluatedParams.has_drainage, false, 'has_drainage harus false dari jawaban');
  assert.ok(d.warnings.some((w) => w.includes('tidak dibangun') && w.includes('Tanpa drainase')));
  const cov = d.chainValidation!.specCoverage.find((s) => s.key === 'road-drainage');
  assert.equal(cov?.status, 'USED', 'spek drainase terpakai sebagai penekanan scope');
  // BATASAN JUJUR: komponen c-drain-rigid di DALAM part jalan tidak
  // punya condition atas has_drainage di katalog, jadi item saluran
  // pasangan batu itu tetap ter-generate — lihat laporan Bagian B.
});

test('C8c: jalan hotmix→ASPHALT, rigid→RIGID, makadam→MACADAM, telford→AMBIGUOUS_PICK + tetap draft', () => {
  const hot = draftOf(
    'buatkan RAB jalan aspal hotmix sepanjang 1 km lebar 6 m',
    [S('road-pavement', 'material', 'Perkerasan', 'Aspal hotmix')],
  );
  assert.equal(hot.parts[0].template.id, 'INFRA-ROAD-ASPHALT');
  const rig = draftOf(
    'buatkan RAB jalan beton sepanjang 1 km lebar 6 m',
    [S('road-pavement', 'material', 'Perkerasan', 'Beton / rigid')],
  );
  assert.equal(rig.parts[0].template.id, 'INFRA-ROAD-RIGID');
  // DIPERBARUI TERBUKA (keputusan katalog owner 2026-11-12 03:41):
  // makadam kini punya template INFRA-ROAD-MACADAM (F.46) — kasus
  // AMBIGUOUS_PICK kini hanya telford MURNI, bukan 'Telford /
  // makadam' (nilai gabungan itu memetakan ke makadam, varian yang
  // ADA). Bukan pelemahan: telford tetap tanpa template.
  const mac = draftOf(
    'buatkan RAB jalan makadam sepanjang 1 km lebar 6 m',
    [S('road-pavement', 'material', 'Perkerasan', 'Makadam')],
  );
  assert.equal(mac.parts[0].template.id, 'INFRA-ROAD-MACADAM');
  const macItem = effectiveItems(mac).find((i) => i.description.includes('Makadam'));
  assert.ok(macItem, 'item lapis makadam harus ada');
  assert.equal(macItem!.priceSourceKind, 'OFFICIAL_AHSP', 'makadam F.46 harus OFFICIAL_AHSP');
  assert.ok(Math.abs(macItem!.unitPrice! - 1723874.06) < 0.01, `harga lapangan F.46 Rp1.723.874,06/m³, dapat ${macItem!.unitPrice}`);
  const tel = draftOf(
    'buatkan RAB jalan telford sepanjang 1 km lebar 6 m',
    [S('road-pavement', 'material', 'Perkerasan', 'Telford')],
  );
  // draftOf sudah menegaskan kind==='draft'; telford tetap
  // menghasilkan draft (bukan needs-spec), tapi berpenanda.
  const amb = tel.chainValidation!.ambiguousPicks.find((a) => a.scope === 'jalan');
  assert.ok(amb, 'telford harus tercatat sebagai AMBIGUOUS_PICK');
  assert.ok(/telford/i.test(amb!.reason), `alasan harus menyebut telford, dapat: ${amb!.reason}`);
  assert.ok(amb!.candidates.length > 0);
});

console.log('== C9. Pondasi ==');

test("C9a: 'bore pile' → FND-BORED-PILE (bukan FND-DRIVEN-PILE)", () => {
  const d = draftOf(
    'buatkan RAB gedung kantor 3 lantai luas 900 m2 pondasi bore pile',
    [S('building-foundation', 'scope', 'Pondasi', 'Bore pile')],
  );
  assert.ok(d.parts.some((p) => p.template.id === 'FND-BORED-PILE'));
  assert.ok(!d.parts.some((p) => p.template.id === 'FND-DRIVEN-PILE'));
});

test("C9b: 'batu kali' → gap tipe terpenuhi (tidak BLOCKED karena tipe) + AMBIGUOUS_PICK", () => {
  const d = draftOf(
    'buatkan RAB gedung kantor 3 lantai luas 900 m2 pondasi batu kali',
    [S('building-foundation', 'scope', 'Pondasi', 'Pasangan batu kali')],
  );
  const readiness = draftReadiness(d);
  assert.ok(readiness.status !== 'BLOCKED', `batu kali yang sudah ditentukan tipenya tidak boleh BLOCKED; alasan: ${readiness.blockedReasons.join('; ')}`);
  assert.ok(!readiness.blockedReasons.some((r) => /Jenis pondasi/.test(r)));
  const amb = d.chainValidation!.ambiguousPicks.find((a) => a.scope === 'pondasi');
  assert.ok(amb, 'batu kali (tak ada template) harus tercatat AMBIGUOUS_PICK');
  assert.ok(/batu kali/i.test(amb!.reason));
});

console.log('== C10. Tebal 20 cm → 0,2 m ==');

test('C10: tebal 20 cm → concrete_thickness_m=0.2 (bukan 20 m); volume perkerasan 1200 m³', () => {
  // TANPA 'lebar 6 m': lebar 6 m memetakan ke shoulder_width (maks
  // 3 m) → out-of-range → demosi RIGID ke RECONSTRUCTION (perilaku
  // lama yang sah, bukan bagian C10).
  const text = 'buatkan RAB jalan beton sepanjang 1 km tebal 20 cm';
  const spec = extractUniversalSpec(text);
  assert.equal(spec.thicknessCm, 20);
  const tpl = RabTemplateService.getInstance().getTemplateById('INFRA-ROAD-RIGID')!;
  assert.ok(tpl, 'template INFRA-ROAD-RIGID harus ada');
  const mapped = mapSpecToParams(spec, tpl);
  assert.equal(mapped.params.concrete_thickness_m, 0.2);
  const oor = paramOutOfRangeDetails(spec, tpl);
  assert.ok(!oor.some((o) => o.key === 'concrete_thickness_m'), '0,2 m di dalam batas 0,15–0,35 m — tidak boleh out-of-range');
  const d = draftOf(text);
  const road = d.parts.find((p) => p.template.id === 'INFRA-ROAD-RIGID')!;
  assert.equal(road.evaluatedParams.concrete_thickness_m, 0.2);
  const rigid = effectiveItems(d).find((i) => i.description.startsWith('Perkerasan Beton Semen'));
  assert.ok(rigid);
  assert.equal(rigid!.volume, 1200, '1000 m × 6 m × 0,2 m = 1200 m³');
});

console.log('== C11. Negasi tanpa ==');

test('C11a: isNegatedAt mengenal "tanpa" — "jalan tanpa drainase" tidak memicu scope drainase', () => {
  const t1 = ' buatkan rab jalan beton sepanjang 1 km lebar 6 m tanpa drainase ';
  assert.equal(isNegatedAt(t1, t1.indexOf('drainase')), true);
  const t2 = ' buatkan rab drainase sepanjang 500 meter tanpa gorong ';
  assert.equal(isNegatedAt(t2, t2.indexOf('drainase')), false, "'tanpa' SESUDAH kata kunci tidak menegasikannya");
  const d = draftOf('buatkan RAB jalan beton sepanjang 1 km tanpa drainase');
  assert.ok(!d.parts.some((p) => p.scope.id === 'drainase'));
  // Template jalan yang menang di sini (RIGID vs RECONSTRUCTION)
  // adalah hasil penskoran teks lama — kata 'drainase' memberi +3 ke
  // RECONSTRUCTION — bukan perilaku Bagian B; yang diuji C11a hanyalah
  // tidak adanya part drainase.
  assert.ok(d.parts.some((p) => p.scope.id === 'jalan'));
});

test('C11b: "drainase tanpa gorong" tetap terdeteksi (tanpa sesudah kata kunci)', () => {
  const d = draftOf('buatkan RAB drainase sepanjang 500 meter tanpa gorong');
  assert.ok(d.parts.some((p) => p.scope.id === 'drainase'), 'scope drainase harus tetap terdeteksi');
});

console.log('== C12. Suppression atap kandang ==');

test('C12: draft kandang TIDAK memuat part Green Roof — hanya part pertanian (+ atap terikat komponen barn)', () => {
  const d = draftOf(KANDANG_TEXT, kandangSpecs(30));
  assert.ok(!d.parts.some((p) => p.template.id === 'ROOF-GREEN-GARDEN'));
  assert.ok(d.parts.some((p) => p.template.id === 'AGR-LIVESTOCK-BARN'));
  assert.ok(d.warnings.some((w) => w.includes('tidak dibangun terpisah') && w.includes('kandang')));
  // DIPERBARUI TERBUKA (keputusan katalog owner 2026-11-12 03:41):
  // spek contoh ini meminta Galvalum — item atapnya kini Galvalum
  // resmi, bukan Spandek. (Varian default Spandek tetap diuji C13.)
  assert.ok(effectiveItems(d).some((i) => i.description === 'Penutup Atap Galvalum Kandang'));
});

console.log('== P. Persistensi record draft membawa rantai (temuan E2E integrasi) ==');

/* localStorage shim — pola sama seperti draftPersistenceHardening:
   hardenedStorage membaca localStorage pada saat pemanggilan, bukan
   saat impor, jadi pemasangan di sini cukup. */
const persistStore: Record<string, string> = {};
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => persistStore[k] ?? null,
  setItem: (k: string, v: string) => { persistStore[k] = v; },
  removeItem: (k: string) => { delete persistStore[k]; },
  clear: () => { for (const k of Object.keys(persistStore)) delete persistStore[k]; },
};
import {
  saveDraft,
  loadDraft,
  peekPersistedDraft,
  AI_DRAFTS_STORAGE_KEY,
} from '../ai-tools/ezrab-ai/draftPersistence';
import { saveVersioned, loadVersioned } from '../engine/storage/hardenedStorage';

test('P1: save→load draft Galvalum — chainValidation + structuredSpecs + ambiguousPicks pulih utuh', () => {
  const d = draftOf(KANDANG_TEXT, kandangSpecs(30));
  assert.ok(d.chainValidation, 'draft sumber harus punya chainValidation');
  const saved = saveDraft({ draft: d, projectId: 'PRJ-CHAIN-E2E' });
  assert.ok(saved.ok, 'saveDraft harus ok');
  const rec = peekPersistedDraft('PRJ-CHAIN-E2E');
  assert.ok(rec, 'record harus ada');
  assert.equal(rec!.chainValidation!.budget.cap, 250_000_000);
  // DIPERBARUI TERBUKA (keputusan katalog owner 2026-11-12 03:41):
  // Galvalum kini MATCHED — tidak ada lagi mismatch galvalum yang
  // harus pulih; yang diuji di sini adalah kesetiaan round-trip
  // (deepEqual di bawah), bukan isi mismatch lama.
  assert.ok(!rec!.chainValidation!.materialMismatches.some((m) => m.requested === 'galvalum'), 'tidak boleh ada mismatch galvalum di record');
  assert.ok(rec!.structuredSpecs!.some((s) => s.key === 'kandang-roof-material'));
  const loaded = loadDraft('PRJ-CHAIN-E2E');
  assert.ok(loaded.ok, 'loadDraft harus ok');
  const rd = (loaded as { ok: true; draft: UniversalDraft }).draft;
  assert.equal(rd.chainValidation!.budget.cap, 250_000_000);
  assert.deepEqual(rd.chainValidation!.materialMismatches, d.chainValidation!.materialMismatches);
  assert.deepEqual(rd.structuredSpecs, d.structuredSpecs);
  assert.deepEqual(rd.ambiguousPicks ?? null, d.ambiguousPicks ?? null);
  assert.equal(effectiveItems(rd).length, effectiveItems(d).length, 'item hasil restore tetap sama');
});

test('P2: draft tanpa spek — record menyimpan null, loadDraft pulih tanpa chainValidation', () => {
  const d = draftOf(KANDANG_TEXT);
  assert.equal(d.chainValidation, undefined);
  const saved = saveDraft({ draft: d, projectId: 'PRJ-CHAIN-PLAIN' });
  assert.ok(saved.ok);
  const rec = peekPersistedDraft('PRJ-CHAIN-PLAIN');
  assert.equal(rec!.chainValidation, null);
  assert.equal(rec!.structuredSpecs, null);
  assert.equal(rec!.ambiguousPicks, null);
  const loaded = loadDraft('PRJ-CHAIN-PLAIN');
  assert.ok(loaded.ok);
  assert.equal((loaded as { ok: true; draft: UniversalDraft }).draft.chainValidation, undefined);
});

test('P3: record LAMA tanpa ketiga field rantai tetap terbaca (kompatibel mundur)', () => {
  const d = draftOf(KANDANG_TEXT, kandangSpecs(30));
  const saved = saveDraft({ draft: d, projectId: 'PRJ-CHAIN-LEGACY' });
  assert.ok(saved.ok);
  // Simulasi record pra-perbaikan: hapus ketiga field dari map mentah
  // lewat API storage yang sama (tanpa asumsi format envelope).
  const readBack = loadVersioned<Record<string, Record<string, unknown>>>(AI_DRAFTS_STORAGE_KEY);
  assert.ok(readBack.ok, 'map draft harus terbaca kembali');
  const data = (readBack as { ok: true; data: Record<string, Record<string, unknown>> }).data;
  delete data['PRJ-CHAIN-LEGACY'].chainValidation;
  delete data['PRJ-CHAIN-LEGACY'].structuredSpecs;
  delete data['PRJ-CHAIN-LEGACY'].ambiguousPicks;
  const rewritten = saveVersioned(AI_DRAFTS_STORAGE_KEY, data);
  assert.ok(rewritten.ok, 'penulisan ulang record lama harus ok');
  const loaded = loadDraft('PRJ-CHAIN-LEGACY');
  assert.ok(loaded.ok, 'record lama tanpa field rantai tetap harus terbaca');
  const rd = (loaded as { ok: true; draft: UniversalDraft }).draft;
  assert.equal(rd.chainValidation, undefined);
  assert.ok(rd.parts.some((p) => p.template.id === 'AGR-LIVESTOCK-BARN'), 'isi draft lama tetap utuh');
});

console.log('== C13. Bukti mekanisme SELECT + condition (keputusan katalog owner 2026-11-12 03:41) ==');

test('C13a: selectParamOverrides — Galvalum→roof_material, spek dilewati→{}', () => {
  assert.deepEqual(selectParamOverrides([S('kandang-roof-material', 'material', 'Atap', 'Galvalum')]), { roof_material: 'galvalum' });
  assert.deepEqual(selectParamOverrides([S('warehouse-floor', 'material', 'Lantai', 'Paving blok')]), { floor_type: 'paving' });
  assert.deepEqual(selectParamOverrides([S('kandang-roof-material', 'material', 'Atap', 'Belum ditentukan', 'UNRESOLVED')]), {});
  assert.deepEqual(selectParamOverrides([]), {});
});

test('C13b: generateRabFromTemplate kandang — satu varian atap saja per nilai roof_material', () => {
  const svc = RabTemplateService.getInstance();
  const barn = svc.getTemplateById('AGR-LIVESTOCK-BARN')!;
  assert.ok(barn, 'template AGR-LIVESTOCK-BARN harus ada');
  const roofNames = (items: Array<{ description: string }>) =>
    items.filter((i) => i.description.startsWith('Penutup Atap')).map((i) => i.description);
  // Default (tanpa param) → Spandek saja.
  const def = svc.generateRabFromTemplate(barn, {}, undefined, 'PROFESSIONAL', []);
  assert.deepEqual(roofNames(def.items), ['Penutup Atap Spandek Kandang']);
  assert.equal(def.items.find((i) => i.description === 'Penutup Atap Spandek Kandang')!.unitPrice, 135600);
  // Galvalum → hanya Galvalum; Asbes → hanya Asbes (Rp94.294 OFFICIAL); Genteng → hanya Genteng.
  const galv = svc.generateRabFromTemplate(barn, { roof_material: 'galvalum' }, undefined, 'PROFESSIONAL', []);
  assert.deepEqual(roofNames(galv.items), ['Penutup Atap Galvalum Kandang']);
  const asb = svc.generateRabFromTemplate(barn, { roof_material: 'asbes' }, undefined, 'PROFESSIONAL', []);
  assert.deepEqual(roofNames(asb.items), ['Penutup Atap Asbes Kandang']);
  assert.equal(asb.items.find((i) => i.description === 'Penutup Atap Asbes Kandang')!.unitPrice, 94294);
  assert.equal(asb.items.find((i) => i.description === 'Penutup Atap Asbes Kandang')!.priceSourceKind, 'OFFICIAL_AHSP');
  const gen = svc.generateRabFromTemplate(barn, { roof_material: 'genteng' }, undefined, 'PROFESSIONAL', []);
  assert.deepEqual(roofNames(gen.items), ['Penutup Atap Genteng Kandang']);
  assert.equal(gen.items.find((i) => i.description === 'Penutup Atap Genteng Kandang')!.unitPrice, 189956);
});

test('C13c: generateRabFromTemplate gudang — varian atap & lantai saling lepas', () => {
  const svc = RabTemplateService.getInstance();
  const wh = svc.getTemplateById('BLD-IND-MULTITENANT')!;
  assert.ok(wh, 'template BLD-IND-MULTITENANT harus ada');
  const def = svc.generateRabFromTemplate(wh, {}, undefined, 'PROFESSIONAL', []);
  assert.ok(def.items.some((i) => i.description === 'Penutup Atap UPVC Atap Gudang'), 'default atap = UPVC');
  assert.ok(def.items.some((i) => i.description.startsWith('Floor Hardener')), 'default lantai = hardener');
  assert.ok(!def.items.some((i) => i.description.includes('Paving Block Gudang')));
  const zin = svc.generateRabFromTemplate(wh, { roof_material: 'zincalume', floor_type: 'paving' }, undefined, 'PROFESSIONAL', []);
  assert.ok(zin.items.some((i) => i.description === 'Penutup Atap Zincalume Gudang'));
  assert.equal(zin.items.find((i) => i.description === 'Penutup Atap Zincalume Gudang')!.unitPrice, 90145);
  assert.ok(zin.items.some((i) => i.description === 'Lantai Paving Block Gudang 6 cm'));
  assert.equal(zin.items.find((i) => i.description === 'Lantai Paving Block Gudang 6 cm')!.unitPrice, 146808);
  assert.ok(!zin.items.some((i) => i.description.startsWith('Floor Hardener')), 'paving menggantikan hardener, bukan menambah');
  assert.ok(!zin.items.some((i) => i.description === 'Penutup Atap UPVC Atap Gudang'));
});

console.log('== C14. Gudang: jejak penuh varian atap + lantai ==');

test('C14: gudang Galvalum + paving → kedua varian MATCHED + OFFICIAL_AHSP', () => {
  const specs = [
    S('warehouse-roof', 'material', 'Atap gudang', 'Galvalum'),
    S('warehouse-floor', 'material', 'Lantai gudang', 'Paving blok'),
  ];
  const d = draftOf('buatkan RAB gudang 5000 m2 penutup atap Galvalum lantai paving blok', specs, 'BLD-IND-MULTITENANT');
  assert.equal(d.parts[0].template.id, 'BLD-IND-MULTITENANT');
  const roof = effectiveItems(d).find((i) => i.description === 'Penutup Atap Galvalum Gudang');
  assert.ok(roof, 'item atap Galvalum gudang harus ada');
  assert.equal(roof!.unitPrice, 135600);
  assert.equal(roof!.priceSourceKind, 'OFFICIAL_AHSP');
  const floor = effectiveItems(d).find((i) => i.description === 'Lantai Paving Block Gudang 6 cm');
  assert.ok(floor, 'item lantai paving gudang harus ada');
  assert.equal(floor!.unitPrice, 146808);
  assert.equal(floor!.priceSourceKind, 'OFFICIAL_AHSP');
  assert.ok(!effectiveItems(d).some((i) => i.description.startsWith('Floor Hardener')));
  const cv = d.chainValidation!;
  assert.ok(!cv.materialMismatches.some((m) => m.requested === 'galvalum' || m.requested === 'paving'));
});

console.log('== C15. Foot plat: template baru + jejak penuh ==');

test('C15: pondasi foot plat → FND-FOOT-PLAT; bekisting OFFICIAL, beton fallback pasar', () => {
  const d = draftOf(
    'buatkan RAB gedung kantor 3 lantai luas 900 m2 pondasi foot plat',
    [S('building-foundation', 'scope', 'Pondasi', 'Foot plat')],
  );
  const part = d.parts.find((p) => p.template.id === 'FND-FOOT-PLAT');
  assert.ok(part, 'part FND-FOOT-PLAT harus ada');
  const items = effectiveItems(d);
  const bek = items.find((i) => i.description === 'Bekisting Telapak Foot Plat');
  assert.ok(bek, 'item bekisting telapak harus ada');
  assert.equal(bek!.unitPrice, 254573);
  assert.equal(bek!.priceSourceKind, 'OFFICIAL_AHSP');
  const beton = items.find((i) => i.description === 'Beton Foot Plat fc 15 MPa');
  assert.ok(beton, 'item beton foot plat harus ada');
  assert.equal(beton!.unitPrice, 1355000);
  assert.equal(beton!.priceSourceKind, 'MARKET_REFERENCE', 'beton 2.2.1.4.3 PARTIAL → fallback pasar (pola mapan FND-*)');
  assert.ok(!d.chainValidation!.ambiguousPicks.some((a) => a.scope === 'pondasi'), 'foot plat tidak boleh AMBIGUOUS_PICK lagi');
});

console.log('== C16. Dak beton: template baru + jejak penuh ==');

test('C16: atap dak beton → ROOF-CONCRETE-DECK; bekisting OFFICIAL, beton & membran fallback pasar', () => {
  const d = draftOf(
    'buatkan RAB rumah 2 lantai luas 180 m2 atap dak beton',
    [S('building-roof-type', 'scope', 'Atap', 'Dak beton')],
  );
  const part = d.parts.find((p) => p.template.id === 'ROOF-CONCRETE-DECK');
  assert.ok(part, 'part ROOF-CONCRETE-DECK harus ada');
  const items = effectiveItems(d);
  const bek = items.find((i) => i.description === 'Bekisting Plat Dak Beton');
  assert.ok(bek, 'item bekisting plat harus ada');
  assert.equal(bek!.unitPrice, 241284);
  assert.equal(bek!.priceSourceKind, 'OFFICIAL_AHSP');
  const beton = items.find((i) => i.description === 'Beton Plat Dak fc 15 MPa');
  assert.ok(beton, 'item beton plat harus ada');
  assert.equal(beton!.unitPrice, 1355000);
  assert.equal(beton!.priceSourceKind, 'MARKET_REFERENCE');
  const mem = items.find((i) => i.description === 'Waterproofing Membran Bakar Dak');
  assert.ok(mem, 'item membran bakar harus ada');
  assert.equal(mem!.unitPrice, 207102);
  assert.equal(mem!.priceSourceKind, 'MARKET_REFERENCE', 'membran 3.4.1 PARTIAL → fallback pasar (pola mapan ROOF-WP-*)');
  assert.ok(!d.chainValidation!.ambiguousPicks.some((a) => a.scope === 'atap'), 'dak beton tidak boleh AMBIGUOUS_PICK lagi');
});

console.log('== C17. Makadam: template jalan baru, F.46 resmi ==');

test('C17: generateRabFromTemplate INFRA-ROAD-MACADAM — volume 900 m³ + F.46 OFFICIAL', () => {
  const svc = RabTemplateService.getInstance();
  const mac = svc.getTemplateById('INFRA-ROAD-MACADAM')!;
  assert.ok(mac, 'template INFRA-ROAD-MACADAM harus ada');
  const gen = svc.generateRabFromTemplate(mac, {}, undefined, 'PROFESSIONAL', []);
  const item = gen.items.find((i) => i.description.includes('Makadam'));
  assert.ok(item, 'item lapis makadam harus ada');
  assert.equal(item!.volume, 900, '1000 m × 6 m × 0,15 m = 900 m³');
  assert.ok(Math.abs(item!.unitPrice! - 1723874.06) < 0.01, `harga lapangan F.46 Rp1.723.874,06/m³, dapat ${item!.unitPrice}`);
  assert.equal(item!.priceSourceKind, 'OFFICIAL_AHSP', 'F.46 tanpa harga inline → gerbang resmi');
});

console.log('== C18. Varian yang TETAP NEEDS_MANUAL_PRICE (tanpa harga resmi) ==');

test('C18: telford / skimmer / semi-overflow / anti-licin / genteng-metal / saluran pasangan batu → tetap UNAVAILABLE/UNVERIFIED', () => {
  assert.equal(lookupMaterialBinding('perkerasan-jalan', 'telford'), 'UNAVAILABLE');
  assert.equal(lookupMaterialBinding('kolam-type', 'skimmer'), 'UNAVAILABLE');
  assert.equal(lookupMaterialBinding('kolam-type', 'semi-overflow'), 'UNAVAILABLE');
  assert.equal(lookupMaterialBinding('lantai-kandang', 'anti-licin'), 'UNAVAILABLE');
  assert.equal(lookupMaterialBinding('lantai-kandang', 'kombinasi'), 'UNAVAILABLE');
  assert.equal(lookupMaterialBinding('atap-gudang', 'genteng metal'), 'UNAVAILABLE');
  assert.equal(lookupMaterialBinding('drainase', 'pasangan batu kali'), 'UNVERIFIED');
  assert.equal(lookupMaterialBinding('drainase', 'beton cor'), 'UNVERIFIED');
  // Jejak draft: telford tetap draft + AMBIGUOUS_PICK (bukan diam-diam diganti rigid).
  const tel = draftOf(
    'buatkan RAB jalan telford sepanjang 1 km lebar 6 m',
    [S('road-pavement', 'material', 'Perkerasan', 'Telford')],
  );
  assert.ok(tel.chainValidation!.ambiguousPicks.some((a) => a.scope === 'jalan' && /telford/i.test(a.reason)));
  const msg = formatUniversalDraftMessage(tel);
  assert.ok(/telford/i.test(msg), 'pesan draft harus menyebut telford');
});

console.log(`\nCHAT SPEC CHAIN (FASE 2 BAGIAN B): ${passed} PASS, ${failed} FAIL`);
if (failed > 0) process.exit(1);

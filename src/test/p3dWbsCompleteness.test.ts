/**
 * P3D FULL REPAIR (2026-11-13) — WBS eksplisit + kelengkapan spesifikasi
 * (audit Autonomous Estimation §A.2 Stage B/C + §E Tahap 2.4/3.3).
 *
 * Yang dibuktikan suite ini (bukan diklaim di laporan saja):
 * - §0 Peta taksonomi eksplisit VALID terhadap daftar/katalog HIDUP
 *   (WORK_CATEGORIES, WBS_CATALOGS, SCOPE_GROUPS, PROJECT_FAMILIES) —
 *   tanpa taksonomi baru; cermin label dijaga terhadap kanonisnya.
 * - §1 Artefak WBS dibangun dari spek + template (node + cakupan +
 *   status + ID stabil) pada draft nyata jalan & kandang.
 * - §2 Cek kelengkapan menemukan node WBS tanpa item (tanpa penanda
 *   pengecualian) dan melaporkannya dengan pesan berbahasa Indonesia.
 * - §3 Node yang dikecualikan eksplisit (supresi sistem / koreksi
 *   pengguna) LOLOS cek.
 * - §4 Setiap item draft dapat ditelusur ke spesifikasi sumber +
 *   statusnya (atau JUJUR dicatat tanpa tautan spek — TEMPLATE).
 * - §5 Field wajib hilang terdeteksi; pesan menyebut item + field +
 *   apa yang harus dilengkapi; kontrol negatif (default ada /
 *   pertanyaan opsional dilewati) TIDAK ikut terdeteksi.
 * - §6 Duplikat (uraian+satuan sama dalam SATU part) terdeteksi;
 *   item sama di part BERBEDA bukan duplikat.
 * - §7 Draft dengan spek UNRESOLVED TIDAK berstatus "lengkap" /
 *   "terverifikasi" (`isVerified: false`).
 * - §8 Koreksi pengguna (pengecualian + note + koreksi spek) BERTAHAN
 *   sesudah regenerasi WBS.
 * - §9 Spek bertentangan terdeteksi (nilai ganda + dimensi DED vs
 *   draft); rantai supersedes menyelesaikan nilai ganda.
 * - §10 Regresi: `validateDraftChain` + kontrak P3B tidak berubah
 *   (specCoverage + total pratinjau jalan beton 1 km tetap).
 *
 * Jalankan: npx --yes tsx src/test/p3dWbsCompleteness.test.ts
 * (plain-tsx, TANPA shim vitest — sengaja, agar tidak berebut
 * node_modules/vitest / __runner.mjs dengan worker paralel.)
 */

import { strict as assert } from 'assert';
import {
  buildUniversalDraft,
  effectiveItems,
  computeTotals,
  traceDraftItems,
  draftItemSpecTraces,
  wbsCompletenessLines,
  SCOPE_GROUPS,
  type UniversalDraft,
} from '../ai-tools/ezrab-ai/universalRab';
import {
  buildWbsForDraft,
  traceItemSpecs,
  detectMissingRequiredSpecs,
  detectDuplicateItems,
  detectSpecConflicts,
  validateWbsCompleteness,
  formatWbsCompletenessLines,
  familyIdFromSpecs,
  type ChainDraftLike,
} from '../ai-tools/ezrab-ai/specChain';
import {
  excludeWbsNode,
  annotateWbsNode,
  wbsNodeById,
  validateTaxonomyMap,
  scopeTaxonomyRow,
  scopeForSpecKey,
  conceptualLineScope,
  SCOPE_LABELS,
  SPEC_FAMILY_TO_SCOPE,
  type WbsArtifact,
} from '../ai-tools/ezrab-ai/wbsArtifact';
import {
  SPEC_KEY_META,
  latestSpecsByKey,
  type StructuredSpec,
  type SpecStatus,
} from '../ai-tools/ezrab-ai/structuredSpec';
import { WORK_CATEGORIES } from '../data/mockData';
import { WBS_CATALOGS } from '../ai-tools/ded-ai-estimate/wbsCatalog';
import { PROJECT_FAMILIES, validateProjectTaxonomy } from '../ai-tools/ezrab-ai/projectTaxonomy';

// Stub window/localStorage (sebagian impor menarik modul yang menyentuhnya).
const storage: Record<string, string> = {};
(global as any).window = {
  localStorage: {
    getItem: (key: string) => storage[key] || null,
    setItem: (key: string, val: string) => { storage[key] = val; },
    removeItem: (key: string) => { delete storage[key]; },
    clear: () => { Object.keys(storage).forEach((k) => delete storage[k]); },
  },
};
(global as any).localStorage = (global as any).window.localStorage;

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  PASS ${name}`);
  } catch (e: any) {
    failed += 1;
    console.log(`  FAIL ${name}: ${e?.message ?? e}`);
  }
}
const eq = (a: unknown, b: unknown, msg: string) => {
  if (a !== b) throw new Error(`${msg} (dapat ${JSON.stringify(a)}, harap ${JSON.stringify(b)})`);
};

// ---------------------------------------------------------------- fixture
const NOW = new Date().toISOString();
function spec(
  key: string,
  kind: StructuredSpec['kind'],
  label: string,
  value: StructuredSpec['value'],
  status: SpecStatus = 'CONFIRMED',
  supersedes: string | null = null,
): StructuredSpec {
  return { key, kind, label, value, status, source: 'kuesioner', updatedAt: NOW, supersedes };
}

function draftOf(text: string, specs?: StructuredSpec[]): UniversalDraft {
  const res = buildUniversalDraft(text, undefined, specs ? { structuredSpecs: specs } : undefined);
  assert.equal(res.kind, 'draft', `buildUniversalDraft "${text}" harus draft (dapat ${res.kind})`);
  return (res as { kind: 'draft'; draft: UniversalDraft }).draft;
}

/** Artefak WBS on-demand (sejak P6 sama dengan artefak terpasang otomatis — lihat §1.1). */
function wbsOf(d: UniversalDraft, specs?: StructuredSpec[]): WbsArtifact {
  return buildWbsForDraft(d, specs ?? d.structuredSpecs ?? []);
}
/** Laporan kelengkapan on-demand. */
function repOf(d: UniversalDraft, specs?: StructuredSpec[], artifact?: WbsArtifact) {
  return validateWbsCompleteness(d, specs ?? d.structuredSpecs ?? [], artifact ?? null);
}

const ROAD_SPECS = [
  spec('road-pavement', 'material', 'Jenis perkerasan jalan', 'Beton rigid'),
  spec('road-drainage', 'scope', 'Drainase pendamping jalan', 'Drainase baru'),
];
const ROAD_TEXT = 'buatkan RAB jalan beton sepanjang 1 km lebar 4 meter';
const KANDANG_SPECS = [
  spec('kandang-roof-material', 'material', 'Material penutup atap kandang', 'Galvalum'),
  spec('kandang-capacity', 'count', 'Kapasitas kandang (jumlah ekor)', 50),
];
const KANDANG_TEXT = 'buatkan RAB kandang sapi kapasitas 50 ekor luas 200 m2';

/** Draft sintetis minimal (ChainDraftLike) untuk cek terarah. */
function synthDraft(parts: ChainDraftLike['parts'], specPatch: Partial<ChainDraftLike['spec']> = {}): ChainDraftLike {
  return {
    spec: {
      areaM2: null, lengthM: null, widthM: null, spanM: null, heightM: null,
      thicknessCm: null, volumeM3: null, count: null, floors: null,
      budgetCap: null, buildingLengthM: null, buildingWidthM: null, rawText: 'sintetis',
      ...specPatch,
    },
    parts,
  };
}
function synthPart(over: Partial<ChainDraftLike['parts'][number]> & { scopeId: string; scopeLabel: string }): ChainDraftLike['parts'][number] {
  return {
    scope: { id: over.scopeId, label: over.scopeLabel },
    template: over.template ?? { id: 'SYN-T', name: 'Template Sintetis', parameters: [], components: [] },
    evaluatedParams: over.evaluatedParams ?? {},
    generation: over.generation ?? { items: [] },
    removedKeys: over.removedKeys ?? [],
    manualPrices: over.manualPrices ?? {},
  };
}
function synthItem(id: string, description: string, unit = 'm2', volume = 10): ChainDraftLike['parts'][number]['generation']['items'][number] {
  return { id, description, volume, unit, unitPrice: 100000, priceStatus: 'PRICE_RESOLVED', priceSourceKind: 'OFFICIAL_AHSP' };
}

// ---------------------------------------------------------------- §0
console.log('§0 peta taksonomi eksplisit (valid terhadap data hidup)');

check('0.1 validateTaxonomyMap() kosong — semua label kategori & kode kelompok ADA di data hidup, tanpa kode ganda', () => {
  const problems = validateTaxonomyMap();
  eq(problems.length, 0, `peta taksonomi valid (masalah: ${problems.join('; ')})`);
});

check('0.2 SCOPE_LABELS (cermin) == label SCOPE_GROUPS kanonis (18 scope, id + label identik)', () => {
  eq(Object.keys(SCOPE_LABELS).length, 18, 'jumlah scope cermin');
  eq(SCOPE_GROUPS.length, 18, 'jumlah scope kanonis');
  for (const g of SCOPE_GROUPS) {
    eq(SCOPE_LABELS[g.id], g.label, `label scope ${g.id}`);
  }
});

check('0.3 setiap family SPEC_KEY_META punya baris di SPEC_FAMILY_TO_SCOPE (12 family, tanpa yatim)', () => {
  const families = new Set(Object.values(SPEC_KEY_META).map((m) => m.family));
  eq(families.size, 12, 'jumlah family spek');
  for (const f of families) {
    assert.ok(f in SPEC_FAMILY_TO_SCOPE, `family ${f} ada di peta scope`);
  }
});

check('0.4 scopeForSpecKey konsisten dengan niat familyIdFromSpecs (spot-check 7 kunci)', () => {
  eq(scopeForSpecKey('road-pavement'), 'jalan', 'road-pavement → jalan');
  eq(scopeForSpecKey('drainage-material'), 'drainase', 'drainage-material → drainase (family META: "drainage")');
  eq(scopeForSpecKey('building-foundation'), 'gedung', 'building-foundation → gedung');
  eq(scopeForSpecKey('kandang-roof-material'), 'pertanian', 'kandang-roof-material → pertanian');
  eq(scopeForSpecKey('pool-finish'), 'olahraga', 'pool-finish → olahraga');
  eq(scopeForSpecKey('bridge-type'), 'jembatan', 'bridge-type → jembatan');
  eq(scopeForSpecKey('budget'), null, 'budget → null (bukan paket pekerjaan)');
  eq(scopeForSpecKey('ded-length'), null, 'ded-length → null (bukan paket pekerjaan)');
  eq(scopeForSpecKey('kunci-tak-dikenal'), null, 'kunci tak dikenal → null');
  eq(familyIdFromSpecs([spec('road-pavement', 'material', 'x', 'Rigid')]), 'jalan', 'familyIdFromSpecs jalan');
});

check('0.5 taksonomi 19 keluarga utuh + subkategori konseptual dimiliki ≥1 keluarga', () => {
  eq(PROJECT_FAMILIES.length, 19, 'jumlah keluarga direktif');
  const taxProblems = validateProjectTaxonomy();
  eq(taxProblems.length, 0, `taksonomi proyek valid (masalah: ${taxProblems.join('; ')})`);
  for (const sub of ['kandang', 'gudang-industri', 'jembatan', 'renovasi', 'kolam']) {
    const owners = PROJECT_FAMILIES.filter((f) => f.subcategoryIds.includes(sub));
    assert.ok(owners.length >= 1, `subkategori ${sub} dimiliki keluarga`);
  }
  // WORK_CATEGORIES tetap 12 (peta merujuk labelnya, bukan salinan).
  eq(WORK_CATEGORIES.length, 12, 'WORK_CATEGORIES 12');
  eq(Object.keys(WBS_CATALOGS).length, 8, 'katalog WBS DED 8 kunci');
});

// ---------------------------------------------------------------- §1
console.log('§1 artefak WBS dari spek + template (draft nyata)');

check('1.1 draft jalan: artefak ada, node wbs:jalan LENGKAP 8 item milik, specKeys memuat road-pavement', () => {
  const d = draftOf(ROAD_TEXT, ROAD_SPECS);
  // P6 (menutup P3D-O1 — pin ini DIBALIK dari P3D): buildUniversalDraft
  // KINI memasang field WBS otomatis (draftPersistence membawanya,
  // P4-(d) tetap hijau). Artefak TERPASANG harus sama dengan yang
  // dihitung on-demand.
  assert.ok('wbsArtifact' in d, 'draft membawa wbsArtifact otomatis (P6)');
  assert.ok('wbsCompleteness' in d, 'draft membawa wbsCompleteness otomatis (P6)');
  assert.ok(d.wbsArtifact, 'wbsArtifact terisi');
  eq(d.wbsArtifact!.nodes.map((n) => n.id).join(','), wbsOf(d, ROAD_SPECS).nodes.map((n) => n.id).join(','), 'node artefak terpasang == on-demand');
  const wbs = wbsOf(d, ROAD_SPECS);
  eq(wbs.version, 1, 'versi artefak');
  eq(wbs.familyId, 'jalan', 'familyId artefak');
  eq(wbs.templateIds.includes('INFRA-ROAD-RIGID'), true, 'templateId tercatat');
  const jalan = wbsNodeById(wbs, 'jalan');
  assert.ok(jalan, 'node wbs:jalan ada');
  eq(jalan!.id, 'wbs:jalan', 'ID node stabil');
  eq(jalan!.status, 'LENGKAP', 'node jalan LENGKAP');
  eq(jalan!.itemIds.length, 8, 'node jalan 8 item milik');
  assert.ok(jalan!.specKeys.includes('road-pavement'), 'specKeys memuat road-pavement');
  eq(jalan!.source, 'template', 'node jalan bersumber template');
});

check('1.2 ID node stabil antar-regenerasi (bangun 2× → himpunan ID identik)', () => {
  const d = draftOf(ROAD_TEXT, ROAD_SPECS);
  const a = wbsOf(d, ROAD_SPECS);
  const b = wbsOf(d, ROAD_SPECS);
  eq(JSON.stringify(a.nodes.map((n) => n.id)), JSON.stringify(b.nodes.map((n) => n.id)), 'ID node identik');
});

check('1.3 draft kandang: atap DIKECUALIKAN (supresi), pondasi/struktur TERCAKUP, mep KOSONG (jujur: template tanpa item MEP)', () => {
  const d = draftOf(KANDANG_TEXT, KANDANG_SPECS);
  const wbs = wbsOf(d, KANDANG_SPECS);
  eq(wbsNodeById(wbs, 'pertanian')!.status, 'LENGKAP', 'pertanian LENGKAP');
  const atap = wbsNodeById(wbs, 'atap')!;
  eq(atap.status, 'DIKECUALIKAN', 'atap DIKECUALIKAN');
  assert.ok((atap.exclusion?.reason ?? '').includes('tercakup komponen template'), 'alasan supresi atap tercatat');
  eq(atap.exclusion?.by, 'sistem', 'supresi atap oleh sistem');
  eq(wbsNodeById(wbs, 'pondasi')!.status, 'TERCAKUP', 'pondasi TERCAKUP via klasifikasi');
  eq(wbsNodeById(wbs, 'struktur')!.status, 'TERCAKUP', 'struktur TERCAKUP via klasifikasi');
  eq(wbsNodeById(wbs, 'mep')!.status, 'KOSONG', 'mep KOSONG (template kandang tanpa item MEP)');
  assert.ok((wbsNodeById(wbs, 'mep')!.conceptualLabel ?? '').includes('air minum'), 'node mep membawa label konseptual asal');
});

check('1.4 rujukan taksonomi per node: pondasi ↔ WORK_CATEGORIES + BGN-03; jalan ↔ JLN-05 + tanpa kategori (jujur kosong)', () => {
  const d = draftOf(KANDANG_TEXT, KANDANG_SPECS);
  const pondasi = wbsNodeById(wbsOf(d, KANDANG_SPECS), 'pondasi')!;
  eq(JSON.stringify(pondasi.workCategories), JSON.stringify(['Pekerjaan Tanah & Pondasi']), 'pondasi ↔ kategori bangunan');
  eq(JSON.stringify(pondasi.dedGroupCodes), JSON.stringify(['BGN-03']), 'pondasi ↔ BGN-03');
  eq(pondasi.dedCatalog, 'BANGUNAN', 'pondasi ↔ katalog BANGUNAN');
  const jalan = scopeTaxonomyRow('jalan')!;
  assert.ok(jalan.dedGroupCodes.includes('JLN-05'), 'jalan ↔ JLN-05');
  eq(jalan.workCategories.length, 0, 'jalan tanpa padanan WORK_CATEGORIES (kategori bangunan saja)');
});

check('1.5 draft tanpa spek: artefak tetap dibangun dari template saja (1 node LENGKAP)', () => {
  const d = draftOf('Buat RAB jalan beton sepanjang 1 km');
  const wbs = wbsOf(d, []);
  eq(wbs.nodes.length, 1, '1 node (jalan)');
  eq(wbs.nodes[0].status, 'LENGKAP', 'node jalan LENGKAP');
  eq(wbs.familyId, null, 'familyId null tanpa spek');
});

check('1.6 pemetaan baris konseptual → scope: persiapan/survei/serah terima null; atap/pondasi/mep terpetakan', () => {
  eq(conceptualLineScope('Pekerjaan persiapan & pengukuran'), null, 'persiapan → null');
  eq(conceptualLineScope('Survei kondisi eksisting & pengukuran ulang'), null, 'survei → null');
  eq(conceptualLineScope('Pembersihan & serah terima'), null, 'serah terima → null');
  eq(conceptualLineScope('Pekerjaan tanah & pondasi'), 'pondasi', 'tanah & pondasi → pondasi');
  eq(conceptualLineScope('Pekerjaan atap'), 'atap', 'atap → atap');
  eq(conceptualLineScope('Instalasi air minum ternak & listrik sederhana'), 'mep', 'air minum+listrik → mep');
  eq(conceptualLineScope('Pekerjaan luar (pagar, carport, drainase lingkungan)'), 'lanskap', 'pekerjaan luar → lanskap (bukan drainase)');
  eq(conceptualLineScope('Pondasi & abutment (kepala jembatan)'), 'jembatan', 'abutment → jembatan (bukan pondasi)');
});

// ---------------------------------------------------------------- §2
console.log('§2 cek kelengkapan menemukan node tanpa item');

check('2.1 spek drainase tanpa part drainase → node wbs:drainase KOSONG, status BELUM_LENGKAP, pesan menyebut paket', () => {
  const d = synthDraft([
    synthPart({
      scopeId: 'jalan', scopeLabel: 'Jalan & Perkerasan',
      template: { id: 'SYN-JALAN', name: 'Template Sintetis Jalan', parameters: [], components: [{ id: 'c1', name: 'Perkerasan jalan sintetis', calculationRule: '1', variables: [] }] },
      generation: { items: [synthItem('i1', 'Perkerasan jalan sintetis')] },
    }),
  ]);
  const specs = [spec('drainage-material', 'material', 'Material saluran drainase', 'U-ditch')];
  const report = validateWbsCompleteness(d, specs);
  eq(report.status, 'BELUM_LENGKAP', 'status BELUM_LENGKAP');
  eq(report.isVerified, false, 'isVerified false');
  assert.ok(report.nodesEmpty.some((n) => n.nodeId === 'wbs:drainase'), 'wbs:drainase tercatat kosong');
  assert.ok(report.issues.some((i) => i.includes('Drainase & Saluran') && i.includes('belum punya item')), 'pesan menyebut paket + masalah');
  assert.ok(report.issues.some((i) => i.includes('kecualikan')), 'pesan menyebut opsi pengecualian');
});

check('2.2 baris pesan pratinjau: BELUM LENGKAP + "belum terverifikasi penuh"', () => {
  const d = synthDraft([
    synthPart({
      scopeId: 'jalan', scopeLabel: 'Jalan & Perkerasan',
      template: { id: 'SYN-JALAN', name: 'Template Sintetis Jalan', parameters: [], components: [] },
      generation: { items: [synthItem('i1', 'Perkerasan jalan sintetis')] },
    }),
  ]);
  const lines = formatWbsCompletenessLines(validateWbsCompleteness(d, [
    spec('drainage-material', 'material', 'Material saluran drainase', 'U-ditch'),
  ]));
  assert.ok(lines[0].includes('BELUM LENGKAP'), 'baris pertama BELUM LENGKAP');
  assert.ok(lines[0].includes('belum terverifikasi penuh'), 'baris pertama menyebut belum terverifikasi penuh');
  assert.ok(lines.some((l) => l.includes('Drainase & Saluran')), 'masalah drainase tampil');
});

// ---------------------------------------------------------------- §3
console.log('§3 node dikecualikan eksplisit lolos cek');

check('3.1 supresi sistem: road-drainage "Tanpa drainase" → drainase DIKECUALIKAN, draft jalan LENGKAP', () => {
  const specs = [
    spec('road-pavement', 'material', 'Jenis perkerasan jalan', 'Beton rigid'),
    spec('road-drainage', 'scope', 'Drainase pendamping jalan', 'Tanpa drainase'),
  ];
  const d = draftOf(ROAD_TEXT, specs);
  const wbs = wbsOf(d, specs);
  const node = wbsNodeById(wbs, 'drainase')!;
  eq(node.status, 'DIKECUALIKAN', 'drainase DIKECUALIKAN');
  assert.ok((node.exclusion?.reason ?? '').includes('Tanpa drainase'), 'alasan mengutip jawaban spek');
  const report = repOf(d, specs, wbs);
  eq(report.status, 'LENGKAP', 'draft LENGKAP walau ada node dikecualikan');
  eq(report.nodesEmpty.length, 0, 'tak ada node kosong');
  assert.ok(report.nodesExcluded.some((n) => n.nodeId === 'wbs:drainase'), 'drainase tercatat di nodesExcluded');
});

check('3.2 pengecualian pengguna membuat node kosong lolos: kandang mep dikecualikan → LENGKAP', () => {
  const d = draftOf(KANDANG_TEXT, KANDANG_SPECS);
  eq(repOf(d, KANDANG_SPECS).status, 'BELUM_LENGKAP', 'pra-kondisi: kandang BELUM_LENGKAP (mep kosong)');
  const excluded = excludeWbsNode(wbsOf(d, KANDANG_SPECS), 'wbs:mep', 'MEP dikerjakan paket terpisah oleh owner.');
  const report = validateWbsCompleteness(d, KANDANG_SPECS, excluded);
  eq(report.status, 'LENGKAP', 'sesudah pengecualian: LENGKAP');
  eq(report.isVerified, true, 'isVerified true');
  eq(report.nodesEmpty.length, 0, 'tak ada node kosong');
});

// ---------------------------------------------------------------- §4
console.log('§4 penelusuran spek → item → volume → AHSP');

check('4.1 setiap item draft jalan punya __wbsNodeId wbs:jalan', () => {
  const d = draftOf(ROAD_TEXT, ROAD_SPECS);
  const items = traceDraftItems(d);
  eq(items.length, 8, '8 item efektif');
  for (const it of items) eq(it.__wbsNodeId, 'wbs:jalan', `wbsNodeId item "${it.description}"`);
});

check('4.2 item perkerasan tertaut ke road-pavement CONFIRMED; item tanpa spek jujur kosong (bukan karangan)', () => {
  const d = draftOf(ROAD_TEXT, ROAD_SPECS);
  const items = traceDraftItems(d);
  const rigid = items.find((i) => i.description.includes('Perkerasan Beton Semen'))!;
  assert.ok(rigid.__specKeys!.includes('road-pavement'), 'perkerasan tertaut road-pavement');
  eq(rigid.__specStatus, 'CONFIRMED', 'status spek perkerasan CONFIRMED');
  const clearing = items.find((i) => i.description.includes('Pembersihan'))!;
  eq(JSON.stringify(clearing.__specKeys), JSON.stringify([]), 'clearing tanpa tautan spek (jujur kosong)');
  eq(clearing.__specStatus, null, 'clearing tanpa status spek');
});

check('4.3 trace mentah: volumeBasis + priceBasis + traceSource per item', () => {
  const d = draftOf(ROAD_TEXT, ROAD_SPECS);
  const traces = draftItemSpecTraces(d);
  eq(traces.length, 8, '8 baris trace');
  const rigid = traces.find((t) => t.description.includes('Perkerasan Beton Semen'))!;
  eq(rigid.traceSource, 'SPESIFIK', 'perkerasan SPESIFIK');
  eq(rigid.volumeBasis, 'USER_DIMENSION', 'perkerasan USER_DIMENSION');
  // Item jalan beton katalog ini berharga REFERENSI_PASAR (bukan
  // AHSP_RESMI) — yang dipin adalah basisnya TERBACA dari item, bukan
  // klaim resmi. (Konsisten dengan P3B: harga non-resmi draft jalan
  // adalah referensi pasar.)
  eq(rigid.priceBasis, 'REFERENSI_PASAR', 'perkerasan REFERENSI_PASAR');
  const clearing = traces.find((t) => t.description.includes('Pembersihan'))!;
  eq(clearing.traceSource, 'TEMPLATE', 'clearing TEMPLATE');
  eq(clearing.volumeBasis, 'USER_DIMENSION', 'clearing USER_DIMENSION (dimensi teks)');
  for (const t of traces) eq(t.wbsNodeId, 'wbs:jalan', `wbsNodeId trace "${t.description}"`);
  // traceItemSpecs langsung (specChain) == trace via universalRab.
  const direct = traceItemSpecs(d, ROAD_SPECS);
  eq(direct.length, traces.length, 'trace langsung == trace via draft');
});

check('4.4 item dengan spek ASSUMPTION membawa status terburuk (ASSUMPTION > CONFIRMED)', () => {
  const d = synthDraft([
    synthPart({
      scopeId: 'jalan', scopeLabel: 'Jalan & Perkerasan',
      template: { id: 'SYN-JALAN', name: 'Template Sintetis Jalan', parameters: [], components: [{ id: 'c1', name: 'Perkerasan Hotmix sintetis', calculationRule: '1', variables: [] }] },
      generation: { items: [synthItem('i1', 'Perkerasan Hotmix sintetis')] },
    }),
  ]);
  const traces = traceItemSpecs(d, [
    spec('road-pavement', 'material', 'Jenis perkerasan jalan', 'Hotmix', 'ASSUMPTION'),
  ]);
  eq(traces.length, 1, '1 trace');
  eq(JSON.stringify(traces[0].specKeys), JSON.stringify(['road-pavement']), 'tertaut road-pavement');
  eq(traces[0].specStatus, 'ASSUMPTION', 'status terburuk ASSUMPTION');
});

// ---------------------------------------------------------------- §5
console.log('§5 field wajib hilang');

check('5.1 parameter NUMBER tanpa nilai pengguna + tanpa default → hilang; pesan menyebut template + field + item terdampak', () => {
  const d = synthDraft([
    synthPart({
      scopeId: 'jalan', scopeLabel: 'Jalan & Perkerasan',
      template: {
        id: 'SYN-JALAN', name: 'Template Sintetis Jalan',
        parameters: [
          { key: 'road_length', label: 'Panjang Jalan', type: 'NUMBER' },
          { key: 'road_width', label: 'Lebar Perkerasan', type: 'NUMBER', defaultValue: 6 },
        ],
        components: [{ id: 'c1', name: 'Perkerasan jalan sintetis', calculationRule: 'road_length * road_width', variables: ['road_length', 'road_width'] }],
      },
      evaluatedParams: { road_length: 100, road_width: 6 },
      generation: { items: [synthItem('i1', 'Perkerasan jalan sintetis')] },
    }),
  ]);
  const missing = detectMissingRequiredSpecs(d, []);
  eq(missing.length, 1, 'tepat 1 field hilang');
  eq(missing[0].field, 'Panjang Jalan', 'field hilang = Panjang Jalan');
  assert.ok(missing[0].message.includes('Template Sintetis Jalan'), 'pesan menyebut template');
  assert.ok(missing[0].message.includes('Panjang Jalan'), 'pesan menyebut field');
  assert.ok(missing[0].message.includes('Perkerasan jalan sintetis'), 'pesan menyebut item terdampak');
  assert.ok(missing[0].message.includes('Lengkapi'), 'pesan menyebut apa yang harus dilengkapi');
});

check('5.2 spek material UNRESOLVED → hilang dengan specKey; pesan menyebut label spek + "belum dijawab"', () => {
  const d = synthDraft([
    synthPart({
      scopeId: 'jalan', scopeLabel: 'Jalan & Perkerasan',
      template: { id: 'SYN-JALAN', name: 'Template Sintetis Jalan', parameters: [], components: [] },
      generation: { items: [synthItem('i1', 'Perkerasan jalan sintetis')] },
    }),
  ]);
  const missing = detectMissingRequiredSpecs(d, [
    spec('road-pavement', 'material', 'Jenis perkerasan jalan', null, 'UNRESOLVED'),
  ]);
  eq(missing.length, 1, 'tepat 1 field hilang');
  eq(missing[0].specKey, 'road-pavement', 'specKey road-pavement');
  assert.ok(missing[0].message.includes('Jenis perkerasan jalan'), 'pesan menyebut label spek');
  assert.ok(missing[0].message.includes('belum dijawab'), 'pesan menyebut belum dijawab');
});

check('5.3 KONTROL NEGATIF: param ber-default tidak hilang; spek opsional dilewati tidak masuk missing (tapi tercatat unresolved)', () => {
  const d = synthDraft([
    synthPart({
      scopeId: 'jalan', scopeLabel: 'Jalan & Perkerasan',
      template: {
        id: 'SYN-JALAN', name: 'Template Sintetis Jalan',
        parameters: [{ key: 'road_width', label: 'Lebar Perkerasan', type: 'NUMBER', defaultValue: 6 }],
        components: [],
      },
      generation: { items: [synthItem('i1', 'Perkerasan jalan sintetis')] },
    }),
  ]);
  const missing = detectMissingRequiredSpecs(d, [
    spec('road-traffic', 'condition', 'Kelas lalu lintas jalan', null, 'UNRESOLVED'),
  ]);
  eq(missing.length, 0, 'tidak ada field wajib hilang');
  const report = validateWbsCompleteness(d, [
    spec('road-traffic', 'condition', 'Kelas lalu lintas jalan', null, 'UNRESOLVED'),
  ]);
  assert.ok(report.unresolvedSpecKeys.includes('road-traffic'), 'road-traffic tercatat unresolved');
  eq(report.status, 'BELUM_LENGKAP', 'tetap BELUM_LENGKAP karena ada spek unresolved');
});

// ---------------------------------------------------------------- §6
console.log('§6 duplikat item');

check('6.1 uraian+satuan sama dalam SATU part → duplikat; pesan menyebut item + jumlah + "terhitung ganda"', () => {
  const d = synthDraft([
    synthPart({
      scopeId: 'jalan', scopeLabel: 'Jalan & Perkerasan',
      template: { id: 'SYN-JALAN', name: 'Template Sintetis Jalan', parameters: [], components: [] },
      generation: { items: [synthItem('i1', 'Perkerasan jalan sintetis'), synthItem('i2', 'Perkerasan jalan sintetis')] },
    }),
  ]);
  const dups = detectDuplicateItems(d);
  eq(dups.length, 1, 'tepat 1 duplikat');
  eq(dups[0].count, 2, 'muncul 2 kali');
  eq(dups[0].itemIds.length, 2, '2 itemId');
  assert.ok(dups[0].message.includes('Perkerasan jalan sintetis'), 'pesan menyebut item');
  assert.ok(dups[0].message.includes('terhitung ganda'), 'pesan menyebut risiko ganda');
  eq(validateWbsCompleteness(d, []).duplicates.length, 1, 'duplikat masuk laporan kelengkapan');
  eq(validateWbsCompleteness(d, []).status, 'BELUM_LENGKAP', 'duplikat menggagalkan LENGKAP');
});

check('6.2 KONTROL NEGATIF: item sama di part BERBEDA bukan duplikat (paket/seksi berbeda)', () => {
  const mk = (scopeId: string, scopeLabel: string, templateId: string) => synthPart({
    scopeId, scopeLabel,
    template: { id: templateId, name: `Template ${templateId}`, parameters: [], components: [] },
    generation: { items: [synthItem('i1', 'Pembersihan lahan sintetis')] },
  });
  const d = synthDraft([mk('jalan', 'Jalan & Perkerasan', 'SYN-JALAN'), mk('drainase', 'Drainase & Saluran', 'SYN-DRAIN')]);
  eq(detectDuplicateItems(d).length, 0, 'tidak ada duplikat lintas part');
});

// ---------------------------------------------------------------- §7
console.log('§7 spek UNRESOLVED → tidak lengkap / tidak terverifikasi');

check('7.1 road-pavement UNRESOLVED → BELUM_LENGKAP, isVerified false, pesan menyebut spek belum terjawab', () => {
  const specs = [
    spec('road-pavement', 'material', 'Jenis perkerasan jalan', null, 'UNRESOLVED'),
    spec('road-drainage', 'scope', 'Drainase pendamping jalan', 'Drainase baru'),
  ];
  const d = draftOf(ROAD_TEXT, specs);
  const report = repOf(d, specs);
  eq(report.status, 'BELUM_LENGKAP', 'status BELUM_LENGKAP');
  eq(report.isVerified, false, 'isVerified false');
  assert.ok(report.unresolvedSpecKeys.includes('road-pavement'), 'road-pavement tercatat unresolved');
  assert.ok(report.issues.some((i) => i.includes('Jenis perkerasan jalan') && i.includes('belum terjawab')), 'pesan menyebut spek belum terjawab');
  const lines = wbsCompletenessLines(d);
  assert.ok(lines[0].includes('BELUM LENGKAP'), 'baris pratinjau BELUM LENGKAP');
  assert.ok(!lines.some((l) => l.includes(': LENGKAP —')), 'tidak ada baris klaim LENGKAP (": LENGKAP —" hanya di kalimat LENGKAP)');
});

check('7.2 KONTROL POSITIF: semua spek CONFIRMED → LENGKAP + isVerified true + baris LENGKAP', () => {
  const d = draftOf(ROAD_TEXT, ROAD_SPECS);
  eq(repOf(d, ROAD_SPECS).status, 'LENGKAP', 'status LENGKAP');
  eq(repOf(d, ROAD_SPECS).isVerified, true, 'isVerified true');
  const lines = wbsCompletenessLines(d);
  assert.ok(lines[0].includes('LENGKAP —'), 'baris pratinjau LENGKAP');
});

// ---------------------------------------------------------------- §8
console.log('§8 koreksi pengguna bertahan sesudah regenerasi');

check('8.1 pengecualian pengguna bertahan: exclude → regenerasi (previousArtifact) → tetap DIKECUALIKAN by user + alasan sama', () => {
  const d = draftOf(KANDANG_TEXT, KANDANG_SPECS);
  const v1 = wbsOf(d, KANDANG_SPECS);
  const excluded = excludeWbsNode(v1, 'wbs:mep', 'MEP dikerjakan paket terpisah oleh owner.');
  eq(wbsNodeById(excluded, 'mep')!.status, 'DIKECUALIKAN', 'pra-regenerasi: DIKECUALIKAN');
  const v2 = buildWbsForDraft(d, KANDANG_SPECS, { previousArtifact: excluded });
  const mep = wbsNodeById(v2, 'mep')!;
  eq(mep.status, 'DIKECUALIKAN', 'pasca-regenerasi: tetap DIKECUALIKAN');
  eq(mep.exclusion?.by, 'user', 'pengecualian tetap by user');
  eq(mep.exclusion?.reason, 'MEP dikerjakan paket terpisah oleh owner.', 'alasan tetap sama');
  eq(mep.userCorrected, true, 'userCorrected bertahan');
  eq(validateWbsCompleteness(d, KANDANG_SPECS, v2).status, 'LENGKAP', 'laporan pasca-regenerasi LENGKAP');
});

check('8.2 note koreksi bertahan + exclude/annotate menolak input tak valid', () => {
  const d = draftOf(ROAD_TEXT, ROAD_SPECS);
  const noted = annotateWbsNode(wbsOf(d, ROAD_SPECS), 'wbs:jalan', 'Lebar bahu sudah dikonfirmasi owner 1 m.');
  const v2 = buildWbsForDraft(d, ROAD_SPECS, { previousArtifact: noted });
  eq(wbsNodeById(v2, 'jalan')!.correctionNote, 'Lebar bahu sudah dikonfirmasi owner 1 m.', 'note bertahan');
  eq(wbsNodeById(v2, 'jalan')!.userCorrected, true, 'userCorrected bertahan');
  assert.throws(() => excludeWbsNode(wbsOf(d, ROAD_SPECS), 'wbs:tidak-ada', 'x'), /tidak ditemukan/, 'exclude node tak dikenal melempar');
  assert.throws(() => excludeWbsNode(wbsOf(d, ROAD_SPECS), 'wbs:jalan', '  '), /wajib diisi/, 'exclude tanpa alasan melempar');
  assert.throws(() => annotateWbsNode(wbsOf(d, ROAD_SPECS), 'wbs:jalan', ''), /wajib diisi/, 'annotate tanpa note melempar');
});

check('8.3 koreksi SPEK bertahan: entri terbaru menang (latestSpecsByKey) + pengecualian bertahan walau spek berubah', () => {
  const v1specs = [spec('road-pavement', 'material', 'Jenis perkerasan jalan', 'Hotmix')];
  const v2specs = [
    spec('road-pavement', 'material', 'Jenis perkerasan jalan', 'Hotmix'),
    spec('road-pavement', 'material', 'Jenis perkerasan jalan', 'Beton rigid', 'CONFIRMED', 'hotmix-v1'),
  ];
  const latest = latestSpecsByKey(v2specs);
  eq(latest.length, 1, 'dedup jadi 1 spek');
  eq(latest[0].value, 'Beton rigid', 'entri terbaru (rigid) menang');
  // Artefak dibangun dari v1, pengguna mengecualikan drainase (via
  // artefak sintetis: tambah node drainase kosong dulu lewat spek).
  const d = synthDraft([
    synthPart({
      scopeId: 'jalan', scopeLabel: 'Jalan & Perkerasan',
      template: { id: 'SYN-JALAN', name: 'Template Sintetis Jalan', parameters: [], components: [] },
      generation: { items: [synthItem('i1', 'Perkerasan jalan sintetis')] },
    }),
  ]);
  const drainSpecs = [spec('drainage-material', 'material', 'Material saluran drainase', 'U-ditch')];
  const v1 = buildWbsForDraft(d, drainSpecs);
  eq(wbsNodeById(v1, 'drainase')!.status, 'KOSONG', 'pra-kondisi: drainase KOSONG');
  const excluded = excludeWbsNode(v1, 'wbs:drainase', 'Drainase sudah ada (eksisting).');
  // Regenerasi dengan spek BERBEDA (koreksi spek) + artefak lama:
  // pengecualian drainase tetap ada (node masih ada karena spek
  // drainase masih ada), dan spek terbaru yang dipakai.
  const v2 = buildWbsForDraft(d, [...drainSpecs, ...v2specs], { previousArtifact: excluded });
  eq(wbsNodeById(v2, 'drainase')!.status, 'DIKECUALIKAN', 'pengecualian bertahan walau spek berubah');
  eq(wbsNodeById(v2, 'jalan')!.specKeys.includes('road-pavement'), true, 'node jalan memakai spek terbaru');
});

// ---------------------------------------------------------------- §9
console.log('§9 spek bertentangan');

check('9.1 nilai ganda CONFIRMED tanpa supersedes → konflik NILAI_GANDA; pesan menyebut label + kedua nilai', () => {
  const d = synthDraft([
    synthPart({
      scopeId: 'jalan', scopeLabel: 'Jalan & Perkerasan',
      template: { id: 'SYN-JALAN', name: 'Template Sintetis Jalan', parameters: [], components: [] },
      generation: { items: [synthItem('i1', 'Perkerasan jalan sintetis')] },
    }),
  ]);
  const conflicts = detectSpecConflicts(d, [
    spec('road-pavement', 'material', 'Jenis perkerasan jalan', 'Hotmix'),
    spec('road-pavement', 'material', 'Jenis perkerasan jalan', 'Beton rigid'),
  ]);
  eq(conflicts.length, 1, 'tepat 1 konflik');
  eq(conflicts[0].kind, 'NILAI_GANDA', 'jenis NILAI_GANDA');
  assert.ok(conflicts[0].message.includes('Jenis perkerasan jalan'), 'pesan menyebut label');
  assert.ok(conflicts[0].message.includes('hotmix') && conflicts[0].message.includes('beton rigid'), 'pesan menyebut kedua nilai');
  eq(validateWbsCompleteness(d, [
    spec('road-pavement', 'material', 'Jenis perkerasan jalan', 'Hotmix'),
    spec('road-pavement', 'material', 'Jenis perkerasan jalan', 'Beton rigid'),
  ]).status, 'BELUM_LENGKAP', 'konflik menggagalkan LENGKAP');
});

check('9.2 KONTROL NEGATIF: entri terakhir membawa supersedes → bukan konflik (koreksi menyelesaikan)', () => {
  const d = synthDraft([
    synthPart({
      scopeId: 'jalan', scopeLabel: 'Jalan & Perkerasan',
      template: { id: 'SYN-JALAN', name: 'Template Sintetis Jalan', parameters: [], components: [] },
      generation: { items: [synthItem('i1', 'Perkerasan jalan sintetis')] },
    }),
  ]);
  const conflicts = detectSpecConflicts(d, [
    spec('road-pavement', 'material', 'Jenis perkerasan jalan', 'Hotmix'),
    spec('road-pavement', 'material', 'Jenis perkerasan jalan', 'Beton rigid', 'CONFIRMED', 'hotmix-v1'),
  ]);
  eq(conflicts.length, 0, 'tidak ada konflik bila ada supersedes');
});

check('9.3 dimensi DED bertentangan dengan dimensi draft → konflik DIMENSI_BERTENTANGAN', () => {
  const d = synthDraft([
    synthPart({
      scopeId: 'jalan', scopeLabel: 'Jalan & Perkerasan',
      template: { id: 'SYN-JALAN', name: 'Template Sintetis Jalan', parameters: [], components: [] },
      generation: { items: [synthItem('i1', 'Perkerasan jalan sintetis')] },
    }),
  ], { lengthM: 10 });
  const conflicts = detectSpecConflicts(d, [
    spec('ded-length', 'dimension', 'Panjang (dari DED)', 12),
  ]);
  eq(conflicts.length, 1, 'tepat 1 konflik');
  eq(conflicts[0].kind, 'DIMENSI_BERTENTANGAN', 'jenis DIMENSI_BERTENTANGAN');
  assert.ok(conflicts[0].message.includes('12') && conflicts[0].message.includes('10'), 'pesan menyebut kedua nilai');
  const ok = detectSpecConflicts(d, [spec('ded-length', 'dimension', 'Panjang (dari DED)', 10)]);
  eq(ok.length, 0, 'dimensi sama → tidak ada konflik');
});

// ---------------------------------------------------------------- §10
console.log('§10 regresi: validateDraftChain + kontrak P3B tidak berubah');

check('10.1 chainValidation tetap ada + road-pavement USED; total pratinjau jalan beton 1 km tetap Rp3.481.800.000 (golden P3B)', () => {
  const d = draftOf('Buat RAB jalan beton sepanjang 1 km');
  assert.ok(d.chainValidation === undefined, 'tanpa spek: chainValidation absen (perilaku lama)');
  const d2 = draftOf(ROAD_TEXT, ROAD_SPECS);
  assert.ok(d2.chainValidation, 'dengan spek: chainValidation ada');
  const cov = d2.chainValidation!.specCoverage.find((s) => s.key === 'road-pavement');
  eq(cov?.status, 'USED', 'road-pavement USED (validateDraftChain tak berubah)');
  eq(computeTotals(d).estimatedTotal, 3481800000, 'total pratinjau jalan beton 1 km = golden P3B');
  eq(effectiveItems(d).length, 8, '8 item efektif (P3B)');
});

delete (globalThis as any).window;
delete (globalThis as any).localStorage;

console.log(`\np3dWbsCompleteness: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

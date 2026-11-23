/**
 * templateSuitability.test.ts — Batch 1 §4: Template Intelligence
 * (Program Universal Batch 1–5, 2026-11-23).
 *
 * Menguji evaluator kesesuaian template
 * (src/ai-tools/ezrab-ai/templateSuitability.ts) + kabelnya ke jalur
 * kanonis (pickTemplateForScope / buildUniversalDraft): 5 kegagalan
 * W13 harus terperbaiki, perilaku sah yang sudah ada dipertahankan,
 * dan tidak ada fallback diam-diam melewati constraint keras.
 *
 * Suite tsx polos (BUKAN vitest). Jalankan dari root repo:
 *   npx --yes tsx src/test/templateSuitability.test.ts
 *
 * Konvensi: `B1.Nx` = kasus Batch 1 nomor N, asersi x. Nilai rupiah
 * TIDAK di-pin (harga katalog bisa berubah); yang di-pin adalah
 * identitas template, outcome keputusan, spek hilang, dan jumlah item.
 */

import {
  buildUniversalDraft,
  pickTemplateForScope,
  extractUniversalSpec,
  relevantParamKinds,
  reviseUniversalDraft,
  computeTotals,
  effectiveItems,
  itemKey,
  SCOPE_GROUPS,
  type UniversalDraft,
  type UniversalSpec,
  type ScopeGroup,
} from '../ai-tools/ezrab-ai/universalRab';
import {
  evaluateTemplateSuitability,
  type SuitabilityDecision,
} from '../ai-tools/ezrab-ai/templateSuitability';

/* localStorage shim (pola universalRabHardening) */
const storage: Record<string, string> = {};
(global as any).window = {
  localStorage: {
    getItem: (k: string) => storage[k] || null,
    setItem: (k: string, v: string) => { storage[k] = v; },
    removeItem: (k: string) => { delete storage[k]; },
    clear: () => { for (const k of Object.keys(storage)) delete storage[k]; },
  },
};
(global as any).localStorage = (global as any).window.localStorage;

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */
let pass = 0;
let fail = 0;
const failures: string[] = [];
const sectionStats = new Map<string, { pass: number; fail: number }>();
let currentSection = '';
function section(id: string, title: string): void {
  currentSection = id;
  sectionStats.set(id, { pass: 0, fail: 0 });
  console.log(`\n== B1.${id} — ${title} ==`);
}
function check(name: string, cond: boolean, detail?: unknown): void {
  const st = sectionStats.get(currentSection);
  if (cond) {
    pass += 1;
    if (st) st.pass += 1;
    console.log(`  PASS ${name}`);
  } else {
    fail += 1;
    if (st) st.fail += 1;
    failures.push(name);
    console.log(`  FAIL ${name} — detail: ${JSON.stringify(detail)}`);
  }
}

function scopeById(id: string): ScopeGroup {
  const s = SCOPE_GROUPS.find((g) => g.id === id);
  if (!s) throw new Error(`scope tidak dikenal: ${id}`);
  return s;
}

function pickOf(text: string, scopeId: string) {
  const spec = extractUniversalSpec(text);
  return pickTemplateForScope(spec, scopeById(scopeId));
}

/** Evaluator langsung (unit-level) atas ranked list kanonis. */
function decide(text: string, scopeId: string): { spec: UniversalSpec; decision: SuitabilityDecision } {
  const spec = extractUniversalSpec(text);
  const scope = scopeById(scopeId);
  const res = pickTemplateForScope(spec, scope);
  const decision = evaluateTemplateSuitability(spec, scope, res.ranked, {
    relevantKinds: relevantParamKinds(scope.primaryMeasure),
  });
  return { spec, decision };
}

function draftOf(text: string, forcedTemplateId?: string): UniversalDraft | null {
  const res = buildUniversalDraft(text, forcedTemplateId);
  return res.kind === 'draft' ? res.draft : null;
}

function needsSpecOf(text: string): { kind: string; reason: string; missing: string[] } | null {
  const res = buildUniversalDraft(text);
  if (res.kind !== 'needs-spec') return null;
  return { kind: res.kind, reason: res.reason, missing: res.missing ?? [] };
}

function draftTotal(d: UniversalDraft): number {
  return computeTotals(d).estimatedTotal;
}

function dupKeys(d: UniversalDraft): string[] {
  const keys = effectiveItems(d).map((it) => itemKey(it));
  return keys.filter((k, i) => keys.indexOf(k) !== i);
}

function rejection(decision: SuitabilityDecision, templateId: string) {
  return decision.rejections.find((r) => r.templateId === templateId);
}

/* ================================================================== */
/* 1. Lima kegagalan W13                                               */
/* ================================================================== */
section('1', 'Perumahan 20 unit — BUKAN hotel (kegagalan #1)');

{
  const res = pickOf('buatkan RAB perumahan 20 unit', 'gedung');
  check('B1.1a perumahan 20 unit memilih BLD-RUSUN', res.pick?.template.id === 'BLD-RUSUN', res.pick?.template.id);
  check('B1.1b outcome SELECTED', res.suitability.outcome === 'SELECTED', res.suitability.outcome);
  check('B1.1c bukan fallback, bukan lintas-pool', !res.suitability.fallbackUsed && !res.suitability.crossPoolUsed, res.suitability);
  const hotel = rejection(res.suitability, 'BLD-HOTEL-RESORT');
  check('B1.1d hotel ditolak constraint FUNGSI (bukan skor)', hotel?.violations.some((v) => v.kind === 'function') === true, hotel?.violations);
  check('B1.1e skor tinggi TIDAK mengalahkan constraint keras (hotel skor tertinggi tapi ditolak)',
    res.ranked.find((r) => r.template.id === 'BLD-HOTEL-RESORT')?.score === res.ranked[0]?.score && hotel !== undefined,
    { top: res.ranked[0]?.template.id, topScore: res.ranked[0]?.score, hotelScore: res.ranked.find((r) => r.template.id === 'BLD-HOTEL-RESORT')?.score });
  const d = draftOf('buatkan RAB perumahan 20 unit');
  check('B1.1f draft 14 item, 1 part rusun', d !== null && effectiveItems(d).length === 14 && d.parts.length === 1, d ? effectiveItems(d).length : null);
  check('B1.1g caveat perumahan tapak tercantum di asumsi',
    d !== null && d.assumptions.some((a) => /perumahan tapak/i.test(a)), d?.assumptions.slice(0, 3));
  // Peringkat lunak: kata benda "unit" cocok dengan num_units rusun (+4),
  // tidak cocok dengan num_rooms asrama (−4).
  const rusun = res.suitability.candidates.find((c) => c.templateId === 'BLD-RUSUN');
  const dorm = res.suitability.candidates.find((c) => c.templateId === 'BLD-DORMITORY');
  check('B1.1h peringkat lunak: rusun di atas asrama untuk "unit"',
    rusun !== undefined && dorm !== undefined && rusun.adjustedScore > dorm.adjustedScore,
    { rusun: rusun?.adjustedScore, dorm: dorm?.adjustedScore });
}

{
  const res = pickOf('buatkan RAB perumahan 20 unit luas 720 m2', 'gedung');
  check('B1.1i perumahan + luas TOTAL 720 m² → TIDAK ada pick (bukan rusun dengan luas per-unit 720)',
    res.pick === null, res.pick?.template.id);
  check('B1.1j outcome NEEDS_CLARIFICATION', res.suitability.outcome === 'NEEDS_CLARIFICATION', res.suitability.outcome);
  check('B1.1k spek hilang: luas PER UNIT (bukan luas total)',
    res.suitability.missingSpecs.some((m) => /luas per unit/i.test(m)), res.suitability.missingSpecs);
  check('B1.1l TIDAK ada fallback diam-diam untuk pelanggaran per-unit',
    res.suitability.fallbackUsed === false, res.suitability.fallbackUsed);
  const rusun = rejection(res.suitability, 'BLD-RUSUN');
  check('B1.1m rusun ditolak dimensional-per-unit (mapper total→per-unit)',
    rusun?.violations.some((v) => v.kind === 'dimensional-per-unit') === true, rusun?.violations);
  const ns = needsSpecOf('buatkan RAB perumahan 20 unit luas 720 m2');
  check('B1.1n draft TIDAK dibuat; needs-spec menyebut luas per unit',
    ns !== null && ns.missing.some((m) => /luas per unit/i.test(m)), ns?.missing);
}

section('2', 'Retaining wall — BUKAN taman kota (kegagalan #2)');

{
  const res = pickOf('buatkan RAB retaining wall panjang 100 m tinggi 3 m', 'lanskap');
  check('B1.2a retaining wall memilih STR-RETAINING-RC', res.pick?.template.id === 'STR-RETAINING-RC', res.pick?.template.id);
  check('B1.2b lintas-pool (kategori struktur, bukan landscape)', res.suitability.crossPoolUsed === true, res.suitability.crossPoolUsed);
  check('B1.2c outcome SELECTED', res.suitability.outcome === 'SELECTED', res.suitability.outcome);
  const park = rejection(res.suitability, 'LAND-URBAN-PARK');
  check('B1.2d taman kota ditolak constraint FUNGSI', park?.violations.some((v) => v.kind === 'function') === true, park?.violations);
  const d = draftOf('buatkan RAB retaining wall panjang 100 m tinggi 3 m');
  check('B1.2e draft 8 item dinding penahan', d !== null && effectiveItems(d).length === 8, d ? effectiveItems(d).length : null);
  check('B1.2f asumsi mencatat asal lintas-pool',
    d !== null && d.assumptions.some((a) => /kategori STRUKTUR_BETON_BAJA/i.test(a)), d?.assumptions.slice(0, 3));
}

section('3', 'Ruko 2 lantai — BUKAN high-rise (kegagalan #3)');

{
  const res = pickOf('buatkan RAB ruko 2 lantai luas 120 m2', 'gedung');
  // B1 (2026-11-23, pasca-hapus D1): evaluator menyaring (high-rise
  // ditolak F1), penskor kanonis mengurutkan — SHOWROOM (16, retail ≈
  // ruko) mengungguli OFFICE-MULTI (8, −8 penalti konflik kantor/ruko).
  // Parameter display/bengkel di luar batas diungkap lewat peringatan.
  check('B1.3a ruko memilih BLD-SHOWROOM-AUTO (retail, bukan high-rise)', res.pick?.template.id === 'BLD-SHOWROOM-AUTO', res.pick?.template.id);
  check('B1.3b outcome SELECTED', res.suitability.outcome === 'SELECTED', res.suitability.outcome);
  const tower = rejection(res.suitability, 'BLD-HIGHRISE-TOWER');
  check('B1.3c high-rise ditolak (fungsi generik)',
    tower !== undefined && tower.violations.length > 0, tower?.violations);
  const d = draftOf('buatkan RAB ruko 2 lantai luas 120 m2');
  check('B1.3d draft 14 item', d !== null && effectiveItems(d).length === 14, d ? effectiveItems(d).length : null);
  check('B1.3e caveat "belum ada template ruko khusus" tercantum',
    d !== null && d.assumptions.some((a) => /belum memiliki template ruko khusus/i.test(a)), d?.assumptions.slice(0, 3));
}

section('4', 'Jalan beton baru — BUKAN rekonstruksi (kegagalan #4)');

{
  const res = pickOf('buatkan RAB jalan beton baru panjang 1 km lebar 6 m', 'jalan');
  check('B1.4a jalan beton BARU memilih INFRA-ROAD-RIGID', res.pick?.template.id === 'INFRA-ROAD-RIGID', res.pick?.template.id);
  const recon = rejection(res.suitability, 'INFRA-ROAD-RECONSTRUCTION');
  check('B1.4b template rekonstruksi ditolak construction-type (tanpa bukti eksisting)',
    recon?.violations.some((v) => v.kind === 'construction-type') === true, recon?.violations);
  const asphalt = rejection(res.suitability, 'INFRA-ROAD-ASPHALT');
  check('B1.4c template aspal ditolak MATERIAL (beton ≠ aspal)',
    asphalt?.violations.some((v) => v.kind === 'material') === true, asphalt?.violations);
  const d = draftOf('buatkan RAB jalan beton baru panjang 1 km lebar 6 m');
  check('B1.4d draft 8 item', d !== null && effectiveItems(d).length === 8, d ? effectiveItems(d).length : null);
}

section('5', 'Rekonstruksi jalan eksisting — template rekonstruksi DIPAKAI');

{
  const res = pickOf('buatkan RAB rekonstruksi jalan beton eksisting panjang 2 km lebar 7 m', 'jalan');
  check('B1.5a rekonstruksi jalan beton memilih INFRA-ROAD-RECONSTRUCTION',
    res.pick?.template.id === 'INFRA-ROAD-RECONSTRUCTION', res.pick?.template.id);
  const rigid = rejection(res.suitability, 'INFRA-ROAD-RIGID');
  check('B1.5b template jalan BARU ditolak untuk permintaan rekonstruksi',
    rigid?.violations.some((v) => v.kind === 'construction-type') === true, rigid?.violations);
  const d = draftOf('buatkan RAB rekonstruksi jalan beton eksisting panjang 2 km lebar 7 m');
  check('B1.5c draft 8 item', d !== null && effectiveItems(d).length === 8, d ? effectiveItems(d).length : null);
  check('B1.5d asumsi mencatat RIGID tidak dipakai + alasan evaluator',
    d !== null && d.assumptions.some((a) => /TIDAK dipakai/i.test(a) && /Rigid Pavement/i.test(a)), d?.assumptions.slice(0, 2));
}

section('6', 'Listrik-only — BUKAN paket MEP terpadu (kegagalan #5)');

{
  const res = pickOf('buatkan RAB instalasi listrik luas 120 m2', 'mep');
  check('B1.6a listrik-only → TIDAK ada pick', res.pick === null, res.pick?.template.id);
  check('B1.6b outcome NEEDS_CLARIFICATION', res.suitability.outcome === 'NEEDS_CLARIFICATION', res.suitability.outcome);
  const pkg = rejection(res.suitability, 'MEP-COMPLETE-PKG');
  check('B1.6c paket MEP terpadu ditolak scope-coverage',
    pkg?.violations.some((v) => v.kind === 'scope-coverage') === true, pkg?.violations);
  const dist = rejection(res.suitability, 'MEP-ELECTRICAL-DIST');
  check('B1.6d template distribusi listrik ditolak missing-basis (berparameter kVA, bukan luas)',
    dist?.violations.some((v) => v.kind === 'missing-basis') === true, dist?.violations);
  check('B1.6e spek hilang: daya kVA atau jumlah titik',
    res.suitability.missingSpecs.some((m) => /kVA|titik/i.test(m)), res.suitability.missingSpecs);
  check('B1.6f TIDAK ada fallback diam-diam (scope/missing-basis tidak pernah fallback)',
    res.suitability.fallbackUsed === false, res.suitability.fallbackUsed);
  const ns = needsSpecOf('buatkan RAB instalasi listrik luas 120 m2');
  check('B1.6g needs-spec memakai penjelasan evaluator (bukan pesan generik)',
    ns !== null && /Paket Terpadu MEP/i.test(ns.reason), ns?.reason.slice(0, 120));
}

{
  const res = pickOf('buatkan RAB instalasi plumbing luas 90 m2', 'mep');
  check('B1.6h plumbing-only (luas saja) → TIDAK ada pick', res.pick === null, res.pick?.template.id);
  check('B1.6i spek hilang: lantai/unit basah atau panjang pipa',
    res.suitability.missingSpecs.some((m) => /lantai|unit basah|panjang jaringan pipa/i.test(m)), res.suitability.missingSpecs);
  const septic = rejection(res.suitability, 'DRN-SEPTIC-COMMUNAL');
  check('B1.6j septik komunal lintas-pool DITOLAK untuk plumbing gedung (bukan template MEP)',
    septic?.violations.some((v) => v.kind === 'scope-coverage') === true, septic?.violations);
}

{
  // Subsistem tunggal yang PUNYA template berbasis luas tetap nge-draft.
  const hvac = pickOf('buatkan RAB instalasi AC luas 500 m2', 'mep');
  check('B1.6k AC (HVAC) berbasis luas → MEP-HVAC-VRF', hvac.pick?.template.id === 'MEP-HVAC-VRF', hvac.pick?.template.id);
  const d = draftOf('buatkan RAB instalasi AC luas 500 m2');
  check('B1.6l draft HVAC 4 item', d !== null && effectiveItems(d).length === 4, d ? effectiveItems(d).length : null);
}

/* ================================================================== */
/* 2. Kasus §4.5 lain                                                  */
/* ================================================================== */
section('7', 'Gudang industri, rumah tipe 36, hotel, irigasi');

{
  const res = pickOf('buatkan RAB gudang 10 x 20 m', 'gedung');
  check('B1.7a gudang memilih BLD-IND-WAREHOUSE', res.pick?.template.id === 'BLD-IND-WAREHOUSE', res.pick?.template.id);
  const d = draftOf('buatkan RAB gudang 10 x 20 m');
  check('B1.7b draft gudang ada', d !== null && effectiveItems(d).length > 0, d ? effectiveItems(d).length : null);
}

{
  // Rumah tipe 36: jalur rumah-tinggal (tanpa scope gedung) — needs-spec
  // dengan pemahaman fungsi, BUKAN draft hotel/high-rise.
  const ns = needsSpecOf('buatkan RAB rumah tipe 36 luas 36 m2');
  check('B1.7c rumah tipe 36 → needs-spec jalur rumah tinggal (bukan draft hotel)',
    ns !== null, ns?.kind);
  const { decision } = decide('buatkan RAB rumah tipe 36 luas 36 m2', 'gedung');
  const hotel = rejection(decision, 'BLD-HOTEL-RESORT');
  check('B1.7d di level evaluator, hotel ditolak FUNGSI untuk rumah tinggal',
    hotel?.violations.some((v) => v.kind === 'function') === true, hotel?.violations);
}

{
  const res = pickOf('buatkan RAB hotel 5 lantai 40 kamar luas kamar 30 m2', 'gedung');
  check('B1.7e hotel + kamar + luas kamar → BLD-HOTEL-RESORT', res.pick?.template.id === 'BLD-HOTEL-RESORT', res.pick?.template.id);
  const d = draftOf('buatkan RAB hotel 5 lantai 40 kamar luas kamar 30 m2');
  check('B1.7f draft hotel 4 item', d !== null && effectiveItems(d).length === 4, d ? effectiveItems(d).length : null);
  const ns = needsSpecOf('buatkan RAB hotel 5 lantai luas 2000 m2');
  check('B1.7g hotel + luas TOTAL saja → needs-spec (jumlah kamar + luas per kamar)',
    ns !== null && ns.missing.some((m) => /jumlah kamar/i.test(m)) && ns.missing.some((m) => /luas rata-rata per kamar/i.test(m)),
    ns?.missing);
}

{
  const d = draftOf('buatkan RAB saluran irigasi panjang 500 m lebar 2 m');
  check('B1.7h irigasi → SDA-IRRIGATION-STONE, 1 part (digabung, tanpa ganda)',
    d !== null && d.parts.length === 1 && d.parts[0].template.id === 'SDA-IRRIGATION-STONE',
    d?.parts.map((p) => p.template.id));
}

section('8', 'Jembatan: bentang hilang & bentang di luar jangkauan');

{
  const { decision } = decide('buatkan RAB jembatan beton lebar 7 m', 'jembatan');
  check('B1.8a jembatan tanpa bentang → NEEDS_CLARIFICATION', decision.outcome === 'NEEDS_CLARIFICATION', decision.outcome);
  check('B1.8b spek hilang: bentang jembatan (m)',
    decision.missingSpecs.some((m) => /bentang jembatan/i.test(m)), decision.missingSpecs);
  const d12 = draftOf('buatkan RAB jembatan beton bentang 12 m lebar 7 m');
  check('B1.8c jembatan bentang 12 m → BRG-GIRDER-20M',
    d12 !== null && d12.parts[0]?.template.id === 'BRG-GIRDER-20M', d12?.parts.map((p) => p.template.id));
}

{
  const { decision } = decide('buatkan RAB jembatan beton bentang 50 m', 'jembatan');
  check('B1.8d bentang 50 m beton → ENGINEERING_REVIEW_REQUIRED', decision.outcome === 'ENGINEERING_REVIEW_REQUIRED', decision.outcome);
  check('B1.8e penjelasan menyebut batas katalog (maks 40 m)',
    /maks 40 m/.test(decision.explanation), decision.explanation);
  check('B1.8f spek hilang: desain struktur khusus (DED)',
    decision.missingSpecs.some((m) => /desain struktur khusus|DED/i.test(m)), decision.missingSpecs);
  const ns = needsSpecOf('buatkan RAB jembatan beton bentang 50 m');
  check('B1.8g draft TIDAK dibuat untuk bentang 50 m', ns !== null, ns?.kind);
}

section('9', 'Campuran multidisiplin (12) & menara telekomunikasi (13)');

{
  const d = draftOf('buatkan RAB perumahan 20 unit + jalan 1 km + drainase 500 m + retaining wall 100 m');
  check('B1.9a campuran: 4 part', d !== null && d.parts.length === 4, d?.parts.length);
  check('B1.9b campuran: 39 item (7+10+14+8)', d !== null && effectiveItems(d).length === 39, d ? effectiveItems(d).length : null);
  const ids = d ? d.parts.map((p) => p.template.id).sort() : [];
  check('B1.9c campuran: template per part benar',
    JSON.stringify(ids) === JSON.stringify(['BLD-RUSUN', 'DRN-UDITCH-COVER', 'INFRA-ROAD-COLLECTOR', 'STR-RETAINING-RC'].sort()), ids);
  check('B1.9d campuran: tanpa item duplikat', d !== null && dupKeys(d).length === 0, d ? dupKeys(d) : null);
  check('B1.9e campuran: 4 scope berbeda',
    d !== null && new Set(d.parts.map((p) => p.scope.id)).size === 4, d?.parts.map((p) => p.scope.id));
}

{
  const ns = needsSpecOf('buatkan RAB menara telekomunikasi tinggi 30 m');
  check('B1.9f menara telekomunikasi → needs-spec (objek tak dikenali, tanpa draft menyesatkan)',
    ns !== null && /objek\/pekerjaan konstruksi/i.test(ns.missing.join(' ')), ns?.missing);
}

section('10', 'Ambigu (14) & persetujuan eksplisit cakupan luas (15)');

{
  const res = pickOf('buatkan RAB gedung 3 lantai luas 500 m2', 'gedung');
  check('B1.10a gedung generik 3 lantai → MULTIPLE_CANDIDATES',
    res.suitability.outcome === 'MULTIPLE_CANDIDATES', res.suitability.outcome);
  check('B1.10b ≥2 kandidat valid dari keluarga berbeda',
    res.suitability.candidates.length >= 2, res.suitability.candidates.length);
  check('B1.10c requiredConfirmation terisi',
    res.suitability.requiredConfirmation !== null && res.suitability.requiredConfirmation.length > 0,
    res.suitability.requiredConfirmation?.slice(0, 80));
  const d = draftOf('buatkan RAB gedung 3 lantai luas 500 m2');
  check('B1.10d draft-first: draft tetap dibuat dengan kandidat utama + konfirmasi tercatat di asumsi',
    d !== null && d.assumptions.some((a) => /template yang layak/i.test(a)), d?.assumptions.slice(0, 3));
  // Fungsi spesifik yang jelas TIDAK ambigu: dua teratas satu keluarga.
  const kantor = pickOf('buatkan RAB gedung kantor 3 lantai luas 300 m2', 'gedung');
  check('B1.10e gedung kantor (fungsi jelas) → SELECTED, bukan MULTIPLE_CANDIDATES',
    kantor.suitability.outcome === 'SELECTED', kantor.suitability.outcome);
}

{
  // Persetujuan eksplisit pengguna atas cakupan yang lebih luas: template
  // paksa (forced) mengesampingkan evaluator — draft dihormati apa adanya.
  const d = draftOf('buatkan RAB instalasi listrik luas 120 m2', 'MEP-COMPLETE-PKG');
  check('B1.10f template paksa MEP-COMPLETE-PKG untuk listrik → draft dihormati',
    d !== null && d.parts[0]?.template.id === 'MEP-COMPLETE-PKG', d?.parts.map((p) => p.template.id));
  check('B1.10g draft paksa 5 item (isi paket terpadu)',
    d !== null && effectiveItems(d).length === 5, d ? effectiveItems(d).length : null);
}

/* ================================================================== */
/* 3. Kontrak keputusan + perilaku yang dipertahankan                   */
/* ================================================================== */
section('11', 'Kontrak keputusan evaluator (typed, auditable)');

{
  const { decision } = decide('buatkan RAB ruko 2 lantai luas 120 m2', 'gedung');
  check('B1.11a outcome enum valid', ['SELECTED', 'NEEDS_CLARIFICATION', 'MULTIPLE_CANDIDATES', 'UNSUPPORTED', 'ENGINEERING_REVIEW_REQUIRED'].includes(decision.outcome), decision.outcome);
  check('B1.11b selectedTemplateId terisi untuk SELECTED', decision.selectedTemplateId === 'BLD-SHOWROOM-AUTO', decision.selectedTemplateId);
  check('B1.11c candidates non-kosong & memuat yang terpilih',
    decision.candidates.length >= 1 && decision.candidates.some((c) => c.templateId === 'BLD-OFFICE-MULTI'), decision.candidates.length);
  check('B1.11d rejections membawa alasan per pelanggaran',
    decision.rejections.length > 0 && decision.rejections.every((r) => r.violations.length > 0 && r.violations.every((v) => v.kind && v.reason)),
    decision.rejections.length);
  check('B1.11e providedValues mencatat nilai pengguna (luas 120, lantai 2)',
    decision.providedValues.luas_m2 === 120 && decision.providedValues.lantai === 2, decision.providedValues);
  check('B1.11f explanation non-kosong & tanpa angka persen (skor bukan probabilitas)',
    decision.explanation.length > 0 && !/%/.test(decision.explanation), decision.explanation.slice(0, 100));
  check('B1.11g field kontrak lengkap (fallback/crossPool/hardViolations/missingSpecs/assumptions/scopeCoverage/requiredConfirmation)',
    typeof decision.fallbackUsed === 'boolean' && typeof decision.crossPoolUsed === 'boolean' &&
    Array.isArray(decision.hardViolations) && Array.isArray(decision.missingSpecs) && Array.isArray(decision.assumptions) &&
    'scopeCoverage' in decision && 'requiredConfirmation' in decision, Object.keys(decision).sort());
}

section('12', 'Perilaku sah yang dipertahankan (regresi B1)');

{
  const kantor = pickOf('buatkan RAB gedung kantor 3 lantai luas 300 m2', 'gedung');
  check('B1.12a kantor → BLD-OFFICE-MULTI (11 item)', kantor.pick?.template.id === 'BLD-OFFICE-MULTI', kantor.pick?.template.id);
  const sekolah = pickOf('buatkan RAB sekolah 2 lantai luas 400 m2', 'gedung');
  check('B1.12b sekolah → template pendidikan (bukan kantor)',
    sekolah.pick?.template.id.startsWith('BLD-EDU-') === true, sekolah.pick?.template.id);
  const paving = pickOf('buatkan RAB jalan paving 300 m2', 'jalan');
  check('B1.12c paving 300 m² → PAV-KOMPLEK-6CM, closeCall', paving.pick?.template.id === 'PAV-KOMPLEK-6CM' && paving.closeCall === true,
    { pick: paving.pick?.template.id, closeCall: paving.closeCall });
  const uditch = pickOf('buatkan RAB drainase U-ditch 500 m', 'drainase');
  check('B1.12d U-ditch 500 m → SDA-DRAIN-UDITCH', uditch.pick?.template.id === 'SDA-DRAIN-UDITCH', uditch.pick?.template.id);
  const sumur = pickOf('buatkan RAB sumur bor kedalaman 30 m', 'mep');
  check('B1.12e sumur bor → UTIL-DEEP-WELL', sumur.pick?.template.id === 'UTIL-DEEP-WELL', sumur.pick?.template.id);
  const ap = pickOf('buatkan RAB apartemen 40 unit', 'gedung');
  check('B1.12f apartemen 40 unit → BLD-CONDOTEL', ap.pick?.template.id === 'BLD-CONDOTEL', ap.pick?.template.id);
  const lib = draftOf('buatkan rab perpustakaan 15x20');
  check('B1.12g perpustakaan 15x20 → BLD-EDU-LIBRARY (A-093)',
    lib !== null && lib.parts.some((p) => /perpustakaan|library/i.test(p.template.name)), lib?.parts.map((p) => p.template.id));
  const kon = draftOf('buatkan rab kontrakan 10 unit');
  check('B1.12h kontrakan 10 unit → draft + asumsi menyebut 10 + unit/kamar (A-094)',
    kon !== null && kon.assumptions.some((a) => /10/.test(a) && /(unit|kamar|villa|ruang)/i.test(a)),
    kon?.assumptions.slice(0, 3));
  const masjid = pickOf('buatkan RAB masjid 2 lantai luas 300 m2', 'gedung');
  check('B1.12i masjid → BLD-HALL-SERBAGUNA (bukan high-rise)',
    masjid.pick?.template.id === 'BLD-HALL-SERBAGUNA', masjid.pick?.template.id);
  const sekolahRej = rejection(masjid.suitability, 'BLD-EDU-SCHOOL');
  check('B1.12j untuk masjid, template sekolah ditolak FUNGSI (bukan dipakai diam-diam)',
    sekolahRej?.violations.some((v) => v.kind === 'function') === true, sekolahRej?.violations);
  const struktur = pickOf('buatkan RAB struktur beton luas 200 m2', 'struktur');
  check('B1.12k struktur beton 200 m² → STR-PRECAST-FRAME (kasus di luar batas lama tetap nge-draft)',
    struktur.pick?.template.id === 'STR-PRECAST-FRAME', struktur.pick?.template.id);
  const aspal = pickOf('buatkan RAB jalan aspal panjang 500 m', 'jalan');
  check('B1.12l jalan aspal → INFRA-ROAD-ASPHALT', aspal.pick?.template.id === 'INFRA-ROAD-ASPHALT', aspal.pick?.template.id);
}

section('13', 'Tanpa fallback diam-diam: nilai di luar batas → draft + peringatan jujur');

{
  // D1 dihapus (sapuan regresi B1): nilai di luar batas BUKAN penolakan
  // — template terbaik tetap dipakai dengan peringatan jujur (perilaku
  // lama yang teruji), bukan ditolak lalu di-fallback diam-diam.
  const warung = pickOf('buatkan RAB warung luas 15 m2', 'gedung');
  check('B1.13a warung 15 m² → SELECTED (bukan needs-spec), tanpa fallback',
    warung.suitability.outcome === 'SELECTED' && warung.suitability.fallbackUsed === false,
    { outcome: warung.suitability.outcome, fallback: warung.suitability.fallbackUsed });
  const d = draftOf('buatkan RAB warung luas 15 m2');
  check('B1.13b warung draft membawa peringatan batas yang jujur',
    d !== null && d.warnings.length > 0 && /di luar batas/i.test(d.warnings.join(' ')), d?.warnings.slice(0, 1));
  const minimarket = pickOf('buatkan RAB minimarket luas 96 m2', 'gedung');
  check('B1.13c minimarket 96 m² → SELECTED, tanpa fallback, tetap nge-draft',
    minimarket.suitability.outcome === 'SELECTED' && minimarket.suitability.fallbackUsed === false && minimarket.pick !== null,
    minimarket.pick?.template.id);
  check('B1.13d pelanggaran keras TIDAK PERNAH di-fallback (perumahan+area, listrik)',
    pickOf('buatkan RAB perumahan 20 unit luas 720 m2', 'gedung').suitability.fallbackUsed === false &&
    pickOf('buatkan RAB instalasi listrik luas 120 m2', 'mep').suitability.fallbackUsed === false, null);
}

section('14', 'Kontinuitas draft: revisi mempertahankan template pilihan');

{
  const d = draftOf('buatkan RAB jalan beton baru panjang 1 km lebar 6 m');
  check('B1.14a draft jalan beton baru tersedia', d !== null && d.parts[0]?.template.id === 'INFRA-ROAD-RIGID', d?.parts.map((p) => p.template.id));
  if (d) {
    const vBefore = d.version;
    const totalBefore = draftTotal(d);
    const rev = reviseUniversalDraft(d, 'lebar menjadi 8 m');
    check('B1.14b revisi "lebar menjadi 8 m" berhasil', rev?.ok === true && rev?.changed === true, rev ? { ok: rev.ok, changed: rev.changed } : null);
    check('B1.14c versi naik, template TETAP INFRA-ROAD-RIGID',
      d.version === vBefore + 1 && d.parts[0]?.template.id === 'INFRA-ROAD-RIGID',
      { version: d.version, template: d.parts[0]?.template.id });
    check('B1.14d item tetap 8, tanpa duplikat',
      effectiveItems(d).length === 8 && dupKeys(d).length === 0, effectiveItems(d).length);
    check('B1.14e total dihitung ulang naik (lebar 6→8 m)',
      draftTotal(d) > totalBefore, { before: totalBefore, after: draftTotal(d) });
  }
}

/* ================================================================== */
/* Ringkasan                                                           */
/* ================================================================== */
console.log('\n================ RINGKASAN TEMPLATE SUITABILITY (B1) ================');
for (const [id, st] of [...sectionStats.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))) {
  const mark = st.fail === 0 ? 'OK  ' : 'GAGAL';
  console.log(`  B1.${id.padStart(2, ' ')} [${mark}] ${st.pass} pass / ${st.fail} fail`);
}
console.log(`\nTOTAL: ${pass} pass / ${fail} fail (${pass + fail} asersi)`);
if (failures.length > 0) {
  console.log('\nDaftar gagal:');
  for (const f of failures) console.log(`  - ${f}`);
}
if (fail > 0) process.exitCode = 1;

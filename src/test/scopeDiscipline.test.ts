/**
 * scopeDiscipline.test.ts — Batch 2 §5: Discipline & Scope Intelligence
 * (Program Universal Batch 1–5, 2026-11-23).
 *
 * Menguji intelijensi disiplin & cakupan (scopeDiscipline.ts + kabelnya
 * ke jalur kanonis buildUniversalDraft / reviseUniversalDraft): setiap
 * item yang dihasilkan harus termasuk cakupan proyek yang diminta.
 * Kasus pemicu: listrik-only yang dibungkus paket MEP terpadu; AC yang
 * ikut membangun gedung kantor utuh; irigasi yang tercatat sebagai
 * drainase biasa; renovasi kantor yang ikut membangun renovasi rumah.
 *
 * Suite tsx polos (BUKAN vitest). Jalankan dari root repo:
 *   npx --yes tsx src/test/scopeDiscipline.test.ts
 *
 * Konvensi: `B2.Nx` = kasus Batch 2 nomor N, asersi x. Nilai rupiah
 * TIDAK di-pin (harga katalog bisa berubah); yang di-pin adalah
 * identitas template/scope, status cakupan, dimensi per-scope, kode
 * pelanggaran validasi, dan rekonsiliasi subtotal (Σ scope = total).
 */

import {
  buildUniversalDraft,
  extractUniversalSpec,
  reviseUniversalDraft,
  computeTotals,
  computeScopeTotals,
  computeSectionTotals,
  effectiveItems,
  classifyParam,
  specValueFor,
  specForScope,
  scopeMeasureAvailable,
  SCOPE_GROUPS,
  type UniversalDraft,
  type UniversalSpec,
  type ScopeGroup,
} from '../ai-tools/ezrab-ai/universalRab';
import {
  DISCIPLINES,
  disciplinesForScope,
  disciplinesForSubcategory,
  disciplineCoverage,
  coverageForDiscipline,
  validateDisciplineRegistry,
  findPowerMentions,
  isExcludedKeywordOccurrence,
} from '../ai-tools/ezrab-ai/universalTaxonomy';
import {
  buildScopeModel,
  validateScopeIntegrity,
  diffProjectScopes,
  computeContextScopeSuppression,
  resolveScopeAddress,
  type ProjectScope,
} from '../ai-tools/ezrab-ai/scopeDiscipline';
import { RabTemplateService } from '../services/rabTemplateService';

/* localStorage shim (pola templateSuitability) */
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
  console.log(`\n== B2.${id} — ${title} ==`);
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

function draftOf(text: string, forcedTemplateId?: string): UniversalDraft | null {
  const res = buildUniversalDraft(text, forcedTemplateId);
  return res.kind === 'draft' ? res.draft : null;
}

function needsSpecOf(text: string): { kind: string; reason: string; missing: string[] } | null {
  const res = buildUniversalDraft(text);
  if (res.kind !== 'needs-spec') return null;
  return { kind: res.kind, reason: res.reason, missing: res.missing ?? [] };
}

function modelOf(d: UniversalDraft): NonNullable<UniversalDraft['scopeModel']> {
  if (!d.scopeModel) throw new Error('draft tanpa scopeModel');
  return d.scopeModel;
}

function scopeEntry(d: UniversalDraft, id: string): ProjectScope | undefined {
  return modelOf(d).scopes.find((s) => s.id === id);
}

function violationCodes(d: UniversalDraft): string[] {
  return modelOf(d).validation.violations.map((v) => v.code);
}

function itemDescriptions(d: UniversalDraft): string[] {
  return effectiveItems(d).map((it) => it.description);
}

const DEMOLITION_RE = /demolisi|pembongkaran|\bbongkar\b|roboh/i;
const SOFTSCAPE_RE = /\b(tanaman|rumput|pohon|semak|softscape|penanaman|bunga)\b/i;

/* Teks campuran kanonis §5.5 (sama dengan pin matriks 13.10). */
const MIXED_TEXT = 'buatkan RAB perumahan 20 unit + jalan 1 km + drainase 500 m + retaining wall 100 m';

/* ================================================================== */
/* §1 — Taksonomi disiplin (§5.1) + parser daya                        */
/* ================================================================== */
section('1', 'Taksonomi disiplin & parser daya');

{
  check('B2.1a registry memuat 30 disiplin', DISCIPLINES.length === 30, DISCIPLINES.length);
  const byFamily = (f: string) => DISCIPLINES.filter((d) => d.family === f).length;
  check('B2.1b 10 disiplin gedung', byFamily('building') === 10, byFamily('building'));
  check('B2.1c 14 disiplin infrastruktur', byFamily('infrastructure') === 14, byFamily('infrastructure'));
  check('B2.1d 6 kategori pendukung', byFamily('supporting') === 6, byFamily('supporting'));
  check('B2.1e registry konsisten (tanpa error)', validateDisciplineRegistry().length === 0, validateDisciplineRegistry());
}

{
  const cov = disciplineCoverage();
  const supportOf = (id: string) => cov.find((c) => c.disciplineId === id)?.support;
  check('B2.1f elektrikal COVERED (ada template spesifik)',
    supportOf('elektrikal') === 'COVERED' && (coverageForDiscipline('elektrikal')?.specificTemplateCount ?? 0) >= 1,
    coverageForDiscipline('elektrikal'));
  check('B2.1g irigasi COVERED', supportOf('irigasi') === 'COVERED', supportOf('irigasi'));
  check('B2.1h struktur-penahan COVERED', supportOf('struktur-penahan') === 'COVERED', supportOf('struktur-penahan'));
  check('B2.1i mobilisasi UNCOVERED (tanpa katalog — dinyatakan, bukan dikarang)',
    supportOf('mobilisasi') === 'UNCOVERED', supportOf('mobilisasi'));
  check('B2.1j lingkungan UNCOVERED', supportOf('lingkungan') === 'UNCOVERED', supportOf('lingkungan'));
  check('B2.1k semua 6 kategori pendukung UNCOVERED',
    ['mobilisasi', 'pekerjaan-sementara', 'persyaratan-umum', 'pengujian-komisioning', 'keselamatan', 'manajemen-proyek']
      .every((id) => supportOf(id) === 'UNCOVERED'),
    cov.filter((c) => c.family === 'supporting').map((c) => `${c.disciplineId}=${c.support}`));
  check('B2.1l 23 COVERED / 0 PARTIAL / 7 UNCOVERED (dihitung dari katalog hidup)',
    cov.filter((c) => c.support === 'COVERED').length === 23
      && cov.filter((c) => c.support === 'PARTIAL').length === 0
      && cov.filter((c) => c.support === 'UNCOVERED').length === 7,
    cov.map((c) => `${c.disciplineId}=${c.support}`));
  // Sampel elektrikal tidak boleh tercemar template air (probe B2:
  // 'distribusi' saja ikut menangkap "Jaringan Distribusi Air Bersih").
  check('B2.1m sampel elektrikal bebas template air',
    !(coverageForDiscipline('elektrikal')?.sampleTemplates ?? []).some((n) => /air bersih/i.test(n)),
    coverageForDiscipline('elektrikal')?.sampleTemplates);
}

{
  const mep = disciplinesForScope('mep').map((d) => d.id);
  check('B2.1n scope mep memetakan 5 disiplin MEP',
    ['elektrikal', 'plumbing', 'hvac', 'proteksi-kebakaran', 'elv-telekomunikasi'].every((id) => mep.includes(id)), mep);
  check('B2.1o scope jalan memetakan disiplin jalan',
    disciplinesForScope('jalan').some((d) => d.id === 'jalan'),
    disciplinesForScope('jalan').map((d) => d.id));
  check('B2.1p subkategori irigasi memetakan disiplin irigasi',
    disciplinesForSubcategory('irigasi').some((d) => d.id === 'irigasi'),
    disciplinesForSubcategory('irigasi').map((d) => d.id));
  check('B2.1q subkategori dinding-penahan memetakan struktur-penahan (bukan lanskap)',
    disciplinesForSubcategory('dinding-penahan').some((d) => d.id === 'struktur-penahan'),
    disciplinesForSubcategory('dinding-penahan').map((d) => d.id));
}

{
  const p1 = findPowerMentions('instalasi listrik 11 kVA');
  check('B2.1r "11 kVA" terurai sebagai 11 kVA', p1.length === 1 && p1[0].valueKva === 11, p1);
  const p2 = findPowerMentions('daya 500 VA');
  check('B2.1s "500 VA" terurai sebagai 0,5 kVA', p2.length === 1 && p2[0].valueKva === 0.5, p2);
  check('B2.1t kW TIDAK dikonflasi dengan kVA', findPowerMentions('pompa 10 kW').length === 0, findPowerMentions('pompa 10 kW'));
  check('B2.1u kWp (surya) TIDAK dikonflasi dengan kVA', findPowerMentions('panel surya 5 kWp').length === 0, findPowerMentions('panel surya 5 kWp'));
  check('B2.1v "saluran" di dalam "saluran irigasi" dikecualikan dari drainase',
    isExcludedKeywordOccurrence('drainase', 'saluran', ' irigasi 500 m') === true);
  check('B2.1w "irigasi" di dalam "irigasi taman" dikecualikan dari irigasi SDA',
    isExcludedKeywordOccurrence('irigasi', 'irigasi', ' taman 100 m2') === true);
  check('B2.1x "sprinkler" di dalam "sprinkler taman" dikecualikan dari mep',
    isExcludedKeywordOccurrence('mep', 'sprinkler', ' taman') === true);
  check('B2.1y "saluran" biasa BUKAN pengecualian',
    isExcludedKeywordOccurrence('drainase', 'saluran', ' drainase 500 m') === false);
}

/* ================================================================== */
/* §2 — Model cakupan proyek (§5.2)                                    */
/* ================================================================== */
section('2', 'Model cakupan proyek §5.2 (draft campuran)');

{
  const d = draftOf(MIXED_TEXT);
  check('B2.2a draft campuran tersedia', d !== null, d?.parts.map((p) => p.template.id));
  if (d) {
    const m = modelOf(d);
    check('B2.2b model memuat 4 cakupan', m.scopes.length === 4, m.scopes.map((s) => s.id));
    const ids = new Set(m.scopes.map((s) => s.scopeId));
    check('B2.2c id cakupan = gedung/jalan/drainase/lanskap',
      ids.has('gedung') && ids.has('jalan') && ids.has('drainase') && ids.has('lanskap'), [...ids]);
    const jalan = scopeEntry(d, 'scope-jalan');
    const drainase = scopeEntry(d, 'scope-drainase');
    const lanskap = scopeEntry(d, 'scope-lanskap');
    const gedung = scopeEntry(d, 'scope-gedung');
    check('B2.2d dimensi PER-CAKUPAN: jalan 1000 m, drainase 500 m, retaining 100 m, gedung 20 unit',
      jalan?.dimensions.lengthM === 1000 && drainase?.dimensions.lengthM === 500
        && lanskap?.dimensions.lengthM === 100 && gedung?.dimensions.count === 20,
      m.scopes.map((s) => `${s.id}: ${JSON.stringify(s.dimensions)}`));
    check('B2.2e basis kuantitas jalan menyebut atribusi per-scope',
      (jalan?.quantityBasis ?? '').includes('panjang 1000 m (untuk cakupan ini)'), jalan?.quantityBasis);
    check('B2.2f basis kuantitas gedung menyebut jumlah unit per-scope',
      (gedung?.quantityBasis ?? '').includes('jumlah 20 (untuk cakupan ini)'), gedung?.quantityBasis);
    check('B2.2g semua cakupan REQUESTED + templateSource terisi + pekerjaan termasuk = item part',
      m.scopes.every((s) => s.status === 'REQUESTED' && !!s.templateSource)
        && m.scopes.every((s) => {
          const part = d.parts.find((p) => `scope-${p.scope.id}` === s.id);
          return part != null && s.includedWork.length === part.generation.items.length;
        }),
      m.scopes.map((s) => `${s.id} ${s.status} ${s.templateSource} items=${s.includedWork.length}`));
    check('B2.2h disiplin per part: jalan→jalan, drainase→drainase, retaining→struktur-penahan',
      jalan?.discipline === 'jalan' && drainase?.discipline === 'drainase'
        && lanskap?.discipline === 'struktur-penahan',
      m.scopes.map((s) => `${s.id}=${s.discipline}`));
    check('B2.2i semua cakupan DRAFTED, tanpa dependensi antar-cakupan (proyek paralel)',
      m.scopes.every((s) => s.completionStatus === 'DRAFTED' && s.dependencies.length === 0),
      m.scopes.map((s) => `${s.id} ${s.completionStatus} deps=${s.dependencies.length}`));
    check('B2.2j cakupan gedung REQUIRES_REVIEW (koridor di luar batas — panjang jalan bocor via fallback global)',
      gedung?.coverageStatus === 'REQUIRES_REVIEW', gedung?.coverageStatus);
    check('B2.2k jalan/drainase/lanskap COMPLETE_FOR_SELECTED_TEMPLATE',
      jalan?.coverageStatus === 'COMPLETE_FOR_SELECTED_TEMPLATE'
        && drainase?.coverageStatus === 'COMPLETE_FOR_SELECTED_TEMPLATE'
        && lanskap?.coverageStatus === 'COMPLETE_FOR_SELECTED_TEMPLATE',
      m.scopes.map((s) => `${s.id}=${s.coverageStatus}`));
    check('B2.2l validasi integritas lolos (tanpa pelanggaran)',
      m.validation.ok && m.validation.violations.length === 0, m.validation.violations);
    check('B2.2m tidak ada cakupan yang dikecualikan pada draft campuran',
      m.excludedScopes.length === 0, m.excludedScopes);
  }
}

/* ================================================================== */
/* §3 — Pencegahan kebocoran disiplin (§5.3)                           */
/* ================================================================== */
section('3', 'Pencegahan kebocoran disiplin §5.3');

{
  // Listrik-only: HANYA pekerjaan listrik (kasus pemicu Batch 2).
  const d = draftOf('instalasi listrik 800 kVA');
  check('B2.3a listrik 800 kVA → 1 part MEP-ELECTRICAL-DIST',
    d !== null && d.parts.length === 1 && d.parts[0].template.id === 'MEP-ELECTRICAL-DIST',
    d?.parts.map((p) => p.template.id));
  if (d) {
    check('B2.3b daya 800 kVA terurai + teratribusi ke scope mep + terpetakan ke installed_kva',
      d.spec.powerKva === 800 && d.spec.scopeSpecs?.mep?.powerKva === 800
        && d.parts[0].evaluatedParams?.installed_kva === 800,
      { powerKva: d.spec.powerKva, scopeSpecs: d.spec.scopeSpecs, params: d.parts[0].evaluatedParams });
    check('B2.3c disiplin part = elektrikal, validasi lolos',
      scopeEntry(d, 'scope-mep')?.discipline === 'elektrikal' && modelOf(d).validation.ok,
      { discipline: scopeEntry(d, 'scope-mep')?.discipline, violations: modelOf(d).validation.violations });
  }
}

{
  const d = draftOf('instalasi listrik 11 kVA');
  check('B2.3d listrik 11 kVA tetap di-draft (bukan ditolak diam-diam)',
    d !== null && d.parts.length === 1 && d.parts[0].template.id === 'MEP-ELECTRICAL-DIST',
    d?.parts.map((p) => p.template.id));
  if (d) {
    check('B2.3e 11 kVA di luar batas template → REQUIRES_REVIEW + catatan tinjau menyebut kVA',
      scopeEntry(d, 'scope-mep')?.coverageStatus === 'REQUIRES_REVIEW'
        && (scopeEntry(d, 'scope-mep')?.reviewRequiredWork ?? []).some((w) => /kVA/.test(w)),
      scopeEntry(d, 'scope-mep'));
  }
}

{
  const ns = needsSpecOf('instalasi listrik 40 titik');
  check('B2.3f listrik 40 titik → needs-spec (tidak ada template listrik berbasis titik)',
    ns !== null, ns);
  check('B2.3g missing menyebut kVA/titik (pin B1.6e dipertahankan)',
    ns !== null && /kVA|titik/.test(ns.missing.join(' ')), ns?.missing);
}

{
  const d = draftOf('plumbing gedung 3 lantai');
  check('B2.3h plumbing 3 lantai → HANYA MEP-PLUMBING-TOWER (tanpa part gedung)',
    d !== null && d.parts.length === 1 && d.parts[0].template.id === 'MEP-PLUMBING-TOWER',
    d?.parts.map((p) => p.template.id));
  if (d) {
    check('B2.3i gedung tercatat sebagai konteks yang dikecualikan (jejak transparan)',
      modelOf(d).excludedScopes.some((e) => e.scopeId === 'gedung' && e.kind === 'context'),
      modelOf(d).excludedScopes);
    check('B2.3j validasi lolos (tanpa kebocoran subsistem)',
      modelOf(d).validation.ok, modelOf(d).validation.violations);
  }
}

{
  const d = draftOf('instalasi AC gedung kantor 500 m2');
  check('B2.3k HVAC 500 m² → HANYA MEP-HVAC-VRF (gedung kantor utuh TIDAK ikut dibangun)',
    d !== null && d.parts.length === 1 && d.parts[0].template.id === 'MEP-HVAC-VRF',
    d?.parts.map((p) => p.template.id));
  if (d) {
    check('B2.3l disiplin part = hvac, gedung dikecualikan sebagai konteks',
      scopeEntry(d, 'scope-mep')?.discipline === 'hvac'
        && modelOf(d).excludedScopes.some((e) => e.scopeId === 'gedung'),
      { discipline: scopeEntry(d, 'scope-mep')?.discipline, excluded: modelOf(d).excludedScopes });
  }
}

{
  const d = draftOf('fire protection gedung 5 lantai');
  check('B2.3m fire protection 5 lantai → HANYA MEP-FIRE-PROTECTION (sebelum B2: hanya gedung, tanpa item proteksi)',
    d !== null && d.parts.length === 1 && d.parts[0].template.id === 'MEP-FIRE-PROTECTION',
    d?.parts.map((p) => p.template.id));
  const d2 = draftOf('sprinkler gedung 2000 m2');
  check('B2.3n sprinkler 2000 m² → MEP-FIRE-PROTECTION',
    d2 !== null && d2.parts.length === 1 && d2.parts[0].template.id === 'MEP-FIRE-PROTECTION',
    d2?.parts.map((p) => p.template.id));
  const d3 = draftOf('jaringan data 220 titik');
  check('B2.3o jaringan data 220 titik → MEP-DATA-NETWORK (sebelum B2: tanpa cakupan sama sekali)',
    d3 !== null && d3.parts.length === 1 && d3.parts[0].template.id === 'MEP-DATA-NETWORK',
    d3?.parts.map((p) => p.template.id));
  if (d3) {
    check('B2.3p 220 titik terpetakan ke num_points (bukan default template)',
      d3.parts[0].evaluatedParams?.num_points === 220, d3.parts[0].evaluatedParams);
    check('B2.3q pemetaan jumlah ke num_racks ikut terisi 220 → REQUIRES_REVIEW (keterbatasan satu-nilai-per-jenis, dinyatakan terbuka)',
      scopeEntry(d3, 'scope-mep')?.coverageStatus === 'REQUIRES_REVIEW',
      scopeEntry(d3, 'scope-mep')?.coverageStatus);
  }
}

{
  // MEP terpadu sah HANYA bila diminta eksplisit / terpadu.
  const d = draftOf('MEP gedung kantor 500 m2');
  check('B2.3r "MEP gedung" → MEP-COMPLETE-PKG diizinkan (permintaan terpadu), validasi lolos',
    d !== null && d.parts.length === 1 && d.parts[0].template.id === 'MEP-COMPLETE-PKG'
      && modelOf(d).validation.ok,
    d?.parts.map((p) => p.template.id));
  const d2 = draftOf('gedung kantor 3 lantai dengan instalasi listrik 800 kVA');
  check('B2.3s gedung-disebut-dulu → KEDUA part dibangun (gedung adalah objek, bukan konteks)',
    d2 !== null && d2.parts.length === 2
      && d2.parts.some((p) => p.scope.id === 'gedung')
      && d2.parts.some((p) => p.template.id === 'MEP-ELECTRICAL-DIST'),
    d2?.parts.map((p) => `[${p.scope.id}] ${p.template.id}`));
  if (d2) {
    check('B2.3t validasi lolos pada draft gedung+MEP (objek ganda yang sah)',
      modelOf(d2).validation.ok, modelOf(d2).validation.violations);
  }
  // Template paksa = persetujuan ekspansi eksplisit (pengecualian L1).
  const d3 = draftOf('instalasi listrik 800 kVA', 'MEP-COMPLETE-PKG');
  check('B2.3u template paksa MEP-COMPLETE-PKG atas permintaan listrik-only diizinkan + validasi lolos',
    d3 !== null && d3.parts.length === 1 && d3.parts[0].template.id === 'MEP-COMPLETE-PKG'
      && d3.forcedTemplateId === 'MEP-COMPLETE-PKG' && modelOf(d3).validation.ok,
    d3 ? { forced: d3.forcedTemplateId, violations: modelOf(d3).validation.violations } : null);
}

{
  const d = draftOf('jalan beton 1 km dan drainase 500 m');
  check('B2.3v jalan+drainase → 2 part, tanpa item demolisi, validasi lolos',
    d !== null && d.parts.length === 2
      && !itemDescriptions(d).some((x) => DEMOLITION_RE.test(x))
      && modelOf(d).validation.ok,
    d ? { parts: d.parts.map((p) => p.template.id), violations: modelOf(d).validation.violations } : null);
  const d2 = draftOf('jembatan beton bentang 20 m dan jalan beton 500 m');
  check('B2.3w jembatan+jalan → BRG-GIRDER-20M + INFRA-ROAD-RIGID, validasi lolos',
    d2 !== null && d2.parts.length === 2
      && d2.parts.some((p) => p.template.id === 'BRG-GIRDER-20M')
      && d2.parts.some((p) => p.template.id === 'INFRA-ROAD-RIGID')
      && modelOf(d2).validation.ok,
    d2?.parts.map((p) => p.template.id));
}

{
  const d = draftOf('saluran irigasi 500 m');
  check('B2.3x irigasi → scope IRIGASI sendiri (sebelum B2: tercatat sebagai drainase)',
    d !== null && d.parts.length === 1 && d.parts[0].scope.id === 'irigasi'
      && d.parts[0].template.id === 'SDA-IRRIGATION-STONE',
    d?.parts.map((p) => `[${p.scope.id}] ${p.template.id}`));
  const d2 = draftOf('drainase 500 m dan saluran irigasi 300 m');
  check('B2.3y drainase+irigasi → DUA part berbeda (irigasi 300 m TIDAK hilang ter-dedup)',
    d2 !== null && d2.parts.length === 2
      && d2.parts.some((p) => p.scope.id === 'drainase' && p.template.id === 'SDA-DRAIN-UDITCH')
      && d2.parts.some((p) => p.scope.id === 'irigasi' && p.template.id === 'SDA-IRRIGATION-STONE'),
    d2?.parts.map((p) => `[${p.scope.id}] ${p.template.id}`));
  if (d2) {
    check('B2.3z dimensi terpisah: drainase 500 m, irigasi 300 m',
      scopeEntry(d2, 'scope-drainase')?.dimensions.lengthM === 500
        && scopeEntry(d2, 'scope-irigasi')?.dimensions.lengthM === 300,
      d2.spec.scopeSpecs);
    check('B2.3aa validasi lolos pada drainase+irigasi',
      modelOf(d2).validation.ok, modelOf(d2).validation.violations);
  }
  const d3 = draftOf('irigasi taman 100 m2');
  check('B2.3ab "irigasi taman" → HANYA lanskap (bukan irigasi SDA sipil)',
    d3 !== null && d3.parts.length === 1 && d3.parts[0].scope.id === 'lanskap'
      && d3.parts[0].template.id === 'LAND-IRRIGATION-SYSTEM',
    d3?.parts.map((p) => `[${p.scope.id}] ${p.template.id}`));
}

{
  const d = draftOf('dinding penahan tanah 100 m');
  check('B2.3ac dinding penahan → STR-RETAINING-RC (bukan template landscape)',
    d !== null && d.parts.length === 1 && d.parts[0].template.id === 'STR-RETAINING-RC'
      && d.parts[0].template.category !== 'LANDSCAPE_SITE',
    d?.parts.map((p) => `[${p.scope.id}] ${p.template.id} ${p.template.category}`));
  if (d) {
    check('B2.3ad tanpa item softscape di dalam part dinding penahan',
      !itemDescriptions(d).some((x) => SOFTSCAPE_RE.test(x)), itemDescriptions(d));
    check('B2.3ae validasi lolos pada dinding penahan',
      modelOf(d).validation.ok, modelOf(d).validation.violations);
  }
  const d2 = draftOf('jalan beton baru 1 km');
  check('B2.3af jalan baru → tanpa item demolisi (pembongkaran jalan lama tidak disisipkan)',
    d2 !== null && !itemDescriptions(d2).some((x) => DEMOLITION_RE.test(x)),
    d2 ? itemDescriptions(d2) : null);
  const d3 = draftOf('rekonstruksi jalan beton 2 km');
  check('B2.3ag rekonstruksi → template rekonstruksi; item bongkar DISEBUTKAN dan validasi lolos (pengecualian L2)',
    d3 !== null && d3.parts[0]?.template.id === 'INFRA-ROAD-RECONSTRUCTION'
      && itemDescriptions(d3).some((x) => DEMOLITION_RE.test(x))
      && modelOf(d3).validation.ok,
    d3 ? { template: d3.parts[0]?.template.id, violations: modelOf(d3).validation.violations } : null);
}

{
  const d = draftOf('renovasi kantor 200 m2');
  check('B2.3ah renovasi kantor → HANYA gedung (part renovasi rumah spurious HILANG)',
    d !== null && d.parts.length === 1 && d.parts[0].template.id === 'BLD-RENOV-OFFICE',
    d?.parts.map((p) => p.template.id));
  if (d) {
    check('B2.3ai renovasi tercatat SUPPRESSED/tercakup di model (bukan NEEDS_SPEC)',
      scopeEntry(d, 'scope-renovasi')?.completionStatus === 'SUPPRESSED'
        && scopeEntry(d, 'scope-renovasi')?.coverageStatus === 'COMPLETE_FOR_SELECTED_TEMPLATE',
      scopeEntry(d, 'scope-renovasi'));
  }
  const d2 = draftOf('renovasi jalan beton 2 km');
  check('B2.3aj renovasi jalan → HANYA jalan (tanpa RENOV-HOUSE-FULL)',
    d2 !== null && d2.parts.length === 1 && d2.parts[0].template.id === 'INFRA-ROAD-RIGID',
    d2?.parts.map((p) => p.template.id));
  const d3 = draftOf('rehab drainase 250 m');
  check('B2.3ak rehab drainase → HANYA drainase (tanpa RENOV-HOUSE-FULL)',
    d3 !== null && d3.parts.length === 1 && d3.parts[0].template.id === 'SDA-DRAIN-UDITCH',
    d3?.parts.map((p) => p.template.id));
  const d4 = draftOf('renovasi rumah 100 m2');
  check('B2.3al renovasi RUMAH tetap memakai RENOV-HOUSE-FULL (objeknya memang rumah)',
    d4 !== null && d4.parts.some((p) => p.template.id === 'RENOV-HOUSE-FULL'),
    d4?.parts.map((p) => p.template.id));
}

/* ------------------------------------------------------------------ */
/* §3 (lanjutan) — validator menembak pada draft yang sengaja dirusak  */
/* ------------------------------------------------------------------ */
section('3b', 'Validator L1–L7 pada draft yang dimutasi');

{
  // L1: part MEP memakai paket terpadu padahal yang diminta hanya listrik.
  const d = draftOf('instalasi listrik 800 kVA');
  if (d) {
    const svc = RabTemplateService.getInstance();
    const pkg = svc.getTemplateById('MEP-COMPLETE-PKG');
    check('B2.3ba fixture: MEP-COMPLETE-PKG ada di katalog', pkg != null, pkg?.id);
    if (pkg) {
      d.parts[0].template = pkg;
      const rep = validateScopeIntegrity(d, SCOPE_GROUPS);
      check('B2.3bb L1 MEP_SUBSYSTEM_LEAK menembak pada paket terpadu tanpa persetujuan',
        !rep.ok && rep.violations.some((v) => v.code === 'MEP_SUBSYSTEM_LEAK'), rep.violations);
    }
  }
}

{
  // L2: item demolisi disisipkan ke jalan baru; pengecualian renovasi membebaskannya.
  const d = draftOf('jalan beton 1 km');
  if (d) {
    (d.parts[0].generation.items as any[]).push({
      description: 'Pembongkaran perkerasan eksisting', unit: 'm²', category: 'Pekerjaan Pendahuluan',
    });
    const rep = validateScopeIntegrity(d, SCOPE_GROUPS);
    check('B2.3bc L2 DEMOLITION_IN_NEW_BUILD menembak pada item bongkar di jalan baru',
      rep.violations.some((v) => v.code === 'DEMOLITION_IN_NEW_BUILD'), rep.violations);
    d.spec.isRenovation = true;
    const rep2 = validateScopeIntegrity(d, SCOPE_GROUPS);
    check('B2.3bd L2 dibebaskan bila spek menandai renovasi',
      !rep2.violations.some((v) => v.code === 'DEMOLITION_IN_NEW_BUILD'), rep2.violations);
  }
}

{
  // L3: template landscape untuk dinding penahan.
  const d = draftOf('dinding penahan tanah 100 m');
  if (d) {
    d.parts[0].template = { ...d.parts[0].template, category: 'LANDSCAPE_SITE' };
    const rep = validateScopeIntegrity(d, SCOPE_GROUPS);
    check('B2.3be L3 LANDSCAPE_SUBSTITUTION menembak pada template landscape untuk dinding penahan',
      rep.violations.some((v) => v.code === 'LANDSCAPE_SUBSTITUTION'), rep.violations);
  }
}

{
  // L4: irigasi tercatat di scope drainase.
  const d = draftOf('saluran irigasi 500 m');
  if (d) {
    d.parts[0].scope = scopeById('drainase');
    const rep = validateScopeIntegrity(d, SCOPE_GROUPS);
    check('B2.3bf L4 IRRIGATION_AS_DRAINAGE menembak pada irigasi yang tercatat sebagai drainase',
      rep.violations.some((v) => v.code === 'IRRIGATION_AS_DRAINAGE'), rep.violations);
  }
}

{
  // L5: part gedung konteks disisipkan ke draft fire protection.
  const d = draftOf('fire protection gedung 5 lantai');
  if (d) {
    const fake = { ...d.parts[0], scope: scopeById('gedung') };
    d.parts.push(fake as any);
    const rep = validateScopeIntegrity(d, SCOPE_GROUPS);
    check('B2.3bg L5 CONTEXT_SCOPE_LEAK menembak pada part gedung konteks yang lolos',
      rep.violations.some((v) => v.code === 'CONTEXT_SCOPE_LEAK' && v.scopeId === 'gedung'), rep.violations);
  }
}

{
  // L6: parameter jalan memakai nilai drainase (crossover dimensi).
  const d = draftOf('jalan beton 1 km dan drainase 500 m');
  if (d) {
    const jalanPart = d.parts.find((p) => p.scope.id === 'jalan')!;
    jalanPart.evaluatedParams = { ...jalanPart.evaluatedParams, road_length: 500 };
    const rep = validateScopeIntegrity(d, SCOPE_GROUPS);
    check('B2.3bh L6 DIMENSION_CROSSOVER menembak bila road_length ≠ nilai teratribusi jalan (1000 m)',
      rep.violations.some((v) => v.code === 'DIMENSION_CROSSOVER' && v.scopeId === 'jalan'), rep.violations);
  }
}

{
  // L7: part yang sama diduplikasi.
  const d = draftOf('jalan beton 1 km');
  if (d) {
    d.parts.push({ ...d.parts[0] } as any);
    const rep = validateScopeIntegrity(d, SCOPE_GROUPS);
    check('B2.3bi L7 DUPLICATE_SCOPE menembak pada dua part satu (scope, gedung)',
      rep.violations.some((v) => v.code === 'DUPLICATE_SCOPE'), rep.violations);
  }
}

{
  // Predikat penekanan konteks (unit-level).
  const specMep = extractUniversalSpec('instalasi AC gedung kantor 500 m2');
  const sup = computeContextScopeSuppression(specMep, SCOPE_GROUPS);
  check('B2.3bj penekanan konteks: AC-dulu menekan gedung',
    sup.has('gedung'), [...sup.keys()]);
  const specBld = extractUniversalSpec('gedung kantor 3 lantai dengan instalasi listrik 800 kVA');
  check('B2.3bk penekanan konteks: gedung-dulu TIDAK menekan gedung',
    computeContextScopeSuppression(specBld, SCOPE_GROUPS).size === 0);
  const specNew = extractUniversalSpec('bangun gedung baru dengan instalasi listrik 800 kVA');
  check('B2.3bl penekanan konteks: sinyal "gedung baru" membatalkan penekanan',
    computeContextScopeSuppression(specNew, SCOPE_GROUPS).size === 0);
  const specBareBaru = extractUniversalSpec('instalasi listrik baru gedung kantor 500 m2');
  check('B2.3bm penekanan konteks: "baru" telanjang TIDAK membatalkan (baru = instalasinya)',
    computeContextScopeSuppression(specBareBaru, SCOPE_GROUPS).has('gedung'));
  check('B2.3bn resolveScopeAddress: "jalan" → [jalan]; "saluran irigasi" → [irigasi] (bukan drainase)',
    JSON.stringify(resolveScopeAddress('jalan', SCOPE_GROUPS)) === JSON.stringify(['jalan'])
      && JSON.stringify(resolveScopeAddress('saluran irigasi', SCOPE_GROUPS)) === JSON.stringify(['irigasi']),
    { jalan: resolveScopeAddress('jalan', SCOPE_GROUPS), irigasi: resolveScopeAddress('saluran irigasi', SCOPE_GROUPS) });
}

/* ================================================================== */
/* §4 — Proyek campuran (§5.5)                                         */
/* ================================================================== */
section('4', 'Proyek campuran §5.5');

{
  const d = draftOf(MIXED_TEXT);
  check('B2.4a draft campuran tersedia', d !== null);
  if (d) {
    check('B2.4b 4 part + 39 item (pin matriks 13.10 dipertahankan)',
      d.parts.length === 4 && effectiveItems(d).length === 39,
      { parts: d.parts.length, items: effectiveItems(d).length });
    const totals = computeScopeTotals(d);
    check('B2.4c 4 subtotal cakupan (satu per scope)',
      totals.length === 4, totals.map((s) => s.scopeId));
    const byScope = new Map(totals.map((s) => [s.scopeId, s]));
    check('B2.4d jumlah item per subtotal: drainase 7, jalan 10, gedung 14, lanskap 8',
      byScope.get('drainase')?.itemCount === 7 && byScope.get('jalan')?.itemCount === 10
        && byScope.get('gedung')?.itemCount === 14 && byScope.get('lanskap')?.itemCount === 8,
      totals.map((s) => `${s.scopeId}=${s.itemCount}`));
    const sum = totals.reduce((a, s) => a + s.totals.estimatedTotal, 0);
    const project = computeTotals(d).estimatedTotal;
    check('B2.4e total proyek = Σ subtotal cakupan (tanpa hitung ganda)',
      Math.abs(project - sum) < 0.01, { project, sum });
    check('B2.4f tiap cakupan memakai template berbeda (tanpa template ganda lintas-cakupan)',
      new Set(d.parts.map((p) => p.template.id)).size === 4,
      d.parts.map((p) => p.template.id));
    check('B2.4g tiap cakupan punya asumsi/jejak sendiri di model (basis kuantitas berbeda)',
      new Set(modelOf(d).scopes.map((s) => s.quantityBasis)).size === 4,
      modelOf(d).scopes.map((s) => s.quantityBasis));
  }
}

/* ================================================================== */
/* §5 — Tambah/hapus/revisi/diff cakupan                               */
/* ================================================================== */
section('5', 'Tambah/hapus/revisi/diff cakupan');

{
  const d1 = draftOf('jalan beton 1 km');
  const d2 = draftOf('jalan beton 1 km dan drainase 500 m');
  if (d1 && d2) {
    const diff = diffProjectScopes(modelOf(d1).scopes, modelOf(d2).scopes);
    check('B2.5a tambah cakupan (rebuild): diff mencatat scope-drainase sebagai added',
      diff.added.some((s) => s.id === 'scope-drainase'), diff.added.map((s) => s.id));
    check('B2.5b tambah cakupan: scope-jalan unchanged (dimensi/template sama)',
      diff.unchanged.includes('scope-jalan'), diff.unchanged);
    const diffBack = diffProjectScopes(modelOf(d2).scopes, modelOf(d1).scopes);
    check('B2.5c hapus cakupan (rebuild): diff mencatat scope-drainase sebagai removed',
      diffBack.removed.some((s) => s.id === 'scope-drainase'), diffBack.removed.map((s) => s.id));
  } else {
    check('B2.5a fixture draft jalan/drainase tersedia', false);
    check('B2.5b fixture draft jalan/drainase tersedia', false);
    check('B2.5c fixture draft jalan/drainase tersedia', false);
  }
  const d3 = draftOf('jalan beton 2 km');
  if (d1 && d3) {
    const diff = diffProjectScopes(modelOf(d1).scopes, modelOf(d3).scopes);
    check('B2.5d ubah dimensi: diff mencatat scope-jalan sebagai changed (dimensi berubah)',
      diff.changed.length === 1 && diff.changed[0].before.id === 'scope-jalan'
        && diff.changed[0].changes.includes('dimensi berubah'),
      diff.changed);
  } else {
    check('B2.5d fixture draft jalan 2 km tersedia', false);
  }
}

{
  // Revisi beralamat: hanya cakupan yang dituju yang berubah.
  const d = draftOf('jalan beton 1 km dan drainase 500 m');
  check('B2.5e fixture jalan+drainase tersedia', d !== null);
  if (d) {
    const rev = reviseUniversalDraft(d, 'panjang jalan menjadi 2000 m');
    check('B2.5f revisi beralamat "panjang jalan menjadi 2000 m" berhasil',
      rev?.ok === true && rev?.changed === true, rev ? { ok: rev.ok, changed: rev.changed } : null);
    const jalanPart = d.parts.find((p) => p.scope.id === 'jalan')!;
    const drainasePart = d.parts.find((p) => p.scope.id === 'drainase')!;
    check('B2.5g isolasi lintas-cakupan: road_length 2000, channel_length TETAP 500',
      jalanPart.evaluatedParams?.road_length === 2000 && drainasePart.evaluatedParams?.channel_length === 500,
      { road: jalanPart.evaluatedParams, channel: drainasePart.evaluatedParams });
    check('B2.5h scopeSpecs: jalan 2000, drainase 500, global TIDAK berubah (1000)',
      d.spec.scopeSpecs?.jalan?.lengthM === 2000 && d.spec.scopeSpecs?.drainase?.lengthM === 500
        && d.spec.lengthM === 1000,
      { scopeSpecs: d.spec.scopeSpecs, global: d.spec.lengthM });
    check('B2.5i model cakupan disegarkan sesudah revisi (jalan 2000 m di model)',
      scopeEntry(d, 'scope-jalan')?.dimensions.lengthM === 2000
        && scopeEntry(d, 'scope-drainase')?.dimensions.lengthM === 500,
      modelOf(d).scopes.map((s) => `${s.id}=${s.dimensions.lengthM}`));
    check('B2.5j validasi tetap lolos sesudah revisi beralamat',
      modelOf(d).validation.ok, modelOf(d).validation.violations);
  }
}

{
  // Revisi tanpa alamat pada draft multi-cakupan yang ambigu → ditolak.
  const d = draftOf('jalan beton 1 km dan drainase 500 m');
  if (d) {
    const rev = reviseUniversalDraft(d, 'panjang menjadi 2000 m');
    check('B2.5k revisi tanpa alamat yang ambigu DITOLAK (bukan diterapkan global diam-diam)',
      rev?.ok === false && rev?.changed === false, rev ? { ok: rev.ok, changed: rev.changed } : null);
    check('B2.5l pesan penolakan menyebut kedua cakupan + contoh alamat',
      (rev?.message ?? '').includes('Drainase') && (rev?.message ?? '').includes('Jalan')
        && (rev?.message ?? '').includes('panjang jalan menjadi 2000 m'),
      rev?.message);
    check('B2.5m draft tidak berubah sesudah penolakan',
      d.spec.scopeSpecs?.jalan?.lengthM === 1000 && d.spec.scopeSpecs?.drainase?.lengthM === 500
        && d.version === 1,
      { scopeSpecs: d.spec.scopeSpecs, version: d.version });
  } else {
    check('B2.5k fixture jalan+drainase tersedia', false);
    check('B2.5l fixture jalan+drainase tersedia', false);
    check('B2.5m fixture jalan+drainase tersedia', false);
  }
}

{
  // Tanpa alamat tetapi hanya SATU cakupan yang mengatribusi ukuran itu → cakupan itu.
  const d = draftOf('jalan beton 1 km dan gedung kantor 500 m2');
  if (d) {
    const rev = reviseUniversalDraft(d, 'panjang menjadi 2000 m');
    check('B2.5n revisi tanpa alamat, satu atribusi → diterapkan ke jalan saja',
      rev?.ok === true && d.spec.scopeSpecs?.jalan?.lengthM === 2000
        && d.spec.lengthM === 1000,
      { ok: rev?.ok, scopeSpecs: d.spec.scopeSpecs, global: d.spec.lengthM });
  } else {
    check('B2.5n fixture jalan+gedung tersedia', false);
  }
}

{
  const d = draftOf('jalan beton 1 km dan jalan beton 1 km');
  check('B2.5o teks cakupan ganda → SATU part (duplikat dicegah)',
    d !== null && d.parts.length === 1, d?.parts.map((p) => p.template.id));
  const d2 = draftOf('jalan beton 1 km lebar 6 m');
  if (d2) {
    const rev = reviseUniversalDraft(d2, 'lebar menjadi 8 m');
    check('B2.5p pin 13.20h: "lebar menjadi 8 m" pada draft satu cakupan → d.spec.widthM === 8',
      rev?.ok === true && d2.spec.widthM === 8, { ok: rev?.ok, widthM: d2.spec.widthM });
  } else {
    check('B2.5p fixture jalan lebar 6 m tersedia', false);
  }
  const d3 = draftOf('jalan beton 1 km');
  if (d3) {
    check('B2.5q pin 13.20m: "panjang menjadi 2 km" tetap null (km tidak diterima di revisi)',
      reviseUniversalDraft(d3, 'panjang menjadi 2 km') === null);
  } else {
    check('B2.5q fixture jalan 1 km tersedia', false);
  }
}

/* ================================================================== */
/* §6 — Rekonsiliasi subtotal                                          */
/* ================================================================== */
section('6', 'Rekonsiliasi subtotal');

{
  const d = draftOf(MIXED_TEXT);
  if (d) {
    const scopes = computeScopeTotals(d);
    const sum = scopes.reduce((a, s) => a + s.totals.estimatedTotal, 0);
    check('B2.6a campuran: Σ subtotal cakupan = total proyek',
      Math.abs(computeTotals(d).estimatedTotal - sum) < 0.01,
      { project: computeTotals(d).estimatedTotal, sum });
  } else {
    check('B2.6a fixture campuran tersedia', false);
  }
  const d2 = draftOf('Gedung A 3 lantai 15 x 10 m dan Gedung B 2 lantai 12 x 8 m');
  if (d2) {
    const secs = computeSectionTotals(d2);
    const sum = secs.reduce((a, s) => a + s.totals.estimatedTotal, 0);
    check('B2.6b multi-gedung: Σ total seksi = total proyek',
      Math.abs(computeTotals(d2).estimatedTotal - sum) < 0.01,
      { project: computeTotals(d2).estimatedTotal, sum });
    check('B2.6c multi-gedung: 2 seksi gedung, masing-masing 11 item',
      secs.length === 2 && secs.every((s) => s.kind === 'building' && s.itemCount === 11),
      secs.map((s) => `${s.key} ${s.kind} items=${s.itemCount}`));
  } else {
    check('B2.6b fixture multi-gedung tersedia', false);
    check('B2.6c fixture multi-gedung tersedia', false);
  }
  const d3 = draftOf('jalan beton 1 km dan drainase 500 m');
  if (d3) {
    const scopes = computeScopeTotals(d3);
    const sum = scopes.reduce((a, s) => a + s.totals.estimatedTotal, 0);
    check('B2.6d jalan+drainase: Σ subtotal = total proyek',
      Math.abs(computeTotals(d3).estimatedTotal - sum) < 0.01,
      { project: computeTotals(d3).estimatedTotal, sum });
  } else {
    check('B2.6d fixture jalan+drainase tersedia', false);
  }
}

/* ================================================================== */
/* §7 — Multi-gedung: pengembangan residensial (§5.2/§5.5)             */
/* ================================================================== */
section('7', 'Multi-gedung (pengembangan residensial)');

{
  const d = draftOf('Gedung A 3 lantai 15 x 10 m dan Gedung B 2 lantai 12 x 8 m');
  check('B2.7a draft dua gedung tersedia', d !== null);
  if (d) {
    check('B2.7b 2 part gedung (satu per gedung), buildingId berbeda',
      d.parts.length === 2 && d.parts.every((p) => p.sectionKind === 'building')
        && new Set(d.parts.map((p) => p.buildingId)).size === 2,
      d.parts.map((p) => `${p.buildingId} ${p.template.id}`));
    const m = modelOf(d);
    check('B2.7c model memuat 2 cakupan gedung per-gedung (id stabil scope-gedung-<id>)',
      m.scopes.length === 2
        && m.scopes.some((s) => s.id === 'scope-gedung-gedung-a')
        && m.scopes.some((s) => s.id === 'scope-gedung-gedung-b'),
      m.scopes.map((s) => s.id));
    const a = scopeEntry(d, 'scope-gedung-gedung-a');
    const b = scopeEntry(d, 'scope-gedung-gedung-b');
    check('B2.7d cakupan per-gedung: parentScopeId "project" + buildingId terisi',
      a?.parentScopeId === 'project' && a?.buildingId === 'gedung-a'
        && b?.parentScopeId === 'project' && b?.buildingId === 'gedung-b',
      m.scopes.map((s) => `${s.id} parent=${s.parentScopeId} bldg=${s.buildingId}`));
    check('B2.7e dimensi PER-GEDUNG: A 150 m², B 96 m² (bukan satu angka runtuh)',
      a?.dimensions.areaM2 === 150 && b?.dimensions.areaM2 === 96,
      m.scopes.map((s) => `${s.id} area=${s.dimensions.areaM2}`));
    check('B2.7f Gedung B REQUIRES_REVIEW (96 m² di bawah batas template 100 m²); Gedung A COMPLETE',
      b?.coverageStatus === 'REQUIRES_REVIEW' && a?.coverageStatus === 'COMPLETE_FOR_SELECTED_TEMPLATE',
      m.scopes.map((s) => `${s.id}=${s.coverageStatus}`));
    check('B2.7g validasi lolos pada draft multi-gedung',
      m.validation.ok, m.validation.violations);
    check('B2.7h basis kuantitas per-gedung menyebut "per gedung"',
      (a?.quantityBasis ?? '').includes('(per gedung)') && (b?.quantityBasis ?? '').includes('(per gedung)'),
      { a: a?.quantityBasis, b: b?.quantityBasis });
  }
}

/* ================================================================== */
/* §8 — Status cakupan (§5.4)                                          */
/* ================================================================== */
section('8', 'Status cakupan §5.4');

{
  // Draft parsial: jembatan gagal (bentang di luar katalog), jalan berhasil.
  const d = draftOf('jembatan beton bentang 50 m dan jalan beton 1 km');
  check('B2.8a draft parsial tersedia (jalan berhasil, jembatan gagal)',
    d !== null && d.parts.length === 1 && d.parts[0].scope.id === 'jalan',
    d?.parts.map((p) => p.scope.id));
  if (d) {
    const j = scopeEntry(d, 'scope-jembatan');
    check('B2.8b jembatan NEEDS_SPEC / NEEDS_SPECIFICATION + missing menyebut desain struktur khusus',
      j?.completionStatus === 'NEEDS_SPEC' && j?.coverageStatus === 'NEEDS_SPECIFICATION'
        && (j?.missingWork ?? []).some((w) => /desain struktur khusus/i.test(w)),
      j);
    check('B2.8c jembatan tanpa template + tanpa pekerjaan termasuk + harga belum dapat dihitung',
      j?.templateSource === null && j?.includedWork.length === 0
        && (j?.priceBasis ?? '').includes('belum ada template'),
      j);
  }
}

{
  // Atap tercakup template keluarga (penekanan Gate 5) → SUPPRESSED + COMPLETE.
  const d = draftOf('gudang 200 m2 atap galvalum');
  check('B2.8d fixture gudang+atap tersedia', d !== null);
  if (d) {
    const atap = scopeEntry(d, 'scope-atap');
    check('B2.8e atap SUPPRESSED / COMPLETE_FOR_SELECTED_TEMPLATE + dependensi ke scope-gedung',
      atap?.completionStatus === 'SUPPRESSED'
        && atap?.coverageStatus === 'COMPLETE_FOR_SELECTED_TEMPLATE'
        && (atap?.dependencies ?? []).includes('scope-gedung'),
      atap);
    check('B2.8f catatan cakupan atap menyebut template penutup',
      (atap?.coverageNote ?? '').includes('Gudang Rangka Baja WF'), atap?.coverageNote);
  }
}

{
  const d = draftOf('jembatan beton bentang 20 m dan jalan beton 500 m');
  if (d) {
    const j = scopeEntry(d, 'scope-jembatan');
    check('B2.8g jembatan 20 m PARTIAL (1 item belum ada harga) + pekerjaan belum-terverifikasi tercatat',
      j?.coverageStatus === 'PARTIAL' && (j?.unverifiedWork.length ?? 0) > 0, j);
    check('B2.8h catatan PARTIAL menyebut jumlah item belum ada harga',
      (j?.coverageNote ?? '').includes('1 item belum ada harga'), j?.coverageNote);
  } else {
    check('B2.8g fixture jembatan+jalan tersedia', false);
    check('B2.8h fixture jembatan+jalan tersedia', false);
  }
}

{
  // COMPLETE mengacu pada template yang dipilih — catatan menyatakan batasnya.
  const d = draftOf('jalan beton 1 km');
  if (d) {
    const note = scopeEntry(d, 'scope-jalan')?.coverageNote ?? '';
    check('B2.8i catatan COMPLETE menyatakan BUKAN seluruh proyek riil dirancang exhaustive',
      /bukan berarti seluruh proyek riil dirancang exhaustive/i.test(note), note);
  } else {
    check('B2.8i fixture jalan tersedia', false);
  }
}

/* ================================================================== */
/* §9 — Penjaga regresi                                                */
/* ================================================================== */
section('9', 'Penjaga regresi');

{
  const spec = extractUniversalSpec('instalasi listrik 11 kVA');
  check('B2.9a extractUniversalSpec mengisi powerKva = 11', spec.powerKva === 11, spec.powerKva);
  check('B2.9b classifyParam installed_kva → "power"',
    classifyParam('installed_kva', 'Daya Terpasang (kVA)') === 'power',
    classifyParam('installed_kva', 'Daya Terpasang (kVA)'));
  check('B2.9c specValueFor(spec, "power") = 11', specValueFor(spec, 'power') === 11, specValueFor(spec, 'power'));
  check('B2.9d classifyParam lain tidak berubah (length/area/count)',
    classifyParam('road_length', 'Panjang Jalan') === 'length'
      && classifyParam('building_area', 'Luas Bangunan') === 'area'
      && classifyParam('num_points', 'Jumlah Titik') === 'count');
}

{
  const mep = scopeById('mep');
  const byFloors = extractUniversalSpec('plumbing gedung 3 lantai');
  const byCount = extractUniversalSpec('jaringan data 220 titik');
  const byPower = extractUniversalSpec('instalasi listrik 11 kVA');
  const byNone = extractUniversalSpec('instalasi listrik');
  // Gerbang ukuran memakai spek PER-SCOPE (specForScope) — "220 titik"
  // hanya teratribusi di scopeSpecs.mep (count global tidak mengurai
  // "titik"), persis seperti jalur buildUniversalDraft.
  const gateOk = (s: UniversalSpec) => scopeMeasureAvailable(specForScope(s, 'mep'), mep);
  check('B2.9e scopeMeasureAvailable mep: lantai/count/kVA diterima sebagai basis',
    gateOk(byFloors) && gateOk(byCount) && gateOk(byPower),
    { floors: gateOk(byFloors), count: gateOk(byCount), power: gateOk(byPower) });
  check('B2.9f scopeMeasureAvailable mep: tanpa basis apa pun tetap false',
    gateOk(byNone) === false, gateOk(byNone));
  const jalan = scopeById('jalan');
  check('B2.9g basis kVA TIDAK diterima untuk cakupan non-mep (jalan)',
    scopeMeasureAvailable(byPower, jalan) === false, scopeMeasureAvailable(byPower, jalan));
}

{
  // Divergensi yang DIDOKUMENTASIKAN (bukan bug B2): tidak ada template
  // lift di katalog — permintaan lift tetap di-draft sebagai gedung.
  const d = draftOf('lift gedung 5 lantai');
  check('B2.9h "lift gedung" → draft gedung saja, tanpa part mep (tidak ada template lift — divergensi terdokumentasi)',
    d !== null && d.parts.length === 1 && d.parts[0].scope.id === 'gedung',
    d?.parts.map((p) => `[${p.scope.id}] ${p.template.id}`));
}

{
  const d = draftOf('jalan beton baru 1 km');
  check('B2.9i jalan baru tetap INFRA-ROAD-RIGID 8 item',
    d !== null && d.parts[0]?.template.id === 'INFRA-ROAD-RIGID' && effectiveItems(d).length === 8,
    d ? { template: d.parts[0]?.template.id, items: effectiveItems(d).length } : null);
  const d2 = draftOf('dinding penahan tanah 100 m');
  check('B2.9j dinding penahan tetap STR-RETAINING-RC',
    d2 !== null && d2.parts[0]?.template.id === 'STR-RETAINING-RC',
    d2?.parts.map((p) => p.template.id));
  // buildScopeModel dapat dipanggil ulang atas draft yang sama (idempotent
  // untuk struktur — dipakai refreshScopeModel di snapshotVersion).
  if (d) {
    const m1 = buildScopeModel(d, undefined, SCOPE_GROUPS);
    const m2 = buildScopeModel(d, undefined, SCOPE_GROUPS);
    check('B2.9k buildScopeModel deterministik (dua panggilan → id cakupan + status sama)',
      JSON.stringify(m1.scopes.map((s) => `${s.id}:${s.coverageStatus}`))
        === JSON.stringify(m2.scopes.map((s) => `${s.id}:${s.coverageStatus}`)),
      { m1: m1.scopes.map((s) => s.id), m2: m2.scopes.map((s) => s.id) });
  } else {
    check('B2.9k fixture jalan tersedia', false);
  }
}

/* ================================================================== */
/* Ringkasan                                                           */
/* ================================================================== */
console.log('\n================ RINGKASAN SCOPE DISCIPLINE (B2) ================');
for (const [id, st] of [...sectionStats.entries()].sort()) {
  const mark = st.fail === 0 ? 'OK  ' : 'GAGAL';
  console.log(`  B2.${id.padStart(3, ' ')} [${mark}] ${st.pass} pass / ${st.fail} fail`);
}
console.log(`\nTOTAL: ${pass} pass / ${fail} fail (${pass + fail} asersi)`);
if (failures.length > 0) {
  console.log('\nDaftar gagal:');
  for (const f of failures) console.log(`  - ${f}`);
}
if (fail > 0) process.exitCode = 1;

/**
 * scopeDiscipline.ts — INTELIGENSI DISIPLIN & CAKUPAN (Batch 2 §5,
 * program Universal Batch 1–5, 2026-11-23).
 *
 * Menjawab SATU pertanyaan: apakah setiap item yang dihasilkan memang
 * termasuk cakupan proyek yang diminta? Item yang benar secara teknis
 * tetap SALAH bila berada di paket yang salah (kasus listrik-only yang
 * dibungkus paket MEP terpadu; instalasi AC yang ikut membangun gedung
 * kantor utuh; saluran irigasi yang tercatat sebagai drainase biasa).
 *
 * Modul ini adalah DAUN (pola templateSuitability): hanya mengimpor
 * TIPE dari universalRab + nilai dari universalTaxonomy (taksonomi +
 * registry disiplin), templateSuitability (peta subsistem MEP), dan
 * wbsGroupMapping (grup kerja kanonis). Ia TIDAK mengimpor universalRab
 * secara runtime — karena itu buildUniversalDraft dapat memanggilnya
 * tanpa siklus. SCOPE_GROUPS diteruskan sebagai argumen (bukan impor)
 * ke fungsi yang butuh kata kunci scope.
 *
 * Isi modul:
 * - ProjectScope (§5.2): model cakupan proyek — id, disiplin, induk,
 *   deskripsi, status permintaan/konfirmasi, sumber template, pekerjaan
 *   termasuk/dikeluarkan/hilang/opsional/belum-terverifikasi/perlu-tinjau,
 *   dependensi, dimensi PER-CAKUPAN, basis kuantitas, basis harga,
 *   status penyelesaian, status cakupan (§5.4).
 * - buildScopeModel: membangun model cakupan + laporan validasi dari
 *   sebuah UniversalDraft (dipanggil buildUniversalDraft; lapisan
 *   validasi seperti wbsArtifact — tidak mengubah total/isi RAB).
 * - validateScopeIntegrity (§5.3): validasi kebocoran disiplin yang
 *   deterministik atas draft — subsistem MEP, demolisi pada bangunan
 *   baru, substitusi landscape, irigasi sebagai drainase, cakupan
 *   konteks, dimensi lintas-cakupan, duplikat cakupan.
 * - computeContextScopeSuppression: cakupan yang hanya konteks
 *   (gedung sebagai lokasi instalasi MEP) — ditekan sebelum dibangun,
 *   dengan jejak transparan (pola suppressedScopes/noSpecRoof).
 * - shouldSuppressRenovasiPart: renovasi adalah MODIFIER — bila
 *   pekerjaan yang direnovasi sudah punya part, part renovasi rumah
 *   tersendiri adalah kebocoran dan ditekan.
 * - diffProjectScopes: tambah/hapus/ubah cakupan antar dua versi model.
 * - resolveScopeAddress: alamat cakupan pada revisi dimensi
 *   ("panjang jalan menjadi 2000 m").
 *
 * Validator ini ADVISORY: ia melaporkan pelanggaran pada scopeModel,
 * tidak memblokir draft (pemblokiran tetap wewenang gerbang transfer
 * + keputusan owner). Pelanggaran pada draft BARU menandakan bug yang
 * harus diperbaiki; pelanggaran pada draft LAMA (pra-B2) menandakan
 * kebocoran yang sudah diketahui.
 */

import type {
  UniversalSpec,
  UniversalDraft,
  DraftPart,
  ScopeGroup,
  UniversalScopeId,
} from './universalRab';
import type { ScopeSpec } from './universalRab';
import type { RabTemplate } from '../../types/rabTemplate';
import {
  subcategoryById,
  disciplinesForScope,
  isExcludedKeywordOccurrence,
} from './universalTaxonomy';
import {
  requestedMepSubsystems,
  templateMepSubsystems,
  type MepSubsystem,
} from './templateSuitability';
import { groupForCategoryLabel } from './wbsGroupMapping';

/* ------------------------------------------------------------------ */
/* Model cakupan (§5.2 + §5.4)                                         */
/* ------------------------------------------------------------------ */

/**
 * Status cakupan template untuk satu cakupan (§5.4). COMPLETE mengacu
 * HANYA pada cakupan template yang dipilih yang dinyatakan — TIDAK
 * PERNAH berarti seluruh proyek riil dirancang exhaustive.
 */
export type ScopeCoverageStatus =
  | 'COMPLETE_FOR_SELECTED_TEMPLATE'
  | 'PARTIAL'
  | 'NEEDS_SPECIFICATION'
  | 'UNSUPPORTED'
  | 'REQUIRES_REVIEW';

export type ScopeCompletionStatus = 'DRAFTED' | 'NEEDS_SPEC' | 'SKIPPED' | 'SUPPRESSED';

export type ProjectScopeStatus = 'REQUESTED' | 'CONFIRMED';

/** Dimensi EFEKTIF satu cakupan (atribusi per-scope, fallback global). */
export interface ScopeDimensions {
  lengthM: number | null;
  areaM2: number | null;
  spanM: number | null;
  widthM: number | null;
  heightM: number | null;
  depthM: number | null;
  thicknessCm: number | null;
  volumeM3: number | null;
  count: number | null;
  powerKva: number | null;
}

export interface ProjectScope {
  /** Id stabil: `scope-<scopeId>` atau `scope-<scopeId>-<buildingId>`. */
  id: string;
  scopeId: UniversalScopeId;
  /** Id disiplin kanonis (registry DISCIPLINES) — null bila tak terpetakan. */
  discipline: string | null;
  /** Id cakupan induk ('project' untuk part gedung; null = tingkat proyek). */
  parentScopeId: string | null;
  buildingId: string | null;
  description: string;
  status: ProjectScopeStatus;
  /** Id template sumber (null bila belum ada template). */
  templateSource: string | null;
  includedWork: string[];
  excludedWork: string[];
  missingWork: string[];
  optionalWork: string[];
  unverifiedWork: string[];
  reviewRequiredWork: string[];
  /** Id cakupan lain yang menjadi prasyarat/penutup cakupan ini. */
  dependencies: string[];
  dimensions: ScopeDimensions;
  quantityBasis: string;
  priceBasis: string;
  completionStatus: ScopeCompletionStatus;
  coverageStatus: ScopeCoverageStatus;
  coverageNote: string;
}

/** Cakupan yang terdeteksi tetapi BUKAN pekerjaan proyek (jejak audit). */
export interface ExcludedScopeRecord {
  scopeId: string;
  reason: string;
  kind: 'context' | 'excluded';
}

export interface ScopeValidationReport {
  ok: boolean;
  violations: ScopeViolation[];
  warnings: string[];
  checkedScopes: string[];
}

export type ScopeViolationCode =
  | 'MEP_SUBSYSTEM_LEAK'
  | 'DEMOLITION_IN_NEW_BUILD'
  | 'LANDSCAPE_SUBSTITUTION'
  | 'IRRIGATION_AS_DRAINAGE'
  | 'CONTEXT_SCOPE_LEAK'
  | 'DIMENSION_CROSSOVER'
  | 'DUPLICATE_SCOPE';

export interface ScopeViolation {
  code: ScopeViolationCode;
  scopeId: string;
  detail: string;
  items?: string[];
}

export interface DraftScopeModel {
  scopes: ProjectScope[];
  excludedScopes: ExcludedScopeRecord[];
  validation: ScopeValidationReport;
}

/** Konteks build-time yang tidak dapat diturunkan dari draft saja. */
export interface ScopeModelBuildContext {
  skipped?: Array<{
    scopeId: string;
    reason: string;
    missing: string[];
    outcome?: string;
  }>;
  suppressed?: Array<{
    scopeId: string;
    reason: string;
    kind: 'context' | 'covered' | 'excluded';
    /** Scope penutup (untuk kind 'covered'). */
    coversScopeId?: string;
  }>;
}

/* ------------------------------------------------------------------ */
/* Cermin lokal (pola templateSuitability/specChain — modul daun       */
/* tidak boleh mengimpor nilai dari universalRab; jaga tetap sinkron   */
/* dengan classifyParam / specValueFor / specValueForParam kanonis).   */
/* ------------------------------------------------------------------ */

type MeasureKind =
  | 'length' | 'span' | 'width' | 'area' | 'thickness' | 'floors'
  | 'height' | 'depth' | 'volume' | 'count' | 'power' | 'other';

function classifyParamLocal(key: string, label: string): MeasureKind {
  const s = `${key} ${label}`.toLowerCase();
  if (/span|bentang/.test(s)) return 'span';
  if (/depth|kedalaman/.test(s)) return 'depth';
  if (/length|panjang|lintasan/.test(s)) return 'length';
  if (/width|lebar/.test(s)) return 'width';
  if (/\barea\b|luas/.test(s)) return 'area';
  if (/thickness|tebal/.test(s)) return 'thickness';
  if (/floor|lantai/.test(s)) return 'floors';
  if (/height|tinggi/.test(s)) return 'height';
  if (/volume/.test(s)) return 'volume';
  if (/kva/.test(s)) return 'power';
  if (/count|jumlah|num_|sel|unit_count/.test(s)) return 'count';
  return 'other';
}

const KIND_SCOPE_FIELD: Partial<Record<MeasureKind, keyof ScopeSpec>> = {
  length: 'lengthM',
  span: 'spanM',
  width: 'widthM',
  area: 'areaM2',
  thickness: 'thicknessCm',
  height: 'heightM',
  depth: 'depthM',
  volume: 'volumeM3',
  count: 'count',
  power: 'powerKva',
  // 'floors' SENGAJA absen: ScopeSpec tidak punya lantai — lantai
  // adalah ukuran tingkat proyek (per-gedung ditangani specForBuilding).
};

const KIND_SPEC_FIELD: Record<Exclude<MeasureKind, 'other'>, keyof UniversalSpec> = {
  length: 'lengthM',
  span: 'spanM',
  width: 'widthM',
  area: 'areaM2',
  thickness: 'thicknessCm',
  floors: 'floors',
  height: 'heightM',
  depth: 'depthM',
  volume: 'volumeM3',
  count: 'count',
  power: 'powerKva',
};

/** Nilai yang TERATRIBUSI ke scope ini saja (tanpa fallback global). */
function attributedValue(spec: UniversalSpec, scopeId: string, kind: MeasureKind): number | null {
  const field = KIND_SCOPE_FIELD[kind];
  if (!field) return null;
  const scoped = spec.scopeSpecs?.[scopeId];
  if (!scoped) return null;
  const v = scoped[field];
  return typeof v === 'number' ? v : null;
}

/** Nilai EFEKTIF untuk scope ini (atribusi, lalu fallback global). */
function effectiveValue(spec: UniversalSpec, scopeId: string, kind: MeasureKind): number | null {
  const attr = attributedValue(spec, scopeId, kind);
  if (attr != null) return attr;
  if (kind === 'other') return null;
  const v = spec[KIND_SPEC_FIELD[kind]];
  return typeof v === 'number' ? v : null;
}

/** Nilai spek untuk satu parameter template (konversi tebal cermin specValueForParam).
 * `directSpec` = baca field spek langsung tanpa atribusi scopeSpecs
 * (untuk part gedung: spek per-gedungnya otoritatif, atribusi proyek
 * tidak boleh menimpa nilai gedung itu). */
function valueForParam(
  spec: UniversalSpec,
  scopeId: string,
  p: { key: string; label: string; unit?: string },
  directSpec = false,
): { kind: MeasureKind; value: number | null } {
  const kind = classifyParamLocal(p.key, p.label);
  if (kind === 'other') return { kind, value: null };
  let v: number | null;
  if (directSpec) {
    const raw = spec[KIND_SPEC_FIELD[kind]];
    v = typeof raw === 'number' ? raw : null;
  } else {
    v = effectiveValue(spec, scopeId, kind);
  }
  if (v == null) return { kind, value: null };
  if (kind !== 'thickness') return { kind, value: v };
  const unit = (p.unit || '').toLowerCase();
  if (unit === 'm') return { kind, value: v / 100 };
  if (unit === 'mm') return { kind, value: v / 10 };
  return { kind, value: v };
}

/** Kunci item (cermin itemKey kanonis — deskripsi+satuan). */
function itemKeyLocal(it: { description: string; unit: string }): string {
  return `${it.description.trim().toLowerCase()}|${it.unit}`;
}

const approxEqual = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-9;

/* ------------------------------------------------------------------ */
/* Dimensi + basis kuantitas                                           */
/* ------------------------------------------------------------------ */

const KIND_LABEL: Record<Exclude<MeasureKind, 'other' | 'floors'>, { label: string; unit: string }> = {
  length: { label: 'panjang', unit: 'm' },
  span: { label: 'bentang', unit: 'm' },
  width: { label: 'lebar', unit: 'm' },
  area: { label: 'luas', unit: 'm²' },
  thickness: { label: 'tebal', unit: 'cm' },
  height: { label: 'tinggi', unit: 'm' },
  depth: { label: 'kedalaman', unit: 'm' },
  volume: { label: 'volume', unit: 'm³' },
  count: { label: 'jumlah', unit: '' },
  power: { label: 'daya', unit: 'kVA' },
};

const DIMENSION_KINDS: Array<Exclude<MeasureKind, 'other' | 'floors'>> = [
  'length', 'area', 'span', 'width', 'height', 'depth', 'thickness', 'volume', 'count', 'power',
];

function dimensionsFor(spec: UniversalSpec, scopeId: string, partSpec?: UniversalSpec | null): ScopeDimensions {
  const src = partSpec ?? spec;
  const out = {} as ScopeDimensions;
  for (const kind of DIMENSION_KINDS) {
    const field = KIND_SPEC_FIELD[kind] as keyof ScopeDimensions;
    // Part gedung memakai spek per-gedungnya langsung (tanpa atribusi
    // scopeSpecs proyek); part lain memakai nilai efektif per-scope.
    out[field] = (partSpec
      ? (typeof src[KIND_SPEC_FIELD[kind]] === 'number' ? (src[KIND_SPEC_FIELD[kind]] as number) : null)
      : effectiveValue(spec, scopeId, kind)) as never;
  }
  return out;
}

/** Frasa basis kuantitas yang jujur tentang asal tiap angka. */
function quantityBasisFor(spec: UniversalSpec, scopeId: string, partSpec?: UniversalSpec | null): string {
  const bits: string[] = [];
  for (const kind of DIMENSION_KINDS) {
    const meta = KIND_LABEL[kind];
    let v: number | null;
    let origin: string;
    if (partSpec) {
      const raw = partSpec[KIND_SPEC_FIELD[kind]];
      v = typeof raw === 'number' ? raw : null;
      origin = 'per gedung';
    } else {
      const attr = attributedValue(spec, scopeId, kind);
      if (attr != null) { v = attr; origin = 'untuk cakupan ini'; }
      else {
        const raw = spec[KIND_SPEC_FIELD[kind]];
        v = typeof raw === 'number' ? raw : null;
        origin = 'tingkat proyek';
      }
    }
    if (v == null) continue;
    bits.push(`${meta.label} ${v}${meta.unit ? ` ${meta.unit}` : ''} (${origin})`);
  }
  if (bits.length === 0) return 'tanpa ukuran pengguna untuk cakupan ini (default template)';
  return bits.join('; ');
}

/* ------------------------------------------------------------------ */
/* Disiplin per part                                                   */
/* ------------------------------------------------------------------ */

const MEP_SUBSYSTEM_DISCIPLINE: Record<MepSubsystem, string> = {
  listrik: 'elektrikal',
  plumbing: 'plumbing',
  hvac: 'hvac',
  fire: 'proteksi-kebakaran',
  data: 'elv-telekomunikasi',
  'gas-medis': 'plumbing',
  solar: 'elektrikal',
  lighting: 'elektrikal',
  'air-tanah': 'penyediaan-air',
  'water-treatment': 'air-limbah',
  'kawasan-elektrikal': 'elektrikal',
  'kawasan-air': 'penyediaan-air',
};

/** Disiplin kanonis satu part (subsistem MEP dari template/permintaan; selain itu dari taksonomi). */
function disciplineForPart(spec: UniversalSpec, part: DraftPart): string | null {
  if (part.scope.id === 'mep') {
    const subs = templateMepSubsystems(part.template);
    if (subs.length === 1) return MEP_SUBSYSTEM_DISCIPLINE[subs[0]] ?? null;
    if (subs.length > 1) return null; // paket terpadu = multi-disiplin, tanpa disiplin tunggal
    const requested = requestedMepSubsystems(spec);
    if (requested.length === 1) return MEP_SUBSYSTEM_DISCIPLINE[requested[0]] ?? null;
    return null;
  }
  const candidates = disciplinesForScope(part.scope.id);
  if (candidates.length === 0) return null;
  // Utamakan disiplin yang subkategorinya memuat klasifikasi primer
  // (dinding penahan → struktur-penahan, bukan lanskap).
  const primaryId = spec.classification?.primaryId ?? null;
  if (primaryId) {
    const hit = candidates.find((d) => d.subcategoryIds.includes(primaryId));
    if (hit) return hit.id;
    for (const sid of spec.classification?.secondaryIds ?? []) {
      const h2 = candidates.find((d) => d.subcategoryIds.includes(sid));
      if (h2) return h2.id;
    }
  }
  return candidates[0].id;
}

/** Disiplin kanonis satu scope tanpa part (dari klasifikasi/taksonomi). */
function disciplineForScope(spec: UniversalSpec, scopeId: string): string | null {
  const candidates = disciplinesForScope(scopeId);
  if (candidates.length === 0) return null;
  const primaryId = spec.classification?.primaryId ?? null;
  if (primaryId) {
    const hit = candidates.find((d) => d.subcategoryIds.includes(primaryId));
    if (hit) return hit.id;
  }
  return candidates[0].id;
}

/* ------------------------------------------------------------------ */
/* Parameter di luar batas (cermin partIssues — tanpa impor engine)    */
/* ------------------------------------------------------------------ */

function outOfRangeLabels(spec: UniversalSpec, part: DraftPart): string[] {
  const out: string[] = [];
  const effectiveSpec = part.spec ?? spec;
  const direct = part.spec != null;
  for (const p of part.template.parameters ?? []) {
    if (p.type !== 'NUMBER') continue;
    const { value } = valueForParam(effectiveSpec, part.scope.id, p, direct);
    if (value == null) continue;
    if ((p.min !== undefined && value < p.min) || (p.max !== undefined && value > p.max)) {
      out.push(`${p.label} = ${value}${p.unit ? ` ${p.unit}` : ''} di luar batas template (${p.min !== undefined ? p.min : '–'}–${p.max !== undefined ? p.max : '–'}${p.unit ? ` ${p.unit}` : ''})`);
    }
  }
  return out;
}

function scopeKey(scopeId: string, buildingId: string | null): string {
  return `${scopeId}::${buildingId ?? 'project'}`;
}

/* ------------------------------------------------------------------ */
/* Pembangunan model cakupan                                           */
/* ------------------------------------------------------------------ */

function projectScopeForPart(draft: UniversalDraft, part: DraftPart): ProjectScope {
  const spec = draft.spec;
  const buildingId = part.buildingId ?? null;
  const id = buildingId ? `scope-${part.scope.id}-${buildingId}` : `scope-${part.scope.id}`;
  const removed = new Set(part.removedKeys ?? []);
  const items = (part.generation.items ?? []).filter((it) => !removed.has(itemKeyLocal(it)));
  const missingParams = part.generation.missingRequiredParams ?? [];
  const unpricedCount = part.generation.priceSummary?.unpricedCount ?? 0;
  const selectedOptional = new Set(part.generation.selectedOptionalItemIds ?? []);
  const optionalWork = (part.template.components ?? [])
    .filter((c) => c.isOptional && !selectedOptional.has(c.id))
    .map((c) => c.name);
  const unverifiedWork = items
    .filter((it) => it.priceStatus === 'PRICE_UNRESOLVED' || it.priceStatus === 'PRICE_ESTIMATED')
    .map((it) => it.description);
  const oor = outOfRangeLabels(spec, part);
  const ambiguous = (draft.ambiguousPicks ?? []).find((a) => a.scope === part.scope.id);
  const reviewRequiredWork = [
    ...oor,
    ...(ambiguous ? [`pilihan template tidak tegas: ${ambiguous.reason}`] : []),
  ];
  let coverageStatus: ScopeCoverageStatus = 'COMPLETE_FOR_SELECTED_TEMPLATE';
  let coverageNote = `Lengkap untuk cakupan template "${part.template.name}" yang dipilih — bukan berarti seluruh proyek riil dirancang exhaustive.`;
  if (missingParams.length > 0 || unpricedCount > 0 || unverifiedWork.length > 0) {
    coverageStatus = 'PARTIAL';
    const bits: string[] = [];
    if (missingParams.length > 0) bits.push(`parameter wajib belum terisi: ${missingParams.join(', ')}`);
    if (unpricedCount > 0) bits.push(`${unpricedCount} item belum ada harga (tidak masuk total)`);
    if (unverifiedWork.length > 0) bits.push(`${unverifiedWork.length} item berstatus harga belum terverifikasi`);
    coverageNote = `Sebagian untuk template "${part.template.name}": ${bits.join('; ')}.`;
  }
  if (reviewRequiredWork.length > 0) {
    coverageStatus = 'REQUIRES_REVIEW';
    coverageNote = `Perlu tinjau untuk template "${part.template.name}": ${reviewRequiredWork.join('; ')}.`;
  }
  const buildingLabel = buildingId
    ? (draft.buildings ?? []).find((b) => b.id === buildingId)?.label ?? buildingId
    : null;
  const confirmed =
    (draft.structuredSpecs?.length ?? 0) > 0 || draft.forcedTemplateId === part.template.id;
  return {
    id,
    scopeId: part.scope.id,
    discipline: disciplineForPart(spec, part),
    parentScopeId: buildingId ? 'project' : null,
    buildingId,
    description: buildingLabel
      ? `${part.scope.label} — ${buildingLabel}: ${part.template.name}`
      : `${part.scope.label}: ${part.template.name}`,
    status: confirmed ? 'CONFIRMED' : 'REQUESTED',
    templateSource: part.template.id,
    includedWork: items.map((it) => it.description),
    excludedWork: [...(part.template.exclusions ?? [])],
    missingWork: missingParams,
    optionalWork,
    unverifiedWork,
    reviewRequiredWork,
    dependencies: [],
    dimensions: dimensionsFor(spec, part.scope.id, part.spec ?? null),
    quantityBasis: quantityBasisFor(spec, part.scope.id, part.spec ?? null),
    priceBasis:
      `template resmi EZRAB "${part.template.name}" (harga katalog)` +
      (unpricedCount > 0 ? `; ${unpricedCount} item belum ada harga (tidak masuk total)` : ''),
    completionStatus: 'DRAFTED',
    coverageStatus,
    coverageNote,
  };
}

function projectScopeForUndrafted(
  draft: UniversalDraft,
  scope: ScopeGroup,
  skip?: { reason: string; missing: string[]; outcome?: string },
): ProjectScope {
  const spec = draft.spec;
  const deduped = (draft.warnings ?? []).some(
    (w) => w.includes(`[${scope.label}]`) && w.includes('part digabung'),
  );
  const coverageStatus: ScopeCoverageStatus = deduped
    ? 'COMPLETE_FOR_SELECTED_TEMPLATE'
    : skip?.outcome === 'UNSUPPORTED'
      ? 'UNSUPPORTED'
      : 'NEEDS_SPECIFICATION';
  const coverageNote = deduped
    ? `Cakupan digabung ke part lain yang memakai template sama (tidak hilang — pekerjaannya tercakup di part itu).`
    : skip
      ? skip.reason
      : `Cakupan diminta tetapi belum dapat dibangun — ukuran atau spesifikasi belum cukup.`;
  const confirmed = (draft.structuredSpecs?.length ?? 0) > 0;
  return {
    id: `scope-${scope.id}`,
    scopeId: scope.id,
    discipline: disciplineForScope(spec, scope.id),
    parentScopeId: null,
    buildingId: null,
    description: scope.label,
    status: confirmed ? 'CONFIRMED' : 'REQUESTED',
    templateSource: null,
    includedWork: [],
    excludedWork: [],
    missingWork: skip?.missing ?? [`${scope.primaryLabel} untuk ${scope.label}`],
    optionalWork: [],
    unverifiedWork: [],
    reviewRequiredWork: [],
    dependencies: [],
    dimensions: dimensionsFor(spec, scope.id, null),
    quantityBasis: quantityBasisFor(spec, scope.id, null),
    priceBasis: 'belum ada template — harga belum dapat dihitung',
    completionStatus: deduped ? 'SKIPPED' : 'NEEDS_SPEC',
    coverageStatus,
    coverageNote,
  };
}

function projectScopeForSuppressed(
  draft: UniversalDraft,
  scope: ScopeGroup,
  sup: { reason: string; coversScopeId?: string },
): ProjectScope {
  const spec = draft.spec;
  const confirmed = (draft.structuredSpecs?.length ?? 0) > 0;
  return {
    id: `scope-${scope.id}`,
    scopeId: scope.id,
    discipline: disciplineForScope(spec, scope.id),
    parentScopeId: null,
    buildingId: null,
    description: scope.label,
    status: confirmed ? 'CONFIRMED' : 'REQUESTED',
    templateSource: null,
    includedWork: [],
    excludedWork: [],
    missingWork: [],
    optionalWork: [],
    unverifiedWork: [],
    reviewRequiredWork: [],
    dependencies: sup.coversScopeId ? [sup.coversScopeId] : [],
    dimensions: dimensionsFor(spec, scope.id, null),
    quantityBasis: quantityBasisFor(spec, scope.id, null),
    priceBasis: 'tercakup template cakupan penutup (tidak dihitung terpisah)',
    completionStatus: 'SUPPRESSED',
    coverageStatus: 'COMPLETE_FOR_SELECTED_TEMPLATE',
    coverageNote: sup.reason,
  };
}

/**
 * Model cakupan proyek dari sebuah draft (§5.2): satu ProjectScope per
 * part + satu per cakupan yang diminta tetapi belum tergambar (kecuali
 * yang ditekan sebagai konteks/bukan-pekerjaan — masuk excludedScopes).
 */
export function buildProjectScopes(
  draft: UniversalDraft,
  ctx?: ScopeModelBuildContext,
): ProjectScope[] {
  const spec = draft.spec;
  const out: ProjectScope[] = [];
  const skippedById = new Map((ctx?.skipped ?? []).map((s) => [s.scopeId, s]));
  const suppressedById = new Map((ctx?.suppressed ?? []).map((s) => [s.scopeId, s]));
  for (const part of draft.parts ?? []) {
    out.push(projectScopeForPart(draft, part));
  }
  const scopesWithParts = new Set((draft.parts ?? []).map((p) => p.scope.id));
  for (const scope of spec.scopes ?? []) {
    if (scopesWithParts.has(scope.id)) continue;
    const sup = suppressedById.get(scope.id);
    if (sup && sup.kind !== 'covered') continue; // konteks/dikeluarkan → excludedScopes
    if (sup && sup.kind === 'covered') {
      out.push(projectScopeForSuppressed(draft, scope, sup));
      continue;
    }
    out.push(projectScopeForUndrafted(draft, scope, skippedById.get(scope.id)));
  }
  return out;
}

/** Model cakupan lengkap: cakupan + cakupan yang dikecualikan + validasi. */
export function buildScopeModel(
  draft: UniversalDraft,
  ctx: ScopeModelBuildContext | undefined,
  scopeGroups: ScopeGroup[],
): DraftScopeModel {
  const scopes = buildProjectScopes(draft, ctx);
  const excludedScopes: ExcludedScopeRecord[] = (ctx?.suppressed ?? [])
    .filter((s) => s.kind !== 'covered')
    .map((s) => ({ scopeId: s.scopeId, reason: s.reason, kind: s.kind as 'context' | 'excluded' }));
  const validation = validateScopeIntegrity(draft, scopeGroups);
  return { scopes, excludedScopes, validation };
}

/**
 * Segarkan model cakupan sesudah revisi (dipanggil snapshotVersion):
 * dibangun ulang dari state draft saat ini, dengan catatan penekanan
 * (covered) + cakupan yang dikecualikan dari model sebelumnya dibawa
 * (alasan penekanan tidak berubah oleh revisi dimensi/item).
 */
export function refreshScopeModel(
  draft: UniversalDraft,
  prev: DraftScopeModel | undefined,
  scopeGroups: ScopeGroup[],
): DraftScopeModel {
  const prevSuppressed = (prev?.scopes ?? []).filter((s) => s.completionStatus === 'SUPPRESSED');
  const ctx: ScopeModelBuildContext = {
    suppressed: prevSuppressed.map((s) => ({
      scopeId: s.scopeId,
      reason: s.coverageNote,
      kind: 'covered' as const,
      coversScopeId: s.dependencies[0],
    })),
  };
  const model = buildScopeModel(draft, ctx, scopeGroups);
  model.excludedScopes = prev?.excludedScopes ?? model.excludedScopes;
  return model;
}

/* ------------------------------------------------------------------ */
/* Diff cakupan (tambah/hapus/ubah antar versi)                        */
/* ------------------------------------------------------------------ */

export interface ScopeDiff {
  added: ProjectScope[];
  removed: ProjectScope[];
  changed: Array<{ before: ProjectScope; after: ProjectScope; changes: string[] }>;
  unchanged: string[];
}

export function diffProjectScopes(before: ProjectScope[], after: ProjectScope[]): ScopeDiff {
  const beforeById = new Map(before.map((s) => [s.id, s]));
  const afterById = new Map(after.map((s) => [s.id, s]));
  const added: ProjectScope[] = [];
  const removed: ProjectScope[] = [];
  const changed: ScopeDiff['changed'] = [];
  const unchanged: string[] = [];
  for (const a of after) {
    const b = beforeById.get(a.id);
    if (!b) { added.push(a); continue; }
    const changes: string[] = [];
    if (b.templateSource !== a.templateSource) changes.push(`template ${b.templateSource ?? '—'} → ${a.templateSource ?? '—'}`);
    if (b.completionStatus !== a.completionStatus) changes.push(`status ${b.completionStatus} → ${a.completionStatus}`);
    if (b.coverageStatus !== a.coverageStatus) changes.push(`cakupan ${b.coverageStatus} → ${a.coverageStatus}`);
    if (JSON.stringify(b.dimensions) !== JSON.stringify(a.dimensions)) changes.push('dimensi berubah');
    if (b.includedWork.length !== a.includedWork.length) changes.push(`item ${b.includedWork.length} → ${a.includedWork.length}`);
    if (changes.length > 0) changed.push({ before: b, after: a, changes });
    else unchanged.push(a.id);
  }
  for (const b of before) {
    if (!afterById.has(b.id)) removed.push(b);
  }
  return { added, removed, changed, unchanged };
}

/* ------------------------------------------------------------------ */
/* Penekanan cakupan konteks (§5.3)                                    */
/* ------------------------------------------------------------------ */

/** Klasifikasi primer yang objeknya satu subsistem MEP / MEP terpadu. */
const MEP_OBJECT_PRIMARIES = new Set([
  'listrik', 'plumbing', 'hvac', 'fire-protection', 'komunikasi-data', 'mep-umum',
]);

/**
 * Sinyal pembangunan gedung BARU (bukan instalasi pada gedung yang ada).
 * 'baru' saja TIDAK masuk: "instalasi listrik baru" berarti instalasi
 * baru, bukan gedung baru.
 */
const NEW_BUILD_SIGNALS = /\b(bangun|membangun|pembangunan|gedung baru|bangunan baru|tambah gedung)\b/i;

/**
 * Cakupan yang hanya KONTEKS dan harus ditekan sebelum dibangun (§5.3):
 * bila objek permintaan adalah instalasi MEP (disebut SEBELUM gedungnya
 * — aturan objek-pertama yang sama dengan classifyUniversal) dan tidak
 * ada sinyal pembangunan gedung baru, cakupan 'gedung' adalah lokasi
 * instalasi, bukan bangunan yang dihitung. Tanpa ini, "instalasi AC
 * gedung kantor 500 m²" membangun satu gedung kantor utuh di samping
 * paket AC-nya, dan "fire protection gedung 5 lantai" membangun gedung
 * tanpa satu pun item proteksi kebakaran.
 *
 * Mengembalikan peta scopeId → alasan (kosong = tidak ada penekanan).
 * SCOPE_GROUPS diteruskan sebagai argumen (modul daun — tanpa impor
 * nilai dari universalRab).
 */
export function computeContextScopeSuppression(
  spec: UniversalSpec,
  scopeGroups: ScopeGroup[],
): Map<string, string> {
  const out = new Map<string, string>();
  const primaryId = spec.classification?.primaryId ?? null;
  if (!primaryId || !MEP_OBJECT_PRIMARIES.has(primaryId)) return out;
  if (!(spec.scopes ?? []).some((s) => s.id === 'gedung')) return out;
  const raw = spec.rawText || '';
  if (NEW_BUILD_SIGNALS.test(raw)) return out;
  // Objek-pertama: penyebutan subsistem MEP harus mendahului penyebutan
  // gedung (bila keduanya terlacak). Gedung yang disebut lebih dulu
  // ("gedung kantor 3 lantai dengan instalasi AC") adalah objeknya.
  const mepDef = subcategoryById(primaryId);
  const lower = raw.toLowerCase();
  const mepPos = mepDef ? lower.search(mepDef.detect) : -1;
  const gedungGroup = scopeGroups.find((g) => g.id === 'gedung');
  let gedungPos = -1;
  if (gedungGroup) {
    for (const kw of gedungGroup.keywords) {
      const i = lower.indexOf(kw);
      if (i >= 0 && (gedungPos < 0 || i < gedungPos)) gedungPos = i;
    }
  }
  if (mepPos >= 0 && gedungPos >= 0 && mepPos > gedungPos) return out;
  const label = mepDef?.label ?? primaryId;
  out.set(
    'gedung',
    `gedung hanya konteks lokasi pekerjaan ${label.toLowerCase()} yang diminta — bukan bangunan baru yang dihitung; susun draft gedung terpisah bila bangunannya juga perlu dihitung`,
  );
  return out;
}

/**
 * Renovasi adalah MODIFIER, bukan part tersendiri (§5.3): bila cakupan
 * lain sudah menghasilkan part (pekerjaan yang direnovasi — kantor,
 * jalan, drainase), part renovasi rumah tersendiri (RENOV-HOUSE-FULL)
 * adalah kebocoran dan ditekan. Pengecualian: permintaan menyebut
 * rumah/hunian sebagai objek renovasi ("renovasi rumah + bangun
 * gudang" — renovasi rumahnya memang pekerjaan tersendiri), atau belum
 * ada part lain (renovasi satu-satunya cakupan yang dapat dibangun).
 * Mengembalikan alasan penekanan, atau null bila part boleh dibangun.
 */
export function shouldSuppressRenovasiPart(
  spec: UniversalSpec,
  builtParts: DraftPart[],
): string | null {
  if (builtParts.length === 0) return null;
  if (/\brumah\b|\bhunian\b/i.test(spec.rawText || '')) return null;
  const labels = [...new Set(builtParts.map((p) => p.scope.label))];
  return `pekerjaan renovasi sudah tercakup part ${labels.map((l) => `[${l}]`).join(', ')} — renovasi di sini adalah cara pengerjaan atas pekerjaan itu, bukan pekerjaan renovasi rumah tersendiri`;
}

/* ------------------------------------------------------------------ */
/* Alamat cakupan pada revisi dimensi                                  */
/* ------------------------------------------------------------------ */

/**
 * Cakupan yang disebut di segmen teks revisi ("jalan" pada "panjang
 * jalan menjadi 2000 m") — dicocokkan dari kata kunci scope draft itu
 * sendiri (tanpa impor SCOPE_GROUPS). Pengecualian frasa berlaku:
 * 'saluran' di dalam 'saluran irigasi' bukan alamat drainase.
 */
export function resolveScopeAddress(segment: string, scopes: ScopeGroup[]): string[] {
  const t = ` ${(segment || '').toLowerCase()} `;
  const out: string[] = [];
  for (const s of scopes) {
    for (const kw of s.keywords) {
      let idx = t.indexOf(kw);
      let hit = false;
      while (idx >= 0) {
        const after = t.slice(idx + kw.length);
        if (!isExcludedKeywordOccurrence(s.id, kw, after)) { hit = true; break; }
        idx = t.indexOf(kw, idx + 1);
      }
      if (hit) {
        if (!out.includes(s.id)) out.push(s.id);
        break;
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Validasi integritas cakupan (§5.3) — deterministik, atas draft      */
/* ------------------------------------------------------------------ */

const DEMOLITION_RE = /demolisi|pembongkaran|\bbongkar\b|roboh/i;
const SOFTSCAPE_RE = /\b(tanaman|rumput|pohon|semak|softscape|penanaman|bunga)\b/i;
const RECONSTRUCTION_EVIDENCE_RE = /\b(rekonstruksi|eksisting)\b/i;

function isIntegratedMepRequest(spec: UniversalSpec): boolean {
  const requested = requestedMepSubsystems(spec);
  if (requested.length >= 2) return true;
  const ids = [
    spec.classification?.primaryId ?? null,
    ...(spec.classification?.secondaryIds ?? []),
  ];
  if (ids.includes('mep-umum')) return true;
  return /\b(mep (lengkap|terpadu|komplit|menyeluruh)|paket mep)\b/i.test(spec.rawText || '');
}

/** Item efektif satu part (generasi minus yang dihapus pengguna). */
function partEffectiveItems(part: DraftPart): Array<{ description: string; category?: string }> {
  const removed = new Set(part.removedKeys ?? []);
  return (part.generation.items ?? []).filter((it) => !removed.has(itemKeyLocal(it)));
}

/**
 * Validasi kebocoran disiplin atas sebuah draft. Aturan (deterministik,
 * tanpa LLM):
 * - L1 MEP_SUBSYSTEM_LEAK: part MEP mencakup subsistem di luar yang
 *   diminta tanpa persetujuan ekspansi (MEP terpadu / ≥2 subsistem /
 *   template paksa).
 * - L2 DEMOLITION_IN_NEW_BUILD: item demolisi pada proyek baru tanpa
 *   bukti demolisi/renovasi/rekonstruksi.
 * - L3 LANDSCAPE_SUBSTITUTION: template landscape / item softscape
 *   untuk dinding penahan.
 * - L4 IRRIGATION_AS_DRAINAGE: pekerjaan irigasi tercatat di scope
 *   drainase.
 * - L5 CONTEXT_SCOPE_LEAK: part untuk cakupan yang hanya konteks
 *   (gedung lokasi MEP; part renovasi rumah saat pekerjaan lain sudah
 *   tercakup).
 * - L6 DIMENSION_CROSSOVER: parameter part memakai nilai yang berbeda
 *   dari nilai yang teratribusi ke cakupannya sendiri (tanda dimensi
 *   global bocor lintas-cakupan, mis. revisi tanpa alamat).
 * - L7 DUPLICATE_SCOPE: >1 part untuk (scope, gedung) yang sama.
 */
export function validateScopeIntegrity(
  draft: UniversalDraft,
  scopeGroups: ScopeGroup[],
): ScopeValidationReport {
  const spec = draft.spec;
  const violations: ScopeViolation[] = [];
  const warnings: string[] = [];
  const parts = draft.parts ?? [];
  const checkedScopes = [...new Set(parts.map((p) => p.scope.id))];
  const rawText = spec.rawText || '';
  const primaryId = spec.classification?.primaryId ?? null;
  const secondaryIds = spec.classification?.secondaryIds ?? [];
  const classificationIds = [primaryId, ...secondaryIds].filter((x): x is string => !!x);

  /* L1 — kebocoran subsistem MEP. */
  const integratedMep = isIntegratedMepRequest(spec);
  const requestedSubs = requestedMepSubsystems(spec);
  for (const part of parts) {
    if (part.scope.id !== 'mep') continue;
    if (draft.forcedTemplateId === part.template.id) continue; // pilihan eksplisit pengguna
    const subs = templateMepSubsystems(part.template);
    if (subs.length === 0) {
      warnings.push(
        `[MEP] template "${part.template.name}" di luar peta subsistem MEP — cakupannya tidak dapat diverifikasi sebagai subsistem yang diminta.`,
      );
      continue;
    }
    if (integratedMep) continue;
    const extra = subs.filter((s) => !requestedSubs.includes(s));
    if (extra.length > 0 && requestedSubs.length > 0) {
      violations.push({
        code: 'MEP_SUBSYSTEM_LEAK',
        scopeId: 'mep',
        detail: `template "${part.template.name}" mencakup subsistem ${extra.join(', ')} yang tidak diminta (diminta: ${requestedSubs.join(', ')}) — paket MEP terpadu hanya sah bila pengguna meminta MEP lengkap atau menyetujui perluasan cakupan`,
      });
    }
  }

  /* L2 — demolisi pada bangunan baru. */
  const demolitionExempt =
    spec.isDemolition || spec.isRenovation || RECONSTRUCTION_EVIDENCE_RE.test(rawText);
  for (const part of parts) {
    const templateExempt =
      part.template.category === 'RENOVASI_MAINTENANCE' ||
      part.template.category === 'DEMOLISI_REKONSTRUKSI';
    if (demolitionExempt || templateExempt) continue;
    const hits = partEffectiveItems(part).filter((it) => {
      // Grup kanonis G17 (katalog-180) ATAU kata demolisi pada label
      // kategori/deskripsi (template seed berlabel ad-hoc di luar skema).
      if (groupForCategoryLabel(it.category ?? '') === 'G17') return true;
      return DEMOLITION_RE.test(`${it.category ?? ''} ${it.description}`);
    });
    if (hits.length > 0) {
      violations.push({
        code: 'DEMOLITION_IN_NEW_BUILD',
        scopeId: part.scope.id,
        detail: `item demolisi/pembongkaran pada pekerjaan baru tanpa bukti demolisi/renovasi/rekonstruksi: ${hits.map((h) => h.description).join('; ')}`,
        items: hits.map((h) => h.description),
      });
    }
  }

  /* L3 — substitusi landscape untuk dinding penahan. */
  if (primaryId === 'dinding-penahan') {
    for (const part of parts) {
      if (part.template.category === 'LANDSCAPE_SITE') {
        violations.push({
          code: 'LANDSCAPE_SUBSTITUTION',
          scopeId: part.scope.id,
          detail: `dinding penahan memakai template landscape "${part.template.name}" — bukan struktur dinding penahan`,
        });
      }
      const isRetainingPart =
        part.template.id.startsWith('STR-RETAINING') ||
        (part.scope.id === 'lanskap' && primaryId === 'dinding-penahan');
      if (isRetainingPart) {
        const soft = partEffectiveItems(part).filter((it) => SOFTSCAPE_RE.test(it.description));
        if (soft.length > 0) {
          violations.push({
            code: 'LANDSCAPE_SUBSTITUTION',
            scopeId: part.scope.id,
            detail: `item softscape/landscape di dalam part dinding penahan: ${soft.map((s) => s.description).join('; ')}`,
            items: soft.map((s) => s.description),
          });
        }
      }
    }
  }

  /* L4 — irigasi tercatat sebagai drainase biasa. */
  if (classificationIds.includes('irigasi') || classificationIds.includes('bendung')) {
    for (const part of parts) {
      if (part.scope.id === 'drainase' && /irigasi/i.test(part.template.name)) {
        violations.push({
          code: 'IRRIGATION_AS_DRAINAGE',
          scopeId: 'drainase',
          detail: `pekerjaan irigasi "${part.template.name}" tercatat di scope drainase — irigasi adalah cakupannya sendiri (SDA), bukan drainase biasa`,
        });
      }
    }
  }

  /* L5 — cakupan konteks yang lolos menjadi part. */
  const contextSuppressed = computeContextScopeSuppression(spec, scopeGroups);
  for (const part of parts) {
    const reason = contextSuppressed.get(part.scope.id);
    if (reason) {
      violations.push({
        code: 'CONTEXT_SCOPE_LEAK',
        scopeId: part.scope.id,
        detail: `part [${part.scope.label}] seharusnya tidak dibangun: ${reason}`,
      });
    }
  }
  if (parts.length > 1 && !/\brumah\b|\bhunian\b/i.test(rawText)) {
    for (const part of parts) {
      if (part.scope.id === 'renovasi') {
        violations.push({
          code: 'CONTEXT_SCOPE_LEAK',
          scopeId: 'renovasi',
          detail: `part renovasi rumah tersendiri ("${part.template.name}") padahal pekerjaan yang direnovasi sudah punya part — renovasi adalah modifier, bukan part tersendiri`,
        });
      }
    }
  }

  /* L6 — dimensi lintas-cakupan: nilai parameter part berbeda dari
   * nilai yang teratribusi ke cakupannya sendiri. Dilewati untuk part
   * gedung (spek per-gedung otoritatif) dan nilai default template. */
  for (const part of parts) {
    if (part.spec != null || part.sectionKind === 'building') continue;
    for (const p of part.template.parameters ?? []) {
      if (p.type !== 'NUMBER') continue;
      const kind = classifyParamLocal(p.key, p.label);
      if (kind === 'other') continue;
      const v = part.evaluatedParams?.[p.key];
      if (typeof v !== 'number') continue;
      if (p.defaultValue !== undefined && v === p.defaultValue) continue;
      const attr = attributedValue(spec, part.scope.id, kind);
      if (attr == null) continue; // tanpa atribusi: fallback global adalah perilaku yang didokumentasikan
      let expected = attr;
      if (kind === 'thickness') {
        const unit = (p.unit || '').toLowerCase();
        if (unit === 'm') expected = attr / 100;
        else if (unit === 'mm') expected = attr / 10;
      }
      if (!approxEqual(v, expected)) {
        violations.push({
          code: 'DIMENSION_CROSSOVER',
          scopeId: part.scope.id,
          detail: `parameter "${p.label}" part [${part.scope.label}] bernilai ${v}${p.unit ? ` ${p.unit}` : ''}, padahal nilai yang teratribusi ke cakupan ini ${expected}${p.unit ? ` ${p.unit}` : ''} — dimensi cakupan lain/global bocor ke cakupan ini`,
        });
      }
    }
  }

  /* L7 — duplikat cakupan: >1 part untuk (scope, gedung) yang sama. */
  const byKey = new Map<string, DraftPart[]>();
  for (const part of parts) {
    const key = scopeKey(part.scope.id, part.buildingId ?? null);
    const list = byKey.get(key) ?? [];
    list.push(part);
    byKey.set(key, list);
  }
  for (const [key, list] of byKey) {
    if (list.length > 1) {
      violations.push({
        code: 'DUPLICATE_SCOPE',
        scopeId: list[0].scope.id,
        detail: `cakupan ${key} muncul ${list.length} kali sebagai part terpisah (${list.map((p) => p.template.name).join(' vs ')}) — satu cakupan satu part`,
      });
    }
  }

  /* Peringatan: cakupan diminta tanpa part dan tanpa jejak penekanan. */
  const suppressedScopes = new Set([
    ...contextSuppressed.keys(),
    ...(draft.scopeModel?.excludedScopes ?? []).map((e) => e.scopeId),
  ]);
  for (const scope of spec.scopes ?? []) {
    if (checkedScopes.includes(scope.id)) continue;
    if (suppressedScopes.has(scope.id)) continue;
    const deduped = (draft.warnings ?? []).some(
      (w) => w.includes(`[${scope.label}]`) && w.includes('part digabung'),
    );
    if (deduped) continue;
    const skipped = (draft.warnings ?? []).some(
      (w) => w.includes(`[${scope.label}]`) && w.includes('tidak dibangun'),
    );
    if (!skipped) {
      warnings.push(`cakupan [${scope.label}] diminta tetapi tidak ada part-nya dan tidak ada jejak penekanan/pengecualian.`);
    }
  }

  return { ok: violations.length === 0, violations, warnings, checkedScopes };
}

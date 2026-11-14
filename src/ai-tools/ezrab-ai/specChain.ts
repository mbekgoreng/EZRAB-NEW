/**
 * specChain — Pemetaan deterministik spesifikasi terstruktur → RAB +
 * validasi rantai spesifikasi → RAB (Fase 2 Bagian B, 2026-11-12).
 *
 * Modul ini TIDAK mengimpor universalRab (universalRab yang mengimpor
 * modul ini — impor sebaliknya akan melingkar). Karena itu bentuk
 * draft/template/spesifikasi yang dibutuhkan didefinisikan di sini
 * sebagai tipe struktural minimal (ChainDraftLike dst.); UniversalDraft
 * dan RabTemplate asli memenuhi bentuk itu tanpa adaptor. Dua helper
 * kecil (klasifikasi jenis parameter + nilai spek per jenis) adalah
 * CERMIN dari universalRab.classifyParam / specValueFor — diduplikasi
 * secara sadar dengan komentar penanda, bukan diimpor, agar modul ini
 * tetap dapat dimuat mandiri oleh tes tanpa menarik seluruh
 * universalRab. Bila logika kanonis di universalRab berubah, cermin
 * ini wajib diperbarui bersama (ditandai di kedua berkas).
 *
 * Kontrak tipe StructuredSpec berasal dari Bagian A
 * (./structuredSpec + deriveStructuredSpecs di questionnaire.ts).
 * Pada saat modul ini ditulis Bagian A BELUM mendarat di worktree
 * (structuredSpec.ts belum ada), sehingga impor di bawah ini adalah
 * `import type` (dihapus saat kompilasi — tidak membutuhkan berkas
 * itu saat runtime) dan integrasi penuh menunggu Bagian A.
 *
 * KEPUTUSAN KATALOG (owner belum menjawab; yang berlaku):
 * jalur penanda jujur NEEDS_MANUAL_PRICE — spek tercatat, item
 * ditandai butuh harga manual/konfirmasi substitusi, TIDAK PERNAH
 * ganti diam-diam ke material lain. Tidak ada harga yang dikarang di
 * sini; harga hanya dibaca dari item hasil generate.
 */

import type { StructuredSpec, SpecStatus } from './structuredSpec';
import { SPEC_KEY_META, latestSpecsByKey, isSpecUnresolved } from './structuredSpec';
import { classifyItemRelevance } from './relevanceGate';
/* P3D — artefak WBS (wbsArtifact TIDAK mengimpor specChain: aman). */
import { buildWbsArtifact, wbsNodeId, scopeForSpecKey, SCOPE_LABELS } from './wbsArtifact';
import type { WbsArtifact, BuildWbsArtifactInput, WbsPartInput } from './wbsArtifact';

/* ------------------------------------------------------------------ */
/* Bentuk struktural minimal (cermin tipe universalRab — tanpa impor)  */
/* ------------------------------------------------------------------ */

export interface ChainDraftItemLike {
  id: string;
  description: string;
  volume: number;
  unit: string;
  unitPrice?: number | null;
  priceStatus?: string | null;
  priceSourceKind?: string | null;
  ahspMappingStatus?: string | null;
  notes?: string | null;
}

export interface ChainTemplateLike {
  id: string;
  name: string;
  parameters?: Array<{
    key: string;
    label: string;
    type: string;
    unit?: string;
    defaultValue?: unknown;
  }>;
  components?: Array<{
    id: string;
    name: string;
    calculationRule: string;
    variables?: string[];
  }>;
}

export interface ChainDraftPartLike {
  scope: { id: string; label: string };
  template: ChainTemplateLike;
  evaluatedParams: Record<string, unknown>;
  generation: {
    items: ChainDraftItemLike[];
    traceability?: Array<{ itemId: string; calculationTrace: string }>;
  };
  removedKeys: string[];
  manualPrices: Record<string, { unitPrice: number; note: string }>;
  /** GATE 2 (5B): spek yang dipakai membangun part ini (per gedung pada
   *  draft multi-seksi; absen pada draft satu gedung / lama). */
  spec?: ChainDraftLike['spec'];
}

export interface ChainDraftLike {
  spec: {
    areaM2?: number | null;
    lengthM?: number | null;
    widthM?: number | null;
    spanM?: number | null;
    heightM?: number | null;
    thicknessCm?: number | null;
    volumeM3?: number | null;
    count?: number | null;
    floors?: number | null;
    budgetCap?: number | null;
    buildingLengthM?: number | null;
    buildingWidthM?: number | null;
    rawText?: string;
  };
  parts: ChainDraftPartLike[];
  ambiguousPicks?: Array<{
    scope: string;
    chosen: string;
    candidates: string[];
    reason: string;
  }>;
}

/* ------------------------------------------------------------------ */
/* Util                                                                */
/* ------------------------------------------------------------------ */

const norm = (s: string): string =>
  // Hyphen DIPERTAHANKAN: kunci MATERIAL_BINDING memakai hyphen
  // ('perkerasan-jalan', 'spandek-galvalum') — versi lama mengubah '-'
  // menjadi spasi sehingga semua lookup keluarga ber-hyphen miss dan
  // mengembalikan UNVERIFIED (tertangkap tes MATERIAL_BINDING).
  (s || '').toLowerCase().replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();

function specText(spec: StructuredSpec): string {
  const v = spec.value;
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.join(', ');
  return '';
}

function specNumber(spec: StructuredSpec): number | null {
  const v = spec.value;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const m = v.match(/(\d+(?:[.,]\d+)?)/);
    if (!m) return null;
    const n = parseFloat(m[1].replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isUndecided(spec: StructuredSpec): boolean {
  const t = norm(specText(spec));
  return (
    spec.status === 'UNRESOLVED' ||
    t === '' ||
    t.includes('belum ditentukan') ||
    t.includes('belum tahu') ||
    t.includes('belum perlu')
  );
}

export function formatRupiahId(n: number): string {
  return `Rp${Math.round(n).toLocaleString('id-ID')}`;
}

/* ------------------------------------------------------------------ */
/* MATERIAL_BINDING — varian material → ketersediaan katalog           */
/* Bukti: audit Fase 1 §5 (bukan karangan). Kunci                     */
/* `${family}:${material ternormalisasi}`. 'UNVERIFIED' = sel tidak   */
/* dapat dibuktikan dari audit/kode (mis. hanya SEBAGIAN) — TIDAK     */
/* dipakai untuk memaksa pick.                                         */
/* ------------------------------------------------------------------ */

export type MaterialAvailability = 'AVAILABLE' | 'UNAVAILABLE' | 'UNVERIFIED';

export const MATERIAL_BINDING: Readonly<Record<string, MaterialAvailability>> = {
  // Atap kandang — Spandek ADA (AGR-LIVESTOCK-BARN 'Penutup Atap
  // Spandek Kandang', kode resmi 3.1.3.8); Genteng ADA (komponen
  // 3.1.1.2 di template yang sama); Galvalum ADA (komponen 3.1.3.8)
  // & Asbes ADA (komponen 3.1.2.1) — keputusan owner 2026-11-12 03:41.
  'atap-kandang:spandek': 'AVAILABLE',
  'atap-kandang:genteng': 'AVAILABLE',
  'atap-kandang:galvalum': 'AVAILABLE',
  'atap-kandang:asbes': 'AVAILABLE',
  // Atap gudang — UPVC ADA (BLD-IND-MULTITENANT); Spandek/Galvalum
  // ADA (komponen 3.1.3.8); Zincalume ADA (komponen 3.1.3.1, mengikuti
  // preseden ROOF-METAL-STANDING); Genteng-metal TIDAK ADA (hanya nok
  // 3.1.3.14 per m', tanpa harga lembaran resmi per m²).
  'atap-gudang:spandek': 'AVAILABLE',
  'atap-gudang:galvalum': 'AVAILABLE',
  'atap-gudang:zincalume': 'AVAILABLE',
  'atap-gudang:genteng metal': 'UNAVAILABLE',
  // Atap gedung — Genteng ADA (ROOF-TILE-PREMIUM); spandek-galvalum
  // sbg satu varian TIDAK ADA; dak beton ADA (template
  // ROOF-CONCRETE-DECK, keputusan owner 2026-11-12 03:41).
  'atap-gedung:genteng': 'AVAILABLE',
  'atap-gedung:spandek-galvalum': 'UNAVAILABLE',
  'atap-gedung:dak beton': 'AVAILABLE',
  // Lantai kandang — beton miring ADA sbg item (3.10.10) tapi HARGA
  // UNRESOLVED (bukan harga resmi); anti-licin & kombinasi TIDAK ADA.
  'lantai-kandang:beton': 'AVAILABLE',
  'lantai-kandang:anti-licin': 'UNAVAILABLE',
  'lantai-kandang:kombinasi': 'UNAVAILABLE',
  // Lantai gudang — floor hardener ADA (BLD-IND-MULTITENANT);
  // paving ADA (komponen 7.1.1.1, keputusan owner 2026-11-12 03:41);
  // 'beton biasa' SEBAGIAN (slab beton ADA tapi selalu + hardener di
  // atasnya; tak ada item 'beton biasa' yang dapat dipilih sendiri)
  // → UNVERIFIED.
  'lantai-gudang:hardener': 'AVAILABLE',
  'lantai-gudang:beton': 'UNVERIFIED',
  'lantai-gudang:paving': 'AVAILABLE',
  // Pondasi — bore pile ADA (FND-BORED-PILE), tiang pancang ADA
  // (FND-DRIVEN-PILE), sumuran ADA (FND-SUMURAN-CAISSON); foot plat
  // ADA (template FND-FOOT-PLAT, keputusan owner 2026-11-12 03:41);
  // batu kali TIDAK ADA sbg template (batu kali hanya item di dalam
  // template lain).
  'pondasi:bore pile': 'AVAILABLE',
  'pondasi:tiang pancang': 'AVAILABLE',
  'pondasi:sumuran': 'AVAILABLE',
  'pondasi:foot plat': 'AVAILABLE',
  'pondasi:batu kali': 'UNAVAILABLE',
  // Perkerasan jalan — hotmix/rigid/paving ADA (INFRA-ROAD-ASPHALT /
  // INFRA-ROAD-RIGID / PAV-KOMPLEK-6CM); makadam ADA (template
  // INFRA-ROAD-MACADAM, kode F.46, keputusan owner 2026-11-12 03:41);
  // telford TIDAK ADA (0 hit di semua data resmi).
  'perkerasan-jalan:hotmix': 'AVAILABLE',
  'perkerasan-jalan:rigid': 'AVAILABLE',
  'perkerasan-jalan:paving': 'AVAILABLE',
  'perkerasan-jalan:telford': 'UNAVAILABLE',
  'perkerasan-jalan:makadam': 'AVAILABLE',
  // Drainase — U-ditch & box culvert ADA; pasangan batu kali &
  // beton cor di tempat SEBAGIAN (bukan item saluran) → UNVERIFIED.
  'drainase:u-ditch': 'AVAILABLE',
  'drainase:box culvert': 'AVAILABLE',
  'drainase:pasangan batu kali': 'UNVERIFIED',
  'drainase:beton cor': 'UNVERIFIED',
  // Kolam — skimmer/semi-overflow TIDAK ADA; overflow hanya komponen
  // COMPREHENSIVE (tak muncul di draft PROFESSIONAL) → UNVERIFIED;
  // keramik/mozaik ADA; batu alam sbg finishing SEBAGIAN (hanya dek)
  // → UNVERIFIED; deck batu alam ADA.
  'kolam-type:skimmer': 'UNAVAILABLE',
  'kolam-type:semi-overflow': 'UNAVAILABLE',
  'kolam-type:overflow': 'UNVERIFIED',
  'kolam-finish:keramik': 'AVAILABLE',
  'kolam-finish:mozaik': 'AVAILABLE',
  'kolam-finish:batu alam': 'UNVERIFIED',
  'kolam-deck:batu alam': 'AVAILABLE',
};

export function lookupMaterialBinding(
  family: string,
  material: string
): MaterialAvailability {
  return MATERIAL_BINDING[`${norm(family)}:${norm(material)}`] ?? 'UNVERIFIED';
}

/* ------------------------------------------------------------------ */
/* Keluarga proyek dari spek                                           */
/* ------------------------------------------------------------------ */

export function familyIdFromSpecs(specs: StructuredSpec[]): string | null {
  for (const s of specs) {
    const k = s.key;
    if (k.startsWith('kandang-') || k === 'kandang-type') return 'kandang';
    if (k.startsWith('warehouse-')) return 'gudang-industri';
    if (k.startsWith('road-')) return 'jalan';
    if (k.startsWith('building-')) return 'gedung';
    if (k.startsWith('drainage-')) return 'drainase';
    if (k.startsWith('pool-')) return 'kolam';
    if (k.startsWith('landscape-')) return 'lanskap';
    if (k.startsWith('renovation-')) return 'renovasi';
    if (k === 'bridge-type') return 'jembatan';
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* suppressedScopes                                                    */
/*                                                                     */
/* (a) road-drainage 'tanpa'/'eksisting' → suppress 'drainase'.       */
/* (b) atap: family kandang/gudang-industri → suppress 'atap' —       */
/*     TERVERIFIKASI terhadap komponen template: AGR-LIVESTOCK-BARN   */
/*     memuat 'Penutup Atap Spandek Kandang' (specialty3.ts) dan      */
/*     BLD-IND-MULTITENANT memuat 'Penutup Atap UPVC Atap Gudang'     */
/*     (buildings2.ts) — atap sudah tercakup komponen template        */
/*     keluarga, jadi part atap terpisah adalah ganda.                 */
/* ------------------------------------------------------------------ */

export type SpecChainScopeId =
  | 'jalan' | 'drainase' | 'jembatan' | 'irigasi' | 'pondasi' | 'struktur'
  | 'atap' | 'finishing' | 'gedung' | 'mep' | 'lanskap' | 'renovasi'
  | 'demolisi' | 'pelabuhan' | 'olahraga' | 'pertanian' | 'tanah' | 'sanitasi';

export function suppressedScopes(
  specs: StructuredSpec[],
  familyId: string | null
): Set<SpecChainScopeId> {
  const out = new Set<SpecChainScopeId>();
  const drainage = specs.find((s) => s.key === 'road-drainage');
  if (drainage) {
    const v = norm(specText(drainage));
    if (v.includes('tanpa') || v.includes('eksisting')) out.add('drainase');
  }
  if (familyId === 'kandang' || familyId === 'gudang-industri') out.add('atap');
  return out;
}

/* ------------------------------------------------------------------ */
/* Material yang diminta satu spek (keluarga + token ternormalisasi)   */
/* ------------------------------------------------------------------ */

export interface RequestedMaterial {
  /** Keluarga MATERIAL_BINDING ('atap-kandang', 'pondasi', dst.). */
  bindingFamily: string;
  /** Keluarga materialStatusForItem ('atap'|'lantai'|'pondasi'|'perkerasan'). */
  family: 'atap' | 'lantai' | 'pondasi' | 'perkerasan';
  material: string;
}

const MATERIAL_SPEC_MAP: Record<
  string,
  { bindingFamily: string; family: RequestedMaterial['family']; paramKey?: string }
> = {
  'kandang-roof-material': { bindingFamily: 'atap-kandang', family: 'atap', paramKey: 'roof_material' },
  'warehouse-roof': { bindingFamily: 'atap-gudang', family: 'atap', paramKey: 'roof_material' },
  'building-roof-type': { bindingFamily: 'atap-gedung', family: 'atap', paramKey: 'roof_material' },
  'kandang-floor': { bindingFamily: 'lantai-kandang', family: 'lantai', paramKey: 'floor_type' },
  'warehouse-floor': { bindingFamily: 'lantai-gudang', family: 'lantai', paramKey: 'floor_type' },
  'building-foundation': { bindingFamily: 'pondasi', family: 'pondasi', paramKey: 'foundation_type' },
  'road-pavement': { bindingFamily: 'perkerasan-jalan', family: 'perkerasan', paramKey: 'pavement_type' },
};

/** Token material dari nilai spek (urutan = prioritas pencocokan). */
function extractMaterialToken(
  family: RequestedMaterial['family'],
  value: string
): string | null {
  const v = ` ${norm(value)} `;
  if (family === 'atap') {
    // 'spandek-galvalum' sbg satu varian jawaban diperlakukan sbg
    // permintaan 'galvalum' (bahan pelapisnya) — galvalum dicek dulu.
    if (v.includes('galvalum')) return 'galvalum';
    if (v.includes('standing seam')) return 'standing seam';
    if (v.includes('spandek')) return 'spandek';
    if (v.includes('zincalume')) return 'zincalume';
    if (v.includes('genteng')) return 'genteng';
    if (v.includes('asbes')) return 'asbes';
    if (v.includes('upvc')) return 'upvc';
    if (v.includes('dak beton')) return 'dak beton';
    if (v.includes('seng')) return 'seng';
    if (v.includes('metal')) return 'genteng metal';
    return null;
  }
  if (family === 'lantai') {
    if (v.includes('floor hardener') || v.includes('hardener')) return 'hardener';
    if (v.includes('anti-licin') || v.includes('anti licin') || v.includes('tekstur')) return 'anti-licin';
    if (v.includes('kombinasi')) return 'kombinasi';
    if (v.includes('paving')) return 'paving';
    if (v.includes('keramik')) return 'keramik';
    if (v.includes('granit')) return 'granit';
    if (v.includes('beton')) return 'beton';
    return null;
  }
  if (family === 'pondasi') {
    if (v.includes('bore pile') || v.includes('bored pile')) return 'bore pile';
    if (v.includes('tiang pancang')) return 'tiang pancang';
    if (v.includes('foot plat') || v.includes('footplat') || v.includes('telapak')) return 'foot plat';
    if (v.includes('batu kali')) return 'batu kali';
    if (v.includes('sumuran')) return 'sumuran';
    if (v.includes('mini pile')) return 'mini pile';
    return null;
  }
  // perkerasan
  if (v.includes('telford') || v.includes('makadam')) return 'telford';
  if (v.includes('hotmix') || v.includes('hot mix') || v.includes('aspal')) return 'hotmix';
  if (v.includes('rigid') || v.includes('beton')) return 'rigid';
  if (v.includes('paving')) return 'paving';
  return null;
}

export function requestedMaterialForSpec(
  spec: StructuredSpec
): RequestedMaterial | null {
  const m = MATERIAL_SPEC_MAP[spec.key];
  if (!m) return null;
  const token = extractMaterialToken(m.family, specText(spec));
  if (!token) return null;
  return { bindingFamily: m.bindingFamily, family: m.family, material: token };
}

/**
 * GATE 5 (5E) — token material atap dari TEKS BEBAS (alur tanpa-spek).
 * Prioritas pencocokan yang SAMA dengan extractMaterialToken keluarga
 * 'atap' (galvalum > standing seam > spandek > zincalume > genteng >
 * asbes > upvc > dak beton > seng > metal) — satu sumber urutan, bukan
 * daftar kedua yang bisa menyimpang. Dipakai penekanan atap tanpa-spek
 * (universalRab): bila token ini adalah salah satu opsi SELECT
 * `roof_material` template keluarga, material teks dihormati lewat
 * override param; bila bukan opsi, disebut terbuka sebagai peringatan
 * (tidak pernah diganti diam-diam ke material lain).
 */
export function extractRoofMaterialToken(text: string): string | null {
  return extractMaterialToken('atap', text);
}

/* ------------------------------------------------------------------ */
/* GELOMBANG 2 (§17.4) — derivasi spek atap jalur TERPANDU dari teks   */
/* bebas.                                                              */
/*                                                                     */
/* Temuan Gate 5 §8: kartu kuesioner atap menganggap dirinya           */
/* "terpuaskan" bila teks menyebut material (isSatisfied memakai       */
/* ROOF_MATERIAL_RE) — kartu tidak pernah ditanyakan DAN teks tidak    */
/* pernah diturunkan menjadi spek; draft memakai default spandek       */
/* berlabel asumsi padahal pengguna sudah menyebut materialnya.        */
/*                                                                     */
/* Derivasi ini menutup celah itu di buildUniversalDraft (bukan di     */
/* questionnaire — teks mentah + spek bertemu di sana): bila teks      */
/* bebas menyebut material atap secara eksplisit dan belum ada spek    */
/* atap keluarga itu, sebutan itu menjadi spek CONFIRMED bersumber     */
/* 'percakapan'. Token diambil dari extractRoofMaterialToken — SATU    */
/* sumber urutan dengan jalur tanpa-spek dan spek terstruktur, bukan   */
/* mesin parsing kedua. Nilai spek = label tampilan (pola yang sama    */
/* dengan jawaban kuesioner 'Galvalum'/'Spandek'); token kanonis       */
/* tetap diturunkan lewat requestedMaterialForSpec.                    */
/*                                                                     */
/* Batas yang dijaga: (a) keluarga tanpa kunci spek atap → null;       */
/* (b) spek atap sudah ada — DIJAWAB maupun DILEWATI/UNRESOLVED —     */
/* dihormati (pelewatan eksplisit bukan kekosongan untuk diisi);       */
/* (c) tanpa sebutan material di teks → null (default spandek          */
/* berlabel asumsi dipertahankan — perilaku lama).                     */
/* ------------------------------------------------------------------ */

/** Kunci spek atap per keluarga (satu-satunya keluarga dengan spek atap). */
const FAMILY_ROOF_SPEC_KEY: Record<string, string> = {
  kandang: 'kandang-roof-material',
  'gudang-industri': 'warehouse-roof',
  gedung: 'building-roof-type',
};

/** Label tampilan per token kanonis (nilai spek = label, bukan token). */
const ROOF_TOKEN_LABEL: Record<string, string> = {
  galvalum: 'Galvalum',
  'standing seam': 'Standing seam',
  spandek: 'Spandek',
  zincalume: 'Zincalume',
  genteng: 'Genteng',
  asbes: 'Asbes',
  upvc: 'UPVC',
  'dak beton': 'Dak beton',
  seng: 'Seng',
  'genteng metal': 'Genteng metal',
};

export function deriveRoofSpecFromText(
  rawText: string,
  familyId: string | null,
  existingSpecs: StructuredSpec[],
): StructuredSpec | null {
  const key = familyId ? FAMILY_ROOF_SPEC_KEY[familyId] : undefined;
  if (!key) return null;
  if (existingSpecs.some((s) => s.key === key)) return null;
  const token = extractRoofMaterialToken(rawText);
  if (!token) return null;
  const meta = SPEC_KEY_META[key];
  if (!meta) return null;
  return {
    key,
    kind: meta.kind,
    label: meta.label,
    value: ROOF_TOKEN_LABEL[token] ?? token,
    status: 'CONFIRMED',
    source: 'percakapan',
    updatedAt: new Date().toISOString(),
    supersedes: null,
  };
}

/* ------------------------------------------------------------------ */
/* selectParamOverrides — spek material terstruktur → param SELECT     */
/* template (dipakai mapSpecToParams). Nilai = token kanonis dari       */
/* requestedMaterialForSpec, HARUS sama persis dengan nilai opsi       */
/* SELECT template (mis. 'galvalum', 'spandek', 'paving'); bila        */
/* template tidak mendeklarasikan param itu, override diabaikan        */
/* (mapSpecToParams hanya mengisi param yang dideklarasikan).           */
/* Spek tanpa token (dilewati / 'Belum ditentukan') tidak menghasilkan  */
/* override — template memakai default-nya. First-wins bila dua spek   */
/* memetakan ke param yang sama (tak mungkin satu konteks dua           */
/* keluarga — urutan spek alfabetis membuat hasilnya deterministik).    */
/* ------------------------------------------------------------------ */
export function selectParamOverrides(
  specs: StructuredSpec[]
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of specs) {
    const m = MATERIAL_SPEC_MAP[s.key];
    if (!m?.paramKey) continue;
    if (m.paramKey in out) continue;
    const req = requestedMaterialForSpec(s);
    if (!req) continue;
    out[m.paramKey] = req.material;
  }
  return out;
}

/** Spek material yang relevan untuk satu scope (dipakai AMBIGUOUS_PICK). */
export function materialSpecForScope(
  specs: StructuredSpec[],
  scopeId: string
): StructuredSpec | null {
  const keys: Record<string, string[]> = {
    jalan: ['road-pavement'],
    pondasi: ['building-foundation'],
    atap: ['kandang-roof-material', 'warehouse-roof', 'building-roof-type'],
    pertanian: ['kandang-roof-material', 'kandang-floor'],
    gedung: ['warehouse-roof', 'building-roof-type', 'warehouse-floor'],
  };
  for (const k of keys[scopeId] ?? []) {
    const found = specs.find((s) => s.key === k);
    if (found) return found;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* resolveDeterministicPick                                            */
/*                                                                     */
/* Pemetaan eksplisit spek → template. 'bore pile' BUKAN substring     */
/* 'Bored Pile' — ditangani lewat alias eksplisit di sini, bukan      */
/* substring match. Nilai UNAVAILABLE → null (biar jalur teks +       */
/* penanda AMBIGUOUS_PICK yang bekerja — jangan memaksa template      */
/* yang salah). Target wajib ada di `ranked` (kandidat scope itu).    */
/* ------------------------------------------------------------------ */

export interface RankedPickLike {
  template: { id: string; name: string };
  score: number;
}

export function resolveDeterministicPick(
  scope: { id: string },
  specs: StructuredSpec[],
  ranked: RankedPickLike[]
): { templateId: string; reason: string } | null {
  let target: { templateId: string; reason: string } | null = null;
  if (scope.id === 'atap') {
    const roof = specs.find((s) =>
      ['kandang-roof-material', 'warehouse-roof', 'building-roof-type'].includes(s.key)
    );
    if (roof && norm(specText(roof)).includes('genteng')) {
      target = {
        templateId: 'ROOF-TILE-PREMIUM',
        reason: `atap Genteng (jawaban "${specText(roof)}") → template Atap Genteng Keramik Premium`,
      };
    } else if (roof && norm(specText(roof)).includes('dak beton')) {
      target = {
        templateId: 'ROOF-CONCRETE-DECK',
        reason: `atap Dak beton (jawaban "${specText(roof)}") → template Dak Beton + Waterproofing`,
      };
    }
  } else if (scope.id === 'jalan') {
    const pav = specs.find((s) => s.key === 'road-pavement');
    if (pav) {
      const v = norm(specText(pav));
      if (v.includes('hotmix') || v.includes('hot mix') || v.includes('aspal')) {
        target = { templateId: 'INFRA-ROAD-ASPHALT', reason: `perkerasan hotmix (jawaban "${specText(pav)}") → template Jalan Aspal Hotmix` };
      } else if (v.includes('rigid') || v.includes('beton')) {
        target = { templateId: 'INFRA-ROAD-RIGID', reason: `perkerasan rigid/beton (jawaban "${specText(pav)}") → template Jalan Beton Semen` };
      } else if (v.includes('paving')) {
        target = { templateId: 'PAV-KOMPLEK-6CM', reason: `perkerasan paving blok (jawaban "${specText(pav)}") → template Paving Block` };
      } else if (v.includes('makadam')) {
        target = { templateId: 'INFRA-ROAD-MACADAM', reason: `perkerasan makadam (jawaban "${specText(pav)}") → template Jalan Lapis Penetrasi Makadam (F.46)` };
      }
      // telford → null (UNAVAILABLE, jangan memaksa RIGID).
    }
  } else if (scope.id === 'pondasi') {
    const fnd = specs.find((s) => s.key === 'building-foundation');
    if (fnd) {
      const v = norm(specText(fnd));
      // Alias eksplisit: 'bore pile' (jawaban) vs 'Bored Pile' (nama
      // template) — bukan substring match. Label gabungan kuesioner
      // 'Bore pile / tiang pancang' mengandung keduanya; alias yang
      // disebut pertama (bore pile) yang dipakai.
      if (v.includes('bore pile') || v.includes('bored pile')) {
        target = { templateId: 'FND-BORED-PILE', reason: `pondasi bore pile (jawaban "${specText(fnd)}") → template Pondasi Bored Pile` };
      } else if (v.includes('tiang pancang')) {
        target = { templateId: 'FND-DRIVEN-PILE', reason: `pondasi tiang pancang (jawaban "${specText(fnd)}") → template Pondasi Tiang Pancang` };
      } else if (v.includes('foot plat') || v.includes('footplat') || v.includes('telapak')) {
        target = { templateId: 'FND-FOOT-PLAT', reason: `pondasi foot plat / telapak (jawaban "${specText(fnd)}") → template Pondasi Foot Plat` };
      }
      // batu kali → null (tak ada template).
    }
  }
  if (!target) return null;
  if (!ranked.some((r) => r.template.id === target!.templateId)) return null;
  return target;
}

/* ------------------------------------------------------------------ */
/* booleanParamOverrides                                               */
/*                                                                     */
/* Satu-satunya param BOOLEAN pada jalur katalog 180 yang dipakai      */
/* universal-draft adalah `has_drainage` (INFRA-ROAD-RIGID,            */
/* rabTemplateService.ts:292, default true). Grep seluruh katalog     */
/* tidak menemukan param BOOLEAN lain pada template jalur ini          */
/* (BOOLEAN lain hanya ada di template engine lama hospital/hotel     */
/* yang tidak dipakai jalur universal-draft) — jadi hanya              */
/* has_drainage yang dipetakan; jangan mengarang boolean lain.         */
/* ------------------------------------------------------------------ */

export function booleanParamOverrides(
  specs: StructuredSpec[]
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  const drainage = specs.find((s) => s.key === 'road-drainage');
  if (drainage) {
    const v = norm(specText(drainage));
    if (v.includes('baru')) out.has_drainage = true;
    else if (v.includes('tanpa') || v.includes('eksisting')) out.has_drainage = false;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* materialStatusForItem                                               */
/* ------------------------------------------------------------------ */

const MATERIAL_FAMILY_TOKENS: Record<
  RequestedMaterial['family'],
  string[]
> = {
  atap: ['standing seam', 'spandek', 'galvalum', 'zincalume', 'genteng', 'asbes', 'upvc', 'dak beton', 'seng'],
  lantai: ['floor hardener', 'hardener', 'paving', 'keramik', 'granit', 'anti-licin', 'beton'],
  pondasi: ['bore pile', 'bored pile', 'tiang pancang', 'foot plat', 'batu kali', 'sumuran'],
  perkerasan: ['hotmix', 'aspal', 'rigid', 'beton', 'paving', 'telford', 'makadam'],
};

/** Keluarga material yang relevan untuk satu scope part. */
function familiesForScope(partScopeId: string): RequestedMaterial['family'][] {
  switch (partScopeId) {
    case 'pertanian':
    case 'gedung':
      return ['atap', 'lantai', 'pondasi'];
    case 'atap':
      return ['atap'];
    case 'pondasi':
      return ['pondasi'];
    case 'jalan':
      return ['perkerasan'];
    case 'finishing':
      return ['lantai'];
    default:
      return ['atap', 'lantai', 'pondasi', 'perkerasan'];
  }
}

function normalizeFamilyToken(
  family: RequestedMaterial['family'],
  token: string
): string {
  if (family === 'pondasi' && token === 'bored pile') return 'bore pile';
  if (family === 'perkerasan' && token === 'aspal') return 'hotmix';
  if (family === 'perkerasan' && token === 'beton') return 'rigid';
  if (family === 'lantai' && token === 'floor hardener') return 'hardener';
  return token;
}

export function materialStatusForItem(
  itemDesc: string,
  specs: StructuredSpec[],
  partScopeId: string
): {
  status: 'MATCHED' | 'SUBSTITUTED' | 'NOT_APPLICABLE';
  requestedMaterial?: string;
  itemMaterial?: string;
} {
  const desc = ` ${norm(itemDesc)} `;
  const families = familiesForScope(partScopeId);
  for (const family of families) {
    const spec = specs.find(
      (s) => requestedMaterialForSpec(s)?.family === family
    );
    if (!spec) continue;
    const requested = requestedMaterialForSpec(spec)!;
    // Rangka (frame) BUKAN penutup — 'Rangka Atap Seng Baja Ringan'
    // membawa token 'seng' tapi materialnya adalah rangka baja,
    // bukan penutup atap yang diminta spek. Menandainya SUBSTITUTED
    // adalah positif-palsu (ditemukan C2 katalog 2026-11-12: frame
    // kandang ikut terhitung padahal penutupnya sudah Galvalum
    // MATCHED). Spek material atap selalu meminta PENUTUP, tidak
    // pernah rangka — jadi item bernama 'rangka' dilewati untuk
    // keluarga ini (NOT_APPLICABLE), apa pun token di namanya.
    if (/\brangka\b/.test(desc)) continue;
    // Token material item: token pertama dari daftar keluarga yang
    // muncul di deskripsi (urutan daftar = prioritas).
    let itemToken: string | null = null;
    for (const tok of MATERIAL_FAMILY_TOKENS[family]) {
      if (desc.includes(tok)) {
        itemToken = normalizeFamilyToken(family, tok);
        break;
      }
    }
    if (!itemToken) continue;
    const req = normalizeFamilyToken(family, requested.material);
    if (req === itemToken) {
      return { status: 'MATCHED', requestedMaterial: req, itemMaterial: itemToken };
    }
    return { status: 'SUBSTITUTED', requestedMaterial: req, itemMaterial: itemToken };
  }
  return { status: 'NOT_APPLICABLE' };
}

/* ------------------------------------------------------------------ */
/* Volume basis — CERMIN klasifikasi parameter (lihat kepala berkas).  */
/*                                                                     */
/* PENDEKATAN (didokumentasikan + batasannya):                         */
/* - Item ↔ komponen dihubungkan lewat NAMA (description item =       */
/*   nama komponen — generateDefaultItemsFromComponents menyalin       */
/*   comp.name ke description; id item adalah `rab-<ts>-<n>` dan      */
/*   TIDAK membawa id komponen, jadi id tidak dapat diandalkan).      */
/* - Bila komponen tidak ditemukan (item donor/revisi), basis =        */
/*   ASSUMPTION dengan alasan eksplisit.                              */
/* - USER_DIMENSION bila ≥1 variabel rumus berasal dari pengguna      */
/*   (nilai spek terukur / boolean override); ASSUMPTION bila rumus   */
/*   hanya memakai default template. Konstanta rumus (mis. ×1,18)     */
/*   bukan parameter dan tidak memengaruhi klasifikasi.                */
/* - QuantitySanityGate TIDAK dipakai: API-nya bekerja pada           */
/*   AiEstimateWorkItem jalur DED (bukan RabItem) dan ambangnya       */
/*   berskala rumah tinggal 1–2 lantai (dinding maks 600 m², plafon   */
/*   maks 300 m²) — akan false-flag volume sah gudang/jalan           */
/*   (slab 5.000 m², paving 600 m², drainase 2.000 m). Sebagai        */
/*   gantinya dipakai aturan ringan di validateDraftChain: volume     */
/*   ASSUMPTION yang tidak tertaut ke dimensi pengguna sama sekali    */
/*   = FLAG (volume yatim, perlu tinjau).                             */
/* ------------------------------------------------------------------ */

/** CERMIN universalRab.classifyParam — jaga tetap sinkron. */
type ParamKind = 'length' | 'span' | 'width' | 'area' | 'thickness' | 'floors' | 'height' | 'volume' | 'count' | 'other';

function classifyParamLocal(key: string, label: string): ParamKind {
  const s = `${key} ${label}`.toLowerCase();
  if (/span|bentang/.test(s)) return 'span';
  if (/length|panjang|lintasan/.test(s)) return 'length';
  if (/width|lebar/.test(s)) return 'width';
  if (/\barea\b|luas/.test(s)) return 'area';
  if (/thickness|tebal/.test(s)) return 'thickness';
  if (/floor|lantai/.test(s)) return 'floors';
  if (/height|tinggi/.test(s)) return 'height';
  if (/volume/.test(s)) return 'volume';
  if (/count|jumlah|num_|sel|unit_count/.test(s)) return 'count';
  return 'other';
}

/** CERMIN universalRab.specValueFor (nilai mentah, tanpa konversi). */
function specValueForKind(
  spec: ChainDraftLike['spec'],
  kind: ParamKind
): number | null {
  switch (kind) {
    case 'length': return spec.lengthM ?? null;
    case 'span': return spec.spanM ?? null;
    case 'width': return spec.widthM ?? null;
    case 'area': return spec.areaM2 ?? null;
    case 'thickness': return spec.thicknessCm ?? null;
    case 'floors': return spec.floors ?? null;
    case 'height': return spec.heightM ?? null;
    case 'volume': return spec.volumeM3 ?? null;
    case 'count': return spec.count ?? null;
    default: return null;
  }
}

/** Kunci parameter template yang nilainya berasal dari pengguna. */
function userProvidedParamKeys(
  spec: ChainDraftLike['spec'],
  template: ChainTemplateLike,
  booleanOverrides: Record<string, boolean>
): Set<string> {
  const out = new Set<string>();
  for (const p of template.parameters ?? []) {
    if (p.type === 'BOOLEAN') {
      if (p.key in booleanOverrides) out.add(p.key);
      continue;
    }
    if (p.type !== 'NUMBER') continue;
    if (specValueForKind(spec, classifyParamLocal(p.key, p.label)) != null) {
      out.add(p.key);
    }
  }
  return out;
}

function dimensionSummary(spec: ChainDraftLike['spec']): string | null {
  if (spec.buildingLengthM != null && spec.buildingWidthM != null && spec.areaM2 != null) {
    return `tapak ${spec.areaM2} m² (${spec.buildingLengthM}×${spec.buildingWidthM} m, jawaban pengguna)`;
  }
  if (spec.areaM2 != null) return `luas ${spec.areaM2} m² (jawaban pengguna)`;
  if (spec.lengthM != null) return `panjang ${spec.lengthM} m (jawaban pengguna)`;
  return null;
}

export interface VolumeBasisItem {
  itemId: string;
  description: string;
  basis: 'USER_DIMENSION' | 'ASSUMPTION';
  basisDetail: string;
}

function itemKeyLocal(it: { description: string; unit: string }): string {
  return `${it.description.trim().toLowerCase()}|${it.unit}`;
}

/** Item efektif draft (cermin universalRab.effectiveItems, lokal). */
function effectiveItemsLocal(draft: ChainDraftLike): Array<ChainDraftItemLike & { __partTemplate: string; __partScope: string }> {
  const out: Array<ChainDraftItemLike & { __partTemplate: string; __partScope: string }> = [];
  for (const part of draft.parts) {
    for (const it of part.generation.items) {
      if (part.removedKeys.includes(itemKeyLocal(it))) continue;
      const manual = part.manualPrices[itemKeyLocal(it)];
      out.push({
        ...it,
        __partScope: part.scope.label,
        __partTemplate: part.template.name,
        ...(manual
          ? { unitPrice: manual.unitPrice, priceStatus: 'PRICE_MANUAL' as const }
          : {}),
      });
    }
  }
  return out;
}

export function computeVolumeBasis(
  draft: ChainDraftLike,
  specs: StructuredSpec[]
): VolumeBasisItem[] {
  const overrides = booleanParamOverrides(specs);
  const out: VolumeBasisItem[] = [];
  for (const part of draft.parts) {
    // GATE 2 (5B): part gedung memakai speknya sendiri — basis volume
    // ditelusur dari dimensi gedung ITU, bukan spek proyek (spek proyek
    // membawa data gedung pertama). Single: part.spec absen → identik.
    const partSpec = part.spec ?? draft.spec;
    const dimSum = dimensionSummary(partSpec);
    const userKeys = userProvidedParamKeys(partSpec, part.template, overrides);
    const traceById = new Map(
      (part.generation.traceability ?? []).map((t) => [t.itemId, t.calculationTrace])
    );
    for (const item of part.generation.items) {
      if (part.removedKeys.includes(itemKeyLocal(item))) continue;
      const comp = (part.template.components ?? []).find((c) => c.name === item.description);
      if (!comp) {
        const trace = traceById.get(item.id);
        out.push({
          itemId: item.id,
          description: item.description,
          basis: 'ASSUMPTION',
          basisDetail: trace
            ? `komponen template tidak ditemukan untuk item ini (item donor/revisi) — rumus tidak dapat ditelusur dari komponen; jejak: ${trace}`
            : 'komponen template tidak ditemukan untuk item ini (item donor/revisi) — basis tidak dapat ditelusur',
        });
        continue;
      }
      const vars = comp.variables ?? [];
      const userVars = vars.filter((v) => userKeys.has(v));
      const defaultVars = vars.filter((v) => !userKeys.has(v));
      if (userVars.length > 0) {
        const parts: string[] = [];
        for (const v of userVars) {
          parts.push(`${v}=${String(part.evaluatedParams[v] ?? '?')} (pengguna)`);
        }
        if (defaultVars.length > 0) {
          parts.push(`+ default: ${defaultVars.map((v) => `${v}=${String(part.evaluatedParams[v] ?? '?')}`).join(', ')}`);
        }
        out.push({
          itemId: item.id,
          description: item.description,
          basis: 'USER_DIMENSION',
          basisDetail: `Rumus ${comp.calculationRule}${dimSum && userVars.some((v) => /area|length|width/.test(v)) ? ` — ${dimSum}` : ''} — ${parts.join('; ')}`,
        });
      } else {
        out.push({
          itemId: item.id,
          description: item.description,
          basis: 'ASSUMPTION',
          basisDetail: vars.length > 0
            ? `Rumus ${comp.calculationRule} — hanya memakai default template: ${vars.map((v) => `${v}=${String(part.evaluatedParams[v] ?? '?')}`).join(', ')}`
            : `Rumus ${comp.calculationRule} — konstanta template (tanpa parameter pengguna)`,
        });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* traceItemReasons — ALASAN TERTELUSUR per komponen (GATE 5 / 5E)     */
/*                                                                     */
/* Setiap komponen RAB harus punya alasan yang dapat ditelusur ke      */
/* salah satu sumber: spek/dimensi pengguna, ekstraksi DED             */
/* terkonfirmasi, persyaratan template resmi tervalidasi, atau         */
/* asumsi berlabel eksplisit. Fungsi ini mengklasifikasi tiap item     */
/* efektif draft ke SATU asal (prioritas: DED > SPEK_USER >            */
/* TEMPLATE; UNRESOLVED bila tak satu pun jejak ditemukan) + basis     */
/* volume (dari computeVolumeBasis) + basis harga (cermin              */
/* displayPriceStatus universalRab). Tidak mengarang alasan: item      */
/* donor/revisi yang komponen templatenya tidak ditemukan dan tidak    */
/* tertaut spek/DED dinyatakan UNRESOLVED, bukan diberi alasan         */
/* template.                                                           */
/*                                                                     */
/* `dedItemNames` = deskripsi item DED terkonfirmasi (dari             */
/* draft.dedQto.checks, dinormalisasi pemanggil) — pencocokan nama    */
/* adalah tautan yang tersedia; DED tanpa nama yang sama tidak         */
/* diklaim menautkan item draft.                                       */
/* ------------------------------------------------------------------ */

export type ItemReasonSource = 'SPEK_USER' | 'DED' | 'TEMPLATE' | 'UNRESOLVED';
export type ItemPriceBasis =
  | 'AHSP_RESMI'
  | 'DATABASE'
  | 'REFERENSI_PASAR'
  | 'MANUAL'
  | 'BELUM_TERSEDIA';

export interface ItemReason {
  itemId: string;
  description: string;
  partScope: string;
  partTemplate: string;
  source: ItemReasonSource;
  /** Penjelasan satu baris yang dapat dibaca pengguna. */
  detail: string;
  volumeBasis: 'USER_DIMENSION' | 'ASSUMPTION';
  priceBasis: ItemPriceBasis;
}

export interface ItemReasonTrace {
  items: ItemReason[];
  counts: {
    total: number;
    spekUser: number;
    ded: number;
    template: number;
    unresolved: number;
    assumptionVolume: number;
    unpriced: number;
  };
}

function priceBasisForItem(it: ChainDraftItemLike): ItemPriceBasis {
  if (it.priceStatus === 'PRICE_UNRESOLVED' || it.unitPrice == null) return 'BELUM_TERSEDIA';
  if (it.priceStatus === 'PRICE_MANUAL') return 'MANUAL';
  if (it.priceSourceKind === 'OFFICIAL_AHSP') return 'AHSP_RESMI';
  if (it.priceSourceKind === 'MARKET_REFERENCE') return 'REFERENSI_PASAR';
  return 'DATABASE';
}

export function traceItemReasons(
  draft: ChainDraftLike,
  specs: StructuredSpec[],
  dedItemNames?: string[],
): ItemReasonTrace {
  const items = effectiveItemsLocal(draft);
  const basisById = new Map(
    computeVolumeBasis(draft, specs).map((b) => [b.itemId, b]),
  );
  const dedNames = new Set((dedItemNames ?? []).map((n) => norm(n)));
  const out: ItemReason[] = [];
  for (const part of draft.parts) {
    for (const it of part.generation.items) {
      if (part.removedKeys.includes(itemKeyLocal(it))) continue;
      const eff = items.find((e) => e.id === it.id) ?? it;
      const basis = basisById.get(it.id);
      const volumeBasis = basis?.basis ?? 'ASSUMPTION';
      const comp = (part.template.components ?? []).find((c) => c.name === it.description);
      const dedLinked = dedNames.has(norm(it.description));
      const mat = materialStatusForItem(it.description, specs, part.scope.id);
      const specLinked = mat.status === 'MATCHED' || volumeBasis === 'USER_DIMENSION';
      let source: ItemReasonSource;
      let detail: string;
      if (!comp && !dedLinked && !specLinked) {
        source = 'UNRESOLVED';
        detail = 'komponen template tidak ditemukan untuk item ini (item donor/revisi) dan tidak tertaut spek maupun DED — alasan tidak dapat ditelusur';
      } else if (dedLinked) {
        source = 'DED';
        detail = `nama item sama dengan item DED terkonfirmasi${comp ? `; komponen template "${part.template.name}"` : ''}`;
      } else if (specLinked) {
        source = 'SPEK_USER';
        detail = mat.status === 'MATCHED'
          ? `material ${mat.itemMaterial} sesuai spek pengguna (${mat.requestedMaterial})`
          : (basis?.basisDetail ?? 'volume dari dimensi pengguna');
      } else {
        source = 'TEMPLATE';
        detail = `komponen template resmi "${part.template.name}" (tanpa spek khusus dari pengguna)`;
      }
      if (volumeBasis === 'ASSUMPTION' && source !== 'UNRESOLVED') {
        detail += '; volume dari default template (asumsi berlabel)';
      }
      out.push({
        itemId: it.id,
        description: it.description,
        partScope: part.scope.label,
        partTemplate: part.template.name,
        source,
        detail,
        volumeBasis,
        priceBasis: priceBasisForItem(eff),
      });
    }
  }
  const counts = {
    total: out.length,
    spekUser: out.filter((r) => r.source === 'SPEK_USER').length,
    ded: out.filter((r) => r.source === 'DED').length,
    template: out.filter((r) => r.source === 'TEMPLATE').length,
    unresolved: out.filter((r) => r.source === 'UNRESOLVED').length,
    assumptionVolume: out.filter((r) => r.volumeBasis === 'ASSUMPTION').length,
    unpriced: out.filter((r) => r.priceBasis === 'BELUM_TERSEDIA').length,
  };
  return { items: out, counts };
}

/**
 * Ringkasan ringkas alasan komponen untuk pesan draft (1–3 baris).
 * `hasChainValidation` = true bila seksi validasi rantai sudah merender
 * baris volume-asumsi sendiri (hindari duplikasi baris itu).
 */
export function formatItemReasonSummary(
  trace: ItemReasonTrace,
  hasChainValidation: boolean,
): string[] {
  const c = trace.counts;
  if (c.total === 0) return [];
  const segments: string[] = [];
  if (c.spekUser > 0) segments.push(`${c.spekUser} dari spek/dimensi Anda`);
  if (c.ded > 0) segments.push(`${c.ded} terkonfirmasi DED`);
  if (c.template > 0) segments.push(`${c.template} dari template resmi (tanpa spek khusus)`);
  if (c.unresolved > 0) segments.push(`${c.unresolved} tanpa alasan tertelusur`);
  const lines: string[] = [
    `**Alasan komponen:** ${c.total} item — ${segments.join(' · ')}.`,
  ];
  if (c.unresolved > 0) {
    const names = trace.items
      .filter((r) => r.source === 'UNRESOLVED')
      .map((r) => `"${r.description}"`);
    lines.push(
      `• Item tanpa alasan tertelusur (${c.unresolved}): ${names.slice(0, 3).join('; ')}${names.length > 3 ? ` (+${names.length - 3} lainnya)` : ''} — bukan dari spek, DED, maupun komponen template; periksa sebelum transfer.`,
    );
  }
  if (!hasChainValidation && c.assumptionVolume > 0) {
    lines.push(
      `• Volume berbasis asumsi default template: ${c.assumptionVolume} item — volumenya memakai default template, bukan dimensi Anda; revisi bila ukurannya berbeda.`,
    );
  }
  return lines;
}

/* ------------------------------------------------------------------ */
/* validateDraftChain                                                  */
/* ------------------------------------------------------------------ */

export interface ChainValidation {
  specCoverage: Array<{
    key: string;
    label: string;
    status: 'USED' | 'UNUSED' | 'SKIPPED';
    usedBy: string[];
    reason?: string;
  }>;
  itemLinks: VolumeBasisItem[];
  volumeChecks: Array<{
    itemId: string;
    description: string;
    verdict: 'OK' | 'FLAG';
    detail: string;
  }>;
  priceChecks: { resolved: number; unresolved: number; substituted: number };
  budget: {
    cap: number | null;
    total: number;
    verdict: 'UNDER' | 'OVER' | 'CANNOT_ASSESS' | 'NO_BUDGET';
    diff: number | null;
  };
  ambiguousPicks: Array<{
    scope: string;
    chosen: string;
    candidates: string[];
    reason: string;
  }>;
  foreignItems: string[];
  materialMismatches: Array<{ item: string; requested: string; actual: string }>;
}

/** Alasan UNUSED per kunci yang dikenal (audit Fase 1 §10). */
const UNUSED_REASONS: Record<string, string> = {
  'kandang-type': 'tipe kandang (terbuka/tertutup) tidak mengubah template/item — hanya penanda tipe',
  'kandang-facilities': 'fasilitas tidak memetakan ke item draft PROFESSIONAL (palung & bak penampungan = komponen COMPREHENSIVE yang terbuang; sekat tidak ada komponennya di katalog)',
  'kandang-manure': 'pengelolaan kotoran tidak memetakan ke item draft (bak penampungan = komponen COMPREHENSIVE yang tidak muncul di PROFESSIONAL; saluran = frasa yang disanitasi)',
  'warehouse-loading': 'tidak ada pemetaan ke parameter num_docks — item dock tetap hadir dari default template (8 pintu) apa pun jawabannya',
  'road-traffic': 'kelas lalu lintas tidak memiliki parameter pada template jalan mana pun',
  'road-subgrade': 'kondisi tanah dasar tidak mengubah item subgrade (tetap "CBR Min 6%")',
  'building-finish-grade': 'grade finishing tidak mengubah template/item/harga pada jalur ini',
  'building-mep-scope': 'tidak ada pemetaan deterministik ke part MEP pada jalur ini (opsi AC & fire protection bahkan tidak memicu scope MEP lewat teks)',
  'building-bedrooms': 'tidak ada parameter kamar tidur pada template apartemen',
  'drainage-material': 'tidak ada pemetaan deterministik material saluran → item pada jalur ini',
  'drainage-flow': 'arah aliran & tujuan buang tidak memetakan ke item/volume',
  'drainage-cover': 'penutup saluran tidak memetakan ke item pada jalur ini',
  'pool-type': 'tipe sirkulasi kolam tidak memetakan ke item draft (skimmer/semi-overflow tidak ada di katalog)',
  'pool-finish': 'finishing kolam tidak memetakan ke item draft pada jalur ini',
  'pool-deck': 'deck kolam tidak memetakan ke item draft pada jalur ini',
  'landscape-vegetation': 'vegetasi tidak memetakan ke item draft pada jalur ini',
  'landscape-irrigation': 'irigasi lanskap tidak memetakan ke item draft pada jalur ini',
  'landscape-lighting': 'pencahayaan lanskap tidak memetakan ke item draft pada jalur ini',
  'renovation-condition': 'kondisi renovasi tidak memetakan ke item draft pada jalur ini',
  'renovation-finish-grade': 'grade finishing renovasi tidak mengubah template/item/harga',
  'renovation-mep': 'cakupan MEP renovasi tidak memetakan ke item draft pada jalur ini',
  'new-construction': 'penanda pembangunan baru — tidak ada pemetaan ke item',
};

function isPriceValidLocal(it: ChainDraftItemLike): boolean {
  if (it.priceStatus === 'PRICE_UNRESOLVED') return false;
  return it.unitPrice != null && Number.isFinite(it.unitPrice);
}

export function validateDraftChain(
  draft: ChainDraftLike,
  specs: StructuredSpec[]
): ChainValidation {
  const items = effectiveItemsLocal(draft);
  const overrides = booleanParamOverrides(specs);
  const suppressed = suppressedScopes(specs, familyIdFromSpecs(specs));

  /* ---- cakupan spek ---- */
  const specCoverage: ChainValidation['specCoverage'] = [];
  for (const spec of specs) {
    const label = spec.label || spec.key;
    // (0) Tanpa nilai → SKIPPED (tidak dijawab).
    if (spec.value == null || (typeof spec.value === 'string' && spec.value.trim() === '')) {
      specCoverage.push({ key: spec.key, label, status: 'SKIPPED', usedBy: [], reason: 'tidak ada nilai (tidak dijawab)' });
      continue;
    }
    // (1) Budget → USED sbg cap perbandingan.
    if (spec.key === 'budget') {
      const cap = specNumber(spec);
      if (cap != null) {
        specCoverage.push({ key: spec.key, label, status: 'USED', usedBy: [`perbandingan anggaran (cap ${formatRupiahId(cap)})`] });
      } else {
        specCoverage.push({ key: spec.key, label, status: 'SKIPPED', usedBy: [], reason: 'nilai anggaran tidak dapat dibaca' });
      }
      continue;
    }
    // (2) Belum ditentukan → UNUSED (bukan SKIPPED: jawabannya ada,
    //     tapi tidak memetakan ke apa pun).
    if (isUndecided(spec)) {
      specCoverage.push({
        key: spec.key, label, status: 'UNUSED', usedBy: [],
        reason: `jawaban belum ditentukan ("${specText(spec)}", status ${spec.status}) — tidak ada pemetaan ke item katalog`,
      });
      continue;
    }
    const usedBy: string[] = [];
    // (3) Material → MATCHED/SUBSTITUTED pada ≥1 item, atau pick
    //     deterministik dari spek itu.
    const req = requestedMaterialForSpec(spec);
    if (req) {
      for (const part of draft.parts) {
        for (const it of part.generation.items) {
          if (part.removedKeys.includes(itemKeyLocal(it))) continue;
          const st = materialStatusForItem(it.description, [spec], part.scope.id);
          if (st.status === 'MATCHED') {
            usedBy.push(`item "${it.description}" (${part.template.id}) memakai ${st.itemMaterial} sesuai permintaan`);
          } else if (st.status === 'SUBSTITUTED') {
            usedBy.push(`item "${it.description}" (${part.template.id}) — diminta ${st.requestedMaterial}, item memakai ${st.itemMaterial} (NEEDS_MANUAL_PRICE)`);
          }
        }
      }
      // Pick deterministik dari spek ini (mis. Genteng → ROOF-TILE-PREMIUM).
      for (const part of draft.parts) {
        const det = resolveDeterministicPick(
          part.scope, [spec],
          [{ template: { id: part.template.id, name: part.template.name }, score: 0 }]
        );
        if (det && det.templateId === part.template.id) {
          usedBy.push(`template "${part.template.name}" dipilih deterministik dari spek ini`);
        }
      }
      if (usedBy.length > 0) {
        specCoverage.push({ key: spec.key, label, status: 'USED', usedBy });
        continue;
      }
      const binding = lookupMaterialBinding(req.bindingFamily, req.material);
      specCoverage.push({
        key: spec.key, label, status: 'UNUSED', usedBy: [],
        reason: binding === 'UNAVAILABLE'
          ? `material ${req.material} tidak tersedia di katalog (${req.bindingFamily}) — tidak ada item yang memakainya; lihat materialMismatches`
          : binding === 'UNVERIFIED'
            ? `material ${req.material} belum terverifikasi ketersediaannya di katalog (${req.bindingFamily}) — tidak ada item yang terpetakan`
            : `material ${req.material} tersedia di katalog tapi tidak ada item draft ini yang memakainya`,
      });
      continue;
    }
    // (4) Count/dimensi → parameter yang nilainya sama dengan spek.
    if (spec.kind === 'count' || spec.kind === 'dimension') {
      const num = specNumber(spec);
      if (num != null) {
        for (const part of draft.parts) {
          for (const p of part.template.parameters ?? []) {
            if (p.type !== 'NUMBER') continue;
            const kind = classifyParamLocal(p.key, p.label);
            if (spec.kind === 'count' && kind !== 'count') continue;
            if (spec.kind === 'dimension' && !['area', 'length', 'width', 'span', 'height', 'volume', 'thickness'].includes(kind)) continue;
            const v = part.evaluatedParams[p.key];
            if (typeof v === 'number' && Math.abs(v - num) < 0.01) {
              usedBy.push(`parameter ${p.key}=${v} (${part.template.id})`);
            }
          }
        }
        // Dimensi juga terpakai bila sama dengan dimensi draft.
        if (spec.kind === 'dimension' && usedBy.length === 0) {
          const dims: Array<[string, number | null | undefined]> = [
            ['luas', draft.spec.areaM2], ['panjang', draft.spec.lengthM],
            ['lebar', draft.spec.widthM], ['bentang', draft.spec.spanM],
            ['tinggi', draft.spec.heightM], ['volume', draft.spec.volumeM3],
            ['tebal (cm)', draft.spec.thicknessCm],
          ];
          for (const [name, v] of dims) {
            if (v != null && Math.abs(v - num) < 0.01) usedBy.push(`dimensi draft: ${name} ${v}`);
          }
        }
        if (usedBy.length > 0) {
          specCoverage.push({ key: spec.key, label, status: 'USED', usedBy });
          continue;
        }
      }
      specCoverage.push({
        key: spec.key, label, status: 'UNUSED', usedBy: [],
        reason: spec.kind === 'count'
          ? `nilai ${num} tidak mengubah parameter apa pun — parameter terkait memakai default template`
          : `dimensi ${num} tidak dipakai parameter draft mana pun`,
      });
      continue;
    }
    // (5) Scope → suppression yang benar karena spek itu, atau
    //     boolean override yang diterapkan.
    if (spec.key === 'road-drainage') {
      const v = norm(specText(spec));
      if ((v.includes('tanpa') || v.includes('eksisting')) && suppressed.has('drainase')) {
        specCoverage.push({
          key: spec.key, label, status: 'USED',
          usedBy: ['penekanan scope drainase (tidak dibangun part drainase baru)'],
        });
        continue;
      }
      for (const part of draft.parts) {
        const hv = part.evaluatedParams.has_drainage;
        if (typeof hv === 'boolean' && hv === overrides.has_drainage) {
          usedBy.push(`parameter has_drainage=${hv} (${part.template.id})`);
        }
      }
      if (usedBy.length > 0) {
        specCoverage.push({ key: spec.key, label, status: 'USED', usedBy });
        continue;
      }
    }
    // (6) Default: UNUSED dengan alasan per kunci / generik.
    specCoverage.push({
      key: spec.key, label, status: 'UNUSED', usedBy: [],
      reason: UNUSED_REASONS[spec.key] ?? 'tidak ada pemetaan deterministik spek→item pada jalur ini',
    });
  }

  /* ---- basis volume + pemeriksaan volume ---- */
  const itemLinks = computeVolumeBasis(draft, specs);
  const userDimsPresent: string[] = [];
  if (draft.spec.areaM2 != null) userDimsPresent.push(`luas ${draft.spec.areaM2} m²`);
  if (draft.spec.lengthM != null) userDimsPresent.push(`panjang ${draft.spec.lengthM} m`);
  if (draft.spec.widthM != null) userDimsPresent.push(`lebar ${draft.spec.widthM} m`);
  const volumeChecks: ChainValidation['volumeChecks'] = itemLinks.map((link) => {
    if (link.basis === 'USER_DIMENSION') {
      return { itemId: link.itemId, description: link.description, verdict: 'OK' as const, detail: link.basisDetail };
    }
    return {
      itemId: link.itemId,
      description: link.description,
      verdict: 'FLAG' as const,
      detail: userDimsPresent.length > 0
        ? `${link.basisDetail} — volume yatim: dimensi pengguna tersedia (${userDimsPresent.join(', ')}) tapi tidak dipakai rumus ini`
        : `${link.basisDetail} — volume tidak tertaut ke dimensi pengguna sama sekali`,
    };
  });

  /* ---- harga ---- */
  let resolved = 0;
  let unresolved = 0;
  let substituted = 0;
  const materialMismatches: ChainValidation['materialMismatches'] = [];
  for (const part of draft.parts) {
    for (const it of part.generation.items) {
      if (part.removedKeys.includes(itemKeyLocal(it))) continue;
      const eff = items.find((e) => e.id === it.id) ?? it;
      if (isPriceValidLocal(eff)) resolved++;
      else unresolved++;
      const st = materialStatusForItem(it.description, specs, part.scope.id);
      if (st.status === 'SUBSTITUTED') {
        substituted++;
        materialMismatches.push({
          item: it.description,
          requested: st.requestedMaterial ?? '?',
          actual: st.itemMaterial ?? '?',
        });
      }
    }
  }

  /* ---- anggaran ---- */
  const budgetSpec = specs.find((s) => s.key === 'budget');
  const cap = budgetSpec ? specNumber(budgetSpec) : (draft.spec.budgetCap ?? null);
  let total = 0;
  let pricedCount = 0;
  for (const it of items) {
    if (isPriceValidLocal(it)) {
      total += it.volume * (it.unitPrice as number);
      pricedCount++;
    }
  }
  total = Math.round(total * 100) / 100;
  let verdict: ChainValidation['budget']['verdict'];
  let diff: number | null = null;
  if (cap == null) {
    verdict = 'NO_BUDGET';
  } else if (items.length > 0 && pricedCount === 0) {
    verdict = 'CANNOT_ASSESS';
    diff = null;
  } else {
    diff = Math.round((total - cap) * 100) / 100;
    verdict = total > cap ? 'OVER' : 'UNDER';
  }

  /* ---- pilihan ambigu ---- */
  const ambiguousPicks: ChainValidation['ambiguousPicks'] = [...(draft.ambiguousPicks ?? [])];
  // Lengkapi kasus UNAVAILABLE yang belum tercatat (mis. draft yang
  // dibangun tanpa loop AMBIGUOUS_PICK).
  for (const part of draft.parts) {
    const mspec = materialSpecForScope(specs, part.scope.id);
    if (!mspec) continue;
    const req = requestedMaterialForSpec(mspec);
    if (!req) continue;
    if (lookupMaterialBinding(req.bindingFamily, req.material) !== 'UNAVAILABLE') continue;
    if (ambiguousPicks.some((a) => a.scope === part.scope.id)) continue;
    ambiguousPicks.push({
      scope: part.scope.id,
      chosen: part.template.id,
      candidates: [part.template.name],
      reason: `material yang diminta (${req.material}) tidak tersedia di katalog — template "${part.template.name}" dipakai dari penskoran teks, bukan pilihan material; butuh harga manual/konfirmasi (NEEDS_MANUAL_PRICE)`,
    });
  }

  /* ---- item asing ---- */
  const foreignItems: string[] = [];
  const familyProjectId = familyIdFromSpecs(specs);
  if (familyProjectId) {
    const explicitScopes = draft.parts.map((p) => p.scope.id);
    for (const it of items) {
      const v = classifyItemRelevance(it.description, familyProjectId, explicitScopes);
      if (v.level === 'LOW' || v.level === 'REJECTED') {
        foreignItems.push(it.description);
      }
    }
  }

  return {
    specCoverage,
    itemLinks,
    volumeChecks,
    priceChecks: { resolved, unresolved, substituted },
    budget: { cap, total, verdict, diff },
    ambiguousPicks,
    foreignItems,
    materialMismatches,
  };
}

/* ------------------------------------------------------------------ */
/* P3D (FULL REPAIR 2026-11-13) — WBS eksplisit + kelengkapan spek    */
/*                                                                     */
/* Lapisan VALIDASI di atas `validateDraftChain` (yang TIDAK diubah    */
/* bentuknya — suite lama tidak tersentuh): artefak WBS dibangun dari  */
/* draft + spek (`buildWbsForDraft`), tiap item ditelusur ke spek      */
/* sumbernya (`traceItemSpecs`), lalu `validateWbsCompleteness`        */
/* memeriksa: tiap node WBS punya ≥1 item ATAU pengecualian eksplisit; */
/* field wajib hilang; duplikat; konflik spek. Status LENGKAP hanya    */
/* bila SEMUA cek lolos — draft tak lengkap TIDAK PERNAH berlabel      */
/* "lengkap"/"terverifikasi" (`isVerified` false). Pesan berbahasa     */
/* Indonesia, menyebut item + field + apa yang harus dilengkapi.       */
/*                                                                     */
/* Semua fungsi memakai `latestSpecsByKey` (revisi menambahkan entri   */
/* baru; entri terakhir menang) — KECUALI `detectSpecConflicts` yang   */
/* sengaja memakai array mentah (konflik HIDUP di entri ganda).        */
/* ------------------------------------------------------------------ */

/**
 * Bangun artefak WBS untuk satu draft (adaptor tipis di atas
 * `buildWbsArtifact`: memetakan part draft → `WbsPartInput` dengan ID
 * item FINAL `templateId::id` — skema yang SAMA dengan
 * `effectiveItems` universalRab — dan menghitung supresi dari spek
 * bila pemanggil tidak memberikannya. `subcategoryId` default =
 * familyId spek (`conceptualWbsFor` mengembalikan null untuk id yang
 * tak punya WBS konseptual — aman).
 */
export function buildWbsForDraft(
  draft: ChainDraftLike,
  specs: StructuredSpec[],
  opts?: {
    subcategoryId?: string | null;
    familyId?: string | null;
    suppressedScopeIds?: string[];
    previousArtifact?: WbsArtifact | null;
  },
): WbsArtifact {
  const parts: WbsPartInput[] = draft.parts.map((part) => ({
    scopeId: part.scope.id,
    scopeLabel: part.scope.label,
    templateId: part.template.id,
    templateName: part.template.name,
    items: part.generation.items
      .filter((it) => !part.removedKeys.includes(itemKeyLocal(it)))
      .map((it) => ({ id: `${part.template.id}::${it.id}`, description: it.description, unit: it.unit })),
  }));
  const familyId = opts?.familyId ?? familyIdFromSpecs(specs);
  const input: BuildWbsArtifactInput = {
    specs,
    parts,
    familyId,
    subcategoryId: opts?.subcategoryId ?? familyId,
    suppressedScopeIds:
      opts?.suppressedScopeIds ?? [...suppressedScopes(specs, familyId)],
    previousArtifact: opts?.previousArtifact ?? null,
  };
  return buildWbsArtifact(input);
}

/* ------------------------------------------------------------------ */
/* traceItemSpecs — spek → item → volume → AHSP/harga → biaya          */
/*                                                                     */
/* Satu baris per item efektif: kunci spek SUMBER (material yang       */
/* cocok/diganti + dimensi/jumlah yang dipakai parameternya — aturan   */
/* yang SAMA dengan `validateDraftChain` butir (3)/(4), bukan aturan   */
/* kedua), status spek TERBURUK di antaranya (UNRESOLVED > ASSUMPTION  */
/* > RECOMMENDATION > CONFIRMED), basis volume (dari                  */
/* `computeVolumeBasis`), basis harga (dari `priceBasisForItem`), dan  */
/* ID node WBS (`wbs:<scopeId>`). Item tanpa tautan spek JUJUR         */
/* dicatat `traceSource: 'TEMPLATE'` + `specKeys: []` — TIDAK         */
/* dikarang tautannya. Biaya per item = volume × unitPrice (efektif)   */
/* dan dibaca pemanggil dari itemnya, bukan dihitung ulang di sini.    */
/* ------------------------------------------------------------------ */

export interface ItemSpecTrace {
  /** ID efektif (`templateId::id` — sama seperti `effectiveItems`). */
  itemId: string;
  description: string;
  partScope: string;
  partTemplate: string;
  /** Kunci spek sumber (kosong = murni dari template). */
  specKeys: string[];
  /** Status spek terburuk di antara specKeys (null bila tak ada). */
  specStatus: SpecStatus | null;
  /** 'SPESIFIK' bila ≥1 spek tertaut, 'TEMPLATE' bila tidak ada. */
  traceSource: 'SPESIFIK' | 'TEMPLATE';
  volumeBasis: 'USER_DIMENSION' | 'ASSUMPTION';
  priceBasis: ItemPriceBasis;
  /** ID node WBS pemilik item ini (`wbs:<scopeId>`). */
  wbsNodeId: string;
}

const SPEC_STATUS_RANK: Record<SpecStatus, number> = {
  UNRESOLVED: 0,
  ASSUMPTION: 1,
  RECOMMENDATION: 2,
  CONFIRMED: 3,
};

export function worstSpecStatus(specs: StructuredSpec[]): SpecStatus | null {
  if (specs.length === 0) return null;
  let worst = specs[0];
  for (const s of specs) {
    if (SPEC_STATUS_RANK[s.status] < SPEC_STATUS_RANK[worst.status]) worst = s;
  }
  return worst.status;
}

export function traceItemSpecs(
  draft: ChainDraftLike,
  specs: StructuredSpec[],
): ItemSpecTrace[] {
  const latest = latestSpecsByKey(specs);
  const basisById = new Map(
    computeVolumeBasis(draft, latest).map((b) => [b.itemId, b]),
  );
  const out: ItemSpecTrace[] = [];
  for (const part of draft.parts) {
    // GATE 2 (5B): part gedung memakai speknya sendiri (pola yang
    // sama dengan computeVolumeBasis).
    const partSpec = part.spec ?? draft.spec;
    for (const it of part.generation.items) {
      if (part.removedKeys.includes(itemKeyLocal(it))) continue;
      const linked: StructuredSpec[] = [];
      for (const s of latest) {
        // (a) Spek material: MATCHED/SUBSTITUTED pada item ini.
        if (requestedMaterialForSpec(s)) {
          const st = materialStatusForItem(it.description, [s], part.scope.id);
          if (st.status === 'MATCHED' || st.status === 'SUBSTITUTED') {
            linked.push(s);
            continue;
          }
        }
        // (b) Spek dimensi/jumlah: nilainya dipakai parameter part ini
        // atau sama dengan dimensi draft (aturan validateDraftChain (4)).
        if (s.kind === 'count' || s.kind === 'dimension') {
          const num = specNumber(s);
          if (num == null) continue;
          let used = false;
          for (const p of part.template.parameters ?? []) {
            if (p.type !== 'NUMBER') continue;
            const kind = classifyParamLocal(p.key, p.label);
            if (s.kind === 'count' && kind !== 'count') continue;
            if (s.kind === 'dimension' && !['area', 'length', 'width', 'span', 'height', 'volume', 'thickness'].includes(kind)) continue;
            const v = part.evaluatedParams[p.key];
            if (typeof v === 'number' && Math.abs(v - num) < 0.01) { used = true; break; }
          }
          if (!used && s.kind === 'dimension') {
            const dims: Array<number | null | undefined> = [
              partSpec.areaM2, partSpec.lengthM, partSpec.widthM,
              partSpec.spanM, partSpec.heightM, partSpec.volumeM3,
              partSpec.thicknessCm,
            ];
            used = dims.some((v) => v != null && Math.abs(v - num) < 0.01);
          }
          if (used) linked.push(s);
        }
      }
      const manual = part.manualPrices[itemKeyLocal(it)];
      const eff: ChainDraftItemLike = manual
        ? { ...it, unitPrice: manual.unitPrice, priceStatus: 'PRICE_MANUAL' }
        : it;
      const basis = basisById.get(it.id);
      out.push({
        itemId: `${part.template.id}::${it.id}`,
        description: it.description,
        partScope: part.scope.label,
        partTemplate: part.template.name,
        specKeys: linked.map((s) => s.key),
        specStatus: worstSpecStatus(linked),
        traceSource: linked.length > 0 ? 'SPESIFIK' : 'TEMPLATE',
        volumeBasis: basis?.basis ?? 'ASSUMPTION',
        priceBasis: priceBasisForItem(eff),
        wbsNodeId: wbsNodeId(part.scope.id),
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* detectMissingRequiredSpecs — field wajib hilang (ditampilkan       */
/* sebagai hilang, TIDAK PERNAH diisi diam-diam).                      */
/*                                                                     */
/* "Wajib" = yang memengaruhi item/volume/harga — DUA sumber, keduanya */
/* berasal dari data yang ADA (bukan aturan karangan):                 */
/* (a) parameter NUMBER template yang jenisnya berdimensi (panjang/    */
/*     lebar/luas/tebal/lantai/tinggi/volume/jumlah) DAN nilainya      */
/*     tidak berasal dari pengguna (specValueForKind null) DAN         */
/*     template tidak punya defaultValue — tanpa ketiganya, volume     */
/*     item pemakai parameter itu tidak punya dasar sama sekali;       */
/* (b) spek yang SUDAH ADA tapi belum terjawab (UNRESOLVED / tanpa     */
/*     nilai) dan memengaruhi draft: spek material (MATERIAL_SPEC_MAP) */
/*     + spek dimensi/jumlah + road-drainage (mengubah has_drainage).  */
/*     Spek scope/kualitas/kondisi lain yang dilewati TIDAK masuk      */
/*     sini (hanya tercatat di `unresolvedSpecKeys` laporan) —         */
/*     dilewatinya pertanyaan opsional bukan field wajib hilang.       */
/* ------------------------------------------------------------------ */

export interface MissingRequiredField {
  scopeId: string;
  scopeLabel: string;
  templateId: string;
  templateName: string;
  /** Nama field yang hilang (label parameter / label spek). */
  field: string;
  specKey?: string;
  /** Item yang volumenya memakai field ini (maks 3 nama). */
  items: string[];
  message: string;
}

export function detectMissingRequiredSpecs(
  draft: ChainDraftLike,
  specs: StructuredSpec[],
): MissingRequiredField[] {
  const latest = latestSpecsByKey(specs);
  const out: MissingRequiredField[] = [];

  /* (a) Parameter template tanpa nilai pengguna dan tanpa default. */
  for (const part of draft.parts) {
    const partSpec = part.spec ?? draft.spec;
    const effective = part.generation.items.filter(
      (it) => !part.removedKeys.includes(itemKeyLocal(it)),
    );
    for (const p of part.template.parameters ?? []) {
      if (p.type !== 'NUMBER') continue;
      const kind = classifyParamLocal(p.key, p.label);
      if (kind === 'other') continue;
      if (specValueForKind(partSpec, kind) != null) continue;
      if (p.defaultValue != null) continue;
      const affected = (part.template.components ?? [])
        .filter((c) => (c.variables ?? []).includes(p.key))
        .map((c) => c.name)
        .filter((name) => effective.some((it) => it.description === name));
      const shown = affected.slice(0, 3);
      out.push({
        scopeId: part.scope.id,
        scopeLabel: part.scope.label,
        templateId: part.template.id,
        templateName: part.template.name,
        field: p.label || p.key,
        items: shown,
        message:
          `Template "${part.template.name}" (paket ${part.scope.label}) membutuhkan "${p.label || p.key}" — ` +
          `nilainya belum ada dari jawaban Anda dan template tidak punya nilai default` +
          (shown.length > 0
            ? `; volume item ${shown.map((n) => `"${n}"`).join(', ')}${affected.length > 3 ? ` (+${affected.length - 3} lainnya)` : ''} tidak punya dasar. Lengkapi dimensi ini sebelum transfer.`
            : `. Lengkapi dimensi ini sebelum transfer.`),
      });
    }
  }

  /* (b) Spek berpengaruh yang sudah ada tapi belum terjawab. */
  for (const s of latest) {
    if (!isSpecUnresolved(s)) continue;
    const isMaterial = s.key in MATERIAL_SPEC_MAP;
    const isDimCount = s.kind === 'count' || s.kind === 'dimension';
    const isDrainage = s.key === 'road-drainage';
    if (!isMaterial && !isDimCount && !isDrainage) continue;
    const scopeId = scopeForSpecKey(s.key);
    const scopeLabel = scopeId ? (SCOPE_LABELS[scopeId] ?? scopeId) : 'proyek';
    const part = scopeId ? draft.parts.find((p) => p.scope.id === scopeId) : undefined;
    const what = isMaterial
      ? 'agar materialnya sesuai permintaan Anda, bukan default template'
      : isDimCount
        ? 'agar volumenya memakai ukuran Anda, bukan default template'
        : 'agar drainase pendamping diputuskan secara eksplisit (baru / tanpa / eksisting)';
    out.push({
      scopeId: scopeId ?? '',
      scopeLabel,
      templateId: part?.template.id ?? '',
      templateName: part?.template.name ?? '',
      field: s.label || s.key,
      specKey: s.key,
      items: [],
      message:
        `Spesifikasi "${s.label || s.key}"${scopeId ? ` (paket ${scopeLabel})` : ''} belum dijawab — ` +
        `draft memakai default template. Lengkapi jawaban ini ${what}.`,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* detectDuplicateItems — uraian+satuan sama dalam SATU part.          */
/*                                                                     */
/* Kelompok = satu part (scope + template + seksi): item yang sama di  */
/* part BERBEDA bukan duplikat (paket berbeda / seksi gedung berbeda   */
/* pada draft multi-gedung). Kunci = itemKey (deskripsi ternormalisasi */
/* + satuan) — kunci yang sama dengan removedKeys/manualPrices.        */
/* ------------------------------------------------------------------ */

export interface DuplicateItem {
  description: string;
  unit: string;
  scopeId: string;
  scopeLabel: string;
  templateName: string;
  count: number;
  itemIds: string[];
  message: string;
}

export function detectDuplicateItems(draft: ChainDraftLike): DuplicateItem[] {
  const out: DuplicateItem[] = [];
  for (const part of draft.parts) {
    const groups = new Map<string, ChainDraftItemLike[]>();
    for (const it of part.generation.items) {
      if (part.removedKeys.includes(itemKeyLocal(it))) continue;
      const list = groups.get(itemKeyLocal(it)) ?? [];
      list.push(it);
      groups.set(itemKeyLocal(it), list);
    }
    for (const [, items] of groups) {
      if (items.length < 2) continue;
      const first = items[0];
      out.push({
        description: first.description,
        unit: first.unit,
        scopeId: part.scope.id,
        scopeLabel: part.scope.label,
        templateName: part.template.name,
        count: items.length,
        itemIds: items.map((it) => `${part.template.id}::${it.id}`),
        message:
          `Item "${first.description}" (satuan ${first.unit}) muncul ${items.length} kali dalam paket ${part.scope.label} ` +
          `(template "${part.template.name}") — hapus salah satunya sebelum transfer agar tidak terhitung ganda.`,
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* detectSpecConflicts — spek yang bertentangan.                       */
/*                                                                     */
/* DUA jenis (keduanya dari data yang ADA):                            */
/* - NILAI_GANDA: kunci yang sama dijawab CONFIRMED ≥2 kali dengan     */
/*   nilai berbeda, tanpa rantai supersedes yang menyelesaikannya      */
/*   (entri TERAKHIR tanpa `supersedes` = belum ada revisi yang        */
/*   memenangkan satu nilai; bila entri terakhir membawa supersedes,   */
/*   koreksi dianggap sudah menyelesaikan konflik — aturan             */
/*   `latestSpecsByKey` yang menang). Hanya CONFIRMED yang dihitung:   */
/*   asumsi/rekomendasi sistem bukan jawaban pengguna yang              */
/*   bertentangan.                                                     */
/* - DIMENSI_BERTENTANGAN: dimensi DED (ded-length/width/height/area/ */
/*   volume) vs dimensi draft yang sama — selisih >1% (min 0,01).      */
/*   Material UNAVAILABLE TIDAK dideteksi ulang di sini (sudah ada di  */
/*   `validateDraftChain().ambiguousPicks`).                           */
/*                                                                     */
/* CATATAN: fungsi ini memakai array spek MENTAH (bukan dedup) —       */
/* konflik HIDUP di entri ganda; dedup akan menyembunyikannya.         */
/* ------------------------------------------------------------------ */

export interface SpecConflict {
  kind: 'NILAI_GANDA' | 'DIMENSI_BERTENTANGAN';
  specKey: string;
  label: string;
  message: string;
}

const DED_DIMENSION_DRAFT_KEY: Readonly<Record<string, keyof ChainDraftLike['spec']>> = {
  'ded-length': 'lengthM',
  'ded-width': 'widthM',
  'ded-height': 'heightM',
  'ded-area': 'areaM2',
  'ded-volume': 'volumeM3',
};

export function detectSpecConflicts(
  draft: ChainDraftLike,
  specs: StructuredSpec[],
): SpecConflict[] {
  const out: SpecConflict[] = [];
  const byKey = new Map<string, StructuredSpec[]>();
  for (const s of specs) {
    const list = byKey.get(s.key) ?? [];
    list.push(s);
    byKey.set(s.key, list);
  }
  for (const [key, entries] of byKey) {
    const confirmed = entries.filter((s) => s.status === 'CONFIRMED');
    if (confirmed.length < 2) continue;
    const values = new Set(confirmed.map((s) => norm(specText(s))));
    if (values.size < 2) continue;
    const last = entries[entries.length - 1];
    if (last.supersedes != null) continue; // rantai revisi sudah menyelesaikan
    const label = confirmed[0].label || key;
    out.push({
      kind: 'NILAI_GANDA',
      specKey: key,
      label,
      message:
        `Spesifikasi "${label}" dijawab berbeda ${confirmed.length} kali (${[...values].map((v) => `"${v}"`).join(' vs ')}) ` +
        `tanpa koreksi yang memenangkan satu nilai — tentukan jawaban yang benar sebelum transfer.`,
    });
  }
  const latest = latestSpecsByKey(specs);
  for (const s of latest) {
    const draftKey = DED_DIMENSION_DRAFT_KEY[s.key];
    if (!draftKey) continue;
    const num = specNumber(s);
    const draftVal = draft.spec[draftKey];
    if (num == null || draftVal == null) continue;
    // P3D — nilai spek draft bertipe string | number: samakan ke number
    // dengan Number() (identik dengan koersi implisit aritmetika JS).
    const draftNum = Number(draftVal);
    const tol = Math.max(0.01, Math.abs(draftNum) * 0.01);
    if (Math.abs(num - draftNum) <= tol) continue;
    out.push({
      kind: 'DIMENSI_BERTENTANGAN',
      specKey: s.key,
      label: s.label || s.key,
      message:
        `Dimensi "${s.label || s.key}" dari DED (${num}) bertentangan dengan dimensi draft (${draftVal}) — ` +
        `samakan nilai yang benar sebelum transfer; volume saat ini memakai dimensi draft.`,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* validateWbsCompleteness — gerbang kelengkapan sebelum pratinjau/    */
/* transfer (pola `validateDraftChain`: satu fungsi, hasil terstruktur  */
/* + pesan siap tampil).                                               */
/*                                                                     */
/* Status LENGKAP HANYA bila SEMUA cek lolos: tak ada node WBS KOSONG; */
/* tak ada spek UNRESOLVED (apa pun kuncinya — spek yang belum          */
/* terjawab berarti draft belum terverifikasi penuh); tak ada field     */
/* wajib hilang; tak ada duplikat; tak ada konflik spek. Bila satu     */
/* saja gagal → BELUM_LENGKAP + `isVerified: false`. Node              */
/* DIKECUALIKAN (dengan alasan) dan node TERCAKUP (via klasifikasi)    */
/* TIDAK menggagalkan — keputusannya tercatat / pekerjaannya ada.      */
/*                                                                     */
/* `artifact` boleh null — bila null, artefak dibangun dari draft +    */
/* spek di sini (satu panggilan untuk pemanggil yang tidak menyimpan    */
/* artefak).                                                           */
/* ------------------------------------------------------------------ */

export interface WbsCompletenessReport {
  status: 'LENGKAP' | 'BELUM_LENGKAP';
  /** True HANYA bila status LENGKAP — gerbang label "terverifikasi". */
  isVerified: boolean;
  nodesTotal: number;
  /** Node LENGKAP + TERCAKUP + DIKECUALIKAN (bukan KOSONG). */
  nodesCovered: number;
  nodesEmpty: Array<{ nodeId: string; scopeId: string; label: string; message: string }>;
  nodesExcluded: Array<{ nodeId: string; label: string; reason: string }>;
  /** Kunci spek (terbaru per kunci) yang belum terjawab. */
  unresolvedSpecKeys: string[];
  missingFields: MissingRequiredField[];
  duplicates: DuplicateItem[];
  conflicts: SpecConflict[];
  /** Semua pesan (Bahasa Indonesia) — siap tampil di pratinjau. */
  issues: string[];
  checkedAt: string;
}

export function validateWbsCompleteness(
  draft: ChainDraftLike,
  specs: StructuredSpec[],
  artifact?: WbsArtifact | null,
): WbsCompletenessReport {
  const wbs = artifact ?? buildWbsForDraft(draft, specs);
  const latest = latestSpecsByKey(specs);
  const unresolved = latest.filter(isSpecUnresolved);

  const nodesEmpty = wbs.nodes
    .filter((n) => n.status === 'KOSONG')
    .map((n) => ({
      nodeId: n.id,
      scopeId: n.scopeId,
      label: n.label,
      message:
        `Paket "${n.label}" belum punya item — tambahkan item pekerjaan ini, ` +
        `atau kecualikan paket ini dengan alasan bila memang tidak dikerjakan.`,
    }));
  const nodesExcluded = wbs.nodes
    .filter((n) => n.status === 'DIKECUALIKAN')
    .map((n) => ({
      nodeId: n.id,
      label: n.label,
      reason: n.exclusion?.reason ?? 'Dikecualikan.',
    }));
  const missingFields = detectMissingRequiredSpecs(draft, specs);
  const duplicates = detectDuplicateItems(draft);
  const conflicts = detectSpecConflicts(draft, specs);

  const issues: string[] = [];
  for (const e of nodesEmpty) issues.push(e.message);
  for (const s of unresolved) {
    issues.push(
      `Spesifikasi "${s.label || s.key}" belum terjawab (status ${s.status}) — ` +
      `jawab pertanyaan ini agar draft terverifikasi penuh.`,
    );
  }
  for (const m of missingFields) issues.push(m.message);
  for (const d of duplicates) issues.push(d.message);
  for (const c of conflicts) issues.push(c.message);

  const isComplete =
    nodesEmpty.length === 0 &&
    unresolved.length === 0 &&
    missingFields.length === 0 &&
    duplicates.length === 0 &&
    conflicts.length === 0;

  return {
    status: isComplete ? 'LENGKAP' : 'BELUM_LENGKAP',
    isVerified: isComplete,
    nodesTotal: wbs.nodes.length,
    nodesCovered: wbs.nodes.filter((n) => n.status !== 'KOSONG').length,
    nodesEmpty,
    nodesExcluded,
    unresolvedSpecKeys: unresolved.map((s) => s.key),
    missingFields,
    duplicates,
    conflicts,
    issues,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Baris pesan kelengkapan WBS untuk pratinjau (lapisan logika —
 * wiring ke UI pratinjau adalah pekerjaan verifikator/P6; `view.tsx`
 * di luar cakupan P3D). Maks 8 masalah ditampilkan + hitungan sisa
 * (laporan lengkap tetap ada di `WbsCompletenessReport.issues`).
 */
export function formatWbsCompletenessLines(report: WbsCompletenessReport): string[] {
  if (report.status === 'LENGKAP') {
    return [
      `**Kelengkapan WBS:** LENGKAP — ${report.nodesTotal} paket pekerjaan terisi, tercakup, atau dikecualikan eksplisit; tidak ada spesifikasi yang belum terjawab.`,
    ];
  }
  const lines = [
    `**Kelengkapan WBS:** BELUM LENGKAP — draft ini belum terverifikasi penuh (${report.issues.length} masalah):`,
  ];
  const shown = report.issues.slice(0, 8);
  for (const i of shown) lines.push(`• ${i}`);
  if (report.issues.length > 8) {
    lines.push(`(+${report.issues.length - 8} masalah lainnya — lihat laporan kelengkapan.)`);
  }
  return lines;
}

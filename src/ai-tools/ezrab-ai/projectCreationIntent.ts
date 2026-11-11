/**
 * projectCreationIntent — layanan pembuatan proyek untuk jalur EZRAB
 * Magic AI (Rekonstruksi Arsitektur AI Terpadu, Opsi A — 2026-11-11).
 *
 * SATU tempat yang mengubah prompt Magic AI menjadi metadata proyek
 * terstruktur + keputusan pembuatan. Menggantikan perilaku lama
 * CreateProjectModal (nama = 36 karakter pertama prompt; client
 * "Klien AI"; location "Indonesia"; buildingType "Rumah Tinggal"
 * dipaksakan untuk semua prompt).
 *
 * Prinsip (direktif §5):
 * - Nama eksplisit pengguna selalu menang; selain itu nama deskriptif
 *   dari kategori + atribut kunci (BUKAN potongan prompt).
 * - Metadata diekstrak memakai ekstraktor intake yang sudah terbukti
 *   (universalIntake / projectIntake) — tidak ada parser paralel baru.
 * - Field yang tidak diketahui TIDAK dikarang: dikembalikan null agar
 *   pemanggil tidak menuliskannya (default aman yang ada di
 *   createProject kanonis yang berlaku).
 * - "Rumah Tinggal" tidak pernah menjadi fallback universal di sini.
 * - Pembuatan proyek sadar proyek aktif + idempoten.
 */
import { extractUniversalContext } from './universalIntake';
import { extractProjectContext, isLandscapeFamily } from './projectIntake';
import type { SubcategoryDef } from './universalIntake';
import type { BuildingType } from '../../types';

export interface ProjectCreationIntent {
  /** Nama proyek yang disebut eksplisit pengguna (menang atas nama hasil). */
  explicitName: string | null;
  /** Nama deskriptif hasil ekstraksi (kategori + atribut kunci). */
  descriptiveName: string | null;
  subcategoryId: string | null;
  categoryLabel: string | null;
  family: string | null;
  buildingType: BuildingType | null;
  location: string | null;
  clientName: string | null;
  landAreaM2: number | null;
  buildingAreaM2: number | null;
  floors: number | null;
  /** Pengguna secara eksplisit meminta proyek BARU. */
  explicitNewProject: boolean;
  /** Prompt memuat intent generasi RAB yang cukup jelas untuk auto-buat. */
  hasClearGenerationIntent: boolean;
}

/* ------------------------------------------------------------------ */
/* Format tampilan (Bahasa Indonesia)                                  */
/* ------------------------------------------------------------------ */

/** 400 -> "400 m²"; 10000 -> "10.000 m²"; 1250.5 -> "1.250,5 m²". */
export function formatAreaId(valueM2: number): string {
  const n = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(valueM2);
  return `${n} m²`;
}

/** "1,2 km" -> "1,2 KM"; "500 m"/"500 meter" -> "500 m"; "2 km" -> "2 KM". */
export function formatLengthId(original: string | null, valueM: number | null): string | null {
  if (original) {
    const m = original.replace(/\s+/g, ' ').trim().match(/^([\d.,]+)\s*(km|meter|m)\b/i);
    if (m) {
      const unit = m[2].toLowerCase() === 'km' ? 'KM' : 'm';
      return `${m[1]} ${unit}`;
    }
  }
  if (valueM != null) {
    if (valueM >= 1000) {
      const km = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(valueM / 1000);
      return `${km} KM`;
    }
    return `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(valueM)} m`;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Label penamaan per subkategori                                      */
/* ------------------------------------------------------------------ */

/** Label pendek yang layak menjadi awalan nama proyek, per id def. */
const NAMING_LABELS: Record<string, string> = {
  rumah: 'Rumah Tinggal',
  kantor: 'Gedung Kantor',
  sekolah: 'Sekolah',
  kesehatan: 'Rumah Sakit & Fasilitas Kesehatan',
  hotel: 'Hotel',
  komersial: 'Bangunan Komersial',
  'gudang-industri': 'Gudang & Industri',
  'bangunan-publik': 'Bangunan Publik',
  apartemen: 'Apartemen',
  renovasi: 'Renovasi',
  jembatan: 'Jembatan',
  'gorong-gorong': 'Gorong-gorong & Box Culvert',
  bendung: 'Bendung & Bangunan Air',
  irigasi: 'Saluran Irigasi',
  drainase: 'Drainase',
  'jalan-tol': 'Jalan Tol',
  'jalan-aspal': 'Jalan Aspal',
  'jalan-beton': 'Jalan Beton',
  'jalan-lingkungan': 'Jalan Lingkungan',
  jalan: 'Jalan',
  'dinding-penahan': 'Dinding Penahan Tanah',
  'pelindung-pantai': 'Pelindung Pantai',
  'pekerjaan-tanah': 'Pekerjaan Tanah & Pematangan Lahan',
  'landscape-umum': 'Landscape',
  'taman-kota': 'Taman Kota',
  'landscape-perumahan': 'Landscape Perumahan',
  'landscape-komersial': 'Landscape Komersial',
  'landscape-resort': 'Landscape Resort',
  hardscape: 'Hardscape',
  'jogging-track': 'Jogging Track',
  playground: 'Playground',
  kolam: 'Kolam & Water Feature',
  'irigasi-landscape': 'Irigasi Landscape',
  'pagar-gerbang': 'Pagar & Gerbang',
  pondasi: 'Pondasi',
  'struktur-atap': 'Struktur Atap',
  'struktur-beton': 'Struktur Beton',
  'struktur-baja': 'Struktur Baja',
  interior: 'Interior',
  finishing: 'Finishing',
  listrik: 'Instalasi Listrik',
  plumbing: 'Plumbing & Sanitasi',
  hvac: 'HVAC',
  'fire-protection': 'Fire Protection',
  lift: 'Lift & Eskalator',
};

export function namingLabelFor(def: SubcategoryDef | null): string | null {
  if (!def) return null;
  if (NAMING_LABELS[def.id]) return NAMING_LABELS[def.id];
  const first = def.label.split('/')[0].trim();
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : null;
}

/** Peta subkategori → BuildingType kanonis (null = jangan dipaksakan). */
const BUILDING_TYPE_BY_ID: Record<string, BuildingType> = {
  rumah: 'Rumah Tinggal',
  kantor: 'Gedung Kantor',
  apartemen: 'Apartemen',
  hotel: 'Hotel & Resort',
  sekolah: 'Sekolah / Kampus',
  kesehatan: 'Rumah Sakit / Klinik',
  'gudang-industri': 'Gudang & Pabrik',
  komersial: 'Ruko / Rukan',
  renovasi: 'Renovasi',
  'landscape-umum': 'Landscape & Kawasan',
  'taman-kota': 'Landscape & Kawasan',
  'landscape-perumahan': 'Landscape & Kawasan',
  'landscape-komersial': 'Landscape & Kawasan',
  'landscape-resort': 'Landscape & Kawasan',
  hardscape: 'Landscape & Kawasan',
  'jogging-track': 'Landscape & Kawasan',
  playground: 'Landscape & Kawasan',
  kolam: 'Landscape & Kawasan',
  'irigasi-landscape': 'Landscape & Kawasan',
  'pagar-gerbang': 'Landscape & Kawasan',
};

export function buildingTypeFor(def: SubcategoryDef | null): BuildingType | null {
  if (!def) return null;
  if (BUILDING_TYPE_BY_ID[def.id]) return BUILDING_TYPE_BY_ID[def.id];
  if (def.family === 'civil') return 'Infrastruktur';
  if (def.family === 'landscape') return 'Landscape & Kawasan';
  return 'Custom';
}

/* ------------------------------------------------------------------ */
/* Ekstraksi nama eksplisit & klien                                    */
/* ------------------------------------------------------------------ */

function extractExplicitName(text: string): string | null {
  const patterns = [
    /nama\s+proyek(?:nya)?\s*[:=]?\s*["“]?([^"”\n,.;]{3,60})/i,
    /(?:dengan|ber)?nama\s+["“]([^"”\n]{3,60})["”]/i,
    /\bbernama\s+["“]?([^"”\n,.;]{3,60})/i,
    /proyek\s+["“]([^"”\n]{3,60})["”]/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const name = m[1].trim().replace(/\s+/g, ' ');
      if (name.length >= 3) return name;
    }
  }
  return null;
}

function extractClientName(text: string): string | null {
  const m =
    text.match(/\b(?:klien|client|pemilik)\s*[:=]?\s*([A-Za-z][A-Za-z.' ]{2,40})/i) ||
    text.match(/\buntuk\s+(bapak|ibu|pak|bu)\s+([A-Za-z]+(?:\s+[A-Za-z]+){0,2})/i);
  if (!m) return null;
  const raw = (m[2] ? `${m[1]} ${m[2]}` : m[1]).trim().replace(/\s+/g, ' ');
  // Potong di kata sambung umum agar tidak menelan sisa kalimat.
  const cut = raw.split(/\s+(?:di|dengan|yang|untuk|dan|berlokasi)\s+/i)[0].trim();
  if (cut.length < 3) return null;
  return cut.charAt(0).toUpperCase() + cut.slice(1);
}

/* ------------------------------------------------------------------ */
/* Ekstraksi utama                                                     */
/* ------------------------------------------------------------------ */

export function extractProjectCreationIntent(text: string): ProjectCreationIntent {
  const raw = (text || '').trim();
  const uni = extractUniversalContext(raw);
  const land = extractProjectContext(raw);
  // Keluarga landscape dimiliki GERBANG landscape (projectIntake):
  // lapisan universal dapat salah membaca fasilitas (mis. "jogging
  // track") sebagai kategori utama proyek dan luas alokasi sebagai
  // luas total. Bila gerbang landscape mengenali prompt ini, kategori
  // + luasnya yang berlaku untuk penamaan & metadata.
  const landscapeOwned = isLandscapeFamily(land.category);
  const def = landscapeOwned ? null : uni.primary;

  const explicitName = uni.projectName ?? land.projectName ?? extractExplicitName(raw);
  const landAreaM2 = landscapeOwned ? land.landAreaM2 : uni.landAreaM2 ?? land.landAreaM2;
  const buildingAreaM2 = uni.buildingAreaM2 ?? land.buildingAreaM2;
  const floors = uni.floors ?? land.floors;
  const location = uni.location ?? land.location;

  const label = landscapeOwned ? (land.categoryLabel ?? 'Landscape') : namingLabelFor(def);
  const parts: string[] = [];
  if (label) parts.push(label);
  if (def && def.family === 'building' && floors) parts.push(`${floors} Lantai`);
  // Dimensi utama untuk nama: jalan → panjang; bangunan → luas bangunan;
  // landscape/lainnya → luas lahan; terakhir luas bangunan.
  let dimension: string | null = null;
  if (def && def.family === 'civil' && uni.lengthM != null) {
    dimension = formatLengthId(uni.lengthOriginal, uni.lengthM);
  } else if (buildingAreaM2 != null && def && def.family === 'building') {
    dimension = formatAreaId(buildingAreaM2);
  } else if (landAreaM2 != null) {
    dimension = formatAreaId(landAreaM2);
  } else if (buildingAreaM2 != null) {
    dimension = formatAreaId(buildingAreaM2);
  } else if (uni.lengthM != null) {
    dimension = formatLengthId(uni.lengthOriginal, uni.lengthM);
  }
  if (dimension) parts.push(dimension);
  const descriptiveName = parts.length > 0 ? parts.join(' ') : null;

  const hasClearGenerationIntent =
    def != null ||
    landAreaM2 != null ||
    buildingAreaM2 != null ||
    uni.lengthM != null ||
    /\brab\b/i.test(raw);

  return {
    explicitName,
    descriptiveName,
    subcategoryId: landscapeOwned ? 'landscape-umum' : def?.id ?? null,
    categoryLabel: def?.label ?? land.categoryLabel,
    family: landscapeOwned ? 'landscape' : def?.family ?? null,
    buildingType: landscapeOwned ? 'Landscape & Kawasan' : buildingTypeFor(def),
    location,
    clientName: extractClientName(raw),
    landAreaM2,
    buildingAreaM2,
    floors,
    explicitNewProject:
      /\bproyek\s+baru\b|\bproject\s+baru\b|\bmulai\s+(?:dari\s+awal|proyek\s+baru)\b/i.test(raw),
    hasClearGenerationIntent,
  };
}

/* ------------------------------------------------------------------ */
/* Keputusan pembuatan proyek (§5.3)                                   */
/* ------------------------------------------------------------------ */

export type MagicAiProjectAction = 'create' | 'reuse-active' | 'ask';

export interface MagicAiProjectDecisionInput {
  hasActiveProject: boolean;
  explicitNewProject: boolean;
  /** Pilihan eksplisit pengguna dari dialog tanya (bila sudah memilih). */
  userChoice?: 'reuse' | 'new' | null;
}

/**
 * - Pengguna memilih eksplisit → hormati.
 * - Minta proyek baru secara eksplisit → buat.
 * - Tidak ada proyek aktif → buat otomatis.
 * - Ada proyek aktif & belum jelas → TANYA (default yang ditonjolkan UI
 *   adalah memakai ulang proyek aktif — tidak diam-diam membuat baru).
 */
export function decideMagicAiProjectAction(input: MagicAiProjectDecisionInput): MagicAiProjectAction {
  if (input.userChoice === 'reuse') return 'reuse-active';
  if (input.userChoice === 'new') return 'create';
  if (input.explicitNewProject) return 'create';
  if (!input.hasActiveProject) return 'create';
  return 'ask';
}

/* ------------------------------------------------------------------ */
/* Idempotensi submit Magic AI (§5.5)                                  */
/* ------------------------------------------------------------------ */

interface MagicAiSubmission {
  projectId: string | null;
  at: number;
}

const SUBMISSION_TTL_MS = 10 * 60_000;
const submissions = new Map<string, MagicAiSubmission>();

/** Kunci idempotensi stabil dari prompt (normalisasi + hash ringan). */
export function magicAiSubmissionKey(prompt: string): string {
  const norm = (prompt || '').trim().toLowerCase().replace(/\s+/g, ' ');
  let h = 5381;
  for (let i = 0; i < norm.length; i++) h = ((h << 5) + h + norm.charCodeAt(i)) | 0;
  return `magic-${(h >>> 0).toString(36)}-${norm.length}`;
}

export interface MagicAiClaim {
  key: string;
  /** true bila prompt identik sudah pernah diklaim dalam TTL. */
  duplicate: boolean;
  /** Proyek yang sudah terikat ke submit sebelumnya (bila ada). */
  projectId: string | null;
}

/**
 * Klaim satu submit. Submit ganda / retry / klik ganda atas prompt yang
 * sama dalam TTL TIDAK boleh membuat proyek kedua: klaim kedua
 * mengembalikan proyek yang sudah terikat.
 */
export function claimMagicAiSubmission(prompt: string, nowMs: number = Date.now()): MagicAiClaim {
  const key = magicAiSubmissionKey(prompt);
  const existing = submissions.get(key);
  if (existing && nowMs - existing.at <= SUBMISSION_TTL_MS) {
    return { key, duplicate: true, projectId: existing.projectId };
  }
  submissions.set(key, { projectId: null, at: nowMs });
  return { key, duplicate: false, projectId: null };
}

/** Ikat proyek hasil pembuatan ke klaim submit-nya. */
export function bindMagicAiSubmission(key: string, projectId: string): void {
  const entry = submissions.get(key);
  if (entry) entry.projectId = projectId;
  else submissions.set(key, { projectId, at: Date.now() });
}

/** Untuk tes: bersihkan registri. */
export function resetMagicAiSubmissions(): void {
  submissions.clear();
}

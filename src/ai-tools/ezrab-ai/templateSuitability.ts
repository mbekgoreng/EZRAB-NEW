/**
 * templateSuitability — EVALUATOR KESESUAIAN TEMPLATE (Batch 1, §4).
 *
 * Menjawab SATU pertanyaan sebelum draft RAB dibuat: "template katalog
 * mana — bila ada — yang LAYAK dipakai untuk permintaan ini?"
 *
 * MASALAH YANG DIPERBAIKI (observasi W13): `scoreTemplate` di
 * universalRab.ts memberi skor kata kunci yang SERI di hampir semua
 * kasus (margin 0), sehingga pilihan jatuh ke urutan katalog:
 * perumahan 20 unit → Hotel Berbintang & Resort; retaining wall →
 * Taman Kota & Plaza Hijau; ruko 2 lantai → Bangunan Tinggi (Tower);
 * jalan beton baru → Rekonstruksi Jalan Beton Eksisting; instalasi
 * listrik saja → Paket Terpadu MEP. Semua itu adalah kegagalan
 * KESESUAIAN, bukan penamaan — skor tidak pernah bisa membedakan
 * "hotel" dari "perumahan" karena keduanya sama-sama gedung.
 *
 * DESAIN:
 * - Lapisan PENYARING di atas penskoran yang ada, BUKAN mesin
 *   template paralel: evaluator menerima kandidat yang SUDAH
 *   dinilai `scoreTemplate` (TemplatePick[]) dan menerapkan
 *   constraint keras (hard constraint) + sinyal lunak (soft ranking).
 *   Penskoran tidak diubah; yang berubah adalah kandidat mana yang
 *   BOLEH dipilih.
 * - Constraint keras MENOLAK kandidat tanpa peduli skornya — skor
 *   tinggi TIDAK PERNAH mengalahkan constraint keras.
 * - Constraint lunak hanya mengurutkan kandidat yang valid.
 * - Modul ini adalah DAUN (seperti universalTaxonomy): hanya
 *   mengimpor TIPE dari universalRab (dihapus saat kompilasi) +
 *   universalTaxonomy + RabTemplateService. Ia TIDAK mengimpor nilai
 *   dari universalRab agar tidak bersiklus — klasifikasi parameter
 *   kecil yang dibutuhkannya diduplikasi secara sadar di sini
 *   (lihat `classifyParamLocal`) dengan rujukan ke fungsi kanonis.
 *
 * ATURAN KERAS (B1):
 *  F1 Fungsi bangunan (scope gedung): keluarga fungsi template harus
 *     cocok dengan fungsi yang diminta (hotel ≠ perumahan, kantor ≠
 *     sekolah, gudang ≠ ruko). Permintaan generik ("gedung") tidak
 *     dibatasi fungsi.
 *  F2 Dinding penahan (scope lanskap): template landscape DITOLAK —
 *     dinding penahan adalah struktur, bukan taman.
 *  T1 Tipe konstruksi: template renovasi/rekonstruksi/demolisi
 *     membutuhkan konteks yang cocok (renovasi → ada sinyal renovasi;
 *     rekonstruksi → ada bukti struktur eksisting); template bangunan
 *     baru DITOLAK bila permintaan secara eksplisit menyebut
 *     rekonstruksi struktur eksisting.
 *  M1 Material jalan (scope jalan): beton ≠ aspal (cermin penjaga
 *     material jembatan beton/baja yang sudah ada di buildDraftPart).
 *  M2 Material jembatan: cermin penjaga downstream (beton vs baja).
 *  S1 Cakupan MEP (scope mep): permintaan SATU subsistem (mis.
 *     listrik saja) TIDAK BOLEH memakai paket MEP terpadu atau
 *     template subsistem lain; paket terpadu hanya sah bila pengguna
 *     meminta MEP secara umum atau ≥2 subsistem.
 *  D1 DIHAPUS (2026-11-23, sapuan regresi B1): dimensi relevan di luar
 *     batas BUKAN constraint keras — rentang adalah soal derajat,
 *     bukan jenis (gedung 96 m² vs minimum 100 m² adalah noise;
 *     penolakan keras memilih template yang salah secara semantik dan
 *     memecahkan golden multi-gedung Gate 2). Nilai di luar batas
 *     ditangani mesin yang sudah ada: peringatan jujur partIssues +
 *     demosi untuk jenis non-relevan. Kelima kegagalan W13 tidak
 *     bergantung pada D1.
 *  D2 Semantik per-unit (semua scope): nilai LUAS TOTAL pengguna yang
 *     dipetakan ke parameter PER-UNIT template (luas unit/kamar/villa)
 *     adalah korupsi pemetaan, bukan pendekatan rentang — kandidat
 *     DITOLAK.
 *  D3 Representasi jumlah (gedung, proyek multi-unit residensial):
 *     template tanpa parameter JUMLAH TOTAL tidak dapat mewakili
 *     jumlah unit yang disebut (mis. \"20 unit\") — ditolak.
 *     Parameter per-lantai (units_per_floor) BUKAN jumlah total.
 *  D4 Dasar ukuran diterima (scope MEP saja): template MEP harus
 *     menerima setidaknya satu basis ukuran yang dinyatakan pengguna
 *     — template yang hanya berparameter kVA/lantai/tinggi untuk
 *     permintaan berbasis luas akan dihitung seluruhnya dari nilai
 *     default yang absurd skalanya (800 kVA untuk 120 m²).
 *
 * TANPA FALLBACK: bila TIDAK ADA kandidat yang lolos SEMUA constraint
 * keras, evaluator TIDAK memaksakan kandidat yang ditolak — hasilnya
 * NEEDS_CLARIFICATION / UNSUPPORTED / ENGINEERING_REVIEW_REQUIRED
 * dengan spek hilang yang ditargetkan. (Dulu ada fallback rentang D1;
 * dihapus bersama D1 — nilai di luar batas ditangani peringatan.)
 *
 * EKSPANSI LINTAS-POOL: bila pool cakupan kosong sesudah penyaringan
 * (mis. scope lanskap tidak punya template dinding penahan),
 * evaluator mencari di kategori katalog yang dipetakan taksonomi
 * untuk subkategori yang relevan (dinding-penahan → STRUKTUR_BETON_
 * BAJA / PONDASI_GEOTEKNIK). Part tetap membawa scope aslinya.
 *
 * SKOR: angka kesesuaian adalah skor penskoran + penyesuaian lunak
 * kecil (kecocokan kata benda jumlah) — BUKAN probabilitas, dan tidak
 * pernah ditampilkan sebagai persentase keyakinan.
 */

import type { UniversalSpec, ScopeGroup, TemplatePick, ParamKind } from './universalRab';
import { subcategoryById } from './universalTaxonomy';
import type { SubcategoryDef } from './universalTaxonomy';
import { RabTemplateService } from '../../services/rabTemplateService';
import type { RabTemplate } from '../../types/rabTemplate';

/* ------------------------------------------------------------------ */
/* Kontrak hasil (§4.4)                                                */
/* ------------------------------------------------------------------ */

export type SuitabilityOutcome =
  | 'SELECTED'
  | 'NEEDS_CLARIFICATION'
  | 'MULTIPLE_CANDIDATES'
  | 'UNSUPPORTED'
  | 'ENGINEERING_REVIEW_REQUIRED';

export type ViolationKind =
  | 'function'
  | 'construction-type'
  | 'scope-coverage'
  | 'scope-discipline'
  | 'dimensional-range'
  | 'dimensional-per-unit'
  | 'count-representability'
  | 'missing-basis'
  | 'material';

export interface SuitabilityViolation {
  kind: ViolationKind;
  /** Alasan berbahasa Indonesia, siap tampil. */
  reason: string;
}

export interface CandidateAssessment {
  templateId: string;
  templateName: string;
  category: string;
  /** Skor penskoran (atau skor evaluator untuk kandidat lintas-pool). */
  score: number;
  /** Skor sesudah penyesuaian lunak (yang dipakai mengurutkan). */
  adjustedScore: number;
  crossPool: boolean;
  valid: boolean;
  violations: SuitabilityViolation[];
  /** Sinyal lunak yang memengaruhi urutan (audit). */
  softNotes: string[];
}

export interface SuitabilityDecision {
  outcome: SuitabilityOutcome;
  scopeId: string;
  /** Template terpilih (SELECTED / MULTIPLE_CANDIDATES) atau null. */
  selectedTemplateId: string | null;
  /** Kandidat valid terurut (alternatif yang sah). */
  candidates: CandidateAssessment[];
  /** Kandidat yang ditolak + alasannya (jejak audit). */
  rejections: CandidateAssessment[];
  /** true bila pilihan berasal dari fallback rentang (D1). */
  fallbackUsed: boolean;
  /** true bila pilihan berasal dari ekspansi lintas-pool. */
  crossPoolUsed: boolean;
  /** Pelanggaran keras kandidat skor tertinggi yang ditolak. */
  hardViolations: string[];
  /** Spek yang harus dilengkapi pengguna (NEEDS_CLARIFICATION / ENGINEERING_REVIEW_REQUIRED). */
  missingSpecs: string[];
  /** Nilai yang diberikan pengguna dan dipakai dalam keputusan. */
  providedValues: Record<string, number | string | null>;
  /** Asumsi + caveat yang harus dinyatakan terbuka di draft. */
  assumptions: string[];
  /** Penjelasan pemilihan dalam bahasa awam. */
  explanation: string;
  /** Cakupan template terpilih vs yang diminta (bila relevan). */
  scopeCoverage: string | null;
  /** Konfirmasi yang sebaiknya diminta ke pengguna (bila ada). */
  requiredConfirmation: string | null;
}

export interface SuitabilityOptions {
  /** Jenis ukuran relevan cakupan (dari relevantParamKinds kanonis). */
  relevantKinds: ParamKind[];
}

/* ------------------------------------------------------------------ */
/* Keluarga fungsi bangunan (scope gedung)                             */
/* ------------------------------------------------------------------ */

export type BuildingFamily =
  | 'residential-house'
  | 'residential-apartment'
  | 'commercial'
  | 'hospitality-hotel'
  | 'hospitality-villa'
  | 'hospitality-venue'
  | 'health'
  | 'education'
  | 'industrial'
  | 'public'
  | 'generic-highrise'
  | 'specialized'
  | 'generic';

const FAMILY_LABELS: Record<BuildingFamily, string> = {
  'residential-house': 'hunian (rumah/perumahan/kost)',
  'residential-apartment': 'hunian bertingkat (apartemen/rusun)',
  commercial: 'bangunan komersial',
  'hospitality-hotel': 'hotel',
  'hospitality-villa': 'villa/resort',
  'hospitality-venue': 'venue/ballroom',
  health: 'fasilitas kesehatan',
  education: 'fasilitas pendidikan',
  industrial: 'bangunan industri',
  public: 'bangunan publik/ibadah',
  'generic-highrise': 'gedung bertingkat (bentuk umum)',
  specialized: 'bangunan khusus',
  generic: 'bangunan (fungsi umum)',
};

/** Subkategori taksonomi → keluarga fungsi bangunan (null = bukan bangunan). */
const CLASSIFICATION_FAMILY: Record<string, BuildingFamily | null> = {
  rumah: 'residential-house',
  apartemen: 'residential-apartment',
  hotel: 'hospitality-hotel',
  kantor: 'commercial',
  komersial: 'commercial',
  'gudang-industri': 'industrial',
  sekolah: 'education',
  kesehatan: 'health',
  'bangunan-publik': 'public',
  'bangunan-umum': 'generic',
  renovasi: null, // modifier — keluarga diambil dari sekunder/kindLabel
};

/** kindLabel rabNeeds → keluarga fungsi. */
const KIND_LABEL_FAMILY: Array<{ re: RegExp; family: BuildingFamily }> = [
  { re: /kontrakan|kost|in\.?dekos/i, family: 'residential-house' },
  { re: /rumah tinggal|perumahan|hunian|townhouse/i, family: 'residential-house' },
  { re: /apartemen|rusun|rumah susun/i, family: 'residential-apartment' },
  { re: /kondotel/i, family: 'hospitality-hotel' },
  { re: /hotel/i, family: 'hospitality-hotel' },
  { re: /villa/i, family: 'hospitality-villa' },
  { re: /ballroom/i, family: 'hospitality-venue' },
  { re: /ruko|kantor|perkantoran|toko|showroom|pasar|minimarket|restoran|kafe|bank|coworking|apotek|laundry|kios|warung|mall/i, family: 'commercial' },
  { re: /rumah sakit|klinik|puskesmas/i, family: 'health' },
  { re: /sekolah|madrasah|kampus|perpustakaan|pendidikan/i, family: 'education' },
  { re: /gudang|pabrik|workshop|warehouse|bengkel|kandang|cold storage/i, family: 'industrial' },
  { re: /masjid|musholla|mushola|gereja|vihara|klenteng|pura|aula|serbaguna|tempat ibadah|balai/i, family: 'public' },
  { re: /gedung bertingkat|tower|menara|high.?rise/i, family: 'generic-highrise' },
  { re: /data center/i, family: 'specialized' },
];

/** Kata kunci teks mentah → keluarga (fallback terakhir). */
const RAW_TEXT_FAMILY: Array<{ re: RegExp; family: BuildingFamily }> = [
  { re: /\b(kost|kontrakan|perumahan|townhouse)\b/i, family: 'residential-house' },
  { re: /\b(apartemen|rusun|rumah susun)\b/i, family: 'residential-apartment' },
  { re: /\b(villa)\b/i, family: 'hospitality-villa' },
  { re: /\b(ballroom)\b/i, family: 'hospitality-venue' },
  { re: /\b(hotel|kondotel|penginapan)\b/i, family: 'hospitality-hotel' },
  { re: /\b(ruko|showroom|minimarket|restoran|kafe|warung|kios|laundry|apotek)\b/i, family: 'commercial' },
  { re: /\b(masjid|musholla|mushola|gereja|vihara|klenteng|pura)\b/i, family: 'public' },
  { re: /\b(data center)\b/i, family: 'specialized' },
  { re: /\b(gedung bertingkat|tower|menara|high.?rise)\b/i, family: 'generic-highrise' },
];

/** Keluarga dari kindLabel/functionId/teks mentah (null = tidak spesifik). */
function familyFromKindAndText(spec: UniversalSpec): BuildingFamily | null {
  if (spec.kindLabel) {
    for (const { re, family } of KIND_LABEL_FAMILY) {
      if (re.test(spec.kindLabel)) return family;
    }
  }
  if (spec.functionId || spec.functionLabel) {
    const f = `${spec.functionId ?? ''} ${spec.functionLabel ?? ''}`;
    for (const { re, family } of KIND_LABEL_FAMILY) {
      if (re.test(f)) return family;
    }
  }
  const t = spec.rawText || '';
  for (const { re, family } of RAW_TEXT_FAMILY) {
    if (re.test(t)) return family;
  }
  return null;
}

/**
 * Keluarga fungsi yang diminta untuk scope gedung. Mengembalikan null
 * bila permintaan ini BUKAN tentang bangunan (disiplin non-gedung —
 * pemeriksaan fungsi dilewati agar perilaku mixed-scope lama
 * dipertahankan) dan 'generic' bila bangunannya tanpa fungsi spesifik.
 */
export function requestBuildingFamily(spec: UniversalSpec): BuildingFamily | null {
  const cls = spec.classification;
  if (cls?.primaryId) {
    const def = subcategoryById(cls.primaryId);
    if (def) {
      const fam = CLASSIFICATION_FAMILY[def.id];
      if (fam !== undefined) {
        if (fam === null) {
          // Modifier (renovasi): cari keluarga dari sekunder.
          for (const sid of cls.secondaryIds) {
            const sd = subcategoryById(sid);
            if (sd && CLASSIFICATION_FAMILY[sd.id]) return CLASSIFICATION_FAMILY[sd.id]!;
          }
        } else {
          // Sub-fungsi hospitality dari teks mentah (villa/ballroom
          // ikut terklasifikasi 'hotel' oleh taksonomi).
          if (fam === 'hospitality-hotel') {
            const t = spec.rawText.toLowerCase();
            if (/\bvilla\b/.test(t)) return 'hospitality-villa';
            if (/\bballroom\b/.test(t)) return 'hospitality-venue';
          }
          // 'bangunan-publik' adalah wadah kasar (perpustakaan,
          // masjid, gereja, aula) — sempurnakan dengan jenis
          // spesifiknya: perpustakaan adalah fasilitas pendidikan,
          // bukan aula serbaguna.
          if (fam === 'public') {
            return familyFromKindAndText(spec) ?? fam;
          }
          return fam;
        }
      } else {
        // Klasifikasi primer adalah disiplin non-bangunan (jalan,
        // jembatan, MEP, …) — bukan permintaan fungsi bangunan.
        return null;
      }
    }
  }
  return familyFromKindAndText(spec) ?? 'generic';
}

/** Override eksplisit per template yang tidak terbaca dari namanya. */
const TEMPLATE_FAMILY_OVERRIDES: Record<string, BuildingFamily[]> = {
  'BLD-CONDOTEL': ['hospitality-hotel', 'residential-apartment'],
  'BLD-APARTMENT-MIDRISE': ['residential-apartment'],
  'BLD-RUSUN': ['residential-house', 'residential-apartment'],
  'BLD-DORMITORY': ['residential-house', 'residential-apartment'],
  'BLD-HIGHRISE-TOWER': ['generic-highrise'],
  'BLD-HIGHRISE-OFFICE-A': ['commercial'],
  'BLD-DATA-CENTER': ['specialized'],
  'BLD-HALL-SERBAGUNA': ['public'],
  'BLD-RENOV-OFFICE': ['commercial'],
};

/** Keluarga fungsi sebuah template gedung (dari id/kategori/nama). */
export function templateBuildingFamilies(t: RabTemplate): BuildingFamily[] {
  const override = TEMPLATE_FAMILY_OVERRIDES[t.id];
  if (override) return override;
  const hay = `${t.name} ${t.subcategory ?? ''}`.toLowerCase();
  switch (t.category) {
    case 'RUMAH_TINGGAL': return ['residential-house'];
    case 'HOTEL_HOSPITALITY':
      if (/villa/.test(hay)) return ['hospitality-villa'];
      if (/ballroom|venue/.test(hay)) return ['hospitality-venue'];
      return ['hospitality-hotel'];
    case 'KESEHATAN': return ['health'];
    case 'PENDIDIKAN': return ['education'];
    case 'INDUSTRI': return ['industrial'];
    case 'GEDUNG':
    case 'BANGUNAN_TINGGI':
      if (/kantor|perkantoran|bank|showroom|coworking|pasar|market|retail|komersial|commercial/i.test(hay)) return ['commercial'];
      if (/serbaguna|hall|aula|pertemuan/i.test(hay)) return ['public'];
      if (/asrama|dormitory|kost/i.test(hay)) return ['residential-house', 'residential-apartment'];
      return ['generic'];
    default: return ['generic'];
  }
}

/* ------------------------------------------------------------------ */
/* Subsistem MEP                                                       */
/* ------------------------------------------------------------------ */

export type MepSubsystem =
  | 'listrik' | 'plumbing' | 'hvac' | 'fire' | 'data'
  | 'gas-medis' | 'solar' | 'lighting' | 'air-tanah'
  | 'water-treatment' | 'kawasan-elektrikal' | 'kawasan-air';

/** Subsistem yang dicakup tiap template MEP/UTILITAS (pemetaan eksplisit). */
const TEMPLATE_MEP_SUBSYSTEMS: Record<string, MepSubsystem[]> = {
  'MEP-COMPLETE-PKG': ['listrik', 'plumbing', 'hvac', 'fire', 'data'],
  'MEP-ELECTRICAL-DIST': ['listrik'],
  'MEP-SMART-LIGHTING': ['lighting'],
  'MEP-SOLAR-PV': ['solar'],
  'MEP-PLUMBING-TOWER': ['plumbing'],
  'MEP-HVAC-VRF': ['hvac'],
  'MEP-FIRE-PROTECTION': ['fire'],
  'MEP-DATA-NETWORK': ['data'],
  'MEP-MEDICAL-GAS': ['gas-medis'],
  'UTIL-PLUMBING-ELEC': ['kawasan-elektrikal'],
  'UTIL-PLUMBING-WATER': ['kawasan-air'],
  'UTIL-IPAL-WASTE': ['water-treatment'],
  'UTIL-WTP-PLANT': ['water-treatment'],
  'UTIL-STP-BUILDING': ['water-treatment'],
  'UTIL-RAINWATER': ['water-treatment'],
  'UTIL-DEEP-WELL': ['air-tanah'],
  'UTIL-FIRE-HYDRANT': ['fire'],
};

/** Subsistem MEP yang dicakup satu template (kosong = bukan template MEP terpetakan). */
export function templateMepSubsystems(t: RabTemplate): MepSubsystem[] {
  return [...(TEMPLATE_MEP_SUBSYSTEMS[t.id] ?? [])];
}

const CLASSIFICATION_MEP: Record<string, MepSubsystem> = {
  listrik: 'listrik',
  plumbing: 'plumbing',
  hvac: 'hvac',
  'fire-protection': 'fire',
  'komunikasi-data': 'data',
};

const RAW_TEXT_MEP: Array<{ re: RegExp; sub: MepSubsystem }> = [
  { re: /\b(sumur bor)\b/i, sub: 'air-tanah' },
  { re: /\b(gas medis)\b/i, sub: 'gas-medis' },
  { re: /\b(solar|plts|surya|panel surya)\b/i, sub: 'solar' },
  { re: /\b(penerangan|pju|lampu jalan|lighting)\b/i, sub: 'lighting' },
  { re: /\b(ipal|stp|wtp|air hujan|sumur resapan|septik)\b/i, sub: 'water-treatment' },
  { re: /\b(instalasi listrik|elektrikal|panel listrik|stop kontak|sakelar)\b/i, sub: 'listrik' },
  { re: /\b(plumbing|perpipaan|air bersih|air kotor|sanitasi|sanitair)\b/i, sub: 'plumbing' },
  { re: /\b(hvac|instalasi ac|tata udara|ventilasi|ac sentral)\b/i, sub: 'hvac' },
  { re: /\b(fire protection|hydrant|pemadam kebakaran|fire alarm)\b/i, sub: 'fire' },
  { re: /\b(jaringan data|komunikasi dan data|structured cabling|lan)\b/i, sub: 'data' },
  { re: /\b(jaringan listrik|jaringan elektrikal)\b/i, sub: 'kawasan-elektrikal' },
  { re: /\b(jaringan air|distribusi air)\b/i, sub: 'kawasan-air' },
];

/** Subsistem MEP yang diminta (klasifikasi + kata kunci teks). */
export function requestedMepSubsystems(spec: UniversalSpec): MepSubsystem[] {
  const out = new Set<MepSubsystem>();
  const cls = spec.classification;
  if (cls) {
    for (const id of [cls.primaryId, ...cls.secondaryIds]) {
      if (id && CLASSIFICATION_MEP[id]) out.add(CLASSIFICATION_MEP[id]);
    }
  }
  const t = spec.rawText || '';
  for (const { re, sub } of RAW_TEXT_MEP) {
    if (re.test(t)) out.add(sub);
  }
  return [...out];
}

/* ------------------------------------------------------------------ */
/* Klasifikasi parameter lokal (duplikasi sadar — lihat header)        */
/* ------------------------------------------------------------------ */

/** Klasifikasi semantik parameter dari key + label (cermin classifyParam kanonis di universalRab.ts). */
function classifyParamLocal(key: string, label: string): ParamKind {
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

/** Nilai spek untuk satu jenis ukuran (cermin specValueFor kanonis). */
function specValueLocal(spec: UniversalSpec, kind: ParamKind): number | null {
  switch (kind) {
    case 'length': return spec.lengthM;
    case 'span': return spec.spanM;
    case 'width': return spec.widthM;
    case 'area': return spec.areaM2;
    case 'thickness': return spec.thicknessCm;
    case 'floors': return spec.floors;
    case 'height': return spec.heightM;
    case 'depth': return spec.depthM;
    case 'volume': return spec.volumeM3;
    case 'count': return spec.count;
    case 'power': return spec.powerKva ?? null;
    default: return null;
  }
}

/** Label bahasa Indonesia untuk jenis ukuran (pesan D4). */
const BASIS_LABEL: Record<ParamKind, string> = {
  length: 'panjang',
  span: 'bentang',
  width: 'lebar',
  area: 'luas',
  thickness: 'tebal',
  floors: 'jumlah lantai',
  height: 'tinggi',
  depth: 'kedalaman',
  volume: 'volume',
  count: 'jumlah',
  power: 'daya',
  other: 'ukuran',
};

const NUMBER_PARAMS = (t: RabTemplate) =>
  (t.parameters ?? []).filter((p) => p.type === 'NUMBER');

/** Parameter JUMLAH TOTAL (num_units, num_rooms, …) — BUKAN per-lantai/per-unit. */
function isTotalCountParam(key: string): boolean {
  const k = key.toLowerCase();
  if (/per_/.test(k)) return false;
  return /^(num|jumlah)_/.test(k);
}

/**
 * Parameter JUMLAH UNIT (num_units/num_rooms/num_villas) — jumlah
 * unit/kamar bangunan yang diminta pengguna. BUKAN num_bedrooms /
 * num_bathrooms (jumlah ruangan DI DALAM satu unit) atau num_piles /
 * num_footings (jumlah titik struktur): memetakan "20 unit" ke
 * num_bedrooms akan menghitung 20 kamar tidur dalam SATU rumah.
 */
function isUnitCountParam(key: string): boolean {
  return /^num_(units|rooms|villas)$/.test(key.toLowerCase());
}

/** Parameter LUAS PER-UNIT (luas unit/kamar/villa — bukan luas total).
 * Diekspor (Batch 3 §6.3) agar mapSpecToParams (universalRab) memakai
 * predikat yang SAMA — luas total tidak pernah dipetakan ke parameter
 * per-unit di mana pun. */
export function isPerUnitAreaParam(key: string, label: string): boolean {
  const k = key.toLowerCase();
  const l = (label || '').toLowerCase();
  if (/(unit_area|room_area|villa_area)/.test(k)) return true;
  return /luas (per|rata-rata).*(unit|kamar|villa)/.test(l) || /luas per (unit|kamar)/.test(l);
}

function totalCountParams(t: RabTemplate) {
  return NUMBER_PARAMS(t).filter((p) => isTotalCountParam(p.key));
}

function unitCountParams(t: RabTemplate) {
  return NUMBER_PARAMS(t).filter((p) => isUnitCountParam(p.key));
}

function perUnitAreaParams(t: RabTemplate) {
  return NUMBER_PARAMS(t).filter((p) => isPerUnitAreaParam(p.key, p.label));
}

/**
 * Nilai pengguna yang di luar batas parameter template (cermin
 * paramOutOfRangeDetails kanonis — dipakai HANYA untuk kandidat
 * lintas-pool yang tidak melewati scoreTemplate; tanpa konversi
 * satuan tebal karena lintas-pool B1 tidak melibatkan parameter
 * tebal).
 */
function localOutOfRange(
  spec: UniversalSpec,
  t: RabTemplate,
): { keys: string[]; kinds: ParamKind[]; details: string[] } {
  const keys: string[] = [];
  const kinds: ParamKind[] = [];
  const details: string[] = [];
  for (const p of NUMBER_PARAMS(t)) {
    const kind = classifyParamLocal(p.key, p.label);
    const v = specValueLocal(spec, kind);
    if (v == null) continue;
    if ((p.min !== undefined && v < p.min) || (p.max !== undefined && v > p.max)) {
      keys.push(p.key);
      kinds.push(kind);
      details.push(`${p.label} = ${v}${p.unit ? ` ${p.unit}` : ''} di luar batas template (${p.min !== undefined ? p.min : '–'}–${p.max !== undefined ? p.max : '–'}${p.unit ? ` ${p.unit}` : ''})`);
    }
  }
  return { keys, kinds, details };
}

/* ------------------------------------------------------------------ */
/* Sinyal permintaan                                                   */
/* ------------------------------------------------------------------ */

interface RequestSignals {
  primary: SubcategoryDef | null;
  /** Subkategori yang relevan dengan scope ini (primer bila cocok, bila tidak sekunder yang cocok). */
  relevant: SubcategoryDef | null;
  buildingFamily: BuildingFamily | null;
  mepSubsystems: MepSubsystem[];
  isIntegratedMep: boolean;
  isRenovation: boolean;
  isDemolition: boolean;
  isReconstruction: boolean;
  hasExistingEvidence: boolean;
  roadMaterial: 'beton' | 'aspal' | null;
  isRetainingWall: boolean;
  countNoun: string | null;
  isMultiUnitResidential: boolean;
  rawLower: string;
}

function deriveSignals(spec: UniversalSpec, scope: ScopeGroup): RequestSignals {
  const cls = spec.classification;
  const primary = cls?.primaryId ? subcategoryById(cls.primaryId) : null;
  const secondaries: SubcategoryDef[] = (cls?.secondaryIds ?? [])
    .map((id) => subcategoryById(id))
    .filter((d): d is SubcategoryDef => d != null);
  // Subkategori yang relevan dengan scope ini: primer bila cakupannya
  // memuat scope ini, bila tidak sekunder yang memuatnya, bila tidak
  // ada — primer (agar sinyal tidak hilang pada scope turunan).
  let relevant: SubcategoryDef | null = null;
  if (primary && primary.scopes.includes(scope.id)) relevant = primary;
  if (!relevant) relevant = secondaries.find((d) => d.scopes.includes(scope.id)) ?? null;
  if (!relevant) relevant = primary;

  const rawLower = (spec.rawText || '').toLowerCase();
  const isRenovation = spec.isRenovation || primary?.id === 'renovasi' || secondaries.some((d) => d.id === 'renovasi');
  const isDemolition = spec.isDemolition || primary?.id === 'pembongkaran' || secondaries.some((d) => d.id === 'pembongkaran');
  const isReconstruction = /\brekonstruksi\b/.test(rawLower) || /\bbangun kembali\b/.test(rawLower);
  const hasExistingEvidence =
    isReconstruction || isDemolition ||
    /\b(eksisting|existing|jalan lama|bangunan lama|rusak|ambruk|roboh|bongkar|bekas)\b/.test(rawLower);

  let roadMaterial: RequestSignals['roadMaterial'] = null;
  if (scope.id === 'jalan') {
    const mats = spec.materialKeywords.map((m) => m.toLowerCase());
    if (mats.includes('beton') || /\b(beton|rigid|rabat)\b/.test(rawLower)) roadMaterial = 'beton';
    else if (mats.includes('aspal') || mats.includes('hotmix') || /\b(aspal|hotmix|hot mix)\b/.test(rawLower)) roadMaterial = 'aspal';
  }

  const isRetainingWall =
    primary?.id === 'dinding-penahan' || secondaries.some((d) => d.id === 'dinding-penahan');

  const countMatch = rawLower.match(/\b(\d+)\s*(unit|kamar|ruangan|titik|buah|villa)\b/);
  const countNoun = countMatch ? countMatch[2] : null;

  const buildingFamily = scope.id === 'gedung' ? requestBuildingFamily(spec) : null;
  const isMultiUnitResidential =
    scope.id === 'gedung' &&
    (buildingFamily === 'residential-house' || buildingFamily === 'residential-apartment') &&
    spec.count != null && spec.count > 1;

  const mepSubsystems = scope.id === 'mep' ? requestedMepSubsystems(spec) : [];
  const isIntegratedMep =
    primary?.id === 'mep-umum' || secondaries.some((d) => d.id === 'mep-umum') ||
    mepSubsystems.length >= 2;

  return {
    primary, relevant, buildingFamily, mepSubsystems, isIntegratedMep,
    isRenovation, isDemolition, isReconstruction, hasExistingEvidence,
    roadMaterial, isRetainingWall, countNoun, isMultiUnitResidential, rawLower,
  };
}

/* ------------------------------------------------------------------ */
/* Sinyal template                                                     */
/* ------------------------------------------------------------------ */

type TemplateConstructionType = 'new' | 'renovation' | 'reconstruction' | 'demolition';

function templateConstructionType(t: RabTemplate): TemplateConstructionType {
  if (t.category === 'DEMOLISI_REKONSTRUKSI') return 'demolition';
  const hay = `${t.name} ${t.subcategory ?? ''}`.toLowerCase();
  if (/rekonstruksi|reconstruction/.test(hay)) return 'reconstruction';
  if (/demolisi|pembongkaran|strip-out|strip out/.test(hay)) return 'demolition';
  if (/renovasi|fit-out|fit out|restorasi|rehabilitasi|rehab|pemeliharaan|maintenance/.test(hay)) return 'renovation';
  return 'new';
}

function templateRoadMaterial(t: RabTemplate): 'beton' | 'aspal' | null {
  const hay = `${t.name} ${t.subcategory ?? ''}`.toLowerCase();
  if (/\baspal\b|hotmix|perkerasan lentur/.test(hay)) return 'aspal';
  if (/\bbeton\b|rigid|perkerasan kaku/.test(hay)) return 'beton';
  return null;
}

/* ------------------------------------------------------------------ */
/* Penilaian satu kandidat                                             */
/* ------------------------------------------------------------------ */

function assessCandidate(
  pick: TemplatePick,
  spec: UniversalSpec,
  scope: ScopeGroup,
  sig: RequestSignals,
  relevantKinds: ParamKind[],
  crossPool: boolean,
): CandidateAssessment {
  const t = pick.template;
  const violations: SuitabilityViolation[] = [];
  const softNotes: string[] = [];
  const hay = `${t.name} ${t.subcategory ?? ''}`.toLowerCase();

  /* F1 — fungsi bangunan (scope gedung). */
  if (scope.id === 'gedung' && sig.buildingFamily && sig.buildingFamily !== 'generic') {
    const fams = templateBuildingFamilies(t);
    if (!fams.includes(sig.buildingFamily)) {
      violations.push({
        kind: 'function',
        reason: `template untuk ${fams.map((f) => FAMILY_LABELS[f]).join('/')} — bukan ${FAMILY_LABELS[sig.buildingFamily]}`,
      });
    }
  }

  /* F2 — dinding penahan bukan landscape (scope lanskap). */
  if (scope.id === 'lanskap' && sig.isRetainingWall && t.category === 'LANDSCAPE_SITE') {
    violations.push({
      kind: 'function',
      reason: 'template landscape (taman/hardscape) — bukan struktur dinding penahan tanah',
    });
  }

  /* T1 — tipe konstruksi. */
  const ctype = templateConstructionType(t);
  if (ctype === 'renovation' && !sig.isRenovation && !sig.isReconstruction && !sig.hasExistingEvidence) {
    violations.push({ kind: 'construction-type', reason: 'template renovasi/rehabilitasi — permintaan ini pekerjaan baru' });
  }
  if (ctype === 'reconstruction' && !sig.hasExistingEvidence) {
    violations.push({ kind: 'construction-type', reason: 'template rekonstruksi berasumsi ada struktur eksisting yang dibongkar — permintaan tidak menyebut struktur eksisting' });
  }
  if (ctype === 'demolition' && !sig.isDemolition) {
    violations.push({ kind: 'construction-type', reason: 'template pembongkaran — permintaan tidak menyebut demolisi' });
  }
  if (ctype === 'new' && sig.isReconstruction) {
    violations.push({ kind: 'construction-type', reason: 'template bangunan baru — permintaan ini rekonstruksi struktur eksisting (butuh pembongkaran + pembangunan kembali)' });
  }

  /* M1 — material jalan: beton ≠ aspal. */
  if (scope.id === 'jalan' && sig.roadMaterial) {
    const tm = templateRoadMaterial(t);
    if (tm && tm !== sig.roadMaterial) {
      violations.push({
        kind: 'material',
        reason: `template jalan ${tm === 'beton' ? 'beton' : 'aspal'} — permintaan menyebut jalan ${sig.roadMaterial}`,
      });
    }
  }

  /* M2 — material jembatan (cermin penjaga downstream di buildDraftPart). */
  if (scope.id === 'jembatan') {
    const wantsConcrete = spec.materialKeywords.includes('beton');
    const wantsSteel = spec.materialKeywords.includes('baja');
    const isSteelTpl = /baja|steel|truss|bailey/.test(hay) && !hay.includes('beton');
    const isConcreteTpl = hay.includes('beton') && !/baja|steel/.test(hay);
    if (wantsConcrete && isSteelTpl) {
      violations.push({ kind: 'material', reason: 'template jembatan baja — permintaan menyebut jembatan beton' });
    }
    if (wantsSteel && isConcreteTpl) {
      violations.push({ kind: 'material', reason: 'template jembatan beton — permintaan menyebut jembatan baja' });
    }
  }

  /* S1 — cakupan MEP: satu subsistem tidak boleh memakai paket terpadu. */
  if (scope.id === 'mep' && sig.mepSubsystems.length > 0) {
    const subs = TEMPLATE_MEP_SUBSYSTEMS[t.id];
    if (!subs) {
      // Template di luar peta subsistem MEP (misal kandidat lintas-pool
      // dari DRAINASE_SANITASI): subsistemnya tidak dapat diverifikasi
      // — untuk permintaan satu subsistem, ia bukan kandidat yang sah.
      // Permintaan MEP terpadu tetap boleh memakainya.
      if (!sig.isIntegratedMep) {
        violations.push({
          kind: 'scope-coverage',
          reason: `template ini bukan template subsistem MEP (${sig.mepSubsystems.join(', ')}) — cakupannya tidak dapat diverifikasi sebagai ${sig.mepSubsystems.join(', ')} saja`,
        });
      }
    } else {
      const isPackage = t.id === 'MEP-COMPLETE-PKG';
      if (isPackage && !sig.isIntegratedMep) {
        violations.push({
          kind: 'scope-coverage',
          reason: 'paket MEP terpadu mencakup 5 subsistem (listrik, plumbing, HVAC, fire, data) — permintaan hanya satu subsistem, jangan diperluas diam-diam',
        });
      } else if (!isPackage) {
        // Template subsistem sah bila SEMUA subsistemnya diminta, atau
        // bila ia adalah satu-satunya subsistem yang diminta.
        // 'lighting' melayani permintaan 'listrik' yang menyebut
        // penerangan; 'kawasan-*' melayani permintaan jaringan.
        const requested = new Set(sig.mepSubsystems);
        const covered = subs.every((s) => {
          if (requested.has(s)) return true;
          if (s === 'lighting' && requested.has('listrik') && /\b(penerangan|pju|lampu)\b/.test(sig.rawLower)) return true;
          return false;
        });
        if (!covered) {
          violations.push({
            kind: 'scope-coverage',
            reason: `template subsistem ${subs.join('/')} — permintaan meminta ${sig.mepSubsystems.join(', ')}`,
          });
        }
      }
    }
  }

  /* I1 (B2 §5.3) — irigasi bukan drainase biasa: untuk scope irigasi,
   * template yang namanya menunjukkan drainase biasa (tanpa 'irigasi')
   * ditolak — pool SDA_IRIGASI mencampur keduanya, dan penskoran saja
   * memilih SDA-DRAIN-UDITCH untuk scope irigasi pada teks campuran
   * ("drainase 500 m dan saluran irigasi 300 m") sehingga part irigasi
   * hilang digabung dedup ke part drainase. Template netral (box
   * culvert, sungai, bendung, embung — tanpa kata 'drainase') lolos;
   * satu-satunya template yang ditolak aturan ini di katalog saat ini
   * adalah SDA-DRAIN-UDITCH. */
  if (scope.id === 'irigasi' && /drainase|drain\b/.test(hay) && !/irigasi/.test(hay)) {
    violations.push({
      kind: 'scope-discipline',
      reason: 'template drainase biasa — permintaan ini saluran irigasi (SDA), bukan drainase',
    });
  }

  /* D1 — DIHAPUS (2026-11-23, temuan sapuan regresi B1): dimensi
   * relevan di luar batas BUKAN constraint keras. Rentang dimensi
   * adalah soal DERAJAT, bukan jenis: gedung 96 m² vs minimum
   * template 100 m² (selisih 4%) adalah noise, dan penolakan keras
   * atasnya memilih template yang SALAH secara semantik (sekolah
   * untuk gedung kantor generik; kandang ayam untuk gudang) serta
   * memecahkan golden multi-gedung Gate 2 (5B-01/02/05/06/13).
   * Kelima kegagalan W13 tidak bergantung pada D1 (F1/F2/T1/M1/S1/
   * D2/D3/D4 yang mengerjakannya). Nilai di luar batas ditangani
   * mesin yang sudah ada dan teruji: peringatan jujur partIssues +
   * demosi untuk jenis non-relevan (pickTemplateForScope). */

  /* D2 — semantik per-unit: luas total ke parameter per-unit. */
  if (spec.areaM2 != null) {
    const perUnit = perUnitAreaParams(t);
    const oorKeys = new Set(pick.outOfRangeKeys ?? []);
    const hit = perUnit.find((p) => oorKeys.has(p.key));
    if (hit) {
      violations.push({
        kind: 'dimensional-per-unit',
        reason: `luas ${spec.areaM2} m² adalah luas TOTAL, tetapi template memakainya sebagai "${hit.label}" (per unit) — volume akan terhitung ${spec.count != null && spec.count > 1 ? `${spec.count}× ` : ''}lebih besar dari maksud Anda`,
      });
    }
  }

  /* D3 — representasi jumlah (multi-unit residensial): template
   * tanpa parameter JUMLAH UNIT (num_units/num_rooms/num_villas)
   * tidak dapat mewakili N unit yang diminta — ia akan menghitung
   * SATU bangunan. BUKAN num_bedrooms/num_bathrooms: memetakan
   * "20 unit" ke num_bedrooms menghitung 20 kamar tidur dalam satu
   * rumah. Tanpa fallback. */
  if (sig.isMultiUnitResidential && unitCountParams(t).length === 0) {
    violations.push({
      kind: 'count-representability',
      reason: `template tidak memiliki parameter jumlah unit — tidak dapat mewakili ${spec.count} unit yang Anda sebut (ia menghitung satu bangunan)`,
    });
  }

  /* D4 — dasar ukuran diterima (scope MEP SAJA): template harus menerima
   * setidaknya SATU basis ukuran utama yang dinyatakan pengguna
   * (luas/panjang/kedalaman, sesuai scope). Template yang tidak menerima
   * satu pun — misal template distribusi listrik yang hanya berparameter
   * kVA/lantai/tinggi untuk permintaan berbasis luas — akan dihitung
   * seluruhnya dari nilai default; untuk MEP nilai default itu absurd
   * skalanya (800 kVA untuk 120 m² → Rp1,4 M — isinya dikarang, bukan
   * dari spesifikasi pengguna). Tanpa fallback.
   * DIBATASI ke MEP dengan sengaja: di scope lain nilai default template
   * umumnya ukuran standar yang wajar (kolam 25 m, dsb.) dan penskoran
   * sudah menghukum −8 template yang tak menerima basis pengguna —
   * D4 di semua scope terbukti menolak template yang BENAR (kolam renang
   * untuk "kolam ikan 10x20", A-088) karena parser spek hanya
   * meneruskan luas totalnya, bukan panjang/lebarnya. */
  if (scope.id === 'mep') {
    // B2 §5.3: basis ukuran MEP juga mencakup lantai/jumlah/daya —
    // template MEP berparameter num_floors (plumbing/fire/electrical),
    // num_points (data), installed_kva (electrical). Tanpa ini, D4
    // tidak melihat basis lantai/titik/kVA yang dinyatakan pengguna
    // (relevantKinds areaOrLength hanya luas/panjang/kedalaman) sehingga
    // statedKinds KOSONG dan D4 dilewati seluruhnya — template listrik
    // yang tidak menerima satu pun basis yang dinyatakan (mis.
    // ELECTRICAL-DIST untuk "40 titik") lolos dan dihitung seluruhnya
    // dari default absurd (800 kVA), persis yang ingin dicegah D4.
    const mepKinds: ParamKind[] = [...relevantKinds, 'floors', 'count', 'power'];
    const statedKinds = mepKinds.filter((k) => specValueLocal(spec, k) != null);
    if (statedKinds.length > 0) {
      const templateKinds = new Set(NUMBER_PARAMS(t).map((p) => classifyParamLocal(p.key, p.label)));
      const acceptsAny = statedKinds.some((k) => templateKinds.has(k));
      if (!acceptsAny) {
        const basisLabel = statedKinds.map((k) => BASIS_LABEL[k] ?? k).join('/');
        violations.push({
          kind: 'missing-basis',
          reason: `template ini tidak menerima dasar ukuran yang Anda nyatakan (${basisLabel}) — semua parameternya akan memakai nilai default, bukan spesifikasi Anda`,
        });
      }
    }
  }

  /* --- Sinyal lunak: kecocokan kata benda jumlah (±4). Hanya hunian
   * multi-unit gedung: di scope lain jumlah sering bocor dari scope
   * lain dalam teks campuran dan tidak boleh memengaruhi peringkat.
   * Hanya parameter jumlah UNIT yang dinilai (bukan num_inlets dsb). --- */
  let adjustedScore = pick.score;
  if (sig.isMultiUnitResidential && spec.count != null && sig.countNoun) {
    const nounKey: Record<string, RegExp> = {
      unit: /^num_units$/,
      kamar: /^num_rooms$/,
      ruangan: /^num_rooms$/,
      titik: /^num_points$/,
      villa: /^num_villas$/,
      buah: /^num_(units|rooms|villas)$/,
    };
    const re = nounKey[sig.countNoun];
    const units = unitCountParams(t);
    if (re && units.length > 0) {
      if (units.some((p) => re.test(p.key))) {
        adjustedScore += 4;
        softNotes.push(`parameter jumlah cocok ("${sig.countNoun}") (+4)`);
      } else {
        adjustedScore -= 4;
        softNotes.push(`parameter jumlah tidak cocok ("${sig.countNoun}") (−4)`);
      }
    }
  }

  return {
    templateId: t.id,
    templateName: t.name,
    category: t.category,
    score: pick.score,
    adjustedScore,
    crossPool,
    valid: violations.length === 0,
    violations,
    softNotes,
  };
}

/* ------------------------------------------------------------------ */
/* Ekspansi lintas-pool                                                */
/* ------------------------------------------------------------------ */

/** Fraksi parameter NUMBER template yang terisi nilai pengguna (0–1). */
function paramCoverage(spec: UniversalSpec, t: RabTemplate): number {
  const params = NUMBER_PARAMS(t);
  if (params.length === 0) return 0;
  let filled = 0;
  for (const p of params) {
    if (specValueLocal(spec, classifyParamLocal(p.key, p.label)) != null) filled++;
  }
  return filled / params.length;
}

function crossPoolCandidates(
  spec: UniversalSpec,
  scope: ScopeGroup,
  sig: RequestSignals,
  relevantKinds: ParamKind[],
): CandidateAssessment[] {
  const def = sig.relevant;
  if (!def) return [];
  const extraCategories = def.catalog.filter((c) => !scope.categories.includes(c as never));
  if (extraCategories.length === 0) return [];
  const svc = RabTemplateService.getInstance();
  const pool = svc.getAllTemplates().filter(
    (t) => extraCategories.includes(t.category) && t.metadata.source === 'EZRAB_OFFICIAL',
  );
  const assessed: CandidateAssessment[] = [];
  for (const t of pool) {
    // Skor evaluator lintas-pool: cakupan parameter (0–10) + kecocokan
    // nama terhadap kata kunci spesifik subkategori (0–4), dikurangi
    // 3 per parameter di luar batas (spesifikasi pengguna tidak pas
    // dengan template itu). BUKAN skor penskoran (yang menghukum −20
    // untuk kategori di luar scope).
    const hay = `${t.name} ${t.subcategory ?? ''}`.toLowerCase();
    const nameHits = def.specific.filter((k) => hay.includes(k)).length;
    const coverage = paramCoverage(spec, t);
    // Batas parameter dihitung lokal (cermin paramOutOfRangeDetails
    // kanonis) agar aturan D1/D2 berlaku juga lintas-pool.
    const oor = localOutOfRange(spec, t);
    const evalScore = Math.round(coverage * 10 + nameHits * 2) - oor.keys.length * 3;
    const synthPick: TemplatePick = {
      template: t,
      score: evalScore,
      reasons: [`cakupan parameter ${(coverage * 100).toFixed(0)}%`, ...(nameHits > 0 ? [`nama cocok kata kunci subkategori (${nameHits})`] : [])],
      outOfRange: oor.details,
      outOfRangeKinds: oor.kinds,
      outOfRangeKeys: oor.keys,
      nameMatches: [],
    };
    const a = assessCandidate(synthPick, spec, scope, sig, relevantKinds, true);
    a.softNotes.unshift(`kandidat lintas-pool dari kategori ${t.category} (taksonomi ${def.id})`);
    assessed.push(a);
  }
  // Urut: valid dulu, lalu skor evaluator, lalu urutan katalog (stabil).
  return assessed
    .map((a, i) => ({ a, i }))
    .sort((x, y) => (Number(y.a.valid) - Number(x.a.valid)) || (y.a.adjustedScore - x.a.adjustedScore) || (x.i - y.i))
    .map((x) => x.a);
}

/* ------------------------------------------------------------------ */
/* Spek yang hilang (NEEDS_CLARIFICATION)                              */
/* ------------------------------------------------------------------ */

function missingSpecsFor(
  spec: UniversalSpec,
  scope: ScopeGroup,
  sig: RequestSignals,
  rejections: CandidateAssessment[],
): string[] {
  const out: string[] = [];
  if (scope.id === 'mep') {
    if (sig.mepSubsystems.includes('listrik') && !sig.mepSubsystems.includes('lighting')) {
      // B2: teks B1 ("daya/titik") dikoreksi — tidak ada template
      // listrik katalog yang berparameter titik (jumlah titik hanya
      // berlaku untuk jaringan data); basis listrik yang sah adalah
      // daya (kVA) atau jumlah lantai.
      out.push('daya listrik terpasang (kVA) atau jumlah lantai — template listrik katalog berparameter daya/lantai, bukan luas atau jumlah titik');
    }
    if (sig.mepSubsystems.includes('plumbing')) {
      out.push('jumlah lantai dan jumlah unit basah, atau panjang jaringan pipa (m) — template plumbing katalog berparameter lantai/unit/panjang, bukan luas');
    }
    if (sig.mepSubsystems.includes('data')) {
      out.push('jumlah titik jaringan (titik)');
    }
    if (sig.mepSubsystems.includes('solar')) {
      out.push('kapasitas terpasang yang diinginkan (kWp)');
    }
  }
  if (scope.id === 'gedung') {
    const perUnitHit = rejections.some((r) => r.violations.some((v) => v.kind === 'dimensional-per-unit'));
    if (perUnitHit && spec.count != null && spec.count > 1) {
      out.push('luas per unit (m²) — bukan luas total — agar tiap unit dapat dihitung');
    }
    if (perUnitHit && sig.buildingFamily === 'hospitality-hotel') {
      out.push('jumlah kamar (unit)');
      out.push('luas rata-rata per kamar (m²)');
    }
    if (perUnitHit && sig.buildingFamily === 'residential-apartment') {
      out.push('jumlah unit');
      out.push('luas rata-rata per unit (m²)');
    }
    if (sig.isMultiUnitResidential && spec.areaM2 == null) {
      out.push('luas per unit (m²) atau luas total kawasan (m²)');
    }
  }
  if (scope.id === 'jembatan' && spec.spanM == null) {
    out.push('bentang jembatan (m)');
  }
  if (out.length === 0) {
    out.push('spesifikasi yang lebih rinci (jenis material, dimensi, atau tipe pekerjaan)');
  }
  return [...new Set(out)];
}

/* ------------------------------------------------------------------ */
/* Evaluator utama                                                     */
/* ------------------------------------------------------------------ */

/**
 * Nilai kesesuaian kandidat template untuk satu cakupan.
 *
 * @param ranked — kandidat yang SUDAH dinilai scoreTemplate (urutan
 *   skor, stabil). Evaluator tidak mengubah penskoran — hanya
 *   memutuskan kandidat mana yang BOLEH dipilih.
 */
export function evaluateTemplateSuitability(
  spec: UniversalSpec,
  scope: ScopeGroup,
  ranked: TemplatePick[],
  opts: SuitabilityOptions,
): SuitabilityDecision {
  const sig = deriveSignals(spec, scope);
  const relevantKinds = opts.relevantKinds;
  const providedValues: SuitabilityDecision['providedValues'] = {
    luas_m2: spec.areaM2,
    panjang_m: spec.lengthM,
    lebar_m: spec.widthM,
    bentang_m: spec.spanM,
    tinggi_m: spec.heightM,
    kedalaman_m: spec.depthM,
    jumlah: spec.count,
    lantai: spec.floors,
    klasifikasi: sig.primary?.id ?? null,
  };

  /* Bentang jembatan belum disebut: tidak ada kandidat yang bisa
   * dinilai — klarifikasi (jalur kabel memakai gerbang ukuran yang
   * sama pesannya; evaluator mandiri menjawab langsung). */
  if (scope.id === 'jembatan' && spec.spanM == null) {
    return {
      outcome: 'NEEDS_CLARIFICATION',
      scopeId: scope.id,
      selectedTemplateId: null,
      candidates: [],
      rejections: [],
      fallbackUsed: false,
      crossPoolUsed: false,
      hardViolations: [],
      missingSpecs: ['bentang jembatan (m)'],
      providedValues,
      assumptions: [],
      explanation: 'Jembatan membutuhkan bentang untuk memilih template — tanpa bentang, volume tidak dapat dihitung secara bertanggung jawab.',
      scopeCoverage: null,
      requiredConfirmation: null,
    };
  }

  /* Bentang di luar jangkauan template SEJENIS MATERIALNYA: butuh DED
   * (bukan klarifikasi — penggunanya SUDAH menyebut bentang; yang
   * tidak ada adalah template yang mampu). Dicek SEBELUM penilaian
   * kandidat: aturan D1 sengaja TIDAK berlaku untuk scope jembatan
   * (Box Culvert memakai parameter `crossing_length` berjenis length,
   * bukan span — ia akan lolos D1 dan terpilih untuk bentang 50 m,
   * menembus penjaga needs-spec downstream). Batas dihitung dari
   * template yang materialnya cocok dengan permintaan (beton → maks
   * template beton; tanpa material → maks semua template). */
  if (scope.id === 'jembatan' && spec.spanM != null) {
    const wantsConcrete = spec.materialKeywords.includes('beton');
    const wantsSteel = spec.materialKeywords.includes('baja');
    let maxSpan: number | null = null;
    for (const pick of ranked) {
      const hay = `${pick.template.name} ${pick.template.subcategory ?? ''}`.toLowerCase();
      const isSteel = /baja|steel|truss|bailey/.test(hay) && !hay.includes('beton');
      const isConcrete = hay.includes('beton') && !/baja|steel/.test(hay);
      if (wantsConcrete && !isConcrete) continue;
      if (wantsSteel && !isSteel) continue;
      for (const p of NUMBER_PARAMS(pick.template)) {
        if (classifyParamLocal(p.key, p.label) === 'span' && p.max !== undefined) {
          maxSpan = maxSpan == null ? p.max : Math.max(maxSpan, p.max);
        }
      }
    }
    if (maxSpan != null && spec.spanM > maxSpan) {
      // Wording disamakan dengan penjaga downstream di buildDraftPart
      // (pin klasifikasi: reason needs-spec = alasan skip verbatim).
      const materialWord = wantsConcrete ? 'beton' : wantsSteel ? 'baja' : 'jembatan';
      return {
        outcome: 'ENGINEERING_REVIEW_REQUIRED',
        scopeId: scope.id,
        selectedTemplateId: null,
        candidates: [],
        rejections: [],
        fallbackUsed: false,
        crossPoolUsed: false,
        hardViolations: [],
        missingSpecs: ['desain struktur khusus (gambar DED, tipe girder, dan perhitungan struktur oleh perencana) — jembatan bentang ini tidak boleh dirinci dari template umum'],
        providedValues,
        assumptions: [],
        explanation: `Bentang ${spec.spanM} m di luar cakupan template ${materialWord} katalog (maks ${maxSpan} m).`,
        scopeCoverage: null,
        requiredConfirmation: null,
      };
    }
  }

  const assessed = ranked.map((pick) => assessCandidate(pick, spec, scope, sig, relevantKinds, false));
  const valid = assessed.filter((a) => a.valid);
  // Urutan valid: skor penyesuaian, lalu urutan penskoran (stabil).
  const validRanked = valid
    .map((a, i) => ({ a, i: assessed.indexOf(a) }))
    .sort((x, y) => y.a.adjustedScore - x.a.adjustedScore || x.i - y.i)
    .map((x) => x.a);
  const rejections = assessed.filter((a) => !a.valid);
  const topRejected = rejections.length > 0 ? rejections[0] : null;
  const hardViolations = topRejected
    ? topRejected.violations.map((v) => `"${topRejected.templateName}": ${v.reason}`)
    : [];

  const base: Omit<SuitabilityDecision, 'outcome' | 'selectedTemplateId' | 'candidates' | 'rejections' | 'fallbackUsed' | 'crossPoolUsed' | 'explanation' | 'assumptions' | 'scopeCoverage' | 'requiredConfirmation'> = {
    scopeId: scope.id,
    hardViolations,
    missingSpecs: [],
    providedValues,
  };

  const finishSelection = (
    selected: CandidateAssessment,
    candidates: CandidateAssessment[],
    extra: Partial<Pick<SuitabilityDecision, 'fallbackUsed' | 'crossPoolUsed' | 'assumptions' | 'scopeCoverage' | 'requiredConfirmation' | 'outcome'>>,
  ): SuitabilityDecision => {
    const outcome = extra.outcome ?? 'SELECTED';
    const assumptions = [...(extra.assumptions ?? [])];
    // Caveat katalog: tidak ada template khusus untuk fungsi ini.
    if (scope.id === 'gedung' && sig.buildingFamily === 'commercial' && /ruko/i.test(spec.rawText)) {
      assumptions.push('Katalog belum memiliki template ruko khusus; dipakai template bangunan komersial terdekat — periksa cakupannya sebelum transfer.');
    }
    if (scope.id === 'gedung' && sig.isMultiUnitResidential && selected.templateId === 'BLD-RUSUN') {
      assumptions.push('Katalog belum memiliki template perumahan tapak (landed estate); dipakai template rumah susun (unit bertumpuk, jumlah unit terhitung) — periksa sebelum transfer bila maksud Anda rumah tapak.');
    }
    if (extra.fallbackUsed) {
      assumptions.push(`Nilai Anda di luar batas template "${selected.templateName}" — volume dihitung dari nilai Anda apa adanya (lihat peringatan batas).`);
    }
    if (extra.crossPoolUsed) {
      assumptions.push(`Template "${selected.templateName}" berasal dari kategori ${selected.category} — cakupan ${scope.label} tidak memiliki template khusus untuk pekerjaan ini.`);
    }
    const topScore = ranked[0];
    const rejectedTopNote =
      topScore && topScore.template.id !== selected.templateId && rejections.some((r) => r.templateId === topScore.template.id)
        ? ` Template skor tertinggi ("${topScore.template.name}") tidak dipakai: ${rejections.find((r) => r.templateId === topScore.template.id)!.violations[0].reason}.`
        : '';
    return {
      ...base,
      outcome,
      selectedTemplateId: selected.templateId,
      candidates,
      rejections,
      fallbackUsed: extra.fallbackUsed ?? false,
      crossPoolUsed: extra.crossPoolUsed ?? false,
      assumptions,
      explanation: `Template "${selected.templateName}" dipilih untuk ${scope.label} — memenuhi fungsi, tipe konstruksi, dan ukuran yang Anda sebut.${rejectedTopNote}`,
      scopeCoverage: extra.scopeCoverage ?? null,
      requiredConfirmation: extra.requiredConfirmation ?? null,
    };
  };

  /* --- 1. Kandidat valid dalam pool. --- */
  if (validRanked.length > 0) {
    const top = validRanked[0];
    const second = validRanked[1];
    // MULTIPLE_CANDIDATES: ≥2 kandidat valid dari keluarga berbeda
    // dengan selisih skor tipis (≤3) — perbedaannya material.
    let outcome: SuitabilityOutcome = 'SELECTED';
    let requiredConfirmation: string | null = null;
    if (second && top.adjustedScore - second.adjustedScore <= 3) {
      const familiesDiffer =
        scope.id === 'gedung'
          ? !templateBuildingFamilies(ranked.find((r) => r.template.id === top.templateId)!.template)
              .some((f) => templateBuildingFamilies(ranked.find((r) => r.template.id === second.templateId)!.template).includes(f))
          : top.category !== second.category;
      if (familiesDiffer) {
        outcome = 'MULTIPLE_CANDIDATES';
        requiredConfirmation = `Ada ${validRanked.length} template yang layak: "${top.templateName}" dan "${second.templateName}" (dan ${validRanked.length - 2} lainnya bila ada) — pilih yang paling sesuai karena cakupannya berbeda. Draft memakai "${top.templateName}" sebagai pilihan utama; ubah lewat revisi "ganti menjadi …".`;
      }
    }
    return finishSelection(top, validRanked, { outcome, requiredConfirmation });
  }

  /* --- 2. Ekspansi lintas-pool (taksonomi). --- */
  const cross = crossPoolCandidates(spec, scope, sig, relevantKinds);
  const crossValid = cross.filter((a) => a.valid);
  if (crossValid.length > 0) {
    const top = crossValid[0];
    return finishSelection(top, crossValid, {
      crossPoolUsed: true,
      scopeCoverage: `Template ${top.templateName} (${top.category}) dipakai untuk cakupan ${scope.label}.`,
    });
  }
  const allRejections = [...rejections, ...cross.filter((a) => !a.valid)];

  /* --- 3. (Dihapus bersama D1 — lihat catatan D1 di atas.) Dulu:
   * fallback rentang untuk pelanggaran D1 murni. Tanpa D1 tidak ada
   * lagi pelanggaran 'dimensional-range', sehingga cabang ini mati.
   * Nilai di luar batas ditangani mesin peringatan/demosi yang sudah
   * ada; `fallbackUsed` dipertahankan di kontrak (selalu false). --- */

  /* --- 4. Tidak ada kandidat yang sah. --- */
  if (ranked.length === 0) {
    return {
      ...base,
      outcome: 'UNSUPPORTED',
      selectedTemplateId: null,
      candidates: [],
      rejections: [],
      fallbackUsed: false,
      crossPoolUsed: false,
      missingSpecs: [],
      assumptions: [],
      explanation: `Katalog EZRAB belum memiliki template untuk cakupan ${scope.label}. Anda dapat menyusun RAB manual lewat menu RAB & Estimasi, atau menjelaskan pekerjaannya lebih rinci.`,
      scopeCoverage: null,
      requiredConfirmation: null,
    };
  }

  return {
    ...base,
    outcome: 'NEEDS_CLARIFICATION',
    selectedTemplateId: null,
    candidates: [],
    rejections: allRejections,
    fallbackUsed: false,
    crossPoolUsed: false,
    missingSpecs: missingSpecsFor(spec, scope, sig, allRejections),
    assumptions: [],
    explanation: `Tidak ada template katalog yang cocok untuk ${scope.label} dengan spesifikasi ini.${hardViolations.length > 0 ? ` Kandidat terdekat ditolak: ${hardViolations[0]}.` : ''} Lengkapi spesifikasi yang diminta agar draft dapat dibuat — atau susun RAB manual lewat menu RAB & Estimasi.`,
    scopeCoverage: null,
    requiredConfirmation: null,
  };
}

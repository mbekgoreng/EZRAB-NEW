/**
 * projectIntake.ts — KONTEKS PROYEK PERCAKAPAN + FOLLOW-UP KONTEKSTUAL
 * (Conversational Intelligence Upgrade — master prompt owner 2026-11-10).
 *
 * Masalah pemicu: pengguna menulis "BUATKAN SAYA RAB LANDSCAPE DENGAN
 * TOTAL LUAS 1 HEKTAR" dan asisten menjawab menu generik 4 jalur
 * (Rumah tinggal / Dari gambar DED / Pakai template / Manual) — padahal
 * kategori dan luas SUDAH diberikan. Asisten harus mengenali intent,
 * mengekstrak konteks yang sudah diketahui, dan melanjutkan percakapan
 * secara natural: menanyakan SATU hal paling relevan berikutnya, bukan
 * me-restart workflow.
 *
 * Modul ini adalah lapisan INTAKE di atas arsitektur yang sudah ada —
 * BUKAN sistem paralel:
 *  - Ekstraksi memakai parser yang sudah ada (rabNeeds.extractRabNeeds,
 *    universalRab.extractUniversalSpec/detectScopes) ditambah konversi
 *    satuan luas (hektar/are) yang sebelumnya tidak dikenal lapisan
 *    mana pun (terbukti: "1 hektar" terbaca sebagai luas 1 m²).
 *  - Konteks proyek terstruktur (ProjectIntakeContext) bertahan antar-
 *    pesan dalam sesi modul ini, dengan pembedaan tegas: nilai
 *    TERKONFIRMASI dari teks pengguna vs SARAN AI (hanya menjadi
 *    terkonfirmasi bila pengguna memilih/menyebutnya) vs yang masih
 *    BELUM TERESOLUSI (missingInformation). Koreksi pengguna menimpa
 *    kolom terkait saja.
 *  - Alur follow-up pertama yang dipetakan penuh: LANDSCAPE (konsep →
 *    fasilitas per konsep, daftar persis §3 master prompt — saran
 *    kontekstual, BUKAN spesifikasi wajib). Kategori lain dijembatani
 *    ke alur yang sudah ada (ringkasan kebutuhan rumah, klarifikasi
 *    subtipe, gerbang material, draft universal) oleh pemanggil di
 *    actionRegistry — modul ini tidak menggandakan jalur-jalur itu.
 *  - Pembangkitan RAB tetap mesin kanonis: actionRegistry menyerahkan
 *    konteks yang sudah matang ke buildUniversalDraft (katalog template
 *    + engine template deterministik). Modul ini sendiri TIDAK
 *    menghitung harga/volume dan TIDAK mengarang angka.
 *
 * Kejujuran katalog (terverifikasi 2026-11-10 terhadap
 * RabTemplateService): kategori LANDSCAPE_SITE punya 6 template —
 * LAND-PARK-RESIDENCE (taman kawasan/perumahan), LAND-URBAN-PARK
 * (taman kota), LAND-POOL-WATERFEATURE (resort), LAND-HARDSCAPE-
 * STREETSCAPE, LAND-FENCE-GATE, LAND-IRRIGATION-SYSTEM. Konsep
 * "Landscape komersial" dan "Ruang terbuka hijau" TIDAK punya template
 * khusus — pemetaannya dinyatakan terbuka di pratinjau (template
 * terdekat), tidak pernah diklaim sebagai template khusus.
 */

import { extractRabNeeds, parseAreaNumber, type RabNeeds } from './rabNeeds';
import { detectScopes, extractUniversalSpec } from './universalRab';
import { RabTemplateService } from '../../services/rabTemplateService';

/* ------------------------------------------------------------------ */
/* Kategori proyek (selaras §2 master prompt)                          */
/* ------------------------------------------------------------------ */

export type ProjectCategory =
  | 'RESIDENTIAL'
  | 'COMMERCIAL'
  | 'INFRASTRUCTURE'
  | 'ROAD'
  | 'DRAINAGE'
  | 'BRIDGE'
  | 'LANDSCAPE'
  | 'PUBLIC_SPACE'
  | 'INTERIOR'
  | 'RENOVATION'
  | 'EARTHWORKS'
  | 'STRUCTURAL'
  | 'MEP'
  | 'BUILDING'
  | 'OTHER';

export const CATEGORY_LABELS: Record<ProjectCategory, string> = {
  RESIDENTIAL: 'Bangunan residensial (rumah tinggal)',
  COMMERCIAL: 'Bangunan komersial',
  INFRASTRUCTURE: 'Infrastruktur',
  ROAD: 'Jalan & perkerasan',
  DRAINAGE: 'Drainase',
  BRIDGE: 'Jembatan',
  LANDSCAPE: 'Landscape',
  PUBLIC_SPACE: 'Taman & ruang publik',
  INTERIOR: 'Pekerjaan interior',
  RENOVATION: 'Renovasi',
  EARTHWORKS: 'Pekerjaan tanah',
  STRUCTURAL: 'Pekerjaan struktur',
  MEP: 'Pekerjaan MEP',
  BUILDING: 'Bangunan gedung',
  OTHER: 'Pekerjaan konstruksi lain',
};

/* ------------------------------------------------------------------ */
/* Konteks proyek terstruktur (objek internal §2 — bukan tampilan)     */
/* ------------------------------------------------------------------ */

export type IntakeStage = 'identity' | 'concept' | 'facilities' | 'site' | 'technical' | 'preview';

/** Satu alokasi luas eksplisit dari pengguna (tujuan + luas + teks asli). */
export interface AreaAllocation {
  purpose: string;
  areaM2: number;
  original: string;
}

export interface ProjectIntakeContext {
  intent: 'CREATE_RAB';
  category: ProjectCategory | null;
  categoryLabel: string | null;
  /** Kata kategori apa adanya dari teks ("landscape", "taman kota", …). */
  categoryTerm: string | null;
  projectName: string | null;
  location: string | null;
  /** Luas lahan dalam m² (sudah dikonversi dari satuan asalnya). */
  landAreaM2: number | null;
  /** Nilai luas apa adanya dari teks ("1 hektar", "8.000 m²"). */
  landAreaOriginal: string | null;
  buildingAreaM2: number | null;
  dimensionsText: string | null;
  floors: number | null;
  purpose: string | null;
  /** Konsep terkonfirmasi (id dari peta konsep kategori), mis. 'taman-publik'. */
  conceptId: string | null;
  conceptLabel: string | null;
  /** Fasilitas TERKONFIRMASI (disebut pengguna / dipilih dari saran). */
  facilities: string[];
  /** Kondisi lahan eksisting yang disebut pengguna (teks apa adanya). */
  siteConditions: string[];
  /**
   * Alokasi luas EKSPLISIT per tujuan yang disebut pengguna
   * (mis. "150 m² full tanaman hias") — §9 direktif rekonstruksi
   * 2026-11-11: sisa luas TIDAK boleh dianggap milik satu fasilitas;
   * ia tetap "belum teralokasi spesifik" sampai pengguna merincinya.
   */
  allocations: AreaAllocation[];
  materialPreference: string | null;
  qualityPreference: string | null;
  budgetText: string | null;
  hasDedDocument: boolean;
  /** Tahap percakapan saat ini (logika internal §4, bukan halaman). */
  stage: IntakeStage;
  /** Penanda pengguna meminta dibikinkan langsung ("langsung buatkan"). */
  forceGenerate: boolean;
  /** Ringkasan faktual yang sudah diketahui (untuk pesan & pratinjau). */
  knownInformation: string[];
  /** Yang masih kurang — dihitung ulang setiap giliran dari keadaan. */
  missingInformation: string[];
  /** Teks gabungan seluruh giliran — bahan mesin kanonis di akhir alur. */
  combinedText: string;
}

export const emptyProjectIntake = (): ProjectIntakeContext => ({
  intent: 'CREATE_RAB',
  category: null,
  categoryLabel: null,
  categoryTerm: null,
  projectName: null,
  location: null,
  landAreaM2: null,
  landAreaOriginal: null,
  buildingAreaM2: null,
  dimensionsText: null,
  floors: null,
  purpose: null,
  conceptId: null,
  conceptLabel: null,
  facilities: [],
  siteConditions: [],
  allocations: [],
  materialPreference: null,
  qualityPreference: null,
  budgetText: null,
  hasDedDocument: false,
  stage: 'identity',
  forceGenerate: false,
  knownInformation: [],
  missingInformation: [],
  combinedText: '',
});

/* ------------------------------------------------------------------ */
/* Konversi satuan luas — hektar & are (celah terbukti: "1 hektar"     */
/* terbaca parser lama sebagai luas 1 m² karena angka "1" ditangkap     */
/* pola m² polos dan kata "hektar" diabaikan). Nilai ASLI dipertahan-  */
/* kan sebagai teks; yang dipakai mesin adalah hasil konversinya.      */
/* ------------------------------------------------------------------ */

const AREA_UNIT_RE =
  /(\d+(?:[.,]\d+)?)\s*(hektar|hektare|ha\b|are\b)/gi;

/** Pola penyebutan luas polos ("8.000 m2", "8000 m²", "luas 500 m2"). */
const PLAIN_AREA_RE = /(\d+(?:[.,]\d+)?)\s*m(?:2|²)/gi;

/**
 * Frasa luas yang DIBATALKAN pengguna pada giliran ini ("bukan 1 hektar",
 * "bukan 8.000 m2") — pola koreksi §6 master prompt. Angka sesudah kata
 * "bukan" adalah nilai LAMA yang dibatalkan, bukan nilai baru: ekstraksi
 * gabungan multi-giliran yang ceroboh akan membacanya sebagai nilai yang
 * menang hanya karena posisatinya. Nilai yang dibatalkan dikeluarkan
 * dari daftar kandidat oleh parseAreaMentionM2.
 */
function cancelledAreaValues(text: string): number[] {
  const t = (text || '').toLowerCase();
  const out: number[] = [];
  for (const m of t.matchAll(/\bbukan\s+(\d+(?:[.,]\d+)?)\s*(hektar|hektare|ha\b|are\b|m(?:2|²)?)/g)) {
    const v = parseAreaNumber(m[1]);
    if (v == null) continue;
    const unit = m[2];
    const factor = unit === 'are' ? 100 : unit.startsWith('h') ? 10000 : 1;
    out.push(Math.round(v * factor * 100) / 100);
  }
  return out;
}

/**
 * Luas yang BERLAKU dari satu teks untuk konteks intake: penyebutan
 * hektar/are dan m² polos sama-sama kandidat; kemunculan TERAKHIR yang
 * tidak dibatalkan yang menang (koreksi pengguna selalu menang atas
 * nilai lama — termasuk nilai lama yang ikut tertulis di kalimat
 * koreksinya sendiri, "…bukan 1 hektar, tapi 8.000 m2").
 */
export function parseAreaMentionM2(text: string): { valueM2: number; original: string } | null {
  const t = (text || '').toLowerCase();
  const cancelled = cancelledAreaValues(t);
  const candidates: Array<{ pos: number; valueM2: number; original: string }> = [];
  for (const h of findAreaUnitMentions(t)) {
    candidates.push({ pos: h.span[0], valueM2: h.valueM2, original: h.original });
  }
  for (const m of t.matchAll(PLAIN_AREA_RE)) {
    const v = parseAreaNumber(m[1]);
    if (v == null || v <= 0) continue;
    candidates.push({ pos: m.index ?? 0, valueM2: Math.round(v * 100) / 100, original: `${m[1]} m²` });
  }
  const live = candidates
    .filter((c) => !cancelled.includes(c.valueM2))
    .sort((a, b) => a.pos - b.pos);
  if (!live.length) return null;
  const last = live[live.length - 1];
  return { valueM2: last.valueM2, original: last.original };
}

/**
 * Luas TOTAL yang berlaku untuk konteks intake pada satu giliran —
 * perbaikan §9 (2026-11-11): penyebutan luas yang merupakan ALOKASI
 * per tujuan ("150m2 full tanaman hias") TIDAK boleh menang sebagai
 * luas total lahan. Aturan:
 * 1. Kandidat = semua penyebutan luas, dikurangi yang dibatalkan
 *    ("bukan …") dan dikurangi penyebutan yang terpakai sebagai
 *    alokasi pada giliran ini (multiset per nilai).
 * 2. Penyebutan berjangkar lahan/total ("lahan 400m2", "total luas
 *    400 m²") menang atas kandidat lain.
 * 3. Selain itu kemunculan terakhir menang (semantik koreksi lama).
 * Mengembalikan null bila giliran ini hanya memuat alokasi — luas
 * total dari giliran sebelumnya TIDAK ditimpa alokasi.
 */
export function resolveTotalAreaMention(
  text: string,
  allocations: AreaAllocation[],
): { valueM2: number; original: string } | null {
  const t = (text || '').toLowerCase();
  const cancelled = cancelledAreaValues(t);
  const candidates: Array<{ pos: number; valueM2: number; original: string }> = [];
  for (const h of findAreaUnitMentions(t)) {
    candidates.push({ pos: h.span[0], valueM2: h.valueM2, original: h.original });
  }
  for (const m of t.matchAll(PLAIN_AREA_RE)) {
    const v = parseAreaNumber(m[1]);
    if (v == null || v <= 0) continue;
    candidates.push({ pos: m.index ?? 0, valueM2: Math.round(v * 100) / 100, original: `${m[1]} m²` });
  }
  const allocValues = allocations.map((a) => a.areaM2);
  const live = candidates
    .filter((c) => !cancelled.includes(c.valueM2))
    .sort((a, b) => a.pos - b.pos)
    .filter((c) => {
      const i = allocValues.indexOf(c.valueM2);
      if (i === -1) return true;
      allocValues.splice(i, 1);
      return false;
    });
  if (!live.length) return null;
  const anchored = t.match(
    /(?:lahan|tanah|total(?:\s+luas)?|luas\s+(?:lahan|tanah|area)|area)\s*(?:seluas\s+)?([\d.,]+)\s*(m2|m²|meter persegi|hektar|hektare|ha\b|are\b)/,
  );
  if (anchored) {
    const av = parseAreaNumber(anchored[1]);
    if (av != null) {
      const factor = anchored[2] === 'are' ? 100 : anchored[2].startsWith('h') ? 10000 : 1;
      const target = Math.round(av * factor * 100) / 100;
      const hit = live.find((c) => c.valueM2 === target);
      if (hit) return hit;
    }
  }
  const last = live[live.length - 1];
  return { valueM2: last.valueM2, original: last.original };
}

/** Satu temuan luas bersatuan besar pada teks. */
export interface AreaUnitHit {
  valueM2: number;
  /** Frasa apa adanya, ternormalisasi spasi ("1 hektar"). */
  original: string;
  span: [number, number];
}

/** Semua penyebutan luas hektar/are pada teks (kemunculan terakhir = koreksi). */
export function findAreaUnitMentions(text: string): AreaUnitHit[] {
  const t = (text || '').toLowerCase();
  const hits: AreaUnitHit[] = [];
  for (const m of t.matchAll(AREA_UNIT_RE)) {
    const v = parseAreaNumber(m[1]);
    if (v == null || v <= 0) continue;
    const unit = m[2];
    const factor = unit === 'are' ? 100 : 10000;
    hits.push({
      valueM2: Math.round(v * factor * 100) / 100,
      original: `${m[1]} ${unit === 'ha' ? 'hektar' : unit}`.replace(/\s+/g, ' '),
      span: [m.index ?? 0, (m.index ?? 0) + m[0].length],
    });
  }
  return hits;
}

/** Luas hektar/are terakhir pada teks (koreksi pengguna menang), atau null. */
export function parseAreaUnitM2(text: string): AreaUnitHit | null {
  const hits = findAreaUnitMentions(text);
  return hits.length ? hits[hits.length - 1] : null;
}

/**
 * Netralkan frasa hektar/are dari teks sebelum diserahkan ke parser
 * lama — tanpa ini angka hektar ikut tertangkap pola m² polos ("1
 * hektar" → luas bangunan 1 m²). Frasa pengganti mempertahankan konteks
 * "luas … m2" hasil konversi agar lapisan lama membacanya sebagai luas.
 */
export function neutralizeAreaUnits(text: string): string {
  const hits = findAreaUnitMentions(text);
  if (!hits.length) return text;
  let out = (text || '').toLowerCase();
  // Ganti dari belakang agar indeks rentang tetap sah.
  for (const h of [...hits].reverse()) {
    out = `${out.slice(0, h.span[0])} ${h.valueM2} m2 ${out.slice(h.span[1])}`;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Fasilitas landscape (§3 master prompt — SARAN kontekstual; tidak    */
/* pernah dianggap dibutuhkan hanya karena disarankan). Daftar per    */
/* konsep persis dari prompt; deteksi penyebutan memakai kata kunci    */
/* turunan yang konservatif.                                           */
/* ------------------------------------------------------------------ */

export interface FacilityDef {
  id: string;
  label: string;
  detect: RegExp;
}

export interface LandscapeConcept {
  id: string;
  label: string;
  detect: RegExp;
  facilities: FacilityDef[];
  /**
   * Template katalog NYATA untuk konsep ini (id diverifikasi terhadap
   * RabTemplateService oleh tes grounding) — null bila katalog belum
   * punya template konsep ini; pemetaan pratinjau lalu dinyatakan
   * terbuka memakai template landscape terdekat, bukan dikarang.
   */
  templateId: string | null;
  /** Catatan pemetaan jujur bila templateId bukan template khusus konsep. */
  templateNote: string | null;
}

const F = (id: string, label: string, detect: RegExp): FacilityDef => ({ id, label, detect });

export const LANDSCAPE_CONCEPTS: LandscapeConcept[] = [
  {
    id: 'taman-publik',
    label: 'Taman publik',
    detect: /\b(taman publik|taman kota|taman umum|public park)\b/,
    templateId: 'LAND-URBAN-PARK',
    templateNote: null,
    facilities: [
      F('jogging-track', 'Jogging track', /\bjogging\b/),
      F('danau', 'Danau kecil/buatan', /\bdanau\b/),
      F('pedestrian', 'Jalur pedestrian', /\b(pedestrian|pejalan kaki|jalur pejalan)\b/),
      F('lawn', 'Area rumput & tanaman', /\b(rumput|lawn|area hijau|tanaman)\b/),
      F('playground', 'Playground / taman bermain anak', /\b(playground|taman bermain|bermain anak|area bermain)\b/),
      F('seating', 'Area duduk', /\b(area duduk|tempat duduk|bangku)\b/),
      F('lighting', 'Penerangan', /\b(penerangan|lampu|pencahayaan)\b/),
      F('drainage', 'Drainase', /\b(drainase|saluran)\b/),
      F('toilet', 'Toilet umum', /\b(toilet|wc umum|kamar kecil)\b/),
      F('parking', 'Area parkir', /\b(parkir|parking)\b/),
    ],
  },
  {
    id: 'landscape-perumahan',
    label: 'Landscape perumahan',
    detect: /\b(perumahan|residensial|residential|cluster|komplek|kompleks perumahan)\b/,
    templateId: 'LAND-PARK-RESIDENCE',
    templateNote: null,
    facilities: [
      F('garden', 'Area taman', /\b(area taman|taman)\b/),
      F('pedestrian', 'Akses pedestrian', /\b(pedestrian|pejalan kaki|akses)\b/),
      F('entrance', 'Landscape gerbang masuk', /\b(gerbang|entrance|pintu masuk)\b/),
      F('communal-park', 'Taman komunal', /\b(taman komunal|komunal|taman bersama)\b/),
      F('water-feature', 'Fitur air', /\b(fitur air|water ?feature|kolam|air mancur)\b/),
      F('danau', 'Danau kecil/buatan', /\bdanau\b/),
      F('lighting', 'Penerangan', /\b(penerangan|lampu|pencahayaan)\b/),
      F('drainage', 'Drainase', /\b(drainase|saluran)\b/),
      F('seating', 'Tempat duduk luar', /\b(tempat duduk|area duduk|bangku|gazebo)\b/),
    ],
  },
  {
    id: 'landscape-komersial',
    label: 'Landscape komersial',
    detect: /\b(komersial|commercial|mall|plaza|pertokoan|kawasan bisnis)\b/,
    // Katalog belum punya template landscape komersial khusus — template
    // taman kawasan adalah yang terdekat (dinyatakan terbuka).
    templateId: 'LAND-PARK-RESIDENCE',
    templateNote:
      'Katalog EZRAB belum punya template khusus landscape komersial — pratinjau memakai template taman kawasan terdekat dan keterbatasannya dinyatakan di sini, bukan diklaim sebagai template komersial.',
    facilities: [
      F('entrance-plaza', 'Plaza gerbang masuk', /\b(plaza|gerbang|entrance)\b/),
      F('pedestrian', 'Sirkulasi pedestrian', /\b(pedestrian|pejalan kaki|sirkulasi)\b/),
      F('green', 'Area hijau', /\b(area hijau|hijau|rumput)\b/),
      F('parking', 'Landscape parkir', /\b(parkir|parking)\b/),
      F('decorative-planting', 'Tanaman dekoratif', /\b(dekoratif|tanaman hias|ornamental)\b/),
      F('gathering', 'Area berkumpul luar', /\b(berkumpul|gathering|area kumpul|amphitheater|amfiteater)\b/),
    ],
  },
  {
    id: 'landscape-resort',
    label: 'Landscape resort',
    detect: /\b(resort|hotel|villa|vila|penginapan)\b/,
    templateId: 'LAND-POOL-WATERFEATURE',
    templateNote: null,
    facilities: [
      F('tropical-garden', 'Taman tropis', /\b(tropis|tropical)\b/),
      F('water-feature', 'Fitur air', /\b(fitur air|water ?feature|air mancur)\b/),
      F('pool', 'Sekitar kolam renang', /\b(kolam renang|pool|swimming)\b/),
      F('pedestrian', 'Jalur pedestrian', /\b(pedestrian|pejalan kaki|jalur)\b/),
      F('relaxation', 'Area relaksasi luar', /\b(relaksasi|santai|relax)\b/),
      F('lighting', 'Penerangan', /\b(penerangan|lampu|pencahayaan)\b/),
      F('drainage', 'Drainase', /\b(drainase|saluran)\b/),
    ],
  },
  {
    id: 'ruang-terbuka-hijau',
    label: 'Ruang terbuka hijau',
    detect: /\b(ruang terbuka hijau|rth|open space|ruang hijau)\b/,
    // Belum ada template RTH khusus; taman kota adalah yang terdekat.
    templateId: 'LAND-URBAN-PARK',
    templateNote:
      'Katalog EZRAB belum punya template khusus ruang terbuka hijau — pratinjau memakai template taman kota terdekat dan keterbatasannya dinyatakan di sini.',
    facilities: [
      F('lawn', 'Area rumput & vegetasi', /\b(rumput|vegetasi|tanaman|penghijauan)\b/),
      F('danau', 'Danau kecil/buatan', /\bdanau\b/),
      F('pedestrian', 'Jalur pedestrian', /\b(pedestrian|pejalan kaki|jalur)\b/),
      F('trees', 'Pohon peneduh', /\b(pohon|peneduh)\b/),
      F('lighting', 'Penerangan', /\b(penerangan|lampu)\b/),
      F('drainage', 'Drainase', /\b(drainase|saluran)\b/),
      F('seating', 'Area duduk', /\b(area duduk|tempat duduk|bangku)\b/),
    ],
  },
];

/** Pilihan konsep yang ditawarkan sebagai kartu (5 saran prompt + Custom). */
export const LANDSCAPE_CONCEPT_CHOICES: Array<{ id: string; label: string }> = [
  ...LANDSCAPE_CONCEPTS.map((c) => ({ id: c.id, label: c.label })),
  { id: 'custom', label: 'Konsep custom' },
];

export function landscapeConceptById(id: string | null): LandscapeConcept | null {
  if (!id) return null;
  return LANDSCAPE_CONCEPTS.find((c) => c.id === id) ?? null;
}

/** Konsep landscape yang disebut eksplisit di teks, atau null. */
export function detectLandscapeConcept(text: string): LandscapeConcept | null {
  const t = ` ${(text || '').toLowerCase()} `;
  for (const c of LANDSCAPE_CONCEPTS) {
    if (c.detect.test(t)) return c;
  }
  return null;
}

/**
 * Fasilitas yang disebut pada teks dari daftar konsep (id stabil).
 * 'custom' tidak punya daftar — deteksi memakai gabungan semua daftar
 * konsep agar penyebutan bebas tetap tertangkap.
 */
export function detectFacilities(text: string, conceptId: string | null): FacilityDef[] {
  const t = ` ${(text || '').toLowerCase()} `;
  const defs =
    conceptId && conceptId !== 'custom'
      ? landscapeConceptById(conceptId)?.facilities ?? []
      : LANDSCAPE_CONCEPTS.flatMap((c) => c.facilities);
  const seen = new Set<string>();
  const out: FacilityDef[] = [];
  for (const d of defs) {
    if (seen.has(d.id)) continue;
    if (d.detect.test(t)) {
      seen.add(d.id);
      out.push(d);
    }
  }
  return out;
}

/** Label fasilitas berdasarkan id (lintas konsep), untuk ringkasan. */
export function facilityLabel(id: string): string {
  for (const c of LANDSCAPE_CONCEPTS) {
    const f = c.facilities.find((x) => x.id === id);
    if (f) return f.label;
  }
  return id;
}

/* ------------------------------------------------------------------ */
/* Paket pekerjaan SARAN untuk pratinjau landscape (§8 master prompt). */
/* Ini struktur usulan yang mengikuti kebutuhan terkonfirmasi —       */
/* BUKAN cakupan yang dipaksakan dan BUKAN hasil hitung. Paket yang   */
/* fasilitasnya tidak dipilih pengguna ditandai sebagai saran.         */
/* ------------------------------------------------------------------ */

export interface WorkPackageSuggestion {
  name: string;
  /** Fasilitas terkonfirmasi yang menjadi dasar paket ini (kosong = umum/dasar). */
  basedOn: string[];
  /** true bila paket ini murni saran (dasarnya belum dikonfirmasi). */
  suggestionOnly: boolean;
}

export function landscapeWorkPackages(ctx: ProjectIntakeContext): WorkPackageSuggestion[] {
  const has = (...ids: string[]) => ctx.facilities.filter((f) => ids.includes(f));
  const pkgs: Array<{ name: string; on: string[] }> = [
    { name: 'Pekerjaan persiapan', on: [] },
    { name: 'Pekerjaan pembersihan lahan', on: [] },
    { name: 'Pekerjaan tanah dan pembentukan kontur', on: [] },
    { name: 'Pekerjaan drainase', on: has('drainage') },
    { name: 'Pekerjaan perkerasan dan pedestrian', on: has('pedestrian', 'entrance-plaza', 'entrance', 'corridor') },
    { name: 'Pekerjaan landscape dan vegetasi', on: has('lawn', 'garden', 'green', 'tropical-garden', 'decorative-planting', 'trees', 'communal-park') },
    { name: 'Pekerjaan fasilitas taman', on: has('playground', 'seating', 'toilet', 'parking', 'gathering', 'relaxation', 'water-feature', 'pool') },
    { name: 'Pekerjaan penerangan luar', on: has('lighting') },
    { name: 'Pekerjaan utilitas pendukung', on: has('parking', 'toilet', 'water-feature', 'pool') },
  ];
  return pkgs.map((p) => ({
    name: p.name,
    basedOn: p.on,
    suggestionOnly: p.on.length === 0 && !['Pekerjaan persiapan', 'Pekerjaan pembersihan lahan', 'Pekerjaan tanah dan pembentukan kontur'].includes(p.name),
  }));
}

/* ------------------------------------------------------------------ */
/* Ekstraksi konteks dari satu pesan (digabung ke konteks sesi oleh    */
/* pemanggil). Memakai parser yang ada + konversi satuan di sini.      */
/* ------------------------------------------------------------------ */

const CATEGORY_PATTERNS: Array<{ category: ProjectCategory; term: RegExp; landscapeHint?: boolean }> = [
  { category: 'LANDSCAPE', term: /\b(landscape|lanskap)\b/, landscapeHint: true },
  { category: 'PUBLIC_SPACE', term: /\b(taman kota|taman publik|taman umum|ruang terbuka hijau|rth)\b/, landscapeHint: true },
  { category: 'PUBLIC_SPACE', term: /\btaman\b/, landscapeHint: true },
  { category: 'DRAINAGE', term: /\b(drainase|saluran air|gorong|u-?ditch)\b/ },
  { category: 'BRIDGE', term: /\bjembatan\b/ },
  { category: 'ROAD', term: /\b(jalan|perkerasan|paving|aspal|hotmix|trotoar)\b/ },
  { category: 'RENOVATION', term: /\b(renovasi|rehab|rehabilitasi|restorasi)\b/ },
  { category: 'INTERIOR', term: /\b(interior|fit ?out|fitout)\b/ },
  { category: 'MEP', term: /\b(mep|mekanikal|elektrikal|plumbing|instalasi listrik|hvac)\b/ },
  { category: 'STRUCTURAL', term: /\b(struktur|pondasi|kolom|balok|sloof|bore pile|tiang pancang)\b/ },
  { category: 'EARTHWORKS', term: /\b(pekerjaan tanah|galian|urugan|timbunan|cut and fill|pemadatan)\b/ },
  { category: 'INFRASTRUCTURE', term: /\b(irigasi|bendung|bendungan|embung|pelabuhan|dermaga|infrastruktur)\b/ },
  { category: 'COMMERCIAL', term: /\b(ruko|kantor|hotel|mall|pasar modern|minimarket|restoran|kafe|gudang|pabrik|showroom|apartemen)\b/ },
  { category: 'RESIDENTIAL', term: /\b(rumah|rumah tinggal|hunian|tempat tinggal)\b/ },
];

/** Apakah teks ini keluarga landscape/taman (alur intake di modul ini)? */
export function isLandscapeFamily(category: ProjectCategory | null): boolean {
  return category === 'LANDSCAPE' || category === 'PUBLIC_SPACE';
}

function fmtNum(v: number): string {
  return v.toLocaleString('id-ID', { maximumFractionDigits: 2 });
}

/**
 * Ekstrak konteks parsial dari SATU pesan. Kolom yang tidak disebut
 * TIDAK diubah (pemanggil menggabung dengan aturan: nilai baru yang
 * tidak null menimpa; koreksi eksplisit selalu menang karena ekstraksi
 * berjalan pada teks giliran ini saja).
 */
/* ------------------------------------------------------------------ */
/* Alokasi luas eksplisit (§9 direktif 2026-11-11). Dua bentuk frasa:  */
/* "150m2 full tanaman hias" dan "tanaman hias seluas 150 m2". Hanya   */
/* penyebutan yang MENYEBUT TUJUANNYA yang menjadi alokasi — luas     */
/* total lahan tidak pernah terbaca sebagai alokasi, dan sisa luas    */
/* tidak pernah dianggap milik satu fasilitas.                         */
/* ------------------------------------------------------------------ */

const ALLOCATION_PURPOSE_RE =
  '(tanaman(?:\\s+hias)?|penghijauan|rumput|jogging(?:\\s+track)?|air\\s+mancur|danau(?:\\s+kecil)?|kolam(?:\\s+renang)?|parkir|playground|taman\\s+bermain|pedestrian|hardscape|plaza|area\\s+duduk|pohon\\s+peneduh)';

export function parseAreaAllocations(text: string): AreaAllocation[] {
  const raw = text || '';
  const out: AreaAllocation[] = [];
  const push = (purposeRaw: string, numUnit: string) => {
    const hit = parseAreaUnitM2(numUnit) ?? (() => {
      const m = numUnit.match(/([\d.,]+)\s*(?:m2|m²|meter persegi)/i);
      return m ? { valueM2: parseAreaNumber(m[1]), original: numUnit } : null;
    })();
    if (!hit || hit.valueM2 == null) return;
    let purpose = purposeRaw.toLowerCase().replace(/\s+/g, ' ').trim();
    if (purpose === 'jogging') purpose = 'jogging track';
    if (out.some((a) => a.purpose === purpose && a.areaM2 === hit.valueM2)) return;
    out.push({ purpose, areaM2: hit.valueM2, original: `${numUnit.trim()} ${purposeRaw.trim()}` });
  };
  const reA = new RegExp(
    `([\\d.,]+\\s*(?:m2|m²|meter persegi|hektar|hektare|ha\\b|are\\b))\\s+(?:full\\s+|untuk\\s+|buat\\s+|jadi\\s+|sebagai\\s+)?${ALLOCATION_PURPOSE_RE}`,
    'gi',
  );
  for (const m of raw.matchAll(reA)) push(m[2], m[1]);
  const reB = new RegExp(
    `${ALLOCATION_PURPOSE_RE}\\s+(?:seluas\\s+|sebesar\\s+)?([\\d.,]+\\s*(?:m2|m²|meter persegi|hektar|hektare|ha\\b|are\\b))`,
    'gi',
  );
  for (const m of raw.matchAll(reB)) push(m[1], m[2]);
  return out;
}

export function extractProjectContext(text: string, base?: ProjectIntakeContext): ProjectIntakeContext {
  const raw = (text || '').trim();
  const t = ` ${raw.toLowerCase().replace(/\s+/g, ' ')} `;
  const ctx: ProjectIntakeContext = base
    ? { ...base, facilities: [...base.facilities], siteConditions: [...base.siteConditions], allocations: [...base.allocations] }
    : emptyProjectIntake();

  // --- Kategori ---
  let matchedCategory: ProjectCategory | null = null;
  let matchedTerm: string | null = null;
  for (const p of CATEGORY_PATTERNS) {
    const m = t.match(p.term);
    if (m) {
      matchedCategory = p.category;
      matchedTerm = m[0].trim();
      break;
    }
  }
  if (matchedCategory) {
    ctx.category = matchedCategory;
    ctx.categoryLabel = CATEGORY_LABELS[matchedCategory];
    ctx.categoryTerm = matchedTerm;
  }

  // --- Luas: satuan besar (hektar/are) diperiksa pada teks ASLI; frasa
  // lahannya kemudian dinetralkan agar parser lama tidak membaca
  // angkanya sebagai m² polos. Nilai yang BERLAKU dihitung dari semua
  // penyebutan luas pada giliran ini dengan aturan koreksi (nilai yang
  // dibatalkan lewat "bukan …" tidak ikut menang). ---
  const areaHit = parseAreaUnitM2(raw);
  const neutral = neutralizeAreaUnits(raw);
  const needs: RabNeeds = extractRabNeeds(neutral);
  const spec = extractUniversalSpec(neutral);
  // Alokasi giliran ini dihitung DULU: luas yang disebut sebagai
  // alokasi per tujuan bukan kandidat luas total (§9, 2026-11-11).
  const turnAllocations = parseAreaAllocations(raw);
  const effectiveArea = resolveTotalAreaMention(raw, turnAllocations);
  if (effectiveArea) {
    // Penyebutan luas pada konteks intake adalah LUAS LAHAN/area proyek
    // (untuk landscape: luas area pekerjaan) — dicatat sebagai lahan
    // dengan nilai asli dipertahankan.
    ctx.landAreaM2 = effectiveArea.valueM2;
    ctx.landAreaOriginal = effectiveArea.original;
  } else if (areaHit && !turnAllocations.some((a) => a.areaM2 === areaHit.valueM2)) {
    ctx.landAreaM2 = areaHit.valueM2;
    ctx.landAreaOriginal = areaHit.original;
  } else if (needs.landAreaM2 != null && turnAllocations.length === 0) {
    ctx.landAreaM2 = needs.landAreaM2;
    ctx.landAreaOriginal = `${fmtNum(needs.landAreaM2)} m²`;
  }
  if (needs.buildingArea != null && !isLandscapeFamily(ctx.category)) {
    ctx.buildingAreaM2 = needs.buildingArea;
  }
  if (needs.landLength && needs.landWidth) {
    ctx.dimensionsText = `${fmtNum(needs.landLength)} × ${fmtNum(needs.landWidth)} m`;
  }
  if (needs.floors != null) ctx.floors = needs.floors;
  if (needs.location) ctx.location = needs.location;
  else {
    // Parser lokasi lama berhenti pada kata sambung pertama ("di
    // surabaya dengan …" gagal terbaca karena pola lookahead-nya) —
    // untuk intake, "di <Kota>" di depan kata sambung umum tetap lokasi
    // yang sah. Kota multi-kata dibatasi 3 kata dan berhenti di kata
    // sambung pertama, agar tidak menelan frasa berikutnya.
    const locIntake = raw
      .toLowerCase()
      .match(/\bdi\s+([a-z]+(?:\s+[a-z]+){0,2}?)(?=\s+(?:dengan|dan|yang|untuk|ada|pakai|menggunakan)\b|\s*[,.;]|$)/);
    if (locIntake) {
      const candidate = locIntake[1].trim();
      if (!/^(sini|sana|dalam|luar|atas|bawah|lahan|tanah|area|taman|rumah|gedung|lahan)$/.test(candidate) && candidate.length >= 3) {
        ctx.location = candidate.replace(/\b\w/g, (c) => c.toUpperCase());
      }
    }
  }
  if (spec.budgetCap != null) {
    ctx.budgetText = `±Rp${fmtNum(spec.budgetCap)}`;
  }

  // --- Konsep & fasilitas (keluarga landscape) ---
  if (isLandscapeFamily(ctx.category)) {
    const concept = detectLandscapeConcept(raw);
    if (concept) {
      ctx.conceptId = concept.id;
      ctx.conceptLabel = concept.label;
    } else if (ctx.category === 'PUBLIC_SPACE' && /\btaman kota\b/.test(t)) {
      ctx.conceptId = 'taman-publik';
      ctx.conceptLabel = 'Taman publik';
    }
    for (const f of detectFacilities(raw, ctx.conceptId)) {
      if (!ctx.facilities.includes(f.id)) ctx.facilities.push(f.id);
    }
    // Alokasi luas eksplisit per tujuan (§9): dicatat apa adanya;
    // sisa luas TIDAK dialihkan ke fasilitas mana pun secara diam-diam.
    for (const a of turnAllocations) {
      if (!ctx.allocations.some((x) => x.purpose === a.purpose && x.areaM2 === a.areaM2)) {
        ctx.allocations.push(a);
      }
    }
  }

  // --- Kondisi lahan eksisting (disebut apa adanya). Frasa kondisi
  // dinetralkan dari teks gabungan sesi (ctx.combinedText diisi
  // pemanggil dari teks gabungan + giliran ini) agar kata pemicu
  // cakupan lain di lapisan universal ("gedung"/"kantor" pada frasa
  // seperti "ada bangunan eksisting") tidak terbaca sebagai cakupan
  // pekerjaan baru saat konteks diserahkan ke mesin kanonis. ---
  const SITE_PATTERNS: Array<{ re: RegExp; label: string }> = [
    { re: /\b(lahan datar|tanah datar|lahan rata|tanah rata|kondisi datar)\b/, label: 'lahan datar' },
    { re: /\b(lahan kosong|tanah kosong|lahan masih kosong)\b/, label: 'lahan kosong' },
    { re: /\b(sudah (ada|berdiri) bangunan|ada bangunan eksisting|bangunan eksisting)\b/, label: 'ada bangunan eksisting' },
    { re: /\b(berkontur|kontur miring|lahan miring|lereng)\b/, label: 'lahan berkontur/miring' },
    { re: /\b(rawa|becek|sering banjir|daerah banjir|genangan)\b/, label: 'lahan rawa/rawan genangan' },
    { re: /\b(berbatu|tanah keras)\b/, label: 'tanah keras/berbatu' },
    { re: /\b(akses (sempit|sulit|terbatas))\b/, label: 'akses terbatas' },
    { re: /\b(perlu pembongkaran|ada yang dibongkar|pembongkaran)\b/, label: 'perlu pembongkaran sebagian' },
  ];
  for (const s of SITE_PATTERNS) {
    if (s.re.test(t) && !ctx.siteConditions.includes(s.label)) ctx.siteConditions.push(s.label);
  }

  // --- Preferensi material / kualitas (dicatat apa adanya; maknanya
  // TIDAK ditebak — "premium" tetap "premium" sampai pengguna merinci).
  // Hanya bila didahului konteks penggunaan ("gunakan/pakai kualitas
  // premium", "material premium") — kata kualitas yang muncul sebagai
  // bagian dari LABEL fasilitas saran ("tempat duduk luar") atau kata
  // sifat umum tidak boleh terbaca sebagai preferensi. ---
  const quality = t.match(/\b(?:gunakan|pakai|memakai|menggunakan|kualitas|mutu|grade|kelas)\s+(?:material\s+)?(premium|standar|standard|ekonomis|menengah|high[ -]?end|mewah|sederhana)\b/)
    ?? t.match(/\bmaterial\s+(premium|mewah|high[ -]?end)\b/);
  if (quality) ctx.qualityPreference = quality[1];
  const mat = t.match(/\bmaterial\s+(?:nya\s+)?([a-z][a-z\s]{2,30}?)(?=\s*(?:,|\.|$))/);
  if (mat) ctx.materialPreference = mat[1].trim();

  if (/\b(ded|gambar kerja|gambar teknis|denah)\b/.test(t)) ctx.hasDedDocument = true;
  if (/\b(langsung buatkan|langsung buat|langsung saja|lgsg|buatkan sekarang|langsung dihitung)\b/.test(t)) {
    ctx.forceGenerate = true;
  }

  const joined = base?.combinedText ? `${base.combinedText} ${raw}` : raw;
  // Netralkan HANYA frasa kondisi lahan dari teks gabungan (labelnya
  // sudah tercatat terstruktur di siteConditions): tanpa ini, frasa
  // "lahan kosong" terbaca lapisan universal sebagai cakupan gedung
  // ("kosong" ≈ "kos"/kost) dan "ada bangunan eksisting" sebagai
  // cakupan gedung — draft akhir lalu menuntut luas bangunan yang
  // tidak pernah diminta. Teks pengguna untuk ekstraksi lain TIDAK
  // diubah; ini murni teks bahan mesin pada konteks intake.
  ctx.combinedText = joined
    .replace(/\blahan kosong\b/g, 'lahan terbuka')
    .replace(/\btanah kosong\b/g, 'tanah terbuka')
    .replace(/\bada bangunan eksisting\b/g, 'ada struktur eksisting')
    .replace(/\bbangunan eksisting\b/g, 'struktur eksisting');
  refreshContextFacts(ctx);
  return ctx;
}

/** Hitung ulang known/missing + tahap dari keadaan konteks saat ini. */
export function refreshContextFacts(ctx: ProjectIntakeContext): void {
  const known: string[] = [];
  if (ctx.categoryLabel) {
    known.push(
      ctx.category === 'LANDSCAPE' || ctx.category === 'PUBLIC_SPACE'
        ? `Proyek ${ctx.categoryLabel.toLowerCase()}`
        : `Kategori: ${ctx.categoryLabel}`
    );
  }
  if (ctx.landAreaM2 != null) {
    known.push(
      `Total luas: ${fmtNum(ctx.landAreaM2)} m²${ctx.landAreaOriginal && !ctx.landAreaOriginal.includes('m²') ? ` (${ctx.landAreaOriginal})` : ''}`
    );
  }
  if (ctx.buildingAreaM2 != null) known.push(`Luas bangunan: ${fmtNum(ctx.buildingAreaM2)} m²`);
  if (ctx.dimensionsText) known.push(`Dimensi: ${ctx.dimensionsText}`);
  if (ctx.floors != null) known.push(`Jumlah lantai: ${ctx.floors}`);
  if (ctx.conceptLabel) known.push(`Konsep: ${ctx.conceptLabel}`);
  if (ctx.facilities.length) known.push(`Fasilitas: ${ctx.facilities.map(facilityLabel).join(', ')}`);
  for (const a of ctx.allocations) {
    known.push(`Alokasi: ${a.purpose} ${fmtNum(a.areaM2)} m² (eksplisit dari pengguna)`);
  }
  if (ctx.landAreaM2 != null && ctx.allocations.length > 0) {
    const allocated = ctx.allocations.reduce((s, a) => s + a.areaM2, 0);
    const rest = ctx.landAreaM2 - allocated;
    if (rest > 0) {
      known.push(
        `Sisa ${fmtNum(rest)} m² belum teralokasi spesifik — untuk fasilitas lain yang disebut, belum ada ukuran per fasilitas (tidak diasumsikan)`,
      );
    } else if (rest < 0) {
      known.push(
        `PERINGATAN: total alokasi ${fmtNum(allocated)} m² melebihi luas lahan ${fmtNum(ctx.landAreaM2)} m² — ada alokasi yang tumpang tindih`,
      );
    }
  }
  if (ctx.location) known.push(`Lokasi: ${ctx.location}`);
  if (ctx.siteConditions.length) known.push(`Kondisi lahan: ${ctx.siteConditions.join(', ')}`);
  if (ctx.qualityPreference) known.push(`Kualitas yang disebut: ${ctx.qualityPreference} (belum dirinci)`);
  if (ctx.materialPreference) known.push(`Material yang disebut: ${ctx.materialPreference}`);
  if (ctx.budgetText) known.push(`Anggaran yang disebut: ${ctx.budgetText}`);
  ctx.knownInformation = known;

  const missing: string[] = [];
  if (!ctx.category) missing.push('kategori/jenis proyek');
  if (isLandscapeFamily(ctx.category)) {
    if (!ctx.conceptId) missing.push('konsep landscape');
    if (ctx.conceptId && ctx.facilities.length === 0) missing.push('fasilitas yang dibutuhkan');
    if (ctx.landAreaM2 == null) missing.push('total luas area');
    if (
      ctx.landAreaM2 != null &&
      ctx.allocations.reduce((s, a) => s + a.areaM2, 0) > ctx.landAreaM2
    ) {
      missing.push('klarifikasi alokasi yang tumpang tindih (total alokasi melebihi luas lahan)');
    }
    if (ctx.siteConditions.length === 0) missing.push('kondisi lahan eksisting');
    if (!ctx.qualityPreference && !ctx.materialPreference) missing.push('preferensi material/kualitas');
  } else if (ctx.category) {
    if (ctx.landAreaM2 == null && ctx.buildingAreaM2 == null && !ctx.dimensionsText) {
      missing.push('ukuran proyek (luas/dimensi)');
    }
  }
  ctx.missingInformation = missing;

  // Tahap internal (§4 prompt): identitas → konsep → cakupan/fasilitas
  // → kondisi lahan → teknis → pratinjau. Bukan halaman terpisah.
  if (!ctx.category) ctx.stage = 'identity';
  else if (isLandscapeFamily(ctx.category) && !ctx.conceptId) ctx.stage = 'concept';
  else if (isLandscapeFamily(ctx.category) && ctx.facilities.length === 0) ctx.stage = 'facilities';
  else if (isLandscapeFamily(ctx.category) && ctx.siteConditions.length === 0) ctx.stage = 'site';
  else ctx.stage = 'technical';
}

/* ------------------------------------------------------------------ */
/* Status katalog landscape (kejujuran §6/§8): template apa yang       */
/* benar-benar ada untuk konteks ini.                                  */
/* ------------------------------------------------------------------ */

export interface LandscapeCatalogStatus {
  /** Semua template LANDSCAPE_SITE yang ada di katalog nyata. */
  availableTemplateNames: string[];
  /** Template yang dipetakan untuk konsep terpilih (null bila belum ada konsep). */
  conceptTemplateId: string | null;
  conceptTemplateName: string | null;
  /** Catatan keterbatasan pemetaan (null bila template memang khusus konsepnya). */
  note: string | null;
}

export function landscapeCatalogStatus(ctx: ProjectIntakeContext): LandscapeCatalogStatus {
  const svc = RabTemplateService.getInstance();
  const all = svc.getAllTemplates().filter((tpl) => tpl.category === 'LANDSCAPE_SITE');
  const concept = landscapeConceptById(ctx.conceptId);
  let conceptTemplateName: string | null = null;
  if (concept?.templateId) {
    conceptTemplateName = svc.getTemplateById(concept.templateId)?.name ?? null;
  }
  return {
    availableTemplateNames: all.map((tpl) => tpl.name),
    conceptTemplateId: concept?.templateId ?? null,
    conceptTemplateName,
    note: concept?.templateNote ?? null,
  };
}

/** Apakah konteks menyebut cakupan universal (untuk penjembatanan registry). */
export function contextScopes(ctx: ProjectIntakeContext): string[] {
  return detectScopes(ctx.combinedText).map((s) => s.id);
}

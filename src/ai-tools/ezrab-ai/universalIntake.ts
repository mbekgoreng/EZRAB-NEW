/**
 * universalIntake.ts — MESIN INTAKE PROYEK PERCAKAPAN UNIVERSAL
 * (Universal Conversational Project Intake — master prompt owner
 * 2026-11-10, perluasan dari intake landscape di projectIntake.ts).
 *
 * Tujuan: EZRAB AI memahami proyek lintas kategori konstruksi
 * (bangunan, sipil/infrastruktur, landscape & site development, MEP,
 * pekerjaan khusus, dan proyek MULTI-DISIPLIN) dari percakapan biasa —
 * mengekstrak SEMUA fakta yang sudah disebut, menanyakan HANYA
 * pertanyaan kritis yang masih hilang (satu per giliran), mempertahankan
 * konteks antar-pesan (termasuk koreksi, penambahan, dan PENGHAPUSAN
 * cakupan), lalu menyiapkan BRIEF PROYEK transparan untuk disetujui
 * pengguna sebelum mesin RAB kanonis dipanggil.
 *
 * BUKAN sistem paralel:
 *  - Berdiri di atas parser yang sudah ada (rabNeeds.extractRabNeeds,
 *    universalRab.extractUniversalSpec, projectIntake untuk luas
 *    hektar/are + lokasi + kondisi lahan) dan di atas katalog NYATA
 *    RabTemplateService — klasifikasi & pertanyaan mengikuti cakupan
 *    katalog yang benar-benar ada (matriks cakupan dihitung dari
 *    katalog hidup, bukan daftar karangan).
 *  - Intake landscape yang sudah berjalan (projectIntake.ts) TIDAK
 *    disentuh; kategori landscape murni tetap milik gerbang itu.
 *    Modul ini mengambil alih hanya: (a) proyek multi-disiplin,
 *    (b) kategori non-landscape yang fakta kritisnya hilang dan alur
 *    lama akan buntu (draft dari default template / penolakan
 *    "kirim ulang" / menu generik), (c) kategori yang jatuh ke menu
 *    generik padahal teridentifikasi.
 *  - Pembangkitan RAB tetap 100% mesin kanonis (universalRab /
 *    UnifiedProjectEngine lewat actionRegistry). Modul ini TIDAK
 *    menghitung nilai finansial apa pun.
 *
 * Provenans (§6 master prompt): setiap fakta membawa status —
 * USER_CONFIRMED (disebut eksplisit pengguna), USER_PREFERENCE
 * (preferensi material/kualitas), SYSTEM_DERIVED (konversi satuan
 * sistem, nilai asli dipertahankan), SUGGESTION_ONLY (saran — TIDAK
 * PERNAH menjadi cakupan terkonfirmasi tanpa persetujuan pengguna),
 * ASSUMPTION_PENDING_APPROVAL, UNRESOLVED (belum diketahui/diputuskan).
 */

import { extractRabNeeds, parseAreaNumber } from './rabNeeds';
import { extractUniversalSpec } from './universalRab';
import { extractProjectContext, parseAreaMentionM2 } from './projectIntake';
import { detectSubtypeFromText } from './rabSubtypes';
import { RabTemplateService } from '../../services/rabTemplateService';

/* ------------------------------------------------------------------ */
/* Provenans fakta (§6)                                                */
/* ------------------------------------------------------------------ */

export type FactStatus =
  | 'USER_CONFIRMED'
  | 'USER_PREFERENCE'
  | 'SYSTEM_DERIVED'
  | 'SUGGESTION_ONLY'
  | 'ASSUMPTION_PENDING_APPROVAL'
  | 'UNRESOLVED';

export interface IntakeFact {
  key: string;
  label: string;
  value: string;
  status: FactStatus;
}

/* ------------------------------------------------------------------ */
/* Klasifikasi universal (§2) — keluarga + subkategori. `catalog` =    */
/* kategori RabTemplateService yang NYATA mendukung subkategori ini;   */
/* `specific` = kata kunci yang dicocokkan ke nama/subkategori         */
/* template untuk membedakan "didukung template khusus" vs "hanya      */
/* didukung sebagian oleh paket kategori".                             */
/* ------------------------------------------------------------------ */

export type UniversalFamily = 'building' | 'civil' | 'landscape' | 'mep' | 'specialized';

export const FAMILY_LABELS: Record<UniversalFamily, string> = {
  building: 'Pekerjaan bangunan',
  civil: 'Pekerjaan sipil & infrastruktur',
  landscape: 'Landscape & pengembangan lahan',
  mep: 'Pekerjaan MEP',
  specialized: 'Pekerjaan khusus',
};

export interface SubcategoryDef {
  id: string;
  family: UniversalFamily;
  label: string;
  detect: RegExp;
  catalog: string[];
  specific: string[];
  /** id cakupan universalRab yang relevan (jembatan ke mesin). */
  scopes: string[];
  /** Alur khusus yang sudah ada memilikinya — intake universal tidak mencegat. */
  protectedFlow?: 'house' | 'material-gate' | 'subtype' | 'landscape';
}

const S = (
  id: string, family: UniversalFamily, label: string, detect: RegExp,
  catalog: string[], specific: string[], scopes: string[],
  protectedFlow?: SubcategoryDef['protectedFlow'],
): SubcategoryDef => ({ id, family, label, detect, catalog, specific, scopes, protectedFlow });

export const SUBCATEGORIES: SubcategoryDef[] = [
  /* --- A. Bangunan --- */
  S('renovasi', 'building', 'Renovasi / rehabilitasi / restorasi', /\b(renovasi|rehabilitasi|restorasi|retrofit|perkuatan)\b/, ['RENOVASI_MAINTENANCE'], ['renovasi', 'restorasi', 'retrofit', 'perkuatan'], ['renovasi']),
  S('sekolah', 'building', 'Sekolah & fasilitas pendidikan', /\b(sekolah|madrasah|kampus|universitas|gedung kuliah|fasilitas pendidikan)\b/, ['PENDIDIKAN'], ['sekolah', 'pendidikan', 'kampus', 'madrasah'], ['gedung']),
  S('kesehatan', 'building', 'Rumah sakit & fasilitas kesehatan', /\b(rumah sakit|klinik|puskesmas|fasilitas kesehatan|rumah bersalin)\b/, ['KESEHATAN'], ['klinik', 'puskesmas', 'medis', 'laboratorium'], ['gedung']),
  S('hotel', 'building', 'Hotel & hospitality', /\b(hotel|ballroom|kondotel)\b/, ['HOTEL_HOSPITALITY'], ['hotel', 'ballroom', 'villa'], ['gedung']),
  S('kantor', 'building', 'Gedung perkantoran', /\b(kantor|perkantoran|office|gedung kantor)\b/, ['GEDUNG', 'BANGUNAN_TINGGI'], ['perkantoran', 'kantor', 'co-working', 'menara kantor'], ['gedung']),
  S('komersial', 'building', 'Bangunan komersial', /\b(mall|pasar modern|minimarket|restoran|showroom|pertokoan|ruko|kafe|toko)\b/, ['GEDUNG', 'BANGUNAN_TINGGI', 'HOTEL_HOSPITALITY'], ['pasar modern', 'showroom', 'retail', 'minimarket'], ['gedung']),
  S('gudang-industri', 'building', 'Gudang & bangunan industri', /\b(gudang|pabrik|workshop|cold storage|bengkel|industri)\b/, ['INDUSTRI', 'GEDUNG'], ['gudang', 'pabrik', 'workshop', 'cold storage'], ['gedung']),
  S('bangunan-publik', 'building', 'Bangunan publik', /\b(masjid|musholla|mushola|gereja|tempat ibadah|aula|gedung serbaguna|balai|gedung pemerintah|perpustakaan|asrama)\b/, ['GEDUNG'], ['serbaguna', 'fasilitas umum', 'asrama'], ['gedung']),
  S('apartemen', 'building', 'Apartemen & hunian bertingkat', /\b(apartemen|rumah susun|rusun)\b/, ['BANGUNAN_TINGGI'], ['apartemen', 'rumah susun', 'kondotel'], ['gedung']),
  S('rumah', 'building', 'Rumah tinggal', /\b(rumah tinggal|rumah|hunian)\b/, ['RUMAH_TINGGAL'], ['rumah'], ['gedung'], 'house'),
  // "bangunan" TIDAK dihitung bila bagian dari "luas bangunan" (itu
  // dimensi, bukan fungsi); def ini fallback — gugur di classify bila
  // ada def bangunan yang lebih spesifik.
  S('bangunan-umum', 'building', 'Bangunan gedung', /\bgedung\b|(?<!luas )\bbangunan\b/, ['GEDUNG'], ['gedung'], ['gedung']),

  /* --- B. Sipil & infrastruktur --- */
  S('jembatan', 'civil', 'Jembatan', /\b(jembatan|jpo|flyover|overpass)\b/, ['JEMBATAN_STRUKTUR'], ['jembatan', 'jpo', 'box culvert bridge', 'slab bridge'], ['jembatan'], 'subtype'),
  S('gorong-gorong', 'civil', 'Gorong-gorong & box culvert', /\b(gorong|box culvert)\b/, ['JEMBATAN_STRUKTUR', 'DRAINASE_SANITASI', 'SDA_IRIGASI'], ['box culvert', 'cross drain'], ['drainase', 'jembatan'], 'subtype'),
  S('bendung', 'civil', 'Bendung & bangunan air', /\b(bendung|bendungan|embung|pintu air|check dam|bangunan air)\b/, ['SDA_IRIGASI'], ['bendung', 'embung', 'check dam', 'pintu air'], ['irigasi']),
  S('irigasi', 'civil', 'Saluran irigasi', /\b(irigasi)\b/, ['SDA_IRIGASI'], ['irigasi'], ['irigasi']),
  S('drainase', 'civil', 'Drainase & saluran', /\b(drainase|saluran air|u-?ditch)\b/, ['DRAINASE_SANITASI', 'SDA_IRIGASI'], ['u-ditch', 'drainase', 'sewer', 'box culvert'], ['drainase'], 'subtype'),
  S('jalan-tol', 'civil', 'Jalan tol', /\b(jalan tol)\b/, ['JALAN_TRANSPORTASI'], [], ['jalan'], 'subtype'),
  S('jalan-aspal', 'civil', 'Jalan aspal / hotmix', /\b(hotmix|hot mix|aspal|asphalt)\b/, ['JALAN_TRANSPORTASI', 'PERKERASAN'], ['perkerasan lentur', 'overlay aspal'], ['jalan'], 'subtype'),
  S('jalan-beton', 'civil', 'Jalan beton / rigid', /\b(jalan|perkerasan)\b[^.]{0,24}\b(beton|rigid|rabat)\b|\b(rigid pavement|jalan beton)\b/, ['JALAN_TRANSPORTASI', 'PERKERASAN'], ['perkerasan kaku'], ['jalan'], 'subtype'),
  S('jalan-lingkungan', 'civil', 'Jalan lingkungan / desa', /\b(jalan lingkungan|jalan desa)\b/, ['JALAN_TRANSPORTASI'], ['jalan lingkungan'], ['jalan'], 'subtype'),
  S('jalan', 'civil', 'Jalan & perkerasan', /\b(jalan|perkerasan|paving)\b/, ['JALAN_TRANSPORTASI', 'PERKERASAN'], ['jalan', 'paving'], ['jalan'], 'subtype'),
  S('dinding-penahan', 'civil', 'Dinding penahan tanah', /\b(dinding penahan|tembok penahan|retaining wall|turap)\b/, ['STRUKTUR_BETON_BAJA', 'PONDASI_GEOTEKNIK'], ['retaining', 'penahan'], ['lanskap', 'pondasi']),
  S('pelindung-pantai', 'civil', 'Pelindung pantai & dermaga', /\b(breakwater|seawall|pengaman pantai|pelindung pantai|dermaga|pelabuhan|tetrapod)\b/, ['PELABUHAN_PESISIR'], ['seawall', 'breakwater', 'dermaga', 'pengaman pantai'], ['pelabuhan']),
  S('pekerjaan-tanah', 'civil', 'Pekerjaan tanah & pematangan lahan', /\b(pekerjaan tanah|pematangan lahan|cut and fill|cut & fill|galian|urugan|timbunan|land clearing)\b/, ['PEKERJAAN_TANAH'], ['cut & fill', 'galian', 'timbunan', 'land clearing', 'terasering'], ['tanah']),

  /* --- D. MEP --- */
  S('fire-protection', 'mep', 'Fire protection', /\b(fire protection|hydrant|pemadam kebakaran|fire alarm)\b/, ['MEP_SYSTEM', 'UTILITAS'], ['fire protection', 'hydrant'], ['mep']),
  S('hvac', 'mep', 'HVAC & tata udara', /\b(hvac|instalasi ac|tata udara|ventilasi|ac sentral)\b/, ['MEP_SYSTEM'], ['hvac', 'vrf'], ['mep']),
  S('komunikasi-data', 'mep', 'Sistem komunikasi & data', /\b(sistem komunikasi|jaringan data|komunikasi dan data)\b/, ['MEP_SYSTEM'], ['data & komunikasi'], ['mep']),
  S('lift', 'mep', 'Lift & eskalator', /\b(lift|eskalator)\b/, [], [], ['mep']),
  S('plumbing', 'mep', 'Plumbing & sanitasi air', /\b(plumbing|perpipaan|air bersih|air kotor|sanitasi|septictank|septic tank|ipal)\b/, ['MEP_SYSTEM', 'UTILITAS', 'DRAINASE_SANITASI'], ['plumbing', 'air bersih', 'ipal', 'septik', 'stp'], ['mep', 'sanitasi']),
  S('listrik', 'mep', 'Instalasi listrik & penerangan', /\b(instalasi listrik|elektrikal|panel listrik|phb|stop kontak|sakelar|penerangan|pju)\b/, ['MEP_SYSTEM', 'UTILITAS'], ['elektrikal', 'lighting', 'penerangan'], ['mep']),
  S('mep-umum', 'mep', 'MEP (mekanikal & elektrikal)', /\b(mep|mekanikal)\b/, ['MEP_SYSTEM'], ['mep terintegrasi'], ['mep']),

  /* --- E. Pekerjaan khusus --- */
  S('pondasi', 'specialized', 'Pondasi', /\b(pondasi|bore pile|bored pile|tiang pancang|foot plat|sumuran|mini pile)\b/, ['PONDASI_GEOTEKNIK'], ['bored pile', 'tiang pancang', 'sumuran', 'mini pile', 'raft'], ['pondasi'], 'material-gate'),
  S('struktur-atap', 'specialized', 'Struktur & penutup atap', /\b(rangka atap|penutup atap|atap|genteng)\b/, ['ATAP_WATERPROOFING'], ['genteng', 'standing seam', 'skylight', 'green roof'], ['atap'], 'material-gate'),
  S('waterproofing', 'specialized', 'Waterproofing', /\b(waterproofing)\b/, ['ATAP_WATERPROOFING'], ['waterproofing'], ['atap'], 'material-gate'),
  S('struktur-baja', 'specialized', 'Struktur baja', /\b(struktur baja|rangka baja)\b/, ['STRUKTUR_BETON_BAJA'], ['rangka baja', 'steel frame', 'space frame'], ['struktur']),
  S('struktur-beton', 'specialized', 'Struktur beton bertulang', /\b(struktur beton|kolom|balok|sloof|pelat lantai|beton bertulang)\b/, ['STRUKTUR_BETON_BAJA'], ['pracetak', 'shear wall', 'post-tensioned'], ['struktur']),
  S('fasad', 'specialized', 'Pekerjaan fasad', /\b(fasad|facade)\b/, ['FINISHING_INTERIOR', 'RENOVASI_MAINTENANCE'], ['fasad'], ['finishing']),
  S('interior', 'specialized', 'Pekerjaan interior & fit-out', /\b(interior|fit ?out|fitout)\b/, ['FINISHING_INTERIOR', 'RENOVASI_MAINTENANCE'], ['fit-out', 'interior'], ['finishing']),
  S('finishing', 'specialized', 'Finishing', /\b(finishing|keramik|granit|plafon|pengecatan|plester|acian|cat tembok)\b/, ['FINISHING_INTERIOR'], ['lantai', 'akustik', 'kitchen'], ['finishing']),
  S('pintu-jendela', 'specialized', 'Pintu & jendela', /\b(pintu|jendela|kusen)\b/, ['FINISHING_INTERIOR'], [], ['finishing']),
  S('pembongkaran', 'specialized', 'Pekerjaan pembongkaran', /\b(demolisi|pembongkaran|dibongkar)\b/, ['DEMOLISI_REKONSTRUKSI'], ['demolisi', 'bongkar', 'strip'], ['demolisi']),
  S('pemeliharaan', 'specialized', 'Pekerjaan pemeliharaan', /\b(pemeliharaan|maintenance|perawatan gedung)\b/, ['RENOVASI_MAINTENANCE'], ['pemeliharaan', 'rehabilitasi'], ['renovasi']),

  /* --- C. Landscape & pengembangan lahan (selain yang dimiliki gerbang landscape) --- */
  S('taman-kota', 'landscape', 'Taman kota / taman publik', /\b(taman kota|taman publik|taman umum|ruang terbuka hijau|rth)\b/, ['LANDSCAPE_SITE'], ['taman kota'], ['lanskap'], 'landscape'),
  S('landscape-komersial', 'landscape', 'Landscape komersial', /\b(landscape|lanskap)\b[^.]{0,24}\bkomersial\b|\blandscape komersial\b/, ['LANDSCAPE_SITE'], [], ['lanskap'], 'landscape'),
  S('landscape-resort', 'landscape', 'Landscape resort', /\b(landscape|lanskap)\b[^.]{0,24}\b(resort|hotel|villa)\b|\blandscape resort\b/, ['LANDSCAPE_SITE'], ['kolam & waterfeature'], ['lanskap'], 'landscape'),
  S('landscape-perumahan', 'landscape', 'Landscape perumahan', /\b(landscape|lanskap)\b[^.]{0,24}\bperumahan\b|\blandscape perumahan\b/, ['LANDSCAPE_SITE'], ['landscape & taman'], ['lanskap'], 'landscape'),
  S('hardscape', 'landscape', 'Hardscape & streetscape', /\b(hardscape|streetscape|area parkir|parkir)\b/, ['LANDSCAPE_SITE'], ['streetscape'], ['lanskap']),
  S('jogging-track', 'landscape', 'Jogging track', /\b(jogging|joging)\b/, ['LANDSCAPE_SITE', 'FASILITAS_OLAHRAGA'], ['jogging track'], ['olahraga', 'lanskap']),
  S('playground', 'landscape', 'Playground', /\b(playground|taman bermain)\b/, [], [], ['lanskap']),
  S('kolam', 'landscape', 'Kolam & water feature', /\b(kolam renang|water ?feature|kolam)\b/, ['LANDSCAPE_SITE', 'FASILITAS_OLAHRAGA'], ['kolam'], ['lanskap', 'olahraga']),
  S('irigasi-landscape', 'landscape', 'Irigasi landscape', /\b(irigasi taman|sistem irigasi landscape|penyiraman taman)\b/, ['LANDSCAPE_SITE'], ['irigasi taman'], ['lanskap']),
  S('pagar-gerbang', 'landscape', 'Pagar & gerbang', /\b(pagar|gerbang)\b/, ['LANDSCAPE_SITE'], ['pagar'], ['lanskap']),
  S('landscape-umum', 'landscape', 'Landscape', /\b(landscape|lanskap|taman)\b/, ['LANDSCAPE_SITE'], ['landscape & taman', 'taman kota'], ['lanskap'], 'landscape'),
];

export function subcategoryById(id: string | null): SubcategoryDef | null {
  if (!id) return null;
  return SUBCATEGORIES.find((s) => s.id === id) ?? null;
}

/* ------------------------------------------------------------------ */
/* Matriks cakupan katalog NYATA (§2/§15) — dihitung dari katalog      */
/* hidup RabTemplateService setiap dipanggil; tidak ada angka yang    */
/* dikarang di sini.                                                   */
/* ------------------------------------------------------------------ */

export type SupportLevel = 'didukung' | 'sebagian' | 'tidak-ada';

export interface CoverageEntry {
  subcategoryId: string;
  label: string;
  family: UniversalFamily;
  /** Jumlah template pada kategori katalog yang dipetakan. */
  categoryTemplateCount: number;
  /** Jumlah template yang spesifik untuk subkategori ini. */
  specificTemplateCount: number;
  support: SupportLevel;
  /** Contoh nama template spesifik (maks 3) untuk laporan/pratinjau. */
  sampleTemplates: string[];
}

export function catalogCoverage(): CoverageEntry[] {
  const svc = RabTemplateService.getInstance();
  const all = svc.getAllTemplates();
  return SUBCATEGORIES.map((def) => {
    const inCategories = all.filter((t) => def.catalog.includes(t.category));
    const specific = inCategories.filter((t) => {
      const hay = `${t.name} ${t.subcategory ?? ''}`.toLowerCase();
      return def.specific.some((k) => hay.includes(k));
    });
    const support: SupportLevel =
      specific.length > 0 ? 'didukung' : inCategories.length > 0 ? 'sebagian' : 'tidak-ada';
    return {
      subcategoryId: def.id,
      label: def.label,
      family: def.family,
      categoryTemplateCount: inCategories.length,
      specificTemplateCount: specific.length,
      support,
      sampleTemplates: specific.slice(0, 3).map((t) => t.name),
    };
  });
}

export function coverageFor(def: SubcategoryDef): CoverageEntry {
  return catalogCoverage().find((c) => c.subcategoryId === def.id)!;
}

/* ------------------------------------------------------------------ */
/* Klasifikasi teks (§2 + F multi-disiplin)                            */
/* ------------------------------------------------------------------ */

export interface Classification {
  primary: SubcategoryDef | null;
  secondary: SubcategoryDef[];
  matches: SubcategoryDef[];
  isMulti: boolean;
}

/** Prioritas disiplin untuk memilih primer pada proyek gabungan. */
const PRIMARY_PRIORITY: Record<string, number> = {
  renovasi: 0, sekolah: 1, kesehatan: 1, hotel: 1, kantor: 1, komersial: 1,
  'gudang-industri': 1, 'bangunan-publik': 1, apartemen: 1, 'bangunan-umum': 2,
  jembatan: 3, drainase: 3, irigasi: 3, bendung: 3, 'gorong-gorong': 3,
  'jalan-tol': 4, 'jalan-aspal': 4, 'jalan-beton': 4, 'jalan-lingkungan': 4, jalan: 4,
  'dinding-penahan': 4, 'pelindung-pantai': 4, 'pekerjaan-tanah': 4,
  'fire-protection': 5, hvac: 5, 'komunikasi-data': 5, lift: 5, plumbing: 5, listrik: 5, 'mep-umum': 5,
  pondasi: 6, 'struktur-atap': 6, waterproofing: 6, 'struktur-baja': 6, 'struktur-beton': 6,
  fasad: 6, interior: 6, finishing: 6, 'pintu-jendela': 6, pembongkaran: 6, pemeliharaan: 6,
  rumah: 7,
  'taman-kota': 8, 'landscape-komersial': 8, 'landscape-resort': 8, 'landscape-perumahan': 8,
  hardscape: 8, 'jogging-track': 8, playground: 8, kolam: 8, 'irigasi-landscape': 8,
  'pagar-gerbang': 8, 'landscape-umum': 9,
};

export function classifyUniversal(text: string): Classification {
  const t = ` ${(text || '').toLowerCase().replace(/\s+/g, ' ')} `;
  let matches = SUBCATEGORIES.filter((d) => d.detect.test(t));
  if (!matches.length) return { primary: null, secondary: [], matches: [], isMulti: false };
  // Fallback generik "bangunan gedung" gugur bila ada def lain yang
  // lebih spesifik ("gedung kantor" tidak butuh def generiknya).
  if (matches.length > 1) matches = matches.filter((d) => d.id !== 'bangunan-umum');
  // Disiplin = subkategori, kecuali varian jalan (aspal/beton/lingkungan/
  // tol/umum) yang merupakan SATU disiplin jalan, dan varian landscape
  // konsep yang merupakan satu disiplin landscape.
  const disciplineOf = (d: SubcategoryDef): string => {
    if (d.id.startsWith('jalan')) return 'jalan';
    if (d.family === 'landscape') return 'landscape';
    if (d.id === 'bangunan-umum') return 'bangunan-umum';
    return d.id;
  };
  const disciplines = new Set(matches.map(disciplineOf));
  // 'rumah' + 'renovasi' bukan multi — renovasi adalah cara pengerjaan
  // atas rumah itu (primer renovasi, rumah konteksnya).
  const isMulti = disciplines.size >= 2 && !(disciplines.size === 2 && disciplines.has('rumah') && disciplines.has('renovasi'));
  const sorted = [...matches].sort(
    (a, b) => (PRIMARY_PRIORITY[a.id] ?? 9) - (PRIMARY_PRIORITY[b.id] ?? 9)
  );
  let primary = sorted[0];
  // Sistem MEP yang disebut SEBAGAI objek utama kalimat ("buatkan rab
  // instalasi listrik gedung kantor") menjadi primer — gedungnya
  // konteks. Bila gedung disebut lebih dulu, gedung tetap primer.
  if (primary.family === 'building') {
    const idxOf = (d: SubcategoryDef): number => {
      const i = t.search(d.detect);
      return i < 0 ? Number.MAX_SAFE_INTEGER : i;
    };
    const mepFirst = matches
      .filter((d) => d.family === 'mep')
      .sort((a, b) => idxOf(a) - idxOf(b))[0];
    if (mepFirst && idxOf(mepFirst) < idxOf(primary)) primary = mepFirst;
  }
  const secondary = sorted.filter((d) => d.id !== primary.id && disciplineOf(d) !== disciplineOf(primary));
  return { primary, secondary, matches, isMulti };
}

/* ------------------------------------------------------------------ */
/* Parser satuan Indonesia (§6) — linear (km/m/cm/mm), jumlah          */
/* (titik/unit/set/buah), volume (m³). Nilai ASLI dipertahankan;       */
/* konversi ditandai SYSTEM_DERIVED oleh pemanggil. Semantik koreksi   */
/* "bukan X, tapi Y" sama seperti parseAreaMentionM2: nilai yang       */
/* dibatalkan tidak menang.                                            */
/* ------------------------------------------------------------------ */

const LINEAR_FACTORS: Record<string, number> = {
  km: 1000, kilometer: 1000, m: 1, meter: 1, cm: 0.01, centimeter: 0.01, mm: 0.001, milimeter: 0.001,
};
const LINEAR_RE = /(\d+(?:[.,]\d+)?)\s*(kilometer|km|centimeter|cm|milimeter|mm|meter|m)\b/gi;

function cancelledLinearValues(text: string): number[] {
  const t = (text || '').toLowerCase();
  const out: number[] = [];
  for (const m of t.matchAll(/\bbukan\s+(\d+(?:[.,]\d+)?)\s*(kilometer|km|centimeter|cm|milimeter|mm|meter|m)\b/g)) {
    const v = parseAreaNumber(m[1]);
    if (v == null) continue;
    out.push(Math.round(v * (LINEAR_FACTORS[m[2]] ?? 1) * 1000) / 1000);
  }
  return out;
}

export interface LinearHit { valueM: number; original: string; pos: number }

/** Semua penyebutan linear pada teks, berurutan posisi. */
export function findLinearMentions(text: string): LinearHit[] {
  const t = (text || '').toLowerCase();
  const hits: LinearHit[] = [];
  for (const m of t.matchAll(LINEAR_RE)) {
    const v = parseAreaNumber(m[1]);
    if (v == null || v <= 0) continue;
    hits.push({
      valueM: Math.round(v * (LINEAR_FACTORS[m[2]] ?? 1) * 1000) / 1000,
      original: `${m[1]} ${m[2]}`,
      pos: m.index ?? 0,
    });
  }
  return hits;
}

/**
 * Penyebutan linear yang menempel pada kata kunci dimensi tertentu
 * ("lebar 5 meter", "sepanjang 2 km", "bentang 12 meter",
 * "kedalaman 1,5 m", "tinggi 3 meter"). Mengembalikan penyebutan
 * terakhir yang tidak dibatalkan pola koreksi.
 */
export function parseAnchoredLinear(
  text: string,
  anchors: string[],
): { valueM: number; original: string } | null {
  const t = (text || '').toLowerCase();
  const cancelled = cancelledLinearValues(t);
  const hits: LinearHit[] = [];
  for (const anchor of anchors) {
    const re = new RegExp(`\\b${anchor}(?:nya)?\\b[^\\d]{0,20}?(\\d+(?:[.,]\\d+)?)\\s*(kilometer|km|centimeter|cm|milimeter|mm|meter|m)\\b`, 'gi');
    for (const m of t.matchAll(re)) {
      const v = parseAreaNumber(m[1]);
      if (v == null || v <= 0) continue;
      hits.push({
        valueM: Math.round(v * (LINEAR_FACTORS[m[2]] ?? 1) * 1000) / 1000,
        original: `${m[1]} ${m[2]}`,
        pos: m.index ?? 0,
      });
    }
  }
  const live = hits.filter((h) => !cancelled.includes(h.valueM)).sort((a, b) => a.pos - b.pos);
  if (live.length) return live[live.length - 1];
  // Semua hit berjangkar dibatalkan pola koreksi ("panjangnya bukan
  // 2 km, tapi 1500 meter") — nilai penggantinya tidak berjangkar;
  // ambil penyebutan linear terakhir yang tidak dibatalkan.
  if (hits.length) {
    const free = findLinearMentions(text).filter((h) => !cancelled.includes(h.valueM));
    if (free.length) {
      const last = free[free.length - 1];
      return { valueM: last.valueM, original: last.original };
    }
  }
  return null;
}

/** Jumlah satuan hitung: "40 titik", "12 unit", "3 set", "25 buah". */
export function parseCountMentions(text: string): Array<{ value: number; unit: string; original: string }> {
  const t = (text || '').toLowerCase();
  const out: Array<{ value: number; unit: string; original: string }> = [];
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*(titik|unit|set|buah)\b/g)) {
    const v = parseAreaNumber(m[1]);
    if (v == null || v <= 0) continue;
    out.push({ value: v, unit: m[2], original: `${m[1]} ${m[2]}` });
  }
  return out;
}

/** Volume m³ yang disebut ("volume 250 m3", "galian 1.200 m³"). */
export function parseVolumeMention(text: string): { valueM3: number; original: string } | null {
  const t = (text || '').toLowerCase();
  let last: { valueM3: number; original: string } | null = null;
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*m(?:3|³)\b/g)) {
    const v = parseAreaNumber(m[1]);
    if (v == null || v <= 0) continue;
    last = { valueM3: v, original: `${m[1]} m³` };
  }
  return last;
}

/* ------------------------------------------------------------------ */
/* Konteks intake universal (§6)                                       */
/* ------------------------------------------------------------------ */

export type UniversalStage =
  | 'PROJECT_IDENTITY' | 'PROJECT_SCOPE' | 'PROJECT_DIMENSIONS'
  | 'SITE_CONDITIONS' | 'TECHNICAL_REQUIREMENTS' | 'MATERIAL_AND_QUALITY'
  | 'LOCATION_AND_CONTEXT' | 'PROJECT_REVIEW' | 'USER_APPROVAL' | 'GENERATION';

export interface ScopeItem {
  label: string;
  /** Subkategori sumbernya (bila item adalah disiplin tambahan). */
  subcategoryId: string | null;
  status: FactStatus;
}

export interface UniversalIntakeContext {
  intent: 'CREATE_RAB';
  primary: SubcategoryDef | null;
  secondary: SubcategoryDef[];
  isMulti: boolean;
  projectName: string | null;
  location: string | null;
  landAreaM2: number | null;
  landAreaOriginal: string | null;
  buildingAreaM2: number | null;
  floors: number | null;
  dimensionsText: string | null;
  lengthM: number | null;
  lengthOriginal: string | null;
  widthM: number | null;
  depthM: number | null;
  heightM: number | null;
  spanM: number | null;
  volumeM3: number | null;
  counts: Array<{ value: number; unit: string; original: string }>;
  /** Cakupan TERKONFIRMASI (disiplin tambahan + item lingkup yang disebut). */
  scopeConfirmed: ScopeItem[];
  /** Cakupan yang DIHAPUS pengguna (dicatat, tidak dihidupkan lagi diam-diam). */
  scopeRemoved: string[];
  siteConditions: string[];
  /** Spek teknis apa adanya dari teks ("tebal 20 cm", "beton K-350", "CBR min 6%"). */
  technicalSpecs: string[];
  materialPreference: string | null;
  qualityPreference: string | null;
  budgetText: string | null;
  /** true = pembangunan baru; false = eksisting/renovasi atas yang ada; null = belum jelas. */
  isNewConstruction: boolean | null;
  /** Cakupan renovasi yang dipilih ("seluruh bangunan", "lantai 1", teks bebas). */
  renovationScope: string | null;
  /** Tipe drainase yang dipilih (label; dari subtipe katalog atau pilihan konfirmasi). */
  drainageType: string | null;
  facts: IntakeFact[];
  suggestedPackages: string[];
  missingCritical: string[];
  unresolved: string[];
  stage: UniversalStage;
  approvalStatus: 'PENDING' | 'APPROVED';
  /** Kunci pertanyaan yang SUDAH diajukan — pertanyaan tidak diulang. */
  askedKeys: string[];
  forceGenerate: boolean;
  combinedText: string;
}

export const emptyUniversalIntake = (): UniversalIntakeContext => ({
  intent: 'CREATE_RAB',
  primary: null,
  secondary: [],
  isMulti: false,
  projectName: null,
  location: null,
  landAreaM2: null,
  landAreaOriginal: null,
  buildingAreaM2: null,
  floors: null,
  dimensionsText: null,
  lengthM: null,
  lengthOriginal: null,
  widthM: null,
  depthM: null,
  heightM: null,
  spanM: null,
  volumeM3: null,
  counts: [],
  scopeConfirmed: [],
  scopeRemoved: [],
  siteConditions: [],
  technicalSpecs: [],
  materialPreference: null,
  qualityPreference: null,
  budgetText: null,
  isNewConstruction: null,
  renovationScope: null,
  drainageType: null,
  facts: [],
  suggestedPackages: [],
  missingCritical: [],
  unresolved: [],
  stage: 'PROJECT_IDENTITY',
  approvalStatus: 'PENDING',
  askedKeys: [],
  forceGenerate: false,
  combinedText: '',
});

const fmtNum = (v: number): string => v.toLocaleString('id-ID', { maximumFractionDigits: 2 });

/**
 * Ekstrak konteks universal dari SATU pesan, digabung ke `base` bila
 * ada. Nilai baru yang tidak null menimpa nilai lama pada kolom yang
 * sama (koreksi); kolom lain tidak disentuh. Ekstraksi memakai parser
 * bersama yang sudah ada sebisa mungkin.
 */
export function extractUniversalContext(text: string, base?: UniversalIntakeContext): UniversalIntakeContext {
  const raw = (text || '').trim();
  const t = ` ${raw.toLowerCase().replace(/\s+/g, ' ')} `;
  const ctx: UniversalIntakeContext = base
    ? {
        ...base,
        secondary: [...base.secondary],
        scopeConfirmed: [...base.scopeConfirmed],
        scopeRemoved: [...base.scopeRemoved],
        siteConditions: [...base.siteConditions],
        technicalSpecs: [...base.technicalSpecs],
        counts: [...base.counts],
        askedKeys: [...base.askedKeys],
      }
    : emptyUniversalIntake();

  // --- Klasifikasi (hanya dari teks giliran ini; primer tidak ditimpa
  // oleh klasifikasi giliran lanjutan yang lebih lemah — disiplin baru
  // yang muncul di giliran lanjutan menjadi sekunder/konfirmasi). ---
  const cls = classifyUniversal(raw);
  if (!ctx.primary && cls.primary) {
    ctx.primary = cls.primary;
    ctx.isMulti = cls.isMulti;
  }
  const knownIds = new Set([
    ...(ctx.primary ? [ctx.primary.id] : []),
    ...ctx.secondary.map((s) => s.id),
  ]);
  for (const d of cls.matches) {
    if (knownIds.has(d.id)) continue;
    if (ctx.primary && d.id === ctx.primary.id) continue;
    // Disiplin baru pada giliran lanjutan = cakupan tambahan terkonfirmasi.
    if (base && ctx.primary) {
      ctx.secondary.push(d);
      knownIds.add(d.id);
      if (!ctx.scopeConfirmed.some((s) => s.subcategoryId === d.id)) {
        ctx.scopeConfirmed.push({ label: d.label, subcategoryId: d.id, status: 'USER_CONFIRMED' });
      }
      ctx.isMulti = true;
    } else if (!ctx.primary) {
      ctx.primary = d;
      knownIds.add(d.id);
    } else {
      ctx.secondary.push(d);
      knownIds.add(d.id);
    }
  }

  // --- Lapisan bersama (projectIntake): luas hektar/are + lokasi +
  // kondisi lahan + preferensi — dipakai ulang, bukan ditulis ulang. ---
  const shared = extractProjectContext(raw);
  if (shared.location && !ctx.location) ctx.location = shared.location;
  else if (shared.location) ctx.location = shared.location;
  for (const s of shared.siteConditions) {
    if (!ctx.siteConditions.includes(s)) ctx.siteConditions.push(s);
  }
  if (shared.qualityPreference) ctx.qualityPreference = shared.qualityPreference;
  if (shared.materialPreference) ctx.materialPreference = shared.materialPreference;
  if (shared.budgetText) ctx.budgetText = shared.budgetText;

  // --- Dimensi dari parser kebutuhan bersama ---
  const needs = extractRabNeeds(raw);
  const spec = extractUniversalSpec(raw);
  const areaMention = parseAreaMentionM2(raw);
  // "Luas bangunannya …" secara eksplisit adalah luas BANGUNAN (Contoh F).
  const buildingAreaMention = /luas bangunan/.test(t) ? areaMention : null;
  if (buildingAreaMention) {
    ctx.buildingAreaM2 = buildingAreaMention.valueM2;
  } else if (needs.buildingArea != null) {
    ctx.buildingAreaM2 = needs.buildingArea;
  } else if (spec.footprintM2 != null && (ctx.primary?.family === 'building' || ctx.primary?.family === 'mep')) {
    ctx.buildingAreaM2 = spec.footprintM2;
  }
  if (areaMention && !buildingAreaMention && ctx.primary?.family !== 'building') {
    ctx.landAreaM2 = areaMention.valueM2;
    ctx.landAreaOriginal = areaMention.original;
  } else if (needs.landAreaM2 != null) {
    ctx.landAreaM2 = needs.landAreaM2;
    ctx.landAreaOriginal = `${fmtNum(needs.landAreaM2)} m²`;
  }
  if (needs.floors != null) ctx.floors = needs.floors;
  const len = needs.landLength ?? needs.buildingLength;
  const wid = needs.landWidth ?? needs.buildingWidth;
  if (len && wid) ctx.dimensionsText = `${fmtNum(len)} × ${fmtNum(wid)} m`;

  // --- Linear: panjang pekerjaan (jalan/saluran/jembatan/pagar) ---
  const anchoredLen = parseAnchoredLinear(raw, ['sepanjang', 'panjang']);
  if (anchoredLen) {
    ctx.lengthM = anchoredLen.valueM;
    ctx.lengthOriginal = anchoredLen.original;
  } else if (needs.lengthM != null) {
    ctx.lengthM = needs.lengthM;
    ctx.lengthOriginal = ctx.lengthOriginal ?? `${fmtNum(needs.lengthM)} m`;
  } else {
    // "jalan beton sepanjang 2 km" tertangkap anchor; pola longgar
    // "2 km" sesudah kata kategori ditangkap parser kebutuhan (lengthM).
    const kmHit = findLinearMentions(raw).find((h) => h.original.endsWith('km') || h.original.endsWith('kilometer'));
    if (kmHit && ctx.primary?.family === 'civil') {
      ctx.lengthM = kmHit.valueM;
      ctx.lengthOriginal = kmHit.original;
    }
  }
  const width = parseAnchoredLinear(raw, ['lebar']);
  if (width) ctx.widthM = width.valueM;
  else if (spec.widthM != null) ctx.widthM = spec.widthM;
  const depth = parseAnchoredLinear(raw, ['kedalaman', 'kedalaman saluran', 'dalam']);
  if (depth) ctx.depthM = depth.valueM;
  const height = parseAnchoredLinear(raw, ['tinggi']);
  if (height) ctx.heightM = height.valueM;
  else if (spec.heightM != null) ctx.heightM = spec.heightM;
  const span = parseAnchoredLinear(raw, ['bentang', 'span']);
  if (span) ctx.spanM = span.valueM;
  else if (spec.spanM != null) ctx.spanM = spec.spanM;
  const vol = parseVolumeMention(raw);
  if (vol) ctx.volumeM3 = vol.valueM3;
  for (const c of parseCountMentions(raw)) {
    if (!ctx.counts.some((x) => x.value === c.value && x.unit === c.unit)) ctx.counts.push(c);
  }

  // --- Spek teknis apa adanya (tidak ditafsirkan) ---
  const specPatterns: Array<RegExp> = [
    /\btebal\s+\d+(?:[.,]\d+)?\s*(?:cm|mm|m)\b/g,
    /\bbeton\s+k-?\s?\d{3}\b/g,
    /\bmutu\s+(?:beton\s+)?k-?\s?\d{3}\b/g,
    /\bcbr\s*(?:min(?:imal)?\s*)?\d+(?:[.,]\d+)?\s*%/g,
    /\b\d+(?:[.,]\d+)?\s*(?:kva|kw|pk)\b/g,
    /\bsistem struktur\s+[a-z ]{3,30}?(?=\s*(?:,|\.|$))/g,
  ];
  for (const re of specPatterns) {
    for (const m of t.matchAll(re)) {
      const v = m[0].trim();
      if (!ctx.technicalSpecs.some((s) => s.toLowerCase() === v)) ctx.technicalSpecs.push(v);
    }
  }
  if (/\bsubgrade\b|\btanah dasar\b/.test(t) && !ctx.technicalSpecs.includes('subgrade disebut')) {
    ctx.technicalSpecs.push('subgrade disebut');
  }
  // Kebutuhan ruang bangunan (dari parser kebutuhan bersama).
  if (needs.bedrooms != null) {
    const v = `${needs.bedrooms} kamar tidur`;
    if (!ctx.technicalSpecs.includes(v)) ctx.technicalSpecs.push(v);
  }
  if (needs.bathrooms != null) {
    const v = `${needs.bathrooms} kamar mandi`;
    if (!ctx.technicalSpecs.includes(v)) ctx.technicalSpecs.push(v);
  }

  // --- Baru vs eksisting (kata sifat eksplisit saja; kata benda
  // "pembangunan" pada PESAN AWAL tidak dihitung — lihat Contoh E
  // master prompt. Pada giliran JAWABAN atas pertanyaan status,
  // jawaban "pembangunan baru"/"baru" adalah konfirmasi eksplisit). ---
  if (/\b(bangunan|gedung|sekolah|rumah|fasilitas|pembangunan)\s+baru\b/.test(t) || /\bbangun baru\b/.test(t)) {
    ctx.isNewConstruction = true;
  } else if (base && base.askedKeys.includes('new-construction') && /\bbaru\b/.test(t) && !/\brenovasi\b/.test(t)) {
    ctx.isNewConstruction = true;
  } else if (/\beksisting\b/.test(t) || (base && base.askedKeys.includes('new-construction') && /\brenovasi|penambahan\b/.test(t))) {
    ctx.isNewConstruction = false;
  }

  // --- Cakupan renovasi yang disebut ---
  if (ctx.primary?.id === 'renovasi' || cls.primary?.id === 'renovasi') {
    if (/\bseluruh bangunan\b|\bsemua bangunan\b/.test(t)) ctx.renovationScope = 'seluruh bangunan';
    else if (/\bbagian tertentu\b/.test(t)) ctx.renovationScope = 'bagian tertentu';
    // "lantai 1/2" = cakupan renovasi HANYA pada giliran lanjutan atau
    // bila ada kata penanda cakupan — pada pesan awal "renovasi rumah
    // 2 lantai", frasa itu adalah JUMLAH LANTAI bangunan (Contoh D
    // master prompt: cakupannya justru yang harus ditanyakan).
    else if ((base || /\b(direnovasi|bagian|hanya|saja)\b/.test(t)) && /\blantai\s*satu\b/.test(t)) ctx.renovationScope = 'lantai 1';
    else if ((base || /\b(direnovasi|bagian|hanya|saja)\b/.test(t)) && /\blantai\s*dua\b/.test(t)) ctx.renovationScope = 'lantai 2';
    else if ((base || /\b(direnovasi|bagian|hanya|saja)\b/.test(t)) && /\blantai\s*1\b/.test(t)) ctx.renovationScope = 'lantai 1';
    else if ((base || /\b(direnovasi|bagian|hanya|saja)\b/.test(t)) && /\blantai\s*2\b/.test(t)) ctx.renovationScope = 'lantai 2';
    else {
      // Bagian bernama yang disebut sesudah kata renovasi ("renovasi
      // dapur dan kamar mandi") — dicatat apa adanya sebagai cakupan.
      const named = raw.toLowerCase().match(/\brenovasi\s+([a-z][a-z &]{2,40}?)(?=\s*(?:,|\.|$|saja\b|total\b))/);
      if (named && !/^(rumah|gedung|bangunan|kantor|sekolah)\b/.test(named[1].trim())) {
        ctx.renovationScope = named[1].trim();
      }
    }
  }

  // --- Tipe drainase dari subtipe katalog (dipakai ulang) ---
  const sub = detectSubtypeFromText('drainase', raw);
  if (sub) ctx.drainageType = sub.label;
  else if (/\bsaluran beton terbuka\b/.test(t)) ctx.drainageType = 'Saluran beton terbuka';

  // --- Item lingkup bernama pada teks ("dengan taman, pagar, dan
  // drainase" / "tambahkan pagar keliling dan area parkir") ---
  for (const d of cls.secondary) {
    if (!ctx.scopeConfirmed.some((s) => s.subcategoryId === d.id)) {
      ctx.scopeConfirmed.push({ label: d.label, subcategoryId: d.id, status: 'USER_CONFIRMED' });
    }
  }

  if (/\b(langsung buatkan|langsung buat|langsung saja|buatkan sekarang|langsung dihitung)\b/.test(t)) {
    ctx.forceGenerate = true;
  }

  ctx.combinedText = base?.combinedText ? `${base.combinedText} ${raw}` : raw;
  refreshUniversalFacts(ctx);
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Paket pekerjaan SARAN per keluarga (SUGGESTION_ONLY — struktur      */
/* usulan umum disiplin, BUKAN cakupan terkonfirmasi dan BUKAN hasil   */
/* hitung; susunan final mengikuti template katalog saat generate).    */
/* ------------------------------------------------------------------ */

const FAMILY_PACKAGES: Record<UniversalFamily, string[]> = {
  building: ['Pekerjaan persiapan', 'Pekerjaan tanah & pondasi', 'Pekerjaan struktur', 'Pekerjaan arsitektur & finishing', 'Pekerjaan MEP', 'Pekerjaan luar & utilitas pendukung'],
  civil: ['Pekerjaan persiapan', 'Pekerjaan tanah', 'Pekerjaan struktur utama pekerjaan sipil', 'Pekerjaan pelengkap & perlengkapan', 'Pekerjaan utilitas pendukung'],
  landscape: ['Pekerjaan persiapan & pembersihan lahan', 'Pekerjaan tanah dan pembentukan kontur', 'Pekerjaan hardscape', 'Pekerjaan landscape dan vegetasi', 'Pekerjaan utilitas pendukung'],
  mep: ['Pekerjaan persiapan & pengadaan material', 'Pekerjaan instalasi utama', 'Pekerjaan terminasi & panel', 'Pekerjaan pengujian & komisioning'],
  specialized: ['Pekerjaan persiapan', 'Pekerjaan utama sesuai disiplin', 'Pekerjaan pelengkap & finishing terkait'],
};

export function universalSuggestedPackages(ctx: UniversalIntakeContext): string[] {
  if (!ctx.primary) return [];
  const out = [...(FAMILY_PACKAGES[ctx.primary.family] ?? [])];
  for (const d of ctx.secondary) {
    const label = `Paket ${d.label.toLowerCase()} (disiplin tambahan)`;
    if (!out.includes(label)) out.push(label);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Fakta + provenans + info hilang (§6/§7)                             */
/* ------------------------------------------------------------------ */

export function refreshUniversalFacts(ctx: UniversalIntakeContext): void {
  const facts: IntakeFact[] = [];
  const push = (key: string, label: string, value: string, status: FactStatus) => {
    facts.push({ key, label, value, status });
  };
  if (ctx.primary) {
    push('category', 'Kategori utama', ctx.primary.label, 'USER_CONFIRMED');
    push('family', 'Keluarga pekerjaan', FAMILY_LABELS[ctx.primary.family], 'SYSTEM_DERIVED');
  }
  for (const d of ctx.secondary) {
    push(`secondary-${d.id}`, 'Disiplin tambahan', d.label, 'USER_CONFIRMED');
  }
  if (ctx.location) push('location', 'Lokasi', ctx.location, 'USER_CONFIRMED');
  if (ctx.landAreaM2 != null) {
    const derived = ctx.landAreaOriginal != null && !ctx.landAreaOriginal.includes('m²');
    push('landArea', 'Luas lahan/area', `${fmtNum(ctx.landAreaM2)} m²${derived ? ` (dari "${ctx.landAreaOriginal}")` : ''}`, derived ? 'SYSTEM_DERIVED' : 'USER_CONFIRMED');
  }
  if (ctx.buildingAreaM2 != null) push('buildingArea', 'Luas bangunan', `${fmtNum(ctx.buildingAreaM2)} m²`, 'USER_CONFIRMED');
  if (ctx.dimensionsText) push('dimensions', 'Dimensi', ctx.dimensionsText, 'USER_CONFIRMED');
  if (ctx.floors != null) push('floors', 'Jumlah lantai', `${ctx.floors}`, 'USER_CONFIRMED');
  if (ctx.lengthM != null) {
    const derived = ctx.lengthOriginal != null && /(km|kilometer)/.test(ctx.lengthOriginal);
    push('length', 'Panjang pekerjaan', `${fmtNum(ctx.lengthM)} m${derived ? ` (dari "${ctx.lengthOriginal}")` : ''}`, derived ? 'SYSTEM_DERIVED' : 'USER_CONFIRMED');
  }
  if (ctx.widthM != null) push('width', 'Lebar', `${fmtNum(ctx.widthM)} m`, 'USER_CONFIRMED');
  if (ctx.depthM != null) push('depth', 'Kedalaman', `${fmtNum(ctx.depthM)} m`, 'USER_CONFIRMED');
  if (ctx.heightM != null) push('height', 'Tinggi', `${fmtNum(ctx.heightM)} m`, 'USER_CONFIRMED');
  if (ctx.spanM != null) push('span', 'Bentang', `${fmtNum(ctx.spanM)} m`, 'USER_CONFIRMED');
  if (ctx.volumeM3 != null) push('volume', 'Volume disebut', `${fmtNum(ctx.volumeM3)} m³`, 'USER_CONFIRMED');
  for (const c of ctx.counts) push(`count-${c.unit}-${c.value}`, 'Jumlah disebut', c.original, 'USER_CONFIRMED');
  for (const s of ctx.scopeConfirmed) push(`scope-${s.label}`, 'Cakupan terkonfirmasi', s.label, s.status);
  for (const s of ctx.siteConditions) push(`site-${s}`, 'Kondisi lahan', s, 'USER_CONFIRMED');
  for (const s of ctx.technicalSpecs) push(`spec-${s}`, 'Spek teknis disebut', s, 'USER_CONFIRMED');
  if (ctx.drainageType) push('drainageType', 'Tipe drainase', ctx.drainageType, 'USER_CONFIRMED');
  if (ctx.renovationScope) push('renovationScope', 'Cakupan renovasi', ctx.renovationScope, 'USER_CONFIRMED');
  if (ctx.isNewConstruction != null) {
    push('newConstruction', 'Status bangunan', ctx.isNewConstruction ? 'pembangunan baru' : 'eksisting', 'USER_CONFIRMED');
  }
  if (ctx.materialPreference) push('material', 'Material disebut', ctx.materialPreference, 'USER_PREFERENCE');
  if (ctx.qualityPreference) push('quality', 'Kualitas disebut (belum dirinci)', ctx.qualityPreference, 'USER_PREFERENCE');
  if (ctx.budgetText) push('budget', 'Anggaran disebut', ctx.budgetText, 'USER_CONFIRMED');
  ctx.facts = facts;

  ctx.suggestedPackages = universalSuggestedPackages(ctx);

  // Info kritis hilang — mengikuti definisi pertanyaan (§7): hanya
  // yang berdampak material ke cakupan/kuantitas/metode.
  const missing: string[] = [];
  const unresolved: string[] = [];
  const q = questionDefsFor(ctx);
  for (const def of q) {
    if (!def.isSatisfied(ctx)) {
      if (def.critical) missing.push(def.missingLabel);
      else unresolved.push(def.missingLabel);
    }
  }
  if (!ctx.location) unresolved.push('lokasi proyek');
  if (ctx.qualityPreference && !ctx.materialPreference) {
    unresolved.push(`rincian spesifikasi kualitas "${ctx.qualityPreference}"`);
  }
  ctx.missingCritical = missing;
  ctx.unresolved = unresolved;

  // Tahap internal (§3) — adaptif, bukan urutan kaku.
  if (!ctx.primary) ctx.stage = 'PROJECT_IDENTITY';
  else if (ctx.approvalStatus === 'APPROVED') ctx.stage = 'GENERATION';
  else if (missing.length) {
    const next = q.find((d) => !d.isSatisfied(ctx) && d.critical);
    ctx.stage = next?.stage ?? 'PROJECT_DIMENSIONS';
  } else ctx.stage = 'PROJECT_REVIEW';
}

/* ------------------------------------------------------------------ */
/* Definisi pertanyaan per kategori (§4/§7) — satu pertanyaan fokus    */
/* per giliran; yang tidak esensial untuk draf awal boleh tetap        */
/* UNRESOLVED. `options` hanya berisi pilihan yang didukung katalog    */
/* atau yang DILABELI sebagai pilihan konfirmasi pengguna.             */
/* ------------------------------------------------------------------ */

export interface IntakeQuestion {
  key: string;
  stage: UniversalStage;
  critical: boolean;
  missingLabel: string;
  prompt: (ctx: UniversalIntakeContext) => string;
  options?: Array<{ id: string; label: string }>;
  isSatisfied: (ctx: UniversalIntakeContext) => boolean;
}

const hasAnyMeasure = (ctx: UniversalIntakeContext): boolean =>
  ctx.lengthM != null || ctx.landAreaM2 != null || ctx.buildingAreaM2 != null ||
  ctx.volumeM3 != null || ctx.dimensionsText != null || ctx.counts.length > 0;

function questionDefsFor(ctx: UniversalIntakeContext): IntakeQuestion[] {
  const p = ctx.primary;
  if (!p) return [];
  const defs: IntakeQuestion[] = [];
  const add = (d: IntakeQuestion) => defs.push(d);

  if (ctx.isMulti && p.family === 'building' && p.id !== 'renovasi') {
    add({
      key: 'new-construction', stage: 'PROJECT_IDENTITY', critical: true,
      missingLabel: 'status pembangunan (baru/eksisting)',
      isSatisfied: (c) => c.isNewConstruction != null,
      prompt: (c) => `Apakah bangunan ${labelShort(c)}-nya termasuk **pembangunan baru**, atau renovasi/penambahan atas bangunan eksisting?`,
      options: [
        { id: 'new', label: 'Pembangunan baru' },
        { id: 'existing', label: 'Renovasi / penambahan eksisting' },
      ],
    });
  }

  switch (p.family) {
    case 'building':
      if (p.id === 'bangunan-umum') {
        add({
          key: 'building-function', stage: 'PROJECT_IDENTITY', critical: true,
          missingLabel: 'fungsi bangunan',
          isSatisfied: (c) => c.primary?.id !== 'bangunan-umum',
          prompt: () => 'Bangunannya akan dipakai untuk apa? Misalnya kantor, sekolah, gudang, atau fungsi lainnya — sebutkan fungsinya agar lingkupnya tepat.',
        });
      }
      if (p.id === 'renovasi') {
        add({
          key: 'renovation-scope', stage: 'PROJECT_SCOPE', critical: true,
          missingLabel: 'bagian yang direnovasi',
          isSatisfied: (c) => c.renovationScope != null,
          prompt: (c) => `Bagian mana saja yang ingin direnovasi${c.floors ? ` pada bangunan ${c.floors} lantai ini` : ''}? Misalnya seluruh bangunan, lantai 1, lantai 2, atau hanya bagian tertentu (dapur, kamar mandi, fasad, dan sebagainya).`,
          options: [
            { id: 'renov-all', label: 'Seluruh bangunan' },
            { id: 'renov-l1', label: 'Lantai 1 saja' },
            { id: 'renov-l2', label: 'Lantai 2 saja' },
            { id: 'renov-part', label: 'Bagian tertentu' },
          ],
        });
        add({
          key: 'renovation-area', stage: 'PROJECT_DIMENSIONS', critical: false,
          missingLabel: 'luas area yang direnovasi',
          isSatisfied: (c) => c.buildingAreaM2 != null || c.landAreaM2 != null || c.dimensionsText != null,
          prompt: () => 'Berapa perkiraan luas area yang direnovasi? Bila belum tahu, jawab "itu aja" — luasnya saya tandai belum teresolusi di brief.',
        });
      } else {
        add({
          key: 'building-area', stage: 'PROJECT_DIMENSIONS', critical: true,
          missingLabel: 'luas bangunan total',
          isSatisfied: (c) => c.buildingAreaM2 != null || c.dimensionsText != null,
          prompt: () => 'Berapa perkiraan **luas bangunan total**-nya?',
        });
        add({
          key: 'building-floors', stage: 'PROJECT_DIMENSIONS', critical: false,
          missingLabel: 'jumlah lantai',
          isSatisfied: (c) => c.floors != null,
          prompt: () => 'Bangunannya berapa lantai?',
        });
      }
      break;

    case 'civil':
      if (p.id === 'jembatan') {
        add({
          key: 'bridge-span', stage: 'PROJECT_DIMENSIONS', critical: true,
          missingLabel: 'bentang jembatan',
          isSatisfied: (c) => c.spanM != null || c.lengthM != null,
          prompt: () => 'Berapa **bentang jembatan** yang direncanakan (meter)?',
        });
        add({
          key: 'bridge-width', stage: 'PROJECT_DIMENSIONS', critical: false,
          missingLabel: 'lebar jembatan',
          isSatisfied: (c) => c.widthM != null,
          prompt: () => 'Berapa lebar jembatannya? Bila belum ditentukan, jawab "itu aja".',
        });
      } else if (p.id === 'drainase') {
        add({
          key: 'drainage-type', stage: 'TECHNICAL_REQUIREMENTS', critical: true,
          missingLabel: 'tipe saluran drainase',
          isSatisfied: (c) => c.drainageType != null,
          prompt: () =>
            'Untuk menentukan lingkup konstruksinya, **saluran seperti apa yang direncanakan?** ' +
            'Pilihan yang template katalognya tersedia: **U-ditch pracetak**, **pasangan batu kali**, **gorong-gorong / box culvert**. ' +
            '**Saluran beton terbuka** juga bisa dipilih — itu pilihan konfirmasi Anda; template terdekat yang dipakai akan dinyatakan terbuka di brief. Atau sebutkan tipe lainnya.',
          options: [
            { id: 'drain-uditch', label: 'U-ditch pracetak' },
            { id: 'drain-batu', label: 'Pasangan batu kali' },
            { id: 'drain-culvert', label: 'Gorong-gorong / box culvert' },
            { id: 'drain-beton-terbuka', label: 'Saluran beton terbuka' },
          ],
        });
        add({
          key: 'drainage-dims', stage: 'PROJECT_DIMENSIONS', critical: false,
          missingLabel: 'lebar & kedalaman saluran',
          isSatisfied: (c) => c.widthM != null || c.depthM != null,
          prompt: () => 'Berapa lebar dan kedalaman salurannya? Bila belum ditentukan, jawab "itu aja" — dimensinya mengikuti parameter template dan ditandai di brief.',
        });
      } else if (p.id === 'dinding-penahan') {
        add({
          key: 'retaining-length', stage: 'PROJECT_DIMENSIONS', critical: true,
          missingLabel: 'panjang dinding penahan',
          isSatisfied: (c) => c.lengthM != null,
          prompt: () => 'Berapa **panjang dinding penahan** yang direncanakan (meter)?',
        });
        add({
          key: 'retaining-height', stage: 'PROJECT_DIMENSIONS', critical: false,
          missingLabel: 'tinggi dinding penahan',
          isSatisfied: (c) => c.heightM != null,
          prompt: () => 'Berapa tinggi dinding penahannya? Bila belum ditentukan, jawab "itu aja".',
        });
      } else if (p.id === 'pekerjaan-tanah') {
        add({
          key: 'earthwork-size', stage: 'PROJECT_DIMENSIONS', critical: true,
          missingLabel: 'ukuran pekerjaan tanah (luas/volume)',
          isSatisfied: (c) => hasAnyMeasure(c),
          prompt: () => 'Berapa ukuran pekerjaannya — **luas area** yang dikerjakan atau **volume** galian/urugannya (m³)?',
        });
      } else if (p.id === 'pelindung-pantai') {
        add({
          key: 'coast-length', stage: 'PROJECT_DIMENSIONS', critical: true,
          missingLabel: 'panjang pengaman pantai',
          isSatisfied: (c) => c.lengthM != null,
          prompt: () => 'Berapa **panjang** garis pantai/dermaga yang dikerjakan (meter)?',
        });
      } else if (p.id === 'irigasi' || p.id === 'bendung' || p.id === 'gorong-gorong') {
        add({
          key: 'water-length', stage: 'PROJECT_DIMENSIONS', critical: true,
          missingLabel: 'panjang saluran/bangunan air',
          isSatisfied: (c) => c.lengthM != null || c.landAreaM2 != null,
          prompt: () => `Berapa **panjang** ${p.id === 'bendung' ? 'bendung/bangunan air' : 'saluran'}-nya (meter)?`,
        });
      } else {
        // Jalan (semua varian): panjang & lebar adalah pasangan kritis.
        add({
          key: 'road-length', stage: 'PROJECT_DIMENSIONS', critical: true,
          missingLabel: 'panjang jalan',
          isSatisfied: (c) => c.lengthM != null,
          prompt: () => 'Berapa **panjang jalan** yang direncanakan?',
        });
        add({
          key: 'road-width', stage: 'PROJECT_DIMENSIONS', critical: true,
          missingLabel: 'lebar jalan',
          isSatisfied: (c) => c.widthM != null,
          prompt: () => 'Berapa **lebar jalan** yang direncanakan?',
        });
        add({
          key: 'road-condition', stage: 'SITE_CONDITIONS', critical: false,
          missingLabel: 'kondisi jalan eksisting',
          isSatisfied: (c) => c.siteConditions.length > 0,
          prompt: () => 'Bagaimana kondisi jalan eksistingnya (jalan baru, jalan rusak, peningkatan jalan lama)? Bila tidak ada catatan, jawab "itu aja".',
        });
      }
      break;

    case 'mep':
      add({
        key: 'mep-area', stage: 'PROJECT_DIMENSIONS', critical: true,
        missingLabel: 'luas bangunan/proyek yang dilayani',
        isSatisfied: (c) => c.buildingAreaM2 != null || c.landAreaM2 != null || c.dimensionsText != null || c.counts.length > 0,
        prompt: (c) => `Berapa **luas bangunan/proyek** yang dilayani ${labelShort(c)} ini? Luas itu yang menjadi basis perhitungan jumlah titik dan panjang instalasinya.`,
      });
      add({
        key: 'mep-floors', stage: 'PROJECT_DIMENSIONS', critical: false,
        missingLabel: 'jumlah lantai bangunan',
        isSatisfied: (c) => c.floors != null,
        prompt: () => 'Bangunannya berapa lantai? Bila tidak relevan, jawab "itu aja".',
      });
      break;

    case 'specialized':
      if (p.id === 'pembongkaran') {
        add({
          key: 'demolition-area', stage: 'PROJECT_DIMENSIONS', critical: true,
          missingLabel: 'luas bangunan yang dibongkar',
          isSatisfied: (c) => c.buildingAreaM2 != null || c.landAreaM2 != null || c.dimensionsText != null,
          prompt: () => 'Berapa **luas bangunan yang dibongkar** (m²)?',
        });
      } else {
        add({
          key: 'specialized-size', stage: 'PROJECT_DIMENSIONS', critical: true,
          missingLabel: 'ukuran pekerjaan (luas/dimensi/jumlah)',
          isSatisfied: (c) => hasAnyMeasure(c) || c.floors != null,
          prompt: (c) => `Berapa ukuran pekerjaannya — luas area ${labelShort(c)}, dimensinya, atau jumlahnya?`,
        });
      }
      break;

    case 'landscape':
      add({
        key: 'site-size', stage: 'PROJECT_DIMENSIONS', critical: true,
        missingLabel: 'ukuran pekerjaan (panjang/luas)',
        isSatisfied: (c) => c.lengthM != null || c.landAreaM2 != null,
        prompt: (c) => `Berapa ukuran ${labelShort(c)}-nya — panjang atau luas areanya?`,
      });
      break;
  }
  return defs;
}

function labelShort(ctx: UniversalIntakeContext): string {
  return (ctx.primary?.label ?? 'pekerjaan ini').toLowerCase();
}

/** Pertanyaan berikutnya yang harus diajukan (null = siap ke brief). */
export function selectNextQuestion(ctx: UniversalIntakeContext): IntakeQuestion | null {
  for (const def of questionDefsFor(ctx)) {
    if (def.isSatisfied(ctx)) continue;
    if (ctx.askedKeys.includes(def.key)) {
      // Pertanyaan yang sudah diajukan tetapi belum terjawab: jangan
      // diulang — kekurangannya dicatat di brief (§7: detail boleh
      // tetap tak teresolusi; untuk yang kritis, brief menyatakannya
      // dan generate dapat menolak secara jujur lewat mesin).
      continue;
    }
    if (!def.critical && ctx.askedKeys.length > 0) {
      // Pertanyaan NON-kritis hanya diajukan sebagai pertanyaan
      // pertama intake; sesudah pengguna menjawab satu pertanyaan,
      // sisanya dicatat sebagai belum teresolusi di brief — bukan
      // diinterogasi satu per satu (§7: satu pertanyaan fokus).
      continue;
    }
    return def;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Brief proyek (§8) — ringkasan transparan sebelum generate.          */
/* ------------------------------------------------------------------ */

export function buildUniversalBriefLines(ctx: UniversalIntakeContext): string[] {
  refreshUniversalFacts(ctx);
  const lines: string[] = [];
  lines.push('**Brief proyek — periksa dulu sebelum RAB disusun:**');
  lines.push('');
  lines.push('**Proyek**');
  if (ctx.primary) {
    lines.push(`• Kategori utama: ${ctx.primary.label} (${FAMILY_LABELS[ctx.primary.family]})`);
  }
  if (ctx.secondary.length) {
    lines.push(`• Disiplin tambahan (dipisahkan, tidak tercampur): ${ctx.secondary.map((d) => d.label).join('; ')}`);
  }
  if (ctx.isNewConstruction != null) {
    lines.push(`• Status: ${ctx.isNewConstruction ? 'pembangunan baru' : 'atas bangunan eksisting'}`);
  }
  const dimFacts = ctx.facts.filter((f) => ['landArea', 'buildingArea', 'dimensions', 'floors', 'length', 'width', 'depth', 'height', 'span', 'volume', 'location'].includes(f.key) || f.key.startsWith('count-'));
  if (dimFacts.length) {
    lines.push('');
    lines.push('**Dimensi & lokasi yang terkonfirmasi**');
    for (const f of dimFacts) {
      lines.push(`• ${f.label}: ${f.value}${f.status === 'SYSTEM_DERIVED' ? ' — konversi satuan sistem, nilai asli dipertahankan' : ''}`);
    }
  }
  if (ctx.scopeConfirmed.length) {
    lines.push('');
    lines.push('**Cakupan terkonfirmasi**');
    for (const s of ctx.scopeConfirmed) lines.push(`• ${s.label}`);
  }
  const specFacts = ctx.facts.filter((f) => f.key.startsWith('spec-') || f.key === 'drainageType' || f.key === 'renovationScope');
  if (specFacts.length || ctx.siteConditions.length) {
    lines.push('');
    lines.push('**Spek teknis & kondisi**');
    for (const f of specFacts) lines.push(`• ${f.label}: ${f.value}`);
    for (const s of ctx.siteConditions) lines.push(`• Kondisi lahan: ${s}`);
  }
  const prefFacts = ctx.facts.filter((f) => f.status === 'USER_PREFERENCE');
  if (prefFacts.length) {
    lines.push('');
    lines.push('**Preferensi Anda**');
    for (const f of prefFacts) lines.push(`• ${f.label}: ${f.value}`);
  }
  if (ctx.suggestedPackages.length) {
    lines.push('');
    lines.push('**Paket pekerjaan yang DISARANKAN** (saran struktur saja — belum terkonfirmasi, susunan final mengikuti template katalog saat generate):');
    ctx.suggestedPackages.forEach((p, i) => lines.push(`${i + 1}. ${p}`));
  }
  if (ctx.scopeRemoved.length) {
    lines.push('');
    lines.push(`**Dihapus atas permintaan Anda:** ${ctx.scopeRemoved.join('; ')}`);
  }
  lines.push('');
  lines.push('**Info yang masih hilang / belum teresolusi**');
  if (ctx.missingCritical.length) {
    for (const m of ctx.missingCritical) lines.push(`• (kritis) ${m} — draft dapat gagal disusun atau memakai parameter template untuk bagian ini; dinyatakan terbuka pada draft.`);
  }
  if (ctx.unresolved.length) {
    for (const u of ctx.unresolved) lines.push(`• ${u}`);
  }
  if (!ctx.missingCritical.length && !ctx.unresolved.length) {
    lines.push('• Tidak ada kekurangan inti. Harga per item tetap mengikuti status provenans pada draft (resmi/estimasi/belum tersedia).');
  }
  lines.push('');
  lines.push('**Cakupan katalog & batasnya**');
  const defs = [ctx.primary, ...ctx.secondary].filter((d): d is SubcategoryDef => d != null);
  for (const d of defs) {
    const cov = coverageFor(d);
    if (cov.support === 'didukung') {
      lines.push(`• ${d.label}: didukung ${cov.specificTemplateCount} template khusus (mis. ${cov.sampleTemplates.join('; ')}).`);
    } else if (cov.support === 'sebagian') {
      lines.push(`• ${d.label}: didukung SEBAGIAN — katalog punya ${cov.categoryTemplateCount} template pada kategorinya, tetapi belum ada template khusus subkategori ini; template terdekat dipakai dan dinyatakan pada draft.`);
    } else {
      lines.push(`• ${d.label}: **belum ada template katalog** untuk subkategori ini — bagian ini TIDAK dikarang; susun manual lewat RAB & Estimasi atau nyatakan sebagai item non-AHSP saat menyusun.`);
    }
  }
  lines.push('');
  lines.push(
    'Klik **"Susun draft RAB"** untuk menyusun draft dari brief ini memakai engine katalog EZRAB, ' +
      'atau koreksi / tambah / hapus cakupan dulu lewat chat — konteksnya tidak hilang.'
  );
  return lines;
}

/* ------------------------------------------------------------------ */
/* Penambahan & penghapusan cakupan pada giliran lanjutan (§5 G + §8)  */
/* ------------------------------------------------------------------ */

/** Frasa penghapusan cakupan: "hapus pagar", "tidak jadi drainase", "batalkan area parkir". */
export function parseScopeRemoval(text: string): string | null {
  const t = (text || '').toLowerCase();
  const m = t.match(/\b(?:hapus|hilangkan|tidak jadi|nggak jadi|batalkan|hilangkan saja|buang)\s+(?:pekerjaan\s+|bagian\s+)?([a-z0-9 &/]{3,40}?)(?=\s*(?:,|\.|$|nya\b|itu\b|saja\b|ya\b))/);
  return m ? m[1].trim() : null;
}

/** Cocokkan frasa hapus ke subkategori/butir cakupan pada konteks. */
export function matchRemovable(ctx: UniversalIntakeContext, phrase: string): SubcategoryDef | ScopeItem | null {
  const p = ` ${phrase.toLowerCase()} `;
  for (const d of [...ctx.secondary]) {
    if (d.detect.test(p)) return d;
  }
  for (const s of ctx.scopeConfirmed) {
    if (s.subcategoryId) {
      const d = subcategoryById(s.subcategoryId);
      if (d && d.detect.test(p)) return s;
    }
    if (s.label.toLowerCase().split(' ')[0] && p.includes(s.label.toLowerCase().split(' ')[0])) return s;
  }
  for (const d of SUBCATEGORIES) {
    if (d.detect.test(p) && (ctx.secondary.some((x) => x.id === d.id) || ctx.scopeConfirmed.some((s) => s.subcategoryId === d.id))) {
      return d;
    }
  }
  return null;
}

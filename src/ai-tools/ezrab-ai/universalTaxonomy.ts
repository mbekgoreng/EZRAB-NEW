/**
 * universalTaxonomy — TAKSONOMI TUNGGAL EZRAB Chat AI (W2/W10 §2, S1-R3/G13).
 *
 * SATU-SATUNYA rumah bagi klasifikasi lintas disiplin:
 * - SUBCATEGORIES (54 subkategori intake) + classifyUniversal,
 * - parser satuan berposisi (linear/luas/volume/jumlah),
 * - matriks cakupan katalog nyata,
 * - DISCIPLINE_MAP: pemetaan kanonis disiplin → scope engine →
 *   subkategori intake → fungsi bangunan → kategori katalog.
 *
 * Modul ini adalah DAUN: hanya mengimpor rabNeeds (parser angka) +
 * RabTemplateService (katalog hidup) + tipe. Ia TIDAK mengimpor
 * universalRab / universalIntake / buildingTypology — karena itu
 * universalIntake.ts mengekspor ulang simbol-simbol di sini (impor
 * lama tetap berfungsi) dan universalRab.ts dapat mengimpor
 * classifyUniversal + parser satuan TANPA siklus (sebelumnya
 * universalIntake sudah mengimpor extractUniversalSpec dari
 * universalRab, sehingga impor sebaliknya akan membentuk siklus).
 *
 * Konsistensi antar-taksonomi TIDAK dijaga dengan mengimpor registry
 * lain di sini (akan bersiklus), melainkan oleh
 * `validateTaxonomyConsistency` yang menerima registry hidup sebagai
 * argumen — dipanggil tes (universalClassification.test.ts) dengan
 * SCOPE_GROUPS + SUBCATEGORIES + BUILDING_FUNCTIONS yang sebenarnya.
 * Bila seseorang menambah disiplin di satu registry tanpa memetakan
 * di DISCIPLINE_MAP, validator itu yang berteriak.
 *
 * KEPUTUSAN DESAIN (W2/W10, 2026-11-22 — klasifikasi vs scope engine):
 * classifyUniversal dan detectScopes MENJAWAB PERTANYAAN BERBEDA.
 * Klasifikasi menjawab "disiplin apa saja yang disebut proyek ini"
 * (termasuk konteks: rumah tempat kolam berada, ambiguitas gorong-
 * gorong = drainase/jembatan, lift = MEP walau 0 template). Engine
 * menjawab "cakupan mana yang mendapat part BOQ" — keputusan yang
 * dipin banyak suite (rumah typed TIDAK PERNAH masuk engine,
 * box culvert telanjang BUKAN jembatan, "lift gedung" tetap draft
 * gedung). Probe 2026-11-22 membuktikan UNION kedua sumber MERUSAK
 * ketiga pin itu — jadi detectScopes TETAP satu-satunya sumber scope
 * engine, sementara classifyUniversal DITERUSKAN ke engine lewat
 * opts.classification + disimpan di UniversalSpec.classification
 * (satu fungsi, satu sumber, tidak bisa berbeda) dan divergensi yang
 * diketahui didokumentasikan di `KNOWN_CLASSIFICATION_DIVERGENCES`.
 * Jangan menyatukan keduanya dengan union tanpa keputusan owner.
 */

import { parseAreaNumber } from './rabNeeds';
import { RabTemplateService } from '../../services/rabTemplateService';
import type { TemplateCategory } from '../../types/rabTemplate';

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
  S('hotel', 'building', 'Hotel & hospitality', /\b(hotel|ballroom|kondotel|villa)\b/, ['HOTEL_HOSPITALITY'], ['hotel', 'ballroom', 'villa'], ['gedung']),
  S('kantor', 'building', 'Gedung perkantoran', /\b(kantor|perkantoran|office|gedung kantor)\b/, ['GEDUNG', 'BANGUNAN_TINGGI'], ['perkantoran', 'kantor', 'co-working', 'menara kantor'], ['gedung']),
  S('komersial', 'building', 'Bangunan komersial', /\b(mall|pasar modern|minimarket|restoran|showroom|pertokoan|ruko|kafe|toko)\b/, ['GEDUNG', 'BANGUNAN_TINGGI', 'HOTEL_HOSPITALITY'], ['pasar modern', 'showroom', 'retail', 'minimarket'], ['gedung']),
  S('gudang-industri', 'building', 'Gudang & bangunan industri', /\b(gudang|pabrik|workshop|warehouse|cold storage|bengkel|industri)\b/, ['INDUSTRI', 'GEDUNG'], ['gudang', 'pabrik', 'workshop', 'cold storage'], ['gedung']),
  // Agrikultur/peternakan (Gelombang A Fase 6): sebelumnya TIDAK ada di
  // taksonomi intake padahal scope-engine punya templatenya — pesan
  // kandang jatuh ke menu generik (S1). Katalog: PERTANIAN_PERKEBUNAN.
  S('kandang', 'specialized', 'Kandang & peternakan', /\b(kandang|peternakan)\b/, ['PERTANIAN_PERKEBUNAN'], ['kandang'], ['pertanian']),
  S('bangunan-publik', 'building', 'Bangunan publik', /\b(masjid|musholla|mushola|gereja|tempat ibadah|aula|gedung serbaguna|balai|gedung pemerintah|perpustakaan|asrama)\b/, ['GEDUNG'], ['serbaguna', 'fasilitas umum', 'asrama'], ['gedung']),
  S('apartemen', 'building', 'Apartemen & hunian bertingkat', /\b(apartemen|rumah susun|rusun)\b/, ['BANGUNAN_TINGGI'], ['apartemen', 'rumah susun', 'kondotel'], ['gedung']),
    // 'perumahan' (2026-11-22, W2/W10 §10): kawasan hunian ikut
  // terdeteksi sebagai 'rumah' (cakupan gedung) — sebelumnya frasa
  // 'perumahan' tidak dikenali taksonomi mana pun sehingga contoh
  // §10 'perumahan + jalan + drainase + retaining wall' kehilangan
  // disiplin perumahannya. Subkategori khusus 'perumahan' (estate vs
  // rumah tunggal) ditunda — butuh entri keluarga projectTaxonomy.
  S('rumah', 'building', 'Rumah tinggal', /\b(rumah tinggal|rumah|hunian|perumahan)\b/, ['RUMAH_TINGGAL'], ['rumah'], ['gedung'], 'house'),
  // "bangunan" TIDAK dihitung bila bagian dari "luas bangunan" (itu
  // dimensi, bukan fungsi); def ini fallback — gugur di classify bila
  // ada def bangunan yang lebih spesifik.
  S('bangunan-umum', 'building', 'Bangunan gedung', /\bgedung\b|(?<!luas )\bbangunan\b/, ['GEDUNG'], ['gedung'], ['gedung']),

  /* --- B. Sipil & infrastruktur --- */
  S('jembatan', 'civil', 'Jembatan', /\b(jembatan|jpo|flyover|overpass)\b/, ['JEMBATAN_STRUKTUR'], ['jembatan', 'jpo', 'box culvert bridge', 'slab bridge'], ['jembatan'], 'subtype'),
  S('gorong-gorong', 'civil', 'Gorong-gorong & box culvert', /\b(gorong|box culvert)\b/, ['JEMBATAN_STRUKTUR', 'DRAINASE_SANITASI', 'SDA_IRIGASI'], ['box culvert', 'cross drain'], ['drainase', 'jembatan'], 'subtype'),
  S('bendung', 'civil', 'Bendung & bangunan air', /\b(bendung|bendungan|embung|pintu air|check dam|bangunan air)\b/, ['SDA_IRIGASI'], ['bendung', 'embung', 'check dam', 'pintu air'], ['irigasi']),
  S('irigasi', 'civil', 'Saluran irigasi', /\birigasi\b(?!\s+(taman|landscape|lanskap)\b)/, ['SDA_IRIGASI'], ['irigasi'], ['irigasi']),
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
  S('fire-protection', 'mep', 'Fire protection', /\b(fire protection|hydrant|pemadam kebakaran|fire alarm)\b|\bsprinkler\b(?!\s+taman\b)/, ['MEP_SYSTEM', 'UTILITAS'], ['fire protection', 'hydrant'], ['mep']),
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
  kandang: 1,
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
  // G2 (F8 buildingTypology): komponen bangunan — famili 'specialized'
  // kecuali kandang (pondasi, struktur/atap, waterproofing, struktur
  // baja/beton, fasad, interior, finishing, pintu-jendela, dsb.) —
  // adalah BAGIAN dari bangunan, bukan disiplin terpisah. Bila ada
  // disiplin bangunan di antara matches, komponen tidak menambah
  // disiplin: 'gudang + atap baja ringan' adalah satu bangunan (atap
  // ada di conceptualWbs gudang; roofSystem adalah field bangunan di
  // buildingTypology), bukan proyek multi-disiplin. Tanpa ini,
  // universalIntakeGate mencegat permintaan gudang yang sudah lengkap
  // dan menanyakan pembangunan-baru-vs-renovasi alih-alih menyusun
  // draft. Preseden: pengecualian 'rumah + renovasi' di bawah.
  // 'secondary' sengaja TIDAK diubah — ia informatif (cakupan yang
  // disebut), sedangkan isMulti adalah sakelar perilaku gerbang.
  const hasBuildingDiscipline = matches.some((d) => d.family === 'building' || d.id === 'kandang');
  if (hasBuildingDiscipline) {
    for (const d of matches) {
      if (d.family === 'specialized' && d.id !== 'kandang') disciplines.delete(disciplineOf(d));
    }
  }
  // 'rumah' + 'renovasi' bukan multi — renovasi adalah cara pengerjaan
  // atas rumah itu (primer renovasi, rumah konteksnya).
  const isMulti = disciplines.size >= 2 && !(disciplines.size === 2 && disciplines.has('rumah') && disciplines.has('renovasi'));
  const sorted = [...matches].sort(
    (a, b) => (PRIMARY_PRIORITY[a.id] ?? 9) - (PRIMARY_PRIORITY[b.id] ?? 9)
  );
  let primary = sorted[0];
  // INTENT-FIRST (2026-11-20): komponen bangunan (famili 'specialized':
  // pondasi, struktur/atap, waterproofing, fasad, interior, ...) adalah
  // BAGIAN dari bangunan — logika G2 di atas sudah menerapkannya untuk
  // isMulti, tetapi pemilihan PRIMER masih menempatkan komponen (prioritas
  // 6) di atas rumah (7). Akibatnya frasa lingkup "pondasi sampai atap"
  // membuat permintaan RUMAH terklasifikasi primer 'pondasi', dan
  // specRabHijackGuard membajaknya dari mesin rumah. Bila ada disiplin
  // bangunan di antara matches, primer diambil dari disiplin bangunan
  // (komponen tetap tercatat di secondary/matches; blok objek-pertama
  // MEP/landscape di bawah tetap dapat mempromosikan di atasnya).
  // Tanpa disiplin bangunan perilaku tidak berubah ("buatkan rab
  // waterproofing" tetap primer waterproofing).
  if (hasBuildingDiscipline) {
    const buildingFirst = sorted.find((d) => d.family === 'building' || d.id === 'kandang');
    if (buildingFirst) primary = buildingFirst;
  }
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
  // FASE 4 (CHAT-05 + E-T1) — objek-pertama: bila disiplin landscape
  // (kolam / taman / playground) disebut SEBELUM bangunan yang menjadi
  // primer, landscape itulah objek proyeknya dan bangunan hanya konteks
  // lokasi ("kolam renang di halaman rumah", "taman di depan rumah").
  // Sebaliknya "rumah dengan kolam renang" tetap primer rumah (kolam
  // disebut sesudah rumah = cakupan tambahan, bukan subordinat yang
  // hilang). Aturan ini HANYA mempromosikan bila landscape muncul
  // lebih dulu di teks — urutan prioritas lain tidak berubah.
  if (primary.family === 'building') {
    const idxOf = (d: SubcategoryDef): number => {
      const i = t.search(d.detect);
      return i < 0 ? Number.MAX_SAFE_INTEGER : i;
    };
    const landscapeFirst = matches
      .filter((d) => d.family === 'landscape')
      .sort((a, b) => idxOf(a) - idxOf(b) || (PRIMARY_PRIORITY[a.id] ?? 9) - (PRIMARY_PRIORITY[b.id] ?? 9))[0];
    if (landscapeFirst && idxOf(landscapeFirst) < idxOf(primary)) primary = landscapeFirst;
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

export function cancelledLinearValues(text: string): number[] {
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

/** Semua penyebutan linear pada teks, berurutan posisi.
 * Batch 3 (§6.3): penyebutan DIAMETER bukan panjang linear —
 * "bore pile diameter 40 cm" tidak boleh menjadi lengthM 0,4 m
 * (cermin penjaga diameter-saja quantity.ts Sprint 3 B2: diameter
 * bukan panjang elemen). Penanda diameter: kata "diameter"/"dia.",
 * simbol ø, atau awalan "D<angka>" ("D40 cm"). */
export function findLinearMentions(text: string): LinearHit[] {
  const t = (text || '').toLowerCase();
  const hits: LinearHit[] = [];
  for (const m of t.matchAll(LINEAR_RE)) {
    const v = parseAreaNumber(m[1]);
    if (v == null || v <= 0) continue;
    const before = t.slice(Math.max(0, (m.index ?? 0) - 24), m.index ?? 0);
    if (/(\b(diameter|dia\.?)|ø|(?:^|\s)d)\s*$/.test(before)) continue;
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
): { valueM: number; original: string; pos: number } | null {
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
      return { valueM: last.valueM, original: last.original, pos: last.pos };
    }
  }
  return null;
}

/** Jumlah satuan hitung: "40 titik", "12 unit", "3 set", "25 buah". */
export function parseCountMentions(text: string): Array<{ value: number; unit: string; original: string; pos: number }> {
  const t = (text || '').toLowerCase();
  const out: Array<{ value: number; unit: string; original: string; pos: number }> = [];
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*(titik|unit|set|buah|ekor)\b/g)) {
    const v = parseAreaNumber(m[1]);
    if (v == null || v <= 0) continue;
    out.push({ value: v, unit: m[2], original: `${m[1]} ${m[2]}`, pos: m.index ?? 0 });
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
/* Penyebutan daya listrik (B2 §5.2 — basis ukuran MEP elektrikal)     */
/*                                                                     */
/* "instalasi listrik 800 kVA" adalah basis ukuran yang sah untuk      */
/* template MEP-ELECTRICAL-DIST (parameter installed_kva) — sebelum    */
/* B2, kVA tidak pernah diparse sehingga permintaan berbasis daya      */
/* jatuh ke needs-spec meski Batch 1 memintanya di missingSpecs.       */
/* Hanya kVA (dan VA → /1000) yang diparse: kW adalah daya nyata       */
/* (beda besaran dari kVA semu) dan kWp adalah kapasitas surya —       */
/* keduanya TIDAK disamakan dengan kVA di sini.                        */
/* ------------------------------------------------------------------ */

export interface PowerHit { valueKva: number; original: string; pos: number }

/** Semua penyebutan daya (kVA / VA) pada teks, berurutan posisi. */
export function findPowerMentions(text: string): PowerHit[] {
  const t = (text || '').toLowerCase();
  const hits: PowerHit[] = [];
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*(kva|va)\b/gi)) {
    const v = parseAreaNumber(m[1]);
    if (v == null || v <= 0) continue;
    const valueKva = m[2].toLowerCase() === 'va' ? v / 1000 : v;
    hits.push({ valueKva: Math.round(valueKva * 1000) / 1000, original: `${m[1]} ${m[2]}`, pos: m.index ?? 0 });
  }
  return hits;
}

/** Daya listrik yang disebut (penyebutan terakhir — pola parseVolumeMention). */
export function parsePowerMention(text: string): { valueKva: number; original: string } | null {
  const hits = findPowerMentions(text);
  if (hits.length === 0) return null;
  const last = hits[hits.length - 1];
  return { valueKva: last.valueKva, original: last.original };
}

/* ------------------------------------------------------------------ */
/* Penyebutan luas & volume berposisi (§10 — atribusi spek per-scope)  */
/*                                                                     */
/* Cermin findLinearMentions untuk m² dan m³: posisi diperlukan agar   */
/* extractScopeSpecs (universalRab) dapat mengatribusikan tiap angka   */
/* ke cakupan terdekat ("jalan 2 km + drainase 500 m" tidak boleh      */
/* berbagi satu angka).                                                */
/* ------------------------------------------------------------------ */

export interface AreaHit { valueM2: number; original: string; pos: number }

/** Semua penyebutan luas (m² / m2 / meter persegi) pada teks, berurutan posisi. */
export function findAreaMentions(text: string): AreaHit[] {
  const t = (text || '').toLowerCase();
  const hits: AreaHit[] = [];
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*(m2|m²|meter persegi)\b/gi)) {
    const v = parseAreaNumber(m[1]);
    if (v == null || v <= 0) continue;
    hits.push({ valueM2: v, original: `${m[1]} ${m[2]}`, pos: m.index ?? 0 });
  }
  return hits;
}

export interface VolumeHit { valueM3: number; original: string; pos: number }

/** Semua penyebutan volume (m³ / m3) pada teks, berurutan posisi. */
export function findVolumeMentions(text: string): VolumeHit[] {
  const t = (text || '').toLowerCase();
  const hits: VolumeHit[] = [];
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*m(?:3|³)\b/gi)) {
    const v = parseAreaNumber(m[1]);
    if (v == null || v <= 0) continue;
    hits.push({ valueM3: v, original: `${m[1]} m³`, pos: m.index ?? 0 });
  }
  return hits;
}

/* ------------------------------------------------------------------ */
/* DISCIPLINE_MAP — pemetaan kanonis antar-taksonomi (S1-R3/G13)       */
/*                                                                     */
/* Satu baris per scope engine (18, sama dengan SCOPE_GROUPS):         */
/* scope → subkategori intake → fungsi bangunan → kategori katalog.    */
/* Data di sini adalah STRING ID (bukan impor registry — akan          */
/* bersiklus); kebenarannya ditegakkan `validateTaxonomyConsistency`   */
/* terhadap registry hidup.                                            */
/*                                                                     */
/* - subcategoryIds: subkategori yang `.scopes`-nya memuat scope ini   */
/*   (validator memeriksa dua arah: baris ↔ SubcategoryDef.scopes).    */
/* - functionIds: fungsi bangunan (BUILDING_FUNCTIONS) yang dikerjakan */
/*   lewat scope ini. Hampir semua fungsi → 'gedung'; 'gedung-olahraga'*/
/*   → 'gedung' + 'olahraga' (GOR adalah bangunan DAN fasilitas       */
/*   olahraga); 'pertanian' → 'pertanian' (kandang/greenhouse/lumbung).*/
/*   Scope non-bangunan sengaja tanpa fungsi.                          */
/* - catalogCategories: kategori katalog scope ini — HARUS sama        */
/*   persis dengan SCOPE_GROUPS[].categories (validator memeriksa).    */
/* ------------------------------------------------------------------ */

export interface DisciplineRow {
  scopeId: string;
  subcategoryIds: string[];
  functionIds: string[];
  catalogCategories: TemplateCategory[];
}

const GEDUNG_FUNCTIONS = [
  'gudang', 'rumah-tinggal', 'ruko', 'kantor', 'sekolah', 'rumah-sakit',
  'klinik', 'toko', 'pabrik', 'workshop', 'gedung-olahraga', 'komersial',
  'industri', 'masjid', 'hotel', 'kos', 'villa', 'apartemen', 'pasar',
  'aula', 'gedung-umum', 'bangunan-umum',
];

export const DISCIPLINE_MAP: DisciplineRow[] = [
  { scopeId: 'jembatan', subcategoryIds: ['jembatan', 'gorong-gorong'], functionIds: [], catalogCategories: ['JEMBATAN_STRUKTUR'] },
  { scopeId: 'drainase', subcategoryIds: ['gorong-gorong', 'drainase'], functionIds: [], catalogCategories: ['DRAINASE_SANITASI', 'SDA_IRIGASI'] },
  { scopeId: 'irigasi', subcategoryIds: ['bendung', 'irigasi'], functionIds: [], catalogCategories: ['SDA_IRIGASI'] },
  { scopeId: 'pondasi', subcategoryIds: ['dinding-penahan', 'pondasi'], functionIds: [], catalogCategories: ['PONDASI_GEOTEKNIK'] },
  { scopeId: 'struktur', subcategoryIds: ['struktur-baja', 'struktur-beton'], functionIds: [], catalogCategories: ['STRUKTUR_BETON_BAJA'] },
  { scopeId: 'atap', subcategoryIds: ['struktur-atap', 'waterproofing'], functionIds: [], catalogCategories: ['ATAP_WATERPROOFING'] },
  { scopeId: 'finishing', subcategoryIds: ['fasad', 'interior', 'finishing', 'pintu-jendela'], functionIds: [], catalogCategories: ['FINISHING_INTERIOR'] },
  { scopeId: 'mep', subcategoryIds: ['fire-protection', 'hvac', 'komunikasi-data', 'lift', 'plumbing', 'listrik', 'mep-umum'], functionIds: [], catalogCategories: ['MEP_SYSTEM', 'UTILITAS'] },
  { scopeId: 'sanitasi', subcategoryIds: ['plumbing'], functionIds: [], catalogCategories: ['DRAINASE_SANITASI', 'UTILITAS'] },
  { scopeId: 'jalan', subcategoryIds: ['jalan-tol', 'jalan-aspal', 'jalan-beton', 'jalan-lingkungan', 'jalan'], functionIds: [], catalogCategories: ['JALAN_TRANSPORTASI', 'PERKERASAN'] },
  { scopeId: 'gedung', subcategoryIds: ['sekolah', 'kesehatan', 'hotel', 'kantor', 'komersial', 'gudang-industri', 'bangunan-publik', 'apartemen', 'rumah', 'bangunan-umum'], functionIds: GEDUNG_FUNCTIONS, catalogCategories: ['GEDUNG', 'BANGUNAN_TINGGI', 'HOTEL_HOSPITALITY', 'KESEHATAN', 'PENDIDIKAN', 'INDUSTRI'] },
  { scopeId: 'lanskap', subcategoryIds: ['dinding-penahan', 'taman-kota', 'landscape-komersial', 'landscape-resort', 'landscape-perumahan', 'hardscape', 'jogging-track', 'playground', 'kolam', 'irigasi-landscape', 'pagar-gerbang', 'landscape-umum'], functionIds: [], catalogCategories: ['LANDSCAPE_SITE'] },
  { scopeId: 'renovasi', subcategoryIds: ['renovasi', 'pemeliharaan'], functionIds: [], catalogCategories: ['RENOVASI_MAINTENANCE'] },
  { scopeId: 'demolisi', subcategoryIds: ['pembongkaran'], functionIds: [], catalogCategories: ['DEMOLISI_REKONSTRUKSI'] },
  { scopeId: 'pelabuhan', subcategoryIds: ['pelindung-pantai'], functionIds: [], catalogCategories: ['PELABUHAN_PESISIR'] },
  { scopeId: 'olahraga', subcategoryIds: ['jogging-track', 'kolam'], functionIds: ['gedung-olahraga'], catalogCategories: ['FASILITAS_OLAHRAGA'] },
  { scopeId: 'pertanian', subcategoryIds: ['kandang'], functionIds: ['pertanian'], catalogCategories: ['PERTANIAN_PERKEBUNAN'] },
  { scopeId: 'tanah', subcategoryIds: ['pekerjaan-tanah'], functionIds: [], catalogCategories: ['PEKERJAAN_TANAH'] },
];

export function disciplineRowForScope(scopeId: string): DisciplineRow | null {
  return DISCIPLINE_MAP.find((r) => r.scopeId === scopeId) ?? null;
}

/** Subkategori intake yang memetakan ke satu scope engine. */
export function subcategoriesForScope(scopeId: string): SubcategoryDef[] {
  const row = disciplineRowForScope(scopeId);
  if (!row) return [];
  return row.subcategoryIds
    .map((id) => subcategoryById(id))
    .filter((d): d is SubcategoryDef => d != null);
}

/** Scope engine yang dipetakan satu subkategori intake (dari `.scopes`-nya). */
export function scopesForSubcategory(subcategoryId: string): string[] {
  return subcategoryById(subcategoryId)?.scopes ?? [];
}

/** Id cakupan engine dari satu klasifikasi (primer ∪ sekunder, tanpa duplikat). */
export function classificationScopeIds(c: Classification): string[] {
  const out: string[] = [];
  const push = (ids: string[]) => {
    for (const id of ids) if (!out.includes(id)) out.push(id);
  };
  if (c.primary) push(c.primary.scopes);
  for (const s of c.secondary) push(s.scopes);
  return out;
}

export interface TaxonomyRegistries {
  scopes: Array<{ id: string; categories: readonly string[] }>;
  subcategories: SubcategoryDef[];
  functions: Array<{ id: string }>;
}

/**
 * Validasi konsistensi antar-taksonomi terhadap registry HIDUP
 * (dipanggil tes dengan SCOPE_GROUPS + SUBCATEGORIES +
 * BUILDING_FUNCTIONS yang sebenarnya). Mengembalikan daftar masalah
 * (kosong = konsisten). Memeriksa:
 * 1. himpunan scope DISCIPLINE_MAP == himpunan SCOPE_GROUPS;
 * 2. tiap scope punya ≥1 subkategori + ≥1 kategori katalog;
 * 3. kategori katalog tiap baris == SCOPE_GROUPS[].categories;
 * 4. dua arah subkategori ↔ scope (baris ↔ SubcategoryDef.scopes);
 * 5. tiap subkategori punya ≥1 scope; tiap fungsi bangunan muncul
 *    di ≥1 baris dan tiap functionId di baris memang ada.
 */
export function validateTaxonomyConsistency(reg: TaxonomyRegistries): string[] {
  const problems: string[] = [];
  const scopeIds = new Set(reg.scopes.map((s) => s.id));
  const mapIds = new Set(DISCIPLINE_MAP.map((r) => r.scopeId));
  for (const id of scopeIds) if (!mapIds.has(id)) problems.push(`scope engine tanpa baris DISCIPLINE_MAP: ${id}`);
  for (const id of mapIds) if (!scopeIds.has(id)) problems.push(`baris DISCIPLINE_MAP tanpa scope engine: ${id}`);
  const subById = new Map(reg.subcategories.map((s) => [s.id, s]));
  const fnIds = new Set(reg.functions.map((f) => f.id));
  const coveredSubs = new Set<string>();
  const coveredFns = new Set<string>();
  for (const row of DISCIPLINE_MAP) {
    if (row.subcategoryIds.length === 0) problems.push(`scope tanpa subkategori: ${row.scopeId}`);
    if (row.catalogCategories.length === 0) problems.push(`scope tanpa kategori katalog: ${row.scopeId}`);
    const live = reg.scopes.find((s) => s.id === row.scopeId);
    if (live) {
      const a = new Set(row.catalogCategories);
      const b = new Set(live.categories);
      const same = a.size === b.size && [...a].every((c) => b.has(c));
      if (!same) problems.push(`kategori katalog ${row.scopeId} berbeda: map=[${[...a].join(',')}] live=[${[...b].join(',')}]`);
    }
    for (const subId of row.subcategoryIds) {
      coveredSubs.add(subId);
      const def = subById.get(subId);
      if (!def) { problems.push(`baris ${row.scopeId} memetakan subkategori tak dikenal: ${subId}`); continue; }
      if (!def.scopes.includes(row.scopeId)) {
        problems.push(`subkategori ${subId} tidak mencantumkan ${row.scopeId} di .scopes (map satu arah)`);
      }
    }
    for (const fnId of row.functionIds) {
      coveredFns.add(fnId);
      if (!fnIds.has(fnId)) problems.push(`baris ${row.scopeId} memetakan fungsi tak dikenal: ${fnId}`);
    }
  }
  for (const sub of reg.subcategories) {
    if (!coveredSubs.has(sub.id)) problems.push(`subkategori tanpa baris DISCIPLINE_MAP: ${sub.id}`);
    if (sub.scopes.length === 0) problems.push(`subkategori tanpa scope engine: ${sub.id}`);
    for (const scopeId of sub.scopes) {
      const row = disciplineRowForScope(scopeId);
      if (!row) { problems.push(`subkategori ${sub.id} memetakan scope tak dikenal: ${scopeId}`); continue; }
      if (!row.subcategoryIds.includes(sub.id)) {
        problems.push(`baris ${scopeId} tidak mencantumkan subkategori ${sub.id} (map satu arah)`);
      }
    }
  }
  for (const fn of reg.functions) {
    if (!coveredFns.has(fn.id)) problems.push(`fungsi bangunan tanpa baris DISCIPLINE_MAP: ${fn.id}`);
  }
  return problems;
}

/* ------------------------------------------------------------------ */
/* Divergensi klasifikasi ↔ scope engine yang DIKETAHUI + DISETUJUI   */
/* (hasil probe 2026-11-22 — BUKAN bug; jangan "diperbaiki" dengan     */
/* union; lihat keputusan desain di header file ini).                  */
/* ------------------------------------------------------------------ */

export interface KnownDivergence {
  /** Contoh teks pemicu. */
  example: string;
  /** Scope dari klasifikasi (primer ∪ sekunder). */
  classificationScopes: string[];
  /** Scope dari detectScopes (engine). */
  engineScopes: string[];
  /** Kenapa perbedaan ini disengaja. */
  reason: string;
}

export const KNOWN_CLASSIFICATION_DIVERGENCES: KnownDivergence[] = [
  {
    example: 'Buatkan RAB rumah type 70 2 lantai',
    classificationScopes: ['gedung'],
    engineScopes: [],
    reason: 'Rumah adalah jalur parametrik directRab/specRab — engine universal TIDAK PERNAH membuat draft rumah typed (dipin universalRab.test.ts).',
  },
  {
    example: 'kolam renang di halaman rumah 8 x 4 m',
    classificationScopes: ['gedung', 'lanskap', 'olahraga'],
    engineScopes: ['lanskap', 'olahraga'],
    reason: "'rumah' di sini konteks lokasi kolam, bukan part gedung yang diminta.",
  },
  {
    example: 'dinding penahan tanah 50 m',
    classificationScopes: ['lanskap', 'pondasi'],
    engineScopes: ['lanskap'],
    reason: 'Subkategori dinding-penahan memetakan dua scope kandidat; engine membangun part lanskap (template dinding penahan) — pondasi hanya kandidat.',
  },
  {
    example: 'instalasi plumbing gedung kantor 3 lantai',
    classificationScopes: ['gedung', 'mep', 'sanitasi'],
    engineScopes: ['gedung', 'mep'],
    reason: 'Subkategori plumbing memetakan MEP + sanitasi; engine membangun part MEP — sanitasi hanya kandidat.',
  },
  {
    example: 'lift gedung 5 lantai',
    classificationScopes: ['mep'],
    engineScopes: ['gedung'],
    reason: 'Lift adalah GAP katalog (0 template); klasifikasi MEP-nya tidak boleh memblokir draft gedung yang sah.',
  },
  {
    example: 'buatkan RAB box culvert 10 m',
    classificationScopes: ['drainase', 'jembatan'],
    engineScopes: ['drainase'],
    reason: 'Gorong-gorong telanjang BUKAN jembatan (butuh bentang + desain struktur) — jembatan hanya bila frasa "box culvert jembatan" atau bentang disebut.',
  },
];

/* ------------------------------------------------------------------ */
/* Tabel cakupan template keluarga → scope (G12 — data, bukan logika)  */
/*                                                                     */
/* Dipakai specChain.suppressedScopes: bila template keluarga X SUDAH  */
/* memuat komponen scope Y, part Y terpisah adalah ganda dan ditekan.  */
/* Setiap baris WAJIB punya bukti komponen katalog (id template +      */
/* nama komponen) — baris tanpa bukti JANGAN ditambahkan.              */
/* ------------------------------------------------------------------ */

export interface TemplateFamilyCoverage {
  /** Id keluarga spek terstruktur (familyIdFromSpecs). */
  familyId: string;
  /** Scope engine yang sudah tercakup komponen template keluarga. */
  coversScope: string;
  /** Id template katalog yang memuat komponen penutup. */
  evidenceTemplateId: string;
  /** Nama komponen penutup di template itu. */
  evidenceComponent: string;
}

export const TEMPLATE_FAMILY_COVERAGE: TemplateFamilyCoverage[] = [
  {
    familyId: 'kandang',
    coversScope: 'atap',
    evidenceTemplateId: 'AGR-LIVESTOCK-BARN',
    evidenceComponent: 'Penutup Atap Spandek Kandang',
  },
  {
    familyId: 'gudang-industri',
    coversScope: 'atap',
    evidenceTemplateId: 'BLD-IND-MULTITENANT',
    evidenceComponent: 'Penutup Atap UPVC Atap Gudang',
  },
];

/** Scope yang ditekan untuk satu keluarga spek (dari tabel cakupan). */
export function coveredScopesForFamily(familyId: string | null): string[] {
  if (!familyId) return [];
  return TEMPLATE_FAMILY_COVERAGE.filter((r) => r.familyId === familyId).map((r) => r.coversScope);
}

/* ------------------------------------------------------------------ */
/* DISCIPLINES — taksonomi disiplin kanonis (B2 §5.1)                  */
/*                                                                     */
/* Lapisan DI ATAS scope engine + subkategori intake: satu disiplin    */
/* adalah bidang pekerjaan (arsitektur, elektrikal, irigasi, …) yang   */
/* dapat dipetakan ke 0..n scope engine. Disiplin BUKAN scope baru —   */
/* tidak ada engine/part baru di sini; registry ini memberi validator  */
/* cakupan (scopeDiscipline.ts) kosakata untuk menilai apakah sebuah   */
/* item/part termasuk disiplin yang diminta atau bocor ke disiplin     */
/* lain, dan memberi model cakupan status yang JUJUR per disiplin.     */
/*                                                                     */
/* CAKUPAN TIDAK DIASUMSIKAN: `catalog` + `specific` mengikuti pola    */
/* SubcategoryDef yang sama (kategori katalog + kata kunci nama        */
/* template), dan `disciplineCoverage()` menghitung status dukungan    */
/* dari katalog HIDUP — disiplin tanpa kategori katalog (mobilisasi,   */
/* K3, manajemen proyek, …) berstatus UNCOVERED secara eksplisit,      */
/* bukan ditebak ada.                                                  */
/*                                                                     */
/* ID scope/subkategori adalah STRING (pola DISCIPLINE_MAP — modul     */
/* ini tidak mengimpor registry lain agar tetap daun); kebenarannya    */
/* ditegakkan `validateDisciplineRegistry` terhadap registry hidup.    */
/* ------------------------------------------------------------------ */

export type DisciplineFamily = 'building' | 'infrastructure' | 'supporting';

export const DISCIPLINE_FAMILY_LABELS: Record<DisciplineFamily, string> = {
  building: 'Disiplin bangunan gedung',
  infrastructure: 'Disiplin infrastruktur',
  supporting: 'Kategori pendukung',
};

export interface DisciplineDef {
  id: string;
  family: DisciplineFamily;
  label: string;
  /** Scope engine yang mengerjakan disiplin ini (kosong = tanpa scope engine). */
  scopeIds: string[];
  /** Subkategori intake yang memetakan ke disiplin ini. */
  subcategoryIds: string[];
  /** Kategori katalog yang mendukung disiplin ini (kosong = tanpa dukungan katalog). */
  catalog: TemplateCategory[];
  /** Kata kunci yang dicocokkan ke nama/subkategori template (dukungan spesifik). */
  specific: string[];
}

const D = (
  id: string, family: DisciplineFamily, label: string,
  scopeIds: string[], subcategoryIds: string[],
  catalog: TemplateCategory[], specific: string[],
): DisciplineDef => ({ id, family, label, scopeIds, subcategoryIds, catalog, specific });

export const DISCIPLINES: DisciplineDef[] = [
  /* --- Bangunan gedung --- */
  D('arsitektur', 'building', 'Arsitektur', ['gedung', 'finishing'],
    ['bangunan-umum', 'kantor', 'komersial', 'sekolah', 'kesehatan', 'hotel', 'bangunan-publik', 'apartemen', 'rumah'],
    ['GEDUNG', 'BANGUNAN_TINGGI', 'HOTEL_HOSPITALITY', 'KESEHATAN', 'PENDIDIKAN', 'INDUSTRI', 'RUMAH_TINGGAL', 'FINISHING_INTERIOR'],
    ['gedung', 'arsitektur']),
  D('struktur', 'building', 'Struktur', ['struktur', 'pondasi'],
    ['struktur-beton', 'struktur-baja', 'pondasi'],
    ['STRUKTUR_BETON_BAJA', 'PONDASI_GEOTEKNIK'],
    ['struktur', 'kolom', 'balok', 'rangka baja']),
  D('elektrikal', 'building', 'Elektrikal', ['mep'],
    ['listrik'],
    ['MEP_SYSTEM', 'UTILITAS'],
    // 'distribusi' saja terlalu longgar — ikut menangkap "Jaringan
    // Distribusi Air Bersih" (template air); pakai frasa lengkap.
    ['elektrikal', 'listrik', 'distribusi elektrikal']),
  D('plumbing', 'building', 'Plumbing & sanitasi air', ['mep', 'sanitasi'],
    ['plumbing'],
    ['MEP_SYSTEM', 'UTILITAS', 'DRAINASE_SANITASI'],
    ['plumbing']),
  D('hvac', 'building', 'HVAC & tata udara', ['mep'],
    ['hvac'],
    ['MEP_SYSTEM'],
    ['hvac', 'vrf']),
  D('proteksi-kebakaran', 'building', 'Proteksi kebakaran', ['mep'],
    ['fire-protection'],
    ['MEP_SYSTEM', 'UTILITAS'],
    ['fire protection', 'hydrant', 'proteksi kebakaran']),
  D('elv-telekomunikasi', 'building', 'ELV / telekomunikasi & data', ['mep'],
    ['komunikasi-data'],
    ['MEP_SYSTEM'],
    ['data', 'komunikasi', 'jaringan data']),
  D('interior-finishing', 'building', 'Interior & finishing', ['finishing'],
    ['interior', 'finishing', 'fasad', 'pintu-jendela'],
    ['FINISHING_INTERIOR'],
    ['finishing', 'interior', 'fit-out']),
  D('pekerjaan-luar', 'building', 'Pekerjaan luar (external works)', ['lanskap'],
    ['pagar-gerbang', 'hardscape'],
    ['LANDSCAPE_SITE'],
    ['pagar', 'hardscape', 'streetscape']),
  D('lanskap', 'building', 'Lanskap & pertamanan', ['lanskap'],
    ['landscape-umum', 'taman-kota', 'landscape-perumahan', 'landscape-resort', 'landscape-komersial', 'kolam', 'jogging-track', 'playground', 'irigasi-landscape'],
    ['LANDSCAPE_SITE', 'FASILITAS_OLAHRAGA'],
    ['landscape', 'taman', 'lanskap']),
  /* --- Infrastruktur --- */
  D('pekerjaan-tanah', 'infrastructure', 'Pekerjaan tanah', ['tanah'],
    ['pekerjaan-tanah'],
    ['PEKERJAAN_TANAH'],
    ['galian', 'timbunan', 'urugan', 'cut & fill']),
  D('jalan', 'infrastructure', 'Jalan', ['jalan'],
    ['jalan', 'jalan-aspal', 'jalan-beton', 'jalan-lingkungan', 'jalan-tol'],
    ['JALAN_TRANSPORTASI', 'PERKERASAN'],
    ['jalan']),
  D('perkerasan', 'infrastructure', 'Perkerasan', ['jalan'],
    ['jalan', 'jalan-aspal', 'jalan-beton'],
    ['PERKERASAN', 'JALAN_TRANSPORTASI'],
    ['perkerasan', 'paving']),
  D('jembatan', 'infrastructure', 'Jembatan', ['jembatan'],
    ['jembatan', 'gorong-gorong'],
    ['JEMBATAN_STRUKTUR'],
    ['jembatan']),
  D('drainase', 'infrastructure', 'Drainase', ['drainase'],
    ['drainase', 'gorong-gorong'],
    ['DRAINASE_SANITASI', 'SDA_IRIGASI'],
    ['drainase', 'u-ditch']),
  D('irigasi', 'infrastructure', 'Irigasi & SDA', ['irigasi'],
    ['irigasi', 'bendung'],
    ['SDA_IRIGASI'],
    ['irigasi', 'bendung']),
  D('penyediaan-air', 'infrastructure', 'Penyediaan air bersih', ['mep', 'sanitasi'],
    ['plumbing'],
    ['UTILITAS'],
    ['air bersih', 'distribusi air']),
  D('air-limbah', 'infrastructure', 'Air limbah', ['sanitasi'],
    ['plumbing'],
    ['DRAINASE_SANITASI', 'UTILITAS'],
    ['air limbah', 'ipal', 'stp']),
  D('sanitasi', 'infrastructure', 'Sanitasi', ['sanitasi'],
    ['plumbing'],
    ['DRAINASE_SANITASI', 'UTILITAS'],
    ['septik', 'sanitasi', 'sanitair']),
  D('sungai', 'infrastructure', 'Sungai', ['irigasi'],
    ['bendung'],
    ['SDA_IRIGASI'],
    ['sungai', 'normalisasi sungai']),
  D('pesisir-pelabuhan', 'infrastructure', 'Pesisir & pelabuhan', ['pelabuhan'],
    ['pelindung-pantai'],
    ['PELABUHAN_PESISIR'],
    ['dermaga', 'seawall', 'breakwater', 'pelabuhan']),
  D('struktur-penahan', 'infrastructure', 'Struktur penahan tanah', ['lanskap', 'pondasi'],
    ['dinding-penahan'],
    ['STRUKTUR_BETON_BAJA', 'PONDASI_GEOTEKNIK'],
    ['retaining', 'penahan']),
  // Peralatan lalu lintas (marka/rambu) HANYA komponen di dalam
  // template jalan — tidak ada template bernama marka/rambu — sehingga
  // statusnya PARTIAL (kategori saja), bukan COVERED. Jangan tambahkan
  // kata kunci spesifik yang tidak ada di nama template agar statusnya
  // tidak berbohong menjadi COVERED.
  D('peralatan-lalu-lintas', 'infrastructure', 'Peralatan lalu lintas', ['jalan'],
    ['jalan'],
    ['JALAN_TRANSPORTASI'],
    ['marka', 'rambu', 'traffic']),
  // Lingkungan: tanpa scope engine dan tanpa kategori katalog —
  // UNCOVERED eksplisit (AMDAL/UKL-UPL bukan pekerjaan RAB template).
  D('lingkungan', 'infrastructure', 'Lingkungan', [], [], [], []),
  /* --- Kategori pendukung: TANPA scope engine dan TANPA template --- */
  /* (status UNCOVERED eksplisit — jangan petakan ke G01 persiapan:    */
  /* persiapan adalah kelompok kerja di dalam template, bukan          */
  /* template/kategori tersendiri untuk disiplin ini).                 */
  D('mobilisasi', 'supporting', 'Mobilisasi & demobilisasi', [], [], [], []),
  D('pekerjaan-sementara', 'supporting', 'Pekerjaan sementara', [], [], [], []),
  D('persyaratan-umum', 'supporting', 'Persyaratan umum', [], [], [], []),
  D('pengujian-komisioning', 'supporting', 'Pengujian & komisioning', [], [], [], []),
  D('keselamatan', 'supporting', 'Keselamatan (K3/SMKK)', [], [], [], []),
  D('manajemen-proyek', 'supporting', 'Manajemen proyek', [], [], [], []),
];

export function disciplineById(id: string | null): DisciplineDef | null {
  if (!id) return null;
  return DISCIPLINES.find((d) => d.id === id) ?? null;
}

/** Disiplin yang dikerjakan lewat satu scope engine. */
export function disciplinesForScope(scopeId: string): DisciplineDef[] {
  return DISCIPLINES.filter((d) => d.scopeIds.includes(scopeId));
}

/** Disiplin yang dipetakan satu subkategori intake. */
export function disciplinesForSubcategory(subcategoryId: string): DisciplineDef[] {
  return DISCIPLINES.filter((d) => d.subcategoryIds.includes(subcategoryId));
}

export type DisciplineSupport = 'COVERED' | 'PARTIAL' | 'UNCOVERED';

export interface DisciplineCoverageEntry {
  disciplineId: string;
  label: string;
  family: DisciplineFamily;
  categoryTemplateCount: number;
  specificTemplateCount: number;
  support: DisciplineSupport;
  sampleTemplates: string[];
}

/**
 * Cakupan katalog NYATA per disiplin (pola catalogCoverage): dihitung
 * dari katalog hidup setiap dipanggil. COVERED = ada template spesifik
 * (nama/subkategori cocok kata kunci `specific`); PARTIAL = hanya
 * template kategori (tanpa template spesifik); UNCOVERED = tanpa
 * kategori katalog / tanpa template sama sekali.
 */
export function disciplineCoverage(): DisciplineCoverageEntry[] {
  const svc = RabTemplateService.getInstance();
  const all = svc.getAllTemplates();
  return DISCIPLINES.map((def) => {
    const inCategories = def.catalog.length > 0
      ? all.filter((t) => def.catalog.includes(t.category))
      : [];
    const specific = inCategories.filter((t) => {
      const hay = `${t.name} ${t.subcategory ?? ''}`.toLowerCase();
      return def.specific.some((k) => hay.includes(k));
    });
    const support: DisciplineSupport =
      specific.length > 0 ? 'COVERED' : inCategories.length > 0 ? 'PARTIAL' : 'UNCOVERED';
    return {
      disciplineId: def.id,
      label: def.label,
      family: def.family,
      categoryTemplateCount: inCategories.length,
      specificTemplateCount: specific.length,
      support,
      sampleTemplates: specific.slice(0, 3).map((t) => t.name),
    };
  });
}

export function coverageForDiscipline(disciplineId: string): DisciplineCoverageEntry | null {
  return disciplineCoverage().find((c) => c.disciplineId === disciplineId) ?? null;
}

/**
 * Validasi konsistensi registry disiplin terhadap registry hidup
 * (pola validateTaxonomyConsistency — dipanggil tes). Memeriksa:
 * id unik; scopeIds merujuk baris DISCIPLINE_MAP yang ada; subcategoryIds
 * merujuk SUBCATEGORIES yang ada; disiplin pendukung + lingkungan
 * SENGAJA tanpa scope (bukan kelalaian — dicek terpisah di tes).
 */
export function validateDisciplineRegistry(): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const d of DISCIPLINES) {
    if (seen.has(d.id)) problems.push(`id disiplin ganda: ${d.id}`);
    seen.add(d.id);
    for (const scopeId of d.scopeIds) {
      if (!disciplineRowForScope(scopeId)) problems.push(`disiplin ${d.id} memetakan scope tak dikenal: ${scopeId}`);
    }
    for (const subId of d.subcategoryIds) {
      if (!subcategoryById(subId)) problems.push(`disiplin ${d.id} memetakan subkategori tak dikenal: ${subId}`);
    }
    if (d.catalog.length === 0 && d.specific.length > 0) {
      problems.push(`disiplin ${d.id} punya kata kunci spesifik tanpa kategori katalog`);
    }
  }
  return problems;
}

/* ------------------------------------------------------------------ */
/* Pengecualian frasa deteksi scope (B2 §5.3)                         */
/*                                                                     */
/* Kata kunci scope tertentu TIDAK BOLEH memicu scope-nya bila bagian  */
/* dari frasa yang maknanya disiplin lain: 'saluran' di dalam          */
/* 'saluran irigasi' adalah irigasi (SDA), bukan drainase biasa;       */
/* 'irigasi' di dalam 'irigasi taman' adalah landscape, bukan irigasi  */
/* sipil; 'sprinkler' di dalam 'sprinkler taman' adalah irigasi        */
/* landscape, bukan fire sprinkler. Tabel ini dipakai detectScopes +   */
/* extractScopeSpecs (universalRab) DAN resolveScopeAddress            */
/* (scopeDiscipline) — satu sumber aturan, tiga pemakai.               */
/* ------------------------------------------------------------------ */

export interface ScopeKeywordExclusion {
  scopeId: string;
  keyword: string;
  /** Pola teks SESUDAH kemunculan kata kunci (termasuk spasi awal). */
  followedBy: RegExp;
  note: string;
}

export const SCOPE_KEYWORD_EXCLUSIONS: ScopeKeywordExclusion[] = [
  { scopeId: 'drainase', keyword: 'saluran', followedBy: /^\s+irigasi\b/, note: "'saluran irigasi' adalah irigasi (SDA), bukan drainase biasa" },
  { scopeId: 'irigasi', keyword: 'irigasi', followedBy: /^\s+(taman|landscape|lanskap)\b/, note: "'irigasi taman' adalah landscape, bukan irigasi sipil" },
  { scopeId: 'mep', keyword: 'sprinkler', followedBy: /^\s+taman\b/, note: "'sprinkler taman' adalah irigasi landscape, bukan fire sprinkler" },
];

/** true bila kemunculan kata kunci ini dikecualikan frasa (lihat tabel). */
export function isExcludedKeywordOccurrence(scopeId: string, keyword: string, textAfter: string): boolean {
  return SCOPE_KEYWORD_EXCLUSIONS.some(
    (e) => e.scopeId === scopeId && e.keyword === keyword && e.followedBy.test(textAfter),
  );
}

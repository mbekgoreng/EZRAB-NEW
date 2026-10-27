/**
 * universalRab — Universal Direct RAB Builder untuk EZRAB Chat AI.
 *
 * Memperluas directRab/specRab (yang hanya melayani rumah lewat mesin
 * parametrik) ke SELURUH cakupan konstruksi dengan memakai mesin yang
 * SUDAH ADA: katalog template RAB 180 (RabTemplateService) + resolver
 * AHSP 2026 resmi. Tidak ada engine kalkulasi baru, tidak ada database
 * harga paralel, tidak ada harga hardcoded sebagai fallback produksi.
 *
 * Alur: pesan → klasifikasi cakupan → ekstraksi spesifikasi → cek data
 * wajib (SATU pertanyaan bila ada yang menghalangi) → pilih template
 * katalog resmi → generate deterministik → validasi → tabel chat →
 * revisi → preview transfer → persetujuan → Spreadsheet RAB.
 *
 * Kejujuran harga (pemetaan label konseptual → enum AKTUAL repo,
 * terverifikasi dari resolver katalog di rabTemplateService.ts — jenis
 * resolver hanya OFFICIAL_AHSP | MARKET_REFERENCE | UNRESOLVED):
 * - RESMI AHSP       → priceSourceKind 'OFFICIAL_AHSP' (kode kanonis +
 *                      satuan cocok + komposisi resolver FULL).
 * - REFERENSI PASAR  → priceSourceKind 'MARKET_REFERENCE' dari TABEL
 *                      PASAR TERSIMPAN katalog (bukan fetch live — tidak
 *                      ada tool pencarian pasar live di chat); nama
 *                      sumber/tanggal/wilayah TIDAK terbawa ke item draft
 *                      (delta terdokumentasi, lihat laporan). Label ini
 *                      tidak pernah disamarkan menjadi RESMI AHSP.
 * - HARGA DATABASE   → ember fallback: item berharga yang bukan resmi,
 *                      bukan pasar, bukan manual (mis. asumsi EZRAB /
 *                      harga benchmark legacy template). Pada 5 draft
 *                      yang dites, ember ini KOSONG — semua harga
 *                      non-resmi adalah REFERENSI PASAR.
 * - HARGA MANUAL     → priceStatus 'PRICE_MANUAL' + label/penjelasan
 *                      dari input pengguna (hanya via revisi chat).
 * - ESTIMASI AI      → engine katalog TIDAK mengeluarkan item
 *                      PRICE_ESTIMATED; status draft ESTIMASI berarti
 *                      "mengandung harga non-resmi" (pasar/database/
 *                      manual), BUKAN "dihitung AI". Harga benchmark
 *                      "(est.)" hanya ada di jalur rumah directRab.
 * - BELUM TERSEDIA   → unitPrice null, tampil "Harga belum tersedia",
 *                      TIDAK PERNAH Rp0, tidak masuk total.
 * - PERLU SPESIFIKASI→ ahspMappingStatus 'NEEDS_MAPPING' / parameter
 *                      wajib hilang / data desain teknik belum ada.
 * LLM tidak pernah menjadi kalkulator final: volume dari formula
 * komponen katalog, total dari penjumlahan deterministik item.
 *
 * HARDENING FASE 2+3 (2026-10-26, tanpa mengubah kontrak penyimpanan lama):
 * - Sentinel harga: generator memakai unitPrice null untuk BELUM TERSEDIA,
 *   tetapi rabItemFactory (kontrak lama) menyimpan PRICE_UNRESOLVED sebagai
 *   unitPrice 0. Modul ini TIDAK PERNAH menilai validitas dari nilai 0 —
 *   validitas selalu dari priceStatus (lihat isPriceValidForTotal,
 *   computeTotals, displayPriceStatus). Mengubah factory menjadi null akan
 *   merusak consumer lama, jadi sentinel dipertahankan + digating status.
 * - Provenance pasar: resolver katalog mengembalikan sourceName null untuk
 *   MARKET_REFERENCE (rabTemplateService.ts:1874, 1887) dan tidak ada field
 *   tanggal/wilayah/pemasok di tipe RabItem maupun komponen template —
 *   tanggal pasar TIDAK PERNAH dikarang di sini; ketiadaan itu dinyatakan
 *   eksplisit di pesan draft (D1a = keputusan owner, bukan refactor diam).
 * - Kesiapan draft (draftReadiness): BLOCKED = parameter wajib belum
 *   lengkap / volume INVALID / spesifikasi kritis hilang / nilai di luar
 *   batas template pada cakupan kritis. Draft BLOCKED melempar di
 *   buildPushPayload (guard di payload, bukan hanya di tombol UI) dan
 *   ditolak validateTransfer. NEEDS_SPEC masih boleh transfer dengan
 *   peringatan (konsisten dengan perilaku lama: item belum berharga masuk
 *   sebagai PRICE_UNRESOLVED, bukan diam-diam Rp0).
 * - Skor template: skor lama seri di hampir semua kasus teruji (margin 0 —
 *   kata kunci 'beton' ada di deskripsi hampir semua template), jadi
 *   ditambah bobot nama template + penalti konflik jenis bangunan, dan
 *   demosi kandidat di luar batas parameter bila ada kandidat dalam
 *   batas yang layak. Bila semua kandidat di luar batas, pemenang tetap
 *   dipakai dengan peringatan (bukan ditolak diam-diam) agar tes dan
 *   perilaku lama tidak rusak — tetapi transfernya diblokir bila cakupan
 *   kritis (lihat draftReadiness).
 */

import { RabTemplateService } from '../../services/rabTemplateService';
import type { RabTemplate, TemplateCategory, GeneratedTemplateRabResult } from '../../types/rabTemplate';
import type { RabItem } from '../../types';
import { extractRabNeeds, stripLandPhrases } from './rabNeeds';
import { formatRupiah } from '../../engine/formulaEngine';

/* ------------------------------------------------------------------ */
/* Cakupan                                                             */
/* ------------------------------------------------------------------ */

export type UniversalScopeId =
  | 'jalan'
  | 'drainase'
  | 'jembatan'
  | 'irigasi'
  | 'pondasi'
  | 'struktur'
  | 'atap'
  | 'finishing'
  | 'gedung'
  | 'mep'
  | 'lanskap'
  | 'renovasi'
  | 'demolisi'
  | 'pelabuhan'
  | 'olahraga'
  | 'pertanian'
  | 'tanah'
  | 'sanitasi';

export interface ScopeGroup {
  id: UniversalScopeId;
  label: string;
  categories: TemplateCategory[];
  /** Kata kunci deteksi (urutan = prioritas; grup lebih spesifik dulu). */
  keywords: string[];
  /** Ukuran utama yang wajib ada agar draft bisa dibuat. */
  primaryMeasure: 'length' | 'span' | 'area' | 'areaOrLength' | 'areaOrFloors' | 'areaOrBudget' | 'any';
  primaryLabel: string;
}

export const SCOPE_GROUPS: ScopeGroup[] = [
  { id: 'jembatan', label: 'Jembatan & Struktur Khusus', categories: ['JEMBATAN_STRUKTUR'], keywords: ['jembatan', 'jpo', 'flyover', 'overpass', 'box culvert jembatan'], primaryMeasure: 'span', primaryLabel: 'bentang (meter)' },
  { id: 'drainase', label: 'Drainase & Saluran', categories: ['DRAINASE_SANITASI', 'SDA_IRIGASI'], keywords: ['u-ditch', 'uditch', 'u ditch', 'drainase', 'saluran', 'gorong', 'box culvert'], primaryMeasure: 'length', primaryLabel: 'panjang (meter)' },
  { id: 'irigasi', label: 'Irigasi & Sumber Daya Air', categories: ['SDA_IRIGASI'], keywords: ['irigasi', 'bendung', 'bendungan', 'embung', 'sungai', 'pintu air', 'bangunan air', 'tanggul'], primaryMeasure: 'areaOrLength', primaryLabel: 'panjang atau luas' },
  { id: 'pondasi', label: 'Pondasi & Geoteknik', categories: ['PONDASI_GEOTEKNIK'], keywords: ['pondasi', 'bore pile', 'bored pile', 'tiang pancang', 'foot plat', 'sumuran', 'strauss', 'geoteknik'], primaryMeasure: 'any', primaryLabel: 'luas, panjang, atau jumlah titik' },
  { id: 'struktur', label: 'Struktur Beton & Baja', categories: ['STRUKTUR_BETON_BAJA'], keywords: ['struktur beton', 'sloof', 'kolom', 'balok', 'pelat lantai', 'tangga beton', 'dinding geser', 'struktur baja', 'bekisting', 'pembesian', 'pengecoran'], primaryMeasure: 'areaOrFloors', primaryLabel: 'luas atau jumlah lantai' },
  { id: 'atap', label: 'Atap & Waterproofing', categories: ['ATAP_WATERPROOFING'], keywords: ['atap', 'rangka atap', 'genteng', 'baja ringan', 'waterproofing', 'membran bakar', 'penutup atap'], primaryMeasure: 'area', primaryLabel: 'luas atap (m²)' },
  { id: 'finishing', label: 'Finishing & Interior', categories: ['FINISHING_INTERIOR'], keywords: ['finishing', 'keramik', 'granit', 'plafon', 'partisi', 'kusen', 'pintu', 'jendela', 'plester', 'acian', 'pengecatan', 'cat tembok', 'bata ringan', 'pasangan bata'], primaryMeasure: 'area', primaryLabel: 'luas pekerjaan (m²)' },
  { id: 'mep', label: 'Mekanikal, Elektrikal & Plumbing', categories: ['MEP_SYSTEM', 'UTILITAS'], keywords: ['mep', 'mekanikal', 'elektrikal', 'plumbing', 'instalasi listrik', 'panel listrik', 'pompa air', 'perpipaan', 'hvac', 'instalasi air'], primaryMeasure: 'areaOrLength', primaryLabel: 'luas bangunan atau panjang instalasi' },
  { id: 'sanitasi', label: 'Sanitasi & Air Limbah', categories: ['DRAINASE_SANITASI', 'UTILITAS'], keywords: ['sanitasi', 'septictank', 'septic tank', 'ipal', 'wastafel', 'kloset', 'floor drain', 'air limbah'], primaryMeasure: 'areaOrLength', primaryLabel: 'luas atau panjang' },
  { id: 'jalan', label: 'Jalan & Perkerasan', categories: ['JALAN_TRANSPORTASI', 'PERKERASAN'], keywords: ['jalan', 'perkerasan', 'aspal', 'hotmix', 'paving', 'rabat beton', 'trotoar', 'kanstin', 'marka jalan', 'bahu jalan'], primaryMeasure: 'length', primaryLabel: 'panjang (meter) atau luas (m²) untuk paving' },
  { id: 'gedung', label: 'Gedung & Bangunan Bertingkat', categories: ['GEDUNG', 'BANGUNAN_TINGGI', 'HOTEL_HOSPITALITY', 'KESEHATAN', 'PENDIDIKAN', 'INDUSTRI'], keywords: ['gedung', 'kantor', 'sekolah', 'rumah sakit', 'klinik', 'gudang', 'hotel', 'ruko', 'villa', 'kos', 'apartemen', 'masjid', 'puskesmas', 'pasar'], primaryMeasure: 'areaOrFloors', primaryLabel: 'luas atau jumlah lantai' },
  { id: 'lanskap', label: 'Lanskap, Pagar & Halaman', categories: ['LANDSCAPE_SITE'], keywords: ['lanskap', 'landscape', 'pagar', 'gerbang', 'halaman', 'taman', 'area parkir', 'pekarangan'], primaryMeasure: 'areaOrLength', primaryLabel: 'luas atau panjang' },
  { id: 'renovasi', label: 'Renovasi & Rehabilitasi', categories: ['RENOVASI_MAINTENANCE'], keywords: ['renovasi', 'rehabilitasi', 'rehab', 'perbaikan', 'restorasi', 'perkuatan', 'renov'], primaryMeasure: 'areaOrBudget', primaryLabel: 'luas atau batas anggaran' },
  { id: 'demolisi', label: 'Demolisi & Pembongkaran', categories: ['DEMOLISI_REKONSTRUKSI'], keywords: ['demolisi', 'pembongkaran', 'bongkar', 'robohkan', 'pembongkaran'], primaryMeasure: 'area', primaryLabel: 'luas bangunan yang dibongkar (m²)' },
  { id: 'pelabuhan', label: 'Pelabuhan & Pesisir', categories: ['PELABUHAN_PESISIR'], keywords: ['pelabuhan', 'dermaga', 'pesisir', 'tetrapod', 'turap', 'breakwater', 'dinding laut'], primaryMeasure: 'length', primaryLabel: 'panjang (meter)' },
  { id: 'olahraga', label: 'Fasilitas Olahraga', categories: ['FASILITAS_OLAHRAGA'], keywords: ['lapangan', 'stadion', 'olahraga', 'futsal', 'badminton', 'kolam renang', 'sport'], primaryMeasure: 'area', primaryLabel: 'luas lapangan (m²)' },
  { id: 'pertanian', label: 'Pertanian & Perkebunan', categories: ['PERTANIAN_PERKEBUNAN'], keywords: ['pertanian', 'perkebunan', 'sawah', 'sumur bor', 'kebun'], primaryMeasure: 'areaOrLength', primaryLabel: 'luas atau panjang' },
  { id: 'tanah', label: 'Pekerjaan Tanah', categories: ['PEKERJAAN_TANAH'], keywords: ['galian', 'urugan', 'timbunan', 'pemadatan', 'cut and fill', 'cut & fill', 'pekerjaan tanah'], primaryMeasure: 'any', primaryLabel: 'volume, luas, atau panjang' },
];

/** Deteksi grup cakupan dari teks (bisa lebih dari satu untuk "A, B, dan C"). */
export function detectScopes(rawText: string): ScopeGroup[] {
  const t = ` ${(rawText || '').toLowerCase()} `;
  const found: ScopeGroup[] = [];
  for (const g of SCOPE_GROUPS) {
    for (const kw of g.keywords) {
      if (t.includes(kw)) {
        found.push(g);
        break;
      }
    }
  }
  return found;
}

/* ------------------------------------------------------------------ */
/* Spesifikasi                                                         */
/* ------------------------------------------------------------------ */

export interface UniversalSpec {
  rawText: string;
  scopes: ScopeGroup[];
  /** Jenis/tipe bangunan dari rabNeeds (mis. 'kantor', 'sekolah'). */
  kindLabel: string | null;
  floors: number | null;
  /** Luas kerja: luas bangunan untuk gedung, luas area untuk paving/dll. */
  areaM2: number | null;
  lengthM: number | null;
  widthM: number | null;
  spanM: number | null;
  heightM: number | null;
  thicknessCm: number | null;
  volumeM3: number | null;
  count: number | null;
  budgetCap: number | null;
  location: string | null;
  /** Kata kunci material/kualitas yang disebut (beton, aspal, baja ringan…). */
  materialKeywords: string[];
  /** Kata kunci lingkup tambahan (mis. 'drainase' di dalam permintaan jalan). */
  extraKeywords: string[];
  isRenovation: boolean;
  isDemolition: boolean;
}

const MATERIAL_WORDS = [
  'beton', 'aspal', 'hotmix', 'paving', 'baja ringan', 'genteng', 'keramik',
  'granit', 'bata ringan', 'bata merah', 'u-ditch', 'box culvert', 'kayu',
  'gypsum', 'aluminium', 'pvc', 'galvanis', 'ready mix', 'precast', 'pracetak',
];

const NUM = (s: string) => parseFloat(s.replace(',', '.'));

function parseRupiahAmount(numStr: string, unit: string | undefined): number {
  const v = NUM(numStr.replace(/\./g, ''));
  if (!Number.isFinite(v) || v <= 0) return 0;
  if (!unit) return v;
  const u = unit.toLowerCase();
  if (u.startsWith('miliar') || u.startsWith('milyar')) return v * 1_000_000_000;
  if (u === 'jt' || u === 'juta') return v * 1_000_000;
  if (u === 'rb' || u === 'ribu') return v * 1_000;
  return v;
}

/** Ekstrak spesifikasi terukur dari teks (deterministik, tanpa AI). */
export function extractUniversalSpec(rawText: string): UniversalSpec {
  const text = (rawText || '').trim();
  const lower = text.toLowerCase();
  const needs = extractRabNeeds(stripLandPhrases(text));
  const scopes = detectScopes(text);

  let budgetCap: number | null = null;
  const budget = lower.match(/(?:anggaran|budget|dana|biaya\s*maks(?:imal)?|maks(?:imal)?)\s*(?:sekitar\s*)?(?:rp\.?\s*)?([\d.]+(?:,\d+)?)\s*(miliar|milyar|jt|juta|rb|ribu)?\b/);
  if (budget) {
    const v = parseRupiahAmount(budget[1], budget[2]);
    if (v > 0) budgetCap = v;
  }

  const span = lower.match(/(?:bentang|span)\s*(?:sekitar\s*)?(\d+(?:[.,]\d+)?)\s*(?:meter|m)\b/);
  const width = lower.match(/(?:lebar)\s*(?:sekitar\s*)?(\d+(?:[.,]\d+)?)\s*(?:meter|m)\b/);
  const height = lower.match(/(?:tinggi)\s*(?:sekitar\s*)?(\d+(?:[.,]\d+)?)\s*(?:meter|m)\b/);
  const thick = lower.match(/(?:tebal)\s*(?:sekitar\s*)?(\d+(?:[.,]\d+)?)\s*cm\b/);
  const vol = lower.match(/(\d+(?:[.,]\d+)?)\s*m3\b/);

  const materialKeywords = MATERIAL_WORDS.filter((w) => lower.includes(w));
  const extraKeywords = ['drainase', 'pagar', 'trotoar', 'kanstin', 'marka', 'pju', 'lampu']
    .filter((w) => lower.includes(w));

  return {
    rawText: text,
    scopes,
    kindLabel: needs.kindLabel,
    floors: needs.floors,
    areaM2: needs.buildingArea,
    lengthM: needs.lengthM,
    widthM: width ? NUM(width[1]) : null,
    spanM: span ? NUM(span[1]) : null,
    heightM: height ? NUM(height[1]) : null,
    thicknessCm: thick ? NUM(thick[1]) : null,
    volumeM3: vol ? NUM(vol[1]) : null,
    count: null,
    budgetCap,
    location: needs.location,
    materialKeywords,
    extraKeywords,
    isRenovation: /\b(renovasi|rehab|rehabilitasi|perbaikan|restorasi)\b/.test(lower),
    isDemolition: /\b(demolisi|pembongkaran|bongkar)\b/.test(lower),
  };
}

/** Apakah ukuran utama grup ini tersedia dari spesifikasi? */
export function scopeMeasureAvailable(spec: UniversalSpec, scope: ScopeGroup): boolean {
  switch (scope.primaryMeasure) {
    case 'length': return spec.lengthM != null || (scope.id === 'jalan' && spec.areaM2 != null);
    case 'span': return spec.spanM != null;
    case 'area': return spec.areaM2 != null;
    case 'areaOrLength': return spec.areaM2 != null || spec.lengthM != null;
    case 'areaOrFloors': return spec.areaM2 != null || spec.floors != null;
    case 'areaOrBudget': return spec.areaM2 != null || spec.budgetCap != null;
    case 'any': return spec.areaM2 != null || spec.lengthM != null || spec.floors != null || spec.volumeM3 != null;
    default: return false;
  }
}

/* ------------------------------------------------------------------ */
/* Pencocokan template katalog                                        */
/* ------------------------------------------------------------------ */

export interface TemplatePick {
  template: RabTemplate;
  score: number;
  reasons: string[];
  /** Nilai pengguna yang di luar [min, max] parameter template (bila ada). */
  outOfRange: string[];
  /** Jenis ukuran dari nilai yang di luar batas (untuk aturan demosi). */
  outOfRangeKinds: ParamKind[];
  /** Kata kunci yang cocok di NAMA template (sinyal lebih kuat dari deskripsi). */
  nameMatches: string[];
}

/** Detail satu parameter di luar batas (dipakai scoring + kesiapan draft). */
export interface ParamOutOfRange {
  key: string;
  label: string;
  kind: ParamKind;
  value: number;
  min: number | undefined;
  max: number | undefined;
  detail: string;
}

/** Nilai pengguna yang di luar batas parameter template (batas inklusif). */
export function paramOutOfRangeDetails(spec: UniversalSpec, template: RabTemplate): ParamOutOfRange[] {
  const out: ParamOutOfRange[] = [];
  for (const p of template.parameters || []) {
    if (p.type !== 'NUMBER') continue;
    const kind = classifyParam(p.key, p.label);
    const v = specValueFor(spec, kind);
    if (v == null) continue;
    if ((p.min !== undefined && v < p.min) || (p.max !== undefined && v > p.max)) {
      out.push({
        key: p.key,
        label: p.label,
        kind,
        value: v,
        min: p.min,
        max: p.max,
        detail: `${p.label} = ${v}${p.unit ? ` ${p.unit}` : ''} di luar batas template (${p.min !== undefined ? p.min : '–'}–${p.max !== undefined ? p.max : '–'}${p.unit ? ` ${p.unit}` : ''})`,
      });
    }
  }
  return out;
}

/** Jenis ukuran yang relevan untuk primaryMeasure satu cakupan. */
export function relevantParamKinds(primaryMeasure: ScopeGroup['primaryMeasure']): ParamKind[] {
  switch (primaryMeasure) {
    case 'length': return ['length'];
    case 'span': return ['span'];
    case 'area': return ['area'];
    case 'areaOrLength': return ['area', 'length'];
    case 'areaOrFloors': return ['area', 'floors'];
    case 'areaOrBudget': return ['area'];
    case 'any': return [];
    default: return [];
  }
}

/** Keluarga jenis bangunan untuk penalti konflik (kata → keluarga). */
const BUILDING_TYPE_FAMILIES: Array<{ words: string[]; family: string }> = [
  { words: ['kantor', 'perkantoran'], family: 'kantor' },
  { words: ['sekolah'], family: 'sekolah' },
  { words: ['rumah sakit'], family: 'rumah sakit' },
  { words: ['klinik'], family: 'klinik' },
  { words: ['hotel'], family: 'hotel' },
  { words: ['gudang'], family: 'gudang' },
  { words: ['masjid'], family: 'masjid' },
  { words: ['puskesmas'], family: 'puskesmas' },
  { words: ['pasar'], family: 'pasar' },
  { words: ['villa'], family: 'villa' },
  { words: ['apartemen'], family: 'apartemen' },
  { words: ['ruko'], family: 'ruko' },
];

function familiesIn(text: string): string[] {
  const t = ` ${(text || '').toLowerCase()} `;
  const found: string[] = [];
  for (const f of BUILDING_TYPE_FAMILIES) {
    for (const w of f.words) {
      // Kata pendek/frasa dicocokkan sebagai substring dengan batas kata
      // longgar (agar 'perkantoran' tetap mengenali keluarga 'kantor').
      if (t.includes(w)) {
        found.push(f.family);
        break;
      }
    }
  }
  return found;
}

function templateText(t: RabTemplate): string {
  return `${t.name} ${t.description ?? ''} ${t.subcategory ?? ''}`.toLowerCase();
}

/** Klasifikasi semantik parameter template dari key + label. */
export type ParamKind = 'length' | 'span' | 'width' | 'area' | 'thickness' | 'floors' | 'height' | 'volume' | 'count' | 'other';

export function classifyParam(key: string, label: string): ParamKind {
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

/** Nilai spesifikasi untuk tiap jenis ukuran (dipakai pemetaan parameter). */
export function specValueFor(spec: UniversalSpec, kind: ParamKind): number | null {
  switch (kind) {
    case 'length': return spec.lengthM;
    case 'span': return spec.spanM;
    case 'width': return spec.widthM;
    case 'area': return spec.areaM2;
    case 'thickness': return spec.thicknessCm;
    case 'floors': return spec.floors;
    case 'height': return spec.heightM;
    case 'volume': return spec.volumeM3;
    case 'count': return spec.count;
    default: return null;
  }
}

/**
 * Nilai parameter template dari spesifikasi pengguna. Mengembalikan null
 * bila spesifikasi tidak menyebut ukuran itu — pemanggil memakai default
 * template dan MENCATATNYA sebagai asumsi (bukan mengarang).
 */
export function mapSpecToParams(
  spec: UniversalSpec,
  template: RabTemplate
): { params: Record<string, unknown>; usedFromUser: string[]; defaulted: string[] } {
  const params: Record<string, unknown> = {};
  const usedFromUser: string[] = [];
  const defaulted: string[] = [];
  for (const p of template.parameters || []) {
    if (p.type !== 'NUMBER') continue;
    const kind = classifyParam(p.key, p.label);
    const v = specValueFor(spec, kind);
    if (v != null) {
      params[p.key] = v;
      usedFromUser.push(`${p.label} = ${v}${p.unit ? ` ${p.unit}` : ''}`);
    } else if (p.defaultValue !== undefined) {
      params[p.key] = p.defaultValue;
      defaulted.push(`${p.label} memakai default template (${p.defaultValue}${p.unit ? ` ${p.unit}` : ''})`);
    }
  }
  return { params, usedFromUser, defaulted };
}

/** Skor template terhadap cakupan + spesifikasi (transparan, deterministik).
 *
 * Pelajaran dari bukti (probe 2026-10-26): skor lama seri (margin 0) di
 * hampir semua kasus karena kata kunci deskripsi tidak membedakan
 * ('beton' muncul di deskripsi hampir semua template). Karena itu:
 * - kecocokan di NAMA template berbobot lebih (+4 per kata, maks +12);
 * - jenis bangunan yang bertentangan di nama template dipenalti (-8);
 * - ukuran utama dinilai atas SEMUA jenis relevan cakupan (areaOrFloors
 *   dsb.), bukan satu jenis saja; penalti -8 hanya bila pengguna SUDAH
 *   menyebut ukuran tetapi template tidak menerima satu pun jenisnya
 *   (bila pengguna belum menyebut ukuran, tidak ada penalti — template
 *   renovasi tanpa luas tetap layak dipilih, bukan ditolak).
 * - nilai di luar batas parameter TIDAK menghukum skor di sini (lihat
 *   pickTemplateForScope: demosi hanya bila ada kandidat dalam batas yang
 *   layak; bila semua kandidat di luar batas, pemenang tetap dipakai
 *   dengan peringatan agar perilaku lama tidak rusak mendadak).
 */
export function scoreTemplate(
  spec: UniversalSpec,
  scope: ScopeGroup,
  template: RabTemplate
): TemplatePick {
  let score = 0;
  const reasons: string[] = [];
  const text = templateText(template);
  const name = (template.name || '').toLowerCase();
  if (scope.categories.includes(template.category)) {
    score += 10;
    reasons.push('kategori sesuai cakupan');
  } else {
    score -= 20;
  }
  // Kecocokan kata kunci material/lingkup pada nama/deskripsi template.
  for (const kw of [...spec.materialKeywords, ...spec.extraKeywords, scope.label.toLowerCase()]) {
    if (kw && text.includes(kw)) {
      score += 3;
      reasons.push(`cocok kata kunci "${kw}"`);
    }
  }
  // Kata jenis bangunan (kantor/sekolah/dll.) pada template gedung.
  if (spec.kindLabel) {
    const kl = spec.kindLabel.toLowerCase();
    if (kl.length >= 4 && text.includes(kl)) {
      score += 5;
      reasons.push(`cocok jenis "${spec.kindLabel}"`);
    }
  }
  // Bobot nama: kata kunci yang DISEBUT PENGGUNA (material, lingkup,
  // kata kunci cakupan yang benar-benar muncul di pesan) yang muncul di
  // NAMA template adalah sinyal yang jauh lebih membedakan daripada
  // deskripsi. Koreksi atas draf pertama hardening: memakai SEMUA kata
  // kunci cakupan (termasuk yang tidak disebut, mis. 'aspal' untuk
  // permintaan paving) terbukti memilih template yang salah
  // (INFRA-ROAD-ASPHALT mengalahkan PAV-KOMPLEK-6CM) — hanya kata yang
  // disebut pengguna yang boleh berbobot nama.
  const rawLower = (spec.rawText || '').toLowerCase();
  const nameKeywords = new Set<string>();
  for (const kw of [...spec.materialKeywords, ...spec.extraKeywords]) {
    if (kw) nameKeywords.add(kw.toLowerCase());
  }
  for (const kw of scope.keywords) {
    if (kw && rawLower.includes(kw.toLowerCase())) nameKeywords.add(kw.toLowerCase());
  }
  if (spec.kindLabel) {
    for (const tok of spec.kindLabel.toLowerCase().split(/[/\s]+/)) {
      if (tok.length >= 4) nameKeywords.add(tok);
    }
  }
  const nameMatches: string[] = [];
  for (const kw of nameKeywords) {
    if (kw.length >= 4 && name.includes(kw)) nameMatches.push(kw);
  }
  if (nameMatches.length > 0) {
    const bonus = Math.min(12, nameMatches.length * 4);
    score += bonus;
    reasons.push(`nama template cocok: ${nameMatches.join(', ')} (+${bonus})`);
  }
  // Konflik jenis bangunan: permintaan menyebut satu keluarga (kantor),
  // template bernama keluarga lain (sekolah/rumah sakit) → penalti.
  const userFamilies = familiesIn(spec.rawText);
  const templateFamilies = familiesIn(template.name || '');
  if (userFamilies.length > 0 && templateFamilies.length > 0 &&
      !templateFamilies.some((f) => userFamilies.includes(f))) {
    score -= 8;
    reasons.push(`jenis bangunan tidak cocok (template untuk ${templateFamilies.join('/')}, permintaan ${userFamilies.join('/')})`);
  }
  // Kompatibilitas ukuran utama: template menerima ukuran yang disebut user.
  const relevant = relevantParamKinds(scope.primaryMeasure);
  if (relevant.length > 0) {
    const templateKinds = new Set(
      (template.parameters || [])
        .filter((p) => p.type === 'NUMBER')
        .map((p) => classifyParam(p.key, p.label))
    );
    const provided = relevant.filter((k) => specValueFor(spec, k) != null);
    if (provided.some((k) => templateKinds.has(k))) {
      score += 6;
      reasons.push('menerima ukuran utama yang disebut');
    } else if (provided.length > 0 && !relevant.some((k) => templateKinds.has(k))) {
      score -= 8;
      reasons.push('tidak menerima ukuran utama');
    }
  }
  const outOfRange = paramOutOfRangeDetails(spec, template);
  for (const o of outOfRange) reasons.push(`di luar batas: ${o.detail}`);
  return { template, score, reasons, outOfRange: outOfRange.map((o) => o.detail), outOfRangeKinds: outOfRange.map((o) => o.kind), nameMatches };
}

/** Template resmi (EZRAB_OFFICIAL) saja — template kustom tidak dipakai. */
export function officialTemplates(): RabTemplate[] {
  return RabTemplateService.getInstance()
    .getAllTemplates()
    .filter((t) => t.metadata.source === 'EZRAB_OFFICIAL');
}

export interface ScopePickResult {
  pick: TemplatePick | null;
  /** Urutan skor murni (stabil, urutan katalog dipertahankan saat seri). */
  ranked: TemplatePick[];
  /** pick.score − skor tertinggi kandidat lain (negatif bila pick didemosi). */
  scoreMargin: number;
  /** true bila selisih dengan pesaing terdekat ≤ 3 — pilihan tidak tegas. */
  closeCall: boolean;
  /** Kandidat skor tertinggi yang didemosi karena di luar batas parameter. */
  demoted: TemplatePick | null;
}

/**
 * Pilih template terbaik untuk satu grup cakupan. Mengembalikan null bila
 * tidak ada kandidat yang layak (skor < 8) — pemanggil menjawab jujur,
 * bukan memaksa template yang tidak cocok.
 *
 * Aturan demosi batas parameter: bila pemenang skor memiliki nilai
 * pengguna di luar batasnya TETAPI ada kandidat dalam batas dengan skor
 * ≥ 8, kandidat dalam batas itu yang dipakai (pemenang dicatat di
 * `demoted`). Bila semua kandidat layak di luar batas, pemenang tetap
 * dipakai — penolakan total akan mengubah draft lama menjadi needs-spec
 * tanpa pemberitahuan (kasus teruji: struktur luas 200 m², semua template
 * STRUKTUR_BETON_BAJA berbatas ≥ 300 m²); peringatan + status BLOCKED
 * untuk cakupan kritis ditangani di draftReadiness, bukan di sini.
 */
export function pickTemplateForScope(
  spec: UniversalSpec,
  scope: ScopeGroup
): ScopePickResult {
  const candidates = officialTemplates()
    .filter((t) => scope.categories.includes(t.category))
    .map((t, i) => ({ pick: scoreTemplate(spec, scope, t), idx: i }))
    .sort((a, b) => b.pick.score - a.pick.score || a.idx - b.idx)
    .map((x) => x.pick);
  let best = candidates[0] ?? null;
  let demoted: TemplatePick | null = null;
  // Demosi HANYA untuk nilai di luar batas pada jenis NON-relevan (mis.
  // tebal sekunder). Bila ukuran UTAMA cakupan yang di luar batas
  // (mis. bentang jembatan 50 m), demosi ke template bentang lebih panjang
  // akan menyembunyikan penjaga needs-spec jembatan di build — jadi tidak
  // ada demosi di kasus itu; pemenang dipertahankan dan penjaga build
  // yang memutuskan (needs-spec / BLOCKED).
  const relevant = relevantParamKinds(scope.primaryMeasure);
  if (best && best.score >= 8 && best.outOfRange.length > 0 &&
      best.outOfRangeKinds.every((k) => !relevant.includes(k))) {
    const inRange = candidates.find((c) => c !== best && c.score >= 8 && c.outOfRange.length === 0);
    if (inRange) {
      demoted = best;
      best = inRange;
    }
  }
  const pick = best && best.score >= 8 ? best : null;
  const others = candidates.filter((c) => c !== pick);
  const margin = pick ? pick.score - (others[0]?.score ?? pick.score) : 0;
  return {
    pick,
    ranked: candidates,
    scoreMargin: pick ? margin : 0,
    closeCall: !!pick && candidates.length >= 2 && margin <= 3,
    demoted,
  };
}

/* ------------------------------------------------------------------ */
/* Model draft                                                         */
/* ------------------------------------------------------------------ */

export interface DraftPart {
  scope: ScopeGroup;
  template: RabTemplate;
  /** Parameter yang dievaluasi saat generate (termasuk default template). */
  evaluatedParams: Record<string, unknown>;
  generation: GeneratedTemplateRabResult;
  /** Item yang dihapus pengguna pada part ini (kunci deskripsi+satuan). */
  removedKeys: string[];
  /** Harga manual pengguna per kunci item: unitPrice + catatan. */
  manualPrices: Record<string, { unitPrice: number; note: string }>;
}

export interface DraftVersion {
  n: number;
  summary: string;
  itemCount: number;
  estimatedTotal: number;
}

export interface UniversalDraft {
  id: string;
  title: string;
  spec: UniversalSpec;
  parts: DraftPart[];
  assumptions: string[];
  warnings: string[];
  /** Daftar perubahan sejak versi sebelumnya (ringkasan revisi). */
  changes: string[];
  versions: DraftVersion[];
  version: number;
  createdAt: string;
  /** Bukti transfer terakhir (idempotensi): projectId + versi + jumlah. */
  lastTransfer: { projectId: string; version: number; pushed: number; skipped: number; at: string } | null;
}

export type DraftItem = RabItem & { __partScope: string; __partTemplate: string };

export function itemKey(it: { description: string; unit: string }): string {
  return `${it.description.trim().toLowerCase()}|${it.unit}`;
}

/** Item efektif draft: hasil generate minus yang dihapus + harga manual.
 *  Id dibuat unik lintas part (templateId::id asal) karena beberapa
 *  template dapat menghasilkan id komponen yang sama. */
export function effectiveItems(draft: UniversalDraft): DraftItem[] {
  const out: DraftItem[] = [];
  for (const part of draft.parts) {
    for (const it of part.generation.items) {
      const key = itemKey(it);
      if (part.removedKeys.includes(key)) continue;
      const manual = part.manualPrices[key];
      out.push({
        ...it,
        id: `${part.template.id}::${it.id}`,
        __partScope: part.scope.label,
        __partTemplate: part.template.name,
        ...(manual
          ? {
              unitPrice: manual.unitPrice,
              amount: manual.unitPrice * it.volume,
              totalPrice: manual.unitPrice * it.volume,
              priceStatus: 'PRICE_MANUAL' as const,
              priceSourceLabel: 'Harga manual pengguna',
              priceSourceExplanation: manual.note,
            }
          : {}),
      });
    }
  }
  return out;
}

/**
 * Validitas harga untuk total/ekspor — SATU-SATUNYA gerbang yang sah.
 * Aturan sentinel (kontrak lama rabItemFactory): PRICE_UNRESOLVED disimpan
 * sebagai unitPrice 0. Karena itu nilai 0 TIDAK PERNAH dipakai untuk
 * memutuskan "ada harga": item dengan unitPrice 0 + PRICE_UNRESOLVED
 * adalah BELUM TERSEDIA (bukan harga Rp0 yang valid), sedangkan harga 0
 * eksplisit dengan status RESOLVED/MANUAL adalah harga valid.
 * Item legacy tanpa priceStatus diperlakukan resolved bila unitPrice ada
 * (kompatibilitas ke belakang, sama seperti UnifiedProjectEngine).
 */
export function isPriceValidForTotal(it: { priceStatus?: string | null; unitPrice?: number | null }): boolean {
  if (it.priceStatus === 'PRICE_UNRESOLVED') return false;
  return it.unitPrice != null && Number.isFinite(it.unitPrice);
}

/** Jumlah item bila harganya valid, null bila belum dapat dihitung. */
export function pricedAmount(it: { volume: number; priceStatus?: string | null; unitPrice?: number | null }): number | null {
  return isPriceValidForTotal(it) ? it.volume * (it.unitPrice as number) : null;
}

export interface StoredItemsSummary {
  pricedCount: number;
  unpricedCount: number;
  verifiedTotal: number;
  marketTotal: number;
  databaseTotal: number;
  manualTotal: number;
  pricedTotal: number;
  status: 'PARSIAL' | 'ESTIMASI' | 'LENGKAP';
}

/**
 * Ringkasan untuk item PASCA-PENYIMPANAN (record factory, ekspor, laporan).
 * Memakai gating status — bukan nilai — sehingga sentinel unitPrice 0
 * untuk PRICE_UNRESOLVED tidak pernah masuk total sebagai harga valid
 * dan tidak pernah ditampilkan sebagai Rp0 yang sah. Fungsi ini yang
 * seharusnya dipakai jalur ekspor; view spreadsheet/ekspor yang masih
 * menjumlah unitPrice mentah adalah tindak lanjut di luar modul ini
 * (view.tsx di luar pagar tugas ini).
 */
export function summarizeStoredItems(
  items: Array<{ volume: number; priceStatus?: string | null; unitPrice?: number | null; priceSourceKind?: string | null }>
): StoredItemsSummary {
  let verifiedTotal = 0;
  let marketTotal = 0;
  let databaseTotal = 0;
  let manualTotal = 0;
  let pricedCount = 0;
  let unpricedCount = 0;
  let officialCount = 0;
  let nonOfficialPriced = 0;
  for (const it of items) {
    const amt = pricedAmount(it);
    if (amt == null) {
      unpricedCount++;
      continue;
    }
    pricedCount++;
    if (it.priceStatus === 'PRICE_MANUAL') {
      manualTotal += amt;
      nonOfficialPriced++;
    } else if (it.priceSourceKind === 'OFFICIAL_AHSP') {
      verifiedTotal += amt;
      officialCount++;
    } else if (it.priceSourceKind === 'MARKET_REFERENCE') {
      marketTotal += amt;
      nonOfficialPriced++;
    } else {
      databaseTotal += amt;
      nonOfficialPriced++;
    }
  }
  void officialCount;
  const pricedTotal = verifiedTotal + marketTotal + databaseTotal + manualTotal;
  const status = unpricedCount > 0 ? 'PARSIAL' : (nonOfficialPriced > 0 ? 'ESTIMASI' : 'LENGKAP');
  return { pricedCount, unpricedCount, verifiedTotal, marketTotal, databaseTotal, manualTotal, pricedTotal, status };
}

/** Status tampil harga satu item (pemetaan ke label konseptual). */
export function displayPriceStatus(it: RabItem): { label: string; detail: string } {
  // Sentinel dulu: record pasca-transfer dengan unitPrice 0 + status
  // UNRESOLVED adalah BELUM TERSEDIA — tanpa cek ini ia akan tampil
  // sebagai RESMI/DATABASE berdasarkan kind lamanya (bug nyata).
  if (it.priceStatus === 'PRICE_UNRESOLVED' || it.unitPrice == null) {
    return { label: 'BELUM TERSEDIA', detail: 'Harga belum tersedia' };
  }
  if (it.priceStatus === 'PRICE_MANUAL') {
    return { label: 'HARGA MANUAL', detail: it.priceSourceExplanation || 'Harga manual pengguna' };
  }
  if (it.priceSourceKind === 'OFFICIAL_AHSP') {
    return {
      label: 'RESMI AHSP',
      detail: it.priceSourceName ? `AHSP resmi (${it.priceSourceName})` : 'AHSP resmi tervalidasi',
    };
  }
  if (it.priceSourceKind === 'MARKET_REFERENCE') {
    // Final Fix: metadata pasar kini tampil per item bila tercatat.
    if (it.priceSourceName) {
      const meta = [it.priceSourceName, it.priceSourceDate ? `berlaku ${it.priceSourceDate}` : '', it.priceSourceRegion || ''].filter(Boolean).join(' · ');
      return { label: 'REFERENSI PASAR', detail: `Referensi pasar (${meta})` };
    }
    return { label: 'REFERENSI PASAR', detail: it.priceSourceLabel || 'Referensi pasar' };
  }
  if (it.ahspMappingStatus === 'NEEDS_MAPPING' || it.ahspMappingStatus === 'UNIT_MISMATCH') {
    return { label: 'HARGA DATABASE', detail: `Harga database (pemetaan: ${it.ahspMappingStatus})` };
  }
  return { label: 'HARGA DATABASE', detail: it.priceSourceLabel || 'Harga database EZRAB' };
}

export interface DraftTotals {
  verifiedTotal: number;
  databaseTotal: number;
  marketTotal: number;
  manualTotal: number;
  estimatedTotal: number;
  officialCount: number;
  databaseCount: number;
  marketCount: number;
  manualCount: number;
  unpricedCount: number;
  needsSpecCount: number;
  /** PARSIAL bila ada harga kosong; ESTIMASI bila ada harga non-resmi; LENGKAP bila semua resmi. */
  status: 'PARSIAL' | 'ESTIMASI' | 'LENGKAP';
}

/** Total dihitung dari item efektif — aritmetika deterministik, bukan LLM. */
export function computeTotals(draft: UniversalDraft): DraftTotals {
  const items = effectiveItems(draft);
  let verifiedTotal = 0;
  let databaseTotal = 0;
  let marketTotal = 0;
  let manualTotal = 0;
  let officialCount = 0;
  let databaseCount = 0;
  let marketCount = 0;
  let manualCount = 0;
  let unpricedCount = 0;
  let needsSpecCount = 0;
  for (const it of items) {
    if (it.ahspMappingStatus === 'NEEDS_MAPPING') needsSpecCount++;
    // Gating status (bukan nilai): item PRICE_UNRESOLVED dengan sentinel
    // unitPrice 0 dari record lama tetap dihitung BELUM TERSEDIA.
    if (!isPriceValidForTotal(it)) {
      unpricedCount++;
      continue;
    }
    const amt = it.volume * (it.unitPrice as number);
    if (it.priceStatus === 'PRICE_MANUAL') {
      manualTotal += amt;
      manualCount++;
    } else if (it.priceSourceKind === 'OFFICIAL_AHSP') {
      verifiedTotal += amt;
      officialCount++;
    } else if (it.priceSourceKind === 'MARKET_REFERENCE') {
      // Referensi pasar: ember sendiri — tidak pernah masuk total
      // terverifikasi maupun total database.
      marketTotal += amt;
      marketCount++;
    } else {
      databaseTotal += amt;
      databaseCount++;
    }
  }
  const estimatedTotal = verifiedTotal + databaseTotal + marketTotal + manualTotal;
  const status = unpricedCount > 0 ? 'PARSIAL' : (databaseCount > 0 || marketCount > 0 || manualCount > 0 ? 'ESTIMASI' : 'LENGKAP');
  return { verifiedTotal, databaseTotal, marketTotal, manualTotal, estimatedTotal, officialCount, databaseCount, marketCount, manualCount, unpricedCount, needsSpecCount, status };
}

/* ------------------------------------------------------------------ */
/* Kesiapan draft (FASE 3): siap ditinjau / perlu spesifikasi /       */
/* diblokir untuk transfer — dihitung LANGSUNG dari data draft saat    */
/* ini (bukan status tersimpan yang bisa basi sesudah revisi).         */
/* ------------------------------------------------------------------ */

export type DraftReadinessStatus = 'READY' | 'NEEDS_SPEC' | 'BLOCKED';

export interface DraftReadiness {
  status: DraftReadinessStatus;
  /** Semua alasan (blokir + perlu-spesifikasi), untuk pesan. */
  reasons: string[];
  /** Subset alasan yang MEMBLOKIR transfer (kosong bila tidak diblokir). */
  blockedReasons: string[];
}

/** Cakupan yang pekerjaannya engineering-kritis (bukan sekadar katalog). */
export const CRITICAL_SCOPES: UniversalScopeId[] = ['jembatan', 'pondasi', 'struktur'];

/** Frasa jenis pondasi yang spesifik (di luar kata generik 'pondasi'). */
const FOUNDATION_TYPE_PHRASES = [
  'bore pile', 'bored pile', 'tiang pancang', 'foot plat', 'sumuran', 'strauss', 'mini pile', 'raft',
];

export interface PartIssues {
  outOfRange: string[];
  /** Subset outOfRange pada jenis ukuran yang relevan untuk cakupan ini. */
  criticalOutOfRange: string[];
  criticalGaps: string[];
  incompleteParams: string[];
  invalidVolumes: string[];
}

/** Masalah satu part: batas parameter, spesifikasi kritis, kelengkapan. */
export function partIssues(part: DraftPart, spec: UniversalSpec): PartIssues {
  const details = paramOutOfRangeDetails(spec, part.template);
  const relevant = relevantParamKinds(part.scope.primaryMeasure);
  const raw = (spec.rawText || '').toLowerCase();
  const criticalGaps: string[] = [];
  if (part.scope.id === 'jembatan') {
    const mat = spec.materialKeywords;
    if (!mat.includes('beton') && !mat.includes('baja') && !mat.includes('kayu')) {
      criticalGaps.push(
        `[${part.scope.label}] Material struktur jembatan belum ditentukan (beton/baja/kayu) — template generik bukan desain struktur final.`
      );
    }
  }
  if (part.scope.id === 'pondasi') {
    if (!FOUNDATION_TYPE_PHRASES.some((p) => raw.includes(p))) {
      criticalGaps.push(
        `[${part.scope.label}] Jenis pondasi & data tanah belum ditentukan (tiang pancang/bore pile/foot plat/sumuran + daya dukung tanah) — pondasi generik bukan desain geoteknik final.`
      );
    }
  }
  if (part.scope.id === 'struktur') {
    const mat = spec.materialKeywords;
    if (!mat.includes('beton') && !mat.includes('baja')) {
      criticalGaps.push(
        `[${part.scope.label}] Material struktur belum ditentukan (beton/baja) — template generik bukan desain struktur final.`
      );
    }
  }
  return {
    outOfRange: details.map((d) => d.detail),
    criticalOutOfRange: details.filter((d) => relevant.includes(d.kind)).map((d) => d.detail),
    criticalGaps,
    incompleteParams: part.generation.generationStatus === 'INCOMPLETE_MISSING_PARAMS'
      ? (part.generation.missingRequiredParams ?? [])
      : [],
    invalidVolumes: part.generation.items
      .filter((i) => i.notes && i.notes.includes('Volume: INVALID'))
      .map((i) => i.description),
  };
}

/**
 * Kesiapan draft saat ini. BLOCKED bila: parameter wajib belum lengkap,
 * volume INVALID, spesifikasi kritis hilang pada cakupan kritis, atau
 * nilai relevan di luar batas template pada cakupan kritis. NEEDS_SPEC
 * bila ada item belum berharga / perlu pemetaan / nilai di luar batas
 * pada cakupan non-kritis. Selain itu READY (siap ditinjau).
 * Catatan batas yang disengaja: default template untuk parameter non-
 * kritis (mis. lebar jembatan) TIDAK memblokir — default sudah dicatat
 * sebagai asumsi yang bisa direvisi; yang diblokir hanyalah kekosongan
 * spesifikasi kritis di atas, bukan setiap asumsi.
 */
export function draftReadiness(draft: UniversalDraft): DraftReadiness {
  const blockedReasons: string[] = [];
  const reasons: string[] = [];
  const totals = computeTotals(draft);
  for (const part of draft.parts) {
    const issues = partIssues(part, draft.spec);
    const isCritical = CRITICAL_SCOPES.includes(part.scope.id);
    if (issues.incompleteParams.length > 0) {
      blockedReasons.push(
        `[${part.scope.label}] parameter wajib belum lengkap: ${issues.incompleteParams.join(', ')}`
      );
    }
    for (const v of issues.invalidVolumes) {
      blockedReasons.push(`Volume INVALID: ${v}`);
    }
    if (isCritical) {
      for (const g of issues.criticalGaps) blockedReasons.push(g);
      for (const o of issues.criticalOutOfRange) {
        blockedReasons.push(`[${part.scope.label}] nilai di luar batas template: ${o}`);
      }
    } else {
      for (const o of issues.outOfRange) {
        reasons.push(`[${part.scope.label}] nilai di luar batas template: ${o}`);
      }
    }
  }
  reasons.push(...blockedReasons);
  if (totals.unpricedCount > 0) {
    reasons.push(`${totals.unpricedCount} item belum memiliki harga (total PARSIAL).`);
  }
  if (totals.needsSpecCount > 0) {
    reasons.push(`${totals.needsSpecCount} item berstatus PERLU SPESIFIKASI (pemetaan AHSP belum lengkap).`);
  }
  const status: DraftReadinessStatus =
    blockedReasons.length > 0 ? 'BLOCKED'
    : reasons.length > 0 ? 'NEEDS_SPEC'
    : 'READY';
  return { status, reasons, blockedReasons };
}

/** Label status kesiapan untuk pesan (Bahasa Indonesia, tanpa jargon). */
export function readinessLabel(status: DraftReadinessStatus): string {
  return status === 'BLOCKED' ? 'DIBLOKIR UNTUK TRANSFER'
    : status === 'NEEDS_SPEC' ? 'PERLU SPESIFIKASI'
    : 'SIAP DITINJAU';
}

/* ------------------------------------------------------------------ */
/* Pembangunan draft                                                   */
/* ------------------------------------------------------------------ */

export type BuildResult =
  | { kind: 'draft'; draft: UniversalDraft }
  | { kind: 'needs-spec'; reason: string; missing: string[] }
  | { kind: 'unsupported'; reason: string };

let draftCounter = 0;
let lastUniversalDraft: UniversalDraft | null = null;

export function getLastUniversalDraft(): UniversalDraft | null {
  return lastUniversalDraft;
}
export function setLastUniversalDraft(d: UniversalDraft | null): void {
  lastUniversalDraft = d;
}

function fmtNum(v: number): string {
  return v.toLocaleString('id-ID', { maximumFractionDigits: 2 });
}

/**
 * Bangun draft dari teks. `forcedTemplateId` dipakai bila pemanggil
 * sudah menentukan template secara eksplisit (dipakai tes & revisi
 * varian); tanpa itu, template skor tertinggi yang dipakai.
 */
export function buildUniversalDraft(rawText: string, forcedTemplateId?: string): BuildResult {
  const spec = extractUniversalSpec(rawText);
  if (spec.scopes.length === 0) {
    return { kind: 'unsupported', reason: 'Cakupan pekerjaan tidak dikenali dari pesan.' };
  }

  // SATU pertanyaan paling penting: ukuran utama pertama yang hilang.
  for (const scope of spec.scopes) {
    if (!scopeMeasureAvailable(spec, scope)) {
      return {
        kind: 'needs-spec',
        reason: `Untuk ${scope.label} saya belum bisa menghitung volume secara bertanggung jawab.`,
        missing: [`${scope.primaryLabel} untuk ${scope.label} (contoh: "${scopeLabelExample(scope)}")`],
      };
    }
  }

  const parts: DraftPart[] = [];
  const assumptions: string[] = [];
  const warnings: string[] = [];
  const svc = RabTemplateService.getInstance();
  const usedTemplateIds = new Map<string, string>(); // templateId → label cakupan pertama

  for (const scope of spec.scopes) {
    let template: RabTemplate | null = null;
    if (forcedTemplateId) {
      const forced = svc.getTemplateById(forcedTemplateId);
      if (forced && forced.metadata.source === 'EZRAB_OFFICIAL') template = forced;
    }
    let ranked: TemplatePick[] = [];
    let closeCall = false;
    let scoreMargin = 0;
    let demoted: TemplatePick | null = null;
    if (!template) {
      const res = pickTemplateForScope(spec, scope);
      ranked = res.ranked;
      closeCall = res.closeCall;
      scoreMargin = res.scoreMargin;
      demoted = res.demoted;
      template = res.pick?.template ?? null;
    }
    if (!template) {
      return {
        kind: 'needs-spec',
        reason: `Untuk ${scope.label} tidak ada template katalog EZRAB yang cocok dengan spesifikasi ini.`,
        missing: ['spesifikasi yang lebih rinci (jenis material, dimensi, atau tipe pekerjaan)'],
      };
    }
    // Dedup antarscope: dua cakupan yang jatuh ke template yang sama tidak
    // boleh menggandakan part (dan item) — part kedua digabung ke pertama.
    if (usedTemplateIds.has(template.id)) {
      warnings.push(
        `[${scope.label}] memakai template yang sama dengan [${usedTemplateIds.get(template.id)}] ("${template.name}") — part digabung agar tidak ganda; hapus cakupan yang tidak dimaksud bila ini bukan maksud Anda.`
      );
      continue;
    }
    usedTemplateIds.set(template.id, scope.label);
    // Pemilihan template dicatat transparan. Bila skor berdekatan
    // (closeCall), pemenang adalah urutan katalog yang stabil dan
    // alternatifnya dicatat sebagai asumsi yang bisa diubah lewat revisi
    // ("ganti menjadi …") — sesuai kebijakan "draft dulu dengan asumsi
    // transparan; pertanyaan hanya bila ukuran utama hilang" (lihat
    // needs-spec di atas). Keputusan yang didokumentasikan: skor seri
    // saja TIDAK memicu pertanyaan klarifikasi, karena kategori sudah
    // menyaring kandidat dan alternatifnya selalu tercantum di asumsi.
    // Pengecualian: demosi batas parameter (lihat pickTemplateForScope).
    if (demoted) {
      assumptions.push(
        `[${scope.label}] Template "${demoted.template.name}" (skor tertinggi ${demoted.score}) TIDAK dipakai karena nilai Anda di luar batasnya (${demoted.outOfRange.join('; ')}); dipakai "${template.name}" yang masih dalam batas.`
      );
    } else if (!forcedTemplateId && ranked.length >= 2 && ranked[0].score >= 8) {
      const pickScore = ranked.find((r) => r.template.id === template!.id)?.score ?? ranked[0].score;
      assumptions.push(
        `[${scope.label}] Template "${template.name}" dipakai (skor ${pickScore}${closeCall ? `, selisih tipis ${scoreMargin} dari pesaing terdekat — pilihan tidak tegas` : ''}); alternatif se-cakupan: ${ranked.filter((r) => r.template.id !== template!.id).slice(0, 2).map((r) => `"${r.template.name}" (skor ${r.score})`).join(', ')} — revisi dengan "ganti menjadi …" bila maksud Anda yang lain.`
      );
    }
    // Penjaga material jembatan (engineering-kritis): bila pengguna
    // meminta beton tetapi template terbaik adalah baja (atau sebaliknya),
    // JANGAN substitusi diam-diam — bentang itu butuh desain khusus.
    if (scope.id === 'jembatan') {
      const tt = templateText(template);
      const wantsConcrete = spec.materialKeywords.includes('beton');
      const wantsSteel = spec.materialKeywords.includes('baja');
      const isSteelTpl = /baja|steel|truss|bailey/.test(tt) && !tt.includes('beton');
      const isConcreteTpl = tt.includes('beton') && !/baja|steel/.test(tt);
      if ((wantsConcrete && isSteelTpl) || (wantsSteel && isConcreteTpl)) {
        return {
          kind: 'needs-spec',
          reason: `Untuk jembatan ${wantsConcrete ? 'beton' : 'baja'} bentang ${spec.spanM != null ? `${spec.spanM} m` : ''} tidak ada template katalog yang sesuai materialnya.`,
          missing: ['desain struktur khusus (gambar DED, tipe girder, dan perhitungan struktur oleh perencana) — material/bentang ini tidak boleh dirinci dari template umum'],
        };
      }
    }
    if (scope.id === 'jembatan' && spec.spanM != null) {
      const spanParam = (template.parameters || []).find((p) => classifyParam(p.key, p.label) === 'span');
      if (spanParam && spanParam.max !== undefined && spec.spanM > spanParam.max && /beton/i.test(template.name)) {
        return {
          kind: 'needs-spec',
          reason: `Bentang ${spec.spanM} m di luar cakupan template beton katalog (maks ${spanParam.max} m).`,
          missing: ['desain struktur khusus (gambar DED, tipe girder, dan perhitungan struktur oleh perencana) — jembatan bentang ini tidak boleh dirinci dari template umum'],
        };
      }
    }

    const mapped = mapSpecToParams(spec, template);
    const generation = svc.generateRabFromTemplate(template, mapped.params, undefined, 'PROFESSIONAL', []);
    if (!generation.items || generation.items.length === 0) {
      return {
        kind: 'needs-spec',
        reason: `Template "${template.name}" tidak menghasilkan item untuk parameter ini.`,
        missing: ['parameter yang valid untuk template tersebut'],
      };
    }
    for (const u of mapped.usedFromUser) assumptions.push(`[${scope.label}] ${u} (dari pesan Anda).`);
    for (const d of mapped.defaulted) assumptions.push(`[${scope.label}] ${d} (asumsi — dapat diubah lewat revisi).`);
    const missingParams = generation.missingRequiredParams ?? [];
    if (missingParams.length > 0) {
      warnings.push(
        `[${scope.label}] Parameter wajib belum terisi: ${missingParams.join(', ')} — item terkait berstatus PERLU SPESIFIKASI.`
      );
    }
    const priceSummary = generation.priceSummary;
    if (priceSummary && priceSummary.unpricedCount > 0) {
      warnings.push(
        `[${scope.label}] ${priceSummary.unpricedCount} item belum ada harga — total bersifat PARSIAL.`
      );
    }
    const part: DraftPart = {
      scope,
      template,
      evaluatedParams: generation.evaluatedParameters,
      generation,
      removedKeys: [],
      manualPrices: {},
    };
    // Peringatan batas parameter + spesifikasi kritis (dihitung dari data
    // yang sama dengan draftReadiness, agar pesan dan guard transfer
    // tidak pernah bercerita berbeda).
    const issues = partIssues(part, spec);
    for (const o of issues.outOfRange) {
      warnings.push(
        `[${scope.label}] Nilai di luar batas template "${template.name}": ${o} — volume dihitung dari nilai Anda apa adanya (generator tidak menolaknya); revisi nilai atau template sebelum dipakai sebagai dasar kontrak.`
      );
    }
    for (const g of issues.criticalGaps) {
      warnings.push(`${g} Draft ini DIBLOKIR untuk transfer sampai spesifikasi itu dilengkapi lewat revisi.`);
    }
    parts.push(part);
  }

  // Konflik antarscope: dua part yang berbagi kategori katalog DAN berbagi
  // token nama yang khas (mis. sama-sama 'uditch') kemungkinan tumpang
  // tindih — dicatat sebagai peringatan, bukan diblokir (cakupan ganda
  // bisa saja memang dimaksud, mis. drainase + sanitasi terpisah).
  const NAME_STOP = new Set(['saluran', 'pekerjaan', 'sistem', 'dan', 'dengan', 'untuk', 'per', 'beton', 'baja', 'kayu', 'gedung', 'bangunan', 'jalan', 'atap', 'lantai', 'rumah', 'kantor', 'struktur', 'pondasi', 'jembatan', 'drainase', 'yang', 'dari', 'area', 'ruang']);
  const nameTokens = (name: string): Set<string> => {
    const lower = (name || '').toLowerCase();
    const out = new Set<string>();
    // Bentuk bertanda hubung ikut dipertahankan ('u-ditch' → 'uditch')
    // agar token tumpang tindih terbaca ('ditch' saja terlalu samar).
    for (const variant of [lower, lower.replace(/-/g, '')]) {
      for (const t of variant.split(/[^a-z0-9]+/)) {
        if (t.length >= 4 && !NAME_STOP.has(t)) out.add(t);
      }
    }
    return out;
  };
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i];
      const b = parts[j];
      const sharedCategory = a.scope.categories.some((c) => b.scope.categories.includes(c));
      if (!sharedCategory) continue;
      const ta = nameTokens(a.template.name);
      // Buang token yang merupakan substring token bersama lain ('ditch'
      // di dalam 'uditch') agar peringatan menyebut bentuk yang jelas.
      const shared = [...nameTokens(b.template.name)]
        .filter((t) => ta.has(t))
        .filter((t, _, arr) => !arr.some((o) => o !== t && o.includes(t)));
      if (shared.length > 0) {
        warnings.push(
          `[${a.scope.label}] dan [${b.scope.label}] kemungkinan tumpang tindih (sama-sama "${shared.join(', ')}" dalam satu kategori katalog) — periksa sebelum transfer; hapus part yang tidak dimaksud lewat revisi bila ganda.`
        );
      }
    }
  }
  // Frasa majemuk 'box culvert jembatan' memicu dua cakupan sekaligus
  // (jembatan + drainase) — draft memuat keduanya; pengguna harus bisa
  // melihat bahwa itu mungkin bukan maksudnya.
  if (parts.some((p) => p.scope.id === 'jembatan') &&
      parts.some((p) => p.scope.id === 'drainase' && /culvert/i.test(templateText(p.template)))) {
    warnings.push(
      'Permintaan menyebut box culvert sekaligus jembatan — draft memuat part jembatan DAN part gorong-gorong box culvert; hapus part yang tidak dimaksud lewat revisi bila hanya salah satunya yang diminta.'
    );
  }

  if (spec.budgetCap != null) {
    assumptions.push(`Batas anggaran dari pesan Anda: ${formatRupiah(spec.budgetCap)} — dipakai sebagai pembanding, bukan untuk memangkas lingkup diam-diam.`);
  }
  if (spec.location) assumptions.push(`Lokasi: ${spec.location} (indeks harga mengikuti template; konfirmasi HSD setempat sebelum kontrak).`);

  const draft: UniversalDraft = {
    id: `uni-${Date.now()}-${++draftCounter}`,
    title: spec.scopes.map((s) => s.label).join(' + '),
    spec,
    parts,
    assumptions,
    warnings,
    changes: ['Draft awal dibuat dari katalog template resmi EZRAB.'],
    versions: [],
    version: 1,
    createdAt: new Date().toISOString(),
    lastTransfer: null,
  };
  const totals = computeTotals(draft);
  draft.versions.push({
    n: 1,
    summary: 'Draft awal',
    itemCount: effectiveItems(draft).length,
    estimatedTotal: totals.estimatedTotal,
  });
  setLastUniversalDraft(draft);
  return { kind: 'draft', draft };
}

function scopeLabelExample(scope: ScopeGroup): string {
  switch (scope.id) {
    case 'jembatan': return 'buatkan RAB jembatan beton bentang 12 meter';
    case 'drainase': return 'buatkan RAB drainase U-Ditch sepanjang 500 meter';
    case 'jalan': return 'buatkan RAB jalan beton sepanjang 1 km';
    case 'gedung': return 'buatkan RAB gedung kantor 3 lantai luas 900 m²';
    case 'atap': return 'buatkan RAB atap luas 120 m²';
    case 'finishing': return 'buatkan RAB finishing keramik luas 80 m²';
    case 'renovasi': return 'buatkan RAB renovasi rumah luas 100 m²';
    default: return `buatkan RAB ${scope.label.toLowerCase()} dengan ukuran yang jelas`;
  }
}

/* ------------------------------------------------------------------ */
/* Format pesan tabel (markdown — pipeline render chat yang sama       */
/* dengan directRab; renderer tidak mendukung <details>, jadi detail  */
/* per item disajikan sebagai blok ringkas di bawah tabel).           */
/* ------------------------------------------------------------------ */

function traceFor(part: DraftPart, item: RabItem): string {
  const t = part.generation.traceability?.find((x) => x.itemId === item.id);
  return t?.calculationTrace || item.notes || `Volume: ${fmtNum(item.volume)} ${item.unit}`;
}

export function formatUniversalDraftMessage(draft: UniversalDraft): string {
  const items = effectiveItems(draft);
  const totals = computeTotals(draft);
  const lines: string[] = [];
  const spec = draft.spec;

  const confirmed: string[] = [];
  if (spec.areaM2 != null) confirmed.push(`luas ${fmtNum(spec.areaM2)} m²`);
  if (spec.lengthM != null) confirmed.push(`panjang ${fmtNum(spec.lengthM)} m`);
  if (spec.spanM != null) confirmed.push(`bentang ${fmtNum(spec.spanM)} m`);
  if (spec.floors != null) confirmed.push(`${spec.floors} lantai`);
  if (spec.widthM != null) confirmed.push(`lebar ${fmtNum(spec.widthM)} m`);
  if (spec.thicknessCm != null) confirmed.push(`tebal ${fmtNum(spec.thicknessCm)} cm`);

  const readiness = draftReadiness(draft);
  lines.push(`Siap — ini draft RAB **${draft.title}** (versi ${draft.version}) yang saya susun dari katalog template resmi EZRAB, dihitung deterministik oleh engine template:`);
  lines.push('');
  lines.push(`• Jenis proyek: ${draft.title}`);
  lines.push(`• Dimensi terkonfirmasi: ${confirmed.length > 0 ? confirmed.join(', ') : '— (memakai default template, lihat asumsi)'}`);
  lines.push(`• Template terpilih: ${draft.parts.map((p) => `[${p.scope.label}] "${p.template.name}"`).join('; ')}`);
  lines.push(`• Status draft: ${readinessLabel(readiness.status)} — belum masuk Spreadsheet sampai Anda menyetujui transfer${readiness.status === 'BLOCKED' ? ' (dan saat ini TIDAK DAPAT ditransfer — lihat alasan di bawah)' : ''}`);
  if (readiness.blockedReasons.length > 0) {
    for (const r of readiness.blockedReasons) lines.push(`• ⛔ Alasan blokir transfer: ${r}`);
  }
  lines.push(`• Kelengkapan harga: ${totals.officialCount} RESMI AHSP · ${totals.databaseCount} HARGA DATABASE${totals.marketCount > 0 ? ` · ${totals.marketCount} REFERENSI PASAR` : ''} · ${totals.manualCount} HARGA MANUAL · ${totals.unpricedCount} BELUM TERSEDIA${totals.needsSpecCount > 0 ? ` · ${totals.needsSpecCount} PERLU SPESIFIKASI` : ''}`);
  if (totals.marketCount > 0) {
    const marketItems = items.filter((i) => i.priceSourceKind === 'MARKET_REFERENCE');
    const knownSource = marketItems.filter((i) => i.priceSourceName != null);
    if (marketItems.length > 0 && knownSource.length === 0) {
      lines.push('• Catatan harga pasar: katalog TIDAK mencatat nama, tanggal, atau wilayah sumber untuk harga referensi pasar ini — angka tampil apa adanya dari tabel pasar tersimpan (bukan "harga terkini" dan bukan fetch live); konfirmasi ke pemasok sebelum kontrak.');
    } else if (knownSource.length > 0 && knownSource.length < marketItems.length) {
      lines.push(`• Catatan harga pasar: ${knownSource.length} dari ${marketItems.length} item referensi pasar sudah tercatat pemasok/tanggal/wilayahnya di katalog material (lihat detail item); sisanya tetap tanpa metadata — konfirmasi ke pemasok sebelum kontrak.`);
    } else if (knownSource.length > 0) {
      lines.push('• Catatan harga pasar: pemasok/tanggal/wilayah sumber tercatat per item di katalog material (lihat detail item) — angka tetap referensi pasar tersimpan, bukan harga terkini dan bukan fetch live; konfirmasi ke pemasok sebelum kontrak.');
    }
  }
  if (spec.budgetCap != null) {
    const diff = spec.budgetCap - totals.estimatedTotal;
    lines.push(`• Anggaran: ${formatRupiah(spec.budgetCap)} — total estimasi ${diff >= 0 ? 'DI BAWAH' : 'MELEBIHI'} anggaran sebesar ${formatRupiah(Math.abs(diff))}`);
  }
  lines.push('');

  // Kelompok = kategori komponen (bukan baris biaya); urutan kemunculan.
  const groups = new Map<string, DraftItem[]>();
  for (const it of items) {
    const key = `${it.__partScope} — ${it.category || 'Lainnya'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }
  let no = 0;
  for (const [groupName, groupItems] of groups) {
    let subtotal = 0;
    let groupUnpriced = 0;
    lines.push(`**${groupName}**`);
    lines.push('| No | Uraian | Volume | Satuan | Harga Satuan | Jumlah |');
    lines.push('|---:|---|---:|---|---:|---:|');
    for (const it of groupItems) {
      no++;
      const st = displayPriceStatus(it);
      const valid = isPriceValidForTotal(it);
      const price = !valid ? 'Harga belum tersedia' : `${formatRupiah(it.unitPrice as number)} [${st.label}]`;
      const amt = !valid ? '—' : formatRupiah(it.volume * (it.unitPrice as number));
      if (valid) subtotal += it.volume * (it.unitPrice as number);
      else groupUnpriced++;
      lines.push(`| ${no} | ${it.description} | ${fmtNum(it.volume)} | ${it.unit} | ${price} | ${amt} |`);
    }
    lines.push(`Subtotal ${groupName}: **${formatRupiah(subtotal)}**${groupUnpriced > 0 ? ` (parsial — ${groupUnpriced} item belum berharga)` : ''}`);
    lines.push('');
  }

  lines.push(`**Total terverifikasi (RESMI AHSP): ${formatRupiah(totals.verifiedTotal)}**`);
  if (totals.marketCount > 0) lines.push(`**Total referensi pasar: ${formatRupiah(totals.marketTotal)}** (dari tabel pasar tersimpan EZRAB, bukan fetch live — lihat detail item)`);
  if (totals.databaseCount > 0) lines.push(`**Total harga database: ${formatRupiah(totals.databaseTotal)}** (harga referensi template, bukan harga resmi AHSP)`);
  if (totals.manualCount > 0) lines.push(`**Total harga manual: ${formatRupiah(totals.manualTotal)}** (diubah pengguna lewat revisi — tidak pernah menjadi harga resmi tanpa validasi)`);
  lines.push(`**Total estimasi (termasuk harga database, referensi pasar, dan manual): ${formatRupiah(totals.estimatedTotal)}**`);
  lines.push(`Status total: **${totals.status}** — ${items.length} item. Total ini BUKAN angka final/resmi bila ada harga database, manual, atau item belum tersedia.`);
  lines.push('ESTIMASI di sini berarti total kuantitas × harga katalog per item (resmi/pasar/database/manual sesuai label tiap item) — bukan harga yang dihitung atau diverifikasi AI per item; estimasi kuantitas, referensi pasar, harga resmi, dan item belum tersedia adalah hal yang berbeda dan tidak dicampur. Item BELUM TERSEDIA tidak masuk total (bukan Rp 0).');
  lines.push('');

  const unpriced = items.filter((i) => !isPriceValidForTotal(i));
  if (unpriced.length > 0) {
    lines.push(`**Item belum memiliki harga (${unpriced.length}):**`);
    for (const it of unpriced.slice(0, 15)) lines.push(`• ${it.description} (${fmtNum(it.volume)} ${it.unit})`);
    if (unpriced.length > 15) lines.push(`• …dan ${unpriced.length - 15} item lainnya.`);
    lines.push('');
  }
  const needsSpec = items.filter((i) => i.ahspMappingStatus === 'NEEDS_MAPPING');
  if (needsSpec.length > 0) {
    lines.push(`**Item PERLU SPESIFIKASI (${needsSpec.length}):**`);
    for (const it of needsSpec.slice(0, 10)) lines.push(`• ${it.description} — kode AHSP belum terpetakan; tentukan spesifikasi/materialnya.`);
    lines.push('');
  }
  if (draft.warnings.length > 0) {
    lines.push('**Peringatan:**');
    for (const w of draft.warnings) lines.push(`• ⚠ ${w}`);
    lines.push('');
  }
  if (draft.assumptions.length > 0) {
    lines.push('**Asumsi yang dipakai** — sebutkan bila ada yang berbeda (revisi lewat chat, mis. "ubah luas menjadi 120 m²"):');
    for (const a of draft.assumptions) lines.push(`• ${a}`);
    lines.push('');
  }
  if (draft.changes.length > 0 && draft.version > 1) {
    lines.push('**Perubahan pada versi ini:**');
    for (const c of draft.changes) lines.push(`• ${c}`);
    lines.push('');
  }
  lines.push('**Detail item** (kode AHSP · sumber harga · formula volume):');
  // Detail memakai item EFEKTIF (harga manual revisi ikut tampil) — detail
  // lama memakai item mentah generate sehingga harga manual tidak terlihat.
  const effByKey = new Map(items.map((i) => [itemKey(i), i]));
  let dno = 0;
  for (const part of draft.parts) {
    for (const it of part.generation.items) {
      if (part.removedKeys.includes(itemKey(it))) continue;
      dno++;
      const eff = effByKey.get(itemKey(it)) ?? it;
      const st = displayPriceStatus(eff);
      lines.push(`• ${dno}. ${it.description} — AHSP: ${it.ahspCode || '—'} · ${st.label} · ${st.detail} · ${traceFor(part, it)}`);
    }
  }
  lines.push('');
  lines.push('Draft ini belum mengubah Spreadsheet apa pun. Klik **Push ke Spreadsheet** untuk meninjau preview transfer, lalu konfirmasi bila sudah sesuai.');
  return lines.join('\n');
}

/** Daftar item yang harganya belum pasti (referensi/database/manual/kosong). */
export function formatUncertainItemsMessage(draft: UniversalDraft): string {
  const items = effectiveItems(draft);
  const uncertain = items.filter(
    (i) => !isPriceValidForTotal(i) || i.priceSourceKind !== 'OFFICIAL_AHSP'
  );
  if (uncertain.length === 0) {
    return 'Semua item draft ini sudah berharga RESMI AHSP — tidak ada item yang belum pasti.';
  }
  const lines = [`Item yang harganya belum pasti (${uncertain.length} dari ${items.length}):`];
  for (const it of uncertain) {
    const st = displayPriceStatus(it);
    lines.push(`• ${it.description} — ${st.label} (${!isPriceValidForTotal(it) ? 'Harga belum tersedia' : formatRupiah(it.unitPrice as number)})`);
  }
  lines.push('');
  lines.push('Ubah lewat revisi, mis. "gunakan harga manual Rp 500.000 untuk item 3", atau biarkan kosong — total tetap PARSIAL.');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Revisi interaktif                                                   */
/* ------------------------------------------------------------------ */

export interface RevisionResult {
  ok: boolean;
  message: string;
  changed: boolean;
}

const REV_PATTERNS = /\b(ubah|ganti|jadi|hilangkan|hapus|tambah|tambahkan|gunakan harga|harga manual|tampilkan|hitung ulang|revisi)\b/;

/** Apakah pesan ini revisi draft universal aktif (bukan permintaan baru)? */
export function looksLikeUniversalRevision(text: string): boolean {
  const t = (text || '').toLowerCase();
  if (/\b(buatkan|bikin|buat)\b.*\brab\b/.test(t)) return false;
  if (/\b(buka|tampilkan|lihat)\b.*\b(spreadsheet|katalog|ahsp|proyek)\b/.test(t)) return false;
  return REV_PATTERNS.test(t);
}

function snapshotVersion(draft: UniversalDraft, summary: string): void {
  const totals = computeTotals(draft);
  draft.version += 1;
  draft.versions.push({
    n: draft.version,
    summary,
    itemCount: effectiveItems(draft).length,
    estimatedTotal: totals.estimatedTotal,
  });
}

function regeneratePart(draft: UniversalDraft, part: DraftPart, newParams: Record<string, unknown>): void {
  const svc = RabTemplateService.getInstance();
  const generation = svc.generateRabFromTemplate(part.template, newParams, undefined, 'PROFESSIONAL', []);
  part.evaluatedParams = generation.evaluatedParameters;
  part.generation = generation;
}

/** Terapkan revisi teks ke draft aktif. Mengembalikan null bila bukan revisi yang dikenali. */
export function reviseUniversalDraft(draft: UniversalDraft, rawText: string): RevisionResult | null {
  const t = (rawText || '').toLowerCase();
  const changes: string[] = [];
  const spec = draft.spec;

  // --- Perubahan ukuran (berlaku untuk part yang parameternya cocok) ---
  const measureUpdates: Array<{ re: RegExp; apply: (v: number) => void; label: (v: number) => string }> = [
    { re: /(?:luas(?:\s+bangunan)?|area)\s*(?:menjadi|=)?\s*(\d+(?:[.,]\d+)?)\s*m/, apply: (v) => { spec.areaM2 = v; }, label: (v) => `luas menjadi ${fmtNum(v)} m²` },
    { re: /(?:panjang)\s*(?:menjadi|=)?\s*(\d+(?:[.,]\d+)?)\s*m\b/, apply: (v) => { spec.lengthM = v; }, label: (v) => `panjang menjadi ${fmtNum(v)} m` },
    { re: /(?:lebar)\s*(?:menjadi|=)?\s*(\d+(?:[.,]\d+)?)\s*m\b/, apply: (v) => { spec.widthM = v; }, label: (v) => `lebar menjadi ${fmtNum(v)} m` },
    { re: /(?:bentang|span)\s*(?:menjadi|=)?\s*(\d+(?:[.,]\d+)?)\s*m\b/, apply: (v) => { spec.spanM = v; }, label: (v) => `bentang menjadi ${fmtNum(v)} m` },
    { re: /(?:lantai)\s*(?:menjadi|=)?\s*(\d+)\s*lantai/, apply: (v) => { spec.floors = v; }, label: (v) => `jumlah lantai menjadi ${v}` },
    { re: /(?:tebal)\s*(?:menjadi|=)?\s*(\d+(?:[.,]\d+)?)\s*cm/, apply: (v) => { spec.thicknessCm = v; }, label: (v) => `tebal menjadi ${fmtNum(v)} cm` },
  ];
  let touched = false;
  for (const m of measureUpdates) {
    const mm = t.match(m.re);
    if (mm) {
      const v = NUM(mm[1]);
      if (Number.isFinite(v) && v > 0) {
        m.apply(v);
        changes.push(m.label(v));
        touched = true;
      }
    }
  }
  if (touched) {
    for (const part of draft.parts) {
      const mapped = mapSpecToParams(spec, part.template);
      regeneratePart(draft, part, mapped.params);
      // Overlay manual/hapus dipertahankan lewat kunci deskripsi+satuan.
    }
    draft.changes = changes;
    snapshotVersion(draft, changes.join('; '));
    setLastUniversalDraft(draft);
    return {
      ok: true,
      changed: true,
      message: `Draft diperbarui (versi ${draft.version}): ${changes.join('; ')}.\n\n${formatUniversalDraftMessage(draft)}`,
    };
  }

  // --- Ganti tipe/varian (mis. "ganti atap menjadi baja ringan") ---
  const switchMatch = t.match(/(?:ganti|ubah)\s+(.+?)\s+menjadi\s+(.+)/);
  if (switchMatch) {
    const target = switchMatch[2].trim();
    const candidates = officialTemplates().filter(
      (tpl) => templateText(tpl).includes(target) && draft.parts.some((p) => p.scope.categories.includes(tpl.category))
    );
    if (candidates.length > 0) {
      const next = candidates[0];
      const part = draft.parts.find((p) => p.scope.categories.includes(next.category))!;
      const mapped = mapSpecToParams(spec, next);
      // Provenance revisi yang jujur: harga manual & penghapusan item
      // terikat pada item template LAMA (kunci deskripsi+satuan). Template
      // baru punya item berbeda, jadi keduanya TIDAK diteruskan secara
      // diam-diam — resetnya dicatat eksplisit di riwayat perubahan.
      const hadManual = Object.keys(part.manualPrices).length;
      const hadRemoved = part.removedKeys.length;
      part.template = next;
      part.removedKeys = [];
      part.manualPrices = {};
      regeneratePart(draft, part, mapped.params);
      draft.changes = [`Template part "${part.scope.label}" diganti menjadi "${next.name}"`];
      if (hadManual > 0 || hadRemoved > 0) {
        draft.changes.push(
          `Harga manual (${hadManual} item) dan penghapusan item (${hadRemoved} item) pada template lama TIDAK diteruskan ke template baru (item berbeda) — tetapkan ulang bila masih diperlukan.`
        );
      }
      snapshotVersion(draft, draft.changes[0]);
      setLastUniversalDraft(draft);
      return { ok: true, changed: true, message: `Draft diperbarui (versi ${draft.version}): ${draft.changes[0]}.\n\n${formatUniversalDraftMessage(draft)}` };
    }
    return { ok: false, changed: false, message: `Tidak menemukan varian "${target}" di katalog untuk cakupan draft ini — draft tidak berubah.` };
  }

  // --- Hapus item (berdasarkan nomor tampil atau nama) ---
  const removeMatch = t.match(/(?:hapus|hilangkan)\s+(?:item\s+)?(?:nomor\s+)?(\d+|.*)/);
  if (/\b(hapus|hilangkan)\b/.test(t) && removeMatch) {
    const items = effectiveItems(draft);
    const arg = removeMatch[1].trim();
    let target: DraftItem | undefined;
    if (/^\d+$/.test(arg)) {
      target = items[parseInt(arg, 10) - 1];
    } else {
      target = items.find((i) => i.description.toLowerCase().includes(arg));
    }
    if (!target) {
      return { ok: false, changed: false, message: `Item "${arg}" tidak ditemukan di draft — draft tidak berubah.` };
    }
    const part = draft.parts.find((p) => p.template.name === target!.__partTemplate)!;
    part.removedKeys.push(itemKey(target));
    draft.changes = [`Item "${target.description}" dihapus dari draft`];
    snapshotVersion(draft, draft.changes[0]);
    setLastUniversalDraft(draft);
    return { ok: true, changed: true, message: `Draft diperbarui (versi ${draft.version}): ${draft.changes[0]}.\n\n${formatUniversalDraftMessage(draft)}` };
  }

  // --- Harga manual ---
  const manualMatch = t.match(/(?:harga manual|gunakan harga(?:\s+manual)?)\s*(?:rp\.?\s*)?([\d.]+(?:,\d+)?)\s*(miliar|milyar|jt|juta|rb|ribu)?\s*(?:untuk\s+)?(?:item\s+)?(?:nomor\s+)?(\d+|.+)?/);
  if (/\b(harga manual|gunakan harga)\b/.test(t) && manualMatch) {
    const price = parseRupiahAmount(manualMatch[1], manualMatch[2]);
    const arg = (manualMatch[3] || '').trim();
    const items = effectiveItems(draft);
    let target: DraftItem | undefined;
    if (/^\d+$/.test(arg)) target = items[parseInt(arg, 10) - 1];
    else if (arg) target = items.find((i) => i.description.toLowerCase().includes(arg));
    if (!target || price <= 0) {
      return { ok: false, changed: false, message: 'Harga manual tidak dapat diterapkan — sebutkan nominal dan itemnya, mis. "gunakan harga manual Rp 500.000 untuk item 3".' };
    }
    const part = draft.parts.find((p) => p.template.name === target!.__partTemplate)!;
    part.manualPrices[itemKey(target)] = { unitPrice: price, note: `Harga manual dari chat (${formatRupiah(price)} per ${target.unit})` };
    draft.changes = [`Harga item "${target.description}" diubah manual menjadi ${formatRupiah(price)} per ${target.unit}`];
    snapshotVersion(draft, draft.changes[0]);
    setLastUniversalDraft(draft);
    return { ok: true, changed: true, message: `Draft diperbarui (versi ${draft.version}): ${draft.changes[0]}.\n\n${formatUniversalDraftMessage(draft)}` };
  }

  // --- Tambah item (komponen opsional template sama / template donor se-cakupan) ---
  const addMatch = t.match(/(?:tambah|tambahkan)\s+(.+)/);
  if (/\b(tambah|tambahkan)\b/.test(t) && addMatch) {
    const keyword = addMatch[1].trim();
    const svc = RabTemplateService.getInstance();
    // (a) Komponen opsional template draft yang belum ikut.
    for (const part of draft.parts) {
      const optionalIds = (part.template.components || []).filter((c) => c.isOptional).map((c) => c.id);
      const already = new Set(part.generation.selectedOptionalItemIds || []);
      const wanted = optionalIds.filter((id) => {
        const c = (part.template.components || []).find((x) => x.id === id);
        return c && c.name.toLowerCase().includes(keyword);
      }).filter((id) => !already.has(id));
      if (wanted.length > 0) {
        const generation = svc.generateRabFromTemplate(
          part.template, part.evaluatedParams, undefined, 'PROFESSIONAL',
          [...(part.generation.selectedOptionalItemIds || []), ...wanted]
        );
        part.generation = generation;
        part.evaluatedParams = generation.evaluatedParameters;
        draft.changes = [`Item opsional "${keyword}" ditambahkan dari template "${part.template.name}"`];
        snapshotVersion(draft, draft.changes[0]);
        setLastUniversalDraft(draft);
        return { ok: true, changed: true, message: `Draft diperbarui (versi ${draft.version}): ${draft.changes[0]}.\n\n${formatUniversalDraftMessage(draft)}` };
      }
    }
    // (b) Donor: generate template se-cakupan lain, ambil item yang cocok.
    for (const part of draft.parts) {
      const donors = officialTemplates().filter(
        (tpl) => tpl.id !== part.template.id && part.scope.categories.includes(tpl.category)
      );
      for (const donor of donors) {
        const mapped = mapSpecToParams(spec, donor);
        const gen = svc.generateRabFromTemplate(donor, mapped.params, undefined, 'PROFESSIONAL', []);
        const hit = gen.items.find((i) => i.description.toLowerCase().includes(keyword));
        // Revisi berulang tidak boleh menggandakan: bila item dengan
        // deskripsi+satuan yang sama sudah ada di draft, tolak tanpa
        // mengubah versi (bukan menambah salinan kedua dengan id baru).
        if (hit && effectiveItems(draft).some((i) => itemKey(i) === itemKey(hit))) {
          return { ok: false, changed: false, message: `Item "${hit.description}" sudah ada di draft — tidak digandakan. Draft tidak berubah.` };
        }
        if (hit) {
          part.generation = {
            ...part.generation,
            items: [...part.generation.items, { ...hit, id: `rab-donor-${Date.now()}` }],
            itemCount: part.generation.items.length + 1,
          };
          draft.changes = [`Item "${hit.description}" ditambahkan dari template "${donor.name}"`];
          snapshotVersion(draft, draft.changes[0]);
          setLastUniversalDraft(draft);
          return { ok: true, changed: true, message: `Draft diperbarui (versi ${draft.version}): ${draft.changes[0]}.\n\n${formatUniversalDraftMessage(draft)}` };
        }
      }
    }
    return { ok: false, changed: false, message: `Item "${keyword}" tidak ditemukan di katalog untuk cakupan draft ini — draft tidak berubah.` };
  }

  // --- Tampilkan item yang belum pasti ---
  if (/\b(tampilkan|lihat|tunjuk)\b/.test(t) && /\b(belum pasti|belum tersedia|tidak pasti|estimasi|belum jelas)\b/.test(t)) {
    return { ok: true, changed: false, message: formatUncertainItemsMessage(draft) };
  }

  // --- Hitung ulang ---
  if (/\b(hitung ulang|recalculate|re-kalkulasi)\b/.test(t)) {
    for (const part of draft.parts) {
      const mapped = mapSpecToParams(spec, part.template);
      regeneratePart(draft, part, mapped.params);
    }
    draft.changes = ['Total dihitung ulang dari parameter saat ini'];
    snapshotVersion(draft, draft.changes[0]);
    setLastUniversalDraft(draft);
    return { ok: true, changed: true, message: `Draft diperbarui (versi ${draft.version}): total dihitung ulang.\n\n${formatUniversalDraftMessage(draft)}` };
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Payload push ke Spreadsheet                                         */
/* ------------------------------------------------------------------ */

export interface UniversalPushItem {
  description: string;
  volume: number;
  unit: string;
  code: string;
  ahspCode?: string;
  unitPrice?: number;
  priceStatus: 'PRICE_RESOLVED' | 'PRICE_UNRESOLVED' | 'PRICE_ESTIMATED' | 'PRICE_MANUAL';
  priceSourceKind?: RabItem['priceSourceKind'];
  priceSourceLabel?: string;
  priceSourceExplanation?: string;
  priceSourceName?: string | null;
  priceSourceSupplier?: string | null;
  priceSourceDate?: string | null;
  priceSourceRegion?: string | null;
  ahspMappingStatus?: RabItem['ahspMappingStatus'];
  category: string;
  volumeSource: 'AI_GENERATED';
}

export interface UniversalPushPreview {
  partCount: number;
  itemCount: number;
  groupCount: number;
  verifiedTotal: number;
  marketTotal: number;
  databaseTotal: number;
  manualTotal: number;
  estimatedTotal: number;
  unpricedCount: number;
  pricedCount: number;
  totalsStatus: 'PARSIAL' | 'ESTIMASI' | 'LENGKAP';
  unpricedItems: string[];
  needsFixItems: string[];
  assumptions: string[];
  budgetComparison: string | null;
  /** Kesiapan transfer saat preview dibuat (dihitung dari draft). */
  readiness: DraftReadinessStatus;
  transferBlocked: boolean;
  blockReasons: string[];
}

/** Preview transfer: hitungan + daftar yang perlu diperbaiki, tanpa menulis. */
export function buildPushPreview(draft: UniversalDraft): UniversalPushPreview {
  const items = effectiveItems(draft);
  const totals = computeTotals(draft);
  const readiness = draftReadiness(draft);
  const groups = new Set(items.map((i) => i.category || 'Lainnya'));
  const needsFix: string[] = [];
  for (const part of draft.parts) {
    if (part.generation.generationStatus === 'INCOMPLETE_MISSING_PARAMS') {
      needsFix.push(`[${part.scope.label}] parameter wajib belum lengkap: ${(part.generation.missingRequiredParams ?? []).join(', ')}`);
    }
    for (const it of part.generation.items) {
      if (it.notes && it.notes.includes('Volume: INVALID')) {
        needsFix.push(`Volume INVALID: ${it.description}`);
      }
    }
  }
  // Subtotal per ember + nilai yang belum dapat dihitung: preview lama
  // hanya menampilkan verified + estimated sehingga campuran resmi/pasar/
  // database/manual tampak seperti satu total — sekarang dipisah eksplisit.
  return {
    partCount: draft.parts.length,
    itemCount: items.length,
    groupCount: groups.size,
    verifiedTotal: totals.verifiedTotal,
    marketTotal: totals.marketTotal,
    databaseTotal: totals.databaseTotal,
    manualTotal: totals.manualTotal,
    estimatedTotal: totals.estimatedTotal,
    unpricedCount: totals.unpricedCount,
    pricedCount: items.length - totals.unpricedCount,
    totalsStatus: totals.status,
    unpricedItems: items.filter((i) => !isPriceValidForTotal(i)).map((i) => i.description),
    needsFixItems: needsFix,
    assumptions: draft.assumptions,
    budgetComparison:
      draft.spec.budgetCap != null
        ? (totals.estimatedTotal <= draft.spec.budgetCap
            ? `Di bawah anggaran ${formatRupiah(draft.spec.budgetCap)}`
            : `Melebihi anggaran ${formatRupiah(draft.spec.budgetCap)} sebesar ${formatRupiah(totals.estimatedTotal - draft.spec.budgetCap)}`)
        : null,
    readiness: readiness.status,
    transferBlocked: readiness.status === 'BLOCKED',
    blockReasons: readiness.blockedReasons,
  };
}

/**
 * Payload transfer — provenance dipertahankan sejauh didukung factory.
 *
 * GUARD TRANSFER (bukan hanya tombol UI): draft BLOCKED melempar Error di
 * sini, sehingga jalur mana pun yang membangun payload — termasuk klik
 * ganda/eksekusi ulang handler di view — tidak pernah menulis item yang
 * belum siap. Pemanggil yang ingin pesan ramah harus memanggil
 * validateTransfer dulu; lemparan ini adalah jaring pengaman terakhir.
 * Dua perbaikan provenance dibanding payload lama:
 * - label/penjelasan sumber kini diteruskan untuk SEMUA item (payload lama
 *   membuangnya untuk item non-manual, sehingga record pasca-transfer
 *   kehilangan label 'Harga Resmi AHSP 2026'/'Harga Referensi');
 * - item PRICE_MANUAL TIDAK membawa priceSourceKind lama (payload lama
 *   meneruskan kind OFFICIAL_AHSP bersama status MANUAL — record yang
 *   mengklaim resmi sekaligus manual). Kind manual memang tidak ada di
 *   enum, jadi yang diteruskan hanya status + label/penjelasan manual.
 */
export function buildPushPayload(draft: UniversalDraft): UniversalPushItem[] {
  const readiness = draftReadiness(draft);
  if (readiness.status === 'BLOCKED') {
    throw new Error(
      `Draft diblokir untuk transfer: ${readiness.blockedReasons.join('; ')} — lengkapi spesifikasi lewat revisi, lalu coba lagi.`
    );
  }
  return effectiveItems(draft).map((it) => {
    let priceStatus: UniversalPushItem['priceStatus'];
    if (!isPriceValidForTotal(it)) priceStatus = 'PRICE_UNRESOLVED';
    else if (it.priceStatus === 'PRICE_MANUAL') priceStatus = 'PRICE_MANUAL';
    else priceStatus = 'PRICE_RESOLVED';
    return {
      description: `[Chat AI] ${it.description}`,
      volume: it.volume,
      unit: it.unit,
      code: it.code || it.ahspCode || '',
      ...(it.ahspCode ? { ahspCode: it.ahspCode } : {}),
      ...(isPriceValidForTotal(it) ? { unitPrice: it.unitPrice as number } : {}),
      priceStatus,
      // Manual: kind lama sengaja TIDAK diteruskan (lihat komentar guard).
      ...(it.priceStatus === 'PRICE_MANUAL'
        ? {}
        : it.priceSourceKind ? { priceSourceKind: it.priceSourceKind } : {}),
      ...(it.priceSourceLabel ? { priceSourceLabel: it.priceSourceLabel } : {}),
      ...(it.priceStatus === 'PRICE_MANUAL'
        ? { priceSourceLabel: 'Harga manual pengguna', priceSourceExplanation: it.priceSourceExplanation || 'Harga manual dari chat' }
        : it.priceSourceExplanation ? { priceSourceExplanation: it.priceSourceExplanation } : {}),
      ...(it.priceSourceName !== undefined ? { priceSourceName: it.priceSourceName } : {}),
      ...(it.priceSourceSupplier !== undefined ? { priceSourceSupplier: it.priceSourceSupplier } : {}),
      ...(it.priceSourceDate !== undefined ? { priceSourceDate: it.priceSourceDate } : {}),
      ...(it.priceSourceRegion !== undefined ? { priceSourceRegion: it.priceSourceRegion } : {}),
      ...(it.ahspMappingStatus ? { ahspMappingStatus: it.ahspMappingStatus } : {}),
      category: it.category || 'Lainnya',
      volumeSource: 'AI_GENERATED',
    };
  });
}

/**
 * Dedup payload terhadap item spreadsheet yang sudah ada.
 *
 * Kunci lama (kode+uraian) terlalu longgar: dua item berbeda yang kebetulan
 * mirip namanya bisa saling menghapus. Kunci baru = kode + uraian +
 * satuan + volume (2 desimal). Bila item lama tidak membawa satuan/volume
 * (pemanggil lama / data legacy), fallback ke kunci lama untuk item itu
 * saja — didokumentasikan, bukan disembunyikan. Dedup juga berlaku di
 * DALAM payload (duplikat internal dihitung sebagai dup, bukan ditulis
 * dua kali).
 */
export function dedupePushPayload(
  payload: UniversalPushItem[],
  existing: Array<{ code?: string; description?: string; unit?: string; volume?: number }>
): { newItems: UniversalPushItem[]; dupCount: number } {
  const normDesc = (s: string) => s.replace(/^\[Chat AI\] /, '').trim().toLowerCase().replace(/\s+/g, ' ');
  const legacyKey = (code: string | undefined, desc: string | undefined) =>
    `${code || ''}|${normDesc(desc || '')}`;
  const exactKey = (code: string | undefined, desc: string | undefined, unit: string | undefined, vol: number | undefined) =>
    `${legacyKey(code, desc)}|${(unit || '').toLowerCase()}|${vol != null && Number.isFinite(vol) ? vol.toFixed(2) : ''}`;
  const existingExact = new Set<string>();
  const existingLegacy = new Set<string>();
  for (const i of existing) {
    if (i.unit != null && i.volume != null && Number.isFinite(i.volume)) {
      existingExact.add(exactKey(i.code, i.description, i.unit, i.volume));
    } else {
      existingLegacy.add(legacyKey(i.code, i.description));
    }
  }
  const seenExact = new Set<string>();
  const newItems: UniversalPushItem[] = [];
  let dupCount = 0;
  for (const p of payload) {
    const ex = exactKey(p.code, p.description, p.unit, p.volume);
    const lg = legacyKey(p.code, p.description);
    if (seenExact.has(ex) || existingExact.has(ex) || existingLegacy.has(lg)) {
      dupCount++;
      continue;
    }
    seenExact.add(ex);
    newItems.push(p);
  }
  return { newItems, dupCount };
}

export interface TransferValidation {
  allowed: boolean;
  reasons: string[];
  /** true bila versi ini sudah pernah ditransfer ke proyek yang sama. */
  duplicate: boolean;
}

/**
 * Validasi transfer SEBELUM menulis apa pun (pure, dapat dites tanpa UI).
 * - projectId kosong → tidak boleh (proyek tidak boleh tertukar/diragukan);
 * - draft BLOCKED → tidak boleh (alasan dari draftReadiness);
 * - receipt (projectId + versi) sudah ada untuk proyek ini → duplikat,
 *   tidak boleh ditulis ulang. Pindah proyek (projectId berbeda dari
 *   receipt) BUKAN duplikat: receipt mengikat per proyek, transfer ke
 *   proyek baru diizinkan dan akan mencatat receipt baru untuk proyek itu.
 * Batas yang tidak dapat diuji tanpa backend live: bulkAddRabItems yang
 * gagal DI TENGAH penulisan (sebagian item sudah tertulis lalu throw).
 * Pemulihannya mengandalkan dedup saat retry: item yang sudah tertulis
 * dikenali dari kunci kode+uraian+satuan+volume dan dilewati — tetapi
 * kegagalan parsial itu sendiri tidak dapat disimulasikan di level ini
 * (tidak ada backend/storage live di tes tsx).
 */
export function validateTransfer(
  draft: UniversalDraft,
  projectId: string | null | undefined
): TransferValidation {
  const reasons: string[] = [];
  if (!projectId) {
    reasons.push('tidak ada proyek tujuan (projectId kosong — buat/buka proyek dulu)');
  }
  const readiness = draftReadiness(draft);
  if (readiness.status === 'BLOCKED') {
    reasons.push(...readiness.blockedReasons);
  }
  let duplicate = false;
  if (projectId && draft.lastTransfer &&
      draft.lastTransfer.projectId === projectId &&
      draft.lastTransfer.version === draft.version) {
    duplicate = true;
    reasons.push(
      `versi ${draft.version} sudah ditransfer ke proyek ini pada ${draft.lastTransfer.at} (${draft.lastTransfer.pushed} item) — tidak ada penulisan ganda`
    );
  }
  return { allowed: reasons.length === 0, reasons, duplicate };
}

/** Catat receipt transfer pada draft (cermin logika view; dapat dites). */
export function applyTransferReceipt(
  draft: UniversalDraft,
  projectId: string,
  pushed: number,
  skipped: number
): NonNullable<UniversalDraft['lastTransfer']> {
  draft.lastTransfer = {
    projectId,
    version: draft.version,
    pushed,
    skipped,
    at: new Date().toISOString(),
  };
  setLastUniversalDraft(draft);
  return draft.lastTransfer;
}

export function formatPushPreviewMessage(draft: UniversalDraft, preview: UniversalPushPreview, projectName: string | null): string {
  const lines: string[] = [];
  lines.push(`**Preview transfer — ${draft.title} (versi ${draft.version})**`);
  lines.push(`• Proyek tujuan: ${projectName ?? '— (belum ada proyek aktif — buat/buka proyek dulu di menu Proyek)'}`);
  lines.push(`• ${preview.partCount} template · ${preview.groupCount} kelompok · ${preview.itemCount} item (${preview.pricedCount} berharga, ${preview.unpricedCount} belum berharga)`);
  lines.push(`• Status draft: ${readinessLabel(preview.readiness)} · Status total: ${preview.totalsStatus}`);
  lines.push(`• Total terverifikasi (RESMI AHSP): ${formatRupiah(preview.verifiedTotal)}`);
  if (preview.marketTotal > 0) lines.push(`• Total referensi pasar: ${formatRupiah(preview.marketTotal)} (tabel pasar tersimpan, bukan fetch live; tanggal/wilayah sumber tidak tercatat di katalog)`);
  if (preview.databaseTotal > 0) lines.push(`• Total harga database: ${formatRupiah(preview.databaseTotal)} (harga referensi template, bukan resmi)`);
  if (preview.manualTotal > 0) lines.push(`• Total harga manual: ${formatRupiah(preview.manualTotal)} (tidak menjadi resmi saat transfer)`);
  lines.push(`• Total estimasi (termasuk harga database, referensi pasar, dan manual): ${formatRupiah(preview.estimatedTotal)}`);
  lines.push(`• Item belum berharga: ${preview.unpricedItems.length} — nilainya BELUM DAPAT DIHITUNG dan tidak masuk total (bukan Rp 0); masuk sebagai PRICE_UNRESOLVED — tetapkan di spreadsheet`);
  if (preview.budgetComparison) lines.push(`• Anggaran: ${preview.budgetComparison}`);
  if (preview.needsFixItems.length > 0) {
    lines.push(`• Perlu diperbaiki sebelum transfer:`);
    for (const f of preview.needsFixItems) lines.push(`  – ${f}`);
  }
  if (preview.transferBlocked) {
    lines.push(`• ⛔ DRAFT INI DIBLOKIR UNTUK TRANSFER:`);
    for (const r of preview.blockReasons) lines.push(`  – ${r}`);
  }
  if (preview.assumptions.length > 0) {
    lines.push(`• Asumsi ikut tercatat di deskripsi item bila didukung; daftar asumsi:`);
    for (const a of preview.assumptions.slice(0, 6)) lines.push(`  – ${a}`);
  }
  lines.push('');
  if (preview.transferBlocked) {
    lines.push('Draft ini TIDAK DAPAT ditransfer sampai alasan blokir di atas dilengkapi lewat revisi. Perbaiki dulu, tinjau preview lagi, baru konfirmasi.');
  } else {
    lines.push('Harga ESTIMASI AI tidak ada di draft ini yang berubah menjadi resmi saat transfer — status tiap item dipertahankan (RESMI AHSP / HARGA DATABASE / HARGA MANUAL / BELUM TERSEDIA). Tekan **Konfirmasi Transfer** untuk menulis ke Spreadsheet, atau batalkan dan revisi dulu di chat.');
  }
  return lines.join('\n');
}

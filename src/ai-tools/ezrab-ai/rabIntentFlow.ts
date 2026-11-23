/**
 * rabIntentFlow — Orkestrator INTENT-FIRST untuk RAB Chat AI
 * (FIX global Chat AI RAB, Worker B, 2026-11-20).
 *
 * Urutan kanonis yang ditegakkan di sini (bukan di prompt LLM):
 *   1. Ekstrak spek dulu (`extractRabIntentSpec`) — SEBELUM template
 *      apa pun dilihat. Yang tidak disebut = UNKNOWN, bukan ditebak.
 *   2. Evaluasi template TERHADAP spek — template tidak pernah
 *      menimpa field eksplisit pengguna; template hanya boleh dipakai
 *      bila parametrisasinya mendukung spesifikasi yang diminta.
 *   3. Klarifikasi seperlunya — hanya basis terukur yang memblokir
 *      generate; field lain berjalan sebagai asumsi berlabel. Satu
 *      topik per giliran; field yang sudah disebut tidak pernah
 *      ditanyakan ulang.
 *   4. Rekomendasikan metode (template vs spek/kustom vs universal)
 *      DENGAN alasan — bukan pilihan buta Template-vs-Full-AI di awal.
 *   5. Generate via mesin kanonis yang SUDAH ADA (directRab / specRab /
 *      universalRab) — modul ini tidak membangun engine baru.
 *   6. Preview + approval sebelum tulis spreadsheet — pola yang sudah
 *      ada (tombol Push + pratinjau transfer) dipertahankan apa adanya;
 *      modul ini tidak pernah menulis ke spreadsheet.
 *
 * State multi-giliran: spek aktif disimpan di modul ini (pola yang sama
 * dengan `lastDirectRab` di directRab.ts) + di `PendingRabChoice.spec`
 * pada jalur kartu pilihan. Koreksi lanjutan digabung lewat
 * `mergeRabIntentSpec` — hanya field yang disebut koreksi yang berubah.
 *
 * Modul ini MURNI orkestrasi + evaluasi; tidak mengimpor actionRegistry
 * (menghindari impor melingkar — registry yang mengimpor modul ini).
 * Penjaga hijack specRab (specRabHijackGuard) tetap milik registry dan
 * diteruskan lewat `opts.hijacked` agar keputusan generate tidak
 * mendahului penjaga itu.
 */

import {
  extractRabIntentSpec,
  mergeRabIntentSpec,
  identifyMissingSpec,
  specFieldLabel,
} from './rabIntentSpec';
import type { RabIntentSpec } from './rabIntentSpec';
import { findDirectTemplate, buildDirectRab } from './directRab';
import type { DirectRabResult, TypedTemplateMatch } from './directRab';
import { buildSpecRab } from './specRab';
import { extractRabNeeds, stripLandPhrases, emptyRabNeeds } from './rabNeeds';
import type { RabNeeds } from './rabNeeds';
import { HouseTypeCatalog } from '../../data/houseTypeCatalog';
import {
  extractUniversalSpec,
  detectScopes,
  pickTemplateForScope,
} from './universalRab';

/* ------------------------------------------------------------------ */
/* Jenis hasil                                                         */
/* ------------------------------------------------------------------ */

export type RabIntentRoute =
  | 'ded' // permintaan berbasis gambar DED — intake DED (bukan generate teks)
  | 'template' // template bertipe cocok & mendukung spek (atau kartu R1)
  | 'spec' // spek bebas/kustom via mesin parametrik (basis template disclosed)
  | 'universal' // katalog universal 180 (non-rumah)
  | 'custom' // tidak ada template yang cocok — jalur kustom/ringkasan jujur
  | 'clarify'; // basis terukur belum ada — tanya dulu

export interface RabTemplateRecommendation {
  method: 'template' | 'spec' | 'custom' | 'universal' | 'ded';
  templateId?: string;
  templateName?: string;
  reasons: string[];
  /** Kandidat lain yang dipertimbangkan (nama + alasan singkat). */
  alternatives?: string[];
}

export interface RabIntentEvaluation {
  spec: RabIntentSpec;
  route: RabIntentRoute;
  /** Kecocokan template bertipe (null = tidak ada / ditolak karena spek). */
  templateMatch: TypedTemplateMatch | null;
  /** true bila templateMatch boleh dipakai generate apa adanya. */
  templateFits: boolean;
  /** true bila kartu pilihan harus tampil (basis terdekat R1 + rekomendasi). */
  needsCard: boolean;
  recommendation: RabTemplateRecommendation;
  /** Field hilang menurut identifyMissingSpec (untuk klarifikasi). */
  missing: string[];
  /** Pertanyaan klarifikasi satu topik, atau null bila bisa lanjut. */
  clarification: string | null;
  /** Kandidat template yang dipertimbangkan (id + nama + alasan). */
  candidates: Array<{ id: string; name: string; reason: string }>;
  /**
   * Template universal yang DIREKOMENDASIKAN untuk dipaksakan ke
   * buildUniversalDraft — hanya bila SATU cakupan terdeteksi + ada
   * pemenang seri yang lebih cocok dengan kata-kata pengguna daripada
   * pemenang urutan katalog. Multi-cakupan: tidak pernah dipaksa (satu
   * id tidak boleh dipaksakan ke semua cakupan).
   *
   * B5-1 (2026-11-23): pemenang seri yang dipaksakan dari jalur intent
   * SELALU lolos evaluator kesesuaian B1 — template yang ditolak
   * evaluator tidak pernah dipaksakan dari sini (template paksa
   * melewati evaluator berdasarkan desain, jadi inferensi intent tidak
   * boleh mengesampingkannya). Berbeda dengan template paksa dari
   * PILIHAN EKSPLISIT pengguna (klik kartu/katalog → universalResultFor
   * langsung), yang memang tetap melewati evaluator berdasarkan desain.
   */
  forcedTemplateId?: string;
}

export interface RabIntentFlowResult {
  evaluation: RabIntentEvaluation;
  /** Hasil generate kanonis (template/spec) — null untuk rute lain. */
  built: DirectRabResult | null;
}

/* ------------------------------------------------------------------ */
/* State spek aktif (pola lastDirectRab)                               */
/* ------------------------------------------------------------------ */

let lastRabIntentSpec: RabIntentSpec | null = null;

export function getLastRabIntentSpec(): RabIntentSpec | null {
  return lastRabIntentSpec;
}

export function setLastRabIntentSpec(s: RabIntentSpec | null): void {
  lastRabIntentSpec = s;
}

export function clearLastRabIntentSpec(): void {
  lastRabIntentSpec = null;
}

/* ------------------------------------------------------------------ */
/* Aturan dukungan template                                            */
/* ------------------------------------------------------------------ */

/**
 * Lingkup "penuh" yang memang dicakup template rumah (pondasi sampai
 * atap / lengkap) — BUKAN alasan menolak template. Lingkup lain
 * ("struktur saja", "finishing saja", "MEP saja") membatasi item yang
 * dihasilkan, dan template tidak punya parameter untuk itu.
 */
const FULL_SCOPES = new Set([
  'pondasi sampai atap',
  'pondasi sampai finishing',
  'struktur dan arsitektur',
  'sampai finishing',
  'serah terima',
  'lengkap',
  'keseluruhan',
  'semua pekerjaan',
  'full',
]);

/**
 * Alasan spek TIDAK dapat diwakili template parametrik rumah: template
 * hanya berparameter luas/lantai/dimensi/kamar — sistem atap, pondasi,
 * struktur, material, lingkup parsial, dan pengecualian bukan
 * parameternya. Daftar kosong = template boleh dipakai (dengan
 * adaptasi luas bila perlu).
 */
export function unsupportedSpecReasons(spec: RabIntentSpec): string[] {
  const reasons: string[] = [];
  if (spec.roofSystem.length > 0) reasons.push(`sistem atap ${spec.roofSystem.join(', ')}`);
  if (spec.foundationSystem) reasons.push(`pondasi ${spec.foundationSystem}`);
  if (spec.structuralSystem.length > 0) reasons.push(`struktur ${spec.structuralSystem.join(', ')}`);
  if (spec.materials.length > 0) reasons.push(`material ${spec.materials.join(', ')}`);
  const partialScope = spec.scope.filter((s) => !FULL_SCOPES.has(s));
  if (partialScope.length > 0) reasons.push(`lingkup ${partialScope.join(', ')}`);
  if (spec.exclusions.length > 0) reasons.push(`pengecualian ${spec.exclusions.join(', ')}`);
  return reasons;
}

/* ------------------------------------------------------------------ */
/* Definisi kritis per disiplin (§6 Universal Construction Intelligence, */
/* W6 2026-11-22)                                                      */
/* ------------------------------------------------------------------ */

/** Satu field kritis: data inti yang wajib ada sebelum draft disusun. */
export interface CriticalField {
  /** Kunci stabil (dipakai lintas jalur: klarifikasi intent-first,
   *  pertanyaan percakapan intake, kuesioner). */
  key: string;
  /** Label manusiawi (dipakai pesan + brief). */
  label: string;
}

/**
 * Tabel kritis per disiplin — SATU-SATUNYA definisi "data inti" untuk
 * klarifikasi. Dipakai `buildSpecClarification` di bawah; `questionDefsFor`
 * (universalIntake.ts, milik W2/W10) diarahkan memakai tabel yang sama
 * agar kedua jalur tidak punya definisi "kritis" yang berbeda (S1 §5.5).
 *
 * Kunci disiplin = id scope universal (`UniversalScopeId`) + 'rumah'
 * (jalur intent-first rumah) + 'bangunan' (default bila disiplin tidak
 * dikenali). Field mengikuti contoh §6 master prompt: rumah =
 * luas/dimensi; jalan = panjang+lebar; jembatan = bentang+lebar;
 * irigasi = panjang+dimensi saluran; gudang = dimensi+bentang
 * bebas+tinggi. `ask` adalah kalimat pertanyaan untuk disiplin itu —
 * JANGAN tanya pertanyaan rumah untuk proyek jalan/irigasi.
 */
const DISCIPLINE_CRITICAL: Record<
  string,
  { fields: CriticalField[]; ask: (typeLabel: string) => string }
> = {
  rumah: {
    fields: [
      { key: 'area', label: 'luas bangunan (m²)' },
      { key: 'dimensions', label: 'dimensi bangunan (m)' },
    ],
    ask: (t) =>
      `Sebelum saya susun RAB-nya, saya butuh satu data inti: berapa luas bangunan ${t}nya ` +
      `(dalam m²), atau ukurannya (misalnya 6 × 15 m)?`,
  },
  bangunan: {
    fields: [
      { key: 'area', label: 'luas bangunan (m²)' },
      { key: 'dimensions', label: 'dimensi bangunan (m)' },
    ],
    ask: () =>
      'Sebelum saya susun RAB-nya, saya butuh satu data inti: berapa luas bangunannya ' +
      '(dalam m²), atau ukurannya (misalnya 6 × 15 m)?',
  },
  gedung: {
    fields: [
      { key: 'area', label: 'luas bangunan (m²)' },
      { key: 'dimensions', label: 'dimensi bangunan (m)' },
    ],
    ask: (t) =>
      `Sebelum saya susun RAB-nya, saya butuh satu data inti: berapa luas bangunan ${t}nya ` +
      `(dalam m²), atau ukurannya (misalnya 6 × 15 m)?`,
  },
  gudang: {
    fields: [
      { key: 'dimensions', label: 'dimensi gudang — panjang × lebar (m)' },
      { key: 'clearSpan', label: 'bentang bebas (m)' },
      { key: 'height', label: 'tinggi gudang (m)' },
    ],
    ask: () =>
      'Sebelum saya susun RAB-nya, saya butuh data intinya: berapa dimensi gudangnya ' +
      '(panjang × lebar dalam meter), bentang bebas, dan tingginya?',
  },
  jalan: {
    fields: [
      { key: 'length', label: 'panjang jalan (m)' },
      { key: 'width', label: 'lebar jalan (m)' },
    ],
    ask: () =>
      'Sebelum saya susun RAB-nya, saya butuh dua data inti: berapa panjang dan lebar jalannya (dalam meter)?',
  },
  jembatan: {
    fields: [
      { key: 'span', label: 'bentang jembatan (m)' },
      { key: 'width', label: 'lebar jembatan (m)' },
    ],
    ask: () =>
      'Sebelum saya susun RAB-nya, saya butuh dua data inti: berapa bentang dan lebar jembatannya (dalam meter)?',
  },
  irigasi: {
    fields: [
      { key: 'length', label: 'panjang saluran (m)' },
      { key: 'channelDims', label: 'dimensi saluran — lebar × kedalaman (m)' },
    ],
    ask: () =>
      'Sebelum saya susun RAB-nya, saya butuh dua data inti: berapa panjang dan dimensi salurannya (lebar × kedalaman, dalam meter)?',
  },
  drainase: {
    fields: [
      { key: 'length', label: 'panjang saluran (m)' },
      { key: 'channelDims', label: 'dimensi saluran — lebar × kedalaman (m)' },
    ],
    ask: () =>
      'Sebelum saya susun RAB-nya, saya butuh dua data inti: berapa panjang dan dimensi salurannya (lebar × kedalaman, dalam meter)?',
  },
  mep: {
    fields: [
      { key: 'area', label: 'luas area yang dilayani (m²)' },
      { key: 'points', label: 'jumlah titik instalasi' },
    ],
    ask: () =>
      'Sebelum saya susun RAB-nya, saya butuh dua data inti: berapa luas area yang dilayani instalasinya (dalam m²), dan berapa jumlah titiknya?',
  },
  sanitasi: {
    fields: [
      { key: 'areaOrLength', label: 'luas/panjang area layanan' },
      { key: 'units', label: 'jumlah unit/sambungan' },
    ],
    ask: () =>
      'Sebelum saya susun RAB-nya, saya butuh dua data inti: berapa luas/panjang area layanannya, dan berapa jumlah unit/sambungannya?',
  },
  pelabuhan: {
    fields: [{ key: 'length', label: 'panjang dermaga/garis pantai (m)' }],
    ask: () =>
      'Sebelum saya susun RAB-nya, saya butuh satu data inti: berapa panjang dermaga/garis pantainya (dalam meter)?',
  },
  struktur: {
    fields: [
      { key: 'dimensions', label: 'dimensi struktur (m)' },
      { key: 'height', label: 'tinggi struktur (m)' },
    ],
    ask: () =>
      'Sebelum saya susun RAB-nya, saya butuh data intinya: berapa dimensi dan tinggi strukturnya (dalam meter)?',
  },
  pondasi: {
    fields: [
      { key: 'dimensions', label: 'dimensi area pondasi (m)' },
      { key: 'count', label: 'jumlah titik pondasi' },
    ],
    ask: () =>
      'Sebelum saya susun RAB-nya, saya butuh satu data inti: berapa dimensi area pondasinya, atau jumlah titik pondasinya?',
  },
  tanah: {
    fields: [
      { key: 'area', label: 'luas area (m²)' },
      { key: 'volume', label: 'volume galian/urugan (m³)' },
    ],
    ask: () =>
      'Sebelum saya susun RAB-nya, saya butuh satu data inti: berapa luas area atau volume galian/urugannya (dalam m³)?',
  },
  lanskap: {
    fields: [
      { key: 'area', label: 'luas area (m²)' },
      { key: 'length', label: 'panjang area (m)' },
    ],
    ask: () =>
      'Sebelum saya susun RAB-nya, saya butuh satu data inti: berapa luas atau panjang area lanskapnya?',
  },
  renovasi: {
    fields: [{ key: 'area', label: 'luas area yang direnovasi (m²)' }],
    ask: () =>
      'Sebelum saya susun RAB-nya, saya butuh satu data inti: berapa luas area yang direnovasinya (dalam m²)?',
  },
  demolisi: {
    fields: [{ key: 'area', label: 'luas bangunan yang dibongkar (m²)' }],
    ask: () =>
      'Sebelum saya susun RAB-nya, saya butuh satu data inti: berapa luas bangunan yang dibongkarnya (dalam m²)?',
  },
  olahraga: {
    fields: [{ key: 'area', label: 'luas lapangan (m²)' }],
    ask: () =>
      'Sebelum saya susun RAB-nya, saya butuh satu data inti: berapa luas lapangannya (dalam m²)?',
  },
  pertanian: {
    fields: [
      { key: 'area', label: 'luas area (m²)' },
      { key: 'length', label: 'panjang area (m)' },
    ],
    ask: () =>
      'Sebelum saya susun RAB-nya, saya butuh satu data inti: berapa luas atau panjang area pertaniannya?',
  },
  atap: {
    fields: [{ key: 'area', label: 'luas atap (m²)' }],
    ask: () =>
      'Sebelum saya susun RAB-nya, saya butuh satu data inti: berapa luas atapnya (dalam m²)?',
  },
  finishing: {
    fields: [{ key: 'area', label: 'luas area finishing (m²)' }],
    ask: () =>
      'Sebelum saya susun RAB-nya, saya butuh satu data inti: berapa luas area finishingnya (dalam m²)?',
  },
};

/**
 * Field kritis untuk satu disiplin (disiplin tak dikenal → default
 * 'bangunan': luas/dimensi). Salinan baru tiap panggil — tabel tidak
 * boleh dimutasi pemanggil.
 */
export function criticalFieldsFor(discipline: string): CriticalField[] {
  const entry =
    DISCIPLINE_CRITICAL[(discipline || '').toLowerCase().trim()] ??
    DISCIPLINE_CRITICAL.bangunan;
  return entry.fields.map((f) => ({ ...f }));
}

/**
 * Disiplin satu spek intent-first: gudang didahulukan (tipenya dikenal
 * spek rumah tetapi kritisnya bukan luas saja), lalu rumah (aturan
 * isHouseRequest yang sama dengan evaluateRabIntent), lalu scope
 * universal pertama dari teks mentah, lalu gedung generik bila ada
 * buildingType, else 'bangunan'.
 */
export function disciplineForSpec(spec: RabIntentSpec): string {
  if (spec.buildingType === 'gudang') return 'gudang';
  if (isHouseRequest(spec, spec.rawText)) return 'rumah';
  const scopes = detectScopes(spec.rawText);
  if (scopes.length > 0) return scopes[0].id;
  return spec.buildingType ? 'gedung' : 'bangunan';
}

/* ------------------------------------------------------------------ */
/* Klarifikasi                                                         */
/* ------------------------------------------------------------------ */

/**
 * Pertanyaan klarifikasi satu topik — atau null bila generate bisa
 * lanjut. HANYA basis terukur (luas/dimensi bangunan) yang memblokir:
 * lantai/kamar/lokasi/dll. berjalan sebagai asumsi berlabel sesuai
 * aturan owner yang sudah ada. Field yang sudah eksplisit tidak pernah
 * ditanyakan (dijaga lewat explicitFields + identifyMissingSpec).
 *
 * §6 (W6): PERTANYAANNYA adaptif per disiplin via criticalFieldsFor —
 * jalan ditanya panjang+lebar, jembatan ditanya bentang+lebar, irigasi
 * ditanya panjang+dimensi saluran — bukan pertanyaan luas rumah. Aturan
 * BLOKIR tidak berubah: RabIntentSpec tidak punya kolom bentang/
 * panjang/lebar, jadi "basis terukur" yang bisa dilihat modul ini tetap
 * luas/dimensi; disiplin non-rumah yang lolos ke jalur universal
 * diklarifikasi alur universal sendiri (evaluateRabIntent mengembalikan
 * clarification null untuk rute itu).
 */
export function buildSpecClarification(spec: RabIntentSpec): string | null {
  if (spec.source === 'ded') return null; // gambar kerja yang menjawab
  const missing = identifyMissingSpec(spec);
  const hasBasis = spec.buildingAreaM2 != null || spec.dimensionsM != null;
  // Basis terukur hilang = satu-satunya pemblokir. identifyMissingSpec
  // tidak mengenal dimensionsM sebagai pemenuh basis, jadi dimensi yang
  // sudah ada membatalkan blokir luas di sini.
  const basisBlocked = !hasBasis && missing.includes('buildingAreaM2');
  if (!basisBlocked) return null;
  const explicit = new Set(spec.explicitFields);
  if (explicit.has('buildingAreaM2') || explicit.has('dimensionsM')) return null;
  const discipline = disciplineForSpec(spec);
  const entry = DISCIPLINE_CRITICAL[discipline] ?? DISCIPLINE_CRITICAL.bangunan;
  const typeLabel = spec.buildingType ?? 'bangunan';
  return entry.ask(typeLabel);
}

/* ------------------------------------------------------------------ */
/* Ringkasan spek untuk pesan                                          */
/* ------------------------------------------------------------------ */

/** Baris "Spesifikasi dari Anda" — hanya field eksplisit, tanpa karangan. */
export function formatSpecSummaryLines(spec: RabIntentSpec): string[] {
  const lines: string[] = [];
  const fmt = (v: number) => v.toLocaleString('id-ID', { maximumFractionDigits: 1 });
  if (spec.buildingType) lines.push(`Jenis bangunan: ${spec.buildingType}`);
  if (spec.landAreaM2 != null) lines.push(`Luas tanah: ${fmt(spec.landAreaM2)} m²`);
  if (spec.buildingAreaM2 != null) lines.push(`Luas bangunan: ${fmt(spec.buildingAreaM2)} m²`);
  if (spec.dimensionsM && (spec.dimensionsM.lengthM != null || spec.dimensionsM.widthM != null)) {
    const l = spec.dimensionsM.lengthM != null ? fmt(spec.dimensionsM.lengthM) : '?';
    const w = spec.dimensionsM.widthM != null ? fmt(spec.dimensionsM.widthM) : '?';
    lines.push(`Dimensi: ${w} × ${l} m`);
  }
  if (spec.floors != null) lines.push(`Jumlah lantai: ${spec.floors} lantai`);
  if (spec.bedrooms != null) lines.push(`Kamar tidur: ${spec.bedrooms}`);
  if (spec.bathrooms != null) lines.push(`Kamar mandi: ${spec.bathrooms}`);
  if (spec.location) lines.push(`Lokasi: ${spec.location}`);
  if (spec.roofSystem.length > 0) lines.push(`Atap: ${spec.roofSystem.join(', ')}`);
  if (spec.foundationSystem) lines.push(`Pondasi: ${spec.foundationSystem}`);
  if (spec.structuralSystem.length > 0) lines.push(`Struktur: ${spec.structuralSystem.join(', ')}`);
  if (spec.materials.length > 0) lines.push(`Material: ${spec.materials.join(', ')}`);
  if (spec.scope.length > 0) lines.push(`Lingkup: ${spec.scope.join(', ')}`);
  if (spec.exclusions.length > 0) lines.push(`Tidak termasuk: ${spec.exclusions.join(', ')}`);
  if (spec.budgetIdr != null) lines.push(`Budget: Rp${spec.budgetIdr.toLocaleString('id-ID')}`);
  if (spec.quality) lines.push(`Kualitas: ${spec.quality}`);
  return lines;
}

/* ------------------------------------------------------------------ */
/* Konversi spek → RabNeeds (sinkronisasi state lama)                  */
/* ------------------------------------------------------------------ */

/**
 * Peta spek kanonis ke state kebutuhan lama (RabNeeds) — dipakai agar
 * jalur finalisasi ("itu aja" → buildSpecRabFromNeeds) dan ringkasan
 * melihat angka yang SAMA dengan spek. Hanya field eksplisit yang
 * dipetakan; null tetap null (tidak pernah diisi default).
 *
 * Perhatian dimensi: dimensionsM spek adalah dimensi BANGUNAN, sementara
 * landLength/landWidth pada RabNeeds dibaca sebagai LAHAN bila luas
 * bangunan juga ada (buildSpecRabFromNeeds) — karena itu dimensi hanya
 * dipetakan bila luas bangunan TIDAK ada (konvensi tapak jalur teks).
 */
export function specToRabNeeds(spec: RabIntentSpec, base?: RabNeeds): RabNeeds {
  const n: RabNeeds = base ? { ...base } : emptyRabNeeds();
  if (spec.buildingType) {
    const isHouse =
      spec.buildingType === 'rumah' ||
      spec.buildingType === 'rumah tinggal' ||
      spec.buildingType === 'villa';
    n.kind = isHouse ? 'rumah' : 'gedung';
    n.kindLabel = spec.buildingType;
  }
  if (spec.floors != null) {
    n.floors = spec.floors;
    n.floorsMentioned = true;
  }
  if (spec.buildingAreaM2 != null) n.buildingArea = spec.buildingAreaM2;
  if (spec.landAreaM2 != null) n.landAreaM2 = spec.landAreaM2;
  if (spec.dimensionsM && spec.buildingAreaM2 == null) {
    const w = spec.dimensionsM.widthM;
    const l = spec.dimensionsM.lengthM;
    if (w != null && l != null) {
      n.landLength = Math.max(l, w);
      n.landWidth = Math.min(l, w);
      n.buildingLength = n.landLength;
      n.buildingWidth = n.landWidth;
      n.footprintM2 = Math.round(l * w * 100) / 100;
      n.footprintFromDims = true;
    }
  }
  if (spec.bedrooms != null) n.bedrooms = spec.bedrooms;
  if (spec.bathrooms != null) n.bathrooms = spec.bathrooms;
  if (spec.location) n.location = spec.location;
  if (spec.roofSystem.length > 0) n.roofMaterial = spec.roofSystem[0];
  return n;
}

/* ------------------------------------------------------------------ */
/* Evaluasi template rumah                                             */
/* ------------------------------------------------------------------ */

/** Template rumah 1-lantai terdaftar, diurutkan menurut kedekatan luas. */
function houseAreaCandidates(requestedArea: number): Array<{
  id: string;
  templateId: string;
  name: string;
  area: number;
  distance: number;
}> {
  const cands = HouseTypeCatalog.getAll()
    .filter((h) => h.templateId && h.area != null && h.defaultFloorCount === 1)
    .map((h) => ({
      id: h.id,
      templateId: h.templateId as string,
      name: h.label,
      area: h.area as number,
      distance: Math.abs((h.area as number) - requestedArea),
    }));
  cands.sort((a, b) => a.distance - b.distance || b.area - a.area);
  return cands;
}

/** Apakah permintaan ini permintaan RUMAH (bukan kategori lain)? */
function isHouseRequest(spec: RabIntentSpec, rawText: string): boolean {
  const needs = extractRabNeeds(stripLandPhrases(rawText));
  if (needs.kind === 'rumah') return true;
  if (needs.kind != null) return false;
  return (
    spec.buildingType === 'rumah' ||
    spec.buildingType === 'rumah tinggal' ||
    spec.buildingType === 'villa'
  );
}

const TYPE_NUMBER_RE = /\b(?:type|tipe)\s*(\d+)/i;

/* ------------------------------------------------------------------ */
/* Evaluasi template universal                                         */
/* ------------------------------------------------------------------ */

/** Kata generik yang TIDAK membedakan kandidat saat seri skor. */
const TIE_BREAK_STOPWORDS = new Set([
  'buatkan', 'buatin', 'bikin', 'buatlah', 'rab', 'rencana', 'anggaran',
  'biaya', 'luas', 'dengan', 'yang', 'untuk', 'dari', 'sampai', 'hingga',
  'atau', 'pakai', 'memakai', 'menggunakan', 'struktur', 'dinding',
  'lantai', 'bangunan', 'meter', 'sepanjang', 'panjang', 'lebar',
  'tinggi', 'jumlah', 'kamar', 'tidur', 'mandi', 'lokasi', 'baja',
  'beton', 'kayu', 'atap', 'pondasi', 'rumah', 'gedung', 'jalan',
  'jembatan', 'drainase', 'sekitar', 'kurang', 'lebih', 'tolong',
  'saya', 'mau', 'ingin', 'minta', 'hitung', 'hitungkan', 'susun',
  'susunkan', 'rangka', 'sistem', 'jenis', 'bahan', 'material',
]);

/** Kata pembeda dari teks pengguna (huruf kecil, ≥4 huruf, bukan stopword). */
function distinctiveWords(rawText: string): string[] {
  const words = (rawText || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !TIE_BREAK_STOPWORDS.has(w));
  return [...new Set(words)];
}

interface UniversalEvaluation {
  route: 'universal' | 'custom';
  recommendation: RabTemplateRecommendation;
  candidates: RabIntentEvaluation['candidates'];
  forcedTemplateId?: string;
}

function evaluateUniversal(rawText: string): UniversalEvaluation {
  const uSpec = extractUniversalSpec(rawText);
  const scopes = detectScopes(rawText);
  if (scopes.length === 0) {
    return {
      route: 'custom',
      recommendation: {
        method: 'custom',
        reasons: [
          'Tidak ada kategori pekerjaan yang dikenali dari permintaan ini — tidak ada template katalog yang bisa dipilih secara bertanggung jawab.',
          'Belum ada jalur hitung untuk spesifikasi ini — saya susun ringkasan kebutuhan dulu (bukan RAB jadi); lengkapi datanya atau susun manual lewat RAB & Estimasi.',
        ],
      },
      candidates: [],
    };
  }
  const distinctive = distinctiveWords(rawText);
  const candidates: RabIntentEvaluation['candidates'] = [];
  const scopePicks: Array<{
    scopeId: string;
    scopeLabel: string;
    pickName: string;
    pickId: string;
    score: number;
    closeCall: boolean;
    tiedNames: string[];
    betterMatchName: string | null;
    betterMatchId: string | null;
  }> = [];
  for (const scope of scopes) {
    const res = pickTemplateForScope(uSpec, scope);
    for (const r of res.ranked.slice(0, 3)) {
      candidates.push({
        id: r.template.id,
        name: r.template.name,
        reason: `[${scope.label}] skor ${r.score}${r.outOfRange.length > 0 ? ` (di luar batas: ${r.outOfRange.join('; ')})` : ''}`,
      });
    }
    if (!res.pick) continue;
    const top = res.pick;
    const tied = res.ranked.filter((r) => r.score === top.score);
    // Pemecah seri intent-first: di antara kandidat yang SERI skornya,
    // yang namanya memuat kata pembeda pengguna ("pendingin") lebih
    // relevan daripada pemenang urutan katalog. Ini TIDAK mengubah pick
    // engine — ia dicatat sebagai rekomendasi alternatif (dan dipaksakan
    // hanya bila cakupan tunggal, lihat di bawah).
    //
    // B5-1 (2026-11-23): pemecah seri HANYA boleh memilih dari kandidat
    // yang LOLOS evaluator kesesuaian B1 (`res.suitable`). Template
    // paksa MELEWATI evaluator berdasarkan desain (dianggap keputusan
    // eksplisit), jadi pemenang seri yang ditolak evaluator tidak boleh
    // dipaksakan ke builder: RECONSTRUCTION untuk jalan beton BARU
    // menang seri hanya karena namanya memuat kata "baru" ("Rigid
    // Baru") — padahal evaluator menolaknya (T1: tanpa bukti struktur
    // eksisting) — dan jalan baru itu mendapat item Pembongkaran Beton.
    // Kandidat yang lolos evaluator (mis. cold-storage untuk gudang
    // pendingin) tetap boleh menang seri dan dipaksakan.
    const suitableIds = new Set(res.suitable.map((s) => s.template.id));
    const tiedSuitable = tied.filter((t) => suitableIds.has(t.template.id));
    let betterMatch: { name: string; id: string } | null = null;
    if (tiedSuitable.length > 1 && distinctive.length > 0) {
      const scored = tiedSuitable.map((t) => ({
        name: t.template.name,
        id: t.template.id,
        hits: distinctive.filter((w) => t.template.name.toLowerCase().includes(w)).length,
      }));
      scored.sort((a, b) => b.hits - a.hits);
      const topHits = scored[0].hits;
      const pickHits =
        scored.find((s) => s.id === top.template.id)?.hits ?? 0;
      if (topHits > pickHits && topHits > 0) {
        betterMatch = { name: scored[0].name, id: scored[0].id };
      }
    }
    scopePicks.push({
      scopeId: scope.id,
      scopeLabel: scope.label,
      pickName: top.template.name,
      pickId: top.template.id,
      score: top.score,
      closeCall: res.closeCall,
      tiedNames: tied.filter((t) => t.template.id !== top.template.id).map((t) => t.template.name),
      betterMatchName: betterMatch?.name ?? null,
      betterMatchId: betterMatch?.id ?? null,
    });
  }
  if (scopePicks.length === 0) {
    return {
      route: 'custom',
      recommendation: {
        method: 'custom',
        reasons: [
          'Tidak ada template katalog yang mencapai ambang kecocokan untuk spesifikasi ini — tidak ada template yang dipaksakan.',
          'Belum ada jalur hitung untuk spesifikasi ini — saya susun ringkasan kebutuhan dulu (bukan RAB jadi); lengkapi datanya atau susun manual lewat RAB & Estimasi.',
        ],
      },
      candidates,
    };
  }
  // Cakupan utama = skor tertinggi (bukan urutan deteksi): untuk gudang,
  // cakupan Gedung (25) lebih utama daripada Struktur (16); untuk kolam
  // renang, Fasilitas Olahraga (24) lebih utama daripada Lanskap (16).
  scopePicks.sort((a, b) => b.score - a.score);
  const primary = scopePicks[0];
  const reasons: string[] = [];
  const alternatives: string[] = [];
  // Cakupan tunggal + pemenang seri yang lebih relevan → rekomendasi
  // memakai pemenang itu (dan dipaksakan ke builder agar draft memakai
  // template yang direkomendasikan, bukan pemenang urutan katalog).
  // Syaratnya JUMLAH cakupan terdeteksi == 1 (bukan hanya yang punya
  // pick): cakupan kedua yang tak ber-pick di sini masih bisa mendapat
  // template dari jalur lain di builder, dan satu id paksa tidak boleh
  // dipaksakan ke cakupan itu.
  let forcedTemplateId: string | undefined;
  let recommendedName = primary.pickName;
  let recommendedId = primary.pickId;
  if (
    scopes.length === 1 &&
    primary.betterMatchName &&
    primary.betterMatchId
  ) {
    recommendedName = primary.betterMatchName;
    recommendedId = primary.betterMatchId;
    forcedTemplateId = primary.betterMatchId;
    reasons.push(
      `Template "${recommendedName}" direkomendasikan untuk ${primary.scopeLabel}: skor sama dengan "${primary.pickName}" (seri ${primary.score}), tetapi namanya memuat kata dari permintaan Anda — lebih relevan daripada pemenang urutan katalog.`
    );
    alternatives.push(`"${primary.pickName}" (skor sama, urutan katalog)`);
  } else {
    reasons.push(
      `Template "${primary.pickName}" direkomendasikan untuk ${primary.scopeLabel} (skor tertinggi ${primary.score}${primary.closeCall ? `, selisih tipis dari pesaing — pilihan tidak tegas` : ''}).`
    );
    if (primary.betterMatchName) {
      reasons.push(
        `Catatan: kata dari permintaan Anda lebih cocok dengan "${primary.betterMatchName}" (skor sama ${primary.score}) — draft memakai pemenang urutan katalog; revisi dengan "ganti menjadi ${primary.betterMatchName}" bila maksud Anda yang itu.`
      );
      alternatives.push(`"${primary.betterMatchName}" (skor sama, lebih cocok dengan kata permintaan)`);
    }
  }
  for (const t of primary.tiedNames.slice(0, 3)) {
    // Jangan cantumkan template yang direkomendasikan sebagai alternatif
    // dirinya sendiri (kasus pemenang seri yang lebih relevan).
    if (t === recommendedName) continue;
    if (!alternatives.some((a) => a.includes(t))) alternatives.push(`"${t}" (skor sama ${primary.score})`);
  }
  for (const extra of scopePicks.slice(1)) {
    reasons.push(`Cakupan ${extra.scopeLabel}: "${extra.pickName}" (skor ${extra.score}).`);
    if (extra.betterMatchName) {
      reasons.push(
        `Catatan ${extra.scopeLabel}: kata permintaan Anda lebih cocok dengan "${extra.betterMatchName}" (skor sama ${extra.score}).`
      );
      alternatives.push(`"${extra.betterMatchName}" (skor sama, ${extra.scopeLabel})`);
    }
  }
  return {
    route: 'universal',
    recommendation: {
      method: 'universal',
      templateId: recommendedId,
      templateName: recommendedName,
      reasons,
      alternatives: alternatives.length > 0 ? alternatives : undefined,
    },
    candidates,
    forcedTemplateId,
  };
}

/* ------------------------------------------------------------------ */
/* Evaluasi utama                                                      */
/* ------------------------------------------------------------------ */

export interface EvaluateRabIntentOptions {
  /** Spek yang sudah diekstrak/digabung (koreksi lanjutan) — jangan ekstrak ulang. */
  spec?: RabIntentSpec;
  /**
   * Hasil specRabHijackGuard dari registry (primer non-rumah): bila true,
   * permintaan TIDAK boleh masuk jalur rumah walau teksnya menyebut rumah.
   */
  hijacked?: boolean;
}

/**
 * Evaluasi intent-first PENUH untuk satu permintaan RAB: ekstrak spek
 * dulu, lalu evaluasi template terhadap spek itu. Murni (tanpa efek
 * samping selain membaca registry) — generate dilakukan runRabIntentFlow.
 */
export function evaluateRabIntent(
  rawText: string,
  opts?: EvaluateRabIntentOptions,
): RabIntentEvaluation {
  const text = (rawText || '').trim();
  const spec = opts?.spec ?? extractRabIntentSpec(text);
  const missing = identifyMissingSpec(spec);
  const clarification = buildSpecClarification(spec);
  const unsupported = unsupportedSpecReasons(spec);

  /* ---- 1. DED: gambar kerja adalah sumber kebenaran ---- */
  if (spec.source === 'ded') {
    const summary = formatSpecSummaryLines(spec);
    return {
      spec,
      route: 'ded',
      templateMatch: null,
      templateFits: false,
      needsCard: false,
      recommendation: {
        method: 'ded',
        reasons: [
          'Permintaan berbasis gambar DED — RAB dihitung dari gambar kerja lewat DED Estimate AI, bukan dari template teks.',
          ...(summary.length > 0
            ? [`Spesifikasi dari pesan Anda yang tetap berlaku: ${summary.join('; ')}.`]
            : []),
        ],
      },
      missing,
      clarification: null,
      candidates: [],
    };
  }

  /* ---- 2. Rumah (kecuali dibajak primer lain) ---- */
  if (!opts?.hijacked && isHouseRequest(spec, text)) {
    const typed = findDirectTemplate(text);
    const hasBasis =
      spec.buildingAreaM2 != null ||
      spec.dimensionsM != null ||
      TYPE_NUMBER_RE.test(text);

    if (typed && typed.matchedByType) {
      const label = `Type ${typed.item.area}`;
      if (unsupported.length === 0) {
        const areaNote =
          spec.buildingAreaM2 != null && spec.buildingAreaM2 !== typed.item.area * typed.floors
            ? ` Luas bangunan eksplisit ${spec.buildingAreaM2} m² dipakai sebagai luas total (bukan ${typed.item.area * typed.floors} m² dari ${label}).`
            : '';
        return {
          spec,
          route: 'template',
          templateMatch: typed,
          templateFits: true,
          needsCard: false,
          recommendation: {
            method: 'template',
            templateId: typed.item.templateId,
            templateName: typed.template.name,
            reasons: [
              `${label} disebut eksplisit di permintaan Anda dan template-nya terdaftar — dipakai sebagai basis hitung.${areaNote}`,
            ],
          },
          missing,
          clarification: null,
          candidates: [
            { id: typed.item.templateId, name: typed.template.name, reason: 'tipe disebut eksplisit' },
          ],
        };
      }
      // Tipe disebut, TAPI spek tidak terwakili template → jalur spek.
      return {
        spec,
        route: 'spec',
        templateMatch: null,
        templateFits: false,
        needsCard: false,
        recommendation: {
          method: 'spec',
          reasons: [
            `Template ${label} tidak dapat mewakili ${unsupported.join('; ')} — sistem itu bukan parameter template.`,
            'Dihitung parametrik dari spesifikasi Anda (bukan dari template), dengan spesifikasi itu dicatat terbuka di hasil.',
          ],
        },
        missing,
        clarification: null,
        candidates: [
          {
            id: typed.item.templateId,
            name: typed.template.name,
            reason: `ditolak: tidak mewakili ${unsupported.join('; ')}`,
          },
        ],
      };
    }

    if (typed) {
      // Fallback R1: luas tanpa tipe — BUKAN seleksi template, melainkan
      // basis terdekat yang perlu konfirmasi pengguna (kartu pilihan +
      // rekomendasi). Bila spek tak terwakili, kartu pun tidak tampil.
      if (unsupported.length > 0) {
        return {
          spec,
          route: 'spec',
          templateMatch: null,
          templateFits: false,
          needsCard: false,
          recommendation: {
            method: 'spec',
            reasons: [
              `Tidak ada tipe yang disebut eksplisit, dan template terdekat (Type ${typed.item.area}) tidak dapat mewakili ${unsupported.join('; ')}.`,
              'Dihitung parametrik dari spesifikasi Anda (luas bangunan sesuai permintaan), dengan spesifikasi itu dicatat terbuka di hasil.',
            ],
          },
          missing,
          clarification: null,
          candidates: [
            {
              id: typed.item.templateId,
              name: typed.template.name,
              reason: `ditolak: tidak mewakili ${unsupported.join('; ')}`,
            },
          ],
        };
      }
      if (typed.areaFallback == null) {
        // Luas permintaan SAMA PERSIS dengan tipe terdekat = kecocokan
        // eksak (perilaku 2026-10-27): langsung generate, tanpa kartu.
        const exactArea = spec.buildingAreaM2 ?? typed.item.area;
        return {
          spec,
          route: 'template',
          templateMatch: typed,
          templateFits: true,
          needsCard: false,
          recommendation: {
            method: 'template',
            templateId: typed.item.templateId,
            templateName: typed.template.name,
            reasons: [
              `Luas bangunan ${exactArea} m² sama persis dengan Type ${typed.item.area} — template dipakai langsung sebagai basis hitung.`,
            ],
          },
          missing,
          clarification: null,
          candidates: [
            {
              id: typed.item.templateId,
              name: typed.template.name,
              reason: `luas sama persis (${exactArea} m²)`,
            },
          ],
        };
      }
      const requestedArea =
        typed.areaFallback?.requestedArea ?? spec.buildingAreaM2 ?? typed.item.area;
      const areaCands = houseAreaCandidates(requestedArea);
      const minDistance = areaCands.length > 0 ? areaCands[0].distance : 0;
      const tied = areaCands.filter((c) => c.distance === minDistance);
      const candidates = tied.map((c) => ({
        id: c.templateId,
        name: c.name,
        reason:
          c.templateId === typed.item.templateId
            ? `terdekat dari ${requestedArea} m² (selisih ${c.distance} m²)`
            : `sama dekat dari ${requestedArea} m² (selisih ${c.distance} m²)`,
      }));
      const reasons = [
        `Tidak ada tipe yang disebut eksplisit — template terdekat dari luas ${requestedArea} m² adalah Type ${typed.item.area} (selisih ${Math.abs(typed.item.area - requestedArea)} m²).`,
        `Luas dihitung SESUAI permintaan (${requestedArea} m²), bukan luas tipe — template hanya basis parametrik.`,
      ];
      if (tied.length > 1) {
        reasons.push(
          `Dua template sama dekat (${tied.map((c) => `Type ${c.area}`).join(' dan ')}) — direkomendasikan Type ${typed.item.area} karena lebih besar sehingga mencakup luas permintaan.`
        );
      }
      return {
        spec,
        route: 'template',
        templateMatch: typed,
        templateFits: false,
        needsCard: true,
        recommendation: {
          method: 'template',
          templateId: typed.item.templateId,
          templateName: typed.template.name,
          reasons,
          alternatives:
            tied.length > 1
              ? tied
                  .filter((c) => c.templateId !== typed.item.templateId)
                  .map((c) => `${c.name} (sama dekat, selisih ${c.distance} m²)`)
              : undefined,
        },
        missing,
        clarification: null,
        candidates,
      };
    }

    // Tanpa kecocokan template bertipe.
    if (hasBasis) {
      return {
        spec,
        route: 'spec',
        templateMatch: null,
        templateFits: false,
        needsCard: false,
        recommendation: {
          method: 'spec',
          reasons: [
            'Tidak ada template terdaftar yang cocok dengan spesifikasi ini — dihitung parametrik dari spesifikasi Anda (bukan dipaksakan ke template terdekat).',
          ],
        },
        missing,
        clarification: null,
        candidates: [],
      };
    }
    return {
      spec,
      route: 'clarify',
      templateMatch: null,
      templateFits: false,
      needsCard: false,
      recommendation: {
        method: 'custom',
        reasons: ['Basis terukur (luas/dimensi) belum ada — klarifikasi dulu sebelum generate.'],
      },
      missing,
      clarification,
      candidates: [],
    };
  }

  /* ---- 3. Non-rumah: katalog universal ---- */
  const uni = evaluateUniversal(text);
  return {
    spec,
    route: uni.route,
    templateMatch: null,
    templateFits: false,
    needsCard: false,
    recommendation: uni.recommendation,
    missing,
    // Klarifikasi universal ditangani alur universal sendiri (missing
    // kritis); di sini hanya basis rumah yang diklarifikasi.
    clarification: null,
    candidates: uni.candidates,
    forcedTemplateId: uni.forcedTemplateId,
  };
}

/* ------------------------------------------------------------------ */
/* Alur penuh: evaluasi + generate kanonis                             */
/* ------------------------------------------------------------------ */

/**
 * Jalankan alur intent-first PENUH: evaluasi + generate via mesin
 * kanonis (template/spec). Spek disimpan sebagai spek aktif untuk
 * koreksi lanjutan. Rute ded/clarify/universal/custom tidak
 * meng-generate di sini — pemanggil (registry) merutekannya ke
 * intake DED / klarifikasi / universalResultFor / ringkasan.
 */
export function runRabIntentFlow(
  rawText: string,
  opts?: EvaluateRabIntentOptions,
): RabIntentFlowResult {
  const evaluation = evaluateRabIntent(rawText, opts);
  setLastRabIntentSpec(evaluation.spec);
  let built: DirectRabResult | null = null;
  if (evaluation.route === 'template' && evaluation.templateFits) {
    built = buildDirectRab(rawText);
  } else if (evaluation.route === 'spec') {
    built = buildSpecRab(rawText, {
      skipTemplateGuard: true,
      intentSpec: evaluation.spec,
    });
  }
  return { evaluation, built };
}

/**
 * Koreksi lanjutan atas spek yang sedang berjalan: gabungkan lewat
 * mergeRabIntentSpec (hanya field yang disebut koreksi yang berubah),
 * lalu evaluasi ulang terhadap spek gabungan. Tanpa spek aktif,
 * perlakukan sebagai permintaan baru.
 */
export function continueRabIntent(
  text: string,
  opts?: { hijacked?: boolean },
): RabIntentEvaluation {
  const prev = lastRabIntentSpec;
  if (!prev) return evaluateRabIntent(text, opts);
  const merged = mergeRabIntentSpec(prev, text);
  const evaluation = evaluateRabIntent(merged.rawText, {
    spec: merged,
    hijacked: opts?.hijacked,
  });
  setLastRabIntentSpec(evaluation.spec);
  return evaluation;
}

/** Label Indonesia untuk satu field hilang (re-export penolong tes/UI). */
export { specFieldLabel };

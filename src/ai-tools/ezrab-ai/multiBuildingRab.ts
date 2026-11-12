/**
 * multiBuildingRab.ts — KOMPOSISI RAB PER GEDUNG (Phase 5 Gate 2 / 5B,
 * direktif master owner 2026-11-12 11:45 WIB §4).
 *
 * Desain owner: satu proyek, satu RAB terkonsolidasi yang memuat seksi
 * per gedung yang dihitung independen + shared works. Modul ini MURNI
 * (fungsi tanpa efek samping) dan hanya MENGKOMPOSISI mesin yang sudah
 * ada — tidak ada engine RAB kedua, tidak ada aritmetika baru:
 *
 *  - `specForBuilding` menurunkan spek per gedung dari spek proyek
 *    (klon + lantai/dimensi gedung itu) untuk dipakai `mapSpecToParams`
 *    / `pickTemplateForScope` / `partIssues` yang sudah ada;
 *  - `SHARED_WORKS_SCOPE_IDS` menandai cakupan yang dihitung SEKALI
 *    di tingkat proyek (site prep, jalan akses, drainase, pagar,
 *    utilitas bersama) — tidak pernah diduplikasi per gedung;
 *  - `parseBuildingRevision` mem-parse revisi beralamat gedung
 *    ("gedung B jadi 4 lantai") untuk `reviseUniversalDraft`;
 *  - `checkBuildingQto` memeriksa item satu gedung terhadap dimensi
 *    gedung ITU lewat `qtoBridge` (aritmetika QTO tidak diubah).
 *
 * Aturan kejujuran yang ditegakkan di sini:
 *  - dimensi/lantai gedung yang hilang TIDAK PERNAH diisi dari spek
 *    proyek (yang adalah data gedung LAIN) — tetap null, dan gedung
 *    tanpa basis ukuran tidak mendapat part (ditandai eksplisit);
 *  - luas lahan TIDAK PERNAH diatribusikan ke satu gedung (proyek).
 */

import type { UniversalSpec, UniversalDraft, DraftPart } from './universalRab';
import type { BuildingModel } from './multiBuilding';
import {
  checkQtoAgainstUserDimensions,
  type QtoCheck,
  type QtoItemLike,
} from './qtoBridge';

/* ------------------------------------------------------------------ */
/* Klasifikasi cakupan: gedung vs shared works vs tingkat proyek       */
/* ------------------------------------------------------------------ */

/**
 * Cakupan yang, pada draft multi-gedung, dihitung SEKALI sebagai
 * Shared Project Works (direktif §4): site prep (tanah), jalan akses
 * (jalan), drainase (drainase), pagar/halaman (lanskap), dan sanitasi
 * bersama — septic/IPAL komunal melayani tapak, bukan satu gedung.
 *
 * Yang SENGAJA tidak masuk: 'mep' (instalasi per gedung — bukan
 * utilitas bersama) dan scope komponen ('pondasi', 'struktur',
 * 'atap', 'finishing') — semuanya dihitung sekali di tingkat proyek
 * dengan peringatan eksplisit (bukan per gedung, bukan shared works).
 */
export const SHARED_WORKS_SCOPE_IDS: ReadonlySet<string> = new Set([
  'tanah',
  'jalan',
  'drainase',
  'lanskap',
  'sanitasi',
]);

export function isSharedWorksScope(scopeId: string): boolean {
  return SHARED_WORKS_SCOPE_IDS.has(scopeId);
}

/** Label seksi shared works di pesan draft & payload push. */
export const SHARED_WORKS_LABEL = 'Pekerjaan Bersama (Shared Works)';

/* ------------------------------------------------------------------ */
/* Spek per gedung (turunan deterministik dari spek proyek)            */
/* ------------------------------------------------------------------ */

const MATERIAL_WORDS = [
  'beton', 'aspal', 'hotmix', 'paving', 'baja ringan', 'genteng', 'keramik',
  'granit', 'bata ringan', 'bata merah', 'u-ditch', 'box culvert', 'kayu',
  'gypsum', 'aluminium', 'pvc', 'galvanis', 'ready mix', 'precast', 'pracetak',
  'spandek', 'galvalum', 'zincalume',
];
const EXTRA_WORDS = ['drainase', 'pagar', 'trotoar', 'kanstin', 'marka', 'pju', 'lampu'];

/**
 * Turunkan spek SATU gedung dari spek proyek. Aturan (inti CHAT-03):
 *  - lantai/dimensi/luas = milik gedung ini SAJA; bila gedung tidak
 *    menyebutkannya, nilainya null (TIDAK diisi dari spek proyek —
 *    spek proyek membawa data gedung PERTAMA, dan mengisinya ke gedung
 *    lain adalah tebakan silang-gedung);
 *  - luas lahan & cakupan tapak = null (lahan adalah milik proyek,
 *    bukan satu gedung);
 *  - rawText = span teks milik gedung ini (bila ada) agar penskoran
 *    template memakai kata-kata gedung itu sendiri; kata kunci
 *    material/lingkup dihitung ulang dari span itu;
 *  - budgetCap, lokasi, dan cakupan diwarisi dari proyek (tingkat
 *    proyek — bukan per gedung).
 */
export function specForBuilding(projectSpec: UniversalSpec, building: BuildingModel): UniversalSpec {
  const rawText = building.spanText ?? building.sourceText ?? projectSpec.rawText;
  const lower = rawText.toLowerCase();
  const footprintM2 =
    building.lengthM != null && building.widthM != null
      ? Math.round(building.lengthM * building.widthM * 100) / 100
      : (building.buildingAreaM2 ?? null);
  return {
    ...projectSpec,
    rawText,
    floors: building.floors,
    floorsExplicit: building.floors != null,
    footprintM2,
    landAreaM2: null,
    coveragePct: null,
    // KONVENSI SISI (Gate 2): BuildingModel menyimpan URUTAN TULIS
    // (lengthM = angka pertama, mis. '15 x 10' → lengthM 15), sedangkan
    // UniversalSpec memakai konvensi rabNeeds (buildingLengthM = angka
    // KEDUA — '15 x 10' → buildingLengthM 10, buildingWidthM 15).
    // Penyeberangan model→spek di sini DITUKAR agar part.spec konsisten
    // dengan spek proyek; luas (yang dipakai template) tidak berubah.
    buildingWidthM: building.lengthM,
    buildingLengthM: building.widthM,
    areaM2: footprintM2,
    lengthM: building.widthM,
    widthM: building.lengthM,
    // Ukuran proyek-level lain (bentang/tebal/volume/jumlah) tidak
    // diatribusikan ke satu gedung — bisa milik gedung lain.
    spanM: null,
    heightM: null,
    thicknessCm: null,
    volumeM3: null,
    count: null,
    materialKeywords: MATERIAL_WORDS.filter((w) => lower.includes(w)),
    extraKeywords: EXTRA_WORDS.filter((w) => lower.includes(w)),
    // Asumsi/fungsi proyek-level dipertahankan apa adanya (label fungsi
    // per gedung belum terstruktur — lihat batasan di laporan Gate 2).
    understandingFlags: [...projectSpec.understandingFlags],
  };
}

/**
 * Apakah gedung ini punya basis ukuran untuk satu part 'gedung'?
 * Aturan yang sama dengan `scopeMeasureAvailable` untuk cakupan gedung
 * (luas ATAU lantai): gedung berlantai tanpa dimensi tetap bisa
 * dihitung (luas default template, terlabel asumsi — perilaku yang
 * sama dengan spek tunggal); gedung tanpa keduanya TIDAK mendapat part.
 */
export function buildingHasMeasureBasis(building: BuildingModel): boolean {
  if (building.floors != null) return true;
  if (building.buildingAreaM2 != null) return true;
  if (building.lengthM != null && building.widthM != null) return true;
  return false;
}

/** Alasan eksplisit bila gedung tidak punya basis ukuran (untuk pesan). */
export function buildingMissingBasisReason(building: BuildingModel): string {
  const missing: string[] = [];
  if (building.floors == null) missing.push('jumlah lantai');
  if (building.lengthM == null || building.widthM == null) missing.push('dimensi (panjang × lebar)');
  if (building.buildingAreaM2 == null) missing.push('luas bangunan');
  return `${building.label}: ${missing.join(', ')} belum diketahui — belum dihitung (tidak ditebak).`;
}

/* ------------------------------------------------------------------ */
/* Revisi beralamat gedung ("gedung B jadi 4 lantai")                  */
/* ------------------------------------------------------------------ */

export interface BuildingRevisionPatch {
  /** Id gedung target ('gedung-b', 'gedung-gudang'). */
  buildingId: string;
  /** Label tampilan gedung target (untuk pesan). */
  label: string;
  floors?: number;
  lengthM?: number;
  widthM?: number;
  buildingAreaM2?: number;
  /** Fungsi baru ('gudang', 'kantor', …) — memicu pilih-ulang template. */
  functionWord?: string;
  /** Ringkasan perubahan untuk pesan revisi. */
  summary: string;
}

/** Kata fungsi yang dapat menjadi fungsi baru satu gedung. */
const FUNCTION_WORDS = [
  'kantor', 'gudang', 'sekolah', 'apartemen', 'hotel', 'masjid', 'pabrik',
  'mall', 'ruko', 'rumah sakit', 'klinik', 'villa', 'kos',
];

/**
 * Parse revisi yang dialamatkan ke SATU gedung. Mengembalikan null bila
 * pesan bukan revisi beralamat gedung (pemanggil memakai jalur lain).
 *
 * Bentuk yang dikenali (urut prioritas — lantai dulu, lalu fungsi,
 * lalu dimensi/luas):
 *  - "gedung B jadi/menjadi 4 lantai" / "ubah gedung B jadi 4 lantai";
 *  - "gedung B jadi gudang" (fungsi — kata fungsi yang dikenal);
 *  - "gedung B 14 x 9 m" / "ubah ukuran gedung B menjadi 14 x 9 m";
 *  - "gedung B luas 120 m2".
 *
 * Nama gedung: huruf ("gedung B") atau fungsi ("gudang", "kantor").
 * Angka di luar rentang wajar (lantai 1–100, sisi 0,1–10.000 m, luas
 * 1–1.000.000 m²) ditolak sebagai "bukan revisi gedung" (null) agar
 * tidak pernah diterapkan setengah-setengah.
 */
export function parseBuildingRevision(text: string): BuildingRevisionPatch | null {
  const t = ` ${(text || '').toLowerCase()} `;
  // Cari penyebutan gedung: "gedung B" / "bangunan A" / "gudang" / "kantor".
  const named = t.match(/(?:gedung|bangunan|blok|tower|menara)\s+([a-z])\b/);
  const funcOnly = named
    ? null
    : t.match(/\b(gudang|kantor|sekolah|apartemen|hotel|masjid|pabrik|mall|ruko)\b/);
  if (!named && !funcOnly) return null;
  const buildingId = named
    ? `gedung-${named[1]}`
    : `gedung-${(funcOnly as RegExpMatchArray)[1]}`;
  const label = named
    ? `Gedung ${named[1].toUpperCase()}`
    : (funcOnly as RegExpMatchArray)[1].charAt(0).toUpperCase() +
      (funcOnly as RegExpMatchArray)[1].slice(1);
  const num = (s: string): number => parseFloat(s.replace(',', '.'));

  // 1. Lantai — GATE 3 (5C): angka sesudah "jadi/menjadi" DIUTAMAKAN.
  //    "Gedung B dari 2 lantai jadi 3 lantai" menyebut lantai LAMA (2)
  //    sebelum lantai BARU (3); pola lama (angka pertama + "lantai")
  //    akan menerapkan 2 — revisi yang salah. Pola jadi/menjadi
  //    dicoba dulu; pola lama hanya fallback bila tidak ada jadi/menjadi.
  const floorsTargetM = t.match(/(?:jadi|menjadi)\s*(\d+)\s*lantai/);
  if (floorsTargetM) {
    const floors = Number(floorsTargetM[1]);
    if (Number.isFinite(floors) && floors >= 1 && floors <= 100) {
      return { buildingId, label, floors, summary: `${label} menjadi ${floors} lantai` };
    }
    return null;
  }
  // 1b. Lantai: "gedung B jadi 4 lantai" / "gedung B 4 lantai" (sesudah
  //    kata revisi) — angka lantai harus disebut bersama kata "lantai".
  const floorsM = t.match(/(?:gedung|bangunan|blok|tower|menara)\s+[a-z]\b[^.]{0,60}?(\d+)\s*lantai/)
    ?? t.match(/\b(?:gudang|kantor|sekolah|apartemen|hotel|masjid|pabrik|mall|ruko)\b[^.]{0,60}?(\d+)\s*lantai/);
  if (floorsM) {
    const floors = Number(floorsM[1]);
    if (Number.isFinite(floors) && floors >= 1 && floors <= 100) {
      return { buildingId, label, floors, summary: `${label} menjadi ${floors} lantai` };
    }
    return null;
  }
  // 2. Fungsi: "gedung B jadi gudang" (kata fungsi sesudah jadi/menjadi).
  const fnM = t.match(/(?:jadi|menjadi|ubah\s+(?:menjadi|ke)?\s*)\s*(kantor|gudang|sekolah|apartemen|hotel|masjid|pabrik|mall|ruko|rumah sakit|klinik|villa|kos)\b/);
  if (fnM) {
    const fn = fnM[1];
    if (FUNCTION_WORDS.includes(fn)) {
      return {
        buildingId,
        label,
        functionWord: fn,
        summary: `${label} diubah fungsinya menjadi ${fn}`,
      };
    }
  }
  // 3. Dimensi: "gedung B 14 x 9 m" (pasangan A x B sesudah nama gedung,
  //    tanpa melewati penyebutan gedung lain).
  const dimsM = t.match(/(?:gedung|bangunan|blok|tower|menara)\s+[a-z]\b(?:(?!(?:gedung|bangunan|blok|tower|menara))[^.]){0,80}?(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/)
    ?? t.match(/\b(?:gudang|kantor|sekolah|apartemen|hotel|masjid|pabrik|mall|ruko)\b(?:(?!(?:gedung|bangunan|blok|tower|menara))[^.]){0,80}?(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/);
  if (dimsM) {
    const a = num(dimsM[1]);
    const b = num(dimsM[2]);
    if (Number.isFinite(a) && Number.isFinite(b) && a > 0.1 && b > 0.1 && a <= 10000 && b <= 10000) {
      return {
        buildingId,
        label,
        lengthM: a,
        widthM: b,
        buildingAreaM2: Math.round(a * b * 100) / 100,
        summary: `${label} ukurannya menjadi ${a} m × ${b} m`,
      };
    }
    return null;
  }
  // 4. Luas: "gedung B luas 120 m2".
  const areaM = t.match(/(?:gedung|bangunan|blok|tower|menara)\s+[a-z]\b[^.]{0,60}?luas\s*(?:bangunan\s*)?(\d+(?:[.,]\d+)?)\s*m/);
  if (areaM) {
    const area = num(areaM[1]);
    if (Number.isFinite(area) && area >= 1 && area <= 1000000) {
      return { buildingId, label, buildingAreaM2: area, summary: `${label} luasnya menjadi ${area} m²` };
    }
    return null;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* QTO per gedung (jembatan — aritmetika QTO tidak diubah)             */
/* ------------------------------------------------------------------ */

/** Item satu part sebagai input jembatan QTO. */
export function partItemsAsQto(part: DraftPart): QtoItemLike[] {
  return part.generation.items
    .filter((it) => !part.removedKeys.includes(`${it.description.trim().toLowerCase()}|${it.unit}`))
    .map((it) => ({ description: it.description, quantity: it.volume, unit: it.unit }));
}

/**
 * Periksa item-item SATU gedung terhadap dimensi gedung ITU (bukan
 * dimensi proyek/gedung lain). Mengembalikan hasil `qtoBridge` apa
 * adanya — CANNOT_CHECK untuk item yang tidak dapat diturunkan dari
 * dimensi adalah hasil yang sah, bukan kesalahan.
 */
export function checkBuildingQto(draft: UniversalDraft, building: BuildingModel): QtoCheck[] {
  const parts = draft.parts.filter((p) => p.buildingId === building.id);
  const items = parts.flatMap((p) => partItemsAsQto(p));
  if (items.length === 0) return [];
  return checkQtoAgainstUserDimensions(items, {
    lengthM: building.lengthM,
    widthM: building.widthM,
    buildingAreaM2: building.buildingAreaM2,
    floors: building.floors,
  });
}

/** Ringkasan hitungan verdict QTO per seksi (untuk pesan draft). */
export function summarizeQtoChecks(checks: QtoCheck[]): {
  total: number;
  ok: number;
  mismatch: number;
  missing: number;
  assumption: number;
  cannotCheck: number;
  unitMismatch: number;
} {
  const s = { total: checks.length, ok: 0, mismatch: 0, missing: 0, assumption: 0, cannotCheck: 0, unitMismatch: 0 };
  for (const c of checks) {
    if (c.verdict === 'OK') s.ok++;
    else if (c.verdict === 'MISMATCH') s.mismatch++;
    else if (c.verdict === 'MISSING') s.missing++;
    else if (c.verdict === 'ASSUMPTION') s.assumption++;
    else if (c.verdict === 'CANNOT_CHECK') s.cannotCheck++;
    else if (c.verdict === 'UNIT_MISMATCH') s.unitMismatch++;
  }
  return s;
}

/* ------------------------------------------------------------------ */
/* GELOMBANG 2 (§17.3) — agregasi penekanan atap multi-gedung (murni)  */
/*                                                                     */
/* Aturan agregasi (konsisten dengan aturan single-building Gate 5):   */
/* part atap tingkat proyek ditekan HANYA bila ≥1 gedung mendapat      */
/* part DAN SETIAP gedung yang mendapat part tercakup atap. Kasus      */
/* campuran (sebagian tercakup) → part DIPERTAHANKAN (konservatif —    */
/* tidak pernah menghilangkan cakupan) dengan peringatan yang          */
/* menyebut gedung mana yang sudah tercakup. Gedung tanpa basis        */
/* ukuran (tanpa part) tidak dihitung.                                 */
/*                                                                     */
/* Cakupan di sini LEVEL-AWARE: gedung dihitung tercakup HANYA bila    */
/* template terpilihnya mendeklarasikan komponen atap yang BENAR-      */
/* BENAR ter-generate di PROFESSIONAL (level draft). Komponen          */
/* COMPREHENSIVE-opsional yang tidak pernah muncul di draft TIDAK      */
/* dihitung sebagai cakupan — tanpanya, penekanan akan menghilangkan   */
/* seluruh pekerjaan atap bagi pengguna yang justru menyebut atap.     */
/* ------------------------------------------------------------------ */

/** Cakupan atap SATU gedung (diisi pra-pemeriksaan di universalRab —
 *  modul ini tidak mengimpor mesin pick/generate agar tetap murni). */
export interface BuildingRoofCoverage {
  buildingId: string;
  label: string;
  templateId: string | null;
  templateName: string | null;
  covered: boolean;
  coveringComponent: string | null;
  /** Material atap yang disebut span teks gedung ini (bila ada). */
  mentionedMaterial: string | null;
  /** Override SELECT roof_material dari span teks gedung ini. */
  materialOverride: { paramKey: string; value: string } | null;
  /** true bila material disebut tetapi TIDAK ditawarkan template gedung ini. */
  materialNotOffered: boolean;
}

export interface MultiBuildingRoofSuppression {
  /** true bila part atap tingkat proyek harus ditekan. */
  suppress: boolean;
  /** Cakupan per gedung (hanya gedung yang mendapat part). */
  coverages: BuildingRoofCoverage[];
  /** true bila SEBAGIAN gedung tercakup dan sebagian tidak. */
  mixed: boolean;
  /** Override SELECT roof_material per gedung (id gedung → override). */
  overridesByBuilding: Record<string, { paramKey: string; value: string }>;
}

export function aggregateMultiBuildingRoofSuppression(
  coverages: BuildingRoofCoverage[],
): MultiBuildingRoofSuppression {
  const overridesByBuilding: Record<string, { paramKey: string; value: string }> = {};
  for (const c of coverages) {
    // Override hanya bermakna bila gedung itu tercakup atap (ada varian
    // atap yang divariasikan); gedung tak tercakup ditangani part atap
    // tingkat proyek yang dipertahankan.
    if (c.materialOverride && c.covered) overridesByBuilding[c.buildingId] = c.materialOverride;
  }
  if (coverages.length === 0) {
    return { suppress: false, coverages, mixed: false, overridesByBuilding };
  }
  const coveredCount = coverages.filter((c) => c.covered).length;
  const allCovered = coveredCount === coverages.length;
  return {
    suppress: allCovered,
    coverages,
    mixed: coveredCount > 0 && !allCovered,
    overridesByBuilding,
  };
}

/**
 * multiBuilding.ts — MODEL MULTI-GEDUNG (AI Intelligence Overhaul
 * Fase 4 — Construction Intelligence, CHAT-03).
 *
 * Akar CHAT-03: konteks menyimpan `floors` TUNGGAL, sehingga jumlah
 * lantai dua bangunan runtuh jadi satu angka. Modul ini menyimpan
 * bangunan PER BANGUNAN: tiap bangunan punya identitas, jumlah lantai,
 * fungsi per lantai, dan dimensinya sendiri. Revisi satu bangunan
 * TIDAK PERNAH menghapus/menimpa bangunan lain (upsert per id).
 *
 * Modul ini MURNI (fungsi tanpa efek samping). Satu-satunya jembatan
 * ke konteks adalah `applyBuildingsToContext` yang dipakai
 * `extractUniversalContext` — `ctx.floors` (tunggal, warisan) tetap
 * dipertahankan sebagai lantai bangunan UTAMA agar perilaku lama yang
 * membaca `floors` tidak berubah; kebenaran per bangunan ada di
 * `ctx.buildings`.
 *
 * Batasan jujur: parser hanya menangkap pola eksplisit ("gedung A
 * 3 lantai", "bangunan 1 … bangunan 2 …", "2 gedung"). Bila pengguna
 * menyebut bangunan tanpa jumlah lantai, bangunan tercatat dengan
 * `floors: null` (dinyatakan belum diketahui — TIDAK ditebak).
 */

import type { UniversalIntakeContext } from './universalIntake';
import { stripLandPhrases } from './rabNeeds';

export interface BuildingFloorFunction {
  floor: number;
  functionLabel: string;
}

export interface BuildingModel {
  /** Id stabil per proyek: 'gedung-a', 'gedung-b', atau 'bangunan-1'. */
  id: string;
  /** Label tampilan ("Gedung A", "Gudang", "Bangunan 1"). */
  label: string;
  /** Kategori intake bila diketahui (id SubcategoryDef) — null bila belum. */
  categoryId: string | null;
  /** Jumlah lantai bangunan ini — null = belum diketahui (jangan ditebak). */
  floors: number | null;
  /** Fungsi per lantai bangunan ini (bukan global). */
  floorFunctions: BuildingFloorFunction[];
  lengthM: number | null;
  widthM: number | null;
  buildingAreaM2: number | null;
  /** Catatan asal (frasa pengguna yang melahirkan bangunan ini). */
  sourceText: string | null;
  /**
   * GATE 2 (5B) — segmen teks milik bangunan ini: dari penyebutan
   * pertamanya sampai penyebutan bangunan berikutnya (atau akhir teks),
   * dipangkas 240 karakter. Dipakai `specForBuilding` sebagai rawText
   * per gedung agar penskoran template memakai kata-kata gedung itu
   * sendiri (bukan teks proyek utuh). Opsional — model lama tanpa
   * medan ini tetap valid; null = tidak diketahui.
   */
  spanText?: string | null;
}

export function emptyBuilding(id: string, label: string): BuildingModel {
  return {
    id,
    label,
    categoryId: null,
    floors: null,
    floorFunctions: [],
    lengthM: null,
    widthM: null,
    buildingAreaM2: null,
    sourceText: null,
  };
}

export function cloneBuildings(buildings: BuildingModel[] | undefined | null): BuildingModel[] {
  return (buildings ?? []).map((b) => ({
    ...b,
    floorFunctions: b.floorFunctions.map((f) => ({ ...f })),
  }));
}

/**
 * Upsert per id: bangunan yang sudah ada dipertahankan (medan yang
 * tidak disebut di patch TIDAK ditimpa null); bangunan baru ditambah.
 * Urutan dipertahankan (yang sudah ada dulu, baru di akhir).
 *
 * GATE 2 (5B) — isi slot generik: bangunan bernama yang BARU mengisi
 * satu placeholder hitungan ("2 gedung" → bangunan-1/2) bila ada —
 * tanpa ini alur terpandu menggandakan gedung (2 generik + 2 bernama
 * = 4 model untuk 2 gedung; tertangkap E2E Gate 2 Run D). Placeholder
 * yang sudah berisi data (punya basis ukuran) tidak pernah dibuang;
 * yang dibuang adalah placeholder TERAKHIR agar penomoran sisa tetap
 * rapat (bangunan-1, bangunan-2, …). Revisi (id sudah ada) tidak
 * pernah membuang placeholder.
 */
/** Id placeholder hitungan ("2 gedung" → bangunan-1, bangunan-2). */
function isGenericBuildingId(id: string): boolean {
  return /^bangunan-\d+$/.test(id);
}

export function upsertBuilding(
  buildings: BuildingModel[],
  patch: Partial<BuildingModel> & { id: string; label?: string },
): BuildingModel[] {
  const next = cloneBuildings(buildings);
  const idx = next.findIndex((b) => b.id === patch.id);
  if (idx < 0) {
    const created = emptyBuilding(patch.id, patch.label ?? patch.id);
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined && v !== null) (created as unknown as Record<string, unknown>)[k] = v;
    }
    next.push(created);
    if (!isGenericBuildingId(patch.id)) {
      for (let gi = next.length - 1; gi >= 0; gi--) {
        const g = next[gi];
        if (isGenericBuildingId(g.id) && g.floors == null && g.buildingAreaM2 == null && g.lengthM == null && g.widthM == null) {
          next.splice(gi, 1);
          break;
        }
      }
    }
    return next;
  }
  const target = next[idx];
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'id' || v === undefined || v === null) continue;
    if (k === 'floorFunctions' && Array.isArray(v)) {
      target.floorFunctions = (v as BuildingFloorFunction[]).map((f) => ({ ...f }));
      continue;
    }
    (target as unknown as Record<string, unknown>)[k] = v;
  }
  if (patch.label) target.label = patch.label;
  return next;
}

/** Ubah lantai SATU bangunan; bangunan lain utuh (identitas + lantainya). */
export function updateBuildingFloors(
  buildings: BuildingModel[],
  buildingId: string,
  floors: number,
): BuildingModel[] {
  return upsertBuilding(buildings, { id: buildingId, floors });
}

export function buildingById(buildings: BuildingModel[], id: string): BuildingModel | null {
  return buildings.find((b) => b.id === id) ?? null;
}

/* ------------------------------------------------------------------ */
/* Parser deterministik dari teks pengguna                             */
/* ------------------------------------------------------------------ */

const BUILDING_WORD = '(?:gedung|bangunan|blok|tower|menara)';
const LETTER_ID = '([A-Za-z])';

/** "gedung A 3 lantai" / "bangunan utama 4 lantai" / "gudang 1 lantai".
 * GATE 2 (5B): segmen dimensi opsional di antara nama dan lantai
 * ("gedung A 15 x 10 m 3 lantai") — tanpa ini frasa dimensi-dulu
 * tidak ter-parse sama sekali. Grup tangkap TIDAK berubah (1=huruf,
 * 2=lantai) agar pemanggil lama tidak bergeser. */
const NAMED_FLOORS_RE = new RegExp(
  `${BUILDING_WORD}\\s+(?:${LETTER_ID}\\s+|utama\\s+|a\\s+|b\\s+)?(?:\\d+(?:[.,]\\d+)?\\s*[x×]\\s*\\d+(?:[.,]\\d+)?\\s*m\\s*)?(\\d+)\\s*lantai`,
  'gi',
);
/** Pasangan dimensi "A x B" (pola yang sama dengan rabNeeds). */
const DIM_PAIR_RE = /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/;
const NUM_DIM = (s: string): number => parseFloat(s.replace(',', '.'));

/**
 * GATE 2 (5B) — satu penyebutan bangunan di teks (bisa beberapa per
 * bangunan yang sama: penyebutan awal + revisi + penyebutan dimensi).
 * Penggabungan memakai semantik koreksi: penyebutan TERAKHIR menang
 * untuk lantai/dimensi (konsisten dengan aturan budget last-match),
 * label pertama dipertahankan.
 */
interface BuildingMention {
  id: string;
  label: string;
  floors: number | null;
  /** Indeks awal penyebutan di teks (untuk batas span). */
  index: number;
  sourceText: string;
}

/**
 * Parse bangunan dari teks. Mengembalikan daftar bangunan yang
 * terdeteksi (bisa kosong). Aturan:
 *  - tiap "gedung <huruf> N lantai" / "gedung <nama> N lantai" = satu bangunan;
 *  - "N gedung" tanpa nama = N bangunan generik (Bangunan 1..N), lantai null;
 *  - GATE 2 (5B): hitungan + nama dalam satu teks digabung per slot —
 *    gedung bernama MENGISI slot hitungan ("2 gedung, Gedung A …" =
 *    Gedung A + 1 generik, bukan 1 atau 3); bila bernama ≥ hitungan,
 *    hitungan terpenuhi;
 *  - bila hanya disebut SATU bangunan tanpa pola multi, kembalikan [] —
 *    bangunan tunggal tetap diwakili `ctx.floors` warisan (bukan model ini).
 *  - GATE 2 (5B): dimensi "A x B" di segmen milik satu bangunan
 *    (dari penyebutannya sampai penyebutan bangunan berikutnya)
 *    menjadi lengthM/widthM/buildingAreaM2 bangunan ITU — frasa lahan
 *    dibuang dulu (aturan yang sama dengan spek tunggal); dimensi
 *    bangunan lain tidak pernah "bocor" ke bangunan ini;
 *  - penyebutan berulang bangunan yang sama digabung (revisi "gedung A
 *    jadi 4 lantai" MENGGANTIKAN lantai lama, bukan dibuang — perilaku
 *    Fase 4 yang membuang revisi karena dedup first-wins diperbaiki);
 *  - penyebutan dimensi saja ("gedung A 15 x 10 m", tanpa lantai)
 *    memperbarui dimensi bangunan bernama itu (lantai tak tersentuh)
 *    — dibutuhkan alur terpandu saat pengguna menyebut dimensi
 *    sesudah lantai; penyebutan dimensi TANPA nama diabaikan (ambigu).
 */
export function parseBuildingsFromText(text: string): BuildingModel[] {
  const raw = (text || '').trim();
  if (!raw) return [];
  const lower = ` ${raw.toLowerCase()} `;
  const mentions: BuildingMention[] = [];
  let unnamedCount = 0;

  const pushMention = (m: BuildingMention): void => {
    mentions.push(m);
  };

  // 1. Pola bernama: "gedung A 3 lantai", "bangunan B 2 lantai",
  //    "gedung A 15 x 10 m 3 lantai" (dimensi dulu, GATE 2).
  for (const m of lower.matchAll(NAMED_FLOORS_RE)) {
    const letter = (m[1] ?? '').toUpperCase();
    const floors = Number(m[2]);
    if (!Number.isFinite(floors) || floors < 1 || floors > 100) continue;
    const id = letter ? `gedung-${letter.toLowerCase()}` : `gedung-${++unnamedCount}`;
    const label = letter ? `Gedung ${letter}` : `Gedung ${unnamedCount}`;
    // Kata fungsi sebelum angka lantai? ("gedung kantor A 3 lantai")
    const before = lower.slice(Math.max(0, (m.index ?? 0) - 40), m.index ?? 0);
    const fnMatch = before.match(/(kantor|gudang|sekolah|rumah sakit|apartemen|hotel|masjid|pabrik|mall|ruko)\s*$/);
    pushMention({
      id,
      label: fnMatch ? `${label} (${fnMatch[1]})` : label,
      floors,
      index: m.index ?? 0,
      sourceText: m[0].trim(),
    });
  }
  // 2. Pola revisi: "gedung A jadi 4 lantai" / "gedung B menjadi 2 lantai".
  const REVISION_RE = new RegExp(
    `${BUILDING_WORD}\\s+${LETTER_ID}\\s+(?:jadi|menjadi)\\s+(\\d+)\\s*lantai`,
    'gi',
  );
  for (const m of lower.matchAll(REVISION_RE)) {
    const letter = (m[1] ?? '').toUpperCase();
    const floors = Number(m[2]);
    if (!Number.isFinite(floors) || floors < 1 || floors > 100) continue;
    const id = `gedung-${letter.toLowerCase()}`;
    pushMention({ id, label: `Gedung ${letter}`, floors, index: m.index ?? 0, sourceText: m[0].trim() });
  }
  // 3. Pola "gedung utama 4 lantai dan gudang 1 lantai": nama fungsi
  //    sebagai identitas ("gedung gudang" bukan huruf) — tangkap
  //    "<fungsi> N lantai" bila belum tercakup pola bernama.
  //    GATE 2: segmen dimensi opsional sebelum lantai (konsisten
  //    dengan pola bernama).
  const FUNC_FLOORS_RE = /\b(gudang|kantor|sekolah|apartemen|hotel|masjid|pabrik|mall|ruko|rumah)\s+(?:\w+\s+){0,2}?(?:\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?\s*m\s*)?(\d+)\s*lantai/gi;
  for (const m of lower.matchAll(FUNC_FLOORS_RE)) {
    const fn = m[1];
    const floors = Number(m[2]);
    if (!Number.isFinite(floors) || floors < 1 || floors > 100) continue;
    const id = `gedung-${fn}`;
    // Jangan ganda dengan pola bernama yang frasanya sama: bila ada
    // penyebutan bernama yang dimulai di indeks yang sama (atau
    // tumpang tindih dalam 3 karakter), pola fungsi dilewati.
    if (mentions.some((x) => Math.abs(x.index - (m.index ?? 0)) <= 3)) continue;
    const label = fn.charAt(0).toUpperCase() + fn.slice(1);
    pushMention({ id, label, floors, index: m.index ?? 0, sourceText: m[0].trim() });
  }
  // 4. GATE 2 — penyebutan dimensi saja (tanpa lantai): "gedung A
  //    15 x 10 m" / "gudang 12 x 8 m". Segmen di antara nama dan
  //    pasangan dimensi TIDAK BOLEH melewati penyebutan bangunan lain
  //    (tempered token) agar dimensi gedung B tidak "bocor" ke A.
  //    Dilewati bila ada penyebutan berlantai bangunan yang sama di
  //    indeks yang sama (dimensinya sudah tercakup span penyebutan
  //    itu — mis. "gedung A 3 lantai 15 x 10 m").
  const DIMS_ONLY_RE = new RegExp(
    `${BUILDING_WORD}\\s+${LETTER_ID}\\s+(?:(?!(?:gedung|bangunan|blok|tower|menara))[^.]){0,80}?(\\d+(?:[.,]\\d+)?)\\s*[x×]\\s*(\\d+(?:[.,]\\d+)?)`,
    'gi',
  );
  for (const m of lower.matchAll(DIMS_ONLY_RE)) {
    const letter = (m[1] ?? '').toUpperCase();
    const id = `gedung-${letter.toLowerCase()}`;
    if (mentions.some((x) => x.id === id && Math.abs(x.index - (m.index ?? 0)) <= 3)) continue;
    pushMention({ id, label: `Gedung ${letter}`, floors: null, index: m.index ?? 0, sourceText: m[0].trim() });
  }
  const FUNC_DIMS_RE = /\b(gudang|kantor|sekolah|apartemen|hotel|masjid|pabrik|mall|ruko|rumah)\b(?:(?!(?:gedung|bangunan|blok|tower|menara))[^.]){0,80}?(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/gi;
  for (const m of lower.matchAll(FUNC_DIMS_RE)) {
    const fn = m[1];
    const id = `gedung-${fn}`;
    if (mentions.some((x) => x.id === id && Math.abs(x.index - (m.index ?? 0)) <= 3)) continue;
    const label = fn.charAt(0).toUpperCase() + fn.slice(1);
    pushMention({ id, label, floors: null, index: m.index ?? 0, sourceText: m[0].trim() });
  }

  // Gabung penyebutan per id (urut dokumen; penyebutan terakhir menang
  // untuk lantai; label pertama dipertahankan).
  mentions.sort((a, b) => a.index - b.index);
  const byId = new Map<string, { b: BuildingModel; firstIndex: number; spans: string[] }>();
  for (let i = 0; i < mentions.length; i++) {
    const mt = mentions[i];
    const nextIndex = i + 1 < mentions.length ? mentions[i + 1].index : lower.length;
    const span = lower.slice(mt.index, Math.max(mt.index, nextIndex)).trim();
    let entry = byId.get(mt.id);
    if (!entry) {
      entry = { b: { ...emptyBuilding(mt.id, mt.label), sourceText: mt.sourceText }, firstIndex: mt.index, spans: [] };
      byId.set(mt.id, entry);
    }
    if (mt.floors != null) {
      entry.b.floors = mt.floors;
      entry.b.sourceText = mt.sourceText;
    }
    entry.spans.push(span);
  }
  // Dimensi per gedung: pindai span-span milik gedung itu (urut
  // dokumen; pasangan TERAKHIR menang = koreksi). Frasa lahan dibuang
  // dulu agar "lahan 15 x 20 m" tidak dibaca sebagai dimensi bangunan.
  const out: BuildingModel[] = [];
  for (const entry of byId.values()) {
    let dims: { lengthM: number; widthM: number } | null = null;
    for (const span of entry.spans) {
      const clean = stripLandPhrases(span);
      const dm = clean.match(DIM_PAIR_RE);
      if (!dm) continue;
      const a = NUM_DIM(dm[1]);
      const c = NUM_DIM(dm[2]);
      if (Number.isFinite(a) && Number.isFinite(c) && a > 0 && c > 0) {
        dims = { lengthM: a, widthM: c };
      }
    }
    if (dims) {
      entry.b.lengthM = dims.lengthM;
      entry.b.widthM = dims.widthM;
      entry.b.buildingAreaM2 = Math.round(dims.lengthM * dims.widthM * 100) / 100;
    }
    // spanText = span penyebutan pertama (paling informatif: nama +
    // lantai + dimensi + kata fungsi), dipangkas 240 karakter.
    entry.b.spanText = entry.spans[0] ? entry.spans[0].slice(0, 240) : null;
    out.push(entry.b);
  }
  // 5. Hitungan eksplisit "N gedung" (N≥2): gedung bernama MENGISI
  //    slot hitungan; sisa slot menjadi bangunan generik (yang tetap
  //    ditandai hilang sampai dideskripsikan). Bila bernama ≥ hitungan,
  //    hitungan sudah terpenuhi. Tanpa ini "2 gedung, Gedung A …"
  //    kehilangan gedung keduanya (cabang lama mensyaratkan
  //    out.length === 0 sehingga hitungan diabaikan bila ada nama —
  //    dan kebalikannya di alur terpandu: hitungan + nama menjadi
  //    2N model; tertangkap E2E Gate 2 Run D).
  //    Perbaikan bug laten Fase 4: `lower.match(COUNT_RE)` dengan flag
  //    /g mengembalikan HANYA kecocokan penuh (tanpa grup tangkap),
  //    sehingga countMatch[1] selalu undefined dan "2 gedung" tanpa
  //    nama tidak pernah menghasilkan bangunan generik. Pakai regex
  //    non-global segar agar grup tangkap tersedia.
  const countMatch = lower.match(/(\d+)\s*(?:gedung|bangunan|blok|tower|menara)/i);
  if (countMatch) {
    const n = Number(countMatch[1]);
    if (Number.isFinite(n) && n >= 2 && n <= 20) {
      const missing = n - out.length;
      for (let i = 1; i <= missing; i++) {
        out.push({ ...emptyBuilding(`bangunan-${i}`, `Bangunan ${i}`), sourceText: countMatch[0].trim() });
      }
    }
  }
  // Satu bangunan bernama saja: tetap kembalikan (pemanggil memutuskan
  // apakah konteks sudah multi) — SATU bangunan eksplisit tetap model.
  return out;
}

/**
 * Terapkan hasil parse ke konteks: gabung (upsert) ke `ctx.buildings`,
 * dan sinkronkan `ctx.floors` warisan ke lantai bangunan UTAMA
 * (bangunan pertama) bila `ctx.floors` masih null. Bila tidak ada
 * bangunan terdeteksi, konteks tidak berubah.
 */
export function applyBuildingsToContext(
  ctx: UniversalIntakeContext,
  text: string,
): boolean {
  const parsed = parseBuildingsFromText(text);
  if (parsed.length === 0) return false;
  let next = cloneBuildings(ctx.buildings ?? []);
  // GATE 2 — hitungan murni ("2 gedung") adalah pernyataan TOTAL,
  // bukan tambahan: bila konteks sudah punya bangunan, hanya tambahkan
  // selisihnya (tanpa ini "Gedung A…" lalu "2 gedung" menjadi 3 model).
  // Penyebutan ulang hitungan yang sama = no-op (idempotent).
  // Penamaan eksplisit mengalahkan hitungan (3 bernama + "2 gedung"
  // tetap 3). Kasus "N gedung lagi" (tambahan eksplisit) BELUM
  // dibedakan — dicatat sebagai batasan Gate 2.
  let toApply = parsed;
  if (parsed.every((b) => isGenericBuildingId(b.id)) && next.length > 0) {
    const needed = Math.max(0, parsed.length - next.length);
    const existingIds = new Set(next.map((b) => b.id));
    toApply = parsed.filter((b) => !existingIds.has(b.id)).slice(0, needed);
  }
  for (const b of toApply) next = upsertBuilding(next, b);
  ctx.buildings = next;
  if (ctx.floors == null && next.length > 0 && next[0].floors != null) {
    ctx.floors = next[0].floors;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Format (ringkasan & builder kanonis)                                */
/* ------------------------------------------------------------------ */

export function buildingSummaryLines(buildings: BuildingModel[]): string[] {
  if (!buildings || buildings.length === 0) return [];
  const lines: string[] = ['Bangunan (per bangunan — revisi satu tidak mengubah lain):'];
  for (const b of buildings) {
    const parts: string[] = [];
    parts.push(b.floors != null ? `${b.floors} lantai` : 'jumlah lantai belum diketahui');
    if (b.floorFunctions.length) {
      parts.push(b.floorFunctions.map((f) => `Lt${f.floor}: ${f.functionLabel}`).join(', '));
    }
    if (b.lengthM != null && b.widthM != null) parts.push(`${b.lengthM} m × ${b.widthM} m`);
    if (b.buildingAreaM2 != null) parts.push(`luas ${b.buildingAreaM2} m²`);
    if (b.categoryId) parts.push(`kategori: ${b.categoryId}`);
    lines.push(`• ${b.label}: ${parts.join('; ')}.`);
  }
  return lines;
}

/** Ringkas untuk fakta intake (satu baris per bangunan). */
export function buildingFactLines(buildings: BuildingModel[]): string[] {
  return buildingSummaryLines(buildings);
}

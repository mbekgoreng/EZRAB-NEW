/**
 * EZRAB — Adapter harga kanonis untuk DED-to-RAB (owner 2026-10-27).
 * =====================================================================
 * SATU-SATUNYA jembatan antara kedua mesin DED (ded-ai-estimate &
 * ded-full-ai) dan sistem harga kanonis EZRAB. Kedua mesin TIDAK mengimpor
 * registry/resolver AHSP secara langsung — mereka hanya memanggil modul ini.
 *
 * Layanan kanonis yang dipakai ulang (tanpa duplikasi data/harga/mesin):
 * - officialAhspRepository: katalog resmi (get/search/has; karantina sudah
 *   diterapkan di dalamnya, alias kode diselesaikan di dalamnya).
 * - priceResolver2026.resolveAhspUnitPrice: komposisi biaya langsung
 *   (jumlah komponen) + daftar komponen yang belum punya harga.
 * - canonicalPriceResolver: gerbang kewajaran harga (sanity) + konfirmasi
 *   silang atas harga komposisi.
 * - canonicalUnitRegistry: normalisasi & kompatibilitas dimensi satuan.
 * - ahspQuarantine: gerbang eksplisit (pertahanan berlapis; repository
 *   sendiri sudah mengecualikan item karantina).
 *
 * ATURAN KEAMANAN (hasil kalibrasi 2026-10-27, BUKAN asumsi):
 * 1. TIDAK ADA auto-accept dari kemiripan nama. Kalibrasi membuktikan skor
 *    searchOfficialAhsp tidak diskriminatif: "plesteran dinding 1:4"
 *    mengembalikan "kantor sementara" (skor 85) di atas item plesteran yang
 *    benar, dan kueri fiktif masih mengembalikan skor 55. Karena itu:
 *    - Auto-RESOLVED HANYA lewat kode AHSP eksak yang terverifikasi di
 *      katalog, atau judul katalog yang SAMA PERSIS setelah normalisasi.
 *    - Semua hasil pencarian nama lainnya = NEEDS_REVIEW (kandidat
 *      ditampilkan, pengguna yang memilih) atau NO_MATCH.
 * 2. Komposisi PARTIAL DITOLAK. Kalibrasi membuktikan facade
 *    canonicalPriceResolver mengembalikan RESOLVED untuk 2.2.1.4.1 yang
 *    komposisinya PARTIAL 7/8 (komponen "Batu split 2/3" tanpa harga) —
 *    jumlah parsialnya (Rp843.375) TIDAK PERNAH dipakai sebagai harga.
 *    Harga diterima HANYA bila missingComponents === 0 dan
 *    totalComponents > 0.
 * 3. Total DHSP TIDAK PERNAH dipakai sebagai harga transfer. Item tanpa
 *    rincian komponen (totalComponents === 0) berstatus UNPRICED meski
 *    master punya unitPrice — memakai total DHSP sebagai harga dasar
 *    menyebabkan markup ganda saat rekap menambah overhead (keputusan
 *    owner 2026-10-27).
 * 4. Satuan harus SAMA PERSIS setelah normalisasi (m² = m2). Kompatibel
 *    dimensi saja (kg vs ton) TIDAK cukup — harga per kg bukan harga
 *    per ton; tidak ada konversi diam-diam.
 * 5. Modul ini TIDAK PERNAH memutasi registry (kandidat disalin field
 *    per field) dan TIDAK PERNAH menulis data master.
 * 6. Harga regional (SSH daerah) TIDAK diterapkan di sini: harga kanonis
 *    DED memakai biaya langsung nasional SE DJBK 47/2026. Penyesuaian
 *    regional adalah tindak lanjut terpisah, bukan default diam-diam.
 */

import { officialAhspRepository } from '../../data/nationalCostDatabase/officialAhspRepository';
import { priceResolver2026 } from '../../data/priceDatabase2026/resolver';
import { canonicalPriceResolver } from '../../engine/pricing/canonical/canonicalPriceResolver';
import { canonicalUnitRegistry } from '../../engine/pricing/canonical/canonicalUnitRegistry';
import { isQuarantined } from '../../data/nationalCostDatabase/ahspQuarantine';

export type CanonicalMatchStatus =
  | 'RESOLVED'              // Kode terverifikasi + satuan cocok + komposisi FULL
  | 'NEEDS_REVIEW'          // Kandidat ditemukan, pengguna harus memilih
  | 'INCOMPLETE_COMPONENTS' // Item katalog ada tapi komponen belum lengkap
  | 'NO_MATCH'              // Tidak ada kandidat di katalog resmi
  | 'UNIT_MISMATCH'         // Satuan item tidak cocok dengan satuan AHSP
  | 'INVALID';              // Kode tidak ada / dikarantina / ditolak gerbang

export interface CanonicalMissingComponent {
  type: string;
  code: string;
  name: string;
  unit: string;
}

export interface CanonicalCandidate {
  code: string;
  name: string;
  unit: string;
  score: number;
  /** Satuan kandidat SAMA PERSIS dengan satuan item (setelah normalisasi). */
  unitExact: boolean;
  /** Satuan kandidat se-dimensi (mis. kg vs ton) — belum tentu bisa dipakai. */
  unitCompatible: boolean;
  /** Harga biaya langsung — HANYA bila priceStatus FULL, selain itu null. */
  canonicalPrice: number | null;
  priceStatus: 'FULL' | 'PARTIAL' | 'MISSING' | 'UNPRICED';
  missingComponents: CanonicalMissingComponent[];
}

export interface CanonicalDedMatch {
  status: CanonicalMatchStatus;
  matchedCode?: string;
  matchedName?: string;
  /** Harga biaya langsung kanonis — HANYA bila status RESOLVED. */
  unitPrice: number | null;
  unit?: string;
  sourceDocument: string;
  period: string;
  candidates: CanonicalCandidate[];
  reason: string;
  missingComponents: CanonicalMissingComponent[];
  resolutionPath: string[];
}

export const CANONICAL_SOURCE_DOCUMENT = 'SE DJBK No. 47/SE/Dk/2026';
export const CANONICAL_PERIOD = '2026';

const SEARCH_LIMIT = 10;
const REVIEW_LIMIT = 6;
/** Lantai skor searchOfficialAhsp (kalibrasi: kueri fiktif = 55, hasil nyata ≥ 70). */
const SCORE_FLOOR = 60;

/** Kata generik yang diabaikan saat menilai kata kunci (bukan kata isi). */
const GENERIC_WORDS = new Set([
  'pekerjaan', 'pemasangan', 'pembuatan', 'pengadaan', 'pasangan', 'pasang',
  'dan', 'atau', 'yang', 'untuk', 'dengan', 'secara', 'pada', 'dari', 'tanpa',
  'setiap', 'sd', 's', 'd', 'uk', 'cm', 'mm', 'm', 'm1', 'm2', 'm3', 'kg', 'ton',
  'buah', 'ls', 'titik', 'lembar', 'batang', 'zak', 'unit',
]);

function normText(t: string): string {
  return String(t || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Kata isi kueri: kata bermakna (panjang > 2, bukan generik). */
function contentWords(name: string): string[] {
  return normText(name)
    .split(' ')
    .filter((w) => w.length > 2 && !GENERIC_WORDS.has(w));
}

function titleWords(title: string): Set<string> {
  return new Set(normText(title).split(' ').filter((w) => w.length > 0));
}

/** Normalisasi judul katalog: buang awalan generik + pola "1 m2/1 m3/..." agar
 *  bisa dibandingkan setara dengan nama pekerjaan DED ("Plesteran 1:4"). */
function stripCatalogPrefix(title: string): string {
  let t = normText(title);
  t = t.replace(/^(pekerjaan|pemasangan|pembuatan|pengadaan|pasangan)\s+/, '');
  t = t.replace(/^1\s+(m2|m3|m1|kg|buah|ls|titik|lembar|batang|zak)\s+/, '');
  return t.replace(/\s+/g, ' ').trim();
}

/** Normalisasi nama DED untuk perbandingan judul persis: buang awalan
 *  katalog ("Pemasangan 1 m2 ...") lalu kata generik — agar "Pemasangan
 *  1 m2 plesteran 1SP : 4PP tebal 15 mm" setara dengan judul katalognya. */
function stripDedName(name: string): string {
  return stripCatalogPrefix(name)
    .split(' ')
    .filter((w) => !GENERIC_WORDS.has(w))
    .join(' ');
}

function normUnit(u: string | null | undefined): string {
  return canonicalUnitRegistry.normalize(u || '');
}

// ---------------------------------------------------------------------------
// Penjaga spesifikasi untuk klaim kode dari MODEL (audit QA 2026-10-27).
// Kode AHSP yang valid TIDAK membuktikan spesifikasinya benar: model bisa
// mengklaim kode plesteran 1:4 untuk item 1:6, atau kode keramik 20x20
// untuk item 30x30 — dan jalur kode eksak lama akan menerimanya diam-diam
// (kode ada + satuan cocok + komponen lengkap). Karena itu klaim kode dari
// model harus lolos dua pemeriksaan tambahan sebelum RESOLVED:
//  1. Gerbang kosakata: minimal satu kata isi nama DED muncul utuh sebagai
//     kata di judul katalog (klaim "plesteran" untuk kode "bekisting"
//     tidak lolos).
//  2. Konflik spesifikasi numerik: bila KEDUA sisi menyebut rasio campuran,
//     tebal, kuat beton (notasi SAMA), atau ukuran — dan himpunannya
//     saling lepas — itu konflik pasti, bukan ketidakcocokan samar.
//     Notasi silang (K-225 vs f'c 20 MPa) TIDAK dibandingkan: tanpa tabel
//     konversi resmi, itu wilayah "tidak diketahui", bukan konflik.
// Bila salah satu gagal → NEEDS_REVIEW dengan kode klaim sebagai kandidat
// pertama (pengguna tetap bisa mengonfirmasi dengan mata terbuka).
// Konfirmasi pengguna TIDAK melewati penjaga ini: konfirmasi memakai
// resolveCanonicalCode langsung, karena konfirmasi itulah verifikasinya.
// ---------------------------------------------------------------------------

function normNumbers(text: string): string {
  return String(text || '').toLowerCase().replace(/(\d),(\d)/g, '$1.$2');
}

function extractRatios(text: string): Set<string> {
  const t = normNumbers(text).replace(/(\d+)\s*sp\s*:\s*(\d+)\s*pp/g, '$1:$2');
  const out = new Set<string>();
  const re = /(\d+(?:\s*:\s*\d+)+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) out.add(m[1].replace(/\s+/g, ''));
  return out;
}

function extractThicknessMm(text: string): Set<number> {
  const out = new Set<number>();
  const re = /tebal\s*(\d+(?:\.\d+)?)\s*(mm|cm)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normNumbers(text))) !== null) {
    out.add(Math.round((m[2] === 'cm' ? parseFloat(m[1]) * 10 : parseFloat(m[1])) * 100) / 100);
  }
  return out;
}

function extractStrengths(text: string): { fc: Set<number>; k: Set<number> } {
  const t = normNumbers(text);
  const fc = new Set<number>();
  const k = new Set<number>();
  let m: RegExpExecArray | null;
  const fcRe = /f'?\s*c\s*(\d+(?:\.\d+)?)\s*mpa/g;
  while ((m = fcRe.exec(t)) !== null) fc.add(parseFloat(m[1]));
  const kRe = /\bk[-\s]?(\d+)\b/g; // Huruf kecil: normNumbers sudah me-lowercase teks.
  while ((m = kRe.exec(t)) !== null) k.add(parseInt(m[1], 10));
  return { fc, k };
}

function extractSizes(text: string): Set<string> {
  const out = new Set<string>();
  const re = /(\d+)\s*x\s*(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normNumbers(text))) !== null) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    out.add(`${Math.min(a, b)}x${Math.max(a, b)}`);
  }
  return out;
}

function disjoint(a: Set<unknown>, b: Set<unknown>): boolean {
  return a.size > 0 && b.size > 0 && [...a].every((x) => !b.has(x));
}

/**
 * Konflik spesifikasi antara teks DED dan judul katalog, atau null bila
 * tidak ada konflik yang dapat dibuktikan. Diekspor agar dapat diuji
 * langsung (kasus K-vs-K tidak punya contoh di katalog).
 */
export function checkSpecCompatibility(dedText: string, catalogTitle: string): string | null {
  const dedRatios = extractRatios(dedText);
  const catRatios = extractRatios(catalogTitle);
  if (disjoint(dedRatios, catRatios)) {
    return `rasio campuran tidak cocok (DED ${[...dedRatios].join(', ')} vs AHSP ${[...catRatios].join(', ')})`;
  }
  const dedThick = extractThicknessMm(dedText);
  const catThick = extractThicknessMm(catalogTitle);
  if (disjoint(dedThick, catThick)) {
    return `tebal tidak cocok (DED ${[...dedThick].join(', ')} mm vs AHSP ${[...catThick].join(', ')} mm)`;
  }
  const dedStr = extractStrengths(dedText);
  const catStr = extractStrengths(catalogTitle);
  if (disjoint(dedStr.fc, catStr.fc)) {
    return `kuat beton tidak cocok (DED f'c ${[...dedStr.fc].join(', ')} MPa vs AHSP f'c ${[...catStr.fc].join(', ')} MPa)`;
  }
  if (disjoint(dedStr.k, catStr.k)) {
    return `kelas beton tidak cocok (DED K-${[...dedStr.k].join(', ')} vs AHSP K-${[...catStr.k].join(', ')})`;
  }
  const dedSizes = extractSizes(dedText);
  const catSizes = extractSizes(catalogTitle);
  if (disjoint(dedSizes, catSizes)) {
    return `ukuran tidak cocok (DED ${[...dedSizes].join(', ')} vs AHSP ${[...catSizes].join(', ')})`;
  }
  return null;
}

/** Penjaga klaim kode: kosakata + spesifikasi. Null = lolos. */
function checkClaimedCodeSpec(dedQuery: string, catalogTitle: string): string | null {
  const dedWords = contentWords(dedQuery);
  const tw = titleWords(catalogTitle);
  if (dedWords.length === 0 || !dedWords.some((w) => tw.has(w))) {
    return 'nama pekerjaan tidak mengandung kata kunci judul katalog';
  }
  return checkSpecCompatibility(dedQuery, catalogTitle);
}

function baseMatch(
  status: CanonicalMatchStatus,
  reason: string,
  path: string[],
): CanonicalDedMatch {
  return {
    status,
    unitPrice: null,
    sourceDocument: CANONICAL_SOURCE_DOCUMENT,
    period: CANONICAL_PERIOD,
    candidates: [],
    reason,
    missingComponents: [],
    resolutionPath: path,
  };
}

interface CompositionVerdict {
  price: number | null;
  priceStatus: 'FULL' | 'PARTIAL' | 'MISSING' | 'UNPRICED';
  missing: CanonicalMissingComponent[];
  resolved: number;
  total: number;
}

/** Komposisi biaya langsung + status kelengkapan. Jumlah parsial TIDAK PERNAH
 *  dikembalikan sebagai harga (price null bila tidak FULL). */
function compositionFor(item: { code: string; name: string; unit: string }): CompositionVerdict {
  const comp = priceResolver2026.resolveAhspUnitPrice(item as never);
  const missing: CanonicalMissingComponent[] = (comp.missing || []).map((m: { type: string; code: string; name: string; unit: string }) => ({
    type: m.type,
    code: m.code,
    name: m.name,
    unit: m.unit,
  }));
  if (comp.totalComponents === 0) {
    return { price: null, priceStatus: 'UNPRICED', missing, resolved: 0, total: 0 };
  }
  if (comp.missingComponents === 0) {
    return { price: comp.unitPrice, priceStatus: 'FULL', missing: [], resolved: comp.resolvedComponents, total: comp.totalComponents };
  }
  return { price: null, priceStatus: 'PARTIAL', missing, resolved: comp.resolvedComponents, total: comp.totalComponents };
}

/**
 * Jalur kode eksak: satu-satunya jalur auto-RESOLVED (selain judul persis).
 * Melewati: karantina → katalog → satuan → kelengkapan komponen → gerbang
 * kewajaran facade → konsistensi harga antar mesin.
 */
export function resolveCanonicalCode(code: string, unit: string): CanonicalDedMatch {
  const trimmed = String(code || '').trim();
  const path = [`CODE_LOOKUP:${trimmed || '(kosong)'}`];
  if (!trimmed || isQuarantined(trimmed)) {
    return baseMatch('INVALID', `Kode AHSP ${trimmed || '(kosong)'} tidak tersedia di katalog resmi (tidak ditemukan atau dikarantina).`, path);
  }
  const item = officialAhspRepository.getOfficialAhsp(trimmed);
  if (!item) {
    return baseMatch('INVALID', `Kode AHSP ${trimmed} tidak ada di katalog resmi AHSP 2026.`, [...path, 'CATALOG_MISS']);
  }
  const reqUnit = normUnit(unit);
  const itemUnit = normUnit(item.unit);
  if (reqUnit && itemUnit && reqUnit !== itemUnit) {
    const m = baseMatch(
      'UNIT_MISMATCH',
      `Satuan tidak cocok: item memakai ${unit || '(kosong)'}, AHSP ${item.code} bersatuan ${item.unit}. Harga per satuan tidak boleh dipakai lintas satuan.`,
      [...path, 'UNIT_MISMATCH'],
    );
    m.matchedCode = item.code;
    m.matchedName = item.name;
    m.unit = item.unit;
    return m;
  }
  const comp = compositionFor(item);
  if (comp.priceStatus !== 'FULL') {
    const m = baseMatch(
      'INCOMPLETE_COMPONENTS',
      comp.priceStatus === 'UNPRICED'
        ? `AHSP ${item.code} belum bisa dihargai: tidak ada rincian komponen di master. Total DHSP tidak dipakai sebagai harga transfer.`
        : `AHSP ${item.code} belum bisa dihargai penuh: ${comp.missing.length} dari ${comp.total} komponen belum punya harga. Jumlah parsial tidak pernah dipakai sebagai harga.`,
      [...path, `COMPOSITION_${comp.priceStatus}`],
    );
    m.matchedCode = item.code;
    m.matchedName = item.name;
    m.unit = item.unit;
    m.missingComponents = comp.missing;
    return m;
  }
  const canon = canonicalPriceResolver.resolve({
    code: item.code,
    name: item.name,
    unit: item.unit,
    itemType: 'AHSP',
  });
  if (canon.status !== 'RESOLVED' || canon.price == null || canon.price <= 0) {
    return baseMatch(
      'INVALID',
      `Harga kanonis ${item.code} ditolak gerbang kewajaran: ${canon.rejectionReason || canon.status}.`,
      [...path, `FACADE_${canon.status}`],
    );
  }
  if (canon.price !== comp.price) {
    return baseMatch(
      'INVALID',
      `Harga kanonis ${item.code} tidak konsisten antar mesin (facade Rp${canon.price} vs komposisi Rp${comp.price}) — ditolak.`,
      [...path, 'PRICE_INCONSISTENT'],
    );
  }
  return {
    status: 'RESOLVED',
    matchedCode: item.code,
    matchedName: item.name,
    unitPrice: canon.price,
    unit: item.unit,
    sourceDocument: CANONICAL_SOURCE_DOCUMENT,
    period: CANONICAL_PERIOD,
    candidates: [],
    reason: `AHSP ${item.code} terverifikasi di katalog resmi; harga biaya langsung (komponen ${comp.resolved}/${comp.total}, ${CANONICAL_SOURCE_DOCUMENT}).`,
    missingComponents: [],
    resolutionPath: [...path, 'COMPOSITION_FULL', 'CANONICAL_RESOLVED'],
  };
}

/** Kandidat dari pencarian nama — SELALU untuk review, tidak pernah auto-pilih. */
function searchCandidates(name: string, unit: string): CanonicalCandidate[] {
  const raw = officialAhspRepository.searchOfficialAhsp(name, {
    unit: unit || undefined,
    limit: SEARCH_LIMIT,
  });
  const words = contentWords(name);
  const reqUnit = normUnit(unit);
  const out: CanonicalCandidate[] = [];
  for (const r of raw) {
    if (r.score < SCORE_FLOOR) continue;
    const title = String((r.item as { title?: string; name?: string }).title || r.item.name || '');
    const tw = titleWords(title);
    // Gerbang kata isi: minimal satu kata bermakna kueri harus muncul utuh
    // sebagai kata di judul (bukan substring — "ada" tidak boleh cocok "pada").
    if (words.length > 0 && !words.some((w) => tw.has(w))) continue;
    const itemUnit = normUnit(r.item.unit);
    const unitExact = !!reqUnit && !!itemUnit && reqUnit === itemUnit;
    const unitCompatible = !!reqUnit && !!itemUnit
      && canonicalUnitRegistry.areDimensionallyCompatible(reqUnit, itemUnit);
    const comp = compositionFor(r.item);
    out.push({
      code: r.item.code,
      name: r.item.name,
      unit: r.item.unit,
      score: r.score,
      unitExact,
      unitCompatible,
      canonicalPrice: comp.price,
      priceStatus: comp.priceStatus,
      missingComponents: comp.missing,
    });
    if (out.length >= REVIEW_LIMIT) break;
  }
  return out;
}

export interface DedItemForMatch {
  name: string;
  unit: string;
  specification?: string;
  claimedAhspCode?: string;
}

/**
 * Resolusi satu item DED ke AHSP kanonis.
 * - claimedAhspCode (dari model / konfirmasi user): jalur kode eksak.
 * - Tanpa kode: pencarian nama → judul persis + satuan persis + FULL saja
 *   yang auto-RESOLVED; sisanya NEEDS_REVIEW (kandidat) atau NO_MATCH.
 */
export function matchDedItemToAhsp(input: DedItemForMatch): CanonicalDedMatch {
  const name = String(input.name || '').trim();
  const unit = String(input.unit || '').trim();
  const spec = String(input.specification || '').trim();
  const query = spec && !name.toLowerCase().includes(spec.toLowerCase())
    ? `${name} ${spec}`.trim()
    : name;

  if (input.claimedAhspCode) {
    const byCode = resolveCanonicalCode(input.claimedAhspCode, unit);
    if (byCode.status === 'RESOLVED') {
      // Kode valid belum tentu spesifikasinya benar — penjaga klaim model.
      const specProblem = checkClaimedCodeSpec(query, byCode.matchedName || '');
      if (!specProblem) return byCode;
      // Turunkan ke review: kode klaim jadi kandidat pertama (pengguna
      // tetap bisa mengonfirmasi dengan mata terbuka) + kandidat nama.
      const codeCandidate: CanonicalCandidate = {
        code: byCode.matchedCode || input.claimedAhspCode,
        name: byCode.matchedName || '',
        unit: byCode.unit || unit,
        score: 0, // Bukan skor pencarian — ini kode yang diklaim model.
        unitExact: true,
        unitCompatible: true,
        canonicalPrice: byCode.unitPrice,
        priceStatus: 'FULL',
        missingComponents: [],
      };
      const nameCands = name
        ? searchCandidates(query, unit).filter((c) => c.code !== codeCandidate.code)
        : [];
      const downgraded = baseMatch(
        'NEEDS_REVIEW',
        `Kode AHSP ${codeCandidate.code} diklaim model tetapi ${specProblem} — pilih secara eksplisit; tidak diterima otomatis.`,
        [...byCode.resolutionPath, 'SPEC_GUARD_REVIEW'],
      );
      downgraded.matchedCode = codeCandidate.code;
      downgraded.matchedName = codeCandidate.name;
      downgraded.unit = codeCandidate.unit;
      downgraded.candidates = [codeCandidate, ...nameCands];
      return downgraded;
    }
    // Klaim gagal — lampirkan kandidat dari nama agar bisa direview, tanpa
    // mengubah status penolakan kode tersebut.
    return { ...byCode, candidates: name ? searchCandidates(query, unit) : [] };
  }

  if (!name) {
    return baseMatch('NO_MATCH', 'Nama pekerjaan kosong — tidak bisa dicari di katalog AHSP.', ['EMPTY_NAME']);
  }
  const cands = searchCandidates(query, unit);
  // Auto-accept judul persis: nama DED (generik dibuang) sama persis dengan
  // judul katalog (awalan generik + pola "1 m2" dibuang), satuan persis,
  // komposisi FULL — dan hanya bila TUNGGAL.
  const qNorm = stripDedName(query);
  // Penjaga spesifikasi juga berlaku di sini: stripDedName membuang token
  // satuan (mm/cm), sehingga "tebal 15 mm" vs "tebal 15 cm" akan tampak
  // sama — pemeriksaan mentah di bawah menangkap perbedaan itu.
  const exact = cands.filter(
    (c) => stripDedName(c.name) === qNorm && c.unitExact && c.priceStatus === 'FULL'
      && !checkSpecCompatibility(query, c.name),
  );
  if (exact.length === 1) {
    return resolveCanonicalCode(exact[0].code, unit);
  }
  if (cands.length === 0) {
    return {
      ...baseMatch('NO_MATCH', `Tidak ditemukan padanan AHSP untuk "${name}" di katalog resmi.`, ['SEARCH_EMPTY']),
      candidates: [],
    };
  }
  return {
    ...baseMatch(
      'NEEDS_REVIEW',
      `${cands.length} kandidat AHSP ditemukan untuk "${name}" — pilih satu secara eksplisit; tidak ada yang dipilih otomatis.`,
      ['SEARCH_CANDIDATES'],
    ),
    candidates: cands,
  };
}

// ---------------------------------------------------------------------------
// Gerbang kebijakan harga (dipakai KEDUA mesin — satu-satunya tempat
// keputusan harga kanonis vs estimasi AI dibuat).
// ---------------------------------------------------------------------------

export type CanonicalPriceSource = 'AHSP_2026' | 'AI_ESTIMATE' | 'UNRESOLVED' | 'USER_INPUT';

export interface DedPriceFallback {
  unitPrice: number | null;
  source: string;
  unit?: string;
  notes?: string;
  ahspCode?: string;
}

export interface DedPriceDecision {
  unitPrice: number | null;
  source: CanonicalPriceSource;
  unit?: string;
  notes?: string;
  ahspCode?: string;
  ahspMatch: CanonicalDedMatch;
}

/**
 * Keputusan harga setelah resolusi kanonis:
 * - Harga manual (USER_INPUT) TIDAK PERNAH ditimpa.
 * - Match RESOLVED → harga kanonis (kedua mode).
 * - Klaim VERIFIED_SOURCE yang gagal dikonfirmasi → turun jadi
 *   AI_ESTIMATE dengan catatan (angka model tetap angka model — tidak
 *   boleh menyandang label terverifikasi), di kedua mode.
 * - DATABASE tanpa match → estimasi AI sebagai FALLBACK bila wajar
 *   (berlabel AI_ESTIMATE + catatan 'tidak ditemukan di database');
 *   bila estimasi hilang/tidak wajar → UNRESOLVED. Keputusan owner
 *   2026-10-27 malam: mode Database tetap AI yang mengenali pekerjaan
 *   + volume, harga diutamakan AHSP kanonis, AI mengisi perkiraan bila
 *   item tidak ada di database — aturan lama tanpa fallback inilah yang
 *   membuat analisis Database gagal total (NO_CALCULABLE_ITEMS) bila
 *   tidak ada satu pun item yang cocok kanonis persis.
 * - FULL_AI tanpa match → estimasi AI dipertahankan + match terlampir
 *   untuk review.
 *
 * Kewajaran harga fallback (ambang sama dengan isSaneEstimate di
 * ded-ai-estimate/pricing.ts): >0, >= Rp100, <= Rp50 M per satuan.
 * Dipakai adapter agar estimasi fallback dari EITHER mesin tidak pernah
 * masuk total bila nilainya tidak wajar — tanpa impor silang mesin.
 */
function isSaneFallbackPrice(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value >= 100 && value <= 50_000_000_000;
}
export function resolveDedPriceWithCanonical(
  policy: 'FULL_AI' | 'DATABASE',
  match: CanonicalDedMatch,
  fallback: DedPriceFallback,
): DedPriceDecision {
  if (fallback.source === 'USER_INPUT') {
    return {
      unitPrice: fallback.unitPrice,
      source: 'USER_INPUT',
      unit: fallback.unit,
      notes: fallback.notes,
      ahspCode: fallback.ahspCode,
      ahspMatch: match,
    };
  }
  if (match.status === 'RESOLVED' && match.unitPrice != null) {
    return {
      unitPrice: match.unitPrice,
      source: 'AHSP_2026',
      unit: match.unit,
      ahspCode: match.matchedCode,
      notes: `AHSP kanonis ${match.matchedCode} (${match.sourceDocument}, biaya langsung)`,
      ahspMatch: match,
    };
  }
  if (fallback.source === 'VERIFIED_SOURCE') {
    if (!isSaneFallbackPrice(fallback.unitPrice)) {
      return {
        unitPrice: null,
        source: 'UNRESOLVED',
        unit: fallback.unit,
        notes: 'Klaim terverifikasi tidak terkonfirmasi database dan tidak ada estimasi wajar — harga dikosongkan.',
        ahspMatch: match,
      };
    }
    return {
      unitPrice: fallback.unitPrice,
      source: 'AI_ESTIMATE',
      unit: fallback.unit,
      notes: `${fallback.notes ? `${fallback.notes} ` : ''}Klaim terverifikasi tidak terkonfirmasi database — diperlakukan sebagai estimasi AI (perkiraan, bukan harga database).`,
      ahspMatch: match,
    };
  }
  if (policy === 'DATABASE') {
    // Fallback perkiraan (keputusan owner 2026-10-27 malam): kanonis
    // sudah gagal di atas, jadi estimasi AI yang wajar dipakai — tapi
    // SELALU berlabel AI_ESTIMATE + catatan 'tidak ditemukan di
    // database', tidak pernah menyamar sebagai harga AHSP. Estimasi
    // hilang/tidak wajar tetap UNRESOLVED (bukan Rp0).
    if (fallback.source === 'AI_ESTIMATE' && isSaneFallbackPrice(fallback.unitPrice)) {
      return {
        unitPrice: fallback.unitPrice,
        source: 'AI_ESTIMATE',
        unit: fallback.unit,
        notes: `Estimasi AI — tidak ditemukan di database AHSP EZRAB: ${match.reason} (perkiraan, bukan harga database).`,
        ahspMatch: match,
      };
    }
    return {
      unitPrice: null,
      source: 'UNRESOLVED',
      unit: fallback.unit,
      notes: match.reason,
      ahspMatch: match,
    };
  }
  return {
    unitPrice: fallback.unitPrice,
    source: fallback.source === 'AI_ESTIMATE' ? 'AI_ESTIMATE' : 'UNRESOLVED',
    unit: fallback.unit,
    notes: fallback.notes,
    ahspCode: fallback.ahspCode,
    ahspMatch: match,
  };
}

// ---------------------------------------------------------------------------
// Label sumber harga — SATU sumber label untuk kedua layar hasil.
// VERIFIED_SOURCE HANYA muncul dari data lama: nilainya TIDAK diubah
// (kompatibilitas draft & riwayat), tapi labelnya netral — "belum
// terverifikasi independen" — bukan "Terverifikasi".
// ---------------------------------------------------------------------------

export const DED_PRICE_SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  AHSP_2026: { label: 'AHSP Kanonis (SE 47/2026)', color: '#16a34a' },
  VERIFIED_SOURCE: { label: 'Belum terverifikasi independen (data lama)', color: '#6b7280' },
  USER_INPUT: { label: 'Input User', color: '#2563EB' },
  AI_ESTIMATE: { label: 'Estimasi AI', color: '#d97706' },
  UNRESOLVED: { label: 'Belum Ada', color: '#6b7280' },
};

export function getDedPriceSourceLabel(source: string): { label: string; color: string } {
  return DED_PRICE_SOURCE_LABELS[source] || DED_PRICE_SOURCE_LABELS.UNRESOLVED;
}

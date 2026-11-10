/**
 * DED — LAYANAN REFERENSI HARGA KANONIS (Sprint 4, Tugas C).
 *
 * Lapisan ADITIF & READ-ONLY yang menyatukan DUA basis referensi harga
 * yang hidup berdampingan menjadi satu model data kanonis:
 *  1. `externalPriceReferences.ts` — 13 famili terkurasi (riset web
 *     2026-10-22, diakses 2026-11-10, TTL segar 30 hari → basi serentak
 *     ±2026-12-10), dipakai pipeline standar & Full AI lewat
 *     `findExternalReference`.
 *  2. `ded-full-ai/jakartaPrices.ts` — 49 entri harga pasar Jakarta/
 *     Jabodetabek 2026 tanpa URL/tanggal per entri, dipakai sebagai
 *     teks prompt Full AI (`formatPriceReferenceForPrompt`).
 *
 * BATAS TEGAS (keputusan Sprint 4): modul ini TIDAK mengubah perilaku
 * penyelesaian harga apa pun. `priceCompletion.ts` dan
 * `ded-full-ai/service.ts` tetap membaca basis asal lewat jalur yang
 * sudah teruji; TIDAK ada basis yang dihapus, TIDAK ada harga konflik
 * yang dirata-rata, dan TIDAK ada harga yang diganti diam-diam. Layanan
 * ini adalah lapisan baca/inspeksi + fondasi migrasi bertahap (lihat
 * docs/architecture/DED_CANONICAL_PRICE_REFERENCE_SERVICE.md).
 *
 * Hierarki provenans TETAP: OFFICIAL_AHSP → OFFICIAL_SSH_HSPK →
 * VERIFIED_SUPPLIER → MARKET_REFERENCE → AI_ESTIMATE → UNRESOLVED.
 * Tier OFFICIAL_SSH_HSPK dengan sengaja KOSONG di layanan ini — tidak
 * ada record SSH/HSPK resmi di kedua basis, dan tidak ada yang
 * difabrikasi untuk mengisinya.
 */

import {
  EXTERNAL_PRICE_REFERENCES,
  type ExternalPriceReference,
} from './externalPriceReferences';
import {
  JAKARTA_2026_PRICES,
  type PriceReference as JakartaPriceReference,
} from '../ded-full-ai/jakartaPrices';
import { parseMaterialSpec, type ParsedMaterialSpec } from './materialSpecValidation';
import { RESEARCH_CACHE_TTL_DAYS } from './priceResearchCache';

/** Hierarki sumber harga kanonis (urutan = kekuatan provenans). */
export const CANONICAL_PRICE_HIERARCHY = [
  'OFFICIAL_AHSP',
  'OFFICIAL_SSH_HSPK',
  'VERIFIED_SUPPLIER',
  'MARKET_REFERENCE',
  'AI_ESTIMATE',
  'UNRESOLVED',
] as const;

export type CanonicalHierarchyTier = (typeof CANONICAL_PRICE_HIERARCHY)[number];

/**
 * Record SSH/HSPK resmi di layanan kanonis: KOSONG BY DESIGN.
 * Kedua basis sumber adalah referensi pasar; mengisi tier ini butuh
 * dokumen SSH/HSPK daerah yang nyata, bukan turunan harga pasar.
 */
export const OFFICIAL_SSH_HSPK_REFERENCES: readonly CanonicalPriceReference[] = [];

export type CanonicalReferenceOrigin = 'EXTERNAL_CURATED' | 'JAKARTA_2026_TABLE';

export interface CanonicalPriceReference {
  /**
   * Identitas kanonis. Untuk basis eksternal = id sumber apa adanya.
   * Untuk basis Jakarta (tanpa id di sumber) = id TURUNAN deterministik
   * `jkt-<nn>-<slug-nama>` yang dihasilkan modul ini — BUKAN id sumber,
   * dan ditandai lewat `origin` + `provenanceNote`.
   */
  id: string;
  origin: CanonicalReferenceOrigin;
  description: string;
  /** Kategori basis Jakarta; basis eksternal tidak punya kategori sumber. */
  category: string | null;
  unit: string;
  /** Satuan ternormalisasi untuk perbandingan lintas basis (m1 → m'). */
  normalizedUnit: string;
  /** Harga rekomendasi/tunggal (Rp). Tidak pernah hasil rata-rata. */
  price: number;
  /** Rentang harga; basis Jakarta tidak menyatakannya → null. */
  rangeMin: number | null;
  rangeMax: number | null;
  scope: 'TERPASANG_PENUH' | 'MATERIAL_SAJA' | 'TIDAK_DINYATAKAN';
  hierarchyTier: CanonicalHierarchyTier;
  sourceName: string;
  /** URL sumber per entri; basis Jakarta tidak membawanya → null (tak diketahui). */
  sourceUrl: string | null;
  /** Tanggal data/publikasi pada sumber; tidak dinyatakan → null (tak diketahui). */
  sourceDate: string | null;
  /**
   * Tanggal akses/riset. Basis eksternal: per entri dari sumber.
   * Basis Jakarta: '2026-11-10' HANYA untuk 12 entri yang catatan
   * sumbernya sendiri menyatakan riset 2026-11-10; entri lama → null.
   */
  accessedAt: string | null;
  region: string;
  /** Keyakinan; basis Jakarta tidak menyatakannya → null (tak diketahui). */
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  verificationStatus: 'UNVERIFIED';
  /** Teks spesifikasi sumber apa adanya (specAssumption / nama entri). */
  specText: string;
  /** Atribut spesifikasi terstruktur hasil parse andal (Sprint 4 Tugas D). */
  structuredSpec: ParsedMaterialSpec;
  /** Kata kunci kecocokan basis eksternal; basis Jakarta tidak punya → null. */
  matchKeywords: string[] | null;
  excludeKeywords: string[] | null;
  provenanceNote: string;
}

export type CanonicalFreshness = 'FRESH' | 'STALE' | 'UNKNOWN';

function normalizeUnit(unit: string): string {
  const u = unit.toLowerCase().trim();
  if (u === 'm1' || u === 'm') return "m'";
  return u;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Petakan satu referensi eksternal terkurasi ke model kanonis (1:1, tanpa mengubah nilai). */
export function canonicalFromExternal(ref: ExternalPriceReference): CanonicalPriceReference {
  return {
    id: ref.id,
    origin: 'EXTERNAL_CURATED',
    description: ref.specAssumption,
    category: null,
    unit: ref.unit,
    normalizedUnit: normalizeUnit(ref.unit),
    price: ref.recommendedPrice,
    rangeMin: ref.rangeMin,
    rangeMax: ref.rangeMax,
    scope: ref.scope,
    hierarchyTier: ref.tier === 'SUPPLIER_MANUFACTURER' ? 'VERIFIED_SUPPLIER' : 'MARKET_REFERENCE',
    sourceName: ref.sourceName,
    sourceUrl: ref.sourceUrl,
    sourceDate: ref.sourceDate,
    accessedAt: ref.accessedAt,
    region: ref.region,
    confidence: ref.confidence,
    verificationStatus: 'UNVERIFIED',
    specText: ref.specAssumption,
    structuredSpec: parseMaterialSpec(ref.specAssumption),
    matchKeywords: [...ref.matchKeywords],
    excludeKeywords: ref.excludeKeywords ? [...ref.excludeKeywords] : null,
    provenanceNote: 'Entri terkurasi dengan URL, tanggal data, dan tanggal akses per entri dari sumbernya.',
  };
}

/**
 * Petakan satu entri tabel Jakarta ke model kanonis. Field yang tidak
 * ada di sumber (URL, tanggal data, rentang, keyakinan, kata kunci)
 * bernilai null = TAK DIKETAHUI — tidak dipinjam dari basis eksternal
 * walau harganya selaras, karena berkas Jakarta sendiri tidak
 * menyatakannya per entri.
 */
export function canonicalFromJakarta(entry: JakartaPriceReference, index: number): CanonicalPriceReference {
  const researched = /riset pasar 2026-11-10/i.test(entry.note || '');
  return {
    id: `jkt-${String(index + 1).padStart(2, '0')}-${slugify(entry.name)}`,
    origin: 'JAKARTA_2026_TABLE',
    description: entry.name,
    category: entry.category,
    unit: entry.unit,
    normalizedUnit: normalizeUnit(entry.unit),
    price: entry.price,
    rangeMin: null,
    rangeMax: null,
    scope: 'TIDAK_DINYATAKAN',
    // Tabel Jakarta adalah kompilasi pasar: plafonnya MARKET_REFERENCE
    // walau sebuah entri selaras harga dengan entri tier supplier di
    // basis eksternal — kekuatan provenans mengikuti SUMBER entri ini.
    hierarchyTier: 'MARKET_REFERENCE',
    sourceName: 'Kompilasi harga pasar material & upah Jabodetabek 2026 (jakartaPrices.ts)'
      + (entry.note ? ` — catatan entri: ${entry.note}` : ''),
    sourceUrl: null,
    sourceDate: null,
    accessedAt: researched ? '2026-11-10' : null,
    region: 'Jakarta / Jabodetabek',
    confidence: null,
    verificationStatus: 'UNVERIFIED',
    specText: entry.name,
    structuredSpec: parseMaterialSpec(entry.name),
    matchKeywords: null,
    excludeKeywords: null,
    provenanceNote: researched
      ? 'Entri diselaraskan riset pasar 2026-11-10 menurut catatan sumbernya; URL & tanggal data per entri tidak dicatat di berkas Jakarta (ada di basis eksternal untuk famili yang sama).'
      : 'Entri kompilasi lama tanpa catatan riset per entri: URL, tanggal data, dan tanggal akses tidak diketahui.',
  };
}

/** Seluruh record kanonis (13 eksternal + 49 Jakarta = 62). Murni, tanpa efek samping. */
export function listCanonicalReferences(): CanonicalPriceReference[] {
  return [
    ...EXTERNAL_PRICE_REFERENCES.map(canonicalFromExternal),
    ...JAKARTA_2026_PRICES.map((e, i) => canonicalFromJakarta(e, i)),
  ];
}

export function getCanonicalReferenceById(id: string): CanonicalPriceReference | null {
  return listCanonicalReferences().find((r) => r.id === id) ?? null;
}

/**
 * Kesegaran satu record pada tanggal `now`:
 * - FRESH: accessedAt + TTL (30 hari) belum lewat.
 * - STALE: accessedAt diketahui dan sudah lewat TTL — record tetap bisa
 *   diaudit; pemakaian sebagai dasar harga segar tidak dibenarkan.
 * - UNKNOWN: accessedAt tidak diketahui (entri Jakarta lama) — bukan
 *   "segar", bukan pula terbukti basi; perlu penangkapan provenans.
 * TIDAK PERNAH memperpanjang tanggal akses yang tercatat.
 */
export function canonicalFreshness(ref: CanonicalPriceReference, now: Date = new Date()): CanonicalFreshness {
  if (!ref.accessedAt) return 'UNKNOWN';
  const expires = addDaysIso(ref.accessedAt, RESEARCH_CACHE_TTL_DAYS);
  return now.toISOString().slice(0, 10) > expires ? 'STALE' : 'FRESH';
}

/**
 * Daftar revalidasi (proses refresh Sprint 4): record yang BASI dan
 * record yang kesegarannya TAK DIKETAHUI, dipisah. Refresh yang sah =
 * riset ulang sumber (harga/wilayah/cakupan/satuan/spesifikasi
 * diverifikasi, tanggal akses BARU dicatat dari riset baru, harga lama
 * terpelihara di riwayat) — fungsi ini hanya MENANDAI, tidak mengubah
 * record apa pun.
 */
export function referencesNeedingRevalidation(
  now: Date = new Date(),
  refs: CanonicalPriceReference[] = listCanonicalReferences(),
): { stale: CanonicalPriceReference[]; unknownFreshness: CanonicalPriceReference[] } {
  const stale: CanonicalPriceReference[] = [];
  const unknownFreshness: CanonicalPriceReference[] = [];
  for (const ref of refs) {
    const f = canonicalFreshness(ref, now);
    if (f === 'STALE') stale.push(ref);
    else if (f === 'UNKNOWN') unknownFreshness.push(ref);
  }
  return { stale, unknownFreshness };
}

export interface CrossBaseOverlap {
  jakarta: CanonicalPriceReference;
  external: CanonicalPriceReference;
  kind: 'PRICE_AND_UNIT_MATCH' | 'NAME_TOKEN_OVERLAP';
  /** Selisih harga Jakarta − eksternal (Rp); 0 = selaras persis. */
  priceDelta: number;
}

const STOP_TOKENS = new Set([
  'terpasang', 'dan', 'yang', 'untuk', 'dengan', 'rangka', 'pekerjaan',
  'pemasangan', 'pasangan', 'pengecatan', 'instalasi',
]);

function significantTokens(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP_TOKENS.has(w)),
  );
}

/**
 * Kandidat tumpang tindih lintas basis (alat audit, BUKAN resolusi):
 * pasangan Jakarta↔eksternal bersatuan ternormalisasi sama yang
 * harganya sama persis, atau berbagi ≥2 token nama signifikan.
 * Konsumen harga TIDAK memakai fungsi ini untuk memilih harga.
 */
export function findCrossBaseOverlaps(
  refs: CanonicalPriceReference[] = listCanonicalReferences(),
): CrossBaseOverlap[] {
  const externals = refs.filter((r) => r.origin === 'EXTERNAL_CURATED');
  const jakartas = refs.filter((r) => r.origin === 'JAKARTA_2026_TABLE');
  const out: CrossBaseOverlap[] = [];
  for (const j of jakartas) {
    const jTokens = significantTokens(j.description);
    for (const e of externals) {
      if (j.normalizedUnit !== e.normalizedUnit) continue;
      const eTokens = new Set([
        ...significantTokens(e.description),
        ...(e.matchKeywords ?? []).flatMap((k) => [...significantTokens(k)]),
      ]);
      const shared = [...jTokens].filter((tok) => eTokens.has(tok));
      if (j.price === e.price && shared.length >= 1) {
        out.push({ jakarta: j, external: e, kind: 'PRICE_AND_UNIT_MATCH', priceDelta: 0 });
      } else if (shared.length >= 2) {
        out.push({ jakarta: j, external: e, kind: 'NAME_TOKEN_OVERLAP', priceDelta: j.price - e.price });
      }
    }
  }
  return out;
}

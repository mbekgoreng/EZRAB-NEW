/**
 * chatAnswerTransfer — aksi transfer eksplisit dari jawaban Chat AI ke
 * Spreadsheet RAB (temuan uji live 2026-11-15, workstream 3).
 *
 * Masalah live: query 'plesteran dinding 10 m2' lewat Magic AI →
 * 'Lanjutkan di Chat AI' dijawab model sebagai TEKS hasil pencarian
 * AHSP (item salah [1.1.2.3]) — tanpa kuantitas, tanpa draft RAB, dan
 * tanpa jalur apa pun ke spreadsheet (hanya tombol salin; 'Review
 * draft' melaporkan belum ada draft aktif). Jalur draft universal
 * (buildUniversalDraft) TIDAK tercapai dari pertanyaan harga bebas
 * seperti ini — router intent hanya membangun draft dari perintah
 * pembuatan RAB ("buatkan rab ..."), sedangkan pertanyaan harga
 * jatuh ke jalur model yang menjawab teks.
 *
 * Perbaikan ini TIDAK mengubah router/model (milik workstream lain)
 * dan TIDAK memfabrikasi DraftPart (model draft berbasis template —
 * part sintetis berisiko BLOCKED di draftReadiness / merusak WBS).
 * Sebagai gantinya, modul MURNI ini memetakan jawaban AHSP menjadi
 * payload push mengikuti preseden directRabPush.ts
 * (pushDirectRabToSpreadsheet di view.tsx): konfirmasi implisit lewat
 * klik tombol, dedup berdasarkan kode, provenance jelas, dan
 * penyisipan lewat insertRabItemsVerified yang sama.
 *
 * Aturan kejujuran (cermin chatSearch + directRabPush + S2):
 * - Kode HANYA diambil dari format kanonis formatChatAhspResult
 *   (`N. [kode] ...`); kode yang tidak ditemukan di katalog resmi
 *   DILEWATI — teks model tidak pernah dipercaya untuk harga/judul.
 * - Harga SELALU di-resolve ulang dari katalog + resolver resmi
 *   (priceResolver2026 + getAhspDirectPrice), bukan dari angka di
 *   teks jawaban. Komposisi FULL / DHSP resmi → PRICE_RESOLVED
 *   (kind OFFICIAL_AHSP); komposisi PARSIAL / harga master katalog →
 *   PRICE_ESTIMATED + NEEDS_VERIFICATION; tanpa harga →
 *   PRICE_UNRESOLVED tanpa unitPrice (tidak pernah Rp0).
 * - Volume HANYA dari angka+satuan eksplisit pada pesan pengguna
 *   sebelumnya (mis. "10 m2"); tanpa volume → TIDAK ADA item yang
 *   dipetakan (volume tidak pernah dikarang). Satuan volume yang
 *   berbeda dari satuan katalog → item dilewati (tanpa konversi
 *   diam-diam — aturan yang sama dengan chatSearch).
 */
import { officialAhspRepository } from '../../data/nationalCostDatabase/officialAhspRepository';
import { priceResolver2026 } from '../../data/priceDatabase2026/resolver';
import {
  getAhspDirectPrice,
  getAhspDirectPriceBasis,
} from '../../data/priceDatabase2026/ahspDisplayPolicy';
import { normalizeUnit } from './chatSearch';
import { formatWorkItemTitle } from './workItemTitle';

export type ChatAnswerPushPriceStatus =
  | 'PRICE_RESOLVED'
  | 'PRICE_ESTIMATED'
  | 'PRICE_UNRESOLVED';

export interface ChatAnswerPushItem {
  description: string;
  volume: number;
  unit: string;
  code: string;
  category: string;
  unitPrice?: number;
  priceStatus: ChatAnswerPushPriceStatus;
  verificationStatus: 'VERIFIED' | 'NEEDS_VERIFICATION';
  priceSourceKind: 'OFFICIAL_AHSP' | 'UNRESOLVED';
  priceSourceLabel: string;
  priceSourceExplanation: string;
  volumeSource: 'AI_GENERATED';
  ahspCode: string;
}

export interface RequestedQuantity {
  volume: number;
  unit: string;
}

/** Maks item dari satu jawaban (cermin batas 8 item formatChatAhspResult). */
export const CHAT_ANSWER_TRANSFER_MAX_ITEMS = 8;

/**
 * Kode AHSP dari baris kanonis `N. [kode] judul — satuan — ...` yang
 * dihasilkan formatChatAhspResult. Hanya baris bernomor yang diterima —
 * kode yang disebut model di kalimat bebas (bisa karangan) diabaikan.
 * Urutan dipertahankan, duplikat dibuang.
 */
export function extractAhspCodesFromAnswer(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of String(text ?? '').split('\n')) {
    const m = line.match(/^\s*\d+\.\s*\[([A-Za-z0-9][A-Za-z0-9.()\-]*)\]/);
    if (!m) continue;
    const code = m[1];
    // Semua kode AHSP mengandung titik (3.7.4, A.1.02.3b.1, G.85).
    if (!code.includes('.')) continue;
    if (seen.has(code)) continue;
    seen.add(code);
    out.push(code);
    if (out.length >= CHAT_ANSWER_TRANSFER_MAX_ITEMS) break;
  }
  return out;
}

/**
 * Volume eksplisit dari pesan pengguna: angka + satuan yang langsung
 * mengikutinya ("10 m2", "10m²", "10,5 m3", "2 buah"). Satuan 'm'
 * telanjang TIDAK diterima — "10 m dari jalan" adalah jarak, bukan
 * volume. Desimal koma Indonesia diterima. Kecocokan pertama menang.
 */
export function parseRequestedQuantity(
  userText: string | null | undefined,
): RequestedQuantity | null {
  const text = String(userText ?? '');
  const m = text.match(
    /(\d+(?:[.,]\d+)?)\s*(m\s*2|m²|m\s*3|m³|kg|m'|buah|unit|titik|ls)(?![a-z0-9])/i,
  );
  if (!m) return null;
  const volume = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(volume) || volume <= 0) return null;
  return { volume, unit: normalizeUnit(m[2]) };
}

export interface MapAnswerItemsResult {
  items: ChatAnswerPushItem[];
  /** Kode yang tidak ada di katalog resmi — dilewati, tidak pernah dipakai. */
  unknownCodes: string[];
  /** Kode yang satuannya tidak cocok dengan satuan volume — dilewati. */
  unitMismatchCodes: string[];
}

function priceForItem(item: any): {
  unitPrice: number | null;
  priceStatus: ChatAnswerPushPriceStatus;
  verificationStatus: 'VERIFIED' | 'NEEDS_VERIFICATION';
  priceSourceKind: 'OFFICIAL_AHSP' | 'UNRESOLVED';
  priceSourceLabel: string;
  priceSourceExplanation: string;
} {
  let comp: any = null;
  try {
    comp = priceResolver2026.resolveAhspUnitPrice(item);
  } catch {
    comp = null;
  }
  const direct = comp ? getAhspDirectPrice(comp) : null;
  const basis = comp ? getAhspDirectPriceBasis(comp) : null;
  const baked =
    typeof item.unitPrice === 'number' && item.unitPrice > 0 ? item.unitPrice : null;
  const coefSource = String(item.sourceDocument ?? '').trim();
  const coefNote = coefSource
    ? `Sumber koefisien: ${coefSource}.`
    : 'Sumber koefisien: tidak tercantum.';
  const resolved = Number(comp?.resolvedComponents ?? 0);
  const total = Number(comp?.totalComponents ?? 0);

  if (direct !== null && direct !== undefined && direct > 0) {
    if (basis === 'DHSP') {
      return {
        unitPrice: direct,
        priceStatus: 'PRICE_RESOLVED',
        verificationStatus: 'VERIFIED',
        priceSourceKind: 'OFFICIAL_AHSP',
        priceSourceLabel: 'Harga DHSP resmi (AHSP 2026)',
        priceSourceExplanation: `Harga Daftar Harga Satuan Pekerjaan resmi${comp?.provenanceSource ? ` (${comp.provenanceSource})` : ''}. ${coefNote}`,
      };
    }
    if (total === 0) {
      // Tanpa komponen dan bukan DHSP: direct = harga baked item.
      return {
        unitPrice: direct,
        priceStatus: 'PRICE_ESTIMATED',
        verificationStatus: 'NEEDS_VERIFICATION',
        priceSourceKind: 'OFFICIAL_AHSP',
        priceSourceLabel: 'Harga master katalog AHSP 2026',
        priceSourceExplanation: `Harga master katalog (bukan hasil komposisi komponen). ${coefNote}`,
      };
    }
    if (comp?.pricingStatus === 'FULL') {
      return {
        unitPrice: direct,
        priceStatus: 'PRICE_RESOLVED',
        verificationStatus: 'VERIFIED',
        priceSourceKind: 'OFFICIAL_AHSP',
        priceSourceLabel: 'Harga resmi AHSP 2026 (komposisi lengkap)',
        priceSourceExplanation: `Dihitung dari komposisi (koefisien × HSD, ${resolved}/${total} komponen). ${coefNote}`,
      };
    }
    // PARSIAL atau status tak dikenal: jumlah komponen ter-resolve
    // BUKAN harga lengkap — plafon jujur ESTIMATED (fail-closed).
    return {
      unitPrice: direct,
      priceStatus: 'PRICE_ESTIMATED',
      verificationStatus: 'NEEDS_VERIFICATION',
      priceSourceKind: 'OFFICIAL_AHSP',
      priceSourceLabel: `Harga parsial AHSP 2026 (${resolved}/${total} komponen)`,
      priceSourceExplanation: `Jumlah komponen ter-resolve ${resolved}/${total} — bukan harga lengkap. ${coefNote}`,
    };
  }
  if (baked !== null) {
    return {
      unitPrice: baked,
      priceStatus: 'PRICE_ESTIMATED',
      verificationStatus: 'NEEDS_VERIFICATION',
      priceSourceKind: 'OFFICIAL_AHSP',
      priceSourceLabel: 'Harga master katalog AHSP 2026',
      priceSourceExplanation: `Harga master katalog (bukan hasil komposisi komponen). ${coefNote}`,
    };
  }
  return {
    unitPrice: null,
    priceStatus: 'PRICE_UNRESOLVED',
    verificationStatus: 'NEEDS_VERIFICATION',
    priceSourceKind: 'UNRESOLVED',
    priceSourceLabel: 'Harga belum tersedia',
    priceSourceExplanation: `Harga belum tersedia (bukan Rp0). ${coefNote}`,
  };
}

type ResolveOneResult =
  | { kind: 'ok'; item: ChatAnswerPushItem }
  | { kind: 'unknown' }
  | { kind: 'unit-mismatch' };

function resolveOneCode(code: string, quantity: RequestedQuantity): ResolveOneResult {
  const item: any = officialAhspRepository.getOfficialAhsp(code);
  if (!item) return { kind: 'unknown' };
  const unit = String(item.unit ?? '');
  if (normalizeUnit(unit) !== quantity.unit) return { kind: 'unit-mismatch' };
  const price = priceForItem(item);
  const title = String(item.name ?? item.title ?? code);
  return {
    kind: 'ok',
    item: {
      description: formatWorkItemTitle(title),
      volume: quantity.volume,
      unit,
      code,
      category: String(item.category || 'Lainnya'),
      ...(price.unitPrice !== null ? { unitPrice: price.unitPrice } : {}),
      priceStatus: price.priceStatus,
      verificationStatus: price.verificationStatus,
      priceSourceKind: price.priceSourceKind,
      priceSourceLabel: price.priceSourceLabel,
      priceSourceExplanation: price.priceSourceExplanation,
      volumeSource: 'AI_GENERATED',
      ahspCode: code,
    },
  };
}

/**
 * Petakan kode jawaban menjadi payload push spreadsheet.
 *
 * - `quantity === null` → TIDAK ADA item (volume tidak pernah dikarang).
 * - Kode tak dikenal → unknownCodes (dilewati).
 * - Satuan katalog != satuan volume → unitMismatchCodes (dilewati,
 *   tanpa konversi diam-diam).
 * - Judul + harga SELALU dari katalog/resolver resmi, bukan teks jawaban.
 *
 * Memetakan SEMUA kode yang diberikan. Tombol produk memakai
 * buildAnswerTransfer (hanya item teratas) — fungsi ini dipertahankan
 * untuk tes + calon pemilih multi-item di masa depan.
 */
export function mapAnswerItemsToPushItems(
  codes: string[],
  quantity: RequestedQuantity | null,
): MapAnswerItemsResult {
  const items: ChatAnswerPushItem[] = [];
  const unknownCodes: string[] = [];
  const unitMismatchCodes: string[] = [];
  if (!quantity) return { items, unknownCodes, unitMismatchCodes };
  for (const code of codes.slice(0, CHAT_ANSWER_TRANSFER_MAX_ITEMS)) {
    const r = resolveOneCode(code, quantity);
    if (r.kind === 'ok') items.push(r.item);
    else if (r.kind === 'unknown') unknownCodes.push(code);
    else unitMismatchCodes.push(code);
  }
  return { items, unknownCodes, unitMismatchCodes };
}

export interface AnswerTransferPlan {
  /** Payload push — HANYA item teratas yang dapat dipetakan. */
  items: ChatAnswerPushItem[];
  /** Kode item teratas yang dipetakan (null bila tidak ada). */
  topCode: string | null;
  /** Kode yang tidak ada di katalog resmi — dilewati. */
  unknownCodes: string[];
  /** Kode yang satuannya tidak cocok dengan satuan volume — dilewati. */
  unitMismatchCodes: string[];
  /**
   * Jumlah alternatif lain di jawaban yang TIDAK ikut ditransfer.
   * Item-item jawaban adalah ALTERNATIF berperingkat (varian rasio /
   * metode yang sama), bukan satu set RAB — mentransfer semuanya akan
   * menggandakan pekerjaan yang sama di spreadsheet (mis. 8 varian
   * plesteran × 10 m2). Hanya best match yang ditransfer; varian lain
   * didapat pengguna dengan mempersempit pertanyaan (mis. tambah 1:4).
   */
  skippedAlternatives: number;
}

/**
 * Rencana transfer tombol produk: hanya item TERATAS jawaban yang
 * dapat dipetakan (best match). Bila kode teratas tidak dapat
 * dipetakan (tak dikenal / satuan tidak cocok), jatuh ke kode
 * berikutnya yang dapat dipetakan — kode yang dilewati dilaporkan
 * di unknownCodes / unitMismatchCodes, bukan disembunyikan.
 */
export function buildAnswerTransfer(
  codes: string[],
  quantity: RequestedQuantity | null,
): AnswerTransferPlan {
  const items: ChatAnswerPushItem[] = [];
  const unknownCodes: string[] = [];
  const unitMismatchCodes: string[] = [];
  let topCode: string | null = null;
  let skippedAlternatives = 0;
  if (!quantity) {
    return { items, topCode, unknownCodes, unitMismatchCodes, skippedAlternatives };
  }
  for (const code of codes.slice(0, CHAT_ANSWER_TRANSFER_MAX_ITEMS)) {
    if (topCode) {
      skippedAlternatives++;
      continue;
    }
    const r = resolveOneCode(code, quantity);
    if (r.kind === 'ok') {
      items.push(r.item);
      topCode = code;
    } else if (r.kind === 'unknown') {
      unknownCodes.push(code);
    } else {
      unitMismatchCodes.push(code);
    }
  }
  return { items, topCode, unknownCodes, unitMismatchCodes, skippedAlternatives };
}

/**
 * Teks pesan pengguna terdekat SEBELUM pesan asisten ke-`assistantIndex`
 * (sumber volume eksplisit). Dipisah sebagai helper murni agar alur
 * keputusan handler tombol dapat dites tanpa React/store.
 */
export function findPrecedingUserText(
  messages: Array<{ role: string; content: string }>,
  assistantIndex: number,
): string | null {
  for (let i = assistantIndex - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') return messages[i].content;
  }
  return null;
}

/**
 * P1 PRICE-1 — pure price/code resolution for QTO -> RAB sync.
 *
 * RULE: never invent a fallback price. When the caller does not supply a
 * price, the item is PRICE_UNRESOLVED (amount 0, NEEDS_VERIFICATION) — the
 * user must fill the real unit price. Previously this silently used
 * Rp125.000 + fake code 'AHSP.2026.01'.
 *
 * ONE-PASS Task E — BATASAN KLASIFIKASI HARGA MANUAL (terdokumentasi,
 * disengaja, menunggu keputusan owner):
 * Harga yang disediakan pemanggil di jalur ini diklasifikasikan
 * PRICE_RESOLVED + VERIFIED, BUKAN PRICE_MANUAL. Normalisasi ke
 * PRICE_MANUAL TIDAK dilakukan karena:
 * (1) kontrak P1 PRICE-1 di atas menetapkan PRICE_RESOLVED untuk harga
 *     pemanggil dan diuji persis demikian (p1QtoSyncPricing.test.ts) —
 *     mengubahnya adalah perubahan kebijakan, bukan perbaikan kompatibilitas;
 * (2) laporan Price Integrity Gate §10 butir 6 mencatat penyelarasan ini
 *     sebagai KEPUTUSAN OWNER yang belum diambil;
 * (3) saat ini TIDAK ADA pemanggil UI yang meneruskan customUnitPrice ke
 *     syncQtoToRabSpreadsheet (kedua titik panggil di QtoRekapVolumeView
 *     hanya meneruskan id), jadi cabang berharga dari helper ini tidak
 *     terjangkau dari UI — dampak praktis batasan ini nol hari ini.
 * Harga resmi AHSP dan referensi pasar TIDAK PERNAH mengalir lewat helper
 * ini, jadi tidak ada harga resmi/pasar yang berisiko terlabeli manual
 * oleh jalur ini. Bila owner memutuskan penyelarasan, ubah di sini +
 * sesuaikan kontrak tes P1 secara eksplisit.
 *
 * D-67 (Batch A, 2026-11-14) — HARGA TERSIMPAN QTO: QTOItem kini membawa
 * harga kalkulatornya (unitPrice/totalCost/priceStatus/priceUnit, ditulis
 * executeCalculationAndSave HANYA dari rincian lengkap — rincian parsial
 * tidak pernah disimpan). `decideQtoSyncPrice` adalah SATU-SATUNYA tempat
 * keputusan harga sinkronisasi dibuat, dipakai jalur baru maupun jalur
 * sinkron-ulang (existing mapping):
 *   1. harga eksplisit pemanggil (customUnitPrice) selalu menang;
 *   2. item RAB yang SUDAH berharga (termasuk harga manual user) TIDAK
 *      PERNAH ditimpa harga tersimpan — hanya item PRICE_UNRESOLVED yang
 *      boleh "disembuhkan" oleh harga tersimpan;
 *   3. harga tersimpan ditransfer hanya bila satuannya cocok dengan satuan
 *      QTO saat ini (priceUnit vs unit) — ketidakcocokan = tidak
 *      ditransfer + alasan jelas, bukan angka salah;
 *   4. status harga tersimpan DIPERTAHANKAN (ESTIMATED tetap ESTIMATED,
 *      tidak di-upgrade diam-diam menjadi RESOLVED);
 *   5. tanpa harga apa pun: PRICE_UNRESOLVED seperti sebelumnya — null
 *      tidak pernah diganti nol yang terlihat valid.
 */
import type { PriceStatus, VerificationStatus } from '../types';

export interface QtoSyncPriceResolution {
  unitPrice: number;
  priceStatus: PriceStatus;
  verificationStatus: VerificationStatus;
  notes?: string;
}

export function resolveQtoSyncPrice(customUnitPrice?: number): QtoSyncPriceResolution {
  const hasPrice = customUnitPrice !== undefined && Number.isFinite(customUnitPrice);
  if (hasPrice) {
    return {
      unitPrice: customUnitPrice as number,
      priceStatus: 'PRICE_RESOLVED',
      verificationStatus: 'VERIFIED',
    };
  }
  return {
    unitPrice: 0,
    priceStatus: 'PRICE_UNRESOLVED',
    verificationStatus: 'NEEDS_VERIFICATION',
    notes: 'Harga belum diisi — sinkronisasi QTO tidak mengarang harga. Isi harga satuan nyata.',
  };
}

/** Never fabricate an AHSP code. Empty string = honest "no code". */
export function resolveQtoSyncCode(ahspCode?: string, qtoKode?: string): string {
  return (ahspCode || qtoKode || '').trim();
}

// ---------------------------------------------------------------------------
// D-67 — stored-price transfer (Batch A)
// ---------------------------------------------------------------------------

/** Minimal QTO shape the price decision needs (a full QTOItem satisfies this). */
export interface QtoStoredPriceInput {
  unitPrice?: number | null;
  totalCost?: number | null;
  priceStatus?: PriceStatus;
  priceUnit?: string;
  unit?: string;
  priceNotes?: string;
  priceValidationWarnings?: string[];
}

/** Minimal already-synced RAB shape the re-sync decision needs. */
export interface ExistingSyncedRabInput {
  unitPrice: number | null;
  priceStatus?: PriceStatus;
  verificationStatus?: VerificationStatus;
}

export type QtoSyncPriceSource = 'CALLER' | 'QTO_STORED' | 'EXISTING' | 'UNRESOLVED';

export interface QtoSyncPriceDecision extends QtoSyncPriceResolution {
  source: QtoSyncPriceSource;
  /** True when a real (caller or stored) price was applied. */
  transferred: boolean;
  /** Human-readable (id-ID) basis of the decision — shown to the user when unresolved. */
  reason?: string;
  /** Provenance warnings carried from the QTO item onto the RAB item. */
  priceValidationWarnings?: string[];
}

/** Can this QTO item's stored price be transferred safely? Pure + UI-safe. */
export function checkQtoStoredPriceTransfer(qto: QtoStoredPriceInput): {
  transferable: boolean;
  reason: string;
} {
  const stored = qto.unitPrice;
  if (stored === undefined || stored === null || !Number.isFinite(stored)) {
    return {
      transferable: false,
      reason: 'Item QTO belum memiliki harga tersimpan dari kalkulator.',
    };
  }
  if (qto.priceUnit && qto.unit && qto.priceUnit !== qto.unit) {
    return {
      transferable: false,
      reason: `Satuan harga tersimpan (${qto.priceUnit}) tidak cocok dengan satuan QTO saat ini (${qto.unit}) — harga tidak ditransfer agar tidak salah hitung.`,
    };
  }
  return {
    transferable: true,
    reason:
      qto.priceNotes ??
      'Harga tersimpan dari kalkulator QTO.',
  };
}

/**
 * Single decision point for QTO → RAB sync pricing (new item + re-sync).
 * Precedence: explicit caller price → already-priced RAB item (never
 * overwritten) → stored QTO price (unit-checked, status preserved) →
 * PRICE_UNRESOLVED. Never invents a price; never upgrades an estimate.
 */
export function decideQtoSyncPrice(args: {
  customUnitPrice?: number;
  qto: QtoStoredPriceInput;
  existingRab?: ExistingSyncedRabInput | null;
}): QtoSyncPriceDecision {
  const { customUnitPrice, qto, existingRab } = args;

  // 1. Explicit caller price always wins (existing P1 contract).
  if (customUnitPrice !== undefined) {
    const r = resolveQtoSyncPrice(customUnitPrice);
    return { ...r, source: 'CALLER', transferred: r.priceStatus !== 'PRICE_UNRESOLVED' };
  }

  // 2. An already-priced RAB item (including a manually priced one) is never
  //    overwritten by a stored QTO price. Only an explicitly UNRESOLVED item
  //    may be healed by the stored price below. Legacy items without a status
  //    are treated as resolved (per the RabItem contract).
  if (existingRab && existingRab.priceStatus !== 'PRICE_UNRESOLVED') {
    return {
      unitPrice: existingRab.unitPrice ?? 0,
      priceStatus: existingRab.priceStatus ?? 'PRICE_RESOLVED',
      verificationStatus: existingRab.verificationStatus ?? 'VERIFIED',
      source: 'EXISTING',
      transferred: false,
      reason: 'Harga item RAB yang sudah ada dipertahankan.',
    };
  }

  // 3. Stored QTO price — transferred only when unit-compatible.
  const check = checkQtoStoredPriceTransfer(qto);
  if (check.transferable) {
    const storedStatus: PriceStatus = qto.priceStatus ?? 'PRICE_RESOLVED';
    return {
      unitPrice: qto.unitPrice as number,
      priceStatus: storedStatus,
      // An estimate is NOT verified — it keeps NEEDS_VERIFICATION so the
      // user knows to verify it before procurement.
      verificationStatus: storedStatus === 'PRICE_ESTIMATED' ? 'NEEDS_VERIFICATION' : 'VERIFIED',
      notes: qto.priceNotes,
      source: 'QTO_STORED',
      transferred: true,
      reason: check.reason,
      ...(qto.priceValidationWarnings?.length
        ? { priceValidationWarnings: [...qto.priceValidationWarnings] }
        : {}),
    };
  }

  // 4. No price anywhere: PRICE_UNRESOLVED, with the reason attached so the
  //    UI can warn before committing an unresolved item.
  if (existingRab) {
    return {
      unitPrice: existingRab.unitPrice ?? 0,
      priceStatus: 'PRICE_UNRESOLVED',
      verificationStatus: 'NEEDS_VERIFICATION',
      notes: 'Harga belum diisi — sinkronisasi QTO tidak mengarang harga. Isi harga satuan nyata.',
      source: 'EXISTING',
      transferred: false,
      reason: check.reason,
    };
  }
  const unresolved = resolveQtoSyncPrice(undefined);
  return {
    ...unresolved,
    source: 'UNRESOLVED',
    transferred: false,
    reason: check.reason,
  };
}

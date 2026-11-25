/**
 * DED-to-RAB — Validasi-SEBELUM-Sisip finalisasi (§9 + §11 directive
 * DED-RAB AI Dual Mode, W4 2026-11-13).
 *
 * Modul MURNI: memvalidasi SATU batch finalisasi secara utuh SEBELUM
 * ada tulis apa pun (sebelum proyek dibuat, sebelum `bulkAddRabItems`).
 * Kontrak all-or-nothing: bila SATU item savable gagal dipetakan ke
 * baris RAB, SELURUH batch ditolak (`ok: false`) dan handler WAJIB
 * tidak menyisip apa pun — tanpa RAB aktif korup sebagian, tanpa proyek
 * kosong tertinggal.
 *
 * Latar: handler lama memakai `flatMap` yang MEMBUANG diam-diam item
 * yang mapper-nya mengembalikan null, lalu menyisip sisanya dengan
 * pesan sukses — finalisasi "berhasil" yang kehilangan item tanpa
 * jejak. Mapper mengembalikan null untuk item tanpa harga/kuantitas
 * dan (jalur standar) untuk sumber harga yang tak terpetakan
 * (UNRESOLVED / tak dikenal). Data hasil service NYATA tidak pernah
 * mencapai cabang null itu untuk item savable (adapter kanonis hanya
 * mengembalikan UNRESOLVED bersama unitPrice null —
 * `canonicalDedPricing.ts`, `resolveDedPriceWithCanonical`; edit harga
 * di layar hasil menetapkan sumber USER_INPUT) — jadi gate ini adalah
 * pertahanan kedua untuk data draft lama / edit tepi / perubahan
 * mapper di masa depan, bukan pemblokir alur normal.
 *
 * Handler (`view.tsx` `handleFinalize` / `handleFullAiFinalize`)
 * memanggil validator ini DULU, lalu hanya bila `ok` ia membuat
 * proyek (bila perlu) + memanggil `bulkAddRabItems` dengan
 * `validation.mapped`. Kegagalan validasi mengembalikan pesan error
 * tanpa setState apa pun: hasil analisis + draft menengah yang valid
 * dipertahankan, proyek aktif sebelumnya tidak berubah.
 *
 * BUKAN perutean ke alur draft→review→approval Chat AI (C6 — di luar
 * cakupan aman, dicatat PARTIAL + backlog di LAPORAN-W4).
 */

import type { DedAiItem, DedEstimationPolicy } from './types';
import type { FullAiItem } from '../ded-full-ai/types';
import {
  mapDedAiItemToRabInput,
  mapFullAiItemToRabInput,
  type DedFinalizeRabInput,
} from './finalizeMapping';
import { validateDedAiItem, validateFullAiItem } from './dedRabValidationGate';
import { AHSP_DATABASE_VERSION } from '../../data/nationalCostDatabase/types';

/** Satu item savable dengan kegagalan gate BLOCKING (advisory — Phase B). */
export interface DedGateBlockingItem {
  itemId: string;
  itemName: string;
  /** Alasan per gate, format "Gate N (nama): alasan". */
  failures: string[];
}

/** Satu item savable yang gagal dipetakan ke baris RAB. */
export interface DedFinalizeFailure {
  itemId: string;
  itemName: string;
  reason: string;
}

/** Hasil validasi satu batch finalisasi. */
export interface DedFinalizeValidation<TItem> {
  /** Item yang lolos saring savable handler (siap finalisasi). */
  savable: TItem[];
  /** Jumlah item yang ditahan saringan (tidak savable). */
  blockedCount: number;
  /** Item savable yang kuantitasnya asumsi/inferensi (hanya jalur standar; Full AI: 0). */
  needsReviewCount: number;
  /** Baris RAB hasil pemetaan item savable — dipakai handler HANYA bila `ok`. */
  mapped: DedFinalizeRabInput[];
  /** Item savable yang gagal dipetakan (alasan spesifik per item). */
  failures: DedFinalizeFailure[];
  /**
   * ADVISORY (Phase B, DED RAB Validation Gate): item savable dengan
   * kegagalan gate BLOCKING, beserta alasannya. ANOTASI MURNI — tidak
   * mengubah `ok`, `savable`, `mapped`, atau perilaku finalisasi apa
   * pun. Finalize tetap berjalan seperti sebelumnya; laporan hanya
   * memberi tahu item mana yang membawa temuan blocking.
   */
  gateBlockingItemCount: number;
  gateBlockingItems: DedGateBlockingItem[];
  /**
   * true ⟺ ada ≥1 item savable DAN semua item savable terpetakan ke
   * baris RAB yang valid. false ⟹ handler WAJIB tidak menyisip apa pun.
   */
  ok: boolean;
}

/** Cek pertahanan kedua atas baris RAB hasil pemetaan (volume/harga sah). */
function mappedRowDefect(row: DedFinalizeRabInput): string | null {
  if (!Number.isFinite(row.volume) || row.volume <= 0) {
    return `volume hasil pemetaan tidak valid (${row.volume})`;
  }
  if (!Number.isFinite(row.unitPrice) || row.unitPrice <= 0) {
    return `harga satuan hasil pemetaan tidak valid (${row.unitPrice})`;
  }
  return null;
}

/** Daftar kegagalan untuk pesan error (maks 5 + "dan N item lainnya"). */
export function formatFinalizeFailures(failures: DedFinalizeFailure[], max = 5): string {
  const shown = failures.slice(0, max).map((f) => `• "${f.itemName}": ${f.reason}`);
  if (failures.length > max) {
    shown.push(`• …dan ${failures.length - max} item lainnya`);
  }
  return shown.join('\n');
}

/**
 * Validasi batch finalisasi jalur STANDAR. Saringan savable = persis
 * filter handler lama (stage CALCULATED + subtotal + unitPrice terisi)
 * — tidak diperketat, tidak dilonggarkan.
 */
export function validateDedFinalizeBatch(
  items: DedAiItem[],
  policy: DedEstimationPolicy,
): DedFinalizeValidation<DedAiItem> {
  const savable = items.filter(
    (it) => it.stage === 'CALCULATED' && it.subtotal != null && it.unitPrice != null,
  );
  const needsReviewCount = savable.filter(
    (it) => it.quantitySource === 'AI_INFERENCE' || it.quantitySource === 'ASSUMPTION',
  ).length;
  // ADVISORY (Phase B): gate counts over savable items only. The gate is
  // read-only — it never changes savable/mapped/ok.
  const gateBlockingItems: DedGateBlockingItem[] = [];
  for (const it of savable) {
    const gate = validateDedAiItem(it, policy, { targetAhspVersion: AHSP_DATABASE_VERSION });
    if (gate.blockingFailures.length > 0) {
      gateBlockingItems.push({
        itemId: it.id,
        itemName: it.name,
        failures: gate.blockingFailures.map((g) => `Gate ${g.gate} (${g.name}): ${g.reason}`),
      });
    }
  }
  const mapped: DedFinalizeRabInput[] = [];
  const failures: DedFinalizeFailure[] = [];
  for (const it of savable) {
    const row = mapDedAiItemToRabInput(it, policy);
    if (!row) {
      let reason: string;
      if (it.unitPrice == null) reason = 'tanpa harga satuan (unitPrice kosong)';
      else if (it.quantity == null) reason = 'tanpa kuantitas';
      // Fast Track (W-AUTH2, w4 3.3): penjaga W1 mapper juga menolak
      // kuantitas tidak valid (non-finite / <= 0) — alasan itu TADINYA
      // tertutup cabang sumber-harga di bawah (mapper null untuk
      // kuantitas -5 dilaporkan sebagai "sumber harga AI_ESTIMATE
      // tidak dapat dipetakan"). Permukaan di sini agar alasan
      // menyebut cacat yang sebenarnya.
      else if (!Number.isFinite(it.quantity) || it.quantity <= 0) reason = `volume tidak valid (${it.quantity})`;
      // Fast Track (koordinator, residu w4 3.3): penjaga W1 mapper juga
      // menolak harga satuan tidak valid (non-finite / <= 0) — cermin
      // cabang volume di atas, agar alasannya menyebut cacat sebenarnya.
      else if (!Number.isFinite(it.unitPrice) || it.unitPrice <= 0) reason = `harga satuan tidak valid (${it.unitPrice})`;
      else if (it.priceSource === 'UNRESOLVED') {
        reason = 'sumber harga UNRESOLVED — tidak boleh menjadi baris RAB berharga';
      } else {
        reason = `sumber harga "${it.priceSource}" tidak dapat dipetakan ke baris RAB`;
      }
      failures.push({ itemId: it.id, itemName: it.name, reason });
      continue;
    }
    const defect = mappedRowDefect(row);
    if (defect) {
      failures.push({ itemId: it.id, itemName: it.name, reason: defect });
      continue;
    }
    mapped.push(row);
  }
  return {
    savable,
    blockedCount: items.length - savable.length,
    needsReviewCount,
    mapped,
    failures,
    gateBlockingItemCount: gateBlockingItems.length,
    gateBlockingItems,
    ok: savable.length > 0 && failures.length === 0,
  };
}

/**
 * Validasi batch finalisasi jalur FULL AI. Saringan savable = persis
 * filter handler lama (status READY + subtotal > 0 + unitPrice terisi).
 * Mapper Full AI tidak pernah mengembalikan null untuk item savable
 * (cabang fallback-nya selalu menghasilkan baris berlabel) — gate ini
 * tetap dipasang agar perubahan mapper di masa depan tidak bisa
 * membuang item diam-diam.
 */
export function validateFullAiFinalizeBatch(
  items: FullAiItem[],
  policy: DedEstimationPolicy,
): DedFinalizeValidation<FullAiItem> {
  const savable = items.filter(
    (it) => it.status === 'READY' && it.subtotal != null && it.subtotal > 0 && it.price.unitPrice != null,
  );
  // ADVISORY (Phase B): gate counts over savable items only — read-only,
  // never changes savable/mapped/ok.
  const gateBlockingItems: DedGateBlockingItem[] = [];
  for (const it of savable) {
    const gate = validateFullAiItem(it, policy, { targetAhspVersion: AHSP_DATABASE_VERSION });
    if (gate.blockingFailures.length > 0) {
      gateBlockingItems.push({
        itemId: it.id,
        itemName: it.name,
        failures: gate.blockingFailures.map((g) => `Gate ${g.gate} (${g.name}): ${g.reason}`),
      });
    }
  }
  const mapped: DedFinalizeRabInput[] = [];
  const failures: DedFinalizeFailure[] = [];
  for (const it of savable) {
    const row = mapFullAiItemToRabInput(it, policy);
    if (!row) {
      let reason: string;
      if (it.price.unitPrice == null) reason = 'tanpa harga satuan (unitPrice kosong)';
      else if (it.quantity.value == null) reason = 'tanpa kuantitas';
      // Fast Track (W-AUTH2, w4 3.3 — cermin jalur standar): mapper
      // Full AI juga menolak kuantitas non-finite / <= 0; tanpa
      // cabang ini alasannya tertutup cabang sumber-harga di bawah.
      else if (!Number.isFinite(it.quantity.value) || it.quantity.value <= 0) reason = `volume tidak valid (${it.quantity.value})`;
      // Fast Track (koordinator, residu w4 3.3 — cermin jalur standar).
      else if (!Number.isFinite(it.price.unitPrice) || it.price.unitPrice <= 0) reason = `harga satuan tidak valid (${it.price.unitPrice})`;
      else reason = `sumber harga "${it.price.source}" tidak dapat dipetakan ke baris RAB`;
      failures.push({ itemId: it.id, itemName: it.name, reason });
      continue;
    }
    const defect = mappedRowDefect(row);
    if (defect) {
      failures.push({ itemId: it.id, itemName: it.name, reason: defect });
      continue;
    }
    mapped.push(row);
  }
  return {
    savable,
    blockedCount: items.length - savable.length,
    needsReviewCount: 0,
    mapped,
    failures,
    gateBlockingItemCount: gateBlockingItems.length,
    gateBlockingItems,
    ok: savable.length > 0 && failures.length === 0,
  };
}

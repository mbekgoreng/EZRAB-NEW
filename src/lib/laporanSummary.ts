/**
 * laporanSummary — derivasi murni angka ringkasan untuk LaporanView (Fase 1:
 * Integritas Laporan).
 *
 * Aturan (selaras P0-B / scheduleHonesty): JANGAN menampilkan angka fiktif
 * sebagai fakta, dan JANGAN mengubah harga null menjadi 0 untuk
 * menyamarkan ketidaklengkapan.
 *
 * Definisi metrik:
 * - Amount item teresolusi (resolveItemAmount): `amount` bila berupa angka
 *   finite (termasuk 0 yang sah); bila `amount` null, hasil kali
 *   volume × unitPrice bila keduanya finite; selain itu null (item BELUM
 *   BERHARGA — harga belum tersedia, mis. alur DED menghasilkan
 *   unitPrice null lewat ahspPriceResolver).
 * - Total Item = jumlah item RAB proyek aktif (himpunan yang sama dengan
 *   yang dipakai rekapitulasi di view: projectRabItems).
 * - Kategori aktif / Terakumulasi N kategori = jumlah kategori distinct
 *   pada item (kategori kosong memakai nama fallback yang sama dengan
 *   rekap: 'Pekerjaan Utama').
 * - Total Nilai RAB = jumlah amount item yang BERHARGA saja. Tiga keadaan:
 *     COMPLETE  — semua item berharga → total biasa (Rp 0 sah bila
 *                 jumlahnya memang nol).
 *     PARTIAL   — sebagian berharga → total dari yang berharga, wajib
 *                 disertai sub-label "dari X dari Y item berharga".
 *     UNPRICED  — ada item tetapi tidak satu pun berharga → total TIDAK
 *                 dapat dihitung (null), bukan Rp 0.
 *     EMPTY     — tidak ada item sama sekali → total tidak dapat
 *                 dihitung (null).
 * - Total Volume = jumlah volume item yang volumenya finite, DIBATASI pada
 *   satuan dominan (satuan dengan item bervolume terbanyak; seri → satuan
 *   yang pertama muncul). Menjumlahkan volume lintas satuan (m³ + m² + Ls)
 *   ke satu angka berlabel m³ adalah kesalahan dimensi. Item tanpa volume
 *   finite TIDAK menyumbang dan TIDAK dianggap 0: jumlahnya dilaporkan
 *   lewat missingVolumeCount; item bervolume di luar satuan dominan
 *   dilaporkan lewat otherUnitItemCount.
 * - Progress (%) — denominator eksplisit, dua sumber berurutan:
 *     1) SCHEDULE_TASKS: rata-rata berbobot dari tugas jadwal proyek:
 *        Σ(weightPercent × actualProgressPercent) / Σ(weightPercent)
 *        (lihat computeScheduleProgress di scheduleHonesty; null bila
 *        tidak ada tugas / total bobot ≤ 0).
 *     2) PROJECT_FIELD: field `progress` tersimpan pada proyek (angka
 *        finite, dijepit 0..100).
 *   Selain itu null → UI menampilkan keadaan belum-ada-data.
 *   Klaim "Ahead schedule" TIDAK diturunkan di sini: view ini tidak
 *   mengonsumsi deviasi baseline-vs-aktual yang jujur (seri Kurva S-nya
 *   mensintesis realisasi dari project.progress), jadi klaim itu dihapus,
 *   bukan diganti angka karangan.
 */

import type { ScheduleTask } from '../types';
import { computeScheduleProgress } from './scheduleHonesty';

/** Bentuk minimal item RAB yang dibutuhkan ringkasan (RabItem kompatibel). */
export interface LaporanSummaryItem {
  category?: string | null;
  volume?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  amount?: number | null;
}

export type RabTotalState = 'EMPTY' | 'UNPRICED' | 'PARTIAL' | 'COMPLETE';

export type ProgressSource = 'SCHEDULE_TASKS' | 'PROJECT_FIELD';

export interface LaporanSummary {
  /** Jumlah item RAB proyek aktif. */
  totalItems: number;
  /** Jumlah kategori distinct pada item. */
  categoryCount: number;
  /** Item dengan amount teresolusi (berharga). */
  pricedItemCount: number;
  /** Item tanpa harga teresolusi (harga belum tersedia). */
  unpricedItemCount: number;
  /**
   * Total nilai RAB dari item berharga saja.
   * null = belum dapat dihitung (EMPTY/UNPRICED) — JANGAN dirender Rp 0.
   */
  totalRabValue: number | null;
  rabTotalState: RabTotalState;
  /** Jumlah volume pada satuan dominan (0 bila tidak ada volume tercatat). */
  totalVolume: number;
  /** Satuan dominan volume; null bila tidak ada item bervolume. */
  dominantVolumeUnit: string | null;
  /** Item dengan volume finite. */
  volumeItemCount: number;
  /** Item tanpa volume finite (tidak menyumbang, tidak dianggap 0). */
  missingVolumeCount: number;
  /** Item bervolume di luar satuan dominan (tidak ikut dijumlahkan). */
  otherUnitItemCount: number;
  /** Progress persen 0..100; null = belum ada data progress. */
  progressPercent: number | null;
  progressSource: ProgressSource | null;
  /** Jumlah tugas jadwal proyek (untuk sub-label sumber progress). */
  scheduleTaskCount: number;
}

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/**
 * Resolusi amount satu item. null berarti harga belum tersedia —
 * BUKAN nol. `amount` terekam selalu menang (termasuk 0 yang sah).
 */
export function resolveItemAmount(item: LaporanSummaryItem): number | null {
  if (isFiniteNumber(item.amount)) return item.amount;
  if (isFiniteNumber(item.volume) && isFiniteNumber(item.unitPrice)) {
    return item.volume * item.unitPrice;
  }
  return null;
}

const FALLBACK_CATEGORY = 'Pekerjaan Utama';

export function computeLaporanSummary(
  items: LaporanSummaryItem[] | null | undefined,
  scheduleTasks: ScheduleTask[] | null | undefined,
  projectProgress?: number | null
): LaporanSummary {
  const list = items ?? [];

  const categories = new Set<string>();
  let pricedItemCount = 0;
  let pricedTotal = 0;

  // Volume per satuan (hanya item bervolume finite).
  const volumeByUnit = new Map<string, { count: number; sum: number }>();
  let volumeItemCount = 0;

  for (const item of list) {
    const cat = (item.category ?? '').trim() || FALLBACK_CATEGORY;
    categories.add(cat);

    const amt = resolveItemAmount(item);
    if (amt !== null) {
      pricedItemCount += 1;
      pricedTotal += amt;
    }

    if (isFiniteNumber(item.volume)) {
      volumeItemCount += 1;
      const unit = (item.unit ?? '').trim();
      const entry = volumeByUnit.get(unit) ?? { count: 0, sum: 0 };
      entry.count += 1;
      entry.sum += item.volume;
      volumeByUnit.set(unit, entry);
    }
  }

  // Satuan dominan: item terbanyak; seri → kemunculan pertama (urutan Map).
  let dominantVolumeUnit: string | null = null;
  let totalVolume = 0;
  let dominantCount = 0;
  for (const [unit, entry] of volumeByUnit) {
    if (entry.count > dominantCount) {
      dominantCount = entry.count;
      dominantVolumeUnit = unit;
      totalVolume = entry.sum;
    }
  }

  const totalItems = list.length;
  const rabTotalState: RabTotalState =
    totalItems === 0
      ? 'EMPTY'
      : pricedItemCount === 0
        ? 'UNPRICED'
        : pricedItemCount < totalItems
          ? 'PARTIAL'
          : 'COMPLETE';

  // Progress: tugas jadwal dulu (denominator = total bobot tugas),
  // lalu field progress tersimpan pada proyek.
  let progressPercent: number | null = null;
  let progressSource: ProgressSource | null = null;
  const taskProgress = computeScheduleProgress(scheduleTasks ?? undefined);
  if (taskProgress !== null) {
    progressPercent = taskProgress;
    progressSource = 'SCHEDULE_TASKS';
  } else if (isFiniteNumber(projectProgress)) {
    progressPercent = Math.min(100, Math.max(0, projectProgress));
    progressSource = 'PROJECT_FIELD';
  }

  return {
    totalItems,
    categoryCount: categories.size,
    pricedItemCount,
    unpricedItemCount: totalItems - pricedItemCount,
    totalRabValue: pricedItemCount > 0 ? pricedTotal : null,
    rabTotalState,
    totalVolume,
    dominantVolumeUnit,
    volumeItemCount,
    missingVolumeCount: totalItems - volumeItemCount,
    otherUnitItemCount: volumeItemCount - dominantCount,
    progressPercent,
    progressSource,
    scheduleTaskCount: scheduleTasks?.length ?? 0,
  };
}

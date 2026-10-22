/**
 * kurvaSHonesty — derivasi Kurva S untuk Tab Kurva S LaporanView (Fase 4:
 * Audit Laporan & Ekspor).
 *
 * DASAR DATA (yang benar-benar ada di model data proyek):
 * - Kurva RENCANA: `projectKurvaSData` dari ProjectContext, dihitung
 *   UnifiedProjectEngine.recalculateScheduleAndKurvaS dari tugas jadwal
 *   TERSIMPAN (ScheduleTask): bobot tiap tugas (weightPercent — diturunkan
 *   ulang dari amount item RAB tertaut bila ada, selain itu bobot tersimpan)
 *   didistribusikan merata pada rentang minggu tugas (startWeek..endWeek).
 *   Tanpa tugas jadwal, engine mengembalikan [] — tidak ada basis jadwal,
 *   jadi kurva rencana TIDAK digambar.
 * - Kurva REALISASI per minggu: TIDAK ADA di model data. ScheduleTask hanya
 *   menyimpan progres aktual TERKINI per tugas (actualProgressPercent) —
 *   bukan riwayat mingguan. Menyebar snapshot itu ke minggu-minggu (cara
 *   lama: mengikuti trajektori rencana sampai project.progress, deviasi
 *   dipaksa 0,00) adalah fabrikasi seri waktu.
 *
 * ATURAN:
 * - actWeekly/actCum/dev SELALU null di sini → UI menampilkan "belum
 *   tersedia", bukan garis realisasi karangan dan bukan deviasi karangan.
 *   Progres aktual terkini tetap dapat ditampilkan sebagai ANGKA SNAPSHOT
 *   (lihat computeLaporanSummary.progressPercent), bukan sebagai kurva.
 * - TIDAK ada fallback total biaya karangan (dulu konstanta Rp150 juta) dan TIDAK
 *   ada sintesis urutan konstruksi dari seksi RAB (dulu generateKurvaSData
 *   CASE 2 di view ini): timing mingguan tanpa tugas jadwal adalah tebakan.
 * - Tugas ada tetapi total bobot rencana nol → kurva tidak tersedia
 *   (reason NO_WEIGHTS): garis 0% datar akan terbaca sebagai fakta palsu.
 */

import type { KurvaSDataPoint, ScheduleTask } from '../types';

export interface LaporanKurvaSWeek {
  week: string;
  planWeekly: number;
  planCum: number;
  /** Selalu null: riwayat realisasi mingguan tidak tersimpan di model data. */
  actWeekly: number | null;
  /** Selalu null: riwayat realisasi mingguan tidak tersimpan di model data. */
  actCum: number | null;
  /** Selalu null: deviasi butuh realisasi pada minggu yang sama. */
  dev: number | null;
}

export type KurvaSUnavailableReason = 'NO_TASKS' | 'NO_POINTS' | 'NO_WEIGHTS';

export interface LaporanKurvaS {
  /** true bila kurva rencana boleh digambar dari data jadwal tersimpan. */
  available: boolean;
  /** Alasan ketidaktersediaan (null bila available). */
  reason: KurvaSUnavailableReason | null;
  weeks: LaporanKurvaSWeek[];
  totalWeeks: number;
  /** Persen rencana kumulatif minggu terakhir; null bila tidak tersedia. */
  finalPlanCum: number | null;
}

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/**
 * Bangun seri Kurva S untuk Laporan HANYA dari keluaran engine jadwal
 * (projectKurvaSData) yang berbasis tugas tersimpan. Seri realisasi tidak
 * pernah disintesis.
 */
export function buildLaporanKurvaS(
  kurvaSData: KurvaSDataPoint[] | null | undefined,
  scheduleTasks: ScheduleTask[] | null | undefined
): LaporanKurvaS {
  const empty = (reason: KurvaSUnavailableReason): LaporanKurvaS => ({
    available: false,
    reason,
    weeks: [],
    totalWeeks: 0,
    finalPlanCum: null,
  });

  if (!scheduleTasks || scheduleTasks.length === 0) return empty('NO_TASKS');

  const points = (kurvaSData ?? []).filter(
    (p) => isFiniteNumber(p?.plannedWeeklyPercent) && isFiniteNumber(p?.cumulativePlannedPercent)
  );
  if (points.length === 0) return empty('NO_POINTS');

  const totalPlanned = points.reduce((s, p) => s + p.plannedWeeklyPercent, 0);
  if (!(totalPlanned > 0)) return empty('NO_WEIGHTS');

  const weeks: LaporanKurvaSWeek[] = points.map((p) => ({
    week: p.weekLabel,
    planWeekly: p.plannedWeeklyPercent,
    planCum: p.cumulativePlannedPercent,
    actWeekly: null,
    actCum: null,
    dev: null,
  }));

  return {
    available: true,
    reason: null,
    weeks,
    totalWeeks: weeks.length,
    finalPlanCum: weeks[weeks.length - 1].planCum,
  };
}

/**
 * — Varian Estimator Spreadsheet (`EstimatorKurvaSView`) —
 *
 * Tab Kurva S Estimator TIDAK berbasis tugas jadwal: distribusi bobotnya
 * diturunkan dari item RAB (bobot kategori = biaya kategori / total biaya).
 * Kriteria kejujurannya sama dengan Kurva S Laporan di atas:
 * - Tanpa data sumber (belum ada item RAB) → TIDAK tersedia (NO_ITEMS):
 *   tidak ada basis distribusi sama sekali.
 * - Item ada tetapi total biaya efektif nol → TIDAK tersedia (NO_WEIGHTS):
 *   seluruh bobot kategori bernilai nol, sehingga yang tergambar hanyalah
 *   kurva 0% datar dan "Total Biaya Rencana: Rp0" — keduanya akan terbaca
 *   sebagai fakta padahal tidak ada rencana apa pun di baliknya.
 * Resolusi biaya per item sama persis dengan yang dipakai komponen:
 * `amount`, atau `volume × unitPrice` bila amount kosong/nol.
 */
export type EstimatorKurvaSUnavailableReason = 'NO_ITEMS' | 'NO_WEIGHTS';

export interface EstimatorKurvaSAvailability {
  /** true bila kurva boleh digambar dari item RAB berharga. */
  available: boolean;
  /** Alasan ketidaktersediaan (null bila available). */
  reason: EstimatorKurvaSUnavailableReason | null;
  /** Total biaya efektif seluruh item (0 bila tidak tersedia). */
  totalAmount: number;
}

export function evaluateEstimatorKurvaS(
  items:
    | readonly {
        amount?: number | null;
        volume?: number | null;
        unitPrice?: number | null;
      }[]
    | null
    | undefined
): EstimatorKurvaSAvailability {
  const list = items ?? [];
  if (list.length === 0) {
    return { available: false, reason: 'NO_ITEMS', totalAmount: 0 };
  }

  let total = 0;
  for (const it of list) {
    const amt = it.amount || (it.volume || 0) * (it.unitPrice || 0);
    if (isFiniteNumber(amt)) total += amt;
  }
  if (!(total > 0)) {
    return { available: false, reason: 'NO_WEIGHTS', totalAmount: 0 };
  }

  return { available: true, reason: null, totalAmount: total };
}

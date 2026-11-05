import type { PlanId } from '../../../billing/plans';

/**
 * METADATA TAMPILAN PERBANDINGAN PAKET — LANDING PAGE
 * =====================================================
 * Sumber kebijakan: EZRAB — FINAL BILLING & SUBSCRIPTION SPECIFICATION v1.0
 * (§3 matriks entitlement, §3.5 total seat, §6 ketentuan transparansi).
 *
 * Harga, batas proyek, dan kredit AI bulanan TIDAK didefinisikan di sini —
 * ketiganya selalu dibaca dari konfigurasi kanonis src/billing/plans.ts
 * (sel 'projects' dan 'credits' di bawah diselesaikan saat render dari sana).
 * File ini hanya memuat matriks fitur tampilan + teks ketentuan, agar tidak
 * ada definisi paket kedua yang bisa menyimpang dari konfigurasi billing.
 *
 * CATATAN KETIDAKSESUAIAN (didokumentasikan, tidak diubah diam-diam):
 * - plans.ts masih menamai paket tertinggi 'Business' (id 'business');
 *   Spec v1.0 menamainya 'Advanced'. Nama tampil di landing mengikuti spec.
 * - plans.ts memberi Free kredit 'initial' 100 (kebijakan lama Phase 5.1);
 *   Spec v1.0 §4 menetapkan Free = 0 kredit AI dan tanpa alokasi otomatis.
 *   Landing menampilkan kredit BULANAN (Free = 0) sesuai spec.
 * - Entitlement di plans.ts (keputusan owner O-1..O-13, Okt 2026) belum
 *   diselaraskan ke Spec v1.0 (mis. AHSP Starter di plans.ts masih
 *   Cipta Karya saja; spec: semua kategori untuk paket berbayar).
 *   Penyelarasan plans.ts adalah pekerjaan billing terpisah dengan grant
 *   tersendiri — matriks tampilan di sini mengikuti Spec v1.0.
 */

export type PricingCell =
  | { t: 'yes' }
  | { t: 'limited' }
  | { t: 'no' }
  | { t: 'text'; v: string }
  /** Kuota terukur, dirender sebagai ✓ + teks (mis. '15/bulan'). */
  | { t: 'quota'; v: string }
  /** Diselesaikan dari plans.ts: batas proyek (null = Tanpa batas). */
  | { t: 'projects' }
  /** Diselesaikan dari plans.ts: kredit periodik per bulan (Free = 0). */
  | { t: 'credits' };

export interface PricingRow {
  label: string;
  values: Record<PlanId, PricingCell>;
}

export interface PricingCategory {
  id: string;
  title: string;
  note?: string;
  rows: PricingRow[];
}

const Y: PricingCell = { t: 'yes' };
const L: PricingCell = { t: 'limited' };
const N: PricingCell = { t: 'no' };
const T = (v: string): PricingCell => ({ t: 'text', v });
const Q = (v: string): PricingCell => ({ t: 'quota', v });

/** Nama tampil mengikuti Spec v1.0 (id kanonis 'business' = 'Advanced'). */
export const PLAN_DISPLAY_NAME: Record<PlanId, string> = {
  free: 'Free',
  starter: 'Starter',
  professional: 'Professional',
  business: 'Advanced',
};

/** Deskripsi target pengguna per paket (Spec v1.0 §2 positioning). */
export const PLAN_TAGLINE: Record<PlanId, string> = {
  free: 'Jelajahi EZRAB',
  starter: 'Untuk estimator individu',
  professional: 'Untuk estimator profesional & tim kecil',
  business: 'Untuk kontraktor & perusahaan',
};

/** Total seat per paket — baseline Spec v1.0 §3.5 (mencakup Owner/Admin). */
export const PLAN_TOTAL_SEATS: Record<PlanId, number> = {
  free: 1,
  starter: 1,
  professional: 6,
  business: 10,
};

export const PRICING_CATEGORIES: PricingCategory[] = [
  {
    id: 'rab',
    title: 'A. RAB & Manajemen Proyek',
    note: 'Semua paket memakai mesin hitung dan ketepatan numerik yang sama — akurasi perhitungan tidak pernah diturunkan untuk paket apa pun.',
    rows: [
      { label: 'RAB Manual', values: { free: Y, starter: Y, professional: Y, business: Y } },
      { label: 'Perhitungan Volume', values: { free: L, starter: Y, professional: Y, business: Y } },
      { label: 'QTO', values: { free: L, starter: L, professional: Y, business: Y } },
      { label: 'Template RAB', values: { free: L, starter: Y, professional: Y, business: Y } },
      { label: 'Manajemen Proyek', values: { free: L, starter: L, professional: Y, business: Y } },
      { label: 'Laporan Proyek', values: { free: L, starter: L, professional: Y, business: Y } },
      { label: 'Proyek Aktif', values: { free: { t: 'projects' }, starter: { t: 'projects' }, professional: { t: 'projects' }, business: { t: 'projects' } } },
    ],
  },
  {
    id: 'ahsp',
    title: 'B. Akses AHSP 2026',
    note: 'Harga yang belum tersedia tetap ditahan sebagai belum tersedia — tidak pernah ditampilkan sebagai harga resmi atau diganti angka karangan, di semua paket.',
    rows: [
      { label: 'AHSP Cipta Karya', values: { free: Y, starter: Y, professional: Y, business: Y } },
      { label: 'AHSP Sumber Daya Air', values: { free: N, starter: Y, professional: Y, business: Y } },
      { label: 'AHSP Bina Marga', values: { free: N, starter: Y, professional: Y, business: Y } },
      { label: 'AHSP SMKK', values: { free: N, starter: Y, professional: Y, business: Y } },
      { label: 'Item Manual / Non-AHSP', values: { free: Y, starter: Y, professional: Y, business: Y } },
    ],
  },
  {
    id: 'ai',
    title: 'C. Fitur AI',
    note: 'AI membantu membaca dokumen, mengidentifikasi item pekerjaan, mencocokkan referensi, dan menyusun draf. Koefisien, harga resmi, volume, dan total RAB selalu berasal dari database dan mesin hitung EZRAB — bukan dari AI. Kredit AI dihitung dari pemakaian aktual, bukan jumlah generasi.',
    rows: [
      { label: 'RAB AI', values: { free: N, starter: L, professional: Y, business: Y } },
      { label: 'Chat AI', values: { free: N, starter: L, professional: Y, business: Y } },
      { label: 'Dokumen AI', values: { free: N, starter: L, professional: Y, business: Y } },
      { label: 'Custom Instructions', values: { free: N, starter: N, professional: Y, business: Y } },
      { label: 'Kredit AI per Bulan', values: { free: { t: 'credits' }, starter: { t: 'credits' }, professional: { t: 'credits' }, business: { t: 'credits' } } },
    ],
  },
  {
    id: 'ekspor',
    title: 'D. Ekspor',
    note: 'Kuota Free diperbarui setiap bulan kalender; kuota paket berbayar diperbarui setelah siklus tagihan berhasil dibayar. Hanya ekspor yang berhasil yang mengurangi kuota. Ekspor tanpa batas tetap tunduk pada pencegahan penyalahgunaan yang wajar.',
    rows: [
      { label: 'Ekspor PDF', values: { free: Q('15/bulan'), starter: Q('50/siklus'), professional: T('Tanpa batas'), business: T('Tanpa batas') } },
      { label: 'Ekspor Excel', values: { free: Q('1/bulan'), starter: Q('30/siklus'), professional: T('Tanpa batas'), business: T('Tanpa batas') } },
    ],
  },
  {
    id: 'tim',
    title: 'E. Role Team & Kolaborasi',
    rows: [
      { label: 'Role Team', values: { free: N, starter: N, professional: Y, business: Y } },
      { label: 'Undangan Anggota Tim', values: { free: N, starter: N, professional: Y, business: Y } },
      { label: 'Akses Proyek Bersama', values: { free: N, starter: N, professional: Y, business: Y } },
      { label: 'Izin Berbasis Peran', values: { free: N, starter: N, professional: Y, business: Y } },
      { label: 'Riwayat Aktivitas', values: { free: N, starter: N, professional: Y, business: Y } },
      { label: 'Pembagian Tanggung Jawab Tugas', values: { free: N, starter: N, professional: Y, business: Y } },
      { label: 'Pemantauan Perubahan RAB', values: { free: N, starter: N, professional: Y, business: Y } },
      { label: 'Review & Persetujuan', values: { free: N, starter: N, professional: Y, business: Y } },
      { label: 'Total Seat (termasuk Owner/Admin)', values: { free: T(String(PLAN_TOTAL_SEATS.free)), starter: T(String(PLAN_TOTAL_SEATS.starter)), professional: T(String(PLAN_TOTAL_SEATS.professional)), business: T(String(PLAN_TOTAL_SEATS.business)) } },
    ],
  },
];

/** Ketentuan billing transparan (Spec v1.0 §4–§11), ditampilkan apa adanya. */
export const BILLING_TRANSPARENCY_POINTS: string[] = [
  'Paket Free berlaku selamanya — bukan uji coba berbatas waktu dan tidak memiliki tanggal kedaluwarsa.',
  'Paket berbayar berjalan sebagai langganan berkala per siklus tagihan.',
  'Kredit langganan diperbarui hanya setelah pembayaran berhasil — pembayaran pending atau gagal tidak menghasilkan alokasi baru.',
  'Sisa kredit langganan yang memenuhi syarat mengikuti kebijakan rollover maksimal 30 hari.',
  'Kredit top-up tidak kedaluwarsa dan tidak hilang saat paket berubah atau langganan berakhir.',
  'Upgrade aktif seketika setelah pembayaran berhasil, dengan harga prorata untuk sisa periode.',
  'Downgrade berlaku mulai periode tagihan berikutnya — hak paket lama tetap utuh sampai periode berakhir.',
  'Membatalkan perpanjangan otomatis tidak langsung menghapus akses berbayar Anda.',
  'Data dan proyek tidak dihapus ketika langganan berakhir; proyek berlebih menjadi hanya-baca di paket Free.',
];

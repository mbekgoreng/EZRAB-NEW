/**
 * mobileV3Utils — fungsi murni lapisan presentasi mode HP v3.
 *
 * Dipisahkan dari MobileV3.tsx (Workstream E, FINISH MODE) supaya bisa
 * diuji di runner Node/tsx tanpa mengimpor berkas aset gambar. MobileV3
 * mengimpor + mengekspor ulang semuanya dari sini; perilaku tidak berubah.
 */
import type { Project } from '../../types';

export const formatRpShort = (val: number): string => {
  if (!val || val <= 0) return 'Rp 0';
  if (val >= 1e9) {
    const m = val / 1e9;
    return `Rp ${m >= 10 ? m.toFixed(1).replace('.', ',') : m.toFixed(2).replace('.', ',')} M`;
  }
  if (val >= 1e6) return `Rp ${Math.round(val / 1e6)} jt`;
  if (val >= 1e3) return `Rp ${Math.round(val / 1e3)} rb`;
  return `Rp ${Math.round(val)}`;
};

export const formatRpFull = (val: number): string =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val || 0);

type StatusMeta = { label: string; color: string };
export const projectStatusMeta = (p: Project): StatusMeta => {
  const s = (p.status || 'draft') as string;
  if (s === 'in_progress') return { label: 'Sedang Dikerjakan', color: '#16A34A' };
  if (s === 'completed' || s === 'approved' || s === 'COMPLETED') return { label: 'Selesai', color: '#2563EB' };
  if (s === 'archived' || p.isArchived) return { label: 'Arsip', color: '#94A3B8' };
  return { label: 'Draft', color: '#F59E0B' };
};

/** Foto ilustrasi deterministik per urutan proyek (BUKAN foto proyek asli —
 * gambar generate AI dari mockup; proyek ke-4 dst. memakai siklus yang sama).
 * Daftar URL disuntik MobileV3 lewat setProyekPhotos() saat modul dimuat —
 * modul ini sendiri bebas impor aset agar bisa diuji di runner Node. */
export let PROYEK_PHOTOS: string[] = [];
export const setProyekPhotos = (photos: string[]): void => {
  PROYEK_PHOTOS = photos;
};
export const projectPhoto = (index: number): string =>
  PROYEK_PHOTOS.length > 0 ? PROYEK_PHOTOS[index % PROYEK_PHOTOS.length] : '';

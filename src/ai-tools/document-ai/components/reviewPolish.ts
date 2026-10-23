/**
 * REVIEW & POLISH — logika murni panel periksa (polish §6–§7).
 *
 * - Pengelompokan temuan per kategori §7 dengan heading Indonesia; grup
 *   kosong tidak dirender; di dalam grup temuan terurut severity
 *   (tinggi → sedang → rendah), stabil untuk severity yang sama.
 * - Preset poles dokumen §6: SATU transformasi per klik lewat
 *   REVISE_DOCUMENT yang sudah ada (bukan pipeline baru). Setiap instruksi
 *   preset menegaskan fakta/angka/penanda [ISI: ...] dipertahankan —
 *   poles tidak pernah dipakai menutupi data yang belum ada.
 */
import { REVIEW_CATEGORIES, type ReviewCategory, type ReviewFinding, type ReviewSeverity } from '../types';

export const REVIEW_CATEGORY_LABELS: Record<ReviewCategory, string> = {
  kelengkapan: 'Kelengkapan data',
  konsistensi: 'Konsistensi',
  struktur: 'Struktur dokumen',
  bahasa: 'Bahasa dan keterbacaan',
  sumber: 'Sumber dan verifikasi',
};

export interface FindingGroup {
  category: ReviewCategory;
  label: string;
  findings: ReviewFinding[];
}

const SEVERITY_ORDER: Record<ReviewSeverity, number> = { high: 0, medium: 1, low: 2 };

/**
 * Kelompokkan temuan mengikuti urutan resmi REVIEW_CATEGORIES. Kategori
 * tak dikenal (tidak seharusnya terjadi — review.ts selalu mengisi
 * kategori) dikelompokkan apa adanya di akhir agar tidak ada temuan yang
 * hilang diam-diam.
 */
export function groupFindingsByCategory(findings: ReviewFinding[]): FindingGroup[] {
  const byCategory = new Map<string, ReviewFinding[]>();
  for (const f of findings) {
    const list = byCategory.get(f.category) ?? [];
    list.push(f);
    byCategory.set(f.category, list);
  }
  const groups: FindingGroup[] = [];
  const pushGroup = (category: string) => {
    const list = byCategory.get(category);
    if (!list || list.length === 0) return;
    const sorted = [...list].sort(
      (a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3),
    );
    groups.push({
      category: category as ReviewCategory,
      label: REVIEW_CATEGORY_LABELS[category as ReviewCategory] ?? category,
      findings: sorted,
    });
    byCategory.delete(category);
  };
  for (const c of REVIEW_CATEGORIES) pushGroup(c);
  for (const c of [...byCategory.keys()]) pushGroup(c);
  return groups;
}

/* ------------------------------------------------------------------ */
/* Preset poles dokumen (polish §6)                                    */
/* ------------------------------------------------------------------ */

export interface PolishPreset {
  id: string;
  label: string;
  /** Instruksi terkurasi yang dikirim sebagai instruksi REVISE_DOCUMENT. */
  instruction: string;
  /** Preset ini meneruskan templateMeta draf ke handler revisi. */
  usesTemplateMeta?: boolean;
}

const PRESERVE =
  'Pertahankan SEMUA fakta, angka, nama, tanggal, nomor dokumen, nilai, dan penanda [ISI: ...] persis seperti aslinya — jangan mengarang, menambah, atau menghilangkan data; bagian yang datanya memang belum ada tetap ditandai [ISI: ...].';

/** Empat preset poles berbasis revisi AI (preset kelima, Periksa
    Kelengkapan, adalah menjalankan review deterministik — bukan revisi). */
export const POLISH_PRESETS: readonly PolishPreset[] = [
  {
    id: 'sempurnakan-bahasa',
    label: 'Sempurnakan Bahasa',
    instruction: `Sempurnakan bahasa seluruh dokumen: perbaiki gaya bahasa, kejelasan kalimat, dan keterbacaan di semua bagian. ${PRESERVE}`,
  },
  {
    id: 'rapikan-struktur',
    label: 'Rapikan Struktur',
    instruction: `Rapikan struktur dokumen: perbaiki urutan bagian, konsistensi judul/heading, dan kerapian format penyajian agar mengikuti alur dokumen resmi. Isi setiap bagian dipertahankan — yang diubah susunannya, bukan isinya. ${PRESERVE}`,
  },
  {
    id: 'lebih-profesional',
    label: 'Buat Lebih Profesional',
    instruction: `Buat penyajian dokumen ini lebih profesional: samakan konsistensi istilah, sapaan, ejaan, dan gaya bahasa formal di seluruh dokumen. ${PRESERVE}`,
  },
  {
    id: 'sesuaikan-template',
    label: 'Sesuaikan Template',
    instruction: `Sesuaikan struktur dokumen ini dengan kerangka template yang dilampirkan pada permintaan ini: susun ulang bagian-bagian mengikuti scaffold template dan pindahkan isi yang sudah ada ke bagian yang sesuai. Bagian template yang datanya belum ada di dokumen tandai [ISI: ...] — jangan diisi karangan. ${PRESERVE}`,
    usesTemplateMeta: true,
  },
] as const;

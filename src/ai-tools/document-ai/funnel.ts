/**
 * AI DOKUMEN — Funnel "Mau bikin apa?" (logika murni, tanpa React/DOM).
 *
 * Di-ACC owner 2026-11-20 (mockup `document-ai-funnel-mockup`, sesudah 6
 * revisi): pembuatan dokumen dimulai dari TUJUAN, bukan dari alat — satu
 * pertanyaan "Mau bikin apa?" dengan kartu kategori, lalu semakin mengerucut
 * (kategori → dokumen → custom prompt + tanggal → periksa → selesai).
 *
 * Prinsip: pengguna HANYA mengisi isi pokok (custom prompt) + tanggal;
 * struktur, bahasa formal, dan pasal standar disusun AI dari template.
 * Modul ini TIDAK memanggil AI: penyempurnaan prompt (tombol ✨ AI) adalah
 * pembingkaian deterministik atas teks pengguna sendiri + nama dokumen —
 * tanpa fakta baru, tanpa panggilan berbayar.
 *
 * Sumber kebenaran katalog: TEMPLATE_CATEGORIES + TEMPLATE_META
 * (docTemplates.ts) + EXTRA_BUILTIN_TEMPLATES. Label subjenis dibaca dari
 * TEMPLATE_META saat runtime (bukan diduplikasi di sini) agar tidak drift;
 * label template laporan/QC/rapat/bebas adalah nama katalognya (diuji
 * silang terhadap EXTRA_BUILTIN_TEMPLATES + dictionaries.ts).
 */

import {
  EXTRA_BUILTIN_TEMPLATES,
  TEMPLATE_CATEGORIES,
  TEMPLATE_META,
  type TemplateCategory,
} from './docTemplates';

/** Label 5 langkah funnel (pola DED v4). */
export const FUNNEL_STEPS = [
  'Mau bikin apa?',
  'Pilih dokumen',
  'Custom Prompt',
  'Periksa',
  'Selesai',
] as const;

/** Batas karakter custom prompt (sesuai mockup: penghitung 0/600). */
export const FUNNEL_PROMPT_MAX = 600;

/** Kategori funnel langkah 1: 6 kategori katalog + kartu "Dokumen bebas". */
export type FunnelCategoryId = TemplateCategory | 'bebas';

export const FUNNEL_CATEGORIES: Array<{ id: FunnelCategoryId; label: string }> = [
  ...TEMPLATE_CATEGORIES,
  { id: 'bebas', label: 'Dokumen Bebas' },
];

/** Satu pilihan dokumen pada langkah 2 funnel. */
export interface FunnelChoice {
  /** Kunci stabil: `${templateId}` atau `${templateId}:${subtypeId}`. */
  key: string;
  /** Label tampil (nama katalog / label subjenis asli). */
  label: string;
  /** Deskripsi singkat dari katalog (bila ada). */
  desc?: string;
  templateId: string;
  subtypeId?: string;
}

const choiceKey = (templateId: string, subtypeId?: string): string =>
  subtypeId ? `${templateId}:${subtypeId}` : templateId;

/** Nama katalog template tanpa subjenis (diuji silang ke sumbernya). */
const TEMPLATE_DISPLAY_NAMES: Record<string, string> = {
  'laporan-harian': 'Laporan Harian',
  'laporan-mingguan': 'Laporan Mingguan',
  'laporan-k3': 'Laporan K3',
  'checklist-qc': 'Checklist QC',
  notulen: 'Notulen Rapat',
  bebas: 'Dokumen Bebas',
};

/** Deskripsi katalog untuk template tanpa subjenis. */
const TEMPLATE_DESCS: Record<string, string> = {
  'laporan-harian': 'Realisasi pekerjaan, sumber daya, dan kendala hari ini.',
  'laporan-mingguan': 'Progres mingguan: rencana vs realisasi, kendala, dan rencana minggu depan.',
  'laporan-k3': 'Laporan keselamatan kerja: inspeksi, temuan, dan tindak lanjut.',
  'checklist-qc': 'Pemeriksaan mutu pekerjaan dengan kriteria dari spesifikasi proyek.',
  notulen: 'Catatan rapat: agenda, pembahasan, keputusan, dan tindak lanjut.',
  bebas: 'Dokumen bebas — AI menyusun struktur dari prompt Anda.',
};

function subtypeChoices(templateId: string): FunnelChoice[] {
  const meta = TEMPLATE_META[templateId];
  if (!meta?.subtypes) return [];
  return meta.subtypes.map((s) => ({
    key: choiceKey(templateId, s.id),
    // Label dibaca dari katalog (bukan diduplikasi) — satu sumber kebenaran.
    label: s.label,
    templateId,
    subtypeId: s.id,
  }));
}

function templateChoice(templateId: string): FunnelChoice | null {
  const meta = TEMPLATE_META[templateId];
  if (!meta) return null;
  const extra = EXTRA_BUILTIN_TEMPLATES.find((t) => t.id === templateId);
  return {
    key: choiceKey(templateId),
    label: TEMPLATE_DISPLAY_NAMES[templateId] ?? extra?.name ?? templateId,
    desc: TEMPLATE_DESCS[templateId] ?? extra?.desc,
    templateId,
  };
}

/**
 * Pilihan langkah 2 per kategori — SESUAI desain yang di-ACC owner:
 * - Surat: 6 subjenis template `surat` (dari TEMPLATE_META, bukan hardcode).
 * - Berita Acara: 5 subjenis template `berita-acara`.
 * - Laporan: Harian, Mingguan, K3 (tiga template terpisah; K3 diletakkan di
 *   Laporan sesuai keputusan owner — bukan di QC seperti pengelompokan
 *   katalog TEMPLATE_CATEGORY_BY_ID).
 * - QC: Checklist QC saja.
 * - Rapat: Notulen Rapat saja.
 * - Penawaran dan Tender: TIDAK ada pilihan template — kategori ini
 *   menampilkan kartu info "Paket 18 dokumen tender" yang mengarah ke
 *   wizard Tender yang sudah ada (Dokumen Proyek).
 * - Dokumen bebas: template `bebas`.
 */
export function funnelChoicesFor(category: FunnelCategoryId): FunnelChoice[] {
  switch (category) {
    case 'surat-administrasi':
      return subtypeChoices('surat');
    case 'berita-acara':
      return subtypeChoices('berita-acara');
    case 'laporan':
      return ['laporan-harian', 'laporan-mingguan', 'laporan-k3']
        .map(templateChoice)
        .filter((c): c is FunnelChoice => c !== null);
    case 'qc-k3':
      return [templateChoice('checklist-qc')].filter((c): c is FunnelChoice => c !== null);
    case 'rapat':
      return [templateChoice('notulen')].filter((c): c is FunnelChoice => c !== null);
    case 'penawaran-tender':
      return [];
    case 'bebas':
      return [templateChoice('bebas')].filter((c): c is FunnelChoice => c !== null);
    default:
      return [];
  }
}

/** Semua pilihan funnel (untuk validasi/tes). */
export function allFunnelChoices(): FunnelChoice[] {
  return FUNNEL_CATEGORIES.flatMap((c) => funnelChoicesFor(c.id));
}

/* ------------------------------------------------------------------ */
/* Contoh prompt (teks revisi owner 2026-11-20 — JANGAN diubah tanpa   */
/* persetujuan owner). Hanya 10 dokumen yang punya contoh terverifikasi */
/* owner; dokumen lain TIDAK diberi contoh karangan — chip contoh      */
/* disembunyikan untuknya dan tombol ✨ AI tetap bekerja atas ketikan   */
/* pengguna sendiri.                                                   */
/* ------------------------------------------------------------------ */

export const FUNNEL_EXAMPLE_PROMPTS: Record<string, string> = {
  'surat:permohonan':
    'Mohon izin lembur pekerjaan pengecoran balok lantai 2 pada hari Sabtu karena jadwal pengecoran mundur 3 hari',
  'surat:pemberitahuan':
    'Pemberitahuan jadwal pemadaman listrik sementara pada hari Minggu untuk pekerjaan instalasi panel utama',
  'berita-acara:serah-terima':
    'Pekerjaan pemasangan atap baja ringan blok B selesai 100 persen dan siap diperiksa untuk diserahterimakan',
  'berita-acara:pemeriksaan':
    'Pemeriksaan hasil pekerjaan plesteran dinding lantai 1 bersama pengawas sebelum lanjut ke pengecatan',
  'laporan-harian':
    'Pemasangan bekisting kolom lantai 2 grid D sampai F, cuaca berawan, 15 pekerja, satu unit mixer rusak ringan',
  'laporan-mingguan':
    'Minggu ini progres pengecoran pelat lantai 2 mencapai 80 persen, pengiriman besi beton terlambat 2 hari',
  notulen:
    'Rapat koordinasi mingguan membahas keterlambatan pengiriman besi beton dan penyesuaian jadwal pengecoran',
  'checklist-qc':
    'Pemeriksaan mutu beton ready mix K-300 sebelum pengecoran pelat lantai 2',
  'surat:undangan':
    'Undangan rapat evaluasi progres bulanan untuk konsultan pengawas dan kontraktor pelaksana',
  'surat:penyampaian-laporan':
    'Penyampaian laporan progres mingguan ke-12 kepada pemilik proyek',
};

/** Contoh prompt untuk satu pilihan (undefined bila owner belum memberi contoh). */
export function examplePromptFor(choice: FunnelChoice): string | undefined {
  return FUNNEL_EXAMPLE_PROMPTS[choice.key];
}

/* ------------------------------------------------------------------ */
/* Penyempurnaan prompt (tombol ✨ AI) — deterministik, tanpa AI.      */
/* ------------------------------------------------------------------ */

/**
 * Membingkai prompt ketikan pengguna menjadi prompt yang lebih lengkap dan
 * formal — persis perilaku mockup: "Buatkan {nama dokumen} berdasarkan
 * keterangan berikut: {prompt}. Susun dengan struktur lengkap dan bahasa
 * formal sesuai standar dokumen proyek." Hasil dipotong di 600 karakter.
 * Mengembalikan null bila prompt kosong (pemanggil mengisi contoh bila ada).
 * Sudah-ditingkatkan (diawali "Buatkan ") dikembalikan apa adanya.
 */
export function enhanceFunnelPrompt(prompt: string, docLabel: string): string | null {
  const text = (prompt || '').trim();
  if (!text) return null;
  if (/^Buatkan\s/i.test(text)) return text.slice(0, FUNNEL_PROMPT_MAX);
  const framed =
    `Buatkan ${docLabel} berdasarkan keterangan berikut: ${text} ` +
    'Susun dengan struktur lengkap dan bahasa formal sesuai standar dokumen proyek.';
  return framed.slice(0, FUNNEL_PROMPT_MAX);
}

/* ------------------------------------------------------------------ */
/* Tanggal dokumen                                                     */
/* ------------------------------------------------------------------ */

/** Tanggal hari ini sebagai YYYY-MM-DD (nilai default input date). */
export function todayDateString(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Format tanggal ISO (YYYY-MM-DD) menjadi "20 November 2026" (id-ID). */
export function formatFunnelDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate || '');
  if (!m) return isoDate || '';
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(dt.getTime())) return isoDate;
  try {
    return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return isoDate;
  }
}

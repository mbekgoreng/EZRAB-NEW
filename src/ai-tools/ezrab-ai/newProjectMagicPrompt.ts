/**
 * newProjectMagicPrompt — penyintesis prompt + sapaan Magic AI dari
 * FORM Step 1 alur proyek baru (CreateProjectModal).
 *
 * PURE — tidak mengimpor registry, service, atau state apa pun; hanya
 * tipe `BuildingType`. Dipakai modal untuk:
 *  (1) mengisi awal (prefill) textarea Magic AI dari data form yang
 *      sudah tervalidasi, dan
 *  (2) membangun sapaan hangat + chip saran yang diteruskan lewat
 *      konteks entry (`greeting` / `greetingSuggestions`).
 *
 * Aturan budget (D5): budget form adalah BATAS ATAS (maksimal), bukan
 * target yang harus dihabiskan. Prompt WAJIB memuat frasa
 * "anggaran maksimal Rp…" agar rantai ask-back D5 dapat melihat budget
 * — nilai form saja tidak terbaca rantai itu (hanya prompt atau
 * budgetCapOverride yang dibaca).
 */
import type { BuildingType } from '../../types';

/** Data form Step 1 yang dibutuhkan penyintesis (nama satu-satunya wajib). */
export interface NewProjectFormInput {
  name: string;
  clientName?: string;
  location?: string;
  buildingType?: BuildingType;
  /** Luas bangunan (m²). */
  buildingAreaM2?: number;
  /** Luas lahan (m²). */
  landAreaM2?: number;
  floorCount?: number;
  /** Budget MAKSIMAL dalam rupiah (batas atas, bukan target). */
  maxBudgetRp?: number;
  /** Tanggal mulai 'YYYY-MM-DD'. */
  startDate?: string;
  notes?: string;
}

/* ------------------------------------------------------------------ */
/* Format tampilan (Bahasa Indonesia)                                  */
/* ------------------------------------------------------------------ */

/** 850000000 -> "Rp850.000.000"; 0/negatif/NaN -> null (tidak ditulis). */
export function formatRupiahId(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return `Rp${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.round(value))}`;
}

/**
 * Format digit mentah input budget menjadi tampilan berkelompok id-ID
 * ("850000000" -> "850.000.000"). Input non-digit diabaikan; string
 * kosong tetap kosong (bukan "0").
 */
export function formatBudgetInputDigits(digits: string): string {
  const clean = (digits || '').replace(/[^0-9]/g, '');
  if (!clean) return '';
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number(clean));
}

/** "2026-12-01" -> "1 Desember 2026" (parse manual, tanpa geser zona waktu). */
export function formatDateId(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null;
  const m = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  const month = months[Number(m[2]) - 1];
  if (!month) return null;
  return `${Number(m[3])} ${month} ${m[1]}`;
}

/** 120 -> "120 m²"; 1250.5 -> "1.250,5 m²"; null/0/NaN -> null. */
function formatAreaM2(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(value)} m²`;
}

/* ------------------------------------------------------------------ */
/* Prompt Magic AI dari form                                           */
/* ------------------------------------------------------------------ */

/**
 * Sintesis prompt Magic AI dari form Step 1. Budget SELALU ditulis
 * sebagai "anggaran maksimal Rp…" bila diisi; bila kosong, frasa itu
 * TIDAK muncul (tidak ada angka karangan).
 */
export function buildNewProjectMagicPrompt(form: NewProjectFormInput): string {
  const name = (form.name || '').trim() || 'Proyek Baru';
  const lines: string[] = [
    `Buatkan RAB untuk proyek ${name}.`,
  ];
  if (form.buildingType) lines.push(`Kategori: ${form.buildingType}.`);
  const buildingArea = formatAreaM2(form.buildingAreaM2);
  const landArea = formatAreaM2(form.landAreaM2);
  if (buildingArea && landArea) {
    lines.push(`Luas bangunan ${buildingArea}, luas lahan ${landArea}.`);
  } else if (buildingArea) {
    lines.push(`Luas bangunan ${buildingArea}.`);
  } else if (landArea) {
    lines.push(`Luas lahan ${landArea}.`);
  }
  if (form.floorCount != null && Number.isFinite(form.floorCount) && form.floorCount > 0) {
    lines.push(`Jumlah lantai: ${form.floorCount} lantai.`);
  }
  const budget = formatRupiahId(form.maxBudgetRp);
  if (budget) {
    lines.push(`Anggaran maksimal ${budget}.`);
  }
  if (form.location && form.location.trim()) {
    lines.push(`Lokasi: ${form.location.trim()}.`);
  }
  const start = formatDateId(form.startDate);
  if (start) lines.push(`Rencana mulai: ${start}.`);
  if (form.clientName && form.clientName.trim()) {
    lines.push(`Klien: ${form.clientName.trim()}.`);
  }
  if (form.notes && form.notes.trim()) {
    lines.push(`Catatan: ${form.notes.trim()}`);
  }
  lines.push(
    'Susun RAB lengkap dengan analisa harga satuan (AHSP) dan total estimasi.',
  );
  if (budget) {
    lines.push(
      `Anggaran di atas adalah anggaran maksimal — jangan melebihi anggaran maksimal ${budget}; bila total perkiraan melewatinya, tanyakan dulu sebelum melanjutkan.`,
    );
  }
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Sapaan + chip saran                                                 */
/* ------------------------------------------------------------------ */

/** Urutan kanonis chip saran kategori di sapaan Magic AI. */
export const NEW_PROJECT_GREETING_SUGGESTIONS: readonly string[] = [
  'Rumah Tinggal',
  'Landscape & Taman',
  'Gudang',
  'Drainase',
  'Jembatan',
  'Renovasi',
];

/** Kategori form -> label chip (null = tidak ada chip yang cocok). */
function suggestionChipFor(buildingType: BuildingType | undefined): string | null {
  switch (buildingType) {
    case 'Rumah Tinggal':
      return 'Rumah Tinggal';
    case 'Landscape & Kawasan':
      return 'Landscape & Taman';
    case 'Gudang & Pabrik':
      return 'Gudang';
    case 'Drainase & Sanitasi':
      return 'Drainase';
    case 'Jembatan & Struktur Khusus':
      return 'Jembatan';
    case 'Renovasi':
    case 'Renovasi & Maintenance':
      return 'Renovasi';
    default:
      return null;
  }
}

/**
 * Chip saran: tepat 6 chip kanonis, dengan kategori form (bila cocok)
 * di urutan pertama, sisanya mengikuti urutan kanonis, tanpa duplikat.
 */
export function buildNewProjectGreetingSuggestions(form: NewProjectFormInput): string[] {
  const first = suggestionChipFor(form.buildingType);
  const rest = NEW_PROJECT_GREETING_SUGGESTIONS.filter((chip) => chip !== first);
  return first ? [first, ...rest] : [...rest];
}

/**
 * Sapaan hangat pembuka Magic AI: memakai nama proyek, dan bila budget
 * diisi menegaskan budget sebagai BATAS ATAS (bukan target).
 */
export function buildNewProjectGreeting(form: NewProjectFormInput): string {
  const name = (form.name || '').trim() || 'proyek baru Anda';
  const budget = formatRupiahId(form.maxBudgetRp);
  const category = form.buildingType ? ` (${form.buildingType})` : '';
  const budgetSentence = budget
    ? ` Anggaran maksimal ${budget} akan saya jadikan batas atas — bila total perkiraan melewatinya, saya akan bertanya dulu sebelum melanjutkan.`
    : '';
  return (
    `Halo! Saya siap menyusun RAB untuk ${name}${category}.${budgetSentence} ` +
    'Ceritakan detail proyeknya, atau pilih salah satu contoh di bawah ini.'
  );
}

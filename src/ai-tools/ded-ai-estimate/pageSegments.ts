/**
 * pageSegments.ts — paginasi halaman DED tanpa pemotongan teks.
 *
 * Perintah owner 2026-11-19: DED + Document AI tanpa batas pemrosesan.
 * Halaman yang terlalu panjang untuk satu request gateway TIDAK lagi
 * dipotong (slice(0, 4000) lama) — melainkan dipecah menjadi SEGMENT
 * (bagian 1/j, 2/j, …) yang masing-masing dikirim utuh dalam pass
 * terpisah. Tidak ada satu karakter pun yang dibuang oleh paginasi ini.
 *
 * Segmen dipecah pada batas KATA terakhir sebelum anggaran (agar token
 * seperti "4000 x 150 x 200 mm" tidak terbelah di tengah angka); hanya
 * token tunggal yang lebih panjang dari anggaran yang dipotong keras.
 *
 * Modul ini murni (tanpa I/O) dan dipakai bersama oleh mesin standar
 * (ded-ai-estimate/service.ts) dan mesin Full AI
 * (ded-full-ai/service.ts).
 */
import type { SelectedPage } from './analysisTrace';

/** Satu segmen halaman: halaman utuh, atau satu bagian dari halaman panjang. */
export interface DedPageSegment extends SelectedPage {
  /** Nomor bagian 1-based — hanya ada bila halaman dipecah (partCount > 1). */
  partIndex?: number;
  /** Jumlah bagian halaman ini — hanya ada bila halaman dipecah. */
  partCount?: number;
}

/** Margin keamanan (karakter) untuk header segmen + pertumbuhan safePrompt. */
export const SEGMENT_MEASURE_MARGIN_CHARS = 200;

/** Anggaran segmen minimum — di bawah ini planDedPasses yang memutuskan skip. */
export const MIN_SEGMENT_CHARS = 1000;

/**
 * Turunkan anggaran segmen dari pengukuran request kosong yang terukur
 * (system + prompt tanpa halaman) agar setiap segmen, dikirim sendirian,
 * dijamin muat dalam anggaran request.
 */
export function segmentBudgetFromEmptyRequest(
  emptyRequestChars: number,
  requestBudgetChars: number,
): number {
  const budget = requestBudgetChars - emptyRequestChars - SEGMENT_MEASURE_MARGIN_CHARS;
  return Math.max(MIN_SEGMENT_CHARS, budget);
}

/**
 * Pecah satu teks panjang menjadi potongan-potongan ≤ maxChars, pada batas
 * kata terakhir sebelum batas bila memungkinkan. Teks ≤ maxChars kembali
 * utuh sebagai satu potongan. Partisi EKSAK: potongan-potongan yang
 * digabung (tanpa pemisah tambahan) sama persis dengan teks asli — spasi
 * pemisah kata dipertahankan di akhir potongan sebelumnya.
 */
export function splitTextAtWordBoundaries(text: string, maxChars: number): string[] {
  if (maxChars < 1) return [text];
  if (text.length <= maxChars) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > maxChars) {
    // Batas kata terakhir di dalam jendela (spasi terakhir pada indeks
    // ≤ maxChars - 1, agar potongan termasuk spasi tetap ≤ maxChars).
    let cut = rest.lastIndexOf(' ', maxChars - 1);
    // Bila tidak ada spasi (token raksasa) atau spasi terlalu awal
    // (< 50% jendela — menghindar potongan kerdil berulang), potong keras.
    if (cut < Math.floor(maxChars / 2)) cut = maxChars;
    else cut += 1; // sertakan spasi pemisah di potongan ini
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest.length > 0) parts.push(rest);
  return parts;
}

/**
 * Kembangkan halaman-halaman menjadi segmen. Halaman yang muat dalam
 * anggaran kembali sebagai satu segmen tanpa penanda bagian; halaman
 * panjang dipecah dengan partIndex/partCount. Urutan halaman lestari.
 */
export function expandPagesIntoSegments(
  pages: SelectedPage[],
  maxSegmentChars: number,
): DedPageSegment[] {
  const out: DedPageSegment[] = [];
  for (const page of pages) {
    const parts = splitTextAtWordBoundaries(page.text, maxSegmentChars);
    if (parts.length === 1) {
      out.push({ ...page });
    } else {
      parts.forEach((text, i) => {
        out.push({ ...page, text, partIndex: i + 1, partCount: parts.length });
      });
    }
  }
  return out;
}

/** Apakah segmen ini bagian dari halaman yang dipecah (bukan halaman utuh). */
export function isSplitSegment(seg: DedPageSegment): boolean {
  return typeof seg.partCount === 'number' && seg.partCount > 1;
}

/** Bentuk minimal yang dibutuhkan renderer blok halaman. */
export interface DedPageBlockInput {
  page: number;
  title: string;
  text: string;
  partIndex?: number;
  partCount?: number;
}

/**
 * Render SATU blok halaman/segmen untuk prompt AI — satu-satunya tempat
 * yang memformat blok halaman DED (dipakai builder fast, detail, dan
 * Full AI agar format konsisten). Segmen yang dipecah membawa penanda
 * "bagian i dari j" agar model tahu halaman berlanjut di pass lain.
 */
export function renderDedPageBlock(page: DedPageBlockInput): string {
  const partSuffix =
    typeof page.partCount === 'number' && page.partCount > 1
      ? ` — bagian ${page.partIndex} dari ${page.partCount}`
      : '';
  return `--- Halaman ${page.page} (${page.title}${partSuffix}) ---\n${page.text}`;
}

/** Render daftar blok halaman/segmen, dipisah satu baris baru (format lama). */
export function renderDedPageBlocks(pages: DedPageBlockInput[]): string {
  return pages.map(renderDedPageBlock).join('\n');
}

/** Jumlah karakter teks yang benar-benar dikirim oleh daftar segmen. */
export function sentCharsOfSegments(segments: SelectedPage[]): number {
  return segments.reduce((acc, s) => acc + s.text.length, 0);
}

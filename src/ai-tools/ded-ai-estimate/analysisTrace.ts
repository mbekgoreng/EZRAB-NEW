/**
 * DED AI ESTIMATE — Seleksi Halaman & Jejak Analisis (FASE P0)
 *
 * Menggantikan potongan seleksi inline di service: halaman dipilih menurut
 * prioritas jenisnya dalam budget karakter, dan SETIAP halaman tercatat —
 * yang terlewat budget membawa status SKIPPED_BUDGET + alasan, bukan hilang
 * diam-diam. Fungsi murni agar dapat diuji tanpa provider AI.
 */
import { DedParsedPage } from './parser';
import { DedAnalysisTrace, DedPageTraceEntry, DedPassTraceEntry } from './types';

/** Prioritas jenis halaman untuk seleksi dalam budget (lebih kecil = lebih dulu). */
export const PAGE_TYPE_PRIORITY: Record<string, number> = {
  DENAH: 0, STRUKTUR: 1, POTONGAN: 2,
  JADWAL_KUSEN: 3, DETAIL_KUSEN: 3,
  MEP: 4, MEP_PLUMBING: 4, MEP_ELECTRICAL: 4, SANITAIR: 4,
  PLAFOND: 5, LANTAI: 5, ATAP: 6, TAMPAK: 7,
  SPESIFIKASI: 8, SITUASI: 9, HALAMAN: 10,
};

export interface SelectedPage {
  page: number;
  title: string;
  text: string;
  pageType: string;
}

export interface PageSelectionResult {
  selected: SelectedPage[];
  /** Jejak untuk SEMUA halaman dokumen (terpilih maupun terlewat). */
  trace: DedPageTraceEntry[];
  totalCharsSent: number;
  skippedCount: number;
  /** Halaman tanpa lapisan teks (scan/gambar) — dihitung terpisah dari skipped budget. */
  noTextCount: number;
}

/**
 * Format daftar nomor halaman menjadi rentang ringkas:
 * [1,2,3,5,7,8,9] → "1–3, 5, 7–9". Input tidak harus terurut; duplikat dibuang.
 */
export function formatPageRanges(pages: number[]): string {
  const nums = [...new Set(pages.filter((n) => Number.isFinite(n)))].sort((a, b) => a - b);
  if (nums.length === 0) return '';
  const parts: string[] = [];
  let start = nums[0];
  let prev = nums[0];
  const flush = () => {
    parts.push(start === prev ? `${start}` : `${start}–${prev}`);
  };
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] === prev + 1) {
      prev = nums[i];
      continue;
    }
    flush();
    start = nums[i];
    prev = nums[i];
  }
  flush();
  return parts.join(', ');
}

/**
 * Pilih halaman dalam budget. Perilaku seleksi mempertahankan logika lama:
 * urut prioritas jenis lalu nomor halaman; berhenti menambah bila budget
 * terlampaui DAN minimal 4 halaman sudah terpilih.
 */
export function selectPagesWithTrace(
  pages: DedParsedPage[],
  totalBudget: number,
  perPageCap: number
): PageSelectionResult {
  const byPriority = [...pages].sort(
    (a, b) =>
      (PAGE_TYPE_PRIORITY[a.pageType] ?? 10) - (PAGE_TYPE_PRIORITY[b.pageType] ?? 10) ||
      a.page - b.page
  );

  const selected: SelectedPage[] = [];
  const traceByPage = new Map<number, DedPageTraceEntry>();
  let usedChars = 0;
  let budgetExhausted = false;
  let noTextCount = 0;

  for (const p of byPriority) {
    // F4 (3.6): halaman tanpa lapisan teks (hasil scan/gambar raster) TIDAK
    // diperlakukan sebagai halaman sah yang "terkirim" — ia tidak membawa
    // konten apa pun untuk model. Catat eksplisit sebagai NO_TEXT agar
    // terhitung terpisah dan dapat diperingatkan ke pengguna (butuh OCR).
    if (!(p.text || '').trim()) {
      noTextCount++;
      traceByPage.set(p.page, {
        page: p.page,
        title: p.title,
        pageType: p.pageType,
        totalChars: 0,
        sentChars: 0,
        status: 'NO_TEXT',
        reason: 'Halaman tidak memiliki lapisan teks (kemungkinan hasil scan/gambar) — tidak dapat dianalisis tanpa OCR.',
      });
      continue;
    }
    const text = (p.text || '').slice(0, perPageCap);
    if (!budgetExhausted && usedChars + text.length > totalBudget && selected.length >= 4) {
      budgetExhausted = true;
    }
    if (budgetExhausted) {
      traceByPage.set(p.page, {
        page: p.page,
        title: p.title,
        pageType: p.pageType,
        totalChars: (p.text || '').length,
        sentChars: 0,
        status: 'SKIPPED_BUDGET',
        reason: `Melebihi budget teks analisis (${totalBudget} karakter); halaman prioritas lebih tinggi didahulukan.`,
      });
      continue;
    }
    usedChars += text.length;
    selected.push({ page: p.page, title: p.title, text, pageType: p.pageType });
    traceByPage.set(p.page, {
      page: p.page,
      title: p.title,
      pageType: p.pageType,
      totalChars: (p.text || '').length,
      sentChars: text.length,
      status: 'SENT',
    });
  }

  const trace = [...traceByPage.values()].sort((a, b) => a.page - b.page);
  return {
    selected,
    trace,
    totalCharsSent: usedChars,
    skippedCount: trace.filter((t) => t.status === 'SKIPPED_BUDGET').length,
    noTextCount,
  };
}

/* =====================================================================
 * FINAL REVIEW (Tugas A) — Penggabungan jejak multi-file.
 *
 * Jalur multi-file di view menjalankan service per file lalu membangun
 * ulang output gabungan; jejak per file harus ikut digabung, bukan hilang.
 * Penggabungan ini MURNI agregasi jejak nyata per file:
 * - nomor halaman dioffset global (skema yang sama dengan sourcePages item),
 *   dan setiap entri membawa `sourceFile` agar asal file eksplisit;
 * - passIndex direnumber global, termasuk passIndex pada entri halaman;
 * - warning per file diberi prefiks nama file;
 * - file yang jejaknya tidak tersedia TIDAK dikarang — dicatat sebagai
 *   warning keterbatasan eksplisit di jejak gabungan.
 * ===================================================================== */
export interface FileTraceInput {
  fileName: string;
  /** Offset halaman global file ini (total halaman file-file sebelumnya). */
  pageOffset: number;
  trace?: DedAnalysisTrace;
}

export function mergeAnalysisTraces(
  files: FileTraceInput[],
  totalPages: number
): DedAnalysisTrace | undefined {
  if (files.length === 0) return undefined;

  const pages: DedPageTraceEntry[] = [];
  const passes: DedPassTraceEntry[] = [];
  const warnings: string[] = [];
  let selectedPageCount = 0;
  let skippedPageCount = 0;
  let totalCharsSent = 0;
  let totalCharsBudget = 0;
  let passOffset = 0;

  for (const f of files) {
    if (!f.trace) {
      warnings.push(
        `Jejak analisis file "${f.fileName}" tidak tersedia — halaman dan pass file ini tidak tercatat dalam jejak gabungan, sehingga cakupan per halaman untuk file ini tidak dapat diverifikasi dari jejak.`
      );
      continue;
    }
    selectedPageCount += f.trace.selectedPageCount;
    skippedPageCount += f.trace.skippedPageCount;
    totalCharsSent += f.trace.totalCharsSent;
    totalCharsBudget += f.trace.totalCharsBudget;
    for (const p of f.trace.pages) {
      pages.push({
        ...p,
        page: p.page + f.pageOffset,
        passIndex: p.passIndex != null ? p.passIndex + passOffset : undefined,
        sourceFile: f.fileName,
      });
    }
    for (const ps of f.trace.passes) {
      passes.push({
        ...ps,
        passIndex: ps.passIndex + passOffset,
        pages: ps.pages.map((n) => n + f.pageOffset),
        sourceFile: f.fileName,
      });
    }
    passOffset += f.trace.passes.length;
    warnings.push(...f.trace.warnings.map((w) => `[${f.fileName}] ${w}`));
  }

  pages.sort((a, b) => a.page - b.page);
  return {
    totalPages,
    selectedPageCount,
    skippedPageCount,
    totalCharsBudget,
    totalCharsSent,
    pages,
    passes,
    warnings,
  };
}

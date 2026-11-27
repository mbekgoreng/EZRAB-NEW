/**
 * EZRAB Chat AI — Streaming Fase 2: rencana reveal jawaban (2026-11-27).
 *
 * Mengacu pada mockup `mockup-chat-ai-streaming`:
 *  - teks jawaban tampil kata per kata (token `**tebal**`, `kode`, dan
 *    tautan `[x](y)` utuh sebagai satu token — tidak pernah terbelah
 *    di tengah, supaya awalan markdown yang ter-reveal tidak pernah
 *    menampilkan penanda yang belum tertutup);
 *  - tabel RAB tampil baris per baris (header dulu, lalu satu baris
 *    per langkah); baris total (bila ada) menghitung naik dari Rp0
 *    ke nilai aslinya — nilai total TIDAK PERNAH dikarang: hanya
 *    baris tabel yang memuat kata "Total" + angka Rp ribuan bulat
 *    yang bisa diparse yang dianimasikan, dan nilai akhirnya persis
 *    angka yang tertulis di jawaban;
 *  - `prefers-reduced-motion` → tampil sekaligus (tanpa animasi).
 *
 * Modul ini MURNI (tanpa React; DOM hanya dipakai untuk pengecekan
 * matchMedia): rencana reveal dapat diuji lewat tsx tanpa provider.
 * Predikat tabel disalin dari aturan yang sama dengan markdown.tsx
 * (isTableRow / splitTableRow / isSeparatorRow / tableAligns).
 *
 * Transport SSE-nya (Fase 1) hidup di providerClient.executeStream;
 * jalur kirim service saat ini masih non-streaming, sehingga reveal
 * di sini menganimasikan jawaban ASLI yang sudah diterima utuh —
 * bukan token jaringan. Bila service beralih ke executeStream,
 * rencana yang sama dapat diumpani delta SSE per langkah.
 */

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** "Rp" + pemisah ribuan id-ID (sama seperti mockup). */
export function formatRupiah(n: number): string {
  return 'Rp' + Math.round(n).toLocaleString('id-ID');
}

/**
 * Format detik berjalan ala mockup: "0,6 dtk" (koma desimal Indonesia,
 * satu desimal).
 */
export function formatElapsedDtk(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  return `${s.toFixed(1).replace('.', ',')} dtk`;
}

/**
 * Kelayakan reveal kata per kata untuk satu entry balasan asisten.
 *
 * Owner 2026-11-28: reveal berlaku untuk SEMUA balasan asisten yang
 * sukses — jawaban LLM maupun deterministik/lokal (kuesioner, draf RAB
 * langsung, jawaban budget, balasan tombol aksi). `fromAi` TIDAK lagi
 * menjadi gerbang: entry lokal memang tidak membawa `fromAi`, dan itu
 * bukan alasan untuk menampilkannya sekaligus; provenance TIDAK
 * diubah — entry lokal tetap tanpa `fromAi` (dipakai tombol "Coba
 * Lagi" dkk.), hanya gerbang reveal-nya yang dilonggarkan.
 *
 * Tetap tampil-sekaligus (fallback): jawaban gagal, jawaban kosong,
 * atau prefers-reduced-motion. Rencana kosong (0 langkah) juga
 * fallback — dicek pemanggil sesudah buildRevealPlan.
 */
export interface RevealEntryInput {
  isError?: boolean;
  content?: string | null;
}

export function shouldRevealEntry(entry: RevealEntryInput): boolean {
  if (entry.isError) return false;
  const full = entry.content ?? '';
  if (!full.trim()) return false;
  if (prefersReducedMotion()) return false;
  return true;
}

/**
 * Parse sel berisi angka rupiah ribuan bulat ("Rp120.660.900",
 * "120.660.900", "1850000"). Sel dengan koma desimal ("Rp3,35 juta")
 * DITOLAK (null) — bukan nilai total yang bisa dihitung naik; tabel
 * tetap tampil baris per baris, sel totalnya tampil apa adanya.
 */
export function parseRupiahCell(text: string): number | null {
  if (typeof text !== 'string') return null;
  if (text.includes(',')) return null;
  const cleaned = text.replace(/[^0-9.]/g, '').trim();
  if (!cleaned) return null;
  // Hanya ribuan bulat: "1.234.567" (grup titik) atau "1234567" polos.
  if (!/^\d{1,3}(\.\d{3})+$/.test(cleaned) && !/^\d+$/.test(cleaned)) return null;
  const n = Number(cleaned.replace(/\./g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Baris total = sel pertama memuat kata "Total" dan ada sel angka Rp. */
export function isTotalRow(cells: string[]): boolean {
  if (cells.length === 0) return false;
  const first = cells[0].replace(/\*/g, '').trim().toLowerCase();
  if (!first.includes('total')) return false;
  return cells.some((c) => parseRupiahCell(c) !== null);
}

// ---------------------------------------------------------------------------
// Predikat tabel (aturan yang sama dengan markdown.tsx)
// ---------------------------------------------------------------------------

function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.includes('|') && t.length > 2;
}

function splitTableRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '|' && t[i - 1] !== '\\') {
      cells.push(cur.trim());
      cur = '';
    } else if (t[i] === '|' && t[i - 1] === '\\') {
      cur = cur.slice(0, -1) + '|';
    } else cur += t[i];
  }
  cells.push(cur.trim());
  return cells;
}

function isSeparatorRow(line: string): boolean {
  if (!isTableRow(line)) return false;
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c.replace(/\s/g, '')));
}

function tableAligns(sepLine: string, count: number): Array<'left' | 'center' | 'right'> {
  const cells = splitTableRow(sepLine);
  const aligns: Array<'left' | 'center' | 'right'> = [];
  for (let i = 0; i < count; i++) {
    const c = (cells[i] || '').replace(/\s/g, '');
    aligns.push(c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : 'left');
  }
  return aligns;
}

// ---------------------------------------------------------------------------
// Blok + token
// ---------------------------------------------------------------------------

export type RevealBlock =
  | { kind: 'para'; text: string; tokens: string[] }
  | {
      kind: 'table';
      headers: string[];
      aligns: Array<'left' | 'center' | 'right'>;
      rows: string[][];
      totalRowIndex: number | null;
      totalCellIndex: number | null;
      totalValue: number | null;
    }
  | { kind: 'other'; lines: string[] };

export type RevealStep =
  | { kind: 'word'; block: number; text: string; delayMs: number }
  | { kind: 'tableHead'; block: number; delayMs: number }
  | { kind: 'row'; block: number; upto: number; delayMs: number }
  | { kind: 'totalTick'; block: number; value: number; delayMs: number }
  | { kind: 'line'; block: number; text: string; delayMs: number };

export interface RevealPlan {
  blocks: RevealBlock[];
  steps: RevealStep[];
  totalSteps: number;
}

/* Tanda baca yang menempel tepat sesudah rentang atomik (mis. `**,`)
 * ikut menjadi bagian token yang sama — bila tidak, join spasi saat
 * reveal menyisipkan spasi liar sebelum koma/titik. */
const TOKEN_RE = /\*\*[^*]+\*\*[.,;:!?]?|`[^`]+`[.,;:!?]?|\[[^\]]*\]\([^)]*\)[.,;:!?]?|\S+/g;

/**
 * Pecah paragraf menjadi token kata; rentang `**tebal**`, `` `kode` ``,
 * dan tautan `[x](y)` utuh sebagai satu token.
 */
export function tokenizeParagraph(text: string): string[] {
  return text.match(TOKEN_RE) ?? [];
}

function isPlainParagraphRun(run: string[]): boolean {
  return run.every((line) => {
    const t = line.trim();
    if (!t) return false;
    if (t.startsWith('```') || t.startsWith('#') || t.startsWith('>') || t.startsWith('$$') || t.startsWith('\\[')) return false;
    if (/^(\s*)([-*•])\s+/.test(line) || /^(\s*)\d{1,9}[.)]\s+/.test(line)) return false;
    if (isTableRow(line)) return false;
    return true;
  });
}

/**
 * Bagi jawaban markdown menjadi blok reveal (paragraf / tabel / lain)
 * lalu susun langkah-langkah reveal-nya. Kecepatan dibatasi: jawaban
 * panjang dikelompokkan supaya reveal penuh selesai dalam hitungan
 * detik (maks ~140 langkah kata, ~15 langkah baris per tabel).
 */
export function buildRevealPlan(md: string): RevealPlan {
  const lines = (md ?? '').split('\n');
  const blocks: RevealBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim() === '') {
      i++;
      continue;
    }
    // Tabel: baris header + baris pemisah + baris-baris isi.
    if (isTableRow(lines[i]) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      const headers = splitTableRow(lines[i]);
      const aligns = tableAligns(lines[i + 1], headers.length);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i]) && lines[i].trim() !== '') {
        const cells = splitTableRow(lines[i]);
        while (cells.length < headers.length) cells.push('');
        rows.push(cells.slice(0, headers.length));
        i++;
      }
      // Baris total = baris TERAKHIR yang lolos isTotalRow; sel nilai
      // dicari dari kolom paling kanan (kolom jumlah).
      let totalRowIndex: number | null = null;
      let totalCellIndex: number | null = null;
      let totalValue: number | null = null;
      for (let r = rows.length - 1; r >= 0; r--) {
        if (!isTotalRow(rows[r])) continue;
        for (let c = rows[r].length - 1; c >= 0; c--) {
          const v = parseRupiahCell(rows[r][c]);
          if (v !== null) {
            totalRowIndex = r;
            totalCellIndex = c;
            totalValue = v;
            break;
          }
        }
        if (totalRowIndex !== null) break;
      }
      blocks.push({ kind: 'table', headers, aligns, rows, totalRowIndex, totalCellIndex, totalValue });
      continue;
    }
    // Kumpulkan run baris non-kosong — TAPI berhenti bila di tengah run
    // muncul awal tabel (baris header + baris pemisah). Draf RAB lokal
    // (formatDirectRabMessage / formatUniversalDraftMessage) menempel
    // judul grup `**...**` tepat di atas tabel tanpa baris kosong di
    // antaranya; tanpa pemisahan ini satu run utuh (judul + tabel +
    // subtotal) jatuh ke blok 'other' dan tabelnya tampil baris per
    // baris lewat langkah 'line' biasa — bukan lewat tableHead/row.
    // Baris pipa yang TIDAK diikuti pemisah bukan awal tabel (tetap
    // di dalam run, perilaku lama).
    const run: string[] = [];
    while (i < lines.length && lines[i].trim() !== '') {
      if (isTableRow(lines[i]) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) break;
      run.push(lines[i]);
      i++;
    }
    if (isPlainParagraphRun(run)) {
      const text = run.join(' ');
      blocks.push({ kind: 'para', text, tokens: tokenizeParagraph(text) });
    } else {
      blocks.push({ kind: 'other', lines: run });
    }
  }

  const steps: RevealStep[] = [];
  let totalWords = 0;
  for (const b of blocks) if (b.kind === 'para') totalWords += b.tokens.length;
  const wordsPerStep = Math.max(1, Math.ceil(totalWords / 140));
  blocks.forEach((b, bi) => {
    if (b.kind === 'para') {
      for (let s = 0; s < b.tokens.length; s += wordsPerStep) {
        steps.push({ kind: 'word', block: bi, text: b.tokens.slice(s, s + wordsPerStep).join(' '), delayMs: 46 });
      }
    } else if (b.kind === 'table') {
      if (b.headers.length > 0) steps.push({ kind: 'tableHead', block: bi, delayMs: 260 });
      const rowsPerStep = Math.max(1, Math.ceil(b.rows.length / 15));
      for (let r = 0; r < b.rows.length; r += rowsPerStep) {
        steps.push({ kind: 'row', block: bi, upto: Math.min(b.rows.length, r + rowsPerStep), delayMs: 210 });
      }
      if (b.totalRowIndex !== null && b.totalValue !== null) {
        const TICKS = 18;
        for (let k = 1; k <= TICKS; k++) {
          const eased = 1 - Math.pow(1 - k / TICKS, 3);
          const value = k === TICKS ? b.totalValue : Math.round(b.totalValue * eased);
          steps.push({ kind: 'totalTick', block: bi, value, delayMs: 30 });
        }
      }
    } else {
      for (const line of b.lines) steps.push({ kind: 'line', block: bi, text: line, delayMs: 120 });
    }
  });

  return { blocks, steps, totalSteps: steps.length };
}

// ---------------------------------------------------------------------------
// Ringkasan reveal (turunan murni dari plan + jumlah langkah yang jalan)
// ---------------------------------------------------------------------------

export interface RevealedBlockState {
  block: RevealBlock;
  /** Kata yang sudah tampil (para). */
  words: string[];
  /** Baris yang sudah tampil (other). */
  lines: string[];
  headerShown: boolean;
  /** Jumlah baris tabel yang tampil. */
  rowsShown: number;
  /**
   * Nilai total yang sedang dihitung naik; null bila baris total belum
   * tampil atau animasi sudah selesai (sel menampilkan nilai aslinya).
   */
  totalAnimated: number | null;
}

export function summarizeReveal(plan: RevealPlan, step: number): RevealedBlockState[] {
  const states: RevealedBlockState[] = plan.blocks.map((block) => ({
    block,
    words: [],
    lines: [],
    headerShown: false,
    rowsShown: 0,
    totalAnimated: null,
  }));
  const totalTicksPerBlock = new Map<number, number>();
  for (const s of plan.steps) {
    if (s.kind === 'totalTick') totalTicksPerBlock.set(s.block, (totalTicksPerBlock.get(s.block) ?? 0) + 1);
  }
  const ticksSeen = new Map<number, number>();
  const done = plan.steps.slice(0, Math.max(0, Math.min(step, plan.steps.length)));
  for (const s of done) {
    const st = states[s.block];
    if (!st) continue;
    switch (s.kind) {
      case 'word':
        st.words.push(s.text);
        break;
      case 'line':
        st.lines.push(s.text);
        break;
      case 'tableHead':
        st.headerShown = true;
        break;
      case 'row':
        st.rowsShown = Math.max(st.rowsShown, s.upto);
        break;
      case 'totalTick':
        st.totalAnimated = s.value;
        ticksSeen.set(s.block, (ticksSeen.get(s.block) ?? 0) + 1);
        break;
    }
  }
  states.forEach((st, bi) => {
    if (st.block.kind !== 'table' || st.block.totalRowIndex === null) return;
    const totalTicks = totalTicksPerBlock.get(bi) ?? 0;
    const seen = ticksSeen.get(bi) ?? 0;
    const totalRevealed = st.rowsShown > st.block.totalRowIndex;
    if (!totalRevealed || totalTicks === 0 || seen >= totalTicks) {
      // Baris total belum tampil, tidak ada tick, atau animasi selesai:
      // sel menampilkan nilai aslinya.
      st.totalAnimated = null;
      return;
    }
    // Baris total tampil, animasi berjalan: belum ada tick = mulai dari 0.
    if (seen === 0) st.totalAnimated = 0;
  });
  return states;
}

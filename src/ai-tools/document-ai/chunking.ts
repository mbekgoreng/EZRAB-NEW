/**
 * DOKUMEN AI — Chunking & retrieval deterministik (Sprint 1, Workstream B).
 *
 * Masalah asal: service lama menyisipkan sampai 140.000 karakter teks dokumen
 * ke field `prompt`, sedangkan gateway menolak prompt > 20.000 karakter
 * (validateAiInput) — Analyzer selalu 400 untuk dokumen nyata dan errornya
 * melebur menjadi MODEL_ERROR generik.
 *
 * Modul ini murni (tanpa I/O, tanpa AI) dan menjadi satu-satunya tempat
 * aturan ukuran: potongan dibatasi per teks dokumen, SETIAP permintaan diukur
 * sebagai (systemPrompt + userPrompt) utuh dan ditegakkan ≤ 19.500 karakter
 * — di bawah batas gateway 20.000 dengan ruang aman.
 */

/** Batas keras gateway untuk field prompt/message (api/_lib/security.js). */
export const GATEWAY_MESSAGE_LIMIT = 20_000;

/** Batas yang ditegakkan klien untuk request terukur penuh (system + prompt). */
export const MAX_AI_REQUEST_CHARS = 19_500;

/** Anggaran teks dokumen murni per potongan. */
export const DOC_CHUNK_TEXT_BUDGET = 14_000;

/** Tanpa batas pemrosesan (2026-11-19): MAX_DOC_CHUNKS (24) DIHAPUS —
 *  SEMUA potongan dokumen diproses (map-reduce), berapa pun jumlahnya.
 *  Konsekuensi jujur: dokumen sangat besar = banyak panggilan AI
 *  (sekuensial) — lihat laporan program untuk perkiraan pass/waktu. */
/** Tanpa batas pemrosesan (2026-11-19): CHUNK_FINDING_MAX_CHARS (2.600)
 *  DIHAPUS — temuan per potongan disimpan UTUH dan disintesis secara
 *  hierarkis (batch reduce), bukan dipotong. */

/** Ukuran pseudo-halaman untuk dokumen tanpa penanda halaman (docx/xlsx/txt). */
const PSEUDO_PAGE_BUDGET = 4_000;

export interface DocPage {
  /** Nomor halaman (dari penanda [Halaman N]; pseudo-halaman berurutan mulai 1). */
  page: number;
  /** Teks halaman TANPA penanda [Halaman N]. */
  text: string;
}

export interface DocChunk {
  /** Indeks potongan, 0-based, urut dokumen. */
  index: number;
  startPage: number;
  endPage: number;
  /** Teks potongan TERMASUK penanda [Halaman N] per segmen halaman. */
  text: string;
  charCount: number;
}

/** Ukuran request sebagaimana ditegakkan modul ini: system + user prompt. */
export function measureAiRequestChars(systemPrompt: string, userPrompt: string): number {
  return systemPrompt.length + userPrompt.length;
}

/**
 * Pangkas `text` agar request penuh (system + overhead tetap + text) muat
 * dalam batas. `fixedOverheadChars` = panjang prompt yang dibangun dengan
 * teks kosong (semua template/metadata di luar teks yang dipangkas).
 */
export function fitTextWithinRequest(
  systemPrompt: string,
  fixedOverheadChars: number,
  text: string,
  limit: number = MAX_AI_REQUEST_CHARS,
): { text: string; truncated: boolean } {
  const room = limit - systemPrompt.length - fixedOverheadChars;
  if (text.length <= room) return { text, truncated: false };
  return { text: text.slice(0, Math.max(0, room)), truncated: true };
}

const PAGE_MARKER_RE = /\[Halaman (\d+)\]/g;

/**
 * Pisahkan teks hasil parser menjadi halaman. Parser PDF menyisipkan
 * penanda `[Halaman N]` — dipakai apa adanya agar nomor halaman sumber
 * lestari. Teks tanpa penanda (docx/xlsx/txt) dipecah menjadi
 * pseudo-halaman berbasis paragraf agar tetap bisa dipotong per bagian.
 */
export function splitDocumentPages(documentText: string): DocPage[] {
  const parts = documentText.split(PAGE_MARKER_RE);
  // parts: ["", "1", "teks1", "2", "teks2", ...] bila ada penanda.
  if (parts.length > 2) {
    const pages: DocPage[] = [];
    for (let i = 1; i < parts.length; i += 2) {
      pages.push({ page: Number(parts[i]), text: (parts[i + 1] || '').trim() });
    }
    if (pages.length) return pages;
  }
  const paragraphs = documentText.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const pages: DocPage[] = [];
  let current = '';
  const flush = () => {
    if (current) {
      pages.push({ page: pages.length + 1, text: current });
      current = '';
    }
  };
  for (const para of paragraphs) {
    if (para.length > PSEUDO_PAGE_BUDGET) {
      flush();
      for (let off = 0; off < para.length; off += PSEUDO_PAGE_BUDGET) {
        pages.push({ page: pages.length + 1, text: para.slice(off, off + PSEUDO_PAGE_BUDGET) });
      }
      continue;
    }
    if (current && current.length + para.length + 1 > PSEUDO_PAGE_BUDGET) flush();
    current = current ? `${current}\n${para}` : para;
  }
  flush();
  return pages.length ? pages : [{ page: 1, text: documentText.trim() }];
}

function renderPageSegment(page: DocPage, text: string): string {
  return `[Halaman ${page.page}]\n${text}`;
}

/**
 * Gabungkan halaman menjadi potongan ≤ anggaran teks dokumen. Halaman
 * tunggal yang melebihi anggaran dipecah per karakter (penanda halaman
 * dipertahankan di tiap pecahan). Urutan halaman tidak pernah diubah.
 */
export function buildDocumentChunks(
  pages: DocPage[],
  budget: number = DOC_CHUNK_TEXT_BUDGET,
): DocChunk[] {
  const chunks: DocChunk[] = [];
  let curPages: DocPage[] = [];
  let curText = '';

  const flush = () => {
    if (!curPages.length) return;
    chunks.push({
      index: chunks.length,
      startPage: curPages[0].page,
      endPage: curPages[curPages.length - 1].page,
      text: curText,
      charCount: curText.length,
    });
    curPages = [];
    curText = '';
  };

  for (const page of pages) {
    const rendered = renderPageSegment(page, page.text);
    if (rendered.length > budget) {
      flush();
      // Pecah halaman raksasa: segmen pertama memuat penanda; pecahan
      // berikutnya diberi penanda yang sama agar sitasi halaman tetap benar.
      const marker = `[Halaman ${page.page}]\n`;
      const room = Math.max(1, budget - marker.length);
      for (let off = 0; off < page.text.length; off += room) {
        const seg = marker + page.text.slice(off, off + room);
        chunks.push({
          index: chunks.length,
          startPage: page.page,
          endPage: page.page,
          text: seg,
          charCount: seg.length,
        });
      }
      continue;
    }
    const joined = curText ? `${curText}\n\n${rendered}` : rendered;
    if (joined.length > budget) {
      flush();
      curPages = [page];
      curText = rendered;
    } else {
      curPages.push(page);
      curText = joined;
    }
  }
  flush();
  return chunks;
}

/**
 * Tanpa batas pemrosesan (2026-11-19): condenseTextsProportionally
 * DIHAPUS — temuan TIDAK LAGI dipadatkan/dipotong agar muat satu
 * panggilan sintesis; sintesis berjalan hierarkis (batch reduce,
 * lihat DokumenAiService.reduceBatched).
 */

/**
 * Potong `text` ke `maxChars` pada batas PARAGRAF terakhir sebelum batas
 * (fallback: batas kata, lalu potong keras). Dipakai HANYA untuk kutipan
 * Tanya Dokumen — satu-satunya pemotongan yang tersisa di Document AI,
 * dan selalu disertai penanda eksplisit "[…dipotong…]" di pemanggil.
 * Mengembalikan teks + flag apakah ada pemotongan.
 */
export function cutAtParagraphBoundary(
  text: string,
  maxChars: number,
): { text: string; cut: boolean } {
  if (maxChars < 1) return { text: '', cut: text.length > 0 };
  if (text.length <= maxChars) return { text, cut: false };
  const window = text.slice(0, maxChars);
  // Batas paragraf (baris kosong / baris baru) terakhir di jendela.
  let cut = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('\n'));
  if (cut < Math.floor(maxChars / 2)) {
    // Fallback: batas kata terakhir.
    cut = window.lastIndexOf(' ');
  }
  if (cut < Math.floor(maxChars / 2)) cut = maxChars;
  return { text: text.slice(0, cut).trimEnd(), cut: true };
}

/* ------------------------------------------------------------------ */
/* Retrieval kata kunci deterministik untuk Tanya Dokumen (B4)         */
/* ------------------------------------------------------------------ */

const STOPWORDS = new Set([
  // Indonesia
  'yang', 'dan', 'di', 'ke', 'dari', 'untuk', 'pada', 'adalah', 'ini', 'itu',
  'dengan', 'dalam', 'tidak', 'ada', 'atau', 'juga', 'akan', 'telah', 'sudah',
  'dapat', 'bisa', 'oleh', 'sebagai', 'apa', 'berapa', 'bagaimana', 'kapan',
  'siapa', 'dimana', 'di mana', 'mengapa', 'apakah', 'sebutkan', 'jelaskan',
  'dokumen', 'halaman', 'tolong', 'mohon', 'saya', 'kami', 'anda', 'dia',
  'mereka', 'kita', 'bila', 'jika', 'kalau', 'agar', 'supaya', 'karena',
  'tetapi', 'namun', 'serta', 'antara', 'setiap', 'semua', 'lebih', 'paling',
  'sangat', 'sekali', 'saja', 'pun', 'lah', 'kah', 'nya', 'berikut', 'tersebut',
  'terkait', 'mengenai', 'tentang', 'isi', 'bagian', 'menurut',
  // Inggris
  'the', 'a', 'an', 'of', 'to', 'in', 'is', 'are', 'was', 'were', 'for',
  'on', 'with', 'and', 'or', 'what', 'how', 'when', 'where', 'who', 'why',
  'which', 'this', 'that', 'it', 'its', 'from', 'by', 'as', 'at', 'be',
  'been', 'does', 'do', 'did', 'can', 'could', 'please', 'tell', 'me',
]);

export function tokenizeForRetrieval(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9à-ÿ\s]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/** Kecocokan token: persis, atau awalan bersama (min. 4 huruf) — menangkap
 *  imbuhan akhir Indonesia sederhana seperti kontrak/kontraknya. */
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4) return a.startsWith(b) || b.startsWith(a);
  return false;
}

/**
 * Skor relevansi satu potongan terhadap token pertanyaan: jumlah token
 * pertanyaan berbeda yang ditemukan (bobot utama) + bonus kecil frekuensi
 * (dibatasi). Deterministik; seri dipecahkan oleh urutan potongan.
 */
export function scoreChunkForTokens(questionTokens: string[], chunkText: string): number {
  const chunkTokens = tokenizeForRetrieval(chunkText);
  if (!questionTokens.length || !chunkTokens.length) return 0;
  const counts = new Map<string, number>();
  for (const ct of chunkTokens) counts.set(ct, (counts.get(ct) || 0) + 1);
  const chunkKeys = [...counts.keys()];
  let score = 0;
  for (const qt of new Set(questionTokens)) {
    let freq = 0;
    for (const ck of chunkKeys) {
      if (tokensMatch(qt, ck)) freq += counts.get(ck) || 0;
    }
    if (freq > 0) score += 1 + Math.min(freq, 3) * 0.1;
  }
  return score;
}

export interface ChunkSelection {
  /** Potongan terpilih, urut skor menurun (seri: indeks lebih kecil dulu). */
  selected: Array<{ chunk: DocChunk; score: number }>;
  bestScore: number;
}

/** Pilih maksimal `maxChunks` potongan paling relevan terhadap pertanyaan. */
export function selectChunksForQuestion(
  chunks: DocChunk[],
  question: string,
  maxChunks: number = 2,
): ChunkSelection {
  const qTokens = tokenizeForRetrieval(question);
  const scored = chunks
    .map((chunk) => ({ chunk, score: scoreChunkForTokens(qTokens, chunk.text) }))
    .sort((a, b) => b.score - a.score || a.chunk.index - b.chunk.index);
  const bestScore = scored.length ? scored[0].score : 0;
  return {
    selected: scored.filter((s) => s.score > 0).slice(0, Math.max(0, maxChunks)),
    bestScore,
  };
}

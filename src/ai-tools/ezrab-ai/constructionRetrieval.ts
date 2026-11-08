/**
 * constructionRetrieval — retrieval LOKAL deterministik di atas
 * knowledge base konstruksi + pengetahuan cakupan aplikasi.
 *
 * Bukan RAG semantik: tidak ada embedding, tidak ada layanan eksternal,
 * tidak ada biaya per query. Mekanismenya: tokenisasi → kecocokan
 * kata kunci + sinonim (Indonesia/Inggris/salah eja terdaftar) → filter
 * metadata (kategori/status dukungan) → peringkat relevansi sederhana
 * → batas konteks (maks hasil) → deteksi duplikat (satu record sekali).
 * Setiap hasil membawa sitasi provenance record-nya; status verifikasi
 * ikut tampil karena hasil retrieval adalah BAHAN REFERENSI, bukan
 * kebenaran mutlak.
 */

import {
  CONSTRUCTION_KNOWLEDGE,
  CONCEPTUAL_WBS_LABEL,
  type ConstructionKnowledgeRecord,
  type SupportStatus,
} from './constructionKnowledge';

export interface RetrievalFilters {
  category?: string;
  supportStatus?: SupportStatus;
  /** Sadar versi (finalisasi §6): hanya record dengan versi provenance ini. */
  version?: string;
}

export interface RetrievalHit {
  record: ConstructionKnowledgeRecord;
  score: number;
  matchedTerms: string[];
  /** Sitasi internal: id record + status verifikasi provenance. */
  citation: string;
}

const STOPWORDS = new Set([
  'buatkan', 'bikin', 'buat', 'rab', 'untuk', 'dengan', 'yang', 'dan', 'di', 'ke', 'dari',
  'saya', 'tolong', 'minta', 'harga', 'berapa', 'hitung', 'estimasi', 'proyek', 'pekerjaan',
  'm', 'm2', 'meter', 'luas', 'ukuran', 'x', 'ada', 'ini', 'itu', 'nya',
]);

export function tokenizeQuery(query: string): string[] {
  return (query || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

function recordTerms(r: ConstructionKnowledgeRecord): string[] {
  return [
    r.commonName.toLowerCase(),
    ...r.indonesianSynonyms.map((s) => s.toLowerCase()),
    ...r.englishTerms.map((s) => s.toLowerCase()),
    ...r.typicalAttributes.map((s) => s.toLowerCase()),
  ];
}

/**
 * Token bentuk salah eja yang TERDAFTAR untuk sebuah record
 * (finalisasi §6): typo BUKAN ditebak dengan edit-distance — hanya
 * bentuk yang sudah terdaftar di taksonomi fungsi buildingTypology
 * (mis. "rumh" → rumah-tinggal) yang dikenali, agar retrieval tidak
 * mengarang kedekatan kata. Record fungsi memakai id yang sama dengan
 * id record KB untuk fungsi bangunan.
 */
const REGISTERED_TYPOS: Record<string, string[]> = {
  'rumah-tinggal': ['rumh', 'rmh'],
  gudang: ['gudng', 'gudnag', 'gudangg'],
  pabrik: ['pabrk'],
  workshop: ['bengkl', 'wrkshop', 'bngkel'],
  kantor: ['kntor'],
  sekolah: ['skolah'],
  masjid: ['msjid'],
  apartemen: ['apartmen'],
}; // selaras BUILDING_FUNCTIONS.typos di buildingTypology.ts

/** Skor satu record untuk query (deterministik, dapat diaudit). */
export function scoreRecord(queryTokens: string[], normalizedQuery: string, r: ConstructionKnowledgeRecord): { score: number; matched: string[] } {
  let score = 0;
  const matched: string[] = [];
  const terms = recordTerms(r);
  // Frasa utuh (nama umum / sinonim multi-kata) berbobot tertinggi.
  // Frasa yang muncul pada NAMA UMUM record adalah identitas record
  // itu sendiri dan berbobot di atas frasa sinonim/atribut (+8 vs +6):
  // record payung boleh mengklaim frasa record khusus sebagai sinonim
  // ("jalan beton" terdaftar sebagai sinonim record jalan umum;
  // "air bersih" sebagai sinonim record MEP), tetapi record yang
  // NAMANYA frasa itu adalah jawaban yang lebih spesifik (audit
  // ekstrem C-090/C-091: seri skor sebelumnya diselesaikan urutan id
  // sehingga record umum selalu menang atas record khususnya).
  const commonNameLower = r.commonName.toLowerCase();
  for (const term of terms) {
    if (term.includes(' ') && normalizedQuery.includes(term)) {
      score += commonNameLower.includes(term) ? 8 : 6;
      matched.push(term);
    }
  }
  for (const tok of queryTokens) {
    if (terms.some((term) => term === tok)) { score += 4; matched.push(tok); continue; }
    if (terms.some((term) => term.split(/[\s/]+/).includes(tok))) { score += 3; matched.push(tok); continue; }
    if (r.id === tok) { score += 5; matched.push(tok); continue; }
    // Typo TERDAFTAR untuk record ini (bobot lebih rendah dari istilah
    // persis — keyakinan lebih rendah, dinyatakan lewat matchedTerms).
    if ((REGISTERED_TYPOS[r.id] ?? []).includes(tok)) { score += 3; matched.push(`${tok} (typo terdaftar)`); continue; }
    // Token dari ID kalkulator nyata milik record ("wf" dari BAJA_WF):
    // istilah teknis yang memang menunjuk alat hitung record ini.
    const calcTokens = r.availableCalculators.flatMap((cid) => cid.toLowerCase().split(/[._-]+/));
    if (calcTokens.includes(tok)) { score += 3; matched.push(tok); }
  }
  return { score, matched: [...new Set(matched)] };
}

/**
 * Ambil record pengetahuan paling relevan. `maxResults` = batas konteks
 * (default 5). Duplikat record tidak mungkin (satu entri per record).
 */
export function searchConstructionKnowledge(
  query: string,
  opts?: { maxResults?: number; filters?: RetrievalFilters; minScore?: number }
): RetrievalHit[] {
  const maxResults = opts?.maxResults ?? 5;
  const minScore = opts?.minScore ?? 3;
  const tokens = tokenizeQuery(query);
  const normalized = ` ${(query || '').toLowerCase()} `;
  const seen = new Set<string>();
  const hits: RetrievalHit[] = [];
  for (const r of CONSTRUCTION_KNOWLEDGE) {
    if (seen.has(r.id)) continue;
    if (opts?.filters?.category && r.category !== opts.filters.category) continue;
    if (opts?.filters?.supportStatus && r.supportStatus !== opts.filters.supportStatus) continue;
    if (opts?.filters?.version && r.provenance.version !== opts.filters.version) continue;
    const { score, matched } = scoreRecord(tokens, normalized, r);
    if (score < minScore) continue;
    seen.add(r.id);
    hits.push({
      record: r,
      score,
      matchedTerms: matched,
      citation: `[KB:${r.id} · ${r.provenance.source} · status verifikasi: ${r.provenance.verificationStatus} · v${r.provenance.version}]`,
    });
  }
  hits.sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id));
  return hits.slice(0, maxResults);
}

export interface RetrievalOutcome {
  hits: RetrievalHit[];
  /** Alasan hasil kosong (temuan negatif dinyatakan eksplisit, bukan array kosong diam). */
  negativeReason: string | null;
  queryTokens: string[];
}

/**
 * Varian hasil-terstruktur dari pencarian: membedakan "tidak ada yang
 * cocok" (negatif — pemanggil WAJIB mengatakannya apa adanya) dari
 * "ada hasil". Hasil negatif BUKAN kegagalan sistem: KB memang terbatas
 * pada record terdaftar dan tidak boleh diperluas dengan karangan.
 */
export function searchWithOutcome(
  query: string,
  opts?: { maxResults?: number; filters?: RetrievalFilters; minScore?: number }
): RetrievalOutcome {
  const hits = searchConstructionKnowledge(query, opts);
  const tokens = tokenizeQuery(query);
  if (hits.length > 0) return { hits, negativeReason: null, queryTokens: tokens };
  const reason = tokens.length === 0
    ? 'Query tidak memuat istilah konstruksi yang dapat dicocokkan (hanya kata umum/stopword).'
    : 'Tidak ada record knowledge base yang cocok dengan istilah query — topik ini di luar cakupan KB terdaftar; jangan mengarang pengetahuan pengganti.';
  return { hits, negativeReason: reason, queryTokens: tokens };
}

/** Blok konteks siap pakai untuk prompt internal (dengan label jujur). */
export function formatKnowledgeContext(hits: RetrievalHit[]): string {
  if (hits.length === 0) return '';
  const lines: string[] = ['Referensi knowledge base internal (bahan referensi — bukan kebenaran mutlak; status verifikasi tercantum):'];
  for (const h of hits) {
    lines.push(
      `• ${h.record.commonName} [${h.record.category} · dukungan: ${h.record.supportStatus}] — spek wajib: ${h.record.requiredSpecs.join(', ') || '—'}; opsional: ${h.record.optionalSpecs.slice(0, 4).join(', ') || '—'}; WBS: ${CONCEPTUAL_WBS_LABEL}. ${h.citation}`
    );
  }
  return lines.join('\n');
}

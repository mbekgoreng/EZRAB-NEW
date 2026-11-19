/**
 * productRetrieval — retrieval LOKAL deterministik di atas knowledge
 * base PRODUK EZRAB (productKnowledge.ts).
 *
 * Pola yang sama dengan constructionRetrieval.ts: bukan RAG semantik —
 * tidak ada embedding, tidak ada layanan eksternal, tidak ada biaya
 * per query. Mekanisme: tokenisasi (stopword KHUSUS produk — istilah
 * domain seperti "rab", "ded", "ahsp", "kurva", "kredit" adalah kata
 * bermakna di sini, bukan stopword) → kecocokan kata kunci + sinonim
 * → peringkat relevansi sederhana → batas konteks → deteksi duplikat.
 * Setiap hasil membawa sitasi provenance record-nya.
 *
 * ANGKA RUNTIME: jumlah template RAB & analisa AHSP TIDAK PERNAH
 * hard-code di record. formatProductContext menambahkan baris jumlah
 * live dari aksesor resmi (RabTemplateService /
 * officialAhspRepository) bila record terkait ikut dalam hasil — bila
 * aksesor gagal, baris itu dihilangkan (klaim kualitatif saja).
 */

import {
  PRODUCT_KNOWLEDGE,
  type ProductKnowledgeRecord,
  type SupportStatus,
} from './productKnowledge';
import { officialAhspRepository } from '../../data/nationalCostDatabase/officialAhspRepository';
import { RabTemplateService } from '../../services/rabTemplateService';

export interface ProductRetrievalFilters {
  category?: string;
  supportStatus?: SupportStatus;
  version?: string;
}

export interface ProductRetrievalHit {
  record: ProductKnowledgeRecord;
  score: number;
  matchedTerms: string[];
  /** Sitasi internal: id record + status verifikasi provenance. */
  citation: string;
}

// Stopword produk: kata umum percakapan SAJA. Istilah domain EZRAB
// (rab, ded, ahsp, kurva, kredit, template, dokumen, volume, tema,
// peran, paket, harga) adalah kata kunci pencarian yang sah.
const PRODUCT_STOPWORDS = new Set([
  'buatkan', 'bikin', 'buat', 'untuk', 'dengan', 'yang', 'dan', 'di', 'ke', 'dari',
  'saya', 'tolong', 'minta', 'berapa', 'hitung', 'estimasi', 'proyek', 'pekerjaan',
  'ada', 'ini', 'itu', 'nya', 'apa', 'apakah', 'bagaimana', 'gimana', 'bisa', 'dapat',
  'mampu', 'kamu', 'ezrab', 'aplikasi', 'fitur', 'menu', 'cara', 'jelaskan', 'sebutkan',
  'tampilkan', 'ceritakan', 'mohon', 'atau', 'juga', 'saja', 'kah', 'dong', 'sih',
]);

export function tokenizeProductQuery(query: string): string[] {
  return (query || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !PRODUCT_STOPWORDS.has(w) && !/^\d+$/.test(w));
}

function recordTerms(r: ProductKnowledgeRecord): string[] {
  return [
    r.commonName.toLowerCase(),
    ...r.indonesianSynonyms.map((s) => s.toLowerCase()),
    ...r.englishTerms.map((s) => s.toLowerCase()),
    ...(r.menuId ? [r.menuId.toLowerCase()] : []),
  ];
}

/** Skor satu record untuk query (deterministik, dapat diaudit). */
export function scoreProductRecord(queryTokens: string[], normalizedQuery: string, r: ProductKnowledgeRecord): { score: number; matched: string[] } {
  let score = 0;
  const matched: string[] = [];
  const terms = recordTerms(r);
  const commonNameLower = r.commonName.toLowerCase();
  // Frasa utuh (nama umum / sinonim multi-kata) berbobot tertinggi;
  // frasa pada NAMA UMUM adalah identitas record (+8 vs +6).
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
    // Token dari id menu (mis. "kurva" dari "rab-kurva-s").
    if (r.menuId && r.menuId.toLowerCase().split(/[-_]+/).includes(tok)) { score += 3; matched.push(tok); }
  }
  return { score, matched: [...new Set(matched)] };
}

/**
 * Ambil record produk paling relevan. `maxResults` = batas konteks
 * (default 5). Duplikat record tidak mungkin (satu entri per record).
 */
export function searchProductKnowledge(
  query: string,
  opts?: { maxResults?: number; filters?: ProductRetrievalFilters; minScore?: number },
): ProductRetrievalHit[] {
  const maxResults = opts?.maxResults ?? 5;
  const minScore = opts?.minScore ?? 3;
  const tokens = tokenizeProductQuery(query);
  const normalized = ` ${(query || '').toLowerCase()} `;
  const seen = new Set<string>();
  const hits: ProductRetrievalHit[] = [];
  for (const r of PRODUCT_KNOWLEDGE) {
    if (seen.has(r.id)) continue;
    if (opts?.filters?.category && r.category !== opts.filters.category) continue;
    if (opts?.filters?.supportStatus && r.supportStatus !== opts.filters.supportStatus) continue;
    if (opts?.filters?.version && r.provenance.version !== opts.filters.version) continue;
    const { score, matched } = scoreProductRecord(tokens, normalized, r);
    if (score < minScore) continue;
    seen.add(r.id);
    hits.push({
      record: r,
      score,
      matchedTerms: matched,
      citation: `[KB-PRODUK:${r.id} · ${r.provenance.source} · status verifikasi: ${r.provenance.verificationStatus} · v${r.provenance.version}]`,
    });
  }
  hits.sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id));
  return hits.slice(0, maxResults);
}

export interface ProductRetrievalOutcome {
  hits: ProductRetrievalHit[];
  /** Alasan hasil kosong (temuan negatif dinyatakan eksplisit). */
  negativeReason: string | null;
  queryTokens: string[];
}

/**
 * Varian hasil-terstruktur: membedakan "tidak ada yang cocok"
 * (negatif — pemanggil WAJIB mengatakannya apa adanya) dari
 * "ada hasil". Hasil negatif BUKAN kegagalan sistem: KB produk
 * memang terbatas pada record terdaftar.
 */
export function searchProductWithOutcome(
  query: string,
  opts?: { maxResults?: number; filters?: ProductRetrievalFilters; minScore?: number },
): ProductRetrievalOutcome {
  const hits = searchProductKnowledge(query, opts);
  const tokens = tokenizeProductQuery(query);
  if (hits.length > 0) return { hits, negativeReason: null, queryTokens: tokens };
  const reason = tokens.length === 0
    ? 'Query tidak memuat istilah produk EZRAB yang dapat dicocokkan (hanya kata umum/stopword).'
    : 'Tidak ada record knowledge base produk yang cocok dengan istilah query — topik ini di luar cakupan KB produk terdaftar; jangan mengarang fitur pengganti.';
  return { hits, negativeReason: reason, queryTokens: tokens };
}

/** Baris jumlah live (runtime) untuk record terkait — null bila aksesor gagal. */
function liveCountLine(recordId: string): string | null {
  try {
    if (recordId === 'template-rab') {
      const n = RabTemplateService.getInstance().getAllTemplates().length;
      if (n > 0) return `Jumlah template RAB saat ini (dihitung runtime): ${n.toLocaleString('id-ID')} template.`;
    }
    if (recordId === 'database-ahsp') {
      const n = officialAhspRepository.size;
      if (n > 0) return `Jumlah analisa AHSP resmi saat ini (dihitung runtime): ${n.toLocaleString('id-ID')} analisa.`;
    }
  } catch { /* aksesor tak tersedia — klaim kualitatif saja */ }
  return null;
}

/** Blok konteks siap pakai untuk jawaban LLM (dengan label jujur). */
export function formatProductContext(hits: ProductRetrievalHit[]): string {
  if (hits.length === 0) return '';
  const lines: string[] = ['Pengetahuan produk EZRAB (terverifikasi dari kode aplikasi — status verifikasi tercantum per record):'];
  for (const h of hits) {
    const r = h.record;
    lines.push(`• ${r.commonName} [${r.category} · dukungan: ${r.supportStatus}] — ${r.summary}`);
    for (const d of r.details) lines.push(`  - ${d}`);
    if (r.chatCan.length > 0) lines.push(`  - Bisa dari chat: ${r.chatCan.join('; ')}.`);
    if (r.chatCannot.length > 0) lines.push(`  - TIDAK bisa dari chat: ${r.chatCannot.join('; ')}.`);
    if (r.menuId) lines.push(`  - Menu: ${r.menuId}.`);
    if (r.unsupportedCapabilities.length > 0 && r.unsupportedCapabilities[0] !== '—') {
      lines.push(`  - Belum didukung: ${r.unsupportedCapabilities.join('; ')}.`);
    }
    const live = liveCountLine(r.id);
    if (live) lines.push(`  - ${live}`);
    lines.push(`  ${h.citation}`);
  }
  return lines.join('\n');
}

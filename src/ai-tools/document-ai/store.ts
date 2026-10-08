/**
 * AI DOKUMEN — Store (src/ai-tools/document-ai/store.ts)
 *
 * Persistensi client-side (localStorage) untuk library dokumen, riwayat
 * analisis, dan draf. JUJUR: ini bukan backend — data hanya di browser ini,
 * bukan isolasi multi-user server. Jangan diklaim sebagai storage resmi.
 */

export type DocStatus = 'ready' | 'processing' | 'failed' | 'needs_review';

export interface DocRecord {
  id: string;
  fileName: string;
  kind: 'pdf' | 'docx' | 'xlsx' | 'text' | 'unknown';
  sizeBytes: number;
  projectId?: string;
  projectName?: string;
  /** Teks terekstrak (dengan marker [Halaman N] untuk PDF). */
  text: string;
  pages?: number;
  charCount: number;
  status: DocStatus;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
  at: number;
}

export interface HistoryEntry {
  id: string;
  type: 'summary' | 'qa' | 'extract' | 'compare' | 'checklist' | 'draft';
  docIds: string[];
  docNames: string[];
  title: string;
  /** Ringkasan hasil (bukan seluruh teks) agar storage ringan. */
  resultPreview: string;
  /** Hasil lengkap. */
  resultFull: string;
  chat?: ChatMessage[];
  at: number;
}

export interface DraftRecord {
  id: string;
  templateId: string;
  templateName: string;
  title: string;
  content: string;
  projectId?: string;
  projectName?: string;
  status: 'draft' | 'reviewed';
  createdAt: number;
  updatedAt: number;
}

const LS_DOCS = 'ezrab_docai_library_v1';
const LS_HISTORY = 'ezrab_docai_history_v1';
const LS_DRAFTS = 'ezrab_docai_drafts_v1';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage penuh — abaikan, jangan crash */
  }
}

export const docStore = {
  list(): DocRecord[] {
    return read<DocRecord[]>(LS_DOCS, []).sort((a, b) => b.updatedAt - a.updatedAt);
  },
  get(id: string): DocRecord | undefined {
    return read<DocRecord[]>(LS_DOCS, []).find((d) => d.id === id);
  },
  upsert(doc: DocRecord): void {
    const all = read<DocRecord[]>(LS_DOCS, []);
    const i = all.findIndex((d) => d.id === doc.id);
    if (i >= 0) all[i] = doc;
    else all.push(doc);
    // Batasi 50 dokumen agar localStorage tidak bloat (teks bisa besar).
    const trimmed = all.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 50);
    write(LS_DOCS, trimmed);
  },
  remove(id: string): void {
    write(
      LS_DOCS,
      read<DocRecord[]>(LS_DOCS, []).filter((d) => d.id !== id)
    );
  },
};

export const historyStore = {
  list(): HistoryEntry[] {
    return read<HistoryEntry[]>(LS_HISTORY, []).sort((a, b) => b.at - a.at);
  },
  add(entry: Omit<HistoryEntry, 'id' | 'at'>): HistoryEntry {
    const full: HistoryEntry = {
      ...entry,
      id: `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      at: Date.now(),
    };
    const all = [full, ...read<HistoryEntry[]>(LS_HISTORY, [])].slice(0, 200);
    write(LS_HISTORY, all);
    return full;
  },
  remove(id: string): void {
    write(
      LS_HISTORY,
      read<HistoryEntry[]>(LS_HISTORY, []).filter((h) => h.id !== id)
    );
  },
  clear(): void {
    write(LS_HISTORY, []);
  },
};

export const draftStore = {
  list(): DraftRecord[] {
    return read<DraftRecord[]>(LS_DRAFTS, []).sort((a, b) => b.updatedAt - a.updatedAt);
  },
  get(id: string): DraftRecord | undefined {
    return read<DraftRecord[]>(LS_DRAFTS, []).find((d) => d.id === id);
  },
  upsert(draft: DraftRecord): void {
    const all = read<DraftRecord[]>(LS_DRAFTS, []);
    const i = all.findIndex((d) => d.id === draft.id);
    if (i >= 0) all[i] = draft;
    else all.push(draft);
    write(LS_DRAFTS, all.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 100));
  },
  remove(id: string): void {
    write(
      LS_DRAFTS,
      read<DraftRecord[]>(LS_DRAFTS, []).filter((d) => d.id !== id)
    );
  },
};

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDate(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '-';
  }
}

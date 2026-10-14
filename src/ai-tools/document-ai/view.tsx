/**
 * AI DOKUMEN — Orchestrator (4 menu utama), dashboard design language.
 *
 * 1. Dokumen Saya     — library dokumen (upload, cari, filter, hapus)
 * 2. Analisis Dokumen — workspace kontekstual (dibuka dari Dokumen Saya)
 * 3. Buat Dokumen     — template → draf → review → ekspor
 * 4. Riwayat          — jejak analisis & draf
 *
 * State (dokumen, riwayat, draf) diangkat ke sini dan dipersist ke
 * localStorage — BUKAN penyimpanan server, jangan dianggap arsip resmi.
 *
 * Aturan assistant (master prompt):
 * - Floating assistant global TAMPIL di halaman utama AI Dokumen.
 * - Disembunyikan HANYA saat workspace analisis aktif (ada dokumen dibuka).
 * - Tidak ada dua chatbot bersamaan; riwayat chat tidak dicampur.
 * DokumenAiView melaporkan status workspace via onAnalysisActiveChange.
 */
import React, { useEffect, useState } from 'react';
import { FolderOpen, ScanSearch, FilePlus2, History } from 'lucide-react';
import { DocLibrary } from './components/DocLibrary';
import { DocAnalyzer } from './components/DocAnalyzer';
import { DocCreator } from './components/DocCreator';
import { DocHistory } from './components/DocHistory';
import { useI18n } from '../../i18n/I18nContext';
import './document-ai.css';

/* ------------------------------------------------------------------ */
/* Tipe & helper bersama (dipakai komponen di ./components)            */
/* ------------------------------------------------------------------ */

export type DocStatus = 'ready' | 'processing' | 'failed' | 'needs_review';

export interface DocRecord {
  id: string;
  fileName: string;
  kind: 'pdf' | 'docx' | 'xlsx' | 'text' | 'unknown';
  sizeBytes: number;
  /** Teks terekstrak dari dokumen. */
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

export type HistoryType = 'summary' | 'qa' | 'extract' | 'compare' | 'checklist' | 'draft';

export interface HistoryEntry {
  id: string;
  type: HistoryType;
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

/* ------------------------------------------------------------------ */
/* Persistensi localStorage (client-side saja)                         */
/* ------------------------------------------------------------------ */

const LS_DOCS = 'ezrab_docai_library_v1';
const LS_HISTORY = 'ezrab_docai_history_v1';
const LS_DRAFTS = 'ezrab_docai_drafts_v1';
const MAX_DOCS = 50;
const MAX_HISTORY = 200;
const MAX_DRAFTS = 100;

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLS(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage penuh — abaikan, jangan crash */
  }
}

/* ------------------------------------------------------------------ */
/* Orchestrator                                                        */
/* ------------------------------------------------------------------ */

type Tab = 'library' | 'analyze' | 'create' | 'history';

interface DokumenAiViewProps {
  /** Dipanggil saat workspace analisis aktif/nonaktif — WorkspaceView memakai ini untuk menyembunyikan floating assistant. */
  onAnalysisActiveChange?: (active: boolean) => void;
}

export const DokumenAiView: React.FC<DokumenAiViewProps> = ({ onAnalysisActiveChange }) => {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('library');
  const [activeDoc, setActiveDoc] = useState<DocRecord | null>(null);

  const [docs, setDocs] = useState<DocRecord[]>(() => readLS<DocRecord[]>(LS_DOCS, []));
  const [history, setHistory] = useState<HistoryEntry[]>(() => readLS<HistoryEntry[]>(LS_HISTORY, []));
  const [drafts, setDrafts] = useState<DraftRecord[]>(() => readLS<DraftRecord[]>(LS_DRAFTS, []));

  useEffect(() => { writeLS(LS_DOCS, docs); }, [docs]);
  useEffect(() => { writeLS(LS_HISTORY, history); }, [history]);
  useEffect(() => { writeLS(LS_DRAFTS, drafts); }, [drafts]);

  const analysisActive = tab === 'analyze' && activeDoc !== null;

  useEffect(() => {
    onAnalysisActiveChange?.(analysisActive);
  }, [analysisActive, onAnalysisActiveChange]);

  const upsertDoc = (d: DocRecord) =>
    setDocs((prev) => {
      const i = prev.findIndex((x) => x.id === d.id);
      const next = i >= 0 ? prev.map((x) => (x.id === d.id ? d : x)) : [...prev, d];
      // Batasi 50 dokumen agar localStorage tidak bloat (teks bisa besar).
      return next.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_DOCS);
    });

  const removeDoc = (id: string) => {
    setDocs((prev) => prev.filter((x) => x.id !== id));
    setActiveDoc((cur) => (cur?.id === id ? null : cur));
  };

  const addHistory = (e: Omit<HistoryEntry, 'id' | 'at'>) =>
    setHistory((prev) => [{ ...e, id: newId('h'), at: Date.now() }, ...prev].slice(0, MAX_HISTORY));

  const removeHistory = (id: string) => setHistory((prev) => prev.filter((x) => x.id !== id));

  const upsertDraft = (d: DraftRecord) =>
    setDrafts((prev) => {
      const i = prev.findIndex((x) => x.id === d.id);
      const next = i >= 0 ? prev.map((x) => (x.id === d.id ? d : x)) : [...prev, d];
      return next.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_DRAFTS);
    });

  const openAnalyze = (doc: DocRecord) => {
    setActiveDoc(doc);
    setTab('analyze');
  };

  return (
    <div className="docai-shell">
      <nav className="docai-tabs" aria-label={t('ai.doc.tab_menu_label')}>
        {[
          { id: 'library', label: t('ai.doc.tab_library'), icon: FolderOpen },
          { id: 'analyze', label: t('ai.doc.tab_analyze'), icon: ScanSearch },
          { id: 'create', label: t('ai.doc.tab_create'), icon: FilePlus2 },
          { id: 'history', label: t('ai.doc.tab_history'), icon: History },
        ].map((tabItem) => {
          const Icon = tabItem.icon;
          const disabled = tabItem.id === 'analyze' && !activeDoc;
          return (
            <button
              key={tabItem.id}
              className={`docai-tabbtn ${tab === tabItem.id ? 'active' : ''}`}
              disabled={disabled}
              title={disabled ? t('ai.doc.tab_analyze_disabled') : tabItem.label}
              onClick={() => setTab(tabItem.id as Tab)}
            >
              <Icon size={16} /> {tabItem.label}
            </button>
          );
        })}
      </nav>

      <div className="docai-content">
        {tab === 'library' && (
          <DocLibrary docs={docs} onUpsertDoc={upsertDoc} onRemoveDoc={removeDoc} onAnalyze={openAnalyze} />
        )}
        {tab === 'analyze' && activeDoc && (
          <DocAnalyzer doc={activeDoc} docs={docs} onBack={() => setTab('library')} onAddHistory={addHistory} />
        )}
        {tab === 'create' && (
          <DocCreator drafts={drafts} onUpsertDraft={upsertDraft} onAddHistory={addHistory} />
        )}
        {tab === 'history' && <DocHistory history={history} onRemoveHistory={removeHistory} />}
      </div>
    </div>
  );
};

export default DokumenAiView;

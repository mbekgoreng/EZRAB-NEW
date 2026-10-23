/**
 * AI DOCUMENT STUDIO — Orchestrator halaman, dashboard design language.
 *
 * Tiga jalur utama Studio (satu DocCreator yang sama, mode berbeda):
 * 1. Buat dengan AI  — instruksi bebas + konteks proyek/perusahaan → draf AI
 * 2. Gunakan Template — katalog template + form field → draf AI
 * 3. Edit & Periksa  — editor draf + review deterministik + revisi AI + versi
 *
 * Permukaan pendukung (dipertahankan, bukan jalur utama):
 * - Dokumen Saya     — library dokumen (upload, cari, filter, hapus)
 * - Analisis Dokumen — workspace kontekstual (dibuka dari Dokumen Saya)
 * - Riwayat          — jejak analisis & draf
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
import { FolderOpen, ScanSearch, History, Sparkles, LayoutTemplate, ClipboardCheck } from 'lucide-react';
import type { DraftVersion } from './store';
import type { ContextField } from './types';

export type { DraftVersion };
import { DocLibrary } from './components/DocLibrary';
import { DocAnalyzer } from './components/DocAnalyzer';
import { DocCreator } from './components/DocCreator';
import { DocHistory } from './components/DocHistory';
import { useI18n } from '../../i18n/I18nContext';
import './document-ai.css';
import { TutorialHelpButton } from '../../components/onboarding/tutorials/TutorialHelpButton';

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

/** Status dokumen AI Document (Fase B5). 'reviewed' = nilai lama, diperlakukan sama dengan 'review'. */
export type DocDraftStatus = 'draft' | 'editing' | 'review' | 'reviewed' | 'final' | 'archived';

/** Label status untuk UI (Indonesia). */
export function docStatusLabel(s: DocDraftStatus | string): string {
  switch (s) {
    case 'editing': return 'Sedang Disunting';
    case 'review': case 'reviewed': return 'Siap Ditinjau';
    case 'final': return 'Final';
    case 'archived': return 'Diarsipkan';
    default: return 'Draft';
  }
}

export interface DraftRecord {
  id: string;
  templateId: string;
  templateName: string;
  title: string;
  content: string;
  /**
   * Format isi `content`: 'plain' = teks polos (draf lama), 'html' = rich text
   * dari editor Word-like. Record lama tidak punya field ini → dibaca 'plain'
   * dan dikonversi saat dibuka di editor (lihat richText.ts).
   */
  contentFormat?: 'plain' | 'html';
  /** Versi isi sebelumnya (disimpan saat buat ulang AI) agar bisa dipulihkan. */
  previousContent?: string;
  previousFormat?: 'plain' | 'html';
  projectId?: string;
  projectName?: string;
  status: DocDraftStatus;
  createdAt: number;
  updatedAt: number;
  /* --- Document Studio (aditif, identik dengan store.ts DraftRecord;
     record lama tanpa field ini tetap terbaca) --- */
  /** Riwayat versi isi (maks 20, tertua dibuang). */
  versions?: DraftVersion[];
  /** Snapshot konteks ber-provenance yang dipakai saat generate. */
  contextSnapshot?: ContextField[];
  /** Label model yang menghasilkan draf (bila diketahui dari provider). */
  modelLabel?: string;
  /** Versi system prompt DRAFT yang dipakai (prompt.ts DRAFT_PROMPT_VERSION). */
  promptVersion?: string;
  /* --- Polish (aditif, identik dengan store.ts DraftRecord;
     record lama tanpa field ini tetap terbaca) --- */
  /** Profil perusahaan yang kopnya dipakai draf ini (null = pakai default). */
  companyProfileId?: string | null;
  /** Nama penyetuju — diisi HANYA lewat tindakan persetujuan eksplisit (approveDraft). */
  approvedBy?: string;
  /** Waktu persetujuan (epoch ms), pasangan approvedBy. */
  approvedAt?: number;
  /** Status temuan review per ID temuan — persisten lintas sesi (panel review). */
  findingStatuses?: Record<string, 'open' | 'fixed' | 'ignored' | 'checked'>;
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

/** Tab halaman: tiga jalur Studio + tiga permukaan pendukung. */
type Tab = 'buat-ai' | 'template' | 'periksa' | 'library' | 'analyze' | 'history';

/** Jalur Studio memakai SATU instance DocCreator agar draf aktif tidak hilang saat berpindah jalur. */
const STUDIO_TABS: Tab[] = ['buat-ai', 'template', 'periksa'];
type StudioPath = 'ai' | 'template' | 'periksa';
const STUDIO_PATH: Record<string, StudioPath> = {
  'buat-ai': 'ai',
  template: 'template',
  periksa: 'periksa',
};

interface DokumenAiViewProps {
  /** Dipanggil saat workspace analisis aktif/nonaktif — WorkspaceView memakai ini untuk menyembunyikan floating assistant. */
  onAnalysisActiveChange?: (active: boolean) => void;
  /** Navigasi silang ke menu workspace lain (mis. 'dokumen-tender' = Dokumen Proyek). Konteks proyek aktif dipertahankan WorkspaceView. */
  onNavigateToMenu?: (menu: string) => void;
}

export const DokumenAiView: React.FC<DokumenAiViewProps> = ({ onAnalysisActiveChange, onNavigateToMenu }) => {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('buat-ai');
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
    <div className="docai-shell" data-tutorial="dokumenai-main">
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 12px 0' }}>
        <TutorialHelpButton tutorialId="dokumen-ai" label="Buka tutorial AI Dokumen" />
      </div>
      <nav className="docai-tabs" aria-label={t('ai.doc.tab_menu_label')}>
        {[
          { id: 'buat-ai', label: 'Buat dengan AI', icon: Sparkles },
          { id: 'template', label: 'Gunakan Template', icon: LayoutTemplate },
          { id: 'periksa', label: 'Edit & Periksa', icon: ClipboardCheck },
        ].map((tabItem) => {
          const Icon = tabItem.icon;
          return (
            <button
              key={tabItem.id}
              className={`docai-tabbtn ${tab === tabItem.id ? 'active' : ''}`}
              onClick={() => setTab(tabItem.id as Tab)}
            >
              <Icon size={16} /> {tabItem.label}
            </button>
          );
        })}
        <span className="docai-tabsep" aria-hidden="true" />
        {[
          { id: 'library', label: t('ai.doc.tab_library'), icon: FolderOpen },
          { id: 'analyze', label: t('ai.doc.tab_analyze'), icon: ScanSearch },
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
        {STUDIO_TABS.includes(tab) && (
          <DocCreator
            drafts={drafts}
            onUpsertDraft={upsertDraft}
            onAddHistory={addHistory}
            onNavigateToMenu={onNavigateToMenu}
            studioPath={STUDIO_PATH[tab]}
          />
        )}
        {tab === 'history' && <DocHistory history={history} onRemoveHistory={removeHistory} />}
      </div>
    </div>
  );
};

export default DokumenAiView;

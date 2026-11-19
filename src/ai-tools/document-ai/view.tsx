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
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FolderOpen, ScanSearch, History, Sparkles, LayoutTemplate, ClipboardCheck, Lock, FileText } from 'lucide-react';
import { FsChip } from '../../components/feature-shell/FeatureFullscreenShell';
import { FeaturePageShell } from '../../components/feature-shell/FeaturePageShell';
import { useCreditSimulation } from '../../ai-credits/useCreditSimulation';
import { aiFeatureLockedMessage, planAllowsAiFeature } from '../../ai-credits/featureGate';
import type { DraftVersion } from './store';
import type { ContextField } from './types';

export type { DraftVersion };
import { DocLibrary, type AfterAnalysisChoice } from './components/DocLibrary';
import { DocAnalyzer, type AnaTab, type DocAnalyzerRunRequest } from './components/DocAnalyzer';
import { DocCreator, type DocCreatorSubView } from './components/DocCreator';
import { DocHistory } from './components/DocHistory';
import { useI18n } from '../../i18n/I18nContext';
import './document-ai.css';
import { TutorialHelpButton } from '../../components/onboarding/tutorials/TutorialHelpButton';
import { consumePendingAiEntry } from '../aiNavigation';
import { consumeDocAnalyzeHandoff, setActiveDocDescriptor } from '../ezrab-ai/dedDocSessionHolder';

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
  /** Total halaman berkas sumber (PDF) bila melebihi halaman terparse. */
  sourcePages?: number;
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
  /* Bar tab tunggal (owner 2026-11-19: satu baris tab, bukan dua) — sub-tampilan
     kreator diangkat ke sini agar tombolnya hidup di bar yang sama dengan tab
     utama. Reset ke 'buat' ditangani efek studioPath di DocCreator (berjalan
     saat mount + saat jalur berubah), sama seperti perilaku lama. */
  const [creatorSubView, setCreatorSubView] = useState<DocCreatorSubView>('buat');
  const [creatorEmpty, setCreatorEmpty] = useState(true);
  const [activeDoc, setActiveDoc] = useState<DocRecord | null>(null);
  // Panel Pengaturan Dokumen (pola app shell 2026-11-10): mode analisis
  // pertama + tujuan sesudah analisis, dipilih dari Dokumen Saya dan
  // diteruskan ke workspace analisis / navigasi.
  const [analyzerInitialTab, setAnalyzerInitialTab] = useState<AnaTab>('summary');
  const [afterAnalysis, setAfterAnalysis] = useState<AfterAnalysisChoice>('hasil');
  // Masukan mode dari layar input (mockup v2.3): pertanyaan awal mode
  // Tanya Dokumen + dokumen pembanding mode Bandingkan.
  const [analyzerQuestion, setAnalyzerQuestion] = useState('');
  const [analyzerCompareId, setAnalyzerCompareId] = useState('');
  // Permintaan auto-run satu kali dari tombol "Jalankan {Mode}" di
  // Dokumen Saya. SETIAP jalur lain yang membuka workspace analisis
  // (tombol tab, tombol Analisis per baris, handoff chat) WAJIB
  // mengosongkannya agar workspace tidak menjalankan run basi.
  const [analyzerRunRequest, setAnalyzerRunRequest] = useState<DocAnalyzerRunRequest | null>(null);
  const analyzerRunNonceRef = useRef(0);

  const [docs, setDocs] = useState<DocRecord[]>(() => readLS<DocRecord[]>(LS_DOCS, []));
  const [history, setHistory] = useState<HistoryEntry[]>(() => readLS<HistoryEntry[]>(LS_HISTORY, []));
  const [drafts, setDrafts] = useState<DraftRecord[]>(() => readLS<DraftRecord[]>(LS_DRAFTS, []));
  // Perintah Chat AI "ringkas dokumen ini" (2026-11-17, Kelompok 3):
  // ref dokumen agar handoff dari chat menemukan dokumen terbaru tanpa
  // membuat callback handoff bergantung pada state docs.
  const docsRef = useRef(docs);
  docsRef.current = docs;
  // Perbaikan final: konsumsi entry Dokumen AI. Sebelumnya view ini TIDAK
  // PERNAH mengonsumsi entry klasik — hanya projectId via URL yang bertahan,
  // sehingga documentId/prompt dari resolver tidak pernah tampil. DocCreator
  // tidak punya prop instruksi awal, jadi konteks tampil sebagai banner
  // (bukan prefill ke dalam editor) — tanpa refactor Studio.
  const [docEntryBanner, setDocEntryBanner] = useState<{ label: string; prompt?: string; documentId?: string } | null>(null);
  const docMountConsumeRef = useRef(false);
  const takeDocEntry = useCallback((clearOnMismatch: boolean) => {
    const entry = consumePendingAiEntry('document_ai', { clearOnMismatch });
    if (!entry) return;
    setDocEntryBanner({
      label: entry.contextLabel || 'Konteks Dokumen AI dari EZRAB AI',
      prompt: entry.initialPrompt,
      documentId: entry.documentId,
    });
  }, []);
  // Jalur mount: mismatch dibersihkan. Jalur event (view ter-mount): tidak.
  useEffect(() => {
    if (docMountConsumeRef.current) return;
    docMountConsumeRef.current = true;
    takeDocEntry(true);
  }, [takeDocEntry]);
  useEffect(() => {
    const onEntry = () => takeDocEntry(false);
    window.addEventListener('ezrab:ai-entry', onEntry);
    return () => window.removeEventListener('ezrab:ai-entry', onEntry);
  }, [takeDocEntry]);

  // Perintah Chat AI "ringkas dokumen ini" (2026-11-17, Kelompok 3):
  // Chat AI membaca deskriptor dokumen aktif dari holder ini (teks
  // dokumen TIDAK disalin — dibaca dari library localStorage saat
  // eksekusi headless, agar tidak basi).
  useEffect(() => {
    setActiveDocDescriptor(
      activeDoc
        ? { id: activeDoc.id, fileName: activeDoc.fileName, status: activeDoc.status, charCount: activeDoc.charCount, updatedAt: activeDoc.updatedAt }
        : null,
    );
  }, [activeDoc]);

  // Handoff ringkasan dari chat (jalur fallback bila callback headless
  // belum ter-wiring): konsumsi sinyal saat mount — view SELALU remount
  // saat ganti menu (WorkspaceView merender satu cabang ternary), jadi
  // mount adalah mekanisme yang benar-benar jalan. Dokumen dibuka di
  // tab Ringkasan; pengguna menekan tombol analisis di sana (ringkasan
  // TIDAK berjalan otomatis — DocAnalyzer tidak punya prop auto-run).
  const takeDocHandoff = useCallback(() => {
    const h = consumeDocAnalyzeHandoff();
    if (!h) return;
    setDocEntryBanner({
      label: 'Ringkasan dari Chat AI',
      prompt: 'Ringkas dokumen ini',
      documentId: h.docId,
    });
    const doc = docsRef.current.find((d) => d.id === h.docId);
    if (!doc) return;
    setActiveDoc(doc);
    setAnalyzerInitialTab('summary');
    setAnalyzerRunRequest(null);
    setTab('analyze');
  }, []);
  useEffect(() => {
    takeDocHandoff();
  }, [takeDocHandoff]);

  useEffect(() => { writeLS(LS_DOCS, docs); }, [docs]);
  useEffect(() => { writeLS(LS_HISTORY, history); }, [history]);
  useEffect(() => { writeLS(LS_DRAFTS, drafts); }, [drafts]);

  const analysisActive = tab === 'analyze' && activeDoc !== null;

  // Gerbang paket (simulasi): paket Free tidak punya entitlement dokumen
  // sama sekali (aiDocuments 'locked' + documentTemplates 'none' di
  // plans.ts) — seluruh permukaan AI Document dikunci untuk Free dengan
  // pesan yang jelas. Paket lain diteruskan ke gerbang per-permukaan
  // (DocAnalyzer untuk Starter, DocCreator mode AI untuk Starter).
  const { balance: creditBalance } = useCreditSimulation();
  const docViewLockedForFree = creditBalance.plan === 'free' && !planAllowsAiFeature(creditBalance.plan, 'ai-document');

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
    setAnalyzerRunRequest(null);
    setTab('analyze');
  };

  /** Tombol "Jalankan {Mode}" di Dokumen Saya: buka workspace DENGAN
      auto-run satu kali (mode + pertanyaan/pembanding saat diklik). */
  const runAnalysis = (doc: DocRecord) => {
    analyzerRunNonceRef.current += 1;
    setActiveDoc(doc);
    setAnalyzerRunRequest({
      nonce: analyzerRunNonceRef.current,
      tab: analyzerInitialTab,
      question: analyzerQuestion.trim() || undefined,
      compareId: analyzerCompareId || undefined,
    });
    setTab('analyze');
  };

  /** Pindah tab lewat bar tab — selalu mengosongkan runRequest agar
      klik tab "Analisis Dokumen" tidak menjalankan run basi. */
  const switchTab = (next: Tab) => {
    setAnalyzerRunRequest(null);
    /* Bar tab tunggal: klik ulang tab Studio yang sedang aktif = kembali ke
       formulir Buat Dokumen (tombol sub-tampilan 'Buat' dilipat ke sini agar
       9 tombol muat satu baris di 1366px — ukur replika: 10 tombol
       overflow 150px). */
    if (next === tab && STUDIO_TABS.includes(next)) setCreatorSubView('buat');
    setTab(next);
  };

  // ---- Kerangka halaman di dalam workspace (pola app shell, mockup
  // ter-ACC owner 2026-11-10): fitur TIDAK lagi menutupi workspace —
  // sidebar + topbar tetap terlihat, halaman tidak scroll. Shell hanya
  // membingkai Studio: tab, state, dan komponen di dalamnya tidak
  // berubah. Header memuat chip tab aktif + chip status dokumen
  // (pengganti stepper shell lama sesuai mockup ter-ACC).
  const TAB_LABELS: Record<Tab, string> = {
    'buat-ai': 'Buat dengan AI',
    template: 'Gunakan Template',
    periksa: 'Edit & Periksa',
    library: t('ai.doc.tab_library'),
    analyze: t('ai.doc.tab_analyze'),
    history: t('ai.doc.tab_history'),
  };
  /* Chip indikator tab aktif di header shell. Teks TANPA awalan "Tab:"
     (owner 2026-11-10: label lama terbaca seperti label debug) — fungsinya
     sama, tab aktif juga terlihat pada bar tab di bawahnya. */
  const docTabChip = <FsChip kind="plain">{TAB_LABELS[tab]}</FsChip>;

  const docContextText = activeDoc
    ? `${activeDoc.fileName}${activeDoc.pages ? ` · ${activeDoc.pages} halaman` : ''} · ${formatBytes(activeDoc.sizeBytes)}`
    : undefined;

  const docStatusChip = activeDoc ? (
    <FsChip
      kind={
        activeDoc.status === 'ready'
          ? 'ok'
          : activeDoc.status === 'needs_review'
            ? 'warn'
            : activeDoc.status === 'failed'
              ? 'danger'
              : 'mode'
      }
    >
      Status:{' '}
      {activeDoc.status === 'ready'
        ? 'Siap'
        : activeDoc.status === 'needs_review'
          ? 'Perlu Ditinjau'
          : activeDoc.status === 'failed'
            ? 'Gagal'
            : 'Diproses'}
    </FsChip>
  ) : undefined;

  return (
    <FeaturePageShell
      title="Document AI"
      subtitle={t('ai.doc.lib.sub')}
      icon={<FileText size={20} />}
      contextLabel={activeDoc ? 'Dokumen:' : undefined}
      contextText={docContextText}
      chips={<>{docTabChip}{docStatusChip}</>}
      creditText={`Kredit AI: ${creditBalance.total.toLocaleString('id-ID')}`}
    >
    <div className="docai-shell" data-tutorial="dokumenai-main">
      {docEntryBanner && (
        <div className="docai-entrybanner">
          <strong>Konteks Dokumen AI: {docEntryBanner.label}</strong>
          {docEntryBanner.documentId ? <div>Dokumen: {docEntryBanner.documentId}</div> : null}
          {docEntryBanner.prompt ? <div className="docai-entrybanner-prompt">{docEntryBanner.prompt}</div> : null}
        </div>
      )}
      <nav className={`docai-tabs ${STUDIO_TABS.includes(tab) && creatorEmpty ? 'docai-tabs-merged' : ''}`} aria-label={t('ai.doc.tab_menu_label')}>
        {[
          { id: 'buat-ai', label: 'Buat dengan AI', icon: Sparkles },
          { id: 'template', label: 'Gunakan Template', icon: LayoutTemplate },
          { id: 'periksa', label: 'Edit & Periksa', icon: ClipboardCheck },
        ].map((tabItem) => {
          const Icon = tabItem.icon;
          /* Tooltip kembali-ke-Buat saat sub-tampilan lain sedang aktif. */
          const backToCreate = tab === tabItem.id && creatorSubView !== 'buat';
          return (
            <button
              key={tabItem.id}
              className={`docai-tabbtn ${tab === tabItem.id ? 'active' : ''}`}
              title={backToCreate ? 'Kembali ke Buat Dokumen' : tabItem.label}
              onClick={() => switchTab(tabItem.id as Tab)}
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
              onClick={() => switchTab(tabItem.id as Tab)}
            >
              <Icon size={16} /> {tabItem.label}
            </button>
          );
        })}
        {/* Bar tab tunggal (owner 2026-11-19): sub-tampilan kreator menyatu di
            baris yang sama — tampil hanya di jalur Studio saat kreator kosong
            (perilaku lama: subnav hanya dirender di mode empty). */}
        {STUDIO_TABS.includes(tab) && creatorEmpty && (
          <>
            <span className="docai-tabsep" aria-hidden="true" />
            {/* Label pendek tanpa ikon agar tombol muat satu baris di 1366px;
                label lengkap tetap ada di tooltip. 'Buat' tidak ada di sini —
                dilipat ke klik-ulang tab Studio aktif (lihat switchTab). */}
            {[
              { id: 'tersimpan', label: 'Tersimpan', full: 'Dokumen Tersimpan' },
              { id: 'template', label: 'Template', full: 'Template Saya' },
              { id: 'identitas', label: 'Identitas', full: 'Identitas Perusahaan' },
            ].map((subItem) => (
              <button
                key={subItem.id}
                className={`docai-tabbtn docai-tabbtn-sub ${creatorSubView === subItem.id ? 'active' : ''}`}
                title={subItem.full}
                onClick={() => setCreatorSubView(subItem.id as DocCreatorSubView)}
              >
                {subItem.label}
              </button>
            ))}
          </>
        )}
        {/* Fit remediation 2026-11-19 (Child 5): tombol bantuan pindah ke
            dalam bar tab (ujung kanan) — baris 38px tersendiri dihapus,
            tombol tetap terlihat di semua tab. */}
        <span className="docai-help-row">
          <TutorialHelpButton tutorialId="dokumen-ai" label="Buka tutorial AI Dokumen" />
        </span>
      </nav>

      <div className="docai-content">
        {docViewLockedForFree ? (
          <div
            role="alert"
            className="docai-lockalert"
            style={{ maxWidth: 640 }}
          >
            <Lock size={18} />
            <span>{aiFeatureLockedMessage(creditBalance.plan, 'ai-document')}</span>
          </div>
        ) : (
          <>
        {tab === 'library' && (
          <DocLibrary
            docs={docs}
            onUpsertDoc={upsertDoc}
            onRemoveDoc={removeDoc}
            onAnalyze={openAnalyze}
            initialMode={analyzerInitialTab}
            onInitialModeChange={setAnalyzerInitialTab}
            afterAnalysis={afterAnalysis}
            onAfterAnalysisChange={setAfterAnalysis}
            onContinueToDed={onNavigateToMenu ? () => onNavigateToMenu('ded-ai') : undefined}
            initialQuestion={analyzerQuestion}
            onInitialQuestionChange={setAnalyzerQuestion}
            initialCompareId={analyzerCompareId}
            onInitialCompareIdChange={setAnalyzerCompareId}
            onRunAnalysis={runAnalysis}
          />
        )}
        {tab === 'analyze' && activeDoc && (
          <DocAnalyzer
            doc={activeDoc} docs={docs} onBack={() => setTab('library')} onAddHistory={addHistory}
            initialTab={analyzerInitialTab}
            initialQuestion={analyzerQuestion}
            initialCompareId={analyzerCompareId}
            runRequest={analyzerRunRequest}
          />
        )}
        {STUDIO_TABS.includes(tab) && (
          <DocCreator
            drafts={drafts}
            onUpsertDraft={upsertDraft}
            onAddHistory={addHistory}
            onNavigateToMenu={onNavigateToMenu}
            studioPath={STUDIO_PATH[tab]}
            subView={creatorSubView}
            onSubViewChange={setCreatorSubView}
            onEmptyChange={setCreatorEmpty}
          />
        )}
        {tab === 'history' && <DocHistory history={history} onRemoveHistory={removeHistory} />}
          </>
        )}
      </div>
    </div>
    </FeaturePageShell>
  );
};

export default DokumenAiView;

/**
 * AI DOKUMEN — Buat Dokumen (editor Word-like).
 *
 * Alur: empty state (template → proyek & instruksi → Buatkan Draf) →
 * editor rich-text penuh (TipTap) di atas halaman A4 → simpan (terverifikasi
 * ke localStorage) → unduh .txt.
 *
 * Aturan integritas (dipertahankan dari versi lama):
 * - AI hanya memakai informasi yang diberikan; placeholder tak dikenal
 *   ditandai [ISI: ...], tidak dikarang.
 * - Status "Tersimpan" hanya tampil setelah penulisan ke penyimpanan
 *   BENAR-BENAR terverifikasi (baca-balik localStorage), bukan asumsi.
 * - Buat ulang AI selalu lewat konfirmasi; isi editor saat ini menjadi
 *   `previousContent` sehingga dapat dipulihkan.
 *
 * Format: draf baru disimpan sebagai HTML (contentFormat: 'html');
 * draf lama teks polos dikonversi saat dibuka (richText.ts).
 */
import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2, Save, Download, AlertTriangle, FilePlus2, Check, MoreHorizontal,
  RefreshCw, History as HistoryIcon, Focus, ListTree, FilePlus, X, CloudOff,
  Printer, LayoutTemplate, ArrowRight, Briefcase, Sparkles, ClipboardCheck,
  Search, Eye, CheckCircle2, FileText, Lock, Building2, Languages,
} from 'lucide-react';
import { getDefaultProfile, kopHtml, listProfiles } from '../companyProfile';
import {
  TEMPLATE_META, EXTRA_BUILTIN_TEMPLATES, TEMPLATE_CATEGORIES,
  resolveTemplate, subtypeLabel, referenceStatusLabel,
  listUserTemplates, saveUserTemplate, newUserTemplate, type UserTemplate,
} from '../docTemplates';
import { htmlToPaperBlocks } from '../paperModel';
import { exportPaperPdf, exportPaperDocx } from '../paperExport';
import { CompanyIdentityPanel, MyTemplatesPanel, SavedDocsPanel } from './DocPanels';
import { DocContextPanel, CONTEXT_FIELD_LABELS } from './DocContextPanel';
import {
  catalogCategoryOf, filterCatalogEntries, groupCatalogEntries,
  scaffoldPreviewLines, CATALOG_GROUP_LABELS,
} from './templateCatalog';
import { DocStudioReview } from './DocStudioReview';
import { DocEnhance } from './DocEnhance';
import { DocFunnel, type FunnelGenerateRequest, type FunnelGenerateResult } from './DocFunnel';
import { formatFunnelDate } from '../funnel';
import { documentStudioOrchestrator } from '../orchestrator';
import { useCreditSimulation } from '../../../ai-credits/useCreditSimulation';
import { CreditBalance } from '../../../ai-credits/components/CreditBalance';
import '../../../ai-credits/ai-credits.css';
import { tariffFor } from '../../../ai-credits/config';
import { aiFeatureLockedMessage, planAllowsAiFeature } from '../../../ai-credits/featureGate';
import { collectProjectContext, detectMissingFields } from '../contextAdapter';
import { approveDraft, buildTranslatedDraft, deriveDisplayStatus, pushVersion, restoreVersion } from '../store';
import {
  consumeDocAiGenerateRun,
  failDocAiGenerate,
  finishDocAiGenerate,
  getDocAiGenerateRun,
  persistDraftDurable,
  readDraftDurable,
  recordHistoryDurable,
  startDocAiGenerate,
  subscribeDocAiGenerate,
  type DocAiGenerateRun,
} from '../docAiRunStore';
import { TRANSLATE_LANGUAGE_NAMES } from '../prompt';
import {
  TRANSLATE_LANGUAGE_CODES,
  type MissingFieldInfo,
  type ReviewFindingStatus,
  type TranslateLanguageCode,
} from '../types';
import { docStatusLabel, type DocDraftStatus } from '../view';
import type { Editor } from '@tiptap/react';
import type { DraftRecord, HistoryEntry } from '../view';
import { newId, formatDate } from '../view';
import { draftFormat, toEditorHtml, toPlainText } from '../richText';
import { markdownToHtml } from '../markdownHtml';
import { useProject } from '../../../context/ProjectContext';
import { useI18n } from '../../../i18n/I18nContext';
import { maskAiModelName } from '../../../services/aiModelMasking';

const DocEditor = lazy(() => import('./DocEditor'));

/** Kunci localStorage yang sama dengan view.tsx (penyimpanan draf saat ini). */
const LS_DRAFTS_KEY = 'ezrab_docai_drafts_v1';

const getTemplates = (
  t: (key: string) => string,
): Array<{ id: string; name: string; desc: string }> => [
  { id: 'berita-acara', name: t('ai.doc.create.tmpl_berita_n'), desc: t('ai.doc.create.tmpl_berita_d') },
  { id: 'surat', name: t('ai.doc.create.tmpl_surat_n'), desc: t('ai.doc.create.tmpl_surat_d') },
  { id: 'laporan-harian', name: t('ai.doc.create.tmpl_laporan_n'), desc: t('ai.doc.create.tmpl_laporan_d') },
  { id: 'notulen', name: t('ai.doc.create.tmpl_notulen_n'), desc: t('ai.doc.create.tmpl_notulen_d') },
  { id: 'checklist-qc', name: t('ai.doc.create.tmpl_checklist_n'), desc: t('ai.doc.create.tmpl_checklist_d') },
  { id: 'bebas', name: t('ai.doc.create.tmpl_bebas_n'), desc: t('ai.doc.create.tmpl_bebas_d') },
];

type SaveState = 'saved' | 'dirty' | 'saving' | 'failed';
type PendingAction =
  | { type: 'regen' }
  | { type: 'new' }
  | { type: 'open'; target: DraftRecord }
  | null;

interface OutlineItem {
  level: number;
  text: string;
  index: number;
}

/** Baca-balik localStorage untuk MEMBUKTIKAN draf benar-benar tersimpan. */
function verifySaved(rec: DraftRecord, attempts = 14): Promise<boolean> {
  return new Promise((resolve) => {
    const check = (left: number) => {
      try {
        const raw = localStorage.getItem(LS_DRAFTS_KEY);
        const arr = raw ? (JSON.parse(raw) as DraftRecord[]) : [];
        const found = arr.find((d) => d.id === rec.id);
        if (found && found.updatedAt === rec.updatedAt && found.content === rec.content) {
          resolve(true);
          return;
        }
      } catch {
        /* lanjut mencoba */
      }
      if (left <= 0) {
        resolve(false);
        return;
      }
      setTimeout(() => check(left - 1), 60);
    };
    check(attempts);
  });
}

/** Jalur Studio yang sedang aktif di view.tsx — mengatur mode awal DocCreator. */
export type DocStudioPath = 'ai' | 'template' | 'periksa';

/** Sub-tampilan kreator — tombolnya dirender di bar tab tunggal view.tsx (owner 2026-11-19: satu baris tab, bukan dua). */
export type DocCreatorSubView = 'buat' | 'tersimpan' | 'template' | 'identitas';

export const DocCreator: React.FC<{
  drafts: DraftRecord[];
  onUpsertDraft: (d: DraftRecord) => void;
  onAddHistory: (e: Omit<HistoryEntry, 'id' | 'at'>) => void;
  /** Navigasi silang ke menu lain (Dokumen Proyek & Tender = 'dokumen-tender'). Opsional: tanpa prop ini tautan silang tidak dirender. */
  onNavigateToMenu?: (menu: string) => void;
  /** Buka permukaan analisis dokumen (tautan kecil langkah 1 funnel). Opsional: tanpa prop ini tautan tidak dirender. */
  onOpenAnalysis?: () => void;
  /** Jalur Document Studio dari view.tsx: 'ai' = instruksi-pertama, 'template' = form-pertama, 'periksa' = editor + panel periksa. */
  studioPath?: DocStudioPath;
  /** Sub-tampilan aktif — state diangkat ke view.tsx agar tombolnya hidup di bar tab tunggal. */
  subView: DocCreatorSubView;
  /** Dipanggil saat kreator mengubah sub-tampilan sendiri (pakai template, buka draf, ganti jalur). */
  onSubViewChange: (v: DocCreatorSubView) => void;
  /** Dilaporkan ke view.tsx saat mode empty/editor berubah — tombol sub-tampilan hanya tampil saat empty. */
  onEmptyChange?: (isEmpty: boolean) => void;
}> = ({ drafts, onUpsertDraft, onAddHistory, onNavigateToMenu, onOpenAnalysis, studioPath, subView, onSubViewChange, onEmptyChange }) => {
  const { t } = useI18n();
  // Gerbang paket (simulasi): SELURUH generate mengikuti entitlement
  // aiDocuments plans.ts — tertutup untuk Free & Starter. KOREKSI audit
  // DocAI 2026-11-22: komentar lama membebaskan mode Form Template
  // ("mengikuti entitlement template, sumbu terpisah") — padahal tombol
  // generate mode form memanggil AI yang SAMA PERSIS (CREATE_DOCUMENT)
  // dengan mode AI, sehingga pengguna Starter bisa generate draf AI
  // lewat mode form. Gerbang kini berlaku di kedua mode (runGenerate),
  // begitu pula terjemahan, Poles/Revisi, dan Sempurnakan Teks.
  const { balance: creditBalance, consume } = useCreditSimulation();
  const docAiAllowed = planAllowsAiFeature(creditBalance.plan, 'ai-document');
  const docAiLockedMsg = aiFeatureLockedMessage(creditBalance.plan, 'ai-document');
  /* Fit remediation 2026-11-19 (Child 5): satu baris — kalimat pertama pesan
     kunci (fitur + paket) + penanda demo dari kalimat terakhir pesan yang
     sama. Seluruhnya diturunkan dari pesan dinamis, tanpa teks hardcode
     (dijaga tes Child 3: creator tidak boleh mengandung literal penanda
     demo / nama paket). Pesan lengkap tetap dirender di balik "Detail". */
  const docAiLockedParts = docAiLockedMsg.split('. ');
  const docAiLockedShort = `${docAiLockedParts[0]} — ${docAiLockedParts[docAiLockedParts.length - 1].split(' — ')[0]}`;
  const TEMPLATES = getTemplates(t);
  /* Paper System (Fase B): subnavigasi + template tambahan + profil perusahaan.
     subView diangkat ke view.tsx (bar tab tunggal) — lihat props. */
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [subtypeId, setSubtypeId] = useState('');
  const [showSample, setShowSample] = useState(false);
  const [userTplVersion, setUserTplVersion] = useState(0);
  const [profileVersion, setProfileVersion] = useState(0);
  const [exporting, setExporting] = useState<'pdf' | 'docx' | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const userTemplates = useMemo(() => listUserTemplates(false), [userTplVersion]);
  const ALL_TEMPLATES = [
    ...TEMPLATES,
    ...EXTRA_BUILTIN_TEMPLATES,
    ...userTemplates.map((u) => ({ id: u.id, name: u.name, desc: u.desc || 'Template saya' })),
  ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const defaultProfile = useMemo(() => getDefaultProfile(), [profileVersion]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allProfiles = useMemo(() => listProfiles(), [profileVersion]);
  const { currentProject, projects } = useProject();

  const [templateId, setTemplateId] = useState('berita-acara');
  const [projectId, setProjectId] = useState(currentProject?.id || '');
  const [instruction, setInstruction] = useState('');

  const [mode, setMode] = useState<'empty' | 'editor'>('empty');
  /* Laporkan mode empty/editor ke view.tsx — tombol sub-tampilan di bar tab
     tunggal hanya tampil saat kreator kosong (perilaku lama: subnav hanya
     dirender di mode empty). */
  useEffect(() => {
    onEmptyChange?.(mode === 'empty');
  }, [mode, onEmptyChange]);
  const [draft, setDraft] = useState<DraftRecord | null>(null);
  const [html, setHtml] = useState('');
  const [editorKey, setEditorKey] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  /* Document Studio: mode buat (instruksi-pertama vs form-pertama), sumber
     konteks yang diizinkan, dan daftar field belum tersedia dari generate. */
  const [createMode, setCreateMode] = useState<'ai' | 'form'>(studioPath === 'template' ? 'form' : 'ai');
  const [aiAutoType, setAiAutoType] = useState(true);
  /* Fit remediation 2026-11-19 (Child 5): pesan lengkap strip kunci hanya
     tampil bila "Detail" dibuka — default strip satu baris. */
  const [lockDetailOpen, setLockDetailOpen] = useState(false);
  const [srcProject, setSrcProject] = useState(true);
  const [srcCompany, setSrcCompany] = useState(true);
  const [genMissing, setGenMissing] = useState<MissingFieldInfo[]>([]);
  /** true bila konteks yang dikirim ke AI pada generate terakhir dipotong service (batas karakter). */
  const [genTruncated, setGenTruncated] = useState(false);

  /* Template Studio (polish §2): pencarian + filter kategori katalog. */
  const [tplQuery, setTplQuery] = useState('');
  const [tplCat, setTplCat] = useState<'all' | string>('all');

  /* Editor (polish §3/§4): mode pratinjau + bar konfirmasi persetujuan final. */
  const [previewMode, setPreviewMode] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [approverName, setApproverName] = useState('');

  /* Terjemahan (F8): bar pemilih bahasa + proses + catatan hasil yang
     ditampilkan setelah draf terjemahan dibuka. */
  const [translateOpen, setTranslateOpen] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translateInfo, setTranslateInfo] = useState<string | null>(null);

  /* Funnel "Mau bikin apa?" (di-ACC owner 2026-11-20): entri DEFAULT
     pembuatan dokumen pada jalur kreasi (ai/template). Form lengkap lama
     tetap bisa dijangkau lewat tautan di dalam funnel & di atas form lama. */
  const [funnelActive, setFunnelActive] = useState(true);
  const [funnelBusy, setFunnelBusy] = useState(false);

  /* Jalur Studio dari view.tsx mengatur mode tampil; sub-tampilan di bar tab
     tunggal tetap bebas dipakai pengguna setelahnya (efek hanya berjalan
     saat jalur berubah). Setiap jalur kreasi dibuka kembali pada funnel. */
  useEffect(() => {
    if (!studioPath) return;
    onSubViewChange('buat');
    setFunnelActive(true);
    if (studioPath === 'ai') setCreateMode('ai');
    if (studioPath === 'template') setCreateMode('form');
  }, [studioPath]);

  const editorRef = useRef<Editor | null>(null);
  const loadingRef = useRef(false);

  // Re-attach generate (perintah owner 2026-11-21 04:19 — proses tidak
  // boleh ke-reset saat pindah menu): lari generate dicatat di
  // docAiRunStore (module-level) dan bertahan melewati unmount. Mount
  // ini me-attach ulang: lari yang masih berjalan → tampil busy; lari
  // yang selesai saat user di menu lain → drafnya dimuat ke editor.
  // Lari MILIK mount ini dilewati (fungsi run-nya sendiri yang mengatur
  // UI-nya); cermin mode/draf dipakai agar draf selesai tidak menimpa
  // pekerjaan editor yang sedang dibuka user.
  const ownGenRunRef = useRef<number | null>(null);
  const editorStateRef = useRef({ mode, draft });
  editorStateRef.current = { mode, draft };
  useEffect(() => {
    const attach = (run: DocAiGenerateRun | null) => {
      if (!run || run.requestId === ownGenRunRef.current) return;
      if (run.status === 'running') {
        if (run.kind === 'funnel') setFunnelBusy(true);
        else if (run.kind === 'translate') setTranslating(true);
        else setBusy(true);
        return;
      }
      if (run.status === 'done' && run.draftId) {
        const { mode: m, draft: d } = editorStateRef.current;
        if (m === 'empty' && !d) {
          const rec = readDraftDurable(run.draftId);
          if (rec) {
            setFunnelActive(false);
            loadIntoEditor(rec);
          }
        }
        consumeDocAiGenerateRun(run.requestId);
        return;
      }
      if (run.status === 'failed') {
        setError(run.error ?? t('ai.doc.create.err_gen_failed'));
        consumeDocAiGenerateRun(run.requestId);
      }
    };
    attach(getDocAiGenerateRun());
    return subscribeDocAiGenerate(attach);
    // Sengaja []: attach memakai ref + fungsi stabil; loadIntoEditor
    // hanya memanggil setState + helper modul (aman dari closure basi).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const template = ALL_TEMPLATES.find((x) => x.id === templateId) ?? ALL_TEMPLATES[0];
  const selectedUserTpl: UserTemplate | undefined = userTemplates.find((u) => u.id === templateId);
  const baseMeta = TEMPLATE_META[selectedUserTpl ? selectedUserTpl.baseTemplateId : templateId];
  const resolvedMeta = baseMeta ? resolveTemplate(baseMeta, subtypeId || undefined) : undefined;
  const effectiveMeta = resolvedMeta
    ? { ...resolvedMeta, scaffold: selectedUserTpl?.scaffold?.trim() ? selectedUserTpl.scaffold : resolvedMeta.scaffold }
    : undefined;
  const activeSubtypeLabel = baseMeta ? subtypeLabel(baseMeta, subtypeId || undefined) : '';
  const chooseTemplate = (id: string) => {
    setTemplateId(id);
    setSubtypeId(TEMPLATE_META[id]?.subtypes?.[0]?.id ?? '');
    setShowSample(false);
  };
  const project = projects.find((p) => p.id === projectId) || currentProject;

  /* Konteks ber-provenance untuk generate (Document Studio): hanya field
     yang benar-benar ada pada proyek/profil; toggle sumber memengaruhi
     daftar ini secara langsung, dan daftar inilah yang dikirim ke AI. */
  const genMeta = createMode === 'ai' && aiAutoType ? undefined : effectiveMeta;
  /** Detail template (subjenis/field/contoh) hanya relevan bila template dipilih. */
  const showTemplateDetail = createMode === 'form' || !aiAutoType;
  const contextFields = collectProjectContext(project ?? null, defaultProfile, {
    templateMeta: genMeta,
    sources: { project: srcProject, company: srcCompany },
  });
  const liveMissing = detectMissingFields(contextFields, genMeta, fieldValues);

  /* Template Studio: katalog dikelompokkan per kategori (template pengguna
     mengikuti kategori template dasarnya) + pencarian nama/kegunaan. */
  const userBaseMap = useMemo(
    () => new Map(userTemplates.map((u) => [u.id, u.baseTemplateId])),
    [userTemplates],
  );
  const catalogGroups = useMemo(
    () =>
      groupCatalogEntries(filterCatalogEntries(ALL_TEMPLATES, tplQuery), userBaseMap).filter(
        (g) => tplCat === 'all' || g.id === tplCat,
      ),
    // ALL_TEMPLATES dibangun ulang tiap render dari state yang sama.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tplQuery, tplCat, userTemplates, templateId],
  );
  /** Preview struktur singkat kartu katalog dari scaffold meta template itu. */
  const previewFor = (entryId: string): string[] => {
    const ut = userTemplates.find((u) => u.id === entryId);
    const scaffold = ut?.scaffold?.trim()
      ? ut.scaffold
      : TEMPLATE_META[ut ? ut.baseTemplateId : entryId]?.scaffold;
    return scaffoldPreviewLines(scaffold);
  };
  /** Field konteks yang benar-benar tersedia (akan dipakai generate). */
  const availableContext = contextFields.filter(
    (f) => f.verificationStatus !== 'missing' && f.value.trim(),
  );

  /* Kop per-dokumen (polish §3): profil efektif draf terbuka = profil yang
     dipilih untuk dokumen ini (draft.companyProfileId), jatuh ke profil
     default global bila belum dipilih / profilnya sudah dihapus. */
  const draftProfile = draft?.companyProfileId
    ? (allProfiles.find((p) => p.id === draft.companyProfileId) ?? null)
    : null;
  const effectiveProfile = draftProfile ?? defaultProfile;

  /* Status tampil (polish §4): label diturunkan dari status + daftar missing
     yang sudah dihitung komponen ini (hasil generate terakhir, atau daftar
     missing konteks/form yang hidup). 'Final' hanya dari status final —
     yang hanya bisa dicapai lewat approveDraft. */
  const statusMissingCount = genMissing.length > 0 ? genMissing.length : liveMissing.length;
  const displayStatus = draft ? deriveDisplayStatus(draft, statusMissingCount) : null;
  const displayStatusSlug = displayStatus
    ? {
        Final: 'final',
        'Perlu dilengkapi': 'incomplete',
        'Perlu ditinjau': 'review',
        'Siap disetujui': 'ready',
        Draf: 'draft',
      }[displayStatus]
    : '';

  /* Meta untuk review deterministik atas draf aktif (template dasar draf). */
  const reviewMeta = useMemo(() => {
    if (!draft) return undefined;
    const base = TEMPLATE_META[draft.templateId];
    return base ? resolveTemplate(base) : undefined;
  }, [draft]);

  const outline = useMemo<OutlineItem[]>(() => {
    if (!html) return [];
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const items: OutlineItem[] = [];
      doc.querySelectorAll('h1, h2, h3').forEach((h, i) => {
        items.push({ level: Number(h.tagName.slice(1)), text: h.textContent?.trim() || '—', index: i });
      });
      return items;
    } catch {
      return [];
    }
  }, [html]);

  /* ---------------- persistensi terverifikasi ---------------- */

  const persist = async (rec: DraftRecord): Promise<boolean> => {
    setSaveState('saving');
    onUpsertDraft(rec);
    // Tulis LANGSUNG ke localStorage (docAiRunStore): bila komponen
    // ter-unmount sebelum efek tulis-ulang view jalan (pindah menu di
    // tengah generate), draf tetap tersimpan — dan verifySaved di bawah
    // (baca-balik localStorage) tetap lolos.
    persistDraftDurable(rec);
    setDraft(rec);
    const ok = await verifySaved(rec);
    setSaveState(ok ? 'saved' : 'failed');
    return ok;
  };

  const buildRecord = (over: Partial<DraftRecord>): DraftRecord => {
    const base: DraftRecord =
      draft ??
      ({
        id: newId('draft'),
        templateId,
        templateName: template.name,
        title: `${template.name} — ${project?.name || t('ai.doc.create.no_project')}`,
        content: '',
        contentFormat: 'html',
        status: 'draft',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as DraftRecord);
    return { ...base, ...over, updatedAt: Date.now() };
  };

  const saveDraft = async () => {
    if (!draft) return;
    await persist(
      buildRecord({
        title: draft.title,
        content: html,
        contentFormat: 'html',
        // Menyimpan dokumen final tidak boleh menurunkannya diam-diam.
        status: draft.status === 'final' ? 'final' : 'review',
        projectId: draft.projectId,
        projectName: draft.projectName,
      }),
    );
  };

  /* ---------------- buka / muat draf ---------------- */

  const loadIntoEditor = (rec: DraftRecord) => {
    loadingRef.current = true;
    setDraft(rec);
    setTemplateId(rec.templateId || 'berita-acara');
    if (rec.projectId) setProjectId(rec.projectId);
    setHtml(toEditorHtml(rec.content, draftFormat(rec)));
    setEditorKey((k) => k + 1);
    setMode('editor');
    setSaveState('saved');
    setPending(null);
    setError(null);
    setGenMissing([]);
    setGenTruncated(false);
    setPreviewMode(false);
    setApproveOpen(false);
    setTranslateOpen(false);
    setTranslateInfo(null);
  };

  const openDraft = (target: DraftRecord) => {
    if (draft && saveState === 'dirty' && target.id !== draft.id) {
      setPending({ type: 'open', target });
      return;
    }
    loadIntoEditor(target);
  };

  /* ---------------- generate (AI) via Document Studio Orchestrator ---------------- */

  const runGenerate = async (isRegen: boolean) => {
    // Gerbang berlaku di KEDUA mode (audit DocAI 2026-11-22): generate
    // mode form memanggil AI yang sama dengan mode AI — pengecualian
    // `createMode === 'ai'` lama membiarkan paket terkunci generate
    // lewat mode form.
    if (!docAiAllowed) { setError(docAiLockedMsg); return; }
    setBusy(true);
    setError(null);
    setPending(null);
    setGenMissing([]);
    setGenTruncated(false);
    let genRunId: number | null = null;
    try {
      // Nama dokumen: jalur AI tanpa jenis terpilih = draf bebas otomatis.
      const docName =
        createMode === 'ai' && aiAutoType
          ? 'Draf Bebas (AI)'
          : activeSubtypeLabel
            ? `${template.name} — ${activeSubtypeLabel}`
            : template.name;
      // Catat lari di runtime (docAiRunStore) agar bertahan melewati
      // pindah menu — mount kembali me-attach ulang ke lari ini.
      genRunId = startDocAiGenerate('generate', docName).requestId;
      ownGenRunRef.current = genRunId;
      // CREATE_DOCUMENT (mode DRAFT + scaffold/aiGuidance + konteks
      // ber-provenance). Field yang belum tersedia TIDAK memblokir generate:
      // orchestrator melaporkannya sebagai missingFields dan AI menandai
      // [ISI: ...] — daftar ditampilkan ke pengguna, bukan disembunyikan.
      const res = await documentStudioOrchestrator.handle({
        intent: 'CREATE_DOCUMENT',
        instruction: instruction.trim() || undefined,
        templateMeta: genMeta,
        fieldValues,
        contextFields,
        documentName: docName,
        fileName: docName,
      });
      if (!res.success) {
        const msg = `${res.errorCode || 'ERROR'}: ${res.message || t('ai.doc.err_failed')}`;
        if (genRunId != null) failDocAiGenerate(genRunId, msg);
        setError(msg);
        return;
      }
      const reply = res.content || '';
      // Keluaran model adalah markdown terstruktur (kesepakatan FORMAT
      // KELUARAN di prompt DRAFT) — konversi ke HTML editor, BUKAN
      // plainToHtml yang memang menolak menafsirkan markdown.
      const newHtml = markdownToHtml(reply);
      setGenMissing(res.missingFields);
      setGenTruncated(res.truncated === true);
      if (isRegen && draft) {
        // Isi editor saat ini (termasuk edit yang belum disimpan) menjadi
        // versi sebelumnya DAN entri riwayat versi — tidak ada yang terhapus
        // diam-diam.
        const current = buildRecord({ content: html, contentFormat: 'html' });
        const withVersion = pushVersion(current, 'generate', t('ai.doc.create.ver_before_regen'));
        const rec: DraftRecord = {
          ...withVersion,
          content: newHtml,
          contentFormat: 'html',
          previousContent: html,
          previousFormat: 'html',
          status: 'draft',
          // Isi berubah total → persetujuan final lama tidak berlaku lagi.
          approvedBy: undefined,
          approvedAt: undefined,
          contextSnapshot: contextFields,
          promptVersion: res.promptVersion ?? draft.promptVersion,
          updatedAt: Date.now(),
        };
        loadingRef.current = true;
        setHtml(newHtml);
        setEditorKey((k) => k + 1);
        setMode('editor');
        await persist(rec);
        if (genRunId != null) finishDocAiGenerate(genRunId, rec.id);
      } else {
        const rec: DraftRecord = {
          id: newId('draft'),
          templateId: createMode === 'ai' && aiAutoType ? 'bebas' : templateId,
          templateName: docName,
          title: `${docName} — ${project?.name || t('ai.doc.create.no_project')}`,
          content: newHtml,
          contentFormat: 'html',
          projectId: project?.id,
          projectName: project?.name,
          status: 'draft',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          contextSnapshot: contextFields,
          promptVersion: res.promptVersion,
        };
        loadingRef.current = true;
        setHtml(newHtml);
        setEditorKey((k) => k + 1);
        setMode('editor');
        await persist(rec);
        if (genRunId != null) finishDocAiGenerate(genRunId, rec.id);
      }
      const historyEntry = {
        type: 'draft' as const,
        docIds: [] as string[],
        docNames: [] as string[],
        title: `${t('ai.doc.create.hist_a')} ${draft?.title || docName}`,
        resultPreview: reply.slice(0, 300),
        resultFull: reply,
      };
      onAddHistory(historyEntry);
      // Riwayat juga ditulis LANGSUNG ke localStorage agar bertahan
      // bila komponen ter-unmount sebelum efek tulis-ulang view jalan.
      recordHistoryDurable(historyEntry);
      // --- AI Credits: catat pemakaian SIMULASI (audit DocAI 2026-11-22:
      // generate sebelumnya tidak memotong kredit sama sekali, padahal
      // analisis di DocAnalyzer memotong). Kategori complex — generate
      // dokumen utuh, pola yang sama dengan DocAnalyzer. ---
      consume('ai-document', tariffFor('ai-document/complex').max, `AI Document (generate): ${docName.slice(0, 50)}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('ai.doc.err_unexpected');
      if (genRunId != null) failDocAiGenerate(genRunId, msg);
      setError(msg);
    } finally {
      if (genRunId != null && ownGenRunRef.current === genRunId) ownGenRunRef.current = null;
      setBusy(false);
    }
  };

  /* ---------------- sempurnakan prompt funnel dengan AI (langkah 3) ---------------- */

  /** Sempurnakan custom prompt funnel dengan AI SUNGGUHAN (audit DocAI
      2026-11-22 — tombol AI langkah 3 sebelumnya hanya membingkai teks
      secara deterministik). Lewat ENHANCE_TEXT mode ENHANCE (transformasi
      'bebas' + instruksi): model memperbaiki bahasa prompt tanpa menambah
      fakta. Gagal → DocFunnel memakai bingkai deterministik sebagai
      fallback. TIDAK memotong kredit — ini penyempurnaan MASUKAN untuk
      generate yang sudah dikenai tarif complex. */
  const enhanceFunnelPromptAi = async (
    text: string,
    docLabel: string,
  ): Promise<{ ok: true; text: string } | { ok: false; error: string }> => {
    if (!docAiAllowed) return { ok: false, error: docAiLockedMsg };
    try {
      const res = await documentStudioOrchestrator.handle({
        intent: 'ENHANCE_TEXT',
        selectionText: text,
        transform: 'bebas',
        instruction: `Sempurnakan prompt pembuatan "${docLabel}" ini: perbaiki bahasa menjadi jelas, lengkap, dan formal; pertahankan SEMUA fakta, angka, nama, tanggal, dan detail persis seperti aslinya; jangan menambah fakta baru. Kembalikan HANYA prompt hasil sempurnaan, maksimal 600 karakter.`,
        fileName: docLabel,
      });
      if (!res.success) {
        return { ok: false, error: `${res.errorCode || 'ERROR'}: ${res.message || t('ai.doc.create.err_prompt_failed')}` };
      }
      const out = (res.content || '').trim();
      if (!out) return { ok: false, error: t('ai.doc.create.err_prompt_empty') };
      return { ok: true, text: out };
    } catch (e: unknown) {
      return { ok: false, error: e instanceof Error ? e.message : t('ai.doc.create.err_prompt_failed') };
    }
  };

  /* ---------------- generate via funnel "Mau bikin apa?" ---------------- */

  /** Generate dari funnel: pengguna hanya memberi isi pokok + tanggal.
      Template/subjenis dari langkah 2 funnel; tanggal masuk ke DATA DOKUMEN
      (field tanggalDokumen, bila template memilikinya) DAN ke instruksi
      (agar template tanpa field tanggal — mis. bebas — tetap menerima
      tanggalnya). Field lain dibiarkan kosong → AI menandai [ISI: ...]
      sesuai aturan integritas yang sama dengan form lama. Berbeda dengan
      runGenerate, fungsi ini TIDAK beralih ke mode editor — funnel
      menampilkan layar Selesai sendiri; draf + html disimpan di state yang
      sama sehingga ekspor PDF/Word dan editor memakai draf yang sama. */
  const runFunnelGenerate = async (req: FunnelGenerateRequest): Promise<FunnelGenerateResult> => {
    if (!docAiAllowed) return { ok: false, error: docAiLockedMsg };
    if (funnelBusy) return { ok: false, error: t('ai.doc.create.err_gen_busy') };
    const baseMeta = TEMPLATE_META[req.choice.templateId];
    if (!baseMeta) return { ok: false, error: `Template "${req.choice.templateId}" tidak ditemukan.` };
    const meta = resolveTemplate(baseMeta, req.choice.subtypeId);
    const tmplName = ALL_TEMPLATES.find((x) => x.id === req.choice.templateId)?.name ?? req.choice.label;
    const subLabel = req.choice.subtypeId ? subtypeLabel(baseMeta, req.choice.subtypeId) : '';
    const docName = subLabel ? `${tmplName} — ${subLabel}` : tmplName;
    const funnelFieldValues = { tanggalDokumen: req.date };
    const funnelContext = collectProjectContext(project ?? null, defaultProfile, {
      templateMeta: meta,
      sources: { project: true, company: true },
    });
    const funnelInstruction =
      `${req.prompt.trim()}\n\nTanggal dokumen: ${formatFunnelDate(req.date)}.`;
    setFunnelBusy(true);
    // Catat lari di runtime (docAiRunStore) agar bertahan melewati
    // pindah menu — mount kembali me-attach ulang ke lari ini.
    const funnelRunId = startDocAiGenerate('funnel', docName).requestId;
    ownGenRunRef.current = funnelRunId;
    try {
      const res = await documentStudioOrchestrator.handle({
        intent: 'CREATE_DOCUMENT',
        instruction: funnelInstruction,
        templateMeta: meta,
        fieldValues: funnelFieldValues,
        contextFields: funnelContext,
        documentName: docName,
        fileName: docName,
      });
      if (!res.success) {
        const msg = `${res.errorCode || 'ERROR'}: ${res.message || t('ai.doc.err_failed')}`;
        failDocAiGenerate(funnelRunId, msg);
        return { ok: false, error: msg };
      }
      const newHtml = markdownToHtml(res.content || '');
      const rec: DraftRecord = {
        id: newId('draft'),
        templateId: req.choice.templateId,
        templateName: docName,
        title: `${docName} — ${project?.name || t('ai.doc.create.no_project')}`,
        content: newHtml,
        contentFormat: 'html',
        projectId: project?.id,
        projectName: project?.name,
        status: 'draft',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        contextSnapshot: funnelContext,
        promptVersion: res.promptVersion,
      };
      setGenMissing(res.missingFields);
      setGenTruncated(res.truncated === true);
      loadingRef.current = true;
      setHtml(newHtml);
      setEditorKey((k) => k + 1);
      await persist(rec);
      finishDocAiGenerate(funnelRunId, rec.id);
      const funnelHistoryEntry = {
        type: 'draft' as const,
        docIds: [] as string[],
        docNames: [] as string[],
        title: `${t('ai.doc.create.hist_a')} ${docName}`,
        resultPreview: (res.content || '').slice(0, 300),
        resultFull: res.content || '',
      };
      onAddHistory(funnelHistoryEntry);
      // Riwayat juga ditulis LANGSUNG ke localStorage agar bertahan
      // bila komponen ter-unmount sebelum efek tulis-ulang view jalan.
      recordHistoryDurable(funnelHistoryEntry);
      // --- AI Credits: catat pemakaian SIMULASI (complex — generate
      // dokumen utuh; sebelumnya tidak memotong kredit sama sekali). ---
      consume('ai-document', tariffFor('ai-document/complex').max, `AI Document (funnel): ${docName.slice(0, 50)}`);
      return { ok: true, draft: rec, html: newHtml };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('ai.doc.err_unexpected');
      failDocAiGenerate(funnelRunId, msg);
      return { ok: false, error: msg };
    } finally {
      if (ownGenRunRef.current === funnelRunId) ownGenRunRef.current = null;
      setFunnelBusy(false);
    }
  };

  /* ---------------- terjemahan AI (F8) ---------------- */

  /** Terjemahkan isi editor berjalan ke bahasa target lewat intent
      TRANSLATE_DOCUMENT. Hasilnya menjadi DRAF BARU yang dibuka di editor —
      dokumen sumber tidak ditimpa; isi editor yang belum tersimpan disimpan
      dulu ke draf sumber agar tidak hilang. Draf terjemahan mewarisi
      template/kop/proyek sumber, tetapi SELALU berstatus 'draft' (status
      final & persetujuan sumber tidak diwarisi). */
  const runTranslate = async (target: TranslateLanguageCode) => {
    if (!draft || translating) return;
    // Gerbang paket (audit DocAI 2026-11-22): terjemahan adalah panggilan
    // AI (TRANSLATE_DOCUMENT) — sebelumnya tanpa gerbang sama sekali.
    if (!docAiAllowed) { setError(docAiLockedMsg); return; }
    const source = draft;
    const sourceHtml = html;
    if (!toPlainText(sourceHtml, 'html').trim()) {
      setTranslateOpen(false);
      setError(t('ai.doc.create.err_empty_translate'));
      return;
    }
    setTranslating(true);
    setError(null);
    // Catat lari di runtime (docAiRunStore) agar bertahan melewati
    // pindah menu — mount kembali me-attach ulang ke lari ini.
    const translateRunId = startDocAiGenerate('translate', source.title).requestId;
    ownGenRunRef.current = translateRunId;
    try {
      const sourceNow = buildRecord({ content: sourceHtml, contentFormat: 'html', status: source.status });
      await persist(sourceNow);
      const res = await documentStudioOrchestrator.handle({
        intent: 'TRANSLATE_DOCUMENT',
        documentText: sourceHtml,
        fileName: source.title,
        documentName: source.title,
        targetLanguage: target,
      });
      if (!res.success) {
        const msg = `${res.errorCode || 'ERROR'}: ${res.message || t('ai.doc.err_failed')}`;
        failDocAiGenerate(translateRunId, msg);
        setError(msg);
        return;
      }
      const translatedHtml = markdownToHtml(res.content || '');
      const langLabel = TRANSLATE_LANGUAGE_NAMES[target].label;
      const rec = buildTranslatedDraft(source, {
        content: translatedHtml,
        targetLanguage: target,
        modelLabel: res.model ?? undefined,
        promptVersion: res.promptVersion,
      });
      await persist(rec);
      finishDocAiGenerate(translateRunId, rec.id);
      loadIntoEditor(rec);
      // Cabang res.truncated DIHAPUS (audit DocAI 2026-11-22): service
      // TRANSLATE selalu mengembalikan truncated=false sejak tanpa-batas
      // pemrosesan (dokumen besar diterjemahkan per potongan, bukan
      // dipotong) — cabang itu mati dan pesannya ("sebagian isi sumber
      // dipotong") sudah tidak bisa terjadi lagi.
      setTranslateInfo(
        `Draf terjemahan (${langLabel}) dibuat dari "${source.title}" dan tersimpan sebagai dokumen baru — dokumen sumber tidak berubah.` +
          // Masking (defense-in-depth): res.model may still carry a raw name
          // from stored/legacy responses — never render it verbatim.
          (res.model ? ` Model: ${maskAiModelName(res.model)}.` : ''),
      );
      const translateHistoryEntry = {
        type: 'draft' as const,
        docIds: [] as string[],
        docNames: [] as string[],
        title: `Terjemahan ${langLabel}: ${rec.title}`,
        resultPreview: (res.content || '').slice(0, 300),
        resultFull: res.content || '',
      };
      onAddHistory(translateHistoryEntry);
      // Riwayat juga ditulis LANGSUNG ke localStorage agar bertahan
      // bila komponen ter-unmount sebelum efek tulis-ulang view jalan.
      recordHistoryDurable(translateHistoryEntry);
      // --- AI Credits: catat pemakaian SIMULASI (complex — terjemahan
      // dokumen utuh; sebelumnya tidak memotong kredit sama sekali). ---
      consume('ai-document', tariffFor('ai-document/complex').max, `AI Document (translate): ${source.title.slice(0, 50)}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('ai.doc.err_unexpected');
      failDocAiGenerate(translateRunId, msg);
      setError(msg);
    } finally {
      if (ownGenRunRef.current === translateRunId) ownGenRunRef.current = null;
      setTranslating(false);
      setTranslateOpen(false);
    }
  };

  /* ---------------- revisi AI & riwayat versi (Edit & Periksa) ---------------- */

  /** Terapkan kandidat revisi dari panel periksa: snapshot isi berjalan
      sebagai versi 'revise' SEBELUM menimpa, lalu persist terverifikasi.
      Kandidat adalah markdown (dokumen dikirim ke AI sebagai markdown-lite)
      — dikonversi dengan markdownToHtml agar heading/tabel/tebal/daftar
      kandidat menjadi format editor sungguhan. */
  const applyCandidate = async (candidateMarkdown: string, note: string) => {
    if (!draft) return;
    const candidateHtml = markdownToHtml(candidateMarkdown);
    const current = buildRecord({ content: html, contentFormat: 'html' });
    const withVersion = pushVersion(current, 'revise', note);
    const rec: DraftRecord = {
      ...withVersion,
      content: candidateHtml,
      contentFormat: 'html',
      status: draft.status,
      updatedAt: Date.now(),
    };
    loadingRef.current = true;
    setHtml(candidateHtml);
    setEditorKey((k) => k + 1);
    await persist(rec);
  };

  /** Terapkan kandidat Enhance Text (DocEnhance): snapshot isi berjalan
      sebagai versi 'enhance' SEBELUM mengganti rentang, lalu ganti HANYA
      rentang terpilih di editor dan persist isi hasil edit editor.
      Kandidat berstruktur (multi-baris, heading, daftar, tabel pipa, atau
      mengandung **tebal**) dikonversi dengan markdownToHtml — transformasi
      'tabel' menjadi <table> sungguhan dan 'poin' menjadi <ul>; kandidat
      satu baris polos tetap disisipkan sebagai teks agar tidak memecah
      paragraf di tengah. Gagal mengganti → lempar error agar panel
      menampilkan pesan dan dokumen tidak berubah. */
  const applyEnhance = async (
    range: { from: number; to: number },
    candidateText: string,
    note: string,
  ) => {
    if (!draft) throw new Error(t('ai.doc.create.enhance_err_no_draft'));
    const ed = editorRef.current;
    if (!ed) throw new Error(t('ai.doc.create.enhance_err_no_editor'));
    const current = buildRecord({ content: html, contentFormat: 'html' });
    const withVersion = pushVersion(current, 'enhance', note);
    const structured =
      /\n/.test(candidateText) ||
      /(^|\n)\s*(#{1,6}\s|[-*•]\s|\d{1,3}[.)]\s)/.test(candidateText) ||
      candidateText.includes('**') ||
      /\|[\s:|-]+\|/.test(candidateText);
    const ok = structured
      ? ed.commands.insertContentAt({ from: range.from, to: range.to }, markdownToHtml(candidateText))
      : ed.commands.insertContentAt(
          { from: range.from, to: range.to },
          { type: 'text', text: candidateText },
        );
    if (!ok) throw new Error(t('ai.doc.create.enhance_err_replace'));
    const newHtml = ed.getHTML();
    const rec: DraftRecord = {
      ...withVersion,
      content: newHtml,
      contentFormat: 'html',
      status: draft.status,
      updatedAt: Date.now(),
    };
    loadingRef.current = true;
    setHtml(newHtml);
    setEditorKey((k) => k + 1);
    await persist(rec);
  };

  /** Status temuan review persisten: ditulis ke draf beserta isi editor
      berjalan (pola changeDraftKop) agar konten tidak terbalik ke versi
      tersimpan terakhir. */
  const changeFindingStatuses = (statuses: Record<string, ReviewFindingStatus>) => {
    if (!draft) return;
    const rec: DraftRecord = {
      ...draft,
      content: html,
      contentFormat: 'html',
      findingStatuses: statuses,
      updatedAt: Date.now(),
    };
    setDraft(rec);
    onUpsertDraft(rec);
  };

  /** Pulihkan versi: restoreVersion men-snapshot isi berjalan lebih dulu. */
  const restoreVersionById = async (versionId: string) => {
    if (!draft) return;
    const current = buildRecord({ content: html, contentFormat: 'html' });
    const restored = restoreVersion(current, versionId);
    if (restored === current) return;
    const restoredHtml = toEditorHtml(restored.content, draftFormat(restored));
    loadingRef.current = true;
    setHtml(restoredHtml);
    setEditorKey((k) => k + 1);
    await persist({ ...restored, content: restoredHtml, contentFormat: 'html', updatedAt: Date.now() });
  };

  /* ---------------- versi sebelumnya ---------------- */

  const restorePrevious = async () => {
    if (!draft?.previousContent) return;
    setMenuOpen(false);
    const prevHtml = toEditorHtml(draft.previousContent, draft.previousFormat ?? 'plain');
    const rec = buildRecord({
      content: prevHtml,
      contentFormat: 'html',
      previousContent: html,
      previousFormat: 'html',
      status: 'draft',
      // Isi diganti versi sebelumnya → status final & persetujuannya gugur.
      approvedBy: undefined,
      approvedAt: undefined,
    });
    loadingRef.current = true;
    setHtml(prevHtml);
    setEditorKey((k) => k + 1);
    await persist(rec);
  };

  /* ---------------- unduh .txt ---------------- */

  const downloadDraft = () => {
    if (!draft) return;
    const text = toPlainText(html, 'html');
    const blob = new Blob([`${t('ai.doc.create.draft_header')}\n${draft.title}\n\n${text}`], {
      type: 'text/plain;charset=utf-8',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = draft.title.replace(/[^\w\- ]/g, '').slice(0, 60) + '.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  /* ---------------- template pengguna ---------------- */

  const handleUseUserTemplate = (ut: UserTemplate) => {
    if (ut.sampleHtml) {
      const rec: DraftRecord = {
        id: newId('draft'),
        templateId: ut.baseTemplateId,
        templateName: ut.name,
        title: `${ut.name} — ${project?.name || t('ai.doc.create.no_project')}`,
        content: ut.sampleHtml,
        contentFormat: 'html',
        projectId: project?.id,
        projectName: project?.name,
        status: 'draft',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      onUpsertDraft(rec);
      onSubViewChange('buat');
      loadIntoEditor(rec);
      return;
    }
    setTemplateId(ut.id);
    onSubViewChange('buat');
    setMode('empty');
    setDraft(null);
    setHtml('');
  };

  /* ---------------- buat dari contoh (tanpa AI) ---------------- */

  const createFromSample = () => {
    const sample = effectiveMeta?.sampleHtml;
    if (!sample) return;
    const docName = activeSubtypeLabel ? `${template.name} — ${activeSubtypeLabel}` : template.name;
    const rec: DraftRecord = {
      id: newId('draft'),
      templateId,
      templateName: docName,
      title: `${docName} — ${project?.name || t('ai.doc.create.no_project')}`,
      content: sample,
      contentFormat: 'html',
      projectId: project?.id,
      projectName: project?.name,
      status: 'draft',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    onUpsertDraft(rec);
    loadIntoEditor(rec);
  };

  /* ---------------- ekspor kertas & cetak (Fase B3) ---------------- */

  const doExport = async (kind: 'pdf' | 'docx') => {
    if (!draft || exporting) return;
    setExporting(kind);
    setError(null);
    try {
      const input = { title: draft.title, blocks: htmlToPaperBlocks(html), profile: effectiveProfile };
      if (kind === 'pdf') await exportPaperPdf(input);
      else await exportPaperDocx(input);
    } catch (e) {
      setError(`${t('ai.doc.create.export_fail_a')} ${kind.toUpperCase()} ${t('ai.doc.create.export_fail_b')} ${e instanceof Error ? e.message : t('ai.doc.create.export_fail_c')}`);
    } finally {
      setExporting(null);
    }
  };

  const doPrint = () => {
    // Portal cetak: klon lembar aktif menjadi anak langsung <body> supaya
    // dokumen multipage tidak terpotong kontainer layout aplikasi.
    const sheet = document.querySelector('.docai-edmain .docai-page');
    if (!sheet) {
      window.print();
      return;
    }
    document.getElementById('docai-print-root')?.remove();
    const clone = sheet.cloneNode(true) as HTMLElement;
    clone.id = 'docai-print-root';
    document.body.appendChild(clone);
    document.body.classList.add('docai-printing');
    const cleanup = () => {
      document.body.classList.remove('docai-printing');
      clone.remove();
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
    // Pengaman kebocoran DOM saja — TIDAK boleh lebih cepat dari dialog
    // cetak pengguna (pembersihan utama lewat afterprint).
    setTimeout(cleanup, 60000);
  };

  const changeDraftStatus = (st: DocDraftStatus) => {
    if (!draft) return;
    // Status final terkunci: hanya berubah lewat persetujuan (approveDraft)
    // atau perubahan isi (buat ulang/pulihkan versi) — tidak dari select ini.
    if (draft.status === 'final') return;
    // 'final' tidak pernah dipasang dari pilihan manual.
    if (st === 'final') return;
    const rec = { ...draft, status: st, updatedAt: Date.now() };
    setDraft(rec);
    onUpsertDraft(rec);
  };

  /** Persetujuan sah (polish §4): satu-satunya jalan status menjadi final. */
  const approveCurrentDraft = async () => {
    if (!draft) return;
    const res = approveDraft(
      buildRecord({ content: html, contentFormat: 'html' }),
      approverName,
    );
    if (!res.ok) {
      setError(res.reason || t('ai.doc.create.err_approve_failed'));
      return;
    }
    setApproveOpen(false);
    setError(null);
    await persist(res.draft as DraftRecord);
  };

  /** Pilih profil kop untuk dokumen ini (tersimpan di draf, bukan global). */
  const changeDraftKop = (profileId: string) => {
    if (!draft || draft.status === 'final') return;
    const rec: DraftRecord = {
      ...draft,
      // Sertakan isi editor berjalan agar pergantian kop tidak mengembalikan
      // konten ke versi tersimpan terakhir.
      content: html,
      contentFormat: 'html',
      companyProfileId: profileId || null,
      updatedAt: Date.now(),
    };
    setDraft(rec);
    onUpsertDraft(rec);
  };

  /* ---------------- outline ---------------- */

  const jumpToHeading = (item: OutlineItem) => {
    const ed = editorRef.current;
    if (!ed) return;
    const el = ed.view.dom.querySelectorAll('h1, h2, h3')[item.index] as HTMLElement | undefined;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const pos = ed.view.posAtDOM(el, 0);
      ed.chain().focus().setTextSelection(pos).run();
    } catch {
      /* posisi tidak kritis */
    }
  };

  /* ---------------- render: daftar draf ---------------- */

  const draftList = drafts.length > 0 && (
    <div className="docai-edlist">
      <div className="docai-step">{t('ai.doc.create.draft_saved_list')}</div>
      <div className="docai-draftlist">
        {drafts.map((d) => (
          <button
            key={d.id}
            className={`docai-draftitem ${draft?.id === d.id ? 'active' : ''}`}
            onClick={() => openDraft(d)}
          >
            <div>
              <strong>{d.title}</strong>
              <span className={`docai-draftst st-${d.status === 'reviewed' ? 'review' : d.status}`}>
                {docStatusLabel(d.status)}
              </span>
            </div>
            <span>{formatDate(d.updatedAt)}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const confirmBar = pending && (
    <div className="docai-confirmbar" role="alertdialog" aria-live="polite">
      <AlertTriangle size={16} />
      <span>
        {pending.type === 'regen'
          ? t('ai.doc.create.ed_regen_body')
          : pending.type === 'new'
            ? t('ai.doc.create.ed_status_dirty') + ' — ' + t('ai.doc.create.ed_empty_h') + '?'
            : t('ai.doc.create.ed_status_dirty')}
      </span>
      <div className="docai-confirmbtns">
        <button
          className="docai-btn-primary"
          onClick={() => {
            if (pending.type === 'regen') void runGenerate(true);
            else if (pending.type === 'new') {
              setPending(null);
              setDraft(null);
              setHtml('');
              setMode('empty');
              setSaveState('saved');
            } else if (pending.type === 'open') loadIntoEditor(pending.target);
          }}
        >
          {pending.type === 'regen' ? t('ai.doc.create.ed_regen_go') : 'OK'}
        </button>
        <button className="docai-btn-ghost" onClick={() => setPending(null)}>
          {t('ai.doc.create.ed_cancel')}
        </button>
      </div>
    </div>
  );

  /* Fit remediation 2026-11-19 (Child 5): field isian template (subjenis +
     grid field) tinggal di kolom COMPOSE, tepat sebelum tombol generate —
     alur baca: pilih (kiri) → isi (kiri) → generate (kiri). Detail template
     read-only tetap di kolom konteks. Satu situs render untuk kedua mode
     (AI bertipe eksplisit + form); subjenis + field digabung SATU grid
     (dulu dua grid terpisah di kolom kanan). Logika nilai tidak berubah:
     state, handler, dan kondisi tampil yang sama seperti sebelumnya. */
  const templateFillFields =
    showTemplateDetail &&
    ((baseMeta?.subtypes?.length ?? 0) > 0 || (effectiveMeta && effectiveMeta.fields.length > 0)) ? (
      <>
        <div className="docai-step" style={{ textAlign: 'left', marginTop: 10 }}>{t('ai.doc.create.fill_title')}</div>
        <div className="docai-fieldgrid">
          {baseMeta?.subtypes && baseMeta.subtypes.length > 0 && (
            <label className="docai-fielditem">
              <span className="docai-label">{t('ai.doc.create.subtype_label')}</span>
              <select
                className="docai-select"
                style={{ marginBottom: 0 }}
                value={baseMeta.subtypes.some((s) => s.id === subtypeId) ? subtypeId : baseMeta.subtypes[0].id}
                onChange={(e) => { setSubtypeId(e.target.value); setShowSample(false); }}
              >
                {baseMeta.subtypes.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </label>
          )}
          {effectiveMeta && effectiveMeta.fields.map((f) => (
            <label key={f.key} className="docai-fielditem">
              <span className="docai-label">{f.label}{f.required ? ' *' : ''}</span>
              {f.type === 'date' ? (
                <input type="date" className="docai-input" style={{ marginBottom: 0 }} value={fieldValues[f.key] || ''} onChange={(e) => setFieldValues((v) => ({ ...v, [f.key]: e.target.value }))} />
              ) : f.type === 'textarea' ? (
                <textarea className="docai-textarea" style={{ marginBottom: 0 }} rows={2} value={fieldValues[f.key] || ''} placeholder={f.placeholder} onChange={(e) => setFieldValues((v) => ({ ...v, [f.key]: e.target.value }))} />
              ) : f.type === 'select' ? (
                <select className="docai-select" style={{ marginBottom: 0 }} value={fieldValues[f.key] || ''} onChange={(e) => setFieldValues((v) => ({ ...v, [f.key]: e.target.value }))}>
                  <option value="">{t('ai.doc.create.opt_pick')}</option>
                  {(f.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <input className="docai-input" style={{ marginBottom: 0 }} value={fieldValues[f.key] || ''} placeholder={f.placeholder} onChange={(e) => setFieldValues((v) => ({ ...v, [f.key]: e.target.value }))} />
              )}
            </label>
          ))}
        </div>
      </>
    ) : null;

  /* ---------------- render: empty state ---------------- */

  /* Baris subnavigasi lama DIHAPUS (owner 2026-11-19: satu baris tab) —
     keempat tombol sub-tampilan kini dirender di bar tab tunggal view.tsx
     (state diangkat via props subView/onSubViewChange). */

  if (mode === 'empty' && subView === 'identitas') {
    return (
      <div>
        <CompanyIdentityPanel onChanged={() => setProfileVersion((v) => v + 1)} />
        {onNavigateToMenu && (
          <p className="docai-hint" style={{ marginTop: 14 }}>
            {t('ai.doc.create.identity_hint_a')}{' '}
            <button type="button" className="docai-linkbtn" onClick={() => onNavigateToMenu('dokumen-tender')}>
              {t('ai.doc.create.xlink_open')} <ArrowRight size={13} />
            </button>
          </p>
        )}
      </div>
    );
  }
  if (mode === 'empty' && subView === 'template') {
    return (
      <div>
        <MyTemplatesPanel
          builtinNames={[...TEMPLATES, ...EXTRA_BUILTIN_TEMPLATES].map((x) => ({ id: x.id, name: x.name }))}
          onUse={handleUseUserTemplate}
        />
      </div>
    );
  }
  if (mode === 'empty' && subView === 'tersimpan') {
    return (
      <div>
        <SavedDocsPanel
          drafts={drafts}
          onCreate={() => onSubViewChange('buat')}
          onOpen={(d) => { onSubViewChange('buat'); openDraft(d); }}
          onStatus={(d, st) => onUpsertDraft({ ...d, status: st, updatedAt: Date.now() })}
        />
      </div>
    );
  }

  /* Funnel "Mau bikin apa?" — entri default pembuatan dokumen pada jalur
     kreasi (ai/template). Jalur 'periksa' tetap memakai form lama (pilih
     draf untuk diperiksa); form lengkap lama tetap bisa dijangkau dari
     funnel dan dari tautan di atas form lama. */
  if (mode === 'empty' && subView === 'buat' && studioPath !== 'periksa' && funnelActive) {
    return (
      <div className="docai-tab">
        {/* Badge saldo kredit (pola yang sama dengan DocAnalyzer):
            funnel adalah entri default generate — saldo harus terlihat
            sebelum pengguna menekan generate. Tanpa tombol top-up,
            seperti permukaan analisis. */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <CreditBalance compact showTopUp={false} />
        </div>
        <DocFunnel
          onGenerate={runFunnelGenerate}
          onEnhancePrompt={enhanceFunnelPromptAi}
          onExport={(kind) => void doExport(kind)}
          onOpenInEditor={() => { if (draft) setMode('editor'); }}
          onNavigateToMenu={onNavigateToMenu}
          onOpenAnalysis={onOpenAnalysis}
          onUseLegacyForm={() => setFunnelActive(false)}
          kopHeaderHtml={kopHtml(effectiveProfile) || ''}
          docAiAllowed={docAiAllowed}
          docAiLockedMsg={docAiLockedMsg}
        />
      </div>
    );
  }

  if (mode === 'empty') {
    return (
      <div className="docai-tab">
        {/* V3 2026-11-19 (mockup v3 di-ACC owner): subjudul halaman + hero
            "Mulai dokumen baru" dihapus — form langsung mulai di bawah
            tab. Header shell juga DIHAPUS (owner 2026-11-27).
            Catatan: pengungkapan status DRAF ikut hilang dari layar ini;
            draf tetap berlabel DRAF di editor/riwayat. */}
        <div className="docai-empty docai-edempty">
          <div className="docai-edform">
            {studioPath !== 'periksa' && (
              <button type="button" className="docai-linkbtn" onClick={() => setFunnelActive(true)}>
                Kembali ke panduan “Mau bikin apa?”
              </button>
            )}
            {/* Workspace dua kolom (kontrak Child 2, document-ai.css;
                revisi Child 5 — fit remediation): kiri .docai-col-compose =
                mode buat + instruksi + pilih template/proyek + FIELD ISIAN
                template + aksi generate; kanan .docai-col-context =
                ringkasan konteks + detail template READ-ONLY.
                Di ≤900px menumpuk. */}
            <div className="docai-workspace-2col">
            <div className="docai-col-compose">
            <div className="docai-modeline" role="tablist" aria-label="Mode buat dokumen">
              <button
                type="button"
                role="tab"
                aria-selected={createMode === 'ai'}
                className={createMode === 'ai' ? 'active' : ''}
                onClick={() => setCreateMode('ai')}
              >
                <Sparkles size={14} /> Instruksi
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={createMode === 'form'}
                className={createMode === 'form' ? 'active' : ''}
                onClick={() => setCreateMode('form')}
              >
                <LayoutTemplate size={14} /> Template
              </button>
            </div>
            {createMode === 'ai' && (
              <>
                {!docAiAllowed && (
                  <div
                    role="alert"
                    className="docai-lockstrip-oneline"
                    style={{
                      display: 'flex', gap: 8, alignItems: 'flex-start',
                      background: 'var(--ez-color-danger-soft)', border: '1px solid var(--ez-color-danger-soft)', color: 'var(--ez-color-danger)',
                      borderRadius: 10, padding: '8px 10px', marginBottom: 10,
                      fontSize: 12.5, lineHeight: 1.5, textAlign: 'left',
                    }}
                  >
                    <Lock size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="docai-lockstrip-short">
                        <span>{docAiLockedShort}</span>
                        <button
                          type="button"
                          className="docai-linkbtn"
                          style={{ fontSize: 12.5 }}
                          onClick={() => setLockDetailOpen((v) => !v)}
                          aria-expanded={lockDetailOpen}
                        >
                          {lockDetailOpen ? t('ai.doc.create.lock_hide') : t('ai.doc.create.lock_detail')}
                        </button>
                      </div>
                      {lockDetailOpen && <div className="docai-lockstrip-full">{docAiLockedMsg}</div>}
                    </div>
                  </div>
                )}
                {/* V3 2026-11-19: label langkah tenang tanpa nomor; tombol
                    perluas/ciutkan dihapus — textarea kini 120px
                    secara default (document-ai.css). */}
                <div className="docai-step" style={{ textAlign: 'left' }}>{t('ai.doc.create.instr_title')}</div>
                <textarea
                  className="docai-textarea"
                  rows={5}
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder={t('ai.doc.create.instr_hint')}
                />
                <div className="docai-step" style={{ textAlign: 'left', marginTop: 4 }}>
                  {t('ai.doc.create.type_title')}
                </div>
                <select
                  className="docai-select docai-full"
                  value={aiAutoType ? '' : templateId}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) setAiAutoType(true);
                    else {
                      setAiAutoType(false);
                      chooseTemplate(v);
                    }
                  }}
                >
                  <option value="">{t('ai.doc.create.type_auto')}</option>
                  {ALL_TEMPLATES.map((tmpl) => (
                    <option key={tmpl.id} value={tmpl.id}>
                      {tmpl.name}
                    </option>
                  ))}
                </select>
                <div className="docai-step" style={{ textAlign: 'left', marginTop: 8 }}>
                  {t('ai.doc.create.project_title')}
                </div>
              </>
            )}
            {createMode === 'form' && (
              <>
            <div className="docai-step" style={{ textAlign: 'left' }}>{t('ai.doc.create.step_1')}</div>
            <div className="docai-search docai-tmplsearch">
              <Search size={15} />
              <input
                value={tplQuery}
                onChange={(e) => setTplQuery(e.target.value)}
                placeholder={t('ai.doc.create.tpl_search_ph')}
                aria-label={t('ai.doc.create.tpl_search_label')}
              />
            </div>
            <div className="docai-catchips" role="tablist" aria-label={t('ai.doc.create.tpl_cat_filter')}>
              <button
                type="button"
                role="tab"
                aria-selected={tplCat === 'all'}
                className={`docai-catchip ${tplCat === 'all' ? 'active' : ''}`}
                onClick={() => setTplCat('all')}
              >
                {t('ai.doc.create.cat_all')}
              </button>
              {TEMPLATE_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={tplCat === c.id}
                  className={`docai-catchip ${tplCat === c.id ? 'active' : ''}`}
                  onClick={() => setTplCat(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {catalogGroups.length === 0 && (
              <p className="docai-hint" style={{ textAlign: 'left' }}>
                Tidak ada template yang cocok dengan pencarian/filter ini.
              </p>
            )}
            {catalogGroups.map((group) => (
              <div key={group.id} className="docai-tmplgroup">
                <div className="docai-tmplgroup-h">
                  {group.label} <span>{group.entries.length} template</span>
                </div>
                <div className="docai-tmplgrid">
                  {group.entries.map((tmpl) => {
                    const active = templateId === tmpl.id;
                    /* Fit remediation 2026-11-19 (Child 5): kartu katalog
                       dipadatkan — maks. 3 baris struktur per kartu. */
                    const lines = previewFor(tmpl.id).slice(0, 3);
                    return (
                      <button
                        key={tmpl.id}
                        className={`docai-tmpl ${active ? 'active' : ''}`}
                        onClick={() => chooseTemplate(tmpl.id)}
                        aria-pressed={active}
                      >
                        <div className="docai-tmpl-top">
                          <span className="docai-tmpl-n">{tmpl.name}</span>
                          {active && (
                            <span className="docai-tmpl-sel">
                              <Check size={11} /> Terpilih
                            </span>
                          )}
                        </div>
                        <div className="docai-tmpl-d">{tmpl.desc}</div>
                        {lines.length > 0 && (
                          <ul className="docai-tmpl-struct">
                            {lines.map((l, i) => (
                              <li key={i}>{l}</li>
                            ))}
                          </ul>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
              </>
            )}
            {createMode === 'form' && (
              <div className="docai-step" style={{ textAlign: 'left', marginTop: 8 }}>{t('ai.doc.create.step_2')}</div>
            )}
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="docai-select docai-full"
            >
              <option value="">{t('ai.doc.create.opt_no_project')}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {createMode === 'form' && (
              <textarea
                className="docai-textarea"
                rows={4}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder={t('ai.doc.create.instr_ph')}
              />
            )}
            {/* Field isian template (subjenis + grid) — di kolom compose,
                tepat sebelum generate (Child 5, fit remediation). */}
            {templateFillFields}
            {/* Badge saldo kredit (pola yang sama dengan DocAnalyzer) —
                tepat sebelum tombol generate, agar saldo terlihat sebelum
                generate memotong kredit ai-document. */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <CreditBalance compact showTopUp={false} />
            </div>
            <button className="docai-btn-primary docai-runbtn" onClick={() => void runGenerate(false)} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 size={15} className="spin" /> {t('ai.doc.create.gen_busy')}
                </>
              ) : createMode === 'ai' ? (
                <>
                  <Sparkles size={15} /> Buat Draf dengan AI
                </>
              ) : (
                <>
                  <FilePlus2 size={15} /> {t('ai.doc.create.gen')}
                </>
              )}
            </button>
            {error && (
              <div className="docai-error">
                <AlertTriangle size={14} /> {error}
              </div>
            )}
            </div>
            <div className="docai-col-context">
            <DocContextPanel
              fields={contextFields}
              sources={{ project: srcProject, company: srcCompany }}
              onToggleSource={(which, on) => (which === 'project' ? setSrcProject(on) : setSrcCompany(on))}
              missing={liveMissing}
            />
            {showTemplateDetail && (
              <>
            <div className="docai-tmpldetail">
              <div className="docai-tmpldetail-h">
                <strong>{template.name}</strong>
                <span className="docai-catchip docai-tmpldetail-cat">
                  {CATALOG_GROUP_LABELS[catalogCategoryOf(template.id, userBaseMap)]}
                </span>
              </div>
              <p className="docai-tmpldetail-purpose">
                {template.desc}
                {effectiveMeta?.reference?.scope ? <> · {effectiveMeta.reference.scope}</> : null}
              </p>
              <div className="docai-tmpldetail-sec">
                <span className="docai-label">{t('ai.doc.create.ctx_data_title')}</span>
                {availableContext.length === 0 ? (
                  <p className="docai-hint" style={{ margin: 0 }}>
                    {t('ai.doc.create.ctx_data_empty')}
                  </p>
                ) : (
                  <ul className="docai-tmpldetail-ctx">
                    {availableContext.slice(0, 8).map((f) => (
                      <li key={`${f.sourceType}:${f.fieldName}`}>
                        <span>{CONTEXT_FIELD_LABELS[f.fieldName] ?? f.fieldName}</span>
                        <strong>{f.value}</strong>
                      </li>
                    ))}
                    {availableContext.length > 8 && (
                      <li className="docai-hint">+{availableContext.length - 8} {t('ai.doc.create.ctx_more')}</li>
                    )}
                  </ul>
                )}
              </div>
              <div className="docai-tmpldetail-sec">
                <span className="docai-label">{t('ai.doc.create.missing_title')}</span>
                {liveMissing.length === 0 ? (
                  <p className="docai-hint" style={{ margin: 0 }}>{t('ai.doc.create.missing_all')}</p>
                ) : (
                  <ul className="docai-tmpldetail-missing">
                    {liveMissing.map((m) => (
                      <li key={m.key}>
                        <strong>{m.label}</strong> — {m.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="docai-tmpldetail-actions">
                <button
                  type="button"
                  className={`docai-btn-ghost docai-mini ${createMode === 'ai' ? 'is-active' : ''}`}
                  onClick={() => {
                    setCreateMode('ai');
                    setAiAutoType(false);
                  }}
                >
                  <Sparkles size={13} /> {t('ai.doc.create.mode_ai')}
                </button>
                <button
                  type="button"
                  className={`docai-btn-ghost docai-mini ${createMode === 'form' ? 'is-active' : ''}`}
                  onClick={() => setCreateMode('form')}
                >
                  <FileText size={13} /> {t('ai.doc.create.mode_manual')}
                </button>
              </div>
            </div>
            {/* Subjenis + grid field PINDAH ke kolom compose (templateFillFields,
                tepat sebelum tombol generate) — Child 5, fit remediation.
                Kolom kanan hanya detail read-only + acuan + contoh. */}
            {effectiveMeta?.reference && (
              <p className="docai-hint" style={{ textAlign: 'left' }}>
                {t('ai.doc.create.ref_a')} {effectiveMeta.reference.sourceName}
                {effectiveMeta.reference.sourceRef ? ` (${effectiveMeta.reference.sourceRef})` : ''} · {t('ai.doc.create.ref_status')}{' '}
                {referenceStatusLabel(effectiveMeta.reference.verification)} · {effectiveMeta.reference.scope}
              </p>
            )}
            {effectiveMeta?.sampleHtml && (
              <div style={{ textAlign: 'left' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="docai-btn-ghost" onClick={() => setShowSample((v) => !v)}>
                    {showSample ? t('ai.doc.create.sample_hide') : t('ai.doc.create.sample_show')}
                  </button>
                  <button type="button" className="docai-btn-ghost" onClick={createFromSample}>
                    {t('ai.doc.create.sample_create')}
                  </button>
                </div>
                {showSample && (
                  <div className="docai-samplepreview" dangerouslySetInnerHTML={{ __html: effectiveMeta.sampleHtml }} />
                )}
              </div>
            )}
              </>
            )}
            </div>
            </div>
          </div>
        </div>

        {onNavigateToMenu && (
          <div className="docai-xlink">
            <Briefcase size={22} style={{ color: 'var(--ez-color-primary)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <div className="docai-xlink-t">{t('ai.doc.create.xlink_title')}</div>
              <div className="docai-xlink-d">
                {t('ai.doc.create.xlink_d_a')}{project ? <> {t('ai.doc.create.xlink_d_proj')} <strong>{project.name}</strong></> : t('ai.doc.create.xlink_d_noproj')}{t('ai.doc.create.xlink_d_b')}
              </div>
            </div>
            <button type="button" className="docai-btn-ghost" onClick={() => onNavigateToMenu('dokumen-tender')}>
              {t('ai.doc.create.xlink_open')} <ArrowRight size={14} />
            </button>
          </div>
        )}

        {studioPath === 'periksa' && (
          <div className="docai-periksapick">
            <ClipboardCheck size={20} style={{ color: 'var(--ez-color-primary)', flexShrink: 0 }} />
            <div>
              <strong>{t('ai.doc.create.periksa_title')}</strong>
              <p>
                {t('ai.doc.create.periksa_p')}
              </p>
            </div>
          </div>
        )}

        {draftList}
      </div>
    );
  }

  /* ---------------- render: editor ---------------- */

  const statusPill = (
    <span className={`docai-savestatus docai-ss-${saveState}`} role="status">
      {saveState === 'saving' ? (
        <Loader2 size={13} className="spin" />
      ) : saveState === 'saved' ? (
        <Check size={13} />
      ) : saveState === 'failed' ? (
        <CloudOff size={13} />
      ) : (
        <span className="docai-ss-dot" />
      )}
      {saveState === 'saving'
        ? t('ai.doc.create.ed_status_saving')
        : saveState === 'saved'
          ? t('ai.doc.create.ed_status_saved')
          : saveState === 'failed'
            ? t('ai.doc.create.ed_status_failed')
            : t('ai.doc.create.ed_status_dirty')}
    </span>
  );

  return (
    <div className={`docai-tab ${focusMode ? 'docai-focusmode' : ''}`}>
      <div className="docai-edhead">
        <div className="docai-edhead-main">
          <input
            className="docai-edtitle"
            value={draft?.title ?? ''}
            aria-label={t('ai.doc.create.ed_untitled')}
            onChange={(e) => {
              if (!draft) return;
              setDraft({ ...draft, title: e.target.value });
              setSaveState('dirty');
            }}
          />
          <div className="docai-edmeta">
            {draft?.projectName || t('ai.doc.create.no_project')} · {draft?.templateName}
          </div>
          {draft && (
            <div className="docai-edstatus">
              {displayStatus && (
                <span className={`docai-statusbadge st-${displayStatusSlug}`}>{displayStatus}</span>
              )}
              {draft.status === 'final' ? (
                <span className="docai-finalnote">
                  <Lock size={12} /> {t('ai.doc.create.final_by_a')} <strong>{draft.approvedBy || '—'}</strong>
                  {draft.approvedAt
                    ? `${t('ai.doc.create.final_on_a')}${new Date(draft.approvedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`
                    : ''}
                  {t('ai.doc.create.final_locked')}
                </span>
              ) : (
                <>
                  <select
                    aria-label={t('ai.doc.panels.status_label')}
                    value={draft.status}
                    onChange={(e) => changeDraftStatus(e.target.value as DocDraftStatus)}
                    className="docai-statusselect"
                  >
                    <option value="draft">{t('ai.doc.panels.status_draft')}</option>
                    <option value="editing">{t('ai.doc.panels.status_editing')}</option>
                    <option value="review">{t('ai.doc.create.status_review')}</option>
                    <option value="reviewed">{t('ai.doc.create.status_ready')}</option>
                    <option value="archived">{t('ai.doc.panels.status_archived')}</option>
                  </select>
                  {displayStatus === 'Siap disetujui' && (
                    <button
                      type="button"
                      className="docai-btn-ghost docai-mini"
                      onClick={() => setApproveOpen(true)}
                    >
                      <CheckCircle2 size={13} /> {t('ai.doc.create.approve_final')}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
          {draft && (
            <div className="docai-edstatus">
              <label className="docai-kopselect">
                <Building2 size={13} /> {t('ai.doc.create.kop_label')}
                <select
                  value={draft.companyProfileId ?? ''}
                  onChange={(e) => changeDraftKop(e.target.value)}
                  disabled={draft.status === 'final'}
                  aria-label={t('ai.doc.create.kop_profile_label')}
                >
                  <option value="">
                    {t('ai.doc.create.kop_default')}{defaultProfile?.name ? ` (${defaultProfile.name})` : ''}
                  </option>
                  {allProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || t('ai.doc.panels.no_name')}
                      {p.isDefault ? ' · default' : ''}
                    </option>
                  ))}
                </select>
              </label>
              {draftProfile && (
                <span className="docai-hint" style={{ margin: 0 }}>
                  Dokumen ini memakai kop profil terpilih (editor, cetak, PDF, DOCX).
                </span>
              )}
            </div>
          )}
        </div>
        <div className="docai-edactions">
          {statusPill}
          {/* Badge saldo kredit (pola yang sama dengan DocAnalyzer) —
              generate ulang / terjemahan di editor memotong kredit
              ai-document. Tanpa tombol top-up, seperti permukaan analisis. */}
          <CreditBalance compact showTopUp={false} />
          <button className="docai-btn-primary" onClick={() => void saveDraft()} disabled={saveState === 'saving' || !draft}>
            <Save size={15} /> {t('ai.doc.create.ed_save')}
          </button>
          <button className="docai-btn-ghost" onClick={downloadDraft} disabled={!draft}>
            <Download size={15} /> {t('ai.doc.create.unduh')}
          </button>
          <button className="docai-btn-ghost" onClick={() => void doExport('pdf')} disabled={!draft || exporting !== null}>
            {exporting === 'pdf' ? <Loader2 size={15} className="spin" /> : <Download size={15} />} PDF
          </button>
          <button className="docai-btn-ghost" onClick={() => void doExport('docx')} disabled={!draft || exporting !== null}>
            {exporting === 'docx' ? <Loader2 size={15} className="spin" /> : <Download size={15} />} DOCX
          </button>
          <button
            className={`docai-btn-ghost ${previewMode ? 'is-active' : ''}`}
            onClick={() => setPreviewMode((v) => !v)}
            disabled={!draft}
            aria-pressed={previewMode}
          >
            <Eye size={15} /> Pratinjau
          </button>
          <div className="docai-menuwrap">
            <button
              className="docai-btn-ghost docai-menubtn"
              aria-label={t('ai.doc.create.ed_more')}
              title={t('ai.doc.create.ed_more')}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && (
              <div className="docai-menu" role="menu">
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setPending({ type: 'regen' });
                  }}
                >
                  <RefreshCw size={14} /> {t('ai.doc.create.ed_regen')}
                </button>
                <button
                  role="menuitem"
                  disabled={!draft?.previousContent}
                  onClick={() => void restorePrevious()}
                >
                  <HistoryIcon size={14} /> {t('ai.doc.create.ed_restore')}
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setShowOutline((v) => !v);
                  }}
                >
                  <ListTree size={14} /> {t('ai.doc.create.ed_outline')}
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setFocusMode((v) => !v);
                  }}
                >
                  <Focus size={14} /> {t('ai.doc.create.ed_focus')}
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    doPrint();
                  }}
                >
                  <Printer size={14} /> Cetak / Print PDF
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    if (!draft) return;
                    const name = window.prompt('Nama template pribadi:', draft.title);
                    if (!name?.trim()) return;
                    saveUserTemplate(newUserTemplate({
                      name: name.trim(),
                      baseTemplateId: draft.templateId,
                      scaffold: '',
                      sampleHtml: html,
                    }));
                    setUserTplVersion((v) => v + 1);
                  }}
                >
                  <LayoutTemplate size={14} /> Simpan sebagai Template
                </button>
                <button
                  role="menuitem"
                  disabled={!draft || !toPlainText(html, 'html').trim()}
                  onClick={() => {
                    setMenuOpen(false);
                    setTranslateOpen(true);
                  }}
                >
                  <Languages size={14} /> Terjemahkan…
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    if (saveState === 'dirty') setPending({ type: 'new' });
                    else {
                      setDraft(null);
                      setHtml('');
                      setMode('empty');
                    }
                  }}
                >
                  <FilePlus size={14} /> {t('ai.doc.create.ed_new_doc')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="docai-draftwarn">{t('ai.doc.create.draft_warn')}</div>
      {confirmBar}
      {approveOpen && draft && (
        <div className="docai-confirmbar" role="alertdialog" aria-live="polite">
          <CheckCircle2 size={16} />
          <span>
            {t('ai.doc.create.approve_q_a')} <strong>{t('ai.doc.panels.status_final')}</strong>{t('ai.doc.create.approve_q_b')}
          </span>
          <input
            className="docai-input docai-approver-input"
            style={{ marginBottom: 0 }}
            value={approverName}
            onChange={(e) => setApproverName(e.target.value)}
            placeholder={t('ai.doc.create.approver_ph')}
            aria-label={t('ai.doc.create.approver_label')}
          />
          <div className="docai-confirmbtns">
            <button
              className="docai-btn-primary"
              onClick={() => void approveCurrentDraft()}
              disabled={!approverName.trim()}
            >
              {t('ai.doc.create.approve_final')}
            </button>
            <button className="docai-btn-ghost" onClick={() => setApproveOpen(false)}>
              {t('ai.doc.create.ed_cancel')}
            </button>
          </div>
        </div>
      )}
      {translateOpen && draft && (
        <div className="docai-confirmbar" role="dialog" aria-label={t('ai.doc.create.translate_label')}>
          <Languages size={16} />
          <span>
            {t('ai.doc.create.translate_a')} <strong>{t('ai.doc.create.translate_new')}</strong>{t('ai.doc.create.translate_b')}
          </span>
          <div className="docai-confirmbtns">
            {TRANSLATE_LANGUAGE_CODES.map((code) => (
              <button
                key={code}
                type="button"
                className="docai-btn-ghost docai-mini"
                disabled={translating}
                onClick={() => void runTranslate(code)}
              >
                {translating ? <Loader2 size={13} className="spin" /> : null}
                {TRANSLATE_LANGUAGE_NAMES[code].label} ({code.toUpperCase()})
              </button>
            ))}
            <button
              type="button"
              className="docai-btn-ghost docai-mini"
              disabled={translating}
              onClick={() => setTranslateOpen(false)}
            >
              {t('ai.doc.create.ed_cancel')}
            </button>
          </div>
          {translating && (
            <span className="docai-hint" style={{ margin: 0 }}>
              <Loader2 size={13} className="spin" /> {t('ai.doc.create.translating')}
            </span>
          )}
        </div>
      )}
      {error && (
        <div className="docai-error">
          <AlertTriangle size={14} /> {error}
        </div>
      )}
      {busy && (
        <div className="docai-busybar">
          <Loader2 size={14} className="spin" /> {t('ai.doc.create.gen_busy')}
        </div>
      )}
      {translateInfo && (
        <div className="docai-warn" role="status">
          <Languages size={14} /> {translateInfo}
          <button
            type="button"
            className="docai-btn-ghost docai-mini"
            onClick={() => setTranslateInfo(null)}
          >
            {t('common.tutup')}
          </button>
        </div>
      )}

      {previewMode && (
        <div className="docai-previewbar" role="status">
          <Eye size={14} /> {t('ai.doc.create.preview_warn')}
        </div>
      )}

      {draft && !kopHtml(effectiveProfile) && (
        <div className="docai-warn docai-kophint" role="note">
          <Building2 size={14} /> {t('ai.doc.create.kop_warn_a')}{' '}
          <strong>{t('ai.doc.panels.identity_title')}</strong>{t('ai.doc.create.kop_warn_b')}
        </div>
      )}

      <div className="docai-edlayout">
        {showOutline && !focusMode && (
          <aside className="docai-outline" aria-label={t('ai.doc.create.ed_outline')}>
            <div className="docai-outline-head">
              <span>{t('ai.doc.create.ed_outline')}</span>
              <button aria-label="×" onClick={() => setShowOutline(false)}>
                <X size={14} />
              </button>
            </div>
            {outline.length === 0 ? (
              <p className="docai-hint">{t('ai.doc.create.ed_outline_empty')}</p>
            ) : (
              outline.map((item) => (
                <button
                  key={item.index}
                  className={`docai-outline-item lv${item.level}`}
                  onClick={() => jumpToHeading(item)}
                >
                  {item.text}
                </button>
              ))
            )}
          </aside>
        )}
        <div className="docai-edmain">
          <Suspense
            fallback={
              <div className="docai-busybar">
                <Loader2 size={14} className="spin" /> …
              </div>
            }
          >
            <DocEditor
              key={`${draft?.id ?? 'new'}-${editorKey}`}
              initialHtml={html}
              headerHtml={kopHtml(effectiveProfile) || undefined}
              footerText={draft ? `${effectiveProfile?.name?.trim() ? `${effectiveProfile.name} • ` : ''}${draft.title}` : undefined}
              editable={!previewMode}
              t={t}
              onEditorReady={(ed) => {
                editorRef.current = ed;
                loadingRef.current = false;
              }}
              onChange={(next) => {
                setHtml(next);
                if (!loadingRef.current) setSaveState('dirty');
              }}
            />
          </Suspense>
        </div>
      </div>

      {genTruncated && (
        <div className="docai-warn" role="note">
          <AlertTriangle size={14} /> {t('ai.doc.create.trunc_a')} <strong>{t('ai.doc.create.trunc_b')}</strong>{t('ai.doc.create.trunc_c')}
        </div>
      )}

      {genMissing.length > 0 && (
        <div className="docai-missingbox docai-genmissing">
          <div className="docai-missingbox-t">
            <AlertTriangle size={14} /> {t('ai.doc.create.gen_missing_a')} ({genMissing.length})
          </div>
          <ul>
            {genMissing.map((m) => (
              <li key={m.key}>
                <strong>{m.label}</strong> — {m.reason}
              </li>
            ))}
          </ul>
          <p className="docai-hint" style={{ marginTop: 6 }}>
            {t('ai.doc.create.gen_missing_p')}
          </p>
        </div>
      )}

      {draft && (
        <DocStudioReview
          key={draft.id}
          draft={draft}
          html={html}
          templateMeta={reviewMeta}
          contextFields={contextFields}
          getEditor={() => editorRef.current}
          onApplyCandidate={applyCandidate}
          onRestoreVersion={restoreVersionById}
          docAiAllowed={docAiAllowed}
          docAiLockedMsg={docAiLockedMsg}
          onFindingStatusesChange={changeFindingStatuses}
        />
      )}

      {draft && (
        <DocEnhance
          key={`enh-${draft.id}`}
          draft={draft}
          getEditor={() => editorRef.current}
          onApplyEnhance={applyEnhance}
          docAiAllowed={docAiAllowed}
          docAiLockedMsg={docAiLockedMsg}
        />
      )}

      {draftList}
    </div>
  );
};

export default DocCreator;

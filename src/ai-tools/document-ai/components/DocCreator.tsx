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
import React, { Suspense, lazy, useMemo, useRef, useState } from 'react';
import {
  Loader2, Save, Download, AlertTriangle, FilePlus2, Check, MoreHorizontal,
  RefreshCw, History as HistoryIcon, Focus, ListTree, FilePlus, X, CloudOff,
  Printer, LayoutTemplate, ArrowRight, Briefcase,
} from 'lucide-react';
import { getDefaultProfile, kopHtml } from '../companyProfile';
import {
  TEMPLATE_META, EXTRA_BUILTIN_TEMPLATES, buildFieldBlock, missingRequiredFields,
  resolveTemplate, subtypeLabel, referenceStatusLabel,
  listUserTemplates, saveUserTemplate, newUserTemplate, type UserTemplate,
} from '../docTemplates';
import { htmlToPaperBlocks } from '../paperModel';
import { exportPaperPdf, exportPaperDocx } from '../paperExport';
import { CompanyIdentityPanel, MyTemplatesPanel, SavedDocsPanel } from './DocPanels';
import { docStatusLabel, type DocDraftStatus } from '../view';
import type { Editor } from '@tiptap/react';
import { dokumenAiService } from '../service';
import type { DraftRecord, HistoryEntry } from '../view';
import { newId, formatDate } from '../view';
import { draftFormat, toEditorHtml, toPlainText, plainToHtml } from '../richText';
import { useProject } from '../../../context/ProjectContext';
import { useI18n } from '../../../i18n/I18nContext';

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

export const DocCreator: React.FC<{
  drafts: DraftRecord[];
  onUpsertDraft: (d: DraftRecord) => void;
  onAddHistory: (e: Omit<HistoryEntry, 'id' | 'at'>) => void;
  /** Navigasi silang ke menu lain (Dokumen Proyek & Tender = 'dokumen-tender'). Opsional: tanpa prop ini tautan silang tidak dirender. */
  onNavigateToMenu?: (menu: string) => void;
}> = ({ drafts, onUpsertDraft, onAddHistory, onNavigateToMenu }) => {
  const { t } = useI18n();
  const TEMPLATES = getTemplates(t);
  /* Paper System (Fase B): subnavigasi + template tambahan + profil perusahaan */
  const [subView, setSubView] = useState<'buat' | 'tersimpan' | 'template' | 'identitas'>('buat');
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
  const { currentProject, projects } = useProject();

  const [templateId, setTemplateId] = useState('berita-acara');
  const [projectId, setProjectId] = useState(currentProject?.id || '');
  const [instruction, setInstruction] = useState('');

  const [mode, setMode] = useState<'empty' | 'editor'>('empty');
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

  const editorRef = useRef<Editor | null>(null);
  const loadingRef = useRef(false);

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
        status: 'review',
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
  };

  const openDraft = (target: DraftRecord) => {
    if (draft && saveState === 'dirty' && target.id !== draft.id) {
      setPending({ type: 'open', target });
      return;
    }
    loadIntoEditor(target);
  };

  /* ---------------- generate (AI) ---------------- */

  const runGenerate = async (isRegen: boolean) => {
    const missing = missingRequiredFields(effectiveMeta, fieldValues);
    if (missing.length) {
      setError(`Field wajib belum diisi: ${missing.join(', ')}.`);
      return;
    }
    setBusy(true);
    setError(null);
    setPending(null);
    try {
      const projInfo = project
        ? `Proyek: ${project.name}\nLokasi: ${project.location || '-'}\nKlien: ${project.clientName || '-'}`
        : 'Proyek: (tidak dipilih)';
      const fieldBlock = buildFieldBlock(effectiveMeta, fieldValues);
      const docName = activeSubtypeLabel ? `${template.name} — ${activeSubtypeLabel}` : template.name;
      const prompt =
        `Buatkan ${docName}.\n${projInfo}\n${fieldBlock ? `\n${fieldBlock}\n` : ''}\nDetail/instruksi pengguna:\n${instruction || '(tidak ada detail tambahan)'}` +
        `\n\nAturan: gunakan HANYA informasi yang diberikan; jangan mengarang nomor surat, nama pihak, ` +
        `nilai kontrak, tanggal, atau persetujuan. Tandai bagian yang perlu dilengkapi pengguna dengan ` +
        `[ISI: ...]. Hasilkan draf yang jelas berstatus DRAF.`;
      const res = await dokumenAiService.chat({
        documentText: projInfo,
        fileName: 'info-proyek',
        mode: 'CHAT',
        prompt,
      });
      if (!res.success) {
        setError(`${res.errorCode || 'ERROR'}: ${res.message || t('ai.doc.err_failed')}`);
        return;
      }
      const reply = res.reply || '';
      const newHtml = plainToHtml(reply);
      if (isRegen && draft) {
        // Isi editor saat ini (termasuk edit yang belum disimpan) menjadi
        // versi sebelumnya — tidak ada yang terhapus diam-diam.
        const rec = buildRecord({
          content: newHtml,
          contentFormat: 'html',
          previousContent: html,
          previousFormat: 'html',
          status: 'draft',
        });
        loadingRef.current = true;
        setHtml(newHtml);
        setEditorKey((k) => k + 1);
        setMode('editor');
        await persist(rec);
      } else {
        const rec: DraftRecord = {
          id: newId('draft'),
          templateId,
          templateName: template.name,
          title: `${template.name} — ${project?.name || t('ai.doc.create.no_project')}`,
          content: newHtml,
          contentFormat: 'html',
          projectId: project?.id,
          projectName: project?.name,
          status: 'draft',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        loadingRef.current = true;
        setHtml(newHtml);
        setEditorKey((k) => k + 1);
        setMode('editor');
        await persist(rec);
      }
      onAddHistory({
        type: 'draft',
        docIds: [],
        docNames: [],
        title: `${t('ai.doc.create.hist_a')} ${draft?.title || template.name}`,
        resultPreview: reply.slice(0, 300),
        resultFull: reply,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('ai.doc.err_unexpected'));
    } finally {
      setBusy(false);
    }
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
      setSubView('buat');
      loadIntoEditor(rec);
      return;
    }
    setTemplateId(ut.id);
    setSubView('buat');
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
      const input = { title: draft.title, blocks: htmlToPaperBlocks(html), profile: getDefaultProfile() };
      if (kind === 'pdf') await exportPaperPdf(input);
      else await exportPaperDocx(input);
    } catch (e) {
      setError(`Ekspor ${kind.toUpperCase()} gagal: ${e instanceof Error ? e.message : 'kesalahan tak dikenal'}`);
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
    const rec = { ...draft, status: st, updatedAt: Date.now() };
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
              <span className="docai-draftst">
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

  /* ---------------- render: empty state ---------------- */

  const subnav = (
    <div className="docai-subnav" role="tablist" aria-label="AI Document">
      <button className={`docai-subbtn ${subView === 'buat' ? 'active' : ''}`} onClick={() => setSubView('buat')}>Buat Dokumen</button>
      <button className={`docai-subbtn ${subView === 'tersimpan' ? 'active' : ''}`} onClick={() => setSubView('tersimpan')}>Dokumen Tersimpan</button>
      <button className={`docai-subbtn ${subView === 'template' ? 'active' : ''}`} onClick={() => setSubView('template')}>Template Saya</button>
      <button className={`docai-subbtn ${subView === 'identitas' ? 'active' : ''}`} onClick={() => setSubView('identitas')}>Identitas Perusahaan</button>
    </div>
  );

  if (mode === 'empty' && subView === 'identitas') {
    return (
      <div>
        {subnav}
        <CompanyIdentityPanel onChanged={() => setProfileVersion((v) => v + 1)} />
        {onNavigateToMenu && (
          <p className="docai-hint" style={{ marginTop: 14 }}>
            Profil &amp; kop di halaman ini dipakai untuk dokumen bebas AI Document. Kop untuk dokumen
            tender diatur terpisah di Dokumen Proyek — datanya berasal dari data perusahaan &amp; proyek.{' '}
            <button type="button" className="docai-linkbtn" onClick={() => onNavigateToMenu('dokumen-tender')}>
              Buka Dokumen Proyek <ArrowRight size={13} />
            </button>
          </p>
        )}
      </div>
    );
  }
  if (mode === 'empty' && subView === 'template') {
    return (
      <div>
        {subnav}
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
        {subnav}
        <SavedDocsPanel
          drafts={drafts}
          onOpen={(d) => { setSubView('buat'); openDraft(d); }}
          onStatus={(d, st) => onUpsertDraft({ ...d, status: st, updatedAt: Date.now() })}
        />
      </div>
    );
  }

  if (mode === 'empty') {
    return (
      <div className="docai-tab">
        {subnav}
        <div className="docai-pagehead">
          <div>
            <div className="docai-crumb">{t('ai.doc.create.crumb')}</div>
            <h2>{t('ai.doc.create.ed_title')}</h2>
            <p>{t('ai.doc.create.sub')}</p>
            <p className="docai-hint" style={{ marginTop: 2 }}>Dokumen bebas berbasis AI (surat, berita acara, laporan).</p>
          </div>
        </div>

        <div className="docai-empty docai-edempty">
          <FilePlus2 size={30} />
          <h3>{t('ai.doc.create.ed_empty_h')}</h3>
          <p>{t('ai.doc.create.ed_empty_p')}</p>
          <div className="docai-edform">
            <div className="docai-step" style={{ textAlign: 'left' }}>{t('ai.doc.create.step_1')}</div>
            <div className="docai-tmplgrid">
              {ALL_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.id}
                  className={`docai-tmpl ${templateId === tmpl.id ? 'active' : ''}`}
                  onClick={() => chooseTemplate(tmpl.id)}
                >
                  <div className="docai-tmpl-n">{tmpl.name}</div>
                  <div className="docai-tmpl-d">{tmpl.desc}</div>
                </button>
              ))}
            </div>
            <div className="docai-step" style={{ textAlign: 'left', marginTop: 16 }}>{t('ai.doc.create.step_2')}</div>
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
            {baseMeta?.subtypes && baseMeta.subtypes.length > 0 && (
              <div className="docai-fieldgrid">
                <label className="docai-fielditem">
                  <span className="docai-label">Subjenis Dokumen *</span>
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
              </div>
            )}
            {effectiveMeta && effectiveMeta.fields.length > 0 && (
              <div className="docai-fieldgrid">
                {effectiveMeta.fields.map((f) => (
                  <label key={f.key} className="docai-fielditem">
                    <span className="docai-label">{f.label}{f.required ? ' *' : ''}</span>
                    {f.type === 'date' ? (
                      <input type="date" className="docai-input" style={{ marginBottom: 0 }} value={fieldValues[f.key] || ''} onChange={(e) => setFieldValues((v) => ({ ...v, [f.key]: e.target.value }))} />
                    ) : f.type === 'textarea' ? (
                      <textarea className="docai-textarea" style={{ marginBottom: 0 }} rows={2} value={fieldValues[f.key] || ''} placeholder={f.placeholder} onChange={(e) => setFieldValues((v) => ({ ...v, [f.key]: e.target.value }))} />
                    ) : f.type === 'select' ? (
                      <select className="docai-select" style={{ marginBottom: 0 }} value={fieldValues[f.key] || ''} onChange={(e) => setFieldValues((v) => ({ ...v, [f.key]: e.target.value }))}>
                        <option value="">— Pilih —</option>
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
            )}
            {effectiveMeta?.reference && (
              <p className="docai-hint" style={{ textAlign: 'left' }}>
                Acuan: {effectiveMeta.reference.sourceName}
                {effectiveMeta.reference.sourceRef ? ` (${effectiveMeta.reference.sourceRef})` : ''} · Status:{' '}
                {referenceStatusLabel(effectiveMeta.reference.verification)} · {effectiveMeta.reference.scope}
              </p>
            )}
            {effectiveMeta?.sampleHtml && (
              <div style={{ textAlign: 'left' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="docai-btn-ghost" onClick={() => setShowSample((v) => !v)}>
                    {showSample ? 'Sembunyikan Contoh' : 'Lihat Contoh Dokumen'}
                  </button>
                  <button type="button" className="docai-btn-ghost" onClick={createFromSample}>
                    Buat dari Contoh (tanpa AI)
                  </button>
                </div>
                {showSample && (
                  <div className="docai-samplepreview" dangerouslySetInnerHTML={{ __html: effectiveMeta.sampleHtml }} />
                )}
              </div>
            )}
            <textarea
              className="docai-textarea"
              rows={4}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder={t('ai.doc.create.instr_ph')}
            />
            <button className="docai-btn-primary docai-runbtn" onClick={() => void runGenerate(false)} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 size={15} className="spin" /> {t('ai.doc.create.gen_busy')}
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
        </div>

        {onNavigateToMenu && (
          <div className="docai-xlink">
            <Briefcase size={22} style={{ color: 'var(--ez-color-primary)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <div className="docai-xlink-t">Dokumen Proyek &amp; Tender</div>
              <div className="docai-xlink-d">
                Paket dokumen resmi{project ? <> proyek <strong>{project.name}</strong></> : ' proyek ini'} — surat
                penawaran, kontrak, dan administrasi tender yang disusun dari data proyek &amp; RAB.
              </div>
            </div>
            <button type="button" className="docai-btn-ghost" onClick={() => onNavigateToMenu('dokumen-tender')}>
              Buka Dokumen Proyek <ArrowRight size={14} />
            </button>
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
          <div className="docai-crumb">{t('ai.doc.create.crumb')} · {t('ai.doc.create.ed_title')}</div>
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
            {draft && (
              <>
                {' · '}
                <select
                  aria-label="Status dokumen"
                  value={draft.status === 'reviewed' ? 'review' : draft.status}
                  onChange={(e) => changeDraftStatus(e.target.value as DocDraftStatus)}
                  style={{ font: 'inherit', fontSize: 12 }}
                >
                  <option value="draft">Draft</option>
                  <option value="editing">Sedang Disunting</option>
                  <option value="review">Siap Ditinjau</option>
                  <option value="final">Final</option>
                  <option value="archived">Diarsipkan</option>
                </select>
              </>
            )}
          </div>
        </div>
        <div className="docai-edactions">
          {statusPill}
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
              headerHtml={kopHtml(defaultProfile) || undefined}
              footerText={draft ? `${defaultProfile?.name?.trim() ? `${defaultProfile.name} • ` : ''}${draft.title}` : undefined}
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

      {draftList}
    </div>
  );
};

export default DocCreator;

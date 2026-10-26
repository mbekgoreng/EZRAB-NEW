/**
 * DED-AI Estimate — Tampilan 1: INPUT.
 * Upload multi-file (drag & drop) + deskripsi proyek + pilihan proyek + tipe + mode AI.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  UploadCloud, FileText, X, Zap, Brain, FolderOpen, PlusCircle,
  ArrowRight, AlertTriangle, History, Trash2, RotateCcw,
} from 'lucide-react';
import { DedAiMode, DedAiProjectType } from './types';
import { useI18n } from '../../i18n/I18nContext';
import './dedAi.css';
import '../../ai-credits/ai-credits.css';
import { useCreditSimulation } from '../../ai-credits/useCreditSimulation';
import { tariffFor } from '../../ai-credits/config';
import { CreditBalance } from '../../ai-credits/components/CreditBalance';
import { CreditTopUpModal } from '../../ai-credits/components/CreditTopUpModal';

export interface DedAiFileItem {
  file: File;
  id: string;
  error?: string;
}

export interface DedAiSession {
  files: DedAiFileItem[];
  description: string;
  projectName: string;
  projectType: DedAiProjectType;
  mode: DedAiMode;
  /** null = buat proyek baru saat finalisasi; string = pakai proyek existing */
  targetProjectId: string | null;
  /** true = gunakan pipeline Full AI (terisolasi), false = pipeline lama */
  fullAi?: boolean;
  /** Estimasi kredit simulasi yang disetujui user (kategori dipilih user). */
  creditEstimate?: { category: string; credits: number };
}

interface Props {
  initialSession: DedAiSession;
  projects: Array<{ id: string; name: string }>;
  drafts: Array<{ id: string; createdAt: number; projectName: string; itemCount: number; grandTotal: number }>;
  onStart: (session: DedAiSession) => void;
  onLoadDraft: (id: string) => void;
  onDeleteDraft: (id: string) => void;
}

const MAX_FILE_MB = 25;
const MAX_FILES = 5;

const fmtSize = (b: number) =>
  b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

/** Label kategori kompleksitas DED (dipilih user — bukan hasil deteksi AI). */
const COMPLEXITY_OPTIONS = [
  { value: 'simple' as const, label: 'Sederhana', desc: '1–2 lantai, denah simpel', tariffKey: 'ded-ai/simple' },
  { value: 'medium' as const, label: 'Menengah', desc: '2–3 lantai / ruko', tariffKey: 'ded-ai/medium' },
  { value: 'complex' as const, label: 'Kompleks', desc: 'Gedung / struktur khusus', tariffKey: 'ded-ai/complex' },
];
const complexityLabel = (v: string) => COMPLEXITY_OPTIONS.find((o) => o.value === v)?.label ?? v;

export const DedAiInputView: React.FC<Props> = ({
  initialSession, projects, drafts, onStart, onLoadDraft, onDeleteDraft,
}) => {
  const { t } = useI18n();
  const PROJECT_TYPE_OPTIONS: Array<{ value: DedAiProjectType; label: string }> = [
    { value: 'BANGUNAN', label: t('ai.ded.input.type_bangunan') },
    { value: 'GEDUNG', label: t('ai.ded.input.type_gedung') },
    { value: 'BANGUNAN AIR', label: t('ai.ded.input.type_bangunan_air') },
    { value: 'JALAN', label: t('ai.ded.input.type_jalan') },
    { value: 'PAVING', label: t('ai.ded.input.type_paving') },
  ];
  const [files, setFiles] = useState<DedAiFileItem[]>(initialSession.files);
  const [description, setDescription] = useState(initialSession.description);
  const [projectName, setProjectName] = useState(initialSession.projectName);
  const [projectType, setProjectType] = useState<DedAiProjectType>(initialSession.projectType);
  const [mode, setMode] = useState<DedAiMode>(initialSession.mode);
  const [fullAi, setFullAi] = useState(initialSession.fullAi ?? false);
  const [targetProjectId, setTargetProjectId] = useState<string | null>(initialSession.targetProjectId);
  const [useExisting, setUseExisting] = useState(initialSession.targetProjectId !== null);
  // Perbaikan final: sinkronkan prefill deskripsi dari entry DED yang tiba
  // setelah mount (hanya bila kolom masih kosong — tidak menimpa ketikan).
  useEffect(() => {
    if (initialSession.description && !description) {
      setDescription(initialSession.description);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSession.description]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // --- AI Credits (simulasi): kategori dipilih user, bukan dideteksi AI ---
  const [complexity, setComplexity] = useState<'simple' | 'medium' | 'complex'>('simple');
  const [creditApproved, setCreditApproved] = useState(false);
  const [creditTopUpOpen, setCreditTopUpOpen] = useState(false);
  const { balance, consume } = useCreditSimulation();
  const dedEstimate = tariffFor(`ded-ai/${complexity}`);
  const dedTarget = dedEstimate.target ?? dedEstimate.max;

  const addFiles = (list: FileList | File[]) => {
    const arr = Array.from(list);
    setFiles((prev) => {
      const next = [...prev];
      for (const f of arr) {
        if (next.length >= MAX_FILES) break;
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        let error: string | undefined;
        const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
        if (!isPdf) error = t('ai.ded.input.err_pdf_only');
        else if (f.size > MAX_FILE_MB * 1048576) error = `${t('ai.ded.input.err_size_a')} ${MAX_FILE_MB} ${t('ai.ded.input.err_size_b')}`;
        else if (f.size === 0) error = t('ai.ded.input.err_empty');
        next.push({ file: f, id, error });
      }
      return next;
    });
  };

  const validFiles = files.filter((f) => !f.error);
  const canStart = validFiles.length > 0;

  const handleStart = () => {
    if (!canStart || !creditApproved) return;
    // --- AI Credits: catat pemakaian SIMULASI (batas target kategori) ---
    consume('ded-ai', dedTarget, `DED AI (${complexityLabel(complexity)}): ${validFiles.length} dokumen`, {
      jobReference: `ded-${Date.now().toString(36)}`,
    });
    const chosenProjectId = useExisting ? targetProjectId : null;
    const name =
      projectName.trim() ||
      (chosenProjectId ? projects.find((p) => p.id === chosenProjectId)?.name || '' : '') ||
      validFiles[0].file.name.replace(/\.pdf$/i, '');
    onStart({
      files: validFiles,
      description: description.trim(),
      projectName: name,
      projectType,
      mode,
      targetProjectId: chosenProjectId,
      fullAi,
      creditEstimate: { category: complexityLabel(complexity), credits: dedTarget },
    });
  };

  return (
    <div className="dedai">
      <div className="dedai-head">
        <h1>DED <span className="accent">→</span> {t('ai.ded.input.head_title_post')}</h1>
        <p>{t('ai.ded.input.head_sub')}</p>
      </div>

      <div className="dedai-steps">
        <div className="dedai-step active"><span className="n">1</span> {t('ai.ded.input.step_1')}</div>
        <div className="dedai-step-line" />
        <div className="dedai-step"><span className="n">2</span> {t('ai.ded.input.step_2')}</div>
        <div className="dedai-step-line" />
        <div className="dedai-step"><span className="n">3</span> {t('ai.ded.input.step_3')}</div>
      </div>

      {/* ---- Upload ---- */}
      <div className="dedai-card">
        <h2><span className="ico"><UploadCloud size={18} /></span> {t('ai.ded.input.card_doc_title')}</h2>
        <p className="sub">{t('ai.ded.input.card_doc_sub')}</p>
        <div
          className={`dedai-drop ${dragOver ? 'over' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
        >
          <div className="big-ico"><UploadCloud size={26} /></div>
          <p>{t('ai.ded.input.drop_text')}</p>
          <span>{t('ai.ded.input.drop_hint_a')} {MAX_FILES} {t('ai.ded.input.drop_hint_b')} {MAX_FILE_MB} {t('ai.ded.input.drop_hint_c')}</span>
          <br /><span className="fmt">PDF</span>
          <input
            ref={inputRef} type="file" accept=".pdf,application/pdf" multiple hidden
            onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ''; }}
          />
        </div>
        {files.length > 0 && (
          <div className="dedai-files">
            {files.map((f) => (
              <div key={f.id} className={`dedai-file ${f.error ? 'err' : ''}`}>
                <div className="f-ico"><FileText size={18} /></div>
                <div className="f-info">
                  <div className="f-name">{f.file.name}</div>
                  <div className="f-meta">{fmtSize(f.file.size)}</div>
                  {f.error && <div className="f-err"><AlertTriangle size={13} /> {f.error}</div>}
                </div>
                <button className="f-del" onClick={() => setFiles((p) => p.filter((x) => x.id !== f.id))} title={t('ai.ded.input.del_file')}>
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="dedai-notice blue">
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{t('ai.ded.input.notice_a')} <b>{t('ai.ded.input.notice_b')}</b> {t('ai.ded.input.notice_c')}</span>
        </div>
      </div>

      {/* ---- Deskripsi ---- */}
      <div className="dedai-card">
        <h2><span className="ico"><FileText size={18} /></span> {t('ai.ded.input.card_desc_title')} <span style={{ fontWeight: 500, fontSize: 12, color: 'var(--ez-color-text-muted)' }}>{t('ai.ded.input.card_desc_optional')}</span></h2>
        <p className="sub">{t('ai.ded.input.card_desc_sub')}</p>
        <div className="dedai-field">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('ai.ded.input.desc_ph')}
          />
        </div>
      </div>

      {/* ---- Proyek & tipe ---- */}
      <div className="dedai-card">
        <h2><span className="ico"><FolderOpen size={18} /></span> {t('ai.ded.input.card_proj_title')}</h2>
        <p className="sub">{t('ai.ded.input.card_proj_sub')}</p>
        <div className="dedai-seg" style={{ marginBottom: 16 }}>
          <button className={!useExisting ? 'active' : ''} onClick={() => setUseExisting(false)}>
            <PlusCircle size={15} /> {t('ai.ded.input.seg_new')}
          </button>
          <button className={useExisting ? 'active' : ''} onClick={() => setUseExisting(true)} disabled={projects.length === 0}>
            <FolderOpen size={15} /> {t('ai.ded.input.seg_existing')}
          </button>
        </div>
        {useExisting ? (
          <div className="dedai-field">
            <label>{t('ai.ded.input.label_pick_project')}</label>
            <select value={targetProjectId || ''} onChange={(e) => setTargetProjectId(e.target.value || null)}>
              <option value="">{t('ai.ded.input.opt_pick')}</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {projects.length === 0 && <div className="hint">{t('ai.ded.input.hint_no_projects')}</div>}
          </div>
        ) : (
          <div className="dedai-field">
            <label>{t('ai.ded.input.label_new_name')}</label>
            <input
              type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)}
              placeholder={t('ai.ded.input.name_ph')}
            />
            <div className="hint">{t('ai.ded.input.hint_name_auto')}</div>
          </div>
        )}
        <div className="dedai-grid2">
          <div className="dedai-field">
            <label>{t('ai.ded.input.label_type')}</label>
            <div className="dedai-chips">
              {PROJECT_TYPE_OPTIONS.map((o) => (
                <button key={o.value} className={`dedai-chip ${projectType === o.value ? 'active' : ''}`} onClick={() => setProjectType(o.value)}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="dedai-field">
            <label>{t('ai.ded.input.label_mode')}</label>
            <div className="dedai-seg">
              <button className={mode === 'FAST' ? 'active' : ''} onClick={() => setMode('FAST')}>
                <Zap size={15} /> {t('ai.ded.input.mode_fast')}
              </button>
              <button className={mode === 'DETAIL' ? 'active' : ''} onClick={() => setMode('DETAIL')}>
                <Brain size={15} /> {t('ai.ded.input.mode_deep')}
              </button>
            </div>
            <div className="hint">{mode === 'FAST' ? t('ai.ded.input.hint_mode_fast') : t('ai.ded.input.hint_mode_detail')}</div>
          </div>
          <div className="dedai-field">
            <label>
              <input
                type="checkbox"
                checked={fullAi}
                onChange={(e) => setFullAi(e.target.checked)}
                style={{ marginRight: 8 }}
              />
              Full AI Estimate (eksperimental)
            </label>
            <div className="hint">
              {fullAi
                ? 'AI sebagai mesin estimasi utama. Hasil tidak di-recalculate pipeline lama.'
                : 'Gunakan pipeline standar.'}
            </div>
          </div>
        </div>
      </div>

      {/* ---- Estimasi Kredit AI (simulasi) ---- */}
      <div className="dedai-card" style={{ marginTop: 18 }}>
        <h2><span className="ico"><Zap size={18} /></span> Estimasi Kredit AI</h2>
        <p className="sub">
          Pilih kategori yang paling mendekati dokumen Anda. Kategori ini pilihan Anda —
          bukan hasil deteksi otomatis. Angka berikut simulasi frontend.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <CreditBalance compact showTopUp={false} />
          <span style={{ fontSize: 12, color: 'var(--ez-color-text-faint)' }}>saldo simulasi</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
          {COMPLEXITY_OPTIONS.map((o) => {
            const t = tariffFor(o.tariffKey);
            const active = complexity === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => { setComplexity(o.value); setCreditApproved(false); }}
                style={{
                  textAlign: 'left', padding: 12, borderRadius: 12, cursor: 'pointer',
                  border: active ? '2px solid var(--ez-color-primary)' : '1px solid var(--ez-color-border-line)',
                  background: active ? 'var(--ez-hue-blue-bg)' : 'var(--ez-color-surface)',
                }}
                aria-pressed={active}
              >
                <div style={{ fontWeight: 800, fontSize: 13.5 }}>{o.label}</div>
                <div style={{ fontSize: 12, color: 'var(--ez-color-text-faint)', margin: '2px 0 6px' }}>{o.desc}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ez-color-primary)', fontVariantNumeric: 'tabular-nums' }}>
                  ±{t.target!.toLocaleString('id-ID')} kredit
                </div>
              </button>
            );
          })}
        </div>
        <div className="aic-estimate" style={{ marginBottom: 10 }}>
          <span>Estimasi pemakaian: <strong>{dedTarget.toLocaleString('id-ID')} kredit</strong> (maksimum simulasi)</span>
          <span className="aic-sim">simulasi</span>
        </div>
        {balance.total < dedTarget && (
          <div className="aic-low-notice" style={{ marginBottom: 10 }}>
            <AlertTriangle size={16} />
            <span>Saldo simulasi ({balance.total.toLocaleString('id-ID')}) di bawah estimasi. Anda tetap bisa lanjut setelah menyetujui, atau top-up dulu.</span>
            <button type="button" onClick={() => setCreditTopUpOpen(true)}>Top-up</button>
          </div>
        )}
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, cursor: 'pointer', lineHeight: 1.5 }}>
          <input
            type="checkbox"
            checked={creditApproved}
            onChange={(e) => setCreditApproved(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            Saya menyetujui estimasi <strong>{dedTarget.toLocaleString('id-ID')} kredit (simulasi)</strong> untuk
            analisis DED kategori <strong>{complexityLabel(complexity)}</strong>. Saya paham angka ini
            simulasi frontend, bukan penagihan nyata.
          </span>
        </label>
      </div>

      <div className="dedai-cta">
        <button className="dedai-btn primary" disabled={!canStart || !creditApproved} onClick={handleStart}>
          {t('ai.ded.input.cta')} <ArrowRight size={18} />
        </button>
      </div>
      {!canStart && (
        <p style={{ textAlign: 'center', color: 'var(--ez-color-text-muted)', fontSize: 12.5, marginTop: 10 }}>
          {t('ai.ded.input.cta_hint')}
        </p>
      )}
      {canStart && !creditApproved && (
        <p style={{ textAlign: 'center', color: 'var(--ez-color-text-muted)', fontSize: 12.5, marginTop: 10 }}>
          Centang persetujuan estimasi kredit di atas untuk memulai analisis.
        </p>
      )}
      {creditTopUpOpen && <CreditTopUpModal onClose={() => setCreditTopUpOpen(false)} />}

      {/* ---- Draft tersimpan ---- */}
      {drafts.length > 0 && (
        <div className="dedai-card" style={{ marginTop: 18 }}>
          <h2><span className="ico"><History size={18} /></span> {t('ai.ded.input.drafts_title')}</h2>
          <p className="sub">{t('ai.ded.input.drafts_sub')}</p>
          <div className="dedai-drafts">
            {drafts.map((d) => (
              <div key={d.id} className="dedai-draft">
                <div className="d-info">
                  <div className="d-name">{d.projectName}</div>
                  <div className="d-meta">
                    {new Date(d.createdAt).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {d.itemCount} item
                  </div>
                </div>
                <button className="dedai-icon-btn" onClick={() => onLoadDraft(d.id)} title={t('ai.ded.input.open_draft')}>
                  <RotateCcw size={14} />
                </button>
                <button className="dedai-icon-btn" onClick={() => onDeleteDraft(d.id)} title={t('ai.ded.input.del_draft')}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DedAiInputView;

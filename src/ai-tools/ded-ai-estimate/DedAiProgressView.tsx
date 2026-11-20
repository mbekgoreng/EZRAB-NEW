/**
 * DED-AI Estimate — Tampilan 2: PROGRESS.
 * Tahap berbasis status pipeline aktual + panel ringkasan. Tanpa progress palsu.
 * Tahap dibedakan per MODE (mockup "DED progress 2 mode", ACC owner 2026-11-20):
 * EZRAB AI = 6 tahap database; Full AI = 3 tahap ringkas (diterima → scan →
 * AI menyusun estimasi). FAST/DETAIL adalah sub-pilihan kedalaman di kedua
 * mode, bukan pembeda tahap.
 */
import React from 'react';
import {
  FileCheck, BookOpen, ScanSearch, ListChecks, ShieldCheck, PackageCheck,
  Loader2, CheckCircle2, XCircle, ArrowLeft, RotateCcw, ArrowRight,
  Clock, Files, HardDrive, Zap, Brain, FileText,
} from 'lucide-react';
import './dedAi.css';
import { useI18n } from '../../i18n/I18nContext';
import type { DedRabAiMode } from './dedMode';

export type StageStatus = 'waiting' | 'active' | 'done' | 'failed';

export interface DedAiStage {
  key: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  status: StageStatus;
}

export interface ProgressSummary {
  projectName: string;
  fileCount: number;
  totalSize: number;
  mode: 'FAST' | 'DETAIL';
  startedAt: number;
  currentFile?: string;
}

interface Props {
  stages: DedAiStage[];
  percent: number;
  statusLine: string;
  summary: ProgressSummary;
  error: { message: string; errorCode?: string; stage?: string; retryable?: boolean } | null;
  onRetry: () => void;
  onBack: () => void;
  onSeeResult: () => void;
  resultReady: boolean;
  /** Mode DED kanonis — hanya dipakai untuk kalimat penjelas per mode di
   *  kepala tampilan. Daftar tahap sendiri dibangun pemanggil lewat
   *  getStageDefs(t, mode). Absen → EZRAB_AI (default C2). */
  dedMode?: DedRabAiMode;
}

const fmtSize = (b: number) =>
  b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

const fmtElapsed = (ms: number) => {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} dtk`;
  const m = Math.floor(s / 60);
  return `${m} mnt ${s % 60} dtk`;
};

export const getStageDefs = (
  t: (key: string) => string,
  mode: DedRabAiMode = 'EZRAB_AI',
): Array<{ key: string; title: string; desc: string; icon: React.ReactNode }> => {
  if (mode === 'FULL_AI') {
    // 3 tahap ringkas (mockup ACC 2026-11-20 — teks persis kamus).
    // Tahap 1 memakai ulang kunci stage_received_* (teksnya identik).
    return [
      { key: 'received', title: t('ai.ded.progress.stage_received_title'), desc: t('ai.ded.progress.stage_received_desc'), icon: <FileCheck size={17} /> },
      { key: 'scan', title: t('ai.ded.progress.stage_scan_title'), desc: t('ai.ded.progress.stage_scan_desc'), icon: <ScanSearch size={17} /> },
      { key: 'compose', title: t('ai.ded.progress.stage_compose_title'), desc: t('ai.ded.progress.stage_compose_desc'), icon: <PackageCheck size={17} /> },
    ];
  }
  // EZRAB AI: 6 tahap database — daftar ini BYTE-IDENTICAL dengan sebelum
  // diferensiasi (jangan ubah urutan/kunci/teks tanpa ACC terpisah).
  return [
    { key: 'received', title: t('ai.ded.progress.stage_received_title'), desc: t('ai.ded.progress.stage_received_desc'), icon: <FileCheck size={17} /> },
    { key: 'reading', title: t('ai.ded.progress.stage_reading_title'), desc: t('ai.ded.progress.stage_reading_desc'), icon: <BookOpen size={17} /> },
    { key: 'extract', title: t('ai.ded.progress.stage_extract_title'), desc: t('ai.ded.progress.stage_extract_desc'), icon: <ScanSearch size={17} /> },
    { key: 'identify', title: t('ai.ded.progress.stage_identify_title'), desc: t('ai.ded.progress.stage_identify_desc'), icon: <ListChecks size={17} /> },
    { key: 'validate', title: t('ai.ded.progress.stage_validate_title'), desc: t('ai.ded.progress.stage_validate_desc'), icon: <ShieldCheck size={17} /> },
    { key: 'prepare', title: t('ai.ded.progress.stage_prepare_title'), desc: t('ai.ded.progress.stage_prepare_desc'), icon: <PackageCheck size={17} /> },
  ];
};

/**
 * Pemetaan kunci tahap 6-tahap → tahap tampilan mode berjalan.
 * FULL_AI: baca + ekstrak = "scan"; identifikasi + validasi + siapkan =
 * "compose" (AI mengerjakan semuanya dalam satu tahap tampilan — tanpa
 * tahap validasi database terpisah, sesuai mockup). EZRAB_AI: identitas.
 * Kunci tak dikenal diteruskan apa adanya (perilaku lama dipertahankan).
 */
const FULL_AI_STAGE_KEY_MAP: Record<string, string> = {
  reading: 'scan',
  extract: 'scan',
  identify: 'compose',
  validate: 'compose',
  prepare: 'compose',
};

export const mapProgressStageKey = (key: string, mode: DedRabAiMode): string => {
  if (mode !== 'FULL_AI') return key;
  return FULL_AI_STAGE_KEY_MAP[key] ?? key;
};

/**
 * Inti markUpTo sebagai fungsi murni (dipindah verbatim dari view.tsx
 * agar teruji): semua tahap SEBELUM target yang masih 'waiting' menjadi
 * 'done'; target sendiri mendapat status baru; sisanya tidak berubah.
 */
export const applyStageMark = (
  stages: DedAiStage[],
  order: string[],
  key: string,
  status: StageStatus,
): DedAiStage[] => {
  const idx = order.indexOf(key);
  return stages.map((s) => {
    const si = order.indexOf(s.key);
    if (si < idx) return s.status === 'waiting' ? { ...s, status: 'done' as const } : s;
    if (si === idx) return { ...s, status };
    return s;
  });
};

export const DedAiProgressView: React.FC<Props> = ({
  stages, percent, statusLine, summary, error, onRetry, onBack, onSeeResult, resultReady,
  dedMode = 'EZRAB_AI',
}) => {
  const { t } = useI18n();
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="dedai">
      <div className="dedai-head">
        <h1>{t('ai.ded.progress.head_a')} <span className="accent">{t('ai.ded.progress.head_b')}</span> {t('ai.ded.progress.head_c')}</h1>
        <p>{t('ai.ded.progress.head_sub')}</p>
        <p style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>
          {t(dedMode === 'FULL_AI' ? 'ai.ded.progress.mode_note_full' : 'ai.ded.progress.mode_note_ezrab')}
        </p>
      </div>

      <div className="dedai-steps">
        <div className="dedai-step done"><span className="n">✓</span> {t('ai.ded.input.step_1')}</div>
        <div className="dedai-step-line done" />
        <div className="dedai-step active"><span className="n">2</span> {t('ai.ded.input.step_2')}</div>
        <div className="dedai-step-line" />
        <div className="dedai-step"><span className="n">3</span> {t('ai.ded.input.step_3')}</div>
      </div>

      <div className="dedai-progress-wrap">
        <div className="dedai-card">
          <div className="dedai-progress-head" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            {!error && !resultReady && <Loader2 size={20} className="spin" color="var(--ez-color-primary)" />}
            {resultReady && <CheckCircle2 size={20} color="var(--ez-color-success)" />}
            {error && <XCircle size={20} color="var(--ez-color-danger)" />}
            <span style={{ fontWeight: 800, fontSize: 16 }}>
              {error ? t('ai.ded.status_failed') : resultReady ? t('ai.ded.status_done') : statusLine}
            </span>
            <span className="dedai-progress-pct" style={{ marginLeft: 'auto', fontWeight: 800, color: 'var(--ez-color-primary-hover)', fontSize: 28, fontVariantNumeric: 'tabular-nums' }}>{Math.round(percent)}%</span>
          </div>
          <div className="dedai-bar"><div style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} /></div>
          {summary.currentFile && !error && !resultReady && (
            <p className="dedai-fileline"><FileText size={13} /> {summary.currentFile}</p>
          )}

          <div className="dedai-stages">
            {stages.map((s) => (
              <div key={s.key} className={`dedai-stage ${s.status}`}>
                <div className="s-ico">
                  {s.status === 'done' ? <CheckCircle2 size={18} /> :
                   s.status === 'failed' ? <XCircle size={18} /> :
                   s.status === 'active' ? <Loader2 size={18} className="spin" /> : s.icon}
                </div>
                <div className="s-body">
                  <div className="s-title">
                    {s.title}
                    <span className={`s-badge ${s.status}`}>
                      {s.status === 'waiting' ? t('ai.ded.progress.badge_waiting') : s.status === 'active' ? t('ai.ded.progress.badge_active') : s.status === 'done' ? t('ai.ded.progress.badge_done') : t('ai.ded.progress.badge_failed')}
                    </span>
                  </div>
                  <div className="s-desc">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {error && (
            <div className="dedai-error">
              <h4><XCircle size={16} /> {error.message}</h4>
              {error.errorCode && <p><code>{error.errorCode}</code>{error.stage && <code style={{ marginLeft: 6 }}>{error.stage}</code>}</p>}
              <p style={{ marginTop: 8 }}>{t('ai.ded.progress.err_kept')}</p>
            </div>
          )}

          <div className="dedai-cta" style={{ marginTop: 18 }}>
            {error ? (
              <>
                {error.retryable !== false && (
                  <button className="dedai-btn primary" onClick={onRetry}>
                    <RotateCcw size={17} /> {t('ai.ded.progress.btn_retry')}
                  </button>
                )}
                <button className="dedai-btn ghost" onClick={onBack}>
                  <ArrowLeft size={17} /> {t('ai.ded.progress.btn_back_input')}
                </button>
              </>
            ) : resultReady ? (
              <button className="dedai-btn success" onClick={onSeeResult}>
                {t('ai.ded.progress.btn_see_result')} <ArrowRight size={18} />
              </button>
            ) : (
              <button className="dedai-btn ghost" onClick={onBack}>
                <ArrowLeft size={17} /> {t('ai.ded.progress.btn_cancel_back')}
              </button>
            )}
          </div>
        </div>

        <div className="dedai-summary">
          <h3>{t('ai.ded.progress.sum_title')}</h3>
          <div className="row"><span className="k">{t('ai.ded.progress.sum_project')}</span><span className="v">{summary.projectName}</span></div>
          <div className="row"><span className="k"><Files size={13} style={{ verticalAlign: -2 }} /> {t('ai.ded.progress.sum_docs')}</span><span className="v">{summary.fileCount} file</span></div>
          <div className="row"><span className="k"><HardDrive size={13} style={{ verticalAlign: -2 }} /> {t('ai.ded.progress.sum_size')}</span><span className="v">{fmtSize(summary.totalSize)}</span></div>
          <div className="row"><span className="k">{t('ai.ded.progress.sum_mode')}</span><span className="v" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {summary.mode === 'FAST' ? <Zap size={13} color="var(--ez-color-primary)" /> : <Brain size={13} color="var(--ez-color-primary)" />}
            {summary.mode === 'FAST' ? t('ai.ded.input.mode_fast') : t('ai.ded.input.mode_deep')}
          </span></div>
          <div className="row"><span className="k"><Clock size={13} style={{ verticalAlign: -2 }} /> {t('ai.ded.progress.sum_elapsed')}</span><span className="v">{fmtElapsed(now - summary.startedAt)}</span></div>
          <div className="row"><span className="k">{t('ai.ded.progress.sum_start')}</span><span className="v">{new Date(summary.startedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span></div>
        </div>
      </div>
    </div>
  );
};

export default DedAiProgressView;

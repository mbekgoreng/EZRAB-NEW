/**
 * DED-AI Estimate — Tampilan 2: PROGRESS.
 * 6 tahap berbasis status pipeline aktual + panel ringkasan. Tanpa progress palsu.
 */
import React from 'react';
import {
  FileCheck, BookOpen, ScanSearch, ListChecks, ShieldCheck, PackageCheck,
  Loader2, CheckCircle2, XCircle, ArrowLeft, RotateCcw, ArrowRight,
  Clock, Files, HardDrive, Zap, Brain,
} from 'lucide-react';
import './dedAi.css';

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
}

const fmtSize = (b: number) =>
  b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

const fmtElapsed = (ms: number) => {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} dtk`;
  const m = Math.floor(s / 60);
  return `${m} mnt ${s % 60} dtk`;
};

export const STAGE_DEFS: Array<{ key: string; title: string; desc: string; icon: React.ReactNode }> = [
  { key: 'received', title: 'Dokumen diterima', desc: 'File tervalidasi dan siap diproses.', icon: <FileCheck size={17} /> },
  { key: 'reading', title: 'Membaca dokumen dan gambar', desc: 'Mengekstrak teks dari setiap halaman PDF.', icon: <BookOpen size={17} /> },
  { key: 'extract', title: 'Mengekstrak informasi proyek', desc: 'Menyiapkan ringkasan halaman untuk AI.', icon: <ScanSearch size={17} /> },
  { key: 'identify', title: 'Mengidentifikasi pekerjaan dan kuantitas', desc: 'AI menganalisis dan menyusun daftar pekerjaan.', icon: <ListChecks size={17} /> },
  { key: 'validate', title: 'Memvalidasi hasil', desc: 'Cek kuantitas, satuan, dan kewajaran harga di kode.', icon: <ShieldCheck size={17} /> },
  { key: 'prepare', title: 'Menyiapkan estimasi', desc: 'Menghitung subtotal dan total secara deterministik.', icon: <PackageCheck size={17} /> },
];

export const DedAiProgressView: React.FC<Props> = ({
  stages, percent, statusLine, summary, error, onRetry, onBack, onSeeResult, resultReady,
}) => {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="dedai">
      <div className="dedai-head">
        <h1>EZRAB sedang <span className="accent">menganalisis</span> proyek Anda</h1>
        <p>AI sedang membaca dokumen dan menyiapkan data untuk estimasi pekerjaan konstruksi.</p>
      </div>

      <div className="dedai-steps">
        <div className="dedai-step done"><span className="n">✓</span> Input</div>
        <div className="dedai-step-line done" />
        <div className="dedai-step active"><span className="n">2</span> Progress</div>
        <div className="dedai-step-line" />
        <div className="dedai-step"><span className="n">3</span> Hasil</div>
      </div>

      <div className="dedai-progress-wrap">
        <div className="dedai-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            {!error && !resultReady && <Loader2 size={18} className="spin" color="#2563EB" />}
            {resultReady && <CheckCircle2 size={18} color="#10B981" />}
            {error && <XCircle size={18} color="#EF4444" />}
            <span style={{ fontWeight: 800, fontSize: 15 }}>
              {error ? 'Analisis gagal' : resultReady ? 'Analisis selesai' : statusLine}
            </span>
            <span style={{ marginLeft: 'auto', fontWeight: 800, color: '#1D4ED8', fontSize: 15 }}>{Math.round(percent)}%</span>
          </div>
          <div className="dedai-bar"><div style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} /></div>
          {summary.currentFile && !error && !resultReady && (
            <p style={{ fontSize: 12.5, color: '#64748B', margin: '6px 0 0' }}>📄 {summary.currentFile}</p>
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
                      {s.status === 'waiting' ? 'Menunggu' : s.status === 'active' ? 'Proses' : s.status === 'done' ? 'Selesai' : 'Gagal'}
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
              <p style={{ marginTop: 8 }}>Input Anda tetap tersimpan — tidak perlu mengunggah ulang.</p>
            </div>
          )}

          <div className="dedai-cta" style={{ marginTop: 18 }}>
            {error ? (
              <>
                {error.retryable !== false && (
                  <button className="dedai-btn primary" onClick={onRetry}>
                    <RotateCcw size={17} /> Coba Lagi
                  </button>
                )}
                <button className="dedai-btn ghost" onClick={onBack}>
                  <ArrowLeft size={17} /> Kembali ke Input
                </button>
              </>
            ) : resultReady ? (
              <button className="dedai-btn success" onClick={onSeeResult}>
                Lihat Hasil Estimasi <ArrowRight size={18} />
              </button>
            ) : (
              <button className="dedai-btn ghost" onClick={onBack}>
                <ArrowLeft size={17} /> Batalkan & Kembali
              </button>
            )}
          </div>
        </div>

        <div className="dedai-summary">
          <h3>Ringkasan Proses</h3>
          <div className="row"><span className="k">Proyek</span><span className="v">{summary.projectName}</span></div>
          <div className="row"><span className="k"><Files size={13} style={{ verticalAlign: -2 }} /> Dokumen</span><span className="v">{summary.fileCount} file</span></div>
          <div className="row"><span className="k"><HardDrive size={13} style={{ verticalAlign: -2 }} /> Ukuran</span><span className="v">{fmtSize(summary.totalSize)}</span></div>
          <div className="row"><span className="k">Mode AI</span><span className="v" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {summary.mode === 'FAST' ? <Zap size={13} color="#2563EB" /> : <Brain size={13} color="#7C3AED" />}
            {summary.mode === 'FAST' ? 'Cepat' : 'Mendalam'}
          </span></div>
          <div className="row"><span className="k"><Clock size={13} style={{ verticalAlign: -2 }} /> Waktu jalan</span><span className="v">{fmtElapsed(now - summary.startedAt)}</span></div>
          <div className="row"><span className="k">Mulai</span><span className="v">{new Date(summary.startedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span></div>
        </div>
      </div>
    </div>
  );
};

export default DedAiProgressView;

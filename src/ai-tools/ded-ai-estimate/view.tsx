/**
 * DED AI ESTIMATE — View (src/ai-tools/ded-ai-estimate/view.tsx)
 * Standalone UI: upload DED → pick project type → pick FAST/DETAIL → analyze →
 * review items → export to JSON. Shows structured errors rather than fake success.
 */

import React, { useRef, useState } from 'react';
import {
  UploadCloud,
  Loader2,
  Zap,
  Search,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Building2,
} from 'lucide-react';
import { dedAiEstimateService } from './service';
import { notificationBus } from '../../notifications/notificationBus';
import { DedAiOutput, DedAiProjectType, DedAiMode } from './types';

const PROJECT_TYPE_OPTIONS: Array<{ value: DedAiProjectType; label: string }> = [
  { value: 'BANGUNAN', label: 'Bangunan / Rumah Tinggal' },
  { value: 'GEDUNG', label: 'Gedung' },
  { value: 'BANGUNAN AIR', label: 'Bangunan Air' },
  { value: 'JALAN', label: 'Jalan' },
  { value: 'PAVING', label: 'Paving' },
];

const cell = (extra?: React.CSSProperties): React.CSSProperties => ({
  padding: '12px',
  color: '#141412',
  borderBottom: '1px solid #F5F4EF',
  ...(extra || {}),
});

const thCell: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: '11px',
  letterSpacing: '1px',
  textTransform: 'uppercase',
  color: '#8A8A84',
  borderBottom: '1px solid #F0EFE9',
  fontWeight: 700,
};

const FONT = "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif";
const CARD_SHADOW = '0 4px 20px rgba(0,0,0,0.045)';

export const DedAiEstimateView: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [projectType, setProjectType] = useState<DedAiProjectType>('BANGUNAN');
  const [mode, setMode] = useState<DedAiMode>('FAST');
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<{ label: string; percent: number; message: string } | null>(null);
  const [result, setResult] = useState<DedAiOutput | null>(null);
  const [error, setError] = useState<{ errorCode: string; stage: string; message: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFileChange = (f: File | null) => {
    if (!f) return;
    setFile(f);
    setResult(null);
    setError(null);
  };

  const analyze = async () => {
    if (!file || isRunning) return;
    setIsRunning(true);
    setResult(null);
    setError(null);
    setProgress({ label: 'Memulai', percent: 5, message: 'Mempersiapkan analisis DED…' });
    try {
      const buffer = await file.arrayBuffer();
      const res = await dedAiEstimateService.execute({
        fileName: file.name,
        buffer,
        mimeType: file.type,
        projectType,
        mode,
        projectName: file.name.replace(/\.pdf$/i, ''),
        onProgress: (e) => setProgress({ label: e.label, percent: e.percent, message: e.message }),
      });
      if (res && res.success) {
        const output = res as unknown as DedAiOutput;
        setResult(output);
        notificationBus.publish({
          type: 'success',
          title: 'Analisis DED selesai',
          message: `${output.items.length} pekerjaan terdeteksi dari ${file.name} (${projectType}, mode ${mode === 'FAST' ? 'Cepat' : 'Detail'}).`,
          link: 'ded-ai',
        });
      } else {
        const failure = res as unknown as { errorCode: string; stage: string; message: string };
        setError(failure);
        notificationBus.publish({
          type: 'error',
          title: 'Analisis DED gagal',
          message: failure?.message && failure.message.length > 140 ? `${failure.message.slice(0, 140)}…` : failure?.message || 'Analisis gambar DED tidak berhasil.',
          link: 'ded-ai',
        });
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Kesalahan tidak terduga.';
      setError({ errorCode: 'INTERNAL', stage: 'ui', message: errMsg });
      notificationBus.publish({
        type: 'error',
        title: 'Analisis DED gagal',
        message: errMsg.length > 140 ? `${errMsg.slice(0, 140)}…` : errMsg,
        link: 'ded-ai',
      });
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  };

  const exportJson = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.projectName || 'ded-ai'}-estimated.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="ezdb-anim"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '22px',
        maxWidth: '1440px',
        margin: '0 auto',
        padding: '8px 24px 48px',
        width: '100%',
        color: '#141412',
        fontFamily: FONT,
        animation: 'ezdb-rise 0.6s 0s both',
      }}
    >
      <style>{`
        @keyframes ezdb-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .ezdb-anim { animation: none !important; } }
        .ezrab-spin { display: inline-block; animation: ezSpin 1s linear infinite; }
        @keyframes ezSpin { to { transform: rotate(360deg); } }
        @media (max-width: 1000px) { .ezdb-dedgrid { grid-template-columns: 1fr !important; } }
      `}</style>
      {/* ===== Header ===== */}
      <header style={{ marginBottom: '2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ background: '#DCFCE7', color: '#15803D', fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 99, whiteSpace: 'nowrap' }}>BARU</span>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#141412', letterSpacing: '-0.3px', fontFamily: FONT }}>DED AI Estimate</h1>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: '#8A8A84' }}>
          Unggah gambar kerja (DED) → pilih tipe proyek &amp; mode → EZRAB menyusun daftar pekerjaan dengan estimasi volume &amp; harga satuan.
          Harga adalah AI_ESTIMATE dan dapat Anda tinjau sebelum dipakai.
        </p>
      </header>

      <section className="ezdb-dedgrid" style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.4fr 1fr', gap: 18 }}>
        <div style={{ background: '#fff', border: '1px solid #EEF1F6', borderRadius: '22px', padding: '24px', boxShadow: CARD_SHADOW }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6B6B64', textTransform: 'uppercase', letterSpacing: '.04em' }}>1 · File DED</div>
          <input ref={inputRef} type="file" accept=".pdf,application/pdf" style={{ display: 'none' }} onChange={(e) => onFileChange(e.target.files?.[0] || null)} />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{ marginTop: 10, width: '100%', padding: '16px 10px', borderRadius: 12, border: '1.5px dashed #CBD5E1', background: file ? '#EFF6FF' : '#F8FAFC', cursor: 'pointer' }}
          >
            {file ? (
              <span style={{ color: '#2563EB', fontWeight: 700 }}>
                <FileText size={16} style={{ marginRight: 6, verticalAlign: -3 }} />{file.name}
              </span>
            ) : (
              <span style={{ color: '#64748B' }}>
                <UploadCloud size={18} style={{ marginRight: 6, verticalAlign: -4 }} />Pilih PDF DED
              </span>
            )}
          </button>
        </div>

        <div style={{ background: '#fff', border: '1px solid #EEF1F6', borderRadius: '22px', padding: '24px', boxShadow: CARD_SHADOW }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6B6B64', textTransform: 'uppercase', letterSpacing: '.04em' }}>2 · Tipe Proyek &amp; Mode</div>
          <select
            value={projectType}
            onChange={(e) => setProjectType(e.target.value as DedAiProjectType)}
            style={{ marginTop: 10, width: '100%', padding: '9px 10px', borderRadius: 12, border: '1px solid #CBD5E1', background: '#fff', fontSize: 13 }}
          >
            {PROJECT_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" onClick={() => setMode('FAST')} style={{ flex: 1, padding: '10px', borderRadius: 12, border: mode === 'FAST' ? '2px solid #2563EB' : '1px solid #E2E8F0', background: mode === 'FAST' ? '#EFF6FF' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Zap size={15} color="#2563EB" />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>Cepat</span>
            </button>
            <button type="button" onClick={() => setMode('DETAIL')} style={{ flex: 1, padding: '10px', borderRadius: 12, border: mode === 'DETAIL' ? '2px solid #2563EB' : '1px solid #E2E8F0', background: mode === 'DETAIL' ? '#EFF6FF' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Search size={15} color="#2563EB" />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>Detail</span>
            </button>
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #EEF1F6', borderRadius: '22px', padding: '24px', boxShadow: CARD_SHADOW, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => void analyze()}
            disabled={!file || isRunning}
            style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: !file || isRunning ? '#CBD5E1' : '#2563EB', color: '#fff', fontWeight: 700, fontSize: 14, cursor: !file || isRunning ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            {isRunning ? <Loader2 size={17} className="ezrab-spin" /> : <Building2 size={17} />}
            {isRunning ? 'Menganalisis…' : 'Mulai Analisis'}
          </button>
          {result && (
            <button type="button" onClick={exportJson} style={{ marginTop: 8, width: '100%', padding: '10px', borderRadius: 12, border: '1px solid #CBD5E1', background: '#fff', color: '#141412', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Download size={15} /> Ekspor JSON
            </button>
          )}
        </div>
      </section>

      {progress && (
        <div style={{ background: '#fff', border: '1px solid #EEF1F6', borderRadius: '22px', padding: '20px', boxShadow: CARD_SHADOW }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#475569', marginBottom: 6 }}>
            <span style={{ fontWeight: 700 }}>{progress.label}</span>
            <span>{progress.percent}%</span>
          </div>
          <div style={{ height: 8, background: '#F0EFE9', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, progress.percent)}%`, background: '#2563EB', borderRadius: 99, transition: 'width .2s' }} />
          </div>
          <div style={{ fontSize: 12, color: '#8A8A84', marginTop: 6 }}>{progress.message}</div>
        </div>
      )}

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '22px', padding: '20px', boxShadow: CARD_SHADOW }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <AlertTriangle size={18} color="#B91C1C" style={{ marginTop: 1 }} />
            <div>
              <div style={{ fontWeight: 800, color: '#B91C1C', fontSize: 14 }}>Analisis tidak berhasil</div>
              <div style={{ fontSize: 12.5, color: '#991B1B', marginTop: 4 }}>{error.message}</div>
              <div style={{ fontSize: 11.5, color: '#B91C1C', marginTop: 6, opacity: 0.7 }}>
                kode: {error.errorCode} · tahap: {error.stage}
              </div>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <CheckCircle2 size={17} color="#15803D" />
            <span style={{ fontWeight: 800, color: '#141412', fontSize: 15 }}>Hasil Estimasi ({result.items.length} pekerjaan)</span>
            <span style={{ marginLeft: 'auto', fontSize: 15, fontWeight: 800, color: '#2563EB' }}>
              Total (terhitung): Rp {result.grandTotal.toLocaleString('id-ID')}
            </span>
          </div>
          <div style={{ background: '#fff', border: '1px solid #EEF1F6', borderRadius: '22px', boxShadow: CARD_SHADOW, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={thCell}>#</th>
                  <th style={thCell}>Pekerjaan</th>
                  <th style={thCell}>Kategori</th>
                  <th style={thCell}>Satuan</th>
                  <th style={{ ...thCell, textAlign: 'right' }}>Vol.</th>
                  <th style={{ ...thCell, textAlign: 'right' }}>Harga Satuan (AI)</th>
                  <th style={{ ...thCell, textAlign: 'right' }}>Subtotal</th>
                  <th style={thCell}>Sumber</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((it, i) => (
                  <tr key={it.id}>
                    <td style={cell({ color: '#8A8A84' })}>{i + 1}</td>
                    <td style={cell({ fontWeight: 600, maxWidth: 220 })}>{it.name}</td>
                    <td style={cell({ color: '#475569' })}>{it.category}</td>
                    <td style={cell({ color: '#6B6B64' })}>{it.units}</td>
                    <td style={cell({ textAlign: 'right', color: it.quantity === null ? '#B91C1C' : '#141412' })}>
                      {it.quantity === null ? '—' : it.quantity.toLocaleString('id-ID', { maximumFractionDigits: 2 })}
                    </td>
                    <td style={cell({ textAlign: 'right', color: it.unitPrice === null ? '#B91C1C' : '#141412' })}>
                      {it.unitPrice === null ? '—' : 'Rp ' + it.unitPrice.toLocaleString('id-ID')}
                    </td>
                    <td style={cell({ textAlign: 'right', fontWeight: 700, color: it.subtotal === null ? '#B91C1C' : '#15803D' })}>
                      {it.subtotal === null ? '—' : 'Rp ' + it.subtotal.toLocaleString('id-ID')}
                    </td>
                    <td style={cell({ color: '#8A8A84', fontSize: 11 })}>
                      {it.provenance.filter((x) => !x.startsWith('qty=') && !x.startsWith('price=')).join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: '#6B6B64' }}>
            Cakupan jujur: {result.coverage.itemsFullyResolved} dari {result.coverage.totalItems} pekerjaan terhitung penuh ·
            (vol terisi {result.coverage.itemsWithQuantity} · harga terisi {result.coverage.itemsWithPrice}).
            Harga adalah <b>AI_ESTIMATE</b>, bukan AHSP resmi.
          </div>
        </div>
      )}
    </div>
  );
};

export default DedAiEstimateView;

/**
 * DED-AI Estimate — Tampilan 1: INPUT.
 * Upload multi-file (drag & drop) + deskripsi proyek + pilihan proyek + tipe + mode AI.
 */
import React, { useRef, useState } from 'react';
import {
  UploadCloud, FileText, X, Zap, Brain, FolderOpen, PlusCircle,
  ArrowRight, AlertTriangle, History, Trash2, RotateCcw,
} from 'lucide-react';
import { DedAiMode, DedAiProjectType } from './types';
import './dedAi.css';

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
}

interface Props {
  initialSession: DedAiSession;
  projects: Array<{ id: string; name: string }>;
  drafts: Array<{ id: string; createdAt: number; projectName: string; itemCount: number; grandTotal: number }>;
  onStart: (session: DedAiSession) => void;
  onLoadDraft: (id: string) => void;
  onDeleteDraft: (id: string) => void;
}

const PROJECT_TYPE_OPTIONS: Array<{ value: DedAiProjectType; label: string }> = [
  { value: 'BANGUNAN', label: 'Bangunan / Rumah Tinggal' },
  { value: 'GEDUNG', label: 'Gedung' },
  { value: 'BANGUNAN AIR', label: 'Bangunan Air' },
  { value: 'JALAN', label: 'Jalan' },
  { value: 'PAVING', label: 'Paving' },
];

const MAX_FILE_MB = 25;
const MAX_FILES = 5;

const fmtSize = (b: number) =>
  b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

export const DedAiInputView: React.FC<Props> = ({
  initialSession, projects, drafts, onStart, onLoadDraft, onDeleteDraft,
}) => {
  const [files, setFiles] = useState<DedAiFileItem[]>(initialSession.files);
  const [description, setDescription] = useState(initialSession.description);
  const [projectName, setProjectName] = useState(initialSession.projectName);
  const [projectType, setProjectType] = useState<DedAiProjectType>(initialSession.projectType);
  const [mode, setMode] = useState<DedAiMode>(initialSession.mode);
  const [targetProjectId, setTargetProjectId] = useState<string | null>(initialSession.targetProjectId);
  const [useExisting, setUseExisting] = useState(initialSession.targetProjectId !== null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | File[]) => {
    const arr = Array.from(list);
    setFiles((prev) => {
      const next = [...prev];
      for (const f of arr) {
        if (next.length >= MAX_FILES) break;
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        let error: string | undefined;
        const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
        if (!isPdf) error = 'Hanya file PDF yang didukung parser saat ini.';
        else if (f.size > MAX_FILE_MB * 1048576) error = `Ukuran melebihi ${MAX_FILE_MB} MB.`;
        else if (f.size === 0) error = 'File kosong (0 byte).';
        next.push({ file: f, id, error });
      }
      return next;
    });
  };

  const validFiles = files.filter((f) => !f.error);
  const canStart = validFiles.length > 0;

  const handleStart = () => {
    if (!canStart) return;
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
    });
  };

  return (
    <div className="dedai">
      <div className="dedai-head">
        <h1>DED <span className="accent">→</span> RAB dengan AI</h1>
        <p>Buat estimasi pekerjaan konstruksi dari dokumen DED, gambar kerja, atau deskripsi proyek.</p>
      </div>

      <div className="dedai-steps">
        <div className="dedai-step active"><span className="n">1</span> Input</div>
        <div className="dedai-step-line" />
        <div className="dedai-step"><span className="n">2</span> Progress</div>
        <div className="dedai-step-line" />
        <div className="dedai-step"><span className="n">3</span> Hasil</div>
      </div>

      {/* ---- Upload ---- */}
      <div className="dedai-card">
        <h2><span className="ico"><UploadCloud size={18} /></span> Dokumen DED</h2>
        <p className="sub">Unggah gambar kerja / dokumen DED. Bisa lebih dari satu file — hasilnya digabung otomatis.</p>
        <div
          className={`dedai-drop ${dragOver ? 'over' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
        >
          <div className="big-ico"><UploadCloud size={26} /></div>
          <p>Seret & letakkan file di sini, atau klik untuk memilih</p>
          <span>Maksimal {MAX_FILES} file · {MAX_FILE_MB} MB per file</span>
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
                  {f.error && <div className="f-err">⚠ {f.error}</div>}
                </div>
                <button className="f-del" onClick={() => setFiles((p) => p.filter((x) => x.id !== f.id))} title="Hapus file">
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="dedai-notice blue">
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>AI membaca <b>teks</b> di dalam PDF. PDF hasil scan (gambar saja tanpa teks) kemungkinan besar tidak terbaca — jika analisis gagal, itu penyebabnya.</span>
        </div>
      </div>

      {/* ---- Deskripsi ---- */}
      <div className="dedai-card">
        <h2><span className="ico"><FileText size={18} /></span> Deskripsi Proyek <span style={{ fontWeight: 500, fontSize: 12, color: '#94A3B8' }}>(opsional)</span></h2>
        <p className="sub">Ceritakan proyekmu — AI memakai ini sebagai konteks tambahan selain dokumen.</p>
        <div className="dedai-field">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Contoh: Bangun rumah tinggal 2 lantai, luas bangunan 120 m², struktur beton bertulang, pondasi batu kali, dinding bata ringan, atap baja ringan, dan finishing standar."
          />
        </div>
      </div>

      {/* ---- Proyek & tipe ---- */}
      <div className="dedai-card">
        <h2><span className="ico"><FolderOpen size={18} /></span> Proyek & Pengaturan</h2>
        <p className="sub">Hasil estimasi bisa disimpan ke proyek existing atau proyek baru saat finalisasi.</p>
        <div className="dedai-seg" style={{ marginBottom: 16 }}>
          <button className={!useExisting ? 'active' : ''} onClick={() => setUseExisting(false)}>
            <PlusCircle size={15} /> Proyek Baru
          </button>
          <button className={useExisting ? 'active' : ''} onClick={() => setUseExisting(true)} disabled={projects.length === 0}>
            <FolderOpen size={15} /> Proyek Existing
          </button>
        </div>
        {useExisting ? (
          <div className="dedai-field">
            <label>Pilih proyek</label>
            <select value={targetProjectId || ''} onChange={(e) => setTargetProjectId(e.target.value || null)}>
              <option value="">— Pilih proyek —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {projects.length === 0 && <div className="hint">Belum ada proyek — pakai "Proyek Baru".</div>}
          </div>
        ) : (
          <div className="dedai-field">
            <label>Nama proyek baru</label>
            <input
              type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)}
              placeholder="cth: Rumah Tinggal 2 Lantai — Bintaro"
            />
            <div className="hint">Kosongkan untuk memakai nama file otomatis.</div>
          </div>
        )}
        <div className="dedai-grid2">
          <div className="dedai-field">
            <label>Jenis proyek</label>
            <div className="dedai-chips">
              {PROJECT_TYPE_OPTIONS.map((o) => (
                <button key={o.value} className={`dedai-chip ${projectType === o.value ? 'active' : ''}`} onClick={() => setProjectType(o.value)}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="dedai-field">
            <label>Mode AI</label>
            <div className="dedai-seg">
              <button className={mode === 'FAST' ? 'active' : ''} onClick={() => setMode('FAST')}>
                <Zap size={15} /> Cepat
              </button>
              <button className={mode === 'DETAIL' ? 'active' : ''} onClick={() => setMode('DETAIL')}>
                <Brain size={15} /> Mendalam
              </button>
            </div>
            <div className="hint">{mode === 'FAST' ? 'Hasil cepat untuk estimasi awal.' : 'Analisis lebih teliti, butuh waktu lebih lama.'}</div>
          </div>
        </div>
      </div>

      <div className="dedai-cta">
        <button className="dedai-btn primary" disabled={!canStart} onClick={handleStart}>
          Mulai AI Estimate <ArrowRight size={18} />
        </button>
      </div>
      {!canStart && (
        <p style={{ textAlign: 'center', color: '#94A3B8', fontSize: 12.5, marginTop: 10 }}>
          Unggah minimal 1 file PDF yang valid untuk memulai.
        </p>
      )}

      {/* ---- Draft tersimpan ---- */}
      {drafts.length > 0 && (
        <div className="dedai-card" style={{ marginTop: 18 }}>
          <h2><span className="ico"><History size={18} /></span> Draft Tersimpan</h2>
          <p className="sub">Lanjutkan hasil analisis yang pernah disimpan.</p>
          <div className="dedai-drafts">
            {drafts.map((d) => (
              <div key={d.id} className="dedai-draft">
                <div className="d-info">
                  <div className="d-name">{d.projectName}</div>
                  <div className="d-meta">
                    {new Date(d.createdAt).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {d.itemCount} item
                  </div>
                </div>
                <button className="dedai-icon-btn" onClick={() => onLoadDraft(d.id)} title="Buka draft">
                  <RotateCcw size={14} />
                </button>
                <button className="dedai-icon-btn" onClick={() => onDeleteDraft(d.id)} title="Hapus draft">
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

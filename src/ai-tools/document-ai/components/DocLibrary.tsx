/**
 * AI DOKUMEN — Dokumen Saya (library).
 * Upload, daftar, cari, filter, hapus. Data dari docStore (localStorage).
 */
import React, { useMemo, useRef, useState } from 'react';
import {
  UploadCloud, Search, FileText, FileSpreadsheet, FileType, Trash2,
  Eye, Download, Loader2, AlertTriangle, FolderOpen, X,
} from 'lucide-react';
import { parseDocument } from '../parser';
import { docStore, newId, formatBytes, formatDate, DocRecord, DocStatus } from '../store';

const MAX_FILE_MB = 25;

function kindIcon(kind: string) {
  if (kind === 'pdf') return <FileText size={18} color="#DC2626" />;
  if (kind === 'xlsx') return <FileSpreadsheet size={18} color="#16A34A" />;
  if (kind === 'docx' || kind === 'text') return <FileType size={18} color="#2563EB" />;
  return <FileText size={18} color="#94A3B8" />;
}

function statusBadge(s: DocStatus) {
  const map: Record<DocStatus, { label: string; bg: string; fg: string }> = {
    ready: { label: 'Siap dianalisis', bg: '#DCFCE7', fg: '#166534' },
    processing: { label: 'Memproses', bg: '#FEF3C7', fg: '#92400E' },
    failed: { label: 'Gagal diproses', bg: '#FEE2E2', fg: '#991B1B' },
    needs_review: { label: 'Perlu perhatian', bg: '#FFEDD5', fg: '#9A3412' },
  };
  const m = map[s];
  return (
    <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '999px', background: m.bg, color: m.fg }}>
      {m.label}
    </span>
  );
}

export const DocLibrary: React.FC<{
  onAnalyze: (doc: DocRecord) => void;
  refreshKey: number;
  onChanged: () => void;
}> = ({ onAnalyze, refreshKey, onChanged }) => {
  const [docs, setDocs] = useState<DocRecord[]>(() => docStore.list());
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = () => {
    setDocs(docStore.list());
    onChanged();
  };

  React.useEffect(() => { setDocs(docStore.list()); }, [refreshKey]);

  const stats = useMemo(() => ({
    total: docs.length,
    ready: docs.filter((d) => d.status === 'ready').length,
    processing: docs.filter((d) => d.status === 'processing').length,
    attention: docs.filter((d) => d.status === 'failed' || d.status === 'needs_review').length,
  }), [docs]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return docs.filter((d) => {
      if (kindFilter !== 'all' && d.kind !== kindFilter) return false;
      if (q && !d.fileName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [docs, query, kindFilter]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    for (const f of Array.from(files)) {
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        setError(`"${f.name}" melebihi batas ${MAX_FILE_MB} MB.`);
        continue;
      }
      const id = newId('doc');
      const rec: DocRecord = {
        id, fileName: f.name, kind: 'unknown', sizeBytes: f.size,
        text: '', charCount: 0, status: 'processing',
        createdAt: Date.now(), updatedAt: Date.now(),
      };
      docStore.upsert(rec);
      setDocs(docStore.list());
      setBusy(true);
      try {
        const buf = await f.arrayBuffer();
        const parsed = await parseDocument(buf, f.name, f.type);
        const updated: DocRecord = {
          ...rec,
          kind: parsed.kind, text: parsed.text, pages: parsed.pages,
          charCount: parsed.text.length,
          status: parsed.text.trim() ? 'ready' : 'needs_review',
          error: parsed.text.trim() ? undefined : 'Tidak ada teks yang bisa diekstrak (mungkin hasil scan tanpa lapisan teks).',
          updatedAt: Date.now(),
        };
        docStore.upsert(updated);
      } catch (e: any) {
        docStore.upsert({ ...rec, status: 'failed', error: e?.message || 'Gagal memproses.', updatedAt: Date.now() });
      } finally {
        setBusy(false);
        reload();
      }
    }
  };

  const handleDownload = (d: DocRecord) => {
    const blob = new Blob([d.text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = d.fileName.replace(/\.[^.]+$/, '') + '.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  return (
    <div className="docai-tab">
      <div className="docai-pagehead">
        <div>
          <div className="docai-crumb">EZRAB AI Dokumen</div>
          <h2>Dokumen Saya</h2>
          <p>Kelola, pahami, dan olah dokumen konstruksi dalam satu workspace.</p>
        </div>
        <button className="docai-btn-primary" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 size={16} className="spin" /> : <UploadCloud size={16} />} Upload Dokumen
        </button>
        <input
          ref={inputRef} type="file" multiple style={{ display: 'none' }}
          accept=".pdf,.docx,.doc,.xlsx,.xls,.txt,.csv"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      <div className="docai-stats">
        {[
          { label: 'Total dokumen', value: stats.total },
          { label: 'Siap dianalisis', value: stats.ready },
          { label: 'Sedang diproses', value: stats.processing },
          { label: 'Perlu perhatian', value: stats.attention },
        ].map((s) => (
          <div key={s.label} className="docai-stat">
            <div className="docai-stat-v">{s.value}</div>
            <div className="docai-stat-l">{s.label}</div>
          </div>
        ))}
      </div>

      {error && <div className="docai-error"><AlertTriangle size={15} /> {error}</div>}

      <div className="docai-toolbar">
        <div className="docai-search">
          <Search size={15} color="#94A3B8" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama dokumen…" />
        </div>
        <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className="docai-select">
          <option value="all">Semua jenis</option>
          <option value="pdf">PDF</option>
          <option value="docx">DOCX</option>
          <option value="xlsx">XLSX</option>
          <option value="text">Teks</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="docai-empty">
          <FolderOpen size={40} color="#CBD5E1" />
          <h3>{docs.length === 0 ? 'Belum ada dokumen' : 'Tidak ditemukan'}</h3>
          <p>{docs.length === 0
            ? 'Unggah PDF, DOCX, atau XLSX pertama Anda untuk mulai menganalisis.'
            : 'Coba kata kunci atau filter lain.'}</p>
          {docs.length === 0 && (
            <button className="docai-btn-primary" onClick={() => inputRef.current?.click()}>
              <UploadCloud size={16} /> Upload Dokumen Pertama
            </button>
          )}
        </div>
      ) : (
        <div className="docai-tablewrap">
          <table className="docai-table">
            <thead>
              <tr><th>Nama dokumen</th><th>Jenis</th><th>Ukuran</th><th>Status</th><th>Diperbarui</th><th>Aksi</th></tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id}>
                  <td>
                    <div className="docai-frow">{kindIcon(d.kind)}<span className="docai-fname2">{d.fileName}</span></div>
                    {d.error && <div className="docai-ferr">{d.error}</div>}
                  </td>
                  <td style={{ textTransform: 'uppercase', fontSize: '11px', fontWeight: 700, color: '#64748B' }}>{d.kind}</td>
                  <td>{formatBytes(d.sizeBytes)}</td>
                  <td>{statusBadge(d.status)}</td>
                  <td>{formatDate(d.updatedAt)}</td>
                  <td>
                    <div className="docai-actions">
                      <button title="Analisis" disabled={d.status !== 'ready'} onClick={() => onAnalyze(d)}><Eye size={15} /></button>
                      <button title="Unduh teks" onClick={() => handleDownload(d)}><Download size={15} /></button>
                      {confirmDelete === d.id ? (
                        <>
                          <button title="Batal" onClick={() => setConfirmDelete(null)}><X size={15} /></button>
                          <button title="Ya, hapus" className="danger" onClick={() => { docStore.remove(d.id); setConfirmDelete(null); reload(); }}>Hapus?</button>
                        </>
                      ) : (
                        <button title="Hapus" onClick={() => setConfirmDelete(d.id)}><Trash2 size={15} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="docai-note">Dokumen tersimpan di browser ini (localStorage). Bukan penyimpanan server — jangan dianggap arsip resmi multi-pengguna.</p>
    </div>
  );
};

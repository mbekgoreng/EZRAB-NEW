/**
 * AI DOKUMEN — Dokumen Saya (library).
 * Upload, daftar, cari, filter, hapus. State diangkat ke view.tsx.
 */
import React, { useMemo, useRef, useState } from 'react';
import {
  UploadCloud, Search, FileText, FileSpreadsheet, FileType, Trash2,
  FileSearch, Download, Loader2, AlertTriangle, FolderOpen, X,
} from 'lucide-react';
import { parseDocument } from '../parser';
import type { DocRecord, DocStatus } from '../view';
import { newId, formatBytes, formatDate } from '../view';
import { useI18n } from '../../../i18n/I18nContext';

const MAX_FILE_MB = 25;

function kindIcon(kind: string) {
  if (kind === 'pdf') return <FileText size={18} color="var(--ez-color-danger)" />;
  if (kind === 'xlsx') return <FileSpreadsheet size={18} color="var(--ez-color-success)" />;
  if (kind === 'docx' || kind === 'text') return <FileType size={18} color="var(--ez-color-primary)" />;
  return <FileText size={18} color="var(--ez-color-text-muted)" />;
}

function statusBadge(s: DocStatus, t: (key: string) => string) {
  const cls: Record<DocStatus, string> = {
    ready: 'b-ready',
    processing: 'b-processing',
    failed: 'b-failed',
    needs_review: 'b-attention',
  };
  const label: Record<DocStatus, string> = {
    ready: t('ai.doc.lib.status_ready'),
    processing: t('ai.doc.lib.status_processing'),
    failed: t('ai.doc.lib.status_failed'),
    needs_review: t('ai.doc.lib.status_needs_review'),
  };
  return <span className={`docai-badge ${cls[s]}`}>{label[s]}</span>;
}

export const DocLibrary: React.FC<{
  docs: DocRecord[];
  onUpsertDoc: (d: DocRecord) => void;
  onRemoveDoc: (id: string) => void;
  onAnalyze: (doc: DocRecord) => void;
}> = ({ docs, onUpsertDoc, onRemoveDoc, onAnalyze }) => {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
        setError(`"${f.name}" ${t('ai.doc.lib.err_size_a')} ${MAX_FILE_MB} ${t('ai.doc.lib.err_size_b')}`);
        continue;
      }
      const id = newId('doc');
      const rec: DocRecord = {
        id, fileName: f.name, kind: 'unknown', sizeBytes: f.size,
        text: '', charCount: 0, status: 'processing',
        createdAt: Date.now(), updatedAt: Date.now(),
      };
      onUpsertDoc(rec);
      setBusy(true);
      try {
        const buf = await f.arrayBuffer();
        const parsed = await parseDocument(buf, f.name, f.type);
        const updated: DocRecord = {
          ...rec,
          kind: parsed.kind, text: parsed.text, pages: parsed.pages,
          charCount: parsed.text.length,
          status: parsed.text.trim() ? 'ready' : 'needs_review',
          error: parsed.text.trim() ? undefined : t('ai.doc.lib.err_no_text'),
          updatedAt: Date.now(),
        };
        onUpsertDoc(updated);
      } catch (e: any) {
        onUpsertDoc({ ...rec, status: 'failed', error: e?.message || t('ai.doc.lib.err_process'), updatedAt: Date.now() });
      } finally {
        setBusy(false);
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
          <div className="docai-crumb">{t('ai.doc.lib.crumb')}</div>
          <h2>{t('ai.doc.lib.h2')}</h2>
          <p>{t('ai.doc.lib.sub')}</p>
        </div>
        <button className="docai-btn-primary" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 size={16} className="spin" /> : <UploadCloud size={16} />} {t('ai.doc.lib.upload')}
        </button>
        <input
          ref={inputRef} type="file" multiple style={{ display: 'none' }}
          accept=".pdf,.docx,.doc,.xlsx,.xls,.txt,.csv"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      <div className="docai-stats">
        {[
          { label: t('ai.doc.lib.stat_total'), value: stats.total },
          { label: t('ai.doc.lib.stat_ready'), value: stats.ready },
          { label: t('ai.doc.lib.stat_processing'), value: stats.processing },
          { label: t('ai.doc.lib.stat_attention'), value: stats.attention },
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
          <Search size={15} color="var(--ez-color-text-muted)" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('ai.doc.lib.search_ph')} />
        </div>
        <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className="docai-select">
          <option value="all">{t('ai.doc.lib.opt_all')}</option>
          <option value="pdf">PDF</option>
          <option value="docx">DOCX</option>
          <option value="xlsx">XLSX</option>
          <option value="text">{t('ai.doc.lib.opt_text')}</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="docai-empty">
          <FolderOpen size={40} color="var(--ez-color-border)" />
          <h3>{docs.length === 0 ? t('ai.doc.lib.empty_h_none') : t('ai.doc.lib.empty_h_notfound')}</h3>
          <p>{docs.length === 0
            ? t('ai.doc.lib.empty_p_none')
            : t('ai.doc.lib.empty_p_notfound')}</p>
          {docs.length === 0 && (
            <button className="docai-btn-primary" onClick={() => inputRef.current?.click()}>
              <UploadCloud size={16} /> {t('ai.doc.lib.upload_first')}
            </button>
          )}
        </div>
      ) : (
        <div className="docai-tablewrap">
          <table className="docai-table">
            <thead>
              <tr><th>{t('ai.doc.lib.th_name')}</th><th>{t('ai.doc.lib.th_kind')}</th><th>{t('ai.doc.lib.th_size')}</th><th>{t('ai.doc.lib.th_status')}</th><th>{t('ai.doc.lib.th_updated')}</th><th>{t('ai.doc.lib.th_action')}</th></tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id}>
                  <td>
                    <div className="docai-frow">{kindIcon(d.kind)}<span className="docai-fname2">{d.fileName}</span></div>
                    {d.error && <div className="docai-ferr">{d.error}</div>}
                  </td>
                  <td style={{ textTransform: 'uppercase', fontSize: '11px', fontWeight: 700, color: 'var(--ez-color-text-muted)' }}>{d.kind}</td>
                  <td>{formatBytes(d.sizeBytes)}</td>
                  <td>{statusBadge(d.status, t)}</td>
                  <td>{formatDate(d.updatedAt)}</td>
                  <td>
                    <div className="docai-actions">
                      <button className="docai-btn-analyze" title={t('ai.doc.lib.title_analyze')} disabled={d.status !== 'ready'} onClick={() => onAnalyze(d)}><FileSearch size={15} /> {t('ai.doc.lib.title_analyze')}</button>
                      <button title={t('ai.doc.lib.title_download')} onClick={() => handleDownload(d)}><Download size={15} /></button>
                      {confirmDelete === d.id ? (
                        <>
                          <button title={t('ai.doc.lib.title_cancel')} onClick={() => setConfirmDelete(null)}><X size={15} /></button>
                          <button title={t('ai.doc.lib.title_confirm_del')} className="danger" onClick={() => { onRemoveDoc(d.id); setConfirmDelete(null); }}>{t('ai.doc.lib.title_delete_q')}</button>
                        </>
                      ) : (
                        <button title={t('ai.doc.lib.title_delete')} onClick={() => setConfirmDelete(d.id)}><Trash2 size={15} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="docai-note">{t('ai.doc.lib.note')}</p>
    </div>
  );
};

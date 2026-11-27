/**
 * AI DOKUMEN — Dokumen Saya (library).
 * Upload, daftar, cari, filter, hapus. State dokumen diangkat ke view.tsx.
 *
 * Tata letak pola app shell (mockup ter-ACC owner 2026-11-10): keadaan awal
 * = kotak upload besar di tengah + SATU panel Pengaturan Dokumen di pinggir
 * kanan (mode analisis pertama, jenis dokumen, bahasa, sesudah analisis,
 * ringkasan dokumen terpilih) dengan tombol Analisis Dokumen menempel di
 * bawah panel. Mode analisis pertama diteruskan ke DocAnalyzer sebagai tab
 * awal (initialTab) — mode lain tetap tersedia di workspace analisis.
 * Pilihan "Sesudah Analisis" menentukan aksi tombol utama: membuka hasil
 * analisis, atau lanjut ke DED Estimate AI (navigasi menu yang sudah ada).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  UploadCloud, Search, FileText, FileSpreadsheet, FileType, Trash2,
  FileSearch, Download, Loader2, AlertTriangle, FolderOpen, X, Settings2,
} from 'lucide-react';
import { parseDocument } from '../parser';
import type { DocRecord, DocStatus } from '../view';
import { newId, formatBytes, formatDate } from '../view';
import { useI18n } from '../../../i18n/I18nContext';
import { LANG_OPTIONS, type Lang } from '../../../i18n/I18nContext';
import { getTabs, type AnaTab } from './DocAnalyzer';

const MAX_FILE_MB = 25;

/** Pilihan tujuan sesudah analisis dari panel pengaturan. */
export type AfterAnalysisChoice = 'hasil' | 'ded';

/** Deskripsi singkat mode analisis pertama (ditampilkan di panel). */
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

function statusText(s: DocStatus, t: (key: string) => string) {
  const label: Record<DocStatus, string> = {
    ready: t('ai.doc.lib.status_ready'),
    processing: t('ai.doc.lib.status_processing'),
    failed: t('ai.doc.lib.status_failed'),
    needs_review: t('ai.doc.lib.status_needs_review'),
  };
  return label[s];
}

export const DocLibrary: React.FC<{
  docs: DocRecord[];
  onUpsertDoc: (d: DocRecord) => void;
  onRemoveDoc: (id: string) => void;
  onAnalyze: (doc: DocRecord) => void;
  /** Mode analisis pertama dari panel pengaturan (diangkat ke view). */
  initialMode: AnaTab;
  onInitialModeChange: (m: AnaTab) => void;
  /** Tujuan sesudah analisis dari panel pengaturan (diangkat ke view). */
  afterAnalysis: AfterAnalysisChoice;
  onAfterAnalysisChange: (c: AfterAnalysisChoice) => void;
  /** Navigasi lanjut ke DED Estimate AI (menu workspace yang sudah ada). */
  onContinueToDed?: () => void;
  /** Pertanyaan awal mode Tanya Dokumen (diangkat ke view). */
  initialQuestion: string;
  onInitialQuestionChange: (q: string) => void;
  /** Dokumen pembanding awal mode Bandingkan (diangkat ke view). */
  initialCompareId: string;
  onInitialCompareIdChange: (id: string) => void;
  /**
   * Jalankan analisis dari tombol utama: membuka workspace DENGAN
   * auto-run satu kali. Bila tidak diberikan, tombol memakai onAnalyze
   * (buka workspace tanpa menjalankan).
   */
  onRunAnalysis?: (doc: DocRecord) => void;
}> = ({
  docs, onUpsertDoc, onRemoveDoc, onAnalyze,
  initialMode, onInitialModeChange, afterAnalysis, onAfterAnalysisChange, onContinueToDed,
  initialQuestion, onInitialQuestionChange, initialCompareId, onInitialCompareIdChange, onRunAnalysis,
}) => {
  const { t, lang, setLang } = useI18n();
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  // Dokumen terpilih untuk panel & tombol utama: pertahankan pilihan user
  // selama masih ada; bila belum ada, pilih dokumen siap pertama.
  const selectedDoc = useMemo(
    () => docs.find((d) => d.id === selectedId) ?? null,
    [docs, selectedId],
  );
  useEffect(() => {
    if (docs.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!selectedDoc) {
      const first = docs.find((d) => d.status === 'ready') ?? docs[0];
      setSelectedId(first.id);
    }
  }, [docs, selectedDoc, selectedId]);

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
      setSelectedId(id);
      setBusy(true);
      try {
        const buf = await f.arrayBuffer();
        const parsed = await parseDocument(buf, f.name, f.type);
        const updated: DocRecord = {
          ...rec,
          kind: parsed.kind, text: parsed.text, pages: parsed.pages,
          sourcePages: parsed.pagesTruncated ? parsed.sourcePageCount : undefined,
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

  const modeTabs = getTabs(t);
  const activeModeLabel = modeTabs.find((m) => m.id === initialMode)?.label ?? '';
  const canAnalyze = !!selectedDoc && selectedDoc.status === 'ready' && !busy;
  // Dokumen pembanding: yang siap dianalisis, selain dokumen terpilih.
  const compareOptions = useMemo(
    () => docs.filter((d) => d.status === 'ready' && d.id !== selectedDoc?.id),
    [docs, selectedDoc?.id],
  );
  // Bersihkan pembanding yang tidak lagi valid (dihapus / bukan ready /
  // menjadi dokumen terpilih).
  useEffect(() => {
    if (initialCompareId && !compareOptions.some((d) => d.id === initialCompareId)) {
      onInitialCompareIdChange('');
    }
  }, [initialCompareId, compareOptions, onInitialCompareIdChange]);
  // Tombol "Jalankan {Mode}" mensyaratkan masukan tiap mode: pertanyaan
  // untuk Tanya Dokumen, pembanding untuk Bandingkan.
  const runReady = canAnalyze
    && (initialMode !== 'qa' || initialQuestion.trim().length > 0)
    && (initialMode !== 'compare' || !!initialCompareId);
  const handlePrimary = () => {
    if (!selectedDoc) return;
    if (afterAnalysis === 'ded' && onContinueToDed) {
      if (canAnalyze) onContinueToDed();
      return;
    }
    if (!runReady) return;
    if (onRunAnalysis) onRunAnalysis(selectedDoc);
    else onAnalyze(selectedDoc);
  };

  const kindChips: Array<{ value: string; label: string }> = [
    { value: 'all', label: t('ai.doc.lib.opt_all') },
    { value: 'pdf', label: 'PDF' },
    { value: 'docx', label: 'DOCX' },
    { value: 'xlsx', label: 'XLSX' },
    { value: 'text', label: t('ai.doc.lib.opt_text') },
  ];
  // Bahasa: dua pilihan mockup (Indonesia/English) + bahasa aktif lain
  // (zh/ms) bila sedang dipakai agar keadaan aktif selalu terwakili.
  const langChips = LANG_OPTIONS.filter(
    (o) => o.id === 'id' || o.id === 'en' || o.id === lang,
  );

  return (
    <div className="docai-tab docai-lib">
      <div className="docai-lib-layout">
        {/* ================= Kolom utama: upload + daftar ================= */}
        <div className="docai-lib-main">
          <div className="docai-lib-stats">
            {[
              { label: t('ai.doc.lib.stat_total'), value: stats.total },
              { label: t('ai.doc.lib.stat_ready'), value: stats.ready },
              { label: t('ai.doc.lib.stat_processing'), value: stats.processing },
              { label: t('ai.doc.lib.stat_attention'), value: stats.attention },
            ].map((s) => (
              <div key={s.label} className="docai-lib-stat">
                <b>{s.value}</b> {s.label}
              </div>
            ))}
          </div>

          <div className="docai-lib-upload">
            <div className="docai-lib-upload-head">
              <h3>{t('ai.doc.lib.h2')} — {t('ai.doc.lib.upload_suffix')}</h3>
              <p>{t('ai.doc.lib.empty_p_none')}</p>
            </div>
            <div
              className={`docai-drop ${dragOver ? 'over' : ''}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
            >
              <div className="big-ico"><UploadCloud size={26} /></div>
              <p className="docai-drop-title">{t('ai.doc.lib.drop_title')}</p>
              <p className="docai-drop-sub">
                {t('ai.doc.lib.drop_sub')}
              </p>
              <div className="docai-drop-badges">
                <span>PDF</span><span>DOCX</span><span>XLSX</span><span>TXT · CSV</span><span>{t('ai.doc.lib.max_a')} {MAX_FILE_MB} MB / file</span>
              </div>
              <button
                type="button"
                className="docai-btn-primary"
                disabled={busy}
                onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
              >
                {busy ? <Loader2 size={16} className="spin" /> : <UploadCloud size={16} />} {t('ai.doc.lib.upload')}
              </button>
              <input
                ref={inputRef} type="file" multiple style={{ display: 'none' }}
                accept=".pdf,.docx,.doc,.xlsx,.xls,.txt,.csv"
                onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
              />
            </div>
            {error && <div className="docai-error"><AlertTriangle size={15} /> {error}</div>}
            {selectedDoc && (
              <div className="docai-lib-selected">
                {kindIcon(selectedDoc.kind)}
                <div className="docai-lib-selected-info">
                  <div className="docai-lib-selected-name">{selectedDoc.fileName}</div>
                  <div className="docai-lib-selected-meta">
                    {selectedDoc.pages ? `${selectedDoc.pages} ${t('ai.doc.lib.pages_suffix')} · ` : ''}{formatBytes(selectedDoc.sizeBytes)} · {statusText(selectedDoc.status, t)}
                  </div>
                </div>
                {statusBadge(selectedDoc.status, t)}
              </div>
            )}
            <p className="docai-note">{t('ai.doc.lib.note')}</p>
          </div>

          <div className="docai-lib-list">
            <div className="docai-toolbar">
              <div className="docai-search">
                <Search size={15} color="var(--ez-color-text-muted)" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('ai.doc.lib.search_ph')} />
              </div>
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
              <div className="docai-tablewrap docai-lib-tablewrap">
                <table className="docai-table">
                  <thead>
                    <tr><th>{t('ai.doc.lib.th_name')}</th><th>{t('ai.doc.lib.th_kind')}</th><th>{t('ai.doc.lib.th_size')}</th><th>{t('ai.doc.lib.th_status')}</th><th>{t('ai.doc.lib.th_updated')}</th><th>{t('ai.doc.lib.th_action')}</th></tr>
                  </thead>
                  <tbody>
                    {filtered.map((d) => (
                      <tr
                        key={d.id}
                        className={selectedDoc?.id === d.id ? 'docai-row-selected' : ''}
                        onClick={() => setSelectedId(d.id)}
                      >
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
                            <button className="docai-btn-analyze" title={t('ai.doc.lib.title_analyze')} disabled={d.status !== 'ready'} onClick={(e) => { e.stopPropagation(); onAnalyze(d); }}><FileSearch size={15} /> {t('ai.doc.lib.title_analyze')}</button>
                            <button title={t('ai.doc.lib.title_download')} onClick={(e) => { e.stopPropagation(); handleDownload(d); }}><Download size={15} /></button>
                            {confirmDelete === d.id ? (
                              <>
                                <button title={t('ai.doc.lib.title_cancel')} onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }}><X size={15} /></button>
                                <button title={t('ai.doc.lib.title_confirm_del')} className="danger" onClick={(e) => { e.stopPropagation(); onRemoveDoc(d.id); setConfirmDelete(null); }}>{t('ai.doc.lib.title_delete_q')}</button>
                              </>
                            ) : (
                              <button title={t('ai.doc.lib.title_delete')} onClick={(e) => { e.stopPropagation(); setConfirmDelete(d.id); }}><Trash2 size={15} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ================= Panel Pengaturan Dokumen (pinggir kanan) ================= */}
        <aside className="docai-settings" aria-label={t('ai.doc.lib.settings_aria')}>
          <div className="docai-settings-scroll">
            <div className="docai-settings-head">
              <h2><span className="ico"><Settings2 size={18} /></span> {t('ai.doc.lib.settings_title')}</h2>
              <p>{t('ai.doc.lib.settings_sub')}</p>
            </div>

            <section className="docai-set-sec">
              <h3>{t('ai.doc.lib.mode_title')}</h3>
              <div className="docai-modecards">
                {modeTabs.map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`docai-modecard ${initialMode === m.id ? 'active' : ''}`}
                      onClick={() => onInitialModeChange(m.id)}
                      aria-pressed={initialMode === m.id}
                    >
                      <span className="docai-modecard-top"><Icon size={15} /> {m.label}</span>
                      <span className="docai-modecard-hint">{t('ai.doc.lib.mode_desc_' + m.id)}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {initialMode === 'qa' && (
              <section className="docai-set-sec">
                <h3>{t('ai.doc.lib.question_title')}</h3>
                <input
                  className="docai-input"
                  style={{ marginBottom: 0 }}
                  value={initialQuestion}
                  onChange={(e) => onInitialQuestionChange(e.target.value)}
                  placeholder={t('ai.doc.ana.qa_ph')}
                  aria-label={t('ai.doc.lib.question_label')}
                />
                <p className="docai-set-sub">{t('ai.doc.lib.question_sub')}</p>
              </section>
            )}

            {initialMode === 'compare' && (
              <section className="docai-set-sec">
                <h3>{t('ai.doc.lib.compare_title')}</h3>
                <select
                  value={initialCompareId}
                  onChange={(e) => onInitialCompareIdChange(e.target.value)}
                  className="docai-select docai-full"
                  aria-label={t('ai.doc.lib.compare_label')}
                >
                  <option value="">{t('ai.doc.ana.compare_pick')}</option>
                  {compareOptions.map((o) => <option key={o.id} value={o.id}>{o.fileName}</option>)}
                </select>
                <p className="docai-set-sub">{t('ai.doc.lib.compare_sub')}</p>
              </section>
            )}

            {/* Draft & Terjemah BUKAN mode analisis — keduanya jalur Studio
                (keputusan mockup v2.3 §6 / keputusan 11). */}
            <div className="docai-routing-note">
              {t('ai.doc.lib.routing_a')} <strong>{t('ai.doc.create.mode_ai')}</strong>{t('ai.doc.lib.routing_b')}<strong>{t('ai.doc.create.periksa_title')}</strong>{t('ai.doc.lib.routing_c')}
            </div>

            <section className="docai-set-sec">
              <h3>{t('ai.doc.lib.kind_title')}</h3>
              <div className="docai-modechips">
                {kindChips.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className={`docai-modechip ${kindFilter === c.value ? 'active' : ''}`}
                    onClick={() => setKindFilter(c.value)}
                    aria-pressed={kindFilter === c.value}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <p className="docai-set-sub">{t('ai.doc.lib.kind_sub')}</p>
            </section>

            <section className="docai-set-sec">
              <h3>{t('ai.doc.lib.lang_title')}</h3>
              <div className="docai-seg2">
                {langChips.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={lang === o.id ? 'active' : ''}
                    onClick={() => setLang(o.id as Lang)}
                    aria-pressed={lang === o.id}
                  >
                    {o.id === 'id' ? t('ai.doc.lib.lang_id') : o.nativeName}
                  </button>
                ))}
              </div>
              <p className="docai-set-sub">{t('ai.doc.lib.lang_sub')}</p>
            </section>

            <section className="docai-set-sec">
              <h3>{t('ai.doc.lib.after_title')}</h3>
              <div className="docai-seg2">
                <button
                  type="button"
                  className={afterAnalysis === 'hasil' ? 'active' : ''}
                  onClick={() => onAfterAnalysisChange('hasil')}
                  aria-pressed={afterAnalysis === 'hasil'}
                >
                  {t('ai.doc.lib.after_result')}
                </button>
                <button
                  type="button"
                  className={afterAnalysis === 'ded' ? 'active' : ''}
                  onClick={() => onAfterAnalysisChange('ded')}
                  aria-pressed={afterAnalysis === 'ded'}
                  disabled={!onContinueToDed}
                >
                  {t('ai.doc.lib.after_ded')}
                </button>
              </div>
              <p className="docai-set-sub">
                {afterAnalysis === 'ded'
                  ? t('ai.doc.lib.after_ded_sub')
                  : t('ai.doc.lib.after_result_sub')}
              </p>
            </section>

            {selectedDoc && (
              <section className="docai-set-sec">
                <h3>{t('ai.doc.lib.selected_title')}</h3>
                <div className="docai-set-rows">
                  <div><span>{t('ai.doc.lib.row_name')}</span><b>{selectedDoc.fileName}</b></div>
                  <div><span>{t('ai.doc.lib.th_kind')}</span><b style={{ textTransform: 'uppercase' }}>{selectedDoc.kind}</b></div>
                  <div><span>{t('ai.doc.lib.th_size')}</span><b>{formatBytes(selectedDoc.sizeBytes)}</b></div>
                  {selectedDoc.pages ? <div><span>{t('ai.doc.lib.row_pages')}</span><b>{selectedDoc.pages}</b></div> : null}
                  <div><span>{t('ai.doc.lib.th_status')}</span><b>{statusText(selectedDoc.status, t)}</b></div>
                </div>
              </section>
            )}
          </div>

          {/* ---- CTA utama menempel di bawah panel (mockup ter-ACC) ---- */}
          <div className="docai-settings-foot">
            <button
              type="button"
              className="docai-btn-primary docai-settings-cta"
              disabled={afterAnalysis === 'ded' ? !canAnalyze : !runReady}
              onClick={handlePrimary}
            >
              <FileSearch size={17} /> {afterAnalysis === 'ded' ? t('ai.doc.lib.after_ded') : `${t('ai.doc.ana.run_a')} ${activeModeLabel}`}
            </button>
            <p className="docai-settings-hint">
              {!selectedDoc
                ? t('ai.doc.lib.hint_pick')
                : afterAnalysis === 'ded'
                  ? t('ai.doc.lib.hint_ded')
                  : initialMode === 'qa' && !initialQuestion.trim()
                    ? t('ai.doc.lib.hint_question')
                    : initialMode === 'compare' && !initialCompareId
                      ? t('ai.doc.ana.err_compare_first')
                      : `${t('ai.doc.lib.hint_ready_a')}${activeModeLabel}${t('ai.doc.lib.hint_ready_b')}`}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
};

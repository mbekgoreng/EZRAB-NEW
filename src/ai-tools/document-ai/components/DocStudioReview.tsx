/**
 * AI DOCUMENT STUDIO — Panel "Edit & Periksa" (Review, Revisi, Versi).
 *
 * - Review: REVIEW_DOCUMENT pada orchestrator = pemeriksaan DETERMINISTIK
 *   (review.ts) atas isi editor saat ini. Bukan penilaian AI bebas dan BUKAN
 *   penilaian kepatuhan hukum — label di panel menyatakannya apa adanya.
 * - Revisi (per temuan atau bebas): REVISE_DOCUMENT hanya menghasilkan
 *   KANDIDAT. Kandidat ditampilkan sebagai pratinjau teks; dokumen berubah
 *   HANYA bila pengguna menekan Terapkan — pemanggil (DocCreator) menyimpan
 *   isi berjalan sebagai versi (pushVersion origin 'revise') sebelum menimpa.
 * - Versi: daftar DraftRecord.versions + pulihkan (restoreVersion di
 *   pemanggil; isi berjalan ter-snapshot otomatis) + bandingkan dua teks via
 *   COMPARE_DOCUMENTS (ringkasan deterministik per baris).
 *
 * Status temuan (open/fixed/ignored/checked) hidup di state komponen ini,
 * per draf aktif; menjalankan Periksa ulang mempertahankan status temuan
 * dengan id yang sama.
 */
import React, { useEffect, useState } from 'react';
import {
  ClipboardCheck, Loader2, Wand2, EyeOff, CheckCheck, Crosshair,
  History as HistoryIcon, RotateCcw, GitCompare, X, Check,
} from 'lucide-react';
import type { Editor } from '@tiptap/react';
import { documentStudioOrchestrator } from '../orchestrator';
import type { DocumentComparison, ReviewFinding } from '../types';
import type { DocTemplateMeta } from '../docTemplates';
import { draftFormat, toPlainText } from '../richText';
import { formatDate, type DraftRecord } from '../view';

const SEVERITY_LABEL: Record<ReviewFinding['severity'], string> = {
  high: 'Tinggi',
  medium: 'Sedang',
  low: 'Rendah',
};

const VERSION_ORIGIN_LABEL: Record<string, string> = {
  generate: 'Buat ulang AI',
  revise: 'Revisi AI',
  manual: 'Simpan manual',
  restore: 'Snapshot sebelum pulihkan',
};

interface Candidate {
  /** Teks polos kandidat dari orchestrator (belum diterapkan). */
  text: string;
  sourceLabel: string;
  findingId?: string;
}

export const DocStudioReview: React.FC<{
  draft: DraftRecord;
  /** Isi editor saat ini (HTML) — sumber kebenaran untuk review/revisi/banding. */
  html: string;
  templateMeta?: DocTemplateMeta;
  getEditor: () => Editor | null;
  /** Terapkan kandidat revisi: pemanggil men-snapshot versi dulu, lalu menimpa isi editor + persist. */
  onApplyCandidate: (candidatePlain: string, note: string) => Promise<void>;
  /** Pulihkan versi: pemanggil memakai restoreVersion (isi berjalan ter-snapshot otomatis). */
  onRestoreVersion: (versionId: string) => Promise<void>;
}> = ({ draft, html, templateMeta, getEditor, onApplyCandidate, onRestoreVersion }) => {
  const [findings, setFindings] = useState<ReviewFinding[] | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [fixBusyId, setFixBusyId] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [candidateBusy, setCandidateBusy] = useState(false);
  const [reviseText, setReviseText] = useState('');
  const [reviseBusy, setReviseBusy] = useState(false);
  const [jumpNote, setJumpNote] = useState<string | null>(null);
  const [compareVersionId, setCompareVersionId] = useState('');
  const [comparison, setComparison] = useState<DocumentComparison | null>(null);
  const [compareBusy, setCompareBusy] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  // Panel selalu menempel pada SATU draf aktif; ganti draf = state bersih.
  useEffect(() => {
    setFindings(null);
    setReviewError(null);
    setCandidate(null);
    setReviseText('');
    setJumpNote(null);
    setComparison(null);
    setCompareError(null);
    setCompareVersionId('');
  }, [draft.id]);

  const currentPlain = () => toPlainText(html, 'html');

  const setFindingStatus = (id: string, status: ReviewFinding['status']) =>
    setFindings((prev) => (prev ? prev.map((f) => (f.id === id ? { ...f, status } : f)) : prev));

  /* ---------------- review deterministik ---------------- */

  const runReview = async () => {
    setReviewBusy(true);
    setReviewError(null);
    setJumpNote(null);
    try {
      const res = await documentStudioOrchestrator.handle({
        intent: 'REVIEW_DOCUMENT',
        documentText: currentPlain(),
        templateMeta,
        fileName: draft.title,
      });
      if (!res.success) {
        setReviewError(`${res.errorCode || 'ERROR'}: ${res.message || 'Pemeriksaan gagal.'}`);
        return;
      }
      const prevStatus = new Map((findings ?? []).map((f) => [f.id, f.status]));
      setFindings(
        (res.findings ?? []).map((f) => ({ ...f, status: prevStatus.get(f.id) ?? f.status })),
      );
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : 'Pemeriksaan gagal.');
    } finally {
      setReviewBusy(false);
    }
  };

  /* ---------------- revisi AI (kandidat) ---------------- */

  const requestRevision = async (instruction: string, sourceLabel: string, findingId?: string) => {
    const res = await documentStudioOrchestrator.handle({
      intent: 'REVISE_DOCUMENT',
      documentText: currentPlain(),
      instruction,
      fileName: draft.title,
    });
    if (!res.success) {
      setReviewError(`${res.errorCode || 'ERROR'}: ${res.message || 'Revisi gagal.'}`);
      return;
    }
    setCandidate({ text: res.content || '', sourceLabel, findingId });
  };

  const fixFinding = async (f: ReviewFinding) => {
    setFixBusyId(f.id);
    setReviewError(null);
    try {
      await requestRevision(
        `${f.suggestion} Konteks temuan: ${f.description}${f.location ? ` Lokasi: ${f.location}.` : ''}`,
        `Perbaikan temuan: ${f.description}`,
        f.id,
      );
    } finally {
      setFixBusyId(null);
    }
  };

  const runFreeRevise = async () => {
    if (!reviseText.trim()) return;
    setReviseBusy(true);
    setReviewError(null);
    try {
      await requestRevision(reviseText.trim(), `Revisi: ${reviseText.trim().slice(0, 80)}`);
    } finally {
      setReviseBusy(false);
    }
  };

  const applyCandidate = async () => {
    if (!candidate) return;
    setCandidateBusy(true);
    try {
      await onApplyCandidate(candidate.text, candidate.sourceLabel);
      if (candidate.findingId) setFindingStatus(candidate.findingId, 'fixed');
      setCandidate(null);
      setReviseText('');
    } finally {
      setCandidateBusy(false);
    }
  };

  /* ---------------- buka bagian ---------------- */

  const jumpToFinding = (f: ReviewFinding) => {
    setJumpNote(null);
    const ed = getEditor();
    const needle = (f.location || '').trim();
    if (!ed || !needle) {
      setJumpNote('Lokasi temuan ini tidak memiliki teks penanda yang dapat dicari di dokumen.');
      return;
    }
    const blocks = ed.view.dom.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, td, th');
    const probes = [needle, needle.replace(/[[\]]/g, '').slice(0, 60), needle.slice(0, 40)];
    let target: HTMLElement | undefined;
    for (const el of Array.from(blocks)) {
      const text = el.textContent || '';
      if (probes.some((p) => p && text.includes(p))) {
        target = el as HTMLElement;
        break;
      }
    }
    if (!target) {
      setJumpNote(
        `Lokasi "${needle.slice(0, 60)}" tidak ditemukan persis di dokumen saat ini — kemungkinan sudah diubah atau dihapus.`,
      );
      return;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    try {
      const pos = ed.view.posAtDOM(target, 0);
      ed.chain().focus().setTextSelection(pos).run();
    } catch {
      /* posisi kursor tidak kritis */
    }
  };

  /* ---------------- bandingkan versi ---------------- */

  const versions = draft.versions ?? [];
  const compareTarget = versions.find((v) => v.id === compareVersionId);

  const runCompare = async () => {
    if (!compareTarget) return;
    setCompareBusy(true);
    setCompareError(null);
    try {
      const res = await documentStudioOrchestrator.handle({
        intent: 'COMPARE_DOCUMENTS',
        documentText: currentPlain(),
        secondDocumentText: toPlainText(compareTarget.content, draftFormat(compareTarget)),
        fileName: draft.title,
      });
      if (!res.success) {
        setCompareError(`${res.errorCode || 'ERROR'}: ${res.message || 'Perbandingan gagal.'}`);
        return;
      }
      setComparison(res.comparison ?? null);
    } catch (e) {
      setCompareError(e instanceof Error ? e.message : 'Perbandingan gagal.');
    } finally {
      setCompareBusy(false);
    }
  };

  const openCount = findings?.filter((f) => f.status === 'open').length ?? 0;
  const snapshot = draft.contextSnapshot;

  return (
    <section className="docai-studio" aria-label="Edit dan Periksa">
      <div className="docai-studio-head">
        <div>
          <div className="docai-studio-t">
            <ClipboardCheck size={16} /> Edit &amp; Periksa
          </div>
          <p className="docai-studio-sub">
            Pemeriksaan kelengkapan internal — bukan penilaian kepatuhan hukum. Revisi AI selalu berupa
            kandidat: dokumen hanya berubah bila Anda menekan Terapkan, dan isi sebelumnya tersimpan
            sebagai versi.
          </p>
          {(draft.promptVersion || snapshot) && (
            <p className="docai-studio-sub">
              {draft.promptVersion && <>Versi prompt generate: {draft.promptVersion}. </>}
              {snapshot && (
                <>
                  Konteks saat draf dibuat: {snapshot.filter((f) => f.verificationStatus !== 'missing').length}{' '}
                  field tersedia, {snapshot.filter((f) => f.verificationStatus === 'missing').length} belum
                  tersedia.
                </>
              )}
            </p>
          )}
        </div>
        <button className="docai-btn-primary" onClick={() => void runReview()} disabled={reviewBusy}>
          {reviewBusy ? <Loader2 size={15} className="spin" /> : <ClipboardCheck size={15} />} Periksa Dokumen
        </button>
      </div>

      {reviewError && (
        <div className="docai-error" role="alert">
          {reviewError}
        </div>
      )}
      {jumpNote && <div className="docai-warn">{jumpNote}</div>}

      {findings !== null && (
        <div className="docai-findings">
          {findings.length === 0 ? (
            <p className="docai-hint" style={{ marginTop: 0 }}>
              Tidak ada temuan dari pemeriksaan deterministik ini. Ini bukan jaminan dokumen sempurna —
              tetap tinjau isi dokumen secara manual.
            </p>
          ) : (
            <>
              <div className="docai-step">
                {findings.length} temuan · {openCount} masih terbuka
              </div>
              {findings.map((f) => (
                <div key={f.id} className={`docai-finding sev-${f.severity} st-${f.status}`}>
                  <div className="docai-finding-main">
                    <div className="docai-finding-tags">
                      <span className={`docai-sev sev-${f.severity}`}>{SEVERITY_LABEL[f.severity]}</span>
                      <span className="docai-finding-status">
                        {f.status === 'open' && 'Terbuka'}
                        {f.status === 'fixed' && 'Sudah diperbaiki'}
                        {f.status === 'ignored' && 'Diabaikan'}
                        {f.status === 'checked' && 'Sudah diperiksa'}
                      </span>
                    </div>
                    <div className="docai-finding-desc">{f.description}</div>
                    {f.location && <div className="docai-finding-loc">Lokasi: {f.location}</div>}
                    <div className="docai-finding-why">Alasan: {f.reason}</div>
                    <div className="docai-finding-sug">Saran: {f.suggestion}</div>
                  </div>
                  <div className="docai-finding-actions">
                    <button
                      className="docai-btn-ghost docai-mini"
                      onClick={() => void fixFinding(f)}
                      disabled={fixBusyId !== null || f.status === 'fixed'}
                    >
                      {fixBusyId === f.id ? <Loader2 size={13} className="spin" /> : <Wand2 size={13} />}{' '}
                      Perbaiki dengan AI
                    </button>
                    <button className="docai-btn-ghost docai-mini" onClick={() => jumpToFinding(f)}>
                      <Crosshair size={13} /> Buka bagian
                    </button>
                    <button
                      className="docai-btn-ghost docai-mini"
                      onClick={() => setFindingStatus(f.id, 'ignored')}
                      disabled={f.status === 'ignored'}
                    >
                      <EyeOff size={13} /> Abaikan
                    </button>
                    <button
                      className="docai-btn-ghost docai-mini"
                      onClick={() => setFindingStatus(f.id, 'checked')}
                      disabled={f.status === 'checked'}
                    >
                      <CheckCheck size={13} /> Tandai diperiksa
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      <div className="docai-revisebox">
        <div className="docai-step">Revisi dengan bahasa alami</div>
        <div className="docai-reviserow">
          <textarea
            className="docai-textarea"
            style={{ marginBottom: 0 }}
            rows={2}
            value={reviseText}
            onChange={(e) => setReviseText(e.target.value)}
            placeholder="mis. Buat bahasa lebih formal; ringkas bagian pendahuluan; tambahkan tabel pemeriksaan."
          />
          <button
            className="docai-btn-ghost"
            onClick={() => void runFreeRevise()}
            disabled={reviseBusy || !reviseText.trim()}
          >
            {reviseBusy ? <Loader2 size={14} className="spin" /> : <Wand2 size={14} />} Buat Kandidat Revisi
          </button>
        </div>
      </div>

      {candidate && (
        <div className="docai-candidate" role="dialog" aria-label="Pratinjau kandidat revisi">
          <div className="docai-candidate-head">
            <strong>Kandidat revisi — belum diterapkan</strong>
            <span>{candidate.sourceLabel}</span>
          </div>
          <pre className="docai-candidate-body">{candidate.text}</pre>
          <p className="docai-hint" style={{ marginTop: 0 }}>
            Kandidat adalah teks polos hasil AI; menerapkan akan mengganti isi editor (format kaya seperti
            bold/tabel dari kandidat tidak dipertahankan) setelah isi saat ini disimpan sebagai versi.
          </p>
          <div className="docai-btnrow">
            <button className="docai-btn-primary" onClick={() => void applyCandidate()} disabled={candidateBusy}>
              {candidateBusy ? <Loader2 size={14} className="spin" /> : <Check size={14} />} Terapkan Revisi
            </button>
            <button className="docai-btn-ghost" onClick={() => setCandidate(null)} disabled={candidateBusy}>
              <X size={14} /> Batal
            </button>
          </div>
        </div>
      )}

      <div className="docai-versionbox">
        <div className="docai-step">
          <HistoryIcon size={13} style={{ verticalAlign: -2 }} /> Riwayat Versi (tersimpan lokal di perangkat ini)
        </div>
        {versions.length === 0 ? (
          <p className="docai-hint" style={{ marginTop: 0 }}>
            Belum ada riwayat versi. Versi dibuat otomatis sebelum buat ulang AI, sebelum revisi AI
            diterapkan, dan sebelum pemulihan versi.
          </p>
        ) : (
          <>
            <div className="docai-versionlist">
              {[...versions].reverse().map((v) => (
                <div key={v.id} className="docai-versionrow">
                  <div className="docai-versionmain">
                    <strong>{VERSION_ORIGIN_LABEL[v.origin] ?? v.origin}</strong>
                    <span>
                      {formatDate(v.createdAt)} ·{' '}
                      {new Date(v.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      {v.note ? ` · ${v.note}` : ''}
                    </span>
                  </div>
                  <button className="docai-btn-ghost docai-mini" onClick={() => void onRestoreVersion(v.id)}>
                    <RotateCcw size={13} /> Pulihkan
                  </button>
                </div>
              ))}
            </div>
            <div className="docai-reviserow" style={{ marginTop: 10 }}>
              <select
                className="docai-select"
                style={{ flex: 1 }}
                value={compareVersionId}
                onChange={(e) => {
                  setCompareVersionId(e.target.value);
                  setComparison(null);
                }}
                aria-label="Pilih versi untuk dibandingkan"
              >
                <option value="">— Pilih versi untuk dibandingkan dengan isi saat ini —</option>
                {[...versions].reverse().map((v) => (
                  <option key={v.id} value={v.id}>
                    {VERSION_ORIGIN_LABEL[v.origin] ?? v.origin} · {formatDate(v.createdAt)}{' '}
                    {new Date(v.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </option>
                ))}
              </select>
              <button
                className="docai-btn-ghost"
                onClick={() => void runCompare()}
                disabled={!compareVersionId || compareBusy}
              >
                {compareBusy ? <Loader2 size={14} className="spin" /> : <GitCompare size={14} />} Bandingkan
              </button>
            </div>
            {compareError && <div className="docai-error">{compareError}</div>}
            {comparison && (
              <div className="docai-comparebox">
                <p>{comparison.summaryText}</p>
                <div className="docai-comparecols">
                  <div>
                    <strong>Hanya di versi terpilih ({comparison.addedLines})</strong>
                    {comparison.addedSamples.length === 0 ? (
                      <p className="docai-hint">Tidak ada contoh baris.</p>
                    ) : (
                      <ul>
                        {comparison.addedSamples.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <strong>Hanya di isi saat ini ({comparison.removedLines})</strong>
                    {comparison.removedSamples.length === 0 ? (
                      <p className="docai-hint">Tidak ada contoh baris.</p>
                    ) : (
                      <ul>
                        {comparison.removedSamples.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
};

export default DocStudioReview;

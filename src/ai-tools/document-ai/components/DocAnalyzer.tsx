/**
 * AI DOKUMEN — Analisis Dokumen (contextual workspace).
 * Dibuka dari Dokumen Saya untuk satu dokumen. Panel analisis kontekstual,
 * bukan chat permanen. Floating assistant global sudah disembunyikan di
 * menu ini oleh WorkspaceView (single-mascot rule).
 *
 * Tanpa batas pemrosesan (2026-11-19):
 * - Tab "Kelengkapan" memakai mode CHECKLIST service yang sebenarnya
 *   (adaptasi CHAT lama DIHAPUS).
 * - COMPARE memakai dokumenAiService.compareDocuments — kedua dokumen
 *   dibandingkan UTUH (per potongan, lalu reduce); anggaran 140.000
 *   karakter dibagi dua + pemotongan per dokumen lama DIHAPUS.
 * - QA meneruskan riwayat percakapan (history) ke service agar pertanyaan
 *   lanjutan tetap kontekstual; service membatasinya ke 6 turn terakhir.
 * - Hasil analisis & jawaban QA dirender TERFORMAT dari markdown AI lewat
 *   markdownToHtml (escape-first) — bukan lagi teks polos mentah.
 *
 * Layar input/proses/hasil mockup v2.3 (ACC owner 2026-11-19):
 * - INPUT: workspace dibuka dari Dokumen Saya; tombol "Jalankan {Mode}"
 *   di sana (DocLibrary) membuka workspace ini DENGAN auto-run satu kali
 *   (prop runRequest). Pertanyaan / dokumen pembanding yang dipilih di
 *   sana diteruskan lewat initialQuestion / initialCompareId.
 * - PROSES: selama run berjalan (di luar QA), panel menampilkan layar
 *   proses map-reduce — spinner + % besar + progress bar + waktu jalan +
 *   tombol Batalkan. Persen memakai kemajuan NYATA (potongan selesai /
 *   total potongan) dari callback onProgress service; jalur panggilan
 *   tunggal menampilkan spinner + status tanpa angka palsu.
 *   Pembatalan bersifat level UI: run ditandai usang sehingga hasilnya
 *   dibuang bila datang belakangan; panggilan provider yang sedang
 *   berjalan tidak dibatalkan (service tidak punya seam AbortSignal).
 * - HASIL: hasil disimpan PER MODE — tab mode berfungsi sekaligus sebagai
 *   tab hasil; berpindah tab tidak lagi menghapus hasil mode lain.
 *   Baris cakupan tampil SATU kali dari objek coverage service
 *   (formatCoverageLine); baris cakupan yang dilekatkan service ke akhir
 *   teks balasan dipotong (stripCoverageLine) agar tidak ganda.
 *   Nomor halaman sumber TIDAK pernah ditambahkan UI — yang tampil hanya
 *   referensi halaman yang ditulis model di dalam teks jawabannya.
 * - QA tetap percakapan inline (gelembung chat + indikator sibuk), bukan
 *   layar proses penuh — pertanyaan adalah satu panggilan retrieval,
 *   bukan map-reduce, dan riwayat chat harus tetap terlihat.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Loader2, Send, BookOpen, MessageCircle, Table2,
  GitCompare, ClipboardCheck, Copy, Check, AlertTriangle, ChevronLeft, ChevronRight, Lock,
  X, FileText, Info,
} from 'lucide-react';
import { dokumenAiService, formatCoverageLine, stripCoverageLine } from '../service';
import type { DocAiProgressEvent } from '../service';
import {
  cancelDocAiAnalysis,
  consumeDocAiAnalysisRun,
  failDocAiAnalysis,
  finishDocAiAnalysis,
  getDocAiAnalysisRun,
  isDocAiAnalysisActive,
  patchDocAiAnalysisProgress,
  recordHistoryDurable,
  startDocAiAnalysis,
  subscribeDocAiAnalysis,
  type DocAiAnalysisRun,
} from '../docAiRunStore';
import type { DocCoverageInfo, DokumenAiChatResponse } from '../types';
import { markdownToHtml } from '../markdownHtml';
import type { DocRecord, ChatMessage, HistoryEntry, HistoryType } from '../view';
import { useI18n } from '../../../i18n/I18nContext';
import '../../../ai-credits/ai-credits.css';
import { useCreditSimulation } from '../../../ai-credits/useCreditSimulation';
import { aiFeatureLockedMessage, planAllowsAiFeature } from '../../../ai-credits/featureGate';
import { tariffFor } from '../../../ai-credits/config';
import { CreditBalance } from '../../../ai-credits/components/CreditBalance';
import { CreditEstimateBadge } from '../../../ai-credits/components/CreditEstimateBadge';

/** Mode yang didukung service cabang ini. */
type SvcMode = 'SUMMARY' | 'QA' | 'EXTRACT' | 'COMPARE' | 'CHAT' | 'CHECKLIST';

export type AnaTab = 'summary' | 'qa' | 'extract' | 'compare' | 'checklist';

/** Kategori estimasi kredit per tab analisis (simulasi). */
const TAB_CREDIT_CATEGORY: Record<AnaTab, 'simple' | 'complex'> = {
  summary: 'simple',
  qa: 'simple',
  extract: 'complex',
  compare: 'complex',
  checklist: 'complex',
};

export const getTabs = (
  t: (key: string) => string,
): Array<{ id: AnaTab; label: string; icon: any }> => [
  { id: 'summary', label: t('ai.doc.ana.tab_summary'), icon: BookOpen },
  { id: 'qa', label: t('ai.doc.ana.tab_qa'), icon: MessageCircle },
  { id: 'extract', label: t('ai.doc.ana.tab_extract'), icon: Table2 },
  { id: 'compare', label: t('ai.doc.ana.tab_compare'), icon: GitCompare },
  { id: 'checklist', label: t('ai.doc.ana.tab_checklist'), icon: ClipboardCheck },
];

/* Tanpa batas pemrosesan (2026-11-19): Tab Kelengkapan memakai mode
   CHECKLIST service yang sebenarnya (adaptasi CHAT + CHECKLIST_PROMPT
   lama DIHAPUS); MAX_DOC_CHARS (140.000) DIHAPUS — COMPARE memakai
   compareDocuments dan membandingkan kedua dokumen secara utuh. */
const MODE_OF: Record<AnaTab, SvcMode> = {
  summary: 'SUMMARY', qa: 'QA', extract: 'EXTRACT', compare: 'COMPARE', checklist: 'CHECKLIST',
};

const HISTORY_TYPE_OF: Record<AnaTab, HistoryType> = {
  summary: 'summary', qa: 'qa', extract: 'extract', compare: 'compare', checklist: 'checklist',
};

/** Hasil satu mode analisis (disimpan per mode agar tab = tab hasil). */
interface ModeResult {
  /** Balasan AI — baris cakupan lampiran service SUDAH dipotong. */
  reply: string;
  coverage?: DocCoverageInfo;
  truncated: boolean;
}

/**
 * Permintaan jalankan-satu-kali dari layar input (Dokumen Saya).
 * `nonce` membedakan tiap klik "Jalankan {Mode}" — workspace hanya
 * menjalankan nonce yang belum pernah dikonsumsi mount ini.
 */
export interface DocAnalyzerRunRequest {
  nonce: number;
  tab: AnaTab;
  question?: string;
  compareId?: string;
}

function splitPages(text: string): string[] {
  const parts = text.split(/\[Halaman (\d+)\]/g);
  // parts: ["", "1", "teks1", "2", "teks2", ...]
  const out: string[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    out.push(`[Halaman ${parts[i]}]\n${(parts[i + 1] || '').trim()}`);
  }
  return out.length ? out : [text];
}

function formatElapsed(totalSec: number): string {
  if (totalSec < 60) return `${totalSec} dtk`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m} mnt ${s} dtk`;
}

export const DocAnalyzer: React.FC<{
  doc: DocRecord;
  docs: DocRecord[];
  onBack: () => void;
  onAddHistory: (e: Omit<HistoryEntry, 'id' | 'at'>) => void;
  /** Mode analisis pertama yang dipilih dari panel Pengaturan Dokumen
      (Dokumen Saya, pola app shell 2026-11-10). Default: Ringkasan. */
  initialTab?: AnaTab;
  /** Pertanyaan awal dari layar input (mode Tanya Dokumen). */
  initialQuestion?: string;
  /** Dokumen pembanding awal dari layar input (mode Bandingkan). */
  initialCompareId?: string;
  /**
   * Permintaan auto-run satu kali dari tombol "Jalankan {Mode}" di
   * Dokumen Saya. null = buka workspace biasa tanpa menjalankan.
   */
  runRequest?: DocAnalyzerRunRequest | null;
}> = ({ doc, docs, onBack, onAddHistory, initialTab, initialQuestion, initialCompareId, runRequest }) => {
  const { t } = useI18n();
  const TABS = getTabs(t);
  const [tab, setTab] = useState<AnaTab>(initialTab ?? 'summary');
  const [pageIdx, setPageIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Hasil per mode — berpindah tab tidak menghapus hasil mode lain. */
  const [modeResults, setModeResults] = useState<Partial<Record<AnaTab, ModeResult>>>({});
  const [copied, setCopied] = useState(false);
  // --- Layar proses (map-reduce) ---
  const [progress, setProgress] = useState<DocAiProgressEvent | null>(null);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  /** Token run yang sedang berjalan — Batalkan menaikkan token sehingga
      hasil/callback run lama dibuang. */
  const runIdRef = useRef(0);
  /** requestId runtime (docAiRunStore) untuk lari milik mount ini —
      dipakai re-attach untuk melewati lari sendiri, dan cancelRun untuk
      membatalkan lari di runtime. */
  const ownAnalysisRunRef = useRef<number | null>(null);
  /** Nonce runRequest yang sudah dikonsumsi mount ini (anti double-run). */
  const consumedRunRef = useRef<number | null>(null);
  // QA chat
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState(initialQuestion ?? '');
  // Compare
  const [compareId, setCompareId] = useState(initialCompareId ?? '');
  const others = useMemo(
    () => docs.filter((d) => d.id !== doc.id && d.status === 'ready'),
    [docs, doc.id]
  );
  const chatEndRef = useRef<HTMLDivElement>(null);
  // --- AI Credits (simulasi frontend) ---
  const { consume, balance } = useCreditSimulation();
  // Gerbang paket (simulasi): AI Document tertutup untuk Free & Starter
  // (entitlement aiDocuments 'locked' di plans.ts — Keputusan Owner
  // 2026-11-07 / Amendemen v1.2). Analisis tidak boleh jalan sama sekali.
  const docAiAllowed = planAllowsAiFeature(balance.plan, 'ai-document');
  const docAiLockedMsg = aiFeatureLockedMessage(balance.plan, 'ai-document');
  const docEstimate = tariffFor(`ai-document/${TAB_CREDIT_CATEGORY[tab]}`);

  const pages = useMemo(() => splitPages(doc.text), [doc.text]);
  const currentResult = modeResults[tab];
  const tabLabel = TABS.find((tb) => tb.id === tab)?.label ?? '';

  const scrollChat = () => setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

  const recordHistory = (anaTab: AnaTab, reply: string, chatLog?: ChatMessage[]) => {
    const entry = {
      type: HISTORY_TYPE_OF[anaTab],
      docIds: [doc.id],
      docNames: [doc.fileName],
      title: `${TABS.find((t) => t.id === anaTab)?.label} — ${doc.fileName}`,
      resultPreview: reply.slice(0, 300),
      resultFull: reply,
      ...(chatLog ? { chat: chatLog } : {}),
    };
    onAddHistory(entry);
    // Riwayat juga ditulis LANGSUNG ke localStorage agar bertahan bila
    // komponen ter-unmount (pindah menu) sebelum efek tulis-ulang view
    // jalan — entri inilah satu-satunya salinan tahan-refresh dari hasil
    // analisis (modeResults hanya di memori).
    recordHistoryDurable(entry);
  };

  /** Penanganan hasil sukses bersama runMode + runCompare. */
  const handleSuccess = (anaTab: AnaTab, res: DokumenAiChatResponse) => {
    // Bila service menyertakan objek coverage, balasan juga membawa baris
    // cakupan yang dilekatkan di akhir teks (coverageLine) — potong agar
    // cakupan tampil SATU kali saja, lewat baris cakupan UI.
    const reply = res.coverage ? stripCoverageLine(res.reply || '') : (res.reply || '');
    setModeResults((prev) => ({
      ...prev,
      [anaTab]: { reply, coverage: res.coverage, truncated: !!res.truncated },
    }));
    // Hasil juga dicatat ke runtime agar mount kembali (sesudah pindah
    // menu) bisa me-attach ulang tanpa mengulang panggilan AI.
    if (ownAnalysisRunRef.current != null) {
      finishDocAiAnalysis(ownAnalysisRunRef.current, {
        reply, coverage: res.coverage, truncated: !!res.truncated,
      });
    }
    recordHistory(anaTab, reply);
    // --- AI Credits: catat pemakaian SIMULASI (kategori mode yang dijalankan) ---
    const estimate = tariffFor(`ai-document/${TAB_CREDIT_CATEGORY[anaTab]}`);
    consume('ai-document', estimate.max, `AI Document (${anaTab}): ${doc.fileName.slice(0, 50)}`);
  };

  /** Hapus hasil tersimpan satu mode (dipakai saat run-nya gagal agar
      hasil lama tidak tampil berdampingan dengan error baru). */
  const clearModeResult = (anaTab: AnaTab) => {
    setModeResults((prev) => {
      if (!prev[anaTab]) return prev;
      const next = { ...prev };
      delete next[anaTab];
      return next;
    });
  };

  /** Pembatalan level UI: run ditandai usang; hasil yang datang belakangan
      dibuang (cek runId). Panggilan provider yang sedang berjalan TIDAK
      dibatalkan — service tidak punya seam AbortSignal. */
  const cancelRun = () => {
    runIdRef.current += 1;
    // Batalkan juga di runtime agar mount kembali tidak me-attach ulang
    // ke lari yang sudah dibatalkan user.
    if (ownAnalysisRunRef.current != null) {
      cancelDocAiAnalysis(ownAnalysisRunRef.current);
      ownAnalysisRunRef.current = null;
    }
    setBusy(false);
    setProgress(null);
    setRunStartedAt(null);
    setElapsedSec(0);
  };

  const beginRun = (anaTab: AnaTab): number => {
    const myRun = runIdRef.current + 1;
    runIdRef.current = myRun;
    // Catat lari di runtime (docAiRunStore) agar bertahan melewati
    // pindah menu — mount kembali me-attach ulang ke lari ini.
    ownAnalysisRunRef.current = startDocAiAnalysis(doc.id, doc.fileName, anaTab).requestId;
    setBusy(true);
    setError(null);
    setProgress({ phase: 'single', done: 0, total: 0, percent: null, status: 'Menyiapkan analisis…' });
    setRunStartedAt(Date.now());
    setElapsedSec(0);
    return myRun;
  };

  const endRun = (myRun: number) => {
    if (runIdRef.current === myRun) {
      setBusy(false);
      setProgress(null);
      setRunStartedAt(null);
    }
  };

  const runMode = async (anaTab: AnaTab, prompt?: string) => {
    if (!docAiAllowed) { setError(docAiLockedMsg); return; }
    const mode = MODE_OF[anaTab];
    const myRun = beginRun(anaTab);
    const reqId = ownAnalysisRunRef.current;
    try {
      const res = await dokumenAiService.chat(
        {
          documentText: doc.text,
          fileName: doc.fileName,
          mode,
          prompt,
        },
        (ev) => {
          if (runIdRef.current !== myRun) return;
          setProgress(ev);
          // Progres juga ke runtime agar mount kembali melihat progres
          // live (bukan dari nol).
          if (reqId != null) patchDocAiAnalysisProgress(reqId, ev.percent, ev.status);
        },
      );
      if (runIdRef.current !== myRun) return; // dibatalkan — buang hasil
      if (res.success) {
        handleSuccess(anaTab, res);
      } else {
        clearModeResult(anaTab);
        const msg = `${res.errorCode || 'ERROR'}: ${res.message || t('ai.doc.err_failed')}`;
        if (reqId != null) failDocAiAnalysis(reqId, msg);
        setError(msg);
      }
    } catch (e: any) {
      if (runIdRef.current !== myRun) return;
      clearModeResult(anaTab);
      const msg = e?.message || t('ai.doc.err_unexpected');
      if (reqId != null) failDocAiAnalysis(reqId, msg);
      setError(msg);
    } finally {
      if (ownAnalysisRunRef.current === reqId) ownAnalysisRunRef.current = null;
      endRun(myRun);
    }
  };

  const askQuestion = async (qText?: string) => {
    const q = (qText ?? question).trim();
    if (!q || busy) return;
    if (!docAiAllowed) { setError(docAiLockedMsg); return; }
    const userMsg: ChatMessage = { role: 'user', text: q, at: Date.now() };
    const next = [...chat, userMsg];
    setChat(next); setQuestion(''); setBusy(true); setError(null); scrollChat();
    try {
      const res = await dokumenAiService.chat({
        documentText: doc.text,
        fileName: doc.fileName,
        mode: 'QA',
        prompt: q,
        // Riwayat percakapan SEBELUM pertanyaan ini (service memotong ke 6
        // turn terakhir) — pertanyaan lanjutan terjawab dalam konteksnya.
        history: chat.map((m) => ({ role: m.role, text: m.text })),
      });
      if (res.success) {
        const aiMsg: ChatMessage = { role: 'ai', text: res.reply || '', at: Date.now() };
        const final = [...next, aiMsg];
        setChat(final);
        const qaEntry = {
          type: 'qa' as const, docIds: [doc.id], docNames: [doc.fileName],
          title: `${t('ai.doc.ana.hist_ask_a')} ${q.slice(0, 60)} — ${doc.fileName}`,
          resultPreview: (res.reply || '').slice(0, 300), resultFull: res.reply || '',
          chat: final,
        };
        onAddHistory(qaEntry);
        // Jawaban QA juga ditulis LANGSUNG ke localStorage (riwayat)
        // agar tidak hilang bila user pindah menu sebelum efek
        // tulis-ulang view jalan. Rangkaian chat sendiri bersifat
        // sementara dan tidak di-attach ulang.
        recordHistoryDurable(qaEntry);
      } else {
        setError(`${res.errorCode || 'ERROR'}: ${res.message || t('ai.doc.err_failed')}`);
      }
    } catch (e: any) {
      setError(e?.message || t('ai.doc.err_unexpected'));
    } finally {
      setBusy(false); scrollChat();
    }
  };

  const runCompare = async (compareDocId?: string) => {
    const other = docs.find((d) => d.id === (compareDocId ?? compareId));
    if (!other) { setError(t('ai.doc.ana.err_compare_first')); return; }
    if (!docAiAllowed) { setError(docAiLockedMsg); return; }
    const myRun = beginRun('compare');
    const reqId = ownAnalysisRunRef.current;
    try {
      // Tanpa batas pemrosesan (2026-11-19): kedua dokumen dibandingkan
      // UTUH lewat compareDocuments (tiap dokumen diekstrak per potongan,
      // lalu dibandingkan) — potong 70rb karakter per dokumen + potong
      // gabungan service lama DIHAPUS.
      const res = await dokumenAiService.compareDocuments(
        { fileName: doc.fileName, text: doc.text },
        { fileName: other.fileName, text: other.text },
        { onProgress: (ev) => {
          if (runIdRef.current !== myRun) return;
          setProgress(ev);
          if (reqId != null) patchDocAiAnalysisProgress(reqId, ev.percent, ev.status);
        } },
      );
      if (runIdRef.current !== myRun) return; // dibatalkan — buang hasil
      if (res.success) {
        handleSuccess('compare', res);
      } else {
        clearModeResult('compare');
        const msg = `${res.errorCode || 'ERROR'}: ${res.message || t('ai.doc.err_failed')}`;
        if (reqId != null) failDocAiAnalysis(reqId, msg);
        setError(msg);
      }
    } catch (e: any) {
      if (runIdRef.current !== myRun) return;
      clearModeResult('compare');
      const msg = e?.message || t('ai.doc.err_unexpected');
      if (reqId != null) failDocAiAnalysis(reqId, msg);
      setError(msg);
    } finally {
      if (ownAnalysisRunRef.current === reqId) ownAnalysisRunRef.current = null;
      endRun(myRun);
    }
  };

  // Re-attach analisis (perintah owner 2026-11-21 04:19 — proses tidak
  // boleh ke-reset saat pindah menu): lari analisis dicatat di
  // docAiRunStore (module-level) dan bertahan melewati unmount. Mount
  // ini me-attach ulang HANYA ke lari untuk dokumen yang sama: lari
  // yang masih berjalan → tampil busy + progres; lari yang selesai
  // saat user di menu lain → hasilnya dipulihkan ke modeResults tanpa
  // mengulang panggilan AI. Lari milik mount ini dilewati (fungsi
  // run-nya sendiri yang mengatur UI-nya).
  useEffect(() => {
    const attach = (run: DocAiAnalysisRun | null) => {
      if (!run || run.docId !== doc.id) return;
      if (run.requestId === ownAnalysisRunRef.current) return;
      if (run.status === 'running') {
        setTab(run.tab as AnaTab);
        setBusy(true);
        setProgress({ phase: 'single', done: 0, total: 0, percent: run.percent, status: run.statusText });
        setRunStartedAt(run.startedAt);
        setElapsedSec(Math.max(0, Math.floor((Date.now() - run.startedAt) / 1000)));
        return;
      }
      if (run.status === 'done' && run.result) {
        const doneTab = run.tab as AnaTab;
        const doneResult = run.result;
        setModeResults((prev) => prev[doneTab] ? prev : {
          ...prev,
          [doneTab]: {
            reply: doneResult.reply,
            coverage: doneResult.coverage as DocCoverageInfo | undefined,
            truncated: doneResult.truncated,
          },
        });
        setTab(doneTab);
        consumeDocAiAnalysisRun(run.requestId);
        return;
      }
      if (run.status === 'failed') {
        setError(run.error ?? 'Analisis gagal.');
        consumeDocAiAnalysisRun(run.requestId);
      }
    };
    attach(getDocAiAnalysisRun());
    return subscribeDocAiAnalysis(attach);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  // Auto-run satu kali dari tombol "Jalankan {Mode}" di Dokumen Saya.
  // Handoff chat / tombol tab / tombol Analisis per baris tidak membawa
  // runRequest sehingga workspace dibuka tanpa menjalankan (perilaku lama).
  useEffect(() => {
    if (!runRequest || consumedRunRef.current === runRequest.nonce) return;
    // Lari aktif di runtime untuk dokumen ini (user kembali sesudah
    // pindah menu): JANGAN jalankan lagi — re-attach di atas yang
    // menampilkan lari itu.
    if (isDocAiAnalysisActive(doc.id)) return;
    consumedRunRef.current = runRequest.nonce;
    const reqTab = runRequest.tab;
    setTab(reqTab);
    setError(null);
    if (reqTab === 'qa') {
      const q = (runRequest.question ?? '').trim();
      if (q) void askQuestion(q);
    } else if (reqTab === 'compare') {
      const cid = runRequest.compareId ?? '';
      if (cid) {
        setCompareId(cid);
        void runCompare(cid);
      }
    } else {
      void runMode(reqTab);
    }
    // Sengaja hanya bergantung pada runRequest: fungsi run dibaca dari
    // closure mount (state awal workspace masih kosong).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runRequest]);

  // Timer waktu jalan selama run berlangsung.
  useEffect(() => {
    if (!busy || runStartedAt == null) return;
    const id = window.setInterval(
      () => setElapsedSec(Math.floor((Date.now() - runStartedAt) / 1000)),
      500,
    );
    return () => window.clearInterval(id);
  }, [busy, runStartedAt]);

  const copyResult = async () => {
    const text = modeResults[tab]?.reply ?? '';
    if (!text) return;
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      /* jatuh ke fallback di bawah */
    }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="docai-tab">
      <div className="docai-anabar">
        <button className="docai-btn-ghost" onClick={onBack}><ArrowLeft size={16} /> {t('ai.doc.ana.back')}</button>
        <div className="docai-anatitle">
          <strong>{doc.fileName}</strong>
          <span>{doc.kind.toUpperCase()} · {doc.pages ? `${doc.pages} ${t('ai.doc.ana.pages_abbr')}` : ''} · {doc.text.length.toLocaleString('id-ID')} {t('ai.doc.ana.chars')}{doc.sourcePages && doc.pages && doc.sourcePages > doc.pages ? ` · dibaca ${doc.pages} dari ${doc.sourcePages} halaman (sisanya belum terbaca)` : ''}</span>
        </div>
        <CreditBalance compact showTopUp={false} />
      </div>

      {!docAiAllowed && (
        <div
          role="alert"
          className="docai-lockalert"
          style={{ margin: '0 0 12px' }}
        >
          <Lock size={16} />
          <span>{docAiLockedMsg}</span>
        </div>
      )}

      <div className="docai-anatabs">
        {TABS.map((tb) => {
          const Icon = tb.icon;
          return (
            <button
              key={tb.id}
              className={tab === tb.id ? 'active' : ''}
              disabled={busy}
              title={busy ? 'Analisis sedang berjalan' : tb.label}
              onClick={() => { setTab(tb.id); setError(null); }}
            >
              <Icon size={15} /> {tb.label}
            </button>
          );
        })}
        <span className="docai-anaestimate">
          <CreditEstimateBadge estimate={docEstimate} />
        </span>
      </div>

      <div className="docai-analayout">
        {/* VIEWER — Preview teks terekstrak (tetap terlihat selama proses). */}
        <div className="docai-viewer">
          <div className="docai-viewer-head">
            <span>{t('ai.doc.ana.viewer_head')}</span>
            {pages.length > 1 && (
              <div className="docai-pagenav">
                <button onClick={() => setPageIdx((i) => Math.max(0, i - 1))} disabled={pageIdx === 0}><ChevronLeft size={14} /></button>
                <span>{t('ai.doc.ana.page_abbr')} {pageIdx + 1} / {pages.length}</span>
                <button onClick={() => setPageIdx((i) => Math.min(pages.length - 1, i + 1))} disabled={pageIdx === pages.length - 1}><ChevronRight size={14} /></button>
              </div>
            )}
          </div>
          <div className="docai-viewer-body"><pre>{pages[pageIdx] || t('ai.doc.ana.empty_pre')}</pre></div>
        </div>

        {/* PANEL */}
        <div className="docai-panel">
          {tab === 'qa' ? (
            <>
              <div className="docai-chat">
                {chat.length === 0 && (
                  <div className="docai-chat-empty">{t('ai.doc.ana.chat_empty_a')} <b>{doc.fileName}</b>{t('ai.doc.ana.chat_empty_b')}</div>
                )}
                {chat.map((m, i) => (
                  <div key={i} className={`docai-msg ${m.role}`}>
                    {m.role === 'ai' ? (
                      // Jawaban AI adalah markdown — dirender terformat lewat
                      // konverter escape-first (bukan teks polos mentah).
                      <div
                        className="docai-msg-b docai-md"
                        dangerouslySetInnerHTML={{ __html: markdownToHtml(m.text) }}
                      />
                    ) : (
                      <div className="docai-msg-b">{m.text}</div>
                    )}
                  </div>
                ))}
                {busy && <div className="docai-msg ai"><div className="docai-msg-b"><Loader2 size={14} className="spin" /> {t('ai.doc.ana.busy_reading')}</div></div>}
                <div ref={chatEndRef} />
              </div>
              {/* Sprint 1: error QA WAJIB dirender di tab ini sendiri —
                  sebelumnya situs render error hanya ada di cabang non-QA
                  sehingga pertanyaan gagal menggantung tanpa pesan. */}
              {error && <div className="docai-error"><AlertTriangle size={14} /> {error}</div>}
              <div className="docai-qarow">
                <input
                  value={question} onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') askQuestion(); }}
                  placeholder={t('ai.doc.ana.qa_ph')} disabled={busy}
                />
                <button onClick={() => askQuestion()} disabled={!question.trim() || busy}><Send size={15} /></button>
              </div>
            </>
          ) : busy ? (
            /* LAYAR PROSES — map-reduce per potongan (mockup v2.3 §6).
               Persen dari hitungan potongan nyata; null = panggilan
               tunggal tanpa kemajuan terukur (bar tak tentu + status). */
            <div className="docai-progress" role="status" aria-live="polite">
              <div className="docai-progress-head">
                <Loader2 size={30} className="spin docai-progress-spinner" />
                <div className="docai-progress-status">{progress?.status ?? 'Menyiapkan analisis…'}</div>
                {progress?.percent != null && (
                  <div className="docai-progress-pct">{progress.percent}%</div>
                )}
              </div>
              <div className="docai-progress-bar">
                {progress?.percent != null ? (
                  <div className="docai-progress-fill" style={{ width: `${progress.percent}%` }} />
                ) : (
                  <div className="docai-progress-fill indet" />
                )}
              </div>
              <div className="docai-progress-meta">
                <span>Mode: <strong>{tabLabel}</strong></span>
                <span>Waktu jalan: <strong>{formatElapsed(elapsedSec)}</strong></span>
              </div>
              <div className="docai-progress-file">
                <FileText size={15} /> {doc.fileName}
              </div>
              <button type="button" className="docai-btn-danger-ghost" onClick={cancelRun}>
                <X size={15} /> Batalkan
              </button>
              <p className="docai-hint docai-progress-note" style={{ marginTop: 0 }}>
                Dokumen diproses per potongan (map-reduce) — tidak ada halaman yang dipotong atau dilewati.
              </p>
            </div>
          ) : (
            <>
              {tab === 'compare' && (
                <div className="docai-comparepick">
                  <label>{t('ai.doc.ana.compare_label')}</label>
                  <select value={compareId} onChange={(e) => setCompareId(e.target.value)} className="docai-select">
                    <option value="">{t('ai.doc.ana.compare_pick')}</option>
                    {others.map((o) => <option key={o.id} value={o.id}>{o.fileName}</option>)}
                  </select>
                </div>
              )}
              <button
                className="docai-btn-primary docai-runbtn"
                disabled={busy}
                onClick={() => tab === 'compare' ? runCompare() : runMode(tab)}
              >
                {`${t('ai.doc.ana.run_a')} ${tabLabel}`}
              </button>
              {error && <div className="docai-error"><AlertTriangle size={14} /> {error}</div>}
              {currentResult?.coverage && (
                <div className={currentResult.coverage.partial ? 'docai-coverage partial' : 'docai-coverage'}>
                  <Info size={14} /> {formatCoverageLine(currentResult.coverage)}
                </div>
              )}
              {currentResult?.truncated && <div className="docai-warn">{t('ai.doc.ana.warn_truncated')}</div>}
              {currentResult && (
                <div className="docai-result">
                  <div className="docai-result-head">
                    <span>{t('ai.doc.ana.result_a')} {tabLabel}</span>
                    <button onClick={copyResult}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? t('ai.doc.ana.copied') : t('ai.doc.ana.copy')}</button>
                  </div>
                  <div
                    className="docai-result-body docai-md"
                    dangerouslySetInnerHTML={{ __html: markdownToHtml(currentResult.reply) }}
                  />
                  <div className="docai-result-foot">
                    <button type="button" className="docai-btn-ghost" onClick={onBack}>
                      <ArrowLeft size={15} /> Kembali ke Input
                    </button>
                  </div>
                </div>
              )}
              {!currentResult && (
                <p className="docai-hint">
                  {tab === 'summary' && t('ai.doc.ana.hint_summary')}
                  {tab === 'extract' && t('ai.doc.ana.hint_extract')}
                  {tab === 'compare' && t('ai.doc.ana.hint_compare')}
                  {tab === 'checklist' && t('ai.doc.ana.hint_checklist')}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

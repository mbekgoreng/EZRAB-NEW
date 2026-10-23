/**
 * AI DOKUMEN — Analisis Dokumen (contextual workspace).
 * Dibuka dari Dokumen Saya untuk satu dokumen. Panel analisis kontekstual,
 * bukan chat permanen. Floating assistant global sudah disembunyikan di
 * menu ini oleh WorkspaceView (single-mascot rule).
 *
 * ADAPTASI (service cabang ini belum mendukung mode CHECKLIST):
 * - Tab "Kelengkapan" dijalankan lewat mode CHAT dengan instruksi
 *   pemeriksaan kelengkapan yang dibangun di komponen.
 * - QA meneruskan riwayat percakapan (history) ke service agar pertanyaan
 *   lanjutan tetap kontekstual; service membatasinya ke 6 turn terakhir.
 * - Pemotongan: flag truncated diambil dari respons service. Khusus
 *   COMPARE, anggaran 140.000 karakter DIBAGI DUA per dokumen dan
 *   peringatan menyebut dokumen mana yang terpotong — bukan lagi gabungan
 *   yang terpotong dari depan hingga dokumen kedua bisa hilang diam-diam.
 * - Hasil analisis & jawaban QA dirender TERFORMAT dari markdown AI lewat
 *   markdownToHtml (escape-first) — bukan lagi teks polos mentah.
 */
import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Loader2, Send, BookOpen, MessageCircle, Table2,
  GitCompare, ClipboardCheck, Copy, Check, AlertTriangle, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { dokumenAiService } from '../service';
import { markdownToHtml } from '../markdownHtml';
import type { DocRecord, ChatMessage, HistoryEntry, HistoryType } from '../view';
import { useI18n } from '../../../i18n/I18nContext';
import '../../../ai-credits/ai-credits.css';
import { useCreditSimulation } from '../../../ai-credits/useCreditSimulation';
import { tariffFor } from '../../../ai-credits/config';
import { CreditBalance } from '../../../ai-credits/components/CreditBalance';
import { CreditEstimateBadge } from '../../../ai-credits/components/CreditEstimateBadge';

/** Mode yang didukung service cabang ini. */
type SvcMode = 'SUMMARY' | 'QA' | 'EXTRACT' | 'COMPARE' | 'CHAT';

type AnaTab = 'summary' | 'qa' | 'extract' | 'compare' | 'checklist';

/** Kategori estimasi kredit per tab analisis (simulasi). */
const TAB_CREDIT_CATEGORY: Record<AnaTab, 'simple' | 'complex'> = {
  summary: 'simple',
  qa: 'simple',
  extract: 'complex',
  compare: 'complex',
  checklist: 'complex',
};

const getTabs = (
  t: (key: string) => string,
): Array<{ id: AnaTab; label: string; icon: any }> => [
  { id: 'summary', label: t('ai.doc.ana.tab_summary'), icon: BookOpen },
  { id: 'qa', label: t('ai.doc.ana.tab_qa'), icon: MessageCircle },
  { id: 'extract', label: t('ai.doc.ana.tab_extract'), icon: Table2 },
  { id: 'compare', label: t('ai.doc.ana.tab_compare'), icon: GitCompare },
  { id: 'checklist', label: t('ai.doc.ana.tab_checklist'), icon: ClipboardCheck },
];

/* Tab Kelengkapan memakai mode CHAT (service belum punya CHECKLIST). */
const MODE_OF: Record<AnaTab, SvcMode> = {
  summary: 'SUMMARY', qa: 'QA', extract: 'EXTRACT', compare: 'COMPARE', checklist: 'CHAT',
};

const HISTORY_TYPE_OF: Record<AnaTab, HistoryType> = {
  summary: 'summary', qa: 'qa', extract: 'extract', compare: 'compare', checklist: 'checklist',
};

const CHECKLIST_PROMPT =
  'Periksa kelengkapan dokumen konstruksi ini. Untuk setiap aspek ' +
  '(identitas proyek, lingkup pekerjaan, spesifikasi teknis, gambar acuan, ' +
  'jadwal, RAB/nilai pekerjaan, tanda tangan/pengesahan), nyatakan ADA ' +
  '(dengan kutipan bagian dokumen) atau TIDAK DITEMUKAN. Jangan mengarang ' +
  'informasi yang tidak ada.';

const MAX_DOC_CHARS = 140_000;

function splitPages(text: string): string[] {
  const parts = text.split(/\[Halaman (\d+)\]/g);
  // parts: ["", "1", "teks1", "2", "teks2", ...]
  const out: string[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    out.push(`[Halaman ${parts[i]}]\n${(parts[i + 1] || '').trim()}`);
  }
  return out.length ? out : [text];
}

export const DocAnalyzer: React.FC<{
  doc: DocRecord;
  docs: DocRecord[];
  onBack: () => void;
  onAddHistory: (e: Omit<HistoryEntry, 'id' | 'at'>) => void;
}> = ({ doc, docs, onBack, onAddHistory }) => {
  const { t } = useI18n();
  const TABS = getTabs(t);
  const [tab, setTab] = useState<AnaTab>('summary');
  const [pageIdx, setPageIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState('');
  /** Catatan pemotongan yang tampil ke pengguna (umum dari service, atau spesifik per dokumen untuk COMPARE). */
  const [truncNote, setTruncNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // QA chat
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  // Compare
  const [compareId, setCompareId] = useState('');
  const others = useMemo(
    () => docs.filter((d) => d.id !== doc.id && d.status === 'ready'),
    [docs, doc.id]
  );
  const chatEndRef = useRef<HTMLDivElement>(null);
  // --- AI Credits (simulasi frontend) ---
  const { consume } = useCreditSimulation();
  const docEstimate = tariffFor(`ai-document/${TAB_CREDIT_CATEGORY[tab]}`);

  const pages = useMemo(() => splitPages(doc.text), [doc.text]);

  const scrollChat = () => setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

  const recordHistory = (anaTab: AnaTab, reply: string, chatLog?: ChatMessage[]) => {
    onAddHistory({
      type: HISTORY_TYPE_OF[anaTab],
      docIds: [doc.id],
      docNames: [doc.fileName],
      title: `${TABS.find((t) => t.id === anaTab)?.label} — ${doc.fileName}`,
      resultPreview: reply.slice(0, 300),
      resultFull: reply,
      ...(chatLog ? { chat: chatLog } : {}),
    });
  };

  const runMode = async (
    anaTab: AnaTab,
    prompt?: string,
    docTextOverride?: string,
    fileNameOverride?: string,
    truncNoteOverride?: string | null,
  ) => {
    const mode = MODE_OF[anaTab];
    const docText = docTextOverride ?? doc.text;
    setBusy(true); setError(null); setResult(''); setTruncNote(truncNoteOverride ?? null);
    try {
      const res = await dokumenAiService.chat({
        documentText: docText,
        fileName: fileNameOverride ?? doc.fileName,
        mode,
        prompt: anaTab === 'checklist' ? CHECKLIST_PROMPT : prompt,
      });
      if (res.success) {
        setResult(res.reply || '');
        // Flag truncated dari service adalah sumber kebenaran pemotongan
        // (kecuali pemanggil — COMPARE — sudah memberi catatan spesifik).
        if (res.truncated && !truncNoteOverride) setTruncNote(t('ai.doc.ana.warn_truncated'));
        recordHistory(anaTab, res.reply || '');
        // --- AI Credits: catat pemakaian SIMULASI ---
        consume('ai-document', docEstimate.max, `AI Document (${anaTab}): ${doc.fileName.slice(0, 50)}`);
      } else {
        setError(`${res.errorCode || 'ERROR'}: ${res.message || t('ai.doc.err_failed')}`);
      }
    } catch (e: any) {
      setError(e?.message || t('ai.doc.err_unexpected'));
    } finally {
      setBusy(false);
    }
  };

  const askQuestion = async () => {
    const q = question.trim();
    if (!q || busy) return;
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
        onAddHistory({
          type: 'qa', docIds: [doc.id], docNames: [doc.fileName],
          title: `${t('ai.doc.ana.hist_ask_a')} ${q.slice(0, 60)} — ${doc.fileName}`,
          resultPreview: (res.reply || '').slice(0, 300), resultFull: res.reply || '',
          chat: final,
        });
      } else {
        setError(`${res.errorCode || 'ERROR'}: ${res.message || t('ai.doc.err_failed')}`);
      }
    } catch (e: any) {
      setError(e?.message || t('ai.doc.err_unexpected'));
    } finally {
      setBusy(false); scrollChat();
    }
  };

  const runCompare = () => {
    const other = docs.find((d) => d.id === compareId);
    if (!other) { setError(t('ai.doc.ana.err_compare_first')); return; }
    // Anggaran karakter DIBAGI DUA per dokumen: masing-masing dipotong ke
    // separuh batas service, sehingga dokumen kedua tidak pernah hilang
    // diam-diam karena dokumen pertama memenuhi seluruh anggaran.
    const halfBudget = Math.floor(MAX_DOC_CHARS / 2);
    const firstCut = doc.text.length > halfBudget;
    const secondCut = other.text.length > halfBudget;
    const combined =
      `=== DOKUMEN 1: ${doc.fileName} ===\n${doc.text.slice(0, halfBudget)}` +
      `\n\n=== DOKUMEN 2: ${other.fileName} ===\n${other.text.slice(0, halfBudget)}`;
    const cutList = [
      firstCut ? `Dokumen 1 (${doc.fileName})` : null,
      secondCut ? `Dokumen 2 (${other.fileName})` : null,
    ].filter(Boolean);
    const note = cutList.length
      ? `Anggaran analisis ${MAX_DOC_CHARS.toLocaleString('id-ID')} karakter dibagi dua per dokumen. Yang dipotong: ${cutList.join(' dan ')} — bagian akhirnya tidak ikut dibandingkan.`
      : null;
    runMode('compare', undefined, combined, `${doc.fileName} vs ${other.fileName}`, note);
  };

  const copyResult = () => {
    navigator.clipboard?.writeText(result).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="docai-tab">
      <div className="docai-anabar">
        <button className="docai-btn-ghost" onClick={onBack}><ArrowLeft size={16} /> {t('ai.doc.ana.back')}</button>
        <div className="docai-anatitle">
          <strong>{doc.fileName}</strong>
          <span>{doc.kind.toUpperCase()} · {doc.pages ? `${doc.pages} ${t('ai.doc.ana.pages_abbr')}` : ''} · {doc.text.length.toLocaleString('id-ID')} {t('ai.doc.ana.chars')}</span>
        </div>
        <CreditBalance compact showTopUp={false} />
      </div>

      <div className="docai-anatabs">
        {TABS.map((tb) => {
          const Icon = tb.icon;
          return (
            <button key={tb.id} className={tab === tb.id ? 'active' : ''} onClick={() => { setTab(tb.id); setResult(''); setError(null); setTruncNote(null); }}>
              <Icon size={15} /> {tb.label}
            </button>
          );
        })}
        <span style={{ marginLeft: 'auto', alignSelf: 'center' }}>
          <CreditEstimateBadge estimate={docEstimate} />
        </span>
      </div>

      <div className="docai-analayout">
        {/* VIEWER */}
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
              <div className="docai-qarow">
                <input
                  value={question} onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') askQuestion(); }}
                  placeholder={t('ai.doc.ana.qa_ph')} disabled={busy}
                />
                <button onClick={askQuestion} disabled={!question.trim() || busy}><Send size={15} /></button>
              </div>
            </>
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
                {busy ? <><Loader2 size={15} className="spin" /> {t('ai.doc.ana.run_busy')}</> : `${t('ai.doc.ana.run_a')} ${TABS.find((tb) => tb.id === tab)?.label}`}
              </button>
              {error && <div className="docai-error"><AlertTriangle size={14} /> {error}</div>}
              {truncNote && <div className="docai-warn">{truncNote}</div>}
              {result && (
                <div className="docai-result">
                  <div className="docai-result-head">
                    <span>{t('ai.doc.ana.result_a')} {TABS.find((tb) => tb.id === tab)?.label}</span>
                    <button onClick={copyResult}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? t('ai.doc.ana.copied') : t('ai.doc.ana.copy')}</button>
                  </div>
                  <div
                    className="docai-result-body docai-md"
                    dangerouslySetInnerHTML={{ __html: markdownToHtml(result) }}
                  />
                </div>
              )}
              {!result && !busy && (
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

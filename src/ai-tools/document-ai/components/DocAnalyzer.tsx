/**
 * AI DOKUMEN — Analisis Dokumen (contextual workspace).
 * Dibuka dari Dokumen Saya untuk satu dokumen. Panel analisis kontekstual,
 * bukan chat permanen. Floating assistant global sudah disembunyikan di
 * menu ini oleh WorkspaceView (single-mascot rule).
 */
import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Loader2, Send, BookOpen, MessageCircle, Table2,
  GitCompare, ClipboardCheck, Copy, Check, AlertTriangle, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { dokumenAiService } from '../service';
import { docStore, historyStore, DocRecord, ChatMessage } from '../store';
import { DocAiMode } from '../types';

type AnaTab = 'summary' | 'qa' | 'extract' | 'compare' | 'checklist';

const TABS: Array<{ id: AnaTab; label: string; icon: any }> = [
  { id: 'summary', label: 'Ringkasan', icon: BookOpen },
  { id: 'qa', label: 'Tanya Dokumen', icon: MessageCircle },
  { id: 'extract', label: 'Ekstraksi Data', icon: Table2 },
  { id: 'compare', label: 'Bandingkan', icon: GitCompare },
  { id: 'checklist', label: 'Kelengkapan', icon: ClipboardCheck },
];

const MODE_OF: Record<AnaTab, DocAiMode> = {
  summary: 'SUMMARY', qa: 'QA', extract: 'EXTRACT', compare: 'COMPARE', checklist: 'CHECKLIST',
};

function splitPages(text: string): string[] {
  const parts = text.split(/\[Halaman (\d+)\]/g);
  // parts: ["", "1", "teks1", "2", "teks2", ...]
  const out: string[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    out.push(`[Halaman ${parts[i]}]\n${(parts[i + 1] || '').trim()}`);
  }
  return out.length ? out : [text];
}

export const DocAnalyzer: React.FC<{ doc: DocRecord; onBack: () => void; onDone: () => void }> = ({
  doc, onBack, onDone,
}) => {
  const [tab, setTab] = useState<AnaTab>('summary');
  const [pageIdx, setPageIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [copied, setCopied] = useState(false);
  // QA chat
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  // Compare
  const [compareId, setCompareId] = useState('');
  const others = useMemo(() => docStore.list().filter((d) => d.id !== doc.id && d.status === 'ready'), [doc.id]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const pages = useMemo(() => splitPages(doc.text), [doc.text]);

  const scrollChat = () => setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

  const runMode = async (mode: DocAiMode, prompt?: string, docTextOverride?: string, fileNameOverride?: string) => {
    setBusy(true); setError(null); setResult(''); setTruncated(false);
    try {
      const res = await dokumenAiService.chat({
        documentText: docTextOverride ?? doc.text,
        fileName: fileNameOverride ?? doc.fileName,
        mode,
        prompt,
        history: mode === 'QA' ? chat.map((c) => ({ role: c.role, text: c.text })) : undefined,
      });
      if (res.success) {
        setResult(res.reply || '');
        setTruncated(!!res.truncated);
        historyStore.add({
          type: mode === 'SUMMARY' ? 'summary' : mode === 'EXTRACT' ? 'extract' : mode === 'COMPARE' ? 'compare' : mode === 'CHECKLIST' ? 'checklist' : 'qa',
          docIds: [doc.id], docNames: [doc.fileName],
          title: `${TABS.find((t) => MODE_OF[t.id] === mode)?.label} — ${doc.fileName}`,
          resultPreview: (res.reply || '').slice(0, 300),
          resultFull: res.reply || '',
        });
        onDone();
      } else {
        setError(`${res.errorCode || 'ERROR'}: ${res.message || 'Gagal.'}`);
      }
    } catch (e: any) {
      setError(e?.message || 'Kesalahan tidak terduga.');
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
        documentText: doc.text, fileName: doc.fileName, mode: 'QA', prompt: q,
        history: next.map((c) => ({ role: c.role, text: c.text })),
      });
      if (res.success) {
        const aiMsg: ChatMessage = { role: 'ai', text: res.reply || '', at: Date.now() };
        const final = [...next, aiMsg];
        setChat(final);
        historyStore.add({
          type: 'qa', docIds: [doc.id], docNames: [doc.fileName],
          title: `Tanya: ${q.slice(0, 60)} — ${doc.fileName}`,
          resultPreview: (res.reply || '').slice(0, 300), resultFull: res.reply || '',
          chat: final,
        });
        onDone();
      } else {
        setError(`${res.errorCode || 'ERROR'}: ${res.message || 'Gagal.'}`);
      }
    } catch (e: any) {
      setError(e?.message || 'Kesalahan tidak terduga.');
    } finally {
      setBusy(false); scrollChat();
    }
  };

  const runCompare = () => {
    const other = docStore.get(compareId);
    if (!other) { setError('Pilih dokumen pembanding dulu.'); return; }
    const combined = `=== DOKUMEN 1: ${doc.fileName} ===\n${doc.text}\n\n=== DOKUMEN 2: ${other.fileName} ===\n${other.text}`;
    runMode('COMPARE', undefined, combined, `${doc.fileName} vs ${other.fileName}`);
  };

  const copyResult = () => {
    navigator.clipboard?.writeText(result).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="docai-tab">
      <div className="docai-anabar">
        <button className="docai-btn-ghost" onClick={onBack}><ArrowLeft size={16} /> Dokumen Saya</button>
        <div className="docai-anatitle">
          <strong>{doc.fileName}</strong>
          <span>{doc.kind.toUpperCase()} · {doc.pages ? `${doc.pages} hlm` : ''} · {doc.text.length.toLocaleString('id-ID')} karakter</span>
        </div>
      </div>

      <div className="docai-anatabs">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => { setTab(t.id); setResult(''); setError(null); }}>
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      <div className="docai-analayout">
        {/* VIEWER */}
        <div className="docai-viewer">
          <div className="docai-viewer-head">
            <span>Preview teks terekstrak</span>
            {pages.length > 1 && (
              <div className="docai-pagenav">
                <button onClick={() => setPageIdx((i) => Math.max(0, i - 1))} disabled={pageIdx === 0}><ChevronLeft size={14} /></button>
                <span>Hlm {pageIdx + 1} / {pages.length}</span>
                <button onClick={() => setPageIdx((i) => Math.min(pages.length - 1, i + 1))} disabled={pageIdx === pages.length - 1}><ChevronRight size={14} /></button>
              </div>
            )}
          </div>
          <div className="docai-viewer-body"><pre>{pages[pageIdx] || '(kosong)'}</pre></div>
        </div>

        {/* PANEL */}
        <div className="docai-panel">
          {tab === 'qa' ? (
            <>
              <div className="docai-chat">
                {chat.length === 0 && (
                  <div className="docai-chat-empty">Tanya apa saja tentang <b>{doc.fileName}</b>. Jawaban hanya dari isi dokumen — jika tidak ditemukan, AI akan mengatakannya.</div>
                )}
                {chat.map((m, i) => (
                  <div key={i} className={`docai-msg ${m.role}`}>
                    <div className="docai-msg-b">{m.text}</div>
                  </div>
                ))}
                {busy && <div className="docai-msg ai"><div className="docai-msg-b"><Loader2 size={14} className="spin" /> Membaca dokumen…</div></div>}
                <div ref={chatEndRef} />
              </div>
              <div className="docai-qarow">
                <input
                  value={question} onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') askQuestion(); }}
                  placeholder="Tanya tentang dokumen ini…" disabled={busy}
                />
                <button onClick={askQuestion} disabled={!question.trim() || busy}><Send size={15} /></button>
              </div>
            </>
          ) : (
            <>
              {tab === 'compare' && (
                <div className="docai-comparepick">
                  <label>Bandingkan dengan:</label>
                  <select value={compareId} onChange={(e) => setCompareId(e.target.value)} className="docai-select">
                    <option value="">— pilih dokumen —</option>
                    {others.map((o) => <option key={o.id} value={o.id}>{o.fileName}</option>)}
                  </select>
                </div>
              )}
              <button
                className="docai-btn-primary docai-runbtn"
                disabled={busy}
                onClick={() => tab === 'compare' ? runCompare() : runMode(MODE_OF[tab])}
              >
                {busy ? <><Loader2 size={15} className="spin" /> AI membaca…</> : `Jalankan ${TABS.find((t) => t.id === tab)?.label}`}
              </button>
              {error && <div className="docai-error"><AlertTriangle size={14} /> {error}</div>}
              {truncated && <div className="docai-warn">Dokumen dipotong ke 140.000 karakter untuk analisis. Hasil hanya dari bagian awal.</div>}
              {result && (
                <div className="docai-result">
                  <div className="docai-result-head">
                    <span>Hasil {TABS.find((t) => t.id === tab)?.label}</span>
                    <button onClick={copyResult}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Tersalin' : 'Salin'}</button>
                  </div>
                  <div className="docai-result-body">{result}</div>
                </div>
              )}
              {!result && !busy && (
                <p className="docai-hint">
                  {tab === 'summary' && 'Dapatkan ringkasan terstruktur: tujuan, poin utama, kesimpulan.'}
                  {tab === 'extract' && 'Ekstrak tabel, angka, dan spesifikasi penting dari dokumen.'}
                  {tab === 'compare' && 'Pilih dua dokumen untuk melihat perbedaan per bagian dengan referensi sumber.'}
                  {tab === 'checklist' && 'Periksa kelengkapan dokumen konstruksi: bagian yang ada vs yang belum ditemukan.'}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * DOKUMEN AI — View (EZRAB emerald theme, polished).
 * Upload → pilih mode → hasil cantik dengan copy button.
 */
import React, { useRef, useState } from 'react';
import { UploadCloud, Loader2, FileText, BookOpen, MessageCircle, Table2, GitCompare, Sparkles, Copy, Check, X, FileCheck } from 'lucide-react';
import { parseDocument, ParsedDocument } from './parser';
import { dokumenAiService } from './service';
import './document-ai.css';

type Mode = 'SUMMARY' | 'QA' | 'EXTRACT' | 'COMPARE';

const MODES: Array<{ id: Mode; label: string; desc: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: 'SUMMARY', label: 'Ringkasan', desc: 'Poin penting dokumen', icon: BookOpen },
  { id: 'QA', label: 'Tanya Jawab', desc: 'Chat dengan dokumen', icon: MessageCircle },
  { id: 'EXTRACT', label: 'Ekstrak Tabel', desc: 'Ambil data terstruktur', icon: Table2 },
  { id: 'COMPARE', label: 'Bandingkan', desc: 'Bandingkan 2 dokumen', icon: GitCompare },
];

export const DokumenAiView: React.FC = () => {
  const [doc, setDoc] = useState<ParsedDocument | null>(null);
  const [doc2, setDoc2] = useState<ParsedDocument | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileName2, setFileName2] = useState('');
  const [mode, setMode] = useState<Mode>('SUMMARY');
  const [prompt, setPrompt] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputRef2 = useRef<HTMLInputElement>(null);

  const onPick = async (f: File | null, slot: 1 | 2 = 1) => {
    if (!f) return;
    setBusy(true); setError(null); setReply('');
    try {
      const arr = await f.arrayBuffer();
      const parsed = await parseDocument(arr, f.name, f.type);
      if (!parsed.text.trim()) {
        setError(`Tidak dapat mengekstrak teks dari "${f.name}".`);
      } else if (slot === 1) { setDoc(parsed); setFileName(f.name); }
      else { setDoc2(parsed); setFileName2(f.name); }
    } catch (err: any) {
      setError(err?.message || 'Gagal membaca file.');
    } finally { setBusy(false); }
  };

  const run = async () => {
    const activeDoc = doc;
    if (!activeDoc || busy) return;
    if (mode === 'COMPARE' && !doc2) { setError('Mode Bandingkan butuh 2 dokumen.'); return; }
    setBusy(true); setError(null); setReply('');
    try {
      const documentText = mode === 'COMPARE' && doc2
        ? `=== DOKUMEN 1: ${fileName} ===\n${activeDoc.text}\n\n=== DOKUMEN 2: ${fileName2} ===\n${doc2.text}`
        : activeDoc.text;
      const res = await dokumenAiService.chat({ documentText, fileName, mode, prompt: prompt || undefined });
      if (res.success) setReply(res.reply ?? '');
      else setError(`${res.errorCode}: ${res.message}`);
    } catch (err: any) {
      setError(err?.message || 'Kesalahan tidak terduga.');
    } finally { setBusy(false); }
  };

  const copyReply = () => {
    navigator.clipboard?.writeText(reply).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    onPick(e.dataTransfer.files?.[0] || null);
  };

  return (
    <div className="docai">
      <div className="docai-hero">
        <div className="docai-hero-icon"><Sparkles size={22} /></div>
        <div>
          <h2>Dokumen AI 📄✨</h2>
          <p>Unggah PDF, DOCX, atau XLSX — AI membaca isinya untuk merangkum, menjawab, mengekstrak, dan membandingkan.</p>
        </div>
      </div>

      <div className="docai-grid">
        {/* UPLOAD */}
        <div className="docai-card">
          <div className="docai-step">1 · Dokumen</div>
          <input ref={inputRef} type="file" accept=".pdf,.docx,.xlsx,.txt,.csv" style={{ display: 'none' }} onChange={(e) => onPick(e.target.files?.[0] || null)} />
          <div
            className={`docai-drop ${dragOver ? 'over' : ''} ${doc ? 'filled' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            {doc ? (
              <><FileCheck size={30} color="#059669" /><div className="docai-fname">{fileName}</div>
              <div className="docai-fmeta">{doc.kind} · {doc.text.length.toLocaleString('id-ID')} karakter</div>
              <button className="docai-remove" onClick={(e) => { e.stopPropagation(); setDoc(null); setFileName(''); }}><X size={14} /></button></>
            ) : (
              <><UploadCloud size={32} color="#94A3B8" /><div><b>Seret file ke sini</b> atau klik untuk pilih</div>
              <div className="docai-fmeta">PDF · DOCX · XLSX · TXT</div></>
            )}
          </div>
          {mode === 'COMPARE' && (
            <>
              <input ref={inputRef2} type="file" accept=".pdf,.docx,.xlsx,.txt,.csv" style={{ display: 'none' }} onChange={(e) => onPick(e.target.files?.[0] || null, 2)} />
              <div className={`docai-drop ${doc2 ? 'filled' : ''}`} style={{ marginTop: 10 }} onClick={() => inputRef2.current?.click()}>
                {doc2 ? (<><FileCheck size={26} color="#059669" /><div className="docai-fname">{fileName2}</div></>)
                : (<><FileText size={24} color="#94A3B8" /><div>Dokumen pembanding ke-2</div></>)}
              </div>
            </>
          )}
        </div>

        {/* MODE */}
        <div className="docai-card">
          <div className="docai-step">2 · Pilih Mode</div>
          <div className="docai-modes">
            {MODES.map((m) => {
              const Icon = m.icon; const active = mode === m.id;
              return (
                <button key={m.id} className={`docai-mode ${active ? 'active' : ''}`} onClick={() => setMode(m.id)}>
                  <Icon size={20} />
                  <div><div className="docai-mode-label">{m.label}</div><div className="docai-mode-desc">{m.desc}</div></div>
                  {active && <span className="docai-mode-check">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* QA INPUT */}
      {(mode === 'QA' || mode === 'COMPARE') && (
        <div className="docai-qa-row">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
            placeholder={mode === 'QA' ? 'Tanya sesuatu tentang dokumen ini… 🤔' : 'Apa yang ingin dibandingkan? (opsional)'}
          />
          <button onClick={() => run()} disabled={!doc || busy} className={!doc || busy ? 'disabled' : ''}>
            {busy ? <Loader2 size={16} className="spin" /> : null} {mode === 'QA' ? 'Tanya ✨' : 'Bandingkan 🔍'}
          </button>
        </div>
      )}
      {(mode === 'SUMMARY' || mode === 'EXTRACT') && (
        <button className="docai-run" onClick={() => run()} disabled={!doc || busy}>
          {busy ? <><Loader2 size={17} className="spin" /> AI sedang membaca…</> : <><Sparkles size={17} /> {mode === 'SUMMARY' ? 'Buatkan Ringkasan ✨' : 'Ekstrak Data 📊'}</>}
        </button>
      )}

      {error && <div className="docai-error"><b>😢 Analisis gagal</b><div>{error}</div></div>}

      {reply && (
        <div className="docai-result">
          <div className="docai-result-head">
            <span>✨ Hasil {MODES.find((m) => m.id === mode)?.label}</span>
            <button onClick={copyReply} title="Salin">{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Tersalin!' : 'Salin'}</button>
          </div>
          <div className="docai-result-body">{reply}</div>
        </div>
      )}
    </div>
  );
};

export default DokumenAiView;

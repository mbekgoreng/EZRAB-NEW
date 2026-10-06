/**
 * DOKUMEN AI — View (src/ai-tools/document-ai/view.tsx)
 * Upload PDF/DOCX/XLSX → read text → pick mode (Summary/QA/Extract/Compare) →
 * chat based on document content.
 */

import React, { useRef, useState } from 'react';
import { UploadCloud, Loader2, FileText, BookOpen, MessageCircle, Table2, GitCompare, Sparkles } from 'lucide-react';
import { parseDocument, ParsedDocument } from './parser';
import { dokumenAiService } from './service';

type Mode = 'SUMMARY' | 'QA' | 'EXTRACT' | 'COMPARE';

const MODES: Array<{ id: Mode; label: string; icon: React.ComponentType<{ size?: number; color?: string }> }> = [
  { id: 'SUMMARY', label: 'Ringkasan', icon: BookOpen },
  { id: 'QA', label: 'Tanya Jawab', icon: MessageCircle },
  { id: 'EXTRACT', label: 'Ekstrak Tabel', icon: Table2 },
  { id: 'COMPARE', label: 'Bandingkan', icon: GitCompare },
];

export const DokumenAiView: React.FC = () => {
  const [doc, setDoc] = useState<ParsedDocument | null>(null);
  const [fileName, setFileName] = useState('');
  const [mode, setMode] = useState<Mode>('SUMMARY');
  const [prompt, setPrompt] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const onPick = async (f: File | null) => {
    if (!f) return;
    setBusy(true);
    setError(null);
    setReply('');
    setPrompt('');
    try {
      const arr = await f.arrayBuffer();
      const parsed = await parseDocument(arr, f.name, f.type);
      if (!parsed.text.trim()) {
        setError(`Tidak dapat mengekstrak teks dari "${f.name}". File mungkin kosong atau tidak didukung.`);
        setDoc(null);
        setFileName('');
      } else {
        setDoc(parsed);
        setFileName(f.name);
      }
    } catch (err: any) {
      setError(err?.message || 'Gagal membaca file.');
      setDoc(null);
      setFileName('');
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    if (!doc || busy) return;
    setBusy(true);
    setError(null);
    setReply('');
    try {
      const res = await dokumenAiService.chat({
        documentText: doc.text,
        fileName,
        mode: mode === 'COMPARE' ? 'COMPARE' : mode === 'EXTRACT' ? 'EXTRACT' : mode === 'QA' ? 'QA' : 'SUMMARY',
        prompt: prompt || undefined,
      });
      if (res.success) {
        setReply(res.reply ?? '');
      } else {
        setError(`${res.errorCode}: ${res.message}`);
      }
    } catch (err: any) {
      setError(err?.message || 'Kesalahan tidak terduga.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '8px 16px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: '#EFF6FF', display: 'grid', placeItems: 'center' }}>
          <Sparkles size={17} color="#2563EB" />
        </div>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: '#0F172A' }}>Dokumen AI</h2>
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748B' }}>
        Unggah PDF, DOCX, atau XLSX — Dokumen AI membaca isinya untuk merangkum, menjawab, mengekstrak, dan membandingkan.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12, marginBottom: 14 }}>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.04em' }}>1 · Dokumen</div>
          <input ref={inputRef} type="file" accept=".pdf,.docx,.xlsx,.txt,.csv" style={{ display: 'none' }} onChange={(e) => onPick(e.target.files?.[0] || null)} />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{ marginTop: 10, width: '100%', padding: '18px 10px', borderRadius: 10, border: '1.5px dashed #CBD5E1', background: doc ? '#EFF6FF' : '#F8FAFC', cursor: 'pointer' }}
          >
            {doc ? (
              <span style={{ color: '#2563EB', fontWeight: 700 }}><FileText size={16} style={{ marginRight: 6, verticalAlign: -3 }} />{fileName} ({doc.kind})</span>
            ) : (
              <span style={{ color: '#64748B' }}><UploadCloud size={18} style={{ marginRight: 6, verticalAlign: -4 }} />Pilih file PDF / DOCX / XLSX</span>
            )}
          </button>
        </div>

        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.04em' }}>2 · Mode</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            {MODES.map((m) => {
              const Icon = m.icon;
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  style={{ padding: '12px 8px', borderRadius: 10, border: active ? '2px solid #2563EB' : '1px solid #E2E8F0', background: active ? '#EFF6FF' : '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
                >
                  <Icon size={18} color={active ? '#2563EB' : '#64748B'} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {mode === 'QA' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Masukkan pertanyaan Anda tentang dokumen…"
            style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: '1px solid #CBD5E1', background: '#fff', fontSize: 14 }}
          />
          <button type="button" onClick={() => void run()} disabled={!doc || busy} style={{ padding: '0 20px', borderRadius: 10, border: 'none', background: !doc || busy ? '#CBD5E1' : '#2563EB', color: '#fff', fontWeight: 700, cursor: !doc || busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            {busy ? <Loader2 className="ezrab-spin" size={15} /> : null} Tanya
          </button>
        </div>
      )}

      {busy && <div style={{ color: '#64748B', fontSize: 13, marginBottom: 12 }}><Loader2 size={15} className="ezrab-spin" style={{ verticalAlign: -3, marginRight: 6 }} />Dokumen AI sedang membaca…</div>}

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: 14, marginBottom: 12 }}>
          <div style={{ fontWeight: 800, color: '#B91C1C', fontSize: 14 }}>Analisis gagal</div>
          <div style={{ fontSize: 12.5, color: '#991B1B', marginTop: 4 }}>{error}</div>
        </div>
      )}

      {reply && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 16, whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.6, color: '#0F172A' }}>
          {reply}
        </div>
      )}
    </div>
  );
};

export default DokumenAiView;

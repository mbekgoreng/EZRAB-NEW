/**
 * EZRAB AI — View (src/ai-tools/ezrab-ai/view.tsx)
 * Lightweight chat interface. Not part of the DED vision pipeline. Calls
 * ezrabAiService and shows structured errors when the provider fails.
 */

import React, { useRef, useState } from 'react';
import { Bot, Send, AlertTriangle, Loader2, Sparkles } from 'lucide-react';
import { ezrabAiService } from './service';

interface ChatEntry {
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
}

export const EzrabAiView: React.FC = () => {
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const submit = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    const next: ChatEntry[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setBusy(true);
    try {
      const res = await ezrabAiService.send({
        messages: next.map((m) => ({ role: m.role, content: m.content })),
      });
      if (res.success) {
        setMessages((prev) => [...prev, { role: 'assistant', content: res.reply }]);
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: res.reply, isError: true }]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: err?.message || 'Terjadi kesalahan saat menghubungi AI.', isError: true },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 130px)', maxWidth: 880, margin: '0 auto', padding: '0 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 2px 8px' }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: '#EFF6FF', display: 'grid', placeItems: 'center' }}>
          <Sparkles size={18} color="#2563EB" />
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0F172A' }}>EZRAB AI</h2>
          <p style={{ margin: 0, fontSize: 12, color: '#64748B' }}>Asisten konstruksi &amp; estimasi — bukan analisis DED visual.</p>
        </div>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#94A3B8', fontSize: 13, padding: '40px 10px' }}>
            <Bot size={40} color="#CBD5E1" style={{ margin: '0 auto 10px' }} />
            Tanyakan hal seputar estimasi konstruksi, RAB, atau spesifikasi. Contoh: "Hitung subtotal 45 m² × Rp 250.000."
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div
              style={{
                maxWidth: '80%',
                padding: '9px 13px',
                borderRadius: 12,
                fontSize: 13.5,
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
                color: m.isError ? '#B91C1C' : m.role === 'user' ? '#FFFFFF' : '#0F172A',
                background: m.isError ? '#FEF2F2' : m.role === 'user' ? '#2563EB' : '#F1F5F9',
                border: m.isError ? '1px solid #FECACA' : 'none',
              }}
            >
              {m.content}
            </div>
          </div>
        ))}
        {busy && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 13px', borderRadius: 12, background: '#F1F5F9', color: '#64748B', fontSize: 13 }}>
              <Loader2 size={15} className="ezrab-spin" /> EZRAB AI sedang mengetik…
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '10px 0 18px' }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
          placeholder="Tulis pertanyaan…"
          style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: '1px solid #CBD5E1', background: '#FFFFFF', fontSize: 14, color: '#0F172A', outline: 'none' }}
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !input.trim()}
          style={{ padding: '0 18px', borderRadius: 10, border: 'none', background: busy || !input.trim() ? '#CBD5E1' : '#2563EB', color: '#fff', fontWeight: 700, cursor: busy || !input.trim() ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Send size={15} /> Kirim
        </button>
      </div>
    </div>
  );
};

export default EzrabAiView;

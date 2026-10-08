/**
 * EzrabAiView — Gemini-style cute chat UI (EZRAB theme).
 * - Gradient greeting, suggestion chips, rounded input pill
 * - User: right bubble (emerald). AI: left with sparkle avatar, cute bubble.
 * - Fast/Advanced mode toggle.
 */
import React, { useRef, useState, useEffect } from 'react';
import { Send, Sparkles, Loader2, AlertTriangle, Zap, Brain, Copy, Check } from 'lucide-react';
import { ezrabAiService } from './service';
import { renderMarkdown } from './markdown';
import { Maskot3D } from '../../components/mascot/Maskot3D';
import './ezrab-ai-chat.css';

interface ChatEntry {
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
  model?: string;
}

const SUGGESTIONS = [
  '🏠 Apa itu RAB?',
  '🧱 Hitung volume beton 10×8×0.12',
  '📐 Jelaskan AHSP 2026',
  '💰 Estimasi biaya renovasi dapur',
];

const GREETINGS = [
  'Halo! 👋 Ada yang bisa saya bantu?',
  'Hai! ✨ Mau tanya soal RAB?',
  'Halo! 🏗️ Siap bantu estimasi proyekmu!',
];

export const EzrabAiView: React.FC = () => {
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'fast' | 'advanced'>('fast');
  const [greeting] = useState(() => GREETINGS[Math.floor(Math.random() * GREETINGS.length)]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const submit = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || busy) return;
    setInput('');
    const next: ChatEntry[] = [...messages, { role: 'user', content: msg }];
    setMessages(next);
    setBusy(true);
    try {
      const res = await ezrabAiService.send({
        messages: next.map((m) => ({ role: m.role, content: m.content })),
        mode,
      } as any);
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: res.reply,
        isError: !res.success,
        model: (res as any).model,
      }]);
    } catch (err: any) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: err?.message || 'Ups! Ada gangguan. Coba lagi ya 🥺',
        isError: true,
      }]);
    } finally {
      setBusy(false);
    }
  };

  const copyMsg = (idx: number, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  return (
    <div className="ezchat">
      <div className="ezchat-header">
        <div className="ezchat-logo"><Sparkles size={18} /> Ezrab Chat AI</div>
        <div className="ezchat-modes">
          <button className={mode === 'fast' ? 'active' : ''} onClick={() => setMode('fast')}>
            <Zap size={13} /> Cepat
          </button>
          <button className={mode === 'advanced' ? 'active' : ''} onClick={() => setMode('advanced')}>
            <Brain size={13} /> Mendalam
          </button>
        </div>
      </div>

      <div className="ezchat-body" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="ezchat-empty">
            <Maskot3D size={132} />
            <h2 className="ezchat-greet">{greeting}</h2>
            <p className="ezchat-sub">Tanya apa saja soal RAB, AHSP, estimasi biaya, dan konstruksi</p>
            <div className="ezchat-chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="ezchat-chip" onClick={() => submit(s)}>{s}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="ezchat-list">
            {messages.map((m, i) => m.role === 'user' ? (
              <div key={i} className="ezchat-row user">
                <div className="ezchat-bubble user">{m.content}</div>
              </div>
            ) : (
              <div key={i} className={`ezchat-row ai ${m.isError ? 'error' : ''}`}>
                <div className="ezchat-ai-avatar">{m.isError ? <AlertTriangle size={15} /> : <Sparkles size={15} />}</div>
                <div className="ezchat-bubble ai">
                  <div className="ezchat-text md-body">{renderMarkdown(m.content)}</div>
                  <div className="ezchat-meta">
                    {m.model && <span className="ezchat-model">{m.model}</span>}
                    <button className="ezchat-copy" onClick={() => copyMsg(i, m.content)} title="Salin">
                      {copiedIdx === i ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {busy && (
              <div className="ezchat-row ai">
                <div className="ezchat-ai-avatar"><Sparkles size={15} /></div>
                <div className="ezchat-bubble ai typing">
                  <span className="tdot" /><span className="tdot" /><span className="tdot" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="ezchat-input-wrap">
        <div className="ezchat-input-pill">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="Tanya Ezrab AI…"
            rows={1}
            disabled={busy}
          />
          <button
            className={`ezchat-send ${input.trim() && !busy ? 'ready' : ''}`}
            onClick={() => submit()}
            disabled={busy || !input.trim()}
            title="Kirim"
          >
            {busy ? <Loader2 size={17} className="spin" /> : <Send size={17} />}
          </button>
        </div>
        <div className="ezchat-foot">Ezrab AI bisa salah — cek ulang angka penting ya 😉</div>
      </div>
    </div>
  );
};

export default EzrabAiView;

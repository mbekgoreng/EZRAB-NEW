/**
 * EzrabAiView — Ezrab Chat AI v2 (total overhaul).
 * - 3D mascot "beranda" (EZRABMascot3D, variant chatbot): hero besar saat kosong +
 *   mini di header. Ekspresi idle / thinking / happy mengikuti status chat.
 *   Eye-tracking + blink + float + glow seperti di dashboard.
 * - Royal-blue brand theme (#2563EB), bubble Gemini-style.
 * - Mic voice input (Web Speech API, id-ID), lampir gambar (thumbnail di bubble
 *   user + catatan jujur ke AI bahwa gambar tak bisa dilihat model teks),
 *   timestamp, mode Cepat/Mendalam, tombol chat baru, salin jawaban.
 */
import React, { useRef, useState, useEffect } from 'react';
import {
  Send, Sparkles, Loader2, Zap, Brain,
  Copy, Check, Mic, Paperclip, X, Plus, ImagePlus,
  BookOpen, Calculator, FileText,
} from 'lucide-react';
import { ezrabAiService } from './service';
import { renderMarkdown } from './markdown';
import { notificationBus } from '../../notifications/notificationBus';
import { EZRABMascot3D } from '../../components/mascot/EZRABMascot3D';
import { useI18n } from '../../i18n/I18nContext';
import './ezrab-ai-chat.css';

interface ChatEntry {
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
  model?: string;
  ts: number;
  imageUrl?: string;
  imageName?: string;
}

/* ---- Tipe minimal Web Speech API (Chrome: webkitSpeechRecognition) ---- */
interface EzrabSpeechAlternative { transcript: string; confidence: number }
interface EzrabSpeechRecognitionResult {
  readonly isFinal: boolean; readonly length: number;
  [index: number]: EzrabSpeechAlternative;
}
interface EzrabSpeechRecognitionResultList {
  readonly length: number;
  [index: number]: EzrabSpeechRecognitionResult;
}
interface EzrabSpeechRecognitionEvent {
  readonly resultIndex: number;
  readonly results: EzrabSpeechRecognitionResultList;
}
interface EzrabSpeechRecognitionErrorEvent { readonly error: string }
interface EzrabSpeechRecognition {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((event: EzrabSpeechRecognitionEvent) => void) | null;
  onerror: ((event: EzrabSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
const getSpeechRecognitionCtor = (): (new () => EzrabSpeechRecognition) | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
    | (new () => EzrabSpeechRecognition) | undefined;
  return Ctor ?? null;
};

const MASCOT_PNG = '/images/ezrab-mascot-greeting.png';

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

export const EzrabAiView: React.FC = () => {
  const { t } = useI18n();
  const SUGGESTIONS = [
    t('ai.chat.sug_rab'),
    t('ai.chat.sug_volume'),
    t('ai.chat.sug_ahsp'),
    t('ai.chat.sug_renov'),
  ];
  const GREETINGS = [
    t('ai.chat.greet_1'),
    t('ai.chat.greet_2'),
    t('ai.chat.greet_3'),
  ];
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'fast' | 'advanced'>('fast');
  const [greeting] = useState(() => GREETINGS[Math.floor(Math.random() * GREETINGS.length)]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [attached, setAttached] = useState<{ url: string; name: string } | null>(null);
  const [listening, setListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<EzrabSpeechRecognition | null>(null);
  const sttBaseRef = useRef('');
  const sttFinalRef = useRef('');

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  /* Bersihkan sesi STT + object URL saat unmount */
  useEffect(() => {
    return () => {
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      if (rec) { try { rec.abort(); } catch { /* abaikan */ } }
      if (attached) URL.revokeObjectURL(attached.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const autoresize = () => {
    const ta = taRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`; }
  };

  const newChat = () => {
    setMessages([]);
    setInput('');
    if (attached) { URL.revokeObjectURL(attached.url); setAttached(null); }
    autoresize();
  };

  const submit = async (text?: string) => {
    const msg = (text ?? input).trim();
    if ((!msg && !attached) || busy) return;
    const img = attached;
    /* Catatan jujur ke model teks: ia tidak bisa melihat gambar */
    const content = img && !msg
      ? `🖼️ (pengguna melampirkan gambar "${img.name}" — saya tidak dapat melihat gambar, mohon minta deskripsi atau lanjutkan tanpa gambar)`
      : img
        ? `${msg}\n\n🖼️ (pengguna juga melampirkan gambar "${img.name}" — saya tidak dapat melihat gambar)`
        : msg;
    setInput('');
    if (img) { URL.revokeObjectURL(img.url); setAttached(null); }
    autoresize();
    const entry: ChatEntry = {
      role: 'user', content: msg || t('ai.chat.attached_only'), ts: Date.now(),
      imageUrl: img?.url, imageName: img?.name,
    };
    const next: ChatEntry[] = [...messages, entry];
    setMessages(next);
    setBusy(true);
    try {
      const res = await ezrabAiService.send({
        messages: next.map((m) => ({ role: m.role, content: m.role === 'user' && m.imageName ? content : m.content })),
        mode,
      } as any);
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: res.reply,
        isError: !res.success,
        model: (res as any).model,
        ts: Date.now(),
      }]);
      notificationBus.publish({
        type: res.success ? 'success' : 'error',
        title: res.success ? t('ai.chat.notif_done') : t('ai.chat.notif_fail'),
        message: msg.length > 90 ? `${msg.slice(0, 90)}…` : msg,
        link: 'ezrab-ai',
      });
    } catch (err: any) {
      const errMsg = err?.message || t('ai.chat.err_generic');
      setMessages((prev) => [...prev, { role: 'assistant', content: errMsg, isError: true, ts: Date.now() }]);
      notificationBus.publish({
        type: 'error',
        title: t('ai.chat.notif_error'),
        message: errMsg.length > 140 ? `${errMsg.slice(0, 140)}…` : errMsg,
        link: 'ezrab-ai',
      });
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

  /* ---------- Voice input (Web Speech API) ---------- */
  const stopListening = () => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    sttFinalRef.current = '';
    setListening(false);
    if (rec) { try { rec.abort(); } catch { /* abaikan */ } }
  };

  const toggleMic = () => {
    if (listening) { stopListening(); return; }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setMessages((prev) => [...prev, {
        role: 'assistant', ts: Date.now(), isError: true,
        content: t('ai.chat.err_voice_unsupported'),
      }]);
      return;
    }
    const rec = new Ctor();
    rec.lang = 'id-ID';
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    sttBaseRef.current = input;
    sttFinalRef.current = '';
    recognitionRef.current = rec;
    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const r = event.results[i];
        const t = r[0]?.transcript ?? '';
        if (r.isFinal) sttFinalRef.current += t; else interim += t;
      }
      const parts = [sttBaseRef.current, sttFinalRef.current, interim].filter((p) => p.trim());
      setInput(parts.join(' '));
      requestAnimationFrame(autoresize);
    };
    rec.onerror = (event) => {
      const err = event?.error ?? '';
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        setMessages((prev) => [...prev, {
          role: 'assistant', ts: Date.now(), isError: true,
          content: t('ai.chat.err_mic_denied'),
        }]);
      } else if (err !== 'aborted' && err !== 'no-speech') {
        setMessages((prev) => [...prev, {
          role: 'assistant', ts: Date.now(), isError: true,
          content: t('ai.chat.err_voice_failed'),
        }]);
      }
    };
    rec.onend = () => { recognitionRef.current = null; sttFinalRef.current = ''; setListening(false); };
    try { rec.start(); setListening(true); }
    catch { recognitionRef.current = null; setListening(false); }
  };

  /* ---------- Attach image ---------- */
  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (attached) URL.revokeObjectURL(attached.url);
    setAttached({ url: URL.createObjectURL(f), name: f.name });
  };

  const mascotExpression: 'idle' | 'thinking' | 'happy' =
    busy ? 'thinking' : messages.length > 0 ? 'happy' : 'idle';

  /* Composer dipakai dua tempat: di tengah (saat chat kosong, di bawah
   * trust badges) dan di bawah (saat sudah ada percakapan). */
  const composer = (middle: boolean) => (
    <div className={`ezchat2-input-wrap${middle ? ' middle' : ''}`}>
      {attached && (
        <div className="ezchat2-attchip">
          <img src={attached.url} alt={attached.name} />
          <span>{attached.name}</span>
          <button onClick={() => { URL.revokeObjectURL(attached.url); setAttached(null); }} title={t('ai.chat.remove_attach')}>
            <X size={13} />
          </button>
        </div>
      )}
      {listening && (
        <div className="ezchat2-listening"><span className="ezdot busy pulse" /> {t('ai.chat.listening')}</div>
      )}
      <div className="ezchat2-pill">
        <button
          className="ezchat2-tool"
          onClick={() => fileRef.current?.click()}
          title={t('ai.chat.attach_title')}
          disabled={busy}
        >
          <Paperclip size={17} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={onPickFile}
        />
        <textarea
          ref={taRef}
          value={input}
          onChange={(e) => { setInput(e.target.value); autoresize(); }}
          onKeyDown={onKey}
          placeholder={listening ? t('ai.chat.placeholder_listening') : t('ai.chat.placeholder')}
          rows={1}
          disabled={busy}
        />
        <button
          className={`ezchat2-tool ${listening ? 'listening' : ''}`}
          onClick={toggleMic}
          title={listening ? t('ai.chat.mic_stop') : t('ai.chat.mic_start')}
          disabled={busy}
        >
          <Mic size={17} />
        </button>
        <button
          className={`ezchat2-send ${input.trim() || attached ? 'ready' : ''}`}
          onClick={() => submit()}
          disabled={busy || (!input.trim() && !attached)}
          title={t('ai.chat.send')}
        >
          {busy ? <Loader2 size={17} className="spin" /> : <Send size={17} />}
        </button>
      </div>
      <div className="ezchat2-foot">
        <ImagePlus size={11} /> {t('ai.chat.foot_note')}
        <span> • </span>{t('ai.chat.foot_disclaimer')}
      </div>
    </div>
  );

  return (
    <div className="ezchat2">
      {/* ===== Header ===== */}
      <div className="ezchat2-header">
        <div className="ezchat2-mascot">
          <EZRABMascot3D
            variant="chatbot"
            width={44}
            height={44}
            expression={mascotExpression}
            isThinking={busy}
            enableEyeTracking
            enableBlink
            enableGlow
          />
        </div>
        <div className="ezchat2-title">
          <div className="ezchat2-name">Ezrab Chat AI</div>
          <div className="ezchat2-status">
            <span className={`ezdot ${busy ? 'busy' : ''}`} />
            {busy ? t('ai.chat.status_thinking') : t('ai.chat.status_online')}
          </div>
        </div>
        <div className="ezchat2-actions">
          <div className="ezchat2-modes">
            <button className={mode === 'fast' ? 'active' : ''} onClick={() => setMode('fast')}>
              <Zap size={13} /> {t('ai.chat.mode_fast')}
            </button>
            <button className={mode === 'advanced' ? 'active' : ''} onClick={() => setMode('advanced')}>
              <Brain size={13} /> {t('ai.chat.mode_deep')}
            </button>
          </div>
          {messages.length > 0 && (
            <button className="ezchat2-new" onClick={newChat} title={t('ai.chat.new_chat_title')}>
              <Plus size={15} /> {t('ai.chat.new_chat')}
            </button>
          )}
        </div>
      </div>

      {/* ===== Body ===== */}
      <div className="ezchat2-body" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="ezchat2-empty">
            <div className="ezchat2-hero">
              <EZRABMascot3D
                variant="chatbot"
                width={128}
                height={128}
                expression="happy"
                enableEyeTracking
                enableFloat
                enableBlink
                enableGlow
              />
            </div>
            <h2 className="ezchat2-greet">{greeting}</h2>
            <p className="ezchat2-sub">{t('ai.chat.sub')}</p>
            <div className="ezchat2-chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="ezchat2-chip" onClick={() => submit(s)}>{s}</button>
              ))}
            </div>
            <div className="ezchat2-trust">
              <span><BookOpen size={12} /> {t('ai.chat.trust_ahsp')}</span><i>•</i>
              <span><Calculator size={12} /> {t('ai.chat.trust_volume')}</span><i>•</i>
              <span><FileText size={12} /> {t('ai.chat.trust_rab')}</span>
            </div>
            {composer(true)}
          </div>
        ) : (
          <div className="ezchat2-list">
            {messages.map((m, i) => m.role === 'user' ? (
              <div key={i} className="ezchat2-row user">
                <div className="ezchat2-col">
                  <div className="ezchat2-bubble user">
                    {m.imageUrl && (
                      <img src={m.imageUrl} alt={m.imageName} className="ezchat2-attimg" />
                    )}
                    <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                  </div>
                  <div className="ezchat2-ts">{fmtTime(m.ts)}</div>
                </div>
              </div>
            ) : (
              <div key={i} className={`ezchat2-row ai ${m.isError ? 'error' : ''}`}>
                <img src={MASCOT_PNG} alt="Ezrab" className="ezchat2-avatar" />
                <div className="ezchat2-col">
                  <div className="ezchat2-bubble ai">
                    <div className="ezchat2-text md-body">{renderMarkdown(m.content)}</div>
                    <div className="ezchat2-meta">
                      {m.model && <span className="ezchat2-model"><Sparkles size={11} /> {m.model}</span>}
                      <button className="ezchat2-copy" onClick={() => copyMsg(i, m.content)} title={t('ai.chat.copy')}>
                        {copiedIdx === i ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                    </div>
                  </div>
                  <div className="ezchat2-ts">{fmtTime(m.ts)}</div>
                </div>
              </div>
            ))}
            {busy && (
              <div className="ezchat2-row ai">
                <img src={MASCOT_PNG} alt="Ezrab" className="ezchat2-avatar thinking" />
                <div className="ezchat2-bubble ai typing">
                  <span className="tdot" /><span className="tdot" /><span className="tdot" />
                  <span className="ezchat2-thinking">{t('ai.chat.thinking')}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===== Composer di bawah (hanya saat sudah ada percakapan) ===== */}
      {messages.length > 0 && composer(false)}
    </div>
  );
};

export default EzrabAiView;

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
} from 'lucide-react';
import { ezrabAiService } from './service';
import { renderMarkdown } from './markdown';
import { routeIntent, localGreeting, HELP_TEXT } from './intentRouter';
import { executeIntent, ChatActionContext } from './actionRegistry';
import { notificationBus } from '../../notifications/notificationBus';
import { EZRABMascot3D } from '../../components/mascot/EZRABMascot3D';
import { useProject } from '../../context/ProjectContext';
import { buildProjectSnapshot, ProjectSnapshot } from './projectContext';
import { unifiedConversationStore } from '../../services/ai/conversation/unifiedConversationStore';
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

const SUGGESTIONS = [
  '🏠 Apa itu RAB?',
  '🧱 Hitung volume beton 10×8×0.12',
  '📐 Jelaskan AHSP 2026',
  '💰 Estimasi biaya renovasi dapur',
];

const GREETINGS = [
  'Halo! 👋 Mau estimasi apa hari ini?',
  'Hai! ✨ Siap bantu hitung RAB kamu.',
  'Halo! 🏗️ Tanya apa saja soal konstruksi.',
];

const MASCOT_PNG = '/images/ezrab-mascot-greeting.png';

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

interface EzrabAiViewProps {
  /** Navigate to a workspace menu (injected by WorkspaceView) */
  onNavigate?: (menu: string) => void;
  /** Current menu id for contextual responses */
  currentMenu?: string;
  /** Active project snapshot (null when none selected) */
  activeProject?: { id: string; name: string } | null;
  /** All projects visible to the user */
  projects?: Array<{ id: string; name: string }>;
  /** Active project RAB total (null when unknown) */
  projectTotal?: number | null;
}

export const EzrabAiView: React.FC<EzrabAiViewProps> = ({
  onNavigate, currentMenu = 'ezrab-ai', activeProject = null, projects = [], projectTotal = null,
}) => {
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'fast' | 'advanced'>('fast');
  const [greeting] = useState(() => GREETINGS[Math.floor(Math.random() * GREETINGS.length)]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [attached, setAttached] = useState<{ url: string; name: string } | null>(null);
  const [listening, setListening] = useState(false);

  /* ---- FASE 5A: project grounding + conversation persistence ---- */
  const { currentProject, projectRabItems } = useProject();
  // Prefer live context; fall back to props (keeps standalone usage working).
  const effProject = currentProject ?? activeProject;
  const projectSnapshot: ProjectSnapshot | null = buildProjectSnapshot(
    effProject ? { id: effProject.id, name: effProject.name, costSummary: (effProject as unknown as { costSummary?: Record<string, unknown> }).costSummary } : null,
    projectRabItems as unknown as Array<Record<string, unknown>>,
  );
  // Conversation store is keyed by project; use a stable key when none is active.
  const storeProjectId = effProject?.id ?? '__ezrab_ai_global__';
  const convIdRef = useRef<string | null>(null);

  // Load persisted conversation on mount / project change.
  useEffect(() => {
    try {
      const conv = unifiedConversationStore.getOrCreateActiveConversation(storeProjectId);
      convIdRef.current = conv.id;
      const restored: ChatEntry[] = (conv.messages ?? [])
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          ts: m.createdAt ? Date.parse(m.createdAt) || Date.now() : Date.now(),
        }));
      setMessages(restored);
    } catch {
      /* storage failure is non-fatal — chat still works in-memory */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeProjectId]);

  const persistMessage = (role: 'user' | 'assistant', content: string) => {
    try {
      const convId = convIdRef.current;
      if (!convId) return;
      unifiedConversationStore.appendMessage(convId, storeProjectId, {
        role,
        content,
      });
    } catch {
      /* honest degradation: in-memory only */
    }
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<EzrabSpeechRecognition | null>(null);
  const sttBaseRef = useRef('');
  const sttFinalRef = useRef('');

  /* P2 UI-1 fix: kelola lifecycle object URL dengan benar.
   * Bug lama: URL di-revoke saat submit, padahal URL yang SAMA disimpan di
   * pesan (imageUrl) -> thumbnail selalu rusak. Sekarang: URL hidup selama
   * pemiliknya (attachment / pesan chat) hidup; di-revoke saat pemiliknya
   * dibuang / chat dibersihkan / komponen unmount. */
  const liveUrlsRef = useRef<Set<string>>(new Set());
  const trackUrl = (url: string) => { liveUrlsRef.current.add(url); return url; };
  const revokeUrl = (url?: string | null) => {
    if (!url) return;
    if (liveUrlsRef.current.has(url)) {
      liveUrlsRef.current.delete(url);
      try { URL.revokeObjectURL(url); } catch { /* abaikan */ }
    }
  };
  const revokeAllUrls = () => {
    liveUrlsRef.current.forEach((u) => { try { URL.revokeObjectURL(u); } catch { /* abaikan */ } });
    liveUrlsRef.current.clear();
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  /* Bersihkan sesi STT + SEMUA object URL saat unmount (termasuk thumbnail di pesan) */
  useEffect(() => {
    return () => {
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      if (rec) { try { rec.abort(); } catch { /* abaikan */ } }
      revokeAllUrls();
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
    revokeAllUrls();
    setAttached(null);
    autoresize();
    try {
      const conv = unifiedConversationStore.createConversation(storeProjectId, 'Percakapan baru');
      unifiedConversationStore.setActiveConversationId(storeProjectId, conv.id);
      convIdRef.current = conv.id;
    } catch {
      /* non-fatal */
    }
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
    /* P2 UI-1: JANGAN revoke di sini — URL dipakai thumbnail di pesan.
     * Kepemilikan URL pindah ke pesan; di-revoke saat chat dibersihkan/unmount. */
    if (img) { setAttached(null); }
    autoresize();
    const entry: ChatEntry = {
      role: 'user', content: msg || '(gambar terlampir)', ts: Date.now(),
      imageUrl: img?.url, imageName: img?.name,
    };
    const next: ChatEntry[] = [...messages, entry];
    setMessages(next);
    persistMessage('user', entry.content);
    setBusy(true);
    /* ---- Phase 1: local intent router runs BEFORE any AI provider call ---- */
    const routed = routeIntent(msg);
    if (routed.localOnly && routed.intent !== 'UNKNOWN') {
      try {
        const ctx: ChatActionContext = {
          navigate: onNavigate ?? (() => {}),
          currentMenu,
          activeProject,
          projects,
          // FASE 5A/5B: use the deterministic direct total from the live RAB snapshot
          // (same source as get_project_total tool), not the stored grand total.
          projectTotal: projectSnapshot ? projectSnapshot.totalDirect : projectTotal,
          projectCostBreakdown: projectSnapshot?.costBreakdown
            ? {
                grandTotal: projectSnapshot.costBreakdown.grandTotal,
                overheadPercent: projectSnapshot.costBreakdown.overheadPercent,
                profitPercent: projectSnapshot.costBreakdown.profitPercent,
                taxPercent: projectSnapshot.costBreakdown.taxPercent,
              }
            : null,
        };
        let reply: string;
        if (routed.intent === 'GREETING') reply = localGreeting();
        else if (routed.intent === 'HELP') reply = HELP_TEXT;
        else if (routed.needsClarification && routed.clarificationPrompt) reply = routed.clarificationPrompt;
        else {
          const res = executeIntent(routed.intent, routed.param, ctx);
          reply = res.message;
        }
        setMessages((prev) => [...prev, { role: 'assistant', content: reply, ts: Date.now() }]);
        persistMessage('assistant', reply);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (routed.needsClarification && routed.clarificationPrompt) {
      setMessages((prev) => [...prev, { role: 'assistant', content: routed.clarificationPrompt!, ts: Date.now() }]);
      persistMessage('assistant', routed.clarificationPrompt!);
      setBusy(false);
      return;
    }
    try {
      const res = await ezrabAiService.send({
        messages: next.map((m) => ({ role: m.role, content: m.role === 'user' && m.imageName ? content : m.content })),
        mode,
        projectSnapshot,
      } as any);
      const assistantEntry: ChatEntry = {
        role: 'assistant',
        content: res.reply,
        isError: !res.success,
        model: (res as any).model,
        ts: Date.now(),
      };
      setMessages((prev) => [...prev, assistantEntry]);
      persistMessage('assistant', res.reply);
      notificationBus.publish({
        type: res.success ? 'success' : 'error',
        title: res.success ? 'Ezrab AI selesai menjawab' : 'Ezrab AI gagal menjawab',
        message: msg.length > 90 ? `${msg.slice(0, 90)}…` : msg,
        link: 'ezrab-ai',
      });
    } catch (err: any) {
      const errMsg = err?.message || 'Ups! Ada gangguan. Coba lagi ya 🥺';
      setMessages((prev) => [...prev, { role: 'assistant', content: errMsg, isError: true, ts: Date.now() }]);
      notificationBus.publish({
        type: 'error',
        title: 'Ezrab AI mengalami gangguan',
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
        content: '🎤 Browser ini tidak mendukung voice input. Coba buka di Chrome Android/desktop ya.',
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
          content: '🎤 Izin mikrofon ditolak. Izinkan akses mic di pengaturan browser ya.',
        }]);
      } else if (err !== 'aborted' && err !== 'no-speech') {
        setMessages((prev) => [...prev, {
          role: 'assistant', ts: Date.now(), isError: true,
          content: '🎤 Voice input gagal. Coba ketik manual ya.',
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
    if (attached) revokeUrl(attached.url);
    setAttached({ url: trackUrl(URL.createObjectURL(f)), name: f.name });
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
          <button onClick={() => { revokeUrl(attached.url); setAttached(null); }} title="Hapus">
            <X size={13} />
          </button>
        </div>
      )}
      {listening && (
        <div className="ezchat2-listening"><span className="ezdot busy pulse" /> Mendengarkan… bicara sekarang 🎤</div>
      )}
      <div className="ezchat2-pill">
        <button
          className="ezchat2-tool"
          onClick={() => fileRef.current?.click()}
          title="Lampirkan gambar"
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
          placeholder={listening ? 'Mendengarkan…' : 'Ketik pesan atau perintah, misalnya /template'}
          rows={1}
          disabled={busy}
        />
        <button
          className={`ezchat2-tool ${listening ? 'listening' : ''}`}
          onClick={toggleMic}
          title={listening ? 'Berhenti merekam' : 'Voice input (id-ID)'}
          disabled={busy}
        >
          <Mic size={17} />
        </button>
        <button
          className={`ezchat2-send ${input.trim() || attached ? 'ready' : ''}`}
          onClick={() => submit()}
          disabled={busy || (!input.trim() && !attached)}
          title="Kirim"
        >
          {busy ? <Loader2 size={17} className="spin" /> : <Send size={17} />}
        </button>
      </div>
      <div className="ezchat2-foot">
        <ImagePlus size={11} /> Gambar dilampirkan sebagai catatan — model teks belum bisa "melihat" gambar
        <span> • </span>Ezrab AI bisa salah, cek ulang angka penting 😉
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
            {busy ? 'Sedang berpikir…' : 'Online — menjawab dari AHSP 2026 & data EZRAB'}
          </div>
        </div>
        <div className="ezchat2-actions">
          <div className="ezchat2-modes">
            <button className={mode === 'fast' ? 'active' : ''} onClick={() => setMode('fast')}>
              <Zap size={13} /> Cepat
            </button>
            <button className={mode === 'advanced' ? 'active' : ''} onClick={() => setMode('advanced')}>
              <Brain size={13} /> Mendalam
            </button>
          </div>
          {messages.length > 0 && (
            <button className="ezchat2-new" onClick={newChat} title="Percakapan baru">
              <Plus size={15} /> Baru
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
            <p className="ezchat2-sub">Tanya apa saja soal RAB, AHSP 2026, volume, dan estimasi biaya konstruksi</p>
            <div className="ezchat2-chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="ezchat2-chip" onClick={() => submit(s)}>{s}</button>
              ))}
            </div>
            <div className="ezchat2-trust">
              <span>📖 AHSP 2026 resmi</span><i>•</i>
              <span>🧮 Hitung volume</span><i>•</i>
              <span>📋 Bantu susun RAB</span>
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
                      <button className="ezchat2-copy" onClick={() => copyMsg(i, m.content)} title="Salin jawaban">
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
                  <span className="ezchat2-thinking">Ezrab sedang berpikir…</span>
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

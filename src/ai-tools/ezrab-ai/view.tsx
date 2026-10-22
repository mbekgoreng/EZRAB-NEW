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
import React, { useRef, useState, useEffect, useCallback, Suspense, lazy } from 'react';
import {
  Send, Sparkles, Loader2, Zap, Brain,
  Copy, Check, Mic, Paperclip, X, Plus, ImagePlus,
} from 'lucide-react';
import { ezrabAiService } from './service';
import { debitChatCreditOnSuccess } from './chatCreditDebit';
import { deriveAiStatus, outcomeFromErrorCode, type GatewayReach, type LastOutcome } from './aiStatus';
import { resolveAuthKind, type AuthKind } from '../../lib/demoSession';
import { renderMarkdown } from './markdown';
import { routeIntent, localGreeting, HELP_TEXT } from './intentRouter';
import { consumePendingAiEntry, requestAiEntry } from '../aiNavigation';
import { executeIntent, continueRabNeeds, getLastRabDesignPrompt, ChatActionContext, ChatActionButton } from './actionRegistry';
import { getLastDirectRab } from './directRab';
import { looksLikeNeedsAnswer } from './rabNeeds';
import { notificationBus } from '../../notifications/notificationBus';
import { navigateTo, routeForMenu } from '../../routing/routes';
import { EZRABMascot3D } from '../../components/mascot/EZRABMascot3D';
import { useProject } from '../../context/ProjectContext';
import { buildProjectSnapshot, ProjectSnapshot } from './projectContext';
import { unifiedConversationStore } from '../../services/ai/conversation/unifiedConversationStore';
import './ezrab-ai-chat.css';
import '../../ai-credits/ai-credits.css';
import { useCreditSimulation } from '../../ai-credits/useCreditSimulation';
import { tariffFor } from '../../ai-credits/config';
import { CreditBalance } from '../../ai-credits/components/CreditBalance';
import { CreditEstimateBadge } from '../../ai-credits/components/CreditEstimateBadge';
import { CreditTopUpModal } from '../../ai-credits/components/CreditTopUpModal';

// Game Space is lazy-loaded: three.js + game code split into their own chunk,
// only fetched when the user opens it via the `game` command.
const GameSpaceOverlay = lazy(() => import('../../game-space/GameSpaceOverlay'));
// P0/P1/P2: lazy overlays untuk Command Center
const DesignWizardFlowLazy = lazy(() => import('../../ai-design/DesignWizardFlow').then(m => ({ default: m.DesignWizardFlow })));
const DesignStudioLazy = lazy(() => import('../../ai-design/AiDesignStudio').then(m => ({ default: m.AiDesignStudio })));

interface ChatEntry {
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
  model?: string;
  ts: number;
  imageUrl?: string;
  imageName?: string;
  /** Kredit simulasi yang dipakai untuk respons ini (hanya AI). */
  creditsUsed?: number;
  /** Tombol aksi interaktif (Command Center P0) */
  actions?: ChatActionButton[];
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
  // Honest AI status (Fase 3B): derived only from observed signals —
  // gateway reachability (free diagnostic), held identity, last outcome.
  const [gatewayReach, setGatewayReach] = useState<GatewayReach>('unknown');
  const [authKind, setAuthKind] = useState<AuthKind>('none');
  const [lastOutcome, setLastOutcome] = useState<LastOutcome>('none');
  useEffect(() => {
    let cancelled = false;
    fetch('/api/ai/engine-status')
      .then((r) => { if (!cancelled) setGatewayReach(r.ok ? 'reachable' : 'unreachable'); })
      .catch(() => { if (!cancelled) setGatewayReach('unreachable'); });
    resolveAuthKind().then((k) => { if (!cancelled) setAuthKind(k); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const [mode, setMode] = useState<'fast' | 'advanced'>('fast');
  const [greeting] = useState(() => GREETINGS[Math.floor(Math.random() * GREETINGS.length)]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [attached, setAttached] = useState<{ url: string; name: string } | null>(null);
  // --- AI Credits (simulasi frontend) ---
  const { balance, consume } = useCreditSimulation();
  const [creditConfirm, setCreditConfirm] = useState<{ estimate: number; pending: () => void } | null>(null);
  const [creditTopUpOpen, setCreditTopUpOpen] = useState(false);
  const chatEstimate = tariffFor(mode === 'fast' ? 'chat-ai/fast' : 'chat-ai/advanced');
  const [listening, setListening] = useState(false);
  /** Game Space overlay — opened by the `game` command, closed back to chat. */
  const [gameSpaceOpen, setGameSpaceOpen] = useState(false);
  /** Chat-to-RAB Fase 2: menunggu jawaban "Lengkapi kebutuhan" dari pengguna */
  const [awaitingNeeds, setAwaitingNeeds] = useState(false);
  // P0 Command Center: wizard & design studio overlays
  const [rabWizardOpen, setRabWizardOpen] = useState(false);
  const [designStudioOpen, setDesignStudioOpen] = useState(false);
  const [designPrompt, setDesignPrompt] = useState<string | undefined>(undefined);

  /* ---- FASE 5A: project grounding + conversation persistence ---- */
  const { currentProject, projectRabItems, bulkAddRabItems } = useProject();
  // Prefer live context; fall back to props (keeps standalone usage working).
  const effProject = currentProject ?? activeProject;
  const projectSnapshot: ProjectSnapshot | null = buildProjectSnapshot(
    effProject ? { id: effProject.id, name: effProject.name, costSummary: (effProject as unknown as { costSummary?: Record<string, unknown> }).costSummary } : null,
    projectRabItems as unknown as Array<Record<string, unknown>>,
  );
  // Conversation store is keyed by project; use a stable key when none is active.
  const storeProjectId = effProject?.id ?? '__ezrab_ai_global__';
  const convIdRef = useRef<string | null>(null);
  // True setelah percakapan tersimpan selesai di-restore — entry AI baru
  // diproses setelah ini agar tidak menimpa riwayat (stale closure).
  const [conversationReady, setConversationReady] = useState(false);

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
    setConversationReady(true);
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
    // --- AI Credits: intent lokal tidak memanggil AI → tanpa biaya ---
    const preRouted = routeIntent(msg);
    const needsAi = !(preRouted.localOnly && preRouted.intent !== 'UNKNOWN') && !preRouted.needsClarification;
    if (needsAi && balance.total < chatEstimate.max) {
      // Saldo simulasi tidak cukup → dialog konfirmasi (bukan blokir diam-diam).
      setCreditConfirm({
        estimate: chatEstimate.max,
        pending: () => { setCreditConfirm(null); void submit(text); },
      });
      return;
    }
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
    /* ---- Chat-to-RAB Fase 2: jawaban atas "Lengkapi kebutuhan" ----
     * Bila chat sedang menunggu kelengkapan dan pesan ini berbentuk jawaban
     * (lantai/dimensi/kamar), gabungkan ke ringkasan — jangan lempar ke AI. */
    if (awaitingNeeds) {
      setAwaitingNeeds(false);
      if (looksLikeNeedsAnswer(msg)) {
        try {
          const res = continueRabNeeds(msg);
          const acts = res.actions && res.actions.length > 0 ? res.actions : undefined;
          setMessages((prev) => [...prev, { role: 'assistant', content: res.message, ts: Date.now(), actions: acts }]);
          persistMessage('assistant', res.message);
        } finally {
          setBusy(false);
        }
        return;
      }
    }
    /* ---- Phase 1: local intent router runs BEFORE any AI provider call ---- */
    const routed = routeIntent(msg);
    if (routed.localOnly && routed.intent !== 'UNKNOWN') {
      try {
        const ctx: ChatActionContext = {
          navigate: onNavigate ?? (() => {}),
          rawText: msg,
          currentMenu,
          activeProject,
          projects,
          // FASE 5A/5B: use the deterministic direct total from the live RAB snapshot
          // (same source as get_project_total tool), not the stored grand total.
          projectTotal: projectSnapshot ? projectSnapshot.totalDirect : projectTotal,
          projectItems: projectSnapshot?.items ?? null,
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
          // Game Space opens as an in-chat panel — fully local, no AI call.
          if (res.openGameSpace) setGameSpaceOpen(true);
          // P0 Command Center: wizard & design overlays
          if (res.openRabWizard) setRabWizardOpen(true);
          if (res.openDesignStudio) {
            if (res.designPrompt) setDesignPrompt(res.designPrompt);
            setDesignStudioOpen(true);
          }
          if (res.awaitRabNeeds) setAwaitingNeeds(true);
          // Action buttons — attached to the assistant message
          const entryActions = res.actions && res.actions.length > 0 ? res.actions : undefined;
          setMessages((prev) => [...prev, { role: 'assistant', content: reply, ts: Date.now(), actions: entryActions }]);
          persistMessage('assistant', reply);
          return;
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
      // --- AI Credits: catat pemakaian SIMULASI (batas atas estimasi, transparan) ---
      // FASE 1 RECOVERY (P1-2): debit HANYA bila send() sukses tegas
      // (res.success === true) — kegagalan gateway/HTTP/timeout/respons
      // tidak valid tidak boleh mengurangi saldo. Gerbang tunggal:
      // debitChatCreditOnSuccess (chatCreditDebit.ts, teruji regresi).
      const simUsed = chatEstimate.max;
      debitChatCreditOnSuccess(res, () =>
        consume('chat-ai', simUsed, `Chat AI (${mode === 'fast' ? 'Cepat' : 'Mendalam'}): ${msg.slice(0, 60)}`, {
          model: mode === 'fast' ? 'FAST' : 'ADVANCED',
        }),
      );
      setLastOutcome(res.success ? 'success' : outcomeFromErrorCode(res.errorCode));
      const assistantEntry: ChatEntry = {
        role: 'assistant',
        content: res.reply,
        isError: !res.success,
        model: (res as any).model,
        ts: Date.now(),
        creditsUsed: res.success ? simUsed : undefined,
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
      setLastOutcome('failure');
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

  /* ---- Kontrak navigasi AI terpusat (Tahap B: prefill default).
   * Entry point dari menu lain mendaftarkan initialPrompt lewat requestAiEntry().
   * - sendMode 'prefill' (default): prompt dimasukkan ke kotak input agar
   *   pengguna meninjau sebelum mengirim; TIDAK menimpa draft yang sedang diketik.
   * - sendMode 'autosend': prompt langsung dikirim — hanya untuk entry point
   *   yang eksplisit (terdokumentasi di pemanggil).
   * Entry dikonsumsi sekali-pakai; prompt tidak terkirim dua kali saat remount
   * (guard ref + konsumsi atomik). Pemrosesan lewat state injectedPrompt agar
   * closure `messages` selalu segar (tidak menimpa riwayat hasil restore). */
  const [injectedPrompt, setInjectedPrompt] = useState<{
    text: string;
    sendMode: 'prefill' | 'autosend';
  } | null>(null);
  const mountConsumeRef = useRef(false);
  const takePendingEntry = useCallback(() => {
    const entry = consumePendingAiEntry('chat_agent');
    const text = entry?.initialPrompt?.trim();
    if (!text) return;
    setInjectedPrompt({ text, sendMode: entry?.sendMode ?? 'prefill' });
  }, []);
  // Jalur 1: view baru di-mount setelah navigasi.
  useEffect(() => {
    if (mountConsumeRef.current) return;
    mountConsumeRef.current = true;
    takePendingEntry();
  }, [takePendingEntry]);
  // Jalur 2: view SUDAH ter-mount saat entry didaftarkan (tanpa navigasi ulang).
  useEffect(() => {
    const onEntry = () => takePendingEntry();
    window.addEventListener('ezrab:ai-entry', onEntry);
    return () => window.removeEventListener('ezrab:ai-entry', onEntry);
  }, [takePendingEntry]);
  // Pemrosesan: tunggu percakapan siap + tidak sibuk.
  useEffect(() => {
    if (!injectedPrompt || !conversationReady || busy) return;
    if (injectedPrompt.sendMode === 'autosend') {
      const text = injectedPrompt.text;
      setInjectedPrompt(null);
      submit(text);
    } else if (!input.trim()) {
      setInput(injectedPrompt.text);
      setInjectedPrompt(null);
      requestAnimationFrame(() => autoresize());
    }
    // Bila input sedang terisi: biarkan draft pengguna; prompt titipan
    // menunggu (tidak dihapus, tidak ditimpa) hingga input dikosongkan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [injectedPrompt, conversationReady, busy, input]);

  const copyMsg = (idx: number, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  /* ---------- P0 Command Center: action button handler ---------- */
  /**
   * Push hasil RAB langsung (directRab) ke Spreadsheet RAB proyek aktif.
   * Pola sama dengan "Kirim ke RAB" di AiDesignStudio: konfirmasi implisit
   * lewat klik tombol, cegah duplikat berdasarkan kode, provenance jelas.
   */
  const pushDirectRabToSpreadsheet = () => {
    const appendMsg = (content: string, actions?: ChatActionButton[], isError = false) => {
      const entry: ChatEntry = { role: 'assistant', content, ts: Date.now(), actions, isError };
      setMessages((prev) => [...prev, entry]);
      persistMessage('assistant', content);
    };
    const r = getLastDirectRab();
    if (!r) {
      appendMsg('Tidak ada hasil RAB langsung yang aktif untuk di-push. Buat dulu dengan perintah seperti "buatkan rab rumah type 70 2 lantai".', undefined, true);
      return;
    }
    if (!effProject) {
      appendMsg('Tidak ada proyek aktif. Buat atau buka proyek dulu di menu Proyek, lalu klik "Push ke Spreadsheet RAB" lagi.', undefined, true);
      return;
    }
    const items = r.generation.workItems.filter((w) => Number.isFinite(w.quantity) && w.quantity > 0);
    const existingCodes = new Set(
      ((projectRabItems || []) as Array<{ code?: string }>).map((i) => i.code).filter(Boolean) as string[]
    );
    const payload = items.map((wi) => ({
      description: `[Chat AI] ${wi.name}`,
      volume: wi.quantity,
      unit: wi.unit,
      code: wi.ahspCode ?? wi.workItemId,
      category: wi.category,
      priceStatus: 'PRICE_UNRESOLVED' as const,
      volumeSource: 'AI_GENERATED' as const,
      ...(wi.ahspCode ? { ahspCode: wi.ahspCode } : {}),
    }));
    const newItems = payload.filter((p) => !existingCodes.has(p.code));
    const dupCount = payload.length - newItems.length;
    if (newItems.length === 0) {
      appendMsg(`Semua ${payload.length} item RAB Type ${r.houseType} sudah ada di Spreadsheet RAB proyek "${effProject.name}" (duplikat dicegah).`, [
        { label: 'Buka Spreadsheet RAB', action: { kind: 'navigate', menu: 'rab-estimasi' } },
      ]);
      return;
    }
    try {
      const added = bulkAddRabItems(newItems);
      const unpriced = newItems.filter((p) => !p.ahspCode).length;
      appendMsg(
        `✅ ${added.length} item RAB Rumah Type ${r.houseType} (${r.floors} lantai) berhasil di-push ke Spreadsheet RAB proyek "${effProject.name}".` +
          (dupCount > 0 ? ` ${dupCount} item dilewati karena sudah ada.` : '') +
          (unpriced > 0
            ? ` ${unpriced} item belum terhubung AHSP — harganya masih kosong (bukan Rp0); lengkapi lewat pencarian AHSP di spreadsheet.`
            : ' Semua item terhubung ke kode AHSP.'),
        [{ label: 'Buka Spreadsheet RAB', action: { kind: 'navigate', menu: 'rab-estimasi' } }]
      );
    } catch (e) {
      appendMsg(`Gagal mem-push ke Spreadsheet RAB: ${(e as Error).message}`, undefined, true);
    }
  };

  const handleActionButton = (btn: ChatActionButton) => {
    if (btn.action.kind === 'push-rab') {
      pushDirectRabToSpreadsheet();
    } else if (btn.action.kind === 'navigate') {
      navigateChat(btn.action.menu);
    } else if (btn.action.intent === 'START_RAB_WIZARD') {
      // Chat-to-RAB Fase 2: tombol "Rumah tinggal" TIDAK lagi membuka wizard
      // langsung — tampilkan ringkasan kebutuhan dulu (lewat router).
      void submit('buatkan RAB rumah tinggal');
    } else if (btn.action.intent === 'OPEN_DESIGN_WORKSPACE' || btn.action.intent === 'START_HOUSE_DESIGN') {
      // Klik tombol ini = persetujuan pengguna. Fase 3: buka HALAMAN workspace
      // penuh (bukan overlay) — prompt dari ringkasan diteruskan via entry
      // navigasi AI sekali-pakai, konteks chat tetap utuh untuk kembali.
      const prompt = btn.action.param ?? getLastRabDesignPrompt() ?? undefined;
      requestAiEntry('design_workspace', {
        projectId: effProject?.id ?? null,
        initialPrompt: prompt,
        sourceMenu: currentMenu,
      });
      navigateChat('desain-rab');
    } else if (btn.action.intent === 'RAB_NEEDS_REFINE') {
      const res = executeIntent('RAB_NEEDS_REFINE', undefined, {
        navigate: onNavigate ?? (() => {}),
        currentMenu,
        activeProject,
        projects,
        projectTotal: projectSnapshot ? projectSnapshot.totalDirect : projectTotal,
        projectItems: projectSnapshot?.items ?? null,
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: res.message, ts: Date.now() }]);
      persistMessage('assistant', res.message);
      if (res.awaitRabNeeds) setAwaitingNeeds(true);
    } else {
      // Fallback: kirim sebagai pesan
      submit(btn.label);
    }
  };

  // Navigasi chat → menu workspace (menggunakan navigateTo dari routing).
  // PENTING: jangan pakai require() di sini — bundle browser Vite adalah ESM murni,
  // require tidak terdefinisi sehingga SELALU melempar dan semua tombol navigasi
  // chat gagal dengan "Tidak dapat membuka menu" (bug terbukti di Preview 2026-10-21).
  // Proyek aktif diteruskan agar menu bermuatan proyek (ded-ai, rab-estimasi)
  // membuka varian di dalam proyek, bukan keluar ke halaman global.
  const navigateChat = (menu: string) => {
    try {
      navigateTo(routeForMenu(menu as never, effProject?.id ?? null));
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: `Tidak dapat membuka menu "${menu}" saat ini.`, isError: true, ts: Date.now() }]);
    }
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
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6 }}>
        <CreditEstimateBadge estimate={chatEstimate} />
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
            {deriveAiStatus({ gateway: gatewayReach, authKind, lastOutcome, busy }).label}
          </div>
        </div>
        <div className="ezchat2-actions">
          <CreditBalance compact onOpenCreditPage={() => onNavigate?.('kredit-ai')} />
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
                    {/* P0 Command Center: action buttons */}
                    {m.actions && m.actions.length > 0 && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                        {m.actions.map((btn, bi) => (
                          <button key={bi}
                            onClick={() => handleActionButton(btn)}
                            style={{
                              padding: '8px 14px', borderRadius: 8, border: '1px solid #0EA5E9',
                              background: '#EFF6FF', color: '#1E3A5F', fontWeight: 600,
                              fontSize: 13, cursor: 'pointer',
                            }}>
                            {btn.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="ezchat2-meta">
                      {m.model && <span className="ezchat2-model"><Sparkles size={11} /> {m.model}</span>}
                      {m.creditsUsed !== undefined && (
                        <span className="ezchat2-model" title="Pemakaian simulasi frontend — bukan penagihan nyata">
                          ⚡ {m.creditsUsed} kredit (simulasi)
                        </span>
                      )}
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

      {/* ===== Dialog saldo tidak cukup (simulasi) ===== */}
      {creditConfirm && (
        <div className="aic-modal-veil" onClick={() => setCreditConfirm(null)} role="dialog" aria-modal="true" aria-label="Saldo kredit tidak cukup">
          <div className="aic-modal aic" onClick={(e) => e.stopPropagation()}>
            <h3>Saldo kredit tidak cukup</h3>
            <p className="aic-sub">
              Mode {mode === 'fast' ? 'Cepat' : 'Mendalam'} membutuhkan estimasi hingga{' '}
              <strong>{creditConfirm.estimate} kredit (simulasi)</strong>, sedangkan saldo
              simulasi Anda {balance.total.toLocaleString('id-ID')} kredit.
            </p>
            <div className="aic-confirm-list">
              <div className="row"><span>Estimasi pemakaian</span><strong>{creditConfirm.estimate} kredit</strong></div>
              <div className="row"><span>Saldo simulasi</span><strong>{balance.total.toLocaleString('id-ID')} kredit</strong></div>
            </div>
            <div className="aic-modal-actions">
              <button type="button" className="aic-btn-ghost" onClick={() => setCreditConfirm(null)}>Batal</button>
              <button type="button" className="aic-btn-ghost" onClick={() => { setCreditConfirm(null); setCreditTopUpOpen(true); }}>
                Top-up (simulasi)
              </button>
              <button type="button" className="aic-btn-primary" onClick={() => creditConfirm.pending()}>
                Tetap kirim
              </button>
            </div>
          </div>
        </div>
      )}
      {creditTopUpOpen && <CreditTopUpModal onClose={() => setCreditTopUpOpen(false)} />}

      {/* ===== EZRAB Game Space — in-chat interactive panel ===== */}
      {gameSpaceOpen && (
        <Suspense fallback={null}>
          <GameSpaceOverlay onClose={() => setGameSpaceOpen(false)} />
        </Suspense>
      )}

      {/* ===== P0/P1/P2: Wizard → Design Studio flow ===== */}
      {rabWizardOpen && (
        <Suspense fallback={null}>
          <div style={{
            position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,23,42,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}>
            <div style={{ maxWidth: 1150, width: '100%', maxHeight: '92vh', overflowY: 'auto', background: 'var(--ez-color-background)', borderRadius: 16 }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 12px 0' }}>
                <button onClick={() => setRabWizardOpen(false)}
                  style={{ padding: '7px 14px', borderRadius: 10, border: '1px solid var(--ez-color-border)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-secondary)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  ✕ Tutup
                </button>
              </div>
              <DesignWizardFlowLazy
                onClose={() => setRabWizardOpen(false)}
              />
            </div>
          </div>
        </Suspense>
      )}

      {/* ===== P2: AI Design Studio overlay ===== */}
      {designStudioOpen && (
        <Suspense fallback={null}>
          <div style={{
            position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,23,42,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}>
            <div style={{ maxWidth: 1150, width: '100%', maxHeight: '92vh', overflowY: 'auto', background: 'var(--ez-color-background)', borderRadius: 16, padding: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 8px 0' }}>
                <button onClick={() => setDesignStudioOpen(false)}
                  style={{ padding: '7px 14px', borderRadius: 10, border: '1px solid var(--ez-color-border)', background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-secondary)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  ✕ Tutup
                </button>
              </div>
              <DesignStudioLazy initialPrompt={designPrompt} />
            </div>
          </div>
        </Suspense>
      )}
    </div>
  );
};

export default EzrabAiView;

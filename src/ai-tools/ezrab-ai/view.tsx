/**
 * EzrabAiView — Ezrab Chat AI v2.
 * - Layout sederhana ala ChatGPT/Gemini (penyederhanaan owner 2026-10-23):
 *   satu kolom tanpa scroll halaman; mode awal = maskot besar di tengah +
 *   sapaan kecil + composer di tengah + daftar Riwayat Percakapan kompak;
 *   mode berisi = daftar pesan (scroll internal) + composer di bawah;
 *   riwayat juga bisa dibuka dari tombol "Riwayat" di header (panel dropdown).
 * - Tinggi root DIUKUR dari sisa ruang nyata di kontainer scroll shell
 *   (--ezchat2-avail), BUKAN konstanta calc(100dvh - 64px) — konstanta itu
 *   membuat shell overflow ±20px di konteks proyek (TopBar sticky 54px +
 *   breadcrumb ±29px) sehingga header chat tercrop di atas (fix 2026-10-24,
 *   lihat komentar .ezchat2 di ezrab-ai-chat.css).
 * - Maskot kanonis EZRAB (EZRABMascotLucu): mini 44px di header dan BESAR
 *   (168px, eye-tracking interaktif) di tengah mode awal — permintaan owner
 *   2026-10-24 agar maskot tidak dihilangkan dari mode chat.
 * - Royal-blue brand theme (#2563EB), bubble Gemini-style.
 * - Mic voice input (Web Speech API, id-ID), lampir gambar (thumbnail di bubble
 *   user + catatan jujur ke AI bahwa gambar tak bisa dilihat model teks),
 *   timestamp, mode Cepat/Mendalam, tombol chat baru, salin jawaban.
 */
import React, { useRef, useState, useEffect, useLayoutEffect, useCallback, Suspense, lazy } from 'react';
import {
  Send, Sparkles, Loader2, RotateCcw,
  Copy, Check, Mic, Paperclip, X, Plus, FileText,
  History, Trash2, MoreVertical, Gamepad2,
} from 'lucide-react';
import { ezrabAiService } from './service';
import {
  TEXT_ATTACHMENT_ACCEPT,
  buildTextAttachmentBlock,
  formatTextAttachmentSize,
  readTextAttachment,
  type TextAttachment,
} from './textAttachment';
import { debitChatCreditOnSuccess } from './chatCreditDebit';

import { renderMarkdown } from './markdown';
import { routeIntent, localGreeting, HELP_TEXT } from './intentRouter';
import { extractSlashToken, filterSlashEntries, NAV_BY_ID, resolveNavCommand, type NavEntry } from './navRegistry';
import { consumePendingAiEntry, requestAiEntry, consumePendingEzrabAiEntry, peekPendingEzrabAiEntry, ezrabAiEntryRemainingMs, openEzrabAI, type EzrabAiEntryContext } from '../aiNavigation';
import { executeIntent, continueRabNeeds, continueRabChoice, tryContinueRabSubtype, getLastRabDesignPrompt, ChatActionContext, ChatActionButton } from './actionRegistry';
import { getLastDirectRab } from './directRab';
import { classifyRequest, minDelayFor, statusTextFor, waitForMinimum, waitForRabMinimum, rabMinDelayMs, activityForRequest, createRequestCoordinator, isAbortError, type AiActivity } from '../aiResponseTiming';
import { mapDirectRabPushItems } from './directRabPush';
import { getLastUniversalDraft, setLastUniversalDraft, looksLikeUniversalRevision, reviseUniversalDraft, buildPushPreview, formatPushPreviewMessage, buildPushPayload, dedupePushPayload, validateTransfer, draftReadiness } from './universalRab';
import { looksLikeNeedsAnswer } from './rabNeeds';
import { notificationBus } from '../../notifications/notificationBus';
import { navigateTo, paths, routeForMenu } from '../../routing/routes';
import { EZRABMascotLucu } from '../../components/mascot/EZRABMascotLucu';
import { useProject } from '../../context/ProjectContext';
import { buildProjectSnapshot, ProjectSnapshot } from './projectContext';
import { unifiedConversationStore } from '../../services/ai/conversation/unifiedConversationStore';
import './ezrab-ai-chat.css';
import '../../ai-credits/ai-credits.css';
import { useCreditSimulation } from '../../ai-credits/useCreditSimulation';
import { tariffFor } from '../../ai-credits/config';
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
  /** Entry jawaban yang berasal dari pipeline AI (service.send) — pembeda
   *  dari error lokal registry/push agar tombol "Coba Lagi" hanya tampil
   *  pada kegagalan AI yang memang bisa dikirim ulang. */
  fromAi?: boolean;
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

const MASCOT_PNG = '/images/ezrab-mascot-greeting.png';

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

/* Tanggal ringkas id-ID untuk daftar riwayat percakapan. */
const fmtHistoryDate = (ts: number) => {
  const diff = Date.now() - ts;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'Baru saja';
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))} menit lalu`;
  if (diff < day) return `${Math.floor(diff / hour)} jam lalu`;
  if (diff < 2 * day) return 'Kemarin';
  return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

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
  // Timing terpusat (spesifikasi 2026-10-27): teks status pemrosesan
  // mengikuti klasifikasi permintaan; timer dibersihkan saat unmount.
  const [thinkingText, setThinkingText] = useState('EZRAB sedang berpikir…');
  const timingCoordinatorRef = useRef(createRequestCoordinator());
  const submitAbortRef = useRef<AbortController | null>(null);

  const [mode, setMode] = useState<'fast' | 'advanced'>('fast');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  /* Lampiran file TEKS (2026-10-26): isi dibaca via File.text() dan dikirim
   * sebagai blok konteks ke AI. Jalur lampiran gambar lama dihapus — model
   * teks tidak bisa "melihat" gambar sehingga lampiran gambar tidak berguna.
   * Pesan penolakan format/ukuran tampil inline di `attachError`. */
  const [attached, setAttached] = useState<TextAttachment | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
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
  /** D1: kartu pilihan RAB bertipe menunggu koreksi/pilihan pengguna */
  const [awaitingChoice, setAwaitingChoice] = useState(false);
  /** Klarifikasi subtipe (2026-10-23): menunggu jawaban "Jalan apa?" */
  const [awaitingSubtype, setAwaitingSubtype] = useState(false);
  /** Klarifikasi topik (2026-10-23): menunggu query lanjutan atas kartu
   *  klarifikasi — nilai = mode ('ahsp' | 'harga-material' | 'harga-upah'
   *  | 'harga-alat' | 'template'); null = tidak menunggu. */
  const [awaitingClarify, setAwaitingClarify] = useState<string | null>(null);
  /** Full AI dari kartu jalur: pesan berikutnya WAJIB ke pipeline AI
   *  (lewati router lokal) — prompt-nya memang berbentuk perintah RAB yang
   *  akan tertangkap CREATE_RAB_SUMMARY bila dirutekan ulang. */
  const forceAiRef = useRef(false);
  /** Teks user terakhir yang BENAR-BENAR dikirim ke pipeline AI
   *  (diisi tepat sebelum service.send — bukan pada jawaban lokal
   *  registry). Target tombol "Coba Lagi" pada pesan error AI. */
  const lastAiPromptRef = useRef<string | null>(null);
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
  // Cermin state dari convIdRef agar item aktif di daftar riwayat bisa
  // ter-highlight dan ikut re-render.
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  // True setelah percakapan tersimpan selesai di-restore — entry AI baru
  // diproses setelah ini agar tidak menimpa riwayat (stale closure).
  const [conversationReady, setConversationReady] = useState(false);

  /* ---- Riwayat Percakapan (daftar kompak di mode awal + panel header) ---- */
  interface HistoryItem { id: string; title: string; updatedAt: number; messageCount: number }
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  /** Panel dropdown riwayat dari tombol "Riwayat" di header. */
  const [historyOpen, setHistoryOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const refreshHistory = useCallback(() => {
    try {
      const list = unifiedConversationStore.listConversations(storeProjectId);
      setHistoryItems(list.slice(0, 8).map((c) => {
        const rawTitle = (c.title ?? '').trim();
        const placeholder = !rawTitle || rawTitle === 'Percakapan baru' || rawTitle === 'Percakapan Copilot';
        const firstUser = (c.messages ?? []).find((m) => m.role === 'user');
        return {
          id: c.id,
          title: placeholder
            ? (firstUser ? firstUser.content.slice(0, 60) : 'Percakapan baru')
            : rawTitle,
          updatedAt: c.updatedAt,
          messageCount: (c.messages ?? []).length,
        };
      }));
    } catch {
      /* storage failure is non-fatal — riwayat hanya tidak tampil */
    }
  }, [storeProjectId]);

  // Segarkan daftar saat percakapan siap, saat jumlah pesan berubah, dan
  // saat store berubah (pesan masuk dari permukaan AI lain).
  useEffect(() => { refreshHistory(); }, [refreshHistory, conversationReady, messages.length]);
  // Bersihkan timer pemrosesan AI saat view dilepas: submit yang sedang
  // menunggu minimum tidak boleh menampilkan hasil basi setelah unmount.
  useEffect(() => () => { submitAbortRef.current?.abort(); }, []);
  useEffect(() => {
    try {
      return unifiedConversationStore.subscribe(() => refreshHistory());
    } catch {
      return undefined;
    }
  }, [refreshHistory]);

  // Load persisted conversation on mount / project change.
  useEffect(() => {
    try {
      const conv = unifiedConversationStore.getOrCreateActiveConversation(storeProjectId);
      convIdRef.current = conv.id;
      setActiveConvId(conv.id);
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
  /* ---- Tinggi root terukur (fix crop atas, 2026-10-24) ----
   * Root .ezchat2 harus mengisi PERSIS sisa ruang vertikal di dalam
   * kontainer scroll shell (.pf-main di WorkspaceView): TopBar sticky
   * (54px + breadcrumb ±29px di konteks proyek) + <main> yang hanya
   * minHeight membuat rumus lama calc(100dvh - 64px) kelebihan ±20px —
   * shell ikut scroll dan header chat tertutup bar breadcrumb (tercrop).
   * Di sini tinggi diukur dalam koordinat KONTEN kontainer (kebal posisi
   * scroll): clientHeight kontainer dikurangi offset atas root di dalam
   * konten. Hasilnya disuntikkan sebagai CSS var --ezchat2-avail; CSS
   * memakai calc() lama hanya sebagai fallback pra-pengukuran. Diukur
   * ulang saat mount (termasuk sekali sesudah animasi masuk menu 0,28s
   * yang menggeser rect sementara), resize, dan rotasi layar. */
  const rootRef = useRef<HTMLDivElement>(null);
  const [availH, setAvailH] = useState<number | null>(null);
  /* Kunci scroll shell (owner 2026-10-27): menu Chat AI TIDAK boleh
   * discroll sebagai halaman — yang boleh discroll hanya daftar
   * percakapan di dalam (.ezchat2-body, overflow-y auto, scrollbar
   * disembunyikan). Selama view ini aktif, .pf-main dikunci ke
   * overflow-y hidden + scrollTop 0 (composer jadi selalu terlihat di
   * bawah, tidak terdorong ke bawah lipatan); saat view dilepas,
   * overflow + posisi scroll shell dikembalikan persis seperti semula
   * agar menu lain tetap bisa discroll normal. */
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const container = el.closest('.pf-main') as HTMLElement | null;
    if (!container) return undefined;
    const prevOverflowY = container.style.overflowY;
    const prevScrollTop = container.scrollTop;
    container.style.overflowY = 'hidden';
    container.scrollTop = 0;
    return () => {
      container.style.overflowY = prevOverflowY;
      container.scrollTop = prevScrollTop;
    };
  }, []);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const measure = () => {
      const container = el.closest('.pf-main') as HTMLElement | null;
      let h: number;
      if (container) {
        const cRect = container.getBoundingClientRect();
        const eRect = el.getBoundingClientRect();
        const contentTop = (eRect.top - cRect.top) + container.scrollTop;
        h = container.clientHeight - contentTop;
      } else {
        /* Di luar shell workspace (fallback): ukur dari tepi atas root
         * ke dasar viewport. */
        h = window.innerHeight - el.getBoundingClientRect().top;
      }
      if (h > 0) {
        const next = Math.floor(h);
        setAvailH((prev) => (prev !== null && Math.abs(prev - next) < 1 ? prev : next));
      }
    };
    measure();
    const t = window.setTimeout(measure, 350);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<EzrabSpeechRecognition | null>(null);
  const sttBaseRef = useRef('');
  const sttFinalRef = useRef('');

  /* (Dihapus 2026-10-26 bersama jalur lampiran gambar: tidak ada lagi
   * object URL yang perlu dikelola — lampiran kini teks murni di state.) */

  /* Auto-scroll TIDAK boleh merampas bacaan: bila pengguna sedang
     membaca pesan lama (sudah scroll ke atas), jawaban baru / indikator
     mengetik tidak boleh menariknya paksa ke bawah. Hanya scroll bila
     posisi sudah dekat dasar (<160px) — kondisi normal saat mengirim. */
  const nearBottomRef = useRef(true);
  const onBodyScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
  };
  useEffect(() => {
    const el = scrollRef.current;
    if (el && nearBottomRef.current) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  /* Bersihkan sesi STT saat unmount. */
  useEffect(() => {
    return () => {
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      if (rec) { try { rec.abort(); } catch { /* abaikan */ } }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const autoresize = () => {
    const ta = taRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`; }
  };

  const newChat = () => {
    /* Dilarang saat sibuk: permintaan yang sedang berjalan akan
       menempelkan jawabannya ke percakapan BARU (append fungsional +
       convId sudah berganti) sehingga jawaban muncul tanpa pertanyaan. */
    if (busy) return;
    setHistoryOpen(false);
    setMessages([]);
    setInput('');
    setAwaitingNeeds(false);
    setAwaitingChoice(false);
    setAwaitingSubtype(false);
    setAwaitingClarify(null);
    forceAiRef.current = false;
    setAttached(null);
    setAttachError(null);
    autoresize();
    try {
      const conv = unifiedConversationStore.createConversation(storeProjectId, 'Percakapan baru');
      unifiedConversationStore.setActiveConversationId(storeProjectId, conv.id);
      convIdRef.current = conv.id;
      setActiveConvId(conv.id);
    } catch {
      /* non-fatal */
    }
  };

  /* Muat percakapan dari daftar riwayat: pemetaan restore
   * SAMA seperti useEffect mount — hanya pesan user/assistant, ts dari
   * createdAt. Semua status menunggu (needs/choice/subtype + paksa-AI)
   * direset agar konteks lama tidak bocor ke percakapan yang dimuat. */
  const loadConversation = (id: string) => {
    if (busy) return;
    setHistoryOpen(false);
    if (id === convIdRef.current) return;
    try {
      const conv = unifiedConversationStore.getConversation(id, storeProjectId);
      if (!conv) return;
      unifiedConversationStore.setActiveConversationId(storeProjectId, id);
      convIdRef.current = id;
      setActiveConvId(id);
      setAttached(null);
      setAttachError(null);
      setInput('');
      setAwaitingNeeds(false);
      setAwaitingChoice(false);
      setAwaitingSubtype(false);
      setAwaitingClarify(null);
      forceAiRef.current = false;
      const restored: ChatEntry[] = (conv.messages ?? [])
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          ts: m.createdAt ? Date.parse(m.createdAt) || Date.now() : Date.now(),
        }));
      setMessages(restored);
      autoresize();
    } catch {
      /* non-fatal — percakapan aktif tidak berubah */
    }
  };

  /* Muat Ulang (2026-10-23, direstorasi 2026-10-26 ke menu overflow):
   * reset state tampilan yang macet TANPA menghapus percakapan — busy
   * dibersihkan, dialog kredit ditutup, semua status menunggu direset,
   * lalu percakapan aktif di-restore ulang dari store dengan pemetaan
   * yang sama seperti mount / loadConversation. Sengaja TIDAK tampil
   * sebagai tombol besar di header lagi (redesign Gemini-minimal). */
  const reloadChat = () => {
    setHistoryOpen(false);
    setMenuOpen(false);
    setBusy(false);
    setCreditConfirm(null);
    setAwaitingNeeds(false);
    setAwaitingChoice(false);
    setAwaitingSubtype(false);
    setAwaitingClarify(null);
    forceAiRef.current = false;
    try {
      const conv = unifiedConversationStore.getOrCreateActiveConversation(storeProjectId);
      convIdRef.current = conv.id;
      setActiveConvId(conv.id);
      const restored: ChatEntry[] = (conv.messages ?? [])
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          ts: m.createdAt ? Date.parse(m.createdAt) || Date.now() : Date.now(),
        }));
      setMessages(restored);
    } catch {
      /* non-fatal — tampilan saat ini dipertahankan */
    }
  };

  const deleteHistoryItem = (id: string) => {
    if (busy) return;
    try {
      const wasActive = convIdRef.current === id;
      unifiedConversationStore.deleteConversation(id, storeProjectId);
      if (wasActive) newChat();
      else refreshHistory();
    } catch {
      /* non-fatal */
    }
  };

  const submit = async (text?: string, opts?: { echo?: boolean }) => {
    const msg = (text ?? input).trim();
    // echo=false = mode "Coba Lagi": kirim ulang prompt terakhir ke
    // pipeline AI TANPA gelembung user duplikat dan tanpa mengosongkan
    // draft yang sedang diketik pengguna.
    const echo = opts?.echo !== false;
    if ((!msg && !attached) || busy) return;
    // Timing terpusat: minimum dihitung SEJAK kirim ditekan (bukan sejak
    // provider selesai) — lihat aiResponseTiming.ts.
    const timingStart = Date.now();
    const timingRequestId = timingCoordinatorRef.current.next();
    const submitAbort = new AbortController();
    submitAbortRef.current = submitAbort;
    /* Full AI (klik tombol di kartu jalur): pesan ini prompt terkumpul yang
     * memang harus diproses pipeline AI — router lokal dilewati, tetapi
     * gerbang kredit & pencatatan pemakaian tetap berlaku persis seperti
     * pesan AI biasa. Bendera sekali-pakai; dialog konfirmasi kredit
     * memasangnya lagi sebelum memanggil ulang submit. */
    const forcedAi = forceAiRef.current;
    forceAiRef.current = false;
    closeSlash();
    /* Command Router (2026-10-26): resolver navigasi deterministik.
     * TIDAK PERNAH membajak prompt Full AI (forcedAi). Hasil non-'none'
     * juga membebaskan dari dialog kredit: navigasi itu gratis, dan tanpa
     * pengecualian ini perintah baru (slash baru / sinonim alami) akan
     * tertahan dialog karena preRouted-nya UNKNOWN/needsClarification. */
    const navEarly = forcedAi ? null : resolveNavCommand(msg);
    const navHit = navEarly && navEarly.mode !== 'none' ? navEarly : null;
    // --- AI Credits: intent lokal tidak memanggil AI → tanpa biaya ---
    const preRouted = routeIntent(msg);
    const needsAi = forcedAi || (!(preRouted.localOnly && preRouted.intent !== 'UNKNOWN') && !preRouted.needsClarification);
    if (needsAi && !navHit && balance.total < chatEstimate.max) {
      // Saldo simulasi tidak cukup → dialog konfirmasi (bukan blokir diam-diam).
      setCreditConfirm({
        estimate: chatEstimate.max,
        pending: () => { setCreditConfirm(null); forceAiRef.current = forcedAi; void submit(text, opts); },
      });
      return;
    }
    const att = echo ? attached : null;
    /* Lampiran file teks: isinya dikirim sebagai blok konteks terdelimitasi
     * bersama pesan lewat jalur service.send yang sama (tanpa endpoint
     * baru). Gelembung user hanya menampilkan pesan asli; blok lampiran
     * adalah konteks kirim, bukan teks yang ditampilkan/dipersistenkan. */
    const content = att
      ? (msg ? `${msg}\n\n${buildTextAttachmentBlock(att)}` : buildTextAttachmentBlock(att))
      : msg;
    if (echo) setInput('');
    if (att) { setAttached(null); setAttachError(null); }
    autoresize();
    const entry: ChatEntry = {
      role: 'user', content: msg || '(file teks terlampir)', ts: Date.now(),
    };
    let next: ChatEntry[];
    if (echo) {
      next = [...messages, entry];
      setMessages(next);
      persistMessage('user', entry.content);
    } else {
      // Coba lagi: entry user hanya menjadi konteks payload AI (di ujung
      // `next`), TIDAK ditampilkan sebagai gelembung baru dan tidak
      // dipersistensikan ulang. Tampilan dibersihkan dari entry error
      // asisten terakhir — percobaan ini menggantikannya.
      const cleaned = [...messages];
      for (let i = cleaned.length - 1; i >= 0; i--) {
        if (cleaned[i].role === 'assistant' && cleaned[i].isError) { cleaned.splice(i, 1); break; }
      }
      setMessages(cleaned);
      next = [...cleaned, entry];
    }
    setBusy(true);
    // Klasifikasi + teks status (aktivitas RAB → complex / "menyiapkan
    // RAB"; sisanya dari teks). Berlaku untuk SEMUA balasan chat di
    // bawah (lokal, revisi, maupun LLM) — kecuali navigasi langsung
    // (navHit) yang memang bukan permintaan AI dan tetap instan.
    const timingActivity: AiActivity =
      preRouted.intent === 'CREATE_RAB_DIRECT' ||
      preRouted.intent === 'GENERATE_RAB_TEMPLATE' ||
      preRouted.intent === 'RAB_FULL_AI' ||
      activityForRequest(msg) === 'rab'
        ? 'rab'
        : 'chat';
    const timingComplexity = classifyRequest(msg, timingActivity);
    const timingMinDelay = minDelayFor(timingComplexity);
    setThinkingText(statusTextFor(timingComplexity, timingActivity));
    // Gerbang penampil hasil: menunggu sisa minimum (paralel dengan
    // provider, bukan sesudahnya); false = dibatalkan (unmount) atau
    // disalip permintaan yang lebih baru → hasil TIDAK ditampilkan.
    // RAB (owner 2026-10-27): minimum 5–10 detik dari BESARNYA HASIL,
    // bukan dari prompt — jadi gateWait menerima teks balasan dan
    // menghitung rabMinDelayMs dari situ. Non-RAB tetap 1/2/3 detik.
    const gateWait = async (resultText?: string): Promise<boolean> => {
      try {
        const minMs = timingActivity === 'rab' ? rabMinDelayMs(resultText ?? '') : timingMinDelay;
        await waitForMinimum(timingStart, minMs, Promise.resolve(), submitAbort.signal);
      } catch (e) {
        if (isAbortError(e)) return false;
        throw e;
      }
      return timingCoordinatorRef.current.isLatest(timingRequestId);
    };
    // Satu-satunya jalan menampilkan balasan asisten di cabang-cabang
    // lokal/revisi di bawah (LLM memakai gerbang langsung karena
    // entrinya membawa field tambahan fromAi/model/creditsUsed).
    const postAssistant = async (content: string, actions?: ChatActionButton[]): Promise<boolean> => {
      if (!(await gateWait(content))) return false;
      setMessages((prev) => [...prev, { role: 'assistant', content, ts: Date.now(), actions }]);
      persistMessage('assistant', content);
      return true;
    };
    /* ---- D1: koreksi pra-pilih pada kartu pilihan RAB bertipe ----
     * Selama kartu pilihan aktif, pesan berbentuk koreksi spek (lantai/
     * dimensi/kamar/luas) digabung ke kartu dan kartu di-render ulang
     * dengan spek terkoreksi — BUKAN dilempar ke AI dan BUKAN dianggap
     * perintah baru. Pesan berbentuk lain menggugurkan status menunggu
     * dan diproses normal di bawah. */
    if (!forcedAi && awaitingChoice) {
      if (looksLikeNeedsAnswer(msg)) {
        try {
          const res = continueRabChoice(msg);
          const acts = res.actions && res.actions.length > 0 ? res.actions : undefined;
          await postAssistant(res.message, acts);
          if (!res.awaitRabChoice) setAwaitingChoice(false);
        } finally {
          setBusy(false);
        }
        return;
      }
      setAwaitingChoice(false);
    }
    /* ---- Klarifikasi subtipe (2026-10-23): jawaban atas "Jalan apa?" ----
     * Selama pertanyaan subtipe aktif, pesan yang menyebut subtipe dari
     * peta kategori yang menunggu digabung ke kebutuhan dan kartu jalur
     * ditampilkan — BUKAN dilempar ke AI. Pesan tanpa subtipe (perintah
     * baru) menggugurkan status menunggu dan diproses normal di bawah. */
    if (!forcedAi && awaitingSubtype) {
      const subRes = tryContinueRabSubtype(msg);
      if (subRes) {
        const acts = subRes.actions && subRes.actions.length > 0 ? subRes.actions : undefined;
        setMessages((prev) => [...prev, { role: 'assistant', content: subRes.message, ts: Date.now(), actions: acts }]);
        persistMessage('assistant', subRes.message);
        setAwaitingSubtype(false);
        setBusy(false);
        return;
      }
      setAwaitingSubtype(false);
    }
    /* ---- Chat-to-RAB Fase 2: jawaban atas "Lengkapi kebutuhan" ----
     * Bila chat sedang menunggu kelengkapan dan pesan ini berbentuk jawaban
     * (lantai/dimensi/kamar), gabungkan ke ringkasan — jangan lempar ke AI. */
    if (!forcedAi && awaitingNeeds) {
      setAwaitingNeeds(false);
      if (looksLikeNeedsAnswer(msg)) {
        try {
          const res = continueRabNeeds(msg);
          const acts = res.actions && res.actions.length > 0 ? res.actions : undefined;
          await postAssistant(res.message, acts);
        } finally {
          setBusy(false);
        }
        return;
      }
    }
    /* ---- Klarifikasi topik (2026-10-23): query lanjutan kartu klarifikasi ----
     * Selama mode klarifikasi aktif, pesan diperlakukan sebagai QUERY untuk
     * mode itu (nama pekerjaan / material / template) dan dijawab lokal
     * lewat CLARIFY_QUERY — BUKAN perintah baru dan BUKAN dilempar ke LLM.
     * Pengecualian: pesan yang router kenali sebagai perintah lokal SPESIFIK
     * (intent lokal selain UNKNOWN dan CLARIFY_TOPIC) menggugurkan mode
     * klarifikasi dan diproses normal di bawah. */
    if (!forcedAi && awaitingClarify) {
      const routedClarify = routeIntent(msg);
      // Perintah navigasi asli (Command Router) juga menggugurkan mode
      // klarifikasi — kalau tidak, perintah target baru ditelan sebagai
      // CLARIFY_QUERY karena routeIntent mengembalikan UNKNOWN untuknya.
      if (navHit || (routedClarify.localOnly && routedClarify.intent !== 'UNKNOWN' && routedClarify.intent !== 'CLARIFY_TOPIC')) {
        setAwaitingClarify(null);
      } else {
        try {
          const res = executeIntent('CLARIFY_QUERY', msg, {
            navigate: (menu: string) => navigateChat(menu),
            rawText: msg,
            currentMenu,
            activeProject,
            projects,
            projectTotal: projectSnapshot ? projectSnapshot.totalDirect : projectTotal,
            projectItems: projectSnapshot?.items ?? null,
            clarifyMode: awaitingClarify,
          });
          const acts = res.actions && res.actions.length > 0 ? res.actions : undefined;
          await postAssistant(res.message, acts);
          setAwaitingClarify(res.awaitClarify ?? null);
        } finally {
          setBusy(false);
        }
        return;
      }
    }
    /* ---- Command Router (Fase 3/5): navigasi deterministik ----
     * Berjalan SETELAH waiting-state (pilihan/subtipe/needs/klarifikasi) dan
     * SEBELUM Phase-1 routeIntent, agar slash baru tidak ditelan klarifikasi
     * "perintah tidak dikenal" dan sinonim alami tidak ditelan AI.
     * Direct = navigasi LANGSUNG tanpa konfirmasi kedua (perintah eksplisit
     * "buka" + intent pasti); suggest/ambiguous = pesan + chip saja, tanpa
     * pindah halaman. Pesan asisten dipersistenkan supaya terlihat di
     * riwayat saat pengguna kembali ke chat. */
    if (!forcedAi && navHit) {
      try {
        if (navHit.mode === 'direct') {
          const navText = `Membuka ${navHit.entry.label}…`;
          setMessages((prev) => [...prev, { role: 'assistant', content: navText, ts: Date.now() }]);
          persistMessage('assistant', navText);
          // F-06: perintah AHSP dengan kata kunci sisa → katalog sudah
          // terfilter (?q=) lewat parameter URL F-05, bukan katalog default.
          if (navHit.entry.id === 'ahsp' && navHit.ahspQuery) {
            navigateTo(`${paths.ahsp()}?q=${encodeURIComponent(navHit.ahspQuery)}`);
          } else {
            navigateNavEntry(navHit.entry);
          }
        } else {
          const acts: ChatActionButton[] = navHit.candidates.map((c) => ({
            label: `Buka ${c.label}`,
            action: { kind: 'nav-entry', entryId: c.id },
          }));
          setMessages((prev) => [...prev, { role: 'assistant', content: navHit.message, ts: Date.now(), actions: acts }]);
          persistMessage('assistant', navHit.message);
        }
      } finally {
        setBusy(false);
      }
      return;
    }
    /* ---- Revisi draft universal (2026-10-26) ----
     * Bila draft universal aktif dan pesan ini perintah revisi (bukan
     * permintaan RAB baru / navigasi), terapkan revisi lokal tanpa AI
     * dan tanpa kredit. Revisi yang tidak dikenali jatuh ke routing
     * normal di bawah (tidak ditelan). */
    if (!forcedAi && getLastUniversalDraft() && looksLikeUniversalRevision(msg)) {
      const draftRev = getLastUniversalDraft()!;
      const rev = reviseUniversalDraft(draftRev, msg);
      if (rev) {
        const acts: ChatActionButton[] | undefined = rev.changed
          ? [
              { label: 'Push ke Spreadsheet', action: { kind: 'push-universal' } },
              { label: 'Buka Spreadsheet RAB', action: { kind: 'navigate', menu: 'rab-estimasi' } },
            ]
          : undefined;
        await postAssistant(rev.message, acts);
        setBusy(false);
        return;
      }
    }
    /* ---- Phase 1: local intent router runs BEFORE any AI provider call ---- */
    const routed = routeIntent(msg);
    if (!forcedAi && routed.localOnly && routed.intent !== 'UNKNOWN') {
      try {
        const ctx: ChatActionContext = {
          navigate: (menu: string) => navigateChat(menu),
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
          if (res.awaitRabNeeds) setAwaitingNeeds(true);
          if (res.awaitRabChoice) setAwaitingChoice(true);
          if (res.awaitRabSubtype) setAwaitingSubtype(true);
          if (res.awaitClarify) setAwaitingClarify(res.awaitClarify);
          // Action buttons — attached to the assistant message
          const entryActions = res.actions && res.actions.length > 0 ? res.actions : undefined;
          const delivered = await postAssistant(reply, entryActions);
          // Wizard/panel SETELAH respons terlihat (commit terpisah),
          // bukan seketika bersamaan dengan kirim — urutan Send →
          // Processing → AI Response → Action/Wizard. Bila pengiriman
          // dibatalkan/disalip, wizard tidak dibuka.
          if (delivered && (res.openGameSpace || res.openRabWizard || res.openDesignStudio)) {
            setTimeout(() => {
              if (res.openGameSpace) setGameSpaceOpen(true);
              if (res.openRabWizard) setRabWizardOpen(true);
              if (res.openDesignStudio) {
                if (res.designPrompt) setDesignPrompt(res.designPrompt);
                setDesignStudioOpen(true);
              }
            }, 0);
          }
          return;
        }
        await postAssistant(reply);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!forcedAi && routed.needsClarification && routed.clarificationPrompt) {
      await postAssistant(routed.clarificationPrompt!);
      setBusy(false);
      return;
    }
    // Titik ini = jalur pipeline AI: catat prompt terakhir untuk
    // tombol "Coba Lagi" (jawaban lokal registry tidak sampai ke sini).
    // Disimpan `content` (bukan `msg` mentah) supaya "Coba Lagi" ikut
    // mengirim ulang blok lampiran teks — tanpanya retry kehilangan konteks.
    lastAiPromptRef.current = content;
    try {
      // Provider berjalan PARALEL dengan timer minimum (dihitung sejak
      // kirim): hasil cepat menunggu sisa minimum, hasil lambat tidak
      // ditambah delay. RAB: minimum 5–10 detik dari besarnya hasil
      // (waitForRabMinimum), bukan 3 detik complex.
      const sendPromise = ezrabAiService.send({
        // F3: the attachment block belongs ONLY to the message just sent
        // (the last entry in `next`). Older messages must keep their
        // own original content — the old map overwrote EVERY past message's
        // text with the newest note.
        messages: next.map((m, idx) => ({
          role: m.role,
          content: idx === next.length - 1 ? content : m.content,
        })),
        mode,
        projectSnapshot,
      } as any);
      const res = timingActivity === 'rab'
        ? await waitForRabMinimum(timingStart, sendPromise, submitAbort.signal, (r: any) => r?.reply ?? '')
        : await waitForMinimum(timingStart, timingMinDelay, sendPromise, submitAbort.signal);
      // Hasil basi (disalip permintaan baru) tidak ditampilkan dan
      // tidak didebit — minimum sudah terpenuhi oleh gerbang
      // di atas, jadi di sini hanya cek keaslian.
      if (!timingCoordinatorRef.current.isLatest(timingRequestId)) return;
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
      const assistantEntry: ChatEntry = {
        role: 'assistant',
        content: res.reply,
        isError: !res.success,
        fromAi: true,
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
      // Pembatalan (unmount): diam, tanpa pesan basi. Error provider
      // tetap menunggu sisa minimum sebelum ditampilkan — dan tidak
      // pernah membuka wizard (cabang ini tidak punya aksi wizard).
      if (isAbortError(err)) return;
      if (!(await gateWait())) return;
      const errMsg = err?.message || 'Ups! Ada gangguan. Coba lagi ya 🥺';
      setMessages((prev) => [...prev, { role: 'assistant', content: errMsg, isError: true, fromAi: true, ts: Date.now() }]);
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
  /* ---- Fase 1 unifikasi AI: mode + banner konteks entry (hanya area
   * tampilan; handler transfer/push, submit(), hook universal, dan logika
   * draft TIDAK disentuh). Mode default 'chat'; entry sekali-pakai dari
   * resolver mengisi banner + (bila ada prompt) prefill input. */
  const [aiEntryContext, setAiEntryContext] = useState<EzrabAiEntryContext | null>(null);
  const mountConsumeRef = useRef(false);
  // Timer kedaluwarsa banner: konteks yang ditampilkan harus ikut hilang
  // saat entry kedaluwarsa, bukan menempel selamanya di view ter-mount.
  const bannerExpiryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearBannerTimer = useCallback(() => {
    if (bannerExpiryRef.current) {
      clearTimeout(bannerExpiryRef.current);
      bannerExpiryRef.current = null;
    }
  }, []);
  const takePendingEntry = useCallback((clearOnMismatch: boolean) => {
    const peeked = peekPendingEzrabAiEntry();
    const ezEntry = consumePendingEzrabAiEntry();
    if (ezEntry) {
      setAiEntryContext(ezEntry);
      clearBannerTimer();
      const remaining = peeked ? ezrabAiEntryRemainingMs(peeked.createdAt) : 60_000;
      if (remaining > 0) {
        bannerExpiryRef.current = setTimeout(() => setAiEntryContext(null), remaining);
      } else {
        setAiEntryContext(null);
      }
    }
    const entry = consumePendingAiEntry('chat_agent', { clearOnMismatch });
    const text = entry?.initialPrompt?.trim();
    if (!text) return;
    setInjectedPrompt({ text, sendMode: entry?.sendMode ?? 'prefill' });
  }, [clearBannerTimer]);
  // Jalur 1: view baru di-mount setelah navigasi — entry tujuan lain
  // dibersihkan agar prefill basi tidak muncul kembali (<60 detik).
  useEffect(() => {
    if (mountConsumeRef.current) return;
    mountConsumeRef.current = true;
    takePendingEntry(true);
  }, [takePendingEntry]);
  // Jalur 2: view SUDAH ter-mount saat entry didaftarkan (tanpa navigasi
  // ulang) — mismatch TIDAK dibersihkan: listener ini tidak boleh
  // menghapus entry permukaan lain (mis. entry ded dari switcher).
  useEffect(() => {
    const onEntry = () => takePendingEntry(false);
    window.addEventListener('ezrab:ai-entry', onEntry);
    return () => {
      window.removeEventListener('ezrab:ai-entry', onEntry);
      if (bannerExpiryRef.current) clearTimeout(bannerExpiryRef.current);
    };
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

  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyMsg = (idx: number, text: string) => {
    /* Tanda centang hanya bila salin BENAR-BENAR berhasil — sebelumnya
       centang tampil juga saat writeText gagal (izin clipboard ditolak,
       konteks non-HTTPS), sehingga pengguna mengira sudah tersalin. */
    const showCopied = () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      setCopiedIdx(idx);
      copiedTimerRef.current = setTimeout(() => setCopiedIdx(null), 1500);
    };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(showCopied).catch(() => {});
    }
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
      appendMsg('Tidak ada hasil RAB langsung yang aktif untuk di-push. Buat dulu dengan perintah seperti "buatkan rab rumah type 70 2 lantai" atau "buatkan rab rumah 5x10".', undefined, true);
      return;
    }
    if (!effProject) {
      appendMsg('Tidak ada proyek aktif. Buat atau buka proyek dulu di menu Proyek, lalu klik "Push ke Spreadsheet RAB" lagi.', undefined, true);
      return;
    }
    const existingCodes = new Set(
      ((projectRabItems || []) as Array<{ code?: string }>).map((i) => i.code).filter(Boolean) as string[]
    );
    // Perbaikan 2026-10-27 (keluhan user: push ke spreadsheet = Rp0):
    // harga ikut ter-push dari calc.items dengan status jujur — lihat
    // directRabPush.ts (modul murni, dites langsung). Payload lama tidak
    // membawa harga + memaksa PRICE_UNRESOLVED sehingga factory
    // meng-nol-kan semua, termasuk item berharga resmi (3.7.4).
    const payload = mapDirectRabPushItems(r);
    const newItems = payload.filter((p) => !existingCodes.has(p.code));
    const dupCount = payload.length - newItems.length;
    if (newItems.length === 0) {
      appendMsg(`Semua ${payload.length} item RAB ${r.displayLabel} sudah ada di Spreadsheet RAB proyek "${effProject.name}" (duplikat dicegah).`, [
        { label: 'Buka Spreadsheet RAB', action: { kind: 'navigate', menu: 'rab-estimasi' } },
      ]);
      return;
    }
    try {
      const added = bulkAddRabItems(newItems);
      appendMsg(
        `✅ ${added.length} item RAB ${r.displayLabel} (${r.floors} lantai) berhasil di-push ke Spreadsheet RAB proyek "${effProject.name}".` +
          (dupCount > 0 ? ` ${dupCount} item dilewati karena sudah ada.` : '') +
          // Pesan jujur pasca-perbaikan 2026-10-27: harga ikut ter-push
          // sesuai statusnya (bukan lagi "tidak ikut ter-push" ala S10).
          // Estimasi tampil "Perlu verifikasi" di spreadsheet — bukan
          // harga resmi; yang belum berharga tetap "Harga belum diisi".
          ` Harga ikut ter-push: ${added.filter((a) => a.priceStatus === 'PRICE_RESOLVED').length} resmi AHSP, ${added.filter((a) => a.priceStatus === 'PRICE_ESTIMATED').length} estimasi (perlu verifikasi, bukan harga resmi), ${added.filter((a) => a.priceStatus === 'PRICE_UNRESOLVED').length} belum berharga.`,
        [{ label: 'Buka Spreadsheet RAB', action: { kind: 'navigate', menu: 'rab-estimasi' } }]
      );
    } catch (e) {
      appendMsg(`Gagal mem-push ke Spreadsheet RAB: ${(e as Error).message}`, undefined, true);
    }
  };

  /* ---------- Universal Direct RAB: preview transfer + konfirmasi ---------- */
  /**
   * Preview transfer draft universal: hitungan dan daftar perbaikan TANPA
   * menulis apa pun. Konfirmasi terjadi hanya lewat tombol
   * "Konfirmasi Transfer" (push-universal-confirm).
   */
  const pushUniversalToSpreadsheetPreview = () => {
    const appendMsg = (content: string, actions?: ChatActionButton[], isError = false) => {
      const entry: ChatEntry = { role: 'assistant', content, ts: Date.now(), actions, isError };
      setMessages((prev) => [...prev, entry]);
      persistMessage('assistant', content);
    };
    const d = getLastUniversalDraft();
    if (!d) {
      appendMsg('Tidak ada draft RAB universal yang aktif untuk di-push. Buat dulu dengan perintah seperti "buatkan RAB jalan paving 300 m2" atau "buatkan RAB drainase U-Ditch 500 m".', undefined, true);
      return;
    }
    const preview = buildPushPreview(d);
    const readiness = draftReadiness(d);
    const previewActions: ChatActionButton[] = [
      ...(effProject && readiness.status !== 'BLOCKED' ? [{ label: 'Konfirmasi Transfer', action: { kind: 'push-universal-confirm' as const } }] : []),
      { label: 'Buka Spreadsheet RAB', action: { kind: 'navigate', menu: 'rab-estimasi' } },
    ];
    appendMsg(formatPushPreviewMessage(d, preview, effProject?.name ?? null), previewActions);
  };

  /**
   * Eksekusi transfer draft universal ke Spreadsheet proyek aktif.
   * Provenance dipertahankan (factory kini meneruskan priceSourceKind /
   * label / explanation / mappingStatus / priceSourceName); item belum
   * berharga masuk sebagai PRICE_UNRESOLVED. Idempotensi: versi draft
   * yang sama ke proyek yang sama tidak ditulis dua kali; duplikat
   * berdasarkan kode+uraian dilewati dan dilaporkan.
   */
  const pushUniversalToSpreadsheet = () => {
    const appendMsg = (content: string, actions?: ChatActionButton[], isError = false) => {
      const entry: ChatEntry = { role: 'assistant', content, ts: Date.now(), actions, isError };
      setMessages((prev) => [...prev, entry]);
      persistMessage('assistant', content);
    };
    const d = getLastUniversalDraft();
    if (!d) {
      appendMsg('Tidak ada draft RAB universal yang aktif untuk di-push.', undefined, true);
      return;
    }
    if (!effProject) {
      appendMsg('Tidak ada proyek aktif. Buat atau buka proyek dulu di menu Proyek, lalu klik "Push ke Spreadsheet" lagi.', undefined, true);
      return;
    }
    if (d.lastTransfer && d.lastTransfer.projectId === effProject.id && d.lastTransfer.version === d.version) {
      appendMsg(`Draft "${d.title}" versi ${d.version} sudah ditransfer ke proyek "${effProject.name}" (${d.lastTransfer.pushed} item) — tidak ada penulisan ganda.`, [
        { label: 'Buka Spreadsheet RAB', action: { kind: 'navigate', menu: 'rab-estimasi' } },
      ]);
      return;
    }
    // Guard transfer (hardening): draft BLOCKED ditolak dengan pesan ramah
    // SEBELUM buildPushPayload (yang melempar untuk draft BLOCKED). Duplikat
    // dibiarkan jatuh ke cabang di atas agar pesannya tetap spesifik.
    const validation = validateTransfer(d, effProject.id);
    if (!validation.allowed && !validation.duplicate) {
      appendMsg(`Draft "${d.title}" belum dapat ditransfer: ${validation.reasons.join('; ')}. Lengkapi spesifikasi yang diminta, lalu coba lagi dari preview.`, undefined, true);
      return;
    }
    let payload;
    try {
      payload = buildPushPayload(d);
    } catch (e) {
      appendMsg(`Draft "${d.title}" belum dapat ditransfer: ${(e as Error).message} — draft tetap tersimpan dan bisa dicoba lagi setelah spesifikasi dilengkapi.`, undefined, true);
      return;
    }
    const { newItems, dupCount } = dedupePushPayload(payload, (projectRabItems || []) as Array<{ code?: string; description?: string }>);
    if (newItems.length === 0) {
      appendMsg(`Semua ${payload.length} item draft "${d.title}" sudah ada di Spreadsheet RAB proyek "${effProject.name}" (duplikat dicegah).`, [
        { label: 'Buka Spreadsheet RAB', action: { kind: 'navigate', menu: 'rab-estimasi' } },
      ]);
      return;
    }
    try {
      const added = bulkAddRabItems(newItems);
      d.lastTransfer = { projectId: effProject.id, version: d.version, pushed: added.length, skipped: dupCount, at: new Date().toISOString() };
      setLastUniversalDraft(d);
      appendMsg(
        `✅ ${added.length} item draft "${d.title}" (versi ${d.version}) berhasil di-push ke Spreadsheet RAB proyek "${effProject.name}".` +
          (dupCount > 0 ? ` ${dupCount} item dilewati karena sudah ada.` : '') +
          ' Status harga dipertahankan per item (RESMI AHSP / HARGA DATABASE / HARGA MANUAL / BELUM TERSEDIA) — tidak ada yang diam-diam berubah menjadi resmi.',
        [{ label: 'Buka Spreadsheet RAB', action: { kind: 'navigate', menu: 'rab-estimasi' } }]
      );
    } catch (e) {
      appendMsg(`Gagal mem-push ke Spreadsheet RAB: ${(e as Error).message} — draft tetap tersimpan dan bisa dicoba lagi.`, undefined, true);
    }
  };

  /* Coba Lagi (2026-10-23): kirim ulang prompt AI terakhir lewat jalur
   * submit yang sama, dengan bendera paksa-AI (prompt-nya memang untuk
   * pipeline AI) dan echo=false (tanpa gelembung user duplikat; entry
   * error lama dibuang oleh submit sebelum mencoba lagi). */
  const retryLastAi = () => {
    const prompt = lastAiPromptRef.current;
    if (!prompt || busy) return;
    forceAiRef.current = true;
    void submit(prompt, { echo: false });
  };

  const handleActionButton = (btn: ChatActionButton) => {
    if (btn.action.kind === 'push-rab') {
      pushDirectRabToSpreadsheet();
    } else if (btn.action.kind === 'push-universal') {
      pushUniversalToSpreadsheetPreview();
    } else if (btn.action.kind === 'push-universal-confirm') {
      pushUniversalToSpreadsheet();
    } else if (btn.action.kind === 'navigate') {
      // Navigasi meninggalkan alur chat — status menunggu subtipe gugur.
      setAwaitingSubtype(false);
      setAwaitingClarify(null);
      navigateChat(btn.action.menu);
    } else if (btn.action.kind === 'nav-entry') {
      // Chip Command Router: satu entry registry (termasuk filter proyek
      // dan aksi tutorial) — tidak bisa diungkapkan hanya dengan menu.
      const entry = NAV_BY_ID[btn.action.entryId];
      if (entry) {
        setAwaitingSubtype(false);
        setAwaitingClarify(null);
        navigateNavEntry(entry);
      }
    } else if (btn.action.intent === 'START_RAB_WIZARD') {
      // Chat-to-RAB Fase 2: tombol "Rumah tinggal" TIDAK lagi membuka wizard
      // langsung — tampilkan ringkasan kebutuhan dulu (lewat router).
      void submit('buatkan RAB rumah tinggal');
    } else if (btn.action.intent === 'OPEN_DESIGN_WORKSPACE' || btn.action.intent === 'START_HOUSE_DESIGN') {
      // Klik tombol ini = persetujuan pengguna. Fase 3: buka HALAMAN workspace
      // penuh (bukan overlay) — prompt dari ringkasan diteruskan via entry
      // navigasi AI sekali-pakai, konteks chat tetap utuh untuk kembali.
      // Pilihan pada kartu (bila ada) dianggap selesai: status koreksi tutup.
      setAwaitingChoice(false);
      const prompt = btn.action.param ?? getLastRabDesignPrompt() ?? undefined;
      requestAiEntry('design_workspace', {
        projectId: effProject?.id ?? null,
        initialPrompt: prompt,
        sourceMenu: currentMenu,
      });
      navigateChat('desain-rab');
    } else if (btn.action.intent === 'GENERATE_RAB_TEMPLATE') {
      // Klik "Pakai Template" pada kartu pilihan RAB (desain owner
      // 2026-10-22) = persetujuan eksplisit: generate parametrik lewat
      // registry, lalu tampilkan tabel beserta tombol aksinya (Push dsb).
      // Pilihan selesai → status menunggu koreksi kartu ditutup.
      setAwaitingChoice(false);
      const res = executeIntent('GENERATE_RAB_TEMPLATE', btn.action.param, {
        navigate: (menu: string) => navigateChat(menu),
        rawText: btn.action.param,
        currentMenu,
        activeProject,
        projects,
        projectTotal: projectSnapshot ? projectSnapshot.totalDirect : projectTotal,
        projectItems: projectSnapshot?.items ?? null,
      });
      const entry: ChatEntry = { role: 'assistant', content: res.message, ts: Date.now(), actions: res.actions };
      setMessages((prev) => [...prev, entry]);
      persistMessage('assistant', res.message);
    } else if (btn.action.intent === 'RAB_SUBTYPE_SELECT' || btn.action.intent === 'RAB_PATH_TEMPLATE') {
      // Klarifikasi subtipe (2026-10-23): klik subtipe → kartu jalur;
      // klik "Pakai template" pada kartu jalur → daftar template NYATA
      // dari katalog (atau jawaban jujur bila belum ada template).
      // Keduanya lokal penuh lewat registry — tanpa panggilan AI/kredit.
      setAwaitingSubtype(false);
      setAwaitingClarify(null);
      const res = executeIntent(btn.action.intent as never, btn.action.param, {
        navigate: (menu: string) => navigateChat(menu),
        currentMenu,
        activeProject,
        projects,
        projectTotal: projectSnapshot ? projectSnapshot.totalDirect : projectTotal,
        projectItems: projectSnapshot?.items ?? null,
      });
      const entry: ChatEntry = { role: 'assistant', content: res.message, ts: Date.now(), actions: res.actions };
      setMessages((prev) => [...prev, entry]);
      persistMessage('assistant', res.message);
    } else if (btn.action.intent === 'RAB_FULL_AI') {
      // Klik "Full AI" pada kartu jalur = persetujuan pengguna. Kontrak baru:
      // registry lebih dulu mencoba komposisi deterministik dari kebutuhan
      // terkumpul (tabel RAB lengkap + tombol Push ke Spreadsheet). Bila
      // komposisi berhasil, registry mengembalikan message+actions TANPA
      // fullAiPrompt → tampilkan sebagai entry asisten biasa. Bila belum
      // bisa disusun (fullAiPrompt ada) → perilaku lama persis: prompt
      // dikirim ke pipeline Chat AI dengan bendera paksa-AI agar tidak
      // tertangkap router lokal CREATE_RAB_SUMMARY lagi.
      setAwaitingSubtype(false);
      setAwaitingClarify(null);
      const res = executeIntent('RAB_FULL_AI', btn.action.param, {
        navigate: (menu: string) => navigateChat(menu),
        currentMenu,
        activeProject,
        projects,
        projectTotal: projectSnapshot ? projectSnapshot.totalDirect : projectTotal,
        projectItems: projectSnapshot?.items ?? null,
      });
      if (res.fullAiPrompt) {
        forceAiRef.current = true;
        void submit(res.fullAiPrompt);
      } else if (res.message) {
        const entry: ChatEntry = { role: 'assistant', content: res.message, ts: Date.now(), actions: res.actions };
        setMessages((prev) => [...prev, entry]);
        persistMessage('assistant', res.message);
      } else if (btn.action.param) {
        // Cadangan defensif: registry tidak memberi apa pun — pakai param
        // tombol seperti perilaku lama.
        forceAiRef.current = true;
        void submit(btn.action.param);
      }
    } else if (btn.action.intent === 'CLARIFY_PICK') {
      // Pilihan pada kartu klarifikasi topik (2026-10-23): registry memberi
      // jawaban lokal (mis. penjelasan AHSP) atau permintaan query +
      // awaitClarify — keduanya lokal penuh, tanpa panggilan AI/kredit.
      // Mode menunggu disetel dari hasil (awaitClarify baru) atau ditutup.
      const res = executeIntent('CLARIFY_PICK', btn.action.param, {
        navigate: (menu: string) => navigateChat(menu),
        currentMenu,
        activeProject,
        projects,
        projectTotal: projectSnapshot ? projectSnapshot.totalDirect : projectTotal,
        projectItems: projectSnapshot?.items ?? null,
      });
      const entry: ChatEntry = { role: 'assistant', content: res.message, ts: Date.now(), actions: res.actions };
      setMessages((prev) => [...prev, entry]);
      persistMessage('assistant', res.message);
      setAwaitingClarify(res.awaitClarify ?? null);
    } else if (btn.action.intent === 'CREATE_RAB_SUMMARY') {
      // Tombol pilihan jenis pekerjaan pada kartu klarifikasi topik 'rab':
      // kirim PARAM tombol (perintah lengkapnya, mis. "buatkan rab jalan")
      // sebagai pesan agar mengalir ke flow kebutuhan/subtipe yang sudah
      // ada — label tombolnya saja tidak cukup spesifik untuk router.
      setAwaitingClarify(null);
      void submit(btn.action.param ?? btn.label);
    } else if (btn.action.intent === 'RAB_NEEDS_REFINE') {
      const res = executeIntent('RAB_NEEDS_REFINE', undefined, {
        navigate: (menu: string) => navigateChat(menu),
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
  // PERBAIKAN 2026-10-26 (Command Router): ctx.navigate di executeIntent
  // sebelumnya memakai prop onNavigate yang TIDAK PERNAH dipasok mount nyata
  // (<EzrabAiView /> tanpa props) sehingga intent navigasi hanya mencetak
  // "Membuka …" tanpa benar-benar pindah. Semua situs ctx.navigate kini
  // memakai navigateChat ini (jalur router resmi yang sama dengan tombol
  // aksi) — bukan window.open/popup/reload.
  const navigateChat = (menu: string) => {
    try {
      navigateTo(routeForMenu(menu as never, effProject?.id ?? null));
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: `Tidak dapat membuka menu "${menu}" saat ini.`, isError: true, ts: Date.now() }]);
    }
  };

  // Navigasi satu entry registry (Command Router): filter proyek di-dispatch
  // dulu (event bridge ke WorkspaceView — filter BUKAN parameter URL), lalu
  // pindah menu. Tutorial bukan navigasi: cukup dispatch event onboarding.
  const navigateNavEntry = (entry: NavEntry) => {
    if (entry.special === 'tutorial') {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ezrab:open-onboarding'));
      }
      return;
    }
    if (entry.projectFilter && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ezrab:set-project-filter', { detail: entry.projectFilter }));
    }
    if (entry.menu) navigateChat(entry.menu);
  };

  // ---- Slash menu composer (Command Router Fase 4) ----
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const slashEntries = filterSlashEntries(slashQuery);
  const updateSlashState = (value: string, cursor: number | null) => {
    const token = extractSlashToken(value, cursor);
    if (token == null) {
      if (slashOpen) setSlashOpen(false);
      return;
    }
    setSlashQuery(token);
    setSlashIndex(0);
    if (!slashOpen) setSlashOpen(true);
  };
  const closeSlash = () => { if (slashOpen) setSlashOpen(false); };

  const onKey = (e: React.KeyboardEvent) => {
    // Menu slash terbuka → keyboard mengendalikan menu, bukan submit.
    if (slashOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIndex((i) => (slashEntries.length ? (i + 1) % slashEntries.length : 0)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIndex((i) => (slashEntries.length ? (i - 1 + slashEntries.length) % slashEntries.length : 0)); return; }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const picked = slashEntries[slashIndex];
        closeSlash();
        if (picked) void submit(picked.slash);
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); closeSlash(); return; }
    }
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

  /* ---------- Lampiran file teks ---------- */
  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setAttachError(null);
    const res = await readTextAttachment(f);
    if (!res.ok) { setAttachError(res.error); return; }
    setAttached(res.attachment);
  };

  /* Panel riwayat header: tombol Escape menutup panel. */
  useEffect(() => {
    if (!historyOpen) return undefined;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setHistoryOpen(false); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [historyOpen]);

  /* Daftar Riwayat Percakapan — SATU komponen dipakai ulang di mode awal
   * (blok kompak di bawah composer) dan di panel dropdown header, agar
   * perilaku muat/hapus percakapan identik di kedua tempat. */
  const historyList = (
    historyItems.length === 0 ? (
      <p className="ezhist-empty">Belum ada riwayat percakapan</p>
    ) : (
      <div className="ezhist-list">
        {historyItems.map((h) => (
          <div key={h.id} className={`ezhist-row${h.id === activeConvId ? ' active' : ''}`}>
            <button className="ezhist-main" onClick={() => loadConversation(h.id)} title={h.title}>
              <span className="ezhist-title">{h.title}</span>
              <span className="ezhist-meta">{fmtHistoryDate(h.updatedAt)} • {h.messageCount} pesan</span>
            </button>
            <button
              className="ezhist-del"
              onClick={() => deleteHistoryItem(h.id)}
              title="Hapus percakapan"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    )
  );

  /* Kepala bagian riwayat: judul kecil + tombol Percakapan Baru. */
  const historyHead = (
    <div className="ezhist-head">
      <h3 className="ezhist-heading">Riwayat Percakapan</h3>
      <button className="ezhist-newbtn" onClick={newChat} disabled={busy}>
        <Plus size={13} /> Percakapan Baru
      </button>
    </div>
  );

  /* Composer dipakai dua tempat: di tengah (saat chat kosong, di bawah
   * sapaan) dan di bawah (saat sudah ada percakapan). Varian bawah
   * memakai kelas `docked`: footer menempel di dasar kolom chat
   * (flex-shrink 0 + latar + garis atas), tidak ikut discroll bersama
   * daftar pesan — owner 2026-10-27: kalau sudah ada percakapan,
   * chatbox berada di bawah saja. */
  const composer = (middle: boolean) => (
    <div className={`ezchat2-input-wrap${middle ? ' middle' : ' docked'}`}>
      {/* Menu slash (Command Router Fase 4): muncul saat "/" diketik sebelum
       * kursor; melayang di atas composer selebar wrap (aman di 390px).
       * onMouseDown + preventDefault agar klik tidak membuat textarea blur
       * sebelum pilihan terkirim lewat submit(slash) langsung. */}
      {slashOpen && slashEntries.length > 0 && (
        <div className="ezchat2-slashmenu" role="listbox" aria-label="Perintah cepat" id="ezchat2-slashmenu">
          {slashEntries.map((entry, i) => (
            <button
              key={entry.id}
              type="button"
              className={`ezchat2-slashopt${i === slashIndex ? ' active' : ''}`}
              role="option"
              aria-selected={i === slashIndex}
              id={`ezchat2-slashopt-${entry.id}`}
              onMouseDown={(e) => { e.preventDefault(); closeSlash(); void submit(entry.slash); }}
            >
              <span className="ezchat2-slashcmd">{entry.slash}</span>
              <span className="ezchat2-slashlabel">{entry.label}</span>
              <span className="ezchat2-slashdesc">{entry.description}</span>
            </button>
          ))}
        </div>
      )}
      {attached && (
        <div className="ezchat2-attchip">
          <FileText size={16} />
          <span>{attached.name}</span>
          <span className="ezchat2-attsize">{formatTextAttachmentSize(attached.size)}</span>
          <button onClick={() => setAttached(null)} title="Hapus">
            <X size={13} />
          </button>
        </div>
      )}
      {attachError && (
        <div className="ezchat2-atterr" role="alert">{attachError}</div>
      )}
      {listening && (
        <div className="ezchat2-listening"><span className="ezdot busy pulse" /> Mendengarkan… bicara sekarang 🎤</div>
      )}
      <div className="ezchat2-pill">
        {/* Tombol lampirkan file DIHAPUS (owner 2026-10-27): tidak ada
            lagi pemicu lampiran di Chat AI. Jalur lampiran teks lama
            (onPickFile/fileRef) tidak lagi dirender dari composer ini. */}
        <textarea
          ref={taRef}
          value={input}
          onChange={(e) => { setInput(e.target.value); autoresize(); updateSlashState(e.target.value, e.target.selectionStart); }}
          onKeyDown={onKey}
          placeholder={listening ? 'Mendengarkan…' : 'Ketik pesan atau perintah, misalnya /template'}
          rows={1}
          disabled={busy}
          aria-expanded={slashOpen}
          aria-controls="ezchat2-slashmenu"
          aria-activedescendant={slashOpen && slashEntries[slashIndex] ? `ezchat2-slashopt-${slashEntries[slashIndex].id}` : undefined}
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
        Ezrab AI bisa salah, cek ulang angka penting 😉
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6 }}>
        <CreditEstimateBadge estimate={chatEstimate} />
      </div>
    </div>
  );

  return (
    <div
      className="ezchat2"
      ref={rootRef}
      style={availH !== null ? ({ '--ezchat2-avail': `${availH}px` } as React.CSSProperties) : undefined}
    >
      <div className="ezchat2-headerwrap">
      <div className="ezchat2-header">
        <div className="ezchat2-mascot">
          <EZRABMascotLucu
            size={44}
            enableEyeTracking
            enableBlink
            enableFloat={false}
            interactive={false}
          />
        </div>
        <div className="ezchat2-title">
          <div className="ezchat2-name">Ezrab Chat AI</div>
        </div>
        <div className="ezchat2-actions">
          {/* Satu-satunya kontrol mode: dropdown header (mode nyata:
              Cepat/fast dan Mendalam/advanced). Bukan daftar model
              provider — tidak ada nama model yang dikarang di sini. */}
          <select
            className="ezchat2-modesel"
            value={mode}
            onChange={(e) => setMode(e.target.value as 'fast' | 'advanced')}
            title="Mode AI"
            aria-label="Mode AI"
            disabled={busy}
          >
            <option value="fast">Cepat</option>
            <option value="advanced">Mendalam</option>
          </select>
          <button
            className="ezchat2-new"
            onClick={() => { setMenuOpen(false); newChat(); }}
            disabled={busy}
            title="Percakapan baru"
          >
            <Plus size={15} /> Baru
          </button>
          <div className="ezchat2-menuwrap">
            <button
              className={`ezchat2-menubtn${menuOpen ? ' active' : ''}`}
              onClick={() => { setHistoryOpen(false); setMenuOpen((o) => !o); }}
              title="Menu lainnya"
              aria-label="Menu lainnya"
              aria-expanded={menuOpen}
            >
              <MoreVertical size={17} />
            </button>
            {menuOpen && (
              <div className="ezchat2-menu" role="menu">
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); setHistoryOpen(true); }}
                >
                  <History size={14} /> Riwayat percakapan
                </button>
                <button
                  role="menuitem"
                  onClick={() => reloadChat()}
                >
                  <RotateCcw size={14} /> Muat Ulang
                </button>
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); setGameSpaceOpen(true); }}
                >
                  <Gamepad2 size={14} /> Game Space
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {menuOpen && (
        <div className="ezchat2-hist-veil" onClick={() => setMenuOpen(false)} />
      )}
      {historyOpen && (
        <>
          <div className="ezchat2-hist-veil" onClick={() => setHistoryOpen(false)} />
          <div className="ezchat2-hist-panel" role="dialog" aria-label="Riwayat percakapan">
            {historyHead}
            {historyList}
          </div>
        </>
      )}
      </div>{/* /.ezchat2-headerwrap */}

      <div className="ezchat2-main">
      {/* ===== Header ===== */}


      {/* ===== Body ===== */}
      <div className="ezchat2-body" ref={scrollRef} onScroll={onBodyScroll}>
        {messages.length === 0 ? (
          <div className="ezchat2-empty">
            {/* Maskot BESAR di tengah mode awal (owner 2026-10-24: maskot
                jangan dihilangkan dari mode chat) — komponen kanonis yang
                sama dengan hero dashboard, eye-tracking INTERAKTIF aktif. */}
            <div className="ezchat2-hero-mascot" aria-hidden="true">
              <EZRABMascotLucu
                size={168}
                enableEyeTracking
                enableBlink
                enableFloat
                interactive
              />
            </div>
            <h2 className="ezchat2-greet">Halo, ada yang bisa saya bantu?</h2>
            <p className="ezchat2-sub">Tanyakan tentang estimasi, AHSP, volume pekerjaan, atau dokumen proyek.</p>
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
                    {/* D3: kontainer teks menjadi scroll-container horizontal
                        (overflowX auto + maxWidth 100%) agar tabel RAB lebar
                        (md-table, min-content ±755px) dapat digeser di dalam
                        gelembung (696px) alih-alih terpotong; layout halaman
                        tidak berubah, teks biasa tetap membungkus normal. */}
                    <div className="ezchat2-text md-body" style={{ overflowX: 'auto', maxWidth: '100%' }}>{renderMarkdown(m.content)}</div>
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
                  {/* Coba Lagi: hanya pada entry error dari pipeline AI
                      yang menjadi pesan terakhir dan masih ada prompt
                      terakhir untuk dikirim ulang. */}
                  {m.isError && m.fromAi && i === messages.length - 1 && lastAiPromptRef.current && (
                    <button
                      onClick={retryLastAi}
                      disabled={busy}
                      title="Kirim ulang pertanyaan terakhir ke AI"
                      style={{
                        alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6,
                        marginTop: 6, padding: '7px 13px', borderRadius: 8,
                        border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#991B1B',
                        fontWeight: 600, fontSize: 13, cursor: busy ? 'default' : 'pointer',
                        opacity: busy ? 0.6 : 1,
                      }}>
                      <RotateCcw size={13} /> Coba Lagi
                    </button>
                  )}
                  <div className="ezchat2-ts">{fmtTime(m.ts)}</div>
                </div>
              </div>
            ))}
            {busy && (
              <div className="ezchat2-row ai">
                <img src={MASCOT_PNG} alt="Ezrab" className="ezchat2-avatar thinking" />
                <div className="ezchat2-bubble ai typing">
                  <span className="tdot" /><span className="tdot" /><span className="tdot" />
                  <span className="ezchat2-thinking">{thinkingText}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===== Composer di bawah (hanya saat sudah ada percakapan) ===== */}
      {messages.length > 0 && composer(false)}
      </div>{/* /.ezchat2-main */}

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

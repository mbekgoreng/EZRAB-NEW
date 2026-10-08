import React, { useEffect, useRef, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  ChevronDown,
  FileText,
  Maximize2,
  Mic,
  Minimize2,
  Minus,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Square,
  X,
  AlertCircle,
  PlusCircle,
  Check,
  ExternalLink,
} from 'lucide-react';
import { RabItem, Project, UserRole, QTOItem } from '../../types';
import { aiApiClient, ActionProposal } from '../../services/aiApiClient';
import { coAssistantService, CoAssistantMessage, resolveClientWizardStep } from '../../services/coAssistantService';
import { quickActionService } from '../../services/quickActionService';
import { QUICK_ACTIONS_LIST, QUICK_ACTION_CONTRACTS } from '../../data/quickActionContracts';
import { AssistantWizardRenderer } from './AssistantWizardRenderer';
import { QuickActionDialogueRenderer } from './QuickActionDialogueRenderer';
import { QuickActionFollowUpSuggestions } from './QuickActionFollowUpSuggestions';
import { EZRABMascot3D } from '../mascot/EZRABMascot3D';
import { EZRABMascotLucu } from '../mascot/EZRABMascotLucu';
import ezrabAvatarImg from '../../assets/ezrab_avatar.png';
import mascotNewImg from '../../assets/mascot-ezrab-new.png';
import { unifiedConversationStore } from '../../services/ai/conversation/unifiedConversationStore';
import { useI18n } from '../../i18n/I18nContext';
import { STT_LOCALES } from '../../i18n/dictionaries';

export type ChatboxDisplayMode = 'closed' | 'compact' | 'expanded' | 'minimized';

interface EzrabCoAssistantChatboxProps {
  mode: ChatboxDisplayMode;
  onModeChange: (mode: ChatboxDisplayMode) => void;
  currentProject: Project | null;
  projectRabItems?: RabItem[];
  projectQtoItems?: QTOItem[];
  selectedRabItem?: RabItem | null;
  selectedQtoItem?: QTOItem | null;
  projects?: Project[];
  currentProjectId?: string | null;
  onSelectProject?: (projectId: string) => void;
  activeModule?: string;
  userRole?: UserRole;
  userName?: string;
  onAddRabItemDirect?: (item: Partial<RabItem> & { description: string; volume: number; unit: string; unitPrice?: number; ahspCode?: string; category?: string }) => void;
  onOpenSuperView?: (conversationId?: string) => void;
}

const QUICK_ACTIONS = [
  {
    id: 'audit_rab',
    actionId: 'AUDIT_RAB',
    icon: CheckCircle2,
    title: 'Audit RAB',
    prompt: 'Bantu saya melakukan audit RAB',
  },
  {
    id: 'hitung_volume',
    actionId: 'HITUNG_VOLUME',
    icon: Search,
    title: 'Hitung Volume',
    prompt: 'Bantu saya menghitung volume pekerjaan',
  },
  {
    id: 'cari_ahsp',
    actionId: 'CARI_AHSP',
    icon: Sparkles,
    title: 'Cari AHSP',
    prompt: 'Saya bantu mencari AHSP yang sesuai',
  },
  {
    id: 'cari_harga',
    actionId: 'CARI_HARGA',
    icon: Search,
    title: 'Cari Harga',
    prompt: 'Bantu saya mencari harga material, upah, atau alat',
  },
  {
    id: 'analisis_ded',
    actionId: 'ANALISIS_DED',
    icon: FileText,
    title: 'Analisis DED',
    prompt: 'Bantu saya menganalisis dokumen DED',
  },
  {
    id: 'buat_laporan',
    actionId: 'BUAT_LAPORAN',
    icon: FileText,
    title: 'Buat Laporan',
    prompt: 'Bantu saya membuat laporan proyek',
  },
  {
    id: 'periksa_kurva_s',
    actionId: 'PERIKSA_KURVA_S',
    icon: CheckCircle2,
    title: 'Periksa Kurva S',
    prompt: 'Bantu saya memeriksa Kurva S proyek',
  },
  {
    id: 'jelaskan_item',
    actionId: 'JELASKAN_ITEM',
    icon: FileText,
    title: 'Jelaskan Item',
    prompt: 'Item pekerjaan atau data apa yang ingin Anda jelaskan?',
  },
  {
    id: 'recalculate',
    actionId: 'RECALCULATE',
    icon: CheckCircle2,
    title: 'Recalculate',
    prompt: 'Bantu saya menghitung ulang RAB',
  },
  {
    id: 'bantuan_fitur',
    actionId: 'BANTUAN_FITUR',
    icon: Sparkles,
    title: 'Bantuan Fitur',
    prompt: 'Saya bisa membantu Anda menggunakan EZRAB. Fitur apa yang ingin Anda pelajari?',
  },
] as const;

/**
 * Tipe minimal Web Speech API (SpeechRecognition belum distandardisasi penuh
 * di lib.dom TypeScript, dan Chrome menyediakannya sebagai webkitSpeechRecognition).
 * Didefinisikan lokal agar tidak bergantung pada @types tambahan.
 */
interface EzrabSpeechAlternative {
  transcript: string;
  confidence: number;
}
interface EzrabSpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
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
interface EzrabSpeechRecognitionErrorEvent {
  readonly error: string;
}
interface EzrabSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: EzrabSpeechRecognitionEvent) => void) | null;
  onerror: ((event: EzrabSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

/** Ambil konstruktor SpeechRecognition bawaan browser, atau null jika tidak didukung. */
const getSpeechRecognitionCtor = (): (new () => EzrabSpeechRecognition) | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
    | (new () => EzrabSpeechRecognition)
    | undefined;
  return Ctor ?? null;
};

export const EzrabCoAssistantChatbox: React.FC<EzrabCoAssistantChatboxProps> = ({
  mode,
  onModeChange,
  currentProject,
  projectRabItems = [],
  projectQtoItems = [],
  selectedRabItem,
  selectedQtoItem,
  projects = [],
  onSelectProject,
  activeModule = 'rab-estimasi',
  userRole = 'ESTIMATOR',
  onAddRabItemDirect,
  onOpenSuperView,
}) => {
  const [messages, setMessages] = useState<CoAssistantMessage[]>([]);
  const [inputQuery, setInputQuery] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingStep, setThinkingStep] = useState('Menganalisis proyek...');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [contextChipVisible, setContextChipVisible] = useState(true);
  const [appliedProposalIds, setAppliedProposalIds] = useState<Set<string>>(new Set());

  // i18n (hook aman tanpa provider — default bahasa Indonesia)
  const { lang, t } = useI18n();

  // --- Speech-to-Text (Web Speech API, bawaan browser) ---
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<EzrabSpeechRecognition | null>(null);
  /** Teks yang sudah ada di input sebelum sesi dikte dimulai. */
  const sttBaseTextRef = useRef('');
  /** Akumulasi transkrip FINAL selama sesi berjalan. */
  const sttFinalRef = useRef('');

  /** Tampilkan pemberitahuan inline di area chat (mekanisme pesan yang sudah ada). */
  const pushSttNotice = (text: string) => {
    const notice: CoAssistantMessage = {
      id: `stt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'ai',
      text,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      isError: true,
    };
    setMessages((prev) => [...prev, notice]);
  };

  /** Hentikan sesi STT yang sedang berjalan (jika ada). */
  const stopListening = () => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    sttFinalRef.current = '';
    setIsListening(false);
    if (rec) {
      try {
        rec.abort();
      } catch {
        /* abaikan — sesi mungkin sudah berakhir */
      }
    }
  };

  const handleMicClick = () => {
    // Klik ulang saat merekam = berhenti.
    if (isListening) {
      stopListening();
      return;
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      pushSttNotice(t('chat.stt_unsupported'));
      return;
    }
    const rec = new Ctor();
    rec.lang = STT_LOCALES[lang];
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    sttBaseTextRef.current = inputQuery;
    sttFinalRef.current = '';
    recognitionRef.current = rec;

    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) {
          sttFinalRef.current += text;
        } else {
          interim += text;
        }
      }
      // Gabungkan: teks lama + hasil final + interim (live) dengan spasi.
      const parts = [sttBaseTextRef.current, sttFinalRef.current, interim].filter(
        (p) => p.trim().length > 0,
      );
      setInputQuery(parts.join(' '));
      // Sesuaikan tinggi textarea seperti saat mengetik manual.
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 100)}px`;
      }
    };

    rec.onerror = (event) => {
      const err = event?.error ?? '';
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        pushSttNotice(t('chat.stt_permission_denied'));
      } else if (err === 'no-speech') {
        pushSttNotice(t('chat.stt_no_speech'));
      } else if (err === 'audio-capture') {
        pushSttNotice(t('chat.stt_audio_capture'));
      } else if (err !== 'aborted') {
        pushSttNotice(t('chat.stt_service_error'));
      }
    };

    rec.onend = () => {
      recognitionRef.current = null;
      sttFinalRef.current = '';
      setIsListening(false);
    };

    try {
      rec.start();
      setIsListening(true);
    } catch {
      recognitionRef.current = null;
      setIsListening(false);
      pushSttNotice(t('chat.stt_service_error'));
    }
  };

  // Bersihkan sesi STT saat komponen unmount agar tidak bocor.
  useEffect(() => {
    return () => {
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      if (rec) {
        try {
          rec.abort();
        } catch {
          /* abaikan */
        }
      }
    };
  }, []);

  // Hentikan sesi STT yang berjalan saat bahasa antarmuka diganti
  // (SpeechRecognition.lang tidak bisa diubah di tengah sesi).
  useEffect(() => {
    if (recognitionRef.current) {
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      sttFinalRef.current = '';
      setIsListening(false);
      try {
        rec.abort();
      } catch {
        /* abaikan */
      }
    }
  }, [lang]);

  // Viewport & Mobile responsiveness
  const [isMobile, setIsMobile] = useState(() => {
    return typeof window !== 'undefined' ? window.innerWidth < 768 : false;
  });

  // Soft-keyboard offset (mobile): keeps the composer visible above the
  // on-screen keyboard. Desktop is unaffected (offset stays 0).
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  useEffect(() => {
    if (!isMobile) {
      setKeyboardOffset(0);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const gap = window.innerHeight - vv.height - vv.offsetTop;
      setKeyboardOffset(Math.max(0, Math.round(gap)));
    };
    vv.addEventListener('resize', onResize);
    onResize();
    return () => vv.removeEventListener('resize', onResize);
  }, [isMobile]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const stopGenerationRef = useRef(false);

  const isClosed = mode === 'closed' || mode === 'minimized';
  const projectName = currentProject?.name || 'Belum ada proyek aktif';

  // Synchronize messages with Unified Conversation Store (Resolves F-02)
  useEffect(() => {
    const pId = currentProject?.id;
    if (!pId) return;

    try {
      const conv = unifiedConversationStore.getOrCreateActiveConversation(pId);
      if (conv.messages.length > 0) {
        setMessages(conv.messages.map((m) => ({
          id: m.id,
          role: m.role === 'user' ? 'user' : 'ai',
          text: m.content,
          timestamp: m.timestamp,
          badge: m.badge,
          stats: m.stats,
          actionProposal: m.actionProposal ? {
            actionId: m.actionProposal.id,
            toolName: m.actionProposal.action,
            parameters: (m.actionProposal.proposedChanges as any)?.item || m.actionProposal.input || {},
            description: m.actionProposal.description,
            requiresConfirmation: m.actionProposal.requiresApproval,
          } : undefined,
          table: m.table,
          wizardResponse: m.wizardResponse,
          quickActionResponse: m.quickActionResponse,
          followUpSuggestions: m.followUpSuggestions,
          isError: m.isError,
        })));
      }
    } catch {}

    const unsubscribe = unifiedConversationStore.subscribe((event) => {
      if (event.projectId !== pId) return;
      try {
        const currentConv = unifiedConversationStore.getOrCreateActiveConversation(pId);
        setMessages(currentConv.messages.map((m) => ({
          id: m.id,
          role: m.role === 'user' ? 'user' : 'ai',
          text: m.content,
          timestamp: m.timestamp,
          badge: m.badge,
          stats: m.stats,
          actionProposal: m.actionProposal ? {
            actionId: m.actionProposal.id,
            toolName: m.actionProposal.action,
            parameters: (m.actionProposal.proposedChanges as any)?.item || m.actionProposal.input || {},
            description: m.actionProposal.description,
            requiresConfirmation: m.actionProposal.requiresApproval,
          } : undefined,
          table: m.table,
          wizardResponse: m.wizardResponse,
          quickActionResponse: m.quickActionResponse,
          followUpSuggestions: m.followUpSuggestions,
          isError: m.isError,
        })));
      } catch {}
    });

    return () => unsubscribe();
  }, [currentProject?.id]);

  // Responsive window resize listener
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auto-scroll chat body on new messages or thinking status
  useEffect(() => {
    if (messagesScrollRef.current) {
      messagesScrollRef.current.scrollTo({
        top: messagesScrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages, isThinking]);

  // Focus textarea when panel opens
  useEffect(() => {
    if (!isClosed) {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 150);
    }
  }, [isClosed]);

  // Escape key handler to close panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isClosed) {
        onModeChange('closed');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isClosed, onModeChange]);

  // Auto-adjust textarea height up to 100px
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputQuery(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 100)}px`;
    }
  };

  const isSendingRef = useRef(false);

  const handleStopGeneration = () => {
    stopGenerationRef.current = true;
    setIsThinking(false);
    isSendingRef.current = false;
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputQuery).trim();
    if (!query || isThinking || isSendingRef.current) return;

    isSendingRef.current = true;
    stopGenerationRef.current = false;

    const userMsg: CoAssistantMessage = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => {
      if (prev.some((m) => m.id === userMsg.id)) return prev;
      return [...prev, userMsg];
    });
    setInputQuery('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setIsThinking(true);
    setThinkingStep('Menganalisis dengan EZRAB Magic AI...');

    try {
      const result = await coAssistantService.sendMessage({
        message: query,
        currentProject,
        projectRabItems,
        projectQtoItems,
        selectedRabItem,
        selectedQtoItem,
        activeModule,
        userRole,
        onThinking: (step) => setThinkingStep(step),
      });

      if (!stopGenerationRef.current) {
        const receivedMsg = result.message;

        // Development-only debugging logger (Prompt Section 8)
        const isDev = Boolean((import.meta as any).env?.DEV);
        if (typeof window !== 'undefined' && isDev) {
          console.debug('[EZRAB WIZARD RESPONSE]', {
            intent: receivedMsg.intent,
            hasWizardResponse: Boolean(receivedMsg.wizardResponse),
            step: receivedMsg.wizardResponse?.step,
            choicesCount: receivedMsg.wizardResponse?.choices?.length,
          });
        }

        // Check if intent was AUTOMATIC_RAB_START but wizardResponse is missing (Prompt Section 10)
        if (receivedMsg.intent === 'AUTOMATIC_RAB_START' && !receivedMsg.wizardResponse) {
          console.error('[EZRAB] AUTOMATIC_RAB_START tanpa wizardResponse');
          if (isDev) {
            receivedMsg.text = 'Wizard RAB belum menerima data pilihan dari server.';
            receivedMsg.isError = true;
          } else {
            receivedMsg.text = 'Maaf, terjadi kendala saat memuat pilihan wizard RAB. Silakan coba lagi.';
            receivedMsg.isError = true;
          }
        }

        setMessages((prev) => {
          if (prev.some((m) => m.id === receivedMsg.id)) return prev;
          return [...prev, receivedMsg];
        });
      }
    } catch {
      if (!stopGenerationRef.current) {
        const errorMsg: CoAssistantMessage = {
          id: `ai-err-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          role: 'ai',
          text: 'Maaf, terjadi kendala saat memproses permintaan Anda. Pastikan koneksi atau proyek aktif terhubung lalu coba kembali.',
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          isError: true,
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } finally {
      setIsThinking(false);
      isSendingRef.current = false;
    }
  };

  const handleWizardAnswer = async (sessionId: string, choiceId?: string, parameters?: Record<string, any>) => {
    setIsThinking(true);
    setThinkingStep('Memproses spesifikasi wizard...');
    try {
      const wizardResp = await aiApiClient.answerWizard(sessionId, choiceId, parameters);
      const aiMsg: CoAssistantMessage = {
        id: `ai-wiz-${Date.now()}`,
        role: 'ai',
        text: wizardResp.message || '',
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        wizardResponse: wizardResp
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      console.warn('Wizard answer error, using fallback:', err);
      try {
        const lastWizMsg = [...messages].reverse().find((m) => !!m.wizardResponse);
        const fallbackResp = resolveClientWizardStep(sessionId, choiceId, parameters, lastWizMsg?.wizardResponse);
        const aiMsg: CoAssistantMessage = {
          id: `ai-wiz-${Date.now()}`,
          role: 'ai',
          text: fallbackResp.message || '',
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          wizardResponse: fallbackResp
        };
        setMessages((prev) => [...prev, aiMsg]);
      } catch (fallbackErr) {
        const errMsg: CoAssistantMessage = {
          id: `ai-wiz-err-${Date.now()}`,
          role: 'ai',
          text: 'Terjadi kendala pada wizard: ' + (err.message || 'Gagal memproses'),
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          isError: true
        };
        setMessages((prev) => [...prev, errMsg]);
      }
    } finally {
      setIsThinking(false);
    }
  };

  const handleWizardGoBack = async (sessionId: string) => {
    setIsThinking(true);
    try {
      const wizardResp = await aiApiClient.goBackWizard(sessionId);
      const aiMsg: CoAssistantMessage = {
        id: `ai-wiz-${Date.now()}`,
        role: 'ai',
        text: wizardResp.message || '',
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        wizardResponse: wizardResp
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      console.warn('Wizard goBack error:', err);
    } finally {
      setIsThinking(false);
    }
  };

  const handleWizardCancel = async (sessionId: string) => {
    try {
      await aiApiClient.cancelWizard(sessionId);
      const aiMsg: CoAssistantMessage = {
        id: `ai-wiz-${Date.now()}`,
        role: 'ai',
        text: 'Pembuatan RAB interaktif telah dibatalkan.',
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      console.warn('Wizard cancel error:', err);
    }
  };

  const handleWizardConfirm = async (sessionId: string) => {
    const prjId = currentProject?.id || 'PRJ-TROPIS-MODERN-01';
    setIsThinking(true);
    try {
      const result = await aiApiClient.confirmWizard(sessionId, prjId);
      if (result.items && Array.isArray(result.items) && onAddRabItemDirect) {
        result.items.forEach((item: any) => onAddRabItemDirect(item));
      }
      const aiMsg: CoAssistantMessage = {
        id: `ai-wiz-${Date.now()}`,
        role: 'ai',
        text: `✅ **Berhasil Menerapkan RAB!**\n\nSebanyak **${result.addedItemsCount} item pekerjaan** telah dimasukkan ke spreadsheet proyek. Anda dapat memeriksa rincian item, volume, dan harga satuan di lembar kerja RAB.`,
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      const errMsg: CoAssistantMessage = {
        id: `ai-wiz-err-${Date.now()}`,
        role: 'ai',
        text: 'Gagal menerapkan RAB ke spreadsheet: ' + (err.message || 'Error'),
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        isError: true
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleQuickActionClick = async (actionId: string, title: string, initialPrompt: string) => {
    if (isThinking || isSendingRef.current) return;
    isSendingRef.current = true;
    stopGenerationRef.current = false;

    const userMsg: CoAssistantMessage = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'user',
      text: title,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsThinking(true);
    setThinkingStep(`Menyiapkan ${title}...`);

    try {
      const result = await coAssistantService.sendMessage({
        message: `[QUICK_ACTION_TRIGGER:${actionId}] ${initialPrompt}`,
        currentProject,
        projectRabItems,
        projectQtoItems,
        selectedRabItem,
        selectedQtoItem,
        activeModule,
        userRole,
        onThinking: (step) => setThinkingStep(step),
      });

      if (!stopGenerationRef.current) {
        const receivedMsg = result.message;
        setMessages((prev) => [...prev, receivedMsg]);
      }
    } catch {
      if (!stopGenerationRef.current) {
        const errorMsg: CoAssistantMessage = {
          id: `ai-err-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          role: 'ai',
          text: 'Maaf, terjadi kendala saat memproses tindakan cepat. Silakan coba kembali.',
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          isError: true,
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } finally {
      setIsThinking(false);
      isSendingRef.current = false;
    }
  };

  const handleQuickActionAnswer = async (
    sessionId: string,
    choiceId?: string,
    parameters?: Record<string, any>,
    textAnswer?: string
  ) => {
    setIsThinking(true);
    setThinkingStep('Memproses opsi...');

    if (choiceId) {
      const userChoiceMsg: CoAssistantMessage = {
        id: `user-choice-${Date.now()}`,
        role: 'user',
        text: choiceId.replace(/_/g, ' '),
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, userChoiceMsg]);
    }

    try {
      const resp = await quickActionService.answerStep(sessionId, choiceId, parameters, textAnswer);
      const aiMsg: CoAssistantMessage = {
        id: `ai-qa-${Date.now()}`,
        role: 'ai',
        text: resp.message || '',
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        quickActionResponse: resp,
        followUpSuggestions: resp.followUpSuggestions
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      const errMsg: CoAssistantMessage = {
        id: `ai-qa-err-${Date.now()}`,
        role: 'ai',
        text: 'Terjadi kendala pada dialog: ' + (err.message || 'Gagal memproses'),
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        isError: true
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleQuickActionGoBack = async (sessionId: string) => {
    setIsThinking(true);
    try {
      const resp = await quickActionService.goBack(sessionId);
      const aiMsg: CoAssistantMessage = {
        id: `ai-qa-${Date.now()}`,
        role: 'ai',
        text: resp.message || '',
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        quickActionResponse: resp
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      console.warn('QuickAction goBack error:', err);
    } finally {
      setIsThinking(false);
    }
  };

  const handleQuickActionCancel = async (sessionId: string) => {
    try {
      const resp = await quickActionService.cancelSession(sessionId);
      const aiMsg: CoAssistantMessage = {
        id: `ai-qa-${Date.now()}`,
        role: 'ai',
        text: resp.message || 'Sesi tindakan telah dibatalkan.',
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        followUpSuggestions: resp.followUpSuggestions
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      console.warn('QuickAction cancel error:', err);
    }
  };

  const handleQuickActionConfirm = async (sessionId: string) => {
    setIsThinking(true);
    try {
      const resp = await quickActionService.confirmSession(sessionId);
      const aiMsg: CoAssistantMessage = {
        id: `ai-qa-${Date.now()}`,
        role: 'ai',
        text: resp.message,
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        followUpSuggestions: resp.followUpSuggestions
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      const errMsg: CoAssistantMessage = {
        id: `ai-qa-err-${Date.now()}`,
        role: 'ai',
        text: 'Gagal mengonfirmasi tindakan: ' + (err.message || 'Terjadi kesalahan'),
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        isError: true
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleApplyProposal = (proposal: ActionProposal) => {
    if (!onAddRabItemDirect || appliedProposalIds.has(proposal.actionId)) return;

    const params = proposal.parameters || {};
    onAddRabItemDirect({
      description: params.description || proposal.description || 'Pekerjaan Tambahan AI',
      volume: typeof params.volume === 'number' ? params.volume : 1,
      unit: params.unit || 'ls',
      unitPrice: typeof params.unitPrice === 'number' ? params.unitPrice : 0,
      ahspCode: params.ahspCode || '',
      category: params.category || 'Pekerjaan Penyesuaian AI',
    });

    setAppliedProposalIds((prev) => new Set(prev).add(proposal.actionId));
  };

  const handleResetChat = () => {
    if (currentProject?.id) {
      try {
        unifiedConversationStore.createConversation(currentProject.id, 'Percakapan Copilot');
      } catch {}
    }
    setMessages([]);
    coAssistantService.setConversationId(null);
  };

  if (isClosed) return null;

  // Render Markdown-like formatted message content
  const renderMessageContent = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, idx) => {
      // Bold rendering
      let processed: React.ReactNode = line;
      if (line.includes('**')) {
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        processed = parts.map((part, pIdx) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={pIdx} style={{ fontWeight: 700, color: '#0F172A' }}>{part.slice(2, -2)}</strong>;
          }
          return part;
        });
      }

      // Bullet list items
      if (line.trim().startsWith('- ') || line.trim().startsWith('• ')) {
        return (
          <div key={idx} style={{ display: 'flex', gap: '6px', marginTop: '3px' }}>
            <span style={{ color: '#2563EB', fontWeight: 700 }}>•</span>
            <span style={{ flex: 1 }}>{typeof processed === 'string' ? processed.replace(/^[-•]\s*/, '') : processed}</span>
          </div>
        );
      }

      // Numbered list items
      const numMatch = line.trim().match(/^(\d+)\.\s+(.*)/);
      if (numMatch) {
        return (
          <div key={idx} style={{ display: 'flex', gap: '6px', marginTop: '3px' }}>
            <span style={{ color: '#2563EB', fontWeight: 600 }}>{numMatch[1]}.</span>
            <span style={{ flex: 1 }}>{numMatch[2]}</span>
          </div>
        );
      }

      return (
        <p key={idx} style={{ margin: idx > 0 ? '4px 0 0' : '0', minHeight: line.trim() ? 'auto' : '6px' }}>
          {processed}
        </p>
      );
    });
  };

  // Compact Responsive Layout Styles
  const desktopWidth = isExpanded ? 'min(640px, calc(100vw - 24px))' : 'min(390px, calc(100vw - 24px))';
  const desktopHeight = isExpanded ? 'min(700px, calc(100dvh - 24px))' : 'min(560px, calc(100dvh - 24px))';

  return (
    <div
      role="dialog"
      aria-label="EZRAB AI Co Assistant"
      aria-modal="false"
      style={{
        position: 'fixed',
        right: isMobile ? '0' : '16px',
        bottom: isMobile ? `${keyboardOffset}px` : '16px',
        left: isMobile ? '0' : 'auto',
        top: isMobile ? 'auto' : 'auto',
        width: isMobile ? '100vw' : desktopWidth,
        height: isMobile ? `min(calc(100dvh - 16px - ${keyboardOffset}px), 640px)` : desktopHeight,
        maxHeight: isMobile ? '100dvh' : 'calc(100dvh - 24px)',
        zIndex: 9995,
        backgroundColor: '#FFFFFF',
        borderRadius: isMobile ? '24px 24px 0 0' : '24px',
        border: isMobile ? 'none' : '1px solid rgba(226, 232, 240, 0.85)',
        boxShadow: isMobile
          ? '0 -8px 32px rgba(15, 23, 42, 0.14)'
          : '0 16px 48px -8px rgba(15, 23, 42, 0.14), 0 0 0 1px rgba(15, 23, 42, 0.05)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        transition: 'width 0.24s cubic-bezier(0.16, 1, 0.3, 1), height 0.24s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* =========================================================================
          1. HEADER PANEL (Compact ~52px)
         ========================================================================= */}
      <header
        style={{
          flexShrink: 0,
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #F1F5F9',
        }}
      >
        {/* Left: AI Avatar + Identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          {/* Avatar with Floating Mascot */}
          <div
            style={{
              position: 'relative',
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              padding: '2px',
              background: 'linear-gradient(135deg, #3B82F6 0%, #818CF8 50%, #C4B5FD 100%)',
              flexShrink: 0,
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.22)',
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                backgroundColor: '#EFF6FF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              <EZRABMascotLucu
                size={38}
                enableEyeTracking={true}
                enableBlink={true}
                enableFloat={false}
              />
            </div>
            {/* Online indicator dot */}
            <span
              style={{
                position: 'absolute',
                bottom: '0px',
                right: '0px',
                width: '11px',
                height: '11px',
                backgroundColor: '#10B981',
                borderRadius: '50%',
                border: '2px solid #FFFFFF',
              }}
              title="Online"
            />
          </div>

          {/* Center Identity */}
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <h1
                style={{
                  fontSize: '16px',
                  fontWeight: 800,
                  color: '#0F172A',
                  letterSpacing: '-0.02em',
                  lineHeight: 1.15,
                  margin: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                EZRAB AI
              </h1>
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: '#10B981',
                  boxShadow: '0 0 6px rgba(16, 185, 129, 0.8)',
                }}
                title="EZRAB AI Aktif"
              />
            </div>
            <p
              style={{
                fontSize: '11px',
                fontWeight: 500,
                color: '#64748B',
                margin: '2px 0 0',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              Proyek saat ini:{' '}
              <span style={{ color: '#1E40AF', fontWeight: 600 }}>{projectName}</span>
            </p>
          </div>
        </div>

        {/* Right Header Action Buttons (Compact ~30-32px) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          {/* New Chat Button */}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleResetChat}
              title="Percakapan Baru"
              aria-label="Percakapan Baru"
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748B',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#EFF6FF';
                e.currentTarget.style.color = '#2563EB';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#F8FAFC';
                e.currentTarget.style.color = '#64748B';
              }}
            >
              <RotateCcw size={13} />
            </button>
          )}

          {/* Minimize Button */}
          <button
            type="button"
            onClick={() => onModeChange('closed')}
            title="Minimalkan"
            aria-label="Minimalkan Assistant"
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748B',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#F1F5F9';
              e.currentTarget.style.color = '#0F172A';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#F8FAFC';
              e.currentTarget.style.color = '#64748B';
            }}
          >
            <Minus size={14} />
          </button>

          {/* Expand/Collapse Button (Desktop Only) */}
          {!isMobile && (
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              title={isExpanded ? 'Kecilkan Panel' : 'Perbesar Panel'}
              aria-label={isExpanded ? 'Kecilkan Ukuran Panel' : 'Perbesar Ukuran Panel'}
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748B',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#F1F5F9';
                e.currentTarget.style.color = '#0F172A';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#F8FAFC';
                e.currentTarget.style.color = '#64748B';
              }}
            >
              {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          )}

          {/* Open Full View (Magic AI SuperView) */}
          {onOpenSuperView && (
            <button
              type="button"
              onClick={() => onOpenSuperView(currentProject?.id ? unifiedConversationStore.getActiveConversationId(currentProject.id) || undefined : undefined)}
              title="Buka Layar Penuh (Magic AI SuperView)"
              aria-label="Buka Layar Penuh Magic AI SuperView"
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                backgroundColor: '#EFF6FF',
                border: '1px solid #BFDBFE',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2563EB',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#DBEAFE';
                e.currentTarget.style.color = '#1D4ED8';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#EFF6FF';
                e.currentTarget.style.color = '#2563EB';
              }}
            >
              <ExternalLink size={13} />
            </button>
          )}

          {/* Close Button */}
          <button
            type="button"
            onClick={() => onModeChange('closed')}
            title="Tutup"
            aria-label="Tutup Assistant"
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748B',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#FEE2E2';
              e.currentTarget.style.borderColor = '#FCA5A5';
              e.currentTarget.style.color = '#DC2626';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#F8FAFC';
              e.currentTarget.style.borderColor = '#E2E8F0';
              e.currentTarget.style.color = '#64748B';
            }}
          >
            <X size={14} />
          </button>
        </div>
      </header>

      {/* 2. Soft Accent Line Under Header */}
      <div
        style={{
          flexShrink: 0,
          height: '2px',
          width: '100%',
          background: 'linear-gradient(90deg, #2563EB 0%, #6366F1 50%, #C4B5FD 100%)',
          opacity: 0.85,
        }}
      />

      {/* =========================================================================
          3. CHAT BODY (Only scrollable container)
         ========================================================================= */}
      <div
        ref={messagesScrollRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: isMobile ? '12px' : '14px 16px',
          backgroundColor: '#FFFFFF',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          scrollbarWidth: 'thin',
        }}
      >
        {/* EMPTY STATE */}
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Assistant Welcome Bubble (Compact) */}
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div
                style={{
                  maxWidth: '88%',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '16px 16px 16px 4px',
                  padding: '12px 14px',
                  boxShadow: '0 2px 6px rgba(15, 23, 42, 0.03)',
                }}
              >
                <p
                  style={{
                    fontSize: '14px',
                    lineHeight: 1.45,
                    color: '#0F172A',
                    fontWeight: 500,
                    margin: 0,
                  }}
                >
                  Hallo! Saya <strong style={{ color: '#1E40AF', fontWeight: 700 }}>EZRAB AI</strong>, Co Assistant untuk Estimasi RAB Anda. Ada yang bisa saya bantu?
                </p>
              </div>
            </div>

            {/* Quick Actions Section (Compact 2-Columns) */}
            <div>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: '#64748B',
                  marginBottom: '8px',
                }}
              >
                QUICK ACTIONS
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '8px',
                }}
              >
                {QUICK_ACTIONS.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => handleQuickActionClick(action.actionId, action.title, action.prompt)}
                      style={{
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #E0E7FF',
                        borderRadius: '20px',
                        minHeight: '44px',
                        padding: '8px 10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        boxShadow: '0 1px 4px rgba(15, 23, 42, 0.02)',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#818CF8';
                        e.currentTarget.style.backgroundColor = '#F8FAFC';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(99, 102, 241, 0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#E0E7FF';
                        e.currentTarget.style.backgroundColor = '#FFFFFF';
                        e.currentTarget.style.boxShadow = '0 1px 4px rgba(15, 23, 42, 0.02)';
                      }}
                    >
                      <div
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          backgroundColor: '#EEF2FF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#4F46E5',
                          flexShrink: 0,
                        }}
                      >
                        <Icon size={14} />
                      </div>
                      <span
                        style={{
                          fontSize: '12.5px',
                          fontWeight: 600,
                          color: '#1E293B',
                          lineHeight: 1.2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {action.title}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* CONVERSATION MESSAGES (Compact) */}
        {messages.map((message) => {
          const isUser = message.role === 'user';
          return (
            <div
              key={message.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                justifyContent: isUser ? 'flex-end' : 'flex-start',
                width: '100%',
              }}
            >
              {!isUser && (
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
                    border: '1px solid #BFDBFE',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '2px',
                    boxShadow: '0 2px 6px rgba(37, 99, 235, 0.12)',
                    overflow: 'hidden',
                  }}
                  title="EZRAB AI"
                >
                  <img
                    src={mascotNewImg}
                    alt="EZRAB AI"
                    style={{ width: '32px', height: '32px', objectFit: 'contain' }}
                  />
                </div>
              )}
              <div
                style={{
                  maxWidth: isUser ? '84%' : '88%',
                  backgroundColor: isUser ? '#1D4ED8' : message.isError ? '#FEF2F2' : '#FFFFFF',
                  color: isUser ? '#FFFFFF' : message.isError ? '#991B1B' : '#0F172A',
                  border: isUser
                    ? 'none'
                    : message.isError
                    ? '1px solid #FCA5A5'
                    : '1px solid #E2E8F0',
                  borderRadius: isUser ? '16px 16px 4px 16px' : '4px 16px 16px 16px',
                  padding: '12px 14px',
                  fontSize: '13.5px',
                  lineHeight: 1.45,
                  boxShadow: isUser
                    ? '0 3px 10px rgba(29, 78, 216, 0.18)'
                    : '0 2px 8px rgba(15, 23, 42, 0.04)',
                  position: 'relative',
                }}
              >
                {!isUser && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginBottom: '8px',
                      paddingBottom: '6px',
                      borderBottom: '1px solid #F1F5F9',
                    }}
                  >
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A' }}>EZRAB AI</span>
                  </div>
                )}
                {/* Error Banner */}
                {message.isError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', color: '#DC2626', fontWeight: 600, fontSize: '12px' }}>
                    <AlertCircle size={14} />
                    <span>Perhatian Layanan AI</span>
                  </div>
                )}

                {/* Stat Callout (if returned) */}
                {message.stats && (
                  <div style={{ marginBottom: '8px', padding: '8px 10px', borderRadius: '10px', backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>{message.stats.label}</div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: message.stats.color || '#2563EB' }}>{message.stats.value}</div>
                    {message.stats.sub && <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>{message.stats.sub}</div>}
                  </div>
                )}

                {/* Message Body */}
                <div>{renderMessageContent(message.text)}</div>

                {/* Table (if returned) */}
                {message.table && message.table.rows?.length > 0 && (
                  <div style={{ marginTop: '8px', overflowX: 'auto', borderRadius: '8px', border: '1px solid #E2E8F0', backgroundColor: '#FFFFFF' }}>
                    <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                          {message.table.headers.map((h, hIdx) => (
                            <th key={hIdx} style={{ padding: '6px 8px', fontWeight: 700, color: '#475569' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {message.table.rows.map((row, rIdx) => (
                          <tr key={rIdx} style={{ borderBottom: rIdx < message.table!.rows.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} style={{ padding: '6px 8px', color: '#1E293B' }}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Action Proposal Card (e.g. Add RAB Item suggested by AI) */}
                {message.actionProposal && (
                  <div
                    style={{
                      marginTop: '8px',
                      padding: '10px',
                      borderRadius: '12px',
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      boxShadow: '0 1px 4px rgba(15, 23, 42, 0.04)',
                    }}
                  >
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#1E40AF', marginBottom: '4px' }}>
                      📋 Rekomendasi Aksi Estimasi
                    </div>
                    <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#0F172A' }}>
                      {message.actionProposal.description || message.actionProposal.toolName}
                    </div>
                    {userRole !== 'CLIENT' && (
                      <div style={{ marginTop: '8px', display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          disabled={appliedProposalIds.has(message.actionProposal.actionId)}
                          onClick={() => handleApplyProposal(message.actionProposal!)}
                          style={{
                            padding: '5px 10px',
                            borderRadius: '6px',
                            backgroundColor: appliedProposalIds.has(message.actionProposal.actionId) ? '#F1F5F9' : '#2563EB',
                            color: appliedProposalIds.has(message.actionProposal.actionId) ? '#64748B' : '#FFFFFF',
                            fontSize: '11.5px',
                            fontWeight: 600,
                            border: 'none',
                            cursor: appliedProposalIds.has(message.actionProposal.actionId) ? 'default' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          {appliedProposalIds.has(message.actionProposal.actionId) ? (
                            <>
                              <Check size={12} /> Diterapkan
                            </>
                          ) : (
                            <>
                              <PlusCircle size={12} /> Terapkan ke RAB
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Interactive Assistant Wizard Card (Phase A House Vertical Slice) */}
                {message.wizardResponse && (
                  <AssistantWizardRenderer
                    data={message.wizardResponse}
                    onAnswer={handleWizardAnswer}
                    onGoBack={handleWizardGoBack}
                    onCancel={handleWizardCancel}
                    onConfirm={handleWizardConfirm}
                    isLoading={isThinking}
                  />
                )}

                {/* Interactive Quick Action Dialogue Card */}
                {message.quickActionResponse && (
                  <QuickActionDialogueRenderer
                    data={message.quickActionResponse}
                    onAnswer={handleQuickActionAnswer}
                    onGoBack={handleQuickActionGoBack}
                    onCancel={handleQuickActionCancel}
                    onConfirm={handleQuickActionConfirm}
                    isLoading={isThinking}
                  />
                )}

                {/* Contextual Follow-Up Suggestion Chips */}
                {message.followUpSuggestions && message.followUpSuggestions.length > 0 && (
                  <QuickActionFollowUpSuggestions
                    suggestions={message.followUpSuggestions}
                    onSelectSuggestion={(suggestion) => handleSendMessage(suggestion)}
                    disabled={isThinking}
                  />
                )}

                {/* Timestamp */}
                <div
                  style={{
                    fontSize: '9.5px',
                    color: isUser ? 'rgba(255, 255, 255, 0.65)' : '#94A3B8',
                    textAlign: 'right',
                    marginTop: '4px',
                  }}
                >
                  {message.timestamp}
                </div>
              </div>
            </div>
          );
        })}

        {/* THINKING / TYPING INDICATOR */}
        {isThinking && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div
              style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '16px 16px 16px 4px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 1px 4px rgba(15, 23, 42, 0.03)',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  backgroundColor: '#3B82F6',
                  borderRadius: '50%',
                  display: 'inline-block',
                  animation: 'bounceDot 1.4s infinite ease-in-out',
                }}
              />
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  backgroundColor: '#6366F1',
                  borderRadius: '50%',
                  display: 'inline-block',
                  animation: 'bounceDot 1.4s infinite ease-in-out 0.2s',
                }}
              />
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  backgroundColor: '#8B5CF6',
                  borderRadius: '50%',
                  display: 'inline-block',
                  animation: 'bounceDot 1.4s infinite ease-in-out 0.4s',
                }}
              />
              <span style={{ fontSize: '11.5px', color: '#64748B', marginLeft: '4px', fontWeight: 500 }}>
                {thinkingStep}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          4. PROJECT CONTEXT BAR & COMPOSER (Compact & Sticky at bottom)
         ========================================================================= */}
      <div
        style={{
          flexShrink: 0,
          backgroundColor: '#FFFFFF',
          borderTop: '1px solid #F1F5F9',
          padding: isMobile ? '8px 12px calc(10px + env(safe-area-inset-bottom, 0px))' : '10px 14px 12px',
        }}
      >
        {/* Project Context Chip (Compact ~34px) */}
        {contextChipVisible && (
          <div style={{ marginBottom: '8px', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setIsProjectDropdownOpen((prev) => !prev)}
                title="Pilih proyek aktif"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '18px',
                  height: '34px',
                  padding: '0 12px',
                  fontSize: '11.5px',
                  fontWeight: 500,
                  color: '#475569',
                  maxWidth: 'calc(100% - 32px)',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#EFF6FF';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#F8FAFC';
                }}
              >
                <Building2 size={13} color="#64748B" style={{ flexShrink: 0 }} />
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontWeight: 600,
                    color: '#1E293B',
                  }}
                >
                  Konteks: {projectName}
                </span>
                <ChevronDown size={12} color="#64748B" style={{ flexShrink: 0 }} />
              </button>

              {/* Dismiss X button */}
              <button
                type="button"
                onClick={() => setContextChipVisible(false)}
                title="Sembunyikan info konteks"
                aria-label="Sembunyikan info konteks"
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  color: '#94A3B8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#0F172A';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#94A3B8';
                }}
              >
                <X size={11} />
              </button>
            </div>

            {/* Project Selection Dropdown */}
            {isProjectDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 4px)',
                  left: 0,
                  width: '260px',
                  maxHeight: '180px',
                  overflowY: 'auto',
                  backgroundColor: '#FFFFFF',
                  borderRadius: '14px',
                  boxShadow: '0 12px 30px -4px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(15, 23, 42, 0.08)',
                  padding: '4px',
                  zIndex: 100,
                }}
              >
                <div style={{ padding: '4px 8px', fontSize: '10px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>
                  PILIH PROYEK AKTIF
                </div>
                {projects.length === 0 ? (
                  <div style={{ padding: '6px 8px', fontSize: '11.5px', color: '#64748B' }}>
                    Belum ada proyek tersedia.
                  </div>
                ) : (
                  projects.map((proj) => (
                    <button
                      key={proj.id}
                      type="button"
                      onClick={() => {
                        onSelectProject?.(proj.id);
                        setIsProjectDropdownOpen(false);
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '6px 8px',
                        borderRadius: '8px',
                        backgroundColor: proj.id === currentProject?.id ? '#EFF6FF' : 'transparent',
                        border: 'none',
                        fontSize: '11.5px',
                        fontWeight: proj.id === currentProject?.id ? 700 : 500,
                        color: proj.id === currentProject?.id ? '#1D4ED8' : '#1E293B',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      onMouseEnter={(e) => {
                        if (proj.id !== currentProject?.id) e.currentTarget.style.backgroundColor = '#F8FAFC';
                      }}
                      onMouseLeave={(e) => {
                        if (proj.id !== currentProject?.id) e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      {proj.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Indikator STT: tampil saat sedang mendengarkan */}
        {isListening && (
          <div
            role="status"
            aria-live="polite"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '8px',
              fontSize: '12px',
              color: '#DC2626',
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#EF4444',
                animation: 'ezrabMicPulse 1.4s ease-in-out infinite',
                flexShrink: 0,
              }}
            />
            {t('chat.stt_listening')}
          </div>
        )}

        {/* Composer Pill Input Box (Compact ~52px) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#FAFAFC',
            border: '1.5px solid #E2E8F0',
            borderRadius: '24px',
            minHeight: '52px',
            padding: '4px 6px 4px 14px',
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          }}
        >
          {/* Multi-line Auto-expanding Textarea */}
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputQuery}
            onChange={handleTextareaChange}
            enterKeyHint="send"
            inputMode="text"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Tanyakan tentang proyek Anda..."
            aria-label="Tanyakan tentang proyek Anda"
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: '13.5px',
              color: '#0F172A',
              resize: 'none',
              lineHeight: 1.35,
              padding: '6px 0',
              maxHeight: '100px',
              fontFamily: 'inherit',
            }}
          />

          {/* Mic Button (Speech-to-Text / dikte suara) */}
          <button
            type="button"
            onClick={handleMicClick}
            title={isListening ? t('chat.stt_stop') : t('chat.stt_mic')}
            aria-label={isListening ? t('chat.stt_stop') : t('chat.stt_mic')}
            aria-pressed={isListening}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: isListening ? '#EF4444' : '#FFFFFF',
              border: isListening ? 'none' : '1.5px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isListening ? '#FFFFFF' : '#475569',
              cursor: 'pointer',
              flexShrink: 0,
              boxShadow: isListening ? '0 2px 8px rgba(239, 68, 68, 0.35)' : 'none',
              animation: isListening ? 'ezrabMicPulse 1.4s ease-in-out infinite' : 'none',
            }}
          >
            <Mic size={16} />
          </button>

          {/* Stop Generation Button when thinking */}
          {isThinking ? (
            <button
              type="button"
              onClick={handleStopGeneration}
              title="Hentikan pembuatan respons"
              aria-label="Hentikan pembuatan respons"
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#EF4444',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                cursor: 'pointer',
                flexShrink: 0,
                boxShadow: '0 2px 8px rgba(239, 68, 68, 0.35)',
              }}
            >
              <Square size={14} fill="#FFFFFF" />
            </button>
          ) : (
            /* Send Button */
            <button
              type="button"
              onClick={() => handleSendMessage()}
              disabled={!inputQuery.trim()}
              title="Kirim pesan (Enter)"
              aria-label="Kirim pesan"
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #2563EB 0%, #4F46E5 100%)',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                cursor: !inputQuery.trim() ? 'not-allowed' : 'pointer',
                opacity: !inputQuery.trim() ? 0.45 : 1,
                boxShadow: !inputQuery.trim() ? 'none' : '0 3px 10px rgba(79, 70, 229, 0.3)',
                flexShrink: 0,
                transition: 'transform 0.15s ease, opacity 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (inputQuery.trim()) {
                  e.currentTarget.style.transform = 'scale(1.05)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <Send size={16} style={{ transform: 'translateX(-1px)' }} />
            </button>
          )}
        </div>

        {/* Footer Disclaimer (Compact) */}
        <div
          style={{
            marginTop: '6px',
            textAlign: 'center',
            fontSize: '10.5px',
            color: '#94A3B8',
            fontWeight: 500,
          }}
        >
          EZRAB AI Co Assistant • Mengikuti izin dan keamanan akun Anda
        </div>
      </div>

      <style>{`
        @keyframes bounceDot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
          40% { transform: scale(1.15); opacity: 1; }
        }
        @keyframes ezrabMascotBob {
          0%, 100% {
            transform: translateY(0px) rotate(0deg);
          }
          50% {
            transform: translateY(-4px) rotate(2deg);
          }
        }
        @keyframes ezrabMicPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.45); }
          50% { box-shadow: 0 0 0 9px rgba(239, 68, 68, 0); }
        }
      `}</style>
    </div>
  );
};

export default EzrabCoAssistantChatbox;

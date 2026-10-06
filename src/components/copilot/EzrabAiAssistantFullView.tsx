import React, { useState, useEffect, useRef, useMemo, useTransition } from 'react';
import {
  Send,
  Plus,
  Paperclip,
  Search,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Calculator,
  ChevronDown,
  Building,
  Coins,
  TrendingDown,
  Sparkles,
  X,
  MoreHorizontal,
  Edit2,
  Copy,
  Trash2,
  FileSpreadsheet,
  Image as ImageIcon,
  Square,
  RefreshCw,
  PanelLeftClose,
  PanelLeftOpen,
  ArrowRight,
  Check,
  RotateCcw,
  ExternalLink,
} from 'lucide-react';
import { Project, RabItem, ScheduleTask, KurvaSDataPoint } from '../../types';
import {
  FullProjectAIContext,
  buildFullAIContext,
  formatRupiah,
} from '../../services/aiContextService';
import {
  defaultAiProvider,
  AiResponseResult,
  AiActionProposal,
} from '../../services/aiProviderEngine';
import { AssistantWizardRenderer } from './AssistantWizardRenderer';
import { QuickActionDialogueRenderer } from './QuickActionDialogueRenderer';
import { QuickActionFollowUpSuggestions } from './QuickActionFollowUpSuggestions';
import { quickActionService } from '../../services/quickActionService';
import { QUICK_ACTIONS_LIST } from '../../data/quickActionContracts';
import { aiApiClient } from '../../services/aiApiClient';
import { coAssistantService, resolveClientWizardStep } from '../../services/coAssistantService';
import aiLogoAsset from '../../assets/ezrab-co-assistant-logo.jpg';
import ezrabAvatarImg from '../../assets/ezrab_avatar.png';
import mascotNewImg from '../../assets/mascot-ezrab-new.png';

// =============================================================================
// TYPES & DATA STRUCTURES
// =============================================================================

export interface AttachedFile {
  id: string;
  name: string;
  size: number;
  type: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
  badge?: 'RAB' | 'KURVA S' | 'LAPORAN' | 'AHSP';
  providerLabel?: string;
  stats?: AiResponseResult['stats'];
  actionProposal?: AiActionProposal;
  table?: AiResponseResult['table'];
  attachments?: AttachedFile[];
  isError?: boolean;
  intent?: string;
  wizardResponse?: any;
  quickActionResponse?: any;
  followUpSuggestions?: string[];
}

export interface ChatSession {
  id: string;
  title: string;
  projectId?: string;
  createdAt: number;
  updatedAt: number;
  preview: string;
  messages: ChatMessage[];
}

export interface EzrabAiAssistantFullViewProps {
  currentProject: Project | null;
  projects: Project[];
  projectRabItems: RabItem[];
  projectScheduleTasks?: ScheduleTask[];
  projectKurvaSData?: KurvaSDataPoint[];
  onSelectProject?: (projectId: string) => void;
  onNavigateToTab?: (tab: string) => void;
  onAddRabItemDirect?: (item: Partial<RabItem> & { description: string; volume: number; unit: string; unitPrice?: number; ahspCode?: string; category?: string }) => void;
  onOpenFloatingChat?: () => void;
}

// LocalStorage Keys
const SESSIONS_STORAGE_KEY = 'ezrab_ai_workspace_sessions_v2';
const SIDEBAR_COLLAPSED_KEY = 'ezrab_ai_workspace_sidebar_collapsed';

// Format bytes into readable string
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Date grouping helper
const getDateGroup = (timestampMs: number): 'Hari ini' | 'Kemarin' | '7 hari yang lalu' | '30 hari terakhir' => {
  const now = new Date();
  const date = new Date(timestampMs);

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const startOf7Days = startOfToday - 7 * 24 * 60 * 60 * 1000;

  if (timestampMs >= startOfToday) return 'Hari ini';
  if (timestampMs >= startOfYesterday) return 'Kemarin';
  if (timestampMs >= startOf7Days) return '7 hari yang lalu';
  return '30 hari terakhir';
};

// Default starter sessions
const createDefaultSessions = (currentProjId?: string): ChatSession[] => {
  const now = Date.now();
  return [
    {
      id: 'session-demo-1',
      title: 'Optimasi Biaya Pembesian Kolom',
      projectId: currentProjId,
      createdAt: now - 1000 * 60 * 45, // 45 mins ago
      updatedAt: now - 1000 * 60 * 45,
      preview: 'Analisis dan buatkan RAB lengkap pembesian kolom K-300...',
      messages: [
        {
          id: 'msg-demo-u1',
          sender: 'user',
          content: 'Tolong evaluasi efisiensi pekerjaan pembesian kolom K-300 dan berikan usulan penghematan biaya.',
          timestamp: '10:24',
        },
        {
          id: 'msg-demo-a1',
          sender: 'assistant',
          content: `Berikut hasil analisis komprehensif pekerjaan **Pembesian Kolom K-300**:

### Ringkasan Analisis
- **Volume Pekerjaan**: 1.250 kg
- **Harga Satuan Terdata**: Rp16.500/kg
- **Total Biaya Terdata**: Rp20.625.000
- **Deviasi terhadap Standar HSPK**: +8,2%

### Saran & Rekomendasi
1. **Optimasi Pemotongan (*Bar Bending Schedule*)**: Pengaturan pola potong terencana dapat mereduksi *cutting waste* dari 5% menjadi 2,5%.
2. **Negosiasi Grade BjTS 420B**: Menggunakan harga pasaran volume besar dapat menurunkan harga satuan ke **Rp15.900/kg**.
3. **Potensi Efisiensi Biaya**: Estimasi penghematan sebesar **Rp750.000** tanpa mengurangi kekuatan struktur.`,
          timestamp: '10:24',
          badge: 'AHSP',
          stats: {
            label: 'Potensi Penghematan',
            value: 'Rp 750.000',
            sub: 'Deviasi harga -4.8% terhadap RAB awal',
            color: '#16A34A',
          },
          actionProposal: {
            id: 'prop-demo-1',
            type: 'OPTIMIZE_COST',
            title: 'Usulan Penyesuaian Harga Pembesian Kolom K-300',
            description: 'Penyesuaian harga satuan dari Rp16.500/kg menjadi Rp15.900/kg (Hemat Rp750.000).',
            itemData: {
              description: 'Pembesian Kolom Praktis & Utama (Besi Ulir BjTS 420B)',
              volume: 1250,
              unit: 'kg',
              unitPrice: 15900,
              ahspCode: 'A.4.1.1.17',
              category: 'Pekerjaan Struktur',
            },
            status: 'PENDING',
          },
        },
      ],
    },
    {
      id: 'session-demo-2',
      title: 'Review Deviasi Kurva S',
      projectId: currentProjId,
      createdAt: now - 1000 * 60 * 60 * 26, // yesterday
      updatedAt: now - 1000 * 60 * 60 * 26,
      preview: 'Pengecekan deviasi jadwal pekerjaan struktur terhadap rencana...',
      messages: [],
    },
  ];
};

// =============================================================================
// COMPONENT
// =============================================================================

export const EzrabAiAssistantFullView: React.FC<EzrabAiAssistantFullViewProps> = ({
  currentProject,
  projects,
  projectRabItems,
  projectScheduleTasks = [],
  projectKurvaSData = [],
  onSelectProject,
  onNavigateToTab,
  onAddRabItemDirect,
  onOpenFloatingChat,
}) => {
  // Sidebar Collapse state
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {}
      return next;
    });
  };

  // Sessions state
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem(SESSIONS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return createDefaultSessions(currentProject?.id);
  });

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    return sessions[0]?.id || 'new';
  });

  // Search input in sidebar
  const [historySearchQuery, setHistorySearchQuery] = useState('');

  // Project selector dropdown state
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const projectDropdownRef = useRef<HTMLDivElement>(null);

  // Active session menu (overflow •••)
  const [activeMenuSessionId, setActiveMenuSessionId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitleText, setEditTitleText] = useState('');

  // Composer input & attachments
  const [inputText, setInputText] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // AI Generation & Streaming state
  const [isGenerating, setIsGenerating] = useState(false);
  const [thinkingStep, setThinkingStep] = useState<string>('Menganalisis...');
  const [streamingContent, setStreamingContent] = useState<string>('');
  const stopGenerationRef = useRef<boolean>(false);

  // Toast notification for actions
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Close project selector dropdown when clicked outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        projectDropdownRef.current &&
        !projectDropdownRef.current.contains(e.target as Node)
      ) {
        setIsProjectDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Save sessions to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
    } catch {}
  }, [sessions]);

  // Current active session
  const activeSession = useMemo(() => {
    return sessions.find((s) => s.id === activeSessionId) || null;
  }, [sessions, activeSessionId]);

  const activeMessages = activeSession ? activeSession.messages : [];

  // Build AI Context
  const aiContext: FullProjectAIContext = useMemo(() => {
    return buildFullAIContext(
      currentProject,
      projectRabItems,
      projectScheduleTasks,
      projectKurvaSData,
      'ai-assistant'
    );
  }, [currentProject, projectRabItems, projectScheduleTasks, projectKurvaSData]);

  const activeProjectName = currentProject?.name || 'Proyek Aktif';

  // Scroll to bottom smoothly
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom('smooth');
  }, [activeMessages.length, isGenerating, streamingContent]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      // initial ~58px, max ~130px (approx 4-5 lines)
      textareaRef.current.style.height = `${Math.min(Math.max(scrollHeight, 44), 130)}px`;
    }
  }, [inputText]);

  // File Attachment Handlers
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles: AttachedFile[] = Array.from(files).map((f: File) => ({
      id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      name: f.name,
      size: f.size,
      type: f.type,
    }));

    setAttachedFiles((prev) => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveFile = (fileId: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  // Trigger New Chat
  const handleNewConversation = () => {
    const newId = `session-${Date.now()}`;
    const newSession: ChatSession = {
      id: newId,
      title: 'Percakapan Baru',
      projectId: currentProject?.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      preview: 'Belum ada pesan...',
      messages: [],
    };

    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newId);
    setInputText('');
    setAttachedFiles([]);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // Rename session
  const handleStartRename = (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(session.id);
    setEditTitleText(session.title);
    setActiveMenuSessionId(null);
  };

  const handleSaveRename = (sessionId: string) => {
    if (editTitleText.trim()) {
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, title: editTitleText.trim() } : s))
      );
    }
    setEditingSessionId(null);
  };

  // Duplicate session
  const handleDuplicateSession = (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveMenuSessionId(null);

    const duplicated: ChatSession = {
      id: `session-${Date.now()}`,
      title: `${session.title} (Salinan)`,
      projectId: session.projectId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      preview: session.preview,
      messages: JSON.parse(JSON.stringify(session.messages)),
    };

    setSessions((prev) => [duplicated, ...prev]);
    setActiveSessionId(duplicated.id);
    showToast('Percakapan berhasil diduplikasi.');
  };

  // Delete session
  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveMenuSessionId(null);

    if (window.confirm('Hapus percakapan ini dari riwayat?')) {
      setSessions((prev) => {
        const filtered = prev.filter((s) => s.id !== sessionId);
        if (activeSessionId === sessionId) {
          if (filtered.length > 0) {
            setActiveSessionId(filtered[0].id);
          } else {
            // If empty, auto-create a clean new session
            const cleanNew: ChatSession = {
              id: `session-${Date.now()}`,
              title: 'Percakapan Baru',
              projectId: currentProject?.id,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              preview: 'Belum ada pesan...',
              messages: [],
            };
            setActiveSessionId(cleanNew.id);
            return [cleanNew];
          }
        }
        return filtered;
      });
      showToast('Percakapan dihapus.');
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3800);
  };

  // Filter sessions by search
  const filteredSessions = useMemo(() => {
    if (!historySearchQuery.trim()) return sessions;
    const query = historySearchQuery.toLowerCase();
    return sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(query) ||
        s.preview.toLowerCase().includes(query) ||
        s.messages.some((m) => m.content.toLowerCase().includes(query))
    );
  }, [sessions, historySearchQuery]);

  // Group sessions chronologically
  const groupedSessions = useMemo(() => {
    const groups: Record<'Hari ini' | 'Kemarin' | '7 hari yang lalu' | '30 hari terakhir', ChatSession[]> = {
      'Hari ini': [],
      'Kemarin': [],
      '7 hari yang lalu': [],
      '30 hari terakhir': [],
    };

    for (const session of filteredSessions) {
      const group = getDateGroup(session.updatedAt || session.createdAt);
      groups[group].push(session);
    }

    return groups;
  }, [filteredSessions]);

  // Click suggestion card -> populate composer with editable prompt
  const handleSuggestionClick = (promptTemplate: string) => {
    setInputText(promptTemplate);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // Stop Generation
  const handleStopGeneration = () => {
    stopGenerationRef.current = true;
  };

  // Send Message Logic with progressive token streaming
  const handleSendMessage = async (customPrompt?: string) => {
    const text = (customPrompt || inputText).trim();
    if (!text || isGenerating) return;

    stopGenerationRef.current = false;

    // Create user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      attachments: attachedFiles.length > 0 ? [...attachedFiles] : undefined,
    };

    // Ensure session exists
    let targetSessionId = activeSessionId;
    if (!activeSession) {
      const newSession: ChatSession = {
        id: `session-${Date.now()}`,
        title: text.slice(0, 38) + (text.length > 38 ? '...' : ''),
        projectId: currentProject?.id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        preview: text.slice(0, 60),
        messages: [userMsg],
      };
      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(newSession.id);
      targetSessionId = newSession.id;
    } else {
      // Append user message & update title if first message
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id === targetSessionId) {
            const isFirst = s.messages.length === 0;
            return {
              ...s,
              title: isFirst ? text.slice(0, 38) + (text.length > 38 ? '...' : '') : s.title,
              preview: text.slice(0, 60),
              updatedAt: Date.now(),
              messages: [...s.messages, userMsg],
            };
          }
          return s;
        })
      );
    }

    // Reset composer input & attachments
    setInputText('');
    setAttachedFiles([]);
    setIsGenerating(true);
    setStreamingContent('');
    setThinkingStep('Menganalisis konteks proyek...');

    try {
      // Send message via coAssistantService (server first with seamless offline/mock fallback)
      const sendResult = await coAssistantService.sendMessage({
        message: text,
        currentProject,
        projectRabItems,
        conversationId: targetSessionId,
        onThinking: (step) => setThinkingStep(step),
      });

      const responseMsg = sendResult.message;

      // Progressive streaming simulation (smooth token reveal)
      const fullContent = responseMsg.text;
      const chunkSize = 4;
      let currentLen = 0;

      while (currentLen < fullContent.length) {
        if (stopGenerationRef.current) {
          break;
        }
        currentLen = Math.min(currentLen + chunkSize, fullContent.length);
        setStreamingContent(fullContent.slice(0, currentLen));
        await new Promise((r) => setTimeout(r, 16));
      }

      const finalContent = stopGenerationRef.current ? streamingContent || fullContent : fullContent;

      let proposal: AiActionProposal | undefined = undefined;
      if (responseMsg.actionProposal) {
        proposal = {
          id: responseMsg.actionProposal.actionId,
          type: (responseMsg.actionProposal.toolName as any) || 'ADD_RAB_ITEM',
          title: responseMsg.actionProposal.description,
          description: responseMsg.actionProposal.description,
          itemData: responseMsg.actionProposal.parameters as any,
          status: 'PENDING',
        };
      }

      const aiMsg: ChatMessage = {
        id: responseMsg.id || `ai-${Date.now()}`,
        sender: 'assistant',
        content: finalContent,
        timestamp: responseMsg.timestamp || new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        intent: responseMsg.intent,
        wizardResponse: responseMsg.wizardResponse,
        quickActionResponse: responseMsg.quickActionResponse,
        followUpSuggestions: responseMsg.followUpSuggestions,
        stats: responseMsg.stats,
        actionProposal: proposal,
        table: responseMsg.table,
        isError: responseMsg.isError,
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === targetSessionId
            ? {
                ...s,
                updatedAt: Date.now(),
                messages: [...s.messages, aiMsg],
              }
            : s
        )
      );
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: `ai-err-${Date.now()}`,
        sender: 'assistant',
        content: 'Jawaban belum berhasil dibuat. Silakan coba lagi.',
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        isError: true,
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === targetSessionId
            ? {
                ...s,
                updatedAt: Date.now(),
                messages: [...s.messages, errorMsg],
              }
            : s
        )
      );
    } finally {
      setIsGenerating(false);
      setStreamingContent('');
      stopGenerationRef.current = false;
    }
  };

  // =========================================================================
  // INTERACTIVE WIZARD ACTION HANDLERS
  // =========================================================================
  const handleWizardAnswer = async (sessionId: string, choiceId?: string, parameters?: Record<string, any>) => {
    if (!sessionId) return;
    setIsGenerating(true);
    setThinkingStep('Memproses pilihan wizard...');
    try {
      const wizardResp = await aiApiClient.answerWizard(sessionId, choiceId, parameters);
      const aiMsg: ChatMessage = {
        id: `ai-wiz-${Date.now()}`,
        sender: 'assistant',
        content: wizardResp.message || '',
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        wizardResponse: wizardResp,
      };
      setSessions((prev) =>
        prev.map((s) =>
          s.id === (activeSessionId || s.id)
            ? { ...s, updatedAt: Date.now(), messages: [...s.messages, aiMsg] }
            : s
        )
      );
    } catch (err: any) {
      console.warn('Wizard answer error, using fallback:', err);
      try {
        const activeSession = sessions.find((s) => s.id === (activeSessionId || s.id));
        const lastWizMsg = activeSession?.messages.filter((m) => !!m.wizardResponse).pop();
        const fallbackResp = resolveClientWizardStep(sessionId, choiceId, parameters, lastWizMsg?.wizardResponse);
        const aiMsg: ChatMessage = {
          id: `ai-wiz-${Date.now()}`,
          sender: 'assistant',
          content: fallbackResp.message || '',
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          wizardResponse: fallbackResp,
        };
        setSessions((prev) =>
          prev.map((s) =>
            s.id === (activeSessionId || s.id)
              ? { ...s, updatedAt: Date.now(), messages: [...s.messages, aiMsg] }
              : s
          )
        );
      } catch (fallbackErr) {
        console.error('Wizard fallback error:', fallbackErr);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleWizardGoBack = async (sessionId: string) => {
    if (!sessionId) return;
    setIsGenerating(true);
    try {
      const wizardResp = await aiApiClient.goBackWizard(sessionId);
      const aiMsg: ChatMessage = {
        id: `ai-wiz-${Date.now()}`,
        sender: 'assistant',
        content: wizardResp.message || '',
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        wizardResponse: wizardResp,
      };
      setSessions((prev) =>
        prev.map((s) =>
          s.id === (activeSessionId || s.id)
            ? { ...s, updatedAt: Date.now(), messages: [...s.messages, aiMsg] }
            : s
        )
      );
    } catch (err: any) {
      console.warn('Wizard goBack error:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleWizardCancel = async (sessionId: string) => {
    if (!sessionId) return;
    try {
      await aiApiClient.cancelWizard(sessionId);
      const aiMsg: ChatMessage = {
        id: `ai-wiz-${Date.now()}`,
        sender: 'assistant',
        content: 'Pembuatan RAB interaktif telah dibatalkan.',
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      };
      setSessions((prev) =>
        prev.map((s) =>
          s.id === (activeSessionId || s.id)
            ? { ...s, updatedAt: Date.now(), messages: [...s.messages, aiMsg] }
            : s
        )
      );
    } catch (err: any) {
      console.warn('Wizard cancel error:', err);
    }
  };

  const handleWizardConfirm = async (sessionId: string) => {
    const prjId = currentProject?.id || 'PRJ-TROPIS-MODERN-01';
    setIsGenerating(true);
    try {
      const result = await aiApiClient.confirmWizard(sessionId, prjId);
      if (result.items && Array.isArray(result.items) && onAddRabItemDirect) {
        result.items.forEach((item: any) => onAddRabItemDirect(item));
      }
      const aiMsg: ChatMessage = {
        id: `ai-wiz-${Date.now()}`,
        sender: 'assistant',
        content: `✅ **Berhasil Menerapkan RAB!**\n\nSebanyak **${result.addedItemsCount} item pekerjaan** telah dimasukkan ke spreadsheet proyek. Anda dapat memeriksa rincian item, volume, dan harga satuan di lembar kerja RAB.`,
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      };
      setSessions((prev) =>
        prev.map((s) =>
          s.id === (activeSessionId || s.id)
            ? { ...s, updatedAt: Date.now(), messages: [...s.messages, aiMsg] }
            : s
        )
      );
      showToast(`✓ ${result.addedItemsCount} item RAB berhasil diterapkan ke proyek.`);
    } catch (err: any) {
      console.warn('Wizard confirm error:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  // =========================================================================
  // INTERACTIVE QUICK ACTION HANDLERS
  // =========================================================================
  const handleQuickActionClick = async (actionId: string, title: string, initialPrompt: string) => {
    await handleSendMessage(`[QUICK_ACTION_TRIGGER:${actionId}] ${initialPrompt}`);
  };

  const handleQuickActionAnswer = async (
    sessionId: string,
    choiceId?: string,
    parameters?: Record<string, any>,
    textAnswer?: string
  ) => {
    if (!sessionId) return;
    setIsGenerating(true);
    setThinkingStep('Memproses respons...');

    if (choiceId) {
      const userChoiceMsg: ChatMessage = {
        id: `user-choice-${Date.now()}`,
        sender: 'user',
        content: choiceId.replace(/_/g, ' '),
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      };
      setSessions((prev) =>
        prev.map((s) =>
          s.id === (activeSessionId || s.id)
            ? { ...s, updatedAt: Date.now(), messages: [...s.messages, userChoiceMsg] }
            : s
        )
      );
    }

    try {
      const resp = await quickActionService.answerStep(sessionId, choiceId, parameters, textAnswer);
      const aiMsg: ChatMessage = {
        id: `ai-qa-${Date.now()}`,
        sender: 'assistant',
        content: resp.message || '',
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        quickActionResponse: resp,
        followUpSuggestions: resp.followUpSuggestions,
      };
      setSessions((prev) =>
        prev.map((s) =>
          s.id === (activeSessionId || s.id)
            ? { ...s, updatedAt: Date.now(), messages: [...s.messages, aiMsg] }
            : s
        )
      );
    } catch (err: any) {
      const errMsg: ChatMessage = {
        id: `ai-qa-err-${Date.now()}`,
        sender: 'assistant',
        content: 'Terjadi kendala pada dialog: ' + (err.message || 'Gagal memproses'),
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        isError: true,
      };
      setSessions((prev) =>
        prev.map((s) =>
          s.id === (activeSessionId || s.id)
            ? { ...s, updatedAt: Date.now(), messages: [...s.messages, errMsg] }
            : s
        )
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleQuickActionGoBack = async (sessionId: string) => {
    if (!sessionId) return;
    setIsGenerating(true);
    try {
      const resp = await quickActionService.goBack(sessionId);
      const aiMsg: ChatMessage = {
        id: `ai-qa-${Date.now()}`,
        sender: 'assistant',
        content: resp.message || '',
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        quickActionResponse: resp,
      };
      setSessions((prev) =>
        prev.map((s) =>
          s.id === (activeSessionId || s.id)
            ? { ...s, updatedAt: Date.now(), messages: [...s.messages, aiMsg] }
            : s
        )
      );
    } catch (err: any) {
      console.warn('QuickAction goBack error:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleQuickActionCancel = async (sessionId: string) => {
    if (!sessionId) return;
    try {
      const resp = await quickActionService.cancelSession(sessionId);
      const aiMsg: ChatMessage = {
        id: `ai-qa-${Date.now()}`,
        sender: 'assistant',
        content: resp.message || 'Sesi tindakan telah dibatalkan.',
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        followUpSuggestions: resp.followUpSuggestions,
      };
      setSessions((prev) =>
        prev.map((s) =>
          s.id === (activeSessionId || s.id)
            ? { ...s, updatedAt: Date.now(), messages: [...s.messages, aiMsg] }
            : s
        )
      );
    } catch (err: any) {
      console.warn('QuickAction cancel error:', err);
    }
  };

  const handleQuickActionConfirm = async (sessionId: string) => {
    if (!sessionId) return;
    setIsGenerating(true);
    try {
      const resp = await quickActionService.confirmSession(sessionId);
      const aiMsg: ChatMessage = {
        id: `ai-qa-${Date.now()}`,
        sender: 'assistant',
        content: resp.message || '✅ Tindakan berhasil dieksekusi.',
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        quickActionResponse: resp,
        followUpSuggestions: resp.followUpSuggestions,
      };
      setSessions((prev) =>
        prev.map((s) =>
          s.id === (activeSessionId || s.id)
            ? { ...s, updatedAt: Date.now(), messages: [...s.messages, aiMsg] }
            : s
        )
      );
      showToast('✓ Tindakan berhasil diterapkan.');
    } catch (err: any) {
      const errMsg: ChatMessage = {
        id: `ai-qa-err-${Date.now()}`,
        sender: 'assistant',
        content: 'Gagal mengonfirmasi tindakan: ' + (err.message || 'Error'),
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        isError: true,
      };
      setSessions((prev) =>
        prev.map((s) =>
          s.id === (activeSessionId || s.id)
            ? { ...s, updatedAt: Date.now(), messages: [...s.messages, errMsg] }
            : s
        )
      );
    } finally {
      setIsGenerating(false);
    }
  };

  // Action Proposal Confirmation
  const handleAcceptProposal = (msgId: string, proposal: AiActionProposal) => {
    if (proposal.items && proposal.items.length > 0 && onAddRabItemDirect) {
      proposal.items.forEach((item) => {
        onAddRabItemDirect({
          description: item.description,
          volume: item.volume,
          unit: item.unit,
          unitPrice: item.unitPrice,
          ahspCode: item.ahspCode,
          category: item.category || 'Pekerjaan Struktur',
        });
      });
    } else if (proposal.itemData && onAddRabItemDirect) {
      onAddRabItemDirect({
        description: proposal.itemData.description,
        volume: proposal.itemData.volume,
        unit: proposal.itemData.unit,
        unitPrice: proposal.itemData.unitPrice,
        ahspCode: proposal.itemData.ahspCode,
        category: proposal.itemData.category || 'Pekerjaan Struktur',
      });
    }

    // Update message status in state
    setSessions((prev) =>
      prev.map((s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.id === msgId && m.actionProposal
            ? {
                ...m,
                actionProposal: { ...m.actionProposal, status: 'ACCEPTED' },
              }
            : m
        ),
      }))
    );

    const count = proposal.items?.length || 1;
    showToast(`✓ ${count} item pekerjaan RAB berhasil diterapkan ke spreadsheet.`);
  };

  const handleRejectProposal = (msgId: string) => {
    setSessions((prev) =>
      prev.map((s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.id === msgId && m.actionProposal
            ? {
                ...m,
                actionProposal: { ...m.actionProposal, status: 'REJECTED' },
              }
            : m
        ),
      }))
    );
    showToast('Usulan perubahan dibatalkan.');
  };

  // Safe markdown & structured content renderer
  const renderFormattedAiContent = (content: string) => {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];

    let currentListItems: string[] = [];

    const flushList = (key: string) => {
      if (currentListItems.length > 0) {
        elements.push(
          <ul
            key={key}
            style={{
              margin: '6px 0 10px 0',
              paddingLeft: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            {currentListItems.map((item, idx) => (
              <li key={idx} style={{ fontSize: '13.5px', color: '#1E293B', lineHeight: '1.6' }}>
                {renderInlineFormatting(item)}
              </li>
            ))}
          </ul>
        );
        currentListItems = [];
      }
    };

    lines.forEach((line, lineIndex) => {
      const trimmed = line.trim();

      // Heading 3: ###
      if (trimmed.startsWith('###')) {
        flushList(`list-before-h3-${lineIndex}`);
        elements.push(
          <h3
            key={`h3-${lineIndex}`}
            style={{
              fontSize: '14.5px',
              fontWeight: 700,
              color: '#0F172A',
              margin: '14px 0 6px 0',
              letterSpacing: '-0.01em',
            }}
          >
            {renderInlineFormatting(trimmed.replace(/^###\s*/, ''))}
          </h3>
        );
        return;
      }

      // Heading 4: ####
      if (trimmed.startsWith('####')) {
        flushList(`list-before-h4-${lineIndex}`);
        elements.push(
          <h4
            key={`h4-${lineIndex}`}
            style={{
              fontSize: '13.5px',
              fontWeight: 700,
              color: '#1E293B',
              margin: '12px 0 4px 0',
            }}
          >
            {renderInlineFormatting(trimmed.replace(/^####\s*/, ''))}
          </h4>
        );
        return;
      }

      // Bullet list items (- or *)
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        currentListItems.push(trimmed.slice(2));
        return;
      }

      // Numbered list items (e.g. "1. ")
      const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
      if (numMatch) {
        flushList(`list-before-num-${lineIndex}`);
        elements.push(
          <div
            key={`num-${lineIndex}`}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '8px',
              margin: '4px 0',
              fontSize: '13.5px',
              color: '#1E293B',
              lineHeight: '1.6',
            }}
          >
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: '#2563EB',
                width: '18px',
                flexShrink: 0,
              }}
            >
              {numMatch[1]}.
            </span>
            <span style={{ flex: 1 }}>{renderInlineFormatting(numMatch[2])}</span>
          </div>
        );
        return;
      }

      // If regular paragraph or empty line
      flushList(`list-before-p-${lineIndex}`);
      if (!trimmed) {
        elements.push(<div key={`empty-${lineIndex}`} style={{ height: '6px' }} />);
      } else {
        elements.push(
          <p
            key={`p-${lineIndex}`}
            style={{
              margin: '4px 0',
              fontSize: '13.5px',
              color: '#1E293B',
              lineHeight: '1.65',
            }}
          >
            {renderInlineFormatting(trimmed)}
          </p>
        );
      }
    });

    flushList('list-final');
    return elements;
  };

  // Inline formatting helper for **bold** and `code`
  const renderInlineFormatting = (text: string): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let keyIdx = 0;

    while (remaining) {
      // Check for bold **text**
      const boldMatch = remaining.match(/\*\*(.*?)\*\*/);
      // Check for `code`
      const codeMatch = remaining.match(/`([^`]+)`/);

      let firstMatch: { type: 'bold' | 'code'; index: number; matchStr: string; inner: string } | null = null;

      if (boldMatch && boldMatch.index !== undefined) {
        firstMatch = { type: 'bold', index: boldMatch.index, matchStr: boldMatch[0], inner: boldMatch[1] };
      }

      if (codeMatch && codeMatch.index !== undefined) {
        if (!firstMatch || codeMatch.index < firstMatch.index) {
          firstMatch = { type: 'code', index: codeMatch.index, matchStr: codeMatch[0], inner: codeMatch[1] };
        }
      }

      if (!firstMatch) {
        parts.push(remaining);
        break;
      }

      if (firstMatch.index > 0) {
        parts.push(remaining.slice(0, firstMatch.index));
      }

      if (firstMatch.type === 'bold') {
        parts.push(
          <strong key={`bold-${keyIdx++}`} style={{ fontWeight: 650, color: '#0F172A' }}>
            {firstMatch.inner}
          </strong>
        );
      } else {
        parts.push(
          <code
            key={`code-${keyIdx++}`}
            style={{
              fontFamily: 'monospace',
              fontSize: '12px',
              backgroundColor: '#F1F5F9',
              color: '#1E293B',
              padding: '1px 5px',
              borderRadius: '4px',
              border: '1px solid #E2E8F0',
            }}
          >
            {firstMatch.inner}
          </code>
        );
      }

      remaining = remaining.slice(firstMatch.index + firstMatch.matchStr.length);
    }

    return parts;
  };

  return (
    <div
      style={{
        display: 'flex',
        height: 'calc(100vh - 64px)',
        backgroundColor: '#FFFFFF',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* =======================================================================
          1. RIWAYAT PERCAKAPAN (CONVERSATION HISTORY SIDEBAR)
          Width: 300px desktop, collapsible to 0px with smooth transition
         ======================================================================= */}
      <aside
        aria-label="Riwayat Percakapan"
        style={{
          width: sidebarCollapsed ? '0px' : '300px',
          minWidth: sidebarCollapsed ? '0px' : '300px',
          height: '100%',
          backgroundColor: '#FAFAFA',
          borderRight: '1px solid #EAEAEA',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 220ms cubic-bezier(0.2, 0, 0, 1), min-width 220ms cubic-bezier(0.2, 0, 0, 1)',
          overflow: 'hidden',
          position: 'relative',
          zIndex: 20,
        }}
      >
        <div style={{ width: '300px', height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Sidebar Header */}
          <div
            style={{
              padding: '18px 16px 12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              borderBottom: '1px solid #F0F0F0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#111827', letterSpacing: '-0.01em' }}>
                  Riwayat Percakapan
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#6B7280',
                    backgroundColor: '#E5E7EB',
                    padding: '1px 6px',
                    borderRadius: '999px',
                  }}
                >
                  {sessions.length}
                </span>
              </div>

              {/* Collapse Sidebar Button */}
              <button
                type="button"
                onClick={toggleSidebar}
                title="Tutup riwayat percakapan"
                aria-label="Tutup riwayat percakapan"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#6B7280',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#E5E7EB')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <PanelLeftClose size={17} />
              </button>
            </div>

            {/* Search Input */}
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                width: '100%',
              }}
            >
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: '10px',
                  color: '#9CA3AF',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                value={historySearchQuery}
                onChange={(e) => setHistorySearchQuery(e.target.value)}
                placeholder="Cari riwayat..."
                style={{
                  width: '100%',
                  height: '34px',
                  padding: '0 10px 0 32px',
                  fontSize: '12.5px',
                  color: '#111827',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  outline: 'none',
                  transition: 'border-color 150ms ease, box-shadow 150ms ease',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#2563EB';
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(37,99,235,0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#E5E7EB';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              {historySearchQuery && (
                <button
                  type="button"
                  onClick={() => setHistorySearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    background: 'none',
                    border: 'none',
                    color: '#9CA3AF',
                    cursor: 'pointer',
                    padding: '2px',
                  }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Grouped History List */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            {filteredSessions.length === 0 ? (
              <div
                style={{
                  padding: '36px 16px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#4B5563' }}>
                  {historySearchQuery ? 'Riwayat tidak ditemukan.' : 'Belum ada percakapan.'}
                </div>
                <div style={{ fontSize: '11.5px', color: '#9CA3AF', lineHeight: '1.4' }}>
                  {historySearchQuery
                    ? 'Coba gunakan kata kunci pencarian lain.'
                    : 'Mulai percakapan baru dengan EZRAB Co Assistant AI.'}
                </div>
              </div>
            ) : (
              (['Hari ini', 'Kemarin', '7 hari yang lalu', '30 hari terakhir'] as const).map(
                (groupLabel) => {
                  const groupItems = groupedSessions[groupLabel];
                  if (!groupItems || groupItems.length === 0) return null;

                  return (
                    <div key={groupLabel} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <div
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#9CA3AF',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          padding: '0 8px 4px 8px',
                        }}
                      >
                        {groupLabel}
                      </div>

                      {groupItems.map((session) => {
                        const isActive = activeSessionId === session.id;
                        const isMenuOpen = activeMenuSessionId === session.id;
                        const isEditing = editingSessionId === session.id;

                        return (
                          <div
                            key={session.id}
                            style={{
                              position: 'relative',
                              borderRadius: '8px',
                            }}
                          >
                            {isEditing ? (
                              <div
                                style={{
                                  padding: '6px 8px',
                                  backgroundColor: '#FFFFFF',
                                  border: '1px solid #2563EB',
                                  borderRadius: '8px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}
                              >
                                <input
                                  type="text"
                                  value={editTitleText}
                                  onChange={(e) => setEditTitleText(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveRename(session.id);
                                    if (e.key === 'Escape') setEditingSessionId(null);
                                  }}
                                  autoFocus
                                  style={{
                                    flex: 1,
                                    fontSize: '12px',
                                    border: 'none',
                                    outline: 'none',
                                    color: '#0F172A',
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveRename(session.id)}
                                  style={{
                                    background: '#2563EB',
                                    border: 'none',
                                    color: '#FFFFFF',
                                    borderRadius: '4px',
                                    padding: '2px 6px',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                  }}
                                >
                                  Simpan
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setActiveSessionId(session.id)}
                                style={{
                                  width: '100%',
                                  padding: '8px 10px',
                                  borderRadius: '8px',
                                  border: 'none',
                                  backgroundColor: isActive ? '#EFF6FF' : 'transparent',
                                  cursor: 'pointer',
                                  textAlign: 'left',
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  justifyContent: 'space-between',
                                  gap: '8px',
                                  transition: 'background-color 140ms ease',
                                  position: 'relative',
                                }}
                                onMouseEnter={(e) => {
                                  if (!isActive) e.currentTarget.style.backgroundColor = '#F3F4F6';
                                  const menuBtn = e.currentTarget.querySelector('.history-overflow-btn') as HTMLElement;
                                  if (menuBtn) menuBtn.style.opacity = '1';
                                }}
                                onMouseLeave={(e) => {
                                  if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                                  const menuBtn = e.currentTarget.querySelector('.history-overflow-btn') as HTMLElement;
                                  if (menuBtn && !isMenuOpen) menuBtn.style.opacity = '0';
                                }}
                              >
                                {isActive && (
                                  <div
                                    style={{
                                      position: 'absolute',
                                      left: '0',
                                      top: '6px',
                                      bottom: '6px',
                                      width: '3px',
                                      borderRadius: '0 4px 4px 0',
                                      backgroundColor: '#2563EB',
                                    }}
                                  />
                                )}

                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div
                                    style={{
                                      fontSize: '12.5px',
                                      fontWeight: isActive ? 650 : 500,
                                      color: isActive ? '#1D4ED8' : '#1F2937',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                    }}
                                  >
                                    {session.title}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: '11px',
                                      color: '#9CA3AF',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      marginTop: '2px',
                                    }}
                                  >
                                    {session.preview || 'Percakapan baru...'}
                                  </div>
                                </div>

                                {/* Overflow Action Menu Button ••• */}
                                <button
                                  type="button"
                                  className="history-overflow-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuSessionId(isMenuOpen ? null : session.id);
                                  }}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#6B7280',
                                    padding: '2px 4px',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    opacity: isMenuOpen ? 1 : 0,
                                    transition: 'opacity 140ms ease',
                                    flexShrink: 0,
                                  }}
                                  title="Aksi percakapan"
                                >
                                  <MoreHorizontal size={15} />
                                </button>
                              </button>
                            )}

                            {/* Dropdown Menu for Overflow Actions */}
                            {isMenuOpen && (
                              <div
                                style={{
                                  position: 'absolute',
                                  top: '32px',
                                  right: '6px',
                                  backgroundColor: '#FFFFFF',
                                  border: '1px solid #E5E7EB',
                                  borderRadius: '8px',
                                  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
                                  zIndex: 35,
                                  minWidth: '130px',
                                  padding: '4px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '2px',
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={(e) => handleStartRename(session, e)}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '6px 10px',
                                    fontSize: '11.5px',
                                    color: '#374151',
                                    border: 'none',
                                    background: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    width: '100%',
                                  }}
                                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F3F4F6')}
                                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                                >
                                  <Edit2 size={13} />
                                  <span>Ubah nama</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleDuplicateSession(session, e)}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '6px 10px',
                                    fontSize: '11.5px',
                                    color: '#374151',
                                    border: 'none',
                                    background: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    width: '100%',
                                  }}
                                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F3F4F6')}
                                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                                >
                                  <Copy size={13} />
                                  <span>Duplikat</span>
                                </button>
                                <div style={{ height: '1px', backgroundColor: '#F3F4F6', margin: '2px 0' }} />
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteSession(session.id, e)}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '6px 10px',
                                    fontSize: '11.5px',
                                    color: '#EF4444',
                                    border: 'none',
                                    background: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    width: '100%',
                                  }}
                                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#FEF2F2')}
                                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                                >
                                  <Trash2 size={13} />
                                  <span>Hapus</span>
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                }
              )
            )}
          </div>

          {/* Bottom Action: + Percakapan Baru */}
          <div
            style={{
              padding: '14px 16px',
              borderTop: '1px solid #F0F0F0',
              backgroundColor: '#FAFAFA',
            }}
          >
            <button
              type="button"
              onClick={handleNewConversation}
              style={{
                width: '100%',
                height: '38px',
                borderRadius: '8px',
                backgroundColor: '#FFFFFF',
                color: '#1F2937',
                border: '1px solid #D1D5DB',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                transition: 'all 150ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#2563EB';
                e.currentTarget.style.color = '#2563EB';
                e.currentTarget.style.backgroundColor = '#F8FAFC';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#D1D5DB';
                e.currentTarget.style.color = '#1F2937';
                e.currentTarget.style.backgroundColor = '#FFFFFF';
              }}
            >
              <Plus size={16} color="#2563EB" />
              <span>+ Percakapan Baru</span>
            </button>
          </div>
        </div>
      </aside>

      {/* =======================================================================
          2. MAIN AI WORKSPACE
          Contains:
          - Top Header with Sidebar toggle and Project Context Control
          - Center: Empty Welcome State OR Active Conversation Messages
          - Bottom: Persistent Composer + Disclaimer
         ======================================================================= */}
      <main
        style={{
          flex: 1,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#FFFFFF',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Workspace Top Header */}
        <header
          style={{
            height: '56px',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #F1F5F9',
            backgroundColor: '#FFFFFF',
            flexShrink: 0,
            zIndex: 10,
          }}
        >
          {/* Left: Restore sidebar button if collapsed, and subtle page title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {sidebarCollapsed && (
              <button
                type="button"
                onClick={toggleSidebar}
                title="Buka riwayat percakapan"
                aria-label="Buka riwayat percakapan"
                style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  color: '#475569',
                  cursor: 'pointer',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  transition: 'all 150ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#EFF6FF';
                  e.currentTarget.style.borderColor = '#BFDBFE';
                  e.currentTarget.style.color = '#2563EB';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#F8FAFC';
                  e.currentTarget.style.borderColor = '#E2E8F0';
                  e.currentTarget.style.color = '#475569';
                }}
              >
                <PanelLeftOpen size={16} />
                <span>Riwayat</span>
              </button>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 650, color: '#0F172A' }}>
                EZRAB Co Assistant AI
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#2563EB',
                  backgroundColor: '#EFF6FF',
                  padding: '2px 7px',
                  borderRadius: '4px',
                  border: '1px solid #DBEAFE',
                }}
              >
                WORKSPACE
              </span>
            </div>
          </div>

          {/* Right: Project Context Control (§19: Konteks Proyek Aktif) */}
          <div ref={projectDropdownRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setIsProjectDropdownOpen((prev) => !prev)}
              aria-expanded={isProjectDropdownOpen}
              aria-label="Pilih konteks proyek aktif"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '6px 12px',
                borderRadius: '10px',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                cursor: 'pointer',
                transition: 'all 150ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#F1F5F9';
                e.currentTarget.style.borderColor = '#CBD5E1';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#F8FAFC';
                e.currentTarget.style.borderColor = '#E2E8F0';
              }}
            >
              <div style={{ textAlign: 'right' }}>
                <div
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: '#64748B',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    lineHeight: '1.2',
                  }}
                >
                  Konteks Proyek Aktif
                </div>
                <div
                  style={{
                    fontSize: '12.5px',
                    fontWeight: 700,
                    color: '#0F172A',
                    lineHeight: '1.3',
                    maxWidth: '180px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {activeProjectName}
                </div>
              </div>
              <ChevronDown size={15} color="#64748B" />
            </button>

            {/* Dropdown Project Selector */}
            {isProjectDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  right: '0',
                  top: '46px',
                  width: '260px',
                  backgroundColor: '#FFFFFF',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 12px 30px rgba(0,0,0,0.1)',
                  zIndex: 40,
                  padding: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}
              >
                <div
                  style={{
                    padding: '8px 10px 4px 10px',
                    fontSize: '10.5px',
                    fontWeight: 750,
                    color: '#94A3B8',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Pilih Proyek Terkait
                </div>

                {projects.map((proj) => {
                  const isCurrent = proj.id === currentProject?.id;
                  return (
                    <button
                      key={proj.id}
                      type="button"
                      onClick={() => {
                        if (onSelectProject) onSelectProject(proj.id);
                        setIsProjectDropdownOpen(false);
                      }}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: isCurrent ? '#EFF6FF' : 'transparent',
                        color: isCurrent ? '#1D4ED8' : '#334155',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                      onMouseEnter={(e) => {
                        if (!isCurrent) e.currentTarget.style.backgroundColor = '#F8FAFC';
                      }}
                      onMouseLeave={(e) => {
                        if (!isCurrent) e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: isCurrent ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {proj.name}
                        </div>
                        <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>
                          {proj.location || 'Indonesia'}
                        </div>
                      </div>
                      {isCurrent && <Check size={14} color="#2563EB" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </header>

        {/* Action Success Toast */}
        {toastMessage && (
          <div
            style={{
              position: 'absolute',
              top: '68px',
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: '#0F172A',
              color: '#FFFFFF',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 600,
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
              zIndex: 50,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              animation: 'fadeIn 180ms ease forwards',
            }}
          >
            <CheckCircle2 size={15} color="#22C55E" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Scrollable Conversation Content Area */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px 20px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {activeMessages.length === 0 ? (
            /* =================================================================
               A. EMPTY / WELCOME STATE (§23 - §30)
               Clean, centered, minimal, spacious.
               AI orb logo (~88px) + Greeting + 4 Suggestion Cards
               ================================================================= */
            <div
              style={{
                maxWidth: '780px',
                width: '100%',
                margin: 'auto',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                padding: '40px 16px',
              }}
            >
              {/* Official AI Orb Logo Asset with subtle idle breathing animation */}
              <div
                style={{
                  width: '88px',
                  height: '88px',
                  borderRadius: '50%',
                  padding: '3px',
                  backgroundColor: '#FFFFFF',
                  boxShadow: '0 8px 30px rgba(37,99,235,0.18), 0 0 1px rgba(0,0,0,0.1)',
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  animation: 'ezrabAiOrbBreathe 5s ease-in-out infinite',
                }}
              >
                <img
                  src={mascotNewImg}
                  alt="EZRAB AI"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    display: 'block',
                  }}
                />
              </div>

              {/* Greeting (§4, §25) */}
              <h1
                style={{
                  fontSize: '28px',
                  fontWeight: 750,
                  color: '#0F172A',
                  letterSpacing: '-0.025em',
                  margin: '0 0 8px 0',
                }}
              >
                Halo, saya EZRAB Co Assistant AI 👋
              </h1>

              {/* Concise Supporting Text (§26) */}
              <p
                style={{
                  fontSize: '14.5px',
                  color: '#64748B',
                  maxWidth: '520px',
                  lineHeight: '1.5',
                  margin: '0 0 36px 0',
                }}
              >
                Asisten AI untuk estimasi konstruksi.
                <br />
                Tanyakan apa saja tentang proyek Anda.
              </p>

              {/* 4 Primary Suggestion Cards (§27 - §30) */}
              <div
                style={{
                  width: '100%',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                  gap: '12px',
                }}
              >
                {[
                  {
                    icon: Calculator,
                    title: 'Buat RAB',
                    description: 'dari deskripsi proyek',
                    template:
                      'Buatkan draft rincian RAB lengkap dari deskripsi proyek: [Tuliskan spesifikasi bangunan, luas m2, dan tipe pekerjaan di sini]',
                  },
                  {
                    icon: FileText,
                    title: 'Analisis gambar',
                    description: 'PDF / JPG / DED',
                    template:
                      'Tolong analisis gambar kerja / gambar teknik DED berikut untuk kebutuhan perhitungan volume pekerjaan dan RAB:',
                    triggerAttachment: true,
                  },
                  {
                    icon: Coins,
                    title: 'Cek harga',
                    description: 'dan kewajaran biaya',
                    template:
                      'Cek kewajaran harga satuan material dan upah pekerja terhadap standar AHSP PUPR terbaru untuk proyek ' +
                      activeProjectName,
                  },
                  {
                    icon: TrendingDown,
                    title: 'Optimasi biaya',
                    description: 'dan alternatif material',
                    template:
                      'Analisis pekerjaan dengan biaya terbesar pada RAB dan berikan rekomendasi alternatif material untuk optimasi anggaran.',
                  },
                ].map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        handleSuggestionClick(item.template);
                        if (item.triggerAttachment && fileInputRef.current) {
                          fileInputRef.current.click();
                        }
                      }}
                      style={{
                        padding: '14px 16px',
                        borderRadius: '12px',
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                        transition: 'transform 140ms ease, border-color 140ms ease, box-shadow 140ms ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.borderColor = '#2563EB';
                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(37,99,235,0.08)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.borderColor = '#E2E8F0';
                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.02)';
                      }}
                    >
                      <div
                        style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '10px',
                          backgroundColor: '#F1F5F9',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#2563EB',
                          flexShrink: 0,
                        }}
                      >
                        <Icon size={18} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A', marginBottom: '2px' }}>
                          {item.title}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748B' }}>
                          {item.description}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Quick Actions Shortcuts Toolbar */}
              <div style={{ marginTop: '24px', width: '100%' }}>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#94A3B8',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '10px',
                    textAlign: 'left',
                  }}
                >
                  ⚡ Tindakan Cepat (Quick Actions)
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    justifyContent: 'flex-start',
                  }}
                >
                  {QUICK_ACTIONS_LIST.map((action) => (
                    <button
                      key={action.actionId}
                      type="button"
                      onClick={() => handleQuickActionClick(action.actionId, action.label, action.initialPrompt)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '20px',
                        backgroundColor: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        color: '#334155',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 120ms ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#EFF6FF';
                        e.currentTarget.style.borderColor = '#93C5FD';
                        e.currentTarget.style.color = '#1D4ED8';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#F8FAFC';
                        e.currentTarget.style.borderColor = '#E2E8F0';
                        e.currentTarget.style.color = '#334155';
                      }}
                    >
                      <span>{action.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* =================================================================
               B. ACTIVE CONVERSATION STATE (§31 - §42)
               Centered column (max-width 820px), readable typography
               ================================================================= */
            <div
              style={{
                maxWidth: '820px',
                width: '100%',
                margin: '0 auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '24px',
                paddingBottom: '20px',
              }}
            >
              {activeMessages.map((msg) => {
                const isUser = msg.sender === 'user';

                return (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: isUser ? 'flex-end' : 'flex-start',
                      animation: 'ezrabMsgEntrance 160ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
                    }}
                  >
                    {isUser ? (
                      /* USER MESSAGE: Right aligned, subtle blue surface */
                      <div
                        style={{
                          maxWidth: '82%',
                          borderRadius: '16px 16px 4px 16px',
                          padding: '12px 18px',
                          backgroundColor: '#2563EB',
                          color: '#FFFFFF',
                          fontSize: '13.5px',
                          lineHeight: '1.55',
                          boxShadow: '0 2px 8px rgba(37,99,235,0.18)',
                          wordBreak: 'break-word',
                        }}
                      >
                        {/* Attachments chips inside user bubble if present */}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: '6px',
                              marginBottom: '8px',
                            }}
                          >
                            {msg.attachments.map((file) => (
                              <div
                                key={file.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  backgroundColor: 'rgba(255,255,255,0.2)',
                                  borderRadius: '6px',
                                  padding: '3px 8px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                }}
                              >
                                <Paperclip size={12} />
                                <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {file.name}
                                </span>
                                <span style={{ opacity: 0.8 }}>({formatFileSize(file.size)})</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div>{msg.content}</div>
                      </div>
                    ) : (
                      /* AI MESSAGE: Left-aligned, small AI orb avatar, clean structured typography */
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '12px',
                          width: '100%',
                        }}
                      >
                        {/* Small AI Orb Avatar */}
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            overflow: 'hidden',
                            flexShrink: 0,
                            marginTop: '2px',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                          }}
                        >
                          <img
                            src={mascotNewImg}
                            alt="EZRAB AI"
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                          />
                        </div>

                        {/* Structured AI Content */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* Clean EZRAB AI Label */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A' }}>EZRAB AI</span>
                          </div>

                          {/* Stat Callout Card if present (§36) */}
                          {msg.stats && (
                            <div
                              style={{
                                backgroundColor: '#F8FAFC',
                                border: '1px solid #E2E8F0',
                                borderRadius: '10px',
                                padding: '12px 16px',
                                marginBottom: '14px',
                                maxWidth: '340px',
                              }}
                            >
                              <div style={{ fontSize: '11px', fontWeight: 650, color: '#64748B' }}>
                                {msg.stats.label}
                              </div>
                              <div
                                style={{
                                  fontSize: '20px',
                                  fontWeight: 800,
                                  color: msg.stats.color || '#2563EB',
                                  margin: '2px 0',
                                  letterSpacing: '-0.02em',
                                }}
                              >
                                {msg.stats.value}
                              </div>
                              {msg.stats.sub && (
                                <div style={{ fontSize: '11px', color: '#64748B' }}>{msg.stats.sub}</div>
                              )}
                            </div>
                          )}

                          {/* Formatted Text Content */}
                          <div style={{ color: '#0F172A' }}>
                            {renderFormattedAiContent(msg.content)}
                          </div>

                          {/* Formatted Table if present (§36) */}
                          {msg.table && (
                            <div
                              style={{
                                marginTop: '14px',
                                overflowX: 'auto',
                                borderRadius: '10px',
                                border: '1px solid #E2E8F0',
                              }}
                            >
                              <table
                                style={{
                                  width: '100%',
                                  borderCollapse: 'collapse',
                                  fontSize: '12px',
                                  textAlign: 'left',
                                  backgroundColor: '#FFFFFF',
                                }}
                              >
                                <thead>
                                  <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                                    {msg.table.headers.map((h, hIdx) => (
                                      <th
                                        key={hIdx}
                                        style={{
                                          padding: '8px 12px',
                                          color: '#475569',
                                          fontWeight: 700,
                                          fontSize: '11.5px',
                                        }}
                                      >
                                        {h}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {msg.table.rows.map((row, rIdx) => (
                                    <tr
                                      key={rIdx}
                                      style={{
                                        borderBottom: rIdx < msg.table!.rows.length - 1 ? '1px solid #F1F5F9' : 'none',
                                      }}
                                    >
                                      {row.map((cell, cIdx) => (
                                        <td
                                          key={cIdx}
                                          style={{
                                            padding: '8px 12px',
                                            color: '#1E293B',
                                            fontWeight: cIdx === 0 ? 600 : 400,
                                          }}
                                        >
                                          {cell}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* Action Proposal / Usulan Perubahan Card (§78) */}
                          {msg.actionProposal && (
                            <div
                              style={{
                                marginTop: '14px',
                                padding: '14px 16px',
                                borderRadius: '12px',
                                backgroundColor:
                                  msg.actionProposal.status === 'ACCEPTED'
                                    ? '#F0FDF4'
                                    : '#F8FAFC',
                                border: `1px solid ${
                                  msg.actionProposal.status === 'ACCEPTED'
                                    ? '#BBF7D0'
                                    : '#E2E8F0'
                                }`,
                              }}
                            >
                              <div
                                style={{
                                  fontSize: '12.5px',
                                  fontWeight: 750,
                                  color: '#0F172A',
                                  marginBottom: '4px',
                                }}
                              >
                                {msg.actionProposal.title}
                              </div>
                              <div
                                style={{
                                  fontSize: '12px',
                                  color: '#475569',
                                  lineHeight: '1.5',
                                  marginBottom: '12px',
                                }}
                              >
                                {msg.actionProposal.description}
                              </div>

                              {msg.actionProposal.status === 'PENDING' ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <button
                                    type="button"
                                    onClick={() => handleAcceptProposal(msg.id, msg.actionProposal!)}
                                    style={{
                                      padding: '6px 14px',
                                      borderRadius: '6px',
                                      backgroundColor: '#2563EB',
                                      color: '#FFFFFF',
                                      fontSize: '12px',
                                      fontWeight: 700,
                                      border: 'none',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                    }}
                                  >
                                    <Check size={14} />
                                    <span>Terapkan</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRejectProposal(msg.id)}
                                    style={{
                                      padding: '6px 12px',
                                      borderRadius: '6px',
                                      backgroundColor: '#FFFFFF',
                                      color: '#64748B',
                                      fontSize: '12px',
                                      fontWeight: 600,
                                      border: '1px solid #CBD5E1',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Batalkan
                                  </button>
                                </div>
                              ) : msg.actionProposal.status === 'ACCEPTED' ? (
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    color: '#16A34A',
                                  }}
                                >
                                  <CheckCircle2 size={15} />
                                  <span>Telah diterapkan ke spreadsheet RAB proyek</span>
                                </div>
                              ) : (
                                <div style={{ fontSize: '12px', color: '#94A3B8' }}>
                                  Usulan perubahan dibatalkan.
                                </div>
                              )}
                            </div>
                          )}

                          {/* Interactive Wizard Renderer (§Prompt Target) */}
                          {msg.wizardResponse && (
                            <div style={{ marginTop: '14px', width: '100%' }}>
                              <AssistantWizardRenderer
                                data={msg.wizardResponse}
                                onAnswer={handleWizardAnswer}
                                onGoBack={handleWizardGoBack}
                                onCancel={handleWizardCancel}
                                onConfirm={handleWizardConfirm}
                                onNavigateToSpreadsheet={() => {
                                  if (onNavigateToTab) onNavigateToTab('rab-estimasi');
                                }}
                                isLoading={isGenerating}
                              />
                            </div>
                          )}

                          {/* Quick Action Interactive Dialogue Renderer */}
                          {msg.quickActionResponse && (
                            <div style={{ marginTop: '14px', width: '100%' }}>
                              <QuickActionDialogueRenderer
                                data={msg.quickActionResponse}
                                onAnswer={handleQuickActionAnswer}
                                onGoBack={handleQuickActionGoBack}
                                onCancel={handleQuickActionCancel}
                                onConfirm={handleQuickActionConfirm}
                                isLoading={isGenerating}
                              />
                            </div>
                          )}

                          {/* Follow-up Suggestion Chips */}
                          {msg.followUpSuggestions && msg.followUpSuggestions.length > 0 && (
                            <div style={{ marginTop: '12px' }}>
                              <QuickActionFollowUpSuggestions
                                suggestions={msg.followUpSuggestions}
                                onSelectSuggestion={(sug) => handleSendMessage(sug)}
                              />
                            </div>
                          )}

                          {/* Retry button on error (§42) */}
                          {msg.isError && (
                            <button
                              type="button"
                              onClick={() => {
                                const lastUser = [...activeMessages].reverse().find((m) => m.sender === 'user');
                                if (lastUser) handleSendMessage(lastUser.content);
                              }}
                              style={{
                                marginTop: '10px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '5px 12px',
                                borderRadius: '6px',
                                backgroundColor: '#EFF6FF',
                                color: '#2563EB',
                                border: '1px solid #BFDBFE',
                                fontSize: '11.5px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              <RotateCcw size={13} />
                              <span>Coba lagi</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Thinking / Streaming progressive display (§39, §40, §41) */}
              {isGenerating && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    width: '100%',
                    animation: 'ezrabMsgEntrance 160ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
                  }}
                >
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      overflow: 'hidden',
                      flexShrink: 0,
                      marginTop: '2px',
                    }}
                  >
                    <img src={mascotNewImg} alt="EZRAB AI" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {streamingContent ? (
                      <div style={{ color: '#0F172A' }}>
                        {renderFormattedAiContent(streamingContent)}
                        <span
                          style={{
                            display: 'inline-block',
                            width: '4px',
                            height: '14px',
                            backgroundColor: '#2563EB',
                            marginLeft: '4px',
                            verticalAlign: 'middle',
                            animation: 'pulse 1s infinite',
                          }}
                        />
                      </div>
                    ) : (
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px 14px',
                          borderRadius: '10px',
                          backgroundColor: '#F8FAFC',
                          border: '1px solid #E2E8F0',
                        }}
                      >
                        <div
                          style={{
                            width: '14px',
                            height: '14px',
                            borderRadius: '50%',
                            border: '2px solid #2563EB',
                            borderTopColor: 'transparent',
                            animation: 'spin 0.8s linear infinite',
                          }}
                        />
                        <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>
                          {thinkingStep}
                        </span>
                      </div>
                    )}

                    {/* Stop Generation Button (§41) */}
                    <div style={{ marginTop: '8px' }}>
                      <button
                        type="button"
                        onClick={handleStopGeneration}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          backgroundColor: '#FFFFFF',
                          border: '1px solid #E2E8F0',
                          fontSize: '11px',
                          fontWeight: 650,
                          color: '#64748B',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
                      >
                        <Square size={10} fill="#64748B" />
                        <span>Berhenti</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* =====================================================================
            3. BOTTOM COMPOSER (§43 - §51)
            Large, restrained horizontal input, pinned at bottom
           ===================================================================== */}
        <div
          style={{
            padding: '14px 24px 16px 24px',
            backgroundColor: '#FFFFFF',
            borderTop: '1px solid #F1F5F9',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <div style={{ maxWidth: '820px', width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* File Attachment Preview Chips (§50) */}
            {attachedFiles.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '0 4px' }}>
                {attachedFiles.map((file) => (
                  <div
                    key={file.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '4px 10px',
                      borderRadius: '8px',
                      backgroundColor: '#EFF6FF',
                      border: '1px solid #DBEAFE',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      color: '#1E40AF',
                    }}
                  >
                    <Paperclip size={13} />
                    <span style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {file.name}
                    </span>
                    <span style={{ color: '#6B7280', fontSize: '10.5px' }}>
                      {formatFileSize(file.size)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(file.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#6B7280',
                        cursor: 'pointer',
                        padding: '1px',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      title="Hapus file"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Hidden native file input for PDF / JPG / PNG / Excel */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv"
              multiple
              style={{ display: 'none' }}
            />

            {/* Composer Input Box */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: '10px',
                padding: '10px 14px',
                backgroundColor: '#FFFFFF',
                border: '1.5px solid #E2E8F0',
                borderRadius: '14px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                transition: 'border-color 150ms ease, box-shadow 150ms ease',
              }}
              onFocus={() => {
                const box = textareaRef.current?.parentElement;
                if (box) {
                  box.style.borderColor = '#2563EB';
                  box.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)';
                }
              }}
              onBlur={() => {
                const box = textareaRef.current?.parentElement;
                if (box) {
                  box.style.borderColor = '#E2E8F0';
                  box.style.boxShadow = '0 2px 8px rgba(0,0,0,0.03)';
                }
              }}
            >
              {/* Attachment Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Lampirkan file (PDF, Gambar DED, Excel)"
                aria-label="Lampirkan file"
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  color: '#64748B',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'all 140ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#EFF6FF';
                  e.currentTarget.style.color = '#2563EB';
                  e.currentTarget.style.borderColor = '#BFDBFE';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#F8FAFC';
                  e.currentTarget.style.color = '#64748B';
                  e.currentTarget.style.borderColor = '#E2E8F0';
                }}
              >
                <Paperclip size={17} />
              </button>

              {/* Auto-growing Textarea Input */}
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Tanyakan tentang proyek ini..."
                rows={1}
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  fontSize: '13.5px',
                  color: '#0F172A',
                  lineHeight: '1.5',
                  padding: '8px 0',
                  fontFamily: 'inherit',
                  maxHeight: '130px',
                  backgroundColor: 'transparent',
                }}
              />

              {/* Send Button */}
              <button
                type="button"
                onClick={() => handleSendMessage()}
                disabled={(!inputText.trim() && attachedFiles.length === 0) || isGenerating}
                aria-label="Kirim pesan"
                title="Kirim pesan (Enter)"
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  backgroundColor:
                    (inputText.trim() || attachedFiles.length > 0) && !isGenerating
                      ? '#2563EB'
                      : '#F1F5F9',
                  color:
                    (inputText.trim() || attachedFiles.length > 0) && !isGenerating
                      ? '#FFFFFF'
                      : '#94A3B8',
                  border: 'none',
                  cursor:
                    (inputText.trim() || attachedFiles.length > 0) && !isGenerating
                      ? 'pointer'
                      : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'all 140ms ease',
                }}
                onMouseEnter={(e) => {
                  if ((inputText.trim() || attachedFiles.length > 0) && !isGenerating) {
                    e.currentTarget.style.backgroundColor = '#1D4ED8';
                  }
                }}
                onMouseLeave={(e) => {
                  if ((inputText.trim() || attachedFiles.length > 0) && !isGenerating) {
                    e.currentTarget.style.backgroundColor = '#2563EB';
                  }
                }}
              >
                <Send size={16} />
              </button>
            </div>

            {/* Disclaimer Typography (§51) */}
            <div
              style={{
                fontSize: '11px',
                color: '#94A3B8',
                textAlign: 'center',
                letterSpacing: '-0.01em',
              }}
            >
              AI dapat membuat kesalahan. Harap verifikasi hasilnya.
            </div>
          </div>
        </div>
      </main>

      {/* Global CSS animations for this view */}
      <style>{`
        @keyframes ezrabAiOrbBreathe {
          0% {
            transform: scale(1);
            filter: drop-shadow(0 6px 18px rgba(37, 99, 235, 0.15));
          }
          50% {
            transform: scale(1.018);
            filter: drop-shadow(0 10px 28px rgba(37, 99, 235, 0.28));
          }
          100% {
            transform: scale(1);
            filter: drop-shadow(0 6px 18px rgba(37, 99, 235, 0.15));
          }
        }

        @keyframes ezrabMsgEntrance {
          0% {
            opacity: 0;
            transform: translateY(4px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default EzrabAiAssistantFullView;

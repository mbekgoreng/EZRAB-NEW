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
  History, Trash2, MoreVertical, Gamepad2, Brain, Pencil, Save, ListChecks,
  ClipboardList,
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
/* Batch E — persistensi UI chat (D-46 draft, D-47 mode, D-49 versi),
 * diagnostik persist (NEW-02), dan strip token Quick Action (D-50). */
import {
  EZRAB_CHAT_AI_VERSION,
  clearChatDraft,
  loadChatAiMode,
  loadChatDraft,
  saveChatAiMode,
  saveChatDraft,
} from './chatUiPersistence';
import { reportPersistFailure, reportPersistSaveFailure } from './persistDiagnostics';
import { stripQuickActionToken } from '../../services/ai/quickActionToken';

import { renderMarkdown, markdownToPlainText } from './markdown';
import { routeIntent, localGreeting, HELP_TEXT } from './intentRouter';
import { extractSlashToken, filterSlashEntries, NAV_BY_ID, resolveNavCommand, type NavEntry } from './navRegistry';
import { consumePendingAiEntry, requestAiEntry, consumePendingEzrabAiEntry, peekPendingEzrabAiEntry, ezrabAiEntryRemainingMs, openEzrabAI, type EzrabAiEntryContext } from '../aiNavigation';
import { executeIntent, continueRabNeeds, continueRabFinalize, hasActiveRabNeeds, continueRabChoice, tryContinueRabSubtype, tryContinueRabMaterial, tryContinueProjectContext, tryContinueUniversalContext, getLastRabDesignPrompt, submitQuestionnaireAnswers, restoreUniversalContext, getUniversalContextState, ChatActionContext, ChatActionButton } from './actionRegistry';
import { QuestionnaireCard } from './questionnaireCard';
import type { QuestionnairePayload } from './questionnaire';
import type { QuestionnaireAnswerRecord } from './universalIntake';
import { getLastDirectRab } from './directRab';
import { classifyRequest, minDelayFor, statusTextFor, waitForMinimum, waitForRabMinimum, rabMinDelayMs, activityForRequest, isAbortError, type AiActivity } from '../aiResponseTiming';
import {
  beginExecution, finishExecution, cancelExecution, getExecution, getActiveExecution,
  subscribeExecution, releaseConversation, emitExecutionStage, reportedExecutionStage,
  EXECUTION_STAGE_LABELS,
  type AiExecutionHandle, type AiExecutionRecord, type ExecutionStage,
} from './executionRuntime';
import { mapDirectRabPushItems } from './directRabPush';
import { detectHandoffNeed, HANDOFF_CHOICE_CHAT, HANDOFF_CHOICE_STAY } from './magicHandoff';
import { structuredAiError, logAiDiagnostic, type AiErrorCode } from './aiErrorCodes';
import { buildFinalizationKey } from '../ded-ai-estimate/finalizationKey';
import { getLastUniversalDraft, setLastUniversalDraft, looksLikeUniversalRevision, buildPushPreview, formatPushPreviewMessage, buildPushPayload, dedupePushPayload, validateTransfer, draftReadiness, effectiveItems } from './universalRab';
import { saveDraft, loadDraft, markTransferred, saveIntakeContext, loadIntakeContext, peekPersistedDraft, shouldRestoreIntakeSnapshot, createTransferApprovalBinding, checkTransferApprovalBinding, type TransferApprovalBinding } from './draftPersistence';
/* GATE 3 (5C) — revisi immutable: pratinjau di atas klon + aktivasi
 * atomik+idempotent sesudah konfirmasi eksplisit. Mesin revisi
 * (reviseUniversalDraft) TIDAK lagi dipanggil langsung dari view —
 * ia berjalan di dalam buildRevisionPreview pada klon draft. */
import {
  activateRevision,
  buildRevisionPreview,
  compareStoredVersions,
  formatRevisionPreviewMessage,
  formatVersionHistoryMessage,
  isAffirmativeConfirmation,
  isNegativeConfirmation,
  type RevisionPreview,
} from './draftRevision';
import { formatRupiah } from './budgetFeasibility';
/* FASE 7 — gerbang kualitas respons: verifikasi jawaban LLM sebelum
 * ditampilkan (modul murni, tanpa fetch/provider). */
import { checkResponseQuality, buildQualityGateEvidence, formatQualityGateNotice } from './responseQualityGate';
/* GATE 4 (5D) — integrasi DED/QTO: konsumsi lampiran DED, umpan
 * balik berlabel, koreksi QTO + revisi spek DED via pratinjau dan
 * konfirmasi eksplisit (pola Gate 3), dan seksi DED/QTO ke builder
 * kanonis (plumbing Fase 5 yang sebelumnya tidak punya pemanggil). */
import {
  loadDedAttachment,
  saveDedAttachment,
  attachmentToDedOutput,
  dedSpecsFromAttachment,
  sanitizeDedSpecs,
  dimsFromIntakeContext,
  reconcileDedQto,
  detectDedSpecConflicts,
  pendingQtoCorrections,
  proposeQtoCorrections,
  applyQtoCorrection,
  rejectQtoCorrection,
  resolveQtoDims,
  patchDedQtoChecksAfterDecision,
  buildDedSpecRevisionPreview,
  applyDedSpecRevision,
  parseDedSpecRevisionCommand,
  formatDedSpecRevisionPreviewMessage,
  resolveDedItemPrices,
  formatDedFeedbackLines,
  buildDedQtoDraftInfo,
  DED_DIMENSION_KEYS,
  type DedAttachment,
  type DedPriceReview,
  type DedSpecRevisionPreview,
  type QtoCorrectionProposal,
} from './dedQtoIntegration';
import { buildDedSection } from './dedUnderstanding';
import { buildQtoSection } from './qtoBridge';
/* P6 — panel Review draft + logika resolve MISSING (EF-09). */
import { DraftReviewPanel } from './DraftReviewPanel';
import { resolveMissingDimensions } from './draftReview';
import type { QtoUserDimensions } from './qtoBridge';
import {
  extractMemoryCandidates,
  extractSpecMemories,
  ingestMemoryCandidates,
  retrieveMemories,
  formatMemorySection,
  formatPreferenceLines,
  applyPersonalizationGate,
  getPreferences,
  setPreference,
  listMemories,
  deleteMemory,
  correctMemory,
  getMemoryReport,
  MEMORY_HONEST_LABEL,
  type MemoryRecord,
  type MemoryScope,
  type UserPreferences,
} from './memory';
import { looksLikeNeedsAnswer, parseFloorsMention } from './rabNeeds';
import { notificationBus } from '../../notifications/notificationBus';
import { navigateTo, paths, routeForMenu } from '../../routing/routes';
import { EZRABMascotLucu } from '../../components/mascot/EZRABMascotLucu';
import { useProject } from '../../context/ProjectContext';
import { useRole } from '../../auth/RoleContext';
import {
  setAssistantOperationContext,
  listPendingPlans,
  getPlan,
  setPlanStatus,
  executePlan,
  type OperationHost,
} from './operations';
import { buildProjectSnapshot, ProjectSnapshot, snapshotAllItems } from './projectContext';
import { unifiedConversationStore } from '../../services/ai/conversation/unifiedConversationStore';
/* FASE 3 — orkestrasi agen (agentOrchestrator.ts): objektif + rencana
 * multi-langkah + approval gate + follow-up. Dipakai lewat API-nya;
 * tidak ada runtime eksekusi kedua (executionRuntime tetap pemilik
 * eksekusi LLM). */
import {
  deriveObjective,
  formatObjectiveSection,
  buildPlanForObjective,
  savePlan,
  loadActivePlanForProject,
  approveStep,
  denyStep,
  retryStep,
  applyRegistryOutcomeToStep,
  markTransferStepCompleted,
  markQuestionnaireStepCompleted,
  replanForNewObjective,
  getPendingFollowUps,
  formatFollowUpMessage,
  type TaskPlan,
} from './agentOrchestrator';
/* FASE 5 — registry tool kanonis: eksekusi langkah rencana yang
 * disetujui berjalan lewat registry (bukan jalur lama); receipt
 * transfer dicatat ke trail audit registry. */
import { runPlanStepWithRegistry, PLAN_STEP_TOOL_MAP, recordTransferReceipt } from './toolRegistry';
import './ezrab-ai-chat.css';
import './markdown.css';
import '../../ai-credits/ai-credits.css';
import { useCreditSimulation } from '../../ai-credits/useCreditSimulation';
import { estimateReservationCredits, meterTexts } from '../../ai-credits/tokenMetering';
import { CreditEstimateBadge } from '../../ai-credits/components/CreditEstimateBadge';
import { CreditBalance } from '../../ai-credits/components/CreditBalance';
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
  /** Plan operasi Asisten AI yang menunggu/sudah dikonfirmasi pada pesan ini. */
  planId?: string;
  /** Kuesioner spesifikasi adaptif yang dirender sebagai kartu interaktif
   * pada pesan ini (Adaptive Questionnaire 2026-11-12). */
  questionnaire?: QuestionnairePayload;
  /** Kartu kuesioner pada pesan ini sudah pernah dikirim (ringkasan + Ubah). */
  questionnaireSubmitted?: boolean;
}

/** Kontrol konfirmasi plan operasi Asisten AI (pratinjau → konfirmasi manusia). */
function PlanControls(props: {
  planId: string;
  busy: boolean;
  onConfirm: (planId: string) => void;
  onCancel: (planId: string) => void;
}): React.ReactNode {
  const plan = getPlan(props.planId);
  if (!plan) return null;
  if (plan.status === 'pending') {
    return (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
        <button
          onClick={() => props.onConfirm(props.planId)}
          disabled={props.busy}
          style={{
            padding: '8px 14px', borderRadius: 8, border: '1px solid #047857',
            background: '#059669', color: '#FFFFFF', fontWeight: 700,
            fontSize: 13, cursor: props.busy ? 'default' : 'pointer', opacity: props.busy ? 0.6 : 1,
          }}
        >
          {props.busy ? 'Mengeksekusi…' : 'Konfirmasi Eksekusi'}
        </button>
        <button
          onClick={() => props.onCancel(props.planId)}
          disabled={props.busy}
          style={{
            padding: '8px 14px', borderRadius: 8, border: '1px solid #CBD5E1',
            background: '#F8FAFC', color: '#334155', fontWeight: 600,
            fontSize: 13, cursor: props.busy ? 'default' : 'pointer', opacity: props.busy ? 0.6 : 1,
          }}
        >
          Batalkan
        </button>
        <span style={{ fontSize: 12, color: '#64748B' }}>Perubahan belum berjalan sampai Anda mengonfirmasi.</span>
      </div>
    );
  }
  const note =
    plan.status === 'executed' ? 'Sudah dieksekusi — hasil terverifikasi ada pada pesan berikutnya.'
    : plan.status === 'cancelled' ? 'Pratinjau dibatalkan — tidak ada perubahan yang dibuat.'
    : plan.status === 'expired' ? 'Pratinjau kedaluwarsa — buat permintaan baru.'
    : 'Eksekusi gagal — lihat pesan hasil.';
  return <div style={{ marginTop: 8, fontSize: 12, color: '#64748B' }}>{note}</div>;
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

/* ---- CHAT-08 (GELOMBANG PERBAIKI SEMUA, 2026-11-13): wajah kegagalan AI ----
 * Kegagalan provider sebelumnya tampil sebagai satu kalimat generik tanpa
 * penyebab, tanpa panduan, tanpa jalan lanjut. Formatter murni ini
 * menyusun wajah kegagalan yang jujur + dapat ditindaklanjuti:
 *  - baris pertama = pesan layanan apa adanya (lapisan transport yang
 *    menyebut apa yang terjadi — TIDAK diganti/dikarang ulang);
 *  - lalu panduan yang benar-benar bisa dilakukan pengguna, dipilih dari
 *    kode error bila ada (konteks/validasi → persingkat/rumuskan ulang;
 *    selebihnya → Coba Lagi);
 *  - tombol "Coba Lagi" sudah ada di bawah gelembung error (render
 *    m.isError && m.fromAi) — panduan menunjuk ke tombol itu, bukan
 *    menciptakan jalur retry baru (lifecycle tidak disentuh).
 * Tanpa emoji (aturan 0-emoji permukaan brand). Pesan mentah teknis
 * (mis. "Failed to fetch" dari Error mentah) dinormalisasi ke kalimat
 * Indonesia yang setara maknanya — bukan penyebab yang dikarang. */
function formatAiFailureMessage(serviceMessage: string, errorCode?: string | null): string {
  let base = (serviceMessage || '').trim();
  if (!base) base = 'Layanan AI gagal memproses permintaan.';
  else if (/failed to fetch|networkerror|load failed|econnrefused|econnreset/i.test(base)) {
    base = 'Tidak dapat terhubung ke layanan AI. Periksa koneksi internet Anda.';
  } else if (/timed out|timeout/i.test(base)) {
    base = 'Layanan AI tidak merespons tepat waktu.';
  }
  // Kode yang penyebabnya ada di ISI permintaan (bukan di layanan):
  // retry buta tidak membantu — pengguna harus mengubah pesannya dulu.
  const shortenFirst = new Set([
    'CONTEXT_BUDGET_EXCEEDED', 'PAYLOAD_TOO_LARGE', 'AI_BAD_REQUEST',
    'INVALID_REQUEST', 'CONTENT_REJECTED',
  ]).has(errorCode ?? '');
  const retryLine = shortenFirst
    ? 'Coba persingkat atau rumuskan ulang pesan Anda, lalu ketuk tombol "Coba Lagi" di bawah pesan ini.'
    : 'Ketuk tombol "Coba Lagi" di bawah pesan ini untuk mengirim ulang pertanyaan Anda. Bila terus gagal, coba persingkat pesan atau mulai percakapan baru.';
  return `${base}\n\n${retryLine}\nPesan dan draft Anda tetap tersimpan — tidak ada data yang hilang.`;
}

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
  // mengikuti klasifikasi permintaan.
  const [thinkingText, setThinkingText] = useState('EZRAB sedang berpikir…');
  // Eksekusi AI persisten (lifecycle fix 2026-11-12): kepemilikan request
  // hidup di executionRuntime (modul), BUKAN di komponen ini — navigasi
  // (unmount) tidak lagi membatalkan pekerjaan AI yang sedang berjalan.
  // `activeExec` = eksekusi yang sedang berjalan pada percakapan aktif
  // (null bila tidak ada); dipakai untuk indikator busy + tombol Berhenti.
  const [activeExec, setActiveExec] = useState<AiExecutionRecord | null>(null);
  // S9 — tahap yang DILAPORKAN gelembung thinking diturunkan dari LOG
  // EVENT (stageHistory) lewat reportedExecutionStage, bukan dari field
  // `stage` mentah: yang tampil adalah tahap yang benar-benar
  // dipancarkan; null bila belum ada event (tanpa tahap karangan).
  const reportedActiveStage = reportedExecutionStage(activeExec);
  // Penanda terputus (jaminan reload §8): pesan pengguna terakhir tanpa
  // balasan + tidak ada eksekusi hidup = request terputus; tampil sebagai
  // banner dengan aksi Coba Lagi manual (tidak pernah auto-resubmit).
  const [interruptedPrompt, setInterruptedPrompt] = useState<string | null>(null);

  // D-47 (Batch E): Mode AI dipersist ke localStorage (`ezrab_chat_ai_mode`)
  // dan dipulihkan saat mount — pilihan Mendalam tidak lagi reset ke
  // Cepat sesudah reload. Nilai tak dikenal → default 'fast'.
  const [mode, setMode] = useState<'fast' | 'advanced'>(() => loadChatAiMode());
  const changeChatMode = (next: 'fast' | 'advanced') => {
    setMode(next);
    saveChatAiMode(next);
  };
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
  // Estimasi kredit LIVE berbasis token (Amendemen Spec Billing v1.1):
  // token masuk = riwayat percakapan + draf saat ini, token keluar =
  // tunjangan reservation. Settlement sesudah jawaban memakai token
  // aktual teks terkirim + teks jawaban (lihat titik debit di submit()).
  const liveReservationCredits = estimateReservationCredits(
    [...messages.map((m) => m.content), input].join('\n'),
  );
  const chatEstimate = {
    min: liveReservationCredits,
    max: liveReservationCredits,
    feature: 'chat-ai' as const,
    model: mode === 'fast' ? 'FAST' : 'ADVANCED',
    isCalibratedDraft: true,
  };
  const [listening, setListening] = useState(false);
  /** Game Space overlay — opened by the `game` command, closed back to chat. */
  const [gameSpaceOpen, setGameSpaceOpen] = useState(false);
  /** Chat-to-RAB Fase 2: menunggu jawaban "Lengkapi kebutuhan" dari pengguna */
  const [awaitingNeeds, setAwaitingNeeds] = useState(false);
  /** D1: kartu pilihan RAB bertipe menunggu koreksi/pilihan pengguna */
  const [awaitingChoice, setAwaitingChoice] = useState(false);
  /** Klarifikasi subtipe (2026-10-23): menunggu jawaban "Jalan apa?" */
  const [awaitingSubtype, setAwaitingSubtype] = useState(false);
  /** Gerbang klarifikasi material (2026-11-10): menunggu jawaban bahan
   *  ("Bahan rangka & penutup atapnya apa?") sebelum draft disusun */
  const [awaitingMaterial, setAwaitingMaterial] = useState(false);
  /** Intake konteks proyek (Conversational Intelligence 2026-11-10):
   *  menunggu jawaban konsep/fasilitas/kondisi pada percakapan
   *  landscape — konteks proyek terstruktur hidup di actionRegistry */
  const [awaitingConcept, setAwaitingConcept] = useState(false);
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
  /** F-6B (GELOMBANG PERBAIKI SEMUA): id store dari pesan error AI
   *  terakhir yang dipersist (LLM !success / catch). Dipakai retry
   *  untuk menggantikan record tersimpan itu dengan hasil retry —
   *  tanpa ini error lama bangkit lagi sesudah reload di samping
   *  balasan sukses. Hanya error pipeline AI yang dilacak (error
   *  lokal registry/push tidak pernah masuk ke sini). */
  const lastAiErrorMessageIdRef = useRef<string | null>(null);
  /** F-6B: id entry error tersimpan yang sedang digantikan oleh satu
   *  percobaan retry. Diisi di cabang echo=false submit, dikonsumsi
   *  (sekali pakai) oleh persistMessage asisten pertama sesudahnya,
   *  dan selalu dibersihkan di awal submit — tidak pernah bocor ke
   *  pengiriman yang tidak terkait. */
  const retryReplacesMessageIdRef = useRef<string | null>(null);
  // P0 Command Center: wizard & design studio overlays
  const [rabWizardOpen, setRabWizardOpen] = useState(false);
  const [designStudioOpen, setDesignStudioOpen] = useState(false);
  const [designPrompt, setDesignPrompt] = useState<string | undefined>(undefined);

  /* ---- FASE 5A: project grounding + conversation persistence ---- */
  const {
    currentProject, projectRabItems, bulkAddRabItems, getLastBulkAddOutcome,
    updateRabItemFull, updateRabItemUnitPrice, deleteRabItem, bulkDeleteRabItems,
    createVersionSnapshot, saveStatus,
  } = useProject();
  // Prefer live context; fall back to props (keeps standalone usage working).
  const effProject = currentProject ?? activeProject;
  // GATE 1 (5A) — SELURUH ChatActionContext untuk executeIntent memakai
  // effProject sebagai activeProject (bukan prop activeProject mentah):
  // prop itu null pada mount yang mengandalkan currentProject dari
  // konteks workspace — registry yang menerima null tidak dapat mengikat
  // konteks intake/draft ke proyek (snapshot registry tidak tersimpan).
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
  /* NEW-02 (Batch E): kegagalan persist terakhir yang terlihat pengguna.
   * null = tidak ada kegagalan (atau sudah pulih sesudah persist sukses).
   * Pesan tampil sebagai banner peringatan di dalam chat — kegagalan
   * persist TIDAK PERNAH lagi diam-diam terlihat seperti sukses. */
  const [persistError, setPersistError] = useState<string | null>(null);
  /* D-46 (Batch E): draft composer tahan navigasi. Draft disimpan per
   * percakapan (debounce 300 md + flush saat unmount), dipulihkan saat
   * percakapan aktif berubah, dihapus saat pesan terkirim. Cermin ref
   * dipakai flush unmount (closure cleanup tidak melihat state terbaru)
   * dan guard pulih (jangan menimpa ketikan yang sudah ada). */
  const inputRef = useRef('');
  const storeProjectIdRef = useRef(storeProjectId);
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { inputRef.current = input; }, [input]);
  useEffect(() => { storeProjectIdRef.current = storeProjectId; }, [storeProjectId]);
  const saveDraftSoon = useCallback((text: string) => {
    // Tangkap convId + projectId SAAT dijadwalkan: bila pengguna pindah
    // percakapan dalam 300 md, timer tidak boleh menyimpan draft
    // percakapan lama di bawah kunci percakapan baru.
    const convId = convIdRef.current;
    const pid = storeProjectIdRef.current;
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = setTimeout(() => {
      draftSaveTimerRef.current = null;
      if (convId) saveChatDraft(convId, pid, text);
    }, 300);
  }, []);
  const clearDraftNow = useCallback(() => {
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    if (convIdRef.current) clearChatDraft(convIdRef.current);
  }, []);
  // Pulihkan draft percakapan aktif (mount + ganti percakapan). Hanya
  // bila kotak input masih kosong — tidak menimpa ketikan/prefill.
  useEffect(() => {
    if (!conversationReady || !activeConvId) return;
    const draft = loadChatDraft(activeConvId, storeProjectId);
    if (draft && !inputRef.current) setInput(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationReady, activeConvId, storeProjectId]);
  // Flush saat unmount (navigasi): ketikan <300 md terakhir ikut tersimpan.
  useEffect(() => () => {
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    if (inputRef.current && convIdRef.current) {
      saveChatDraft(convIdRef.current, storeProjectIdRef.current, inputRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- Riwayat Percakapan (daftar kompak di mode awal + panel header) ---- */
  interface HistoryItem { id: string; title: string; updatedAt: number; messageCount: number }
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  /** Panel dropdown riwayat dari tombol "Riwayat" di header. */
  const [historyOpen, setHistoryOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  /**
   * D-48 (Batch E): percakapan yang menunggu konfirmasi hapus. Tombol
   * tong sampah HANYA mengisi state ini (dialog terbuka) — mutasi hapus
   * hanya terjadi sesudah pengguna menekan "Hapus" di dialog. Batal =
   * tidak ada yang dihapus. Pola dialog in-app yang sama dengan Batch A
   * (D-68/D-84) — bukan window.confirm.
   */
  const [pendingDeleteConv, setPendingDeleteConv] = useState<HistoryItem | null>(null);
  useEffect(() => {
    if (!pendingDeleteConv) return undefined;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setPendingDeleteConv(null); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [pendingDeleteConv]);
  /** D-49 (Batch E): panel Tentang/version dari judul header. */
  const [aboutOpen, setAboutOpen] = useState(false);
  useEffect(() => {
    if (!aboutOpen) return undefined;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAboutOpen(false); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [aboutOpen]);

  /* ---- FASE 2 — Kontrol memori pengguna (panel Memori) ---- *
   * Lihat memori relevan yang tersimpan, koreksi memori yang salah,
   * hapus memori, nonaktifkan personalisasi opsional. Label jujur:
   * memori lokal per-perangkat — belum lintas-perangkat. */
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memoryItems, setMemoryItems] = useState<MemoryRecord[]>([]);
  const [memoryPrefs, setMemoryPrefs] = useState<UserPreferences>(() => getPreferences(null));
  const [memoryEditingId, setMemoryEditingId] = useState<string | null>(null);
  const [memoryEditingText, setMemoryEditingText] = useState('');
  const refreshMemoryPanel = useCallback(() => {
    if (!effProject) {
      setMemoryItems([]);
      return;
    }
    const scope: MemoryScope = { userId: null, projectId: effProject.id, conversationId: convIdRef.current ?? null };
    // Histori ikut ditampilkan (superseded berlabel 'digantikan') agar
    // koreksi spek terlihat jejaknya — bukan hanya nilai current.
    const listed = listMemories(scope, { statuses: ['current', 'contradictory', 'superseded'] });
    setMemoryItems(listed.ok ? listed.value : []);
    setMemoryPrefs(getPreferences(null));
  }, [effProject?.id]);

  /* ---- FASE 3 — Rencana tugas agen (panel Rencana) ---- *
   * Rencana multi-langkah per proyek/percakapan (agentOrchestrator):
   * dipersist di storage lokal, selamat dari navigasi & reload.
   * Follow-up disajikan SEKALI saat kembali (banner di dalam chat),
   * bukan toast berulang. */
  const [agentPlan, setAgentPlan] = useState<TaskPlan | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  /* P6 — panel Review draft: dibuka dari menu ⋯. reviewTick memaksa
   * render ulang sesudah aksi panel (singleton draft dibaca segar
   * tiap render, tetapi React tidak tahu singleton berubah). */
  const [reviewOpen, setReviewOpen] = useState(false);
  const [, setReviewTick] = useState(0);
  const [followUpBanner, setFollowUpBanner] = useState<string | null>(null);
  const agentPlanRef = useRef<TaskPlan | null>(null);
  const updateAgentPlan = useCallback((mutate: (p: TaskPlan) => TaskPlan) => {
    const prev = agentPlanRef.current;
    if (!prev) return;
    const next = mutate(prev);
    agentPlanRef.current = next;
    setAgentPlan(next);
    try { savePlan(next); } catch { /* persistensi rencana tidak boleh menggagalkan chat */ }
  }, []);
  const setAgentPlanTracked = useCallback((plan: TaskPlan | null) => {
    agentPlanRef.current = plan;
    setAgentPlan(plan);
    if (plan) { try { savePlan(plan); } catch { /* abaikan */ } }
  }, []);

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
            // D-50 (defence in depth): judul turunan dari pesan pertama
            // tidak pernah menampilkan token routing internal — pesan
            // lama yang tersimpan bersama token tetap tampil bersih.
            ? (firstUser ? stripQuickActionToken(firstUser.content).slice(0, 60) : 'Percakapan baru')
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

  /* FASE 2 — muat daftar memori saat panel Memori dibuka; Escape menutup. */
  useEffect(() => {
    if (!memoryOpen) return undefined;
    refreshMemoryPanel();
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMemoryOpen(false); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [memoryOpen, refreshMemoryPanel]);
  // Berlangganan eksekusi persisten (lifecycle fix 2026-11-12): cleanup
  // efek ini HANYA unsubscribe — TIDAK PERNAH meng-abort eksekusi.
  // Navigasi (unmount) bukan pembatalan; pekerjaan AI terus berjalan di
  // executionRuntime dan statusnya dibaca lagi saat view ter-mount kembali.
  useEffect(() => {
    if (!conversationReady || !activeConvId) return;
    // Keadaan dibaca dari registry saat notifikasi tiba (bukan dari
    // snapshot notifikasi): notifikasi dari record lama yang sudah
    // digantikan tidak boleh mematikan indikator eksekusi yang baru.
    return subscribeExecution(activeConvId, () => {
      const current = getActiveExecution(activeConvId);
      setActiveExec(current);
      // Sinkronkan indikator sibuk dengan eksekusi runtime: kembali ke
      // Chat AI di tengah generasi menampilkan status generating, bukan
      // formulir menganggur di atas request yang berjalan.
      setBusy(current !== null);
    });
  }, [conversationReady, activeConvId]);
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
          // D-50: gelembung tidak pernah menampilkan token routing
          // internal dari pesan lama yang tersimpan bersama token.
          content: stripQuickActionToken(m.content),
          ts: m.createdAt ? Date.parse(m.createdAt) || Date.now() : Date.now(),
        }));
      setMessages(restored);
    } catch {
      /* storage failure is non-fatal — chat still works in-memory */
    }
    setConversationReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeProjectId]);

  /* FASE 3 — pulihkan rencana tugas saat kembali (AGT-12): rencana
   * aktif proyek dimuat dari storage; bila ada pekerjaan belum selesai
   * dan follow-up belum pernah disajikan untuk rencana ini, tampilkan
   * banner kelanjutan SEKALI di dalam chat (bukan toast). */
  useEffect(() => {
    if (!conversationReady || !effProject) return;
    try {
      const plan = loadActivePlanForProject(effProject.id, convIdRef.current ?? null);
      if (!plan) { setAgentPlanTracked(null); return; }
      agentPlanRef.current = plan;
      setAgentPlan(plan);
      const pending = getPendingFollowUps(plan);
      if (pending.length > 0 && !plan.followUpShownAt) {
        const msg = formatFollowUpMessage(plan);
        if (msg) setFollowUpBanner(msg);
        // followUpShownAt HANYA ditandai saat pengguna menutup/membuka
        // banner (lihat tombol di bawah) — bukan saat mount. Remount
        // karena navigasi tidak boleh menghabiskan jatah tampil banner;
        // banner tetap muncul lagi sesudah reload sampai ditutup.
      }
    } catch {
      /* rencana gagal dimuat ≠ chat gagal */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationReady, storeProjectId]);

  // Penanda INTERRUPTED (jaminan reload §8, lifecycle fix 2026-11-12):
  // percakapan aktif yang berakhir pada pesan pengguna tanpa balasan DAN
  // tanpa eksekusi hidup di runtime = request terakhir terputus (reload /
  // crash / penutupan di tengah generasi). Banner muncul dengan aksi Coba
  // Lagi manual — TIDAK PERNAH auto-resubmit (request yang berpotensi
  // berbayar tidak boleh diduplikasi diam-diam sesudah pemulihan).
  // GATE 1 (5A) — derivasi dibaca dari riwayat TERSIMPAN (store), bukan
  // dari state pesan komponen: catatan pemulihan (draft/intake) yang
  // ditambahkan view sesudah reload adalah anotasi EFEMERAL (tidak
  // dipersist) — bila dibaca dari state, catatan itu menjadi "pesan
  // terakhir" dan MENUTUPI permintaan yang terputus (banner tidak pernah
  // tampil padahal prompt pengguna belum berbalas). Store adalah sumber
  // kebenaran "apakah pesan pengguna terakhir sudah berbalas".
  useEffect(() => {
    if (!conversationReady || busy || activeExec) {
      setInterruptedPrompt(null);
      return;
    }
    let lastStored: { role: string; content: string } | null = null;
    try {
      const conv = unifiedConversationStore.getOrCreateActiveConversation(storeProjectId);
      const msgs = conv.messages ?? [];
      lastStored = msgs.length ? msgs[msgs.length - 1] : null;
    } catch {
      lastStored = null;
    }
    setInterruptedPrompt(lastStored && lastStored.role === 'user' ? stripQuickActionToken(lastStored.content) : null);
  }, [conversationReady, messages, busy, activeExec]);

  /* F-6B (GELOMBANG PERBAIKI SEMUA): mengembalikan id pesan tersimpan
   * (dipakai pelacak error AI di atas) dan — bila satu retry sedang
   * menggantikan error lama — MENULIS ULANG record tersimpan itu lewat
   * updateMessage yang sudah ada di store, BUKAN append baru. Desain:
   * retry adalah pengganti percobaan yang gagal (tampilan SUDAH
   * menghapus error lama sejak lama); store kini mengikuti tampilan,
   * sehingga sesudah reload tidak ada lagi error hantu di samping
   * balasan sukses. Riwayat sukses TIDAK PERNAH disentuh: hanya entry
   * error AI terakhir yang diganti, dan hanya isinya (id/urutan/
   * pesan lain utuh). Bila record asal sudah tidak ada (ganti
   * percakapan/proyek di tengah jalan), jatuh ke append biasa. */
  const persistMessage = (role: 'user' | 'assistant', content: string): string | null => {
    // NEW-02 (Batch E): kegagalan persist WAJIB terlihat — log
    // terstruktur + banner di UI. Sebelumnya catch-all mengembalikan
    // null tanpa jejak apa pun, sehingga pesan yang gagal tersimpan
    // terlihat persis seperti yang sukses (mekanisme D-51 yang paling
    // mungkin). Dua kanal kegagalan: (1) throw (mis. isolasi proyek
    // dari convIdRef basi) → catch di bawah; (2) gagal tulis storage
    // (kuota) yang TIDAK melempar → periksa getLastSaveResult()
    // sesudah tiap mutasi. Sukses membersihkan banner sebelumnya.
    const checkSave = (convId: string): void => {
      const saveResult = unifiedConversationStore.getLastSaveResult();
      if (saveResult && !saveResult.ok) {
        setPersistError(reportPersistSaveFailure(saveResult, {
          role, conversationId: convId, projectId: storeProjectId, operation: 'appendMessage',
        }));
      } else {
        setPersistError(null);
      }
    };
    try {
      const convId = convIdRef.current;
      if (!convId) return null;
      if (role === 'assistant' && retryReplacesMessageIdRef.current) {
        const replacesId = retryReplacesMessageIdRef.current;
        retryReplacesMessageIdRef.current = null;
        try {
          unifiedConversationStore.updateMessage(convId, storeProjectId, replacesId, { content });
          checkSave(convId);
          return replacesId;
        } catch {
          /* record asal hilang — append biasa di bawah */
        }
      }
      const stored = unifiedConversationStore.appendMessage(convId, storeProjectId, {
        role,
        content,
      });
      checkSave(convId);
      return stored?.id ?? null;
    } catch (err) {
      setPersistError(reportPersistFailure(err, {
        role, conversationId: convIdRef.current, projectId: storeProjectId, operation: 'appendMessage',
      }));
      return null;
    }
  };

  /* ---- Persistensi draft tahan-refresh (Final Hardening §2) ----
   * Singleton modul universalRab tetap cache kerja; draftPersistence
   * adalah lapisan simpan di bawahnya (kunci ezrab_prod_ai_drafts).
   * Autosave dipanggil pada titik commit draft (balasan asisten
   * terkirim / receipt transfer), BUKAN per render/keystroke; modul
   * persistensi sendiri idempoten (isi sama → tanpa tulis ulang), jadi
   * frekuensi tulis = 1 per perubahan draft yang benar-benar terjadi.
   * Kegagalan simpan TIDAK memblokir alur: peringatan non-blokir
   * (sekali per draft+versi+error) + log diagnostik terstruktur, dan
   * TIDAK PERNAH diklaim tersimpan. */
  const draftUpdatedAtRef = useRef<string | null>(null);
  const draftWarnedRef = useRef<Set<string>>(new Set());
  /* GATE 3 (5C) — pratinjau revisi yang MENUNGGU konfirmasi eksplisit.
   * Hidup di memori sesi saja (TIDAK dipersist): reload membatalkan
   * pratinjau yang menunggu — versi aktif + riwayat pulih utuh, dan
   * tombol pratinjau lama menjawab jujur bahwa pratinjau sudah tidak
   * aktif. Konfirmasi harus berasal dari sesi yang melihat pratinjau. */
  const pendingRevisionRef = useRef<RevisionPreview | null>(null);
  /* G1 (K-04, Audit Fase 0 Skill Engine) — approval transfer yang
   * MENUNGGU konfirmasi eksplisit, TERIKAT pada draft yang ditinjau
   * di pratinjau (draftId + versi + sidik isi + TTL 10 menit; pola
   * ChangePlan.stateHash operations.ts + guard revisi
   * draftRevision.ts). Hidup di memori sesi saja (TIDAK dipersist):
   * reload membatalkan approval yang menunggu — tombol konfirmasi
   * pada pesan lama menjawab jujur bahwa pratinjau sudah tidak
   * aktif, seperti pendingRevisionRef Gate 3 di atas.
   * Binding TIDAK dibawa lewat payload action: union ChatActionButton
   * (actionRegistry.ts) tidak punya field untuk
   * 'push-universal-confirm', dan satu slot ref ini adalah pola yang
   * sama dengan konfirmasi revisi — tombol hanya memicu pengecekan
   * ulang terhadap draft aktif saat klik. Satu slot = pratinjau
   * terbaru yang menang; pratinjau tanpa tombol konfirmasi (BLOCKED
   * / tanpa proyek) mengosongkan slot agar tidak ada approval usang
   * yang tertinggal. */
  const pendingTransferApprovalRef = useRef<TransferApprovalBinding | null>(null);
  /* GATE 4 (5D) — pratinjau revisi spek DED yang MENUNGGU konfirmasi
   * eksplisit (peta id → pratinjau, memori sesi saja — seperti
   * pendingRevisionRef Gate 3, reload membatalkan pratinjau yang
   * menunggu) + penjaga konsumsi lampiran DED per sesi (agar pesan
   * umpan balik DED tidak terposting dua kali bila efek berjalan
   * ulang; penjaga antar-mount adalah `consumedAt` di lampiran). */
  const pendingDedSpecRevisionsRef = useRef<Map<string, DedSpecRevisionPreview>>(new Map());
  const dedConsumeAttemptedRef = useRef<Set<string>>(new Set());
  const persistActiveDraft = (
    stage: string,
    savedBy: 'autosave' | 'manual' | 'transfer' = 'autosave',
  ): void => {
    // FASE 2 (ARS-06): singleton draft dibaca TERIKAT proyek aktif —
    // draft proyek lain tidak boleh ter-autosave ke proyek ini.
    const d = getLastUniversalDraft(effProject?.id);
    if (!d || !effProject) return;
    const res = saveDraft({
      draft: d,
      projectId: effProject.id,
      conversationId: convIdRef.current,
      workflowStage: stage,
      savedBy,
      expectedUpdatedAt: draftUpdatedAtRef.current,
    });
    if (res.ok) {
      draftUpdatedAtRef.current = res.updatedAt;
      // FASE 3 — draft nyata tersimpan → langkah generate-draft rencana
      // ditandai sukses (bukan diklaim dari teks pesan). Langkah
      // transfer tetap menunggu persetujuan eksplisit pengguna.
      updateAgentPlan((p) => ({
        ...p,
        steps: p.steps.map((s) => (s.kind === 'generate-draft' && s.status !== 'succeeded'
          ? { ...s, status: 'succeeded' as const, result: `Draft tersimpan: ${d.title} (v${d.version}).`, completedAt: new Date().toISOString() }
          : s)),
      }));
      return;
    }
    const err = structuredAiError('DRAFT_PERSISTENCE_FAILED');
    logAiDiagnostic({
      correlation_id: err.correlationId,
      conversation_id: convIdRef.current,
      project_id: effProject.id,
      draft_id: d.id,
      operation: `draft-persist:${stage}:${res.error}`,
      error_code: err.code,
      retry_count: 0,
    });
    const warnKey = `${d.id}:${d.version}:${res.error}`;
    if (!draftWarnedRef.current.has(warnKey)) {
      draftWarnedRef.current.add(warnKey);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠️ ${err.message} (Kode: ${res.error})`,
          ts: Date.now(),
          isError: true,
        },
      ]);
    }
  };

  /* F9-PERSIST-1 (gelombang perbaikan 2026-11-12) — markTransferred
   * menulis ulang record dengan updatedAt BARU (T2); nilai baliknya
   * WAJIB disinkronkan ke draftUpdatedAtRef. Versi lama mengabaikan
   * nilai balik di kedua situs transfer, sehingga ref tetap T1 dan
   * semua autosave berikutnya gagal DRAFT_VERSION_CONFLICT sampai
   * remount. Satu-satunya pemanggil markTransferred di view adalah
   * kedua situs transfer di bawah — keduanya lewat helper ini.
   * Desain: sinkronisasi ref (bukan satu jalur tulis) — status
   * 'transferred' sudah ikut dipersistenkan persistActiveDraft lewat
   * deriveStatus (receipt ada di objek draft), jadi markTransferred
   * hanya menambah transisi status eksplisit + savedCount; melipatnya
   * ke saveDraft akan menyentuh lapisan persistensi bersama + pin-nya.
   * Bila markTransferred gagal, ref TIDAK berubah — benar, karena
   * record pun tidak berubah. Guard optimistic-concurrency TIDAK
   * disentuh. */
  const syncTransferredMark = (receipt: Parameters<typeof markTransferred>[1]): void => {
    if (!effProject) return;
    const res = markTransferred(effProject.id, receipt);
    if (res.ok) draftUpdatedAtRef.current = res.updatedAt;
  };

  /* ---- GATE 3 (5C) — aktivasi pratinjau revisi yang menunggu ----
   * Dipakai bersama oleh konfirmasi teks (cabang submit) dan tombol
   * "Aktifkan revisi" (handleActionButtonInner). Mengembalikan pesan +
   * tombol untuk ditampilkan pemanggil dengan mekanismenya sendiri.
   * Efek samping: membersihkan pending pada sukses/stale/sudah-aktif
   * (pratinjau itu mati); MEMPERTAHANKAN pending pada gagal-simpan
   * (pengguna boleh coba lagi); memperbarui draftUpdatedAtRef pada
   * sukses agar autosave berikutnya tidak kena konflik versi basi. */
  const runRevisionActivation = (
    pending: RevisionPreview,
  ): { message: string; actions?: ChatActionButton[] } => {
    if (!effProject) {
      return { message: 'Tidak ada proyek aktif — revisi tidak dapat diaktifkan.' };
    }
    const res = activateRevision(effProject.id, pending);
    if (res.ok) {
      pendingRevisionRef.current = null;
      draftUpdatedAtRef.current = res.updatedAt;
      if (!res.alreadyActivated) {
        return {
          message:
            `✅ ${res.message}\n\n` +
            `Perubahan: ${pending.changes.join('; ')}.\n` +
            `Total estimasi: ${formatRupiah(pending.before.estimatedTotal)} → ${formatRupiah(pending.after.estimatedTotal)}.\n` +
            `Bandingkan versi lama dengan yang baru lewat perintah "bandingkan versi ${pending.baseVersion} dan ${pending.targetVersion}".`,
          actions: [
            { label: 'Push ke Spreadsheet', action: { kind: 'push-universal' } },
            { label: 'Riwayat versi', action: { kind: 'revision-history' } },
            { label: 'Buka Spreadsheet RAB', action: { kind: 'navigate', menu: 'rab-estimasi' } },
          ],
        };
      }
      return { message: `ℹ️ ${res.message}` };
    }
    if (res.stale) {
      pendingRevisionRef.current = null;
      return { message: `⚠️ ${res.message}` };
    }
    return { message: `⚠️ ${res.message}` };
  };

  /* Pesan asisten lokal (di luar submit — untuk tombol aksi revisi). */
  const appendLocalAssistant = (content: string, actions?: ChatActionButton[]): void => {
    setMessages((prev) => [...prev, { role: 'assistant', content, ts: Date.now(), actions }]);
    persistMessage('assistant', content);
  };

  /* ---- P6 — handler panel Review draft ----
   * Setiap aksi panel MENGUBAH draft + BERTAHAN: singleton diganti
   * lalu `persistActiveDraft` menulis record (pola keputusan koreksi
   * QTO Gate 4). Pesan chat TIDAK dikirim per edit kecil (panel
   * menampilkan notifikasi hasilnya; perubahan tercatat di
   * `draft.changes`) — pengecualian: aktivasi revisi + banding versi
   * tetap masuk chat karena keduanya adalah peristiwa alur revisi.
   * Edit mengubah sidik draft sehingga binding approval transfer G1
   * yang tertunda menjadi tidak berlaku (pengguna wajib pratinjau
   * ulang — benar) dan pratinjau revisi tertunda menjadi stale lewat
   * baseUpdatedAt (aktivasi menolak dengan pesan yang jelas). */
  const handleApplyReviewDraft = (next: Parameters<typeof setLastUniversalDraft>[0], message: string): void => {
    if (!effProject || !next) return;
    setLastUniversalDraft(next, effProject.id);
    persistActiveDraft('review-edit', 'manual');
    setReviewTick((t) => t + 1);
    void message;
  };

  const handleResolveMissingFromPanel = (
    itemId: string,
    dims: QtoUserDimensions,
  ): { ok: boolean; message: string } => {
    if (!effProject) {
      return { ok: false, message: 'Tidak ada proyek aktif — dimensi tidak dapat dilengkapi.' };
    }
    const att = loadDedAttachment(effProject.id);
    if (!att) {
      return { ok: false, message: 'Lampiran DED proyek ini sudah tidak ada — kirim ulang DED dari halaman DED AI bila masih diperlukan.' };
    }
    // Checks segar dari lampiran + dimensi gabungan (tersimpan + isian
    // panel) — usulan MISSING yang tampil dihitung dari rekonsiliasi
    // yang sama, jadi handler wajib mereproduksinya (pola F9-QTO-1).
    const { checks } = reconcileDedQto(att, dims);
    const res = resolveMissingDimensions(att, itemId, dims, checks);
    if (!res.ok) return { ok: false, message: res.message };
    if (!res.alreadyApplied) {
      saveDedAttachment(res.attachment);
      // Segarkan dedQto pada draft aktif + persist (pola handler
      // koreksi QTO): checks dihitung ulang dari lampiran terbaru.
      const activeDraft = getLastUniversalDraft(effProject.id);
      if (activeDraft?.dedQto) {
        const freshChecks = reconcileDedQto(res.attachment, dims).checks;
        const nextDraft = {
          ...activeDraft,
          dedQto: buildDedQtoDraftInfo(res.attachment, freshChecks, dims),
        };
        setLastUniversalDraft(nextDraft, effProject.id);
        persistActiveDraft('review-missing', 'manual');
      }
    }
    setReviewTick((t) => t + 1);
    return { ok: true, message: res.message };
  };

  const handleActivateRevisionFromPanel = (): void => {
    const pending = pendingRevisionRef.current;
    if (!pending) return;
    const res = runRevisionActivation(pending);
    appendLocalAssistant(res.message, res.actions);
    setReviewTick((t) => t + 1);
  };

  const handleCancelRevisionFromPanel = (): void => {
    const pending = pendingRevisionRef.current;
    if (!pending) return;
    pendingRevisionRef.current = null;
    appendLocalAssistant(
      `Revisi dibatalkan — versi aktif tetap versi ${pending.baseVersion}, tidak berubah. Pratinjau dibuang.`,
    );
    setReviewTick((t) => t + 1);
  };

  const handleCompareVersionsFromPanel = (versionA: number, versionB: number): void => {
    if (!effProject) return;
    appendLocalAssistant(compareStoredVersions(effProject.id, versionA, versionB));
  };

  const openReviewPanel = (): void => {
    setMenuOpen(false);
    const d = getLastUniversalDraft(effProject?.id);
    if (!d) {
      appendLocalAssistant('Belum ada draft RAB aktif untuk ditinjau — susun draft dulu lewat chat (mis. "buatkan RAB rumah 120 m²"), lalu buka Review draft.');
      return;
    }
    setReviewOpen(true);
  };

  // Pulihkan draft proyek aktif dari penyimpanan lokal saat singleton
  // kosong (mis. sesudah refresh) — jalur lama tanpa record persisten
  // tidak berubah (draft tetap in-memory seperti sebelumnya).
  useEffect(() => {
    if (!effProject || getLastUniversalDraft(effProject.id)) return;
    const loaded = loadDraft(effProject.id);
    if (!loaded.ok) return;
    setLastUniversalDraft(loaded.draft, effProject.id);
    draftUpdatedAtRef.current = loaded.meta.updatedAt;
    // GATE 3 (5C): riwayat versi ikut pulih bersama versi aktif.
    const historyNote = (loaded.meta.versionHistory?.length ?? 0) > 0
      ? ` Riwayat versi: ${loaded.meta.versionHistory!.length} versi tersimpan utuh — ketik "riwayat versi" untuk melihatnya.`
      : '';
    // GATE 4 (5D): rekonsiliasi DED/QTO ikut pulih bersama draft.
    const dedNote = loaded.draft.dedQto
      ? ` Data DED (${loaded.draft.dedQto.attachmentRef.fileName ?? loaded.draft.dedQto.attachmentRef.projectName}) + rekonsiliasi QTO pulih bersama draft — ${loaded.draft.dedQto.summary.mismatch} mismatch, ${loaded.draft.dedQto.decisions.length} keputusan koreksi tersimpan.`
      : '';
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: `Draft RAB "${loaded.draft.title}" (versi ${loaded.draft.version}) dipulihkan dari penyimpanan lokal proyek ini — sesi sebelumnya berakhir sebelum draft selesai. Lanjutkan revisi atau buka preview transfer dari draft yang sama.${historyNote}${dedNote}`,
        ts: Date.now(),
      },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effProject?.id]);

  /* ---- Persistensi konteks intake universal (Adaptive Questionnaire
   * 2026-11-12): snapshot konteks kanonis (termasuk keadaan kuesioner)
   * disimpan lewat lapisan persistensi yang sama dengan draft, agar
   * intake yang BELUM sampai generate pun selamat dari muat ulang.
   * Lapisan persistensi idempoten (isi sama → tanpa tulis ulang). ---- */
  useEffect(() => {
    if (!effProject) return;
    const ictx = getUniversalContextState();
    if (!ictx) return;
    saveIntakeContext(effProject.id, ictx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, effProject?.id]);

  /* ---- Pemulihan konteks intake sesudah muat ulang: hanya bila
   * singleton kosong dan snapshot proyek ini lebih baru dari record
   * draft-nya (draft = tahap sesudah intake; record draft yang lebih
   * baru ditangani efek pemulihan draft di atas).
   * GATE 1 (5A) — PENGECUALIAN TAUTAN: snapshot yang MENGHASILKAN draft
   * yang tersimpan (generatedDraftId === draftId record) adalah konteks
   * draft itu sendiri — dipulihkan BERSAMA draft, bukan ditindih penjaga
   * "draft lebih baru". Snapshot tak-terkait yang lebih tua dari draft
   * tetap tidak dipulihkan (perilaku lama). Konteks pasca-draft
   * dipulihkan sebagai konteks proyek DORMAN (tersedia untuk builder
   * kanonis & revisi) TANPA mengaktifkan status menunggu lanjutan
   * percakapan — agar pesan berikutnya masuk jalur revisi draft, bukan
   * mengulang brief. ---- */
  const intakeRestoredForRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!effProject) return;
    if (getUniversalContextState()) return;
    if (intakeRestoredForRef.current.has(effProject.id)) return;
    intakeRestoredForRef.current.add(effProject.id);
    const loaded = loadIntakeContext(effProject.id);
    if (!loaded.ok) return;
    const draftRec = peekPersistedDraft(effProject.id);
    const linkedToDraft =
      !!loaded.generatedDraftId && !!draftRec && draftRec.draftId === loaded.generatedDraftId;
    if (!shouldRestoreIntakeSnapshot(loaded, draftRec)) return;
    restoreUniversalContext(loaded.ctx, effProject.id);
    if (!loaded.generatedDraftId) setAwaitingConcept(true);
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: linkedToDraft
          ? `Konteks proyek ${loaded.ctx.primary?.label ?? 'ini'} dipulihkan bersama draftnya dari sesi sebelumnya — spesifikasi, jawaban kuesioner, dan riwayat budget tetap berlaku untuk pertanyaan lanjutan dan revisi draft.`
          : `Konteks proyek ${loaded.ctx.primary?.label ?? 'ini'} dipulihkan dari sesi sebelumnya — spesifikasi dan jawaban kuesioner yang sudah Anda berikan tetap berlaku. Lanjutkan lewat chat seperti biasa.`,
        ts: Date.now(),
      },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effProject?.id]);

  /* ---- GATE 4 (5D) — konsumsi lampiran DED ----
   * Dijalankan sesudah percakapan siap (efek ini dideklarasikan
   * SESUDAH efek pemulihan intake di atas, sehingga konteks snapshot
   * sudah pulih saat dimensi dibaca) + saat entry AI tiba selagi view
   * ter-mount. Satu lampiran dikonsumsi SEKALI (penjaga `consumedAt`
   * di storage + `dedConsumeAttemptedRef` per sesi): spek DED masuk
   * konteks intake hidup (bila ada — TANPA konteks hidup, spek
   * menunggu di lampiran dan digabung saat draft disusun lewat
   * universalResultFor; tidak ada konteks yang dibuat diam-diam
   * hanya untuk DED), konflik + rekonsiliasi QTO dihitung vs dimensi
   * user saat ini, harga item tanpa harga di-resolver (kanonis,
   * lokal), lalu pesan umpan balik berlabel diposting + tombol
   * koreksi QTO yang menunggu. Kegagalan konsumsi (lampiran rusak,
   * resolver gagal) tidak pernah menggagalkan chat — pesan tetap
   * diposting dengan bagian yang berhasil, atau dilewati jujur. */
  const consumeDedAttachment = useCallback(() => {
    if (!effProject || !conversationReady) return;
    let att: DedAttachment | null = null;
    try {
      att = loadDedAttachment(effProject.id);
    } catch {
      return;
    }
    if (!att || att.consumedAt) return;
    const attemptKey = `${effProject.id}:${att.jobId}:${att.receivedAt}`;
    if (dedConsumeAttemptedRef.current.has(attemptKey)) return;
    dedConsumeAttemptedRef.current.add(attemptKey);
    const liveCtx = getUniversalContextState();
    const understanding = dedSpecsFromAttachment(att);
    const dedSpecs = sanitizeDedSpecs(understanding.specs);
    if (liveCtx) {
      liveCtx.dedSpecs = dedSpecs;
    }
    const dims = dimsFromIntakeContext(liveCtx);
    const conflicts = detectDedSpecConflicts(dedSpecs, {
      lengthM: dims.lengthM,
      widthM: dims.widthM,
      heightM: dims.heightM,
      buildingAreaM2: dims.buildingAreaM2,
    });
    const { checks } = reconcileDedQto(att, dims);
    const proposals = pendingQtoCorrections(att, checks);
    let priceReview: { reviews: DedPriceReview[]; unreviewedCount: number } = { reviews: [], unreviewedCount: 0 };
    try {
      priceReview = resolveDedItemPrices(att);
    } catch {
      /* harga tetap unresolved — pesan tetap diposting */
    }
    // Tandai dikonsumsi SEBELUM memposting (idempotensi sesi +
    // antar-mount); gagal simpan tidak menggagalkan pesan (penjaga
    // ref sesi tetap mencegah duplikasi di sesi ini).
    saveDedAttachment({ ...att, consumedAt: new Date().toISOString() });
    const actions: ChatActionButton[] = [];
    for (const p of proposals) {
      actions.push(
        { label: `Terima koreksi QTO: ${p.description}`, action: { kind: 'qto-correction-confirm', correctionId: p.id } },
        { label: `Tolak koreksi QTO: ${p.description}`, action: { kind: 'qto-correction-reject', correctionId: p.id } },
      );
    }
    appendLocalAssistant(
      formatDedFeedbackLines({ attachment: att, understanding, userDims: dims, conflicts, checks, proposals, priceReview }).join('\n'),
      actions.length > 0 ? actions : undefined,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effProject, conversationReady]);
  useEffect(() => {
    consumeDedAttachment();
  }, [consumeDedAttachment]);
  useEffect(() => {
    const onEntry = () => consumeDedAttachment();
    window.addEventListener('ezrab:ai-entry', onEntry);
    return () => window.removeEventListener('ezrab:ai-entry', onEntry);
  }, [consumeDedAttachment]);

  /* ---- Asisten AI: operasi spreadsheet (pratinjau → konfirmasi → eksekusi) ----
   * Tool propose_* hanya membuat plan dari snapshot; eksekusi berjalan di
   * sini, lewat mutator kanonis ProjectContext yang sama dengan spreadsheet,
   * setelah pengguna menekan tombol Konfirmasi pada kartu pratinjau. */
  const { activeRole, hasCapability } = useRole();
  const [, setPlanTick] = useState(0);
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);
  const projectRef = useRef<typeof effProject>(null);
  projectRef.current = effProject;
  const rawItemsRef = useRef(projectRabItems);
  rawItemsRef.current = projectRabItems;
  const saveStatusRef = useRef(saveStatus);
  saveStatusRef.current = saveStatus;

  useEffect(() => {
    setAssistantOperationContext({
      actor: activeRole?.name ?? 'Peran demo',
      writesEnabled: hasCapability('edit-estimate'),
    });
    return () => setAssistantOperationContext(null);
  }, [activeRole, hasCapability]);

  const buildOperationHost = useCallback((): OperationHost => ({
    projectId: projectRef.current?.id ?? '',
    readItems: () => {
      const p = projectRef.current;
      const snapNow = buildProjectSnapshot(
        p ? { id: p.id, name: p.name, costSummary: (p as unknown as { costSummary?: Record<string, unknown> }).costSummary } : null,
        (rawItemsRef.current ?? []) as unknown as Array<Record<string, unknown>>,
      );
      return snapNow ? snapshotAllItems(snapNow) : [];
    },
    applyUpdateQuantity: (itemId, volume) => updateRabItemFull(itemId, { volume }),
    applyManualUnitPrice: (itemId, price) => updateRabItemUnitPrice(itemId, price),
    applyDelete: (itemIds) => {
      if (itemIds.length === 1) deleteRabItem(itemIds[0]);
      else bulkDeleteRabItems(itemIds);
    },
    applyAdd: (itemData) => {
      const created = bulkAddRabItems([itemData as never]);
      return created?.[0]?.id ?? null;
    },
    createSafetySnapshot: (description) => {
      try {
        return createVersionSnapshot(description)?.id ?? null;
      } catch {
        return null;
      }
    },
    readRawItem: (itemId) => {
      const raw = (rawItemsRef.current ?? []).find((r) => (r as { id?: string }).id === itemId);
      return raw ? ({ ...(raw as unknown as Record<string, unknown>) }) : null;
    },
    persistenceStatus: () => saveStatusRef.current,
  }), [updateRabItemFull, updateRabItemUnitPrice, deleteRabItem, bulkDeleteRabItems, bulkAddRabItems, createVersionSnapshot]);

  const handleConfirmPlan = useCallback(async (planId: string) => {
    const plan = getPlan(planId);
    if (!plan || plan.status !== 'pending') return;
    setBusyPlanId(planId);
    try {
      const res = await executePlan(plan, buildOperationHost());
      const entry: ChatEntry = { role: 'assistant', content: res.message, ts: Date.now() };
      setMessages((prev) => [...prev, entry]);
      persistMessage('assistant', res.message);
    } finally {
      setBusyPlanId(null);
      setPlanTick((t) => t + 1);
    }
    // persistMessage/setMessages stabil per render; deps sengaja minimal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildOperationHost]);

  const handleCancelPlan = useCallback((planId: string) => {
    setPlanStatus(planId, 'cancelled');
    setPlanTick((t) => t + 1);
  }, []);
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
  /* Penanda auto-kirim STT: diisi true HANYA oleh stopListening (tekanan
   * tombol mic/selesai oleh pengguna sendiri). Recognition yang berakhir
   * alami (jeda bicara — continuous=false), karena error, atau unmount
   * TIDAK pernah memasang penanda ini → tidak ada kirim otomatis. */
  const sttAutoSendRef = useRef(false);
  /* Nomor sesi dikte — dinaikkan setiap toggleMic memulai sesi baru.
   * onend dari sesi lama yang tiba SETELAH sesi baru dimulai (klik
   * start/stop cepat) harus diabaikan total: ref teks & penanda kini
   * milik sesi baru, dan end basi tidak boleh mengirim apa pun. */
  const sttSessionRef = useRef(0);

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
          // D-50: gelembung tidak pernah menampilkan token routing
          // internal dari pesan lama yang tersimpan bersama token.
          content: stripQuickActionToken(m.content),
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
          // D-50: gelembung tidak pernah menampilkan token routing
          // internal dari pesan lama yang tersimpan bersama token.
          content: stripQuickActionToken(m.content),
          ts: m.createdAt ? Date.parse(m.createdAt) || Date.now() : Date.now(),
        }));
      setMessages(restored);
    } catch {
      /* non-fatal — tampilan saat ini dipertahankan */
    }
  };

  const deleteHistoryItem = (id: string) => {
    // D-48: mutasi hapus TIDAK BERUBAH — yang berubah hanya pemanggilnya
    // (tombol tong sampah kini membuka dialog konfirmasi dulu; fungsi
    // ini hanya dipanggil dari tombol "Hapus" dialog). Guard busy tetap.
    if (busy) return;
    try {
      const wasActive = convIdRef.current === id;
      unifiedConversationStore.deleteConversation(id, storeProjectId);
      // Lepas record eksekusi percakapan yang dihapus (menolak bila ada
      // eksekusi yang masih berjalan — recordnya dipertahankan).
      releaseConversation(id);
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
    // F-6B: penanda penggantian error milik SATU percobaan retry —
    // dibersihkan di awal setiap pengiriman agar tidak pernah bocor ke
    // pengiriman yang tidak terkait; cabang echo=false di bawah
    // mengisinya kembali bila pengiriman ini memang sebuah retry.
    retryReplacesMessageIdRef.current = null;
    // FASE 2 — ekstraksi memori deterministik di AWAL submit (sebelum
    // cabang routing apa pun): koreksi/budget/preferensi/keputusan
    // eksplisit dari pesan ini terekam sebagai memori — termasuk bila
    // pesan ditangani jalur revisi deterministik atau jawaban lokal
    // (yang tidak pernah mencapai service.send). Deterministik saja
    // (tanpa LLM, tanpa karangan); gagal memori ≠ gagal kirim.
    // Idempoten: kirim ulang ("Coba Lagi") dengan nilai sama hanya
    // menyegarkan lastAccessedAt record yang sama.
    try {
      if (msg && effProject) {
        const memoryScope: MemoryScope = { userId: null, projectId: effProject.id, conversationId: convIdRef.current ?? null };
        const candidates = extractMemoryCandidates(msg, memoryScope, null);
        if (candidates.length > 0) {
          ingestMemoryCandidates(candidates, memoryScope, 'pesan pengguna (Chat AI)');
        }
      }
    } catch {
      /* ekstraksi memori tidak boleh menggagalkan kirim */
    }
    // Handoff lanjutan (§7): pada presentasi Magic AI, sinyal
    // kompleksitas nyata memunculkan TAWARAN (tidak memaksa) untuk
    // melanjutkan di tampilan Chat AI — state percakapan yang sama.
    if (presentationMode === 'magic' && !handoffOfferedRef.current && msg) {
      // F3-R2: teruskan opts ke detectHandoffNeed — lantai dari
      // penyebutan di pesan ini (parseFloorsMention, lapisan bersama)
      // dengan konteks intake yang hidup sebagai fallback, dan jumlah
      // lampiran sesi ini (slot lampiran tunggal: 0/1).
      const handoffCtx = getUniversalContextState();
      const need = detectHandoffNeed(msg, {
        floors: parseFloorsMention(msg) ?? handoffCtx?.floors ?? null,
        attachmentCount: attached ? 1 : 0,
      });
      if (need.needed && need.reason) {
        handoffOfferedRef.current = true;
        setHandoffOffer(need.reason);
      }
    }
    // Timing terpusat: minimum dihitung SEJAK kirim ditekan (bukan sejak
    // provider selesai) — lihat aiResponseTiming.ts.
    const timingStart = Date.now();
    // Eksekusi persisten (lifecycle fix 2026-11-12): eksekusi dibuat LAZY
    // — hanya saat pekerjaan yang butuh kelangsungan benar-benar dimulai
    // (gateWait / pengiriman AI). Return awal (mis. dialog kredit) tidak
    // membuat eksekusi. Signal & token keaktualan milik runtime, bukan
    // komponen: cleanup unmount TIDAK PERNAH meng-abort-nya.
    let exec: AiExecutionHandle | null = null;
    let cancelNoted = false;
    const ensureExec = (): AiExecutionHandle => {
      if (!exec) {
        const convId = convIdRef.current
          ?? unifiedConversationStore.getOrCreateActiveConversation(storeProjectId).id;
        exec = beginExecution(convId, storeProjectId);
      }
      return exec;
    };
    const endExec = (outcome: 'completed' | 'failed' = 'completed', error?: string) => {
      if (!exec) return;
      finishExecution(exec.record.requestId, outcome, error);
      exec = null;
    };
    // Penanda pembatalan eksplisit (satu kali per submit): bila pengguna
    // menekan Berhenti, catat "Permintaan dibatalkan." sebagai pesan
    // asisten (riwayat tetap jujur) — bukan diam seperti abort lama.
    const noteCancelledIfNeeded = () => {
      if (!exec || cancelNoted) return;
      const rec = getExecution(exec.record.requestId);
      if (rec?.status !== 'cancelled') return;
      cancelNoted = true;
      const text = 'Permintaan dibatalkan.';
      setMessages((prev) => [...prev, { role: 'assistant', content: text, ts: Date.now() }]);
      persistMessage('assistant', text);
    };
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
    // FASE 3 — objektif + rencana tugas (agentOrchestrator): diturunkan
    // dari pesan + intent deterministik; rencana dipersist per proyek/
    // percakapan. Gagal rencana ≠ gagal kirim.
    let objectiveSectionForSend: string | undefined;
    const preRouted = routeIntent(msg);
    try {
      if (msg && effProject) {
        const objective = deriveObjective(msg, preRouted.intent);
        objectiveSectionForSend = formatObjectiveSection(objective);
        const existing = loadActivePlanForProject(effProject.id, convIdRef.current ?? null);
        if (!existing) {
          setAgentPlanTracked(buildPlanForObjective(objective, { userId: null, projectId: effProject.id, conversationId: convIdRef.current ?? null }));
        } else if (existing.objective.goal !== objective.goal) {
          // Arah berubah: replan aman — langkah sukses dipertahankan
          // oleh replanForNewObjective; bila batas iterasi tercapai,
          // rencana lama dipertahankan apa adanya.
          const replanned = replanForNewObjective(existing, objective);
          if (replanned.ok) setAgentPlanTracked(replanned.plan);
        }
      }
    } catch {
      /* rencana gagal ≠ kirim gagal */
    }
    const needsAi = forcedAi || (!(preRouted.localOnly && preRouted.intent !== 'UNKNOWN') && !preRouted.needsClarification);
    // Gerbang saldo memakai estimasi reservation berbasis token
    // (riwayat + pesan ini + tunjangan token keluar) — bukan tarif flat.
    const reservationEstimate = estimateReservationCredits(
      [...messages.map((m) => m.content), msg].join('\n'),
    );
    if (needsAi && !navHit && balance.total < reservationEstimate) {
      // Saldo simulasi tidak cukup → dialog konfirmasi (bukan blokir diam-diam).
      setCreditConfirm({
        estimate: reservationEstimate,
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
    // D-46: pesan terkirim → draft percakapan ini dihapus (tidak bangkit
    // lagi sesudah navigasi). Cabang echo=false (Coba Lagi) TIDAK
    // menghapus draft yang sedang diketik pengguna.
    if (echo) clearDraftNow();
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
      let removedAiError = false;
      for (let i = cleaned.length - 1; i >= 0; i--) {
        if (cleaned[i].role === 'assistant' && cleaned[i].isError) {
          removedAiError = cleaned[i].fromAi === true;
          cleaned.splice(i, 1);
          break;
        }
      }
      // F-6B: bila yang dibersihkan adalah error pipeline AI, balasan
      // retry ini juga MENGGANTIKAN record tersimpannya (bukan menambah
      // entry baru di samping error lama) — persistMessage asisten
      // pertama sesudah ini memakai id tersebut. Error lokal
      // registry/push tidak pernah diganti (bukan milik jalur retry).
      if (removedAiError && lastAiErrorMessageIdRef.current) {
        retryReplacesMessageIdRef.current = lastAiErrorMessageIdRef.current;
      }
      lastAiErrorMessageIdRef.current = null;
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
    // provider, bukan sesudahnya); false = dibatalkan eksplisit atau
    // disalip permintaan yang lebih baru → hasil TIDAK ditampilkan.
    // Signal milik runtime: navigasi TIDAK membatalkan gerbang ini.
    // RAB (owner 2026-10-27): minimum 5–10 detik dari BESARNYA HASIL,
    // bukan dari prompt — jadi gateWait menerima teks balasan dan
    // menghitung rabMinDelayMs dari situ. Non-RAB tetap 1/2/3 detik.
    const gateWait = async (resultText?: string): Promise<boolean> => {
      const h = ensureExec();
      try {
        const minMs = timingActivity === 'rab' ? rabMinDelayMs(resultText ?? '') : timingMinDelay;
        await waitForMinimum(timingStart, minMs, Promise.resolve(), h.signal);
      } catch (e) {
        if (isAbortError(e)) return false;
        throw e;
      }
      return h.isCurrent();
    };
    // Satu-satunya jalan menampilkan balasan asisten di cabang-cabang
    // lokal/revisi di bawah (LLM memakai gerbang langsung karena
    // entrinya membawa field tambahan fromAi/model/creditsUsed).
    const postAssistant = async (content: string, actions?: ChatActionButton[], questionnaire?: QuestionnairePayload): Promise<boolean> => {
      if (!(await gateWait(content))) {
        // Gerbang gagal: bila penyebabnya pembatalan eksplisit pengguna,
        // catat penandanya; bila disalip permintaan baru, diam (perilaku
        // lama). Apa pun itu, eksekusi ini berakhir di sini (finish pada
        // record 'cancelled' adalah no-op yang aman).
        noteCancelledIfNeeded();
        endExec();
        return false;
      }
      setMessages((prev) => [...prev, { role: 'assistant', content, ts: Date.now(), actions, questionnaire }]);
      persistMessage('assistant', content);
      // FASE 3 — kartu kuesioner ditampilkan → langkah pengumpulan spek
      // rencana berjalan (menunggu jawaban pengguna, bukan sukses).
      if (questionnaire) {
        updateAgentPlan((p) => ({
          ...p,
          steps: p.steps.map((s) => (s.kind === 'collect-specs-questionnaire' && s.status !== 'succeeded'
            ? { ...s, status: 'running' as const, result: 'Kuesioner ditampilkan — menunggu jawaban Anda.', startedAt: s.startedAt ?? new Date().toISOString() }
            : s)),
        }));
      }
      // §2 autosave: balasan terkirim = titik commit draft (dibuat/
      // direvisi lewat jalur deterministik sebelum balasan ini);
      // idempoten di lapisan persistensi → tanpa tulis bila tak berubah.
      persistActiveDraft('autosave');
      endExec();
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
        persistActiveDraft('autosave');
        setAwaitingSubtype(false);
        setBusy(false);
        return;
      }
      setAwaitingSubtype(false);
    }
    /* ---- Gerbang klarifikasi material (2026-11-10): jawaban atas
     * pertanyaan bahan ("Bahan rangka & penutup atapnya apa?") ----
     * Selama gerbang aktif, pesan yang menyebut bahan (klik diketik),
     * bahan tanpa template, atau afirmasi ("itu aja" → draft dengan
     * asumsi terbuka) dijawab lokal lewat tryContinueRabMaterial —
     * BUKAN dilempar ke AI. Pesan lain (perintah baru) menggugurkan
     * status menunggu dan diproses normal di bawah. */
    if (!forcedAi && awaitingMaterial) {
      const matRes = tryContinueRabMaterial(msg);
      if (matRes) {
        const acts = matRes.actions && matRes.actions.length > 0 ? matRes.actions : undefined;
        setMessages((prev) => [...prev, { role: 'assistant', content: matRes.message, ts: Date.now(), actions: acts }]);
        persistMessage('assistant', matRes.message);
        persistActiveDraft('autosave');
        setAwaitingMaterial(matRes.awaitRabMaterial === true);
        setBusy(false);
        return;
      }
      setAwaitingMaterial(false);
    }
    /* ---- Intake konteks proyek (Conversational Intelligence 2026-11-10):
     * jawaban atas pertanyaan konsep/fasilitas/kondisi landscape ----
     * Selama intake aktif, jawaban teks bebas (konsep disebut, fasilitas
     * ditambah, lokasi/koreksi luas disebut, afirmasi "itu aja") digabung
     * ke konteks proyek terstruktur lewat tryContinueProjectContext —
     * BUKAN dilempar ke AI dan BUKAN me-restart alur. Pesan yang bukan
     * jawaban (perintah baru) menggugurkan status menunggu di registry
     * (hasil null) dan diproses normal di bawah. */
    if (!forcedAi && awaitingConcept) {
      const ctxRes = tryContinueProjectContext(msg) ?? tryContinueUniversalContext(msg);
      if (ctxRes) {
        const acts = ctxRes.actions && ctxRes.actions.length > 0 ? ctxRes.actions : undefined;
        setMessages((prev) => [...prev, { role: 'assistant', content: ctxRes.message, ts: Date.now(), actions: acts, questionnaire: ctxRes.questionnaire }]);
        persistMessage('assistant', ctxRes.message);
        // GATE 1 (5A) — titik commit draft: generate via afirmasi di
        // cabang ini membangun draft di registry; tanpa autosave di sini
        // draft hanya hidup in-memory dan hilang saat reload (cabang
        // subtipe/material di bawah sudah memanggilnya — cabang ini
        // yang tertinggal). Idempoten di lapisan persistensi.
        persistActiveDraft('autosave');
        setAwaitingConcept(ctxRes.awaitProjectConcept === true);
        setBusy(false);
        return;
      }
      setAwaitingConcept(false);
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
    /* ---- Finalisasi & refinement sesi kebutuhan (perbaikan overhaul
     * 2026-11-06): selama sesi kebutuhan RAB aktif, frasa penutup
     * ("itu aja") menyusun draft nyata dan jawaban berbentuk kebutuhan
     * digabung ke state — keduanya TIDAK bocor ke pipeline LLM hanya
     * karena flag awaitingNeeds (yang kini juga disetel ringkasan
     * pertama) sedang tidak aktif. Perintah baru berbentuk perintah
     * tidak tertangkap looksLikeNeedsAnswer dan diproses normal. */
    if (!forcedAi && hasActiveRabNeeds()) {
      const fin = continueRabFinalize(msg);
      if (fin) {
        try {
          const acts = fin.actions && fin.actions.length > 0 ? fin.actions : undefined;
          await postAssistant(fin.message, acts);
          if (fin.awaitRabNeeds) setAwaitingNeeds(true);
        } finally {
          setBusy(false);
        }
        return;
      }
      if (!awaitingNeeds && looksLikeNeedsAnswer(msg)) {
        try {
          const res = continueRabNeeds(msg);
          const acts = res.actions && res.actions.length > 0 ? res.actions : undefined;
          await postAssistant(res.message, acts);
          if (res.awaitRabNeeds) setAwaitingNeeds(true);
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
            activeProject: effProject,
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
    /* ---- GATE 3 (5C) — riwayat & perbandingan versi (perintah teks) ----
     * Lokal penuh, tanpa AI/kredit. Ditempatkan SEBELUM cabang revisi
     * karena "bandingkan versi …" bukan revisi (tidak mengubah draft). */
    if (!forcedAi && effProject) {
      const compareM = msg.match(/bandingkan versi\s*(\d+)\s*(?:dan|dengan|vs\.?|sama)\s*(?:versi\s*)?(\d+)/i);
      if (compareM) {
        await postAssistant(compareStoredVersions(effProject.id, Number(compareM[1]), Number(compareM[2])));
        setBusy(false);
        return;
      }
      if (/^\s*(riwayat versi|lihat riwayat|riwayat revisi)\s*[?.!]*\s*$/i.test(msg)) {
        await postAssistant(formatVersionHistoryMessage(effProject.id));
        setBusy(false);
        return;
      }
    }
    /* ---- GATE 4 (5D) — revisi spek DED (pratinjau + konfirmasi) ----
     * Perintah deterministik: "ubah panjang DED jadi 12 m" /
     * "panjang DED seharusnya 12 m". Ditempatkan SEBELUM cabang revisi
     * Gate 3 karena pola ini juga cocok dengan
     * looksLikeUniversalRevision — revisi spek DED BUKAN revisi draft
     * (nilai DED asli tetap tersimpan; yang berubah adalah jawaban
     * user yang menimpa spek DED). Pratinjau disimpan di
     * pendingDedSpecRevisionsRef (memori sesi saja); konfirmasi lewat
     * tombol ded-spec-confirm/reject. Tanpa DED terlampir / tanpa spek
     * DED untuk kunci itu: dijawab jujur, tidak ada yang berubah. */
    if (!forcedAi && effProject) {
      const dedRev = parseDedSpecRevisionCommand(msg);
      if (dedRev) {
        const liveCtx = getUniversalContextState();
        const att = loadDedAttachment(effProject.id);
        const dedSpecs = (liveCtx?.dedSpecs?.length ?? 0) > 0
          ? liveCtx!.dedSpecs
          : att
            ? sanitizeDedSpecs(dedSpecsFromAttachment(att).specs)
            : [];
        const built = buildDedSpecRevisionPreview(dedSpecs, dedRev.key, dedRev.value);
        if (!built.ok || !built.preview) {
          await postAssistant(built.message);
          setBusy(false);
          return;
        }
        pendingDedSpecRevisionsRef.current.set(built.preview.id, built.preview);
        await postAssistant(formatDedSpecRevisionPreviewMessage(built.preview), [
          { label: 'Konfirmasi revisi spek DED', action: { kind: 'ded-spec-confirm', previewId: built.preview.id } },
          { label: 'Batalkan revisi spek DED', action: { kind: 'ded-spec-reject', previewId: built.preview.id } },
        ]);
        setBusy(false);
        return;
      }
    }
    /* ---- GATE 3 (5C) — konfirmasi / batal pratinjau revisi yang menunggu ----
     * Afirmasi singkat ("ya", "aktifkan") = konfirmasi eksplisit aktivasi;
     * penolakan singkat ("tidak", "batal") = buang pratinjau. Pesan lain
     * saat pratinjau menunggu DITANGANI cabang revisi di bawah (ditolak
     * jujur — putuskan dulu pratinjau yang menunggu). */
    if (!forcedAi && pendingRevisionRef.current) {
      const pending = pendingRevisionRef.current;
      if (isAffirmativeConfirmation(msg)) {
        const res = runRevisionActivation(pending);
        await postAssistant(res.message, res.actions);
        setBusy(false);
        return;
      }
      if (isNegativeConfirmation(msg)) {
        pendingRevisionRef.current = null;
        await postAssistant(
          `Revisi dibatalkan — versi aktif tetap versi ${pending.baseVersion}, tidak berubah. Pratinjau dibuang.`,
        );
        setBusy(false);
        return;
      }
    }
    /* ---- Revisi draft universal (2026-10-26; GATE 3 / 5C 2026-11-12) ----
     * Bila draft universal aktif dan pesan ini perintah revisi (bukan
     * permintaan RAB baru / navigasi), buat PRATINJAU revisi lokal tanpa
     * AI dan tanpa kredit — revisi TIDAK langsung diterapkan. Draft aktif
     * tidak berubah sampai pengguna mengaktifkan pratinjau secara
     * eksplisit (tombol "Aktifkan revisi" / teks "ya"). Revisi yang
     * tidak dikenali jatuh ke routing normal di bawah (tidak ditelan).
     * Revisi baru saat satu pratinjau menunggu DITOLAK jujur (putuskan
     * dulu) — pratinjau tidak pernah ditimpa diam-diam. */
    if (!forcedAi && getLastUniversalDraft(effProject?.id) && looksLikeUniversalRevision(msg)) {
      const draftRev = getLastUniversalDraft(effProject?.id)!;
      if (pendingRevisionRef.current) {
        const p = pendingRevisionRef.current;
        await postAssistant(
          `Masih ada pratinjau revisi yang menunggu konfirmasi (versi ${p.baseVersion} → ${p.targetVersion}: ${p.changes.join('; ')}). ` +
            `Aktifkan atau batalkan dulu sebelum meminta revisi baru — pratinjau tidak ditimpa diam-diam.`,
          [
            { label: `Aktifkan revisi (versi ${p.targetVersion})`, action: { kind: 'revision-confirm' } },
            { label: 'Batalkan revisi', action: { kind: 'revision-cancel' } },
          ],
        );
        setBusy(false);
        return;
      }
      const outcome = buildRevisionPreview(draftRev, msg, effProject?.id ?? null);
      if (outcome.kind === 'unrecognized') {
        // Bukan revisi yang dikenali — jatuh ke routing normal di bawah.
      } else if (outcome.kind === 'clarification' || outcome.kind === 'rejected') {
        await postAssistant(outcome.message);
        setBusy(false);
        return;
      } else {
        pendingRevisionRef.current = outcome.preview;
        await postAssistant(formatRevisionPreviewMessage(outcome.preview), [
          { label: `Aktifkan revisi (versi ${outcome.preview.targetVersion})`, action: { kind: 'revision-confirm' } },
          { label: 'Batalkan revisi', action: { kind: 'revision-cancel' } },
          { label: 'Riwayat versi', action: { kind: 'revision-history' } },
        ]);
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
          activeProject: effProject,
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
          if (res.awaitRabMaterial) setAwaitingMaterial(true);
          if (res.awaitProjectConcept) setAwaitingConcept(true);
          if (res.awaitClarify) setAwaitingClarify(res.awaitClarify);
          // Action buttons — attached to the assistant message
          const entryActions = res.actions && res.actions.length > 0 ? res.actions : undefined;
          const delivered = await postAssistant(reply, entryActions, res.questionnaire);
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
    // Eksekusi persisten (lifecycle fix 2026-11-12): signal milik runtime
    // — navigasi tidak meng-abort fetch yang sedang berjalan; hasil yang
    // tiba sesudah navigasi tetap ditulis ke store dan terlihat saat kembali.
    const llmExec = ensureExec();
    try {
      // Provider berjalan PARALEL dengan timer minimum (dihitung sejak
      // kirim): hasil cepat menunggu sisa minimum, hasil lambat tidak
      // ditambah delay. RAB: minimum 5–10 detik dari besarnya hasil
      // (waitForRabMinimum), bukan 3 detik complex.
      const planIdsBeforeSend = new Set(listPendingPlans().map((p) => p.id));
      // FASE 1 — konteks terstruktur ke builder kanonis: intake + draft
      // aktif + ringkasan percakapan tersimpan (per conversationId).
      // Alur revisi pasca-generate TIDAK diubah: konteks intake tetap
      // dikosongkan sesudah draft nyata tersusun (keputusan owner terbuka).
      const intakeCtxForSend = getUniversalContextState();
      const activeDraftForSend = getLastUniversalDraft(effProject?.id);
      // GATE 4 (5D) — seksi DED/QTO ke builder kanonis (plumbing Fase 5
      // yang sebelumnya tidak punya pemanggil produksi): bila ada DED
      // terlampir di proyek ini, dedSection selalu dikirim (spek +
      // data hilang); qtoSection hanya bila dimensi user tersedia
      // (tanpa dimensi, semua check CANNOT_CHECK — tidak berguna di
      // prompt). Kegagalan apa pun tidak pernah menggagalkan kirim.
      let dedSectionForSend: string | undefined;
      let qtoSectionForSend: string | undefined;
      try {
        const attForSend = effProject ? loadDedAttachment(effProject.id) : null;
        if (attForSend) {
          dedSectionForSend = buildDedSection(attachmentToDedOutput(attForSend));
          const dimsForSend = dimsFromIntakeContext(intakeCtxForSend);
          const hasDimsForSend =
            dimsForSend.lengthM != null || dimsForSend.widthM != null ||
            dimsForSend.buildingAreaM2 != null || dimsForSend.depthM != null;
          if (hasDimsForSend) {
            qtoSectionForSend = buildQtoSection(reconcileDedQto(attForSend, dimsForSend).checks);
          }
        }
      } catch {
        dedSectionForSend = undefined;
        qtoSectionForSend = undefined;
      }
      const storedSummaryForSend = convIdRef.current
        ? unifiedConversationStore.getConversationSummary(convIdRef.current, storeProjectId)
        : null;
      // FASE 2 — memori terstruktur ke builder kanonis: spek v2
      // terkonfirmasi dari konteks intake ikut diekstrak sebagai memori
      // proyek (ASSUMPTION tetap user-assumption), lalu retrieval
      // ter-skop proyek + gerbang personalisasi. Ekstraksi pesan sudah
      // dilakukan di awal submit (semua jalur); di sini hanya retrieval
      // + spek. Kegagalan memori TIDAK PERNAH menggagalkan kirim.
      let memorySectionForSend: string | undefined;
      let memoryReportForSend: ReturnType<typeof retrieveMemories>['report'] | undefined;
      try {
        if (effProject) {
          const memoryScope: MemoryScope = { userId: null, projectId: effProject.id, conversationId: convIdRef.current ?? null };
          const specCands = extractSpecMemories(intakeCtxForSend?.structuredSpecs ?? [], memoryScope, null);
          if (specCands.length > 0) {
            ingestMemoryCandidates(specCands, memoryScope, 'structuredSpecs v2 (Chat AI)');
          }
          const prefsForSend = getPreferences(null);
          const retrieved = retrieveMemories(memoryScope, msg);
          const gated = applyPersonalizationGate(retrieved.selected, prefsForSend);
          const prefLines = formatPreferenceLines(prefsForSend);
          const memText = formatMemorySection(gated);
          const combined = [...prefLines, ...(memText ? [memText] : [])].join('\n');
          memorySectionForSend = combined || undefined;
          memoryReportForSend = retrieved.report;
        }
      } catch {
        memorySectionForSend = undefined;
        memoryReportForSend = undefined;
      }
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
        projectId: effProject?.id,
        conversationId: convIdRef.current ?? undefined,
        userId: null, // tanpa identitas hari ini (AUTH_ENABLED=false) — dinyatakan, bukan dikarang
        projectSnapshot,
        intakeContext: intakeCtxForSend ?? undefined,
        draftSummary: activeDraftForSend
          ? {
              title: activeDraftForSend.title,
              version: activeDraftForSend.version,
              partCount: activeDraftForSend.parts.length,
              itemCount: effectiveItems(activeDraftForSend).length,
              warnings: activeDraftForSend.warnings?.slice(0, 3),
            }
          : undefined,
        storedSummary: storedSummaryForSend ?? undefined,
        memorySection: memorySectionForSend ?? undefined,
        memoryReport: memoryReportForSend ?? undefined,
        objectiveSection: objectiveSectionForSend ?? undefined,
        // GATE 4 (5D): seksi DED/QTO dari lampiran DED proyek ini
        // (plumbing Fase 5 — sebelumnya tidak pernah diisi pemanggil
        // produksi; tanpa lampiran, keduanya undefined = perilaku lama).
        dedSection: dedSectionForSend ?? undefined,
        qtoSection: qtoSectionForSend ?? undefined,
        // GATE 1 (5A) — satu kunci idempotensi per pengiriman, dipakai
        // BERSAMA oleh record eksekusi runtime dan panggilan provider
        // (sebelumnya service membuat kunci baru sendiri, sehingga kunci
        // di record runtime tidak pernah sampai ke provider). Retry
        // sesudah INTERRUPTED membuat eksekusi BARU dengan kunci baru —
        // retry memang permintaan baru (yang lama sudah mati); duplikasi
        // dicegah oleh tanpa-auto-resubmit + satu record draft per proyek.
        idempotencyKey: llmExec.record.idempotencyKey,
        // §8 (2026-11-11): sinyal yang menggerbangi timing kini diteruskan
        // ke lapisan fetch providerClient. Sejak lifecycle fix, sinyal ini
        // milik executionRuntime — hanya pembatalan eksplisit pengguna
        // (tombol Berhenti) yang meng-abort-nya, bukan unmount.
        signal: llmExec.signal,
        // P2 (2026-11-13): tahap eksekusi nyata dari service (konteks →
        // model → tool call) diteruskan ke record runtime eksekusi ini —
        // gelembung thinking menampilkannya lewat langganan yang sudah
        // ada (tanpa langganan baru). Emisi sesudah cancel adalah no-op
        // di runtime (record terminal), jadi tidak ada tahap yang
        // tercatat sesudah pembatalan.
        onStage: (stage: ExecutionStage) => { emitExecutionStage(llmExec.record.requestId, stage); },
      } as any);
      const res = timingActivity === 'rab'
        ? await waitForRabMinimum(timingStart, sendPromise, llmExec.signal, (r: any) => r?.reply ?? '')
        : await waitForMinimum(timingStart, timingMinDelay, sendPromise, llmExec.signal);
      // Hasil basi (disalip permintaan baru) tidak ditampilkan dan
      // tidak didebit — minimum sudah terpenuhi oleh gerbang
      // di atas, jadi di sini hanya cek keaslian.
      // S8 (2026-11-13, ARS-08): isCurrent() kini false JUGA untuk
      // eksekusi yang dibatalkan (bukan hanya disalip) — tanpa ini,
      // cancel yang tiba sesudah minimum berlalu (jendela umum tombol
      // Berhenti: provider masih berjalan, waitForMinimum sudah tidak
      // mendengarkan sinyal) lolos ke bawah dan menampilkan pesan
      // GAGAL untuk pembatalan pengguna. Bedakan keduanya: pembatalan
      // eksplisit dicatat jujur sebagai "Permintaan dibatalkan."
      // (noteCancelledIfNeeded no-op bila status bukan cancelled),
      // eksekusi yang disalip tetap diam seperti sebelumnya.
      if (!llmExec.isCurrent()) { noteCancelledIfNeeded(); endExec(); return; }
      // --- AI Credits: settlement SIMULASI berbasis token (Amendemen v1.1) ---
      // FASE 1 RECOVERY (P1-2): debit HANYA bila send() sukses tegas
      // (res.success === true) — kegagalan gateway/HTTP/timeout/respons
      // tidak valid tidak boleh mengurangi saldo. Gerbang tunggal:
      // debitChatCreditOnSuccess (chatCreditDebit.ts, teruji regresi).
      // Besaran debit BUKAN lagi tarif flat: dihitung dari token masuk
      // (teks percakapan yang benar-benar dikirim) + token keluar (teks
      // jawaban), 1 kredit per 200 token terbobot (tokenMetering.ts).
      // Token provider tidak mencapai klien, jadi pada simulasi ini
      // token DIESTIMASI dari teks dan dilabeli estimasi — bukan usage
      // provider. Label kredit di balon hanya tampil bila debitnya
      // benar-benar tercatat (consume mengembalikan true).
      const sentInputText = [...next.slice(0, -1).map((m) => m.content), content].join('\n');
      const metered = meterTexts(sentInputText, res.reply ?? '');
      const simUsed = metered.credits;
      let charged = false;
      debitChatCreditOnSuccess(res, () => {
        charged = consume('chat-ai', simUsed, `Chat AI (${mode === 'fast' ? 'Cepat' : 'Mendalam'}): ${msg.slice(0, 60)} · ±${metered.tokensIn.toLocaleString('id-ID')} token masuk, ±${metered.tokensOut.toLocaleString('id-ID')} token keluar (estimasi simulasi)`, {
          model: mode === 'fast' ? 'FAST' : 'ADVANCED',
          tokensIn: metered.tokensIn,
          tokensOut: metered.tokensOut,
          weightedTokens: metered.weightedTokens,
        });
      });
      // Plan operasi yang dibuat tool propose_* selama pengiriman ini:
      // lampirkan kartu konfirmasinya ke balon jawaban (plan pertama) dan
      // sebagai entry tersendiri untuk plan tambahan apa pun.
      const newPlans = listPendingPlans().filter((p) => !planIdsBeforeSend.has(p.id));
      // FASE 7 — Gerbang kualitas respons: verifikasi jawaban LLM
      // SEBELUM ditampilkan, memakai bukti dari state yang sudah ada
      // (draft aktif, konteks intake, snapshot proyek, hasil tool
      // respons ini). Hanya prosa LLM murni yang digerbangi — bila
      // model memanggil tool, jawabannya adalah output tool
      // deterministik (bukan klaim model) sehingga gate dilewati.
      // Bila gate gagal, jawaban DITAHAN dan diganti pesan jujur yang
      // menyebut aturan yang dilanggar — TIDAK PERNAH diperbaiki
      // diam-diam dengan mengarang. Penahanan dilakukan dengan
      // mengganti ISI res.reply (bukan argumen di situs panggilan),
      // agar teks panggilan persistMessage('assistant', res.reply)
      // tetap utuh — pin aiCancellationPropagation #5 memeriksa
      // literal itu sesudah cek llmExec.isCurrent(). Metering di
      // atas (baris ~1954) sudah memakai reply asli sebelum blok
      // ini, sehingga debit kredit tetap atas jawaban asli.
      // Fail-open: pengecualian gate menampilkan jawaban apa adanya
      // + mencatat error (gate adalah lapisan kualitas, bukan batas
      // keamanan — crash gate tidak boleh memblokir chat). Debit
      // kredit TIDAK dibatalkan oleh penahanan: panggilan provider
      // sudah terjadi (simulasi).
      let heldReplyNotice: string | null = null;
      if (res.success && !(res.toolCalls && res.toolCalls.length > 0)) {
        // P2: 'validating' dipancarkan HANYA bila gate benar-benar
        // berjalan (prosa LLM murni — jawaban tool deterministik
        // melewati gate, jadi tidak pernah diklaim tervalidasi).
        emitExecutionStage(llmExec.record.requestId, 'validating');
        try {
          const gateEvidence = buildQualityGateEvidence({
            draft: activeDraftForSend ?? null,
            intake: intakeCtxForSend ?? null,
            snapshot: projectSnapshot ?? null,
            toolResults: res.toolResults ?? [],
            projectId: effProject?.id ?? null,
          });
          const verdict = checkResponseQuality(res.reply ?? '', gateEvidence);
          try {
            console.info('[response-quality-gate]', JSON.stringify({
              passed: verdict.passed,
              checked: verdict.checked,
              notApplicable: verdict.notApplicable,
              violations: verdict.violations.map((v) => v.check),
            }));
          } catch {
            /* logging tidak boleh menggagalkan tampil */
          }
          if (!verdict.passed) {
            heldReplyNotice = formatQualityGateNotice(verdict);
            res.reply = heldReplyNotice;
          }
        } catch (gateErr) {
          try { console.warn('[response-quality-gate] fail-open:', gateErr); } catch { /* abaikan */ }
        }
      }
      // CHAT-08: bila pengiriman gagal, wajah kegagalannya bukan lagi
      // satu kalimat generik — pesan layanan dipertahankan sebagai
      // baris pertama, ditambah panduan + rujukan tombol Coba Lagi
      // (formatAiFailureMessage). Dilakukan dengan mengganti res.reply
      // seperti pola quality-gate di atas, agar teks panggilan
      // persistMessage('assistant', res.reply) tetap utuh.
      if (!res.success) {
        res.reply = formatAiFailureMessage(res.reply, (res as any).errorCode ?? null);
      }
      const assistantEntry: ChatEntry = {
        role: 'assistant',
        content: res.reply,
        isError: !res.success,
        fromAi: true,
        model: (res as any).model,
        ts: Date.now(),
        creditsUsed: res.success && charged ? simUsed : undefined,
        planId: newPlans[0]?.id,
      };
      setMessages((prev) => [...prev, assistantEntry]);
      const persistedReplyId = persistMessage('assistant', res.reply);
      // F-6B: lacak id store error AI ini agar retry dapat menggantikan
      // record tersimpannya; sukses membersihkan pelacak (tidak ada
      // error yang menunggu diganti).
      lastAiErrorMessageIdRef.current = res.success ? null : persistedReplyId;
      for (const extra of newPlans.slice(1)) {
        setMessages((prev) => [...prev, { role: 'assistant', content: extra.previewText, ts: Date.now(), planId: extra.id }]);
        persistMessage('assistant', extra.previewText);
      }
      notificationBus.publish({
        type: heldReplyNotice ? 'error' : res.success ? 'success' : 'error',
        title: heldReplyNotice
          ? 'Jawaban AI ditahan — tidak lolos pemeriksaan kualitas'
          : res.success ? 'Ezrab AI selesai menjawab' : 'Ezrab AI gagal menjawab',
        message: msg.length > 90 ? `${msg.slice(0, 90)}…` : msg,
        link: 'ezrab-ai',
      });
      // P2: 'awaiting-review' HANYA bila pengiriman ini benar-benar
      // menghasilkan rencana operasi yang menunggu konfirmasi pengguna
      // (kartu plan terlampir) — jawaban teks biasa bukan review, dan
      // tidak pernah diklaim demikian. finishExecution('completed')
      // mempertahankan tahap ini (lihat executionRuntime).
      if (res.success && newPlans.length > 0) {
        emitExecutionStage(llmExec.record.requestId, 'awaiting-review');
      }
      endExec(res.success ? 'completed' : 'failed', res.success ? undefined : (res.reply ?? 'AI gagal menjawab'));
    } catch (err: any) {
      // Pembatalan EKSPLISIT pengguna (tombol Berhenti): catat penandanya,
      // bukan diam seperti abort-unmount lama. Error provider tetap
      // menunggu sisa minimum sebelum ditampilkan — dan tidak pernah
      // membuka wizard (cabang ini tidak punya aksi wizard).
      if (isAbortError(err)) {
        noteCancelledIfNeeded();
        endExec();
        return;
      }
      if (!(await gateWait())) { noteCancelledIfNeeded(); endExec(); return; }
      // CHAT-08: wajah kegagalan yang sama seperti cabang !success —
      // pesan error dipertahankan + panduan (tanpa emoji).
      const errMsg = formatAiFailureMessage(err?.message ?? '', (err as any)?.code ?? (err as any)?.errorCode ?? null);
      setMessages((prev) => [...prev, { role: 'assistant', content: errMsg, isError: true, fromAi: true, ts: Date.now() }]);
      const persistedErrId = persistMessage('assistant', errMsg);
      // F-6B: lacak id store error ini agar retry dapat menggantikannya.
      lastAiErrorMessageIdRef.current = persistedErrId;
      notificationBus.publish({
        type: 'error',
        title: 'Ezrab AI mengalami gangguan',
        message: errMsg.length > 140 ? `${errMsg.slice(0, 140)}…` : errMsg,
        link: 'ezrab-ai',
      });
      endExec('failed', errMsg);
    } finally {
      // Jaring pengaman: eksekusi selalu ditutup (idempotent) agar tidak
      // ada record 'generating' yang menggantung sesudah submit selesai.
      endExec();
      setBusy(false);
    }
  };

  /* Cermin submit() versi render terbaru untuk callback yang dibuat
   * sekali dan hidup lebih lama dari render-nya — khususnya
   * recognition.onend (dibuat saat mic dinyalakan; closure submit versi
   * render itu bisa basi: busy/messages sudah berubah). Mengikuti pola
   * projectRef/saveStatusRef di file ini. */
  const submitRef = useRef(submit);
  submitRef.current = submit;

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
  /* ---- Arsitektur AI Terpadu (Opsi A, 2026-11-11): mode presentasi.
   * 'magic' HANYA mengubah presentasi (label header + banner) —
   * percakapan, unifiedConversationStore, draft, dan asosiasi proyek di
   * bawahnya TETAP mesin kanonis yang sama. Karena satu mesin,
   * "handoff" Magic AI ↔ Chat AI adalah ganti presentasi di atas state
   * yang sama: tanpa draft baru, tanpa duplikasi item, tanpa restart. */
  const [presentationMode, setPresentationMode] = useState<'chat' | 'magic'>('chat');
  const [enteredViaMagic, setEnteredViaMagic] = useState(false);
  const [handoffOffer, setHandoffOffer] = useState<string | null>(null);
  const handoffOfferedRef = useRef(false);
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
      if (ezEntry.mode === 'rab-generator') {
        // Entry "Mulai dengan AI" (Magic AI) → presentasi Magic AI di
        // atas percakapan kanonis yang sama.
        setPresentationMode('magic');
        setEnteredViaMagic(true);
      }
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
      // D-46: prefill ikut tersimpan sebagai draft — navigasi sebelum
      // mengirim tidak menghilangkan prompt titipan.
      saveDraftSoon(injectedPrompt.text);
      setInjectedPrompt(null);
      requestAnimationFrame(() => autoresize());
    }
    // Bila input sedang terisi: biarkan draft pengguna; prompt titipan
    // menunggu (tidak dihapus, tidak ditimpa) hingga input dikosongkan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [injectedPrompt, conversationReady, busy, input]);

  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedMdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copiedMdIdx, setCopiedMdIdx] = useState<number | null>(null);
  /* Salin pesan: tombol utama menyalin TEKS BERSIH yang terbaca pengguna
     (markdownToPlainText — tanpa penanda markdown/entitas mentah; tabel
     menjadi baris " | ", matematika terbaca, isi blok kode utuh). Salin
     sumber Markdown adalah aksi TERPISAH yang disengaja (copyMsgMarkdown,
     tombol FileText) bagi yang memang butuh sintaks sumbernya. */
  const writeClipboard = (text: string, onOk: () => void) => {
    /* Tanda centang hanya bila salin BENAR-BENAR berhasil — sebelumnya
       centang tampil juga saat writeText gagal (izin clipboard ditolak,
       konteks non-HTTPS), sehingga pengguna mengira sudah tersalin. */
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(onOk).catch(() => {});
    }
  };
  const copyMsg = (idx: number, text: string) => {
    writeClipboard(markdownToPlainText(text), () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      setCopiedIdx(idx);
      copiedTimerRef.current = setTimeout(() => setCopiedIdx(null), 1500);
    });
  };
  const copyMsgMarkdown = (idx: number, text: string) => {
    writeClipboard(text, () => {
      if (copiedMdTimerRef.current) clearTimeout(copiedMdTimerRef.current);
      setCopiedMdIdx(idx);
      copiedMdTimerRef.current = setTimeout(() => setCopiedMdIdx(null), 1500);
    });
  };

  /* ---------- Transfer spreadsheet terverifikasi (§12 rekonstruksi) ----------
   * Penyisipan item RAB ke Spreadsheet adalah operasi DETERMINISTIK:
   * tidak lewat request percakapan AI, tidak membawa riwayat chat.
   * Payload terstruktur minimal dari mapper ditujukan ke project_id
   * EKSPLISIT (bukan menebak proyek aktif di store). Sukses hanya
   * diklaim sesudah outcome store membuktikan jumlah tersisip per
   * batch terkendali; kegagalan parsial dilaporkan dengan hitungan
   * akurat dan TANPA kwitansi transfer (retry aman lewat dedupe). */
  const insertRabItemsVerified = (
    items: Array<{ description: string; volume: number; unit: string }>,
    projectId: string,
    logCtx: { draftId: string; operation: string; finalizationKey?: string },
  ): {
    records: Array<{ id?: string; priceStatus?: string }>;
    inserted: number;
    total: number;
    verified: boolean;
    duplicateBlocked: boolean;
    errorCode: AiErrorCode | null;
  } => {
    // Kunci finalisasi berlaku untuk KESELURUHAN set (satu panggilan) —
    // membagi set berkunci ke beberapa batch akan membakar kunci di
    // batch pertama dan memblokir sisanya sebagai "duplikat".
    const BATCH = logCtx.finalizationKey ? Math.max(items.length, 1) : 100;
    const records: Array<{ id?: string; priceStatus?: string }> = [];
    let inserted = 0;
    const startedAt = Date.now();
    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH);
      let added: Array<{ id?: string; priceStatus?: string }>;
      try {
        added = bulkAddRabItems(
          batch as never,
          projectId,
          logCtx.finalizationKey ? { finalizationKey: logCtx.finalizationKey } : undefined,
        ) as unknown as Array<{
          id?: string;
          priceStatus?: string;
        }>;
      } catch {
        const err = structuredAiError('SPREADSHEET_TRANSFER_FAILED');
        logAiDiagnostic({
          correlation_id: err.correlationId,
          project_id: projectId,
          draft_id: logCtx.draftId,
          operation: logCtx.operation,
          error_code: err.code,
          duration_ms: Date.now() - startedAt,
          retry_count: 0,
        });
        return { records, inserted, total: items.length, verified: false, duplicateBlocked: false, errorCode: err.code };
      }
      const outcome = typeof getLastBulkAddOutcome === 'function' ? getLastBulkAddOutcome() : null;
      if (outcome?.duplicate) {
        // Set identik sudah pernah diterapkan ke proyek ini (kunci
        // finalisasi store): keadaan tujuan SUDAH tercapai — bukan
        // kegagalan, tetapi juga bukan penyisipan baru. Dilaporkan
        // sebagai duplikat yang diblokir, bukan sukses baru.
        return { records, inserted, total: items.length, verified: true, duplicateBlocked: true, errorCode: null };
      }
      const proven = outcome ? outcome.insertedCount : added.length;
      inserted += proven;
      records.push(...added);
      if (
        (outcome && (outcome.projectMissing || outcome.insertedCount !== batch.length)) ||
        added.length !== batch.length
      ) {
        const err = structuredAiError('SPREADSHEET_PERSISTENCE_UNVERIFIED');
        logAiDiagnostic({
          correlation_id: err.correlationId,
          project_id: projectId,
          draft_id: logCtx.draftId,
          operation: logCtx.operation,
          error_code: err.code,
          duration_ms: Date.now() - startedAt,
          retry_count: 0,
        });
        return { records, inserted, total: items.length, verified: false, duplicateBlocked: false, errorCode: err.code };
      }
    }
    return { records, inserted, total: items.length, verified: inserted === items.length, duplicateBlocked: false, errorCode: null };
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
      appendMsg(`Tidak ada proyek aktif. Buat atau buka proyek dulu di menu Proyek, lalu klik "Push ke Spreadsheet RAB" lagi. (Kode: ${structuredAiError('ACTIVE_PROJECT_NOT_FOUND').code})`, undefined, true);
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
    // Transfer terverifikasi (§12): tujuan proyek EKSPLISIT + outcome
    // store dibaca balik sebelum klaim sukses diucapkan.
    const res = insertRabItemsVerified(newItems, effProject.id, {
      draftId: `direct-${r.displayLabel}`,
      operation: 'push-direct-rab',
      finalizationKey: buildFinalizationKey(effProject.id, newItems as never),
    });
    if (res.duplicateBlocked && res.inserted === 0) {
      appendMsg(
        `${structuredAiError('DUPLICATE_TRANSFER_BLOCKED').message} Hasil RAB ${r.displayLabel} ini sudah ada di Spreadsheet RAB proyek "${effProject.name}". (Kode: DUPLICATE_TRANSFER_BLOCKED)`,
        [{ label: 'Buka Spreadsheet RAB', action: { kind: 'navigate', menu: 'rab-estimasi' } }],
      );
      return;
    }
    if (!res.verified) {
      appendMsg(
        res.inserted > 0
          ? `Transfer parsial: ${res.inserted} dari ${res.total} item terverifikasi masuk ke Spreadsheet RAB proyek "${effProject.name}" — sisanya belum. Klik "Push ke Spreadsheet RAB" lagi untuk melanjutkan; item yang sudah masuk tidak akan digandakan. (Kode: ${res.errorCode})`
          : `${structuredAiError(res.errorCode ?? 'SPREADSHEET_TRANSFER_FAILED').message} (Kode: ${res.errorCode})`,
        undefined,
        true,
      );
      return;
    }
    const added = res.records;
    appendMsg(
      `✅ ${added.length} item RAB ${r.displayLabel} (${r.floors} lantai) berhasil di-push ke Spreadsheet RAB proyek "${effProject.name}" (terverifikasi tersimpan).` +
        (dupCount > 0 ? ` ${dupCount} item dilewati karena sudah ada.` : '') +
        // Pesan jujur pasca-perbaikan 2026-10-27: harga ikut ter-push
        // sesuai statusnya (bukan lagi "tidak ikut ter-push" ala S10).
        // Estimasi tampil "Perlu verifikasi" di spreadsheet — bukan
        // harga resmi; yang belum berharga tetap "Harga belum diisi".
        ` Harga ikut ter-push: ${added.filter((a) => a.priceStatus === 'PRICE_RESOLVED').length} resmi AHSP, ${added.filter((a) => a.priceStatus === 'PRICE_ESTIMATED').length} estimasi (perlu verifikasi, bukan harga resmi), ${added.filter((a) => a.priceStatus === 'PRICE_UNRESOLVED').length} belum berharga.`,
      [{ label: 'Buka Spreadsheet RAB', action: { kind: 'navigate', menu: 'rab-estimasi' } }]
    );
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
    const d = getLastUniversalDraft(effProject?.id);
    if (!d) {
      appendMsg('Tidak ada draft RAB universal yang aktif untuk di-push. Buat dulu dengan perintah seperti "buatkan RAB jalan paving 300 m2" atau "buatkan RAB drainase U-Ditch 500 m".', undefined, true);
      return;
    }
    const preview = buildPushPreview(d);
    const readiness = draftReadiness(d);
    // G1 (K-04): ikat approval pada draft yang DITINJAU di pratinjau
    // ini — handler konfirmasi menolak bila versi/sidik draft aktif
    // saat klik berbeda. Tanpa tombol konfirmasi (BLOCKED / tanpa
    // proyek), slot dikosongkan: tidak ada approval yang tertunda.
    pendingTransferApprovalRef.current =
      effProject && readiness.status !== 'BLOCKED'
        ? createTransferApprovalBinding(d, effProject.id)
        : null;
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
    const d = getLastUniversalDraft(effProject?.id);
    if (!d) {
      appendMsg('Tidak ada draft RAB universal yang aktif untuk di-push.', undefined, true);
      return;
    }
    if (!effProject) {
      appendMsg(`Tidak ada proyek aktif. Buat atau buka proyek dulu di menu Proyek, lalu klik "Push ke Spreadsheet" lagi. (Kode: ${structuredAiError('ACTIVE_PROJECT_NOT_FOUND').code})`, undefined, true);
      return;
    }
    if (d.lastTransfer && d.lastTransfer.projectId === effProject.id && d.lastTransfer.version === d.version) {
      appendMsg(`Draft "${d.title}" versi ${d.version} sudah ditransfer ke proyek "${effProject.name}" (${d.lastTransfer.pushed} item) — tidak ada penulisan ganda. (Kode: ${structuredAiError('DUPLICATE_TRANSFER_BLOCKED').code})`, [
        { label: 'Buka Spreadsheet RAB', action: { kind: 'navigate', menu: 'rab-estimasi' } },
      ]);
      return;
    }
    // G1 (K-04) — pengikatan approval transfer: konfirmasi hanya
    // berlaku untuk draft yang DITINJAU di pratinjau (versi + sidik
    // isi + TTL 10 menit, pola ChangePlan operations.ts). Draft yang
    // berubah sesudah pratinjau MEMBATALKAN approval. Cek ini terjadi
    // SEBELUM validateTransfer/payload/tulis apa pun — penolakan
    // tidak menyentuh draft maupun spreadsheet (satu-satunya tulisan
    // adalah pesan penolakan di chat, sama seperti jalur penolakan
    // lain di handler ini). Approval yang ditolak hangus: pratinjau
    // baru wajib dibuat sebelum konfirmasi berikutnya.
    const approval = checkTransferApprovalBinding(pendingTransferApprovalRef.current, d, effProject.id);
    if (!approval.ok) {
      pendingTransferApprovalRef.current = null;
      appendMsg(`${approval.message} Tidak ada item yang ditransfer — buat pratinjau baru lewat "Push ke Spreadsheet", lalu konfirmasi dari pratinjau itu.`, undefined, true);
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
    // Transfer terverifikasi (§12): tujuan proyek EKSPLISIT + outcome
    // store dibaca balik. Kwitansi transfer (lastTransfer) HANYA dicatat
    // bila seluruh payload terverifikasi tersimpan — kegagalan parsial
    // tidak menandai draft sebagai sudah ditransfer.
    const res = insertRabItemsVerified(newItems, effProject.id, {
      draftId: `universal-v${d.version}`,
      operation: 'push-universal-rab',
      finalizationKey: buildFinalizationKey(effProject.id, newItems as never),
    });
    if (res.duplicateBlocked && res.inserted === 0) {
      // Keadaan tujuan sudah tercapai dari transfer sebelumnya —
      // catat kwitansi agar alur berikutnya konsisten, laporkan jujur
      // sebagai duplikat yang diblokir (bukan penyisipan baru).
      d.lastTransfer = { projectId: effProject.id, version: d.version, pushed: 0, skipped: dupCount + res.total, at: new Date().toISOString() };
      setLastUniversalDraft(d, effProject.id);
      // G1: approval sekali pakai — keadaan tujuan sudah tercapai.
      pendingTransferApprovalRef.current = null;
      // §2/§4: receipt nyata (keadaan tujuan sudah tercapai) ikut
      // dipersistenkan agar status transferred bertahan lintas refresh.
      persistActiveDraft('transferred', 'transfer');
      syncTransferredMark(d.lastTransfer);
      // FASE 5 — receipt ikut tercatat di trail audit registry tool.
      recordTransferReceipt({ projectId: effProject.id, draftVersion: d.version, draftTitle: d.title, pushed: 0, skipped: dupCount + res.total, conversationId: convIdRef.current ?? null });
      // FASE 6 — keadaan tujuan sudah tercapai = langkah transfer-draft
      // rencana selesai (ditandai dari outcome nyata, bukan teks pesan).
      updateAgentPlan((p) => markTransferStepCompleted(p, `Draft "${d.title}" v${d.version} sudah tersimpan di Spreadsheet RAB (transfer terverifikasi sebelumnya — tidak ada penulisan ganda).`));
      appendMsg(
        `${structuredAiError('DUPLICATE_TRANSFER_BLOCKED').message} Draft "${d.title}" versi ${d.version} sudah tersimpan di Spreadsheet RAB proyek "${effProject.name}". (Kode: DUPLICATE_TRANSFER_BLOCKED)`,
        [{ label: 'Buka Spreadsheet RAB', action: { kind: 'navigate', menu: 'rab-estimasi' } }],
      );
      return;
    }
    if (!res.verified) {
      appendMsg(
        res.inserted > 0
          ? `Transfer parsial: ${res.inserted} dari ${res.total} item terverifikasi masuk ke Spreadsheet RAB proyek "${effProject.name}" — sisanya belum dan draft belum ditandai selesai. Klik "Push ke Spreadsheet" lagi untuk melanjutkan; item yang sudah masuk tidak akan digandakan. (Kode: ${res.errorCode})`
          : `${structuredAiError(res.errorCode ?? 'SPREADSHEET_TRANSFER_FAILED').message} Draft tetap tersimpan dan bisa dicoba lagi. (Kode: ${res.errorCode})`,
        undefined,
        true,
      );
      return;
    }
    const added = res.records;
    const unresolvedCount = payload.filter((p) => p.priceStatus === 'PRICE_UNRESOLVED').length;
    d.lastTransfer = { projectId: effProject.id, version: d.version, pushed: added.length, skipped: dupCount, at: new Date().toISOString() };
    setLastUniversalDraft(d, effProject.id);
    // G1: approval sekali pakai — sudah dipakai untuk transfer ini.
    pendingTransferApprovalRef.current = null;
    // §2/§4: HANYA sesudah outcome terverifikasi sukses — persistenkan
    // receipt (draftId+versi terikat di lastTransfer) + status transferred.
    persistActiveDraft('transferred', 'transfer');
    syncTransferredMark(d.lastTransfer);
    // FASE 5 — receipt ikut tercatat di trail audit registry tool.
    recordTransferReceipt({ projectId: effProject.id, draftVersion: d.version, draftTitle: d.title, pushed: added.length, skipped: dupCount, conversationId: convIdRef.current ?? null });
    // FASE 6 — transfer terverifikasi = langkah transfer-draft rencana
    // selesai (ditandai dari outcome nyata, bukan teks pesan).
    updateAgentPlan((p) => markTransferStepCompleted(p, `Draft "${d.title}" v${d.version} dipindahkan ke Spreadsheet RAB (${added.length} item terverifikasi).`));
    appendMsg(
      `✅ ${added.length} item draft "${d.title}" (versi ${d.version}) berhasil di-push ke Spreadsheet RAB proyek "${effProject.name}" (terverifikasi tersimpan).` +
        (dupCount > 0 ? ` ${dupCount} item dilewati karena sudah ada.` : '') +
        (unresolvedCount > 0 ? ` ${unresolvedCount} item belum berharga — masuk berlabel BELUM TERSEDIA, bukan Rp0.` : '') +
        ' Status harga dipertahankan per item (RESMI AHSP / HARGA DATABASE / HARGA MANUAL / BELUM TERSEDIA) — tidak ada yang diam-diam berubah menjadi resmi.',
      [{ label: 'Buka Spreadsheet RAB', action: { kind: 'navigate', menu: 'rab-estimasi' } }]
    );
  };

  /* Coba Lagi (2026-10-23): kirim ulang prompt AI terakhir lewat jalur
   * submit yang sama, dengan bendera paksa-AI (prompt-nya memang untuk
   * pipeline AI) dan echo=false (tanpa gelembung user duplikat; entry
   * error lama dibuang oleh submit sebelum mencoba lagi).
   * Lifecycle fix 2026-11-12: lastAiPromptRef hilang saat unmount — bila
   * ref kosong, pulihkan dari pesan pengguna terakhir di riwayat yang
   * terpersisten (tombol Coba Lagi & banner interrupted harus bekerja
   * sesudah kembali dari menu lain / muat ulang). */
  const getRetryPrompt = (): string | null => {
    if (lastAiPromptRef.current) return lastAiPromptRef.current;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user' && messages[i].content.trim()) return messages[i].content;
    }
    return null;
  };
  const retryLastAi = () => {
    const prompt = getRetryPrompt();
    if (!prompt || busy) return;
    forceAiRef.current = true;
    void submit(prompt, { echo: false });
  };

  /* Berhenti (lifecycle fix 2026-11-12): pembatalan EKSPLISIT satu-satunya
   * yang boleh menghentikan request aktif — navigasi tidak pernah
   * memanggil ini. Menargetkan eksekusi aktif percakapan ini saja. */
  const stopActiveExecution = () => {
    const rec = activeExec ?? (activeConvId ? getActiveExecution(activeConvId) : null);
    if (!rec) return;
    cancelExecution(rec.requestId);
  };

  const handleActionButton = (btn: ChatActionButton) => {
    // §2 (hardening): tombol aksi registry adalah titik commit draft juga
    // (draft universal lahir dari executeIntent di cabang-cabang intent
    // di bawah, yang tidak melewati postAssistant) — autosave sekali di
    // akhir handler lewat finally, meniru pola cabang-cabang submit.
    try {
      handleActionButtonInner(btn);
    } finally {
      persistActiveDraft('autosave');
    }
  };

  /* ---- Kuesioner spesifikasi adaptif (2026-11-12): kirim jawaban kartu
   * ke registry (konteks kanonis yang sama), tampilkan hasil (brief
   * tinjauan / kartu ulang bila validasi menolak), tandai kartu asal
   * sebagai terkirim. Titik commit yang sama dengan tombol aksi:
   * autosave draft + snapshot konteks intake diperbarui oleh efek
   * persistensi di bawah. ---- */
  const handleQuestionnaireSubmit = (entryIndex: number, answers: Record<string, QuestionnaireAnswerRecord>) => {
    const res = submitQuestionnaireAnswers(answers);
    // Hasil yang membawa payload kuesioner lagi = validasi menolak
    // kiriman (kartu ditampilkan ulang) — kartu asal BELUM terkirim.
    // Hasil tanpa payload (brief tinjauan) = kiriman berhasil.
    if (!res.questionnaire) {
      setMessages((prev) =>
        prev.map((m, i) => (i === entryIndex ? { ...m, questionnaireSubmitted: true } : m)),
      );
    }
    // GELOMBANG PERBAIKI SEMUA (temuan Fase 6 §11.5): jawaban kuesioner
    // yang DITERIMA (ok + tanpa kartu tanya-ulang) menandai langkah
    // pengumpulan spek rencana menjadi `succeeded` — sebelumnya langkah
    // itu tetap `running` selamanya. Penolakan validasi (kartu
    // ditampilkan ulang) dan konteks-hilang (ok:false) TIDAK menandai:
    // tidak ada spek yang terkumpul pada kedua kasus itu.
    if (res.ok && !res.questionnaire) {
      updateAgentPlan((p) => markQuestionnaireStepCompleted(p, 'Kuesioner spesifikasi dijawab — spek terkumpul.'));
    }
    const entry: ChatEntry = {
      role: 'assistant',
      content: res.message,
      ts: Date.now(),
      actions: res.actions,
      questionnaire: res.questionnaire,
    };
    setMessages((prev) => [...prev, entry]);
    persistMessage('assistant', res.message);
    setAwaitingConcept(res.awaitProjectConcept === true);
    persistActiveDraft('autosave');
  };

  const handleActionButtonInner = (btn: ChatActionButton) => {
    if (btn.action.kind === 'push-rab') {
      pushDirectRabToSpreadsheet();
    } else if (btn.action.kind === 'push-universal') {
      pushUniversalToSpreadsheetPreview();
    } else if (btn.action.kind === 'push-universal-confirm') {
      pushUniversalToSpreadsheet();
    } else if (btn.action.kind === 'revision-confirm') {
      // GATE 3 (5C) — tombol = konfirmasi eksplisit aktivasi pratinjau.
      // Pratinjau hidup di memori sesi; tombol pada pesan lama (sesudah
      // reload / sesudah pratinjau diputuskan) menjawab jujur.
      const pending = pendingRevisionRef.current;
      if (!pending) {
        appendLocalAssistant(
          'Pratinjau revisi ini sudah tidak aktif (sudah diaktifkan/dibatalkan, atau sesi dimuat ulang). Kirim ulang permintaan revisi bila masih diperlukan — versi aktif tidak berubah.',
        );
      } else {
        const res = runRevisionActivation(pending);
        appendLocalAssistant(res.message, res.actions);
      }
    } else if (btn.action.kind === 'revision-cancel') {
      const pending = pendingRevisionRef.current;
      if (!pending) {
        appendLocalAssistant('Tidak ada pratinjau revisi yang menunggu — tidak ada yang dibatalkan. Versi aktif tidak berubah.');
      } else {
        pendingRevisionRef.current = null;
        appendLocalAssistant(
          `Revisi dibatalkan — versi aktif tetap versi ${pending.baseVersion}, tidak berubah. Pratinjau dibuang.`,
        );
      }
    } else if (btn.action.kind === 'revision-history') {
      appendLocalAssistant(
        effProject
          ? formatVersionHistoryMessage(effProject.id)
          : 'Tidak ada proyek aktif — riwayat versi tidak dapat ditampilkan.',
      );
    } else if (btn.action.kind === 'qto-correction-confirm' || btn.action.kind === 'qto-correction-reject') {
      // GATE 4 (5D) — konfirmasi/penolakan koreksi QTO HANYA via tombol
      // (bukan afirmasi teks — bila banyak usulan menunggu, afirmasi
      // teks ambigu). Check direkomputasi segar dari lampiran + dimensi
      // saat ini; usulan yang sudah diputuskan / tidak ditemukan
      // dijawab jujur. Draft aktif yang membawa dedQto diperbarui
      // (checks + decisions segar) + dipersisten — total RAB kanonis
      // TIDAK berubah (dedQto adalah lapisan validasi, bukan isi RAB).
      const confirm = btn.action.kind === 'qto-correction-confirm';
      // Tangkap id ke const lokal — narrowing union hilang di dalam
      // closure `.find(...)` bila dibaca langsung dari btn.action.
      const correctionId = btn.action.correctionId;
      if (!effProject) {
        appendLocalAssistant('Tidak ada proyek aktif — koreksi QTO tidak dapat diputuskan.');
      } else {
        const att = loadDedAttachment(effProject.id);
        if (!att) {
          appendLocalAssistant('Lampiran DED proyek ini sudah tidak ada — koreksi QTO tidak dapat diputuskan. Kirim ulang DED dari halaman DED AI bila masih diperlukan.');
        } else {
          // Dimensi efektif (F9-QTO-1): dims TERSIMPAN di dedQto
          // diutamakan, dimensi hidup hanya fallback — usulan yang
          // tampil dihitung dari dims tersimpan, jadi handler wajib
          // mereproduksi rekonsiliasi yang sama untuk menemukannya.
          // Dimensi hidup sesudah generate/remount kosong ATAU milik
          // konteks lain (mis. snapshot multi-gedung ter-link membawa
          // lengthM: 50 jalan akses tanpa lebar/kedalaman); urutan lama
          // (hidup dulu) membuat rekomputasi CANNOT_CHECK dan tombol
          // Terima menjawab "sudah tidak menunggu". Bila keduanya
          // kosong, pakai checks tersimpan draft (usulan milik
          // rekonsiliasi itu) — bukan mengarang dimensi.
          const activeDraftForQto = getLastUniversalDraft(effProject.id);
          const resolvedDims = resolveQtoDims(
            dimsFromIntakeContext(getUniversalContextState()),
            activeDraftForQto?.dedQto ?? null,
          );
          const { checks } = resolvedDims
            ? reconcileDedQto(att, resolvedDims)
            : { checks: activeDraftForQto?.dedQto?.checks ?? [] };
          const proposal = pendingQtoCorrections(att, checks).find((p) => p.id === correctionId);
          if (!proposal) {
            appendLocalAssistant(
              'Usulan koreksi QTO ini sudah tidak menunggu (sudah diputuskan, atau lampiran DED berubah sejak usulan dibuat). Tidak ada yang berubah.',
            );
          } else {
            const updated = confirm
              ? applyQtoCorrection(att, proposal, checks)
              : rejectQtoCorrection(att, proposal);
            if (!updated.ok) {
              appendLocalAssistant(`⚠️ ${updated.message} — tidak ada yang berubah.`);
            } else {
              saveDedAttachment(updated.attachment);
              // Segarkan dedQto pada draft aktif (bila ada) + persist:
              // rekomputasi penuh bila dims tersedia; bila tidak, patch
              // checks tersimpan (item terkonfirmasi → OK, eksak menurut
              // konstruksi proposal) + decisions segar. Total RAB
              // kanonis TIDAK berubah (dedQto adalah lapisan validasi).
              const activeDraft = getLastUniversalDraft(effProject.id);
              if (activeDraft?.dedQto) {
                const decision = updated.attachment.decisions.find(
                  (d) => d.itemId === proposal.itemId && d.correctedQuantity === proposal.expectedQuantity,
                );
                const freshChecks = resolvedDims
                  ? reconcileDedQto(updated.attachment, resolvedDims).checks
                  : decision
                    ? patchDedQtoChecksAfterDecision(activeDraft.dedQto.checks, decision)
                    : activeDraft.dedQto.checks;
                const nextDraft = {
                  ...activeDraft,
                  dedQto: buildDedQtoDraftInfo(updated.attachment, freshChecks, resolvedDims ?? activeDraft.dedQto.dims),
                };
                setLastUniversalDraft(nextDraft, effProject.id);
                persistActiveDraft('autosave');
              }
              appendLocalAssistant(
                confirm
                  ? `✅ ${updated.message}\n\nKuantitas terkoreksi tercatat sebagai kuantitas Anda (sumber: USER_INPUT); nilai DED asli (${proposal.dedQuantity} ${proposal.dedUnit}) tetap tersimpan di keputusan koreksi dan dapat dibuktikan.`
                  : `ℹ️ ${updated.message}\n\nNilai DED dipertahankan — tidak ada yang berubah pada data DED.`,
              );
            }
          }
        }
      }
    } else if (btn.action.kind === 'ded-spec-confirm' || btn.action.kind === 'ded-spec-reject') {
      // GATE 4 (5D) — konfirmasi/penolakan revisi spek DED. Pratinjau
      // hidup di memori sesi; tombol pada pesan lama (sesudah reload /
      // sesudah diputuskan) menjawab jujur. Konfirmasi: jawaban user
      // dicatat di konteks intake (restoreUniversalContext → derive
      // mengeluarkan spek CONFIRMED bersumber 'percakapan' dengan
      // supersedes 'ded-spec:<key>'); ctx.dedSpecs TIDAK DIUBAH.
      const confirm = btn.action.kind === 'ded-spec-confirm';
      const preview = pendingDedSpecRevisionsRef.current.get(btn.action.previewId);
      if (!preview) {
        appendLocalAssistant('Pratinjau revisi spek DED ini sudah tidak aktif (sudah diputuskan, atau sesi dimuat ulang). Spek DED tidak berubah.');
      } else {
        pendingDedSpecRevisionsRef.current.delete(btn.action.previewId);
        if (!confirm) {
          appendLocalAssistant(
            `Revisi spek DED dibatalkan — ${preview.label} tetap ${preview.oldValue}${preview.oldUnit ? ` ${preview.oldUnit}` : ''} (DED). Tidak ada yang berubah.`,
          );
        } else {
          const liveCtx = getUniversalContextState();
          if (!liveCtx || !effProject) {
            appendLocalAssistant('Konteks intake proyek ini sudah tidak aktif — revisi spek DED tidak dapat diterapkan. Mulai percakapan proyek ini lagi, lalu kirim ulang perintah revisi.');
          } else {
            const next = applyDedSpecRevision(liveCtx, preview);
            restoreUniversalContext(next, effProject.id);
            appendLocalAssistant(
              `✅ Revisi spek DED diterapkan: ${preview.label} ${preview.oldValue}${preview.oldUnit ? ` ${preview.oldUnit}` : ''} (DED) → **${preview.newValue}${preview.newUnit ? ` ${preview.newUnit}` : ''} (Anda)**.\n\nNilai DED asli tetap tersimpan di data DED (tidak ditimpa). Spek ini sekarang bersumber dari Anda ("percakapan") dan akan dipakai draft berikutnya.`,
            );
          }
        }
      }
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
        activeProject: effProject,
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
        activeProject: effProject,
        projects,
        projectTotal: projectSnapshot ? projectSnapshot.totalDirect : projectTotal,
        projectItems: projectSnapshot?.items ?? null,
      });
      const entry: ChatEntry = { role: 'assistant', content: res.message, ts: Date.now(), actions: res.actions };
      setMessages((prev) => [...prev, entry]);
      persistMessage('assistant', res.message);
    } else if (btn.action.intent === 'RAB_MATERIAL_SELECT') {
      // Gerbang klarifikasi material (2026-11-10): klik bahan → draft
      // disusun dari template bahan itu; klik "pakai asumsi" → draft
      // dengan asumsi terbuka; klik "Pilih bahan katalog" (dari jawaban
      // bahan-tanpa-template) → pertanyaan tampil lagi (awaitRabMaterial
      // dari hasil menyetel status menunggu). Lokal penuh lewat registry.
      const res = executeIntent('RAB_MATERIAL_SELECT', btn.action.param, {
        navigate: (menu: string) => navigateChat(menu),
        currentMenu,
        activeProject: effProject,
        projects,
        projectTotal: projectSnapshot ? projectSnapshot.totalDirect : projectTotal,
        projectItems: projectSnapshot?.items ?? null,
      });
      const entry: ChatEntry = { role: 'assistant', content: res.message, ts: Date.now(), actions: res.actions };
      setMessages((prev) => [...prev, entry]);
      persistMessage('assistant', res.message);
      setAwaitingMaterial(res.awaitRabMaterial === true);
    } else if (btn.action.intent === 'RAB_CONCEPT_SELECT' || btn.action.intent === 'RAB_PROJECT_PREVIEW'
      || btn.action.intent === 'RAB_INTAKE_OPTION' || btn.action.intent === 'RAB_INTAKE_GENERATE') {
      // Intake konteks proyek (2026-11-10): klik konsep → pertanyaan
      // fasilitas konsep itu; klik "Susun pratinjau RAB" → pratinjau
      // terstruktur; klik "Susun draft RAB" pada pratinjau → draft
      // kanonis dari konteks. Lokal penuh lewat registry; status
      // menunggu mengikuti awaitProjectConcept pada hasil (draft final
      // menutup status menunggu).
      const res = executeIntent(btn.action.intent as never, btn.action.param, {
        navigate: (menu: string) => navigateChat(menu),
        currentMenu,
        activeProject: effProject,
        projects,
        projectTotal: projectSnapshot ? projectSnapshot.totalDirect : projectTotal,
        projectItems: projectSnapshot?.items ?? null,
      });
      const entry: ChatEntry = { role: 'assistant', content: res.message, ts: Date.now(), actions: res.actions, questionnaire: res.questionnaire };
      setMessages((prev) => [...prev, entry]);
      persistMessage('assistant', res.message);
      setAwaitingConcept(res.awaitProjectConcept === true);
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
      setAwaitingMaterial(false);
      setAwaitingClarify(null);
      const res = executeIntent('RAB_FULL_AI', btn.action.param, {
        navigate: (menu: string) => navigateChat(menu),
        currentMenu,
        activeProject: effProject,
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
        activeProject: effProject,
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
        activeProject: effProject,
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
  /* Selesai dikte atas inisiatif pengguna — satu-satunya pemanggil fungsi
   * ini adalah toggleMic saat sedang mendengarkan (tombol mic = tombol
   * "selesai"). Pasang penanda auto-kirim, lalu stop() — BUKAN abort():
   * stop() membiarkan engine menyelesaikan & mengirim hasil final
   * terakhir sebelum onend, sedangkan abort() membuangnya (kata terakhir
   * pengguna hilang dari teks yang terkirim). sttFinalRef SENGAJA tidak
   * dikosongkan di sini: onend yang mengonsumsinya untuk menyusun teks
   * kirim, lalu membersihkannya. */
  const stopListening = () => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    setListening(false);
    if (rec) {
      sttAutoSendRef.current = true;
      try { rec.stop(); }
      catch { try { rec.abort(); } catch { /* abaikan */ } }
    }
  };

  const toggleMic = () => {
    if (listening) { stopListening(); return; }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setMessages((prev) => [...prev, {
        role: 'assistant', ts: Date.now(), isError: true,
        content: 'Browser ini tidak mendukung voice input. Coba buka di Chrome Android/desktop ya.',
      }]);
      return;
    }
    const rec = new Ctor();
    rec.lang = 'id-ID';
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    sttSessionRef.current += 1;
    const mySession = sttSessionRef.current;
    /* Sesi baru tidak mewarisi niat kirim sesi sebelumnya — penanda
     * hanya boleh lahir dari stopListening pada sesi ini sendiri. */
    sttAutoSendRef.current = false;
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
          content: 'Izin mikrofon ditolak. Izinkan akses mic di pengaturan browser ya.',
        }]);
      } else if (err !== 'aborted' && err !== 'no-speech') {
        setMessages((prev) => [...prev, {
          role: 'assistant', ts: Date.now(), isError: true,
          content: 'Voice input gagal. Coba ketik manual ya.',
        }]);
      }
    };
    rec.onend = () => {
      /* End basi dari sesi sebelumnya (pengguna sudah memulai dikte
       * baru): abaikan sepenuhnya — jangan sentuh state, ref teks,
       * maupun penanda milik sesi yang sedang berjalan. */
      if (mySession !== sttSessionRef.current) return;
      recognitionRef.current = null;
      setListening(false);
      /* Konsumsi penanda SEKALI PAKAI apa pun hasilnya, supaya akhir
       * sesi berikutnya (alami / error) tidak mewarisi niat kirim ini. */
      const autoSend = sttAutoSendRef.current;
      sttAutoSendRef.current = false;
      const finalText = sttFinalRef.current;
      sttFinalRef.current = '';
      if (!autoSend) return;
      const composed = [sttBaseRef.current, finalText].filter((p) => p.trim()).join(' ').trim();
      if (!composed) return;
      /* Jalur yang sama persis dengan Enter / tombol Kirim, lewat cermin
       * submit terbaru: guard kosong & sibuk milik submit berlaku apa
       * adanya — bila AI sedang menjawab, submit menolak sendiri dan
       * teks tetap di kotak input (tidak dipaksa, tidak hilang). */
      void submitRef.current(composed);
    };
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
              onClick={() => setPendingDeleteConv(h)}
              disabled={busy}
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
        <div className="ezchat2-listening"><span className="ezdot busy pulse" /> Mendengarkan… bicara sekarang</div>
      )}
      <div className="ezchat2-pill">
        {/* Tombol lampirkan file DIHAPUS (owner 2026-10-27): tidak ada
            lagi pemicu lampiran di Chat AI. Jalur lampiran teks lama
            (onPickFile/fileRef) tidak lagi dirender dari composer ini. */}
        <textarea
          ref={taRef}
          value={input}
          onChange={(e) => { setInput(e.target.value); autoresize(); updateSlashState(e.target.value, e.target.selectionStart); saveDraftSoon(e.target.value); }}
          onKeyDown={onKey}
          placeholder={listening ? 'Mendengarkan…' : 'Ketik pesan atau perintah…'}
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
        Ezrab AI bisa salah, cek ulang angka penting
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
          {/* D-49 (Batch E, OD-18 opsi (a)): judul header adalah tombol
              yang membuka panel Tentang/version — bukan lagi div statis
              tanpa aksi. Label 'V 01.00' dipertahankan (satu sumber di
              chatUiPersistence.EZRAB_CHAT_AI_VERSION). */}
          <button
            type="button"
            className="ezchat2-name ezchat2-namebtn"
            onClick={() => setAboutOpen(true)}
            title="Tentang Ezrab Chat AI"
            aria-label="Tentang Ezrab Chat AI"
          >
            {presentationMode === 'magic' ? 'EZRAB Magic AI' : 'Ezrab Chat AI'} <span className="ezchat2-ver">V {EZRAB_CHAT_AI_VERSION}</span>
          </button>
        </div>
        <div className="ezchat2-actions">
          {/* Saldo kredit AI (simulasi) — selalu terlihat di header chat;
              tombol + membuka modal top-up simulasi. */}
          <CreditBalance compact />
          {/* Satu-satunya kontrol mode: dropdown header (mode nyata:
              Cepat/fast dan Mendalam/advanced). Bukan daftar model
              provider — tidak ada nama model yang dikarang di sini. */}
          <select
            className="ezchat2-modesel"
            value={mode}
            onChange={(e) => changeChatMode(e.target.value as 'fast' | 'advanced')}
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
                  onClick={() => { setMenuOpen(false); setHistoryOpen(false); setMemoryOpen(true); }}
                >
                  <Brain size={14} /> Memori tersimpan
                </button>
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); setHistoryOpen(false); setPlanOpen(true); }}
                >
                  <ListChecks size={14} /> Rencana tugas
                </button>
                <button
                  role="menuitem"
                  onClick={openReviewPanel}
                >
                  <ClipboardList size={14} /> Review draft
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
      {memoryOpen && (
        <>
          <div className="ezchat2-hist-veil" onClick={() => setMemoryOpen(false)} />
          <div className="ezchat2-hist-panel" role="dialog" aria-label="Memori tersimpan">
            <div className="ezhist-head">
              <h3 className="ezhist-heading">Memori Tersimpan</h3>
              <button className="ezhist-newbtn" onClick={() => setMemoryOpen(false)}>Tutup</button>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--ez-color-text-body, #475569)', margin: '4px 0 10px' }}>
              {MEMORY_HONEST_LABEL} Memori yang dihapus tidak muncul lagi di jawaban berikutnya.
            </p>
            <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', marginBottom: '8px' }}>
              <input
                type="checkbox"
                checked={memoryPrefs.personalizationEnabled}
                onChange={(e) => {
                  const res = setPreference(null, 'personalizationEnabled', e.target.checked);
                  if (res.ok) setMemoryPrefs(res.value);
                }}
              />
              Personalisasi aktif (pakai preferensi saya di jawaban AI)
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px', fontSize: '12px' }}>
              <label>Presentasi RAB:{' '}
                <select
                  value={memoryPrefs.rabPresentation}
                  onChange={(e) => {
                    const res = setPreference(null, 'rabPresentation', e.target.value as UserPreferences['rabPresentation']);
                    if (res.ok) setMemoryPrefs(res.value);
                  }}
                >
                  <option value="ringkas">Ringkas</option>
                  <option value="rinci">Rinci</option>
                </select>
              </label>
              <label>Gaya workflow:{' '}
                <select
                  value={memoryPrefs.workflowStyle}
                  onChange={(e) => {
                    const res = setPreference(null, 'workflowStyle', e.target.value as UserPreferences['workflowStyle']);
                    if (res.ok) setMemoryPrefs(res.value);
                  }}
                >
                  <option value="bertahap">Bertahap</option>
                  <option value="langsung">Langsung</option>
                </select>
              </label>
              <label>Level detail:{' '}
                <select
                  value={memoryPrefs.detailLevel}
                  onChange={(e) => {
                    const res = setPreference(null, 'detailLevel', e.target.value as UserPreferences['detailLevel']);
                    if (res.ok) setMemoryPrefs(res.value);
                  }}
                >
                  <option value="ringkas">Ringkas</option>
                  <option value="sedang">Sedang</option>
                  <option value="rinci">Rinci</option>
                </select>
              </label>
            </div>
            {memoryItems.length === 0 ? (
              <p className="ezhist-empty">Belum ada memori tersimpan untuk proyek ini.</p>
            ) : (
              <div className="ezhist-list">
                {memoryItems.map((m) => (
                  <div key={m.memoryId} className="ezhist-row" style={{ alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>
                        [{m.layer} · {m.quality}]{m.status === 'contradictory' ? ' ⚠️ KONFLIK — perlu ditanyakan' : ''}{m.status === 'superseded' ? ' · digantikan' : ''}
                      </div>
                      {memoryEditingId === m.memoryId ? (
                        <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                          <input
                            value={memoryEditingText}
                            onChange={(e) => setMemoryEditingText(e.target.value)}
                            style={{ flex: 1, minWidth: 0 }}
                            aria-label="Koreksi memori"
                          />
                          <button
                            title="Simpan koreksi"
                            onClick={() => {
                              if (!effProject) return;
                              const res = correctMemory(m.memoryId, memoryEditingText, { userId: null, projectId: effProject.id, conversationId: convIdRef.current ?? null });
                              if (res.ok) { setMemoryEditingId(null); refreshMemoryPanel(); }
                            }}
                          >
                            <Save size={14} />
                          </button>
                        </div>
                      ) : (
                        <div style={{ fontSize: '13px', wordBreak: 'break-word' }}>{m.content}</div>
                      )}
                      <div style={{ fontSize: '11px', color: 'var(--ez-color-text-body, #64748b)' }}>
                        {m.provenance} • {new Date(m.updatedAt).toLocaleDateString('id-ID')}
                      </div>
                    </div>
                    <button
                      title="Koreksi memori"
                      onClick={() => { setMemoryEditingId(m.memoryId); setMemoryEditingText(m.content); }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="ezhist-del"
                      title="Hapus memori"
                      onClick={() => {
                        if (!effProject) return;
                        deleteMemory(m.memoryId, { userId: null, projectId: effProject.id, conversationId: convIdRef.current ?? null });
                        refreshMemoryPanel();
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
      {planOpen && (
        <>
          <div className="ezchat2-hist-veil" onClick={() => setPlanOpen(false)} />
          <div className="ezchat2-hist-panel" role="dialog" aria-label="Rencana tugas">
            <div className="ezhist-head">
              <h3 className="ezhist-heading">Rencana Tugas</h3>
              <button className="ezhist-newbtn" onClick={() => setPlanOpen(false)}>Tutup</button>
            </div>
            {!agentPlan ? (
              <p className="ezhist-empty">Belum ada rencana tugas untuk proyek ini. Kirim permintaan (mis. "buatkan RAB kandang sapi 20 ekor") dan rencana multi-langkah akan terbentuk di sini.</p>
            ) : (
              <>
                <p style={{ fontSize: '12px', color: 'var(--ez-color-text-body, #475569)', margin: '4px 0 10px' }}>
                  {agentPlan.objective.goalText} Rencana tersimpan lokal per-perangkat dan selamat dari navigasi maupun reload.
                </p>
                <div className="ezhist-list">
                  {agentPlan.steps.map((s) => (
                    <div key={s.id} className="ezhist-row" style={{ alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>
                          {s.status === 'succeeded' ? '✓ ' : s.status === 'partially-succeeded' ? '◐ ' : s.status === 'failed' ? '✗ ' : s.status === 'awaiting-approval' ? '⏸ ' : s.status === 'blocked' ? '■ ' : s.status === 'cancelled' ? '— ' : s.status === 'running' ? '… ' : '○ '}
                          {s.description}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--ez-color-text-body, #64748b)' }}>
                          {s.tool} · {s.consequence === 'consequential' ? 'konsekwensial — butuh persetujuan Anda' : s.consequence === 'draft' ? 'draft' : 'baca-saja'}
                          {s.error ? ` · Gagal: ${s.error}` : ''}
                          {s.result && s.status !== 'succeeded' ? ` · ${s.result}` : ''}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--ez-color-text-body, #64748b)' }} title={s.selectionReason}>
                          Alasan tool: {s.selectionReason}
                        </div>
                        {s.status === 'awaiting-approval' && (
                          <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                            <button
                              onClick={async () => {
                                const r = approveStep(agentPlan, s.id, 'user');
                                if (!r.ok) return;
                                setAgentPlanTracked(r.plan);
                                // FASE 5 — persetujuan membuka gate DAN
                                // eksekusi langkah berjalan lewat registry
                                // kanonis (bukan jalur lama). Hanya langkah
                                // yang punya runner registry yang
                                // dieksekusi di sini; langkah pemahaman/
                                // tampilan UI tetap hanya membuka gate.
                                // Transfer draft TETAP lewat tombol
                                // push-rab — registry hanya memeriksa
                                // kesiapan (readiness), tidak menulis.
                                if (!effProject || !PLAN_STEP_TOOL_MAP[s.kind]) return;
                                try {
                                  const activeDraft = getLastUniversalDraft(effProject.id);
                                  const exec = await runPlanStepWithRegistry(
                                    s.kind,
                                    { projectId: effProject.id, conversationId: convIdRef.current ?? null, planId: agentPlan.planId, stepId: s.id },
                                    {
                                      rawText: agentPlan.objective.sourceText,
                                      draft: activeDraft,
                                      draftVersion: activeDraft?.version,
                                      structuredSpecs: activeDraft?.structuredSpecs ?? [],
                                    },
                                    { actor: 'user', approval: { actor: 'user', approvedAt: new Date().toISOString() }, channel: 'chat-ai' },
                                  );
                                  const text = exec.ok
                                    ? `Langkah "${s.description}" dijalankan lewat registry: ${exec.output ?? 'selesai.'}`
                                    : `Langkah "${s.description}" tidak dapat dijalankan lewat registry: ${exec.error ?? 'gagal.'}`;
                                  setMessages((prev) => [...prev, { role: 'assistant', content: text, ts: Date.now() }]);
                                  // FASE 6 — hasil eksekusi registry
                                  // disinkronkan ke status langkah di
                                  // panel (bukan hanya pesan chat):
                                  // selesai / selesai-sebagian / gagal /
                                  // terhenti + alasan. Status terminal
                                  // registry saja yang dipetakan; hasil
                                  // non-terminal (mis. awaiting-approval)
                                  // tidak mengubah langkah. Untuk
                                  // transfer-draft, sukses berarti
                                  // kesiapan terverifikasi — langkah
                                  // tetap 'ready' kecuali draft SUDAH
                                  // benar-benar ditransfer (dibaca ulang
                                  // dari singleton sesudah await).
                                  if (exec.record.status === 'succeeded' || exec.record.status === 'partially-succeeded' || exec.record.status === 'failed' || exec.record.status === 'blocked') {
                                    const freshDraft = getLastUniversalDraft(effProject.id);
                                    const transferCompleted = !!(freshDraft?.lastTransfer && freshDraft.lastTransfer.version === freshDraft.version && freshDraft.lastTransfer.projectId === effProject.id);
                                    updateAgentPlan((p) => applyRegistryOutcomeToStep(p, s.id, {
                                      status: exec.record.status as 'succeeded' | 'partially-succeeded' | 'failed' | 'blocked',
                                      message: exec.ok ? (exec.output ?? 'selesai.') : (exec.error ?? 'gagal.'),
                                      transferCompleted,
                                    }).plan);
                                  }
                                } catch {
                                  /* kegagalan registry tidak boleh merusak rencana yang sudah disetujui */
                                }
                              }}
                            >
                              Setujui
                            </button>
                            <button
                              onClick={() => {
                                const r = denyStep(agentPlan, s.id, 'user');
                                if (r.ok) setAgentPlanTracked(r.plan);
                              }}
                            >
                              Tolak
                            </button>
                          </div>
                        )}
                        {s.status === 'failed' && (
                          <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                            <button
                              onClick={() => {
                                const r = retryStep(agentPlan, s.id);
                                if (r.ok) setAgentPlanTracked(r.plan);
                              }}
                            >
                              Coba lagi langkah ini
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
      {/* P6 — panel Review draft (overlay sendiri, lebih lebar dari panel
          riwayat/memori karena memuat tabel item; gaya inline agar tidak
          menyentuh lembar gaya bersama). Draft + lampiran DED dibaca
          segar tiap render; reviewTick memaksa render ulang sesudah
          aksi panel. */}
      {reviewOpen && (() => {
        const d = getLastUniversalDraft(effProject?.id);
        if (!d || !effProject) return null;
        let att: DedAttachment | null = null;
        try {
          att = loadDedAttachment(effProject.id);
        } catch {
          att = null;
        }
        return (
          <>
            <div className="ezchat2-hist-veil" onClick={() => setReviewOpen(false)} />
            <div
              role="dialog"
              aria-label="Review draft"
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 60,
                width: 'min(980px, calc(100vw - 24px))',
                maxHeight: 'min(82dvh, 760px)',
                overflowY: 'auto',
                background: 'var(--ez-color-surface, #FFFFFF)',
                border: '1px solid var(--ez-color-border-soft, #E2E8F0)',
                borderRadius: 16,
                boxShadow: '0 24px 48px -16px rgba(15,23,42,.28)',
                padding: 16,
              }}
            >
              <DraftReviewPanel
                draft={d}
                projectId={effProject.id}
                dedAttachment={att}
                pendingRevision={pendingRevisionRef.current}
                onApplyDraft={handleApplyReviewDraft}
                onResolveMissing={handleResolveMissingFromPanel}
                onActivateRevision={handleActivateRevisionFromPanel}
                onCancelRevision={handleCancelRevisionFromPanel}
                onCompareVersions={handleCompareVersionsFromPanel}
                onClose={() => setReviewOpen(false)}
              />
            </div>
          </>
        );
      })()}
      </div>{/* /.ezchat2-headerwrap */}

      <div className="ezchat2-main">
      {presentationMode === 'magic' && (
        <div
          className="ezchat2-magicbar"
          role="note"
          style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '8px 14px', background: 'var(--ez-color-surface-secondary, #EEF2FF)', borderBottom: '1px solid var(--ez-color-border-line, #E2E8F0)', fontSize: '12px', color: 'var(--ez-color-text-body, #334155)' }}
        >
          <span>
            Mode <strong>EZRAB Magic AI</strong> — workflow generasi proyek. Percakapan, draft, dan proyek Anda sama dengan EZRAB Chat AI.
          </span>
          <button
            type="button"
            onClick={() => setPresentationMode('chat')}
            style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--ez-color-border-line, #E2E8F0)', background: 'var(--ez-color-surface, #fff)', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer' }}
          >
            Buka tampilan Chat AI
          </button>
        </div>
      )}
      {presentationMode === 'chat' && enteredViaMagic && (
        <div
          className="ezchat2-magicbar"
          role="note"
          style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', background: 'var(--ez-color-surface-secondary, #EEF2FF)', borderBottom: '1px solid var(--ez-color-border-line, #E2E8F0)', fontSize: '12px', color: 'var(--ez-color-text-body, #334155)' }}
        >
          <span>Anda masuk lewat EZRAB Magic AI — percakapan dan draft proyek tetap sama di kedua tampilan.</span>
          <button
            type="button"
            onClick={() => setPresentationMode('magic')}
            style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--ez-color-border-line, #E2E8F0)', background: 'var(--ez-color-surface, #fff)', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer' }}
          >
            Kembali ke mode Magic AI
          </button>
        </div>
      )}
      {handoffOffer && presentationMode === 'magic' && (
        <div
          className="ezchat2-handoff"
          role="note"
          style={{ margin: '10px 14px 0', padding: '10px 12px', borderRadius: '8px', background: '#FFFBEB', border: '1px solid #FDE68A', fontSize: '12.5px', color: '#92400E', lineHeight: 1.5 }}
        >
          <p style={{ margin: '0 0 8px' }}>{handoffOffer}</p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => { setPresentationMode('chat'); setHandoffOffer(null); }}
              style={{ padding: '6px 12px', borderRadius: '6px', background: 'var(--ez-color-primary, #2563EB)', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 650, cursor: 'pointer' }}
            >
              {HANDOFF_CHOICE_CHAT}
            </button>
            <button
              type="button"
              onClick={() => setHandoffOffer(null)}
              style={{ padding: '6px 12px', borderRadius: '6px', background: '#fff', color: '#92400E', border: '1px solid #FDE68A', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
            >
              {HANDOFF_CHOICE_STAY}
            </button>
          </div>
        </div>
      )}
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
                    {/* Kuesioner spesifikasi adaptif (2026-11-12): kartu
                        interaktif di dalam pesan yang sama */}
                    {m.questionnaire && (
                      <QuestionnaireCard
                        payload={m.questionnaire}
                        submitted={m.questionnaireSubmitted === true}
                        onSubmit={(answers) => handleQuestionnaireSubmit(i, answers)}
                      />
                    )}
                    {/* Asisten AI: kartu konfirmasi operasi spreadsheet */}
                    {m.planId && (
                      <PlanControls
                        planId={m.planId}
                        busy={busyPlanId === m.planId}
                        onConfirm={handleConfirmPlan}
                        onCancel={handleCancelPlan}
                      />
                    )}
                    <div className="ezchat2-meta">
                      {m.model && <span className="ezchat2-model"><Sparkles size={11} /> {m.model}</span>}
                      {m.creditsUsed !== undefined && (
                        <span className="ezchat2-model" title="Pemakaian simulasi frontend — bukan penagihan nyata">
                          ⚡ {m.creditsUsed} kredit (simulasi)
                        </span>
                      )}
                      <button className="ezchat2-copy" onClick={() => copyMsg(i, m.content)} title="Salin jawaban (teks bersih)" aria-label="Salin jawaban sebagai teks bersih">
                        {copiedIdx === i ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                      <button className="ezchat2-copy" onClick={() => copyMsgMarkdown(i, m.content)} title="Salin sebagai Markdown (sumber)" aria-label="Salin jawaban sebagai Markdown">
                        {copiedMdIdx === i ? <Check size={13} /> : <FileText size={13} />}
                      </button>
                    </div>
                  </div>
                  {/* Coba Lagi: hanya pada entry error dari pipeline AI
                      yang menjadi pesan terakhir dan masih ada prompt
                      terakhir untuk dikirim ulang. */}
                  {m.isError && m.fromAi && i === messages.length - 1 && getRetryPrompt() && (
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
                  {/* P2: bila eksekusi runtime sudah melewati 'preparing',
                      tampilkan label TAHAP NYATA terakhir (dari event
                      eksekusi — S9: diturunkan dari stageHistory lewat
                      reportedExecutionStage); sebelum itu — termasuk
                      seluruh cabang jawaban lokal deterministik yang
                      sinkron dan tidak punya event tahap — teks status
                      klasifikasi lama tetap dipakai (tanpa tahap karangan). */}
                  <span className="ezchat2-thinking">{reportedActiveStage && reportedActiveStage !== 'preparing' ? EXECUTION_STAGE_LABELS[reportedActiveStage] : thinkingText}</span>
                  {/* Berhenti — pembatalan EKSPLISIT satu-satunya (lifecycle
                      fix 2026-11-12). Navigasi tidak pernah membatalkan;
                      tombol ini menghentikan request aktif ini saja. */}
                  <button
                    type="button"
                    onClick={stopActiveExecution}
                    disabled={!activeExec}
                    title="Hentikan jawaban ini"
                    aria-label="Hentikan jawaban AI"
                    style={{
                      marginLeft: 8, padding: '4px 10px', borderRadius: 999,
                      border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#991B1B',
                      fontWeight: 600, fontSize: 12, cursor: !activeExec ? 'default' : 'pointer',
                      opacity: !activeExec ? 0.5 : 1, flexShrink: 0,
                    }}>
                    Berhenti
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===== Banner follow-up proaktif FASE 3 (AGT-12) =====
          Pekerjaan belum selesai dari rencana tugas, disajikan SEKALI
          saat pengguna kembali — di dalam chat, bukan toast. */}
      {followUpBanner && (
        <div role="status" style={{
          margin: '0 16px 8px', padding: '10px 14px', borderRadius: 10,
          border: '1px solid #2563EB', background: '#EFF6FF', color: '#1E40AF',
          fontSize: 13, whiteSpace: 'pre-line',
        }}>
          {followUpBanner}
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                setFollowUpBanner(null);
                updateAgentPlan((p) => ({ ...p, followUpShownAt: new Date().toISOString() }));
                setPlanOpen(true);
              }}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #2563EB', background: '#FFF', color: '#1E40AF', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
            >
              Lihat rencana
            </button>
            <button
              type="button"
              onClick={() => {
                setFollowUpBanner(null);
                updateAgentPlan((p) => ({ ...p, followUpShownAt: new Date().toISOString() }));
              }}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#FFF', color: '#334155', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* ===== Banner kegagalan persist (NEW-02, Batch E) =====
          Pesan yang gagal tersimpan ke riwayat tampil di sini — tidak
          pernah diam-diam terlihat seperti sukses. Banner hilang sendiri
          sesudah satu persist berhasil, atau ditutup manual. */}
      {persistError && (
        <div role="alert" style={{
          margin: '0 16px 8px', padding: '10px 14px', borderRadius: 10,
          border: '1px solid #DC2626', background: '#FEF2F2', color: '#991B1B',
          fontSize: 13, whiteSpace: 'pre-line',
        }}>
          {persistError}
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => { setPersistError(null); reloadChat(); }}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #DC2626', background: '#FFF', color: '#991B1B', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
            >
              Muat Ulang
            </button>
            <button
              type="button"
              onClick={() => setPersistError(null)}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#FFF', color: '#334155', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* ===== Banner INTERRUPTED (jaminan reload §8) =====
          Tampil bila percakapan berakhir pada pesan pengguna tanpa balasan
          dan tanpa eksekusi hidup. Aksi manual Coba Lagi — tidak pernah
          auto-resubmit (request berbayar tidak boleh diduplikasi diam-diam). */}
      {interruptedPrompt && !busy && (
        <div role="status" style={{
          margin: '0 16px 8px', padding: '10px 14px', borderRadius: 10,
          border: '1px solid #F59E0B', background: '#FFFBEB', color: '#92400E',
          fontSize: 13, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <span>Permintaan terakhir terputus sebelum selesai (halaman dimuat ulang atau ditutup saat AI sedang menjawab).</span>
          <button
            type="button"
            onClick={retryLastAi}
            style={{
              padding: '6px 12px', borderRadius: 8, border: '1px solid #D97706',
              background: '#FFF', color: '#92400E', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}>
            Coba Lagi
          </button>
        </div>
      )}

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
      {/* ===== Dialog konfirmasi hapus percakapan (D-48, Batch E) =====
          Pola dialog in-app yang sama dengan Batch A (D-68/D-84).
          Mutasi hapus hanya berjalan dari tombol "Hapus" di sini. */}
      {pendingDeleteConv && (
        <div className="aic-modal-veil" onClick={() => setPendingDeleteConv(null)} role="dialog" aria-modal="true" aria-label="Konfirmasi hapus percakapan">
          <div className="aic-modal aic" onClick={(e) => e.stopPropagation()}>
            <h3>Hapus percakapan ini?</h3>
            <p className="aic-sub">
              Percakapan <strong>{pendingDeleteConv.title}</strong> ({pendingDeleteConv.messageCount} pesan)
              akan dihapus permanen beserta memori yang dipelajari dari percakapan ini.
              Tindakan ini tidak dapat dibatalkan. Percakapan lain tidak berubah.
            </p>
            <div className="aic-modal-actions">
              <button type="button" className="aic-btn-ghost" onClick={() => setPendingDeleteConv(null)}>Batal</button>
              <button
                type="button"
                className="aic-btn-primary"
                onClick={() => { const id = pendingDeleteConv.id; setPendingDeleteConv(null); deleteHistoryItem(id); }}
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Panel Tentang/version (D-49, Batch E — OD-18 opsi (a)) =====
          Dibuka dari judul header. Menampilkan info versi + mode nyata
          saat ini + konteks proyek — tanpa angka yang dikarang. */}
      {aboutOpen && (
        <div className="aic-modal-veil" onClick={() => setAboutOpen(false)} role="dialog" aria-modal="true" aria-label="Tentang Ezrab Chat AI">
          <div className="aic-modal aic" onClick={(e) => e.stopPropagation()}>
            <h3>{presentationMode === 'magic' ? 'EZRAB Magic AI' : 'Ezrab Chat AI'}</h3>
            <p className="aic-sub">
              Asisten AI EZRAB untuk estimasi RAB, AHSP 2026, dan analisis proyek.
            </p>
            <div className="aic-confirm-list">
              <div className="row"><span>Versi</span><strong>V {EZRAB_CHAT_AI_VERSION}</strong></div>
              <div className="row"><span>Mode AI</span><strong>{mode === 'fast' ? 'Cepat' : 'Mendalam'}</strong></div>
              <div className="row"><span>Proyek aktif</span><strong>{effProject?.name ?? 'Tanpa proyek aktif'}</strong></div>
              <div className="row"><span>Percakapan tersimpan</span><strong>{historyItems.length} percakapan</strong></div>
            </div>
            <p className="aic-sub">
              Percakapan tersimpan lokal di perangkat ini.
            </p>
            <div className="aic-modal-actions">
              <button type="button" className="aic-btn-primary" onClick={() => setAboutOpen(false)}>Tutup</button>
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

/**
 * EZRAB AI — Action Registry (src/ai-tools/ezrab-ai/actionRegistry.ts)
 *
 * Maps intents to REAL application actions. Navigation goes through the
 * injected navigator (WorkspaceView.setActiveMenu). Read actions use the
 * injected project snapshot. No fabricated results: every action returns
 * what actually happened.
 */

import { ChatIntent } from './intentRouter';
import { EZRAB_AI_TOOLS, getActiveProjectSnapshot } from './tools';
import {
  getAssistantOperationContext,
  buildUpdateQuantityPlan,
  buildUpdateUnitPricePlan,
  buildDeletePlan,
  buildAddPlan,
  buildUndoPlan,
  getLastUndoableRecord,
  writesDatasetGuard,
  resolveTargetItem,
} from './operations';
import { snapshotAllItems, type ProjectSnapshot } from './projectContext';
import { parseRequestedQuantity } from './chatAnswerTransfer';
import type { AnswerTransferPlan, ChatAnswerPushItem } from './chatAnswerTransfer';
// Handler perintah deterministik kelompok 1–5 (2026-11-17, gap P2–P8 +
// P12 audit perintah): logika perintah hidup di ./commands/*, registry
// hanya mendelegasikan (case di executeIntent, sesudah UNDO_LAST).
import { handleProjectCommand, resolveProjectTarget, PROJECT_MAX_NAME_LENGTH } from './commands/projectCommands';
import { handleQtoCommand, parseCreateQtoTarget, parseSyncQtoTarget, resolveQtoItemByName, qtoHasTransferablePrice, formatQtoItemLabel, type QtoChatItem, type CreateQtoItemInput } from './commands/qtoCommands';
import { handleDedDocCommand } from './commands/dedDocCommands';
import {
  handleExportCreditCommand,
  cleanRevisionLabel,
  REVISION_MAX_LABEL_LENGTH,
  type ExportFormat,
  type CreatedRevision,
  type TopUpCreditResult,
} from './commands/exportCreditCommands';
import { handleProjectSettingsCommand, parseSettingsPatch, formatPercentValue, type ProjectSettingsPatch } from './commands/projectSettingsCommands';
import {
  RabNeeds, extractRabNeeds, missingNeeds, buildDesignPrompt, summarizeRabNeeds,
  resolveLandAreaM2, stripLandPhrases, formatLengthM,
} from './rabNeeds';
import {
  RabSubtype, subtypeGroupFor, getSubtype, detectSubtypeFromText, findSubtypeTemplates,
} from './rabSubtypes';
import {
  RabMaterialGroup, materialGroupForScope, classifyMaterialText, formatMaterialKnownLine,
} from './rabMaterialClarify';
import {
  ProjectIntakeContext, extractProjectContext, isLandscapeFamily,
  landscapeConceptById, LANDSCAPE_CONCEPT_CHOICES, facilityLabel,
  landscapeWorkPackages, landscapeCatalogStatus, refreshContextFacts,
} from './projectIntake';
import {
  UniversalIntakeContext, SubcategoryDef, classifyUniversal,
  extractUniversalContext, refreshUniversalFacts, selectNextQuestion,
  buildUniversalBriefLines, coverageFor, parseScopeRemoval, matchRemovable,
  subcategoryById, parseAnchoredLinear,
} from './universalIntake';
import {
  loadDedAttachment,
  dedSpecsFromAttachment,
  sanitizeDedSpecs,
  dimsFromIntakeContext,
  reconcileDedQto,
  buildDedQtoDraftInfo,
  pendingQtoCorrections,
  mergeDedSpecsIntoSpecs,
  type DedAttachment,
  type DedQtoDraftInfo,
  type QtoCorrectionProposal,
  type DedSpecRevisionPreview,
} from './dedQtoIntegration';
import type { QtoUserDimensions } from './qtoBridge';
import {
  QuestionnairePayload, QuestionnaireValidationError,
  presentQuestionnaire, applyQuestionnaireAnswers, skipPendingQuestionnaire,
  questionnaireBriefLines, questionnaireGeneratePhrases, questionnaireTextLines,
  selectQuestionnaireQuestions, deriveStructuredSpecs,
} from './questionnaire';
import type { StructuredSpec } from './structuredSpec';
import type { BuildingModel } from './multiBuilding';
import type { QuestionnaireAnswerRecord } from './universalIntake';
import { RabTemplateService } from '../../services/rabTemplateService';
import { listUnifiedTemplates } from '../../services/rabTemplateCatalogAdapter';
import { officialAhspRepository } from '../../data/nationalCostDatabase/officialAhspRepository';
import { RESOURCE_PRICE_RECORDS } from '../../data/priceDatabase2026/priceMaster.generated';
import { priceResolver2026 } from '../../data/priceDatabase2026/resolver';
import { CREDIT_PLAN_LABELS } from '../../ai-credits/featureGate';
import { PLAN_CREDITS, FREE_INITIAL_CREDITS } from '../../ai-credits/config';
import type { CreditPlan } from '../../ai-credits/types';
import { searchChatAhsp, formatChatAhspResult, normalizeUnit } from './chatSearch';
import {
  EXPLAIN_AHSP_VS_ESTIMATE_TEXT,
  METHODOLOGY_MISSING_AHSP_TEXT,
  HOWTO_EXCEL_EXPORT_TEXT,
} from './chatExplanations';
import { clarifyTopicCard, clarifyPickResult } from './clarifyTopics';
import { evaluateCalculation } from './calcIntent';
import { findGamesMentioned, buildGameInfoAnswer } from '../../game-space/catalog';
import { buildDirectRab, displayTemplateBasisName, findDirectTemplate, formatDirectRabMessage, matchDirectRegion, getLastDirectRab } from './directRab';
import type { DirectRabResult, DirectRabFullAiCompletion } from './directRab';
import { buildSpecRab, buildSpecRabFromNeeds } from './specRab';
import { runRabIntentFlow, evaluateRabIntent, continueRabIntent, getLastRabIntentSpec, setLastRabIntentSpec, formatSpecSummaryLines, specToRabNeeds, unsupportedSpecReasons } from './rabIntentFlow';
import type { RabTemplateRecommendation } from './rabIntentFlow';
import { extractRabIntentSpec, mergeRabIntentSpec } from './rabIntentSpec';
import type { RabIntentSpec } from './rabIntentSpec';
import { buildUniversalDraft, formatUniversalDraftMessage, extractUniversalSpec, getLastUniversalDraft, getLastUniversalDraftProjectId, setLastUniversalDraft, effectiveItems, isPriceValidForTotal, itemKey } from './universalRab';
import type { UniversalDraft } from './universalRab';
import { getDraftProjectEnsurer } from './tempProject';
import { authorizeChatAiMutation } from './mutationInventory';
import { appendMutationAuditRecord } from './mutationAuditLog';
import { aiToolsProviderClient } from '../providerClient';
import { completeBudgetRabWithFullAi, buildFullAiCompletionSummary } from './fullAiRabCompletion';
import type { ChatRabCompletionDeps, FullAiCompletionSummary } from './fullAiRabCompletion';
import { saveIntakeContext, clearIntakeContext, peekIntakeContext, draftFingerprint } from './draftPersistence';
import { directPushFingerprint } from './directRabPush';
import { captureFeedback } from './constructionFeedback';

export interface ChatActionContext {
  /** Navigate to a menu id (WorkspaceView.setActiveMenu) */
  navigate: (menu: string) => void;
  /** Teks mentah pesan pengguna saat ini (untuk ekstraksi kebutuhan RAB) */
  rawText?: string;
  /**
   * P1-C (WC-02) — true HANYA bila pemanggilan ini berasal dari dispatch
   * tombol konfirmasi (`executeDirectConfirmation`) — BUKAN dari kirim
   * teks. Gerbang konfirmasi perintah langsung HANYA mengklaim slot
   * tertunda bila ini true; kirim-ulang teks perintah yang sama TIDAK
   * PERNAH mengklaim (D6 O-5: "ubah overhead jadi 10%" dua kali tidak
   * mengeksekusi — eksekusi hanya lewat klik tombol konfirmasi).
   * Produksi: hanya view.tsx yang memasang flag ini (di dalam
   * executeDirectConfirmation). Jalur teks (submit) tidak pernah
   * memasangnya.
   */
  claimDirectConfirmation?: boolean;
  /** Mode klarifikasi topik aktif (untuk case CLARIFY_QUERY):
   *  'ahsp' | 'harga-material' | 'harga-upah' | 'harga-alat' | 'template' */
  clarifyMode?: string;
  /** Current route/menu id, for contextual responses */
  currentMenu: string;
  /** Active project snapshot (null if none) */
  activeProject: { id: string; name: string } | null;
  /** All projects visible to the user (for listing) */
  projects: Array<{ id: string; name: string }>;
  /** Project RAB direct total (null if unknown) */
  projectTotal: number | null;
  /** RAB items of the active project (for deterministic ranking) */
  projectItems?: Array<{
    description: string;
    unit: string;
    volume: number;
    unitPrice: number | null;
    totalPrice: number;
    priceStatus: string;
  }> | null;
  /** Canonical cost breakdown (null if unknown) */
  projectCostBreakdown?: {
    grandTotal: number;
    overheadPercent: number;
    profitPercent: number;
    taxPercent: number;
  } | null;
  /** Mengganti nama proyek (disediakan view — memanggil updateProject
   *  milik aplikasi; mengembalikan true bila nama benar-benar diubah,
   *  false bila proyek tidak ditemukan). Tanpa callback ini, intent
   *  RENAME_PROJECT dijawab jujur "belum bisa" (fail-closed) — registry
   *  tidak pernah mengklaim rename berhasil tanpa eksekusi nyata. */
  renameProject?: (projectId: string, newName: string) => boolean;
  /* --- Perintah deterministik kelompok 1–5 (2026-11-17) ---
   * Pola yang sama dengan renameProject: callback disediakan view,
   * registry fail-closed jujur tanpa callback (tidak pernah mengklaim
   * eksekusi tanpa panggilan nyata). */
  /** Membuat proyek baru (view → createProject); null bila gagal. */
  createProject?: (name: string) => { id: string; name: string } | null;
  /** Menghapus proyek (view → deleteProject, sesudah konfirmasi langkah
   *  2); false bila proyek tidak ditemukan. */
  deleteProject?: (projectId: string) => boolean;
  /** Mengarsipkan proyek (view → updateProject status 'archived' +
   *  isArchived + archivedAt, pola CompletedProjectsView). */
  archiveProject?: (projectId: string) => boolean;
  /** Menduplikat proyek (view → createProject + suffix + duplicateProjectData). */
  duplicateProject?: (projectId: string) => { id: string; name: string } | null;
  /** Membuat item QTO manual di proyek aktif (view → createManualQtoItem). */
  createQtoItem?: (input: CreateQtoItemInput) => { id: string; kode: string } | null;
  /** Daftar item QTO proyek aktif (view memetakan projectQtoItems;
   *  snapshot chat tidak memuat QTO). */
  listQtoItems?: () => QtoChatItem[];
  /** Mensinkron SATU item QTO ke RAB (view → syncQtoToRabSpreadsheet). */
  syncQtoItem?: (qtoItemId: string) => boolean;
  /** Gerbang paket DED (view ← planAllowsAiFeature(plan, 'ded-ai'));
   *  undefined = fail-closed. */
  dedAiAvailable?: boolean;
  /** Pesan penolakan gerbang DED (aiFeatureLockedMessage). */
  dedAiLockedMessage?: string;
  /** Gerbang paket AI Document (view ← planAllowsAiFeature(plan,
   *  'ai-document')); undefined = fail-closed. */
  docAiAvailable?: boolean;
  /** Pesan penolakan gerbang AI Document (aiFeatureLockedMessage). */
  docAiLockedMessage?: string;
  /** Memicu ringkasan headless (view → dokumenAiService.chat, async;
   *  hasil diposting view sebagai pesan chat). Tanpa callback, handler
   *  memakai jalur handoff ke AI Document. */
  requestDocSummary?: (docId: string, fileName: string) => void;
  /** Mengekspor proyek aktif (view → exporter; async di view, kedua
   *  exporter memicu unduhan sendiri). */
  exportProject?: (format: ExportFormat) => void;
  /** Membuat revisi baru (view → createEstimateVersion; label undefined
   *  = konvensi UI nextVersionNumber). */
  createRevision?: (label: string | undefined) => CreatedRevision | null;
  /** Saldo kredit total dari hook yang sudah ter-mount; null = tak tersedia. */
  creditBalance?: number | null;
  /** Sumber saldo (BalanceSource dari useCreditSimulation). */
  creditSource?: 'server' | 'simulation' | 'unavailable';
  /** Top-up simulasi per itemId katalog (view → topUp hook / mockTopUp). */
  topUpCredits?: (itemId: string) => TopUpCreditResult | null;
  /** Menerapkan patch pengaturan ke proyek aktif (view → updateProject +
   *  refreshProjectTotals; patch HANYA berisi field yang disebut
   *  perintah — tidak pernah field lain). */
  updateProjectSettings?: (projectId: string, patch: ProjectSettingsPatch) => boolean;
  /* --- Perintah deterministik Workstream B1 (2026-11-19, gap P2 + P6 +
   * §K baris 42 audit perintah) — pola callback yang sama: disediakan
   * view, registry fail-closed jujur tanpa callback. --- */
  /** Memicu pratinjau transfer draft universal (view →
   *  pushUniversalToSpreadsheetPreview — alur yang SAMA seperti tombol
   *  Push, termasuk tombol Konfirmasi Transfer + pengikatan approval).
   *  Mengembalikan true bila pratinjau ditampilkan, false bila tidak
   *  ada draft aktif. Tanpa callback, TRANSFER_DRAFT dijawab jujur
   *  "belum bisa". */
  requestDraftTransferPreview?: () => boolean;
  /** Menetapkan override harga per-proyek (view →
   *  updateProjectPriceOverride milik aplikasi; mengembalikan true bila
   *  override benar-benar ditulis untuk proyek itu). Dipanggil HANYA
   *  dari SET_PROJECT_PRICE_CONFIRM (sesudah pratinjau + klik tombol
   *  konfirmasi) — langkah 1 tidak pernah menulis. */
  setProjectPriceOverride?: (projectId: string, input: ProjectPriceOverrideInput) => boolean;
  /** Paket kredit aktif dari hook yang sudah ter-mount (untuk
   *  CHANGE_PLAN — tanpa ini handler tidak bisa mendeteksi "sudah di
   *  paket itu" dan fail-closed, karena setPlan mengatur ulang saldo
   *  simulasi meski paketnya sama). */
  creditPlan?: CreditPlan;
  /** Mengganti paket simulasi (view → setPlan hook; no-op + ok:false di
   *  luar mode simulasi — paket akun nyata tidak diganti dari chat). */
  changeCreditPlan?: (plan: CreditPlan) => ChangePlanResult;
}

/** Input override harga per-proyek — diteruskan verbatim ke
 *  updateProjectPriceOverride milik aplikasi (ProjectContext). */
export interface ProjectPriceOverrideInput {
  /** Kode resource master (tidak pernah kosong — record berkode kosong
   *  ditolak resolver sebelum sampai ke sini). */
  resourceCode: string;
  /** Nama resource persis dari record master yang diresolusi. */
  resourceName: string;
  category: 'MATERIAL' | 'LABOR' | 'EQUIPMENT';
  /** Satuan record master (harga proyek berlaku per satuan ini). */
  unit: string;
  /** Harga master pembanding (referensi delta — bukan harga berlaku). */
  masterPrice: number;
  /** Harga baru yang berlaku untuk satu proyek ini. */
  projectPrice: number;
}

/** Hasil ganti paket yang dikembalikan callback view. */
export interface ChangePlanResult {
  /** true bila paket simulasi benar-benar berganti. */
  ok: boolean;
  /** Paket baru sesudah ganti (null bila gagal). */
  plan: CreditPlan | null;
  /** Saldo simulasi baru = jatah paket baru (null bila gagal). */
  newBalance: number | null;
  /** Alasan kegagalan yang jujur. */
  reason?: string;
}

export interface ChatActionButton {
  /** Label tombol */
  label: string;
  /** Aksi: navigasi ke menu, atau intent untuk diproses ulang.
   * 'nav-entry' (Command Router 2026-10-26): chip menuju satu entry registry
   * (navRegistry.ts) — diperlukan karena filter proyek dan aksi tutorial
   * tidak bisa diungkapkan hanya dengan string menu. */
  action:
    | { kind: 'navigate'; menu: string }
    | { kind: 'nav-entry'; entryId: string }
    | { kind: 'intent'; intent: string; param?: string }
    | { kind: 'push-rab' }
    /* W11 §11 (S1-R5) — konfirmasi push direct: tombol pada pesan
     * pratinjau push-rab; tanpa pratinjau aktif (binding), handler
     * view menolak menulis. */
    | { kind: 'push-rab-confirm' }
    | { kind: 'push-universal' }
    | { kind: 'push-universal-confirm' }
    /* Fast Track §3 (P1-04/P1-05) — konfirmasi push item jawaban:
     * tombol pada pesan PRATINJAU "Tambah ke Spreadsheet"; tanpa slot
     * konfirmasi yang sah (sidik pratinjau + TTL + sekali pakai),
     * handler view menolak menulis. msgIndex = jawaban yang
     * ditransfer (rencana direkomputasi segar saat konfirmasi). */
    | { kind: 'push-answer-items-confirm'; msgIndex: number }
    /* Lengkapi dengan Full AI (§5 budget-based RAB): tombol pada jawaban
     * draft parsial ber-budget — target = draft yang tombolnya diklik
     * (view menentukan dari aksi jawaban itu). Ditangani async di view
     * lewat executeBudgetFullAiRab (bukan lewat executeIntent sinkron). */
    | { kind: 'budget-full-ai-complete'; target?: 'universal' | 'direct' }
    /* P1-08 (H-12) — "Batalkan lengkapan": mengembalikan draft ke
     * snapshot pra-completion (universal) atau membersihkan isian AI
     * (direct). Snapshot diambil SEBELUM completeUniversalDraftWithFullAi
     * bermutasi; tombol hanya muncul pada pesan hasil completion. */
    | { kind: 'budget-full-ai-undo'; target: 'universal' | 'direct' }
    /* Fast Track (P1-08 penuh, H-12) — terima / buang lengkapan yang
     * tertunda: tombol pada pesan PRATINJAU completion. Terima menukar
     * draft live dengan klon terisi + autosave (view); buang hanya
     * membuang klon tertunda di memori (draft tidak berubah). */
    | { kind: 'budget-full-ai-accept'; target: 'universal' | 'direct' }
    | { kind: 'budget-full-ai-discard'; target: 'universal' | 'direct' }
    /* GATE 3 (5C) — revisi immutable: konfirmasi / batal pratinjau revisi
     * yang menunggu, dan tampilkan riwayat versi. */
    | { kind: 'revision-confirm' }
    | { kind: 'revision-cancel' }
    | { kind: 'revision-history' }
    /* GATE 4 (5D) — integrasi DED/QTO: konfirmasi / tolak SATU usulan
     * koreksi QTO (correctionId = `qto:<itemId>`), dan konfirmasi /
     * tolak SATU pratinjau revisi spek DED (previewId dari
     * buildDedSpecRevisionPreview). Keputusan per item — tombol tidak
     * pernah menerapkan koreksi lain; usulan yang sudah diputuskan
     * dijawab jujur (bukan diterapkan dua kali).
     * Fast Track Continuation A2 — pengikatan nilai tampilan: tombol
     * konfirmasi membawa nilai usulan YANG DITAMPILKAN saat tombol
     * dibuat (expectedQuantity/Unit + dedQuantity/Unit); handler
     * menolak bila rekomputasi segar menghasilkan nilai berbeda —
     * tanpa ini konfirmasi bisa menerapkan nilai yang tidak pernah
     * ditinjau pengguna. Keempatnya opsional (tombol lama tanpa
     * pengikatan tetap jalan dengan perilaku rekomputasi lama). */
    | { kind: 'qto-correction-confirm'; correctionId: string; expectedQuantity?: number; expectedUnit?: string; dedQuantity?: number; dedUnit?: string }
    | { kind: 'qto-correction-reject'; correctionId: string }
    | { kind: 'ded-spec-confirm'; previewId: string }
    | { kind: 'ded-spec-reject'; previewId: string };
}

export interface ActionResult {
  ok: boolean;
  /** Message to show in chat (already in Indonesian) */
  message: string;
  /** Whether the chat navigated away (UI may want to react) */
  navigated?: boolean;
  /** Whether the chat should open the Game Space overlay panel */
  openGameSpace?: boolean;
  /** Interactive action buttons (Command Center P0) */
  actions?: ChatActionButton[];
  /** Whether to open the RAB Wizard overlay */
  openRabWizard?: boolean;
  /** Whether to open the AI Design Studio overlay */
  openDesignStudio?: boolean;
  /** Prefill prompt untuk design studio */
  designPrompt?: string;
  /** Chat menunggu jawaban kelengkapan kebutuhan RAB dari pengguna */
  awaitRabNeeds?: boolean;
  /** Kartu pilihan RAB bertipe sedang menunggu pilihan/koreksi pengguna (D1) */
  awaitRabChoice?: boolean;
  /** Chat menunggu jawaban subtipe pekerjaan (klarifikasi "Jalan apa?") */
  awaitRabSubtype?: boolean;
  /** Chat menunggu jawaban klarifikasi material (gerbang bahan sebelum draft) */
  awaitRabMaterial?: boolean;
  /** Chat menunggu jawaban intake konteks proyek (konsep/fasilitas/kondisi
   * landscape — Conversational Intelligence Upgrade 2026-11-10) */
  awaitProjectConcept?: boolean;
  /** Kuesioner spesifikasi adaptif yang harus dirender sebagai kartu
   * interaktif pada pesan ini (Adaptive Questionnaire 2026-11-12).
   * Teks pesannya sendiri memuat salinan terbaca kuesioner yang sama. */
  questionnaire?: QuestionnairePayload;
  /** Chat menunggu query lanjutan klarifikasi topik (nilai = mode-nya) */
  awaitClarify?: string;
  /** Prompt Full AI yang disusun dari kebutuhan terkumpul (dijalankan view) */
  fullAiPrompt?: string;
  /** ID plan operasi (ChangePlan) yang pratinjaunya ada pada pesan ini —
   *  view meneruskannya ke ChatEntry.planId sehingga kartu Konfirmasi
   *  Eksekusi ter-render (mutasi item deterministik 2026-11-17). */
  planId?: string;
  /** B5-3: id proyek yang dipastikan untuk draft ini (baru dibuat
   *  sementara ATAU proyek yang sudah aktif) — hanya diisi bila draft
   *  berhasil dibuat TANPA projectId pemanggil. Pemanggil yang membawa
   *  konteks intake (generateFromUniversalContext) memakai ini untuk
   *  mengikat snapshot intake ke proyek yang sama. */
  ensuredProjectId?: string;
}

const MENU_LABELS: Record<string, string> = {
  'template-rab': 'Template RAB',
  'proyek': 'Daftar Proyek',
  'rab-estimasi': 'RAB & Estimasi',
  'qto': 'QTO / Kalkulator Volume',
  'ahsp': 'AHSP 2026',
  'laporan': 'Laporan',
  'dokumen-ai': 'AI Document',
  'ded-ai': 'DED Estimate AI',
  'pengaturan': 'Pengaturan',
  'dashboard': 'Dashboard',
};

const INTENT_TO_MENU: Partial<Record<ChatIntent, string>> = {
  OPEN_TEMPLATE: 'template-rab',
  OPEN_PROJECTS: 'proyek',
  OPEN_RAB: 'rab-estimasi',
  OPEN_QTO: 'qto',
  OPEN_AHSP: 'ahsp',
  OPEN_REPORTS: 'laporan',
  OPEN_AI_DOCUMENTS: 'dokumen-ai',
  OPEN_DED_ESTIMATE: 'ded-ai',
  OPEN_SETTINGS: 'pengaturan',
  OPEN_DASHBOARD: 'dashboard',
};

function fmtIDR(n: number): string {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}

/* ------------------------------------------------------------------ */
/* Chat-to-RAB (Fase 2): state ringkasan kebutuhan sesi ini.           */
/* Wizard/studio TIDAK dibuka dari teks perintah — hanya dari klik    */
/* tombol "Buka Workspace Desain & RAB" pada ringkasan (persetujuan).  */
/*                                                                     */
/* SCOPE PER-PROYEK (Workstream B1, 2026-11-19): lastRabNeeds adalah   */
/* variabel module-level yang bertahan lintas proyek dalam satu sesi   */
/* halaman — kebutuhan rumah proyek A diam-diam dipakai ulang bila     */
/* pengguna pindah ke proyek B lalu mengetik "itu aja" / klik Full AI  */
/* (finalisasi membangun draft dari kebutuhan proyek lama). Setiap     */
/* penulisan kini mencatat proyek pemiliknya; setiap pembacaan         */
/* perilaku (bukan getter diagnostik) melewati scopedLastRabNeeds:     */
/* bila proyek pemilik ≠ proyek saat ini (keduanya non-null), state    */
/* dianggap basi, DIBERSIHKAN SENDIRI, dan pembaca memperlakukannya    */
/* sebagai "tidak ada sesi kebutuhan" — alur draft RAB yang sah (satu  */
/* proyek yang sama dari ringkasan sampai finalisasi) tidak berubah.   */
/* null di kedua sisi = tanpa proyek aktif — bukan ketidakcocokan.     */
/* ------------------------------------------------------------------ */
let lastRabNeeds: RabNeeds | null = null;
let lastRabRaw = '';
/** Proyek pemilik lastRabNeeds (null = ditangkap tanpa proyek aktif). */
let lastRabNeedsProjectId: string | null = null;

/** Tulis kebutuhan + scope proyeknya (null = hapus state + scope).
 *  Diekspor (W11 §11) untuk hidrasi state rumah sesudah muat ulang
 *  (efek pemulihan view.tsx) — pemanggil produksi lain tidak berubah. */
export function setLastRabNeeds(needs: RabNeeds | null, projectId?: string | null): void {
  lastRabNeeds = needs;
  lastRabNeedsProjectId = needs ? (projectId ?? null) : null;
  if (!needs) lastRabRaw = '';
}

/**
 * Baca kebutuhan rumah yang masih berlaku untuk proyek ini (W11 §11 —
 * dipakai efek persistensi view.tsx; pembacaan perilaku lain tetap
 * lewat scopedLastRabNeeds di bawah).
 */
export function getLastRabNeeds(projectId?: string | null): RabNeeds | null {
  return scopedLastRabNeeds(projectId);
}

/**
 * Baca kebutuhan yang masih berlaku untuk proyek ini. Pemanggil lama
 * tanpa scope (projectId undefined) mendapat perilaku lama (tanpa
 * filter) — seluruh pemanggil produksi kini meneruskan scope.
 */
function scopedLastRabNeeds(projectId?: string | null): RabNeeds | null {
  if (!lastRabNeeds) return null;
  if (projectId === undefined) return lastRabNeeds;
  const stored = lastRabNeedsProjectId;
  if (stored !== null && projectId !== null && stored !== projectId) {
    // Basi: kebutuhan milik proyek lain — bersihkan sendiri agar tidak
    // dipakai ulang oleh jalur lain sesudahnya.
    setLastRabNeeds(null);
    return null;
  }
  return lastRabNeeds;
}

export function getLastRabDesignPrompt(projectId?: string | null): string | null {
  const needs = scopedLastRabNeeds(projectId);
  if (!needs) return null;
  return buildDesignPrompt(needs, lastRabRaw);
}

/* ------------------------------------------------------------------ */
/* Klarifikasi subtipe (permintaan user 2026-10-23): untuk kategori    */
/* berpeta subtipe (jalan/drainase/jembatan), ringkasan TIDAK langsung */
/* memberi kartu jalur. Bila subtipe belum disebut, chat bertanya      */
/* balik dulu ("Jalan apa?") dengan tombol subtipe — lokal penuh,      */
/* tanpa panggilan AI/kredit. Sesudah subtipe dipilih (klik tombol     */
/* atau disebut di teks), barulah kartu jalur tampil: Pakai template / */
/* Full AI / Dari gambar DED.                                          */
/* ------------------------------------------------------------------ */
let pendingSubtypeNeeds: RabNeeds | null = null;
/** Proyek pemilik pendingSubtypeNeeds — scope yang sama dengan
 *  lastRabNeeds (pertanyaan subtipe proyek A tidak boleh dijawab
 *  "hotmix" di proyek B lalu menabur kebutuhan basi ke lastRabNeeds). */
let pendingSubtypeProjectId: string | null = null;

function setPendingSubtypeNeeds(needs: RabNeeds | null, projectId?: string | null): void {
  pendingSubtypeNeeds = needs;
  pendingSubtypeProjectId = needs ? (projectId ?? null) : null;
}

/** Baca pertanyaan subtipe yang masih berlaku untuk proyek ini
 *  (aturan ketidakcocokan yang sama dengan scopedLastRabNeeds). */
function scopedPendingSubtypeNeeds(projectId?: string | null): RabNeeds | null {
  if (!pendingSubtypeNeeds) return null;
  if (projectId === undefined) return pendingSubtypeNeeds;
  const stored = pendingSubtypeProjectId;
  if (stored !== null && projectId !== null && stored !== projectId) {
    setPendingSubtypeNeeds(null);
    return null;
  }
  return pendingSubtypeNeeds;
}

export function getPendingSubtypeNeeds(): RabNeeds | null {
  return pendingSubtypeNeeds;
}

/** Isi subtipe dari teks bila kategori punya peta & subtipe belum terisi. */
function applySubtypeDetection(needs: RabNeeds, raw: string): void {
  if (needs.subtypeId || !subtypeGroupFor(needs.kind)) return;
  const det = detectSubtypeFromText(needs.kind, raw);
  if (det) {
    needs.subtypeId = det.id;
    needs.subtypeLabel = det.label;
  }
}

/**
 * Deteksi teks keluaran buildFullAiPrompt (prompt siap-LLM), agar case
 * RAB_FULL_AI TIDAK mem-parse-nya sebagai teks perintah mentah pengguna.
 * Prompt hasil susunan selalu diawali "Buatkan RAB " dan memuat frasa
 * "Susun daftar pekerjaan lengkap".
 */
function isBuiltFullAiPrompt(text: string): boolean {
  return text.startsWith('Buatkan RAB ') && text.includes('Susun daftar pekerjaan lengkap');
}

/** Prompt Full AI dari kebutuhan terkumpul (jenis+subtipe+ukuran terbawa). */
export function buildFullAiPrompt(needs: RabNeeds): string {
  const parts: string[] = [`Buatkan RAB ${needs.kindLabel ?? 'pekerjaan'}`];
  if (needs.subtypeLabel) parts.push(`jenis ${needs.subtypeLabel}`);
  if (needs.lengthM) parts.push(`panjang ${formatLengthM(needs.lengthM)}`);
  if (needs.location) parts.push(`lokasi ${needs.location}`);
  return (
    `${parts.join(', ')}. Susun daftar pekerjaan lengkap dari persiapan sampai ` +
    'selesai beserta volume dan harga satuannya memakai data AHSP 2026 dan ' +
    'template EZRAB (gunakan alat pencarian yang tersedia). Tandai dengan ' +
    'jelas setiap harga yang belum ada data resminya — jangan mengarang angka.'
  );
}

function subtypeQuestionResult(needs: RabNeeds): ActionResult {
  const group = subtypeGroupFor(needs.kind)!;
  const summary = summarizeRabNeeds(needs, missingNeeds(needs), { closingLine: false, hints: false });
  return {
    ok: true,
    message:
      `${summary}\n\n**${group.question}** Pilih jenisnya di bawah — sesudah itu ` +
      'saya tampilkan pilihan membuatnya lewat **Template** atau **Full AI**. ' +
      'Bisa juga langsung ketik jenisnya, misalnya "hotmix".',
    awaitRabSubtype: true,
    actions: [
      ...group.subtypes.map((s) => ({
        label: s.label,
        action: { kind: 'intent', intent: 'RAB_SUBTYPE_SELECT', param: s.id } as const,
      })),
      { label: 'Mulai manual', action: { kind: 'navigate', menu: 'rab-estimasi' } as const },
    ],
  };
}

function pathCardResult(needs: RabNeeds): ActionResult {
  const subtype = getSubtype(needs.kind, needs.subtypeId);
  const summary = summarizeRabNeeds(needs, missingNeeds(needs), { closingLine: false, hints: false });
  const lines: string[] = [summary, ''];
  lines.push(
    `Catatan jujur: AI Design Studio saat ini khusus bangunan (rumah/gedung) — ` +
      `pekerjaan ${needs.kindLabel ?? 'ini'} tidak saya arahkan ke wizard rumah.`
  );
  lines.push('');
  lines.push('Pilih cara membuat RAB-nya:');
  lines.push(
    `• **Pakai template** — mulai dari template RAB ${subtype?.label ?? ''} yang sudah jadi di katalog EZRAB.`
  );
  lines.push('• **Full AI** — AI menyusun RAB dari kebutuhan di atas (memakai kredit AI seperti chat biasa).');
  lines.push('• **Dari gambar DED** — estimasi dari file gambar kerja Anda.');
  return {
    ok: true,
    message: lines.join('\n'),
    actions: [
      { label: 'Pakai template', action: { kind: 'intent', intent: 'RAB_PATH_TEMPLATE' } },
      { label: 'Full AI', action: { kind: 'intent', intent: 'RAB_FULL_AI', param: buildFullAiPrompt(needs) } },
      { label: 'Dari gambar DED', action: { kind: 'navigate', menu: 'ded-ai' } },
    ],
  };
}

/**
 * Jawaban subtipe yang DIKETIK pengguna selama pertanyaan subtipe aktif.
 * Mengembalikan null bila tidak ada pertanyaan aktif atau teks tidak
 * menyebut subtipe apa pun — pemanggil (view) lalu memproses pesan
 * secara normal (perintah baru menggugurkan status menunggu).
 */
export function tryContinueRabSubtype(text: string, projectId?: string | null): ActionResult | null {
  const pending = scopedPendingSubtypeNeeds(projectId);
  if (!pending) return null;
  const det = detectSubtypeFromText(pending.kind, text);
  if (!det) return null;
  // Gabungkan kebutuhan lain yang ikut disebut (mis. "hotmix, panjang 2 km").
  const merged = extractRabNeeds(text, { ...pending });
  merged.subtypeId = det.id;
  merged.subtypeLabel = det.label;
  setPendingSubtypeNeeds(null);
  setLastRabNeeds(merged, projectId);
  lastRabRaw = text;
  return pathCardResult(merged);
}

/* ------------------------------------------------------------------ */
/* Gerbang klarifikasi MATERIAL (perintah owner 2026-11-10): untuk     */
/* kategori pekerjaan spesifik berpeta bahan (atap, pondasi — lihat    */
/* rabMaterialClarify.ts), draft universal TIDAK langsung disusun bila */
/* bahan belum disebut: chat bertanya balik dulu dengan tombol pilihan */
/* bahan NYATA dari katalog. Pola sama persis dengan klarifikasi       */
/* subtipe di atas: satu putaran ringkas, jawaban bisa diklik/diketik, */
/* dan afirmasi ("itu aja") selalu bisa melewati — draft lalu memakai  */
/* asumsi yang DINYATAKAN TERBUKA di dalam draft-nya. Bahan yang       */
/* disebut tetapi belum ada template-nya (baja ringan, foot plat, …)   */
/* TIDAK diganti template lain secara diam-diam: dijawab jujur +       */
/* ditawarkan jalur Full AI dengan bahan persis itu.                   */
/* ------------------------------------------------------------------ */
interface PendingRabMaterial {
  rawText: string;
  group: RabMaterialGroup;
  /** GATE 4 (5D): proyek pemilik permintaan — agar draft susulan (sesudah
   *  jawaban bahan) tetap membawa lampiran DED proyek ini. */
  projectId?: string | null;
}

let pendingMaterialGate: PendingRabMaterial | null = null;

export function getPendingRabMaterial(): PendingRabMaterial | null {
  return pendingMaterialGate;
}

/** Pertanyaan klarifikasi material (tombol bahan nyata dari katalog). */
function materialQuestionResult(rawText: string, group: RabMaterialGroup, projectId?: string | null): ActionResult {
  pendingMaterialGate = { rawText, group, projectId: projectId ?? null };
  const known = formatMaterialKnownLine(extractUniversalSpec(rawText));
  const lines: string[] = [
    `Siap — sebelum saya susun draft RAB ${group.workLabel}-nya, bahannya perlu jelas dulu: ` +
      'pilihan bahan mengubah susunan item dan harga, dan katalog EZRAB punya beberapa ' +
      `sistem ${group.workLabel} yang berbeda.`,
  ];
  if (known) lines.push('', `Yang sudah jelas dari permintaan Anda: **${known}**.`);
  lines.push(
    '',
    `**${group.question}**`,
    '',
    'Pilih lewat tombol di bawah, atau ketik bahannya langsung (mis. "baja ringan + spandek"). ' +
      'Bila ingin lanjut sekarang tanpa menentukan bahan, jawab **"itu aja"** — draft akan saya ' +
      'susun dengan asumsi yang dinyatakan terbuka di dalamnya.'
  );
  return {
    ok: true,
    message: lines.join('\n'),
    awaitRabMaterial: true,
    actions: [
      ...group.options.map((o) => ({
        label: o.label,
        action: { kind: 'intent', intent: 'RAB_MATERIAL_SELECT', param: o.id } as const,
      })),
      { label: 'Susun saja — pakai asumsi terbuka', action: { kind: 'intent', intent: 'RAB_MATERIAL_SELECT', param: 'assume' } as const },
      { label: 'Mulai manual', action: { kind: 'navigate', menu: 'rab-estimasi' } as const },
    ],
  };
}

/** Prompt Full AI untuk bahan yang disebut pengguna tetapi belum ada template-nya. */
function buildMaterialFullAiPrompt(rawText: string, group: RabMaterialGroup, materialLabel: string): string {
  return (
    `Buatkan RAB ${group.workLabel} untuk permintaan pengguna berikut: "${rawText}". ` +
    `Bahan yang diminta pengguna: ${materialLabel} — katalog template EZRAB belum punya ` +
    'template untuk bahan ini. Susun daftar pekerjaan lengkap dari persiapan sampai ' +
    'selesai memakai data AHSP 2026 dan data EZRAB untuk bahan tersebut (gunakan alat ' +
    'pencarian yang tersedia), hitung volume dari dimensi pada permintaan, dan tandai ' +
    'dengan jelas setiap harga yang merupakan estimasi beserta dasarnya — jangan ' +
    'mengarang angka; bila harga suatu item belum tersedia, nyatakan belum tersedia.'
  );
}

/**
 * Jawaban jujur untuk bahan TANPA template: tidak disusun dari template
 * lain (hasilnya pasti salah bahan — persis keluhan owner 2026-11-10),
 * ditawarkan Full AI dengan bahan persis itu + tanya ulang bahan katalog.
 * State gerbang DIPERTAHANKAN agar tombol "Pilih bahan katalog" bisa
 * menampilkan pertanyaan lagi; sesi kebutuhan rumah dibersihkan agar
 * klik Full AI jatuh ke fallback prompt (bukan komposisi basi).
 */
function materialUntemplatedResult(rawText: string, group: RabMaterialGroup, materialLabel: string, projectId?: string | null): ActionResult {
  pendingMaterialGate = { rawText, group, projectId: projectId ?? null };
  setLastRabNeeds(null);
  return {
    ok: true,
    message:
      `Bahan yang Anda sebutkan — **${materialLabel}** — saat ini **belum ada template-nya** ` +
      `di katalog EZRAB, jadi saya tidak menyusunnya dari template bahan lain (hasilnya akan salah bahan). ` +
      `Jalur yang bisa memakai bahan persis itu adalah **Full AI**: komposisi dari data AHSP 2026 dengan bahan **${materialLabel}**. ` +
      'Klik "Susun via Full AI" untuk melanjutkan, atau "Pilih bahan katalog" untuk melihat bahan yang templatenya sudah tersedia.',
    actions: [
      { label: 'Susun via Full AI', action: { kind: 'intent', intent: 'RAB_FULL_AI', param: buildMaterialFullAiPrompt(rawText, group, materialLabel) } as const },
      { label: 'Pilih bahan katalog', action: { kind: 'intent', intent: 'RAB_MATERIAL_SELECT', param: 'reask' } as const },
      { label: 'Mulai manual', action: { kind: 'navigate', menu: 'rab-estimasi' } as const },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* INTAKE KONTEKS PROYEK PERCAKAPAN (Conversational Intelligence       */
/* Upgrade — master prompt owner 2026-11-10).                          */
/*                                                                     */
/* Lapisan di atas alur yang ada, BUKAN sistem paralel: konteks        */
/* proyek terstruktur (projectIntake.ts) bertahan antar-pesan; untuk   */
/* keluarga LANDSCAPE/taman, asisten melanjutkan percakapan secara     */
/* natural — satu pertanyaan paling relevan pada satu waktu (konsep →  */
/* fasilitas per konsep → kondisi lahan → pratinjau) — alih-alih menu  */
/* generik 4 jalur atau draft langsung. Kategori lain TIDAK diambil    */
/* alih di sini: rumah tetap ringkasan kebutuhan, jalan/drainase/      */
/* jembatan tetap klarifikasi subtipe, atap/pondasi tetap gerbang      */
/* material, sisanya draft universal — gerbang ini mengembalikan null  */
/* untuk semuanya. Pembangkitan akhir tetap buildUniversalDraft        */
/* (mesin kanonis katalog) lewat universalResultFor.                   */
/* ------------------------------------------------------------------ */
let projectCtx: ProjectIntakeContext | null = null;

/* Konteks intake UNIVERSAL (universalIntake.ts) — sesi percakapan
 * lintas kategori; state module-level yang sama polanya dengan
 * projectCtx, hidup berdampingan (satu topik hanya dimiliki satu
 * gerbang pada satu waktu — gerbang yang mengambil alih membersihkan
 * state gerbang lain). */
let universalCtx: UniversalIntakeContext | null = null;

export function getUniversalContextState(): UniversalIntakeContext | null {
  return universalCtx;
}

export function clearUniversalContext(): void {
  universalCtx = null;
}

/* ------------------------------------------------------------------ */
/* GATE 1 (5A, 2026-11-12) — persistensi snapshot intake DI TINGKAT    */
/* REGISTRY. Alasan: registry adalah pemilik siklus hidup konteks —    */
/* ia yang membersihkan singleton secara sinkron di dalam generate     */
/* (dulu: efek simpan view yang berjalan sesudah render selalu         */
/* menemukan singleton null dan tidak menyimpan apa-apa). Karena itu   */
/* titik-titik commit registry menyimpan snapshotnya SENDIRI,          */
/* sinkron, sebelum singleton dibersihkan — efek view tetap ada        */
/* sebagai cadangan per-giliran, bukan sebagai satu-satunya mekanisme. */
/* Kegagalan simpan TIDAK PERNAH menggagalkan alur (generate/           */
/* jawaban tetap berjalan; state memori tetap utuh) — kegagalan hanya   */
/* dicatat lewat nilai balik untuk observabilitas tes. Tanpa           */
/* projectId (tes / jalur lama) tidak ada penyimpanan: snapshot        */
/* SELALU terikat proyek (pelajaran ARS-06).                           */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* S3-A (2026-11-23) — last-seen snapshot intake per proyek: baseline  */
/* optimistic concurrency ANTAR-TAB untuk jalur registry (generate +   */
/* drop). Peta modul = satu salinan PER TAB (tiap tab memuat salinan   */
/* modulnya sendiri), persis seperti `universalCtx` di atas. View      */
/* mencatat versinya lewat noteIntakeSnapshotVersion setiap kali ia    */
/* membaca/menulis snapshot (efek simpan/pulih/refresh); registry      */
/* mencatat versinya sendiri setiap kali persistIntakeSnapshotNow      */
/* sukses. Tanpa entri (tab ini belum pernah melihat snapshot proyek   */
/* itu) → tidak ada baseline → perilaku lama (guard tidak aktif;      */
/* perlindungan penuh butuh baseline — lihat keterbatasan S3-A).       */
/*                                                                     */
/* Dua outcome sekali-pakai (consume-once, pola pending ref view):     */
/* drop yang DITAHAN guard + simpan-generate yang KONFLIK tidak punya  */
/* jalur pesan ke pengguna (tryContinue mengembalikan null; nilai      */
/* balik persist diabaikan pemanggil) — view menguras keduanya di      */
/* efek simpan dan memposting pesan jujur. Satu slot per jenis:        */
/* outcome terbaru menang; outcome proyek lain dibuang view.          */
/* ------------------------------------------------------------------ */
const lastSeenIntakeUpdatedAt = new Map<string, string>();

export function noteIntakeSnapshotVersion(projectId: string, updatedAt: string): void {
  lastSeenIntakeUpdatedAt.set(projectId, updatedAt);
}

/**
 * Baseline last-seen snapshot intake proyek ini (null = tab ini belum
 * pernah melihat snapshot proyek itu). SATU-SATUNYA sumber kebenaran
 * baseline per tab: view MEMBACA baseline dari sini (bukan menyimpan
 * ref sendiri) dan MENCATAT tiap simpan/bacanya ke sini — begitu pula
 * persist registry. Dua pelacak terpisah (ref view + peta registry)
 * PASTI divergen: persist generate memajukan storage tanpa
 * memperbarui ref view, sehingga intake baru sesudah generate kena
 * konflik palsu satu-tab (dipin P5A-23: konteks baru menimpa snapshot
 * tertaut). Dengan satu peta, penulis view + registry tidak pernah
 * saling mengonflik — hanya tulisan TAB LAIN yang konflik.
 */
export function getLastSeenIntakeVersion(projectId: string): string | null {
  return lastSeenIntakeUpdatedAt.get(projectId) ?? null;
}

let lastIntakeDropOutcome: { projectId: string; held: true; at: string } | null = null;

export function takeIntakeDropOutcome(): { projectId: string; held: true; at: string } | null {
  const outcome = lastIntakeDropOutcome;
  lastIntakeDropOutcome = null;
  return outcome;
}

let lastIntakePersistConflict: { projectId: string; at: string } | null = null;

export function takeIntakePersistConflict(): { projectId: string; at: string } | null {
  const outcome = lastIntakePersistConflict;
  lastIntakePersistConflict = null;
  return outcome;
}

/** Simpan snapshot konteks ini sekarang; false bila tak tersimpan. */
function persistIntakeSnapshotNow(
  ctx: UniversalIntakeContext,
  generatedDraftId?: string | null,
): boolean {
  const projectId = ctx.projectId ?? null;
  if (!projectId) return false;
  try {
    // S3-A: teruskan baseline last-seen tab ini — tulisan basi dari
    // tab ini (tab lain sudah maju) DITOLAK guard, bukan menimpa.
    // Kegagalan konflik dicatat sebagai outcome (view memposting
    // pesan jujur); nilai balik false = kontrak lama, pemanggil sudah
    // menanganinya (generate/draft tetap berjalan — snapshot yang
    // dipertahankan adalah versi tab lain yang lebih baru).
    const baseline = lastSeenIntakeUpdatedAt.get(projectId) ?? null;
    const res =
      generatedDraftId == null
        ? saveIntakeContext(projectId, ctx, undefined, { expectedUpdatedAt: baseline })
        : saveIntakeContext(projectId, ctx, {
            generatedDraftId,
            generatedAt: new Date().toISOString(),
          }, { expectedUpdatedAt: baseline });
    if (res.ok) {
      lastSeenIntakeUpdatedAt.set(projectId, res.updatedAt);
      return true;
    }
    if (res.error === 'INTAKE_VERSION_CONFLICT') {
      lastIntakePersistConflict = { projectId, at: new Date().toISOString() };
    }
    return false;
  } catch {
    return false;
  }
}

/** Hapus snapshot tersimpan konteks yang sengaja digugurkan (topik ditinggalkan). */
function dropPersistedIntakeSnapshot(ctx: UniversalIntakeContext | null): void {
  const projectId = ctx?.projectId ?? null;
  if (!projectId) return;
  try {
    // S3-A: hapus hanya bila record masih versi yang diketahui tab ini
    // (stale delete dari tab basi atas snapshot baru tab lain DITAHAN
    // guard — singleton lokal tetap boleh dibersihkan pemanggil; niat
    // pengguna tab ini dihormati tanpa menghancurkan pekerjaan tab
    // lain). Outcome ditahan dicatat agar view bisa memberi pesan
    // jujur; sukses hapus menghapus entri last-seen (tidak ada lagi
    // versi yang dikenal — simpan berikutnya adalah simpan pertama).
    const baseline = lastSeenIntakeUpdatedAt.get(projectId) ?? null;
    const hadRecord = peekIntakeContext(projectId) !== null;
    const deleted = clearIntakeContext(projectId, baseline ?? undefined);
    if (deleted) {
      lastSeenIntakeUpdatedAt.delete(projectId);
    } else if (hadRecord) {
      lastIntakeDropOutcome = { projectId, held: true, at: new Date().toISOString() };
    }
  } catch {
    /* penghapusan gagal ≠ alur gagal */
  }
}

export function getProjectContextState(): ProjectIntakeContext | null {
  return projectCtx;
}

export function clearProjectContext(): void {
  projectCtx = null;
}

/* ------------------------------------------------------------------ */
/* S3-B (2026-11-23) — kepemilikan konteks landscape. Aturan tunggal    */
/* (§5.3 discovery S3-B) yang dipakai SEMUA boundary: gerbang, aksi    */
/* tombol, generate, penjaga submit view, efek ganti-proyek.           */
/*   - konteks tercap P: asing bila proyek aktif ≠ P (termasuk null —  */
/*     konteks proyek P tidak boleh menjadi dasar percakapan/draft     */
/*     global maupun proyek lain);                                     */
/*   - konteks TANPA cap (global sejati, dibuat tanpa proyek aktif):   */
/*     hanya boleh berlanjut selama proyek aktif tetap null — begitu   */
/*     proyek aktif ada, ia asing (tidak pernah dicap retroaktif;      */
/*     mengarang identitas dilarang invariant §5.3).                   */
/*   - null (tidak ada konteks): tidak asing.                          */
/* `activeProjectId` null/undefined = tanpa proyek aktif.              */
/* ------------------------------------------------------------------ */
export function isProjectContextForeign(
  ctx: ProjectIntakeContext | null | undefined,
  activeProjectId: string | null | undefined,
): boolean {
  if (!ctx) return false;
  if (ctx.projectId != null) return ctx.projectId !== activeProjectId;
  return activeProjectId != null;
}

const numID = (v: number): string => v.toLocaleString('id-ID', { maximumFractionDigits: 2 });

/** Kalimat pembuka yang mengakui SEMUA yang sudah diketahui (§3 prompt). */
function intakeKnownIntro(ctx: ProjectIntakeContext, whatLabel: string): string {
  const bits: string[] = [];
  if (ctx.landAreaM2 != null) {
    bits.push(
      `lahan seluas ${ctx.landAreaOriginal && !ctx.landAreaOriginal.includes('m²') ? `${ctx.landAreaOriginal} (${numID(ctx.landAreaM2)} m²)` : `${numID(ctx.landAreaM2)} m²`}`
    );
  }
  if (ctx.location) bits.push(`di ${ctx.location}`);
  if (ctx.facilities.length) bits.push(`dengan ${ctx.facilities.map(facilityLabel).join(', ').toLowerCase()}`);
  return `Siap! Kita buat RAB ${whatLabel}${bits.length ? ` untuk ${bits.join(', ')}` : ''}.`;
}

/** Pertanyaan konsep landscape (kartu pilihan §3 + teks bebas). */
function landscapeConceptQuestion(ctx: ProjectIntakeContext): ActionResult {
  projectCtx = ctx;
  const lines: string[] = [
    intakeKnownIntro(ctx, 'landscape'),
    '',
    'Sebelum menyusun perhitungan, saya ingin memahami konsep landscape yang akan dibangun agar item pekerjaan dan volumenya sesuai kebutuhan.',
    '',
    '**Landscape seperti apa yang ingin Anda buat?**',
    '',
    'Pilih lewat tombol di bawah, atau tulis konsepnya langsung (mis. "taman kota" / "landscape resort").',
  ];
  return {
    ok: true,
    message: lines.join('\n'),
    awaitProjectConcept: true,
    actions: [
      ...LANDSCAPE_CONCEPT_CHOICES.map((c) => ({
        label: c.label,
        action: { kind: 'intent', intent: 'RAB_CONCEPT_SELECT', param: c.id } as const,
      })),
      { label: 'Mulai manual', action: { kind: 'navigate', menu: 'rab-estimasi' } as const },
    ],
  };
}

/** Pertanyaan fasilitas sesuai konsep terpilih (saran kontekstual §3). */
function landscapeFacilitiesQuestion(ctx: ProjectIntakeContext): ActionResult {
  ctx.stage = 'facilities';
  projectCtx = ctx;
  const concept = landscapeConceptById(ctx.conceptId);
  const lines: string[] = [
    `Konsepnya **${ctx.conceptLabel}** — tercatat. Yang sudah diketahui sejauh ini: ${ctx.knownInformation.join(' · ')}.`,
    '',
    `**Fasilitas apa saja yang dibutuhkan di ${ctx.conceptLabel?.toLowerCase()} ini?**`,
    '',
    'Sebutkan saja yang memang dibutuhkan — bisa beberapa sekaligus, mis. "jogging track, playground, dan area parkir". ' +
      'Saran yang lazim untuk konsep ini ada di bawah; saran BUKAN berarti semuanya wajib ada. ' +
      'Bila tidak ada fasilitas khusus, jawab **"itu aja"**.',
  ];
  if (concept) {
    lines.push('', `Saran fasilitas ${concept.label.toLowerCase()}: ${concept.facilities.map((f) => f.label.toLowerCase()).join(', ')}.`);
  }
  return {
    ok: true,
    message: lines.join('\n'),
    awaitProjectConcept: true,
    actions: [
      { label: 'Susun pratinjau RAB', action: { kind: 'intent', intent: 'RAB_PROJECT_PREVIEW' } as const },
      { label: 'Mulai manual', action: { kind: 'navigate', menu: 'rab-estimasi' } as const },
    ],
  };
}

/** Pertanyaan kondisi lahan (tahap site §4) — satu pertanyaan, boleh dilewati. */
function landscapeSiteQuestion(ctx: ProjectIntakeContext, ackChanges?: string[]): ActionResult {
  ctx.stage = 'site';
  projectCtx = ctx;
  const lines: string[] = [
    // Bila giliran ini membawa perubahan yang diakui (koreksi luas,
    // fasilitas baru), pengakuan itu adalah baris pertama — pola
    // "Siap, saya perbarui: …" ringkasan spek lama, bukan baris
    // "tercatat" generik yang menelan kabar perubahannya.
    ...(ackChanges?.length
      ? [`Siap, saya perbarui: ${ackChanges.join('; ')}.`]
      : []),
    ctx.facilities.length
      ? `Fasilitas tercatat: ${ctx.facilities.map(facilityLabel).join(', ')}.`
      : `Konsep tercatat: ${ctx.conceptLabel ?? 'landscape'} — fasilitas khusus belum ada yang disebut, tidak apa-apa.`,
    '',
    '**Bagaimana kondisi lahan eksistingnya?** Misalnya: lahan kosong, ada bangunan yang perlu dibongkar, lahan miring/berkontur, atau rawan genangan. ' +
      'Kondisi ini memengaruhi pekerjaan persiapan dan tanah. Bila tidak ada catatan khusus, jawab **"itu aja"** untuk lanjut ke pratinjau.',
  ];
  return {
    ok: true,
    message: lines.join('\n'),
    awaitProjectConcept: true,
    actions: [
      { label: 'Susun pratinjau RAB', action: { kind: 'intent', intent: 'RAB_PROJECT_PREVIEW' } as const },
      { label: 'Mulai manual', action: { kind: 'navigate', menu: 'rab-estimasi' } as const },
    ],
  };
}

/**
 * PRATINJAU terstruktur (§8 prompt): ditampilkan SEBELUM RAB di-commit
 * ke proyek. Paket pekerjaan = saran yang mengikuti fasilitas
 * terkonfirmasi; referensi harga = template katalog NYATA; yang tidak
 * didukung data dinyatakan tak teresolusi — TIDAK ada angka karangan.
 */
export function projectPreviewResult(ctx: ProjectIntakeContext): ActionResult {
  refreshContextFacts(ctx);
  ctx.stage = 'preview';
  projectCtx = ctx;
  const status = landscapeCatalogStatus(ctx);
  const lines: string[] = [];
  lines.push('**Pratinjau RAB — sebelum disusun final, periksa dulu ringkasan ini:**');
  lines.push('');
  lines.push('**Ringkasan proyek**');
  if (ctx.categoryLabel) lines.push(`• Kategori: ${ctx.categoryLabel}`);
  if (ctx.landAreaM2 != null) {
    lines.push(
      `• Total luas: ${numID(ctx.landAreaM2)} m²${ctx.landAreaOriginal && !ctx.landAreaOriginal.includes('m²') ? ` (dari "${ctx.landAreaOriginal}")` : ''}`
    );
  }
  if (ctx.conceptLabel) lines.push(`• Konsep: ${ctx.conceptLabel}`);
  if (ctx.location) lines.push(`• Lokasi: ${ctx.location}`);
  if (ctx.facilities.length) lines.push(`• Fasilitas terkonfirmasi: ${ctx.facilities.map(facilityLabel).join(', ')}`);
  if (ctx.siteConditions.length) lines.push(`• Kondisi lahan: ${ctx.siteConditions.join(', ')}`);
  lines.push('');
  lines.push('**Paket pekerjaan yang disarankan** (mengikuti fasilitas terkonfirmasi; yang bertanda "saran" belum tentu dibutuhkan — koreksi bila tidak sesuai):');
  landscapeWorkPackages(ctx).forEach((p, i) => {
    lines.push(
      `${i + 1}. ${p.name}${p.basedOn.length ? ` — dari fasilitas: ${p.basedOn.map(facilityLabel).join(', ')}` : p.suggestionOnly ? ' — saran' : ' — dasar umum'}`
    );
  });
  lines.push('');
  lines.push('**Info volume yang dibutuhkan**');
  if (ctx.landAreaM2 != null) {
    lines.push(`• Luas total area (${numID(ctx.landAreaM2)} m²) menjadi basis volume pekerjaan berbasis luas pada template.`);
  }
  lines.push('• Rincian volume per fasilitas (panjang jogging track, luas playground, jumlah titik lampu, dst.) belum dirinci — pada draft, nilainya mengikuti parameter template dan dinyatakan sebagai asumsi yang bisa direvisi, bukan diukur dari gambar.');
  lines.push('');
  lines.push('**Referensi harga yang tersedia**');
  if (status.conceptTemplateName) {
    lines.push(`• Template katalog untuk konsep ini: "${status.conceptTemplateName}" — harga itemnya dari data katalog/AHSP EZRAB lewat engine template, bukan karangan.`);
  }
  lines.push(`• Katalog LANDSCAPE_SITE saat ini berisi ${status.availableTemplateNames.length} template: ${status.availableTemplateNames.join('; ')}.`);
  if (status.note) lines.push(`• Catatan jujur: ${status.note}`);
  lines.push('');
  lines.push('**Item yang belum teresolusi**');
  if (ctx.missingInformation.length) {
    lines.push(`• Masih belum jelas: ${ctx.missingInformation.join('; ')} — bagian ini ditandai perlu konfirmasi pada draft, tidak diisi angka tebakan.`);
  } else {
    lines.push('• Tidak ada kekurangan inti. Harga per item tetap mengikuti status provenans pada draft (resmi/estimasi/belum tersedia).');
  }
  lines.push('');
  lines.push('**Asumsi yang memerlukan persetujuan**');
  lines.push('• Susunan item & volume awal mengikuti template katalog terpilih; parameter default template (mis. luas hardscape, jumlah pohon) dinyatakan terbuka di dalam draft dan bisa direvisi lewat chat.');
  if (!ctx.siteConditions.length) lines.push('• Kondisi lahan dianggap standar (tidak ada catatan khusus dari Anda).');
  if (ctx.qualityPreference) lines.push(`• Kualitas "${ctx.qualityPreference}" yang Anda sebut belum dirinci ke spesifikasi material — draft tidak mengarang spesifikasi premium; rincian material perlu Anda tentukan.`);
  lines.push('');
  lines.push(
    'Klik **"Susun draft RAB"** untuk menyusun draft dari konteks ini memakai engine katalog EZRAB (tabel item + total parsial sesuai provenans harga), ' +
      'atau koreksi/tambah dulu lewat chat — konteksnya tidak hilang.'
  );
  return {
    ok: true,
    message: lines.join('\n'),
    awaitProjectConcept: true,
    actions: [
      { label: 'Susun draft RAB', action: { kind: 'intent', intent: 'RAB_PROJECT_PREVIEW', param: 'generate' } as const },
      { label: 'Mulai manual', action: { kind: 'navigate', menu: 'rab-estimasi' } as const },
    ],
  };
}

/**
 * Susun draft akhir dari konteks intake yang matang: teks gabungan
 * seluruh giliran diserahkan ke jalur universal (mesin kanonis).
 * Konteks dibersihkan HANYA bila draft benar-benar tersusun — konteks
 * yang gagal disusun tetap hidup agar pengguna bisa melengkapi.
 */
function generateFromProjectContext(ctx: ProjectIntakeContext, projectId?: string | null): ActionResult {
  // S3-B (lapis kedua; RAB_PROJECT_PREVIEW sudah menjaga di atas): draft
  // TIDAK PERNAH dibangun dari konteks milik proyek lain — generate dari
  // fakta A yang terikat ke B adalah dampak tertinggi discovery (S2).
  // projectId undefined = tanpa info scope (pemanggil lama): tanpa cek.
  if (projectId !== undefined && isProjectContextForeign(ctx, projectId)) {
    return {
      ok: false,
      message:
        'Konteks proyek sudah tidak aktif. Tulis ulang kebutuhannya, misalnya "buatkan rab landscape 1 hektar".',
    };
  }
  const status = landscapeCatalogStatus(ctx);
  // Teks mesin: gabungan giliran + FAKTA TERSTRUKTUR yang sudah
  // terkonfirmasi dinyatakan ulang dalam bentuk yang dikenali mesin
  // kanonis. Ini BUKAN informasi baru — nilai luas adalah konversi
  // satuan dari teks pengguna sendiri ("1 hektar" tidak terbaca parser
  // luas mana pun di lapisan universal; tanpa pernyataan ulang ini,
  // konteks yang sudah benar di intake gugur di langkah terakhir).
  const facts: string[] = [];
  if (ctx.landAreaM2 != null) facts.push(`luas ${ctx.landAreaM2} m2`);
  if (ctx.location) facts.push(`di ${ctx.location}`);
  const text = facts.length ? `${ctx.combinedText} (${facts.join(', ')})` : ctx.combinedText;
  // FASE 5 (ARS-06) — projectId pemanggil diteruskan agar draft terikat
  // ke proyek yang benar (bila tidak diteruskan, perilaku lama).
  const res = status.conceptTemplateId
    ? universalResultFor(text, status.conceptTemplateId, undefined, { projectId: projectId ?? null })
    : universalResultFor(text, undefined, undefined, { projectId: projectId ?? null });
  if (!res) {
    return {
      ok: true,
      message:
        'Draft belum bisa disusun dari konteks ini — mesin katalog membutuhkan basis ukuran yang terukur. ' +
        'Konteks proyek Anda tetap tersimpan; tambahkan ukurannya (mis. total luas area) lalu minta susun lagi.',
      awaitProjectConcept: true,
      actions: [
        { label: 'Mulai manual', action: { kind: 'navigate', menu: 'rab-estimasi' } as const },
      ],
    };
  }
  // Hasil needs-spec dari universal = draft tidak tersusun; konteks tetap.
  if (!res.actions?.some((a) => a.action.kind === 'push-universal')) {
    return { ...res, awaitProjectConcept: true };
  }
  projectCtx = null;
  const note = status.note ? `\n\nCatatan pemetaan template: ${status.note}` : '';
  return { ...res, message: res.message + note };
}

/**
 * Langkah berikutnya dari keadaan konteks (satu pertanyaan pada satu
 * waktu). `askedFacilities`/`askedSite` menandai pertanyaan yang SUDAH
 * diajukan pada giliran-giliran sebelumnya: pertanyaan tidak diulang
 * hanya karena jawabannya belum lengkap — alur maju ke pratinjau
 * dengan kekurangan dinyatakan di sana (missingInformation). Tanpa
 * penanda ini, jawaban parsial (mis. koreksi luas saat pertanyaan
 * kondisi lahan menggantung) akan menembak ulang pertanyaan yang sama.
 */
function intakeNextStep(
  ctx: ProjectIntakeContext,
  opts?: { ackChanges?: string[]; askedFacilities?: boolean; askedSite?: boolean }
): ActionResult {
  refreshContextFacts(ctx);
  // "Langsung buatkan" (skenario H): jangan menahan pengguna di
  // pertanyaan — langsung pratinjau berlabel jujur.
  if (ctx.forceGenerate) return projectPreviewResult(ctx);
  if (!ctx.conceptId) {
    if (opts?.ackChanges?.length) {
      const res = landscapeConceptQuestion(ctx);
      return { ...res, message: `Siap, saya perbarui: ${opts.ackChanges.join('; ')}.\n\n${res.message}` };
    }
    return landscapeConceptQuestion(ctx);
  }
  if (ctx.facilities.length === 0 && !opts?.askedFacilities) {
    return landscapeFacilitiesQuestion(ctx);
  }
  // Kondisi lahan hanya ditanya bila pertanyaan fasilitas baru saja
  // dijawab dengan fasilitas (askedFacilities dari tahap 'site' berarti
  // pertanyaan fasilitas SUDAH pernah diajukan DAN dijawab — tahap
  // 'facilities' murni berarti giliran ini masih berupa jawaban
  // fasilitas yang pertanyaannya diajukan tepat sebelumnya; keduanya
  // sah untuk maju ke site). Bila alur tiba di sini lewat jalur lain
  // (mis. pratinjau sudah tampil), jangan mundur bertanya lagi.
  if (ctx.siteConditions.length === 0 && !opts?.askedSite && ctx.stage !== 'preview') {
    return landscapeSiteQuestion(ctx, opts?.ackChanges);
  }
  const preview = projectPreviewResult(ctx);
  if (opts?.ackChanges?.length) {
    // Pengakuan pembaruan WAJIB tampil juga saat langkah berikutnya
    // adalah pratinjau — pola ringkasan spek lama ("Siap, saya
    // perbarui: …") tidak boleh hilang hanya karena tahap berubah.
    return { ...preview, message: `Siap, saya perbarui: ${opts.ackChanges.join('; ')}.\n\n${preview.message}` };
  }
  return preview;
}

/**
 * Titik masuk gerbang konteks proyek pada CREATE_RAB_SUMMARY.
 * Mengembalikan ActionResult bila pesan ini milik alur intake landscape;
 * null bila bukan urusannya (pemanggil melanjutkan alur lama persis).
 * Dipanggil SEBELUM universalResultFor agar draft tidak mendahului
 * percakapan (kasus owner: kategori+luas sudah jelas tetapi draft
 * langsung disusun dari angka yang salah baca).
 */
export function projectIntakeGate(raw: string, projectId?: string | null): ActionResult | null {
  // S3-B: konteks yang hidup milik scope lain TIDAK BOLEH menjadi base —
  // permintaan baru di proyek ini mulai segar (tanpa fakta proyek lama
  // di combinedText). projectId undefined (pemanggil lama/tes) = tanpa
  // info scope: perilaku lama (base dipakai, cap dipertahankan).
  // Konteks hasil ekstraksi dicap proyek pemanggil; spread ...base di
  // extractProjectContext mempertahankan cap saat merge same-project.
  const hasScope = projectId !== undefined;
  const foreignBase = hasScope && isProjectContextForeign(projectCtx, projectId ?? null);
  const extracted = extractProjectContext(raw, foreignBase ? undefined : (projectCtx ?? undefined));
  if (hasScope) extracted.projectId = projectId ?? null;
  if (!isLandscapeFamily(extracted.category)) {
    // Bukan keluarga landscape: hanya perbarui konteks bila memang
    // sedang ada konteks landscape aktif? Tidak — topik berganti,
    // konteks lama gugur agar tidak bocor antar-topik.
    if (projectCtx && extracted.category) projectCtx = null;
    return null;
  }
  // Permintaan dengan dokumen DED eksplisit tetap milik workflow DED
  // (skenario I) — jangan ditahan intake teks.
  if (/\b(ded|gambar kerja)\b/i.test(raw) && /\b(ini|unggah|upload|lampirkan|berikut)\b/i.test(raw)) {
    return null;
  }
  projectCtx = extracted;
  // GATE 1 (5A) — topik diambil alih gerbang landscape: snapshot intake
  // universal yang digantikan ikut digugurkan (alasan sama dengan
  // cabang perintah-baru di tryContinueUniversalContext).
  dropPersistedIntakeSnapshot(universalCtx);
  universalCtx = null; // topik diambil alih gerbang landscape
  // Konsep dipilih lewat tombol pada giliran SEBELUM konteks ini ada di
  // registry? Tidak — tombol konsep ditangani RAB_CONCEPT_SELECT. Di
  // sini murni teks: konsep bisa ikut terbaca dari teks yang sama.
  return intakeNextStep(extracted);
}

/**
 * Jawaban teks selama intake landscape aktif: gabungkan ke konteks
 * (multi-detail diekstrak semua; koreksi menimpa kolomnya saja), lalu
 * lanjutkan ke pertanyaan relevan berikutnya. Mengembalikan null bila
 * tidak ada konteks aktif atau teksnya perintah baru yang jelas
 * (pemanggil memproses normal; konteks gugur seperti pola gerbang lain).
 */
export function tryContinueProjectContext(text: string): ActionResult | null {
  const ctx = projectCtx;
  if (!ctx) return null;
  const t = (text || '').toLowerCase();

  // "Gunakan material premium" & sejenisnya (skenario G): penyebutan
  // kualitas/material tanpa rincian — ditangani SEBELUM ekstraksi
  // gabungan agar tidak tertelan sebagai jawaban fasilitas/kondisi
  // (ekstraktor fasilitas akan salah membaca kata dari daftar saran
  // sebagai fasilitas terkonfirmasi). Kualitas dicatat apa adanya dan
  // spesifikasinya DITANYAKAN — tidak pernah dikarang. Hanya frasa
  // penggunaan yang jelas yang memicu cabang ini ("gunakan/pakai …
  // premium", "material premium") — kata sifat liar tidak.
  const qualityTurn = /\b(gunakan|pakai|memakai|menggunakan|pilih)\b[^.]{0,24}\b(premium|high[ -]?end|mewah|standar|standard|ekonomis)\b/.test(t)
    || /\bmaterial\s+(premium|mewah|high[ -]?end)\b/.test(t)
    || /\bkualitas\s+(premium|mewah|tinggi)\b/.test(t);
  if (qualityTurn) {
    const q = extractProjectContext(text, ctx);
    // Parser material lama menangkap kata kualitas itu sendiri sebagai
    // nama material ("material premium" → materialPreference
    // "premium") — kata kualitas BUKAN nama material; kosongkan agar
    // ringkasan konteks tidak menampilkan material karangan.
    if (q.materialPreference && /^(premium|mewah|standar|standard|ekonomis|menengah|high[ -]?end|sederhana)$/.test(q.materialPreference)) {
      q.materialPreference = null;
      refreshContextFacts(q);
    }
    projectCtx = q;
    const qualLabel = q.qualityPreference ?? 'premium';
    // materialPreference yang isinya HANYA kata kualitas itu sendiri
    // ("material premium" → parser menangkap "premium" sebagai nama
    // material) BUKAN rincian material — perlakukan sebagai belum
    // dirinci, supaya spesifikasinya tetap ditanyakan (skenario G).
    const materialDetailed =
      q.materialPreference != null &&
      !/^(premium|mewah|standar|standard|ekonomis|menengah|high[ -]?end|sederhana)$/.test(q.materialPreference);
    if (!materialDetailed) {
      return {
        ok: true,
        message:
          `Siap — kualitas **${qualLabel}** saya catat, tetapi saya tidak menebak spesifikasinya. ` +
          'Material atau bagian apa yang dimaksud? Misalnya jenis rumput/tanaman, material perkerasan pedestrian, atau lampu taman — ' +
          `sebutkan yang dimaksud. Konteks proyek Anda sejauh ini tetap: ${q.knownInformation.join(' · ')}.`,
        awaitProjectConcept: true,
        actions: [
          { label: 'Lewati — susun pratinjau', action: { kind: 'intent', intent: 'RAB_PROJECT_PREVIEW' } as const },
          { label: 'Mulai manual', action: { kind: 'navigate', menu: 'rab-estimasi' } as const },
        ],
      };
    }
    return intakeNextStep(q, { askedFacilities: true, askedSite: true });
  }

  // Afirmasi owner 2026-11-06: "itu aja"/"oke" = eksekusi langkah
  // tertunda — di intake ini artinya: lewati pertanyaan saat ini menuju
  // pratinjau (bukan pertanyaan ulang, bukan ringkasan basa-basi).
  if (isRabFinalizeText(text)) {
    if (ctx.stage === 'concept') {
      ctx.conceptId = ctx.conceptId ?? 'custom';
      ctx.conceptLabel = ctx.conceptLabel ?? 'Konsep custom';
    }
    return projectPreviewResult(ctx);
  }

  // Perintah baru yang jelas (navigasi / RAB topik lain / pencarian)
  // menggugurkan konteks — sama seperti gerbang subtipe/material.
  if (/\b(buka|bukain|tampilkan|cari|carikan)\b/.test(t) || /\brab\b.*\b(rumah|jalan|drainase|jembatan|gedung)\b/.test(t)) {
    projectCtx = null;
    return null;
  }

  const beforeStage = ctx.stage;
  const before = {
    land: ctx.landAreaM2, concept: ctx.conceptId, facCount: ctx.facilities.length,
    loc: ctx.location, siteCount: ctx.siteConditions.length, quality: ctx.qualityPreference,
  };
  const merged = extractProjectContext(text, ctx);
  projectCtx = merged;

  const changes: string[] = [];
  if (merged.landAreaM2 !== before.land && merged.landAreaM2 != null) {
    changes.push(`Total luas: ${numID(merged.landAreaM2)} m²${merged.landAreaOriginal && !merged.landAreaOriginal.includes('m²') ? ` (dari "${merged.landAreaOriginal}")` : ''} — data lainnya tetap`);
  }
  if (merged.conceptId !== before.concept && merged.conceptLabel) changes.push(`Konsep: ${merged.conceptLabel}`);
  if (merged.facilities.length > before.facCount) {
    changes.push(`Fasilitas: ${merged.facilities.map(facilityLabel).join(', ')}`);
  }
  if (merged.location !== before.loc && merged.location) changes.push(`Lokasi: ${merged.location}`);
  if (merged.siteConditions.length > before.siteCount) changes.push(`Kondisi lahan: ${merged.siteConditions.join(', ')}`);

  // "Gunakan material premium" (skenario G): kualitas disebut tanpa
  // rincian → tanyakan spesifikasinya; JANGAN mengarang spek.
  if (merged.qualityPreference && merged.qualityPreference !== before.quality && !merged.materialPreference) {
    return {
      ok: true,
      message:
        `Siap — kualitas **${merged.qualityPreference}** saya catat, tetapi saya tidak menebak spesifikasinya. ` +
        'Material atau bagian apa yang dimaksud premium? Misalnya jenis rumput/tanaman, material perkerasan pedestrian, atau lampu taman — ' +
        'sebutkan yang dimaksud, dan konteks proyek Anda sejauh ini tetap: ' +
        `${merged.knownInformation.join(' · ')}.`,
      awaitProjectConcept: true,
      actions: [
        { label: 'Lewati — susun pratinjau', action: { kind: 'intent', intent: 'RAB_PROJECT_PREVIEW' } as const },
        { label: 'Mulai manual', action: { kind: 'navigate', menu: 'rab-estimasi' } as const },
      ],
    };
  }

  return intakeNextStep(merged, {
    ackChanges: changes.length ? changes : undefined,
    askedFacilities: beforeStage === 'facilities' || beforeStage === 'site',
    askedSite: beforeStage === 'site',
  });
}

/* ------------------------------------------------------------------ */
/* INTAKE UNIVERSAL (Universal Conversational Project Intake           */
/* 2026-11-10) — gerbang percakapan lintas kategori di atas             */
/* universalIntake.ts. Pola yang sama dengan gerbang landscape:         */
/* konteks terstruktur bertahan antar-pesan, SATU pertanyaan kritis     */
/* per giliran, brief transparan (§8) sebelum generate, generate        */
/* lewat universalResultFor (mesin kanonis). Gerbang ini mengambil      */
/* alih HANYA: proyek multi-disiplin, kategori yang fakta kritisnya     */
/* hilang (alur lama akan menyusun draft dari default template /        */
/* menolak buntu / memberi menu generik), dan kategori teridentifikasi  */
/* yang jatuh ke menu generik. Alur terlindungi TIDAK disentuh: rumah   */
/* tinggal (ringkasan kebutuhan), landscape murni (gerbang landscape),  */
/* atap/pondasi (gerbang material), subtipe jalan/drainase/jembatan     */
/* yang belum dikenal (klarifikasi subtipe).                            */
/* ------------------------------------------------------------------ */

/** Baris pengakuan fakta yang sudah diketahui (gaya Contoh §5 prompt). */
function universalKnownLine(ctx: UniversalIntakeContext): string | null {
  const bits = ctx.facts
    .filter((f) =>
      ['USER_CONFIRMED', 'SYSTEM_DERIVED'].includes(f.status) &&
      !['category', 'family'].includes(f.key) &&
      // Cakupan yang labelnya sama dengan kategori utama sudah disebut
      // di kalimat pembuka — jangan diulang.
      !(f.key.startsWith('scope-') && f.value === ctx.primary?.label)
    )
    .map((f) => `${f.label.toLowerCase()} ${f.value}`);
  return bits.length ? `Saya sudah mencatat: ${bits.join(' · ')}.` : null;
}

function universalIntro(ctx: UniversalIntakeContext): string {
  const primary = ctx.primary?.label ?? 'pekerjaan ini';
  const secondary = ctx.secondary.length
    ? ` beserta ${ctx.secondary.map((d) => d.label.toLowerCase()).join(', ')}`
    : '';
  return `Siap! Kita buat RAB **${primary}**${secondary}.`;
}

const UNIVERSAL_STEP_ACTIONS = (extra: ChatActionButton[] = []): ChatActionButton[] => [
  ...extra,
  { label: 'Susun brief sekarang', action: { kind: 'intent', intent: 'RAB_INTAKE_OPTION', param: 'review' } as const },
  { label: 'Mulai manual', action: { kind: 'navigate', menu: 'rab-estimasi' } as const },
];

/** Tampilkan pertanyaan berikutnya dari konteks universal. */
function universalQuestionResult(ctx: UniversalIntakeContext, ackChanges?: string[]): ActionResult | null {
  const q = selectNextQuestion(ctx);
  if (!q) return null;
  if (!ctx.askedKeys.includes(q.key)) ctx.askedKeys.push(q.key);
  universalCtx = ctx;
  const lines: string[] = [];
  if (ackChanges?.length) lines.push(`Siap, saya perbarui: ${ackChanges.join('; ')}.`);
  else lines.push(universalIntro(ctx));
  const known = universalKnownLine(ctx);
  if (known && !ackChanges?.length) lines.push('', known);
  lines.push('', `**${q.prompt(ctx)}**`);
  lines.push('', 'Jawab lewat teks bebas — sebutkan saja yang Anda tahu. Jawab **"itu aja"** untuk lewati pertanyaan ini menuju brief proyek.');
  return {
    ok: true,
    message: lines.join('\n'),
    awaitProjectConcept: true,
    actions: UNIVERSAL_STEP_ACTIONS(
      (q.options ?? []).map((o) => ({
        label: o.label,
        action: { kind: 'intent', intent: 'RAB_INTAKE_OPTION', param: o.id } as const,
      }))
    ),
  };
}

/**
 * Langkah kuesioner adaptif (Adaptive Questionnaire 2026-11-12):
 * sesudah pertanyaan kritis percakapan habis dan SEBELUM brief,
 * spesifikasi material/kapasitas/fasilitas yang berdampak material
 * dikumpulkan lewat satu kartu kuesioner tergrup. Mengembalikan null
 * bila tidak ada yang perlu ditanyakan (sudah lengkap / sudah
 * terkirim) — alur lanjut ke brief seperti biasa.
 */
function questionnaireStepResult(ctx: UniversalIntakeContext, ackChanges?: string[]): ActionResult | null {
  if (ctx.questionnaire.status === 'submitted') return null;
  const qs = presentQuestionnaire(ctx);
  if (!qs) return null;
  universalCtx = ctx;
  const lines: string[] = [];
  if (ackChanges?.length) lines.push(`Siap, saya perbarui: ${ackChanges.join('; ')}.`);
  else lines.push(universalIntro(ctx));
  const known = universalKnownLine(ctx);
  if (known && !ackChanges?.length) lines.push('', known);
  lines.push('');
  lines.push(...questionnaireTextLines(qs));
  return {
    ok: true,
    message: lines.join('\n'),
    awaitProjectConcept: true,
    questionnaire: { questions: qs },
    actions: UNIVERSAL_STEP_ACTIONS(),
  };
}

/**
 * Kiriman kuesioner dari kartu interaktif (dipanggil view). Jawaban
 * diterapkan ke konteks kanonis lalu brief tinjauan ditampilkan —
 * generate tetap menunggu konfirmasi eksplisit di brief.
 */
export function submitQuestionnaireAnswers(
  submitted: Record<string, QuestionnaireAnswerRecord>,
): ActionResult {
  const ctx = universalCtx;
  if (!ctx) {
    return {
      ok: false,
      message: 'Konteks proyek sudah tidak aktif, jadi kuesioner tidak bisa dikirim. Tulis ulang kebutuhannya, misalnya "buatkan rab kandang sapi 17 x 9 m".',
    };
  }
  let res;
  try {
    res = applyQuestionnaireAnswers(ctx, submitted);
  } catch (e) {
    if (e instanceof QuestionnaireValidationError) {
      return {
        ok: true,
        message: `Kuesioner belum terkirim: ${e.message}. Konteks proyek Anda tidak berubah — periksa lagi jawaban pada kartunya.`,
        awaitProjectConcept: true,
        questionnaire: { questions: selectQuestionnaireQuestions(ctx) },
      };
    }
    throw e;
  }
  universalCtx = ctx;
  refreshUniversalFacts(ctx);
  const ack: string[] = [];
  if (res.appliedLabels.length) ack.push(`spesifikasi terkonfirmasi — ${res.appliedLabels.join('; ')}`);
  if (res.changedLabels.length) ack.push(`diperbarui — ${res.changedLabels.join('; ')}`);
  if (res.skippedLabels.length) ack.push(`belum ditentukan — ${res.skippedLabels.join('; ')}`);
  return universalReviewResult(ctx, ack.length ? ack : undefined);
}

/** Pulihkan konteks universal dari snapshot persistensi (muat ulang). */
export function restoreUniversalContext(ctx: UniversalIntakeContext, projectId?: string | null): void {
  // FASE 5 (ARS-06) — pemulihan per proyek menandai konteks dengan
  // projectId pemiliknya (bila diteruskan pemanggil), agar generate
  // berikutnya mengikat draft ke proyek yang benar.
  if (projectId) ctx.projectId = projectId;
  universalCtx = ctx;
  projectCtx = null;
}

/** Brief proyek universal (§8) — ditampilkan sebelum generate. */
export function universalReviewResult(ctx: UniversalIntakeContext, ackChanges?: string[]): ActionResult {
  refreshUniversalFacts(ctx);
  universalCtx = ctx;
  const lines = buildUniversalBriefLines(ctx);
  lines.push(...questionnaireBriefLines(ctx));
  // W2 (2026-11-24): tahap HARUS ditetapkan SESUDAH pembangun baris —
  // buildUniversalBriefLines memanggil refreshUniversalFacts yang
  // menghitung ulang stage dari pertanyaan kritis yang masih hilang,
  // sehingga penetapan PROJECT_REVIEW SEBELUM baris dibangun terhapus
  // kembali (brief forceGenerate tampil dengan stage PROJECT_DIMENSIONS
  // dan perintah teks "susun draft RAB" / "oke" sesudahnya mengulang
  // brief selamanya — cabang generate + afirmasi mensyaratkan
  // PROJECT_REVIEW — sementara tombol "Susun draft RAB" bekerja).
  // Brief SEDANG ditinjau pengguna, jadi PROJECT_REVIEW adalah tahap
  // yang benar meski pertanyaan tersisa; generate tetap gagal jujur
  // bila mesin katalog tidak bisa membangun dari brief itu.
  ctx.stage = 'PROJECT_REVIEW';
  if (ackChanges?.length) lines.unshift(`Siap, saya perbarui: ${ackChanges.join('; ')}.`, '');
  return {
    ok: true,
    message: lines.join('\n'),
    awaitProjectConcept: true,
    actions: [
      { label: 'Susun draft RAB', action: { kind: 'intent', intent: 'RAB_INTAKE_GENERATE' } as const },
      { label: 'Mulai manual', action: { kind: 'navigate', menu: 'rab-estimasi' } as const },
    ],
  };
}

/** Langkah berikutnya dari keadaan konteks universal. */
function universalNextStep(ctx: UniversalIntakeContext, ackChanges?: string[]): ActionResult {
  refreshUniversalFacts(ctx);
  if (ctx.forceGenerate) return universalReviewResult(ctx, ackChanges);
  return (
    universalQuestionResult(ctx, ackChanges) ??
    questionnaireStepResult(ctx, ackChanges) ??
    universalReviewResult(ctx, ackChanges)
  );
}

/**
 * Susun draft dari brief universal yang disetujui: fakta terkonfirmasi
 * dinyatakan ulang dalam bentuk yang dikenali mesin kanonis (nilai =
 * konversi/ekstraksi dari teks pengguna sendiri, BUKAN angka baru),
 * lalu diserahkan ke universalResultFor. Konteks dibersihkan hanya
 * bila draft nyata tersusun.
 */
function generateFromUniversalContext(ctx: UniversalIntakeContext): ActionResult {
  ctx.approvalStatus = 'APPROVED';
  refreshUniversalFacts(ctx);
  const facts: string[] = [];
  if (ctx.buildingAreaM2 != null) facts.push(`luas bangunan ${ctx.buildingAreaM2} m2`);
  if (ctx.landAreaM2 != null) facts.push(`luas ${ctx.landAreaM2} m2`);
  if (ctx.lengthM != null) facts.push(`panjang ${ctx.lengthM} m`);
  if (ctx.widthM != null) facts.push(`lebar ${ctx.widthM} m`);
  if (ctx.spanM != null) facts.push(`bentang ${ctx.spanM} m`);
  if (ctx.floors != null) facts.push(`${ctx.floors} lantai`);
  if (ctx.location) facts.push(`di ${ctx.location}`);
  // Jawaban kuesioner TERKONFIRMASI dinyatakan ulang dengan pola yang
  // sama (kata-kata pengguna sendiri dari kartu kuesioner) lewat frasa
  // generate per definisi — frasa itu disusun agar terbaca sebagai
  // ATRIBUT proyek utama, bukan scope mandiri (label cakupan mentah
  // TIDAK dilampirkan: kata seperti "drainase"/"saluran" pada label
  // fasilitas kandang akan dideteksi pembangun draf sebagai scope
  // sipil terpisah yang menuntut panjangnya sendiri).
  for (const phrase of questionnaireGeneratePhrases(ctx)) facts.push(phrase);
  const text = facts.length ? `${ctx.combinedText} (${facts.join(', ')})` : ctx.combinedText;
  // Fase 2 Bagian B: spek terstruktur (Bagian A) + cap budget terkini
  // diteruskan ke pembangun draft agar rantai spek → RAB berjalan.
  // CATATAN INTEGRASI: deriveStructuredSpecs berasal dari Bagian A —
  // bila berkas itu belum mendarat, impor di atas gagal dimuat.
  const specs = deriveStructuredSpecs(ctx);
  // FASE 5 (ARS-06) — projectId konteks diteruskan agar draft yang
  // dibangun terikat ke proyek pemilik konteks.
  // GATE 2 (5B) — model gedung konteks diteruskan apa adanya: konteks
  // yang dibangun multi-giliran (gedung disebut di pesan berbeda)
  // membawa model yang TIDAK dapat diparse ulang dari satu teks —
  // tanpa ini draft dari brief kehilangan gedung kedua dst.
  // GATE 4 (5D) — dimensi konteks diteruskan untuk rekonsiliasi QTO
  // DED (otoritatif multi-giliran; jalur cepat memakai dimsFromRawText).
  const res = universalResultFor(text, undefined, undefined, { structuredSpecs: specs, budgetCapOverride: ctx.budget?.amount ?? null, projectId: ctx.projectId ?? null, buildings: ctx.buildings, dedQtoDims: dimsFromIntakeContext(ctx) });
  if (!res) {
    return {
      ok: true,
      message:
        'Draft belum bisa disusun dari brief ini — mesin katalog membutuhkan basis ukuran yang terukur untuk disiplin utamanya. ' +
        'Brief Anda tetap tersimpan; tambahkan ukurannya lewat chat lalu minta susun lagi, atau susun manual lewat RAB & Estimasi.',
      awaitProjectConcept: true,
      actions: [{ label: 'Mulai manual', action: { kind: 'navigate', menu: 'rab-estimasi' } as const }],
    };
  }
  if (!res.actions?.some((a) => a.action.kind === 'push-universal')) {
    // needs-spec / pertanyaan lanjutan dari mesin — konteks tetap hidup.
    return { ...res, awaitProjectConcept: true };
  }
  // B5-3: draft berhasil + proyek dipastikan (baru/sudah aktif) — ikat
  // konteks ke proyek itu SEBELUM snapshot disimpan, agar snapshot
  // intake (dengan relasi generatedDraftId) mendarat di bawah proyek
  // yang sama dengan draftnya — prasyarat pemulihan pasca-reload
  // (B5/B6: tanpa ini konteks tidak dipulihkan dan pesan lanjutan jatuh
  // ke LLM). Tanpa ensuredProjectId (proyek sudah terikat sejak intake
  // / tanpa ensurer) tidak ada yang berubah.
  if (res.ensuredProjectId) ctx.projectId = res.ensuredProjectId;
  // GATE 1 (5A) — SIMPAN DULU, BARU BERSIHKAN: konteks final yang
  // disetujui (APPROVED + jawaban kuesioner + budgetHistory + koreksi +
  // bangunan per bangunan) dipertahankan sebagai snapshot terakhir,
  // ditautkan ke draft yang baru dihasilkan — SEBELUM singleton
  // dibersihkan, karena sesudah baris ini tidak ada lagi yang dapat
  // menyimpan konteks final (efek simpan view hanya berjalan sesudah
  // render, saat singleton sudah null). Singleton tetap dibersihkan
  // (perilaku sesi yang dipin tes); yang dipertahankan adalah
  // SNAPSHOT-nya untuk pemulihan.
  persistIntakeSnapshotNow(ctx, getLastUniversalDraft()?.id ?? null);
  universalCtx = null;
  const gapNotes: string[] = [];
  for (const d of [ctx.primary, ...ctx.secondary]) {
    if (!d) continue;
    const cov = coverageFor(d);
    if (cov.support === 'tidak-ada') {
      gapNotes.push(`"${d.label}" belum punya template katalog — bagian itu tidak termasuk draft ini dan tidak dikarang; susun sebagai item manual/non-AHSP bila diperlukan.`);
    } else if (cov.support === 'sebagian') {
      gapNotes.push(`"${d.label}" didukung sebagian — template kategori terdekat yang dipakai; periksa itemnya sebelum dipakai.`);
    }
  }
  return gapNotes.length
    ? { ...res, message: `${res.message}\n\nCatatan cakupan katalog: ${gapNotes.join(' ')}` }
    : res;
}

/**
 * FASE 4 (CHAT-05, 2026-11-12) — Penjaga hijack mesin rumah parametrik.
 * `buildSpecRab` membangun RAB dari mesin parametrik RUMAH; tanpa penjaga
 * ini ia mengklaim pesan apa pun yang terukur, termasuk yang primernya
 * kategori lain ("Buatkan RAB kolam renang di halaman rumah 10 x 5 m"
 * → RAB awal Rumah Tipe 45 — E2E Fase 4 run 2/4). `classifyUniversal`
 * sudah tahu primernya (kolam, mandiri — bukan subordinat rumah); penjaga
 * ini hanya menegakkannya di dispatch: bila primer terklasifikasi dan
 * BUKAN 'rumah', specRab dilewati dan jalur katalog universal yang
 * menangani (atau ringkasan jujur bila tak ada template). Primer null
 * (tak terklasifikasi) = perilaku lama, specRab tetap dicoba. Pesan
 * rumah sejati ("rumah dengan kolam renang" → primer rumah) tidak
 * terpengaruh.
 */
export function specRabHijackGuard(raw: string): boolean {
  const primaryId = classifyUniversal(raw).primary?.id ?? null;
  return primaryId !== null && primaryId !== 'rumah';
}

/**
 * Titik masuk gerbang intake universal pada CREATE_RAB_SUMMARY (dan,
 * dengan `fromClarify`, pada CREATE_RAB_CLARIFY untuk kategori
 * teridentifikasi yang jatuh ke menu generik — prinsip §1 prompt:
 * wizard generik tidak boleh tampil bila kategori sudah dikenal).
 * Mengembalikan null bila bukan urusannya.
 */
export function universalIntakeGate(raw: string, fromClarify = false, projectId?: string | null): ActionResult | null {
  const cls = classifyUniversal(raw);
  if (!cls.primary) return null;
  const t = (raw || '').toLowerCase();
  // Permintaan dokumen DED eksplisit tetap milik workflow DED.
  if (/\b(ded|gambar kerja)\b/.test(t) && /\b(ini|unggah|upload|lampirkan|berikut)\b/.test(t)) return null;

  const ctx = extractUniversalContext(raw);
  const p = ctx.primary;
  if (!p) return null;
  // GATE 4 (5D) — spek DED lampiran ikut ke konteks (snapshot jalur
  // cepat + konsistensi pemulihan): hanya bila ada lampiran proyek
  // ini; gagal muat tidak pernah menggagalkan gate. Tanpa lampiran
  // (kasus semua tes lama) perilaku IDENTIK — ctx.dedSpecs tetap [].
  if (projectId) {
    try {
      const att = loadDedAttachment(projectId);
      if (att) ctx.dedSpecs = sanitizeDedSpecs(dedSpecsFromAttachment(att).specs);
    } catch { /* lampiran rusak/tak terbaca — konteks jalan tanpa DED */ }
  }

  if (!cls.isMulti) {
    // --- Alur terlindungi (§10/§11): jangan mencegat. ---
    if (p.protectedFlow === 'house') return null;
    if (p.protectedFlow === 'material-gate') return null;
    if (p.family === 'landscape' && ['taman-kota', 'landscape-komersial', 'landscape-resort', 'landscape-perumahan', 'landscape-umum'].includes(p.id)) {
      return null; // domain gerbang landscape
    }
    if (p.id === 'bangunan-umum' && (ctx.dimensionsText != null || ctx.buildingAreaM2 != null)) {
      return null; // gedung generik berdimensi — jalur universal lama bisa menyusun
    }
    if (p.protectedFlow === 'subtype') {
      const kind = p.id === 'drainase' || p.id === 'gorong-gorong' ? 'drainase' : p.id === 'jembatan' ? 'jembatan' : 'jalan';
      const sub = detectSubtypeFromText(kind, raw);
      if (kind === 'jalan') {
        // Contoh B: subtipe dikenal + tepat satu ukuran kritis hilang
        // → tanya ukuran pasangannya. Subtipe belum dikenal = domain
        // klarifikasi subtipe; ukuran lengkap/kosong = alur lama.
        if (!sub) return null;
        if ((ctx.lengthM == null) === (ctx.widthM == null)) return null;
      } else if (kind === 'drainase') {
        // Contoh C: tipe belum dikenal + panjang ada → tanya tipenya
        // (pilihan dari peta subtipe katalog + label konfirmasi).
        // Tipe sudah dikenal / tanpa panjang = alur lama.
        if (sub || ctx.drainageType) return null;
        if (ctx.lengthM == null) return null;
      } else {
        // Jembatan: subtipe dikenal + bentang belum ada → tanya bentang.
        if (!sub) {
          // Gelombang A Fase 6 (S5): jembatan TANPA subtipe pun masuk
          // percakapan kontekstual (tanya bentang → tipe konstruksi →
          // brief) — sebelumnya gate menolak dan universalResultFor
          // menjawab needs-spec terminal "kirim ulang permintaan
          // lengkap", membunuh diskusi teknis. Hanya bila bentang
          // SUDAH ada gate melepas ke jalur cepat draft.
          if (ctx.spanM != null || ctx.lengthM != null) return null;
        }
        if (ctx.spanM != null || ctx.lengthM != null) return null;
      }
    }
  }

  refreshUniversalFacts(ctx);
  const renovasiNeedsIntake =
    p.id === 'renovasi' &&
    (ctx.renovationScope == null || (ctx.buildingAreaM2 == null && ctx.landAreaM2 == null && ctx.dimensionsText == null));
  if (!cls.isMulti && !fromClarify && ctx.missingCritical.length === 0 && !renovasiNeedsIntake) {
    // GATE 1 (5A) — jalur cepat: fakta kritis lengkap, draft langsung.
    // Alur TIDAK dicegat (perilaku lama dipertahankan: tanpa pertanyaan,
    // tanpa singleton sesi), TETAPI konteks yang baru diekstrak ini
    // adalah konteks yang akan menghasilkan draft — simpan snapshotnya
    // sekarang agar auto-draft meninggalkan jejak yang dapat dipulihkan
    // (dulu: konteks tidak pernah dibuat → snapshot tidak pernah ada).
    // Relasi ke draft ditautkan pemanggil (CREATE_RAB_SUMMARY) sesudah
    // draft tersusun; bila builder ternyata butuh spesifikasi, snapshot
    // tanpa tautan ini tetap menjadi titik pulih intake yang sah.
    if (projectId) ctx.projectId = projectId;
    persistIntakeSnapshotNow(ctx);
    return null; // fakta kritis lengkap — jalur cepat lama (draft langsung) dipertahankan
  }
  // GATE 1 (5A) — cap konteks dengan proyek pemiliknya (ARS-06):
  // konteks FRESH sebelumnya tidak pernah membawa projectId, sehingga
  // draft dari intake fresh dibangun tanpa ikatan proyek.
  if (projectId) ctx.projectId = projectId;
  universalCtx = ctx;
  projectCtx = null; // topik diambil alih gerbang ini
  return universalNextStep(ctx);
}

/**
 * Jawaban teks selama intake universal aktif: koreksi menimpa kolomnya
 * saja, penambahan memperluas cakupan tanpa restart, penghapusan
 * membuang cakupan terkait, afirmasi menuju brief/generate. Null bila
 * bukan jawaban intake (perintah baru) — pemanggil memproses normal.
 */
export function tryContinueUniversalContext(text: string): ActionResult | null {
  const ctx = universalCtx;
  if (!ctx) return null;
  const t = (text || '').toLowerCase();

  // --- Penghapusan cakupan (§8: aksi hapus wajib didukung) ---
  const removalPhrase = parseScopeRemoval(text);
  if (removalPhrase) {
    const target = matchRemovable(ctx, removalPhrase);
    if (target) {
      let removedLabel: string;
      if ('family' in target) {
        removedLabel = target.label;
        ctx.secondary = ctx.secondary.filter((d) => d.id !== target.id);
        ctx.scopeConfirmed = ctx.scopeConfirmed.filter((s) => s.subcategoryId !== target.id);
      } else {
        removedLabel = target.label;
        ctx.scopeConfirmed = ctx.scopeConfirmed.filter((s) => s !== target);
        if (target.subcategoryId) {
          ctx.secondary = ctx.secondary.filter((d) => d.id !== target.subcategoryId);
        }
      }
      if (!ctx.scopeRemoved.includes(removedLabel)) ctx.scopeRemoved.push(removedLabel);
      if (ctx.secondary.length === 0 && ctx.primary && ctx.isMulti) ctx.isMulti = false;
      universalCtx = ctx;
      return universalNextStep(ctx, [`${removedLabel} dihapus dari lingkup — data lainnya tetap`]);
    }
    return {
      ok: true,
      message:
        `Bagian "${removalPhrase}" tidak saya temukan di lingkup proyek saat ini. ` +
        `Lingkup terkonfirmasi sekarang: ${[ctx.primary?.label, ...ctx.secondary.map((d) => d.label), ...ctx.scopeConfirmed.map((s) => s.label)].filter(Boolean).join('; ') || '—'}. ` +
        'Sebutkan nama bagiannya persis seperti di brief untuk menghapusnya.',
      awaitProjectConcept: true,
      actions: UNIVERSAL_STEP_ACTIONS(),
    };
  }

  // --- "Gunakan material premium" (pola skenario G): dicatat apa
  // adanya, spesifikasinya DITANYAKAN — tidak dikarang. ---
  const qualityTurn = /\b(gunakan|pakai|memakai|menggunakan|pilih)\b[^.]{0,24}\b(premium|high[ -]?end|mewah|standar|standard|ekonomis)\b/.test(t)
    || /\bmaterial\s+(premium|mewah|high[ -]?end)\b/.test(t)
    || /\bkualitas\s+(premium|mewah|tinggi)\b/.test(t);
  if (qualityTurn) {
    const q = extractUniversalContext(text, ctx);
    if (q.materialPreference && /^(premium|mewah|standar|standard|ekonomis|menengah|high[ -]?end|sederhana)$/.test(q.materialPreference)) {
      q.materialPreference = null;
    }
    universalCtx = q;
    const materialDetailed =
      q.materialPreference != null &&
      !/^(premium|mewah|standar|standard|ekonomis|menengah|high[ -]?end|sederhana)$/.test(q.materialPreference);
    if (!materialDetailed) {
      refreshUniversalFacts(q);
      return {
        ok: true,
        message:
          `Siap — kualitas **${q.qualityPreference ?? 'premium'}** saya catat, tetapi saya tidak menebak spesifikasinya. ` +
          'Material atau bagian apa yang dimaksud? Sebutkan rinciannya — konteks proyek Anda sejauh ini tetap: ' +
          `${q.facts.filter((f) => f.status === 'USER_CONFIRMED').map((f) => `${f.label.toLowerCase()} ${f.value}`).join(' · ') || '—'}.`,
        awaitProjectConcept: true,
        actions: UNIVERSAL_STEP_ACTIONS(),
      };
    }
    return universalNextStep(q, [`Kualitas: ${q.qualityPreference ?? 'tercatat'}`]);
  }

  // --- Afirmasi owner: di brief = setujui & generate; di pertanyaan
  // = lewati ke brief (langkah tertunda yang dieksekusi). ---
  if (isRabFinalizeText(text)) {
    // Kuesioner masih tertampil: langkah tertunda yang dieksekusi
    // adalah penyelesaian kuesioner (yang belum dijawab = belum
    // ditentukan) menuju brief — brief belum pernah ditinjau pengguna,
    // jadi afirmasi TIDAK melompat langsung ke generate.
    if (ctx.questionnaire.status === 'presented') {
      skipPendingQuestionnaire(ctx);
      return universalReviewResult(ctx, ['kuesioner dilewati — spesifikasi yang belum dijawab tercatat belum ditentukan']);
    }
    if (ctx.stage === 'PROJECT_REVIEW' || ctx.approvalStatus === 'APPROVED') {
      return generateFromUniversalContext(ctx);
    }
    return universalReviewResult(ctx);
  }
  // DEFECT-2 (WP02, diperbaiki 2026-11-24): cabang generate ini mendahului
  // gerbang topik-baru di bawah — "Buatkan RAB <topik lain>" saat
  // PROJECT_REVIEW men-generate draft dari konteks BASI (mis. RAB jalan
  // untuk permintaan kolam renang). Topik yang terklasifikasi dan BERBEDA
  // dari konteks saat ini harus jatuh ke gerbang topik-baru (gugur +
  // intake baru), bukan generate. Perbandingan id primer persis sama
  // dengan gerbang topik-baru agar keduanya sepakat soal "topik berubah"
  // (jalan vs jalan-beton dihitung BERBEDA — sama seperti perilaku
  // gerbang topik-baru di tengah intake). Permintaan tanpa topik
  // terklasifikasi ("susun draft RAB", "buatkan rab") tetap generate
  // seperti dulu — itu perintah generate untuk brief yang sedang
  // ditinjau, bukan topik baru.
  const requestedPrimaryId = classifyUniversal(text).primary?.id ?? null;
  const topicChanged =
    requestedPrimaryId !== null && ctx.primary?.id != null && requestedPrimaryId !== ctx.primary.id;
  if (/\b(susun|susunkan|buatkan|buatin|generate)\b[^.]{0,20}\b(draft|rab)\b/.test(t) && ctx.stage === 'PROJECT_REVIEW' && !topicChanged) {
    return generateFromUniversalContext(ctx);
  }

  // --- Perintah baru yang jelas menggugurkan konteks (pola gerbang lain) ---
  // W2 (2026-11-24): gerbang topik-baru kini juga menangkap "susun /
  // susunkan / generate (draft) RAB <topik lain>" — sebelumnya frasa itu
  // lolos dari cabang generate (topicChanged) lalu jatuh ke jalur merge
  // dan topik baru MERANGKAP sebagai disiplin sekunder konteks lama
  // ("Susun RAB kolam renang" saat brief jalan → kolam menempel di RAB
  // jalan). Keluarga kata kerja yang sama ("susunkan", "buatin") juga
  // ditambahkan ke cabang generate di atas agar keduanya sepakat.
  // Perbandingan topicChanged yang KETAT dipakai di sini (topik harus
  // terklasifikasi DAN berbeda): "susun draft RAB" tanpa topik tetap
  // generate (cabang di atas), dan "susun ulang" (revisi draft yang
  // sedang ditinjau) tidak menggugurkan konteks.
  const susunUlang = /\b(susun|susunkan|generate)\s+ulang\b/.test(t);
  if (/\b(buka|bukain|tampilkan|cari|carikan)\b/.test(t) || (/\b(buatkan|buatin)\b[^.]{0,30}\brab\b/.test(t) && classifyUniversal(text).primary?.id !== ctx.primary?.id) || (!susunUlang && /\b(susun|susunkan|generate)\b[^.]{0,30}\b(draft|rab)\b/.test(t) && topicChanged)) {
    // GATE 1 (5A) — topik sengaja ditinggalkan: snapshot tersimpan ikut
    // digugurkan agar reload tidak membangkitkan konteks yang sudah
    // ditinggalkan pengguna (keterbatasan v1 kuesioner §9.8).
    dropPersistedIntakeSnapshot(ctx);
    universalCtx = null;
    return null;
  }

  // --- Gabung jawaban ke konteks (multi-fakta diekstrak semua) ---
  const before = {
    buildingArea: ctx.buildingAreaM2, landArea: ctx.landAreaM2, length: ctx.lengthM,
    width: ctx.widthM, floors: ctx.floors, location: ctx.location,
    secondaryCount: ctx.secondary.length, scopeCount: ctx.scopeConfirmed.length,
    drainageType: ctx.drainageType, renovationScope: ctx.renovationScope,
    isNew: ctx.isNewConstruction, span: ctx.spanM,
    budgetAmount: ctx.budget?.amount ?? null, answersCount: Object.keys(ctx.answers).length,
  };
  const merged = extractUniversalContext(text, ctx);
  universalCtx = merged;
  const changes: string[] = [];
  if (merged.buildingAreaM2 !== before.buildingArea && merged.buildingAreaM2 != null) {
    changes.push(`Luas bangunan: ${numID(merged.buildingAreaM2)} m² — data lainnya tetap`);
  }
  if (merged.landAreaM2 !== before.landArea && merged.landAreaM2 != null) {
    changes.push(`Luas area: ${numID(merged.landAreaM2)} m² — data lainnya tetap`);
  }
  if (merged.lengthM !== before.length && merged.lengthM != null) changes.push(`Panjang: ${numID(merged.lengthM)} m`);
  if (merged.widthM !== before.width && merged.widthM != null) changes.push(`Lebar: ${numID(merged.widthM)} m`);
  if (merged.spanM !== before.span && merged.spanM != null) changes.push(`Bentang: ${numID(merged.spanM)} m`);
  if (merged.floors !== before.floors && merged.floors != null) changes.push(`Jumlah lantai: ${merged.floors}`);
  if (merged.location !== before.location && merged.location) changes.push(`Lokasi: ${merged.location}`);
  if (merged.drainageType !== before.drainageType && merged.drainageType) changes.push(`Tipe drainase: ${merged.drainageType}`);
  if (merged.renovationScope !== before.renovationScope && merged.renovationScope) changes.push(`Cakupan renovasi: ${merged.renovationScope}`);
  if (merged.isNewConstruction !== before.isNew && merged.isNewConstruction != null) {
    changes.push(`Status: ${merged.isNewConstruction ? 'pembangunan baru' : 'eksisting'}`);
  }
  if (merged.budget?.amount != null && merged.budget.amount !== before.budgetAmount) {
    changes.push(`Budget: Rp${numID(merged.budget.amount)} (${merged.budget.kind}) — data lainnya tetap`);
  }
  if (Object.keys(merged.answers).length > before.answersCount) {
    changes.push(`Jawaban kategori: ${Object.entries(merged.answers).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }
  if (merged.secondary.length > before.secondaryCount) {
    changes.push(`Disiplin tambahan: ${merged.secondary.slice(before.secondaryCount).map((d) => d.label).join(', ')}`);
  } else if (merged.scopeConfirmed.length > before.scopeCount) {
    changes.push(`Cakupan: ${merged.scopeConfirmed.slice(before.scopeCount).map((s) => s.label).join(', ')}`);
  }

  // Kualitas baru disebut tanpa rincian material → tanyakan (pola G).
  if (merged.qualityPreference && !merged.materialPreference && /premium|mewah|high/.test(t) && !qualityTurn) {
    return universalNextStep(merged, changes.length ? changes : undefined);
  }
  return universalNextStep(merged, changes.length ? changes : undefined);
}

/** Terapkan pilihan tombol pada pertanyaan intake universal. */
export function applyUniversalOption(param: string): ActionResult {
  const ctx = universalCtx;
  if (!ctx) {
    return {
      ok: false,
      message: 'Konteks intake sudah tidak aktif. Tulis ulang kebutuhannya, misalnya "buatkan rab gedung kantor 3 lantai".',
    };
  }
  if (param === 'review') {
    // "Susun brief sekarang" saat kuesioner masih tertampil = pengguna
    // memilih lewati kuesioner — pertanyaan tertampil ditandai belum
    // ditentukan secara jujur, bukan dijawab.
    skipPendingQuestionnaire(ctx);
    return universalReviewResult(ctx);
  }
  const applies: Record<string, () => void> = {
    'new': () => { ctx.isNewConstruction = true; },
    'existing': () => { ctx.isNewConstruction = false; },
    'renov-all': () => { ctx.renovationScope = 'seluruh bangunan'; },
    'renov-l1': () => { ctx.renovationScope = 'lantai 1'; },
    'renov-l2': () => { ctx.renovationScope = 'lantai 2'; },
    'renov-part': () => { ctx.renovationScope = 'bagian tertentu'; },
    'kandang-terbuka': () => { ctx.answers['kandang-type'] = 'terbuka'; },
    'kandang-tertutup': () => { ctx.answers['kandang-type'] = 'tertutup'; },
    'wh-portal': () => { ctx.answers['warehouse-system'] = 'portal frame'; },
    'wh-truss': () => { ctx.answers['warehouse-system'] = 'truss/rangka ruang'; },
    'bridge-beton': () => { ctx.answers['bridge-type'] = 'beton'; },
    'bridge-baja': () => { ctx.answers['bridge-type'] = 'baja'; },
    'bridge-kayu': () => { ctx.answers['bridge-type'] = 'kayu'; },
    'drain-uditch': () => { ctx.drainageType = 'U-Ditch Pracetak'; },
    'drain-batu': () => { ctx.drainageType = 'Pasangan Batu Kali'; },
    'drain-culvert': () => { ctx.drainageType = 'Gorong-gorong / Box Culvert'; },
    'drain-beton-terbuka': () => { ctx.drainageType = 'Saluran beton terbuka'; },
  };
  const apply = applies[param];
  if (!apply) {
    return { ok: false, message: 'Pilihan itu tidak dikenal. Pilih lewat tombol yang tersedia atau tulis jawabannya.' };
  }
  apply();
  universalCtx = ctx;
  return universalNextStep(ctx);
}

/** Generate dari brief universal (klik "Susun draft RAB"). */
export function generateUniversalFromBrief(): ActionResult {
  const ctx = universalCtx;
  if (!ctx) {
    return {
      ok: false,
      message: 'Brief proyek sudah tidak aktif. Tulis ulang kebutuhannya, misalnya "buatkan rab jalan beton 2 km".',
    };
  }
  return generateFromUniversalContext(ctx);
}

/** Susun draft dari permintaan yang gerbangnya sudah terjawab (klik tombol). */
function materialAnsweredDraft(pending: PendingRabMaterial, templateId: string, note: string): ActionResult {
  // GATE 4 (5D): projectId pending diteruskan — draft susulan tetap
  // membawa lampiran DED proyek ini.
  const res = universalResultFor(pending.rawText, templateId, note, { projectId: pending.projectId ?? null });
  return res ?? { ok: false, message: 'Draft belum bisa disusun dari pilihan bahan itu.' };
}

const MATERIAL_ASSUME_NOTE =
  'Bahan belum ditentukan — Anda memilih lanjut tanpa memilih bahan ("itu aja"). ' +
  'ASUMSI TERBUKA: draft memakai template katalog "{template}"; bahan rangka & penutup ' +
  'mengikuti template itu. Sebutkan bahannya (mis. baja ringan, genteng, bore pile) ' +
  'untuk menyusun ulang dengan bahan yang tepat.';

/**
 * Keputusan gerbang di titik draft universal berhasil dibangun: hanya
 * untuk draft SATU cakupan berpeta bahan. Bahan terklasifikasi opsi →
 * null (draft berjalan seperti biasa); tanpa template → jawaban jujur;
 * belum disebut → pertanyaan klarifikasi.
 */
function materialGateResult(raw: string, draft: { parts: { scope: { id: string } }[] }, projectId?: string | null): ActionResult | null {
  if (draft.parts.length !== 1) return null;
  const group = materialGroupForScope(draft.parts[0].scope.id);
  if (!group) return null;
  const cls = classifyMaterialText(group, raw);
  if (cls.kind === 'option') return null;
  if (cls.kind === 'untemplated') return materialUntemplatedResult(raw, group, cls.material.label, projectId);
  return materialQuestionResult(raw, group, projectId);
}

/**
 * Jawaban klarifikasi material yang DIKETIK pengguna selama pertanyaan
 * gerbang aktif. Mengembalikan null bila tidak ada gerbang aktif atau
 * teks tidak menyebut bahan/afirmasi apa pun — pemanggil (view) lalu
 * memproses pesan secara normal (perintah baru menggugurkan gerbang).
 */
export function tryContinueRabMaterial(text: string): ActionResult | null {
  const pending = pendingMaterialGate;
  if (!pending) return null;
  const cls = classifyMaterialText(pending.group, text);
  if (cls.kind === 'option') {
    pendingMaterialGate = null;
    return materialAnsweredDraft(
      pending,
      cls.option.templateId,
      `Bahan sesuai jawaban klarifikasi Anda: **${cls.option.label}** — template "{template}" dipakai mengikuti pilihan itu.`
    );
  }
  if (cls.kind === 'untemplated') {
    return materialUntemplatedResult(pending.rawText, pending.group, cls.material.label, pending.projectId ?? null);
  }
  // Aturan afirmasi owner 2026-11-06: "itu aja"/"oke" = eksekusi langkah
  // tertunda (susun draft), BUKAN pertanyaan ulang — dengan asumsi terbuka.
  if (isRabFinalizeText(text)) {
    pendingMaterialGate = null;
    return universalResultFor(pending.rawText, undefined, MATERIAL_ASSUME_NOTE, { projectId: pending.projectId ?? null });
  }
  return null;
}

function rabSummaryResult(raw: string, base?: RabNeeds, projectId?: string | null): ActionResult {
  // Alur ringkasan menggantikan kartu pilihan yang mungkin menggantung.
  pendingChoice = null;
  setPendingSubtypeNeeds(null);
  const needs = extractRabNeeds(raw, base);
  applySubtypeDetection(needs, raw);
  setLastRabNeeds(needs, projectId);
  if (raw) lastRabRaw = raw;
  const missing = missingNeeds(needs);

  // INTENT-FIRST: spek kanonis mengikuti siklus state kebutuhan — giliran
  // pertama diekstrak segar, lanjutan (base ada) digabung lewat
  // continueRabIntent agar koreksi hanya mengubah field yang disebut
  // (W6: satu pemilik jalur koreksi spek — dulu merge manual di sini,
  // continueRabIntent dulu dead code). continueRabIntent(prev) =
  // mergeRabIntentSpec + evaluasi ulang MURNI (evaluateRabIntent tanpa
  // efek samping; spek yang disimpan identik dengan hasil merge).
  // Dua cabang lain TIDAK diganti: giliran pertama (!base) WAJIB ekstrak
  // segar (bukan merge ke spek basi topik lama), dan lanjutan tanpa spek
  // aktif (base && !prevSpec) tetap no-op — continueRabIntent akan
  // mengekstrak segar dari fragmen koreksi dan menyimpan spek parsial.
  const prevSpec = getLastRabIntentSpec();
  if (base && prevSpec) continueRabIntent(raw);
  else if (!base) setLastRabIntentSpec(extractRabIntentSpec(raw));

  /* Refinement (perbaikan overhaul 2026-11-06): bila ini lanjutan dari
   * ringkasan yang sudah tampil (base ada), jawab RINGKAS — hanya kolom
   * yang berubah + kekurangan inti — JANGAN mengulang ringkasan penuh.
   * Ringkasan penuh hanya untuk pesan pertama. */
  if (
    base &&
    (needs.kind === 'rumah' || needs.kind === 'gedung' || needs.kind === 'renovasi' || needs.kind === null)
  ) {
    const changes: string[] = [];
    const num = (v: number) => v.toLocaleString('id-ID', { maximumFractionDigits: 1 });
    if (needs.kindLabel !== base.kindLabel && needs.kindLabel) changes.push(`Jenis pekerjaan: ${needs.kindLabel}`);
    if (needs.floors !== base.floors && needs.floors) changes.push(`Jumlah lantai: ${needs.floors} lantai`);
    // Luas lahan dilaporkan SEBAGAI lahan (audit ekstrem F-080/F-082):
    // sebelumnya kolom ini tidak punya baris perubahan sama sekali dan
    // angkanya bocor menjadi "Luas bangunan" lewat fallback parser.
    if (needs.landAreaM2 !== base.landAreaM2 && needs.landAreaM2) changes.push(`Luas lahan: ${num(needs.landAreaM2)} m²`);
    if (needs.buildingArea !== base.buildingArea && needs.buildingArea) changes.push(`Luas bangunan: ${num(needs.buildingArea)} m²`);
    if (
      (needs.landLength !== base.landLength || needs.landWidth !== base.landWidth) &&
      needs.landLength && needs.landWidth
    ) changes.push(`Ukuran tanah: ${num(needs.landLength)} × ${num(needs.landWidth)} m`);
    if (needs.bedrooms !== base.bedrooms && needs.bedrooms) changes.push(`Kamar tidur: ${needs.bedrooms}`);
    if (needs.bathrooms !== base.bathrooms && needs.bathrooms) changes.push(`Kamar mandi: ${needs.bathrooms}`);
    if (needs.carport !== base.carport && needs.carport !== null) changes.push(`Carport: ${needs.carport ? 'ada' : 'tidak ada'}`);
    if (needs.location !== base.location && needs.location) changes.push(`Lokasi: ${needs.location}`);
    // Material atap kini kolom state tersendiri (audit ekstrem
    // F-081/F-083) — koreksinya dilaporkan seperti kolom lain, bukan
    // "tidak ada perubahan".
    if (needs.roofMaterial !== base.roofMaterial && needs.roofMaterial) changes.push(`Atap: ${needs.roofMaterial}`);
    // Integrasi feedback (audit jalur produksi P0 §3): koreksi
    // pengguna pada sesi kebutuhan adalah peristiwa belajar yang
    // memang dirancang ditangkap constructionFeedback — ditangkap di
    // memori proses saja (tanpa persistensi, tanpa mengubah jawaban).
    if (changes.length > 0) {
      captureFeedback('user-correction', raw, { changes: [...changes] });
    }
    const lines: string[] = [
      changes.length
        ? `Siap, saya perbarui: ${changes.join('; ')}. Data lainnya tetap sama.`
        : 'Siap — tidak ada perubahan dari data sebelumnya.',
    ];
    if (missing.length > 0) {
      lines.push(`Satu data inti lagi: ${missing.join('; ')}. Tulis jawabannya langsung di chat, contoh: "2 lantai, 6x15, 3 kamar tidur".`);
    } else {
      lines.push('Datanya sudah cukup — tulis "itu aja" bila mau saya susun draft RAB-nya sekarang, atau pakai tombol di bawah.');
    }
    return {
      ok: true,
      message: lines.join('\n'),
      awaitRabNeeds: missing.length > 0,
      actions: [
        { label: 'Buka Workspace Desain & RAB', action: { kind: 'intent', intent: 'OPEN_DESIGN_WORKSPACE' } },
        { label: 'Lengkapi kebutuhan', action: { kind: 'intent', intent: 'RAB_NEEDS_REFINE' } },
        { label: 'Mulai manual', action: { kind: 'navigate', menu: 'rab-estimasi' } },
      ],
    };
  }

  const summary = summarizeRabNeeds(needs, missing);

  if (needs.kind === 'ded') {
    // INTENT-FIRST: spek eksplisit dari pesan DED (sudah diekstrak +
    // disimpan di atas) ditampilkan terbuka agar tidak tertimpa default
    // DED di hilir — gambar kerja menjawab ukuran, tetapi spesifikasi
    // yang disebut pengguna tetap berlaku.
    const dedSpec = getLastRabIntentSpec();
    const preserved = dedSpec ? formatSpecSummaryLines(dedSpec) : [];
    return {
      ok: true,
      message:
        `${summary}\n\nUntuk dokumen DED, jalur yang tepat adalah DED Estimate AI — unggah gambar kerja di sana, bukan lewat wizard rumah.` +
        (preserved.length > 0
          ? `\n\nSpesifikasi dari pesan Anda yang saya catat dan tetap berlaku: ${preserved.join('; ')}.`
          : ''),
      actions: [
        { label: 'Buka DED Estimate AI', action: { kind: 'navigate', menu: 'ded-ai' } },
        { label: 'Mulai manual', action: { kind: 'navigate', menu: 'rab-estimasi' } },
      ],
    };
  }
  if (needs.kind === 'rumah' || needs.kind === 'gedung' || needs.kind === 'renovasi' || needs.kind === null) {
    return {
      ok: true,
      message: summary,
      // Perbaikan overhaul 2026-11-06: ringkasan pertama ikut menyetel
      // status menunggu kelengkapan — sebelumnya flag ini hanya disetel
      // hasil klik tombol "Lengkapi kebutuhan", sehingga jawaban ketikan
      // pengguna bocor ke pipeline LLM tanpa state kebutuhan.
      awaitRabNeeds: missing.length > 0,
      actions: [
        { label: 'Buka Workspace Desain & RAB', action: { kind: 'intent', intent: 'OPEN_DESIGN_WORKSPACE' } },
        { label: 'Lengkapi kebutuhan', action: { kind: 'intent', intent: 'RAB_NEEDS_REFINE' } },
        { label: 'Mulai manual', action: { kind: 'navigate', menu: 'rab-estimasi' } },
      ],
    };
  }
  // Non-bangunan berpeta subtipe (jalan/drainase/jembatan): tanya subtipe
  // dulu bila belum disebut; kartu jalur hanya sesudah subtipe jelas.
  if (subtypeGroupFor(needs.kind)) {
    if (!needs.subtypeId) {
      setPendingSubtypeNeeds(needs, projectId);
      return subtypeQuestionResult(needs);
    }
    return pathCardResult(needs);
  }
  // Non-bangunan tanpa peta subtipe: perilaku lama (ringkasan + jalur).
  return {
    ok: true,
    message:
      `${summary}\n\nCatatan jujur: AI Design Studio saat ini khusus bangunan (rumah/gedung). ` +
      `Untuk pekerjaan ${needs.kindLabel ?? 'ini'}, jalur yang tersedia adalah template RAB, Full AI, estimasi dari DED, atau mulai manual — tidak saya arahkan ke wizard rumah.`,
    actions: [
      { label: 'Pakai template', action: { kind: 'navigate', menu: 'template-rab' } },
      { label: 'Full AI', action: { kind: 'intent', intent: 'RAB_FULL_AI', param: buildFullAiPrompt(needs) } },
      { label: 'Dari gambar DED', action: { kind: 'navigate', menu: 'ded-ai' } },
      { label: 'Mulai manual', action: { kind: 'navigate', menu: 'rab-estimasi' } },
    ],
  };
}

/** Lanjutan "Lengkapi kebutuhan": gabungkan jawaban pengguna ke ringkasan.
 *  Basisnya HANYA kebutuhan proyek yang sama (bila sesi sebelumnya milik
 *  proyek lain, scopedLastRabNeeds membersihkannya dan jawaban ini
 *  memulai kebutuhan baru dari teksnya sendiri — bukan gabungan basi). */
export function continueRabNeeds(text: string, projectId?: string | null): ActionResult {
  return rabSummaryResult(text, scopedLastRabNeeds(projectId) ?? undefined, projectId);
}

/** Apakah ada sesi kebutuhan RAB yang aktif pada percakapan ini
 *  (untuk proyek yang dimaksud — sesi proyek lain tidak dihitung)? */
export function hasActiveRabNeeds(projectId?: string | null): boolean {
  return scopedLastRabNeeds(projectId) !== null;
}

/* ------------------------------------------------------------------ */
/* Finalisasi percakapan → draft RAB (perbaikan overhaul 2026-11-06). */
/* "itu aja" sebelumnya tidak dikenal di mana pun: pesan jatuh ke      */
/* pipeline LLM dan tidak pernah menjadi draft. Kini finalisasi       */
/* menyusun draft NYATA dari state kebutuhan memakai builder spek     */
/* (mesin parametrik + data engine yang sama seperti jalur tombol),   */
/* atau menjelaskan bloker teknis yang sebenarnya.                    */
/* ------------------------------------------------------------------ */

const FINALIZE_RE =
  /^\s*(?:oke?\s+|ya\s+)?(?:itu\s*(?:aja|saja|dulu)|segitu\s*(?:aja|saja)|sudah(?:\s+cukup)?|cukup(?:\s+itu)?|lanjut(?:kan)?|proses|generate|buatkan\s+sekarang)[\s.!]*$/i;

/* Afirmasi tunggal (aturan owner 2026-11-06): "oke", "iya", "ya", "siap"
 * dan sejenisnya adalah KONFIRMASI untuk mengeksekusi langkah yang
 * sedang menunggu — jangan dijawab dengan jawaban lain (ringkasan,
 * pertanyaan ulang, atau teks basa-basi). Hanya berlaku sebagai pesan
 * yang berdiri sendiri (jangkar penuh), dan continueRabFinalize tetap
 * mengembalikan null bila tidak ada sesi kebutuhan rumah yang aktif. */
const AFFIRM_RE =
  /^\s*(?:oke?|ok|iya+|ya|baik|siap|setuju|boleh|gas|lanjut)(?:\s+(?:oke?|ok|iya+|ya|baik|siap|setuju|boleh|gas|lanjut))?[\s.!]*$/i;

/** Apakah teks ini pernyataan penutup/konfirmasi kebutuhan ("itu aja", "oke", "iya", …)? */
export function isRabFinalizeText(text: string): boolean {
  const t = text ?? '';
  return FINALIZE_RE.test(t) || AFFIRM_RE.test(t);
}

/**
 * Tangani finalisasi. Mengembalikan null bila teks bukan finalisasi,
 * tidak ada sesi kebutuhan, atau jenisnya bukan rumah (jenis lain tetap
 * pada alur kartu jalurnya masing-masing).
 */
export function continueRabFinalize(text: string, projectId?: string | null): ActionResult | null {
  if (!isRabFinalizeText(text)) return null;
  const needs = scopedLastRabNeeds(projectId);
  if (!needs || needs.kind !== 'rumah') return null;

  const hasAreaBasis = Boolean(needs.buildingArea || (needs.landLength && needs.landWidth));
  if (!hasAreaBasis) {
    return {
      ok: true,
      message:
        'Siap — sebelum saya susun draft-nya, saya masih butuh satu data inti: luas bangunan atau ukuran tanah/bangunan ' +
        '(mis. "6x15" atau "luas 120 m2"). Jumlah lantai dan kamar bisa mengikuti asumsi yang saya labeli terbuka.',
      awaitRabNeeds: true,
      actions: [
        { label: 'Lengkapi kebutuhan', action: { kind: 'intent', intent: 'RAB_NEEDS_REFINE' } },
        { label: 'Mulai manual', action: { kind: 'navigate', menu: 'rab-estimasi' } },
      ],
    };
  }

  const built = buildSpecRabFromNeeds(needs);
  if (!built) {
    return {
      ok: true,
      message:
        `Jujur: mesin parametrik rumah EZRAB saat ini mendukung 1–2 lantai dan luas wajar (tapak 15–250 m², total ≤ 500 m²). ` +
        `Kebutuhan Anda (${needs.floors ? `${needs.floors} lantai` : 'lantai belum jelas'}${needs.buildingArea ? `, luas ${needs.buildingArea} m²` : ''}) berada di luar model itu, ` +
        'jadi saya tidak memaksakan angka dari template yang tidak sesuai. Susun lewat Workspace Desain & RAB atau mulai manual dari kebutuhan yang sama.',
      actions: [
        { label: 'Buka Workspace Desain & RAB', action: { kind: 'navigate', menu: 'desain-rab' } },
        { label: 'Mulai manual', action: { kind: 'navigate', menu: 'rab-estimasi' } },
      ],
    };
  }

  const num = (v: number) => v.toLocaleString('id-ID', { maximumFractionDigits: 1 });
  const facts: string[] = [`${built.floors} lantai`, `luas bangunan ${num(built.totalArea)} m²`];
  if (needs.landLength && needs.landWidth) {
    facts.push(`lahan ${num(needs.landLength * needs.landWidth)} m² (${num(needs.landLength)} × ${num(needs.landWidth)} m)`);
  }
  if (needs.bedrooms) facts.push(`${needs.bedrooms} kamar tidur`);
  if (needs.bathrooms) facts.push(`${needs.bathrooms} kamar mandi`);
  if (needs.carport) facts.push('carport ada');
  const table = directRabTableResult(built);
  return {
    ok: true,
    message:
      `Draft RAB rumah tinggal — ${facts.join(' · ')}.\n` +
      'Status: DRAFT AWAL untuk ditinjau, bukan estimasi final. Item yang masih menunggu spesifikasi teknis atau verifikasi harga ditandai di tabel dan tidak dicampur ke total terverifikasi.\n\n' +
      table.message,
    actions: table.actions,
    // B5-3 direct: teruskan ikatan proyek dari corong (tanpa ini
    // pemanggil tidak tahu draft finalisasi sudah dipastikan proyeknya).
    ...(table.ensuredProjectId ? { ensuredProjectId: table.ensuredProjectId } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Kartu pilihan RAB bertipe (D1, remediasi 2026-10-22): setiap       */
/* parameter di kartu WAJIB berlabel asal — "Dari Anda" untuk yang     */
/* disebut pengguna eksplisit, "Asumsi" untuk inferensi/default        */
/* (lantai default, KT/KM & dimensi default template). Pengguna dapat */
/* mengoreksi lewat chat SEBELUM memilih jalur; koreksi digabung ke    */
/* state pending yang sama (bukan state machine paralel) dan kartu     */
/* di-render ulang — kedua tombol memakai spek terkoreksi.             */
/* ------------------------------------------------------------------ */
export interface PendingRabChoice {
  rawText: string;
  match: NonNullable<ReturnType<typeof findDirectTemplate>>;
  /** Kebutuhan terbaca + gabungan koreksi (bukan versi enriched prompt). */
  needs: RabNeeds;
  floors: number;
  floorsMentioned: boolean;
  landAreaM2: number | null;
  /** Spek intent-first aktif (null = kartu lama pra-intent-first). */
  spec: RabIntentSpec | null;
}

let pendingChoice: PendingRabChoice | null = null;

export function getPendingRabChoice(): PendingRabChoice | null {
  return pendingChoice;
}

export function clearPendingRabChoice(): void {
  pendingChoice = null;
}

/**
 * Pulihkan kartu pilihan RAB (W11 §11 — dipakai efek hidrasi view.tsx
 * sesudah muat ulang; null = hapus, sama dengan clearPendingRabChoice).
 * Nilai yang dipulihkan WAJIB hasil loadHomeState (match dibangun ulang
 * dari rawText lewat findDirectTemplate) — jangan membangun
 * PendingRabChoice dari sumber lain.
 */
export function setPendingRabChoice(p: PendingRabChoice | null): void {
  pendingChoice = p;
}

type BuiltRab = NonNullable<ReturnType<typeof buildDirectRab>>;

/**
 * Hasil komposisi deterministik sebagai jawaban chat: tabel lengkap +
 * tombol Push ke Spreadsheet RAB (pola yang sama dengan
 * GENERATE_RAB_TEMPLATE dan jalur spek bebas CREATE_RAB_DIRECT).
 *
 * B5-3 direct (keputusan owner 2026-11-23, tap "Cakup juga jalur
 * direct-RAB") + §4.5 (direktif owner 2026-11-24, P1 — MENGGANTIKAN
 * SEBAGIAN B5-3) — HOOK KEDUA: ini corong commit draft direct (semua
 * pemanggil — CREATE_RAB_DIRECT, GENERATE_RAB_TEMPLATE, RAB_FULL_AI,
 * finalisasi "itu aja", koreksi kartu — tiba di sini SETELAH
 * buildDirectRab/buildSpecRab sukses). Sama seperti hook universal di
 * universalResultFor: bila ada ensurer terdaftar (view chat), ikat
 * draft ke proyek AKTIF YANG SUDAH ADA (bila ada). ENSURER TIDAK
 * PERNAH MEMBUAT PROYEK: tanpa proyek aktif, draft tetap TAK TERIKAT
 * — pembuatan proyek hanya terjadi lewat konfirmasi eksplisit user
 * (aliran push/finalize §6) atau pembuatan manual. Draft BUKAN
 * proyek. Draft direct tidak punya record UniversalDraft, jadi
 * ensurer hanya mengembalikan proyek aktif (tanpa saveDraft — lihat
 * isUniversalDraft di tempProject.ts). Tanpa ensurer (tes / jalur
 * lain) perilaku IDENTIK dengan lama. Kegagalan ensurer TIDAK PERNAH
 * menggagalkan draft (draft tetap tampil tanpa ikatan — jalan buntu
 * revisi lama, bukan crash). Gerbang yang kembali SEBELUM build
 * (ded/clarify/kartu pilihan/ringkasan kebutuhan) tidak pernah sampai
 * ke sini → tidak pernah memicu proyek.
 */
function directRabTableResult(built: BuiltRab): ActionResult {
  let ensuredProjectId: string | undefined;
  const ensurer = getDraftProjectEnsurer();
  if (ensurer) {
    try {
      const ensured = ensurer({ title: built.displayLabel });
      if (ensured) {
        ensuredProjectId = ensured.id;
      }
    } catch {
      /* pengikatan gagal — draft tetap berlaku tanpa ikatan */
    }
  }
  return {
    ok: true,
    message: formatDirectRabMessage(built),
    actions: [
      { label: 'Push ke Spreadsheet RAB', action: { kind: 'push-rab' } },
      { label: 'Buka Spreadsheet RAB', action: { kind: 'navigate', menu: 'rab-estimasi' } },
      { label: 'Buka Workspace Desain & RAB', action: { kind: 'navigate', menu: 'desain-rab' } },
    ],
    ...(ensuredProjectId ? { ensuredProjectId } : {}),
  };
}

/**
 * Hasil draft universal (katalog template 180) sebagai jawaban chat.
 * Mengembalikan null bila teks bukan permintaan universal yang bisa
 * dibangun — pemanggil WAJIB jatuh ke alur lama (ringkasan/LLM), bukan
 * memaksa hasil. Draft yang berhasil menjadi draft aktif modul universal
 * (target revisi chat dan tombol Push); pertanyaan ambiguitas membawa
 * tombol pilih template; kekurangan data membawa SATU pertanyaan inti.
 */
/**
 * GATE 4 (5D) — dimensi QTO dari teks mentah (jalur cepat, tanpa
 * konteks intake hidup): spek kanonis (panjang/lebar/luas/tinggi/
 * tebal) + kedalaman dari parser anchor yang SAMA dengan intake
 * (parseAnchoredLinear). Tebal: spec.thicknessCm → meter. Tanpa
 * kedalaman/tebal, item volume tidak dapat dibandingkan (CANNOT_CHECK
 * — jujur, bukan ditebak).
 */
function dimsFromRawText(raw: string): QtoUserDimensions {
  const spec = extractUniversalSpec(raw);
  const depth = parseAnchoredLinear(raw, ['kedalaman', 'kedalaman saluran', 'dalam']);
  return {
    lengthM: spec.lengthM ?? spec.buildingLengthM ?? null,
    widthM: spec.widthM ?? spec.buildingWidthM ?? null,
    depthM: depth ? depth.valueM : null,
    heightM: spec.heightM ?? null,
    buildingAreaM2: spec.areaM2 ?? null,
    landAreaM2: spec.landAreaM2 ?? null,
    thicknessM: spec.thicknessCm != null ? spec.thicknessCm / 100 : null,
    floors: spec.floors ?? null,
  };
}

function universalResultFor(raw: string, forcedTemplateId?: string, materialNote?: string, opts?: { structuredSpecs?: StructuredSpec[]; budgetCapOverride?: number | null; projectId?: string | null; buildings?: BuildingModel[]; dedQtoDims?: QtoUserDimensions }): ActionResult | null {
  // GATE 4 (5D) — DED lampiran: spek DED digabung ke spek draft
  // (spek user menang per kunci — mergeDedSpecsIntoSpecs) +
  // rekonsiliasi QTO dihitung untuk draft + tombol koreksi QTO yang
  // masih menunggu. Dibungkus try/catch: kegagalan DED apa pun tidak
  // pernah menggagalkan draft (draft tersusun tanpa DED). Tanpa
  // lampiran, mergedSpecs/dedQto identik dengan perilaku lama.
  let attachment: DedAttachment | null = null;
  let dedQto: DedQtoDraftInfo | undefined;
  let qtoActions: ChatActionButton[] = [];
  let mergedSpecs = opts?.structuredSpecs;
  try {
    attachment = opts?.projectId ? loadDedAttachment(opts.projectId) : null;
    if (attachment) {
      const dedSpecs = dedSpecsFromAttachment(attachment).specs;
      mergedSpecs = mergeDedSpecsIntoSpecs(opts?.structuredSpecs ?? [], dedSpecs).merged;
      const dims = opts?.dedQtoDims ?? dimsFromRawText(raw);
      const { checks } = reconcileDedQto(attachment, dims);
      dedQto = buildDedQtoDraftInfo(attachment, checks, dims);
      for (const p of pendingQtoCorrections(attachment, checks)) {
        qtoActions.push(
          // A2: tombol membawa nilai YANG DITAMPILKAN (pengikatan nilai
          // konfirmasi — handler menolak bila rekomputasi segar beda).
          { label: `Terima koreksi QTO: ${p.description}`, action: { kind: 'qto-correction-confirm', correctionId: p.id, expectedQuantity: p.expectedQuantity, expectedUnit: p.expectedUnit, dedQuantity: p.dedQuantity, dedUnit: p.dedUnit } },
          { label: `Tolak koreksi QTO: ${p.description}`, action: { kind: 'qto-correction-reject', correctionId: p.id } },
        );
      }
    }
  } catch { /* DED gagal — draft tetap jalan tanpa DED */ }
  const res = buildUniversalDraft(raw, forcedTemplateId, {
    structuredSpecs: mergedSpecs,
    budgetCapOverride: opts?.budgetCapOverride,
    projectId: opts?.projectId,
    buildings: opts?.buildings,
    dedQto,
  });
  // Gerbang klarifikasi material (owner 2026-11-10): draft SATU cakupan
  // berpeta bahan (atap/pondasi) yang bahannya BELUM disebut tidak
  // langsung ditampilkan — pengguna ditanya balik dulu. Hanya berjalan
  // pada jalur tanpa template paksa: jawaban gerbang (klik opsi) datang
  // lewat forcedTemplateId, dan lewati-afirmasi datang dengan materialNote.
  if (!forcedTemplateId && !materialNote && res.kind === 'draft') {
    const gate = materialGateResult(raw, res.draft, opts?.projectId ?? null);
    if (gate) return gate;
  }
  // Integrasi feedback (audit jalur produksi P0 §3): permintaan yang
  // tidak terdukung / tidak ada template katalognya adalah sinyal
  // kesenjangan pengetahuan — ditangkap constructionFeedback di sini
  // (memori proses, dedup per subjek) agar antrean review manusia
  // punya bahan nyata dari jalur produksi, bukan hanya dari tes.
  if (res.kind === 'unsupported') {
    captureFeedback('unsupported-request', raw, { reason: res.reason });
  }
  if (res.kind === 'needs-spec' && /tidak ada template katalog/i.test(res.reason)) {
    captureFeedback('missing-knowledge', raw, { reason: res.reason });
  }
  if (res.kind === 'draft') {
    // Ganti-topik membersihkan sesi kebutuhan rumah (audit ekstrem
    // 2026-11-08, Kategori F): draft universal adalah HASIL AKHIR topik
    // non-rumah — bila state rumah dari topik sebelumnya dibiarkan,
    // afirmasi berikutnya ("itu aja") difinalisasi terhadap kebutuhan
    // rumah lama yang sudah ditinggalkan pengguna (bocor antar-topik
    // terukur: rumah → gudang → "itu aja" menghasilkan draft rumah).
    // Sesi kebutuhan hanya hidup selama topiknya rumah/kebutuhan.
    setLastRabNeeds(null);
    // Catatan gerbang material (jawaban/asumsi terbuka) menjadi asumsi
    // PERTAMA draft — tercetak di bagian "Asumsi yang dipakai" dan ikut
    // terbawa ke revisi/transfer, tidak pernah hilang diam-diam.
    if (materialNote) {
      const names = res.draft.parts.map((p) => p.template.name).join(' + ');
      res.draft.assumptions.unshift(materialNote.replace('{template}', names));
    }
    // B5-3 (D-11, keputusan owner 2026-11-23) + §4.5 (direktif owner
    // 2026-11-24, P1 — MENGGANTIKAN SEBAGIAN B5-3) — TITIK HOOK: ini
    // corong commit draft universal jalur chat (semua pemanggil —
    // brief, pratinjau landscape, gerbang material, jalur cepat — tiba
    // di sini SETELAH buildUniversalDraft sukses). Bila draft ini
    // tidak terikat proyek (pemanggil tanpa projectId) DAN ada ensurer
    // terdaftar (view chat), ikat draft ke proyek AKTIF YANG SUDAH ADA
    // (bila ada) agar aktivasi revisi + autosave + restore pasca-reload
    // bekerja. ENSURER TIDAK PERNAH MEMBUAT PROYEK: tanpa proyek aktif,
    // draft tetap TAK TERIKAT — pembuatan proyek hanya terjadi lewat
    // konfirmasi eksplisit user (aliran push/finalize §6) atau
    // pembuatan manual. Draft BUKAN proyek. Tanpa ensurer (tes / jalur
    // lain) perilaku IDENTIK dengan lama. Kegagalan ensurer TIDAK
    // PERNAH menggagalkan draft (draft tetap tampil tanpa ikatan —
    // jalan buntu revisi lama, bukan crash).
    let ensuredProjectId: string | undefined;
    if (!opts?.projectId) {
      const ensurer = getDraftProjectEnsurer();
      if (ensurer) {
        try {
          const ensured = ensurer(res.draft);
          if (ensured) {
            ensuredProjectId = ensured.id;
            setLastUniversalDraft(res.draft, ensured.id);
          }
        } catch {
          /* pengikatan gagal — draft tetap berlaku tanpa ikatan */
        }
      }
    }
    return {
      ok: true,
      message: formatUniversalDraftMessage(res.draft),
      actions: [
        { label: 'Push ke Spreadsheet', action: { kind: 'push-universal' } },
        { label: 'Buka Spreadsheet RAB', action: { kind: 'navigate', menu: 'rab-estimasi' } },
        // GATE 4 (5D): tombol koreksi QTO yang masih menunggu (bila ada
        // DED terlampir + MISMATCH belum diputuskan).
        ...qtoActions,
      ],
      ...(ensuredProjectId ? { ensuredProjectId } : {}),
    };
  }
  if (res.kind === 'needs-spec') {
    // S1-R1 (W6, §6/§11): needs-spec jalur cepat TIDAK BOLEH terminal —
    // sebelumnya pesan ini dikembalikan tanpa state menunggu sehingga
    // jawaban susulan ("bentang 12 m") jatuh ke LLM, bukan ke intake.
    // Kini konteks menunggu disetel dari teks yang sama (deterministik,
    // identik dengan snapshot jalur cepat yang disimpan gerbang) dan
    // view menandai awaitingConcept — jawaban susulan masuk
    // tryContinueUniversalContext. Penjaga: konteks yang SUDAH hidup
    // (generate dari brief yang disetujui) TIDAK ditimpa ekstrak segar
    // — ekstrak segar akan membuang jawaban/kuesioner/budgetHistory;
    // dan bila gerbang landscape yang memiliki topik (projectCtx),
    // konteks universal tidak dibuat (satu topik, satu gerbang).
    if (!universalCtx && !projectCtx) {
      universalCtx = extractUniversalContext(raw);
      // REFIX Stage 3 (BV-02, 2026-11-23) — cap konteks menunggu dengan
      // proyek pemanggil, cermin gerbang universalIntakeGate (yang
      // mencap `if (projectId) ctx.projectId = projectId`). Tanpa cap,
      // dropPersistedIntakeSnapshot early-return (tanpa clear, tanpa
      // outcome) sehingga pesan drop-ditahan S3-A tidak pernah tampil
      // dan snapshot "selamat" secara trivial; konteks tanpa cap juga
      // lolos dari penjaga Tier 1/Tier 2 F-ISO-5 (diperlakukan sebagai
      // jalur lama) sehingga bisa bertahan melewati ganti proyek.
      // Tanpa proyek aktif (global) ctx tetap tanpa cap — perilaku lama.
      if (opts?.projectId) universalCtx.projectId = opts.projectId;
    }
    // Pesan kontekstual tipologi (2026-11-08): bila builder sudah
    // menyusun ringkasan pemahaman, tampilkan itu — pengguna melihat apa
    // yang sudah dipahami dan hanya ditanya SATU hal yang benar-benar
    // menghalangi; bukan penolakan generik.
    if (res.understoodSummary) {
      return {
        ok: true,
        message:
          `${res.reason}\n\nYang sudah saya pahami: ${res.understoodSummary}.\n\n` +
          `Yang masih dibutuhkan:\n${res.missing.map((m) => `• ${m}`).join('\n')}\n\n` +
          'Begitu ukurannya ada, draft awal langsung saya siapkan — spesifikasi lain (struktur, pondasi, atap) cukup ditandai perlu konfirmasi, tidak menghalangi draft.',
        awaitProjectConcept: true,
      };
    }
    return {
      ok: true,
      message:
        `${res.reason}\n\nYang masih dibutuhkan:\n${res.missing.map((m) => `• ${m}`).join('\n')}\n\nBalas pesan ini dengan data itu — tidak perlu mengulang permintaan dari awal; draft tidak dibuat dari tebakan.`,
      awaitProjectConcept: true,
    };
  }
  return null;
}

/** Teks sintetis minimal dari kebutuhan tersimpan untuk jalur universal. */
function syntheticUniversalRawText(n: RabNeeds): string | null {
  const parts: string[] = ['buatkan rab'];
  if (n.kindLabel) parts.push(n.kindLabel);
  if (n.lengthM) parts.push(`sepanjang ${n.lengthM} m`);
  else if (n.buildingArea) parts.push(`luas ${n.buildingArea} m2`);
  else if (n.buildingWidth && n.buildingLength) parts.push(`${n.buildingWidth}x${n.buildingLength}`);
  if (n.floors) parts.push(`${n.floors} lantai`);
  if (n.location) parts.push(`di ${n.location}`);
  if (!n.kindLabel && !n.lengthM && !n.buildingArea && !n.floors) return null;
  return parts.join(' ');
}

/**
 * Teks sintetis minimal dari kebutuhan rumah tersimpan — jalur defensif
 * RAB_FULL_AI bila teks asal pengguna tidak tersedia (mis. pemanggil lama
 * tanpa param). RabNeeds tidak membawa houseType/templateId: angka tipe
 * terbawa lewat buildingArea (konvensi katalog EZRAB: angka tipe = luas
 * per lantai, dan choiceCardResult memang mengisi buildingArea dari tipe
 * terdaftar); dimensi lahan/bangunan menjadi jalur spek bebas. Tanpa
 * luas/dimensi terukur, tidak ada teks jujur yang bisa disusun → null.
 */
function syntheticHouseRawText(n: RabNeeds): string | null {
  const parts: string[] = ['buatkan rab rumah'];
  // Perbaikan overhaul 2026-11-06: luas bangunan BUKAN angka tipe — bentuk
  // lama (`type 120`) dibaca parseFreeSpec sebagai typeNumber sehingga
  // tapak/total menjadi 2× lipat dari yang diminta pengguna.
  if (n.buildingArea) parts.push(`luas bangunan ${n.buildingArea} m2`);
  else if (n.landLength && n.landWidth) parts.push(`${n.landLength}x${n.landWidth}`);
  else return null;
  if (n.floors) parts.push(`${n.floors} lantai`);
  if (n.location) parts.push(`di ${n.location}`);
  return parts.join(' ');
}

type CardTemplate = PendingRabChoice['match']['template'];

function templateDefault(template: CardTemplate, key: 'bedroomCount' | 'bathroomCount' | 'buildingLength' | 'buildingWidth'): number | null {
  const d = template.parameters?.[key]?.defaultValue;
  return typeof d === 'number' ? d : null;
}

function choiceCardResult(p: PendingRabChoice, corrected: boolean, projectId?: string | null, recommendation?: RabTemplateRecommendation | null): ActionResult {
  const { item, template } = p.match;
  const needs = p.needs;
  const { region } = matchDirectRegion(needs.location);
  const lines: string[] = [];
  lines.push(
    corrected
      ? 'Siap — kartu pilihan saya perbarui dengan koreksi Anda. Ini spek yang kini terbaca:'
      : 'Siap — permintaan Anda cocok dengan template RAB terdaftar. Ini ringkasan spek yang saya baca:'
  );
  // INTENT-FIRST (2026-11-20): label asal dibedakan — "Dari Anda (tipe
  // disebut di pesan)" hanya benar bila tipe BENAR-BENAR disebut
  // (matchedByType). Kartu fallback R1 (luas tanpa tipe) sebelumnya
  // mengklaim Type 70 "dari Anda" untuk permintaan "luas bangunan 86m2"
  // yang tidak pernah menyebut tipe, dan menulis luas tipe (70 m²)
  // sebagai "Luas bangunan — Dari Anda" padahal pengguna meminta 86 m².
  const fallback = p.match.areaFallback;
  if (fallback) {
    lines.push(`• Template: **${item.label}** (${displayTemplateBasisName(template.name, p.floors)}) — basis terdekat (tipe tidak disebut di pesan)`);
    lines.push(`• Luas bangunan: ${fallback.requestedArea} m² — Dari Anda (permintaan; template hanya basis, bukan luas tipe ${fallback.basisArea} m²)`);
  } else {
    lines.push(`• Template: **${item.label}** (${displayTemplateBasisName(template.name, p.floors)}) — Dari Anda (tipe disebut di pesan)`);
    lines.push(
      `• Luas bangunan: ${p.floors > 1 ? `${item.area} m² per lantai (total ±${item.area * p.floors} m²)` : `${item.area} m²`} — Dari Anda (dari Type ${item.area})`
    );
  }
  // Luas lahan dari spek intent-first didahulukan: frasa lahan telanjang
  // ("luas 100m2" + "luas bangunan 86m2") dibaca spek sebagai lahan,
  // sementara resolveLandAreaM2 hanya mengenal frasa berlabel lahan.
  const landShown = p.spec?.landAreaM2 ?? p.landAreaM2;
  if (landShown) {
    lines.push(`• Luas lahan: ${landShown} m² — Dari Anda (dicatat — belum memengaruhi hitungan RAB)`);
  }
  if (p.spec && p.spec.roofSystem.length > 0) {
    lines.push(`• Atap: ${p.spec.roofSystem.join(', ')} — Dari Anda (dicatat — bukan parameter template)`);
  }
  if (p.spec && p.spec.scope.length > 0) {
    lines.push(`• Lingkup: ${p.spec.scope.join(', ')} — Dari Anda`);
  }
  lines.push(
    `• Jumlah lantai: ${p.floors} lantai — ${p.floorsMentioned ? 'Dari Anda' : 'Asumsi (default — tidak disebutkan; koreksi bila berbeda)'}`
  );
  const bedDefault = templateDefault(template, 'bedroomCount');
  const bathDefault = templateDefault(template, 'bathroomCount');
  if (needs.bedrooms) lines.push(`• Kamar tidur: ${needs.bedrooms} — Dari Anda`);
  else if (bedDefault != null) lines.push(`• Kamar tidur: ${bedDefault} — Asumsi (default template)`);
  if (needs.bathrooms) lines.push(`• Kamar mandi: ${needs.bathrooms} — Dari Anda`);
  else if (bathDefault != null) lines.push(`• Kamar mandi: ${bathDefault} — Asumsi (default template)`);
  if (needs.landLength && needs.landWidth) {
    lines.push(`• Dimensi bangunan: ${needs.landLength} × ${needs.landWidth} m — Dari Anda`);
  } else {
    const bl = templateDefault(template, 'buildingLength');
    const bw = templateDefault(template, 'buildingWidth');
    if (bl != null && bw != null) {
      lines.push(`• Dimensi bangunan: ±${bw} × ${bl} m — Asumsi (default template)`);
    }
  }
  if (needs.location) {
    lines.push(`• Lokasi: ${needs.location} — Dari Anda → indeks harga ${region}`);
  } else {
    lines.push('• Lokasi: belum disebutkan — Asumsi indeks harga DKI Jakarta (default)');
  }
  lines.push('');
  lines.push(
    'Ada yang keliru? Koreksi langsung di chat sebelum memilih — misalnya "2 lantai" atau "3 kamar tidur" — kartu ini akan saya perbarui, dan kedua pilihan di bawah memakai spek terkoreksi.'
  );
  // INTENT-FIRST: tombol pilihan TIDAK PERNAH tampil buta — kartu membawa
  // rekomendasi metode + alasan dari evaluasi spek (orkestrator).
  if (recommendation) {
    const methodLabel =
      recommendation.method === 'template'
        ? 'Pakai Template'
        : recommendation.method === 'spec'
          ? 'Susun dari spesifikasi (kustom)'
          : recommendation.method === 'universal'
            ? 'Pakai template katalog'
            : recommendation.method === 'ded'
              ? 'DED Estimate AI'
              : 'Susun kustom';
    lines.push('');
    lines.push(`**Rekomendasi: ${methodLabel}** — ${recommendation.reasons.join(' ')}`);
    if (recommendation.alternatives && recommendation.alternatives.length > 0) {
      lines.push(`Alternatif yang dipertimbangkan: ${recommendation.alternatives.join('; ')}.`);
    }
  }
  lines.push('');
  lines.push(
    'Pilih cara membuat RAB-nya:\n' +
      '• **Pakai Template** — hitung parametrik instan di chat ini: tabel item + total + tombol Push ke Spreadsheet RAB.\n' +
      '• **Pakai AI Full** — AI menyusun RAB lengkap langsung di chat ini: tabel item + total + tombol Push ke Spreadsheet RAB.'
  );

  // Versi enriched untuk prompt desain & state ringkasan: luas bangunan
  // TIDAK PERNAH diambil dari angka lahan (S7).
  const enriched: RabNeeds = {
    ...needs,
    kind: 'rumah',
    kindLabel: needs.kindLabel ?? 'rumah tinggal',
    floors: p.floors,
    buildingArea:
      needs.buildingArea && needs.buildingArea !== p.landAreaM2 ? needs.buildingArea : item.area,
  };
  setLastRabNeeds(enriched, projectId);
  lastRabRaw = p.rawText;

  return {
    ok: true,
    message: lines.join('\n'),
    awaitRabChoice: true,
    actions: [
      { label: 'Pakai Template', action: { kind: 'intent', intent: 'GENERATE_RAB_TEMPLATE', param: p.rawText } },
      { label: 'Pakai AI Full', action: { kind: 'intent', intent: 'RAB_FULL_AI', param: p.rawText } },
    ],
  };
}

/**
 * Koreksi pra-pilih pada kartu pilihan: gabungkan teks koreksi pengguna
 * ("2 lantai", "3 kamar tidur", "lahan 120 m2", …) ke state pending,
 * lalu render ulang kartu dengan spek terkoreksi. Konteks pilihan
 * (template + kedua jalur) tetap utuh.
 */
export function continueRabChoice(text: string, projectId?: string | null): ActionResult {
  const p = pendingChoice;
  if (!p) return rabSummaryResult(text, undefined, projectId);
  const correction = extractRabNeeds(stripLandPhrases(text));
  const merged = extractRabNeeds(stripLandPhrases(text), { ...p.needs });
  // INTENT-FIRST: koreksi digabung ke SPEK via mergeRabIntentSpec — hanya
  // field yang disebut koreksi yang berubah; sisanya dipertahankan.
  // SENGAJA BUKAN continueRabIntent (W6, diputuskan sesudah analisis):
  // basis merge di sini adalah spek KARTU (p.spec), BUKAN spek aktif
  // modul (lastRabIntentSpec) yang dipakai continueRabIntent — keduanya
  // bisa berbeda (kartu dibuat sebelum alur lain menimpa spek aktif).
  // Fallback p.spec==null juga berbeda: ekstrak segar dari teks gabungan
  // kartu+koreksi, bukan dari fragmen koreksi saja. Mengganti ke
  // continueRabIntent akan mengubah perilaku koreksi kartu — JANGAN.
  const mergedSpec = p.spec
    ? mergeRabIntentSpec(p.spec, text)
    : extractRabIntentSpec(`${p.rawText}\n${text}`);
  setLastRabIntentSpec(mergedSpec);
  // Bila koreksi menambahkan spesifikasi yang BUKAN parameter template
  // (atap/material/struktur/pondasi/lingkup parsial), kartu pilihan tidak
  // lagi berlaku — template tidak bisa mewakili spek terkoreksi. Alihkan
  // ke jalur spek (dengan penjelasan) daripada menawarkan pilihan yang
  // akan menghilangkan spesifikasi pengguna secara diam-diam.
  const unsupported = unsupportedSpecReasons(mergedSpec);
  if (unsupported.length > 0) {
    const specBuilt = buildSpecRab(mergedSpec.rawText, {
      skipTemplateGuard: true,
      intentSpec: mergedSpec,
    });
    if (specBuilt) {
      pendingChoice = null;
      setPendingSubtypeNeeds(null);
      const table = directRabTableResult(specBuilt);
      return {
        ...table,
        message:
          `Koreksi dicatat: ${unsupported.join('; ')} — spesifikasi itu bukan parameter template ${p.match.item.label}, ` +
          'jadi kartu pilihan tidak lagi berlaku dan RAB dihitung dari spesifikasi Anda:\n\n' +
          table.message,
      };
    }
    // Build spek gagal — kartu tetap tampil dengan spek terkoreksi.
  }
  const updated: PendingRabChoice = {
    ...p,
    needs: merged,
    floors: merged.floors ?? p.floors,
    floorsMentioned: p.floorsMentioned || correction.floors != null,
    landAreaM2: mergedSpec.landAreaM2 ?? p.landAreaM2,
    spec: mergedSpec,
  };
  pendingChoice = updated;
  return choiceCardResult(updated, true, projectId);
}

/* ------------------------------------------------------------------ */
/* Klarifikasi topik (peraturan owner 2026-10-23): query lanjutan     */
/* atas kartu klarifikasi dijawab DETERMINISTIK dari data EZRAB —     */
/* format hasil meniru PERSIS pola tool yang bersangkutan di          */
/* tools.ts (cari_ahsp / cari_harga), provenans diteruskan apa        */
/* adanya, harga tak tersedia TIDAK PERNAH ditulis Rp0.               */
/* ------------------------------------------------------------------ */

/** Query mode 'ahsp': cari di katalog AHSP 2026 resmi (maks 8, via engine chat). */
function clarifyAhspQueryResult(query: string): ActionResult {
  let result: ReturnType<typeof searchChatAhsp>;
  try {
    result = searchChatAhsp(query);
  } catch {
    return {
      ok: false,
      message: 'Pencarian AHSP sedang tidak bisa diakses. Coba lagi sebentar, atau buka katalog AHSP 2026 langsung.',
      actions: [
        { label: 'Buka katalog AHSP 2026', action: { kind: 'navigate', menu: 'ahsp-2026' } },
      ],
    };
  }
  if (result.outcome === 'NOT_FOUND') {
    return {
      ok: true,
      message: formatChatAhspResult(result),
      awaitClarify: 'ahsp',
    };
  }
  // Format per baris mengikuti pola tool cari_ahsp (tools.ts) yang baru:
  // [kode] judul — satuan — harga + provenance koefisien/HSD terpisah.
  return {
    ok: true,
    message: `Hasil pencarian AHSP 2026 untuk "${query}":\n\n${formatChatAhspResult(result)}`,
    actions: [
      { label: 'Buka katalog AHSP 2026', action: { kind: 'navigate', menu: 'ahsp-2026' } },
      { label: 'Cari lagi', action: { kind: 'intent', intent: 'CLARIFY_PICK', param: 'ahsp:search' } },
    ],
  };
}

/** Query mode harga-*: lewat tool cari_harga (resolver + format kanonis). */
function clarifyHargaQueryResult(
  query: string,
  mode: 'harga-material' | 'harga-upah' | 'harga-alat',
): ActionResult {
  const jenis = mode === 'harga-upah' ? 'upah' : mode === 'harga-alat' ? 'alat' : 'material';
  const tool = EZRAB_AI_TOOLS.find((t) => t.name === 'cari_harga');
  if (!tool) return { ok: false, message: 'Pencarian harga tidak tersedia saat ini.' };
  const result = tool.invoke({ kata_kunci: query, jenis });
  // cari_harga sinkron; penjaga tipe karena invoke tool akun (async) kini
  // berbagi signature (Fase B) — tidak pernah terpicu untuk tool ini.
  if (typeof result !== 'string') return { ok: false, message: 'Pencarian harga tidak tersedia saat ini.' };
  if (result.startsWith('ERROR')) return { ok: false, message: result };
  if (result.startsWith('Tidak ditemukan harga')) {
    // Belum tersedia ≠ nol: beri kesempatan mencoba nama lain dalam
    // mode yang sama tanpa mengulang dari kartu.
    return {
      ok: true,
      message: `${result}\n\nKetik nama lain langsung di sini untuk mencoba lagi.`,
      awaitClarify: mode,
    };
  }
  return { ok: true, message: result };
}

/** Query mode 'template': cari di katalog template gabungan (maks 6). */
function clarifyTemplateQueryResult(query: string): ActionResult {
  let entries: ReturnType<typeof listUnifiedTemplates>;
  try {
    entries = listUnifiedTemplates();
  } catch {
    return { ok: false, message: 'Katalog template sedang tidak bisa dibaca. Coba lagi sebentar.' };
  }
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  const scored = entries
    .map((e) => {
      const cat = e.catalogTemplate?.category ?? '';
      const sub = e.catalogTemplate?.subcategory ?? '';
      const hay = `${e.name} ${e.id} ${cat} ${sub}`.toLowerCase();
      let score = 0;
      for (const w of words) if (hay.includes(w)) score++;
      return { e, score, catLabel: (sub || cat).replace(/_/g, ' ') };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  if (scored.length === 0) {
    return {
      ok: true,
      message:
        `Tidak ditemukan template untuk "${query}".\n\n` +
        'Coba kata kunci lain — jenis bangunannya (mis. "rumah", "ruko") atau jenis ' +
        'pekerjaannya (mis. "jalan", "drainase"). Ketik kata kunci barunya langsung di sini.',
      awaitClarify: 'template',
    };
  }
  const list = scored
    .map((s, i) => `${i + 1}. ${s.e.name}${s.catLabel ? ` — ${s.catLabel}` : ''}`)
    .join('\n');
  return {
    ok: true,
    message:
      `Template yang cocok untuk "${query}":\n\n${list}\n\n` +
      'Buka katalog untuk melihat detailnya dan menerapkan template ke proyek.',
    actions: [
      { label: 'Buka Katalog Template', action: { kind: 'navigate', menu: 'template-rab' } },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Mutasi item RAB deterministik (2026-11-17, gap P1 audit perintah)    */
/* ------------------------------------------------------------------ */

/** Pesan gerbang tulis — SAMA PERSIS dengan yang dipakai tool propose_*
 * (tools.ts) agar jawaban deterministik dan jalur LLM konsisten. */
const WRITES_DISABLED_MESSAGE =
  'Operasi tulis Asisten AI tidak aktif untuk sesi ini: peran aktif tidak memiliki capability edit-estimate (atau belum masuk dengan peran demo). Tidak ada perubahan yang dibuat.';

type MutationGate =
  | { ok: true; snap: ProjectSnapshot; actor: string }
  | { ok: false; message: string };

/** Gerbang bersama kelima case mutasi: snapshot proyek aktif + peran
 * berhak tulis + pagar dataset >1.000 item — urutan dan pesannya sama
 * dengan tool propose_* (tools.ts). Gagal di sini = tidak ada plan yang
 * dibuat dan tidak ada klaim apa pun. */
function requireMutationGate(): MutationGate {
  const snap = getActiveProjectSnapshot();
  if (!snap) {
    return { ok: false, message: 'Tidak ada proyek aktif. Buka salah satu proyek dulu di Daftar Proyek, lalu ulangi perintahnya.' };
  }
  const opCtx = getAssistantOperationContext();
  if (!opCtx?.writesEnabled) return { ok: false, message: WRITES_DISABLED_MESSAGE };
  const guard = writesDatasetGuard(snap);
  if (guard) return { ok: false, message: guard };
  return { ok: true, snap, actor: opCtx.actor };
}

/** Kata pengisi pada nama item perintah — "hapus item plesteran" berarti
 * item "plesteran", bukan item yang uraiannya memuat kata "item" (tidak
 * ada uraian seperti itu, sehingga tanpa pembersihan ini pencocokan
 * selalu gagal). "pekerjaan" juga pengisi ("hapus pekerjaan galian" =
 * pekerjaan galian). Frasa lokasi "di proyek (ini)" ikut dibuang. */
export function cleanItemName(raw: string): string {
  return String(raw ?? '')
    .replace(/[?.,!]+$/g, '')
    .replace(/^(?:item|pekerjaan)(?:\s+|$)/i, '')
    .replace(/\s+di\s+proyek(?:\s+ini)?\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Pisahkan "nama jadi nilai" ("plesteran jadi 25 m2" → nama "plesteran",
 * nilai "25 m2"). "jadi/menjadi" dicoba dulu agar "ke" di dalam nama
 * ("plesteran lantai ke 2 jadi 25 m2") tidak memotong terlalu dini. */
export function splitNameAndValue(param: string): { name: string; valueText: string } | null {
  const text = String(param ?? '').trim();
  const m =
    text.match(/^(.+?)\s+(?:jadi|menjadi)\s+(.+)$/i) ??
    text.match(/^(.+?)\s+(?:ke|=)\s+(.+)$/i);
  if (!m) return null;
  return { name: cleanItemName(m[1]), valueText: m[2].trim() };
}

const RUPIAH_MULTIPLIERS: Record<string, number> = {
  ribu: 1_000, rb: 1_000, k: 1_000,
  juta: 1_000_000, jt: 1_000_000,
  miliar: 1_000_000_000, milyar: 1_000_000_000,
};

/**
 * Parser nominal Rupiah dari perintah ("Rp 50.000", "50000", "50 ribu",
 * "2,5 juta", "50rb"). Format Indonesia: titik = pemisah ribuan, koma =
 * desimal. Mengembalikan rupiah bulat (Math.round — pratinjau menampilkan
 * nilai persisnya, jadi pembulatan tidak pernah diam-diam) atau null bila
 * tidak terbaca. Tidak ada parser Rupiah di repo sebelum ini (grep
 * 2026-11-17) — fungsi ini yang pertama.
 */
export function parseRupiahAmount(text: string): number | null {
  const s = String(text ?? '')
    .trim()
    .replace(/^(rp|rupiah)\s*/i, '')
    .replace(/\s*(ya|dong|aja|saja|tolong)[?.,!]*\s*$/i, '')
    .trim();
  const m = s.match(/^([\d][\d.,]*)\s*(ribu|juta|miliar|milyar|rb|jt|k)?$/i);
  if (!m) return null;
  const mult = RUPIAH_MULTIPLIERS[(m[2] ?? '').toLowerCase()] ?? 1;
  const num = m[1];
  let value: number;
  if (num.includes(',')) {
    // Koma = desimal; semua titik adalah pemisah ribuan.
    value = Number(num.replace(/\./g, '').replace(',', '.'));
  } else if (/^\d{1,3}(\.\d{3})+$/.test(num)) {
    // Pola ribuan Indonesia murni: 50.000, 1.250.000.
    value = Number(num.replace(/\./g, ''));
  } else {
    value = Number(num);
  }
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * mult);
}

export interface ParsedVolume { volume: number; unit: string | null }

/**
 * Nilai volume dari teks nilai ("25 m2", "25", "2,5 m3", "5 hari").
 * parseRequestedQuantity dulu (satuan katalog); bila gagal, angka
 * telanjang atau angka + kata satuan apa pun — kecocokan satuan terhadap
 * item target diperiksa penelepon (satuan tak cocok ditolak, bukan
 * dikonversi diam-diam).
 */
export function parseVolumeValue(valueText: string): ParsedVolume | null {
  const s = String(valueText ?? '')
    .trim()
    .replace(/\s*(ya|dong|aja|saja|tolong)[?.,!]*\s*$/i, '')
    .trim();
  const q = parseRequestedQuantity(s);
  if (q) return { volume: q.volume, unit: q.unit };
  const m = s.match(/^(\d+(?:[.,]\d+)?)\s*([a-z'²³]+)?$/i);
  if (!m) return null;
  const volume = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(volume) || volume < 0) return null;
  return { volume, unit: m[2] ? normalizeUnit(m[2]) : null };
}

/** Normalisasi satuan untuk perbandingan (spasi dalam "m 2" dibuang). */
function normUnitForCompare(u: string | null | undefined): string {
  return normalizeUnit(u).replace(/\s+/g, '');
}

/**
 * Kecocokan satuan: sama sesudah normalisasi, atau pasangan 'm'/'m''
 * (meter vs meter lari — dimensi sama, notasi berbeda). Yang lain
 * (m2 vs m3, kg vs m2) TIDAK cocok — tidak pernah dikonversi diam-diam.
 */
export function unitsCompatible(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normUnitForCompare(a);
  const nb = normUnitForCompare(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return (na === 'm' && nb === "m'") || (na === "m'" && nb === 'm');
}

export interface ExtractedAddTarget { name: string; volume: number | undefined; unit: string | null }

/**
 * Pisahkan nama + volume dari ekor perintah tambah ("plesteran 10 m2" →
 * nama "plesteran", volume 10, satuan "m2"). Kuantitas dicari di AKHIR
 * ("30 m" untuk bouwplank ikut tertangkap — satuan 'm' telanjang diterima
 * di sini karena kecocokannya diperiksa terhadap satuan item AHSP hasil
 * pencarian). Tanpa kuantitas akhir → volume undefined (builder memakai 1
 * + peringatan). Penjaga \s+ sebelum angka melindungi mutu ("beton k225"
 * bukan volume 225).
 */
export function extractAddTarget(param: string): ExtractedAddTarget {
  const s = String(param ?? '')
    .trim()
    .replace(/\s*(ya|dong|aja|saja|tolong)[?.,!]*\s*$/i, '')
    .trim();
  const m = s.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(m\s*2|m²|m\s*3|m³|kg|m'|buah|unit|titik|ls|hari|oh|m)?\s*$/i);
  if (!m) return { name: cleanItemName(s), volume: undefined, unit: null };
  const volume = Number(m[2].replace(',', '.'));
  if (!Number.isFinite(volume) || volume <= 0) return { name: cleanItemName(s), volume: undefined, unit: null };
  return { name: cleanItemName(m[1]), volume, unit: m[3] ? normalizeUnit(m[3]) : null };
}

/* ------------------------------------------------------------------ */
/* Workstream B1 (2026-11-19, gap P2 + P6 + §K baris 42 audit          */
/* perintah): TRANSFER_DRAFT, SET_PROJECT_PRICE (+CONFIRM),            */
/* CHANGE_PLAN. Pola rename deterministik: fail-closed, nama verbatim, */
/* tanpa angka karangan; mutasi harga lewat pratinjau + konfirmasi     */
/* tombol (langkah 1 tidak pernah menulis).                            */
/* ------------------------------------------------------------------ */

/** TRANSFER_DRAFT: jalankan alur push-preview yang SAMA seperti tombol
 *  Push (callback view → pushUniversalToSpreadsheetPreview — pratinjau
 *  + tombol Konfirmasi Transfer + pengikatan approval). Tanpa callback
 *  atau tanpa draft aktif → jawab jujur, tidak ada klaim transfer. */
function handleTransferDraft(ctx: ChatActionContext): ActionResult {
  if (!ctx.requestDraftTransferPreview) {
    return {
      ok: false,
      message:
        'Saya belum bisa menampilkan pratinjau transfer dari chat ini. Buat draft dulu, lalu klik tombol "Push ke Spreadsheet" pada pesan draft.',
    };
  }
  let shown: boolean;
  try {
    shown = ctx.requestDraftTransferPreview();
  } catch {
    return {
      ok: false,
      message: 'Pratinjau transfer gagal ditampilkan — coba klik tombol "Push ke Spreadsheet" pada pesan draft.',
    };
  }
  if (!shown) {
    return {
      ok: true,
      message:
        'Tidak ada draft RAB yang aktif untuk ditransfer. Buat dulu dengan perintah seperti "buatkan RAB jalan paving 300 m2", lalu ulangi "transfer draft ke spreadsheet".',
    };
  }
  return {
    ok: true,
    message:
      'Pratinjau transfer draft ditampilkan di atas — periksa itemnya, lalu klik "Konfirmasi Transfer" bila sudah sesuai. Tanpa klik konfirmasi, tidak ada item yang ditulis ke spreadsheet.',
  };
}

/* ---------------- SET_PROJECT_PRICE: resolusi nama→kode ------------- */

export interface ResolvedProjectPriceTarget {
  resourceCode: string;
  resourceName: string;
  category: 'MATERIAL' | 'LABOR' | 'EQUIPMENT';
  unit: string;
  masterPrice: number;
  /** Bila harga master bervariasi antar-sumber: rentang + jumlah sumber
   *  (diungkapkan di pratinjau — masterPrice hanyalah pembanding). */
  priceRange?: { min: number; max: number; sources: number };
}

export type ProjectPriceResolution =
  | { status: 'ok'; target: ResolvedProjectPriceTarget }
  | { status: 'not-found'; query: string }
  | { status: 'ambiguous'; query: string; candidates: Array<{ name: string; unit: string; code: string }> }
  | { status: 'empty-code'; query: string; name: string; unit: string; priceText: string };

const normPriceName = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');

function priceCategoryOf(resourceType: string): 'MATERIAL' | 'LABOR' | 'EQUIPMENT' | null {
  if (resourceType === 'material') return 'MATERIAL';
  if (resourceType === 'labor') return 'LABOR';
  if (resourceType === 'equipment') return 'EQUIPMENT';
  return null;
}

/**
 * Resolusi nama material → target override (kode + satuan + harga
 * master pembanding). Sumber utama: RESOURCE_PRICE_RECORDS (master
 * harga 2026 — tempat "Paku asbes" tinggal); fallback: resolver
 * kanonis (menjangkau record CK/BM yang tidak ada di master ini).
 *
 * Fail-closed di tiga titik — TIDAK PERNAH menebak:
 * - 0 kandidat → not-found (disertai saran "cari harga …" + jalur
 *   ubah harga item RAB).
 * - >1 kelompok (nama, satuan) berbeda, atau 1 kelompok dengan >1 kode
 *   → ambiguous (daftar kandidat, minta spesifikasi).
 * - record berkode kosong (resourceCode "") → empty-code: override
 *   dikunci pada kode (PriceRepository menolak kode kosong dengan
 *   INVALID_PRICE_CODE; semua record berkode "" berbagi satu kunci
 *   sehingga override untuk salah satunya menimpa yang lain).
 * Harga master pembanding: 1 harga unik → harga itu; bervariasi →
 * harga resolver per kode+satuan BILA cocok dengan salah satu harga
 * mentah (resolver kadang mengembalikan hasil konversi yang tidak
 * cocok dengan record mana pun — itu tidak dipakai), bila tidak →
 * harga record pertama kelompok (harga nyata yang tercatat) dengan
 * rentang diungkapkan di pratinjau.
 */
export function resolveProjectPriceTarget(query: string): ProjectPriceResolution {
  const q = (query ?? '').trim();
  const nq = normPriceName(q);
  if (!q || !nq) return { status: 'not-found', query: q };

  // 1. Kode eksak ("M.23", "E13") — didahulukan atas pencocokan nama.
  const byCode = RESOURCE_PRICE_RECORDS.filter(
    (r) => r.resourceCode && r.resourceCode.toLowerCase() === q.toLowerCase(),
  );
  let pool = byCode.length > 0 ? byCode : null;
  if (!pool) {
    // 2. Nama: SEMUA token query harus hadir sebagai kata utuh di nama
    // record ("paku asbes" cocok dengan "Paku asbes", bukan "Paku 5 cm").
    const tokens = nq.split(' ');
    const nameHits = RESOURCE_PRICE_RECORDS.filter((r) => {
      const words = normPriceName(r.resourceName).split(' ');
      return tokens.every((t) => words.includes(t));
    });
    if (nameHits.length === 0) {
      // 3. Fallback resolver kanonis (CK/BM): jawaban tunggal otoritatif
      // — pratinjau menampilkan nama+satuan+harga hasil resolusi
      // sehingga pengguna bisa menangkap salah cocok sebelum konfirmasi.
      try {
        const res = priceResolver2026.resolveResourcePrice({ resourceName: q, resourceType: 'unknown' } as any);
        const rec: any = (res as any)?.record ?? res;
        const price = typeof rec?.price === 'number' ? rec.price : (res as any)?.price;
        if (!res || (res as any).status !== 'RESOLVED' || price == null) {
          return { status: 'not-found', query: q };
        }
        const code = String((res as any).resourceCode ?? '');
        const name = String((res as any).resourceName ?? q);
        const unit = String((res as any).unit ?? '');
        const category = priceCategoryOf(String((res as any).resourceType ?? ''));
        if (!code) {
          return { status: 'empty-code', query: q, name, unit, priceText: `${fmtIDR(Math.round(Number(price)))}${unit ? `/${unit}` : ''}` };
        }
        if (!category || !unit) return { status: 'not-found', query: q };
        return {
          status: 'ok',
          target: { resourceCode: code, resourceName: name, category, unit, masterPrice: Math.round(Number(price)) },
        };
      } catch {
        return { status: 'not-found', query: q };
      }
    }
    // Nama persis mengalahkan kecocokan token ("paku" = "Paku" M18,
    // bukan 15 kelompok paku — nama yang disebut persis tidak ambigu).
    const exact = nameHits.filter((r) => normPriceName(r.resourceName) === nq);
    pool = exact.length > 0 ? exact : nameHits;
  }

  // Kelompokkan per (nama, satuan) — dua kelompok = ambigu.
  const groups = new Map<string, typeof pool>();
  for (const r of pool) {
    const key = `${normPriceName(r.resourceName)}|${r.unit}`;
    const g = groups.get(key) ?? [];
    g.push(r);
    groups.set(key, g);
  }
  if (groups.size > 1) {
    const candidates = [...groups.values()]
      .map((g) => ({
        name: g[0].resourceName,
        unit: g[0].unit,
        code: g.map((x) => x.resourceCode).find((c) => c) ?? '',
      }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.unit.localeCompare(b.unit))
      .slice(0, 5);
    return { status: 'ambiguous', query: q, candidates };
  }
  const group = [...groups.values()][0];
  const codes = [...new Set(group.map((r) => r.resourceCode).filter((c) => c))];
  if (codes.length > 1) {
    return {
      status: 'ambiguous',
      query: q,
      candidates: codes.sort().map((code) => ({ name: group[0].resourceName, unit: group[0].unit, code })),
    };
  }
  const prices = [...new Set(group.map((r) => r.price))].sort((a, b) => a - b);
  const priceText =
    prices.length === 1
      ? `${fmtIDR(Math.round(prices[0]))}${group[0].unit ? `/${group[0].unit}` : ''}`
      : `${fmtIDR(Math.round(prices[0]))}–${fmtIDR(Math.round(prices[prices.length - 1]))}${group[0].unit ? `/${group[0].unit}` : ''}`;
  if (codes.length === 0) {
    return { status: 'empty-code', query: q, name: group[0].resourceName, unit: group[0].unit, priceText };
  }
  const code = codes[0];
  const category = priceCategoryOf(group[0].resourceType);
  if (!category) return { status: 'not-found', query: q };
  let masterPrice: number;
  if (prices.length === 1) {
    masterPrice = Math.round(prices[0]);
  } else {
    // Bervariasi: harga resolver per kode+satuan bila cocok dengan salah
    // satu harga mentah; bila tidak, harga record pertama kelompok.
    masterPrice = Math.round(group[0].price);
    try {
      const res = priceResolver2026.resolveResourcePrice({ resourceCode: code, unit: group[0].unit } as any);
      const p = (res as any)?.price;
      if ((res as any)?.status === 'RESOLVED' && typeof p === 'number' && prices.includes(Math.round(p))) {
        masterPrice = Math.round(p);
      }
    } catch { /* resolver gagal — pakai harga record pertama */ }
  }
  return {
    status: 'ok',
    target: {
      resourceCode: code,
      resourceName: group[0].resourceName,
      category,
      unit: group[0].unit,
      masterPrice,
      ...(prices.length > 1
        ? { priceRange: { min: Math.round(prices[0]), max: Math.round(prices[prices.length - 1]), sources: prices.length } }
        : {}),
    },
  };
}

/** Buang frasa cakupan proyek ("untuk/di/pada/khusus/buat proyek ini",
 *  atau "proyek ini" telanjang) dari ekor perintah harga — frasa itu
 *  penanda intent, bukan bagian nama material/harga. */
export function stripProjectScopePhrase(param: string): string {
  return String(param ?? '')
    .replace(/\s*(?:untuk|di|pada|khusus|buat)\s+proyek\s+ini\b/gi, ' ')
    .replace(/\s*proyek\s+ini\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Pisahkan "Rp 40.000 per kg" → angka "Rp 40.000" + satuan "kg". */
function splitPerUnit(valueText: string): { amountText: string; unit: string | null } {
  const m = String(valueText ?? '').trim().match(/^(.+?)\s+per\s+([a-z0-9'²³/]+)\s*$/i);
  if (!m) return { amountText: String(valueText ?? '').trim(), unit: null };
  return { amountText: m[1].trim(), unit: normalizeUnit(m[2]) };
}

/** Payload pratinjau → konfirmasi (dibawa param tombol, JSON). */
interface ProjectPriceConfirmPayload {
  v: 1;
  projectId: string;
  code: string;
  name: string;
  category: 'MATERIAL' | 'LABOR' | 'EQUIPMENT';
  unit: string;
  masterPrice: number;
  projectPrice: number;
}

function handleSetProjectPriceStep1(param: string | undefined, ctx: ChatActionContext): ActionResult {
  const cleaned = stripProjectScopePhrase(param ?? '');
  const split = splitNameAndValue(cleaned);
  if (!split || !split.name) {
    const nameOnly = cleanItemName(cleaned);
    if (nameOnly) {
      return {
        ok: true,
        message: `Ubah harga "${nameOnly}" jadi berapa untuk proyek ini? Contoh: "ubah harga ${nameOnly} jadi Rp 50.000 untuk proyek ini".`,
      };
    }
    return {
      ok: true,
      message: 'Ubah harga material apa, jadi berapa, untuk proyek ini? Contoh: "ubah harga semen jadi Rp 2.000 untuk proyek ini". Ini override satu proyek, bukan mengubah harga master database.',
    };
  }
  const { amountText, unit: statedUnit } = splitPerUnit(split.valueText);
  const price = parseRupiahAmount(amountText);
  if (price === null) {
    return {
      ok: false,
      message: `Harga "${split.valueText}" tidak bisa dibaca sebagai nominal Rupiah. Contoh: "ubah harga ${split.name} jadi Rp 50.000 untuk proyek ini".`,
    };
  }
  if (price <= 0) {
    return {
      ok: false,
      message: 'Harga proyek harus lebih dari Rp0 — harga Rp0 bukan harga yang valid dan tidak akan diterapkan.',
    };
  }
  if (!ctx.activeProject) {
    return { ok: true, message: 'Tidak ada proyek aktif. Buka salah satu proyek dulu di Daftar Proyek, lalu ulangi perintahnya.' };
  }
  const res = resolveProjectPriceTarget(split.name);
  if (res.status === 'not-found') {
    return {
      ok: false,
      message:
        `Material "${split.name}" tidak ditemukan di database harga master — saya tidak bisa menetapkan override untuk material yang tidak dikenal (tidak ada kode yang bisa dikunci). ` +
        `Periksa namanya lewat "cari harga ${split.name}". Bila yang dimaksud adalah harga ITEM "${split.name}" di RAB proyek ini (bukan harga database), katakan "ubah harga item ${split.name} jadi ${fmtIDR(price)}".`,
    };
  }
  if (res.status === 'ambiguous') {
    const list = res.candidates
      .map((c) => `• ${c.name} — ${c.unit}${c.code ? ` (kode ${c.code})` : ' (tanpa kode)'}`)
      .join('\n');
    return {
      ok: false,
      message:
        `"${split.name}" cocok dengan beberapa material di database — saya tidak menebak yang mana:\n${list}\n\nSebutkan nama lengkapnya, contoh: "ubah harga ${res.candidates[0]?.name ?? split.name} jadi ${fmtIDR(price)} untuk proyek ini".`,
    };
  }
  if (res.status === 'empty-code') {
    return {
      ok: false,
      message:
        `${res.name} ditemukan di database master (${res.priceText}), tetapi record-nya TIDAK PUNYA KODE — override harga proyek dikunci pada kode, dan semua record tanpa kode berbagi satu kunci, sehingga override untuk ${res.name} bisa menimpa material lain yang juga tanpa kode. ` +
        `Karena itu saya tidak menetapkan override ini. Alternatif yang aman: ubah harga ITEM-nya langsung di RAB proyek ini ("ubah harga item ${res.name} jadi ${fmtIDR(price)}"). Harga master ${res.name} sendiri hanya bisa diubah lewat jalur admin/pipeline harga, bukan dari chat.`,
    };
  }
  const target = res.target;
  if (statedUnit && !unitsCompatible(statedUnit, target.unit)) {
    return {
      ok: false,
      message: `Satuan yang Anda sebut (${statedUnit}) tidak cocok dengan satuan ${target.resourceName} di database (${target.unit}). Sebutkan harga per ${target.unit} — satuan tidak dikonversi otomatis.`,
    };
  }
  const masterLine = target.priceRange
    ? `Harga master tercatat bervariasi: ${fmtIDR(target.priceRange.min)}–${fmtIDR(target.priceRange.max)}/${target.unit} dari ${target.priceRange.sources} sumber; pembanding yang dicatat: ${fmtIDR(target.masterPrice)}/${target.unit}.`
    : `Harga master saat ini: ${fmtIDR(target.masterPrice)}/${target.unit}.`;
  const payload: ProjectPriceConfirmPayload = {
    v: 1,
    projectId: ctx.activeProject.id,
    code: target.resourceCode,
    name: target.resourceName,
    category: target.category,
    unit: target.unit,
    masterPrice: target.masterPrice,
    projectPrice: price,
  };
  // Fast Track Continuation A2 — langkah 1 MENGUSULKAN slot konfirmasi
  // (sidik = payload persis yang ditinjau; TTL 10 menit + sekali pakai
  // + aktor, pola perintah langsung yang sama): tanpa ini tombol "Ya,
  // terapkan override" bisa diterapkan kapan saja dalam sesi dan
  // berulang kali. Sidik adalah string JSON payload itu sendiri —
  // tombol konfirmasi membawa string yang SAMA PERSIS, sehingga klaim
  // di langkah 2 membuktikan payload tidak berubah.
  storeDirectConfirmation('SET_PROJECT_PRICE_CONFIRM', JSON.stringify(payload));
  return {
    ok: true,
    message:
      `Siap menerapkan override harga untuk proyek "${ctx.activeProject.name}":\n\n` +
      `• Material: ${target.resourceName} (kode ${target.resourceCode}) — per ${target.unit}\n` +
      `• ${masterLine}\n` +
      `• Harga baru untuk proyek ini: ${fmtIDR(price)}/${target.unit}\n\n` +
      `Ini HANYA berlaku untuk proyek "${ctx.activeProject.name}" — harga master database TIDAK berubah, dan proyek lain tidak terpengaruh. Klik "Ya, terapkan override" untuk menerapkan.`,
    actions: [
      { label: 'Ya, terapkan override', action: { kind: 'intent', intent: 'SET_PROJECT_PRICE_CONFIRM', param: JSON.stringify(payload) } },
      { label: 'Batal', action: { kind: 'navigate', menu: 'harga-proyek' } },
    ],
  };
}

function handleSetProjectPriceConfirm(param: string | undefined, ctx: ChatActionContext): ActionResult {
  let payload: ProjectPriceConfirmPayload | null = null;
  try {
    const parsed = JSON.parse(param ?? '') as ProjectPriceConfirmPayload;
    if (parsed && parsed.v === 1) payload = parsed;
  } catch { /* payload rusak — ditangani di bawah */ }
  const valid =
    payload !== null &&
    typeof payload.projectId === 'string' && payload.projectId &&
    typeof payload.code === 'string' && payload.code &&
    typeof payload.name === 'string' && payload.name &&
    (payload.category === 'MATERIAL' || payload.category === 'LABOR' || payload.category === 'EQUIPMENT') &&
    typeof payload.unit === 'string' && payload.unit &&
    Number.isFinite(payload.masterPrice) && payload.masterPrice >= 0 &&
    Number.isFinite(payload.projectPrice) && payload.projectPrice > 0;
  if (!valid || !payload) {
    return {
      ok: false,
      message: 'Pratinjau override ini sudah tidak valid (datanya rusak atau tidak lengkap). Kirim ulang perintahnya, misalnya "ubah harga semen jadi Rp 2.000 untuk proyek ini".',
    };
  }
  if (!ctx.activeProject) {
    return {
      ok: true,
      message: 'Tidak ada proyek aktif — override tidak diterapkan. Buka proyeknya dulu di Daftar Proyek, lalu kirim ulang perintahnya.',
    };
  }
  if (ctx.activeProject.id !== payload.projectId) {
    return {
      ok: false,
      message: `Proyek aktif sudah berganti sejak pratinjau dibuat — override tidak diterapkan (pratinjau ini untuk proyek lain). Kirim ulang perintahnya di proyek "${ctx.activeProject.name}".`,
    };
  }
  if (!ctx.setProjectPriceOverride) {
    return {
      ok: false,
      message: 'Saya belum bisa menerapkan override harga dari chat ini. Atur lewat menu Harga Proyek.',
    };
  }
  let applied: boolean;
  try {
    applied = ctx.setProjectPriceOverride(payload.projectId, {
      resourceCode: payload.code,
      resourceName: payload.name,
      category: payload.category,
      unit: payload.unit,
      masterPrice: payload.masterPrice,
      projectPrice: payload.projectPrice,
    });
  } catch {
    return {
      ok: false,
      message: 'Override belum diterapkan — terjadi kesalahan saat menyimpan. Coba lagi atau atur lewat menu Harga Proyek.',
    };
  }
  if (!applied) {
    return {
      ok: false,
      message: `Override belum diterapkan — proyek tidak ditemukan di daftar aktif. Coba pilih ulang proyeknya di Daftar Proyek, lalu kirim ulang perintahnya.`,
    };
  }
  return {
    ok: true,
    message:
      `Harga ${payload.name} (${payload.code}) untuk proyek "${ctx.activeProject.name}" kini ${fmtIDR(payload.projectPrice)}/${payload.unit} (pembanding master: ${fmtIDR(payload.masterPrice)}/${payload.unit}). ` +
      'Hanya proyek ini yang berubah — harga master database tidak berubah, dan proyek lain tidak terpengaruh.',
  };
}

/* ---------------- CHANGE_PLAN: ganti paket (simulasi) --------------- */

const PLAN_ORDER: CreditPlan[] = ['free', 'starter', 'pro', 'business'];

/** Jatah kredit paket dari definisi kanonis (config — bukan hardcode). */
function planAllowance(plan: CreditPlan): number {
  return plan === 'free' ? FREE_INITIAL_CREDITS : PLAN_CREDITS[plan];
}

/**
 * Nama paket dari ekor perintah ("pro", "professional", "starter",
 * "business"/"bisnis", "free"/"gratis"). Urutan BERARTI: "professional"
 * dicek sebelum "pro" (kata "pro" tidak cocok dengan "professional"
 * karena \b — tetapi pengecekan eksplisit ini menjaga niatnya jelas),
 * dan "business" sebelum "pro" agar "pro business" tidak salah baca.
 * null = tidak ada nama paket yang dikenali (handler menampilkan daftar).
 */
export function resolveCreditPlanName(text: string | undefined): CreditPlan | null {
  const t = (text ?? '').toLowerCase();
  if (/\bbusiness\b/.test(t) || /\bbisnis\b/.test(t)) return 'business';
  if (/\bprofessional\b/.test(t)) return 'pro';
  if (/\bstarter\b/.test(t)) return 'starter';
  if (/\bfree\b/.test(t) || /\bgratis\b/.test(t)) return 'free';
  if (/\bpro\b/.test(t)) return 'pro';
  return null;
}

function formatPlanList(): string {
  return PLAN_ORDER.map(
    (p) => `• ${CREDIT_PLAN_LABELS[p]} — ${planAllowance(p).toLocaleString('id-ID')} kredit${p === 'free' ? ' (sekali, bukan per bulan)' : ' per periode'}`,
  ).join('\n');
}

function handleChangePlan(param: string | undefined, ctx: ChatActionContext): ActionResult {
  const plan = resolveCreditPlanName(param);
  if (!plan) {
    return {
      ok: true,
      message:
        `Paket yang tersedia (simulasi — bukan langganan nyata):\n${formatPlanList()}\n\n` +
        'Sebutkan paketnya, contoh: "ganti paket ke Pro". Mengganti paket mengatur ulang saldo simulasi ke jatah paket baru — top-up & bonus simulasi ikut terhapus.',
    };
  }
  // Tanpa paket aktif yang diketahui, setPlan tidak boleh dipanggil:
  // ia mengatur ulang saldo simulasi MESKIPUN paketnya sama — tanpa
  // cek "sudah di paket itu", pergantian sia-sia menghapus top-up.
  if (ctx.creditPlan === undefined) {
    return {
      ok: false,
      message: 'Saya belum bisa melihat paket aktif saat ini, jadi saya tidak mengganti paket (ganti paket mengatur ulang saldo simulasi — tanpa tahu paket aktif, saya tidak bisa memastikan ini bukan pergantian yang sia-sia). Coba lewat menu Kredit AI.',
    };
  }
  if (ctx.creditPlan === plan) {
    return {
      ok: true,
      message: `Paket simulasi Anda sudah ${CREDIT_PLAN_LABELS[plan]} — tidak ada yang berubah. [SIMULASI — bukan langganan nyata.]`,
    };
  }
  if (!ctx.changeCreditPlan) {
    return {
      ok: false,
      message: 'Saya belum bisa mengganti paket dari chat ini. Ganti paket lewat menu Kredit AI. (Simulasi — bukan langganan nyata.)',
    };
  }
  let result: ChangePlanResult;
  try {
    result = ctx.changeCreditPlan(plan);
  } catch {
    result = { ok: false, plan: null, newBalance: null, reason: 'terjadi kesalahan saat mengganti paket' };
  }
  if (!result.ok) {
    const reason = result.reason ? `: ${result.reason}` : '';
    return {
      ok: false,
      message: `Paket belum berganti${reason}. Paket aktif tetap ${CREDIT_PLAN_LABELS[ctx.creditPlan]}. [SIMULASI — bukan langganan nyata.]`,
    };
  }
  const balanceLine =
    result.newBalance !== null && Number.isFinite(result.newBalance)
      ? ` Saldo simulasi kini ${result.newBalance.toLocaleString('id-ID')} kredit (jatah paket ${CREDIT_PLAN_LABELS[plan]}; top-up & bonus simulasi sebelumnya ikut terhapus karena ganti paket mengatur ulang saldo).`
      : ' Ketik "sisa kredit saya" untuk melihat saldo terbaru.';
  return {
    ok: true,
    message: `Paket simulasi diganti ke ${CREDIT_PLAN_LABELS[plan]}.${balanceLine} [SIMULASI — bukan langganan nyata; tidak ada pembayaran.]`,
  };
}

/* ------------------------------------------------------------------ */
/* W11 §11 (S1-R5, 2026-11-22) — konfirmasi perintah langsung.         */
/*                                                                     */
/* Enam perintah mengeksekusi langsung tanpa konfirmasi: RENAME,       */
/* CREATE, ARCHIVE, DUPLICATE_PROJECT, UPDATE_PROJECT_SETTINGS,        */
/* CREATE_QTO_ITEM/SYNC_QTO. Mulai W11, pemanggilan PERTAMA hanya      */
/* memvalidasi + menampilkan pratinjau aksi + tombol konfirmasi;       */
/* eksekusi terjadi HANYA pada pemanggilan KEDUA atas perintah yang    */
/* sama (klik tombol konfirmasi / ketik ulang perintah) selagi slot    */
/* konfirmasi masih segar dan sidik aksi TIDAK berubah.                */
/*                                                                     */
/* Mengapa "ulangi perintah" dan bukan intent *_CONFIRM ala            */
/* DELETE_PROJECT_CONFIRM: intent konfirmasi baru butuh (a) anggota   */
/* baru union ChatIntent di intentRouter.ts dan (b) cabang dispatch    */
/* baru di handleActionButton view.tsx — keduanya di luar wilayah W11. */
/* Sebagai gantinya, tombol konfirmasi memakai label = teks perintah   */
/* itu sendiri: view tidak punya dispatch generik kind 'intent'        */
/* sehingga tombol jatuh ke submit(label), label me-routing kembali ke */
/* intent yang sama, dan gerbang di bawah mengklaim slot konfirmasi.   */
/* Action intent/param yang menyertai tombol adalah kontrak yang sama  */
/* bila suatu saat view mendapat dispatch generik.                     */
/*                                                                     */
/* Pengikatan (cermin TransferApprovalBinding, draftPersistence.ts):   */
/* sidik dihitung dari aksi TERNORMALISASI hasil validasi segar        */
/* (target ter-resolusi + nilai), BUKAN param mentah — perintah yang   */
/* sama sesudah keadaan berubah (proyek berganti nama, item QTO        */
/* bertambah) menghasilkan sidik berbeda dan DITANYA ULANG dengan      */
/* pratinjau segar, bukan dieksekusi. Slot sekali pakai (diklaim =     */
/* dihapus) + TTL 10 menit: klik ganda tombol konfirmasi tidak pernah  */
/* mengeksekusi dua kali — klik kedua hanya bertanya ulang.            */
/*                                                                     */
/* Gerbang TIDAK mengubah pesan fail-closed handler: input tidak valid */
/* / target tak ditemukan / tanpa callback → gerbang mengembalikan     */
/* null dan handler yang bersangkutan menjawab sendiri (tanpa          */
/* eksekusi, seperti sebelumnya). DELETE_PROJECT tidak lewat sini —    */
/* ia sudah punya konfirmasi dua langkah sendiri.                      */
/*                                                                     */
/* P1 (2026-11-24, hardening — WC-01/WC-02/WC-06/WC-11):               */
/* - P1-B: gerbang kapabilitas terpusat — hanya peran berkemampuan     */
/*   edit-estimate (peta "Admin" §4.2) yang boleh sampai ke proposal   */
/*   / eksekusi mutasi. Penolakan memakai kalimat owner persis.        */
/* - P1-C: tombol konfirmasi kini punya dispatch GENERIK di view       */
/*   (executeDirectConfirmation di bawah) — klaim slot HANYA lewat     */
/*   dispatch itu. Kirim-ulang teks TIDAK PERNAH mengklaim (D6 O-5),   */
/*   dan tanya-ulang atas proposal yang sama TIDAK memperpanjang TTL.   */
/* - P1-E: setiap eksekusi sesudah konfirmasi mencatat record audit    */
/*   (mutationAuditLog.ts) — aktor, proyek, operasi, nilai, referensi  */
/*   konfirmasi, hasil, kunci idempotensi.                             */
/* - WC-06: semua gerbang di bawah adalah gerbang UX SISI KLIEN —      */
/*   peran demo/PIN BUKAN batas otorisasi (lihat mutationInventory.ts).*/
/* Fast Track Continuation A2 (2026-11-24):                            */
/* - Pengikatan AKTOR: slot menyimpan aktor demo-role yang             */
/*   mengusulkan; klaim oleh aktor berbeda DITOLAK (slot hangus).      */
/*   Ini pengikatan sisi klien terhadap peran demo — BUKAN identitas   */
/*   backend tepercaya (P1-03): batas kejujurannya sama dengan         */
/*   gerbang kapabilitas (WC-06). Tanpa konteks operasi, aktor         */
/*   default 'Peran demo' di kedua sisi (propose + claim cocok).       */
/* - DELETE_PROJECT_CONFIRM + SET_PROJECT_PRICE_CONFIRM kini lewat     */
/*   slot yang SAMA (sebelumnya: tanpa slot/TTL/sekali-pakai — tombol */
/*   "Ya, hapus proyek" lama bisa menghapus kapan saja dalam sesi).    */
/* ------------------------------------------------------------------ */

/** TTL konfirmasi perintah langsung — 10 menit, SAMA dengan
 *  TRANSFER_APPROVAL_TTL_MS (draftPersistence.ts). */
export const DIRECT_COMMAND_CONFIRM_TTL_MS = 10 * 60 * 1000;

interface PendingDirectConfirmation {
  /** Sidik aksi yang DITINJAU (target + nilai ternormalisasi). */
  fingerprint: string;
  createdAt: number;
  /** Aktor demo-role yang mengusulkan (ikatan klaim A2 — BUKAN id
   *  pengguna tepercaya; lihat batas WC-06 di atas). */
  actor: string;
}

/** Aktor pengusul/pengklaim saat ini — nama peran demo dari konteks
 *  operasi asisten; 'Peran demo' bila tanpa konteks. */
function currentProposalActor(): string {
  return getAssistantOperationContext()?.actor ?? 'Peran demo';
}

/** Satu slot konfirmasi tertunda per intent (module-level, pola
 *  pendingChoice — TIDAK dipersist; reload membatalkan konfirmasi). */
const pendingDirectConfirmations = new Map<string, PendingDirectConfirmation>();

/** Kosongkan semua konfirmasi tertunda (dipakai tes; tidak ada pemanggil
 *  produksi — slot dibersihkan sendiri saat diklaim/kedaluwarsa). */
export function clearPendingDirectConfirmations(): void {
  pendingDirectConfirmations.clear();
  lastClaimedConfirmations.clear();
}

/**
 * Klaim konfirmasi tertunda untuk intent ini: true HANYA bila ada slot
 * segar (dalam TTL) dengan sidik yang SAMA PERSIS dengan aksi yang baru
 * divalidasi DAN aktor yang SAMA dengan pengusul — klaim MENGHABISKAN
 * slot (sekali pakai). Slot basi / sidik berbeda / aktor berbeda
 * dihapus + mengembalikan false (pemanggil bertanya ulang dengan
 * pratinjau segar).
 */
/**
 * Sidik konfirmasi yang TERAKHIR diklaim per intent — dibaca case
 * executeIntent untuk referensi konfirmasi record audit (P1-E), lalu
 * dibersihkan (sekali baca lewat takeClaimedConfirmationRef).
 */
const lastClaimedConfirmations = new Map<string, { fingerprint: string; claimedAt: number }>();

function claimDirectConfirmation(intent: string, fingerprint: string, now: number = Date.now()): boolean {
  const p = pendingDirectConfirmations.get(intent);
  if (!p) return false;
  if (
    now > p.createdAt + DIRECT_COMMAND_CONFIRM_TTL_MS
    || p.fingerprint !== fingerprint
    || p.actor !== currentProposalActor()
  ) {
    pendingDirectConfirmations.delete(intent);
    return false;
  }
  pendingDirectConfirmations.delete(intent);
  lastClaimedConfirmations.set(intent, { fingerprint, claimedAt: now });
  return true;
}

/** Ambil (sekali baca) sidik konfirmasi yang diklaim untuk intent ini —
 *  referensi konfirmasi record audit (P1-E). */
function takeClaimedConfirmationRef(intent: string): string | null {
  const rec = lastClaimedConfirmations.get(intent);
  if (!rec) return null;
  lastClaimedConfirmations.delete(intent);
  return rec.fingerprint;
}

/**
 * P1-C: tanya-ulang atas proposal yang SAMA PERSIS (sidik identik,
 * masih dalam TTL) TIDAK memperpanjang TTL — TTL dihitung dari
 * proposal pertama. Tanpa ini, kirim-ulang teks berulang bisa
 * memperpanjang jendela konfirmasi tanpa batas.
 *
 * A2: pelestarian TTL hanya berlaku bila AKTOR-nya juga sama — usulan
 * atas aksi yang sama oleh aktor BERBEDA adalah proposal baru (slot
 * ditimpa dengan aktor + TTL baru); bila tidak, aktor kedua tidak
 * pernah bisa mengonfirmasi aksinya sendiri selama slot aktor pertama
 * masih hidup.
 */
function storeDirectConfirmation(intent: string, fingerprint: string, now: number = Date.now()): void {
  const existing = pendingDirectConfirmations.get(intent);
  if (
    existing
    && existing.fingerprint === fingerprint
    && existing.actor === currentProposalActor()
    && now <= existing.createdAt + DIRECT_COMMAND_CONFIRM_TTL_MS
  ) {
    return;
  }
  pendingDirectConfirmations.set(intent, { fingerprint, createdAt: now, actor: currentProposalActor() });
}

/**
 * P1-B — Gerbang kapabilitas terpusat untuk mutasi perintah langsung.
 * Membaca bit writesEnabled dari konteks operasi asisten (yang dipasang
 * view dari hasCapability('edit-estimate') — peta "Admin" §4.2) lalu
 * berkonsultasi ke inventaris mutasi (mutationInventory.ts).
 * Tanpa konteks / tanpa capability → tolak dengan kalimat owner.
 *
 * KEJUJURAN (WC-06): ini gerbang UX SISI KLIEN. Peran demo/PIN bukan
 * batas otorisasi; enforcement yang sebenarnya menunggu peran server.
 * Lihat header mutationInventory.ts.
 */
function requireChatAiMutationCapability(
  key: string,
): { ok: true; actor: string } | { ok: false; message: string } {
  const opCtx = getAssistantOperationContext();
  const auth = authorizeChatAiMutation(key, opCtx?.writesEnabled);
  if (!auth.ok) return { ok: false, message: auth.message };
  return { ok: true, actor: opCtx?.actor ?? 'Peran demo' };
}

/** Aktor tampilan untuk record audit (P1-E) — nama peran demo dari
 *  konteks operasi asisten; BUKAN id pengguna terverifikasi. */
function currentAuditActor(): string {
  return getAssistantOperationContext()?.actor ?? 'Peran demo';
}

/**
 * P1-E — Catat record audit untuk satu mutasi perintah langsung yang
 * dieksekusi SESUDAH konfirmasi. Dipanggil case executeIntent SESUDAH
 * handler berjalan, dengan hasil handler. Percobaan yang gagal tetap
 * dicatat (result 'failed') — penolakan gerbang TIDAK dicatat di sini
 * (tidak ada mutasi yang dicoba; penolakan tertera di pesan chat).
 */
function recordDirectCommandAudit(input: {
  operation: string;
  projectId: string | null;
  projectName: string | null;
  before: unknown;
  after: unknown;
  confirmationRef: string | null;
  ok: boolean;
  message: string;
}): void {
  appendMutationAuditRecord({
    actor: currentAuditActor(),
    projectId: input.projectId,
    projectName: input.projectName,
    operation: input.operation,
    before: input.before,
    after: input.after,
    confirmationRef: input.confirmationRef,
    result: input.ok ? 'executed' : 'failed',
    outcomeVerified: input.ok,
    verificationNote:
      'callback-result: mutator kanonis melaporkan sukses via nilai balik callback; tanpa read-back pasca-tulis (executeIntent sinkron; persistensi di-debounce 400 ms — lihat mutationAuditLog.ts).',
    source: 'chat-ai',
    message: input.message.slice(0, 300),
  });
}

/**
 * P1-C (WC-02) — Dispatch konfirmasi tombol perintah langsung.
 * Satu-satunya jalur yang boleh mengklaim slot konfirmasi tertunda:
 * view memanggil ini dari handleActionButtonInner untuk tombol
 * konfirmasi perintah langsung (kind 'intent' dengan intent perintah
 * langsung), BUKAN submit(label). Jalur teks (submit) tidak pernah
 * memasang flag claimDirectConfirmation — kirim-ulang teks tidak
 * mengklaim (D6 O-5).
 *
 * Intents yang didukung: CREATE/ARCHIVE/DUPLICATE/RENAME_PROJECT,
 * UPDATE_PROJECT_SETTINGS, CREATE_QTO_ITEM, SYNC_QTO, CREATE_REVISION,
 * DELETE_PROJECT_CONFIRM, SET_PROJECT_PRICE_CONFIRM. Intent lain yang
 * dilewatkan ke sini dieksekusi sebagai executeIntent biasa (tanpa
 * klaim slot — slot hanya ada untuk intents di atas).
 */
export function executeDirectConfirmation(
  intent: ChatIntent,
  param: string | undefined,
  ctx: ChatActionContext,
): ActionResult {
  return executeIntent(intent, param, { ...ctx, claimDirectConfirmation: true });
}

/* ------------------------------------------------------------------ */
/* Fast Track §3 (P1-04/P1-05) — Konfirmasi aksi UI lewat slot        */
/* perintah langsung yang SAMA (bukan sistem konfirmasi kedua).       */
/*                                                                     */
/* propose/claim di bawah memakai store + TTL 10 menit + sekali-pakai  */
/* yang sama dengan konfirmasi perintah langsung (storeDirect-         */
/* Confirmation / claimDirectConfirmation di atas). Dipakai            */
/* PUSH_ANSWER_ITEMS: klik pertama ("Tambah ke Spreadsheet")           */
/* mengusulkan slot dengan sidik nilai yang ditampilkan di pratinjau;  */
/* tombol konfirmasi mengklaimnya dengan sidik yang direkomputasi     */
/* segar — sidik berubah / kedaluwarsa / sudah dipakai → klaim gagal   */
/* → handler meminta pratinjau baru (tidak ada yang ditulis).         */
/* ------------------------------------------------------------------ */

/** Usulkan slot konfirmasi aksi UI (pratinjau dibuat). */
export function proposeUiActionConfirmation(key: string, fingerprint: string, now: number = Date.now()): void {
  storeDirectConfirmation(key, fingerprint, now);
}

/**
 * Klaim slot konfirmasi aksi UI: true HANYA bila ada slot segar
 * (dalam TTL) dengan sidik yang SAMA PERSIS — klaim MENGHABISKAN slot
 * (sekali pakai). Slot basi / sidik berbeda dihapus + false.
 */
export function claimUiActionConfirmation(key: string, fingerprint: string, now: number = Date.now()): boolean {
  return claimDirectConfirmation(key, fingerprint, now);
}

/** Ambil (sekali baca) sidik konfirmasi aksi UI yang diklaim —
 *  referensi konfirmasi record audit (P1-E). */
export function takeUiActionConfirmationRef(key: string): string | null {
  return takeClaimedConfirmationRef(key);
}

/**
 * Sidik push item jawaban: nilai PERSIS yang akan ditulis (item +
 * proyek tujuan). Dua pratinjau dengan nilai identik berbagi sidik
 * (push yang sama); perubahan apa pun pada nilai — volume, harga,
 * status, deskripsi, proyek — menghasilkan sidik berbeda → klaim
 * lama ditolak dan pratinjau baru diperlukan.
 */
export function buildAnswerPushFingerprint(
  items: ReadonlyArray<ChatAnswerPushItem>,
  projectId: string,
): string {
  return JSON.stringify({
    projectId,
    items: items.map((it) => ({
      code: it.code,
      description: it.description,
      volume: it.volume,
      unit: it.unit,
      unitPrice: it.unitPrice ?? null,
      priceStatus: it.priceStatus,
    })),
  });
}

function formatAnswerPushIdr(n: number): string {
  return `Rp${Math.round(n).toLocaleString('id-ID')}`;
}

/**
 * Pesan pratinjau push item jawaban (P1-04/P1-05): menampilkan PERSIS
 * nilai yang terikat di sidik konfirmasi — jumlah item, nama/kode,
 * volume, harga + total baris, status harga, proyek tujuan, duplikat
 * yang dilewati. Nilai yang dieksekusi di konfirmasi direkomputasi
 * segar dan harus cocok dengan sidik ini, atau konfirmasi ditolak.
 */
export function formatAnswerPushPreviewMessage(
  plan: AnswerTransferPlan,
  newItems: ReadonlyArray<ChatAnswerPushItem>,
  dupCount: number,
  projectName: string,
): string {
  const lines: string[] = [];
  lines.push('**Pratinjau tambah ke Spreadsheet — item jawaban AHSP**');
  lines.push(`• Proyek tujuan: ${projectName}`);
  lines.push(`• ${newItems.length} item baru akan ditambahkan:`);
  for (const it of newItems) {
    const statusLabel =
      it.priceStatus === 'PRICE_RESOLVED'
        ? 'harga resmi AHSP'
        : it.priceStatus === 'PRICE_ESTIMATED'
          ? 'estimasi (perlu verifikasi, bukan harga resmi)'
          : 'belum berharga (nilainya BELUM DAPAT DIHITUNG dan tidak masuk total)';
    const pricePart =
      it.unitPrice != null
        ? ` × ${formatAnswerPushIdr(it.unitPrice)} = ${formatAnswerPushIdr(it.volume * it.unitPrice)}`
        : '';
    lines.push(`  – [${it.code}] ${it.description} — ${it.volume} ${it.unit}${pricePart} (${statusLabel})`);
  }
  if (dupCount > 0) lines.push(`• ${dupCount} item dilewati karena sudah ada di Spreadsheet.`);
  if (plan.skippedAlternatives > 0) lines.push(`• ${plan.skippedAlternatives} varian lain di jawaban tidak ikut — hanya item teratas yang ditransfer.`);
  if (plan.unknownCodes.length > 0) lines.push(`• Kode ${plan.unknownCodes.join(', ')} dilewati (tidak ditemukan di katalog).`);
  if (plan.unitMismatchCodes.length > 0) lines.push(`• Kode ${plan.unitMismatchCodes.join(', ')} dilewati (satuan tidak cocok).`);
  lines.push('');
  lines.push('Tekan **Konfirmasi tambah ke Spreadsheet** untuk menulis ke Spreadsheet, atau abaikan pratinjau ini — tanpa klik konfirmasi, tidak ada item yang ditulis. Pratinjau berlaku 10 menit dan hanya untuk nilai di atas; bila nilainya berubah, konfirmasi ditolak dan pratinjau baru diperlukan.');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Fast Track Continuation A2 — pengikatan nilai konfirmasi QTO +      */
/* validasi konfirmasi revisi spek DED (helper MURNI agar dapat dites  */
/* tsx; wiring-nya di handler tombol view.tsx).                        */
/* ------------------------------------------------------------------ */

/** Nilai usulan koreksi QTO YANG DITAMPILKAN pada tombol konfirmasi
 *  (dibawa tombol — lihat ChatActionButton qto-correction-confirm). */
export interface DisplayedQtoCorrectionValues {
  expectedQuantity: number;
  expectedUnit: string;
  dedQuantity: number;
  dedUnit: string;
}

/**
 * Cocokkan usulan koreksi QTO hasil rekomputasi segar dengan nilai
 * YANG DITAMPILKAN saat tombol dibuat: true bila keempat nilai sama.
 * `displayed` undefined (tombol lama tanpa pengikatan) → true
 * (tidak ada yang bisa diperiksa — perilaku rekomputasi lama).
 * Handler view MENOLAK konfirmasi bila ini false: nilai yang
 * dieksekusi tidak pernah berbeda dari nilai yang ditinjau pengguna.
 */
export function qtoCorrectionMatchesDisplayed(
  displayed: DisplayedQtoCorrectionValues | undefined,
  proposal: QtoCorrectionProposal,
): boolean {
  if (!displayed) return true;
  return (
    displayed.expectedQuantity === proposal.expectedQuantity
    && displayed.expectedUnit === proposal.expectedUnit
    && displayed.dedQuantity === proposal.dedQuantity
    && displayed.dedUnit === proposal.dedUnit
  );
}

export type DedSpecRevisionConfirmCheck =
  | { ok: true }
  | {
      ok: false;
      reason: 'EXPIRED' | 'BASE_CHANGED' | 'BASE_MISSING';
      message: string;
    };

/**
 * Validasi konfirmasi revisi spek DED SEBELUM applyDedSpecRevision:
 * pratinjau kedaluwarsa (> 10 menit, standar yang sama dengan
 * konfirmasi lain) DITOLAK; nilai DED saat ini HARUS masih sama
 * dengan oldValue pratinjau (DED baru yang dilampirkan sesudah
 * pratinjau dibuat membatalkan konfirmasi — tanpa ini revisi bisa
 * menimpa spek DED yang sudah berganti dengan catatan koreksi yang
 * salah); spek kunci itu sudah tidak ada → DITOLAK (fail-closed).
 * Murni: tidak membaca storage, tidak menulis apa pun.
 */
export function validateDedSpecRevisionConfirm(
  preview: DedSpecRevisionPreview,
  currentSpecs: ReadonlyArray<StructuredSpec>,
  now: number = Date.now(),
): DedSpecRevisionConfirmCheck {
  const createdMs = Date.parse(preview.createdAt);
  if (
    Number.isFinite(createdMs)
    && now > createdMs + DIRECT_COMMAND_CONFIRM_TTL_MS
  ) {
    return {
      ok: false,
      reason: 'EXPIRED',
      message:
        'Pratinjau revisi spek DED ini sudah kedaluwarsa (lebih dari 10 menit). Kirim ulang perintah revisinya agar nilainya dihitung dari spek DED terbaru.',
    };
  }
  const current = currentSpecs.find(
    (s) => s.key === preview.key && typeof s.value === 'number',
  );
  if (!current || typeof current.value !== 'number') {
    return {
      ok: false,
      reason: 'BASE_MISSING',
      message:
        `Spek DED "${preview.label}" sudah tidak ditemukan pada data DED saat ini — revisi dibatalkan agar tidak diterapkan pada dasar yang salah. Kirim ulang perintah revisinya bila masih diperlukan.`,
    };
  }
  if (
    current.value !== preview.oldValue
    || (preview.oldUnit !== undefined && current.unit !== undefined && current.unit !== preview.oldUnit)
  ) {
    return {
      ok: false,
      reason: 'BASE_CHANGED',
      message:
        `Nilai DED "${preview.label}" sudah berubah sejak pratinjau dibuat (${preview.oldValue}${preview.oldUnit ? ` ${preview.oldUnit}` : ''} → ${current.value}${current.unit ? ` ${current.unit}` : ''}) — revisi dibatalkan agar tidak menimpa spek yang sudah berganti. Kirim ulang perintah revisinya dari nilai DED terbaru.`,
    };
  }
  return { ok: true };
}

/** Tombol konfirmasi perintah langsung (label = teks perintah itu
 *  sendiri — lihat penjelasan di kepala seksi ini). */
function directConfirmActions(label: string, intent: string, param: string): ChatActionButton[] {
  return [{ label, action: { kind: 'intent', intent, param } }];
}

/**
 * Gerbang konfirmasi CREATE/ARCHIVE/DUPLICATE_PROJECT. Mengembalikan
 * ActionResult bila perintah HARUS BERHENTI di sini (tanya konfirmasi —
 * tanpa eksekusi), atau null bila handler boleh jalan (konfirmasi sudah
 * diklaim, ATAU input tidak valid sehingga handler sendiri yang
 * menjawab jujur tanpa mengeksekusi).
 */
function gateProjectCommandConfirmation(
  intent: 'CREATE_PROJECT' | 'ARCHIVE_PROJECT' | 'DUPLICATE_PROJECT',
  param: string | undefined,
  ctx: ChatActionContext,
): ActionResult | null {
  if (intent === 'CREATE_PROJECT') {
    // Cermin pembersihan nama handleCreateProject (projectCommands.ts)
    // — sidik dihitung dari nama TERNORMALISASI, bukan param mentah.
    const name = (param ?? '').trim().replace(/[?.!…]+$/u, '').trim();
    if (!name || name.toLowerCase() === 'baru' || name.length > PROJECT_MAX_NAME_LENGTH || !ctx.createProject) {
      return null; // handler menjawab sendiri (klarifikasi/navigasi/tolak/fail-closed) — tanpa eksekusi
    }
    // P1-B: gerbang kapabilitas — validasi dulu (input tak valid tetap
    // dijawab handler), baru tolak bila mutasi NYATA ditolak perannya.
    const cap = requireChatAiMutationCapability(intent);
    if (!cap.ok) return { ok: false, message: cap.message };
    const fingerprint = JSON.stringify({ intent, name });
    // P1-C: klaim HANYA via dispatch tombol konfirmasi (flag) — kirim
    // ulang teks tidak pernah mengklaim (D6 O-5).
    if (ctx.claimDirectConfirmation === true && claimDirectConfirmation(intent, fingerprint)) return null;
    storeDirectConfirmation(intent, fingerprint);
    return {
      ok: true,
      message:
        `Buat proyek baru "${name}"?\n\nKlik "Buat proyek ${name}" untuk mengonfirmasi — atau abaikan pesan ini bila tidak jadi (konfirmasi kedaluwarsa dalam 10 menit).`,
      actions: directConfirmActions(`Buat proyek ${name}`, intent, name),
    };
  }
  // ARCHIVE / DUPLICATE — target harus ter-resolusi dulu.
  const res = resolveProjectTarget(param, ctx);
  if (res.kind !== 'found') return null; // handler menjawab kegagalan resolusi — tanpa eksekusi
  const hasCallback = intent === 'ARCHIVE_PROJECT' ? !!ctx.archiveProject : !!ctx.duplicateProject;
  if (!hasCallback) return null; // handler fail-closed — tanpa eksekusi
  const cap = requireChatAiMutationCapability(intent);
  if (!cap.ok) return { ok: false, message: cap.message };
  const fingerprint = JSON.stringify({ intent, projectId: res.project.id, name: res.project.name });
  if (ctx.claimDirectConfirmation === true && claimDirectConfirmation(intent, fingerprint)) return null;
  storeDirectConfirmation(intent, fingerprint);
  const verb = intent === 'ARCHIVE_PROJECT' ? 'Arsipkan' : 'Duplikat';
  return {
    ok: true,
    message:
      `${verb} proyek "${res.project.name}"?\n\nKlik "${verb} proyek ${res.project.name}" untuk mengonfirmasi — atau abaikan pesan ini bila tidak jadi (konfirmasi kedaluwarsa dalam 10 menit).`,
    actions: directConfirmActions(`${verb} proyek ${res.project.name}`, intent, res.project.name),
  };
}

/**
 * Gerbang konfirmasi UPDATE_PROJECT_SETTINGS (kontrak yang sama dengan
 * gateProjectCommandConfirmation: null = handler boleh jalan).
 */
function gateProjectSettingsConfirmation(
  param: string | undefined,
  ctx: ChatActionContext,
): ActionResult | null {
  const text = (param ?? '').trim();
  if (!text) return null;
  const parsed = parseSettingsPatch(text);
  if (!parsed.ok) return null; // handler menjawab (klarifikasi/rentang/pajak) — tanpa eksekusi
  if (!ctx.activeProject || !ctx.updateProjectSettings) return null;
  const cap = requireChatAiMutationCapability('UPDATE_PROJECT_SETTINGS');
  if (!cap.ok) return { ok: false, message: cap.message };
  const fingerprint = JSON.stringify({
    intent: 'UPDATE_PROJECT_SETTINGS',
    projectId: ctx.activeProject.id,
    patch: parsed.patch,
  });
  if (ctx.claimDirectConfirmation === true && claimDirectConfirmation('UPDATE_PROJECT_SETTINGS', fingerprint)) return null;
  storeDirectConfirmation('UPDATE_PROJECT_SETTINGS', fingerprint);
  const changesText = parsed.changes.map((c) => `${c.label} jadi ${formatPercentValue(c.value)}%`).join(' ');
  const lines = parsed.changes.map(
    (c) => `• ${c.label}: ${formatPercentValue(c.value)}%${c.activates ? ' (diaktifkan)' : ''}`,
  );
  return {
    ok: true,
    message:
      `Ubah pengaturan proyek "${ctx.activeProject.name}":\n${lines.join('\n')}\n\nKlik "Ubah ${changesText}" untuk mengonfirmasi — atau abaikan pesan ini bila tidak jadi (konfirmasi kedaluwarsa dalam 10 menit).`,
    actions: directConfirmActions(`Ubah ${changesText}`, 'UPDATE_PROJECT_SETTINGS', changesText),
  };
}

/**
 * Gerbang konfirmasi CREATE_QTO_ITEM / SYNC_QTO (kontrak yang sama
 * dengan gateProjectCommandConfirmation: null = handler boleh jalan).
 * SYNC_QTO 'semua': sidik mengikat DAFTAR item berharga saat
 * pratinjau — item berharga yang muncul sesudahnya membatalkan
 * konfirmasi (tanya ulang dengan daftar segar).
 */
function gateQtoCommandConfirmation(
  intent: 'CREATE_QTO_ITEM' | 'SYNC_QTO',
  param: string | undefined,
  ctx: ChatActionContext,
): ActionResult | null {
  if (intent === 'CREATE_QTO_ITEM') {
    const target = parseCreateQtoTarget(param);
    if (!target.uraian || target.quantity === null || target.unit === null) return null;
    if (!ctx.activeProject || !ctx.createQtoItem) return null;
    const cap = requireChatAiMutationCapability(intent);
    if (!cap.ok) return { ok: false, message: cap.message };
    const fingerprint = JSON.stringify({
      intent,
      projectId: ctx.activeProject.id,
      uraian: target.uraian,
      quantity: target.quantity,
      unit: target.unit,
    });
    if (ctx.claimDirectConfirmation === true && claimDirectConfirmation(intent, fingerprint)) return null;
    storeDirectConfirmation(intent, fingerprint);
    const label = `Buat item QTO ${target.uraian} ${target.quantity} ${target.unit}`;
    return {
      ok: true,
      message:
        `Buat item QTO "${target.uraian}" (${String(target.quantity).replace('.', ',')} ${target.unit}) di proyek "${ctx.activeProject.name}"?\n\nKlik "${label}" untuk mengonfirmasi — atau abaikan pesan ini bila tidak jadi (konfirmasi kedaluwarsa dalam 10 menit).`,
      actions: directConfirmActions(label, intent, `${target.uraian} ${target.quantity} ${target.unit}`),
    };
  }
  // SYNC_QTO
  const target = parseSyncQtoTarget(param);
  if (target.kind === 'empty') return null;
  if (!ctx.activeProject || !ctx.listQtoItems || !ctx.syncQtoItem) return null;
  const items = ctx.listQtoItems();
  const projectName = ctx.activeProject.name;
  if (target.kind === 'all') {
    if (items.length === 0) return null;
    const priced = items.filter((it) => qtoHasTransferablePrice(it).priced);
    const unpriced = items.filter((it) => !qtoHasTransferablePrice(it).priced);
    if (priced.length === 0) return null; // handler hanya melaporkan item tanpa harga — tanpa eksekusi
    const cap = requireChatAiMutationCapability(intent);
    if (!cap.ok) return { ok: false, message: cap.message };
    const fingerprint = JSON.stringify({
      intent,
      kind: 'all',
      projectId: ctx.activeProject.id,
      priced: priced.map((it) => it.id).sort(),
    });
    if (ctx.claimDirectConfirmation === true && claimDirectConfirmation(intent, fingerprint)) return null;
    storeDirectConfirmation(intent, fingerprint);
    const label = 'Sinkronkan semua QTO';
    return {
      ok: true,
      message:
        `Sinkronkan ${priced.length} item QTO berharga ke RAB proyek "${projectName}"?` +
        (unpriced.length > 0 ? `\n${unpriced.length} item tanpa harga akan dilewati (tidak disinkron diam-diam).` : '') +
        `\n\nKlik "${label}" untuk mengonfirmasi — atau abaikan pesan ini bila tidak jadi (konfirmasi kedaluwarsa dalam 10 menit).`,
      actions: directConfirmActions(label, intent, 'semua qto'),
    };
  }
  const resolved = resolveQtoItemByName(items, target.name);
  if (resolved.kind !== 'one') return null; // handler menjawab (tidak ada/ambigu) — tanpa eksekusi
  const item = resolved.item;
  if (!qtoHasTransferablePrice(item).priced) return null; // handler menolak + mengarahkan ke Rekap QTO — tanpa eksekusi
  const cap = requireChatAiMutationCapability(intent);
  if (!cap.ok) return { ok: false, message: cap.message };
  const fingerprint = JSON.stringify({
    intent,
    kind: 'named',
    projectId: ctx.activeProject.id,
    itemId: item.id,
    quantity: item.quantity,
    unit: item.unit,
  });
  if (ctx.claimDirectConfirmation === true && claimDirectConfirmation(intent, fingerprint)) return null;
  storeDirectConfirmation(intent, fingerprint);
  const label = `Sinkronkan QTO ${item.uraian} ke RAB`;
  return {
    ok: true,
    message:
      `Sinkronkan item QTO ${formatQtoItemLabel(item)} ke RAB proyek "${projectName}"?\n\nKlik "${label}" untuk mengonfirmasi — atau abaikan pesan ini bila tidak jadi (konfirmasi kedaluwarsa dalam 10 menit).`,
    actions: directConfirmActions(label, intent, `${item.uraian} ke rab`),
  };
}

/**
 * P1-B + P1-C — Gerbang konfirmasi CREATE_REVISION (kontrak yang sama
 * dengan gerbang di atas: null = handler boleh jalan). Sebelum P1,
 * CREATE_REVISION mengeksekusi TANPA konfirmasi dan TANPA gerbang
 * kapabilitas — padahal aturan owner §4.2/§6 mewajibkan keduanya untuk
 * setiap mutasi persisten Chat AI. Label dibersihkan dengan
 * cleanRevisionLabel yang sama seperti handler (cermin validasi),
 * sidik mengikat proyek + label ternormalisasi.
 */
function gateCreateRevisionConfirmation(
  param: string | undefined,
  ctx: ChatActionContext,
): ActionResult | null {
  if (!ctx.activeProject || !ctx.createRevision) return null; // handler fail-closed — tanpa eksekusi
  const label = cleanRevisionLabel(param);
  if (label !== undefined && label.length > REVISION_MAX_LABEL_LENGTH) return null; // handler menolak panjang — tanpa eksekusi
  const cap = requireChatAiMutationCapability('CREATE_REVISION');
  if (!cap.ok) return { ok: false, message: cap.message };
  const fingerprint = JSON.stringify({
    intent: 'CREATE_REVISION',
    projectId: ctx.activeProject.id,
    label: label ?? null,
  });
  if (ctx.claimDirectConfirmation === true && claimDirectConfirmation('CREATE_REVISION', fingerprint)) return null;
  storeDirectConfirmation('CREATE_REVISION', fingerprint);
  const labelText = label ? ` dengan label "${label}"` : '';
  return {
    ok: true,
    message:
      `Buat revisi baru untuk proyek "${ctx.activeProject.name}"${labelText}?\n\nKlik "Buat revisi baru" untuk mengonfirmasi — atau abaikan pesan ini bila tidak jadi (konfirmasi kedaluwarsa dalam 10 menit).`,
    actions: directConfirmActions('Buat revisi baru', 'CREATE_REVISION', label ?? ''),
  };
}

export function executeIntent(
  intent: ChatIntent,
  param: string | undefined,
  ctx: ChatActionContext,
): ActionResult {
  // --- Navigation intents ---
  const menu = INTENT_TO_MENU[intent];
  if (menu) {
    ctx.navigate(menu);
    const label = MENU_LABELS[menu] ?? menu;
    return { ok: true, message: `Membuka ${label}…`, navigated: true };
  }

  switch (intent) {
    case 'OPEN_GAME_SPACE':
      // Fully local: no navigation, no AI provider call, no credits touched.
      return {
        ok: true,
        message: 'Membuka EZRAB Game Space 🎮 — pilih game dan langsung main, tanpa memakai AI credits.',
        openGameSpace: true,
      };

    case 'GAME_INFO': {
      // Pertanyaan tentang game dijawab dari katalog NYATA
      // (game-space/catalog.ts) — judul yang disebut user dijawab
      // spesifik, selain itu daftar lengkap semua game + isinya.
      // Tombol "Buka Game Space": cabang khusus di handler tombol view
      // (intent OPEN_GAME_SPACE) memanggil registry langsung dan
      // membuka panel lewat flag openGameSpace — BUKAN lewat routing
      // bahasa alami (cabang NL isGameCommand sudah dihapus per §7).
      const mentioned = findGamesMentioned(ctx.rawText ?? param ?? '');
      return {
        ok: true,
        message: buildGameInfoAnswer(mentioned),
        actions: [
          { label: 'Buka Game Space', action: { kind: 'intent', intent: 'OPEN_GAME_SPACE' } },
        ],
      };
    }

    case 'OPEN_PROJECT_CREATE':
      ctx.navigate('proyek');
      return {
        ok: true,
        message: 'Membuka Daftar Proyek — klik "Proyek Baru" untuk membuat proyek.',
        navigated: true,
      };

    case 'RENAME_PROJECT': {
      // Ganti nama proyek aktif (2026-11-17): satu-satunya jalur rename
      // dari chat — deterministik, dieksekusi di sini lewat callback view
      // (updateProject milik aplikasi). Balasan HANYA mengklaim berhasil
      // bila callback mengembalikan true; tanpa proyek aktif / tanpa
      // callback / nama tak valid → jawab jujur, tidak ada yang berubah.
      // Sebelumnya perintah ini jatuh ke LLM yang mengklaim rename
      // berhasil tanpa tool apa pun.
      const newName = (param ?? '').trim();
      if (!newName) {
        return { ok: true, message: 'Mau diganti jadi nama apa? Contoh: "ubah nama proyek menjadi Rumah Impian".' };
      }
      if (newName.length > 120) {
        return {
          ok: false,
          message: `Nama proyek maksimal 120 karakter — yang diminta ${newName.length} karakter. Coba nama yang lebih pendek.`,
        };
      }
      if (!ctx.activeProject) {
        return { ok: true, message: 'Tidak ada proyek aktif. Buka salah satu proyek dulu di Daftar Proyek, lalu ulangi perintahnya.' };
      }
      const oldName = ctx.activeProject.name;
      if (newName === oldName) {
        return { ok: true, message: `Nama proyek sudah "${oldName}" — tidak ada yang berubah.` };
      }
      if (!ctx.renameProject) {
        return {
          ok: false,
          message: 'Saya belum bisa mengubah nama proyek dari chat ini. Ubah lewat Daftar Proyek (tombol edit pada proyeknya).',
        };
      }
      // P1-B: gerbang kapabilitas — validasi dulu (nama tak valid /
      // tanpa proyek / tanpa callback tetap dijawab di atas), baru
      // tolak bila mutasi NYATA ditolak perannya.
      const cap = requireChatAiMutationCapability('RENAME_PROJECT');
      if (!cap.ok) return { ok: false, message: cap.message };
      // W11 §11 (S1-R5) — konfirmasi sebelum mutasi: perintah yang sama
      // diulang (klik tombol konfirmasi) untuk mengeksekusi. P1-C:
      // klaim HANYA via dispatch tombol (executeDirectConfirmation) —
      // ketik ulang teks TIDAK PERNAH mengklaim (D6 O-5).
      // Sidik mengikat proyek + nama lama + nama baru: proyek yang
      // berganti nama di tempat lain sesudah pratinjau membatalkan
      // konfirmasi (tanya ulang dengan nama segar).
      const fingerprint = JSON.stringify({ intent: 'RENAME_PROJECT', projectId: ctx.activeProject.id, oldName, newName });
      if (!(ctx.claimDirectConfirmation === true && claimDirectConfirmation('RENAME_PROJECT', fingerprint))) {
        storeDirectConfirmation('RENAME_PROJECT', fingerprint);
        return {
          ok: true,
          message:
            `Ganti nama proyek "${oldName}" menjadi "${newName}"?\n\nKlik "Ubah nama proyek menjadi ${newName}" untuk mengonfirmasi — atau abaikan pesan ini bila tidak jadi (konfirmasi kedaluwarsa dalam 10 menit).`,
          actions: directConfirmActions(`Ubah nama proyek menjadi ${newName}`, 'RENAME_PROJECT', newName),
        };
      }
      const changed = ctx.renameProject(ctx.activeProject.id, newName);
      // P1-E: record audit (sebelum = nama lama yang dibaca dari snapshot
      // proyek aktif; sesudah = nama baru yang dikonfirmasi).
      recordDirectCommandAudit({
        operation: 'RENAME_PROJECT',
        projectId: ctx.activeProject.id,
        projectName: oldName,
        before: { name: oldName },
        after: { name: newName },
        confirmationRef: takeClaimedConfirmationRef('RENAME_PROJECT'),
        ok: changed,
        message: changed
          ? `Nama proyek diubah dari "${oldName}" menjadi "${newName}".`
          : `Nama proyek belum berubah — proyek "${oldName}" tidak ditemukan di daftar aktif.`,
      });
      if (!changed) {
        return {
          ok: false,
          message: `Nama proyek belum berubah — proyek "${oldName}" tidak ditemukan di daftar aktif. Coba pilih ulang proyeknya di Daftar Proyek, lalu ulangi perintahnya.`,
        };
      }
      return {
        ok: true,
        message: `Nama proyek diubah dari "${oldName}" menjadi "${newName}".`,
      };
    }

    // Mutasi item RAB deterministik (2026-11-17, gap P1 audit perintah):
    // kelima case ini membangun ChangePlan yang SAMA dengan tool propose_*
    // (pratinjau + Konfirmasi Eksekusi) — tanpa LLM, tanpa kredit.
    // Balasan sukses HANYA teks pratinjau + planId (view merender kartu
    // konfirmasi); eksekusi HANYA lewat klik Konfirmasi Eksekusi.
    // Fail-closed seperti rename: gerbang gagal / target tak ditemukan /
    // target ambigu / AHSP tak unik / tak ada record undo → pesan jujur,
    // TIDAK ADA plan yang dibuat, TIDAK ADA klaim sukses.
    case 'UPDATE_ITEM_VOLUME': {
      const gate = requireMutationGate();
      if (!gate.ok) return { ok: false, message: gate.message };
      const split = splitNameAndValue(param ?? '');
      if (!split || !split.name) {
        return { ok: true, message: 'Ubah volume item apa, jadi berapa? Contoh: "ubah volume plesteran jadi 25 m2".' };
      }
      const parsed = parseVolumeValue(split.valueText);
      if (!parsed) {
        return { ok: false, message: `Volume "${split.valueText}" tidak bisa dibaca sebagai angka. Contoh: "ubah volume ${split.name} jadi 25 m2".` };
      }
      // Bila satuan disebut, cocokkan dengan satuan item target SEBELUM
      // membangun plan — satuan tak cocok ditolak, bukan dikonversi.
      // Tanpa satuan yang disebut, builder memakai satuan item target
      // (pratinjau menampilkannya — tidak ada tebakan diam-diam).
      if (parsed.unit) {
        const target = resolveTargetItem(snapshotAllItems(gate.snap), { nama: split.name });
        if (target.kind === 'one' && !unitsCompatible(parsed.unit, target.item.unit)) {
          return {
            ok: false,
            message: `Satuan yang Anda sebut (${parsed.unit}) tidak cocok dengan satuan item "${target.item.description}" (${target.item.unit}). Sebutkan volume dalam ${target.item.unit} — satuan tidak dikonversi otomatis.`,
          };
        }
      }
      const res = buildUpdateQuantityPlan(gate.snap, { nama: split.name }, parsed.volume, gate.actor);
      if (!res.ok) return { ok: false, message: res.message };
      return { ok: true, message: res.plan.previewText, planId: res.plan.id };
    }

    case 'UPDATE_ITEM_PRICE': {
      const gate = requireMutationGate();
      if (!gate.ok) return { ok: false, message: gate.message };
      const split = splitNameAndValue(param ?? '');
      if (!split || !split.name) {
        return { ok: true, message: 'Ubah harga item apa, jadi berapa? Contoh: "ubah harga plesteran jadi Rp 50.000".' };
      }
      const price = parseRupiahAmount(split.valueText);
      if (price === null) {
        return { ok: false, message: `Harga "${split.valueText}" tidak bisa dibaca sebagai nominal Rupiah. Contoh: "ubah harga ${split.name} jadi Rp 50.000" atau "jadi 50 ribu".` };
      }
      const res = buildUpdateUnitPricePlan(gate.snap, { nama: split.name }, price, gate.actor);
      if (!res.ok) return { ok: false, message: res.message };
      return { ok: true, message: res.plan.previewText, planId: res.plan.id };
    }

    case 'DELETE_ITEM': {
      const gate = requireMutationGate();
      if (!gate.ok) return { ok: false, message: gate.message };
      const name = cleanItemName(param ?? '');
      if (!name) {
        return { ok: true, message: 'Hapus item apa? Contoh: "hapus item plesteran".' };
      }
      const res = buildDeletePlan(gate.snap, [{ nama: name }], gate.actor);
      if (!res.ok) return { ok: false, message: res.message };
      return { ok: true, message: res.plan.previewText, planId: res.plan.id };
    }

    case 'ADD_ITEM': {
      const gate = requireMutationGate();
      if (!gate.ok) return { ok: false, message: gate.message };
      const target = extractAddTarget(param ?? '');
      if (!target.name) {
        return { ok: true, message: 'Tambah item apa? Contoh: "tambah item plesteran 10 m2".' };
      }
      // Nama → kode AHSP hanya bila SATU hit relevan — ambigu/tidak ada
      // dijawab jujur, kode tidak pernah ditebak.
      const found = searchChatAhsp(target.name);
      if (found.outcome === 'NOT_FOUND' || found.items.length === 0) {
        return { ok: false, message: formatChatAhspResult(found) };
      }
      if (found.outcome !== 'FOUND_RELEVANT' || found.items.length !== 1) {
        const lines = found.items.slice(0, 5).map((it) => `- [${it.code}] ${it.title} — ${it.unit}`).join('\n');
        return {
          ok: false,
          message:
            `Nama "${target.name}" cocok dengan ${found.items.length} item AHSP — sebutkan yang mana (pakai kode atau nama yang lebih spesifik), tidak ada yang ditambahkan:\n${lines}` +
            (found.items.length > 5 ? `\n…dan ${found.items.length - 5} item lainnya.` : ''),
        };
      }
      const ahsp = found.items[0];
      if (target.unit && !unitsCompatible(target.unit, ahsp.unit)) {
        return {
          ok: false,
          message: `Satuan yang Anda sebut (${target.unit}) tidak cocok dengan satuan item AHSP [${ahsp.code}] ${ahsp.title} (${ahsp.unit}). Sebutkan volume dalam ${ahsp.unit} — satuan tidak dikonversi otomatis.`,
        };
      }
      const res = buildAddPlan(gate.snap, ahsp.code, target.volume, gate.actor);
      if (!res.ok) return { ok: false, message: res.message };
      return { ok: true, message: res.plan.previewText, planId: res.plan.id };
    }

    case 'UNDO_LAST': {
      const gate = requireMutationGate();
      if (!gate.ok) return { ok: false, message: gate.message };
      const last = getLastUndoableRecord(gate.snap.projectId);
      if (!last) {
        return { ok: true, message: `Belum ada operasi Asisten AI yang tercatat untuk proyek "${gate.snap.projectName}" — tidak ada yang bisa di-undo.` };
      }
      const res = buildUndoPlan(gate.snap, last, gate.actor);
      if (!res.ok) return { ok: false, message: res.message };
      return { ok: true, message: res.plan.previewText, planId: res.plan.id };
    }

    // Perintah deterministik kelompok 1–5 (2026-11-17, gap P2–P8 + P12
    // audit perintah): handler di ./commands/* — registry hanya
    // mendelegasikan; tiap handler fail-closed tanpa callback/proyek.
    // W11 §11 (S1-R5): CREATE/ARCHIVE/DUPLICATE_PROJECT + QTO +
    // UPDATE_PROJECT_SETTINGS lewat gerbang konfirmasi dulu (gerbang
    // mengembalikan null bila konfirmasi sudah diklaim / input tidak
    // valid sehingga handler menjawab sendiri). DELETE_PROJECT TIDAK
    // lewat gerbang — ia sudah punya konfirmasi dua langkah sendiri
    // (DELETE_PROJECT_CONFIRM).
    case 'CREATE_PROJECT':
    case 'ARCHIVE_PROJECT':
    case 'DUPLICATE_PROJECT': {
      const gated = gateProjectCommandConfirmation(intent, param, ctx);
      if (gated) return gated;
      const res = handleProjectCommand(intent, param, ctx)
        ?? { ok: false, message: 'Perintah proyek tidak dikenali.' };
      // P1-E: record audit — HANYA bila gerbang mengklaim konfirmasi
      // (takeClaimedConfirmationRef mengembalikan sidik). Bila gerbang
      // mengembalikan null karena input tak valid / tanpa callback,
      // handler hanya menjawab tanpa mengeksekusi → tidak ada record.
      const confirmationRef = takeClaimedConfirmationRef(intent);
      if (confirmationRef) {
        const target = intent === 'CREATE_PROJECT' ? null : resolveProjectTarget(param, ctx);
        const project = target && target.kind === 'found' ? target.project : null;
        recordDirectCommandAudit({
          operation: intent,
          // CREATE_PROJECT: id proyek baru tidak diketahui di registry
          // (handler hanya mengembalikan pesan) — null adalah nilai jujur.
          projectId: project?.id ?? null,
          projectName: project?.name ?? null,
          before: project ? { name: project.name } : null,
          after: intent === 'CREATE_PROJECT'
            ? { name: (param ?? '').trim().replace(/[?.!…]+$/u, '').trim() }
            : intent === 'ARCHIVE_PROJECT' ? { archived: true } : { duplicated: true },
          confirmationRef,
          ok: res.ok,
          message: res.message,
        });
      }
      return res;
    }
    case 'DELETE_PROJECT': {
      const res = handleProjectCommand(intent, param, ctx)
        ?? { ok: false, message: 'Perintah proyek tidak dikenali.' };
      // Fast Track Continuation A2 — langkah 1 MENGUSULKAN slot
      // konfirmasi (sidik + TTL 10 menit + sekali pakai + aktor, pola
      // perintah langsung yang sama): tanpa ini tombol "Ya, hapus
      // proyek" bisa menghapus kapan saja dalam sesi, tanpa batas
      // waktu dan tanpa ikatan pada keadaan yang ditinjau. Slot hanya
      // diusulkan bila langkah 1 benar-benar menghasilkan tombol
      // konfirmasi (target ter-resolusi); klarifikasi/penolakan tidak
      // meninggalkan slot. Sidik mengikat id + nama saat ini: proyek
      // yang berganti nama sesudah langkah 1 membatalkan konfirmasi.
      const confirmAction = (res.actions ?? []).find(
        (a) => a.action.kind === 'intent' && a.action.intent === 'DELETE_PROJECT_CONFIRM',
      );
      // Ikat aksi ke const agar penyempitan diskriminan TS berlaku
      // (akses rantai confirmAction.action.param tidak menyempit).
      const confirmButtonAction = confirmAction?.action;
      if (confirmButtonAction?.kind === 'intent') {
        const target = ctx.projects.find((p) => p.id === confirmButtonAction.param);
        if (target) {
          storeDirectConfirmation(
            'DELETE_PROJECT_CONFIRM',
            JSON.stringify({ intent: 'DELETE_PROJECT_CONFIRM', projectId: target.id, name: target.name }),
          );
        }
      }
      return res;
    }
    case 'DELETE_PROJECT_CONFIRM': {
      // P1-B: gerbang kapabilitas HANYA di langkah konfirmasi (langkah 1
      // hanya bertanya — read-only, tidak digerbang). Penolakan di sini
      // berarti proyek tidak terhapus.
      const cap = requireChatAiMutationCapability('DELETE_PROJECT_CONFIRM');
      if (!cap.ok) return { ok: false, message: cap.message };
      // A2 — klaim slot langkah 1 (sidik + TTL + sekali pakai + aktor):
      // tanpa slot yang sah (tidak pernah diminta / kedaluwarsa / sudah
      // dipakai / proyek berganti nama / aktor berganti), konfirmasi
      // DITOLAK — tidak ada penghapusan. Klaim di sini (bukan lewat
      // flag claimDirectConfirmation): intent ini TIDAK punya pola
      // router sehingga teks tidak pernah sampai ke case ini — case
      // ini SENDIRI adalah langkah konfirmasi (hanya dari tombol).
      const confirmId = (param ?? '').trim();
      const confirmTarget = ctx.projects.find((p) => p.id === confirmId);
      if (confirmTarget) {
        const claimed = claimDirectConfirmation(
          'DELETE_PROJECT_CONFIRM',
          JSON.stringify({ intent: 'DELETE_PROJECT_CONFIRM', projectId: confirmTarget.id, name: confirmTarget.name }),
        );
        if (!claimed) {
          return {
            ok: false,
            message:
              `Konfirmasi hapus proyek "${confirmTarget.name}" sudah tidak berlaku — mungkin kedaluwarsa (lebih dari 10 menit), sudah dipakai, proyeknya berganti nama, atau diminta oleh peran lain. Tidak ada yang dihapus. Kirim ulang perintah hapusnya bila masih ingin menghapus proyek ini.`,
          };
        }
      }
      const res = handleProjectCommand(intent, param, ctx)
        ?? { ok: false, message: 'Perintah proyek tidak dikenali.' };
      // P1-E: record audit HANYA bila penghapusan benar-benar dicoba
      // (target ter-resolusi + callback ada). Penolakan validasi
      // (tanpa id / proyek sudah hilang / tanpa callback) bukan mutasi
      // — tidak dicatat. Referensi konfirmasi = sidik slot langkah 1
      // yang diklaim (A2); fallback `delete-confirm:<id>` bila slot
      // tidak ada (proyek sudah hilang sebelum klaim — tidak dicatat
      // karena target tidak ada).
      const id = (param ?? '').trim();
      const target = ctx.projects.find((p) => p.id === id);
      if (target && ctx.deleteProject) {
        recordDirectCommandAudit({
          operation: 'DELETE_PROJECT_CONFIRM',
          projectId: target.id,
          projectName: target.name,
          before: { name: target.name },
          after: { deleted: true },
          confirmationRef: takeClaimedConfirmationRef('DELETE_PROJECT_CONFIRM') ?? `delete-confirm:${id}`,
          ok: res.ok,
          message: res.message,
        });
      }
      return res;
    }
    case 'CREATE_QTO_ITEM':
    case 'SYNC_QTO': {
      const gated = gateQtoCommandConfirmation(intent, param, ctx);
      if (gated) return gated;
      const res = handleQtoCommand(intent, param, ctx)
        ?? { ok: false, message: 'Perintah QTO tidak dikenali.' };
      // P1-E: record audit — hanya bila gerbang mengklaim konfirmasi.
      const confirmationRef = takeClaimedConfirmationRef(intent);
      if (confirmationRef) {
        let after: unknown;
        if (intent === 'CREATE_QTO_ITEM') {
          const target = parseCreateQtoTarget(param);
          after = { uraian: target.uraian, quantity: target.quantity, unit: target.unit };
        } else {
          const target = parseSyncQtoTarget(param);
          if (target.kind === 'all') {
            const priced = (ctx.listQtoItems?.() ?? []).filter((it) => qtoHasTransferablePrice(it).priced);
            after = { kind: 'all', itemIds: priced.map((it) => it.id).sort() };
          } else {
            const resolved = resolveQtoItemByName(ctx.listQtoItems?.() ?? [], target.kind === 'named' ? target.name : '');
            after = resolved.kind === 'one'
              ? { kind: 'named', itemId: resolved.item.id, uraian: resolved.item.uraian }
              : { kind: 'named', name: target.kind === 'named' ? target.name : '' };
          }
        }
        recordDirectCommandAudit({
          operation: intent,
          projectId: ctx.activeProject?.id ?? null,
          projectName: ctx.activeProject?.name ?? null,
          before: null,
          after,
          confirmationRef,
          ok: res.ok,
          message: res.message,
        });
      }
      return res;
    }
    case 'RUN_DED_ANALYSIS':
    case 'SUMMARIZE_DOCUMENT': {
      return handleDedDocCommand(intent, param, ctx)
        ?? { ok: false, message: 'Perintah tidak dikenali.' };
    }
    case 'EXPORT_PROJECT':
    case 'CREDIT_BALANCE':
    case 'TOPUP_CREDIT': {
      return handleExportCreditCommand(intent, param, ctx)
        ?? { ok: false, message: 'Perintah tidak dikenali.' };
    }
    case 'CREATE_REVISION': {
      // P1-B + P1-C: sebelum P1, CREATE_REVISION mengeksekusi TANPA
      // konfirmasi dan TANPA gerbang kapabilitas. Kini lewat gerbang
      // (kapabilitas + konfirmasi tombol + TTL + sekali pakai) seperti
      // perintah langsung lainnya, + record audit (P1-E).
      const gated = gateCreateRevisionConfirmation(param, ctx);
      if (gated) return gated;
      const res = handleExportCreditCommand(intent, param, ctx)
        ?? { ok: false, message: 'Perintah tidak dikenali.' };
      const confirmationRef = takeClaimedConfirmationRef(intent);
      if (confirmationRef) {
        recordDirectCommandAudit({
          operation: 'CREATE_REVISION',
          projectId: ctx.activeProject?.id ?? null,
          projectName: ctx.activeProject?.name ?? null,
          before: null,
          after: { label: cleanRevisionLabel(param) ?? null },
          confirmationRef,
          ok: res.ok,
          message: res.message,
        });
      }
      return res;
    }
    case 'UPDATE_PROJECT_SETTINGS': {
      const gated = gateProjectSettingsConfirmation(param, ctx);
      if (gated) return gated;
      const res = handleProjectSettingsCommand(intent, param, ctx)
        ?? { ok: false, message: 'Perintah pengaturan tidak dikenali.' };
      // P1-E: record audit — hanya bila gerbang mengklaim konfirmasi.
      // before = null: registry tidak punya akses baca ke pengaturan
      // proyek aktif (hanya ada di state React ProjectContext) — nilai
      // patch yang dikonfirmasi tercatat di `after`.
      const confirmationRef = takeClaimedConfirmationRef(intent);
      if (confirmationRef) {
        const parsed = parseSettingsPatch((param ?? '').trim());
        recordDirectCommandAudit({
          operation: 'UPDATE_PROJECT_SETTINGS',
          projectId: ctx.activeProject?.id ?? null,
          projectName: ctx.activeProject?.name ?? null,
          before: null,
          after: parsed.ok ? parsed.patch : null,
          confirmationRef,
          ok: res.ok,
          message: res.message,
        });
      }
      return res;
    }

    // Workstream B1 (2026-11-19, gap P2 + P6 + §K baris 42 audit
    // perintah): transfer draft, override harga per-proyek (dua
    // langkah — pratinjau + konfirmasi tombol; langkah 1 tidak pernah
    // menulis), ganti paket simulasi. SET_PROJECT_PRICE_CONFIRM hanya
    // dari tombol (tanpa pola router, seperti DELETE_PROJECT_CONFIRM).
    case 'TRANSFER_DRAFT': {
      return handleTransferDraft(ctx);
    }
    case 'SET_PROJECT_PRICE': {
      return handleSetProjectPriceStep1(param, ctx);
    }
    case 'SET_PROJECT_PRICE_CONFIRM': {
      // P1-B: gerbang kapabilitas HANYA di langkah konfirmasi (langkah 1
      // hanya pratinjau — read-only, tidak digerbang).
      const cap = requireChatAiMutationCapability('SET_PROJECT_PRICE_CONFIRM');
      if (!cap.ok) return { ok: false, message: cap.message };
      // A2 — klaim slot langkah 1 (sidik = string JSON payload persis
      // yang ditinjau; TTL + sekali pakai + aktor): tanpa slot yang sah
      // (tidak pernah diminta / kedaluwarsa / sudah dipakai / payload
      // berubah / aktor berganti), override DITOLAK — tidak ada yang
      // diterapkan. Klaim di sini (bukan lewat flag
      // claimDirectConfirmation): intent ini TIDAK punya pola router
      // sehingga teks tidak pernah sampai ke case ini — case ini
      // SENDIRI adalah langkah konfirmasi (hanya dari tombol).
      const priceParam = (param ?? '').trim();
      if (!claimDirectConfirmation('SET_PROJECT_PRICE_CONFIRM', priceParam)) {
        return {
          ok: false,
          message:
            'Konfirmasi override harga ini sudah tidak berlaku — mungkin kedaluwarsa (lebih dari 10 menit), sudah dipakai, atau pratinjaunya dibuat ulang. Tidak ada yang diterapkan. Kirim ulang perintahnya, misalnya "ubah harga semen jadi Rp 2.000 untuk proyek ini".',
        };
      }
      const res = handleSetProjectPriceConfirm(param, ctx);
      // P1-E: record audit HANYA bila override benar-benar dicoba
      // (payload valid + proyek aktif cocok + callback ada). Payload
      // JSON yang dikonfirmasi dipakai sebagai referensi konfirmasi
      // (proposal persis yang ditinjau user) dan nilai before/after.
      let payload: ProjectPriceConfirmPayload | null = null;
      try {
        const parsed = JSON.parse(param ?? '') as ProjectPriceConfirmPayload;
        if (parsed && parsed.v === 1) payload = parsed;
      } catch { /* payload rusak — tanpa record */ }
      if (payload && ctx.activeProject?.id === payload.projectId && ctx.setProjectPriceOverride) {
        recordDirectCommandAudit({
          operation: 'SET_PROJECT_PRICE_CONFIRM',
          projectId: payload.projectId,
          projectName: ctx.activeProject.name,
          before: { code: payload.code, name: payload.name, masterPrice: payload.masterPrice, unit: payload.unit },
          after: { code: payload.code, name: payload.name, projectPrice: payload.projectPrice, unit: payload.unit },
          // A2: sidik slot yang diklaim (string JSON payload — sama
          // dengan JSON.stringify(payload); fallback bila klaim tidak
          // tercatat).
          confirmationRef: takeClaimedConfirmationRef('SET_PROJECT_PRICE_CONFIRM') ?? JSON.stringify(payload),
          ok: res.ok,
          message: res.message,
        });
      }
      return res;
    }
    case 'CHANGE_PLAN': {
      return handleChangePlan(param, ctx);
    }

    case 'CAPABILITIES': {
      // Jawaban produk deterministik: keunggulan EZRAB yang nyata + tombol
      // untuk langsung mencoba. Angka template/AHSP DIHITUNG DARI SUMBER
      // DATA NYATA saat runtime (kasus A1: angka hard-coded lama "52
      // template / 5.801 analisa" basi — aktual 180 / 5.742). Bila aksesor
      // gagal, angka spesifik dihilangkan (klaim kualitatif saja) — jangan
      // mengganti hard-code lama dengan hard-code baru.
      let templateLine = '• Template RAB siap pakai untuk berbagai jenis proyek';
      try {
        const n = RabTemplateService.getInstance().getAllTemplates().length;
        if (n > 0) templateLine = `• ${n.toLocaleString('id-ID')} template RAB siap pakai untuk berbagai jenis proyek`;
      } catch { /* aksesor tak tersedia — klaim kualitatif */ }
      let ahspLine = '• AHSP 2026 resmi — cari dan pakai langsung di RAB';
      try {
        const n = officialAhspRepository.size;
        if (n > 0) ahspLine = `• AHSP 2026 resmi (${n.toLocaleString('id-ID')} analisa) — cari dan pakai langsung di RAB`;
      } catch { /* aksesor tak tersedia — klaim kualitatif */ }
      return {
        ok: true,
        message:
          'Saya Ezrab Chat AI — asisten estimasi konstruksi di dalam EZRAB, satu platform lengkap untuk RAB, DED, dokumen, volume, keuangan, dan jadwal. Saya menjawab dari data EZRAB sendiri, bukan karangan model. Ini yang bisa saya bantu:\n\n' +
          'MEMBUAT RAB\n' +
          '• Wizard RAB rumah — 5 langkah, RAB terbentuk dari tipe & ukuran rumah\n' +
          '• Desain Rumah AI — dari deskripsi teks menjadi spesifikasi & daftar pekerjaan\n' +
          '• Estimasi dari DED — unggah gambar kerja, draft estimasinya disusun otomatis\n' +
          templateLine + '\n\n' +
          'PERINTAH LANGSUNG DARI CHAT\n' +
          '• Kelola proyek: buat, ganti nama, duplikat, arsipkan, hapus — hapus selalu minta konfirmasi dulu\n' +
          '• Ubah item RAB: tambah, hapus, ubah volume/harga, batalkan — selalu lewat pratinjau + tombol Konfirmasi\n' +
          '• QTO: buat item volume dan sinkronkan ke RAB\n' +
          '• Jalankan DED & ringkas dokumen: analisis gambar kerja yang sudah diunggah, atau ringkas dokumen dari chat\n' +
          '• Ekspor Excel/PDF, buat revisi, cek & top-up kredit (simulasi), atur overhead/profit/PPN proyek\n' +
          '• Transfer draft ke spreadsheet, override harga material untuk satu proyek, dan ganti paket (simulasi)\n' +
          '• Ketik / untuk melihat semua perintah\n\n' +
          'FITUR LENGKAP EZRAB\n' +
          '• AI Document — susun dokumen proyek dengan AI, dari template atau instruksi\n' +
          '• Kalkulator Volume — hitung volume tiap jenis pekerjaan\n' +
          '• Keuangan Proyek — termin, invoice, pemasukan, pengeluaran, dan cash flow\n' +
          '• Kurva S & Jadwal — pantau progres fisik dan jadwal pelaksanaan\n' +
          '• Laporan & Dokumen Tender — rekapitulasi, BOQ, dan dokumen proyek\n' +
          '• Peran pengguna — admin, estimator, direksi, editor, dan klien\n' +
          '• Tema tampilan — terang, gelap, atau mengikuti sistem\n\n' +
          'DATA & HITUNGAN YANG BISA DIPERCAYA\n' +
          ahspLine + '\n' +
          '• Database harga material, upah, dan peralatan 2026\n' +
          '• Volume & subtotal dihitung engine deterministik; harga yang belum ada data resminya ditandai jelas, tidak pernah dikarang\n' +
          '• Tanya langsung di sini: total proyek, item termahal/termurah, cari AHSP\n\n' +
          'Yang belum bisa dari chat: mengubah harga master/database material — itu kewenangan admin. Yang bisa diubah dari chat hanya override harga untuk satu proyek.\n\n' +
          'Coba salah satu:',
        actions: [
          { label: 'Buat RAB', action: { kind: 'intent', intent: 'CREATE_RAB_CLARIFY' } },
          { label: 'Desain rumah dengan AI', action: { kind: 'intent', intent: 'START_HOUSE_DESIGN' } },
          { label: 'Estimasi dari DED', action: { kind: 'navigate', menu: 'ded-ai' } },
          { label: 'Lihat template RAB', action: { kind: 'navigate', menu: 'template-rab' } },
        ],
      };
    }

    case 'KURVA_S': {
      // Jawaban produk deterministik (koreksi owner 2026-11-19): LLM
      // pernah menjawab "tidak ada tool penjadwalan/kurva S di EZRAB" —
      // SALAH. Fitur Kurva S & Jadwal ADA (engine kurvaSEngine.ts +
      // EstimatorKurvaSView, menu rab-kurva-s). Chat tidak bisa
      // membuat/mengubah jadwal — arahkan ke menu, jangan tawarkan
      // hitungan manual sebagai pengganti fitur.
      return {
        ok: true,
        message:
          'EZRAB punya fitur Kurva S & Jadwal — kurvanya dihitung engine dari RAB proyek dan jadwalnya (tanggal mulai proyek + tugas/durasi). Kalau datanya belum lengkap, tampilannya menyebut field apa yang kurang.\n\n' +
          'Yang belum bisa dari chat: saya tidak bisa membuat atau mengubah jadwal dari chat, jadi saya tidak bisa membuatkan kurva S dari sini. Buka menu Kurva S & Jadwal di proyeknya untuk melihat kurva S; pastikan RAB dan jadwal proyek sudah diisi.\n\n' +
          'Lihat kurva S proyek aktif:',
        actions: [
          { label: 'Lihat Kurva S & Jadwal', action: { kind: 'navigate', menu: 'rab-kurva-s' } },
        ],
      };
    }

    case 'CALCULATE': {
      // Hitungan deterministik lokal (calcIntent) — tanpa LLM, tanpa
      // kredit. Router hanya mengarahkan ke sini bila pola terparse penuh;
      // bila evaluasi ulang tak menghasilkan apa pun, jawab jujur.
      const calc = evaluateCalculation(ctx.rawText ?? param ?? '');
      if (!calc) {
        return {
          ok: false,
          message:
            'Hitungannya belum bisa saya parse dengan pasti. Coba tulis angkanya dengan satuan yang jelas, misalnya "hitung volume balok 0,25 m × 0,40 m × 6 m".',
        };
      }
      return { ok: true, message: calc.message };
    }

    case 'RAB_DATA_CHECKLIST':
      // Permintaan dokumen persiapan (kasus A3) — jawaban lokal
      // deterministik, BUKAN intake pembuatan RAB.
      return {
        ok: true,
        message:
          'Checklist data sebelum menyusun RAB — siapkan ini agar RAB tidak berhenti di asumsi:\n\n' +
          '1. **Gambar kerja** — denah, tampak, potongan, dan gambar detail (sumber semua ukuran & volume).\n' +
          '2. **Spesifikasi teknis & material** — jenis/mutu material, standar pekerjaan, merek bila ditentukan.\n' +
          '3. **Lokasi proyek & akses** — wilayah menentukan basis harga; akses lokasi menentukan biaya mobilisasi.\n' +
          '4. **Kondisi lahan/tanah** — kontur, daya dukung, muka air tanah, dan pekerjaan tanah yang diperlukan.\n' +
          '5. **Ukuran & ruang lingkup** — luas bangunan/lahan, jumlah lantai, dimensi, dan daftar pekerjaan yang termasuk.\n' +
          '6. **Sumber harga wilayah** — HSPK setempat atau survei pasar terbaru beserta tanggal berlakunya.\n' +
          '7. **Jadwal target & batasan** — target selesai, jam kerja, dan izin/lingkungan yang memengaruhi metode kerja.\n\n' +
          'Data yang belum ada boleh menyusul — di EZRAB data kosong ditandai "belum tersedia", bukan diisi angka karangan. Kalau datanya sudah siap, kita bisa langsung mulai menyusun RAB-nya.',
        actions: [
          { label: 'Mulai susun RAB', action: { kind: 'intent', intent: 'CREATE_RAB_CLARIFY' } },
          { label: 'Lihat template RAB', action: { kind: 'navigate', menu: 'template-rab' } },
        ],
      };

    case 'CREATE_RAB_CLARIFY': {
      // Permintaan dengan dokumen DED eksplisit (skenario I master
      // prompt): "ini gambar DED-nya, buatkan RAB" menyebut DED sebagai
      // OBJEK permintaan — workflow yang benar adalah DED Estimate AI,
      // bukan menu generik 4 jalur. Router memang mengklasifikasikan
      // kalimat ini ke sini (ded disebut sebagai objek, bukan jalur
      // spesifik), jadi penjagaannya di registry: frasa kepemilikan
      // dokumen ("ini gambar ded-nya", "sudah ada ded", lampiran)
      // diarahkan ke ringkasan jalur DED. Menu generik di bawah tetap
      // untuk "buatkan rab" yang benar-benar tanpa objek (skenario B).
      const rawClarify = ctx.rawText ?? param ?? '';
      if (/\b(ded|gambar kerja)\b/i.test(rawClarify) && /\b(ini|itu|ada|sudah|berikut|lampiran|terlampir|punya)\b/i.test(rawClarify)) {
        return rabSummaryResult(rawClarify, undefined, ctx.activeProject?.id ?? null);
      }
      // Intake universal (2026-11-10): kategori yang TERIDENTIFIKASI
      // tidak pernah dibalas menu generik (prinsip §1 master prompt) —
      // gerbang mengambil alih di sini bila klasifikasinya jelas dan
      // bukan alur terlindungi; "buatkan rab" tanpa objek mengembalikan
      // null dari gerbang dan menu di bawah tetap tampil (skenario B).
      const uniClarify = universalIntakeGate(rawClarify, true, ctx.activeProject?.id ?? null);
      if (uniClarify) return uniClarify;
      // B5-4 (2026-11-23): cabang "di luar cakupan" yang jujur — PEMETAAN
      // dari klasifikasi builder, bukan logika baru. Bila builder tidak
      // mengenali cakupan apa pun (needs-spec yang menanyakan OBJEKNYA
      // sendiri) TETAPI pengguna SUDAH menyebut ukuran fisik, objeknya
      // sudah dideskripsikan konkret dan memang tidak tercakup katalog —
      // jawab jujur "belum didukung" + tawarkan RAB manual/klarifikasi,
      // bukan pemilih jalur generik (menara telekomunikasi 30 m dilempar
      // ke katalog 183 template tanpa pernah dinyatakan tak didukung).
      // Permintaan tanpa objek/ukuran ("buatkan rab") TETAP mendapat menu
      // generik di bawah (pin WaveB T12 / WaveA). buildUniversalDraft
      // dipanggil HANYA bila cakupan kosong — ia kembali awal
      // (needs-spec) tanpa membangun draft, jadi tanpa efek samping
      // setLastUniversalDraft. Feedback ditangkap seperti di
      // universalResultFor agar antrean review punya bahan nyata.
      const clarifySpec = extractUniversalSpec(rawClarify);
      if (clarifySpec.scopes.length === 0) {
        const fmtM = (v: number) => v.toLocaleString('id-ID', { maximumFractionDigits: 1 });
        const statedMeasures: string[] = [];
        if (clarifySpec.areaM2 != null) statedMeasures.push(`luas ${fmtM(clarifySpec.areaM2)} m²`);
        if (clarifySpec.lengthM != null) statedMeasures.push(`panjang ${fmtM(clarifySpec.lengthM)} m`);
        if (clarifySpec.widthM != null) statedMeasures.push(`lebar ${fmtM(clarifySpec.widthM)} m`);
        if (clarifySpec.heightM != null) statedMeasures.push(`tinggi ${fmtM(clarifySpec.heightM)} m`);
        if (clarifySpec.spanM != null) statedMeasures.push(`bentang ${fmtM(clarifySpec.spanM)} m`);
        if (clarifySpec.depthM != null) statedMeasures.push(`kedalaman ${fmtM(clarifySpec.depthM)} m`);
        if (statedMeasures.length > 0) {
          const built = buildUniversalDraft(rawClarify);
          if (built.kind === 'needs-spec' && built.missing.some((m) => /objek\/pekerjaan konstruksi/i.test(m))) {
            captureFeedback('unsupported-request', rawClarify, { reason: built.reason });
            return {
              ok: true,
              message:
                `Maaf — jenis pekerjaan dalam permintaan ini belum didukung katalog RAB EZRAB. ` +
                `Anda sudah menyebut ukuran (${statedMeasures.join(', ')}), tetapi tidak ada template katalog untuk pekerjaan ini, ` +
                `jadi RAB-nya belum dapat saya susun dari template — dan saya tidak akan menebak-nebak itemnya.\n\n` +
                `Silakan susun manual lewat RAB & Estimasi (RAB kosong, isi item sendiri), atau tulis ulang dengan kata lain ` +
                `bila maksud Anda pekerjaan yang ada di katalog. Bila Anda punya gambar kerjanya, DED Estimate AI dapat menghitung dari gambar.`,
              actions: [
                { label: 'Mulai manual', action: { kind: 'navigate', menu: 'rab-estimasi' } },
                { label: 'Dari gambar DED', action: { kind: 'navigate', menu: 'ded-ai' } },
              ],
            };
          }
        }
      }
      // "buatkan rab" tanpa objek: tanya balik + tombol jalur, JANGAN
      // menumpahkan daftar template ke chat. Lokal penuh, tanpa kredit AI.
      return {
        ok: true,
        message:
          'Siap, saya bantu buatkan RAB. RAB-nya untuk apa? Pilih jalurnya:\n' +
          '• Rumah tinggal — lewat wizard (pilih tipe, ukuran, ruangan)\n' +
          '• Dari gambar DED — estimasi dari file gambar kerja Anda\n' +
          '• Pakai template — mulai dari template RAB yang sudah jadi\n' +
          '• Manual — RAB kosong, isi item sendiri\n' +
          'Atau tulis langsung, misalnya "buatkan rab rumah 2 lantai".',
        actions: [
          { label: 'Rumah tinggal', action: { kind: 'intent', intent: 'START_RAB_WIZARD' } },
          { label: 'Dari gambar DED', action: { kind: 'navigate', menu: 'ded-ai' } },
          { label: 'Pakai template', action: { kind: 'navigate', menu: 'template-rab' } },
          { label: 'Manual / kosong', action: { kind: 'navigate', menu: 'rab-estimasi' } },
        ],
      };
    }

    case 'CREATE_RAB_DIRECT': {
      const raw = ctx.rawText ?? param ?? '';
      // INTENT-FIRST (2026-11-20): spek diekstrak DULU, template dievaluasi
      // TERHADAP spek — bukan sebaliknya. runRabIntentFlow mengeksekusi
      // urutan itu: ekstraksi spek → pemeriksaan DED → evaluasi template
      // (hanya parameter yang didukung template) → rekomendasi metode →
      // generate lewat mesin kanonis yang sama (directRab/specRab/
      // universalRab). Perilaku lama yang dipertahankan: kecocokan
      // eksak langsung tabel + Push (2026-10-27); basis fallback
      // menampilkan kartu pilihan + rekomendasi (desain owner
      // 2026-10-22); rumah tanpa spek terukur jatuh ke ringkasan
      // kebutuhan (PERBAIKAN-D).
      const flow = runRabIntentFlow(raw, { hijacked: specRabHijackGuard(raw) });
      const ev = flow.evaluation;
      pendingChoice = null;
      setPendingSubtypeNeeds(null);
      if (ev.route === 'ded') {
        // Spek sudah diekstrak + disimpan oleh flow; rabSummaryResult
        // menampilkannya sebagai spesifikasi yang tetap berlaku.
        return rabSummaryResult(raw, undefined, ctx.activeProject?.id ?? null);
      }
      if (ev.route === 'clarify') {
        // Basis terukur belum ada — tanya SATU topik (basis) saja, dan
        // simpan state kebutuhan agar jawaban lanjutan menggabungkan
        // (bukan mengulang) spek yang sudah disebut.
        setLastRabNeeds(specToRabNeeds(ev.spec), ctx.activeProject?.id ?? null);
        if (raw) lastRabRaw = raw;
        return {
          ok: true,
          awaitRabNeeds: true,
          message: ev.clarification ?? 'Boleh saya tahu luas bangunan atau dimensinya?',
        };
      }
      if (ev.templateMatch && (ev.needsCard || (ev.route === 'template' && !flow.built))) {
        // Kartu pilihan: basis fallback (luas ≠ tipe katalog) atau
        // kecocokan eksak yang build-nya gagal — keduanya perlu
        // konfirmasi pengguna sebelum generate. Kartu membawa
        // rekomendasi metode dari evaluasi spek (bukan pilihan buta).
        pendingChoice = {
          rawText: raw,
          match: ev.templateMatch,
          needs: { ...ev.templateMatch.needs },
          floors: ev.templateMatch.floors,
          floorsMentioned: ev.templateMatch.floorsMentioned,
          landAreaM2: ev.spec.landAreaM2 ?? resolveLandAreaM2(raw),
          spec: ev.spec,
        };
        setPendingSubtypeNeeds(null);
        return choiceCardResult(pendingChoice, false, ctx.activeProject?.id ?? null, ev.recommendation);
      }
      if (flow.built) return directRabTableResult(flow.built);
      if (ev.route === 'universal') {
        // FASE 4 (CHAT-05): teks DIRECT non-rumah (termasuk primer
        // non-rumah yang dijaga dari specRab, mis. kolam) ditangani
        // katalog universal — atau ringkasan jujur bila tak ada template.
        // GATE 4 (5D): projectId diteruskan agar lampiran DED proyek
        // ini ikut (spek DED + rekonsiliasi QTO di universalResultFor).
        const uniDirect = universalResultFor(raw, ev.forcedTemplateId, undefined, {
          projectId: ctx.activeProject?.id ?? null,
        });
        if (uniDirect) return uniDirect;
      }
      return rabSummaryResult(raw, undefined, ctx.activeProject?.id ?? null);
    }

    case 'GENERATE_RAB_TEMPLATE': {
      // Hanya tercapai lewat KLIK tombol "Pakai Template" pada kartu pilihan
      // (persetujuan eksplisit pengguna) — teks ketikan tidak pernah sampai
      // ke sini. Generate parametrik persis jalur CREATE_RAB_DIRECT lama:
      // tabel detail + total + tombol Push ke Spreadsheet RAB.
      // Bila kartu ini adalah kartu pending aktif (param = teks asal kartu),
      // generate memakai kebutuhan TERKOREKSI pengguna (D1) dan pending
      // dikonsumsi; klik pada kartu lama yang sudah digantikan jatuh ke
      // perilaku lama (parse dari param-nya sendiri).
      const rawParam = param ?? ctx.rawText ?? '';
      const p = pendingChoice;
      const usePending = p != null && (rawParam === '' || rawParam === p.rawText);
      const built = usePending ? buildDirectRab(p.rawText, p.needs) : buildDirectRab(rawParam);
      if (!built) return rabSummaryResult(rawParam, undefined, ctx.activeProject?.id ?? null);
      if (usePending) pendingChoice = null;
      // B5-3 direct: lewat corong yang sama (hasil identik: tabel +
      // tiga tombol yang sama) agar klik "Pakai Template" juga
      // memastikan proyek sementara bila belum ada proyek aktif.
      return directRabTableResult(built);
    }

    case 'CREATE_RAB_SUMMARY': {
      // Gerbang intake konteks proyek (Conversational Intelligence
      // Upgrade 2026-11-10): keluarga LANDSCAPE/taman masuk percakapan
      // intake terstruktur (konsep → fasilitas → pratinjau) SEBELUM
      // draft universal dicoba — kategori+atribut yang sudah diberikan
      // tidak pernah dibalas menu generik atau draft dari angka yang
      // salah baca. Kategori lain: gerbang mengembalikan null dan alur
      // di bawah berjalan persis seperti sebelumnya.
      const rawSummary = ctx.rawText ?? param ?? '';
      // INTENT-FIRST: permintaan DED diekstrak + diproses SEBELUM gate
      // universal — draf template tidak boleh menelan permintaan DED
      // (dulu "rab rumah dari gambar ded" bisa berujung draf template
      // rumah diam-diam lewat buildUniversalDraft).
      if (extractRabIntentSpec(rawSummary).source === 'ded') {
        return rabSummaryResult(rawSummary, undefined, ctx.activeProject?.id ?? null);
      }
      // Intake universal didahulukan HANYA untuk: proyek multi-
      // disiplin (yang bisa dibajak gerbang landscape — kasus sekolah
      // + taman + pagar + drainase) dan kategori non-landscape yang
      // fakta kritisnya hilang. Untuk landscape murni & alur
      // terlindungi gerbang ini mengembalikan null.
      const uniRes = universalIntakeGate(rawSummary, false, ctx.activeProject?.id ?? null);
      if (uniRes) return uniRes;
      // S3-B: teruskan proyek aktif agar konteks landscape dicap pemiliknya
      // (null eksplisit = global — konteks tanpa cap, bukan tanpa info).
      const intakeRes = projectIntakeGate(rawSummary, ctx.activeProject?.id ?? null);
      if (intakeRes) return intakeRes;
      // Universal (2026-10-26): permintaan non-rumah yang terukur langsung
      // dicoba menjadi draft katalog; rumah tetap ringkasan dulu (desain
      // owner) karena jalur rumah (typed/spec/workspace) yang memilikinya.
      const needsSummary = extractRabNeeds(stripLandPhrases(rawSummary));
      if (needsSummary.kind !== 'rumah') {
        // GATE 4 (5D): projectId diteruskan agar lampiran DED proyek
        // ini ikut (spek DED + rekonsiliasi QTO + tombol koreksi).
        // INTENT-FIRST: evaluasi spek memilih template yang paling cocok
        // (ikatan spesifikasi khas, mis. cold-storage untuk gudang
        // pendingin) — template paksa hanya bila satu cakupan terdeteksi
        // dan ada alternatif imbang yang lebih cocok.
        const forced = evaluateRabIntent(rawSummary).forcedTemplateId;
        const uniSummary = universalResultFor(rawSummary, forced, undefined, { projectId: ctx.activeProject?.id ?? null });
        if (uniSummary) {
          // GATE 1 (5A) — jalur cepat menghasilkan draft: tautkan snapshot
          // intake (yang sudah disimpan gerbang sebelum draft) ke draft
          // yang baru tersusun, agar pemulihan sesudah reload memulihkan
          // konteks draft ini BERSAMA draftnya. Konteks diekstrak ulang
          // dari teks yang sama — deterministik, identik dengan yang
          // disimpan gerbang.
          if (uniSummary.actions?.some((a) => a.action.kind === 'push-universal')) {
            const draftNow = getLastUniversalDraft();
            // F-ISO-2 (Phase 2, 2026-11-23): tanpa proyek aktif, draft
            // mendarat di proyek sementara B5-3 (ensuredProjectId) —
            // snapshot HARUS ikut ke proyek itu, bukan hilang karena
            // activeProject null. Cermin jalur terpandu (:1423) yang
            // mengikat konteks ke ensuredProjectId sebelum menyimpan.
            const pid = uniSummary.ensuredProjectId ?? ctx.activeProject?.id ?? null;
            if (draftNow && pid) {
              const fastCtx = extractUniversalContext(rawSummary);
              fastCtx.projectId = pid;
              // GATE 4 (5D): snapshot tautan ini MENIMPA snapshot gerbang
              // — spek DED harus ikut digabung lagi, atau konteks pulih
              // pasca-reload kehilangan seksi DED di brief.
              try {
                const att = loadDedAttachment(pid);
                if (att) fastCtx.dedSpecs = sanitizeDedSpecs(dedSpecsFromAttachment(att).specs);
              } catch { /* lampiran rusak — snapshot jalan tanpa DED */ }
              persistIntakeSnapshotNow(fastCtx, draftNow.id);
            }
          }
          return uniSummary;
        }
      }
      // Fase 2: ringkasan kebutuhan dulu — TIDAK membuka wizard/studio.
      return rabSummaryResult(rawSummary, undefined, ctx.activeProject?.id ?? null);
    }

    case 'RAB_CONCEPT_SELECT': {
      // Klik pilihan konsep pada pertanyaan intake landscape. param =
      // id konsep dari peta projectIntake ('custom' = konsep bebas
      // pengguna — fasilitasnya ditangkap dari teks, bukan daftar).
      const ctxIntake = projectCtx;
      // S3-B: konteks milik proyek lain diperlakukan sama dengan konteks
      // tidak aktif — jangan mutasi (set conceptId) dari konteks asing.
      if (!ctxIntake || isProjectContextForeign(ctxIntake, ctx.activeProject?.id ?? null)) {
        return {
          ok: false,
          message:
            'Konteks pertanyaan konsep sudah tidak aktif. Tulis ulang kebutuhannya, misalnya "buatkan rab landscape 1 hektar".',
        };
      }
      if (param === 'custom') {
        ctxIntake.conceptId = 'custom';
        ctxIntake.conceptLabel = 'Konsep custom';
      } else {
        const concept = landscapeConceptById(param ?? null);
        if (!concept) {
          return { ok: false, message: 'Pilihan konsep itu tidak dikenal. Pilih lewat tombol konsep yang tersedia atau tulis konsepnya.' };
        }
        ctxIntake.conceptId = concept.id;
        ctxIntake.conceptLabel = concept.label;
      }
      refreshContextFacts(ctxIntake);
      projectCtx = ctxIntake;
      return landscapeFacilitiesQuestion(ctxIntake);
    }

    case 'RAB_PROJECT_PREVIEW': {
      // Klik "Susun pratinjau RAB" → pratinjau terstruktur (§8). Klik
      // "Susun draft RAB" pada pratinjau (param 'generate') → draft
      // kanonis dari konteks gabungan (buildUniversalDraft lewat
      // universalResultFor), template konsep dipaksakan bila ada.
      const ctxIntake = projectCtx;
      // S3-B: konteks milik proyek lain diperlakukan sama dengan konteks
      // tidak aktif — jangan tampilkan pratinjau / generate dari fakta
      // proyek lain (S2 discovery: draft B dari fakta A).
      if (!ctxIntake || isProjectContextForeign(ctxIntake, ctx.activeProject?.id ?? null)) {
        return {
          ok: false,
          message:
            'Konteks proyek sudah tidak aktif. Tulis ulang kebutuhannya, misalnya "buatkan rab landscape 1 hektar".',
        };
      }
      if (param === 'generate') return generateFromProjectContext(ctxIntake, ctx.activeProject?.id ?? null);
      return projectPreviewResult(ctxIntake);
    }

    case 'RAB_INTAKE_OPTION': {
      // Klik pilihan pada pertanyaan intake universal (tipe drainase,
      // cakupan renovasi, baru/eksisting, atau "Susun brief sekarang").
      return applyUniversalOption(param ?? '');
    }

    case 'RAB_INTAKE_GENERATE': {
      // Klik "Susun draft RAB" pada brief universal = persetujuan
      // pengguna atas brief (prinsip §9) → generate mesin kanonis.
      return generateUniversalFromBrief();
    }

    case 'RAB_SUBTYPE_SELECT': {
      // Klik tombol subtipe pada pertanyaan klarifikasi ("Jalan apa?").
      // State kebutuhan berasal dari pertanyaan yang menggantung (atau
      // ringkasan terakhir); param = id subtipe dari peta rabSubtypes.
      const needs = scopedPendingSubtypeNeeds(ctx.activeProject?.id ?? null) ?? scopedLastRabNeeds(ctx.activeProject?.id ?? null);
      const subtype = needs ? getSubtype(needs.kind, param ?? null) : null;
      if (!needs || !subtype) {
        return {
          ok: false,
          message:
            'Konteks pertanyaan subtipe sudah tidak aktif. Tulis ulang kebutuhannya, misalnya "buatkan rab jalan hotmix 1 km".',
        };
      }
      const merged: RabNeeds = { ...needs, subtypeId: subtype.id, subtypeLabel: subtype.label };
      setPendingSubtypeNeeds(null);
      setLastRabNeeds(merged, ctx.activeProject?.id ?? null);
      return pathCardResult(merged);
    }

    case 'RAB_MATERIAL_SELECT': {
      // Klik tombol pada pertanyaan klarifikasi material (gerbang bahan
      // owner 2026-11-10). param = id opsi bahan dari peta
      // rabMaterialClarify, atau perintah khusus:
      //  - 'assume' → susun draft sekarang dengan asumsi terbuka;
      //  - 'reask'  → tampilkan lagi pertanyaan bahan katalog (dari
      //    jawaban "bahan belum ada template-nya").
      const pending = pendingMaterialGate;
      if (!pending) {
        return {
          ok: false,
          message:
            'Konteks pertanyaan bahan sudah tidak aktif. Tulis ulang kebutuhannya beserta bahannya, misalnya "buatkan rab rangka atap kayu 5x9".',
        };
      }
      if (param === 'reask') {
        return materialQuestionResult(pending.rawText, pending.group, pending.projectId ?? null);
      }
      if (param === 'assume') {
        pendingMaterialGate = null;
        return (
          universalResultFor(pending.rawText, undefined, MATERIAL_ASSUME_NOTE, { projectId: pending.projectId ?? null }) ?? {
            ok: false,
            message: 'Draft belum bisa disusun saat ini.',
          }
        );
      }
      const option = pending.group.options.find((o) => o.id === param);
      if (!option) {
        return {
          ok: false,
          message: 'Pilihan bahan itu tidak dikenal. Pilih lewat tombol bahan yang tersedia atau ketik bahannya.',
        };
      }
      pendingMaterialGate = null;
      // Template DIPAKSA mengikuti jawaban — draft tidak boleh jatuh ke
      // template lain (kasus owner: jawaban tidak boleh tetap standing
      // seam komersial bila yang dipilih bukan itu).
      return materialAnsweredDraft(
        pending,
        option.templateId,
        `Bahan sesuai pilihan Anda pada klarifikasi: **${option.label}** — template "{template}" dipakai mengikuti pilihan itu.`
      );
    }

    case 'RAB_PATH_TEMPLATE': {
      // Klik "Pakai template" pada kartu jalur: cocokkan subtipe ke katalog
      // template NYATA (RabTemplateService — sumber yang sama dengan menu
      // Template RAB). Katalog tidak menerima query awal dari chat, jadi
      // nama template yang cocok ditampilkan di sini + kata kunci pencarian
      // diteruskan untuk diketik di katalog. Bila TIDAK ada template yang
      // cocok: jawab jujur & arahkan ke Full AI — jangan mengarang.
      const needs = scopedLastRabNeeds(ctx.activeProject?.id ?? null);
      const subtype: RabSubtype | null = needs ? getSubtype(needs.kind, needs.subtypeId) : null;
      if (!needs || !subtype) {
        return {
          ok: false,
          message:
            'Konteks RAB-nya sudah tidak aktif. Tulis ulang kebutuhannya, misalnya "buatkan rab jalan hotmix 1 km".',
        };
      }
      const matches = findSubtypeTemplates(
        subtype,
        RabTemplateService.getInstance().getAllTemplates()
      );
      if (matches.length === 0) {
        return {
          ok: true,
          message:
            `Jujur: untuk ${needs.kindLabel ?? 'pekerjaan ini'} jenis **${subtype.label}** saat ini ` +
            '**belum ada template** di katalog EZRAB — saya tidak mengarang template. ' +
            'Jalur yang tersedia: **Full AI** (AI menyusun RAB dari kebutuhan Anda memakai data ' +
            'AHSP 2026) atau estimasi dari gambar DED.',
          actions: [
            { label: 'Full AI', action: { kind: 'intent', intent: 'RAB_FULL_AI', param: buildFullAiPrompt(needs) } },
            { label: 'Dari gambar DED', action: { kind: 'navigate', menu: 'ded-ai' } },
            { label: 'Mulai manual', action: { kind: 'navigate', menu: 'rab-estimasi' } },
          ],
        };
      }
      const shown = matches.slice(0, 6);
      const list = shown.map((tpl, i) => `${i + 1}. ${tpl.name}`).join('\n');
      const more = matches.length > shown.length ? `\n…dan ${matches.length - shown.length} template terkait lainnya.` : '';
      return {
        ok: true,
        message:
          `Ada **${matches.length} template** ${subtype.label} di katalog EZRAB:\n${list}${more}\n\n` +
          `Klik "Buka Katalog Template", lalu ketik "**${subtype.query}**" di kolom pencarian katalog — ` +
          'template di atas akan muncul dan bisa langsung diterapkan ke proyek.',
        actions: [
          { label: 'Buka Katalog Template', action: { kind: 'navigate', menu: 'template-rab' } },
          { label: 'Full AI', action: { kind: 'intent', intent: 'RAB_FULL_AI', param: buildFullAiPrompt(needs) } },
        ],
      };
    }

    case 'RAB_FULL_AI': {
      // Permintaan owner 2026-10-23: "Full AI" untuk RAB yang BISA disusun
      // dari data EZRAB dijawab dengan komposisi deterministik LANGSUNG di
      // chat — tabel lengkap + tombol Push ke Spreadsheet RAB — bukan
      // prompt prosa ke LLM. Kontrak view: hasil berkomposisi TIDAK
      // membawa fullAiPrompt (dirender sebagai jawaban biasa); fallback
      // membawa fullAiPrompt persis perilaku lama (view mengirimnya ke
      // pipeline Chat AI dengan gerbang kredit yang sama). LLM hanya
      // fallback bila komposisi tidak bisa dibuat — mis. pekerjaan infra
      // (jalan/drainase/jembatan) yang belum punya mesin parametrik.
      const rawParam = param ?? '';

      // (a) Kartu pilihan rumah aktif: susun dari teks asal + kebutuhan
      // TERKOREKSI pada kartu (pola GENERATE_RAB_TEMPLATE — pending hanya
      // dipakai bila param kosong/teks asal kartu, dan terkonsumsi hanya
      // bila komposisi berhasil).
      const p = pendingChoice;
      if (p && (rawParam === '' || rawParam === p.rawText)) {
        const built = buildDirectRab(p.rawText, p.needs);
        if (built) {
          pendingChoice = null;
          return directRabTableResult(built);
        }
      }

      // (b) Param berupa teks mentah yang bisa diparse — BUKAN prompt
      // hasil buildFullAiPrompt (teks prompt tidak boleh di-parse sebagai
      // perintah mentah): coba template tipe terdaftar, lalu spek bebas.
      if (rawParam && !isBuiltFullAiPrompt(rawParam)) {
        const built = buildDirectRab(rawParam) ?? buildSpecRab(rawParam);
        if (built) return directRabTableResult(built);
      }

      // (c) Kebutuhan terakhir berupa rumah: susun teks sintetis minimal
      // dari needs dan coba komposisi sekali lagi; hanya hasil nyata
      // yang dikembalikan.
      const n = scopedLastRabNeeds(ctx.activeProject?.id ?? null);
      if (n && n.kind === 'rumah') {
        const synthetic = syntheticHouseRawText(n);
        const built = synthetic
          ? buildDirectRab(synthetic, n) ?? buildSpecRab(synthetic)
          : null;
        if (built) return directRabTableResult(built);
      }

      // (d) Kebutuhan terakhir yang bisa dikomposisi katalog universal
      // (jalan/drainase/jembatan/gedung/MEP/dll.) — sebelum LLM fallback.
      // Ini menutup celah komentar lama "pekerjaan infra belum punya mesin
      // parametrik": mesinnya kini katalog template 180.
      const nUniversal = scopedLastRabNeeds(ctx.activeProject?.id ?? null);
      if (nUniversal) {
        const syntheticUniversal = syntheticUniversalRawText(nUniversal);
        if (syntheticUniversal) {
          // GATE 4 (5D): projectId diteruskan (lampiran DED ikut).
          const uni = universalResultFor(syntheticUniversal, undefined, undefined, { projectId: ctx.activeProject?.id ?? null });
          if (uni) return uni;
        }
      }

      // Fallback — perilaku lama PERSIS: prompt terkumpul diteruskan ke
      // view untuk dikirim ke pipeline Chat AI sebagai pesan.
      const fallbackNeeds = scopedLastRabNeeds(ctx.activeProject?.id ?? null);
      const prompt = param || (fallbackNeeds ? buildFullAiPrompt(fallbackNeeds) : '');
      return {
        ok: true,
        message: 'Menyiapkan Full AI dari kebutuhan yang terkumpul…',
        fullAiPrompt: prompt || undefined,
      };
    }

    case 'RAB_NEEDS_REFINE': {
      const refineNeeds = scopedLastRabNeeds(ctx.activeProject?.id ?? null);
      const missing = refineNeeds ? missingNeeds(refineNeeds) : [];
      return {
        ok: true,
        message: missing.length
          ? `Siap — data yang masih kurang: ${missing.join('; ')}.\nTulis jawabannya dalam satu pesan, contoh: "2 lantai, 6x15, 3 kamar tidur, 2 kamar mandi, ada carport". Ringkasan di atas akan saya perbarui — belum ada yang dibuka otomatis.`
          : 'Datanya sudah lengkap. Klik "Buka Workspace Desain & RAB" pada ringkasan di atas untuk mulai, atau koreksi langsung di chat.',
        awaitRabNeeds: missing.length > 0,
      };
    }

    case 'OPEN_DESIGN_WORKSPACE': {
      // Jalur utama ditangani view (klik tombol → requestAiEntry +
      // navigateChat('desain-rab')). Case ini adalah fallback defensif:
      // arahkan ke halaman workspace, JANGAN buka overlay dari registry.
      return {
        ok: true,
        message: 'Workspace Desain & RAB sekarang berupa halaman penuh: kebutuhan → desain → validasi → QTO → AHSP & harga → review.',
        actions: [
          { label: 'Buka Workspace Desain & RAB', action: { kind: 'navigate', menu: 'desain-rab' } },
        ],
      };
    }

    case 'START_RAB_WIZARD':
      // Kompatibilitas: jalur lama tidak lagi membuka wizard langsung dari
      // registry — tampilkan ringkasan kebutuhan terlebih dahulu.
      return rabSummaryResult(ctx.rawText ?? 'buatkan rab rumah tinggal', undefined, ctx.activeProject?.id ?? null);

    case 'START_HOUSE_DESIGN': {
      // Hanya tercapai lewat KLIK tombol (persetujuan eksplisit). Teks ketikan
      // pengguna kini diarahkan router ke CREATE_RAB_SUMMARY.
      const designPrompt = param || getLastRabDesignPrompt(ctx.activeProject?.id ?? null) || 'Buatkan rumah 1 lantai luas bangunan 90 m², ukuran 6 × 15 m, 3 kamar tidur, 2 kamar mandi, ruang tamu, dapur, dan carport.';
      return {
        ok: true,
        message: 'Membuka AI Design Studio — dari deskripsi menjadi spesifikasi, spreadsheet, lalu QTO/RAB.',
        openDesignStudio: true,
        designPrompt,
      };
    }

    case 'OPEN_SPREADSHEET':
      return {
        ok: true,
        message: 'Spreadsheet RAB tersedia di menu RAB & Estimasi. Membuka…',
        actions: [
          { label: 'Buka RAB & Spreadsheet', action: { kind: 'navigate', menu: 'rab-estimasi' } },
        ],
      };

    case 'QUERY_PROJECT_LIST': {
      if (ctx.projects.length === 0) {
        return { ok: true, message: 'Belum ada proyek. Buat proyek baru dari menu Proyek.' };
      }
      const list = ctx.projects.slice(0, 10).map((p, i) => `${i + 1}. ${p.name}`).join('\n');
      const more = ctx.projects.length > 10 ? `\n…dan ${ctx.projects.length - 10} lainnya.` : '';
      return { ok: true, message: `Daftar proyek (${ctx.projects.length}):\n${list}${more}` };
    }

    case 'QUERY_PROJECT_TOTAL': {
      if (!ctx.activeProject) {
        return {
          ok: true,
          message: 'Tidak ada proyek aktif. Buka salah satu proyek dulu, lalu tanyakan lagi.',
        };
      }
      if (ctx.projectTotal === null) {
        return {
          ok: true,
          message: `Total RAB "${ctx.activeProject.name}" belum tersedia atau belum dihitung.`,
        };
      }
      const cb = ctx.projectCostBreakdown;
      const subtotalMsg = `Subtotal langsung "${ctx.activeProject.name}": ${fmtIDR(ctx.projectTotal)}.`;
      if (!cb) return { ok: true, message: subtotalMsg };
      return {
        ok: true,
        message:
          `${subtotalMsg} Total akhir (grand total): ${fmtIDR(cb.grandTotal)} ` +
          `(sudah termasuk overhead ${cb.overheadPercent}%, profit ${cb.profitPercent}%, PPN ${cb.taxPercent}%).`,
      };
    }

    case 'CLARIFY_TOPIC': {
      // Pertanyaan telanjang/ambigu (peraturan owner 2026-10-23): tampilkan
      // kartu pilihan maksud — JANGAN menebak, JANGAN ke LLM.
      const card = clarifyTopicCard(param ?? '');
      if (!card) {
        return {
          ok: false,
          message: 'Topiknya belum jelas. Coba tulis lebih spesifik, atau ketik /help untuk daftar perintah.',
        };
      }
      return { ok: true, message: card.message, actions: card.actions };
    }

    case 'CLARIFY_PICK': {
      // Klik pilihan pada kartu klarifikasi: jawaban lokal (penjelasan)
      // atau permintaan query + awaitClarify. Jumlah analisa AHSP dibaca
      // dari repository nyata; gagal baca → kalimat tanpa angka.
      let ahspCount: number | null = null;
      try {
        const n = officialAhspRepository.size;
        if (typeof n === 'number' && n > 0) ahspCount = n;
      } catch { /* aksesor tak tersedia — tanpa angka */ }
      return clarifyPickResult(param ?? '', { ahspCount });
    }

    case 'CLARIFY_QUERY': {
      // Pesan lanjutan selama mode klarifikasi aktif (diarahkan view):
      // param = teks query, ctx.clarifyMode = mode yang menunggu.
      const query = (param ?? '').trim();
      const mode = ctx.clarifyMode ?? '';
      if (!query) {
        return {
          ok: true,
          message: 'Ketik kata kuncinya dulu — nama pekerjaan, material, atau template yang mau dicari.',
          awaitClarify: mode || undefined,
        };
      }
      switch (mode) {
        case 'ahsp':
          return clarifyAhspQueryResult(query);
        case 'harga-material':
        case 'harga-upah':
        case 'harga-alat':
          return clarifyHargaQueryResult(query, mode);
        case 'template':
          return clarifyTemplateQueryResult(query);
        default:
          return {
            ok: false,
            message: 'Mode klarifikasi sedang tidak aktif. Tulis ulang kebutuhan Anda, atau ketik /help untuk daftar perintah.',
          };
      }
    }

    case 'SEARCH_AHSP': {
      if (!param) {
        return { ok: true, message: 'Mau cari AHSP apa? Contoh: "cari ahsp pondasi batu kali".' };
      }
      const tool = EZRAB_AI_TOOLS.find((t) => t.name === 'cari_ahsp');
      if (!tool) return { ok: false, message: 'Pencarian AHSP tidak tersedia saat ini.' };
      const result = tool.invoke({ kata_kunci: param });
      // cari_ahsp sinkron; penjaga tipe karena invoke tool akun (async)
      // kini berbagi signature (Fase B) — tidak pernah terpicu di sini.
      if (typeof result !== 'string') return { ok: false, message: 'Pencarian AHSP tidak tersedia saat ini.' };
      return { ok: !result.startsWith('ERROR'), message: result };
    }

    // Remediasi Batch 1 (2026-10-28): jawaban deterministik untuk pertanyaan
    // konseptual / metodologi / how-to — tidak lewat pencarian item.
    case 'EXPLAIN_AHSP_VS_ESTIMATE': {
      return { ok: true, message: EXPLAIN_AHSP_VS_ESTIMATE_TEXT };
    }

    case 'METHODOLOGY_MISSING_AHSP': {
      return { ok: true, message: METHODOLOGY_MISSING_AHSP_TEXT };
    }

    case 'HOWTO_EXCEL_EXPORT': {
      return {
        ok: true,
        message: HOWTO_EXCEL_EXPORT_TEXT,
        // Kartu navigasi hanya PELENGKAP langkah — bukan pengganti instruksi.
        actions: [
          { label: 'Buka Laporan', action: { kind: 'nav-entry', entryId: 'laporan' } },
        ],
      };
    }

    case 'QUERY_MOST_EXPENSIVE_ITEMS':
    case 'QUERY_CHEAPEST_ITEMS': {
      const cheapest = intent === 'QUERY_CHEAPEST_ITEMS';
      if (!ctx.activeProject) {
        return { ok: true, message: 'Tidak ada proyek aktif. Buka salah satu proyek dulu, lalu tanyakan lagi.' };
      }
      const items = (ctx.projectItems ?? []).filter(
        (it) => it.priceStatus === 'PRICE_RESOLVED' && it.totalPrice > 0
      );
      if (items.length === 0) {
        return {
          ok: true,
          message:
            `Proyek "${ctx.activeProject.name}" belum memiliki item RAB berharga. ` +
            `Tambahkan item dan harga satuannya dulu di menu RAB & Estimasi, lalu tanyakan lagi.`,
        };
      }
      const sorted = [...items].sort((a, b) =>
        cheapest ? a.totalPrice - b.totalPrice : b.totalPrice - a.totalPrice
      );
      const top = sorted.slice(0, 5);
      const label = cheapest ? 'termurah' : 'termahal';
      const lines = top.map(
        (it, i) =>
          `${i + 1}. ${it.description} — ${fmtIDR(it.totalPrice)}` +
          (it.unitPrice ? ` (${it.volume} ${it.unit} × ${fmtIDR(it.unitPrice)})` : '')
      );
      // Harga satuan tertinggi bisa beda item dengan total tertinggi — sebutkan bila beda.
      const byUnit = [...items]
        .filter((it) => (it.unitPrice ?? 0) > 0)
        .sort((a, b) => (b.unitPrice ?? 0) - (a.unitPrice ?? 0))[0];
      let extra = '';
      if (!cheapest && byUnit && top[0] && byUnit.description !== top[0].description) {
        extra = `\n\nHarga satuan tertinggi: ${byUnit.description} — ${fmtIDR(byUnit.unitPrice ?? 0)}/${byUnit.unit}.`;
      }
      return {
        ok: true,
        message:
          `Item ${label} di proyek "${ctx.activeProject.name}" (berdasarkan total harga):\n${lines.join('\n')}${extra}`,
      };
    }

    default:
      return { ok: false, message: 'Perintah tidak dikenali. Ketik /help untuk daftar perintah.' };
  }
}

/* ------------------------------------------------------------------ */
/* Lengkapi dengan Full AI — budget-based RAB (§5, 2026-11-22).        */
/*                                                                     */
/* Entri ASYNC baru (di luar executeIntent yang SINKRON — completion   */
/* butuh panggilan AI sehingga tidak bisa hidup di registry sinkron).  */
/* Dipanggil view dari tombol "Lengkapi dengan Full AI" + trigger teks */
/* follow-up. Urutan: draft universal aktif → hasil direct aktif →    */
/* rebuild dari teks (hanya bila tak ada draft aktif yang bisa        */
/* dilengkapi). Gerbang Q7: v1 HANYA request ber-budget.              */
/*                                                                     */
/* Kejujuran:                                                          */
/* - Universal: isian ditulis kembali ke item generasi draft (kontrak  */
/*   transfer yang ada menangani PRICE_ESTIMATED + NEEDS_VERIFICATION  */
/*   tanpa perubahan kode); harga manual revisi TETAP menang. Revisi   */
/*   meregenerasi part sehingga isian gugur secara jujur (§2.4 v1).    */
/* - Direct: calc.items ASLI tidak diubah; salinan terisi tinggal di  */
/*   fullAiCompletion dan IKUT ter-push sebagai PRICE_ESTIMATED +      */
/*   NEEDS_VERIFICATION + EZRAB_ASSUMPTION (Batch 4 §7.2 — mapper      */
/*   push menggabungkan isian; sebelumnya display-only karena          */
/*   payload push tidak bisa membedakan harga AI dari harga resmi).    */
/* - AI gagal → jawaban adalah draft parsial ASLI + baris warning      */
/*   jujur; tidak ada harga yang dikarang.                             */
/* ------------------------------------------------------------------ */

/** Deps gateway produksi untuk completion (tanpa kode metering klien). */
function defaultBudgetFullAiDeps(): ChatRabCompletionDeps {
  return {
    execute: (req) => aiToolsProviderClient.execute(req),
    productId: 'EZRAB_AI',
  };
}

export interface ExecuteBudgetFullAiRabOptions {
  /** Target eksplisit dari tombol (tanpa ini: universal dulu, lalu direct). */
  target?: 'universal' | 'direct';
  /** Deps injeksi (tes memakai stub execute — tanpa live gateway). */
  deps?: ChatRabCompletionDeps;
}

const BUDGET_FULL_AI_ACTIONS_UNIVERSAL: ChatActionButton[] = [
  { label: 'Push ke Spreadsheet', action: { kind: 'push-universal' } },
  { label: 'Buka Spreadsheet RAB', action: { kind: 'navigate', menu: 'rab-estimasi' } },
];

const BUDGET_FULL_AI_ACTIONS_DIRECT: ChatActionButton[] = [
  { label: 'Push ke Spreadsheet RAB', action: { kind: 'push-rab' } },
  { label: 'Buka Spreadsheet RAB', action: { kind: 'navigate', menu: 'rab-estimasi' } },
  { label: 'Buka Workspace Desain & RAB', action: { kind: 'navigate', menu: 'desain-rab' } },
];

/* ------------------------------------------------------------------ */
/* P1-08 (H-12) — Accept-before-persist penuh (Fast Track).            */
/*                                                                     */
/* SEBELUM Fast Track (P1 minimal): completeUniversalDraftWithFullAi   */
/* bermutasi di tempat dan pemanggil langsung autosave — isian AI      */
/* tersimpan tanpa langkah terima; P1 hanya menambah snapshot pra-     */
/* completion + tombol "Batalkan lengkapan" + baris pemberitahuan.     */
/*                                                                     */
/* SESUDAH Fast Track: completion TIDAK PERNAH menyentuh draft live.   */
/* Isian ditulis ke KLON (universal) / salinan terisi tertunda         */
/* (direct) yang disimpan di slot pending di bawah; pesan hasil       */
/* adalah PRATINJAU dengan tombol "Terima lengkapan" / "Buang          */
/* lengkapan". HANYA "Terima" yang menukar draft live dengan klon     */
/* terisi (acceptFullAiCompletion) — dan pemanggil (view) yang         */
/* meng-autosave sesudah terima, pola yang sama dengan undo. "Buang"   */
/* hanya membuang klon tertunda; draft live tidak berubah.             */
/*                                                                     */
/* Snapshot pra-terima (untuk "Batalkan lengkapan") diambil SAAT      */
/* TERIMA dari draft live saat itu — bukan saat completion — sehingga  */
/* undo mengembalikan keadaan sesaat sebelum terima. Undo tetap ada    */
/* sebagai jaring pengaman sesudah terima. Slot pending + snapshot     */
/* hanya hidup di memori (reload halaman menghilangkannya — sama       */
/* seperti slot konfirmasi perintah langsung).                         */
/* ------------------------------------------------------------------ */

/** Baris pemberitahuan eksplisit di pesan hasil SETELAH terima (P1-08). */
export const FULL_AI_COMPLETION_NOTICE =
  'Catatan: draft ini tersimpan dengan harga isian AI (estimasi — berlabel "Perlu verifikasi", bukan harga resmi). Tekan "Batalkan lengkapan" untuk mengembalikan draft ke keadaan sebelum dilengkapi.';

/** Baris pemberitahuan di pesan PRATINJAU (belum diterapkan, belum tersimpan). */
export const FULL_AI_COMPLETION_PREVIEW_NOTICE =
  'Pratinjau — lengkapan ini BELUM diterapkan dan BELUM tersimpan. Tekan "Terima lengkapan" untuk menerapkan harga isian AI ke draft (estimasi — berlabel "Perlu verifikasi", bukan harga resmi), atau "Buang lengkapan" untuk membuangnya tanpa mengubah draft. Pratinjau ini berlaku 10 menit; bila draft berubah sesudahnya, terima ditolak dan lengkapan perlu dijalankan ulang pada draft terbaru.';

interface FullAiCompletionSnapshot {
  /** Id draft universal yang di-snapshot (ikatan validasi restore). */
  draftId: string;
  /** Proyek pengikat draft saat snapshot (null = tak terikat). */
  projectId: string | null;
  /** Klon dalam draft SEBELUM mutasi completion. */
  draft: UniversalDraft;
}

/** Lengkapan universal yang MENUNGGU keputusan terima/buang. */
interface PendingUniversalFullAiCompletion {
  /** Id draft live yang dilengkapi (ikatan validasi terima). */
  draftId: string;
  /** Klon draft TERISI — BUKAN draft live. */
  draft: UniversalDraft;
  /** Ringkasan completion (dipakai ulang di pesan sesudah terima). */
  summary: FullAiCompletionSummary;
  /** Fast Track Continuation A2 — Date.now() saat pratinjau dibuat
   *  (dasar TTL 10 menit, standar yang sama dengan konfirmasi lain). */
  createdAt: number;
  /** A2 — draftFingerprint(draft live) saat proposal: terima menolak
   *  bila draft live berubah sesudahnya (tanpa ini terima menimpa
   *  diam-diam edit interim pada draft live dengan klon basi). */
  draftFingerprint: string;
}

/** Lengkapan direct yang MENUNGGU keputusan terima/buang. */
interface PendingDirectFullAiCompletion {
  /** Hasil direct yang dilengkapi (ikatan identitas terima). */
  direct: DirectRabResult;
  /** Salinan terisi (calc.items asli tidak pernah diubah). */
  completion: DirectRabFullAiCompletion;
  /** A2 — Date.now() saat pratinjau dibuat (dasar TTL 10 menit). */
  createdAt: number;
  /** A2 — directPushFingerprint(hasil live) saat proposal: terima
   *  menolak bila hasil live berubah sesudahnya. */
  resultFingerprint: string;
}

let lastFullAiCompletionSnapshot: FullAiCompletionSnapshot | null = null;
/** Hasil direct terakhir yang dilengkapi (undo = hapus fullAiCompletion;
 *  calc.items asli tidak pernah diubah — lihat completeDirectRabWithFullAi). */
let lastDirectFullAiCompleted: DirectRabResult | null = null;
/** Lengkapan yang menunggu "Terima lengkapan" / "Buang lengkapan". */
let pendingUniversalCompletion: PendingUniversalFullAiCompletion | null = null;
let pendingDirectCompletion: PendingDirectFullAiCompletion | null = null;

/** Khusus pengujian: buang snapshot/penanda completion (isolasi antar cek). */
export function __clearFullAiCompletionSnapshotForTests(): void {
  lastFullAiCompletionSnapshot = null;
  lastDirectFullAiCompleted = null;
  pendingUniversalCompletion = null;
  pendingDirectCompletion = null;
}

/** Khusus pengujian: apakah ada snapshot/penanda completion yang tersimpan. */
export function __hasFullAiCompletionSnapshotForTests(): boolean {
  return lastFullAiCompletionSnapshot !== null || lastDirectFullAiCompleted !== null;
}

/** Khusus pengujian: apakah ada lengkapan yang menunggu diterima/dibuang. */
export function __hasPendingFullAiCompletionForTests(target: 'universal' | 'direct'): boolean {
  return target === 'universal' ? pendingUniversalCompletion !== null : pendingDirectCompletion !== null;
}

/** Khusus pengujian: klon terisi yang tertunda (universal) — null bila tidak ada. */
export function __getPendingUniversalCompletionForTests(): UniversalDraft | null {
  return pendingUniversalCompletion ? pendingUniversalCompletion.draft : null;
}

/** Khusus pengujian: salinan terisi yang tertunda (direct) — null bila tidak ada. */
export function __getPendingDirectCompletionForTests(): DirectRabFullAiCompletion | null {
  return pendingDirectCompletion ? pendingDirectCompletion.completion : null;
}

/** Tombol terima/buang pada pesan pratinjau completion. */
function fullAiCompletionPreviewActions(target: 'universal' | 'direct'): ChatActionButton[] {
  return [
    { label: 'Terima lengkapan', action: { kind: 'budget-full-ai-accept', target } },
    { label: 'Buang lengkapan', action: { kind: 'budget-full-ai-discard', target } },
  ];
}

/**
 * P1-08 (H-12) — "Terima lengkapan": terapkan lengkapan tertunda ke
 * draft live. SATU-SATUNYA titik di mana isian AI menyentuh draft
 * live (dan, lewat autosave pemanggil, tersimpan).
 *
 * - universal: validasi ikatan (draft live harus draft yang SAMA —
 *   id cocok; bila draft sudah berganti, terima DITOLAK jujur dan
 *   pending DIPERTAHANKAN — pengguna bisa kembali ke draft itu lalu
 *   menerima); snapshot pra-terima diambil dari draft live SAAT
 *   TERIMA (untuk undo); klon terisi ditukar masuk lewat
 *   setLastUniversalDraft (ikatan proyek saat terima dipertahankan).
 * - direct: validasi identitas (hasil direct live harus hasil yang
 *   SAMA — referensi identik); fullAiCompletion ditempelkan ke hasil
 *   live; penanda undo diset.
 *
 * Fast Track Continuation A2 — dua validasi tambahan (standar yang
 * sama dengan konfirmasi lain):
 * - TTL 10 menit: pratinjau kedaluwarsa DITOLAK dan slot DIHAPUS
 *   (pengguna menjalankan ulang completion pada draft terbaru).
 * - Kebasi isi: draft/hasil live yang BERUBAH sesudah proposal
 *   (sidik isi beda) DITOLAK dan pending DIPERTAHANKAN — tanpa ini
 *   terima menimpa diam-diam edit interim pada draft live dengan
 *   klon yang dibangun dari keadaan lama. Penolakan kebasi sama
 *   polanya dengan penolakan draft-berganti di atas.
 *
 * Pemanggil (view) bertanggung jawab atas autosave sesudah terima
 * (universal) — pola yang sama dengan completion lama / undo.
 */
export function acceptFullAiCompletion(target: 'universal' | 'direct', now: number = Date.now()): ActionResult {
  if (target === 'direct') {
    const pending = pendingDirectCompletion;
    if (!pending) {
      return {
        ok: false,
        message: 'Tidak ada lengkapan Full AI yang menunggu untuk hasil direct ini — mungkin sudah diterima/dibuang, atau sesi dimuat ulang.',
      };
    }
    if (now > pending.createdAt + DIRECT_COMMAND_CONFIRM_TTL_MS) {
      pendingDirectCompletion = null;
      return {
        ok: false,
        message: 'Pratinjau lengkapan Full AI ini sudah kedaluwarsa (lebih dari 10 menit) — tidak diterapkan. Jalankan "Lengkapi dengan Full AI" lagi pada hasil yang aktif untuk lengkapan terbaru.',
      };
    }
    const live = getLastDirectRab();
    if (!live || live !== pending.direct) {
      return {
        ok: false,
        message: 'Hasil direct sudah berganti sejak dilengkapi — lengkapan tertunda tidak diterapkan agar tidak menyentuh hasil yang berbeda. Jalankan "Lengkapi dengan Full AI" lagi pada hasil yang aktif.',
      };
    }
    if (directPushFingerprint(live) !== pending.resultFingerprint) {
      return {
        ok: false,
        message: 'Hasil direct berubah sejak dilengkapi (nilai/item berubah) — lengkapan tertunda tidak diterapkan agar tidak menimpa perubahan itu. Jalankan "Lengkapi dengan Full AI" lagi pada hasil terbaru.',
      };
    }
    live.fullAiCompletion = pending.completion;
    lastDirectFullAiCompleted = live;
    pendingDirectCompletion = null;
    return {
      ok: true,
      message: `${formatDirectRabMessage(live)}\n\n${FULL_AI_COMPLETION_NOTICE}`,
      actions: [
        ...BUDGET_FULL_AI_ACTIONS_DIRECT,
        { label: 'Batalkan lengkapan', action: { kind: 'budget-full-ai-undo', target: 'direct' } },
      ],
    };
  }
  const pending = pendingUniversalCompletion;
  if (!pending) {
    return {
      ok: false,
      message: 'Tidak ada lengkapan Full AI yang menunggu untuk draft ini — mungkin sudah diterima/dibuang, atau sesi dimuat ulang.',
    };
  }
  if (now > pending.createdAt + DIRECT_COMMAND_CONFIRM_TTL_MS) {
    pendingUniversalCompletion = null;
    return {
      ok: false,
      message: 'Pratinjau lengkapan Full AI ini sudah kedaluwarsa (lebih dari 10 menit) — tidak diterapkan. Jalankan "Lengkapi dengan Full AI" lagi pada draft yang aktif untuk lengkapan terbaru.',
    };
  }
  const live = getLastUniversalDraft();
  if (!live || live.id !== pending.draftId) {
    return {
      ok: false,
      message: 'Draft aktif sudah berganti sejak dilengkapi — lengkapan tertunda tidak diterapkan agar tidak menimpa draft yang berbeda. Jalankan "Lengkapi dengan Full AI" lagi pada draft yang aktif.',
    };
  }
  if (draftFingerprint(live) !== pending.draftFingerprint) {
    return {
      ok: false,
      message: 'Draft berubah sejak dilengkapi (item/nilai berubah) — lengkapan tertunda tidak diterapkan agar tidak menimpa perubahan itu. Jalankan "Lengkapi dengan Full AI" lagi pada draft terbaru.',
    };
  }
  // Snapshot pra-terima — dari draft live SAAT TERIMA (bukan saat
  // completion: draft bisa berubah di antaranya; undo mengembalikan
  // keadaan sesaat sebelum terima).
  lastFullAiCompletionSnapshot = {
    draftId: live.id,
    projectId: getLastUniversalDraftProjectId(),
    draft: JSON.parse(JSON.stringify(live)) as UniversalDraft,
  };
  const accepted = JSON.parse(JSON.stringify(pending.draft)) as UniversalDraft;
  setLastUniversalDraft(accepted, getLastUniversalDraftProjectId());
  pendingUniversalCompletion = null;
  return {
    ok: true,
    message: `${formatUniversalDraftMessage(accepted, { fullAiCompletion: pending.summary })}\n\n${FULL_AI_COMPLETION_NOTICE}`,
    actions: [
      ...BUDGET_FULL_AI_ACTIONS_UNIVERSAL,
      { label: 'Batalkan lengkapan', action: { kind: 'budget-full-ai-undo', target: 'universal' } },
    ],
  };
}

/**
 * P1-08 (H-12) — "Buang lengkapan": buang lengkapan tertunda. Draft
 * live TIDAK BERUBAH (klon/salinan terisi hanya hidup di memori).
 * Tidak butuh gerbang kapabilitas (tidak ada tulis apa pun).
 */
export function discardFullAiCompletion(target: 'universal' | 'direct'): ActionResult {
  if (target === 'direct') {
    const pending = pendingDirectCompletion;
    if (!pending) {
      return {
        ok: false,
        message: 'Tidak ada lengkapan Full AI yang menunggu untuk hasil direct ini — mungkin sudah diterima/dibuang, atau sesi dimuat ulang.',
      };
    }
    pendingDirectCompletion = null;
    return {
      ok: true,
      message: `Lengkapan Full AI untuk "${pending.direct.displayLabel}" dibuang — hasil direct tidak berubah (harga isian AI tidak diterapkan).`,
    };
  }
  const pending = pendingUniversalCompletion;
  if (!pending) {
    return {
      ok: false,
      message: 'Tidak ada lengkapan Full AI yang menunggu untuk draft ini — mungkin sudah diterima/dibuang, atau sesi dimuat ulang.',
    };
  }
  pendingUniversalCompletion = null;
  return {
    ok: true,
    message: `Lengkapan Full AI untuk "${pending.draft.title}" dibuang — draft tidak berubah (harga isian AI tidak diterapkan).`,
  };
}

/**
 * P1-08 (H-12) — "Batalkan lengkapan": kembalikan draft ke keadaan
 * sebelum completion Full AI.
 *
 * - universal: pulihkan snapshot pra-completion ke draft aktif
 *   (setLastUniversalDraft) — validasi ikatan: draft aktif harus draft
 *   yang SAMA (id cocok); bila draft sudah direvisi / diganti sesudah
 *   completion, restore DITOLAK jujur (tidak pernah menimpa draft yang
 *   berbeda). Snapshot sekali pakai (dihapus sesudah restore).
 * - direct: hapus fullAiCompletion (calc.items asli tidak pernah
 *   diubah — undo = buang salinan terisi).
 *
 * Pemanggil (view) bertanggung jawab atas autosave sesudah restore —
 * pola yang sama dengan completion (caller autosaves).
 */
export function undoFullAiCompletion(target: 'universal' | 'direct'): ActionResult {
  if (target === 'direct') {
    const direct = lastDirectFullAiCompleted;
    if (!direct || !direct.fullAiCompletion) {
      return {
        ok: false,
        message: 'Tidak ada lengkapan Full AI yang bisa dibatalkan untuk draft direct ini — mungkin sudah dibatalkan, atau draftnya sudah berganti.',
      };
    }
    delete direct.fullAiCompletion;
    lastDirectFullAiCompleted = null;
    return {
      ok: true,
      message: `Lengkapan Full AI untuk "${direct.displayLabel}" dibatalkan — tabel kembali ke harga database (harga isian AI dibuang).`,
    };
  }
  const snap = lastFullAiCompletionSnapshot;
  if (!snap) {
    return {
      ok: false,
      message: 'Tidak ada snapshot pra-lengkapan — mungkin completion belum pernah jalan, atau lengkapan sudah dibatalkan.',
    };
  }
  const live = getLastUniversalDraft();
  if (!live || live.id !== snap.draftId) {
    return {
      ok: false,
      message: 'Draft aktif sudah berganti sejak dilengkapi — snapshot tidak dipulihkan agar tidak menimpa draft yang berbeda. Draft saat ini tetap berlaku.',
    };
  }
  const restored = JSON.parse(JSON.stringify(snap.draft)) as UniversalDraft;
  setLastUniversalDraft(restored, snap.projectId);
  lastFullAiCompletionSnapshot = null;
  return {
    ok: true,
    message: `Lengkapan Full AI dibatalkan — draft "${restored.title}" dikembalikan ke keadaan sebelum dilengkapi (harga isian AI dibuang; harga database tetap).`,
  };
}

async function completeUniversalDraftWithFullAi(
  draft: UniversalDraft,
  args: { quality: string | null; deps: ChatRabCompletionDeps },
): Promise<ActionResult> {
  // Fast Track (P1-08 penuh): lengkapan yang sudah menunggu untuk
  // draft yang sama diajukan ulang TANPA memanggil AI lagi.
  // A2: ajuan-ulang HANYA bila pending masih segar (dalam TTL) DAN
  // draft live tidak berubah sejak proposal — pending kedaluwarsa /
  // basi DIBUANG dan completion segar dijalankan dari draft terbaru
  // (mengajukan ulang klon basi akan menampilkan nilai yang tidak
  // lagi cocok dengan draft live).
  const existing = pendingUniversalCompletion;
  if (existing && existing.draftId === draft.id) {
    const fresh =
      Date.now() <= existing.createdAt + DIRECT_COMMAND_CONFIRM_TTL_MS
      && draftFingerprint(draft) === existing.draftFingerprint;
    if (fresh) {
      return {
        ok: true,
        message: `${formatUniversalDraftMessage(existing.draft, { fullAiCompletion: existing.summary })}\n\n${FULL_AI_COMPLETION_PREVIEW_NOTICE}`,
        actions: fullAiCompletionPreviewActions('universal'),
      };
    }
    pendingUniversalCompletion = null;
  }
  const eff = effectiveItems(draft);
  const budgetCap = draft.spec.budgetCap;
  const result = await completeBudgetRabWithFullAi({
    items: eff.map((it) => ({
      description: it.description,
      category: it.category,
      group: it.__partScope,
      volume: it.volume,
      unit: it.unit,
      unitPrice: it.unitPrice,
      priceStatus: it.priceStatus,
      priceSourceKind: it.priceSourceKind,
      ahspCode: it.ahspCode,
      notes: it.notes,
      formula: it.calculationFormula,
    })),
    budgetCap,
    quality: args.quality,
    region: draft.spec.location,
    projectType: draft.title,
    projectLabel: draft.title,
    deps: args.deps,
  });
  if (result.failed) {
    return {
      ok: true,
      message:
        `${formatUniversalDraftMessage(draft)}\n\nLengkapi dengan Full AI gagal: ${result.failureMessage ?? 'AI gagal memproses'} — draft parsial di atas tetap berlaku, tidak ada harga yang dikarang.`,
      actions: BUDGET_FULL_AI_ACTIONS_UNIVERSAL,
    };
  }
  // Fast Track (P1-08 penuh) — complete ke dalam KLON: draft live
  // TIDAK disentuh sampai user menekan "Terima lengkapan". Klon dalam
  // via JSON (UniversalDraft JSON-pure). Snapshot pra-terima diambil
  // NANTI, saat terima (acceptFullAiCompletion) — bukan di sini.
  const completed = JSON.parse(JSON.stringify(draft)) as UniversalDraft;
  // Tulis kembali isian ke item generasi KLON (berdasarkan id efektif
  // `${templateId}::${id}` — effectiveItems memakai kunci yang sama).
  // Harga manual revisi TETAP menang (tidak ditimpa); item yang dihapus
  // dari draft tidak ada di peta sehingga tidak tersentuh.
  const completedById = new Map(result.items.map((it, idx) => [eff[idx].id, it]));
  for (const part of completed.parts) {
    for (const gen of part.generation.items) {
      if (part.manualPrices[itemKey(gen)]) continue;
      const done = completedById.get(`${part.template.id}::${gen.id}`);
      if (!done) continue;
      if (done.priceStatus === 'PRICE_ESTIMATED') {
        gen.unitPrice = done.unitPrice;
        gen.amount = done.amount ?? null;
        gen.totalPrice = done.totalPrice ?? null;
        gen.priceStatus = 'PRICE_ESTIMATED';
        gen.priceSourceKind = 'EZRAB_ASSUMPTION';
        gen.priceSourceLabel = done.priceSourceLabel;
        gen.priceSourceExplanation = done.priceSourceExplanation;
        gen.verificationStatus = 'NEEDS_VERIFICATION';
      }
      if (typeof done.volume === 'number' && done.volume !== gen.volume) {
        gen.volume = done.volume;
        gen.volumeSource = 'AI_GENERATED';
      }
      if (done.notes && done.notes !== gen.notes) gen.notes = done.notes;
    }
  }
  const summary = buildFullAiCompletionSummary(result, budgetCap);
  pendingUniversalCompletion = {
    draftId: draft.id,
    draft: completed,
    summary,
    createdAt: Date.now(),
    draftFingerprint: draftFingerprint(draft),
  };
  return {
    ok: true,
    message: `${formatUniversalDraftMessage(completed, { fullAiCompletion: summary })}\n\n${FULL_AI_COMPLETION_PREVIEW_NOTICE}`,
    actions: fullAiCompletionPreviewActions('universal'),
  };
}

async function completeDirectRabWithFullAi(
  direct: DirectRabResult,
  args: { budgetCap: number; quality: string | null; deps: ChatRabCompletionDeps },
): Promise<ActionResult> {
  // Fast Track (P1-08 penuh): lengkapan yang sudah menunggu untuk
  // hasil yang sama diajukan ulang TANPA memanggil AI lagi.
  // A2: ajuan-ulang HANYA bila pending masih segar (dalam TTL) DAN
  // hasil live tidak berubah sejak proposal — pending kedaluwarsa /
  // basi DIBUANG dan completion segar dijalankan dari hasil terbaru.
  const existing = pendingDirectCompletion;
  if (existing && existing.direct === direct) {
    const fresh =
      Date.now() <= existing.createdAt + DIRECT_COMMAND_CONFIRM_TTL_MS
      && directPushFingerprint(direct) === existing.resultFingerprint;
    if (fresh) {
      return {
        ok: true,
        message: `${formatDirectRabMessage({ ...direct, fullAiCompletion: existing.completion })}\n\n${FULL_AI_COMPLETION_PREVIEW_NOTICE}`,
        actions: fullAiCompletionPreviewActions('direct'),
      };
    }
    pendingDirectCompletion = null;
  }
  const calcItems = direct.calc.items;
  const result = await completeBudgetRabWithFullAi({
    items: calcItems.map((it) => ({
      description: it.name,
      category: it.category,
      volume: it.volume,
      unit: it.unit,
      // Engine memakai unitPrice 0 = belum ada harga (bukan null).
      unitPrice:
        typeof it.unitPrice === 'number' && Number.isFinite(it.unitPrice) && it.unitPrice > 0
          ? it.unitPrice
          : null,
      priceStatus: it.priceStatus,
      // Total baris engine dibawa (lihat AdaptableChatItem.totalPrice):
      // tanpa ini total completion meleset pecahan rupiah dari Σ
      // totalPrice yang dirender tabel.
      totalPrice: it.totalPrice,
    })),
    budgetCap: args.budgetCap,
    quality: args.quality,
    region: direct.region,
    projectType: direct.displayLabel,
    projectLabel: direct.displayLabel,
    deps: args.deps,
    useLineTotals: true,
  });
  if (result.failed) {
    return {
      ok: true,
      message:
        `${formatDirectRabMessage(direct)}\n\nLengkapi dengan Full AI gagal: ${result.failureMessage ?? 'AI gagal memproses'} — tabel parsial di atas tetap berlaku, tidak ada harga yang dikarang.`,
      actions: BUDGET_FULL_AI_ACTIONS_DIRECT,
    };
  }
  // Salinan terisi (calc.items ASLI tidak diubah — lihat fullAiCompletion).
  const completedItems = calcItems.map((it, idx) => {
    const done = result.items[idx];
    if (!done) return it;
    const volumeChanged = typeof done.volume === 'number' && done.volume !== it.volume;
    if (done.priceStatus === 'PRICE_ESTIMATED') {
      return {
        ...it,
        unitPrice: done.unitPrice ?? it.unitPrice,
        totalPrice: done.totalPrice ?? it.totalPrice,
        volume: typeof done.volume === 'number' ? done.volume : it.volume,
      };
    }
    if (volumeChanged) {
      return {
        ...it,
        volume: done.volume as number,
        totalPrice:
          typeof it.unitPrice === 'number' && it.unitPrice > 0
            ? Math.round((done.volume as number) * it.unitPrice)
            : it.totalPrice,
      };
    }
    return it;
  });
  // Fast Track (P1-08 penuh) — salinan terisi DITAHAN di slot pending:
  // TIDAK ditempelkan ke hasil live sampai user menekan "Terima
  // lengkapan" (acceptFullAiCompletion). Pesan pratinjau diformat dari
  // salinan dangkal hasil + completion tertunda (formatter hanya
  // membaca — hasil live tidak berubah).
  const completion: DirectRabFullAiCompletion = {
    items: completedItems,
    summary: buildFullAiCompletionSummary(result, args.budgetCap),
  };
  pendingDirectCompletion = {
    direct,
    completion,
    createdAt: Date.now(),
    resultFingerprint: directPushFingerprint(direct),
  };
  return {
    ok: true,
    message: `${formatDirectRabMessage({ ...direct, fullAiCompletion: completion })}\n\n${FULL_AI_COMPLETION_PREVIEW_NOTICE}`,
    actions: fullAiCompletionPreviewActions('direct'),
  };
}

export async function executeBudgetFullAiRab(
  rawText: string,
  ctx: ChatActionContext,
  opts?: ExecuteBudgetFullAiRabOptions,
): Promise<ActionResult> {
  const projectId = ctx.activeProject?.id ?? null;
  const deps = opts?.deps ?? defaultBudgetFullAiDeps();
  const lastSpec = getLastRabIntentSpec();
  const textSpec = rawText ? extractRabIntentSpec(rawText) : null;
  const quality = lastSpec?.quality ?? textSpec?.quality ?? null;
  const noDraft: ActionResult = {
    ok: true,
    message:
      'Tidak ada draft RAB parsial dengan budget yang bisa saya lengkapi saat ini. Susun dulu draft RAB dengan menyebutkan budget (mis. "buatkan RAB rumah 2 lantai, budget 200 juta"), lalu klik "Lengkapi dengan Full AI" pada jawaban draftnya — atau ketik "lengkapi dengan full ai".',
  };
  try {
    // 1. Draft universal aktif (target default / eksplisit universal).
    if (opts?.target !== 'direct') {
      const draft = getLastUniversalDraft(projectId);
      if (draft && draft.spec.budgetCap != null) {
        const eff = effectiveItems(draft);
        if (eff.some((it) => !isPriceValidForTotal(it))) {
          return await completeUniversalDraftWithFullAi(draft, { quality, deps });
        }
      }
    }
    // 2. Hasil direct aktif (parametrik/spec).
    if (opts?.target !== 'universal') {
      const direct = getLastDirectRab();
      const budgetCap =
        lastSpec?.budgetIdr ??
        textSpec?.budgetIdr ??
        (rawText ? extractUniversalSpec(rawText).budgetCap : null);
      if (direct && !direct.fullAiCompletion && budgetCap != null) {
        const hasUnpriced = direct.calc.items.some(
          (it) =>
            !(typeof it.unitPrice === 'number' && Number.isFinite(it.unitPrice) && it.unitPrice > 0),
        );
        if (hasUnpriced) {
          return await completeDirectRabWithFullAi(direct, { budgetCap, quality, deps });
        }
      }
    }
    // 3. Rebuild dari teks — hanya bila tak ada draft aktif yang bisa
    // dilengkapi (mis. trigger teks tanpa draft aktif). Memakai komposisi
    // sinkron yang sama dengan jalur normal (bukan duplikasi routing).
    if (rawText.trim()) {
      if (opts?.target !== 'universal') {
        const flow = runRabIntentFlow(rawText, { hijacked: specRabHijackGuard(rawText) });
        if (flow.built) {
          const budgetCap = flow.evaluation.spec.budgetIdr ?? textSpec?.budgetIdr ?? null;
          if (budgetCap != null) {
            return await completeDirectRabWithFullAi(flow.built, {
              budgetCap,
              quality: flow.evaluation.spec.quality ?? quality,
              deps,
            });
          }
        }
      }
      if (opts?.target !== 'direct') {
        const uni = buildUniversalDraft(rawText, undefined, { projectId });
        if (uni.kind === 'draft' && uni.draft.spec.budgetCap != null) {
          const eff = effectiveItems(uni.draft);
          if (eff.some((it) => !isPriceValidForTotal(it))) {
            return await completeUniversalDraftWithFullAi(uni.draft, { quality, deps });
          }
        }
      }
    }
    return noDraft;
  } catch (e) {
    return {
      ok: false,
      message: `Lengkapi dengan Full AI gagal: ${e instanceof Error ? e.message : 'kesalahan tak dikenal'} — draft parsial tetap berlaku, tidak ada harga yang dikarang.`,
    };
  }
}

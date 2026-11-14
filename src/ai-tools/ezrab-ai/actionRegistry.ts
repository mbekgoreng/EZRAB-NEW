/**
 * EZRAB AI — Action Registry (src/ai-tools/ezrab-ai/actionRegistry.ts)
 *
 * Maps intents to REAL application actions. Navigation goes through the
 * injected navigator (WorkspaceView.setActiveMenu). Read actions use the
 * injected project snapshot. No fabricated results: every action returns
 * what actually happened.
 */

import { ChatIntent } from './intentRouter';
import { EZRAB_AI_TOOLS } from './tools';
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
import { searchChatAhsp, formatChatAhspResult } from './chatSearch';
import {
  EXPLAIN_AHSP_VS_ESTIMATE_TEXT,
  METHODOLOGY_MISSING_AHSP_TEXT,
  HOWTO_EXCEL_EXPORT_TEXT,
} from './chatExplanations';
import { clarifyTopicCard, clarifyPickResult } from './clarifyTopics';
import { evaluateCalculation } from './calcIntent';
import { findGamesMentioned, buildGameInfoAnswer } from '../../game-space/catalog';
import { buildDirectRab, displayTemplateBasisName, findDirectTemplate, formatDirectRabMessage, matchDirectRegion } from './directRab';
import { buildSpecRab, buildSpecRabFromNeeds } from './specRab';
import { buildUniversalDraft, formatUniversalDraftMessage, extractUniversalSpec, getLastUniversalDraft } from './universalRab';
import { saveIntakeContext, clearIntakeContext } from './draftPersistence';
import { captureFeedback } from './constructionFeedback';

export interface ChatActionContext {
  /** Navigate to a menu id (WorkspaceView.setActiveMenu) */
  navigate: (menu: string) => void;
  /** Teks mentah pesan pengguna saat ini (untuk ekstraksi kebutuhan RAB) */
  rawText?: string;
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
    | { kind: 'push-universal' }
    | { kind: 'push-universal-confirm' }
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
     * dijawab jujur (bukan diterapkan dua kali). */
    | { kind: 'qto-correction-confirm'; correctionId: string }
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
/* ------------------------------------------------------------------ */
let lastRabNeeds: RabNeeds | null = null;
let lastRabRaw = '';

export function getLastRabDesignPrompt(): string | null {
  if (!lastRabNeeds) return null;
  return buildDesignPrompt(lastRabNeeds, lastRabRaw);
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
export function tryContinueRabSubtype(text: string): ActionResult | null {
  const pending = pendingSubtypeNeeds;
  if (!pending) return null;
  const det = detectSubtypeFromText(pending.kind, text);
  if (!det) return null;
  // Gabungkan kebutuhan lain yang ikut disebut (mis. "hotmix, panjang 2 km").
  const merged = extractRabNeeds(text, { ...pending });
  merged.subtypeId = det.id;
  merged.subtypeLabel = det.label;
  pendingSubtypeNeeds = null;
  lastRabNeeds = merged;
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
  lastRabNeeds = null;
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

/** Simpan snapshot konteks ini sekarang; false bila tak tersimpan. */
function persistIntakeSnapshotNow(
  ctx: UniversalIntakeContext,
  generatedDraftId?: string | null,
): boolean {
  const projectId = ctx.projectId ?? null;
  if (!projectId) return false;
  try {
    const res =
      generatedDraftId == null
        ? saveIntakeContext(projectId, ctx)
        : saveIntakeContext(projectId, ctx, {
            generatedDraftId,
            generatedAt: new Date().toISOString(),
          });
    return res.ok;
  } catch {
    return false;
  }
}

/** Hapus snapshot tersimpan konteks yang sengaja digugurkan (topik ditinggalkan). */
function dropPersistedIntakeSnapshot(ctx: UniversalIntakeContext | null): void {
  const projectId = ctx?.projectId ?? null;
  if (!projectId) return;
  try {
    clearIntakeContext(projectId);
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
export function projectIntakeGate(raw: string): ActionResult | null {
  const extracted = extractProjectContext(raw, projectCtx ?? undefined);
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
  ctx.stage = 'PROJECT_REVIEW';
  universalCtx = ctx;
  const lines = buildUniversalBriefLines(ctx);
  lines.push(...questionnaireBriefLines(ctx));
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
  if (/\b(susun|buatkan|generate)\b[^.]{0,20}\b(draft|rab)\b/.test(t) && ctx.stage === 'PROJECT_REVIEW') {
    return generateFromUniversalContext(ctx);
  }

  // --- Perintah baru yang jelas menggugurkan konteks (pola gerbang lain) ---
  if (/\b(buka|bukain|tampilkan|cari|carikan)\b/.test(t) || (/\bbuatkan\b[^.]{0,30}\brab\b/.test(t) && classifyUniversal(text).primary?.id !== ctx.primary?.id)) {
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

function rabSummaryResult(raw: string, base?: RabNeeds): ActionResult {
  // Alur ringkasan menggantikan kartu pilihan yang mungkin menggantung.
  pendingChoice = null;
  pendingSubtypeNeeds = null;
  const needs = extractRabNeeds(raw, base);
  applySubtypeDetection(needs, raw);
  lastRabNeeds = needs;
  if (raw) lastRabRaw = raw;
  const missing = missingNeeds(needs);

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
    return {
      ok: true,
      message: `${summary}\n\nUntuk dokumen DED, jalur yang tepat adalah DED Estimate AI — unggah gambar kerja di sana, bukan lewat wizard rumah.`,
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
      pendingSubtypeNeeds = needs;
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

/** Lanjutan "Lengkapi kebutuhan": gabungkan jawaban pengguna ke ringkasan. */
export function continueRabNeeds(text: string): ActionResult {
  return rabSummaryResult(text, lastRabNeeds ?? undefined);
}

/** Apakah ada sesi kebutuhan RAB yang aktif pada percakapan ini? */
export function hasActiveRabNeeds(): boolean {
  return lastRabNeeds !== null;
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
export function continueRabFinalize(text: string): ActionResult | null {
  if (!isRabFinalizeText(text)) return null;
  const needs = lastRabNeeds;
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
}

let pendingChoice: PendingRabChoice | null = null;

export function getPendingRabChoice(): PendingRabChoice | null {
  return pendingChoice;
}

export function clearPendingRabChoice(): void {
  pendingChoice = null;
}

type BuiltRab = NonNullable<ReturnType<typeof buildDirectRab>>;

/**
 * Hasil komposisi deterministik sebagai jawaban chat: tabel lengkap +
 * tombol Push ke Spreadsheet RAB (pola yang sama dengan
 * GENERATE_RAB_TEMPLATE dan jalur spek bebas CREATE_RAB_DIRECT).
 */
function directRabTableResult(built: BuiltRab): ActionResult {
  return {
    ok: true,
    message: formatDirectRabMessage(built),
    actions: [
      { label: 'Push ke Spreadsheet RAB', action: { kind: 'push-rab' } },
      { label: 'Buka Spreadsheet RAB', action: { kind: 'navigate', menu: 'rab-estimasi' } },
      { label: 'Buka Workspace Desain & RAB', action: { kind: 'navigate', menu: 'desain-rab' } },
    ],
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
          { label: `Terima koreksi QTO: ${p.description}`, action: { kind: 'qto-correction-confirm', correctionId: p.id } },
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
    lastRabNeeds = null;
    // Catatan gerbang material (jawaban/asumsi terbuka) menjadi asumsi
    // PERTAMA draft — tercetak di bagian "Asumsi yang dipakai" dan ikut
    // terbawa ke revisi/transfer, tidak pernah hilang diam-diam.
    if (materialNote) {
      const names = res.draft.parts.map((p) => p.template.name).join(' + ');
      res.draft.assumptions.unshift(materialNote.replace('{template}', names));
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
    };
  }
  if (res.kind === 'needs-spec') {
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
      };
    }
    return {
      ok: true,
      message:
        `${res.reason}\n\nYang masih dibutuhkan:\n${res.missing.map((m) => `• ${m}`).join('\n')}\n\nKirim ulang permintaan lengkap dengan data itu — draft tidak dibuat dari tebakan.`,
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

function choiceCardResult(p: PendingRabChoice, corrected: boolean): ActionResult {
  const { item, template } = p.match;
  const needs = p.needs;
  const { region } = matchDirectRegion(needs.location);
  const lines: string[] = [];
  lines.push(
    corrected
      ? 'Siap — kartu pilihan saya perbarui dengan koreksi Anda. Ini spek yang kini terbaca:'
      : 'Siap — permintaan Anda cocok dengan template RAB terdaftar. Ini ringkasan spek yang saya baca:'
  );
  lines.push(`• Template: **${item.label}** (${displayTemplateBasisName(template.name, p.floors)}) — Dari Anda (tipe disebut di pesan)`);
  lines.push(
    `• Luas bangunan: ${p.floors > 1 ? `${item.area} m² per lantai (total ±${item.area * p.floors} m²)` : `${item.area} m²`} — Dari Anda (dari Type ${item.area})`
  );
  if (p.landAreaM2) {
    lines.push(`• Luas lahan: ${p.landAreaM2} m² — Dari Anda (dicatat — belum memengaruhi hitungan RAB)`);
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
  lastRabNeeds = enriched;
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
export function continueRabChoice(text: string): ActionResult {
  const p = pendingChoice;
  if (!p) return rabSummaryResult(text);
  const correction = extractRabNeeds(stripLandPhrases(text));
  const merged = extractRabNeeds(stripLandPhrases(text), { ...p.needs });
  const updated: PendingRabChoice = {
    ...p,
    needs: merged,
    floors: merged.floors ?? p.floors,
    floorsMentioned: p.floorsMentioned || correction.floors != null,
    landAreaM2: resolveLandAreaM2(text) ?? p.landAreaM2,
  };
  pendingChoice = updated;
  return choiceCardResult(updated, true);
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
      // Tombol "Buka Game Space": handler tombol view mengirim label
      // sebagai pesan → isGameCommand("buka game space") membuka panel.
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
          'Saya Ezrab Chat AI — asisten estimasi konstruksi yang menjawab dari data EZRAB sendiri, bukan karangan model. Ini yang bisa saya bantu:\n\n' +
          'MEMBUAT RAB\n' +
          '• Wizard RAB rumah — 5 langkah, RAB terbentuk dari tipe & ukuran rumah\n' +
          '• Desain Rumah AI — dari deskripsi teks menjadi spesifikasi & daftar pekerjaan\n' +
          '• Estimasi dari DED — unggah gambar kerja, draft estimasinya disusun otomatis\n' +
          templateLine + '\n\n' +
          'DATA & HITUNGAN YANG BISA DIPERCAYA\n' +
          ahspLine + '\n' +
          '• Database harga material, upah, dan peralatan 2026\n' +
          '• Volume & subtotal dihitung engine deterministik; harga yang belum ada data resminya ditandai jelas, tidak pernah dikarang\n' +
          '• Tanya langsung di sini: total proyek, item termahal/termurah, cari AHSP\n\n' +
          'Coba salah satu:',
        actions: [
          { label: 'Buat RAB', action: { kind: 'intent', intent: 'CREATE_RAB_CLARIFY' } },
          { label: 'Desain rumah dengan AI', action: { kind: 'intent', intent: 'START_HOUSE_DESIGN' } },
          { label: 'Estimasi dari DED', action: { kind: 'navigate', menu: 'ded-ai' } },
          { label: 'Lihat template RAB', action: { kind: 'navigate', menu: 'template-rab' } },
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
        return rabSummaryResult(rawClarify);
      }
      // Intake universal (2026-11-10): kategori yang TERIDENTIFIKASI
      // tidak pernah dibalas menu generik (prinsip §1 master prompt) —
      // gerbang mengambil alih di sini bila klasifikasinya jelas dan
      // bukan alur terlindungi; "buatkan rab" tanpa objek mengembalikan
      // null dari gerbang dan menu di bawah tetap tampil (skenario B).
      const uniClarify = universalIntakeGate(rawClarify, true, ctx.activeProject?.id ?? null);
      if (uniClarify) return uniClarify;
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
      // Desain owner 2026-10-22 (menggantikan generate-otomatis 2026-10-21
      // untuk permintaan BERTIPE): bila teks cocok dengan TEMPLATE
      // TERDAFTAR, JANGAN langsung generate — tampilkan kartu pilihan:
      // ringkasan spek terbaca + "Pakai Template" (generate parametrik
      // instan di chat, persis jalur direct lama, lewat klik eksplisit
      // GENERATE_RAB_TEMPLATE) atau "Pakai AI Full" (intent RAB_FULL_AI —
      // komposisi deterministik langsung di chat: tabel + Push ke
      // Spreadsheet; LLM hanya fallback bila komposisi tak bisa dibuat).
      const typed = findDirectTemplate(raw);
      // Perbaikan 2026-10-27 (keluhan user: prompt "rab rumah ...
      // luas bangunan 70m2" hanya berujung daftar template, tanpa
      // tabel): kecocokan EKS AK (luas = tipe katalog persis, bukan
      // fallback) LANGSUNG jadi tabel + tombol Push — tanpa kartu
      // pilihan. Kartu pilihan dipertahankan hanya untuk basis
      // fallback (luas permintaan ≠ tipe katalog) yang memang perlu
      // konfirmasi pengguna, sesuai desain owner 2026-10-22.
      if (typed && !typed.areaFallback) {
        const built = buildDirectRab(raw, typed.needs);
        if (built) {
          pendingChoice = null;
          pendingSubtypeNeeds = null;
          return {
            ok: true,
            message: formatDirectRabMessage(built),
            actions: [
              { label: 'Push ke Spreadsheet RAB', action: { kind: 'push-rab' } },
              { label: 'Buka Spreadsheet RAB', action: { kind: 'navigate', menu: 'rab-estimasi' } },
              { label: 'Buka Workspace Desain & RAB', action: { kind: 'navigate', menu: 'desain-rab' } },
            ],
          };
        }
        // Bila build gagal, jatuh ke kartu pilihan di bawah (bukan
        // diam-diam ke ringkasan).
      }
      if (typed) {
        // D1: kartu kini dibangun choiceCardResult — semua parameter
        // berlabel Dari Anda/Asumsi, KT/KM default template DITAMPILKAN,
        // ada baris "Luas bangunan" eksplisit, dan pengguna dapat
        // mengoreksi lewat chat sebelum memilih (state pendingChoice).
        pendingChoice = {
          rawText: raw,
          match: typed,
          needs: { ...typed.needs },
          floors: typed.floors,
          floorsMentioned: typed.floorsMentioned,
          landAreaM2: resolveLandAreaM2(raw),
        };
        pendingSubtypeNeeds = null;
        return choiceCardResult(pendingChoice, false);
      }
      // Permintaan langsung baru menggantikan kartu yang menggantung.
      pendingChoice = null;
      pendingSubtypeNeeds = null;
      // Spesifikasi bebas TANPA tipe terdaftar (perluasan 2026-10-22):
      // tidak ada template yang bisa dipilih → langsung generate parametrik
      // dari spesifikasi (specRab) dengan daftar asumsi terbuka. Bila
      // spesifikasi tidak terukur/di luar dukungan, jatuh jujur ke
      // ringkasan kebutuhan (tidak memaksa hasil karangan).
      // FASE 4 (CHAT-05): specRab adalah mesin RUMAH — jangan biarkan ia
      // mengklaim pesan yang primernya kategori lain (lihat
      // specRabHijackGuard). Bila penjaga aktif, langsung ke cakupan
      // universal di bawah.
      const specBuilt = specRabHijackGuard(raw) ? null : buildSpecRab(raw);
      if (specBuilt) {
        return {
          ok: true,
          message: formatDirectRabMessage(specBuilt),
          actions: [
            { label: 'Push ke Spreadsheet RAB', action: { kind: 'push-rab' } },
            { label: 'Buka Spreadsheet RAB', action: { kind: 'navigate', menu: 'rab-estimasi' } },
            { label: 'Buka Workspace Desain & RAB', action: { kind: 'navigate', menu: 'desain-rab' } },
          ],
        };
      }
      // Cakupan universal (2026-10-26): teks DIRECT yang bukan rumah
      // bertipe/spek bebas dicoba lewat katalog template 180 sebelum
      // jatuh ke ringkasan kebutuhan.
      // PERBAIKAN-D (2026-11-14): RUMAH dikecualikan dari langkah ini —
      // routing kanonis P3B: "Selain rumah → UNIVERSAL". Rumah tanpa
      // spek terukur jatuh ke ringkasan kebutuhan (rabSummaryResult),
      // bukan ke klarifikasi tipologi universal (yang sebelumnya
      // menelan teks ini dan melewatkan state kebutuhan sesi).
      // Konsisten dengan CREATE_RAB_SUMMARY yang sudah menggating
      // universal pada kind !== 'rumah'.
      // GATE 4 (5D): projectId diteruskan agar lampiran DED proyek ini
      // ikut (spek DED + rekonsiliasi QTO di universalResultFor).
      const directKind = extractRabNeeds(stripLandPhrases(raw)).kind;
      const uniDirect = directKind === 'rumah'
        ? null
        : universalResultFor(raw, undefined, undefined, { projectId: ctx.activeProject?.id ?? null });
      if (uniDirect) return uniDirect;
      return rabSummaryResult(raw);
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
      if (!built) return rabSummaryResult(rawParam);
      if (usePending) pendingChoice = null;
      return {
        ok: true,
        message: formatDirectRabMessage(built),
        actions: [
          { label: 'Push ke Spreadsheet RAB', action: { kind: 'push-rab' } },
          { label: 'Buka Spreadsheet RAB', action: { kind: 'navigate', menu: 'rab-estimasi' } },
          { label: 'Buka Workspace Desain & RAB', action: { kind: 'navigate', menu: 'desain-rab' } },
        ],
      };
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
      // Intake universal didahulukan HANYA untuk: proyek multi-
      // disiplin (yang bisa dibajak gerbang landscape — kasus sekolah
      // + taman + pagar + drainase) dan kategori non-landscape yang
      // fakta kritisnya hilang. Untuk landscape murni & alur
      // terlindungi gerbang ini mengembalikan null.
      const uniRes = universalIntakeGate(rawSummary, false, ctx.activeProject?.id ?? null);
      if (uniRes) return uniRes;
      const intakeRes = projectIntakeGate(rawSummary);
      if (intakeRes) return intakeRes;
      // Universal (2026-10-26): permintaan non-rumah yang terukur langsung
      // dicoba menjadi draft katalog; rumah tetap ringkasan dulu (desain
      // owner) karena jalur rumah (typed/spec/workspace) yang memilikinya.
      const needsSummary = extractRabNeeds(stripLandPhrases(rawSummary));
      if (needsSummary.kind !== 'rumah') {
        // GATE 4 (5D): projectId diteruskan agar lampiran DED proyek
        // ini ikut (spek DED + rekonsiliasi QTO + tombol koreksi).
        const uniSummary = universalResultFor(rawSummary, undefined, undefined, { projectId: ctx.activeProject?.id ?? null });
        if (uniSummary) {
          // GATE 1 (5A) — jalur cepat menghasilkan draft: tautkan snapshot
          // intake (yang sudah disimpan gerbang sebelum draft) ke draft
          // yang baru tersusun, agar pemulihan sesudah reload memulihkan
          // konteks draft ini BERSAMA draftnya. Konteks diekstrak ulang
          // dari teks yang sama — deterministik, identik dengan yang
          // disimpan gerbang.
          if (uniSummary.actions?.some((a) => a.action.kind === 'push-universal')) {
            const draftNow = getLastUniversalDraft();
            const pid = ctx.activeProject?.id ?? null;
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
      return rabSummaryResult(rawSummary);
    }

    case 'RAB_CONCEPT_SELECT': {
      // Klik pilihan konsep pada pertanyaan intake landscape. param =
      // id konsep dari peta projectIntake ('custom' = konsep bebas
      // pengguna — fasilitasnya ditangkap dari teks, bukan daftar).
      const ctxIntake = projectCtx;
      if (!ctxIntake) {
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
      if (!ctxIntake) {
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
      const needs = pendingSubtypeNeeds ?? lastRabNeeds;
      const subtype = needs ? getSubtype(needs.kind, param ?? null) : null;
      if (!needs || !subtype) {
        return {
          ok: false,
          message:
            'Konteks pertanyaan subtipe sudah tidak aktif. Tulis ulang kebutuhannya, misalnya "buatkan rab jalan hotmix 1 km".',
        };
      }
      const merged: RabNeeds = { ...needs, subtypeId: subtype.id, subtypeLabel: subtype.label };
      pendingSubtypeNeeds = null;
      lastRabNeeds = merged;
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
      const needs = lastRabNeeds;
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
      const n = lastRabNeeds;
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
      const nUniversal = lastRabNeeds;
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
      const prompt = param || (lastRabNeeds ? buildFullAiPrompt(lastRabNeeds) : '');
      return {
        ok: true,
        message: 'Menyiapkan Full AI dari kebutuhan yang terkumpul…',
        fullAiPrompt: prompt || undefined,
      };
    }

    case 'RAB_NEEDS_REFINE': {
      const missing = lastRabNeeds ? missingNeeds(lastRabNeeds) : [];
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
      return rabSummaryResult(ctx.rawText ?? 'buatkan rab rumah tinggal');

    case 'START_HOUSE_DESIGN': {
      // Hanya tercapai lewat KLIK tombol (persetujuan eksplisit). Teks ketikan
      // pengguna kini diarahkan router ke CREATE_RAB_SUMMARY.
      const designPrompt = param || getLastRabDesignPrompt() || 'Buatkan rumah 1 lantai luas bangunan 90 m², ukuran 6 × 15 m, 3 kamar tidur, 2 kamar mandi, ruang tamu, dapur, dan carport.';
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

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
import { buildDirectRab, displayTemplateBasisName, findDirectTemplate, formatDirectRabMessage, matchDirectRegion } from './directRab';
import { buildSpecRab } from './specRab';
import { buildUniversalDraft, formatUniversalDraftMessage } from './universalRab';

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
    | { kind: 'push-universal-confirm' };
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

function rabSummaryResult(raw: string, base?: RabNeeds): ActionResult {
  // Alur ringkasan menggantikan kartu pilihan yang mungkin menggantung.
  pendingChoice = null;
  pendingSubtypeNeeds = null;
  const needs = extractRabNeeds(raw, base);
  applySubtypeDetection(needs, raw);
  lastRabNeeds = needs;
  if (raw) lastRabRaw = raw;
  const missing = missingNeeds(needs);
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
function universalResultFor(raw: string, forcedTemplateId?: string): ActionResult | null {
  const res = buildUniversalDraft(raw, forcedTemplateId);
  if (res.kind === 'draft') {
    return {
      ok: true,
      message: formatUniversalDraftMessage(res.draft),
      actions: [
        { label: 'Push ke Spreadsheet', action: { kind: 'push-universal' } },
        { label: 'Buka Spreadsheet RAB', action: { kind: 'navigate', menu: 'rab-estimasi' } },
      ],
    };
  }
  if (res.kind === 'needs-spec') {
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
  if (n.buildingArea) parts.push(`type ${n.buildingArea}`);
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

    case 'CREATE_RAB_CLARIFY':
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
      const specBuilt = buildSpecRab(raw);
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
      const uniDirect = universalResultFor(raw);
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
      // Universal (2026-10-26): permintaan non-rumah yang terukur langsung
      // dicoba menjadi draft katalog; rumah tetap ringkasan dulu (desain
      // owner) karena jalur rumah (typed/spec/workspace) yang memilikinya.
      const rawSummary = ctx.rawText ?? param ?? '';
      const needsSummary = extractRabNeeds(stripLandPhrases(rawSummary));
      if (needsSummary.kind !== 'rumah') {
        const uniSummary = universalResultFor(rawSummary);
        if (uniSummary) return uniSummary;
      }
      // Fase 2: ringkasan kebutuhan dulu — TIDAK membuka wizard/studio.
      return rabSummaryResult(rawSummary);
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
          const uni = universalResultFor(syntheticUniversal);
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

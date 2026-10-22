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
  resolveLandAreaM2, stripLandPhrases,
} from './rabNeeds';
import { buildDirectRab, displayTemplateBasisName, findDirectTemplate, formatDirectRabMessage, matchDirectRegion } from './directRab';
import { buildSpecRab } from './specRab';

export interface ChatActionContext {
  /** Navigate to a menu id (WorkspaceView.setActiveMenu) */
  navigate: (menu: string) => void;
  /** Teks mentah pesan pengguna saat ini (untuk ekstraksi kebutuhan RAB) */
  rawText?: string;
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
  /** Aksi: navigasi ke menu, atau intent untuk diproses ulang */
  action:
    | { kind: 'navigate'; menu: string }
    | { kind: 'intent'; intent: string; param?: string }
    | { kind: 'push-rab' };
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

function rabSummaryResult(raw: string, base?: RabNeeds): ActionResult {
  // Alur ringkasan menggantikan kartu pilihan yang mungkin menggantung.
  pendingChoice = null;
  const needs = extractRabNeeds(raw, base);
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
  // Non-bangunan (jalan, drainase, dll.): JANGAN paksa ke wizard/desain rumah.
  return {
    ok: true,
    message:
      `${summary}\n\nCatatan jujur: AI Design Studio saat ini khusus bangunan (rumah/gedung). ` +
      `Untuk pekerjaan ${needs.kindLabel ?? 'ini'}, jalur yang tersedia adalah template RAB, estimasi dari DED, atau mulai manual — tidak saya arahkan ke wizard rumah.`,
    actions: [
      { label: 'Pakai template', action: { kind: 'navigate', menu: 'template-rab' } },
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
      '• **Pakai AI Full** — lanjut ke Workspace Desain & RAB; spek di atas terbawa sebagai konteks/prompt desain.'
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
      { label: 'Pakai AI Full', action: { kind: 'intent', intent: 'OPEN_DESIGN_WORKSPACE', param: buildDesignPrompt(enriched, p.rawText) } },
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

    case 'CAPABILITIES':
      // Jawaban produk deterministik: keunggulan EZRAB yang nyata + tombol
      // untuk langsung mencoba. Angka template/AHSP sesuai data produk.
      return {
        ok: true,
        message:
          'Saya Ezrab Chat AI — asisten estimasi konstruksi yang menjawab dari data EZRAB sendiri, bukan karangan model. Ini yang bisa saya bantu:\n\n' +
          'MEMBUAT RAB\n' +
          '• Wizard RAB rumah — 5 langkah, RAB terbentuk dari tipe & ukuran rumah\n' +
          '• Desain Rumah AI — dari deskripsi teks menjadi spesifikasi & daftar pekerjaan\n' +
          '• Estimasi dari DED — unggah gambar kerja, draft estimasinya disusun otomatis\n' +
          '• 52 template RAB siap pakai untuk berbagai jenis proyek\n\n' +
          'DATA & HITUNGAN YANG BISA DIPERCAYA\n' +
          '• AHSP 2026 resmi (5.801 analisa) — cari dan pakai langsung di RAB\n' +
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
      // GENERATE_RAB_TEMPLATE) atau "Pakai AI Full" (ke Workspace
      // Desain & RAB dengan spek terbawa sebagai prompt lewat mekanisme
      // OPEN_DESIGN_WORKSPACE existing — TANPA panggilan LLM baru di chat).
      const typed = findDirectTemplate(raw);
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
        return choiceCardResult(pendingChoice, false);
      }
      // Permintaan langsung baru menggantikan kartu yang menggantung.
      pendingChoice = null;
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

    case 'CREATE_RAB_SUMMARY':
      // Fase 2: ringkasan kebutuhan dulu — TIDAK membuka wizard/studio.
      return rabSummaryResult(ctx.rawText ?? param ?? '');

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

    case 'SEARCH_AHSP': {
      if (!param) {
        return { ok: true, message: 'Mau cari AHSP apa? Contoh: "cari ahsp pondasi batu kali".' };
      }
      const tool = EZRAB_AI_TOOLS.find((t) => t.name === 'cari_ahsp');
      if (!tool) return { ok: false, message: 'Pencarian AHSP tidak tersedia saat ini.' };
      const result = tool.invoke({ kata_kunci: param });
      return { ok: !result.startsWith('ERROR'), message: result };
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

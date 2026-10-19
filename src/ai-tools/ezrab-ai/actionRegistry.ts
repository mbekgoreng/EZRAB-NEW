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

export interface ChatActionContext {
  /** Navigate to a menu id (WorkspaceView.setActiveMenu) */
  navigate: (menu: string) => void;
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
  action: { kind: 'navigate'; menu: string } | { kind: 'intent'; intent: string; param?: string };
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

    case 'START_RAB_WIZARD':
      return {
        ok: true,
        message: 'Baik! Saya bantu buatkan RAB rumah lewat wizard interaktif. Silakan pilih tipe rumah dan spesifikasi.',
        openRabWizard: true,
        actions: [
          { label: '🏠 Mulai Wizard RAB', action: { kind: 'intent', intent: 'START_RAB_WIZARD' } },
          { label: '📐 Desain Rumah AI', action: { kind: 'intent', intent: 'START_HOUSE_DESIGN' } },
        ],
      };

    case 'START_HOUSE_DESIGN': {
      // Ekstrak prompt desain dari param atau gunakan default
      const designPrompt = param || 'Buatkan rumah 1 lantai luas bangunan 90 m², ukuran 6 × 15 m, 3 kamar tidur, 2 kamar mandi, ruang tamu, dapur, dan carport.';
      return {
        ok: true,
        message: 'Membuka AI Design Studio — prompt → denah 2D → 3D → spreadsheet → QTO/RAB.',
        openDesignStudio: true,
        designPrompt,
      };
    }

    case 'OPEN_SPREADSHEET':
      return {
        ok: true,
        message: 'Spreadsheet RAB tersedia di menu RAB & Estimasi. Membuka…',
        actions: [
          { label: '📊 Buka RAB & Spreadsheet', action: { kind: 'navigate', menu: 'rab-estimasi' } },
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

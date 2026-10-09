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
  /** Project RAB total (null if unknown) */
  projectTotal: number | null;
}

export interface ActionResult {
  ok: boolean;
  /** Message to show in chat (already in Indonesian) */
  message: string;
  /** Whether the chat navigated away (UI may want to react) */
  navigated?: boolean;
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
    case 'OPEN_PROJECT_CREATE':
      ctx.navigate('proyek');
      return {
        ok: true,
        message: 'Membuka Daftar Proyek — klik "Proyek Baru" untuk membuat proyek.',
        navigated: true,
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
      return {
        ok: true,
        message: `Total RAB "${ctx.activeProject.name}": ${fmtIDR(ctx.projectTotal)}.`,
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

    default:
      return { ok: false, message: 'Perintah tidak dikenali. Ketik /help untuk daftar perintah.' };
  }
}

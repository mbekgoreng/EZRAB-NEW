/**
 * EZRAB AI — Tools (src/ai-tools/ezrab-ai/tools.ts)
 * Deterministic, small helper tools the assistant can use.
 * Includes calculator tools + knowledge lookup tools (AHSP 2026, price
 * database, RAB templates) so the AI core knows the app's data.
 */

import { aiToolsError, AIToolsStructuredError } from '../types';
import { officialAhspRepository } from '../../data/nationalCostDatabase/officialAhspRepository';
import { priceResolver2026 } from '../../data/priceDatabase2026/resolver';
import { masterBuildingTemplateRegistry } from '../../data/buildingTemplates/masterTemplateRegistry';
import { ProjectSnapshot, formatIDR } from './projectContext';

/**
 * Active-project snapshot for read-only project tools.
 * Set per-request by the service layer from real app state; cleared after.
 * Tools return an honest "no project" message when unset — never fabricated data.
 */
let activeProjectSnapshot: ProjectSnapshot | null = null;

export function setActiveProjectSnapshot(snap: ProjectSnapshot | null): void {
  activeProjectSnapshot = snap;
}

export function getActiveProjectSnapshot(): ProjectSnapshot | null {
  return activeProjectSnapshot;
}

function requireSnapshot(): ProjectSnapshot | string {
  if (!activeProjectSnapshot) {
    return 'Tidak ada proyek aktif yang terhubung. Minta pengguna memilih proyek terlebih dahulu, atau jawab tanpa data proyek.';
  }
  return activeProjectSnapshot;
}

export interface EzrabAiToolDef {
  name: string;
  description: string;
  invoke: (args: Record<string, unknown>) => string;
}

const asNumber = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};

function fmtIDR(n: number): string {
  return 'Rp ' + n.toLocaleString('id-ID');
}

export const EZRAB_AI_TOOLS: EzrabAiToolDef[] = [
  {
    name: 'subtotal',
    description: 'Menghitung jumlah = volume × harga satuan.',
    invoke: (args) => {
      const q = asNumber(args.volume ?? args.quantity);
      const p = asNumber(args.unitPrice ?? args.price);
      if (q === null || p === null) return 'ERROR: volume dan harga satuan wajib berupa angka.';
      return `Subtotal = ${fmtIDR(Math.round(q * p))}`;
    },
  },
  {
    name: 'volume_persegi',
    description: 'Volume balok/ruangan: panjang × lebar × tinggi (dalam meter).',
    invoke: (args) => {
      const l = asNumber(args.panjang);
      const w = asNumber(args.lebar);
      const h = asNumber(args.tinggi);
      if (l === null || w === null || h === null) return 'ERROR: panjang, lebar, tinggi wajib berupa angka.';
      const v = l * w * h;
      if (v <= 0) return 'ERROR: hasil volume harus lebih dari nol.';
      return `Volume = ${v.toLocaleString('id-ID', { maximumFractionDigits: 2 })} m³`;
    },
  },
  {
    name: 'luas_dinding',
    description: 'Luas dinding: (panjang × tinggi) × 2, dikurangi luas bukaan bila diberi.',
    invoke: (args) => {
      const p = asNumber(args.panjang);
      const h = asNumber(args.tinggi);
      const b = asNumber(args.bukaan);
      if (p === null || h === null) return 'ERROR: panjang dan tinggi wajib berupa angka.';
      const area = 2 * p * h - (b ?? 0);
      if (area < 0) return 'ERROR: luas bukaan melebihi luas dinding.';
      return `Luas dinding = ${area.toLocaleString('id-ID', { maximumFractionDigits: 2 })} m²`;
    },
  },
  {
    name: 'persentase_level',
    description: 'Persentase level/kemiringan: kenaikan ÷ jarak × 100.',
    invoke: (args) => {
      const up = asNumber(args.kenaikan);
      const dist = asNumber(args.jarak);
      if (up === null || dist === null || dist <= 0) return 'ERROR: kenaikan dan jarak (jarak>0) wajib berupa angka.';
      return `Level = ${((up / dist) * 100).toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`;
    },
  },
  // ===== Knowledge tools: AI core knows the app's data =====
  {
    name: 'cari_ahsp',
    description: 'Mencari AHSP 2026 resmi (kode, nama pekerjaan, satuan, harga satuan). Argumen: kata_kunci (wajib).',
    invoke: (args) => {
      const q = String(args.kata_kunci ?? args.query ?? '').trim();
      if (!q) return 'ERROR: kata_kunci wajib diisi.';
      try {
        const hits = officialAhspRepository.searchOfficialAhsp(q, { limit: 8 });
        if (hits.length === 0) return `Tidak ditemukan AHSP untuk "${q}".`;
        return hits.map((h, i) => {
          const it: any = h.item;
          let price: number | null = Number(it.unitPrice) || null;
          if (!price && it.code) {
            try {
              const r: any = priceResolver2026.resolveAhspUnitPrice(it.code, it.unit);
              if (r?.unitPrice) price = Number(r.unitPrice);
            } catch { /* ignore */ }
          }
          const title = it.title ?? it.name ?? '-';
          return `${i + 1}. [${it.code ?? '-'}] ${title} — ${it.unit ?? ''}${price ? ` — ${fmtIDR(Math.round(price))}` : ' — harga lihat analisa komponen'}`;
        }).join('\n');
      } catch (e: any) {
        return 'ERROR: gagal mencari AHSP: ' + (e?.message ?? e);
      }
    },
  },
  {
    name: 'cari_harga',
    description: 'Mencari harga material/upah/alat dari database harga 2026. Argumen: kata_kunci (wajib), jenis opsional (material|upah|alat).',
    invoke: (args) => {
      const q = String(args.kata_kunci ?? args.query ?? '').trim();
      if (!q) return 'ERROR: kata_kunci wajib diisi.';
      const jenis = String(args.jenis ?? '').toLowerCase();
      const resourceType = jenis === 'upah' ? 'labor' : jenis === 'alat' ? 'equipment' : jenis === 'material' ? 'material' : 'unknown';
      try {
        const res = priceResolver2026.resolveResourcePrice({ resourceName: q, resourceType } as any);
        const rec: any = (res as any)?.record ?? res;
        if (!rec || rec.price == null) return `Tidak ditemukan harga untuk "${q}".`;
        return `${rec.name ?? q} — ${rec.unit ?? ''} — ${fmtIDR(Math.round(Number(rec.price)))}${rec.location ? ` (${rec.location})` : ''}`;
      } catch (e: any) {
        return 'ERROR: gagal mencari harga: ' + (e?.message ?? e);
      }
    },
  },
  {
    name: 'cari_template_rab',
    description: 'Mencari template RAB bangunan (rumah tipe 36/45/70, ruko, jalan beton, drainase). Argumen: kata_kunci (wajib).',
    invoke: (args) => {
      const q = String(args.kata_kunci ?? args.query ?? '').trim().toLowerCase();
      if (!q) return 'ERROR: kata_kunci wajib diisi.';
      try {
        const all = masterBuildingTemplateRegistry.getAllTemplates();
        const words = q.split(/\s+/).filter((w) => w.length > 1);
        const scored = all.map((t: any) => {
          const hay = `${t.name ?? ''} ${t.code ?? ''} ${t.category ?? ''} ${t.description ?? ''}`.toLowerCase();
          let score = 0;
          for (const w of words) if (hay.includes(w)) score++;
          return { t, score };
        }).filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 8);
        if (scored.length === 0) return `Tidak ditemukan template RAB untuk "${q}".`;
        return scored.map((s, i) => {
          const t: any = s.t;
          const items = Array.isArray(t.workItems) ? t.workItems.length : 0;
          return `${i + 1}. ${t.name ?? t.id} [${t.code ?? ''}] — ${items} item pekerjaan`;
        }).join('\n');
      } catch (e: any) {
        return 'ERROR: gagal mencari template: ' + (e?.message ?? e);
      }
    },
  },
  // ── Project data tools (read-only, active project only) ──
  {
    name: 'get_project_total',
    description: 'Total RAB proyek aktif (deterministik dari engine kanonis). Tanpa argumen. Mengembalikan subtotal langsung DAN total akhir (grand total + overhead/PPN), serta item yang belum punya harga.',
    invoke: () => {
      const snap = requireSnapshot();
      if (typeof snap === 'string') return snap;
      const lines = [
        `Subtotal langsung proyek "${snap.projectName}": ${formatIDR(snap.totalDirect)}`,
        `Jumlah item: ${snap.itemCount}`,
      ];
      const cb = snap.costBreakdown;
      if (cb) {
        lines.push(
          `Rincian kanonis: overhead ${cb.overheadPercent}% (${formatIDR(cb.overheadAmount)}) + profit ${cb.profitPercent}% (${formatIDR(cb.profitAmount)}) → subtotal sebelum pajak ${formatIDR(cb.subtotalBeforeTax)} + PPN ${cb.taxPercent}% (${formatIDR(cb.taxAmount)}) = TOTAL AKHIR ${formatIDR(cb.grandTotal)}`,
        );
      }
      if (snap.unresolvedCount > 0) {
        lines.push(
          `Catatan: ${snap.unresolvedCount} item belum memiliki harga dan TIDAK termasuk dalam subtotal maupun total akhir (bukan Rp0).`,
        );
      }
      return lines.join('\n');
    },
  },
  {
    name: 'get_project_items',
    description: 'Mencari item RAB di proyek aktif. Argumen: kata_kunci (opsional — kosongkan untuk semua, maks 25), hanya_belum_berharga (opsional boolean).',
    invoke: (args) => {
      const snap = requireSnapshot();
      if (typeof snap === 'string') return snap;
      const q = String(args.kata_kunci ?? args.query ?? '').trim().toLowerCase();
      const onlyUnresolved = args.hanya_belum_berharga === true || args.onlyUnresolved === true;
      let pool = onlyUnresolved ? snap.unresolvedItems : snap.items;
      if (q) {
        const words = q.split(/\s+/).filter((w) => w.length > 1);
        pool = pool.filter((it) => {
          const hay = `${it.description} ${it.code} ${it.sectionName}`.toLowerCase();
          return words.every((w) => hay.includes(w));
        });
      }
      if (pool.length === 0) {
        return q
          ? `Tidak ditemukan item RAB yang cocok dengan "${q}" di proyek "${snap.projectName}".`
          : `Proyek "${snap.projectName}" belum memiliki item RAB.`;
      }
      return pool.slice(0, 25).map((it, i) => {
        const price =
          it.priceStatus === 'PRICE_UNRESOLVED'
            ? 'harga belum tersedia'
            : `${formatIDR(it.unitPrice ?? 0)}/${it.unit}`;
        return `${i + 1}. ${it.description} — ${it.volume} ${it.unit} × ${price} = ${formatIDR(it.totalPrice)}`;
      }).join('\n');
    },
  },
  {
    name: 'get_item_detail',
    description: 'Detail satu item RAB di proyek aktif. Argumen: nama (wajib — nama atau kode item). Jika ambigu, kembalikan kandidat.',
    invoke: (args) => {
      const snap = requireSnapshot();
      if (typeof snap === 'string') return snap;
      const q = String(args.nama ?? args.name ?? args.kode ?? '').trim().toLowerCase();
      if (!q) return 'ERROR: argumen "nama" wajib diisi.';
      const words = q.split(/\s+/).filter((w) => w.length > 1);
      const matches = snap.items.filter((it) => {
        const hay = `${it.description} ${it.code}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      });
      if (matches.length === 0) {
        return `Item "${q}" tidak ditemukan di proyek "${snap.projectName}". Jangan mengarang data item ini.`;
      }
      if (matches.length > 1) {
        return (
          `Ditemukan ${matches.length} kandidat untuk "${q}" — minta klarifikasi:\n` +
          matches.slice(0, 5).map((it, i) => `${i + 1}. ${it.description} (${it.volume} ${it.unit})`).join('\n')
        );
      }
      const it = matches[0];
      return [
        `Item: ${it.description}`,
        `Kode: ${it.code || '-'}`,
        `Kelompok: ${it.sectionName || '-'}`,
        `Volume: ${it.volume} ${it.unit}`,
        `Harga satuan: ${it.priceStatus === 'PRICE_UNRESOLVED' ? 'belum tersedia (BUKAN Rp0)' : `${formatIDR(it.unitPrice ?? 0)}/${it.unit}`}`,
        `Subtotal: ${formatIDR(it.totalPrice)}`,
      ].join('\n');
    },
  },
  {
    name: 'get_unresolved_items',
    description: 'Daftar item RAB proyek aktif yang belum memiliki harga. Tanpa argumen.',
    invoke: () => {
      const snap = requireSnapshot();
      if (typeof snap === 'string') return snap;
      if (snap.unresolvedItems.length === 0) {
        return `Semua ${snap.itemCount} item di proyek "${snap.projectName}" sudah memiliki harga.`;
      }
      return (
        `${snap.unresolvedCount} item belum memiliki harga (tidak termasuk dalam total RAB):\n` +
        snap.unresolvedItems.map((it, i) => `${i + 1}. ${it.description} — ${it.volume} ${it.unit}`).join('\n')
      );
    },
  },
];

export const EZRAB_AI_TOOL_MAP: Record<string, EzrabAiToolDef> = Object.fromEntries(
  EZRAB_AI_TOOLS.map((t) => [t.name, t])
);

export function getToolListText(): string {
  return EZRAB_AI_TOOLS.map((t) => `- ${t.name}: ${t.description}`).join('\n');
}

export function runTool(
  toolName: string,
  args: Record<string, unknown>
): string | AIToolsStructuredError {
  const tool = EZRAB_AI_TOOL_MAP[toolName];
  if (!tool) {
    return aiToolsError('INTERNAL', 'ezrab-ai:tool', `Alat tidak dikenal: ${toolName}`);
  }
  return tool.invoke(args);
}

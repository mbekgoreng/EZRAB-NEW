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

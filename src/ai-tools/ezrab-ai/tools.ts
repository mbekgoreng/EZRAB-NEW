/**
 * EZRAB AI — Tools (src/ai-tools/ezrab-ai/tools.ts)
 * Deterministic, small helper tools the assistant can use. They never call AHSP,
 * price database, or the DED pipeline. All arithmetic is in code, not the AI.
 */

import { aiToolsError, AIToolsStructuredError } from '../types';

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

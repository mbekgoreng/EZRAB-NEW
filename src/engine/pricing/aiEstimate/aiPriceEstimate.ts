/**
 * Perkiraan Harga AI untuk komponen AHSP yang harganya tidak tersedia.
 * ============================================================================
 * PERINTAH USER (2026-10-18): untuk harga AHSP yang tidak tersedia, AI boleh
 * membuat perkiraan ("ngarang") berdasarkan sumber tertentu pada harga
 * material saat ini — dengan tampilan khusus "*Harga Perkiraan AI*".
 *
 * Batasan integritas (tetap berlaku):
 * - TIDAK PERNAH menggantikan harga resmi (official) atau harga pasar
 *   terverifikasi. Hanya mengisi slot yang null.
 * - TIDAK PERNAH otomatis: selalu atas permintaan eksplisit user per komponen.
 * - Label "*Harga Perkiraan AI*" SELALU tampil di mana pun harga ini muncul.
 * - Memakai perkiraan sebagai harga kerja butuh acknowledgment eksplisit
 *   ("Saya paham ini perkiraan AI, bukan harga resmi").
 * - Sumber yang dipakai dicatat dan ditampilkan (transparan).
 *
 * Alur: kumpulkan sumber (referensi pasar terverifikasi > perlu-tinjau >
 * database material > item AHSP sejenis) → minta AI mensintesis perkiraan
 * (jsonMode) → jika AI gagal, fallback heuristik transparan (median sumber,
 * method='heuristic', confidence lebih rendah).
 */
import { marketReviewStore } from '../market/reviewStore';
import { extractSpec, compareKeyAttributes } from '../market/specProfiles';
import type { MarketPriceReference } from '../market/types';

/** Label khusus yang SELALU menyertai harga perkiraan AI. */
export const AI_ESTIMATE_LABEL = '*Harga Perkiraan AI*';

export type EstimateSourceKind =
  | 'market_verified'
  | 'market_review'
  | 'material_db'
  | 'ahsp_similar';

export interface EstimateSource {
  kind: EstimateSourceKind;
  label: string;
  price: number;
  unit: string;
}

export interface AiPriceEstimate {
  id: string;
  componentCode: string;
  componentName: string;
  unit: string;
  estimatedPrice: number;
  currency: 'IDR';
  sources: EstimateSource[];
  /** 0..1 — heuristik selalu <= 0.5; AI dengan sumber kuat bisa sampai 0.7. */
  confidence: number;
  method: 'ai' | 'heuristic';
  reasoning: string;
  createdAt: string;
  /** User sudah mencentang "Saya paham ini perkiraan AI". */
  acknowledged: boolean;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
}

const newId = () =>
  `aiest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const nowIso = () => new Date().toISOString();

/**
 * Kumpulkan "sumber tertentu": referensi pasar (terverifikasi dulu),
 * lalu database harga material, lalu item AHSP sejenis.
 */
export function gatherEstimateSources(
  componentName: string,
  unit: string,
  opts: {
    materialDbLookup?: (name: string) => { price: number; unit: string; label: string } | null;
    similarAhspLookup?: (name: string) => { price: number; unit: string; label: string } | null;
  } = {}
): EstimateSource[] {
  const sources: EstimateSource[] = [];
  const spec = extractSpec(componentName);

  const refs: MarketPriceReference[] = marketReviewStore
    .list()
    .filter((r) => {
      if (!spec) return r.canonicalName.toLowerCase() === componentName.toLowerCase();
      if (r.spec.category !== spec.category) return false;
      return compareKeyAttributes(spec, r.spec).compatible;
    })
    .sort((a, b) => {
      const rank = (s: string) => (s === 'MARKET_VERIFIED' ? 0 : s === 'NEEDS_REVIEW' ? 1 : 2);
      return rank(a.verificationStatus) - rank(b.verificationStatus);
    });

  for (const r of refs.slice(0, 5)) {
    const unitPrice = r.normalizedUnitPrice ?? r.listedPrice;
    if (!(unitPrice > 0)) continue;
    sources.push({
      kind: r.verificationStatus === 'MARKET_VERIFIED' ? 'market_verified' : 'market_review',
      label: `${r.sourceName} (${r.verificationStatus === 'MARKET_VERIFIED' ? 'terverifikasi' : 'perlu tinjau'})`,
      price: unitPrice,
      unit: r.normalizedUnit,
    });
  }

  if (opts.materialDbLookup) {
    const m = opts.materialDbLookup(componentName);
    if (m && m.price > 0) {
      sources.push({ kind: 'material_db', label: m.label, price: m.price, unit: m.unit });
    }
  }
  if (opts.similarAhspLookup) {
    const s = opts.similarAhspLookup(componentName);
    if (s && s.price > 0) {
      sources.push({ kind: 'ahsp_similar', label: s.label, price: s.price, unit: s.unit });
    }
  }
  void unit;
  return sources;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Fallback transparan saat AI tidak dapat dihubungi. */
export function heuristicEstimate(
  componentCode: string,
  componentName: string,
  unit: string,
  sources: EstimateSource[]
): AiPriceEstimate | null {
  const prices = sources.map((s) => s.price).filter((p) => p > 0);
  if (prices.length === 0) return null;
  return {
    id: newId(),
    componentCode,
    componentName,
    unit,
    estimatedPrice: Math.round(median(prices)),
    currency: 'IDR',
    sources,
    confidence: Math.min(0.5, 0.2 + 0.1 * sources.length),
    method: 'heuristic',
    reasoning:
      `AI tidak dapat dihubungi — perkiraan dihitung sebagai median dari ` +
      `${prices.length} sumber harga yang tersedia. Bukan hasil analisis AI.`,
    createdAt: nowIso(),
    acknowledged: false,
    acknowledgedBy: null,
    acknowledgedAt: null,
  };
}

export interface AiEstimateRequest {
  componentCode: string;
  componentName: string;
  unit: string;
  materialDbLookup?: (name: string) => { price: number; unit: string; label: string } | null;
  similarAhspLookup?: (name: string) => { price: number; unit: string; label: string } | null;
}

/**
 * Minta perkiraan harga AI untuk satu komponen.
 * - Mengumpulkan sumber terlebih dahulu (tanpa sumber → null, tidak mengarang
 *   dari nol).
 * - Memanggil AI gateway (productId EZRAB_AI, jsonMode) untuk sintesis.
 * - Gagal → fallback heuristik transparan.
 */
export async function requestAiPriceEstimate(
  req: AiEstimateRequest
): Promise<AiPriceEstimate | null> {
  const sources = gatherEstimateSources(req.componentName, req.unit, {
    materialDbLookup: req.materialDbLookup,
    similarAhspLookup: req.similarAhspLookup,
  });
  if (sources.length === 0) return null;

  const sourceLines = sources
    .map((s, i) => `${i + 1}. [${s.kind}] ${s.label}: Rp ${Math.round(s.price).toLocaleString('id-ID')} / ${s.unit}`)
    .join('\n');

  const prompt =
    `Perkirakan harga satuan wajar SAAT INI untuk material/upah berikut:\n` +
    `Komponen: ${req.componentName}\nSatuan: ${req.unit}\n\n` +
    `Sumber harga yang tersedia:\n${sourceLines}\n\n` +
    `Tugas: berikan SATU angka perkiraan harga satuan (Rupiah, bilangan bulat) ` +
    `yang wajar berdasarkan sumber di atas, plus confidence 0..1 dan alasan singkat ` +
    `(maks 2 kalimat, Bahasa Indonesia).\n` +
    `PENTING: Ini untuk ESTIMASI kasar — pilih angka konservatif (cenderung ` +
    `mendekati median, bukan termurah). Jangan mengarang sumber baru.`;

  try {
    const { AiToolsProviderClient } = await import('../../../ai-tools/providerClient');
    const client = new AiToolsProviderClient();
    const result = await client.execute<{
      estimatedPrice?: number;
      confidence?: number;
      reasoning?: string;
    }>({
      productId: 'EZRAB_AI',
      prompt,
      systemPrompt:
        'Anda adalah estimator konstruksi Indonesia. Jawab HANYA dengan JSON valid: ' +
        '{"estimatedPrice": <bilangan bulat Rupiah>, "confidence": <0..1>, "reasoning": "<singkat>"}',
      jsonMode: true,
      temperature: 0.2,
      maxTokens: 600,
      timeoutMs: 60000,
    });

    if (result.success && result.structured && result.structured.estimatedPrice! > 0) {
      const st = result.structured;
      return {
        id: newId(),
        componentCode: req.componentCode,
        componentName: req.componentName,
        unit: req.unit,
        estimatedPrice: Math.round(st.estimatedPrice!),
        currency: 'IDR',
        sources,
        confidence: Math.max(0.1, Math.min(0.7, Number(st.confidence) || 0.4)),
        method: 'ai',
        reasoning: String(st.reasoning || 'Sintesis AI dari sumber harga yang tersedia.'),
        createdAt: nowIso(),
        acknowledged: false,
        acknowledgedBy: null,
        acknowledgedAt: null,
      };
    }
  } catch {
    // jatuh ke heuristik di bawah
  }
  return heuristicEstimate(req.componentCode, req.componentName, req.unit, sources);
}

/** Store sederhana untuk perkiraan yang sudah diminta (per sesi). */
class AiEstimateStore {
  private items = new Map<string, AiPriceEstimate>();

  save(est: AiPriceEstimate): AiPriceEstimate {
    this.items.set(est.id, est);
    return est;
  }

  get(id: string): AiPriceEstimate | null {
    return this.items.get(id) ?? null;
  }

  /** Perkiraan terakhir untuk satu komponen (bila ada). */
  latestFor(componentCode: string): AiPriceEstimate | null {
    let best: AiPriceEstimate | null = null;
    for (const e of this.items.values()) {
      if (e.componentCode !== componentCode) continue;
      if (!best || e.createdAt > best.createdAt) best = e;
    }
    return best;
  }

  acknowledge(id: string, by: string): AiPriceEstimate | null {
    const e = this.items.get(id);
    if (!e) return null;
    e.acknowledged = true;
    e.acknowledgedBy = by;
    e.acknowledgedAt = nowIso();
    return e;
  }

  clear(): void {
    this.items.clear();
  }
}

export const aiEstimateStore = new AiEstimateStore();

/**
 * Format tampilan: "Rp 125.000 *Harga Perkiraan AI*".
 * Label SELALU ikut — tidak ada tampilan harga perkiraan tanpa label.
 */
export function formatAiEstimatePrice(estimatedPrice: number): string {
  return `Rp ${Math.round(estimatedPrice).toLocaleString('id-ID')} ${AI_ESTIMATE_LABEL}`;
}

/**
 * fullAiRabCompletion — Budget-Based RAB dengan hasil FULL AI (§5 program
 * Universal Construction Intelligence; DESIGN.md EZRAB-BUDGET-RAB-FULLAI).
 *
 * SATU modul post-pass async bersama untuk ketiga generator chat RAB
 * (parametrik `buildDirectRab` / free-spec `buildSpecRab` / universal
 * `buildUniversalDraft` / workspace desain): berjalan SESUDAH generator
 * deterministik menghasilkan item bervolume dan SEBELUM jawaban
 * diformat. Ia mengisi harga (dan, bila perlu, kuantitas) yang hilang
 * dengan asumsi AI berlabel — TIDAK PERNAH menyentuh generator, router,
 * mode fail-closed EZRAB AI, atau rantai gateway.
 *
 * Urutan pass (DESIGN.md §2.1 — cermin `runExecute` ded-full-ai):
 *   1. adaptasi item chat → FullAiItem[]
 *   2. completeFullAiQuantities (reuse — estimasi konteks)
 *   3. fillFullAiQuantitiesFromFormulas (reuse — jaring rumus)
 *   4. pass asumsi AI: kuantitas (bila masih ada yang kosong) + harga
 *      (chunk ≤20 item, dimodelkan 1:1 pada
 *      completeFullAiQuantitiesWithAi — deps sendiri productId EZRAB_AI)
 *   5. reconcileFullAiQuantityFormulas (reuse)
 *   6. dropStaleExclusionWarnings (reuse — warning format DED)
 *   7. map-back ke item chat asli (PRICE_ESTIMATED + EZRAB_ASSUMPTION +
 *      NEEDS_VERIFICATION + basis di notes; harga resolved tak tersentuh)
 *   8. total dihitung ulang deterministik oleh aplikasi (JANGAN percaya
 *      subtotal/total model)
 *   9. assessBudgetFeasibility atas total lengkap + downgrade kualitas
 *      SATU tingkat bila OVER (dinyatakan terbuka, kedua total tampil)
 *
 * GUARD (DESIGN.md §9 — mengikat):
 * - Setiap angka asumsi berlabel + dasar dinyatakan; isian tanpa dasar
 *   DITOLAK, bukan ditampilkan.
 * - Tidak ada harga karangan yang tampil sebagai resmi: tanpa
 *   OFFICIAL_AHSP / PRICE_RESOLVED / kode AHSP dari pass ini (kode AHSP
 *   model di-strip).
 * - Total lengkap berlabel "Estimasi Sementara (asumsi AI)" — kata
 *   "Final"/"Resmi"/"Terverifikasi" tidak pernah menyertainya.
 * - Tanpa tabel harga / tabel pengali / katalog baru di modul ini
 *   (isSaneEstimate adalah validator, bukan sumber harga).
 * - Generik: TANPA literal nomor tipe / nama preset / cabang per-tipe.
 *   `projectType`/`projectLabel` adalah string bebas dari draft/spek.
 * - Fail-soft: AI gagal / parse gagal / nilai gila / satuan tak cocok →
 *   item tetap UNRESOLVED + terdaftar sebagai unfilled; draft parsial
 *   asli selalu dipertahankan sebagai fallback.
 *
 * Biaya reuse (keputusan koordinator, PLAN.md §5.7): mengimpor
 * ded-full-ai/service.ts menarik graf impornya (adapter kanonis +
 * vision I8) ke graf chat — DITERIMA untuk v1; gerbangnya runtime,
 * bukan modul, dan tidak ada perilaku yang berubah.
 */

import { aiToolsProviderClient } from '../providerClient';
import type { AiToolsRequest, AiToolsResult, AiToolsSuccess } from '../providerClient';
import {
  completeFullAiQuantities,
  fillFullAiQuantitiesFromFormulas,
  reconcileFullAiQuantityFormulas,
  dropStaleExclusionWarnings,
  resolveFullAiItemStatus,
} from '../ded-full-ai/service';
import type { FullAiItem, FullAiPriceSource } from '../ded-full-ai/types';
import { isSaneEstimate } from '../ded-ai-estimate/pricing';
import { isPriceValidForTotal, totalsFromItems } from './universalRab';
import type { DraftTotals } from './universalRab';
import { assessBudgetFeasibility, formatRupiah } from './budgetFeasibility';
import type { BudgetFeasibility, BudgetVerdict } from './budgetFeasibility';

/** Ukuran chunk pass AI (DESIGN.md §2.4; keputusan koordinator §5.5). */
export const CHAT_RAB_COMPLETION_CHUNK_SIZE = 20;
/** Timeout per panggilan completion (di bawah timeout pola DED 300 dtk). */
export const CHAT_RAB_COMPLETION_TIMEOUT_MS = 90_000;
/** Plafon token output per chunk (sama dengan pass asumsi DED). */
export const CHAT_RAB_COMPLETION_MAX_TOKENS = 4000;

/**
 * Pola follow-up teks "lengkapi dengan Full AI" di jalur submit chat
 * (DESIGN.md §2.3.2b — dipin oleh tes). Hanya berlaku bila ada draft
 * parsial + budget aktif; tanpa itu pesan mengalir ke routing normal.
 */
export const BUDGET_FULL_AI_FOLLOWUP_RE =
  /full\s*ai|isi (semua )?harga|lengkapi (dengan )?full ai/i;

/* ------------------------------------------------------------------ */
/* Kualitas (DESIGN.md §5)                                             */
/* ------------------------------------------------------------------ */

export type QualityTier = 'ekonomis' | 'standar' | 'menengah' | 'premium' | 'mewah';

/** Tangga kualitas — downgrade hanya SATU tingkat ke bawah. */
export const QUALITY_TIER_LADDER: QualityTier[] = [
  'ekonomis',
  'standar',
  'menengah',
  'premium',
  'mewah',
];

/**
 * Normalisasi kualitas mentah (alias parser rabIntentSpec) ke tangga
 * kanonis. Tanpa kualitas yang disebut → 'standar' + defaulted: true
 * (dinyatakan sebagai asumsi di blok completion).
 */
export function normalizeQualityTier(raw: string | null | undefined): {
  tier: QualityTier;
  defaulted: boolean;
} {
  const s = (raw ?? '').toLowerCase().trim();
  if (s === 'ekonomis' || s === 'sederhana') return { tier: 'ekonomis', defaulted: false };
  if (s === 'standar' || s === 'standard') return { tier: 'standar', defaulted: false };
  if (s === 'menengah') return { tier: 'menengah', defaulted: false };
  if (s === 'premium') return { tier: 'premium', defaulted: false };
  if (s === 'mewah' || s === 'luxury' || s === 'high-end' || s === 'high end') {
    return { tier: 'mewah', defaulted: false };
  }
  return { tier: 'standar', defaulted: true };
}

export interface QualityTierDecision {
  requestedTier: QualityTier;
  /** Tier yang dipakai sesudah keputusan (sama dengan requested bila tanpa downgrade). */
  tierToUse: QualityTier;
  /** true bila keputusan ini adalah downgrade satu tingkat. */
  downgraded: boolean;
  /** Tier asal bila downgrade (undefined bila tanpa downgrade). */
  downgradedFrom?: QualityTier;
  verdict: BudgetVerdict;
  /** true bila tier permintaan adalah default (kualitas tidak disebut). */
  defaulted: boolean;
}

/**
 * Keputusan kualitas murni (DESIGN.md §5 — tanpa AI, tanpa efek samping).
 * Downgrade HANYA bila verdict OVER dan masih ada satu tingkat di bawah;
 * tanpa budget / UNDER / sudah-ekonomis → tier permintaan dipertahankan.
 * TIDAK PERNAH diam-diam: pemanggil wajib menampilkan keputusan ini.
 */
export function selectBudgetQualityTier(args: {
  requestedTier: string | null;
  totalAtRequestedTier: number | null;
  unpricedCount: number;
  budgetCap: number | null;
}): QualityTierDecision {
  const { tier: requested, defaulted } = normalizeQualityTier(args.requestedTier);
  const feasibility = assessBudgetFeasibility({
    totalPriced: args.totalAtRequestedTier,
    unpricedCount: args.unpricedCount,
    budgetCap: args.budgetCap,
  });
  const ladderIdx = QUALITY_TIER_LADDER.indexOf(requested);
  if (feasibility.verdict === 'OVER' && ladderIdx > 0) {
    return {
      requestedTier: requested,
      tierToUse: QUALITY_TIER_LADDER[ladderIdx - 1],
      downgraded: true,
      downgradedFrom: requested,
      verdict: 'OVER',
      defaulted,
    };
  }
  return {
    requestedTier: requested,
    tierToUse: requested,
    downgraded: false,
    verdict: feasibility.verdict,
    defaulted,
  };
}

/* ------------------------------------------------------------------ */
/* Bentuk item + deps                                                  */
/* ------------------------------------------------------------------ */

/**
 * Bentuk struktural minimal item chat yang bisa dilengkapi — dipenuhi
 * DraftItem universal, item calc parametrik, dan DesignWorkItem
 * workspace tanpa mengimpor tipe mereka (hindari siklus impor).
 */
export interface AdaptableChatItem {
  description: string;
  category?: string | null;
  group?: string | null;
  volume?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  priceStatus?: string | null;
  priceSourceKind?: string | null;
  ahspCode?: string | null;
  notes?: string | null;
  /** Rumus volume EKSPLISIT bila ada (calculationFormula / formula). */
  formula?: string | null;
  /** Total baris engine (vol × harga, SUDAH dibulatkan per item) —
   *  dibawa apa adanya agar total jalur parametrik (varian lineTotal)
   *  persis sama dengan subtotal tabel yang dirender. Tanpa ini,
   *  recompute jatuh ke vol × harga tak bulat dan total meleset
   *  pecahan rupiah dari Σ totalPrice engine (temuan tes W5: 0,5). */
  totalPrice?: number | null;
  /** Detail sumber (mis. sourceDetail workspace) — konteks, BUKAN rumus:
   *  TIDAK dipakai sebagai formula karena tidak memuat pengali jumlah
   *  (volume = p×l×t×jumlah; sourceDetail tanpa jumlah akan membuat
   *  rekonsiliasi "mengkoreksi" volume ke bawah secara keliru). */
  sourceDetail?: string | null;
  volumeSource?: string | null;
}

/** Item chat sesudah dilengkapi — field harga/kuantitas terisi + label jujur. */
export type CompletedChatItem<T extends AdaptableChatItem = AdaptableChatItem> =
  Omit<T, 'unitPrice' | 'priceStatus' | 'priceSourceKind' | 'volume' | 'notes' | 'volumeSource'> & {
    unitPrice: number | null;
    amount?: number | null;
    totalPrice?: number | null;
    priceStatus: string;
    priceSourceKind?: string | null;
    priceSourceLabel?: string;
    priceSourceExplanation?: string;
    verificationStatus?: string;
    volume: number | null;
    notes?: string;
    volumeSource?: string | null;
  };

/** Satu isian harga dari model (SUDAH tervalidasi — lihat pass harga). */
export interface ChatRabPriceFill {
  /** Nomor 1-based item (kunci stabil yang sama dengan DED). */
  no: number;
  unitPrice: number;
  /** Spek material satu baris (asumsi — BUKAN kode AHSP). */
  spec: string;
  /** Dasar asumsi satu kalimat. */
  basis: string;
  /** Satuan gema model (bila ada) — harus cocok dengan satuan item. */
  unit?: string;
}

/** Satu isian kuantitas (dari pass konteks/rumus/AI — dikumpulkan dari item teradaptasi). */
export interface ChatRabQuantityFill {
  no: number;
  quantity: number;
  formula: string;
  basis: string;
}

export interface ChatRabCompletionFills {
  prices: ChatRabPriceFill[];
  quantities: ChatRabQuantityFill[];
}

/**
 * Deps injeksi pass AI — dimodelkan 1:1 pada
 * FullAiQuantityAssumptionDeps DED, TAPI dengan productId chat sendiri
 * ('EZRAB_AI'; tipe DED hanya mengizinkan productId DED). Tes
 * menginjeksikan stub `execute` — tanpa live gateway, tanpa network.
 * Tanpa kode metering klien, tanpa field billing (keputusan §5.5).
 */
export interface ChatRabCompletionDeps {
  execute: (request: AiToolsRequest) => Promise<AiToolsResult<unknown>>;
  productId: 'EZRAB_AI';
  timeoutMs?: number;
}

/* ------------------------------------------------------------------ */
/* Adapter chat ↔ FullAiItem                                           */
/* ------------------------------------------------------------------ */

/**
 * Sumber harga FullAiItem untuk item chat yang SUDAH berharga. Dipakai
 * HANYA untuk status interim di dalam pass DED yang dipakai ulang —
 * dibuang saat map-back (field asli item chat yang otoritatif).
 * FullAiPriceSource tidak punya anggota MARKET_REFERENCE; klaim sumber
 * eksternal yang belum terkonfirmasi dipetakan ke VERIFIED_SOURCE
 * (anggota legasi dengan makna terdekat — "klaim belum terverifikasi
 * independen", BUKAN "terverifikasi").
 */
function priceSourceForAdapted(
  it: AdaptableChatItem,
  priced: boolean,
): FullAiPriceSource {
  if (!priced) return 'UNRESOLVED';
  if (it.priceSourceKind === 'OFFICIAL_AHSP') return 'AHSP_2026';
  if (it.priceStatus === 'PRICE_MANUAL' || it.priceSourceKind === 'USER_MANUAL') {
    return 'USER_INPUT';
  }
  if (it.priceSourceKind === 'EZRAB_ASSUMPTION') return 'AI_ESTIMATE';
  return 'VERIFIED_SOURCE';
}

export function adaptChatItemsToFullAi(items: AdaptableChatItem[]): FullAiItem[] {
  return items.map((it, idx) => {
    const volume =
      typeof it.volume === 'number' && Number.isFinite(it.volume) ? it.volume : null;
    const unit = (it.unit ?? '').trim();
    const priced = isPriceValidForTotal(it);
    const unitPrice = priced && typeof it.unitPrice === 'number' ? it.unitPrice : null;
    const quantity = {
      value: volume,
      unit,
      formula: it.formula ?? undefined,
      provenance: (volume != null ? 'DERIVED' : 'UNRESOLVED') as FullAiItem['quantity']['provenance'],
      confidence: 'MEDIUM' as const,
    };
    const price = {
      unitPrice,
      unit,
      source: priceSourceForAdapted(it, priced),
      ahspCode: it.ahspCode ?? undefined,
    };
    const subtotal = volume != null && unitPrice != null ? volume * unitPrice : null;
    const { status, exclusionReason } = resolveFullAiItemStatus(
      { value: quantity.value, unit: quantity.unit, provenance: quantity.provenance },
      { unitPrice: price.unitPrice, unit: price.unit, source: price.source },
    );
    return {
      id: `chat-${idx + 1}`,
      no: idx + 1,
      name: it.description,
      category: (it.category ?? it.group ?? 'Lainnya') || 'Lainnya',
      wbsGroup: it.group ?? undefined,
      quantity,
      price,
      subtotal,
      subtotalVerified: subtotal != null,
      status,
      exclusionReason,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Prompt builders (tinggal di modul ini — tanpa menyentuh ded-full-ai) */
/* ------------------------------------------------------------------ */

export interface ChatRabPricePromptInput {
  projectType: string;
  projectLabel?: string;
  quality: QualityTier;
  budgetCap: number | null;
  region?: string | null;
  items: Array<{
    no: number;
    name: string;
    unit: string;
    category: string;
    volume?: number | null;
    formula?: string;
  }>;
}

export function buildChatRabPriceAssumptionPrompt(
  input: ChatRabPricePromptInput,
): { system: string; prompt: string } {
  const system = `Kamu Quantity Surveyor AI senior untuk proyek konstruksi.
Tugasmu: isi harga satuan yang KOSONG pada item-item RAB di bawah dengan ASUMSI estimasi pasar yang masuk akal — seperti estimator manusia yang bekerja tanpa daftar harga resmi. Setiap harga HARUS punya spek material dan dasar asumsi yang dinyatakan.

ATURAN:
- Keluarkan JSON MURNI. Tanpa markdown, tanpa teks lain.
- Satu entri per item, dicocokkan lewat field "no" — JANGAN ubah nomor, nama, atau satuan item. Gema satuan item apa adanya di field "unit".
- "unitPrice" = angka saja dalam rupiah per satuan (contoh: 125000), bukan object; tanpa koma/titik pemisah ribuan.
- "spec" = spek material satu baris (contoh: "bata merah, spesi 1:4, plester 15 mm"); "basis" = dasar asumsi dalam satu kalimat (contoh: "harga pasar material + upah wilayah proyek, kualitas standar").
- Harga adalah estimasi pasar Indonesia 2026 menurut pengetahuanmu sendiri — TANPA tabel acuan.
- Kualitas yang dipakai: ${input.quality.toUpperCase()} — harga satuan untuk kualitas itu.
- JANGAN tulis kode AHSP apa pun. Kode AHSP hanya berasal dari database resmi, bukan dari model.
- WAJIB isi SEMUA item — TIDAK ADA "unitPrice": null.

STRUKTUR OUTPUT:
{ "fills": [ { "no": 1, "unitPrice": 125000, "unit": "m2", "spec": "bata merah, spesi 1:4, plester 15 mm", "basis": "harga pasar material + upah wilayah proyek, kualitas standar" } ] }`;

  const contextLines: string[] = [];
  if (input.projectLabel) contextLines.push(`Proyek: "${input.projectLabel}"`);
  contextLines.push(`Jenis proyek: "${input.projectType}"`);
  contextLines.push(`Kualitas: ${input.quality.toUpperCase()}`);
  if (input.budgetCap != null) {
    contextLines.push(`Anggaran (cap): ${formatRupiah(input.budgetCap)} — dipakai sebagai pembanding, bukan untuk memangkas lingkup diam-diam.`);
  }
  contextLines.push(`Wilayah harga: ${input.region ?? 'DKI Jakarta (default — nyatakan bila wilayah sebenarnya berbeda)'}.`);
  const itemLines = input.items
    .map((it) => {
      const volPart =
        typeof it.volume === 'number' && Number.isFinite(it.volume)
          ? `; volume: ${it.volume} ${it.unit}`
          : '';
      const formulaPart = it.formula && it.formula.trim() ? `; rumus volume: "${it.formula.trim()}"` : '';
      return `- no ${it.no}: "${it.name}" (satuan: ${it.unit || '(kosong)'}; kategori: ${it.category}${volPart}${formulaPart})`;
    })
    .join('\n');
  const prompt = `=== ISI HARGA SATUAN KOSONG DENGAN ASUMSI ===
${contextLines.join('\n')}

ITEM TANPA HARGA (isi unitPrice + unit + spec + basis untuk tiap item):
${itemLines}

Keluarkan JSON MURNI sesuai struktur output pada system prompt.`;

  return { system, prompt };
}

export interface ChatRabQuantityPromptInput {
  projectType: string;
  projectLabel?: string;
  contextLines: string[];
  items: Array<{ no: number; name: string; unit: string; category: string; formula?: string }>;
}

export function buildChatRabQuantityAssumptionPrompt(
  input: ChatRabQuantityPromptInput,
): { system: string; prompt: string } {
  const system = `Kamu Quantity Surveyor AI senior untuk proyek konstruksi.
Tugasmu: isi kuantitas yang KOSONG pada item-item RAB di bawah dengan ASUMSI yang masuk akal — seperti estimator manusia yang bekerja tanpa gambar lengkap. Setiap angka HARUS punya dasar yang dinyatakan (rumus + asumsi); angka harus mengikuti rumus itu.

ATURAN:
- Keluarkan JSON MURNI. Tanpa markdown, tanpa teks lain.
- Satu entri per item, dicocokkan lewat field "no" — JANGAN ubah nomor, nama, atau satuan item.
- "qty" = angka saja (contoh: 12.5), bukan object; tanpa koma pemisah ribuan.
- "formula" = rumus singkat yang menghasilkan qty (contoh: "19,45 / 9" atau "30 x 0,32"); "basis" = dasar asumsi dalam satu kalimat (contoh: "satu titik penerangan per ±9 m² luas lantai").
- Dasarkan asumsi pada konteks proyek yang diketahui (bila ada) dan ukuran tipikal jenis proyek ini.
- WAJIB isi SEMUA item — TIDAK ADA "qty": null. Item yang rumusnya sudah tercantum di bawah: hitung qty dari rumus itu.

STRUKTUR OUTPUT:
{ "fills": [ { "no": 1, "qty": 12.5, "formula": "25 x 0,5", "basis": "panjang dinding 25 m dari keliling denah, tebal 0,5 m" } ] }`;

  const contextBlock =
    input.contextLines.length > 0
      ? `KONTEKS PROYEK YANG DIKETAHUI:\n${input.contextLines.map((l) => `- ${l}`).join('\n')}\n\n`
      : '';
  const itemLines = input.items
    .map((it) => {
      const formulaPart = it.formula && it.formula.trim()
        ? `; rumus dari rencana: "${it.formula.trim()}"`
        : '';
      return `- no ${it.no}: "${it.name}" (satuan: ${it.unit || '(kosong)'}; kategori: ${it.category}${formulaPart})`;
    })
    .join('\n');
  const prompt = `=== ISI KUANTITAS KOSONG DENGAN ASUMSI ===
Proyek tipe "${input.projectType}"${input.projectLabel ? ` ("${input.projectLabel}")` : ''}.

${contextBlock}ITEM TANPA KUANTITAS (isi qty + formula + basis untuk tiap item):
${itemLines}

Keluarkan JSON MURNI sesuai struktur output pada system prompt.`;

  return { system, prompt };
}

/* ------------------------------------------------------------------ */
/* Util pass AI                                                        */
/* ------------------------------------------------------------------ */

function normalizeUnitForCompare(u: string | null | undefined): string {
  return (u ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '')
    .replace(/m2/g, 'm²')
    .replace(/m3/g, 'm³');
}

function chunkOf<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Ambil payload fills dari hasil execute: pakai `structured` bila
 * klien sudah mem-parse-nya, else extractJson atas content. null =
 * tidak dapat diparse (fail-soft per chunk — bukan throw).
 */
function parseFillsPayload(result: AiToolsResult<unknown>): Record<string, unknown> | null {
  if (!result.success) return null;
  const ok = result as AiToolsSuccess<unknown>;
  if (ok.structured != null && typeof ok.structured === 'object' && !Array.isArray(ok.structured)) {
    return ok.structured as Record<string, unknown>;
  }
  try {
    const parsed = aiToolsProviderClient.extractJson<unknown>(ok.content ?? '');
    if (parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function refreshFullAiSubtotal(it: FullAiItem): void {
  const qty = it.quantity?.value;
  const price = it.price?.unitPrice;
  const subtotal =
    typeof qty === 'number' && Number.isFinite(qty) && typeof price === 'number' && Number.isFinite(price)
      ? qty * price
      : null;
  const { status, exclusionReason } = resolveFullAiItemStatus(
    { value: it.quantity.value, unit: it.quantity.unit, provenance: it.quantity.provenance },
    { unitPrice: it.price.unitPrice, unit: it.price.unit, source: it.price.source },
  );
  const include = status === 'READY' && subtotal != null && subtotal > 0;
  it.subtotal = include ? subtotal : null;
  it.subtotalVerified = include;
  it.status = include ? 'READY' : status;
  it.exclusionReason = include ? null : exclusionReason;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : 'kesalahan tak dikenal';
}

/* ------------------------------------------------------------------ */
/* Pass asumsi harga AI (fungsi baru — dimodelkan 1:1 pada             */
/* completeFullAiQuantitiesWithAi DED)                                 */
/* ------------------------------------------------------------------ */

export interface ChatRabPriceAssumptionResult {
  attempted: number;
  filled: number;
  /** true bila SEMUA chunk gagal transport/parse (nol chunk berhasil). */
  failed: boolean;
  failureMessage?: string;
  unfilled: number;
  fills: ChatRabPriceFill[];
  /** Pesan kegagalan per chunk (fail-soft per chunk). */
  chunkFailures: string[];
  /** Isian yang ditolak validasi (hitungan + alasan ringkas). */
  rejectedCount: number;
  rejectedReasons: string[];
  /** Jumlah panggilan execute yang dieksekusi (satu per chunk). */
  calls: number;
}

/**
 * SATU-SATUNYA pass harga AI di jalur chat: meminta model mengisi harga
 * satuan + spek + basis untuk item-item yang diberikan (pemanggil yang
 * menyaring target — pass ini mengisi SEMUA item yang diterimanya,
 * sehingga re-run downgrade bisa menargetkan ulang item yang sama).
 *
 * Validasi per isian (SEMUA wajib — bila satu gagal, isian dibuang dan
 * item tetap UNRESOLVED + terdaftar unfilled):
 * - unitPrice angka positif finite + lolos isSaneEstimate (Rp100–Rp50 M);
 * - spec + basis tak kosong;
 * - satuan gema (bila ada) cocok dengan satuan item — tanpa konversi diam-diam;
 * - `ahspCode` apa pun dari model DI-STRIP (tidak pernah dibaca/diterapkan).
 *
 * Kegagalan transport/parse per chunk TIDAK pernah throw: chunk gagal
 * fail-soft untuk item-itemnya saja, chunk lain tetap jalan.
 */
export async function completeChatRabPricesWithAi(
  items: FullAiItem[],
  deps: ChatRabCompletionDeps,
  opts: {
    quality: QualityTier;
    budgetCap: number | null;
    region?: string | null;
    projectType: string;
    projectLabel?: string;
  },
): Promise<ChatRabPriceAssumptionResult> {
  const empty: ChatRabPriceAssumptionResult = {
    attempted: 0,
    filled: 0,
    failed: false,
    unfilled: 0,
    fills: [],
    chunkFailures: [],
    rejectedCount: 0,
    rejectedReasons: [],
    calls: 0,
  };
  if (items.length === 0) return empty;
  const timeoutMs = deps.timeoutMs ?? CHAT_RAB_COMPLETION_TIMEOUT_MS;
  const fills: ChatRabPriceFill[] = [];
  const chunkFailures: string[] = [];
  const rejectedReasons: string[] = [];
  let rejectedCount = 0;
  let calls = 0;
  let succeededChunks = 0;
  const chunks = chunkOf(items, CHAT_RAB_COMPLETION_CHUNK_SIZE);
  for (const chunk of chunks) {
    const built = buildChatRabPriceAssumptionPrompt({
      projectType: opts.projectType,
      projectLabel: opts.projectLabel,
      quality: opts.quality,
      budgetCap: opts.budgetCap,
      region: opts.region,
      items: chunk.map((it) => ({
        no: it.no,
        name: it.name,
        unit: it.quantity.unit,
        category: it.category,
        volume: it.quantity.value,
        formula: it.quantity.formula,
      })),
    });
    let result: AiToolsResult<unknown>;
    try {
      calls += 1;
      result = await deps.execute({
        productId: deps.productId,
        prompt: built.prompt,
        systemPrompt: built.system,
        jsonMode: true,
        maxTokens: CHAT_RAB_COMPLETION_MAX_TOKENS,
        timeoutMs,
      });
    } catch (e) {
      chunkFailures.push(`Chunk harga (item ${chunk[0].no}–${chunk[chunk.length - 1].no}) gagal: ${errorText(e)}`);
      continue;
    }
    if (!result.success) {
      chunkFailures.push(
        `Chunk harga (item ${chunk[0].no}–${chunk[chunk.length - 1].no}) gagal: ${result.message || result.errorCode || 'AI gagal memproses'}`,
      );
      continue;
    }
    const parsed = parseFillsPayload(result);
    if (!parsed) {
      chunkFailures.push(
        `Chunk harga (item ${chunk[0].no}–${chunk[chunk.length - 1].no}) gagal: respons asumsi harga bukan JSON valid`,
      );
      continue;
    }
    succeededChunks += 1;
    const rawFills: Array<Record<string, unknown>> = Array.isArray(parsed.fills)
      ? (parsed.fills as Array<Record<string, unknown>>)
      : [];
    const byNo = new Map<number, FullAiItem>();
    for (const it of chunk) byNo.set(it.no, it);
    for (const raw of rawFills) {
      const no = raw?.no;
      const it = typeof no === 'number' ? byNo.get(no) : undefined;
      if (!it) continue;
      const unitPrice = raw?.unitPrice;
      const spec = typeof raw?.spec === 'string' ? raw.spec.trim() : '';
      const basis = typeof raw?.basis === 'string' ? raw.basis.trim() : '';
      const unitEcho = typeof raw?.unit === 'string' ? raw.unit.trim() : '';
      // NOTE: raw.ahspCode SENGAJA tidak pernah dibaca — kode AHSP dari
      // model di-strip (preseden applyFullAiPricePolicy).
      let reason: string | null = null;
      if (typeof unitPrice !== 'number' || !Number.isFinite(unitPrice) || unitPrice <= 0) {
        reason = 'harga bukan angka positif';
      } else if (!isSaneEstimate(unitPrice)) {
        reason = `harga ${unitPrice} di luar pita wajar (Rp100–Rp50 M)`;
      } else if (!spec) {
        reason = 'spek kosong';
      } else if (!basis) {
        reason = 'basis kosong';
      } else if (
        unitEcho !== '' &&
        normalizeUnitForCompare(unitEcho) !== normalizeUnitForCompare(it.quantity.unit)
      ) {
        reason = `satuan "${unitEcho}" tidak cocok dengan satuan item "${it.quantity.unit}"`;
      }
      if (reason) {
        rejectedCount += 1;
        rejectedReasons.push(`Item "${it.name}": isian harga ditolak (${reason})`);
        continue;
      }
      const rounded = Math.round(unitPrice as number);
      it.price = {
        ...it.price,
        unitPrice: rounded,
        source: 'AI_ESTIMATE',
        notes: basis,
      };
      refreshFullAiSubtotal(it);
      fills.push({ no: it.no, unitPrice: rounded, spec, basis, unit: it.quantity.unit });
      byNo.delete(it.no); // satu isian per item (duplikat no diabaikan)
    }
  }
  const failed = chunks.length > 0 && succeededChunks === 0;
  return {
    attempted: items.length,
    filled: fills.length,
    failed,
    failureMessage: failed ? chunkFailures[0] : undefined,
    unfilled: items.length - fills.length,
    fills,
    chunkFailures,
    rejectedCount,
    rejectedReasons,
    calls,
  };
}

/* ------------------------------------------------------------------ */
/* Pass asumsi kuantitas AI (cermin pass harga; hanya bila masih ada   */
/* item tanpa kuantitas sesudah pass konteks + jaring rumus)           */
/* ------------------------------------------------------------------ */

export interface ChatRabQuantityAssumptionResult {
  attempted: number;
  filled: number;
  failed: boolean;
  failureMessage?: string;
  unfilled: number;
  chunkFailures: string[];
  rejectedCount: number;
  calls: number;
}

export async function completeChatRabQuantitiesWithAi(
  items: FullAiItem[],
  deps: ChatRabCompletionDeps,
  opts: {
    projectType: string;
    projectLabel?: string;
    contextLines: string[];
  },
): Promise<ChatRabQuantityAssumptionResult> {
  const empty: ChatRabQuantityAssumptionResult = {
    attempted: 0,
    filled: 0,
    failed: false,
    unfilled: 0,
    chunkFailures: [],
    rejectedCount: 0,
    calls: 0,
  };
  if (items.length === 0) return empty;
  const timeoutMs = deps.timeoutMs ?? CHAT_RAB_COMPLETION_TIMEOUT_MS;
  const chunkFailures: string[] = [];
  let rejectedCount = 0;
  let calls = 0;
  let filled = 0;
  let succeededChunks = 0;
  const chunks = chunkOf(items, CHAT_RAB_COMPLETION_CHUNK_SIZE);
  for (const chunk of chunks) {
    const built = buildChatRabQuantityAssumptionPrompt({
      projectType: opts.projectType,
      projectLabel: opts.projectLabel,
      contextLines: opts.contextLines,
      items: chunk.map((it) => ({
        no: it.no,
        name: it.name,
        unit: it.quantity.unit,
        category: it.category,
        formula: it.quantity.formula,
      })),
    });
    let result: AiToolsResult<unknown>;
    try {
      calls += 1;
      result = await deps.execute({
        productId: deps.productId,
        prompt: built.prompt,
        systemPrompt: built.system,
        jsonMode: true,
        maxTokens: CHAT_RAB_COMPLETION_MAX_TOKENS,
        timeoutMs,
      });
    } catch (e) {
      chunkFailures.push(`Chunk kuantitas (item ${chunk[0].no}–${chunk[chunk.length - 1].no}) gagal: ${errorText(e)}`);
      continue;
    }
    if (!result.success) {
      chunkFailures.push(
        `Chunk kuantitas (item ${chunk[0].no}–${chunk[chunk.length - 1].no}) gagal: ${result.message || result.errorCode || 'AI gagal memproses'}`,
      );
      continue;
    }
    const parsed = parseFillsPayload(result);
    if (!parsed) {
      chunkFailures.push(
        `Chunk kuantitas (item ${chunk[0].no}–${chunk[chunk.length - 1].no}) gagal: respons asumsi kuantitas bukan JSON valid`,
      );
      continue;
    }
    succeededChunks += 1;
    const rawFills: Array<Record<string, unknown>> = Array.isArray(parsed.fills)
      ? (parsed.fills as Array<Record<string, unknown>>)
      : [];
    const byNo = new Map<number, FullAiItem>();
    for (const it of chunk) byNo.set(it.no, it);
    for (const raw of rawFills) {
      const no = raw?.no;
      const it = typeof no === 'number' ? byNo.get(no) : undefined;
      if (!it) continue;
      const qty = raw?.qty;
      const formula = typeof raw?.formula === 'string' ? raw.formula.trim() : '';
      const basis = typeof raw?.basis === 'string' ? raw.basis.trim() : '';
      const unitEcho = typeof raw?.unit === 'string' ? raw.unit.trim() : '';
      // Tanpa angka positif atau tanpa dasar yang dinyatakan → tidak diisi
      // (aturan yang sama dengan completeFullAiQuantitiesWithAi DED).
      if (typeof qty !== 'number' || !Number.isFinite(qty) || qty <= 0) {
        rejectedCount += 1;
        continue;
      }
      if (!formula && !basis) {
        rejectedCount += 1;
        continue;
      }
      if (
        unitEcho !== '' &&
        normalizeUnitForCompare(unitEcho) !== normalizeUnitForCompare(it.quantity.unit)
      ) {
        rejectedCount += 1;
        continue;
      }
      const original = it.quantity.value;
      it.quantity = {
        ...it.quantity,
        value: qty,
        formula: formula || basis,
        provenance: 'ASSUMPTION',
        confidence: 'MEDIUM',
        assumptions: basis ? [...(it.quantity.assumptions ?? []), basis] : it.quantity.assumptions,
        notes: [it.quantity.notes, `Kuantitas dilengkapi dari asumsi AI (nilai asli: ${original == null ? 'kosong' : original}). Estimasi — bukan fakta gambar.`]
          .filter(Boolean)
          .join(' '),
      };
      refreshFullAiSubtotal(it);
      filled += 1;
      byNo.delete(it.no);
    }
  }
  const failed = chunks.length > 0 && succeededChunks === 0;
  return {
    attempted: items.length,
    filled,
    failed,
    failureMessage: failed ? chunkFailures[0] : undefined,
    unfilled: items.length - filled,
    chunkFailures,
    rejectedCount,
    calls,
  };
}

/* ------------------------------------------------------------------ */
/* Map-back ke item chat asli                                          */
/* ------------------------------------------------------------------ */

function appendNote(existing: string | null | undefined, addition: string): string {
  const base = (existing ?? '').trim();
  return base ? `${base} ${addition}` : addition;
}

/**
 * Petakan isian kembali ke item chat ASLI (bukan salinan FullAiItem):
 * - harga → unitPrice + amount/totalPrice + PRICE_ESTIMATED +
 *   EZRAB_ASSUMPTION + 'Estimasi AI (asumsi)' + basis di
 *   priceSourceExplanation + spek/basis di notes + NEEDS_VERIFICATION;
 * - kuantitas → volume + volumeSource AI_GENERATED + basis di notes.
 * Murni (mengembalikan salinan baru — pemanggil yang memutuskan apakah
 * salinan itu ditulis kembali ke draft). Harga resolved TIDAK PERNAH
 * ditimpa (isian hanya berlaku di mana isPriceValidForTotal false);
 * kode AHSP asli item TIDAK PERNAH diubah (isian tidak membawa kode).
 */
export function applyCompletionToChatItems<T extends AdaptableChatItem>(
  items: T[],
  fills: ChatRabCompletionFills,
): Array<CompletedChatItem<T>> {
  const priceByNo = new Map(fills.prices.map((f) => [f.no, f]));
  const qtyByNo = new Map(fills.quantities.map((f) => [f.no, f]));
  return items.map((it, idx) => {
    const no = idx + 1;
    const out = { ...it } as CompletedChatItem<T>;
    const qf = qtyByNo.get(no);
    const volumeInvalid =
      !(typeof it.volume === 'number' && Number.isFinite(it.volume) && it.volume > 0);
    if (qf && volumeInvalid) {
      out.volume = qf.quantity;
      out.volumeSource = 'AI_GENERATED';
      out.notes = appendNote(
        out.notes,
        `Kuantitas (asumsi AI): ${qf.quantity} ${it.unit ?? ''} — ${qf.basis}${qf.formula ? ` (rumus: ${qf.formula})` : ''}`,
      );
    }
    const pf = priceByNo.get(no);
    if (pf && !isPriceValidForTotal(it)) {
      const vol = out.volume;
      // Dibulatkan seperti totalPrice engine (Math.round per item) —
      // rupiah tak bersub-satuan; tanpa ini vol pecahan × harga
      // meninggalkan artefak float di total + tampilan.
      const amount =
        typeof vol === 'number' && Number.isFinite(vol) ? Math.round(vol * pf.unitPrice) : null;
      out.unitPrice = pf.unitPrice;
      out.amount = amount;
      out.totalPrice = amount;
      out.priceStatus = 'PRICE_ESTIMATED';
      out.priceSourceKind = 'EZRAB_ASSUMPTION';
      out.priceSourceLabel = 'Estimasi AI (asumsi)';
      out.priceSourceExplanation = `Spek: ${pf.spec}. Dasar: ${pf.basis}`;
      out.verificationStatus = 'NEEDS_VERIFICATION';
      out.notes = appendNote(out.notes, `Spek (asumsi AI): ${pf.spec}. Dasar harga: ${pf.basis}`);
    }
    return out;
  });
}

/* ------------------------------------------------------------------ */
/* Total (dihitung ulang deterministik oleh aplikasi)                  */
/* ------------------------------------------------------------------ */

/**
 * Total deterministik atas item terisi. Jalur universal/workspace
 * mendelegasikan ke totalsFromItems (JANGAN reimplementasi — kontrak
 * P3B). Jalur parametrik memakai varian lineTotal (cermin
 * formatDirectRabMessage): jumlah per item memakai totalPrice engine
 * bila ada (agar total blok completion persis sama dengan subtotal
 * tabel yang dirender), else volume × unitPrice; ember harga sama
 * dengan totalsFromItems.
 */
export function recomputeTotalsForItems(
  items: Array<{
    volume: number | null;
    unitPrice?: number | null;
    priceStatus?: string | null;
    priceSourceKind?: string | null;
    ahspMappingStatus?: string | null;
    totalPrice?: number | null;
  }>,
  opts?: { useLineTotals?: boolean },
): DraftTotals {
  if (!opts?.useLineTotals) {
    return totalsFromItems(
      items.map((it) => ({
        volume: it.volume ?? 0,
        unitPrice: it.unitPrice,
        priceStatus: it.priceStatus,
        priceSourceKind: it.priceSourceKind,
        ahspMappingStatus: it.ahspMappingStatus,
      })),
    );
  }
  let verifiedTotal = 0;
  let databaseTotal = 0;
  let marketTotal = 0;
  let manualTotal = 0;
  let officialCount = 0;
  let databaseCount = 0;
  let marketCount = 0;
  let manualCount = 0;
  let unpricedCount = 0;
  let needsSpecCount = 0;
  for (const it of items) {
    if (it.ahspMappingStatus === 'NEEDS_MAPPING') needsSpecCount++;
    if (!isPriceValidForTotal(it)) {
      unpricedCount++;
      continue;
    }
    const vol = it.volume ?? 0;
    const amt =
      typeof it.totalPrice === 'number' && Number.isFinite(it.totalPrice)
        ? it.totalPrice
        : vol * (it.unitPrice as number);
    if (it.priceStatus === 'PRICE_MANUAL') {
      manualTotal += amt;
      manualCount++;
    } else if (it.priceSourceKind === 'OFFICIAL_AHSP') {
      verifiedTotal += amt;
      officialCount++;
    } else if (it.priceSourceKind === 'MARKET_REFERENCE') {
      marketTotal += amt;
      marketCount++;
    } else {
      databaseTotal += amt;
      databaseCount++;
    }
  }
  const estimatedTotal = verifiedTotal + databaseTotal + marketTotal + manualTotal;
  const status =
    unpricedCount > 0
      ? 'PARSIAL'
      : databaseCount > 0 || marketCount > 0 || manualCount > 0
        ? 'ESTIMASI'
        : 'LENGKAP';
  return {
    verifiedTotal,
    databaseTotal,
    marketTotal,
    manualTotal,
    estimatedTotal,
    officialCount,
    databaseCount,
    marketCount,
    manualCount,
    unpricedCount,
    needsSpecCount,
    status,
  };
}

/* ------------------------------------------------------------------ */
/* Orkestrator                                                         */
/* ------------------------------------------------------------------ */

export interface CompleteBudgetRabInput {
  items: AdaptableChatItem[];
  budgetCap: number | null;
  quality?: string | null;
  region?: string | null;
  /** Jenis proyek (string bebas dari draft/spek — konteks prompt saja). */
  projectType: string;
  projectLabel?: string;
  deps: ChatRabCompletionDeps;
  /** Jalur parametrik: total memakai lineTotal (lihat recomputeTotalsForItems). */
  useLineTotals?: boolean;
}

export interface FullAiRabCompletionResult {
  /** Salinan item terisi (urutan + panjang sama dengan input; TANPA fills = salinan apa adanya). */
  items: Array<CompletedChatItem>;
  /** Isian akhir yang diterapkan (sesudah merge downgrade — untuk ringkasan + tes). */
  fills: ChatRabCompletionFills;
  filledPriceCount: number;
  filledQuantityCount: number;
  /** Deskripsi item yang MASIH tanpa harga valid sesudah semua pass. */
  unfilled: string[];
  /** Deskripsi item yang MASIH tanpa kuantitas valid sesudah semua pass. */
  unfilledQuantity: string[];
  warnings: string[];
  qualityUsed: QualityTier;
  qualityDowngradedFrom?: QualityTier;
  qualityDefaulted: boolean;
  /** Total sesudah pass tier permintaan (sebelum downgrade) — hanya bila downgrade terjadi. */
  totalAtRequestedTier?: number | null;
  requestedTierVerdict?: BudgetFeasibility | null;
  totals: DraftTotals;
  feasibility: BudgetFeasibility;
  /** true bila AI tidak menghasilkan isian apa pun DAN ada kegagalan AI. */
  failed: boolean;
  failureMessage?: string;
  /** Jumlah panggilan execute yang dieksekusi (chunk harga + kuantitas + re-run downgrade). */
  aiCallCount: number;
}

/**
 * Kumpulkan isian kuantitas dari item teradaptasi (perbandingan dengan
 * aslinya): semua sumber kuantitas (konteks/rumus/AI) menulis ke
 * FullAiItem yang sama, jadi diff ini menangkap ketiganya seragam.
 * Isian TANPA dasar yang tercatat (tanpa assumptions maupun formula)
 * DIBUANG — asumsi tanpa dasar bukan asumsi (guard §9.1).
 */
function collectQuantityFills(
  originals: AdaptableChatItem[],
  adapted: FullAiItem[],
): ChatRabQuantityFill[] {
  const fills: ChatRabQuantityFill[] = [];
  adapted.forEach((it, idx) => {
    const orig = originals[idx];
    const origVol =
      typeof orig.volume === 'number' && Number.isFinite(orig.volume) && orig.volume > 0
        ? orig.volume
        : null;
    const v = it.quantity?.value;
    if (origVol != null) return;
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return;
    const assumptions = (it.quantity.assumptions ?? []).filter(
      (a) => typeof a === 'string' && a.trim() !== '',
    );
    const basis = assumptions.length > 0 ? assumptions[assumptions.length - 1] : '';
    const formula = (it.quantity.formula ?? '').trim();
    if (!basis && !formula) return; // tanpa dasar tercatat → buang isian
    fills.push({ no: it.no, quantity: v, formula, basis: basis || formula });
  });
  return fills;
}

export async function completeBudgetRabWithFullAi(
  input: CompleteBudgetRabInput,
): Promise<FullAiRabCompletionResult> {
  const { tier: requestedTier, defaulted: qualityDefaulted } = normalizeQualityTier(
    input.quality ?? null,
  );
  const warnings: string[] = [];
  const timeoutMs = input.deps.timeoutMs ?? CHAT_RAB_COMPLETION_TIMEOUT_MS;
  const deps: ChatRabCompletionDeps = { ...input.deps, timeoutMs };
  let aiCallCount = 0;

  // 1. Adaptasi.
  const adapted = adaptChatItemsToFullAi(input.items);
  // Warning eksklusi awal (format DED — agar dropStaleExclusionWarnings
  // bisa membersihkan yang basi sesudah pass).
  const initialWarnings: string[] = [];
  for (const it of adapted) {
    if (it.exclusionReason) {
      initialWarnings.push(`Item "${it.name}" tidak masuk total [${it.exclusionReason}]`);
    }
  }

  // 2–3. Pass kuantitas deterministik (fail-soft per pass: gagalnya satu
  // pass tidak menggagalkan completion — dicatat sebagai warning).
  try {
    completeFullAiQuantities(adapted);
  } catch (e) {
    warnings.push(`Pass kuantitas konteks gagal (${errorText(e)}) — dilanjutkan tanpa isian konteks.`);
  }
  try {
    fillFullAiQuantitiesFromFormulas(adapted);
  } catch (e) {
    warnings.push(`Jaring rumus kuantitas gagal (${errorText(e)}) — dilanjutkan tanpa isian rumus.`);
  }

  // 4a. Pass asumsi kuantitas AI — hanya bila masih ada item tanpa
  // kuantitas (dan bersatuan) sesudah kedua pass deterministik.
  const missingQty = adapted.filter(
    (it) => it.quantity?.value == null && (it.quantity?.unit || '').trim() !== '',
  );
  if (missingQty.length > 0) {
    const qRes = await completeChatRabQuantitiesWithAi(missingQty, deps, {
      projectType: input.projectType,
      projectLabel: input.projectLabel,
      contextLines: [],
    });
    aiCallCount += qRes.calls;
    if (qRes.failed) {
      warnings.push(`Asumsi kuantitas AI gagal: ${qRes.failureMessage ?? 'AI gagal memproses'}`);
    }
    for (const f of qRes.chunkFailures) warnings.push(f);
    if (qRes.rejectedCount > 0) {
      warnings.push(`${qRes.rejectedCount} isian kuantitas AI ditolak validasi (tanpa angka positif/dasar).`);
    }
  }

  // 4b. Pass asumsi harga AI pada tier permintaan.
  const priceTargets = adapted.filter((it) => it.price.unitPrice == null);
  const priceRes = await completeChatRabPricesWithAi(priceTargets, deps, {
    quality: requestedTier,
    budgetCap: input.budgetCap,
    region: input.region,
    projectType: input.projectType,
    projectLabel: input.projectLabel,
  });
  aiCallCount += priceRes.calls;
  if (priceRes.failed) {
    warnings.push(`Asumsi harga AI gagal: ${priceRes.failureMessage ?? 'AI gagal memproses'}`);
  }
  for (const f of priceRes.chunkFailures) warnings.push(f);
  for (const r of priceRes.rejectedReasons.slice(0, 5)) warnings.push(r);
  if (priceRes.rejectedReasons.length > 5) {
    warnings.push(`…dan ${priceRes.rejectedReasons.length - 5} isian harga ditolak validasi lainnya.`);
  }

  // 5. Rekonsiliasi rumus (angka harus mengikuti rumus yang dinyatakan).
  try {
    reconcileFullAiQuantityFormulas(adapted);
  } catch (e) {
    warnings.push(`Rekonsiliasi rumus kuantitas gagal (${errorText(e)}) — angka dibiarkan apa adanya.`);
  }

  // 6. Bersihkan warning eksklusi yang sudah basi (item kini masuk total).
  const liveWarnings = dropStaleExclusionWarnings(initialWarnings, adapted);
  for (const w of liveWarnings) warnings.push(w);

  // 7–9. Map-back → total recomputed → verdict.
  let priceFills = priceRes.fills;
  const quantityFills = collectQuantityFills(input.items, adapted);
  let completed = applyCompletionToChatItems(input.items, {
    prices: priceFills,
    quantities: quantityFills,
  });
  let totals = recomputeTotalsForItems(completed, { useLineTotals: input.useLineTotals });
  let feasibility = assessBudgetFeasibility({
    totalPriced: totals.estimatedTotal,
    unpricedCount: totals.unpricedCount,
    budgetCap: input.budgetCap,
  });

  // Downgrade SATU tingkat bila OVER (DESIGN.md §5 — dinyatakan terbuka).
  let qualityUsed: QualityTier = requestedTier;
  let qualityDowngradedFrom: QualityTier | undefined;
  let totalAtRequestedTier: number | null | undefined;
  let requestedTierVerdict: BudgetFeasibility | null | undefined;
  const tierDecision = selectBudgetQualityTier({
    requestedTier,
    totalAtRequestedTier: totals.estimatedTotal,
    unpricedCount: totals.unpricedCount,
    budgetCap: input.budgetCap,
  });
  if (tierDecision.downgraded) {
    totalAtRequestedTier = totals.estimatedTotal;
    requestedTierVerdict = feasibility;
    const lowerTier = tierDecision.tierToUse;
    const priceRes2 = await completeChatRabPricesWithAi(priceTargets, deps, {
      quality: lowerTier,
      budgetCap: input.budgetCap,
      region: input.region,
      projectType: input.projectType,
      projectLabel: input.projectLabel,
    });
    aiCallCount += priceRes2.calls;
    for (const f of priceRes2.chunkFailures) warnings.push(f);
    if (priceRes2.filled > 0) {
      const beforeNos = new Set(priceFills.map((f) => f.no));
      const merged = new Map(priceFills.map((f) => [f.no, f]));
      for (const f of priceRes2.fills) merged.set(f.no, f);
      const keptCount = [...beforeNos].filter(
        (no) => !priceRes2.fills.some((f) => f.no === no),
      ).length;
      priceFills = [...merged.values()];
      completed = applyCompletionToChatItems(input.items, {
        prices: priceFills,
        quantities: quantityFills,
      });
      totals = recomputeTotalsForItems(completed, { useLineTotals: input.useLineTotals });
      feasibility = assessBudgetFeasibility({
        totalPriced: totals.estimatedTotal,
        unpricedCount: totals.unpricedCount,
        budgetCap: input.budgetCap,
      });
      qualityUsed = lowerTier;
      qualityDowngradedFrom = requestedTier;
      if (keptCount > 0) {
        warnings.push(
          `${keptCount} item mempertahankan estimasi kualitas ${requestedTier} (pass kualitas ${lowerTier} tidak mengisinya).`,
        );
      }
    } else {
      warnings.push(
        `Penyesuaian kualitas ke ${lowerTier} tidak menghasilkan harga baru (${priceRes2.failureMessage ?? 'tidak ada isian'}) — estimasi kualitas ${requestedTier} dipertahankan.`,
      );
    }
  }

  const filledPriceCount = priceFills.length;
  const filledQuantityCount = quantityFills.length;
  const unfilled = completed.filter((it) => !isPriceValidForTotal(it)).map((it) => it.description);
  const unfilledQuantity = completed
    .filter((it) => !(typeof it.volume === 'number' && Number.isFinite(it.volume) && it.volume > 0))
    .map((it) => it.description);
  const failed =
    priceRes.failed && filledPriceCount === 0 && filledQuantityCount === 0;
  const failureMessage = failed
    ? (priceRes.failureMessage ?? 'Asumsi harga AI gagal — tidak ada isian yang dihasilkan.')
    : undefined;
  if (failed) {
    // Fail-soft total: kembalikan item asli tanpa isian apa pun.
    completed = applyCompletionToChatItems(input.items, { prices: [], quantities: [] });
    totals = recomputeTotalsForItems(completed, { useLineTotals: input.useLineTotals });
    feasibility = assessBudgetFeasibility({
      totalPriced: totals.estimatedTotal,
      unpricedCount: totals.unpricedCount,
      budgetCap: input.budgetCap,
    });
  }

  return {
    items: completed,
    fills: { prices: priceFills, quantities: quantityFills },
    filledPriceCount: failed ? 0 : filledPriceCount,
    filledQuantityCount: failed ? 0 : filledQuantityCount,
    unfilled,
    unfilledQuantity,
    warnings,
    qualityUsed,
    qualityDowngradedFrom,
    qualityDefaulted,
    totalAtRequestedTier,
    requestedTierVerdict,
    totals,
    feasibility,
    failed,
    failureMessage,
    aiCallCount,
  };
}

/* ------------------------------------------------------------------ */
/* Ringkasan completion (data polos untuk formatter pesan)             */
/* ------------------------------------------------------------------ */

export interface FullAiCompletionSummary {
  totalItems: number;
  filledPriceCount: number;
  filledQuantityCount: number;
  unfilled: string[];
  estimatedTotal: number;
  /** Σ qty × harga atas item yang BARU terisi (bukan total keseluruhan). */
  assumedTotal: number;
  unpricedCount: number;
  qualityUsed: QualityTier;
  qualityDefaulted: boolean;
  qualityDowngradedFrom?: QualityTier | null;
  totalAtRequestedTier?: number | null;
  budgetCap: number | null;
  feasibility: BudgetFeasibility;
  warnings: string[];
  /** Detail per item terisi (untuk blok completion jalur parametrik). */
  filledDetails: Array<{
    description: string;
    unitPrice: number;
    unit: string;
    spec: string;
    basis: string;
  }>;
}

export function buildFullAiCompletionSummary(
  result: FullAiRabCompletionResult,
  budgetCap: number | null,
): FullAiCompletionSummary {
  const byNo = new Map(result.items.map((it, idx) => [idx + 1, it]));
  let assumedTotal = 0;
  const filledDetails: FullAiCompletionSummary['filledDetails'] = [];
  for (const f of result.fills.prices) {
    const it = byNo.get(f.no);
    const vol =
      it && typeof it.volume === 'number' && Number.isFinite(it.volume) ? it.volume : 0;
    assumedTotal += vol * f.unitPrice;
    filledDetails.push({
      description: it?.description ?? `Item ${f.no}`,
      unitPrice: f.unitPrice,
      unit: it?.unit ?? f.unit ?? '',
      spec: f.spec,
      basis: f.basis,
    });
  }
  return {
    totalItems: result.items.length,
    filledPriceCount: result.filledPriceCount,
    filledQuantityCount: result.filledQuantityCount,
    unfilled: result.unfilled,
    estimatedTotal: result.totals.estimatedTotal,
    assumedTotal,
    unpricedCount: result.totals.unpricedCount,
    qualityUsed: result.qualityUsed,
    qualityDefaulted: result.qualityDefaulted,
    qualityDowngradedFrom: result.qualityDowngradedFrom ?? null,
    totalAtRequestedTier: result.totalAtRequestedTier ?? null,
    budgetCap,
    feasibility: result.feasibility,
    warnings: result.warnings,
    filledDetails,
  };
}

/**
 * Predikat penawaran completion (dipakai view + tes revisi): draft
 * ber-budget dengan item belum berharga layak ditawari tombol
 * "Lengkapi dengan Full AI". Tanpa budget / tanpa item belum berharga
 * / tanpa item → tidak ditawari (gerbang Q7: v1 hanya request
 * ber-budget).
 */
export function draftNeedsFullAiCompletion(args: {
  budgetCap: number | null;
  unpricedCount: number;
  totalItems: number;
}): boolean {
  return (
    args.totalItems > 0 &&
    args.budgetCap != null &&
    args.budgetCap > 0 &&
    args.unpricedCount > 0
  );
}

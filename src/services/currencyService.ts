/**
 * EZRAB — LAYANAN MATA UANG (currency service terpusat, display-only)
 * =====================================================================
 * KEBIJAKAN MATA UANG (baca sebelum mengubah file ini):
 *
 * 1. IDR adalah mata uang dasar (base) dan satu-satunya mata uang nilai
 *    sumber resmi. USD, JPY, CNY, EUR hanyalah mata uang TAMPIL/REFERENSI.
 * 2. Konversi TIDAK PERNAH mengubah nilai tersimpan: harga resmi AHSP,
 *    harga proyek, item RAB, laporan historis, dan ekspor tetap IDR.
 *    Konversi hanya terjadi di lapisan tampil, dari nilai sumber IDR.
 * 3. Konversi TIDAK PERNAH dilakukan di dalam kalkulasi engine, kalkulasi
 *    hasil AI, koefisien, kuantitas, atau satuan fisik.
 * 4. Nilai konversi SELALU dilabeli estimasi/konversi referensi, BUKAN
 *    harga resmi AHSP. Nilai resmi, manual, referensi pasar, dan nilai
 *    konversi harus selalu dapat dibedakan.
 * 5. Harga yang belum tersedia tetap unresolved/null — tidak pernah
 *    diganti 0, tidak pernah ditebak, tidak pernah dikonversi dari 0
 *    menjadi angka seolah valid (0 yang dikonversi tetap 0, dan itu
 *    hanya sah bila sumbernya memang bernilai 0 yang teresolusi).
 * 6. TIDAK ADA double conversion: nilai yang sudah bertanda converted
 *    ditolak bila diumpankan kembali ke fungsi konversi.
 * 7. TIDAK ADA total campuran mata uang tanpa konversi eksplisit yang
 *    tertelusur: setiap item yang dijumlah ke satu total tampil harus
 *    memakai kursnya masing-masing; item tanpa kurs yang dapat dipakai
 *    dikeluarkan dari total dan dilaporkan sebagai parsial — bukan
 *    ditebak, bukan 0.
 * 8. ARAH KURS EKSPLISIT: `idrPerUnit` = jumlah IDR per 1 unit mata uang
 *    asing. IDR -> asing: BAGI dengan idrPerUnit. Asing -> IDR: KALI
 *    dengan idrPerUnit. Contoh: idrPerUnit USD = 16000 berarti
 *    1 USD = Rp16.000; Rp32.000 -> US$2; US$2 -> Rp32.000.
 * 9. Kurs basi (stale, > 24 jam): masih dapat dipakai, WAJIB dilabeli
 *    "Kurs lama". Kurs kedaluwarsa (expired, > 7 hari): TIDAK dapat
 *    dipakai untuk konversi baru — jumlah ditandai unresolved untuk
 *    konversi sampai kurs diperbarui atau dimasukkan manual.
 * 10. Kurs manual: sumbernya "Manual (pengguna)" + stempel waktu input.
 *     Entri manual DIPERTAHANKAN sampai pengguna menghapusnya: refresh
 *     provider hanya mengisi/memperbarui entri non-manual (fungsi
 *     mergeProviderRates), tidak pernah menimpa kurs manual diam-diam.
 *     Badge sumber di UI selalu menunjukkan provenance kurs yang sedang
 *     aktif; tombol hapus kurs manual mengembalikan ke jalur provider.
 * 11. Provider eksternal bersifat best-effort dan TANPA secret: endpoint
 *     publik tanpa kunci (open.er-api.com). Gagal fetch TIDAK PERNAH
 *     menghapus last-known rate; UI menampilkan state tidak tersedia /
 *     kurs lama + jalur manual, bukan berpura-pura konversi itu terkini.
 * 12. TIDAK ADA kurs hardcoded yang diklaim live. Angka kurs di tes
 *     adalah fixture, bukan kurs pasar. Ekspor (Excel/PDF) pada fase ini
 *     TETAP IDR-resmi tanpa nilai konversi — konversi adalah referensi
 *     tampil di aplikasi, bukan dokumen. Helper `buildConversionNote`
 *     disediakan (dan dites) untuk wiring ekspor di masa depan, bila
 *     pemilik memutuskan ekspor boleh memuat nilai konversi dengan
 *     metadata lengkap (mata uang, kurs, tanggal kurs, sumber).
 * 13. Kebijakan proyek multi-mata-uang: domain EZRAB menyimpan nilai
 *     sumber dalam IDR. Bila di masa depan suatu nilai sumber tiba
 *     dengan mata uang asing, nilai itu WAJIB membawa kode mata uang +
 *     snapshot kursnya sendiri; tanpa itu, nilai ditandai unresolved
 *     untuk konversi, bukan ditebak dan bukan dikonversi dengan kurs
 *     yang tidak tertelusur.
 */

import { SafeDecimalEngine } from '../engine/safeDecimalEngine';

// ---------------------------------------------------------------------------
// Definisi mata uang (TEPAT 5 — jangan tambah tanpa keputusan pemilik)
// ---------------------------------------------------------------------------

export type CurrencyCode = 'IDR' | 'USD' | 'JPY' | 'CNY' | 'EUR';
export type ForeignCurrencyCode = 'USD' | 'JPY' | 'CNY' | 'EUR';

export interface CurrencyDefinition {
  code: CurrencyCode;
  /** Nama Bahasa Indonesia. */
  name: string;
  /** Simbol tampil (CN¥ dipakai untuk CNY agar tidak tertukar dengan ¥ JPY). */
  symbol: string;
  /** Jumlah digit desimal minor: JPY dan IDR 0; USD/CNY/EUR 2. */
  minorUnitDigits: number;
}

export const SUPPORTED_CURRENCIES: CurrencyCode[] = ['IDR', 'USD', 'JPY', 'CNY', 'EUR'];
export const FOREIGN_CURRENCIES: ForeignCurrencyCode[] = ['USD', 'JPY', 'CNY', 'EUR'];

export const CURRENCY_DEFINITIONS: Record<CurrencyCode, CurrencyDefinition> = {
  IDR: { code: 'IDR', name: 'Rupiah Indonesia', symbol: 'Rp', minorUnitDigits: 0 },
  USD: { code: 'USD', name: 'Dolar Amerika Serikat', symbol: 'US$', minorUnitDigits: 2 },
  JPY: { code: 'JPY', name: 'Yen Jepang', symbol: '¥', minorUnitDigits: 0 },
  CNY: { code: 'CNY', name: 'Yuan Tiongkok', symbol: 'CN¥', minorUnitDigits: 2 },
  EUR: { code: 'EUR', name: 'Euro', symbol: '€', minorUnitDigits: 2 },
};

export function isSupportedCurrency(code: string): code is CurrencyCode {
  return (SUPPORTED_CURRENCIES as string[]).includes(code);
}

export function isForeignCurrency(code: string): code is ForeignCurrencyCode {
  return (FOREIGN_CURRENCIES as string[]).includes(code);
}

// ---------------------------------------------------------------------------
// Kurs
// ---------------------------------------------------------------------------

export interface ExchangeRateSnapshot {
  code: ForeignCurrencyCode;
  /** Jumlah IDR per 1 unit mata uang asing. Arah eksplisit, lihat §8. */
  idrPerUnit: number;
  /** 'open.er-api.com' atau 'Manual (pengguna)'. */
  source: string;
  /** Epoch ms saat kurs diperoleh/dimasukkan. */
  retrievedAtMs: number;
  /** True bila dimasukkan manual oleh pengguna. */
  manual: boolean;
}

/** Di atas ambang ini kurs dilabeli "Kurs lama" (tetap dapat dipakai). */
export const RATE_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
/** Di atas ambang ini kurs TIDAK dapat dipakai untuk konversi baru. */
export const RATE_EXPIRED_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** Endpoint publik tanpa kunci (tidak ada secret yang dikirim/disimpan). */
export const RATE_PROVIDER_URL = 'https://open.er-api.com/v6/latest/IDR';
export const RATE_PROVIDER_NAME = 'open.er-api.com';
export const RATE_FETCH_TIMEOUT_MS = 8000;
export const MANUAL_RATE_SOURCE = 'Manual (pengguna)';

export type RateState = 'available' | 'stale' | 'expired' | 'unavailable' | 'invalid';

export interface RateEvaluation {
  state: RateState;
  /** True hanya untuk available dan stale. */
  usable: boolean;
  reason: string;
}

export function evaluateRate(
  rate: ExchangeRateSnapshot | null | undefined,
  nowMs: number = Date.now(),
): RateEvaluation {
  if (rate == null) {
    return { state: 'unavailable', usable: false, reason: 'Kurs belum tersedia.' };
  }
  if (!Number.isFinite(rate.idrPerUnit) || rate.idrPerUnit <= 0) {
    return { state: 'invalid', usable: false, reason: 'Kurs tidak valid (bukan angka positif).' };
  }
  const age = nowMs - rate.retrievedAtMs;
  if (!Number.isFinite(age) || age < 0) {
    return { state: 'invalid', usable: false, reason: 'Stempel waktu kurs tidak valid.' };
  }
  if (age > RATE_EXPIRED_AFTER_MS) {
    return { state: 'expired', usable: false, reason: 'Kurs kedaluwarsa (> 7 hari). Perbarui kurs atau masukkan kurs manual.' };
  }
  if (age > RATE_STALE_AFTER_MS) {
    return { state: 'stale', usable: true, reason: 'Kurs lama (> 24 jam) — masih dapat dipakai, tetapi sebaiknya diperbarui.' };
  }
  return { state: 'available', usable: true, reason: 'Kurs terkini.' };
}

export function validateIdrPerUnit(
  value: unknown,
): { ok: true; value: number } | { ok: false; reason: string } {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return { ok: false, reason: 'Kurs harus angka positif (Rp per 1 unit mata uang asing).' };
  }
  return { ok: true, value };
}

// ---------------------------------------------------------------------------
// Nilai sumber vs nilai konversi (anti double conversion)
// ---------------------------------------------------------------------------

export type PriceKind = 'official' | 'manual' | 'market' | 'mixed';

/**
 * Nilai sumber resmi dalam IDR. `currency` sengaja dikunci 'IDR': domain
 * EZRAB menyimpan nilai sumber dalam IDR (lihat kebijakan §13 untuk
 * nilai sumber bermata uang asing di masa depan).
 */
export interface SourceAmount {
  amount: number;
  currency: 'IDR';
  kind: PriceKind;
}

/**
 * Nilai tampil hasil konversi. Brand `converted: true` adalah penjaga
 * anti double conversion: nilai ini TIDAK BOLEH diumpankan kembali ke
 * fungsi konversi (runtime guard + type guard menolaknya).
 */
export interface ConvertedDisplayValue {
  readonly value: number;
  readonly currency: CurrencyCode;
  readonly sourceCurrency: 'IDR';
  readonly sourceAmount: number;
  readonly sourceKind: PriceKind;
  readonly rateIdrPerUnit: number;
  readonly rateSource: string;
  readonly rateRetrievedAtMs: number;
  readonly rateState: RateState;
  readonly converted: true;
}

export function isConvertedDisplayValue(v: unknown): v is ConvertedDisplayValue {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as ConvertedDisplayValue).converted === true &&
    typeof (v as ConvertedDisplayValue).value === 'number'
  );
}

export type ConversionResult =
  | { ok: true; converted: true; value: ConvertedDisplayValue }
  | { ok: true; converted: false; value: number; currency: 'IDR' }
  | { ok: false; reason: string };

/**
 * Konversi IDR -> mata uang tampil. TIDAK PERNAH mengubah nilai sumber.
 * - target 'IDR': identitas (bukan konversi) — kembalikan nilai apa adanya.
 * - input bertanda converted: DITOLAK (anti double conversion).
 * - kurs tidak usable: DITOLAK dengan alasan (tidak ditebak, tidak 0).
 * - amount non-finite: DITOLAK (unresolved tetap unresolved).
 */
export function convertIdrToDisplay(
  source: SourceAmount | ConvertedDisplayValue,
  target: CurrencyCode,
  rate: ExchangeRateSnapshot | null | undefined,
  nowMs: number = Date.now(),
): ConversionResult {
  if (isConvertedDisplayValue(source)) {
    return { ok: false, reason: 'Nilai sudah dikonversi — tidak boleh dikonversi ulang (double conversion dicegah).' };
  }
  if (!Number.isFinite(source.amount)) {
    return { ok: false, reason: 'Nilai sumber tidak valid (unresolved tetap unresolved).' };
  }
  if (target === 'IDR') {
    return { ok: true, converted: false, value: source.amount, currency: 'IDR' };
  }
  const evaluation = evaluateRate(rate, nowMs);
  if (!evaluation.usable || rate == null) {
    return { ok: false, reason: evaluation.reason };
  }
  const digits = CURRENCY_DEFINITIONS[target].minorUnitDigits;
  const value = SafeDecimalEngine.safeRound(source.amount / rate.idrPerUnit, digits);
  return {
    ok: true,
    converted: true,
    value: {
      value,
      currency: target,
      sourceCurrency: 'IDR',
      sourceAmount: source.amount,
      sourceKind: source.kind,
      rateIdrPerUnit: rate.idrPerUnit,
      rateSource: rate.source,
      rateRetrievedAtMs: rate.retrievedAtMs,
      rateState: evaluation.state,
      converted: true,
    },
  };
}

/**
 * Arah sebaliknya: mata uang asing -> IDR (kali dengan idrPerUnit).
 * Dipakai untuk konversi dua arah dan total campuran via jembatan IDR.
 * Input harus angka biasa (bukan nilai converted — nilai converted ke
 * IDR tidak bermakna karena sumbernya memang IDR).
 */
export function convertForeignToIdr(
  amount: number,
  code: ForeignCurrencyCode,
  rate: ExchangeRateSnapshot | null | undefined,
  nowMs: number = Date.now(),
): { ok: true; value: number } | { ok: false; reason: string } {
  if (!Number.isFinite(amount)) {
    return { ok: false, reason: 'Nilai sumber tidak valid.' };
  }
  const evaluation = evaluateRate(rate, nowMs);
  if (!evaluation.usable || rate == null) {
    return { ok: false, reason: evaluation.reason };
  }
  return { ok: true, value: SafeDecimalEngine.safeRound(amount * rate.idrPerUnit, 0) };
}

// ---------------------------------------------------------------------------
// Total (anti total campuran tanpa konversi tertelusur)
// ---------------------------------------------------------------------------

export interface TotalItemInput {
  /** null/undefined/NaN = unresolved — dikeluarkan dari total, bukan 0. */
  amount: number | null | undefined;
  currency: CurrencyCode;
}

export interface TotalResult {
  /** null bila tidak ada satu pun item yang dapat dijumlah. */
  total: number | null;
  currency: CurrencyCode;
  /** True bila ada item yang dikeluarkan (tanpa kurs / unresolved). */
  partial: boolean;
  includedCount: number;
  excludedCount: number;
  unresolvedCount: number;
  /** True bila total mengandung nilai konversi (bukan murni IDR resmi). */
  converted: boolean;
  reasons: string[];
}

/**
 * Menjumlah item ke satu mata uang target dengan konversi eksplisit:
 * - item IDR -> target asing: bagi idrPerUnit; item asing -> target IDR:
 *   kali idrPerUnit; item asing -> target asing lain: triangulasi via IDR
 *   (kali idrPerUnit asal, bagi idrPerUnit target) dalam SATU langkah
 *   pembulatan akhir — bukan dua konversi berurutan yang membulatkan dua
 *   kali.
 * - item tanpa kurs usable / amount unresolved: dikeluarkan, dihitung di
 *   excludedCount/unresolvedCount, dan partial = true. TIDAK PERNAH 0.
 * - bila tidak ada item yang dapat dijumlah: total null (bukan 0).
 */
export function sumToDisplayCurrency(
  items: TotalItemInput[],
  target: CurrencyCode,
  rateLookup: (code: ForeignCurrencyCode) => ExchangeRateSnapshot | null | undefined,
  nowMs: number = Date.now(),
): TotalResult {
  const reasons: string[] = [];
  let total = 0;
  let included = 0;
  let excluded = 0;
  let unresolved = 0;
  let converted = false;

  for (const item of items) {
    if (item.amount == null || !Number.isFinite(item.amount)) {
      excluded += 1;
      unresolved += 1;
      reasons.push(`Item ${item.currency} tanpa harga dikeluarkan (unresolved).`);
      continue;
    }
    if (item.currency === target) {
      total += item.amount;
      included += 1;
      continue;
    }
    // Item perlu konversi eksplisit.
    if (target === 'IDR') {
      // Asing -> IDR: kali idrPerUnit asal.
      const rate = rateLookup(item.currency as ForeignCurrencyCode);
      const evaluation = evaluateRate(rate, nowMs);
      if (!evaluation.usable || rate == null) {
        excluded += 1;
        reasons.push(`Item ${item.currency} dikeluarkan: ${evaluation.reason}`);
        continue;
      }
      total += item.amount * rate.idrPerUnit;
      included += 1;
      converted = true;
      continue;
    }
    if (item.currency === 'IDR') {
      // IDR -> target asing: bagi idrPerUnit target.
      const rate = rateLookup(target as ForeignCurrencyCode);
      const evaluation = evaluateRate(rate, nowMs);
      if (!evaluation.usable || rate == null) {
        excluded += 1;
        reasons.push(`Item IDR dikeluarkan: ${evaluation.reason}`);
        continue;
      }
      total += item.amount / rate.idrPerUnit;
      included += 1;
      converted = true;
      continue;
    }
    // Asing -> asing lain: triangulasi via IDR dalam satu langkah.
    const fromRate = rateLookup(item.currency as ForeignCurrencyCode);
    const toRate = rateLookup(target as ForeignCurrencyCode);
    const fromEval = evaluateRate(fromRate, nowMs);
    const toEval = evaluateRate(toRate, nowMs);
    if (!fromEval.usable || fromRate == null || !toEval.usable || toRate == null) {
      excluded += 1;
      reasons.push(`Item ${item.currency} dikeluarkan: kurs tidak dapat dipakai.`);
      continue;
    }
    total += (item.amount * fromRate.idrPerUnit) / toRate.idrPerUnit;
    included += 1;
    converted = true;
  }

  const digits = CURRENCY_DEFINITIONS[target].minorUnitDigits;
  return {
    total: included === 0 ? null : SafeDecimalEngine.safeRound(total, digits),
    currency: target,
    partial: excluded > 0,
    includedCount: included,
    excludedCount: excluded,
    unresolvedCount: unresolved,
    converted,
    reasons,
  };
}

/**
 * Penjumlahan ketat satu mata uang: menolak total campuran.
 * Dipakai untuk membuktikan tidak ada total yang diam-diam mencampur
 * IDR/USD/JPY/CNY/EUR tanpa konversi.
 */
export function sumSameCurrency(
  items: TotalItemInput[],
): { ok: true; total: number | null; currency: CurrencyCode; partial: boolean } | { ok: false; reason: string; currencies: CurrencyCode[] } {
  const priced = items.filter((i) => i.amount != null && Number.isFinite(i.amount));
  const currencies = [...new Set(priced.map((i) => i.currency))];
  if (currencies.length > 1) {
    return { ok: false, reason: `Total campuran ditolak: ${currencies.join(', ')}. Konversikan dulu ke satu mata uang target.`, currencies };
  }
  const currency = (currencies[0] ?? 'IDR') as CurrencyCode;
  const digits = CURRENCY_DEFINITIONS[currency].minorUnitDigits;
  return {
    ok: true,
    total: priced.length === 0 ? null : SafeDecimalEngine.safeRound(priced.reduce((s, i) => s + (i.amount as number), 0), digits),
    currency,
    partial: priced.length !== items.length,
  };
}

// ---------------------------------------------------------------------------
// Formatting (deterministik, gaya formatRupiah: ribuan '.', desimal ',')
// ---------------------------------------------------------------------------

/** Non-finite -> '—' (tidak pernah difabrikasi menjadi 0). */
export function formatCurrency(amount: number, code: CurrencyCode): string {
  if (!Number.isFinite(amount)) return '—';
  const def = CURRENCY_DEFINITIONS[code];
  const rounded = SafeDecimalEngine.safeRound(amount, def.minorUnitDigits).toFixed(def.minorUnitDigits);
  const negative = rounded.startsWith('-');
  const abs = negative ? rounded.slice(1) : rounded;
  const parts = abs.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const body = def.minorUnitDigits > 0 && parts[1] ? `${parts[0]},${parts[1]}` : parts[0];
  return `${negative ? '-' : ''}${def.symbol} ${body}`;
}

/** "1 USD = Rp 16.000" — baris kurs untuk UI. */
export function formatRateLine(code: ForeignCurrencyCode, idrPerUnit: number): string {
  return `1 ${code} = ${formatCurrency(idrPerUnit, 'IDR')}`;
}

/** Stempel waktu kurs untuk UI (id-ID, mis. "26 Okt 2026, 18.52"). */
export function formatRateTimestamp(retrievedAtMs: number): string {
  if (!Number.isFinite(retrievedAtMs)) return '—';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(retrievedAtMs));
  } catch {
    return '—';
  }
}

// ---------------------------------------------------------------------------
// Metadata label ekspor (helper masa depan — ekspor fase ini tetap IDR)
// ---------------------------------------------------------------------------

/**
 * Baris metadata konversi untuk dokumen. Dipakai BILA suatu ekspor di
 * masa depan memuat nilai konversi: baris ini WAJIB menyertai nilai itu
 * (mata uang, kurs, tanggal kurs, sumber). Pada fase ini ekspor tetap
 * IDR-resmi, jadi helper ini belum di-wire ke engine ekspor — dan itu
 * disengaja (lihat kebijakan §12).
 */
export function buildConversionNote(value: ConvertedDisplayValue): string {
  return (
    `Nilai konversi referensi dalam ${value.currency} — kurs ${formatRateLine(value.currency as ForeignCurrencyCode, value.rateIdrPerUnit)} ` +
    `(sumber: ${value.rateSource}, ${formatRateTimestamp(value.rateRetrievedAtMs)}). ` +
    `Bukan harga resmi AHSP. Nilai sumber resmi tetap dalam IDR.`
  );
}

// ---------------------------------------------------------------------------
// Provider kurs eksternal (best-effort, tanpa secret)
// ---------------------------------------------------------------------------

export interface ProviderFetchResult {
  rates: Record<ForeignCurrencyCode, ExchangeRateSnapshot>;
  source: string;
  retrievedAtMs: number;
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

/**
 * Mengambil kurs dari endpoint publik open.er-api.com (base IDR, tanpa
 * kunci). Melempar Error pada kegagalan apa pun — pemanggil WAJIB
 * mempertahankan last-known rate dan menampilkan state yang sesuai,
 * bukan menghapus kurs lama.
 * Bentuk respons yang divalidasi: { result: 'success', base_code: 'IDR',
 * rates: { USD, JPY, CNY, EUR: angka foreign per 1 IDR } }.
 * idrPerUnit = 1 / rates[code] (arah dikunci oleh validasi base_code).
 */
export async function fetchRatesFromProvider(
  fetchFn: FetchLike = globalThis.fetch as unknown as FetchLike,
  nowMs: number = Date.now(),
  timeoutMs: number = RATE_FETCH_TIMEOUT_MS,
): Promise<ProviderFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(RATE_PROVIDER_URL, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Provider kurs gagal (HTTP ${res.status}).`);
    }
    const data = (await res.json()) as {
      result?: unknown;
      base_code?: unknown;
      rates?: Record<string, unknown>;
    };
    if (data.result !== 'success' || data.base_code !== 'IDR' || typeof data.rates !== 'object' || data.rates === null) {
      throw new Error('Respons provider kurs tidak valid (result/base_code/rates).');
    }
    const rates = {} as Record<ForeignCurrencyCode, ExchangeRateSnapshot>;
    for (const code of FOREIGN_CURRENCIES) {
      const perIdr = data.rates[code];
      if (typeof perIdr !== 'number' || !Number.isFinite(perIdr) || perIdr <= 0) {
        throw new Error(`Kurs provider untuk ${code} tidak valid.`);
      }
      rates[code] = {
        code,
        idrPerUnit: 1 / perIdr,
        source: RATE_PROVIDER_NAME,
        retrievedAtMs: nowMs,
        manual: false,
      };
    }
    return { rates, source: RATE_PROVIDER_NAME, retrievedAtMs: nowMs };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Menggabungkan kurs provider ke kurs tersimpan TANPA menimpa entri
 * manual: entri bertanda manual dipertahankan sampai pengguna
 * menghapusnya secara eksplisit. Fungsi murni (dites).
 */
export function mergeProviderRates(
  existing: Partial<Record<ForeignCurrencyCode, ExchangeRateSnapshot>>,
  incoming: Record<ForeignCurrencyCode, ExchangeRateSnapshot>,
): Partial<Record<ForeignCurrencyCode, ExchangeRateSnapshot>> {
  const out: Partial<Record<ForeignCurrencyCode, ExchangeRateSnapshot>> = { ...existing };
  for (const code of FOREIGN_CURRENCIES) {
    if (out[code]?.manual) continue;
    out[code] = incoming[code];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Persistensi preferensi (localStorage, pola ThemeContext)
// ---------------------------------------------------------------------------

export const LS_DISPLAY_KEY = 'ezrab_currency_display';
export const LS_RATES_KEY = 'ezrab_currency_rates_v1';

export function loadDisplayCurrency(
  storage: { getItem: (k: string) => string | null } | undefined = undefined,
): CurrencyCode {
  try {
    const raw = (storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined))?.getItem(LS_DISPLAY_KEY);
    if (raw && isSupportedCurrency(raw)) return raw;
  } catch {
    // Abaikan storage rusak — kembali ke default IDR.
  }
  return 'IDR';
}

export function saveDisplayCurrency(
  code: CurrencyCode,
  storage: { setItem: (k: string, v: string) => void } | undefined = undefined,
): void {
  try {
    (storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined))?.setItem(LS_DISPLAY_KEY, code);
  } catch {
    // Persistensi gagal diam-diam — preferensi tetap berlaku di sesi ini.
  }
}

export function loadStoredRates(
  storage: { getItem: (k: string) => string | null } | undefined = undefined,
): Partial<Record<ForeignCurrencyCode, ExchangeRateSnapshot>> {
  try {
    const raw = (storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined))?.getItem(LS_RATES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Partial<Record<ForeignCurrencyCode, ExchangeRateSnapshot>> = {};
    for (const code of FOREIGN_CURRENCIES) {
      const entry = parsed[code] as ExchangeRateSnapshot | undefined;
      if (
        entry &&
        entry.code === code &&
        typeof entry.idrPerUnit === 'number' &&
        Number.isFinite(entry.idrPerUnit) &&
        entry.idrPerUnit > 0 &&
        typeof entry.retrievedAtMs === 'number' &&
        Number.isFinite(entry.retrievedAtMs) &&
        typeof entry.source === 'string' &&
        typeof entry.manual === 'boolean'
      ) {
        out[code] = entry;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveStoredRates(
  rates: Partial<Record<ForeignCurrencyCode, ExchangeRateSnapshot>>,
  storage: { setItem: (k: string, v: string) => void } | undefined = undefined,
): void {
  try {
    (storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined))?.setItem(LS_RATES_KEY, JSON.stringify(rates));
  } catch {
    // Abaikan kegagalan persistensi.
  }
}

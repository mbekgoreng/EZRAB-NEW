/**
 * EZRAB — MULTI-CURRENCY TEST SUITE (2026-10-26)
 *
 * Menguji modul src/services/currencyService.ts (display-only, IDR base).
 * Angka kurs di sini adalah FIXTURE, bukan kurs pasar dan bukan klaim
 * kurs live: USD 16000, JPY 100, CNY 2200, EUR 17500 (Rp per 1 unit).
 *
 * Cakupan (Fase C):
 *  1. Default IDR + kelima kode mata uang (tepat 5, tidak lebih).
 *  2. Konversi dua arah + arah kurs yang benar (bagi vs kali).
 *  3. Pembulatan + formatting JPY (0 desimal) dan presisi desimal lain.
 *  4. Kurs hilang/invalid/kedaluwarsa/tidak tersedia + stale yang usable.
 *  5. Kegagalan provider eksternal (reject, HTTP error, payload malformed).
 *  6. Provenance kurs manual + merge (refresh tidak menimpa manual).
 *  7. Pencegahan double conversion + total campuran mata uang.
 *  8. Pelestarian nilai sumber resmi + harga null/unresolved.
 *  9. Label ekspor + metadata kurs (buildConversionNote).
 * 10. Persistensi (display currency + stored rates, entri invalid dibuang).
 *
 * Yang TIDAK dibuktikan suite ini (perlu QA manual/browser): rendering
 * Settings, klik Perbarui kurs di UI, dan kurs live dari provider
 * (provider hanya dites dengan stub fetch — tidak ada panggilan jaringan
 * nyata di suite ini).
 *
 * Jalankan: npx --yes tsx src/test/currencyService.test.ts
 */

import { strict as assert } from 'assert';
import {
  CURRENCY_DEFINITIONS,
  FOREIGN_CURRENCIES,
  SUPPORTED_CURRENCIES,
  buildConversionNote,
  convertForeignToIdr,
  convertIdrToDisplay,
  evaluateRate,
  fetchRatesFromProvider,
  formatCurrency,
  formatRateLine,
  formatRateTimestamp,
  isConvertedDisplayValue,
  isForeignCurrency,
  isSupportedCurrency,
  loadDisplayCurrency,
  loadStoredRates,
  mergeProviderRates,
  saveDisplayCurrency,
  saveStoredRates,
  sumSameCurrency,
  sumToDisplayCurrency,
  validateIdrPerUnit,
  type ExchangeRateSnapshot,
  type ForeignCurrencyCode,
} from '../services/currencyService';

// Mock localStorage untuk environment Node (pola templateCatalog180.test.ts).
const storage: Record<string, string> = {};
(global as any).localStorage = {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, val: string) => {
    storage[key] = val;
  },
  removeItem: (key: string) => {
    delete storage[key];
  },
  clear: () => {
    Object.keys(storage).forEach((k) => delete storage[k]);
  },
};

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    pass += 1;
  } else {
    fail += 1;
    console.error(`FAIL: ${name}`);
  }
}
function eq(name: string, actual: unknown, expected: unknown) {
  check(`${name} (aktual: ${String(actual)}, harap: ${String(expected)})`, actual === expected);
}

// Fixture: 26 Okt 2026 10:00 WIB ~ 03:00 UTC.
const NOW = Date.UTC(2026, 9, 26, 3, 0, 0);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const USD = 16000;
const JPY = 100;
const CNY = 2200;
const EUR = 17500;

function rate(code: ForeignCurrencyCode, idrPerUnit: number, ageMs: number, manual = false): ExchangeRateSnapshot {
  return {
    code,
    idrPerUnit,
    source: manual ? 'Manual (pengguna)' : 'open.er-api.com',
    retrievedAtMs: NOW - ageMs,
    manual,
  };
}
const lookup = (table: Partial<Record<ForeignCurrencyCode, ExchangeRateSnapshot>>) => (code: ForeignCurrencyCode) =>
  table[code] ?? null;

// ---------------------------------------------------------------------------
// 1. Default IDR + kelima kode (tepat 5)
// ---------------------------------------------------------------------------
eq('Default IDR saat storage kosong', loadDisplayCurrency(), 'IDR');
eq('Jumlah mata uang didukung tepat 5', SUPPORTED_CURRENCIES.length, 5);
eq('Jumlah mata uang asing tepat 4', FOREIGN_CURRENCIES.length, 4);
for (const code of ['IDR', 'USD', 'JPY', 'CNY', 'EUR']) {
  check(`isSupportedCurrency(${code})`, isSupportedCurrency(code));
}
for (const code of ['GBP', 'SGD', 'AUD', '', 'usd', 'Idr']) {
  check(`isSupportedCurrency menolak ${code || '(kosong)'}`, !isSupportedCurrency(code));
}
check('IDR bukan mata uang asing', !isForeignCurrency('IDR'));
for (const code of FOREIGN_CURRENCIES) {
  check(`isForeignCurrency(${code})`, isForeignCurrency(code));
}
saveDisplayCurrency('USD');
eq('Round-trip display currency USD', loadDisplayCurrency(), 'USD');
saveDisplayCurrency('GBP' as never);
eq('Nilai tersimpan invalid kembali ke IDR', loadDisplayCurrency(), 'IDR');
storage['ezrab_currency_display'] = 'JPY';
eq('Display JPY terbaca', loadDisplayCurrency(), 'JPY');
delete storage['ezrab_currency_display'];

// ---------------------------------------------------------------------------
// 2. Konversi dua arah + arah kurs benar
// ---------------------------------------------------------------------------
{
  const toUsd = convertIdrToDisplay({ amount: 32000, currency: 'IDR', kind: 'official' }, 'USD', rate('USD', USD, HOUR), NOW);
  check('IDR->USD ok + converted', toUsd.ok && toUsd.converted === true);
  if (toUsd.ok && toUsd.converted) eq('Rp32.000 -> US$2 (bagi, bukan kali)', toUsd.value.value, 2);
  const toIdr = convertForeignToIdr(2, 'USD', rate('USD', USD, HOUR), NOW);
  check('USD->IDR ok', toIdr.ok);
  if (toIdr.ok) eq('US$2 -> Rp32.000 (kali, bukan bagi)', toIdr.value, 32000);
  const toEur = convertIdrToDisplay({ amount: 35000, currency: 'IDR', kind: 'market' }, 'EUR', rate('EUR', EUR, HOUR), NOW);
  if (toEur.ok && toEur.converted) eq('Rp35.000 -> €2', toEur.value.value, 2);
  const back = convertForeignToIdr(2, 'EUR', rate('EUR', EUR, HOUR), NOW);
  if (back.ok) eq('€2 -> Rp35.000', back.value, 35000);
  // Arah yang tertukar akan memberi hasil yang salah total — buktikan arah benar:
  const wrongDirection = 32000 * USD;
  check('Arah tertukar (kali) akan salah — nilai benar adalah bagi', toUsd.ok && toUsd.converted && toUsd.value.value !== wrongDirection);
}

// ---------------------------------------------------------------------------
// 3. JPY + presisi + formatting locale (gaya formatRupiah)
// ---------------------------------------------------------------------------
eq('JPY: 16150 IDR @100 -> ¥162 (161,5 dibulatkan ke atas)', (() => {
  const r = convertIdrToDisplay({ amount: 16150, currency: 'IDR', kind: 'official' }, 'JPY', rate('JPY', JPY, HOUR), NOW);
  return r.ok && r.converted ? r.value.value : null;
})(), 162);
eq('JPY minorUnitDigits 0', CURRENCY_DEFINITIONS.JPY.minorUnitDigits, 0);
eq('formatCurrency JPY grouping', formatCurrency(123456, 'JPY'), '¥ 123.456');
eq('formatCurrency JPY nol', formatCurrency(0, 'JPY'), '¥ 0');
eq('formatCurrency USD 2 desimal', formatCurrency(6.25, 'USD'), 'US$ 6,25');
eq('formatCurrency USD grouping + desimal', formatCurrency(1234567.89, 'USD'), 'US$ 1.234.567,89');
eq('formatCurrency EUR dibulatkan 2dp', formatCurrency(1234567.891, 'EUR'), '€ 1.234.567,89');
eq('formatCurrency CNY simbol CN¥', formatCurrency(100, 'CNY'), 'CN¥ 100,00');
eq('formatCurrency IDR', formatCurrency(1234567, 'IDR'), 'Rp 1.234.567');
eq('formatCurrency non-finite -> — (bukan 0)', formatCurrency(NaN, 'USD'), '—');
eq('formatCurrency negatif', formatCurrency(-1500, 'IDR'), '-Rp 1.500');
eq('formatRateLine USD', formatRateLine('USD', 16000), '1 USD = Rp 16.000');
check('formatRateTimestamp memuat tahun fixture', formatRateTimestamp(NOW).includes('2026'));

// ---------------------------------------------------------------------------
// 4. Status kurs: hilang/invalid/kedaluwarsa/stale/tersedia
// ---------------------------------------------------------------------------
eq('evaluateRate null -> unavailable', evaluateRate(null, NOW).state, 'unavailable');
check('unavailable tidak usable', !evaluateRate(null, NOW).usable);
eq('evaluateRate 0 -> invalid', evaluateRate(rate('USD', 0, HOUR), NOW).state, 'invalid');
eq('evaluateRate NaN -> invalid', evaluateRate(rate('USD', NaN, HOUR), NOW).state, 'invalid');
eq('evaluateRate negatif -> invalid', evaluateRate(rate('USD', -5, HOUR), NOW).state, 'invalid');
eq('evaluateRate 8 hari -> expired', evaluateRate(rate('USD', USD, 8 * DAY), NOW).state, 'expired');
check('expired tidak usable', !evaluateRate(rate('USD', USD, 8 * DAY), NOW).usable);
eq('evaluateRate 2 hari -> stale', evaluateRate(rate('USD', USD, 2 * DAY), NOW).state, 'stale');
check('stale tetap usable (dengan label)', evaluateRate(rate('USD', USD, 2 * DAY), NOW).usable);
eq('evaluateRate 1 jam -> available', evaluateRate(rate('USD', USD, HOUR), NOW).state, 'available');
eq('evaluateRate masa depan -> invalid', evaluateRate({ ...rate('USD', USD, HOUR), retrievedAtMs: NOW + HOUR }, NOW).state, 'invalid');
check('validateIdrPerUnit menolak 0', !validateIdrPerUnit(0).ok);
check('validateIdrPerUnit menolak NaN', !validateIdrPerUnit(NaN).ok);
check('validateIdrPerUnit menerima positif', validateIdrPerUnit(16000).ok);
{
  const expired = convertIdrToDisplay({ amount: 32000, currency: 'IDR', kind: 'official' }, 'USD', rate('USD', USD, 8 * DAY), NOW);
  check('Konversi dengan kurs expired DITOLAK (bukan ditebak)', !expired.ok);
  const stale = convertIdrToDisplay({ amount: 32000, currency: 'IDR', kind: 'official' }, 'USD', rate('USD', USD, 2 * DAY), NOW);
  check('Konversi dengan kurs stale DIIZINKAN + state stale', stale.ok && stale.converted && stale.value.rateState === 'stale');
  const missing = convertIdrToDisplay({ amount: 32000, currency: 'IDR', kind: 'official' }, 'USD', null, NOW);
  check('Konversi tanpa kurs DITOLAK', !missing.ok);
}

// ---------------------------------------------------------------------------
// 6. Provenance manual + merge (refresh tidak menimpa manual)
// ---------------------------------------------------------------------------
{
  const manual = rate('USD', 15500, HOUR, true);
  eq('Snapshot manual bertanda manual', manual.manual, true);
  eq('Snapshot manual sumbernya Manual', manual.source, 'Manual (pengguna)');
  saveStoredRates({ USD: manual });
  const loaded = loadStoredRates();
  check('Storage round-trip mempertahankan manual', loaded.USD?.manual === true);
  eq('Storage round-trip mempertahankan sumber', loaded.USD?.source, 'Manual (pengguna)');
  const merged = mergeProviderRates(
    { USD: manual, EUR: rate('EUR', EUR, HOUR) },
    {
      USD: rate('USD', USD, 0),
      JPY: rate('JPY', JPY, 0),
      CNY: rate('CNY', CNY, 0),
      EUR: rate('EUR', 17000, 0),
    },
  );
  eq('Merge mempertahankan kurs manual USD', merged.USD?.idrPerUnit, 15500);
  eq('Merge memperbarui kurs provider EUR', merged.EUR?.idrPerUnit, 17000);
  check('Merge mengisi kurs JPY baru', merged.JPY?.idrPerUnit === 100);
  // Storage menolak entri invalid:
  storage['ezrab_currency_rates_v1'] = JSON.stringify({
    USD: { code: 'USD', idrPerUnit: -5, source: 'x', retrievedAtMs: NOW, manual: false },
    EUR: { code: 'GBP', idrPerUnit: 17000, source: 'x', retrievedAtMs: NOW, manual: false },
    JPY: { code: 'JPY', idrPerUnit: 100, source: 'open.er-api.com', retrievedAtMs: NOW, manual: false },
  });
  const cleaned = loadStoredRates();
  check('Storage membuang entri invalid', cleaned.USD === undefined && cleaned.EUR === undefined);
  check('Storage mempertahankan entri valid', cleaned.JPY?.idrPerUnit === 100);
  storage['ezrab_currency_rates_v1'] = '{json rusak';
  eq('Storage JSON rusak -> {}', Object.keys(loadStoredRates()).length, 0);
  delete storage['ezrab_currency_rates_v1'];
}

// ---------------------------------------------------------------------------
// 7. Double conversion + total campuran
// ---------------------------------------------------------------------------
{
  const first = convertIdrToDisplay({ amount: 32000, currency: 'IDR', kind: 'official' }, 'USD', rate('USD', USD, HOUR), NOW);
  assert(first.ok && first.converted, 'Prasyarat: konversi pertama lulus');
  check('Nilai converted bertanda converted:true', isConvertedDisplayValue(first.value));
  const second = convertIdrToDisplay(first.value, 'EUR', rate('EUR', EUR, HOUR), NOW);
  check('Nilai converted diumpan ulang DITOLAK', !second.ok);
  const identity = convertIdrToDisplay({ amount: 32000, currency: 'IDR', kind: 'official' }, 'IDR', null, NOW);
  check('Target IDR = identitas (bukan konversi)', identity.ok && !identity.converted && identity.value === 32000);
  // Total campuran:
  const mixed = sumSameCurrency([
    { amount: 1000, currency: 'IDR' },
    { amount: 2, currency: 'USD' },
  ]);
  check('sumSameCurrency menolak campuran', !mixed.ok);
  const single = sumSameCurrency([
    { amount: 1000, currency: 'IDR' },
    { amount: 2000, currency: 'IDR' },
  ]);
  check('sumSameCurrency menerima satu mata uang', single.ok && single.total === 3000);
  // Total tanpa kurs USD: item USD lolos via identitas (target sama,
  // tidak butuh kurs), item IDR terbuang -> parsial, bukan total campuran:
  const partial = sumToDisplayCurrency(
    [
      { amount: 32000, currency: 'IDR' },
      { amount: 10, currency: 'USD' },
    ],
    'USD',
    lookup({}),
    NOW,
  );
  check('Total tanpa kurs USD: parsial (item IDR terbuang)', partial.partial === true);
  eq('Total tanpa kurs USD: hanya item USD (identitas) yang masuk', partial.total, 10);
  eq('Total tanpa kurs USD: excludedCount 1', partial.excludedCount, 1);
  eq('Total tanpa kurs USD: unresolvedCount 0 (bukan unresolved harga)', partial.unresolvedCount, 0);
  const withRates = sumToDisplayCurrency(
    [
      { amount: 32000, currency: 'IDR' },
      { amount: 10, currency: 'USD' },
    ],
    'USD',
    lookup({ USD: rate('USD', USD, HOUR) }),
    NOW,
  );
  eq('Total dengan kurs: 32000 IDR -> $2 + $10 = $12', withRates.total, 12);
  check('Total dengan kurs bertanda converted', withRates.converted === true);
  // Triangulasi USD -> EUR via IDR:
  const tri = sumToDisplayCurrency(
    [{ amount: 10, currency: 'USD' }],
    'EUR',
    lookup({ USD: rate('USD', USD, HOUR), EUR: rate('EUR', EUR, HOUR) }),
    NOW,
  );
  eq('Triangulasi $10 -> €9,14 (160000/17500)', tri.total, 9.14);
}

// ---------------------------------------------------------------------------
// 8. Pelestarian sumber resmi + null/unresolved
// ---------------------------------------------------------------------------
{
  const source = { amount: 32000, currency: 'IDR' as const, kind: 'official' as const };
  const before = JSON.stringify(source);
  const res = convertIdrToDisplay(source, 'USD', rate('USD', USD, HOUR), NOW);
  eq('Konversi tidak memutasi objek sumber', JSON.stringify(source), before);
  check('Converted membawa sourceAmount asli', res.ok && res.converted && res.value.sourceAmount === 32000);
  check('Converted membawa sourceKind official', res.ok && res.converted && res.value.sourceKind === 'official');
  const nanRes = convertIdrToDisplay({ amount: NaN, currency: 'IDR', kind: 'official' }, 'USD', rate('USD', USD, HOUR), NOW);
  check('Amount NaN ditolak (unresolved tetap unresolved)', !nanRes.ok);
  const allUnresolved = sumToDisplayCurrency(
    [
      { amount: null, currency: 'IDR' },
      { amount: NaN, currency: 'USD' },
      { amount: undefined, currency: 'EUR' },
    ],
    'IDR',
    lookup({ USD: rate('USD', USD, HOUR), EUR: rate('EUR', EUR, HOUR) }),
    NOW,
  );
  eq('Semua unresolved -> total null (bukan 0)', allUnresolved.total, null);
  eq('Semua unresolved -> unresolvedCount 3', allUnresolved.unresolvedCount, 3);
  check('Semua unresolved -> partial', allUnresolved.partial === true);
  const someUnresolved = sumToDisplayCurrency(
    [
      { amount: 100000, currency: 'IDR' },
      { amount: null, currency: 'IDR' },
    ],
    'IDR',
    lookup({}),
    NOW,
  );
  eq('Sebagian unresolved -> total hanya yang berharga', someUnresolved.total, 100000);
  check('Sebagian unresolved -> partial', someUnresolved.partial === true);
}

// ---------------------------------------------------------------------------
// 9. Label ekspor + metadata kurs
// ---------------------------------------------------------------------------
{
  const res = convertIdrToDisplay({ amount: 16000, currency: 'IDR', kind: 'official' }, 'USD', rate('USD', USD, HOUR), NOW);
  assert(res.ok && res.converted, 'Prasyarat: konversi untuk note lulus');
  const note = buildConversionNote(res.value);
  check('Note memuat kode mata uang', note.includes('USD'));
  check('Note memuat baris kurs', note.includes('1 USD = Rp 16.000'));
  check('Note memuat sumber', note.includes('open.er-api.com'));
  check('Note memuat tahun kurs', note.includes('2026'));
  check('Note menegaskan bukan harga resmi AHSP', note.includes('Bukan harga resmi AHSP'));
  check('Note menegaskan sumber tetap IDR', note.includes('IDR'));
}

// ---------------------------------------------------------------------------
// 5. Provider eksternal (stub fetch — tanpa jaringan nyata)
// ---------------------------------------------------------------------------
async function providerTests() {
  type StubRes = { ok: boolean; status: number; json: () => Promise<unknown> };
  const okPayload = {
    result: 'success',
    base_code: 'IDR',
    time_last_update_unix: Math.floor(NOW / 1000),
    rates: { USD: 0.0000625, JPY: 0.01, CNY: 0.00045454545454545455, EUR: 0.00005714285714285714 },
  };
  const okFetch = (async (): Promise<StubRes> => ({
    ok: true,
    status: 200,
    json: async () => okPayload,
  })) as never;
  const fetched = await fetchRatesFromProvider(okFetch, NOW);
  eq('Provider sukses: sumber open.er-api.com', fetched.source, 'open.er-api.com');
  eq('Provider sukses: USD idrPerUnit 16000', fetched.rates.USD.idrPerUnit, 16000);
  eq('Provider sukses: JPY idrPerUnit 100', fetched.rates.JPY.idrPerUnit, 100);
  check('Provider sukses: manual false semua', !fetched.rates.USD.manual && !fetched.rates.EUR.manual);

  const rejectFetch = (async (): Promise<StubRes> => {
    throw new Error('network down');
  }) as never;
  let threw = false;
  try {
    await fetchRatesFromProvider(rejectFetch, NOW);
  } catch {
    threw = true;
  }
  check('Provider reject -> throw (caller mempertahankan last-known)', threw);

  const http500 = (async (): Promise<StubRes> => ({
    ok: false,
    status: 500,
    json: async () => ({}),
  })) as never;
  threw = false;
  try {
    await fetchRatesFromProvider(http500, NOW);
  } catch {
    threw = true;
  }
  check('Provider HTTP 500 -> throw', threw);

  const wrongBase = (async (): Promise<StubRes> => ({
    ok: true,
    status: 200,
    json: async () => ({ result: 'success', base_code: 'USD', rates: { USD: 1 } }),
  })) as never;
  threw = false;
  try {
    await fetchRatesFromProvider(wrongBase, NOW);
  } catch {
    threw = true;
  }
  check('Provider base_code bukan IDR -> throw (arah dikunci)', threw);

  const missingRate = (async (): Promise<StubRes> => ({
    ok: true,
    status: 200,
    json: async () => ({ result: 'success', base_code: 'IDR', rates: { USD: 0.0000625 } }),
  })) as never;
  threw = false;
  try {
    await fetchRatesFromProvider(missingRate, NOW);
  } catch {
    threw = true;
  }
  check('Provider kurs tidak lengkap -> throw', threw);

  const errorResult = (async (): Promise<StubRes> => ({
    ok: true,
    status: 200,
    json: async () => ({ result: 'error', 'error-type': 'invalid-key' }),
  })) as never;
  threw = false;
  try {
    await fetchRatesFromProvider(errorResult, NOW);
  } catch {
    threw = true;
  }
  check("Provider result 'error' -> throw", threw);

  console.log(`CURRENCY: ${pass} PASS, ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void providerTests();

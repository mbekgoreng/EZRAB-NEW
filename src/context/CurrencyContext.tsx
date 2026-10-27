import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  type CurrencyCode,
  type ExchangeRateSnapshot,
  type ForeignCurrencyCode,
  type RateEvaluation,
  convertIdrToDisplay,
  evaluateRate,
  fetchRatesFromProvider,
  formatCurrency,
  isSupportedCurrency,
  loadDisplayCurrency,
  loadStoredRates,
  mergeProviderRates,
  saveDisplayCurrency,
  saveStoredRates,
  validateIdrPerUnit,
  MANUAL_RATE_SOURCE,
} from '../services/currencyService';

/**
 * Preferensi mata uang tampil — mengikuti pola ThemeContext persis:
 * state React + localStorage, tanpa backend, tanpa migrasi.
 * - displayCurrency: mata uang TAMPIL (default IDR). Nilai sumber resmi
 *   tetap IDR; context ini tidak pernah menulis ke data proyek/RAB.
 * - rates: last-known rate per mata uang asing (provider atau manual).
 * - refreshRates: best-effort; gagal TIDAK menghapus kurs lama.
 * - Kurs manual dipertahankan sampai dihapus eksplisit (tidak ditimpa
 *   refresh provider).
 */
interface CurrencyContextType {
  displayCurrency: CurrencyCode;
  setDisplayCurrency: (code: CurrencyCode) => void;
  rates: Partial<Record<ForeignCurrencyCode, ExchangeRateSnapshot>>;
  /** Best-effort; gagal -> { ok: false, error } dan kurs lama dipertahankan. */
  refreshRates: () => Promise<{ ok: boolean; error?: string }>;
  setManualRate: (code: ForeignCurrencyCode, idrPerUnit: number) => { ok: boolean; error?: string };
  clearManualRate: (code: ForeignCurrencyCode) => void;
  getRate: (code: ForeignCurrencyCode) => ExchangeRateSnapshot | undefined;
  evaluateDisplayRate: () => RateEvaluation & { rate?: ExchangeRateSnapshot };
  /** Format tampil global (owner 2026-10-27): IDR default; bila
   * displayCurrency asing dan kurs usable, tampilkan konversi; bila
   * kurs tidak usable, FALLBACK ke format IDR (tidak pernah angka
   * tebakan, tidak pernah Rp0). Input non-finite/null -> '—'.
   * DISPLAY-ONLY: nilai sumber tidak pernah ditulis ulang. */
  formatDisplay: (idrAmount: number | null | undefined) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [displayCurrency, setDisplayCurrencyState] = useState<CurrencyCode>(() => loadDisplayCurrency());
  const [rates, setRates] = useState<Partial<Record<ForeignCurrencyCode, ExchangeRateSnapshot>>>(() => loadStoredRates());

  useEffect(() => {
    saveDisplayCurrency(displayCurrency);
  }, [displayCurrency]);

  useEffect(() => {
    saveStoredRates(rates);
  }, [rates]);

  const setDisplayCurrency = React.useCallback((code: CurrencyCode) => {
    if (!isSupportedCurrency(code)) return;
    setDisplayCurrencyState(code);
  }, []);

  const refreshRates = React.useCallback(async () => {
    try {
      const result = await fetchRatesFromProvider();
      // Merge: entri manual dipertahankan, entri non-manual diperbarui.
      setRates((prev) => mergeProviderRates(prev, result.rates));
      return { ok: true as const };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal memperbarui kurs.';
      return { ok: false as const, error: message };
    }
  }, []);

  const setManualRate = React.useCallback((code: ForeignCurrencyCode, idrPerUnit: number) => {
    const validated = validateIdrPerUnit(idrPerUnit);
    if (!validated.ok) return { ok: false as const, error: validated.reason };
    setRates((prev) => ({
      ...prev,
      [code]: {
        code,
        idrPerUnit: validated.value,
        source: MANUAL_RATE_SOURCE,
        retrievedAtMs: Date.now(),
        manual: true,
      },
    }));
    return { ok: true as const };
  }, []);

  const clearManualRate = React.useCallback((code: ForeignCurrencyCode) => {
    setRates((prev) => {
      if (!prev[code]?.manual) return prev;
      const next = { ...prev };
      delete next[code];
      return next;
    });
  }, []);

  const getRate = React.useCallback(
    (code: ForeignCurrencyCode) => rates[code],
    [rates],
  );

  const evaluateDisplayRate = React.useCallback(() => {
    if (displayCurrency === 'IDR') {
      return { state: 'available' as const, usable: true, reason: 'IDR adalah mata uang dasar.' };
    }
    const rate = rates[displayCurrency as ForeignCurrencyCode];
    return { ...evaluateRate(rate), rate };
  }, [displayCurrency, rates]);

  const formatDisplay = React.useCallback((idrAmount: number | null | undefined): string => {
    if (idrAmount == null || !Number.isFinite(idrAmount)) return '—';
    if (displayCurrency === 'IDR') return formatCurrency(idrAmount, 'IDR');
    const rate = rates[displayCurrency as ForeignCurrencyCode];
    const res = convertIdrToDisplay(
      { amount: idrAmount, currency: 'IDR', kind: 'mixed' },
      displayCurrency,
      rate,
    );
    if (res.ok && res.converted) return formatCurrency(res.value.value, displayCurrency);
    // Kurs tidak usable: fallback jujur ke IDR, bukan angka tebakan.
    return formatCurrency(idrAmount, 'IDR');
  }, [displayCurrency, rates]);

  return (
    <CurrencyContext.Provider
      value={{
        displayCurrency,
        setDisplayCurrency,
        rates,
        refreshRates,
        setManualRate,
        clearManualRate,
        getRate,
        evaluateDisplayRate,
        formatDisplay,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error('useCurrency must be used within CurrencyProvider');
  return context;
};

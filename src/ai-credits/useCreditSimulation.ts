/**
 * Hook state SIMULASI kredit AI.
 * Menghubungkan komponen React ke mockAdapter (bukan backend).
 */
import { useEffect, useState } from 'react';
import {
  mockConsume,
  mockGetBalance,
  mockGetLedger,
  mockReset,
  mockSetPlan,
  mockTopUp,
  subscribeMock,
} from './mockAdapter';
import type { AiFeature, CreditBalance, LedgerEntry } from './types';

export function useCreditSimulation() {
  const [balance, setBalance] = useState<CreditBalance>(() => mockGetBalance());
  const [ledger, setLedger] = useState<LedgerEntry[]>(() => mockGetLedger());

  useEffect(
    () =>
      subscribeMock(() => {
        setBalance(mockGetBalance());
        setLedger(mockGetLedger());
      }),
    []
  );

  return {
    balance,
    ledger,
    /** Catat pemakaian simulasi. false = saldo tidak cukup. */
    consume: (feature: AiFeature, credits: number, description: string, opts?: { model?: string; jobReference?: string }) =>
      mockConsume(feature, credits, description, opts),
    topUp: () => mockTopUp(),
    setPlan: (plan: CreditBalance['plan']) => mockSetPlan(plan),
    reset: () => mockReset(),
  };
}

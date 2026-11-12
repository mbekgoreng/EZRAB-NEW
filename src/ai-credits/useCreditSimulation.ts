/**
 * Hook saldo kredit AI — SERVER PERTAMA (B11/D14, Gelombang 2).
 * ============================================================================
 * Sumber saldo tampilan, menurut keadaan sesi:
 * - Sesi nyata ADA → saldo dibaca dari server (/api/credits/balance,
 *   ledger batch gen-2) lewat src/ai-credits/serverBalance.ts. Bila
 *   server menjawab, `source = 'server'` dan angka yang tampil adalah
 *   angka server. Bila server TIDAK menjawab (backend belum aktif /
 *   jaringan gagal), `source = 'unavailable'` dan saldo tampil sebagai
 *   "belum terhubung" — angka simulasi TIDAK PERNAH ditampilkan sebagai
 *   pengganti saldo akun nyata.
 * - Tanpa sesi (mode demo/showcase) → `source = 'simulation'`; simulasi
 *   localStorage (mockAdapter) tetap menjadi pengalaman demo, dan
 *   seluruh permukaan WAJIB melabelinya "simulasi" secara eksplisit.
 *
 * Perilaku pemakaian per sumber:
 * - server: `consume` HANYA cek kecukupan saldo server (tanpa debit
 *   lokal — debit sesungguhnya dilakukan metering server di gateway AI;
 *   debit lokal akan menghitung ganda). `topUp`/`setPlan`/`reset`
 *   adalah no-op yang gagal jujur (top-up server lewat checkout online,
 *   paket lewat langganan).
 * - unavailable: `consume` selalu false (fail-closed — saldo tidak
 *   dapat diverifikasi); top-up/set-plan/reset no-op.
 * - simulation: perilaku mock lama (debit lokal + persist localStorage).
 *
 * Kompatibilitas: bentuk kembalian lama (balance, ledger, consume,
 * topUp, setPlan, reset) dipertahankan agar 10+ pemakai hook yang ada
 * tidak berubah; field baru (`source`, `refresh`) bersifat aditif.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  mockConsume,
  mockGetBalance,
  mockGetLedger,
  mockReset,
  mockSetPlan,
  mockTopUp,
  subscribeMock,
} from './mockAdapter';
import { fetchServerBalance, unavailableBalance } from './serverBalance';
import { planAllowsAiFeature } from './featureGate';
import { useAuth } from '../auth/AuthContext';
import type { AiFeature, BalanceSource, CreditBalance, LedgerEntry, TopUpStatus } from './types';

const FAILED_TOPUP: TopUpStatus = {
  topUpId: '',
  amountIdr: 0,
  baseCredits: 0,
  bonusCredits: 0,
  totalCredits: 0,
  status: 'failed',
  simulated: false,
};

export function useCreditSimulation() {
  const auth = useAuth();
  const [simBalance, setSimBalance] = useState<CreditBalance>(() => mockGetBalance());
  const [simLedger, setSimLedger] = useState<LedgerEntry[]>(() => mockGetLedger());
  const [serverBalance, setServerBalance] = useState<CreditBalance | null>(null);
  const [source, setSource] = useState<BalanceSource>('simulation');
  const loadSeq = useRef(0);

  useEffect(
    () =>
      subscribeMock(() => {
        setSimBalance(mockGetBalance());
        setSimLedger(mockGetLedger());
      }),
    []
  );

  const loadServer = useCallback(async () => {
    if (!auth.enabled || !auth.user) {
      setServerBalance(null);
      setSource('simulation');
      return;
    }
    const seq = ++loadSeq.current;
    const token = await auth.getAccessToken();
    if (seq !== loadSeq.current) return; // sesi berubah di tengah jalan — buang hasil basi
    const result = await fetchServerBalance(token);
    if (seq !== loadSeq.current) return;
    if (result.ok) {
      setServerBalance(result.balance);
      setSource('server');
    } else {
      setServerBalance(null);
      setSource('unavailable');
    }
  }, [auth.enabled, auth.user, auth.getAccessToken]);

  useEffect(() => {
    void loadServer();
  }, [loadServer]);

  const refresh = useCallback(() => {
    void loadServer();
  }, [loadServer]);

  const balance: CreditBalance =
    source === 'server' && serverBalance
      ? serverBalance
      : source === 'unavailable'
        ? unavailableBalance()
        : simBalance;
  // Riwayat simulasi hanya bermakna di mode simulasi; di mode server
  // riwayat pemakaian dibaca dari endpoint usage (UsageMeterSection),
  // bukan dari ledger mock yang kosong/palsu.
  const ledger: LedgerEntry[] = source === 'simulation' ? simLedger : [];

  const consume = useCallback(
    (
      feature: AiFeature,
      credits: number,
      description: string,
      opts?: { model?: string; jobReference?: string; tokensIn?: number; tokensOut?: number; weightedTokens?: number },
    ): boolean => {
      if (source === 'server') {
        // Cek kecukupan saja — tanpa debit lokal (lihat header).
        if (
          (feature === 'chat-ai' || feature === 'ded-ai' || feature === 'ai-document') &&
          serverBalance &&
          !planAllowsAiFeature(serverBalance.plan, feature)
        ) {
          return false;
        }
        if (!serverBalance || !Number.isInteger(credits) || credits <= 0) return false;
        return credits <= serverBalance.total;
      }
      if (source === 'unavailable') return false;
      return mockConsume(feature, credits, description, opts);
    },
    [source, serverBalance],
  );

  const topUp = useCallback(
    (itemId?: string): TopUpStatus => {
      // Mode server/unavailable: top-up hanya lewat checkout online
      // (CreditTopUpModal); simulasi top-up tidak boleh mengubah angka
      // yang tampil sebagai saldo server.
      if (source !== 'simulation') return FAILED_TOPUP;
      return mockTopUp(itemId);
    },
    [source],
  );

  const setPlan = useCallback(
    (plan: CreditBalance['plan']) => {
      if (source !== 'simulation') return;
      mockSetPlan(plan);
    },
    [source],
  );

  const reset = useCallback(() => {
    if (source !== 'simulation') return;
    mockReset();
  }, [source]);

  return {
    balance,
    ledger,
    /** Sumber saldo yang sedang ditampilkan: 'server' | 'simulation' | 'unavailable'. */
    source,
    /** Catat pemakaian (simulasi) atau cek kecukupan (server). false = saldo tidak cukup / tidak terverifikasi. */
    consume,
    topUp,
    setPlan,
    reset,
    /** Muat ulang saldo server (no-op bermakna di mode simulasi — tidak ada server untuk dibaca). */
    refresh,
  };
}

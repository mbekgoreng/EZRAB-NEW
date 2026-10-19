/**
 * Halaman Kredit AI — billing & penggunaan (Fase 1: frontend simulasi).
 * Dibuka via widget saldo di TopBar / Chat AI / DED AI / AI Document.
 * TIDAK ada di sidebar (keputusan: sidebar tetap 3 item AI).
 */
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, RotateCcw, Activity } from 'lucide-react';
import './ai-credits.css';
import { useCreditSimulation } from './useCreditSimulation';
import { CREDIT_CONFIG_NOTE, FEATURE_LABELS, PLAN_CREDITS, TOPUP_OFFER } from './config';
import { formatCredits, formatRupiah } from './format';
import type { CreditPlan } from './types';
import { CreditTopUpModal } from './components/CreditTopUpModal';
import { CreditUsageHistory } from './components/CreditUsageHistory';
import { CreditUsageSummary } from './components/CreditUsageSummary';
import { CreditLowBalanceNotice } from './components/CreditLowBalanceNotice';

/**
 * Seksi Usage Meter (Phase 3): riwayat pemakaian AI aktual dari backend.
 * Jika backend belum aktif → tampil jujur "menunggu backend", bukan data palsu.
 */
const UsageMeterSection: React.FC = () => {
  const [state, setState] = useState<'loading' | 'empty' | 'data' | 'unavailable'>('loading');
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/credits/usage?limit=20')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (cancelled) return;
        if (d.success && Array.isArray(d.usage) && d.usage.length > 0) {
          setItems(d.usage);
          setState('data');
        } else {
          setState('empty');
        }
      })
      .catch(() => {
        if (!cancelled) setState('unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const statusLabel = (s: string) => {
    if (s === 'actual') return 'Aktual terverifikasi';
    if (s === 'estimated') return 'Estimasi';
    if (s === 'failed') return 'Gagal';
    return 'Menunggu rekonsiliasi';
  };

  return (
    <div className="aic-card">
      <div className="aic-k" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Activity size={14} /> Pemakaian AI (usage meter)
      </div>
      {state === 'loading' && (
        <div style={{ fontSize: 13, color: 'var(--ez-color-text-faint)' }}>Memuat…</div>
      )}
      {state === 'unavailable' && (
        <div style={{ fontSize: 13, color: 'var(--ez-color-text-faint)', lineHeight: 1.6 }}>
          Backend usage meter belum aktif. Data pemakaian aktual akan tampil di sini
          setelah backend Phase 3 di-deploy. Tidak ada data simulasi yang ditampilkan
          sebagai data nyata.
        </div>
      )}
      {state === 'empty' && (
        <div style={{ fontSize: 13, color: 'var(--ez-color-text-faint)' }}>
          Belum ada pemakaian AI yang tercatat.
        </div>
      )}
      {state === 'data' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((u: any) => (
            <div
              key={u.id}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 12px', borderRadius: 10,
                background: 'var(--ez-color-surface-secondary)',
                fontSize: 12.5,
              }}
            >
              <div>
                <div style={{ fontWeight: 700 }}>{u.feature || 'AI'}</div>
                <div style={{ color: 'var(--ez-color-text-faint)', fontSize: 11.5 }}>
                  {u.model || '?'} · {u.tokens_in != null ? `${u.tokens_in} in / ${u.tokens_out} out` : 'token tidak tersedia'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 800 }}>
                  {u.credits_charged != null ? `${u.credits_charged} kredit` : '—'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ez-color-text-faint)' }}>
                  {statusLabel(u.status)}
                  {u.cost_status === 'UNDETERMINED' ? ' · biaya provider belum dapat ditentukan' : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface Props {
  onBack: () => void;
}

export const CreditPage: React.FC<Props> = ({ onBack }) => {
  const { balance, ledger, topUp, setPlan, reset } = useCreditSimulation();
  const [topUpOpen, setTopUpOpen] = useState(false);

  const planLabel = balance.plan === 'free' ? 'Gratis' : balance.plan === 'starter' ? 'Starter' : 'Pro';

  return (
    <div className="aic aic-page">
      <div className="aic-page-head">
        <button
          type="button"
          onClick={onBack}
          className="aic-btn-ghost"
          style={{ height: 34, marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <ArrowLeft size={15} /> Kembali
        </button>
        <h2>Kredit AI</h2>
        <p>
          Saldo dan riwayat pemakaian fitur AI. Seluruh angka di halaman ini adalah{' '}
          <strong>simulasi frontend</strong> — bukan penagihan nyata.
        </p>
      </div>

      <CreditLowBalanceNotice />

      <div className="aic-cards">
        <div className="aic-card hero">
          <div className="aic-k">Saldo tersedia</div>
          <div className="aic-v">{balance.total.toLocaleString('id-ID')}</div>
          <div className="aic-s">kredit · paket {planLabel}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" className="aic-btn-primary" style={{ height: 36, fontSize: 13 }} onClick={() => setTopUpOpen(true)}>
              <Plus size={14} style={{ verticalAlign: -2, marginRight: 4 }} /> Top-up
            </button>
          </div>
        </div>
        <div className="aic-card">
          <div className="aic-k">Kredit langganan</div>
          <div className="aic-v">{balance.subscription.toLocaleString('id-ID')}</div>
          <div className="aic-s">jatah paket {planLabel} per periode</div>
        </div>
        <div className="aic-card">
          <div className="aic-k">Kredit top-up</div>
          <div className="aic-v">{balance.topup.toLocaleString('id-ID')}</div>
          <div className="aic-s">dari pembelian simulasi</div>
        </div>
        <div className="aic-card">
          <div className="aic-k">Kredit bonus</div>
          <div className="aic-v">{balance.bonus.toLocaleString('id-ID')}</div>
          <div className="aic-s">bonus 20% tiap top-up</div>
        </div>
      </div>

      <div className="aic-card">
        <div className="aic-k">Paket langganan</div>
        <div className="aic-plan-row" style={{ marginTop: 8 }}>
          <span className="aic-chip">{planLabel}</span>
          <span style={{ fontSize: 13, color: 'var(--ez-color-text-faint)' }}>
            {balance.plan === 'free'
              ? 'Paket gratis — tanpa jatah kredit langganan.'
              : `${formatCredits(PLAN_CREDITS[balance.plan as 'starter' | 'pro'])} per periode.`}
          </span>
        </div>
        <div className="aic-plan-row" style={{ marginTop: 12 }}>
          <span style={{ fontSize: 12.5, color: 'var(--ez-color-text-faint)' }}>Simulasi ganti paket:</span>
          {(['free', 'starter', 'pro'] as CreditPlan[]).map((p) => (
            <button
              key={p}
              type="button"
              className="aic-btn-ghost"
              style={{
                height: 32, fontSize: 12.5,
                borderColor: balance.plan === p ? 'var(--ez-color-primary)' : undefined,
                fontWeight: balance.plan === p ? 800 : 600,
              }}
              onClick={() => setPlan(p)}
            >
              {p === 'free' ? 'Gratis' : p === 'starter' ? 'Starter' : 'Pro'}
            </button>
          ))}
          <button
            type="button"
            className="aic-btn-ghost"
            style={{ height: 32, fontSize: 12.5 }}
            onClick={() => { if (window.confirm('Reset seluruh simulasi kredit ke awal?')) reset(); }}
            title="Reset simulasi"
          >
            <RotateCcw size={13} style={{ verticalAlign: -2, marginRight: 4 }} /> Reset
          </button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--ez-color-text-faint)', marginTop: 10 }}>
          Penawaran top-up: {formatRupiah(TOPUP_OFFER.priceIdr)} → {formatCredits(TOPUP_OFFER.totalCredits)} (dasar {formatCredits(TOPUP_OFFER.baseCredits)} + bonus 20%).
        </div>
      </div>

      <CreditUsageSummary entries={ledger} />

      <div className="aic-card">
        <div className="aic-k" style={{ marginBottom: 12 }}>Riwayat transaksi &amp; pemakaian</div>
        <CreditUsageHistory entries={ledger} />
      </div>

      <UsageMeterSection />

      <div style={{ fontSize: 12, color: 'var(--ez-color-text-faint)', lineHeight: 1.6 }}>
        <strong>Catatan kalibrasi:</strong> {CREDIT_CONFIG_NOTE} Detail tarif per fitur:{' '}
        {Object.keys(FEATURE_LABELS).filter((f) => f !== 'topup' && f !== 'other').map((f) => FEATURE_LABELS[f as keyof typeof FEATURE_LABELS]).join(', ')}.
        Masa berlaku kredit langganan belum ditentukan pada fase ini.
      </div>

      {topUpOpen && <CreditTopUpModal onClose={() => setTopUpOpen(false)} />}
    </div>
  );
};

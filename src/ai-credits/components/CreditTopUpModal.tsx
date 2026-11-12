/**
 * Modal top-up kredit — SIMULASI FRONTEND + jalur checkout online.
 * Jalur simulasi tidak memotong saldo dan tidak menyatakan transaksi
 * berhasil; tombol "Simulasikan Top-up" hanya menambah saldo mock.
 * Jalur online (Midtrans) hanya muncul bila VITE_MIDTRANS_CLIENT_KEY
 * terpasang; bila tidak, status "payment gateway not connected"
 * ditampilkan apa adanya. Kredit dari jalur online diberikan SERVER
 * dari webhook terverifikasi — callback Snap di sini hanya umpan balik.
 *
 * Tier mengikuti penawaran kanonis Spec v1.0 §7.2 (K6): 4 pilihan,
 * tanpa bonus, tidak kedaluwarsa. Penawaran interim Fase 1 tunggal
 * (Rp5.000 → 3.600) sudah dihapus.
 *
 * B11: tombol simulasi HANYA tampil bila sumber saldo adalah simulasi
 * (mode demo). Bila saldo berasal dari server, top-up simulasi tidak
 * boleh mengubah angka yang tampil sebagai saldo server.
 */
import React, { useState } from 'react';
import { X, Info, CheckCircle2 } from 'lucide-react';
import { TOPUP_OFFERS, topUpOfferFor } from '../config';
import { formatRupiah, formatCredits } from '../format';
import { useCreditSimulation } from '../useCreditSimulation';
import { useAuth } from '../../auth/AuthContext';
import { isOnlinePaymentConfigured, startOnlineCheckout } from '../../billing/checkoutClient';

interface Props {
  onClose: () => void;
  workspaceId?: string;
}

export const CreditTopUpModal: React.FC<Props> = ({ onClose, workspaceId }) => {
  const { topUp, balance, source, refresh } = useCreditSimulation();
  const auth = useAuth();
  const [done, setDone] = useState(false);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [onlineNote, setOnlineNote] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string>(TOPUP_OFFERS[0].itemId);
  const onlineConfigured = isOnlinePaymentConfigured();
  const selected = topUpOfferFor(selectedItemId) ?? TOPUP_OFFERS[0];
  const simulationMode = source === 'simulation';

  const handleSimulate = () => {
    topUp(selected.itemId); // mock — hanya menambah saldo simulasi
    setDone(true);
  };

  const handleOnline = async () => {
    setOnlineNote(null);
    if (!auth.enabled || !auth.user) {
      setOnlineNote('Pembayaran online memerlukan akun yang masuk (mode demo memakai simulasi).');
      return;
    }
    setOnlineBusy(true);
    try {
      const token = await auth.getAccessToken();
      if (!token) {
        setOnlineNote('Sesi tidak ditemukan. Masuk kembali, lalu coba lagi.');
        return;
      }
      const result = await startOnlineCheckout({
        accessToken: token,
        workspaceId,
        kind: 'TOP_UP',
        itemId: selected.itemId,
        callbacks: {
          onSuccess: () => {
            setOnlineNote('Pembayaran diterima Midtrans. Kredit masuk ke saldo server setelah notifikasi terverifikasi diproses — bukan dari halaman ini.');
            refresh();
          },
          onPending: () =>
            setOnlineNote('Pembayaran menunggu penyelesaian. Kredit masuk setelah Midtrans mengonfirmasi pembayaran ke server.'),
          onError: () => setOnlineNote('Pembayaran gagal atau ditolak. Tidak ada kredit yang diberikan.'),
          onClose: () => setOnlineNote(null),
        },
      });
      if (!result.ok) {
        setOnlineNote(
          result.error === 'BILLING_NOT_CONFIGURED'
            ? 'Server pembayaran belum terhubung (konfigurasi server belum lengkap).'
            : `Checkout online gagal dimulai (${result.error}).`
        );
      }
    } finally {
      setOnlineBusy(false);
    }
  };

  return (
    <div className="aic-modal-veil" onClick={onClose} role="dialog" aria-modal="true" aria-label="Top-up kredit AI">
      <div className="aic-modal aic" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <h3>Top-up Kredit AI</h3>
          <button type="button" onClick={onClose} aria-label="Tutup" className="aic-btn-ghost" style={{ height: 34, padding: '0 12px' }}>
            <X size={16} />
          </button>
        </div>
        <p className="aic-sub">Tambah saldo kredit untuk memakai fitur AI. Kredit top-up tidak kedaluwarsa.</p>

        {balance.plan === 'free' ? (
          <>
            <div className="aic-sim-banner">
              <Info size={15} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                <strong>Top-up tidak tersedia untuk paket Free (Gratis).</strong> Kredit Free
                adalah jatah awal 100 kredit sekali — habis berarti habis, tanpa top-up dan
                tanpa isi ulang. Untuk top-up dan fitur AI penuh, gunakan paket berbayar
                (Starter / Professional / Business). Mode demo — simulasi, bukan penagihan nyata.
              </span>
            </div>
            <div className="aic-modal-actions">
              <button type="button" className="aic-btn-primary" onClick={onClose}>Tutup</button>
            </div>
          </>
        ) : !done ? (
          <>
            <div className="aic-offer" role="radiogroup" aria-label="Pilih paket top-up">
              {TOPUP_OFFERS.map((tier) => (
                <label
                  key={tier.itemId}
                  className="aic-offer-row"
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <input
                    type="radio"
                    name="topup-tier"
                    value={tier.itemId}
                    checked={selectedItemId === tier.itemId}
                    onChange={() => setSelectedItemId(tier.itemId)}
                  />
                  <span>{formatCredits(tier.credits)}</span>
                  <strong style={{ marginLeft: 'auto' }}>{formatRupiah(tier.priceIdr)}</strong>
                </label>
              ))}
              <div className="aic-offer-row total">
                <span>Total diterima</span>
                <span>{formatCredits(selected.credits)} · tidak kedaluwarsa</span>
              </div>
            </div>
            {simulationMode && (
              <div className="aic-sim-banner">
                <Info size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  <strong>Mode simulasi.</strong> Pembayaran sungguhan belum aktif pada fase
                  frontend ini — tombol di bawah hanya menambah saldo simulasi untuk
                  demonstrasi, bukan transaksi nyata.
                </span>
              </div>
            )}
            <div className="aic-offer" style={{ marginTop: 10 }}>
              <div className="aic-offer-row">
                <span>Pembayaran online (Midtrans)</span>
                <strong>{onlineConfigured ? 'Terhubung' : 'Belum terhubung'}</strong>
              </div>
              {onlineConfigured ? (
                <div style={{ fontSize: 13, color: 'var(--ez-color-text-faint)' }}>
                  Bayar sungguhan lewat QRIS / VA / e-wallet / kartu. Kredit diberikan
                  server setelah notifikasi Midtrans terverifikasi — bukan oleh halaman ini.
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--ez-color-text-faint)' }}>
                  Payment gateway not connected — kunci pembayaran belum terpasang,
                  jadi belum ada pembayaran sungguhan yang bisa dijalankan.
                </div>
              )}
              {onlineNote && (
                <div style={{ fontSize: 13, marginTop: 6 }}>{onlineNote}</div>
              )}
            </div>
            <div className="aic-modal-actions">
              <button type="button" className="aic-btn-ghost" onClick={onClose}>Batal</button>
              {onlineConfigured && (
                <button type="button" className="aic-btn-primary" onClick={handleOnline} disabled={onlineBusy}>
                  {onlineBusy ? 'Memproses…' : 'Bayar Online (Midtrans)'}
                </button>
              )}
              {simulationMode && (
                <button type="button" className="aic-btn-primary" onClick={handleSimulate}>
                  Simulasikan Top-up
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="aic-offer" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <CheckCircle2 size={22} color="#16a34a" />
              <div>
                <div style={{ fontWeight: 800 }}>Simulasi top-up dicatat</div>
                <div style={{ fontSize: 13, color: 'var(--ez-color-text-faint)' }}>
                  +{formatCredits(selected.credits)} ditambahkan ke saldo simulasi.
                  Bukan pembayaran nyata.
                </div>
              </div>
            </div>
            <div className="aic-modal-actions">
              <button type="button" className="aic-btn-primary" onClick={onClose}>Tutup</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/**
 * Modal top-up kredit — SIMULASI FRONTEND + jalur checkout online.
 * Jalur simulasi tidak memotong saldo dan tidak menyatakan transaksi
 * berhasil; tombol "Simulasikan Top-up" hanya menambah saldo mock.
 * Jalur online (Midtrans) hanya muncul bila VITE_MIDTRANS_CLIENT_KEY
 * terpasang; bila tidak, status "payment gateway not connected"
 * ditampilkan apa adanya. Kredit dari jalur online diberikan SERVER
 * dari webhook terverifikasi — callback Snap di sini hanya umpan balik.
 */
import React, { useState } from 'react';
import { X, Info, CheckCircle2 } from 'lucide-react';
import { TOPUP_OFFER } from '../config';
import { formatRupiah, formatCredits } from '../format';
import { useCreditSimulation } from '../useCreditSimulation';
import { useAuth } from '../../auth/AuthContext';
import { isOnlinePaymentConfigured, startOnlineCheckout } from '../../billing/checkoutClient';

interface Props {
  onClose: () => void;
  workspaceId?: string;
}

export const CreditTopUpModal: React.FC<Props> = ({ onClose, workspaceId }) => {
  const { topUp, balance } = useCreditSimulation();
  const auth = useAuth();
  const [done, setDone] = useState(false);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [onlineNote, setOnlineNote] = useState<string | null>(null);
  const onlineConfigured = isOnlinePaymentConfigured();

  const handleSimulate = () => {
    topUp(); // mock — hanya menambah saldo simulasi
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
        itemId: 'topup-3600',
        callbacks: {
          onSuccess: () =>
            setOnlineNote('Pembayaran diterima Midtrans. Kredit masuk ke saldo server setelah notifikasi terverifikasi diproses — bukan dari halaman ini.'),
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
        <p className="aic-sub">Tambah saldo kredit untuk memakai fitur AI.</p>

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
            <div className="aic-offer">
              <div className="aic-offer-row"><span>Harga</span><strong>{formatRupiah(TOPUP_OFFER.priceIdr)}</strong></div>
              <div className="aic-offer-row"><span>Kredit dasar</span><span>{formatCredits(TOPUP_OFFER.baseCredits)}</span></div>
              <div className="aic-offer-row"><span>Bonus 20%</span><span>+ {formatCredits(TOPUP_OFFER.bonusCredits)}</span></div>
              <div className="aic-offer-row total"><span>Total diterima</span><span>{formatCredits(TOPUP_OFFER.totalCredits)}</span></div>
            </div>
            <div className="aic-sim-banner">
              <Info size={15} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                <strong>Mode simulasi.</strong> Pembayaran sungguhan belum aktif pada fase
                frontend ini — tombol di bawah hanya menambah saldo simulasi untuk
                demonstrasi, bukan transaksi nyata.
              </span>
            </div>
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
              <button type="button" className="aic-btn-primary" onClick={handleSimulate}>
                Simulasikan Top-up
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="aic-offer" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <CheckCircle2 size={22} color="#16a34a" />
              <div>
                <div style={{ fontWeight: 800 }}>Simulasi top-up dicatat</div>
                <div style={{ fontSize: 13, color: 'var(--ez-color-text-faint)' }}>
                  +{formatCredits(TOPUP_OFFER.totalCredits)} ditambahkan ke saldo simulasi.
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

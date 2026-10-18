/**
 * Modal top-up kredit — SIMULASI FRONTEND.
 * Tidak memotong saldo, tidak mengirim pembayaran, tidak menyatakan
 * transaksi berhasil. Tombol "Simulasikan Top-up" menambah saldo mock.
 */
import React, { useState } from 'react';
import { X, Info, CheckCircle2 } from 'lucide-react';
import { TOPUP_OFFER } from '../config';
import { formatRupiah, formatCredits } from '../format';
import { useCreditSimulation } from '../useCreditSimulation';

interface Props {
  onClose: () => void;
}

export const CreditTopUpModal: React.FC<Props> = ({ onClose }) => {
  const { topUp } = useCreditSimulation();
  const [done, setDone] = useState(false);

  const handleSimulate = () => {
    topUp(); // mock — hanya menambah saldo simulasi
    setDone(true);
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

        {!done ? (
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
            <div className="aic-modal-actions">
              <button type="button" className="aic-btn-ghost" onClick={onClose}>Batal</button>
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

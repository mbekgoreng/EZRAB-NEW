import React, { useState } from 'react';
import {
  Plus,
  ArrowDownLeft,
  Calendar,
  CheckCircle2,
  Trash2,
  Receipt,
  Search,
  Filter,
} from 'lucide-react';
import { Payment, Invoice, PaymentMethod } from '../../domain/finance/types';
import { formatRupiah } from '../../engine/formulaEngine';
import { Project } from '../../types';

interface PaymentTrackingTabProps {
  currentProject: Project | null;
  payments: Payment[];
  invoices: Invoice[];
  prefilledInvoice?: Invoice | null;
  onSavePayment: (payment: Omit<Payment, 'id' | 'projectId' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  onDeletePayment: (id: string) => void;
}

export const PaymentTrackingTab: React.FC<PaymentTrackingTabProps> = ({
  currentProject,
  payments,
  invoices,
  prefilledInvoice,
  onSavePayment,
  onDeletePayment,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  const [amount, setAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Transfer');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Unpaid or partially paid invoices that can receive payments
  const payableInvoices = invoices.filter((i) => i.status !== 'PAID' && i.status !== 'CANCELLED');

  const openPaymentModal = (targetInv?: Invoice | null) => {
    const inv = targetInv || prefilledInvoice || payableInvoices[0] || invoices[0];
    const todayStr = new Date().toISOString().split('T')[0];

    if (inv) {
      setSelectedInvoiceId(inv.id);
      setAmount(inv.outstandingAmount > 0 ? inv.outstandingAmount : inv.total);
    } else {
      setSelectedInvoiceId('');
      setAmount(0);
    }

    setPaymentDate(todayStr);
    setPaymentMethod('Transfer');
    setReferenceNumber('');
    setReceivedBy('');
    setNotes('');
    setErrorMessage('');
    setModalOpen(true);
  };

  const handleInvoiceChange = (invId: string) => {
    setSelectedInvoiceId(invId);
    const inv = invoices.find((i) => i.id === invId);
    if (inv) {
      setAmount(inv.outstandingAmount > 0 ? inv.outstandingAmount : inv.total);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoiceId) {
      setErrorMessage('Pilih invoice yang dibayarkan.');
      return;
    }
    if (amount <= 0) {
      setErrorMessage('Nominal pembayaran harus lebih besar dari 0.');
      return;
    }

    try {
      onSavePayment({
        invoiceId: selectedInvoiceId,
        paymentDate: paymentDate || new Date().toISOString().split('T')[0],
        amount: Number(amount),
        paymentMethod,
        referenceNumber: referenceNumber.trim() || undefined,
        receivedBy: receivedBy.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setModalOpen(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menyimpan pembayaran.');
    }
  };

  const totalReceived = payments.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. Header Bar */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          padding: '20px 24px',
          boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
            Pemasukan & Pembayaran Masuk
          </h2>
          <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>
            Buku kas penerimaan dana dari klien untuk melunasi tagihan invoice proyek.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 650, textTransform: 'uppercase' }}>
              Total Kas Masuk
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#16A34A' }}>
              {formatRupiah(totalReceived)}
            </div>
          </div>

          <button
            type="button"
            onClick={() => openPaymentModal()}
            style={{
              padding: '10px 18px',
              borderRadius: '10px',
              backgroundColor: '#16A34A',
              color: '#FFFFFF',
              border: 'none',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)',
            }}
          >
            <Plus size={16} />
            <span>Catat Pembayaran</span>
          </button>
        </div>
      </div>

      {/* 2. Payment List */}
      {payments.length === 0 ? (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            padding: '48px 20px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ArrowDownLeft size={24} color="#16A34A" />
          </div>
          <h3 style={{ fontSize: '16px', fontWeight: 750, color: '#0F172A', margin: 0 }}>
            Belum ada pembayaran yang dicatat
          </h3>
          <p style={{ fontSize: '13px', color: '#64748B', maxWidth: '420px', margin: 0 }}>
            Catat pembayaran yang telah ditransfer atau dibayarkan oleh klien terhadap tagihan invoice yang aktif.
          </p>
          <button
            type="button"
            onClick={() => openPaymentModal()}
            style={{
              marginTop: '8px',
              padding: '8px 16px',
              borderRadius: '8px',
              backgroundColor: '#16A34A',
              color: '#FFFFFF',
              border: 'none',
              fontSize: '13px',
              fontWeight: 650,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Plus size={15} />
            <span>Catat Pembayaran Masuk</span>
          </button>
        </div>
      ) : (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            overflow: 'hidden',
            boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Tanggal</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>No. Invoice</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Metode & Referensi</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>Nominal Diterima</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Catatan</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const inv = invoices.find((i) => i.id === p.invoiceId);
                  return (
                    <tr
                      key={p.id}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        transition: 'background-color 120ms ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
                    >
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle', fontWeight: 600, color: '#0F172A' }}>
                        {p.paymentDate}
                      </td>

                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <div style={{ fontWeight: 750, color: '#2563EB' }}>
                          {inv?.invoiceNumber || 'Invoice Dihapus'}
                        </div>
                        {inv && (
                          <div style={{ fontSize: '11px', color: '#64748B' }}>
                            Total Tagihan: {formatRupiah(inv.total)}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <span
                          style={{
                            fontSize: '11.5px',
                            fontWeight: 650,
                            padding: '2px 8px',
                            borderRadius: '6px',
                            backgroundColor: '#F1F5F9',
                            color: '#334155',
                          }}
                        >
                          {p.paymentMethod}
                        </span>
                        {p.referenceNumber && (
                          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '3px' }}>
                            Ref: {p.referenceNumber}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '14px 16px', textAlign: 'right', verticalAlign: 'middle' }}>
                        <div style={{ fontWeight: 800, color: '#16A34A', fontSize: '14px' }}>
                          + {formatRupiah(p.amount)}
                        </div>
                      </td>

                      <td style={{ padding: '14px 16px', verticalAlign: 'middle', color: '#64748B', fontSize: '12px' }}>
                        {p.notes || '-'}
                      </td>

                      <td style={{ padding: '14px 16px', textAlign: 'center', verticalAlign: 'middle' }}>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Hapus catatan pembayaran Rp ${p.amount.toLocaleString('id-ID')}? Status tagihan invoice akan diperbarui secara otomatis.`)) {
                              onDeletePayment(p.id);
                            }
                          }}
                          title="Hapus Pembayaran"
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '6px',
                            backgroundColor: '#F8FAFC',
                            border: '1px solid #E2E8F0',
                            color: '#DC2626',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. Modal Record Payment */}
      {modalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '480px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(15, 23, 42, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Catat Pembayaran Masuk
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: '18px' }}
              >
                &times;
              </button>
            </div>

            {errorMessage && (
              <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#991B1B' }}>
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: '#334155', marginBottom: '4px' }}>
                  Pilih Invoice yang Dibayarkan
                </label>
                <select
                  value={selectedInvoiceId}
                  onChange={(e) => handleInvoiceChange(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    outline: 'none',
                    backgroundColor: '#FFFFFF',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">-- Pilih Invoice --</option>
                  {invoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoiceNumber} &mdash; {inv.clientName} (Sisa: {formatRupiah(inv.outstandingAmount)})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: '#334155', marginBottom: '4px' }}>
                    Nominal Pembayaran (Rp)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={amount}
                    onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                    required
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: '#334155', marginBottom: '4px' }}>
                    Tanggal Bayar
                  </label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: '#334155', marginBottom: '4px' }}>
                    Metode Pembayaran
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      outline: 'none',
                      backgroundColor: '#FFFFFF',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="Transfer">Transfer Bank</option>
                    <option value="Cash">Tunai / Cash</option>
                    <option value="Giro">Bilyet Giro / Cek</option>
                    <option value="Other">Lainnya</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: '#334155', marginBottom: '4px' }}>
                    No. Referensi / Bukti Transfer
                  </label>
                  <input
                    type="text"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder="Contoh: TRF-8899201"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: '#334155', marginBottom: '4px' }}>
                  Catatan Penerimaan (Opsional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Catatan pelunasan, nama pengirim, atau rincian bank..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    backgroundColor: '#F1F5F9',
                    color: '#475569',
                    border: '1px solid #CBD5E1',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 20px',
                    borderRadius: '8px',
                    backgroundColor: '#16A34A',
                    color: '#FFFFFF',
                    border: 'none',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Simpan Pembayaran
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

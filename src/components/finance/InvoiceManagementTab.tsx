import React, { useState } from 'react';
import {
  Plus,
  FileText,
  Download,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowDownLeft,
  Trash2,
  ExternalLink,
  Edit2,
  Calendar,
  Send,
} from 'lucide-react';
import { Invoice, InvoiceStatus, Termin } from '../../domain/finance/types';
import { formatRupiah } from '../../engine/formulaEngine';
import { Project, Company } from '../../types';
import { downloadInvoicePdf } from '../../domain/finance/invoicePdfExporter';

interface InvoiceManagementTabProps {
  currentProject: Project | null;
  company?: Company;
  invoices: Invoice[];
  terms: Termin[];
  onSaveInvoice: (invoice: Omit<Invoice, 'id' | 'projectId' | 'createdAt' | 'updatedAt' | 'paidAmount' | 'outstandingAmount'> & { id?: string }) => void;
  onDeleteInvoice: (id: string) => void;
  onOpenRecordPaymentForInvoice: (invoice: Invoice) => void;
}

export const InvoiceManagementTab: React.FC<InvoiceManagementTabProps> = ({
  currentProject,
  company,
  invoices,
  terms,
  onSaveInvoice,
  onDeleteInvoice,
  onOpenRecordPaymentForInvoice,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);

  // Form State
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [selectedTerminId, setSelectedTerminId] = useState<string>('');
  const [subtotal, setSubtotal] = useState<number>(0);
  const [taxPercent, setTaxPercent] = useState<number>(11);
  const [deductions, setDeductions] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [bankName, setBankName] = useState('BCA (Bank Central Asia)');
  const [bankAccount, setBankAccount] = useState('8830-1234-5678');
  const [bankAccountHolder, setBankAccountHolder] = useState('');
  const [status, setStatus] = useState<InvoiceStatus>('DRAFT');
  const [errorMessage, setErrorMessage] = useState('');
  const [isExportingPdf, setIsExportingPdf] = useState<string | null>(null);

  const openCreateModal = (terminPrefill?: Termin) => {
    setEditingInvoice(null);
    const todayStr = new Date().toISOString().split('T')[0];
    const dueStr = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().split('T')[0];
    const year = new Date().getFullYear();
    const count = invoices.length + 1;
    const generatedNumber = `INV-${year}-${String(count).padStart(3, '0')}`;

    setInvoiceNumber(generatedNumber);
    setInvoiceDate(todayStr);
    setDueDate(dueStr);
    setClientName(currentProject?.clientName || 'Klien Proyek');
    setClientAddress(currentProject?.location || '');
    setClientPhone(currentProject?.clientPhone || '');
    setStatus('DRAFT');
    setNotes('Pembayaran mohon ditransfer sesuai rincian rekening di atas.');
    setBankName('BCA (Bank Central Asia)');
    setBankAccount('8830-1234-5678');
    setBankAccountHolder(company?.name || 'PT EZRAB KONSTRUKSI DIGITAL');
    setErrorMessage('');

    if (terminPrefill) {
      setSelectedTerminId(terminPrefill.id);
      setSubtotal(terminPrefill.amount);
      setTaxPercent(0); // Standard construction contract usually inclusive or 0 tax added to nominal
    } else if (terms.length > 0) {
      setSelectedTerminId(terms[0].id);
      setSubtotal(terms[0].amount);
      setTaxPercent(0);
    } else {
      setSelectedTerminId('');
      setSubtotal(10000000);
      setTaxPercent(0);
    }
    setDeductions(0);
    setModalOpen(true);
  };

  const openEditModal = (inv: Invoice) => {
    setEditingInvoice(inv);
    setInvoiceNumber(inv.invoiceNumber);
    setInvoiceDate(inv.invoiceDate);
    setDueDate(inv.dueDate);
    setClientName(inv.clientName);
    setClientAddress(inv.clientAddress || '');
    setClientPhone(inv.clientPhone || '');
    setSelectedTerminId(inv.terminId || '');
    setSubtotal(inv.subtotal);
    setTaxPercent(inv.taxPercent);
    setDeductions(inv.deductions || 0);
    setNotes(inv.notes || '');
    setBankName(inv.bankName || 'BCA (Bank Central Asia)');
    setBankAccount(inv.bankAccount || '8830-1234-5678');
    setBankAccountHolder(inv.bankAccountHolder || company?.name || '');
    setStatus(inv.status);
    setErrorMessage('');
    setModalOpen(true);
  };

  const handleTerminSelect = (termId: string) => {
    setSelectedTerminId(termId);
    const found = terms.find((t) => t.id === termId);
    if (found) {
      setSubtotal(found.amount);
    }
  };

  const taxAmount = (subtotal * taxPercent) / 100;
  const totalAmount = Math.max(0, subtotal + taxAmount - deductions);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceNumber.trim()) {
      setErrorMessage('Nomor invoice wajib diisi.');
      return;
    }
    if (subtotal <= 0) {
      setErrorMessage('Nominal tagihan (subtotal) harus lebih besar dari 0.');
      return;
    }

    try {
      onSaveInvoice({
        id: editingInvoice?.id,
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate: invoiceDate || new Date().toISOString().split('T')[0],
        dueDate: dueDate || invoiceDate,
        clientName: clientName.trim(),
        clientAddress: clientAddress.trim() || undefined,
        clientPhone: clientPhone.trim() || undefined,
        projectName: currentProject?.name || 'Proyek Konstruksi',
        projectLocation: currentProject?.location || undefined,
        terminId: selectedTerminId || undefined,
        subtotal: Number(subtotal),
        taxPercent: Number(taxPercent),
        taxAmount: Number(taxAmount),
        deductions: Number(deductions) || undefined,
        total: Number(totalAmount),
        status,
        notes: notes.trim() || undefined,
        bankName: bankName.trim(),
        bankAccount: bankAccount.trim(),
        bankAccountHolder: bankAccountHolder.trim(),
      });
      setModalOpen(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menyimpan invoice.');
    }
  };

  const handleDownloadPdf = async (inv: Invoice) => {
    try {
      setIsExportingPdf(inv.id);
      const linkedTerm = terms.find((t) => t.id === inv.terminId);
      await downloadInvoicePdf(inv, {
        company,
        project: currentProject,
        termin: linkedTerm,
      });
    } catch (err) {
      alert('Gagal mengunduh PDF invoice: ' + String(err));
    } finally {
      setIsExportingPdf(null);
    }
  };

  const handleQuickIssue = (inv: Invoice) => {
    if (window.confirm(`Terbitkan invoice "${inv.invoiceNumber}" sekarang? Status akan berubah menjadi DITAGIHKAN.`)) {
      onSaveInvoice({
        ...inv,
        status: 'ISSUED',
      });
    }
  };

  const statusBadge = (st: InvoiceStatus) => {
    const config: Record<InvoiceStatus, { bg: string; color: string; label: string }> = {
      DRAFT: { bg: '#F1F5F9', color: '#475569', label: 'Draft' },
      ISSUED: { bg: '#EFF6FF', color: '#1D4ED8', label: 'Ditagihkan' },
      PARTIALLY_PAID: { bg: '#FEF3C7', color: '#B45309', label: 'Dibayar Sebagian' },
      PAID: { bg: '#DCFCE7', color: '#15803D', label: 'Lunas' },
      OVERDUE: { bg: '#FEE2E2', color: '#B91C1C', label: 'Jatuh Tempo' },
      CANCELLED: { bg: '#F1F5F9', color: '#94A3B8', label: 'Dibatalkan' },
    };
    const c = config[st] || config.DRAFT;
    return (
      <span
        style={{
          fontSize: '11px',
          fontWeight: 750,
          padding: '2px 8px',
          borderRadius: '6px',
          backgroundColor: c.bg,
          color: c.color,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        {c.label}
      </span>
    );
  };

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
            Faktur & Invoice Tagihan Proyek
          </h2>
          <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>
            Kelola faktur tagihan resmi, cetak invoice PDF berstandar Indonesia, dan pantau pelunasan.
          </div>
        </div>

        <button
          type="button"
          onClick={() => openCreateModal()}
          style={{
            padding: '10px 18px',
            borderRadius: '10px',
            backgroundColor: '#2563EB',
            color: '#FFFFFF',
            border: 'none',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)',
          }}
        >
          <Plus size={16} />
          <span>Buat Invoice Baru</span>
        </button>
      </div>

      {/* 2. Invoice List Table */}
      {invoices.length === 0 ? (
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
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={24} color="#2563EB" />
          </div>
          <h3 style={{ fontSize: '16px', fontWeight: 750, color: '#0F172A', margin: 0 }}>
            Belum ada invoice yang diterbitkan
          </h3>
          <p style={{ fontSize: '13px', color: '#64748B', maxWidth: '420px', margin: 0 }}>
            Buat invoice dari termin penagihan yang telah Anda rencanakan atau buat invoice mandiri untuk menagih pekerjaan.
          </p>
          <button
            type="button"
            onClick={() => openCreateModal()}
            style={{
              marginTop: '8px',
              padding: '8px 16px',
              borderRadius: '8px',
              backgroundColor: '#2563EB',
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
            <span>Buat Invoice Sekarang</span>
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
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>No. Invoice</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Klien / Proyek</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Tanggal / Jatuh Tempo</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>Total Tagihan</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>Sisa Piutang</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const linkedTerm = terms.find((t) => t.id === inv.terminId);
                  return (
                    <tr
                      key={inv.id}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        transition: 'background-color 120ms ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
                    >
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <div style={{ fontWeight: 750, color: '#0F172A' }}>{inv.invoiceNumber}</div>
                        {linkedTerm && (
                          <div style={{ fontSize: '11px', color: '#2563EB', marginTop: '2px' }}>
                            {linkedTerm.name} ({linkedTerm.percentage}%)
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <div style={{ fontWeight: 650, color: '#0F172A' }}>{inv.clientName}</div>
                        <div style={{ fontSize: '11px', color: '#64748B' }}>{inv.projectName}</div>
                      </td>

                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <div style={{ color: '#0F172A' }}>{inv.invoiceDate}</div>
                        <div style={{ fontSize: '11px', color: inv.status === 'OVERDUE' ? '#DC2626' : '#64748B' }}>
                          Due: {inv.dueDate}
                        </div>
                      </td>

                      <td style={{ padding: '14px 16px', textAlign: 'right', verticalAlign: 'middle' }}>
                        <div style={{ fontWeight: 750, color: '#0F172A' }}>{formatRupiah(inv.total)}</div>
                        {inv.paidAmount > 0 && (
                          <div style={{ fontSize: '11px', color: '#16A34A' }}>
                            Dibayar: {formatRupiah(inv.paidAmount)}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '14px 16px', textAlign: 'right', verticalAlign: 'middle' }}>
                        <div style={{ fontWeight: 750, color: inv.outstandingAmount > 0 ? '#D97706' : '#16A34A' }}>
                          {formatRupiah(inv.outstandingAmount)}
                        </div>
                      </td>

                      <td style={{ padding: '14px 16px', textAlign: 'center', verticalAlign: 'middle' }}>
                        {statusBadge(inv.status)}
                      </td>

                      <td style={{ padding: '14px 16px', textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          {inv.status === 'DRAFT' && (
                            <button
                              type="button"
                              onClick={() => handleQuickIssue(inv)}
                              title="Terbitkan Invoice"
                              style={{
                                padding: '4px 8px',
                                borderRadius: '6px',
                                backgroundColor: '#EFF6FF',
                                border: '1px solid #BFDBFE',
                                color: '#1D4ED8',
                                fontSize: '11.5px',
                                fontWeight: 650,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <Send size={12} />
                              <span>Terbitkan</span>
                            </button>
                          )}

                          {inv.status !== 'PAID' && inv.status !== 'CANCELLED' && (
                            <button
                              type="button"
                              onClick={() => onOpenRecordPaymentForInvoice(inv)}
                              title="Catat Pembayaran Masuk"
                              style={{
                                padding: '4px 8px',
                                borderRadius: '6px',
                                backgroundColor: '#F0FDF4',
                                border: '1px solid #BBF7D0',
                                color: '#15803D',
                                fontSize: '11.5px',
                                fontWeight: 650,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <ArrowDownLeft size={12} />
                              <span>Bayar</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDownloadPdf(inv)}
                            disabled={isExportingPdf === inv.id}
                            title="Unduh Invoice PDF"
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              backgroundColor: '#F8FAFC',
                              border: '1px solid #E2E8F0',
                              color: '#475569',
                              fontSize: '11.5px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <Download size={12} />
                            <span>PDF</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => openEditModal(inv)}
                            title="Edit Invoice"
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '6px',
                              backgroundColor: '#F8FAFC',
                              border: '1px solid #E2E8F0',
                              color: '#475569',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                            }}
                          >
                            <Edit2 size={12} />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Hapus invoice "${inv.invoiceNumber}"?`)) {
                                onDeleteInvoice(inv.id);
                              }
                            }}
                            title="Hapus Invoice"
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
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. Modal Add / Edit Invoice */}
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
              maxWidth: '560px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(15, 23, 42, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                {editingInvoice ? 'Edit Faktur Tagihan' : 'Buat Faktur Tagihan Baru'}
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: '#334155', marginBottom: '4px' }}>
                    Nomor Invoice
                  </label>
                  <input
                    type="text"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="INV-2026-001"
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
                    Status Tagihan
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as InvoiceStatus)}
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
                    <option value="DRAFT">Draft</option>
                    <option value="ISSUED">Ditagihkan (Issued)</option>
                    <option value="PARTIALLY_PAID">Dibayar Sebagian</option>
                    <option value="PAID">Lunas</option>
                    <option value="OVERDUE">Jatuh Tempo</option>
                    <option value="CANCELLED">Dibatalkan</option>
                  </select>
                </div>
              </div>

              {terms.length > 0 && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: '#334155', marginBottom: '4px' }}>
                    Hubungkan ke Termin (Opsional)
                  </label>
                  <select
                    value={selectedTerminId}
                    onChange={(e) => handleTerminSelect(e.target.value)}
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
                    <option value="">-- Tanpa Termin (Tagihan Bebas) --</option>
                    {terms.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.percentage}%) &mdash; {formatRupiah(t.amount)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: '#334155', marginBottom: '4px' }}>
                    Tanggal Terbit
                  </label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
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
                    Jatuh Tempo
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
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

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: '#334155', marginBottom: '4px' }}>
                  Ditujukan Kepada (Nama Klien / Instansi)
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Nama Klien atau Perusahaan Pembeli"
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

              {/* Amount & Tax Breakdown */}
              <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 650, color: '#334155', marginBottom: '4px' }}>
                      Nominal Pokok (Subtotal Rp)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={subtotal}
                      onChange={(e) => setSubtotal(parseFloat(e.target.value) || 0)}
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
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 650, color: '#334155', marginBottom: '4px' }}>
                      PPN (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={taxPercent}
                      onChange={(e) => setTaxPercent(parseFloat(e.target.value) || 0)}
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

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #E2E8F0', paddingTop: '8px', fontSize: '12px' }}>
                  <span style={{ color: '#64748B' }}>PPN ({taxPercent}%):</span>
                  <span style={{ fontWeight: 650, color: '#0F172A' }}>{formatRupiah(taxAmount)}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13.5px' }}>
                  <span style={{ fontWeight: 750, color: '#0F172A' }}>TOTAL TAGIHAN:</span>
                  <span style={{ fontWeight: 800, color: '#2563EB', fontSize: '16px' }}>{formatRupiah(totalAmount)}</span>
                </div>
              </div>

              {/* Bank Account Details */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: '#334155', marginBottom: '4px' }}>
                    Nama Bank
                  </label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
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
                    No. Rekening & Atas Nama
                  </label>
                  <input
                    type="text"
                    value={bankAccount}
                    onChange={(e) => setBankAccount(e.target.value)}
                    placeholder="No. Rekening"
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
                    backgroundColor: '#2563EB',
                    color: '#FFFFFF',
                    border: 'none',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {editingInvoice ? 'Simpan Perubahan' : 'Buat Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

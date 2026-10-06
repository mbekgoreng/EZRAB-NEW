import React, { useState } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  FileText,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Layers,
  Sparkles,
  ArrowRight,
  Info,
} from 'lucide-react';
import { Termin, TerminStatus } from '../../domain/finance/types';
import { formatRupiah } from '../../engine/formulaEngine';
import { Project } from '../../types';

interface TerminManagementTabProps {
  currentProject: Project | null;
  terms: Termin[];
  contractValue: number;
  totalAllocatedPercentage: number;
  onSaveTermin: (termin: Partial<Termin> & { name: string; percentage: number; amount: number }) => void;
  onDeleteTermin: (id: string) => void;
  onCreateInvoiceFromTermin: (termin: Termin) => void;
}

export const TerminManagementTab: React.FC<TerminManagementTabProps> = ({
  currentProject,
  terms,
  contractValue,
  totalAllocatedPercentage,
  onSaveTermin,
  onDeleteTermin,
  onCreateInvoiceFromTermin,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTermin, setEditingTermin] = useState<Termin | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [percentage, setPercentage] = useState<number>(20);
  const [amount, setAmount] = useState<number>(0);
  const [triggerDescription, setTriggerDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<TerminStatus>('PLANNED');
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const openCreateModal = () => {
    setEditingTermin(null);
    const nextSeq = terms.length + 1;
    const remainingPct = Math.max(0, 100 - totalAllocatedPercentage);
    const defaultPct = remainingPct > 0 ? remainingPct : 20;
    const calcAmount = (contractValue * defaultPct) / 100;

    setName(`Termin ${nextSeq}`);
    setPercentage(defaultPct);
    setAmount(calcAmount);
    setTriggerDescription('');
    setDueDate('');
    setStatus('PLANNED');
    setNotes('');
    setErrorMessage('');
    setModalOpen(true);
  };

  const openEditModal = (term: Termin) => {
    setEditingTermin(term);
    setName(term.name);
    setPercentage(term.percentage);
    setAmount(term.amount);
    setTriggerDescription(term.triggerDescription || '');
    setDueDate(term.dueDate || '');
    setStatus(term.status);
    setNotes(term.notes || '');
    setErrorMessage('');
    setModalOpen(true);
  };

  const handlePercentageChange = (val: number) => {
    setPercentage(val);
    if (contractValue > 0) {
      setAmount((contractValue * val) / 100);
    }
  };

  const handleAmountChange = (val: number) => {
    setAmount(val);
    if (contractValue > 0) {
      setPercentage(Number(((val / contractValue) * 100).toFixed(2)));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMessage('Nama termin wajib diisi.');
      return;
    }
    if (percentage < 0 || percentage > 100) {
      setErrorMessage('Persentase harus berada di antara 0% hingga 100%.');
      return;
    }
    if (amount < 0) {
      setErrorMessage('Nominal termin tidak boleh negatif.');
      return;
    }

    try {
      onSaveTermin({
        id: editingTermin?.id,
        name: name.trim(),
        percentage: Number(percentage),
        amount: Number(amount),
        triggerDescription: triggerDescription.trim() || undefined,
        dueDate: dueDate || undefined,
        status,
        notes: notes.trim() || undefined,
        sequence: editingTermin?.sequence || terms.length + 1,
      });
      setModalOpen(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menyimpan termin.');
    }
  };

  const statusBadge = (st: TerminStatus) => {
    const config: Record<TerminStatus, { bg: string; color: string; label: string }> = {
      PLANNED: { bg: '#F1F5F9', color: '#475569', label: 'Direncanakan' },
      READY_TO_INVOICE: { bg: '#EFF6FF', color: '#1D4ED8', label: 'Siap Ditagihkan' },
      INVOICED: { bg: '#E0E7FF', color: '#4338CA', label: 'Ditagihkan' },
      PARTIALLY_PAID: { bg: '#FEF3C7', color: '#B45309', label: 'Dibayar Sebagian' },
      PAID: { bg: '#DCFCE7', color: '#15803D', label: 'Lunas' },
      OVERDUE: { bg: '#FEE2E2', color: '#B91C1C', label: 'Jatuh Tempo' },
      CANCELLED: { bg: '#F1F5F9', color: '#94A3B8', label: 'Dibatalkan' },
    };
    const c = config[st] || config.PLANNED;
    return (
      <span
        style={{
          fontSize: '11px',
          fontWeight: 700,
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
      {/* 1. Header & Allocation Bar */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          padding: '20px 24px',
          boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              Termin & Penagihan Bertahap
            </h2>
            <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>
              Atur milestone pembayaran berdasarkan progres lapangan atau serah terima pekerjaan.
            </div>
          </div>

          <button
            type="button"
            onClick={openCreateModal}
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
            <span>Tambah Termin</span>
          </button>
        </div>

        {/* Allocation Progress Bar */}
        <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
            <span style={{ fontWeight: 650, color: '#475569' }}>
              Alokasi Nilai Kontrak: <strong>{formatRupiah(contractValue)}</strong>
            </span>
            <span
              style={{
                fontWeight: 700,
                color:
                  totalAllocatedPercentage === 100
                    ? '#16A34A'
                    : totalAllocatedPercentage > 100
                    ? '#DC2626'
                    : '#2563EB',
              }}
            >
              {totalAllocatedPercentage === 100
                ? 'Termin 100% teralokasi'
                : totalAllocatedPercentage > 100
                ? `Alokasi berlebih: ${totalAllocatedPercentage}%`
                : `Teralokasi ${totalAllocatedPercentage}% (Masih tersedia ${100 - totalAllocatedPercentage}%)`}
            </span>
          </div>

          <div
            style={{
              height: '8px',
              borderRadius: '999px',
              backgroundColor: '#F1F5F9',
              overflow: 'hidden',
              display: 'flex',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, totalAllocatedPercentage)}%`,
                backgroundColor:
                  totalAllocatedPercentage === 100
                    ? '#16A34A'
                    : totalAllocatedPercentage > 100
                    ? '#DC2626'
                    : '#2563EB',
                transition: 'width 200ms ease',
              }}
            />
          </div>
        </div>
      </div>

      {/* 2. Termin Cards / Table */}
      {terms.length === 0 ? (
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
            <Layers size={24} color="#2563EB" />
          </div>
          <h3 style={{ fontSize: '16px', fontWeight: 750, color: '#0F172A', margin: 0 }}>
            Belum ada termin penagihan
          </h3>
          <p style={{ fontSize: '13px', color: '#64748B', maxWidth: '420px', margin: 0 }}>
            Buat termin seperti DP 20%, Progress 30%, Progress 60%, dan Serah Terima untuk menagih pembayaran klien secara terstruktur.
          </p>
          <button
            type="button"
            onClick={openCreateModal}
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
            <span>Buat Termin Pertama</span>
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
          {terms.map((term, idx) => (
            <div
              key={term.id}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '14px',
                border: '1px solid #E2E8F0',
                padding: '16px 18px',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '14px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '6px',
                        backgroundColor: '#EFF6FF',
                        color: '#2563EB',
                        fontSize: '12px',
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {idx + 1}
                    </span>
                    <span style={{ fontSize: '14px', fontWeight: 750, color: '#0F172A' }}>
                      {term.name}
                    </span>
                  </div>
                  {statusBadge(term.status)}
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '2px' }}>
                  <span style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
                    {formatRupiah(term.amount)}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#2563EB', backgroundColor: '#EFF6FF', padding: '1px 6px', borderRadius: '4px' }}>
                    {term.percentage}%
                  </span>
                </div>

                {term.triggerDescription && (
                  <div style={{ fontSize: '12px', color: '#475569', backgroundColor: '#F8FAFC', padding: '6px 8px', borderRadius: '6px', border: '1px solid #F1F5F9' }}>
                    <strong>Syarat / Trigger:</strong> {term.triggerDescription}
                  </div>
                )}

                {term.dueDate && (
                  <div style={{ fontSize: '11.5px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Calendar size={13} />
                    <span>Target penagihan: {term.dueDate}</span>
                  </div>
                )}
              </div>

              {/* Card Actions */}
              <div
                style={{
                  borderTop: '1px solid #F1F5F9',
                  paddingTop: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => openEditModal(term)}
                    title="Edit Termin"
                    style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '6px',
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      color: '#475569',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Hapus termin "${term.name}"?`)) {
                        onDeleteTermin(term.id);
                      }
                    }}
                    title="Hapus Termin"
                    style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '6px',
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      color: '#DC2626',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {term.status !== 'PAID' && term.status !== 'INVOICED' && (
                  <button
                    type="button"
                    onClick={() => onCreateInvoiceFromTermin(term)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      backgroundColor: '#EFF6FF',
                      border: '1px solid #BFDBFE',
                      color: '#1D4ED8',
                      fontSize: '12px',
                      fontWeight: 650,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <FileText size={13} />
                    <span>Buat Invoice</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 3. Modal Add / Edit Termin */}
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
                {editingTermin ? 'Edit Termin Penagihan' : 'Tambah Termin Penagihan'}
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
                  Nama Termin / Milestone
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Termin 1 - DP / Mobilisasi"
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: '#334155', marginBottom: '4px' }}>
                    Persentase (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={percentage}
                    onChange={(e) => handlePercentageChange(parseFloat(e.target.value) || 0)}
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
                    Nominal (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={amount}
                    onChange={(e) => handleAmountChange(parseFloat(e.target.value) || 0)}
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
                  Syarat Pekerjaan / Trigger Progres (Opsional)
                </label>
                <input
                  type="text"
                  value={triggerDescription}
                  onChange={(e) => setTriggerDescription(e.target.value)}
                  placeholder="Contoh: Selesai pengecoran struktur lantai 1"
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: '#334155', marginBottom: '4px' }}>
                    Target Jatuh Tempo
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
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
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as TerminStatus)}
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
                    <option value="PLANNED">Direncanakan</option>
                    <option value="READY_TO_INVOICE">Siap Ditagihkan</option>
                    <option value="INVOICED">Ditagihkan</option>
                    <option value="PARTIALLY_PAID">Dibayar Sebagian</option>
                    <option value="PAID">Lunas</option>
                    <option value="OVERDUE">Jatuh Tempo</option>
                    <option value="CANCELLED">Dibatalkan</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: '#334155', marginBottom: '4px' }}>
                  Catatan Tambahan (Opsional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Catatan instruksi atau dokumen lampiran..."
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
                    backgroundColor: '#2563EB',
                    color: '#FFFFFF',
                    border: 'none',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {editingTermin ? 'Simpan Perubahan' : 'Tambah Termin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

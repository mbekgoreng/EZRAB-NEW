import React, { useState } from 'react';
import {
  Plus,
  ArrowUpRight,
  Filter,
  Trash2,
  Calendar,
  Edit2,
  Tag,
  Search,
} from 'lucide-react';
import { Expense, ExpenseCategory } from '../../domain/finance/types';
import { formatRupiah } from '../../engine/formulaEngine';
import { Project } from '../../types';

interface ExpenseTrackingTabProps {
  currentProject: Project | null;
  expenses: Expense[];
  onSaveExpense: (expense: Omit<Expense, 'id' | 'projectId' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  onDeleteExpense: (id: string) => void;
}

const CATEGORIES: ExpenseCategory[] = [
  'Material',
  'Tenaga Kerja',
  'Subkon',
  'Alat',
  'Transport',
  'Operasional',
  'Pajak',
  'Lainnya',
];

export const ExpenseTrackingTab: React.FC<ExpenseTrackingTabProps> = ({
  currentProject,
  expenses,
  onSaveExpense,
  onDeleteExpense,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Form State
  const [date, setDate] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('Material');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [vendor, setVendor] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Transfer');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const openCreateModal = () => {
    setEditingExpense(null);
    setDate(new Date().toISOString().split('T')[0]);
    setCategory('Material');
    setDescription('');
    setAmount(0);
    setVendor('');
    setPaymentMethod('Transfer');
    setReference('');
    setNotes('');
    setErrorMessage('');
    setModalOpen(true);
  };

  const openEditModal = (exp: Expense) => {
    setEditingExpense(exp);
    setDate(exp.date);
    setCategory(exp.category);
    setDescription(exp.description);
    setAmount(exp.amount);
    setVendor(exp.vendor || '');
    setPaymentMethod(exp.paymentMethod);
    setReference(exp.reference || '');
    setNotes(exp.notes || '');
    setErrorMessage('');
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setErrorMessage('Deskripsi pengeluaran wajib diisi.');
      return;
    }
    if (amount <= 0) {
      setErrorMessage('Nominal pengeluaran harus lebih besar dari 0.');
      return;
    }

    try {
      onSaveExpense({
        id: editingExpense?.id,
        date: date || new Date().toISOString().split('T')[0],
        category,
        description: description.trim(),
        amount: Number(amount),
        vendor: vendor.trim() || undefined,
        paymentMethod,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setModalOpen(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menyimpan pengeluaran.');
    }
  };

  const filteredExpenses = expenses.filter((exp) => {
    const matchesCat = selectedCategoryFilter === 'ALL' || exp.category === selectedCategoryFilter;
    const matchesSearch =
      !searchQuery.trim() ||
      exp.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (exp.vendor && exp.vendor.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  const totalExpenseFiltered = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalExpenseAll = expenses.reduce((sum, e) => sum + e.amount, 0);

  const getCategoryColor = (cat: ExpenseCategory): { bg: string; color: string } => {
    const map: Record<ExpenseCategory, { bg: string; color: string }> = {
      Material: { bg: '#EFF6FF', color: '#1D4ED8' },
      'Tenaga Kerja': { bg: '#F5F3FF', color: '#6D28D9' },
      Subkon: { bg: '#ECFDF5', color: '#047857' },
      Alat: { bg: '#FFFBEB', color: '#B45309' },
      Transport: { bg: '#F0F9FF', color: '#0369A1' },
      Operasional: { bg: '#F8FAFC', color: '#475569' },
      Pajak: { bg: '#FEF2F2', color: '#B91C1C' },
      Lainnya: { bg: '#F1F5F9', color: '#64748B' },
    };
    return map[cat] || { bg: '#F1F5F9', color: '#64748B' };
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
            Pengeluaran & Biaya Riil Proyek
          </h2>
          <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>
            Catat setiap realisasi biaya material, upah kerja, alat, subkontraktor, dan operasional lapangan.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 650, textTransform: 'uppercase' }}>
              Total Biaya Riil
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#DC2626' }}>
              {formatRupiah(totalExpenseAll)}
            </div>
          </div>

          <button
            type="button"
            onClick={openCreateModal}
            style={{
              padding: '10px 18px',
              borderRadius: '10px',
              backgroundColor: '#DC2626',
              color: '#FFFFFF',
              border: 'none',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 12px rgba(220, 38, 38, 0.25)',
            }}
          >
            <Plus size={16} />
            <span>Tambah Pengeluaran</span>
          </button>
        </div>
      </div>

      {/* 2. Filters & Categories Chips */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          border: '1px solid #E2E8F0',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setSelectedCategoryFilter('ALL')}
            style={{
              padding: '5px 12px',
              borderRadius: '999px',
              border: `1px solid ${selectedCategoryFilter === 'ALL' ? '#2563EB' : '#E2E8F0'}`,
              backgroundColor: selectedCategoryFilter === 'ALL' ? '#EFF6FF' : '#FFFFFF',
              color: selectedCategoryFilter === 'ALL' ? '#1D4ED8' : '#64748B',
              fontSize: '12px',
              fontWeight: 650,
              cursor: 'pointer',
            }}
          >
            Semua ({expenses.length})
          </button>

          {CATEGORIES.map((cat) => {
            const count = expenses.filter((e) => e.category === cat).length;
            const isSel = selectedCategoryFilter === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategoryFilter(cat)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '999px',
                  border: `1px solid ${isSel ? '#2563EB' : '#E2E8F0'}`,
                  backgroundColor: isSel ? '#EFF6FF' : '#FFFFFF',
                  color: isSel ? '#1D4ED8' : '#64748B',
                  fontSize: '12px',
                  fontWeight: 650,
                  cursor: 'pointer',
                }}
              >
                {cat} {count > 0 && `(${count})`}
              </button>
            );
          })}
        </div>

        <div style={{ position: 'relative', width: '220px' }}>
          <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '10px' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari pengeluaran / vendor..."
            style={{
              width: '100%',
              padding: '7px 10px 7px 30px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              fontSize: '12px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* 3. Expense List Table */}
      {filteredExpenses.length === 0 ? (
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
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ArrowUpRight size={24} color="#DC2626" />
          </div>
          <h3 style={{ fontSize: '16px', fontWeight: 750, color: '#0F172A', margin: 0 }}>
            Tidak ada pengeluaran yang cocok
          </h3>
          <p style={{ fontSize: '13px', color: '#64748B', maxWidth: '420px', margin: 0 }}>
            Catat nota belanja material, upah tukang mingguan, atau sewa alat untuk melacak biaya aktual proyek.
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            style={{
              marginTop: '8px',
              padding: '8px 16px',
              borderRadius: '8px',
              backgroundColor: '#DC2626',
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
            <span>Tambah Pengeluaran</span>
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
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Kategori</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Deskripsi / Item Biaya</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Vendor / Penerima</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>Nominal Biaya</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((exp) => {
                  const catStyle = getCategoryColor(exp.category);
                  return (
                    <tr
                      key={exp.id}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        transition: 'background-color 120ms ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
                    >
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle', fontWeight: 600, color: '#0F172A' }}>
                        {exp.date}
                      </td>

                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '6px',
                            backgroundColor: catStyle.bg,
                            color: catStyle.color,
                          }}
                        >
                          {exp.category}
                        </span>
                      </td>

                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>{exp.description}</div>
                        {exp.notes && (
                          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                            {exp.notes}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '14px 16px', verticalAlign: 'middle', color: '#475569' }}>
                        <div>{exp.vendor || '-'}</div>
                        <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>{exp.paymentMethod}</div>
                      </td>

                      <td style={{ padding: '14px 16px', textAlign: 'right', verticalAlign: 'middle' }}>
                        <div style={{ fontWeight: 800, color: '#DC2626', fontSize: '14px' }}>
                          - {formatRupiah(exp.amount)}
                        </div>
                      </td>

                      <td style={{ padding: '14px 16px', textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => openEditModal(exp)}
                            title="Edit Pengeluaran"
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
                              if (window.confirm(`Hapus pengeluaran "${exp.description}" senilai Rp ${exp.amount.toLocaleString('id-ID')}?`)) {
                                onDeleteExpense(exp.id);
                              }
                            }}
                            title="Hapus Pengeluaran"
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

      {/* 4. Modal Add / Edit Expense */}
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
                {editingExpense ? 'Edit Pengeluaran Proyek' : 'Catat Pengeluaran Proyek'}
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
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: '#334155', marginBottom: '4px' }}>
                    Kategori Biaya
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
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
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: '#334155', marginBottom: '4px' }}>
                    Tanggal
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
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
                  Deskripsi Pengeluaran / Item Pekerjaan
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Contoh: Semen Gresik 100 Sak, Upah Tukang Struktur Mg 2"
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

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: '#334155', marginBottom: '4px' }}>
                    Nominal Biaya (Rp)
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
                    Metode Bayar
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
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
                    <option value="Cash">Tunai / Kas Kecil</option>
                    <option value="Giro">Giro</option>
                    <option value="Hutang">Tempo / Hutang Dagang</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 650, color: '#334155', marginBottom: '4px' }}>
                    Vendor / Toko / Penerima
                  </label>
                  <input
                    type="text"
                    value={vendor}
                    onChange={(e) => setVendor(e.target.value)}
                    placeholder="Contoh: Toko Bangunan Berkah"
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
                    No. Nota / Referensi
                  </label>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Contoh: NOTA-0891"
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
                  Catatan Tambahan (Opsional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Keterangan spesifikasi barang, nomor surat jalan..."
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
                    backgroundColor: '#DC2626',
                    color: '#FFFFFF',
                    border: 'none',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {editingExpense ? 'Simpan Perubahan' : 'Catat Pengeluaran'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

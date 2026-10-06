import React, { useState } from 'react';
import {
  X,
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  ArrowRight,
  Sparkles,
  Layers,
  Scale,
  DollarSign,
  ShieldCheck,
  Building2,
  Calendar,
  Store,
} from 'lucide-react';
import { Project } from '../../types';
import {
  analyzeReceipt,
  ReceiptOCRResult,
  confirmAndSaveExpenseToRepository,
} from '../../services/aiReceiptIntelligence';
import { ProjectFinanceRepository } from '../../domain/finance/repository';
import { ExpenseCategory } from '../../domain/finance/types';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';

interface ReceiptReaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProject: Project | null;
  onExpenseCreated?: () => void;
}

export const ReceiptReaderModal: React.FC<ReceiptReaderModalProps> = ({
  isOpen,
  onClose,
  currentProject,
  onExpenseCreated,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [ocrResult, setOcrResult] = useState<ReceiptOCRResult | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategory>('Material');
  const [paymentMethod, setPaymentMethod] = useState<string>('Transfer');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
    if (!validTypes.includes(file.type) && !file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMsg('Format file tidak didukung. Harap upload format JPG, PNG, atau PDF.');
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setErrorMsg('Ukuran file nota melebihi batas 20MB.');
      return;
    }

    setErrorMsg(null);
    setSelectedFile(file);

    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setFilePreview(url);
    } else {
      setFilePreview(null);
    }
  };

  const handleStartOCR = async () => {
    if (!selectedFile || !currentProject) return;

    setIsAnalyzing(true);
    setErrorMsg(null);

    try {
      const res = await analyzeReceipt({
        projectId: currentProject.id,
        fileData: selectedFile,
        fileName: selectedFile.name,
      });

      if (res.success && res.result) {
        setOcrResult(res.result);
      } else {
        setErrorMsg(res.error || 'Gagal mengekstrak data nota supplier.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan sistem saat memproses nota.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleConfirmExpense = () => {
    if (!ocrResult || !currentProject) return;

    try {
      const repo = new ProjectFinanceRepository(currentProject.id);
      confirmAndSaveExpenseToRepository(
        {
          projectId: currentProject.id,
          ocrId: ocrResult.id,
          supplier: ocrResult.supplierName,
          date: ocrResult.invoiceDate,
          description: `Pembelian material (${ocrResult.lineItems.length} item) - ${ocrResult.supplierName}`,
          amount: ocrResult.grandTotal,
          category: selectedCategory,
          paymentMethod,
          referenceNumber: ocrResult.invoiceNumber,
        },
        repo
      );

      setSuccessMsg(`✓ Pengeluaran sebesar ${formatCurrencyIDR(ocrResult.grandTotal)} berhasil dicatat ke Keuangan Proyek.`);
      if (onExpenseCreated) {
        onExpenseCreated();
      }

      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan pengeluaran.');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '960px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #E2E8F0',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#F8FAFC',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                backgroundColor: '#ECFDF5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #A7F3D0',
                color: '#059669',
              }}
            >
              <Receipt size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  AI Baca Nota & Supplier Invoice
                </h2>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '6px',
                    backgroundColor: '#DCFCE7',
                    color: '#166534',
                  }}
                >
                  PHASE 9
                </span>
              </div>
              <p style={{ fontSize: '13px', color: '#64748B', margin: '2px 0 0 0' }}>
                OCR bukti belanja & pencocokan harga terhadap Master Price
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              border: '1px solid #E2E8F0',
              backgroundColor: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#64748B',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {errorMsg && (
            <div
              style={{
                backgroundColor: '#FEF2F2',
                border: '1px solid #FECACA',
                color: '#991B1B',
                padding: '12px 16px',
                borderRadius: '10px',
                marginBottom: '20px',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertTriangle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div
              style={{
                backgroundColor: '#F0FDF4',
                border: '1px solid #BBF7D0',
                color: '#166534',
                padding: '12px 16px',
                borderRadius: '10px',
                marginBottom: '20px',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <CheckCircle2 size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {!ocrResult ? (
            /* Upload Step */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div
                style={{
                  border: '2px dashed #CBD5E1',
                  borderRadius: '16px',
                  padding: '36px 20px',
                  textAlign: 'center',
                  backgroundColor: selectedFile ? '#F0FDF4' : '#F8FAFC',
                  borderColor: selectedFile ? '#86EFAC' : '#CBD5E1',
                  cursor: 'pointer',
                  position: 'relative',
                }}
              >
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/jpg, application/pdf"
                  onChange={handleFileChange}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: 0,
                    cursor: 'pointer',
                    width: '100%',
                    height: '100%',
                  }}
                />

                <div
                  style={{
                    width: '54px',
                    height: '54px',
                    borderRadius: '50%',
                    backgroundColor: selectedFile ? '#DCFCE7' : '#ECFDF5',
                    color: selectedFile ? '#166534' : '#059669',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 14px auto',
                  }}
                >
                  <UploadCloud size={28} />
                </div>

                {selectedFile ? (
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 750, color: '#166534' }}>
                      ✓ File Siap: {selectedFile.name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
                      Ukuran: {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Klik untuk ganti file
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 750, color: '#0F172A' }}>
                      Klik atau Seret Foto Nota / Invoice Supplier ke Sini
                    </div>
                    <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '4px' }}>
                      Mendukung foto nota fisik JPG/PNG atau invoice PDF toko bangunan
                    </div>
                  </div>
                )}
              </div>

              {filePreview && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', marginBottom: '8px' }}>
                    Pratinjau Nota
                  </div>
                  <img
                    src={filePreview}
                    alt="Nota Preview"
                    style={{
                      maxHeight: '220px',
                      maxWidth: '100%',
                      borderRadius: '12px',
                      border: '1px solid #E2E8F0',
                      objectFit: 'contain',
                    }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button
                  disabled={!selectedFile || isAnalyzing || !currentProject}
                  onClick={handleStartOCR}
                  style={{
                    backgroundColor: !selectedFile || isAnalyzing ? '#94A3B8' : '#059669',
                    color: '#FFFFFF',
                    padding: '12px 24px',
                    borderRadius: '10px',
                    border: 'none',
                    fontWeight: 750,
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: !selectedFile || isAnalyzing ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)',
                  }}
                >
                  {isAnalyzing ? (
                    <>
                      <Sparkles size={16} className="animate-spin" />
                      <span>Sedang Membaca Nota...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      <span>Mulai Ekstraksi OCR Nota</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* OCR Result & Master Price Match Step */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Header Info Banner */}
              <div
                style={{
                  backgroundColor: '#F8FAFC',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  border: '1px solid #E2E8F0',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    Supplier / Toko
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Store size={16} color="#059669" />
                    <span>{ocrResult.supplierName}</span>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    Tanggal & No. Nota
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                    {ocrResult.invoiceDate} • <code style={{ fontSize: '12px' }}>{ocrResult.invoiceNumber}</code>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                    Total Nilai Belanja
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#059669', marginTop: '2px' }}>
                    {formatCurrencyIDR(ocrResult.grandTotal)}
                  </div>
                </div>
              </div>

              {/* Items Table with Master Price Match */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: 750, color: '#0F172A', marginBottom: '8px' }}>
                  Rincian Barang & Pencocokan Harga Acuan (Master Price):
                </div>

                <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left', color: '#475569' }}>
                        <th style={{ padding: '10px 14px' }}>Deskripsi Barang Nota</th>
                        <th style={{ padding: '10px 14px', textAlign: 'center' }}>Qty</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Harga Nota</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Subtotal</th>
                        <th style={{ padding: '10px 14px' }}>Benchmark Master Price</th>
                        <th style={{ padding: '10px 14px', textAlign: 'center' }}>Selisih</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ocrResult.lineItems.map((item) => {
                        const match = item.matchedMasterItem;
                        const isHigher = match && match.priceDifferencePercent > 0;

                        return (
                          <tr key={item.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0F172A' }}>
                              {item.description}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center', color: '#475569' }}>
                              {item.quantity} {item.unit}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', color: '#0F172A' }}>
                              {formatCurrencyIDR(item.unitPrice)}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 750, color: '#0F172A' }}>
                              {formatCurrencyIDR(item.subtotal)}
                            </td>
                            <td style={{ padding: '10px 14px', color: '#64748B', fontSize: '12px' }}>
                              {match ? (
                                <div>
                                  <div style={{ fontWeight: 600, color: '#334155' }}>{match.masterItemName}</div>
                                  <div style={{ fontSize: '11px', color: '#64748B' }}>Acuan: {formatCurrencyIDR(match.masterPrice)}</div>
                                </div>
                              ) : (
                                <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>Belum ada acuan</span>
                              )}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              {match ? (
                                <span
                                  style={{
                                    fontSize: '11px',
                                    fontWeight: 750,
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    backgroundColor: isHigher ? '#FEF2F2' : '#F0FDF4',
                                    color: isHigher ? '#B91C1C' : '#15803D',
                                  }}
                                >
                                  {match.priceDifferencePercent > 0 ? `+${match.priceDifferencePercent}%` : `${match.priceDifferencePercent}%`}
                                </span>
                              ) : (
                                <span style={{ fontSize: '11px', color: '#94A3B8' }}>-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Expense Categorization Settings */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '16px',
                  backgroundColor: '#F8FAFC',
                  padding: '16px 20px',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                }}
              >
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    Kategori Pengeluaran (Finance)
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value as ExpenseCategory)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      backgroundColor: '#FFFFFF',
                      color: '#0F172A',
                    }}
                  >
                    <option value="Material">Material (Bahan Bangunan)</option>
                    <option value="Tenaga Kerja">Tenaga Kerja / Upah</option>
                    <option value="Alat">Sewa / Beli Alat</option>
                    <option value="Subkon">Subkontraktor</option>
                    <option value="Transport">Transport / Logistik</option>
                    <option value="Operasional">Operasional Proyek</option>
                    <option value="Pajak">Pajak</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    Metode Pembayaran
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
                      backgroundColor: '#FFFFFF',
                      color: '#0F172A',
                    }}
                  >
                    <option value="Transfer">Transfer Bank</option>
                    <option value="Cash">Tunai (Cash)</option>
                    <option value="Giro">Giro / Cek</option>
                    <option value="Other">Lainnya</option>
                  </select>
                </div>
              </div>

              {/* Action Buttons */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderTop: '1px solid #E2E8F0',
                  paddingTop: '16px',
                  marginTop: '10px',
                }}
              >
                <button
                  onClick={() => setOcrResult(null)}
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #CBD5E1',
                    color: '#475569',
                    padding: '10px 18px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  ← Upload Nota Lain
                </button>

                <button
                  onClick={handleConfirmExpense}
                  style={{
                    backgroundColor: '#059669',
                    border: 'none',
                    color: '#FFFFFF',
                    padding: '10px 22px',
                    borderRadius: '8px',
                    fontSize: '13.5px',
                    fontWeight: 750,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 4px 10px rgba(5, 150, 105, 0.25)',
                  }}
                >
                  <ShieldCheck size={16} />
                  <span>Konfirmasi & Catat Pengeluaran ({formatCurrencyIDR(ocrResult.grandTotal)})</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

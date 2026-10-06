import React from 'react';
import { X, CheckCircle2, AlertTriangle, FileText, ArrowRight } from 'lucide-react';
import type { DocxImportResult } from '../../document-engine/templateImporter';
import { AVAILABLE_CANONICAL_VARIABLES } from '../../document-engine/templateMapper';

export interface DocxImportModalProps {
  show: boolean;
  onClose: () => void;
  importResult: DocxImportResult | null;
  mappings: Record<string, string>;
  onMappingChange: (placeholder: string, canonicalVar: string) => void;
  onApply: () => void;
}

export const DocxImportModal: React.FC<DocxImportModalProps> = ({
  show,
  onClose,
  importResult,
  mappings,
  onMappingChange,
  onApply,
}) => {
  if (!show || !importResult) return null;

  const flatVariables = AVAILABLE_CANONICAL_VARIABLES.flatMap((cat) => cat.variables);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.5)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 14,
          width: 'min(640px, 100%)',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: 24,
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 750, color: '#0F172A' }}>
              Template Berhasil Dibaca
            </h3>
            <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 2 }}>
              File: <strong>{importResult.templateName}.docx</strong>
            </div>
          </div>
          <button onClick={onClose} style={{ border: 0, background: 'none', cursor: 'pointer', color: '#64748B' }}>
            <X size={20} />
          </button>
        </div>

        {/* SUMMARY BADGES */}
        <div
          style={{
            background: '#F0FDF4',
            border: '1px solid #BBF7D0',
            borderRadius: 10,
            padding: 14,
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 750, color: '#166534', marginBottom: 8 }}>
            Bagian Terdeteksi:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, fontSize: 12, color: '#15803D' }}>
            <div>✓ Header: {importResult.summary.hasHeader ? 'Terdeteksi' : 'Tidak ada'}</div>
            <div>✓ Paragraf: {importResult.summary.paragraphCount} paragraf</div>
            <div>✓ Tabel: {importResult.summary.tableCount} tabel</div>
            <div>✓ Tanda Tangan: {importResult.summary.signatureDetected ? 'Terdeteksi' : 'Tidak ada'}</div>
            <div>✓ Footer: {importResult.summary.hasFooter ? 'Terdeteksi' : 'Tidak ada'}</div>
          </div>
        </div>

        {/* WARNINGS IF ANY */}
        {importResult.warnings.length > 0 && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: 12, marginBottom: 18, fontSize: 12, color: '#92400E' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Catatan Penyesuaian:</div>
            {importResult.warnings.map((w, i) => (
              <div key={i}>• {w}</div>
            ))}
          </div>
        )}

        {/* VARIABLE MAPPING */}
        <div style={{ marginBottom: 22 }}>
          <h4 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 750, color: '#0F172A' }}>
            Pemetaan Variabel (Variable Mapping)
          </h4>
          <p style={{ margin: '0 0 14px', fontSize: 12, color: '#64748B' }}>
            Petakan placeholder teks pada dokumen Word Anda ke variabel data resmi EZRAB:
          </p>

          {importResult.detectedPlaceholders.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {importResult.detectedPlaceholders.map((placeholder) => {
                const currentMapped = mappings[placeholder] || '';
                return (
                  <div
                    key={placeholder}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      background: '#F8FAFC',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid #E2E8F0',
                    }}
                  >
                    <div style={{ flex: 1, fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#0F172A' }}>
                      {placeholder}
                    </div>
                    <ArrowRight size={14} color="#64748B" />
                    <div style={{ flex: 1.5 }}>
                      <select
                        value={currentMapped}
                        onChange={(e) => onMappingChange(placeholder, e.target.value)}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: 6,
                          border: '1px solid #CBD5E1',
                          fontSize: 12,
                          background: '#fff',
                        }}
                      >
                        <option value="">-- Lewati / Jangan Petakan --</option>
                        {AVAILABLE_CANONICAL_VARIABLES.map((cat) => (
                          <optgroup key={cat.category} label={cat.category}>
                            {cat.variables.map((v) => (
                              <option key={v.path} value={v.path}>
                                {v.label} ({v.path})
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#64748B', fontStyle: 'italic', padding: 12, background: '#F8FAFC', borderRadius: 8 }}>
              Tidak ditemukan placeholder kurung siku seperti [NAMA PEKERJAAN]. Dokumen akan diimpor sebagai teks murni dan Anda dapat menyisipkan variabel di Editor.
            </div>
          )}
        </div>

        {/* MODAL ACTIONS */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 18px',
              background: '#fff',
              border: '1px solid #CBD5E1',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Batal
          </button>
          <button
            onClick={onApply}
            style={{
              padding: '9px 20px',
              background: '#2563EB',
              color: '#fff',
              border: 0,
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(37,99,235,0.25)',
            }}
          >
            Simpan ke Template Saya & Terapkan
          </button>
        </div>
      </div>
    </div>
  );
};

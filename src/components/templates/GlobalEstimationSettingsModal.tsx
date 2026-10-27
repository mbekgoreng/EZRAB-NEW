import React, { useState } from 'react';
import { X, Settings } from 'lucide-react';
import { DetailLevel } from '../../types/rabTemplate';

export interface GlobalEstimationSettings {
  detailLevel: DetailLevel;
  priceSource: 'OFFICIAL_AHSP' | 'PROJECT_PRICE' | 'REFERENCE_PRICE';
  wastePercent: number;
  overheadPercent: number;
  profitPercent: number;
  taxPercent: number;
  /** Pajak opt-in preview template (owner 2026-10-27): bila tidak true,
   * preview template tidak menambah PPN walau taxPercent terisi. */
  taxEnabled?: boolean;
}

interface GlobalEstimationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: GlobalEstimationSettings;
  onSave: (settings: GlobalEstimationSettings) => void;
}

export const GlobalEstimationSettingsModal: React.FC<GlobalEstimationSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave
}) => {
  const [formData, setFormData] = useState<GlobalEstimationSettings>(settings);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(formData);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 1200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
    >
      <div
        style={{
          background: 'var(--ez-color-surface)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '480px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--ez-color-border-line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--ez-color-surface-secondary)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings size={18} color="var(--ez-hue-blue-text)" />
            <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: 0 }}>
              Pengaturan Estimasi Universal
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '6px',
              borderRadius: '6px',
              border: 'none',
              background: '#EDF2F7',
              color: 'var(--ez-color-text-slate)',
              cursor: 'pointer'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--ez-color-text-body)', marginBottom: '6px' }}>
              Tingkat Detail Default
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {(['STANDARD', 'PROFESSIONAL', 'COMPREHENSIVE'] as DetailLevel[]).map(lvl => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setFormData({ ...formData, detailLevel: lvl })}
                  style={{
                    padding: '8px',
                    borderRadius: '8px',
                    border: formData.detailLevel === lvl ? '2px solid #2563EB' : '1px solid var(--ez-hue-slate-border)',
                    background: formData.detailLevel === lvl ? 'var(--ez-hue-blue-bg)' : 'var(--ez-color-surface)',
                    color: formData.detailLevel === lvl ? 'var(--ez-hue-blue-text-deep)' : 'var(--ez-color-text-slate)',
                    fontSize: '11.5px',
                    fontWeight: formData.detailLevel === lvl ? 700 : 500,
                    cursor: 'pointer'
                  }}
                >
                  {lvl === 'STANDARD' ? 'Standard' : lvl === 'PROFESSIONAL' ? 'Professional' : 'Comprehensive'}
                </button>
              ))}
            </div>
          </div>

          <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--ez-color-text-muted)', lineHeight: 1.5 }}>
            Overhead, profit, waste, dan PPN di bawah diterapkan pada <strong>total konfigurator template</strong> atas
            subtotal non-resmi saja (harga resmi DHSP sudah termasuk overhead &amp; profit, sehingga dikecualikan agar
            tidak ganda). Pengaturan tersimpan persisten di perangkat ini. (Bidang "Sumber Harga Acuan" dihapus —
            tidak ada alur yang mengonsumsinya; sumber harga mengikuti resolusi tiap template.)
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 650, color: 'var(--ez-color-text-slate)', marginBottom: '4px' }}>
                Overhead Proyek (%)
              </label>
              <input
                type="number"
                value={formData.overheadPercent}
                onChange={e => setFormData({ ...formData, overheadPercent: Number(e.target.value) })}
                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '12px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 650, color: 'var(--ez-color-text-slate)', marginBottom: '4px' }}>
                Profit Kontraktor (%)
              </label>
              <input
                type="number"
                value={formData.profitPercent}
                onChange={e => setFormData({ ...formData, profitPercent: Number(e.target.value) })}
                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '12px' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 650, color: 'var(--ez-color-text-slate)', marginBottom: '4px' }}>
                Pajak PPN (%)
              </label>
              <input
                type="number"
                value={formData.taxPercent}
                onChange={e => setFormData({ ...formData, taxPercent: Number(e.target.value) })}
                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '12px' }}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', fontSize: '11.5px', color: 'var(--ez-color-text-slate)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.taxEnabled === true}
                  onChange={e => setFormData({ ...formData, taxEnabled: e.target.checked })}
                />
                Hitung PPN di preview template (default nonaktif)
              </label>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 650, color: 'var(--ez-color-text-slate)', marginBottom: '4px' }}>
                Material Waste (%)
              </label>
              <input
                type="number"
                value={formData.wastePercent}
                onChange={e => setFormData({ ...formData, wastePercent: Number(e.target.value) })}
                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '12px' }}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--ez-color-border-line)',
            background: 'var(--ez-color-surface-secondary)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px'
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '7px 14px',
              borderRadius: '6px',
              border: '1px solid var(--ez-hue-slate-border)',
              background: 'var(--ez-color-surface)',
              color: 'var(--ez-color-text-slate)',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '7px 16px',
              borderRadius: '6px',
              border: 'none',
              background: 'var(--ez-color-primary)',
              color: '#FFFFFF',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Terapkan Pengaturan
          </button>
        </div>
      </div>
    </div>
  );
};

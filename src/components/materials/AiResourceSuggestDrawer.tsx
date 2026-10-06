import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  HardHat,
  Truck,
  CheckCircle2,
  X,
  ChevronRight,
  Calculator,
  Layers,
  ArrowRight,
  Shield,
  Clock,
  AlertTriangle,
  Info,
  Check,
} from 'lucide-react';
import { resourceIntelligenceService, CompleteResourceBreakdown } from '../../services/resourceIntelligenceService';
import { LaborRateRecord } from '../../domain/labor/laborDatabaseService';
import { EquipmentRecord } from '../../domain/equipment/equipmentDatabaseService';

interface AiResourceSuggestDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  defaultWorkItem?: string;
  defaultVolume?: number;
  defaultUnit?: string;
  selectedProvince?: string;
  onApplyResources?: (breakdown: CompleteResourceBreakdown) => void;
}

export const AiResourceSuggestDrawer: React.FC<AiResourceSuggestDrawerProps> = ({
  isOpen,
  onClose,
  defaultWorkItem = 'Pekerjaan Pasangan Dinding Bata Ringan Hebel tebal 10 cm',
  defaultVolume = 100,
  defaultUnit = 'm²',
  selectedProvince = 'DKI Jakarta',
  onApplyResources,
}) => {
  const [workItemInput, setWorkItemInput] = useState(defaultWorkItem);
  const [volumeInput, setVolumeInput] = useState(defaultVolume);
  const [unitInput, setUnitInput] = useState(defaultUnit);
  const [durationDays, setDurationDays] = useState(10);
  const [hasCalculated, setHasCalculated] = useState(false);
  const [breakdown, setBreakdown] = useState<CompleteResourceBreakdown | null>(null);

  const handleRunAnalysis = () => {
    const result = resourceIntelligenceService.getCompleteResourceBreakdown({
      workItemName: workItemInput,
      volume: Number(volumeInput) || 1,
      unit: unitInput,
      targetDurationDays: Number(durationDays) || 7,
      province: selectedProvince,
    });
    setBreakdown(result);
    setHasCalculated(true);
  };

  // Preset quick examples
  const presets = [
    { name: 'Pasangan Dinding Hebel 10cm', vol: 150, unit: 'm²', days: 8 },
    { name: 'Pengecoran Balok & Plat Lantai Beton K-300', vol: 45, unit: 'm³', days: 3 },
    { name: 'Galian Tanah Biasa & Loading Dump Truck', vol: 500, unit: 'm³', days: 6 },
    { name: 'Pengaspalan Lapis Aus AC-WC tebal 4cm', vol: 1200, unit: 'm²', days: 4 },
  ];

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '580px',
          maxWidth: '100%',
          height: '100%',
          backgroundColor: '#ffffff',
          boxShadow: '-8px 0 24px rgba(15, 23, 42, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
          overflowY: 'auto',
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #E2E8F0',
            backgroundColor: '#F8FAFC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                backgroundColor: '#EFF6FF',
                border: '1px solid #DBEAFE',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2563EB',
              }}
            >
              <Sparkles size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>
                Resource Intelligence & Suggestion
              </h2>
              <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
                Bantu identifikasi tenaga kerja dan peralatan sesuai standar AHSP PUPR 2026.
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#94A3B8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
          {/* Work Item Input Card */}
          <div
            style={{
              padding: '16px',
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div>
              <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                Uraian Item Pekerjaan (DED / RAB):
              </label>
              <input
                type="text"
                value={workItemInput}
                onChange={(e) => setWorkItemInput(e.target.value)}
                placeholder="Contoh: Pasangan dinding bata ringan tebal 10 cm..."
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '12.5px',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
            </div>

            {/* Presets */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {presets.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setWorkItemInput(p.name);
                    setVolumeInput(p.vol);
                    setUnitInput(p.unit);
                    setDurationDays(p.days);
                  }}
                  style={{
                    border: '1px solid #E2E8F0',
                    backgroundColor: '#ffffff',
                    color: '#475569',
                    fontSize: '10.5px',
                    fontWeight: 600,
                    padding: '4px 8px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                  Volume:
                </label>
                <input
                  type="number"
                  value={volumeInput}
                  onChange={(e) => setVolumeInput(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                  Satuan:
                </label>
                <input
                  type="text"
                  value={unitInput}
                  onChange={(e) => setUnitInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                  Target Durasi:
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="number"
                    value={durationDays}
                    onChange={(e) => setDurationDays(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '12px',
                      boxSizing: 'border-box',
                    }}
                  />
                  <span style={{ fontSize: '11px', color: '#64748B' }}>hari</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleRunAnalysis}
              style={{
                marginTop: '6px',
                padding: '10px 16px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#2563EB',
                color: '#ffffff',
                fontSize: '12.5px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: 'pointer',
              }}
            >
              <Sparkles size={16} />
              Analisis Kebutuhan Tenaga & Peralatan
            </button>
          </div>

          {/* Breakdown Results */}
          {hasCalculated && breakdown && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Reasoning & Confidence Badge */}
              <div
                style={{
                  padding: '12px 14px',
                  backgroundColor: '#EFF6FF',
                  border: '1px solid #DBEAFE',
                  borderRadius: '10px',
                  fontSize: '12px',
                  color: '#1E40AF',
                  lineHeight: 1.4,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <strong style={{ fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    Hasil Identifikasi Resep AHSP:
                  </strong>
                  <span
                    style={{
                      fontSize: '10.5px',
                      fontWeight: 800,
                      backgroundColor: '#DBEAFE',
                      color: '#1D4ED8',
                      padding: '2px 7px',
                      borderRadius: '4px',
                    }}
                  >
                    Confidence {Math.round(breakdown.confidence * 100)}%
                  </span>
                </div>
                <div>{breakdown.reasoning}</div>
              </div>

              {/* Labor Recommendation Section */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>
                  <HardHat size={16} color="#D97706" />
                  <span>Kebutuhan Tenaga Kerja:</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {breakdown.labor.primary.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '10px 12px',
                        backgroundColor: '#FFFBEB',
                        border: '1px solid #FDE68A',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, color: '#92400E', fontSize: '12px' }}>
                          [Utama] {item.role.name}
                        </div>
                        <div style={{ fontSize: '10.5px', color: '#B45309', marginTop: '2px' }}>
                          Kebutuhan: <strong>{item.count} orang</strong> • Total {item.totalOH} OH (Koef: {item.coefficient})
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, color: '#92400E', fontSize: '12px' }}>
                          Rp {item.totalCost.toLocaleString('id-ID')}
                        </div>
                        <div style={{ fontSize: '10px', color: '#B45309' }}>Rp {item.role.basePriceOH.toLocaleString('id-ID')}/OH</div>
                      </div>
                    </div>
                  ))}

                  {breakdown.labor.supporting.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '10px 12px',
                        backgroundColor: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, color: '#334155', fontSize: '12px' }}>
                          [Pendukung] {item.role.name}
                        </div>
                        <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '2px' }}>
                          Kebutuhan: <strong>{item.count} orang</strong> • Total {item.totalOH} OH (Koef: {item.coefficient})
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '12px' }}>
                          Rp {item.totalCost.toLocaleString('id-ID')}
                        </div>
                        <div style={{ fontSize: '10px', color: '#64748B' }}>Rp {item.role.basePriceOH.toLocaleString('id-ID')}/OH</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Equipment Recommendation Section */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>
                  <Truck size={16} color="#2563EB" />
                  <span>Kebutuhan Alat Berat & Mesin:</span>
                </div>
                {breakdown.equipment.primary.length === 0 && breakdown.equipment.supporting.length === 0 ? (
                  <div style={{ padding: '10px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '11.5px', color: '#64748B' }}>
                    Pekerjaan ini tidak membutuhkan alat berat khusus (cukup peralatan tukang standar).
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {breakdown.equipment.primary.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '10px 12px',
                          backgroundColor: '#EFF6FF',
                          border: '1px solid #BFDBFE',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, color: '#1E40AF', fontSize: '12px' }}>
                            [Utama] {item.item.name}
                          </div>
                          <div style={{ fontSize: '10.5px', color: '#1D4ED8', marginTop: '2px' }}>
                            Kebutuhan: <strong>{item.count} unit</strong> • Total {item.totalHours} jam mesin (Koef: {item.coefficient})
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 800, color: '#1E40AF', fontSize: '12px' }}>
                            Rp {item.totalCost.toLocaleString('id-ID')}
                          </div>
                          <div style={{ fontSize: '10px', color: '#2563EB' }}>Rp {item.item.rentalPricePerHour.toLocaleString('id-ID')}/jam</div>
                        </div>
                      </div>
                    ))}

                    {breakdown.equipment.supporting.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '10px 12px',
                          backgroundColor: '#F8FAFC',
                          border: '1px solid #E2E8F0',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, color: '#334155', fontSize: '12px' }}>
                            [Pendukung] {item.item.name}
                          </div>
                          <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '2px' }}>
                            Kebutuhan: <strong>{item.count} unit</strong> • Total {item.totalHours} jam mesin
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '12px' }}>
                            Rp {item.totalCost.toLocaleString('id-ID')}
                          </div>
                          <div style={{ fontSize: '10px', color: '#64748B' }}>Rp {item.item.rentalPricePerHour.toLocaleString('id-ID')}/jam</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Total Summary Card */}
              <div
                style={{
                  padding: '14px',
                  backgroundColor: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  borderRadius: '10px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>
                    Total Estimasi Biaya Resource (Tenaga + Alat):
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: '#14532D', marginTop: '2px' }}>
                    Rp {breakdown.totalEstimatedResourceCost.toLocaleString('id-ID')}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (onApplyResources) onApplyResources(breakdown);
                    onClose();
                  }}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#16A34A',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Check size={14} />
                  Terapkan ke RAB
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState, useMemo } from 'react';
import {
  History,
  GitCompare,
  GitBranch,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Plus,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Sliders,
  Edit3,
  Layers,
  FileSpreadsheet,
  Download,
  Search,
  Check,
  X,
  Sparkles,
  Info,
  Calendar,
  User,
  ExternalLink,
  ChevronRight,
  FileText,
  Lock,
} from 'lucide-react';
import {
  EstimateVersion,
  VersionDiffItem,
  EstimateScenario,
  RabItem,
  Project,
} from '../../types';
import {
  VersionAndScenarioEngine,
} from '../../engine/versionAndScenarioEngine';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';

interface EstimateVersionAndScenarioModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProject: Project | null;
  currentRabItems: RabItem[];
  versions: EstimateVersion[];
  onCreateVersion: (label: string, description: string, notes?: string) => void;
  onRestoreVersion: (version: EstimateVersion) => void;
  onApplyScenarioToSpreadsheet: (scenario: EstimateScenario) => void;
}

export const EstimateVersionAndScenarioModal: React.FC<EstimateVersionAndScenarioModalProps> = ({
  isOpen,
  onClose,
  currentProject,
  currentRabItems,
  versions,
  onCreateVersion,
  onRestoreVersion,
  onApplyScenarioToSpreadsheet,
}) => {
  // Modal View: 'VERSIONS' | 'COMPARE' | 'SCENARIOS'
  const [activeTab, setActiveTab] = useState<'VERSIONS' | 'COMPARE' | 'SCENARIOS'>('VERSIONS');

  // New Revision Form State
  const [isCreatingRevision, setIsCreatingRevision] = useState(false);
  const [newRevLabel, setNewRevLabel] = useState('');
  const [newRevDesc, setNewRevDesc] = useState('');
  const [newRevNotes, setNewRevNotes] = useState('');

  // Version Comparison State
  const [baseVersionId, setBaseVersionId] = useState<string>('');
  const [targetVersionId, setTargetVersionId] = useState<string>('');
  const [diffFilter, setDiffFilter] = useState<'ALL' | 'ADDED' | 'REMOVED' | 'CHANGED'>('ALL');
  const [diffSearchQuery, setDiffSearchQuery] = useState('');

  // Scenarios State
  const scenarios = useMemo(() => {
    return VersionAndScenarioEngine.generateDefaultScenarios(
      currentProject?.id || 'DEFAULT',
      currentRabItems
    );
  }, [currentProject?.id, currentRabItems]);

  const [selectedScenarioCode, setSelectedScenarioCode] = useState<EstimateScenario['code']>('SCENARIO_A');

  if (!isOpen) return null;

  // Selected Comparison Versions
  const baseVersion = versions.find((v) => v.id === baseVersionId) || versions[versions.length - 1] || null;
  const targetVersion = versions.find((v) => v.id === targetVersionId) || versions[0] || null;

  const comparisonResult = useMemo(() => {
    if (!baseVersion || !targetVersion) return null;
    return VersionAndScenarioEngine.compareVersions(
      baseVersion.rabItemsSnapshot || [],
      targetVersion.rabItemsSnapshot || []
    );
  }, [baseVersion, targetVersion]);

  // Selected Active Scenario
  const activeScenario = scenarios.find((s) => s.code === selectedScenarioCode) || scenarios[1];
  const baselineScenario = scenarios.find((s) => s.isBaseline) || scenarios[0];

  const categoryVariances = useMemo(() => {
    return VersionAndScenarioEngine.calculateCategoryVariance(
      baselineScenario.items,
      activeScenario.items
    );
  }, [baselineScenario, activeScenario]);

  // Filtered diff items
  const filteredDiffItems = (comparisonResult?.diffItems || []).filter((item) => {
    if (diffFilter === 'ADDED' && item.status !== 'ADDED') return false;
    if (diffFilter === 'REMOVED' && item.status !== 'REMOVED') return false;
    if (diffFilter === 'CHANGED' && (item.status === 'ADDED' || item.status === 'REMOVED' || item.status === 'UNCHANGED')) return false;
    if (diffSearchQuery.trim()) {
      const q = diffSearchQuery.toLowerCase();
      return (
        item.code.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleCreateRevisionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRevDesc.trim()) return;
    const label = newRevLabel.trim() || `v${(versions.length + 1).toFixed(1)}`;
    onCreateVersion(label, newRevDesc.trim(), newRevNotes.trim());
    setIsCreatingRevision(false);
    setNewRevLabel('');
    setNewRevDesc('');
    setNewRevNotes('');
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.75)',
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
          width: '100%',
          maxWidth: '1020px',
          maxHeight: '94vh',
          background: '#FFFFFF',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid #E2E8F0',
        }}
      >
        {/* ---------------------------------------------------------------------
            1. MODAL HEADER & TAB SWITCHER
           --------------------------------------------------------------------- */}
        <div
          style={{
            padding: '16px 24px',
            background: '#0F172A',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #1E293B',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #2563EB, #7C3AED)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 14px rgba(37, 99, 235, 0.4)',
              }}
            >
              <History size={20} color="#FFFFFF" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '0.02em' }}>
                  ESTIMATE VERSION CONTROL & SCENARIOS
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: 'rgba(59, 130, 246, 0.2)',
                    color: '#60A5FA',
                    border: '1px solid rgba(59, 130, 246, 0.4)',
                  }}
                >
                  VALUE ENGINEERING
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>
                Pelacakan riwayat versi, komparasi diff perubahan, dan pengujian skenario value engineering
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* ---------------------------------------------------------------------
            PRIMARY NAVIGATION TABS
           --------------------------------------------------------------------- */}
        <div
          style={{
            padding: '8px 24px',
            background: '#F8FAFC',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setActiveTab('VERSIONS')}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                background: activeTab === 'VERSIONS' ? '#2563EB' : 'transparent',
                color: activeTab === 'VERSIONS' ? '#FFFFFF' : '#475569',
                border: 'none',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <History size={14} />
              Riwayat Versi ({versions.length})
            </button>

            <button
              onClick={() => {
                if (versions.length >= 2) {
                  setBaseVersionId(versions[versions.length - 1].id);
                  setTargetVersionId(versions[0].id);
                }
                setActiveTab('COMPARE');
              }}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                background: activeTab === 'COMPARE' ? '#2563EB' : 'transparent',
                color: activeTab === 'COMPARE' ? '#FFFFFF' : '#475569',
                border: 'none',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <GitCompare size={14} />
              Bandingkan 2 Versi (Diff)
            </button>

            <button
              onClick={() => setActiveTab('SCENARIOS')}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                background: activeTab === 'SCENARIOS' ? '#2563EB' : 'transparent',
                color: activeTab === 'SCENARIOS' ? '#FFFFFF' : '#475569',
                border: 'none',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <GitBranch size={14} />
              Skenario Estimasi ({scenarios.length})
            </button>
          </div>

          {activeTab === 'VERSIONS' && (
            <button
              onClick={() => setIsCreatingRevision(true)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                background: '#10B981',
                color: '#FFFFFF',
                border: 'none',
                fontSize: '12px',
                fontWeight: 750,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)',
              }}
            >
              <Plus size={13} />
              + Buat Revisi Baru
            </button>
          )}
        </div>

        {/* ---------------------------------------------------------------------
            2. SCROLLABLE TAB CONTENT
           --------------------------------------------------------------------- */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* ===================================================================
              TAB 1: VERSION HISTORY LIST
             =================================================================== */}
          {activeTab === 'VERSIONS' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* NEW REVISION FORM ACCORDION */}
              {isCreatingRevision && (
                <form
                  onSubmit={handleCreateRevisionSubmit}
                  style={{
                    padding: '16px',
                    borderRadius: '12px',
                    background: '#F8FAFC',
                    border: '1px solid #CBD5E1',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>
                      Snapshot Riwayat Revisi Baru
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsCreatingRevision(false)}
                      style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer' }}
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                        Nomor Versi
                      </label>
                      <input
                        type="text"
                        value={newRevLabel}
                        onChange={(e) => setNewRevLabel(e.target.value)}
                        placeholder={`v${(versions.length + 1).toFixed(1)}`}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          border: '1px solid #CBD5E1',
                          fontSize: '12px',
                          fontWeight: 700,
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                        Uraian Perubahan / Revisi *
                      </label>
                      <input
                        type="text"
                        required
                        value={newRevDesc}
                        onChange={(e) => setNewRevDesc(e.target.value)}
                        placeholder="Contoh: Revisi Mutu Beton K-300 dan Penyesuaian Harga Besi D13"
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: '1px solid #CBD5E1',
                          fontSize: '12px',
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                      Catatan Tambahan (Value Engineering & Log Perubahan)
                    </label>
                    <textarea
                      value={newRevNotes}
                      onChange={(e) => setNewRevNotes(e.target.value)}
                      placeholder="Tuliskan justifikasi teknis atau rujukan Berita Acara Rapat..."
                      rows={2}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                        fontSize: '12px',
                        resize: 'none',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setIsCreatingRevision(false)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        background: '#FFFFFF',
                        border: '1px solid #CBD5E1',
                        color: '#475569',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      style={{
                        padding: '6px 16px',
                        borderRadius: '6px',
                        background: '#2563EB',
                        color: '#FFFFFF',
                        border: 'none',
                        fontSize: '12px',
                        fontWeight: 750,
                        cursor: 'pointer',
                      }}
                    >
                      Simpan Snapshot Versi
                    </button>
                  </div>
                </form>
              )}

              {/* VERSIONS TIMELINE LIST */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {versions.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: '#94A3B8' }}>
                    Belum ada riwayat snapshot versi yang tersimpan.
                  </div>
                ) : (
                  versions.map((ver, vIdx) => {
                    const isLatest = vIdx === 0;

                    return (
                      <div
                        key={ver.id || vIdx}
                        style={{
                          padding: '14px 18px',
                          borderRadius: '12px',
                          background: isLatest ? '#EFF6FF' : '#FFFFFF',
                          border: isLatest ? '1px solid #BFDBFE' : '1px solid #E2E8F0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '16px',
                          transition: 'all 0.15s',
                        }}
                      >
                        {/* Left: Version Meta */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flex: 1 }}>
                          <div
                            style={{
                              padding: '4px 10px',
                              borderRadius: '6px',
                              background: ver.isBaseline ? '#0F172A' : '#2563EB',
                              color: '#FFFFFF',
                              fontSize: '12px',
                              fontWeight: 800,
                              fontFamily: 'monospace',
                              flexShrink: 0,
                            }}
                          >
                            {ver.versionNumber || `v1.${versions.length - vIdx}`}
                          </div>

                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A' }}>
                                {ver.description || ver.label || 'Snapshot Estimasi'}
                              </span>
                              {isLatest && (
                                <span
                                  style={{
                                    fontSize: '10px',
                                    fontWeight: 800,
                                    background: '#DBEAFE',
                                    color: '#1E40AF',
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                  }}
                                >
                                  CURRENT ACTIVE
                                </span>
                              )}
                              {ver.isBaseline && (
                                <span
                                  style={{
                                    fontSize: '10px',
                                    fontWeight: 800,
                                    background: '#F1F5F9',
                                    color: '#475569',
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                  }}
                                >
                                  <Lock size={10} /> BASELINE
                                </span>
                              )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', color: '#64748B', marginTop: '3px' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Calendar size={12} color="#94A3B8" />
                                {new Date(ver.timestamp).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                              </span>
                              <span>•</span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <User size={12} color="#94A3B8" />
                                {ver.author || 'Lead Estimator'}
                              </span>
                              <span>•</span>
                              <span>{ver.itemsCount || ver.rabItemsSnapshot?.length || 0} Item Pekerjaan</span>
                            </div>

                            {ver.revisionNotes && (
                              <div style={{ fontSize: '11.5px', color: '#475569', marginTop: '6px', fontStyle: 'italic', background: 'rgba(255,255,255,0.7)', padding: '4px 8px', borderRadius: '4px' }}>
                                "{ver.revisionNotes}"
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Right: Cost & Restore Action */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '10px', color: '#64748B', textTransform: 'uppercase' }}>Nilai Total RAB</div>
                            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                              {formatCurrencyIDR(ver.costAfter || 0)}
                            </div>
                            {ver.difference !== 0 && (
                              <div
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  color: ver.difference > 0 ? '#DC2626' : '#059669',
                                }}
                              >
                                {ver.difference > 0 ? '+' : ''}
                                {formatCurrencyIDR(ver.difference)} ({ver.percentageDiff > 0 ? '+' : ''}
                                {ver.percentageDiff.toFixed(2)}%)
                              </div>
                            )}
                          </div>

                          {!isLatest && (
                            <button
                              onClick={() => {
                                if (window.confirm(`Pulihkan estimasi ke versi "${ver.description}"? State saat ini akan otomatis dicadangkan.`)) {
                                  onRestoreVersion(ver);
                                  onClose();
                                }
                              }}
                              style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                background: '#FFFFFF',
                                border: '1px solid #CBD5E1',
                                color: '#2563EB',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                              }}
                            >
                              <RotateCcw size={13} />
                              Pulihkan
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ===================================================================
              TAB 2: VERSION COMPARISON (DIFF)
             =================================================================== */}
          {activeTab === 'COMPARE' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Selectors Bar */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto 1fr',
                  alignItems: 'center',
                  gap: '12px',
                  background: '#F8FAFC',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                }}
              >
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '4px' }}>
                    Versi Dasar (Base / Before):
                  </label>
                  <select
                    value={baseVersionId}
                    onChange={(e) => setBaseVersionId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '12px',
                      fontWeight: 700,
                      background: '#FFFFFF',
                    }}
                  >
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.versionNumber} — {v.description} ({formatCurrencyIDR(v.costAfter || 0)})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ paddingTop: '16px' }}>
                  <ArrowRight size={18} color="#94A3B8" />
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', display: 'block', marginBottom: '4px' }}>
                    Versi Target Pembanding (Target / After):
                  </label>
                  <select
                    value={targetVersionId}
                    onChange={(e) => setTargetVersionId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '12px',
                      fontWeight: 700,
                      background: '#FFFFFF',
                    }}
                  >
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.versionNumber} — {v.description} ({formatCurrencyIDR(v.costAfter || 0)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Comparison Summary Metrics */}
              {comparisonResult && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1.2fr',
                    gap: '12px',
                  }}
                >
                  <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: '10.5px', color: '#64748B', fontWeight: 700 }}>NILAI VERSI DASAR</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                      {formatCurrencyIDR(comparisonResult.baseTotal)}
                    </div>
                  </div>

                  <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
                    <div style={{ fontSize: '10.5px', color: '#1E40AF', fontWeight: 700 }}>NILAI VERSI TARGET</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#2563EB', marginTop: '2px' }}>
                      {formatCurrencyIDR(comparisonResult.targetTotal)}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: comparisonResult.totalDelta >= 0 ? '#FEF2F2' : '#ECFDF5',
                      border: `1px solid ${comparisonResult.totalDelta >= 0 ? '#FECACA' : '#A7F3D0'}`,
                    }}
                  >
                    <div style={{ fontSize: '10.5px', color: comparisonResult.totalDelta >= 0 ? '#DC2626' : '#059669', fontWeight: 700 }}>
                      SELISIH PERUBAHAN
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: 850, color: comparisonResult.totalDelta >= 0 ? '#DC2626' : '#059669', marginTop: '2px' }}>
                      {comparisonResult.totalDelta >= 0 ? '+' : ''}
                      {formatCurrencyIDR(comparisonResult.totalDelta)} ({comparisonResult.percentageDelta >= 0 ? '+' : ''}
                      {comparisonResult.percentageDelta.toFixed(2)}%)
                    </div>
                  </div>
                </div>
              )}

              {/* Diff Filters & Search */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: '#F8FAFC',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    onClick={() => setDiffFilter('ALL')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      background: diffFilter === 'ALL' ? '#2563EB' : '#FFFFFF',
                      color: diffFilter === 'ALL' ? '#FFFFFF' : '#475569',
                      border: diffFilter === 'ALL' ? 'none' : '1px solid #CBD5E1',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Semua ({comparisonResult?.diffItems.length || 0})
                  </button>
                  <button
                    onClick={() => setDiffFilter('ADDED')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      background: diffFilter === 'ADDED' ? '#059669' : '#FFFFFF',
                      color: diffFilter === 'ADDED' ? '#FFFFFF' : '#059669',
                      border: diffFilter === 'ADDED' ? 'none' : '1px solid #A7F3D0',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    + Ditambahkan ({comparisonResult?.addedCount || 0})
                  </button>
                  <button
                    onClick={() => setDiffFilter('REMOVED')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      background: diffFilter === 'REMOVED' ? '#DC2626' : '#FFFFFF',
                      color: diffFilter === 'REMOVED' ? '#FFFFFF' : '#DC2626',
                      border: diffFilter === 'REMOVED' ? 'none' : '1px solid #FECACA',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    - Dihapus ({comparisonResult?.removedCount || 0})
                  </button>
                  <button
                    onClick={() => setDiffFilter('CHANGED')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      background: diffFilter === 'CHANGED' ? '#D97706' : '#FFFFFF',
                      color: diffFilter === 'CHANGED' ? '#FFFFFF' : '#D97706',
                      border: diffFilter === 'CHANGED' ? 'none' : '1px solid #FDE68A',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Modifikasi Harga/Vol ({(comparisonResult?.priceChangedCount || 0) + (comparisonResult?.qtyChangedCount || 0)})
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#FFFFFF', padding: '3px 8px', borderRadius: '6px', border: '1px solid #CBD5E1' }}>
                  <Search size={13} color="#94A3B8" />
                  <input
                    type="text"
                    value={diffSearchQuery}
                    onChange={(e) => setDiffSearchQuery(e.target.value)}
                    placeholder="Cari item diff..."
                    style={{ border: 'none', outline: 'none', fontSize: '11.5px', width: '130px' }}
                  />
                </div>
              </div>

              {/* Granular Diff Table */}
              <div
                style={{
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  background: '#FFFFFF',
                  maxHeight: '260px',
                  overflowY: 'auto',
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', textAlign: 'left' }}>
                  <thead style={{ background: '#F1F5F9', color: '#475569', position: 'sticky', top: 0, zIndex: 5 }}>
                    <tr>
                      <th style={{ padding: '8px 10px' }}>Status</th>
                      <th style={{ padding: '8px 10px' }}>Kode</th>
                      <th style={{ padding: '8px 10px' }}>Uraian Pekerjaan</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Nilai Base</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Nilai Target</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Selisih (Rp)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDiffItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#94A3B8' }}>
                          Tidak ada perbedaan pada filter yang dipilih.
                        </td>
                      </tr>
                    ) : (
                      filteredDiffItems.map((dItem, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '6px 10px' }}>
                            <span
                              style={{
                                fontSize: '9.5px',
                                fontWeight: 800,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background:
                                  dItem.status === 'ADDED'
                                    ? '#ECFDF5'
                                    : dItem.status === 'REMOVED'
                                    ? '#FEF2F2'
                                    : dItem.status === 'UNCHANGED'
                                    ? '#F1F5F9'
                                    : '#FFFBEB',
                                color:
                                  dItem.status === 'ADDED'
                                    ? '#059669'
                                    : dItem.status === 'REMOVED'
                                    ? '#DC2626'
                                    : dItem.status === 'UNCHANGED'
                                    ? '#64748B'
                                    : '#D97706',
                              }}
                            >
                              {dItem.status}
                            </span>
                          </td>
                          <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#2563EB', fontWeight: 650 }}>
                            {dItem.code}
                          </td>
                          <td style={{ padding: '6px 10px', fontWeight: 600, color: '#0F172A', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {dItem.description}
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', color: '#64748B' }}>
                            {dItem.baseAmount !== undefined ? formatCurrencyIDR(dItem.baseAmount) : '-'}
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>
                            {dItem.targetAmount !== undefined ? formatCurrencyIDR(dItem.targetAmount) : '-'}
                          </td>
                          <td
                            style={{
                              padding: '6px 10px',
                              textAlign: 'right',
                              fontWeight: 750,
                              color: dItem.deltaAmount >= 0 ? '#DC2626' : '#059669',
                            }}
                          >
                            {dItem.deltaAmount >= 0 ? '+' : ''}
                            {formatCurrencyIDR(dItem.deltaAmount)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===================================================================
              TAB 3: VALUE ENGINEERING SCENARIOS
             =================================================================== */}
          {activeTab === 'SCENARIOS' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* SCENARIO SELECTOR CARDS */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '10px',
                }}
              >
                {scenarios.map((scen) => {
                  const isSelected = scen.code === selectedScenarioCode;

                  return (
                    <div
                      key={scen.code}
                      onClick={() => setSelectedScenarioCode(scen.code)}
                      style={{
                        padding: '12px',
                        borderRadius: '10px',
                        background: isSelected ? '#EFF6FF' : '#FFFFFF',
                        border: isSelected ? '2px solid #2563EB' : '1px solid #CBD5E1',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        boxShadow: isSelected ? '0 4px 12px rgba(37, 99, 235, 0.15)' : 'none',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 800,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: scen.isBaseline ? '#0F172A' : isSelected ? '#2563EB' : '#E2E8F0',
                            color: isSelected || scen.isBaseline ? '#FFFFFF' : '#475569',
                          }}
                        >
                          {scen.code}
                        </span>
                        {scen.isBaseline && <Lock size={11} color="#64748B" />}
                      </div>

                      <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', lineHeight: 1.3 }}>
                        {scen.name}
                      </div>

                      <div style={{ marginTop: 'auto', paddingTop: '4px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 850, color: '#0F172A' }}>
                          {formatCurrencyIDR(scen.totalRab)}
                        </div>
                        {!scen.isBaseline && (
                          <div
                            style={{
                              fontSize: '11px',
                              fontWeight: 750,
                              color: scen.differenceFromBaseline <= 0 ? '#059669' : '#DC2626',
                            }}
                          >
                            {scen.percentageFromBaseline <= 0 ? '' : '+'}
                            {scen.percentageFromBaseline.toFixed(1)}% vs Baseline
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ACTIVE SCENARIO DETAIL & VALUE ENGINEERING BREAKDOWN */}
              <div
                style={{
                  background: '#F8FAFC',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
                      {activeScenario.name}
                    </span>
                    <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
                      {activeScenario.description}
                    </div>
                  </div>

                  {!activeScenario.isBaseline && (
                    <button
                      onClick={() => {
                        if (window.confirm(`Terapkan skenario "${activeScenario.name}" ke spreadsheet utama? Baseline awal tetap aman tersimpan.`)) {
                          onApplyScenarioToSpreadsheet(activeScenario);
                          onClose();
                        }
                      }}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        background: '#10B981',
                        color: '#FFFFFF',
                        border: 'none',
                        fontSize: '12.5px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)',
                      }}
                    >
                      <Check size={14} />
                      Terapkan Skenario Ini ke RAB
                    </button>
                  )}
                </div>

                {/* CATEGORY VALUE ENGINEERING VARIANCE TABLE */}
                <div
                  style={{
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    background: '#FFFFFF',
                    maxHeight: '180px',
                    overflowY: 'auto',
                  }}
                >
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', textAlign: 'left' }}>
                    <thead style={{ background: '#F1F5F9', color: '#475569', position: 'sticky', top: 0 }}>
                      <tr>
                        <th style={{ padding: '8px 10px' }}>Kelompok Pekerjaan (WBS)</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Baseline (Rp)</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Skenario (Rp)</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Penghematan / Selisih</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryVariances.map((cVar, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '6px 10px', fontWeight: 650, color: '#1E293B' }}>
                            {cVar.category}
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', color: '#64748B' }}>
                            {formatCurrencyIDR(cVar.baselineAmount)}
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>
                            {formatCurrencyIDR(cVar.scenarioAmount)}
                          </td>
                          <td
                            style={{
                              padding: '6px 10px',
                              textAlign: 'right',
                              fontWeight: 750,
                              color: cVar.deltaAmount <= 0 ? '#059669' : '#DC2626',
                            }}
                          >
                            {cVar.deltaAmount <= 0 ? '' : '+'}
                            {formatCurrencyIDR(cVar.deltaAmount)} ({cVar.deltaPercent <= 0 ? '' : '+'}
                            {cVar.deltaPercent.toFixed(1)}%)
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ---------------------------------------------------------------------
            3. MODAL FOOTER
           --------------------------------------------------------------------- */}
        <div
          style={{
            padding: '12px 24px',
            background: '#F8FAFC',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: '11px', color: '#64748B' }}>
            🔒 Baseline asli tidak pernah ditimpa saat menguji skenario Value Engineering
          </div>

          <button
            onClick={onClose}
            style={{
              padding: '6px 16px',
              borderRadius: '6px',
              background: '#FFFFFF',
              border: '1px solid #CBD5E1',
              color: '#475569',
              fontSize: '12px',
              fontWeight: 650,
              cursor: 'pointer',
            }}
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

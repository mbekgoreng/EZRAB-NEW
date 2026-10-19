import React, { useState, useMemo, useCallback } from 'react';
import { parseHousePrompt, validateSpec, type HouseSpec, type RoomSpec } from './specEngine';
import { FloorPlan2D } from './FloorPlan2D';
import { HouseViewer3D } from './HouseViewer3D';
import { DesignSpreadsheet, specToSpreadsheetRows } from './DesignSpreadsheet';
import { spreadsheetToWorkItems, validateWorkItemsForRab, buildApprovalSummary } from './designToRabBridge';
import { useProject } from '../context/ProjectContext';
import { navigateTo, routeForMenu } from '../routing/routes';
import { saveDesign, listDesigns, getDesign, type SavedDesign } from './designStorage';
import { AhspCandidatePicker, findAhspCandidates } from './AhspCandidatePicker';
import type { NationalAHSPItem } from '../data/nationalCostDatabase/types';

type ViewTab = 'spec' | 'plan2d' | 'view3d' | 'spreadsheet' | 'review';

interface AiDesignStudioProps {
  initialPrompt?: string;
  onApprove?: (spec: HouseSpec, workItems: ReturnType<typeof spreadsheetToWorkItems>) => void;
}

const DEFAULT_PROMPT = 'Buatkan rumah 1 lantai luas bangunan 90 m², ukuran 6 × 15 m, 3 kamar tidur, 2 kamar mandi, ruang tamu, dapur, dan carport.';

/**
 * AI Design Studio — prompt → spec → denah 2D → 3D → spreadsheet → review → QTO/RAB.
 *
 * Alur: pengguna mengetik prompt → spec tervalidasi → eksplorasi visual →
 *       setujui → data diteruskan ke QTO/RAB (via onApprove).
 */
export const AiDesignStudio: React.FC<AiDesignStudioProps> = ({ initialPrompt, onApprove }) => {
  const [prompt, setPrompt] = useState(initialPrompt || DEFAULT_PROMPT);
  const [spec, setSpec] = useState<HouseSpec | null>(() => parseHousePrompt(initialPrompt || DEFAULT_PROMPT).spec);
  const [clarifications, setClarifications] = useState<string[]>(() => parseHousePrompt(initialPrompt || DEFAULT_PROMPT).needsClarification);
  const [activeTab, setActiveTab] = useState<ViewTab>('spec');
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  // P0: ProjectContext integration
  const { currentProject, bulkAddRabItems, projectRabItems } = useProject();
  const [sentToRab, setSentToRab] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  // P1: Persistensi
  const [savedDesigns, setSavedDesigns] = useState<SavedDesign[]>([]);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [showSavedList, setShowSavedList] = useState(false);
  // P1: Manual AHSP mapping (user memilih kandidat secara eksplisit)
  const [ahspMappings, setAhspMappings] = useState<Record<string, string>>({});
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  const handleGenerate = useCallback(() => {
    const result = parseHousePrompt(prompt);
    setSpec(result.spec);
    setClarifications(result.needsClarification);
    setSelectedRoomId(null);
    setApproved(false);
    if (result.spec) setActiveTab('spec');
  }, [prompt]);

  const handleRoomUpdate = useCallback((roomId: string, updates: Partial<RoomSpec>) => {
    setSpec(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        rooms: prev.rooms.map(r => r.id === roomId ? { ...r, ...updates, areaM2: (updates.widthM ?? r.widthM) * (updates.lengthM ?? r.lengthM) } : r),
      };
    });
  }, []);

  const validation = useMemo(() => spec ? validateSpec(spec) : null, [spec]);
  const workItems = useMemo(() => spec ? spreadsheetToWorkItems(specToSpreadsheetRows(spec)) : [], [spec]);
  const approval = useMemo(() => spec ? buildApprovalSummary(spec, workItems) : null, [spec, workItems]);

  const handleApprove = useCallback(() => {
    if (!spec || !validation?.valid) return;
    const { valid, rejected } = validateWorkItemsForRab(workItems);
    if (rejected.length > 0) {
      alert(`${rejected.length} item ditolak:\n${rejected.map(r => `- ${r.item.description}: ${r.reason}`).join('\n')}`);
      return;
    }
    setApproved(true);
    onApprove?.(spec, valid);
  }, [spec, validation, workItems, onApprove]);

  // P0: Kirim ke RAB via ProjectContext (dengan konfirmasi & cegah duplikat)
  const handleSendToRab = useCallback(() => {
    setSendError(null);
    if (!currentProject) {
      setSendError('Tidak ada proyek aktif. Buat atau buka proyek dulu di menu Proyek.');
      return;
    }
    const { valid, rejected } = validateWorkItemsForRab(workItems);
    if (valid.length === 0) {
      setSendError('Tidak ada item valid untuk dikirim.');
      return;
    }
    // Cegah duplikat: cek kode yang sudah ada di RAB proyek
    const existingCodes = new Set((projectRabItems || []).map(i => i.code));
    const newItems = valid.filter(item => !existingCodes.has(item.code));
    const dupCount = valid.length - newItems.length;
    if (newItems.length === 0) {
      setSendError(`Semua ${valid.length} item sudah ada di RAB (duplikat dicegah).`);
      return;
    }
    try {
      const added = bulkAddRabItems(newItems.map(item => ({
        // Provenance di deskripsi (factory tidak meneruskan `notes`, tapi volumeSource ya)
        description: `[AI Design] ${item.description}`,
        volume: item.volume,
        unit: item.unit,
        code: item.code,
        category: item.category,
        priceStatus: 'PRICE_UNRESOLVED' as const,
        volumeSource: 'AI_GENERATED' as const,
        // P1: AHSP mapping manual (jika user memilih kandidat)
        ...(ahspMappings[item.code] ? { ahspCode: ahspMappings[item.code] } : {}),
      })));
      setSentToRab(true);
      if (dupCount > 0) {
        setSendError(null); // bukan error, info
      }
      // Simpan info untuk ditampilkan
      (handleSendToRab as { _added?: number; _dup?: number })._added = added.length;
      (handleSendToRab as { _added?: number; _dup?: number })._dup = dupCount;
    } catch (e) {
      setSendError('Gagal mengirim ke RAB: ' + (e as Error).message);
    }
  }, [currentProject, workItems, projectRabItems, bulkAddRabItems, ahspMappings]);

  const handleGoToRab = useCallback(() => {
    navigateTo(routeForMenu('rab-estimasi', currentProject?.id || null));
  }, [currentProject]);

  // P1: Simpan desain ke localStorage
  const handleSaveDesign = useCallback(() => {
    if (!spec) return;
    const pid = currentProject?.id || 'no-project';
    const name = `Desain ${spec.buildingWidthM}×${spec.buildingLengthM}m ${spec.buildingAreaM2}m²`;
    const saved = saveDesign(pid, name, spec);
    setSavedDesigns(listDesigns(pid));
    setSaveMessage(`✅ Tersimpan: ${saved.name} (${new Date(saved.savedAt).toLocaleString('id-ID')})`);
    setTimeout(() => setSaveMessage(null), 4000);
  }, [spec, currentProject]);

  const handleLoadSavedDesigns = useCallback(() => {
    const pid = currentProject?.id || 'no-project';
    setSavedDesigns(listDesigns(pid));
    setShowSavedList(v => !v);
  }, [currentProject]);

  const handleLoadDesign = useCallback((designId: string) => {
    const pid = currentProject?.id || 'no-project';
    const d = getDesign(pid, designId);
    if (d) {
      setSpec(d.spec);
      setApproved(false);
      setSentToRab(false);
      setShowSavedList(false);
      setActiveTab('spec');
      setSaveMessage(`✅ Dimuat: ${d.name}`);
      setTimeout(() => setSaveMessage(null), 4000);
    }
  }, [currentProject]);

  // P1: User memilih kandidat AHSP secara manual
  const handleAhspSelect = useCallback((workItemCode: string, ahsp: NationalAHSPItem) => {
    setAhspMappings(prev => ({ ...prev, [workItemCode]: ahsp.code }));
    setPickerFor(null);
  }, []);

  // Keywords untuk pencarian kandidat berdasarkan deskripsi item
  const getKeywordsForItem = useCallback((description: string): string[] => {
    const lower = description.toLowerCase();
    if (lower.includes('keramik')) return ['keramik', 'lantai'];
    if (lower.includes('dinding') && lower.includes('bata')) return ['bata', 'merah'];
    if (lower.includes('pelat') || lower.includes('lantai dasar')) return ['beton'];
    // Default: ambil 2 kata pertama yang bermakna
    return lower.split(' ').filter(w => w.length > 3).slice(0, 2);
  }, []);

  const tabs: Array<{ id: ViewTab; label: string }> = [
    { id: 'spec', label: '📋 Spesifikasi' },
    { id: 'plan2d', label: '📐 Denah 2D' },
    { id: 'view3d', label: '🏠 3D' },
    { id: 'spreadsheet', label: '📊 Spreadsheet' },
    { id: 'review', label: '✅ Review & Setujui' },
  ];

  return (
    <div className="ai-design-studio" style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
      {/* Prompt input */}
      <div style={{ background: '#1E3A5F', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <label style={{ color: '#FFF', fontWeight: 600, fontSize: 14, display: 'block', marginBottom: 8 }}>
          🤖 Deskripsikan rumah impian Anda
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Contoh: rumah 1 lantai 90 m², 6×15 m, 3 kamar tidur..."
            style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: 'none', fontSize: 14 }}
          />
          <button onClick={handleGenerate}
            style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#0EA5E9', color: '#FFF', fontWeight: 700, cursor: 'pointer' }}>
            Generate
          </button>
        </div>
        {clarifications.length > 0 && (
          <div style={{ marginTop: 8, color: '#FCD34D', fontSize: 13 }}>
            ℹ Perlu dilengkapi: {clarifications.join('; ')}
          </div>
        )}
        {/* P1: Simpan/Muat desain */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={handleSaveDesign} disabled={!spec}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.15)', color: '#FFF', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            💾 Simpan Desain
          </button>
          <button onClick={handleLoadSavedDesigns}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.15)', color: '#FFF', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            📂 Desain Tersimpan ({savedDesigns.length})
          </button>
          {saveMessage && <span style={{ fontSize: 13, color: '#A7F3D0' }}>{saveMessage}</span>}
        </div>
        {showSavedList && (
          <div style={{ marginTop: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: 12 }}>
            {savedDesigns.length === 0 ? (
              <div style={{ fontSize: 13, color: '#CBD5E1' }}>Belum ada desain tersimpan untuk proyek ini.</div>
            ) : (
              savedDesigns.map(d => (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <span style={{ fontSize: 13, color: '#FFF' }}>{d.name} <span style={{ color: '#94A3B8' }}>({new Date(d.savedAt).toLocaleString('id-ID')})</span></span>
                  <button onClick={() => handleLoadDesign(d.id)}
                    style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: '#0EA5E9', color: '#FFF', fontSize: 12, cursor: 'pointer' }}>
                    Muat
                  </button>
                </div>
              ))
            )}
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 8 }}>⚠ Penyimpanan lokal perangkat. Backend server: BLOCKED (menunggu VPS).</div>
          </div>
        )}
      </div>

      {!spec ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#64748B' }}>
          Prompt belum cukup untuk membuat desain. Lengkapi informasi yang diminta di atas.
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                style={{
                  padding: '8px 16px', borderRadius: 8,
                  border: '1px solid #E2E8F0',
                  background: activeTab === t.id ? '#1E3A5F' : '#FFF',
                  color: activeTab === t.id ? '#FFF' : '#1E3A5F',
                  fontWeight: 600, fontSize: 13, cursor: 'pointer',
                }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Spec tab */}
          {activeTab === 'spec' && (
            <div style={{ background: '#FFF', borderRadius: 12, padding: 20, border: '1px solid #E2E8F0' }}>
              <h3 style={{ margin: '0 0 12px', color: '#1E3A5F' }}>
                {spec.buildingType} — {spec.buildingWidthM} × {spec.buildingLengthM} m ({spec.buildingAreaM2.toFixed(1)} m²)
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
                <div><strong>Lantai:</strong> {spec.floors}</div>
                <div><strong>Total ruang:</strong> {spec.rooms.length}</div>
                <div><strong>Luas ruang:</strong> {spec.totalRoomAreaM2.toFixed(1)} m²</div>
                <div><strong>Sirkulasi:</strong> {spec.circulationM2.toFixed(1)} m²</div>
                <div><strong>Kelengkapan:</strong> {spec.completeness}%</div>
                <div><strong>Status:</strong> {validation?.valid ? '✅ Valid' : '⚠ Perlu perhatian'}</div>
              </div>
              {spec.assumptions.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <strong>Asumsi ({spec.assumptions.length}):</strong>
                  <ul style={{ margin: '4px 0', paddingLeft: 20, fontSize: 13, color: '#92400E' }}>
                    {spec.assumptions.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                </div>
              )}
              {validation && !validation.valid && (
                <div style={{ background: '#FEF2F2', borderRadius: 8, padding: 12 }}>
                  <strong style={{ color: '#DC2626' }}>Masalah validasi:</strong>
                  <ul style={{ margin: '4px 0', paddingLeft: 20, fontSize: 13, color: '#DC2626' }}>
                    {validation.issues.map((issue, i) => <li key={i}>{issue}</li>)}
                  </ul>
                </div>
              )}
              {validation && validation.warnings && validation.warnings.length > 0 && (
                <div style={{ background: '#FFFBEB', borderRadius: 8, padding: 12, marginTop: 8 }}>
                  <strong style={{ color: '#D97706' }}>⚠ Perhatian layout:</strong>
                  <ul style={{ margin: '4px 0', paddingLeft: 20, fontSize: 13, color: '#92400E' }}>
                    {validation.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
              <div style={{ marginTop: 12 }}>
                <strong>Daftar ruang:</strong>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  {spec.rooms.map(r => (
                    <span key={r.id} style={{ background: '#F1F5F9', borderRadius: 6, padding: '4px 10px', fontSize: 12 }}>
                      {r.name} ({r.areaM2.toFixed(1)} m²){r.isAssumed ? ' ⚠' : ''}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 2D tab */}
          {activeTab === 'plan2d' && (
            <FloorPlan2D spec={spec} onRoomUpdate={handleRoomUpdate} onRoomSelect={setSelectedRoomId} selectedRoomId={selectedRoomId} />
          )}

          {/* 3D tab */}
          {activeTab === 'view3d' && (
            <HouseViewer3D spec={spec} selectedRoomId={selectedRoomId} onRoomSelect={setSelectedRoomId} />
          )}

          {/* Spreadsheet tab */}
          {activeTab === 'spreadsheet' && (
            <DesignSpreadsheet spec={spec} />
          )}

          {/* Review tab */}
          {activeTab === 'review' && approval && (
            <div style={{ background: '#FFF', borderRadius: 12, padding: 20, border: '1px solid #E2E8F0' }}>
              <h3 style={{ margin: '0 0 12px', color: '#1E3A5F' }}>Review Sebelum Dikirim ke QTO/RAB</h3>
              <ul style={{ paddingLeft: 20 }}>
                {approval.lines.map((line, i) => <li key={i} style={{ marginBottom: 6 }}>{line}</li>)}
              </ul>
              <div style={{ background: '#FFFBEB', borderRadius: 8, padding: 12, marginTop: 12, fontSize: 13 }}>
                ⚠ <strong>Penting:</strong> Semua {approval.unresolvedPriceCount} item belum memiliki harga (null).
                Harga akan ditentukan via AHSP/resolver/manual <em>setelah</em> Anda menyetujui desain.
                Tidak ada harga yang dikarang.
              </div>

              {/* P1: Manual AHSP mapping */}
              <div style={{ marginTop: 16, borderTop: '1px solid #E2E8F0', paddingTop: 12 }}>
                <strong style={{ fontSize: 14, color: '#1E3A5F' }}>Pemetaan AHSP (opsional)</strong>
                <div style={{ fontSize: 12, color: '#64748B', margin: '4px 0 8px' }}>
                  Pilih kandidat AHSP secara manual untuk setiap item. Tidak ada auto-mapping.
                </div>
                {workItems.map(item => (
                  <div key={item.code} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #F1F5F9', fontSize: 13 }}>
                    <span style={{ flex: 1 }}>
                      {item.description} ({item.volume} {item.unit})
                      {ahspMappings[item.code] && (
                        <span style={{ marginLeft: 8, color: '#059669', fontWeight: 600 }}>
                          → {ahspMappings[item.code]}
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => setPickerFor(item.code)}
                      style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #0EA5E9', background: '#EFF6FF', color: '#1E3A5F', fontSize: 12, cursor: 'pointer' }}
                    >
                      {ahspMappings[item.code] ? 'Ubah' : 'Pilih AHSP'}
                    </button>
                  </div>
                ))}
              </div>

              {pickerFor && (
                <div style={{ marginTop: 12 }}>
                  <AhspCandidatePicker
                    keywords={getKeywordsForItem(workItems.find(w => w.code === pickerFor)?.description || '')}
                    requiredUnit={workItems.find(w => w.code === pickerFor)?.unit || ''}
                    onSelect={(ahsp) => handleAhspSelect(pickerFor, ahsp)}
                    onCancel={() => setPickerFor(null)}
                  />
                </div>
              )}
              <button onClick={handleApprove} disabled={!validation?.valid || approved}
                style={{
                  marginTop: 16, padding: '12px 24px', borderRadius: 8, border: 'none',
                  background: approved ? '#10B981' : validation?.valid ? '#1E3A5F' : '#CBD5E1',
                  color: '#FFF', fontWeight: 700, cursor: approved || !validation?.valid ? 'default' : 'pointer',
                }}>
                {approved ? '✅ Desain Disetujui' : 'Setujui Desain'}
              </button>

              {/* P0: Kirim ke RAB */}
              {approved && !sentToRab && (
                <div style={{ marginTop: 16, borderTop: '1px solid #E2E8F0', paddingTop: 16 }}>
                  {!showConfirm ? (
                    <button onClick={() => setShowConfirm(true)}
                      style={{ padding: '12px 24px', borderRadius: 8, border: 'none', background: '#0EA5E9', color: '#FFF', fontWeight: 700, cursor: 'pointer' }}>
                      📤 Kirim {workItems.length} Item ke RAB
                    </button>
                  ) : (
                    <div style={{ background: '#EFF6FF', borderRadius: 8, padding: 16 }}>
                      <strong>Kirim ke proyek "{currentProject?.name || '(belum ada proyek aktif)'}"?</strong>
                      <ul style={{ fontSize: 13, margin: '8px 0', paddingLeft: 20 }}>
                        {workItems.map(item => (
                          <li key={item.code}>{item.description} — {item.volume} {item.unit} (harga: belum ada)</li>
                        ))}
                      </ul>
                      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <button onClick={handleSendToRab}
                          style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#1E3A5F', color: '#FFF', fontWeight: 700, cursor: 'pointer' }}>
                          Ya, Kirim ke RAB
                        </button>
                        <button onClick={() => setShowConfirm(false)}
                          style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#FFF', cursor: 'pointer' }}>
                          Batal
                        </button>
                      </div>
                    </div>
                  )}
                  {sendError && (
                    <div style={{ marginTop: 8, color: '#DC2626', fontSize: 13 }}>❌ {sendError}</div>
                  )}
                </div>
              )}

              {sentToRab && (
                <div style={{ marginTop: 16, background: '#ECFDF5', borderRadius: 8, padding: 16 }}>
                  <div style={{ color: '#059669', fontWeight: 700 }}>✅ Item berhasil dikirim ke RAB proyek "{currentProject?.name}"</div>
                  <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
                    Item masuk dengan status harga UNRESOLVED (null). Tentukan harga via AHSP atau input manual di menu RAB.
                  </div>
                  <button onClick={handleGoToRab}
                    style={{ marginTop: 12, padding: '10px 20px', borderRadius: 8, border: 'none', background: '#1E3A5F', color: '#FFF', fontWeight: 700, cursor: 'pointer' }}>
                    Buka RAB →
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AiDesignStudio;

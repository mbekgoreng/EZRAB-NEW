import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Sparkles, Save, FolderOpen, Check, Send, AlertTriangle, Info } from 'lucide-react';
import { parseHousePrompt, validateSpec, type HouseSpec } from './specEngine';
import { DesignSpreadsheet, specToSpreadsheetRows } from './DesignSpreadsheet';
import { spreadsheetToWorkItems, validateWorkItemsForRab, buildApprovalSummary } from './designToRabBridge';
import { useProject } from '../context/ProjectContext';
import { navigateTo, routeForMenu } from '../routing/routes';
import { saveDesign, listDesigns, getDesign, type SavedDesign } from './designStorage';
import { AhspCandidatePicker, findAhspCandidates } from './AhspCandidatePicker';
import type { NationalAHSPItem } from '../data/nationalCostDatabase/types';

type ViewTab = 'spec' | 'spreadsheet' | 'review';

interface AiDesignStudioProps {
  initialPrompt?: string;
  onApprove?: (spec: HouseSpec, workItems: ReturnType<typeof spreadsheetToWorkItems>) => void;
  /** Tab aktif dilaporkan ke pemanggil (progress Chat-to-RAB Workspace). */
  onTabChange?: (tab: ViewTab) => void;
}

const DEFAULT_PROMPT = 'Buatkan rumah 1 lantai luas bangunan 90 m², ukuran 6 × 15 m, 3 kamar tidur, 2 kamar mandi, ruang tamu, dapur, dan carport.';

/* ---- Gaya bersama: bahasa desain dashboard EZRAB (token --ez-*), aman mode gelap ---- */
const CARD: React.CSSProperties = {
  background: 'var(--ez-color-surface)',
  border: '1px solid var(--ez-color-border)',
  borderRadius: 16,
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
};
const WARN_PANEL: React.CSSProperties = {
  background: 'rgba(245, 158, 11, 0.10)',
  border: '1px solid rgba(245, 158, 11, 0.28)',
  borderRadius: 12,
};
const ERROR_PANEL: React.CSSProperties = {
  background: 'rgba(220, 38, 38, 0.07)',
  border: '1px solid rgba(220, 38, 38, 0.25)',
  borderRadius: 12,
};
const OK_PANEL: React.CSSProperties = {
  background: 'rgba(16, 185, 129, 0.09)',
  border: '1px solid rgba(16, 185, 129, 0.30)',
  borderRadius: 12,
};
const BTN_GHOST: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 10, border: '1px solid var(--ez-color-border)',
  background: 'var(--ez-color-surface)', color: 'var(--ez-color-text-secondary)',
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 7,
};
const BTN_PRIMARY: React.CSSProperties = {
  padding: '11px 22px', borderRadius: 10, border: 'none',
  background: 'var(--ez-color-primary)', color: '#FFF',
  fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 8,
};

/**
 * AI Design Studio — prompt → spesifikasi → spreadsheet → review → QTO/RAB.
 *
 * Alur: pengguna mengetik prompt → spec tervalidasi → periksa spreadsheet →
 *       setujui → data diteruskan ke QTO/RAB (via onApprove).
 * (Tab Denah 2D & 3D dihapus 2026-10-21 atas keputusan owner: buat simple.)
 */
export const AiDesignStudio: React.FC<AiDesignStudioProps> = ({ initialPrompt, onApprove, onTabChange }) => {
  const [prompt, setPrompt] = useState(initialPrompt || DEFAULT_PROMPT);
  const [spec, setSpec] = useState<HouseSpec | null>(() => parseHousePrompt(initialPrompt || DEFAULT_PROMPT).spec);
  const [clarifications, setClarifications] = useState<string[]>(() => parseHousePrompt(initialPrompt || DEFAULT_PROMPT).needsClarification);
  const [activeTab, setActiveTab] = useState<ViewTab>('spec');
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
  // Fase 6: penolakan persetujuan ditampilkan inline (bukan alert()).
  const [approveNote, setApproveNote] = useState<string | null>(null);

  useEffect(() => { onTabChange?.(activeTab); }, [activeTab, onTabChange]);

  const handleGenerate = useCallback(() => {
    const result = parseHousePrompt(prompt);
    setSpec(result.spec);
    setClarifications(result.needsClarification);
    setApproved(false);
    if (result.spec) setActiveTab('spec');
  }, [prompt]);

  const validation = useMemo(() => spec ? validateSpec(spec) : null, [spec]);
  const workItems = useMemo(() => spec ? spreadsheetToWorkItems(specToSpreadsheetRows(spec)) : [], [spec]);
  const approval = useMemo(() => spec ? buildApprovalSummary(spec, workItems) : null, [spec, workItems]);
  // Fase 5: status validasi TIGA tingkat. VALID hanya bila tidak ada issues,
  // tidak ada warnings (overlap/keluar tapak), tidak ada asumsi, dan tidak ada
  // klarifikasi menggantung — status tidak boleh menutupi konflik geometri.
  const designStatus = useMemo(() => {
    if (!spec || !validation) return null;
    if (validation.issues.length > 0) {
      return { tier: 'BLOCKED' as const, label: 'TERBLOKIR', color: '#DC2626', bg: 'rgba(220, 38, 38, 0.08)',
        detail: `${validation.issues.length} masalah kritis harus diselesaikan sebelum desain dapat disetujui.` };
    }
    const reviewBits: string[] = [];
    if (validation.warnings.length > 0) reviewBits.push(`${validation.warnings.length} peringatan geometri (overlap/batas tapak)`);
    if (spec.assumptions.length > 0) reviewBits.push(`${spec.assumptions.length} asumsi`);
    if (clarifications.length > 0) reviewBits.push(`${clarifications.length} hal perlu klarifikasi`);
    if (reviewBits.length > 0) {
      return { tier: 'NEEDS_REVIEW' as const, label: 'PERLU REVIEW', color: '#D97706', bg: 'rgba(217, 119, 6, 0.08)',
        detail: `${reviewBits.join(', ')} — periksa dan putuskan sebelum menyetujui. Denah ini konseptual, bukan gambar siap konstruksi.` };
    }
    return { tier: 'VALID' as const, label: 'VALID', color: '#059669', bg: 'rgba(5, 150, 105, 0.08)',
      detail: 'Lolos seluruh pemeriksaan yang dijalankan: dimensi, luas minimum ruang, batas tapak, overlap, dan kelengkapan spesifikasi. Tetap konseptual — bukan gambar siap konstruksi.' };
  }, [spec, validation, clarifications]);
  // Fase 6: gerbang kirim ke RAB — hitungan lolos / terblokir selalu terlihat.
  const rabGate = useMemo(() => validateWorkItemsForRab(workItems), [workItems]);

  const handleApprove = useCallback(() => {
    if (!spec || !validation?.valid) return;
    const { valid, rejected } = validateWorkItemsForRab(workItems);
    if (rejected.length > 0) {
      setApproveNote(
        `${rejected.length} item terblokir dan tidak ikut disetujui: ` +
        rejected.map(r => `${r.item.description} (${r.reason})`).join('; ') +
        '. Perbaiki di tab Spreadsheet sebelum mengirim ke RAB.',
      );
      return;
    }
    setApproveNote(null);
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
    setSaveMessage(`Tersimpan: ${saved.name} (${new Date(saved.savedAt).toLocaleString('id-ID')})`);
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
      setSaveMessage(`Dimuat: ${d.name}`);
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
    { id: 'spec', label: 'Spesifikasi' },
    { id: 'spreadsheet', label: 'Spreadsheet' },
    { id: 'review', label: 'Review & Setujui' },
  ];

  const stats: Array<{ label: string; value: React.ReactNode }> = spec ? [
    { label: 'Lantai', value: spec.floors },
    { label: 'Total ruang', value: spec.rooms.length },
    { label: 'Luas ruang', value: `${spec.totalRoomAreaM2.toFixed(1)} m²` },
    { label: 'Sirkulasi', value: `${spec.circulationM2.toFixed(1)} m²` },
    { label: 'Kelengkapan', value: `${spec.completeness}%` },
    {
      label: 'Status',
      value: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: validation?.valid ? '#10B981' : '#F59E0B' }} />
          {validation?.valid ? 'Valid' : 'Perlu perhatian'}
        </span>
      ),
    },
  ] : [];

  return (
    <div className="ai-design-studio" style={{ maxWidth: 1100, margin: '0 auto', padding: 16, color: 'var(--ez-color-text-primary)' }}>
      {/* Prompt input */}
      <div style={{ ...CARD, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ width: 28, height: 28, borderRadius: 9, background: 'var(--ez-ai-chip)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 6px rgba(124, 58, 237, 0.35)' }}>
            <Sparkles size={15} color="#FFFFFF" />
          </span>
          <label style={{ fontWeight: 750, fontSize: 15, color: 'var(--ez-color-text-primary)' }}>
            Deskripsikan rumah impian Anda
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Contoh: rumah 1 lantai 90 m², 6×15 m, 3 kamar tidur..."
            style={{
              flex: 1, padding: '11px 14px', borderRadius: 10,
              border: '1px solid var(--ez-color-border)', background: 'var(--ez-color-surface)',
              color: 'var(--ez-color-text-primary)', fontSize: 14, outline: 'none',
            }}
          />
          <button onClick={handleGenerate}
            style={{
              padding: '11px 22px', borderRadius: 10, border: 'none',
              background: 'var(--ez-ai-surface-active)', color: '#FFF',
              fontWeight: 700, fontSize: 14, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(124, 58, 237, 0.30)',
            }}>
            Generate
          </button>
        </div>
        {clarifications.length > 0 && (
          <div style={{ ...WARN_PANEL, marginTop: 12, padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Info size={15} color="#D97706" style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 13, color: 'var(--ez-color-text-body)' }}>
              Perlu dilengkapi: {clarifications.join('; ')}
            </span>
          </div>
        )}
        {/* P1: Simpan/Muat desain */}
        <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={handleSaveDesign} disabled={!spec} style={{ ...BTN_GHOST, opacity: spec ? 1 : 0.55, cursor: spec ? 'pointer' : 'default' }}>
            <Save size={14} /> Simpan Desain
          </button>
          <button onClick={handleLoadSavedDesigns} style={BTN_GHOST}>
            <FolderOpen size={14} /> Desain Tersimpan ({savedDesigns.length})
          </button>
          {saveMessage && <span style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>{saveMessage}</span>}
        </div>
        {showSavedList && (
          <div style={{ marginTop: 12, background: 'var(--ez-color-surface-secondary)', border: '1px solid var(--ez-color-border-soft)', borderRadius: 12, padding: '6px 14px' }}>
            {savedDesigns.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--ez-color-text-muted)', padding: '8px 0' }}>Belum ada desain tersimpan untuk proyek ini.</div>
            ) : (
              savedDesigns.map(d => (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--ez-color-border-soft)' }}>
                  <span style={{ fontSize: 13, color: 'var(--ez-color-text-primary)' }}>{d.name} <span style={{ color: 'var(--ez-color-text-faint)' }}>({new Date(d.savedAt).toLocaleString('id-ID')})</span></span>
                  <button onClick={() => handleLoadDesign(d.id)}
                    style={{ padding: '5px 14px', borderRadius: 8, border: 'none', background: 'var(--ez-color-primary-soft)', color: 'var(--ez-color-primary)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    Muat
                  </button>
                </div>
              ))
            )}
            <div style={{ fontSize: 11, color: 'var(--ez-color-text-faint)', padding: '8px 0' }}>Penyimpanan lokal perangkat. Backend server: BLOCKED (menunggu VPS).</div>
          </div>
        )}
      </div>

      {!spec ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--ez-color-text-muted)', fontSize: 14 }}>
          Prompt belum cukup untuk membuat desain. Lengkapi informasi yang diminta di atas.
        </div>
      ) : (
        <>
          {/* Tabs — segmented control */}
          <div style={{
            display: 'inline-flex', gap: 4, marginBottom: 16, flexWrap: 'wrap',
            background: 'var(--ez-color-surface-secondary)', border: '1px solid var(--ez-color-border-soft)',
            borderRadius: 12, padding: 4,
          }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                style={{
                  padding: '7px 15px', borderRadius: 9, border: 'none',
                  background: activeTab === t.id ? 'var(--ez-color-surface)' : 'transparent',
                  color: activeTab === t.id ? 'var(--ez-color-text-primary)' : 'var(--ez-color-text-secondary)',
                  fontWeight: activeTab === t.id ? 700 : 550, fontSize: 13, cursor: 'pointer',
                  boxShadow: activeTab === t.id ? '0 1px 3px rgba(15, 23, 42, 0.10)' : 'none',
                  transition: 'all 0.15s ease',
                }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Spec tab */}
          {activeTab === 'spec' && (
            <div style={{ ...CARD, padding: 24 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 800, color: 'var(--ez-color-text-primary)' }}>
                {spec.buildingType} — {spec.buildingWidthM} × {spec.buildingLengthM} m ({spec.buildingAreaM2.toFixed(1)} m²)
              </h3>
              {designStatus && (
                <div role="status" style={{ background: designStatus.bg, border: `1px solid ${designStatus.color}`, borderRadius: 12, padding: '11px 14px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  {designStatus.tier === 'VALID' ? <Check size={16} color={designStatus.color} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertTriangle size={16} color={designStatus.color} style={{ flexShrink: 0, marginTop: 1 }} />}
                  <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--ez-color-text-body)' }}>
                    <strong style={{ color: designStatus.color, letterSpacing: '0.03em' }}>STATUS: {designStatus.label}</strong>
                    {' — '}{designStatus.detail}
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 18 }}>
                {stats.map(s => (
                  <div key={s.label} style={{ background: 'var(--ez-color-surface-faint)', borderRadius: 12, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ez-color-text-muted)', marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 750, color: 'var(--ez-color-text-primary)' }}>{s.value}</div>
                  </div>
                ))}
              </div>
              {spec.assumptions.length > 0 && (
                <div style={{ ...WARN_PANEL, padding: '12px 14px', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 13, color: 'var(--ez-color-text-primary)' }}>
                    <AlertTriangle size={14} color="#D97706" /> Asumsi ({spec.assumptions.length})
                  </div>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 13, lineHeight: 1.55, color: 'var(--ez-color-text-body)' }}>
                    {spec.assumptions.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                </div>
              )}
              {validation && !validation.valid && (
                <div style={{ ...ERROR_PANEL, padding: '12px 14px' }}>
                  <strong style={{ color: '#DC2626', fontSize: 13 }}>Masalah validasi:</strong>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 13, lineHeight: 1.55, color: 'var(--ez-color-text-body)' }}>
                    {validation.issues.map((issue, i) => <li key={i}>{issue}</li>)}
                  </ul>
                </div>
              )}
              {validation && validation.warnings && validation.warnings.length > 0 && (
                <div style={{ ...WARN_PANEL, padding: '12px 14px', marginTop: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 13, color: 'var(--ez-color-text-primary)' }}>
                    <AlertTriangle size={14} color="#D97706" /> Perhatian layout
                  </div>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 13, lineHeight: 1.55, color: 'var(--ez-color-text-body)' }}>
                    {validation.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ez-color-text-muted)', marginBottom: 8 }}>Daftar ruang</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {spec.rooms.map(r => (
                    <span key={r.id} style={{
                      background: r.isAssumed ? 'rgba(245, 158, 11, 0.14)' : 'var(--ez-pastel-sky)',
                      color: 'var(--ez-color-text-primary)', borderRadius: 999, padding: '4px 11px', fontSize: 12, fontWeight: 600,
                    }}>
                      {r.name} ({r.areaM2.toFixed(1)} m²){r.isAssumed ? ' · asumsi' : ''}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Spreadsheet tab */}
          {activeTab === 'spreadsheet' && (
            <DesignSpreadsheet spec={spec} />
          )}

          {/* Review tab */}
          {activeTab === 'review' && approval && (
            <div style={{ ...CARD, padding: 24 }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 800, color: 'var(--ez-color-text-primary)' }}>Review Sebelum Dikirim ke QTO/RAB</h3>
              <div>
                {approval.lines.map((line, i) => (
                  <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--ez-color-border-soft)', fontSize: 13.5, color: 'var(--ez-color-text-body)' }}>{line}</div>
                ))}
              </div>
              {/* Fase 6: ringkasan gerbang RAB — lolos / perlu review / terblokir / harga */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginTop: 14 }}>
                {[
                  { label: 'Lolos ke RAB', value: rabGate.valid.length, color: '#059669' },
                  { label: 'Perlu review', value: workItems.filter(i => i.needsReview).length, color: '#D97706' },
                  { label: 'Terblokir', value: rabGate.rejected.length, color: '#DC2626' },
                  { label: 'Belum ada harga', value: workItems.length, color: 'var(--ez-color-text-primary)' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--ez-color-surface-faint)', borderRadius: 12, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ez-color-text-muted)', marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.value} item</div>
                  </div>
                ))}
              </div>
              {rabGate.rejected.length > 0 && (
                <div style={{ ...ERROR_PANEL, padding: '11px 14px', marginTop: 12, fontSize: 13, lineHeight: 1.55 }}>
                  <strong style={{ color: '#DC2626' }}>Item terblokir (tidak akan dikirim):</strong>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 20, color: 'var(--ez-color-text-body)' }}>
                    {rabGate.rejected.map((r, i) => <li key={i}>{r.item.description} — {r.reason}</li>)}
                  </ul>
                </div>
              )}
              <div style={{ ...WARN_PANEL, padding: '12px 14px', marginTop: 14, display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                <AlertTriangle size={15} color="#D97706" style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--ez-color-text-body)' }}>
                  <strong>Penting:</strong> Semua {approval.unresolvedPriceCount} item belum memiliki harga (null).
                  Harga akan ditentukan via AHSP/resolver/manual <em>setelah</em> Anda menyetujui desain.
                  Tidak ada harga yang dikarang.
                </span>
              </div>

              {/* P1: Manual AHSP mapping */}
              <div style={{ marginTop: 20, borderTop: '1px solid var(--ez-color-border-soft)', paddingTop: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ez-color-text-primary)' }}>Pemetaan AHSP (opsional)</div>
                <div style={{ fontSize: 12.5, color: 'var(--ez-color-text-muted)', margin: '4px 0 6px' }}>
                  Pilih kandidat AHSP secara manual untuk setiap item. Tidak ada auto-mapping.
                </div>
                {workItems.map(item => (
                  <div key={item.code} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--ez-color-border-soft)', fontSize: 13 }}>
                    <span style={{ flex: 1, color: 'var(--ez-color-text-body)' }}>
                      {item.description} ({item.volume} {item.unit})
                      {ahspMappings[item.code] && (
                        <span style={{
                          marginLeft: 9, padding: '2px 8px', borderRadius: 999,
                          background: 'rgba(16, 185, 129, 0.12)', color: '#059669',
                          fontWeight: 700, fontSize: 11.5,
                        }}>
                          {ahspMappings[item.code]}
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => setPickerFor(item.code)}
                      style={{
                        padding: '6px 13px', borderRadius: 9, cursor: 'pointer',
                        border: '1px solid var(--ez-ai-border)', background: 'var(--ez-ai-surface)',
                        color: 'var(--ez-ai-text)', fontSize: 12, fontWeight: 700,
                      }}
                    >
                      {ahspMappings[item.code] ? 'Ubah' : 'Pilih AHSP'}
                    </button>
                  </div>
                ))}
              </div>

              {pickerFor && (
                <div style={{ marginTop: 14 }}>
                  <AhspCandidatePicker
                    keywords={getKeywordsForItem(workItems.find(w => w.code === pickerFor)?.description || '')}
                    requiredUnit={workItems.find(w => w.code === pickerFor)?.unit || ''}
                    onSelect={(ahsp) => handleAhspSelect(pickerFor, ahsp)}
                    onCancel={() => setPickerFor(null)}
                  />
                </div>
              )}
              {approveNote && (
                <div style={{ ...ERROR_PANEL, padding: '11px 14px', marginTop: 14, fontSize: 13, lineHeight: 1.55, color: 'var(--ez-color-text-body)' }}>
                  {approveNote}
                </div>
              )}
              <button onClick={handleApprove} disabled={!validation?.valid || approved}
                style={{
                  ...BTN_PRIMARY, marginTop: 18,
                  background: approved ? '#059669' : validation?.valid ? 'var(--ez-color-primary)' : 'var(--ez-color-surface-tertiary)',
                  color: approved || validation?.valid ? '#FFF' : 'var(--ez-color-text-muted)',
                  cursor: approved || !validation?.valid ? 'default' : 'pointer',
                }}>
                {approved && <Check size={15} />}
                {approved ? 'Desain Disetujui' : 'Setujui Desain'}
              </button>

              {/* P0: Kirim ke RAB */}
              {approved && !sentToRab && (
                <div style={{ marginTop: 18, borderTop: '1px solid var(--ez-color-border-soft)', paddingTop: 18 }}>
                  {!showConfirm ? (
                    <button onClick={() => setShowConfirm(true)} style={BTN_PRIMARY}>
                      <Send size={15} /> Kirim {workItems.length} Item ke RAB
                    </button>
                  ) : (
                    <div style={{ background: 'var(--ez-color-primary-soft)', borderRadius: 12, padding: 16 }}>
                      <strong style={{ fontSize: 14 }}>Kirim ke proyek "{currentProject?.name || '(belum ada proyek aktif)'}"?</strong>
                      <ul style={{ fontSize: 13, margin: '8px 0', paddingLeft: 20, lineHeight: 1.6, color: 'var(--ez-color-text-body)' }}>
                        {workItems.map(item => (
                          <li key={item.code}>{item.description} — {item.volume} {item.unit} (harga: belum ada)</li>
                        ))}
                      </ul>
                      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <button onClick={handleSendToRab} style={BTN_PRIMARY}>
                          Ya, Kirim ke RAB
                        </button>
                        <button onClick={() => setShowConfirm(false)} style={BTN_GHOST}>
                          Batal
                        </button>
                      </div>
                    </div>
                  )}
                  {sendError && (
                    <div style={{ marginTop: 10, color: '#DC2626', fontSize: 13, fontWeight: 600 }}>{sendError}</div>
                  )}
                </div>
              )}

              {sentToRab && (
                <div style={{ ...OK_PANEL, marginTop: 18, padding: 16 }}>
                  <div style={{ color: '#059669', fontWeight: 750, display: 'flex', alignItems: 'center', gap: 7, fontSize: 14 }}>
                    <Check size={16} /> Item berhasil dikirim ke RAB proyek "{currentProject?.name}"
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ez-color-text-secondary)', marginTop: 5, lineHeight: 1.55 }}>
                    Item masuk dengan status harga UNRESOLVED (null). Tentukan harga via AHSP atau input manual di menu RAB.
                  </div>
                  <button onClick={handleGoToRab} style={{ ...BTN_PRIMARY, marginTop: 12 }}>
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

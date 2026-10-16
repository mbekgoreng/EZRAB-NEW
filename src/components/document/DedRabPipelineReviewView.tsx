import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Eye,
  Edit2,
  Check,
  Sparkles,
  ArrowRight,
  RotateCcw,
  FileText,
  FileSpreadsheet,
  Layers,
  Calculator,
  Info,
  ExternalLink,
  ChevronDown,
  Hash,
  X,
  AlertCircle,
  Save,
  Trash2,
} from 'lucide-react';
import {
  DEDRabDraftSummary,
  DEDRabDraftRow,
  DEDSourceInventoryItem,
  WorkItemStatus,
  WorkItemConfidence,
  RabMutationDiff,
} from '../../domain/ded/dedPipelineTypes';
import { DedToRabPipelineService } from '../../services/dedToRabPipelineService';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';
import { RabItem, RABSection } from '../../types';

export interface DedRabPipelineReviewViewProps {
  draftSummary: DEDRabDraftSummary;
  projectId: string;
  projectName: string;
  existingProjectRabItems?: RabItem[];
  onCommitSuccess?: (sections: RABSection[], grandTotal: number) => void;
  onAddRabItemDirect?: (item: Partial<RabItem> & { description: string; volume: number; unit: string; unitPrice?: number | null; amount?: number | null; ahspCode?: string; category?: string }) => void;
  onClose?: () => void;
}

export const DedRabPipelineReviewView: React.FC<DedRabPipelineReviewViewProps> = ({
  draftSummary: initialDraft,
  projectId,
  projectName,
  existingProjectRabItems = [],
  onCommitSuccess,
  onAddRabItemDirect,
  onClose,
}) => {
  const service = useMemo(() => DedToRabPipelineService.getInstance(), []);
  const [draft, setDraft] = useState<DEDRabDraftSummary>(initialDraft);
  const [filterTab, setFilterTab] = useState<'ALL' | 'VERIFIED' | 'NEEDS_REVIEW' | 'MISSING' | 'CONFLICT'>('ALL');
  const [selectedEvidenceRow, setSelectedEvidenceRow] = useState<DEDRabDraftRow | null>(null);
  const [editingRow, setEditingRow] = useState<DEDRabDraftRow | null>(null);
  const [editValues, setEditValues] = useState<{ volume: number; unitPrice: number; unit: string; ahspCode: string; description: string }>({
    volume: 0,
    unitPrice: 0,
    unit: '',
    ahspCode: '',
    description: '',
  });
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isCommiting, setIsCommiting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Filtered rows
  const filteredRows = useMemo(() => {
    if (filterTab === 'ALL') return draft.rows;
    if (filterTab === 'VERIFIED') return draft.rows.filter((r) => r.status === 'VERIFIED' || r.status === 'DERIVED');
    if (filterTab === 'NEEDS_REVIEW') return draft.rows.filter((r) => r.confidence === 'LOW' || r.status === 'CONFLICT' || !r.ahspCode || !r.unitPrice);
    if (filterTab === 'MISSING') return draft.rows.filter((r) => !r.ahspCode || !r.unitPrice || !r.volume);
    if (filterTab === 'CONFLICT') return draft.rows.filter((r) => r.status === 'CONFLICT');
    return draft.rows;
  }, [draft.rows, filterTab]);

  // "Buat Semua yang Kurang" Action
  const handleAutoFillMissing = () => {
    try {
      const res = service.autoFillMissingWithValidSources(projectId);
      setDraft({ ...res.updatedDraft });
      showToast(res.message);
    } catch (err: any) {
      showToast(err.message || 'Gagal melengkapi data.');
    }
  };

  // Handle Edit click
  const handleOpenEdit = (row: DEDRabDraftRow) => {
    setEditingRow(row);
    setEditValues({
      volume: row.volume,
      unitPrice: row.unitPrice || 0,
      unit: row.unit,
      ahspCode: row.ahspCode || '',
      description: row.description,
    });
  };

  // Save Edit Override
  const handleSaveEdit = () => {
    if (!editingRow) return;
    try {
      const updatedDraft = service.applyUserOverride(projectId, editingRow.workItemId, {
        volume: Number(editValues.volume),
        unitPrice: Number(editValues.unitPrice),
        unit: editValues.unit,
        ahspCode: editValues.ahspCode,
        description: editValues.description,
      });
      setDraft({ ...updatedDraft });
      setEditingRow(null);
      showToast(`Item "${editValues.description}" berhasil diperbarui (USER_OVERRIDDEN). Nilai asli AI tetap tersimpan.`);
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan perubahan.');
    }
  };

  // Confirmation gate diff
  const mutationDiff: RabMutationDiff = useMemo(() => {
    return service.calculateMutationDiff(projectId, existingProjectRabItems);
  }, [service, projectId, existingProjectRabItems, draft]);

  // Confirm and Commit
  const handleConfirmAndCommit = () => {
    setIsCommiting(true);
    try {
      if (onAddRabItemDirect) {
        service.confirmAndCommitToRab(projectId, existingProjectRabItems, onAddRabItemDirect);
      }

      if (onCommitSuccess) {
        // Build sections
        const sectionMap = new Map<string, any[]>();
        draft.rows.forEach((r) => {
          const cat = r.category || 'Pekerjaan Struktur';
          if (!sectionMap.has(cat)) sectionMap.set(cat, []);
          sectionMap.get(cat)!.push({
            id: r.id,
            projectId,
            no: r.no,
            code: r.ahspCode || `DED-${String(r.no).padStart(2, '0')}`,
            description: r.description,
            volume: r.volume,
            unit: r.unit,
            unitPrice: r.unitPrice || 0,
            amount: r.amount,
            ahspCode: r.ahspCode,
            category: r.category,
          });
        });

        const sections: RABSection[] = Array.from(sectionMap.entries()).map(([cat, items], idx) => ({
          id: `sec-${idx + 1}`,
          code: String.fromCharCode(65 + idx),
          name: cat,
          title: cat,
          items: items as any,
          subtotal: items.reduce((sum, it) => sum + (it.amount || 0), 0),
        }));

        onCommitSuccess(sections, draft.grandTotal);
      }

      showToast(`Berhasil menyimpan ${draft.rows.length} item ke RAB Proyek ${projectName}!`);
      setIsConfirmModalOpen(false);
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan ke RAB.');
    } finally {
      setIsCommiting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px', background: 'var(--ez-color-surface-secondary)', minHeight: '100%' }}>
      {/* Toast Alert */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            top: '24px',
            right: '24px',
            zIndex: 9999,
            background: '#1E293B',
            color: '#FFFFFF',
            padding: '12px 20px',
            borderRadius: '10px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '13px',
            fontWeight: 600,
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <CheckCircle2 size={16} color="#34D399" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%)',
          borderRadius: '16px',
          padding: '24px 28px',
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          boxShadow: '0 4px 20px rgba(37,99,235,0.2)',
        }}
      >
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.15)', padding: '4px 12px', borderRadius: '20px', fontSize: '11.5px', fontWeight: 700, marginBottom: '8px' }}>
            <ShieldCheck size={14} color="#93C5FD" />
            <span>PHASE 10: DED → RAB PRODUCTION PIPELINE</span>
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
            Draf RAB Terverifikasi • {projectName}
          </h1>
          <p style={{ fontSize: '13px', color: '#DBEAFE', margin: 0, maxWidth: '650px', lineHeight: 1.5 }}>
            Data diekstrak langsung dari berkas gambar kerja teknis, dihitung secara deterministik oleh engine EZRAB, dan dipetakan ke katalog AHSP resmi tanpa estimasi liar.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {draft.diagnostic && (
            <div style={{ background: 'rgba(255,255,255,0.12)', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', color: '#DBEAFE', display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'right' }}>
              <div><strong style={{ color: '#FFFFFF' }}>AI Engine:</strong> EZRAB AI Pro</div>
              <div><strong style={{ color: '#FFFFFF' }}>Durasi:</strong> {draft.diagnostic.latencyMs ? `${(draft.diagnostic.latencyMs / 1000).toFixed(1)}s` : '0s'}</div>
            </div>
          )}
          <button
            type="button"
            disabled={draft.totalItems === 0}
            onClick={() => setIsConfirmModalOpen(true)}
            style={{
              background: draft.totalItems === 0 ? '#94A3B8' : '#22C55E',
              color: '#FFFFFF',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '10px',
              fontWeight: 800,
              fontSize: '13.5px',
              cursor: draft.totalItems === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: draft.totalItems === 0 ? 'none' : '0 4px 14px rgba(34,197,94,0.35)',
              transition: 'all 0.15s ease',
              opacity: draft.totalItems === 0 ? 0.6 : 1,
            }}
            onMouseEnter={(e) => {
              if (draft.totalItems > 0) e.currentTarget.style.backgroundColor = '#16A34A';
            }}
            onMouseLeave={(e) => {
              if (draft.totalItems > 0) e.currentTarget.style.backgroundColor = '#22C55E';
            }}
          >
            <ShieldCheck size={18} />
            <span>Konfirmasi & Simpan ke RAB</span>
          </button>
        </div>
      </div>

      {/* SECTION 3: SOURCE INVENTORY */}
      <div style={{ background: 'var(--ez-color-surface)', borderRadius: '14px', padding: '18px 22px', border: '1px solid var(--ez-color-border-line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} color="var(--ez-hue-blue-text)" />
            <span style={{ fontSize: '14px', fontWeight: 750, color: 'var(--ez-color-text-primary)' }}>SOURCE INVENTORY (BERKAS TERVERIFIKASI)</span>
          </div>
          <span style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)' }}>{draft.sourceInventory.length} berkas terdaftar</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
          {draft.sourceInventory.map((source) => (
            <div
              key={source.sourceId}
              style={{
                background: 'var(--ez-color-surface-secondary)',
                border: '1px solid var(--ez-color-border-line)',
                borderRadius: '10px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={16} color="var(--ez-hue-green-text-bright)" />
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ez-color-text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {source.sourceName}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--ez-color-text-muted)', flexWrap: 'wrap' }}>
                <span style={{ background: 'var(--ez-color-border-line)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>{source.classification}</span>
                <span>{source.pageCount} hlm</span>
                <span>•</span>
                <span style={{ color: 'var(--ez-hue-green-text)', fontWeight: 700 }}>Source verified</span>
              </div>
              <div style={{ fontSize: '10px', color: '#94A3B8', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                SHA-256: {source.fileHash.slice(0, 16)}...{source.fileHash.slice(-8)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 18: MISSING DATA PANEL & "BUAT SEMUA YANG KURANG" */}
      {(draft.missingDataSummary.missingAhspCount > 0 ||
        draft.missingDataSummary.missingPriceCount > 0 ||
        draft.missingDataSummary.missingQuantityCount > 0 ||
        draft.missingDataSummary.conflictCount > 0) && (
        <div
          style={{
            background: 'var(--ez-hue-amber-bg)',
            border: '1px solid var(--ez-hue-amber-border)',
            borderRadius: '14px',
            padding: '18px 22px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <AlertTriangle size={22} color="var(--ez-hue-amber-text-deep)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ fontSize: '14px', fontWeight: 750, color: 'var(--ez-hue-amber-text-dark)' }}>
                MISSING DATA & CONFLICT REVIEW PANEL
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginTop: '6px', fontSize: '12px', color: 'var(--ez-hue-amber-text)' }}>
                {draft.missingDataSummary.missingAhspCount > 0 && (
                  <span>⚠ {draft.missingDataSummary.missingAhspCount} pekerjaan belum memiliki AHSP</span>
                )}
                {draft.missingDataSummary.missingPriceCount > 0 && (
                  <span>⚠ {draft.missingDataSummary.missingPriceCount} pekerjaan belum memiliki harga satuan</span>
                )}
                {draft.missingDataSummary.missingQuantityCount > 0 && (
                  <span>⚠ {draft.missingDataSummary.missingQuantityCount} pekerjaan belum memiliki quantity</span>
                )}
                {draft.missingDataSummary.conflictCount > 0 && (
                  <span style={{ color: 'var(--ez-hue-rose-text)', fontWeight: 700 }}>⚠ {draft.missingDataSummary.conflictCount} specification conflict</span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAutoFillMissing}
            style={{
              background: '#D97706',
              color: '#FFFFFF',
              border: 'none',
              padding: '9px 18px',
              borderRadius: '8px',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(217,119,6,0.25)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#B45309')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#D97706')}
          >
            <Sparkles size={14} />
            <span>Buat Semua yang Kurang (Verifiable DB)</span>
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {[
          { key: 'ALL', label: `Semua (${draft.rows.length})` },
          { key: 'VERIFIED', label: `Terverifikasi (${draft.verifiedCount})` },
          { key: 'NEEDS_REVIEW', label: `Perlu Review (${draft.needsReviewCount})` },
          { key: 'MISSING', label: `Data Kurang (${draft.missingCount})` },
          { key: 'CONFLICT', label: `Konflik (${draft.conflictCount})` },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilterTab(tab.key as any)}
            style={{
              padding: '7px 14px',
              borderRadius: '8px',
              border: filterTab === tab.key ? '1px solid #2563EB' : '1px solid var(--ez-hue-slate-border)',
              background: filterTab === tab.key ? 'var(--ez-hue-blue-bg)' : 'var(--ez-color-surface)',
              color: filterTab === tab.key ? 'var(--ez-color-primary)' : 'var(--ez-color-text-slate)',
              fontWeight: filterTab === tab.key ? 750 : 600,
              fontSize: '12px',
              cursor: 'pointer',
              transition: 'all 0.12s ease',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* SECTION 14: RAB DRAFT TABLE */}
      <div style={{ background: 'var(--ez-color-surface)', borderRadius: '14px', border: '1px solid var(--ez-color-border-line)', overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--ez-color-surface-tertiary)', borderBottom: '1.5px solid var(--ez-hue-slate-border)', color: 'var(--ez-color-text-body)', fontWeight: 750 }}>
                <th style={{ padding: '12px 14px', width: '48px', textAlign: 'center' }}>No</th>
                <th style={{ padding: '12px 14px' }}>Uraian Pekerjaan</th>
                <th style={{ padding: '12px 14px', textAlign: 'right' }}>Volume</th>
                <th style={{ padding: '12px 14px', width: '70px', textAlign: 'center' }}>Sat</th>
                <th style={{ padding: '12px 14px' }}>Kode AHSP</th>
                <th style={{ padding: '12px 14px', textAlign: 'right' }}>Harga Satuan</th>
                <th style={{ padding: '12px 14px', textAlign: 'right' }}>Jumlah Harga</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', width: '130px' }}>Evidence</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', width: '80px' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '40px 20px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: 'var(--ez-color-text-muted)' }}>
                      <AlertCircle size={36} color="#94A3B8" />
                      <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ez-color-text-strong)' }}>
                        {draft.totalItems === 0
                          ? 'Belum Ada Item Pekerjaan DED yang Terdeteksi'
                          : 'Tidak Ada Item untuk Filter Ini'}
                      </div>
                      <div style={{ fontSize: '12.5px', color: 'var(--ez-color-text-muted)', maxWidth: '480px', lineHeight: 1.5 }}>
                        {draft.totalItems === 0
                          ? 'AI tidak menemukan notasi dimensi atau elemen arsitektur/struktur yang terverifikasi pada berkas yang diunggah. Pastikan berkas memiliki denah/potongan gambar teknik yang terbaca.'
                          : 'Pilih tab filter lain di atas untuk melihat rincian item pekerjaan lainnya.'}
                      </div>
                      {draft.totalItems === 0 && onClose && (
                        <button
                          type="button"
                          onClick={onClose}
                          style={{
                            marginTop: '10px',
                            background: 'var(--ez-color-primary)',
                            color: '#FFFFFF',
                            border: 'none',
                            padding: '9px 18px',
                            borderRadius: '8px',
                            fontWeight: 700,
                            fontSize: '13px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <span>← Kembali & Pindai Ulang Berkas</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                const isConflict = row.status === 'CONFLICT';
                const isOverridden = row.isUserOverridden;
                const isLowConf = row.confidence === 'LOW';

                return (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: '1px solid var(--ez-color-surface-tertiary)',
                      background: isConflict ? 'var(--ez-hue-rose-bg)' : isOverridden ? 'var(--ez-hue-purple-bg)' : 'var(--ez-color-surface)',
                      transition: 'background 0.12s ease',
                    }}
                  >
                    <td style={{ padding: '12px 14px', textAlign: 'center', color: 'var(--ez-color-text-muted)', fontWeight: 600 }}>
                      {String(row.no).padStart(2, '0')}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>{row.description}</div>
                      <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                        <span>{row.category}</span>
                        {isOverridden && (
                          <span style={{ background: 'var(--ez-hue-purple-bg-soft)', color: 'var(--ez-hue-purple-text)', padding: '1px 6px', borderRadius: '4px', fontWeight: 700, fontSize: '10px' }}>
                            USER_OVERRIDDEN
                          </span>
                        )}
                        {isConflict && (
                          <span style={{ background: 'var(--ez-hue-red-bg)', color: 'var(--ez-hue-rose-text)', padding: '1px 6px', borderRadius: '4px', fontWeight: 700, fontSize: '10px' }}>
                            CONFLICT
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>
                      {row.volume ? row.volume.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) : '-'}
                      {row.originalAiValue?.volume !== undefined && isOverridden && (
                        <div style={{ fontSize: '10px', color: '#9333EA', fontWeight: 500 }}>
                          (Asli AI: {row.originalAiValue.volume})
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', color: 'var(--ez-color-text-slate)', fontWeight: 600 }}>
                      {row.unit}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {row.isCustomItem || row.ahspSourceType === 'AI_CUSTOM' ? (
                        <div style={{ background: 'var(--ez-hue-purple-bg)', border: '1px solid var(--ez-hue-purple-border)', padding: '4px 8px', borderRadius: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 800, color: 'var(--ez-hue-purple-text)', fontSize: '11px' }}>
                            <span>⚠ {row.customItemCode || row.ahspCode || 'AI-CUSTOM'}</span>
                            <span style={{ background: 'var(--ez-hue-purple-bg-soft)', color: '#6B21A8', padding: '1px 5px', borderRadius: '3px', fontSize: '9.5px' }}>Item Kustom AI</span>
                          </div>
                          <div style={{ fontSize: '10.5px', color: '#86198F', marginTop: '1px' }}>
                            {row.customItemReason || 'Tidak ditemukan di AHSP resmi'}
                          </div>
                        </div>
                      ) : row.ahspCode ? (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontWeight: 700, color: row.ahspMatchStatus === 'SEMANTIC_MATCH' ? 'var(--ez-hue-amber-text-deep)' : 'var(--ez-color-primary)', fontFamily: 'monospace' }}>
                              {row.ahspMatchStatus === 'SEMANTIC_MATCH' ? `~ ${row.ahspCode}` : `✓ ${row.ahspCode}`}
                            </span>
                            <span
                              style={{
                                background: row.ahspMatchStatus === 'SEMANTIC_MATCH' ? 'var(--ez-hue-amber-bg-deep)' : 'var(--ez-hue-blue-bg)',
                                color: row.ahspMatchStatus === 'SEMANTIC_MATCH' ? 'var(--ez-hue-amber-text)' : 'var(--ez-color-primary-hover)',
                                padding: '1px 5px',
                                borderRadius: '3px',
                                fontSize: '9.5px',
                                fontWeight: 700,
                              }}
                            >
                              {row.ahspMatchStatus === 'SEMANTIC_MATCH' ? 'Semantik' : 'Resmi PUPR'}
                            </span>
                          </div>
                          {row.ahspName && (
                            <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px', marginTop: '2px' }}>
                              {row.ahspName}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--ez-hue-rose-text)', fontWeight: 600, fontSize: '11.5px' }}>AHSP_NOT_FOUND</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--ez-color-text-primary)', fontWeight: 600 }}>
                      {row.unitPrice ? (
                        formatCurrencyIDR(row.unitPrice)
                      ) : (
                        <span style={{ color: 'var(--ez-hue-rose-text)', fontSize: '11.5px' }}>PRICE_NOT_FOUND</span>
                      )}
                      <div style={{ fontSize: '10px', color: 'var(--ez-color-text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                        {row.priceProvenance === 'AI_ESTIMATE' ? (
                          <span style={{ background: 'var(--ez-hue-purple-bg)', color: 'var(--ez-hue-purple-text)', padding: '1px 5px', borderRadius: '3px', fontWeight: 700 }}>
                            Estimasi AI (Review)
                          </span>
                        ) : row.priceProvenance === 'PROJECT_PRICE' ? (
                          <span style={{ background: 'var(--ez-hue-green-bg)', color: 'var(--ez-hue-green-text-bright)', padding: '1px 5px', borderRadius: '3px', fontWeight: 700 }}>
                            Harga Proyek
                          </span>
                        ) : (
                          <span>{row.priceSourceText || 'Katalog Resmi'}</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: 'var(--ez-hue-blue-text-deep)' }}>
                      {formatCurrencyIDR(row.amount)}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => setSelectedEvidenceRow(row)}
                        style={{
                          background: row.confidence === 'HIGH' ? 'var(--ez-hue-blue-bg)' : row.confidence === 'MEDIUM' ? 'var(--ez-hue-amber-bg)' : 'var(--ez-hue-rose-bg)',
                          color: row.confidence === 'HIGH' ? 'var(--ez-color-primary)' : row.confidence === 'MEDIUM' ? 'var(--ez-hue-amber-text-deep)' : 'var(--ez-hue-rose-text)',
                          border: `1px solid ${row.confidence === 'HIGH' ? 'var(--ez-hue-blue-border)' : row.confidence === 'MEDIUM' ? 'var(--ez-hue-amber-border)' : 'var(--ez-hue-rose-border)'}`,
                          padding: '5px 10px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                        }}
                      >
                        <Eye size={12} />
                        <span>{row.confidence}</span>
                      </button>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(row)}
                        style={{
                          background: 'var(--ez-color-surface-tertiary)',
                          border: '1px solid var(--ez-hue-slate-border)',
                          color: 'var(--ez-color-text-body)',
                          padding: '5px 8px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        title="Ubah Nilai / User Override"
                      >
                        <Edit2 size={13} />
                      </button>
                    </td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>

        {/* Table Footer Totals */}
        <div
          style={{
            background: 'var(--ez-color-surface-secondary)',
            borderTop: '2px solid var(--ez-color-border-line)',
            padding: '16px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '32px',
          }}
        >
          <div>
            <span style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)' }}>Subtotal: </span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>{formatCurrencyIDR(draft.subtotal)}</span>
          </div>
          <div>
            <span style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)' }}>PPN 11%: </span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>{formatCurrencyIDR(draft.ppnAmount)}</span>
          </div>
          <div>
            <span style={{ fontSize: '13px', color: 'var(--ez-hue-blue-text-deep)', fontWeight: 700 }}>Grand Total: </span>
            <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ez-color-primary)' }}>{formatCurrencyIDR(draft.grandTotal)}</span>
          </div>
        </div>
      </div>

      {/* SECTION 15: EVIDENCE PANEL MODAL / DRAWER */}
      {selectedEvidenceRow && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9998,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            style={{
              background: 'var(--ez-color-surface)',
              borderRadius: '16px',
              maxWidth: '620px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              border: '1px solid var(--ez-color-border-line)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--ez-color-border-line)', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={20} color="var(--ez-hue-blue-text)" />
                <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)' }}>EVIDENCE & PROVENANCE AUDIT TRAIL</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEvidenceRow(null)}
                style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div>
              <div style={{ fontSize: '14.5px', fontWeight: 800, color: 'var(--ez-hue-blue-text-deep)' }}>{selectedEvidenceRow.description}</div>
              <div style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', marginTop: '2px' }}>Kategori: {selectedEvidenceRow.category}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: 'var(--ez-color-surface-secondary)', padding: '14px', borderRadius: '10px' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', fontWeight: 700 }}>SOURCE DOKUMEN</div>
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ez-color-text-primary)', marginTop: '2px' }}>{selectedEvidenceRow.evidence?.sourceName}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', fontWeight: 700 }}>HALAMAN</div>
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ez-color-text-primary)', marginTop: '2px' }}>Halaman {selectedEvidenceRow.evidence?.page || 1}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', fontWeight: 700 }}>CONFIDENCE</div>
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: selectedEvidenceRow.confidence === 'HIGH' ? 'var(--ez-hue-green-text-bright)' : 'var(--ez-hue-amber-text-deep)', marginTop: '2px' }}>
                  {selectedEvidenceRow.confidence}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', fontWeight: 700 }}>STATUS BUKTI</div>
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ez-color-primary)', marginTop: '2px' }}>{selectedEvidenceRow.status}</div>
              </div>
            </div>

            {selectedEvidenceRow.evidence?.extractedText && (
              <div>
                <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', fontWeight: 700, marginBottom: '4px' }}>EXTRACTED TEXT DARI SUMBER</div>
                <div style={{ background: 'var(--ez-color-surface-tertiary)', padding: '10px 12px', borderRadius: '8px', fontSize: '12px', color: 'var(--ez-color-text-body)', fontFamily: 'monospace' }}>
                  {selectedEvidenceRow.evidence.extractedText}
                </div>
              </div>
            )}

            {selectedEvidenceRow.calculationDetails && (
              <div style={{ background: 'var(--ez-hue-blue-bg)', border: '1px solid var(--ez-hue-blue-border)', padding: '12px 14px', borderRadius: '10px' }}>
                <div style={{ fontSize: '11.5px', fontWeight: 750, color: 'var(--ez-hue-blue-text-deep)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <Calculator size={14} />
                  <span>DETERMINISTIC CALCULATION (EZRAB ENGINE)</span>
                </div>
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ez-color-primary-hover)', fontFamily: 'monospace' }}>
                  {selectedEvidenceRow.calculationDetails.formula}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--ez-color-text-slate)', marginTop: '4px' }}>
                  Kalkulasi volume dihitung secara deterministik oleh engine EZRAB, bukan prediksi AI.
                </div>
              </div>
            )}

            <div>
              <div style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', fontWeight: 700, marginBottom: '4px' }}>AHSP RESOLUTION & PROVENANCE (PHASE 11)</div>
              <div style={{ fontSize: '12px', color: 'var(--ez-color-text-body)', lineHeight: 1.6, background: 'var(--ez-color-surface-secondary)', padding: '10px 12px', borderRadius: '8px' }}>
                <div>
                  Tipe Sumber AHSP: <strong>{selectedEvidenceRow.ahspSourceType || (selectedEvidenceRow.isCustomItem ? 'AI_CUSTOM' : 'OFFICIAL_AHSP')}</strong>
                  {selectedEvidenceRow.ahspMatchStatus && (
                    <span style={{ marginLeft: '8px', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, background: selectedEvidenceRow.ahspMatchStatus === 'EXACT_MATCH' ? 'var(--ez-hue-green-bg-deep)' : 'var(--ez-hue-amber-bg-deep)', color: selectedEvidenceRow.ahspMatchStatus === 'EXACT_MATCH' ? 'var(--ez-hue-green-text-deep)' : 'var(--ez-hue-amber-text-dark)' }}>
                      {selectedEvidenceRow.ahspMatchStatus}
                    </span>
                  )}
                </div>
                <div>Kode AHSP: <strong>{selectedEvidenceRow.ahspCode || 'Belum terpetakan'}</strong> ({selectedEvidenceRow.ahspName || '-'})</div>
                <div>Sumber & Provenance Harga: <strong>{selectedEvidenceRow.priceProvenance || selectedEvidenceRow.priceSourceText || 'Standar PUPR 2026'}</strong></div>
                {selectedEvidenceRow.isCustomItem && (
                  <div style={{ marginTop: '6px', padding: '6px 8px', background: 'var(--ez-hue-purple-bg)', border: '1px solid var(--ez-hue-purple-border)', borderRadius: '6px', fontSize: '11px', color: 'var(--ez-hue-purple-text)' }}>
                    <strong>Item Kustom AI:</strong> {selectedEvidenceRow.customItemReason || 'Tidak ditemukan item yang cocok pada katalog resmi AHSP. Memerlukan konfirmasi pengguna sebelum komit.'}
                  </div>
                )}
              </div>
            </div>

            {selectedEvidenceRow.conflictDetails && (
              <div style={{ background: 'var(--ez-hue-rose-bg)', border: '1px solid var(--ez-hue-rose-border)', padding: '12px', borderRadius: '10px' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ez-hue-rose-text)' }}>KONFLIK SPESIFIKASI TERDETEKSI</div>
                <div style={{ fontSize: '11.5px', color: 'var(--ez-hue-red-text)', marginTop: '4px' }}>
                  {selectedEvidenceRow.conflictDetails.description}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--ez-hue-rose-text)', fontWeight: 600, marginTop: '2px' }}>
                  Tindakan: {selectedEvidenceRow.conflictDetails.actionRequired}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setSelectedEvidenceRow(null)}
              style={{
                background: 'var(--ez-color-surface-tertiary)',
                color: 'var(--ez-color-text-body)',
                border: '1px solid var(--ez-hue-slate-border)',
                padding: '9px 16px',
                borderRadius: '8px',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
                marginTop: '6px',
              }}
            >
              Tutup Panel Bukti
            </button>
          </div>
        </div>
      )}

      {/* SECTION 21: USER OVERRIDE MODAL */}
      {editingRow && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9998,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            style={{
              background: 'var(--ez-color-surface)',
              borderRadius: '16px',
              maxWidth: '520px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              border: '1px solid var(--ez-color-border-line)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--ez-color-border-line)', paddingBottom: '10px' }}>
              <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ez-color-text-primary)' }}>Ubah Nilai Pekerjaan (User Override)</span>
              <button
                type="button"
                onClick={() => setEditingRow(null)}
                style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)' }}>
              Nilai asli hasil ekstraksi AI dan kalkulasi deterministik akan tetap disimpan untuk keperluan audit.
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ez-color-text-body)', display: 'block', marginBottom: '4px' }}>
                Uraian Pekerjaan
              </label>
              <input
                type="text"
                value={editValues.description}
                onChange={(e) => setEditValues({ ...editValues, description: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '13px' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ez-color-text-body)', display: 'block', marginBottom: '4px' }}>
                  Volume
                </label>
                <input
                  type="number"
                  step="any"
                  value={editValues.volume}
                  onChange={(e) => setEditValues({ ...editValues, volume: parseFloat(e.target.value) || 0 })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '13px' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ez-color-text-body)', display: 'block', marginBottom: '4px' }}>
                  Satuan
                </label>
                <input
                  type="text"
                  value={editValues.unit}
                  onChange={(e) => setEditValues({ ...editValues, unit: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '13px' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ez-color-text-body)', display: 'block', marginBottom: '4px' }}>
                  Kode AHSP
                </label>
                <input
                  type="text"
                  value={editValues.ahspCode}
                  onChange={(e) => setEditValues({ ...editValues, ahspCode: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '13px' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ez-color-text-body)', display: 'block', marginBottom: '4px' }}>
                  Harga Satuan (Rp)
                </label>
                <input
                  type="number"
                  value={editValues.unitPrice}
                  onChange={(e) => setEditValues({ ...editValues, unitPrice: parseFloat(e.target.value) || 0 })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '13px' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setEditingRow(null)}
                style={{
                  background: 'var(--ez-color-surface-tertiary)',
                  color: 'var(--ez-color-text-slate)',
                  border: '1px solid var(--ez-hue-slate-border)',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  fontWeight: 650,
                  cursor: 'pointer',
                }}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                style={{
                  background: 'var(--ez-color-primary)',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '8px 18px',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Save size={14} />
                <span>Simpan Perubahan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 22 & 24: CONFIRMATION GATE & REVISION DIFF MODAL */}
      {isConfirmModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9998,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            style={{
              background: 'var(--ez-color-surface)',
              borderRadius: '16px',
              maxWidth: '560px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              border: '1px solid var(--ez-color-border-line)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--ez-hue-green-bg-deep)', color: 'var(--ez-hue-green-text-bright)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShieldCheck size={24} />
              </div>
              <div>
                <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)' }}>
                  Konfirmasi Penyimpanan ke RAB Proyek
                </span>
                <div style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)' }}>
                  Gerbang konfirmasi resmi: Data tidak akan disimpan tanpa persetujuan Anda.
                </div>
              </div>
            </div>

            <div style={{ background: 'var(--ez-color-surface-secondary)', border: '1px solid var(--ez-color-border-line)', borderRadius: 'var(--ez-radius-control)', padding: '16px' }}>
              <div style={{ fontSize: '12.5px', fontWeight: 750, color: 'var(--ez-color-text-strong)', marginBottom: '10px' }}>
                RINGKASAN REVISI RAB (DIFF)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px' }}>
                <div>
                  <span style={{ color: 'var(--ez-color-text-muted)' }}>Item Eksisting: </span>
                  <strong>{mutationDiff.existingItemsCount} item</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--ez-color-text-muted)' }}>Item DED Baru: </span>
                  <strong style={{ color: 'var(--ez-color-primary)' }}>+{mutationDiff.newItemsCount} item</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--ez-color-text-muted)' }}>Total Eksisting: </span>
                  <strong>{formatCurrencyIDR(mutationDiff.existingTotal)}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--ez-color-text-muted)' }}>Penambahan (Delta): </span>
                  <strong style={{ color: 'var(--ez-hue-green-text-bright)' }}>+{formatCurrencyIDR(mutationDiff.deltaTotal)}</strong>
                </div>
              </div>
              <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--ez-color-border-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>Perkiraan Total RAB Baru:</span>
                <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ez-hue-blue-text-deep)' }}>{formatCurrencyIDR(mutationDiff.newTotal)}</span>
              </div>
            </div>

            <div style={{ fontSize: '11.5px', color: 'var(--ez-color-text-muted)', lineHeight: 1.5 }}>
              Semua baris pekerjaan yang dikonfirmasi akan ditulis langsung ke database proyek resmi EZRAB dengan penandaan audit sumber berkas DED.
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                disabled={isCommiting}
                style={{
                  background: 'var(--ez-color-surface-tertiary)',
                  color: 'var(--ez-color-text-slate)',
                  border: '1px solid var(--ez-hue-slate-border)',
                  padding: '9px 18px',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  fontWeight: 650,
                  cursor: 'pointer',
                }}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmAndCommit}
                disabled={isCommiting}
                style={{
                  background: isCommiting ? '#94A3B8' : '#22C55E',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '10px 22px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 750,
                  cursor: isCommiting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 10px rgba(34,197,94,0.3)',
                }}
              >
                <Check size={16} />
                <span>{isCommiting ? 'Menyimpan...' : 'Ya, Konfirmasi & Tulis ke RAB'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

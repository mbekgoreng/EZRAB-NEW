import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Calculator,
  Compass,
  FileCode,
  Tag,
  Search,
  Filter,
  Layers,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  ArrowUpRight,
  X,
  ExternalLink,
  ShieldCheck,
  Edit2,
  Trash2,
  History,
  Check,
  FolderOpen,
  GitBranch,
  LayoutTemplate,
  Hash,
  Eye,
  AlertCircle,
  Database,
  ArrowRight
} from 'lucide-react';
import { DeterministicRabDraftSummary } from '../../domain/document/deterministicRabTypes';
import {
  RabReviewRowItem,
  ReviewCounts,
  SpreadsheetImportProposal,
  SpreadsheetImportResult,
  AuditLogEntry
} from '../../domain/document/reviewApprovalTypes';
import { SpreadsheetApprovalEngine } from '../../../server/services/spreadsheetApprovalEngine';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';
import { ALL_OFFICIAL_AHSP_ITEMS } from '../../data/nationalCostDatabase/masterRegistry';
// The canonical AHSP is price-free: an AHSP price may ONLY come from the price resolver.
import { priceResolver2026 } from '../../data/priceDatabase2026/resolver';
import { RABSection } from '../../types';

interface RabReviewWorkspaceModalViewProps {
  summary: DeterministicRabDraftSummary;
  projectId: string;
  projectName: string;
  workspaceId?: string;
  userId?: string;
  userName?: string;
  userPermissions?: string[];
  totalPages?: number;
  totalEntities?: number;
  onCommitSuccess?: (sections: RABSection[], grandTotal: number) => void;
  onClose?: () => void;
}

export const RabReviewWorkspaceModalView: React.FC<RabReviewWorkspaceModalViewProps> = ({
  summary,
  projectId,
  projectName,
  workspaceId = 'ws-default',
  userId = 'usr-admin',
  userName = 'Estimator Pro',
  userPermissions = ['AI_CREATE', 'AI_UPDATE'],
  totalPages = 1,
  totalEntities = 0,
  onCommitSuccess,
  onClose
}) => {
  const engine = useMemo(() => SpreadsheetApprovalEngine.getInstance(), []);

  // Items State with local user modifications
  const [items, setItems] = useState<RabReviewRowItem[]>(() =>
    engine.initializeReviewItems(summary)
  );

  // Sync items when summary prop changes
  React.useEffect(() => {
    if (summary && summary.items) {
      setItems(engine.initializeReviewItems(summary));
      if (summary.wbsSubtotals) {
        setExpandedWbs(new Set(Object.keys(summary.wbsSubtotals)));
      }
    }
  }, [summary, engine]);

  // Active Tab: 1. Doc Map | 2. Entities | 3. QTO | 4. WBS | 5. Draft RAB | 6. Findings | 7. Source Trace
  const [activeTab, setActiveTab] = useState<'doc_map' | 'entities' | 'qto' | 'wbs' | 'draft_rab' | 'findings' | 'source_trace'>('draft_rab');

  // Filter & Search
  const [activeFilter, setActiveFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedWbs, setExpandedWbs] = useState<Set<string>>(new Set(Object.keys(summary.wbsSubtotals)));

  // Selected Item for Deep Source Trace Drawer
  const [selectedItemForTrace, setSelectedItemForTrace] = useState<RabReviewRowItem | null>(null);

  // Selected Item for Audit Log Modal
  const [selectedItemForAudit, setSelectedItemForAudit] = useState<RabReviewRowItem | null>(null);

  // Edit Item Modal State
  const [editingItem, setEditingItem] = useState<RabReviewRowItem | null>(null);
  const [editVolume, setEditVolume] = useState<number>(0);
  const [editUnitPrice, setEditUnitPrice] = useState<number | null>(0);
  const [editUnit, setEditUnit] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');
  const [editAhspCode, setEditAhspCode] = useState<string>('');
  const [editReason, setEditReason] = useState<string>('');

  // Conflict Resolution Modal State
  const [conflictItem, setConflictItem] = useState<RabReviewRowItem | null>(null);
  const [conflictChosenVolume, setConflictChosenVolume] = useState<number>(0);
  const [conflictReason, setConflictReason] = useState<string>('');

  // AHSP Selection Modal State
  const [ahspPickerItem, setAhspPickerItem] = useState<RabReviewRowItem | null>(null);
  const [ahspSearch, setAhspSearch] = useState<string>('');

  // Final Approval Modal State
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitSuccess, setSubmitSuccess] = useState<SpreadsheetImportResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Calculate live review counts
  const reviewCounts: ReviewCounts = useMemo(() => {
    return engine.calculateReviewCounts(items, totalPages, totalEntities || summary.totalItems);
  }, [items, totalPages, totalEntities, summary.totalItems, engine]);

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (activeFilter === 'APPROVED' && item.status !== 'APPROVED') return false;
      if (activeFilter === 'NEEDS_REVIEW' && item.status !== 'NEEDS_REVIEW' && item.status !== 'WARNING') return false;
      if (activeFilter === 'CONFLICT' && item.status !== 'CONFLICT') return false;
      if (activeFilter === 'MISSING_AHSP' && item.ahspCode !== null && item.ahspCode !== '') return false;
      if (activeFilter === 'MISSING_PRICE' && item.unitPrice !== null && item.unitPrice > 0) return false;
      if (activeFilter === 'REJECTED' && item.status !== 'REJECTED' && !item.isExcluded) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          item.description.toLowerCase().includes(q) ||
          item.wbsCode.toLowerCase().includes(q) ||
          (item.ahspCode && item.ahspCode.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [items, activeFilter, searchQuery]);

  // Active non-excluded items total
  const activeItems = useMemo(() => items.filter(i => !i.isExcluded && i.status !== 'REJECTED'), [items]);
  // Rows with no resolvable price contribute nothing and are surfaced separately, so
  // the live subtotal is never inflated by a fabricated Rp 0.
  const unpricedActiveCount = useMemo(() => activeItems.filter(i => i.totalPrice === null).length, [activeItems]);
  const liveSubtotal = useMemo(
    () => activeItems.reduce((acc, i) => (i.totalPrice === null ? acc : acc + i.totalPrice), 0),
    [activeItems]
  );
  const livePpn = useMemo(() => Math.round(liveSubtotal * 0.11), [liveSubtotal]);
  const liveGrandTotal = useMemo(() => liveSubtotal + livePpn, [liveSubtotal, livePpn]);

  // Toggle group expansion
  const toggleWbs = (code: string) => {
    setExpandedWbs(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  // Action Handlers
  const handleApprove = (itemId: string) => {
    const updated = engine.approveItem(items, itemId, userName);
    setItems(updated);
  };

  const handleOpenEdit = (item: RabReviewRowItem) => {
    setEditingItem(item);
    setEditVolume(item.volume);
    setEditUnitPrice(item.unitPrice);
    setEditUnit(item.unit);
    setEditDescription(item.description);
    setEditAhspCode(item.ahspCode || '');
    setEditReason('');
  };

  const handleSaveEdit = () => {
    if (!editingItem) return;
    const updated = engine.editItem(
      items,
      editingItem.rabDraftItemId,
      {
        volume: editVolume,
        unitPrice: editUnitPrice,
        unit: editUnit,
        description: editDescription,
        ahspCode: editAhspCode || null
      },
      userName,
      editReason || 'Penyesuaian estimasi estimator'
    );
    setItems(updated);
    setEditingItem(null);
  };

  const handleReject = (itemId: string) => {
    const updated = engine.rejectItem(items, itemId, userName, 'Dikecualikan dari lingkup pekerjaan proyek');
    setItems(updated);
  };

  const handleOpenConflict = (item: RabReviewRowItem) => {
    setConflictItem(item);
    setConflictChosenVolume(item.volume);
    setConflictReason('Menggunakan dimensi dari gambar detail arsitektur');
  };

  const handleSaveConflict = () => {
    if (!conflictItem) return;
    const updated = engine.resolveConflict(
      items,
      conflictItem.rabDraftItemId,
      conflictChosenVolume,
      userName,
      conflictReason || 'Resolusi perbedaan dimensi antar gambar DED'
    );
    setItems(updated);
    setConflictItem(null);
  };

  const handleSelectAhspFromDb = (ahspCode: string, ahspName: string, price: number | null) => {
    if (!ahspPickerItem) return;
    const updated = engine.editItem(
      items,
      ahspPickerItem.rabDraftItemId,
      {
        ahspCode,
        description: ahspPickerItem.description || ahspName,
        // Fail closed: choosing an unpriced AHSP clears the price (it becomes flagged)
        // instead of silently keeping a stale number.
        unitPrice: price === null || price <= 0 ? null : price
      },
      userName,
      `Memilih AHSP resmi PUPR: ${ahspCode}`
    );
    setItems(updated);
    setAhspPickerItem(null);
  };

  const handleFinalSubmitToSpreadsheet = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const proposal = engine.prepareProposal({
        projectId,
        workspaceId,
        userId,
        userName,
        items,
        draftVersion: summary.rabDraftId || 'v1.0.0',
        ppnPercent: 11
      });

      const result = await engine.executeImportToSpreadsheet({
        proposal,
        authoritativeProjectId: projectId,
        authoritativeWorkspaceId: workspaceId,
        userPermissions,
        onCommitSuccess: (sections, grandTotal) => {
          if (onCommitSuccess) {
            onCommitSuccess(sections, grandTotal);
          }
        }
      });

      setSubmitSuccess(result);
      setTimeout(() => {
        if (onClose) onClose();
      }, 1500);
    } catch (err: any) {
      setSubmitError(err?.message || 'Gagal menerapkan data ke Spreadsheet');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Group items by WBS code
  const wbsGroups = useMemo(() => {
    const map = new Map<string, { wbsCode: string; wbsTitle: string; items: RabReviewRowItem[]; subtotal: number }>();
    for (const item of filteredItems) {
      const code = item.wbsCode || '01';
      if (!map.has(code)) {
        map.set(code, { wbsCode: code, wbsTitle: item.wbsTitle || `Pekerjaan ${code}`, items: [], subtotal: 0 });
      }
      const g = map.get(code)!;
      g.items.push(item);
      if (!item.isExcluded && item.status !== 'REJECTED' && item.totalPrice !== null) {
        g.subtotal += item.totalPrice;
      }
    }
    return Array.from(map.values());
  }, [filteredItems]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', color: '#1E293B', padding: '16px' }}>
      
      {/* 1. TOP HEADER & REVIEW COUNTS SUMMARY (CLEAN LIGHT STYLE) */}
      <div
        style={{
          background: '#FFFFFF',
          color: '#111827',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)',
          border: '1px solid #E5E7EB',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span
                style={{
                  padding: '3px 10px',
                  borderRadius: '999px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  backgroundColor: '#F0FDF4',
                  color: '#16A34A',
                  border: '1px solid #DCFCE7',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <ShieldCheck size={14} />
                <span>DED → RAB Review Workspace</span>
              </span>
              <span
                style={{
                  padding: '3px 8px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  backgroundColor: '#EFF6FF',
                  color: '#2563EB',
                  border: '1px solid #DBEAFE',
                }}
              >
                Approval Gate
              </span>
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#111827', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
              Review & Persetujuan RAB: {projectName}
            </h2>
            <p style={{ fontSize: '13px', color: '#64748B', margin: 0, lineHeight: 1.5, maxWidth: '680px' }}>
              Evaluasi hasil analisis DED, lakukan koreksi, selesaikan temuan/konflik, dan setujui untuk diekspor ke Spreadsheet Utama.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div
              style={{
                backgroundColor: '#F8FAFC',
                padding: '10px 18px',
                borderRadius: '12px',
                border: '1px solid #E5E7EB',
                textAlign: 'center',
              }}
            >
              <span style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748B', display: 'block', fontWeight: 600 }}>
                Grand Total RAB
              </span>
              <span style={{ fontSize: '20px', fontWeight: 800, color: '#16A34A', fontFamily: 'monospace' }}>
                {formatCurrencyIDR(liveGrandTotal)}
              </span>
            </div>

            <button
              onClick={() => setShowConfirmModal(true)}
              style={{
                padding: '11px 20px',
                backgroundColor: '#10B981',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: '12.5px',
                borderRadius: '10px',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 150ms ease',
              }}
            >
              <ShieldCheck size={16} />
              <span>Approve & Terapkan ke Spreadsheet</span>
            </button>
          </div>
        </div>

        {/* 9 REVIEW METRICS GRID */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
            gap: '8px',
            marginTop: '20px',
            paddingTop: '16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            textAlign: 'center',
          }}
        >
          {[
            { label: 'Total Pages', val: reviewCounts.totalPages, col: '#FFFFFF' },
            { label: 'Total Entities', val: reviewCounts.totalEntities, col: '#FFFFFF' },
            { label: 'Mapped', val: reviewCounts.mappedCount, col: '#34D399' },
            { label: 'Unmapped', val: reviewCounts.unmappedCount, col: '#94A3B8' },
            { label: 'Needs Review', val: reviewCounts.needsReviewCount, col: '#FBBF24' },
            { label: 'Conflicts', val: reviewCounts.conflictsCount, col: '#F87171' },
            { label: 'Missing AHSP', val: reviewCounts.missingAhspCount, col: '#FBBF24' },
            { label: 'Missing Price', val: reviewCounts.missingPriceCount, col: '#F87171' },
            { label: 'Duplicates', val: reviewCounts.duplicateCandidatesCount, col: '#C084FC' },
          ].map((m, idx) => (
            <div
              key={idx}
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.55)',
                padding: '10px 8px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.07)',
              }}
            >
              <span style={{ fontSize: '10px', color: '#94A3B8', display: 'block', fontWeight: 600 }}>{m.label}</span>
              <span style={{ fontSize: '15px', fontWeight: 800, color: m.col, marginTop: '2px', display: 'block' }}>{m.val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 2. 7-TAB WORKSPACE NAVIGATION */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          borderBottom: '1px solid #E2E8F0',
          paddingBottom: '6px',
          overflowX: 'auto',
        }}
      >
        {[
          { id: 'doc_map', label: '1. Document Map', icon: FolderOpen },
          { id: 'entities', label: '2. Entities', icon: Layers },
          { id: 'qto', label: '3. QTO', icon: Hash },
          { id: 'wbs', label: '4. WBS', icon: LayoutTemplate },
          { id: 'draft_rab', label: '5. Draft RAB', icon: FileSpreadsheet },
          { id: 'findings', label: '6. Findings', icon: AlertTriangle },
          { id: 'source_trace', label: '7. Source Trace', icon: Compass }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: isActive ? 700 : 550,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                transition: 'all 140ms ease',
                flexShrink: 0,
                backgroundColor: isActive ? '#4F46E5' : '#FFFFFF',
                color: isActive ? '#FFFFFF' : '#475569',
                border: `1px solid ${isActive ? '#4F46E5' : '#E2E8F0'}`,
                boxShadow: isActive ? '0 2px 6px rgba(79, 70, 229, 0.25)' : 'none',
              }}
            >
              <Icon size={14} color={isActive ? '#FFFFFF' : '#64748B'} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 3. TAB CONTENT VIEWS */}
      {activeTab === 'draft_rab' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Filter & Search Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              backgroundColor: '#FFFFFF',
              padding: '12px 16px',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto' }}>
              <Filter size={15} color="#64748B" style={{ marginRight: '4px', flexShrink: 0 }} />
              {(['ALL', 'APPROVED', 'NEEDS_REVIEW', 'CONFLICT', 'MISSING_AHSP', 'MISSING_PRICE', 'REJECTED'] as const).map(f => {
                const isSelected = activeFilter === f;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setActiveFilter(f)}
                    style={{
                      fontSize: '11.5px',
                      padding: '5px 11px',
                      borderRadius: '6px',
                      fontWeight: isSelected ? 700 : 600,
                      cursor: 'pointer',
                      border: 'none',
                      backgroundColor: isSelected ? '#4F46E5' : '#F1F5F9',
                      color: isSelected ? '#FFFFFF' : '#475569',
                      transition: 'all 120ms ease',
                      flexShrink: 0,
                    }}
                  >
                    {f}
                  </button>
                );
              })}
            </div>

            <div style={{ position: 'relative', width: '250px' }}>
              <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '10px' }} />
              <input
                type="text"
                placeholder="Cari uraian, WBS, AHSP..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  padding: '7px 12px 7px 32px',
                  fontSize: '12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  width: '100%',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* 12-COLUMN RAB REVIEW TABLE */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {wbsGroups.map(group => {
              const isExp = expandedWbs.has(group.wbsCode);
              return (
                <div
                  key={group.wbsCode}
                  style={{
                    border: '1px solid #E2E8F0',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    backgroundColor: '#FFFFFF',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  }}
                >
                  {/* Group Header Accordion */}
                  <div
                    onClick={() => toggleWbs(group.wbsCode)}
                    style={{
                      padding: '12px 16px',
                      backgroundColor: '#F8FAFC',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottom: isExp ? '1px solid #E2E8F0' : 'none',
                      transition: 'background-color 120ms ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {isExp ? <ChevronDown size={16} color="#64748B" /> : <ChevronRight size={16} color="#64748B" />}
                      <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#4338CA', fontSize: '12.5px' }}>
                        {group.wbsCode}
                      </span>
                      <span style={{ fontWeight: 700, color: '#0F172A', fontSize: '13px', textTransform: 'uppercase' }}>
                        {group.wbsTitle}
                      </span>
                      <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>
                        ({group.items.length} item)
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '12px', color: '#64748B' }}>Subtotal:</span>
                      <span style={{ fontWeight: 800, fontSize: '13px', color: '#0F172A', fontFamily: 'monospace' }}>
                        {formatCurrencyIDR(group.subtotal)}
                      </span>
                    </div>
                  </div>

                  {/* 12-Column Items Table */}
                  {isExp && (
                    <div style={{ overflowX: 'auto', width: '100%' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                        <thead style={{ backgroundColor: '#F1F5F9', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: '11px', fontWeight: 700 }}>
                          <tr>
                            <th style={{ padding: '10px 8px', textAlign: 'center', width: '36px' }}>No</th>
                            <th style={{ padding: '10px 8px', width: '50px' }}>WBS</th>
                            <th style={{ padding: '10px 10px', width: '120px' }}>Kode AHSP</th>
                            <th style={{ padding: '10px 12px', minWidth: '180px' }}>Uraian Pekerjaan</th>
                            <th style={{ padding: '10px 8px', textAlign: 'right', width: '70px' }}>Volume</th>
                            <th style={{ padding: '10px 8px', textAlign: 'center', width: '50px' }}>Sat</th>
                            <th style={{ padding: '10px 10px', textAlign: 'right', width: '100px' }}>Harga Satuan</th>
                            <th style={{ padding: '10px 12px', textAlign: 'right', width: '110px' }}>Jumlah (Rp)</th>
                            <th style={{ padding: '10px 8px', textAlign: 'center', width: '90px' }}>Sumber</th>
                            <th style={{ padding: '10px 8px', textAlign: 'center', width: '90px' }}>Status</th>
                            <th style={{ padding: '10px 8px', textAlign: 'center', width: '50px' }}>Trace</th>
                            <th style={{ padding: '10px 10px', textAlign: 'center', width: '120px' }}>Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.items.map((item, index) => {
                            const isExcluded = item.isExcluded || item.status === 'REJECTED';
                            return (
                              <tr
                                key={item.rabDraftItemId}
                                style={{
                                  borderBottom: '1px solid #F1F5F9',
                                  backgroundColor: isExcluded ? '#F8FAFC' : '#FFFFFF',
                                  color: isExcluded ? '#94A3B8' : '#1E293B',
                                  textDecoration: isExcluded ? 'line-through' : 'none',
                                }}
                              >
                                <td style={{ padding: '10px 8px', textAlign: 'center', fontFamily: 'monospace', color: '#64748B' }}>
                                  {index + 1}
                                </td>
                                <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontWeight: 700, color: '#4338CA' }}>
                                  {item.wbsCode}
                                </td>
                                
                                {/* Kode AHSP */}
                                <td style={{ padding: '10px 10px' }}>
                                  {item.ahspCode ? (
                                    <button
                                      type="button"
                                      onClick={() => setAhspPickerItem(item)}
                                      style={{
                                        fontFamily: 'monospace',
                                        color: '#4338CA',
                                        fontWeight: 600,
                                        backgroundColor: '#EEF2FF',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        border: '1px solid #C7D2FE',
                                        fontSize: '11px',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        maxWidth: '120px',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                      }}
                                      title="Klik untuk mengganti AHSP"
                                    >
                                      {item.ahspCode}
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setAhspPickerItem(item)}
                                      style={{
                                        fontSize: '10.5px',
                                        color: '#D97706',
                                        backgroundColor: '#FEF3C7',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        border: '1px solid #FDE68A',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      + Pilih AHSP
                                    </button>
                                  )}
                                </td>

                                {/* Uraian Pekerjaan */}
                                <td style={{ padding: '10px 12px' }}>
                                  <div style={{ fontWeight: 650, color: isExcluded ? '#94A3B8' : '#0F172A' }}>
                                    {item.description}
                                  </div>
                                  <div style={{ fontSize: '10.5px', color: '#64748B', fontFamily: 'monospace', marginTop: '2px' }}>
                                    {item.calculationFormula}
                                  </div>
                                </td>

                                {/* Volume */}
                                <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                                  {item.volume.toLocaleString('id-ID', { maximumFractionDigits: 3 })}
                                </td>

                                {/* Satuan */}
                                <td style={{ padding: '10px 8px', textAlign: 'center', color: '#64748B', fontWeight: 600 }}>
                                  {item.unit}
                                </td>

                                {/* Harga Satuan */}
                                <td style={{ padding: '10px 10px', textAlign: 'right', fontFamily: 'monospace' }}>
                                  {formatCurrencyIDR(item.unitPrice)}
                                </td>

                                {/* Jumlah Biaya */}
                                <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: isExcluded ? '#94A3B8' : '#0F172A' }}>
                                  {formatCurrencyIDR(item.totalPrice)}
                                </td>

                                {/* Sumber */}
                                <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                  <span
                                    style={{
                                      fontSize: '10px',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      fontWeight: 600,
                                      backgroundColor: '#F1F5F9',
                                      color: '#475569',
                                      border: '1px solid #E2E8F0',
                                    }}
                                  >
                                    {item.sourceTrace.primaryDrawingNumber || 'DED'}
                                  </span>
                                </td>

                                {/* Status */}
                                <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                  {item.status === 'APPROVED' ? (
                                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', backgroundColor: '#DCFCE7', color: '#15803D', border: '1px solid #BBF7D0' }}>
                                      APPROVED
                                    </span>
                                  ) : item.status === 'CONFLICT' ? (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenConflict(item)}
                                      style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', backgroundColor: '#FEE2E2', color: '#B91C1C', border: '1px solid #FECACA', cursor: 'pointer' }}
                                    >
                                      CONFLICT ⚠
                                    </button>
                                  ) : item.status === 'REJECTED' || isExcluded ? (
                                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', backgroundColor: '#F1F5F9', color: '#64748B' }}>
                                      EXCLUDED
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', backgroundColor: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A' }}>
                                      {item.status}
                                    </span>
                                  )}
                                </td>

                                {/* Source Trace */}
                                <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedItemForTrace(item)}
                                    title="Lihat Source Traceability"
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#4F46E5',
                                      cursor: 'pointer',
                                      padding: '4px',
                                      borderRadius: '4px',
                                    }}
                                  >
                                    <Compass size={15} />
                                  </button>
                                </td>

                                {/* Actions */}
                                <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                    {item.status !== 'APPROVED' && !isExcluded && (
                                      <button
                                        type="button"
                                        onClick={() => handleApprove(item.rabDraftItemId)}
                                        title="Setujui Item"
                                        style={{ background: '#DCFCE7', border: '1px solid #BBF7D0', color: '#15803D', borderRadius: '5px', padding: '4px', cursor: 'pointer' }}
                                      >
                                        <Check size={13} strokeWidth={3} />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEdit(item)}
                                      title="Edit Parameter"
                                      style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#2563EB', borderRadius: '5px', padding: '4px', cursor: 'pointer' }}
                                    >
                                      <Edit2 size={13} />
                                    </button>
                                    {!isExcluded ? (
                                      <button
                                        type="button"
                                        onClick={() => handleReject(item.rabDraftItemId)}
                                        title="Tolak / Kecualikan"
                                        style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: '5px', padding: '4px', cursor: 'pointer' }}
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleApprove(item.rabDraftItemId)}
                                        style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#2563EB', fontSize: '10px', fontWeight: 700, borderRadius: '4px', padding: '2px 6px', cursor: 'pointer' }}
                                      >
                                        Restore
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => setSelectedItemForAudit(item)}
                                      title="Riwayat Audit"
                                      style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#64748B', borderRadius: '5px', padding: '4px', cursor: 'pointer' }}
                                    >
                                      <History size={13} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}

            {wbsGroups.length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '48px 24px',
                  backgroundColor: '#FFFFFF',
                  borderRadius: '12px',
                  border: '1px dashed #CBD5E1',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                }}
              >
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: '#EEF2FF', color: '#4F46E5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px auto' }}>
                  <FileSpreadsheet size={24} />
                </div>
                <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', margin: '0 0 6px 0' }}>
                  Tidak Ada Item RAB Draft untuk Filter Ini
                </h4>
                <p style={{ fontSize: '12.5px', color: '#64748B', maxWidth: '440px', margin: '0 auto', lineHeight: 1.5 }}>
                  {searchQuery || activeFilter !== 'ALL'
                    ? 'Item yang cocok dengan filter atau kata kunci pencarian tidak ditemukan. Coba sesuaikan filter status atau reset pencarian.'
                    : 'Belum ada item RAB draft yang dimuat. Jalankan analisis DED pada langkah 3 atau muat dokumen contoh.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* OTHER TABS */}
      {activeTab === 'doc_map' && (
        <div style={{ backgroundColor: '#FFFFFF', padding: '24px', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FolderOpen size={16} color="#4F46E5" />
            <span>Whole Document Map & Page Roles</span>
          </h3>
          <p style={{ fontSize: '12px', color: '#64748B', marginBottom: '16px' }}>
            Struktur set dokumen DED yang terpetakan: {reviewCounts.totalPages} halaman terindeks.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
            {summary.items.slice(0, 8).map((itm, i) => (
              <div key={i} style={{ padding: '12px', backgroundColor: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '12px' }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#4338CA', display: 'block', marginBottom: '2px' }}>
                  {itm.sourceTrace.primaryDrawingNumber}
                </span>
                <span style={{ fontWeight: 650, color: '#0F172A', display: 'block', marginBottom: '4px' }}>
                  {itm.description}
                </span>
                <span style={{ fontSize: '10.5px', color: '#64748B' }}>
                  Halaman Dokumen: {itm.sourceTrace.primaryPageNumber}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'entities' && (
        <div style={{ backgroundColor: '#FFFFFF', padding: '24px', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={16} color="#4F46E5" />
            <span>Canonical Construction Entities ({items.length})</span>
          </h3>
          <p style={{ fontSize: '12px', color: '#64748B', marginBottom: '16px' }}>
            Entitas kanonikal fisik hasil resolusi anti-duplikasi:
          </p>
          <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
            {items.map((item, idx) => (
              <div
                key={item.rabDraftItemId}
                style={{
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: idx < items.length - 1 ? '1px solid #F1F5F9' : 'none',
                  backgroundColor: '#FFFFFF',
                  fontSize: '12.5px',
                }}
              >
                <div>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#4338CA', marginRight: '8px' }}>{item.entityId}</span>
                  <span style={{ fontWeight: 600, color: '#0F172A' }}>{item.description}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#334155' }}>{item.volume} {item.unit}</span>
                  <span style={{ fontSize: '10px', fontWeight: 700, backgroundColor: '#DCFCE7', color: '#15803D', padding: '2px 8px', borderRadius: '999px' }}>
                    RESOLVED
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'qto' && (
        <div style={{ backgroundColor: '#FFFFFF', padding: '24px', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Hash size={16} color="#4F46E5" />
            <span>Deterministic Quantity Takeoff Formulas</span>
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {items.map(item => (
              <div
                key={item.rabDraftItemId}
                style={{
                  padding: '12px 16px',
                  backgroundColor: '#F8FAFC',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>{item.description}</div>
                  <div style={{ fontFamily: 'monospace', color: '#4338CA', fontSize: '11px', marginTop: '2px' }}>{item.calculationFormula}</div>
                </div>
                <div style={{ fontFamily: 'monospace', fontWeight: 800, color: '#0F172A', fontSize: '13.5px' }}>
                  {item.volume} {item.unit}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'wbs' && (
        <div style={{ backgroundColor: '#FFFFFF', padding: '24px', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <LayoutTemplate size={16} color="#4F46E5" />
            <span>Adaptive WBS Hierarchy</span>
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {wbsGroups.map(group => (
              <div
                key={group.wbsCode}
                style={{
                  padding: '14px 18px',
                  backgroundColor: '#EEF2FF',
                  borderRadius: '10px',
                  border: '1px solid #C7D2FE',
                  fontSize: '12.5px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 700, color: '#312E81' }}>
                  <span>{group.wbsCode} - {group.wbsTitle}</span>
                  <span style={{ fontFamily: 'monospace' }}>{formatCurrencyIDR(group.subtotal)}</span>
                </div>
                <div style={{ fontSize: '11px', color: '#4338CA', marginTop: '4px' }}>
                  {group.items.length} item pekerjaan terpetakan
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'findings' && (
        <div style={{ backgroundColor: '#FFFFFF', padding: '24px', borderRadius: '16px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} color="#D97706" />
            <span>Review Findings & Validation Audit</span>
          </h3>
          {items.flatMap(i => (i.notes || []).map(n => ({ item: i, note: n }))).map((finding, idx) => (
            <div
              key={idx}
              style={{
                padding: '12px 16px',
                backgroundColor: '#FFFBEB',
                borderRadius: '10px',
                border: '1px solid #FDE68A',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                fontSize: '12px',
              }}
            >
              <div>
                <span style={{ fontWeight: 700, color: '#92400E', display: 'block', marginBottom: '2px' }}>
                  {finding.item.description} ({finding.item.wbsCode})
                </span>
                <span style={{ color: '#B45309' }}>{finding.note}</span>
              </div>
              <button
                type="button"
                onClick={() => handleOpenEdit(finding.item)}
                style={{
                  padding: '4px 10px',
                  backgroundColor: '#D97706',
                  color: '#FFFFFF',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '10.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  marginLeft: '12px',
                  flexShrink: 0,
                }}
              >
                Koreksi
              </button>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'source_trace' && (
        <div style={{ backgroundColor: '#FFFFFF', padding: '24px', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Compass size={16} color="#4F46E5" />
            <span>Source Traceability Inspector</span>
          </h3>
          <p style={{ fontSize: '12px', color: '#64748B', marginBottom: '16px' }}>
            Pilih baris untuk melihat rincian bukti gambar teknis DED:
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
            {items.map(item => (
              <div
                key={item.rabDraftItemId}
                onClick={() => setSelectedItemForTrace(item)}
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  backgroundColor: '#F8FAFC',
                  cursor: 'pointer',
                  transition: 'all 120ms ease',
                  fontSize: '12px',
                }}
              >
                <div style={{ fontWeight: 700, color: '#0F172A' }}>{item.description}</div>
                <div style={{ fontSize: '11px', color: '#4338CA', fontFamily: 'monospace', marginTop: '4px' }}>
                  Gambar: {item.sourceTrace.sourceDrawings.join(', ')} | Hal: {item.sourceTrace.sourcePages.join(', ')}
                </div>
                <div style={{ fontSize: '10.5px', color: '#64748B', fontFamily: 'monospace', marginTop: '2px' }}>
                  {item.calculationFormula}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. SOURCE TRACEABILITY DRAWER */}
      {selectedItemForTrace && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '520px',
              backgroundColor: '#FFFFFF',
              height: '100%',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              padding: '24px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxSizing: 'border-box',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid #E2E8F0', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Compass size={18} color="#4F46E5" />
                  <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    Source Traceability
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedItemForTrace(null)}
                  style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: '4px' }}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '12px' }}>
                <div style={{ backgroundColor: '#EEF2FF', padding: '14px', borderRadius: '10px', border: '1px solid #C7D2FE' }}>
                  <span style={{ fontSize: '10.5px', color: '#4338CA', fontWeight: 800, textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                    RAB Work Item
                  </span>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A' }}>{selectedItemForTrace.description}</div>
                  <div style={{ color: '#475569', marginTop: '4px' }}>
                    WBS: <strong>{selectedItemForTrace.wbsCode}</strong> | AHSP: <strong>{selectedItemForTrace.ahspCode || 'None'}</strong>
                  </div>
                </div>

                <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontWeight: 700, color: '#0F172A', display: 'block' }}>Drawing & Evidence Pointers</span>
                  <div>
                    <span style={{ color: '#64748B', fontSize: '11px', display: 'block' }}>Primary Drawing:</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#4338CA' }}>{selectedItemForTrace.sourceTrace.primaryDrawingNumber}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748B', fontSize: '11px', display: 'block' }}>Drawing References:</span>
                    <span style={{ fontFamily: 'monospace', color: '#334155' }}>{selectedItemForTrace.sourceTrace.sourceDrawings.join(', ')}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748B', fontSize: '11px', display: 'block' }}>Halaman Dokumen:</span>
                    <span style={{ fontFamily: 'monospace', color: '#334155' }}>Halaman {selectedItemForTrace.sourceTrace.sourcePages.join(', ')}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748B', fontSize: '11px', display: 'block' }}>Total Evidences:</span>
                    <span style={{ fontWeight: 700, color: '#0F172A' }}>{selectedItemForTrace.sourceTrace.evidenceCount} Titik Bukti</span>
                  </div>
                </div>

                <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: '#F8FAFC' }}>
                  <span style={{ fontWeight: 700, color: '#0F172A', display: 'block' }}>Deterministic Calculation</span>
                  <div>
                    <span style={{ color: '#64748B', fontSize: '11px', display: 'block' }}>Rumus Geometri:</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#15803D' }}>{selectedItemForTrace.calculationFormula}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748B', fontSize: '11px', display: 'block' }}>Volume Terhitung:</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#0F172A' }}>{selectedItemForTrace.volume} {selectedItemForTrace.unit}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748B', fontSize: '11px', display: 'block' }}>Harga Satuan:</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0F172A' }}>{formatCurrencyIDR(selectedItemForTrace.unitPrice)}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748B', fontSize: '11px', display: 'block' }}>Total Biaya Item:</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 900, color: '#15803D', fontSize: '14px' }}>{formatCurrencyIDR(selectedItemForTrace.totalPrice)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ paddingTop: '16px', borderTop: '1px solid #E2E8F0' }}>
              <button
                type="button"
                onClick={() => setSelectedItemForTrace(null)}
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: '#0F172A',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '12px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Tutup Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. EDIT ITEM MODAL */}
      {editingItem && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              border: '1px solid #E2E8F0',
              maxWidth: '460px',
              width: '100%',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              fontSize: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid #E2E8F0' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Edit Parameter Pekerjaan
              </h3>
              <button type="button" onClick={() => setEditingItem(null)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', color: '#475569', fontWeight: 600, marginBottom: '4px' }}>Uraian Pekerjaan</label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '12px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', color: '#475569', fontWeight: 600, marginBottom: '4px' }}>Volume</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editVolume}
                    onChange={(e) => setEditVolume(parseFloat(e.target.value) || 0)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '12px', fontFamily: 'monospace', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', color: '#475569', fontWeight: 600, marginBottom: '4px' }}>Satuan</label>
                  <input
                    type="text"
                    value={editUnit}
                    onChange={(e) => setEditUnit(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '12px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', color: '#475569', fontWeight: 600, marginBottom: '4px' }}>Harga Satuan (Rp)</label>
                <input
                  type="number"
                  placeholder="Belum ada harga"
                  value={editUnitPrice ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') { setEditUnitPrice(null); return; }
                    const parsed = parseFloat(raw);
                    setEditUnitPrice(Number.isFinite(parsed) ? parsed : null);
                  }}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '12px', fontFamily: 'monospace', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#475569', fontWeight: 600, marginBottom: '4px' }}>Kode AHSP</label>
                <input
                  type="text"
                  value={editAhspCode}
                  onChange={(e) => setEditAhspCode(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '12px', fontFamily: 'monospace', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#475569', fontWeight: 600, marginBottom: '4px' }}>Alasan Perubahan (Audit Log)</label>
                <input
                  type="text"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="Contoh: Revisi volume sesuai addendum..."
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '12px', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', paddingTop: '12px', borderTop: '1px solid #E2E8F0' }}>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                style={{ padding: '8px 14px', color: '#475569', backgroundColor: '#F1F5F9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                style={{ padding: '8px 16px', backgroundColor: '#4F46E5', color: '#FFFFFF', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}
              >
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. CONFLICT RESOLUTION MODAL */}
      {conflictItem && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              border: '1px solid #E2E8F0',
              maxWidth: '460px',
              width: '100%',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              fontSize: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid #E2E8F0' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#B91C1C', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertTriangle size={16} color="#DC2626" />
                <span>Resolusi Konflik Dimensi</span>
              </h3>
              <button type="button" onClick={() => setConflictItem(null)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <p style={{ color: '#475569', margin: 0 }}>
              Terdapat perbedaan dimensi atau kuantitas antar gambar DED untuk item <strong>{conflictItem.description}</strong>.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', color: '#475569', fontWeight: 600, marginBottom: '4px' }}>Volume yang Disepakati</label>
                <input
                  type="number"
                  step="0.01"
                  value={conflictChosenVolume}
                  onChange={(e) => setConflictChosenVolume(parseFloat(e.target.value) || 0)}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '12px', fontFamily: 'monospace', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#475569', fontWeight: 600, marginBottom: '4px' }}>Alasan Pemilihan Dimensi</label>
                <textarea
                  value={conflictReason}
                  onChange={(e) => setConflictReason(e.target.value)}
                  rows={2}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '12px', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', paddingTop: '12px', borderTop: '1px solid #E2E8F0' }}>
              <button type="button" onClick={() => setConflictItem(null)} style={{ padding: '8px 14px', color: '#475569', backgroundColor: '#F1F5F9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
                Batal
              </button>
              <button type="button" onClick={handleSaveConflict} style={{ padding: '8px 16px', backgroundColor: '#DC2626', color: '#FFFFFF', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>
                Selesaikan Konflik
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. AHSP PICKER MODAL */}
      {ahspPickerItem && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              border: '1px solid #E2E8F0',
              maxWidth: '560px',
              width: '100%',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              fontSize: '12px',
              maxHeight: '80vh',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid #E2E8F0' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Database size={16} color="#4F46E5" />
                <span>Pilih AHSP Resmi PUPR</span>
              </h3>
              <button type="button" onClick={() => setAhspPickerItem(null)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ position: 'relative' }}>
              <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '10px' }} />
              <input
                type="text"
                placeholder="Cari kode atau nama AHSP resmi..."
                value={ahspSearch}
                onChange={(e) => setAhspSearch(e.target.value)}
                style={{ padding: '8px 12px 8px 32px', fontSize: '12px', borderRadius: '8px', border: '1px solid #CBD5E1', width: '100%', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px' }}>
              {ALL_OFFICIAL_AHSP_ITEMS.filter(a =>
                !ahspSearch ||
                a.code.toLowerCase().includes(ahspSearch.toLowerCase()) ||
                a.name.toLowerCase().includes(ahspSearch.toLowerCase())
              ).slice(0, 30).map((ahsp, i) => {
                const ahspPrice = priceResolver2026.resolveAhspUnitPrice(ahsp as any).unitPrice;
                return (
                <div
                  key={i}
                  onClick={() => handleSelectAhspFromDb(ahsp.code, ahsp.name, ahspPrice)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #F1F5F9',
                    transition: 'all 120ms ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#EEF2FF')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
                >
                  <div>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#4338CA', display: 'block' }}>{ahsp.code}</span>
                    <span style={{ fontWeight: 600, color: '#0F172A' }}>{ahsp.name}</span>
                    <span style={{ fontSize: '10px', color: '#64748B', display: 'block' }}>{ahsp.domain} | {ahsp.unit}</span>
                  </div>
                  <div style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#15803D' }}>
                    {formatCurrencyIDR(ahspPrice)}
                  </div>
                </div>
                );
              })}
            </div>

            <div style={{ paddingTop: '12px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setAhspPickerItem(null)} style={{ padding: '8px 16px', color: '#475569', backgroundColor: '#F1F5F9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. AUDIT LOG MODAL */}
      {selectedItemForAudit && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              border: '1px solid #E2E8F0',
              maxWidth: '500px',
              width: '100%',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              fontSize: '12px',
              maxHeight: '80vh',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid #E2E8F0' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <History size={16} color="#4F46E5" />
                <span>Riwayat Audit Perubahan</span>
              </h3>
              <button type="button" onClick={() => setSelectedItemForAudit(null)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ backgroundColor: '#F8FAFC', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <span style={{ fontWeight: 700, color: '#0F172A', display: 'block' }}>{selectedItemForAudit.description}</span>
              <span style={{ fontSize: '11px', color: '#64748B', fontFamily: 'monospace' }}>WBS: {selectedItemForAudit.wbsCode} | ID: {selectedItemForAudit.rabDraftItemId}</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {selectedItemForAudit.auditHistory.map(entry => (
                <div key={entry.id} style={{ padding: '10px 12px', backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace', fontWeight: 700, fontSize: '10px', backgroundColor: '#EEF2FF', color: '#4338CA' }}>
                      {entry.action}
                    </span>
                    <span style={{ fontSize: '10px', color: '#94A3B8' }}>{new Date(entry.timestamp).toLocaleString('id-ID')}</span>
                  </div>
                  <div style={{ color: '#334155' }}>Oleh: <strong>{entry.actor}</strong></div>
                  {entry.notes && <div style={{ color: '#64748B', fontSize: '11px', fontStyle: 'italic' }}>{entry.notes}</div>}
                  {entry.reason && <div style={{ color: '#64748B', fontSize: '11px', fontStyle: 'italic' }}>Alasan: {entry.reason}</div>}
                </div>
              ))}
            </div>

            <div style={{ paddingTop: '12px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setSelectedItemForAudit(null)} style={{ padding: '8px 16px', color: '#475569', backgroundColor: '#F1F5F9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. CONFIRMATION MODAL TO SPREADSHEET */}
      {showConfirmModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '20px',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              border: '1px solid #E2E8F0',
              maxWidth: '520px',
              width: '100%',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              fontSize: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={20} color="#10B981" />
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Konfirmasi Finalisasi ke Spreadsheet
                </h3>
              </div>
              <button type="button" onClick={() => setShowConfirmModal(false)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <p style={{ color: '#475569', fontSize: '12.5px', lineHeight: 1.6, margin: 0 }}>
              Anda akan menerapkan draf hasil telaah DED ke lembar kerja Spreadsheet RAB definitif. Seluruh baris pekerjaan aktif akan dikonversi menjadi struktur WBS dan RAB resmi.
            </p>

            <div style={{ backgroundColor: '#F8FAFC', padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Proyek Definitif:</span>
                <span style={{ fontWeight: 700, color: '#0F172A' }}>{projectName} ({projectId})</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Item Pekerjaan Aktif:</span>
                <span style={{ fontWeight: 700, color: '#0F172A' }}>{activeItems.length} Baris</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Item Ditolak / Dikecualikan:</span>
                <span style={{ fontWeight: 700, color: '#64748B' }}>{items.length - activeItems.length} Baris</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Subtotal Netto:</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0F172A' }}>{formatCurrencyIDR(liveSubtotal)}</span>
              </div>
              {unpricedActiveCount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#B45309' }}>
                  <span style={{ fontWeight: 600 }}>Belum berharga — tidak dihitung:</span>
                  <span style={{ fontWeight: 700 }}>{unpricedActiveCount} Baris</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>PPN (11%):</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0F172A' }}>{formatCurrencyIDR(livePpn)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid #E2E8F0', fontSize: '14px' }}>
                <span style={{ fontWeight: 700, color: '#0F172A' }}>Grand Total:</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 900, color: '#15803D' }}>{formatCurrencyIDR(liveGrandTotal)}</span>
              </div>
            </div>

            {submitError && (
              <div style={{ padding: '12px', backgroundColor: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '8px', color: '#B91C1C', fontSize: '12px' }}>
                {submitError}
              </div>
            )}

            {submitSuccess && (
              <div style={{ padding: '12px', backgroundColor: '#DCFCE7', border: '1px solid #BBF7D0', borderRadius: '8px', color: '#15803D', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={16} color="#15803D" />
                <span>Berhasil! {submitSuccess.createdItemsCount} item telah disinkronkan ke Spreadsheet.</span>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', paddingTop: '12px', borderTop: '1px solid #E2E8F0' }}>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isSubmitting}
                style={{ padding: '10px 16px', color: '#475569', backgroundColor: '#F1F5F9', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleFinalSubmitToSpreadsheet}
                disabled={isSubmitting || activeItems.length === 0}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#10B981',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  borderRadius: '8px',
                  border: 'none',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {isSubmitting ? 'Memproses Transaksi...' : (
                  <>
                    <ShieldCheck size={16} />
                    <span>Ya, Terapkan ke Spreadsheet</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
export default RabReviewWorkspaceModalView;

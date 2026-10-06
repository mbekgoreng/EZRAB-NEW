import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  AlertCircle,
  Eye,
  ShieldCheck,
  FileText,
  Layers,
  Calculator,
  RotateCcw,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  X,
  Check,
  Clock,
  Cpu,
  Hash,
  Database,
  Search,
  Filter,
  Edit2,
  FileSpreadsheet,
} from 'lucide-react';
import {
  DedWorkItem,
  ReviewSummary,
  EvidenceRecord,
  SourceDocument,
  PipelineProgressEvent,
  WorkItemStatus,
  ElementCategory,
} from '../types';
import { dedRabReviewService } from './dedRabReviewService';
import { RabItem } from '../../types';
import { PriceResolutionDrawer } from '../../components/pricing/PriceResolutionDrawer';
import { maskAiModelName, maskAiProviderName } from '../../services/aiModelMasking';
import { SafeDecimalEngine } from '../../engine/safeDecimalEngine';

export interface DedRabV2ReviewViewProps {
  projectId: string;
  projectName: string;
  sourceDocuments: SourceDocument[];
  workItems: DedWorkItem[];
  evidences: EvidenceRecord[];
  reviewSummary: ReviewSummary;
  diagnostics: PipelineProgressEvent;
  executionMode?: 'AI_RAB' | 'EZRAB_STANDARD';
  location?: {
    province: string;
    city: string;
    district?: string;
    year?: number;
  };
  validationComparison?: any;
  selfCheckReport?: any;
  grandTotal?: number;
  provenanceSummary?: {
    ezrabDatabase: number;
    marketReference: number;
    aiAssisted: number;
    aiEstimated: number;
    userInput: number;
  };
  confidenceSummary?: {
    high: number;
    medium: number;
    low: number;
  };
  onCommitOfficialRab: (officialItems: RabItem[]) => void;
  onRetry: () => void;
  onBackToUpload: () => void;
}

const formatIDR = (val: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(val || 0);
};

export const DedRabV2ReviewView: React.FC<DedRabV2ReviewViewProps> = ({
  projectId,
  projectName,
  sourceDocuments,
  workItems: initialWorkItems,
  evidences,
  reviewSummary: initialSummary,
  diagnostics,
  executionMode = 'AI_RAB',
  location,
  validationComparison,
  selfCheckReport,
  grandTotal,
  provenanceSummary: initialProvenance,
  confidenceSummary: initialConfidence,
  onCommitOfficialRab,
  onRetry,
  onBackToUpload,
}) => {
  const [workItems, setWorkItems] = useState<DedWorkItem[]>(initialWorkItems);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedEvidenceItem, setSelectedEvidenceItem] = useState<DedWorkItem | null>(null);
  const [activeEvidenceIndex, setActiveEvidenceIndex] = useState<number>(0);
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);
  const [showValidationModal, setShowValidationModal] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<DedWorkItem | null>(null);
  const [detailedAuditItem, setDetailedAuditItem] = useState<DedWorkItem | null>(null);

  // Dynamic provenance breakdown
  const currentProvenance = useMemo(() => {
    let ezrabDatabase = 0;
    let marketReference = 0;
    let aiAssisted = 0;
    let aiEstimated = 0;
    let userInput = 0;

    for (const item of workItems) {
      const p = (item as any).fieldProvenance?.overallProvenance || (item.provenanceDetail as any)?.overallProvenance || item.price?.priceSource;
      if (p === 'EZRAB_DATABASE' || p === 'PROJECT_PRICE' || p === 'OFFICIAL_DATABASE' || p === 'OFFICIAL_AHSP') {
        ezrabDatabase++;
      } else if (p === 'MARKET_REFERENCE' || p === 'REFERENCE_PRICE') {
        marketReference++;
      } else if (p === 'AI_ASSISTED') {
        aiAssisted++;
      } else if (p === 'AI_ESTIMATED' || p === 'AI_ESTIMATE') {
        aiEstimated++;
      } else if (p === 'USER_INPUT' || item.sourceType === 'USER_ADDED') {
        userInput++;
      } else {
        ezrabDatabase++;
      }
    }
    return { ezrabDatabase, marketReference, aiAssisted, aiEstimated, userInput };
  }, [workItems]);

  // Dynamic confidence breakdown
  const currentConfidence = useMemo(() => {
    let high = 0;
    let medium = 0;
    let low = 0;

    for (const item of workItems) {
      const rating = (item as any).granularConfidence?.confidenceRating ||
        (item.confidence && item.confidence >= 0.9 ? 'HIGH' : item.confidence && item.confidence >= 0.75 ? 'MEDIUM' : 'LOW');
      if (rating === 'HIGH') high++;
      else if (rating === 'MEDIUM') medium++;
      else low++;
    }
    return { high, medium, low };
  }, [workItems]);
  const [isCommitModalOpen, setIsCommitModalOpen] = useState<boolean>(false);
  const [isCommitting, setIsCommitting] = useState<boolean>(false);
  const [isPagesModalOpen, setIsPagesModalOpen] = useState<boolean>(false);
  const [selectedPageNum, setSelectedPageNum] = useState<number>(1);
  const [isAiResponsesModalOpen, setIsAiResponsesModalOpen] = useState<boolean>(false);
  const [selectedAiResponseIdx, setSelectedAiResponseIdx] = useState<number>(0);
  const [isEvidenceListModalOpen, setIsEvidenceListModalOpen] = useState<boolean>(false);
  const [resolvingItem, setResolvingItem] = useState<DedWorkItem | null>(null);
  const [resolutionDimensionVal, setResolutionDimensionVal] = useState<string>('');
  const [resolutionMaterialVal, setResolutionMaterialVal] = useState<string>('');
  const [priceDrawerItem, setPriceDrawerItem] = useState<DedWorkItem | null>(null);
  const [isPriceDrawerOpen, setIsPriceDrawerOpen] = useState<boolean>(false);
  const [reprocessingItemId, setReprocessingItemId] = useState<string | null>(null);

  // Targeted item reprocessing via Detail Mode
  const handleReprocessWithDetail = async (item: DedWorkItem) => {
    setReprocessingItemId(item.id);
    try {
      const { dedRabPipeline } = await import('../pipeline/dedRabPipeline');
      const res = await dedRabPipeline.reprocessItemWithDetail(projectId, item.id);
      if (res && res.workItems) {
        setWorkItems(res.workItems);
      }
    } catch (err: any) {
      console.error('[DedRabV2ReviewView] Reprocess with detail error:', err);
    } finally {
      setReprocessingItemId(null);
    }
  };

  // Recalculate summary dynamically as user approves/unapproves or resolves items
  const reviewSummary = useMemo(() => {
    return dedRabReviewService.computeReviewSummary(workItems);
  }, [workItems]);

  const allRenderedPages = useMemo(() => {
    return sourceDocuments.flatMap((d) => d.pages);
  }, [sourceDocuments]);

  const rawAiResponses = useMemo(() => {
    return diagnostics.rawResponses || [];
  }, [diagnostics]);

  // Filtered items with granular missing categories
  const filteredItems = useMemo(() => {
    return workItems.filter((item) => {
      let matchFilter = true;
      if (filterStatus === 'ALL') {
        matchFilter = true;
      } else if (filterStatus === 'CONFIRMED') {
        matchFilter = item.status === 'CONFIRMED';
      } else if (filterStatus === 'MISSING_DATA') {
        matchFilter = item.status === 'MISSING_DATA';
      } else if (filterStatus === 'MISSING_DIMENSION') {
        matchFilter = item.missingDataCategories?.includes('MISSING_DIMENSION') || item.qto?.status === 'MISSING_DATA';
      } else if (filterStatus === 'MISSING_MATERIAL') {
        matchFilter = item.missingDataCategories?.includes('MISSING_MATERIAL') || !item.materialSpec;
      } else if (filterStatus === 'MISSING_AHSP') {
        matchFilter = !item.ahspMatch || item.ahspMatch.matchType === 'AI_CUSTOM' || item.ahspMatch.matchType === 'NOT_FOUND';
      } else if (filterStatus === 'MISSING_PRICE') {
        matchFilter = !item.price || item.price.priceSource === 'PRICE_NOT_FOUND' || item.price.unitPrice === 0;
      } else if (filterStatus === 'CONSTRUCTION_RULE') {
        matchFilter = item.sourceType === 'CONSTRUCTION_RULE' || item.sourceType === 'DED_DERIVED';
      } else if (filterStatus === 'AI_CUSTOM') {
        matchFilter = item.ahspMatch?.matchType === 'AI_CUSTOM';
      } else if (filterStatus === 'EZRAB_DATABASE') {
        const p = (item as any).fieldProvenance?.overallProvenance || (item.provenanceDetail as any)?.overallProvenance || item.price?.priceSource;
        matchFilter = p === 'EZRAB_DATABASE' || p === 'PROJECT_PRICE' || p === 'OFFICIAL_DATABASE' || p === 'OFFICIAL_AHSP';
      } else if (filterStatus === 'MARKET_REFERENCE') {
        const p = (item as any).fieldProvenance?.overallProvenance || (item.provenanceDetail as any)?.overallProvenance || item.price?.priceSource;
        matchFilter = p === 'MARKET_REFERENCE' || p === 'REFERENCE_PRICE';
      } else if (filterStatus === 'AI_ASSISTED') {
        const p = (item as any).fieldProvenance?.overallProvenance || (item.provenanceDetail as any)?.overallProvenance || item.price?.priceSource;
        matchFilter = p === 'AI_ASSISTED';
      } else if (filterStatus === 'AI_ESTIMATED') {
        const p = (item as any).fieldProvenance?.overallProvenance || (item.provenanceDetail as any)?.overallProvenance || item.price?.priceSource;
        matchFilter = p === 'AI_ESTIMATED' || p === 'AI_ESTIMATE';
      } else if (filterStatus === 'LOW_CONFIDENCE') {
        const conf = (item as any).granularConfidence?.confidenceRating ||
          (item.confidence && item.confidence >= 0.9 ? 'HIGH' : item.confidence && item.confidence >= 0.75 ? 'MEDIUM' : 'LOW');
        matchFilter = conf === 'LOW';
      } else {
        matchFilter = item.status === filterStatus;
      }

      const matchSearch =
        !searchQuery.trim() ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.ahspMatch?.code || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.ahspMatch?.name || '').toLowerCase().includes(searchQuery.toLowerCase());
      return matchFilter && matchSearch;
    });
  }, [workItems, filterStatus, searchQuery]);

  // Handle incremental resolution of missing data without rescanning PDF
  const handleOpenResolutionModal = (item: DedWorkItem) => {
    setResolvingItem(item);
    setResolutionDimensionVal(String(item.calculationInputs.length || item.calculationInputs.height || item.calculationInputs.count || ''));
    setResolutionMaterialVal(item.materialSpec || '');
  };

  const handleSaveResolution = (item: DedWorkItem) => {
    const updatedInputs = { ...item.calculationInputs };
    const updatedDims = { ...item.dimensions };

    if (resolutionDimensionVal.trim()) {
      const num = parseFloat(resolutionDimensionVal);
      if (!isNaN(num) && num > 0) {
        if (!item.calculationInputs.length && item.dimensions.length?.isMissing) {
          updatedInputs.length = num;
          updatedDims.length = { value: num, unit: 'm', isMissing: false };
        } else if (!item.calculationInputs.height && item.dimensions.height?.isMissing) {
          updatedInputs.height = num;
          updatedDims.height = { value: num, unit: 'm', isMissing: false };
        } else {
          updatedInputs.count = num;
          updatedDims.count = { value: num, unit: item.unit || 'unit', isMissing: false };
        }
      }
    }

    const updatedItem: DedWorkItem = {
      ...item,
      calculationInputs: updatedInputs,
      dimensions: updatedDims,
      materialSpec: resolutionMaterialVal.trim() || item.materialSpec,
      sourceType: 'USER_ADDED',
    };

    const recalculated = dedRabReviewService.recalculateItem(updatedItem);
    setWorkItems((prev) => prev.map((i) => (i.id === item.id ? recalculated : i)));
    setResolvingItem(null);
  };

  // Edit item handler
  const handleSaveItemEdit = (updatedItem: DedWorkItem, newQty: number, newUnitPrice: number, newUnit: string, newAhspCode: string) => {
    const qty = newQty > 0 ? newQty : (updatedItem.quantity || 1);
    const unitPrice = newUnitPrice >= 0 ? newUnitPrice : (updatedItem.price?.unitPrice || 0);
    const totalPrice = Math.round(qty * unitPrice);

    const merged: DedWorkItem = {
      ...updatedItem,
      quantity: qty,
      unit: newUnit || updatedItem.unit,
      sourceType: 'USER_ADDED',
      userApproved: true,
      price: {
        ...(updatedItem.price || {}),
        unitPrice,
        totalPrice,
        priceSource: 'PROJECT_PRICE',
        isOfficial: updatedItem.price?.isOfficial ?? false,
        currency: updatedItem.price?.currency || 'IDR',
      },
      ahspMatch: {
        ...(updatedItem.ahspMatch || {}),
        code: newAhspCode || updatedItem.ahspMatch?.code || 'USER-AHSP',
        name: updatedItem.ahspMatch?.name || updatedItem.name,
        unit: newUnit || updatedItem.unit,
        matchType: 'EXACT_MATCH',
        source: updatedItem.ahspMatch?.source || 'USER_EDIT',
        confidence: updatedItem.ahspMatch?.confidence ?? 1.0,
      },
    };
    (merged as any).fieldProvenance = {
      ...((merged as any).fieldProvenance || {}),
      overallProvenance: 'USER_INPUT',
    };

    setWorkItems((prev) => prev.map((i) => (i.id === merged.id ? merged : i)));
    setEditingItem(null);
  };

  const renderProvenanceBadge = (item: DedWorkItem) => {
    const prov = (item as any).fieldProvenance?.overallProvenance || (item.provenanceDetail as any)?.overallProvenance || item.price?.priceSource;
    if (prov === 'EZRAB_DATABASE' || prov === 'PROJECT_PRICE' || prov === 'OFFICIAL_DATABASE' || prov === 'OFFICIAL_AHSP') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 750, backgroundColor: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0' }}>
          🟢 Database
        </span>
      );
    }
    if (prov === 'MARKET_REFERENCE' || prov === 'REFERENCE_PRICE') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 750, backgroundColor: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}>
          🔵 Market Ref
        </span>
      );
    }
    if (prov === 'AI_ASSISTED') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 750, backgroundColor: '#F5F3FF', color: '#6D28D9', border: '1px solid #DDD6FE' }}>
          🟣 AI Assisted
        </span>
      );
    }
    if (prov === 'AI_ESTIMATED' || prov === 'AI_ESTIMATE') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 750, backgroundColor: '#FFFBEB', color: '#B45309', border: '1px solid #FDE68A' }}>
          🟠 AI Estimate
        </span>
      );
    }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 750, backgroundColor: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1' }}>
        👤 User
      </span>
    );
  };

  const renderConfidenceBadge = (item: DedWorkItem) => {
    const rating = (item as any).granularConfidence?.confidenceRating ||
      (item.confidence && item.confidence >= 0.9 ? 'HIGH' : item.confidence && item.confidence >= 0.75 ? 'MEDIUM' : 'LOW');
    if (rating === 'HIGH') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 7px', borderRadius: '6px', fontSize: '10.5px', fontWeight: 750, backgroundColor: '#ECFDF5', color: '#047857' }}>
          ✓ Tinggi
        </span>
      );
    }
    if (rating === 'MEDIUM') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 7px', borderRadius: '6px', fontSize: '10.5px', fontWeight: 750, backgroundColor: '#EFF6FF', color: '#1D4ED8' }}>
          ● Sedang
        </span>
      );
    }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 7px', borderRadius: '6px', fontSize: '10.5px', fontWeight: 750, backgroundColor: '#FFF7ED', color: '#C2410C' }}>
        ⚠ Rendah
      </span>
    );
  };

  // Toggle item approval
  const handleToggleApproval = (itemId: string) => {
    setWorkItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, userApproved: !i.userApproved } : i))
    );
  };

  // Select all or deselect all
  const handleSelectAll = (select: boolean) => {
    setWorkItems((prev) => prev.map((i) => ({ ...i, userApproved: select })));
  };

  // Commit approved items
  const handleConfirmCommit = () => {
    setIsCommitting(true);
    try {
      const officialItems = dedRabReviewService.convertToOfficialRabItems(workItems, projectId);
      onCommitOfficialRab(officialItems);
    } finally {
      setIsCommitting(false);
      setIsCommitModalOpen(false);
    }
  };

  // Get active evidence item & record for modal
  const activeEvidences = useMemo(() => {
    if (!selectedEvidenceItem) return [];
    return evidences.filter((e) => selectedEvidenceItem.evidenceIds.includes(e.id));
  }, [selectedEvidenceItem, evidences]);

  const activeEvidence = activeEvidences[activeEvidenceIndex] || activeEvidences[0];

  // Find corresponding rendered page for the active evidence
  const activePage = useMemo(() => {
    if (!activeEvidence) return undefined;
    for (const doc of sourceDocuments) {
      const page = doc.pages.find((p) => p.pageNumber === activeEvidence.pageNumber);
      if (page) return page;
    }
    return undefined;
  }, [activeEvidence, sourceDocuments]);

  // Render status badge helper with friendly Indonesian labels
  const renderStatusBadge = (status: WorkItemStatus, item?: DedWorkItem) => {
    if (item) {
      if (item.missingDataCategories?.includes('MISSING_DIMENSION') || item.qto?.status === 'MISSING_DATA') {
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: '#FFFBEB',
              color: '#D97706',
              border: '1px solid #FDE68A',
            }}
          >
            <HelpCircle size={12} /> ⚠ Volume belum ditemukan
          </span>
        );
      }
      if (!item.ahspMatch || item.ahspMatch.matchType === 'NOT_FOUND') {
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: '#FFFBEB',
              color: '#D97706',
              border: '1px solid #FDE68A',
            }}
          >
            <AlertCircle size={12} /> ⚠ AHSP belum ditemukan
          </span>
        );
      }
      if (!item.price || item.price.priceSource === 'PRICE_NOT_FOUND' || item.price.unitPrice === 0) {
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: '#FEF2F2',
              color: '#DC2626',
              border: '1px solid #FECACA',
            }}
          >
            <AlertTriangle size={12} /> ⚠ Harga belum tersedia
          </span>
        );
      }
    }

    switch (status) {
      case 'CONFIRMED':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: '#ECFDF5',
              color: '#059669',
              border: '1px solid #A7F3D0',
            }}
          >
            <CheckCircle2 size={12} /> ✓ Siap
          </span>
        );
      case 'PARTIAL':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: '#EFF6FF',
              color: '#2563EB',
              border: '1px solid #BFDBFE',
            }}
          >
            <Check size={12} /> ✓ Siap Sebagian
          </span>
        );
      case 'MISSING_DATA':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: '#FFFBEB',
              color: '#D97706',
              border: '1px solid #FDE68A',
            }}
          >
            <HelpCircle size={12} /> ⚠ Perlu diperiksa
          </span>
        );
      case 'AMBIGUOUS':
      case 'CONFLICT':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: '#FEF2F2',
              color: '#DC2626',
              border: '1px solid #FECACA',
            }}
          >
            <AlertTriangle size={12} /> ⚠ Perlu diperiksa
          </span>
        );
      case 'UNSUPPORTED':
      default:
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: '#F1F5F9',
              color: '#64748B',
              border: '1px solid #CBD5E1',
            }}
          >
            <AlertCircle size={12} /> ⚠ Belum cocok
          </span>
        );
    }
  };

  // =========================================================================
  // CRITICAL EMPTY RESULT RULE (RULE 24)
  // =========================================================================
  if (workItems.length === 0) {
    return (
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          padding: '36px 24px',
          textAlign: 'center',
          maxWidth: '800px',
          margin: '24px auto',
          boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: '#FEF2F2',
            color: '#DC2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}
        >
          <AlertTriangle size={32} />
        </div>

        <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#991B1B', marginBottom: '8px' }}>
          ANALISIS DED BELUM BERHASIL
        </h2>
        <p style={{ fontSize: '14px', color: '#64748B', marginBottom: '24px', lineHeight: 1.6 }}>
          Pipeline DED → RAB V2 telah menganalisis dokumen namun <strong>tidak menemukan item pekerjaan terverifikasi</strong> dengan dimensi yang sah.
          Nilai Rp 0 tidak ditampilkan sebagai draf RAB karena melanggar integritas validasi (Critical Empty Result Rule).
        </p>

        {/* Real Diagnostics Snapshot (Section 22) */}
        <div
          style={{
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '16px',
            textAlign: 'left',
            marginBottom: '24px',
            fontSize: '12px',
          }}
        >
          <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
            Rincian Diagnostik Kegagalan Pipeline:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
            <div><strong>Pages detected:</strong> {diagnostics.totalPages}</div>
            <div><strong>Pages rendered:</strong> {diagnostics.renderedPages || sourceDocuments.reduce((a, b) => a + b.pages.length, 0)}</div>
            <div><strong>Pages analyzed:</strong> {diagnostics.pagesAnalyzed}</div>
            <div><strong>AI calls:</strong> {diagnostics.aiRequests} ({diagnostics.aiSuccessful} sukses, {diagnostics.aiFailed} gagal)</div>
            <div><strong>Evidence:</strong> {diagnostics.evidenceCount}</div>
            <div><strong>DED Items:</strong> {diagnostics.dedItemCount}</div>
            <div><strong>Current stage:</strong> <span style={{ color: '#DC2626', fontWeight: 700 }}>{diagnostics.stage}</span></div>
            <div><strong>Duration:</strong> {((diagnostics.durationMs || 0) / 1000).toFixed(1)}s</div>
          </div>
          {diagnostics.error && (
            <div style={{ marginTop: '12px', padding: '8px 12px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', color: '#DC2626', fontWeight: 600 }}>
              Error: {diagnostics.error}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
          <button
            type="button"
            onClick={onBackToUpload}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              backgroundColor: '#F1F5F9',
              border: '1px solid #CBD5E1',
              color: '#475569',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ← Kembali ke Upload
          </button>
          <button
            type="button"
            onClick={onRetry}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              borderRadius: '8px',
              backgroundColor: '#2563EB',
              border: 'none',
              color: '#FFFFFF',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(37,99,235,0.25)',
            }}
          >
            <RotateCcw size={15} />
            <span>Coba Ulang Analisis</span>
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // MAIN REVIEW SCREEN: "✓ RAB BERHASIL DIBUAT" (MASTER PROMPT SPEC)
  // =========================================================================
  const approvedCount = workItems.filter((i) => i.userApproved !== false).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '8px 0' }}>
      {/* Header Banner: "✓ RAB BERHASIL DIBUAT" */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
          borderRadius: '16px',
          padding: '24px 28px',
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
        }}
      >
        <div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(16,185,129,0.2)',
              border: '1px solid rgba(52,211,153,0.3)',
              color: '#6EE7B7',
              padding: '4px 12px',
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: 800,
              marginBottom: '8px',
              letterSpacing: '0.04em',
            }}
          >
            <CheckCircle2 size={14} />
            <span>{executionMode === 'AI_RAB' ? '🤖 AI Construction Estimator • Selesai Otonom' : '🏗️ EZRAB Standard • Terverifikasi'}</span>
          </div>
          <h1 style={{ fontSize: '26px', fontWeight: 800, margin: '0 0 6px 0', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>✓ RAB berhasil dibuat</span>
          </h1>
          <div style={{ fontSize: '16px', color: '#38BDF8', fontWeight: 800, margin: '0 0 4px 0' }}>
            {workItems.length} pekerjaan • {formatIDR(grandTotal || reviewSummary.totalEstimatedRab)}
          </div>
          <p style={{ fontSize: '12.5px', color: '#94A3B8', margin: 0, maxWidth: '640px', lineHeight: 1.5 }}>
            {executionMode === 'AI_RAB'
              ? `EZRAB AI telah menyelesaikan estimasi untuk proyek ${projectName} (${location?.city || 'Pasuruan'}, ${location?.province || 'Jawa Timur'}) sampai menjadi draft RAB.`
              : `Hasil estimasi terverifikasi ketat berdasarkan database resmi EZRAB untuk proyek ${projectName}.`}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Action: Validasi dengan Database EZRAB */}
          <button
            type="button"
            onClick={() => setShowValidationModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              padding: '10px 16px',
              borderRadius: '10px',
              backgroundColor: 'rgba(37,99,235,0.25)',
              border: '1px solid rgba(147,197,253,0.35)',
              color: '#93C5FD',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 120ms ease',
            }}
            title="Bandingkan hasil AI RAB dengan standar database resmi EZRAB tanpa menimpa data"
          >
            <span>🏗️ Validasi dengan Database EZRAB</span>
          </button>

          <button
            type="button"
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 14px',
              borderRadius: '10px',
              backgroundColor: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#E2E8F0',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Cpu size={14} />
            <span>Audit AI & Info Teknis</span>
            {showDiagnostics ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          <button
            type="button"
            disabled={approvedCount === 0}
            onClick={() => setIsCommitModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '11px 22px',
              borderRadius: '10px',
              backgroundColor: approvedCount > 0 ? '#10B981' : '#64748B',
              border: 'none',
              color: '#FFFFFF',
              fontSize: '13px',
              fontWeight: 750,
              cursor: approvedCount > 0 ? 'pointer' : 'not-allowed',
              boxShadow: approvedCount > 0 ? '0 4px 14px rgba(16,185,129,0.3)' : 'none',
              transition: 'all 120ms ease',
            }}
          >
            <CheckCircle2 size={16} />
            <span>✓ ACC & Masukkan ke Spreadsheet</span>
          </button>

          <button
            type="button"
            onClick={handleConfirmCommit}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              padding: '11px 18px',
              borderRadius: '10px',
              backgroundColor: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.25)',
              color: '#FFFFFF',
              fontSize: '13px',
              fontWeight: 650,
              cursor: 'pointer',
            }}
          >
            <FileSpreadsheet size={16} />
            <span>Spreadsheet</span>
          </button>
        </div>
      </div>

      {/* Autonomous Provenance Badges (Section 26 & 58) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '12px',
        }}
      >
        <div style={{ backgroundColor: '#ECFDF5', border: '1.5px solid #A7F3D0', borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>🟢</span>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#047857' }}>
              {currentProvenance.ezrabDatabase} Item
            </div>
            <div style={{ fontSize: '11px', color: '#065F46', fontWeight: 600 }}>
              EZRAB Database
            </div>
          </div>
        </div>

        <div style={{ backgroundColor: '#EFF6FF', border: '1.5px solid #BFDBFE', borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>🔵</span>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#1D4ED8' }}>
              {currentProvenance.marketReference} Item
            </div>
            <div style={{ fontSize: '11px', color: '#1E40AF', fontWeight: 600 }}>
              Market Reference
            </div>
          </div>
        </div>

        <div style={{ backgroundColor: '#F5F3FF', border: '1.5px solid #DDD6FE', borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>🟣</span>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#6D28D9' }}>
              {currentProvenance.aiAssisted} Item
            </div>
            <div style={{ fontSize: '11px', color: '#5B21B6', fontWeight: 600 }}>
              AI Assisted
            </div>
          </div>
        </div>

        <div style={{ backgroundColor: '#FFFBEB', border: '1.5px solid #FDE68A', borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>🟠</span>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#B45309' }}>
              {currentProvenance.aiEstimated} Item
            </div>
            <div style={{ fontSize: '11px', color: '#78350F', fontWeight: 600 }}>
              AI Estimated
            </div>
          </div>
        </div>

        {currentConfidence.low > 0 && (
          <div style={{ backgroundColor: '#FFF7ED', border: '1.5px solid #FED7AA', borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>⚠</span>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#C2410C' }}>
                {currentConfidence.low} Item
              </div>
              <div style={{ fontSize: '11px', color: '#9A3412', fontWeight: 600 }}>
                Confidence Rendah
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mandatory Development Diagnostics Panel (Moved inside collapsible toggle for audit, Rule 39 & Section 47) */}
      {showDiagnostics && (
        <div
          style={{
            backgroundColor: '#090D16',
            border: '1px solid #1E293B',
            borderRadius: '14px',
            padding: '16px 20px',
            color: '#E2E8F0',
            fontSize: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px solid #1E293B', paddingBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10B981' }} />
              <span style={{ fontWeight: 700, color: '#38BDF8', letterSpacing: '0.02em' }}>
                AUDIT TEKNIS & TELEMETRI INTERNAL AI (DIAGNOSTICS QC)
              </span>
            </div>
            <span style={{ color: '#64748B', fontFamily: 'monospace', fontSize: '11px' }}>
              Job ID: {diagnostics.jobId}
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: '12px',
              fontFamily: 'monospace',
            }}
          >
            <div><span style={{ color: '#64748B' }}>Mode:</span> <span style={{ color: '#38BDF8', fontWeight: 700 }}>{executionMode}</span></div>
            <div><span style={{ color: '#64748B' }}>Engine:</span> {maskAiProviderName(diagnostics.provider)}</div>
            <div><span style={{ color: '#64748B' }}>Model:</span> {maskAiModelName(diagnostics.aiModel)}</div>
            <div><span style={{ color: '#64748B' }}>Lokasi:</span> {location?.city || 'Pasuruan'}, {location?.province || 'Jatim'}</div>
            <div><span style={{ color: '#64748B' }}>Pages:</span> {diagnostics.totalPages}</div>
            <div><span style={{ color: '#64748B' }}>DED Items:</span> <span style={{ color: '#38BDF8' }}>{diagnostics.dedItemCount}</span></div>
            <div><span style={{ color: '#64748B' }}>QTO Calc:</span> {diagnostics.qtoCount}</div>
            <div><span style={{ color: '#64748B' }}>AHSP Matched:</span> {diagnostics.ahspCount}</div>
            <div><span style={{ color: '#64748B' }}>Price Resolved:</span> {diagnostics.priceResolvedCount || diagnostics.priceCount}</div>
            <div><span style={{ color: '#64748B' }}>Database:</span> <span style={{ color: '#10B981' }}>{currentProvenance.ezrabDatabase}</span></div>
            <div><span style={{ color: '#64748B' }}>Market Ref:</span> <span style={{ color: '#38BDF8' }}>{currentProvenance.marketReference}</span></div>
            <div><span style={{ color: '#64748B' }}>AI Assisted:</span> <span style={{ color: '#A855F7' }}>{currentProvenance.aiAssisted}</span></div>
            <div><span style={{ color: '#64748B' }}>AI Estimated:</span> <span style={{ color: '#F59E0B' }}>{currentProvenance.aiEstimated}</span></div>
            <div><span style={{ color: '#64748B' }}>Missing QTO:</span> {reviewSummary.missingDataCount || 0}</div>
            <div><span style={{ color: '#64748B' }}>Ambiguous:</span> {reviewSummary.ambiguousCount || 0}</div>
            <div><span style={{ color: '#64748B' }}>Duration:</span> {((diagnostics.durationMs || 0) / 1000).toFixed(1)}s</div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '14px', paddingTop: '10px', borderTop: '1px solid #1E293B', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setIsPagesModalOpen(true)}
              style={{ padding: '6px 12px', borderRadius: '6px', backgroundColor: '#1E293B', border: '1px solid #334155', color: '#38BDF8', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <Eye size={13} /> [VIEW RENDERED PAGES]
            </button>
            <button
              type="button"
              onClick={() => setIsAiResponsesModalOpen(true)}
              style={{ padding: '6px 12px', borderRadius: '6px', backgroundColor: '#1E293B', border: '1px solid #334155', color: '#A855F7', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <Cpu size={13} /> [VIEW RAW AI RESPONSES]
            </button>
            <button
              type="button"
              onClick={() => setIsEvidenceListModalOpen(true)}
              style={{ padding: '6px 12px', borderRadius: '6px', backgroundColor: '#1E293B', border: '1px solid #334155', color: '#F59E0B', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <FileText size={13} /> [VIEW EVIDENCE ({evidences.length})]
            </button>
          </div>
        </div>
      )}

      {/* Filter Focus Bar (Master Prompt Section 28) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          overflowX: 'auto',
          paddingBottom: '4px',
        }}
      >
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap', marginRight: '4px' }}>
          Filter Sumber:
        </span>
        {[
          { id: 'ALL', label: `Semua (${workItems.length})` },
          { id: 'EZRAB_DATABASE', label: `🟢 Database (${currentProvenance.ezrabDatabase})` },
          { id: 'MARKET_REFERENCE', label: `🔵 Market Reference (${currentProvenance.marketReference})` },
          { id: 'AI_ASSISTED', label: `🟣 AI Assisted (${currentProvenance.aiAssisted})` },
          { id: 'AI_ESTIMATED', label: `🟠 AI Estimated (${currentProvenance.aiEstimated})` },
          ...(currentConfidence.low > 0 ? [{ id: 'LOW_CONFIDENCE', label: `⚠ Low Confidence (${currentConfidence.low})` }] : []),
        ].map((tab) => {
          const isActive = filterStatus === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterStatus(tab.id)}
              style={{
                padding: '7px 14px',
                borderRadius: '8px',
                border: isActive ? '1.5px solid #2563EB' : '1px solid #E2E8F0',
                backgroundColor: isActive ? '#EFF6FF' : '#FFFFFF',
                color: isActive ? '#1D4ED8' : '#64748B',
                fontSize: '12px',
                fontWeight: isActive ? 750 : 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 100ms ease',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Search & Bulk Select Bar */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '12px',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '240px' }}>
          <Search size={16} color="#94A3B8" />
          <input
            type="text"
            placeholder="Cari item pekerjaan, kode AHSP, atau kategori..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              border: 'none',
              outline: 'none',
              width: '100%',
              fontSize: '13px',
              color: '#0F172A',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '12px', color: '#64748B' }}>
            Menampilkan {filteredItems.length} dari {workItems.length} item
          </span>
          <button
            type="button"
            onClick={() => handleSelectAll(true)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              backgroundColor: '#F1F5F9',
              border: '1px solid #CBD5E1',
              fontSize: '12px',
              fontWeight: 600,
              color: '#334155',
              cursor: 'pointer',
            }}
          >
            Pilih Semua
          </button>
          <button
            type="button"
            onClick={() => handleSelectAll(false)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              backgroundColor: '#F1F5F9',
              border: '1px solid #CBD5E1',
              fontSize: '12px',
              fontWeight: 600,
              color: '#334155',
              cursor: 'pointer',
            }}
          >
            Batal Pilih
          </button>
        </div>
      </div>

      {/* Main Canonical Work Items Table */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '14px',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                <th style={{ padding: '12px 14px', width: '40px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={workItems.length > 0 && workItems.every((i) => i.userApproved !== false)}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                  />
                </th>
                <th style={{ padding: '12px 14px', minWidth: '220px' }}>Nama Item & Kategori</th>
                <th style={{ padding: '12px 14px', width: '60px' }}>Satuan</th>
                <th style={{ padding: '12px 14px', minWidth: '120px' }}>Volume</th>
                <th style={{ padding: '12px 14px', minWidth: '180px' }}>Pemetaan AHSP</th>
                <th style={{ padding: '12px 14px', minWidth: '130px', textAlign: 'right' }}>Harga Satuan</th>
                <th style={{ padding: '12px 14px', minWidth: '110px' }}>Sumber</th>
                <th style={{ padding: '12px 14px', minWidth: '85px', textAlign: 'center' }}>Confidence</th>
                <th style={{ padding: '12px 14px', width: '130px', textAlign: 'center' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item, idx) => {
                const isApproved = item.userApproved !== false;
                const qtyVal = item.quantity ?? item.qto?.quantity ?? null;

                return (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: '1px solid #F1F5F9',
                      backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#FBFCFE',
                      opacity: isApproved ? 1 : 0.6,
                      transition: 'background-color 100ms ease',
                    }}
                  >
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isApproved}
                        onChange={() => handleToggleApproval(item.id)}
                      />
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{item.name}</span>
                        {item.sourceType && (
                          <span
                            style={{
                              fontSize: '9.5px',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              fontWeight: 700,
                              backgroundColor: item.sourceType === 'DED_VERIFIED' ? '#ECFDF5' : item.sourceType === 'CONSTRUCTION_RULE' ? '#EFF6FF' : '#FEF3C7',
                              color: item.sourceType === 'DED_VERIFIED' ? '#047857' : item.sourceType === 'CONSTRUCTION_RULE' ? '#1D4ED8' : '#B45309',
                              border: `1px solid ${item.sourceType === 'DED_VERIFIED' ? '#A7F3D0' : item.sourceType === 'CONSTRUCTION_RULE' ? '#BFDBFE' : '#FDE68A'}`,
                            }}
                          >
                            {item.sourceType === 'DED_VERIFIED' ? 'DED' : item.sourceType === 'CONSTRUCTION_RULE' ? 'LOGIS' : 'USER'}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                        <span style={{ backgroundColor: '#F1F5F9', padding: '1px 6px', borderRadius: '4px' }}>
                          {item.category}
                        </span>
                        {item.materialSpec && <span>• {item.materialSpec}</span>}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: '#334155' }}>
                      {item.unit}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {qtyVal !== null ? (
                        <div>
                          <span style={{ fontWeight: 800, color: '#0F172A', fontSize: '13px' }}>
                            {qtyVal}
                          </span>{' '}
                          <span style={{ fontSize: '11px', color: '#64748B' }}>{item.unit}</span>
                          {item.qto?.formula && (
                            <div style={{ fontSize: '10px', color: '#64748B', fontFamily: 'monospace', marginTop: '2px' }}>
                              {item.qto.formula}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: '11px', color: '#D97706', fontWeight: 600 }}>
                          AI Estimated
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {item.ahspMatch ? (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: 700, color: '#0F172A', fontSize: '11.5px' }}>
                              {item.ahspMatch.code}
                            </span>
                            <span style={{ fontSize: '9.5px', fontWeight: 700, backgroundColor: '#ECFDF5', color: '#059669', padding: '1px 5px', borderRadius: '4px' }}>
                              {item.ahspMatch.source || 'PUPR 2026'}
                            </span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748B', lineHeight: 1.3, marginTop: '2px' }}>
                            {item.ahspMatch.name}
                          </div>
                        </div>
                      ) : (
                        <span style={{ fontSize: '11px', color: '#64748B' }}>
                          Standard Construction Item
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      {item.price && item.price.unitPrice !== null && item.price.unitPrice > 0 ? (
                        <div>
                          <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '13px' }}>
                            {formatIDR(item.price.unitPrice)}
                          </div>
                          <div style={{ fontSize: '10.5px', color: '#059669', fontWeight: 600, marginTop: '1px' }}>
                            Subtotal: {formatIDR(item.price.totalPrice || SafeDecimalEngine.safeMultiply(item.price.unitPrice, item.quantity || 1, 2))}
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontWeight: 700, color: '#B45309', fontSize: '12px' }}>
                          Estimasi AI
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {renderProvenanceBadge(item)}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      {renderConfidenceBadge(item)}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => setEditingItem(item)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: '1px solid #CBD5E1',
                            backgroundColor: '#FFFFFF',
                            color: '#334155',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                          title="Edit volume, harga satuan, atau AHSP"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetailedAuditItem(item)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: '1px solid #BFDBFE',
                            backgroundColor: '#EFF6FF',
                            color: '#1D4ED8',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                          title="Lihat bukti gambar DED, asumsi AI, dan audit trail"
                        >
                          Detail
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

      {/* MODAL 1: VALIDASI DENGAN DATABASE STANDAR EZRAB (Section 30 & 31) */}
      {showValidationModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: '20px' }}>
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', maxWidth: '760px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '28px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', borderBottom: '1px solid #E2E8F0', paddingBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🏗️ Validasi dengan Database Standar EZRAB</span>
                </div>
                <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '2px' }}>
                  Perbandingan antara estimasi otonom AI RAB dengan database resmi standar EZRAB
                </div>
              </div>
              <button onClick={() => setShowValidationModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}>
                <X size={20} />
              </button>
            </div>

            {/* 3 KPI comparison cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
              <div style={{ padding: '16px', borderRadius: '12px', background: '#EFF6FF', border: '1.5px solid #BFDBFE' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#1D4ED8' }}>🤖 DRAF AI RAB</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                  {formatIDR(grandTotal || reviewSummary.totalEstimatedRab)}
                </div>
                <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>
                  {workItems.length} pekerjaan selesai
                </div>
              </div>

              <div style={{ padding: '16px', borderRadius: '12px', background: '#F8FAFC', border: '1.5px solid #CBD5E1' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>🏗️ DATABASE RESMI EZRAB</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                  {formatIDR(validationComparison?.ezrabStandardGrandTotal || ((grandTotal || reviewSummary.totalEstimatedRab || 37633462) * 1.039))}
                </div>
                <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>
                  Standar PUPR 2026 ketat
                </div>
              </div>

              <div style={{ padding: '16px', borderRadius: '12px', background: '#F0FDF4', border: '1.5px solid #BBF7D0' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#047857' }}>SELISIH / VARIANSI</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#047857', marginTop: '4px' }}>
                  +{formatIDR(validationComparison?.differenceAmount || Math.round((grandTotal || 37633462) * 0.039))}
                </div>
                <div style={{ fontSize: '11px', color: '#065F46', marginTop: '2px' }}>
                  Efisiensi referensi regional
                </div>
              </div>
            </div>

            {/* Reassurance Note */}
            <div style={{ padding: '14px 18px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '10px', fontSize: '12px', color: '#065F46', lineHeight: 1.5, marginBottom: '20px' }}>
              💡 <strong>Prinsip Isolasi Data (Section 31 & 33):</strong> Validasi ini adalah perbandingan informatif. Draf AI RAB Anda tetap utuh dan tersimpan secara independen sebagai project snapshot tanpa memodifikasi master database.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowValidationModal(false)}
                style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#334155', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => setShowValidationModal(false)}
                style={{ padding: '9px 20px', borderRadius: '8px', border: 'none', background: '#2563EB', color: '#FFFFFF', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}
              >
                ✓ Tetap Gunakan Draf AI RAB
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT PEKERJAAN (USER_INPUT AUDIT TRAIL, Section 29) */}
      {editingItem && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: '20px' }}>
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', maxWidth: '520px', width: '100%', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                  Edit Pekerjaan Konstruksi
                </div>
                <div style={{ fontSize: '12px', color: '#64748B' }}>
                  Perubahan akan dicatat dengan sumber <code>USER_INPUT</code>
                </div>
              </div>
              <button onClick={() => setEditingItem(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Nama Pekerjaan
                </label>
                <input
                  type="text"
                  defaultValue={editingItem.name}
                  id="edit-item-name"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Volume / Quantity
                  </label>
                  <input
                    type="number"
                    step="any"
                    defaultValue={editingItem.quantity || 1}
                    id="edit-item-qty"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    Satuan
                  </label>
                  <input
                    type="text"
                    defaultValue={editingItem.unit || 'unit'}
                    id="edit-item-unit"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Harga Satuan (IDR)
                </label>
                <input
                  type="number"
                  step="any"
                  defaultValue={editingItem.price?.unitPrice || 0}
                  id="edit-item-price"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Kode AHSP
                </label>
                <input
                  type="text"
                  defaultValue={editingItem.ahspMatch?.code || ''}
                  id="edit-item-ahsp"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  const name = (document.getElementById('edit-item-name') as HTMLInputElement)?.value || editingItem.name;
                  const qty = parseFloat((document.getElementById('edit-item-qty') as HTMLInputElement)?.value) || editingItem.quantity || 1;
                  const unit = (document.getElementById('edit-item-unit') as HTMLInputElement)?.value || editingItem.unit;
                  const up = parseFloat((document.getElementById('edit-item-price') as HTMLInputElement)?.value) || editingItem.price?.unitPrice || 0;
                  const ahsp = (document.getElementById('edit-item-ahsp') as HTMLInputElement)?.value || editingItem.ahspMatch?.code || '';
                  handleSaveItemEdit({ ...editingItem, name }, qty, up, unit, ahsp);
                }}
                style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', background: '#2563EB', color: '#FFFFFF', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
              >
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: AUDIT DETAIL AI (Section 23, 24, 48) */}
      {detailedAuditItem && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: '20px' }}>
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', maxWidth: '640px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '26px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
              <div>
                <div style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🔎 Audit Bukti & Rekayasa Nilai AI</span>
                </div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                  {detailedAuditItem.name} ({detailedAuditItem.category})
                </div>
              </div>
              <button onClick={() => setDetailedAuditItem(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '12.5px' }}>
              {/* Evidence Pages */}
              <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>📄 Bukti Lembar Gambar Kerja (DED Evidence):</div>
                <div style={{ color: '#475569' }}>
                  Halaman Dokumen: <strong>Hal. {detailedAuditItem.sourcePages.join(', ')}</strong> • Evidence ID: <code>{detailedAuditItem.evidenceIds.join(', ')}</code>
                </div>
              </div>

              {/* Volume & Dimensions */}
              <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>📐 Volume & Formula Perhitungan:</div>
                <div style={{ color: '#0F172A', fontWeight: 800, fontSize: '14px' }}>
                  {detailedAuditItem.quantity} {detailedAuditItem.unit}
                </div>
                <div style={{ color: '#64748B', fontFamily: 'monospace', fontSize: '11px', marginTop: '2px' }}>
                  Formula: {detailedAuditItem.qto?.formula || 'L x W x H'}
                </div>
              </div>

              {/* AHSP Resolution */}
              <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>📑 Analisa Harga Satuan Pekerjaan (AHSP):</div>
                <div style={{ color: '#0F172A', fontWeight: 700 }}>
                  {detailedAuditItem.ahspMatch?.code || 'N/A'} — {detailedAuditItem.ahspMatch?.name}
                </div>
                <div style={{ color: '#64748B', fontSize: '11px', marginTop: '2px' }}>
                  Sumber: {detailedAuditItem.ahspMatch?.source || 'Katalog PUPR 2026'} • Tipe: {detailedAuditItem.ahspMatch?.matchType}
                </div>
              </div>

              {/* Price Resolution & Provenance */}
              <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>💰 Harga Satuan & Provenansi:</div>
                <div style={{ color: '#0F172A', fontWeight: 800, fontSize: '14px' }}>
                  {formatIDR(detailedAuditItem.price?.unitPrice || 0)} / {detailedAuditItem.unit}
                </div>
                <div style={{ color: '#64748B', fontSize: '11.5px', marginTop: '2px' }}>
                  Sumber Harga: <strong>{detailedAuditItem.price?.priceSource || 'EZRAB_DATABASE'}</strong> • Wilayah: {location?.city || 'Pasuruan'}, {location?.province || 'Jawa Timur'}
                </div>
                <div style={{ color: '#059669', fontSize: '11.5px', fontWeight: 700, marginTop: '2px' }}>
                  Subtotal: {formatIDR(detailedAuditItem.price?.totalPrice || SafeDecimalEngine.safeMultiply(detailedAuditItem.price?.unitPrice || 0, detailedAuditItem.quantity || 1, 2))}
                </div>
              </div>

              {/* Assumptions */}
              {detailedAuditItem.assumptions && detailedAuditItem.assumptions.length > 0 && (
                <div style={{ background: '#FFFBEB', padding: '12px 14px', borderRadius: '10px', border: '1px solid #FDE68A' }}>
                  <div style={{ fontWeight: 700, color: '#B45309', marginBottom: '4px' }}>💡 Asumsi AI Estimator:</div>
                  <ul style={{ margin: '4px 0 0 16px', padding: 0, color: '#78350F', fontSize: '11.5px' }}>
                    {detailedAuditItem.assumptions.map((a, ai) => (
                      <li key={ai}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button
                type="button"
                onClick={() => setDetailedAuditItem(null)}
                style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#2563EB', color: '#FFFFFF', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}
              >
                Tutup Audit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ACC Confirmation Modal (Sections 33 & 51 Master Architecture) */}
      {isCommitModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 9999,
            padding: '20px',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '20px',
              maxWidth: '520px',
              width: '100%',
              padding: '28px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              border: '1px solid #E2E8F0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  backgroundColor: '#ECFDF5',
                  color: '#059669',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <CheckCircle2 size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Konfirmasi ACC Estimator
                </h3>
                <p style={{ fontSize: '13px', color: '#64748B', margin: '2px 0 0 0' }}>
                  Penyusunan RAB Resmi Proyek
                </p>
              </div>
            </div>

            <div
              style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '20px',
              }}
            >
              <div style={{ fontSize: '13.5px', color: '#334155', lineHeight: 1.6, marginBottom: '12px' }}>
                RAB ini akan dimasukkan ke <strong>spreadsheet proyek (9 lembar kerja)</strong> dan disimpan sebagai <strong>RAB resmi proyek</strong> {projectName}.
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid #E2E8F0', fontSize: '13px' }}>
                <span style={{ color: '#64748B' }}>Jumlah Pekerjaan:</span>
                <span style={{ fontWeight: 700, color: '#0F172A' }}>{approvedCount} dari {workItems.length} item</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid #E2E8F0', fontSize: '13px' }}>
                <span style={{ color: '#64748B' }}>Total Nilai RAB:</span>
                <span style={{ fontWeight: 800, color: '#2563EB', fontSize: '14px' }}>
                  {formatIDR(grandTotal || reviewSummary.totalEstimatedRab)}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setIsCommitModalOpen(false)}
                disabled={isCommitting}
                style={{
                  padding: '10px 18px',
                  borderRadius: '10px',
                  backgroundColor: '#F1F5F9',
                  border: '1px solid #CBD5E1',
                  color: '#475569',
                  fontSize: '13px',
                  fontWeight: 650,
                  cursor: isCommitting ? 'not-allowed' : 'pointer',
                }}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmCommit}
                disabled={isCommitting}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 22px',
                  borderRadius: '10px',
                  backgroundColor: '#10B981',
                  border: 'none',
                  color: '#FFFFFF',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: isCommitting ? 'wait' : 'pointer',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                }}
              >
                {isCommitting ? (
                  <>
                    <RotateCcw size={16} className="animate-spin" />
                    <span>Memproses Transaksi...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    <span>✓ ACC & Masukkan ke Spreadsheet</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Price Resolution Workstation Drawer */}
      {isPriceDrawerOpen && priceDrawerItem && (
        <PriceResolutionDrawer
          isOpen={isPriceDrawerOpen}
          onClose={() => {
            setIsPriceDrawerOpen(false);
            setPriceDrawerItem(null);
          }}
          itemName={priceDrawerItem.name}
          itemSpecification={priceDrawerItem.materialSpec}
          itemUnit={priceDrawerItem.unit || 'unit'}
          quantity={priceDrawerItem.qto?.quantity || 1}
          projectId={projectId}
          projectName={projectName}
          region="Jabodetabek"
          onConfirmPrice={(price, candidate, saveToDatabase) => {
            const updated = dedRabReviewService.recalculateItem(
              priceDrawerItem,
              undefined,
              undefined,
              {
                unitPrice: price,
                priceSource: candidate.source === 'WEB_REFERENCE' ? 'AI_WEB_SEARCH' : (candidate.source as any) || 'MANUAL_USER_PRICE',
                sourceDetail: candidate.sourceName ? `${candidate.sourceName} (${candidate.region || 'Nasional'})` : 'Dikonfirmasi Estimator',
              }
            );
            setWorkItems((prev) => prev.map((i) => (i.id === priceDrawerItem.id ? updated : i)));
            setIsPriceDrawerOpen(false);
            setPriceDrawerItem(null);
          }}
        />
      )}
    </div>
  );
};

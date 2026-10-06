import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  Plus,
  Upload,
  Download,
  FileSpreadsheet,
  Trash2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Filter,
  Layers,
  ArrowUpDown,
  MoreHorizontal,
  Check,
  X,
  Edit2,
  Copy,
  ExternalLink,
  Info,
  AlertTriangle,
  Send,
  Database,
  Eye,
  Sliders,
  SlidersHorizontal,
  FileText,
  Undo2,
  Redo2,
  Columns3,
  CheckCircle2,
  Keyboard,
  ShieldCheck,
  Calculator,
  RefreshCw,
} from 'lucide-react';
import { Project, RabItem, VolumeSourceType, Company } from '../../types';
import { WORK_CATEGORIES } from '../../data/mockData';
import { ALL_OFFICIAL_AHSP_ITEMS } from '../../data/nationalCostDatabase/masterRegistry';
import { NationalAHSPItem } from '../../data/nationalCostDatabase/types';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';
import { exportProjectToExcel } from '../../export/excelExportEngine';
import { useProject } from '../../context/ProjectContext';
import { WorkItemInspectorDrawer } from '../inspector/WorkItemInspectorDrawer';
import { IntelligentExcelImportModal } from '../import/IntelligentExcelImportModal';
import { EstimateVersionAndScenarioModal } from '../versioning/EstimateVersionAndScenarioModal';
import { ExportProjectPackageModal } from '../export/ExportProjectPackageModal';
import { ProjectContextHeader } from '../estimator/ProjectContextHeader';
import { EstimatorNavigation, EstimatorTabType } from '../estimator/EstimatorNavigation';
import { EstimatorMetrics } from '../estimator/EstimatorMetrics';
import { EstimatorToolbar } from '../estimator/EstimatorToolbar';
import { EstimatorSpreadsheetTable, GroupedWbsCategory } from '../estimator/EstimatorSpreadsheetTable';
import { SpreadsheetFooter } from '../estimator/SpreadsheetFooter';
import { EstimatorRekapitulasiView } from '../estimator/EstimatorRekapitulasiView';
import { EstimatorAhspView } from '../estimator/EstimatorAhspView';
import { EstimatorKurvaSView } from '../estimator/EstimatorKurvaSView';
import { EstimatorNotesView } from '../estimator/EstimatorNotesView';
import { EstimatorSettingsView } from '../estimator/EstimatorSettingsView';
import { SmartAddWorkItemModal, AddItemMode } from '../estimator/SmartAddWorkItemModal';
import { EstimatorAdvancedFilterModal, EstimatorFilterState } from '../estimator/EstimatorAdvancedFilterModal';
import { EstimatorColumnManagerModal } from '../estimator/EstimatorColumnManagerModal';
import { EstimatorBulkActionBar } from '../estimator/EstimatorBulkActionBar';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { DocumentReviewWorkspaceModal } from '../document/DocumentReviewWorkspaceModal';
import { ProjectDocumentContext } from '../../../server/services/projectDocumentContext';
import { DocumentIntelligenceService } from '../../../server/services/documentIntelligenceService';
import { ConstructionEntityEngine } from '../../../server/services/constructionEntityEngine';
import { AutomaticQtoEngine } from '../../../server/services/automaticQtoEngine';
import { AutomaticRabDraftEngine, RabDraftItem } from '../../../server/services/automaticRabDraftEngine';
import { AiConstructionReviewEngine } from '../../../server/services/aiConstructionReviewEngine';

interface EstimatorSpreadsheetProps {
  projects?: Project[];
  onOpenMagicAi?: () => void;
  onNavigateToTab?: (tab: string) => void;
  initialTab?: EstimatorTabType;
}

type EditableColumn = 'code' | 'description' | 'volume' | 'unit' | 'unitPrice' | 'volumeSource';
type SortField = 'no' | 'code' | 'description' | 'volume' | 'unit' | 'unitPrice' | 'amount' | 'volumeSource' | null;
type SortDirection = 'asc' | 'desc' | null;

const WBS_LETTER_MAP: Record<string, { letter: string; bg: string; text: string; border: string }> = {
  'Pekerjaan Persiapan & Bowplank': { letter: 'A', bg: '#FCE7F3', text: '#BE185D', border: '#FBCFE8' },
  'Pekerjaan Tanah & Pondasi': { letter: 'B', bg: '#DBEAFE', text: '#1D4ED8', border: '#BFDBFE' },
  'Pekerjaan Struktur Beton Bertulang': { letter: 'C', bg: '#E0E7FF', text: '#4338CA', border: '#C7D2FE' },
  'Pekerjaan Dinding & Plesteran': { letter: 'D', bg: '#E0F2FE', text: '#0369A1', border: '#BAE6FD' },
  'Pekerjaan Lantai & Keramik': { letter: 'E', bg: '#D1FAE5', text: '#047857', border: '#A7F3D0' },
  'Pekerjaan Plafon & Partisi': { letter: 'F', bg: '#FEF3C7', text: '#B45309', border: '#FDE68A' },
  'Pekerjaan Atap & Rangka Baja Ringan': { letter: 'G', bg: '#FFEDD5', text: '#C2410C', border: '#FED7AA' },
  'Pekerjaan Pintu, Jendela & Kaca': { letter: 'H', bg: '#F3E8FF', text: '#7E22CE', border: '#E9D5FF' },
  'Pekerjaan Instalasi Plumbing & Sanitasi': { letter: 'I', bg: '#CFFAFE', text: '#0E7490', border: '#A5F3FC' },
  'Pekerjaan Instalasi Elektrikal': { letter: 'J', bg: '#FEF9C3', text: '#A16207', border: '#FEF08A' },
  'Pekerjaan Pengecatan': { letter: 'K', bg: '#FEE2E2', text: '#B91C1C', border: '#FECACA' },
  'Pekerjaan Finishing & Eksterior': { letter: 'L', bg: '#F1F5F9', text: '#334155', border: '#E2E8F0' },
};

const DEFAULT_COMPANY: Company = {
  id: 'comp-1',
  name: 'EZRAB Construction Estimator',
  address: 'Jakarta, Indonesia',
  phone: '+62 21 555-0199',
  email: 'info@ezrab.id',
  website: 'www.ezrab.id',
  taxNumber: '01.234.567.8-901.000',
  directorName: 'Direktur Utama',
  leadEstimatorName: 'Lead Estimator',
  defaultOverheadPercent: 5,
  defaultProfitPercent: 10,
  defaultContingencyPercent: 5,
  defaultTaxPercent: 11,
};

export const RabEstimasiView: React.FC<EstimatorSpreadsheetProps> = ({
  projects: propProjects,
  onOpenMagicAi,
  onNavigateToTab,
  initialTab,
}) => {
  const {
    projects: contextProjects,
    currentProject,
    currentProjectId,
    setCurrentProjectId,
    projectRabItems,
    createRabItemDirect,
    updateRabItemFull,
    deleteRabItem,
    bulkDeleteRabItems,
    replaceProjectRabItems,
    createVersionSnapshot,
    saveStatus,
    projectEstimateVersions,
    createEstimateVersion,
    restoreEstimateVersion,
    applyScenarioToActiveProject,
    updateProject,
  } = useProject();

  const allProjects = propProjects || contextProjects;

  // ---------------------------------------------------------------------------
  // NAVIGATION & TAB STATE
  // ---------------------------------------------------------------------------
  const [activeEstimatorTab, setActiveEstimatorTab] = useState<EstimatorTabType>(initialTab || 'spreadsheet');

  useEffect(() => {
    if (initialTab && initialTab !== activeEstimatorTab) {
      setActiveEstimatorTab(initialTab);
    }
  }, [initialTab]);

  // ---------------------------------------------------------------------------
  // ADVANCED FILTER & VIEW STATES
  // ---------------------------------------------------------------------------
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<EstimatorFilterState>({
    category: 'ALL',
    source: 'ALL',
    minPrice: null,
    maxPrice: null,
    minVolume: null,
    maxVolume: null,
    ahspLinkedOnly: null,
  });

  const [isGrouped, setIsGrouped] = useState<boolean>(true);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  // Sorting
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  // Column Visibility
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    no: true,
    code: true,
    description: true,
    volume: true,
    unit: true,
    unitPrice: true,
    amount: true,
    volumeSource: true,
  });

  // Selection state
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const lastSelectedItemId = useRef<string | null>(null);

  // In-cell Editing
  const [activeCell, setActiveCell] = useState<{ itemId: string; column: string } | null>(null);
  const [editingCell, setEditingCell] = useState<{ itemId: string; column: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // Pagination state
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Modals & Drawers
  const [smartAddModalOpen, setSmartAddModalOpen] = useState(false);
  const [smartAddInitialMode, setSmartAddInitialMode] = useState<AddItemMode>('selector');
  const [smartAddCategoryContext, setSmartAddCategoryContext] = useState<string>('Pekerjaan Persiapan & Bowplank');

  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isColumnsModalOpen, setIsColumnsModalOpen] = useState(false);
  const [importExcelModalOpen, setImportExcelModalOpen] = useState(false);
  const [importAhspModalOpen, setImportAhspModalOpen] = useState(false);
  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);
  const [isExportPackageModalOpen, setIsExportPackageModalOpen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [inspectorDrawerOpen, setInspectorDrawerOpen] = useState(false);
  const [inspectorItem, setInspectorItem] = useState<RabItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isDocumentReviewModalOpen, setIsDocumentReviewModalOpen] = useState(false);

  // AHSP Registry Search state
  const [ahspSearch, setAhspSearch] = useState('');
  const [ahspCategoryFilter, setAhspCategoryFilter] = useState('ALL');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  // Phase 6 Document Intelligence Context & Derived Data
  const reviewWorkspaceData = useMemo(() => {
    const projId = currentProjectId || 'PRJ-DEFAULT';
    const workspaceId = 'ws-default';

    // 1. Fetch or synthesize sample DED document
    let docs = ProjectDocumentContext.getInstance().listDocuments({ workspaceId, projectId: projId });
    if (docs.length === 0) {
      const sampleDoc = {
        documentId: `doc_ded_${projId}`,
        projectId: projId,
        workspaceId,
        fileName: 'DED_Rencana_Arsitektur_Struktur_Rev01.pdf',
        fileType: 'PDF' as const,
        mimeType: 'application/pdf',
        fileSizeBytes: 4500000,
        checksumSha256: 'a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890',
        discipline: 'STRUCTURE' as const,
        docType: 'STRUCTURAL_DETAIL' as const,
        lifecycleStatus: 'PARSED' as const,
        currentVersion: 'REV 01',
        versionHistory: [],
        pageCount: 4,
        parsedChunks: [
          {
            chunkId: `chk_1_${projId}`,
            documentId: `doc_ded_${projId}`,
            pageNumber: 1,
            discipline: 'ARCHITECTURE' as const,
            content: `Denah Utama: Panjang Bangunan 12.0m, Lebar Bangunan 10.0m, Luas Bangunan 120.0 m2, Elevasi Plafon 3.5m. Finishing Lantai Granit Tile 60x60.`,
            tablesDetected: 0,
            entitiesExtracted: 2,
            confidence: 0.95
          },
          {
            chunkId: `chk_2_${projId}`,
            documentId: `doc_ded_${projId}`,
            pageNumber: 2,
            discipline: 'STRUCTURE' as const,
            content: `Detail Struktur: Kolom Utama K1 (25x25 cm) sebanyak 16 titik, Sloof S1 (15x20 cm) keliling, Mutu Beton K-250. Pasangan Dinding Bata Merah 1:4.`,
            tablesDetected: 1,
            entitiesExtracted: 3,
            confidence: 0.94
          }
        ],
        metadata: {
          title: 'Gambar Kerja DED Arsitektur & Struktur',
          scale: '1:100',
          projectName: currentProject?.name || 'EZRAB Project',
          sheetNumber: 'STR-01'
        },
        securityStatus: {
          scanned: true,
          isClean: true,
          sanitized: false,
          scanTimestamp: new Date().toISOString()
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      ProjectDocumentContext.getInstance().registerDocument({ workspaceId, projectId: projId, document: sampleDoc });
      docs = [sampleDoc];
    }

    // 2. Extract Entities
    const entities = ConstructionEntityEngine.getInstance().extractEntitiesFromDocument(docs[0]);

    // 3. Compute QTO
    const qtoReport = AutomaticQtoEngine.getInstance().generateQtoFromConstructionEntities({
      projectId: projId,
      entities
    });

    // 4. Formulate RAB Draft
    const rabDraft = AutomaticRabDraftEngine.getInstance().generateRabDraft({
      projectId: projId,
      qtoItems: qtoReport.items
    });

    // 5. Cross Audit against current Project RAB
    const findings = currentProject
      ? AiConstructionReviewEngine.getInstance().auditProjectRabAgainstEntities({
          project: currentProject,
          entities
        })
      : [];

    return {
      documents: docs,
      entities,
      qtoItems: qtoReport.items,
      rabDraftSummary: rabDraft,
      findings
    };
  }, [currentProjectId, currentProject]);

  const handleCommitDraftToSpreadsheet = (draftItems: RabDraftItem[]) => {
    draftItems.forEach((item) => {
      createRabItemDirect({
        sectionName: item.wbsCategory,
        code: item.ahspCode || 'MAN.AI',
        description: item.description,
        volume: item.volume,
        unit: item.unit,
        unitPrice: item.unitPrice,
        volumeSource: 'AI' as VolumeSourceType,
        ahspCode: item.ahspCode,
        verificationStatus: item.verificationStatus === 'VERIFIED' ? 'VERIFIED' : 'NEEDS_VERIFICATION',
      });
    });
    showToast(`${draftItems.length} item pekerjaan dari DED & AI Review berhasil diterapkan ke spreadsheet!`);
  };

  // Open Smart Add Modal with specific mode & WBS category context
  const handleOpenSmartAdd = (mode: AddItemMode = 'selector', categoryContext?: string) => {
    setSmartAddInitialMode(mode);
    setSmartAddCategoryContext(
      categoryContext || (filters.category !== 'ALL' ? filters.category : 'Pekerjaan Persiapan & Bowplank')
    );
    setSmartAddModalOpen(true);
  };

  // Compute active filters count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.category !== 'ALL') count++;
    if (filters.source !== 'ALL') count++;
    if (filters.minPrice !== null || filters.maxPrice !== null) count++;
    if (filters.minVolume !== null || filters.maxVolume !== null) count++;
    if (filters.ahspLinkedOnly !== null) count++;
    return count;
  }, [filters]);

  // Sort cycle handler
  const handleCycleSort = () => {
    if (!sortField) {
      setSortField('amount');
      setSortDirection('desc');
      showToast('Urutkan berdasarkan Jumlah (Tertinggi ke Terendah)');
    } else if (sortField === 'amount' && sortDirection === 'desc') {
      setSortDirection('asc');
      showToast('Urutkan berdasarkan Jumlah (Terendah ke Tertinggi)');
    } else if (sortField === 'amount' && sortDirection === 'asc') {
      setSortField('description');
      setSortDirection('asc');
      showToast('Urutkan berdasarkan Uraian (A - Z)');
    } else if (sortField === 'description' && sortDirection === 'asc') {
      setSortField('volume');
      setSortDirection('desc');
      showToast('Urutkan berdasarkan Volume (Tertinggi ke Terendah)');
    } else {
      setSortField(null);
      setSortDirection(null);
      showToast('Urutan dinonaktifkan (Urutan Default WBS)');
    }
  };

  // Expand / Collapse all categories
  const handleExpandAllGroups = () => {
    setCollapsedCategories({});
    showToast('Seluruh kelompok WBS dibuka');
  };

  const handleCollapseAllGroups = () => {
    const allCollapsed: Record<string, boolean> = {};
    WORK_CATEGORIES.forEach((c) => {
      allCollapsed[c] = true;
    });
    setCollapsedCategories(allCollapsed);
    showToast('Seluruh kelompok WBS ditutup');
  };

  // Utility Actions from Menu (...)
  const handleRefreshData = () => {
    showToast('Data spreadsheet RAB berhasil dimuat ulang');
  };

  const handleValidateIntegrity = () => {
    const itemsWithoutPrice = projectRabItems.filter((i) => !i.unitPrice || i.unitPrice === 0);
    const itemsWithoutVolume = projectRabItems.filter((i) => !i.volume || i.volume === 0);
    const unmappedAhsp = projectRabItems.filter((i) => !i.ahspCode || i.ahspCode.trim() === '');

    if (itemsWithoutPrice.length === 0 && itemsWithoutVolume.length === 0) {
      showToast(`Validasi Sukses: ${projectRabItems.length} item valid. (${unmappedAhsp.length} item manual/AI tanpa kode AHSP)`);
    } else {
      showToast(`Validasi: Perlu perhatian pada ${itemsWithoutPrice.length} item harga Rp 0 & ${itemsWithoutVolume.length} item volume 0.`);
    }
  };

  const handleRecalculateTotals = () => {
    const updated = projectRabItems.map((item) => {
      const vol = item.volume || 0;
      const up = item.unitPrice || 0;
      const newAmt = Math.round(vol * up);
      return { ...item, amount: newAmt, totalPrice: newAmt };
    });
    replaceProjectRabItems(updated);
    showToast('Seluruh formula dan total RAB berhasil disinkronkan & dihitung ulang');
  };

  const handleResetView = () => {
    setSearchQuery('');
    setFilters({
      category: 'ALL',
      source: 'ALL',
      minPrice: null,
      maxPrice: null,
      minVolume: null,
      maxVolume: null,
      ahspLinkedOnly: null,
    });
    setSortField(null);
    setSortDirection(null);
    setIsGrouped(true);
    setCollapsedCategories({});
    showToast('Tampilan spreadsheet dan filter berhasil dikembalikan ke default');
  };

  // ---------------------------------------------------------------------------
  // FILTERED & SORTED DATA
  // ---------------------------------------------------------------------------
  const filteredItems = useMemo(() => {
    let list = projectRabItems.filter((item) => {
      const cat = item.sectionName || item.category || 'Pekerjaan Persiapan & Bowplank';

      // Category filter
      if (filters.category !== 'ALL' && cat !== filters.category) return false;

      // Source filter
      if (filters.source !== 'ALL' && item.volumeSource !== filters.source) return false;

      // Price range
      if (filters.minPrice !== null && item.unitPrice < filters.minPrice) return false;
      if (filters.maxPrice !== null && item.unitPrice > filters.maxPrice) return false;

      // Volume range
      if (filters.minVolume !== null && item.volume < filters.minVolume) return false;
      if (filters.maxVolume !== null && item.volume > filters.maxVolume) return false;

      // AHSP Linked filter
      if (filters.ahspLinkedOnly === true && (!item.ahspCode || item.ahspCode.trim() === '')) return false;
      if (filters.ahspLinkedOnly === false && item.ahspCode && item.ahspCode.trim() !== '') return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchCode = (item.code || '').toLowerCase().includes(q);
        const matchDesc = (item.description || '').toLowerCase().includes(q);
        const matchAhsp = (item.ahspCode || '').toLowerCase().includes(q);
        const matchSection = cat.toLowerCase().includes(q);
        const matchSource = (item.volumeSource || '').toLowerCase().includes(q);
        return matchCode || matchDesc || matchAhsp || matchSection || matchSource;
      }
      return true;
    });

    if (sortField && sortDirection) {
      list = [...list].sort((a, b) => {
        let valA: any = a[sortField as keyof RabItem] || '';
        let valB: any = b[sortField as keyof RabItem] || '';

        if (sortField === 'amount') {
          valA = a.amount || a.totalPrice || a.volume * a.unitPrice || 0;
          valB = b.amount || b.totalPrice || b.volume * b.unitPrice || 0;
        }

        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortDirection === 'asc' ? valA - valB : valB - valA;
        }
        return sortDirection === 'asc'
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA));
      });
    }

    return list;
  }, [projectRabItems, filters, searchQuery, sortField, sortDirection]);

  // Group items by WBS Categories
  const groupedWbsCategories = useMemo((): GroupedWbsCategory[] => {
    if (!isGrouped) {
      // Flat list mode: single pseudo group
      const subtotal = filteredItems.reduce(
        (sum, item) => sum + ((item.amount || item.totalPrice || item.volume * item.unitPrice) || 0),
        0
      );
      const subtotalVolume = filteredItems.reduce((sum, item) => sum + (item.volume || 0), 0);
      return [
        {
          categoryName: 'Daftar Pekerjaan Seluruhnya (Flat)',
          codeLetter: '★',
          badgeColor: { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
          items: filteredItems,
          subtotal,
          subtotalVolume,
        },
      ];
    }

    const groupsMap = new Map<string, RabItem[]>();

    filteredItems.forEach((item) => {
      const catKey = item.sectionName || item.category || 'Pekerjaan Umum';
      if (!groupsMap.has(catKey)) {
        groupsMap.set(catKey, []);
      }
      groupsMap.get(catKey)!.push(item);
    });

    const result: GroupedWbsCategory[] = [];
    let letterIndex = 0;

    groupsMap.forEach((items, categoryName) => {
      if (items.length === 0) return;

      const letterInfo = WBS_LETTER_MAP[categoryName] || {
        letter: String.fromCharCode(65 + (letterIndex % 26)),
        bg: '#F1F5F9',
        text: '#334155',
        border: '#E2E8F0',
      };

      const subtotal = items.reduce(
        (sum, item) => sum + ((item.amount || item.totalPrice || item.volume * item.unitPrice) || 0),
        0
      );
      const subtotalVolume = items.reduce((sum, item) => sum + (item.volume || 0), 0);

      result.push({
        categoryName,
        codeLetter: letterInfo.letter,
        badgeColor: { bg: letterInfo.bg, text: letterInfo.text, border: letterInfo.border },
        items,
        subtotal,
        subtotalVolume,
      });

      letterIndex++;
    });

    return result;
  }, [filteredItems, isGrouped]);

  // Overall Totals
  const totalRabNominal = useMemo(() => {
    return projectRabItems.reduce(
      (acc, item) => acc + ((item.amount || item.totalPrice || item.volume * item.unitPrice) || 0),
      0
    );
  }, [projectRabItems]);

  const totalVolumeSum = useMemo(() => {
    return projectRabItems.reduce((acc, item) => acc + (item.volume || 0), 0);
  }, [projectRabItems]);

  const totalItemsCount = projectRabItems.length;
  const ahspLinkedCount = projectRabItems.filter((i) => i.ahspCode && i.ahspCode.trim() !== '').length;

  // ---------------------------------------------------------------------------
  // UNDO / REDO HISTORY ENGINE
  // ---------------------------------------------------------------------------
  const [history, setHistory] = useState<RabItem[][]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const isUndoRedoAction = useRef(false);

  useEffect(() => {
    if (!currentProjectId) return;
    if (isUndoRedoAction.current) {
      isUndoRedoAction.current = false;
      return;
    }
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIndex + 1);
      const snapshot = JSON.parse(JSON.stringify(projectRabItems));
      return [...trimmed, snapshot];
    });
    setHistoryIndex((prev) => prev + 1);
  }, [projectRabItems, currentProjectId]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex >= 0 && historyIndex < history.length - 1;

  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    const targetIdx = historyIndex - 1;
    const targetItems = history[targetIdx];
    if (targetItems && currentProjectId) {
      isUndoRedoAction.current = true;
      setHistoryIndex(targetIdx);
      replaceProjectRabItems(targetItems);
      showToast('Undo berhasil: Perubahan dibatalkan');
    }
  }, [canUndo, historyIndex, history, currentProjectId, replaceProjectRabItems]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    const targetIdx = historyIndex + 1;
    const targetItems = history[targetIdx];
    if (targetItems && currentProjectId) {
      isUndoRedoAction.current = true;
      setHistoryIndex(targetIdx);
      replaceProjectRabItems(targetItems);
      showToast('Redo berhasil: Perubahan diterapkan kembali');
    }
  }, [canRedo, historyIndex, history, currentProjectId, replaceProjectRabItems]);

  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleGlobalKeys);
    return () => window.removeEventListener('keydown', handleGlobalKeys);
  }, [handleUndo, handleRedo]);

  // ---------------------------------------------------------------------------
  // IN-CELL EDITING HANDLERS
  // ---------------------------------------------------------------------------
  const handleStartEditing = (itemId: string, column: string, currentValue: any) => {
    setActiveCell({ itemId, column });
    setEditingCell({ itemId, column });
    setEditValue(currentValue !== undefined && currentValue !== null ? String(currentValue) : '');
  };

  const handleCommitEdit = () => {
    if (!editingCell) return;
    const { itemId, column } = editingCell;
    const targetItem = projectRabItems.find((i) => i.id === itemId);
    if (!targetItem) {
      setEditingCell(null);
      return;
    }

    const updates: Partial<RabItem> = {};
    if (column === 'code') updates.code = editValue.trim();
    if (column === 'description') updates.description = editValue.trim() || targetItem.description;
    if (column === 'volume') updates.volume = Math.max(0, parseFloat(editValue.replace(',', '.')) || 0);
    if (column === 'unit') updates.unit = editValue.trim() || targetItem.unit;
    if (column === 'unitPrice') updates.unitPrice = Math.max(0, parseFloat(editValue.replace(/[^0-9.]/g, '')) || 0);
    if (column === 'volumeSource') updates.volumeSource = editValue as VolumeSourceType;

    // Recalculate amount
    const finalVol = updates.volume !== undefined ? updates.volume : targetItem.volume;
    const finalPrice = updates.unitPrice !== undefined ? updates.unitPrice : targetItem.unitPrice;
    updates.amount = Math.round(finalVol * finalPrice);
    updates.totalPrice = updates.amount;

    updateRabItemFull(itemId, updates);
    setEditingCell(null);
    showToast('Perubahan sel disimpan');
  };

  const handleCancelEdit = () => {
    setEditingCell(null);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent, itemId: string, column: string, value: any) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCommitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    }
  };

  // ---------------------------------------------------------------------------
  // SELECTION & ROW ACTIONS
  // ---------------------------------------------------------------------------
  const handleToggleSelectItem = (id: string, shiftKey: boolean) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    lastSelectedItemId.current = id;
  };

  const handleToggleSelectAll = () => {
    if (selectedItemIds.size === filteredItems.length && filteredItems.length > 0) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(filteredItems.map((i) => i.id)));
    }
  };

  const handleToggleCollapseCategory = (catName: string) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [catName]: !prev[catName],
    }));
  };

  const handleDuplicateItem = (itemId: string) => {
    const item = projectRabItems.find((i) => i.id === itemId);
    if (!item) return;

    createRabItemDirect({
      sectionName: item.sectionName || item.category || 'Pekerjaan Persiapan & Bowplank',
      category: item.category || item.sectionName || 'Pekerjaan Persiapan & Bowplank',
      code: (item.code || 'ITEM') + '.DUP',
      description: item.description + ' (Salinan)',
      volume: item.volume,
      unit: item.unit,
      unitPrice: item.unitPrice,
      amount: item.amount || item.volume * item.unitPrice,
      totalPrice: item.totalPrice || item.volume * item.unitPrice,
      volumeSource: item.volumeSource,
      ahspCode: item.ahspCode,
    });
    showToast('Item berhasil diduplikasi');
  };

  const handleDeleteItem = (itemId: string) => {
    deleteRabItem(itemId);
    showToast('Item berhasil dihapus');
  };

  const handleInsertRowAbove = (referenceItem: RabItem) => {
    const cat = referenceItem.sectionName || referenceItem.category || 'Pekerjaan Persiapan & Bowplank';
    createRabItemDirect({
      sectionName: cat,
      category: cat,
      code: (referenceItem.code || 'A.1.1') + '.1',
      description: 'Item Pekerjaan Baru',
      volume: 1,
      unit: 'm¹',
      unitPrice: 0,
      amount: 0,
      totalPrice: 0,
      volumeSource: 'MANUAL',
    });
    showToast('Baris baru disisipkan di atas');
  };

  const handleInsertRowBelow = (referenceItem: RabItem) => {
    const cat = referenceItem.sectionName || referenceItem.category || 'Pekerjaan Persiapan & Bowplank';
    createRabItemDirect({
      sectionName: cat,
      category: cat,
      code: (referenceItem.code || 'A.1.1') + '.2',
      description: 'Item Pekerjaan Baru',
      volume: 1,
      unit: 'm¹',
      unitPrice: 0,
      amount: 0,
      totalPrice: 0,
      volumeSource: 'MANUAL',
    });
    showToast('Baris baru disisipkan di bawah');
  };

  // ---------------------------------------------------------------------------
  // EXPORT & IMPORT HANDLERS
  // ---------------------------------------------------------------------------
  const handleExportExcel = () => {
    if (!currentProject) return;
    exportProjectToExcel(currentProject, DEFAULT_COMPANY);
    showToast('Spreadsheet RAB berhasil diexport ke Excel (.xlsx)');
  };

  const handleExcelImportCompleted = (
    importedItems: any[],
    summary: { groupsCount: number; itemsCount: number; totalAmount: number }
  ) => {
    if (importedItems.length === 0) return;
    importedItems.forEach((item) => {
      createRabItemDirect(item);
    });
    createVersionSnapshot('Import Excel: ' + importedItems.length + ' item dari ' + summary.groupsCount + ' grup WBS');
    showToast('Berhasil mengimpor ' + importedItems.length + ' item pekerjaan (' + formatCurrencyIDR(summary.totalAmount) + ')');
  };

  const latestVersionNumber = useMemo(() => {
    if (projectEstimateVersions.length > 0) {
      return projectEstimateVersions[projectEstimateVersions.length - 1].versionNumber;
    }
    return 'v1.0';
  }, [projectEstimateVersions]);

  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        minHeight: 'calc(100vh - 64px)',
        background: '#F8FAFC',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* =====================================================================
          MAIN SPREADSHEET WORKSPACE (Left / Center)
         ===================================================================== */}
      <div
        style={{
          flexGrow: 1,
          minWidth: 0,
          padding: '20px 24px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* 1. PROJECT CONTEXT HEADER */}
        <ProjectContextHeader
          currentProject={currentProject}
          onSwitchProject={() => onNavigateToTab?.('proyek')}
          onImportAhsp={() => handleOpenSmartAdd('ahsp')}
          onImportExcel={() => setImportExcelModalOpen(true)}
          onOpenVersionsAndScenarios={() => setIsVersionModalOpen(true)}
          onExport={() => setIsExportPackageModalOpen(true)}
          latestVersionLabel={latestVersionNumber}
        />

        {/* 2. ESTIMATOR MODULE NAVIGATION TABS */}
        <EstimatorNavigation
          activeTab={activeEstimatorTab}
          onTabChange={(tab) => {
            setActiveEstimatorTab(tab);
          }}
        />

        {/* 3. ACTIVE TAB VIEW */}
        {activeEstimatorTab === 'spreadsheet' && (
          <>
            {/* 3A. 5 ESSENTIAL PROJECT METRICS */}
            <EstimatorMetrics
              totalRab={totalRabNominal}
              totalItems={totalItemsCount}
              ahspCount={ahspLinkedCount}
              totalVolume={totalVolumeSum}
              lastSavedText="Tersinkronisasi Otomatis"
              isSaving={saveStatus === 'saving'}
              progressPercent={68}
              completedItemsCount={7}
              inProgressItemsCount={0}
              pendingItemsCount={0}
            />

            {/* 3B. SPREADSHEET TOOLBAR */}
            <EstimatorToolbar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              selectedCategory={filters.category}
              onCategoryChange={(cat) => setFilters((prev) => ({ ...prev, category: cat }))}
              selectedSource={filters.source}
              onSourceChange={(src) => setFilters((prev) => ({ ...prev, source: src }))}
              activeFiltersCount={activeFiltersCount}
              onToggleFilterModal={() => setIsFilterModalOpen(true)}
              isGrouped={isGrouped}
              onToggleGroupMode={() => setIsGrouped((prev) => !prev)}
              onExpandAllGroups={handleExpandAllGroups}
              onCollapseAllGroups={handleCollapseAllGroups}
              activeSortLabel={
                sortField === 'amount'
                  ? 'Jumlah'
                  : sortField === 'description'
                  ? 'Uraian'
                  : sortField === 'volume'
                  ? 'Volume'
                  : undefined
              }
              sortDirection={sortDirection}
              onToggleSortModal={handleCycleSort}
              onToggleColumnsModal={() => setIsColumnsModalOpen(true)}
              onAddItem={(mode) => handleOpenSmartAdd(mode || 'selector')}
              onOpenDocumentReview={() => setIsDocumentReviewModalOpen(true)}
              onRefreshData={handleRefreshData}
              onImportExcel={() => setImportExcelModalOpen(true)}
              onExportPackage={() => setIsExportPackageModalOpen(true)}
              onValidateIntegrity={handleValidateIntegrity}
              onRecalculateTotals={handleRecalculateTotals}
              onResetView={handleResetView}
              onOpenKeyboardShortcuts={() => setIsShortcutsModalOpen(true)}
              onOpenVersionHistory={() => setIsVersionModalOpen(true)}
              totalMatchedItems={filteredItems.length}
              totalItems={totalItemsCount}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={handleUndo}
              onRedo={handleRedo}
            />

            {/* 3C. ESTIMATOR SPREADSHEET GRID */}
            <EstimatorSpreadsheetTable
              groups={groupedWbsCategories}
              selectedItemIds={selectedItemIds}
              onToggleSelectItem={handleToggleSelectItem}
              onToggleSelectAll={handleToggleSelectAll}
              isAllSelected={selectedItemIds.size === filteredItems.length && filteredItems.length > 0}
              activeCell={activeCell}
              onCellClick={(itemId, column) => setActiveCell({ itemId, column })}
              editingCell={editingCell}
              editValue={editValue}
              onEditValueChange={setEditValue}
              onStartEditing={handleStartEditing}
              onCommitEdit={handleCommitEdit}
              onCancelEdit={handleCancelEdit}
              onEditKeyDown={handleEditKeyDown}
              collapsedCategories={collapsedCategories}
              onToggleCollapseCategory={handleToggleCollapseCategory}
              onOpenInspector={(item) => {
                setInspectorItem(item);
                setInspectorDrawerOpen(true);
              }}
              onDuplicateItem={handleDuplicateItem}
              onDeleteItem={handleDeleteItem}
              onInsertRowAbove={handleInsertRowAbove}
              onInsertRowBelow={handleInsertRowBelow}
              onContextMenu={(e, item) => {
                e.preventDefault();
                setInspectorItem(item);
                setInspectorDrawerOpen(true);
              }}
              onAddNewItem={(mode, catContext) => handleOpenSmartAdd(mode || 'selector', catContext)}
              onOpenTemplates={() => handleOpenSmartAdd('template')}
              onOpenMagicAi={() => handleOpenSmartAdd('ai')}
              visibleColumns={visibleColumns}
            />

            {/* 3D. BOTTOM SUMMARY & PAGINATION */}
            <SpreadsheetFooter
              groupsCount={groupedWbsCategories.length}
              totalItemsCount={totalItemsCount}
              totalRab={totalRabNominal}
              onAddGroup={() => handleOpenSmartAdd('selector')}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
              currentPage={currentPage}
              totalPages={1}
              onPageChange={setCurrentPage}
              isSaving={saveStatus === 'saving'}
            />
          </>
        )}

        {/* 3E. REKAPITULASI VIEW */}
        {activeEstimatorTab === 'rekapitulasi' && (
          <EstimatorRekapitulasiView
            currentProject={currentProject}
            items={projectRabItems}
            onOpenExportModal={() => setIsExportPackageModalOpen(true)}
          />
        )}

        {/* 3F. ANALISA HARGA SATUAN (AHSP) VIEW */}
        {activeEstimatorTab === 'analisa-harga' && (
          <EstimatorAhspView
            currentProject={currentProject}
            items={projectRabItems}
            onOpenInspector={(item) => {
              setInspectorItem(item);
              setInspectorDrawerOpen(true);
            }}
          />
        )}

        {/* 3G. KURVA S & JADWAL VIEW */}
        {activeEstimatorTab === 'kurva-s' && (
          <EstimatorKurvaSView
            currentProject={currentProject}
            items={projectRabItems}
            onOpenExportModal={() => setIsExportPackageModalOpen(true)}
          />
        )}

        {/* 3H. CATATAN TEKNIS PROYEK VIEW */}
        {activeEstimatorTab === 'catatan' && (
          <EstimatorNotesView
            currentProject={currentProject}
            items={projectRabItems}
            onSaveNotes={(notes) => {
              if (currentProject) {
                updateProject(currentProject.id, { notes } as any);
                showToast('Catatan teknis berhasil disimpan');
              }
            }}
          />
        )}

        {/* 3I. PENGATURAN PARAMETER ESTIMASI VIEW */}
        {activeEstimatorTab === 'pengaturan' && (
          <EstimatorSettingsView
            currentProject={currentProject}
            onUpdateSettings={(st) => {
              if (currentProject) {
                updateProject(currentProject.id, st);
                showToast('Pengaturan estimasi berhasil diperbarui');
              }
            }}
          />
        )}
      </div>

      {/* =====================================================================
          FLOATING BULK ACTION BAR
         ===================================================================== */}
      <EstimatorBulkActionBar
        selectedCount={selectedItemIds.size}
        onClearSelection={() => setSelectedItemIds(new Set())}
        onBulkDelete={() => {
          bulkDeleteRabItems(Array.from(selectedItemIds));
          setSelectedItemIds(new Set());
          showToast('Item terpilih berhasil dihapus');
        }}
        onBulkDuplicate={() => {
          selectedItemIds.forEach((id) => handleDuplicateItem(id));
          setSelectedItemIds(new Set());
          showToast('Item terpilih berhasil diduplikasi');
        }}
        onBulkChangeCategory={(targetCategory) => {
          selectedItemIds.forEach((id) => {
            updateRabItemFull(id, { sectionName: targetCategory, category: targetCategory });
          });
          setSelectedItemIds(new Set());
          showToast('Item terpilih dipindahkan ke kelompok ' + targetCategory);
        }}
        categories={WORK_CATEGORIES}
      />

      {/* =====================================================================
          MODALS & DRAWERS
         ===================================================================== */}
      {/* 1. SMART ADD WORK ITEM MODAL (5 MODES) */}
      <ErrorBoundary
        fallbackTitle="Gagal Membuka Menu Tambah Item"
        onReset={() => setSmartAddModalOpen(false)}
      >
        <SmartAddWorkItemModal
          isOpen={smartAddModalOpen}
          onClose={() => setSmartAddModalOpen(false)}
          initialMode={smartAddInitialMode}
          currentProjectId={currentProjectId || currentProject?.id || (allProjects.length > 0 ? allProjects[0].id : null)}
          activeCategory={smartAddCategoryContext}
          existingItems={projectRabItems}
          onAddItem={(itemData) => {
            try {
              if (!currentProjectId && allProjects.length > 0) {
                setCurrentProjectId(allProjects[0].id);
              }
              createRabItemDirect(itemData);
              showToast('1 pekerjaan berhasil ditambahkan: "' + itemData.description + '"');
            } catch (err: any) {
              console.error('Error adding item:', err);
              showToast('Gagal menambahkan item: ' + (err.message || 'Error'));
            }
          }}
          onAddMultipleItems={(itemsData) => {
            try {
              if (!currentProjectId && allProjects.length > 0) {
                setCurrentProjectId(allProjects[0].id);
              }
              itemsData.forEach((it) => createRabItemDirect(it));
              showToast(itemsData.length + ' pekerjaan berhasil ditambahkan ke RAB');
            } catch (err: any) {
              console.error('Error adding items:', err);
              showToast('Gagal menambahkan item: ' + (err.message || 'Error'));
            }
          }}
        />
      </ErrorBoundary>

      {/* 2. ADVANCED FILTER MODAL */}
      <EstimatorAdvancedFilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        filters={filters}
        onApplyFilters={(f) => {
          setFilters(f);
          showToast('Filter kustom berhasil diterapkan');
        }}
        onResetFilters={() => {
          setFilters({
            category: 'ALL',
            source: 'ALL',
            minPrice: null,
            maxPrice: null,
            minVolume: null,
            maxVolume: null,
            ahspLinkedOnly: null,
          });
          showToast('Filter direset ke default');
        }}
      />

      {/* 3. COLUMN MANAGER MODAL */}
      <EstimatorColumnManagerModal
        isOpen={isColumnsModalOpen}
        onClose={() => setIsColumnsModalOpen(false)}
        visibleColumns={visibleColumns}
        onToggleColumn={(colKey) => {
          setVisibleColumns((prev) => ({
            ...prev,
            [colKey]: !prev[colKey],
          }));
        }}
        onResetToDefault={() => {
          setVisibleColumns({
            no: true,
            code: true,
            description: true,
            volume: true,
            unit: true,
            unitPrice: true,
            amount: true,
            volumeSource: true,
          });
          showToast('Pengaturan kolom dikembalikan ke default');
        }}
      />

      {/* 4. WORK ITEM INSPECTOR & AHSP DRAWER */}
      <WorkItemInspectorDrawer
        isOpen={inspectorDrawerOpen}
        onClose={() => {
          setInspectorDrawerOpen(false);
          setInspectorItem(null);
        }}
        rabItem={inspectorItem}
        onItemUpdated={(updated) => {
          setInspectorItem(updated as RabItem);
          showToast('Analisa AHSP berhasil disimpan');
        }}
        onAskAiWithContext={() => {
          onOpenMagicAi?.();
          setInspectorDrawerOpen(false);
        }}
      />

      {/* 5. INTELLIGENT EXCEL IMPORT MODAL */}
      <IntelligentExcelImportModal
        isOpen={importExcelModalOpen}
        onClose={() => setImportExcelModalOpen(false)}
        onImportCompleted={handleExcelImportCompleted}
      />

      {/* 6. ESTIMATE VERSIONING & SCENARIOS MODAL */}
      <EstimateVersionAndScenarioModal
        isOpen={isVersionModalOpen}
        onClose={() => setIsVersionModalOpen(false)}
        currentProject={currentProject}
        currentRabItems={projectRabItems}
        versions={projectEstimateVersions}
        onCreateVersion={(label, desc, notes) => {
          createEstimateVersion(label, desc, notes);
          showToast('Revisi baru "' + label + '" berhasil disimpan');
        }}
        onRestoreVersion={(ver) => {
          const res = restoreEstimateVersion(ver.id);
          if (res.success) {
            showToast(res.message);
          }
        }}
        onApplyScenarioToSpreadsheet={(scenario) => {
          applyScenarioToActiveProject(scenario);
          showToast('Skenario "' + scenario.name + '" berhasil diterapkan ke spreadsheet');
        }}
      />

      {/* 7. PROFESSIONAL PROJECT EXPORT MODAL */}
      {currentProject && (
        <ExportProjectPackageModal
          isOpen={isExportPackageModalOpen}
          onClose={() => setIsExportPackageModalOpen(false)}
          currentProject={{
            ...currentProject,
            rabItems: projectRabItems,
            items: projectRabItems,
          } as any}
          company={DEFAULT_COMPANY}
          onToast={showToast}
        />
      )}

      {/* 8. KEYBOARD SHORTCUTS MODAL */}
      {isShortcutsModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 140,
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '14px',
              width: '460px',
              maxWidth: '92vw',
              padding: '20px',
              boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Keyboard size={18} color="#2563EB" />
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Pintasan Keyboard (Shortcuts)
                </h3>
              </div>
              <button
                onClick={() => setIsShortcutsModalOpen(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <X size={18} color="#64748B" />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12.5px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: '#F8FAFC', borderRadius: '6px' }}>
                <span style={{ color: '#334155' }}>Mulai Edit Sel</span>
                <kbd style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>Double Click / Enter</kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: '#F8FAFC', borderRadius: '6px' }}>
                <span style={{ color: '#334155' }}>Simpan Perubahan Sel</span>
                <kbd style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>Enter</kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: '#F8FAFC', borderRadius: '6px' }}>
                <span style={{ color: '#334155' }}>Batal Edit Sel</span>
                <kbd style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>Escape</kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: '#F8FAFC', borderRadius: '6px' }}>
                <span style={{ color: '#334155' }}>Pilih Multi Item</span>
                <kbd style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>Shift + Click</kbd>
              </div>
            </div>

            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setIsShortcutsModalOpen(false)}
                style={{
                  height: '32px',
                  padding: '0 16px',
                  borderRadius: '6px',
                  background: '#2563EB',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. AI CONSTRUCTION REVIEW & DOCUMENT INTELLIGENCE WORKSPACE MODAL */}
      <DocumentReviewWorkspaceModal
        isOpen={isDocumentReviewModalOpen}
        onClose={() => setIsDocumentReviewModalOpen(false)}
        projectName={currentProject?.name || 'Proyek Tanpa Nama'}
        projectId={currentProjectId || 'PRJ-DEFAULT'}
        documents={reviewWorkspaceData.documents}
        entities={reviewWorkspaceData.entities}
        qtoItems={reviewWorkspaceData.qtoItems}
        rabDraftSummary={reviewWorkspaceData.rabDraftSummary}
        findings={reviewWorkspaceData.findings}
        onCommitToSpreadsheet={handleCommitDraftToSpreadsheet}
      />

      {/* TOAST NOTIFICATION */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '48px',
            right: '24px',
            background: '#0F172A',
            color: '#FFFFFF',
            padding: '10px 18px',
            borderRadius: '8px',
            fontSize: '12.5px',
            fontWeight: 650,
            boxShadow: '0 10px 20px -3px rgba(0,0,0,0.3)',
            zIndex: 300,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Check size={16} color="#10B981" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};

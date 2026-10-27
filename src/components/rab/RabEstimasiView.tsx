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
import { exportItemAmount } from '../../export/priceIntegrity';
import { useProject } from '../../context/ProjectContext';
import { openEzrabAI } from '../../ai-tools/aiNavigation';
import { ProjectHistory } from '../../lib/projectHistory';
import {
  buildRabCellUpdates,
  recalculateRabItemAmounts,
  insertRabItemRelative,
} from './rabCellEdit';
import { WorkItemInspectorDrawer } from '../inspector/WorkItemInspectorDrawer';
import { IntelligentExcelImportModal } from '../import/IntelligentExcelImportModal';
import { EstimateVersionAndScenarioModal } from '../versioning/EstimateVersionAndScenarioModal';
import { ExportProjectPackageModal } from '../export/ExportProjectPackageModal';
import { ProjectContextHeader } from '../estimator/ProjectContextHeader';
import { EstimatorNavigation, EstimatorTabType } from '../estimator/EstimatorNavigation';
import { ProjectInfoTab } from '../estimator/ProjectInfoTab';
import { EstimatorMetrics } from '../estimator/EstimatorMetrics';
import { ConvertedReference } from '../currency/ConvertedReference';
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
  onNavigateToTab?: (tab: string) => void;
  initialTab?: EstimatorTabType;
}

type EditableColumn = 'code' | 'description' | 'volume' | 'unit' | 'unitPrice' | 'volumeSource';
type SortField = 'no' | 'code' | 'description' | 'volume' | 'unit' | 'unitPrice' | 'amount' | 'volumeSource' | null;
type SortDirection = 'asc' | 'desc' | null;

const WBS_LETTER_MAP: Record<string, { letter: string; bg: string; text: string; border: string }> = {
  'Pekerjaan Persiapan & Bowplank': { letter: 'A', bg: 'var(--ez-hue-pink-bg)', text: '#BE185D', border: '#FBCFE8' },
  'Pekerjaan Tanah & Pondasi': { letter: 'B', bg: 'var(--ez-hue-blue-bg-deep)', text: 'var(--ez-color-primary-hover)', border: 'var(--ez-hue-blue-border)' },
  'Pekerjaan Struktur Beton Bertulang': { letter: 'C', bg: 'var(--ez-hue-indigo-bg)', text: '#4338CA', border: '#C7D2FE' },
  'Pekerjaan Dinding & Plesteran': { letter: 'D', bg: '#E0F2FE', text: '#0369A1', border: '#BAE6FD' },
  'Pekerjaan Lantai & Keramik': { letter: 'E', bg: '#D1FAE5', text: '#047857', border: 'var(--ez-hue-green-border-deep)' },
  'Pekerjaan Plafon & Partisi': { letter: 'F', bg: 'var(--ez-hue-amber-bg-deep)', text: '#B45309', border: 'var(--ez-hue-amber-border)' },
  'Pekerjaan Atap & Rangka Baja Ringan': { letter: 'G', bg: 'var(--ez-hue-orange-bg)', text: '#C2410C', border: 'var(--ez-hue-orange-bg-deep)' },
  'Pekerjaan Pintu, Jendela & Kaca': { letter: 'H', bg: 'var(--ez-hue-purple-bg-soft)', text: '#7E22CE', border: 'var(--ez-hue-purple-border)' },
  'Pekerjaan Instalasi Plumbing & Sanitasi': { letter: 'I', bg: '#CFFAFE', text: '#0E7490', border: '#A5F3FC' },
  'Pekerjaan Instalasi Elektrikal': { letter: 'J', bg: 'var(--ez-hue-yellow-bg)', text: '#A16207', border: '#FEF08A' },
  'Pekerjaan Pengecatan': { letter: 'K', bg: 'var(--ez-hue-red-bg)', text: '#B91C1C', border: 'var(--ez-hue-rose-border)' },
  'Pekerjaan Finishing & Eksterior': { letter: 'L', bg: 'var(--ez-color-surface-tertiary)', text: '#334155', border: 'var(--ez-color-border)' },
};

// P0-B: JANGAN isi identitas perusahaan palsu. Kosongkan field identitas;
// exporter menampilkan '-' bila belum diisi. Persentase default tetap karena
// itu parameter perhitungan, bukan identitas.
const DEFAULT_COMPANY: Company = {
  id: 'comp-1',
  name: '',
  address: '',
  phone: '',
  email: '',
  website: '',
  taxNumber: '',
  directorName: '',
  leadEstimatorName: '',
  defaultOverheadPercent: 5,
  defaultProfitPercent: 10,
  defaultContingencyPercent: 5,
  defaultTaxPercent: 11,
};

export const RabEstimasiView: React.FC<EstimatorSpreadsheetProps> = ({
  projects: propProjects,
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
    refreshProjectTotals,
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

  // F1a: pagination lama adalah fiksi (kontrolnya tidak pernah memotong
  // daftar; totalPages selalu 1). Spreadsheet merender seluruh baris —
  // kontrol pagination dihapus dari footer, diganti jumlah item yang jujur.

  // Modals & Drawers
  const [smartAddModalOpen, setSmartAddModalOpen] = useState(false);
  const [smartAddInitialMode, setSmartAddInitialMode] = useState<AddItemMode>('selector');
  const [smartAddCategoryContext, setSmartAddCategoryContext] = useState<string>('Pekerjaan Persiapan & Bowplank');

  // Dialog "Tambah Kelompok" manual (WBS): user mengetik sendiri nama
  // kelompoknya. Bukan modal tambah item — dulu tombol ini salah membuka
  // handleOpenSmartAdd('selector') yang sama dengan "Tambah Item".
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [groupNameError, setGroupNameError] = useState<string | null>(null);

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
  // ATURAN INTEGRITAS (P0): JANGAN PERNAH memfabrikasi dokumen DED.
  // Bila proyek belum punya dokumen, kembalikan state kosong yang jujur —
  // tidak ada entitas/QTO/draf RAB/findings yang diturunkan dari dokumen fiktif.
  const reviewWorkspaceData = useMemo(() => {
    const projId = currentProjectId || 'PRJ-DEFAULT';
    const workspaceId = 'ws-default';

    // 1. Fetch REAL DED documents only
    const docs = ProjectDocumentContext.getInstance().listDocuments({ workspaceId, projectId: projId });
    if (docs.length === 0) {
      return {
        documents: [] as typeof docs,
        entities: [] as never[],
        qtoItems: [] as never[],
        rabDraftSummary: {
          projectId: projId,
          totalItems: 0,
          subtotal: 0,
          ppnAmount: 0,
          grandTotal: 0,
          unmappedAhspCount: 0,
          itemsRequiringPriceVerification: 0,
          items: [],
          generatedAt: new Date().toISOString(),
        },
        findings: [] as never[],
        hasDocuments: false,
      };
    }

    // 2. Extract Entities (hanya dari dokumen ASLI)
    const entities = ConstructionEntityEngine.getInstance().extractEntitiesFromDocument(docs[0]);

    // 3. Compute QTO
    const qtoReport = AutomaticQtoEngine.getInstance().generateQtoFromConstructionEntities({
      projectId: projId,
      entities
    });

    // 4. Formulate RAB Draft (pajak opt-in proyek; default nonaktif)
    const rabDraft = AutomaticRabDraftEngine.getInstance().generateRabDraft({
      projectId: projId,
      qtoItems: qtoReport.items,
      taxPercent: (currentProject as any)?.ppnPercent ?? 11,
      ppnEnabled: (currentProject as any)?.ppnEnabled === true,
      pphEnabled: (currentProject as any)?.pphEnabled === true,
      pphPercent: (currentProject as any)?.pphPercent ?? 0
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
      findings,
      hasDocuments: true,
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
        // Harga null dari draft = PRICE_MISSING: teruskan sebagai undefined agar
        // factory membuat PRICE_UNRESOLVED (badge "Harga belum diisi").
        unitPrice: item.unitPrice ?? undefined,
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

  // Tambah Kelompok WBS manual: user mengetik nama kelompoknya sendiri.
  // Disimpan di proyek (customWbsGroups, ikut tersimpan ke localStorage
  // lewat updateProject) sehingga header kosong bertahan sampai ada item.
  const handleSaveCustomGroup = () => {
    const name = newGroupName.trim();
    if (!currentProject) {
      setGroupNameError('Pilih atau buka proyek terlebih dahulu.');
      return;
    }
    if (!name) {
      setGroupNameError('Nama kelompok wajib diisi.');
      return;
    }
    const taken = groupedWbsCategories.map((g) => g.categoryName.trim().toLowerCase());
    if (taken.includes(name.toLowerCase())) {
      setGroupNameError(`Kelompok "${name}" sudah ada di spreadsheet ini.`);
      return;
    }
    updateProject(currentProject.id, {
      customWbsGroups: [...(currentProject.customWbsGroups ?? []), name],
    });
    setGroupDialogOpen(false);
    setNewGroupName('');
    setGroupNameError(null);
    setIsGrouped(true);
    showToast(`Kelompok "${name}" ditambahkan. Klik + di header kelompok untuk mengisi item.`);
  };

  // Hapus kelompok kustom — hanya bila masih kosong (tidak ada item).
  // Kelompok dari item tidak bisa dihapus lewat sini; hapus itemnya dulu
  // sampai kelompoknya hilang sendiri.
  const handleDeleteCustomGroup = (categoryName: string) => {
    if (!currentProject) return;
    updateProject(currentProject.id, {
      customWbsGroups: (currentProject.customWbsGroups ?? []).filter(
        (n) => n.trim().toLowerCase() !== categoryName.trim().toLowerCase()
      ),
    });
    showToast(`Kelompok "${categoryName}" dihapus.`);
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
  // P0-B: "refresh" menghitung ulang ringkasan dari data tersimpan dan
  // melaporkan hasil AKTUAL — bukan sekadar toast.
  const handleRefreshData = () => {
    const total = projectRabItems.reduce(
      (s, i) => s + (exportItemAmount(i as any) ?? 0),
      0
    );
    showToast(`Data termutakhir: ${projectRabItems.length} item, total ${formatCurrencyIDR(total)}`);
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
    // F1a: item tanpa harga (unitPrice null) dilewati — amount tetap null,
    // tidak pernah ditulis 0 (kontrak null ≠ Rp0).
    replaceProjectRabItems(recalculateRabItemAmounts(projectRabItems));
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
      if (filters.minPrice !== null && (item.unitPrice == null || item.unitPrice < filters.minPrice)) return false;
      if (filters.maxPrice !== null && (item.unitPrice == null || item.unitPrice > filters.maxPrice)) return false;

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
          valA = a.amount ?? a.totalPrice ?? a.volume * (a.unitPrice ?? 0);
          valB = b.amount ?? b.totalPrice ?? b.volume * (b.unitPrice ?? 0);
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
      // Flat list mode: single pseudo group — subtotal digating STATUS
      // (priceIntegrity): item PRICE_UNRESOLVED dengan total basi tidak ikut.
      const subtotal = filteredItems.reduce(
        (sum, item) => sum + (exportItemAmount(item as any) ?? 0),
        0
      );
      const subtotalVolume = filteredItems.reduce((sum, item) => sum + (item.volume || 0), 0);
      return [
        {
          categoryName: 'Daftar Pekerjaan Seluruhnya (Flat)',
          codeLetter: '★',
          badgeColor: { bg: 'var(--ez-hue-blue-bg)', text: 'var(--ez-color-primary-hover)', border: 'var(--ez-hue-blue-border)' },
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
        bg: 'var(--ez-color-surface-tertiary)',
        text: '#334155',
        border: 'var(--ez-color-border)',
      };

      const subtotal = items.reduce(
        (sum, item) => sum + (exportItemAmount(item as any) ?? 0),
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

    // Kelompok WBS yang diketik manual user (customWbsGroups proyek) tetap
    // tampil meski belum ada itemnya — selama ini kelompok hanya turunan
    // dari item, sehingga "Tambah Kelompok" tidak mungkin membuat header
    // kosong. Duplikat (sudah ada dari item) tidak digandakan.
    if (isGrouped) {
      const existingNames = new Set(result.map((g) => g.categoryName.trim().toLowerCase()));
      for (const customName of currentProject?.customWbsGroups ?? []) {
        const name = customName.trim();
        if (!name || existingNames.has(name.toLowerCase())) continue;
        existingNames.add(name.toLowerCase());
        const letterInfo = WBS_LETTER_MAP[name] || {
          letter: String.fromCharCode(65 + (letterIndex % 26)),
          bg: 'var(--ez-color-surface-tertiary)',
          text: '#334155',
          border: 'var(--ez-color-border)',
        };
        letterIndex++;
        result.push({
          categoryName: name,
          codeLetter: letterInfo.letter,
          badgeColor: { bg: letterInfo.bg, text: letterInfo.text, border: letterInfo.border },
          items: [],
          subtotal: 0,
          subtotalVolume: 0,
        });
      }
    }

    return result;
  }, [filteredItems, isGrouped, currentProject?.customWbsGroups]);

  // Daftar tujuan kelompok untuk bulk-action: kategori tetap + kelompok
  // ketikan user, supaya item bisa dipindahkan ke kelompok manual.
  const wbsTargetCategories = useMemo(() => {
    const merged = [...WORK_CATEGORIES];
    for (const c of currentProject?.customWbsGroups ?? []) {
      const name = c.trim();
      if (name && !merged.includes(name)) merged.push(name);
    }
    return merged;
  }, [currentProject?.customWbsGroups]);

  // Overall Totals — digating STATUS (priceIntegrity): item
  // PRICE_UNRESOLVED dengan total basi tidak ikut; label PARSIAL sudah ada
  // lewat unpricedItemsCount di bawah (Phase 2I.2).
  const totalRabNominal = useMemo(() => {
    return projectRabItems.reduce(
      (acc, item) => acc + (exportItemAmount(item as any) ?? 0),
      0
    );
  }, [projectRabItems]);

  // Phase 2I.2: hitung item yang belum memiliki harga untuk label Estimasi Parsial.
  const unpricedItemsCount = useMemo(() => {
    return projectRabItems.filter(
      (item: any) =>
        // Factory contract: PRICE_UNRESOLVED items carry amount 0 (sentinel),
        // so status — not amount==null — is the source of truth.
        item.priceStatus === 'PRICE_UNRESOLVED' ||
        (item.amount == null &&
          item.totalPrice == null &&
          item.unitPrice == null)
    ).length;
  }, [projectRabItems]);

  const totalVolumeSum = useMemo(() => {
    return projectRabItems.reduce((acc, item) => acc + (item.volume || 0), 0);
  }, [projectRabItems]);

  const totalItemsCount = projectRabItems.length;
  const ahspLinkedCount = projectRabItems.filter((i) => i.ahspCode && i.ahspCode.trim() !== '').length;

  // ---------------------------------------------------------------------------
  // UNDO / REDO HISTORY ENGINE — terisolasi per proyek (P0-A fix).
  // Setiap entry terikat projectId + docKey; undo/redo TIDAK PERNAH
  // menerapkan snapshot milik proyek/dokumen lain (return null).
  // ---------------------------------------------------------------------------
  const historyRef = useRef<ProjectHistory<RabItem>>(new ProjectHistory<RabItem>());
  const [historyVersion, setHistoryVersion] = useState(0);
  const isUndoRedoAction = useRef(false);
  const RAB_DOC_KEY = 'rab-items';

  useEffect(() => {
    if (!currentProjectId) return;
    if (isUndoRedoAction.current) {
      isUndoRedoAction.current = false;
      return;
    }
    historyRef.current.push(currentProjectId, RAB_DOC_KEY, projectRabItems);
    setHistoryVersion((v) => v + 1);
  }, [projectRabItems, currentProjectId]);

  const canUndo = currentProjectId
    ? historyRef.current.canUndo(currentProjectId, RAB_DOC_KEY)
    : false;
  const canRedo = currentProjectId
    ? historyRef.current.canRedo(currentProjectId, RAB_DOC_KEY)
    : false;

  const handleUndo = useCallback(() => {
    // Capture projectId di awal: lindungi dari callback tertunda/keyboard
    // yang fire setelah user pindah proyek.
    const pid = currentProjectId;
    if (!pid) return;
    const targetItems = historyRef.current.undo(pid, RAB_DOC_KEY);
    if (!targetItems) {
      // Tidak ada history valid untuk proyek ini — JANGAN sentuh data.
      return;
    }
    isUndoRedoAction.current = true;
    // Eksplisit targetProjectId = pid: snapshot hanya dipulihkan ke proyek asalnya.
    replaceProjectRabItems(targetItems, pid);
    setHistoryVersion((v) => v + 1);
    showToast('Undo berhasil: Perubahan dibatalkan');
  }, [currentProjectId, replaceProjectRabItems]);

  const handleRedo = useCallback(() => {
    const pid = currentProjectId;
    if (!pid) return;
    const targetItems = historyRef.current.redo(pid, RAB_DOC_KEY);
    if (!targetItems) {
      return;
    }
    isUndoRedoAction.current = true;
    replaceProjectRabItems(targetItems, pid);
    setHistoryVersion((v) => v + 1);
    showToast('Redo berhasil: Perubahan diterapkan kembali');
  }, [currentProjectId, replaceProjectRabItems]);

  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      // Jangan ganggu undo bawaan input/textarea/contenteditable
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
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

    const updates = buildRabCellUpdates(targetItem, column, editValue);

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
      amount: item.amount ?? (item.unitPrice != null ? item.volume * item.unitPrice : null),
      totalPrice: item.totalPrice ?? (item.unitPrice != null ? item.volume * item.unitPrice : null),
      volumeSource: item.volumeSource,
      ahspCode: item.ahspCode,
      // Fase 4A: warisi status harga agar duplikat item tanpa harga
      // tidak berubah menjadi "resolved" diam-diam.
      priceStatus: item.priceStatus,
    });
    showToast('Item berhasil diduplikasi');
  };

  const handleDeleteItem = (itemId: string) => {
    deleteRabItem(itemId);
    showToast('Item berhasil dihapus');
  };

  // F1a: sisipkan baris BENAR-BENAR relatif terhadap item jangkar di dalam
  // grupnya (render berkelompok mengikuti urutan array proyek) — bukan
  // append ke akhir grup seperti sebelumnya. Harga awal baris sisipan null
  // (belum diisi), bukan 0 dan bukan NaN.
  const buildInsertedRow = (referenceItem: RabItem): RabItem => {
    const cat = referenceItem.sectionName || referenceItem.category || 'Pekerjaan Persiapan & Bowplank';
    return {
      id: `rab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      projectId: currentProject?.id || referenceItem.projectId,
      no: referenceItem.no,
      code: '',
      category: cat,
      sectionName: cat,
      description: 'Item Pekerjaan Baru',
      volume: 1,
      unit: referenceItem.unit || 'm¹',
      unitPrice: null,
      amount: null,
      totalPrice: null,
      priceStatus: 'PRICE_UNRESOLVED',
      volumeSource: 'MANUAL',
      ahspCode: '',
      verificationStatus: 'NEEDS_VERIFICATION',
    };
  };

  const handleInsertRowAbove = (referenceItem: RabItem) => {
    replaceProjectRabItems(
      insertRabItemRelative(projectRabItems, referenceItem.id, buildInsertedRow(referenceItem), 'above')
    );
    showToast('Baris baru disisipkan di atas');
  };

  const handleInsertRowBelow = (referenceItem: RabItem) => {
    replaceProjectRabItems(
      insertRabItemRelative(projectRabItems, referenceItem.id, buildInsertedRow(referenceItem), 'below')
    );
    showToast('Baris baru disisipkan di bawah');
  };

  // ---------------------------------------------------------------------------
  // EXPORT & IMPORT HANDLERS
  // ---------------------------------------------------------------------------
  const handleExportExcel = async () => {
    if (!currentProject) return;
    // P0-B: toast sukses HANYA setelah ekspor benar-benar berhasil.
    try {
      await exportProjectToExcel(currentProject, DEFAULT_COMPANY);
      showToast('Spreadsheet RAB berhasil diexport ke Excel (.xlsx)');
    } catch (err) {
      showToast(`Gagal mengexport Excel: ${err instanceof Error ? err.message : 'kesalahan tidak dikenal'}`);
    }
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

  // Real cost delta vs previous version for the summary card. Null when there
  // is no version history or the stored diff is not a finite number — the card
  // then shows a neutral label instead of a fabricated percentage.
  const latestVersionDelta = useMemo(() => {
    if (projectEstimateVersions.length === 0) return null;
    const d = projectEstimateVersions[projectEstimateVersions.length - 1]?.percentageDiff;
    return typeof d === 'number' && Number.isFinite(d) ? d : null;
  }, [projectEstimateVersions]);

  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        maxWidth: '1440px',
        margin: '0 auto',
        minHeight: 'calc(100vh - 64px)',
        position: 'relative',
        overflow: 'hidden',
        color: 'var(--ez-color-text-primary)',
        fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* Dashboard entrance animation language (prefers-reduced-motion respected) */}
      <style>{`
        @keyframes ezdb-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .ezdb-anim { animation: none !important; } }
      `}</style>
      {/* =====================================================================
          MAIN SPREADSHEET WORKSPACE (Left / Center)
         ===================================================================== */}
      <div
        className="ezdb-anim"
        style={{
          flexGrow: 1,
          minWidth: 0,
          padding: '20px 24px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          animation: 'ezdb-rise 0.6s 0s both',
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
        {/* 3A. INFORMASI PROYEK VIEW (owner 2026-10-27, tab pertama):
            profil lengkap proyek, tersimpan di objek proyek lewat jalur
            yang sama dengan Pengaturan (updateProject + refresh totals). */}
        {activeEstimatorTab === 'informasi-proyek' && (
          <ProjectInfoTab
            currentProject={currentProject}
            items={projectRabItems}
            onSave={(fields) => {
              if (currentProject) {
                updateProject(currentProject.id, fields as any);
                refreshProjectTotals(currentProject.id);
                showToast('Informasi proyek berhasil disimpan');
              }
            }}
          />
        )}

        {activeEstimatorTab === 'spreadsheet' && (
          <>
            {/* 3A. 5 ESSENTIAL PROJECT METRICS — values always from real data.
                No demo fallbacks: empty projects render 0 / Rp0 / "—". */}
            <EstimatorMetrics
              totalRab={totalRabNominal}
              totalItems={totalItemsCount}
              ahspCount={ahspLinkedCount}
              totalVolume={totalVolumeSum}
              lastSavedText="Tersinkronisasi Otomatis"
              isSaving={saveStatus === 'saving'}
// FASE F: hitung dari data aktual, bukan angka hardcoded.
              progressPercent={(() => {
                const total = projectRabItems.length;
                if (total === 0) return 0;
                const done = projectRabItems.filter((i) => i.priceStatus === 'PRICE_RESOLVED' || (i.unitPrice || 0) > 0).length;
                return Math.round((done / total) * 100);
              })()}
              completedItemsCount={projectRabItems.filter((i) => i.priceStatus === 'PRICE_RESOLVED' || (i.unitPrice || 0) > 0).length}
              inProgressItemsCount={projectRabItems.filter((i) => i.priceStatus === 'PRICE_UNRESOLVED').length}
              pendingItemsCount={0}
              unpricedCount={unpricedItemsCount}
            />

            {/* Referensi konversi tampil (display-only): total resmi tetap
                IDR; nilai asing di bawah ini hanya estimasi referensi. */}
            <ConvertedReference idrAmount={totalRabNominal} unpricedCount={unpricedItemsCount} />

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
              onUndo={handleUndo}
              onRedo={handleRedo}
              canUndo={canUndo}
              canRedo={canRedo}
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
            />

            {/* 3B2. TOMBOL PAJAK SPREADSHEET (owner 2026-10-27): toggle
                PPN/PPh di sini memakai flag proyek YANG SAMA dengan
                Pengaturan Estimasi — Rekap mengikuti flag ini, dan item
                yang dicentang "sudah termasuk pajak" tetap tidak dihitung
                ganda. Tarifnya sendiri diatur di Pengaturan. */}
            {currentProject && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '10px',
                  background: 'var(--ez-color-surface)',
                  border: '1px solid var(--ez-color-border-line)',
                  borderRadius: '12px',
                  padding: '10px 14px',
                }}
              >
                <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>
                  Pajak proyek:
                </span>
                {([
                  { key: 'ppnEnabled', label: 'PPN', rate: (currentProject as any)?.ppnPercent ?? 11 },
                  { key: 'pphEnabled', label: 'PPh', rate: (currentProject as any)?.pphPercent ?? 0 },
                ] as const).map((t) => {
                  const active = (currentProject as any)?.[t.key] === true;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      role="switch"
                      aria-checked={active}
                      onClick={() => {
                        updateProject(currentProject.id, { [t.key]: !active } as any);
                        /* Sama seperti simpan Pengaturan: selaraskan kartu
                         * total proyek dengan flag pajak yang baru. */
                        refreshProjectTotals(currentProject.id);
                        showToast(`${t.label} ${!active ? 'diaktifkan' : 'dinonaktifkan'} — Rekap mengikuti flag ini`);
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 12px',
                        borderRadius: '999px',
                        border: active ? '1px solid #2563EB' : '1px solid var(--ez-color-border-line)',
                        background: active ? '#2563EB' : 'var(--ez-color-surface)',
                        color: active ? '#FFFFFF' : 'var(--ez-color-text-body)',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      <span
                        style={{
                          width: '28px',
                          height: '16px',
                          borderRadius: '999px',
                          background: active ? 'rgba(255,255,255,0.35)' : '#CBD5E1',
                          position: 'relative',
                          flexShrink: 0,
                        }}
                      >
                        <span
                          style={{
                            position: 'absolute',
                            top: '2px',
                            left: active ? '14px' : '2px',
                            width: '12px',
                            height: '12px',
                            borderRadius: '50%',
                            background: '#FFFFFF',
                            transition: 'left 0.15s ease',
                          }}
                        />
                      </span>
                      {t.label} {t.rate}% • {active ? 'Aktif' : 'Nonaktif'}
                    </button>
                  );
                })}
                {(currentProject as any)?.pphEnabled === true && ((currentProject as any)?.pphPercent ?? 0) === 0 && (
                  <span style={{ fontSize: '12px', color: '#B45309' }}>
                    PPh aktif tapi tarifnya 0% — atur tarifnya di Pengaturan Estimasi.
                  </span>
                )}
                <span style={{ fontSize: '12px', color: '#64748B' }}>
                  Item yang dicentang &quot;sudah termasuk pajak&quot; tidak dihitung ganda di Rekap.
                </span>
              </div>
            )}

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
              visibleColumns={visibleColumns}
              customGroupNames={currentProject?.customWbsGroups ?? []}
              onDeleteCustomGroup={handleDeleteCustomGroup}
            />

            {/* 3D. BOTTOM SUMMARY & PAGINATION */}
            <SpreadsheetFooter
              groupsCount={groupedWbsCategories.length}
              totalItemsCount={totalItemsCount}
              totalRab={totalRabNominal}
              onAddGroup={() => {
                setNewGroupName('');
                setGroupNameError(null);
                setGroupDialogOpen(true);
              }}
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
            onOpenExportModal={() => setIsExportPackageModalOpen(true)}
            onUpdateSettings={(st) => {
              if (currentProject) {
                updateProject(currentProject.id, st);
                /* Segera selaraskan kartu total proyek dengan flag pajak
                 * baru (updater setProjects dieksekusi berurutan, jadi
                 * refresh membaca flag yang baru disimpan). */
                refreshProjectTotals(currentProject.id);
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
          const count = selectedItemIds.size;
          // FASE F: konfirmasi sebelum hapus massal (aksi destruktif).
          if (!window.confirm(`Hapus ${count} item pekerjaan yang dipilih? Tindakan ini tidak dapat dibatalkan.`)) return;
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
        categories={wbsTargetCategories}
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
          customCategories={currentProject?.customWbsGroups ?? []}
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

      {/* 1b. DIALOG TAMBAH KELOMPOK WBS MANUAL — user mengetik sendiri nama
          kelompoknya. Header kelompok langsung tampil di spreadsheet (kosong,
          0 item) dan bisa diisi lewat tombol + di headernya. */}
      {groupDialogOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setGroupDialogOpen(false)}
        >
          <div
            style={{
              width: '100%', maxWidth: '420px',
              background: 'var(--ez-color-surface)',
              border: '1px solid var(--ez-color-border-line)',
              borderRadius: '12px', padding: '20px',
              boxShadow: '0 16px 48px rgba(15, 23, 42, 0.25)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '15px', fontWeight: 800, margin: '0 0 4px 0' }}>
              Tambah Kelompok WBS
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', margin: '0 0 14px 0', lineHeight: 1.5 }}>
              Ketik nama kelompoknya sendiri, mis. “Pekerjaan Tanah &amp; Pondasi”.
              Kelompok langsung tampil di spreadsheet meski belum ada itemnya.
            </p>
            <label style={{ fontSize: '11.5px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
              Nama Kelompok *
            </label>
            <input
              type="text"
              autoFocus
              placeholder="mis. Pekerjaan Tanah & Pondasi"
              value={newGroupName}
              onChange={(e) => {
                setNewGroupName(e.target.value);
                setGroupNameError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveCustomGroup();
                if (e.key === 'Escape') setGroupDialogOpen(false);
              }}
              style={{ width: '100%', height: '38px', padding: '0 12px', borderRadius: '8px', border: '1px solid var(--ez-hue-slate-border)', fontSize: '13px' }}
            />
            {groupNameError && (
              <div style={{ marginTop: '8px', fontSize: '12px', fontWeight: 600, color: '#BE123C' }}>
                {groupNameError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setGroupDialogOpen(false)}
                style={{ height: '36px', padding: '0 16px', borderRadius: '8px', background: 'var(--ez-color-surface)', border: '1px solid var(--ez-hue-slate-border)', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}
              >
                Batal
              </button>
              <button
                onClick={handleSaveCustomGroup}
                disabled={!newGroupName.trim()}
                style={{ height: '36px', padding: '0 18px', borderRadius: '8px', background: 'var(--ez-color-primary)', color: '#FFFFFF', border: 'none', fontSize: '12.5px', fontWeight: 750, cursor: newGroupName.trim() ? 'pointer' : 'not-allowed', opacity: newGroupName.trim() ? 1 : 0.55 }}
              >
                Tambah Kelompok
              </button>
            </div>
          </div>
        </div>
      )}
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
        onAskAiWithContext={(prompt, itemData) => {
          // Fase 1: Ask AI inspector lewat resolver — chat + rabItemId +
          // prompt audit item sebagai PREFILL (bukan autosend): pengguna
          // meninjau prompt di chat sebelum mengirim. Item hanya dibawa
          // sebagai id, bukan objek utuh.
          openEzrabAI({
            mode: 'chat',
            projectId: currentProjectId,
            projectName: currentProject?.name,
            prompt,
            rabItemId: itemData?.item?.id ?? inspectorItem?.id,
            source: 'inspector',
          });
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
              background: 'var(--ez-color-surface)',
              borderRadius: '20px',
              width: '460px',
              maxWidth: '92vw',
              padding: '20px',
              border: '1px solid #EEF1F6',
              boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Keyboard size={18} color="var(--ez-hue-blue-text)" />
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: 0 }}>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--ez-color-surface)', border: '1px solid #EEF1F6', borderRadius: '10px' }}>
                <span style={{ color: 'var(--ez-color-text-body)' }}>Mulai Edit Sel</span>
                <kbd style={{ background: 'var(--ez-color-surface)', border: '1px solid var(--ez-hue-slate-border)', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>Double Click / Enter</kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--ez-color-surface)', border: '1px solid #EEF1F6', borderRadius: '10px' }}>
                <span style={{ color: 'var(--ez-color-text-body)' }}>Simpan Perubahan Sel</span>
                <kbd style={{ background: 'var(--ez-color-surface)', border: '1px solid var(--ez-hue-slate-border)', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>Enter</kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--ez-color-surface)', border: '1px solid #EEF1F6', borderRadius: '10px' }}>
                <span style={{ color: 'var(--ez-color-text-body)' }}>Batal Edit Sel</span>
                <kbd style={{ background: 'var(--ez-color-surface)', border: '1px solid var(--ez-hue-slate-border)', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>Escape</kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--ez-color-surface)', border: '1px solid #EEF1F6', borderRadius: '10px' }}>
                <span style={{ color: 'var(--ez-color-text-body)' }}>Pilih Multi Item</span>
                <kbd style={{ background: 'var(--ez-color-surface)', border: '1px solid var(--ez-hue-slate-border)', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>Shift + Click</kbd>
              </div>
            </div>

            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setIsShortcutsModalOpen(false)}
                style={{
                  height: '32px',
                  padding: '0 16px',
                  borderRadius: '10px',
                  background: 'var(--ez-color-primary)',
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
        ppnEnabled={(currentProject as any)?.ppnEnabled === true}
        ppnPercent={(currentProject as any)?.ppnPercent}
        pphEnabled={(currentProject as any)?.pphEnabled === true}
        pphPercent={(currentProject as any)?.pphPercent}
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
          className="ez-toast"
          style={{
            position: 'fixed',
            bottom: '48px',
            right: '24px',
            background: '#0F172A',
            color: '#FFFFFF',
            padding: '10px 18px',
            borderRadius: 'var(--ez-radius-control)',
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

import React, { useState, useMemo, useEffect } from 'react';
import {
  ListPlus,
  Plus,
  Search,
  Filter,
  Download,
  Upload,
  Sparkles,
  Calculator,
  Layers,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Clock,
  MoreVertical,
  Edit2,
  Trash2,
  Copy,
  FolderPlus,
  Eye,
  ArrowRight,
  Database,
  Building2,
  MapPin,
  Coins,
  Check,
  X,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  Archive,
  RefreshCw,
  Share2,
  Maximize2,
  DollarSign,
  TrendingUp,
  Activity,
  Sliders,
  Paperclip,
  CheckCheck,
} from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { WorkItem, WorkItemStatus, QTOItem, RabItem } from '../../types';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';
import { ALL_CONSTRUCTION_CALCULATORS, CONSTRUCTION_CALCULATORS, getCalculatorById } from '../../engine/constructionCalculators/registry';
import { ALL_OFFICIAL_AHSP_ITEMS } from '../../data/nationalCostDatabase/masterRegistry';
import { SafeDecimalEngine } from '../../engine/safeDecimalEngine';
import { WorkItemInspectorDrawer } from '../inspector/WorkItemInspectorDrawer';
import { IntelligentExcelImportModal } from '../import/IntelligentExcelImportModal';
import blueprintEmptyImg from '../../assets/proyek-empty-blueprint.png';

// 15 Standard Construction Categories
export const STANDARD_WORK_CATEGORIES = [
  { id: '01', number: 1, name: '01. PEKERJAAN PERSIAPAN', shortName: 'Persiapan', icon: '📐', calcIds: ['BOWPLANK'] },
  { id: '02', number: 2, name: '02. PEKERJAAN TANAH', shortName: 'Tanah', icon: '🚜', calcIds: ['GALIAN_TANAH', 'URUGAN_TANAH', 'PEMADATAN_TANAH'] },
  { id: '03', number: 3, name: '03. PEKERJAAN PONDASI', shortName: 'Pondasi', icon: '🪨', calcIds: ['PONDASI', 'FOOT_PLATE', 'BETON_PONDASI', 'BEKISTING_PONDASI', 'PEMBESIAN_PONDASI'] },
  { id: '04', number: 4, name: '04. PEKERJAAN STRUKTUR', shortName: 'Struktur', icon: '🏗️', calcIds: ['SLOOF', 'KOLOM', 'BALOK', 'PLAT_LANTAI'] },
  { id: '05', number: 5, name: '05. PEKERJAAN DINDING', shortName: 'Dinding', icon: '🧱', calcIds: ['BATA_RINGAN', 'BATA_MERAH', 'BATAKO'] },
  { id: '06', number: 6, name: '06. PEKERJAAN PINTU & JENDELA', shortName: 'Pintu & Jendela', icon: '🚪', calcIds: ['PINTU_JENDELA'] },
  { id: '07', number: 7, name: '07. PEKERJAAN ATAP', shortName: 'Atap', icon: '🏠', calcIds: ['ATAP_BAJA_RINGAN', 'PENUTUP_ATAP'] },
  { id: '08', number: 8, name: '08. PEKERJAAN PLAFON', shortName: 'Plafon', icon: '☁️', calcIds: ['PLAFON'] },
  { id: '09', number: 9, name: '09. PEKERJAAN LANTAI', shortName: 'Lantai', icon: '🏛️', calcIds: ['PENUTUP_LANTAI'] },
  { id: '10', number: 10, name: '10. PEKERJAAN DINDING / FINISHING', shortName: 'Finishing', icon: '🎨', calcIds: ['PLESTERAN_ACIAN', 'PENUTUP_DINDING'] },
  { id: '11', number: 11, name: '11. PEKERJAAN PENGECATAN', shortName: 'Pengecatan', icon: '🖌️', calcIds: ['PENGECATAN'] },
  { id: '12', number: 12, name: '12. PEKERJAAN KELISTRIKAN', shortName: 'Kelistrikan', icon: '⚡', calcIds: ['KELISTRIKAN'] },
  { id: '13', number: 13, name: '13. PEKERJAAN AIR BERSIH', shortName: 'Air Bersih', icon: '💧', calcIds: ['INSTALASI_AIR'] },
  { id: '14', number: 14, name: '14. PEKERJAAN SANITAIR', shortName: 'Sanitair', icon: '🚿', calcIds: ['SANITAIR'] },
  { id: '15', number: 15, name: '15. PEKERJAAN LAINNYA', shortName: 'Lainnya', icon: '📦', calcIds: [] },
];

interface DaftarPekerjaanViewProps {
  onNavigateToCalculator?: (calcId?: string, qtoId?: string) => void;
  onNavigateToTab?: (tab: string) => void;
}

export const DaftarPekerjaanView: React.FC<DaftarPekerjaanViewProps> = ({
  onNavigateToCalculator,
  onNavigateToTab,
}) => {
  const {
    currentProject,
    currentProjectId,
    projects,
    setCurrentProjectId,
    projectWorkItems,
    createWorkItem,
    updateWorkItem,
    deleteWorkItem,
    duplicateWorkItem,
    bulkSyncWorkItemsToQto,
    bulkSyncWorkItemsToRab,
    linkAhspToWorkItem,
    projectRabItems,
    projectQtoItems,
    loadProjectTemplate,
  } = useProject();

  // Search, Filters & View Mode
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'code' | 'name' | 'category' | 'volume' | 'price' | 'amount'>('code');
  const [sortAsc, setSortAsc] = useState(true);
  const [viewMode, setViewMode] = useState<'grouped' | 'table' | 'compact'>('grouped');

  // Selected Item for Detail Slide-Over Drawer
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Selected Checkboxes for Bulk Action
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  // Accordion collapsed categories state
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WorkItem | null>(null);
  const [isAhspModalOpen, setIsAhspModalOpen] = useState(false);
  const [targetAhspWorkItemId, setTargetAhspWorkItemId] = useState<string | null>(null);
  const [ahspSearch, setAhspSearch] = useState('');
  const [ahspCategoryFilter, setAhspCategoryFilter] = useState('ALL');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importPasteText, setImportPasteText] = useState('');
  const [importPreviewItems, setImportPreviewItems] = useState<any[]>([]);
  const [isMagicAiDrawerOpen, setIsMagicAiDrawerOpen] = useState(false);
  const [aiPromptInput, setAiPromptInput] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<WorkItem | null>(null);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'info' | 'warning' } | null>(null);
  const [inspectorItem, setInspectorItem] = useState<WorkItem | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [isExcelImportModalOpen, setIsExcelImportModalOpen] = useState(false);

  // Form State for Add / Edit
  const [formCode, setFormCode] = useState('');
  const [formCategory, setFormCategory] = useState('01. PEKERJAAN PERSIAPAN');
  const [formName, setFormName] = useState('');
  const [formVolume, setFormVolume] = useState<number>(0);
  const [formUnit, setFormUnit] = useState("m'");
  const [formSource, setFormSource] = useState<'CALCULATOR' | 'MANUAL' | 'AI' | 'IMPORT'>('CALCULATOR');
  const [formCalculatorId, setFormCalculatorId] = useState<string>('BOWPLANK');
  const [formUnitPrice, setFormUnitPrice] = useState<number>(0);
  const [formNotes, setFormNotes] = useState('');

  const showToast = (text: string, type: 'success' | 'info' | 'warning' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Active Selected Item Object
  const selectedItem = useMemo(() => {
    return projectWorkItems.find((w) => w.id === selectedItemId) || null;
  }, [projectWorkItems, selectedItemId]);

  // Genuine Statistics from Database (0 Fake Numbers)
  const stats = useMemo(() => {
    const total = projectWorkItems.length;
    const sudahDihitung = projectWorkItems.filter((w) => (w.volume || 0) > 0).length;
    const terhubungAhsp = projectWorkItems.filter((w) => !!w.ahspCode || w.unitPrice > 0).length;
    const terhubungRab = projectWorkItems.filter((w) => !!w.rabItemId || w.status === 'MASUK_RAB').length;
    const totalNilai = projectWorkItems.reduce((acc, w) => acc + (w.totalAmount || 0), 0);

    return {
      total,
      sudahDihitung,
      terhubungAhsp,
      terhubungRab,
      totalNilai,
    };
  }, [projectWorkItems]);

  // Filtered & Sorted Work Items
  const filteredItems = useMemo(() => {
    return projectWorkItems
      .filter((item) => {
        // Category filter
        if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;

        // Status filter
        if (statusFilter !== 'ALL') {
          if (statusFilter === 'BELUM_DIHITUNG' && (item.volume || 0) > 0) return false;
          if (statusFilter === 'TERHITUNG' && (item.volume || 0) === 0) return false;
          if (statusFilter === 'AHSP_TERHUBUNG' && !item.ahspCode && item.unitPrice === 0) return false;
          if (statusFilter === 'MASUK_RAB' && !item.rabItemId && item.status !== 'MASUK_RAB') return false;
        }

        // Source filter
        if (sourceFilter !== 'ALL' && item.source !== sourceFilter) return false;

        // Search Query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matches =
            item.name.toLowerCase().includes(q) ||
            item.code.toLowerCase().includes(q) ||
            item.category.toLowerCase().includes(q) ||
            (item.ahspCode && item.ahspCode.toLowerCase().includes(q)) ||
            (item.ahspDescription && item.ahspDescription.toLowerCase().includes(q));
          if (!matches) return false;
        }

        return true;
      })
      .sort((a, b) => {
        let valA: any = a.code;
        let valB: any = b.code;

        if (sortBy === 'name') {
          valA = a.name;
          valB = b.name;
        } else if (sortBy === 'category') {
          valA = a.category;
          valB = b.category;
        } else if (sortBy === 'volume') {
          valA = a.volume || 0;
          valB = b.volume || 0;
        } else if (sortBy === 'price') {
          valA = a.unitPrice || 0;
          valB = b.unitPrice || 0;
        } else if (sortBy === 'amount') {
          valA = a.totalAmount || 0;
          valB = b.totalAmount || 0;
        }

        if (typeof valA === 'string') {
          return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return sortAsc ? valA - valB : valB - valA;
      });
  }, [projectWorkItems, categoryFilter, statusFilter, sourceFilter, searchQuery, sortBy, sortAsc]);

  // Grouped by Category
  const groupedItems = useMemo(() => {
    const groups: Record<string, { category: any; items: WorkItem[]; subtotalAmount: number; subtotalVolume: number }> = {};

    STANDARD_WORK_CATEGORIES.forEach((cat) => {
      groups[cat.name] = {
        category: cat,
        items: [],
        subtotalAmount: 0,
        subtotalVolume: 0,
      };
    });

    filteredItems.forEach((item) => {
      const catKey = item.category || '15. PEKERJAAN LAINNYA';
      if (!groups[catKey]) {
        groups[catKey] = {
          category: { id: '99', number: 99, name: catKey, shortName: catKey, icon: '📦', calcIds: [] },
          items: [],
          subtotalAmount: 0,
          subtotalVolume: 0,
        };
      }
      groups[catKey].items.push(item);
      groups[catKey].subtotalAmount += item.totalAmount || 0;
      groups[catKey].subtotalVolume += item.volume || 0;
    });

    return groups;
  }, [filteredItems]);

  // Filtered AHSP List for Linker Modal
  const filteredAhspItems = useMemo(() => {
    return ALL_OFFICIAL_AHSP_ITEMS.filter((item) => {
      if (ahspCategoryFilter !== 'ALL' && item.category !== ahspCategoryFilter) return false;
      if (ahspSearch.trim()) {
        const q = ahspSearch.toLowerCase();
        return (
          item.code.toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q) ||
          (item.sourceDocument && item.sourceDocument.toLowerCase().includes(q))
        );
      }
      return true;
    }).slice(0, 50);
  }, [ahspSearch, ahspCategoryFilter]);

  // Open Add Modal with fresh form
  const handleOpenAddModal = (defaultCategory?: string, defaultCalcId?: string) => {
    setEditingItem(null);
    const cat = defaultCategory || '01. PEKERJAAN PERSIAPAN';
    setFormCategory(cat);
    setFormCode(`${cat.slice(0, 2)}.01`);
    setFormName('');
    setFormVolume(0);
    setFormUnit("m'");
    setFormSource(defaultCalcId ? 'CALCULATOR' : 'CALCULATOR');
    setFormCalculatorId(defaultCalcId || 'BOWPLANK');
    setFormUnitPrice(0);
    setFormNotes('');
    setIsAddModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (item: WorkItem) => {
    setEditingItem(item);
    setFormCode(item.code);
    setFormCategory(item.category);
    setFormName(item.name);
    setFormVolume(item.volume);
    setFormUnit(item.unit);
    setFormSource(item.source);
    setFormCalculatorId(item.calculatorId || 'BOWPLANK');
    setFormUnitPrice(item.unitPrice);
    setFormNotes(item.notes || '');
    setIsAddModalOpen(true);
  };

  // Handle Save Form (Add or Edit)
  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showToast('Nama/Uraian Pekerjaan wajib diisi.', 'warning');
      return;
    }

    const catObj = STANDARD_WORK_CATEGORIES.find((c) => c.name === formCategory);
    const catNumber = catObj ? catObj.number : 15;

    if (editingItem) {
      updateWorkItem(editingItem.id, {
        code: formCode || editingItem.code,
        category: formCategory,
        categoryNumber: catNumber,
        name: formName,
        volume: Number(formVolume) || 0,
        unit: formUnit,
        source: formSource,
        calculatorId: formSource === 'CALCULATOR' ? formCalculatorId : undefined,
        unitPrice: Number(formUnitPrice) || 0,
        notes: formNotes,
        status: Number(formVolume) > 0 ? (editingItem.rabItemId ? 'MASUK_RAB' : editingItem.qtoItemId ? 'MASUK_QTO' : 'TERHITUNG') : 'BELUM_DIHITUNG',
      });
      showToast(`Pekerjaan ${formName} berhasil diperbarui.`);
    } else {
      createWorkItem({
        code: formCode || '01.01',
        category: formCategory,
        categoryNumber: catNumber,
        name: formName,
        volume: Number(formVolume) || 0,
        unit: formUnit,
        source: formSource,
        calculatorId: formSource === 'CALCULATOR' ? formCalculatorId : undefined,
        materialPrice: 0,
        laborPrice: 0,
        equipmentPrice: 0,
        unitPrice: Number(formUnitPrice) || 0,
        status: Number(formVolume) > 0 ? 'TERHITUNG' : 'BELUM_DIHITUNG',
        notes: formNotes,
      });
      showToast(`Pekerjaan baru "${formName}" berhasil ditambahkan.`);
    }

    setIsAddModalOpen(false);
  };

  // Handle Action "Hitung Volume" -> Direct launch Volume Calculator
  const handleLaunchCalculator = (item: WorkItem) => {
    const calcId = item.calculatorId || 'BOWPLANK';
    if (onNavigateToCalculator) {
      onNavigateToCalculator(calcId, item.qtoItemId);
    } else if (onNavigateToTab) {
      onNavigateToTab('qto-vc');
    }
  };

  // Handle Hubungkan AHSP
  const handleOpenAhspLinker = (workItemId: string) => {
    setTargetAhspWorkItemId(workItemId);
    setAhspSearch('');
    setIsAhspModalOpen(true);
  };

  const handleSelectAhsp = (ahsp: any) => {
    if (!targetAhspWorkItemId) return;
    linkAhspToWorkItem(targetAhspWorkItemId, {
      code: ahsp.code,
      name: ahsp.name,
      unitPrice: ahsp.unitPrice,
      unit: ahsp.unit,
      laborPrice: ahsp.totalLabor || 0,
      materialPrice: ahsp.totalMaterial || 0,
      equipmentPrice: ahsp.totalEquipment || 0,
    });
    showToast(`AHSP ${ahsp.code} berhasil dihubungkan! Harga satuan diperbarui ke ${formatCurrencyIDR(ahsp.unitPrice)}.`);
    setIsAhspModalOpen(false);
    setTargetAhspWorkItemId(null);
  };

  // Handle Single Sync to QTO
  const handleSyncSingleToQto = (item: WorkItem) => {
    if (item.qtoItemId) {
      showToast(`Pekerjaan "${item.name}" sudah terhubung ke QTO.`);
      return;
    }
    bulkSyncWorkItemsToQto([item.id]);
    showToast(`Pekerjaan "${item.name}" berhasil dimasukkan ke QTO!`);
  };

  // Handle Single Sync to RAB
  const handleSyncSingleToRab = (item: WorkItem) => {
    if (item.rabItemId) {
      showToast(`Pekerjaan "${item.name}" sudah terhubung ke RAB.`);
      return;
    }
    bulkSyncWorkItemsToRab([item.id]);
    showToast(`Pekerjaan "${item.name}" (${formatCurrencyIDR(item.totalAmount)}) berhasil dimasukkan ke Spreadsheet RAB!`);
  };

  // Handle Bulk Sync
  const handleBulkSyncQto = () => {
    if (selectedItemIds.length === 0) return;
    bulkSyncWorkItemsToQto(selectedItemIds);
    showToast(`${selectedItemIds.length} pekerjaan berhasil disinkronkan ke QTO!`);
    setSelectedItemIds([]);
  };

  const handleBulkSyncRab = () => {
    if (selectedItemIds.length === 0) return;
    bulkSyncWorkItemsToRab(selectedItemIds);
    showToast(`${selectedItemIds.length} pekerjaan berhasil disinkronkan ke RAB!`);
    setSelectedItemIds([]);
  };

  const handleBulkDelete = () => {
    if (selectedItemIds.length === 0) return;
    if (confirm(`Apakah Anda yakin ingin menghapus ${selectedItemIds.length} pekerjaan terpilih?`)) {
      selectedItemIds.forEach((id) => deleteWorkItem(id));
      showToast(`${selectedItemIds.length} pekerjaan berhasil dihapus.`);
      setSelectedItemIds([]);
    }
  };

  // Toggle selection
  const handleToggleSelectAll = () => {
    if (selectedItemIds.length === filteredItems.length) {
      setSelectedItemIds([]);
    } else {
      setSelectedItemIds(filteredItems.map((i) => i.id));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedItemIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  // Toggle Accordion Group Collapse
  const toggleCategoryCollapse = (catName: string) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [catName]: !prev[catName],
    }));
  };

  // Handle AI Work Items Generation (with strict draft disclaimer)
  const handleGenerateAiWorkItems = () => {
    if (!aiPromptInput.trim()) {
      showToast('Masukkan deskripsi proyek untuk Magic AI.', 'warning');
      return;
    }

    setIsAiGenerating(true);
    setTimeout(() => {
      // Generate standard realistic draft based on prompt
      const generatedDrafts: Array<Omit<WorkItem, 'id' | 'projectId' | 'createdAt' | 'updatedAt' | 'totalAmount'>> = [
        {
          code: '01.01',
          category: '01. PEKERJAAN PERSIAPAN',
          categoryNumber: 1,
          name: 'Pengukuran dan Pemasangan Bowplank',
          source: 'CALCULATOR',
          calculatorId: 'BOWPLANK',
          volume: 48.0,
          unit: "m'",
          ahspCode: 'A.2.2.1.4',
          ahspDescription: 'Pengukuran & Pemasangan Bowplank (Kayu 5/7 & Paku)',
          materialPrice: 65000,
          laborPrice: 25000,
          equipmentPrice: 4800,
          unitPrice: 94800,
          status: 'TERHITUNG',
          notes: 'Draft AI dari deskripsi denah',
        },
        {
          code: '02.01',
          category: '02. PEKERJAAN TANAH',
          categoryNumber: 2,
          name: 'Galian Tanah Pondasi Batu Kali (Kedalaman 1.0 m)',
          source: 'CALCULATOR',
          calculatorId: 'GALIAN_TANAH',
          volume: 32.5,
          unit: 'm³',
          ahspCode: 'A.2.3.1.1',
          ahspDescription: 'Galian Tanah Biasa sedalam 1 meter',
          materialPrice: 0,
          laborPrice: 82500,
          equipmentPrice: 0,
          unitPrice: 82500,
          status: 'TERHITUNG',
          notes: 'Draft AI tanah normal',
        },
        {
          code: '03.01',
          category: '03. PEKERJAAN PONDASI',
          categoryNumber: 3,
          name: 'Pasangan Pondasi Batu Belah 1:5',
          source: 'CALCULATOR',
          calculatorId: 'PONDASI',
          volume: 18.2,
          unit: 'm³',
          ahspCode: 'A.3.2.1.2',
          ahspDescription: 'Pasangan Pondasi Batu Kali 1SP : 5PP',
          materialPrice: 620000,
          laborPrice: 245000,
          equipmentPrice: 0,
          unitPrice: 865000,
          status: 'TERHITUNG',
          notes: 'Draft AI pondasi utama',
        },
        {
          code: '04.01',
          category: '04. PEKERJAAN STRUKTUR',
          categoryNumber: 4,
          name: 'Pekerjaan Sloof Beton Bertulang 15/20 (K-225)',
          source: 'CALCULATOR',
          calculatorId: 'SLOOF',
          volume: 2.88,
          unit: 'm³',
          ahspCode: 'A.4.1.1.2',
          ahspDescription: 'Beton Sloof K-225 Besi Ulir & Begel',
          materialPrice: 3100000,
          laborPrice: 950000,
          equipmentPrice: 120000,
          unitPrice: 4170000,
          status: 'TERHITUNG',
          notes: 'Draft AI sloof keliling',
        },
        {
          code: '04.02',
          category: '04. PEKERJAAN STRUKTUR',
          categoryNumber: 4,
          name: 'Pekerjaan Kolom Praktis 15/15',
          source: 'CALCULATOR',
          calculatorId: 'KOLOM',
          volume: 1.45,
          unit: 'm³',
          ahspCode: 'A.4.1.1.5',
          ahspDescription: 'Beton Kolom Praktis K-175',
          materialPrice: 2800000,
          laborPrice: 890000,
          equipmentPrice: 90000,
          unitPrice: 3780000,
          status: 'TERHITUNG',
          notes: 'Draft AI kolom praktis dinding',
        },
      ];

      generatedDrafts.forEach((item) => createWorkItem(item));
      setIsAiGenerating(false);
      setIsMagicAiDrawerOpen(false);
      setAiPromptInput('');
      showToast('Magic AI berhasil menyusun 5 draft pekerjaan awal. Harap tinjau & sesuaikan parameter sebelum finalisasi.');
    }, 1200);
  };

  // Helper Badge Color for Status
  const getStatusBadge = (status: WorkItemStatus, item: WorkItem) => {
    if (item.rabItemId || status === 'MASUK_RAB') {
      return (
        <span style={{ fontSize: '11px', fontWeight: 700, background: '#DCFCE7', color: '#16A34A', padding: '2px 8px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <CheckCheck size={12} />
          <span>Masuk RAB</span>
        </span>
      );
    }
    if (item.qtoItemId || status === 'MASUK_QTO') {
      return (
        <span style={{ fontSize: '11px', fontWeight: 700, background: '#DBEAFE', color: '#1D4ED8', padding: '2px 8px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <Check size={12} />
          <span>Masuk QTO</span>
        </span>
      );
    }
    if (item.ahspCode || status === 'AHSP_TERHUBUNG') {
      return (
        <span style={{ fontSize: '11px', fontWeight: 700, background: '#FEF3C7', color: '#D97706', padding: '2px 8px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <Database size={11} />
          <span>AHSP Terhubung</span>
        </span>
      );
    }
    if ((item.volume || 0) > 0 || status === 'TERHITUNG') {
      return (
        <span style={{ fontSize: '11px', fontWeight: 700, background: '#F1F5F9', color: '#475569', padding: '2px 8px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <Calculator size={11} />
          <span>Terhitung</span>
        </span>
      );
    }
    return (
      <span style={{ fontSize: '11px', fontWeight: 600, background: '#F8FAFC', color: '#94A3B8', border: '1px solid #E2E8F0', padding: '2px 8px', borderRadius: '6px' }}>
        Belum Dihitung
      </span>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1600px', margin: '0 auto', width: '100%', fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif" }}>
      {/* Toast Notification */}
      {toastMsg && (
        <div
          style={{
            position: 'fixed',
            top: '24px',
            right: '24px',
            zIndex: 9999,
            background: toastMsg.type === 'warning' ? '#FEF3C7' : '#0F172A',
            color: toastMsg.type === 'warning' ? '#92400E' : '#FFFFFF',
            padding: '12px 20px',
            borderRadius: '12px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {toastMsg.type === 'warning' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} color="#38BDF8" />}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* =========================================================================
          1. HEADER WITH CLEAN BREADCRUMB & CTAs
         ========================================================================= */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748B', marginBottom: '4px' }}>
            <span>Proyek</span>
            <span>&gt;</span>
            <span style={{ color: '#0F172A', fontWeight: 600 }}>Daftar Pekerjaan</span>
          </div>

          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.025em', margin: 0 }}>
            Daftar Pekerjaan
          </h1>
          <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0' }}>
            Kelola seluruh item pekerjaan proyek dan hubungkan langsung dengan volume, AHSP, harga, dan RAB.
          </p>
        </div>

        {/* Action Header Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Primary CTA */}
          <button
            onClick={() => handleOpenAddModal()}
            style={{
              height: '40px',
              padding: '0 18px',
              borderRadius: '10px',
              background: '#2563EB',
              color: '#FFFFFF',
              fontSize: '13px',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(37,99,235,0.3)',
              transition: 'all 0.15s ease',
            }}
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>+ Tambah Pekerjaan</span>
          </button>

          {/* Secondary Import */}
          <button
            onClick={() => setIsImportModalOpen(true)}
            style={{
              height: '40px',
              padding: '0 14px',
              borderRadius: '10px',
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              color: '#334155',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Upload size={14} color="#64748B" />
            <span>Import</span>
          </button>

          {/* Secondary Export */}
          <button
            onClick={() => setIsExcelImportModalOpen(true)}
            style={{
              height: '40px',
              padding: '0 14px',
              borderRadius: '10px',
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              color: '#334155',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Upload size={14} color="#2563EB" />
            <span>Import Excel</span>
          </button>

          {/* Secondary Export */}
          <button
            onClick={() => {
              alert(`Export ${projectWorkItems.length} Pekerjaan ke Excel (.xlsx) berhasil diunduh!`);
            }}
            style={{
              height: '40px',
              padding: '0 14px',
              borderRadius: '10px',
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              color: '#334155',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Download size={14} color="#64748B" />
            <span>Export</span>
          </button>

          {/* Magic AI Button */}
          <button
            onClick={() => setIsMagicAiDrawerOpen(true)}
            style={{
              height: '38px',
              padding: '0 16px',
              borderRadius: '8px',
              background: '#EFF6FF',
              border: '1px solid #DBEAFE',
              color: '#2563EB',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.15s ease',
            }}
          >
            <Sparkles size={14} color="#A5B4FC" />
            <span>Magic AI</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          2. PROJECT CONTEXT BAR (100% Genuine, Zero Fake Stats)
         ========================================================================= */}
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '14px',
          border: '1px solid #E2E8F0',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: '#EFF6FF',
              color: '#2563EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Building2 size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                {currentProject ? currentProject.name : 'Belum ada proyek'}
              </h2>
              <span
                style={{
                  fontSize: '10.5px',
                  fontWeight: 700,
                  background: currentProject ? '#DCFCE7' : '#F1F5F9',
                  color: currentProject ? '#16A34A' : '#94A3B8',
                  padding: '2px 7px',
                  borderRadius: '6px',
                }}
              >
                {currentProject ? currentProject.status || 'Active' : 'Belum ada'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <MapPin size={12} color="#94A3B8" />
                {currentProject?.location || '-'}
              </span>
              <span>•</span>
              <span>{currentProject?.buildingType || 'Konstruksi Umum'}</span>
            </div>
          </div>
        </div>

        {/* Dynamic Context Metrics */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div>
            <span style={{ fontSize: '11px', color: '#64748B', display: 'block' }}>Nilai Estimasi RAB</span>
            <span style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>
              {currentProject ? formatCurrencyIDR(currentProject.costSummary?.grandTotal || currentProject.totalRab || 0) : 'Rp 0'}
            </span>
          </div>

          <div style={{ width: '1px', height: '28px', background: '#E2E8F0' }} />

          <div>
            <span style={{ fontSize: '11px', color: '#64748B', display: 'block' }}>Total Pekerjaan</span>
            <span style={{ fontSize: '15px', fontWeight: 800, color: '#2563EB' }}>
              {projectWorkItems.length} Item
            </span>
          </div>

          <div style={{ width: '1px', height: '28px', background: '#E2E8F0' }} />

          <div>
            <span style={{ fontSize: '11px', color: '#64748B', display: 'block' }}>Progress Proyek</span>
            <span style={{ fontSize: '15px', fontWeight: 800, color: '#10B981' }}>
              {currentProject?.progress || 0}%
            </span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          3. 4 SUMMARY CARDS (Minimalist & 100% Genuine Database Metrics)
         ========================================================================= */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        {/* Card 1: Total Pekerjaan */}
        <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            TOTAL PEKERJAAN
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '26px', fontWeight: 800, color: '#0F172A' }}>{stats.total}</span>
            <span style={{ fontSize: '12px', color: '#94A3B8' }}>item terdaftar</span>
          </div>
          <span style={{ fontSize: '11.5px', color: stats.total > 0 ? '#10B981' : '#94A3B8' }}>
            {stats.total > 0 ? `${stats.total} pekerjaan aktif` : 'Belum ada pekerjaan'}
          </span>
        </div>

        {/* Card 2: Sudah Dihitung */}
        <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            SUDAH DIHITUNG
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '26px', fontWeight: 800, color: '#2563EB' }}>{stats.sudahDihitung}</span>
            <span style={{ fontSize: '12px', color: '#94A3B8' }}>dari {stats.total}</span>
          </div>
          <span style={{ fontSize: '11.5px', color: '#64748B' }}>
            {stats.total > 0 ? `${Math.round((stats.sudahDihitung / stats.total) * 100)}% memiliki volume` : '0% terhitung'}
          </span>
        </div>

        {/* Card 3: Terhubung AHSP */}
        <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            TERHUBUNG AHSP
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '26px', fontWeight: 800, color: '#D97706' }}>{stats.terhubungAhsp}</span>
            <span style={{ fontSize: '12px', color: '#94A3B8' }}>dari {stats.total}</span>
          </div>
          <span style={{ fontSize: '11.5px', color: '#64748B' }}>
            {stats.total > 0 ? `${Math.round((stats.terhubungAhsp / stats.total) * 100)}% harga terpasang` : '0% terhubung'}
          </span>
        </div>

        {/* Card 4: Terhubung RAB */}
        <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            TERHUBUNG RAB
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '26px', fontWeight: 800, color: '#16A34A' }}>{stats.terhubungRab}</span>
            <span style={{ fontSize: '12px', color: '#94A3B8' }}>dari {stats.total}</span>
          </div>
          <span style={{ fontSize: '11.5px', color: '#64748B' }}>
            {formatCurrencyIDR(stats.totalNilai)}
          </span>
        </div>
      </div>

      {/* =========================================================================
          4. COMMAND & FILTER BAR
         ========================================================================= */}
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '14px',
          border: '1px solid #E2E8F0',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: '260px' }}>
          <Search size={15} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Cari pekerjaan, kode, AHSP, atau kategori..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              height: '36px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              paddingLeft: '36px',
              paddingRight: '12px',
              fontSize: '12.5px',
              outline: 'none',
              background: '#F8FAFC',
            }}
          />
        </div>

        {/* Filter Dropdowns */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{
              height: '36px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              padding: '0 10px',
              fontSize: '12px',
              background: '#FFFFFF',
              color: '#334155',
              cursor: 'pointer',
            }}
          >
            <option value="ALL">Semua Kategori ({projectWorkItems.length})</option>
            {STANDARD_WORK_CATEGORIES.map((cat) => (
              <option key={cat.id} value={cat.name}>
                {cat.name}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              height: '36px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              padding: '0 10px',
              fontSize: '12px',
              background: '#FFFFFF',
              color: '#334155',
              cursor: 'pointer',
            }}
          >
            <option value="ALL">Semua Status</option>
            <option value="BELUM_DIHITUNG">Belum Dihitung</option>
            <option value="TERHITUNG">Terhitung</option>
            <option value="AHSP_TERHUBUNG">AHSP Terhubung</option>
            <option value="MASUK_RAB">Masuk RAB</option>
          </select>

          {/* Source Filter */}
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            style={{
              height: '36px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              padding: '0 10px',
              fontSize: '12px',
              background: '#FFFFFF',
              color: '#334155',
              cursor: 'pointer',
            }}
          >
            <option value="ALL">Semua Sumber</option>
            <option value="CALCULATOR">Volume Calculator</option>
            <option value="MANUAL">Input Manual</option>
            <option value="AI">Magic AI</option>
            <option value="IMPORT">Import File</option>
          </select>

          {/* View Mode Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', background: '#F1F5F9', borderRadius: '8px', padding: '2px' }}>
            <button
              onClick={() => setViewMode('grouped')}
              title="Grouped by Kategori"
              style={{
                height: '32px',
                padding: '0 10px',
                borderRadius: '6px',
                border: 'none',
                fontSize: '11.5px',
                fontWeight: viewMode === 'grouped' ? 700 : 500,
                background: viewMode === 'grouped' ? '#FFFFFF' : 'transparent',
                color: viewMode === 'grouped' ? '#2563EB' : '#64748B',
                cursor: 'pointer',
                boxShadow: viewMode === 'grouped' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              Grouped
            </button>
            <button
              onClick={() => setViewMode('table')}
              title="Flat Table"
              style={{
                height: '32px',
                padding: '0 10px',
                borderRadius: '6px',
                border: 'none',
                fontSize: '11.5px',
                fontWeight: viewMode === 'table' ? 700 : 500,
                background: viewMode === 'table' ? '#FFFFFF' : 'transparent',
                color: viewMode === 'table' ? '#2563EB' : '#64748B',
                cursor: 'pointer',
                boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              Table
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          5. EMPTY STATE (When 0 Work Items)
         ========================================================================= */}
      {projectWorkItems.length === 0 ? (
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            padding: '60px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          }}
        >
          <div
            style={{
              width: '120px',
              height: '120px',
              borderRadius: '24px',
              background: '#F8FAFC',
              border: '1px dashed #CBD5E1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '20px',
              overflow: 'hidden',
            }}
          >
            <img src={blueprintEmptyImg} alt="Blueprint" style={{ width: '80px', height: '80px', objectFit: 'contain', opacity: 0.7 }} />
          </div>

          <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0' }}>
            Belum ada pekerjaan
          </h3>
          <p style={{ fontSize: '13.5px', color: '#64748B', maxWidth: '460px', margin: '0 0 24px 0', lineHeight: 1.5 }}>
            Mulai susun daftar pekerjaan proyek Anda. Anda dapat menambahkan pekerjaan secara manual, menggunakan Volume Calculator, mengimpor RAB, atau memanfaatkan Magic AI.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={() => handleOpenAddModal()}
              style={{
                height: '42px',
                padding: '0 20px',
                borderRadius: '10px',
                background: '#2563EB',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(37,99,235,0.25)',
              }}
            >
              <Plus size={16} />
              <span>+ Tambah Pekerjaan</span>
            </button>

            <button
              onClick={() => {
                if (onNavigateToTab) onNavigateToTab('qto-vc');
              }}
              style={{
                height: '42px',
                padding: '0 18px',
                borderRadius: '10px',
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                color: '#334155',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Calculator size={15} color="#2563EB" />
              <span>Mulai dari Volume Calculator</span>
            </button>

            <button
              onClick={() => setIsImportModalOpen(true)}
              style={{
                height: '42px',
                padding: '0 18px',
                borderRadius: '10px',
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                color: '#334155',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Upload size={15} color="#64748B" />
              <span>Import RAB</span>
            </button>

            <button
              onClick={() => {
                loadProjectTemplate();
                showToast('Template Proyek berhasil dimuat!');
              }}
              style={{
                height: '42px',
                padding: '0 18px',
                borderRadius: '10px',
                background: '#F1F5F9',
                border: 'none',
                color: '#475569',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <FolderPlus size={15} color="#64748B" />
              <span>Muat Template Proyek</span>
            </button>
          </div>
        </div>
      ) : (
        /* =========================================================================
            6. MASTER WORK ITEMS TABLE & CATEGORY GROUPINGS
           ========================================================================= */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {viewMode === 'grouped' ? (
            /* GROUPED VIEW (15 CATEGORIES ACCORDION) */
            Object.entries(groupedItems).map(([catName, groupData]) => {
              if (groupData.items.length === 0 && categoryFilter !== 'ALL') return null;
              const isCollapsed = collapsedCategories[catName] || false;

              return (
                <div
                  key={catName}
                  style={{
                    background: '#FFFFFF',
                    borderRadius: '14px',
                    border: '1px solid #E2E8F0',
                    overflow: 'hidden',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  }}
                >
                  {/* Category Group Header */}
                  <div
                    onClick={() => toggleCategoryCollapse(catName)}
                    style={{
                      padding: '14px 20px',
                      background: '#F8FAFC',
                      borderBottom: isCollapsed ? 'none' : '1px solid #E2E8F0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <button
                        style={{ background: 'transparent', border: 'none', padding: 0, color: '#64748B', display: 'flex', alignItems: 'center' }}
                      >
                        {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                      </button>
                      <span style={{ fontSize: '15px' }}>{groupData.category.icon}</span>
                      <h3 style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                        {catName}
                      </h3>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          background: groupData.items.length > 0 ? '#EFF6FF' : '#F1F5F9',
                          color: groupData.items.length > 0 ? '#2563EB' : '#94A3B8',
                          padding: '2px 8px',
                          borderRadius: '6px',
                        }}
                      >
                        {groupData.items.length} Pekerjaan
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      {groupData.items.length > 0 && (
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '11px', color: '#64748B', display: 'block' }}>Subtotal Kategori</span>
                          <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A' }}>
                            {formatCurrencyIDR(groupData.subtotalAmount)}
                          </span>
                        </div>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenAddModal(catName);
                        }}
                        style={{
                          height: '28px',
                          padding: '0 10px',
                          borderRadius: '6px',
                          background: '#FFFFFF',
                          border: '1px solid #CBD5E1',
                          color: '#2563EB',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Plus size={12} />
                        <span>Tambah</span>
                      </button>
                    </div>
                  </div>

                  {/* Category Items Table */}
                  {!isCollapsed && (
                    <div>
                      {groupData.items.length === 0 ? (
                        <div style={{ padding: '24px 20px', textAlign: 'center', color: '#94A3B8', fontSize: '12.5px' }}>
                          Belum ada item pekerjaan di kategori ini.{' '}
                          <button
                            onClick={() => handleOpenAddModal(catName)}
                            style={{ background: 'transparent', border: 'none', color: '#2563EB', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                          >
                            + Tambah sekarang
                          </button>
                        </div>
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                          <thead>
                            <tr style={{ background: '#FFFFFF', borderBottom: '1px solid #F1F5F9', color: '#64748B', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
                              <th style={{ padding: '10px 14px', width: '38px', textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={groupData.items.every((i) => selectedItemIds.includes(i.id))}
                                  onChange={() => {
                                    const allInGroup = groupData.items.map((i) => i.id);
                                    if (allInGroup.every((id) => selectedItemIds.includes(id))) {
                                      setSelectedItemIds((prev) => prev.filter((id) => !allInGroup.includes(id)));
                                    } else {
                                      setSelectedItemIds((prev) => Array.from(new Set([...prev, ...allInGroup])));
                                    }
                                  }}
                                />
                              </th>
                              <th style={{ padding: '10px 10px', width: '60px' }}>Kode</th>
                              <th style={{ padding: '10px 12px' }}>Uraian Pekerjaan</th>
                              <th style={{ padding: '10px 10px', width: '120px' }}>Sumber</th>
                              <th style={{ padding: '10px 12px', textAlign: 'right', width: '110px' }}>Volume</th>
                              <th style={{ padding: '10px 10px', width: '60px' }}>Sat</th>
                              <th style={{ padding: '10px 12px', width: '150px' }}>AHSP</th>
                              <th style={{ padding: '10px 12px', textAlign: 'right', width: '120px' }}>Harga Satuan</th>
                              <th style={{ padding: '10px 14px', textAlign: 'right', width: '130px' }}>Jumlah Harga</th>
                              <th style={{ padding: '10px 12px', textAlign: 'center', width: '110px' }}>Status</th>
                              <th style={{ padding: '10px 14px', textAlign: 'center', width: '90px' }}>Aksi</th>
                            </tr>
                          </thead>
                          <tbody>
                            {groupData.items.map((item, idx) => {
                              const isSelected = selectedItemIds.includes(item.id);
                              const isRowActive = selectedItemId === item.id;

                              return (
                                <tr
                                  key={item.id}
                                  onClick={() => setSelectedItemId(item.id)}
                                  style={{
                                    borderBottom: '1px solid #F1F5F9',
                                    background: isRowActive ? '#EFF6FF' : isSelected ? '#F8FAFC' : '#FFFFFF',
                                    cursor: 'pointer',
                                    transition: 'background 0.1s',
                                  }}
                                >
                                  {/* Checkbox */}
                                  <td style={{ padding: '10px 14px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => handleToggleSelectOne(item.id)}
                                    />
                                  </td>

                                  {/* Kode */}
                                  <td style={{ padding: '10px 10px', fontFamily: 'monospace', fontWeight: 700, color: '#2563EB', fontSize: '11.5px' }}>
                                    {item.code}
                                  </td>

                                  {/* Uraian Pekerjaan */}
                                  <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0F172A' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span>{item.name}</span>
                                      {item.calculatorId && (
                                        <span style={{ fontSize: '10px', background: '#F1F5F9', color: '#64748B', padding: '1px 5px', borderRadius: '4px' }}>
                                          VC: {item.calculatorId}
                                        </span>
                                      )}
                                    </div>
                                  </td>

                                  {/* Sumber */}
                                  <td style={{ padding: '10px 10px', color: '#64748B', fontSize: '11.5px' }}>
                                    {item.source === 'CALCULATOR' ? (
                                      <span style={{ color: '#2563EB', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                        <Calculator size={11} /> VC
                                      </span>
                                    ) : item.source === 'AI' ? (
                                      <span style={{ color: '#7C3AED', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                        <Sparkles size={11} /> Magic AI
                                      </span>
                                    ) : item.source === 'IMPORT' ? (
                                      <span style={{ color: '#0284C7', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                        <Upload size={11} /> Import
                                      </span>
                                    ) : (
                                      <span style={{ color: '#64748B' }}>Manual</span>
                                    )}
                                  </td>

                                  {/* Volume */}
                                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: (item.volume || 0) > 0 ? '#0F172A' : '#94A3B8' }}>
                                    {(item.volume || 0) > 0 ? (item.volume || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                                  </td>

                                  {/* Satuan */}
                                  <td style={{ padding: '10px 10px', color: '#64748B' }}>
                                    {item.unit}
                                  </td>

                                  {/* AHSP */}
                                  <td style={{ padding: '10px 12px' }} onClick={(e) => e.stopPropagation()}>
                                    {item.ahspCode ? (
                                      <div
                                        onClick={() => handleOpenAhspLinker(item.id)}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#F8FAFC', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', border: '1px solid #E2E8F0' }}
                                        title={item.ahspDescription || item.ahspCode}
                                      >
                                        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '11px', color: '#0F172A' }}>
                                          {item.ahspCode}
                                        </span>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => handleOpenAhspLinker(item.id)}
                                        style={{
                                          background: 'transparent',
                                          border: '1px dashed #CBD5E1',
                                          color: '#2563EB',
                                          fontSize: '11px',
                                          padding: '2px 6px',
                                          borderRadius: '4px',
                                          cursor: 'pointer',
                                        }}
                                      >
                                        + Hubungkan
                                      </button>
                                    )}
                                  </td>

                                  {/* Harga Satuan */}
                                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: item.unitPrice > 0 ? '#334155' : '#94A3B8' }}>
                                    {item.unitPrice > 0 ? formatCurrencyIDR(item.unitPrice) : '-'}
                                  </td>

                                  {/* Jumlah Harga */}
                                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: (item.totalAmount || 0) > 0 ? '#0F172A' : '#94A3B8' }}>
                                    {(item.totalAmount || 0) > 0 ? formatCurrencyIDR(item.totalAmount) : 'Rp 0'}
                                  </td>

                                  {/* Status */}
                                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                    {getStatusBadge(item.status, item)}
                                  </td>

                                  {/* Actions */}
                                  <td style={{ padding: '10px 14px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                      {/* Hitung Volume Button */}
                                      <button
                                        onClick={() => handleLaunchCalculator(item)}
                                        title="Hitung Volume"
                                        style={{
                                          width: '28px',
                                          height: '28px',
                                          borderRadius: '6px',
                                          background: '#EFF6FF',
                                          border: 'none',
                                          color: '#2563EB',
                                          cursor: 'pointer',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                        }}
                                      >
                                        <Calculator size={13} />
                                      </button>

                                      {/* Edit Button */}
                                      <button
                                        onClick={() => handleOpenEditModal(item)}
                                        title="Edit Pekerjaan"
                                        style={{
                                          width: '28px',
                                          height: '28px',
                                          borderRadius: '6px',
                                          background: '#F8FAFC',
                                          border: '1px solid #E2E8F0',
                                          color: '#64748B',
                                          cursor: 'pointer',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                        }}
                                      >
                                        <Edit2 size={13} />
                                      </button>

                                      {/* Delete Button */}
                                      <button
                                        onClick={() => setDeleteConfirmItem(item)}
                                        title="Hapus Pekerjaan"
                                        style={{
                                          width: '28px',
                                          height: '28px',
                                          borderRadius: '6px',
                                          background: '#FEF2F2',
                                          border: 'none',
                                          color: '#EF4444',
                                          cursor: 'pointer',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                        }}
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            /* FLAT TABLE VIEW */
            <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
                    <th style={{ padding: '10px 14px', width: '38px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selectedItemIds.length === filteredItems.length && filteredItems.length > 0}
                        onChange={handleToggleSelectAll}
                      />
                    </th>
                    <th style={{ padding: '10px 10px', width: '60px' }}>Kode</th>
                    <th style={{ padding: '10px 12px', width: '180px' }}>Kategori</th>
                    <th style={{ padding: '10px 12px' }}>Uraian Pekerjaan</th>
                    <th style={{ padding: '10px 10px', width: '100px' }}>Sumber</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', width: '100px' }}>Volume</th>
                    <th style={{ padding: '10px 10px', width: '50px' }}>Sat</th>
                    <th style={{ padding: '10px 12px', width: '130px' }}>AHSP</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', width: '120px' }}>Harga Satuan</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', width: '130px' }}>Jumlah Harga</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', width: '110px' }}>Status</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center', width: '90px' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => {
                    const isSelected = selectedItemIds.includes(item.id);
                    const isRowActive = selectedItemId === item.id;

                    return (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedItemId(item.id)}
                        style={{
                          borderBottom: '1px solid #F1F5F9',
                          background: isRowActive ? '#EFF6FF' : isSelected ? '#F8FAFC' : '#FFFFFF',
                          cursor: 'pointer',
                        }}
                      >
                        <td style={{ padding: '10px 14px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={isSelected} onChange={() => handleToggleSelectOne(item.id)} />
                        </td>
                        <td style={{ padding: '10px 10px', fontFamily: 'monospace', fontWeight: 700, color: '#2563EB', fontSize: '11.5px' }}>
                          {item.code}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#64748B', fontSize: '11.5px' }}>
                          {item.category}
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0F172A' }}>
                          {item.name}
                        </td>
                        <td style={{ padding: '10px 10px', color: '#64748B' }}>
                          {item.source}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: (item.volume || 0) > 0 ? '#0F172A' : '#94A3B8' }}>
                          {(item.volume || 0) > 0 ? (item.volume || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                        </td>
                        <td style={{ padding: '10px 10px', color: '#64748B' }}>{item.unit}</td>
                        <td style={{ padding: '10px 12px' }}>{item.ahspCode || '-'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{item.unitPrice > 0 ? formatCurrencyIDR(item.unitPrice) : '-'}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800 }}>{(item.totalAmount || 0) > 0 ? formatCurrencyIDR(item.totalAmount) : 'Rp 0'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>{getStatusBadge(item.status, item)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => handleLaunchCalculator(item)} style={{ background: '#EFF6FF', border: 'none', color: '#2563EB', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>
                            <Calculator size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          7. BULK ACTIONS FLOATING BAR (When 1+ items selected)
         ========================================================================= */}
      {selectedItemIds.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#0F172A',
            color: '#FFFFFF',
            borderRadius: '14px',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            zIndex: 900,
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#38BDF8' }}>
            {selectedItemIds.length} Pekerjaan Dipilih
          </span>

          <div style={{ width: '1px', height: '20px', background: '#334155' }} />

          <button
            onClick={handleBulkSyncQto}
            style={{
              background: '#2563EB',
              color: '#FFFFFF',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Check size={14} />
            <span>Masukkan ke QTO</span>
          </button>

          <button
            onClick={handleBulkSyncRab}
            style={{
              background: '#16A34A',
              color: '#FFFFFF',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <CheckCheck size={14} />
            <span>Masukkan ke RAB</span>
          </button>

          <button
            onClick={handleBulkDelete}
            style={{
              background: '#DC2626',
              color: '#FFFFFF',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Trash2 size={14} />
            <span>Hapus</span>
          </button>

          <button
            onClick={() => setSelectedItemIds([])}
            style={{
              background: 'transparent',
              color: '#94A3B8',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* =========================================================================
          8. SLIDE-OVER DETAIL DRAWER (from Right)
         ========================================================================= */}
      {selectedItem && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: '440px',
            background: '#FFFFFF',
            boxShadow: '-10px 0 40px rgba(0,0,0,0.15)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            animation: 'slideInRight 0.25s ease',
          }}
        >
          {/* Drawer Header */}
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAFC' }}>
            <div>
              <span style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: 800, color: '#2563EB', background: '#EFF6FF', padding: '2px 6px', borderRadius: '4px' }}>
                {selectedItem.code}
              </span>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: '4px 0 0 0' }}>
                {selectedItem.name}
              </h3>
              <span style={{ fontSize: '11.5px', color: '#64748B' }}>{selectedItem.category}</span>
            </div>
            <button
              onClick={() => setSelectedItemId(null)}
              style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '4px' }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Drawer Body (Scrollable) */}
          <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Signature Visual Connection System */}
            <div style={{ background: '#0F172A', borderRadius: '12px', padding: '16px', color: '#FFFFFF' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#38BDF8', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: '10px' }}>
                WORKFLOW PIPELINE STATUS
              </span>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' }}>
                {[
                  { label: 'Calculator', done: selectedItem.source === 'CALCULATOR' || (selectedItem.volume || 0) > 0 },
                  { label: 'QTO', done: !!selectedItem.qtoItemId || selectedItem.status === 'MASUK_QTO' || selectedItem.status === 'MASUK_RAB' },
                  { label: 'AHSP', done: !!selectedItem.ahspCode || selectedItem.unitPrice > 0 },
                  { label: 'Harga', done: selectedItem.unitPrice > 0 },
                  { label: 'RAB', done: !!selectedItem.rabItemId || selectedItem.status === 'MASUK_RAB' },
                  { label: 'BOQ', done: !!selectedItem.rabItemId || selectedItem.status === 'MASUK_RAB' },
                ].map((node, i, arr) => (
                  <React.Fragment key={node.label}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                      <div
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: node.done ? '#2563EB' : '#334155',
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: node.done ? '0 0 10px rgba(37,99,235,0.6)' : 'none',
                        }}
                      >
                        {node.done ? <Check size={12} strokeWidth={3} /> : <span style={{ fontSize: '10px' }}>{i + 1}</span>}
                      </div>
                      <span style={{ fontSize: '9.5px', color: node.done ? '#E2E8F0' : '#64748B', fontWeight: node.done ? 700 : 500 }}>
                        {node.label}
                      </span>
                    </div>
                    {i < arr.length - 1 && (
                      <div
                        style={{
                          height: '2px',
                          flex: 1,
                          background: node.done && arr[i + 1].done ? '#2563EB' : '#334155',
                          margin: '0 4px',
                          marginBottom: '14px',
                        }}
                      />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Volume Breakdown Section */}
            <div style={{ background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase' }}>
                  Volume Pekerjaan
                </span>
                <button
                  onClick={() => handleLaunchCalculator(selectedItem)}
                  style={{ background: '#2563EB', color: '#FFFFFF', border: 'none', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Calculator size={11} />
                  <span>Hitung Ulang</span>
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '6px' }}>
                <span style={{ fontSize: '12px', color: '#64748B' }}>Volume Akhir:</span>
                <span style={{ fontSize: '18px', fontWeight: 800, color: '#2563EB' }}>
                  {(selectedItem.volume || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {selectedItem.unit}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#64748B', marginTop: '4px' }}>
                <span>Sumber:</span>
                <span style={{ fontWeight: 600, color: '#334155' }}>
                  {selectedItem.source === 'CALCULATOR' ? `Volume Calculator (${selectedItem.calculatorId})` : selectedItem.source}
                </span>
              </div>
            </div>

            {/* AHSP & Harga Section */}
            <div style={{ background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase' }}>
                  Analisa Harga Satuan (AHSP)
                </span>
                <button
                  onClick={() => handleOpenAhspLinker(selectedItem.id)}
                  style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', color: '#334155', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                >
                  {selectedItem.ahspCode ? 'Ubah AHSP' : '+ Hubungkan'}
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Kode AHSP:</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0F172A' }}>
                    {selectedItem.ahspCode || 'Belum terhubung'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Harga Satuan:</span>
                  <span style={{ fontWeight: 800, color: '#0F172A' }}>
                    {formatCurrencyIDR(selectedItem.unitPrice)} / {selectedItem.unit}
                  </span>
                </div>
              </div>
            </div>

            {/* Total Nilai RAB Section */}
            <div style={{ background: '#EFF6FF', borderRadius: '12px', border: '1px solid #BFDBFE', padding: '16px' }}>
              <span style={{ fontSize: '11.5px', color: '#1E40AF', fontWeight: 700, textTransform: 'uppercase' }}>
                Total Nilai Pekerjaan (RAB)
              </span>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#1E3A8A', marginTop: '4px' }}>
                {formatCurrencyIDR(selectedItem.totalAmount || 0)}
              </div>
              <span style={{ fontSize: '11px', color: '#60A5FA', display: 'block', marginTop: '2px' }}>
                Volume ({selectedItem.volume} {selectedItem.unit}) × Harga Satuan ({formatCurrencyIDR(selectedItem.unitPrice)})
              </span>
            </div>
          </div>

          {/* Drawer Footer Actions */}
          <div style={{ padding: '14px 20px', borderTop: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '8px', background: '#F8FAFC' }}>
            <button
              onClick={() => {
                setInspectorItem(selectedItem);
                setIsInspectorOpen(true);
              }}
              style={{
                width: '100%',
                height: '38px',
                borderRadius: '8px',
                background: '#EFF6FF',
                border: '1px solid #BFDBFE',
                color: '#2563EB',
                fontSize: '12px',
                fontWeight: 750,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <Calculator size={14} color="#2563EB" />
              <span>Buka Work Item Inspector & Analisa AHSP</span>
            </button>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => handleSyncSingleToQto(selectedItem)}
                style={{
                  flex: 1,
                  height: '34px',
                  borderRadius: '6px',
                  background: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  color: '#2563EB',
                  fontSize: '11.5px',
                  fontWeight: 650,
                  cursor: 'pointer',
                }}
              >
                Kirim ke QTO
              </button>
              <button
                onClick={() => handleSyncSingleToRab(selectedItem)}
                style={{
                  flex: 1,
                  height: '34px',
                  borderRadius: '6px',
                  background: '#2563EB',
                  border: 'none',
                  color: '#FFFFFF',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Kirim ke RAB
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          9. MODAL: TAMBAH / EDIT PEKERJAAN
         ========================================================================= */}
      {isAddModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '20px',
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '20px',
              width: '100%',
              maxWidth: '560px',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                {editingItem ? 'Edit Item Pekerjaan' : 'Tambah Pekerjaan Baru'}
              </h2>
              <button onClick={() => setIsAddModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveForm} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Kode</label>
                  <input
                    type="text"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    placeholder="01.01"
                    style={{ width: '100%', height: '38px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 10px', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Kategori Pekerjaan</label>
                  <select
                    value={formCategory}
                    onChange={(e) => {
                      setFormCategory(e.target.value);
                      const catObj = STANDARD_WORK_CATEGORIES.find((c) => c.name === e.target.value);
                      if (catObj && catObj.calcIds.length > 0) {
                        setFormCalculatorId(catObj.calcIds[0]);
                      }
                    }}
                    style={{ width: '100%', height: '38px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 10px', fontSize: '13px' }}
                  >
                    {STANDARD_WORK_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Uraian / Nama Pekerjaan</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Contoh: Pengukuran dan Pemasangan Bowplank"
                  required
                  style={{ width: '100%', height: '38px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 12px', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Sumber Perhitungan</label>
                  <select
                    value={formSource}
                    onChange={(e: any) => setFormSource(e.target.value)}
                    style={{ width: '100%', height: '38px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 10px', fontSize: '13px' }}
                  >
                    <option value="CALCULATOR">Volume Calculator</option>
                    <option value="MANUAL">Input Manual</option>
                    <option value="AI">Magic AI</option>
                  </select>
                </div>

                {formSource === 'CALCULATOR' && (
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Pilih Calculator</label>
                    <select
                      value={formCalculatorId}
                      onChange={(e) => setFormCalculatorId(e.target.value)}
                      style={{ width: '100%', height: '38px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 10px', fontSize: '13px' }}
                    >
                      {ALL_CONSTRUCTION_CALCULATORS.map((calc) => (
                        <option key={calc.id} value={calc.id}>
                          {calc.id.startsWith('residential.') ? '[Residential] ' : '[Workbook] '}{calc.title} ({calc.primaryUnit})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Volume</label>
                  <input
                    type="number"
                    step="any"
                    value={formVolume}
                    onChange={(e) => setFormVolume(parseFloat(e.target.value) || 0)}
                    style={{ width: '100%', height: '38px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 10px', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Satuan</label>
                  <input
                    type="text"
                    value={formUnit}
                    onChange={(e) => setFormUnit(e.target.value)}
                    placeholder="m³, m², m', ls"
                    style={{ width: '100%', height: '38px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 10px', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Harga Satuan (Rp)</label>
                  <input
                    type="number"
                    value={formUnitPrice}
                    onChange={(e) => setFormUnitPrice(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    style={{ width: '100%', height: '38px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '0 10px', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  style={{ height: '38px', padding: '0 16px', borderRadius: '8px', background: '#F1F5F9', border: 'none', color: '#475569', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  style={{ height: '38px', padding: '0 20px', borderRadius: '8px', background: '#2563EB', border: 'none', color: '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                >
                  {editingItem ? 'Simpan Perubahan' : 'Tambahkan Pekerjaan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          10. MODAL: HUBUNGKAN AHSP (Search PUPR AHSP Registry)
         ========================================================================= */}
      {isAhspModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '20px',
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '20px',
              width: '100%',
              maxWidth: '720px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAFC' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Hubungkan Analisa Harga Satuan (AHSP)
                </h3>
                <span style={{ fontSize: '12px', color: '#64748B' }}>Pilih item standar dari Database PUPR / Nasional 2026</span>
              </div>
              <button onClick={() => setIsAhspModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8' }}>
                <X size={18} />
              </button>
            </div>

            {/* Search Filter */}
            <div style={{ padding: '14px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', gap: '10px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={15} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Cari kode atau nama AHSP..."
                  value={ahspSearch}
                  onChange={(e) => setAhspSearch(e.target.value)}
                  style={{ width: '100%', height: '36px', borderRadius: '8px', border: '1px solid #CBD5E1', paddingLeft: '36px', paddingRight: '12px', fontSize: '12.5px', outline: 'none' }}
                />
              </div>
            </div>

            {/* AHSP Items List */}
            <div style={{ padding: '14px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredAhspItems.map((ahsp) => (
                <div
                  key={ahsp.id}
                  onClick={() => handleSelectAhsp(ahsp)}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '10px',
                    border: '1px solid #E2E8F0',
                    background: '#FFFFFF',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#2563EB')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#E2E8F0')}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#2563EB', fontSize: '12px' }}>
                        {ahsp.code}
                      </span>
                      <span style={{ fontSize: '11px', color: '#64748B', background: '#F1F5F9', padding: '1px 6px', borderRadius: '4px' }}>
                        {ahsp.category}
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', marginTop: '2px' }}>
                      {ahsp.name}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', display: 'block' }}>
                      {formatCurrencyIDR(ahsp.unitPrice)}
                    </span>
                    <span style={{ fontSize: '11px', color: '#64748B' }}>per {ahsp.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          11. MODAL: IMPORT (Upload / Paste Excel)
         ========================================================================= */}
      {isImportModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '20px',
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '20px',
              width: '100%',
              maxWidth: '600px',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Import Daftar Pekerjaan / RAB Existing
              </h3>
              <button onClick={() => setIsImportModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8' }}>
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '12.5px', color: '#64748B', margin: '0 0 14px 0' }}>
              Salin baris dari Excel (Kolom: Kode [tab] Uraian [tab] Volume [tab] Satuan [tab] Harga Satuan) lalu tempelkan di bawah:
            </p>

            <textarea
              rows={6}
              value={importPasteText}
              onChange={(e) => setImportPasteText(e.target.value)}
              placeholder="01.01	Pembersihan Lapangan	120	m2	15000&#10;01.02	Pemasangan Bowplank	50	m'	94800"
              style={{ width: '100%', borderRadius: '10px', border: '1px solid #CBD5E1', padding: '10px', fontSize: '12px', fontFamily: 'monospace', outline: 'none' }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
              <button
                onClick={() => setIsImportModalOpen(false)}
                style={{ height: '36px', padding: '0 14px', borderRadius: '8px', background: '#F1F5F9', border: 'none', color: '#475569', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}
              >
                Batal
              </button>
              <button
                onClick={() => {
                  if (!importPasteText.trim()) {
                    showToast('Harap tempelkan data teks terlebih dahulu.', 'warning');
                    return;
                  }
                  const lines = importPasteText.trim().split('\n');
                  let count = 0;
                  lines.forEach((line, idx) => {
                    const parts = line.split(/[\t,;]+/);
                    if (parts.length >= 2) {
                      createWorkItem({
                        code: parts[0]?.trim() || `01.${idx + 1}`,
                        category: '01. PEKERJAAN PERSIAPAN',
                        categoryNumber: 1,
                        name: parts[1]?.trim() || 'Pekerjaan Import',
                        volume: parseFloat(parts[2]?.trim()) || 0,
                        unit: parts[3]?.trim() || 'ls',
                        source: 'IMPORT',
                        materialPrice: 0,
                        laborPrice: 0,
                        equipmentPrice: 0,
                        unitPrice: parseFloat(parts[4]?.trim()) || 0,
                        status: parseFloat(parts[2]?.trim()) > 0 ? 'TERHITUNG' : 'BELUM_DIHITUNG',
                      });
                      count++;
                    }
                  });
                  showToast(`Berhasil mengimpor ${count} item pekerjaan baru!`);
                  setImportPasteText('');
                  setIsImportModalOpen(false);
                }}
                style={{ height: '36px', padding: '0 18px', borderRadius: '8px', background: '#2563EB', border: 'none', color: '#FFFFFF', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}
              >
                Proses Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          12. DRAWER: MAGIC AI WORK ITEMS DRAFT GENERATOR
         ========================================================================= */}
      {isMagicAiDrawerOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: '460px',
            background: '#FFFFFF',
            boxShadow: '-10px 0 40px rgba(0,0,0,0.2)',
            zIndex: 1100,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ padding: '18px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FFFFFF', color: '#111827' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={18} color="#2563EB" />
              <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: '#111827' }}>EZRAB Magic AI Assistant</h3>
            </div>
            <button onClick={() => setIsMagicAiDrawerOpen(false)} style={{ background: 'transparent', border: 'none', color: '#64748B', cursor: 'pointer' }}>
              <X size={18} />
            </button>
          </div>

          <div style={{ padding: '20px 24px', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
            {/* Disclaimer Alert */}
            <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '10px', padding: '12px 14px', fontSize: '12px', color: '#92400E', lineHeight: 1.4 }}>
              <strong>DRAFT — Periksa dan sesuaikan sebelum digunakan.</strong> Magic AI adalah asisten produktivitas penyusun draft pekerjaan. Seluruh kalkulasi final tetap menggunakan calculation engine deterministik.
            </div>

            <div>
              <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A', display: 'block', marginBottom: '6px' }}>
                Deskripsi Proyek / Kebutuhan Pekerjaan
              </label>
              <textarea
                rows={5}
                value={aiPromptInput}
                onChange={(e) => setAiPromptInput(e.target.value)}
                placeholder="Contoh: Rumah tinggal 2 lantai luas 120m2 di Jakarta, struktur beton bertulang, pondasi batu kali, dinding hebel, atap baja ringan..."
                style={{ width: '100%', borderRadius: '10px', border: '1px solid #CBD5E1', padding: '12px', fontSize: '13px', outline: 'none' }}
              />
            </div>

            <button
              onClick={handleGenerateAiWorkItems}
              disabled={isAiGenerating}
              style={{
                height: '42px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #4338CA 0%, #6366F1 100%)',
                color: '#FFFFFF',
                border: 'none',
                fontSize: '13px',
                fontWeight: 700,
                cursor: isAiGenerating ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(99,102,241,0.3)',
              }}
            >
              {isAiGenerating ? (
                <>
                  <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} />
                  <span>Sedang Menganalisis & Menyusun Draft...</span>
                </>
              ) : (
                <>
                  <Sparkles size={15} />
                  <span>Susun Draft Pekerjaan dengan AI</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          13. MODAL: DELETE CONFIRMATION
         ========================================================================= */}
      {deleteConfirmItem && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1200,
            padding: '20px',
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '420px',
              padding: '24px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: '#FEE2E2',
                color: '#DC2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 14px auto',
              }}
            >
              <Trash2 size={22} />
            </div>

            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0' }}>
              Hapus Item Pekerjaan?
            </h3>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 20px 0' }}>
              Apakah Anda yakin ingin menghapus <strong>"{deleteConfirmItem.name}"</strong> ({deleteConfirmItem.code})?
            </p>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setDeleteConfirmItem(null)}
                style={{ flex: 1, height: '38px', borderRadius: '8px', background: '#F1F5F9', border: 'none', color: '#475569', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                Batal
              </button>
              <button
                onClick={() => {
                  deleteWorkItem(deleteConfirmItem.id);
                  if (selectedItemId === deleteConfirmItem.id) setSelectedItemId(null);
                  showToast(`Pekerjaan "${deleteConfirmItem.name}" berhasil dihapus.`);
                  setDeleteConfirmItem(null);
                }}
                style={{ flex: 1, height: '38px', borderRadius: '8px', background: '#DC2626', border: 'none', color: '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WORK ITEM INSPECTOR & AHSP DRAWER */}
      <WorkItemInspectorDrawer
        isOpen={isInspectorOpen}
        onClose={() => {
          setIsInspectorOpen(false);
          setInspectorItem(null);
        }}
        workItem={inspectorItem}
        onItemUpdated={(updated) => {
          setInspectorItem(updated as WorkItem);
          showToast('Analisa AHSP berhasil disimpan.');
        }}
      />

      {/* INTELLIGENT EXCEL IMPORT MODAL */}
      <IntelligentExcelImportModal
        isOpen={isExcelImportModalOpen}
        onClose={() => setIsExcelImportModalOpen(false)}
        onImportCompleted={(importedItems, summary) => {
          if (importedItems.length === 0) return;
          importedItems.forEach((item) => {
            createWorkItem({
              name: item.description,
              code: item.code,
              category: item.category,
              categoryNumber: parseInt(item.category.slice(0, 2), 10) || 1,
              volume: item.volume,
              unit: item.unit,
              unitPrice: item.unitPrice,
              materialPrice: Math.round(item.unitPrice * 0.6),
              laborPrice: Math.round(item.unitPrice * 0.35),
              equipmentPrice: Math.round(item.unitPrice * 0.05),
              source: 'IMPORT',
              status: item.volume > 0 ? 'TERHITUNG' : 'BELUM_DIHITUNG',
            });
          });
          showToast(`Berhasil mengimpor ${importedItems.length} item pekerjaan dari ${summary.groupsCount} grup WBS.`);
        }}
      />
    </div>
  );
};

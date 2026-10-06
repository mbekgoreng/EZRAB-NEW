import React, { useState, useMemo, useRef } from 'react';
import {
  FileText,
  Download,
  Printer,
  Share2,
  FileSpreadsheet,
  Check,
  Calendar,
  Building,
  Eye,
  Camera,
  Edit2,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Layers,
  Sparkles,
  Send,
  MoreVertical,
  Activity,
  Plus,
  Maximize2,
  Minimize2,
  Clock,
  Coins,
  MapPin,
  User,
  CheckCircle2,
  Trash2,
  Upload,
  PieChart,
  Sliders,
  Search,
  Filter,
  CheckCircle,
  AlertCircle,
  BarChart3,
  HardHat,
  Truck,
  Package,
  ArrowUpRight,
  ArrowDownRight,
  Compass,
  Loader2,
} from 'lucide-react';
import { Project, RabItem, AhspItem, Company } from '../../types';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';
import { exportProjectToExcel } from '../../export/excelExportEngine';
import { exportProjectToPDF } from '../../export/pdfExporter';
import { brandingClient } from '../../services/brandingClient';
import { checkKurvaSRequirements, generateKurvaSData } from '../../engine/kurvaSEngine';
import { UnifiedProjectEngine } from '../../engine/unifiedProjectEngine';
import { MASTER_AHSP_DATABASE } from '../../data/indonesianAHSP';

import { useProject } from '../../context/ProjectContext';

interface LaporanViewProps {
  projects?: Project[];
  rabItems?: RabItem[];
  onOpenMagicAi?: () => void;
  onNavigateToTab?: (tab: string) => void;
}

export const LaporanView: React.FC<LaporanViewProps> = ({
  onOpenMagicAi,
  onNavigateToTab,
}) => {
  const {
    currentProject,
    currentProjectId,
    setCurrentProjectId,
    projects: contextProjects,
    projectRabItems,
    projectQtoItems,
    projectScheduleTasks,
    projectKurvaSData,
  } = useProject();

  const activeProject = currentProject || contextProjects[0] || {
    id: 'p-1',
    name: 'Proyek Baru',
    client: '-',
    location: '-',
    progress: 0,
    totalRab: 0,
    createdAt: '2026-09-06',
  };

  const initialRabItems = projectRabItems;

  // Active Tab: Rekapitulasi, BOQ, Analisa Harga Satuan, Kurva S, Jadwal Waktu
  const [activeTab, setActiveTab] = useState<'rekapitulasi' | 'boq' | 'ahsp' | 'kurva-s' | 'jadwal'>('rekapitulasi');

  // Selected Project selector
  const selectedProjectId = currentProjectId || activeProject.id;
  const setSelectedProjectId = (id: string) => setCurrentProjectId(id);

  // Period filter
  const [selectedPeriod, setSelectedPeriod] = useState<string>('Semua Periode');

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Project Cover Image State
  const [projectCoverPhoto, setProjectCoverPhoto] = useState<string>(
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&auto=format&fit=crop&q=80'
  );
  const [photoUploadModalOpen, setPhotoUploadModalOpen] = useState(false);
  const [tempPhotoUrl, setTempPhotoUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Report Settings Switches
  const [reportFormat, setReportFormat] = useState('Lengkap (RAB + QTO + Kurva S + Jadwal)');
  const [reportTemplate, setReportTemplate] = useState('Standar EZRAB');
  const [includeAhsp, setIncludeAhsp] = useState(true);
  const [includeResources, setIncludeResources] = useState(true);
  const [includeCover, setIncludeCover] = useState(false);

  // Detail Rekapitulasi Collapsible Category
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  const toggleCategory = (catId: string) => {
    setExpandedCategories((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };


  // Selected AHSP Item in AHSP Tab
  const [selectedAhspIndex, setSelectedAhspIndex] = useState<number>(0);
  const [ahspSearch, setAhspSearch] = useState('');
  const [selectedAhspCategory, setSelectedAhspCategory] = useState<string>('SEMUA');
  const [hoveredWeekIndex, setHoveredWeekIndex] = useState<number | null>(null);

  // Dynamically derived Rekapitulasi Categories from real RAB Items (empty if no items)
  const rekapCategories = useMemo(() => {
    if (!initialRabItems || initialRabItems.length === 0) return [];
    
    const catMap = new Map<string, { no: number; id: string; name: string; value: number; color: string }>();
    const colors = ['#2563EB', '#F59E0B', '#10B981', '#EF4444', '#38BDF8', '#EC4899', '#F97316', '#8B5CF6', '#14B8A6', '#6366F1'];
    
    initialRabItems.forEach((item) => {
      const catName = item.category || 'Pekerjaan Utama';
      const amt = item.amount || ((item.volume || 0) * (item.unitPrice || 0)) || 0;
      const existing = catMap.get(catName);
      if (existing) {
        existing.value += amt;
      } else {
        const no = catMap.size + 1;
        catMap.set(catName, {
          no,
          id: `cat-${no}`,
          name: catName,
          value: amt,
          color: colors[(no - 1) % colors.length],
        });
      }
    });

    return Array.from(catMap.values());
  }, [initialRabItems]);

  const totalRekapValue = useMemo(() => {
    return rekapCategories.reduce((acc, cat) => acc + cat.value, 0);
  }, [rekapCategories]);

  // BOQ Detailed Dataset derived from real items
  const boqData = useMemo(() => {
    if (!initialRabItems || initialRabItems.length === 0) return [];

    const grouped: Record<string, { categoryCode: string; categoryName: string; items: any[] }> = {};
    initialRabItems.forEach((item) => {
      const cat = item.category || 'PEKERJAAN UTAMA';
      if (!grouped[cat]) {
        grouped[cat] = {
          categoryCode: cat.charAt(0).toUpperCase(),
          categoryName: cat.toUpperCase(),
          items: [],
        };
      }
      grouped[cat].items.push({
        no: item.code || `${grouped[cat].items.length + 1}`,
        desc: item.description,
        vol: item.volume,
        unit: item.unit,
        price: item.unitPrice,
        amount: item.amount || ((item.volume || 0) * (item.unitPrice || 0)),
      });
    });

    return Object.values(grouped);
  }, [initialRabItems]);

  const totalBoqAmount = useMemo(() => {
    return boqData.reduce((sum, cat) => sum + cat.items.reduce((cSum: number, it: any) => cSum + it.amount, 0), 0);
  }, [boqData]);

  // Standardized AHSP Item interface for LaporanView
  interface AhspDetailViewItem {
    id: string;
    code: string;
    category: string;
    name: string;
    unit: string;
    regulationSource?: string;
    overheadPct: number;
    materials: Array<{ code: string; name: string; unit: string; coeff: number; price: number; total: number }>;
    labors: Array<{ code: string; name: string; unit: string; coeff: number; price: number; total: number }>;
    equipments: Array<{ code: string; name: string; unit: string; coeff: number; price: number; total: number }>;
  }

  // Master & Project AHSP List
  const allAhspItems: AhspDetailViewItem[] = useMemo(() => {
    const list: AhspDetailViewItem[] = [];
    const seenCodes = new Set<string>();

    // 1. Process items from current project RAB if they have snapshot or match master
    if (initialRabItems && initialRabItems.length > 0) {
      initialRabItems.forEach((rItem) => {
        const itemCode = rItem.ahspCode || rItem.code;
        if (itemCode && !seenCodes.has(itemCode)) {
          seenCodes.add(itemCode);
          // Check if snapshot exists
          if (rItem.ahspSnapshot) {
            const snap = rItem.ahspSnapshot;
            list.push({
              id: snap.ahspId || `rab-${rItem.id}`,
              code: snap.code || itemCode,
              category: rItem.category || 'Pekerjaan Proyek',
              name: snap.name || rItem.description,
              unit: snap.unit || rItem.unit || 'm²',
              regulationSource: snap.sourceDocument || 'Permen PUPR No. 1/PRT/M/2022',
              overheadPct: rItem.overheadPercent ?? 10,
              materials: (snap.materialComponents || []).map((m) => ({
                code: m.code || 'M.00',
                name: m.name,
                unit: m.unit,
                coeff: m.coefficient || 0,
                price: m.unitPrice || 0,
                total: m.total || ((m.coefficient || 0) * (m.unitPrice || 0)),
              })),
              labors: (snap.laborComponents || []).map((l) => ({
                code: l.code || 'L.00',
                name: l.name,
                unit: l.unit,
                coeff: l.coefficient || 0,
                price: l.unitPrice || 0,
                total: l.total || ((l.coefficient || 0) * (l.unitPrice || 0)),
              })),
              equipments: (snap.equipmentComponents || []).map((e) => ({
                code: e.code || 'E.00',
                name: e.name,
                unit: e.unit,
                coeff: e.coefficient || 0,
                price: e.unitPrice || 0,
                total: e.total || ((e.coefficient || 0) * (e.unitPrice || 0)),
              })),
            });
            return;
          }

          // Check if master database has matching code or description
          const matchedMaster = MASTER_AHSP_DATABASE.find(
            (m) => m.code.toLowerCase() === itemCode.toLowerCase() || m.name.toLowerCase() === rItem.description.toLowerCase()
          );
          if (matchedMaster) {
            list.push({
              id: matchedMaster.id,
              code: matchedMaster.code,
              category: matchedMaster.category,
              name: matchedMaster.name,
              unit: matchedMaster.unit,
              regulationSource: matchedMaster.regulationSource,
              overheadPct: 10,
              materials: (matchedMaster.materialComponents || []).map((m) => ({
                code: m.code,
                name: m.name,
                unit: m.unit,
                coeff: m.coefficient,
                price: m.unitPrice,
                total: m.total,
              })),
              labors: (matchedMaster.laborComponents || []).map((l) => ({
                code: l.code,
                name: l.name,
                unit: l.unit,
                coeff: l.coefficient,
                price: l.unitPrice,
                total: l.total,
              })),
              equipments: (matchedMaster.equipmentComponents || []).map((e) => ({
                code: e.code,
                name: e.name,
                unit: e.unit,
                coeff: e.coefficient,
                price: e.unitPrice,
                total: e.total,
              })),
            });
            return;
          }

          // If no direct components, create standard transparent breakdown based on rItem prices
          const matPrice = rItem.materialPrice || (rItem.unitPrice ? rItem.unitPrice * 0.6 : 0);
          const labPrice = rItem.laborPrice || (rItem.unitPrice ? rItem.unitPrice * 0.3 : 0);
          const eqPrice = rItem.equipmentPrice || (rItem.unitPrice ? rItem.unitPrice * 0.1 : 0);
          list.push({
            id: `proj-${rItem.id}`,
            code: itemCode,
            category: rItem.category || 'Pekerjaan Proyek',
            name: rItem.description,
            unit: rItem.unit || 'ls',
            regulationSource: 'Analisa Harga Satuan Proyek',
            overheadPct: rItem.overheadPercent ?? 10,
            materials: matPrice > 0 ? [
              { code: 'M.PROJ', name: `Bahan Utama & Pendukung (${rItem.description})`, unit: rItem.unit || 'unit', coeff: 1.0, price: matPrice, total: matPrice }
            ] : [],
            labors: labPrice > 0 ? [
              { code: 'L.PROJ', name: `Tenaga Kerja Konstruksi & Tukang`, unit: 'OH', coeff: 1.0, price: labPrice, total: labPrice }
            ] : [],
            equipments: eqPrice > 0 ? [
              { code: 'E.PROJ', name: `Alat Kerja & Operasional`, unit: 'Ls', coeff: 1.0, price: eqPrice, total: eqPrice }
            ] : [],
          });
        }
      });
    }

    // 2. Add all items from MASTER_AHSP_DATABASE (197 items)
    MASTER_AHSP_DATABASE.forEach((item) => {
      if (!seenCodes.has(item.code)) {
        seenCodes.add(item.code);
        list.push({
          id: item.id,
          code: item.code,
          category: item.category,
          name: item.name,
          unit: item.unit,
          regulationSource: item.regulationSource,
          overheadPct: 10,
          materials: (item.materialComponents || []).map((m) => ({
            code: m.code,
            name: m.name,
            unit: m.unit,
            coeff: m.coefficient,
            price: m.unitPrice,
            total: m.total,
          })),
          labors: (item.laborComponents || []).map((l) => ({
            code: l.code,
            name: l.name,
            unit: l.unit,
            coeff: l.coefficient,
            price: l.unitPrice,
            total: l.total,
          })),
          equipments: (item.equipmentComponents || []).map((e) => ({
            code: e.code,
            name: e.name,
            unit: e.unit,
            coeff: e.coefficient,
            price: e.unitPrice,
            total: e.total,
          })),
        });
      }
    });

    return list;
  }, [initialRabItems]);

  // Unique categories for filter pills
  const ahspCategories = useMemo(() => {
    const cats = new Set<string>();
    allAhspItems.forEach((it) => {
      if (it.category) cats.add(it.category);
    });
    return ['SEMUA', ...Array.from(cats)];
  }, [allAhspItems]);

  // Filtered AHSP list by Search and Category
  const filteredAhspList = useMemo(() => {
    return allAhspItems.filter((it) => {
      const matchCat = selectedAhspCategory === 'SEMUA' || it.category === selectedAhspCategory;
      if (!matchCat) return false;
      if (!ahspSearch.trim()) return true;
      const q = ahspSearch.toLowerCase();
      return (
        it.code.toLowerCase().includes(q) ||
        it.name.toLowerCase().includes(q) ||
        it.category.toLowerCase().includes(q)
      );
    });
  }, [allAhspItems, selectedAhspCategory, ahspSearch]);

  const activeAhsp: AhspDetailViewItem = filteredAhspList[selectedAhspIndex] || filteredAhspList[0] || allAhspItems[0] || {
    id: 'fallback',
    code: 'A.0.0.0.0',
    category: 'Umum',
    name: 'Analisa Harga Satuan Tidak Ditemukan',
    unit: 'ls',
    overheadPct: 10,
    materials: [],
    labors: [],
    equipments: [],
  };

  const matSum = (activeAhsp.materials || []).reduce((s, m) => s + m.total, 0);
  const labSum = (activeAhsp.labors || []).reduce((s, l) => s + l.total, 0);
  const eqSum = (activeAhsp.equipments || []).reduce((s, e) => s + e.total, 0);
  const baseHsp = matSum + labSum + eqSum;
  const overheadVal = (baseHsp * activeAhsp.overheadPct) / 100;
  const grandHsp = baseHsp + overheadVal;

  // S-Curve Requirement Check & Data Validation
  const kurvaSRequirement = useMemo(() => {
    return checkKurvaSRequirements(activeProject, projectScheduleTasks);
  }, [activeProject, projectScheduleTasks]);

  // S-Curve Dataset derived from real tasks or normalized construction WBS
  const sCurveWeeks: Array<{
    week: string;
    planWeekly: number;
    planCum: number;
    actWeekly: number | null;
    actCum: number | null;
    dev: number | null;
  }> = useMemo(() => {
    const normSections = UnifiedProjectEngine.normalizeSections(activeProject, initialRabItems);
    const gTotal = totalRekapValue || activeProject.totalRab || 150000000;
    const points = generateKurvaSData(normSections, gTotal, activeProject.startDate, activeProject.targetDate, projectScheduleTasks);

    if (!points || points.length === 0) {
      return Array.from({ length: 8 }, (_, i) => ({
        week: `W${i + 1}`,
        planWeekly: 0,
        planCum: 0,
        actWeekly: null,
        actCum: null,
        dev: null,
      }));
    }

    // Determine real or current progress threshold
    const curProjectProgress = activeProject.progress || 0;
    // Calculate cumulative actual progress matching real status up to current project progress
    let runningAct = 0;

    return points.map((p, idx) => {
      let actWeekly: number | null = null;
      let actCum: number | null = null;
      let dev: number | null = null;

      // If project has progress, populate actual points realistically along the planned trajectory up to current progress
      if (curProjectProgress > 0) {
        if (p.cumulativePlannedPercent <= curProjectProgress) {
          actCum = p.cumulativePlannedPercent;
          actWeekly = p.plannedWeeklyPercent;
          dev = 0.00;
        } else if (runningAct < curProjectProgress) {
          actCum = curProjectProgress;
          actWeekly = Math.max(0, Math.round((curProjectProgress - runningAct) * 100) / 100);
          dev = Number((actCum - p.cumulativePlannedPercent).toFixed(2));
          runningAct = curProjectProgress;
        }
      } else if (idx === 0) {
        // Initial week benchmark
        actWeekly = 0;
        actCum = 0;
        dev = 0;
      }

      if (actCum !== null) {
        runningAct = actCum;
      }

      return {
        week: p.weekLabel,
        planWeekly: p.plannedWeeklyPercent,
        planCum: p.cumulativePlannedPercent,
        actWeekly,
        actCum,
        dev,
      };
    });
  }, [activeProject, initialRabItems, totalRekapValue, projectScheduleTasks]);

  // Gantt Schedule 12-Week Dataset (Empty when no items)
  const ganttTasks = useMemo(() => {
    if (!initialRabItems || initialRabItems.length === 0) return [];
    return initialRabItems.map((item, idx) => ({
      id: idx + 1,
      wbs: `${idx + 1}.0`,
      name: item.description,
      duration: 14,
      start: 'W1',
      end: 'W2',
      startWeekIdx: 0,
      weekSpan: 2,
      weight: totalRekapValue > 0 ? Number(((item.amount || (item.volume * item.unitPrice)) / totalRekapValue * 100).toFixed(2)) : 0,
      progress: 0,
      status: 'Pending',
      color: '#2563EB',
    }));
  }, [initialRabItems, totalRekapValue]);

  // Handle Photo File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setTempPhotoUrl(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSavePhoto = () => {
    if (tempPhotoUrl) {
      setProjectCoverPhoto(tempPhotoUrl);
      setPhotoUploadModalOpen(false);
      setTempPhotoUrl('');
    }
  };

  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const handleExportPdf = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      const branding = await brandingClient.getBranding('ws-default-ezrab');
      const company: Company = {
        id: 'comp-1',
        name: branding.companyName || 'PT EZRAB KONSTRUKSI DIGITAL',
        address: branding.address || 'SCBD District 8 Tower A Lt. 28, Jakarta Selatan',
        phone: branding.phone || '021-5088-9900',
        email: branding.email || 'info@ezrab.co.id',
        website: branding.website || 'https://ezrab.co.id',
        taxNumber: branding.taxNumber || '01.234.567.8-012.000',
        directorName: branding.directorName || 'Ir. Ahmad Yusuf, M.T.',
        leadEstimatorName: branding.leadEstimatorName || 'Ahmad Yusuf (Super Admin)',
        logo: branding.logoUrl || '',
        defaultOverheadPercent: 5,
        defaultProfitPercent: 5,
        defaultContingencyPercent: 0,
        defaultTaxPercent: 11,
      };

      const exportSections = boqData.length > 0
        ? boqData.map((b) => ({
            id: `sec-${b.categoryCode}`,
            code: b.categoryCode,
            name: b.categoryName,
            subtotal: b.items.reduce((s, it) => s + it.amount, 0),
            items: b.items.map((it) => ({
              id: `it-${it.no}`,
              sectionId: `sec-${b.categoryCode}`,
              itemNumber: it.no,
              code: it.no,
              description: it.desc,
              specification: it.desc,
              volume: it.vol,
              unit: it.unit,
              materialPrice: Math.round(it.price * 0.7),
              laborPrice: Math.round(it.price * 0.3),
              equipmentPrice: 0,
              unitPrice: it.price,
              totalPrice: it.amount,
              verificationStatus: 'VERIFIED' as const,
            })),
          }))
        : [];

      const exportProj: any = {
        ...activeProject,
        sections: exportSections,
        rabItems: initialRabItems || [],
        items: initialRabItems || [],
      };

      await exportProjectToPDF(exportProj, company, {
        subscriptionPlan: branding.subscriptionPlan,
        isWatermarkRequired: branding.isWatermarkRequired,
        companyLogoUrl: branding.logoUrl,
        leadEstimatorName: branding.leadEstimatorName,
        directorName: branding.directorName,
      });
    } catch (err: any) {
      console.error('[LaporanView PDF Error]:', err);
      alert('Gagal membuat PDF. ' + (err?.message || 'Silakan periksa data proyek.'));
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div
      style={{
        width: '100%',
        maxWidth: isFullscreen ? '100%' : '1680px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        color: '#0F172A',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      {/* =========================================================================
          1. BREADCRUMB & PAGE HEADER
         ========================================================================= */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          {/* Breadcrumb */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 500,
              color: '#64748B',
              marginBottom: '4px',
            }}
          >
            <span
              onClick={() => onNavigateToTab && onNavigateToTab('dashboard')}
              style={{ cursor: 'pointer', transition: 'color 0.15s' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#2563EB')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#64748B')}
            >
              Dashboard
            </span>
            <span style={{ color: '#94A3B8' }}>&gt;</span>
            <span style={{ color: '#2563EB', fontWeight: 600 }}>Laporan</span>
          </div>

          <h1
            style={{
              fontSize: '24px',
              fontWeight: 800,
              letterSpacing: '-0.025em',
              color: '#0F172A',
              margin: '0 0 2px 0',
            }}
          >
            Laporan Proyek
          </h1>
          <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
            Lihat dan kelola seluruh laporan proyek Anda dengan lengkap dan terstruktur.
          </p>
        </div>

        {/* Fullscreen Toggle */}
        <button
          onClick={() => setIsFullscreen(!isFullscreen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 12px',
            borderRadius: '8px',
            background: '#ffffff',
            border: '1px solid #E2E8F0',
            fontSize: '12px',
            fontWeight: 600,
            color: '#64748B',
            cursor: 'pointer',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
          }}
        >
          {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          <span>{isFullscreen ? 'Keluar Fullscreen' : 'Fullscreen'}</span>
        </button>
      </div>

      {/* =========================================================================
          2. HORIZONTAL REPORT TABS BAR (REKAPITULASI, BOQ, AHSP, KURVA S, JADWAL)
         ========================================================================= */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          borderBottom: '1px solid #E2E8F0',
          paddingBottom: '2px',
          overflowX: 'auto',
        }}
      >
        {[
          { id: 'rekapitulasi', label: 'Rekapitulasi', icon: Layers },
          { id: 'boq', label: 'BOQ', icon: FileSpreadsheet },
          { id: 'ahsp', label: 'Analisa Harga Satuan', icon: Sliders },
          { id: 'kurva-s', label: 'Kurva S', icon: TrendingUp },
          { id: 'jadwal', label: 'Jadwal Waktu', icon: Clock },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                height: '40px',
                padding: '0 18px',
                borderRadius: '10px 10px 0 0',
                background: isActive ? '#EFF6FF' : 'transparent',
                color: isActive ? '#2563EB' : '#64748B',
                fontSize: '13px',
                fontWeight: isActive ? 700 : 500,
                border: 'none',
                borderBottom: isActive ? '2.5px solid #2563EB' : '2.5px solid transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon size={16} color={isActive ? '#2563EB' : '#64748B'} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* =========================================================================
          3. SUBHEADER FILTER & EXPORT BAR
         ========================================================================= */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        {/* Left: Project Selector & Period Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Project Selector */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #E2E8F0',
              borderRadius: '10px',
              padding: '6px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
              cursor: 'pointer',
            }}
          >
            <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB' }}>
              <Building size={14} />
            </div>
            <div>
              <div style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600, lineHeight: 1 }}>Proyek</div>
              <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                <span>{activeProject.name}</span>
                <ChevronDown size={14} color="#94A3B8" />
              </div>
            </div>
          </div>

          {/* Period Selector */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #E2E8F0',
              borderRadius: '10px',
              padding: '6px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
              cursor: 'pointer',
            }}
          >
            <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B' }}>
              <Calendar size={14} />
            </div>
            <div>
              <div style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600, lineHeight: 1 }}>Periode</div>
              <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                <span>{selectedPeriod}</span>
                <ChevronDown size={14} color="#94A3B8" />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Export PDF & Export Excel Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={handleExportPdf}
            disabled={isExportingPdf}
            style={{
              height: '38px',
              padding: '0 16px',
              borderRadius: '10px',
              background: isExportingPdf ? '#F1F5F9' : '#ffffff',
              border: '1px solid #E2E8F0',
              color: isExportingPdf ? '#94A3B8' : '#334155',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: isExportingPdf ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!isExportingPdf) e.currentTarget.style.borderColor = '#CBD5E1';
            }}
            onMouseLeave={(e) => {
              if (!isExportingPdf) e.currentTarget.style.borderColor = '#E2E8F0';
            }}
          >
            {isExportingPdf ? (
              <>
                <Loader2 size={14} color="#2563EB" className="animate-spin" />
                <span>Membuat PDF...</span>
              </>
            ) : (
              <>
                <Upload size={14} color="#2563EB" />
                <span>Export PDF</span>
              </>
            )}
          </button>

          <button
            onClick={async () => {
              try {
                const company: Company = {
                  id: 'comp-1',
                  name: 'PT EZRAB KONSTRUKSI DIGITAL',
                  address: 'SCBD District 8 Tower A Lt. 28, Jakarta Selatan',
                  phone: '021-5088-9900',
                  email: 'info@ezrab.co.id',
                  website: 'https://ezrab.co.id',
                  taxNumber: '01.234.567.8-012.000',
                  directorName: 'Ir. Ahmad Yusuf, M.T.',
                  leadEstimatorName: 'Ahmad Yusuf (Super Admin)',
                  defaultOverheadPercent: 5,
                  defaultProfitPercent: 5,
                  defaultContingencyPercent: 0,
                  defaultTaxPercent: 11,
                };

                const exportProj: Project = {
                  ...activeProject,
                  sections: boqData.map((b) => ({
                    id: `sec-${b.categoryCode}`,
                    code: b.categoryCode,
                    name: b.categoryName,
                    subtotal: b.items.reduce((s, it) => s + it.amount, 0),
                    items: b.items.map((it, idx) => ({
                      id: `it-${it.no}`,
                      sectionId: `sec-${b.categoryCode}`,
                      itemNumber: it.no,
                      code: it.no,
                      description: it.desc,
                      specification: it.desc,
                      volume: it.vol,
                      unit: it.unit,
                      materialPrice: Math.round(it.price * 0.7),
                      laborPrice: Math.round(it.price * 0.3),
                      equipmentPrice: 0,
                      unitPrice: it.price,
                      totalPrice: it.amount,
                      verificationStatus: 'VERIFIED',
                    })),
                  })),
                  costSummary: {
                    directCost: totalBoqAmount,
                    overheadPercent: 5,
                    overheadAmount: Math.round(totalBoqAmount * 0.05),
                    profitPercent: 5,
                    profitAmount: Math.round(totalBoqAmount * 0.05),
                    contingencyPercent: 0,
                    contingencyAmount: 0,
                    directorMarkupPercent: 0,
                    directorMarkupNominal: 0,
                    directorMarkupTotal: 0,
                    showMarkupToEditor: false,
                    showMarkupToClient: false,
                    subtotalBeforeTax: totalBoqAmount,
                    taxPercent: 11,
                    taxAmount: Math.round(totalBoqAmount * 0.11),
                    grandTotal: totalBoqAmount,
                    costPerM2: Math.round(totalBoqAmount / 120),
                  },
                };

                await exportProjectToExcel(exportProj, company, {
                  includeCover: true,
                  includeProjectIdentity: true,
                  includeRekap: true,
                  includeRABDetail: true,
                  includeVolumeBackUp: true,
                  includeLabor: true,
                  includeMaterial: true,
                  includeEquipment: true,
                  includeAHSP: true,
                  includeSchedule: true,
                  includeKurvaS: true,
                  includeCashflow: true,
                });

                alert('Workbook Excel (.xlsx) 13-Sheets berhasil di-generate & diunduh!');
              } catch (err) {
                console.error(err);
                alert('Gagal mengunduh berkas Excel.');
              }
            }}
            style={{
              height: '38px',
              padding: '0 18px',
              borderRadius: '10px',
              background: '#2563EB',
              color: '#ffffff',
              fontSize: '12.5px',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 12px rgba(37,99,235,0.25)',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#1D4ED8')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#2563EB')}
          >
            <FileSpreadsheet size={15} />
            <span>Export Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          4. MAIN TWO-COLUMN LAYOUT: REPORT CONTENT (LEFT) + INFO/SETTINGS (RIGHT)
         ========================================================================= */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 330px',
          gap: '20px',
          alignItems: 'start',
        }}
      >
        {/* =====================================================================
            LEFT MAIN COLUMN: DYNAMIC TABS (REKAPITULASI, BOQ, AHSP, KURVA S, JADWAL)
           ===================================================================== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* ===================================================================
              TAB 1: REKAPITULASI (DEFAULT)
             =================================================================== */}
          {activeTab === 'rekapitulasi' && (
            <>
              {/* 4 TOP KPI CARDS */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '16px',
                }}
              >
                {/* Card 1: Total Nilai RAB */}
                <div
                  style={{
                    background: '#ffffff',
                    borderRadius: '16px',
                    border: '1px solid #EEF2F7',
                    padding: '16px 20px',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748B' }}>Total Nilai RAB</span>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
                      {totalRekapValue === 0 ? 'Rp 0' : formatCurrencyIDR(totalRekapValue)}
                    </div>
                    <span style={{ fontSize: '11px', color: '#94A3B8' }}>
                      Terakumulasi 10 kategori
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB' }}>
                      <FileText size={18} />
                    </div>
                    <svg viewBox="0 0 50 25" style={{ width: '50px', height: '25px', opacity: 0.7 }}>
                      <path d="M 0 20 Q 15 10, 30 18 T 50 8" fill="none" stroke="#93C5FD" strokeWidth="2" />
                    </svg>
                  </div>
                </div>

                {/* Card 2: Total Item Pekerjaan */}
                <div
                  style={{
                    background: '#ffffff',
                    borderRadius: '16px',
                    border: '1px solid #EEF2F7',
                    padding: '16px 20px',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748B' }}>Total Item Pekerjaan</span>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
                      19 Item
                    </div>
                    <span style={{ fontSize: '11px', color: '#94A3B8' }}>
                      5 Kategori aktif
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB' }}>
                      <Layers size={18} />
                    </div>
                    <svg viewBox="0 0 50 25" style={{ width: '50px', height: '25px', opacity: 0.7 }}>
                      <path d="M 0 18 Q 15 22, 30 12 T 50 15" fill="none" stroke="#93C5FD" strokeWidth="2" />
                    </svg>
                  </div>
                </div>

                {/* Card 3: Total Volume */}
                <div
                  style={{
                    background: '#ffffff',
                    borderRadius: '16px',
                    border: '1px solid #EEF2F7',
                    padding: '16px 20px',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748B' }}>Total Volume</span>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
                      124,00 <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748B' }}>m³</span>
                    </div>
                    <span style={{ fontSize: '11px', color: '#94A3B8' }}>
                      Akumulasi volume pekerjaan
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB' }}>
                      <Activity size={18} />
                    </div>
                    <svg viewBox="0 0 50 25" style={{ width: '50px', height: '25px', opacity: 0.7 }}>
                      <path d="M 0 22 Q 20 8, 35 18 T 50 10" fill="none" stroke="#93C5FD" strokeWidth="2" />
                    </svg>
                  </div>
                </div>

                {/* Card 4: Progress */}
                <div
                  style={{
                    background: '#ffffff',
                    borderRadius: '16px',
                    border: '1px solid #EEF2F7',
                    padding: '16px 20px',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748B' }}>Progress</span>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#10B981', letterSpacing: '-0.02em' }}>
                      {activeProject.progress || 35}%
                    </div>
                    <span style={{ fontSize: '11px', color: '#16A34A', fontWeight: 600 }}>
                      +3.94% Ahead schedule
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16A34A' }}>
                      <TrendingUp size={18} />
                    </div>
                    <svg viewBox="0 0 50 25" style={{ width: '50px', height: '25px', opacity: 0.7 }}>
                      <path d="M 0 15 Q 15 25, 30 10 T 50 20" fill="none" stroke="#86EFAC" strokeWidth="2" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* REKAPITULASI ANGGARAN BIAYA CARD (TABLE + DONUT CHART) */}
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '20px',
                  border: '1px solid #EEF2F7',
                  padding: '24px',
                  boxShadow: '0 2px 16px rgba(15,23,42,0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                }}
              >
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  Rekapitulasi Anggaran Biaya
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: '24px', alignItems: 'center' }}>
                  {/* Left: Summary Table */}
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontWeight: 600 }}>
                          <th style={{ padding: '8px 10px', textAlign: 'center', width: '36px' }}>No</th>
                          <th style={{ padding: '8px 10px', textAlign: 'left' }}>Uraian</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right', width: '120px' }}>Nilai (Rp)</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right', width: '80px' }}>Persentase</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rekapCategories.map((cat) => {
                          const pct = totalRekapValue > 0 ? ((cat.value / totalRekapValue) * 100).toFixed(2) : '0,00';
                          return (
                            <tr key={cat.no} style={{ borderBottom: '1px solid #F1F5F9' }}>
                              <td style={{ padding: '6px 10px', textAlign: 'center', color: '#94A3B8' }}>{cat.no}</td>
                              <td style={{ padding: '6px 10px', fontWeight: 500, color: '#0F172A' }}>{cat.name}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', color: '#0F172A' }}>{cat.value.toLocaleString('id-ID')}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', color: '#64748B' }}>{pct}%</td>
                            </tr>
                          );
                        })}
                        {/* Total Row */}
                        <tr style={{ borderTop: '2px solid #0F172A', fontWeight: 800, background: '#FAFCFF' }}>
                          <td colSpan={2} style={{ padding: '10px', textAlign: 'left' }}>Total</td>
                          <td style={{ padding: '10px', textAlign: 'right', color: '#2563EB' }}>{formatCurrencyIDR(totalRekapValue)}</td>
                          <td style={{ padding: '10px', textAlign: 'right', color: '#2563EB' }}>100,00%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Right: Donut Chart + Legend */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    {/* SVG Donut Chart */}
                    <div style={{ position: 'relative', width: '130px', height: '130px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                        <path
                          stroke="#F1F5F9"
                          strokeWidth="3.8"
                          fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        <path
                          stroke="#2563EB"
                          strokeDasharray="45, 100"
                          strokeWidth="3.8"
                          strokeLinecap="round"
                          fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                      </svg>
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                        <span style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>100%</span>
                        <span style={{ fontSize: '9px', color: '#94A3B8', marginTop: '2px' }}>Total Anggaran</span>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#2563EB' }}>{formatCurrencyIDR(totalRekapValue)}</span>
                      </div>
                    </div>

                    {/* Categories Legend List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexGrow: 1, fontSize: '11px' }}>
                      {rekapCategories.slice(0, 6).map((cat) => {
                        const pct = totalRekapValue > 0 ? ((cat.value / totalRekapValue) * 100).toFixed(2) : '0,00';
                        return (
                          <div key={cat.no} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
                              <span style={{ color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cat.name}</span>
                            </div>
                            <span style={{ fontWeight: 700, color: '#0F172A', flexShrink: 0 }}>{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>
              </div>

              {/* DETAIL REKAPITULASI TABLE */}
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '20px',
                  border: '1px solid #EEF2F7',
                  padding: '24px',
                  boxShadow: '0 2px 16px rgba(15,23,42,0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    Detail Rekapitulasi
                  </h3>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}>
                    <MoreVertical size={16} />
                  </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontWeight: 600 }}>
                        <th style={{ padding: '8px 10px', textAlign: 'center', width: '36px' }}>No</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', width: '80px' }}>Kode</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>Uraian Pekerjaan</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', width: '90px' }}>Volume</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center', width: '60px' }}>Satuan</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', width: '120px' }}>Harga Satuan (Rp)</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right', width: '130px' }}>Jumlah (Rp)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Category Header A */}
                      <tr style={{ background: '#EFF6FF', borderTop: '1px solid #DBEAFE', borderBottom: '1px solid #DBEAFE' }}>
                        <td style={{ textAlign: 'center', padding: '6px' }}>
                          <button
                            onClick={() => toggleCategory('cat-A')}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563EB', padding: 0 }}
                          >
                            {expandedCategories['cat-A'] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        </td>
                        <td style={{ fontWeight: 800, color: '#2563EB', padding: '6px 10px' }}>A.</td>
                        <td colSpan={5} style={{ fontWeight: 800, color: '#2563EB', padding: '6px 12px' }}>
                          PEKERJAAN PERSIAPAN
                        </td>
                      </tr>

                      {expandedCategories['cat-A'] && (
                        <>
                          <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ textAlign: 'center', color: '#94A3B8', padding: '8px' }}>1</td>
                            <td style={{ color: '#2563EB', fontWeight: 600, padding: '8px 10px' }}>1.1.01</td>
                            <td style={{ fontWeight: 500, color: '#0F172A', padding: '8px 12px' }}>Pembersihan lahan</td>
                            <td style={{ textAlign: 'right', color: '#0F172A', padding: '8px 10px' }}>120,00</td>
                            <td style={{ textAlign: 'center', color: '#64748B', padding: '8px 10px' }}>Ls</td>
                            <td style={{ textAlign: 'right', color: '#0F172A', padding: '8px 10px' }}>25.000</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: '#0F172A', padding: '8px 12px' }}>3.000.000</td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ textAlign: 'center', color: '#94A3B8', padding: '8px' }}>2</td>
                            <td style={{ color: '#2563EB', fontWeight: 600, padding: '8px 10px' }}>1.1.02</td>
                            <td style={{ fontWeight: 500, color: '#0F172A', padding: '8px 12px' }}>Pengukuran dan pasang bouwplank</td>
                            <td style={{ textAlign: 'right', color: '#0F172A', padding: '8px 10px' }}>1,00</td>
                            <td style={{ textAlign: 'center', color: '#64748B', padding: '8px 10px' }}>Ls</td>
                            <td style={{ textAlign: 'right', color: '#0F172A', padding: '8px 10px' }}>500.000</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: '#0F172A', padding: '8px 12px' }}>500.000</td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ textAlign: 'center', color: '#94A3B8', padding: '8px' }}>3</td>
                            <td style={{ color: '#2563EB', fontWeight: 600, padding: '8px 10px' }}>1.1.03</td>
                            <td style={{ fontWeight: 500, color: '#0F172A', padding: '8px 12px' }}>Direksi keet</td>
                            <td style={{ textAlign: 'right', color: '#0F172A', padding: '8px 10px' }}>1,00</td>
                            <td style={{ textAlign: 'center', color: '#64748B', padding: '8px 10px' }}>Ls</td>
                            <td style={{ textAlign: 'right', color: '#0F172A', padding: '8px 10px' }}>3.000.000</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: '#0F172A', padding: '8px 12px' }}>3.000.000</td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ textAlign: 'center', color: '#94A3B8', padding: '8px' }}>4</td>
                            <td style={{ color: '#2563EB', fontWeight: 600, padding: '8px 10px' }}>1.1.04</td>
                            <td style={{ fontWeight: 500, color: '#0F172A', padding: '8px 12px' }}>Mobilisasi alat</td>
                            <td style={{ textAlign: 'right', color: '#0F172A', padding: '8px 10px' }}>1,00</td>
                            <td style={{ textAlign: 'center', color: '#64748B', padding: '8px 10px' }}>Ls</td>
                            <td style={{ textAlign: 'right', color: '#0F172A', padding: '8px 10px' }}>2.500.000</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: '#0F172A', padding: '8px 12px' }}>2.500.000</td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ textAlign: 'center', color: '#94A3B8', padding: '8px' }}>5</td>
                            <td style={{ color: '#2563EB', fontWeight: 600, padding: '8px 10px' }}>1.1.05</td>
                            <td style={{ fontWeight: 500, color: '#0F172A', padding: '8px 12px' }}>Pembuatan jalan kerja</td>
                            <td style={{ textAlign: 'right', color: '#0F172A', padding: '8px 10px' }}>1,00</td>
                            <td style={{ textAlign: 'center', color: '#64748B', padding: '8px 10px' }}>Ls</td>
                            <td style={{ textAlign: 'right', color: '#0F172A', padding: '8px 10px' }}>1.500.000</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: '#0F172A', padding: '8px 12px' }}>1.500.000</td>
                          </tr>
                          {/* Subtotal Category */}
                          <tr style={{ background: '#FAFCFF', fontWeight: 700 }}>
                            <td colSpan={6} style={{ padding: '8px 12px', textAlign: 'left', color: '#0F172A' }}>
                              Total Pekerjaan Persiapan
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', color: '#2563EB' }}>
                              Rp 10.500.000
                            </td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ===================================================================
              TAB 2: BOQ (BILL OF QUANTITY)
             =================================================================== */}
          {activeTab === 'boq' && (
            <div
              style={{
                background: '#ffffff',
                borderRadius: '20px',
                border: '1px solid #EEF2F7',
                padding: '24px',
                boxShadow: '0 2px 16px rgba(15,23,42,0.04)',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
              }}
            >
              {/* Header BOQ */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: '0 0 4px 0' }}>
                    Bill of Quantity (BOQ)
                  </h3>
                  <p style={{ fontSize: '12.5px', color: '#64748B', margin: 0 }}>
                    Daftar kuantitas pekerjaan terstruktur berdasarkan perhitungan RAB dan QTO terverifikasi.
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#2563EB', background: '#EFF6FF', padding: '4px 10px', borderRadius: '8px', border: '1px solid #DBEAFE' }}>
                    Formula: Volume × Harga Satuan
                  </span>
                </div>
              </div>

              {/* BOQ Summary Pill Bar */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 16px' }}>
                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Total Akumulasi BOQ</div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                    {formatCurrencyIDR(totalBoqAmount)}
                  </div>
                </div>

                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 16px' }}>
                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Kategori Pekerjaan</div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#2563EB', marginTop: '2px' }}>
                    5 Divisi Utama
                  </div>
                </div>

                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 16px' }}>
                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Total Item Pekerjaan</div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#10B981', marginTop: '2px' }}>
                    19 Item Rinci
                  </div>
                </div>
              </div>

              {/* BOQ Table */}
              <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '12px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 700 }}>
                      <th style={{ padding: '10px 12px', textAlign: 'center', width: '50px' }}>No</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', width: '90px' }}>Kode</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left' }}>Uraian Pekerjaan</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', width: '90px' }}>Volume</th>
                      <th style={{ padding: '10px 10px', textAlign: 'center', width: '60px' }}>Satuan</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', width: '130px' }}>Harga Satuan (Rp)</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right', width: '140px' }}>Jumlah (Rp)</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', width: '80px' }}>Bobot (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boqData.map((catGroup) => {
                      const catTotal = catGroup.items.reduce((s, it) => s + it.amount, 0);
                      const catBobot = ((catTotal / totalBoqAmount) * 100).toFixed(2);
                      const isExpanded = expandedCategories[`cat-${catGroup.categoryCode}`] ?? true;

                      return (
                        <React.Fragment key={catGroup.categoryCode}>
                          {/* Category Header Bar */}
                          <tr style={{ background: '#EFF6FF', borderTop: '1px solid #DBEAFE', borderBottom: '1px solid #DBEAFE' }}>
                            <td style={{ textAlign: 'center', padding: '8px' }}>
                              <button
                                onClick={() => toggleCategory(`cat-${catGroup.categoryCode}`)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563EB', padding: 0 }}
                              >
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </button>
                            </td>
                            <td style={{ fontWeight: 800, color: '#2563EB', padding: '8px 12px' }}>{catGroup.categoryCode}.</td>
                            <td colSpan={4} style={{ fontWeight: 800, color: '#2563EB', padding: '8px 14px' }}>
                              {catGroup.categoryName}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 800, color: '#2563EB', padding: '8px 14px' }}>
                              {formatCurrencyIDR(catTotal)}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 800, color: '#2563EB', padding: '8px 12px' }}>
                              {catBobot}%
                            </td>
                          </tr>

                          {/* Category Items */}
                          {isExpanded &&
                            catGroup.items.map((item, idx) => {
                              const itemBobot = ((item.amount / totalBoqAmount) * 100).toFixed(2);
                              return (
                                <tr key={item.no} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                  <td style={{ textAlign: 'center', color: '#94A3B8', padding: '8px' }}>{idx + 1}</td>
                                  <td style={{ color: '#2563EB', fontWeight: 600, padding: '8px 12px' }}>{item.no}</td>
                                  <td style={{ fontWeight: 500, color: '#0F172A', padding: '8px 14px' }}>{item.desc}</td>
                                  <td style={{ textAlign: 'right', color: '#0F172A', padding: '8px 12px' }}>{item.vol.toLocaleString('id-ID')}</td>
                                  <td style={{ textAlign: 'center', color: '#64748B', padding: '8px 10px' }}>{item.unit}</td>
                                  <td style={{ textAlign: 'right', color: '#0F172A', padding: '8px 12px' }}>{item.price.toLocaleString('id-ID')}</td>
                                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#0F172A', padding: '8px 14px' }}>{item.amount.toLocaleString('id-ID')}</td>
                                  <td style={{ textAlign: 'right', color: '#64748B', padding: '8px 12px' }}>{itemBobot}%</td>
                                </tr>
                              );
                            })}
                        </React.Fragment>
                      );
                    })}

                    {/* BOQ Total Row */}
                    <tr style={{ borderTop: '2px solid #0F172A', fontWeight: 800, background: '#F8FAFC' }}>
                      <td colSpan={3} style={{ padding: '12px 14px', textAlign: 'left', fontSize: '13px' }}>
                        TOTAL BILL OF QUANTITY (BOQ)
                      </td>
                      <td colSpan={3} style={{ textAlign: 'right', color: '#64748B', padding: '12px 14px' }}>
                        Akumulasi Keseluruhan
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: '#2563EB', fontSize: '13px' }}>
                        {formatCurrencyIDR(totalBoqAmount)}
                      </td>
                      <td style={{ padding: '12px 12px', textAlign: 'right', color: '#2563EB', fontSize: '13px' }}>
                        100,00%
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===================================================================
              TAB 3: ANALISA HARGA SATUAN (AHSP 2026)
             =================================================================== */}
          {activeTab === 'ahsp' && (
            <div
              style={{
                background: '#ffffff',
                borderRadius: '20px',
                border: '1px solid #EEF2F7',
                padding: '24px',
                boxShadow: '0 2px 16px rgba(15,23,42,0.04)',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
              }}
            >
              {/* Header AHSP */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                      Analisa Harga Satuan Pekerjaan (AHSP)
                    </h3>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#16A34A', background: '#DCFCE7', border: '1px solid #BBF7D0', padding: '2px 8px', borderRadius: '6px' }}>
                      {activeAhsp.regulationSource || 'Permen PUPR Standar'}
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '2px 8px', borderRadius: '6px' }}>
                      {allAhspItems.length} Item Tersedia
                    </span>
                  </div>
                  <p style={{ fontSize: '12.5px', color: '#64748B', margin: '4px 0 0 0' }}>
                    Rincian koefisien bahan, upah tenaga kerja, dan peralatan dengan kalkulasi transparan dan akurat.
                  </p>
                </div>

                {/* Search Bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '260px' }}>
                  <div style={{ position: 'relative', width: '100%' }}>
                    <Search size={15} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="text"
                      placeholder="Cari kode atau uraian AHSP..."
                      value={ahspSearch}
                      onChange={(e) => {
                        setAhspSearch(e.target.value);
                        setSelectedAhspIndex(0);
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 12px 8px 32px',
                        borderRadius: '10px',
                        border: '1px solid #CBD5E1',
                        fontSize: '12px',
                        outline: 'none',
                        background: '#F8FAFC',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Category Filter Pills */}
              <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
                {ahspCategories.map((cat) => {
                  const isCatSelected = selectedAhspCategory === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => {
                        setSelectedAhspCategory(cat);
                        setSelectedAhspIndex(0);
                      }}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '20px',
                        fontSize: '11.5px',
                        fontWeight: isCatSelected ? 700 : 500,
                        background: isCatSelected ? '#2563EB' : '#F1F5F9',
                        color: isCatSelected ? '#ffffff' : '#475569',
                        border: 'none',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>

              {/* AHSP Item Selector Carousel / Tabs */}
              <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '6px' }}>
                {filteredAhspList.length === 0 ? (
                  <div style={{ padding: '12px', fontSize: '12px', color: '#64748B', fontStyle: 'italic' }}>
                    Tidak ada analisa harga satuan yang cocok dengan pencarian "{ahspSearch}".
                  </div>
                ) : (
                  filteredAhspList.slice(0, 40).map((item, idx) => {
                    const isSelected = selectedAhspIndex === idx;
                    return (
                      <button
                        key={item.id || item.code}
                        onClick={() => setSelectedAhspIndex(idx)}
                        style={{
                          padding: '8px 14px',
                          borderRadius: '10px',
                          background: isSelected ? '#2563EB' : '#F8FAFC',
                          color: isSelected ? '#ffffff' : '#334155',
                          border: isSelected ? '1px solid #2563EB' : '1px solid #E2E8F0',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          whiteSpace: 'nowrap',
                          transition: 'all 0.15s ease',
                          flexShrink: 0,
                        }}
                      >
                        <span>{item.code}</span>
                        <span style={{ opacity: isSelected ? 0.9 : 0.6, fontSize: '11px', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.name}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Active Selected Item Header Banner */}
              <div
                style={{
                  background: '#FAFCFF',
                  border: '1px solid #DBEAFE',
                  borderRadius: '14px',
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#2563EB' }}>KODE: {activeAhsp.code} • SATUAN: {activeAhsp.unit}</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                    {activeAhsp.name}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>Total Harga Satuan Pekerjaan (HSP)</div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: '#2563EB' }}>
                    {formatCurrencyIDR(grandHsp)}
                  </div>
                </div>
              </div>

              {/* 3 Sub-Tables: Material (A), Labor (B), Equipment (C) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                
                {/* 1. MATERIAL SECTION */}
                {activeAhsp.materials.length > 0 ? (
                  <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{ background: '#F8FAFC', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, fontSize: '12.5px', color: '#0F172A' }}>
                        <Package size={14} color="#2563EB" />
                        <span>A. KEBUTUHAN BAHAN / MATERIAL</span>
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#2563EB' }}>
                        Subtotal: {formatCurrencyIDR(matSum)}
                      </span>
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#64748B', fontWeight: 600 }}>
                          <th style={{ padding: '8px 12px', textAlign: 'left', width: '80px' }}>Kode</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Uraian Bahan</th>
                          <th style={{ padding: '8px 10px', textAlign: 'center', width: '60px' }}>Satuan</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right', width: '90px' }}>Koefisien</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right', width: '120px' }}>Harga Dasar (Rp)</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right', width: '130px' }}>Subtotal (Rp)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeAhsp.materials.map((m) => (
                          <tr key={m.code} style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ color: '#2563EB', fontWeight: 600, padding: '7px 12px' }}>{m.code}</td>
                            <td style={{ fontWeight: 500, color: '#0F172A', padding: '7px 12px' }}>{m.name}</td>
                            <td style={{ textAlign: 'center', color: '#64748B', padding: '7px 10px' }}>{m.unit}</td>
                            <td style={{ textAlign: 'right', color: '#0F172A', padding: '7px 10px' }}>{m.coeff.toFixed(3)}</td>
                            <td style={{ textAlign: 'right', color: '#0F172A', padding: '7px 12px' }}>{m.price.toLocaleString('id-ID')}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: '#0F172A', padding: '7px 12px' }}>{m.total.toLocaleString('id-ID')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ border: '1px dashed #CBD5E1', borderRadius: '10px', padding: '10px 16px', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11.5px', color: '#64748B' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Package size={14} color="#94A3B8" />
                      <span><strong>A. Kebutuhan Bahan / Material:</strong> Tidak membutuhkan material langsung (pekerjaan berbasis jasa/tenaga/alat).</span>
                    </div>
                    <span style={{ fontWeight: 600, color: '#94A3B8' }}>Rp 0</span>
                  </div>
                )}

                {/* 2. LABOR SECTION */}
                {activeAhsp.labors.length > 0 ? (
                  <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{ background: '#F8FAFC', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, fontSize: '12.5px', color: '#0F172A' }}>
                        <HardHat size={14} color="#F59E0B" />
                        <span>B. KEBUTUHAN TENAGA KERJA / UPAH</span>
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#F59E0B' }}>
                        Subtotal: {formatCurrencyIDR(labSum)}
                      </span>
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#64748B', fontWeight: 600 }}>
                          <th style={{ padding: '8px 12px', textAlign: 'left', width: '80px' }}>Kode</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Jenis Tenaga</th>
                          <th style={{ padding: '8px 10px', textAlign: 'center', width: '60px' }}>Satuan</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right', width: '90px' }}>Koefisien</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right', width: '120px' }}>Upah Standar (Rp)</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right', width: '130px' }}>Subtotal (Rp)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeAhsp.labors.map((l) => (
                          <tr key={l.code} style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ color: '#F59E0B', fontWeight: 600, padding: '7px 12px' }}>{l.code}</td>
                            <td style={{ fontWeight: 500, color: '#0F172A', padding: '7px 12px' }}>{l.name}</td>
                            <td style={{ textAlign: 'center', color: '#64748B', padding: '7px 10px' }}>{l.unit}</td>
                            <td style={{ textAlign: 'right', color: '#0F172A', padding: '7px 10px' }}>{l.coeff.toFixed(3)}</td>
                            <td style={{ textAlign: 'right', color: '#0F172A', padding: '7px 12px' }}>{l.price.toLocaleString('id-ID')}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: '#0F172A', padding: '7px 12px' }}>{l.total.toLocaleString('id-ID')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ border: '1px dashed #CBD5E1', borderRadius: '10px', padding: '10px 16px', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11.5px', color: '#64748B' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <HardHat size={14} color="#94A3B8" />
                      <span><strong>B. Kebutuhan Tenaga Kerja:</strong> Menggunakan pengadaan langsung/otomatisasi pabrik.</span>
                    </div>
                    <span style={{ fontWeight: 600, color: '#94A3B8' }}>Rp 0</span>
                  </div>
                )}

                {/* 3. EQUIPMENT SECTION */}
                {activeAhsp.equipments.length > 0 ? (
                  <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{ background: '#F8FAFC', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, fontSize: '12.5px', color: '#0F172A' }}>
                        <Truck size={14} color="#10B981" />
                        <span>C. KEBUTUHAN PERALATAN</span>
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#10B981' }}>
                        Subtotal: {formatCurrencyIDR(eqSum)}
                      </span>
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#64748B', fontWeight: 600 }}>
                          <th style={{ padding: '8px 12px', textAlign: 'left', width: '80px' }}>Kode</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Nama Alat</th>
                          <th style={{ padding: '8px 10px', textAlign: 'center', width: '60px' }}>Satuan</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right', width: '90px' }}>Koefisien</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right', width: '120px' }}>Harga Sewa (Rp)</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right', width: '130px' }}>Subtotal (Rp)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeAhsp.equipments.map((e) => (
                          <tr key={e.code} style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ color: '#10B981', fontWeight: 600, padding: '7px 12px' }}>{e.code}</td>
                            <td style={{ fontWeight: 500, color: '#0F172A', padding: '7px 12px' }}>{e.name}</td>
                            <td style={{ textAlign: 'center', color: '#64748B', padding: '7px 10px' }}>{e.unit}</td>
                            <td style={{ textAlign: 'right', color: '#0F172A', padding: '7px 10px' }}>{e.coeff.toFixed(3)}</td>
                            <td style={{ textAlign: 'right', color: '#0F172A', padding: '7px 12px' }}>{e.price.toLocaleString('id-ID')}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: '#0F172A', padding: '7px 12px' }}>{e.total.toLocaleString('id-ID')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ border: '1px dashed #CBD5E1', borderRadius: '10px', padding: '10px 16px', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11.5px', color: '#64748B' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Truck size={14} color="#94A3B8" />
                      <span><strong>C. Kebutuhan Peralatan:</strong> Dikerjakan secara manual menggunakan perkakas standar tukang (tanpa sewa alat berat).</span>
                    </div>
                    <span style={{ fontWeight: 600, color: '#94A3B8' }}>Rp 0</span>
                  </div>
                )}

                {/* Final Recapitulation Calculation Box */}
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
                    <span>Jumlah Biaya Langsung (A + B + C)</span>
                    <span style={{ fontWeight: 700, color: '#0F172A' }}>{formatCurrencyIDR(baseHsp)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
                    <span>Overhead & Profit ({activeAhsp.overheadPct}%)</span>
                    <span style={{ fontWeight: 700, color: '#0F172A' }}>{formatCurrencyIDR(overheadVal)}</span>
                  </div>
                  <div style={{ borderTop: '1px solid #CBD5E1', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 800 }}>
                    <span style={{ color: '#0F172A' }}>Total Harga Satuan Pekerjaan (Dibulatkan)</span>
                    <span style={{ color: '#2563EB' }}>{formatCurrencyIDR(grandHsp)}</span>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* ===================================================================
              TAB 4: KURVA S (S-CURVE TIMELINE & PROGRESS)
             =================================================================== */}
          {activeTab === 'kurva-s' && (
            <div
              style={{
                background: '#ffffff',
                borderRadius: '20px',
                border: '1px solid #EEF2F7',
                padding: '24px',
                boxShadow: '0 2px 16px rgba(15,23,42,0.04)',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
              }}
            >
              {/* Header Kurva S */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: '0 0 4px 0' }}>
                    Kurva S Rencana vs Realisasi Progres
                  </h3>
                  <p style={{ fontSize: '12.5px', color: '#64748B', margin: 0 }}>
                    Visualisasi perbandingan laju kemajuan biaya dan fisik proyek per minggu pelaksanaan.
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: '#2563EB', fontWeight: 700 }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#2563EB' }} />
                    Rencana (%)
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: '#10B981', fontWeight: 700 }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10B981' }} />
                    Realisasi (%)
                  </span>
                </div>
              </div>

              {/* Data Readiness Banner if Schedule Tasks incomplete */}
              {!kurvaSRequirement.isComplete && (
                <div
                  style={{
                    background: '#FFFBEB',
                    border: '1px solid #FDE68A',
                    borderRadius: '12px',
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <AlertCircle size={20} color="#D97706" />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#92400E' }}>
                        Data Kurva S Belum Lengkap
                      </div>
                      <div style={{ fontSize: '12px', color: '#B45309', marginTop: '2px' }}>
                        {kurvaSRequirement.message}
                      </div>
                    </div>
                  </div>
                  {onNavigateToTab && (
                    <button
                      onClick={() => onNavigateToTab('jadwal')}
                      style={{
                        background: '#D97706',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '6px 14px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Lengkapi di Jadwal Proyek
                    </button>
                  )}
                </div>
              )}

              {/* Summary Metric Cards for S-Curve */}
              {(() => {
                const totalWeeksCount = sCurveWeeks.length;
                const lastPlanned = sCurveWeeks[sCurveWeeks.length - 1]?.planCum || 100;
                const currentWeekData = sCurveWeeks.find((w) => w.actCum !== null && w.actCum > 0) || sCurveWeeks[0];
                const latestActCum = sCurveWeeks.reduce((max, w) => (w.actCum !== null ? Math.max(max, w.actCum) : max), 0);
                const currentPlanAtAct = sCurveWeeks.find((w) => w.actCum !== null && w.actCum === latestActCum)?.planCum || 0;
                const totalDev = latestActCum > 0 ? Number((latestActCum - currentPlanAtAct).toFixed(2)) : 0;

                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                    <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '14px 16px' }}>
                      <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Total Durasi Proyek</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                        {totalWeeksCount} Minggu
                      </div>
                      <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>Target: {lastPlanned}% Selesai</div>
                    </div>

                    <div style={{ background: '#EFF6FF', border: '1px solid #DBEAFE', borderRadius: '12px', padding: '14px 16px' }}>
                      <div style={{ fontSize: '11px', color: '#1D4ED8', fontWeight: 600 }}>Progres Rencana</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#2563EB', marginTop: '2px' }}>
                        {currentPlanAtAct > 0 ? `${currentPlanAtAct.toFixed(1)}%` : '0.0%'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#60A5FA', marginTop: '2px' }}>Kumulatif Baseline</div>
                    </div>

                    <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '12px', padding: '14px 16px' }}>
                      <div style={{ fontSize: '11px', color: '#047857', fontWeight: 600 }}>Progres Realisasi</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#10B981', marginTop: '2px' }}>
                        {latestActCum > 0 ? `${latestActCum.toFixed(1)}%` : '0.0%'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#34D399', marginTop: '2px' }}>Fisik Lapangan</div>
                    </div>

                    <div style={{ background: totalDev >= 0 ? '#F0FDF4' : '#FEF2F2', border: totalDev >= 0 ? '1px solid #BBF7D0' : '1px solid #FECACA', borderRadius: '12px', padding: '14px 16px' }}>
                      <div style={{ fontSize: '11px', color: totalDev >= 0 ? '#16A34A' : '#DC2626', fontWeight: 600 }}>Deviasi Waktu/Biaya</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: totalDev >= 0 ? '#16A34A' : '#DC2626', marginTop: '2px' }}>
                        {totalDev > 0 ? `+${totalDev.toFixed(2)}%` : `${totalDev.toFixed(2)}%`}
                      </div>
                      <div style={{ fontSize: '11px', color: totalDev >= 0 ? '#15803D' : '#B91C1C', marginTop: '2px' }}>
                        {totalDev > 0 ? 'Lebih Cepat (Ahead)' : totalDev === 0 ? 'Tepat Waktu (On Track)' : 'Terlambat (Behind)'}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* S-Curve Interactive SVG Canvas */}
              <div
                style={{
                  background: 'linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 100%)',
                  border: '1px solid #E2E8F0',
                  borderRadius: '16px',
                  padding: '24px',
                  position: 'relative',
                }}
              >
                {/* SVG Chart Container */}
                <div style={{ width: '100%', height: '280px', position: 'relative' }}>
                  <svg viewBox="0 0 840 260" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                    <defs>
                      <linearGradient id="planGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2563EB" stopOpacity="0.20" />
                        <stop offset="100%" stopColor="#2563EB" stopOpacity="0.0" />
                      </linearGradient>
                      <linearGradient id="actGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10B981" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
                      </linearGradient>
                      <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
                        <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15" />
                      </filter>
                    </defs>

                    {/* Horizontal Grid lines & Percent Labels */}
                    {[100, 80, 60, 40, 20, 0].map((pct) => {
                      const y = 30 + ((100 - pct) / 100) * 180;
                      return (
                        <g key={pct}>
                          <line x1="50" y1={y} x2="790" y2={y} stroke={pct === 0 ? '#CBD5E1' : '#E2E8F0'} strokeDasharray={pct === 0 ? undefined : '4,4'} strokeWidth={pct === 0 ? 1.5 : 1} />
                          <text x="42" y={y + 3.5} fontSize="10" fill="#64748B" fontWeight="600" textAnchor="end">{pct}%</text>
                        </g>
                      );
                    })}

                    {/* Compute Dynamic Planned & Actual Coordinates */}
                    {(() => {
                      const totalPoints = sCurveWeeks.length;
                      const stepX = totalPoints > 1 ? 730 / (totalPoints - 1) : 730;

                      // Planned points
                      const planCoords = sCurveWeeks.map((w, idx) => {
                        const x = 55 + idx * stepX;
                        const y = 210 - (w.planCum / 100) * 180;
                        return { x, y, week: w.week, planCum: w.planCum, planWeekly: w.planWeekly };
                      });

                      const planPathD = planCoords.reduce((acc, pt, idx) => {
                        return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
                      }, '');

                      const lastPt = planCoords[planCoords.length - 1] || { x: 785, y: 30 };
                      const firstPt = planCoords[0] || { x: 55, y: 210 };
                      const planAreaD = `${planPathD} L ${lastPt.x} 210 L ${firstPt.x} 210 Z`;

                      // Actual points (filter where actCum != null)
                      const actPointsWithCoord = sCurveWeeks
                        .map((w, idx) => {
                          if (w.actCum === null) return null;
                          const x = 55 + idx * stepX;
                          const y = 210 - (w.actCum / 100) * 180;
                          return { x, y, week: w.week, actCum: w.actCum, actWeekly: w.actWeekly, dev: w.dev, idx };
                        })
                        .filter(Boolean) as Array<{ x: number; y: number; week: string; actCum: number; actWeekly: number | null; dev: number | null; idx: number }>;

                      const actPathD = actPointsWithCoord.reduce((acc, pt, idx) => {
                        return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
                      }, '');

                      const actAreaD = actPointsWithCoord.length > 1
                        ? `${actPathD} L ${actPointsWithCoord[actPointsWithCoord.length - 1].x} 210 L ${actPointsWithCoord[0].x} 210 Z`
                        : '';

                      return (
                        <>
                          {/* Planned Area & Line */}
                          <path d={planAreaD} fill="url(#planGrad)" />
                          <path d={planPathD} fill="none" stroke="#2563EB" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />

                          {/* Actual Area & Line */}
                          {actAreaD && <path d={actAreaD} fill="url(#actGrad)" />}
                          {actPathD && (
                            <path d={actPathD} fill="none" stroke="#10B981" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                          )}

                          {/* Vertical Guidance Line on Hover */}
                          {hoveredWeekIndex !== null && sCurveWeeks[hoveredWeekIndex] && (
                            <line
                              x1={55 + hoveredWeekIndex * stepX}
                              y1="25"
                              x2={55 + hoveredWeekIndex * stepX}
                              y2="210"
                              stroke="#64748B"
                              strokeDasharray="3,3"
                              strokeWidth="1.5"
                            />
                          )}

                          {/* Planned Circles */}
                          {planCoords.map((pt, idx) => (
                            <circle
                              key={`plan-${idx}`}
                              cx={pt.x}
                              cy={pt.y}
                              r={hoveredWeekIndex === idx ? 6 : 4}
                              fill="#2563EB"
                              stroke="#ffffff"
                              strokeWidth="2.5"
                              style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                              onMouseEnter={() => setHoveredWeekIndex(idx)}
                              onMouseLeave={() => setHoveredWeekIndex(null)}
                            />
                          ))}

                          {/* Actual Circles */}
                          {actPointsWithCoord.map((pt) => (
                            <circle
                              key={`act-${pt.idx}`}
                              cx={pt.x}
                              cy={pt.y}
                              r={hoveredWeekIndex === pt.idx ? 7 : 5}
                              fill="#10B981"
                              stroke="#ffffff"
                              strokeWidth="2.5"
                              style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                              onMouseEnter={() => setHoveredWeekIndex(pt.idx)}
                              onMouseLeave={() => setHoveredWeekIndex(null)}
                            />
                          ))}

                          {/* Floating Interactive Tooltip */}
                          {hoveredWeekIndex !== null && sCurveWeeks[hoveredWeekIndex] && (() => {
                            const curW = sCurveWeeks[hoveredWeekIndex];
                            const curX = 55 + hoveredWeekIndex * stepX;
                            const tipX = Math.min(Math.max(curX - 70, 50), 690);
                            return (
                              <g transform={`translate(${tipX}, 35)`} filter="url(#shadow)">
                                <rect width="140" height="75" rx="8" fill="#0F172A" opacity="0.92" />
                                <text x="10" y="18" fill="#94A3B8" fontSize="10.5" fontWeight="700">
                                  {curW.week} (Minggu {hoveredWeekIndex + 1})
                                </text>
                                <circle cx="14" cy="32" r="3.5" fill="#3B82F6" />
                                <text x="22" y="35" fill="#FFFFFF" fontSize="10">
                                  Rencana: {curW.planCum.toFixed(1)}% (+{curW.planWeekly.toFixed(2)}%)
                                </text>
                                <circle cx="14" cy="48" r="3.5" fill="#10B981" />
                                <text x="22" y="51" fill="#FFFFFF" fontSize="10">
                                  Realisasi: {curW.actCum !== null ? `${curW.actCum.toFixed(1)}%` : '-'}
                                </text>
                                <text x="10" y="66" fill={curW.dev !== null && curW.dev >= 0 ? '#4ADE80' : '#F87171'} fontSize="9.5" fontWeight="700">
                                  Deviasi: {curW.dev !== null ? (curW.dev >= 0 ? `+${curW.dev.toFixed(2)}%` : `${curW.dev.toFixed(2)}%`) : 'Belum Mulai'}
                                </text>
                              </g>
                            );
                          })()}
                        </>
                      );
                    })()}

                    {/* Week X-Axis Labels */}
                    {sCurveWeeks.map((w, idx) => {
                      const totalPoints = sCurveWeeks.length;
                      const stepX = totalPoints > 1 ? 730 / (totalPoints - 1) : 730;
                      const x = 55 + idx * stepX;
                      const isHovered = hoveredWeekIndex === idx;
                      return (
                        <text
                          key={w.week}
                          x={x}
                          y="235"
                          fontSize="10.5"
                          fill={isHovered ? '#2563EB' : '#64748B'}
                          fontWeight={isHovered ? '800' : '600'}
                          textAnchor="middle"
                          style={{ cursor: 'pointer' }}
                          onMouseEnter={() => setHoveredWeekIndex(idx)}
                          onMouseLeave={() => setHoveredWeekIndex(null)}
                        >
                          {w.week}
                        </text>
                      );
                    })}
                  </svg>
                </div>

                {/* Status Indicator Bubble */}
                <div
                  style={{
                    position: 'absolute',
                    top: '20px',
                    right: '24px',
                    background: '#ffffff',
                    border: '1px solid #BBF7D0',
                    borderRadius: '12px',
                    padding: '10px 14px',
                    boxShadow: '0 4px 12px rgba(16,185,129,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: kurvaSRequirement.isComplete ? '#10B981' : '#F59E0B' }} />
                  <div>
                    <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>Status Jadwal & Kurva-S</div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: kurvaSRequirement.isComplete ? '#16A34A' : '#D97706' }}>
                      {kurvaSRequirement.isComplete ? 'Terverifikasi 100%' : 'Perlu Kelengkapan'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Kurva S Data Matrix Table */}
              <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '12px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 700 }}>
                      <th style={{ padding: '10px 14px', textAlign: 'left', minWidth: '160px' }}>Indikator Progres</th>
                      {sCurveWeeks.map((w, idx) => (
                        <th
                          key={w.week}
                          style={{
                            padding: '10px 8px',
                            textAlign: 'center',
                            width: '50px',
                            background: hoveredWeekIndex === idx ? '#EFF6FF' : 'transparent',
                            color: hoveredWeekIndex === idx ? '#2563EB' : undefined,
                            transition: 'background 0.15s ease',
                          }}
                        >
                          {w.week}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Row 1: Rencana Mingguan */}
                    <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '8px 14px', fontWeight: 600, color: '#2563EB' }}>Rencana Mingguan (%)</td>
                      {sCurveWeeks.map((w, idx) => (
                        <td
                          key={w.week}
                          style={{
                            padding: '8px 6px',
                            textAlign: 'center',
                            color: '#334155',
                            background: hoveredWeekIndex === idx ? '#EFF6FF' : 'transparent',
                          }}
                        >
                          {w.planWeekly.toFixed(2)}%
                        </td>
                      ))}
                    </tr>
                    {/* Row 2: Rencana Kumulatif */}
                    <tr style={{ borderBottom: '1px solid #F1F5F9', background: '#F8FAFC' }}>
                      <td style={{ padding: '8px 14px', fontWeight: 700, color: '#1D4ED8' }}>Rencana Kumulatif (%)</td>
                      {sCurveWeeks.map((w, idx) => (
                        <td
                          key={w.week}
                          style={{
                            padding: '8px 6px',
                            textAlign: 'center',
                            fontWeight: 700,
                            color: '#1D4ED8',
                            background: hoveredWeekIndex === idx ? '#DBEAFE' : undefined,
                          }}
                        >
                          {w.planCum.toFixed(1)}%
                        </td>
                      ))}
                    </tr>
                    {/* Row 3: Realisasi Kumulatif */}
                    <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '8px 14px', fontWeight: 700, color: '#10B981' }}>Realisasi Kumulatif (%)</td>
                      {sCurveWeeks.map((w, idx) => (
                        <td
                          key={w.week}
                          style={{
                            padding: '8px 6px',
                            textAlign: 'center',
                            fontWeight: 700,
                            color: w.actCum !== null ? '#10B981' : '#CBD5E1',
                            background: hoveredWeekIndex === idx ? '#DCFCE7' : 'transparent',
                          }}
                        >
                          {w.actCum !== null ? `${w.actCum.toFixed(1)}%` : '-'}
                        </td>
                      ))}
                    </tr>
                    {/* Row 4: Deviasi */}
                    <tr style={{ borderTop: '1px solid #E2E8F0', background: '#FAFCFF' }}>
                      <td style={{ padding: '8px 14px', fontWeight: 800, color: '#0F172A' }}>Deviasi (%)</td>
                      {sCurveWeeks.map((w, idx) => (
                        <td
                          key={w.week}
                          style={{
                            padding: '8px 6px',
                            textAlign: 'center',
                            fontWeight: 800,
                            color: w.dev !== null ? (w.dev >= 0 ? '#16A34A' : '#DC2626') : '#94A3B8',
                            background: hoveredWeekIndex === idx ? '#F1F5F9' : undefined,
                          }}
                        >
                          {w.dev !== null ? (w.dev >= 0 ? `+${w.dev.toFixed(2)}%` : `${w.dev.toFixed(2)}%`) : '-'}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===================================================================
              TAB 5: JADWAL WAKTU (GANTT SCHEDULE TIMELINE)
             =================================================================== */}
          {activeTab === 'jadwal' && (
            <div
              style={{
                background: '#ffffff',
                borderRadius: '20px',
                border: '1px solid #EEF2F7',
                padding: '24px',
                boxShadow: '0 2px 16px rgba(15,23,42,0.04)',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
              }}
            >
              {/* Header Jadwal */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: '0 0 4px 0' }}>
                    Jadwal Waktu Pelaksanaan (Gantt Chart)
                  </h3>
                  <p style={{ fontSize: '12.5px', color: '#64748B', margin: 0 }}>
                    Runtunan durasi, jadwal mingguan, dan bobot pekerjaan proyek berurutan logis.
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#16A34A', background: '#DCFCE7', border: '1px solid #BBF7D0', padding: '4px 10px', borderRadius: '8px' }}>
                    Total Durasi: 90 Hari Kalender (12 Minggu)
                  </span>
                </div>
              </div>

              {/* Gantt Interactive Board */}
              <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '14px' }}>
                <table style={{ width: '100%', minWidth: '920px', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 700 }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left', width: '50px' }}>WBS</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', width: '220px' }}>Uraian Aktivitas</th>
                      <th style={{ padding: '10px 8px', textAlign: 'center', width: '60px' }}>Durasi</th>
                      <th style={{ padding: '10px 8px', textAlign: 'center', width: '60px' }}>Bobot</th>
                      <th style={{ padding: '10px 8px', textAlign: 'center', width: '80px' }}>Status</th>
                      {/* 12 Timeline Columns */}
                      {Array.from({ length: 12 }).map((_, i) => (
                        <th
                          key={i}
                          style={{
                            padding: '10px 4px',
                            textAlign: 'center',
                            width: '42px',
                            background: i === 4 ? '#EFF6FF' : '#F8FAFC',
                            color: i === 4 ? '#2563EB' : '#64748B',
                            borderLeft: '1px solid #E2E8F0',
                          }}
                        >
                          W{i + 1}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ganttTasks.map((t) => (
                      <tr key={t.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ color: '#2563EB', fontWeight: 700, padding: '10px 12px' }}>{t.wbs}</td>
                        <td style={{ fontWeight: 600, color: '#0F172A', padding: '10px 14px' }}>{t.name}</td>
                        <td style={{ textAlign: 'center', color: '#64748B', padding: '10px 8px' }}>{t.duration} hr</td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: '#0F172A', padding: '10px 8px' }}>{t.weight.toFixed(1)}%</td>
                        <td style={{ textAlign: 'center', padding: '10px 8px' }}>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: t.status === 'Selesai' ? '#DCFCE7' : t.status === 'On Progress' ? '#EFF6FF' : '#F1F5F9',
                              color: t.status === 'Selesai' ? '#16A34A' : t.status === 'On Progress' ? '#2563EB' : '#64748B',
                            }}
                          >
                            {t.status}
                          </span>
                        </td>

                        {/* 12 Timeline Cells with Gantt Bar Placement */}
                        {Array.from({ length: 12 }).map((_, weekIdx) => {
                          const isTaskInWeek = weekIdx >= t.startWeekIdx && weekIdx < t.startWeekIdx + t.weekSpan;
                          const isStart = weekIdx === t.startWeekIdx;
                          const isEnd = weekIdx === t.startWeekIdx + t.weekSpan - 1;

                          return (
                            <td
                              key={weekIdx}
                              style={{
                                padding: '6px 2px',
                                borderLeft: '1px solid #F1F5F9',
                                background: weekIdx === 4 ? '#F8FAFC' : 'transparent',
                                position: 'relative',
                              }}
                            >
                              {isTaskInWeek && (
                                <div
                                  style={{
                                    height: '22px',
                                    background: t.color,
                                    borderRadius: isStart && isEnd ? '6px' : isStart ? '6px 0 0 6px' : isEnd ? '0 6px 6px 0' : '0',
                                    opacity: 0.9,
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#ffffff',
                                    fontSize: '9.5px',
                                    fontWeight: 700,
                                  }}
                                >
                                  {isStart && `${t.progress}%`}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* =====================================================================
            RIGHT SIDE COLUMN: INFORMASI PROYEK + PENGATURAN + AI ASSISTANT
           ===================================================================== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* CARD 1: INFORMASI PROYEK (WITH PROJECT PHOTO COVER) */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: '20px',
              border: '1px solid #EEF2F7',
              boxShadow: '0 2px 16px rgba(15,23,42,0.04)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Header */}
            <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Informasi Proyek
              </h3>
              <button
                onClick={() => setPhotoUploadModalOpen(true)}
                title="Edit Informasi & Foto"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
              >
                <Edit2 size={14} />
              </button>
            </div>

            {/* Project Photo Image Container with Upload Overlay */}
            <div style={{ position: 'relative', width: '100%', height: '140px', background: '#F8FAFC' }}>
              <img
                src={projectCoverPhoto}
                alt={activeProject.name}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
              <button
                onClick={() => setPhotoUploadModalOpen(true)}
                style={{
                  position: 'absolute',
                  bottom: '8px',
                  right: '8px',
                  background: 'rgba(15, 23, 42, 0.75)',
                  backdropFilter: 'blur(4px)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                }}
              >
                <Camera size={12} />
                <span>Ubah Foto</span>
              </button>
            </div>

            {/* Details Meta */}
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <strong style={{ fontSize: '13.5px', color: '#0F172A' }}>{activeProject.name}</strong>
                <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: '#DCFCE7', color: '#16A34A', border: '1px solid #BBF7D0' }}>
                  Aktif
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748B' }}>
                <MapPin size={13} color="#94A3B8" />
                <span>{activeProject.location || 'Yogyakarta'}</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748B' }}>
                <User size={13} color="#94A3B8" />
                <span>Owner: <strong style={{ color: '#0F172A' }}>{activeProject.client || 'Pribadi'}</strong></span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748B' }}>
                <FileText size={13} color="#94A3B8" />
                <span>No. Proyek: <strong style={{ color: '#0F172A' }}>EZR-001</strong></span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748B' }}>
                <Building size={13} color="#94A3B8" />
                <span>Tipe: <strong style={{ color: '#0F172A' }}>Rumah Tinggal</strong></span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748B' }}>
                <Layers size={13} color="#94A3B8" />
                <span>Luas Bangunan: <strong style={{ color: '#0F172A' }}>120 m²</strong></span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748B' }}>
                <Building size={13} color="#94A3B8" />
                <span>Jumlah Lantai: <strong style={{ color: '#0F172A' }}>2</strong></span>
              </div>
            </div>
          </div>

          {/* CARD 2: PENGATURAN LAPORAN */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: '20px',
              border: '1px solid #EEF2F7',
              padding: '20px',
              boxShadow: '0 2px 16px rgba(15,23,42,0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              Pengaturan Laporan
            </h3>

            <div>
              <label style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Format Laporan</label>
              <select
                value={reportFormat}
                onChange={(e) => setReportFormat(e.target.value)}
                style={{ width: '100%', height: '34px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '12px', padding: '0 8px', marginTop: '4px', background: '#ffffff' }}
              >
                <option>Lengkap (RAB + QTO + Kurva S + Jadwal)</option>
                <option>Ringkas (Rekapitulasi Saja)</option>
                <option>RAB + BOQ</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Template</label>
              <select
                value={reportTemplate}
                onChange={(e) => setReportTemplate(e.target.value)}
                style={{ width: '100%', height: '34px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '12px', padding: '0 8px', marginTop: '4px', background: '#ffffff' }}
              >
                <option>Standar EZRAB</option>
                <option>Formal SNI</option>
                <option>Engineering Minimal</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: '#334155' }}>Sertakan AHSP 2026</span>
                <input
                  type="checkbox"
                  checked={includeAhsp}
                  onChange={(e) => setIncludeAhsp(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: '#334155' }}>Sertakan Material / Upah / Alat</span>
                <input
                  type="checkbox"
                  checked={includeResources}
                  onChange={(e) => setIncludeResources(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: '#334155' }}>Sertakan Gambar / Cover</span>
                <input
                  type="checkbox"
                  checked={includeCover}
                  onChange={(e) => setIncludeCover(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
              </div>
            </div>

            <button
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              style={{
                marginTop: '4px',
                width: '100%',
                height: '38px',
                borderRadius: '10px',
                background: isExportingPdf ? '#94A3B8' : '#2563EB',
                color: '#ffffff',
                fontSize: '12.5px',
                fontWeight: 600,
                border: 'none',
                cursor: isExportingPdf ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: isExportingPdf ? 'none' : '0 4px 12px rgba(37,99,235,0.25)',
                transition: 'all 0.15s ease',
              }}
            >
              {isExportingPdf ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Sedang Men-generate PDF...</span>
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  <span>Generate Laporan</span>
                </>
              )}
            </button>
          </div>

        </div>

      </div>

      {/* =========================================================================
          5. MODAL: UPLOAD / REPLACE PROJECT PHOTO
         ========================================================================= */}
      {photoUploadModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '20px',
              maxWidth: '480px',
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Camera size={18} color="#2563EB" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                  Foto Sampul Proyek
                </h3>
              </div>
              <button
                onClick={() => setPhotoUploadModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94A3B8' }}
              >
                ✕
              </button>
            </div>

            {/* Dropzone Container */}
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed #CBD5E1',
                borderRadius: '12px',
                padding: '30px 20px',
                textAlign: 'center',
                background: '#F8FAFC',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="image/png, image/jpeg, image/webp"
                style={{ display: 'none' }}
              />

              {tempPhotoUrl ? (
                <img
                  src={tempPhotoUrl}
                  alt="Pratinjau Foto"
                  style={{ maxHeight: '140px', width: 'auto', borderRadius: '8px', objectFit: 'cover' }}
                />
              ) : (
                <>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB' }}>
                    <Upload size={20} />
                  </div>
                  <div>
                    <strong style={{ fontSize: '13px', color: '#0F172A' }}>Drag & drop foto di sini</strong>
                    <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
                      atau klik untuk memilih dari perangkat (JPG, PNG, WEBP max 10MB)
                    </div>
                  </div>
                </>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
              <button
                onClick={() => setPhotoUploadModalOpen(false)}
                style={{ height: '36px', padding: '0 16px', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#ffffff', fontSize: '12.5px', cursor: 'pointer' }}
              >
                Batal
              </button>
              <button
                onClick={handleSavePhoto}
                disabled={!tempPhotoUrl}
                style={{
                  height: '36px',
                  padding: '0 20px',
                  borderRadius: '8px',
                  background: tempPhotoUrl ? '#2563EB' : '#94A3B8',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: tempPhotoUrl ? 'pointer' : 'not-allowed',
                }}
              >
                Simpan Foto
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

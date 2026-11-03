import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Layers,
  ChevronRight,
  ChevronDown,
  Info,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  ShieldCheck,
  Building2,
  Calendar,
  CalendarDays,
  DollarSign,
  Download,
  ClipboardList,
  DraftingCompass,
  Wallet,
} from 'lucide-react';
import type { Project } from '../../types';
import {
  DOCUMENT_REGISTRY,
  getDocumentDefinition,
  TENDER_PACKAGE_PRESETS,
  type TenderPresetKey,
} from '../../document-engine/registry';
import { LocalDocumentRepository } from '../../document-engine/repository';
import {
  evaluateDependency,
  getSourceStatus,
  type SourceStatus,
} from '../../document-engine/requirementEngine';
import { ConsistencyEngine } from '../../document-engine/consistencyEngine';
import { formatRupiah } from '../../document-engine/templateEngine';
import { computeSourceHash } from '../../document-engine/sourceChangeDetector';
import { brandingClient } from '../../services/brandingClient';
import {
  EMPTY_MASTER_DATA,
  type ProjectMasterData,
  type DocumentDefinition,
  type DocumentRecord,
  type DocumentCategory,
} from '../../document-engine/types';

export interface DocumentPackageWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProject: Project | null;
  rabItems?: any[];
  scheduleTasks?: any[];
  kurvaSData?: any[];
  onCompletePackage?: (createdDocIds: string[]) => void;
  onNavigateToTab?: (tab: string) => void;
}

type WizardStep = 1 | 2 | 3 | 4 | 5;

const CATEGORY_META: Record<string, { label: string; icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>; color: string; bg: string }> = {
  ADMINISTRATION: { label: 'Administrasi', icon: ClipboardList, color: 'var(--ez-color-primary)', bg: 'var(--ez-hue-blue-bg)' },
  TECHNICAL: { label: 'Teknis', icon: DraftingCompass, color: '#0D9488', bg: '#F0FDFA' },
  COMMERCIAL: { label: 'Biaya', icon: Wallet, color: 'var(--ez-hue-green-text-bright)', bg: 'var(--ez-hue-green-bg)' },
  COST: { label: 'Biaya', icon: Wallet, color: 'var(--ez-hue-green-text-bright)', bg: 'var(--ez-hue-green-bg)' },
  SCHEDULE: { label: 'Jadwal', icon: CalendarDays, color: 'var(--ez-hue-amber-text-deep)', bg: 'var(--ez-hue-amber-bg)' },
  HSE: { label: 'K3 / HSE', icon: ShieldCheck, color: 'var(--ez-hue-rose-text)', bg: 'var(--ez-hue-rose-bg)' },
};

export const DocumentPackageWizardModal: React.FC<DocumentPackageWizardModalProps> = ({
  isOpen,
  onClose,
  currentProject,
  rabItems = [],
  scheduleTasks = [],
  kurvaSData = [],
  onCompletePackage,
  onNavigateToTab,
}) => {
  const [step, setStep] = useState<WizardStep>(1);
  const [activePreset, setActivePreset] = useState<TenderPresetKey | 'CUSTOM'>('ALL');
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>(() => [...TENDER_PACKAGE_PRESETS.ALL]);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  // User input overrides for Step 3
  // Audit F-DP-07: contoh spesifik tidak lagi menjadi NILAI awal formulir
  // (bisa ikut tercetak bila user tidak menyadari). Contoh pindah ke
  // placeholder input — petunjuk visual, bukan data.
  const [letterNumber, setLetterNumber] = useState<string>('');
  const [letterDate, setLetterDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [recipientName, setRecipientName] = useState<string>('');
  const [recipientOrg, setRecipientOrg] = useState<string>('');
  const [signatoryName, setSignatoryName] = useState<string>('');
  const [signatoryPosition, setSignatoryPosition] = useState<string>('');
  // Company identity: loaded from real workspace branding. Never hardcoded demo.
  const [companyName, setCompanyName] = useState<string>('');
  const [companyAddress, setCompanyAddress] = useState<string>('');
  const [companyPhone, setCompanyPhone] = useState<string>('');
  const [companyEmail, setCompanyEmail] = useState<string>('');
  const [brandingLoading, setBrandingLoading] = useState<boolean>(false);
  const [identityError, setIdentityError] = useState<string | null>(null);

  const projectId = currentProject?.id || currentProject?.projectNumber || 'default';
  const repo = useMemo(() => new LocalDocumentRepository(projectId), [projectId]);

  // Reset or initialize on open — incl. real company identity from branding.
  // The branding default placeholder ('PT EZRAB KONSTRUKSI DIGITAL') is treated
  // as "not available": the field stays empty and required instead of using it.
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setActivePreset('ALL');
      setSelectedDocIds([...TENDER_PACKAGE_PRESETS.ALL]);
      setIdentityError(null);
      setBrandingLoading(true);
      let cancelled = false;
      brandingClient.getBranding('ws-default-ezrab').then((b) => {
        if (cancelled) return;
        const raw = (b.companyName || '').trim();
        const valid = raw && raw !== 'PT EZRAB KONSTRUKSI DIGITAL' ? raw : '';
        setCompanyName(valid);
        // Alamat/telepon/email perusahaan juga dari branding asli (audit
        // F-DP-04: sebelumnya alamat Jl. Sudirman + telepon + email karangan
        // tercetak ke dokumen resmi).
        setCompanyAddress((b as any).address || '');
        setCompanyPhone((b as any).phone || '');
        setCompanyEmail((b as any).email || '');
        setBrandingLoading(false);
      }).catch(() => {
        if (cancelled) return;
        // Fetch failed: no fictional fallback — user must fill the field.
        setCompanyName('');
        setCompanyAddress('');
        setCompanyPhone('');
        setCompanyEmail('');
        setBrandingLoading(false);
      });
      return () => { cancelled = true; };
    }
  }, [isOpen]);

  // Escape closes the wizard
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  // AUDIT FASE 2 (2026-11-03): draf wizard persisten per proyek. Tanpa ini,
  // klik "Lengkapi …" (menutup wizard & berpindah menu) menghapus seluruh
  // input sah yang sudah diketik pengguna. Draf dimuat setiap wizard dibuka,
  // disimpan setiap ada perubahan, dan dihapus setelah paket berhasil dibuat.
  const draftKey = projectId ? `ezrab:wizard-draft:${projectId}` : null;
  const draftLoadedRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (!isOpen || !draftKey) return;
    if (draftLoadedRef.current === draftKey) return;
    draftLoadedRef.current = draftKey;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (Array.isArray(d.selectedDocIds) && d.selectedDocIds.length > 0) {
        setSelectedDocIds(d.selectedDocIds.filter((x: unknown) => typeof x === 'string'));
        setActivePreset('CUSTOM');
      }
      if (typeof d.letterNumber === 'string') setLetterNumber(d.letterNumber);
      if (typeof d.letterDate === 'string' && d.letterDate) setLetterDate(d.letterDate);
      if (typeof d.recipientName === 'string') setRecipientName(d.recipientName);
      if (typeof d.recipientOrg === 'string') setRecipientOrg(d.recipientOrg);
      if (typeof d.signatoryName === 'string') setSignatoryName(d.signatoryName);
      if (typeof d.signatoryPosition === 'string') setSignatoryPosition(d.signatoryPosition);
    } catch {
      /* draf rusak diabaikan */
    }
  }, [isOpen, draftKey]);
  useEffect(() => {
    if (!isOpen || !draftKey) return;
    if (draftLoadedRef.current !== draftKey) return;
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({ selectedDocIds, letterNumber, letterDate, recipientName, recipientOrg, signatoryName, signatoryPosition })
      );
    } catch {
      /* abaikan */
    }
  }, [isOpen, draftKey, selectedDocIds, letterNumber, letterDate, recipientName, recipientOrg, signatoryName, signatoryPosition]);

  const masterData: ProjectMasterData = useMemo(() => {
    if (!currentProject) {
      return {
        ...EMPTY_MASTER_DATA,
        projectNumber: projectId,
      };
    }
    return {
      ...EMPTY_MASTER_DATA,
      projectName: currentProject.name || 'Proyek Tanpa Nama',
      projectNumber: projectId,
      // Audit F-DP-04 (2026-11-03): fallback karangan dihapus. Nilai yang
      // tidak ada di data proyek/branding dibiarkan KOSONG agar mekanisme
      // placeholder dokumen menandainya — bukan diisi nama orang, alamat,
      // durasi, atau nomor tender rekaan yang tercetak sebagai fakta.
      owner: currentProject.clientName || '',
      contractor: companyName,
      location: currentProject.location || '',
      contractValue: currentProject.totalRab || 0,
      duration: currentProject.startDate && currentProject.targetDate
        ? `${currentProject.startDate} s/d ${currentProject.targetDate}`
        : '',
      startDate: currentProject.startDate || '',
      endDate: currentProject.targetDate || '',
      tenderNumber: currentProject.projectNumber || '',
      projectType: currentProject.buildingType || '',
      tenderType: currentProject.contractType || '',
      director: signatoryName,
      projectManager: signatoryName,
      engineer: '',
      architect: '',
      hseOfficer: '',
      qs: '',
      companyName: companyName,
      companyAddress: companyAddress,
      companyPhone: companyPhone,
      companyEmail: companyEmail,
    };
  }, [currentProject, projectId, signatoryName, companyName, companyAddress, companyPhone, companyEmail]);

  // Calculate authoritative RAB total
  const calculatedRabTotal = useMemo(() => {
    if (rabItems && rabItems.length > 0) {
      const directSum = rabItems.reduce((acc, it) => {
        const lineTotal = it.total || it.amount || (it.price && it.volume ? it.price * it.volume : 0) || 0;
        return acc + lineTotal;
      }, 0);
      // AUDIT LINTAS MODUL (2026-11-03): nilai dokumen harus sama dengan
      // total proyek yang ditampilkan modul lain — grand total ringkasan
      // biaya (langsung + overhead + profit + pajak) — bukan jumlah langsung
      // item saja. Ringkasan hanya dipakai bila directCost-nya terbukti
      // berasal dari item-item ini; selain itu item adalah sumber kebenaran.
      const cs = currentProject?.costSummary;
      if (cs && cs.grandTotal > 0 && Math.abs((cs.directCost ?? 0) - directSum) <= 1) {
        return cs.grandTotal;
      }
      return directSum;
    }
    return typeof masterData.contractValue === 'number'
      ? masterData.contractValue
      : parseFloat(String(masterData.contractValue).replace(/[^0-9.-]+/g, '')) || 0;
  }, [rabItems, masterData.contractValue, currentProject]);

  // Evaluated Source Availability
  const sourceStatus: SourceStatus = useMemo(() => {
    return getSourceStatus({
      personnel: Boolean(masterData.projectManager || masterData.director),
      // Audit 2026-11-03: peralatan tidak punya sumber data yang terhubung
      // ke wizard ini — sebelumnya selalu dinyatakan siap ("Daftar alat
      // standar tersedia") tanpa data apa pun.
      equipment: false,
      jsa: true,
      rkk: true,
      ahsp: rabItems.some((it) => it.ahspCode),
      boq: rabItems.length > 0,
      rab: rabItems.length > 0,
      schedule: scheduleTasks.length > 0,
      curveS: kurvaSData.length > 0,
    });
  }, [masterData, rabItems, scheduleTasks, kurvaSData]);

  // Sumber wajib yang belum lengkap + tujuan routing untuk melengkapinya
  // (audit F-DP-03, 2026-11-03): peringatan menyebut data yang kurang dan
  // setiap tombol mengantar langsung ke tempat data itu diisi — menggantikan
  // satu tombol umum "Lengkapi Data Sekarang" yang selalu ke RAB dan handler
  // induknya tidak meneruskan navigasi sama sekali.
  const missingSources: Array<{ label: string; tab: string }> = [
    ...(!sourceStatus.rab ? [{ label: 'RAB & Harga', tab: 'rab-estimasi' }] : []),
    ...(!sourceStatus.schedule ? [{ label: 'Jadwal & Schedule', tab: 'jadwal' }] : []),
  ];

  // Presets handling
  const applyPreset = (presetKey: TenderPresetKey | 'CUSTOM') => {
    setActivePreset(presetKey);
    if (presetKey === 'CUSTOM') return;
    const targetIds = TENDER_PACKAGE_PRESETS[presetKey];
    if (targetIds) {
      setSelectedDocIds([...targetIds]);
    }
  };

  const toggleDocument = (docId: string) => {
    setActivePreset('CUSTOM');
    setSelectedDocIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    );
  };

  const toggleCategoryCollapse = (cat: string) => {
    setCollapsedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  // Group 18 documents by 5 canonical categories
  const groupedDocuments = useMemo(() => {
    const groups: Record<string, DocumentDefinition[]> = {
      ADMINISTRATION: [],
      TECHNICAL: [],
      COMMERCIAL: [],
      SCHEDULE: [],
      HSE: [],
    };

    DOCUMENT_REGISTRY.forEach((doc) => {
      // Normalize category for display: 'COST' -> 'COMMERCIAL'
      const cat = doc.category === 'COST' ? 'COMMERCIAL' : doc.category;
      if (groups[cat]) {
        groups[cat].push(doc);
      }
    });

    return groups;
  }, []);

  // Consistency Check for Step 4
  const consistencyReport = useMemo(() => {
    return ConsistencyEngine.verify({
      projectMaster: masterData,
      rabItems,
      scheduleTasks,
      activeDocumentIds: selectedDocIds,
    });
  }, [masterData, rabItems, scheduleTasks, selectedDocIds]);

  // Creation Action (Commitment)
  const [createdDocsCount, setCreatedDocsCount] = useState<number>(0);
  const handleGeneratePackage = () => {
    // Identity validation: never generate documents with missing or fictional identity.
    if (brandingLoading) return;
    const cleanCompany = companyName.trim();
    const cleanSignatory = signatoryName.trim();
    if (!cleanCompany || !cleanSignatory) {
      setIdentityError(
        !cleanCompany
          ? 'Nama perusahaan wajib diisi sebelum membuat dokumen.'
          : 'Nama penandatangan wajib diisi sebelum membuat dokumen.'
      );
      setStep(3);
      return;
    }
    setIdentityError(null);
    let count = 0;
    const initialHash = computeSourceHash({
      master: masterData,
      rabItems,
      scheduleTasks,
      kurvaSData,
    });

    selectedDocIds.forEach((docId) => {
      const def = getDocumentDefinition(docId);
      if (!def) return;

      const newRecord: DocumentRecord = {
        id: `${docId}-REV-00`,
        definitionId: docId,
        documentId: docId,
        projectId,
        status: 'DRAFT',
        data: {
          letterNumber,
          letterDate,
          recipientName,
          recipientOrg,
          signatoryName,
          signatoryPosition,
          contractValue: calculatedRabTotal,
        },
        sourceData: {
          project: true,
          rab: sourceStatus.rab,
          schedule: sourceStatus.schedule,
          personnel: sourceStatus.personnel,
        },
        values: {
          'letter.number': letterNumber,
          'letter.date': letterDate,
          'recipient.name': recipientName,
          'recipient.organization': recipientOrg,
          'signatory.name': signatoryName,
          'signatory.position': signatoryPosition,
          'rab.grandTotal': formatRupiah(calculatedRabTotal),
        },
        userFieldValues: {
          'letter.number': letterNumber,
          'letter.date': letterDate,
          'recipient.name': recipientName,
          'recipient.organization': recipientOrg,
          'signatory.name': signatoryName,
          'signatory.position': signatoryPosition,
        },
        sourceHash: initialHash,
        sourceTimestamp: new Date().toISOString(),
        revision: 0,
        revisionDescription: 'R0 Draft awal hasil generate AI Document Package Wizard',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      repo.saveDocument(newRecord);
      count++;
    });

    setCreatedDocsCount(count);
    // Paket sudah dibuat — draf tidak diperlukan lagi (jangan bangkitkan
    // input lama pada pembukaan wizard berikutnya).
    if (draftKey) {
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* abaikan */
      }
      draftLoadedRef.current = null;
    }
    setStep(5);
    if (onCompletePackage) {
      onCompletePackage(selectedDocIds);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AI Document Package Wizard"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        zIndex: 150,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '920px',
          maxHeight: '90vh',
          backgroundColor: 'var(--ez-color-surface)',
          borderRadius: '18px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid var(--ez-color-border-line)',
        }}
      >
        {/* MODAL HEADER */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--ez-color-border-line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(180deg, var(--ez-hue-slate-bg) 0%, #FFFFFF 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
              }}
            >
              <Sparkles size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: 0 }}>
                  AI Document Package Wizard
                </h2>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--ez-hue-blue-bg)',
                    color: 'var(--ez-color-primary)',
                    border: '1px solid var(--ez-hue-blue-border)',
                  }}
                >
                  TENDER SUITE
                </span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--ez-color-text-muted)', margin: '3px 0 0 0' }}>
                Proyek: <strong style={{ color: 'var(--ez-color-text-primary)' }}>{masterData.projectName}</strong> ({projectId})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'var(--ez-color-surface-tertiary)',
              border: 'none',
              borderRadius: '8px',
              padding: '8px',
              cursor: 'pointer',
              color: 'var(--ez-color-text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* STEPPER PROGRESS BAR */}
        <div
          style={{
            padding: '12px 24px',
            backgroundColor: 'var(--ez-color-surface-secondary)',
            borderBottom: '1px solid var(--ez-color-border-line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            overflowX: 'auto',
          }}
        >
          {[
            { num: 1, title: '01 Pilih Dokumen' },
            { num: 2, title: '02 Periksa Data' },
            { num: 3, title: '03 Isi & Generate' },
            { num: 4, title: '04 Review' },
            { num: 5, title: '05 Selesai' },
          ].map((st) => {
            const isActive = step === st.num;
            const isDone = step > st.num;
            return (
              <div
                key={st.num}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  opacity: isActive || isDone ? 1 : 0.45,
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '12.5px',
                  color: isActive ? 'var(--ez-color-primary)' : isDone ? 'var(--ez-hue-green-text-bright)' : 'var(--ez-color-text-muted)',
                  whiteSpace: 'nowrap',
                }}
              >
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: isActive ? 'var(--ez-color-primary)' : isDone ? '#16A34A' : 'var(--ez-hue-slate-border)',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}
                >
                  {isDone ? '✓' : st.num}
                </div>
                <span>{st.title}</span>
                {st.num < 5 && <ChevronRight size={14} color="#94A3B8" />}
              </div>
            );
          })}
        </div>

        {/* STEP CONTENT BODY (SCROLLABLE) */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {/* ============================================================== */}
          {/* STEP 1: PILIH DOKUMEN                                          */}
          {/* ============================================================== */}
          {step === 1 && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ez-color-text-primary)', margin: 0 }}>
                  Pilih Dokumen yang Akan Dibuat
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--ez-color-text-muted)', margin: '4px 0 0 0' }}>
                  Pilih preset paket standar atau tandai dokumen yang diinginkan sesuai kebutuhan tender.
                </p>
              </div>

              {/* QUICK SELECT PRESETS */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
                {[
                  { key: 'ALL', label: `Semua Dokumen Tender (${TENDER_PACKAGE_PRESETS.ALL.length} Dokumen)`, count: TENDER_PACKAGE_PRESETS.ALL.length },
                  { key: 'ADMINISTRATION', label: `Administrasi (${TENDER_PACKAGE_PRESETS.ADMINISTRATION.length})`, count: TENDER_PACKAGE_PRESETS.ADMINISTRATION.length },
                  { key: 'TECHNICAL', label: `Teknis (${TENDER_PACKAGE_PRESETS.TECHNICAL.length})`, count: TENDER_PACKAGE_PRESETS.TECHNICAL.length },
                  { key: 'COMMERCIAL', label: `Biaya (${TENDER_PACKAGE_PRESETS.COMMERCIAL.length})`, count: TENDER_PACKAGE_PRESETS.COMMERCIAL.length },
                  { key: 'SCHEDULE', label: `Jadwal (${TENDER_PACKAGE_PRESETS.SCHEDULE.length})`, count: TENDER_PACKAGE_PRESETS.SCHEDULE.length },
                  { key: 'HSE', label: `K3 / HSE (${TENDER_PACKAGE_PRESETS.HSE.length})`, count: TENDER_PACKAGE_PRESETS.HSE.length },
                ].map((preset) => {
                  const isSelected = activePreset === preset.key;
                  return (
                    <button
                      key={preset.key}
                      onClick={() => applyPreset(preset.key as TenderPresetKey)}
                      style={{
                        padding: '8px 14px',
                        borderRadius: '8px',
                        border: isSelected ? '1.5px solid #2563EB' : '1px solid var(--ez-hue-slate-border)',
                        backgroundColor: isSelected ? 'var(--ez-hue-blue-bg)' : 'var(--ez-color-surface)',
                        color: isSelected ? 'var(--ez-color-primary-hover)' : 'var(--ez-color-text-body)',
                        fontSize: '12px',
                        fontWeight: isSelected ? 700 : 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 120ms ease',
                      }}
                    >
                      {isSelected && <CheckCircle2 size={13} color="var(--ez-hue-blue-text)" />}
                      <span>{preset.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* CATEGORY ACCORDIONS */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {Object.entries(groupedDocuments).map(([catKey, docs]) => {
                  if (docs.length === 0) return null;
                  const meta = CATEGORY_META[catKey] || { label: catKey, icon: FileText, color: 'var(--ez-color-text-muted)', bg: 'var(--ez-color-surface-secondary)' };
                  const isCollapsed = collapsedCategories[catKey];
                  const selectedInCat = docs.filter((d) => selectedDocIds.includes(d.id)).length;
                  const MetaIcon = meta.icon;

                  return (
                    <div
                      key={catKey}
                      style={{
                        border: '1px solid var(--ez-color-border-line)',
                        borderRadius: 'var(--ez-radius-control)',
                        overflow: 'hidden',
                        backgroundColor: 'var(--ez-color-surface)',
                      }}
                    >
                      {/* Accordion Header */}
                      <div
                        onClick={() => toggleCategoryCollapse(catKey)}
                        style={{
                          padding: '12px 16px',
                          backgroundColor: meta.bg,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          userSelect: 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ color: meta.color, display: 'flex' }}><MetaIcon size={17} /></span>
                          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>
                            {meta.label} ({docs.length})
                          </span>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: 'var(--ez-radius-pill)',
                              backgroundColor: selectedInCat > 0 ? meta.color : '#E2E8F0',
                              color: selectedInCat > 0 ? '#FFFFFF' : 'var(--ez-color-text-muted)',
                            }}
                          >
                            {selectedInCat} terpilih
                          </span>
                        </div>
                        {isCollapsed ? <ChevronRight size={16} color="#64748B" /> : <ChevronDown size={16} color="#64748B" />}
                      </div>

                      {/* Accordion Body */}
                      {!isCollapsed && (
                        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {docs.map((doc) => {
                            const isChecked = selectedDocIds.includes(doc.id);
                            return (
                              <label
                                key={doc.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  gap: '12px',
                                  padding: '10px 12px',
                                  borderRadius: '8px',
                                  backgroundColor: isChecked ? 'var(--ez-color-surface-secondary)' : 'var(--ez-color-surface)',
                                  border: isChecked ? '1px solid var(--ez-hue-blue-border)' : '1px solid var(--ez-color-surface-tertiary)',
                                  cursor: 'pointer',
                                  transition: 'all 100ms ease',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleDocument(doc.id)}
                                  style={{ marginTop: '3px', cursor: 'pointer', accentColor: 'var(--ez-color-primary)' }}
                                />
                                <div style={{ flex: 1 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ez-color-primary)', fontFamily: 'monospace' }}>
                                      {doc.code}
                                    </span>
                                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>
                                      {doc.name}
                                    </span>
                                    {doc.requirement === 'CORE' && (
                                      <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ez-hue-rose-text)', backgroundColor: 'var(--ez-hue-red-bg)', padding: '1px 6px', borderRadius: '4px' }}>
                                        WAJIB
                                      </span>
                                    )}
                                  </div>
                                  <p style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)', margin: '3px 0 0 0' }}>
                                    {doc.description}
                                  </p>
                                  {doc.dependencies && doc.dependencies.length > 0 && (
                                    <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                                      {doc.dependencies.map((dep) => (
                                        <span
                                          key={dep}
                                          style={{
                                            fontSize: '10px',
                                            padding: '1px 6px',
                                            borderRadius: '4px',
                                            backgroundColor: 'var(--ez-color-surface-tertiary)',
                                            color: 'var(--ez-color-text-slate)',
                                          }}
                                        >
                                          Sumber: {dep}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* STEP 2: PERIKSA DATA (SOURCE CHECK)                            */}
          {/* ============================================================== */}
          {step === 2 && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ez-color-text-primary)', margin: 0 }}>
                  Pemeriksaan Ketersediaan Sumber Data Proyek
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--ez-color-text-muted)', margin: '4px 0 0 0' }}>
                  EZRAB memeriksa database proyek aktif untuk memastikan variabel dokumen dapat terisi otomatis.
                </p>
              </div>

              {/* SOURCE GRID */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                {[
                  { name: 'Informasi Proyek', ready: Boolean(masterData.projectName), detail: `${masterData.projectName} (${masterData.location})` },
                  { name: 'RAB & Harga', ready: sourceStatus.rab, detail: sourceStatus.rab ? `${rabItems.length} item RAB (${formatRupiah(calculatedRabTotal)})` : 'Belum ada item RAB' },
                  { name: 'Daftar BOQ', ready: sourceStatus.boq, detail: sourceStatus.boq ? `${rabItems.length} item pekerjaan` : 'Belum ada item' },
                  { name: 'AHSP Satuan', ready: sourceStatus.ahsp, detail: sourceStatus.ahsp ? 'AHSP terpetakan' : 'Sebagian item belum ada AHSP' },
                  { name: 'Jadwal & Schedule', ready: sourceStatus.schedule, detail: sourceStatus.schedule ? `${scheduleTasks.length} aktivitas jadwal` : 'Jadwal belum disusun' },
                  { name: 'Kurva-S Proyek', ready: sourceStatus.curveS, detail: sourceStatus.curveS ? `${kurvaSData.length} titik progress` : 'Kurva-S belum dibuat' },
                  { name: 'Personil Inti Proyek', ready: sourceStatus.personnel, detail: `PM: ${masterData.projectManager || 'Belum diisi'}` },
                  { name: 'Peralatan Konstruksi', ready: sourceStatus.equipment, detail: sourceStatus.equipment ? 'Daftar alat tersedia' : 'Belum ada data peralatan terhubung' },
                ].map((src, idx) => (
                  <div
                    key={idx}
                    style={{
                      border: src.ready ? '1px solid var(--ez-hue-green-border)' : '1px solid var(--ez-hue-orange-bg-deep)',
                      backgroundColor: src.ready ? 'var(--ez-hue-green-bg)' : 'var(--ez-hue-amber-bg)',
                      borderRadius: '10px',
                      padding: '12px 14px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>{src.name}</span>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: '4px',
                          backgroundColor: src.ready ? 'var(--ez-hue-green-bg-deep)' : 'var(--ez-hue-amber-bg-deep)',
                          color: src.ready ? 'var(--ez-hue-green-text)' : 'var(--ez-hue-amber-text)',
                        }}
                      >
                        {src.ready ? '✓ Data tersedia' : '⚠ Belum tersedia'}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)' }}>{src.detail}</div>
                  </div>
                ))}
              </div>

              {/* MISSING DATA WARNING & ACTIONS */}
              {(!sourceStatus.rab || !sourceStatus.schedule) && (
                <div
                  style={{
                    backgroundColor: 'var(--ez-hue-amber-bg)',
                    border: '1px solid var(--ez-hue-amber-border)',
                    borderRadius: 'var(--ez-radius-control)',
                    padding: '16px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                  }}
                >
                  <AlertTriangle size={20} color="var(--ez-hue-amber-text-deep)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <h4 style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--ez-hue-amber-text-dark)', margin: 0 }}>
                      Sebagian Sumber Data Belum Lengkap
                    </h4>
                    <p style={{ fontSize: '12.5px', color: 'var(--ez-hue-amber-text)', margin: '4px 0 10px 0', lineHeight: 1.5 }}>
                      Data yang belum lengkap: <strong>{missingSources.map((m) => m.label).join(' dan ')}</strong>. Dokumen tetap dapat dibuat dan di-generate ke dalam status <strong>DRAFT</strong>. Nilai atau jadwal yang belum lengkap akan diberi tanda placeholder yang dapat Anda edit kemudian di dokumen editor. Gunakan tombol lengkapi untuk langsung menuju tempat data tersebut diisi.
                    </p>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => setStep(3)}
                        style={{
                          padding: '7px 14px',
                          borderRadius: '6px',
                          backgroundColor: '#D97706',
                          color: '#FFFFFF',
                          border: 'none',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Lewati Sementara (Tetap Lanjutkan)
                      </button>
                      {onNavigateToTab &&
                        missingSources.map((m) => (
                          <button
                            key={m.tab}
                            onClick={() => {
                              onClose();
                              onNavigateToTab(m.tab);
                            }}
                            style={{
                              padding: '7px 14px',
                              borderRadius: '6px',
                              backgroundColor: 'var(--ez-color-surface)',
                              color: 'var(--ez-hue-amber-text-dark)',
                              border: '1px solid #FCD34D',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <span>Lengkapi {m.label}</span>
                            <ExternalLink size={12} />
                          </button>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* STEP 3: ISI & GENERATE                                         */}
          {/* ============================================================== */}
          {step === 3 && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ez-color-text-primary)', margin: 0 }}>
                  Pengisian Data Dokumen & Variabel Terintegrasi
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--ez-color-text-muted)', margin: '4px 0 0 0' }}>
                  Variabel inti terisi otomatis dari EZRAB Core. Lengkapi nomor surat dan penerima dokumen penawaran di bawah.
                </p>
              </div>

              {/* AUTO-FILLED VARIABLES FROM CORE */}
              <div
                style={{
                  backgroundColor: 'var(--ez-color-surface-secondary)',
                  border: '1px solid var(--ez-color-border-line)',
                  borderRadius: 'var(--ez-radius-control)',
                  padding: '16px',
                  marginBottom: '20px',
                }}
              >
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ez-color-text-body)', marginBottom: '12px' }}>
                  Variabel Otomatis dari Core Proyek:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
                  {[
                    { label: 'Nama Paket Pekerjaan', val: masterData.projectName, tag: 'ⓘ Berdasarkan data proyek' },
                    { label: 'Nilai Penawaran (RAB)', val: formatRupiah(calculatedRabTotal), tag: 'ⓘ Berdasarkan data proyek' },
                    { label: 'Durasi Pekerjaan', val: masterData.duration, tag: 'ⓘ Berdasarkan data proyek' },
                    { label: 'Penyedia Jasa (Kontraktor)', val: masterData.companyName, tag: 'ⓘ Profil Perusahaan' },
                  ].map((item, i) => (
                    <div key={i} style={{ padding: '8px 12px', backgroundColor: 'var(--ez-color-surface)', borderRadius: '8px', border: '1px solid var(--ez-color-border-line)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)' }}>{item.label}</span>
                        <span style={{ fontSize: '9.5px', fontWeight: 600, color: 'var(--ez-color-primary)', backgroundColor: 'var(--ez-hue-blue-bg)', padding: '1px 5px', borderRadius: '3px' }}>
                          {item.tag}
                        </span>
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>{item.val}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* USER INPUT OVERRIDES */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--ez-color-text-body)', marginBottom: '6px' }}>
                    Nomor Surat Penawaran
                  </label>
                  <input
                    type="text"
                    value={letterNumber}
                    placeholder="mis. 001/TDR/EZRAB/2026"
                    onChange={(e) => setLetterNumber(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--ez-hue-slate-border)',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--ez-color-text-body)', marginBottom: '6px' }}>
                    Tanggal Dokumen
                  </label>
                  <input
                    type="date"
                    value={letterDate}
                    onChange={(e) => setLetterDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--ez-hue-slate-border)',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--ez-color-text-body)', marginBottom: '6px' }}>
                    Penerima Dokumen (Pokja / PPK)
                  </label>
                  <input
                    type="text"
                    value={recipientName}
                    placeholder="mis. Pokja Pemilihan / PPK"
                    onChange={(e) => setRecipientName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--ez-hue-slate-border)',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--ez-color-text-body)', marginBottom: '6px' }}>
                    Instansi / Lembaga Penerima
                  </label>
                  <input
                    type="text"
                    value={recipientOrg}
                    placeholder="mis. Dinas Pekerjaan Umum & Penataan Ruang"
                    onChange={(e) => setRecipientOrg(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--ez-hue-slate-border)',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--ez-color-text-body)', marginBottom: '6px' }}>
                    Nama Perusahaan / Kontraktor <span style={{ color: 'var(--ez-hue-rose-text)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => { setCompanyName(e.target.value); setIdentityError(null); }}
                    placeholder={brandingLoading ? 'Memuat dari profil perusahaan…' : 'Nama perusahaan — wajib diisi'}
                    disabled={brandingLoading}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${identityError ? '#DC2626' : 'var(--ez-color-border)'}`,
                      fontSize: '13px',
                      boxSizing: 'border-box',
                      opacity: brandingLoading ? 0.6 : 1,
                    }}
                  />
                  {identityError && (
                    <div style={{ marginTop: '4px', fontSize: '11.5px', color: 'var(--ez-hue-rose-text)' }}>{identityError}</div>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--ez-color-text-body)', marginBottom: '6px' }}>
                    Penandatangan (Direktur) <span style={{ color: 'var(--ez-hue-rose-text)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={signatoryName}
                    onChange={(e) => setSignatoryName(e.target.value)}
                    placeholder="Nama penandatangan — wajib diisi"
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--ez-hue-slate-border)',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--ez-color-text-body)', marginBottom: '6px' }}>
                    Jabatan Penandatangan
                  </label>
                  <input
                    type="text"
                    value={signatoryPosition}
                    placeholder="mis. Direktur Utama"
                    onChange={(e) => setSignatoryPosition(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--ez-hue-slate-border)',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* STEP 4: REVIEW & CONSISTENCY CHECK                             */}
          {/* ============================================================== */}
          {step === 4 && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ez-color-text-primary)', margin: 0 }}>
                  Review Paket & Verifikasi Konsistensi
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--ez-color-text-muted)', margin: '4px 0 0 0' }}>
                  Periksa konsistensi silang antar dokumen sebelum pembuatan final draft.
                </p>
              </div>

              {/* CONSISTENCY SCORE BAR */}
              <div
                style={{
                  padding: '16px 20px',
                  borderRadius: 'var(--ez-radius-control)',
                  border: consistencyReport.valid ? '1px solid var(--ez-hue-green-border)' : '1px solid var(--ez-hue-orange-bg-deep)',
                  backgroundColor: consistencyReport.valid ? 'var(--ez-hue-green-bg)' : 'var(--ez-hue-amber-bg)',
                  marginBottom: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <ShieldCheck size={28} color={consistencyReport.valid ? '#16A34A' : '#D97706'} />
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--ez-color-text-primary)' }}>
                      {consistencyReport.valid ? 'Verifikasi Konsistensi Valid' : 'Catatan Konsistensi Terdeteksi'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--ez-color-text-muted)' }}>
                      Total {selectedDocIds.length} dokumen dalam paket siap di-generate dengan revisi <strong>REV-00 (DRAFT)</strong>.
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    fontSize: '18px',
                    fontWeight: 800,
                    color: consistencyReport.score >= 80 ? 'var(--ez-hue-green-text-bright)' : 'var(--ez-hue-amber-text-deep)',
                  }}
                >
                  {consistencyReport.score}/100 Skor
                </div>
              </div>

              {/* Audit F-DP-06: skor konsistensi hanya memeriksa kontradiksi
                  antar data yang ADA; sumber yang hilang tidak menguranginya.
                  Tanpa catatan ini, skor 100/100 tampil menyesatkan di
                  samping peringatan sumber kosong pada langkah 2. */}
              {missingSources.length > 0 && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: 'var(--ez-radius-control)',
                    border: '1px solid var(--ez-hue-amber-border)',
                    backgroundColor: 'var(--ez-hue-amber-bg)',
                    marginBottom: '18px',
                    fontSize: '12.5px',
                    lineHeight: 1.55,
                    color: 'var(--ez-hue-amber-text)',
                  }}
                >
                  <strong>Catatan kelengkapan:</strong> skor di atas hanya menilai kesesuaian antar data yang tersedia. Sumber berikut masih kosong dan <strong>tidak mengurangi skor</strong>: {missingSources.map((m) => m.label).join(' dan ')}. Dokumen terkait sumber tersebut akan berisi placeholder.
                </div>
              )}

              {/* ISSUES LIST IF ANY */}
              {consistencyReport.issues.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
                  {consistencyReport.issues.map((issue, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '8px',
                        border: issue.severity === 'ERROR' ? '1px solid #FCA5A5' : '1px solid var(--ez-hue-amber-border)',
                        backgroundColor: issue.severity === 'ERROR' ? 'var(--ez-hue-rose-bg)' : 'var(--ez-hue-amber-bg)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 800,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: issue.severity === 'ERROR' ? '#DC2626' : '#D97706',
                            color: '#FFFFFF',
                          }}
                        >
                          {issue.severity}
                        </span>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>
                          {issue.title}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--ez-color-text-slate)', marginBottom: '4px' }}>
                        {issue.description}
                      </div>
                      {issue.suggestedAction && (
                        <div style={{ fontSize: '11.5px', color: 'var(--ez-color-primary)', fontWeight: 600 }}>
                          💡 Rekomendasi: {issue.suggestedAction}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* SUMMARY TABLE OF DOCUMENTS TO CREATE */}
              <div
                style={{
                  border: '1px solid var(--ez-color-border-line)',
                  borderRadius: '10px',
                  overflow: 'hidden',
                }}
              >
                <div style={{ padding: '10px 14px', backgroundColor: 'var(--ez-color-surface-secondary)', borderBottom: '1px solid var(--ez-color-border-line)', fontSize: '12.5px', fontWeight: 700, color: 'var(--ez-color-text-body)' }}>
                  Daftar Dokumen yang Akan Dibuat ({selectedDocIds.length} Dokumen):
                </div>
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {selectedDocIds.map((docId) => {
                    const def = getDocumentDefinition(docId);
                    if (!def) return null;
                    return (
                      <div
                        key={docId}
                        style={{
                          padding: '8px 14px',
                          borderBottom: '1px solid var(--ez-color-surface-tertiary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '12.5px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--ez-color-primary)', fontSize: '11px' }}>
                            {def.code}
                          </span>
                          <span style={{ fontWeight: 600, color: 'var(--ez-color-text-primary)' }}>{def.name}</span>
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--ez-color-text-muted)', backgroundColor: 'var(--ez-color-surface-tertiary)', padding: '2px 6px', borderRadius: '4px' }}>
                          REV-00 DRAFT
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* STEP 5: SELESAI                                                */}
          {/* ============================================================== */}
          {step === 5 && (
            <div style={{ textAlign: 'center', padding: '20px 10px' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--ez-hue-green-bg-deep)',
                  color: 'var(--ez-hue-green-text-bright)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px auto',
                }}
              >
                <CheckCircle2 size={36} />
              </div>

              <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: 0 }}>
                Paket Dokumen Tender Berhasil Dibuat!
              </h3>
              <p style={{ fontSize: '14px', color: 'var(--ez-color-text-muted)', maxWidth: '480px', margin: '8px auto 24px auto', lineHeight: 1.5 }}>
                Sebanyak <strong>{createdDocsCount} dokumen</strong> telah disiapkan dalam workspace proyek dengan revisi awal <strong>REV-00</strong>. Anda dapat meninjau, mengedit narasi dengan AI, dan mencetak dokumen kapan saja.
              </p>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
                <button
                  onClick={() => {
                    onClose();
                    if (onNavigateToTab) {
                      onNavigateToTab('dokumen-tender');
                    }
                  }}
                  style={{
                    padding: '12px 22px',
                    borderRadius: '10px',
                    backgroundColor: 'var(--ez-color-primary)',
                    color: '#FFFFFF',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '13.5px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(37, 99, 235, 0.25)',
                  }}
                >
                  <FileText size={16} />
                  <span>Buka di Dokumen Proyek</span>
                </button>

                <button
                  onClick={onClose}
                  style={{
                    padding: '12px 20px',
                    borderRadius: '10px',
                    backgroundColor: 'var(--ez-color-surface-tertiary)',
                    color: 'var(--ez-color-text-body)',
                    border: '1px solid var(--ez-hue-slate-border)',
                    fontWeight: 600,
                    fontSize: '13.5px',
                    cursor: 'pointer',
                  }}
                >
                  Selesai
                </button>
              </div>
            </div>
          )}
        </div>

        {/* MODAL FOOTER CONTROLS */}
        {step < 5 && (
          <div
            style={{
              padding: '16px 24px',
              backgroundColor: 'var(--ez-color-surface-secondary)',
              borderTop: '1px solid var(--ez-color-border-line)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              {step > 1 ? (
                <button
                  onClick={() => setStep((s) => (s - 1) as WizardStep)}
                  style={{
                    padding: '9px 16px',
                    borderRadius: '8px',
                    border: '1px solid var(--ez-hue-slate-border)',
                    backgroundColor: 'var(--ez-color-surface)',
                    color: 'var(--ez-color-text-body)',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <ArrowLeft size={14} />
                  <span>Kembali</span>
                </button>
              ) : (
                <span style={{ fontSize: '13px', color: 'var(--ez-color-text-muted)', fontWeight: 600 }}>
                  {selectedDocIds.length} Dokumen dipilih
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={onClose}
                style={{
                  padding: '9px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: 'var(--ez-color-text-muted)',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Batal
              </button>

              {step < 4 ? (
                <button
                  onClick={() => setStep((s) => (s + 1) as WizardStep)}
                  disabled={selectedDocIds.length === 0}
                  style={{
                    padding: '9px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: selectedDocIds.length === 0 ? '#94A3B8' : 'var(--ez-color-primary)',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: selectedDocIds.length === 0 ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
                  }}
                >
                  <span>Lanjutkan</span>
                  <ArrowRight size={14} />
                </button>
              ) : (
                <button
                  onClick={handleGeneratePackage}
                  disabled={brandingLoading}
                  style={{
                    padding: '9px 22px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: brandingLoading ? '#94A3B8' : '#16A34A',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: brandingLoading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 8px rgba(22, 163, 74, 0.3)',
                  }}
                >
                  <Sparkles size={15} />
                  <span>{brandingLoading ? 'Memuat identitas…' : '✓ Konfirmasi & Buat Dokumen'}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

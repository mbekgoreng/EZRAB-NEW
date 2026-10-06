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
  DollarSign,
  Download,
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

const CATEGORY_META: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  ADMINISTRATION: { label: 'Administrasi', icon: '📋', color: '#2563EB', bg: '#EFF6FF' },
  TECHNICAL: { label: 'Teknis', icon: '📐', color: '#0D9488', bg: '#F0FDFA' },
  COMMERCIAL: { label: 'Biaya', icon: '💰', color: '#16A34A', bg: '#F0FDF4' },
  COST: { label: 'Biaya', icon: '💰', color: '#16A34A', bg: '#F0FDF4' },
  SCHEDULE: { label: 'Jadwal', icon: '📅', color: '#D97706', bg: '#FFFBEB' },
  HSE: { label: 'K3 / HSE', icon: '🛡️', color: '#DC2626', bg: '#FEF2F2' },
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
  const [letterNumber, setLetterNumber] = useState<string>('001/TDR/EZRAB/2026');
  const [letterDate, setLetterDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [recipientName, setRecipientName] = useState<string>('Pokja Pemilihan / PPK');
  const [recipientOrg, setRecipientOrg] = useState<string>('Dinas Pekerjaan Umum & Penataan Ruang');
  const [signatoryName, setSignatoryName] = useState<string>('Ir. Budi Santoso');
  const [signatoryPosition, setSignatoryPosition] = useState<string>('Direktur Utama');

  const projectId = currentProject?.id || currentProject?.projectNumber || 'default';
  const repo = useMemo(() => new LocalDocumentRepository(projectId), [projectId]);

  // Reset or initialize on open
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setActivePreset('ALL');
      setSelectedDocIds([...TENDER_PACKAGE_PRESETS.ALL]);
    }
  }, [isOpen]);

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
      owner: currentProject.clientName || 'Pemberi Kerja',
      contractor: 'PT Rekacipta Konstruksi Utama',
      location: currentProject.location || 'Indonesia',
      contractValue: currentProject.totalRab || 0,
      duration: currentProject.startDate && currentProject.targetDate
        ? `${currentProject.startDate} s/d ${currentProject.targetDate}`
        : '120 Hari Kalender',
      startDate: currentProject.startDate || '',
      endDate: currentProject.targetDate || '',
      tenderNumber: currentProject.projectNumber || 'TDR-2026-001',
      projectType: currentProject.buildingType || 'Konstruksi Gedung',
      tenderType: currentProject.contractType || 'Pelelangan Terbuka',
      director: signatoryName,
      projectManager: signatoryName,
      engineer: 'M. Pratama, S.T.',
      architect: 'A. Rahman, IAI',
      hseOfficer: 'Siti Handayani, S.T., Ahli K3',
      qs: 'QS Team EZRAB',
      companyName: 'PT Rekacipta Konstruksi Utama',
      companyAddress: 'Jl. Sudirman No. 45, Jakarta',
      companyPhone: '(021) 555-0199',
      companyEmail: 'kontraktor@ezrab.co.id',
    };
  }, [currentProject, projectId, signatoryName]);

  // Calculate authoritative RAB total
  const calculatedRabTotal = useMemo(() => {
    if (rabItems && rabItems.length > 0) {
      return rabItems.reduce((acc, it) => {
        const lineTotal = it.total || it.amount || (it.price && it.volume ? it.price * it.volume : 0) || 0;
        return acc + lineTotal;
      }, 0);
    }
    return typeof masterData.contractValue === 'number'
      ? masterData.contractValue
      : parseFloat(String(masterData.contractValue).replace(/[^0-9.-]+/g, '')) || 0;
  }, [rabItems, masterData.contractValue]);

  // Evaluated Source Availability
  const sourceStatus: SourceStatus = useMemo(() => {
    return getSourceStatus({
      personnel: Boolean(masterData.projectManager || masterData.director),
      equipment: true,
      jsa: true,
      rkk: true,
      ahsp: rabItems.some((it) => it.ahspCode),
      boq: rabItems.length > 0,
      rab: rabItems.length > 0,
      schedule: scheduleTasks.length > 0,
      curveS: kurvaSData.length > 0,
    });
  }, [masterData, rabItems, scheduleTasks, kurvaSData]);

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
    setStep(5);
    if (onCompletePackage) {
      onCompletePackage(selectedDocIds);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(5px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '920px',
          maxHeight: '90vh',
          backgroundColor: '#FFFFFF',
          borderRadius: '18px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid #E2E8F0',
        }}
      >
        {/* MODAL HEADER */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 100%)',
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
                <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                  AI Document Package Wizard
                </h2>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '6px',
                    backgroundColor: '#EFF6FF',
                    color: '#2563EB',
                    border: '1px solid #BFDBFE',
                  }}
                >
                  TENDER SUITE
                </span>
              </div>
              <p style={{ fontSize: '13px', color: '#64748B', margin: '3px 0 0 0' }}>
                Proyek: <strong style={{ color: '#0F172A' }}>{masterData.projectName}</strong> ({projectId})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: '#F1F5F9',
              border: 'none',
              borderRadius: '8px',
              padding: '8px',
              cursor: 'pointer',
              color: '#64748B',
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
            backgroundColor: '#F8FAFC',
            borderBottom: '1px solid #E2E8F0',
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
                  color: isActive ? '#2563EB' : isDone ? '#16A34A' : '#64748B',
                  whiteSpace: 'nowrap',
                }}
              >
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: isActive ? '#2563EB' : isDone ? '#16A34A' : '#CBD5E1',
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
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                  Pilih Dokumen yang Akan Dibuat
                </h3>
                <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0' }}>
                  Pilih preset paket standar atau tandai dokumen yang diinginkan sesuai kebutuhan tender.
                </p>
              </div>

              {/* QUICK SELECT PRESETS */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
                {[
                  { key: 'ALL', label: 'Semua Dokumen Tender (18 Dokumen)', count: 18 },
                  { key: 'ADMINISTRATION', label: 'Administrasi (5)', count: 5 },
                  { key: 'TECHNICAL', label: 'Teknis (5)', count: 5 },
                  { key: 'COMMERCIAL', label: 'Biaya (5)', count: 5 },
                  { key: 'SCHEDULE', label: 'Jadwal (2)', count: 2 },
                  { key: 'HSE', label: 'K3 / HSE (1)', count: 1 },
                ].map((preset) => {
                  const isSelected = activePreset === preset.key;
                  return (
                    <button
                      key={preset.key}
                      onClick={() => applyPreset(preset.key as TenderPresetKey)}
                      style={{
                        padding: '8px 14px',
                        borderRadius: '8px',
                        border: isSelected ? '1.5px solid #2563EB' : '1px solid #CBD5E1',
                        backgroundColor: isSelected ? '#EFF6FF' : '#FFFFFF',
                        color: isSelected ? '#1D4ED8' : '#334155',
                        fontSize: '12px',
                        fontWeight: isSelected ? 700 : 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 120ms ease',
                      }}
                    >
                      {isSelected && <CheckCircle2 size={13} color="#2563EB" />}
                      <span>{preset.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* CATEGORY ACCORDIONS */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {Object.entries(groupedDocuments).map(([catKey, docs]) => {
                  if (docs.length === 0) return null;
                  const meta = CATEGORY_META[catKey] || { label: catKey, icon: '📄', color: '#64748B', bg: '#F8FAFC' };
                  const isCollapsed = collapsedCategories[catKey];
                  const selectedInCat = docs.filter((d) => selectedDocIds.includes(d.id)).length;

                  return (
                    <div
                      key={catKey}
                      style={{
                        border: '1px solid #E2E8F0',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        backgroundColor: '#FFFFFF',
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
                          <span style={{ fontSize: '18px' }}>{meta.icon}</span>
                          <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                            {meta.label} ({docs.length})
                          </span>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: '99px',
                              backgroundColor: selectedInCat > 0 ? meta.color : '#E2E8F0',
                              color: selectedInCat > 0 ? '#FFFFFF' : '#64748B',
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
                                  backgroundColor: isChecked ? '#F8FAFC' : '#FFFFFF',
                                  border: isChecked ? '1px solid #BFDBFE' : '1px solid #F1F5F9',
                                  cursor: 'pointer',
                                  transition: 'all 100ms ease',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleDocument(doc.id)}
                                  style={{ marginTop: '3px', cursor: 'pointer', accentColor: '#2563EB' }}
                                />
                                <div style={{ flex: 1 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#2563EB', fontFamily: 'monospace' }}>
                                      {doc.code}
                                    </span>
                                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                                      {doc.name}
                                    </span>
                                    {doc.requirement === 'CORE' && (
                                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#DC2626', backgroundColor: '#FEE2E2', padding: '1px 6px', borderRadius: '4px' }}>
                                        WAJIB
                                      </span>
                                    )}
                                  </div>
                                  <p style={{ fontSize: '12px', color: '#64748B', margin: '3px 0 0 0' }}>
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
                                            backgroundColor: '#F1F5F9',
                                            color: '#475569',
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
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                  Pemeriksaan Ketersediaan Sumber Data Proyek
                </h3>
                <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0' }}>
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
                  { name: 'Peralatan Konstruksi', ready: sourceStatus.equipment, detail: 'Daftar alat standar tersedia' },
                ].map((src, idx) => (
                  <div
                    key={idx}
                    style={{
                      border: src.ready ? '1px solid #BBF7D0' : '1px solid #FED7AA',
                      backgroundColor: src.ready ? '#F0FDF4' : '#FFFBEB',
                      borderRadius: '10px',
                      padding: '12px 14px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>{src.name}</span>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: '4px',
                          backgroundColor: src.ready ? '#DCFCE7' : '#FEF3C7',
                          color: src.ready ? '#15803D' : '#B45309',
                        }}
                      >
                        {src.ready ? '✓ Data tersedia' : '⚠ Belum tersedia'}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748B' }}>{src.detail}</div>
                  </div>
                ))}
              </div>

              {/* MISSING DATA WARNING & ACTIONS */}
              {(!sourceStatus.rab || !sourceStatus.schedule) && (
                <div
                  style={{
                    backgroundColor: '#FFFBEB',
                    border: '1px solid #FDE68A',
                    borderRadius: '12px',
                    padding: '16px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                  }}
                >
                  <AlertTriangle size={20} color="#D97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <h4 style={{ fontSize: '13.5px', fontWeight: 700, color: '#92400E', margin: 0 }}>
                      Sebagian Sumber Data Belum Lengkap
                    </h4>
                    <p style={{ fontSize: '12.5px', color: '#B45309', margin: '4px 0 10px 0', lineHeight: 1.5 }}>
                      Dokumen tetap dapat dibuat dan di-generate ke dalam status <strong>DRAFT</strong>. Nilai atau jadwal yang belum lengkap akan diberi tanda placeholder yang dapat Anda edit kemudian di dokumen editor.
                    </p>
                    <div style={{ display: 'flex', gap: '10px' }}>
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
                      {onNavigateToTab && (
                        <button
                          onClick={() => {
                            onClose();
                            onNavigateToTab('rab-estimasi');
                          }}
                          style={{
                            padding: '7px 14px',
                            borderRadius: '6px',
                            backgroundColor: '#FFFFFF',
                            color: '#92400E',
                            border: '1px solid #FCD34D',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <span>Lengkapi Data Sekarang</span>
                          <ExternalLink size={12} />
                        </button>
                      )}
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
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                  Pengisian Data Dokumen & Variabel Terintegrasi
                </h3>
                <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0' }}>
                  Variabel inti terisi otomatis dari EZRAB Core. Lengkapi nomor surat dan penerima dokumen penawaran di bawah.
                </p>
              </div>

              {/* AUTO-FILLED VARIABLES FROM CORE */}
              <div
                style={{
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '12px',
                  padding: '16px',
                  marginBottom: '20px',
                }}
              >
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '12px' }}>
                  Variabel Otomatis dari Core Proyek:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
                  {[
                    { label: 'Nama Paket Pekerjaan', val: masterData.projectName, tag: 'ⓘ Berdasarkan data proyek' },
                    { label: 'Nilai Penawaran (RAB)', val: formatRupiah(calculatedRabTotal), tag: 'ⓘ Berdasarkan data proyek' },
                    { label: 'Durasi Pekerjaan', val: masterData.duration, tag: 'ⓘ Berdasarkan data proyek' },
                    { label: 'Penyedia Jasa (Kontraktor)', val: masterData.companyName, tag: 'ⓘ Profil Perusahaan' },
                  ].map((item, i) => (
                    <div key={i} style={{ padding: '8px 12px', backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span style={{ fontSize: '11px', color: '#64748B' }}>{item.label}</span>
                        <span style={{ fontSize: '9.5px', fontWeight: 600, color: '#2563EB', backgroundColor: '#EFF6FF', padding: '1px 5px', borderRadius: '3px' }}>
                          {item.tag}
                        </span>
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>{item.val}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* USER INPUT OVERRIDES */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Nomor Surat Penawaran
                  </label>
                  <input
                    type="text"
                    value={letterNumber}
                    onChange={(e) => setLetterNumber(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
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
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Penerima Dokumen (Pokja / PPK)
                  </label>
                  <input
                    type="text"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Instansi / Lembaga Penerima
                  </label>
                  <input
                    type="text"
                    value={recipientOrg}
                    onChange={(e) => setRecipientOrg(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Penandatangan (Direktur)
                  </label>
                  <input
                    type="text"
                    value={signatoryName}
                    onChange={(e) => setSignatoryName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Jabatan Penandatangan
                  </label>
                  <input
                    type="text"
                    value={signatoryPosition}
                    onChange={(e) => setSignatoryPosition(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
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
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                  Review Paket & Verifikasi Konsistensi
                </h3>
                <p style={{ fontSize: '13px', color: '#64748B', margin: '4px 0 0 0' }}>
                  Periksa konsistensi silang antar dokumen sebelum pembuatan final draft.
                </p>
              </div>

              {/* CONSISTENCY SCORE BAR */}
              <div
                style={{
                  padding: '16px 20px',
                  borderRadius: '12px',
                  border: consistencyReport.valid ? '1px solid #BBF7D0' : '1px solid #FED7AA',
                  backgroundColor: consistencyReport.valid ? '#F0FDF4' : '#FFFBEB',
                  marginBottom: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <ShieldCheck size={28} color={consistencyReport.valid ? '#16A34A' : '#D97706'} />
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
                      {consistencyReport.valid ? 'Verifikasi Konsistensi Valid' : 'Catatan Konsistensi Terdeteksi'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748B' }}>
                      Total {selectedDocIds.length} dokumen dalam paket siap di-generate dengan revisi <strong>REV-00 (DRAFT)</strong>.
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    fontSize: '18px',
                    fontWeight: 800,
                    color: consistencyReport.score >= 80 ? '#16A34A' : '#D97706',
                  }}
                >
                  {consistencyReport.score}/100 Skor
                </div>
              </div>

              {/* ISSUES LIST IF ANY */}
              {consistencyReport.issues.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
                  {consistencyReport.issues.map((issue, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '8px',
                        border: issue.severity === 'ERROR' ? '1px solid #FCA5A5' : '1px solid #FDE68A',
                        backgroundColor: issue.severity === 'ERROR' ? '#FEF2F2' : '#FFFBEB',
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
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                          {issue.title}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#475569', marginBottom: '4px' }}>
                        {issue.description}
                      </div>
                      {issue.suggestedAction && (
                        <div style={{ fontSize: '11.5px', color: '#2563EB', fontWeight: 600 }}>
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
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  overflow: 'hidden',
                }}
              >
                <div style={{ padding: '10px 14px', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>
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
                          borderBottom: '1px solid #F1F5F9',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '12.5px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2563EB', fontSize: '11px' }}>
                            {def.code}
                          </span>
                          <span style={{ fontWeight: 600, color: '#0F172A' }}>{def.name}</span>
                        </div>
                        <span style={{ fontSize: '11px', color: '#64748B', backgroundColor: '#F1F5F9', padding: '2px 6px', borderRadius: '4px' }}>
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
                  backgroundColor: '#DCFCE7',
                  color: '#16A34A',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px auto',
                }}
              >
                <CheckCircle2 size={36} />
              </div>

              <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Paket Dokumen Tender Berhasil Dibuat!
              </h3>
              <p style={{ fontSize: '14px', color: '#64748B', maxWidth: '480px', margin: '8px auto 24px auto', lineHeight: 1.5 }}>
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
                    backgroundColor: '#2563EB',
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
                    backgroundColor: '#F1F5F9',
                    color: '#334155',
                    border: '1px solid #CBD5E1',
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
              backgroundColor: '#F8FAFC',
              borderTop: '1px solid #E2E8F0',
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
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#334155',
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
                <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>
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
                  color: '#64748B',
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
                    backgroundColor: selectedDocIds.length === 0 ? '#94A3B8' : '#2563EB',
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
                  style={{
                    padding: '9px 22px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#16A34A',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 8px rgba(22, 163, 74, 0.3)',
                  }}
                >
                  <Sparkles size={15} />
                  <span>✓ Konfirmasi & Buat Dokumen</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

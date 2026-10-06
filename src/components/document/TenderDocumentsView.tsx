import React, { useState, useMemo, useEffect, useCallback, useContext } from 'react';
import { Plus, X, Folder, FileText, ArrowRight, CheckCircle2, Trash2, Sparkles, Search, Filter } from 'lucide-react';
import type { Project } from '../../types';
import { DOCUMENT_REGISTRY, getDocumentDefinition } from '../../document-engine/registry';
import { LocalDocumentRepository } from '../../document-engine/repository';
import {
  calculateCompletenessForDocument,
  getStatusLabel,
  getLevelLabel,
} from '../../document-engine/completenessEngine';
import {
  EMPTY_MASTER_DATA,
  type ProjectMasterData,
  type DocumentDefinition,
  type DocumentRecord,
} from '../../document-engine/types';
import { DocumentWorkspace } from './DocumentWorkspace';
import { DocumentPackageWizardModal } from '../documents/DocumentPackageWizardModal';
import { ProjectContext } from '../../context/ProjectContext';
import { formatRupiah } from '../../document-engine/templateEngine';
import { computeSourceHash } from '../../document-engine/sourceChangeDetector';

type Workflow = 'tender' | 'technical' | 'hse' | 'commercial' | 'schedule';

const workflows: { id: Workflow; icon: string; label: string; description: string; categories: string[] }[] = [
  { id: 'tender', icon: '🏗️', label: 'Dokumen Proyek', description: 'Dokumen pekerjaan terintegrasi', categories: ['ADMINISTRATION', 'TECHNICAL', 'COMMERCIAL', 'HSE', 'SCHEDULE'] },
  { id: 'technical', icon: '📐', label: 'Teknis', description: 'Dokumen teknis', categories: ['TECHNICAL'] },
  { id: 'hse', icon: '🛡️', label: 'HSE / K3', description: 'Dokumen K3', categories: ['HSE'] },
  { id: 'commercial', icon: '💰', label: 'Komersial', description: 'Dokumen komersial', categories: ['COMMERCIAL'] },
  { id: 'schedule', icon: '📅', label: 'Schedule', description: 'Penjadwalan', categories: ['SCHEDULE'] },
];

export interface TenderDocumentsViewProps {
  currentProject?: Project | null;
  projects?: Project[];
  onSelectProject?: (project: Project) => void;
  rabItems?: any[];
  scheduleTasks?: any[];
  kurvaSData?: any[];
}

export const TenderDocumentsView: React.FC<TenderDocumentsViewProps> = ({
  currentProject,
  projects,
  onSelectProject,
  rabItems = [],
  scheduleTasks = [],
  kurvaSData = [],
}) => {
  const projectCtx = useContext(ProjectContext);
  const [selectedJob, setSelectedJob] = useState<Project | null>(null);
  const [isSelectingJob, setIsSelectingJob] = useState(false);

  const allProjects: Project[] = useMemo(() => {
    if (projects && projects.length > 0) return projects;
    if (projectCtx?.projects && projectCtx.projects.length > 0) return projectCtx.projects;
    return [];
  }, [projects, projectCtx?.projects]);

  const activeProject: Project | null = useMemo(() => {
    if (selectedJob) return selectedJob;
    if (currentProject) return currentProject;
    if (projectCtx?.currentProject) return projectCtx.currentProject;
    return null;
  }, [selectedJob, currentProject, projectCtx?.currentProject]);

  const projectId = activeProject?.id || activeProject?.projectNumber || 'default';
  const repo = useMemo(() => new LocalDocumentRepository(projectId), [projectId]);

  const masterData: ProjectMasterData = useMemo(() => {
    if (!activeProject) {
      return {
        ...EMPTY_MASTER_DATA,
        projectNumber: projectId,
      };
    }
    return {
      ...EMPTY_MASTER_DATA,
      projectName: activeProject.name || 'Proyek Tanpa Nama',
      projectNumber: projectId,
      owner: activeProject.clientName || '',
      contractor: '',
      location: activeProject.location || '',
      contractValue: activeProject.totalRab || 0,
      duration: activeProject.startDate && activeProject.targetDate
        ? `${activeProject.startDate} s/d ${activeProject.targetDate}`
        : '',
      startDate: activeProject.startDate || '',
      endDate: activeProject.targetDate || '',
      tenderNumber: activeProject.projectNumber || '',
      projectType: activeProject.buildingType || 'Konstruksi',
      tenderType: activeProject.contractType || 'Pelelangan',
    };
  }, [activeProject, projectId]);

  const [activeRecords, setActiveRecords] = useState<DocumentRecord[]>([]);
  const [activeDocumentDef, setActiveDocumentDef] = useState<DocumentDefinition | null>(null);

  const [wizard, setWizard] = useState(false);
  const [isAiWizardOpen, setIsAiWizardOpen] = useState(false);
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<'ALL' | 'ADMINISTRATION' | 'TECHNICAL' | 'COMMERCIAL' | 'SCHEDULE' | 'HSE'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DRAFT' | 'INCOMPLETE' | 'COMPLETE'>('ALL');
  const [selectionStep, setSelectionStep] = useState(1);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);

  const reloadActiveRecords = useCallback(() => {
    const docs = repo.getProjectDocuments(projectId).filter((r) => r.status !== 'NOT_STARTED');
    setActiveRecords(docs);
  }, [repo, projectId]);

  useEffect(() => {
    reloadActiveRecords();
  }, [reloadActiveRecords]);

  const getDocumentsForWorkflow = (workflow: Workflow | null): DocumentDefinition[] => {
    if (!workflow) return DOCUMENT_REGISTRY;
    const config = workflows.find((w) => w.id === workflow);
    if (!config) return DOCUMENT_REGISTRY;
    return DOCUMENT_REGISTRY.filter((def) => config.categories.includes(def.category));
  };

  const selectedDocumentsList = getDocumentsForWorkflow(selectedWorkflow);

  const handleCreateDocuments = () => {
    let openedDocDef: DocumentDefinition | null = null;
    selectedDocuments.forEach((docId) => {
      const existing = repo.getDocument(docId);
      const def = getDocumentDefinition(docId);
      if (!existing && def) {
        const initialHash = computeSourceHash({
          master: masterData,
          rabItems,
          scheduleTasks,
          kurvaSData,
        });
        const newRecord: DocumentRecord = {
          id: `${docId}-REV-00`,
          definitionId: docId,
          documentId: docId,
          projectId: projectId,
          status: 'DRAFT',
          data: {},
          sourceData: { project: true },
          values: {},
          userFieldValues: {},
          sourceHash: initialHash,
          sourceTimestamp: new Date().toISOString(),
          revision: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        repo.saveDocument(newRecord);
        if (!openedDocDef) openedDocDef = def;
      } else if (existing && def && !openedDocDef) {
        openedDocDef = def;
      }
    });

    setWizard(false);
    setSelectionStep(1);
    setSelectedWorkflow(null);
    setSelectedDocuments([]);
    reloadActiveRecords();

    if (selectedDocuments.length === 1 && openedDocDef) {
      setActiveDocumentDef(openedDocDef);
    }
  };

  const handleDeleteDocument = (defId: string, docName: string) => {
    if (typeof window !== 'undefined' && !window.confirm(`Hapus dokumen "${docName}" dari dokumen aktif?`)) {
      return;
    }
    repo.deleteDocument(defId);
    reloadActiveRecords();
  };

  const activeCardData = useMemo(() => {
    return activeRecords.map((record) => {
      const def = getDocumentDefinition(record.definitionId) || {
        id: record.definitionId,
        code: `DOC-${record.definitionId.toUpperCase()}`,
        name: record.definitionId.toUpperCase(),
        category: 'TECHNICAL' as const,
        description: '',
        requirement: 'RECOMMENDED' as const,
        supportedFormats: ['PDF' as const],
        templateId: record.definitionId,
        fields: [],
      };
      const comp = calculateCompletenessForDocument(def, record);
      return {
        record,
        def,
        comp,
        statusLabel: getStatusLabel(record.status),
        levelLabel: getLevelLabel(def.requirement),
      };
    });
  }, [activeRecords]);

  const overallProgress = useMemo(() => {
    if (activeCardData.length === 0) return 0;
    const total = activeCardData.reduce((acc, item) => acc + item.comp.completenessPercentage, 0);
    return Math.round(total / activeCardData.length);
  }, [activeCardData]);

  const stats = useMemo(() => {
    const total = activeRecords.length;
    const completed = activeRecords.filter((r) => r.status === 'COMPLETE' || r.status === 'EXPORTED').length;
    const draft = activeRecords.filter((r) => r.status === 'DRAFT').length;
    const incomplete = activeRecords.filter((r) => r.status === 'INCOMPLETE').length;
    return { total, completed, draft, incomplete };
  }, [activeRecords]);

  const filteredCardData = useMemo(() => {
    return activeCardData.filter(({ record, def }) => {
      // 1. Category Tab Filter
      if (selectedCategoryTab !== 'ALL') {
        const cat = def.category === 'COST' ? 'COMMERCIAL' : def.category;
        if (cat !== selectedCategoryTab) return false;
      }
      // 2. Status Filter
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'COMPLETE' && record.status !== 'COMPLETE' && record.status !== 'EXPORTED') return false;
        if (statusFilter === 'DRAFT' && record.status !== 'DRAFT') return false;
        if (statusFilter === 'INCOMPLETE' && record.status !== 'INCOMPLETE') return false;
      }
      // 3. Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = def.name.toLowerCase().includes(q);
        const codeMatch = def.code.toLowerCase().includes(q);
        const descMatch = (def.description || '').toLowerCase().includes(q);
        if (!nameMatch && !codeMatch && !descMatch) return false;
      }
      return true;
    });
  }, [activeCardData, selectedCategoryTab, statusFilter, searchQuery]);

  // If a document workspace is opened, render it directly
  if (activeDocumentDef) {
    return (
      <DocumentWorkspace
        definition={activeDocumentDef}
        master={masterData}
        onBack={() => {
          setActiveDocumentDef(null);
          reloadActiveRecords();
        }}
        rabItems={rabItems}
        scheduleTasks={scheduleTasks}
        kurvaSData={kurvaSData}
        onSourceDataChanged={reloadActiveRecords}
      />
    );
  }

  // 0. JOB SELECTION SCREEN (Section 2)
  if (!activeProject || isSelectingJob) {
    return (
      <div style={{ fontFamily: "'Inter', system-ui", color: '#0F172A', maxWidth: 900, margin: '0 auto', padding: '24px 0' }}>
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: '#0F172A' }}>
            Pilih Pekerjaan
          </h1>
          <p style={{ margin: '8px 0 0', color: '#64748B', fontSize: 14 }}>
            Pilih pekerjaan dari database EZRAB untuk memuat data proyek, RAB, BOQ, AHSP, dan jadwal ke dokumen.
          </p>
        </div>

        {allProjects.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {allProjects.map((proj) => {
              const isSelected = activeProject?.id === proj.id;
              return (
                <div
                  key={proj.id}
                  style={{
                    background: '#fff',
                    border: isSelected ? '2px solid #2563EB' : '1px solid #E2E8F0',
                    borderRadius: 14,
                    padding: 20,
                    boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 750, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {proj.projectNumber || 'PROYEK'}
                    </div>
                    <h3 style={{ margin: '6px 0 12px', fontSize: 17, fontWeight: 750, color: '#0F172A' }}>
                      {proj.name}
                    </h3>
                    <div style={{ fontSize: 13, color: '#475569', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
                      <div>📍 <strong>Lokasi:</strong> {proj.location || '—'}</div>
                      <div>💰 <strong>RAB:</strong> {formatRupiah(proj.totalRab || 0)}</div>
                      <div>📋 <strong>Status RAB:</strong> <span style={{ color: '#16A34A', fontWeight: 600 }}>Lengkap</span></div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedJob(proj);
                      setIsSelectingJob(false);
                      onSelectProject?.(proj);
                      if (projectCtx?.setCurrentProjectId) {
                        projectCtx.setCurrentProjectId(proj.id);
                      }
                    }}
                    style={{
                      background: isSelected ? '#16A34A' : '#2563EB',
                      color: '#fff',
                      border: 0,
                      borderRadius: 8,
                      padding: '10px 16px',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'center',
                      width: '100%',
                    }}
                  >
                    {isSelected ? '✓ Sedang Aktif' : 'Pilih Pekerjaan'}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '50px 20px', background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0' }}>
            <Folder size={40} color="#94A3B8" style={{ margin: '0 auto 12px' }} />
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Belum Ada Daftar Pekerjaan</h3>
            <p style={{ margin: '6px 0 16px', color: '#64748B', fontSize: 13 }}>
              Buat proyek baru di menu Proyek atau gunakan proyek percontohan.
            </p>
            <button
              onClick={() => {
                const sampleJob: Project = {
                  id: 'PRJ-DEMO-01',
                  projectNumber: 'PRJ-2026-001',
                  name: 'Renovasi Kantor',
                  clientName: 'PT Mandiri Jaya',
                  location: 'Surabaya',
                  totalRab: 1250000000,
                  status: 'in_progress',
                  startDate: '2026-03-01',
                  targetDate: '2026-07-01',
                } as Project;
                setSelectedJob(sampleJob);
                setIsSelectingJob(false);
                onSelectProject?.(sampleJob);
              }}
              style={{
                background: '#2563EB',
                color: '#fff',
                border: 0,
                borderRadius: 8,
                padding: '9px 18px',
                fontSize: 13,
                fontWeight: 650,
                cursor: 'pointer',
              }}
            >
              Pilih Renovasi Kantor (Rp 1.250.000.000)
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Inter', system-ui", color: '#0F172A', maxWidth: 1200, margin: '0 auto' }}>
      {/* ACTIVE JOB CONTEXT BANNER (Section 3) */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
          color: '#fff',
          borderRadius: 12,
          padding: '16px 20px',
          marginBottom: 22,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 4px 14px rgba(15,23,42,0.12)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: 'rgba(37,99,235,0.2)',
              border: '1px solid rgba(59,130,246,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
            }}
          >
            🏗️
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 750, color: '#94A3B8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Pekerjaan Aktif (Active Job Context)
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#F8FAFC', marginTop: 1 }}>
              {activeProject.name}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 4, fontSize: 12.5, color: '#CBD5E1' }}>
              <span>📍 <strong>Lokasi:</strong> {activeProject.location || '—'}</span>
              <span>💰 <strong>RAB:</strong> {formatRupiah(activeProject.totalRab || 0)}</span>
              <span>📅 <strong>Durasi:</strong> {activeProject.startDate ? `${activeProject.startDate} s/d ${activeProject.targetDate || 'Selesai'}` : '120 Hari'}</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsSelectingJob(true)}
          style={{
            background: 'rgba(255,255,255,0.1)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.25)',
            borderRadius: 8,
            padding: '8px 14px',
            fontSize: 12.5,
            fontWeight: 650,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          Ganti Pekerjaan
        </button>
      </div>

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 14 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: '#0F172A' }}>
              Dokumen Proyek
            </h1>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE' }}>
              TENDER & KONTRAK
            </span>
          </div>
          <p style={{ margin: '4px 0 0', color: '#64748B', fontSize: 13.5 }}>
            Proyek: <strong style={{ color: '#0F172A' }}>{masterData.projectName}</strong> • {activeRecords.length} Dokumen Aktif ({overallProgress}% Selesai)
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setIsAiWizardOpen(true)}
            style={{
              background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
              color: '#fff',
              border: 0,
              borderRadius: 9,
              padding: '10px 18px',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 14px rgba(37,99,235,0.3)',
              transition: 'all 0.15s ease',
            }}
          >
            <Sparkles size={16} /> ✨ Buat Paket dengan AI
          </button>

          <button
            onClick={() => {
              setSelectionStep(1);
              setSelectedWorkflow(null);
              setSelectedDocuments([]);
              setWizard(true);
            }}
            style={{
              background: '#FFFFFF',
              color: '#334155',
              border: '1px solid #CBD5E1',
              borderRadius: 9,
              padding: '10px 16px',
              fontWeight: 650,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s ease',
            }}
          >
            <Plus size={15} /> + Dokumen Manual
          </button>
        </div>
      </div>

      {/* STATS OVERVIEW BAR */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Dokumen', val: stats.total, sub: 'Semua berkas aktif', color: '#2563EB', bg: '#EFF6FF' },
          { label: 'Selesai / Siap', val: stats.completed, sub: 'Lengkap & tervalidasi', color: '#16A34A', bg: '#F0FDF4' },
          { label: 'Draft (R0)', val: stats.draft, sub: 'Perlu review narasi', color: '#D97706', bg: '#FFFBEB' },
          { label: 'Perlu Data', val: stats.incomplete, sub: 'Variabel belum lengkap', color: '#DC2626', bg: '#FEF2F2' },
        ].map((item, idx) => (
          <div
            key={idx}
            style={{
              background: '#FFFFFF',
              borderRadius: 12,
              border: '1px solid #E2E8F0',
              padding: '14px 16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ fontSize: 12, color: '#64748B', fontWeight: 600 }}>{item.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: item.color, margin: '4px 0' }}>
              {item.val}
            </div>
            <div style={{ fontSize: 11, color: '#94A3B8' }}>{item.sub}</div>
          </div>
        ))}
      </div>

      {/* FILTER TABS & SEARCH TOOLBAR */}
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: 12,
          border: '1px solid #E2E8F0',
          padding: '12px 16px',
          marginBottom: 20,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        {/* CATEGORY TABS */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { key: 'ALL', label: 'Semua', count: stats.total },
            { key: 'ADMINISTRATION', label: 'Administrasi', count: activeRecords.filter(r => (getDocumentDefinition(r.definitionId)?.category === 'ADMINISTRATION')).length },
            { key: 'TECHNICAL', label: 'Teknis', count: activeRecords.filter(r => (getDocumentDefinition(r.definitionId)?.category === 'TECHNICAL')).length },
            { key: 'COMMERCIAL', label: 'Biaya', count: activeRecords.filter(r => { const c = getDocumentDefinition(r.definitionId)?.category; return c === 'COMMERCIAL' || c === 'COST'; }).length },
            { key: 'SCHEDULE', label: 'Jadwal', count: activeRecords.filter(r => (getDocumentDefinition(r.definitionId)?.category === 'SCHEDULE')).length },
            { key: 'HSE', label: 'K3 / HSE', count: activeRecords.filter(r => (getDocumentDefinition(r.definitionId)?.category === 'HSE')).length },
          ].map((tab) => {
            const isTabActive = selectedCategoryTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setSelectedCategoryTab(tab.key as any)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: isTabActive ? '1px solid #2563EB' : '1px solid #E2E8F0',
                  background: isTabActive ? '#EFF6FF' : '#FFFFFF',
                  color: isTabActive ? '#1D4ED8' : '#475569',
                  fontSize: 12.5,
                  fontWeight: isTabActive ? 700 : 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.12s ease',
                }}
              >
                <span>{tab.label}</span>
                <span
                  style={{
                    fontSize: 10.5,
                    padding: '1px 5px',
                    borderRadius: 99,
                    background: isTabActive ? '#2563EB' : '#F1F5F9',
                    color: isTabActive ? '#FFFFFF' : '#64748B',
                    fontWeight: 700,
                  }}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* SEARCH & STATUS FILTER */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ position: 'relative', width: '220px' }}>
            <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Cari dokumen..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px 7px 30px',
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                fontSize: 12.5,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            style={{
              padding: '7px 10px',
              borderRadius: 8,
              border: '1px solid #CBD5E1',
              fontSize: 12.5,
              color: '#334155',
              background: '#FFFFFF',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="ALL">Semua Status</option>
            <option value="COMPLETE">Selesai / Exported</option>
            <option value="DRAFT">Draft (R0)</option>
            <option value="INCOMPLETE">Belum Lengkap</option>
          </select>
        </div>
      </div>

      {/* EMPTY STATE (NO ACTIVE DOCUMENTS AT ALL) */}
      {activeRecords.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#EFF6FF', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
            <Sparkles size={32} style={{ color: '#2563EB' }} />
          </div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0F172A' }}>Belum Ada Dokumen Proyek</h3>
          <p style={{ margin: '8px 0 0', color: '#64748B', fontSize: 14, maxWidth: '440px', marginInline: 'auto' }}>
            Siapkan seluruh berkas tender Anda (Administrasi, Teknis, Biaya, Jadwal, K3) secara otomatis dari database proyek ini.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 24 }}>
            <button
              onClick={() => setIsAiWizardOpen(true)}
              style={{
                background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                color: '#fff',
                border: 0,
                borderRadius: 9,
                padding: '11px 22px',
                fontWeight: 700,
                fontSize: 13.5,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 4px 14px rgba(37,99,235,0.25)',
              }}
            >
              <Sparkles size={16} /> ✨ Buat Paket dengan AI
            </button>
            <button
              onClick={() => {
                setSelectionStep(1);
                setSelectedWorkflow(null);
                setSelectedDocuments([]);
                setWizard(true);
              }}
              style={{
                background: '#FFFFFF',
                color: '#334155',
                border: '1px solid #CBD5E1',
                borderRadius: 9,
                padding: '11px 18px',
                fontWeight: 650,
                fontSize: 13.5,
                cursor: 'pointer',
              }}
            >
              + Pilih Manual
            </button>
          </div>
        </div>
      )}

      {/* FILTER EMPTY STATE (FILTER CRITERIA RETURNED 0) */}
      {activeRecords.length > 0 && filteredCardData.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0' }}>
          <p style={{ color: '#64748B', fontSize: 14, margin: '0 0 12px 0' }}>
            Tidak ada dokumen yang cocok dengan filter atau pencarian Anda.
          </p>
          <button
            onClick={() => {
              setSelectedCategoryTab('ALL');
              setStatusFilter('ALL');
              setSearchQuery('');
            }}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              background: '#F1F5F9',
              border: '1px solid #CBD5E1',
              color: '#334155',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reset Filter
          </button>
        </div>
      )}

      {/* ACTIVE DOCUMENTS LIST */}
      {activeRecords.length > 0 && filteredCardData.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {filteredCardData.map(({ record, def, comp, statusLabel, levelLabel }) => {
            const isReady = record.status === 'COMPLETE' || record.status === 'EXPORTED';
            const actionLabel = isReady ? 'Buka' : 'Lanjutkan';

            let statusBg = '#F8FAFC';
            let statusColor = '#475569';
            let statusBorder = '#CBD5E1';
            if (record.status === 'DRAFT') {
              statusBg = '#F8FAFC';
              statusColor = '#475569';
              statusBorder = '#CBD5E1';
            } else if (record.status === 'INCOMPLETE') {
              statusBg = '#FEF3C7';
              statusColor = '#B45309';
              statusBorder = '#FDE68A';
            } else if (record.status === 'COMPLETE') {
              statusBg = '#DCFCE7';
              statusColor = '#15803D';
              statusBorder = '#BBF7D0';
            } else if (record.status === 'EXPORTED') {
              statusBg = '#DBEAFE';
              statusColor = '#1D4ED8';
              statusBorder = '#BFDBFE';
            }

            const revisionCode = record.revision === 2 ? 'R2 • Final' : record.revision === 1 ? 'R1 • Review' : 'R0 • Draft';
            const revBg = record.revision === 2 ? '#DCFCE7' : record.revision === 1 ? '#EFF6FF' : '#F1F5F9';
            const revColor = record.revision === 2 ? '#15803D' : record.revision === 1 ? '#1D4ED8' : '#475569';

            return (
              <div
                key={record.definitionId}
                style={{
                  background: '#fff',
                  borderRadius: 12,
                  border: '1px solid #E2E8F0',
                  padding: 18,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 16,
                  transition: 'all 0.15s ease',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: '#0F172A' }}>
                          {def.name}
                        </h3>
                        <span
                          style={{
                            fontSize: 10.5,
                            padding: '2px 7px',
                            borderRadius: 6,
                            background: revBg,
                            color: revColor,
                            fontWeight: 700,
                          }}
                        >
                          {revisionCode}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748B' }}>
                        {def.code} • {def.category}
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteDocument(record.definitionId, def.name)}
                      title="Hapus dari dokumen aktif"
                      style={{
                        border: 0,
                        background: 'transparent',
                        color: '#94A3B8',
                        cursor: 'pointer',
                        padding: 4,
                        borderRadius: 6,
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {/* STATUS & PROGRESS */}
                  <div style={{ marginTop: 14, background: '#F8FAFC', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span
                        style={{
                          fontSize: 11.5,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 6,
                          background: statusBg,
                          color: statusColor,
                          border: `1px solid ${statusBorder}`,
                        }}
                      >
                        {statusLabel}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: isReady ? '#15803D' : '#334155' }}>
                        {comp.completenessPercentage}%
                      </span>
                    </div>

                    <div style={{ width: '100%', height: 6, background: '#E2E8F0', borderRadius: 99, overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${comp.completenessPercentage}%`,
                          height: '100%',
                          background: isReady ? '#16A34A' : '#2563EB',
                          borderRadius: 99,
                        }}
                      />
                    </div>

                    {comp.reason && (
                      <div style={{ fontSize: 11, color: '#64748B', marginTop: 6 }}>
                        {comp.reason}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid #F1F5F9' }}>
                  <div style={{ fontSize: 11, color: '#94A3B8' }}>
                    {def.requirement === 'CORE' ? 'Wajib LPSE' : 'Rekomendasi'}
                  </div>
                  <button
                    onClick={() => setActiveDocumentDef(def)}
                    style={{
                      background: isReady ? '#F0FDF4' : '#EFF6FF',
                      color: isReady ? '#16A34A' : '#2563EB',
                      border: `1px solid ${isReady ? '#BBF7D0' : '#BFDBFE'}`,
                      borderRadius: 7,
                      padding: '7px 16px',
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {actionLabel} <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* WIZARD MODAL */}
      {wizard && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 100, display: 'grid', placeItems: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: 'min(760px, 100%)', padding: 24, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                  {selectionStep === 1 ? 'Pilih Workflow' : selectionStep === 2 ? 'Pilih Dokumen' : 'Konfirmasi Pembuatan Dokumen'}
                </h2>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                  Langkah {selectionStep} dari 3
                </div>
              </div>
              <button onClick={() => setWizard(false)} style={{ border: 0, background: 'none', cursor: 'pointer', color: '#64748B' }}>
                <X size={20} />
              </button>
            </div>

            {selectionStep === 1 && (
              <div style={{ marginTop: 20 }}>
                <p style={{ color: '#64748B', fontSize: 13, marginBottom: 16 }}>Pilih kategori workflow dokumen yang akan dibuat:</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                  {workflows.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => {
                        setSelectedWorkflow(w.id);
                        setSelectionStep(2);
                      }}
                      style={{
                        textAlign: 'left',
                        padding: 16,
                        borderRadius: 12,
                        border: '1px solid #E2E8F0',
                        background: '#fff',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ fontSize: 24, marginBottom: 6 }}>{w.icon}</div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#0F172A' }}>{w.label}</div>
                      <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>{w.description}</div>
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
                  <button onClick={() => setWizard(false)} style={{ padding: '10px 20px', background: '#F1F5F9', borderRadius: 8, border: 0, cursor: 'pointer', fontWeight: 600 }}>
                    Batal
                  </button>
                </div>
              </div>
            )}

            {selectionStep === 2 && (
              <div style={{ marginTop: 20 }}>
                <p style={{ color: '#64748B', fontSize: 13, marginBottom: 16 }}>
                  Pilih dokumen yang ingin ditambahkan ke proyek:
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 420, overflowY: 'auto', paddingRight: 4 }}>
                  {selectedDocumentsList.map((def) => {
                    const isAlreadyCreated = activeRecords.some((r) => r.definitionId === def.id);
                    const isChecked = selectedDocuments.includes(def.id);

                    return (
                      <div
                        key={def.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '12px 16px',
                          border: `1px solid ${isAlreadyCreated ? '#BBF7D0' : isChecked ? '#BFDBFE' : '#E2E8F0'}`,
                          background: isAlreadyCreated ? '#F0FDF4' : isChecked ? '#EFF6FF' : '#fff',
                          borderRadius: 10,
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {isAlreadyCreated && <CheckCircle2 size={16} style={{ color: '#16A34A' }} />}
                            <span style={{ fontWeight: 700, color: '#0F172A' }}>{def.name}</span>
                            {isAlreadyCreated && (
                              <span
                                style={{
                                  background: '#DCFCE7',
                                  color: '#15803D',
                                  fontSize: 11,
                                  fontWeight: 700,
                                  padding: '2px 8px',
                                  borderRadius: 99,
                                }}
                              >
                                Sudah dibuat
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                            {def.description || def.name} ({def.category})
                          </div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                            {def.autoVariables && def.autoVariables.length > 0 && (
                              <span style={{ fontSize: 10.5, background: '#DCFCE7', color: '#15803D', padding: '1px 6px', borderRadius: 4, fontWeight: 650 }}>
                                ✓ Auto: {def.autoVariables.length} data proyek
                              </span>
                            )}
                            {def.userFields && def.userFields.length > 0 && (
                              <span style={{ fontSize: 10.5, background: '#EFF6FF', color: '#2563EB', padding: '1px 6px', borderRadius: 4, fontWeight: 650 }}>
                                ✍️ Input: {def.userFields.length} field
                              </span>
                            )}
                          </div>
                        </div>

                        {isAlreadyCreated ? (
                          <button
                            onClick={() => {
                              setWizard(false);
                              setActiveDocumentDef(def);
                            }}
                            style={{
                              background: '#fff',
                              color: '#16A34A',
                              border: '1px solid #BBF7D0',
                              borderRadius: 7,
                              padding: '6px 14px',
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Buka
                          </button>
                        ) : (
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setSelectedDocuments((prev) =>
                                prev.includes(def.id) ? prev.filter((id) => id !== def.id) : [...prev, def.id]
                              );
                            }}
                            style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#2563EB' }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
                  <button onClick={() => setSelectionStep(1)} style={{ padding: '10px 18px', border: '1px solid #E2E8F0', background: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                    Kembali
                  </button>
                  <button
                    onClick={() => setSelectionStep(3)}
                    disabled={selectedDocuments.length === 0}
                    style={{
                      padding: '10px 22px',
                      background: selectedDocuments.length === 0 ? '#94A3B8' : '#2563EB',
                      color: '#fff',
                      border: 0,
                      borderRadius: 8,
                      cursor: selectedDocuments.length === 0 ? 'not-allowed' : 'pointer',
                      fontWeight: 700,
                    }}
                  >
                    Lanjut ({selectedDocuments.length})
                  </button>
                </div>
              </div>
            )}

            {selectionStep === 3 && (
              <div style={{ marginTop: 20 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Konfirmasi Dokumen Baru</h3>
                <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>
                  Dokumen berikut akan dibuat dan ditambahkan ke daftar Dokumen Proyek aktif Anda:
                </p>
                <div style={{ marginTop: 14, padding: 14, background: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selectedDocuments.map((docId) => {
                    const def = getDocumentDefinition(docId);
                    return (
                      <div key={docId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: '#1E293B' }}>
                        <FileText size={16} style={{ color: '#2563EB' }} />
                        <span>{def?.name || docId}</span>
                        <span style={{ fontSize: 11, color: '#64748B', fontWeight: 400 }}>({def?.category || 'PROYEK'})</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
                  <button onClick={() => setSelectionStep(2)} style={{ padding: '10px 18px', border: '1px solid #E2E8F0', background: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                    Kembali
                  </button>
                  <button
                    onClick={handleCreateDocuments}
                    style={{
                      padding: '10px 26px',
                      background: '#16A34A',
                      color: '#fff',
                      border: 0,
                      borderRadius: 8,
                      cursor: 'pointer',
                      fontWeight: 700,
                      boxShadow: '0 2px 8px rgba(22,163,74,0.25)',
                    }}
                  >
                    Buat Dokumen
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI DOCUMENT PACKAGE WIZARD MODAL */}
      <DocumentPackageWizardModal
        isOpen={isAiWizardOpen}
        onClose={() => setIsAiWizardOpen(false)}
        currentProject={activeProject}
        rabItems={rabItems}
        scheduleTasks={scheduleTasks}
        kurvaSData={kurvaSData}
        onCompletePackage={() => {
          reloadActiveRecords();
          setIsAiWizardOpen(false);
        }}
        onNavigateToTab={(tab) => {
          if (tab === 'dokumen-tender') {
            reloadActiveRecords();
          }
        }}
      />
    </div>
  );
};

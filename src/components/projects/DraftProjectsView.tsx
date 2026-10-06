import React, { useState } from 'react';
import {
  FileText,
  Plus,
  Sparkles,
  Search,
  CheckCircle2,
  Circle,
  ArrowRight,
  Rocket,
  Copy,
  Trash2,
  Upload,
  Layers,
  HelpCircle,
  AlertCircle,
  FileCheck2,
  Coins,
  MapPin,
  Calendar,
} from 'lucide-react';
import { Project } from '../../types';
import docEmptyImg from '../../assets/proyek-doc-empty.png';
import { useProject } from '../../context/ProjectContext';
import { DeleteProjectModal } from './DeleteProjectModal';

interface DraftProjectsViewProps {
  projects: Project[];
  onCreateProject: () => void;
  onOpenMagicAi: () => void;
  onNavigateToTab?: (tab: string) => void;
  onOpenProject?: (projectId: string, menu?: string) => void;
}

export const DraftProjectsView: React.FC<DraftProjectsViewProps> = ({
  projects,
  onCreateProject,
  onOpenMagicAi,
  onNavigateToTab,
  onOpenProject,
}) => {
  const { updateProject, deleteProject, backupProjectData, createProject } = useProject();
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const draftProjects = projects.filter(
    (p) => p.status === 'draft' || !p.status || p.status === 'DRAFT'
  );

  const formatRupiah = (val: number) => {
    return 'Rp ' + (val || 0).toLocaleString('id-ID');
  };

  const filteredDrafts = draftProjects.filter((p) => {
    if (!searchQuery.trim()) return true;
    return (
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.clientName || p.client || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.location || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const totalDraftValue = draftProjects.reduce(
    (acc, p) => acc + (p.totalRab || p.costSummary?.grandTotal || 0),
    0
  );

  // Compute draft readiness score for each project (0 to 100%)
  const getDraftReadiness = (p: Project) => {
    let score = 25; // Base info
    if (p.location && (p.clientName || p.client)) score += 25;
    if (p.totalRab && p.totalRab > 0) score += 25;
    if (p.sections && p.sections.length > 0) score += 25;
    return Math.min(100, score);
  };

  const handlePublishToInProgress = (proj: Project) => {
    if (
      window.confirm(
        `Apakah Anda yakin ingin mempublikasikan "${proj.name}" ke status SEDANG DIKERJAKAN? Proyek akan masuk ke pemantauan Kurva S dan pelaksanaan lapangan.`
      )
    ) {
      updateProject(proj.id, {
        status: 'in_progress',
        progress: proj.progress && proj.progress > 0 ? proj.progress : 5,
        startDate: proj.startDate || new Date().toISOString().split('T')[0],
      });
      alert(`Proyek "${proj.name}" berhasil dipindahkan ke status Sedang Dikerjakan.`);
    }
  };

  const handleDuplicateDraft = (proj: Project) => {
    const newProj = createProject({
      name: `${proj.name} (Salinan Draft)`,
      clientName: proj.clientName || proj.client,
      location: proj.location,
      buildingType: proj.buildingType,
      status: 'draft',
      totalRab: proj.totalRab,
      costSummary: proj.costSummary,
      sections: proj.sections,
    });
    alert(`Draft berhasil diduplikasi: "${newProj.name}"`);
  };

  const handleDeleteDraft = (proj: Project) => {
    setProjectToDelete(proj);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. TOP SPECIALIZED DRAFT KPIS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '14px',
        }}
      >
        {/* KPI 1: Total Draft */}
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
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: '#FEF3C7',
                  color: '#D97706',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <FileText size={16} />
              </div>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748B' }}>Draft Proyek</span>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
              {draftProjects.length} <span style={{ fontSize: '13px', color: '#94A3B8', fontWeight: 500 }}>Rancangan</span>
            </div>
            <div style={{ fontSize: '11px', color: '#B45309', fontWeight: 600, marginTop: '2px' }}>
              Tahap Pra-Konstruksi & Estimasi
            </div>
          </div>
          <div style={{ width: '56px', height: '32px', opacity: 0.8 }}>
            <svg viewBox="0 0 56 32" style={{ width: '100%', height: '100%' }}>
              <path d="M 0 20 Q 20 8, 35 18 T 56 6" fill="none" stroke="#FDE68A" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* KPI 2: Potensi Nilai Draft */}
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
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: '#EFF6FF',
                  color: '#2563EB',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '12px',
                }}
              >
                Rp
              </div>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748B' }}>Potensi Nilai Penawaran</span>
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
              {totalDraftValue === 0 ? 'Rp 0' : formatRupiah(totalDraftValue)}
            </div>
            <div style={{ fontSize: '11px', color: '#2563EB', fontWeight: 600, marginTop: '2px' }}>
              Estimasi total pra-persetujuan
            </div>
          </div>
        </div>

        {/* KPI 3: Draft Siap Diajukan */}
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
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: '#ECFDF5',
                  color: '#059669',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <FileCheck2 size={16} />
              </div>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748B' }}>Siap Diajukan</span>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
              {draftProjects.filter((p) => getDraftReadiness(p) >= 75).length}{' '}
              <span style={{ fontSize: '13px', color: '#94A3B8', fontWeight: 500 }}>Draft</span>
            </div>
            <div style={{ fontSize: '11px', color: '#059669', fontWeight: 600, marginTop: '2px' }}>
              Kelengkapan data ≥ 75%
            </div>
          </div>
        </div>

        {/* KPI 4: Akselerasi Template Rumah */}
        <div
          style={{
            background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
            borderRadius: '16px',
            padding: '16px 20px',
            color: '#FFFFFF',
            boxShadow: '0 2px 8px rgba(15,23,42,0.15)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#94A3B8' }}>Template Cepat</span>
            <span style={{ fontSize: '10px', background: '#3B82F6', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
              Katalog Tipe
            </span>
          </div>
          <div style={{ fontSize: '14px', fontWeight: 700, lineHeight: 1.3 }}>
            Tipe 36, 45, 70, Ruko & Kost
          </div>
          <button
            onClick={() => onNavigateToTab?.('template-rab')}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: '#FFFFFF',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            Buka Katalog Template →
          </button>
        </div>
      </div>

      {/* 2. DRAFT WORKSPACE BANNER: AI ACCELERATOR */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '18px',
          border: '1px solid #E2E8F0',
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
        }}
      >
        <div style={{ maxWidth: '560px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#D97706', fontSize: '11.5px', fontWeight: 750, marginBottom: '6px' }}>
            <Sparkles size={14} />
            <span>AKSELERASI DRAFT DENGAN AI</span>
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: '0 0 4px 0' }}>
            Ubah Denah Sketsa & Gambar Kerja Menjadi Draft RAB Siap Pakai
          </h3>
          <p style={{ fontSize: '12.5px', color: '#64748B', margin: 0, lineHeight: 1.5 }}>
            Cukup unggah file PDF/CAD atau ketik deskripsi ruangan. Magic AI akan mengisi daftar pekerjaan, volume QTO, dan analisa harga satuan (AHSP) otomatis.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={onOpenMagicAi}
            style={{
              height: '36px',
              padding: '0 16px',
              borderRadius: '8px',
              background: '#2563EB',
              color: '#FFFFFF',
              fontSize: '12px',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(37,99,235,0.2)',
            }}
          >
            <Sparkles size={14} />
            <span>Generate Draft Baru (AI)</span>
          </button>
          <button
            onClick={onCreateProject}
            style={{
              height: '36px',
              padding: '0 14px',
              borderRadius: '8px',
              background: '#F8FAFC',
              border: '1px solid #CBD5E1',
              color: '#334155',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Plus size={14} />
            <span>+ Buat Draft Manual</span>
          </button>
        </div>
      </div>

      {/* 3. DRAFT SEARCH & FILTER TOOLBAR */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#ffffff',
          padding: '12px 16px',
          borderRadius: '12px',
          border: '1px solid #EEF2F7',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div style={{ position: 'relative', width: '100%', maxWidth: '340px' }}>
          <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '11px' }} />
          <input
            type="text"
            placeholder="Cari draft proyek..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              height: '36px',
              paddingLeft: '34px',
              paddingRight: '12px',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
              background: '#F8FAFC',
              fontSize: '12.5px',
              color: '#0F172A',
              outline: 'none',
            }}
          />
        </div>

        <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>
          Menampilkan <span style={{ color: '#0F172A', fontWeight: 800 }}>{filteredDrafts.length}</span> rancangan draft
        </div>
      </div>

      {/* 4. DRAFT CARDS LIST WITH PRE-CONSTRUCTION READINESS CHECKLIST */}
      {filteredDrafts.length === 0 ? (
        <div
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #EEF2F7',
            padding: '48px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <img
            src={docEmptyImg}
            alt="No Drafts"
            style={{ width: '140px', maxHeight: '100px', objectFit: 'contain', marginBottom: '14px', opacity: 0.85 }}
          />
          <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0' }}>
            Belum ada draft proyek tersimpan
          </h3>
          <p style={{ fontSize: '12.5px', color: '#64748B', maxWidth: '380px', margin: '0 0 16px 0', lineHeight: 1.5 }}>
            Buat rancangan proyek baru, susun estimasi RAB dan perhitungan volume tanpa khawatir memengaruhi proyek yang sedang berjalan.
          </p>
          <button
            onClick={onCreateProject}
            style={{
              padding: '8px 16px',
              background: '#2563EB',
              color: '#FFFFFF',
              borderRadius: '8px',
              border: 'none',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            + Buat Draft Proyek Pertama
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
            gap: '16px',
          }}
        >
          {filteredDrafts.map((proj) => {
            const readiness = getDraftReadiness(proj);
            const totalCost = proj.totalRab || proj.costSummary?.grandTotal || 0;

            return (
              <div
                key={proj.id}
                style={{
                  background: '#ffffff',
                  borderRadius: '16px',
                  border: '1px solid #EEF2F7',
                  padding: '18px',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '14px',
                }}
              >
                <div>
                  {/* Header: Badge & Readiness Score */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        background: '#FEF3C7',
                        color: '#B45309',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontWeight: 700,
                      }}
                    >
                      📝 DRAFT ESTIMASI
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: readiness >= 75 ? '#059669' : '#D97706',
                      }}
                    >
                      Kesiapan Data: {readiness}%
                    </span>
                  </div>

                  {/* Title & Info */}
                  <h4
                    onClick={() => onOpenProject?.(proj.id, 'rab-estimasi')}
                    style={{
                      fontSize: '15px',
                      fontWeight: 800,
                      color: '#0F172A',
                      margin: '0 0 4px 0',
                      cursor: 'pointer',
                      lineHeight: 1.3,
                    }}
                  >
                    {proj.name}
                  </h4>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748B', marginBottom: '12px' }}>
                    <MapPin size={12} color="#94A3B8" />
                    <span>{proj.location || 'Lokasi belum dispesifikasikan'}</span>
                    <span>•</span>
                    <span>{proj.clientName || proj.client || 'Klien Draft'}</span>
                  </div>

                  {/* Checklist Kelengkapan Pra-Konstruksi */}
                  <div
                    style={{
                      background: '#F8FAFC',
                      borderRadius: '10px',
                      padding: '10px 12px',
                      border: '1px solid #E2E8F0',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      fontSize: '11.5px',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: '#334155', marginBottom: '2px' }}>
                      Checklist Kesiapan Proposal:
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: proj.location ? '#059669' : '#94A3B8' }}>
                      {proj.location ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                      <span>Informasi Lokasi & Klien</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: proj.buildingType ? '#059669' : '#94A3B8' }}>
                      {proj.buildingType ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                      <span>Tipe Bangunan & Spesifikasi ({proj.buildingType || 'Belum dipilih'})</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: totalCost > 0 ? '#059669' : '#94A3B8' }}>
                      {totalCost > 0 ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                      <span>Estimasi Nilai RAB ({formatRupiah(totalCost)})</span>
                    </div>
                  </div>
                </div>

                {/* Bottom Action Strip */}
                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '10.5px', color: '#94A3B8' }}>Rencana Anggaran (RAB)</div>
                      <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>
                        {formatRupiah(totalCost)}
                      </div>
                    </div>

                    {/* Launch / Publish Button */}
                    <button
                      onClick={() => handlePublishToInProgress(proj)}
                      title="Mulai proyek dan ubah status ke Sedang Dikerjakan"
                      style={{
                        height: '32px',
                        padding: '0 12px',
                        borderRadius: '8px',
                        background: '#10B981',
                        color: '#FFFFFF',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 6px rgba(16,185,129,0.25)',
                      }}
                    >
                      <Rocket size={13} />
                      <span>Jadikan Proyek Berjalan</span>
                    </button>
                  </div>

                  {/* Secondary Edit & Utility Toolbar */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => onOpenProject?.(proj.id, 'qto')}
                        style={{
                          height: '28px',
                          padding: '0 8px',
                          borderRadius: '6px',
                          background: '#F1F5F9',
                          border: '1px solid #CBD5E1',
                          fontSize: '11px',
                          fontWeight: 600,
                          color: '#334155',
                          cursor: 'pointer',
                        }}
                      >
                        📐 Hitung QTO
                      </button>
                      <button
                        onClick={() => onOpenProject?.(proj.id, 'rab-estimasi')}
                        style={{
                          height: '28px',
                          padding: '0 8px',
                          borderRadius: '6px',
                          background: '#EFF6FF',
                          border: '1px solid #BFDBFE',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#2563EB',
                          cursor: 'pointer',
                        }}
                      >
                        📊 Susun RAB
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={() => handleDuplicateDraft(proj)}
                        title="Duplikat Draft Ini"
                        style={{
                          height: '28px',
                          width: '28px',
                          borderRadius: '6px',
                          background: '#F8FAFC',
                          border: '1px solid #E2E8F0',
                          color: '#64748B',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <Copy size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteDraft(proj)}
                        title="Hapus Draft Ini"
                        style={{
                          height: '28px',
                          width: '28px',
                          borderRadius: '6px',
                          background: '#FEF2F2',
                          border: '1px solid #FECACA',
                          color: '#DC2626',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Draft Project Confirmation & Backup Modal */}
      <DeleteProjectModal
        isOpen={!!projectToDelete}
        project={projectToDelete}
        onClose={() => setProjectToDelete(null)}
        onConfirmDelete={(id) => deleteProject(id)}
        onBackupProject={(id) => backupProjectData(id)}
      />
    </div>
  );
};

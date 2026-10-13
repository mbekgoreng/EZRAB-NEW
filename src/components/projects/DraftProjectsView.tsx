import React, { useState } from 'react';
import {
  Plus,
  Sparkles,
  Search,
  CheckCircle2,
  Circle,
  Rocket,
  Copy,
  Trash2,
  MapPin,
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <style>{`
        @keyframes ezdb-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .ezdb-anim { animation: none !important; } }
      `}</style>
      {/* 1. TOP SPECIALIZED DRAFT KPIS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '18px',
        }}
      >
        {/* KPI 1: Total Draft */}
        <div className="ezdb-anim ez-stat ez-stat-cream" style={{ animation: 'ezdb-rise 0.6s 0.05s both' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#6B6B64', marginBottom: '8px' }}>
            Draft Proyek
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: '#141412' }}>
            {draftProjects.length}{' '}
            <span style={{ fontSize: '13px', color: '#8A8A84', fontWeight: 500, letterSpacing: '0' }}>Rancangan</span>
          </div>
          <div style={{ fontSize: '12px', color: '#6B6B64', marginTop: '6px' }}>
            Tahap Pra-Konstruksi & Estimasi
          </div>
        </div>

        {/* KPI 2: Potensi Nilai Draft */}
        <div className="ezdb-anim ez-stat ez-stat-mint" style={{ animation: 'ezdb-rise 0.6s 0.12s both' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#6B6B64', marginBottom: '8px' }}>
            Potensi Nilai Penawaran
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: '#141412' }}>
            {totalDraftValue === 0 ? 'Rp 0' : formatRupiah(totalDraftValue)}
          </div>
          <div style={{ fontSize: '12px', color: '#6B6B64', marginTop: '6px' }}>
            Estimasi total pra-persetujuan
          </div>
        </div>

        {/* KPI 3: Draft Siap Diajukan */}
        <div className="ezdb-anim ez-stat ez-stat-sky" style={{ animation: 'ezdb-rise 0.6s 0.19s both' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#6B6B64', marginBottom: '8px' }}>
            Siap Diajukan
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: '#141412' }}>
            {draftProjects.filter((p) => getDraftReadiness(p) >= 75).length}{' '}
            <span style={{ fontSize: '13px', color: '#8A8A84', fontWeight: 500, letterSpacing: '0' }}>Draft</span>
          </div>
          <div style={{ fontSize: '12px', color: '#6B6B64', marginTop: '6px' }}>
            Kelengkapan data ≥ 75%
          </div>
        </div>

        {/* KPI 4: Akselerasi Template Rumah */}
        <div className="ezdb-anim ez-stat ez-stat-peach" style={{ animation: 'ezdb-rise 0.6s 0.26s both' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#6B6B64', marginBottom: '8px' }}>
            Template Cepat
          </div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#141412', lineHeight: 1.4, marginBottom: '10px' }}>
            Tipe 36, 45, 70, Ruko & Kost
          </div>
          <button
            onClick={() => onNavigateToTab?.('template-rab')}
            style={{
              background: '#2563EB',
              border: 'none',
              color: '#FFFFFF',
              borderRadius: '12px',
              padding: '9px 16px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Buka Katalog Template →
          </button>
        </div>
      </div>

      {/* 2. DRAFT WORKSPACE BANNER: AI ACCELERATOR */}
      <div
        className="ezdb-anim"
        style={{
          background: '#FFFFFF',
          borderRadius: '22px',
          border: '1px solid #EEF1F6',
          boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
          padding: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          animation: 'ezdb-rise 0.6s 0.3s both',
        }}
      >
        <div style={{ maxWidth: '560px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#A8780A', fontSize: '11.5px', fontWeight: 750, marginBottom: '6px' }}>
            <Sparkles size={14} />
            <span>AKSELERASI DRAFT DENGAN AI</span>
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#141412', margin: '0 0 4px 0' }}>
            Ubah Denah Sketsa & Gambar Kerja Menjadi Draft RAB Siap Pakai
          </h3>
          <p style={{ fontSize: '13px', color: '#6B6B64', margin: 0, lineHeight: 1.5 }}>
            Cukup unggah file PDF/CAD atau ketik deskripsi ruangan. Magic AI akan mengisi daftar pekerjaan, volume QTO, dan analisa harga satuan (AHSP) otomatis.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={onOpenMagicAi}
            style={{
              height: '40px',
              padding: '0 18px',
              borderRadius: '12px',
              background: '#2563EB',
              color: '#FFFFFF',
              fontSize: '14px',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(37,99,235,0.28)',
            }}
          >
            <Sparkles size={14} />
            <span>Generate Draft Baru (AI)</span>
          </button>
          <button
            onClick={onCreateProject}
            style={{
              height: '40px',
              padding: '0 16px',
              borderRadius: '12px',
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              color: '#141412',
              fontSize: '14px',
              fontWeight: 700,
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
        className="ezdb-anim"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#FFFFFF',
          padding: '16px 20px',
          borderRadius: '22px',
          border: '1px solid #EEF1F6',
          boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
          flexWrap: 'wrap',
          gap: '10px',
          animation: 'ezdb-rise 0.6s 0.36s both',
        }}
      >
        <div style={{ position: 'relative', width: '100%', maxWidth: '340px' }}>
          <Search size={14} color="#8A8A84" style={{ position: 'absolute', left: '12px', top: '12px' }} />
          <input
            type="text"
            placeholder="Cari draft proyek..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              height: '38px',
              paddingLeft: '34px',
              paddingRight: '12px',
              borderRadius: '12px',
              border: '1px solid #EEF1F6',
              background: '#FAFAF8',
              fontSize: '13px',
              color: '#141412',
              outline: 'none',
            }}
          />
        </div>

        <div style={{ fontSize: '12px', color: '#6B6B64', fontWeight: 600 }}>
          Menampilkan <span style={{ color: '#141412', fontWeight: 800 }}>{filteredDrafts.length}</span> rancangan draft
        </div>
      </div>

      {/* 4. DRAFT CARDS LIST WITH PRE-CONSTRUCTION READINESS CHECKLIST */}
      {filteredDrafts.length === 0 ? (
        <div
          className="ezdb-anim"
          style={{
            background: '#FFFFFF',
            borderRadius: '22px',
            border: '1px solid #EEF1F6',
            boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
            padding: '48px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'ezdb-rise 0.6s 0.42s both',
          }}
        >
          <img
            src={docEmptyImg}
            alt="No Drafts"
            style={{ width: '140px', maxHeight: '100px', objectFit: 'contain', marginBottom: '14px', opacity: 0.85 }}
          />
          <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#141412', margin: '0 0 6px 0' }}>
            Belum ada draft proyek tersimpan
          </h3>
          <p style={{ fontSize: '13px', color: '#6B6B64', maxWidth: '380px', margin: '0 0 16px 0', lineHeight: 1.5 }}>
            Buat rancangan proyek baru, susun estimasi RAB dan perhitungan volume tanpa khawatir memengaruhi proyek yang sedang berjalan.
          </p>
          <button
            onClick={onCreateProject}
            style={{
              height: '40px',
              padding: '0 20px',
              background: '#2563EB',
              color: '#FFFFFF',
              borderRadius: '12px',
              border: 'none',
              fontSize: '14px',
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
            gap: '18px',
          }}
        >
          {filteredDrafts.map((proj) => {
            const readiness = getDraftReadiness(proj);
            const totalCost = proj.totalRab || proj.costSummary?.grandTotal || 0;

            return (
              <div
                key={proj.id}
                className="ezdb-anim"
                style={{
                  background: '#FFFFFF',
                  borderRadius: '22px',
                  border: '1px solid #EEF1F6',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.045)',
                  padding: '22px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '14px',
                  animation: 'ezdb-rise 0.6s 0.42s both',
                }}
              >
                <div>
                  {/* Header: Badge & Readiness Score */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '5px 12px',
                        borderRadius: '999px',
                        background: '#FDF3D8',
                        color: '#A8780A',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      DRAFT ESTIMASI
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: readiness >= 75 ? '#2C6E2C' : '#A8780A',
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
                      color: '#141412',
                      margin: '0 0 4px 0',
                      cursor: 'pointer',
                      lineHeight: 1.3,
                    }}
                  >
                    {proj.name}
                  </h4>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#6B6B64', marginBottom: '12px' }}>
                    <MapPin size={12} color="#8A8A84" />
                    <span>{proj.location || 'Lokasi belum dispesifikasikan'}</span>
                    <span>•</span>
                    <span>{proj.clientName || proj.client || 'Klien Draft'}</span>
                  </div>

                  {/* Checklist Kelengkapan Pra-Konstruksi */}
                  <div
                    style={{
                      background: '#FAFAF8',
                      borderRadius: '12px',
                      padding: '10px 12px',
                      border: '1px solid #EEF1F6',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      fontSize: '11.5px',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: '#141412', marginBottom: '2px' }}>
                      Checklist Kesiapan Proposal:
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: proj.location ? '#2C6E2C' : '#8A8A84' }}>
                      {proj.location ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                      <span>Informasi Lokasi & Klien</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: proj.buildingType ? '#2C6E2C' : '#8A8A84' }}>
                      {proj.buildingType ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                      <span>Tipe Bangunan & Spesifikasi ({proj.buildingType || 'Belum dipilih'})</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: totalCost > 0 ? '#2C6E2C' : '#8A8A84' }}>
                      {totalCost > 0 ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                      <span>Estimasi Nilai RAB ({formatRupiah(totalCost)})</span>
                    </div>
                  </div>
                </div>

                {/* Bottom Action Strip */}
                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '10.5px', color: '#8A8A84' }}>Rencana Anggaran (RAB)</div>
                      <div style={{ fontSize: '15px', fontWeight: 800, color: '#141412' }}>
                        {formatRupiah(totalCost)}
                      </div>
                    </div>

                    {/* Launch / Publish Button */}
                    <button
                      onClick={() => handlePublishToInProgress(proj)}
                      title="Mulai proyek dan ubah status ke Sedang Dikerjakan"
                      style={{
                        height: '36px',
                        padding: '0 14px',
                        borderRadius: '12px',
                        background: '#16A34A',
                        color: '#FFFFFF',
                        fontSize: '13px',
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 4px 14px rgba(22,163,74,0.28)',
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
                          height: '32px',
                          padding: '0 12px',
                          borderRadius: '12px',
                          background: '#FFFFFF',
                          border: '1px solid #E2E8F0',
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#141412',
                          cursor: 'pointer',
                        }}
                      >
                        Hitung QTO
                      </button>
                      <button
                        onClick={() => onOpenProject?.(proj.id, 'rab-estimasi')}
                        style={{
                          height: '32px',
                          padding: '0 12px',
                          borderRadius: '12px',
                          background: '#E3EEFB',
                          border: 'none',
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#2456A8',
                          cursor: 'pointer',
                        }}
                      >
                        Susun RAB
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={() => handleDuplicateDraft(proj)}
                        title="Duplikat Draft Ini"
                        style={{
                          height: '32px',
                          width: '32px',
                          borderRadius: '12px',
                          background: '#FAFAF8',
                          border: '1px solid #EEF1F6',
                          color: '#6B6B64',
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
                          height: '32px',
                          width: '32px',
                          borderRadius: '12px',
                          background: '#FCE9E9',
                          border: '1px solid #F5D5D5',
                          color: '#B54747',
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

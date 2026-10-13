import React, { useState } from 'react';
import {
  Archive,
  RotateCcw,
  Download,
  Trash2,
  Search,
  MapPin,
} from 'lucide-react';
import { Project } from '../../types';
import { useProject } from '../../context/ProjectContext';
import { DeleteProjectModal } from './DeleteProjectModal';

interface ArchivedProjectsViewProps {
  projects: Project[];
  onCreateProject: () => void;
  onOpenMagicAi: () => void;
  onNavigateToTab?: (tab: string) => void;
  onOpenProject?: (projectId: string, menu?: string) => void;
}

export const ArchivedProjectsView: React.FC<ArchivedProjectsViewProps> = ({
  projects,
  onCreateProject,
  onOpenMagicAi,
  onNavigateToTab,
  onOpenProject,
}) => {
  const { updateProject, deleteProject, backupProjectData } = useProject();
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [yearFilter, setYearFilter] = useState<string>('all');

  const archivedProjects = projects.filter(
    (p) => p.status === 'archived' || p.isArchived
  );

  const formatRupiah = (val: number) => {
    return 'Rp ' + (val || 0).toLocaleString('id-ID');
  };

  const filteredProjects = archivedProjects.filter((p) => {
    const matchesSearch =
      !searchQuery.trim() ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.clientName || p.client || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.location || '').toLowerCase().includes(searchQuery.toLowerCase());

    const projectYear = p.createdAt ? new Date(p.createdAt).getFullYear().toString() : '2026';
    const matchesYear = yearFilter === 'all' || projectYear === yearFilter;

    return matchesSearch && matchesYear;
  });

  const totalArchivedValue = archivedProjects.reduce(
    (acc, p) => acc + (p.totalRab || p.costSummary?.grandTotal || 0),
    0
  );

  const handleRestoreProject = (proj: Project) => {
    if (
      window.confirm(
        `Pulihkan proyek "${proj.name}" kembali ke status aktif (Sedang Dikerjakan)? Proyek akan muncul kembali di daftar proyek aktif.`
      )
    ) {
      updateProject(proj.id, {
        status: 'in_progress',
        isArchived: false,
      });
      alert(`Proyek "${proj.name}" berhasil dipulihkan ke Proyek Aktif.`);
    }
  };

  const handleDeletePermanent = (proj: Project) => {
    setProjectToDelete(proj);
  };

  const handleExportArchiveBundle = (proj: Project) => {
    alert(`Mengunduh paket arsip digital untuk "${proj.name}" (RAB Spreadsheet, BoQ, dan Dokumen Laporan).`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' , fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif" }}>
      <style>{`
        @keyframes ezdb-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .ezdb-anim { animation: none !important; } }
      `}</style>
      {/* 1. TOP 4 ARCHIVE VAULT KPIS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '18px',
        }}
      >
        {/* KPI 1: Total Proyek Diarsipkan */}
        <div className="ezdb-anim ez-stat ez-stat-sky" style={{ animation: 'ezdb-rise 0.6s 0.05s both' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#6B6B64', marginBottom: '8px' }}>
            Total Berkas Arsip
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: '#141412' }}>
            {archivedProjects.length}{' '}
            <span style={{ fontSize: '13px', color: '#8A8A84', fontWeight: 500, letterSpacing: '0' }}>Proyek</span>
          </div>
          <div style={{ fontSize: '12px', color: '#6B6B64', marginTop: '6px' }}>
            Tersimpan dalam Cold Vault
          </div>
        </div>

        {/* KPI 2: Total Nilai Historis */}
        <div className="ezdb-anim ez-stat ez-stat-cream" style={{ animation: 'ezdb-rise 0.6s 0.12s both' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#6B6B64', marginBottom: '8px' }}>
            Total Nilai Arsip
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: '#141412' }}>
            {totalArchivedValue === 0 ? 'Rp 0' : formatRupiah(totalArchivedValue)}
          </div>
          <div style={{ fontSize: '12px', color: '#6B6B64', marginTop: '6px' }}>
            Rekam jejak nilai proyek
          </div>
        </div>

        {/* KPI 3: Benchmark Database Referensi */}
        <div className="ezdb-anim ez-stat ez-stat-mint" style={{ animation: 'ezdb-rise 0.6s 0.19s both' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#6B6B64', marginBottom: '8px' }}>
            Benchmark Harga
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: '#2C6E2C' }}>
            Aktif
          </div>
          <div style={{ fontSize: '12px', color: '#6B6B64', marginTop: '6px' }}>
            Dapat dijadikan referensi AHSP baru
          </div>
        </div>

        {/* KPI 4: Status Keamanan Vault */}
        <div className="ezdb-anim ez-stat ez-stat-peach" style={{ animation: 'ezdb-rise 0.6s 0.26s both' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#6B6B64', marginBottom: '8px' }}>
            Enkripsi & Keamanan
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: '#141412' }}>
            100% Aman
          </div>
          <div style={{ fontSize: '12px', color: '#6B6B64', marginTop: '6px' }}>
            Backup Cloud & Restore Instant
          </div>
        </div>
      </div>

      {/* 2. SEARCH & YEAR FILTER BAR */}
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
          gap: '12px',
          animation: 'ezdb-rise 0.6s 0.3s both',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '240px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '320px' }}>
            <Search size={14} color="#8A8A84" style={{ position: 'absolute', left: '12px', top: '12px' }} />
            <input
              type="text"
              placeholder="Cari berkas arsip..."
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

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {['all', '2026', '2025', '2024'].map((year) => (
              <button
                key={year}
                onClick={() => setYearFilter(year)}
                style={{
                  height: '32px',
                  padding: '0 12px',
                  borderRadius: '999px',
                  fontSize: '12px',
                  fontWeight: yearFilter === year ? 700 : 600,
                  background: yearFilter === year ? '#E3EEFB' : '#FAFAF8',
                  color: yearFilter === year ? '#2456A8' : '#6B6B64',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {year === 'all' ? 'Semua Tahun' : year}
              </button>
            ))}
          </div>
        </div>

        <div style={{ fontSize: '12.5px', color: '#6B6B64', fontWeight: 600 }}>
          Menampilkan <span style={{ color: '#141412', fontWeight: 800 }}>{filteredProjects.length}</span> berkas arsip
        </div>
      </div>

      {/* 3. ARCHIVED PROJECTS LIST */}
      {filteredProjects.length === 0 ? (
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
            animation: 'ezdb-rise 0.6s 0.36s both',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '18px',
              background: '#F1F5F9',
              color: '#64748B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '14px',
            }}
          >
            <Archive size={26} />
          </div>
          <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#141412', margin: '0 0 6px 0' }}>
            Gudang Arsip Kosong
          </h3>
          <p style={{ fontSize: '13px', color: '#6B6B64', maxWidth: '380px', margin: '0 0 16px 0', lineHeight: 1.5 }}>
            Proyek yang telah selesai dapat dipindahkan ke arsip untuk merapikan ruang kerja Anda dan tetap tersimpan sebagai data historis.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
            gap: '18px',
          }}
        >
          {filteredProjects.map((proj) => {
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
                  animation: 'ezdb-rise 0.6s 0.36s both',
                }}
              >
                <div>
                  {/* Card Header: Code & Archive Watermark Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '5px 12px',
                        borderRadius: '999px',
                        background: '#E3EEFB',
                        color: '#2456A8',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {proj.projectNumber || proj.id}
                    </span>

                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '5px 12px',
                        borderRadius: '999px',
                        background: '#F1F5F9',
                        color: '#64748B',
                        whiteSpace: 'nowrap',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Archive size={11} />
                      <span>ARSIP HISTORIS</span>
                    </span>
                  </div>

                  {/* Title */}
                  <h4
                    style={{
                      fontSize: '15px',
                      fontWeight: 800,
                      color: '#141412',
                      margin: '0 0 4px 0',
                      lineHeight: 1.3,
                    }}
                  >
                    {proj.name}
                  </h4>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#6B6B64', marginBottom: '12px' }}>
                    <MapPin size={12} color="#8A8A84" />
                    <span>{proj.location || 'Indonesia'}</span>
                    <span>•</span>
                    <span>{proj.clientName || proj.client || 'Klien'}</span>
                  </div>

                  {/* Summary Box */}
                  <div
                    style={{
                      background: '#FAFAF8',
                      borderRadius: '12px',
                      padding: '10px 12px',
                      border: '1px solid #EEF1F6',
                      fontSize: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6B6B64' }}>
                      <span>Nilai Historis RAB:</span>
                      <span style={{ fontWeight: 700, color: '#141412' }}>{formatRupiah(totalCost)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6B6B64' }}>
                      <span>Tipe Bangunan:</span>
                      <span style={{ fontWeight: 600, color: '#141412' }}>{proj.buildingType || 'Umum'}</span>
                    </div>
                  </div>
                </div>

                {/* Bottom Action Strip: Restore, Download, Delete Permanent */}
                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <button
                    onClick={() => handleRestoreProject(proj)}
                    style={{
                      height: '36px',
                      padding: '0 16px',
                      borderRadius: '12px',
                      background: '#2563EB',
                      color: '#FFFFFF',
                      fontSize: '13px',
                      fontWeight: 700,
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 4px 14px rgba(37,99,235,0.28)',
                    }}
                  >
                    <RotateCcw size={13} />
                    <span>Pulihkan Proyek</span>
                  </button>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => handleExportArchiveBundle(proj)}
                      title="Unduh Berkas Arsip"
                      style={{
                        height: '36px',
                        padding: '0 12px',
                        borderRadius: '12px',
                        background: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        color: '#141412',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Download size={13} />
                      <span>Export</span>
                    </button>

                    <button
                      onClick={() => handleDeletePermanent(proj)}
                      title="Hapus Permanen"
                      style={{
                        height: '36px',
                        width: '36px',
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
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Archive Project Confirmation & Backup Modal */}
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

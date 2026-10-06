import React, { useState } from 'react';
import {
  Archive,
  RotateCcw,
  Download,
  Trash2,
  Search,
  Lock,
  Database,
  Calendar,
  Layers,
  MapPin,
  Sparkles,
  FileSpreadsheet,
  Coins,
  History,
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. TOP 4 ARCHIVE VAULT KPIS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '14px',
        }}
      >
        {/* KPI 1: Total Proyek Diarsipkan */}
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
                  background: '#F1F5F9',
                  color: '#475569',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Archive size={16} />
              </div>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748B' }}>Total Berkas Arsip</span>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
              {archivedProjects.length} <span style={{ fontSize: '13px', color: '#94A3B8', fontWeight: 500 }}>Proyek</span>
            </div>
            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>
              Tersimpan dalam Cold Vault
            </div>
          </div>
          <div style={{ width: '56px', height: '32px', opacity: 0.8 }}>
            <svg viewBox="0 0 56 32" style={{ width: '100%', height: '100%' }}>
              <path d="M 0 15 Q 15 25, 35 10 T 56 12" fill="none" stroke="#CBD5E1" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* KPI 2: Total Nilai Historis */}
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
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748B' }}>Total Nilai Arsip</span>
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
              {totalArchivedValue === 0 ? 'Rp 0' : formatRupiah(totalArchivedValue)}
            </div>
            <div style={{ fontSize: '11px', color: '#2563EB', fontWeight: 600, marginTop: '2px' }}>
              Rekam jejak nilai proyek
            </div>
          </div>
        </div>

        {/* KPI 3: Benchmark Database Referensi */}
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
                <Database size={16} />
              </div>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748B' }}>Benchmark Harga</span>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#059669', letterSpacing: '-0.02em' }}>
              Aktif
            </div>
            <div style={{ fontSize: '11px', color: '#059669', fontWeight: 600, marginTop: '2px' }}>
              Dapat dijadikan referensi AHSP baru
            </div>
          </div>
        </div>

        {/* KPI 4: Status Keamanan Vault */}
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
                  background: '#F8FAFC',
                  color: '#334155',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Lock size={16} />
              </div>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748B' }}>Enkripsi & Keamanan</span>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
              100% Aman
            </div>
            <div style={{ fontSize: '11px', color: '#16A34A', fontWeight: 600, marginTop: '2px' }}>
              ● Backup Cloud & Restore Instant
            </div>
          </div>
        </div>
      </div>

      {/* 2. SEARCH & YEAR FILTER BAR */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#ffffff',
          padding: '12px 16px',
          borderRadius: '14px',
          border: '1px solid #EEF2F7',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '240px' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '320px' }}>
            <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '11px' }} />
            <input
              type="text"
              placeholder="Cari berkas arsip..."
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

          <div style={{ display: 'flex', gap: '6px' }}>
            {['all', '2026', '2025', '2024'].map((year) => (
              <button
                key={year}
                onClick={() => setYearFilter(year)}
                style={{
                  height: '30px',
                  padding: '0 10px',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                  fontWeight: yearFilter === year ? 700 : 500,
                  background: yearFilter === year ? '#F1F5F9' : '#FFFFFF',
                  color: yearFilter === year ? '#0F172A' : '#64748B',
                  border: '1px solid #CBD5E1',
                  cursor: 'pointer',
                }}
              >
                {year === 'all' ? 'Semua Tahun' : year}
              </button>
            ))}
          </div>
        </div>

        <div style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>
          Menampilkan <span style={{ color: '#0F172A', fontWeight: 800 }}>{filteredProjects.length}</span> berkas arsip
        </div>
      </div>

      {/* 3. ARCHIVED PROJECTS LIST */}
      {filteredProjects.length === 0 ? (
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
          <Archive size={36} color="#94A3B8" style={{ marginBottom: '12px' }} />
          <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0' }}>
            Gudang Arsip Kosong
          </h3>
          <p style={{ fontSize: '12.5px', color: '#64748B', maxWidth: '380px', margin: '0 0 16px 0' }}>
            Proyek yang telah selesai dapat dipindahkan ke arsip untuk merapikan ruang kerja Anda dan tetap tersimpan sebagai data historis.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
            gap: '16px',
          }}
        >
          {filteredProjects.map((proj) => {
            const totalCost = proj.totalRab || proj.costSummary?.grandTotal || 0;

            return (
              <div
                key={proj.id}
                style={{
                  background: '#F8FAFC',
                  borderRadius: '16px',
                  border: '1px solid #E2E8F0',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '14px',
                  position: 'relative',
                }}
              >
                <div>
                  {/* Card Header: Code & Archive Watermark Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        background: '#E2E8F0',
                        color: '#475569',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontWeight: 700,
                      }}
                    >
                      {proj.projectNumber || proj.id}
                    </span>

                    <span
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        fontWeight: 700,
                        background: '#F1F5F9',
                        color: '#64748B',
                        border: '1px solid #CBD5E1',
                        display: 'flex',
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
                      color: '#334155',
                      margin: '0 0 4px 0',
                      lineHeight: 1.3,
                    }}
                  >
                    {proj.name}
                  </h4>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748B', marginBottom: '12px' }}>
                    <MapPin size={12} color="#94A3B8" />
                    <span>{proj.location || 'Indonesia'}</span>
                    <span>•</span>
                    <span>{proj.clientName || proj.client || 'Klien'}</span>
                  </div>

                  {/* Summary Box */}
                  <div
                    style={{
                      background: '#FFFFFF',
                      borderRadius: '10px',
                      padding: '10px 12px',
                      border: '1px solid #E2E8F0',
                      fontSize: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
                      <span>Nilai Historis RAB:</span>
                      <span style={{ fontWeight: 700, color: '#0F172A' }}>{formatRupiah(totalCost)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
                      <span>Tipe Bangunan:</span>
                      <span style={{ fontWeight: 600, color: '#334155' }}>{proj.buildingType || 'Umum'}</span>
                    </div>
                  </div>
                </div>

                {/* Bottom Action Strip: Restore, Download, Delete Permanent */}
                <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <button
                    onClick={() => handleRestoreProject(proj)}
                    style={{
                      height: '32px',
                      padding: '0 12px',
                      borderRadius: '8px',
                      background: '#2563EB',
                      color: '#FFFFFF',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
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
                        height: '32px',
                        padding: '0 10px',
                        borderRadius: '6px',
                        background: '#FFFFFF',
                        border: '1px solid #CBD5E1',
                        color: '#475569',
                        fontSize: '11.5px',
                        fontWeight: 600,
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
                        height: '32px',
                        width: '32px',
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

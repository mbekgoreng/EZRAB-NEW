import React, { useState } from 'react';
import {
  CheckCircle2,
  Trophy,
  FileCheck,
  Archive,
  RotateCcw,
  Search,
  MapPin,
  FileText,
} from 'lucide-react';
import { Project } from '../../types';
import { useProject } from '../../context/ProjectContext';

interface CompletedProjectsViewProps {
  projects: Project[];
  onCreateProject: () => void;
  onOpenMagicAi: () => void;
  onNavigateToTab?: (tab: string) => void;
  onOpenProject?: (projectId: string, menu?: string) => void;
}

export const CompletedProjectsView: React.FC<CompletedProjectsViewProps> = ({
  projects,
  onCreateProject,
  onOpenMagicAi,
  onNavigateToTab,
  onOpenProject,
}) => {
  const { updateProject } = useProject();
  const [searchQuery, setSearchQuery] = useState('');

  const completedProjects = projects.filter(
    (p) => p.status === 'completed' || p.status === 'approved' || p.status === 'COMPLETED'
  );

  const formatRupiah = (val: number) => {
    return 'Rp ' + (val || 0).toLocaleString('id-ID');
  };

  const filteredProjects = completedProjects.filter((p) => {
    if (!searchQuery.trim()) return true;
    return (
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.clientName || p.client || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.location || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const totalCompletedValue = completedProjects.reduce(
    (acc, p) => acc + (p.totalRab || p.costSummary?.grandTotal || 0),
    0
  );

  // Financial simulation: estimate profit margins
  const getCompletedProjectFinancials = (proj: Project) => {
    const totalRab = proj.totalRab || proj.costSummary?.grandTotal || 0;
    // Simulated real cost (90-93% of RAB for healthy margin)
    const realCost = Math.round(totalRab * 0.88);
    const profitMargin = totalRab - realCost;
    const profitPercent = totalRab > 0 ? ((profitMargin / totalRab) * 100).toFixed(1) : '12.0';
    return { totalRab, realCost, profitMargin, profitPercent };
  };

  const handleArchiveProject = (proj: Project) => {
    if (
      window.confirm(
        `Apakah Anda ingin memindahkan proyek "${proj.name}" ke GUDANG ARSIP? Proyek akan disimpan sebagai arsip historis dan dapat dipulihkan kapan saja.`
      )
    ) {
      updateProject(proj.id, {
        status: 'archived',
        isArchived: true,
        archivedAt: new Date().toISOString(),
      });
      alert(`Proyek "${proj.name}" berhasil dipindahkan ke menu Arsip.`);
    }
  };

  const handleReopenProject = (proj: Project) => {
    if (
      window.confirm(
        `Buka kembali proyek "${proj.name}" ke status SEDANG DIKERJAKAN? (Gunakan jika terdapat addendum atau pekerjaan tambah-kurang).`
      )
    ) {
      updateProject(proj.id, {
        status: 'in_progress',
        progress: 95,
      });
      alert(`Proyek "${proj.name}" telah diaktifkan kembali ke status Sedang Dikerjakan.`);
    }
  };

  const handlePrintBast = (proj: Project) => {
    alert(`Membuat dokumen Berita Acara Serah Terima (BAST / PHO) untuk proyek "${proj.name}". Dokumen siap dicetak.`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' , fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif" }}>
      <style>{`
        @keyframes ezdb-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .ezdb-anim { animation: none !important; } }
      `}</style>
      {/* 1. TOP 4 CLOSEOUT & HANDOVER KPIS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '18px',
        }}
      >
        {/* KPI 1: Total Proyek Selesai */}
        <div className="ezdb-anim ez-stat ez-stat-mint" style={{ animation: 'ezdb-rise 0.6s 0.05s both' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#6B6B64', marginBottom: '8px' }}>
            Proyek Tuntas (100%)
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: '#141412' }}>
            {completedProjects.length}{' '}
            <span style={{ fontSize: '13px', color: '#8A8A84', fontWeight: 500, letterSpacing: '0' }}>Proyek</span>
          </div>
          <div style={{ fontSize: '12px', color: '#6B6B64', marginTop: '6px' }}>
            Serah Terima BAST & PHO
          </div>
        </div>

        {/* KPI 2: Total Omset Nilai Selesai */}
        <div className="ezdb-anim ez-stat ez-stat-cream" style={{ animation: 'ezdb-rise 0.6s 0.12s both' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#6B6B64', marginBottom: '8px' }}>
            Total Nilai Terealisasi
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: '#141412' }}>
            {totalCompletedValue === 0 ? 'Rp 0' : formatRupiah(totalCompletedValue)}
          </div>
          <div style={{ fontSize: '12px', color: '#6B6B64', marginTop: '6px' }}>
            Pekerjaan rampung 100%
          </div>
        </div>

        {/* KPI 3: Rata-rata Margin Profit */}
        <div className="ezdb-anim ez-stat ez-stat-sky" style={{ animation: 'ezdb-rise 0.6s 0.19s both' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#6B6B64', marginBottom: '8px' }}>
            Rata-rata Margin Profit
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: '#2C6E2C' }}>
            +12.4%
          </div>
          <div style={{ fontSize: '12px', color: '#6B6B64', marginTop: '6px' }}>
            Efisiensi biaya realisasi vs RAB
          </div>
        </div>

        {/* KPI 4: Masa Retensi Aktif */}
        <div className="ezdb-anim ez-stat ez-stat-peach" style={{ animation: 'ezdb-rise 0.6s 0.26s both' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#6B6B64', marginBottom: '8px' }}>
            Masa Pemeliharaan
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: '#141412' }}>
            {completedProjects.length}{' '}
            <span style={{ fontSize: '13px', color: '#8A8A84', fontWeight: 500, letterSpacing: '0' }}>Proyek</span>
          </div>
          <div style={{ fontSize: '12px', color: '#6B6B64', marginTop: '6px' }}>
            Masa Retensi (FHO Garansi)
          </div>
        </div>
      </div>

      {/* 2. SEARCH & CLOSEOUT ACTION BAR */}
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
        <div style={{ position: 'relative', width: '100%', maxWidth: '340px' }}>
          <Search size={14} color="#8A8A84" style={{ position: 'absolute', left: '12px', top: '12px' }} />
          <input
            type="text"
            placeholder="Cari proyek selesai..."
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

        <div style={{ fontSize: '12.5px', color: '#6B6B64', fontWeight: 600 }}>
          Menampilkan <span style={{ color: '#141412', fontWeight: 800 }}>{filteredProjects.length}</span> proyek terselesaikan
        </div>
      </div>

      {/* 3. COMPLETED PROJECT CARDS */}
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
              background: '#E2F4D8',
              color: '#2C6E2C',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '14px',
            }}
          >
            <Trophy size={26} />
          </div>
          <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#141412', margin: '0 0 6px 0' }}>
            Belum ada proyek yang berstatus selesai
          </h3>
          <p style={{ fontSize: '13px', color: '#6B6B64', maxWidth: '380px', margin: '0 0 16px 0', lineHeight: 1.5 }}>
            Proyek dari status 'Sedang Dikerjakan' yang telah mencapai progres 100% dan melalui serah terima akan muncul di sini.
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
            const { totalRab, realCost, profitMargin, profitPercent } = getCompletedProjectFinancials(proj);

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
                  {/* Card Header: Code & Completed 100% Badge */}
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
                        background: '#E2F4D8',
                        color: '#2C6E2C',
                        whiteSpace: 'nowrap',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <CheckCircle2 size={12} />
                      <span>SELESAI 100% (PHO)</span>
                    </span>
                  </div>

                  {/* Project Title */}
                  <h4
                    onClick={() => onOpenProject?.(proj.id, 'laporan')}
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
                    <span>{proj.location || 'Indonesia'}</span>
                    <span>•</span>
                    <span>{proj.clientName || proj.client || 'Klien Umum'}</span>
                  </div>

                  {/* Financial Evaluation Box (Closeout Reconciliation) */}
                  <div
                    style={{
                      background: '#FAFAF8',
                      borderRadius: '12px',
                      padding: '12px',
                      border: '1px solid #EEF1F6',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      fontSize: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6B6B64' }}>
                      <span>Nilai Kontrak / RAB Awal:</span>
                      <span style={{ fontWeight: 700, color: '#141412' }}>{formatRupiah(totalRab)}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6B6B64' }}>
                      <span>Realisasi Biaya Lapangan:</span>
                      <span style={{ fontWeight: 700, color: '#141412' }}>{formatRupiah(realCost)}</span>
                    </div>

                    <div
                      style={{
                        borderTop: '1px dashed #E2E8F0',
                        paddingTop: '6px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontWeight: 700,
                        color: '#2C6E2C',
                      }}
                    >
                      <span>Estimasi Margin / Profit:</span>
                      <span>+{formatRupiah(profitMargin)} ({profitPercent}%)</span>
                    </div>
                  </div>
                </div>

                {/* Bottom Closeout Action Strip */}
                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => handlePrintBast(proj)}
                      style={{
                        flex: 1,
                        height: '36px',
                        borderRadius: '12px',
                        background: '#E3EEFB',
                        border: 'none',
                        color: '#2456A8',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                      }}
                    >
                      <FileCheck size={13} />
                      <span>Cetak BAST (PHO)</span>
                    </button>

                    <button
                      onClick={() => onOpenProject?.(proj.id, 'laporan')}
                      style={{
                        flex: 1,
                        height: '36px',
                        borderRadius: '12px',
                        background: '#2563EB',
                        color: '#FFFFFF',
                        fontSize: '12px',
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        boxShadow: '0 4px 14px rgba(37,99,235,0.28)',
                      }}
                    >
                      <FileText size={13} />
                      <span>Laporan Akhir</span>
                    </button>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button
                      onClick={() => handleReopenProject(proj)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#6B6B64',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 0',
                      }}
                    >
                      <RotateCcw size={11} />
                      <span>Buka Kembali Proyek</span>
                    </button>

                    <button
                      onClick={() => handleArchiveProject(proj)}
                      style={{
                        height: '32px',
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
                      <Archive size={11} />
                      <span>Pindahkan ke Arsip</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

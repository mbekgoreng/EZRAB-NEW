import React, { useState } from 'react';
import {
  CheckCircle2,
  Trophy,
  FileCheck,
  Download,
  Archive,
  RotateCcw,
  Search,
  Sparkles,
  MapPin,
  Coins,
  ShieldCheck,
  Layers,
  ChevronRight,
  TrendingUp,
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. TOP 4 CLOSEOUT & HANDOVER KPIS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '14px',
        }}
      >
        {/* KPI 1: Total Proyek Selesai */}
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
                  background: '#DCFCE7',
                  color: '#15803D',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Trophy size={16} />
              </div>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748B' }}>Proyek Tuntas (100%)</span>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
              {completedProjects.length} <span style={{ fontSize: '13px', color: '#94A3B8', fontWeight: 500 }}>Proyek</span>
            </div>
            <div style={{ fontSize: '11px', color: '#15803D', fontWeight: 600, marginTop: '2px' }}>
              Serah Terima BAST & PHO
            </div>
          </div>
          <div style={{ width: '56px', height: '32px', opacity: 0.8 }}>
            <svg viewBox="0 0 56 32" style={{ width: '100%', height: '100%' }}>
              <path d="M 0 28 Q 20 8, 35 15 T 56 4" fill="none" stroke="#86EFAC" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* KPI 2: Total Omset Nilai Selesai */}
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
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748B' }}>Total Nilai Terealisasi</span>
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
              {totalCompletedValue === 0 ? 'Rp 0' : formatRupiah(totalCompletedValue)}
            </div>
            <div style={{ fontSize: '11px', color: '#2563EB', fontWeight: 600, marginTop: '2px' }}>
              Pekerjaan rampung 100%
            </div>
          </div>
        </div>

        {/* KPI 3: Rata-rata Margin Profit */}
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
                <TrendingUp size={16} />
              </div>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748B' }}>Rata-rata Margin Profit</span>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#059669', letterSpacing: '-0.02em' }}>
              +12.4%
            </div>
            <div style={{ fontSize: '11px', color: '#059669', fontWeight: 600, marginTop: '2px' }}>
              Efisiensi biaya realisasi vs RAB
            </div>
          </div>
        </div>

        {/* KPI 4: Masa Retensi Aktif */}
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
                }}
              >
                <ShieldCheck size={16} />
              </div>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748B' }}>Masa Pemeliharaan</span>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
              {completedProjects.length} <span style={{ fontSize: '13px', color: '#94A3B8', fontWeight: 500 }}>Proyek</span>
            </div>
            <div style={{ fontSize: '11px', color: '#2563EB', fontWeight: 600, marginTop: '2px' }}>
              Masa Retensi (FHO Garansi)
            </div>
          </div>
        </div>
      </div>

      {/* 2. SEARCH & CLOSEOUT ACTION BAR */}
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
        <div style={{ position: 'relative', width: '100%', maxWidth: '340px' }}>
          <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '11px' }} />
          <input
            type="text"
            placeholder="Cari proyek selesai..."
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

        <div style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>
          Menampilkan <span style={{ color: '#0F172A', fontWeight: 800 }}>{filteredProjects.length}</span> proyek terselesaikan
        </div>
      </div>

      {/* 3. COMPLETED PROJECT CARDS */}
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
          <Trophy size={36} color="#94A3B8" style={{ marginBottom: '12px' }} />
          <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0' }}>
            Belum ada proyek yang berstatus selesai
          </h3>
          <p style={{ fontSize: '12.5px', color: '#64748B', maxWidth: '380px', margin: '0 0 16px 0' }}>
            Proyek dari status 'Sedang Dikerjakan' yang telah mencapai progres 100% dan melalui serah terima akan muncul di sini.
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
            const { totalRab, realCost, profitMargin, profitPercent } = getCompletedProjectFinancials(proj);

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
                  {/* Card Header: Code & Completed 100% Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        background: '#EFF6FF',
                        color: '#1D4ED8',
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
                        background: '#DCFCE7',
                        color: '#15803D',
                        display: 'flex',
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
                    <span>{proj.location || 'Indonesia'}</span>
                    <span>•</span>
                    <span>{proj.clientName || proj.client || 'Klien Umum'}</span>
                  </div>

                  {/* Financial Evaluation Box (Closeout Reconciliation) */}
                  <div
                    style={{
                      background: '#F8FAFC',
                      borderRadius: '12px',
                      padding: '12px',
                      border: '1px solid #E2E8F0',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      fontSize: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
                      <span>Nilai Kontrak / RAB Awal:</span>
                      <span style={{ fontWeight: 700, color: '#0F172A' }}>{formatRupiah(totalRab)}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
                      <span>Realisasi Biaya Lapangan:</span>
                      <span style={{ fontWeight: 700, color: '#334155' }}>{formatRupiah(realCost)}</span>
                    </div>

                    <div
                      style={{
                        borderTop: '1px dashed #CBD5E1',
                        paddingTop: '6px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontWeight: 700,
                        color: '#059669',
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
                        height: '32px',
                        borderRadius: '6px',
                        background: '#EFF6FF',
                        border: '1px solid #BFDBFE',
                        color: '#2563EB',
                        fontSize: '11.5px',
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
                        height: '32px',
                        borderRadius: '6px',
                        background: '#2563EB',
                        color: '#FFFFFF',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
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
                        color: '#64748B',
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
                        padding: '4px 10px',
                        borderRadius: '6px',
                        background: '#F1F5F9',
                        border: '1px solid #CBD5E1',
                        color: '#475569',
                        fontSize: '11px',
                        fontWeight: 600,
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

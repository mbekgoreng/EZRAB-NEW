/**
 * MobileDokumenProyek — presentasi native mobile untuk Dokumen Proyek
 * (Gelombang Native 2, 2026-11-10): layar utama daftar dokumen + layar
 * pilih pekerjaan.
 *
 * Data & handler 100% dari TenderDocumentsView: activeCardData /
 * filteredCardData / stats dari memo yang sama, kategori dari konstanta
 * categoryTabs bersama, buka dokumen → DocumentWorkspace yang sama, hapus
 * → dialog konfirmasi yang sama, dan wizard (manual/AI) yang sama —
 * overlay-nya di-render view induk di kedua presentasi. Tidak ada data
 * dokumen yang dibuat ulang di sini.
 */
import React from 'react';
import {
  ArrowRight,
  Check,
  ClipboardList,
  FileText,
  Folder,
  MapPin,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Wallet,
} from 'lucide-react';
import type { Project } from '../../types';
import type { DocumentDefinition, DocumentRecord } from '../../document-engine/types';
import { calculateCompletenessForDocument } from '../../document-engine/completenessEngine';
import { formatRupiah } from '../../document-engine/templateEngine';

export interface DokumenCardData {
  record: DocumentRecord;
  def: DocumentDefinition;
  comp: ReturnType<typeof calculateCompletenessForDocument>;
  statusLabel: string;
  levelLabel: string;
}

export interface DokumenCategoryTab {
  key: string;
  label: string;
  count: number;
}

export interface MobileDokumenProyekProps {
  projectName: string;
  projectLocation: string;
  buildingType: string;
  totalRab: number;
  masterProjectName: string;
  activeCount: number;
  overallProgress: number;
  stats: { total: number; completed: number; draft: number; incomplete: number };
  categoryTabs: DokumenCategoryTab[];
  selectedCategoryTab: string;
  onSelectCategoryTab: (key: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  statusFilter: 'ALL' | 'DRAFT' | 'INCOMPLETE' | 'COMPLETE';
  onSelectStatusFilter: (f: 'ALL' | 'DRAFT' | 'INCOMPLETE' | 'COMPLETE') => void;
  filteredCardData: DokumenCardData[];
  onChangeProject: () => void;
  onCreateAiPackage: () => void;
  onCreateManual: () => void;
  onOpenFreeDocAi?: () => void;
  onOpenDocument: (def: DocumentDefinition) => void;
  onDeleteDocument: (defId: string, docName: string) => void;
  onResetFilters: () => void;
}

const STATUS_OPTIONS: Array<{ id: 'ALL' | 'COMPLETE' | 'DRAFT' | 'INCOMPLETE'; label: string }> = [
  { id: 'ALL', label: 'Semua Status' },
  { id: 'COMPLETE', label: 'Selesai' },
  { id: 'DRAFT', label: 'Draft (R0)' },
  { id: 'INCOMPLETE', label: 'Belum Lengkap' },
];

export const MobileDokumenProyek: React.FC<MobileDokumenProyekProps> = ({
  projectName,
  projectLocation,
  buildingType,
  totalRab,
  masterProjectName,
  activeCount,
  overallProgress,
  stats,
  categoryTabs,
  selectedCategoryTab,
  onSelectCategoryTab,
  searchQuery,
  onSearchChange,
  statusFilter,
  onSelectStatusFilter,
  filteredCardData,
  onChangeProject,
  onCreateAiPackage,
  onCreateManual,
  onOpenFreeDocAi,
  onOpenDocument,
  onDeleteDocument,
  onResetFilters,
}) => {
  return (
    <div className="mnw-screen">
      <div className="mnw-eyebrow">Dokumen Proyek · Tender &amp; Kontrak</div>
      <h2 className="mnw-title">Dokumen Proyek</h2>
      <p className="mnw-sub">
        Proyek: <strong style={{ color: '#0F172A' }}>{masterProjectName}</strong> • {activeCount} Dokumen Aktif (
        {overallProgress}% Selesai)
      </p>

      {/* Konteks proyek */}
      <div className="mnw-projcard" style={{ marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mnw-projcard-name">{projectName}</div>
          <div className="mnw-projcard-meta">
            <MapPin size={11} style={{ verticalAlign: -1 }} /> {projectLocation || '—'} · {buildingType || 'Konstruksi'}
          </div>
          <div className="mnw-projcard-meta">
            <Wallet size={11} style={{ verticalAlign: -1 }} /> {formatRupiah(totalRab || 0)}
          </div>
        </div>
        <button type="button" className="mnw-stickybar-btn" onClick={onChangeProject}>
          Ganti Proyek
        </button>
      </div>

      {/* Aksi buat — membuka wizard yang sama dengan desktop */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <button type="button" className="mnw-action-btn primary" onClick={onCreateAiPackage}>
          <Sparkles size={15} /> Buat Paket dengan AI
        </button>
        <button type="button" className="mnw-action-btn" onClick={onCreateManual}>
          <Plus size={15} /> Dokumen Manual
        </button>
        {onOpenFreeDocAi && (
          <button type="button" className="mnw-action-btn" onClick={onOpenFreeDocAi}>
            <FileText size={15} /> Dokumen Bebas AI
          </button>
        )}
      </div>

      {/* Statistik — angka stats yang sama */}
      <div className="mnw-kpi-grid">
        <div className="mnw-kpi-card">
          <span className="mnw-kpi-label">Total Dokumen</span>
          <span className="mnw-kpi-value">{stats.total}</span>
        </div>
        <div className="mnw-kpi-card">
          <span className="mnw-kpi-label">Selesai / Siap</span>
          <span className="mnw-kpi-value" style={{ color: '#15803D' }}>
            {stats.completed}
          </span>
        </div>
        <div className="mnw-kpi-card">
          <span className="mnw-kpi-label">Draft (R0)</span>
          <span className="mnw-kpi-value" style={{ color: '#B45309' }}>
            {stats.draft}
          </span>
        </div>
        <div className="mnw-kpi-card">
          <span className="mnw-kpi-label">Perlu Data</span>
          <span className="mnw-kpi-value" style={{ color: '#BE123C' }}>
            {stats.incomplete}
          </span>
        </div>
      </div>

      <div className="mnw-search" style={{ marginTop: 14 }}>
        <Search size={16} />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Cari dokumen…"
          aria-label="Cari dokumen"
        />
      </div>

      <div className="mnw-chips" aria-label="Kategori dokumen">
        {categoryTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`mnw-chip${selectedCategoryTab === tab.key ? ' is-active' : ''}`}
            onClick={() => onSelectCategoryTab(tab.key)}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>
      <div className="mnw-chips" aria-label="Filter status" style={{ paddingTop: 8 }}>
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`mnw-chip${statusFilter === opt.id ? ' is-active' : ''}`}
            onClick={() => onSelectStatusFilter(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div style={{ height: 14 }} />

      {activeCount === 0 ? (
        <div className="mnw-empty">
          <Sparkles size={26} color="#94A3B8" />
          <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Belum Ada Dokumen Proyek</div>
          <div>
            Siapkan seluruh berkas tender Anda (Administrasi, Teknis, Biaya, Jadwal, K3) secara otomatis dari
            database proyek ini.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button type="button" className="mnw-action-btn primary" onClick={onCreateAiPackage}>
              <Sparkles size={15} /> Buat Paket dengan AI
            </button>
            <button type="button" className="mnw-action-btn" onClick={onCreateManual}>
              <Plus size={15} /> Pilih Manual
            </button>
          </div>
        </div>
      ) : filteredCardData.length === 0 ? (
        <div className="mnw-empty">
          <div>Tidak ada dokumen yang cocok dengan filter atau pencarian Anda.</div>
          <button type="button" className="mnw-action-btn" onClick={onResetFilters}>
            Reset Filter
          </button>
        </div>
      ) : (
        filteredCardData.map(({ record, def, comp, statusLabel }) => {
          const isReady = record.status === 'COMPLETE' || record.status === 'EXPORTED';
          const actionLabel = isReady ? 'Buka' : 'Lanjutkan';
          const revisionCode =
            record.revision === 2 ? 'R2 • Final' : record.revision === 1 ? 'R1 • Review' : 'R0 • Draft';
          const statusCls =
            record.status === 'COMPLETE' || record.status === 'EXPORTED'
              ? 'full'
              : record.status === 'INCOMPLETE'
                ? 'partial'
                : 'missing';
          return (
            <div key={record.definitionId} className="mnw-ahsp-card">
              <div className="mnw-ahsp-top">
                <span className="mnw-ahsp-name">{def.name}</span>
                <span className={`mnw-badge ${statusCls}`}>{revisionCode}</span>
                <button
                  type="button"
                  className="mnw-doc-del"
                  onClick={() => onDeleteDocument(record.definitionId, def.name)}
                  aria-label={`Hapus dokumen ${def.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="mnw-ahsp-meta">
                {def.code} • {def.category}
              </div>
              <div className="mnw-doc-statusrow">
                <span className={`mnw-badge ${statusCls}`}>{statusLabel}</span>
                <span className="mnw-doc-pct" style={{ color: isReady ? '#15803D' : '#0F172A' }}>
                  {comp.completenessPercentage}%
                </span>
              </div>
              <div className="mnw-rekap-track" style={{ marginTop: 7 }}>
                <div
                  className="mnw-rekap-fill"
                  style={{ width: `${comp.completenessPercentage}%`, background: isReady ? '#16A34A' : '#2563EB' }}
                />
              </div>
              {comp.reason && <div className="mnw-ahsp-meta">{comp.reason}</div>}
              <div className="mnw-detail-actions" style={{ borderTop: '1px solid #F1F5F9', paddingTop: 10 }}>
                <span style={{ flex: 1, fontSize: 11, color: '#94A3B8', alignSelf: 'center' }}>
                  {def.requirement === 'CORE' ? 'Wajib LPSE' : 'Rekomendasi'}
                </span>
                <button
                  type="button"
                  className={`mnw-action-btn${isReady ? '' : ' primary'}`}
                  style={{ flex: '0 0 auto' }}
                  onClick={() => onOpenDocument(def)}
                >
                  {actionLabel} <ArrowRight size={14} />
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Layar pilih pekerjaan (keadaan tanpa proyek aktif / Ganti Proyek)   */
/* ------------------------------------------------------------------ */

export interface MobileDokumenPilihPekerjaanProps {
  projects: Project[];
  activeProjectId?: string | null;
  onSelectJob: (proj: Project) => void;
}

export const MobileDokumenPilihPekerjaan: React.FC<MobileDokumenPilihPekerjaanProps> = ({
  projects,
  activeProjectId,
  onSelectJob,
}) => {
  return (
    <div className="mnw-screen">
      <div className="mnw-eyebrow">Dokumen Proyek</div>
      <h2 className="mnw-title">Pilih Pekerjaan</h2>
      <p className="mnw-sub">
        Pilih pekerjaan dari database EZRAB untuk memuat data proyek, RAB, BOQ, AHSP, dan jadwal ke dokumen.
      </p>

      {projects.length === 0 ? (
        <div className="mnw-empty">
          <Folder size={30} color="#94A3B8" />
          <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Belum Ada Daftar Pekerjaan</div>
          <div>Buat proyek baru di menu Proyek, lalu kembali ke sini untuk memilihnya.</div>
        </div>
      ) : (
        projects.map((proj) => {
          const isSelected = activeProjectId === proj.id;
          const hasRab = (proj.totalRab || 0) > 0;
          return (
            <div key={proj.id} className="mnw-ahsp-card">
              <div className="mnw-tpl-cat" style={{ color: '#1D4ED8' }}>
                {proj.projectNumber || 'PROYEK'}
              </div>
              <div className="mnw-tpl-name">{proj.name}</div>
              <div className="mnw-param-row">
                <span>
                  <MapPin size={11} style={{ verticalAlign: -1 }} /> Lokasi
                </span>
                <b style={{ textAlign: 'right' }}>{proj.location || '—'}</b>
              </div>
              <div className="mnw-param-row">
                <span>
                  <Wallet size={11} style={{ verticalAlign: -1 }} /> RAB
                </span>
                <b>{formatRupiah(proj.totalRab || 0)}</b>
              </div>
              <div className="mnw-param-row">
                <span>
                  <ClipboardList size={11} style={{ verticalAlign: -1 }} /> Status RAB
                </span>
                <b style={{ color: hasRab ? '#15803D' : '#B45309' }}>{hasRab ? 'Lengkap' : 'Belum ada RAB'}</b>
              </div>
              <button
                type="button"
                className={`mnw-action-btn${isSelected ? '' : ' primary'}`}
                style={{ width: '100%', marginTop: 10 }}
                onClick={() => onSelectJob(proj)}
              >
                {isSelected ? (
                  <>
                    <Check size={15} /> Sedang Aktif
                  </>
                ) : (
                  'Pilih Pekerjaan'
                )}
              </button>
            </div>
          );
        })
      )}
    </div>
  );
};

export default MobileDokumenProyek;

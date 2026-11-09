/**
 * MobileAhspProyek — presentasi NATIVE mobile tab Analisa Harga Satuan
 * proyek (Gelombang 1, layar 09 galeri + pola mockup AHSP mobile:
 * daftar kartu ringkas + detail per kelompok Bahan/Upah/Alat).
 *
 * HANYA presentasi: daftar, hitungan kecocokan resmi, dan bentuk tampil
 * tiap item berasal dari sumber yang sama dengan EstimatorAhspView
 * desktop — resolveAhspItemDisplay (estimator/ahspItemDisplay.ts,
 * diekstrak verbatim dari view desktop) dan officialAhspRepository.
 * Harga yang belum teresolusi tetap null/"Harga Belum Tersedia",
 * tidak pernah diganti angka lain. Tombol "Rincian" membuka
 * WorkItemInspectorDrawer yang sama dengan desktop.
 */
import React, { useMemo, useState } from 'react';
import { Search, Calculator, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import type { Project, RabItem } from '../../types';
import { officialAhspRepository } from '../../data/nationalCostDatabase/officialAhspRepository';
import { formatCurrencyIDR, formatNumberID } from '../../calculations/decimalEngine';
import { resolveAhspItemDisplay, type AhspDisplayComponent } from '../estimator/ahspItemDisplay';

interface MobileAhspProyekProps {
  currentProject: Project | null;
  items: RabItem[];
  onOpenInspector?: (item: RabItem) => void;
}

const CompGroup: React.FC<{ title: string; comps: AhspDisplayComponent[] }> = ({ title, comps }) => {
  if (comps.length === 0) return null;
  return (
    <div>
      <div className="mnw-comp-group-title"><span>{title}</span></div>
      {comps.map((c, idx) => (
        <div key={idx} className="mnw-comp-row">
          <span className="mnw-comp-name">
            {c.name}
            <small>
              {formatNumberID(c.coefficient, 4)} {c.unit} ×{' '}
              {c.unitPrice === null || c.unitPrice === undefined ? '—' : c.unitPrice.toLocaleString('id-ID')}
            </small>
          </span>
          <span className="mnw-comp-amt">
            {formatCurrencyIDR(c.unitPrice === null || c.unitPrice === undefined ? null : (c.coefficient || 0) * c.unitPrice)}
          </span>
        </div>
      ))}
    </div>
  );
};

export const MobileAhspProyek: React.FC<MobileAhspProyekProps> = ({ currentProject, items, onOpenInspector }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [expandedAhspIds, setExpandedAhspIds] = useState<Set<string>>(new Set());

  // Filter AHSP items — sama dengan view desktop.
  const projectAhspList = useMemo(() => {
    return items.filter((it) => it.code || it.ahspCode || it.ahspSnapshot);
  }, [items]);

  const officialMatchCount = useMemo(() => {
    return projectAhspList.filter((it) => {
      if (it.ahspSnapshot) return true;
      const codeToCheck = it.ahspCode || it.code;
      if (!codeToCheck) return false;
      return !!officialAhspRepository.getOfficialAhsp(codeToCheck);
    }).length;
  }, [projectAhspList]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    projectAhspList.forEach((it) => {
      if (it.category) cats.add(it.category);
    });
    return Array.from(cats);
  }, [projectAhspList]);

  const filteredItems = useMemo(() => {
    return projectAhspList.filter((it) => {
      const matchesSearch =
        (it.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (it.code || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (it.ahspCode || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'ALL' || it.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [projectAhspList, searchQuery, selectedCategory]);

  const toggleExpand = (id: string) => {
    setExpandedAhspIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="mnw-screen">
      <p className="mnw-sub" style={{ marginBottom: 8 }}>
        Dekomposisi koefisien upah, material, dan alat berstandar SNI / PUPR 2026 yang aktif pada proyek ini.
      </p>
      <div style={{ marginBottom: 12 }}>
        <span className="mnw-badge" style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #DBEAFE', fontSize: 11, padding: '5px 10px' }}>
          {officialMatchCount} dari {projectAhspList.length} Analisa Cocok AHSP Resmi
        </span>
      </div>

      <div className="mnw-search">
        <Search size={15} />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Cari kode AHSP atau uraian analisa…"
          aria-label="Cari AHSP proyek"
        />
      </div>

      <div className="mnw-chips" role="tablist" aria-label="Kategori AHSP proyek">
        <button
          type="button"
          className={`mnw-chip${selectedCategory === 'ALL' ? ' is-active' : ''}`}
          onClick={() => setSelectedCategory('ALL')}
        >
          Semua Kategori ({projectAhspList.length})
        </button>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            className={`mnw-chip${selectedCategory === c ? ' is-active' : ''}`}
            onClick={() => setSelectedCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        {filteredItems.length === 0 ? (
          <div className="mnw-empty">
            <Calculator size={26} color="#94A3B8" />
            <p style={{ margin: 0 }}>
              <b style={{ color: '#0F172A' }}>Tidak Ada Analisa Harga Satuan yang Sesuai</b>
              <br />
              Coba gunakan kata kunci pencarian lain atau pilih kategori yang berbeda.
            </p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const d = resolveAhspItemDisplay(item);
            const isExpanded = expandedAhspIds.has(item.id);
            const badgeClass =
              d.statusBadge === 'FULL' ? 'full' : d.statusBadge === 'PARTIAL' ? 'partial' : 'missing';
            const badgeLabel =
              d.statusBadge === 'FULL' ? 'Harga lengkap' : d.statusBadge === 'PARTIAL' ? 'Harga parsial*' : 'Harga belum tersedia';
            return (
              <article key={item.id} className="mnw-ahsp-card">
                <button
                  type="button"
                  className="mnw-ahsp-cardbtn"
                  onClick={() => toggleExpand(item.id)}
                  aria-expanded={isExpanded}
                >
                  <span className="mnw-ahsp-top">
                    <span className="mnw-code-chip">{d.code}</span>
                    <span className="mnw-ahsp-name">{item.description}</span>
                    {isExpanded ? <ChevronUp size={16} color="#94A3B8" /> : <ChevronDown size={16} color="#94A3B8" />}
                  </span>
                  <span className="mnw-ahsp-meta">
                    {item.category} · Satuan: {item.unit} · Sumber: {d.snap ? 'Snapshot AHSP Proyek' : 'Katalog Resmi'}
                    {d.isStale ? ' · snapshot lama — harga dari snapshot tersimpan' : ''}
                  </span>
                  <span className="mnw-ahsp-price-row">
                    <span>
                      <span className="mnw-ahsp-price">{d.unitPrice !== null && d.unitPrice !== undefined ? formatCurrencyIDR(d.unitPrice) : 'Harga Belum Tersedia'}</span>{' '}
                      <span className="mnw-ahsp-per">/ {item.unit}</span>
                    </span>
                    <span className={`mnw-badge ${badgeClass}`}>{badgeLabel}</span>
                  </span>
                </button>

                {isExpanded && (
                  <div className="mnw-ahsp-detail">
                    {d.materials.length === 0 && d.labors.length === 0 && d.equipments.length === 0 ? (
                      <p style={{ margin: 0, fontSize: 12.5, color: '#64748B', lineHeight: 1.55 }}>
                        Dekomposisi koefisien AHSP mengacu pada standar umum analisa satuan nasional. Klik tombol{' '}
                        <strong>Rincian</strong> untuk melihat atau menyesuaikan koefisien bahan dan upah di Work
                        Item Inspector.
                      </p>
                    ) : (
                      <>
                        <CompGroup title="A. Tenaga Kerja (Upah)" comps={d.labors} />
                        <CompGroup title="B. Bahan / Material" comps={d.materials} />
                        <CompGroup title="C. Peralatan (Alat)" comps={d.equipments} />
                      </>
                    )}
                    {onOpenInspector && (
                      <button
                        type="button"
                        className="mnw-action-btn"
                        style={{ marginTop: 12, width: '100%' }}
                        onClick={() => onOpenInspector(item)}
                      >
                        <Eye size={14} /> Rincian
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>

      <p className="mnw-sub" style={{ textAlign: 'center', margin: '2px 0 0' }}>
        {currentProject?.name || 'Proyek aktif'} · {filteredItems.length} dari {projectAhspList.length} analisa
      </p>
    </div>
  );
};

export default MobileAhspProyek;

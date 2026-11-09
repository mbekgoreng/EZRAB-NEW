/**
 * MobileTemplateRab — presentasi native mobile untuk katalog Template RAB
 * (Gelombang Native 2, 2026-11-10).
 *
 * Daftar & filter memakai state + handler yang sama persis dengan
 * TemplateRabCatalogView desktop (kategori, subkategori, sumber, pencarian
 * — filteredTemplates dari view induk). Derivasi per kartu memakai
 * deriveTemplateCardDisplay bersama. Modal desktop yang rumit (Preview
 * Drawer, Builder, Apply/konfigurator, Pengaturan Global) TIDAK dibuat
 * ulang: tombol di layar ini membuka modal yang sama lewat handler yang
 * sama, dan modal-modal itu di-render oleh view induk di kedua presentasi.
 */
import React, { useMemo, useState } from 'react';
import { ArrowRight, Copy, Eye, Plus, Search, Settings, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react';
import { RabTemplate, TemplateCategory, DetailLevel } from '../../types/rabTemplate';
import { RabTemplateService } from '../../services/rabTemplateService';
import { deriveTemplateCardDisplay } from '../templates/templateCardDisplay';

export interface MobileTemplateRabProps {
  filteredTemplates: RabTemplate[];
  categoryItems: Array<{ id: TemplateCategory | 'ALL'; label: string; icon: any }>;
  categoryCounts: Record<string, number>;
  selectedCategory: TemplateCategory | 'ALL';
  onSelectCategory: (cat: TemplateCategory | 'ALL') => void;
  availableSubcategories: string[];
  selectedSubcategory: string;
  onSelectSubcategory: (sub: string) => void;
  sourceFilter: 'ALL' | 'OFFICIAL' | 'USER';
  onSelectSourceFilter: (f: 'ALL' | 'OFFICIAL' | 'USER') => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  globalDetailLevel: DetailLevel;
  getCategoryIcon: (cat: TemplateCategory) => any;
  onPreview: (tpl: RabTemplate) => void;
  onApply: (tpl: RabTemplate) => void;
  onDuplicate: (tpl: RabTemplate) => void;
  onDelete: (tpl: RabTemplate) => void;
  onOpenBuilder: () => void;
  onOpenSettings: () => void;
}

const MOBILE_PAGE = 12;

const SOURCE_CHIPS: Array<{ id: 'ALL' | 'OFFICIAL' | 'USER'; label: string }> = [
  { id: 'ALL', label: 'Semua Sumber' },
  { id: 'OFFICIAL', label: 'Resmi' },
  { id: 'USER', label: 'Template Saya' },
];

export const MobileTemplateRab: React.FC<MobileTemplateRabProps> = ({
  filteredTemplates,
  categoryItems,
  categoryCounts,
  selectedCategory,
  onSelectCategory,
  availableSubcategories,
  selectedSubcategory,
  onSelectSubcategory,
  sourceFilter,
  onSelectSourceFilter,
  searchQuery,
  onSearchChange,
  globalDetailLevel,
  getCategoryIcon,
  onPreview,
  onApply,
  onDuplicate,
  onDelete,
  onOpenBuilder,
  onOpenSettings,
}) => {
  const tplService = useMemo(() => RabTemplateService.getInstance(), []);
  // Jendela tampil lokal (murni presentasi): daftar sumbernya tetap
  // filteredTemplates dari view induk.
  const [visibleCount, setVisibleCount] = useState(MOBILE_PAGE);
  const visibleTemplates = filteredTemplates.slice(0, visibleCount);

  return (
    <div className="mnw-screen">
      <div className="mnw-eyebrow">Template RAB</div>
      <h2 className="mnw-title">Katalog Template</h2>
      <p className="mnw-sub">
        {filteredTemplates.length} template tersedia · Mode aktif: <strong>{globalDetailLevel}</strong>
      </p>

      <div className="mnw-search">
        <Search size={16} />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => {
            onSearchChange(e.target.value);
            setVisibleCount(MOBILE_PAGE);
          }}
          placeholder="Cari template…"
          aria-label="Cari template"
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button type="button" className="mnw-action-btn primary" onClick={onOpenBuilder}>
          <Plus size={15} /> Buat Template
        </button>
        <button
          type="button"
          className="mnw-action-btn"
          style={{ flex: '0 0 auto', minWidth: 52 }}
          onClick={onOpenSettings}
          aria-label="Pengaturan estimasi global"
        >
          <Settings size={16} />
        </button>
      </div>

      {/* Kategori — daftar & hitungan yang sama dengan desktop */}
      <div className="mnw-chips" role="tablist" aria-label="Kategori template">
        {categoryItems.map((cat) => {
          const Icon = cat.icon;
          const count = cat.id === 'ALL' ? undefined : categoryCounts[cat.id] || 0;
          return (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={selectedCategory === cat.id}
              className={`mnw-chip${selectedCategory === cat.id ? ' is-active' : ''}`}
              onClick={() => {
                onSelectCategory(cat.id);
                setVisibleCount(MOBILE_PAGE);
              }}
            >
              <Icon size={14} style={{ marginRight: 5 }} />
              {cat.label}
              {count !== undefined && count > 0 ? ` (${count})` : ''}
            </button>
          );
        })}
      </div>

      {/* Sumber */}
      <div className="mnw-chips" aria-label="Filter sumber template" style={{ paddingTop: 8 }}>
        {SOURCE_CHIPS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className={`mnw-chip${sourceFilter === chip.id ? ' is-active' : ''}`}
            onClick={() => {
              onSelectSourceFilter(chip.id);
              setVisibleCount(MOBILE_PAGE);
            }}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Subkategori kategori aktif */}
      {availableSubcategories.length > 0 && (
        <div className="mnw-chips" aria-label="Subkategori" style={{ paddingTop: 8 }}>
          <button
            type="button"
            className={`mnw-chip${selectedSubcategory === 'ALL' ? ' is-active' : ''}`}
            onClick={() => {
              onSelectSubcategory('ALL');
              setVisibleCount(MOBILE_PAGE);
            }}
          >
            Semua Subkategori
          </button>
          {availableSubcategories.map((sub) => (
            <button
              key={sub}
              type="button"
              className={`mnw-chip${selectedSubcategory === sub ? ' is-active' : ''}`}
              onClick={() => {
                onSelectSubcategory(sub);
                setVisibleCount(MOBILE_PAGE);
              }}
            >
              {sub}
            </button>
          ))}
        </div>
      )}

      <div style={{ height: 14 }} />

      {filteredTemplates.length === 0 ? (
        <div className="mnw-empty">
          <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Tidak ada template yang cocok</div>
          <div>Coba ubah kata kunci atau filter, atau buat template baru dari RAB proyekmu.</div>
          <button type="button" className="mnw-action-btn primary" onClick={onOpenBuilder}>
            <Plus size={15} /> Buat Template
          </button>
        </div>
      ) : (
        <>
          {visibleTemplates.map((tpl) => {
            const { Icon, isUser, previewRes, readiness } = deriveTemplateCardDisplay(
              tplService,
              tpl,
              globalDetailLevel,
              getCategoryIcon
            );
            return (
              <div key={tpl.id} className="mnw-ahsp-card">
                <div className="mnw-ahsp-top">
                  <span className="mnw-tpl-icon">
                    <Icon size={16} />
                  </span>
                  <span className="mnw-tpl-cat">
                    {tpl.category.replace(/_/g, ' ')}
                    {tpl.subcategory && <span className="mnw-tpl-subcat">{tpl.subcategory}</span>}
                  </span>
                  <span className={`mnw-badge ${isUser ? 'partial' : 'full'}`}>
                    {isUser ? 'Template Saya' : tpl.badge || 'Official'}
                  </span>
                </div>

                <div className="mnw-tpl-name">{tpl.name}</div>
                {tpl.description && <p className="mnw-tpl-desc">{tpl.description}</p>}

                {tpl.parameters.length > 0 && (
                  <div className="mnw-tpl-params">
                    {tpl.parameters.slice(0, 3).map((p) => (
                      <span key={p.id || p.key} className="mnw-tpl-param">
                        {p.label}: <strong>{String(p.defaultValue ?? '-')} {p.unit || ''}</strong>
                      </span>
                    ))}
                    {tpl.parameters.length > 3 && (
                      <span className="mnw-tpl-param more">+{tpl.parameters.length - 3} lagi</span>
                    )}
                  </div>
                )}

                {previewRes && (
                  <div className="mnw-tpl-preview">
                    <div>
                      <span className="mnw-tpl-preview-label">Est. Total ({globalDetailLevel})</span>
                      <span className="mnw-tpl-preview-value">
                        Rp {previewRes.totalEstimate.toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div className="mnw-tpl-preview-tags">
                      {previewRes.categorySummaries && (
                        <span className="mnw-tpl-tag">{Object.keys(previewRes.categorySummaries).length} Paket</span>
                      )}
                      <span className="mnw-tpl-tag green">{previewRes.itemCount} Item</span>
                    </div>
                  </div>
                )}

                {previewRes?.priceSummary && !isUser && (
                  <div className="mnw-tpl-honesty">
                    {previewRes.priceSummary.officialCount > 0 && (
                      <span className="mnw-tpl-tag green">
                        <ShieldCheck size={11} /> {previewRes.priceSummary.officialCount} Harga Resmi AHSP
                      </span>
                    )}
                    {previewRes.priceSummary.referenceCount > 0 && (
                      <span className="mnw-tpl-tag">{previewRes.priceSummary.referenceCount} Harga Referensi</span>
                    )}
                    {previewRes.priceSummary.unpricedCount > 0 && (
                      <span className="mnw-tpl-tag amber">
                        <ShieldAlert size={11} /> {previewRes.priceSummary.unpricedCount} Belum Ada Harga — Total Parsial
                      </span>
                    )}
                    {readiness && <span className="mnw-tpl-tag blue">Pemetaan AHSP {readiness.readinessPercent}%</span>}
                  </div>
                )}

                <div className="mnw-detail-actions" style={{ borderTop: '1px solid #F1F5F9', paddingTop: 10 }}>
                  <button type="button" className="mnw-action-btn" onClick={() => onPreview(tpl)}>
                    <Eye size={14} /> Preview
                  </button>
                  <button
                    type="button"
                    className="mnw-action-btn"
                    style={{ flex: '0 0 auto', minWidth: 48 }}
                    onClick={() => onDuplicate(tpl)}
                    aria-label={`Duplikat template ${tpl.name}`}
                  >
                    <Copy size={15} />
                  </button>
                  {isUser && (
                    <button
                      type="button"
                      className="mnw-action-btn danger"
                      style={{ flex: '0 0 auto', minWidth: 48 }}
                      onClick={() => onDelete(tpl)}
                      aria-label={`Hapus template ${tpl.name}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                  <button type="button" className="mnw-action-btn primary" onClick={() => onApply(tpl)}>
                    Gunakan <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            );
          })}

          {visibleCount < filteredTemplates.length && (
            <button type="button" className="mnw-more-btn" onClick={() => setVisibleCount((c) => c + MOBILE_PAGE)}>
              Muat {Math.min(MOBILE_PAGE, filteredTemplates.length - visibleCount)} template lagi (
              {visibleCount} dari {filteredTemplates.length})
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default MobileTemplateRab;

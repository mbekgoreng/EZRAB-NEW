/**
 * MobileSpreadsheetRab — presentasi NATIVE mobile tab Spreadsheet RAB
 * (Gelombang 1, layar 07 galeri EZRAB-ALL-MENUS-MOBILE).
 *
 * HANYA presentasi: grup, subtotal, dan total berasal dari state
 * RabEstimasiView yang sama dengan tabel desktop (groupedWbsCategories,
 * totalRabNominal); ketuk item membuka WorkItemInspectorDrawer yang
 * sama; "+ Item"/"+ Tambah item" membuka SmartAdd yang sama; lipat grup
 * memakai state collapsedCategories yang sama. Edit sel per kolom,
 * seleksi massal, dan menu konteks tetap fitur tabel desktop.
 *
 * Jumlah per baris memakai gerbang integritas yang sama dengan header
 * mobile (exportItemAmount): item PRICE_UNRESOLVED tidak menampilkan
 * total basi — tertulis "Belum berharga", bukan angka karangan.
 * Tombol "Simpan" galeri tidak dibuat: RAB tersimpan otomatis
 * (autosave), sama seperti desktop.
 */
import React from 'react';
import { Plus, ChevronDown, ChevronUp, ClipboardList } from 'lucide-react';
import type { RabItem } from '../../types';
import type { GroupedWbsCategory } from '../estimator/EstimatorSpreadsheetTable';
import type { AddItemMode } from '../estimator/SmartAddWorkItemModal';
import { exportItemAmount } from '../../export/priceIntegrity';
import { formatNumberId, formatRupiah } from '../../engine/formulaEngine';
import { formatRpFull } from './mobileV3Utils';

interface MobileSpreadsheetRabProps {
  groups: GroupedWbsCategory[];
  totalRab: number;
  onOpenInspector: (item: RabItem) => void;
  onAddNewItem: (mode?: AddItemMode, categoryContext?: string) => void;
  collapsedCategories: Record<string, boolean>;
  onToggleCollapseCategory: (categoryName: string) => void;
}

export const MobileSpreadsheetRab: React.FC<MobileSpreadsheetRabProps> = ({
  groups,
  totalRab,
  onOpenInspector,
  onAddNewItem,
  collapsedCategories,
  onToggleCollapseCategory,
}) => {
  const totalItems = groups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div className="mnw-screen">
      {groups.length === 0 || totalItems === 0 ? (
        <div className="mnw-empty">
          <ClipboardList size={26} color="#94A3B8" />
          <p style={{ margin: 0 }}>
            Belum ada item pekerjaan di RAB proyek ini.
            <br />
            Tambahkan item pertama untuk mulai menyusun RAB.
          </p>
          <button type="button" className="mnw-action-btn primary" style={{ flex: 'none', padding: '10px 18px' }} onClick={() => onAddNewItem('selector')}>
            <Plus size={14} /> Tambah Item
          </button>
        </div>
      ) : (
        groups.map((group) => {
          const isCollapsed = !!collapsedCategories[group.categoryName];
          return (
            <section key={group.categoryName} className="mnw-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
              <button
                type="button"
                className="mnw-div-head"
                onClick={() => onToggleCollapseCategory(group.categoryName)}
                aria-expanded={!isCollapsed}
              >
                <span
                  className="mnw-div-chip"
                  style={{ background: group.badgeColor.bg, color: group.badgeColor.text, border: `1px solid ${group.badgeColor.border}` }}
                >
                  {group.codeLetter}
                </span>
                <span className="mnw-div-name">{group.categoryName}</span>
                <span className="mnw-div-total">{formatRpFull(group.subtotal)}</span>
                {isCollapsed ? <ChevronDown size={16} color="#94A3B8" /> : <ChevronUp size={16} color="#94A3B8" />}
              </button>
              {!isCollapsed && (
                <>
                  {group.items.map((item, idx) => {
                    const amount = exportItemAmount(item);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className="mnw-sheet-item"
                        onClick={() => onOpenInspector(item)}
                        aria-label={`Buka rincian ${item.description}`}
                      >
                        <span className="mnw-sheet-item-main">
                          <span className="mnw-sheet-item-name">
                            {idx + 1}. {item.description}
                          </span>
                          <span className="mnw-sheet-item-meta">
                            {amount === null
                              ? `${formatNumberId(item.volume || 0, 2)} ${item.unit} · harga belum tersedia`
                              : `${formatNumberId(item.volume || 0, 2)} ${item.unit} × ${formatRupiah(item.unitPrice ?? 0)}`}
                          </span>
                        </span>
                        <span className="mnw-sheet-item-amt">{amount === null ? 'Belum berharga' : formatRpFull(amount)}</span>
                      </button>
                    );
                  })}
                  <button type="button" className="mnw-sheet-addrow" onClick={() => onAddNewItem('selector', group.categoryName)}>
                    <Plus size={13} /> Tambah item di divisi ini
                  </button>
                </>
              )}
            </section>
          );
        })
      )}

      <div className="mnw-stickybar">
        <div className="mnw-stickybar-main">
          <span className="mnw-stickybar-label">Total RAB Proyek</span>
          <span className="mnw-stickybar-value">{formatRpFull(totalRab)}</span>
        </div>
        <button type="button" className="mnw-stickybar-btn" onClick={() => onAddNewItem('selector')}>
          <Plus size={14} /> Item
        </button>
      </div>
    </div>
  );
};

export default MobileSpreadsheetRab;

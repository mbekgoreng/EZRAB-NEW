/**
 * MobileQtoRekap — presentasi NATIVE mobile Rekapitulasi QTO
 * (Gelombang 1, keputusan owner 2026-11-09 "buat native per menu dari
 * galeri", layar 06 galeri EZRAB-ALL-MENUS-MOBILE).
 *
 * Prinsip sama seperti MobileV3: HANYA presentasi. Data & aksi dari
 * sumber yang sama persis dengan QtoRekapVolumeView desktop:
 * useProject() (projectQtoItems, deleteQtoItem, syncQtoToRabSpreadsheet)
 * dan helper kategorisasi bersama qtoCategory.ts (diekstrak dari view
 * desktop — aturan pengelompokan tidak diduplikasi).
 *
 * Aksi yang berfungsi penuh: cari, saring kategori, kelompok per seksi,
 * rincian parameter per item, buka item di Kalkulator Volume, sinkron ke
 * RAB per item, mode pilih (sinkron/hapus massal — semantik sama dengan
 * bulk action desktop). Pembuatan item manual & ekspor tetap di jalur
 * desktop/Laporan (lihat laporan gelombang 1).
 */
import React, { useMemo, useState } from 'react';
import { Search, Ruler, Check, ChevronDown, ChevronUp, Calculator, Send, Trash2, X } from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import type { QTOItem } from '../../types';
import { formatNumberId } from '../../engine/formulaEngine';
import { getQtoCategoryOfItem, getQtoSectionHeadingOfItem, type QtoDisplayCategory } from '../qto/qtoCategory';

interface MobileQtoRekapProps {
  onNavigateToCalculator?: (calcId?: string, qtoId?: string) => void;
  onNavigateToTab?: (tab: string) => void;
}

type CategoryTab = 'semua' | QtoDisplayCategory;

const CATEGORY_TABS: Array<{ id: CategoryTab; label: string }> = [
  { id: 'semua', label: 'Semua' },
  { id: 'struktur', label: 'Struktur' },
  { id: 'arsitektur', label: 'Arsitektur' },
  { id: 'mep', label: 'MEP' },
  { id: 'lainnya', label: 'Lainnya' },
];

const statusMeta = (item: QTOItem): { label: string; color: string } => {
  if (item.status === 'SYNCED_TO_RAB') return { label: 'Terhubung RAB', color: '#16A34A' };
  if (item.status === 'VERIFIED') return { label: 'Terverifikasi', color: '#2563EB' };
  return { label: 'Terhitung', color: '#F59E0B' };
};

export const MobileQtoRekap: React.FC<MobileQtoRekapProps> = ({ onNavigateToCalculator }) => {
  const {
    currentProject,
    projectQtoItems,
    deleteQtoItem,
    syncQtoToRabSpreadsheet,
  } = useProject();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategoryTab, setActiveCategoryTab] = useState<CategoryTab>('semua');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (text: string) => {
    setToastMsg(text);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryTab, number> = {
      semua: projectQtoItems.length,
      struktur: 0,
      arsitektur: 0,
      mep: 0,
      lainnya: 0,
    };
    projectQtoItems.forEach((item) => {
      counts[getQtoCategoryOfItem(item)] += 1;
    });
    return counts;
  }, [projectQtoItems]);

  // Penyaringan sama dengan view desktop (tab kategori + pencarian atas
  // uraian/kode/calculatorId/parameter/run).
  const filteredQtoItems = useMemo(() => {
    return projectQtoItems.filter((item) => {
      if (activeCategoryTab !== 'semua' && getQtoCategoryOfItem(item) !== activeCategoryTab) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const paramString = Object.entries(item.parameterSnapshot || {})
          .map(([k, v]) => `${k}=${v}`)
          .join(' ');
        const matches =
          item.uraian.toLowerCase().includes(q) ||
          item.kode.toLowerCase().includes(q) ||
          (item.calculatorId ? item.calculatorId.toLowerCase().includes(q) : false) ||
          paramString.toLowerCase().includes(q) ||
          item.calculationRunId?.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [projectQtoItems, activeCategoryTab, searchQuery]);

  // Pengelompokan bawaan desktop: per seksi kategori (groupBy 'kategori').
  const groupedQtoItems = useMemo(() => {
    const groups: Array<{ heading: string; items: QTOItem[] }> = [];
    const byHeading = new Map<string, QTOItem[]>();
    filteredQtoItems.forEach((item) => {
      const heading = getQtoSectionHeadingOfItem(item);
      if (!byHeading.has(heading)) {
        byHeading.set(heading, []);
        groups.push({ heading, items: byHeading.get(heading)! });
      }
      byHeading.get(heading)!.push(item);
    });
    return groups;
  }, [filteredQtoItems]);

  const verifiedPercentage =
    projectQtoItems.length > 0
      ? Math.round((projectQtoItems.filter((i) => i.status === 'VERIFIED').length / projectQtoItems.length) * 100)
      : 0;

  const toggleSelectItem = (id: string) => {
    setSelectedItemIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  // Semantik identik bulk action desktop: sinkron per item dalam
  // try/catch, laporkan berhasil/gagal, kosongkan pilihan.
  const handleBulkSyncToRab = () => {
    let ok = 0;
    let failed = 0;
    selectedItemIds.forEach((id) => {
      try {
        syncQtoToRabSpreadsheet(id);
        ok++;
      } catch {
        failed++;
      }
    });
    if (ok > 0) showToast(`${ok} item QTO berhasil disinkronkan ke RAB.`);
    if (failed > 0) showToast(`${failed} item gagal disinkronkan (data tidak lengkap / proyek tidak aktif).`);
    setSelectedItemIds([]);
    setSelectMode(false);
  };

  const handleBulkDelete = () => {
    if (!confirm(`Hapus ${selectedItemIds.length} item QTO terpilih?`)) return;
    selectedItemIds.forEach((id) => deleteQtoItem(id));
    setSelectedItemIds([]);
    setSelectMode(false);
    showToast('Item QTO terpilih berhasil dihapus.');
  };

  const handleSyncOne = (item: QTOItem) => {
    try {
      syncQtoToRabSpreadsheet(item.id);
      showToast('Item QTO berhasil disinkronkan ke RAB.');
    } catch {
      showToast('Item gagal disinkronkan (data tidak lengkap / proyek tidak aktif).');
    }
  };

  const handleDeleteOne = (item: QTOItem) => {
    if (!confirm(`Hapus item "${item.uraian}"?`)) return;
    deleteQtoItem(item.id);
    setExpandedId(null);
    showToast('Item QTO berhasil dihapus.');
  };

  return (
    <div className="mnw-screen">
      <div className="mnw-eyebrow">Volume &amp; QTO</div>
      <h1 className="mnw-title">Rekapitulasi QTO</h1>
      <p className="mnw-sub">
        Semua volume dari Kalkulator Volume — {projectQtoItems.length} baris · {verifiedPercentage}% terverifikasi.
      </p>

      {currentProject && (
        <div className="mnw-projcard" style={{ marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mnw-projcard-name">{currentProject.name}</div>
            <div className="mnw-projcard-meta">
              {currentProject.id} · {projectQtoItems.length} baris volume
            </div>
          </div>
          <Ruler size={20} color="rgba(255,255,255,0.85)" />
        </div>
      )}

      <div className="mnw-search">
        <Search size={15} />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Cari uraian, kode, atau parameter…"
          aria-label="Cari item QTO"
        />
      </div>

      <div className="mnw-chips" role="tablist" aria-label="Kategori QTO">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeCategoryTab === tab.id}
            className={`mnw-chip${activeCategoryTab === tab.id ? ' is-active' : ''}`}
            onClick={() => setActiveCategoryTab(tab.id)}
          >
            {tab.label} ({categoryCounts[tab.id]})
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button
          type="button"
          className="mnw-chip"
          onClick={() => {
            setSelectMode((v) => !v);
            setSelectedItemIds([]);
          }}
          aria-pressed={selectMode}
        >
          {selectMode ? 'Batal Pilih' : 'Pilih Item'}
        </button>
      </div>

      {projectQtoItems.length === 0 ? (
        <div className="mnw-empty" style={{ marginTop: 14 }}>
          <Ruler size={26} color="#94A3B8" />
          <p style={{ margin: 0 }}>
            Belum ada volume tersimpan untuk proyek ini.
            <br />
            Hitung volume pertama lewat Kalkulator Volume.
          </p>
          <button type="button" className="mnw-action-btn primary" style={{ flex: 'none', padding: '10px 18px' }} onClick={() => onNavigateToCalculator?.()}>
            <Calculator size={14} /> Buka Kalkulator Volume
          </button>
        </div>
      ) : filteredQtoItems.length === 0 ? (
        <div className="mnw-empty" style={{ marginTop: 14 }}>
          <Search size={26} color="#94A3B8" />
          <p style={{ margin: 0 }}>Tidak ada item yang cocok dengan pencarian/filter ini.</p>
        </div>
      ) : (
        groupedQtoItems.map((group) => (
          <section key={group.heading}>
            <div className="mnw-group-title">{group.heading}</div>
            <div className="mnw-qto-list">
              {group.items.map((item) => {
                const meta = statusMeta(item);
                const isExpanded = expandedId === item.id;
                const isSelected = selectedItemIds.includes(item.id);
                const params = Object.entries(item.parameterSnapshot || {});
                return (
                  <div key={item.id}>
                    <button
                      type="button"
                      className="mnw-qto-row"
                      onClick={() => {
                        if (selectMode) toggleSelectItem(item.id);
                        else setExpandedId(isExpanded ? null : item.id);
                      }}
                      aria-expanded={selectMode ? undefined : isExpanded}
                    >
                      {selectMode && (
                        <span className={`mnw-qto-check${isSelected ? ' is-on' : ''}`} aria-hidden="true">
                          {isSelected && <Check size={13} strokeWidth={3} />}
                        </span>
                      )}
                      <span className="mnw-qto-main">
                        <span className="mnw-qto-name">{item.uraian}</span>
                        <span className="mnw-qto-meta">
                          <span style={{ fontFamily: 'var(--ezrab-font-mono, monospace)' }}>{item.kode}</span>
                          <span className="mnw-status-dot" style={{ background: meta.color }} />
                          <span>{meta.label}</span>
                        </span>
                      </span>
                      <span className="mnw-qto-vol">
                        <span className="mnw-qto-vol-num">{formatNumberId(item.quantity || 0, 2)}</span>
                        <span className="mnw-qto-vol-unit">{item.unit}</span>
                      </span>
                      {!selectMode && (isExpanded ? <ChevronUp size={16} color="#94A3B8" /> : <ChevronDown size={16} color="#94A3B8" />)}
                    </button>
                    {isExpanded && !selectMode && (
                      <div className="mnw-qto-detail">
                        {params.length > 0 ? (
                          params.map(([k, v]) => (
                            <div key={k} className="mnw-param-row">
                              <span>{k}</span>
                              <b>{String(v)}</b>
                            </div>
                          ))
                        ) : (
                          <div className="mnw-param-row"><span>Tidak ada parameter tersimpan.</span></div>
                        )}
                        <div className="mnw-detail-actions">
                          {item.calculatorId && item.calculatorId !== 'MANUAL' && (
                            <button type="button" className="mnw-action-btn" onClick={() => onNavigateToCalculator?.(item.calculatorId, item.id)}>
                              <Calculator size={13} /> Buka di Kalkulator
                            </button>
                          )}
                          {item.status !== 'SYNCED_TO_RAB' && (
                            <button type="button" className="mnw-action-btn primary" onClick={() => handleSyncOne(item)}>
                              <Send size={13} /> Kirim ke RAB
                            </button>
                          )}
                          <button type="button" className="mnw-action-btn danger" onClick={() => handleDeleteOne(item)}>
                            <Trash2 size={13} /> Hapus
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}

      {selectMode && (
        <div className="mnw-stickybar">
          <div className="mnw-stickybar-main">
            <span className="mnw-stickybar-label">Item Dipilih</span>
            <span className="mnw-stickybar-value">{selectedItemIds.length} item</span>
          </div>
          <button type="button" className="mnw-stickybar-btn ghost" disabled={selectedItemIds.length === 0} onClick={handleBulkDelete}>
            <Trash2 size={14} /> Hapus
          </button>
          <button type="button" className="mnw-stickybar-btn" disabled={selectedItemIds.length === 0} onClick={handleBulkSyncToRab}>
            <Send size={14} /> Kirim ke RAB
          </button>
        </div>
      )}

      {toastMsg && (
        <div className="mnw-toast" role="status">
          <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <span>{toastMsg}</span>
            <X size={14} style={{ flexShrink: 0, marginTop: 2 }} onClick={() => setToastMsg(null)} />
          </span>
        </div>
      )}
    </div>
  );
};

export default MobileQtoRekap;

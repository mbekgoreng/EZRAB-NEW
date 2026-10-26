import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Edit2, Database, Search, Check, Layers, ExternalLink, Filter } from 'lucide-react';
import { listProjectAhspItems, saveProjectAhspFromCatalog, saveCustomProjectAhsp, removeProjectAhspItem } from '../../project-data/ahspBridge';
import type { ProjectAhspItem } from '../../project-data/types';
import { officialAhspRepository } from '../../data/nationalCostDatabase/officialAhspRepository';
import type { NationalAHSPItem } from '../../data/nationalCostDatabase/types';
import { priceResolver2026 } from '../../data/priceDatabase2026/resolver';

interface ProjectAhspViewProps {
  projectId: string;
  projectName?: string;
  onDataChanged?: () => void;
}

export const ProjectAhspView: React.FC<ProjectAhspViewProps> = ({
  projectId,
  projectName,
  onDataChanged,
}) => {
  const [items, setItems] = useState<ProjectAhspItem[]>([]);
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ProjectAhspItem | null>(null);

  // Search in catalog modal
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogDomain, setCatalogDomain] = useState<string>('ALL');
  // F-09: batas tampil bertahap (bukan potongan diam-diam 30).
  const [catalogVisibleCount, setCatalogVisibleCount] = useState(30);
  useEffect(() => { setCatalogVisibleCount(30); }, [catalogSearch, catalogDomain]);

  // Custom Form states
  const [ahspCode, setAhspCode] = useState('');
  const [description, setDescription] = useState('');
  const [unit, setUnit] = useState('m3');
  const [coefficients, setCoefficients] = useState<number>(1.0);
  const [materialCost, setMaterialCost] = useState<number>(0);
  const [laborCost, setLaborCost] = useState<number>(0);
  const [equipmentCost, setEquipmentCost] = useState<number>(0);

  const loadData = () => {
    if (!projectId) {
      setItems([]);
      return;
    }
    const list = listProjectAhspItems(projectId);
    setItems(list);
  };

  useEffect(() => {
    loadData();
  }, [projectId]);

  // Filtered Catalog Items (active only — quarantined excluded)
  const activeAhspItems = useMemo(() => officialAhspRepository.getActiveOfficialAhsp(), []);
  const filteredCatalog = useMemo(() => {
    return activeAhspItems.filter((item) => {
      const matchSearch =
        !catalogSearch ||
        item.code.toLowerCase().includes(catalogSearch.toLowerCase()) ||
        item.name.toLowerCase().includes(catalogSearch.toLowerCase());
      const matchDomain = catalogDomain === 'ALL' || item.domain === catalogDomain;
      return matchSearch && matchDomain;
    });
  }, [catalogSearch, catalogDomain, activeAhspItems]);
  // F-09: yang dirender hanya jendela pertama; totalnya selalu ditampilkan.
  const visibleCatalog = filteredCatalog.slice(0, catalogVisibleCount);

  const handleSelectCatalogItem = (catItem: NationalAHSPItem) => {
    if (!projectId) return;
    // Gate yang sama semantiknya dengan jalur explorer (regresi F-03):
    // MISSING — atau tanpa harga tampil — tidak boleh masuk daftar AHSP
    // Proyek sebagai final. PARTIAL tetap boleh dipilih, tapi wajib bertanda
    // parsial (lihat badge di picker dan tabel tersimpan).
    const comp = priceResolver2026.resolveAhspUnitPrice(catItem);
    if (comp.pricingStatus === 'MISSING' || comp.unitPrice == null || comp.unitPrice <= 0) return;
    saveProjectAhspFromCatalog(projectId, catItem);
    setShowCatalogModal(false);
    loadData();
    onDataChanged?.();
  };

  // Peta kode → item katalog untuk derivasi status baris tersimpan (F-03).
  const catalogByCode = useMemo(() => {
    const m = new Map<string, NationalAHSPItem>();
    for (const it of activeAhspItems) if (!m.has(it.code)) m.set(it.code, it);
    return m;
  }, [activeAhspItems]);

  // Status kelengkapan baris tersimpan: resolve langsung dari katalog bila ada
  // (paling segar, dan menutupi baris lama yang tersimpan tanpa status);
  // bila tidak ada di katalog, pakai status yang tersimpan di bridge.
  // Item kustom tanpa katalog → null (tanpa badge).
  const savedItemStatus = (item: ProjectAhspItem): { status: string; missing: number; total: number } | null => {
    const cat = catalogByCode.get(item.ahspCode);
    if (cat) {
      const comp = priceResolver2026.resolveAhspUnitPrice(cat);
      return { status: comp.pricingStatus, missing: comp.missingComponents, total: comp.totalComponents };
    }
    if (item.pricingStatus) {
      return { status: item.pricingStatus, missing: item.missingComponents ?? 0, total: item.totalComponents ?? 0 };
    }
    return null;
  };

  const handleOpenCustomAdd = () => {
    setEditingItem(null);
    setAhspCode('');
    setDescription('');
    setUnit('m3');
    setCoefficients(1.0);
    setMaterialCost(0);
    setLaborCost(0);
    setEquipmentCost(0);
    setShowCustomModal(true);
  };

  const handleOpenEdit = (item: ProjectAhspItem) => {
    setEditingItem(item);
    setAhspCode(item.ahspCode || '');
    setDescription(item.description || '');
    setUnit(item.unit || 'm3');
    setCoefficients(item.coefficients ?? 1.0);
    setMaterialCost(item.materialCost || 0);
    setLaborCost(item.laborCost || 0);
    setEquipmentCost(item.equipmentCost || 0);
    setShowCustomModal(true);
  };

  const handleSaveCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ahspCode.trim() || !description.trim() || !projectId) return;

    saveCustomProjectAhsp(projectId, {
      ahspCode: ahspCode.trim(),
      description: description.trim(),
      unit: unit.trim(),
      coefficients: Number(coefficients) || 1.0,
      materialCost: Number(materialCost) || 0,
      laborCost: Number(laborCost) || 0,
      equipmentCost: Number(equipmentCost) || 0,
    });

    setShowCustomModal(false);
    loadData();
    onDataChanged?.();
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Hapus analisa AHSP ini dari proyek?')) {
      removeProjectAhspItem(projectId, id);
      loadData();
      onDataChanged?.();
    }
  };

  return (
    <div style={{ background: 'var(--ez-color-surface)', borderRadius: 'var(--ez-radius-control)', border: '1px solid var(--ez-color-border-line)', padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 750, color: 'var(--ez-color-text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Database size={20} color="var(--ez-hue-blue-text)" />
            Daftar Analisa Harga Satuan Pekerjaan (AHSP) Proyek
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--ez-color-text-muted)' }}>
            Kompilasi AHSP spesifik untuk proyek {projectName ? `"${projectName}"` : ''} (tersimpan scoped per proyek).
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowCatalogModal(true)}
            disabled={!projectId}
            style={{
              background: 'var(--ez-color-surface-tertiary)',
              color: 'var(--ez-color-text-strong)',
              border: '1px solid var(--ez-hue-slate-border)',
              borderRadius: 8,
              padding: '9px 14px',
              fontSize: 13,
              fontWeight: 650,
              cursor: projectId ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Search size={15} /> Pilih dari Katalog AHSP
          </button>
          <button
            onClick={handleOpenCustomAdd}
            disabled={!projectId}
            style={{
              background: 'var(--ez-color-primary)',
              color: '#FFFFFF',
              border: 0,
              borderRadius: 8,
              padding: '9px 16px',
              fontSize: 13,
              fontWeight: 650,
              cursor: projectId ? 'pointer' : 'not-allowed',
              opacity: projectId ? 1 : 0.6,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Plus size={16} /> Analisa Kustom
          </button>
        </div>
      </div>

      {/* Table / Empty State */}
      {items.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '40px 20px',
            background: 'var(--ez-color-surface-secondary)',
            borderRadius: 10,
            border: '1px dashed var(--ez-hue-slate-border)',
          }}
        >
          <Layers size={36} color="#94A3B8" style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ez-color-text-body)' }}>Belum ada AHSP terpilih untuk proyek ini</div>
          <p style={{ fontSize: 12.5, color: 'var(--ez-color-text-muted)', maxWidth: 460, margin: '6px auto 14px' }}>
            Dokumen AHSP Lampiran Tender membutuhkan daftar analisa harga satuan aktual yang digunakan dalam proyek ini.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
            <button
              onClick={() => setShowCatalogModal(true)}
              disabled={!projectId}
              style={{
                background: 'var(--ez-color-primary)',
                color: '#FFFFFF',
                border: 0,
                borderRadius: 6,
                padding: '8px 16px',
                fontSize: 12.5,
                fontWeight: 650,
                cursor: 'pointer',
              }}
            >
              + Buka Katalog AHSP Nasional
            </button>
          </div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: 'var(--ez-color-surface-secondary)', borderBottom: '1px solid var(--ez-color-border-line)', color: 'var(--ez-color-text-slate)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>No</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Kode AHSP</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Uraian Analisa Pekerjaan</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Satuan</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Biaya Bahan</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Biaya Upah</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Biaya Alat</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Harga Satuan</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const totalUnitPrice = (item.materialCost || 0) + (item.laborCost || 0) + (item.equipmentCost || 0);
                const st = savedItemStatus(item);
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--ez-color-surface-tertiary)' }}>
                    <td style={{ padding: '10px 12px', color: 'var(--ez-color-text-muted)' }}>{idx + 1}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--ez-color-primary)' }}>{item.ahspCode}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--ez-color-text-primary)', maxWidth: 280 }}>
                      {item.description}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--ez-color-text-muted)' }}>{item.unit}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--ez-color-text-body)' }}>
                      Rp {(item.materialCost || 0).toLocaleString('id-ID')}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--ez-color-text-body)' }}>
                      Rp {(item.laborCost || 0).toLocaleString('id-ID')}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--ez-color-text-body)' }}>
                      Rp {(item.equipmentCost || 0).toLocaleString('id-ID')}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--ez-hue-green-text-bright)' }}>
                      Rp {totalUnitPrice.toLocaleString('id-ID')}
                      {st && st.status === 'PARTIAL' ? (
                        <div title={`Harga parsial — ${st.total - st.missing}/${st.total} komponen terisi`} style={{ fontSize: 11, fontWeight: 700, color: 'var(--ez-hue-amber-text)' }}>
                          ◐ Harga parsial*
                        </div>
                      ) : null}
                      {st && st.status === 'MISSING' ? (
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ez-color-text-muted)' }}>
                          — Harga belum tersedia
                        </div>
                      ) : null}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button
                          onClick={() => handleOpenEdit(item)}
                          style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--ez-color-text-muted)', padding: 4 }}
                          title="Edit AHSP"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#EF4444', padding: 4 }}
                          title="Hapus AHSP"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal 1: Pick from National AHSP Catalog */}
      {showCatalogModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: 'var(--ez-color-surface)',
              borderRadius: 'var(--ez-radius-control)',
              width: '100%',
              maxWidth: 750,
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              padding: 24,
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h4 style={{ margin: 0, fontSize: 16, fontWeight: 750, color: 'var(--ez-color-text-primary)' }}>
                Pilih dari Database AHSP Nasional 2026
              </h4>
              <button
                onClick={() => setShowCatalogModal(false)}
                style={{ border: 0, background: 'transparent', fontSize: 18, cursor: 'pointer', color: 'var(--ez-color-text-muted)' }}
              >
                ✕
              </button>
            </div>

            {/* Filter & Search Bar */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: '#94A3B8' }} />
                <input
                  type="text"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="Cari kode atau nama analisa (misal: galian, beton, pasangan batu)..."
                  style={{ width: '100%', padding: '8px 12px 8px 32px', borderRadius: 6, border: '1px solid var(--ez-hue-slate-border)', fontSize: 13 }}
                />
              </div>
              <select
                value={catalogDomain}
                onChange={(e) => setCatalogDomain(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--ez-hue-slate-border)', fontSize: 13 }}
              >
                <option value="ALL">Semua Domain</option>
                <option value="CIPTA_KARYA">Cipta Karya (Gedung)</option>
                <option value="BINA_MARGA">Bina Marga (Jalan/Jembatan)</option>
                <option value="SUMBER_DAYA_AIR">SDA (Irigasi/Sungai)</option>
                <option value="SMKK">SMKK (Keselamatan K3)</option>
              </select>
            </div>

            {/* Items List */}
            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--ez-color-border-line)', borderRadius: 8 }}>
              {filteredCatalog.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 30, color: 'var(--ez-color-text-muted)', fontSize: 13 }}>
                  Tidak ada analisa yang sesuai dengan pencarian.
                </div>
              ) : (
                <>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--ez-color-surface-secondary)', borderBottom: '1px solid var(--ez-color-border-line)', position: 'sticky', top: 0 }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left' }}>Kode</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left' }}>Uraian Analisa</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>Satuan</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Harga Satuan</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>Pilih</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCatalog.map((catItem) => {
                      const comp = priceResolver2026.resolveAhspUnitPrice(catItem);
                      const unitPrice = comp.unitPrice;
                      // MISSING — atau tanpa harga tampil — tidak dapat dipilih
                      // sebagai final (F-03). PARTIAL boleh dipilih, bertanda.
                      const selectable = comp.pricingStatus !== 'MISSING' && unitPrice != null && unitPrice > 0;
                      return (
                        <tr key={catItem.id} style={{ borderBottom: '1px solid var(--ez-color-surface-tertiary)' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--ez-color-primary)' }}>{catItem.code}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--ez-color-text-primary)' }}>{catItem.name}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'center', color: 'var(--ez-color-text-muted)' }}>{catItem.unit}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 650, color: unitPrice ? 'var(--ez-hue-green-text-bright)' : '#94A3B8' }}>
                            {unitPrice ? `Rp ${unitPrice.toLocaleString('id-ID')}` : 'Belum ada harga'}
                            {comp.pricingStatus === 'PARTIAL' && unitPrice ? (
                              <div title={`Harga parsial — ${comp.resolvedComponents}/${comp.totalComponents} komponen terisi`} style={{ fontSize: 11, fontWeight: 700, color: 'var(--ez-hue-amber-text)' }}>
                                ◐ Harga parsial*
                              </div>
                            ) : null}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            <button
                              onClick={() => handleSelectCatalogItem(catItem)}
                              disabled={!selectable}
                              title={selectable ? 'Pilih analisa ini' : 'Harga belum tersedia — tidak dapat dipilih sebagai final'}
                              style={{
                                background: 'var(--ez-color-primary)',
                                color: '#FFFFFF',
                                border: 0,
                                borderRadius: 4,
                                padding: '5px 10px',
                                fontSize: 11.5,
                                fontWeight: 650,
                                cursor: selectable ? 'pointer' : 'not-allowed',
                                opacity: selectable ? 1 : 0.6,
                              }}
                            >
                              Pilih
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--ez-color-text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <span>Menampilkan {visibleCatalog.length} dari {filteredCatalog.length} analisa</span>
                  {visibleCatalog.length < filteredCatalog.length && (
                    <button
                      type="button"
                      onClick={() => setCatalogVisibleCount((c) => c + 30)}
                      style={{ background: 'transparent', border: '1px solid var(--ez-color-border-line)', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 650, color: 'var(--ez-color-primary)', cursor: 'pointer' }}
                    >
                      Muat lebih banyak
                    </button>
                  )}
                </div>
                </>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button
                onClick={() => setShowCatalogModal(false)}
                style={{ border: '1px solid var(--ez-hue-slate-border)', background: 'var(--ez-color-surface)', borderRadius: 6, padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Custom AHSP Add / Edit */}
      {showCustomModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: 'var(--ez-color-surface)',
              borderRadius: 'var(--ez-radius-control)',
              width: '100%',
              maxWidth: 520,
              padding: 24,
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            }}
          >
            <h4 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 750, color: 'var(--ez-color-text-primary)' }}>
              {editingItem ? 'Edit Analisa AHSP Proyek' : 'Tambah Analisa AHSP Kustom'}
            </h4>
            <form onSubmit={handleSaveCustom} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: 4 }}>
                    Kode AHSP *
                  </label>
                  <input
                    type="text"
                    required
                    value={ahspCode}
                    onChange={(e) => setAhspCode(e.target.value)}
                    placeholder="Contoh: A.2.2.1.9"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--ez-hue-slate-border)', fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: 4 }}>
                    Satuan Pengukuran *
                  </label>
                  <input
                    type="text"
                    required
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="Contoh: m3, m2, m', kg"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--ez-hue-slate-border)', fontSize: 13 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: 4 }}>
                  Uraian Analisa Pekerjaan *
                </label>
                <textarea
                  rows={2}
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Contoh: 1 m3 Pembongkaran Pasangan Batu Kali..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--ez-hue-slate-border)', fontSize: 13, resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: 4 }}>
                    Biaya Bahan (Rp)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={materialCost}
                    onChange={(e) => setMaterialCost(Number(e.target.value) || 0)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--ez-hue-slate-border)', fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: 4 }}>
                    Biaya Upah (Rp)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={laborCost}
                    onChange={(e) => setLaborCost(Number(e.target.value) || 0)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--ez-hue-slate-border)', fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: 4 }}>
                    Biaya Alat (Rp)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={equipmentCost}
                    onChange={(e) => setEquipmentCost(Number(e.target.value) || 0)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--ez-hue-slate-border)', fontSize: 13 }}
                  />
                </div>
              </div>

              <div style={{ background: 'var(--ez-color-surface-secondary)', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--ez-color-border-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--ez-color-text-slate)' }}>Total Harga Satuan:</span>
                <span style={{ fontSize: 14, fontWeight: 750, color: 'var(--ez-hue-green-text-bright)' }}>
                  Rp {(materialCost + laborCost + equipmentCost).toLocaleString('id-ID')} / {unit}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowCustomModal(false)}
                  style={{
                    border: '1px solid var(--ez-hue-slate-border)',
                    background: 'var(--ez-color-surface)',
                    borderRadius: 6,
                    padding: '8px 14px',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  style={{
                    background: 'var(--ez-color-primary)',
                    color: '#FFFFFF',
                    border: 0,
                    borderRadius: 6,
                    padding: '8px 16px',
                    fontSize: 13,
                    fontWeight: 650,
                    cursor: 'pointer',
                  }}
                >
                  Simpan Analisa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

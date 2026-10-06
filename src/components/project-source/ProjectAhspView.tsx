import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Edit2, Database, Search, Check, Layers, ExternalLink, Filter } from 'lucide-react';
import { listProjectAhspItems, saveProjectAhspFromCatalog, saveCustomProjectAhsp, removeProjectAhspItem } from '../../project-data/ahspBridge';
import type { ProjectAhspItem } from '../../project-data/types';
import { ALL_OFFICIAL_AHSP_ITEMS } from '../../data/nationalCostDatabase/masterRegistry';
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

  // Filtered Catalog Items
  const filteredCatalog = useMemo(() => {
    return ALL_OFFICIAL_AHSP_ITEMS.filter((item) => {
      const matchSearch =
        !catalogSearch ||
        item.code.toLowerCase().includes(catalogSearch.toLowerCase()) ||
        item.name.toLowerCase().includes(catalogSearch.toLowerCase());
      const matchDomain = catalogDomain === 'ALL' || item.domain === catalogDomain;
      return matchSearch && matchDomain;
    }).slice(0, 30);
  }, [catalogSearch, catalogDomain]);

  const handleSelectCatalogItem = (catItem: NationalAHSPItem) => {
    if (!projectId) return;
    saveProjectAhspFromCatalog(projectId, catItem);
    setShowCatalogModal(false);
    loadData();
    onDataChanged?.();
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
    <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 750, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Database size={20} color="#2563EB" />
            Daftar Analisa Harga Satuan Pekerjaan (AHSP) Proyek
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748B' }}>
            Kompilasi AHSP spesifik untuk proyek {projectName ? `"${projectName}"` : ''} (tersimpan scoped per proyek).
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowCatalogModal(true)}
            disabled={!projectId}
            style={{
              background: '#F1F5F9',
              color: '#1E293B',
              border: '1px solid #CBD5E1',
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
              background: '#2563EB',
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
            background: '#F8FAFC',
            borderRadius: 10,
            border: '1px dashed #CBD5E1',
          }}
        >
          <Layers size={36} color="#94A3B8" style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 14, fontWeight: 700, color: '#334155' }}>Belum ada AHSP terpilih untuk proyek ini</div>
          <p style={{ fontSize: 12.5, color: '#64748B', maxWidth: 460, margin: '6px auto 14px' }}>
            Dokumen AHSP Lampiran Tender membutuhkan daftar analisa harga satuan aktual yang digunakan dalam proyek ini.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
            <button
              onClick={() => setShowCatalogModal(true)}
              disabled={!projectId}
              style={{
                background: '#2563EB',
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
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
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
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '10px 12px', color: '#64748B' }}>{idx + 1}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: '#2563EB' }}>{item.ahspCode}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0F172A', maxWidth: 280 }}>
                      {item.description}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: '#64748B' }}>{item.unit}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#334155' }}>
                      Rp {(item.materialCost || 0).toLocaleString('id-ID')}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#334155' }}>
                      Rp {(item.laborCost || 0).toLocaleString('id-ID')}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#334155' }}>
                      Rp {(item.equipmentCost || 0).toLocaleString('id-ID')}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#16A34A' }}>
                      Rp {totalUnitPrice.toLocaleString('id-ID')}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button
                          onClick={() => handleOpenEdit(item)}
                          style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#64748B', padding: 4 }}
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
              background: '#FFFFFF',
              borderRadius: 12,
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
              <h4 style={{ margin: 0, fontSize: 16, fontWeight: 750, color: '#0F172A' }}>
                Pilih dari Database AHSP Nasional 2026
              </h4>
              <button
                onClick={() => setShowCatalogModal(false)}
                style={{ border: 0, background: 'transparent', fontSize: 18, cursor: 'pointer', color: '#64748B' }}
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
                  style={{ width: '100%', padding: '8px 12px 8px 32px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 13 }}
                />
              </div>
              <select
                value={catalogDomain}
                onChange={(e) => setCatalogDomain(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 13 }}
              >
                <option value="ALL">Semua Domain</option>
                <option value="CIPTA_KARYA">Cipta Karya (Gedung)</option>
                <option value="BINA_MARGA">Bina Marga (Jalan/Jembatan)</option>
                <option value="SUMBER_DAYA_AIR">SDA (Irigasi/Sungai)</option>
                <option value="SMKK">SMKK (Keselamatan K3)</option>
              </select>
            </div>

            {/* Items List */}
            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: 8 }}>
              {filteredCatalog.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 30, color: '#64748B', fontSize: 13 }}>
                  Tidak ada analisa yang sesuai dengan pencarian.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', position: 'sticky', top: 0 }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left' }}>Kode</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left' }}>Uraian Analisa</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>Satuan</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Harga Satuan</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>Pilih</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCatalog.map((catItem) => {
                      const comp = priceResolver2026.resolveAhspUnitPrice(catItem);
                      const unitPrice = comp.unitPrice;
                      return (
                        <tr key={catItem.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 700, color: '#2563EB' }}>{catItem.code}</td>
                          <td style={{ padding: '8px 10px', color: '#0F172A' }}>{catItem.name}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'center', color: '#64748B' }}>{catItem.unit}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 650, color: unitPrice ? '#16A34A' : '#94A3B8' }}>
                            {unitPrice ? `Rp ${unitPrice.toLocaleString('id-ID')}` : 'Belum ada harga'}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            <button
                              onClick={() => handleSelectCatalogItem(catItem)}
                              style={{
                                background: '#2563EB',
                                color: '#FFFFFF',
                                border: 0,
                                borderRadius: 4,
                                padding: '5px 10px',
                                fontSize: 11.5,
                                fontWeight: 650,
                                cursor: 'pointer',
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
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button
                onClick={() => setShowCatalogModal(false)}
                style={{ border: '1px solid #CBD5E1', background: '#FFFFFF', borderRadius: 6, padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}
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
              background: '#FFFFFF',
              borderRadius: 12,
              width: '100%',
              maxWidth: 520,
              padding: 24,
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            }}
          >
            <h4 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 750, color: '#0F172A' }}>
              {editingItem ? 'Edit Analisa AHSP Proyek' : 'Tambah Analisa AHSP Kustom'}
            </h4>
            <form onSubmit={handleSaveCustom} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: '#334155', marginBottom: 4 }}>
                    Kode AHSP *
                  </label>
                  <input
                    type="text"
                    required
                    value={ahspCode}
                    onChange={(e) => setAhspCode(e.target.value)}
                    placeholder="Contoh: A.2.2.1.9"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: '#334155', marginBottom: 4 }}>
                    Satuan Pengukuran *
                  </label>
                  <input
                    type="text"
                    required
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="Contoh: m3, m2, m', kg"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 13 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: '#334155', marginBottom: 4 }}>
                  Uraian Analisa Pekerjaan *
                </label>
                <textarea
                  rows={2}
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Contoh: 1 m3 Pembongkaran Pasangan Batu Kali..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 13, resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: '#334155', marginBottom: 4 }}>
                    Biaya Bahan (Rp)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={materialCost}
                    onChange={(e) => setMaterialCost(Number(e.target.value) || 0)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: '#334155', marginBottom: 4 }}>
                    Biaya Upah (Rp)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={laborCost}
                    onChange={(e) => setLaborCost(Number(e.target.value) || 0)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: '#334155', marginBottom: 4 }}>
                    Biaya Alat (Rp)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={equipmentCost}
                    onChange={(e) => setEquipmentCost(Number(e.target.value) || 0)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 13 }}
                  />
                </div>
              </div>

              <div style={{ background: '#F8FAFC', padding: '10px 12px', borderRadius: 6, border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12.5, fontWeight: 650, color: '#475569' }}>Total Harga Satuan:</span>
                <span style={{ fontSize: 14, fontWeight: 750, color: '#16A34A' }}>
                  Rp {(materialCost + laborCost + equipmentCost).toLocaleString('id-ID')} / {unit}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowCustomModal(false)}
                  style={{
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
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
                    background: '#2563EB',
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

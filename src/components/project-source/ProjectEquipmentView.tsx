import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Truck, ShieldCheck, Wrench } from 'lucide-react';
import { ProjectDataRepository, createProjectEntity } from '../../project-data/repository';
import type { ProjectEquipment } from '../../project-data/types';

interface ProjectEquipmentViewProps {
  projectId: string;
  projectName?: string;
  onDataChanged?: () => void;
}

export const ProjectEquipmentView: React.FC<ProjectEquipmentViewProps> = ({
  projectId,
  projectName,
  onDataChanged,
}) => {
  const [items, setItems] = useState<ProjectEquipment[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ProjectEquipment | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [capacity, setCapacity] = useState('');
  const [condition, setCondition] = useState('Baik');
  const [owner, setOwner] = useState('Milik Sendiri');

  const repo = new ProjectDataRepository<ProjectEquipment>('equipment', projectId);

  const loadData = () => {
    if (!projectId) {
      setItems([]);
      return;
    }
    const list = repo.list();
    setItems(list);
  };

  useEffect(() => {
    loadData();
  }, [projectId]);

  const handleOpenAdd = () => {
    setEditingItem(null);
    setName('');
    setType('');
    setQuantity(1);
    setCapacity('');
    setCondition('Baik');
    setOwner('Milik Sendiri');
    setShowModal(true);
  };

  const handleOpenEdit = (item: ProjectEquipment) => {
    setEditingItem(item);
    setName(item.name || '');
    setType(item.type || '');
    setQuantity(item.quantity ?? 1);
    setCapacity(item.capacity || '');
    setCondition(item.condition || 'Baik');
    setOwner(item.owner || 'Milik Sendiri');
    setShowModal(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (editingItem) {
      repo.update(editingItem.id, {
        name: name.trim(),
        type: type.trim(),
        quantity: Number(quantity) || 1,
        capacity: capacity.trim(),
        condition: condition.trim(),
        owner: owner.trim(),
      });
    } else {
      const newEntity = createProjectEntity<ProjectEquipment>(projectId, {
        name: name.trim(),
        type: type.trim(),
        quantity: Number(quantity) || 1,
        capacity: capacity.trim(),
        condition: condition.trim(),
        owner: owner.trim(),
      });
      repo.save(newEntity);
    }

    setShowModal(false);
    loadData();
    onDataChanged?.();
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Hapus peralatan ini dari daftar proyek?')) {
      repo.remove(id);
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
            <Truck size={20} color="#2563EB" />
            Daftar Peralatan Utama & Pendukung Proyek
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--ez-color-text-muted)' }}>
            Data peralatan berstandar tender untuk proyek {projectName ? `"${projectName}"` : ''} (tersimpan scoped per proyek).
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
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
          <Plus size={16} /> Tambah Peralatan
        </button>
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
          <Wrench size={36} color="#94A3B8" style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ez-color-text-body)' }}>Belum ada data peralatan proyek</div>
          <p style={{ fontSize: 12.5, color: 'var(--ez-color-text-muted)', maxWidth: 420, margin: '6px auto 14px' }}>
            Dokumen teknis seperti Daftar Alat & Personil dan Metode Pelaksanaan membutuhkan data peralatan aktual proyek.
          </p>
          <button
            onClick={handleOpenAdd}
            disabled={!projectId}
            style={{
              background: 'var(--ez-color-surface)',
              border: '1px solid var(--ez-hue-slate-border)',
              color: 'var(--ez-color-primary)',
              borderRadius: 6,
              padding: '7px 14px',
              fontSize: 12.5,
              fontWeight: 650,
              cursor: 'pointer',
            }}
          >
            + Tambah Peralatan Sekarang
          </button>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: 'var(--ez-color-surface-secondary)', borderBottom: '1px solid var(--ez-color-border-line)', color: 'var(--ez-color-text-slate)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>No</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Nama Peralatan</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Jenis / Tipe</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Jumlah</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Kapasitas / Spesifikasi</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Kondisi</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Status Kepemilikan</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--ez-color-surface-tertiary)' }}>
                  <td style={{ padding: '10px 12px', color: 'var(--ez-color-text-muted)' }}>{idx + 1}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 650, color: 'var(--ez-color-text-primary)' }}>{item.name}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--ez-color-primary)', fontWeight: 600 }}>{item.type || '—'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700 }}>{item.quantity ?? 1} unit</td>
                  <td style={{ padding: '10px 12px', color: 'var(--ez-color-text-body)' }}>{item.capacity || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 650,
                        background: (item.condition || '').toLowerCase() === 'baik' ? 'var(--ez-hue-green-bg)' : 'var(--ez-hue-amber-bg)',
                        color: (item.condition || '').toLowerCase() === 'baik' ? '#15803D' : '#B45309',
                      }}
                    >
                      {item.condition || 'Baik'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--ez-color-text-body)' }}>{item.owner || 'Milik Sendiri'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button
                        onClick={() => handleOpenEdit(item)}
                        style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--ez-color-text-muted)', padding: 4 }}
                        title="Edit Peralatan"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#EF4444', padding: 4 }}
                        title="Hapus Peralatan"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Add / Edit */}
      {showModal && (
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
              maxWidth: 500,
              padding: 24,
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            }}
          >
            <h4 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 750, color: 'var(--ez-color-text-primary)' }}>
              {editingItem ? 'Edit Peralatan Proyek' : 'Tambah Peralatan Proyek'}
            </h4>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: 4 }}>
                  Nama Alat *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Excavator / Dump Truck / Concrete Mixer"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--ez-hue-slate-border)', fontSize: 13 }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: 4 }}>
                    Jenis / Tipe
                  </label>
                  <input
                    type="text"
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    placeholder="Contoh: PC 200 / 8 Ton"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--ez-hue-slate-border)', fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: 4 }}>
                    Jumlah Unit *
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value) || 1)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--ez-hue-slate-border)', fontSize: 13 }}
                  />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: 4 }}>
                  Kapasitas / Spesifikasi
                </label>
                <input
                  type="text"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder="Contoh: 0.9 m³ Bucket / 150 HP"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--ez-hue-slate-border)', fontSize: 13 }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: 4 }}>
                    Kondisi
                  </label>
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--ez-hue-slate-border)', fontSize: 13 }}
                  >
                    <option value="Baik">Baik (100% Siap Kerja)</option>
                    <option value="Sedang">Sedang (Dalam Perawatan)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: 4 }}>
                    Status Kepemilikan
                  </label>
                  <select
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--ez-hue-slate-border)', fontSize: 13 }}
                  >
                    <option value="Milik Sendiri">Milik Sendiri</option>
                    <option value="Sewa">Sewa / Rental</option>
                    <option value="Dukungan">Surat Dukungan Distributor</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
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
                  Simpan Peralatan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

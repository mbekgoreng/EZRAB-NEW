import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, UserCheck, Shield, Award, Briefcase, FileText } from 'lucide-react';
import { ProjectDataRepository, createProjectEntity } from '../../project-data/repository';
import type { ProjectPersonnel } from '../../project-data/types';

interface ProjectPersonnelViewProps {
  projectId: string;
  projectName?: string;
  onDataChanged?: () => void;
}

export const ProjectPersonnelView: React.FC<ProjectPersonnelViewProps> = ({
  projectId,
  projectName,
  onDataChanged,
}) => {
  const [items, setItems] = useState<ProjectPersonnel[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ProjectPersonnel | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [qualification, setQualification] = useState('');
  const [experience, setExperience] = useState('');
  const [responsibility, setResponsibility] = useState('');

  const repo = new ProjectDataRepository<ProjectPersonnel>('personnel', projectId);

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
    setPosition('');
    setQualification('');
    setExperience('');
    setResponsibility('');
    setShowModal(true);
  };

  const handleOpenEdit = (item: ProjectPersonnel) => {
    setEditingItem(item);
    setName(item.name || '');
    setPosition(item.position || '');
    setQualification(item.qualification || '');
    setExperience(item.experience || '');
    setResponsibility(item.responsibility || '');
    setShowModal(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !position.trim()) return;

    if (editingItem) {
      repo.update(editingItem.id, {
        name: name.trim(),
        position: position.trim(),
        qualification: qualification.trim(),
        experience: experience.trim(),
        responsibility: responsibility.trim(),
      });
    } else {
      const newEntity = createProjectEntity<ProjectPersonnel>(projectId, {
        name: name.trim(),
        position: position.trim(),
        qualification: qualification.trim(),
        experience: experience.trim(),
        responsibility: responsibility.trim(),
      });
      repo.save(newEntity);
    }

    setShowModal(false);
    loadData();
    onDataChanged?.();
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Hapus personil ini dari daftar proyek?')) {
      repo.remove(id);
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
            <UserCheck size={20} color="#2563EB" />
            Daftar Personil Manajerial & Teknis Proyek
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748B' }}>
            Data personil berstandar tender untuk proyek {projectName ? `"${projectName}"` : ''} (tersimpan scoped per proyek).
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
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
          <Plus size={16} /> Tambah Personil
        </button>
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
          <Briefcase size={36} color="#94A3B8" style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 14, fontWeight: 700, color: '#334155' }}>Belum ada data personil proyek</div>
          <p style={{ fontSize: 12.5, color: '#64748B', maxWidth: 420, margin: '6px auto 14px' }}>
            Dokumen seperti Surat Pernyataan Sedia Personil dan Daftar Alat & Personil membutuhkan data personil aktual proyek.
          </p>
          <button
            onClick={handleOpenAdd}
            disabled={!projectId}
            style={{
              background: '#FFFFFF',
              border: '1px solid #CBD5E1',
              color: '#2563EB',
              borderRadius: 6,
              padding: '7px 14px',
              fontSize: 12.5,
              fontWeight: 650,
              cursor: 'pointer',
            }}
          >
            + Tambah Personil Sekarang
          </button>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>No</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Nama Lengkap</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Jabatan / Posisi</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Kualifikasi / Pendidikan</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Pengalaman</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Tugas & Tanggung Jawab</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '10px 12px', color: '#64748B' }}>{idx + 1}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 650, color: '#0F172A' }}>{item.name}</td>
                  <td style={{ padding: '10px 12px', color: '#2563EB', fontWeight: 600 }}>{item.position}</td>
                  <td style={{ padding: '10px 12px', color: '#334155' }}>{item.qualification || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#334155' }}>{item.experience || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#64748B', maxWidth: 220 }}>{item.responsibility || '—'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button
                        onClick={() => handleOpenEdit(item)}
                        style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#64748B', padding: 4 }}
                        title="Edit Personil"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#EF4444', padding: 4 }}
                        title="Hapus Personil"
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
              background: '#FFFFFF',
              borderRadius: 12,
              width: '100%',
              maxWidth: 500,
              padding: 24,
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            }}
          >
            <h4 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 750, color: '#0F172A' }}>
              {editingItem ? 'Edit Personil Proyek' : 'Tambah Personil Proyek'}
            </h4>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: '#334155', marginBottom: 4 }}>
                  Nama Lengkap *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Ir. Hendra Saputra, S.T., M.T."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 13 }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: '#334155', marginBottom: 4 }}>
                  Jabatan / Posisi dalam Proyek *
                </label>
                <input
                  type="text"
                  required
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder="Contoh: Project Manager / Ahli K3 Konstruksi"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 13 }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: '#334155', marginBottom: 4 }}>
                    Kualifikasi / Sertifikasi
                  </label>
                  <input
                    type="text"
                    value={qualification}
                    onChange={(e) => setQualification(e.target.value)}
                    placeholder="Contoh: S1 Teknik Sipil / SKA Madya"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: '#334155', marginBottom: 4 }}>
                    Pengalaman Kerja
                  </label>
                  <input
                    type="text"
                    value={experience}
                    onChange={(e) => setExperience(e.target.value)}
                    placeholder="Contoh: 7 Tahun"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 13 }}
                  />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: '#334155', marginBottom: 4 }}>
                  Tugas & Tanggung Jawab Utama
                </label>
                <textarea
                  rows={2}
                  value={responsibility}
                  onChange={(e) => setResponsibility(e.target.value)}
                  placeholder="Uraian singkat tanggung jawab dalam proyek..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 13, resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
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
                  Simpan Personil
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, AlertTriangle, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { ProjectDataRepository, createProjectEntity } from '../../project-data/repository';
import type { ProjectJsaItem } from '../../project-data/types';

interface ProjectJsaViewProps {
  projectId: string;
  projectName?: string;
  onDataChanged?: () => void;
}

export const ProjectJsaView: React.FC<ProjectJsaViewProps> = ({
  projectId,
  projectName,
  onDataChanged,
}) => {
  const [items, setItems] = useState<ProjectJsaItem[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ProjectJsaItem | null>(null);

  // Form states
  const [activity, setActivity] = useState('');
  const [hazard, setHazard] = useState('');
  const [risk, setRisk] = useState('');
  const [control, setControl] = useState('');
  const [responsiblePerson, setResponsiblePerson] = useState('');
  const [ppe, setPpe] = useState('');

  const repo = new ProjectDataRepository<ProjectJsaItem>('jsa', projectId);

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
    setActivity('');
    setHazard('');
    setRisk('Sedang');
    setControl('');
    setResponsiblePerson('Petugas K3 Konstruksi');
    setPpe('Helm, Sepatu Safety, Rompi Reflektif, Sarung Tangan');
    setShowModal(true);
  };

  const handleOpenEdit = (item: ProjectJsaItem) => {
    setEditingItem(item);
    setActivity(item.activity || '');
    setHazard(item.hazard || '');
    setRisk(item.risk || 'Sedang');
    setControl(item.control || '');
    setResponsiblePerson(item.responsiblePerson || '');
    setPpe(item.ppe || '');
    setShowModal(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activity.trim() || !hazard.trim() || !control.trim()) return;

    if (editingItem) {
      repo.update(editingItem.id, {
        activity: activity.trim(),
        hazard: hazard.trim(),
        risk: risk.trim(),
        control: control.trim(),
        responsiblePerson: responsiblePerson.trim(),
        ppe: ppe.trim(),
      });
    } else {
      const newEntity = createProjectEntity<ProjectJsaItem>(projectId, {
        activity: activity.trim(),
        hazard: hazard.trim(),
        risk: risk.trim(),
        control: control.trim(),
        responsiblePerson: responsiblePerson.trim(),
        ppe: ppe.trim(),
      });
      repo.save(newEntity);
    }

    setShowModal(false);
    loadData();
    onDataChanged?.();
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Hapus item analisis risiko K3 ini?')) {
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
            <ShieldAlert size={20} color="var(--ez-hue-amber-text-deep)" />
            Job Safety Analysis (JSA) & Identifikasi Bahaya K3
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--ez-color-text-muted)' }}>
            Analisis keselamatan kerja berstandar SMKK/HSE untuk proyek {projectName ? `"${projectName}"` : ''} (tersimpan scoped per proyek).
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
          <Plus size={16} /> Tambah Item JSA
        </button>
      </div>

      {/* Table / Empty State */}
      {items.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '40px 20px',
            background: 'var(--ez-hue-amber-bg)',
            borderRadius: 10,
            border: '1px dashed var(--ez-hue-amber-border)',
          }}
        >
          <AlertTriangle size={36} color="var(--ez-hue-amber-text-deep)" style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ez-hue-amber-text-dark)' }}>Belum ada data JSA / K3 proyek</div>
          <p style={{ fontSize: 12.5, color: 'var(--ez-hue-amber-text)', maxWidth: 460, margin: '6px auto 14px' }}>
            Dokumen HSE seperti JSA dan RKK memerlukan identifikasi bahaya, tingkat risiko, dan tindakan pengendalian mitigasi konkret.
          </p>
          <button
            onClick={handleOpenAdd}
            disabled={!projectId}
            style={{
              background: 'var(--ez-color-surface)',
              border: '1px solid #FCD34D',
              color: 'var(--ez-hue-amber-text)',
              borderRadius: 6,
              padding: '7px 14px',
              fontSize: 12.5,
              fontWeight: 650,
              cursor: 'pointer',
            }}
          >
            + Buat Identifikasi Bahaya Pertama
          </button>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: 'var(--ez-color-surface-secondary)', borderBottom: '1px solid var(--ez-color-border-line)', color: 'var(--ez-color-text-slate)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>No</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Uraian Aktivitas Kerja</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Potensi Bahaya</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Tingkat Risiko</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Tindakan Pengendalian</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>APD Wajib</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Penanggung Jawab</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--ez-color-surface-tertiary)' }}>
                  <td style={{ padding: '10px 12px', color: 'var(--ez-color-text-muted)' }}>{idx + 1}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 650, color: 'var(--ez-color-text-primary)' }}>{item.activity}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--ez-hue-rose-text)', fontWeight: 600 }}>{item.hazard}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 700,
                        background:
                          item.risk.toLowerCase().includes('tinggi') || item.risk.toLowerCase().includes('high')
                            ? 'var(--ez-hue-rose-bg)'
                            : item.risk.toLowerCase().includes('rendah') || item.risk.toLowerCase().includes('low')
                            ? 'var(--ez-hue-green-bg)'
                            : 'var(--ez-hue-amber-bg)',
                        color:
                          item.risk.toLowerCase().includes('tinggi') || item.risk.toLowerCase().includes('high')
                            ? 'var(--ez-hue-rose-text)'
                            : item.risk.toLowerCase().includes('rendah') || item.risk.toLowerCase().includes('low')
                            ? 'var(--ez-hue-green-text)'
                            : 'var(--ez-hue-amber-text)',
                      }}
                    >
                      {item.risk}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--ez-color-text-strong)', maxWidth: 220 }}>{item.control}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--ez-color-text-slate)', fontSize: 11.5 }}>{item.ppe || '—'}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--ez-color-text-body)' }}>{item.responsiblePerson || '—'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button
                        onClick={() => handleOpenEdit(item)}
                        style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--ez-color-text-muted)', padding: 4 }}
                        title="Edit JSA"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#EF4444', padding: 4 }}
                        title="Hapus JSA"
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
              maxWidth: 540,
              padding: 24,
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            }}
          >
            <h4 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 750, color: 'var(--ez-color-text-primary)' }}>
              {editingItem ? 'Edit Item JSA K3' : 'Tambah Identifikasi Bahaya K3 (JSA)'}
            </h4>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: 4 }}>
                  Aktivitas Pekerjaan *
                </label>
                <input
                  type="text"
                  required
                  value={activity}
                  onChange={(e) => setActivity(e.target.value)}
                  placeholder="Contoh: Pekerjaan Penggalian Tanah Pondasi > 2m"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--ez-hue-slate-border)', fontSize: 13 }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: 4 }}>
                    Potensi Bahaya *
                  </label>
                  <input
                    type="text"
                    required
                    value={hazard}
                    onChange={(e) => setHazard(e.target.value)}
                    placeholder="Contoh: Tebing galian longsor"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--ez-hue-slate-border)', fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: 4 }}>
                    Tingkat Risiko
                  </label>
                  <select
                    value={risk}
                    onChange={(e) => setRisk(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--ez-hue-slate-border)', fontSize: 13 }}
                  >
                    <option value="Tinggi">Tinggi (High Risk)</option>
                    <option value="Sedang">Sedang (Medium Risk)</option>
                    <option value="Rendah">Rendah (Low Risk)</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: 4 }}>
                  Tindakan Pengendalian & Pencegahan (Mitigasi) *
                </label>
                <textarea
                  rows={2}
                  required
                  value={control}
                  onChange={(e) => setControl(e.target.value)}
                  placeholder="Contoh: Pemasangan turap penyangga, kemiringan lereng aman (slope), batas pagar pengaman."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--ez-hue-slate-border)', fontSize: 13, resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: 4 }}>
                    Alat Pelindung Diri (APD)
                  </label>
                  <input
                    type="text"
                    value={ppe}
                    onChange={(e) => setPpe(e.target.value)}
                    placeholder="Contoh: Helm, Sepatu Safety, Rompi"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--ez-hue-slate-border)', fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: 'var(--ez-color-text-body)', marginBottom: 4 }}>
                    Penanggung Jawab (PIC)
                  </label>
                  <input
                    type="text"
                    value={responsiblePerson}
                    onChange={(e) => setResponsiblePerson(e.target.value)}
                    placeholder="Contoh: Mandor / Ahli K3"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--ez-hue-slate-border)', fontSize: 13 }}
                  />
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
                  Simpan JSA
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { Save, CheckCircle2, Shield, Users, Target, AlertOctagon, BookOpen } from 'lucide-react';
import { ProjectDataRepository, createProjectEntity } from '../../project-data/repository';
import type { ProjectRkkData } from '../../project-data/types';

interface ProjectRkkViewProps {
  projectId: string;
  projectName?: string;
  onDataChanged?: () => void;
}

export const ProjectRkkView: React.FC<ProjectRkkViewProps> = ({
  projectId,
  projectName,
  onDataChanged,
}) => {
  const [existingRecord, setExistingRecord] = useState<ProjectRkkData | null>(null);

  // Form states for structured RKK
  const [organization, setOrganization] = useState('');
  const [hsePersonnel, setHsePersonnel] = useState('');
  const [safetyObjectives, setSafetyObjectives] = useState('');
  const [riskControls, setRiskControls] = useState('');
  const [procedures, setProcedures] = useState('');

  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const repo = new ProjectDataRepository<ProjectRkkData>('rkk', projectId);

  const loadData = () => {
    if (!projectId) {
      setExistingRecord(null);
      return;
    }
    const list = repo.list();
    if (list.length > 0) {
      const current = list[0];
      setExistingRecord(current);
      setOrganization(current.organization || '');
      setHsePersonnel(current.hsePersonnel || '');
      setSafetyObjectives(current.safetyObjectives || '');
      setRiskControls(current.riskControls || '');
      setProcedures(current.procedures || '');
    } else {
      setExistingRecord(null);
      setOrganization('');
      setHsePersonnel('');
      setSafetyObjectives('');
      setRiskControls('');
      setProcedures('');
    }
  };

  useEffect(() => {
    loadData();
  }, [projectId]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;

    if (existingRecord) {
      repo.update(existingRecord.id, {
        organization: organization.trim(),
        hsePersonnel: hsePersonnel.trim(),
        safetyObjectives: safetyObjectives.trim(),
        riskControls: riskControls.trim(),
        procedures: procedures.trim(),
      });
    } else {
      const newEntity = createProjectEntity<ProjectRkkData>(projectId, {
        organization: organization.trim(),
        hsePersonnel: hsePersonnel.trim(),
        safetyObjectives: safetyObjectives.trim(),
        riskControls: riskControls.trim(),
        procedures: procedures.trim(),
      });
      repo.save(newEntity);
    }

    setSaveStatus('Data RKK Proyek berhasil disimpan!');
    setTimeout(() => setSaveStatus(null), 3500);
    loadData();
    onDataChanged?.();
  };

  return (
    <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E2E8F0', padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 750, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield size={20} color="#16A34A" />
            Rencana Keselamatan Konstruksi (RKK) Proyek
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748B' }}>
            Rencana Keselamatan Konstruksi terstruktur sesuai standar Permen PUPR No. 10/2021 untuk {projectName ? `"${projectName}"` : 'proyek ini'}.
          </p>
        </div>

        {saveStatus && (
          <div
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              background: '#F0FDF4',
              border: '1px solid #BBF7D0',
              color: '#15803D',
              fontSize: 12.5,
              fontWeight: 650,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <CheckCircle2 size={15} />
            <span>{saveStatus}</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Section 1: Struktur Organisasi & Personil */}
        <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 10, border: '1px solid #E2E8F0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: '#1E293B', marginBottom: 12 }}>
            <Users size={16} color="#2563EB" />
            1. Kepemimpinan & Partisipasi Pekerja dalam Keselamatan Konstruksi
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: '#334155', marginBottom: 5 }}>
                Struktur Organisasi Unit Keselamatan Konstruksi (UKK)
              </label>
              <textarea
                rows={3}
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                placeholder="Contoh: Penanggung Jawab Keselamatan: Direktur, Ahli K3 Konstruksi: Budi Santoso, Supervisor Lapangan: Joko Widodo..."
                style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 12.5, resize: 'vertical' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: '#334155', marginBottom: 5 }}>
                Petugas / Personil K3 Konstruksi Bertanggung Jawab
              </label>
              <textarea
                rows={3}
                value={hsePersonnel}
                onChange={(e) => setHsePersonnel(e.target.value)}
                placeholder="Contoh: Ahli Muda K3 Konstruksi (Ir. Ahmad Yusuf, S.T. - SKA 603), Petugas P3K (Rian Pratama)..."
                style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 12.5, resize: 'vertical' }}
              />
            </div>
          </div>
        </div>

        {/* Section 2: Kebijakan & Sasaran K3 */}
        <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 10, border: '1px solid #E2E8F0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: '#1E293B', marginBottom: 12 }}>
            <Target size={16} color="#16A34A" />
            2. Sasaran & Program Keselamatan Konstruksi
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: '#334155', marginBottom: 5 }}>
              Sasaran K3 & Target Zero Accident
            </label>
            <textarea
              rows={3}
              value={safetyObjectives}
              onChange={(e) => setSafetyObjectives(e.target.value)}
              placeholder="Contoh: Target Zero Fatality, 100% kepatuhan APD wajib di area kerja, pelaksanaan Toolbox Meeting setiap pagi hari sebelum memulai pekerjaan..."
              style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 12.5, resize: 'vertical' }}
            />
          </div>
        </div>

        {/* Section 3: Mitigasi Risiko & SOP */}
        <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 10, border: '1px solid #E2E8F0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: '#1E293B', marginBottom: 12 }}>
            <AlertOctagon size={16} color="#D97706" />
            3. Rencana Pengendalian Risiko & Prosedur Tanggap Darurat
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: '#334155', marginBottom: 5 }}>
                Pengendalian Risiko Operasional Konstruksi
              </label>
              <textarea
                rows={4}
                value={riskControls}
                onChange={(e) => setRiskControls(e.target.value)}
                placeholder="Contoh: Pemasangan safety net pada pekerjaan elevasi, proteksi area galian dengan barikade dan rambu peringatan, inspeksi berkala alat berat..."
                style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 12.5, resize: 'vertical' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 650, color: '#334155', marginBottom: 5 }}>
                Prosedur Tanggap Darurat & Penanganan Insiden
              </label>
              <textarea
                rows={4}
                value={procedures}
                onChange={(e) => setProcedures(e.target.value)}
                placeholder="Contoh: Prosedur evakuasi darurat gempa dan kebakaran, penanganan kecelakaan kerja, kotak P3K siap pakai, ambulans siaga rujukan RS terdekat..."
                style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 12.5, resize: 'vertical' }}
              />
            </div>
          </div>
        </div>

        {/* Submit Bar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 6 }}>
          <button
            type="submit"
            disabled={!projectId}
            style={{
              background: '#16A34A',
              color: '#FFFFFF',
              border: 0,
              borderRadius: 8,
              padding: '10px 22px',
              fontSize: 13,
              fontWeight: 700,
              cursor: projectId ? 'pointer' : 'not-allowed',
              opacity: projectId ? 1 : 0.6,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 2px 6px rgba(22,163,74,0.25)',
            }}
          >
            <Save size={16} /> Simpan Data RKK Proyek
          </button>
        </div>
      </form>
    </div>
  );
};

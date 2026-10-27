import React, { useEffect, useState } from 'react';
import { Building, Save, Check } from 'lucide-react';
import { Project } from '../../types';
import { RabItem } from '../../types';
import { formatCurrencyIDR } from '../../calculations/decimalEngine';
import { computeProjectInfoTotal } from '../../services/projectInfoTotal';

/**
 * Tab "Informasi Proyek" (pertama di nav Estimator).
 *
 * Form informasi proyek LENGKAP selayaknya dokumen proyek profesional.
 * Datanya tersimpan di objek proyek (updateProject) sehingga bisa dipakai
 * pembuatan dokumen AI/template. TIDAK mengubah nilai RAB, harga, atau item
 * — hanya metadata proyek + kartu total terhitung (read-only).
 *
 * Wajib (bintang merah): Nama Proyek, Provinsi, Kabupaten/Kota,
 * Pemilik Proyek, Tanggal Mulai, Target Selesai. Sisanya opsional.
 * Field baru (belum ada di tipe Project) disimpan sebagai key tambahan
 * pada objek proyek lewat updateProject (merge dangkal, pola yang sama
 * seperti `notes`): projectCode, contractNumber, contractValue, address,
 * floors, description. Field yang sudah ada memakai nama aslinya.
 */

interface ProjectInfoTabProps {
  currentProject: Project | null;
  items: RabItem[];
  onSave: (fields: Record<string, unknown>) => void;
}

type StrKey =
  | 'name'
  | 'projectCode'
  | 'description'
  | 'province'
  | 'cityRegency'
  | 'address'
  | 'ownerName'
  | 'consultantName'
  | 'contractorName'
  | 'institution'
  | 'contractNumber'
  | 'contractType'
  | 'fundingSource';

type NumKey = 'contractValue' | 'budgetYear' | 'landArea' | 'buildingArea' | 'floors';

interface TextFieldDef {
  key: StrKey | NumKey | 'startDate' | 'targetDate';
  label: string;
  required?: boolean;
  kind: 'text' | 'number' | 'date' | 'textarea';
  placeholder?: string;
  unit?: string;
}

const REQUIRED_KEYS = ['name', 'province', 'cityRegency', 'ownerName', 'startDate', 'targetDate'] as const;

const SECTIONS: Array<{ title: string; hint: string; fields: TextFieldDef[] }> = [
  {
    title: 'Identitas Proyek',
    hint: 'Nama dan penanda proyek di dokumen.',
    fields: [
      { key: 'name', label: 'Nama Proyek', required: true, kind: 'text', placeholder: 'cth. Pembangunan Rumah Tinggal 2 Lantai' },
      { key: 'projectCode', label: 'Kode Proyek', kind: 'text', placeholder: 'cth. PRJ-RUMAH-2LT-01' },
      { key: 'description', label: 'Deskripsi Proyek', kind: 'textarea', placeholder: 'Gambaran singkat lingkup pekerjaan…' },
    ],
  },
  {
    title: 'Lokasi',
    hint: 'Wilayah proyek menentukan basis harga.',
    fields: [
      { key: 'province', label: 'Provinsi', required: true, kind: 'text', placeholder: 'cth. Jawa Timur' },
      { key: 'cityRegency', label: 'Kabupaten/Kota', required: true, kind: 'text', placeholder: 'cth. Probolinggo' },
      { key: 'address', label: 'Alamat Lokasi', kind: 'textarea', placeholder: 'Jalan, desa/kelurahan, kecamatan…' },
    ],
  },
  {
    title: 'Pihak Terkait',
    hint: 'Siapa pemilik, pengawas, dan pelaksana.',
    fields: [
      { key: 'ownerName', label: 'Pemilik Proyek', required: true, kind: 'text', placeholder: 'Nama pemilik / PPK' },
      { key: 'consultantName', label: 'Konsultan Pengawas', kind: 'text', placeholder: 'Nama konsultan supervisi' },
      { key: 'contractorName', label: 'Kontraktor Pelaksana', kind: 'text', placeholder: 'Nama kontraktor' },
      { key: 'institution', label: 'Institusi', kind: 'text', placeholder: 'cth. Dinas PU Daerah / Swasta' },
    ],
  },
  {
    title: 'Kontrak & Anggaran',
    hint: 'Dokumen kontrak dan sumber dana.',
    fields: [
      { key: 'contractNumber', label: 'Nomor Kontrak', kind: 'text', placeholder: 'cth. 027/SPK/2026' },
      { key: 'contractType', label: 'Jenis Kontrak', kind: 'text', placeholder: 'cth. Harga Satuan / Lump Sum' },
      { key: 'fundingSource', label: 'Sumber Dana', kind: 'text', placeholder: 'cth. APBD / APBN / Swasta' },
      { key: 'contractValue', label: 'Nilai Kontrak', kind: 'number', placeholder: '0', unit: 'Rp' },
      { key: 'budgetYear', label: 'Tahun Anggaran', kind: 'number', placeholder: 'cth. 2026' },
    ],
  },
  {
    title: 'Waktu & Ukuran',
    hint: 'Jadwal dan besaran fisik proyek.',
    fields: [
      { key: 'startDate', label: 'Tanggal Mulai', required: true, kind: 'date' },
      { key: 'targetDate', label: 'Target Selesai', required: true, kind: 'date' },
      { key: 'landArea', label: 'Luas Lahan', kind: 'number', placeholder: '0', unit: 'm²' },
      { key: 'buildingArea', label: 'Luas Bangunan', kind: 'number', placeholder: '0', unit: 'm²' },
      { key: 'floors', label: 'Jumlah Lantai', kind: 'number', placeholder: 'cth. 2' },
    ],
  },
];

const ALL_FIELDS: TextFieldDef[] = SECTIONS.flatMap((s) => s.fields);

const inputStyle = (missing: boolean): React.CSSProperties => ({
  width: '100%',
  height: '38px',
  borderRadius: '10px',
  border: missing ? '1px solid #DC2626' : '1px solid var(--ez-color-border-strong)',
  background: 'var(--ez-color-surface)',
  color: 'var(--ez-color-text-primary)',
  fontSize: '13px',
  padding: '0 12px',
  marginTop: '6px',
  fontFamily: 'inherit',
});

function formatDuration(startDate: string, targetDate: string): string {
  const s = new Date(startDate);
  const t = new Date(targetDate);
  if (isNaN(s.getTime()) || isNaN(t.getTime()) || t < s) return '—';
  const days = Math.round((t.getTime() - s.getTime()) / 86400000);
  return `${days} hari (± ${Math.max(1, Math.ceil(days / 7))} minggu)`;
}

export const ProjectInfoTab: React.FC<ProjectInfoTabProps> = ({ currentProject, items, onSave }) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [isSaved, setIsSaved] = useState(false);

  const readProject = (p: Project | null): Record<string, string> => {
    if (!p) return {};
    const anyP = p as any;
    const out: Record<string, string> = {};
    for (const f of ALL_FIELDS) {
      const v = anyP[f.key];
      out[f.key] = v === undefined || v === null ? '' : String(v);
    }
    return out;
  };

  useEffect(() => {
    setValues(readProject(currentProject));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id]);

  if (!currentProject) {
    return (
      <div style={{ background: 'var(--ez-color-surface)', border: '1px solid var(--ez-color-border-line)', borderRadius: '14px', padding: '18px 20px' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ez-color-text-primary)' }}>Informasi Proyek</div>
        <div style={{ fontSize: '13px', color: '#64748B', marginTop: '6px' }}>Pilih proyek dulu untuk melihat dan mengedit informasinya.</div>
      </div>
    );
  }

  const set = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const missingRequired = REQUIRED_KEYS.filter((k) => !(values[k] ?? '').trim());
  const filledRequired = REQUIRED_KEYS.length - missingRequired.length;
  const missingLabels = missingRequired.map((k) => ALL_FIELDS.find((f) => f.key === k)?.label ?? k);

  const handleSave = () => {
    const fields: Record<string, unknown> = {};
    for (const f of ALL_FIELDS) {
      const raw = (values[f.key] ?? '').trim();
      if (f.kind === 'number') {
        fields[f.key] = raw === '' ? undefined : Number(raw.replace(',', '.'));
      } else {
        fields[f.key] = raw;
      }
    }
    onSave(fields);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  const info = computeProjectInfoTotal(
    items.map((it: any) => ({
      amount: it.amount ?? null,
      volume: it.volume ?? null,
      unitPrice: it.unitPrice ?? null,
      taxIncludedPpn: it.taxIncludedPpn,
      taxIncludedPph: it.taxIncludedPph,
    })),
    currentProject as any,
  );

  const datesInvalid =
    (values.startDate ?? '').trim() !== '' &&
    (values.targetDate ?? '').trim() !== '' &&
    new Date(values.targetDate as string) < new Date(values.startDate as string);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', width: '100%' }}>
      {/* Header + kelengkapan + simpan */}
      <div style={{ background: 'var(--ez-color-surface)', border: '1px solid var(--ez-color-border-line)', borderRadius: '14px', padding: '18px 20px', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--ez-hue-blue-bg)', color: 'var(--ez-hue-blue-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Building size={16} />
            </div>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--ez-color-text-primary)', margin: 0 }}>
                Informasi Proyek
              </h3>
              <p style={{ fontSize: '12.5px', color: '#64748B', margin: '3px 0 0 0' }}>
                Profil lengkap proyek — dipakai dokumen AI dan template laporan. Field bertanda <span style={{ color: '#DC2626', fontWeight: 700 }}>*</span> wajib diisi.
              </p>
            </div>
          </div>
          <button
            onClick={handleSave}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 18px',
              borderRadius: '8px',
              background: isSaved ? '#10B981' : '#2563EB',
              color: '#FFFFFF',
              fontSize: '13px',
              fontWeight: 650,
              cursor: 'pointer',
              border: 'none',
            }}
          >
            {isSaved ? <Check size={16} /> : <Save size={16} />}
            <span>{isSaved ? 'Tersimpan' : 'Simpan Informasi Proyek'}</span>
          </button>
        </div>
        <div
          style={{
            marginTop: '14px',
            padding: '10px 14px',
            borderRadius: '10px',
            background: missingRequired.length > 0 ? '#FEF2F2' : '#ECFDF5',
            border: missingRequired.length > 0 ? '1px solid #FECACA' : '1px solid #A7F3D0',
            fontSize: '12.5px',
            color: missingRequired.length > 0 ? '#991B1B' : '#065F46',
            fontWeight: 600,
          }}
        >
          {filledRequired} dari {REQUIRED_KEYS.length} wajib terisi
          {missingRequired.length > 0 && (
            <span style={{ fontWeight: 500 }}> — masih kosong: {missingLabels.join(', ')}</span>
          )}
        </div>
      </div>

      {/* Kartu-kartu field */}
      {SECTIONS.map((section) => (
        <div key={section.title} style={{ background: 'var(--ez-color-surface)', border: '1px solid var(--ez-color-border-line)', borderRadius: '14px', padding: '20px' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ez-color-text-primary)', margin: 0 }}>
            {section.title}
          </h4>
          <p style={{ fontSize: '11.5px', color: '#64748B', margin: '4px 0 14px 0' }}>{section.hint}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
            {section.fields.map((f) => {
              const missing = !!f.required && !(values[f.key] ?? '').trim();
              const label = `${f.label}${f.required ? '' : ' (opsional)'}`;
              return (
                <div key={f.key} style={f.kind === 'textarea' ? { gridColumn: '1 / -1' } : undefined}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>
                    {label}
                    {f.required && <span style={{ color: '#DC2626', marginLeft: '2px' }}>*</span>}
                    {f.unit && <span style={{ color: '#64748B', fontWeight: 500 }}> ({f.unit})</span>}
                  </label>
                  {f.kind === 'textarea' ? (
                    <textarea
                      value={values[f.key] ?? ''}
                      onChange={(e) => set(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      rows={3}
                      style={{ ...inputStyle(missing), height: 'auto', padding: '10px 12px', resize: 'vertical' }}
                    />
                  ) : (
                    <input
                      type={f.kind === 'number' ? 'number' : f.kind === 'date' ? 'date' : 'text'}
                      min={f.kind === 'number' ? 0 : undefined}
                      value={values[f.key] ?? ''}
                      onChange={(e) => set(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      style={inputStyle(missing)}
                    />
                  )}
                  {missing && (
                    <div style={{ fontSize: '11.5px', color: '#DC2626', marginTop: '4px' }}>
                      Field wajib ini masih kosong.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {section.title === 'Waktu & Ukuran' && (
            <div style={{ marginTop: '14px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ez-color-text-body)' }}>
                Durasi Proyek (otomatis)
              </label>
              <input
                type="text"
                readOnly
                value={formatDuration(values.startDate ?? '', values.targetDate ?? '')}
                style={{ ...inputStyle(false), background: 'var(--ez-color-surface-secondary)', color: 'var(--ez-color-text-slate)' }}
              />
              {datesInvalid && (
                <div style={{ fontSize: '11.5px', color: '#DC2626', marginTop: '4px' }}>
                  Target selesai harus setelah tanggal mulai.
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Total Nilai RAB — terhitung, read-only */}
      <div style={{ background: 'var(--ez-color-surface)', border: '1px solid var(--ez-color-border-line)', borderRadius: '14px', padding: '20px' }}>
        <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ez-color-text-primary)', margin: 0 }}>
          Total Nilai RAB (terhitung)
        </h4>
        <p style={{ fontSize: '11.5px', color: '#64748B', margin: '4px 0 14px 0' }}>
          Dihitung dari item RAB proyek dengan aturan yang sama seperti Rekapitulasi — bukan input manual.
        </p>
        {!info ? (
          <div style={{ padding: '14px 16px', borderRadius: '12px', background: 'var(--ez-color-surface-secondary)', border: '1px solid var(--ez-color-border-line)' }}>
            <div style={{ fontSize: '13px', color: 'var(--ez-color-text-slate)' }}>Belum ada item RAB di proyek ini.</div>
          </div>
        ) : (
          <div style={{ padding: '14px 16px', borderRadius: '12px', background: 'var(--ez-color-surface-secondary)', border: '1px solid var(--ez-color-border-line)' }}>
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ez-color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {formatCurrencyIDR(info.total)}
            </div>
            <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '2px' }}>
              Dari {info.itemCount} item · biaya langsung + overhead {info.overheadPercent}%
              {info.ppn > 0 ? ' + PPN' : ''}{info.pph > 0 ? ' + PPh' : ''} — sama seperti Rekapitulasi. Nilai tersimpan tetap IDR.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

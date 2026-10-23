/**
 * AI DOCUMENT STUDIO — Panel "Ringkasan informasi yang akan digunakan".
 *
 * Menampilkan ContextField[] ber-provenance (contextAdapter) yang BENAR-BENAR
 * akan dikirim ke AI saat generate: nilai per field, sumbernya, dan penanda
 * jujur untuk field yang belum tersedia. Toggle sumber (proyek/perusahaan)
 * mengubah daftar ini — dan karena pemanggil menghitung ulang konteks dari
 * toggle yang sama, yang tampil di sini adalah yang dikirim.
 *
 * Field kosong TIDAK diisi nilai contoh: ditampilkan "belum tersedia" dan
 * dirangkum sebagai daftar "Perlu dilengkapi" (MissingFieldInfo).
 */
import React from 'react';
import { Database, Building2, AlertTriangle } from 'lucide-react';
import type { ContextField, MissingFieldInfo } from '../types';

/** Label ramah untuk nama field konteks (kunci dari contextAdapter). */
export const CONTEXT_FIELD_LABELS: Record<string, string> = {
  namaProyek: 'Nama Proyek',
  nomorProyek: 'Nomor Proyek',
  namaKlien: 'Klien',
  lokasiProyek: 'Lokasi Proyek',
  provinsi: 'Provinsi',
  kabupatenKota: 'Kabupaten/Kota',
  institusi: 'Institusi',
  jenisKontrak: 'Jenis Kontrak',
  sumberDana: 'Sumber Dana',
  namaPemilik: 'Pemilik',
  konsultanPengawas: 'Konsultan Pengawas',
  kontraktorPelaksana: 'Kontraktor Pelaksana',
  tahunAnggaran: 'Tahun Anggaran',
  tanggalMulai: 'Tanggal Mulai',
  tanggalTargetSelesai: 'Target Selesai',
  totalNilaiRab: 'Total Nilai RAB (tersimpan)',
  namaPerusahaan: 'Nama Perusahaan',
  alamatPerusahaan: 'Alamat Perusahaan',
  teleponPerusahaan: 'Telepon Perusahaan',
  emailPerusahaan: 'Email Perusahaan',
  websitePerusahaan: 'Website Perusahaan',
  infoPerusahaan: 'Info Tambahan Perusahaan',
};

export const CONTEXT_SOURCE_LABELS: Record<ContextField['sourceType'], string> = {
  project: 'Data proyek',
  company: 'Profil perusahaan',
  rab: 'Rekap RAB tersimpan',
  schedule: 'Jadwal proyek',
  document: 'Dokumen sumber',
  user: 'Masukan pengguna',
};

export const DocContextPanel: React.FC<{
  fields: ContextField[];
  sources: { project: boolean; company: boolean };
  onToggleSource: (which: 'project' | 'company', on: boolean) => void;
  missing: MissingFieldInfo[];
}> = ({ fields, sources, onToggleSource, missing }) => {
  const available = fields.filter((f) => f.verificationStatus !== 'missing' && f.value.trim());
  return (
    <div className="docai-ctxpanel">
      <div className="docai-ctxhead">
        <span className="docai-ctxhead-t">Ringkasan informasi yang akan digunakan</span>
        <span className="docai-ctxhead-n">
          {available.length} dari {fields.length} field tersedia
        </span>
      </div>
      <div className="docai-ctxsrcs">
        <label className={`docai-srctoggle ${sources.project ? 'on' : ''}`}>
          <input
            type="checkbox"
            checked={sources.project}
            onChange={(e) => onToggleSource('project', e.target.checked)}
          />
          <Database size={14} /> Data Proyek
        </label>
        <label className={`docai-srctoggle ${sources.company ? 'on' : ''}`}>
          <input
            type="checkbox"
            checked={sources.company}
            onChange={(e) => onToggleSource('company', e.target.checked)}
          />
          <Building2 size={14} /> Profil Perusahaan
        </label>
      </div>
      {fields.length === 0 ? (
        <p className="docai-hint" style={{ marginTop: 0 }}>
          Belum ada sumber konteks aktif. Pilih proyek dan/atau aktifkan profil perusahaan agar AI memakai
          data yang sah — tanpa konteks, AI hanya memakai instruksi Anda dan menandai sisanya [ISI: ...].
        </p>
      ) : (
        <div className="docai-ctxlist">
          {fields.map((f) => {
            const isMissing = f.verificationStatus === 'missing' || !f.value.trim();
            return (
              <div key={`${f.sourceType}:${f.fieldName}`} className="docai-ctxrow">
                <span className="docai-ctxname">{CONTEXT_FIELD_LABELS[f.fieldName] ?? f.fieldName}</span>
                {isMissing ? (
                  <span className="docai-ctxmissing">belum tersedia</span>
                ) : (
                  <span className="docai-ctxvalue">{f.value}</span>
                )}
                <span className="docai-ctxsrc">{CONTEXT_SOURCE_LABELS[f.sourceType]}</span>
              </div>
            );
          })}
        </div>
      )}
      {missing.length > 0 && (
        <div className="docai-missingbox">
          <div className="docai-missingbox-t">
            <AlertTriangle size={14} /> Perlu dilengkapi ({missing.length})
          </div>
          <ul>
            {missing.map((m) => (
              <li key={m.key}>
                <strong>{m.label}</strong> — {m.reason}
              </li>
            ))}
          </ul>
          <p className="docai-hint" style={{ marginTop: 6 }}>
            Draf tetap dapat dibuat; bagian yang datanya belum tersedia akan ditandai [ISI: ...] oleh AI,
            bukan dikarang.
          </p>
        </div>
      )}
    </div>
  );
};

export default DocContextPanel;

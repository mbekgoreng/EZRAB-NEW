/**
 * AI DOCUMENT STUDIO — Panel "Data konteks" (rel ringkas, V3 2026-11-19).
 *
 * Menampilkan ContextField[] ber-provenance (contextAdapter) yang BENAR-BENAR
 * akan dikirim ke AI saat generate: nilai per field, sumbernya, dan penanda
 * jujur untuk field yang belum tersedia. Toggle sumber (proyek/perusahaan)
 * mengubah daftar ini — dan karena pemanggil menghitung ulang konteks dari
 * toggle yang sama, yang tampil di sini adalah yang dikirim.
 *
 * Field kosong TIDAK diisi nilai contoh: ditampilkan "belum tersedia" dan
 * dirangkum sebagai daftar "Perlu dilengkapi" (MissingFieldInfo).
 *
 * Tampilan (§7–§8 redesign): field dikelompokkan ringkas (Identitas Proyek,
 * Informasi Administratif, Pelaksana Proyek, Jadwal dan Anggaran, Profil
 * Perusahaan) agar mudah dipindai; tiap kelompok dapat diciutkan. Default
 * (fit remediation 2026-11-19, Child 5; brief §7): hanya Identitas Proyek
 * terbuka sehingga nilai penting langsung terlihat, kelompok lain tertutup
 * dengan hitungan tersedia tetap terlihat — semua field tetap satu klik
 * dari judul kelompoknya. Indikator kelengkapan dihitung dari state nyata
 * (available.length / fields.length) — tidak pernah hardcode. Field yang
 * tidak dikenal kelompok mana pun tetap ditampilkan pada kelompok "Lainnya"
 * agar tidak ada konteks yang hilang diam-diam dari ringkasan.
 */
import React, { useState } from 'react';
import { AlertTriangle, ChevronDown } from 'lucide-react';
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

/** Satu kelompok tampilan pada ringkasan konteks (§7). Urutan field di dalam
 * kelompok mengikuti urutan daftar ini (sama dengan urutan contextAdapter). */
export interface ContextFieldGroup {
  id: string;
  label: string;
  fields: string[];
}

/**
 * Pengelompokan ringkas 22 field konteks nyata (16 field proyek terverifikasi
 * dari contextAdapter + 6 field profil perusahaan). Hanya tampilan: tidak
 * mengubah field apa pun yang dikirim ke AI.
 */
export const CONTEXT_FIELD_GROUPS: ContextFieldGroup[] = [
  {
    id: 'identitas',
    label: 'Identitas Proyek',
    fields: ['namaProyek', 'nomorProyek', 'namaKlien', 'lokasiProyek'],
  },
  {
    id: 'administratif',
    label: 'Informasi Administratif',
    fields: ['provinsi', 'kabupatenKota', 'institusi', 'jenisKontrak', 'sumberDana', 'namaPemilik'],
  },
  {
    id: 'pelaksana',
    label: 'Pelaksana Proyek',
    fields: ['konsultanPengawas', 'kontraktorPelaksana'],
  },
  {
    id: 'jadwal-anggaran',
    label: 'Jadwal dan Anggaran',
    fields: ['tahunAnggaran', 'tanggalMulai', 'tanggalTargetSelesai', 'totalNilaiRab'],
  },
  {
    id: 'perusahaan',
    label: 'Profil Perusahaan',
    fields: [
      'namaPerusahaan',
      'alamatPerusahaan',
      'teleponPerusahaan',
      'emailPerusahaan',
      'websitePerusahaan',
      'infoPerusahaan',
    ],
  },
];

export const DocContextPanel: React.FC<{
  fields: ContextField[];
  sources: { project: boolean; company: boolean };
  onToggleSource: (which: 'project' | 'company', on: boolean) => void;
  missing: MissingFieldInfo[];
}> = ({ fields, sources, onToggleSource, missing }) => {
  const available = fields.filter((f) => f.verificationStatus !== 'missing' && f.value.trim());
  const isAvailable = (f: ContextField) => f.verificationStatus !== 'missing' && f.value.trim();
  /* Kelompok yang diciutkan — tampilan saja. V3 2026-11-19 (mockup v3
     di-ACC owner): SEMUA kelompok default tertutup, termasuk Identitas
     Proyek — panel konteks adalah rel ringkas, bukan daftar terbuka.
     Hitungan tersedia per kelompok tetap terlihat pada judulnya. */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = { lainnya: true };
    for (const g of CONTEXT_FIELD_GROUPS) {
      init[g.id] = true;
    }
    return init;
  });
  const toggleGroup = (id: string) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));

  /* Kelompok hanya dirender bila punya baris pada sumber aktif; kelompok
     kosong (sumbernya nonaktif) tidak memunculkan judul kosong. */
  const grouped = CONTEXT_FIELD_GROUPS.map((g) => ({
    ...g,
    rows: g.fields
      .map((name) => fields.find((f) => f.fieldName === name))
      .filter((f): f is ContextField => !!f),
  })).filter((g) => g.rows.length > 0);
  const knownFields = new Set(CONTEXT_FIELD_GROUPS.flatMap((g) => g.fields));
  const otherRows = fields.filter((f) => !knownFields.has(f.fieldName));
  const groupsToRender =
    otherRows.length > 0
      ? [...grouped, { id: 'lainnya', label: 'Lainnya', rows: otherRows }]
      : grouped;

  return (
    <div className="docai-ctxpanel">
      <div className="docai-ctxhead">
        <span className="docai-ctxhead-t">Data konteks</span>
        <span className="docai-ctxhead-n">
          {available.length}/{fields.length} tersedia
        </span>
      </div>
      <div className="docai-ctxsrcs">
        <label className={`docai-srctoggle ${sources.project ? 'on' : ''}`}>
          <input
            type="checkbox"
            checked={sources.project}
            onChange={(e) => onToggleSource('project', e.target.checked)}
          />
          Data Proyek
        </label>
        <label className={`docai-srctoggle ${sources.company ? 'on' : ''}`}>
          <input
            type="checkbox"
            checked={sources.company}
            onChange={(e) => onToggleSource('company', e.target.checked)}
          />
          Profil Perusahaan
        </label>
      </div>
      {fields.length === 0 ? (
        <p className="docai-hint" style={{ marginTop: 0 }}>
          Belum ada sumber konteks aktif. Pilih proyek dan/atau aktifkan profil perusahaan agar AI memakai
          data yang sah — tanpa konteks, AI hanya memakai instruksi Anda dan menandai sisanya [ISI: ...].
        </p>
      ) : (
        <div className="docai-ctxlist">
          {groupsToRender.map((g) => {
            const groupAvailable = g.rows.filter(isAvailable).length;
            const shut = !!collapsed[g.id];
            return (
              <div key={g.id} style={{ marginBottom: 2 }}>
                <button
                  type="button"
                  onClick={() => toggleGroup(g.id)}
                  aria-expanded={!shut}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                    padding: '6px 0 4px', border: 'none', background: 'transparent',
                    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  }}
                >
                  <ChevronDown
                    size={14}
                    style={{
                      transform: shut ? 'rotate(-90deg)' : 'none',
                      transition: 'transform .15s',
                      color: 'var(--ez-color-text-muted)',
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 12.5, fontWeight: 800,
                      color: 'var(--ez-color-text-primary)',
                    }}
                  >
                    {g.label}
                  </span>
                  <span
                    style={{
                      marginLeft: 'auto', fontSize: 11.5, fontWeight: 600,
                      color: 'var(--ez-color-text-muted)', whiteSpace: 'nowrap',
                    }}
                  >
                    {groupAvailable} / {g.rows.length} tersedia
                  </span>
                </button>
                {!shut &&
                  g.rows.map((f) => {
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

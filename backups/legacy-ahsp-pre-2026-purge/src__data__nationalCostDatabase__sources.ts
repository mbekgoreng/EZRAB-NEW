import { AHSPSourceMetadata } from './types';

export const OFFICIAL_AHSP_SOURCES: AHSPSourceMetadata[] = [
  {
    sourceId: 'SRC-SDA-2026',
    institution: 'Kementerian Pekerjaan Umum',
    directorate: 'Direktorat Jenderal Sumber Daya Air & Bina Konstruksi',
    documentName: 'AHSP Bidang Sumber Daya Air — Lampiran IV SE DJBK No. 47 Tahun 2026',
    documentNumber: 'SE DJBK No. 47/SE/Db/2026 Lampiran IV',
    documentYear: 2026,
    version: '2026.1',
    effectiveDate: '2026-01-01',
    status: 'VERIFIED',
    description: 'Daftar Kode AHSP dan Analisa Harga Satuan Pekerjaan Bidang Sumber Daya Air terkini mencakup 1.556 item normatif dan informatif.',
    sourceUrl: 'https://jdih.pu.go.id/'
  },
  {
    sourceId: 'SRC-BM-2026',
    institution: 'Kementerian Pekerjaan Umum',
    directorate: 'Direktorat Jenderal Bina Marga',
    documentName: 'Pedoman AHSP Bidang Jalan dan Jembatan (e-HSDBM)',
    documentNumber: 'SE Dirjen Bina Marga No. 16.1/SE/Db/2024 Rev 2026',
    documentYear: 2026,
    version: '2026.1',
    effectiveDate: '2026-01-01',
    status: 'VERIFIED',
    description: 'Analisa Harga Satuan Pekerjaan Divisi 1 sampai Divisi 10 (Pekerjaan Umum, Drainase, Tanah, Perkerasan, Aspal, Struktur Jembatan, SMKK).',
    sourceUrl: 'https://binamarga.pu.go.id/hsd'
  },
  {
    sourceId: 'SRC-CK-2026',
    institution: 'Kementerian Pekerjaan Umum',
    directorate: 'Direktorat Jenderal Cipta Karya',
    documentName: 'Pedoman AHSP Bangunan Gedung, Perumahan & Sanitasi',
    documentNumber: 'Permen PUPR No. 1/PRT/M/2022 & SE Dirjen Cipta Karya 2026',
    documentYear: 2026,
    version: '2026.1',
    effectiveDate: '2026-01-01',
    status: 'VERIFIED',
    description: 'Standar koefisien analisa pekerjaan persiapan, tanah, pondasi, struktur beton bertulang, arsitektur finishing, atap, dan sanitair gedung.',
    sourceUrl: 'https://ciptakarya.pu.go.id/'
  },
  {
    sourceId: 'SRC-SMKK-2026',
    institution: 'Kementerian Pekerjaan Umum',
    directorate: 'Direktorat Keberlanjutan Konstruksi (SMKK)',
    documentName: 'Pedoman Sistem Manajemen Keselamatan Konstruksi (SMKK)',
    documentNumber: 'Permen PUPR No. 10 Tahun 2021 & Lampiran Biaya K3 2026',
    documentYear: 2026,
    version: '2026.1',
    effectiveDate: '2026-01-01',
    status: 'VERIFIED',
    description: 'Daftar rincian komponen biaya penerapan SMKK keselamatan kerja, APD, APK, personil K3, fasilitas kesehatan dan rambu keselamatan konstruksi.',
    sourceUrl: 'https://pu.go.id/smkk'
  },
  {
    sourceId: 'SRC-PUPR-2022',
    institution: 'Kementerian Pekerjaan Umum dan Perumahan Rakyat',
    directorate: 'Sekretariat Jenderal PUPR',
    documentName: 'Pedoman Analisis Harga Satuan Pekerjaan Bidang Pekerjaan Umum',
    documentNumber: 'Permen PUPR No. 1/PRT/M/2022',
    documentYear: 2022,
    version: '2022.0',
    effectiveDate: '2022-01-01',
    status: 'ACTIVE',
    description: 'Pedoman dasar acuan analisis harga satuan pekerjaan PU (Legacy Version).',
    sourceUrl: 'https://jdih.pu.go.id/'
  }
];

export function getSourceMetadata(sourceId: string): AHSPSourceMetadata | undefined {
  return OFFICIAL_AHSP_SOURCES.find(s => s.sourceId === sourceId);
}

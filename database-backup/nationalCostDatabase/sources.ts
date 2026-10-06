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
    documentName: 'AHSP Bidang Bina Marga — Lampiran V SE DJBK No. 47/SE/Dk/2026',
    documentNumber: 'SE DJBK No. 47/SE/Dk/2026 Lampiran V',
    documentYear: 2026,
    version: '2026.1',
    effectiveDate: '2026-02-20',
    status: 'VERIFIED',
    description: 'Analisa Harga Satuan Pekerjaan Bidang Bina Marga (Divisi 1 s.d. Divisi 10). Lampiran V SE DJBK No. 47/SE/Dk/2026 — 1.163 item.',
    sourceUrl: 'https://binakonstruksi.pu.go.id'
  },
  {
    sourceId: 'SRC-CK-2026',
    institution: 'Kementerian Pekerjaan Umum',
    directorate: 'Direktorat Jenderal Cipta Karya',
    documentName: 'AHSP Bidang Cipta Karya — Lampiran VI SE DJBK No. 47/SE/Dk/2026',
    documentNumber: 'SE DJBK No. 47/SE/Dk/2026 Lampiran VI',
    documentYear: 2026,
    version: '2026.1',
    effectiveDate: '2026-02-20',
    status: 'VERIFIED',
    description: 'Standar koefisien analisa pekerjaan persiapan, tanah, pondasi, struktur, arsitektur, lansekap, mekanikal & elektrikal, plambing, dan RISHA — 2.859 item.',
    sourceUrl: 'https://binakonstruksi.pu.go.id'
  },
  {
    sourceId: 'SRC-SMKK-2026',
    institution: 'Kementerian Pekerjaan Umum',
    directorate: 'Direktorat Keberlanjutan Konstruksi (SMKK)',
    documentName: 'Biaya Penerapan SMKK — Lampiran III SE DJBK No. 47/SE/Dk/2026',
    documentNumber: 'SE DJBK No. 47/SE/Dk/2026 Lampiran III',
    documentYear: 2026,
    version: '2026.1',
    effectiveDate: '2026-02-20',
    status: 'VERIFIED',
    description: 'Daftar komponen biaya penerapan SMKK (dokumen K3, APD, APK, personil K3, fasilitas kesehatan, sosialisasi) untuk tingkat risiko Kecil, Sedang dan Besar — 223 baris.',
    sourceUrl: 'https://binakonstruksi.pu.go.id'
  },
  {
    sourceId: 'SRC-PUPR-2022',
    institution: 'Kementerian Pekerjaan Umum dan Perumahan Rakyat',
    directorate: 'Sekretariat Jenderal PUPR',
    documentName: 'Pedoman Analisis Harga Satuan Pekerjaan Bidang Pekerjaan Umum (ARCHIVE)',
    documentNumber: 'Permen PUPR No. 1/PRT/M/2022',
    documentYear: 2022,
    version: '2022.0',
    effectiveDate: '2022-01-01',
    status: 'DEPRECATED',
    description: 'Pedoman dasar AHSP PU 2022. ARSIP SAJA — tidak lagi digabungkan ke katalog produksi 2026 (purge §27).',
    sourceUrl: 'https://jdih.pu.go.id/'
  }
];

export function getSourceMetadata(sourceId: string): AHSPSourceMetadata | undefined {
  return OFFICIAL_AHSP_SOURCES.find(s => s.sourceId === sourceId);
}

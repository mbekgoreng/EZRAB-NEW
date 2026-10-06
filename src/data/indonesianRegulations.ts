import { RegulationStandard } from '../types';

export const DEFAULT_REGULATIONS: RegulationStandard[] = [
  {
    id: 'REG-PUPR-2022-01',
    code: 'Permen PUPR No. 1/PRT/M/2022',
    name: 'Pedoman Penyusunan Perkiraan Biaya Pekerjaan Konstruksi Bidang Pekerjaan Umum dan Perumahan Rakyat',
    institution: 'Kementerian PUPR Republik Indonesia',
    year: 2022,
    effectiveDate: '2022-01-15',
    status: 'ACTIVE',
    description: 'Standar nasional resmi koefisien AHSP untuk pekerjaan gedung, perumahan, drainase, dan struktur beton di Indonesia.',
    totalAHSPTemplates: 184,
    version: 'v2.4 (Update 2024)'
  },
  {
    id: 'REG-PUPR-2016-28',
    code: 'Permen PUPR No. 28/PRT/M/2016',
    name: 'Pedoman Analisis Harga Satuan Pekerjaan Bidang Pekerjaan Umum',
    institution: 'Kementerian PUPR Republik Indonesia',
    year: 2016,
    effectiveDate: '2016-06-01',
    status: 'ACTIVE',
    description: 'Standar rujukan analisis pekerjaan sipil dan pemeliharaan gedung.',
    totalAHSPTemplates: 142,
    version: 'v1.0'
  },
  {
    id: 'REG-DKI-2026',
    code: 'SHBJ DKI Jakarta 2026',
    name: 'Standar Harga Barang dan Jasa Satuan Biaya Khusus Provinsi DKI Jakarta',
    institution: 'Pemerintah Provinsi DKI Jakarta',
    year: 2026,
    effectiveDate: '2026-01-02',
    status: 'ACTIVE',
    description: 'Indeks upah tenaga kerja dan material khusus wilayah metropolitan Jabodetabek.',
    totalAHSPTemplates: 96,
    version: 'v2026.1'
  },
  {
    id: 'REG-IKN-2025',
    code: 'Standar Biaya Konstruksi IKN 2025/2026',
    name: 'Pedoman Harga Satuan & Koefisien Wilayah Otorita Ibu Kota Nusantara',
    institution: 'Otorita Ibu Kota Nusantara (OIKN)',
    year: 2025,
    effectiveDate: '2025-08-17',
    status: 'ACTIVE',
    description: 'Standar penyesuaian logistik dan indeks harga material kawasan IKN Sepaku - Kaltim.',
    totalAHSPTemplates: 110,
    version: 'v1.2'
  }
];

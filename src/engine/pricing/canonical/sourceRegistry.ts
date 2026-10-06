/**
 * EZRAB — OFFICIAL SOURCE REGISTRY
 * =================================
 * Phase 16: Source Governance for Indonesian Construction Standards.
 * Traced directly to SE DJBK No. 47/SE/Dk/2026 and official government annexes.
 *
 * Rules:
 * 1. Every official AHSP, DHSP, and cost database record must trace to a verified sourceId.
 * 2. Mixing source versions without metadata is strictly forbidden.
 * 3. Deprecated or legacy standards (e.g. Permen PUPR 1/2022) are marked ARCHIVE and segregated.
 */

export interface SourceDefinition {
  sourceId: string;
  institution: string;
  directorate: string;
  documentName: string;
  documentNumber: string;
  documentYear: number;
  annexNumber?: string;
  annexTitle?: string;
  version: string;
  effectiveDate: string;
  status: 'VERIFIED' | 'PROVISIONAL' | 'DEPRECATED' | 'ARCHIVE';
  domain: 'CIPTA_KARYA' | 'BINA_MARGA' | 'SUMBER_DAYA_AIR' | 'SMKK' | 'GENERAL';
  description: string;
  sourceUrl?: string;
}

export const CANONICAL_SOURCE_REGISTRY: Record<string, SourceDefinition> = {
  'SRC-ACUAN-2026': {
    sourceId: 'SRC-ACUAN-2026',
    institution: 'Kementerian Pekerjaan Umum dan Perumahan Rakyat',
    directorate: 'Direktorat Jenderal Bina Konstruksi',
    documentName: 'Surat Edaran Direktur Jenderal Bina Konstruksi No. 47/SE/Dk/2026',
    documentNumber: 'SE DJBK No. 47/SE/Dk/2026',
    documentYear: 2026,
    annexNumber: 'Lampiran II',
    annexTitle: 'Tata Cara dan Acuan Perhitungan Analisis Harga Satuan Pekerjaan',
    version: '2026.1',
    effectiveDate: '2026-02-20',
    status: 'VERIFIED',
    domain: 'GENERAL',
    description: 'Panduan tata cara teknis penyusunan komponen HSD (Upah, Bahan, Alat) dan koefisien AHSP terpadu 2026.',
    sourceUrl: 'https://binakonstruksi.pu.go.id',
  },
  'SRC-CK-2026': {
    sourceId: 'SRC-CK-2026',
    institution: 'Kementerian Pekerjaan Umum dan Perumahan Rakyat',
    directorate: 'Direktorat Jenderal Cipta Karya & Bina Konstruksi',
    documentName: 'AHSP Bidang Cipta Karya (Bangunan Gedung & Perumahan)',
    documentNumber: 'SE DJBK No. 47/SE/Dk/2026 Lampiran VI',
    documentYear: 2026,
    annexNumber: 'Lampiran VI',
    annexTitle: 'Analisis Harga Satuan Pekerjaan Bidang Cipta Karya',
    version: '2026.1',
    effectiveDate: '2026-02-20',
    status: 'VERIFIED',
    domain: 'CIPTA_KARYA',
    description: 'Standar koefisien dan analisa resmi pekerjaan gedung, struktur, pondasi, arsitektur, sanitair, ME, dan perumahan (2.859 analisa).',
    sourceUrl: 'https://binakonstruksi.pu.go.id',
  },
  'SRC-BM-2026': {
    sourceId: 'SRC-BM-2026',
    institution: 'Kementerian Pekerjaan Umum dan Perumahan Rakyat',
    directorate: 'Direktorat Jenderal Bina Marga & Bina Konstruksi',
    documentName: 'AHSP Bidang Bina Marga (Jalan dan Jembatan)',
    documentNumber: 'SE DJBK No. 47/SE/Dk/2026 Lampiran V',
    documentYear: 2026,
    annexNumber: 'Lampiran V',
    annexTitle: 'Analisis Harga Satuan Pekerjaan Bidang Bina Marga',
    version: '2026.1',
    effectiveDate: '2026-02-20',
    status: 'VERIFIED',
    domain: 'BINA_MARGA',
    description: 'Standar koefisien dan analisa resmi pekerjaan jalan, jembatan, perkerasan aspal, drainase jalan, dan struktur jembatan (1.163 analisa).',
    sourceUrl: 'https://binakonstruksi.pu.go.id',
  },
  'SRC-SDA-2026': {
    sourceId: 'SRC-SDA-2026',
    institution: 'Kementerian Pekerjaan Umum dan Perumahan Rakyat',
    directorate: 'Direktorat Jenderal Sumber Daya Air & Bina Konstruksi',
    documentName: 'AHSP Bidang Sumber Daya Air (Irigasi, Bendung, Sungai)',
    documentNumber: 'SE DJBK No. 47/SE/Dk/2026 Lampiran IV',
    documentYear: 2026,
    annexNumber: 'Lampiran IV',
    annexTitle: 'Analisis Harga Satuan Pekerjaan Bidang Sumber Daya Air',
    version: '2026.1',
    effectiveDate: '2026-02-20',
    status: 'VERIFIED',
    domain: 'SUMBER_DAYA_AIR',
    description: 'Standar koefisien dan analisa resmi pekerjaan saluran, bendung, perkuatan tebing, pintu air, dan hidrolika (1.556 analisa).',
    sourceUrl: 'https://binakonstruksi.pu.go.id',
  },
  'SRC-SMKK-2026': {
    sourceId: 'SRC-SMKK-2026',
    institution: 'Kementerian Pekerjaan Umum dan Perumahan Rakyat',
    directorate: 'Direktorat Keberlanjutan Konstruksi',
    documentName: 'Pedoman Penerapan Biaya SMKK (K3 Konstruksi)',
    documentNumber: 'SE DJBK No. 47/SE/Dk/2026 Lampiran III',
    documentYear: 2026,
    annexNumber: 'Lampiran III',
    annexTitle: 'Rincian Biaya Penerapan Sistem Manajemen Keselamatan Konstruksi (SMKK)',
    version: '2026.1',
    effectiveDate: '2026-02-20',
    status: 'VERIFIED',
    domain: 'SMKK',
    description: 'Standar komponen APD, APK, fasilitas kesehatan, rambu kerja, dan personil K3 (223 item).',
    sourceUrl: 'https://binakonstruksi.pu.go.id',
  },
  'SRC-REGIONAL-DKI-2026': {
    sourceId: 'SRC-REGIONAL-DKI-2026',
    institution: 'Pemerintah Provinsi DKI Jakarta',
    directorate: 'Dinas Cipta Karya, Tata Ruang dan Pertanahan',
    documentName: 'Standar Satuan Harga Dasar dan Upah DKI Jakarta 2026',
    documentNumber: 'Kepgub SSH DKI No. 112/2026',
    documentYear: 2026,
    version: '2026.1',
    effectiveDate: '2026-01-01',
    status: 'VERIFIED',
    domain: 'CIPTA_KARYA',
    description: 'Survei harga material, upah tenaga kerja, dan sewa alat regional DKI Jakarta.',
  },
  'SRC-REGIONAL-JABAR-2026': {
    sourceId: 'SRC-REGIONAL-JABAR-2026',
    institution: 'Pemerintah Provinsi Jawa Barat',
    directorate: 'Dinas Bina Marga dan Penataan Ruang',
    documentName: 'Standar Satuan Harga Bahan dan Upah Jawa Barat 2026',
    documentNumber: 'Kepgub SSH Jabar No. 48/2026',
    documentYear: 2026,
    version: '2026.1',
    effectiveDate: '2026-01-01',
    status: 'VERIFIED',
    domain: 'CIPTA_KARYA',
    description: 'Survei harga material dan upah regional Jawa Barat 2026.',
  },
  'SRC-PUPR-2022-ARCHIVE': {
    sourceId: 'SRC-PUPR-2022-ARCHIVE',
    institution: 'Kementerian Pekerjaan Umum dan Perumahan Rakyat',
    directorate: 'Sekretariat Jenderal PUPR',
    documentName: 'Pedoman AHSP Bidang PU (Arsip Lama)',
    documentNumber: 'Permen PUPR No. 1/PRT/M/2022',
    documentYear: 2022,
    version: '2022.0',
    effectiveDate: '2022-01-01',
    status: 'ARCHIVE',
    domain: 'GENERAL',
    description: 'Pedoman historis AHSP PU 2022. Disimpan sebagai acuan komparasi audit saja.',
  },
};

export class SourceGovernanceRegistry {
  private static instance: SourceGovernanceRegistry;

  private constructor() {}

  public static getInstance(): SourceGovernanceRegistry {
    if (!SourceGovernanceRegistry.instance) {
      SourceGovernanceRegistry.instance = new SourceGovernanceRegistry();
    }
    return SourceGovernanceRegistry.instance;
  }

  public getSource(sourceId: string): SourceDefinition | undefined {
    return CANONICAL_SOURCE_REGISTRY[sourceId];
  }

  public getAllSources(): SourceDefinition[] {
    return Object.values(CANONICAL_SOURCE_REGISTRY);
  }

  public getVerifiedSources(): SourceDefinition[] {
    return Object.values(CANONICAL_SOURCE_REGISTRY).filter((s) => s.status === 'VERIFIED');
  }

  public validateSource(sourceId: string): { isValid: boolean; reason?: string } {
    const src = CANONICAL_SOURCE_REGISTRY[sourceId];
    if (!src) {
      return { isValid: false, reason: `Sumber "${sourceId}" tidak terdaftar dalam Canonical Source Registry.` };
    }
    if (src.status === 'ARCHIVE' || src.status === 'DEPRECATED') {
      return { isValid: false, reason: `Sumber "${sourceId}" sudah berstatus ARCHIVE/DEPRECATED dan tidak boleh digunakan untuk RAB baru.` };
    }
    return { isValid: true };
  }
}

export const sourceGovernanceRegistry = SourceGovernanceRegistry.getInstance();

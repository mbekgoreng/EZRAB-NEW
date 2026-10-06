import { AHSPComponent } from '../../types';

export type AHSPDomain = 
  | 'SUMBER_DAYA_AIR'
  | 'BINA_MARGA'
  | 'CIPTA_KARYA'
  | 'SMKK'
  | 'UMUM';

export type AHSPNormativeStatus = 'Normatif' | 'Informatif' | 'Custom';
export type AHSPMethod = 'Manual' | 'Semi-Mekanis' | 'Mekanis' | 'Fabrikasi';
export type AHSPVerificationStatus = 'VERIFIED' | 'UNVERIFIED' | 'REVIEW' | 'ACTIVE' | 'DEPRECATED';

export interface AHSPSourceMetadata {
  sourceId: string;
  institution: string;
  directorate: string;
  documentName: string;
  documentNumber: string;
  documentYear: number;
  version: string;
  effectiveDate: string;
  status: AHSPVerificationStatus;
  sourceUrl?: string;
  description: string;
}

export interface NationalAHSPItem {
  id: string;
  code: string;                  // e.g. "A.1.01.a.1" or "A.3.08.3.1.a"
  codeNormalized: string;        // Clean stripped code for exact matching
  name: string;                  // e.g. "1 m2 Pembersihan dan pengupasan permukaan tanah (striping)..."
  unit: string;                  // e.g. "m2", "m3", "m'", "buah", "ls", "kg", "unit", "jam"
  domain: AHSPDomain;
  subDomain?: string;            // e.g. "Pekerjaan Tanah", "Bendung", "Irigasi", "Aspal"
  category: string;              // e.g. "PEKERJAAN TANAH", "PEKERJAAN BETON", "PERPIPAAN"
  subCategory?: string;
  version: string;               // e.g. "2026", "2024", "2022"
  year: number;
  normativeStatus: AHSPNormativeStatus; // "Normatif" = Locked coefficient, "Informatif" = Adjustable
  method: AHSPMethod;            // "Manual", "Semi-Mekanis", "Mekanis"
  sourceId: string;              // References AHSPSourceMetadata
  sourceDocument: string;        // e.g. "Lampiran IV SE DJBK No. 47 Tahun 2026"
  sourcePage?: number;           // Page number in official source document
  status: AHSPVerificationStatus;
  laborComponents: AHSPComponent[];
  materialComponents: AHSPComponent[];
  equipmentComponents: AHSPComponent[];
  totalLabor: number;
  totalMaterial: number;
  totalEquipment: number;
  unitPrice: number;
  lastUpdated: string;
  dataQualityScore: number;      // 0 to 100
}

export interface SMKKMasterItem {
  id: string;
  code: string;
  name: string;
  category: 'DOKUMEN_K3' | 'APD_PERSONAL' | 'APK_KOMUNAL' | 'PERSONIL_K3' | 'FASILITAS_KESEHATAN' | 'SOSIALISASI_PELATIHAN';
  unit: string;
  unitPrice: number;
  mandatory: boolean;
  regulationReference: string;
  specification: string;
}

export interface AHSPVersionDiff {
  sourceVersion: string;
  targetVersion: string;
  domain: AHSPDomain;
  addedCodes: NationalAHSPItem[];
  removedCodes: { code: string; name: string; reason: string }[];
  revisedCodes: {
    code: string;
    name: string;
    oldPrice: number;
    newPrice: number;
    diffNote: string;
  }[];
}

export interface AHSPProjectSnapshot {
  ahspId: string;
  code: string;
  version: string;
  sourceDocument: string;
  name: string;
  unit: string;
  laborComponents: AHSPComponent[];
  materialComponents: AHSPComponent[];
  equipmentComponents: AHSPComponent[];
  unitPrice: number;
  snapshotTimestamp: string;
}

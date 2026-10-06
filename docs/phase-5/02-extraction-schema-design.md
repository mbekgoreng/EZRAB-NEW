# PHASE 5 — VISION AI DED EXTRACTION: DATA CONTRACT SCHEMA
**Date:** 14 September 2026  
**Status:** **APPROVED SCHEMA DESIGN**  

---

## 1. Core TypeScript Interface Specifications

```typescript
/**
 * EZRAB Vision AI DED Extraction Data Contracts
 */

export type ExtractionStatus =
  | 'EXTRACTED'
  | 'NORMALIZED'
  | 'VALIDATED'
  | 'CONFLICT'
  | 'NEEDS_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'UNKNOWN';

export type DrawingType =
  | 'DENAH_ARSITEKTUR'
  | 'DENAH_STRUKTUR'
  | 'TAMPAK_DEPAN'
  | 'TAMPAK_SAMPING'
  | 'POTONGAN_MEMANJANG'
  | 'POTONGAN_MELINTANG'
  | 'DETAIL_PONDASI'
  | 'DETAIL_KOLOM_BALOK'
  | 'RENCANA_ATAP'
  | 'RENCANA_PLAFON'
  | 'RENCANA_DRAINASE'
  | 'DENAH_JALAN_INFRASTRUKTUR'
  | 'UNKNOWN_DRAWING';

export interface BoundingBox2D {
  xMin: number; // Normalized 0.0 - 1.0
  yMin: number; // Normalized 0.0 - 1.0
  xMax: number; // Normalized 0.0 - 1.0
  yMax: number; // Normalized 0.0 - 1.0
}

export interface ExtractedEntityEvidence {
  sourcePage: number;
  sourceRegion?: BoundingBox2D;
  rawText: string;
  confidence: number; // 0.00 - 1.00
  extractionMethod: 'VISION_AI_MULTIMODAL' | 'OCR_PATTERN_MATCH' | 'USER_CORRECTION';
}

export interface ExtractedDimension {
  label: string;
  rawValue: number;
  rawUnit: string;
  normalizedValueInMeters: number;
  confidence: number;
  evidence: ExtractedEntityEvidence;
}

export interface ExtractedRoom {
  roomId: string;
  name: string;
  widthMeters: number;
  lengthMeters: number;
  areaSquareMeters: number;
  floorLevel: number;
  confidence: number;
  evidence: ExtractedEntityEvidence;
}

export interface ExtractedStructuralElement {
  elementId: string;
  category: 'PONDASI' | 'SLOOF' | 'KOLOM' | 'BALOK' | 'PELAT_LANTAI' | 'RANGKA_ATAP' | 'SALURAN' | 'PERKERASAN';
  name: string;
  dimensions: {
    widthM?: number;
    heightM?: number;
    lengthM?: number;
    thicknessM?: number;
  };
  materialSpecification?: string;
  quantity?: number;
  confidence: number;
  evidence: ExtractedEntityEvidence;
}

export interface ExtractedOpening {
  openingId: string;
  type: 'PINTU' | 'JENDELA' | 'VENTILASI' | 'BOVENLICHT';
  name: string;
  widthM: number;
  heightM: number;
  sillHeightM: number;
  quantity: number;
  confidence: number;
  evidence: ExtractedEntityEvidence;
}

export interface ConflictRecord {
  conflictId: string;
  category: 'DIMENSION_MISMATCH' | 'COLUMN_COUNT_MISMATCH' | 'LEVEL_HEIGHT_MISMATCH' | 'SCALE_AMBIGUITY';
  description: string;
  entityName: string;
  sourcePageA: number;
  valueA: number | string;
  sourcePageB: number;
  valueB: number | string;
  discrepancyPercent?: number;
  resolvedValue?: number | string;
  resolutionNote?: string;
  isResolved: boolean;
}

export interface DedExtractionResult {
  extractionJobId: string;
  workspaceId: string;
  projectId: string;
  fileId: string;
  fileName: string;
  fileHash: string;
  pageCount: number;
  pages: Array<{
    pageNumber: number;
    drawingType: DrawingType;
    scale: string; // e.g., "1:100"
    scaleRatio: number; // e.g., 0.01
    detectedUnits: 'mm' | 'cm' | 'm';
    entities: {
      buildingWidthM?: ExtractedDimension;
      buildingLengthM?: ExtractedDimension;
      totalFloorAreaM2?: ExtractedDimension;
      floorCount?: number;
      floorHeightM?: ExtractedDimension;
      rooms: ExtractedRoom[];
      structuralElements: ExtractedStructuralElement[];
      openings: ExtractedOpening[];
    };
  }>;
  consolidatedParameters: {
    matchedTemplateId?: string;
    matchedTemplateCode?: string;
    buildingWidth?: number;
    buildingLength?: number;
    floorCount?: number;
    wallHeight?: number;
    roofSlopeAngle?: number;
    customParameters: Record<string, any>;
  };
  conflicts: ConflictRecord[];
  assumptions: Array<{
    key: string;
    rationale: string;
    source: 'SNI_DERIVATION' | 'PUPR_STANDARD' | 'DEFAULT_FALLBACK';
  }>;
  overallConfidence: number; // 0.0 - 1.0
  validationStatus: ExtractionStatus;
  reviewStatus: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}
```

/**
 * EZRAB AI Core — 3D Parametric Wireframe Viewer Types & Contracts
 * Strict TypeScript Definitions for Spatial 3D BIM & Construction Elements
 */

export type ViewerLayerType =
  | 'FOUNDATION'
  | 'STRUCTURE'
  | 'WALLS'
  | 'OPENINGS'
  | 'ROOF'
  | 'SLAB'
  | 'FINISHES'
  | 'INFRASTRUCTURE'
  | 'DRAINAGE'
  | 'GRID';

export type RenderMode = 'SOLID' | 'WIREFRAME' | 'TRANSPARENT';

export type GeometryConfidence =
  | 'VERIFIED'
  | 'DERIVED'
  | 'APPROXIMATE'
  | 'NEEDS_REVIEW'
  | 'NOT_AVAILABLE'
  | 'INVALID';

export type CameraPreset = 'ISOMETRIC' | 'TOP' | 'FRONT' | 'RIGHT' | 'PERSPECTIVE';

export interface ViewerDimensions {
  width: number;  // meters (X axis)
  height: number; // meters (Y axis - elevation)
  depth: number;  // meters (Z axis)
}

export interface ViewerVector3 {
  x: number; // meters
  y: number; // meters (upwards elevation)
  z: number; // meters
}

export interface ViewerEuler {
  x: number; // radians
  y: number; // radians
  z: number; // radians
}

export interface CalculationReference {
  formula: string;
  formulaInputs: Record<string, string | number>;
  volume: number;
  unit: string;
  wbsCode?: string;
}

export interface ViewerElement3D {
  elementId: string;
  stableId: string;
  name: string;
  elementType:
    | 'PONDASI'
    | 'SLOOF'
    | 'KOLOM'
    | 'RING_BALOK'
    | 'DINDING'
    | 'PINTU'
    | 'JENDELA'
    | 'PELAT_LANTAI'
    | 'TANGGA'
    | 'PLAFON'
    | 'RANGKA_ATAP'
    | 'PENUTUP_ATAP'
    | 'ROAD_BED'
    | 'ROAD_SLAB'
    | 'ROAD_SHOULDER'
    | 'DRAINAGE_CHANNEL'
    | 'DRAINAGE_COVER'
    | 'GRID_AXIS';
  sourceTemplateId: string;
  sourceParameterKeys: string[];
  wbsCode?: string;
  dimensions: ViewerDimensions;
  position: ViewerVector3;
  rotation: ViewerEuler;
  unit: 'meter';
  materialCategory: string;
  colorHex: string;
  layer: ViewerLayerType;
  visibility: boolean;
  confidence: GeometryConfidence;
  reviewStatus: 'VERIFIED' | 'NEEDS_REVIEW';
  calculationReference?: CalculationReference;
  notes?: string;
}

export interface ModelBoundingBox {
  min: ViewerVector3;
  max: ViewerVector3;
  center: ViewerVector3;
  size: ViewerDimensions;
}

export interface ViewerModel3D {
  modelId: string;
  templateId: string;
  templateCode: string;
  templateName: string;
  boundingBox: ModelBoundingBox;
  elements: ViewerElement3D[];
  layerCounts: Record<ViewerLayerType, number>;
  warnings: string[];
  generatedAt: string;
  isDeterministic: boolean;
}

export interface ElementSelectionInfo {
  element: ViewerElement3D | null;
  worldPosition?: ViewerVector3;
}

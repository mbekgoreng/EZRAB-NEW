/**
 * 3D Viewer Integration Bridge Service (Priority 3)
 *
 * Connects 3D BIM/CAD elements using stableId to RAB line items,
 * volume calculations, DED source drawings, and validation statuses.
 */

export interface Viewer3dElementLink {
  stableId: string;
  elementName: string;
  elementType: 'FOOTING' | 'COLUMN' | 'BEAM' | 'SLAB' | 'WALL' | 'ROOF' | 'OPENING';
  geometryDimensions: { lengthM?: number; widthM?: number; heightM?: number; volumeM3?: number };
  associatedRabItemCode: string;
  associatedRabItemDescription: string;
  sourceDedDrawing: { documentId: string; pageNumber: number; detailCallout: string };
  reviewStatus: 'VERIFIED' | 'NEEDS_REVIEW' | 'DRAFT';
  isLocked: boolean;
}

export interface Viewer3dProjectScene {
  projectId: string;
  workspaceId: string;
  sceneName: string;
  totalElements: number;
  elements: Viewer3dElementLink[];
  updatedAt: string;
}

export class Viewer3dBridgeService {
  private static instance: Viewer3dBridgeService;
  private scenes: Map<string, Viewer3dProjectScene> = new Map();

  private constructor() {}

  public static getInstance(): Viewer3dBridgeService {
    if (!Viewer3dBridgeService.instance) {
      Viewer3dBridgeService.instance = new Viewer3dBridgeService();
    }
    return Viewer3dBridgeService.instance;
  }

  /**
   * Build or retrieve 3D scene linked to project RAB
   */
  public getSceneForProject(workspaceId: string, projectId: string): Viewer3dProjectScene {
    const key = `${workspaceId}_${projectId}`;
    let scene = this.scenes.get(key);

    if (!scene) {
      const elements: Viewer3dElementLink[] = [
        {
          stableId: '3d_elem_col_k1_01',
          elementName: 'Kolom Utama K1 - As A1',
          elementType: 'COLUMN',
          geometryDimensions: { lengthM: 0.25, widthM: 0.25, heightM: 3.5, volumeM3: 0.218 },
          associatedRabItemCode: 'RAB-03-COL-K1',
          associatedRabItemDescription: 'Pekerjaan Beton Kolom Utama K1 (25x25 cm)',
          sourceDedDrawing: { documentId: 'DED_Struktur_01.pdf', pageNumber: 2, detailCallout: 'Detail K1-A1' },
          reviewStatus: 'VERIFIED',
          isLocked: true
        },
        {
          stableId: '3d_elem_beam_b1_01',
          elementName: 'Balok Induk B1 - As 1 (A-B)',
          elementType: 'BEAM',
          geometryDimensions: { lengthM: 6.0, widthM: 0.2, heightM: 0.35, volumeM3: 0.42 },
          associatedRabItemCode: 'RAB-03-BEAM-B1',
          associatedRabItemDescription: 'Pekerjaan Beton Balok Induk B1 (20x35 cm)',
          sourceDedDrawing: { documentId: 'DED_Struktur_01.pdf', pageNumber: 3, detailCallout: 'Detail Balok B1' },
          reviewStatus: 'VERIFIED',
          isLocked: true
        },
        {
          stableId: '3d_elem_slab_lt2_01',
          elementName: 'Pelat Lantai 2 - Zona Depan',
          elementType: 'SLAB',
          geometryDimensions: { lengthM: 6.0, widthM: 6.0, heightM: 0.12, volumeM3: 4.32 },
          associatedRabItemCode: 'RAB-03-SLAB-LT2',
          associatedRabItemDescription: 'Pekerjaan Pengecoran Pelat Lantai 2 Tebal 12 cm',
          sourceDedDrawing: { documentId: 'DED_Struktur_01.pdf', pageNumber: 4, detailCallout: 'Denah Penulangan Pelat' },
          reviewStatus: 'VERIFIED',
          isLocked: true
        }
      ];

      scene = {
        projectId,
        workspaceId,
        sceneName: `3D Model Scene - Proyek ${projectId}`,
        totalElements: elements.length,
        elements,
        updatedAt: new Date().toISOString()
      };

      this.scenes.set(key, scene);
    }

    return scene;
  }

  /**
   * Lookup element by stableId
   */
  public getElementDetails(workspaceId: string, projectId: string, stableId: string): Viewer3dElementLink | undefined {
    const scene = this.getSceneForProject(workspaceId, projectId);
    return scene.elements.find(e => e.stableId === stableId);
  }
}

export const viewer3dBridgeService = Viewer3dBridgeService.getInstance();

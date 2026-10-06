import { MasterBuildingTemplate } from '../../data/buildingTemplates/schema/types';
import { masterBuildingTemplateRegistry } from '../../data/buildingTemplates/masterTemplateRegistry';
import { ViewerModel3D } from '../types';
import { BuildingGeometryAdapter } from './buildingGeometryAdapter';
import { RoadGeometryAdapter } from './roadGeometryAdapter';
import { DrainageGeometryAdapter } from './drainageGeometryAdapter';

export interface ResolveGeometryOptions {
  templateIdOrCode: string;
  parameters?: Record<string, any>;
}

export class MasterGeometryResolver {
  /**
   * Resolve template dan hasilkan model geometri 3D deterministik.
   * Mendukung semua 7 Master Building Templates:
   * - Residential: HOUSE-T36-1FL, HOUSE-T45-1FL, HOUSE-T70-1FL, HOUSE-T36-2FL
   * - Commercial: RUKO-2FL
   * - Infrastructure: INFRA-ROAD-CONCRETE
   * - Drainage: DRAIN-UDITCH
   */
  public static resolve(options: ResolveGeometryOptions): ViewerModel3D {
    const { templateIdOrCode, parameters = {} } = options;

    const template = masterBuildingTemplateRegistry.getTemplateById(templateIdOrCode);
    if (!template) {
      throw new Error(`Template dengan ID atau Kode '${templateIdOrCode}' tidak ditemukan.`);
    }

    // 1. Residential, Commercial, Villa Buildings
    if (['residential', 'commercial', 'villa'].includes(template.category)) {
      return BuildingGeometryAdapter.generateBuildingModel(template, parameters);
    }

    // 2. Concrete Road Infrastructure
    if (template.category === 'road') {
      return RoadGeometryAdapter.generateRoadModel(template, parameters);
    }

    // 3. Precast U-Ditch Drainage Infrastructure
    if (template.category === 'drainage') {
      return DrainageGeometryAdapter.generateDrainageModel(template, parameters);
    }

    throw new Error(`Kategori template '${template.category}' belum memiliki mapping geometri 3D (NEEDS_GEOMETRY_MAPPING).`);
  }
}

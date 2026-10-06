import { MasterBuildingTemplate, BuildingCategory } from './schema/types';
import { HOUSE_TYPE_36_SINGLE_FLOOR_TEMPLATE } from './templates/houseType36Template';
import { HOUSE_TYPE_45_SINGLE_FLOOR_TEMPLATE } from './templates/houseType45Template';
import { HOUSE_TYPE_70_SINGLE_FLOOR_TEMPLATE } from './templates/houseType70Template';
import { HOUSE_TYPE_36_TWO_FLOOR_TEMPLATE } from './templates/houseType36TwoFloorTemplate';
import { SHOPHOUSE_2_FLOOR_TEMPLATE } from './templates/shophouse2FloorTemplate';
import { CONCRETE_ROAD_TEMPLATE } from './templates/concreteRoadTemplate';
import { UDITCH_DRAINAGE_TEMPLATE } from './templates/uDitchDrainageTemplate';

/**
 * MASTER BUILDING TEMPLATE REGISTRY
 * Pusat pendaftaran seluruh template bangunan dan infrastruktur resmi EZRAB AI Core.
 */

class MasterBuildingTemplateRegistry {
  private templates: Map<string, MasterBuildingTemplate> = new Map();

  constructor() {
    this.registerTemplate(HOUSE_TYPE_36_SINGLE_FLOOR_TEMPLATE);
    this.registerTemplate(HOUSE_TYPE_45_SINGLE_FLOOR_TEMPLATE);
    this.registerTemplate(HOUSE_TYPE_70_SINGLE_FLOOR_TEMPLATE);
    this.registerTemplate(HOUSE_TYPE_36_TWO_FLOOR_TEMPLATE);
    this.registerTemplate(SHOPHOUSE_2_FLOOR_TEMPLATE);
    this.registerTemplate(CONCRETE_ROAD_TEMPLATE);
    this.registerTemplate(UDITCH_DRAINAGE_TEMPLATE);
  }

  public registerTemplate(template: MasterBuildingTemplate): void {
    this.templates.set(template.id, template);
    this.templates.set(template.code.toLowerCase(), template);
  }

  public getTemplateById(idOrCode: string): MasterBuildingTemplate | undefined {
    return this.templates.get(idOrCode) || this.templates.get(idOrCode.toLowerCase());
  }

  public getAllTemplates(): MasterBuildingTemplate[] {
    // Unique templates list
    const uniqueMap = new Map<string, MasterBuildingTemplate>();
    for (const t of this.templates.values()) {
      uniqueMap.set(t.id, t);
    }
    return Array.from(uniqueMap.values());
  }

  public getTemplatesByCategory(category: BuildingCategory): MasterBuildingTemplate[] {
    return this.getAllTemplates().filter((t) => t.category === category);
  }

  public searchTemplates(query: string): MasterBuildingTemplate[] {
    const q = query.toLowerCase().trim();
    if (!q) return this.getAllTemplates();

    return this.getAllTemplates().filter((t) => {
      return (
        t.name.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.applicableProjectTypes.some((pt) => pt.toLowerCase().includes(q))
      );
    });
  }
}

export const masterBuildingTemplateRegistry = new MasterBuildingTemplateRegistry();

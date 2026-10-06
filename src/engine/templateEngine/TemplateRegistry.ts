import { ConstructionProjectTemplate, ProjectCategory } from './types';
import { residentialPilotTemplate } from './templates/building/residentialPilot';
import { hotelTemplate } from './templates/building/hotelTemplate';
import { hospitalTemplate } from './templates/building/hospitalTemplate';
import { multipurposeTemplate } from './templates/building/multipurposeTemplate';
import { officeTemplate } from './templates/building/officeTemplate';
import { schoolTemplate } from './templates/building/schoolTemplate';
import { mosqueTemplate } from './templates/building/mosqueTemplate';
import { warehouseTemplate } from './templates/building/warehouseTemplate';
import { marketTemplate } from './templates/building/marketTemplate';
import { parkingTemplate } from './templates/building/parkingTemplate';
import { roadTemplate } from './templates/infrastructure/roadTemplate';
import { pavingTemplate } from './templates/infrastructure/pavingTemplate';
import { bridgeTemplate } from './templates/infrastructure/bridgeTemplate';
import { waterStructureTemplate } from './templates/infrastructure/waterStructureTemplate';

export class TemplateRegistry {
  private static instance: TemplateRegistry;
  private templates: Map<string, ConstructionProjectTemplate> = new Map();

  private constructor() {
    this.registerDefaultTemplates();
  }

  public static getInstance(): TemplateRegistry {
    if (!TemplateRegistry.instance) {
      TemplateRegistry.instance = new TemplateRegistry();
    }
    return TemplateRegistry.instance;
  }

  private registerDefaultTemplates(): void {
    // BUILDING (10 Complete Templates + 1 Custom)
    this.register(residentialPilotTemplate);
    this.register(hotelTemplate);
    this.register(hospitalTemplate);
    this.register(multipurposeTemplate);
    this.register(officeTemplate);
    this.register(schoolTemplate);
    this.register(mosqueTemplate);
    this.register(warehouseTemplate);
    this.register(marketTemplate);
    this.register(parkingTemplate);

    // Bangunan Custom / Bebas
    this.register({
      id: 'tmpl-building-custom',
      name: 'Bangunan Gedung Custom / Khusus',
      code: 'BLD-CUS-001',
      category: 'BUILDING',
      type: 'custom',
      version: '2.0.0',
      description: 'Template fleksibel untuk bangunan arsitektur unik atau kebutuhan non-standar.',
      aliases: ['custom', 'khusus', 'bangunan lain', 'proyek lain', 'bebas', 'mixed use'],
      keywords: ['custom', 'lainnya', 'khusus', 'campuran', 'mixed use'],
      parameters: [
        { id: 'building_area', name: 'Estimasi Luas Bangunan', type: 'NUMBER', required: true, defaultValue: 150, unit: 'm²', group: 'dimensions' }
      ],
      wbsHierarchy: [
        { code: '01', title: 'PEKERJAAN PERSIAPAN', level: 1 },
        { code: '02', title: 'PEKERJAAN STRUKTUR PONDASI & BETON', level: 1 },
        { code: '03', title: 'PEKERJAAN ARSITEKTUR & FINISHING', level: 1 },
        { code: '04', title: 'PEKERJAAN MEKANIKAL & ELEKTRIKAL', level: 1 }
      ],
      created_at: '2026-09-16T00:00:00Z',
      updated_at: '2026-09-16T00:00:00Z'
    });

    // INFRASTRUCTURE (4 Complete Templates)
    this.register(roadTemplate);
    this.register(pavingTemplate);
    this.register(bridgeTemplate);
    this.register(waterStructureTemplate);
  }

  public register(template: ConstructionProjectTemplate): void {
    this.templates.set(template.id, template);
  }

  public getById(id: string): ConstructionProjectTemplate | undefined {
    return this.templates.get(id);
  }

  public getAll(): ConstructionProjectTemplate[] {
    return Array.from(this.templates.values());
  }

  public getByCategory(category: ProjectCategory): ConstructionProjectTemplate[] {
    return this.getAll().filter(t => t.category === category);
  }

  public getByType(type: string): ConstructionProjectTemplate | undefined {
    return this.getAll().find(t => t.type.toLowerCase() === type.toLowerCase());
  }
}

/**
 * Multi-Domain Construction Architecture Engine (Priority 3)
 *
 * Modular registry covering BUILDING, ROAD, WATER, and CIVIL domains
 * with readiness gating and engineering validation rules.
 */

export type ConstructionDomain = 'BUILDING' | 'ROAD' | 'WATER' | 'CIVIL';
export type DomainReadinessStatus = 'READY' | 'COMING_SOON' | 'ENGINEERING_REVIEW_REQUIRED';

export interface DomainComponentDefinition {
  componentId: string;
  domain: ConstructionDomain;
  subType: string;
  name: string;
  description: string;
  readinessStatus: DomainReadinessStatus;
  isVerifiedSlice: boolean;
  requiredParameters: string[];
  ahspCategoryMapping: string[];
  calculationEngine: string | null;
}

export class MultiDomainEngine {
  private static instance: MultiDomainEngine;
  private components: Map<string, DomainComponentDefinition> = new Map();

  private constructor() {
    this.registerAllDomains();
  }

  public static getInstance(): MultiDomainEngine {
    if (!MultiDomainEngine.instance) {
      MultiDomainEngine.instance = new MultiDomainEngine();
    }
    return MultiDomainEngine.instance;
  }

  private registerAllDomains(): void {
    // 1. BUILDING DOMAIN
    this.components.set('DOM-BLD-HOUSE', {
      componentId: 'DOM-BLD-HOUSE',
      domain: 'BUILDING',
      subType: 'HOUSE',
      name: 'Rumah Tinggal (Type 36 s/d Type 300)',
      description: 'Struktur bangunan rumah hunian sederhana hingga mewah 1-2 lantai.',
      readinessStatus: 'READY',
      isVerifiedSlice: true,
      requiredParameters: ['building_area', 'foundation_type', 'wall_type', 'roof_type'],
      ahspCategoryMapping: ['PUPR-2026-CIPTAKARYA-GEDUNG'],
      calculationEngine: 'ParametricHouseEngine'
    });

    this.components.set('DOM-BLD-COMMERCIAL', {
      componentId: 'DOM-BLD-COMMERCIAL',
      domain: 'BUILDING',
      subType: 'COMMERCIAL',
      name: 'Ruko & Gedung Komersial',
      description: 'Bangunan ruko 2-3 lantai dan fasilitas usaha bertingkat.',
      readinessStatus: 'READY',
      isVerifiedSlice: true,
      requiredParameters: ['building_area', 'num_floors', 'wall_type'],
      ahspCategoryMapping: ['PUPR-2026-CIPTAKARYA-GEDUNG'],
      calculationEngine: 'CommercialBuildingEngine'
    });

    this.components.set('DOM-BLD-HOSPITAL', {
      componentId: 'DOM-BLD-HOSPITAL',
      domain: 'BUILDING',
      subType: 'HOSPITAL',
      name: 'Gedung Rumah Sakit & Fasilitas Kesehatan',
      description: 'Struktur fasilitas medis dengan spesifikasi MEP & sterilisasi khusus.',
      readinessStatus: 'ENGINEERING_REVIEW_REQUIRED',
      isVerifiedSlice: false,
      requiredParameters: ['building_area', 'num_floors', 'mep_complexity'],
      ahspCategoryMapping: ['PUPR-2026-CIPTAKARYA-GEDUNG'],
      calculationEngine: null
    });

    // 2. ROAD DOMAIN
    this.components.set('DOM-ROAD-ASPHALT', {
      componentId: 'DOM-ROAD-ASPHALT',
      domain: 'ROAD',
      subType: 'ASPHALT',
      name: 'Perkerasan Lentur Jalan Aspal (Hotmix)',
      description: 'Jalan aspal dengan lapisan fondasi agregat Klas A/B dan AC-WC/AC-BC.',
      readinessStatus: 'READY',
      isVerifiedSlice: true,
      requiredParameters: ['length', 'width', 'thickness', 'subgrade_type'],
      ahspCategoryMapping: ['PUPR-2026-BINAMARGA-JALAN'],
      calculationEngine: 'AsphaltRoadEngine'
    });

    this.components.set('DOM-ROAD-RIGID', {
      componentId: 'DOM-ROAD-RIGID',
      domain: 'ROAD',
      subType: 'RIGID_CONCRETE',
      name: 'Perkerasan Kaku Jalan Beton Semen',
      description: 'Jalan beton bertulang mutu K-300 / K-350 dengan lean concrete.',
      readinessStatus: 'READY',
      isVerifiedSlice: true,
      requiredParameters: ['length', 'width', 'thickness'],
      ahspCategoryMapping: ['PUPR-2026-BINAMARGA-JALAN'],
      calculationEngine: 'RigidRoadEngine'
    });

    this.components.set('DOM-ROAD-PAVING', {
      componentId: 'DOM-ROAD-PAVING',
      domain: 'ROAD',
      subType: 'PAVING_BLOCK',
      name: 'Perkerasan Paving Block',
      description: 'Paving block tebal 6-8 cm mutu K-300/K-400 untuk jalan lingkungan/kawasan.',
      readinessStatus: 'READY',
      isVerifiedSlice: true,
      requiredParameters: ['length', 'width', 'paving_type'],
      ahspCategoryMapping: ['PUPR-2026-BINAMARGA-JALAN'],
      calculationEngine: 'PavingRoadEngine'
    });

    // 3. WATER DOMAIN
    this.components.set('DOM-WATER-DRAIN', {
      componentId: 'DOM-WATER-DRAIN',
      domain: 'WATER',
      subType: 'DRAINAGE',
      name: 'Saluran Drainase U-Ditch Precast',
      description: 'Saluran terbuka precast beton U-Ditch dan penutup tutup heavy/light duty.',
      readinessStatus: 'READY',
      isVerifiedSlice: true,
      requiredParameters: ['length', 'uditch_size', 'cover_type'],
      ahspCategoryMapping: ['PUPR-2026-SDA-SALURAN'],
      calculationEngine: 'DrainageEngine'
    });

    this.components.set('DOM-WATER-DAM', {
      componentId: 'DOM-WATER-DAM',
      domain: 'WATER',
      subType: 'DAM',
      name: 'Bendungan & Bangunan Pelimpah (Spillway)',
      description: 'Struktur penampung air masif berskala besar.',
      readinessStatus: 'ENGINEERING_REVIEW_REQUIRED',
      isVerifiedSlice: false,
      requiredParameters: ['crest_length', 'dam_height', 'storage_capacity'],
      ahspCategoryMapping: ['PUPR-2026-SDA-BENDUNGAN'],
      calculationEngine: null
    });

    // 4. CIVIL DOMAIN
    this.components.set('DOM-CIVIL-RETAINING', {
      componentId: 'DOM-CIVIL-RETAINING',
      domain: 'CIVIL',
      subType: 'RETAINING_WALL',
      name: 'Dinding Penahan Tanah (Retaining Wall / Bronjong)',
      description: 'Struktur penahan lereng beton kantilever atau pasangan batu bronjong.',
      readinessStatus: 'COMING_SOON',
      isVerifiedSlice: false,
      requiredParameters: ['length', 'height', 'soil_friction_angle'],
      ahspCategoryMapping: ['PUPR-2026-CIPTAKARYA-SIPIL'],
      calculationEngine: null
    });
  }

  public getComponent(componentId: string): DomainComponentDefinition | undefined {
    return this.components.get(componentId);
  }

  public getByDomain(domain: ConstructionDomain): DomainComponentDefinition[] {
    return Array.from(this.components.values()).filter(c => c.domain === domain);
  }

  public getAll(): DomainComponentDefinition[] {
    return Array.from(this.components.values());
  }
}

export const multiDomainEngine = MultiDomainEngine.getInstance();

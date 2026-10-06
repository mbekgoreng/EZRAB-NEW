/**
 * Canonical House Type Catalog for EZRAB Interactive Automatic RAB Wizard
 *
 * Source of truth for house types from Type 36 up to Type 300 and Custom.
 * Strictly maintains verified template mappings without generating fake AHSP or calculations.
 */

export type HouseCategoryGroup = 'KECIL' | 'MENENGAH' | 'BESAR' | 'CUSTOM';
export type HouseReadinessStatus = 'READY' | 'COMING_SOON' | 'PARAMETRIC_TEMPLATE_REQUIRED';

export interface HouseTypeCatalogItem {
  id: string;
  houseTypeId: string;
  label: string;
  area: number | null; // null for custom
  floorOptions: number[];
  defaultFloorCount: number;
  description: string;
  templateId: string | null;
  readinessStatus: HouseReadinessStatus;
  calculationModule: string | null;
  supportedParameters: string[];
  availability: boolean;
  disabled: boolean;
  disabledReason?: string;
  categoryGroup: HouseCategoryGroup;
  badge?: string;
  displayOrder: number;
  nextStep: string;
  value: string;
}

export const HOUSE_TYPE_CATALOG: HouseTypeCatalogItem[] = [
  {
    id: 'house_t36_1fl',
    houseTypeId: 'T36_1FL',
    label: 'Rumah Type 36',
    area: 36,
    floorOptions: [1, 2],
    defaultFloorCount: 1,
    description: 'Luas bangunan ±36 m², 1 lantai (2 KT, 1 KM)',
    templateId: 'HOUSE-T36-1FL',
    readinessStatus: 'READY',
    calculationModule: 'HOUSE_T36_ENGINE',
    supportedParameters: ['building_area', 'foundation_type', 'wall_type', 'roof_type', 'quality_level'],
    availability: true,
    disabled: false,
    categoryGroup: 'KECIL',
    badge: 'Template Tersedia',
    displayOrder: 36,
    nextStep: 'BASIC_PARAMETER_COLLECTION',
    value: 'HOUSE-T36-1FL',
  },
  {
    id: 'house_t36_2fl',
    houseTypeId: 'T36_2FL',
    label: 'Rumah Type 36 (2 Lantai)',
    area: 36,
    floorOptions: [2],
    defaultFloorCount: 2,
    description: 'Luas bangunan ±36 m² per lantai (total 72 m²), 2 lantai',
    templateId: 'HOUSE-T36-2FL',
    readinessStatus: 'READY',
    calculationModule: 'HOUSE_T36_2FL_ENGINE',
    supportedParameters: ['building_area', 'foundation_type', 'wall_type', 'roof_type', 'quality_level'],
    availability: true,
    disabled: false,
    categoryGroup: 'KECIL',
    badge: 'Template Tersedia',
    displayOrder: 36.5,
    nextStep: 'BASIC_PARAMETER_COLLECTION',
    value: 'HOUSE-T36-2FL',
  },
  {
    id: 'house_t45_1fl',
    houseTypeId: 'T45_1FL',
    label: 'Rumah Type 45',
    area: 45,
    floorOptions: [1, 2],
    defaultFloorCount: 1,
    description: 'Luas bangunan ±45 m², 1 lantai (2 KT, 1 KM, Carport)',
    templateId: 'HOUSE-T45-1FL',
    readinessStatus: 'READY',
    calculationModule: 'HOUSE_T45_ENGINE',
    supportedParameters: ['building_area', 'foundation_type', 'wall_type', 'roof_type', 'quality_level'],
    availability: true,
    disabled: false,
    categoryGroup: 'KECIL',
    badge: 'Template Tersedia',
    displayOrder: 45,
    nextStep: 'BASIC_PARAMETER_COLLECTION',
    value: 'HOUSE-T45-1FL',
  },
  {
    id: 'house_t54',
    houseTypeId: 'T54',
    label: 'Rumah Type 54',
    area: 54,
    floorOptions: [1, 2],
    defaultFloorCount: 1,
    description: 'Luas bangunan ±54 m², 1 lantai (3 KT, 1 KM, Carport)',
    templateId: 'HOUSE-T54-1FL',
    readinessStatus: 'READY',
    calculationModule: 'HOUSE_T54_ENGINE',
    supportedParameters: ['building_area', 'foundation_type', 'wall_type', 'roof_type', 'quality_level'],
    availability: true,
    disabled: false,
    categoryGroup: 'KECIL',
    badge: 'Template Tersedia',
    displayOrder: 54,
    nextStep: 'BASIC_PARAMETER_COLLECTION',
    value: 'HOUSE-T54-1FL',
  },
  {
    id: 'house_t60',
    houseTypeId: 'T60',
    label: 'Rumah Type 60',
    area: 60,
    floorOptions: [1, 2],
    defaultFloorCount: 1,
    description: 'Luas bangunan ±60 m², 1 lantai (3 KT, 2 KM, R. Makan)',
    templateId: 'HOUSE-T60-1FL',
    readinessStatus: 'READY',
    calculationModule: 'HOUSE_T60_ENGINE',
    supportedParameters: ['building_area', 'foundation_type', 'wall_type', 'roof_type', 'quality_level'],
    availability: true,
    disabled: false,
    categoryGroup: 'KECIL',
    badge: 'Template Tersedia',
    displayOrder: 60,
    nextStep: 'BASIC_PARAMETER_COLLECTION',
    value: 'HOUSE-T60-1FL',
  },
  {
    id: 'house_t70_1fl',
    houseTypeId: 'T70_1FL',
    label: 'Rumah Type 70',
    area: 70,
    floorOptions: [1, 2],
    defaultFloorCount: 1,
    description: 'Luas bangunan ±70 m², 1 lantai (3 KT, 2 KM, R. Keluarga)',
    templateId: 'HOUSE-T70-1FL',
    readinessStatus: 'READY',
    calculationModule: 'HOUSE_T70_ENGINE',
    supportedParameters: ['building_area', 'foundation_type', 'wall_type', 'roof_type', 'quality_level'],
    availability: true,
    disabled: false,
    categoryGroup: 'KECIL',
    badge: 'Template Tersedia',
    displayOrder: 70,
    nextStep: 'BASIC_PARAMETER_COLLECTION',
    value: 'HOUSE-T70-1FL',
  },
  {
    id: 'house_t90',
    houseTypeId: 'T90',
    label: 'Rumah Type 90 (2 Lantai)',
    area: 90,
    floorOptions: [2],
    defaultFloorCount: 2,
    description: 'Luas bangunan ±90 m², 2 lantai (3-4 KT, 2 KM, Balkon)',
    templateId: 'HOUSE-T90-2FL',
    readinessStatus: 'READY',
    calculationModule: 'HOUSE_T90_ENGINE',
    supportedParameters: ['building_area', 'foundation_type', 'wall_type', 'roof_type', 'quality_level'],
    availability: true,
    disabled: false,
    categoryGroup: 'MENENGAH',
    badge: 'Template Tersedia',
    displayOrder: 90,
    nextStep: 'BASIC_PARAMETER_COLLECTION',
    value: 'HOUSE-T90-2FL',
  },
  {
    id: 'house_t100',
    houseTypeId: 'T100',
    label: 'Rumah Type 100 (2 Lantai)',
    area: 100,
    floorOptions: [2],
    defaultFloorCount: 2,
    description: 'Luas bangunan ±100 m², 2 lantai (4 KT, 2-3 KM, Carport)',
    templateId: 'HOUSE-T100-2FL',
    readinessStatus: 'READY',
    calculationModule: 'HOUSE_T100_ENGINE',
    supportedParameters: ['building_area', 'foundation_type', 'wall_type', 'roof_type', 'quality_level'],
    availability: true,
    disabled: false,
    categoryGroup: 'MENENGAH',
    badge: 'Template Tersedia',
    displayOrder: 100,
    nextStep: 'BASIC_PARAMETER_COLLECTION',
    value: 'HOUSE-T100-2FL',
  },
  {
    id: 'house_t120',
    houseTypeId: 'T120',
    label: 'Rumah Type 120 (2 Lantai)',
    area: 120,
    floorOptions: [2],
    defaultFloorCount: 2,
    description: 'Luas bangunan ±120 m², 2 lantai (4 KT, 3 KM, R. Tamu & R. Keluarga)',
    templateId: 'HOUSE-T120-2FL',
    readinessStatus: 'READY',
    calculationModule: 'HOUSE_T120_ENGINE',
    supportedParameters: ['building_area', 'foundation_type', 'wall_type', 'roof_type', 'quality_level'],
    availability: true,
    disabled: false,
    categoryGroup: 'MENENGAH',
    badge: 'Template Tersedia',
    displayOrder: 120,
    nextStep: 'BASIC_PARAMETER_COLLECTION',
    value: 'HOUSE-T120-2FL',
  },
  {
    id: 'house_t150',
    houseTypeId: 'T150',
    label: 'Rumah Type 150 (2 Lantai)',
    area: 150,
    floorOptions: [2],
    defaultFloorCount: 2,
    description: 'Luas bangunan ±150 m², 2 lantai (4-5 KT, 3-4 KM, Carport 2 Mobil)',
    templateId: 'HOUSE-T150-2FL',
    readinessStatus: 'READY',
    calculationModule: 'HOUSE_T150_ENGINE',
    supportedParameters: ['building_area', 'foundation_type', 'wall_type', 'roof_type', 'quality_level'],
    availability: true,
    disabled: false,
    categoryGroup: 'MENENGAH',
    badge: 'Template Tersedia',
    displayOrder: 150,
    nextStep: 'BASIC_PARAMETER_COLLECTION',
    value: 'HOUSE-T150-2FL',
  },
  {
    id: 'house_t180',
    houseTypeId: 'T180',
    label: 'Rumah Type 180 (2 Lantai)',
    area: 180,
    floorOptions: [2, 3],
    defaultFloorCount: 2,
    description: 'Luas bangunan ±180 m², 2 lantai (4-5 KT, 4 KM, Garasi + Carport)',
    templateId: 'HOUSE-T180-2FL',
    readinessStatus: 'READY',
    calculationModule: 'HOUSE_T180_ENGINE',
    supportedParameters: ['building_area', 'foundation_type', 'wall_type', 'roof_type', 'quality_level'],
    availability: true,
    disabled: false,
    categoryGroup: 'BESAR',
    badge: 'Template Tersedia',
    displayOrder: 180,
    nextStep: 'BASIC_PARAMETER_COLLECTION',
    value: 'HOUSE-T180-2FL',
  },
  {
    id: 'house_t200',
    houseTypeId: 'T200',
    label: 'Rumah Type 200 (2 Lantai)',
    area: 200,
    floorOptions: [2, 3],
    defaultFloorCount: 2,
    description: 'Luas bangunan ±200 m², 2 lantai (5 KT, 4-5 KM, Taman Belakang, Garasi)',
    templateId: 'HOUSE-T200-2FL',
    readinessStatus: 'READY',
    calculationModule: 'HOUSE_T200_ENGINE',
    supportedParameters: ['building_area', 'foundation_type', 'wall_type', 'roof_type', 'quality_level'],
    availability: true,
    disabled: false,
    categoryGroup: 'BESAR',
    badge: 'Template Tersedia',
    displayOrder: 200,
    nextStep: 'BASIC_PARAMETER_COLLECTION',
    value: 'HOUSE-T200-2FL',
  },
  {
    id: 'house_t250',
    houseTypeId: 'T250',
    label: 'Rumah Type 250 (2 Lantai)',
    area: 250,
    floorOptions: [2, 3],
    defaultFloorCount: 2,
    description: 'Luas bangunan ±250 m², 2 lantai (5-6 KT, 5 KM, Ruang Kerja, Garasi 2 Mobil)',
    templateId: 'HOUSE-T250-2FL',
    readinessStatus: 'READY',
    calculationModule: 'HOUSE_T250_ENGINE',
    supportedParameters: ['building_area', 'foundation_type', 'wall_type', 'roof_type', 'quality_level'],
    availability: true,
    disabled: false,
    categoryGroup: 'BESAR',
    badge: 'Template Tersedia',
    displayOrder: 250,
    nextStep: 'BASIC_PARAMETER_COLLECTION',
    value: 'HOUSE-T250-2FL',
  },
  {
    id: 'house_t300',
    houseTypeId: 'T300',
    label: 'Rumah Type 300 (2 Lantai)',
    area: 300,
    floorOptions: [2, 3],
    defaultFloorCount: 2,
    description: 'Luas bangunan ±300 m², 2 lantai (6 KT, 5-6 KM, Garasi 2 Mobil + Carport)',
    templateId: 'HOUSE-T300-2FL',
    readinessStatus: 'READY',
    calculationModule: 'HOUSE_T300_ENGINE',
    supportedParameters: ['building_area', 'foundation_type', 'wall_type', 'roof_type', 'quality_level'],
    availability: true,
    disabled: false,
    categoryGroup: 'BESAR',
    badge: 'Template Tersedia',
    displayOrder: 300,
    nextStep: 'BASIC_PARAMETER_COLLECTION',
    value: 'HOUSE-T300-2FL',
  },
  {
    id: 'house_custom',
    houseTypeId: 'CUSTOM',
    label: 'Rumah Custom',
    area: null,
    floorOptions: [1, 2, 3, 4],
    defaultFloorCount: 1,
    description: 'Spesifikasi denah, luas m², dan jumlah lantai custom',
    templateId: 'HOUSE-CUSTOM',
    readinessStatus: 'READY',
    calculationModule: 'CUSTOM_PARAMETRIC_ENGINE',
    supportedParameters: ['building_area', 'num_floors', 'foundation_type', 'wall_type', 'roof_type', 'quality_level'],
    availability: true,
    disabled: false,
    categoryGroup: 'CUSTOM',
    badge: 'Custom Spesifikasi',
    displayOrder: 9999,
    nextStep: 'BASIC_PARAMETER_COLLECTION',
    value: 'HOUSE-CUSTOM',
  },
];

export class HouseTypeCatalog {
  /**
   * Get all house types sorted strictly by numerical area (36 -> 300 -> Custom)
   */
  public static getAll(): HouseTypeCatalogItem[] {
    return [...HOUSE_TYPE_CATALOG].sort((a, b) => a.displayOrder - b.displayOrder);
  }

  /**
   * Find house type by id, templateId, or numeric type
   */
  public static findById(idOrValue: string): HouseTypeCatalogItem | undefined {
    const norm = idOrValue.toLowerCase().replace(/[-_]/g, '');
    return HOUSE_TYPE_CATALOG.find(
      (h) =>
        h.id.toLowerCase().replace(/[-_]/g, '') === norm ||
        h.value.toLowerCase().replace(/[-_]/g, '') === norm ||
        h.houseTypeId.toLowerCase().replace(/[-_]/g, '') === norm ||
        (h.area !== null && `t${h.area}` === norm)
    );
  }

  /**
   * Find house type from natural language query
   * e.g. "RAB rumah type 120", "tipe 300", "rumah 200 meter", "rumah 2 lantai type 200"
   */
  public static findFromQuery(query: string): {
    item?: HouseTypeCatalogItem;
    extractedArea?: number;
    extractedFloors?: number;
  } {
    const q = query.toLowerCase();

    // Check floor count in query
    let extractedFloors: number | undefined = undefined;
    if (q.includes('2 lantai') || q.includes('dua lantai') || q.includes('bertingkat')) {
      extractedFloors = 2;
    } else if (q.includes('1 lantai') || q.includes('satu lantai')) {
      extractedFloors = 1;
    } else if (q.includes('3 lantai') || q.includes('tiga lantai')) {
      extractedFloors = 3;
    }

    // Match numeric type patterns: "type 300", "tipe 300", "t300", "t-300", "300 m2", "300 meter"
    const typeMatch = q.match(/(?:type|tipe|t)\s*[-_]?\s*(\d+)/i) || q.match(/(\d+)\s*(?:m2|meter|m²)\b/i);
    let extractedArea: number | undefined = undefined;

    if (typeMatch) {
      extractedArea = parseInt(typeMatch[1], 10);
      // Find matching item by area
      if (extractedArea === 36 && extractedFloors === 2) {
        const item = HOUSE_TYPE_CATALOG.find((h) => h.id === 'house_t36_2fl');
        if (item) return { item, extractedArea, extractedFloors };
      }
      const item = HOUSE_TYPE_CATALOG.find((h) => h.area === extractedArea);
      if (item) {
        return { item, extractedArea, extractedFloors };
      }
    }

    // Check custom
    if (q.includes('custom') || q.includes('khusus')) {
      const item = HOUSE_TYPE_CATALOG.find((h) => h.id === 'house_custom');
      return { item, extractedArea, extractedFloors };
    }

    return { extractedArea, extractedFloors };
  }

  /**
   * Filter catalog by category group or search keyword
   */
  public static filter(categoryGroup?: HouseCategoryGroup | 'ALL', searchQuery?: string): HouseTypeCatalogItem[] {
    let list = HouseTypeCatalog.getAll();

    if (categoryGroup && categoryGroup !== 'ALL') {
      list = list.filter((h) => h.categoryGroup === categoryGroup);
    }

    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (h) =>
          h.label.toLowerCase().includes(q) ||
          h.description.toLowerCase().includes(q) ||
          (h.area !== null && String(h.area).includes(q)) ||
          h.houseTypeId.toLowerCase().includes(q)
      );
    }

    return list;
  }
}

/**
 * Phase 6.4: Construction Knowledge Graph & Method Ontology
 *
 * Maps:
 * Canonical Entity -> Element -> Construction Method -> Work Item Candidate -> WBS Category
 */

import { CanonicalEntity } from '../../src/domain/document/canonicalEntityTypes';
import { ConstructionKnowledgeLink } from '../../src/domain/document/templateMappingTypes';

export class ConstructionKnowledgeGraph {
  private static knowledgeRules: ConstructionKnowledgeLink[] = [
    // --- STRUKTUR SUBSTRUKTUR (FOUNDATIONS) ---
    {
      elementType: 'FOUNDATION_FOOTING',
      materialType: 'REINFORCED_CONCRETE',
      constructionMethod: 'CAST_IN_PLACE',
      targetWbsCategory: 'PEKERJAAN_PONDASI_BETON_BERTULANG',
      suggestedWbsCodePrefix: '02.02',
      defaultAhspCode: 'A.4.1.1.5'
    },
    {
      elementType: 'FOUNDATION_STONE',
      materialType: 'RUBBLE_STONE',
      constructionMethod: 'MASONRY',
      targetWbsCategory: 'PEKERJAAN_PONDASI_BATU_KALI',
      suggestedWbsCodePrefix: '02.01',
      defaultAhspCode: 'A.3.2.1.2'
    },
    {
      elementType: 'BORED_PILE',
      materialType: 'REINFORCED_CONCRETE',
      constructionMethod: 'BORED_CAST_IN_PLACE',
      targetWbsCategory: 'PEKERJAAN_PONDASI_DALAM_BORED_PILE',
      suggestedWbsCodePrefix: '02.03',
      defaultAhspCode: 'A.4.1.1.20'
    },

    // --- STRUKTUR SUPERSTRUKTUR (CONCRETE) ---
    {
      elementType: 'COLUMN',
      materialType: 'REINFORCED_CONCRETE',
      constructionMethod: 'CAST_IN_PLACE',
      targetWbsCategory: 'PEKERJAAN_KOLOM_BETON_BERTULANG',
      suggestedWbsCodePrefix: '03.02',
      defaultAhspCode: 'A.4.1.1.7'
    },
    {
      elementType: 'BEAM',
      materialType: 'REINFORCED_CONCRETE',
      constructionMethod: 'CAST_IN_PLACE',
      targetWbsCategory: 'PEKERJAAN_BALOK_BETON_BERTULANG',
      suggestedWbsCodePrefix: '03.03',
      defaultAhspCode: 'A.4.1.1.8'
    },
    {
      elementType: 'SLAB',
      materialType: 'REINFORCED_CONCRETE',
      constructionMethod: 'CAST_IN_PLACE',
      targetWbsCategory: 'PEKERJAAN_PELAT_LANTAI_BETON_BERTULANG',
      suggestedWbsCodePrefix: '03.04',
      defaultAhspCode: 'A.4.1.1.9'
    },
    {
      elementType: 'SLOOF',
      materialType: 'REINFORCED_CONCRETE',
      constructionMethod: 'CAST_IN_PLACE',
      targetWbsCategory: 'PEKERJAAN_SLOOF_BETON_BERTULANG',
      suggestedWbsCodePrefix: '03.01',
      defaultAhspCode: 'A.4.1.1.6'
    },
    {
      elementType: 'STAIRS',
      materialType: 'REINFORCED_CONCRETE',
      constructionMethod: 'CAST_IN_PLACE',
      targetWbsCategory: 'PEKERJAAN_TANGGA_BETON_BERTULANG',
      suggestedWbsCodePrefix: '03.05',
      defaultAhspCode: 'A.4.1.1.10'
    },
    {
      elementType: 'BASEMENT_WALL',
      materialType: 'REINFORCED_CONCRETE',
      constructionMethod: 'CAST_IN_PLACE_WATERPROOFED',
      targetWbsCategory: 'PEKERJAAN_DINDING_PENAHAN_BASEMENT',
      suggestedWbsCodePrefix: '02.05',
      defaultAhspCode: 'A.4.1.1.12'
    },

    // --- ARSITEKTUR (WALLS & FINISHINGS) ---
    {
      elementType: 'WALL',
      materialType: 'LIGHTWEIGHT_AAC',
      constructionMethod: 'MORTAR_JOINED',
      targetWbsCategory: 'PEKERJAAN_PASANGAN_DINDING_BATA_RINGAN',
      suggestedWbsCodePrefix: '04.01',
      defaultAhspCode: 'A.4.4.1.16'
    },
    {
      elementType: 'WALL',
      materialType: 'RED_BRICK',
      constructionMethod: 'MORTAR_JOINED',
      targetWbsCategory: 'PEKERJAAN_PASANGAN_DINDING_BATA_MERAH',
      suggestedWbsCodePrefix: '04.02',
      defaultAhspCode: 'A.4.4.1.9'
    },
    {
      elementType: 'FLOOR_FINISH',
      materialType: 'HOMOGENEOUS_TILE',
      constructionMethod: 'ADHESIVE_BEDDED',
      targetWbsCategory: 'PEKERJAAN_PENUTUP_LANTAI_GRANIT',
      suggestedWbsCodePrefix: '05.01',
      defaultAhspCode: 'A.4.4.3.35'
    },
    {
      elementType: 'CEILING',
      materialType: 'GYPSUM_BOARD',
      constructionMethod: 'HOLLOW_FRAME_SUSPENDED',
      targetWbsCategory: 'PEKERJAAN_PLAFON_GYPSUM',
      suggestedWbsCodePrefix: '08.01',
      defaultAhspCode: 'A.4.5.1.7'
    },
    {
      elementType: 'DOOR',
      materialType: 'ALUMINUM_WOOD',
      constructionMethod: 'MECHANICAL_FASTENED',
      targetWbsCategory: 'PEKERJAAN_KUSEN_PINTU_ALUMINIUM',
      suggestedWbsCodePrefix: '07.01',
      defaultAhspCode: 'A.4.6.1.1'
    },
    {
      elementType: 'WINDOW',
      materialType: 'ALUMINUM_GLASS',
      constructionMethod: 'MECHANICAL_FASTENED',
      targetWbsCategory: 'PEKERJAAN_KUSEN_JENDELA_KACA',
      suggestedWbsCodePrefix: '07.02',
      defaultAhspCode: 'A.4.6.1.2'
    },
    {
      elementType: 'PAINTING',
      materialType: 'ACRYLIC_EMULSION',
      constructionMethod: 'ROLLER_APPLIED',
      targetWbsCategory: 'PEKERJAAN_PENGECATAN_DINDING',
      suggestedWbsCodePrefix: '11.01',
      defaultAhspCode: 'A.4.7.1.10'
    },

    // --- MEP & SPECIALTIES ---
    {
      elementType: 'ELEVATOR',
      materialType: 'TRACTION_MACHINE',
      constructionMethod: 'SPECIALIST_INSTALLATION',
      targetWbsCategory: 'PEKERJAAN_LIFT_PASSENGER',
      suggestedWbsCodePrefix: '09.05',
      defaultAhspCode: 'MEP.LIFT.01'
    },
    {
      elementType: 'SWIMMING_POOL',
      materialType: 'REINFORCED_WATERPROOF_CONCRETE',
      constructionMethod: 'CAST_IN_PLACE_WATERPROOFED',
      targetWbsCategory: 'PEKERJAAN_KOLAM_RENANG_DAN_MEP',
      suggestedWbsCodePrefix: '12.04',
      defaultAhspCode: 'A.4.1.1.15'
    },
    {
      elementType: 'MEDICAL_GAS',
      materialType: 'COPPER_PIPING_MEDICAL',
      constructionMethod: 'SPECIALIST_WELDED',
      targetWbsCategory: 'PEKERJAAN_INSTALASI_GAS_MEDIS',
      suggestedWbsCodePrefix: '10.06',
      defaultAhspCode: 'HOSP.GAS.01'
    },

    // --- INFRASTRUCTURE (BINA MARGA, SDA, CIPTA KARYA) ---
    {
      elementType: 'ROAD_PAVEMENT_ASPHALT',
      materialType: 'ASPHALT_AC_WC',
      constructionMethod: 'PAVER_COMPACTED',
      targetWbsCategory: 'PEKERJAAN_PERKERASAN_ASPAL_HOTMIX',
      suggestedWbsCodePrefix: '04.01',
      defaultAhspCode: 'BM.6.3.1'
    },
    {
      elementType: 'ROAD_PAVEMENT_RIGID',
      materialType: 'RIGID_CONCRETE_FS45',
      constructionMethod: 'SLIPFORM_PAVER',
      targetWbsCategory: 'PEKERJAAN_PERKERASAN_BETON_SEMEN',
      suggestedWbsCodePrefix: '04.02',
      defaultAhspCode: 'BM.5.1.1'
    },
    {
      elementType: 'PAVING_BLOCK',
      materialType: 'CONCRETE_BLOCK_K300',
      constructionMethod: 'SAND_BEDDED_COMPACTED',
      targetWbsCategory: 'PEKERJAAN_PASANGAN_PAVING_BLOCK',
      suggestedWbsCodePrefix: '03.01',
      defaultAhspCode: 'A.4.4.3.50'
    },
    {
      elementType: 'BRIDGE_GIRDER',
      materialType: 'PRECAST_PRESTRESSED_CONCRETE',
      constructionMethod: 'LAUNCHING_GANTRY_ERECTED',
      targetWbsCategory: 'PEKERJAAN_GIRDER_JEMBATAN_PRATEKAN',
      suggestedWbsCodePrefix: '04.01',
      defaultAhspCode: 'BM.7.1.1'
    },
    {
      elementType: 'BRIDGE_ABUTMENT',
      materialType: 'MASS_REINFORCED_CONCRETE',
      constructionMethod: 'CAST_IN_PLACE',
      targetWbsCategory: 'PEKERJAAN_ABUTMENT_DAN_PIER_JEMBATAN',
      suggestedWbsCodePrefix: '03.01',
      defaultAhspCode: 'BM.7.1.2'
    },
    {
      elementType: 'CANAL_LINING',
      materialType: 'STONE_MASONRY_MORTAR',
      constructionMethod: 'SLOPE_MASONRY',
      targetWbsCategory: 'PEKERJAAN_PASANGAN_BATU_SALURAN_IRIGASI',
      suggestedWbsCodePrefix: '03.01',
      defaultAhspCode: 'SDA.03.01'
    },
    {
      elementType: 'SLUICE_GATE',
      materialType: 'MILD_STEEL_COATED',
      constructionMethod: 'FABRICATED_HOIST_MOUNTED',
      targetWbsCategory: 'PEKERJAAN_PINTU_AIR_DAN_MEKANIKAL_SDA',
      suggestedWbsCodePrefix: '04.01',
      defaultAhspCode: 'SDA.04.01'
    }
  ];

  /**
   * Resolve knowledge link for a canonical entity.
   */
  public static resolveKnowledgeLink(entity: CanonicalEntity): ConstructionKnowledgeLink | null {
    const elType = (entity.elementType || '').toUpperCase();
    const name = (entity.name || '').toLowerCase();
    const id = (entity.identifier || '').toLowerCase();
    const mat = (entity.material || '').toLowerCase();

    // 1. Check direct matches
    if (elType.includes('COLUMN') || id.startsWith('k') || name.includes('kolom')) {
      return this.knowledgeRules.find(r => r.elementType === 'COLUMN') || null;
    }
    if (elType.includes('BEAM') || id.startsWith('b') || name.includes('balok')) {
      return this.knowledgeRules.find(r => r.elementType === 'BEAM') || null;
    }
    if (elType.includes('SLAB') || id.startsWith('s') || name.includes('pelat') || name.includes('plat')) {
      return this.knowledgeRules.find(r => r.elementType === 'SLAB') || null;
    }
    if (elType.includes('FOOTING') || elType.includes('FOUNDATION') || id.startsWith('p') || id.startsWith('f') || name.includes('pondasi')) {
      if (name.includes('batu') || name.includes('kali')) {
        return this.knowledgeRules.find(r => r.elementType === 'FOUNDATION_STONE') || null;
      }
      if (name.includes('bore') || name.includes('tiang')) {
        return this.knowledgeRules.find(r => r.elementType === 'BORED_PILE') || null;
      }
      return this.knowledgeRules.find(r => r.elementType === 'FOUNDATION_FOOTING') || null;
    }
    if (elType.includes('SLOOF') || id.startsWith('sl') || name.includes('sloof')) {
      return this.knowledgeRules.find(r => r.elementType === 'SLOOF') || null;
    }
    if (elType.includes('STAIR') || name.includes('tangga')) {
      return this.knowledgeRules.find(r => r.elementType === 'STAIRS') || null;
    }
    if (name.includes('basement') || name.includes('dpt') || name.includes('retaining')) {
      return this.knowledgeRules.find(r => r.elementType === 'BASEMENT_WALL') || null;
    }
    if (elType.includes('DOOR') || id.startsWith('pj') || id.startsWith('p') || name.includes('pintu')) {
      return this.knowledgeRules.find(r => r.elementType === 'DOOR') || null;
    }
    if (elType.includes('WINDOW') || id.startsWith('j') || name.includes('jendela') || name.includes('kaca')) {
      return this.knowledgeRules.find(r => r.elementType === 'WINDOW') || null;
    }
    if (elType.includes('WALL') || name.includes('dinding') || name.includes('bata')) {
      if (name.includes('merah')) {
        return this.knowledgeRules.find(r => r.elementType === 'WALL' && r.materialType === 'RED_BRICK') || null;
      }
      return this.knowledgeRules.find(r => r.elementType === 'WALL' && r.materialType === 'LIGHTWEIGHT_AAC') || null;
    }
    if (elType.includes('FLOOR') || name.includes('granit') || name.includes('keramik') || name.includes('lantai')) {
      return this.knowledgeRules.find(r => r.elementType === 'FLOOR_FINISH') || null;
    }
    if (elType.includes('CEILING') || name.includes('plafon') || name.includes('gypsum')) {
      return this.knowledgeRules.find(r => r.elementType === 'CEILING') || null;
    }
    if (elType.includes('LIFT') || elType.includes('ELEVATOR') || name.includes('lift') || name.includes('elevator')) {
      return this.knowledgeRules.find(r => r.elementType === 'ELEVATOR') || null;
    }
    if (elType.includes('POOL') || name.includes('kolam') || name.includes('swimming')) {
      return this.knowledgeRules.find(r => r.elementType === 'SWIMMING_POOL') || null;
    }
    if (name.includes('gas medis') || name.includes('medical gas')) {
      return this.knowledgeRules.find(r => r.elementType === 'MEDICAL_GAS') || null;
    }

    // Infrastructure matches
    if (name.includes('aspal') || name.includes('hotmix') || name.includes('ac-wc') || name.includes('ac-bc')) {
      return this.knowledgeRules.find(r => r.elementType === 'ROAD_PAVEMENT_ASPHALT') || null;
    }
    if (name.includes('paving') || name.includes('conblock')) {
      return this.knowledgeRules.find(r => r.elementType === 'PAVING_BLOCK') || null;
    }
    if (name.includes('girder') || name.includes('gelagar')) {
      return this.knowledgeRules.find(r => r.elementType === 'BRIDGE_GIRDER') || null;
    }
    if (name.includes('abutment') || name.includes('pilar') || name.includes('pier')) {
      return this.knowledgeRules.find(r => r.elementType === 'BRIDGE_ABUTMENT') || null;
    }
    if (name.includes('saluran') || name.includes('lining') || name.includes('irigasi') || name.includes('talud')) {
      return this.knowledgeRules.find(r => r.elementType === 'CANAL_LINING') || null;
    }
    if (name.includes('pintu air') || name.includes('sluice gate') || name.includes('katup air')) {
      return this.knowledgeRules.find(r => r.elementType === 'SLUICE_GATE') || null;
    }

    return null;
  }
}

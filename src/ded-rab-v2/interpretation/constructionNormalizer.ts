/**
 * Construction Normalizer (EZRAB DED -> RAB V2)
 *
 * Responsibilities:
 * - Translates informal or AI-generated semantic descriptions into canonical construction taxonomies.
 * - Flow:
 *   AI interpretation -> Construction category -> Construction type -> Material -> Specification -> EZRAB library -> AHSP candidate
 * - Guarantees correct engineering units (m³, m², m, kg, unit, titik).
 * - Avoids premature AI_CUSTOM fallback by providing robust dictionary lookup across all 15 construction domains.
 */

import { ElementCategory, SupportedUnit, CanonicalWorkCategory } from '../types';

export interface NormalizedConstructionItem {
  canonicalCategory: CanonicalWorkCategory;
  workPackage: string;
  workItem: string;
  category: ElementCategory;
  constructionType: string;
  material: string;
  specification: string;
  standardUnit: string;
  /**
   * @deprecated NON-AUTHORITATIVE HINT ONLY. These codes are a 2022-era heuristic and are
   * NOT guaranteed to exist in the 2026 official catalog (e.g. `A.3.2.1.2` does not).
   * The AHSP matcher validates any hint against `officialAhspRepository` and DISCARDS it
   * when absent (§5/§8/§14). Do NOT read this field as a verified AHSP code — resolve the
   * AHSP through `ahspMatcher.matchWorkItem()` instead.
   */
  suggestedAhspCode?: string;
  /**
   * NON-AUTHORITATIVE HINT (display/classification only) — a human-readable AHSP title this
   * item resembles. Not a code lookup: the matcher resolves the real code against the
   * official catalog. Kept as a hint for review UI and logging.
   */
  suggestedAhspName?: string;
  confidence: number;
}

export class ConstructionNormalizer {
  private static instance: ConstructionNormalizer;

  private constructor() {}

  public static getInstance(): ConstructionNormalizer {
    if (!ConstructionNormalizer.instance) {
      ConstructionNormalizer.instance = new ConstructionNormalizer();
    }
    return ConstructionNormalizer.instance;
  }

  /**
   * Normalizes raw textual description and category into a canonical construction item.
   */
  public normalize(rawName: string, categoryHint?: ElementCategory, materialHint?: string): NormalizedConstructionItem {
    const raw = this.normalizeRaw(rawName, categoryHint, materialHint);
    const wbs = this.resolveWbs(rawName, raw.category, raw.constructionType, materialHint);
    return {
      ...raw,
      canonicalCategory: wbs.canonicalCategory,
      workPackage: wbs.workPackage,
      workItem: wbs.workItem,
    };
  }

  private normalizeRaw(rawName: string, categoryHint?: ElementCategory, materialHint?: string): Omit<NormalizedConstructionItem, 'canonicalCategory' | 'workPackage' | 'workItem'> {
    const text = `${rawName} ${materialHint || ''}`.toLowerCase();

    // 1. FOUNDATION / PONDASI
    if (text.includes('pondasi') || text.includes('footplat') || text.includes('batu kali') || text.includes('strauss') || categoryHint === 'FOUNDATION') {
      if (text.includes('batu kali') || text.includes('belah')) {
        return {
          category: 'FOUNDATION',
          constructionType: 'STONE_MASONRY_FOUNDATION',
          material: 'BATU_KALI',
          specification: 'Adukan 1:4 / 1:5 batu kali belah',
          standardUnit: 'm³',
          suggestedAhspCode: 'A.3.2.1.2',
          suggestedAhspName: 'Pasangan Pondasi Batu Belah 1 SP : 4 PP',
          confidence: 0.95,
        };
      }
      if (text.includes('footplat') || text.includes('telapak') || text.includes('plat pondasi')) {
        return {
          category: 'FOUNDATION',
          constructionType: 'SHALLOW_REINFORCED_CONCRETE',
          material: 'BETON_BERTULANG_K250',
          specification: 'Beton bertulang K-250 / fc 20 MPa',
          standardUnit: 'm³',
          suggestedAhspCode: 'A.4.1.1.5',
          suggestedAhspName: 'Membuat Beton Mutu f\'c = 19,3 MPa (K 225)',
          confidence: 0.92,
        };
      }
      if (text.includes('aanstamping') || text.includes('batu kosong')) {
        return {
          category: 'FOUNDATION',
          constructionType: 'DRY_STONE_BEDDING',
          material: 'BATU_KALI',
          specification: 'Batu kosong (Aanstamping)',
          standardUnit: 'm³',
          suggestedAhspCode: 'A.3.2.1.9',
          suggestedAhspName: 'Pasangan Batu Kosong (Aanstamping)',
          confidence: 0.94,
        };
      }
    }

    // 1b. REBAR / PEMBESIAN (Evaluated BEFORE concrete elements so "Pembesian Ringbalk" is NOT matched as concrete beam)
    if (text.includes('pembesian') || text.includes('tulangan') || text.includes('besi beton')) {
      const isDia12Plus = /d12|d13|d16|d19|dia\.?\s*≥?\s*12|≥\s*12/i.test(text);
      const isSlab = text.includes('pelat') || text.includes('slab') || text.includes('dak');
      const code = isSlab
        ? (isDia12Plus ? '2.2.1.1.2' : '2.2.1.1.1')
        : (isDia12Plus ? '2.2.1.1.4' : '2.2.1.1.3');
      const name = isSlab
        ? (isDia12Plus ? '1 kg penulangan slab untuk BjTP dia. ≥ 12 mm, cara semi mekanis' : '1 kg penulangan slab untuk BjTP atau BjTS dia. < 12 mm, cara manual')
        : (isDia12Plus ? '1 kg penulangan kolom, balok, ring balk, sloof, dan shearwall untuk BjTP dia. ≥ 12 mm, cara semi mekanis (untuk bangunan gedung)' : '1 kg Penulangan Kolom, Balok, Ring Balk dan Sloof untuk BjTP diameter <12 mm cara Manual');
      return {
        category: 'STRUCTURE_BEAM',
        constructionType: 'STEEL_REINFORCEMENT',
        material: isDia12Plus ? 'BAJA_TULANGAN_ULIR' : 'BAJA_TULANGAN_POLOS',
        specification: isDia12Plus ? 'Besi Tulangan Diameter >= 12 mm' : 'Besi Tulangan Diameter < 12 mm',
        standardUnit: 'kg',
        suggestedAhspCode: code,
        suggestedAhspName: name,
        confidence: 0.95,
      };
    }

    // 1c. LEAN CONCRETE / LANTAI KERJA / RABAT BETON
    if (text.includes('lantai kerja') || text.includes('rabat beton')) {
      return {
        category: 'FOUNDATION',
        constructionType: 'LEAN_CONCRETE_BED',
        material: 'BETON_MUTU_RENDAH',
        specification: "Lantai kerja beton mutu rendah f'c 7.5 MPa",
        standardUnit: 'm³',
        suggestedAhspCode: '2.2.1.4.1',
        suggestedAhspName: "1 m3 beton mutu rendah f'c 7,5 MPa, slump (100 ± 25) mm, agregat maks 19 mm secara manual",
        confidence: 0.95,
      };
    }

    // 2. CONCRETE STRUCTURE (Kolom, Balok, Sloof, Plat Lantai)
    if (text.includes('kolom') || categoryHint === 'STRUCTURE_COLUMN') {
      const isPraktis = text.includes('praktis') || text.includes('15/15') || text.includes('11/11') || text.includes('kp');
      return {
        category: 'STRUCTURE_COLUMN',
        constructionType: isPraktis ? 'PRACTICAL_COLUMN' : 'STRUCTURAL_COLUMN',
        material: 'BETON_BERTULANG',
        specification: isPraktis ? 'Kolom Praktis 15x15 cm K-175 komplit tulangan' : 'Kolom Struktur Beton Bertulang K-250',
        standardUnit: isPraktis ? 'm' : 'm³',
        suggestedAhspCode: isPraktis ? 'A.4.1.1.35' : 'A.4.1.1.28',
        suggestedAhspName: isPraktis ? 'Pemasangan 1 m Kolom Praktis Beton Bertulang (11 x 11) cm' : 'Membuat 1 m³ Kolom Beton Bertulang (150 kg besi + bekisting)',
        confidence: 0.94,
      };
    }

    if (text.includes('sloof') || text.includes('balok') || categoryHint === 'STRUCTURE_BEAM') {
      const isSloof = text.includes('sloof');
      return {
        category: 'STRUCTURE_BEAM',
        constructionType: isSloof ? 'CONCRETE_SLOOF' : 'STRUCTURAL_BEAM',
        material: 'BETON_BERTULANG',
        specification: isSloof ? 'Sloof Beton Bertulang 15/20 cm K-225' : 'Balok Beton Bertulang K-225',
        standardUnit: "m'",
        suggestedAhspCode: '2.2.1.10.2',
        suggestedAhspName: 'Pembuatan 1 m\' balok praktis beton bertulang (10x15)',
        confidence: 0.94,
      };
    }

    if (text.includes('plat') || text.includes('dak') || text.includes('slab') || categoryHint === 'STRUCTURE_SLAB') {
      return {
        category: 'STRUCTURE_SLAB',
        constructionType: 'CONCRETE_FLOOR_SLAB',
        material: 'BETON_BERTULANG',
        specification: 'Plat Lantai / Dak Beton t=12 cm K-250',
        standardUnit: 'm³',
        suggestedAhspCode: 'A.4.1.1.30',
        suggestedAhspName: 'Membuat 1 m³ Plat Lantai Beton Bertulang',
        confidence: 0.92,
      };
    }

    // 3. PLASTER & FINISHES (Plesteran & Acian - evaluated before Wall to prevent "Plesteran Dinding" being classified as brick wall)
    if (text.includes('plester') || text.includes('acian') || categoryHint === 'PLASTER') {
      if (text.includes('acian')) {
        return {
          category: 'PLASTER',
          constructionType: 'CEMENT_SKIM_COAT',
          material: 'SEMEN_PORTLAND',
          specification: 'Acian semen abu-abu halus',
          standardUnit: 'm²',
          suggestedAhspCode: '3.7.8',
          suggestedAhspName: 'Pemasangan 1 m2 acian',
          confidence: 0.95,
        };
      }
      return {
        category: 'PLASTER',
        constructionType: 'WALL_PLASTERING',
        material: 'MORTAR_1_4',
        specification: 'Plesteran 1 SP : 4 PP tebal 15 mm',
        standardUnit: 'm²',
        suggestedAhspCode: '3.7.4',
        suggestedAhspName: 'Pemasangan 1 m2 plesteran 1SP : 4PP tebal 15 mm',
        confidence: 0.95,
      };
    }

    // 4. WALLS / DINDING (Bata Ringan / Merah)
    if ((text.includes('dinding') || text.includes('bata') || text.includes('hebel') || text.includes('partisi') || categoryHint === 'WALL') && !text.includes('plester') && !text.includes('acian')) {
      if (text.includes('ringan') || text.includes('hebel') || text.includes('aac')) {
        return {
          category: 'WALL',
          constructionType: 'AAC_BLOCK_WALL',
          material: 'BATA_RINGAN',
          specification: 'Bata ringan tebal 10 cm mortar instan',
          standardUnit: 'm²',
          suggestedAhspCode: 'A.4.4.1.3',
          suggestedAhspName: 'Pasangan Dinding Bata Ringan Tebal 10 cm',
          confidence: 0.96,
        };
      }
      return {
        category: 'WALL',
        constructionType: 'RED_CLAY_BRICK_WALL',
        material: 'BATA_MERAH',
        specification: 'Bata merah tebal 1/2 bata adukan 1:4',
        standardUnit: 'm²',
        suggestedAhspCode: '3.6.1.8',
        suggestedAhspName: 'Pemasangan 1 m2 dinding bata merah tebal 1/2 batu dengan mortar tipe N,fc’ 5,2 MPa (Setara Campuran 1SP : 4PP)',
        confidence: 0.95,
      };
    }

    // 5. SANITARY (Evaluated BEFORE general floor tile to prevent ceramic sanitary from being matched as floor tiles)
    if (text.includes('kloset') || text.includes('closet') || text.includes('wastafel') || text.includes('floor drain') || categoryHint === 'SANITARY') {
      if (text.includes('duduk') || text.includes('monoblock') || text.includes('monoblok')) {
        return {
          category: 'SANITARY',
          constructionType: 'MONOBLOK_CLOSET',
          material: 'KERAMIK_SANITARY',
          specification: 'Kloset Duduk Monoblok komplit jet washer & fitting',
          standardUnit: 'buah',
          suggestedAhspCode: '3.18.3.1',
          suggestedAhspName: 'Pemasangan 1 Unit closet duduk/monoblock',
          confidence: 0.96,
        };
      }
      if (text.includes('floor drain')) {
        return {
          category: 'SANITARY',
          constructionType: 'FLOOR_DRAIN',
          material: 'STAINLESS_STEEL',
          specification: 'Floor Drain Stainless Steel Anti Bau 2-3 inch',
          standardUnit: 'buah',
          suggestedAhspCode: 'A.5.1.1.14',
          suggestedAhspName: 'Pemasangan 1 Buah Floor Drain',
          confidence: 0.96,
        };
      }
      return {
        category: 'SANITARY',
        constructionType: 'SANITARY_FIXTURE',
        material: 'SANITARY_WARE',
        specification: 'Perlengkapan Sanitasi Air',
        standardUnit: 'buah',
        suggestedAhspCode: '3.18.3.2',
        suggestedAhspName: 'Pemasangan 1 UNit closet jongkok',
        confidence: 0.90,
      };
    }

    // 6. FLOOR FINISH / KERAMIK (Excluded sanitary, lean concrete, slab words)
    if (
      (text.includes('keramik') || text.includes('lantai') || text.includes('granit') || text.includes('homogenous') || text.includes('homogeneous') || categoryHint === 'FLOOR_FINISH') &&
      !text.includes('atap') && !text.includes('genteng') && !text.includes('kloset') && !text.includes('closet') && !text.includes('sanitair') &&
      !text.includes('lantai kerja') && !text.includes('rabat') && !text.includes('plat lantai') && !text.includes('pelat lantai')
    ) {
      const isGranit = text.includes('granit') || text.includes('60x60') || text.includes('60 x 60') || text.includes('ht') || text.includes('homogeneous') || text.includes('homogenous');
      const isUnpolished = text.includes('unpolish') || text.includes('unpolished') || text.includes('matte') || text.includes('kasar');
      return {
        category: 'FLOOR_FINISH',
        constructionType: isGranit ? 'HOMOGENEOUS_TILE_FLOOR' : 'CERAMIC_TILE_FLOOR',
        material: isGranit ? 'GRANIT_60X60' : 'KERAMIK_40X40',
        specification: isGranit ? (isUnpolished ? 'Homogeneous Tile 60x60 cm Unpolished' : 'Homogeneous Tile 60x60 cm Polish') : 'Keramik Lantai 40x40 cm Glazed',
        standardUnit: 'm²',
        suggestedAhspCode: isGranit ? (isUnpolished ? '3.9.4.9' : '3.9.4.3') : '3.9.4.1',
        suggestedAhspName: isGranit ? (isUnpolished ? 'Pemasangan 1 m2 lantai homogenous tile unpolish uk. 60x60 cm (1SP : 2PP)' : 'Pemasangan 1 m2 lantai homogenous tile Polish uk. 60x60 cm (1SP : 2PP)') : 'Pemasangan 1 m2 Lantai Keramik',
        confidence: 0.94,
      };
    }

    // 7. CEILING / PLAFON
    if (text.includes('plafon') || text.includes('langit-langit') || text.includes('gypsum') || categoryHint === 'CEILING') {
      return {
        category: 'CEILING',
        constructionType: 'GYPSUM_BOARD_CEILING',
        material: 'GYPSUM_9MM',
        specification: 'Plafon Gypsum Board 9 mm rangka Hollow Galvanis 40x40',
        standardUnit: 'm²',
        suggestedAhspCode: '3.5.2.1',
        suggestedAhspName: 'Pemasangan 1 m2 plafon papan gypsum tebal 9 mm',
        confidence: 0.95,
      };
    }

    // 8. ROOF / ATAP
    if (text.includes('atap') || text.includes('genteng') || text.includes('kuda-kuda') || text.includes('truss') || categoryHint === 'ROOF') {
      if (text.includes('rangka') || text.includes('baja ringan') || text.includes('truss')) {
        return {
          category: 'ROOF',
          constructionType: 'LIGHT_GAUGE_STEEL_ROOF_TRUSS',
          material: 'BAJA_RINGAN_C75',
          specification: 'Rangka Kuda-kuda Baja Ringan C-75.75 komplit reng',
          standardUnit: 'm²',
          suggestedAhspCode: 'A.4.2.1.22',
          suggestedAhspName: 'Pemasangan 1 m² Rangka Atap Baja Ringan (Zincalume/Galvalume)',
          confidence: 0.95,
        };
      }
      return {
        category: 'ROOF',
        constructionType: 'ROOF_COVERING',
        material: text.includes('metal') || text.includes('spandek') ? 'SPANDEK_METAL' : 'GENTENG_BETON',
        specification: 'Penutup Atap Genteng Beton / Metal Berpasir',
        standardUnit: 'm²',
        suggestedAhspCode: 'A.4.5.2.32',
        suggestedAhspName: 'Pemasangan 1 m² Atap Genteng Beton',
        confidence: 0.92,
      };
    }

    // 9. PAINTING / PENGECATAN
    if (text.includes('cat') || text.includes('painting') || categoryHint === 'PAINTING') {
      const isExterior = text.includes('eksterior') || text.includes('luar') || text.includes('weathershield');
      return {
        category: 'PAINTING',
        constructionType: isExterior ? 'EXTERIOR_WALL_PAINT' : 'INTERIOR_WALL_PAINT',
        material: 'CAT_TEMBOK_EMULSI',
        specification: isExterior ? 'Cat Dinding Eksterior Weatherproof 1 dasar + 2 penutup' : 'Cat Dinding Interior Emulsi 1 dasar + 2 penutup',
        standardUnit: 'm²',
        suggestedAhspCode: isExterior ? 'A.4.7.1.10.b' : 'A.4.7.1.10',
        suggestedAhspName: isExterior ? 'Pengecatan Tembok Luar (Eksterior) 1 Lapis Plamir, 1 Lapis Cat Dasar, 2 Lapis Cat Penutup' : 'Pengecatan Tembok Baru (1 Lapis Plamir, 1 Lapis Cat Dasar, 2 Lapis Cat Penutup)',
        confidence: 0.95,
      };
    }

    // 10. DOORS & WINDOWS
    if (text.includes('pintu') || text.includes('jendela') || text.includes('kusen') || categoryHint === 'DOOR_WINDOW') {
      const isDoor = text.includes('pintu') || text.includes('pj') || text.includes('p1') || text.includes('p2') || text.includes('d-0');
      const isWoodPanel = isDoor && (text.includes('panel') || text.includes('kayu') || text.includes('kamper'));
      return {
        category: 'DOOR_WINDOW',
        constructionType: isWoodPanel ? 'WOOD_PANEL_DOOR' : isDoor ? 'DOOR_SET' : 'WINDOW_SET',
        material: isWoodPanel ? 'KAYU_KELAS_II' : text.includes('aluminium') ? 'ALUMINIUM_4_INCH' : 'KAYU_SOLID',
        specification: isWoodPanel ? 'Pintu Panel Kayu Kelas II (Kamper) tebal daun pintu 3.5 cm' : isDoor ? 'Pintu Panel Kayu / Aluminium lengkap aksesoris & handle' : 'Jendela Kaca Aluminium lengkap engsel & grendel',
        standardUnit: isWoodPanel ? 'm²' : 'unit',
        suggestedAhspCode: isWoodPanel ? '3.11.1.11' : isDoor ? 'A.4.6.1.1' : 'A.4.6.1.2',
        suggestedAhspName: isWoodPanel ? 'Pembuatan 1 m2 daun pintu panel, kayu kelas I atau II' : isDoor ? 'Pemasangan 1 Unit Daun Pintu Panel Kayu Komplit' : 'Pemasangan 1 Unit Jendela Kaca Bingkai Aluminium',
        confidence: 0.94,
      };
    }

    // 11. MEP & ELECTRICAL
    if (text.includes('titik lampu') || text.includes('stop kontak') || text.includes('saklar') || text.includes('pipa') || categoryHint === 'MEP') {
      if (text.includes('lampu') || text.includes('penerangan')) {
        return {
          category: 'MEP',
          constructionType: 'LIGHTING_POINT_INSTALLATION',
          material: 'KABEL_NYM_3X2.5',
          specification: 'Instalasi Titik Lampu kabel NYM 3x2.5 mm dalam pipa conduit',
          standardUnit: 'titik',
          suggestedAhspCode: 'E.1.1.1',
          suggestedAhspName: 'Pemasangan 1 Titik Instalasi Penerangan Lampu (Kabel NYM 3x2,5 mm)',
          confidence: 0.95,
        };
      }
      if (text.includes('stop kontak')) {
        return {
          category: 'MEP',
          constructionType: 'SOCKET_OUTLET_INSTALLATION',
          material: 'KABEL_NYM_3X2.5',
          specification: 'Instalasi Stop Kontak Daya kabel NYM 3x2.5 mm',
          standardUnit: 'titik',
          suggestedAhspCode: 'E.1.1.2',
          suggestedAhspName: 'Pemasangan 1 Titik Instalasi Stop Kontak',
          confidence: 0.95,
        };
      }
    }

    // 12. SITEWORK & EARTHWORKS
    if (text.includes('galian') || text.includes('urugan') || text.includes('bowplank') || text.includes('pembersihan') || categoryHint === 'SITEWORK') {
      if (text.includes('galian')) {
        return {
          category: 'SITEWORK',
          constructionType: 'EARTH_EXCAVATION',
          material: 'TANAH_BIASA',
          specification: 'Galian Tanah Biasa kedalaman s.d 1 meter',
          standardUnit: 'm³',
          suggestedAhspCode: 'A.2.3.1.1',
          suggestedAhspName: 'Penggalian 1 m³ Tanah Biasa Sedalam 1 m',
          confidence: 0.96,
        };
      }
      if (text.includes('pasir') || text.includes('urugan')) {
        return {
          category: 'SITEWORK',
          constructionType: 'SAND_BEDDING',
          material: 'PASIR_URUG',
          specification: 'Urugan Pasir Bawah Pondasi / Lantai padat tebal 5-10 cm',
          standardUnit: 'm³',
          suggestedAhspCode: 'A.2.3.1.11',
          suggestedAhspName: 'Pengurugan 1 m³ dengan Pasir Urug',
          confidence: 0.95,
        };
      }
    }

    // Fallback classification if no specific keyword matched
    return {
      category: categoryHint || 'OTHER',
      constructionType: 'GENERAL_WORK_ITEM',
      material: materialHint || 'STANDAR_PROYEK',
      specification: rawName,
      standardUnit: 'unit',
      confidence: 0.6,
    };
  }

  /**
   * Resolves canonical Work Breakdown Structure (WBS) classification:
   * Category (15 standard domains) -> Work Package -> Canonical Work Item name
   */
  public resolveWbs(
    rawName: string,
    category: ElementCategory,
    constructionType?: string,
    materialHint?: string
  ): { canonicalCategory: CanonicalWorkCategory; workPackage: string; workItem: string } {
    const text = `${rawName} ${materialHint || ''}`.toLowerCase();

    if (category === 'FOUNDATION' || text.includes('pondasi')) {
      return {
        canonicalCategory: 'FOUNDATION',
        workPackage: 'Pekerjaan Pondasi',
        workItem: text.includes('footplat') ? 'Pondasi Footplat Beton Bertulang' :
                  text.includes('aanstamping') ? 'Pasangan Batu Kosong (Aanstamping)' :
                  text.includes('strauss') ? 'Pondasi Strauss Pile' :
                  'Pondasi Batu Kali',
      };
    }

    if (category === 'STRUCTURE_COLUMN' || text.includes('kolom')) {
      const isPraktis = text.includes('praktis') || text.includes('15/15') || text.includes('11/11') || text.includes('kp');
      return {
        canonicalCategory: 'STRUCTURE',
        workPackage: 'Pekerjaan Kolom',
        workItem: isPraktis ? 'Kolom Praktis 15x15 cm' : 'Kolom Struktur Beton Bertulang',
      };
    }

    if (category === 'STRUCTURE_BEAM' || text.includes('sloof') || text.includes('balok')) {
      const isSloof = text.includes('sloof');
      return {
        canonicalCategory: 'STRUCTURE',
        workPackage: isSloof ? 'Pekerjaan Sloof' : 'Pekerjaan Balok',
        workItem: isSloof ? 'Sloof Beton Bertulang 15/20 cm' : 'Balok Beton Bertulang',
      };
    }

    if (category === 'STRUCTURE_SLAB' || text.includes('plat') || text.includes('dak')) {
      return {
        canonicalCategory: 'STRUCTURE',
        workPackage: 'Pekerjaan Plat Lantai',
        workItem: 'Plat Lantai Beton Bertulang t=12 cm',
      };
    }

    if (category === 'PLASTER' || text.includes('plester') || text.includes('acian')) {
      return {
        canonicalCategory: 'WALL',
        workPackage: 'Pekerjaan Plesteran & Acian',
        workItem: text.includes('acian') ? 'Acian Semen Halus' : 'Plesteran 1 SP : 4 PP Tebal 15 mm',
      };
    }

    if (category === 'WALL' || text.includes('dinding') || text.includes('bata')) {
      const isHebel = text.includes('ringan') || text.includes('hebel') || text.includes('aac');
      return {
        canonicalCategory: 'WALL',
        workPackage: 'Pekerjaan Dinding',
        workItem: isHebel ? 'Pasangan Dinding Bata Ringan 10 cm' : 'Pasangan Dinding Bata Merah 1/2 Bata',
      };
    }

    if (category === 'FLOOR_FINISH' || text.includes('keramik') || text.includes('lantai') || text.includes('granit')) {
      const isGranit = text.includes('granit') || text.includes('60x60') || text.includes('ht');
      return {
        canonicalCategory: 'FLOOR',
        workPackage: 'Pekerjaan Lantai & Keramik',
        workItem: isGranit ? 'Homogeneous Tile 60x60 cm' : 'Keramik Lantai 40x40 cm',
      };
    }

    if (category === 'CEILING' || text.includes('plafon') || text.includes('ceiling')) {
      return {
        canonicalCategory: 'CEILING',
        workPackage: 'Pekerjaan Plafon & Partisi',
        workItem: 'Plafon Gypsum 9 mm + Rangka Hollow',
      };
    }

    if (category === 'ROOF' || text.includes('atap') || text.includes('genteng') || text.includes('kuda-kuda')) {
      return {
        canonicalCategory: 'ROOF',
        workPackage: 'Pekerjaan Atap & Rangka Baja',
        workItem: 'Rangka Atap Baja Ringan',
      };
    }

    if (category === 'DOOR_WINDOW' || text.includes('pintu') || text.includes('jendela') || text.includes('kusen')) {
      const isPintu = text.includes('pintu') || /^p[0-9]/i.test(rawName.trim());
      return {
        canonicalCategory: 'DOOR_WINDOW',
        workPackage: isPintu ? 'Pekerjaan Pintu' : 'Pekerjaan Jendela',
        workItem: rawName.trim(),
      };
    }

    if (category === 'PAINTING' || text.includes('cat') || text.includes('pengecatan')) {
      const isLuar = text.includes('luar') || text.includes('eksterior') || text.includes('weathershield');
      return {
        canonicalCategory: 'PAINTING',
        workPackage: 'Pekerjaan Pengecatan',
        workItem: isLuar ? 'Pengecatan Dinding Eksterior' : 'Pengecatan Dinding Interior',
      };
    }

    if (category === 'SANITARY' || text.includes('closet') || text.includes('kloset') || text.includes('wastafel') || text.includes('floor drain')) {
      return {
        canonicalCategory: 'SANITARY',
        workPackage: 'Pekerjaan Sanitair',
        workItem: rawName.trim(),
      };
    }

    if (text.includes('pipa') || text.includes('plumbing') || text.includes('air bersih') || text.includes('air kotor')) {
      return {
        canonicalCategory: 'PLUMBING',
        workPackage: 'Pekerjaan Plumbing & Sanitasi',
        workItem: rawName.trim(),
      };
    }

    if (category === 'MEP' || text.includes('lampu') || text.includes('stop kontak') || text.includes('saklar')) {
      return {
        canonicalCategory: 'ELECTRICAL',
        workPackage: 'Pekerjaan Instalasi Elektrikal',
        workItem: text.includes('stop kontak') ? 'Instalasi Stop Kontak' : 'Instalasi Titik Lampu',
      };
    }

    if (category === 'SITEWORK' || text.includes('galian') || text.includes('urugan') || text.includes('bowplank')) {
      const isGalian = text.includes('galian') || text.includes('urugan') || text.includes('pasir');
      return {
        canonicalCategory: isGalian ? 'EARTHWORK' : 'PRELIMINARY',
        workPackage: isGalian ? 'Pekerjaan Tanah' : 'Pekerjaan Persiapan',
        workItem: text.includes('galian') ? 'Galian Tanah Pondasi' : text.includes('pasir') ? 'Urugan Pasir Bawah Pondasi' : 'Pekerjaan Bowplank',
      };
    }

    return {
      canonicalCategory: 'OTHER',
      workPackage: 'Pekerjaan Lain-lain',
      workItem: rawName.trim(),
    };
  }
}

export const constructionNormalizer = ConstructionNormalizer.getInstance();

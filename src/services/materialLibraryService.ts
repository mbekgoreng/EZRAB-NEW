/**
 * EZRAB — Universal Material Ecosystem Service
 * 
 * Implements:
 * - Central Material Library across all construction disciplines
 * - Strict decoupling: Material Specification !== Material Price
 * - Dynamic Price Resolution (Official Reference, Supplier, Regional, User Override)
 * - Coverage & Packaging Calculations (e.g. Paint coverage, tile carton waste)
 * - Project Material Specification hierarchy:
 *   TEMPLATE DEFAULT -> PROJECT SPECIFICATION -> ITEM SPECIFICATION -> USER OVERRIDE
 * - Audit Trail for all user overrides
 */

import {
  MaterialItem,
  MaterialPriceReference,
  ProjectMaterialSpecification,
  UserOverrideRecord
} from '../types/rabTemplate';
import { SafeDecimalEngine } from '../engine/safeDecimalEngine';

const STORAGE_KEY_PROJECT_SPECS = 'ezrab_project_material_specs';

export class MaterialLibraryService {
  private static instance: MaterialLibraryService;
  private materials: Map<string, MaterialItem> = new Map();
  private priceReferences: Map<string, MaterialPriceReference[]> = new Map(); // materialId -> prices[]
  private projectSpecifications: Map<string, ProjectMaterialSpecification> = new Map();

  private constructor() {
    this.seedMaterialCatalog();
    this.seedPriceReferences();
    this.loadPersistedSpecs();
  }

  public static getInstance(): MaterialLibraryService {
    if (!MaterialLibraryService.instance) {
      MaterialLibraryService.instance = new MaterialLibraryService();
    }
    return MaterialLibraryService.instance;
  }

  // -------------------------------------------------------------
  // MATERIAL SEED CATALOG
  // -------------------------------------------------------------
  private seedMaterialCatalog() {
    const defaultMaterials: MaterialItem[] = [
      // Keramik & Granit
      {
        id: 'MAT-KER-ROM-60',
        category: 'KERAMIK',
        name: 'Keramik Lantai Roman dPortofino 60x60 cm Polished',
        brand: 'Roman',
        series: 'dPortofino',
        product: 'dPortofino Grey Glossy',
        specification: 'Porcelain Glazed Tile Rectified Grade 1',
        size: '60x60 cm',
        unit: 'm2',
        coveragePerUnit: 1.44, // 1 box = 4 pcs = 1.44 m2
        defaultWastePercent: 5,
        packagingOptions: ['1 box (1.44 m²)']
      },
      {
        id: 'MAT-GRA-GRN-60',
        category: 'GRANIT',
        name: 'Granite Tile Granito Salsa Pearl White 60x60 cm Nano Polished',
        brand: 'Granito',
        series: 'Salsa',
        product: 'Salsa Pearl White',
        specification: 'Homogeneous Tile Unpolished Nano Water Repellent',
        size: '60x60 cm',
        unit: 'm2',
        coveragePerUnit: 1.44,
        defaultWastePercent: 5,
        packagingOptions: ['1 box (1.44 m²)']
      },
      {
        id: 'MAT-KER-MUL-30',
        category: 'KERAMIK',
        name: 'Keramik Lantai Mulia 30x30 cm Anti-Selip Kamar Mandi',
        brand: 'Mulia',
        series: 'Signature Anti-Slip',
        product: 'Mulia Slate Grey Matt',
        specification: 'Ceramic Floor Tile Matte Embossed R-10',
        size: '30x30 cm',
        unit: 'm2',
        coveragePerUnit: 0.99,
        defaultWastePercent: 7,
        packagingOptions: ['1 box (1.00 m²)']
      },
      {
        id: 'MAT-KER-ROM-WALL-3060',
        category: 'KERAMIK',
        name: 'Keramik Dinding Roman dPalacio 30x60 cm Glazed',
        brand: 'Roman',
        series: 'dPalacio',
        product: 'dPalacio Bianco Glossy',
        specification: 'Glazed Wall Tile Rectified High Gloss',
        size: '30x60 cm',
        unit: 'm2',
        coveragePerUnit: 1.08,
        defaultWastePercent: 5,
        packagingOptions: ['1 box (1.08 m²)']
      },

      // Cat
      {
        id: 'MAT-CAT-DULUX-EXT',
        category: 'CAT_EKSTERIOR',
        name: 'Cat Dinding Eksterior Dulux Weathershield Powerflexx',
        brand: 'Dulux',
        series: 'Weathershield',
        product: 'Weathershield Powerflexx',
        specification: '100% Acrylic Latex Elastomeric Weatherproof Anti-Fungus',
        unit: 'liter',
        coveragePerUnit: 10.0, // 10 m2 / liter / lapis
        defaultWastePercent: 10,
        packagingOptions: ['2.5 L', '20 L']
      },
      {
        id: 'MAT-CAT-NIP-INT',
        category: 'CAT_INTERIOR',
        name: 'Cat Dinding Interior Nippon Paint Vinilex Silver-Ion',
        brand: 'Nippon Paint',
        series: 'Vinilex',
        product: 'Vinilex Anti-Bakteri',
        specification: 'PVA Emulsion Matt Finish Low Odor Washable',
        unit: 'liter',
        coveragePerUnit: 10.0,
        defaultWastePercent: 10,
        packagingOptions: ['1 L', '5 L', '25 L']
      },
      {
        id: 'MAT-CAT-JOTUN-EXT',
        category: 'CAT_EKSTERIOR',
        name: 'Cat Dinding Eksterior Jotun Jotashield Extreme',
        brand: 'Jotun',
        series: 'Jotashield',
        product: 'Jotashield Extreme UV Protected',
        specification: 'Heat-Reflective Acrylic Anti-Fade',
        unit: 'liter',
        coveragePerUnit: 11.0,
        defaultWastePercent: 8,
        packagingOptions: ['2.5 L', '20 L']
      },

      // Semen & Mortar
      {
        id: 'MAT-SEM-TIGA-RODA-50',
        category: 'SEMEN',
        name: 'Semen Portland Komposit Tiga Roda 50 kg (PCC SNI)',
        brand: 'Tiga Roda',
        specification: 'Portland Composite Cement SNI 7064:2014',
        size: '50 kg',
        unit: 'sak',
        defaultWastePercent: 3,
        packagingOptions: ['Zak 50 kg', 'Curah']
      },
      {
        id: 'MAT-MOR-MU-380',
        category: 'MORTAR',
        name: 'Mortar Utama MU-380 Perekat Bata Ringan ThinBed',
        brand: 'Mortar Utama',
        series: 'ThinBed',
        product: 'MU-380',
        specification: 'Polymer Modified Cementitious Mortar t=3 mm',
        size: '40 kg',
        unit: 'sak',
        coveragePerUnit: 10.0, // 1 sak covers approx 10 m2 bata ringan t=10
        defaultWastePercent: 5,
        packagingOptions: ['Zak 40 kg']
      },

      // Besi & Baja WF
      {
        id: 'MAT-BES-KS-D13',
        category: 'BESI_BETON',
        name: 'Besi Beton Ulir Krakatau Steel BJTS 420B Dia. 13 mm',
        brand: 'Krakatau Steel',
        specification: 'Baja Tulangan Sirip BJTS 420B SNI 2052:2017',
        size: 'D13 x 12 m (1.04 kg/m)',
        unit: 'kg',
        defaultWastePercent: 5
      },
      {
        id: 'MAT-BAJ-WF-GG',
        category: 'BAJA_WF',
        name: 'Baja WF Profil IWF Gunung Garuda SS400 / ASTM A36',
        brand: 'Gunung Garuda',
        specification: 'Structural Steel Wide Flange Hot Rolled SS400',
        unit: 'kg',
        defaultWastePercent: 4
      },

      // Baja Ringan & Atap
      {
        id: 'MAT-KCD-KENCANA-C75',
        category: 'BAJA_RINGAN',
        name: 'Kanal Kuda-kuda Baja Ringan Kencana Truss C-75.75',
        brand: 'Kencana',
        specification: 'High Tensile Galvalume G550 AZ-100 t=0.75 mm',
        unit: 'm2',
        defaultWastePercent: 5
      },
      {
        id: 'MAT-ATP-SAKURA-ROOF',
        category: 'GENTENG',
        name: 'Genteng Metal Sakura Roof Berpasir 2x4 Daun',
        brand: 'Sakura Roof',
        specification: 'Metal Tile Zincalume coated with Natural Stone Granules',
        unit: 'm2',
        coveragePerUnit: 1.62,
        defaultWastePercent: 6,
        packagingOptions: ['Lembar (0.62 m²)']
      },
      {
        id: 'MAT-ATP-SPANDEK-35',
        category: 'SPANDEK',
        name: 'Atap Spandek Zincalume Tebal 0.35 mm Lebar Efektif 1000 mm',
        brand: 'Bluescope Lysaght',
        specification: 'Zincalume Steel Sheet AZ-150 t=0.35 mm',
        unit: 'm2',
        defaultWastePercent: 5
      },

      // Paving Block (Perkerasan)
      {
        id: 'MAT-PAV-BATA-6',
        category: 'PAVING',
        name: 'Paving Block K-300 Tebal 6 cm Model Bata Natural Abu',
        brand: 'Conblock Indonesia',
        specification: 'Paving Pres Mesin Hidrolik Mutu K-300 SNI 03-0691',
        size: '10.5 x 21 x 6 cm (44 pcs/m²)',
        unit: 'm2',
        defaultWastePercent: 4,
        packagingOptions: ['Pallet (12 m²)']
      },
      {
        id: 'MAT-PAV-HEXA-8',
        category: 'PAVING',
        name: 'Paving Block K-350 Tebal 8 cm Model Segi Enam (Heavy Duty)',
        brand: 'Conblock Indonesia',
        specification: 'Paving Heavy Duty Mutu K-350 Khusus Jalur Berat / Truk',
        size: 'Tebal 8 cm (29 pcs/m²)',
        unit: 'm2',
        defaultWastePercent: 4,
        packagingOptions: ['Pallet (10 m²)']
      },
      {
        id: 'MAT-KANSTIN-1530',
        category: 'PAVING',
        name: 'Kanstin Beton Pengunci Tepi Trotoar 15x30x40 cm',
        brand: 'Pracetak SNI',
        specification: 'Beton K-250 Presisi Tepi Jalan & Taman',
        size: '15 x 30 x 40 cm',
        unit: 'm1',
        defaultWastePercent: 2
      },

      // Beton Readymix
      {
        id: 'MAT-BETON-K250',
        category: 'BETON',
        name: 'Ready Mix Concrete K-250 (f\'c = 21.7 MPa) Slump 12±2 cm',
        brand: 'Adhimix / Holcim',
        specification: 'Beton Cor Segar Non-Flyash K-250',
        unit: 'm3',
        defaultWastePercent: 3,
        packagingOptions: ['Truck Mixer 7 m³']
      },
      {
        id: 'MAT-BETON-K350',
        category: 'BETON',
        name: 'Ready Mix Concrete K-350 (FS-45) Rigid Pavement',
        brand: 'Adhimix / Holcim',
        specification: 'Beton Perkerasan Jalan Semen FS-45 K-350',
        unit: 'm3',
        defaultWastePercent: 3,
        packagingOptions: ['Truck Mixer 7 m³']
      },

      // Pipa & Plumbing
      {
        id: 'MAT-PIP-RUCIKA-AW-05',
        category: 'PIPA',
        name: 'Pipa PVC Rucika Standard AW Dia. 1/2" Air Bersih',
        brand: 'Rucika',
        specification: 'uPVC Pipe Class AW Tekanan Kerja 10 kgf/cm2',
        size: '1/2 inch x 4 m',
        unit: 'batang',
        defaultWastePercent: 5
      },
      {
        id: 'MAT-PIP-RUCIKA-D-4',
        category: 'PIPA',
        name: 'Pipa PVC Rucika Standard D Dia. 4" Air Buangan / Kotor',
        brand: 'Rucika',
        specification: 'uPVC Pipe Class D Tekanan Kerja 5 kgf/cm2',
        size: '4 inch x 4 m',
        unit: 'batang',
        defaultWastePercent: 5
      },

      // Sanitary
      {
        id: 'MAT-SAN-TOTO-CW420',
        category: 'SANITARY',
        name: 'Kloset Duduk TOTO CW420J Dual Flush Eco-Washer',
        brand: 'TOTO',
        series: 'Eco-Washer Series',
        product: 'CW420J/SW420JP',
        specification: 'Vitreous China White Rough-in 500 mm Dual Flush 4.5/3L',
        unit: 'unit',
        defaultWastePercent: 0,
        packagingOptions: ['1 Set Komplit Dus']
      },
      {
        id: 'MAT-SAN-TOTO-LW246',
        category: 'SANITARY',
        name: 'Wastafel Gantung TOTO LW246J White + Kran TOTO',
        brand: 'TOTO',
        specification: 'Wall Hung Lavatory Vitreous China 450x305 mm',
        unit: 'unit',
        defaultWastePercent: 0
      },

      // Elektrikal
      {
        id: 'MAT-ELEK-SUP-NYM-15',
        category: 'ELEKTRIKAL',
        name: 'Kabel Listrik Supreme NYM 3x1.5 mm² Cu/PVC/PVC SNI',
        brand: 'Supreme',
        specification: 'Kabel Tembaga Tunggal 3 Inti 300/500V SNI IEC 60227',
        unit: 'roll',
        defaultWastePercent: 7,
        packagingOptions: ['Roll 50 m', 'Roll 100 m']
      },
      {
        id: 'MAT-ELEK-SUP-NYM-25',
        category: 'ELEKTRIKAL',
        name: 'Kabel Listrik Supreme NYM 3x2.5 mm² Stop Kontak',
        brand: 'Supreme',
        specification: 'Kabel Tembaga Tunggal 3 Inti 300/500V SNI IEC 60227',
        unit: 'roll',
        defaultWastePercent: 7,
        packagingOptions: ['Roll 50 m', 'Roll 100 m']
      },
      {
        id: 'MAT-ELEK-PHI-DOWN-9W',
        category: 'ELEKTRIKAL',
        name: 'Lampu LED Downlight Philips Meson 9W 6500K Cool Daylight',
        brand: 'Philips',
        series: 'Meson',
        product: 'Meson 59464 9W',
        specification: 'Integrated LED Recessed Downlight Cutout 105 mm 800 Lumen',
        unit: 'unit',
        defaultWastePercent: 2
      },

      // Plafon
      {
        id: 'MAT-PLA-JAYABOARD-9',
        category: 'PLAFON',
        name: 'Papan Gypsum Jayaboard Sheetrock Tebal 9 mm',
        brand: 'Jayaboard',
        series: 'Sheetrock',
        product: 'Standard 9mm',
        specification: 'Plasterboard Sag-Defying Strength 1200x2400 mm',
        size: '1.20 x 2.40 m (2.88 m²)',
        unit: 'lembar',
        coveragePerUnit: 2.88,
        defaultWastePercent: 5,
        packagingOptions: ['Lembar (2.88 m²)']
      },

      // Waterproofing
      {
        id: 'MAT-WAT-SIKA-107',
        category: 'WATERPROOFING',
        name: 'Waterproofing Sika SikaTop 107 Plus 2-Komponen Semen',
        brand: 'Sika',
        series: 'SikaTop 107',
        specification: 'Polymer-modified cementitious waterproofing slurry',
        size: '25 kg (20 kg bubuk + 5 kg cairan)',
        unit: 'set',
        coveragePerUnit: 12.5, // 2 kg/m2 for 2 coats
        defaultWastePercent: 5,
        packagingOptions: ['Set 25 kg']
      }
    ];

    for (const mat of defaultMaterials) {
      this.materials.set(mat.id, mat);
    }
  }

  // -------------------------------------------------------------
  // MATERIAL PRICE REFERENCES (DECOUPLED FROM MATERIAL ITSELF)
  // -------------------------------------------------------------
  private seedPriceReferences() {
    const prices: MaterialPriceReference[] = [
      { id: 'PR-1', materialId: 'MAT-KER-ROM-60', unitPrice: 225000, supplier: 'Mitra 10 Authorized', location: 'Jabodetabek', effectiveDate: '2026-03-01' },
      { id: 'PR-2', materialId: 'MAT-GRA-GRN-60', unitPrice: 295000, supplier: 'Granito Official Store', location: 'Jabodetabek', effectiveDate: '2026-03-01' },
      { id: 'PR-3', materialId: 'MAT-KER-MUL-30', unitPrice: 85000, supplier: 'Depo Bangunan', location: 'Jabodetabek', effectiveDate: '2026-03-01' },
      { id: 'PR-4', materialId: 'MAT-KER-ROM-WALL-3060', unitPrice: 195000, supplier: 'Mitra 10 Authorized', location: 'Jabodetabek', effectiveDate: '2026-03-01' },
      { id: 'PR-5', materialId: 'MAT-CAT-DULUX-EXT', unitPrice: 72000, supplier: 'Dulux Colour Centre', location: 'Jabodetabek', effectiveDate: '2026-03-01' },
      { id: 'PR-6', materialId: 'MAT-CAT-NIP-INT', unitPrice: 38000, supplier: 'Nippon Paint Flagship', location: 'Jabodetabek', effectiveDate: '2026-03-01' },
      { id: 'PR-7', materialId: 'MAT-CAT-JOTUN-EXT', unitPrice: 78000, supplier: 'Jotun Studio', location: 'Jabodetabek', effectiveDate: '2026-03-01' },
      { id: 'PR-8', materialId: 'MAT-SEM-TIGA-RODA-50', unitPrice: 76000, supplier: 'Distributor Semen Utama', location: 'Jabodetabek', effectiveDate: '2026-03-01' },
      { id: 'PR-9', materialId: 'MAT-MOR-MU-380', unitPrice: 115000, supplier: 'Distributor Mortar Utama', location: 'Jabodetabek', effectiveDate: '2026-03-01' },
      { id: 'PR-10', materialId: 'MAT-BES-KS-D13', unitPrice: 14500, supplier: 'Krakatau Steel Distributor', location: 'Jabodetabek', effectiveDate: '2026-03-01' },
      { id: 'PR-11', materialId: 'MAT-BAJ-WF-GG', unitPrice: 17500, supplier: 'Gunung Garuda Steel Hub', location: 'Jabodetabek', effectiveDate: '2026-03-01' },
      { id: 'PR-12', materialId: 'MAT-KCD-KENCANA-C75', unitPrice: 115000, supplier: 'Kencana Trussindo', location: 'Jabodetabek', effectiveDate: '2026-03-01' },
      { id: 'PR-13', materialId: 'MAT-ATP-SAKURA-ROOF', unitPrice: 95000, supplier: 'Sakura Roof Distributor', location: 'Jabodetabek', effectiveDate: '2026-03-01' },
      { id: 'PR-14', materialId: 'MAT-ATP-SPANDEK-35', unitPrice: 82000, supplier: 'Lysaght Center', location: 'Jabodetabek', effectiveDate: '2026-03-01' },
      { id: 'PR-15', materialId: 'MAT-PAV-BATA-6', unitPrice: 110000, supplier: 'Pabrik Conblock Cisalak', location: 'Jabodetabek', effectiveDate: '2026-03-01' },
      { id: 'PR-16', materialId: 'MAT-PAV-HEXA-8', unitPrice: 135000, supplier: 'Pabrik Conblock Cisalak', location: 'Jabodetabek', effectiveDate: '2026-03-01' },
      { id: 'PR-17', materialId: 'MAT-KANSTIN-1530', unitPrice: 48000, supplier: 'Pabrik Precast Sentul', location: 'Jabodetabek', effectiveDate: '2026-03-01' },
      { id: 'PR-18', materialId: 'MAT-BETON-K250', unitPrice: 920000, supplier: 'Adhimix Precast Batching Plant', location: 'Jabodetabek', effectiveDate: '2026-03-01' },
      { id: 'PR-19', materialId: 'MAT-BETON-K350', unitPrice: 1050000, supplier: 'Adhimix Precast Batching Plant', location: 'Jabodetabek', effectiveDate: '2026-03-01' },
      { id: 'PR-20', materialId: 'MAT-PIP-RUCIKA-AW-05', unitPrice: 32000, supplier: 'Distributor Pipa Rucika', location: 'Jabodetabek', effectiveDate: '2026-03-01' },
      { id: 'PR-21', materialId: 'MAT-PIP-RUCIKA-D-4', unitPrice: 145000, supplier: 'Distributor Pipa Rucika', location: 'Jabodetabek', effectiveDate: '2026-03-01' },
      { id: 'PR-22', materialId: 'MAT-SAN-TOTO-CW420', unitPrice: 2450000, supplier: 'TOTO Gallery Surabaya / Jakarta', location: 'Jabodetabek', effectiveDate: '2026-03-01' },
      { id: 'PR-23', materialId: 'MAT-SAN-TOTO-LW246', unitPrice: 780000, supplier: 'TOTO Gallery Surabaya / Jakarta', location: 'Jabodetabek', effectiveDate: '2026-03-01' },
      { id: 'PR-24', materialId: 'MAT-ELEK-SUP-NYM-15', unitPrice: 420000, supplier: 'Glodok Electric Center', location: 'Jabodetabek', effectiveDate: '2026-03-01' },
      { id: 'PR-25', materialId: 'MAT-ELEK-SUP-NYM-25', unitPrice: 650000, supplier: 'Glodok Electric Center', location: 'Jabodetabek', effectiveDate: '2026-03-01' },
      { id: 'PR-26', materialId: 'MAT-ELEK-PHI-DOWN-9W', unitPrice: 65000, supplier: 'Philips Consumer Lighting', location: 'Jabodetabek', effectiveDate: '2026-03-01' },
      { id: 'PR-27', materialId: 'MAT-PLA-JAYABOARD-9', unitPrice: 82000, supplier: 'Distributor Jayaboard', location: 'Jabodetabek', effectiveDate: '2026-03-01' },
      { id: 'PR-28', materialId: 'MAT-WAT-SIKA-107', unitPrice: 285000, supplier: 'Sika Construction Centre', location: 'Jabodetabek', effectiveDate: '2026-03-01' }
    ];

    for (const pr of prices) {
      if (!this.priceReferences.has(pr.materialId)) {
        this.priceReferences.set(pr.materialId, []);
      }
      this.priceReferences.get(pr.materialId)!.push(pr);
    }
  }

  // -------------------------------------------------------------
  // PUBLIC QUERY APIs
  // -------------------------------------------------------------
  public getAllMaterials(): MaterialItem[] {
    return Array.from(this.materials.values());
  }

  public getMaterialsByCategory(category: string): MaterialItem[] {
    const norm = category.toUpperCase().trim();
    return Array.from(this.materials.values()).filter(
      m => m.category.toUpperCase().trim() === norm
    );
  }

  public getMaterialById(id: string): MaterialItem | undefined {
    return this.materials.get(id);
  }

  /**
   * Price Resolution Hierarchy:
   * 1. Project Specific Overrides
   * 2. Supplier & Regional Match
   * 3. Latest Verified Reference Price
   * 4. 0 with PRICE_NOT_FOUND indicator
   */
  public getMaterialPrice(
    materialId: string,
    preferredSupplier?: string,
    preferredLocation?: string
  ): { unitPrice: number; supplier: string; source: string; effectiveDate: string } {
    const refs = this.priceReferences.get(materialId) || [];
    if (refs.length === 0) {
      return {
        unitPrice: 0,
        supplier: 'PRICE_NOT_FOUND',
        source: 'NO_REFERENCE',
        effectiveDate: new Date().toISOString()
      };
    }

    if (preferredSupplier) {
      const match = refs.find(r => r.supplier.toLowerCase().includes(preferredSupplier.toLowerCase()));
      if (match) {
        return {
          unitPrice: match.unitPrice,
          supplier: match.supplier,
          source: 'SUPPLIER_MATCH',
          effectiveDate: match.effectiveDate
        };
      }
    }

    if (preferredLocation) {
      const match = refs.find(r => r.location.toLowerCase().includes(preferredLocation.toLowerCase()));
      if (match) {
        return {
          unitPrice: match.unitPrice,
          supplier: match.supplier,
          source: 'REGIONAL_MATCH',
          effectiveDate: match.effectiveDate
        };
      }
    }

    // Default to the first official reference
    const defaultRef = refs[0];
    return {
      unitPrice: defaultRef.unitPrice,
      supplier: defaultRef.supplier,
      source: 'OFFICIAL_PRICE_REFERENCE',
      effectiveDate: defaultRef.effectiveDate
    };
  }

  // -------------------------------------------------------------
  // COVERAGE & PACKAGING CALCULATIONS
  // -------------------------------------------------------------
  /**
   * Deterministic material consumption calculation
   * e.g. Area 286.2 m² of paint with coverage 10 m²/L and 10% waste = 31.48 L
   */
  public calculateMaterialCoverage(
    materialId: string,
    targetAreaOrVolume: number,
    customWastePercent?: number
  ): {
    baseQuantity: number;
    wastePercent: number;
    wasteQuantity: number;
    totalRequired: number;
    unit: string;
    packagingAdvice: string;
  } {
    const mat = this.materials.get(materialId);
    const waste = customWastePercent !== undefined
      ? customWastePercent
      : (mat?.defaultWastePercent || 5);

    if (!mat || !mat.coveragePerUnit || mat.coveragePerUnit <= 0) {
      const wasteQty = SafeDecimalEngine.safeMultiply(targetAreaOrVolume, waste / 100, 2);
      const total = SafeDecimalEngine.safeAdd(targetAreaOrVolume, wasteQty);
      return {
        baseQuantity: targetAreaOrVolume,
        wastePercent: waste,
        wasteQuantity: wasteQty,
        totalRequired: total,
        unit: mat?.unit || 'unit',
        packagingAdvice: `${total} ${mat?.unit || 'unit'} (Standar tanpa konversi kemasan)`
      };
    }

    // Base quantity in packaging unit (e.g. Liters or Cartons)
    const base = SafeDecimalEngine.safeDivide(targetAreaOrVolume, mat.coveragePerUnit, 2);
    const wasteQty = SafeDecimalEngine.safeMultiply(base, waste / 100, 2);
    const total = SafeDecimalEngine.safeRound(SafeDecimalEngine.safeAdd(base, wasteQty), 2);

    let packagingAdvice = `${total} ${mat.unit}`;
    if (mat.packagingOptions && mat.packagingOptions.length > 0) {
      // Recommend purchasing breakdown for common paint containers (20L, 5L, 1L)
      if (mat.unit === 'liter') {
        let remainder = total;
        const p20 = Math.floor(remainder / 20);
        remainder -= p20 * 20;
        const p5 = Math.floor(remainder / 5);
        remainder -= p5 * 5;
        const p1 = Math.ceil(remainder);
        const parts: string[] = [];
        if (p20 > 0) parts.push(`${p20}x Pail 20 L`);
        if (p5 > 0) parts.push(`${p5}x Kaleng 5 L`);
        if (p1 > 0) parts.push(`${p1}x Kaleng 1 L`);
        packagingAdvice = parts.length > 0 ? parts.join(' + ') : `${Math.ceil(total)} Liter`;
      } else {
        packagingAdvice = `${Math.ceil(total)} ${mat.packagingOptions[0]}`;
      }
    }

    return {
      baseQuantity: base,
      wastePercent: waste,
      wasteQuantity: wasteQty,
      totalRequired: total,
      unit: mat.unit,
      packagingAdvice
    };
  }

  // -------------------------------------------------------------
  // PROJECT MATERIAL SPECIFICATION MANAGEMENT
  // -------------------------------------------------------------
  public getProjectSpec(projectId: string): ProjectMaterialSpecification {
    let spec = this.projectSpecifications.get(projectId);
    if (!spec) {
      spec = {
        projectId,
        categoryDefaults: {
          KERAMIK: 'MAT-KER-ROM-60',
          GRANIT: 'MAT-GRA-GRN-60',
          CAT_INTERIOR: 'MAT-CAT-NIP-INT',
          CAT_EKSTERIOR: 'MAT-CAT-DULUX-EXT',
          PAVING: 'MAT-PAV-BATA-6',
          SANITARY: 'MAT-SAN-TOTO-CW420',
          ATAP: 'MAT-ATP-SAKURA-ROOF'
        },
        itemOverrides: {}
      };
      this.projectSpecifications.set(projectId, spec);
    }
    return spec;
  }

  public setProjectCategoryDefault(projectId: string, category: string, materialId: string) {
    const spec = this.getProjectSpec(projectId);
    spec.categoryDefaults[category.toUpperCase()] = materialId;
    this.persistSpecs();
  }

  public setItemMaterialOverride(
    projectId: string,
    itemId: string,
    materialId: string,
    customWaste?: number,
    notes?: string
  ): UserOverrideRecord {
    const spec = this.getProjectSpec(projectId);
    spec.itemOverrides[itemId] = {
      materialId,
      customWastePercent: customWaste,
      notes
    };
    this.persistSpecs();

    const record: UserOverrideRecord = {
      field: 'materialSpecification',
      originalValue: 'TEMPLATE_DEFAULT',
      userValue: materialId,
      source: 'USER_OVERRIDE',
      updatedBy: 'ESTIMATOR_USER',
      updatedAt: new Date().toISOString(),
      reason: notes || 'Pilihan material kustom pengguna proyek'
    };
    return record;
  }

  // -------------------------------------------------------------
  // LOCALSTORAGE PERSISTENCE
  // -------------------------------------------------------------
  private loadPersistedSpecs() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(STORAGE_KEY_PROJECT_SPECS);
        if (raw) {
          const parsed = JSON.parse(raw);
          for (const [k, v] of Object.entries(parsed)) {
            this.projectSpecifications.set(k, v as ProjectMaterialSpecification);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load project material specifications from localStorage', e);
    }
  }

  private persistSpecs() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const obj: Record<string, ProjectMaterialSpecification> = {};
        for (const [k, v] of this.projectSpecifications.entries()) {
          obj[k] = v;
        }
        window.localStorage.setItem(STORAGE_KEY_PROJECT_SPECS, JSON.stringify(obj));
      }
    } catch (e) {
      console.warn('Failed to persist project material specifications to localStorage', e);
    }
  }
}

/**
 * EZRAB — CANONICAL MATERIAL MASTER
 * =================================
 * Phase 3: Standardized Material Identity Registry with Specification Disambiguation.
 * Prevents conflating materials with different specifications (e.g. Kaca 5mm != Kaca 8mm,
 * Besi Polos != Besi Ulir, Gypsum 9mm != GRC 4mm).
 */

export interface CanonicalMaterialDefinition {
  materialId: string;
  canonicalName: string;
  normalizedName: string;
  aliases: string[];
  specification: string;
  unit: string;
  category: 'CIPTA_KARYA' | 'BINA_MARGA' | 'SUMBER_DAYA_AIR' | 'COMMON';
  subCategory: string;
  source: string;
  status: 'VERIFIED' | 'REVIEW_REQUIRED';
  standardPriceRange: {
    minPrice: number;
    referencePrice: number;
    maxPrice: number;
  };
}

export const CANONICAL_MATERIALS: CanonicalMaterialDefinition[] = [
  // 1. Semen & Mortar
  {
    materialId: 'MAT-CANON-001',
    canonicalName: 'Semen Portland (PC)',
    normalizedName: 'semen portland pc',
    aliases: ['semen pc', 'semen gresik', 'semen tiga roda', 'portland cement', 'pc'],
    specification: 'Standar SNI 2049:2015 tipe I, kemasan zak 40 kg / 50 kg (dihitung per kg)',
    unit: 'kg',
    category: 'CIPTA_KARYA',
    subCategory: 'Bahan Pengikat & Mortar',
    source: 'SE DJBK No. 47/SE/Dk/2026',
    status: 'VERIFIED',
    standardPriceRange: { minPrice: 1_400, referencePrice: 1_750, maxPrice: 2_500 },
  },
  {
    materialId: 'MAT-CANON-002',
    canonicalName: 'Mortar Instan Thinbed / Perekat Bata Ringan',
    normalizedName: 'mortar instan thinbed perekat bata ringan',
    aliases: ['thinbed', 'lem hebel', 'semen hebel', 'mortar hebel'],
    specification: 'Semen instan siap pakai untuk perekat bata ringan / AAC (zak 40 kg, dihitung per kg)',
    unit: 'kg',
    category: 'CIPTA_KARYA',
    subCategory: 'Bahan Pengikat & Mortar',
    source: 'SE DJBK No. 47/SE/Dk/2026',
    status: 'VERIFIED',
    standardPriceRange: { minPrice: 2_000, referencePrice: 2_600, maxPrice: 4_000 },
  },

  // 2. Pasir & Agregat
  {
    materialId: 'MAT-CANON-003',
    canonicalName: 'Pasir Urug',
    normalizedName: 'pasir urug',
    aliases: ['pasir urugan', 'pasir urug bawah lantai', 'pasir urug pondasi'],
    specification: 'Pasir urug kualitas sedang untuk lapisan bawah pondasi & lantai',
    unit: 'm3',
    category: 'CIPTA_KARYA',
    subCategory: 'Bahan Pasir & Agregat',
    source: 'SE DJBK No. 47/SE/Dk/2026',
    status: 'VERIFIED',
    standardPriceRange: { minPrice: 140_000, referencePrice: 220_000, maxPrice: 320_000 },
  },
  {
    materialId: 'MAT-CANON-004',
    canonicalName: 'Pasir Pasang',
    normalizedName: 'pasir pasang',
    aliases: ['pasir pasangan', 'pasir adukan', 'pasir plesteran'],
    specification: 'Pasir pasang bebas lumpur berlebih untuk spesi adukan dinding & plesteran',
    unit: 'm3',
    category: 'CIPTA_KARYA',
    subCategory: 'Bahan Pasir & Agregat',
    source: 'SE DJBK No. 47/SE/Dk/2026',
    status: 'VERIFIED',
    standardPriceRange: { minPrice: 220_000, referencePrice: 290_000, maxPrice: 400_000 },
  },
  {
    materialId: 'MAT-CANON-005',
    canonicalName: 'Pasir Beton',
    normalizedName: 'pasir beton',
    aliases: ['pasir cor', 'pasir cor beton'],
    specification: 'Pasir kasar bergradasi baik untuk campuran beton struktural',
    unit: 'm3',
    category: 'CIPTA_KARYA',
    subCategory: 'Bahan Pasir & Agregat',
    source: 'SE DJBK No. 47/SE/Dk/2026',
    status: 'VERIFIED',
    standardPriceRange: { minPrice: 240_000, referencePrice: 320_000, maxPrice: 450_000 },
  },
  {
    materialId: 'MAT-CANON-006',
    canonicalName: 'Batu Belah 15/20 cm (Batu Kali / Batu Gunung)',
    normalizedName: 'batu belah 15 20 cm batu kali batu gunung',
    aliases: ['batu kali', 'batu gunung', 'batu belah', 'batu pondasi'],
    specification: 'Batu alam belah keras ukuran 15-20 cm untuk pasangan pondasi',
    unit: 'm3',
    category: 'CIPTA_KARYA',
    subCategory: 'Bahan Pasir & Agregat',
    source: 'SE DJBK No. 47/SE/Dk/2026',
    status: 'VERIFIED',
    standardPriceRange: { minPrice: 220_000, referencePrice: 310_000, maxPrice: 480_000 },
  },
  {
    materialId: 'MAT-CANON-007',
    canonicalName: 'Batu Pecah / Kerikil Beton (Split 2/3 cm)',
    normalizedName: 'batu pecah kerikil beton split 2 3 cm',
    aliases: ['split', 'split 2/3', 'kerikil beton', 'kerikil cor', 'batu split'],
    specification: 'Batu pecah mesin (crusher) ukuran 20-30 mm untuk beton struktural',
    unit: 'm3',
    category: 'CIPTA_KARYA',
    subCategory: 'Bahan Pasir & Agregat',
    source: 'SE DJBK No. 47/SE/Dk/2026',
    status: 'VERIFIED',
    standardPriceRange: { minPrice: 250_000, referencePrice: 330_000, maxPrice: 460_000 },
  },

  // 3. Baja Tulangan & Besi
  {
    materialId: 'MAT-CANON-008',
    canonicalName: 'Baja Tulangan Polos (BjTP 280 / Dia < 12 mm)',
    normalizedName: 'baja tulangan polos bjtp 280 dia 12 mm',
    aliases: ['besi polos', 'besi beton polos', 'bjtp', 'besi d8', 'besi d10', 'besi d6'],
    specification: 'Baja tulangan sirip/polos mutu BjTP 280 (SNI 2052:2017) diameter < 12 mm',
    unit: 'kg',
    category: 'CIPTA_KARYA',
    subCategory: 'Baja & Pembesian',
    source: 'SE DJBK No. 47/SE/Dk/2026',
    status: 'VERIFIED',
    standardPriceRange: { minPrice: 12_500, referencePrice: 14_800, maxPrice: 22_000 },
  },
  {
    materialId: 'MAT-CANON-009',
    canonicalName: 'Baja Tulangan Ulir / Sirip (BjTS 420B / Dia >= 12 mm)',
    normalizedName: 'baja tulangan ulir sirip bjts 420b dia 12 mm',
    aliases: ['besi ulir', 'besi sirip', 'bjts', 'besi d12', 'besi d13', 'besi d16'],
    specification: 'Baja tulangan deform/sirip mutu BjTS 420B (SNI 2052:2017) diameter >= 12 mm',
    unit: 'kg',
    category: 'CIPTA_KARYA',
    subCategory: 'Baja & Pembesian',
    source: 'SE DJBK No. 47/SE/Dk/2026',
    status: 'VERIFIED',
    standardPriceRange: { minPrice: 13_000, referencePrice: 15_500, maxPrice: 24_000 },
  },
  {
    materialId: 'MAT-CANON-010',
    canonicalName: 'Kawat Beton / Bendrat',
    normalizedName: 'kawat beton bendrat',
    aliases: ['kawat bendrat', 'bendrat', 'kawat pengikat beton'],
    specification: 'Kawat ikat baja lunak hitam diameter 1 mm untuk perakitan tulangan',
    unit: 'kg',
    category: 'CIPTA_KARYA',
    subCategory: 'Baja & Pembesian',
    source: 'SE DJBK No. 47/SE/Dk/2026',
    status: 'VERIFIED',
    standardPriceRange: { minPrice: 20_000, referencePrice: 28_000, maxPrice: 40_000 },
  },

  // 4. Kayu & Cerucuk
  {
    materialId: 'MAT-CANON-011',
    canonicalName: 'Cerucuk Kayu Ulin 80x80x2000 mm',
    normalizedName: 'cerucuk kayu ulin 80x80x2000 mm',
    aliases: ['cerucuk ulin', 'tiang ulin', 'kayu ulin 8x8'],
    specification: 'Kayu ulin keras kelas kuat I ukuran 80x80 mm panjang 2,0 m untuk cerucuk tanah lunak',
    unit: 'm',
    category: 'CIPTA_KARYA',
    subCategory: 'Kayu & Cerucuk',
    source: 'SE DJBK No. 47/SE/Dk/2026',
    status: 'VERIFIED',
    standardPriceRange: { minPrice: 35_000, referencePrice: 55_000, maxPrice: 90_000 },
  },
  {
    materialId: 'MAT-CANON-012',
    canonicalName: 'Kayu Bekisting / Kayu Kelas III',
    normalizedName: 'kayu bekisting kayu kelas iii',
    aliases: ['kayu bekisting', 'kaso 4/6', 'kaso 5/7', 'kayu perancah'],
    specification: 'Kayu meranti rawa / kayu lunak kelas III untuk rangka cetakan beton',
    unit: 'm3',
    category: 'CIPTA_KARYA',
    subCategory: 'Kayu & Bekisting',
    source: 'SE DJBK No. 47/SE/Dk/2026',
    status: 'VERIFIED',
    standardPriceRange: { minPrice: 2_400_000, referencePrice: 3_200_000, maxPrice: 4_200_000 },
  },

  // 5. Baja Ringan & Atap
  {
    materialId: 'MAT-CANON-013',
    canonicalName: 'Rangka Kuda-Kuda Baja Ringan Kanal C75.75',
    normalizedName: 'rangka kuda kuda baja ringan kanal c75 75',
    aliases: ['truss c75', 'kanal c75', 'baja ringan c75'],
    specification: 'Profil canal C baja ringan galvalume AZ100 tebal nominal 0,75 mm',
    unit: 'm',
    category: 'CIPTA_KARYA',
    subCategory: 'Baja Ringan & Rangka',
    source: 'SE DJBK No. 47/SE/Dk/2026',
    status: 'VERIFIED',
    standardPriceRange: { minPrice: 18_000, referencePrice: 24_500, maxPrice: 38_000 },
  },
  {
    materialId: 'MAT-CANON-014',
    canonicalName: 'Reng Baja Ringan U30 / U32',
    normalizedName: 'reng baja ringan u30 u32',
    aliases: ['reng baja ringan', 'reng galvalume', 'reng asimetris'],
    specification: 'Profil reng baja ringan galvalume AZ100 tebal nominal 0,45 mm',
    unit: 'm',
    category: 'CIPTA_KARYA',
    subCategory: 'Baja Ringan & Rangka',
    source: 'SE DJBK No. 47/SE/Dk/2026',
    status: 'VERIFIED',
    standardPriceRange: { minPrice: 9_000, referencePrice: 13_500, maxPrice: 20_000 },
  },
  {
    materialId: 'MAT-CANON-015',
    canonicalName: 'Penutup Atap Metal Spandek 0.35 mm',
    normalizedName: 'penutup atap metal spandek 0 35 mm',
    aliases: ['atap spandek', 'spandek 0.35', 'seng spandek', 'atap zincalume'],
    specification: 'Lembaran atap metal gelombang galvalume tebal BMT 0.35 mm (dihitung per m2 terpasang)',
    unit: 'm2',
    category: 'CIPTA_KARYA',
    subCategory: 'Penutup Atap',
    source: 'SE DJBK No. 47/SE/Dk/2026',
    status: 'VERIFIED',
    standardPriceRange: { minPrice: 55_000, referencePrice: 78_000, maxPrice: 120_000 },
  },

  // 6. Plafon
  {
    materialId: 'MAT-CANON-016',
    canonicalName: 'Papan Gypsum Tebal 9 mm',
    normalizedName: 'papan gypsum tebal 9 mm',
    aliases: ['gypsum 9mm', 'gypsum board 9 mm', 'jayaboard 9mm', 'elephant 9mm'],
    specification: 'Papan gipsum standar tebal 9 mm ukuran 1200 x 2400 mm (dihitung per m2)',
    unit: 'm2',
    category: 'CIPTA_KARYA',
    subCategory: 'Plafon & Partisi',
    source: 'SE DJBK No. 47/SE/Dk/2026',
    status: 'VERIFIED',
    standardPriceRange: { minPrice: 25_000, referencePrice: 35_000, maxPrice: 55_000 },
  },

  // 7. Keramik
  {
    materialId: 'MAT-CANON-017',
    canonicalName: 'Ubin Keramik Lantai 40x40 cm Polos / Motif',
    normalizedName: 'ubin keramik lantai 40x40 cm polos motif',
    aliases: ['keramik 40x40', 'keramik lantai 40x40', 'tile 40x40'],
    specification: 'Ubin keramik berglasur ukuran 40x40 cm kualitas KW1 untuk ruang utama/kamar',
    unit: 'm2',
    category: 'CIPTA_KARYA',
    subCategory: 'Penutup Lantai & Dinding',
    source: 'SE DJBK No. 47/SE/Dk/2026',
    status: 'VERIFIED',
    standardPriceRange: { minPrice: 65_000, referencePrice: 95_000, maxPrice: 160_000 },
  },
  {
    materialId: 'MAT-CANON-018',
    canonicalName: 'Ubin Keramik Kamar Mandi 25x25 cm Kasar (Anti Slip)',
    normalizedName: 'ubin keramik kamar mandi 25x25 cm kasar anti slip',
    aliases: ['keramik 25x25', 'keramik km 25x25', 'keramik lantai km'],
    specification: 'Ubin keramik unpolished tekstur kasar anti-slip 25x25 cm untuk lantai kamar mandi',
    unit: 'm2',
    category: 'CIPTA_KARYA',
    subCategory: 'Penutup Lantai & Dinding',
    source: 'SE DJBK No. 47/SE/Dk/2026',
    status: 'VERIFIED',
    standardPriceRange: { minPrice: 65_000, referencePrice: 98_000, maxPrice: 170_000 },
  },

  // 8. Kusen Aluminium & Kaca
  {
    materialId: 'MAT-CANON-019',
    canonicalName: 'Kusen Aluminium 4 Inch (Anodized / Powder Coating)',
    normalizedName: 'kusen aluminium 4 inch anodized powder coating',
    aliases: ['kusen aluminium 4"', 'kusen aluminium 4 inch', 'profil aluminium 4'],
    specification: 'Profil kusen aluminium ukuran nominal 4 inch (40 x 100 mm) finishing powder coating',
    unit: 'm',
    category: 'CIPTA_KARYA',
    subCategory: 'Kusen Pintu & Jendela',
    source: 'SE DJBK No. 47/SE/Dk/2026',
    status: 'VERIFIED',
    standardPriceRange: { minPrice: 85_000, referencePrice: 135_000, maxPrice: 220_000 },
  },
  {
    materialId: 'MAT-CANON-020',
    canonicalName: 'Kaca Bening Polos Tebal 5 mm',
    normalizedName: 'kaca bening polos tebal 5 mm',
    aliases: ['kaca 5 mm', 'kaca 5mm', 'kaca bening 5mm', 'clear glass 5mm'],
    specification: 'Kaca lembaran bening (clear float glass) tebal 5 mm potong ukuran',
    unit: 'm2',
    category: 'CIPTA_KARYA',
    subCategory: 'Kaca & Aksesoris',
    source: 'SE DJBK No. 47/SE/Dk/2026',
    status: 'VERIFIED',
    standardPriceRange: { minPrice: 110_000, referencePrice: 165_000, maxPrice: 250_000 },
  },
  {
    materialId: 'MAT-CANON-021',
    canonicalName: 'Kaca Bening Polos Tebal 8 mm',
    normalizedName: 'kaca bening polos tebal 8 mm',
    aliases: ['kaca 8 mm', 'kaca 8mm', 'kaca bening 8mm', 'clear glass 8mm'],
    specification: 'Kaca lembaran bening (clear float glass) tebal 8 mm potong ukuran',
    unit: 'm2',
    category: 'CIPTA_KARYA',
    subCategory: 'Kaca & Aksesoris',
    source: 'SE DJBK No. 47/SE/Dk/2026',
    status: 'VERIFIED',
    standardPriceRange: { minPrice: 220_000, referencePrice: 295_000, maxPrice: 450_000 },
  },

  // 9. Pipa & Plumbing
  {
    materialId: 'MAT-CANON-022',
    canonicalName: 'Pipa PVC Tipe AW Diameter 1/2 Inch',
    normalizedName: 'pipa pvc tipe aw diameter 1 2 inch',
    aliases: ['pipa 1/2', 'pipa aw 1/2', 'pipa air bersih 1/2"'],
    specification: 'Pipa PVC kelas AW tekanan tinggi untuk instalasi air bersih diameter 1/2 inch (per meter)',
    unit: 'm',
    category: 'CIPTA_KARYA',
    subCategory: 'Mekanikal & Plumbing',
    source: 'SE DJBK No. 47/SE/Dk/2026',
    status: 'VERIFIED',
    standardPriceRange: { minPrice: 8_000, referencePrice: 13_500, maxPrice: 24_000 },
  },
  {
    materialId: 'MAT-CANON-023',
    canonicalName: 'Pipa PVC Tipe D Diameter 3 Inch',
    normalizedName: 'pipa pvc tipe d diameter 3 inch',
    aliases: ['pipa 3"', 'pipa d 3', 'pipa air kotor 3"'],
    specification: 'Pipa PVC kelas D untuk instalasi pembuangan air kotor / air bekas diameter 3 inch (per meter)',
    unit: 'm',
    category: 'CIPTA_KARYA',
    subCategory: 'Mekanikal & Plumbing',
    source: 'SE DJBK No. 47/SE/Dk/2026',
    status: 'VERIFIED',
    standardPriceRange: { minPrice: 32_000, referencePrice: 48_000, maxPrice: 75_000 },
  },
  {
    materialId: 'MAT-CANON-024',
    canonicalName: 'Pipa PVC Tipe D Diameter 4 Inch',
    normalizedName: 'pipa pvc tipe d diameter 4 inch',
    aliases: ['pipa 4"', 'pipa d 4', 'pipa tinja 4"'],
    specification: 'Pipa PVC kelas D untuk instalasi pembuangan air tinja diameter 4 inch (per meter)',
    unit: 'm',
    category: 'CIPTA_KARYA',
    subCategory: 'Mekanikal & Plumbing',
    source: 'SE DJBK No. 47/SE/Dk/2026',
    status: 'VERIFIED',
    standardPriceRange: { minPrice: 48_000, referencePrice: 72_000, maxPrice: 110_000 },
  },
];

export class CanonicalMaterialMaster {
  private static instance: CanonicalMaterialMaster;
  private byId: Map<string, CanonicalMaterialDefinition> = new Map();

  private constructor() {
    for (const mat of CANONICAL_MATERIALS) {
      this.byId.set(mat.materialId, mat);
    }
  }

  public static getInstance(): CanonicalMaterialMaster {
    if (!CanonicalMaterialMaster.instance) {
      CanonicalMaterialMaster.instance = new CanonicalMaterialMaster();
    }
    return CanonicalMaterialMaster.instance;
  }

  public getById(id: string): CanonicalMaterialDefinition | undefined {
    return this.byId.get(id);
  }

  public getAll(): readonly CanonicalMaterialDefinition[] {
    return CANONICAL_MATERIALS;
  }

  /**
   * Matches query string against canonical materials considering specification keywords.
   * Enforces Rule: KACA 5 MM != KACA 8 MM.
   */
  public matchMaterial(
    name: string,
    spec: string = '',
    unit?: string
  ): CanonicalMaterialDefinition | null {
    const qName = name.toLowerCase();
    const qSpec = spec.toLowerCase();
    const combined = `${qName} ${qSpec}`;

    // Specific disambiguation rules:
    // 1. Kaca 5mm vs Kaca 8mm
    if (combined.includes('kaca')) {
      if (combined.includes('8 mm') || combined.includes('8mm')) {
        return this.getById('MAT-CANON-021') || null;
      }
      if (combined.includes('5 mm') || combined.includes('5mm')) {
        return this.getById('MAT-CANON-020') || null;
      }
    }

    // 2. Baja Tulangan Polos vs Ulir
    if (combined.includes('tulangan') || combined.includes('pembesian') || combined.includes('besi beton')) {
      if (combined.includes('ulir') || combined.includes('sirip') || combined.includes('d12') || combined.includes('d13') || combined.includes('d16') || combined.includes('bjts')) {
        return this.getById('MAT-CANON-009') || null;
      }
      return this.getById('MAT-CANON-008') || null;
    }

    // 3. Pasir Urug vs Pasang vs Beton
    if (combined.includes('pasir')) {
      if (combined.includes('urug')) return this.getById('MAT-CANON-003') || null;
      if (combined.includes('pasang') || combined.includes('plester')) return this.getById('MAT-CANON-004') || null;
      if (combined.includes('beton') || combined.includes('cor')) return this.getById('MAT-CANON-005') || null;
      // Default to Pasir Pasang
      return this.getById('MAT-CANON-004') || null;
    }

    // 4. Semen PC vs Mortar
    if (combined.includes('semen') || combined.includes('mortar') || combined.includes('thinbed')) {
      if (combined.includes('thinbed') || combined.includes('mortar') || combined.includes('hebel')) {
        return this.getById('MAT-CANON-002') || null;
      }
      return this.getById('MAT-CANON-001') || null;
    }

    // 5. Keramik 40x40 vs 25x25
    if (combined.includes('keramik')) {
      if (combined.includes('25x25') || combined.includes('kamar mandi')) {
        return this.getById('MAT-CANON-018') || null;
      }
      return this.getById('MAT-CANON-017') || null;
    }

    // 6. Plafon Gypsum
    if (combined.includes('gypsum') || combined.includes('plafon')) {
      return this.getById('MAT-CANON-016') || null;
    }

    // 7. Cerucuk Ulin
    if (combined.includes('cerucuk') || combined.includes('ulin')) {
      return this.getById('MAT-CANON-011') || null;
    }

    // 8. Kusen Aluminium
    if (combined.includes('kusen') && combined.includes('alumin')) {
      return this.getById('MAT-CANON-019') || null;
    }

    // 9. Spandek
    if (combined.includes('spandek') || combined.includes('atap metal')) {
      return this.getById('MAT-CANON-015') || null;
    }

    // General match by aliases
    for (const mat of CANONICAL_MATERIALS) {
      if (combined.includes(mat.normalizedName)) return mat;
      for (const alias of mat.aliases) {
        if (combined.includes(alias.toLowerCase())) return mat;
      }
    }

    return null;
  }
}

export const canonicalMaterialMaster = CanonicalMaterialMaster.getInstance();

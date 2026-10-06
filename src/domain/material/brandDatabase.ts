/**
 * EZRAB — BRAND & MANUFACTURER DATABASE INDONESIA 2026
 * Canonical Brand Hierarchy, Aliases Normalization & Manufacturer Profiles
 */

import { BrandMaster } from './types';

export const NATIONAL_BRAND_REGISTRY: BrandMaster[] = [
  // ----------------- SEMEN & MORTAR -----------------
  {
    id: 'BRD-SIG',
    name: 'Semen Indonesia (SIG)',
    canonicalBrand: 'Semen Indonesia Group',
    aliases: ['sig', 'semen indonesia', 'semen gresik', 'semen padang', 'semen tonasa'],
    countryOfOrigin: 'Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['Semen PCC', 'Semen OPC Tipe I', 'UltraPro', 'EzPro'],
    website: 'https://sig.id',
    notes: 'BUMN Produsen semen terbesar nasional (Gresik, Padang, Tonasa)'
  },
  {
    id: 'BRD-INDO',
    name: 'Tiga Roda (Indocement)',
    canonicalBrand: 'Tiga Roda',
    aliases: ['tiga roda', 'indocement', 'semen tiga roda'],
    countryOfOrigin: 'Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['PCC Tiga Roda', 'OPC Tipe I', 'Duracem', 'Semen Putih'],
    website: 'https://indocement.co.id'
  },
  {
    id: 'BRD-DYN',
    name: 'Dynamix (Eks Holcim)',
    canonicalBrand: 'Dynamix',
    aliases: ['dynamix', 'holcim', 'semen dynamix', 'solusi bangun indonesia'],
    countryOfOrigin: 'Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['Dynamix Serbaguna', 'Dynamix Ekstra Kuat', 'Dynamix Pasangan'],
    website: 'https://dynamix.id'
  },
  {
    id: 'BRD-SMP',
    name: 'Semen Merah Putih',
    canonicalBrand: 'Merah Putih',
    aliases: ['merah putih', 'semen merah putih', 'cemindo'],
    countryOfOrigin: 'Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['Semen Merah Putih PCC', 'Watershield'],
    website: 'https://cemindogemilang.com'
  },
  {
    id: 'BRD-MU',
    name: 'Mortar Utama (MU-Weber)',
    canonicalBrand: 'Mortar Utama',
    aliases: ['mu', 'mortar utama', 'saint-gobain mu', 'weber'],
    countryOfOrigin: 'Indonesia / Perancis',
    coverageStatus: 'VERIFIED',
    productLines: ['MU-380 Perekat Bata Ringan', 'MU-200 Acian', 'MU-400 Perekat Keramik', 'MU-100 Plester'],
    website: 'https://mortarutama.com'
  },
  {
    id: 'BRD-SIKA',
    name: 'Sika Indonesia',
    canonicalBrand: 'Sika',
    aliases: ['sika', 'sika indonesia', 'sikadur', 'sikagrout'],
    countryOfOrigin: 'Swiss / Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['SikaGrout 215', 'Sikadur 31 CF', 'Sikalastic 560', 'SikaTop 107 Plus'],
    website: 'https://idn.sika.com'
  },

  // ----------------- BATA RINGAN & HEBEL -----------------
  {
    id: 'BRD-CIT',
    name: 'Citicon',
    canonicalBrand: 'Citicon',
    aliases: ['citicon', 'bata ringan citicon', 'panel lantai citicon'],
    countryOfOrigin: 'Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['Bata Ringan AAC Citicon 60x20x10', 'Bata Ringan 60x20x7.5', 'Panel Lantai Citicon'],
    website: 'https://citiconindonesia.com'
  },
  {
    id: 'BRD-GE',
    name: 'Grand Elephant',
    canonicalBrand: 'Grand Elephant',
    aliases: ['grand elephant', 'ge', 'bata ringan ge'],
    countryOfOrigin: 'Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['Bata Ringan AAC', 'Semen Instan GE', 'Panel Dinding GE'],
    website: 'https://grand-elephant.com'
  },
  {
    id: 'BRD-BLS',
    name: 'Blesscon',
    canonicalBrand: 'Blesscon',
    aliases: ['blesscon', 'bata ringan blesscon'],
    countryOfOrigin: 'Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['Bata Ringan AAC Tebal 7.5cm', 'Tebal 10cm', 'Perekat Bata'],
    website: 'https://blesscon.com'
  },

  // ----------------- BAJA, BESI & BAJA RINGAN -----------------
  {
    id: 'BRD-KS',
    name: 'Krakatau Steel',
    canonicalBrand: 'Krakatau Steel',
    aliases: ['krakatau steel', 'ks', 'baja ks', 'krakatau posco'],
    countryOfOrigin: 'Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['Besi Beton Ulir TS420B', 'Besi Polos BjTP 280', 'H-Beam KS', 'WF KS', 'Plat Baja'],
    website: 'https://krakatausteel.com'
  },
  {
    id: 'BRD-MS',
    name: 'Master Steel',
    canonicalBrand: 'Master Steel',
    aliases: ['master steel', 'ms', 'besi master'],
    countryOfOrigin: 'Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['Besi Beton SNI D10 - D32', 'Wiremesh M6 - M12'],
    website: 'https://themastersteel.com'
  },
  {
    id: 'BRD-TASO',
    name: 'TASO (Tatalogam Lestari)',
    canonicalBrand: 'TASO',
    aliases: ['taso', 'tatalogam', 'baja ringan taso'],
    countryOfOrigin: 'Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['Kanal C 75.75', 'Kanal C 75.100', 'Reng 32.45', 'Sakura Truss'],
    website: 'https://tatalogam.com'
  },
  {
    id: 'BRD-KNC',
    name: 'Kencana Truss',
    canonicalBrand: 'Kencana',
    aliases: ['kencana', 'kencana truss', 'baja ringan kencana'],
    countryOfOrigin: 'Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['Kanal C Kencana 75x75', 'Reng Kencana', 'Hollow Plafon'],
    website: 'https://kencana.org'
  },
  {
    id: 'BRD-BLS-COP',
    name: 'BlueScope Lysaght',
    canonicalBrand: 'BlueScope',
    aliases: ['bluescope', 'lysaght', 'colorbond', 'zincalume'],
    countryOfOrigin: 'Australia / Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['Colorbond Roof', 'Zincalume Steel', 'Smartruss', 'Spandek Lysaght'],
    website: 'https://bluescope.com'
  },

  // ----------------- KERAMIK & GRANIT -----------------
  {
    id: 'BRD-ROM',
    name: 'Roman Ceramics',
    canonicalBrand: 'Roman',
    aliases: ['roman', 'roman ceramics', 'roman graniti', 'dPortofino'],
    countryOfOrigin: 'Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['Keramik 30x30', 'Keramik 40x40', 'Keramik 50x50', 'Graniti 60x60', 'Graniti 120x60'],
    website: 'https://romanceramics.com'
  },
  {
    id: 'BRD-GRN',
    name: 'Granito Tile',
    canonicalBrand: 'Granito',
    aliases: ['granito', 'granite tile granito', 'salsa pearl'],
    countryOfOrigin: 'Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['Salsa Series 60x60', 'Palazzo 60x60', 'Ambience 60x60'],
    website: 'https://granito.co.id'
  },
  {
    id: 'BRD-MUL',
    name: 'Mulia Ceramics',
    canonicalBrand: 'Mulia',
    aliases: ['mulia', 'mulia ceramics', 'signature', 'accura'],
    countryOfOrigin: 'Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['Mulia Tile 30x30', '40x40', '50x50', 'Mulia Glass Block'],
    website: 'https://muliagroup.co.id'
  },
  {
    id: 'BRD-INDG',
    name: 'Indogress',
    canonicalBrand: 'Indogress',
    aliases: ['indogress', 'granit indogress'],
    countryOfOrigin: 'Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['Porcelain Tile 60x60', 'Polished 80x80', 'Rustic Series'],
    website: 'https://indogress.com'
  },

  // ----------------- PIPA & PLUMBING -----------------
  {
    id: 'BRD-RUC',
    name: 'Rucika (Wavin)',
    canonicalBrand: 'Rucika',
    aliases: ['rucika', 'wavin', 'pipa rucika', 'rucika standard', 'rucika jis'],
    countryOfOrigin: 'Indonesia / Belanda',
    coverageStatus: 'VERIFIED',
    productLines: ['Rucika Standard AW', 'Rucika Standard D', 'Rucika Kelen Green (PPR)', 'Rucika Black (HDPE)'],
    website: 'https://rucika.co.id'
  },
  {
    id: 'BRD-VIN',
    name: 'Vinilon',
    canonicalBrand: 'Vinilon',
    aliases: ['vinilon', 'pipa vinilon', 'pipa pe vinilon'],
    countryOfOrigin: 'Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['Pipa PVC AW/D', 'Pipa HDPE PE-100', 'Fitting Vinilon'],
    website: 'https://vinilon.com'
  },
  {
    id: 'BRD-MAS',
    name: 'Maspion Pipe',
    canonicalBrand: 'Maspion',
    aliases: ['maspion', 'pipa maspion'],
    countryOfOrigin: 'Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['Pipa PVC Maspion AW', 'D', 'C'],
    website: 'https://maspion.com'
  },
  {
    id: 'BRD-ONDA',
    name: 'ONDA Plumbing',
    canonicalBrand: 'ONDA',
    aliases: ['onda', 'kran onda', 'valve onda'],
    countryOfOrigin: 'Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['Ball Valve Kuningan', 'Kran Air Tembok', 'Gate Valve', 'Floor Drain'],
    website: 'https://onda.id'
  },

  // ----------------- SANITARY & FITTINGS -----------------
  {
    id: 'BRD-TOTO',
    name: 'TOTO Indonesia',
    canonicalBrand: 'TOTO',
    aliases: ['toto', 'sanitary toto', 'closet toto'],
    countryOfOrigin: 'Jepang / Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['Kloset Duduk CW421J', 'CW600J', 'Wastafel LW240J', 'Kran Mixer TOTO'],
    website: 'https://toto.co.id'
  },
  {
    id: 'BRD-AMS',
    name: 'American Standard',
    canonicalBrand: 'American Standard',
    aliases: ['american standard', 'amstad', 'lixil'],
    countryOfOrigin: 'Amerika / Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['Kloset Duduk Winplus', 'Wastafel Studio', 'Shower Mixer'],
    website: 'https://americanstandard.co.id'
  },

  // ----------------- CAT & WATERPROOFING -----------------
  {
    id: 'BRD-DUL',
    name: 'Dulux (AkzoNobel)',
    canonicalBrand: 'Dulux',
    aliases: ['dulux', 'akzonobel', 'cat dulux', 'weathershield', 'pentalite'],
    countryOfOrigin: 'Belanda / Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['Dulux Weathershield Powerflexx', 'Dulux Pentalite Emulsion', 'Dulux Catylac Interior', 'Dulux Primer'],
    website: 'https://dulux.co.id'
  },
  {
    id: 'BRD-NIP',
    name: 'Nippon Paint',
    canonicalBrand: 'Nippon Paint',
    aliases: ['nippon paint', 'nippon', 'vinilex', 'weatherbond', 'elastex'],
    countryOfOrigin: 'Jepang / Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['Vinilex 5000', 'Weatherbond Max', 'Elastex Waterproof 3-in-1', 'Nippon Roadline Paint'],
    website: 'https://nipponpaint-indonesia.com'
  },
  {
    id: 'BRD-JOT',
    name: 'Jotun Indonesia',
    canonicalBrand: 'Jotun',
    aliases: ['jotun', 'jotashield', 'majestic'],
    countryOfOrigin: 'Norwegia / Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['Jotashield Extreme', 'Majestic True Beauty', 'Jotafloor Coating'],
    website: 'https://jotun.co.id'
  },
  {
    id: 'BRD-PRO',
    name: 'Propan Raya',
    canonicalBrand: 'Propan',
    aliases: ['propan', 'propan raya', 'dekorlot', 'ultran'],
    countryOfOrigin: 'Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['Eco Emulsion', 'Decorshield', 'Ultran Politur', 'Epoxy Flooring Propan'],
    website: 'https://propanraya.com'
  },
  {
    id: 'BRD-NODROP',
    name: 'Avian Brands (No Drop)',
    canonicalBrand: 'Avian Brands',
    aliases: ['avian', 'no drop', 'avian brands', 'aries', 'lenkote'],
    countryOfOrigin: 'Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['No Drop Pelapis Anti Bocor', 'Avian Cat Kayu & Besi', 'Sunguard All-in-One'],
    website: 'https://avianbrands.com'
  },

  // ----------------- PLAFON & GYPSUM -----------------
  {
    id: 'BRD-JAYA',
    name: 'Jayaboard (USG Boral)',
    canonicalBrand: 'Jayaboard',
    aliases: ['jayaboard', 'usg boral', 'gypsum jayaboard'],
    countryOfOrigin: 'Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['Papan Gypsum Sheetrock 9mm', 'Wet-Area 9mm', 'Compound Cornice', 'Rangka Metal Furring'],
    website: 'https://jayaboard.com'
  },
  {
    id: 'BRD-KNF',
    name: 'Knauf Gypsum',
    canonicalBrand: 'Knauf',
    aliases: ['knauf', 'gypsum knauf'],
    countryOfOrigin: 'Jerman / Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['Standardboard 9mm', 'Moistureshield 9mm', 'Knauf Joint Tape'],
    website: 'https://knauf.co.id'
  },
  {
    id: 'BRD-KLS',
    name: 'Kalsi (KalsiBoard)',
    canonicalBrand: 'Kalsi',
    aliases: ['kalsi', 'kalsiboard', 'eternit gresik'],
    countryOfOrigin: 'Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['KalsiBoard Ling 3.5mm', 'KalsiBoard Ling 4mm', 'KalsiPart 8mm', 'KalsiClad 10mm'],
    website: 'https://kalsi.co.id'
  },

  // ----------------- ATAP & ROOFING -----------------
  {
    id: 'BRD-OND',
    name: 'Onduline Indonesia',
    canonicalBrand: 'Onduline',
    aliases: ['onduline', 'atap onduline', 'onduvilla'],
    countryOfOrigin: 'Perancis / Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['Onduline Classic', 'Onduvilla Genteng Selulosa', 'Onducasa'],
    website: 'https://onduline.co.id'
  },
  {
    id: 'BRD-KAN',
    name: 'Kanmuri (Keramik Atap)',
    canonicalBrand: 'Kanmuri',
    aliases: ['kanmuri', 'genteng kanmuri'],
    countryOfOrigin: 'Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['Kanmuri Espanica', 'Kanmuri Milenio', 'Kanmuri Full Flat'],
    website: 'https://kanmuriroof.com'
  },

  // ----------------- ELECTRICAL & LIGHTING -----------------
  {
    id: 'BRD-PHI',
    name: 'Philips Lighting (Signify)',
    canonicalBrand: 'Philips',
    aliases: ['philips', 'signify', 'lampu philips'],
    countryOfOrigin: 'Belanda / Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['LED Bulb 9W-19W', 'Downlight Meson', 'Floodlight Essential', 'Smart WiZ'],
    website: 'https://lighting.philips.co.id'
  },
  {
    id: 'BRD-SCH',
    name: 'Schneider Electric',
    canonicalBrand: 'Schneider',
    aliases: ['schneider', 'schneider electric', 'clipsal', 'mcb schneider'],
    countryOfOrigin: 'Perancis / Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['MCB Domae 1P 6A-32A', 'Saklar AvatarOn', 'Stop Kontak Vivace', 'Panel Box Acti9'],
    website: 'https://se.com/id'
  },
  {
    id: 'BRD-SUP',
    name: 'Supreme Cable (PT Sucaco)',
    canonicalBrand: 'Supreme',
    aliases: ['supreme', 'kabel supreme', 'sucaco'],
    countryOfOrigin: 'Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['Kabel NYA 1.5 - 2.5 mm²', 'Kabel NYM 2x1.5 - 3x2.5 mm²', 'Kabel NYY 4x4 - 4x16 mm²'],
    website: 'https://supreme.co.id'
  },

  // ----------------- PRECAST & INFRASTRUKTUR -----------------
  {
    id: 'BRD-WIKA',
    name: 'WIKA Beton (WTON)',
    canonicalBrand: 'WIKA Beton',
    aliases: ['wika beton', 'wton', 'wijaya karya beton'],
    countryOfOrigin: 'Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['PC Piles (Tiang Pancang)', 'PCI Girder 20m - 40m', 'Box Culvert', 'Concrete Sleeper KA'],
    website: 'https://wikabeton.co.id'
  },
  {
    id: 'BRD-WASK',
    name: 'Waskita Precast (WSBP)',
    canonicalBrand: 'Waskita Precast',
    aliases: ['wsbp', 'waskita beton precast', 'waskita precast'],
    countryOfOrigin: 'Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['Sheet Pile CCSP', 'U-Ditch Precast', 'Cover U-Ditch LD/HD', 'Girder Jembatan'],
    website: 'https://waskitaprecast.co.id'
  },
  {
    id: 'BRD-JAYAMIX',
    name: 'SCG Jayamix Readymix',
    canonicalBrand: 'Jayamix',
    aliases: ['jayamix', 'scg jayamix', 'beton cor jayamix', 'readymix scg'],
    countryOfOrigin: 'Thailand / Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['Beton Cor K-225', 'Beton Cor K-250', 'Beton Cor K-300', 'Beton Cor K-350 / fc 30'],
    website: 'https://scg.com'
  },
  {
    id: 'BRD-MAC',
    name: 'Maccaferri Indonesia',
    canonicalBrand: 'Maccaferri',
    aliases: ['maccaferri', 'bronjong maccaferri', 'geotextile maccaferri'],
    countryOfOrigin: 'Italia / Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['Bronjong Kawat Galvanis SNI', 'Geotextile Woven MacTex', 'Geotextile Non-Woven', 'Geomembrane MacLine'],
    website: 'https://maccaferri.com/id'
  },
  {
    id: 'BRD-PERT',
    name: 'Pertamina Bitumen',
    canonicalBrand: 'Pertamina',
    aliases: ['pertamina bitumen', 'aspal pertamina', 'pertamina aspal'],
    countryOfOrigin: 'Indonesia',
    coverageStatus: 'VERIFIED',
    productLines: ['Aspal Penetrasi 60/70', 'Aspal Emulsi CRS-1 / CSS-1', 'Asphalt PG-70 Modifikasi'],
    website: 'https://pertaminapatraniaga.com'
  }
];

export class BrandDatabaseService {
  private static instance: BrandDatabaseService;
  private brands: Map<string, BrandMaster> = new Map();

  private constructor() {
    for (const b of NATIONAL_BRAND_REGISTRY) {
      this.brands.set(b.id, b);
    }
  }

  public static getInstance(): BrandDatabaseService {
    if (!BrandDatabaseService.instance) {
      BrandDatabaseService.instance = new BrandDatabaseService();
    }
    return BrandDatabaseService.instance;
  }

  public getAllBrands(): BrandMaster[] {
    return Array.from(this.brands.values());
  }

  public getCanonicalBrand(queryBrand: string): string {
    const matched = this.matchBrand(queryBrand);
    return matched ? matched.canonicalBrand : queryBrand;
  }

  /**
   * Normalizes brand input by matching against canonical names and aliases
   */
  public matchBrand(queryBrand: string): BrandMaster | undefined {
    if (!queryBrand) return undefined;
    const lower = queryBrand.toLowerCase().trim();

    for (const b of this.brands.values()) {
      if (b.name.toLowerCase() === lower || b.canonicalBrand.toLowerCase() === lower) {
        return b;
      }
      if (b.aliases.some(a => lower.includes(a.toLowerCase()) || a.toLowerCase() === lower)) {
        return b;
      }
    }
    return undefined;
  }

  public static normalizeBrand(queryBrand: string): BrandMaster | undefined {
    return BrandDatabaseService.getInstance().matchBrand(queryBrand);
  }
}

export const brandDatabaseService = BrandDatabaseService.getInstance();
export const BRAND_CATALOG = NATIONAL_BRAND_REGISTRY;

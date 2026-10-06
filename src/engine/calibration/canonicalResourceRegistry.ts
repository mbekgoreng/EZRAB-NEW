/**
 * EZRAB CANONICAL RESOURCE REGISTRY
 *
 * Provides authoritative standard resources, deduplication keys,
 * category classifications, base units, and alias resolution.
 */

export interface CanonicalResource {
  id: string;
  code: string;
  name: string;
  category: 'LABOR' | 'MATERIAL' | 'EQUIPMENT' | 'SMKK';
  standardUnit: string;
  aliases: string[];
  specification?: string;
  description?: string;
}

export const CANONICAL_RESOURCES: CanonicalResource[] = [
  // -------------------------------------------------------------
  // MATERIALS
  // -------------------------------------------------------------
  {
    id: 'MAT_CEMENT_PORTLAND',
    code: 'CEMENT_PORTLAND',
    name: 'Semen Portland (PC / Type I)',
    category: 'MATERIAL',
    standardUnit: 'kg',
    specification: 'SNI 2049:2015 / SE 12/SE/Db/2026',
    aliases: ['semen', 'semen portland', 'semen pc', 'pc', 'semen gresik', 'semen tiga roda', 'semen tonasa', 'portland cement'],
  },
  {
    id: 'MAT_CEMENT_COMPOSITE',
    code: 'CEMENT_COMPOSITE',
    name: 'Semen Portland Komposit (PCC)',
    category: 'MATERIAL',
    standardUnit: 'kg',
    specification: 'SNI 7064:2014',
    aliases: ['pcc', 'semen pcc', 'semen portland komposit', 'semen komposit'],
  },
  {
    id: 'MAT_SAND_CONCRETE',
    code: 'SAND_CONCRETE',
    name: 'Pasir Beton / Pasir Cor',
    category: 'MATERIAL',
    standardUnit: 'm3',
    specification: 'SNI 03-2834-2000',
    aliases: ['pasir beton', 'pasir cor', 'pasir kasar', 'pasir lumajang', 'pasir hitam cor', 'pasir kali cor'],
  },
  {
    id: 'MAT_SAND_MASONRY',
    code: 'SAND_MASONRY',
    name: 'Pasir Pasang / Pasir Pasangan',
    category: 'MATERIAL',
    standardUnit: 'm3',
    specification: 'SNI 03-6861.1-2002',
    aliases: ['pasir pasang', 'pasir pasangan', 'pasir pasang kali', 'pasir plester'],
  },
  {
    id: 'MAT_SAND_BEDDING',
    code: 'SAND_BEDDING',
    name: 'Pasir Urug / Pasir Alas',
    category: 'MATERIAL',
    standardUnit: 'm3',
    specification: 'Standar Landasan Pasir PUPR',
    aliases: ['pasir urug', 'pasir alas', 'pasir uruk', 'tanah urug pasir'],
  },
  {
    id: 'MAT_SPLIT_STONE_2_3',
    code: 'SPLIT_STONE_2_3',
    name: 'Batu Pecah Mesin 20-30 mm (Split 2/3)',
    category: 'MATERIAL',
    standardUnit: 'm3',
    specification: 'Agregat Kasar Beton Struktur',
    aliases: ['split 2/3', 'batu split 2/3', 'batu pecah 2/3', 'batu split', 'split beton', 'agregat kasar 20-30'],
  },
  {
    id: 'MAT_SPLIT_STONE_1_2',
    code: 'SPLIT_STONE_1_2',
    name: 'Batu Pecah Mesin 10-20 mm (Split 1/2)',
    category: 'MATERIAL',
    standardUnit: 'm3',
    specification: 'Agregat Kasar Beton Halus',
    aliases: ['split 1/2', 'batu split 1/2', 'batu pecah 1/2'],
  },
  {
    id: 'MAT_BOULDER_STONE',
    code: 'BOULDER_STONE',
    name: 'Batu Belah 15/20 cm (Batu Kali)',
    category: 'MATERIAL',
    standardUnit: 'm3',
    specification: 'Batu Belah Fondasi & Pasangan',
    aliases: ['batu belah', 'batu kali', 'batu belah 15/20', 'batu belah pondasi', 'batu gunung'],
  },
  {
    id: 'MAT_REBAR_DEFORMED',
    code: 'REBAR_DEFORMED',
    name: 'Besi Beton Ulir (BJTS 420B)',
    category: 'MATERIAL',
    standardUnit: 'kg',
    specification: 'SNI 2052:2017 BJTS 420B',
    aliases: ['besi beton ulir', 'besi ulir', 'bjts 420b', 'besi d16', 'besi d13', 'besi d19', 'besi tulangan ulir', 'baja tulangan sirip'],
  },
  {
    id: 'MAT_REBAR_ROUND',
    code: 'REBAR_ROUND',
    name: 'Besi Beton Polos (BJTP 280)',
    category: 'MATERIAL',
    standardUnit: 'kg',
    specification: 'SNI 2052:2017 BJTP 280',
    aliases: ['besi beton polos', 'besi polos', 'bjtp 280', 'besi d8', 'besi d10', 'besi d6', 'besi begel', 'besi sengkang'],
  },
  {
    id: 'MAT_BINDING_WIRE',
    code: 'BINDING_WIRE',
    name: 'Kawat Beton / Kawat Bendrat',
    category: 'MATERIAL',
    standardUnit: 'kg',
    specification: 'Kawat Ikat Tulangan',
    aliases: ['kawat bendrat', 'kawat beton', 'kawat ikat', 'kawat pengikat besi'],
  },
  {
    id: 'MAT_FORMWORK_WOOD',
    code: 'FORMWORK_WOOD',
    name: 'Kayu Papan Bekisting / Kayu Kelas III',
    category: 'MATERIAL',
    standardUnit: 'm3',
    specification: 'Kayu Papan 2/20 atau 3/20 Terentang',
    aliases: ['kayu bekisting', 'kayu papan bekisting', 'kayu kelas iii', 'papan bekisting', 'kayu cor'],
  },
  {
    id: 'MAT_PLYWOOD_9MM',
    code: 'PLYWOOD_9MM',
    name: 'Papan Multiplek / Plywood Tebal 9 mm',
    category: 'MATERIAL',
    standardUnit: 'lbr',
    specification: 'Plywood Acuan Halus',
    aliases: ['multiplek 9mm', 'plywood 9mm', 'triplek 9mm', 'multiplek cor'],
  },
  {
    id: 'MAT_WATERSTOP_PVC_200',
    code: 'WATERSTOP_PVC_200',
    name: 'Waterstop PVC Lebar 200 mm',
    category: 'MATERIAL',
    standardUnit: 'm',
    specification: 'Waterstop Sambungan Dilatasi Beton Hidraulik',
    aliases: ['waterstop', 'waterstop pvc', 'waterstop 200mm', 'waterstop pvc 200mm', 'sealer joint'],
  },
  {
    id: 'MAT_JOINT_FILLER',
    code: 'JOINT_FILLER',
    name: 'Bahan Pengisi Sambungan / Dilatasi Joint Filler',
    category: 'MATERIAL',
    standardUnit: 'm',
    specification: 'Expansion Joint Filler',
    aliases: ['joint filler', 'dilatasi joint', 'pengisi celah dilatasi', 'expansion joint'],
  },
  {
    id: 'MAT_PRECAST_U_DITCH_60',
    code: 'PRECAST_U_DITCH_60',
    name: 'Saluran U-Ditch Pracetak 60x60x120 cm',
    category: 'MATERIAL',
    standardUnit: 'unit',
    specification: 'Saluran Precast K-350',
    aliases: ['u-ditch 60', 'u-ditch 60x60', 'u-ditch precast', 'saluran u-ditch', 'uditch 60'],
  },
  {
    id: 'MAT_PRECAST_BOX_CULVERT_150',
    code: 'PRECAST_BOX_CULVERT_150',
    name: 'Box Culvert Pracetak 150x150x100 cm',
    category: 'MATERIAL',
    standardUnit: 'unit',
    specification: 'Gorong-gorong Persegi Precast K-400',
    aliases: ['box culvert 150', 'box culvert precast', 'gorong-gorong box', 'unit box culvert'],
  },

  // -------------------------------------------------------------
  // LABOR
  // -------------------------------------------------------------
  {
    id: 'LAB_WORKER',
    code: 'LABOR_WORKER',
    name: 'Pekerja Konstruksi / Tenaga Kasar',
    category: 'LABOR',
    standardUnit: 'OH',
    specification: 'SE 12/SE/Db/2026',
    aliases: ['pekerja', 'pekerja biasa', 'pekerja konstruksi', 'buruh', 'tenaga kasar', 'l.01'],
  },
  {
    id: 'LAB_MASON',
    code: 'LABOR_MASON',
    name: 'Tukang Batu / Tukang Beton',
    category: 'LABOR',
    standardUnit: 'OH',
    specification: 'SE 12/SE/Db/2026',
    aliases: ['tukang batu', 'tukang', 'tukang cor', 'tukang beton', 'tukang gali', 'l.02'],
  },
  {
    id: 'LAB_IRONWORKER',
    code: 'LABOR_IRONWORKER',
    name: 'Tukang Besi / Pembesian',
    category: 'LABOR',
    standardUnit: 'OH',
    specification: 'SE 12/SE/Db/2026',
    aliases: ['tukang besi', 'tukang rakit besi', 'tukang pembesian'],
  },
  {
    id: 'LAB_CARPENTER',
    code: 'LABOR_CARPENTER',
    name: 'Tukang Kayu / Bekisting',
    category: 'LABOR',
    standardUnit: 'OH',
    specification: 'SE 12/SE/Db/2026',
    aliases: ['tukang kayu', 'tukang bekisting'],
  },
  {
    id: 'LAB_CHIEF_MASON',
    code: 'LABOR_CHIEF_MASON',
    name: 'Kepala Tukang',
    category: 'LABOR',
    standardUnit: 'OH',
    specification: 'SE 12/SE/Db/2026',
    aliases: ['kepala tukang', 'kepala tukang batu', 'kepala tukang besi', 'l.03'],
  },
  {
    id: 'LAB_FOREMAN',
    code: 'LABOR_FOREMAN',
    name: 'Mandor Lapangan',
    category: 'LABOR',
    standardUnit: 'OH',
    specification: 'SE 12/SE/Db/2026',
    aliases: ['mandor', 'mandor lapangan', 'pengawas lapangan', 'l.04'],
  },

  // -------------------------------------------------------------
  // EQUIPMENT
  // -------------------------------------------------------------
  {
    id: 'EQ_CONCRETE_MIXER',
    code: 'CONCRETE_MIXER',
    name: 'Concrete Mixer 0.35 m³ / Molen',
    category: 'EQUIPMENT',
    standardUnit: 'jam',
    specification: 'Mesin Pengaduk Beton 350-500 Liter',
    aliases: ['concrete mixer', 'molen', 'beton molen', 'mesin molen', 'e.01', 'e-01'],
  },
  {
    id: 'EQ_CONCRETE_VIBRATOR',
    code: 'CONCRETE_VIBRATOR',
    name: 'Concrete Vibrator',
    category: 'EQUIPMENT',
    standardUnit: 'jam',
    specification: 'Penggetar Beton Mekanis',
    aliases: ['concrete vibrator', 'vibrator beton', 'mesin vibrator'],
  },
  {
    id: 'EQ_EXCAVATOR',
    code: 'EXCAVATOR',
    name: 'Excavator 80-140 HP (0.8 - 0.93 m³)',
    category: 'EQUIPMENT',
    standardUnit: 'jam',
    specification: 'Alat Gali Hidraulik',
    aliases: ['excavator', 'alat gali', 'backhoe', 'excavator 0.8m3'],
  },
  {
    id: 'EQ_DUMP_TRUCK',
    code: 'DUMP_TRUCK',
    name: 'Dump Truck 6 - 8 Ton',
    category: 'EQUIPMENT',
    standardUnit: 'jam',
    specification: 'Truk Pengangkut Material',
    aliases: ['dump truck', 'truk jungkit', 'dump truck 6-8 ton', 'dump truck 10 ton'],
  },
  {
    id: 'EQ_VIBRATORY_ROLLER',
    code: 'VIBRATORY_ROLLER',
    name: 'Vibratory Roller 5 - 8 Ton',
    category: 'EQUIPMENT',
    standardUnit: 'jam',
    specification: 'Alat Pemadat Getar',
    aliases: ['vibratory roller', 'vibro roller', 'pemadat vibro', 'mesin gilas'],
  },
  {
    id: 'EQ_WATER_PUMP',
    code: 'WATER_PUMP',
    name: 'Pompa Air 70-100 mm / Dewatering Pump',
    category: 'EQUIPMENT',
    standardUnit: 'jam',
    specification: 'Pompa Pengeringan Air Galian',
    aliases: ['pompa air', 'pompa dewatering', 'water pump', 'pompa sedot air'],
  },
];

export class CanonicalResourceRegistry {
  private static instance: CanonicalResourceRegistry;
  private byCode: Map<string, CanonicalResource> = new Map();
  private aliasMap: Map<string, CanonicalResource> = new Map();

  private constructor() {
    this.init();
  }

  public static getInstance(): CanonicalResourceRegistry {
    if (!CanonicalResourceRegistry.instance) {
      CanonicalResourceRegistry.instance = new CanonicalResourceRegistry();
    }
    return CanonicalResourceRegistry.instance;
  }

  private init() {
    for (const res of CANONICAL_RESOURCES) {
      this.byCode.set(res.code.toUpperCase(), res);
      this.byCode.set(res.id.toUpperCase(), res);
      // Index name
      const normName = res.name.toLowerCase().trim();
      this.aliasMap.set(normName, res);

      // Index aliases
      for (const al of res.aliases) {
        this.aliasMap.set(al.toLowerCase().trim(), res);
      }
    }
  }

  public resolveCanonical(query: string): CanonicalResource | null {
    if (!query) return null;
    const clean = query.toLowerCase().trim();

    // 1. Direct alias / normalized name match
    if (this.aliasMap.has(clean)) {
      return this.aliasMap.get(clean)!;
    }

    // 2. Direct code match
    const codeMatch = this.byCode.get(clean.toUpperCase());
    if (codeMatch) return codeMatch;

    // 3. Substring match
    for (const [alias, res] of this.aliasMap.entries()) {
      if (clean.includes(alias) || alias.includes(clean)) {
        return res;
      }
    }

    return null;
  }

  public getAll(): CanonicalResource[] {
    // Return unique items
    const seen = new Set<string>();
    const res: CanonicalResource[] = [];
    for (const item of CANONICAL_RESOURCES) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        res.push(item);
      }
    }
    return res;
  }
}

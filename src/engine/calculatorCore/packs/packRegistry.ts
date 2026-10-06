/**
 * EZRAB CALCULATOR CORE — PACK REGISTRY
 * Manages modular domain packs (Building, Road, Paving, Water Structure, Bridge, Steel).
 */

import { CalculatorPack, ReadinessStatus } from '../contracts/types';

export const BUILTIN_PACKS: CalculatorPack[] = [
  {
    id: 'building',
    name: 'Building & Housing Pack',
    description: 'Volume and QTO calculators for residential and commercial building construction (Structure, Architecture, MEP, Finishing).',
    version: '1.0.0',
    author: 'EZRAB Core Engineering',
    category: 'building',
    status: 'PARTIALLY_VERIFIED',
    calculatorIds: [
      'BOWPLANK',
      'PONDASI_BATU_KALI',
      'FOOT_PLATE',
      'SLOOF',
      'KOLOM',
      'BALOK',
      'BATA_RINGAN',
      'BATA_MERAH',
      'BATAKO',
      'PINTU_JENDELA',
      'ATAP_BAJA_RINGAN',
      'PLESTERAN_ACIAN',
      'PENUTUP_LANTAI',
      'PENUTUP_DINDING',
      'PLAFON',
      'PENGECATAN',
      'KELISTRIKAN',
      'INSTALASI_AIR',
      'SANITAIR',
      'building.earthwork.galian',
      'building.fence',
    ],
    tags: ['gedung', 'rumah', 'struktur', 'arsitektur', 'mep', 'finishing'],
  },
  {
    id: 'road',
    name: 'Road & Highway Infrastructure Pack',
    description: 'Calculators for road alignment, geometric area, pavement layers, subbase, and asphalt volumes.',
    version: '0.1.0',
    author: 'EZRAB Core Engineering',
    category: 'infrastructure',
    status: 'UNVERIFIED',
    calculatorIds: ['road.geometry'],
    tags: ['jalan', 'perkerasan', 'hotmix', 'agregat', 'infrastruktur'],
  },
  {
    id: 'paving',
    name: 'Paving & Hardscape Pack',
    description: 'Calculators for concrete block paving, bedding sand, subbase, and perimeter curb restraints.',
    version: '0.1.0',
    author: 'EZRAB Core Engineering',
    category: 'landscape',
    status: 'UNVERIFIED',
    calculatorIds: ['paving.geometry'],
    tags: ['paving', 'conblock', 'halaman', 'trotoar', 'hardscape'],
  },
  {
    id: 'water-structure',
    name: 'Water Structure & Drainage Pack',
    description: 'Calculators for precast U-Ditch, culverts, retention basins, and stormwater channels.',
    version: '0.1.0',
    author: 'EZRAB Core Engineering',
    category: 'infrastructure',
    status: 'PARTIALLY_VERIFIED',
    calculatorIds: ['UDITCH'],
    tags: ['saluran', 'uditch', 'drainase', 'irigasi'],
  },
  {
    id: 'bridge',
    name: 'Bridge & Crossing Pack',
    description: 'Calculators for bridge abutments, pier caps, girder decks, and bearing pads.',
    version: '0.0.1',
    author: 'EZRAB Core Engineering',
    category: 'infrastructure',
    status: 'NOT_APPLICABLE',
    calculatorIds: [],
    tags: ['jembatan', 'abutment', 'girder'],
  },
  {
    id: 'steel',
    name: 'Structural Steel & Metalwork Pack',
    description: 'Calculators for standard structural steel profiles (WF, H-Beam, CNP, UNP, RHS, SHS, Angle).',
    version: '0.1.0',
    author: 'EZRAB Core Engineering',
    category: 'structure',
    status: 'UNVERIFIED',
    calculatorIds: ['BAJA_WF'],
    tags: ['baja', 'wf', 'hbeam', 'cnp', 'konstruksi-baja'],
  },
];

export class PackRegistry {
  private static packs: Map<string, CalculatorPack> = new Map();

  static {
    for (const pack of BUILTIN_PACKS) {
      PackRegistry.registerPack(pack);
    }
  }

  public static registerPack(pack: CalculatorPack): void {
    PackRegistry.packs.set(pack.id.toLowerCase(), pack);
  }

  public static getPack(packId: string): CalculatorPack | undefined {
    return PackRegistry.packs.get(packId.toLowerCase());
  }

  public static listPacks(): CalculatorPack[] {
    return Array.from(PackRegistry.packs.values());
  }

  public static hasPack(packId: string): boolean {
    return PackRegistry.packs.has(packId.toLowerCase());
  }

  public static addCalculatorToPack(packId: string, calculatorId: string): void {
    const pack = PackRegistry.getPack(packId);
    if (pack && !pack.calculatorIds.includes(calculatorId)) {
      pack.calculatorIds.push(calculatorId);
    }
  }
}

/**
 * Scope-to-AHSP Mapping Registry
 * ================================
 *
 * Maps construction scope items to AHSP codes from the official dataset.
 * This is a living registry — it should be expanded as more calculators
 * are connected to the CostPolicyEngine.
 *
 * Domain: BINA_MARGA (Lampiran II SE DJBK No. 47/SE/Dk/2026)
 *
 * Design:
 * - Each scope item has a canonical AHSP code.
 * - Fallback codes are provided for cases where the primary code is
 *   UNREADABLE or not available.
 * - The registry is versioned per AHSP edition.
 */

export interface ScopeMapping {
  scopeId: string;
  scopeName: string;
  domain: 'BINA_MARGA' | 'SDA' | 'CIPTA_KARYA' | 'UMUM';
  primaryCode: string;
  fallbackCodes: string[];
  unit: string;
  description: string;
}

export const SCOPE_AHSP_REGISTRY: ScopeMapping[] = [
  // === EARTHWORK & EXCAVATION ===
  {
    scopeId: 'excavation-trench',
    scopeName: 'Galian Selokan Drainase dan Saluran Air',
    domain: 'BINA_MARGA',
    primaryCode: '2.1.(1)',
    fallbackCodes: ['2.1.(2)'],
    unit: 'M3',
    description: 'Galian untuk selokan drainase dan saluran air dengan kedalaman < 1 m',
  },
  {
    scopeId: 'excavation-foundation',
    scopeName: 'Galian Pondasi Bangunan',
    domain: 'BINA_MARGA',
    primaryCode: '2.1.(3)',
    fallbackCodes: ['2.1.(4)', '2.1.(5)'],
    unit: 'M3',
    description: 'Galian pondasi bangunan dengan kedalaman 1-3 m',
  },
  {
    scopeId: 'backfill-sand',
    scopeName: 'Urugan Pasir',
    domain: 'BINA_MARGA',
    primaryCode: '2.2.(1)',
    fallbackCodes: ['2.2.(2)'],
    unit: 'M3',
    description: 'Urugan pasir untuk fondasi dan lantai kerja',
  },
  {
    scopeId: 'backfill-soil',
    scopeName: 'Urugan Tanah',
    domain: 'BINA_MARGA',
    primaryCode: '2.2.(3)',
    fallbackCodes: ['2.2.(4)'],
    unit: 'M3',
    description: 'Urugan tanah kembali (backfill)',
  },

  // === CONCRETE WORKS ===
  {
    scopeId: 'concrete-k-175',
    scopeName: 'Beton K-175',
    domain: 'BINA_MARGA',
    primaryCode: '3.1.(1)',
    fallbackCodes: ['3.1.(2)'],
    unit: 'M3',
    description: 'Beton mutu K-175 untuk pekerjaan umum',
  },
  {
    scopeId: 'concrete-k-225',
    scopeName: 'Beton K-225',
    domain: 'BINA_MARGA',
    primaryCode: '3.1.(3)',
    fallbackCodes: ['3.1.(4)'],
    unit: 'M3',
    description: 'Beton mutu K-225 untuk struktur umum',
  },
  {
    scopeId: 'concrete-k-250',
    scopeName: 'Beton K-250',
    domain: 'BINA_MARGA',
    primaryCode: '3.1.(5)',
    fallbackCodes: ['3.1.(6)'],
    unit: 'M3',
    description: 'Beton mutu K-250 untuk struktur memerlukan kekuatan sedang',
  },
  {
    scopeId: 'concrete-k-300',
    scopeName: 'Beton K-300',
    domain: 'BINA_MARGA',
    primaryCode: '3.1.(7)',
    fallbackCodes: ['3.1.(8)'],
    unit: 'M3',
    description: 'Beton mutu K-300 untuk struktur memerlukan kekuatan tinggi',
  },
  {
    scopeId: 'concrete-k-350',
    scopeName: 'Beton K-350',
    domain: 'BINA_MARGA',
    primaryCode: '3.1.(9)',
    fallbackCodes: ['3.1.(10)'],
    unit: 'M3',
    description: 'Beton mutu K-350 untuk struktur memerlukan kekuatan sangat tinggi',
  },

  // === REINFORCEMENT ===
  {
    scopeId: 'reinforcement-steel',
    scopeName: 'Pembesian Baja Tulangan',
    domain: 'BINA_MARGA',
    primaryCode: '3.2.(1)',
    fallbackCodes: ['3.2.(2)', '3.2.(3)'],
    unit: 'KG',
    description: 'Pembesian dengan baja tulangan polos / ulir',
  },

  // === FORMWORK ===
  {
    scopeId: 'formwork-plain',
    scopeName: 'Bekisting Kayu untuk Beton',
    domain: 'BINA_MARGA',
    primaryCode: '3.3.(1)',
    fallbackCodes: ['3.3.(2)'],
    unit: 'M2',
    description: 'Bekisting kayu untuk permukaan beton biasa',
  },

  // === MASONRY ===
  {
    scopeId: 'masonry-stone-1-3',
    scopeName: 'Pasangan Batu Kali 1:3',
    domain: 'BINA_MARGA',
    primaryCode: '4.1.(1)',
    fallbackCodes: ['4.1.(2)'],
    unit: 'M3',
    description: 'Pasangan batu kali dengan mortar 1 PC : 3 Pasir',
  },
  {
    scopeId: 'masonry-stone-1-4',
    scopeName: 'Pasangan Batu Kali 1:4',
    domain: 'BINA_MARGA',
    primaryCode: '4.1.(3)',
    fallbackCodes: ['4.1.(4)'],
    unit: 'M3',
    description: 'Pasangan batu kali dengan mortar 1 PC : 4 Pasir',
  },

  // === GROUTING & JOINTS ===
  {
    scopeId: 'grouting-cement',
    scopeName: 'Grouting Semen',
    domain: 'BINA_MARGA',
    primaryCode: '5.1.(1)',
    fallbackCodes: [],
    unit: 'M3',
    description: 'Grouting dengan semen untuk injeksi batu / beton',
  },

  // === HYDROMECHANICAL ===
  {
    scopeId: 'gate-sliding',
    scopeName: 'Pintu Air Geser (Sliding Gate)',
    domain: 'BINA_MARGA',
    primaryCode: '6.1.(1)',
    fallbackCodes: ['6.1.(2)'],
    unit: 'BUAH',
    description: 'Pemasangan pintu air geser dengan rangka baja',
  },

  // === DISPOSAL ===
  {
    scopeId: 'disposal-soil',
    scopeName: 'Pembuangan Tanah Galian',
    domain: 'BINA_MARGA',
    primaryCode: '2.3.(1)',
    fallbackCodes: ['2.3.(2)'],
    unit: 'M3',
    description: 'Pembuangan / pengangkutan tanah galian ke lokasi pembuangan',
  },

  // === DEWATERING ===
  {
    scopeId: 'dewatering-wellpoint',
    scopeName: 'Dewatering dengan Wellpoint',
    domain: 'BINA_MARGA',
    primaryCode: '2.4.(1)',
    fallbackCodes: ['2.4.(2)'],
    unit: 'JAM',
    description: 'Pompa dewatering wellpoint untuk pengurangan muka air tanah',
  },

  // === TEMPORARY WORKS ===
  {
    scopeId: 'temporary-cofferdam',
    scopeName: 'Pekerjaan Cofferdam Sementara',
    domain: 'BINA_MARGA',
    primaryCode: '7.1.(1)',
    fallbackCodes: ['7.1.(2)'],
    unit: 'M2',
    description: 'Pemasangan dan pembongkaran cofferdam untuk pekerjaan di dalam air',
  },

  // === SAFETY / SMKK ===
  {
    scopeId: 'safety-smkk',
    scopeName: 'Biaya SMKK (K3)',
    domain: 'UMUM',
    primaryCode: 'SMKK-001',
    fallbackCodes: [],
    unit: 'LS',
    description: 'Biaya Keselamatan dan Kesehatan Kerja (di luar AHSP Bina Marga)',
  },
];

/** Lookup by scopeId. */
export function findScopeMapping(scopeId: string): ScopeMapping | undefined {
  return SCOPE_AHSP_REGISTRY.find((s) => s.scopeId === scopeId);
}

/** Lookup by AHSP code. */
export function findScopeByCode(code: string): ScopeMapping | undefined {
  return SCOPE_AHSP_REGISTRY.find(
    (s) => s.primaryCode === code || s.fallbackCodes.includes(code)
  );
}

/**
 * EZRAB Construction Engine - WF Profile Registry
 * Authoritative Standard Profiles (SNI 07-7178-2006 / Gunung Garuda Catalog)
 * 
 * Status: PROPOSED / SEPARATELY SOURCED (Structural Steel WF Calculation Module)
 * Note: Master Excel Workbook does not contain an explicit WF sheet.
 * This registry provides standard steel beam/column dimensions and theoretical weights.
 */

export interface WFProfile {
  id: string;
  designation: string;
  depthMm: number;        // h (Tinggi profil)
  flangeWidthMm: number;  // bf (Lebar sayap)
  webThicknessMm: number; // tw (Tebal badan)
  flangeThicknessMm: number; // tf (Tebal sayap)
  weightKgPerM: number;   // Berat nominal kg/m
  source: string;
  sourceVersion: string;
  verified: boolean;
}

export const WF_PROFILE_REGISTRY: WFProfile[] = [
  {
    id: 'WF_100x50x5x7',
    designation: 'WF 100 x 50 x 5 x 7',
    depthMm: 100,
    flangeWidthMm: 50,
    webThicknessMm: 5,
    flangeThicknessMm: 7,
    weightKgPerM: 9.30,
    source: 'SNI 07-7178-2006 / Gunung Garuda Catalog',
    sourceVersion: 'SNI 07-7178-2006',
    verified: true,
  },
  {
    id: 'WF_125x60x6x8',
    designation: 'WF 125 x 60 x 6 x 8',
    depthMm: 125,
    flangeWidthMm: 60,
    webThicknessMm: 6,
    flangeThicknessMm: 8,
    weightKgPerM: 13.10,
    source: 'SNI 07-7178-2006 / Gunung Garuda Catalog',
    sourceVersion: 'SNI 07-7178-2006',
    verified: true,
  },
  {
    id: 'WF_148x100x6x9',
    designation: 'WF 148 x 100 x 6 x 9',
    depthMm: 148,
    flangeWidthMm: 100,
    webThicknessMm: 6,
    flangeThicknessMm: 9,
    weightKgPerM: 21.10,
    source: 'SNI 07-7178-2006 / Gunung Garuda Catalog',
    sourceVersion: 'SNI 07-7178-2006',
    verified: true,
  },
  {
    id: 'WF_150x75x5x7',
    designation: 'WF 150 x 75 x 5 x 7',
    depthMm: 150,
    flangeWidthMm: 75,
    webThicknessMm: 5,
    flangeThicknessMm: 7,
    weightKgPerM: 14.00,
    source: 'SNI 07-7178-2006 / Gunung Garuda Catalog',
    sourceVersion: 'SNI 07-7178-2006',
    verified: true,
  },
  {
    id: 'WF_175x90x5x8',
    designation: 'WF 175 x 90 x 5 x 8',
    depthMm: 175,
    flangeWidthMm: 90,
    webThicknessMm: 5,
    flangeThicknessMm: 8,
    weightKgPerM: 18.10,
    source: 'SNI 07-7178-2006 / Gunung Garuda Catalog',
    sourceVersion: 'SNI 07-7178-2006',
    verified: true,
  },
  {
    id: 'WF_198x99x4.5x7',
    designation: 'WF 198 x 99 x 4.5 x 7',
    depthMm: 198,
    flangeWidthMm: 99,
    webThicknessMm: 4.5,
    flangeThicknessMm: 7,
    weightKgPerM: 18.20,
    source: 'SNI 07-7178-2006 / Gunung Garuda Catalog',
    sourceVersion: 'SNI 07-7178-2006',
    verified: true,
  },
  {
    id: 'WF_200x100x5.5x8',
    designation: 'WF 200 x 100 x 5.5 x 8',
    depthMm: 200,
    flangeWidthMm: 100,
    webThicknessMm: 5.5,
    flangeThicknessMm: 8,
    weightKgPerM: 21.30,
    source: 'SNI 07-7178-2006 / Gunung Garuda Catalog',
    sourceVersion: 'SNI 07-7178-2006',
    verified: true,
  },
  {
    id: 'WF_248x124x5x8',
    designation: 'WF 248 x 124 x 5 x 8',
    depthMm: 248,
    flangeWidthMm: 124,
    webThicknessMm: 5,
    flangeThicknessMm: 8,
    weightKgPerM: 25.70,
    source: 'SNI 07-7178-2006 / Gunung Garuda Catalog',
    sourceVersion: 'SNI 07-7178-2006',
    verified: true,
  },
  {
    id: 'WF_250x125x6x9',
    designation: 'WF 250 x 125 x 6 x 9',
    depthMm: 250,
    flangeWidthMm: 125,
    webThicknessMm: 6,
    flangeThicknessMm: 9,
    weightKgPerM: 29.60,
    source: 'SNI 07-7178-2006 / Gunung Garuda Catalog',
    sourceVersion: 'SNI 07-7178-2006',
    verified: true,
  },
  {
    id: 'WF_298x149x5.5x8',
    designation: 'WF 298 x 149 x 5.5 x 8',
    depthMm: 298,
    flangeWidthMm: 149,
    webThicknessMm: 5.5,
    flangeThicknessMm: 8,
    weightKgPerM: 32.00,
    source: 'SNI 07-7178-2006 / Gunung Garuda Catalog',
    sourceVersion: 'SNI 07-7178-2006',
    verified: true,
  },
  {
    id: 'WF_300x150x6.5x9',
    designation: 'WF 300 x 150 x 6.5 x 9',
    depthMm: 300,
    flangeWidthMm: 150,
    webThicknessMm: 6.5,
    flangeThicknessMm: 9,
    weightKgPerM: 36.70,
    source: 'SNI 07-7178-2006 / Gunung Garuda Catalog',
    sourceVersion: 'SNI 07-7178-2006',
    verified: true,
  },
  {
    id: 'WF_346x174x6x9',
    designation: 'WF 346 x 174 x 6 x 9',
    depthMm: 346,
    flangeWidthMm: 174,
    webThicknessMm: 6,
    flangeThicknessMm: 9,
    weightKgPerM: 41.40,
    source: 'SNI 07-7178-2006 / Gunung Garuda Catalog',
    sourceVersion: 'SNI 07-7178-2006',
    verified: true,
  },
  {
    id: 'WF_350x175x7x11',
    designation: 'WF 350 x 175 x 7 x 11',
    depthMm: 350,
    flangeWidthMm: 175,
    webThicknessMm: 7,
    flangeThicknessMm: 11,
    weightKgPerM: 49.60,
    source: 'SNI 07-7178-2006 / Gunung Garuda Catalog',
    sourceVersion: 'SNI 07-7178-2006',
    verified: true,
  },
  {
    id: 'WF_396x199x7x11',
    designation: 'WF 396 x 199 x 7 x 11',
    depthMm: 396,
    flangeWidthMm: 199,
    webThicknessMm: 7,
    flangeThicknessMm: 11,
    weightKgPerM: 56.60,
    source: 'SNI 07-7178-2006 / Gunung Garuda Catalog',
    sourceVersion: 'SNI 07-7178-2006',
    verified: true,
  },
  {
    id: 'WF_400x200x8x13',
    designation: 'WF 400 x 200 x 8 x 13',
    depthMm: 400,
    flangeWidthMm: 200,
    webThicknessMm: 8,
    flangeThicknessMm: 13,
    weightKgPerM: 66.00,
    source: 'SNI 07-7178-2006 / Gunung Garuda Catalog',
    sourceVersion: 'SNI 07-7178-2006',
    verified: true,
  },
  {
    id: 'WF_446x199x8x12',
    designation: 'WF 446 x 199 x 8 x 12',
    depthMm: 446,
    flangeWidthMm: 199,
    webThicknessMm: 8,
    flangeThicknessMm: 12,
    weightKgPerM: 66.20,
    source: 'SNI 07-7178-2006 / Gunung Garuda Catalog',
    sourceVersion: 'SNI 07-7178-2006',
    verified: true,
  },
  {
    id: 'WF_450x200x9x14',
    designation: 'WF 450 x 200 x 9 x 14',
    depthMm: 450,
    flangeWidthMm: 200,
    webThicknessMm: 9,
    flangeThicknessMm: 14,
    weightKgPerM: 76.00,
    source: 'SNI 07-7178-2006 / Gunung Garuda Catalog',
    sourceVersion: 'SNI 07-7178-2006',
    verified: true,
  },
  {
    id: 'WF_496x199x9x14',
    designation: 'WF 496 x 199 x 9 x 14',
    depthMm: 496,
    flangeWidthMm: 199,
    webThicknessMm: 9,
    flangeThicknessMm: 14,
    weightKgPerM: 79.50,
    source: 'SNI 07-7178-2006 / Gunung Garuda Catalog',
    sourceVersion: 'SNI 07-7178-2006',
    verified: true,
  },
  {
    id: 'WF_500x200x10x16',
    designation: 'WF 500 x 200 x 10 x 16',
    depthMm: 500,
    flangeWidthMm: 200,
    webThicknessMm: 10,
    flangeThicknessMm: 16,
    weightKgPerM: 89.60,
    source: 'SNI 07-7178-2006 / Gunung Garuda Catalog',
    sourceVersion: 'SNI 07-7178-2006',
    verified: true,
  },
  {
    id: 'WF_588x300x12x20',
    designation: 'WF 588 x 300 x 12 x 20',
    depthMm: 588,
    flangeWidthMm: 300,
    webThicknessMm: 12,
    flangeThicknessMm: 20,
    weightKgPerM: 151.00,
    source: 'SNI 07-7178-2006 / Gunung Garuda Catalog',
    sourceVersion: 'SNI 07-7178-2006',
    verified: true,
  },
  {
    id: 'WF_596x199x10x15',
    designation: 'WF 596 x 199 x 10 x 15',
    depthMm: 596,
    flangeWidthMm: 199,
    webThicknessMm: 10,
    flangeThicknessMm: 15,
    weightKgPerM: 94.60,
    source: 'SNI 07-7178-2006 / Gunung Garuda Catalog',
    sourceVersion: 'SNI 07-7178-2006',
    verified: true,
  },
  {
    id: 'WF_600x200x11x17',
    designation: 'WF 600 x 200 x 11 x 17',
    depthMm: 600,
    flangeWidthMm: 200,
    webThicknessMm: 11,
    flangeThicknessMm: 17,
    weightKgPerM: 106.00,
    source: 'SNI 07-7178-2006 / Gunung Garuda Catalog',
    sourceVersion: 'SNI 07-7178-2006',
    verified: true,
  },
  {
    id: 'WF_700x300x13x24',
    designation: 'WF 700 x 300 x 13 x 24',
    depthMm: 700,
    flangeWidthMm: 300,
    webThicknessMm: 13,
    flangeThicknessMm: 24,
    weightKgPerM: 185.00,
    source: 'SNI 07-7178-2006 / Gunung Garuda Catalog',
    sourceVersion: 'SNI 07-7178-2006',
    verified: true,
  },
  {
    id: 'WF_800x300x14x26',
    designation: 'WF 800 x 300 x 14 x 26',
    depthMm: 800,
    flangeWidthMm: 300,
    webThicknessMm: 14,
    flangeThicknessMm: 26,
    weightKgPerM: 210.00,
    source: 'SNI 07-7178-2006 / Gunung Garuda Catalog',
    sourceVersion: 'SNI 07-7178-2006',
    verified: true,
  },
  {
    id: 'WF_900x300x16x28',
    designation: 'WF 900 x 300 x 16 x 28',
    depthMm: 900,
    flangeWidthMm: 300,
    webThicknessMm: 16,
    flangeThicknessMm: 28,
    weightKgPerM: 243.00,
    source: 'SNI 07-7178-2006 / Gunung Garuda Catalog',
    sourceVersion: 'SNI 07-7178-2006',
    verified: true,
  },
];

/**
 * Calculate theoretical area and nominal weight per meter for custom/unlisted WF profile
 * Formula: A = 2 * bf * tf + (h - 2 * tf) * tw (in mm²)
 * kg/m = A * 0.00785 (steel density 7850 kg/m³)
 */
export function calculateTheoreticalWfWeight(
  hMm: number,
  bfMm: number,
  twMm: number,
  tfMm: number
): { areaMm2: number; theoreticalKgPerM: number } {
  // Area in mm² = 2 flanges + web
  const flangeArea = 2 * bfMm * tfMm;
  const webHeight = Math.max(0, hMm - 2 * tfMm);
  const webArea = webHeight * twMm;
  const totalAreaMm2 = flangeArea + webArea;

  // Weight kg/m = Area (mm²) * 7850 kg/m³ * 1e-6 m²/mm² = Area * 0.00785
  const theoreticalKgPerM = totalAreaMm2 * 0.00785;

  return {
    areaMm2: Math.round(totalAreaMm2 * 100) / 100,
    theoreticalKgPerM: Math.round(theoreticalKgPerM * 1000) / 1000,
  };
}

export function findWfProfile(idOrDesignation: string): WFProfile | undefined {
  const norm = idOrDesignation.trim().toLowerCase();
  return WF_PROFILE_REGISTRY.find(
    (p) =>
      p.id.toLowerCase() === norm ||
      p.designation.toLowerCase() === norm ||
      p.id.toLowerCase().replace(/_/g, ' ') === norm
  );
}

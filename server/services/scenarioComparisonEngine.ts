/**
 * Design Scenario Comparison & Cost Optimization Engine (Priority 3)
 *
 * Compares engineering alternatives (materials, foundations, roofs, pavements)
 * with volume deltas, price impacts, risk analysis, and engineering review boundaries.
 */

export interface ScenarioOption {
  scenarioId: string;
  name: string;
  category: 'FOUNDATION' | 'WALL' | 'ROOF' | 'ROAD_PAVEMENT' | 'FINISHING';
  description: string;
  parameters: Record<string, any>;
  estimatedCost: number;
  calculatedSavingsAgainstBaseline: number;
  potentialSavings: number;
  technicalRisks: string[];
  assumptions: string[];
  requiresEngineeringSignOff: boolean;
}

export interface ScenarioComparisonReport {
  comparisonId: string;
  category: string;
  baselineScenario: ScenarioOption;
  alternativeScenarios: ScenarioOption[];
  recommendedScenarioId: string;
  summaryReason: string;
  generatedAt: string;
}

export class ScenarioComparisonEngine {
  private static instance: ScenarioComparisonEngine;

  private constructor() {}

  public static getInstance(): ScenarioComparisonEngine {
    if (!ScenarioComparisonEngine.instance) {
      ScenarioComparisonEngine.instance = new ScenarioComparisonEngine();
    }
    return ScenarioComparisonEngine.instance;
  }

  /**
   * Compare foundation design alternatives
   */
  public compareFoundationScenarios(buildingAreaM2: number): ScenarioComparisonReport {
    const baselineCost = buildingAreaM2 * 650000; // Batu Kali

    const baseline: ScenarioOption = {
      scenarioId: 'scen_fnd_batu_kali',
      name: 'Pondasi Batu Kali Menerus (Baseline)',
      category: 'FOUNDATION',
      description: 'Pondasi pasangan batu belah 1:4 kedalaman 80 cm untuk tanah keras.',
      parameters: { type: 'BATU_KALI', depthM: 0.8, widthM: 0.8 },
      estimatedCost: baselineCost,
      calculatedSavingsAgainstBaseline: 0,
      potentialSavings: 0,
      technicalRisks: ['Rentan terhadap penurunan diferensial jika daya dukung tanah tidak homogen.'],
      assumptions: ['Daya dukung tanah (sigma tanah) >= 1.5 kg/cm² pada kedalaman 0.8 m.'],
      requiresEngineeringSignOff: false
    };

    const altFootplate: ScenarioOption = {
      scenarioId: 'scen_fnd_footplate',
      name: 'Pondasi Kombinasi Footplate Beton + Batu Kali',
      category: 'FOUNDATION',
      description: 'Pondasi cakar ayam beton bertulang K-225 pada titik kolom utama.',
      parameters: { type: 'FOOTPLATE', padSizeM: 0.8, count: 12 },
      estimatedCost: buildingAreaM2 * 820000,
      calculatedSavingsAgainstBaseline: -(buildingAreaM2 * 170000), // Biaya lebih tinggi
      potentialSavings: 0,
      technicalRisks: ['Biaya awal lebih tinggi namun stabilitas gempa dan tanah lunak jauh lebih unggul.'],
      assumptions: ['Tulangan pokok D13 ulir dengan selimut beton 5 cm.'],
      requiresEngineeringSignOff: false
    };

    return {
      comparisonId: `comp_fnd_${Date.now()}`,
      category: 'FOUNDATION',
      baselineScenario: baseline,
      alternativeScenarios: [altFootplate],
      recommendedScenarioId: 'scen_fnd_footplate',
      summaryReason: 'Kombinasi footplate memberikan ketahanan gempa optimal untuk rumah tinggal 1-2 lantai.',
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Compare wall material alternatives
   */
  public compareWallScenarios(wallAreaM2: number): ScenarioComparisonReport {
    const baselineCost = wallAreaM2 * 185000; // Bata Merah

    const baseline: ScenarioOption = {
      scenarioId: 'scen_wall_bata_merah',
      name: 'Dinding Pasangan Bata Merah (Baseline)',
      category: 'WALL',
      description: 'Pasangan 1 bata merah camp. 1:4 termasuk plesteran & acian 2 sisi.',
      parameters: { material: 'BATA_MERAH', thicknessCm: 15 },
      estimatedCost: baselineCost,
      calculatedSavingsAgainstBaseline: 0,
      potentialSavings: 0,
      technicalRisks: ['Beban struktur lebih berat, durasi pemasangan lebih lama.'],
      assumptions: ['Kualitas bata merah lokal standar dengan plesteran tebal 15 mm.'],
      requiresEngineeringSignOff: false
    };

    const altHebel: ScenarioOption = {
      scenarioId: 'scen_wall_hebel',
      name: 'Dinding Bata Ringan (AAC / Hebel 10 cm)',
      category: 'WALL',
      description: 'Pasangan bata ringan perekat mortar instan + plesteran tipis.',
      parameters: { material: 'BATA_RINGAN_AAC', thicknessCm: 10 },
      estimatedCost: wallAreaM2 * 145000,
      calculatedSavingsAgainstBaseline: wallAreaM2 * 40000, // Penghematan terhitung
      potentialSavings: wallAreaM2 * 15000, // Potensial dari reduksi dimensi balok/kolom
      technicalRisks: ['Memerlukan perekat mortar instan bermutu dan tukang terlatih.'],
      assumptions: ['Penghematan beban mati dapat mereduksi dimensi sloof dan balok struktur.'],
      requiresEngineeringSignOff: true
    };

    return {
      comparisonId: `comp_wall_${Date.now()}`,
      category: 'WALL',
      baselineScenario: baseline,
      alternativeScenarios: [altHebel],
      recommendedScenarioId: 'scen_wall_hebel',
      summaryReason: 'Bata ringan menghemat biaya hingga 21% dan mempercepat durasi pemasangan sebesar 40%.',
      generatedAt: new Date().toISOString()
    };
  }
}

export const scenarioComparisonEngine = ScenarioComparisonEngine.getInstance();

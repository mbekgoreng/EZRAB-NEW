/**
 * Scope-Based Cost Calculator
 * ============================
 *
 * Breaks a hydraulic structure (weir, dam, embung) into scope-based work items,
 * maps each to AHSP codes via the registry, and calculates cost via CostPolicyEngine.
 *
 * This replaces the old "concrete volume × unit price" approach with a proper
 * work breakdown that reflects real construction scope.
 */

import { CostPolicyEngine, CostEngineResult, WorkItem } from '../policy/costPolicyEngine';
import { OfficialAHSPItem } from '../../../data/nationalCostDatabase/binaMargaOfficialTypes';
import { PriceContext } from '../../pricing/contracts/types';
import { findScopeMapping } from './scopeAhspRegistry';
import { SafeDecimalEngine } from '../../safeDecimalEngine';

export interface WeirGeometryInput {
  weirLength: number;      // L — panjang mercu
  weirHeight: number;      // H — tinggi dari pondasi
  crestWidth: number;      // Wc — lebar puncak
  baseWidth: number;       // Wb — lebar dasar
  crestArcLength?: number; // La — panjang busur mercu
  skinThickness?: number;  // t — tebal beton tahan aus
  apronWidth?: number;     // W — lebar apron
  apronLength?: number;    // L — panjang apron
  apronThickness?: number; // t — tebal apron
  basinWidth?: number;     // Wb — lebar kolam olak
  basinLength?: number;    // Lb — panjang kolam olak
  basinSlabThickness?: number; // ts — tebal plat kolam
  endSillHeight?: number;  // He — tinggi end sill
}

export interface ScopeBreakdown {
  scopeId: string;
  scopeName: string;
  workItems: WorkItem[];
}

export interface ScopeCostResult {
  structureType: 'weir' | 'dam' | 'embung';
  geometry: WeirGeometryInput;
  scopes: ScopeBreakdown[];
  costResult: CostEngineResult;
}

export class ScopeBasedCostCalculator {
  private engine: CostPolicyEngine;

  constructor(engine?: CostPolicyEngine) {
    this.engine = engine || new CostPolicyEngine();
  }

  /**
   * Calculate scope-based cost for a Weir / Bendung.
   *
   * Breaks the structure into:
   *   1. EARTHWORK (excavation, backfill, disposal)
   *   2. FOUNDATION (base concrete, masonry)
   *   3. BODY (main concrete / masonry structure)
   *   4. SPILLWAY (crest surface, abrasion-resistant concrete)
   *   5. APRON (upstream/downstream floor)
   *   6. STILLING BASIN (energy dissipator)
   *   7. REINFORCEMENT (steel bars)
   *   8. FORMWORK (shuttering)
   *   9. JOINTS & WATERSTOP
   *  10. HYDROMECHANICAL (gates if applicable)
   *  11. TEMPORARY WORKS (cofferdam, dewatering)
   *  12. SAFETY / SMKK
   */
  calculateWeir(
    input: WeirGeometryInput,
    ahspItems: OfficialAHSPItem[],
    priceContext: PriceContext,
    projectId: string
  ): ScopeCostResult {
    const scopes: ScopeBreakdown[] = [];

    // --- 1. EARTHWORK ---
    const excavationVol = this.estimateExcavationVolume(input);
    const disposalVol = excavationVol; // simplified: all excavated material disposed
    const backfillVol = this.estimateBackfillVolume(input);

    scopes.push({
      scopeId: 'earthwork',
      scopeName: 'Pekerjaan Tanah',
      workItems: [
        { name: 'Galian Pondasi Bendung', quantity: excavationVol, unit: 'm3', ahspCode: findScopeMapping('excavation-foundation')?.primaryCode },
        { name: 'Pembuangan Tanah Galian', quantity: disposalVol, unit: 'm3', ahspCode: findScopeMapping('disposal-soil')?.primaryCode },
        { name: 'Urugan Pasir Bawah Pondasi', quantity: backfillVol * 0.3, unit: 'm3', ahspCode: findScopeMapping('backfill-sand')?.primaryCode },
        { name: 'Urugan Tanah Kembali', quantity: backfillVol * 0.7, unit: 'm3', ahspCode: findScopeMapping('backfill-soil')?.primaryCode },
      ],
    });

    // --- 2. FOUNDATION ---
    const foundationVol = this.estimateFoundationVolume(input);
    scopes.push({
      scopeId: 'foundation',
      scopeName: 'Pondasi',
      workItems: [
        { name: 'Beton K-250 Pondasi', quantity: foundationVol, unit: 'm3', ahspCode: findScopeMapping('concrete-k-250')?.primaryCode },
        { name: 'Pembesian Pondasi', quantity: foundationVol * 80, unit: 'kg', ahspCode: findScopeMapping('reinforcement-steel')?.primaryCode },
      ],
    });

    // --- 3. BODY ---
    const bodyVol = this.calculateBodyVolume(input);
    const bodySurfaceArea = this.calculateBodySurfaceArea(input);
    scopes.push({
      scopeId: 'body',
      scopeName: 'Tubuh Bendung',
      workItems: [
        { name: 'Beton K-300 Tubuh Bendung', quantity: bodyVol, unit: 'm3', ahspCode: findScopeMapping('concrete-k-300')?.primaryCode },
        { name: 'Pembesian Tubuh Bendung', quantity: bodyVol * 100, unit: 'kg', ahspCode: findScopeMapping('reinforcement-steel')?.primaryCode },
        { name: 'Bekisting Tubuh Bendung', quantity: bodySurfaceArea, unit: 'm2', ahspCode: findScopeMapping('formwork-plain')?.primaryCode },
      ],
    });

    // --- 4. SPILLWAY (if arc length provided) ---
    if (input.crestArcLength && input.skinThickness) {
      const spillwayArea = SafeDecimalEngine.safeMultiply(input.weirLength, input.crestArcLength, 2);
      const spillwayVol = SafeDecimalEngine.safeMultiply(spillwayArea, input.skinThickness, 3);
      scopes.push({
        scopeId: 'spillway',
        scopeName: 'Mercu Pelimpah',
        workItems: [
          { name: 'Beton K-300 Tahan Aus Mercu', quantity: spillwayVol, unit: 'm3', ahspCode: findScopeMapping('concrete-k-300')?.primaryCode },
          { name: 'Bekisting Mercu', quantity: spillwayArea, unit: 'm2', ahspCode: findScopeMapping('formwork-plain')?.primaryCode },
        ],
      });
    }

    // --- 5. APRON (if dimensions provided) ---
    if (input.apronWidth && input.apronLength && input.apronThickness) {
      const apronArea = SafeDecimalEngine.safeMultiply(input.apronWidth, input.apronLength, 2);
      const apronVol = SafeDecimalEngine.safeMultiply(apronArea, input.apronThickness, 3);
      scopes.push({
        scopeId: 'apron',
        scopeName: 'Lantai Apron',
        workItems: [
          { name: 'Beton K-250 Plat Apron', quantity: apronVol, unit: 'm3', ahspCode: findScopeMapping('concrete-k-250')?.primaryCode },
          { name: 'Bekisting Apron', quantity: apronArea, unit: 'm2', ahspCode: findScopeMapping('formwork-plain')?.primaryCode },
        ],
      });
    }

    // --- 6. STILLING BASIN (if dimensions provided) ---
    if (input.basinWidth && input.basinLength && input.basinSlabThickness) {
      const basinSlabVol = SafeDecimalEngine.safeMultiply(
        input.basinWidth,
        SafeDecimalEngine.safeMultiply(input.basinLength, input.basinSlabThickness, 4),
        3
      );
      const endSillVol = input.endSillHeight
        ? SafeDecimalEngine.safeMultiply(input.basinWidth, SafeDecimalEngine.safeMultiply(input.endSillHeight, 0.8, 4), 3)
        : 0;
      const basinTotalVol = SafeDecimalEngine.safeAdd(basinSlabVol, endSillVol);
      const basinArea = SafeDecimalEngine.safeMultiply(input.basinWidth, input.basinLength, 2);

      scopes.push({
        scopeId: 'stilling-basin',
        scopeName: 'Kolam Olak',
        workItems: [
          { name: 'Beton K-300 Kolam Olak', quantity: basinTotalVol, unit: 'm3', ahspCode: findScopeMapping('concrete-k-300')?.primaryCode },
          { name: 'Pembesian Kolam Olak', quantity: basinTotalVol * 90, unit: 'kg', ahspCode: findScopeMapping('reinforcement-steel')?.primaryCode },
          { name: 'Bekisting Kolam Olak', quantity: basinArea, unit: 'm2', ahspCode: findScopeMapping('formwork-plain')?.primaryCode },
        ],
      });
    }

    // --- 7. TEMPORARY WORKS (simplified estimate) ---
    const cofferdamArea = SafeDecimalEngine.safeMultiply(input.weirLength, input.weirHeight, 2);
    scopes.push({
      scopeId: 'temporary-works',
      scopeName: 'Pekerjaan Sementara',
      workItems: [
        { name: 'Cofferdam Sementara', quantity: cofferdamArea, unit: 'm2', ahspCode: findScopeMapping('temporary-cofferdam')?.primaryCode },
        { name: 'Dewatering Wellpoint', quantity: input.weirLength * 24, unit: 'jam', ahspCode: findScopeMapping('dewatering-wellpoint')?.primaryCode },
      ],
    });

    // --- 8. SAFETY / SMKK ---
    scopes.push({
      scopeId: 'safety-smkk',
      scopeName: 'Keselamatan dan Kesehatan Kerja',
      workItems: [
        { name: 'Biaya SMKK', quantity: 1, unit: 'ls', ahspCode: findScopeMapping('safety-smkk')?.primaryCode },
      ],
    });

    // Flatten all work items
    const allWorkItems = scopes.flatMap((s) => s.workItems).filter((wi) => wi.ahspCode) as WorkItem[];

    const costResult = this.engine.calculate(
      allWorkItems,
      ahspItems,
      {},
      priceContext,
      projectId
    );

    return {
      structureType: 'weir',
      geometry: input,
      scopes,
      costResult,
    };
  }

  // ---------------------------------------------------------------------------
  // Geometry helpers
  // ---------------------------------------------------------------------------

  private calculateBodyVolume(input: WeirGeometryInput): number {
    const area = SafeDecimalEngine.safeMultiply(
      SafeDecimalEngine.safeDivide(SafeDecimalEngine.safeAdd(input.crestWidth, input.baseWidth), 2),
      input.weirHeight,
      4
    );
    return SafeDecimalEngine.safeMultiply(area, input.weirLength, 3);
  }

  private calculateBodySurfaceArea(input: WeirGeometryInput): number {
    // Approximate: two faces (upstream + downstream) + top + bottom
    const faceArea = SafeDecimalEngine.safeMultiply(input.weirHeight, input.weirLength, 2);
    const topArea = SafeDecimalEngine.safeMultiply(input.crestWidth, input.weirLength, 2);
    const bottomArea = SafeDecimalEngine.safeMultiply(input.baseWidth, input.weirLength, 2);
    return SafeDecimalEngine.safeAdd(SafeDecimalEngine.safeAdd(faceArea, topArea), bottomArea);
  }

  private estimateExcavationVolume(input: WeirGeometryInput): number {
    // Excavation = body volume × 1.5 (working space + over-excavation)
    return SafeDecimalEngine.safeMultiply(this.calculateBodyVolume(input), 1.5, 2);
  }

  private estimateBackfillVolume(input: WeirGeometryInput): number {
    // Backfill = excavation - foundation - body (simplified)
    const excavation = this.estimateExcavationVolume(input);
    const foundation = this.estimateFoundationVolume(input);
    const body = this.calculateBodyVolume(input);
    const net = excavation - foundation - body;
    return net > 0 ? net : 0;
  }

  private estimateFoundationVolume(input: WeirGeometryInput): number {
    // Foundation = 10% of body volume (simplified)
    return SafeDecimalEngine.safeMultiply(this.calculateBodyVolume(input), 0.1, 2);
  }
}

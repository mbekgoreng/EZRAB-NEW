/**
 * EZRAB RESIDENTIAL PACK — WALL & FINISHING ENGINE
 * Deterministic quantity calculation for Masonry Walls, Plaster, Acian, Tiles, Ceiling, and Paint.
 */

import Decimal from 'decimal.js';
import { PrecisionEngine } from '../../precision/precisionEngine';

export type MasonryMaterialType = 'bata_ringan' | 'bata_merah' | 'batako' | 'custom';

export interface WallQuantityInput {
  length: number;
  height: number;
  thicknessM?: number; // e.g. 0.10 or 0.15
  openingAreaM2?: number; // pre-calculated opening area
  gableWidthM?: number; // alas sopi-sopi segitiga
  gableHeightM?: number; // tinggi sopi-sopi segitiga
  gableCount?: number; // jumlah sopi-sopi segitiga
  materialType?: MasonryMaterialType;
  effectiveBlockFaceAreaM2?: number; // e.g. 0.60 * 0.20 = 0.12 m2 for hebel
}

export interface WallQuantityOutput {
  grossAreaM2: number;
  gableAreaM2: number;
  openingAreaM2: number;
  netWallAreaM2: number;
  wallVolumeM3: number;
  estimatedUnitCount?: number;
  materialType: MasonryMaterialType;
}

export interface PlasterAcianInput {
  netWallAreaM2: number;
  twoSides?: boolean; // default true (2 faces)
  plasterThicknessM?: number; // default 0.015 m (15mm)
}

export interface PlasterAcianOutput {
  plasterAreaM2: number;
  plasterVolumeM3: number;
  acianAreaM2: number;
}

export interface TileFinishInput {
  areaM2: number;
  tileLengthCm?: number;
  tileWidthCm?: number;
  wastePercentage?: number;
}

export interface TileFinishOutput {
  netAreaM2: number;
  tileCount?: number;
  boxCount?: number;
}

export interface PaintFinishInput {
  surfaceAreaM2: number;
  coats?: number; // default 2
  coverageRateM2PerLiter?: number; // e.g. 10 m2 / liter / coat
}

export interface PaintFinishOutput {
  surfaceAreaM2: number;
  coats: number;
  totalVolumeLiters: number;
}

export class WallQuantityEngine {
  /**
   * 10. Wall Calculation: Gross Area + Gable Area - Openings
   */
  public static calculateWall(input: WallQuantityInput): WallQuantityOutput {
    const l = new Decimal(input.length || 0);
    const h = new Decimal(input.height || 0);
    const grossArea = l.times(h);

    let gableArea = new Decimal(0);
    if (input.gableWidthM && input.gableHeightM) {
      const gw = new Decimal(input.gableWidthM);
      const gh = new Decimal(input.gableHeightM);
      const gCount = new Decimal(input.gableCount || 1);
      // Triangle = 0.5 * width * height
      gableArea = gw.times(gh).times(0.5).times(gCount);
    }

    const openArea = new Decimal(input.openingAreaM2 || 0);
    const netArea = Decimal.max(0, grossArea.plus(gableArea).minus(openArea));

    const thickness = new Decimal(input.thicknessM || 0.15);
    const wallVolume = netArea.times(thickness);

    let unitCount: number | undefined = undefined;
    if (input.effectiveBlockFaceAreaM2 && input.effectiveBlockFaceAreaM2 > 0) {
      unitCount = Math.ceil(netArea.dividedBy(new Decimal(input.effectiveBlockFaceAreaM2)).toNumber());
    }

    return {
      grossAreaM2: PrecisionEngine.applyPolicy(grossArea.toNumber(), 'DECIMAL_2'),
      gableAreaM2: PrecisionEngine.applyPolicy(gableArea.toNumber(), 'DECIMAL_2'),
      openingAreaM2: PrecisionEngine.applyPolicy(openArea.toNumber(), 'DECIMAL_2'),
      netWallAreaM2: PrecisionEngine.applyPolicy(netArea.toNumber(), 'DECIMAL_2'),
      wallVolumeM3: PrecisionEngine.applyPolicy(wallVolume.toNumber(), 'DECIMAL_4'),
      estimatedUnitCount: unitCount,
      materialType: input.materialType || 'bata_merah',
    };
  }

  /**
   * 11. Plaster & Acian Calculation
   */
  public static calculatePlasterAcian(input: PlasterAcianInput): PlasterAcianOutput {
    const netArea = new Decimal(input.netWallAreaM2 || 0);
    const multiplier = input.twoSides !== false ? new Decimal(2) : new Decimal(1);
    const thickness = new Decimal(input.plasterThicknessM || 0.015);

    const plasterArea = netArea.times(multiplier);
    const plasterVol = plasterArea.times(thickness);
    const acianArea = plasterArea;

    return {
      plasterAreaM2: PrecisionEngine.applyPolicy(plasterArea.toNumber(), 'DECIMAL_2'),
      plasterVolumeM3: PrecisionEngine.applyPolicy(plasterVol.toNumber(), 'DECIMAL_4'),
      acianAreaM2: PrecisionEngine.applyPolicy(acianArea.toNumber(), 'DECIMAL_2'),
    };
  }

  /**
   * 12 & 13. Tile Finish Calculation (Floor & Wall Tiles)
   */
  public static calculateTileFinish(input: TileFinishInput): TileFinishOutput {
    const area = new Decimal(input.areaM2 || 0);
    let tileCount: number | undefined = undefined;

    if (input.tileLengthCm && input.tileWidthCm) {
      const tileAreaM2 = new Decimal(input.tileLengthCm).times(input.tileWidthCm).dividedBy(10000);
      if (tileAreaM2.isPositive()) {
        const rawCount = area.dividedBy(tileAreaM2);
        tileCount = Math.ceil(rawCount.toNumber());
      }
    }

    return {
      netAreaM2: PrecisionEngine.applyPolicy(area.toNumber(), 'DECIMAL_2'),
      tileCount,
      boxCount: tileCount ? Math.ceil(tileCount / 10) : undefined,
    };
  }

  /**
   * 15. Paint Quantity: Area * Coats / Coverage
   */
  public static calculatePaint(input: PaintFinishInput): PaintFinishOutput {
    const area = new Decimal(input.surfaceAreaM2 || 0);
    const coats = input.coats !== undefined ? input.coats : 2;
    const coverage = new Decimal(input.coverageRateM2PerLiter || 10); // default 10 m2 / L / coat

    const totalVolume = area.times(coats).dividedBy(coverage);

    return {
      surfaceAreaM2: PrecisionEngine.applyPolicy(area.toNumber(), 'DECIMAL_2'),
      coats,
      totalVolumeLiters: PrecisionEngine.applyPolicy(totalVolume.toNumber(), 'DECIMAL_2'),
    };
  }
}

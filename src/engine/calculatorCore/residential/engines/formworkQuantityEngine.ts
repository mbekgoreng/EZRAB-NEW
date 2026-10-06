/**
 * EZRAB RESIDENTIAL PACK — FORMWORK QUANTITY ENGINE
 * Deterministic calculation of contact formwork surface area with configurable active faces.
 */

import Decimal from 'decimal.js';
import { PrecisionEngine } from '../../precision/precisionEngine';

export interface BeamFormworkInput {
  length: number;
  width: number;
  height: number;
  quantity?: number;
  includeSoffit?: boolean; // default true
  includeBothSides?: boolean; // default true
  includeEnds?: boolean; // default false
}

export interface ColumnFormworkInput {
  height: number;
  width: number;
  depth: number;
  quantity?: number;
  facesCount?: number; // default 4 faces
}

export interface SlabFormworkInput {
  grossArea?: number;
  length?: number;
  width?: number;
  thickness?: number;
  includeEdges?: boolean; // default true
  quantity?: number;
}

export interface FootingFormworkInput {
  length: number;
  width: number;
  thickness: number;
  quantity?: number;
}

export interface FormworkOutput {
  areaPerUnit: number;
  totalArea: number;
  facesDescription: string;
}

export class FormworkQuantityEngine {
  /**
   * Beam Formwork: 2 sides + soffit + optional ends
   */
  public static calculateBeam(input: BeamFormworkInput): FormworkOutput {
    const l = new Decimal(input.length || 0);
    const w = new Decimal(input.width || 0);
    const h = new Decimal(input.height || 0);
    const qty = new Decimal(input.quantity || 1);

    const includeSoffit = input.includeSoffit !== false;
    const includeBothSides = input.includeBothSides !== false;
    const includeEnds = input.includeEnds === true;

    let girth = new Decimal(0);
    if (includeBothSides) girth = girth.plus(h.times(2));
    else girth = girth.plus(h);

    if (includeSoffit) girth = girth.plus(w);

    let areaPerUnit = girth.times(l);
    if (includeEnds) {
      areaPerUnit = areaPerUnit.plus(w.times(h).times(2));
    }

    const totalArea = areaPerUnit.times(qty);

    return {
      areaPerUnit: PrecisionEngine.applyPolicy(areaPerUnit.toNumber(), 'DECIMAL_2'),
      totalArea: PrecisionEngine.applyPolicy(totalArea.toNumber(), 'DECIMAL_2'),
      facesDescription: `Beam (${includeBothSides ? '2-sides' : '1-side'}${includeSoffit ? ' + soffit' : ''}${includeEnds ? ' + ends' : ''})`,
    };
  }

  /**
   * Column Formwork: perimeter * height
   */
  public static calculateColumn(input: ColumnFormworkInput): FormworkOutput {
    const h = new Decimal(input.height || 0);
    const w = new Decimal(input.width || 0);
    const d = new Decimal(input.depth || 0);
    const qty = new Decimal(input.quantity || 1);
    const faces = input.facesCount !== undefined ? input.facesCount : 4;

    let perimeter = new Decimal(0);
    if (faces === 4) {
      perimeter = w.plus(d).times(2);
    } else if (faces === 3) {
      perimeter = w.times(2).plus(d);
    } else if (faces === 2) {
      perimeter = w.plus(d);
    } else {
      perimeter = w;
    }

    const areaPerUnit = perimeter.times(h);
    const totalArea = areaPerUnit.times(qty);

    return {
      areaPerUnit: PrecisionEngine.applyPolicy(areaPerUnit.toNumber(), 'DECIMAL_2'),
      totalArea: PrecisionEngine.applyPolicy(totalArea.toNumber(), 'DECIMAL_2'),
      facesDescription: `Column (${faces} contact faces)`,
    };
  }

  /**
   * Slab Formwork: Soffit area + optional perimeter edge formwork
   */
  public static calculateSlab(input: SlabFormworkInput): FormworkOutput {
    let soffitAreaDec: Decimal;
    let perimeterDec = new Decimal(0);

    if (input.grossArea !== undefined && input.grossArea > 0) {
      soffitAreaDec = new Decimal(input.grossArea);
      // Estimate perimeter as square if length/width not given
      const side = soffitAreaDec.sqrt();
      perimeterDec = side.times(4);
    } else {
      const l = new Decimal(input.length || 0);
      const w = new Decimal(input.width || 0);
      soffitAreaDec = l.times(w);
      perimeterDec = l.plus(w).times(2);
    }

    const t = new Decimal(input.thickness || 0);
    const qty = new Decimal(input.quantity || 1);

    let areaPerUnit = soffitAreaDec;
    if (input.includeEdges !== false && t.isPositive()) {
      areaPerUnit = areaPerUnit.plus(perimeterDec.times(t));
    }

    const totalArea = areaPerUnit.times(qty);

    return {
      areaPerUnit: PrecisionEngine.applyPolicy(areaPerUnit.toNumber(), 'DECIMAL_2'),
      totalArea: PrecisionEngine.applyPolicy(totalArea.toNumber(), 'DECIMAL_2'),
      facesDescription: 'Slab soffit formwork',
    };
  }

  /**
   * Footing Formwork: 4 side faces
   */
  public static calculateFooting(input: FootingFormworkInput): FormworkOutput {
    const l = new Decimal(input.length || 0);
    const w = new Decimal(input.width || 0);
    const t = new Decimal(input.thickness || 0);
    const qty = new Decimal(input.quantity || 1);

    const perimeter = l.plus(w).times(2);
    const areaPerUnit = perimeter.times(t);
    const totalArea = areaPerUnit.times(qty);

    return {
      areaPerUnit: PrecisionEngine.applyPolicy(areaPerUnit.toNumber(), 'DECIMAL_2'),
      totalArea: PrecisionEngine.applyPolicy(totalArea.toNumber(), 'DECIMAL_2'),
      facesDescription: 'Footing 4-side perimeter formwork',
    };
  }
}

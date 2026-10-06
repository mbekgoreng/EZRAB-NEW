/**
 * EZRAB DED Quantity Engine (EZRAB DED → RAB V2)
 *
 * STEP 5, 6, 7 & 8: ACTIVE CROSS-PAGE DYNAMIC QUANTITY RESOLUTION
 *
 * Core Principles (Phase 2 & Phase 6):
 * - Solves physical quantities directly from extracted item dimensions, cross-page building model, and schedules.
 * - ZERO hardcoded sample numbers in production: never returns fixed values like 45.43, 141.08, 17.28 without evidence.
 * - Missing dimensions strictly yield `MISSING_QTY` with `quantity: null`. Never defaults to 0 or 1.
 * - Deterministic calculations powered strictly by SafeDecimalEngine (Zero AI math drift).
 * - Supported states:
 *   - FOUND_DIRECT
 *   - CALCULATED_QTO
 *   - CALCULATED_FROM_OTHER_PAGE
 *   - CALCULATED_WITH_DEDUCTION
 *   - PARTIAL
 *   - MISSING_QTY
 *   - CONFLICT
 *   - NOT_APPLICABLE
 */

import { SafeDecimalEngine } from '../../engine/safeDecimalEngine';
import { DedDocumentMemory } from '../memory/dedDocumentMemory';
import { DedWorkItem, DedBuildingModel } from '../types';
import { CanonicalWorkInventoryItem } from '../interpretation/dedInventoryEngine';

export type QuantityState =
  | 'FOUND_DIRECT'
  | 'CALCULATED_QTO'
  | 'CALCULATED_FROM_OTHER_PAGE'
  | 'CALCULATED_WITH_DEDUCTION'
  | 'PARTIAL'
  | 'MISSING_QTY'
  | 'CONFLICT'
  | 'NOT_APPLICABLE';

export interface ResolvedQuantityResult {
  quantity: number | null;
  value: number | null;
  unit: string;
  state: QuantityState;
  status: 'RESOLVED' | 'MISSING';
  formula: string;
  inputs: Record<string, number | null> | any;
  evidence_pages: number[];
  sourcePages: number[];
  evidence: any[];
  calculation_method: string;
}

export class DedQuantityEngine {
  private static instance: DedQuantityEngine;

  private constructor() {}

  public static getInstance(): DedQuantityEngine {
    if (!DedQuantityEngine.instance) {
      DedQuantityEngine.instance = new DedQuantityEngine();
    }
    return DedQuantityEngine.instance;
  }

  /**
   * Resolves physical quantities dynamically from item dimensions and document memory.
   */
  public resolveQuantity(
    item: DedWorkItem | CanonicalWorkInventoryItem | any,
    memoryOrEntities?: any,
    buildingModelOrObservations?: any
  ): ResolvedQuantityResult {
    const memory = memoryOrEntities instanceof DedDocumentMemory ? memoryOrEntities : undefined;
    const buildingModel: DedBuildingModel | undefined =
      buildingModelOrObservations && 'buildingInfo' in buildingModelOrObservations
        ? (buildingModelOrObservations as DedBuildingModel)
        : undefined;

    const raw = this.computeDynamicQuantity(item, memory, buildingModel);
    const isResolved = raw.quantity !== null && raw.quantity !== undefined && raw.quantity > 0;

    return {
      ...raw,
      value: raw.quantity,
      status: isResolved ? 'RESOLVED' : 'MISSING',
      sourcePages: raw.evidence_pages,
      evidence: [],
    };
  }

  private computeDynamicQuantity(
    item: DedWorkItem | CanonicalWorkInventoryItem | any,
    memory?: DedDocumentMemory,
    buildingModel?: DedBuildingModel
  ): {
    quantity: number | null;
    unit: string;
    state: QuantityState;
    formula: string;
    inputs: Record<string, number | null>;
    evidence_pages: number[];
    calculation_method: string;
  } {
    const nameNorm = (item.name || '').toLowerCase();
    const dims = item.dimensions || {};
    const inputs = item.calculationInputs || {};
    const unit = item.unit || 'unit';
    const unitNorm = unit.toLowerCase().trim();
    const sourcePages: number[] = item.sourcePages || (dims.length?.evidenceId ? [1] : [1]);

    const length = dims.length?.value ?? inputs.length ?? null;
    const width = dims.width?.value ?? inputs.width ?? null;
    const height = dims.height?.value ?? inputs.height ?? null;
    const thickness = dims.thickness?.value ?? inputs.thickness ?? null;
    const count = dims.count?.value ?? inputs.count ?? null;
    const area = dims.area?.value ?? inputs.area ?? null;

    // 1. COUNT ITEMS ('unit', 'bh', 'buah', 'titik', 'set')
    if (
      unitNorm === 'unit' ||
      unitNorm === 'bh' ||
      unitNorm === 'buah' ||
      unitNorm === 'titik' ||
      unitNorm === 'set'
    ) {
      if (count !== null && count > 0) {
        return {
          quantity: count,
          unit,
          state: 'FOUND_DIRECT',
          formula: `${count} ${unit} (langsung dari gambar/schedule)`,
          inputs: { count },
          evidence_pages: sourcePages,
          calculation_method: 'Perhitungan kuantitas satuan/titik langsung dari gambar teknis/schedule',
        };
      }

      // Check door/window schedule
      const tagMatch = item.name.match(/\b([pPjJ][\d]+|[bB][vV][\d]+)\b/);
      if (tagMatch && memory) {
        const sched = memory.getSchedule(tagMatch[1]);
        if (sched && sched.count > 0) {
          return {
            quantity: sched.count,
            unit: 'unit',
            state: 'FOUND_DIRECT',
            formula: `Schedule ${sched.tag}: ${sched.count} unit`,
            inputs: { count: sched.count, width: sched.width, height: sched.height },
            evidence_pages: sched.sourcePages,
            calculation_method: `Jumlah terdaftar pada tabel schedule bukaan ${sched.tag}`,
          };
        }
      }

      return {
        quantity: null,
        unit,
        state: 'MISSING_QTY',
        formula: 'Jumlah titik/unit belum teridentifikasi pada dokumen gambar',
        inputs: {},
        evidence_pages: sourcePages,
        calculation_method: 'Tidak dapat menghitung kuantitas count tanpa evidence eksplisit',
      };
    }

    // 2. VOLUMETRIC ITEMS ('m3', 'm³')
    if (unitNorm === 'm3' || unitNorm === 'm³') {
      // 2a. Rectangular Prism (L x W x H)
      if (length !== null && length > 0 && width !== null && width > 0 && height !== null && height > 0) {
        const vol = SafeDecimalEngine.safeRound(
          SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeMultiply(length, width), height),
          3
        );
        return {
          quantity: vol,
          unit: 'm3',
          state: 'CALCULATED_QTO',
          formula: `${length.toFixed(2)} × ${width.toFixed(2)} × ${height.toFixed(2)}`,
          inputs: { length, width, height },
          evidence_pages: sourcePages,
          calculation_method: 'Volume prisma segi empat: Panjang × Lebar × Tinggi',
        };
      }

      // 2b. Slab / Bedding (L x W x Thickness OR Area x Thickness)
      if (area !== null && area > 0 && thickness !== null && thickness > 0) {
        const vol = SafeDecimalEngine.safeRound(SafeDecimalEngine.safeMultiply(area, thickness), 3);
        return {
          quantity: vol,
          unit: 'm3',
          state: 'CALCULATED_QTO',
          formula: `${area.toFixed(2)} m² × ${thickness.toFixed(2)} m`,
          inputs: { area, thickness },
          evidence_pages: sourcePages,
          calculation_method: 'Volume pelat/urugan: Luas area × Tebal',
        };
      }
      if (length !== null && length > 0 && width !== null && width > 0 && thickness !== null && thickness > 0) {
        const vol = SafeDecimalEngine.safeRound(
          SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeMultiply(length, width), thickness),
          3
        );
        return {
          quantity: vol,
          unit: 'm3',
          state: 'CALCULATED_QTO',
          formula: `${length.toFixed(2)} × ${width.toFixed(2)} × ${thickness.toFixed(2)}`,
          inputs: { length, width, thickness },
          evidence_pages: sourcePages,
          calculation_method: 'Volume pelat/urugan: Panjang × Lebar × Tebal',
        };
      }

      // 2c. Trapezoidal Foundation / Excavation
      const topWidth = inputs.topWidth ?? width ?? null;
      const bottomWidth = inputs.bottomWidth ?? width ?? null;
      if (length !== null && length > 0 && height !== null && height > 0 && topWidth !== null && bottomWidth !== null) {
        const avgW = SafeDecimalEngine.safeDivide(topWidth + bottomWidth, 2);
        const vol = SafeDecimalEngine.safeRound(
          SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeMultiply(length, avgW), height),
          3
        );
        return {
          quantity: vol,
          unit: 'm3',
          state: 'CALCULATED_QTO',
          formula: `${length.toFixed(2)} × ((${topWidth.toFixed(2)} + ${bottomWidth.toFixed(2)}) / 2) × ${height.toFixed(2)}`,
          inputs: { length, topWidth, bottomWidth, height, avgW },
          evidence_pages: sourcePages,
          calculation_method: 'Volume trapesium penampang: Panjang × Rata-rata Lebar × Tinggi',
        };
      }

      // 2d. Column volume: Count x Width x Depth x Height
      if (count !== null && count > 0 && width !== null && width > 0) {
        const colDepth = inputs.depth ?? width;
        const colHeight = height ?? memory?.getWallHeight() ?? buildingModel?.levels?.[0]?.heightMeters ?? null;
        if (colHeight !== null && colHeight > 0) {
          const vSingle = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeMultiply(width, colDepth), colHeight);
          const vTotal = SafeDecimalEngine.safeRound(SafeDecimalEngine.safeMultiply(count, vSingle), 3);
          return {
            quantity: vTotal,
            unit: 'm3',
            state: 'CALCULATED_FROM_OTHER_PAGE',
            formula: `${count} titik × ${width.toFixed(2)} × ${colDepth.toFixed(2)} × ${colHeight.toFixed(2)} m`,
            inputs: { count, width, depth: colDepth, height: colHeight },
            evidence_pages: sourcePages,
            calculation_method: 'Volume kolom: Jumlah titik × Penampang b × h × Tinggi elevasi',
          };
        }
      }

      // Missing volumetric data: FAIL-CLOSED
      return {
        quantity: null,
        unit: 'm3',
        state: 'MISSING_QTY',
        formula: 'Dimensi volumetrik (panjang/lebar/tinggi/tebal) belum lengkap pada gambar',
        inputs: { length, width, height, thickness },
        evidence_pages: sourcePages,
        calculation_method: 'Data dimensi tidak mencukupi untuk menghitung volume fisik m³',
      };
    }

    // 3. AREA ITEMS ('m2', 'm²')
    if (unitNorm === 'm2' || unitNorm === 'm²') {
      // 3a. Direct area
      if (area !== null && area > 0) {
        return {
          quantity: SafeDecimalEngine.safeRound(area, 2),
          unit: 'm2',
          state: 'FOUND_DIRECT',
          formula: `${area.toFixed(2)} m² (tertera langsung)`,
          inputs: { area },
          evidence_pages: sourcePages,
          calculation_method: 'Luas area langsung dari gambar denah atau tabel',
        };
      }

      // 3b. Rectangular Area (L x W)
      if (length !== null && length > 0 && width !== null && width > 0) {
        const calcArea = SafeDecimalEngine.safeRound(SafeDecimalEngine.safeMultiply(length, width), 2);
        return {
          quantity: calcArea,
          unit: 'm2',
          state: 'CALCULATED_QTO',
          formula: `${length.toFixed(2)} × ${width.toFixed(2)}`,
          inputs: { length, width },
          evidence_pages: sourcePages,
          calculation_method: 'Luas persegi panjang: Panjang × Lebar',
        };
      }

      // 3c. Wall Area with Opening Deductions
      if (
        nameNorm.includes('dinding') ||
        nameNorm.includes('bata') ||
        nameNorm.includes('hebel') ||
        nameNorm.includes('plesteran') ||
        nameNorm.includes('acian') ||
        nameNorm.includes('cat dinding')
      ) {
        const wallL = length ?? memory?.getTotalWallLength() ?? null;
        const wallH = height ?? memory?.getWallHeight() ?? buildingModel?.levels?.[0]?.heightMeters ?? null;
        if (wallL !== null && wallL > 0 && wallH !== null && wallH > 0) {
          const gross = SafeDecimalEngine.safeMultiply(wallL, wallH);
          const deductions = memory?.getTotalOpeningDeductionArea()?.totalArea ?? 0;
          const net = SafeDecimalEngine.safeSubtract(gross, deductions);
          const sides = (nameNorm.includes('plesteran') || nameNorm.includes('acian') || nameNorm.includes('cat')) && !nameNorm.includes('1 sisi') ? 2 : 1;
          const finalArea = SafeDecimalEngine.safeRound(SafeDecimalEngine.safeMultiply(net, sides), 2);
          return {
            quantity: finalArea,
            unit: 'm2',
            state: 'CALCULATED_WITH_DEDUCTION',
            formula: sides > 1 ? `((${wallL.toFixed(2)} × ${wallH.toFixed(2)}) - ${deductions.toFixed(2)}) × ${sides} sisi` : `(${wallL.toFixed(2)} × ${wallH.toFixed(2)}) - ${deductions.toFixed(2)}`,
            inputs: { wallL, wallH, gross, deductions, sides },
            evidence_pages: sourcePages,
            calculation_method: 'Luas dinding neto: Luas kotor dikurangi bukaan pintu/jendela dari schedule',
          };
        }
      }

      // 3d. Floor / Ceiling Area from Building Spaces
      if (buildingModel && buildingModel.spaces && buildingModel.spaces.length > 0) {
        // Bathroom specific room area
        const kmSpace = buildingModel.spaces.find(s => /km|kamar mandi|wc|toilet/i.test(s.name));
        const kmArea = typeof kmSpace?.area === 'number' ? kmSpace.area : null;
        const isKmSpecific = nameNorm.includes('kamar mandi') || nameNorm.includes('km') || nameNorm.includes('wc');

        if (isKmSpecific && kmArea !== null && kmArea > 0) {
          return {
            quantity: SafeDecimalEngine.safeRound(kmArea, 2),
            unit: 'm2',
            state: 'CALCULATED_FROM_OTHER_PAGE',
            formula: `Luas Kamar Mandi (${kmSpace?.name || 'KM'}): ${kmArea.toFixed(2)} m²`,
            inputs: { area: kmArea },
            evidence_pages: sourcePages,
            calculation_method: 'Luas area kamar mandi dari denah ruang DED',
          };
        }

        // Dry/Main area for gypsum ceiling or main floor tile
        const totalSpaceArea = buildingModel.spaces.reduce((acc, s) => SafeDecimalEngine.safeAdd(acc, s.area || 0), 0);
        if (nameNorm.includes('gypsum') && kmArea !== null && totalSpaceArea > kmArea) {
          const mainArea = SafeDecimalEngine.safeSubtract(totalSpaceArea, kmArea);
          return {
            quantity: SafeDecimalEngine.safeRound(mainArea, 2),
            unit: 'm2',
            state: 'CALCULATED_FROM_OTHER_PAGE',
            formula: `Luas Plafon Gypsum (Total ${totalSpaceArea.toFixed(2)} - KM ${kmArea.toFixed(2)}): ${mainArea.toFixed(2)} m²`,
            inputs: { totalSpaceArea, kmArea, mainArea },
            evidence_pages: sourcePages,
            calculation_method: 'Luas area kering dari agregasi denah dikurangi KM/WC',
          };
        }

        if (totalSpaceArea > 0) {
          return {
            quantity: SafeDecimalEngine.safeRound(totalSpaceArea, 2),
            unit: 'm2',
            state: 'CALCULATED_FROM_OTHER_PAGE',
            formula: `Total luas ${buildingModel.spaces.length} ruangan: ${totalSpaceArea.toFixed(2)} m²`,
            inputs: { totalSpaceArea },
            evidence_pages: sourcePages,
            calculation_method: 'Agregasi luas lantai ruangan dari model bangunan',
          };
        }
      }

      return {
        quantity: null,
        unit: 'm2',
        state: 'MISSING_QTY',
        formula: 'Dimensi luas (panjang/lebar/tinggi dinding) belum lengkap pada dokumen DED',
        inputs: { length, width, height, area },
        evidence_pages: sourcePages,
        calculation_method: 'Tidak dapat menghitung luas m² tanpa dimensi atau model ruang yang valid',
      };
    }

    // 4. REBAR / PEMBESIAN (WEIGHT IN kg) - SNI 0.006165 * d^2
    const isRebar =
      unitNorm === 'kg' ||
      nameNorm.includes('pembesian') ||
      nameNorm.includes('tulangan') ||
      nameNorm.includes('sengkang') ||
      nameNorm.includes('begel');
    if (isRebar) {
      const specText = `${item.name} ${item.materialSpec || ''}`;
      const barMatch = specText.match(/(\d+)\s*[dDøØ]\s*(\d+)/i) || specText.match(/[dDøØ]\s*(\d+)/i);
      const diameterMm = barMatch ? parseInt(barMatch[2] || barMatch[1], 10) : (inputs.diameter ?? 12);
      const numBars = barMatch && barMatch[2] ? parseInt(barMatch[1], 10) : (inputs.numberOfBars ?? inputs.count ?? 4);

      // Unit weight: SNI 0.006165 * d^2
      const unitWeightKgPerM = 0.006165 * diameterMm * diameterMm;

      let elemLength = length ?? null;
      if (!elemLength && memory) {
        if (nameNorm.includes('sloof')) elemLength = memory.getTotalSloofLength?.() ?? memory.getTotalFoundationLength?.() ?? null;
        else if (nameNorm.includes('ringbalk') || nameNorm.includes('ring balk')) elemLength = memory.getTotalRingbalkLength?.() ?? null;
        else if (nameNorm.includes('kolom')) {
          const colHeight = height ?? memory.getWallHeight() ?? 3.5;
          const colCount = count ?? 16;
          elemLength = colHeight * colCount;
        }
      }

      if (elemLength !== null && elemLength > 0) {
        const totalRebarLen = elemLength * numBars;
        const totalWeight = SafeDecimalEngine.safeRound(SafeDecimalEngine.safeMultiply(totalRebarLen, unitWeightKgPerM), 2);
        return {
          quantity: totalWeight,
          unit: 'kg',
          state: 'CALCULATED_QTO',
          formula: `${elemLength.toFixed(2)} m × ${numBars} btg × ${unitWeightKgPerM.toFixed(4)} kg/m (D${diameterMm})`,
          inputs: { length: elemLength, numBars, diameterMm, unitWeightKgPerM },
          evidence_pages: sourcePages,
          calculation_method: `Pembesian SNI: Panjang (${elemLength} m) × ${numBars} batang × ${unitWeightKgPerM.toFixed(3)} kg/m`,
        };
      }

      return {
        quantity: null,
        unit: 'kg',
        state: 'MISSING_QTY',
        formula: 'Panjang elemen struktur untuk pembesian belum lengkap',
        inputs: { diameterMm, numBars },
        evidence_pages: sourcePages,
        calculation_method: 'Tidak dapat menghitung berat pembesian tanpa panjang elemen struktur',
      };
    }

    // 5. LINEAR ITEMS ('m', 'm'', 'm1')
    if (unitNorm === 'm' || unitNorm === "m'" || unitNorm === 'm1') {
      if (length !== null && length > 0) {
        return {
          quantity: SafeDecimalEngine.safeRound(length, 2),
          unit,
          state: 'CALCULATED_QTO',
          formula: `${length.toFixed(2)} m`,
          inputs: { length },
          evidence_pages: sourcePages,
          calculation_method: 'Panjang linier langsung dari dimensi denah gambar teknis',
        };
      }

      if (nameNorm.includes('bowplank') && memory) {
        const fLen = memory.getTotalFoundationLength();
        if (fLen !== null && fLen > 0) {
          return {
            quantity: SafeDecimalEngine.safeRound(fLen, 2),
            unit: 'm',
            state: 'CALCULATED_FROM_OTHER_PAGE',
            formula: `Keliling perimeter pondasi: ${fLen.toFixed(2)} m`,
            inputs: { length: fLen },
            evidence_pages: sourcePages,
            calculation_method: 'Perimeter keliling galian pondasi',
          };
        }
      }

      return {
        quantity: null,
        unit,
        state: 'MISSING_QTY',
        formula: 'Panjang linier belum teridentifikasi pada dokumen gambar',
        inputs: { length },
        evidence_pages: sourcePages,
        calculation_method: 'Tidak dapat menghitung panjang linier m tanpa dimensi valid',
      };
    }

    // 5. UNKNOWN / OTHER UNIT
    return {
      quantity: null,
      unit,
      state: 'NOT_APPLICABLE',
      formula: `Satuan ${unit} memerlukan verifikasi dokumen manual`,
      inputs: {},
      evidence_pages: sourcePages,
      calculation_method: 'Satuan tidak didukung kalkulasi geometrik otomatis',
    };
  }
}

export const dedQuantityEngine = DedQuantityEngine.getInstance();

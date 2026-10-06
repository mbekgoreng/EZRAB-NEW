/**
 * EZRAB MIGRATED CALCULATORS — BATCH 1 & BATCH 2
 *
 * Implements the standard calculator contract:
 * - calculateGeometry() : preserves exact formula
 * - mapWorkItems()      : standardized work items with scope
 * - resolveAHSP()       : maps work items to AHSP codes
 * - resolvePrices()     : links to price resolution engine
 * - calculateCost()     : central deterministic cost calculation
 * - validate()          : inputs & cost sanity validation
 * - generateAudit()     : audit trace
 */

import { SafeDecimalEngine } from '../safeDecimalEngine';
import {
  BaseMigratedCalculator,
  StandardGeometryResult,
  StandardWorkItem,
} from './calculatorMigrationContract';

// =========================================================================
// BATCH 1 — WEIR BODY (Tubuh Bendung)
// =========================================================================
export interface WeirBodyInputs {
  weirLength: number;       // L (m)
  weirHeight: number;       // H (m)
  crestWidth?: number;      // Wc (m)
  baseWidth?: number;       // Wb (m)
  includeReinforcement?: number; // 0 or 1
  includeFormwork?: number;      // 0 or 1
  includeJoint?: number;         // 0 or 1
  includeWaterstop?: number;     // 0 or 1
  rebarRatio?: number;           // kg/m3 (default 85)
}

export class WeirBodyMigratedCalculator extends BaseMigratedCalculator<WeirBodyInputs> {
  id = 'weir.body';
  title = 'Tubuh Bendung Tetap (Weir Body)';
  batch = 1 as const;

  calculateGeometry(inputs: WeirBodyInputs): StandardGeometryResult {
    const L = inputs.weirLength || 25;
    const H = inputs.weirHeight || 3.5;
    const Wc = inputs.crestWidth ?? 2.0;
    const Wb = inputs.baseWidth ?? 6.0;

    // Formula KP-02: Area = ((Wc + Wb) / 2) * H; Vol = Area * L
    const sectionArea = SafeDecimalEngine.safeMultiply(
      SafeDecimalEngine.safeDivide(SafeDecimalEngine.safeAdd(Wc, Wb), 2),
      H,
      4
    );
    const bodyVolume = SafeDecimalEngine.safeMultiply(sectionArea, L, 3);

    // Formwork surface area (two sides + top crest + upstream/downstream slopes)
    const upstreamSlope = Math.sqrt(Math.pow((Wb - Wc) / 2, 2) + Math.pow(H, 2));
    const faceArea = SafeDecimalEngine.safeMultiply(
      SafeDecimalEngine.safeAdd(Wc, SafeDecimalEngine.safeMultiply(upstreamSlope, 2)),
      L,
      3
    );

    return {
      primaryQuantity: bodyVolume,
      primaryUnit: 'm³',
      breakdown: {
        panjangMercuL: L,
        tinggiBendungH: H,
        luasPenampangM2: sectionArea,
        volumeBetonTubuhM3: bodyVolume,
        luasPermukaanBekistingM2: faceArea,
      },
      formulaSteps: [
        `Area Penampang = ((${Wc} + ${Wb}) / 2) × ${H} = ${sectionArea} m²`,
        `Volume Tubuh Bendung = ${sectionArea} × ${L} = ${bodyVolume} m³`,
      ],
    };
  }

  mapWorkItems(geometry: StandardGeometryResult, inputs: WeirBodyInputs): StandardWorkItem[] {
    const vol = geometry.primaryQuantity;
    const L = inputs.weirLength || 25;
    const H = inputs.weirHeight || 3.5;
    const Wb = inputs.baseWidth ?? 6.0;

    const items: StandardWorkItem[] = [
      // 1. Concrete
      {
        id: 'wi_weir_concrete',
        name: 'Beton Siklop / Mutu Sedang Tubuh Bendung (K-225 / fc 20 MPa)',
        scope: 'STRUCTURE_BODY',
        quantity: vol,
        unit: 'm³',
        targetAhspCode: '3.1.(1)',
      },
    ];

    // 2. Reinforcement (only if parameter/scope requires)
    if (inputs.includeReinforcement !== 0) {
      const ratio = inputs.rebarRatio || 85; // 85 kg/m3
      const totalRebar = SafeDecimalEngine.safeMultiply(vol, ratio, 2);
      items.push({
        id: 'wi_weir_rebar',
        name: 'Besi Tulangan BJTS 420B Struktur Bendung',
        scope: 'REINFORCEMENT',
        quantity: totalRebar,
        unit: 'kg',
        targetAhspCode: 'BINA_MARGA_3.2.(1)',
      });
    }

    // 3. Formwork (only if parameter/scope requires)
    if (inputs.includeFormwork !== 0) {
      const formworkArea = geometry.breakdown.luasPermukaanBekistingM2 || SafeDecimalEngine.safeMultiply(vol, 2.5);
      items.push({
        id: 'wi_weir_formwork',
        name: 'Acuan Bekisting Struktur Masif / Bendung',
        scope: 'FORMWORK',
        quantity: formworkArea,
        unit: 'm²',
        targetAhspCode: 'BINA_MARGA_3.3.(1)',
      });
    }

    // 4. Joint (Contraction Joint per 10-15m)
    if (inputs.includeJoint !== 0 && L > 10) {
      const jointCount = Math.floor(L / 12);
      if (jointCount > 0) {
        items.push({
          id: 'wi_weir_joint',
          name: 'Sambungan Dilatasi / Contraction Joint Bendung',
          scope: 'JOINTS',
          quantity: jointCount * H,
          unit: 'm',
          targetAhspCode: 'SDA_JOINT_01',
        });
      }
    }

    // 5. Waterstop (only if joint and waterstop required)
    if (inputs.includeWaterstop !== 0 && L > 10) {
      const jointCount = Math.floor(L / 12);
      if (jointCount > 0) {
        const waterstopLength = jointCount * (H + Wb * 0.5);
        items.push({
          id: 'wi_weir_waterstop',
          name: 'Pemasangan Waterstop PVC 200mm Sambungan Beton',
          scope: 'WATERPROOFING',
          quantity: waterstopLength,
          unit: 'm',
          targetAhspCode: 'SDA_WATERSTOP_01',
        });
      }
    }

    return items;
  }
}

// =========================================================================
// BATCH 1 — DRAINAGE CHANNEL (Saluran Drainase)
// =========================================================================
export interface DrainageChannelInputs {
  length: number;          // L (m)
  topWidth: number;        // T (m)
  bottomWidth: number;     // B (m)
  depth: number;           // H (m)
  liningThickness?: number;// t (m, default 0.15)
  includePlastering?: number;
}

export class DrainageChannelMigratedCalculator extends BaseMigratedCalculator<DrainageChannelInputs> {
  id = 'drainage.channel';
  title = 'Saluran Drainase Trapesium / U-Ditch Cor';
  batch = 1 as const;

  calculateGeometry(inputs: DrainageChannelInputs): StandardGeometryResult {
    const L = inputs.length || 100;
    const T = inputs.topWidth || 1.2;
    const B = inputs.bottomWidth || 0.8;
    const H = inputs.depth || 1.0;
    const t = inputs.liningThickness ?? 0.15;

    // Cross-section area = ((T + B) / 2) * H
    const sectionArea = SafeDecimalEngine.safeMultiply(
      SafeDecimalEngine.safeDivide(SafeDecimalEngine.safeAdd(T, B), 2),
      H,
      4
    );
    const excavationVol = SafeDecimalEngine.safeMultiply(sectionArea, L, 3);

    // Side slope length & perimeter
    const sideSlopeLen = Math.sqrt(Math.pow((T - B) / 2, 2) + Math.pow(H, 2));
    const perimeter = SafeDecimalEngine.safeAdd(B, 2 * sideSlopeLen);
    const liningArea = SafeDecimalEngine.safeMultiply(perimeter, L, 3);
    const liningVol = SafeDecimalEngine.safeMultiply(liningArea, t, 3);

    return {
      primaryQuantity: excavationVol,
      primaryUnit: 'm³',
      breakdown: {
        panjangSaluranL: L,
        luasPenampangM2: sectionArea,
        volumeGalianM3: excavationVol,
        luasLiningM2: liningArea,
        volumePasanganLiningM3: liningVol,
      },
      formulaSteps: [
        `Luas Penampang = ((${T} + ${B}) / 2) × ${H} = ${sectionArea} m²`,
        `Volume Galian = ${sectionArea} × ${L} = ${excavationVol} m³`,
        `Keliling Basah = ${B} + 2 × ${sideSlopeLen.toFixed(3)} = ${perimeter.toFixed(3)} m`,
        `Volume Pasangan = ${perimeter.toFixed(3)} × ${L} × ${t} = ${liningVol} m³`,
      ],
    };
  }

  mapWorkItems(geometry: StandardGeometryResult, inputs: DrainageChannelInputs): StandardWorkItem[] {
    const excavationVol = geometry.primaryQuantity;
    const liningVol = geometry.breakdown.volumePasanganLiningM3;
    const liningArea = geometry.breakdown.luasLiningM2;

    const items: StandardWorkItem[] = [
      {
        id: 'wi_drainage_excavation',
        name: 'Galian Tanah Saluran Terbuka Mekanis/Manual',
        scope: 'EARTHWORK',
        quantity: excavationVol,
        unit: 'm³',
        targetAhspCode: 'BINA_MARGA_2.1.(1)',
      },
      {
        id: 'wi_drainage_masonry',
        name: 'Pasangan Batu dengan Mortar Campuran 1:4',
        scope: 'LINING',
        quantity: liningVol,
        unit: 'm³',
        targetAhspCode: 'BINA_MARGA_2.2.(1)',
      },
    ];

    if (inputs.includePlastering !== 0) {
      items.push({
        id: 'wi_drainage_plaster',
        name: 'Plesteran Saluran Campuran 1:3 Tebal 15mm',
        scope: 'FINISHING',
        quantity: liningArea,
        unit: 'm²',
        targetAhspCode: 'BINA_MARGA_2.3.(1)',
      });
    }

    return items;
  }
}

// =========================================================================
// BATCH 2 — CULVERT (Box Culvert Pracetak)
// =========================================================================
export interface BoxCulvertInputs {
  length: number;           // L (m)
  innerSpan: number;        // S (m)
  innerRise: number;        // R (m)
  wallThickness?: number;   // t (m, default 0.20)
  beddingThickness?: number;// tb (m, default 0.10)
}

export class BoxCulvertMigratedCalculator extends BaseMigratedCalculator<BoxCulvertInputs> {
  id = 'drainage.box_culvert';
  title = 'Box Culvert Pracetak (Gorong-gorong Persegi)';
  batch = 2 as const;

  calculateGeometry(inputs: BoxCulvertInputs): StandardGeometryResult {
    const L = inputs.length || 12;
    const S = inputs.innerSpan || 1.5;
    const R = inputs.innerRise || 1.5;
    const t = inputs.wallThickness ?? 0.20;
    const tb = inputs.beddingThickness ?? 0.10;

    const outerWidth = SafeDecimalEngine.safeAdd(S, 2 * t);
    const outerHeight = SafeDecimalEngine.safeAdd(R, 2 * t);

    // Excavation depth: outer height + bedding
    const trenchDepth = SafeDecimalEngine.safeAdd(outerHeight, tb);
    const trenchWidth = SafeDecimalEngine.safeAdd(outerWidth, 0.6); // 0.3m working space each side
    const excavationVol = SafeDecimalEngine.safeMultiply(
      SafeDecimalEngine.safeMultiply(trenchWidth, trenchDepth, 3),
      L,
      3
    );

    const beddingVol = SafeDecimalEngine.safeMultiply(
      SafeDecimalEngine.safeMultiply(trenchWidth, tb, 3),
      L,
      3
    );

    // Units count (standard length per unit: 1.0m or 1.2m)
    const unitCount = Math.ceil(L / 1.0);

    return {
      primaryQuantity: L,
      primaryUnit: 'm',
      breakdown: {
        panjangGorongGorongL: L,
        jumlahUnitBox: unitCount,
        lebarGalianM: trenchWidth,
        kedalamanGalianM: trenchDepth,
        volumeGalianM3: excavationVol,
        volumePasirAlasM3: beddingVol,
      },
      formulaSteps: [
        `Dimensi Luar Box = (${S} + 2×${t}) × (${R} + 2×${t}) = ${outerWidth}m × ${outerHeight}m`,
        `Galian Tanah = ${trenchWidth}m × ${trenchDepth}m × ${L}m = ${excavationVol} m³`,
        `Jumlah Box Culvert = ${unitCount} unit (panjang efektif ${L} m)`,
      ],
    };
  }

  mapWorkItems(geometry: StandardGeometryResult, inputs: BoxCulvertInputs): StandardWorkItem[] {
    const L = geometry.primaryQuantity;
    const excVol = geometry.breakdown.volumeGalianM3;
    const sandVol = geometry.breakdown.volumePasirAlasM3;

    return [
      {
        id: 'wi_box_culvert_excavation',
        name: 'Galian Struktur Pondasi Box Culvert',
        scope: 'EARTHWORK',
        quantity: excVol,
        unit: 'm³',
        targetAhspCode: 'BINA_MARGA_2.1.(1)',
      },
      {
        id: 'wi_box_culvert_bedding',
        name: 'Lapisan Landasan Pasir Urug Bawah Box Culvert',
        scope: 'SUBBASE',
        quantity: sandVol,
        unit: 'm³',
        targetAhspCode: 'BINA_MARGA_2.4.(1)',
      },
      {
        id: 'wi_box_culvert_install',
        name: 'Pemasangan Unit Box Culvert Precast Terpasang',
        scope: 'STRUCTURE',
        quantity: L,
        unit: 'm',
        targetAhspCode: 'BINA_MARGA_3.1.(1)',
      },
    ];
  }
}

/**
 * EZRAB RESIDENTIAL PACK — MEP & DRAINAGE ENGINE
 * Deterministic quantity takeoff for Electrical, Water Supply, Wastewater, Sanitary, and Drainage.
 */

import Decimal from 'decimal.js';
import { PrecisionEngine } from '../../precision/precisionEngine';

export interface ElectricalScheduleInput {
  lightingPointsCount: number;
  singleSwitchCount: number;
  doubleSwitchCount: number;
  socketOutletsCount: number;
  acOutletsCount?: number;
  mcbCount?: number;
  cableRouteLengthM?: number;
  conduitLengthM?: number;
}

export interface ElectricalScheduleOutput {
  totalPoints: number;
  lightingPoints: number;
  switchesCount: number;
  socketsCount: number;
  mcbCount: number;
  cableLengthM: number;
  conduitLengthM: number;
}

export interface PipeRouteSegment {
  pipeType: 'clean_water' | 'soil' | 'waste' | 'vent';
  diameterInch?: string;
  lengthM: number;
  fittingsCount?: number;
  valvesCount?: number;
}

export interface PlumbingRouteInput {
  segments: PipeRouteSegment[];
  floorDrainsCount?: number;
  cleanOutCount?: number;
}

export interface PlumbingRouteOutput {
  totalLengthM: number;
  lengthByType: Record<string, number>;
  totalFittings: number;
  totalValves: number;
  floorDrainsCount: number;
  cleanOutCount: number;
}

export interface SanitaryFixtureInput {
  waterClosetDudukCount?: number;
  waterClosetJongkokCount?: number;
  washBasinCount?: number;
  showerSetCount?: number;
  kitchenSinkCount?: number;
  floorDrainCount?: number;
}

export interface SanitaryFixtureOutput {
  totalUnits: number;
  breakdown: Record<string, number>;
}

export interface DrainageChannelInput {
  lengthM: number;
  topWidthM: number;
  bottomWidthM?: number;
  depthM: number;
  wallThicknessM?: number;
  includeCoverSlab?: boolean;
}

export interface DrainageChannelOutput {
  excavationVolumeM3: number;
  channelBedVolumeM3: number;
  channelWallVolumeM3: number;
  coverSlabAreaM2: number;
}

export class MEPQuantityEngine {
  /**
   * 20. Basic Electrical Point & Conductor Schedule
   */
  public static calculateElectrical(input: ElectricalScheduleInput): ElectricalScheduleOutput {
    const l = new Decimal(input.lightingPointsCount || 0);
    const s1 = new Decimal(input.singleSwitchCount || 0);
    const s2 = new Decimal(input.doubleSwitchCount || 0);
    const sk = new Decimal(input.socketOutletsCount || 0);
    const ac = new Decimal(input.acOutletsCount || 0);
    const mcb = new Decimal(input.mcbCount || 1);

    const totalPoints = l.plus(s1).plus(s2).plus(sk).plus(ac);

    // If route lengths not explicitly supplied, estimate standard branch allowance
    const cableLen = input.cableRouteLengthM !== undefined
      ? new Decimal(input.cableRouteLengthM)
      : totalPoints.times(8); // 8m average per point

    const conduitLen = input.conduitLengthM !== undefined
      ? new Decimal(input.conduitLengthM)
      : cableLen;

    return {
      totalPoints: totalPoints.toNumber(),
      lightingPoints: l.toNumber(),
      switchesCount: s1.plus(s2).toNumber(),
      socketsCount: sk.plus(ac).toNumber(),
      mcbCount: mcb.toNumber(),
      cableLengthM: PrecisionEngine.applyPolicy(cableLen.toNumber(), 'DECIMAL_2'),
      conduitLengthM: PrecisionEngine.applyPolicy(conduitLen.toNumber(), 'DECIMAL_2'),
    };
  }

  /**
   * 21 & 22. Water Supply & Wastewater Pipe Routes
   */
  public static calculatePlumbing(input: PlumbingRouteInput): PlumbingRouteOutput {
    let totalLenDec = new Decimal(0);
    let totalFittings = 0;
    let totalValves = 0;
    const byType: Record<string, number> = {};

    for (const seg of input.segments || []) {
      const len = new Decimal(seg.lengthM || 0);
      totalLenDec = totalLenDec.plus(len);
      totalFittings += seg.fittingsCount || 0;
      totalValves += seg.valvesCount || 0;

      const typeKey = `${seg.pipeType}_${seg.diameterInch || 'std'}`;
      byType[typeKey] = (byType[typeKey] || 0) + len.toNumber();
    }

    return {
      totalLengthM: PrecisionEngine.applyPolicy(totalLenDec.toNumber(), 'DECIMAL_2'),
      lengthByType: byType,
      totalFittings,
      totalValves,
      floorDrainsCount: input.floorDrainsCount || 0,
      cleanOutCount: input.cleanOutCount || 0,
    };
  }

  /**
   * 23. Sanitary Fixtures Takeoff
   */
  public static calculateSanitary(input: SanitaryFixtureInput): SanitaryFixtureOutput {
    const wcD = input.waterClosetDudukCount || 0;
    const wcJ = input.waterClosetJongkokCount || 0;
    const wb = input.washBasinCount || 0;
    const sh = input.showerSetCount || 0;
    const ks = input.kitchenSinkCount || 0;
    const fd = input.floorDrainCount || 0;

    const total = wcD + wcJ + wb + sh + ks + fd;

    return {
      totalUnits: total,
      breakdown: {
        klosetDuduk: wcD,
        klosetJongkok: wcJ,
        wastafel: wb,
        showerSet: sh,
        kitchenSink: ks,
        floorDrain: fd,
      },
    };
  }

  /**
   * 24. Drainage Channel Excavation & Masonry
   */
  public static calculateDrainage(input: DrainageChannelInput): DrainageChannelOutput {
    const l = new Decimal(input.lengthM || 0);
    const topW = new Decimal(input.topWidthM || 0);
    const botW = input.bottomWidthM !== undefined ? new Decimal(input.bottomWidthM) : topW;
    const d = new Decimal(input.depthM || 0);
    const t = new Decimal(input.wallThicknessM || 0.10);

    // Excavation: trapezoid section area * length
    const excSection = topW.plus(botW).times(0.5).times(d);
    const excVol = excSection.times(l);

    // Bed concrete: botW * t * length
    const bedVol = botW.times(t).times(l);

    // 2 side walls: 2 * (d * t * l)
    const wallVol = new Decimal(2).times(d).times(t).times(l);

    // Cover slab area: topW * length
    const coverArea = topW.times(l);

    return {
      excavationVolumeM3: PrecisionEngine.applyPolicy(excVol.toNumber(), 'DECIMAL_2'),
      channelBedVolumeM3: PrecisionEngine.applyPolicy(bedVol.toNumber(), 'DECIMAL_2'),
      channelWallVolumeM3: PrecisionEngine.applyPolicy(wallVol.toNumber(), 'DECIMAL_2'),
      coverSlabAreaM2: PrecisionEngine.applyPolicy(coverArea.toNumber(), 'DECIMAL_2'),
    };
  }
}

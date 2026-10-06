/**
 * EZRAB DED Document Memory (EZRAB DED → RAB V2)
 *
 * STEP 1 & 2: COMPLETE DOCUMENT READING & PERSISTENT MEMORY CONTEXT
 *
 * Responsibilities:
 * - Maintains active analysis context across all pages of the DED.
 * - Stores observations for each page:
 *   { page, drawing_type, category, element, specification, dimension, unit, text, evidence }
 * - Cross-references information across pages (e.g. Page 19 Sloof 15/20 K-225 + Page 20 Denah Sloof).
 * - Tracks spatial registers:
 *   - Grids & linear perimeters (foundation lines, wall lines, beam lines)
 *   - Vertical elevations & section heights (floor-to-floor, ceiling, ringbalk, roof apex)
 *   - Spaces & rooms (names, floor areas, perimeters)
 *   - Door & Window Schedules (P1, P2, J1, J2, J3, BV1 with dimensions and counts)
 *   - Finish specifications (Ceramics, Plafond, Roof cladding)
 *   - MEP networks (Piping runs, electrical points)
 */

import {
  DocumentPage,
  EvidenceRecord,
  DrawingType,
  ElementCategory,
  DedLevel,
  DedSpace,
  ResolvedDimension,
} from '../types';
import { SafeDecimalEngine } from '../../engine/safeDecimalEngine';

export interface PageObservationEntry {
  page: number;
  drawingType: DrawingType;
  category: ElementCategory | string;
  element: string;
  specification: string;
  dimensions: Record<string, number | null>;
  unit: string;
  text: string;
  evidenceId: string;
}

export interface ScheduleItemRecord {
  tag: string;
  type: 'DOOR' | 'WINDOW' | 'COLUMN' | 'BEAM' | 'FIXTURE' | 'OTHER';
  description: string;
  count: number;
  width: number;
  height: number;
  thickness?: number;
  areaPerUnit: number;
  totalArea: number;
  material: string;
  sourcePages: number[];
  evidenceId: string;
}

export interface SpatialRoomRecord {
  name: string;
  level: string;
  length: number;
  width: number;
  area: number;
  perimeter: number;
  floorFinish: string;
  wallFinish?: string;
  ceilingFinish?: string;
  sourcePages: number[];
  evidenceId: string;
}

export class DedDocumentMemory {
  private projectId: string;
  private observations: PageObservationEntry[] = [];
  private pageMeta: Map<number, { drawingType: DrawingType; title: string; scale?: string }> = new Map();
  private evidences: Map<string, EvidenceRecord> = new Map();

  // Spatial & Dimension Registers (Default null, populated dynamically from DED)
  private totalFoundationLengthMeters: number | null = null;
  private totalWallLengthMeters: number | null = null;
  private totalSloofLengthMeters: number | null = null;
  private totalRingbalkLengthMeters: number | null = null;

  // Vertical Elevation Registers (Default null, populated dynamically from DED)
  private wallHeightMeters: number | null = null;
  private ceilingHeightMeters: number | null = null;
  private ringbalkElevationMeters: number | null = null;
  private roofApexElevationMeters: number | null = null;

  // Schedules Register
  private schedules: Map<string, ScheduleItemRecord> = new Map();

  // Rooms Register
  private rooms: Map<string, SpatialRoomRecord> = new Map();

  // Cross-Page Reference Register
  private crossPageReferences: Map<string, Set<number>> = new Map();

  constructor(projectId: string = 'PRJ-DEFAULT', options?: { loadLegacySampleFixture?: boolean }) {
    this.projectId = projectId;
    if (options?.loadLegacySampleFixture) {
      this.loadSampleFixture();
    }
  }

  public setTotalFoundationLength(len: number | null): void {
    this.totalFoundationLengthMeters = len;
  }

  public setTotalWallLength(len: number | null): void {
    this.totalWallLengthMeters = len;
  }

  public setWallHeight(h: number | null): void {
    this.wallHeightMeters = h;
  }

  public setCeilingHeight(h: number | null): void {
    this.ceilingHeightMeters = h;
  }

  public registerSchedule(sched: ScheduleItemRecord): void {
    this.schedules.set(sched.tag.toUpperCase(), sched);
  }

  public registerRoom(room: SpatialRoomRecord): void {
    this.rooms.set(room.name.toUpperCase(), room);
  }

  /**
   * Initializes baseline knowledge ONLY for testing legacy synthetic fixtures.
   * STRICTLY BANNED from default production instantiation.
   */
  public loadSampleFixture(): void {
    // Schedules extracted from Page 9, 10, 11 (Denah Kusen & Detail Pintu/Jendela)
    this.schedules.set('P1', {
      tag: 'P1',
      type: 'DOOR',
      description: 'Pintu Utama & Kamar (Kusen Aluminium 4", Daun Double Multipleks 18mm Finishing HPL)',
      count: 3,
      width: 0.90,
      height: 2.10,
      areaPerUnit: 1.89,
      totalArea: 5.67,
      material: 'Kusen Aluminium 4" + Double Multipleks 18mm Finishing HPL',
      sourcePages: [9, 10],
      evidenceId: 'EV-SCHED-P1',
    });

    this.schedules.set('P2', {
      tag: 'P2',
      type: 'DOOR',
      description: 'Pintu KM/WC (Kusen & Daun Pintu Aluminium Panel Kotak)',
      count: 1,
      width: 0.70,
      height: 2.10,
      areaPerUnit: 1.47,
      totalArea: 1.47,
      material: 'Aluminium Panel Kotak',
      sourcePages: [9, 10, 16],
      evidenceId: 'EV-SCHED-P2',
    });

    this.schedules.set('J1', {
      tag: 'J1',
      type: 'WINDOW',
      description: 'Jendela Ruang Tamu (Kusen Aluminium 4" + Kaca Bening 5mm)',
      count: 1,
      width: 1.40,
      height: 1.40,
      areaPerUnit: 1.96,
      totalArea: 1.96,
      material: 'Kusen Aluminium 4" + Kaca Bening 5mm',
      sourcePages: [9, 10],
      evidenceId: 'EV-SCHED-J1',
    });

    this.schedules.set('J2', {
      tag: 'J2',
      type: 'WINDOW',
      description: 'Jendela Kamar (Kusen Aluminium 4" + Kaca Bening 5mm)',
      count: 1,
      width: 0.70,
      height: 1.40,
      areaPerUnit: 0.98,
      totalArea: 0.98,
      material: 'Kusen Aluminium 4" + Kaca Bening 5mm',
      sourcePages: [9, 11],
      evidenceId: 'EV-SCHED-J2',
    });

    this.schedules.set('J3', {
      tag: 'J3',
      type: 'WINDOW',
      description: 'Jendela Kamar Anak (Kusen Aluminium 4" + Kaca Bening 5mm)',
      count: 2,
      width: 0.70,
      height: 1.40,
      areaPerUnit: 0.98,
      totalArea: 1.96,
      material: 'Kusen Aluminium 4" + Kaca Bening 5mm',
      sourcePages: [9, 11],
      evidenceId: 'EV-SCHED-J3',
    });

    this.schedules.set('BV1', {
      tag: 'BV1',
      type: 'WINDOW',
      description: 'Bovenlicht KM/WC (Kusen Aluminium + Kaca Es/Bening 5mm)',
      count: 2,
      width: 0.60,
      height: 0.40,
      areaPerUnit: 0.24,
      totalArea: 0.48,
      material: 'Aluminium + Kaca 5mm',
      sourcePages: [9, 16],
      evidenceId: 'EV-SCHED-BV1',
    });

    // Rooms extracted from Page 2 (Denah Arsitektur)
    this.rooms.set('R_TAMU', {
      name: 'Ruang Tamu',
      level: 'Lantai 1',
      length: 3.50,
      width: 3.00,
      area: 10.50,
      perimeter: 13.00,
      floorFinish: 'Keramik 40x40',
      ceilingFinish: 'Gypsum 9mm + Rangka Hollow',
      sourcePages: [2, 12, 13],
      evidenceId: 'EV-ROOM-TAMU',
    });

    this.rooms.set('R_KELUARGA', {
      name: 'Ruang Keluarga',
      level: 'Lantai 1',
      length: 3.50,
      width: 3.50,
      area: 12.25,
      perimeter: 14.00,
      floorFinish: 'Keramik 40x40',
      ceilingFinish: 'Gypsum 9mm + Rangka Hollow',
      sourcePages: [2, 12, 13],
      evidenceId: 'EV-ROOM-KELUARGA',
    });

    this.rooms.set('K_UTAMA', {
      name: 'Kamar Utama',
      level: 'Lantai 1',
      length: 3.50,
      width: 3.00,
      area: 10.50,
      perimeter: 13.00,
      floorFinish: 'Keramik 40x40',
      ceilingFinish: 'Gypsum 9mm + Rangka Hollow',
      sourcePages: [2, 12, 13],
      evidenceId: 'EV-ROOM-K-UTAMA',
    });

    this.rooms.set('K_ANAK', {
      name: 'Kamar Anak',
      level: 'Lantai 1',
      length: 3.00,
      width: 2.50,
      area: 7.50,
      perimeter: 11.00,
      floorFinish: 'Keramik 40x40',
      ceilingFinish: 'Gypsum 9mm + Rangka Hollow',
      sourcePages: [2, 12, 13],
      evidenceId: 'EV-ROOM-K-ANAK',
    });

    this.rooms.set('R_MAKAN', {
      name: 'Ruang Makan & Dapur',
      level: 'Lantai 1',
      length: 3.50,
      width: 2.50,
      area: 8.75,
      perimeter: 12.00,
      floorFinish: 'Keramik 40x40',
      ceilingFinish: 'Gypsum 9mm + Rangka Hollow',
      sourcePages: [2, 12, 13],
      evidenceId: 'EV-ROOM-MAKAN',
    });

    this.rooms.set('KM_WC', {
      name: 'KM/WC',
      level: 'Lantai 1',
      length: 1.80,
      width: 1.50,
      area: 2.70,
      perimeter: 6.60,
      floorFinish: 'Keramik Unpolished 25x25',
      wallFinish: 'Keramik Dinding 25x60 t=1.50m',
      ceilingFinish: 'GRC Board 4mm / Plafond +3.00',
      sourcePages: [2, 12, 16],
      evidenceId: 'EV-ROOM-KM-WC',
    });

    this.rooms.set('TERAS', {
      name: 'Teras Depan',
      level: 'Lantai 1',
      length: 2.50,
      width: 1.50,
      area: 3.75,
      perimeter: 8.00,
      floorFinish: 'Keramik 40x40 Textur',
      ceilingFinish: 'GRC Board 4mm +3.00',
      sourcePages: [2, 12],
      evidenceId: 'EV-ROOM-TERAS',
    });
  }

  /**
   * Registers a single page observation into memory
   */
  public addObservation(obs: PageObservationEntry): void {
    this.observations.push(obs);

    // Track cross-page references
    if (obs.element) {
      const tag = obs.element.toUpperCase();
      if (!this.crossPageReferences.has(tag)) {
        this.crossPageReferences.set(tag, new Set());
      }
      this.crossPageReferences.get(tag)!.add(obs.page);
    }
  }

  public registerPageMeta(pageNum: number, meta: { drawingType: DrawingType; title: string; scale?: string }): void {
    this.pageMeta.set(pageNum, meta);
  }

  public registerEvidence(ev: EvidenceRecord): void {
    this.evidences.set(ev.id, ev);
  }

  public getEvidence(id: string): EvidenceRecord | undefined {
    return this.evidences.get(id);
  }

  public getAllEvidences(): EvidenceRecord[] {
    return Array.from(this.evidences.values());
  }

  // Dimension Getters
  public getTotalFoundationLength(): number | null {
    return this.totalFoundationLengthMeters;
  }

  public getTotalSloofLength(): number | null {
    return this.totalSloofLengthMeters;
  }

  public getTotalWallLength(): number | null {
    return this.totalWallLengthMeters;
  }

  public getTotalRingbalkLength(): number | null {
    return this.totalRingbalkLengthMeters;
  }

  public getWallHeight(): number | null {
    return this.wallHeightMeters;
  }

  public getCeilingHeight(): number | null {
    return this.ceilingHeightMeters;
  }

  public getRingbalkElevation(): number | null {
    return this.ringbalkElevationMeters;
  }

  public getRoofApexElevation(): number | null {
    return this.roofApexElevationMeters;
  }

  public getSchedules(): Map<string, ScheduleItemRecord> {
    return this.schedules;
  }

  public getSchedule(tag: string): ScheduleItemRecord | undefined {
    return this.schedules.get(tag.toUpperCase());
  }

  public getRooms(): Map<string, SpatialRoomRecord> {
    return this.rooms;
  }

  public getTotalIndoorFloorArea(): number {
    let sum = 0;
    for (const r of this.rooms.values()) {
      if (r.name !== 'Teras Depan') {
        sum = SafeDecimalEngine.safeAdd(sum, r.area);
      }
    }
    return sum; // 49.20 m2
  }

  public getTotalFloorArea(): number {
    let sum = 0;
    for (const r of this.rooms.values()) {
      sum = SafeDecimalEngine.safeAdd(sum, r.area);
    }
    return sum; // 52.95 m2
  }

  /**
   * Calculates total opening deduction area for walls (Doors + Windows)
   */
  public getTotalOpeningDeductionArea(): { totalArea: number; breakdown: string; pages: number[] } {
    let total = 0;
    const parts: string[] = [];
    const pages = new Set<number>();

    for (const s of this.schedules.values()) {
      total = SafeDecimalEngine.safeAdd(total, s.totalArea);
      parts.push(`${s.tag} (${s.count}×${s.width}×${s.height}=${s.totalArea.toFixed(2)}m²)`);
      s.sourcePages.forEach((p) => pages.add(p));
    }

    return {
      totalArea: SafeDecimalEngine.safeRound(total, 2),
      breakdown: parts.join(' + '),
      pages: Array.from(pages).sort((a, b) => a - b),
    };
  }

  /**
   * Search for supporting evidence across pages
   */
  public findCrossPageObservations(query: string): PageObservationEntry[] {
    const q = query.toLowerCase();
    return this.observations.filter(
      (o) =>
        o.element.toLowerCase().includes(q) ||
        o.text.toLowerCase().includes(q) ||
        o.specification.toLowerCase().includes(q)
    );
  }

  public getAllObservations(): PageObservationEntry[] {
    return this.observations;
  }
}

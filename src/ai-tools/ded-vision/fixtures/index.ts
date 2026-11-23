/**
 * DED drawing-vision benchmark — fixture registry (I10a).
 *
 * Three honest tiers:
 * - synthetic: hand-built, full ground truth (10 documents — I11 Stage 3
 *   added id-jadwal-kusen).
 * - internet: public sample drawings, ground truth only where verified
 *   (see internet.ts — populated by the I10a worker after sourcing;
 *   I11 Stage 3 added the KRS Indonesian set).
 * - owner: EMPTY until the owner sends their own drawings. The harness
 *   reports the empty tier and never fails on it.
 */

import { AUTOCAD_FIXTURE } from './autocad';
import { BUILDING_FIXTURE } from './building';
import { DAM_SDA_FIXTURE } from './damSda';
import { HOUSE_FIXTURE } from './house';
import { ID_JADWAL_KUSEN_FIXTURE } from './idJadwalKusen';
import { INTERNET_FIXTURES } from './internet';
import { NEGATIVES_FIXTURE } from './negatives';
import { ROAD_BRIDGE_FIXTURE } from './roadBridge';
import { ROOF_DETAIL_FIXTURE } from './roofDetail';
import { SCANNED_FIXTURE } from './scanned';
import { STRUCTURAL_FIXTURE } from './structural';
import type { BenchmarkFixture } from './types';

export const SYNTHETIC_FIXTURES: BenchmarkFixture[] = [
  HOUSE_FIXTURE,
  BUILDING_FIXTURE,
  STRUCTURAL_FIXTURE,
  ROOF_DETAIL_FIXTURE,
  ROAD_BRIDGE_FIXTURE,
  DAM_SDA_FIXTURE,
  SCANNED_FIXTURE,
  AUTOCAD_FIXTURE,
  NEGATIVES_FIXTURE,
  ID_JADWAL_KUSEN_FIXTURE,
];

export { INTERNET_FIXTURES };

/**
 * Owner tier — EMPTY until the owner sends their own drawings
 * (PLAN.md §6.3). Real-document accuracy cannot be measured until then;
 * the harness reports this tier as empty, never as a failure.
 */
export const OWNER_FIXTURES: BenchmarkFixture[] = [];

export function allFixtures(): BenchmarkFixture[] {
  return [...SYNTHETIC_FIXTURES, ...INTERNET_FIXTURES, ...OWNER_FIXTURES];
}

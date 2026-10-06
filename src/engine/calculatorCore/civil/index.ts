import { CalculatorDefinition } from '../contracts/types';
import { DRAINAGE_PACK_CALCULATORS } from './drainage/drainagePackCalculators';
import { BRIDGE_PACK_CALCULATORS } from './bridge/bridgePackCalculators';
import { IRRIGATION_PACK_CALCULATORS } from './irrigation/irrigationPackCalculators';
import { RIVER_PACK_CALCULATORS } from './river/riverPackCalculators';
import { WEIR_PACK_CALCULATORS } from './weir/weirPackCalculators';
import { EMBUNG_PACK_CALCULATORS } from './embung/embungPackCalculators';
import { DAM_PACK_CALCULATORS } from './dam/damPackCalculators';
import { WATER_STRUCTURE_PACK_CALCULATORS } from './waterStructure/waterStructurePackCalculators';

export {
  DRAINAGE_PACK_CALCULATORS,
  BRIDGE_PACK_CALCULATORS,
  IRRIGATION_PACK_CALCULATORS,
  RIVER_PACK_CALCULATORS,
  WEIR_PACK_CALCULATORS,
  EMBUNG_PACK_CALCULATORS,
  DAM_PACK_CALCULATORS,
  WATER_STRUCTURE_PACK_CALCULATORS,
};

export const ALL_CIVIL_EXPANSION_CALCULATORS: CalculatorDefinition[] = [
  ...DRAINAGE_PACK_CALCULATORS,
  ...BRIDGE_PACK_CALCULATORS,
  ...IRRIGATION_PACK_CALCULATORS,
  ...RIVER_PACK_CALCULATORS,
  ...WEIR_PACK_CALCULATORS,
  ...EMBUNG_PACK_CALCULATORS,
  ...DAM_PACK_CALCULATORS,
  ...WATER_STRUCTURE_PACK_CALCULATORS,
];

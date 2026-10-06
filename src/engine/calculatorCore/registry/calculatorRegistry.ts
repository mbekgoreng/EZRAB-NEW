/**
 * EZRAB CALCULATOR CORE — CALCULATOR REGISTRY
 * Unified, versioned, namespaced calculator registry supporting all Packs and Legacy calculators.
 */

import {
  CalculatorDefinition,
  CalculationContext,
  CalculationInput,
  CalculationOutput,
  ValidationSummary,
} from '../contracts/types';
import { CONSTRUCTION_CALCULATORS, getCalculatorById as getLegacyCalculatorById } from '../../constructionCalculators/registry';
import { LegacyCalculatorAdapter } from '../adapters/legacyCalculatorAdapter';
import { RoadGeometryCalculator } from '../calculators/road/roadGeometryCalculator';
import { PavingGeometryCalculator } from '../calculators/paving/pavingGeometryCalculator';
import { EarthworkGalianCalculator, FenceCalculator } from '../calculators/building/buildingExtensions';
import { RESIDENTIAL_PACK_CALCULATORS } from '../residential/residentialPackCalculators';
import { ROAD_PACK_CALCULATORS } from '../road/roadPackCalculators';
import { ALL_CIVIL_EXPANSION_CALCULATORS } from '../civil';
import { PackRegistry } from '../packs/packRegistry';
import { ValidationEngine } from '../validation/validationEngine';

export class CalculatorNotFoundError extends Error {
  constructor(id: string) {
    super(`Calculator with ID "${id}" was not found in registry.`);
    this.name = 'CalculatorNotFoundError';
  }
}

export class CoreCalculatorRegistry {
  private static calculators: Map<string, CalculatorDefinition> = new Map();
  private static aliases: Map<string, string> = new Map();

  static {
    CoreCalculatorRegistry.initialize();
  }

  private static initialize(): void {
    // 1. Register 19 Legacy Calculators via Adapter (preserving exact formulas)
    for (const legacySpec of CONSTRUCTION_CALCULATORS) {
      const adapted = LegacyCalculatorAdapter.adapt(legacySpec);
      CoreCalculatorRegistry.register(adapted);

      // Register namespaced aliases
      const normalizedCategory = legacySpec.category || 'structure';
      const namespacedId = `building.${normalizedCategory}.${legacySpec.id.toLowerCase()}`;
      CoreCalculatorRegistry.registerAlias(namespacedId, legacySpec.id);
    }

    // Common aliases for legacy IDs
    CoreCalculatorRegistry.registerAlias('PONDASI_BATU_KALI', 'PONDASI');
    CoreCalculatorRegistry.registerAlias('building.foundation.pondasi_batu_kali', 'PONDASI');
    CoreCalculatorRegistry.registerAlias('building.structure.sloof', 'SLOOF');
    CoreCalculatorRegistry.registerAlias('building.structure.foot_plate', 'FOOT_PLATE');
    CoreCalculatorRegistry.registerAlias('building.structure.kolom', 'KOLOM');
    CoreCalculatorRegistry.registerAlias('building.structure.balok', 'BALOK');

    // 2. Register New Pack Calculators
    CoreCalculatorRegistry.register(RoadGeometryCalculator);
    CoreCalculatorRegistry.registerAlias('road.area', 'road.geometry');
    CoreCalculatorRegistry.registerAlias('road.volume', 'road.geometry');

    CoreCalculatorRegistry.register(PavingGeometryCalculator);
    CoreCalculatorRegistry.registerAlias('paving.area', 'paving.geometry');
    CoreCalculatorRegistry.registerAlias('paving.bedding', 'paving.geometry');

    CoreCalculatorRegistry.register(EarthworkGalianCalculator);
    CoreCalculatorRegistry.registerAlias('earthwork.galian', 'building.earthwork.galian');

    CoreCalculatorRegistry.register(FenceCalculator);
    CoreCalculatorRegistry.registerAlias('building.pagar', 'building.fence');

    // 3. Register Residential Building Pack (30 capabilities)
    for (const resCalc of RESIDENTIAL_PACK_CALCULATORS) {
      CoreCalculatorRegistry.register(resCalc);
    }

    // 4. Register Road & Highway Pack (39 capabilities)
    for (const roadCalc of ROAD_PACK_CALCULATORS) {
      CoreCalculatorRegistry.register(roadCalc);
    }

    // 5. Register Civil Expansion Packs (97 capabilities: Drainage, Bridge, Irrigation, River, Weir, Embung, Dam, Water Structure)
    for (const civilCalc of ALL_CIVIL_EXPANSION_CALCULATORS) {
      CoreCalculatorRegistry.register(civilCalc);
    }
  }

  /**
   * Register a new Calculator Definition
   */
  public static register(def: CalculatorDefinition): void {
    const key = def.id.toLowerCase();
    CoreCalculatorRegistry.calculators.set(key, def);
    CoreCalculatorRegistry.aliases.set(key, key);

    // Also link to Pack Registry
    if (def.pack) {
      PackRegistry.addCalculatorToPack(def.pack, def.id);
    }
  }

  /**
   * Register an alias pointing to an existing calculator ID
   */
  public static registerAlias(alias: string, targetId: string): void {
    CoreCalculatorRegistry.aliases.set(alias.toLowerCase(), targetId.toLowerCase());
  }

  /**
   * Check if calculator exists by ID or alias
   */
  public static has(id: string): boolean {
    const key = id.toLowerCase();
    const resolvedKey = CoreCalculatorRegistry.aliases.get(key) || key;
    return CoreCalculatorRegistry.calculators.has(resolvedKey);
  }

  /**
   * Get Calculator Definition by ID or alias
   */
  public static get(id: string): CalculatorDefinition | undefined {
    const key = id.toLowerCase();
    const resolvedKey = CoreCalculatorRegistry.aliases.get(key) || key;
    return CoreCalculatorRegistry.calculators.get(resolvedKey);
  }

  /**
   * List all registered calculators
   */
  public static list(): CalculatorDefinition[] {
    return Array.from(CoreCalculatorRegistry.calculators.values());
  }

  /**
   * Get calculators by pack ID (e.g. 'building', 'road', 'paving', 'water-structure', 'steel')
   */
  public static getByPack(packId: string): CalculatorDefinition[] {
    const normPackId = packId.toLowerCase();
    return Array.from(CoreCalculatorRegistry.calculators.values()).filter(
      (c) => c.pack.toLowerCase() === normPackId
    );
  }

  /**
   * Validate inputs against calculator schema without executing calculation
   */
  public static validateInput(id: string, inputs: CalculationInput): ValidationSummary {
    const calc = CoreCalculatorRegistry.get(id);
    if (!calc) {
      throw new CalculatorNotFoundError(id);
    }
    return ValidationEngine.validate(inputs, calc.parameters);
  }

  /**
   * Execute calculation with authoritative context and typed validation
   */
  public static calculate(
    id: string,
    inputs: CalculationInput,
    context: CalculationContext
  ): CalculationOutput {
    const calc = CoreCalculatorRegistry.get(id);
    if (!calc) {
      throw new CalculatorNotFoundError(id);
    }

    const output = calc.calculate(inputs, context);
    return {
      ...output,
      calculatorId: output.calculatorId || calc.id,
      version: output.version || calc.version,
      provenance: output.provenance || (calc.formulaSource ? [calc.formulaSource] : []),
    };
  }
}

// Global convenience export
export const calculatorRegistry = CoreCalculatorRegistry;

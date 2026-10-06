/**
 * EZRAB CALCULATOR CORE — DEPENDENCY DAG ENGINE
 * Dependency graph resolution, cycle detection, topological execution, and quantity ownership.
 */

import {
  CalculationDependency,
  CalculationOutput,
  QuantityOwnership,
  QuantityPolicy,
  DependencyStatus,
} from '../contracts/types';

export interface DependencyNode {
  calculatorId: string;
  version: string;
  dependencies: CalculationDependency[];
}

export interface ResolvedDependencyValue {
  sourceCalculatorId: string;
  sourceField: string;
  targetParameter: string;
  value: number;
  policy: QuantityPolicy;
  status: DependencyStatus;
}

export class DependencyGraphError extends Error {
  public readonly cyclePath?: string[];

  constructor(message: string, cyclePath?: string[]) {
    super(message);
    this.name = 'DependencyGraphError';
    this.cyclePath = cyclePath;
  }
}

export class DependencyEngine {
  private nodes: Map<string, DependencyNode> = new Map();

  public registerNode(calculatorId: string, version: string, dependencies: CalculationDependency[] = []): void {
    this.nodes.set(calculatorId.toLowerCase(), {
      calculatorId,
      version,
      dependencies,
    });
  }

  public getNode(calculatorId: string): DependencyNode | undefined {
    return this.nodes.get(calculatorId.toLowerCase());
  }

  /**
   * Detect cycles in the registered dependency graph using DFS.
   * Returns cycle path if detected, or null if acyclic.
   */
  public detectCycle(): string[] | null {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);

      const node = this.nodes.get(nodeId);
      if (node) {
        for (const dep of node.dependencies) {
          const depId = dep.sourceCalculatorId.toLowerCase();
          if (!visited.has(depId)) {
            if (dfs(depId)) return true;
          } else if (recursionStack.has(depId)) {
            path.push(depId);
            return true;
          }
        }
      }

      recursionStack.delete(nodeId);
      path.pop();
      return false;
    };

    for (const nodeId of this.nodes.keys()) {
      if (!visited.has(nodeId)) {
        if (dfs(nodeId)) {
          return path;
        }
      }
    }

    return null;
  }

  /**
   * Topologically sort target calculators in execution order.
   */
  public getExecutionPlan(targetCalculatorIds: string[]): string[] {
    const cycle = this.detectCycle();
    if (cycle) {
      throw new DependencyGraphError(`Cyclic dependency detected in calculation graph: ${cycle.join(' -> ')}`, cycle);
    }

    const order: string[] = [];
    const visited = new Set<string>();

    const visit = (nodeId: string) => {
      const normalizedId = nodeId.toLowerCase();
      if (visited.has(normalizedId)) return;
      visited.add(normalizedId);

      const node = this.nodes.get(normalizedId);
      if (node) {
        for (const dep of node.dependencies) {
          // Only resolve active or verified dependencies in automatic execution plan
          if (dep.status === 'active' || dep.status === 'verified') {
            visit(dep.sourceCalculatorId);
          }
        }
      }

      order.push(node ? node.calculatorId : nodeId);
    };

    for (const id of targetCalculatorIds) {
      visit(id);
    }

    return order;
  }

  /**
   * Resolve parameter values for a calculator from existing upstream calculation outputs.
   */
  public static resolveInputDependencies(
    dependencies: CalculationDependency[],
    upstreamResults: Record<string, CalculationOutput>
  ): {
    resolvedInputs: Record<string, number>;
    traces: ResolvedDependencyValue[];
    missingDependencies: string[];
  } {
    const resolvedInputs: Record<string, number> = {};
    const traces: ResolvedDependencyValue[] = [];
    const missingDependencies: string[] = [];

    for (const dep of dependencies) {
      // If dependency is only a candidate (unverified hypothesis), do not auto-inject
      if (dep.status !== 'active' && dep.status !== 'verified') {
        continue;
      }

      const upstream = upstreamResults[dep.sourceCalculatorId] || upstreamResults[dep.sourceCalculatorId.toLowerCase()];

      if (!upstream) {
        missingDependencies.push(dep.sourceCalculatorId);
        continue;
      }

      let rawVal: number | undefined;

      if (dep.sourceOutputField === 'primaryQuantity' || dep.sourceOutputField === 'primary') {
        rawVal = upstream.primaryQuantity;
      } else if (upstream.breakdown && typeof upstream.breakdown[dep.sourceOutputField] === 'number') {
        rawVal = upstream.breakdown[dep.sourceOutputField];
      }

      if (rawVal !== undefined) {
        const factor = dep.conversionFactor ?? 1;
        const finalVal = rawVal * factor;
        resolvedInputs[dep.targetParameter] = finalVal;

        traces.push({
          sourceCalculatorId: dep.sourceCalculatorId,
          sourceField: dep.sourceOutputField,
          targetParameter: dep.targetParameter,
          value: finalVal,
          policy: dep.policy,
          status: dep.status,
        });
      } else {
        missingDependencies.push(`${dep.sourceCalculatorId}.${dep.sourceOutputField}`);
      }
    }

    return {
      resolvedInputs,
      traces,
      missingDependencies,
    };
  }
}

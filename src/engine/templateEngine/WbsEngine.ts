import { ConstructionProjectTemplate, ParameterValue, WbsNode } from './types';

export interface FlatWbsItem {
  code: string;
  title: string;
  level: 1 | 2 | 3;
  unit?: string;
  ahspCode?: string;
  category?: string;
  isOptional?: boolean;
}

export class WbsEngine {
  /**
   * Generates active WBS tree by filtering conditional nodes based on evaluated parameters.
   */
  public static generateWbsTree(
    template: ConstructionProjectTemplate,
    parameters: Record<string, ParameterValue>
  ): WbsNode[] {
    return this.filterNodes(template.wbsHierarchy, parameters);
  }

  /**
   * Flattens the hierarchical WBS tree into a linear list suitable for the RAB Spreadsheet.
   */
  public static flattenWbs(nodes: WbsNode[]): FlatWbsItem[] {
    const flatList: FlatWbsItem[] = [];

    const traverse = (node: WbsNode, currentCategory?: string) => {
      const cat = node.level === 1 ? node.title : currentCategory;
      flatList.push({
        code: node.code,
        title: node.title,
        level: node.level,
        unit: node.unit,
        ahspCode: node.ahspCode,
        category: cat,
        isOptional: node.isOptional
      });

      if (node.children && node.children.length > 0) {
        node.children.forEach(child => traverse(child, cat));
      }
    };

    nodes.forEach(rootNode => traverse(rootNode));
    return flatList;
  }

  private static filterNodes(nodes: WbsNode[], parameters: Record<string, ParameterValue>): WbsNode[] {
    const filtered: WbsNode[] = [];

    for (const node of nodes) {
      if (node.conditionalRule) {
        const param = parameters[node.conditionalRule.parameterId];
        const val = param ? param.value : undefined;

        let rulePassed = false;
        switch (node.conditionalRule.operator) {
          case '>=':
            rulePassed = Number(val) >= Number(node.conditionalRule.value);
            break;
          case '>':
            rulePassed = Number(val) > Number(node.conditionalRule.value);
            break;
          case '<=':
            rulePassed = Number(val) <= Number(node.conditionalRule.value);
            break;
          case '<':
            rulePassed = Number(val) < Number(node.conditionalRule.value);
            break;
          case '==':
            rulePassed = val === node.conditionalRule.value;
            break;
          case '!=':
            rulePassed = val !== node.conditionalRule.value;
            break;
          default:
            rulePassed = true;
        }

        if (!rulePassed) {
          continue; // Skip this node and its children
        }
      }

      // Clone node and process children recursively
      const cloned: WbsNode = { ...node };
      if (node.children && node.children.length > 0) {
        cloned.children = this.filterNodes(node.children, parameters);
      }
      filtered.push(cloned);
    }

    return filtered;
  }
}

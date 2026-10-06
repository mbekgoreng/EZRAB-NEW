import { TemplateRegistry } from './TemplateRegistry';
import { TemplateClassifier } from './TemplateClassifier';
import { TemplateSelector } from './TemplateSelector';
import { ParameterEngine } from './ParameterEngine';
import { AssumptionEngine } from './AssumptionEngine';
import { ValidationEngine, ValidationResult } from './ValidationEngine';
import { WbsEngine, FlatWbsItem } from './WbsEngine';
import { QuantityEngine } from './QuantityEngine';
import { AhspPriceBridge } from './AhspPriceBridge';
import {
  ConstructionProjectTemplate,
  ClassificationResult,
  ParameterValue,
  ProjectCategory,
  GeneratedRabItem,
  CalculatedQuantityItem
} from './types';

export class TemplateEngine {
  private static instance: TemplateEngine;
  private registry: TemplateRegistry;
  private classifier: TemplateClassifier;
  private selector: TemplateSelector;

  private constructor() {
    this.registry = TemplateRegistry.getInstance();
    this.classifier = new TemplateClassifier(this.registry);
    this.selector = new TemplateSelector(this.registry);
  }

  public static getInstance(): TemplateEngine {
    if (!TemplateEngine.instance) {
      TemplateEngine.instance = new TemplateEngine();
    }
    return TemplateEngine.instance;
  }

  public getRegistry(): TemplateRegistry {
    return this.registry;
  }

  public getClassifier(): TemplateClassifier {
    return this.classifier;
  }

  public getSelector(): TemplateSelector {
    return this.selector;
  }

  /**
   * High-level prompt classifier
   */
  public classifyPrompt(prompt: string): ClassificationResult {
    return this.classifier.classify(prompt);
  }

  /**
   * Get template by ID
   */
  public getTemplate(id: string): ConstructionProjectTemplate | undefined {
    return this.registry.getById(id);
  }

  /**
   * Get all available templates
   */
  public getAllTemplates(): ConstructionProjectTemplate[] {
    return this.registry.getAll();
  }

  /**
   * Get templates by category (BUILDING or INFRASTRUCTURE)
   */
  public getTemplatesByCategory(category: ProjectCategory): ConstructionProjectTemplate[] {
    return this.registry.getByCategory(category);
  }

  /**
   * Create an immutable snapshot of a template for project persistence
   */
  public createSnapshot(templateIdOrTemplate: string | ConstructionProjectTemplate): ConstructionProjectTemplate {
    const tmpl = typeof templateIdOrTemplate === 'string'
      ? this.selector.selectById(templateIdOrTemplate)
      : templateIdOrTemplate;
    return this.selector.createSnapshot(tmpl);
  }

  /**
   * Generate active WBS hierarchy and flat items based on evaluated parameters
   */
  public generateWbs(
    templateId: string,
    parameters: Record<string, ParameterValue>
  ): { activeTree: any[]; flatItems: FlatWbsItem[] } {
    const template = this.selector.selectById(templateId);
    const activeTree = WbsEngine.generateWbsTree(template, parameters);
    const flatItems = WbsEngine.flattenWbs(activeTree);
    return { activeTree, flatItems };
  }

  /**
   * Calculate quantities using QuantityEngine
   */
  public calculateQuantities(
    templateId: string,
    parameters: Record<string, ParameterValue>,
    dedAvailable: boolean = false
  ): Record<string, CalculatedQuantityItem> {
    const template = this.selector.selectById(templateId);
    return QuantityEngine.calculateQuantities(template, parameters, dedAvailable);
  }

  /**
   * Validates parameters against template rules
   */
  public validate(
    templateId: string,
    parameters: Record<string, ParameterValue>
  ): ValidationResult {
    const template = this.selector.selectById(templateId);
    return ValidationEngine.validate(template, parameters);
  }

  /**
   * Generate full RAB items ready for Spreadsheet & ProjectContext
   */
  public generateRabItems(
    templateId: string,
    parameters: Record<string, ParameterValue>,
    locationCity?: string,
    locationProvince?: string,
    dedAvailable: boolean = false
  ): {
    flatWbs: FlatWbsItem[];
    quantities: Record<string, CalculatedQuantityItem>;
    rabItems: GeneratedRabItem[];
    totalRabEstimate: number;
  } {
    const { flatItems } = this.generateWbs(templateId, parameters);
    const quantities = this.calculateQuantities(templateId, parameters, dedAvailable);
    const rabItems = AhspPriceBridge.mapToRabItems(flatItems, quantities, locationCity, locationProvince);
    const totalRabEstimate = rabItems.reduce((acc, item) => acc + (item.totalPrice || 0), 0);

    return {
      flatWbs: flatItems,
      quantities,
      rabItems,
      totalRabEstimate
    };
  }

  /**
   * Process prompt end-to-end to prepare all project metadata and RAB items
   */
  public processPrompt(prompt: string): {
    classification: ClassificationResult;
    template: ConstructionProjectTemplate;
    templateSnapshot: ConstructionProjectTemplate;
    parameters: Record<string, ParameterValue>;
    validation: ValidationResult;
    wbsFlat: FlatWbsItem[];
    quantities: Record<string, CalculatedQuantityItem>;
    rabItems: GeneratedRabItem[];
    totalRabEstimate: number;
  } {
    const classification = this.classifyPrompt(prompt);
    const template = this.selector.selectFromClassification(classification);
    const templateSnapshot = this.selector.createSnapshot(template);
    const validation = ValidationEngine.validate(template, classification.extractedParameters);
    const { flatItems } = this.generateWbs(template.id, classification.extractedParameters);
    const quantities = QuantityEngine.calculateQuantities(template, classification.extractedParameters, false);
    const locCity = classification.extractedParameters['location_city']?.value;
    const locProv = classification.extractedParameters['location_province']?.value;
    const rabItems = AhspPriceBridge.mapToRabItems(flatItems, quantities, locCity, locProv);
    const totalRabEstimate = rabItems.reduce((acc, item) => acc + (item.totalPrice || 0), 0);

    return {
      classification,
      template,
      templateSnapshot,
      parameters: classification.extractedParameters,
      validation,
      wbsFlat: flatItems,
      quantities,
      rabItems,
      totalRabEstimate
    };
  }
}

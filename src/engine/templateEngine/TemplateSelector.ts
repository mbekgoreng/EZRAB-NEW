import { TemplateRegistry } from './TemplateRegistry';
import { ConstructionProjectTemplate, ClassificationResult } from './types';

export class TemplateSelector {
  private registry: TemplateRegistry;

  constructor(registry?: TemplateRegistry) {
    this.registry = registry || TemplateRegistry.getInstance();
  }

  /**
   * Selects a template based on template ID, falling back to default residential if not found.
   */
  public selectById(templateId: string): ConstructionProjectTemplate {
    const tmpl = this.registry.getById(templateId);
    if (tmpl) return tmpl;

    // Fallback to residential
    const fallback = this.registry.getByType('residential') || this.registry.getAll()[0];
    return fallback;
  }

  /**
   * Selects the best matching template from classification results.
   */
  public selectFromClassification(classification: ClassificationResult): ConstructionProjectTemplate {
    if (classification.topMatch) {
      const tmpl = this.registry.getById(classification.topMatch.templateId);
      if (tmpl) return tmpl;
    }

    // If low confidence or unknown, return custom building or residential pilot
    return this.registry.getByType('custom') || this.registry.getByType('residential') || this.registry.getAll()[0];
  }

  /**
   * Creates an immutable, deep-cloned template snapshot for persistent project freezing.
   * This guarantees that future template updates do not distort existing project RABs.
   */
  public createSnapshot(template: ConstructionProjectTemplate): ConstructionProjectTemplate {
    return JSON.parse(JSON.stringify(template));
  }
}

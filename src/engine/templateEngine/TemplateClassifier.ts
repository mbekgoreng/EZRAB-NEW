import { TemplateRegistry } from './TemplateRegistry';
import { ParameterEngine } from './ParameterEngine';
import { AssumptionEngine } from './AssumptionEngine';
import { ClassificationResult, ClassificationMatch, ProjectCategory } from './types';

export class TemplateClassifier {
  private registry: TemplateRegistry;

  constructor(registry?: TemplateRegistry) {
    this.registry = registry || TemplateRegistry.getInstance();
  }

  /**
   * Classifies user prompt into suitable project category, template, variant, and parameters.
   */
  public classify(prompt: string): ClassificationResult {
    const text = prompt.trim().toLowerCase();
    const templates = this.registry.getAll();
    const matches: ClassificationMatch[] = [];

    for (const tmpl of templates) {
      let score = 0;
      const matchedKeywords: string[] = [];

      // 1. Check exact type or alias match (Highest priority)
      for (const alias of tmpl.aliases) {
        const aliasLower = alias.toLowerCase();
        if (text.includes(aliasLower)) {
          score += 0.55;
          matchedKeywords.push(alias);
          break;
        }
      }

      // 2. Check keyword matches
      for (const kw of tmpl.keywords) {
        const kwLower = kw.toLowerCase();
        if (text.includes(kwLower)) {
          score += 0.15;
          if (!matchedKeywords.includes(kw)) {
            matchedKeywords.push(kw);
          }
        }
      }

      // 3. Category hints
      if (tmpl.category === 'INFRASTRUCTURE') {
        if (text.includes('infrastruktur') || text.includes('sipil') || text.includes('pu') || text.includes('binamarga')) {
          score += 0.1;
        }
      } else if (tmpl.category === 'BUILDING') {
        if (text.includes('gedung') || text.includes('bangunan') || text.includes('arsitektur') || text.includes('lantai')) {
          score += 0.1;
        }
      }

      // Cap at 0.99
      const confidence = Math.min(0.99, score);

      if (confidence > 0.2) {
        matches.push({
          templateId: tmpl.id,
          templateName: tmpl.name,
          category: tmpl.category,
          type: tmpl.type,
          confidence: Number(confidence.toFixed(2)),
          matchedKeywords,
          reasoning: `Cocok dengan kata kunci: ${matchedKeywords.join(', ')}`
        });
      }
    }

    // Sort matches by confidence descending
    matches.sort((a, b) => b.confidence - a.confidence);

    const topMatch = matches.length > 0 ? matches[0] : null;
    const isLowConfidence = !topMatch || topMatch.confidence < 0.65;

    let category: ProjectCategory | 'UNKNOWN' = 'UNKNOWN';
    let projectType = 'custom';
    let variant: string | undefined = undefined;

    if (topMatch) {
      category = topMatch.category;
      projectType = topMatch.type;
    }

    // Detect specialized variants
    if (projectType === 'water-structure') {
      if (text.includes('box culvert') || text.includes('gorong gorong')) {
        variant = 'box-culvert';
      } else if (text.includes('u-ditch') || text.includes('u ditch') || text.includes('drainase perkotaan')) {
        variant = 'drainage';
      } else if (text.includes('irigasi') || text.includes('saluran primer') || text.includes('saluran sekunder')) {
        variant = 'irrigation-channel';
      } else if (text.includes('embung') || text.includes('retensi') || text.includes('waduk')) {
        variant = 'reservoir';
      } else if (text.includes('bendung') || text.includes('intake')) {
        variant = 'water-intake';
      } else {
        variant = 'irrigation-channel';
      }
    } else if (projectType === 'road') {
      if (text.includes('beton') || text.includes('rigid')) {
        variant = 'concrete';
      } else {
        variant = 'asphalt';
      }
    }

    // Selected template for parameter definitions
    const selectedTemplate = topMatch ? this.registry.getById(topMatch.templateId) : null;
    const definitions = selectedTemplate ? selectedTemplate.parameters : [];

    // Extract parameters
    const extracted = ParameterEngine.extractFromText(prompt, definitions);

    // If variant detected, update parameter
    if (variant && projectType === 'water-structure') {
      extracted['water_variant'] = {
        value: variant,
        source: 'user_input',
        validationStatus: 'verified',
        confidence: 0.95,
        reasoning: `Varian bangunan air terdeteksi: ${variant}`
      };
    } else if (variant && projectType === 'road') {
      extracted['pavement_type'] = {
        value: variant,
        source: 'user_input',
        validationStatus: 'verified',
        confidence: 0.95,
        reasoning: `Tipe perkerasan jalan terdeteksi: ${variant}`
      };
    }

    // Apply assumptions
    const { updatedParams, assumptionsMade } = AssumptionEngine.applyAssumptions(
      selectedTemplate?.assumptionRules,
      extracted
    );

    // Find missing required parameters
    const missing = ParameterEngine.findMissingRequired(definitions, updatedParams);

    return {
      topMatch,
      alternatives: matches.slice(1, 4),
      isLowConfidence,
      category,
      projectType,
      variant,
      extractedParameters: updatedParams,
      missingRequiredParameters: missing,
      assumptionsApplied: assumptionsMade
    };
  }
}

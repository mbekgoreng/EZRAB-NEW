import { IntentCategory, ClassifiedIntentResult } from './intentTypes';
import { INTENT_RULES, IntentRule } from './intentRules';
import { EntityExtractor } from './entityExtractor';

export class ConstructionIntentClassifier {
  private static instance: ConstructionIntentClassifier;

  public static getInstance(): ConstructionIntentClassifier {
    if (!ConstructionIntentClassifier.instance) {
      ConstructionIntentClassifier.instance = new ConstructionIntentClassifier();
    }
    return ConstructionIntentClassifier.instance;
  }

  /**
   * Hybrid Intent Classification combining deterministic pattern rules,
   * page context, entity extraction, and ambiguity resolution.
   */
  public classify(query: string, currentPage?: string): ClassifiedIntentResult {
    const text = query.trim().toLowerCase();
    const entities = EntityExtractor.extract(query);

    // 1. Contextual relative query handling (e.g. "yang paling mahal apa?" on RAB page)
    if (currentPage === 'rab' || currentPage === 'spreadsheet') {
      if (text.includes('paling mahal') || text.includes('biaya terbesar') || text.includes('item dominan')) {
        return {
          intent: 'RAB_ITEM_SEARCH',
          confidence: 0.98,
          entities: { ...entities, actionType: 'SORT_DESC_PRICE' },
          requiresProject: true,
          requiresTool: true,
          requiresVision: false,
          requiresExternalKnowledge: false,
          isMutatingAction: false,
          suggestedTool: 'get_rab_summary'
        };
      }
    }

    // 2. Ambiguity resolution for vague mutating prompts (e.g. "tambah pondasi")
    if (text === 'tambah pondasi' || text === 'tambah pekerjaan pondasi') {
      return {
        intent: 'CLARIFICATION_NEEDED',
        confidence: 0.55,
        entities,
        requiresProject: true,
        requiresTool: false,
        requiresVision: false,
        requiresExternalKnowledge: false,
        isMutatingAction: false,
        clarificationPrompt: 'Siap! Jenis pondasi apa yang ingin Anda tambahkan?',
        clarificationOptions: [
          'Pondasi Batu Kali (1 Pc : 5 Ps)',
          'Pondasi Foot Plate (Tapak Beton)',
          'Pondasi Tiang Pancang / Strauss Pile'
        ]
      };
    }

    // 3. Match against structured Intent Rules
    for (const rule of INTENT_RULES) {
      for (const pattern of rule.patterns) {
        if (pattern.test(text)) {
          return {
            intent: rule.intent,
            confidence: rule.confidence,
            entities,
            requiresProject: rule.requiresProject,
            requiresTool: rule.requiresTool,
            requiresVision: rule.requiresVision,
            requiresExternalKnowledge: rule.requiresExternalKnowledge,
            isMutatingAction: rule.isMutatingAction,
            suggestedTool: rule.suggestedTool
          };
        }
      }
    }

    // 4. Fallback: Check if query contains general construction terminology
    const generalConstructionTerms = ['pondasi', 'sloof', 'kolom', 'balok', 'dinding', 'plester', 'acian', 'beton', 'baja', 'atap', 'plafon', 'kusen', 'keramik'];
    if (generalConstructionTerms.some(term => text.includes(term))) {
      return {
        intent: 'CONSTRUCTION_KNOWLEDGE',
        confidence: 0.85,
        entities,
        requiresProject: false,
        requiresTool: false,
        requiresVision: false,
        requiresExternalKnowledge: false,
        isMutatingAction: false
      };
    }

    // 5. Default UNKNOWN
    return {
      intent: 'UNKNOWN',
      confidence: 0.40,
      entities,
      requiresProject: false,
      requiresTool: false,
      requiresVision: false,
      requiresExternalKnowledge: false,
      isMutatingAction: false
    };
  }
}

export const constructionIntentClassifier = ConstructionIntentClassifier.getInstance();

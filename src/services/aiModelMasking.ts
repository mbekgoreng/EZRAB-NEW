/**
 * EZRAB — AI PROVIDER ABSTRACTION & FRONTEND INFORMATION HIDING
 *
 * CANONICAL PUBLIC EZRAB IDENTITIES:
 * 1. EZRAB AI 1.3  - Capability: QUICK    (Simple questions, lightweight reasoning, fast assistance)
 * 2. EZRAB AI Pro  - Capability: ADVANCED (Complex reasoning, construction analysis, DED -> RAB, document understanding)
 * 3. EZRAB Vision  - Capability: VISION   (Document/image understanding, DED page analysis)
 * 4. EZRAB Core    - Capability: INTERNAL (AI orchestration, tools, RAG, intent, rules, deterministic engines)
 *
 * CRITICAL RULE:
 * Production EZRAB must NEVER expose real AI provider/model identities
 * (Gemini, Google, OpenAI, Anthropic, Claude, DeepSeek, Qwen, Alibaba, Zyrouter, etc.)
 * to normal frontend users.
 */

export const EZRAB_AI_1_3 = 'EZRAB AI 1.3';
export const EZRAB_AI_PRO = 'EZRAB AI Pro';
export const EZRAB_VISION = 'EZRAB Vision';
export const EZRAB_CORE = 'EZRAB Core';

// Backward compatibility aliases
export const EZRAB_MODEL_FLASH = EZRAB_AI_1_3;
export const EZRAB_MODEL_VISION = EZRAB_VISION;
export const EZRAB_MODEL_THINKING = EZRAB_AI_PRO;
export const EZRAB_PROVIDER_DISPLAY = 'EZRAB Cloud Engine';

/**
 * Masks any raw model name, task routing type, or vendor model ID
 * into the official proprietary EZRAB public AI identities.
 */
export function maskAiModelName(rawModelOrTask?: string): string {
  if (!rawModelOrTask) return EZRAB_AI_1_3;

  const str = String(rawModelOrTask).toLowerCase().trim();

  // Already masked to canonical identities
  if (
    str === EZRAB_AI_1_3.toLowerCase() ||
    str === EZRAB_AI_PRO.toLowerCase() ||
    str === EZRAB_VISION.toLowerCase() ||
    str === EZRAB_CORE.toLowerCase()
  ) {
    if (str.includes('pro')) return EZRAB_AI_PRO;
    if (str.includes('vision')) return EZRAB_VISION;
    if (str.includes('core')) return EZRAB_CORE;
    return EZRAB_AI_1_3;
  }

  // Internal Core Tools / Math / Rules
  if (
    str.includes('core') ||
    str.includes('deterministic') ||
    str.includes('math') ||
    str.includes('tool') ||
    str.includes('rag') ||
    str.includes('rule')
  ) {
    return EZRAB_CORE;
  }

  // Vision / OCR / PDF DED / Drawing / Image analysis
  if (
    str.includes('vision') ||
    str.includes('image') ||
    str.includes('ocr') ||
    str.includes('drawing') ||
    str.includes('denah') ||
    str.includes('nota') ||
    str.includes('receipt') ||
    str.includes('pdf') ||
    str.includes('ded') ||
    str.includes('omni') ||
    str.includes('baca_denah') ||
    str.includes('drawing_analysis') ||
    str.includes('baca_nota') ||
    str.includes('receipt_reading') ||
    str.includes('baca_pdf_ded') ||
    str.includes('pdf_reading') ||
    str.includes('ded_reading') ||
    (str.includes('gemini') && !str.includes('lite'))
  ) {
    return EZRAB_VISION;
  }

  // Deep Thinking / High-tier Reasoning / Complex Construction Analysis / DED -> RAB
  if (
    str.includes('thinking') ||
    str.includes('think') ||
    str.includes('reasoning') ||
    str.includes('reasoner') ||
    str.includes('pro') ||
    str.includes('advanced') ||
    str.includes('detail') ||
    str.includes('mercury') ||
    str.includes('opus') ||
    str.includes('sonnet') ||
    str.includes('r1') ||
    str.includes('gpt-6') ||
    str.includes('sol') ||
    str.includes('atria') ||
    str.includes('complex_reasoning') ||
    str.includes('complex_architectural_reasoning')
  ) {
    return EZRAB_AI_PRO;
  }

  // Default: Fast Assistance & Lightweight Chat
  return EZRAB_AI_1_3;
}

/**
 * Masks third-party provider/vendor names into the proprietary EZRAB provider name.
 */
export function maskAiProviderName(rawProvider?: string): string {
  if (!rawProvider) return EZRAB_PROVIDER_DISPLAY;
  const str = String(rawProvider).toLowerCase().trim();
  if (str === 'ezrab_core' || str === 'ezrab core' || str === 'deterministic') {
    return EZRAB_CORE;
  }
  return EZRAB_PROVIDER_DISPLAY;
}

/**
 * Sanitizes evidence basis string to ensure no raw vendor names or API key aliases leak into inspection.
 */
export function sanitizeEvidenceBasis(basis?: string, rawModel?: string): string {
  const modelName = maskAiModelName(rawModel || basis);
  return `Diverifikasi melalui ${EZRAB_PROVIDER_DISPLAY} (${modelName})`;
}

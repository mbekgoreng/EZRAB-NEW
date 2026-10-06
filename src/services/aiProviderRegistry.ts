/**
 * EZRAB AI Provider Registry & Dynamic Key Pool (Phase 9.3)
 *
 * Authoritative registry of all AI Providers, Models, Capabilities, Pricing,
 * Key Pools with cooldown/budget management, and dynamic discovery.
 *
 * Supported Provider Pools:
 * - Gemini: 5 API Key slots (GEMINI_API_KEY_1..5)
 * - Atria: 15 API Key slots (ATRIA_API_KEY_1..15)
 * - InceptionLabs / Mercury: 15 API Key slots (INCEPTION_API_KEY_1..15)
 * - zrouter: 1+ API Key slot (ZROUTER_API_KEY, ZROUTER_API_KEY_2..4)
 */

import {
  AIProviderDefinition,
  AIModelDefinition,
  AIKeyPoolEntry,
  AICapability,
  AIQualityTier,
  ProviderId,
  TaskRoutingType,
  TaskProfile,
  ProviderHealth,
  ProviderHealthStatus,
  KeyStatus,
} from './aiProviderTypes';

export class AIProviderRegistry {
  private static instance: AIProviderRegistry;

  private providers: Map<ProviderId, AIProviderDefinition> = new Map();
  private keyPool: Map<string, AIKeyPoolEntry> = new Map();
  private taskProfiles: Map<TaskRoutingType, TaskProfile> = new Map();

  private constructor() {
    this.initDefaultProviders();
    this.initTaskProfiles();
    this.scanEnvironmentKeyPool();
  }

  public static getInstance(): AIProviderRegistry {
    if (!AIProviderRegistry.instance) {
      AIProviderRegistry.instance = new AIProviderRegistry();
    }
    return AIProviderRegistry.instance;
  }

  private initDefaultProviders(): void {
    // 1. Google Gemini (5 keys supported)
    const geminiProvider: AIProviderDefinition = {
      id: 'gemini',
      name: 'Google Gemini',
      enabled: true,
      capabilities: [
        'TEXT',
        'VISION',
        'IMAGE',
        'PDF',
        'OCR',
        'DRAWING',
        'REASONING',
        'STRUCTURED_OUTPUT',
        'LONG_CONTEXT',
        'TOOL_USE',
      ],
      priority: 1,
      // VERIFIED 2026-09-23 against GET /v1beta/models with the configured keys:
      // available: gemini-3.5-flash-lite, gemini-3.8-flash, gemini-2.5-flash, gemini-2.5-pro
      // (gemini-2.0-* and gemini-1.5-* are NOT available on these keys.)
      // Prices below are operational estimates — refresh via updateModelPricing(), never treat as permanent.
      models: [
        {
          id: 'gemini-3.5-flash-lite',
          providerId: 'gemini',
          name: 'Gemini 3.5 Flash Lite',
          capabilities: ['TEXT', 'VISION', 'IMAGE', 'PDF', 'OCR', 'STRUCTURED_OUTPUT'],
          inputCostPerMillion: 0.0375,
          outputCostPerMillion: 0.15,
          contextWindow: 1048576,
          enabled: true,
          qualityTier: 'ULTRA_CHEAP',
          availability: 'AVAILABLE',
          supportsStructuredOutput: true,
          supportsEvidence: true,
          supportsVision: true,
          supportsPdf: true,
          supportsOcr: true,
          supportsReasoning: false,
          recommendedFor: ['SIMPLE_TEXT_CLASSIFICATION', 'CHAT', 'RECEIPT_READING', 'BACA_NOTA'],
        },
        {
          id: 'gemini-2.5-flash',
          providerId: 'gemini',
          name: 'Gemini 2.5 Flash',
          capabilities: ['TEXT', 'VISION', 'IMAGE', 'PDF', 'OCR', 'DRAWING', 'STRUCTURED_OUTPUT', 'LONG_CONTEXT'],
          inputCostPerMillion: 0.30,
          outputCostPerMillion: 2.50,
          contextWindow: 1048576,
          enabled: true,
          qualityTier: 'CHEAP',
          availability: 'AVAILABLE',
          supportsStructuredOutput: true,
          supportsEvidence: true,
          supportsVision: true,
          supportsPdf: true,
          supportsOcr: true,
          supportsReasoning: true,
          recommendedFor: ['BACA_DENAH', 'DRAWING_ANALYSIS', 'BACA_NOTA', 'RECEIPT_READING'],
        },
        {
          id: 'gemini-3.8-flash',
          providerId: 'gemini',
          name: 'Gemini 3.8 Flash',
          capabilities: ['TEXT', 'VISION', 'IMAGE', 'PDF', 'OCR', 'DRAWING', 'STRUCTURED_OUTPUT', 'LONG_CONTEXT'],
          inputCostPerMillion: 0.50,
          outputCostPerMillion: 3.00,
          contextWindow: 1048576,
          enabled: true,
          qualityTier: 'BALANCED',
          availability: 'AVAILABLE',
          supportsStructuredOutput: true,
          supportsEvidence: true,
          supportsVision: true,
          supportsPdf: true,
          supportsOcr: true,
          supportsReasoning: true,
          recommendedFor: ['BACA_PDF_DED', 'PDF_READING', 'DED_READING', 'BACA_DENAH'],
        },
        {
          id: 'gemini-2.5-pro',
          providerId: 'gemini',
          name: 'Gemini 2.5 Pro',
          capabilities: ['TEXT', 'VISION', 'IMAGE', 'PDF', 'OCR', 'DRAWING', 'REASONING', 'STRUCTURED_OUTPUT', 'LONG_CONTEXT', 'TOOL_USE'],
          inputCostPerMillion: 1.25,
          outputCostPerMillion: 10.00,
          contextWindow: 1048576,
          enabled: true,
          qualityTier: 'PREMIUM',
          availability: 'AVAILABLE',
          supportsStructuredOutput: true,
          supportsEvidence: true,
          supportsVision: true,
          supportsPdf: true,
          supportsOcr: true,
          supportsReasoning: true,
          recommendedFor: ['COMPLEX_REASONING', 'COMPLEX_ARCHITECTURAL_REASONING', 'DOCUMENT_REVIEW'],
        },
      ],
    };

    // 2. Atria (15 keys supported)
    // NOTE: Verified capabilities are TEXT, REASONING, STRUCTURED_OUTPUT. No vision/PDF/OCR without verification.
    const atriaProvider: AIProviderDefinition = {
      id: 'atria',
      name: 'Atria ASI',
      enabled: true,
      capabilities: ['TEXT', 'REASONING', 'STRUCTURED_OUTPUT'],
      priority: 2,
      models: [
        {
          id: 'Atria-Dawn-Preview',
          providerId: 'atria',
          name: 'Atria Dawn Preview',
          capabilities: ['TEXT', 'REASONING', 'STRUCTURED_OUTPUT'],
          inputCostPerMillion: 0.15,
          outputCostPerMillion: 0.60,
          contextWindow: 128000,
          enabled: true,
          qualityTier: 'CHEAP',
          availability: 'AVAILABLE',
          supportsStructuredOutput: true,
          supportsEvidence: true,
          supportsVision: false,
          supportsPdf: false,
          supportsOcr: false,
          supportsReasoning: true,
          recommendedFor: ['CHAT', 'PROJECT_QA', 'DOCUMENT_WRITING'],
        },
      ],
    };

    // 3. InceptionLabs / Mercury (15 keys supported)
    // NOTE: Verified capabilities are TEXT, REASONING, STRUCTURED_OUTPUT, LONG_CONTEXT. No raw images/PDF without verification.
    const inceptionProvider: AIProviderDefinition = {
      id: 'inception',
      name: 'InceptionLabs Mercury',
      enabled: true,
      capabilities: ['TEXT', 'REASONING', 'STRUCTURED_OUTPUT', 'LONG_CONTEXT'],
      priority: 2,
      // VERIFIED 2026-09-23 via GET /v1/models: real catalog is mercury-2 and mercury-2.5 ONLY.
      // mercury-flash and mercury-reasoner-pro were invented IDs that do not exist.
      // NOTE: mercury-2.5 is a reasoning model that returns content=null unless max_tokens
      // is generous (server adapter enforces a floor). No vision/PDF verified -> kept off.
      models: [
        {
          id: 'mercury-2',
          providerId: 'inception',
          name: 'Mercury 2',
          capabilities: ['TEXT', 'REASONING', 'STRUCTURED_OUTPUT', 'LONG_CONTEXT'],
          inputCostPerMillion: 0.25,
          outputCostPerMillion: 1.00,
          contextWindow: 256000,
          enabled: true,
          qualityTier: 'CHEAP',
          availability: 'AVAILABLE',
          supportsStructuredOutput: true,
          supportsEvidence: true,
          supportsVision: false,
          supportsPdf: false,
          supportsOcr: false,
          supportsReasoning: true,
          recommendedFor: ['PROJECT_QA', 'DOCUMENT_WRITING'],
        },
        {
          id: 'mercury-2.5',
          providerId: 'inception',
          name: 'Mercury 2.5 Reasoning',
          capabilities: ['TEXT', 'REASONING', 'STRUCTURED_OUTPUT', 'LONG_CONTEXT'],
          inputCostPerMillion: 0.50,
          outputCostPerMillion: 2.50,
          contextWindow: 256000,
          enabled: true,
          qualityTier: 'PREMIUM',
          availability: 'AVAILABLE',
          supportsStructuredOutput: true,
          supportsEvidence: true,
          supportsVision: false,
          supportsPdf: false,
          supportsOcr: false,
          supportsReasoning: true,
          recommendedFor: ['COMPLEX_REASONING', 'DOCUMENT_REVIEW', 'RAB_ANALYSIS', 'DOCUMENT_WRITING'],
        },
      ],
    };

    // 4. zrouter / zyrouter (1+ keys supported, multi-downstream models)
    const zrouterProvider: AIProviderDefinition = {
      id: 'zrouter',
      name: 'zrouter OpenAI-Compatible Gateway',
      enabled: true,
      isCustomGateway: true,
      capabilities: [
        'TEXT',
        'VISION',
        'IMAGE',
        'PDF',
        'OCR',
        'DRAWING',
        'REASONING',
        'STRUCTURED_OUTPUT',
        'LONG_CONTEXT',
        'TOOL_USE',
      ],
      priority: 3,
      models: [
        {
          id: 'geminiflash-3.8',
          providerId: 'zrouter',
          name: 'Gemini Flash 3.8 (via Zyrouter)',
          capabilities: [
            'TEXT',
            'VISION',
            'IMAGE',
            'PDF',
            'OCR',
            'DRAWING',
            'REASONING',
            'STRUCTURED_OUTPUT',
            'LONG_CONTEXT',
            'TOOL_USE',
          ],
          inputCostPerMillion: 0.15,
          outputCostPerMillion: 0.60,
          contextWindow: 1048576,
          enabled: true,
          qualityTier: 'CHEAP',
          availability: 'AVAILABLE',
          supportsStructuredOutput: true,
          supportsEvidence: true,
          supportsVision: true,
          supportsPdf: true,
          supportsOcr: true,
          supportsReasoning: true,
          recommendedFor: [
            'DED_READING',
            'BACA_PDF_DED',
            'BACA_DENAH',
            'DRAWING_ANALYSIS',
            'DOCUMENT_REVIEW',
            'RAB_ANALYSIS',
            'PROJECT_QA',
          ],
        },
        {
          id: 'gpt-6-luna',
          providerId: 'zrouter',
          name: 'GPT 6 Luna (via Zyrouter)',
          capabilities: [
            'TEXT',
            'VISION',
            'IMAGE',
            'PDF',
            'OCR',
            'DRAWING',
            'REASONING',
            'STRUCTURED_OUTPUT',
            'LONG_CONTEXT',
            'TOOL_USE',
          ],
          inputCostPerMillion: 0.50,
          outputCostPerMillion: 2.00,
          contextWindow: 256000,
          enabled: true,
          qualityTier: 'BALANCED',
          availability: 'AVAILABLE',
          supportsStructuredOutput: true,
          supportsEvidence: true,
          supportsVision: true,
          supportsPdf: true,
          supportsOcr: true,
          supportsReasoning: true,
          recommendedFor: [
            'DED_READING',
            'BACA_PDF_DED',
            'BACA_DENAH',
            'DRAWING_ANALYSIS',
            'DOCUMENT_REVIEW',
            'RAB_ANALYSIS',
            'PROJECT_QA',
          ],
        },
        {
          id: 'claude-haiku-4-5',
          providerId: 'zrouter',
          name: 'Claude Haiku 4.5 (via zrouter)',
          capabilities: ['TEXT', 'REASONING', 'STRUCTURED_OUTPUT'],
          inputCostPerMillion: 0.80,
          outputCostPerMillion: 4.00,
          contextWindow: 200000,
          enabled: true,
          qualityTier: 'CHEAP',
          availability: 'AVAILABLE',
          supportsStructuredOutput: true,
          supportsEvidence: true,
          supportsVision: false,
          supportsPdf: false,
          supportsOcr: false,
          supportsReasoning: true,
          recommendedFor: ['PROJECT_QA', 'DOCUMENT_WRITING', 'SIMPLE_TEXT_CLASSIFICATION'],
        },
        {
          id: 'gpt-5.6-luna',
          providerId: 'zrouter',
          name: 'GPT 5.6 Luna (via zrouter)',
          capabilities: ['TEXT', 'REASONING', 'STRUCTURED_OUTPUT', 'LONG_CONTEXT'],
          inputCostPerMillion: 0.50,
          outputCostPerMillion: 2.00,
          contextWindow: 256000,
          enabled: true,
          qualityTier: 'BALANCED',
          availability: 'AVAILABLE',
          supportsStructuredOutput: true,
          supportsEvidence: true,
          supportsVision: false,
          supportsPdf: false,
          supportsOcr: false,
          supportsReasoning: true,
          recommendedFor: ['DOCUMENT_WRITING', 'PROJECT_QA', 'DOCUMENT_REVIEW'],
        },
        {
          id: 'gpt-5.6-terra',
          providerId: 'zrouter',
          name: 'GPT 5.6 Terra (via zrouter)',
          capabilities: ['TEXT', 'REASONING', 'STRUCTURED_OUTPUT', 'LONG_CONTEXT'],
          inputCostPerMillion: 1.00,
          outputCostPerMillion: 4.00,
          contextWindow: 256000,
          enabled: true,
          qualityTier: 'BALANCED',
          availability: 'AVAILABLE',
          supportsStructuredOutput: true,
          supportsEvidence: true,
          supportsVision: false,
          supportsPdf: false,
          supportsOcr: false,
          supportsReasoning: true,
          recommendedFor: ['DOCUMENT_REVIEW', 'RAB_ANALYSIS'],
        },
        {
          id: 'gpt-5.6-sol',
          providerId: 'zrouter',
          name: 'GPT 5.6 Sol (via zrouter)',
          capabilities: ['TEXT', 'REASONING', 'STRUCTURED_OUTPUT', 'LONG_CONTEXT', 'TOOL_USE'],
          inputCostPerMillion: 1.50,
          outputCostPerMillion: 6.00,
          contextWindow: 256000,
          enabled: true,
          qualityTier: 'PREMIUM',
          availability: 'AVAILABLE',
          supportsStructuredOutput: true,
          supportsEvidence: true,
          supportsVision: false,
          supportsPdf: false,
          supportsOcr: false,
          supportsReasoning: true,
          recommendedFor: ['COMPLEX_REASONING', 'DOCUMENT_REVIEW'],
        },
        {
          id: 'gpt-5.5',
          providerId: 'zrouter',
          name: 'GPT 5.5 (via zrouter)',
          capabilities: ['TEXT', 'REASONING', 'STRUCTURED_OUTPUT', 'LONG_CONTEXT', 'TOOL_USE'],
          inputCostPerMillion: 2.00,
          outputCostPerMillion: 8.00,
          contextWindow: 256000,
          enabled: true,
          qualityTier: 'PREMIUM',
          availability: 'AVAILABLE',
          supportsStructuredOutput: true,
          supportsEvidence: true,
          supportsVision: false,
          supportsPdf: false,
          supportsOcr: false,
          supportsReasoning: true,
          recommendedFor: ['COMPLEX_REASONING', 'COMPLEX_ARCHITECTURAL_REASONING', 'DOCUMENT_REVIEW'],
        },
        {
          id: 'claude-sonnet-5',
          providerId: 'zrouter',
          name: 'Claude Sonnet 5 (via zrouter)',
          capabilities: ['TEXT', 'REASONING', 'STRUCTURED_OUTPUT', 'LONG_CONTEXT', 'TOOL_USE'],
          inputCostPerMillion: 3.00,
          outputCostPerMillion: 15.00,
          contextWindow: 200000,
          enabled: true,
          qualityTier: 'PREMIUM',
          availability: 'AVAILABLE',
          supportsStructuredOutput: true,
          supportsEvidence: true,
          supportsVision: false,
          supportsPdf: false,
          supportsOcr: false,
          supportsReasoning: true,
          recommendedFor: ['COMPLEX_ARCHITECTURAL_REASONING', 'DOCUMENT_REVIEW'],
        },
        {
          id: 'gpt-6-astra',
          providerId: 'zrouter',
          name: 'GPT 6 Astra Frontier (via zrouter)',
          capabilities: ['TEXT', 'REASONING', 'STRUCTURED_OUTPUT', 'LONG_CONTEXT', 'TOOL_USE'],
          inputCostPerMillion: 5.00,
          outputCostPerMillion: 25.00,
          contextWindow: 512000,
          enabled: true,
          qualityTier: 'FRONTIER',
          availability: 'AVAILABLE',
          supportsStructuredOutput: true,
          supportsEvidence: true,
          supportsVision: false,
          supportsPdf: false,
          supportsOcr: false,
          supportsReasoning: true,
          recommendedFor: ['COMPLEX_REASONING', 'COMPLEX_ARCHITECTURAL_REASONING'],
        },
        {
          id: 'claude-opus-5',
          providerId: 'zrouter',
          name: 'Claude Opus 5 Frontier (via zrouter)',
          capabilities: ['TEXT', 'REASONING', 'STRUCTURED_OUTPUT', 'LONG_CONTEXT', 'TOOL_USE'],
          inputCostPerMillion: 15.00,
          outputCostPerMillion: 75.00,
          contextWindow: 200000,
          enabled: true,
          qualityTier: 'FRONTIER',
          availability: 'AVAILABLE',
          supportsStructuredOutput: true,
          supportsEvidence: true,
          supportsVision: false,
          supportsPdf: false,
          supportsOcr: false,
          supportsReasoning: true,
          recommendedFor: ['COMPLEX_REASONING', 'COMPLEX_ARCHITECTURAL_REASONING'],
        },
      ],
    };

    const zyrouterProvider: AIProviderDefinition = {
      id: 'zyrouter',
      name: 'Zyrouter OpenAI-Compatible Gateway',
      enabled: true,
      isCustomGateway: true,
      capabilities: [
        'TEXT',
        'VISION',
        'IMAGE',
        'PDF',
        'OCR',
        'DRAWING',
        'REASONING',
        'STRUCTURED_OUTPUT',
        'LONG_CONTEXT',
        'TOOL_USE',
      ],
      priority: 2,
      models: zrouterProvider.models.map((m) => ({ ...m, providerId: 'zyrouter' })),
    };

    // 5. VLEEE OpenAI-Compatible Multi-Model Gateway
    const vleeeProvider: AIProviderDefinition = {
      id: 'vleee',
      name: 'VLEEE AI Gateway (OpenAI Compatible)',
      enabled: true,
      isCustomGateway: true,
      capabilities: [
        'TEXT',
        'VISION',
        'IMAGE',
        'PDF',
        'OCR',
        'DRAWING',
        'REASONING',
        'STRUCTURED_OUTPUT',
        'LONG_CONTEXT',
        'TOOL_USE',
      ],
      priority: 2,
      models: [
        {
          id: 'ali/qwen3.8-omni-flash',
          providerId: 'vleee',
          name: 'Qwen 3.8 Omni Flash (via Vleee)',
          capabilities: ['TEXT', 'VISION', 'IMAGE', 'DRAWING', 'OCR', 'STRUCTURED_OUTPUT'],
          inputCostPerMillion: 0.15,
          outputCostPerMillion: 0.60,
          contextWindow: 128000,
          enabled: true,
          qualityTier: 'ULTRA_CHEAP',
          availability: 'AVAILABLE',
          supportsStructuredOutput: true,
          supportsEvidence: true,
          supportsVision: true,
          supportsPdf: false,
          supportsOcr: true,
          supportsReasoning: false,
          recommendedFor: ['BACA_DENAH', 'DRAWING_ANALYSIS', 'BACA_NOTA', 'RECEIPT_READING'],
        },
        {
          id: 'ag/gemini-3.8-flash-high',
          providerId: 'vleee',
          name: 'Gemini 3.8 Flash High (via Vleee)',
          capabilities: ['TEXT', 'VISION', 'IMAGE', 'PDF', 'OCR', 'DRAWING', 'REASONING', 'STRUCTURED_OUTPUT', 'LONG_CONTEXT'],
          inputCostPerMillion: 0.20,
          outputCostPerMillion: 0.80,
          contextWindow: 1048576,
          enabled: true,
          qualityTier: 'CHEAP',
          availability: 'AVAILABLE',
          supportsStructuredOutput: true,
          supportsEvidence: true,
          supportsVision: true,
          supportsPdf: true,
          supportsOcr: true,
          supportsReasoning: true,
          recommendedFor: ['BACA_PDF_DED', 'PDF_READING', 'DED_READING', 'BACA_DENAH'],
        },
        {
          id: 'ag/gemini-3.7-flash-high',
          providerId: 'vleee',
          name: 'Gemini 3.7 Flash High (via Vleee)',
          capabilities: ['TEXT', 'VISION', 'IMAGE', 'PDF', 'OCR', 'DRAWING', 'STRUCTURED_OUTPUT'],
          inputCostPerMillion: 0.15,
          outputCostPerMillion: 0.60,
          contextWindow: 1048576,
          enabled: true,
          qualityTier: 'CHEAP',
          availability: 'AVAILABLE',
          supportsStructuredOutput: true,
          supportsEvidence: true,
          supportsVision: true,
          supportsPdf: true,
          supportsOcr: true,
          supportsReasoning: false,
          recommendedFor: ['BACA_PDF_DED', 'RECEIPT_READING', 'BACA_NOTA'],
        },
        {
          id: 'ali/deepseek-v4.1-flash',
          providerId: 'vleee',
          name: 'DeepSeek V4.1 Flash (via Vleee)',
          capabilities: ['TEXT', 'REASONING', 'STRUCTURED_OUTPUT', 'LONG_CONTEXT'],
          inputCostPerMillion: 0.14,
          outputCostPerMillion: 0.28,
          contextWindow: 128000,
          enabled: true,
          qualityTier: 'ULTRA_CHEAP',
          availability: 'AVAILABLE',
          supportsStructuredOutput: true,
          supportsEvidence: true,
          supportsVision: false,
          supportsPdf: false,
          supportsOcr: false,
          supportsReasoning: true,
          recommendedFor: ['COMPLEX_REASONING', 'RAB_ANALYSIS', 'DOCUMENT_REVIEW', 'PROJECT_QA'],
        },
        {
          id: 'ali/deepseek-v4-flash-0731',
          providerId: 'vleee',
          name: 'DeepSeek V4 Flash 0731 (via Vleee)',
          capabilities: ['TEXT', 'REASONING', 'STRUCTURED_OUTPUT'],
          inputCostPerMillion: 0.14,
          outputCostPerMillion: 0.28,
          contextWindow: 128000,
          enabled: true,
          qualityTier: 'ULTRA_CHEAP',
          availability: 'AVAILABLE',
          supportsStructuredOutput: true,
          supportsEvidence: true,
          supportsVision: false,
          supportsPdf: false,
          supportsOcr: false,
          supportsReasoning: true,
          recommendedFor: ['COMPLEX_REASONING', 'PROJECT_QA'],
        },
        {
          id: 'ali/qwen3.8-flash',
          providerId: 'vleee',
          name: 'Qwen 3.8 Flash (via Vleee)',
          capabilities: ['TEXT', 'REASONING', 'STRUCTURED_OUTPUT'],
          inputCostPerMillion: 0.10,
          outputCostPerMillion: 0.40,
          contextWindow: 128000,
          enabled: true,
          qualityTier: 'ULTRA_CHEAP',
          availability: 'AVAILABLE',
          supportsStructuredOutput: true,
          supportsEvidence: true,
          supportsVision: false,
          supportsPdf: false,
          supportsOcr: false,
          supportsReasoning: true,
          recommendedFor: ['SIMPLE_TEXT_CLASSIFICATION', 'PROJECT_QA'],
        },
        {
          id: 'ali/kimi-k2.7-code',
          providerId: 'vleee',
          name: 'Kimi K2.7 Code (via Vleee)',
          capabilities: ['TEXT', 'REASONING', 'STRUCTURED_OUTPUT'],
          inputCostPerMillion: 0.30,
          outputCostPerMillion: 1.20,
          contextWindow: 128000,
          enabled: true,
          qualityTier: 'CHEAP',
          availability: 'AVAILABLE',
          supportsStructuredOutput: true,
          supportsEvidence: true,
          supportsVision: false,
          supportsPdf: false,
          supportsOcr: false,
          supportsReasoning: true,
          recommendedFor: ['DOCUMENT_WRITING', 'COMPLEX_REASONING'],
        },
        {
          id: 'ag/gemini-pro-agent',
          providerId: 'vleee',
          name: 'Gemini Pro Agent (via Vleee)',
          capabilities: ['TEXT', 'VISION', 'IMAGE', 'PDF', 'OCR', 'REASONING', 'STRUCTURED_OUTPUT', 'LONG_CONTEXT', 'TOOL_USE'],
          inputCostPerMillion: 1.25,
          outputCostPerMillion: 5.00,
          contextWindow: 1048576,
          enabled: true,
          qualityTier: 'BALANCED',
          availability: 'AVAILABLE',
          supportsStructuredOutput: true,
          supportsEvidence: true,
          supportsVision: true,
          supportsPdf: true,
          supportsOcr: true,
          supportsReasoning: true,
          recommendedFor: ['COMPLEX_ARCHITECTURAL_REASONING', 'DOCUMENT_REVIEW'],
        },
        {
          id: 'ag/claude-sonnet-4-6',
          providerId: 'vleee',
          name: 'Claude Sonnet 4.6 (via Vleee)',
          capabilities: ['TEXT', 'VISION', 'IMAGE', 'REASONING', 'STRUCTURED_OUTPUT', 'LONG_CONTEXT', 'TOOL_USE'],
          inputCostPerMillion: 3.00,
          outputCostPerMillion: 15.00,
          contextWindow: 200000,
          enabled: true,
          qualityTier: 'PREMIUM',
          availability: 'AVAILABLE',
          supportsStructuredOutput: true,
          supportsEvidence: true,
          supportsVision: true,
          supportsPdf: false,
          supportsOcr: true,
          supportsReasoning: true,
          recommendedFor: ['COMPLEX_ARCHITECTURAL_REASONING', 'DOCUMENT_REVIEW'],
        },
        {
          id: 'ag/claude-opus-4-6-thinking',
          providerId: 'vleee',
          name: 'Claude Opus 4.6 Thinking (via Vleee)',
          capabilities: ['TEXT', 'REASONING', 'STRUCTURED_OUTPUT', 'LONG_CONTEXT', 'TOOL_USE'],
          inputCostPerMillion: 5.00,
          outputCostPerMillion: 25.00,
          contextWindow: 200000,
          enabled: true,
          qualityTier: 'FRONTIER',
          availability: 'AVAILABLE',
          supportsStructuredOutput: true,
          supportsEvidence: true,
          supportsVision: false,
          supportsPdf: false,
          supportsOcr: false,
          supportsReasoning: true,
          recommendedFor: ['COMPLEX_REASONING', 'COMPLEX_ARCHITECTURAL_REASONING'],
        },
        {
          id: 'cb/gpt-5.5',
          providerId: 'vleee',
          name: 'GPT 5.5 (via Vleee)',
          capabilities: ['TEXT', 'REASONING', 'STRUCTURED_OUTPUT', 'LONG_CONTEXT'],
          inputCostPerMillion: 3.00,
          outputCostPerMillion: 12.00,
          contextWindow: 256000,
          enabled: true,
          qualityTier: 'PREMIUM',
          availability: 'AVAILABLE',
          supportsStructuredOutput: true,
          supportsEvidence: true,
          supportsVision: false,
          supportsPdf: false,
          supportsOcr: false,
          supportsReasoning: true,
          recommendedFor: ['DOCUMENT_REVIEW', 'RAB_ANALYSIS'],
        },
      ],
    };

    // 6. EZRAB Core Deterministic Engine (Math & Rules)
    const ezrabCoreProvider: AIProviderDefinition = {
      id: 'ezrab_core',
      name: 'EZRAB Deterministic Engine',
      enabled: true,
      capabilities: ['STRUCTURED_OUTPUT'],
      priority: 0,
      models: [
        {
          id: 'ezrab-deterministic-v1',
          providerId: 'ezrab_core',
          name: 'EZRAB Core Math & Rules',
          capabilities: ['STRUCTURED_OUTPUT'],
          inputCostPerMillion: 0.0,
          outputCostPerMillion: 0.0,
          contextWindow: 32000,
          enabled: true,
          qualityTier: 'ULTRA_CHEAP',
          availability: 'AVAILABLE',
          supportsStructuredOutput: true,
          supportsEvidence: true,
          supportsVision: false,
          supportsPdf: false,
          supportsOcr: false,
          supportsReasoning: false,
          recommendedFor: ['DETERMINISTIC_CALCULATION'],
        },
      ],
    };

    this.providers.set('gemini', geminiProvider);
    this.providers.set('atria', atriaProvider);
    this.providers.set('inception', inceptionProvider);
    this.providers.set('zrouter', zrouterProvider);
    this.providers.set('zyrouter', zyrouterProvider);
    this.providers.set('vleee', vleeeProvider);
    this.providers.set('ezrab_core', ezrabCoreProvider);
  }

  private initTaskProfiles(): void {
    const defineProfile = (
      task: TaskRoutingType,
      requiredCapabilities: AICapability[],
      defaultQualityTier: AIQualityTier,
      allowEscalation: boolean,
      description: string,
      preferredProviderId?: ProviderId
    ) => {
      this.taskProfiles.set(task, {
        task,
        requiredCapabilities,
        defaultQualityTier,
        preferredProviderId,
        allowEscalation,
        description,
      });
    };

    const hasDedScanProvider = typeof process !== 'undefined' && Boolean(process.env?.DED_SCAN_AI_PROVIDER || process.env?.ZYROUTER_API_KEY);
    const dedScanPreferredProvider: ProviderId = hasDedScanProvider ? 'zyrouter' : 'gemini';

    defineProfile('CHAT', ['TEXT'], 'ULTRA_CHEAP', true, 'Percakapan umum dan instruksi dasar');
    defineProfile('PROJECT_QA', ['TEXT', 'REASONING'], 'CHEAP', true, 'Tanya jawab seputar informasi dan status proyek aktif');
    defineProfile('PDF_READING', ['PDF', 'STRUCTURED_OUTPUT'], 'BALANCED', true, 'Membaca dan mengekstrak dokumen PDF teknis');
    defineProfile('DED_READING', ['PDF', 'STRUCTURED_OUTPUT'], 'BALANCED', true, 'Membaca dokumen DED dan spesifikasi teknis', dedScanPreferredProvider);
    defineProfile('DRAWING_ANALYSIS', ['VISION', 'IMAGE', 'STRUCTURED_OUTPUT'], 'BALANCED', true, 'Membaca denah gambar arsitektur / DED', dedScanPreferredProvider);
    defineProfile('RECEIPT_READING', ['VISION', 'OCR', 'STRUCTURED_OUTPUT'], 'CHEAP', true, 'OCR struk/nota belanja material konstruksi');
    defineProfile('RAB_ANALYSIS', ['TEXT', 'REASONING'], 'BALANCED', true, 'Analisis kewajaran RAB dan audit item');
    defineProfile('DOCUMENT_WRITING', ['TEXT', 'STRUCTURED_OUTPUT'], 'BALANCED', true, 'Menyusun narasi dokumen tender dan metode pelaksanaan');
    defineProfile('DOCUMENT_REVIEW', ['TEXT', 'REASONING'], 'BALANCED', true, 'Memeriksa konsistensi dokumen proyek');
    defineProfile('COMPLEX_REASONING', ['REASONING', 'LONG_CONTEXT'], 'PREMIUM', true, 'Analisis struktural dan simulasi biaya bertingkat');
    defineProfile('SIMPLE_TEXT_CLASSIFICATION', ['TEXT'], 'ULTRA_CHEAP', false, 'Klasifikasi pesan singkat dan deteksi intent');
    defineProfile('DETERMINISTIC_CALCULATION', ['STRUCTURED_OUTPUT'], 'ULTRA_CHEAP', false, 'Kalkulasi volume, harga satuan, dan perkalian total', 'ezrab_core');

    // Backward compatibility aliases
    defineProfile('BACA_DENAH', ['VISION', 'IMAGE', 'STRUCTURED_OUTPUT'], 'BALANCED', true, 'Baca denah arsitektur', dedScanPreferredProvider);
    defineProfile('BACA_PDF_DED', ['PDF', 'STRUCTURED_OUTPUT'], 'BALANCED', true, 'Baca dokumen DED PDF', dedScanPreferredProvider);
    defineProfile('BACA_NOTA', ['VISION', 'OCR', 'STRUCTURED_OUTPUT'], 'CHEAP', true, 'Baca nota material');
    defineProfile('COMPLEX_ARCHITECTURAL_REASONING', ['REASONING', 'LONG_CONTEXT'], 'PREMIUM', true, 'Penalaran arsitektural kompleks');
  }

  /**
   * Scans environment variables to dynamically discover API key slots.
   * Empty/unset keys are ignored without throwing errors.
   */
  public scanEnvironmentKeyPool(
    env: Record<string, string | undefined> =
      typeof process !== 'undefined' && process.env ? process.env : {}
  ): void {
    if (typeof process !== 'undefined' && process.env && env && env !== process.env) {
      for (const [k, v] of Object.entries(env)) {
        if (v !== undefined) {
          process.env[k] = v;
        }
      }
      if (typeof window === 'undefined') {
        const adapterMod = ['..', '..', 'server', 'providers', 'multiProvider', 'adapters'].join('/');
        import(/* @vite-ignore */ adapterMod)
          .then(({ ensureKeyPoolRegistered }) => ensureKeyPoolRegistered(true))
          .catch(() => {});
      }
    }
    this.keyPool.clear();

    // Helper to register key slot safely
    const registerSlot = (
      providerId: ProviderId,
      keyIndex: number,
      envVarName: string,
      monthlyBudget = 50.0,
      dailyBudget = 5.0
    ) => {
      const rawKey = env[envVarName]?.trim();
      const isConfigured = Boolean(rawKey && rawKey.length > 5);
      const keyId = `${providerId}-key-${keyIndex}`;

      const status: KeyStatus = isConfigured ? 'AVAILABLE' : 'DISABLED';

      this.keyPool.set(keyId, {
        id: keyId,
        providerId,
        keyIndex,
        status,
        enabled: isConfigured,
        priority: keyIndex,
        monthlyBudget,
        dailyBudget,
        currentUsageMonth: 0.0,
        currentUsageDay: 0.0,
        failureCount: 0,
      });
    };

    // 1. Gemini: 5 Slots (GEMINI_API_KEY_1..5, fallback GEMINI_API_KEY)
    for (let i = 1; i <= 5; i++) {
      const varName = `GEMINI_API_KEY_${i}`;
      const effectiveKey = env[varName] || (i === 1 ? env.GEMINI_API_KEY : undefined);
      registerSlot('gemini', i, varName, 50.0, 5.0);
      if (effectiveKey && effectiveKey.length > 5) {
        const entry = this.keyPool.get(`gemini-key-${i}`);
        if (entry) {
          entry.enabled = true;
          entry.status = 'AVAILABLE';
        }
      }
    }

    // 2. Atria: 15 Slots (ATRIA_API_KEY_1..15, fallback ATRIA_API_KEY)
    for (let i = 1; i <= 15; i++) {
      const varName = `ATRIA_API_KEY_${i}`;
      const effectiveKey = env[varName] || (i === 1 ? env.ATRIA_API_KEY : undefined);
      registerSlot('atria', i, varName, 50.0, 5.0);
      if (effectiveKey && effectiveKey.length > 5) {
        const entry = this.keyPool.get(`atria-key-${i}`);
        if (entry) {
          entry.enabled = true;
          entry.status = 'AVAILABLE';
        }
      }
    }

    // 3. Inception / Mercury: 15 Slots (INCEPTION_API_KEY_1..15, fallback INCEPTION_API_KEY)
    for (let i = 1; i <= 15; i++) {
      const varName = `INCEPTION_API_KEY_${i}`;
      const effectiveKey = env[varName] || (i === 1 ? env.INCEPTION_API_KEY : undefined);
      registerSlot('inception', i, varName, 50.0, 5.0);
      if (effectiveKey && effectiveKey.length > 5) {
        const entry = this.keyPool.get(`inception-key-${i}`);
        if (entry) {
          entry.enabled = true;
          entry.status = 'AVAILABLE';
        }
      }
    }

    // 4. zrouter / zyrouter: Slots (ZROUTER_API_KEY, ZYROUTER_API_KEY, DED_SCAN_API_KEY)
    for (let i = 1; i <= 4; i++) {
      const varName = i === 1 ? 'ZROUTER_API_KEY' : `ZROUTER_API_KEY_${i}`;
      const zyVarName = i === 1 ? 'ZYROUTER_API_KEY' : `ZYROUTER_API_KEY_${i}`;
      const effectiveKey = env[zyVarName] || env[varName] || (i === 1 ? env.DED_SCAN_API_KEY : undefined);

      registerSlot('zrouter', i, varName, 100.0, 10.0);
      registerSlot('zyrouter', i, zyVarName, 100.0, 10.0);

      if (effectiveKey && effectiveKey.length > 5) {
        const entryZ = this.keyPool.get(`zrouter-key-${i}`);
        if (entryZ) {
          entryZ.enabled = true;
          entryZ.status = 'AVAILABLE';
        }
        const entryZy = this.keyPool.get(`zyrouter-key-${i}`);
        if (entryZy) {
          entryZy.enabled = true;
          entryZy.status = 'AVAILABLE';
        }
      }
    }

    // 5. Vleee: 6 Slots (VLEEE_API_KEY_1..6, fallback VLEEE_API_KEY)
    for (let i = 1; i <= 6; i++) {
      const varName = i === 1 ? 'VLEEE_API_KEY' : `VLEEE_API_KEY_${i}`;
      const fallbackVarName = `VLEEE_API_KEY_${i}`;
      const effectiveKey = env[varName] || env[fallbackVarName] || (i === 1 ? env.VLEEE_API_KEY : undefined);
      registerSlot('vleee', i, varName, 100.0, 10.0);
      if (effectiveKey && effectiveKey.length > 5) {
        const entry = this.keyPool.get(`vleee-key-${i}`);
        if (entry) {
          entry.enabled = true;
          entry.status = 'AVAILABLE';
        }
      }
    }

    // 6. EZRAB Core internal slot
    this.keyPool.set('ezrab-core-internal', {
      id: 'ezrab-core-internal',
      providerId: 'ezrab_core',
      keyIndex: 1,
      status: 'AVAILABLE',
      enabled: true,
      priority: 0,
      monthlyBudget: 0.0,
      dailyBudget: 0.0,
      currentUsageMonth: 0.0,
      currentUsageDay: 0.0,
      failureCount: 0,
    });
  }

  // =========================================================================
  // PROVIDER & MODEL ACCESSORS
  // =========================================================================

  public getProvider(providerId: ProviderId): AIProviderDefinition | undefined {
    return this.providers.get(providerId);
  }

  public getAllProviders(): AIProviderDefinition[] {
    return Array.from(this.providers.values());
  }

  public getModel(providerId: ProviderId, modelId: string): AIModelDefinition | undefined {
    const p = this.providers.get(providerId);
    if (!p) return undefined;
    return p.models.find((m) => m.id === modelId);
  }

  public getAllModels(): AIModelDefinition[] {
    return Array.from(this.providers.values()).flatMap((p) => p.models);
  }

  public getTaskProfile(task: TaskRoutingType): TaskProfile {
    return (
      this.taskProfiles.get(task) || {
        task,
        requiredCapabilities: ['TEXT'],
        defaultQualityTier: 'CHEAP',
        allowEscalation: true,
        description: 'Default generic task profile.',
      }
    );
  }

  // =========================================================================
  // KEY POOL ACCESS & ROTATION
  // =========================================================================

  public getKeyEntries(providerId?: ProviderId): AIKeyPoolEntry[] {
    const entries = Array.from(this.keyPool.values());
    if (providerId) {
      return entries.filter((k) => k.providerId === providerId);
    }
    return entries;
  }

  public getActiveKeyCount(providerId: ProviderId): number {
    return this.getKeyEntries(providerId).filter((k) => k.enabled && k.status !== 'DISABLED').length;
  }

  /**
   * Enables key-pool slots according to the SERVER-SIDE key pool status.
   * The browser never sees secrets — it only learns "provider X has N active
   * key slots" from /api/ai/multi-provider/providers (aliases only). This keeps
   * client routing decisions in sync with what the gateway can actually execute.
   */
  public enableServerConfiguredSlots(providerId: ProviderId, activeCount: number): void {
    let enabled = 0;
    for (const entry of this.getKeyEntries(providerId)) {
      if (entry.id === 'ezrab-core-internal') continue;
      if (enabled >= activeCount) {
        // Server has fewer active keys than client slots — disable the extras.
        entry.enabled = false;
        entry.status = 'DISABLED';
        continue;
      }
      if (!entry.enabled) {
        entry.enabled = true;
        entry.status = 'AVAILABLE';
        entry.cooldownUntil = undefined;
        entry.failureCount = 0;
      }
      enabled++;
    }
  }

  public selectAvailableKey(providerId: ProviderId, estimatedCostUsd = 0): AIKeyPoolEntry | null {
    const now = Date.now();
    const candidates = this.getKeyEntries(providerId).filter((k) => {
      if (!k.enabled || k.status === 'DISABLED') return false;

      // Check cooldown
      if (k.cooldownUntil && k.cooldownUntil > now) {
        k.status = 'COOLDOWN';
        return false;
      } else if (k.status === 'COOLDOWN') {
        k.status = 'AVAILABLE';
        k.cooldownUntil = undefined;
      }

      // Check budget
      if (k.dailyBudget && k.currentUsageDay !== undefined && k.currentUsageDay + estimatedCostUsd > k.dailyBudget) {
        return false;
      }
      if (k.monthlyBudget && k.currentUsageMonth !== undefined && k.currentUsageMonth + estimatedCostUsd > k.monthlyBudget) {
        return false;
      }

      return true;
    });

    if (candidates.length === 0) return null;

    // Sort by priority (ascending), then by failureCount (ascending), then lowest daily usage
    candidates.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if ((a.failureCount || 0) !== (b.failureCount || 0)) return (a.failureCount || 0) - (b.failureCount || 0);
      return (a.currentUsageDay || 0) - (b.currentUsageDay || 0);
    });

    return candidates[0];
  }

  public recordKeyUsage(keyId: string, costUsd: number): void {
    const key = this.keyPool.get(keyId);
    if (!key) return;
    key.currentUsageDay = (key.currentUsageDay || 0) + costUsd;
    key.currentUsageMonth = (key.currentUsageMonth || 0) + costUsd;
    key.lastUsedAt = Date.now();
    key.lastUsedTimestamp = Date.now();
  }

  public recordKeyFailure(keyId: string, status: ProviderHealthStatus, cooldownMs = 60000): void {
    const key = this.keyPool.get(keyId);
    if (!key) return;
    key.lastHealthStatus = status;
    key.failureCount = (key.failureCount || 0) + 1;
    key.status = 'FAILED';

    if (status === 'RATE_LIMITED' || status === 'TIMEOUT' || status === 'SERVER_ERROR' || key.failureCount >= 2) {
      key.status = 'COOLDOWN';
      key.cooldownUntil = Date.now() + cooldownMs;
    }
  }

  public recordKeySuccess(keyId: string): void {
    const key = this.keyPool.get(keyId);
    if (!key) return;
    key.lastHealthStatus = 'SUCCESS';
    key.status = 'AVAILABLE';
    key.failureCount = 0;
    key.cooldownUntil = undefined;
  }

  public getProviderHealth(providerId: ProviderId): ProviderHealth {
    const keys = this.getKeyEntries(providerId);
    if (keys.length === 0) return 'UNKNOWN';

    const enabledKeys = keys.filter((k) => k.enabled);
    if (enabledKeys.length === 0) return 'UNAVAILABLE';

    const now = Date.now();
    const availableKeys = enabledKeys.filter((k) => {
      if (k.cooldownUntil && k.cooldownUntil > now) return false;
      return k.status === 'AVAILABLE' || k.status === 'IN_USE';
    });

    if (availableKeys.length === enabledKeys.length) return 'HEALTHY';
    if (availableKeys.length > 0) return 'DEGRADED';
    return 'UNAVAILABLE';
  }

  // =========================================================================
  // DYNAMIC PRICING & DISCOVERY
  // =========================================================================

  public updateModelPricing(
    providerId: ProviderId,
    modelId: string,
    inputCostPerMillion: number,
    outputCostPerMillion: number
  ): boolean {
    const model = this.getModel(providerId, modelId);
    if (!model) return false;

    model.inputCostPerMillion = inputCostPerMillion;
    model.outputCostPerMillion = outputCostPerMillion;
    return true;
  }

  public registerDiscoveredModels(providerId: ProviderId, newModels: AIModelDefinition[]): void {
    let provider = this.providers.get(providerId);
    if (!provider) {
      provider = {
        id: providerId,
        name: `Provider ${providerId}`,
        enabled: true,
        capabilities: ['TEXT'],
        models: [],
      };
      this.providers.set(providerId, provider);
    }

    newModels.forEach((nm) => {
      const idx = provider!.models.findIndex((m) => m.id === nm.id);
      if (idx >= 0) {
        provider!.models[idx] = { ...provider!.models[idx], ...nm };
      } else {
        provider!.models.push(nm);
      }
    });
  }
}

export const aiProviderRegistry = AIProviderRegistry.getInstance();

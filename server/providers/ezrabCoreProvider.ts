import {
  AIProvider,
  AIProviderCapabilities,
  AIChatOptions,
  AIChatResult,
  ProviderHealth,
  ToolCallRequest
} from './aiProvider';
import { autoAnswerEngine } from '../services/autoAnswerEngine';
import { rabDataService } from '../services/rabDataService';
import { ahspDataService } from '../services/ahspDataService';
import { calculationService } from '../services/calculationService';

/**
 * EZRAB Core Provider — First-class deterministic execution engine
 * Handles authoritative calculations, AHSP lookups, RAB totals, and rules without LLM hallucination.
 */
export class EzrabCoreProvider implements AIProvider {
  public readonly id = 'ezrab_core';
  public readonly name = 'EZRAB Core Deterministic Engine';
  public readonly type = 'ezrab_core' as const;

  public readonly capabilities: AIProviderCapabilities = {
    supportsText: true,
    supportsVision: false,
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsStreaming: false,
    supportsEmbedding: false,
    maxContextTokens: 64000,
    estimatedCostClass: 'free',
    latencyClass: 'fast'
  };

  public async healthCheck(): Promise<ProviderHealth> {
    return {
      providerId: this.id,
      type: this.type,
      status: 'AVAILABLE',
      latencyMs: 1,
      message: 'EZRAB Core Engine is online and operational (Deterministic Local)',
      lastChecked: new Date().toISOString()
    };
  }

  public supportsTools(): boolean {
    return this.capabilities.supportsTools;
  }

  public supportsVision(): boolean {
    return this.capabilities.supportsVision;
  }

  public supportsStructuredOutput(): boolean {
    return this.capabilities.supportsStructuredOutput;
  }

  public supportsStreaming(): boolean {
    return this.capabilities.supportsStreaming;
  }

  public async chat(options: AIChatOptions): Promise<AIChatResult> {
    const start = Date.now();
    const lastMsg = options.messages[options.messages.length - 1];
    const userText = (lastMsg?.content || '').toLowerCase();
    const projectId = options.projectId || '';
    const workspaceId = options.workspaceId || '';
    const userId = options.userId || 'system';

    // 1. Check for specific deterministic calculations / tool requests
    const toolCalls: ToolCallRequest[] = [];

    if (userText.includes('total rab') || userText.includes('rekap rab') || userText.includes('anggaran proyek')) {
      toolCalls.push({
        id: `call_${Date.now()}_rab_summary`,
        name: 'get_rab_summary',
        arguments: { projectId }
      });
      return {
        content: 'Mengambil ringkasan data RAB resmi dari EZRAB Core Engine...',
        toolCalls,
        durationMs: Date.now() - start,
        providerId: this.id,
        modelId: 'ezrab-core-deterministic-v1'
      };
    }

    if (userText.includes('cari ahsp') || userText.includes('analisa harga') || userText.includes('standar pupr')) {
      const match = userText.match(/(?:cari ahsp|analisa|ahsp)\s+(.*)/i);
      const query = match ? match[1].trim() : 'beton';
      toolCalls.push({
        id: `call_${Date.now()}_search_ahsp`,
        name: 'search_ahsp',
        arguments: { query }
      });
      return {
        content: `Mencari data AHSP resmi PUPR 2026 untuk: "${query}"...`,
        toolCalls,
        durationMs: Date.now() - start,
        providerId: this.id,
        modelId: 'ezrab-core-deterministic-v1'
      };
    }

    if (userText.includes('hitung volume') || userText.includes('qto')) {
      toolCalls.push({
        id: `call_${Date.now()}_qto`,
        name: 'calculate_qto_volume',
        arguments: { projectId }
      });
      return {
        content: 'Menghitung volume pekerjaan dengan rumus matematis QTO...',
        toolCalls,
        durationMs: Date.now() - start,
        providerId: this.id,
        modelId: 'ezrab-core-deterministic-v1'
      };
    }

    // 2. Query Auto Answer Engine across 9,999 Knowledge Dataset
    const autoAnswer = await autoAnswerEngine.answerQuestion(lastMsg?.content || '', {
      userId,
      workspaceId,
      projectId
    });

    if (autoAnswer && autoAnswer.confidence >= 0.60 && autoAnswer.source_type !== 'fallback') {
      return {
        content: autoAnswer.answer,
        durationMs: Date.now() - start,
        providerId: this.id,
        modelId: 'ezrab-core-dataset-v1',
        tokenUsage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0
        }
      };
    }

    // Default authoritative fallback response
    return {
      content: autoAnswer?.answer || 'EZRAB Core Engine siap memproses kalkulasi RAB, validasi AHSP, dan audit volume proyek.',
      durationMs: Date.now() - start,
      providerId: this.id,
      modelId: 'ezrab-core-deterministic-v1',
      tokenUsage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      }
    };
  }
}

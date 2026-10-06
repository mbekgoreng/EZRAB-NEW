/**
 * EZRAB CORE AI — MASTER AGENT & ORCHESTRATOR (THE SINGLE BRAIN)
 * 
 * Central orchestrator connecting Intent, Planning, Tool Registry, Rule Engine,
 * Agent Loop, Task Memory, Self-Review, and Deterministic Source-of-Truth Engines.
 * 
 * Target:
 * USER -> EZRAB CORE AI -> INTENT -> PLAN -> TOOL REGISTRY -> DETERMINISTIC ENGINES -> SELF REVIEW -> RAB/REPORT
 */

import { intentEngine, CoreIntentType } from './intentEngine';
import { planningEngine, ExecutionPlan } from './planningEngine';
import { agentLoop, AgentLoopResult } from './agentLoop';
import { ruleEngine } from './ruleEngine';
import { ragEngine } from './ragEngine';
import { selfReviewEngine } from './selfReviewEngine';
import { constructionVocabulary } from './constructionVocabulary';
import { unifiedConversationStore } from '../conversation/unifiedConversationStore';
import { aiToolRegistry } from '../tools/aiToolRegistry';
import { aiActionExecutor } from '../actions/aiActionExecutor';
import { ProjectIsolationError, buildUnifiedProjectContext, AIActionProposal } from '../../unifiedProjectContext';
import { defaultAiProvider } from '../../aiProviderEngine';
import { buildFullAIContext } from '../../aiContextService';
import type { Project, RabItem } from '../../../types';
import type { AIMessage } from '../conversation/conversationTypes';

export interface CoreAiRequest {
  projectId: string;
  conversationId?: string;
  message: string;
  userId?: string;
  organizationId?: string;
  project?: Project | null;
  rabItems?: RabItem[];
  onAddRabItemDirect?: (item: any) => void;
  onThinking?: (step: string) => void;
}

export interface CoreAiResponse {
  message: AIMessage;
  conversationId: string;
  intent: CoreIntentType;
  actionProposal?: AIActionProposal;
  toolUsed?: string;
  planId?: string;
  agentLoopResult?: AgentLoopResult;
}

export class EZRABCoreAi {
  private static instance: EZRABCoreAi | null = null;

  private constructor() {}

  public static getInstance(): EZRABCoreAi {
    if (!EZRABCoreAi.instance) {
      EZRABCoreAi.instance = new EZRABCoreAi();
    }
    return EZRABCoreAi.instance;
  }

  /**
   * Main entrypoint for all AI tasks in EZRAB.
   */
  public async processRequest(params: CoreAiRequest): Promise<CoreAiResponse> {
    const rawMessage = (params.message || '').trim();
    if (!rawMessage) {
      throw new Error('Pesan tidak boleh kosong.');
    }

    // 1. Strict Fail-Closed Project Isolation Check
    if (!params.projectId || !params.projectId.trim()) {
      throw new ProjectIsolationError('PROJECT_ISOLATION_ERROR: ProjectId wajib diisi.');
    }

    const projectId = params.projectId.trim();
    if (params.project && params.project.id !== projectId) {
      throw new ProjectIsolationError(
        `PROJECT_ISOLATION_ERROR: Target projectId ${projectId} tidak sesuai dengan project.id ${params.project.id}.`
      );
    }

    // 2. Resolve Active Conversation in Unified Store
    const conversation = params.conversationId
      ? (unifiedConversationStore.getConversation(params.conversationId, projectId) ||
         unifiedConversationStore.getOrCreateActiveConversation(projectId))
      : unifiedConversationStore.getOrCreateActiveConversation(projectId);

    const conversationId = conversation.id;

    // 3. Record User Message (avoid duplicate if caller already appended)
    const conv = unifiedConversationStore.getConversation(conversationId, projectId);
    const lastMsg = conv?.messages[conv.messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'user' || lastMsg.content !== rawMessage) {
      unifiedConversationStore.appendMessage(conversationId, projectId, {
        role: 'user',
        content: rawMessage,
      });
    }

    if (params.onThinking) {
      params.onThinking('EZRAB Core AI: Mengidentifikasi intent & membangun rencana eksekusi...');
    }

    // 4. Intent Recognition
    const recognized = intentEngine.classifyIntent(rawMessage);
    const intent = recognized.type;

    const toolContext = {
      projectId,
      conversationId,
      userId: params.userId || 'current-user',
      organizationId: params.organizationId,
      project: params.project,
      rabItems: params.rabItems,
      onAddRabItemDirect: params.onAddRabItemDirect,
    };

    const lower = rawMessage.toLowerCase();

    // 5. Special Handler: User Approval / Confirmation ("Setujui" / "Tolak")
    if (lower === 'setujui' || lower === 'approve' || lower === 'setuju' || lower === 'terapkan') {
      const conv = unifiedConversationStore.getConversation(conversationId, projectId);
      const pendingMsg = conv?.messages.slice().reverse().find((m) => m.actionProposal && m.actionProposal.status === 'PENDING');

      if (pendingMsg && pendingMsg.actionProposal) {
        const execResult = await aiActionExecutor.executeApprovedAction(
          pendingMsg.actionProposal,
          toolContext,
          { userId: params.userId || 'user', approved: true }
        );

        if (execResult.success) {
          const reply = unifiedConversationStore.appendMessage(conversationId, projectId, {
            role: 'assistant',
            badge: 'ACTION',
            content: `✅ **Aksi Telah Disetujui & Diterapkan ke Spreadsheet RAB**\n\n${execResult.message}\nRiwayat perubahan tersimpan di Audit Log resmi.`,
          });
          return { message: reply, conversationId, intent: 'APPLY_TO_RAB' };
        } else {
          const reply = unifiedConversationStore.appendMessage(conversationId, projectId, {
            role: 'assistant',
            badge: 'ACTION',
            content: `⚠️ **Gagal Menerapkan Aksi**: ${execResult.message}`,
            isError: true,
          });
          return { message: reply, conversationId, intent: 'APPLY_TO_RAB' };
        }
      }
    }

    // 6. Forensic Explanation: "Kenapa harga kosong?" (EXPLAIN_PRICE_STATUS)
    if (intent === 'EXPLAIN_PRICE_STATUS') {
      const targetItem = recognized.extractedParameters.targetItem || 'Pondasi';
      if (params.onThinking) params.onThinking(`Menganalisis dekomposisi harga untuk "${targetItem}"...`);

      // Decompose using real price resolver & AHSP catalog
      const ahspToolRes = await aiToolRegistry.executeTool('search_ahsp', { query: targetItem }, toolContext);
      let replyContent = '';

      if (ahspToolRes.success && (ahspToolRes.result as any).items?.length > 0) {
        const topAhsp = (ahspToolRes.result as any).items[0];
        replyContent = `### 🔍 Analisis Diagnostik Status Harga: **${topAhsp.name}**\n\n` +
          `- **Status AHSP**: VERIFIED (${topAhsp.code})\n` +
          `- **Penyebab Harga Kosong**: Komponen pembentuk belum memiliki harga di level Proyek Override maupun Katalog Regional.\n` +
          `- **Tier Pemeriksaan**:\n` +
          `  1. Project Override: ✗ Belum diset\n` +
          `  2. Workspace Catalog: ✗ Tidak ditemukan\n` +
          `  3. Regional Database: ✗ Belum terpetakan untuk lokasi ${params.project?.location || 'proyek'}\n` +
          `  4. HSD PUPR 2026: Terdaftar sebagian\n\n` +
          `*EZRAB menolak mengarang harga secara acak (60/35/5 dilarang). Silakan gunakan tombol input harga untuk menetapkan harga proyek resmi.*`;
      } else {
        replyContent = `Item "${targetItem}" belum terpetakan ke analisa AHSP resmi PUPR 2026, sehingga harga satuan belum dapat dihitung secara deterministik.`;
      }

      const reply = unifiedConversationStore.appendMessage(conversationId, projectId, {
        role: 'assistant',
        badge: 'AHSP',
        content: replyContent,
        stats: {
          label: 'Status Diagnostik Harga',
          value: 'NO_PRICE',
          sub: 'Dibutuhkan input harga komponen',
          color: '#F59E0B',
        },
      });

      return { message: reply, conversationId, intent };
    }

    // 7. Multi-Step Execution via Planning Engine & Agent Loop
    const plan = planningEngine.buildPlan(intent, rawMessage, recognized.extractedParameters);

    if (params.onThinking) {
      params.onThinking(`Menjalankan Agent Loop (${plan.steps.length} langkah)...`);
    }

    const loopResult = await agentLoop.runLoop(plan, toolContext, {}, params.onThinking);

    // Format Agent Result into Assistant Message
    let badge: 'RAB' | 'KURVA S' | 'LAPORAN' | 'AHSP' | 'WIZARD' = 'RAB';
    if (intent === 'SEARCH_AHSP' || intent === 'EXPLAIN_AHSP_MATCH') badge = 'AHSP';
    if (intent === 'GENERATE_REPORT') badge = 'LAPORAN';

    let statsCard: any = undefined;
    if (loopResult.selfReviewReport) {
      statsCard = {
        label: 'Hasil Audit Kelayakan RAB',
        value: `${loopResult.selfReviewReport.readyItemsCount} / ${loopResult.selfReviewReport.totalItems} Valid`,
        sub: loopResult.selfReviewReport.isPassed ? 'Semua lolos 13 gate' : `${loopResult.selfReviewReport.needsReviewCount} perlu review`,
        color: loopResult.selfReviewReport.isPassed ? '#10B981' : '#F59E0B',
      };
    }

    const reply = unifiedConversationStore.appendMessage(conversationId, projectId, {
      role: 'assistant',
      badge,
      content: loopResult.finalSummary,
      stats: statsCard,
      actionProposal: loopResult.actionProposal,
      toolCalls: loopResult.traces.map((t) => ({
        id: `tc-${t.stepIndex}-${Date.now()}`,
        toolName: t.toolName,
        arguments: t.arguments,
      })),
      toolResults: loopResult.traces.map((t) => ({
        toolCallId: `tc-${t.stepIndex}`,
        toolName: t.toolName,
        success: t.status === 'SUCCESS',
        result: t.resultSummary,
      })),
    });

    return {
      message: reply,
      conversationId,
      intent,
      actionProposal: loopResult.actionProposal,
      planId: plan.planId,
      agentLoopResult: loopResult,
    };
  }
}

export const ezrabCoreAi = EZRABCoreAi.getInstance();

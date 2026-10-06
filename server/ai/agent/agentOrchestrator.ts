import { AgentRequest, AgentResponse, AgentExecutionState } from './agentTypes';
import { AgentExecutionStateMachine } from './agentExecutionStateMachine';
import { agentExecutionPlanner } from './agentExecutionPlanner';
import { agentExecutor } from './agentExecutor';
import { agentResponseBuilder } from './agentResponseBuilder';
import { agentTraceService } from './agentTrace';
import { constructionIntentClassifier } from '../intent/intentClassifier';
import { contextEngine } from '../context/contextEngine';
import { knowledgeRetriever } from '../knowledge/knowledgeRetriever';
import { providerGateway } from '../../providers/providerGateway';
import { modelRouter } from '../../providers/modelRouter';
import { aiDbAdapter } from '../../database/dbAdapter';

export class AgentOrchestrator {
  private static instance: AgentOrchestrator;

  public static getInstance(): AgentOrchestrator {
    if (!AgentOrchestrator.instance) {
      AgentOrchestrator.instance = new AgentOrchestrator();
    }
    return AgentOrchestrator.instance;
  }

  /**
   * Main end-to-end Agent workflow executing the complete state machine
   */
  public async handleRequest(request: AgentRequest): Promise<AgentResponse> {
    const startTime = Date.now();
    const stateMachine = new AgentExecutionStateMachine('RECEIVED');
    const trace = agentTraceService.startTrace({
      requestId: request.requestId,
      userId: request.userId,
      workspaceId: request.workspaceId,
      projectId: request.projectId
    });

    try {
      // 1. Ensure conversation exists
      const conversationId = request.conversationId || `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      // 2. Intent Classification & Entity Extraction
      stateMachine.transitionTo('CLASSIFIED');
      const intentResult = constructionIntentClassifier.classify(
        request.message,
        request.currentPage
      );

      trace.intent = intentResult.intent;
      agentTraceService.updateTrace(trace.traceId, { intent: intentResult.intent });

      // Handle Ambiguity / Clarification
      if (intentResult.intent === 'CLARIFICATION_NEEDED') {
        stateMachine.transitionTo('COMPLETED', 'Ambiguity clarification required');
        const answer = agentResponseBuilder.formatClarificationPrompt(
          intentResult.clarificationPrompt || 'Permintaan memerlukan klarifikasi.',
          intentResult.clarificationOptions || []
        );

        const durationMs = Date.now() - startTime;
        agentTraceService.completeTrace(trace.traceId, 'COMPLETED', true, durationMs);

        return {
          success: true,
          requestId: request.requestId,
          traceId: trace.traceId,
          conversationId,
          state: 'COMPLETED',
          intent: 'CLARIFICATION_NEEDED',
          answer,
          provider: 'ezrab_core',
          model: null,
          toolCallsExecuted: [],
          actionProposal: null,
          provenance: [],
          requiresConfirmation: false,
          warnings: [],
          clarificationOptions: intentResult.clarificationOptions,
          meta: {
            durationMs,
            sources: ['ezrab_intent_rules'],
            isDeterministic: true,
            projectIsolated: true
          }
        };
      }

      // 3. Authoritative Session Context Resolution
      stateMachine.transitionTo('CONTEXT_RESOLVED');
      const assembled = await contextEngine.assembleContext({
        userId: request.userId,
        workspaceId: request.workspaceId,
        projectId: request.projectId,
        userRole: request.userRole,
        currentRoute: request.currentPage,
        requiresProject: intentResult.requiresProject
      });
      const sessionContext = assembled.session;

      // Strict Project Isolation Check
      if (intentResult.requiresProject && !sessionContext.projectId) {
        stateMachine.transitionTo('CONTEXT_FAILED', 'Project context is required');
        const durationMs = Date.now() - startTime;
        agentTraceService.completeTrace(trace.traceId, 'CONTEXT_FAILED', false, durationMs, {
          code: 'PROJECT_CONTEXT_REQUIRED',
          message: 'Permintaan ini memerlukan konteks proyek aktif.'
        });

        return {
          success: false,
          requestId: request.requestId,
          traceId: trace.traceId,
          conversationId,
          state: 'CONTEXT_FAILED',
          intent: intentResult.intent,
          answer: 'Silakan pilih proyek terlebih dahulu untuk melihat atau mengubah data.',
          provider: 'ezrab_core',
          model: null,
          toolCallsExecuted: [],
          actionProposal: null,
          provenance: [],
          requiresConfirmation: false,
          warnings: ['Konteks proyek tidak ditemukan atau belum dipilih.'],
          meta: {
            durationMs,
            sources: [],
            isDeterministic: true,
            projectIsolated: true
          }
        };
      }

      // 4. Construction Knowledge Handling (RAG / Local AI)
      if (intentResult.intent === 'CONSTRUCTION_KNOWLEDGE') {
        stateMachine.transitionTo('PLANNED');
        stateMachine.transitionTo('EXECUTING');

        // First check internal verified knowledge registry
        const ragResults = knowledgeRetriever.search({
          query: request.message,
          topK: 1
        });

        let answer = '';
        let providerUsed: 'ezrab_core' | 'local_ai' = 'ezrab_core';

        if (ragResults.length > 0 && ragResults[0].relevance > 0.6) {
          const item = ragResults[0];
          answer = `**${item.title}**\n\n${item.content}\n\n*Sumber: Knowledge Repository EZRAB (${item.authority})*`;
        } else {
          // Consult Local AI via ModelRouter & ProviderGateway
          try {
            const modelDecision = await modelRouter.selectModel({
              taskType: 'construction_knowledge',
              query: request.message,
              preferredCost: 'free'
            });

            const aiResp = await providerGateway.chat({
              provider: modelDecision.provider,
              model: modelDecision.model,
              messages: [
                {
                  role: 'system',
                  content: 'Anda adalah EZRAB AI, asisten konstruksi profesional. Jelaskan konsep konstruksi secara praktis, singkat, dan tepat sesuai standar teknik sipil Indonesia.'
                },
                { role: 'user', content: request.message }
              ]
            });

            answer = aiResp.content || 'Informasi konstruksi berhasil diproses.';
            providerUsed = 'local_ai';
          } catch {
            answer = 'Bouwplank, sloof, pondasi, dan komponen struktur adalah bagian standar pekerjaan konstruksi gedung sesuai Permen PUPR.';
          }
        }

        stateMachine.transitionTo('COMPLETED');
        const durationMs = Date.now() - startTime;
        agentTraceService.completeTrace(trace.traceId, 'COMPLETED', true, durationMs);

        return {
          success: true,
          requestId: request.requestId,
          traceId: trace.traceId,
          conversationId,
          state: 'COMPLETED',
          intent: 'CONSTRUCTION_KNOWLEDGE',
          answer,
          provider: providerUsed,
          model: providerUsed === 'local_ai' ? 'qwen3:8b' : null,
          toolCallsExecuted: [],
          actionProposal: null,
          provenance: ragResults.map((r) => ({
            value: r.content,
            source: 'knowledge_repository',
            verified: true,
            confidence: r.relevance,
            sourceReference: r.title
          })),
          requiresConfirmation: false,
          warnings: [],
          meta: {
            durationMs,
            sources: ['knowledge_repository'],
            isDeterministic: providerUsed === 'ezrab_core',
            projectIsolated: false
          }
        };
      }

      // 5. Execution Planning for Tools (READ & WRITE)
      stateMachine.transitionTo('PLANNED');
      const plan = agentExecutionPlanner.plan(intentResult, sessionContext);

      if (plan.steps.length === 0) {
        stateMachine.transitionTo('COMPLETED');
        const durationMs = Date.now() - startTime;
        agentTraceService.completeTrace(trace.traceId, 'COMPLETED', true, durationMs);

        return {
          success: true,
          requestId: request.requestId,
          traceId: trace.traceId,
          conversationId,
          state: 'COMPLETED',
          intent: intentResult.intent,
          answer: 'Permintaan Anda telah diterima.',
          provider: 'ezrab_core',
          model: null,
          toolCallsExecuted: [],
          actionProposal: null,
          provenance: [],
          requiresConfirmation: false,
          warnings: plan.warnings,
          meta: {
            durationMs,
            sources: ['ezrab_core'],
            isDeterministic: true,
            projectIsolated: true
          }
        };
      }

      const primaryStep = plan.steps[0];

      // 6. Execute Plan Step
      if (primaryStep.category === 'MUTATE' || primaryStep.requiresConfirmation) {
        // WRITE Tool -> ActionProposal with Confirmation
        stateMachine.transitionTo('WAITING_CONFIRMATION');
        const stepResult = await agentExecutor.executeStep(primaryStep, sessionContext);

        const durationMs = Date.now() - startTime;
        agentTraceService.updateTrace(trace.traceId, {
          actionProposalId: stepResult.actionProposal?.id,
          toolsSelected: [primaryStep.toolName]
        });
        agentTraceService.completeTrace(trace.traceId, 'WAITING_CONFIRMATION', true, durationMs);

        const answer = stepResult.actionProposal
          ? agentResponseBuilder.formatProposalPrompt(stepResult.actionProposal)
          : 'Proposal perubahan telah disiapkan.';

        return {
          success: true,
          requestId: request.requestId,
          traceId: trace.traceId,
          conversationId,
          state: 'WAITING_CONFIRMATION',
          intent: intentResult.intent,
          answer,
          provider: 'ezrab_core',
          model: null,
          toolCallsExecuted: [],
          actionProposal: stepResult.actionProposal || null,
          provenance: stepResult.provenance || [],
          requiresConfirmation: true,
          warnings: plan.warnings,
          meta: {
            durationMs,
            sources: ['ezrab_database', 'ahsp_database'],
            isDeterministic: true,
            projectIsolated: true
          }
        };
      } else {
        // READ / ANALYZE Tool -> Deterministic Execution
        stateMachine.transitionTo('EXECUTING');
        const stepResult = await agentExecutor.executeStep(primaryStep, sessionContext);

        stateMachine.transitionTo('VALIDATING');
        stateMachine.transitionTo('COMPLETED');

        const durationMs = Date.now() - startTime;
        agentTraceService.updateTrace(trace.traceId, {
          toolsSelected: [primaryStep.toolName]
        });
        agentTraceService.completeTrace(trace.traceId, 'COMPLETED', stepResult.success, durationMs);

        const answer = stepResult.success
          ? agentResponseBuilder.formatReadResult(
              intentResult.intent,
              primaryStep.toolName,
              stepResult.result,
              stepResult.provenance
            )
          : `Gagal mengambil data: ${stepResult.error || 'Terjadi kesalahan sistem.'}`;

        return {
          success: stepResult.success,
          requestId: request.requestId,
          traceId: trace.traceId,
          conversationId,
          state: 'COMPLETED',
          intent: intentResult.intent,
          answer,
          provider: 'ezrab_core',
          model: null,
          toolCallsExecuted: [
            {
              toolName: primaryStep.toolName,
              result: stepResult.result,
              durationMs
            }
          ],
          actionProposal: null,
          provenance: stepResult.provenance || [],
          requiresConfirmation: false,
          warnings: plan.warnings,
          meta: {
            durationMs,
            sources: ['ezrab_database'],
            isDeterministic: true,
            projectIsolated: true
          }
        };
      }
    } catch (error: any) {
      stateMachine.transitionTo('TOOL_FAILED', error.message);
      const durationMs = Date.now() - startTime;
      agentTraceService.completeTrace(trace.traceId, 'TOOL_FAILED', false, durationMs, {
        code: 'AGENT_EXECUTION_ERROR',
        message: error.message || 'Eksekusi agent mengalami kendala.'
      });

      return {
        success: false,
        requestId: request.requestId,
        traceId: trace.traceId,
        conversationId: request.conversationId || 'error-conv',
        state: 'TOOL_FAILED',
        intent: 'UNKNOWN',
        answer: `Maaf, terjadi kesalahan saat memproses permintaan: ${error.message || 'Sistem sibuk.'}`,
        provider: 'ezrab_core',
        model: null,
        toolCallsExecuted: [],
        actionProposal: null,
        provenance: [],
        requiresConfirmation: false,
        warnings: [error.message || 'Internal error'],
        meta: {
          durationMs,
          sources: [],
          isDeterministic: true,
          projectIsolated: true
        }
      };
    }
  }

  /**
   * Confirms and applies an ActionProposal
   */
  public async executeConfirmation(
    proposalId: string,
    ctx: { workspaceId: string; projectId: string; userId: string; userRole?: string }
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    return agentExecutor.confirmProposal(proposalId, ctx);
  }

  /**
   * Cancels an ActionProposal
   */
  public cancelConfirmation(
    proposalId: string,
    ctx: { workspaceId: string; projectId: string }
  ): { success: boolean; message: string } {
    return agentExecutor.cancelProposal(proposalId, ctx);
  }
}

export const agentOrchestrator = AgentOrchestrator.getInstance();

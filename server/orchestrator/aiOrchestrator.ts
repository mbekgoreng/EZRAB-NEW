import { aiDbAdapter } from '../database/dbAdapter';
import { contextBuilder } from './contextBuilder';
import { toolRegistry } from '../tools/toolRegistry';
import { ProviderFactory } from '../providers/providerFactory';
import { AIMessage } from '../database/types';
import { intentClassifier, ClassifiedIntent } from './intentClassifier';
import { personalityEngine } from './personalityEngine';
import { subscriptionDataService } from '../services/extendedDataServices';
import { autoAnswerEngine } from '../services/autoAnswerEngine';
import { observabilityService } from '../services/observabilityService';

export interface OrchestrateChatRequest {
  workspaceId: string;
  projectId: string;
  userId: string;
  userRole?: string;
  conversationId?: string;
  message: string;
  currentPage?: string;
  onThinking?: (step: string) => void;
}

export interface ActionProposal {
  actionId: string;
  toolName: string;
  parameters: Record<string, any>;
  description: string;
  requiresConfirmation: boolean;
  costImpact?: number;
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  beforeState?: any;
  afterState?: any;
}

import { WizardStateMachine, AssistantWizardResponse } from '../services/wizardStateMachine';
import { QuickActionStateMachine, QuickActionDialogueResponse } from '../services/quickActionStateMachine';
import { QUICK_ACTION_CONTRACTS } from '../../src/data/quickActionContracts';

export interface OrchestrateChatResponse {
  success: boolean;
  intent: string;
  action?: string;
  requires_confirmation: boolean;
  conversationId: string;
  messageId: string;
  content: string;
  toolCallsExecuted: { toolName: string; result: any }[];
  actionProposal?: ActionProposal;
  wizardResponse?: AssistantWizardResponse;
  quickActionResponse?: QuickActionDialogueResponse;
  status: 'COMPLETED' | 'CONFIRMATION_REQUIRED' | 'REFUSED' | 'ERROR';
  data?: any;
  warnings: string[];
  next_actions: string[];
  followUpSuggestions?: string[];
}

export class AIOrchestrator {
  private maxIterations = 5;

  /**
   * Main AI Chat Orchestration Pipeline with Multi-Turn Tool Execution, Intent & Personality integration
   */
  public async handleChat(request: OrchestrateChatRequest): Promise<OrchestrateChatResponse> {
    const reqStart = Date.now();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const {
      workspaceId,
      projectId,
      userId,
      userRole = 'ESTIMATOR',
      message,
      currentPage = 'dashboard',
      onThinking
    } = request;

    // 1. Ensure conversation exists and belongs to workspace/project
    let conversationId = request.conversationId;
    if (!conversationId) {
      const newConv = await aiDbAdapter.createConversation(
        workspaceId,
        projectId,
        userId,
        message.slice(0, 40) + '...'
      );
      conversationId = newConv.id;
    }

    // 2. Classify Intent & Evaluate Personality / Tone / Security
    const intent: ClassifiedIntent = intentClassifier.classify(message, currentPage);
    const personality = personalityEngine.evaluate(message);

    // 3. Security Refusal Check (Strict - No execution, Zero humor)
    const isExplicitSecurityCategory = [
      'SECRET_DISCLOSURE',
      'ROLE_ESCALATION',
      'DATA_DESTRUCTION',
      'SECURITY_BYPASS',
      'PAYMENT_BYPASS',
      'PRIVACY_VIOLATION',
      'DANGEROUS_REQUEST'
    ].includes(intent.category);

    if (personality.isSecuritySensitive || isExplicitSecurityCategory) {
      const refusalText = personality.safeRefusal || 'Permintaan ini tidak dapat diproses demi mematuhi kebijakan keamanan dan integritas data EZRAB.';
      const refusalMsg = await aiDbAdapter.addMessage(conversationId, 'assistant', refusalText);
      observabilityService.logTelemetry({
        requestId,
        conversationId,
        userId,
        workspaceId,
        projectId,
        intent: intent.category,
        confidence: intent.confidence,
        latencyMs: Date.now() - reqStart,
        finalResponseType: 'refused',
        fallbackReason: 'security_refusal'
      });
      return {
        success: false,
        intent: intent.category,
        requires_confirmation: false,
        conversationId,
        messageId: refusalMsg.id,
        content: refusalText,
        toolCallsExecuted: [],
        status: 'REFUSED',
        warnings: ['Permintaan ditolak demi kepatuhan kebijakan keamanan.'],
        next_actions: ['Ajukan pertanyaan terkait estimasi RAB atau manajemen proyek.']
      };
    }

    // 3.1 AUTOMATIC INTERACTIVE RAB WIZARD START
    if (intent.category === 'AUTOMATIC_RAB_START') {
      const wizardResp = WizardStateMachine.startSession({
        workspaceId,
        userId,
        projectId,
        conversationId,
        initialQuery: message
      });

      const wizardMsg = await aiDbAdapter.addMessage(conversationId, 'assistant', wizardResp.message);
      observabilityService.logTelemetry({
        requestId,
        conversationId,
        userId,
        workspaceId,
        projectId,
        intent: 'AUTOMATIC_RAB_START',
        confidence: intent.confidence,
        workflow: 'interactive_rab_wizard',
        latencyMs: Date.now() - reqStart,
        finalResponseType: 'wizard'
      });

      return {
        success: true,
        intent: 'AUTOMATIC_RAB_START',
        requires_confirmation: false,
        conversationId,
        messageId: wizardMsg.id,
        content: wizardResp.message,
        toolCallsExecuted: [],
        wizardResponse: wizardResp,
        status: 'COMPLETED',
        warnings: [],
        next_actions: ['Pilih tipe rumah di bawah ini untuk memulai spesifikasi teknis']
      };
    }

    // 3.2 STRUCTURED QUICK ACTION TRIGGER OR DIRECT WORKFLOW START
    const quickActionMatch = message.match(/^\[QUICK_ACTION_TRIGGER:([A-Z_]+)\]/i);
    const triggeredActionId = quickActionMatch ? quickActionMatch[1].toUpperCase() : null;
    
    // Also detect natural quick action initial prompts or exact button titles
    let matchedActionId: string | null = triggeredActionId;
    if (!matchedActionId) {
      const normMsg = message.toLowerCase().trim();
      if (normMsg.startsWith('bantu saya melakukan audit rab') || normMsg === 'audit rab') matchedActionId = 'AUDIT_RAB';
      else if (normMsg.startsWith('bantu saya menghitung volume') || normMsg === 'hitung volume') matchedActionId = 'HITUNG_VOLUME';
      else if (normMsg.startsWith('saya bantu mencari ahsp') || normMsg === 'cari ahsp') matchedActionId = 'CARI_AHSP';
      else if (normMsg.startsWith('bantu saya mencari harga') || normMsg === 'cari harga') matchedActionId = 'CARI_HARGA';
      else if (normMsg.startsWith('bantu saya menganalisis dokumen ded') || normMsg === 'analisis ded') matchedActionId = 'ANALISIS_DED';
      else if (normMsg.startsWith('bantu saya membuat laporan proyek') || normMsg === 'buat laporan') matchedActionId = 'BUAT_LAPORAN';
      else if (normMsg.startsWith('bantu saya memeriksa kurva s') || normMsg === 'periksa kurva s') matchedActionId = 'PERIKSA_KURVA_S';
      else if (normMsg.startsWith('item pekerjaan atau data apa yang ingin anda jelaskan') || normMsg === 'jelaskan item') matchedActionId = 'JELASKAN_ITEM';
      else if (normMsg.startsWith('bantu saya menghitung ulang rab') || normMsg === 'recalculate' || normMsg === 'hitung ulang') matchedActionId = 'RECALCULATE';
      else if (normMsg.startsWith('saya bisa membantu anda menggunakan ezrab') || normMsg === 'bantuan fitur') matchedActionId = 'BANTUAN_FITUR';
    }

    if (matchedActionId && QUICK_ACTION_CONTRACTS[matchedActionId]) {
      const cleanPrompt = message.replace(/^\[QUICK_ACTION_TRIGGER:[A-Z_]+\]\s*/i, '');
      const dialogueResp = QuickActionStateMachine.startSession({
        workspaceId,
        userId,
        projectId,
        userRole,
        conversationId,
        actionId: matchedActionId,
        initialPrompt: cleanPrompt
      });

      const dialogueMsg = await aiDbAdapter.addMessage(conversationId, 'assistant', dialogueResp.message);
      observabilityService.logTelemetry({
        requestId,
        conversationId,
        userId,
        workspaceId,
        projectId,
        intent: QUICK_ACTION_CONTRACTS[matchedActionId].intent,
        confidence: 0.99,
        workflow: `quick_action_${matchedActionId.toLowerCase()}`,
        latencyMs: Date.now() - reqStart,
        finalResponseType: 'quick_action_dialogue'
      });

      return {
        success: true,
        intent: QUICK_ACTION_CONTRACTS[matchedActionId].intent,
        requires_confirmation: dialogueResp.requiresConfirmation || false,
        conversationId,
        messageId: dialogueMsg.id,
        content: dialogueResp.message,
        toolCallsExecuted: [],
        quickActionResponse: dialogueResp,
        status: dialogueResp.requiresConfirmation ? 'CONFIRMATION_REQUIRED' : 'COMPLETED',
        warnings: [],
        next_actions: dialogueResp.followUpSuggestions || []
      };
    }

    // 4. Knowledge Base & 9999 Universal Dataset Auto-Answers, Humor, Greetings, Small Talk (Zero Credit & Zero Dump)
    const isBasicChat = [
      'GREETING',
      'HOW_ARE_YOU',
      'SMALL_TALK',
      'THANKS',
      'GOODBYE',
      'IDENTITY_QUESTION',
      'CAPABILITY_QUESTION',
      'PRODUCT_OVERVIEW',
      'BASIC_HELP',
      'ACCOUNT_HELP',
      'PAYMENT_SENSITIVE',
      'GENERAL_QUESTION',
      'GENERAL_CHAT',
      'JOKING'
    ].includes(intent.category);

    let responseText = personality.humorResponse;
    let selectedSource: 'knowledge_base' | 'dataset' | 'live_data' | 'tool' | 'fallback' = 'knowledge_base';
    let matchedEntryId: string | undefined;
    let confidenceScore = intent.confidence;

    let autoAnswerResult: any = null;
    const isWriteOrFunctionIntent = intent.requiresFunction || intent.requiresConfirmation || intent.category.includes('CREATE') || intent.category.includes('UPDATE') || intent.category.includes('DELETE');
    if (!responseText && !isWriteOrFunctionIntent) {
      // Check Auto Answer Engine across 9,999 dataset
      autoAnswerResult = await autoAnswerEngine.answerQuestion(message, {
        userId,
        workspaceId,
        projectId,
        conversationId
      });

      if (autoAnswerResult && autoAnswerResult.confidence >= 0.60 && autoAnswerResult.source_type !== 'fallback') {
        responseText = autoAnswerResult.answer;
        selectedSource = autoAnswerResult.source_type as any;
        matchedEntryId = autoAnswerResult.matched_entry_id || undefined;
        confidenceScore = autoAnswerResult.confidence;
      } else if (!isBasicChat) {
        // Neural fallback to DeepSeek Flash 4.1 (masked as ezrab-1.2-flash)
        try {
          const { chatOpenAiCompatible } = await import('../providers/multiProvider/adapters');
          const deepseekRes = await chatOpenAiCompatible({
            providerId: 'vleee',
            modelId: 'ali/deepseek-v4.1-flash',
            prompt: message,
            systemPrompt: 'Anda adalah EZRAB AI Assistant (model resmi: ezrab-1.2-flash), asisten digital cerdas resmi untuk estimasi biaya konstruksi, perhitungan RAB, analisa AHSP standar SNI/PUPR, analisis gambar kerja DED, QTO, dan manajemen proyek di Indonesia. Jawab secara ramah, profesional, lugas, dan solutif dalam bahasa Indonesia yang baik. PENTING: Jangan pernah menyebutkan nama vendor luar atau model pihak ketiga (DeepSeek, OpenAI, Gemini, dll) — identitas Anda sepenuhnya adalah "EZRAB AI" dengan model "ezrab-1.2-flash".',
            temperature: 0.2,
            maxTokens: 1500,
          });
          if (deepseekRes && deepseekRes.content && deepseekRes.content.trim()) {
            responseText = deepseekRes.content.trim();
            selectedSource = 'live_data';
            confidenceScore = 0.95;
          }
        } catch (llmErr) {
          console.warn('[AIOrchestrator] DeepSeek Flash fallback notice:', llmErr);
        }

        if (!responseText) {
          responseText = autoAnswerResult?.answer || 'Saya siap membantu kebutuhan estimasi dan manajemen proyek konstruksi Anda di EZRAB.';
          selectedSource = 'fallback';
          confidenceScore = autoAnswerResult?.confidence || 0.5;
        }
      }
    }

    if (responseText || isBasicChat) {
      if (!responseText) {
        if (intent.category === 'GREETING') {
          responseText = 'Halo! Saya EZRAB Magic AI. Ada yang ingin Anda tanyakan tentang proyek, RAB, QTO, AHSP, atau manajemen proyek?';
        } else if (intent.category === 'HOW_ARE_YOU') {
          responseText = 'Saya baik dan siap membantu Anda di EZRAB. Mau membahas RAB, QTO, AHSP, Kurva S, laporan proyek, atau hal lainnya?';
        } else if (intent.category === 'SMALL_TALK') {
          responseText = 'Saya selalu siap menemani dan membantu pekerjaan estimasi serta pengelolaan proyek Anda di EZRAB. Apa yang sedang ingin Anda kerjakan hari ini?';
        } else if (intent.category === 'THANKS') {
          responseText = 'Sama-sama! Senang bisa membantu Anda di EZRAB. Ada lagi yang perlu dihitung atau diperiksa?';
        } else if (intent.category === 'GOODBYE') {
          responseText = 'Sampai jumpa! Semoga proyek Anda berjalan lancar dan sukses selalu. Jangan ragu untuk menyapa saya kembali jika butuh bantuan.';
        } else if (intent.category === 'IDENTITY_QUESTION') {
          responseText = 'Saya adalah **EZRAB Magic AI**, asisten digital cerdas resmi untuk estimasi konstruksi, penyusunan RAB, perhitungan QTO, analisa harga satuan (AHSP standar PUPR), analisis DED, Kurva S, dan laporan proyek di platform EZRAB.';
        } else if (intent.category === 'CAPABILITY_QUESTION') {
          responseText = 'Saya dapat membantu Anda dalam perhitungan volume (QTO), penyusunan RAB, audit anomali harga, pencocokan AHSP PUPR 2026, monitoring Kurva S & deviasi progress, serta penyusunan laporan mingguan proyek.';
        } else if (intent.category === 'ACCOUNT_HELP') {
          responseText = 'Untuk keamanan akun dan sesi kerja Anda, EZRAB menerapkan isolasi multi-tenant yang ketat. Sesi login diverifikasi melalui backend resmi dan data tidak akan tertukar antar workspace.';
        } else if (intent.category === 'PAYMENT_SENSITIVE') {
          responseText = 'Untuk pembayaran paket berlangganan EZRAB Pro via QRIS, status transaksi diverifikasi secara real-time melalui payment gateway resmi. Silakan periksa menu Pengaturan Akun & Langganan untuk melihat status tagihan dan invoice QRIS Anda.';
        } else if (intent.category === 'GENERAL_CHAT' || intent.category === 'GENERAL_QUESTION') {
          responseText = autoAnswerResult?.answer || 'Saya siap membantu kebutuhan estimasi dan manajemen proyek konstruksi Anda di EZRAB.';
        } else {
          responseText = 'Saya siap membantu kebutuhan estimasi dan manajemen proyek konstruksi Anda di EZRAB.';
        }
      }

      const chatMsg = await aiDbAdapter.addMessage(conversationId, 'assistant', responseText);

      // Log answer in database
      aiDbAdapter.logAnswer({
        conversation_id: conversationId,
        message_id: chatMsg.id,
        user_id: userId,
        workspace_id: workspaceId,
        project_id: projectId,
        detected_intent: intent.category,
        selected_source: selectedSource,
        matched_entry_id: matchedEntryId,
        confidence_score: confidenceScore,
        response_mode: 'static',
        tool_called: false,
        fallback_used: false,
        response_time_ms: Date.now() - (reqStart || Date.now())
      });

      const nextActions = intent.category === 'IDENTITY_QUESTION' || intent.category === 'CAPABILITY_QUESTION'
        ? ['Buat proyek baru', 'Hitung RAB proyek', 'Cari AHSP 2026', 'Analisis DED']
        : intent.category === 'BASIC_HELP' || intent.category === 'PRODUCT_OVERVIEW'
        ? ['1. Buat Proyek Baru', '2. Buka Spreadsheet RAB', '3. Hitung Volume QTO', '4. Analisis DED']
        : ['Hitung RAB proyek', 'Cek Kurva S & Jadwal', 'Cari analisa AHSP', 'Bantuan fitur'];

      return {
        success: true,
        intent: intent.category,
        requires_confirmation: false,
        conversationId,
        messageId: chatMsg.id,
        content: responseText,
        toolCallsExecuted: [],
        status: 'COMPLETED',
        warnings: [],
        next_actions: nextActions
      };
    }

    // 6. Subscription & Credit Quota Verification from Backend
    const hasCredit = subscriptionDataService.checkCredit(workspaceId, 1);
    if (!hasCredit) {
      const creditMsg = 'Credit fitur AI Anda sudah habis untuk periode saat ini. Anda dapat memeriksa penggunaan atau meningkatkan paket langganan Anda.';
      const asstMsg = await aiDbAdapter.addMessage(conversationId, 'assistant', creditMsg);
      return {
        success: false,
        intent: 'CREDIT_QUERY',
        requires_confirmation: false,
        conversationId,
        messageId: asstMsg.id,
        content: creditMsg,
        toolCallsExecuted: [],
        status: 'REFUSED',
        warnings: ['Kuota kredit habis.'],
        next_actions: ['Lihat paket langganan EZRAB Pro']
      };
    }

    // Deduct 1 token credit for operation
    subscriptionDataService.deductCredit(workspaceId, 1);

    // 6. Persist user message
    const userMsg = await aiDbAdapter.addMessage(conversationId, 'user', message);

    // 7. Build Dynamic Context
    if (onThinking) onThinking('Membangun konteks proyek & menganalisis intensi...');
    const assembledContext = await contextBuilder.buildContext({
      workspaceId,
      projectId,
      currentPage,
      query: message,
      conversationId
    });

    const availableToolSchemas = toolRegistry.getSchemas();

    let iteration = 0;
    const executedTools: { toolName: string; result: any }[] = [];
    let pendingActionProposal: ActionProposal | undefined;

    // Conversation messages buffer for current session
    let sessionMessages: AIMessage[] = [...assembledContext.conversationHistory];
    if (!sessionMessages.some(m => m.id === userMsg.id)) {
      sessionMessages.push({
        id: userMsg.id,
        conversationId,
        role: 'user',
        content: message,
        createdAt: userMsg.created_at
      });
    }

    const { providerGateway } = await import('../providers/providerGateway');

    while (iteration < this.maxIterations) {
      iteration++;

      if (onThinking) onThinking(`Memproses penalaran model (iterasi ${iteration})...`);

      const routeInput = {
        taskType: (intent.requiresFunction || intent.requiresTools ? 'STRUCTURED_TOOL_CALLING' : 'SIMPLE_CHAT') as any,
        intent: intent.category,
        complexity: (intent.requiresReasoning || iteration > 1 ? 'HIGH' : 'LOW') as any,
        requiresTools: availableToolSchemas.length > 0,
        contextTokens: assembledContext.relevantContextMarkdown ? Math.ceil(assembledContext.relevantContextMarkdown.length / 4) : 2000
      };

      const response = await providerGateway.executeChat(routeInput, {
        systemPrompt: assembledContext.systemPrompt,
        contextMarkdown: assembledContext.relevantContextMarkdown,
        messages: sessionMessages,
        availableTools: availableToolSchemas,
        temperature: 0.2,
        projectId,
        workspaceId,
        userId
      });

      if (onThinking && response.reasoningContent) {
        const snippet = response.reasoningContent.length > 250
          ? response.reasoningContent.slice(0, 250) + '...'
          : response.reasoningContent;
        onThinking(`[Penalaran AI]: ${snippet}`);
      }

      // Record tokens
      if (response.tokenUsage && response.tokenUsage.totalTokens > 0) {
        aiDbAdapter.recordUsage({
          workspaceId,
          projectId,
          userId,
          conversationId,
          promptTokens: response.tokenUsage.promptTokens,
          completionTokens: response.tokenUsage.completionTokens,
          totalTokens: response.tokenUsage.totalTokens
        });
      }

      // Check if model returned tool calls
      if (response.toolCalls && response.toolCalls.length > 0) {
        let hasActionRequiringConfirmation = false;

        for (const call of response.toolCalls) {
          const toolDef = toolRegistry.get(call.name);
          if (!toolDef) {
            console.warn(`[AI Orchestrator] Tool ${call.name} not found in registry.`);
            continue;
          }

          // Check if this tool requires human confirmation before database mutation
          if (toolDef.requiresConfirmation) {
            hasActionRequiringConfirmation = true;
            const actionId = `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

            pendingActionProposal = {
              actionId,
              toolName: call.name,
              parameters: call.arguments,
              description: toolDef.description,
              requiresConfirmation: true,
              riskLevel: call.name.includes('delete') ? 'HIGH' : 'MEDIUM'
            };

            // Log pending tool call in db
            aiDbAdapter.createToolCall({
              conversationId,
              toolName: call.name,
              arguments: call.arguments,
              status: 'CONFIRMATION_REQUIRED'
            });

            break; // Stop loop and request confirmation
          }

          // Execute read tool
          if (onThinking) onThinking(`Menjalankan alat: ${toolDef.name}...`);
          try {
            const toolResult = await toolDef.execute(call.arguments, {
              workspaceId,
              projectId,
              userId,
              userRole
            });

            aiDbAdapter.createToolCall({
              conversationId,
              toolName: call.name,
              arguments: call.arguments,
              result: toolResult,
              status: 'SUCCESS'
            });

            executedTools.push({
              toolName: call.name,
              result: toolResult
            });

            // Append assistant tool request & tool response to session messages
            sessionMessages.push({
              id: `msg_asst_${Date.now()}`,
              conversationId,
              role: 'assistant',
              content: response.content || `Executing ${call.name}`,
              toolCalls: [call],
              createdAt: new Date().toISOString()
            });

            sessionMessages.push({
              id: `msg_tool_${Date.now()}`,
              conversationId,
              role: 'tool',
              toolCallId: call.id,
              content: JSON.stringify(toolResult),
              createdAt: new Date().toISOString()
            });
          } catch (err: any) {
            console.error(`[AI Orchestrator] Tool execution error (${call.name}):`, err);
            sessionMessages.push({
              id: `msg_err_${Date.now()}`,
              conversationId,
              role: 'tool',
              toolCallId: call.id,
              content: JSON.stringify({ error: err.message || 'Execution failed' }),
              createdAt: new Date().toISOString()
            });
          }
        }

        // If confirmation is needed, halt iteration and prompt user
        if (hasActionRequiringConfirmation) {
          const confirmationPrompt =
            response.content ||
            `Saya telah menyiapkan rancangan perubahan: **${pendingActionProposal?.toolName}**. Apakah Anda mengonfirmasi perubahan data ini?`;

          const asstMsg = await aiDbAdapter.addMessage(conversationId, 'assistant', confirmationPrompt);

          return {
            success: true,
            intent: intent.category,
            action: pendingActionProposal?.toolName,
            requires_confirmation: true,
            conversationId,
            messageId: asstMsg.id,
            content: confirmationPrompt,
            toolCallsExecuted: executedTools,
            actionProposal: pendingActionProposal,
            status: 'CONFIRMATION_REQUIRED',
            warnings: ['Tindakan ini memerlukan konfirmasi sebelum mengubah data proyek.'],
            next_actions: ['Klik Konfirmasi untuk menerapkan', 'Klik Batal untuk membatalkan']
          };
        }

        // Continue next loop iteration with tool results fed into context
        continue;
      }

      // Final textual response reached
      const finalMsg = await aiDbAdapter.addMessage(conversationId, 'assistant', response.content);

      return {
        success: true,
        intent: intent.category,
        requires_confirmation: false,
        conversationId,
        messageId: finalMsg.id,
        content: response.content,
        toolCallsExecuted: executedTools,
        status: 'COMPLETED',
        warnings: [],
        next_actions: []
      };
    }

    // Fallback if max iterations exceeded
    const fallbackContent = 'Analisis data selesai. Silakan periksa ringkasan yang telah ditampilkan.';
    const fallbackMsg = await aiDbAdapter.addMessage(conversationId, 'assistant', fallbackContent);

    return {
      success: true,
      intent: intent.category,
      requires_confirmation: false,
      conversationId,
      messageId: fallbackMsg.id,
      content: fallbackContent,
      toolCallsExecuted: executedTools,
      status: 'COMPLETED',
      warnings: [],
      next_actions: []
    };
  }

  /**
   * Execute an action proposal after user confirmed it
   */
  public async executeConfirmedAction(
    workspaceId: string,
    projectId: string,
    userId: string,
    userRole: string,
    action: ActionProposal
  ): Promise<{ success: boolean; result: any; message: string }> {
    const toolDef = toolRegistry.get(action.toolName);
    if (!toolDef) {
      throw new Error(`Tool ${action.toolName} not found in registry`);
    }

    const result = await toolDef.execute(action.parameters, {
      workspaceId,
      projectId,
      userId,
      userRole
    });

    return {
      success: true,
      result,
      message: `Tindakan ${action.toolName} berhasil dieksekusi.`
    };
  }
}

export const aiOrchestrator = new AIOrchestrator();

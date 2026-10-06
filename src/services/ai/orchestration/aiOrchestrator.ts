/**
 * EZRAB PROJECT COPILOT — UNIFIED AI ORCHESTRATOR
 * 
 * Central intelligence orchestrator linking Conversation Store, Tool Registry,
 * Action Safety Gate, and EZRAB Core Engines.
 * 
 * Pipeline:
 * USER REQUEST
 *   ↓
 * PROJECT ISOLATION CHECK (Fail-Closed)
 *   ↓
 * UNIFIED CONVERSATION STATE
 *   ↓
 * DETERMINISTIC INTENT & TOOL ROUTING
 *   ↓
 * TOOL EXECUTION (Information, Suggestion, Action)
 *   ↓
 * PREVIEW & ACTION PROPOSAL (If Mutation)
 *   ↓
 * UNIFIED RESPONSE
 */

import { unifiedConversationStore } from '../conversation/unifiedConversationStore';
import { aiToolRegistry } from '../tools/aiToolRegistry';
import { aiActionExecutor, ActionExecutionResult } from '../actions/aiActionExecutor';
import {
  ProjectIsolationError,
  buildUnifiedProjectContext,
  AIActionProposal,
} from '../../unifiedProjectContext';
import { defaultAiProvider } from '../../aiProviderEngine';
import { buildFullAIContext } from '../../aiContextService';
import type { Project, RabItem } from '../../../types';
import type { AIMessage } from '../conversation/conversationTypes';
import { ezrabCoreAi } from '../core/ezrabCoreAi';

export interface CopilotSendParams {
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

export interface CopilotResponseResult {
  message: AIMessage;
  conversationId: string;
  actionProposal?: AIActionProposal;
  toolUsed?: string;
}

export class EZRABProjectCopilotOrchestrator {
  private static instance: EZRABProjectCopilotOrchestrator | null = null;

  public static getInstance(): EZRABProjectCopilotOrchestrator {
    if (!EZRABProjectCopilotOrchestrator.instance) {
      EZRABProjectCopilotOrchestrator.instance = new EZRABProjectCopilotOrchestrator();
    }
    return EZRABProjectCopilotOrchestrator.instance;
  }

  /**
   * Main interaction endpoint for all AI surfaces (Floating Chatbox & SuperView)
   */
  public async handleUserMessage(params: CopilotSendParams): Promise<CopilotResponseResult> {
    const rawMessage = params.message.trim();
    if (!rawMessage) {
      throw new Error('Pesan tidak boleh kosong.');
    }

    // 1. Strict Project Isolation Check
    if (!params.projectId || !params.projectId.trim()) {
      throw new ProjectIsolationError('PROJECT_ISOLATION_ERROR: ProjectId wajib diisi.');
    }

    const projectId = params.projectId.trim();
    if (params.project && params.project.id !== projectId) {
      throw new ProjectIsolationError(
        `PROJECT_ISOLATION_ERROR: Target projectId ${projectId} tidak sesuai dengan project.id ${params.project.id}.`
      );
    }

    // 2. Resolve Active Conversation
    const conversation = params.conversationId
      ? (unifiedConversationStore.getConversation(params.conversationId, projectId) ||
         unifiedConversationStore.getOrCreateActiveConversation(projectId))
      : unifiedConversationStore.getOrCreateActiveConversation(projectId);

    const conversationId = conversation.id;

    // 3. Record User Message to Unified Store
    unifiedConversationStore.appendMessage(conversationId, projectId, {
      role: 'user',
      content: rawMessage,
    });

    if (params.onThinking) {
      params.onThinking('Memahami konteks proyek & routing tool...');
    }

    const lower = rawMessage.toLowerCase();

    // 4. Deterministic Intent & Tool Routing
    const toolContext = {
      projectId,
      conversationId,
      userId: params.userId || 'current-user',
      organizationId: params.organizationId,
      project: params.project,
      rabItems: params.rabItems,
      onAddRabItemDirect: params.onAddRabItemDirect,
    };

    // A. Query: Total RAB
    if (
      lower.includes('total rab') ||
      lower.includes('total anggaran') ||
      lower.includes('total biaya') ||
      (lower.includes('berapa') && lower.includes('rab') && !lower.includes('struktur') && !lower.includes('tambah')) ||
      (lower.includes('berapa') && lower.includes('anggaran'))
    ) {
      const toolRes = await aiToolRegistry.executeTool('getRabTotal', {}, toolContext);
      if (toolRes.success) {
        const data = toolRes.result as any;
        const reply = unifiedConversationStore.appendMessage(conversationId, projectId, {
          role: 'assistant',
          badge: 'RAB',
          content: `Berdasarkan data RAB aktif untuk proyek **${params.project?.name || projectId}**, total nilai estimasi resmi saat ini adalah **${data.totalRabFormatted}** yang mencakup **${data.itemCount} item pekerjaan terdaftar**.\n\nSeluruh perhitungan ditarik langsung dari database RAB proyek.`,
          stats: {
            label: 'Total Nilai RAB Proyek',
            value: data.totalRabFormatted,
            sub: `${data.itemCount} item pekerjaan`,
            color: '#2563EB',
          },
          toolCalls: [{ id: `tc-${Date.now()}`, toolName: 'getRabTotal', arguments: {} }],
          toolResults: [{
            toolCallId: `tc-${Date.now()}`,
            toolName: 'getRabTotal',
            success: true,
            result: data,
            provenance: toolRes.provenance,
          }],
        });

        return { message: reply, conversationId, toolUsed: 'getRabTotal' };
      }
    }

    // B. Query: Kategori Pekerjaan RAB (misal: "tampilkan pekerjaan struktur")
    if (
      lower.includes('pekerjaan struktur') ||
      lower.includes('item struktur') ||
      lower.includes('pekerjaan arsitektur') ||
      lower.includes('pekerjaan persiapan') ||
      (lower.includes('tampilkan') && lower.includes('pekerjaan'))
    ) {
      let targetCat = 'struktur';
      if (lower.includes('arsitektur')) targetCat = 'arsitektur';
      else if (lower.includes('persiapan')) targetCat = 'persiapan';
      else if (lower.includes('tanah')) targetCat = 'tanah';

      const toolRes = await aiToolRegistry.executeTool('getRabGroup', { categoryName: targetCat }, toolContext);
      if (toolRes.success) {
        const data = toolRes.result as any;
        const rows = (data.items || []).slice(0, 5).map((it: any) => [
          it.description,
          `${it.volume} ${it.unit}`,
          'Rp ' + Math.round(it.unitPrice || 0).toLocaleString('id-ID'),
          'Rp ' + Math.round(it.amount || 0).toLocaleString('id-ID'),
        ]);

        const reply = unifiedConversationStore.appendMessage(conversationId, projectId, {
          role: 'assistant',
          badge: 'RAB',
          content: `Ditemukan **${data.itemCount} item pekerjaan** pada kelompok **${data.categoryName}** dengan subtotal nilai **${data.subtotalFormatted}**:\n\nKomponen biaya ini diambil langsung dari tabel RAB aktif proyek.`,
          stats: {
            label: `Subtotal ${data.categoryName}`,
            value: data.subtotalFormatted,
            sub: `${data.itemCount} item`,
            color: '#2563EB',
          },
          table: rows.length > 0 ? {
            headers: ['Uraian Pekerjaan', 'Volume', 'Harga Satuan', 'Subtotal'],
            rows,
          } : undefined,
          toolCalls: [{ id: `tc-${Date.now()}`, toolName: 'getRabGroup', arguments: { categoryName: targetCat } }],
          toolResults: [{
            toolCallId: `tc-${Date.now()}`,
            toolName: 'getRabGroup',
            success: true,
            result: data,
            provenance: toolRes.provenance,
          }],
        });

        return { message: reply, conversationId, toolUsed: 'getRabGroup' };
      }
    }

    // C. Query: Hitung Volume (Deterministic Calculation Engine)
    if (
      lower.includes('hitung volume') ||
      lower.includes('hitung') && (lower.includes('volume') || lower.includes('lantai') || lower.includes('m2') || lower.includes('m3'))
    ) {
      const numbers = rawMessage.match(/\d+(\.\d+)?/g)?.map(Number) || [];
      if (numbers.length >= 2) {
        const length = numbers[0];
        const width = numbers[1];
        const height = numbers.length >= 3 ? numbers[2] : undefined;

        const calcRes = await aiToolRegistry.executeTool('calculateQuantity', { length, width, height }, toolContext);
        if (calcRes.success) {
          const res = calcRes.result as any;
          const reply = unifiedConversationStore.appendMessage(conversationId, projectId, {
            role: 'assistant',
            badge: 'RAB',
            content: `Hasil perhitungan volume deterministik via **EZRAB Core Calculator**:\n\n- **Formula**: \`${res.formula}\`\n- **Hasil Perhitungan**: **${res.formatted}**\n\nPerhitungan dilakukan secara matematis akurat oleh SafeDecimalEngine tanpa estimasi halusinasi.`,
            stats: {
              label: 'Hasil Perhitungan Volume',
              value: res.formatted,
              sub: `Formula: ${res.formula}`,
              color: '#10B981',
            },
            toolCalls: [{ id: `tc-${Date.now()}`, toolName: 'calculateQuantity', arguments: { length, width, height } }],
            toolResults: [{
              toolCallId: `tc-${Date.now()}`,
              toolName: 'calculateQuantity',
              success: true,
              result: res,
              provenance: calcRes.provenance,
            }],
          });

          return { message: reply, conversationId, toolUsed: 'calculateQuantity' };
        }
      }
    }

    // D. Query: Harga Material / Upah via Price Resolution Engine
    if (
      lower.includes('harga') &&
      (lower.includes('semen') || lower.includes('pasir') || lower.includes('batu') || lower.includes('besi') || lower.includes('hebel') || lower.includes('keramik') || lower.includes('cat'))
    ) {
      let matName = 'Semen';
      if (lower.includes('pasir')) matName = 'Pasir';
      else if (lower.includes('batu')) matName = 'Batu';
      else if (lower.includes('besi')) matName = 'Besi';
      else if (lower.includes('hebel')) matName = 'Bata Ringan';
      else if (lower.includes('keramik')) matName = 'Keramik';
      else if (lower.includes('cat')) matName = 'Cat';

      const priceRes = await aiToolRegistry.executeTool('resolvePrice', { name: matName }, toolContext);
      if (priceRes.success) {
        const pData = priceRes.result as any;
        const reply = unifiedConversationStore.appendMessage(conversationId, projectId, {
          role: 'assistant',
          badge: 'AHSP',
          content: `Informasi harga resmi terverifikasi untuk **${pData.itemName}**:\n\n- **Harga Satuan**: **${pData.priceFormatted}**\n- **Tingkat Sumber (Tier)**: \`${pData.sourceTier}\`\n- **Detail Sumber**: ${pData.sourceDetail}\n\nHarga ini ditarik melalui Price Resolution Engine dengan hierarki resmi: Project Override → Project Price → Master DB → Regional.`,
          stats: {
            label: `Harga Resmi ${pData.itemName}`,
            value: pData.priceFormatted,
            sub: `Sumber: ${pData.sourceDetail}`,
            color: '#2563EB',
          },
          toolCalls: [{ id: `tc-${Date.now()}`, toolName: 'resolvePrice', arguments: { name: matName } }],
          toolResults: [{
            toolCallId: `tc-${Date.now()}`,
            toolName: 'resolvePrice',
            success: true,
            result: pData,
            provenance: priceRes.provenance,
          }],
        });

        return { message: reply, conversationId, toolUsed: 'resolvePrice' };
      } else {
        const reply = unifiedConversationStore.appendMessage(conversationId, projectId, {
          role: 'assistant',
          badge: 'AHSP',
          content: `Saya belum menemukan harga proyek/material yang valid untuk **${matName}** pada database proyek maupun master harga regional.`,
          isError: false,
        });
        return { message: reply, conversationId, toolUsed: 'resolvePrice' };
      }
    }

    // E. Mutation: Tambah Pekerjaan Baru (ACTION Proposal with Preview)
    const isAddWorkItem =
      (/\b(tambah|tambahkan|buatkan)\b/i.test(lower) && /\b(pekerjaan|item|pos)\b/i.test(lower)) ||
      lower.includes('tambah pekerjaan') ||
      lower.includes('tambahkan pekerjaan');

    if (isAddWorkItem && !/\bpekerja\b/i.test(lower.replace(/pekerjaan/g, ''))) {
      const volMatch = rawMessage.match(/\d+(\.\d+)?/);
      const volume = volMatch ? parseFloat(volMatch[0]) : 10;
      let desc = 'Pekerjaan Pasangan Keramik 60x60';
      let unit = 'm²';
      let ahspCode = 'A.4.4.3.1';

      if (lower.includes('bata') || lower.includes('hebel')) {
        desc = 'Pasangan Dinding Bata Ringan (Hebel) t=10cm';
        ahspCode = 'A.4.4.1.1';
      } else if (lower.includes('cat') || lower.includes('pengecatan')) {
        desc = 'Pengecatan Dinding Interior 2 Lapis';
        ahspCode = 'A.4.7.1.10';
      } else if (lower.includes('plester')) {
        desc = 'Plesteran Dinding Mortar 1:4 t=15mm';
        ahspCode = 'A.4.4.2.1';
      }

      const proposalRes = await aiToolRegistry.executeTool('proposeAddRabItem', {
        description: desc,
        volume,
        unit,
        ahspCode,
      }, toolContext);

      if (proposalRes.success && proposalRes.proposal) {
        const prop = proposalRes.proposal;
        const resData = proposalRes.result as any;

        const reply = unifiedConversationStore.appendMessage(conversationId, projectId, {
          role: 'assistant',
          badge: 'ACTION',
          content: `Saya telah menyusun **Proposal Tindakan Penambahan Item RAB** untuk ditinjau:\n\n### 📋 Detail Proposal:\n- **Uraian**: ${desc}\n- **Volume**: **${volume} ${unit}**\n- **Estimasi Harga Satuan**: Rp ${Math.round(resData.summary.unitPrice).toLocaleString('id-ID')}\n- **Total Biaya Tambahan**: **Rp ${Math.round(resData.summary.totalAmount).toLocaleString('id-ID')}**\n- **Sumber Harga**: ${resData.summary.source}\n\n*Perubahan ini membutuhkan persetujuan Anda sebelum diterapkan ke spreadsheet RAB resmi.*`,
          actionProposal: prop,
          followUpSuggestions: ['Setujui Proposal', 'Tolak Proposal'],
          toolCalls: [{ id: `tc-${Date.now()}`, toolName: 'proposeAddRabItem', arguments: { description: desc, volume, unit, ahspCode } }],
          toolResults: [{
            toolCallId: `tc-${Date.now()}`,
            toolName: 'proposeAddRabItem',
            success: true,
            result: resData,
            provenance: proposalRes.provenance,
          }],
        });

        return { message: reply, conversationId, actionProposal: prop, toolUsed: 'proposeAddRabItem' };
      }
    }

    // F. User Confirmation: "Setujui" / "Tolak" for Active Proposal
    if (lower === 'setujui' || lower === 'approve' || lower === 'setuju' || lower === 'terapkan') {
      // Find latest message with pending action proposal in this conversation
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
            content: `✅ **Aksi Telah Disetujui & Diterapkan**\n\n${execResult.message}\nItem telah tercatat di spreadsheet RAB proyek dan riwayat perubahan tersimpan di Audit Log resmi.`,
          });
          return { message: reply, conversationId };
        } else {
          const reply = unifiedConversationStore.appendMessage(conversationId, projectId, {
            role: 'assistant',
            badge: 'ACTION',
            content: `⚠️ **Gagal Menerapkan Aksi**: ${execResult.message}`,
            isError: true,
          });
          return { message: reply, conversationId };
        }
      }
    }

    // G. Delegate to EZRAB Core AI Master Agent
    try {
      const coreRes = await ezrabCoreAi.processRequest(params);
      return {
        message: coreRes.message,
        conversationId: coreRes.conversationId,
        actionProposal: coreRes.actionProposal,
        toolUsed: coreRes.toolUsed,
      };
    } catch (err: any) {
      if (err instanceof ProjectIsolationError) {
        throw err;
      }

      // Resilient Fallback to Construction Provider Engine with Full AI Context
      const fullContext = buildFullAIContext(params.project || null, params.rabItems || []);
      const localResult = await defaultAiProvider.chat(
        rawMessage,
        fullContext,
        params.onThinking
      );

      let proposal: AIActionProposal | undefined = undefined;
      if (localResult.actionProposal) {
        proposal = {
          id: localResult.actionProposal.id,
          type: 'ACTION',
          projectId,
          action: localResult.actionProposal.type,
          title: localResult.actionProposal.title,
          description: localResult.actionProposal.description,
          requiresApproval: true,
          isMutation: true,
          status: 'PENDING',
          proposedChanges: localResult.actionProposal.itemData,
          createdAt: new Date().toISOString(),
        };
      }

      const reply = unifiedConversationStore.appendMessage(conversationId, projectId, {
        role: 'assistant',
        badge: localResult.badge,
        content: localResult.content,
        stats: localResult.stats,
        table: localResult.table,
        actionProposal: proposal,
      });

      return { message: reply, conversationId, actionProposal: proposal };
    }
  }
}

export const ezrabProjectCopilot = EZRABProjectCopilotOrchestrator.getInstance();

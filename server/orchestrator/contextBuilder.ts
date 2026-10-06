import { aiDbAdapter } from '../database/dbAdapter';
import { rabDataService } from '../services/rabDataService';
import { curveSDataService } from '../services/curveSDataService';
import { contextRouter, RouteAnalysis } from './contextRouter';
import { intentClassifier, ClassifiedIntent } from './intentClassifier';
import { AIMessage } from '../database/types';

export interface BuildContextParams {
  workspaceId: string;
  projectId: string;
  currentPage?: string;
  query?: string;
  conversationId?: string;
}

export interface AssembledAIContext {
  systemPrompt: string;
  intentAnalysis: RouteAnalysis;
  relevantContextMarkdown: string;
  conversationHistory: AIMessage[];
}

export class ContextBuilder {
  /**
   * Build complete multi-layered context prompt for AI model with strict intent isolation
   */
  public async buildContext(params: BuildContextParams): Promise<AssembledAIContext> {
    const { workspaceId, projectId, currentPage = 'dashboard', query = '', conversationId } = params;

    const project = aiDbAdapter.getProject(workspaceId, projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found in workspace ${workspaceId}`);
    }

    const intentAnalysis = contextRouter.analyzeIntent(query, currentPage);
    const intent: ClassifiedIntent = intentClassifier.classify(query, currentPage);

    // Format currency IDR helper
    const formatRp = (val: number) =>
      new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);

    // Layer 1 & 2: System Persona & Workspace
    const systemPrompt = `Anda adalah EZRAB Magic AI — Lead AI Construction Estimator & Project Management Copilot.
Anda adalah pakar estimasi biaya konstruksi sipil dan arsitektur Indonesia (berdasarkan standar Permen PUPR No. 1/PRT/M/2022 dan update 2026), ahli manajemen proyek kurva S, perhitungan QTO, dan analisa harga satuan (AHSP).

Prinsip Kerja & Integritas:
1. Akurasi data nomor satu: Jangan mengarang angka atau rumus. Gunakan alat function calling jika membutuhkan data spesifik.
2. Satuan & Format: Gunakan rupiah Indonesia (IDR), satuan metrik SNI (m³, m², m¹, kg, OH, Ls).
3. Workspace & Data Isolation: Anda beroperasi secara ketat di dalam Workspace: "${workspaceId}" dan Proyek: "${project.name}" (ID: ${project.id}).
4. Modifikasi Data: Jika pengguna ingin menambah, mengubah, atau menghapus item RAB atau mengubah progress, usulkan tindakan tersebut secara jelas karena sistem memerlukan persetujuan konfirmasi pengguna sebelum database diubah.
5. Bahasa: Komunikatif, profesional, lugas, menggunakan bahasa Indonesia baku teknis konstruksi.`;

    // Strict Context Isolation:
    // For small talk, greetings, thanks, goodbye, identity, capability, and general conversational queries,
    // do NOT load project budget / Kurva S / delay data or inject automatic project summaries!
    const isNonProjectIntent = [
      'GREETING',
      'HOW_ARE_YOU',
      'SMALL_TALK',
      'THANKS',
      'GOODBYE',
      'CASUAL_CHAT',
      'GENERAL_CHAT',
      'JOKING',
      'HUMOR',
      'IDENTITY_QUESTION',
      'CAPABILITY_QUESTION',
      'BASIC_HELP',
      'PRODUCT_OVERVIEW',
      'SECURITY_SENSITIVE',
      'SECRET_DISCLOSURE',
      'PAYMENT_BYPASS',
      'ROLE_ESCALATION',
      'DATA_DESTRUCTION',
      'UNKNOWN'
    ].includes(intent.category);

    let contextMd = '';

    if (!isNonProjectIntent && intent.requiresProjectData) {
      // Intent-aware minimal context loading
      if (
        intent.category === 'PROJECT_PROGRESS' ||
        intentAnalysis.primaryDomain === 'PROGRESS' ||
        intentAnalysis.primaryDomain === 'KURVA_S'
      ) {
        // Load ONLY progress & schedule data
        const curveSummary = curveSDataService.getCurveSSummary(workspaceId, projectId);
        contextMd = `### KONTEKS PROGRESS & KURVA S PROYEK:
- **Nama Proyek**: ${project.name} (${project.id})
- **Progress Fisik Aktual**: ${curveSummary.actualCumulative}%
- **Target Rencana Kumulatif**: ${curveSummary.plannedCumulative}%
- **Deviasi Jadwal**: ${curveSummary.deviation >= 0 ? '+' : ''}${curveSummary.deviation}% (${curveSummary.statusLabel})
`;
        if (curveSummary.criticalPoints.length > 0) {
          contextMd += `\n### PERINGATAN KETERLAMBATAN:\n` +
            curveSummary.criticalPoints.map(cp => `- ${cp.issue}`).join('\n') + '\n';
        }
      } else if (
        intent.category === 'PROJECT_BUDGET' ||
        intent.category === 'RAB_QUERY' ||
        intentAnalysis.primaryDomain === 'RAB'
      ) {
        // Load ONLY RAB budget data
        const rabSummary = await rabDataService.getRabSummary(workspaceId, projectId);
        contextMd = `### KONTEKS ANGGARAN & RAB PROYEK:
- **Nama Proyek**: ${project.name} (${project.id})
- **Total Anggaran (RAB)**: ${formatRp(rabSummary.totalCost)} (${rabSummary.itemCount} item pekerjaan)

### RINGKASAN KATEGORI BIAYA TERBESAR:
${rabSummary.categoryBreakdown.slice(0, 4).map(c => `- **${c.category}**: ${formatRp(c.subtotal)} (${c.weightPercent}%)`).join('\n')}
`;
        if (rabSummary.missingVolumeItems.length > 0) {
          contextMd += `\n### ANOMALI VOLUME KOSONG:\n- Terdapat ${rabSummary.missingVolumeItems.length} item pekerjaan dengan volume 0 atau belum terisi.\n`;
        }
      } else if (
        intent.category === 'REPORT_ACTION' ||
        intentAnalysis.primaryDomain === 'REPORT'
      ) {
        // Load combined summary for reports
        const rabSummary = await rabDataService.getRabSummary(workspaceId, projectId);
        const curveSummary = curveSDataService.getCurveSSummary(workspaceId, projectId);
        contextMd = `### KONTEKS LAPORAN PROYEK:
- **Nama Proyek**: ${project.name} (${project.id})
- **Klien**: ${project.clientName || 'N/A'}
- **Lokasi**: ${project.location || 'Indonesia'}
- **Total Anggaran (RAB)**: ${formatRp(rabSummary.totalCost)}
- **Progress Aktual**: ${curveSummary.actualCumulative}% (Rencana: ${curveSummary.plannedCumulative}%)
- **Status Deviasi**: ${curveSummary.deviation >= 0 ? '+' : ''}${curveSummary.deviation}% (${curveSummary.statusLabel})
`;
      } else {
        // Minimal basic project header for general project inquiries
        contextMd = `### IDENTITAS PROYEK:
- **Nama Proyek**: ${project.name} (${project.id})
- **Klien**: ${project.clientName || 'N/A'}
- **Lokasi**: ${project.location || 'Indonesia'}
- **Tipe Bangunan**: ${project.buildingType || 'Umum'}
`;
      }
    }

    // Layer 6: Conversation History
    let conversationHistory: AIMessage[] = [];
    if (conversationId) {
      conversationHistory = aiDbAdapter.getMessages(conversationId).slice(-10);
    }

    return {
      systemPrompt,
      intentAnalysis,
      relevantContextMarkdown: contextMd,
      conversationHistory
    };
  }
}

export const contextBuilder = new ContextBuilder();

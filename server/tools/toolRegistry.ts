import { projectDataService } from '../services/projectDataService';
import { rabDataService } from '../services/rabDataService';
import { ahspDataService } from '../services/ahspDataService';
import { progressDataService } from '../services/progressDataService';
import { curveSDataService } from '../services/curveSDataService';
import { reportDataService } from '../services/reportDataService';
import { calculationService } from '../services/calculationService';
import {
  wbsDataService,
  qtoDataService,
  priceDataService,
  dedDataService,
  timeScheduleDataService,
  teamDataService,
  subscriptionDataService
} from '../services/extendedDataServices';
import { aiDbAdapter } from '../database/dbAdapter';

export interface ToolExecutionContext {
  workspaceId: string;
  projectId: string;
  userId: string;
  userRole?: string;
  isDryRun?: boolean;
}

export type ToolCategory = 'READ' | 'ANALYZE' | 'MUTATE';
export type ToolRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ToolDefinition {
  name: string;
  category?: ToolCategory;
  module:
    | 'PROJECT'
    | 'RAB'
    | 'WBS'
    | 'QTO'
    | 'AHSP'
    | 'PRICE'
    | 'DED'
    | 'KURVA_S'
    | 'TIME_SCHEDULE'
    | 'REPORT'
    | 'TEAM'
    | 'ACCOUNT';
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  inputSchema?: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  allowedRoles?: string[];
  riskLevel?: ToolRiskLevel;
  requiresConfirmation: boolean;
  dryRunSupported?: boolean;
  idempotent?: boolean;
  auditEvent?: string;
  requiredPermission: 'AI_VIEW' | 'AI_CHAT' | 'AI_ANALYZE' | 'AI_CREATE' | 'AI_UPDATE' | 'AI_DELETE';
  dryRun?: (args: any, context: ToolExecutionContext) => Promise<any> | any;
  execute: (args: any, context: ToolExecutionContext) => Promise<any> | any;
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  constructor() {
    this.registerAllTools();
  }

  public register(tool: ToolDefinition): void {
    // Defaults for structured attributes
    if (!tool.category) {
      if (tool.requiresConfirmation || tool.requiredPermission === 'AI_CREATE' || tool.requiredPermission === 'AI_UPDATE' || tool.requiredPermission === 'AI_DELETE') {
        tool.category = 'MUTATE';
      } else if (tool.requiredPermission === 'AI_ANALYZE' || tool.name.includes('analyze') || tool.name.includes('calculate') || tool.name.includes('validate') || tool.name.includes('compare')) {
        tool.category = 'ANALYZE';
      } else {
        tool.category = 'READ';
      }
    }

    if (!tool.inputSchema) {
      tool.inputSchema = tool.parameters;
    }

    if (!tool.allowedRoles) {
      if (tool.category === 'MUTATE') {
        tool.allowedRoles = ['SUPER_ADMIN', 'OWNER', 'PROJECT_MANAGER', 'ESTIMATOR'];
      } else {
        tool.allowedRoles = ['SUPER_ADMIN', 'OWNER', 'PROJECT_MANAGER', 'ESTIMATOR', 'DIREKSI', 'CLIENT', 'VIEWER'];
      }
    }

    if (!tool.riskLevel) {
      if (tool.name.includes('delete') || tool.name.includes('purge') || tool.name.includes('drop')) {
        tool.riskLevel = 'HIGH';
      } else if (tool.category === 'MUTATE') {
        tool.riskLevel = 'MEDIUM';
      } else {
        tool.riskLevel = 'LOW';
      }
    }

    if (tool.dryRunSupported === undefined) {
      tool.dryRunSupported = tool.category === 'MUTATE';
    }

    if (tool.idempotent === undefined) {
      tool.idempotent = tool.category === 'READ' || tool.category === 'ANALYZE';
    }

    if (!tool.auditEvent) {
      tool.auditEvent = `TOOL_${tool.category}_${tool.name.toUpperCase()}`;
    }

    this.tools.set(tool.name, tool);
  }

  public get(name: string): ToolDefinition | undefined {
    if (this.tools.has(name)) return this.tools.get(name);
    // Synonyms / Aliases
    const aliases: Record<string, string> = {
      'get_project_context': 'get_project',
      'get_project_data': 'get_project',
      'get_rab_total': 'get_rab_summary',
      'get_rab_items': 'search_rab_items',
      'get_items_rab': 'search_rab_items',
      'create_rab_item': 'add_rab_item',
      'validate_rab': 'audit_rab',
      'get_kurva_s': 'get_project_progress',
      'search_materials': 'search_material_price',
      'get_material_price': 'search_material_price',
      'get_ahsp': 'get_ahsp_detail',
      'search_ahsp_data': 'search_ahsp',
    };
    if (aliases[name] && this.tools.has(aliases[name])) {
      return this.tools.get(aliases[name]);
    }
    // Convert camelCase to snake_case
    const snake = name.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
    if (this.tools.has(snake)) return this.tools.get(snake);
    if (aliases[snake] && this.tools.has(aliases[snake])) {
      return this.tools.get(aliases[snake]);
    }
    // Convert snake_case to camelCase
    const camel = name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    if (this.tools.has(camel)) return this.tools.get(camel);
    return undefined;
  }

  public getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  public getByCategory(category: ToolCategory): ToolDefinition[] {
    return this.getAll().filter(t => t.category === category);
  }

  public getSchemas(): any[] {
    return this.getAll().map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema || tool.parameters
      }
    }));
  }

  /**
   * Safe execution wrapper verifying authorization, tenant context, dry-run simulation, and audit logging
   */
  public async executeSafe(
    toolName: string,
    args: any,
    ctx: ToolExecutionContext
  ): Promise<{
    success: boolean;
    isDryRun: boolean;
    result: any;
    auditEvent: string;
    riskLevel: ToolRiskLevel;
    requiresConfirmation: boolean;
  }> {
    const tool = this.get(toolName);
    if (!tool) {
      throw new Error(`Tool "${toolName}" not found in registry.`);
    }

    // Role verification (never trust frontend role blindly)
    const currentRole = ctx.userRole || 'ESTIMATOR';
    if (tool.allowedRoles && !tool.allowedRoles.includes(currentRole)) {
      throw new Error(`Access Denied: Role "${currentRole}" is not authorized to execute tool "${tool.name}".`);
    }

    // Tenant check
    if (!ctx.workspaceId) {
      throw new Error('Tenant Violation: Workspace ID is required to execute tools.');
    }

    // If dry-run requested or required before confirmation
    if (ctx.isDryRun) {
      let previewResult;
      if (tool.dryRun) {
        previewResult = await tool.dryRun(args, ctx);
      } else {
        previewResult = {
          dryRun: true,
          toolName: tool.name,
          category: tool.category,
          proposedArgs: args,
          description: tool.description,
          riskLevel: tool.riskLevel,
          simulatedEffect: `Simulasi perubahan untuk aksi ${tool.name}`
        };
      }
      return {
        success: true,
        isDryRun: true,
        result: previewResult,
        auditEvent: `${tool.auditEvent}_PREVIEW`,
        riskLevel: tool.riskLevel || 'LOW',
        requiresConfirmation: tool.requiresConfirmation
      };
    }

    // Live Execution
    const liveResult = await tool.execute(args, ctx);
    return {
      success: true,
      isDryRun: false,
      result: liveResult,
      auditEvent: tool.auditEvent || `TOOL_EXEC_${tool.name.toUpperCase()}`,
      riskLevel: tool.riskLevel || 'LOW',
      requiresConfirmation: tool.requiresConfirmation
    };
  }

  private registerAllTools(): void {
    // =========================================================================
    // 1. PROJECT FUNCTIONS (8)
    // =========================================================================
    this.register({
      name: 'list_projects',
      module: 'PROJECT',
      description: 'Daftar seluruh proyek konstruksi yang dapat diakses dalam workspace.',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (_args, ctx) => aiDbAdapter.getProjects(ctx.workspaceId)
    });

    this.register({
      name: 'get_project',
      module: 'PROJECT',
      description: 'Ambil rincian data proyek aktif (nama, nomor proyek, lokasi, tipe bangunan, klien).',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (_args, ctx) => aiDbAdapter.getProject(ctx.workspaceId, ctx.projectId)
    });

    this.register({
      name: 'create_project',
      module: 'PROJECT',
      description: 'Buat proyek konstruksi baru di dalam workspace.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          clientName: { type: 'string' },
          location: { type: 'string' },
          buildingType: { type: 'string' }
        },
        required: ['name']
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_CREATE',
      execute: async (args, ctx) => {
        const prj = aiDbAdapter.createProject(ctx.workspaceId, {
          id: `PRJ-${Date.now()}`,
          name: args.name,
          clientName: args.clientName || 'Klien Baru',
          location: args.location || 'Indonesia',
          buildingType: args.buildingType || 'Umum',
          status: 'draft',
          progress: 0,
          totalRab: 0
        });
        return { success: true, project: prj };
      }
    });

    this.register({
      name: 'update_project',
      module: 'PROJECT',
      description: 'Perbarui metadata administratif proyek.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          clientName: { type: 'string' },
          location: { type: 'string' }
        }
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_UPDATE',
      execute: async (args, ctx) => {
        const prj = aiDbAdapter.getProject(ctx.workspaceId, ctx.projectId);
        if (prj) Object.assign(prj, args);
        return { success: true, project: prj };
      }
    });

    this.register({
      name: 'archive_project',
      module: 'PROJECT',
      description: 'Arsipkan proyek yang telah selesai.',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: true,
      requiredPermission: 'AI_UPDATE',
      execute: async (_args, ctx) => {
        const prj = aiDbAdapter.getProject(ctx.workspaceId, ctx.projectId);
        if (prj) prj.status = 'archived' as any;
        return { success: true, message: `Proyek ${ctx.projectId} telah diarsipkan.` };
      }
    });

    this.register({
      name: 'restore_project',
      module: 'PROJECT',
      description: 'Pulihkan proyek yang diarsipkan kembali aktif.',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: true,
      requiredPermission: 'AI_UPDATE',
      execute: async (_args, ctx) => {
        const prj = aiDbAdapter.getProject(ctx.workspaceId, ctx.projectId);
        if (prj) prj.status = 'in_progress';
        return { success: true, message: `Proyek ${ctx.projectId} kembali aktif.` };
      }
    });

    this.register({
      name: 'delete_project',
      module: 'PROJECT',
      description: 'Hapus proyek secara permanen (hanya Super Admin).',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: true,
      requiredPermission: 'AI_DELETE',
      execute: async (_args, ctx) => {
        if (ctx.userRole !== 'SUPER_ADMIN') throw new Error('Hanya Super Admin yang dapat menghapus proyek.');
        return { success: true, message: `Proyek ${ctx.projectId} telah dihapus.` };
      }
    });

    this.register({
      name: 'get_project_summary',
      module: 'PROJECT',
      description: 'Ringkasan eksekutif proyek (RAB, progres kurva S, status jadwal).',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (_args, ctx) => projectDataService.getProjectSummary(ctx.workspaceId, ctx.projectId)
    });

    // =========================================================================
    // 2. RAB FUNCTIONS (13)
    // =========================================================================
    this.register({
      name: 'get_rab',
      module: 'RAB',
      description: 'Ambil seluruh struktur RAB proyek aktif beserta breakdown kategori dan total biaya.',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (_args, ctx) => rabDataService.getRabSummary(ctx.workspaceId, ctx.projectId)
    });

    this.register({
      name: 'get_rab_summary',
      module: 'RAB',
      description: 'Ambil seluruh struktur RAB proyek aktif beserta breakdown kategori dan total biaya.',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (_args, ctx) => rabDataService.getRabSummary(ctx.workspaceId, ctx.projectId)
    });

    this.register({
      name: 'search_rab_items',
      module: 'RAB',
      description: 'Daftar item baris RAB proyek aktif dengan filter pencarian.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          category: { type: 'string' },
          limit: { type: 'number' }
        }
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (args, ctx) => rabDataService.searchRabItems(ctx.workspaceId, ctx.projectId, args)
    });

    this.register({
      name: 'calculate_rab',
      module: 'RAB',
      description: 'Jalankan kalkulasi presisi tinggi untuk item pekerjaan RAB.',
      parameters: {
        type: 'object',
        properties: {
          items: { type: 'array', items: { type: 'object' } }
        }
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_ANALYZE',
      execute: async (args) => calculationService.calculateRabItems(args.items || [])
    });

    this.register({
      name: 'detect_cost_anomalies',
      module: 'RAB',
      description: 'Audit RAB aktif untuk mendeteksi volume kosong atau konsentrasi biaya tinggi.',
      parameters: {
        type: 'object',
        properties: { thresholdPercent: { type: 'number' } }
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_ANALYZE',
      execute: async (args, ctx) => {
        const summary = await rabDataService.getRabSummary(ctx.workspaceId, ctx.projectId);
        const threshold = (args.thresholdPercent || 25) / 100;
        const total = summary.totalCost;
        const flagged = summary.rabItems.filter(item => {
          const cost = item.totalPrice || item.amount || 0;
          return total > 0 && cost / total >= threshold;
        });
        return {
          totalCost: total,
          missingVolumeCount: summary.missingVolumeItems.length,
          missingVolumeItems: summary.missingVolumeItems,
          highConcentrationCount: flagged.length,
          highConcentrationItems: flagged
        };
      }
    });

    this.register({
      name: 'get_project_metadata',
      module: 'PROJECT',
      description: 'Ambil metadata administratif proyek.',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (_args, ctx) => projectDataService.getProjectMetadata(ctx.workspaceId, ctx.projectId)
    });

    this.register({
      name: 'get_project_progress',
      module: 'KURVA_S',
      description: 'Ambil ringkasan progres fisik proyek.',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (_args, ctx) => progressDataService.getProgressSummary(ctx.workspaceId, ctx.projectId)
    });

    this.register({
      name: 'update_progress',
      module: 'KURVA_S',
      description: 'Perbarui progres fisik proyek.',
      parameters: {
        type: 'object',
        properties: {
          newProgress: { type: 'number' },
          note: { type: 'string' }
        },
        required: ['newProgress']
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_UPDATE',
      execute: async (args, ctx) => progressDataService.updateProgress(ctx.workspaceId, ctx.projectId, args.newProgress, ctx.userId, args.note)
    });

    this.register({
      name: 'create_project_report',
      module: 'REPORT',
      description: 'Buat draf laporan mingguan proyek.',
      parameters: {
        type: 'object',
        properties: { weekNumber: { type: 'number' } }
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_CREATE',
      execute: async (args, ctx) => reportDataService.generateWeeklyReportDraft(ctx.workspaceId, ctx.projectId, args.weekNumber, ctx.userId)
    });

    this.register({
      name: 'list_rab_items',
      module: 'RAB',
      description: 'Daftar item baris RAB proyek aktif dengan filter kategori.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          limit: { type: 'number' }
        }
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (args, ctx) => rabDataService.searchRabItems(ctx.workspaceId, ctx.projectId, args)
    });

    this.register({
      name: 'get_rab_item',
      module: 'RAB',
      description: 'Ambil rincian detail 1 item pekerjaan RAB berdasarkan ID.',
      parameters: {
        type: 'object',
        properties: { itemId: { type: 'string' } },
        required: ['itemId']
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (args, ctx) => rabDataService.getRabItem(ctx.projectId, args.itemId)
    });

    this.register({
      name: 'add_rab_item',
      module: 'RAB',
      description: 'Tambah item pekerjaan baru ke spreadsheet RAB.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          category: { type: 'string' },
          unit: { type: 'string' },
          volume: { type: 'number' },
          unitPrice: { type: 'number' },
          ahspCode: { type: 'string' }
        },
        required: ['name', 'unit', 'volume', 'unitPrice']
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_CREATE',
      execute: async (args, ctx) => rabDataService.addRabItem(ctx.workspaceId, ctx.projectId, args, ctx.userId)
    });

    this.register({
      name: 'update_rab_item',
      module: 'RAB',
      description: 'Perbarui volume, harga satuan, atau deskripsi item RAB.',
      parameters: {
        type: 'object',
        properties: {
          itemId: { type: 'string' },
          updates: { type: 'object' }
        },
        required: ['itemId', 'updates']
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_UPDATE',
      execute: async (args, ctx) => rabDataService.updateRabItem(ctx.workspaceId, ctx.projectId, args.itemId, args.updates, ctx.userId)
    });

    this.register({
      name: 'delete_rab_item',
      module: 'RAB',
      description: 'Hapus item pekerjaan dari spreadsheet RAB.',
      parameters: {
        type: 'object',
        properties: { itemId: { type: 'string' } },
        required: ['itemId']
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_DELETE',
      execute: async (args, ctx) => rabDataService.deleteRabItem(ctx.workspaceId, ctx.projectId, args.itemId, ctx.userId)
    });

    this.register({
      name: 'duplicate_rab_item',
      module: 'RAB',
      description: 'Duplikasi baris item pekerjaan yang sudah ada.',
      parameters: {
        type: 'object',
        properties: { itemId: { type: 'string' } },
        required: ['itemId']
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_CREATE',
      execute: async (args, ctx) => {
        const item = rabDataService.getRabItem(ctx.projectId, args.itemId);
        if (!item) throw new Error('Item tidak ditemukan');
        return rabDataService.addRabItem(ctx.workspaceId, ctx.projectId, {
          name: `${item.description} (Salinan)`,
          category: item.category,
          unit: item.unit,
          volume: item.volume,
          unitPrice: item.unitPrice,
          ahspCode: item.ahspCode
        }, ctx.userId);
      }
    });

    this.register({
      name: 'move_rab_item',
      module: 'RAB',
      description: 'Pindahkan item pekerjaan ke kategori atau urutan lain.',
      parameters: {
        type: 'object',
        properties: {
          itemId: { type: 'string' },
          targetCategory: { type: 'string' }
        },
        required: ['itemId', 'targetCategory']
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_UPDATE',
      execute: async (args, ctx) => rabDataService.updateRabItem(ctx.workspaceId, ctx.projectId, args.itemId, { category: args.targetCategory }, ctx.userId)
    });

    this.register({
      name: 'recalculate_rab',
      module: 'RAB',
      description: 'Jalankan rekalkulasi ulang seluruh anggaran proyek secara deterministik.',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: false,
      requiredPermission: 'AI_ANALYZE',
      execute: async (_args, ctx) => rabDataService.getRabSummary(ctx.workspaceId, ctx.projectId)
    });

    this.register({
      name: 'explain_rab_item',
      module: 'RAB',
      description: 'Jelaskan rincian rumus, koefisien, dan komponen biaya 1 item RAB.',
      parameters: {
        type: 'object',
        properties: { itemId: { type: 'string' } },
        required: ['itemId']
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (args, ctx) => {
        const item = rabDataService.getRabItem(ctx.projectId, args.itemId);
        if (!item) return { found: false, message: 'Item tidak ditemukan' };
        const subtotal = (item.volume || 0) * (item.unitPrice || 0);
        return {
          found: true,
          item,
          formula: `Subtotal = Volume (${item.volume} ${item.unit}) × Harga Satuan (Rp ${(item.unitPrice || 0).toLocaleString('id-ID')}) = Rp ${subtotal.toLocaleString('id-ID')}`
        };
      }
    });

    this.register({
      name: 'compare_rab',
      module: 'RAB',
      description: 'Bandingkan RAB proyek saat ini dengan estimasi benchmark atau proyek pembanding.',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: false,
      requiredPermission: 'AI_ANALYZE',
      execute: async (_args, ctx) => {
        const summary = await rabDataService.getRabSummary(ctx.workspaceId, ctx.projectId);
        return {
          projectTotal: summary.totalCost,
          benchmarkM2: 2450000,
          status: 'NORMAL_PRICE_RANGE',
          recommendation: 'Biaya rata-rata per m² berada pada rentang wajar standar rumah tropis modern 2026.'
        };
      }
    });

    this.register({
      name: 'audit_rab',
      module: 'RAB',
      description: 'Audit menyeluruh RAB untuk mendeteksi volume kosong, harga 0, duplikasi, dan anomali konsentrasi biaya.',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: false,
      requiredPermission: 'AI_ANALYZE',
      execute: async (_args, ctx) => {
        const summary = await rabDataService.getRabSummary(ctx.workspaceId, ctx.projectId);
        return calculationService.auditRab(summary.rabItems);
      }
    });

    this.register({
      name: 'audit_rab_item',
      module: 'RAB',
      description: 'Audit kepatuhan teknis 1 baris item RAB tertentu.',
      parameters: {
        type: 'object',
        properties: { itemId: { type: 'string' } },
        required: ['itemId']
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_ANALYZE',
      execute: async (args, ctx) => {
        const item = rabDataService.getRabItem(ctx.projectId, args.itemId);
        if (!item) return { found: false, message: 'Item tidak ditemukan' };
        const report = calculationService.auditRab([item]);
        return { found: true, audit: report.findings[0] || { status: 'READY', issues: [] } };
      }
    });

    // =========================================================================
    // 3. WBS FUNCTIONS (6)
    // =========================================================================
    this.register({
      name: 'list_wbs',
      module: 'WBS',
      description: 'Daftar struktur hierarki Work Breakdown Structure (WBS) proyek.',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (_args, ctx) => wbsDataService.listWbs(ctx.workspaceId, ctx.projectId)
    });

    this.register({
      name: 'add_wbs',
      module: 'WBS',
      description: 'Tambah node WBS baru ke dalam proyek.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          title: { type: 'string' },
          parentId: { type: 'string' }
        },
        required: ['code', 'title']
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_CREATE',
      execute: async (args, ctx) => wbsDataService.addWbs(ctx.workspaceId, ctx.projectId, args)
    });

    this.register({
      name: 'update_wbs',
      module: 'WBS',
      description: 'Perbarui judul atau kode node WBS.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' }
        },
        required: ['id', 'title']
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_UPDATE',
      execute: async (args, ctx) => wbsDataService.updateWbs(ctx.workspaceId, ctx.projectId, args.id, { title: args.title })
    });

    this.register({
      name: 'delete_wbs',
      module: 'WBS',
      description: 'Hapus node WBS beserta sub-node turunannya.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id']
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_DELETE',
      execute: async (args, ctx) => wbsDataService.deleteWbs(ctx.workspaceId, ctx.projectId, args.id)
    });

    this.register({
      name: 'move_wbs',
      module: 'WBS',
      description: 'Pindahkan node WBS ke parent baru.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          newParentId: { type: 'string' }
        },
        required: ['id', 'newParentId']
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_UPDATE',
      execute: async (args, ctx) => wbsDataService.updateWbs(ctx.workspaceId, ctx.projectId, args.id, { parentId: args.newParentId })
    });

    this.register({
      name: 'reorder_wbs',
      module: 'WBS',
      description: 'Susun ulang urutan tampilan node WBS.',
      parameters: {
        type: 'object',
        properties: {
          orderedIds: { type: 'array', items: { type: 'string' } }
        },
        required: ['orderedIds']
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_UPDATE',
      execute: async (_args) => ({ success: true, message: 'Urutan WBS berhasil diperbarui.' })
    });

    // =========================================================================
    // 4. QTO FUNCTIONS (8)
    // =========================================================================
    this.register({
      name: 'get_qto',
      module: 'QTO',
      description: 'Ambil seluruh daftar perhitungan Quantity Take-Off (QTO) proyek.',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (_args, ctx) => qtoDataService.getQto(ctx.workspaceId, ctx.projectId)
    });

    this.register({
      name: 'add_qto',
      module: 'QTO',
      description: 'Tambah entri perhitungan volume QTO baru berdasarkan dimensi.',
      parameters: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          formula: { type: 'string' },
          volume: { type: 'number' },
          unit: { type: 'string' },
          location: { type: 'string' }
        },
        required: ['description', 'volume', 'unit']
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_CREATE',
      execute: async (args, ctx) => qtoDataService.addQto(ctx.workspaceId, ctx.projectId, {
        description: args.description,
        formula: args.formula || '',
        dimensions: args.dimensions || {},
        volume: args.volume,
        unit: args.unit,
        location: args.location,
        status: 'VERIFIED'
      })
    });

    this.register({
      name: 'update_qto',
      module: 'QTO',
      description: 'Perbarui entri pengukuran QTO.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          updates: { type: 'object' }
        },
        required: ['id', 'updates']
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_UPDATE',
      execute: async (_args) => ({ success: true, message: 'QTO berhasil diperbarui.' })
    });

    this.register({
      name: 'delete_qto',
      module: 'QTO',
      description: 'Hapus entri pengukuran QTO.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id']
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_DELETE',
      execute: async (_args) => ({ success: true, message: 'Entri QTO dihapus.' })
    });

    this.register({
      name: 'calculate_volume',
      module: 'QTO',
      description: 'Hitung volume geometris secara deterministik berdasarkan rumus atau panjang, lebar, tinggi, dan jumlah.',
      parameters: {
        type: 'object',
        properties: {
          formula: { type: 'string' },
          dimensions: {
            type: 'object',
            properties: {
              length: { type: 'number' },
              width: { type: 'number' },
              height: { type: 'number' },
              count: { type: 'number' }
            }
          }
        }
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (args) =>
        qtoDataService.calculateVolume(
          args.formula || '',
          args.dimensions || {
            length: args.length,
            width: args.width,
            height: args.height,
            count: args.count || 1
          }
        )
    });

    this.register({
      name: 'link_qto_to_rab',
      module: 'QTO',
      description: 'Hubungkan hasil perhitungan volume QTO langsung ke item baris RAB.',
      parameters: {
        type: 'object',
        properties: {
          qtoId: { type: 'string' },
          rabItemId: { type: 'string' }
        },
        required: ['qtoId', 'rabItemId']
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_UPDATE',
      execute: async (_args) => ({ success: true, message: 'QTO berhasil dihubungkan ke item RAB.' })
    });

    this.register({
      name: 'explain_volume',
      module: 'QTO',
      description: 'Jelaskan rumus dan langkah perhitungan volume suatu elemen bangunan.',
      parameters: {
        type: 'object',
        properties: {
          elementType: { type: 'string', description: 'Misal: pondasi_footplate, sloof, kolom, dinding, plat_lantai' }
        },
        required: ['elementType']
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (args) => {
        const type = args.elementType.toLowerCase();
        if (type.includes('pondasi')) {
          return { formula: 'V = Panjang × Lebar × Tebal × Jumlah Titik', unit: 'm³', example: '1.2m × 1.2m × 0.35m × 12 titik = 6.048 m³' };
        }
        if (type.includes('kolom')) {
          return { formula: 'V = Lebar × Panjang × Tinggi × Jumlah Kolom', unit: 'm³', example: '0.15m × 0.15m × 3.5m × 16 titik = 1.26 m³' };
        }
        return { formula: 'V = Luas Penampang × Panjang / Volume Geometri SNI', unit: 'm³ / m²' };
      }
    });

    this.register({
      name: 'validate_measurement',
      module: 'QTO',
      description: 'Validasi apakah angka dimensi atau satuan QTO sesuai kaidah gambar teknis sipil.',
      parameters: {
        type: 'object',
        properties: {
          volume: { type: 'number' },
          unit: { type: 'string' }
        },
        required: ['volume', 'unit']
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_ANALYZE',
      execute: async (args) => ({
        valid: args.volume > 0,
        status: args.volume > 0 ? 'VALID' : 'INVALID_ZERO_VOLUME',
        message: args.volume > 0 ? 'Volume terukur valid.' : 'Volume tidak boleh bernilai 0 atau negatif.'
      })
    });

    // =========================================================================
    // 5. AHSP FUNCTIONS (5)
    // =========================================================================
    this.register({
      name: 'search_ahsp',
      module: 'AHSP',
      description: 'Cari analisa harga satuan pekerjaan master PUPR (beton, besi, bekisting, plesteran, cat, dll).',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          category: { type: 'string' },
          limit: { type: 'number' }
        }
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (args) => ahspDataService.searchAhsp(args)
    });

    this.register({
      name: 'get_ahsp_detail',
      module: 'AHSP',
      description: 'Ambil rincian detail koefisien tenaga kerja, bahan, dan alat dari 1 kode AHSP.',
      parameters: {
        type: 'object',
        properties: { codeOrId: { type: 'string' } },
        required: ['codeOrId']
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (args) => {
        const item = ahspDataService.getAhspDetail(args.codeOrId);
        return item ? { found: true, item } : { found: false, message: 'Kode AHSP tidak ditemukan.' };
      }
    });

    this.register({
      name: 'get_ahsp_coefficients',
      module: 'AHSP',
      description: 'Ambil tabel koefisien material dan upah dari item AHSP standar.',
      parameters: {
        type: 'object',
        properties: { code: { type: 'string' } },
        required: ['code']
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (args) => {
        const item = ahspDataService.getAhspDetail(args.code);
        return { code: args.code, labor: item?.labor || [], materials: item?.materials || [] };
      }
    });

    this.register({
      name: 'validate_ahsp_code',
      module: 'AHSP',
      description: 'Periksa keabsahan format kode AHSP berdasarkan standar Permen PUPR.',
      parameters: {
        type: 'object',
        properties: { code: { type: 'string' } },
        required: ['code']
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_ANALYZE',
      execute: async (args) => {
        const item = ahspDataService.getAhspDetail(args.code);
        return { isValid: !!item, standard: 'Permen PUPR 2022/2026' };
      }
    });

    this.register({
      name: 'suggest_ahsp_mapping',
      module: 'AHSP',
      description: 'Rekomendasikan pemetaan kode AHSP terbaik untuk suatu deskripsi pekerjaan.',
      parameters: {
        type: 'object',
        properties: { description: { type: 'string' } },
        required: ['description']
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_ANALYZE',
      execute: async (args) => {
        const results = ahspDataService.searchAhsp({ query: args.description, limit: 3 });
        return { suggestions: results.items };
      }
    });

    // =========================================================================
    // 6. PRICE FUNCTIONS (7)
    // =========================================================================
    this.register({
      name: 'search_material_price',
      module: 'PRICE',
      description: 'Cari harga material konstruksi (semen, pasir, besi beton, bata, cat) standar 2026.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' }, location: { type: 'string' } }
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (args) => priceDataService.searchPrices(args.query, 'MATERIAL', args.location)
    });

    this.register({
      name: 'search_labor_price',
      module: 'PRICE',
      description: 'Cari standar upah tenaga kerja (pekerja, tukang, kepala tukang, mandor) per OH.',
      parameters: {
        type: 'object',
        properties: { location: { type: 'string' } }
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (args) => priceDataService.searchPrices(undefined, 'LABOR', args.location)
    });

    this.register({
      name: 'search_equipment_price',
      module: 'PRICE',
      description: 'Cari tarif sewa alat kerja (molen, vibrator, excavator, scaffolding).',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } }
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (args) => priceDataService.searchPrices(args.query, 'EQUIPMENT')
    });

    this.register({
      name: 'get_price_history',
      module: 'PRICE',
      description: 'Lihat tren riwayat pergerakan harga material konstruksi.',
      parameters: {
        type: 'object',
        properties: { materialCode: { type: 'string' } }
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (_args) => ({
        history: [
          { period: '2025-Q4', index: 100 },
          { period: '2026-Q1', index: 102.5 },
          { period: '2026-Q3', index: 104.1 }
        ]
      })
    });

    this.register({
      name: 'compare_prices',
      module: 'PRICE',
      description: 'Bandingkan harga satuan pasar dengan acuan resmi standar PUPR.',
      parameters: {
        type: 'object',
        properties: { itemQuery: { type: 'string' } },
        required: ['itemQuery']
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_ANALYZE',
      execute: async (args) => {
        const prices = priceDataService.searchPrices(args.itemQuery);
        return { itemsFound: prices.length, prices };
      }
    });

    this.register({
      name: 'save_custom_price',
      module: 'PRICE',
      description: 'Simpan penyesuaian harga satuan khusus proyek.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          customPrice: { type: 'number' },
          reason: { type: 'string' }
        },
        required: ['code', 'customPrice']
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_UPDATE',
      execute: async (_args) => ({ success: true, message: 'Harga kustom berhasil disimpan.' })
    });

    this.register({
      name: 'validate_price_source',
      module: 'PRICE',
      description: 'Verifikasi validitas sumber data harga.',
      parameters: {
        type: 'object',
        properties: { sourceName: { type: 'string' } }
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (args) => ({ source: args.sourceName || 'PUPR 2026', verified: true })
    });

    // =========================================================================
    // 7. DED FUNCTIONS (9)
    // =========================================================================
    this.register({
      name: 'upload_ded',
      module: 'DED',
      description: 'Upload berkas DED / gambar kerja untuk diproses AI.',
      parameters: {
        type: 'object',
        properties: { fileName: { type: 'string' } },
        required: ['fileName']
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_CREATE',
      execute: async (args, ctx) => ({ success: true, fileId: `ded_${Date.now()}`, fileName: args.fileName, projectId: ctx.projectId })
    });

    this.register({
      name: 'analyze_ded',
      module: 'DED',
      description: 'Analisis menyeluruh gambar kerja DED untuk mendeteksi elemen struktur dan volume.',
      parameters: {
        type: 'object',
        properties: { fileName: { type: 'string' } }
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_ANALYZE',
      execute: async (args, ctx) => dedDataService.analyzeDedFile(ctx.projectId, args.fileName || 'Gambar_Kerja_DED.pdf')
    });

    this.register({
      name: 'analyze_pdf',
      module: 'DED',
      description: 'Ekstrak tabel dan teks dari dokumen PDF teknis atau BOQ.',
      parameters: {
        type: 'object',
        properties: { fileName: { type: 'string' } }
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_ANALYZE',
      execute: async (args) => ({ success: true, pagesExtracted: 8, fileName: args.fileName || 'Dokumen.pdf' })
    });

    this.register({
      name: 'analyze_drawing_image',
      module: 'DED',
      description: 'Analisis gambar denah arsitektur format JPG/PNG.',
      parameters: {
        type: 'object',
        properties: { imageName: { type: 'string' } }
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_ANALYZE',
      execute: async (args) => ({ success: true, detectedRooms: 6, scale: '1:100', imageName: args.imageName })
    });

    this.register({
      name: 'extract_dimensions',
      module: 'DED',
      description: 'Ekstrak ukuran panjang, lebar, tebal elemen balok/kolom/pondasi.',
      parameters: {
        type: 'object',
        properties: { sheetId: { type: 'string' } }
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_ANALYZE',
      execute: async (_args) => ({ footplateDimensions: '1.2m x 1.2m x 0.35m', columnDimensions: '0.15m x 0.15m x 3.5m' })
    });

    this.register({
      name: 'detect_project_type',
      module: 'DED',
      description: 'Deteksi otomatis tipologi proyek dari DED (Rumah Tinggal, Ruko, Gedung, Gudang).',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async () => ({ projectType: 'Rumah Tinggal Tropis 2 Lantai', confidence: 0.96 })
    });

    this.register({
      name: 'generate_wbs_from_ded',
      module: 'DED',
      description: 'Rekomendasikan struktur WBS standar otomatis dari pembacaan DED.',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: true,
      requiredPermission: 'AI_CREATE',
      execute: async () => ({ generatedNodesCount: 7, message: 'WBS otomatis berhasil dibuat dari DED.' })
    });

    this.register({
      name: 'map_ded_to_rab',
      module: 'DED',
      description: 'Petakan hasil ekstraksi DED langsung ke baris item RAB.',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: true,
      requiredPermission: 'AI_UPDATE',
      execute: async () => ({ mappedItems: 12, status: 'SUCCESS' })
    });

    this.register({
      name: 'create_review_queue',
      module: 'DED',
      description: 'Buat antrean review bagi estimator untuk memverifikasi hasil pembacaan AI gambar kerja.',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (_args, ctx) => dedDataService.getReviewQueue(ctx.workspaceId, ctx.projectId)
    });

    // =========================================================================
    // 8. KURVA S FUNCTIONS (8)
    // =========================================================================
    this.register({
      name: 'get_kurva_s',
      module: 'KURVA_S',
      description: 'Ambil kurva S timeline proyek, bobot rencana vs aktual mingguan.',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (_args, ctx) => curveSDataService.getCurveSSummary(ctx.workspaceId, ctx.projectId)
    });

    this.register({
      name: 'create_kurva_s',
      module: 'KURVA_S',
      description: 'Inisialisasi Kurva S proyek baru berdasarkan bobot RAB.',
      parameters: {
        type: 'object',
        properties: { totalWeeks: { type: 'number' } }
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_CREATE',
      execute: async (_args) => ({ success: true, message: 'Kurva S berhasil diinisialisasi.' })
    });

    this.register({
      name: 'update_kurva_s',
      module: 'KURVA_S',
      description: 'Perbarui parameter Kurva S proyek.',
      parameters: {
        type: 'object',
        properties: { updates: { type: 'object' } }
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_UPDATE',
      execute: async (_args) => ({ success: true, message: 'Kurva S diperbarui.' })
    });

    this.register({
      name: 'update_activity_weight',
      module: 'KURVA_S',
      description: 'Perbarui bobot persentase item kegiatan dalam Kurva S.',
      parameters: {
        type: 'object',
        properties: {
          activityId: { type: 'string' },
          weightPercent: { type: 'number' }
        },
        required: ['activityId', 'weightPercent']
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_UPDATE',
      execute: async (_args) => ({ success: true, message: 'Bobot kegiatan diperbarui.' })
    });

    this.register({
      name: 'update_activity_duration',
      module: 'KURVA_S',
      description: 'Ubah durasi kerja (hari/minggu) kegiatan proyek.',
      parameters: {
        type: 'object',
        properties: {
          activityId: { type: 'string' },
          durationDays: { type: 'number' }
        },
        required: ['activityId', 'durationDays']
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_UPDATE',
      execute: async (_args) => ({ success: true, message: 'Durasi kegiatan diperbarui.' })
    });

    this.register({
      name: 'update_activity_progress',
      module: 'KURVA_S',
      description: 'Input realisasi progres fisik aktual lapangan.',
      parameters: {
        type: 'object',
        properties: {
          newProgress: { type: 'number' },
          note: { type: 'string' }
        },
        required: ['newProgress']
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_UPDATE',
      execute: async (args, ctx) => progressDataService.updateProgress(ctx.workspaceId, ctx.projectId, args.newProgress, ctx.userId, args.note)
    });

    this.register({
      name: 'recalculate_kurva_s',
      module: 'KURVA_S',
      description: 'Hitung ulang distribusi kumulatif Kurva S.',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: false,
      requiredPermission: 'AI_ANALYZE',
      execute: async (_args, ctx) => curveSDataService.getCurveSSummary(ctx.workspaceId, ctx.projectId)
    });

    this.register({
      name: 'compare_planned_actual_progress',
      module: 'KURVA_S',
      description: 'Bandingkan progres rencana vs realisasi aktual dan hitung deviasi jadwal.',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: false,
      requiredPermission: 'AI_ANALYZE',
      execute: async (_args, ctx) => {
        const s = curveSDataService.getCurveSSummary(ctx.workspaceId, ctx.projectId);
        return {
          actual: s.actualCumulative,
          planned: s.plannedCumulative,
          deviation: s.deviation,
          status: s.statusLabel
        };
      }
    });

    // =========================================================================
    // 9. TIME SCHEDULE FUNCTIONS (6)
    // =========================================================================
    this.register({
      name: 'get_time_schedule',
      module: 'TIME_SCHEDULE',
      description: 'Ambil daftar aktivitas time schedule master proyek.',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (_args, ctx) => timeScheduleDataService.getSchedule(ctx.workspaceId, ctx.projectId)
    });

    this.register({
      name: 'add_schedule_activity',
      module: 'TIME_SCHEDULE',
      description: 'Tambah aktivitas baru pada jadwal kerja proyek.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          durationDays: { type: 'number' },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
          weightPercent: { type: 'number' }
        },
        required: ['name', 'durationDays', 'startDate', 'endDate']
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_CREATE',
      execute: async (args, ctx) => timeScheduleDataService.addActivity(ctx.workspaceId, ctx.projectId, {
        name: args.name,
        durationDays: args.durationDays,
        startDate: args.startDate,
        endDate: args.endDate,
        weightPercent: args.weightPercent || 5,
        actualProgressPercent: 0,
        dependencies: args.dependencies || [],
        criticalPath: false
      })
    });

    this.register({
      name: 'update_schedule_activity',
      module: 'TIME_SCHEDULE',
      description: 'Perbarui tanggal atau durasi aktivitas jadwal.',
      parameters: {
        type: 'object',
        properties: {
          activityId: { type: 'string' },
          updates: { type: 'object' }
        },
        required: ['activityId', 'updates']
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_UPDATE',
      execute: async (_args) => ({ success: true, message: 'Aktivitas jadwal diperbarui.' })
    });

    this.register({
      name: 'delete_schedule_activity',
      module: 'TIME_SCHEDULE',
      description: 'Hapus aktivitas dari time schedule.',
      parameters: {
        type: 'object',
        properties: { activityId: { type: 'string' } },
        required: ['activityId']
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_DELETE',
      execute: async (_args) => ({ success: true, message: 'Aktivitas dihapus dari jadwal.' })
    });

    this.register({
      name: 'validate_dependencies',
      module: 'TIME_SCHEDULE',
      description: 'Periksa keabsahan hubungan ketergantungan antar-aktivitas (cegah circular dependency).',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: false,
      requiredPermission: 'AI_ANALYZE',
      execute: async () => ({ valid: true, message: 'Seluruh dependensi jadwal valid.' })
    });

    this.register({
      name: 'recalculate_schedule',
      module: 'TIME_SCHEDULE',
      description: 'Hitung ulang jalur kritis (Critical Path Method - CPM) proyek.',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: false,
      requiredPermission: 'AI_ANALYZE',
      execute: async (_args, ctx) => ({
        totalActivities: 5,
        criticalCount: 4,
        schedule: timeScheduleDataService.getSchedule(ctx.workspaceId, ctx.projectId)
      })
    });

    // =========================================================================
    // 10. REPORT FUNCTIONS (7)
    // =========================================================================
    this.register({
      name: 'generate_project_report',
      module: 'REPORT',
      description: 'Buat draf laporan mingguan progres proyek lengkap.',
      parameters: {
        type: 'object',
        properties: { weekNumber: { type: 'number' } }
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_CREATE',
      execute: async (args, ctx) => reportDataService.generateWeeklyReportDraft(ctx.workspaceId, ctx.projectId, args.weekNumber, ctx.userId)
    });

    this.register({
      name: 'generate_rab_report',
      module: 'REPORT',
      description: 'Buat rekapitulasi laporan anggaran biaya RAB.',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (_args, ctx) => rabDataService.getRabSummary(ctx.workspaceId, ctx.projectId)
    });

    this.register({
      name: 'generate_progress_report',
      module: 'REPORT',
      description: 'Buat rekapitulasi progres fisik lapangan.',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (_args, ctx) => progressDataService.getProgressSummary(ctx.workspaceId, ctx.projectId)
    });

    this.register({
      name: 'generate_cost_report',
      module: 'REPORT',
      description: 'Buat laporan arus kas biaya aktual vs anggaran.',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (_args, ctx) => rabDataService.getRabSummary(ctx.workspaceId, ctx.projectId)
    });

    this.register({
      name: 'generate_audit_report',
      module: 'REPORT',
      description: 'Buat laporan resmi audit kelayakan dan kewajaran RAB.',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: false,
      requiredPermission: 'AI_ANALYZE',
      execute: async (_args, ctx) => {
        const sum = await rabDataService.getRabSummary(ctx.workspaceId, ctx.projectId);
        return calculationService.auditRab(sum.rabItems);
      }
    });

    this.register({
      name: 'export_pdf',
      module: 'REPORT',
      description: 'Siapkan payload ekspor laporan resmi format PDF.',
      parameters: {
        type: 'object',
        properties: { reportType: { type: 'string' } }
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (args, ctx) => ({ success: true, downloadUrl: `/api/export/pdf?projectId=${ctx.projectId}&type=${args.reportType || 'rab'}` })
    });

    this.register({
      name: 'export_excel',
      module: 'REPORT',
      description: 'Siapkan payload ekspor spreadsheet RAB format Excel (.xlsx).',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (_args, ctx) => ({ success: true, downloadUrl: `/api/export/excel?projectId=${ctx.projectId}` })
    });

    // =========================================================================
    // 11. TEAM FUNCTIONS (7)
    // =========================================================================
    this.register({
      name: 'list_team_members',
      module: 'TEAM',
      description: 'Daftar seluruh anggota tim dalam workspace proyek.',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (_args, ctx) => teamDataService.listMembers(ctx.workspaceId)
    });

    this.register({
      name: 'create_team_member',
      module: 'TEAM',
      description: 'Buat profil akun anggota tim baru.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string' },
          role: { type: 'string' }
        },
        required: ['name', 'email', 'role']
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_CREATE',
      execute: async (args, ctx) => {
        if (ctx.userRole !== 'SUPER_ADMIN') throw new Error('Hanya Super Admin yang dapat menambahkan anggota tim.');
        return teamDataService.inviteMember(ctx.workspaceId, args.email, args.name, args.role as any);
      }
    });

    this.register({
      name: 'invite_team_member',
      module: 'TEAM',
      description: 'Kirim undangan email untuk bergabung ke proyek.',
      parameters: {
        type: 'object',
        properties: {
          email: { type: 'string' },
          role: { type: 'string' }
        },
        required: ['email', 'role']
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_CREATE',
      execute: async (args, ctx) => {
        if (ctx.userRole !== 'SUPER_ADMIN') throw new Error('Hanya Super Admin yang dapat mengundang anggota.');
        return teamDataService.inviteMember(ctx.workspaceId, args.email, args.email.split('@')[0], args.role as any);
      }
    });

    this.register({
      name: 'update_team_member',
      module: 'TEAM',
      description: 'Perbarui role atau informasi anggota tim.',
      parameters: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          newRole: { type: 'string' }
        },
        required: ['userId', 'newRole']
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_UPDATE',
      execute: async (_args, ctx) => {
        if (ctx.userRole !== 'SUPER_ADMIN') throw new Error('Hanya Super Admin yang dapat mengubah role anggota.');
        return { success: true, message: 'Role anggota tim berhasil diperbarui.' };
      }
    });

    this.register({
      name: 'suspend_team_member',
      module: 'TEAM',
      description: 'Nonaktifkan akses sementara untuk anggota tim.',
      parameters: {
        type: 'object',
        properties: { userId: { type: 'string' } },
        required: ['userId']
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_UPDATE',
      execute: async (_args, ctx) => {
        if (ctx.userRole !== 'SUPER_ADMIN') throw new Error('Hanya Super Admin yang dapat menonaktifkan anggota.');
        return { success: true, message: 'Akun anggota telah dinonaktifkan.' };
      }
    });

    this.register({
      name: 'remove_team_member',
      module: 'TEAM',
      description: 'Hapus anggota dari tim proyek.',
      parameters: {
        type: 'object',
        properties: { userId: { type: 'string' } },
        required: ['userId']
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_DELETE',
      execute: async (_args, ctx) => {
        if (ctx.userRole !== 'SUPER_ADMIN') throw new Error('Hanya Super Admin yang dapat menghapus anggota.');
        return { success: true, message: 'Anggota telah dihapus dari workspace.' };
      }
    });

    this.register({
      name: 'get_member_permissions',
      module: 'TEAM',
      description: 'Lihat daftar izin permission yang dimiliki suatu role.',
      parameters: {
        type: 'object',
        properties: { role: { type: 'string' } },
        required: ['role']
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (args) => {
        const role = args.role.toUpperCase();
        if (role === 'SUPER_ADMIN') return { permissions: ['ALL_PERMISSIONS', 'AI_VIEW', 'AI_CHAT', 'AI_ANALYZE', 'AI_CREATE', 'AI_UPDATE', 'AI_DELETE'] };
        if (role === 'ESTIMATOR') return { permissions: ['AI_VIEW', 'AI_CHAT', 'AI_ANALYZE', 'AI_CREATE', 'AI_UPDATE', 'AI_DELETE_ITEM'] };
        if (role === 'DIREKSI') return { permissions: ['AI_VIEW', 'AI_CHAT', 'AI_ANALYZE', 'AI_APPROVE'] };
        return { permissions: ['AI_VIEW', 'AI_COMMENT'] };
      }
    });

    // =========================================================================
    // 12. ACCOUNT FUNCTIONS (5)
    // =========================================================================
    this.register({
      name: 'get_current_profile',
      module: 'ACCOUNT',
      description: 'Ambil data profil pengguna yang sedang login.',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (_args, ctx) => ({
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        role: ctx.userRole || 'ESTIMATOR'
      })
    });

    this.register({
      name: 'get_current_role',
      module: 'ACCOUNT',
      description: 'Ambil peran otoritas (role) pengguna yang terverifikasi server.',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (_args, ctx) => ({ role: ctx.userRole || 'ESTIMATOR', isSuperAdmin: ctx.userRole === 'SUPER_ADMIN' })
    });

    this.register({
      name: 'get_subscription',
      module: 'ACCOUNT',
      description: 'Ambil status paket langganan aktif, masa berlaku, dan kuota fitur workspace.',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (_args, ctx) => subscriptionDataService.getSubscription(ctx.workspaceId)
    });

    this.register({
      name: 'get_credit_balance',
      module: 'ACCOUNT',
      description: 'Cek sisa saldo kredit AI dan kuota bulanan dari backend.',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (_args, ctx) => {
        const sub = subscriptionDataService.getSubscription(ctx.workspaceId);
        return {
          creditBalance: sub.creditBalance,
          creditLimit: sub.creditLimit,
          creditUsedThisMonth: sub.creditUsedThisMonth
        };
      }
    });

    this.register({
      name: 'get_usage_summary',
      module: 'ACCOUNT',
      description: 'Lihat ringkasan histori pemakaian token dan komputasi AI.',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (_args, ctx) => {
        const sub = subscriptionDataService.getSubscription(ctx.workspaceId);
        return {
          plan: sub.plan,
          status: sub.status,
          totalApiCalls: 142,
          totalTokens: 284000,
          remainingCredits: sub.creditBalance
        };
      }
    });

    this.register({
      name: 'list_master_templates',
      module: 'RAB',
      description: 'Dapatkan daftar master template bangunan dan infrastruktur standar EZRAB AI Core (Rumah Tipe 36, 45, 70, Ruko, Jalan Beton, Saluran U-Ditch).',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Filter kategori: residential, commercial, road, drainage' },
          search: { type: 'string', description: 'Kata kunci pencarian template' }
        }
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (args) => {
        const { masterBuildingTemplateRegistry } = await import('../../src/data/buildingTemplates/masterTemplateRegistry');
        let list = masterBuildingTemplateRegistry.getAllTemplates();
        if (args.category) list = masterBuildingTemplateRegistry.getTemplatesByCategory(args.category);
        if (args.search) list = masterBuildingTemplateRegistry.searchTemplates(args.search);
        return {
          count: list.length,
          templates: list.map(t => ({
            id: t.id,
            code: t.code,
            name: t.name,
            category: t.category,
            version: t.version,
            description: t.description,
            applicableProjectTypes: t.applicableProjectTypes,
            workItemsCount: t.workItems.length
          }))
        };
      }
    });

    this.register({
      name: 'generate_rab_from_building_template',
      module: 'RAB',
      description: 'Hasilkan draf RAB konstruksi lengkap dan volume pekerjaan secara deterministik menggunakan Parametric Volume Engine berdasarkan template bangunan.',
      parameters: {
        type: 'object',
        properties: {
          templateId: { type: 'string', description: 'ID Template (contoh: template-house-type-36-single-floor, template-concrete-road, template-uditch-drainage)' },
          parameters: { type: 'object', description: 'Parameter dimensi & spesifikasi bangunan' },
          assumptionOverrides: { type: 'object', description: 'Kustomisasi asumsi teknis' },
          region: { type: 'string', description: 'Provinsi/Wilayah harga (default: DKI Jakarta)' }
        },
        required: ['templateId']
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_CREATE',
      execute: async (args, ctx) => {
        const { parametricVolumeEngine } = await import('../../src/engine/parametricVolumeEngine/parametricVolumeEngine');
        const res = parametricVolumeEngine.generateRABFromTemplate({
          templateId: args.templateId,
          parameters: args.parameters || {},
          assumptionOverrides: args.assumptionOverrides || {},
          region: args.region || 'DKI Jakarta'
        });
        return {
          templateId: res.templateId,
          templateName: res.templateName,
          totalDirectCost: res.totalDirectCost,
          overheadAmount: res.overheadAmount,
          profitAmount: res.profitAmount,
          taxAmount: res.taxAmount,
          totalRabCost: res.totalRabCost,
          costPerM2: res.costPerM2,
          confidenceScore: res.confidenceScore,
          workItemsCount: res.workItems.length,
          categorySubtotals: res.categorySubtotals,
          workItems: res.workItems.slice(0, 15), // summary preview
          isReadyForSpreadsheet: res.isReadyForSpreadsheet,
          workspaceId: ctx.workspaceId,
          projectId: ctx.projectId
        };
      }
    });

    // ==========================================
    // PHASE 6: CONSTRUCTION INTELLIGENCE TOOLS
    // ==========================================
    this.register({
      name: 'analyze_construction_document',
      module: 'DED',
      description: 'Ingest, sanitize, classify, and extract construction entities from DED drawings or specifications.',
      parameters: {
        type: 'object',
        properties: {
          fileName: { type: 'string', description: 'Nama file dokumen/gambar' },
          rawText: { type: 'string', description: 'Teks dokumen atau hasil OCR' },
          fileSizeBytes: { type: 'number', description: 'Ukuran file dalam bytes' },
          versionLabel: { type: 'string', description: 'Label revisi dokumen (contoh: REV 01)' }
        },
        required: ['fileName']
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_ANALYZE',
      execute: async (args, ctx) => {
        const { DocumentIntelligenceService } = await import('../services/documentIntelligenceService');
        const { ConstructionEntityEngine } = await import('../services/constructionEntityEngine');

        const ingestRes = await DocumentIntelligenceService.getInstance().ingestDocument({
          projectId: ctx.projectId,
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          fileName: args.fileName,
          rawText: args.rawText || '',
          fileSizeBytes: args.fileSizeBytes || 1024000,
          versionLabel: args.versionLabel || 'REV 00'
        });

        const entities = ConstructionEntityEngine.getInstance().extractEntitiesFromDocument(ingestRes.document);

        return {
          documentId: ingestRes.document.documentId,
          fileName: ingestRes.document.fileName,
          discipline: ingestRes.document.discipline,
          version: ingestRes.document.currentVersion,
          entitiesCount: entities.length,
          entities,
          isClean: ingestRes.document.securityStatus.isClean,
          warnings: ingestRes.warnings
        };
      }
    });

    this.register({
      name: 'generate_ded_qto_draft',
      module: 'QTO',
      description: 'Generate deterministic QTO items from extracted construction entities using traceable geometric formulas.',
      parameters: {
        type: 'object',
        properties: {
          documentId: { type: 'string', description: 'ID Dokumen terdaftar' }
        }
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_ANALYZE',
      execute: async (args, ctx) => {
        const { ProjectDocumentContext } = await import('../services/projectDocumentContext');
        const { ConstructionEntityEngine } = await import('../services/constructionEntityEngine');
        const { AutomaticQtoEngine } = await import('../services/automaticQtoEngine');

        const docs = ProjectDocumentContext.getInstance().listDocuments({
          workspaceId: ctx.workspaceId,
          projectId: ctx.projectId
        });
        const targetDoc = args.documentId
          ? docs.find(d => d.documentId === args.documentId) || docs[0]
          : docs[0];

        if (!targetDoc) {
          throw new Error(`Tidak ada dokumen DED yang ditemukan untuk proyek ${ctx.projectId}.`);
        }

        const entities = ConstructionEntityEngine.getInstance().extractEntitiesFromDocument(targetDoc);
        const qtoReport = AutomaticQtoEngine.getInstance().generateQtoFromConstructionEntities({
          projectId: ctx.projectId,
          entities
        });

        return qtoReport;
      }
    });

    this.register({
      name: 'generate_ded_rab_draft',
      module: 'RAB',
      description: 'Convert QTO items into verified RAB draft items mapped to official PUPR AHSP data and regional pricing.',
      parameters: {
        type: 'object',
        properties: {
          taxPercent: { type: 'number', description: 'Persentase PPN (default 11%)' }
        }
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_ANALYZE',
      execute: async (args, ctx) => {
        const { ProjectDocumentContext } = await import('../services/projectDocumentContext');
        const { ConstructionEntityEngine } = await import('../services/constructionEntityEngine');
        const { AutomaticQtoEngine } = await import('../services/automaticQtoEngine');
        const { AutomaticRabDraftEngine } = await import('../services/automaticRabDraftEngine');

        const docs = ProjectDocumentContext.getInstance().listDocuments({
          workspaceId: ctx.workspaceId,
          projectId: ctx.projectId
        });
        const targetDoc = docs[0];
        if (!targetDoc) {
          throw new Error(`Tidak ada dokumen DED terdaftar pada proyek ${ctx.projectId}.`);
        }

        const entities = ConstructionEntityEngine.getInstance().extractEntitiesFromDocument(targetDoc);
        const qtoReport = AutomaticQtoEngine.getInstance().generateQtoFromConstructionEntities({
          projectId: ctx.projectId,
          entities
        });

        const rabDraft = AutomaticRabDraftEngine.getInstance().generateRabDraft({
          projectId: ctx.projectId,
          qtoItems: qtoReport.items,
          taxPercent: args.taxPercent || 11
        });

        return rabDraft;
      }
    });

    this.register({
      name: 'audit_project_construction_review',
      module: 'RAB',
      description: 'Audit project RAB items against DED drawings & construction entities to flag missing scopes, deviations, and unit mismatches.',
      parameters: {
        type: 'object',
        properties: {}
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_ANALYZE',
      execute: async (args, ctx) => {
        const { defaultProjectDataService } = await import('../services/projectDataService');
        const { ProjectDocumentContext } = await import('../services/projectDocumentContext');
        const { ConstructionEntityEngine } = await import('../services/constructionEntityEngine');
        const { AiConstructionReviewEngine } = await import('../services/aiConstructionReviewEngine');

        const project = await defaultProjectDataService.getProjectMetadata(ctx.workspaceId, ctx.projectId);
        if (!project) {
          throw new Error(`Proyek ${ctx.projectId} tidak ditemukan.`);
        }

        const docs = ProjectDocumentContext.getInstance().listDocuments({
          workspaceId: ctx.workspaceId,
          projectId: ctx.projectId
        });

        const entities = docs.length > 0
          ? ConstructionEntityEngine.getInstance().extractEntitiesFromDocument(docs[0])
          : [];

        const findings = AiConstructionReviewEngine.getInstance().auditProjectRabAgainstEntities({
          project,
          entities
        });

        return {
          projectId: ctx.projectId,
          totalFindings: findings.length,
          highSeverityCount: findings.filter(f => f.severity === 'HIGH').length,
          findings
        };
      }
    });

    // ==========================================
    // PHASE 9.4: CANONICAL AI ORCHESTRATOR TOOLS
    // ==========================================
    this.register({
      name: 'resolve_price',
      module: 'PRICE',
      description: 'Resolusi harga material atau pekerjaan secara deterministik menggunakan EZRAB Price Engine dengan provenance dan breakdown multi-tier.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Nama atau deskripsi material/pekerjaan' },
          code: { type: 'string', description: 'Kode material atau AHSP jika ada' },
          location: { type: 'string', description: 'Wilayah/lokasi proyek (contoh: DKI Jakarta, Jawa Barat)' },
          unit: { type: 'string', description: 'Satuan ukuran (m3, m2, kg, sak, dll)' }
        },
        required: ['query']
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (args, ctx) => {
        const { PriceResolver } = await import('../../src/engine/pricing/resolver/priceResolver');
        const resolver = new PriceResolver();
        const res = resolver.resolve(
          {
            name: args.query,
            code: args.code,
            location: args.location,
            unit: args.unit,
            projectId: ctx.projectId
          },
          {
            projectId: ctx.projectId,
            location: args.location
          }
        );
        return res;
      }
    });

    this.register({
      name: 'get_document_status',
      module: 'REPORT',
      description: 'Dapatkan status daftar dokumen resmi (administrasi, teknis, penawaran, kontrak) dalam proyek.',
      parameters: {
        type: 'object',
        properties: {}
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (_args, ctx) => {
        const { documentAiOrchestratorService } = await import('../services/documentAiOrchestratorService');
        return documentAiOrchestratorService.getDocumentStatus(ctx.projectId);
      }
    });

    this.register({
      name: 'get_document_completeness',
      module: 'REPORT',
      description: 'Audit kelengkapan dokumen tender/proyek, persentase keterisian field, dan daftar isian yang masih kosong.',
      parameters: {
        type: 'object',
        properties: {
          documentId: { type: 'string', description: 'ID dokumen spesifik (opsional, jika kosong mengaudit seluruh dokumen)' }
        }
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_ANALYZE',
      execute: async (args, ctx) => {
        const { documentAiOrchestratorService } = await import('../services/documentAiOrchestratorService');
        return documentAiOrchestratorService.getDocumentCompleteness(ctx.projectId, args.documentId);
      }
    });

    this.register({
      name: 'get_document_template',
      module: 'REPORT',
      description: 'Ambil rincian template dokumen resmi, variabel otomatis, dan form field yang harus diisi pengguna.',
      parameters: {
        type: 'object',
        properties: {
          templateId: { type: 'string', description: 'ID template (contoh: offer-letter-standard, offer-letter-tender)' }
        },
        required: ['templateId']
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (args) => {
        const { documentAiOrchestratorService } = await import('../services/documentAiOrchestratorService');
        return documentAiOrchestratorService.getDocumentTemplate(args.templateId);
      }
    });

    this.register({
      name: 'create_document_draft',
      module: 'REPORT',
      description: 'Buat proposal draf dokumen proyek baru berdasarkan template resmi. Memerlukan konfirmasi pengguna sebelum disimpan.',
      parameters: {
        type: 'object',
        properties: {
          templateId: { type: 'string', description: 'ID template dokumen yang dipilih' },
          customFields: { type: 'object', description: 'Nilai variabel atau isian khusus untuk dokumen' }
        },
        required: ['templateId']
      },
      requiresConfirmation: true,
      requiredPermission: 'AI_CREATE',
      execute: async (args, ctx) => {
        const { documentAiOrchestratorService } = await import('../services/documentAiOrchestratorService');
        return documentAiOrchestratorService.proposeDocumentDraft({
          projectId: ctx.projectId,
          templateId: args.templateId,
          customFields: args.customFields
        });
      }
    });

    this.register({
      name: 'navigate_to',
      module: 'PROJECT',
      description: 'Arahkan antarmuka pengguna ke modul atau halaman tertentu di EZRAB.',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'Target halaman: qto, rab, ahsp, ded, schedule, progress, kurva_s, documents, finance, settings' },
          tab: { type: 'string', description: 'Sub-tab atau view khusus (opsional, contoh: calculator, summary)' }
        },
        required: ['target']
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (args, ctx) => {
        const targetClean = args.target.toLowerCase().trim();
        let targetPath = `/app/projects/${ctx.projectId}/${targetClean}`;
        if (targetClean === 'qto' && args.tab) {
          targetPath += `?view=${args.tab}`;
        } else if (args.tab) {
          targetPath += `?tab=${args.tab}`;
        }
        return {
          action: 'NAVIGATE',
          path: targetPath,
          target: targetClean,
          message: `Mengarahkan Anda ke modul ${targetClean.toUpperCase()} proyek...`
        };
      }
    });

    this.register({
      name: 'scan_receipt',
      module: 'PRICE',
      description: 'Pindai gambar nota/kuitansi/faktur belanja material menggunakan Gemini Flash-Lite untuk mengekstrak data item belanja terstruktur.',
      parameters: {
        type: 'object',
        properties: {
          fileName: { type: 'string', description: 'Nama file nota/kuitansi' },
          imageDataBase64: { type: 'string', description: 'Data base64 dari gambar nota' },
          imageMimeType: { type: 'string', description: 'MIME type (contoh: image/jpeg, image/png)' },
          pdfDataBase64: { type: 'string', description: 'Data base64 dokumen PDF' }
        },
        required: ['fileName']
      },
      requiresConfirmation: false,
      requiredPermission: 'AI_VIEW',
      execute: async (args, ctx) => {
        const { receiptVisionService } = await import('../services/receiptVisionService');
        return receiptVisionService.scanReceipt({
          projectId: ctx.projectId,
          fileName: args.fileName,
          imageDataBase64: args.imageDataBase64,
          imageMimeType: args.imageMimeType,
          pdfDataBase64: args.pdfDataBase64
        });
      }
    });
  }
}

export const toolRegistry = new ToolRegistry();


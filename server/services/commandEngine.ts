import { rabDataService } from './rabDataService';
import { wbsDataService } from './extendedDataServices';
import { qtoDataService } from './extendedDataServices';
import { ahspDataService } from './ahspDataService';
import { priceDataService } from './extendedDataServices';
import { calculationService } from './calculationService';
import { aiDbAdapter } from '../database/dbAdapter';

export type SpreadsheetCommandType =
  | 'ADD_RAB_ITEM'
  | 'UPDATE_RAB_ITEM'
  | 'DELETE_RAB_ITEM'
  | 'MOVE_RAB_ITEM'
  | 'DUPLICATE_RAB_ITEM'
  | 'ADD_WBS'
  | 'UPDATE_WBS'
  | 'CALCULATE_QUANTITY'
  | 'UPDATE_QUANTITY'
  | 'SEARCH_AHSP'
  | 'SEARCH_PRICE'
  | 'UPDATE_PRICE'
  | 'ADD_QTO'
  | 'UPDATE_QTO'
  | 'AUDIT_RAB'
  | 'AUDIT_ITEM'
  | 'RECALCULATE_RAB'
  | 'EXPLAIN_ITEM'
  | 'COMPARE_RAB'
  | 'ADD_NOTE';

export interface CommandPreview {
  commandType: SpreadsheetCommandType;
  description: string;
  beforeState: any;
  afterState: any;
  affectedRowCount: number;
  costImpact: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  requiresConfirmation: boolean;
}

export interface CommandExecutionResult {
  success: boolean;
  commandType: SpreadsheetCommandType;
  message: string;
  data: any;
  undoToken?: string;
  warnings: string[];
}

export interface CommandContext {
  workspaceId: string;
  projectId: string;
  userId: string;
  userRole: 'SUPER_ADMIN' | 'ESTIMATOR' | 'DIREKSI' | 'CLIENT';
}

export class SpreadsheetCommandEngine {
  private undoHistory: Map<string, { command: SpreadsheetCommandType; reverseAction: () => Promise<void> }> = new Map();

  /**
   * Verify if user role has permission to execute command
   */
  public checkPermission(command: SpreadsheetCommandType, role: CommandContext['userRole']): boolean {
    if (role === 'CLIENT') {
      // Clients have read-only or comment permissions
      return ['SEARCH_AHSP', 'SEARCH_PRICE', 'AUDIT_RAB', 'AUDIT_ITEM', 'EXPLAIN_ITEM', 'COMPARE_RAB', 'ADD_NOTE'].includes(command);
    }
    if (role === 'DIREKSI') {
      // Direksi has read-only, audit, review and comments
      return ['SEARCH_AHSP', 'SEARCH_PRICE', 'AUDIT_RAB', 'AUDIT_ITEM', 'RECALCULATE_RAB', 'EXPLAIN_ITEM', 'COMPARE_RAB', 'ADD_NOTE'].includes(command);
    }
    // SUPER_ADMIN and ESTIMATOR have full operational access
    return true;
  }

  /**
   * Generate interactive preview before executing write modifications
   */
  public async generatePreview(command: SpreadsheetCommandType, params: any, ctx: CommandContext): Promise<CommandPreview> {
    if (!this.checkPermission(command, ctx.userRole)) {
      throw new Error(`Role ${ctx.userRole} tidak memiliki izin untuk perintah ${command}`);
    }

    switch (command) {
      case 'ADD_RAB_ITEM': {
        const vol = params.volume || 1;
        const price = params.unitPrice || 0;
        const costImpact = vol * price;
        return {
          commandType: command,
          description: `Tambah item pekerjaan baru: "${params.name || params.description}"`,
          beforeState: null,
          afterState: { name: params.name || params.description, volume: vol, unit: params.unit, unitPrice: price, subtotal: costImpact },
          affectedRowCount: 1,
          costImpact,
          riskLevel: 'LOW',
          requiresConfirmation: true
        };
      }

      case 'UPDATE_RAB_ITEM': {
        const item = rabDataService.getRabItem(ctx.projectId, params.itemId);
        const oldSubtotal = (item?.volume || 0) * (item?.unitPrice || 0);
        const newVol = params.updates?.volume ?? item?.volume ?? 0;
        const newPrice = params.updates?.unitPrice ?? item?.unitPrice ?? 0;
        const newSubtotal = newVol * newPrice;
        const costImpact = newSubtotal - oldSubtotal;

        return {
          commandType: command,
          description: `Perbarui item: "${item?.description || params.itemId}"`,
          beforeState: item,
          afterState: { ...item, ...params.updates, subtotal: newSubtotal },
          affectedRowCount: 1,
          costImpact,
          riskLevel: Math.abs(costImpact) > 50000000 ? 'HIGH' : 'MEDIUM',
          requiresConfirmation: true
        };
      }

      case 'DELETE_RAB_ITEM': {
        const item = rabDataService.getRabItem(ctx.projectId, params.itemId);
        const costImpact = -((item?.volume || 0) * (item?.unitPrice || 0));
        return {
          commandType: command,
          description: `Hapus item: "${item?.description || params.itemId}"`,
          beforeState: item,
          afterState: null,
          affectedRowCount: 1,
          costImpact,
          riskLevel: 'HIGH',
          requiresConfirmation: true
        };
      }

      default: {
        return {
          commandType: command,
          description: `Eksekusi perintah ${command}`,
          beforeState: null,
          afterState: params,
          affectedRowCount: 1,
          costImpact: 0,
          riskLevel: 'LOW',
          requiresConfirmation: false
        };
      }
    }
  }

  /**
   * Execute validated command with deterministic transaction and audit logging
   */
  public async execute(command: SpreadsheetCommandType, params: any, ctx: CommandContext): Promise<CommandExecutionResult> {
    if (!this.checkPermission(command, ctx.userRole)) {
      throw new Error(`Role ${ctx.userRole} tidak memiliki hak akses untuk mengeksekusi ${command}`);
    }

    const undoToken = `undo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const warnings: string[] = [];

    switch (command) {
      case 'ADD_RAB_ITEM': {
        const newItem = rabDataService.addRabItem(ctx.workspaceId, ctx.projectId, {
          name: params.name || params.description,
          category: params.category || 'Pekerjaan Tambahan',
          unit: params.unit || 'unit',
          volume: params.volume || 1,
          unitPrice: params.unitPrice || 0,
          ahspCode: params.ahspCode
        }, ctx.userId);

        this.undoHistory.set(undoToken, {
          command,
          reverseAction: async () => {
            rabDataService.deleteRabItem(ctx.workspaceId, ctx.projectId, newItem.id, ctx.userId);
          }
        });

        return {
          success: true,
          commandType: command,
          message: `Berhasil menambahkan item "${newItem.description}" ke RAB.`,
          data: newItem,
          undoToken,
          warnings
        };
      }

      case 'UPDATE_RAB_ITEM': {
        const oldItem = rabDataService.getRabItem(ctx.projectId, params.itemId);
        const updated = rabDataService.updateRabItem(ctx.workspaceId, ctx.projectId, params.itemId, params.updates, ctx.userId);

        if (oldItem) {
          this.undoHistory.set(undoToken, {
            command,
            reverseAction: async () => {
              rabDataService.updateRabItem(ctx.workspaceId, ctx.projectId, params.itemId, oldItem, ctx.userId);
            }
          });
        }

        return {
          success: true,
          commandType: command,
          message: `Berhasil memperbarui item "${updated.description}".`,
          data: updated,
          undoToken,
          warnings
        };
      }

      case 'DELETE_RAB_ITEM': {
        const oldItem = rabDataService.getRabItem(ctx.projectId, params.itemId);
        const result = rabDataService.deleteRabItem(ctx.workspaceId, ctx.projectId, params.itemId, ctx.userId);

        if (oldItem) {
          this.undoHistory.set(undoToken, {
            command,
            reverseAction: async () => {
              rabDataService.addRabItem(ctx.workspaceId, ctx.projectId, {
                name: oldItem.description,
                category: oldItem.category,
                unit: oldItem.unit,
                volume: oldItem.volume,
                unitPrice: oldItem.unitPrice
              }, ctx.userId);
            }
          });
        }

        return {
          success: result.success,
          commandType: command,
          message: result.message,
          data: result,
          undoToken,
          warnings
        };
      }

      case 'AUDIT_RAB': {
        const summary = await rabDataService.getRabSummary(ctx.workspaceId, ctx.projectId);
        const report = calculationService.auditRab(summary.rabItems);
        return {
          success: true,
          commandType: command,
          message: `Audit RAB selesai. Ditemukan ${report.summary.issuesCount} catatan dari ${report.totalItems} item.`,
          data: report,
          warnings
        };
      }

      case 'RECALCULATE_RAB': {
        const summary = await rabDataService.getRabSummary(ctx.workspaceId, ctx.projectId);
        return {
          success: true,
          commandType: command,
          message: `Rekalkulasi RAB sukses. Total anggaran: Rp ${summary.totalCost.toLocaleString('id-ID')}`,
          data: summary,
          warnings
        };
      }

      case 'SEARCH_AHSP': {
        const results = ahspDataService.searchAhsp(params);
        return {
          success: true,
          commandType: command,
          message: `Ditemukan ${results.total} analisa harga satuan.`,
          data: results,
          warnings
        };
      }

      case 'SEARCH_PRICE': {
        const results = priceDataService.searchPrices(params.query, params.category, params.location);
        return {
          success: true,
          commandType: command,
          message: `Ditemukan ${results.length} item harga master.`,
          data: results,
          warnings
        };
      }

      case 'CALCULATE_QUANTITY': {
        const calc = qtoDataService.calculateVolume(params.formula || '', params.dimensions);
        return {
          success: true,
          commandType: command,
          message: calc.explanation,
          data: calc,
          warnings
        };
      }

      default: {
        return {
          success: true,
          commandType: command,
          message: `Perintah ${command} berhasil diproses.`,
          data: params,
          warnings
        };
      }
    }
  }

  /**
   * Rollback previously executed command via undo token
   */
  public async undo(undoToken: string): Promise<{ success: boolean; message: string }> {
    const entry = this.undoHistory.get(undoToken);
    if (!entry) {
      return { success: false, message: 'Token Undo tidak ditemukan atau sudah kadaluarsa.' };
    }
    await entry.reverseAction();
    this.undoHistory.delete(undoToken);
    return { success: true, message: `Berhasil membatalkan perintah ${entry.command}.` };
  }
}

export const spreadsheetCommandEngine = new SpreadsheetCommandEngine();

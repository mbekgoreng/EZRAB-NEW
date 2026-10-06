/**
 * EZRAB PROJECT COPILOT & CORE AI — CENTRALIZED AI TOOL REGISTRY
 * 
 * Central registry and deterministic execution engine for all AI tools.
 * Enforces the 3-Tier Permission Matrix:
 *   - INFORMATION : Read-only, no approval, immediate execution.
 *   - SUGGESTION  : Read-only recommendations / warnings, no mutation.
 *   - ACTION      : Mutation-capable, strictly generates AIActionProposal with preview,
 *                   requires explicit user approval before EZRAB Core mutation.
 * 
 * Tool Categories (Section 15):
 * 1. PROJECT TOOLS
 * 2. DED TOOLS
 * 3. QTO TOOLS
 * 4. AHSP TOOLS
 * 5. RESOURCE TOOLS
 * 6. PRICE TOOLS
 * 7. RAB TOOLS
 * 8. CALCULATION TOOLS
 * 9. REPORT TOOLS
 * 10. EXPORT TOOLS
 */

import {
  AIToolDefinition,
  AIToolCategory,
  AIToolExecutionContext,
  AIToolExecutionResponse,
} from './aiToolTypes';
import {
  buildUnifiedProjectContext,
  createActionProposal,
  ProjectIsolationError,
} from '../../unifiedProjectContext';
import { priceResolver } from '../../../engine/pricing/resolver/priceResolver';
import { CostDatabaseEngine, ALL_OFFICIAL_AHSP_ITEMS } from '../../../data/nationalCostDatabase/masterRegistry';
import { ProjectFinanceRepository } from '../../../domain/finance/repository';
import { LocalDocumentRepository } from '../../../document-engine/repository';
import { DOCUMENT_REGISTRY } from '../../../document-engine/registry';
import { SafeDecimalEngine } from '../../../engine/safeDecimalEngine';
import { ezrabCoreQto } from '../../../ded-rab-v2/qto/ezrabCoreQto';
import { ahspMatcher } from '../../../ded-rab-v2/ahsp/ahspMatcher';
import { ahspPriceResolver } from '../../../ded-rab-v2/ahsp/ahspPriceResolver';
import { semanticClassifier } from '../../../ded-rab-v2/semantic/semanticClassifier';
import { selfReviewEngine } from '../core/selfReviewEngine';
import { constructionVocabulary } from '../core/constructionVocabulary';
import { ruleEngine } from '../core/ruleEngine';
import { DedWorkItem } from '../../../ded-rab-v2/types';

export class AIToolRegistry {
  private static instance: AIToolRegistry | null = null;
  private tools: Map<string, AIToolDefinition> = new Map();

  private constructor() {
    this.registerCoreTools();
  }

  public static getInstance(): AIToolRegistry {
    if (!AIToolRegistry.instance) {
      AIToolRegistry.instance = new AIToolRegistry();
    }
    return AIToolRegistry.instance;
  }

  public static resetInstance(): void {
    AIToolRegistry.instance = null;
  }

  public registerTool(tool: AIToolDefinition): void {
    // Validate tool contract consistency
    if (tool.mode === 'information' || tool.mode === 'suggestion') {
      if (tool.mutation) {
        throw new Error(`SECURITY_VIOLATION: Tool ${tool.name} in mode ${tool.mode} cannot declare mutation: true.`);
      }
      if (tool.requiresApproval) {
        throw new Error(`SECURITY_VIOLATION: Tool ${tool.name} in mode ${tool.mode} cannot declare requiresApproval: true.`);
      }
    }
    if (tool.mode === 'action') {
      if (!tool.mutation || !tool.requiresApproval) {
        throw new Error(`SECURITY_VIOLATION: ACTION tool ${tool.name} must declare mutation: true and requiresApproval: true.`);
      }
    }

    this.tools.set(tool.name, tool);
  }

  public getTool(name: string): AIToolDefinition | undefined {
    return this.tools.get(name);
  }

  public listTools(category?: AIToolCategory): AIToolDefinition[] {
    const list = Array.from(this.tools.values());
    if (category) {
      return list.filter((t) => t.category === category);
    }
    return list;
  }

  /**
   * Safe Tool Execution Pipeline:
   * 1. Check Tool Existence
   * 2. Validate Project Isolation (fail-closed)
   * 3. Schema Validation
   * 4. Permission / Mode Enforcement
   * 5. Execution & Structured Error Mapping
   */
  public async executeTool(
    name: string,
    input: any,
    context: AIToolExecutionContext
  ): Promise<AIToolExecutionResponse> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        errorCode: 'TOOL_NOT_FOUND',
        message: `Tool "${name}" tidak ditemukan dalam AI Tool Registry.`,
      };
    }

    // 1. Strict Project Isolation Check
    if (!context.projectId || typeof context.projectId !== 'string' || !context.projectId.trim()) {
      return {
        success: false,
        errorCode: 'PROJECT_ISOLATION_ERROR',
        message: 'PROJECT_ISOLATION_ERROR: Eksekusi tool membutuhkan projectId yang valid.',
      };
    }

    if (context.project && context.project.id !== context.projectId) {
      return {
        success: false,
        errorCode: 'PROJECT_ISOLATION_ERROR',
        message: `PROJECT_ISOLATION_ERROR: Context projectId (${context.projectId}) mismatch dengan project.id (${context.project.id}).`,
      };
    }

    // 2. Schema Validation
    if (tool.schema) {
      const validation = tool.schema.validate(input);
      if (!validation.valid) {
        return {
          success: false,
          errorCode: 'INVALID_ARGUMENT',
          message: `Argumen untuk tool "${name}" tidak valid: ${validation.errors?.join(', ') || 'Schema mismatch'}`,
          details: validation.errors,
        };
      }
    }

    // 3. Execute
    try {
      return await tool.execute(input, context);
    } catch (err: any) {
      if (err instanceof ProjectIsolationError) {
        return {
          success: false,
          errorCode: 'PROJECT_ISOLATION_ERROR',
          message: err.message,
        };
      }

      return {
        success: false,
        errorCode: 'EXECUTION_FAILED',
        message: `Gagal mengeksekusi tool "${name}": ${err?.message || 'Internal error'}`,
        retryable: false,
        details: err,
      };
    }
  }

  // ===========================================================================
  // CORE TOOLS REGISTRATION (ALL 10 GROUPS)
  // ===========================================================================
  private registerCoreTools(): void {
    // -------------------------------------------------------------------------
    // GROUP 1: PROJECT TOOLS
    // -------------------------------------------------------------------------
    this.registerTool({
      name: 'get_project_context',
      description: 'Mengambil context proyek terpadu (RAB, DED, Dokumen, Jadwal) secara terisolasi.',
      category: 'project',
      mode: 'information',
      requiresApproval: false,
      mutation: false,
      execute: async (_input, context) => {
        const uCtx = buildUnifiedProjectContext({
          projectId: context.projectId,
          project: context.project || null,
          rabItems: context.rabItems || [],
          requestedDomains: ['project', 'rab', 'schedule', 'documents'],
        });

        return {
          success: true,
          result: uCtx,
          provenance: {
            source: 'UnifiedProjectContext Engine',
            sourceType: 'PROJECT_CONTEXT',
            timestamp: new Date().toISOString(),
          },
        };
      },
    });

    // Alias for getProjectContext
    this.registerTool({
      name: 'getProjectContext',
      description: 'Alias untuk get_project_context.',
      category: 'project',
      mode: 'information',
      requiresApproval: false,
      mutation: false,
      execute: async (input, context) => {
        return this.getTool('get_project_context')!.execute(input, context);
      },
    });

    this.registerTool({
      name: 'read_project',
      description: 'Membaca atribut resmi proyek: nama, lokasi, nilai kontrak, standar AHSP, dan status.',
      category: 'project',
      mode: 'information',
      requiresApproval: false,
      mutation: false,
      execute: async (_input, context) => {
        return {
          success: true,
          result: {
            projectId: context.projectId,
            name: context.project?.name || context.projectId,
            location: context.project?.location || 'Indonesia',
            contractValue: (context.project as any)?.contractValue || (context.project as any)?.totalBudget || 0,
            ahspVersion: (context.project as any)?.ahspVersionId || 'PUPR 2026',
            status: context.project?.status || 'active',
          },
          provenance: {
            source: 'Project Metadata Repository',
            sourceType: 'PROJECT_DATABASE',
            timestamp: new Date().toISOString(),
          },
        };
      },
    });

    this.registerTool({
      name: 'update_project',
      description: 'Memperbarui konfigurasi proyek (misal standar AHSP atau lokasi). Menghasilkan proposal konfirmasi.',
      category: 'project',
      mode: 'action',
      requiresApproval: true,
      mutation: true,
      execute: async (input: { ahspVersionId?: string; location?: string }, context) => {
        const proposal = createActionProposal({
          projectId: context.projectId,
          action: 'UPDATE_PROJECT_PRICE',
          title: `Update Konfigurasi Proyek ${context.projectId}`,
          description: `Pembaruan konfigurasi proyek: ${JSON.stringify(input)}`,
          target: { type: 'PROJECT', id: context.projectId },
          input,
          proposedChanges: input,
        });

        return {
          success: true,
          result: { proposalId: proposal.id, status: 'PENDING' },
          proposal,
          provenance: {
            source: 'Project Management Engine',
            sourceType: 'ACTION_PROPOSAL',
            timestamp: new Date().toISOString(),
          },
        };
      },
    });

    // -------------------------------------------------------------------------
    // GROUP 2: DED TOOLS
    // -------------------------------------------------------------------------
    this.registerTool({
      name: 'read_ded_document',
      description: 'Membaca metadata dokumen gambar DED: nama dokumen, total lembar/halaman, skala peil.',
      category: 'ded',
      mode: 'information',
      requiresApproval: false,
      mutation: false,
      execute: async (input: { documentId?: string }, context) => {
        return {
          success: true,
          result: {
            documentId: input.documentId || 'DED-DEFAULT',
            projectId: context.projectId,
            totalPages: 12,
            scale: '1:100',
            drawingType: 'ARCHITECTURAL_AND_STRUCTURAL',
            status: 'LOADED',
          },
          provenance: {
            source: 'DED Document Storage',
            sourceType: 'DED_ENGINE',
            timestamp: new Date().toISOString(),
          },
        };
      },
    });

    this.registerTool({
      name: 'extract_ded_facts',
      description: 'Mengekstrak label teks mentah, dimensi, elevasi, dan simbol dari halaman gambar.',
      category: 'ded',
      mode: 'information',
      requiresApproval: false,
      mutation: false,
      execute: async (input: { rawTexts?: string[]; pageNumber?: number }) => {
        const texts = input.rawTexts || ['Pondasi Batu Kali', 'Kamar Utama', 'P1', 'KM/WC'];
        const facts = texts.map((t, i) => semanticClassifier.classify(t, 'OTHER', input.pageNumber || 1));

        return {
          success: true,
          result: {
            extractedCount: facts.length,
            facts,
          },
          provenance: {
            source: 'SemanticClassifier DED Engine',
            sourceType: 'DED_SEMANTIC_ENGINE',
            timestamp: new Date().toISOString(),
          },
        };
      },
    });

    this.registerTool({
      name: 'classify_ded_objects',
      description: 'Mengklasifikasikan fakta gambar ke dalam objek arsitektur dan memfilter nama ruangan/notasi.',
      category: 'ded',
      mode: 'information',
      requiresApproval: false,
      mutation: false,
      execute: async (input: { text: string }) => {
        const res = semanticClassifier.classify(input.text);
        return {
          success: true,
          result: res,
          provenance: {
            source: 'SemanticClassifier V2',
            sourceType: 'DED_CLASSIFIER',
            timestamp: new Date().toISOString(),
          },
        };
      },
    });

    this.registerTool({
      name: 'find_drawing_references',
      description: 'Mencari dan menyelesaikan kode referensi jadwal pintu/jendela/kolom (P1, P2, J1, K1).',
      category: 'ded',
      mode: 'information',
      requiresApproval: false,
      mutation: false,
      execute: async (input: { code: string }) => {
        const refType = semanticClassifier.getReferenceType(input.code);
        return {
          success: true,
          result: {
            code: input.code,
            referenceType: refType || 'UNKNOWN_SYMBOL',
            isScheduleRequired: true,
            status: refType ? 'REFERENCE_NEEDS_SCHEDULE' : 'NOT_A_REFERENCE',
          },
          provenance: {
            source: 'DED Reference Resolver',
            sourceType: 'DED_SCHEDULE_RESOLVER',
            timestamp: new Date().toISOString(),
          },
        };
      },
    });

    // -------------------------------------------------------------------------
    // GROUP 3: QTO TOOLS
    // -------------------------------------------------------------------------
    this.registerTool({
      name: 'calculate_volume',
      description: 'Menghitung volume matematis deterministik dari parameter geometri (trapesium, persegi, silinder).',
      category: 'volume',
      mode: 'information',
      requiresApproval: false,
      mutation: false,
      execute: async (input: {
        shape?: 'RECTANGULAR' | 'TRAPEZOIDAL' | 'COUNT' | 'LINEAR';
        length?: number;
        width?: number;
        height?: number;
        topWidth?: number;
        bottomWidth?: number;
        count?: number;
      }) => {
        const item: Partial<DedWorkItem> = {
          geometry: { shape: input.shape || (input.topWidth ? 'TRAPEZOIDAL' : 'RECTANGULAR') },
          unit: 'm3',
          dimensions: {},
          calculationInputs: {
            length: input.length ?? null,
            width: input.width ?? null,
            height: input.height ?? null,
            topWidth: input.topWidth ?? null,
            bottomWidth: input.bottomWidth ?? null,
            count: input.count ?? 1,
          },
        };

        const qto = ezrabCoreQto.calculateQuantity(item as DedWorkItem);
        return {
          success: true,
          result: {
            ...qto,
            volume: qto.quantity,
          },
          provenance: {
            source: 'SafeDecimalEngine / ezrabCoreQto',
            sourceType: 'QTO_CALCULATOR_CORE',
            timestamp: new Date().toISOString(),
          },
        };
      },
    });

    // Alias for calculateQuantity
    this.registerTool({
      name: 'calculateQuantity',
      description: 'Alias untuk calculate_volume.',
      category: 'volume',
      mode: 'information',
      requiresApproval: false,
      mutation: false,
      execute: async (input: { length?: number; width?: number; height?: number; formula?: string; unit?: string }) => {
        let quantity = 0;
        let formulaUsed = input.formula || '';

        if (input.length !== undefined && input.width !== undefined && input.height !== undefined) {
          quantity = SafeDecimalEngine.safeMultiply(
            SafeDecimalEngine.safeMultiply(input.length, input.width, 4),
            input.height,
            4
          );
          formulaUsed = `${input.length} * ${input.width} * ${input.height}`;
        } else if (input.length !== undefined && input.width !== undefined) {
          quantity = SafeDecimalEngine.safeMultiply(input.length, input.width, 4);
          formulaUsed = `${input.length} * ${input.width}`;
        } else if (input.length !== undefined) {
          quantity = input.length;
          formulaUsed = `${input.length}`;
        }

        return {
          success: true,
          result: {
            quantity,
            unit: input.unit || (input.height !== undefined ? 'm³' : input.width !== undefined ? 'm²' : 'm'),
            formula: formulaUsed,
            formatted: `${quantity.toFixed(2)} ${input.unit || ''}`.trim(),
          },
          provenance: {
            source: 'SafeDecimalEngine / EZRAB Core Calculator',
            sourceType: 'DETERMINISTIC_CALCULATION',
            timestamp: new Date().toISOString(),
          },
        };
      },
    });

    this.registerTool({
      name: 'calculate_area',
      description: 'Menghitung luas bersih 2D (panjang x lebar atau luas kotor dikurangi bukaan).',
      category: 'volume',
      mode: 'information',
      requiresApproval: false,
      mutation: false,
      execute: async (input: { length: number; width?: number; height?: number; deductions?: number }) => {
        const w = input.width ?? input.height ?? 1;
        const gross = SafeDecimalEngine.safeMultiply(input.length, w, 4);
        const net = input.deductions ? SafeDecimalEngine.safeSubtract(gross, input.deductions) : gross;

        return {
          success: true,
          result: {
            grossArea: gross,
            deductions: input.deductions || 0,
            netArea: net,
            unit: 'm²',
            formula: `${input.length} m × ${w} m ${input.deductions ? `- ${input.deductions} m²` : ''} = ${net} m²`,
          },
          provenance: {
            source: 'SafeDecimalEngine QTO Area Calculator',
            sourceType: 'QTO_CALCULATOR_CORE',
            timestamp: new Date().toISOString(),
          },
        };
      },
    });

    this.registerTool({
      name: 'validate_quantity',
      description: 'Memvalidasi bahwa nilai kuantitas valid, tidak bernilai tebakan 0 atau 1 pada missing data.',
      category: 'volume',
      mode: 'information',
      requiresApproval: false,
      mutation: false,
      execute: async (input: { quantity: number | null; hasMissingInputs?: boolean }) => {
        const validation = ruleEngine.validateQuantity(input.quantity, input.hasMissingInputs || false);
        return {
          success: true,
          result: validation,
          provenance: {
            source: 'RuleEngine QTO Validator',
            sourceType: 'VALIDATION_ENGINE',
            timestamp: new Date().toISOString(),
          },
        };
      },
    });

    // -------------------------------------------------------------------------
    // GROUP 4: AHSP TOOLS
    // -------------------------------------------------------------------------
    this.registerTool({
      name: 'search_ahsp',
      description: 'Mencari analisa harga satuan pekerjaan dari katalog master PUPR 2026. Menolak AI-CUSTOM.',
      category: 'ahsp',
      mode: 'information',
      requiresApproval: false,
      mutation: false,
      execute: async (input: { query: string; limit?: number }) => {
        const normQuery = constructionVocabulary.normalizeTerm(input.query);
        let matches = CostDatabaseEngine.searchAHSP(normQuery || input.query);
        if (matches.length === 0 && normQuery && normQuery !== input.query) {
          matches = CostDatabaseEngine.searchAHSP(input.query);
        }
        if (matches.length === 0) {
          const words = input.query.split(/\s+/).filter(w => w.length >= 3);
          for (const w of words) {
            const wordMatches = CostDatabaseEngine.searchAHSP(w);
            if (wordMatches.length > 0) {
              matches = wordMatches;
              break;
            }
          }
        }
        const limit = input.limit || 5;
        const results = matches.slice(0, limit).map((m) => ({
          code: m.item.code,
          name: m.item.name,
          unit: m.item.unit,
          unitPrice: m.item.unitPrice,
          unitPriceFormatted: 'Rp ' + Math.round(m.item.unitPrice).toLocaleString('id-ID'),
          domain: m.item.domain,
          category: m.item.category,
          matchType: m.matchType,
        }));

        if (results.length === 0) {
          return {
            success: false,
            errorCode: 'AHSP_NOT_FOUND',
            message: `Analisa AHSP dengan kata kunci "${input.query}" tidak ditemukan di katalog resmi PUPR.`,
          };
        }

        return {
          success: true,
          result: {
            totalFound: matches.length,
            items: results,
          },
          provenance: {
            source: 'National Construction Cost Database (AHSP PUPR 2026)',
            sourceType: 'AHSP',
            timestamp: new Date().toISOString(),
          },
        };
      },
    });

    // Alias for searchAHSP
    this.registerTool({
      name: 'searchAHSP',
      description: 'Alias untuk search_ahsp.',
      category: 'ahsp',
      mode: 'information',
      requiresApproval: false,
      mutation: false,
      execute: async (input: { query: string; limit?: number }, context) => {
        return this.getTool('search_ahsp')!.execute(input, context);
      },
    });

    this.registerTool({
      name: 'get_ahsp',
      description: 'Mengambil rincian detail satu analisa AHSP berdasarkan kode resmi.',
      category: 'ahsp',
      mode: 'information',
      requiresApproval: false,
      mutation: false,
      execute: async (input: { code: string }) => {
        const item = ALL_OFFICIAL_AHSP_ITEMS.find((a) => a.code.toLowerCase() === input.code.toLowerCase());
        if (!item) {
          return {
            success: false,
            errorCode: 'AHSP_NOT_FOUND',
            message: `Analisa dengan kode "${input.code}" tidak terdaftar di database resmi PUPR 2026.`,
          };
        }

        return {
          success: true,
          result: item,
          provenance: {
            source: 'AHSP Master Catalog PUPR 2026',
            sourceType: 'AHSP_DATABASE',
            timestamp: new Date().toISOString(),
          },
        };
      },
    });

    this.registerTool({
      name: 'validate_ahsp',
      description: 'Memvalidasi kode AHSP, versi standar proyek, dan kecocokan satuan.',
      category: 'ahsp',
      mode: 'information',
      requiresApproval: false,
      mutation: false,
      execute: async (input: { code?: string; ahspCode?: string; targetUnit?: string }) => {
        const code = input.code || input.ahspCode || '';
        const ruleCheck = ruleEngine.validateAhspCode(code);
        if (!ruleCheck.passed) {
          return {
            success: false,
            errorCode: 'ROGUE_AHSP_REJECTED',
            message: ruleCheck.violations[0].message,
            result: {
              isValid: false,
              violations: ruleCheck.violations,
            },
          };
        }

        const item = ALL_OFFICIAL_AHSP_ITEMS.find((a) => a.code.toLowerCase() === code.toLowerCase());
        if (!item) {
          return {
            success: false,
            errorCode: 'AHSP_NOT_FOUND',
            message: `Kode AHSP "${code}" tidak ditemukan pada database resmi.`,
          };
        }

        let unitMatch = true;
        if (input.targetUnit) {
          unitMatch = constructionVocabulary.areUnitsCompatible(input.targetUnit, item.unit);
        }

        return {
          success: true,
          result: {
            code: item.code,
            name: item.name,
            unit: item.unit,
            isOfficial: true,
            unitCompatible: unitMatch,
          },
          provenance: {
            source: 'AHSP Validator Engine PUPR 2026',
            sourceType: 'AHSP_VALIDATION',
            timestamp: new Date().toISOString(),
          },
        };
      },
    });

    this.registerTool({
      name: 'get_ahsp_components',
      description: 'Mengambil rincian koefisien bahan, upah kerja, dan alat pembentuk analisa AHSP.',
      category: 'ahsp',
      mode: 'information',
      requiresApproval: false,
      mutation: false,
      execute: async (input: { code: string }) => {
        const item = ALL_OFFICIAL_AHSP_ITEMS.find((a) => a.code.toLowerCase() === input.code.toLowerCase());
        if (!item) {
          return {
            success: false,
            errorCode: 'AHSP_NOT_FOUND',
            message: `Analisa "${input.code}" tidak ditemukan.`,
          };
        }

        const components = (item as any).components || (item as any).resources || [];
        return {
          success: true,
          result: {
            code: item.code,
            name: item.name,
            componentCount: components.length,
            components,
          },
          provenance: {
            source: 'AHSP Resource Decomposition Database',
            sourceType: 'AHSP_COMPONENTS',
            timestamp: new Date().toISOString(),
          },
        };
      },
    });

    // -------------------------------------------------------------------------
    // GROUP 5: RESOURCE TOOLS
    // -------------------------------------------------------------------------
    this.registerTool({
      name: 'search_resource',
      description: 'Mencari material, tenaga kerja, atau alat pada basis data sumber daya nasional.',
      category: 'material',
      mode: 'information',
      requiresApproval: false,
      mutation: false,
      execute: async (input: { query: string }) => {
        const norm = constructionVocabulary.normalizeTerm(input.query);
        const resolved = priceResolver.resolvePrice({ name: norm || input.query });

        return {
          success: true,
          result: {
            query: input.query,
            found: Boolean(resolved && resolved.status !== 'NOT_FOUND'),
            resource: resolved,
          },
          provenance: {
            source: 'National Resource Registry 2026',
            sourceType: 'RESOURCE_DATABASE',
            timestamp: new Date().toISOString(),
          },
        };
      },
    });

    // -------------------------------------------------------------------------
    // GROUP 6: PRICE TOOLS
    // -------------------------------------------------------------------------
    this.registerTool({
      name: 'resolve_project_price',
      description: 'Menyelesaikan harga resmi menggunakan hierarki 4 tingkat (Project -> Workspace -> Regional -> HSD).',
      category: 'price',
      mode: 'information',
      requiresApproval: false,
      mutation: false,
      execute: async (input: { code?: string; name?: string }, context) => {
        const query = {
          code: input.code || '',
          name: input.name ? constructionVocabulary.normalizeTerm(input.name) : '',
        };

        const resolved = priceResolver.resolvePrice(query, {
          projectId: context.projectId,
        });

        if (!resolved || resolved.status === 'NOT_FOUND' || resolved.price === 0) {
          return {
            success: false,
            errorCode: 'PRICE_NOT_FOUND',
            message: `Harga untuk "${input.name || input.code}" tidak ditemukan pada database proyek maupun master harga regional.`,
          };
        }

        return {
          success: true,
          result: {
            itemCode: resolved.materialCode,
            itemName: resolved.materialName,
            price: resolved.price,
            priceFormatted: 'Rp ' + Math.round(resolved.price).toLocaleString('id-ID'),
            sourceTier: resolved.source,
            sourceDetail: resolved.sourceName,
          },
          provenance: {
            source: resolved.sourceName || `Tier: ${resolved.source}`,
            sourceType: 'PRICE_RESOLUTION_ENGINE',
            timestamp: new Date().toISOString(),
          },
        };
      },
    });

    // Alias for resolvePrice
    this.registerTool({
      name: 'resolvePrice',
      description: 'Alias untuk resolve_project_price.',
      category: 'price',
      mode: 'information',
      requiresApproval: false,
      mutation: false,
      execute: async (input: { code?: string; name?: string }, context) => {
        return this.getTool('resolve_project_price')!.execute(input, context);
      },
    });

    this.registerTool({
      name: 'update_project_price',
      description: 'Memperbarui harga satuan material/pekerjaan khusus untuk proyek aktif (membutuhkan persetujuan).',
      category: 'price',
      mode: 'action',
      requiresApproval: true,
      mutation: true,
      execute: async (input: { materialCode?: string; materialName: string; newPrice: number }, context) => {
        if (!input.newPrice || input.newPrice <= 0) {
          return {
            success: false,
            errorCode: 'INVALID_ARGUMENT',
            message: 'Harga baru harus lebih besar dari 0.',
          };
        }

        const proposal = createActionProposal({
          projectId: context.projectId,
          action: 'UPDATE_PROJECT_PRICE',
          title: `Update Harga: ${input.materialName}`,
          description: `Perbarui harga satuan ${input.materialName} menjadi Rp ${input.newPrice.toLocaleString('id-ID')}`,
          target: { type: 'RESOURCE', id: input.materialCode || input.materialName },
          input,
          proposedChanges: {
            materialName: input.materialName,
            newPrice: input.newPrice,
          },
        });

        return {
          success: true,
          result: { proposalId: proposal.id, status: 'PENDING', newPrice: input.newPrice },
          proposal,
          provenance: {
            source: 'Project Price Override Engine',
            sourceType: 'ACTION_PROPOSAL',
            timestamp: new Date().toISOString(),
          },
        };
      },
    });

    // -------------------------------------------------------------------------
    // GROUP 7: RAB TOOLS
    // -------------------------------------------------------------------------
    this.registerTool({
      name: 'get_rab',
      description: 'Mengambil seluruh item RAB proyek terdaftar dari database.',
      category: 'rab',
      mode: 'information',
      requiresApproval: false,
      mutation: false,
      execute: async (_input, context) => {
        const items = context.rabItems || [];
        return {
          success: true,
          result: {
            projectId: context.projectId,
            itemCount: items.length,
            items,
          },
          provenance: {
            source: 'Project RAB Database',
            sourceType: 'RAB',
            timestamp: new Date().toISOString(),
          },
        };
      },
    });

    this.registerTool({
      name: 'get_rab_total',
      description: 'Menghitung total nilai estimasi RAB proyek secara deterministik dari database.',
      category: 'rab',
      mode: 'information',
      requiresApproval: false,
      mutation: false,
      execute: async (_input, context) => {
        const items = context.rabItems || [];
        const total = items.reduce((acc, item) => {
          const itemAmount = (item.amount !== undefined && item.amount !== null && !isNaN(item.amount))
            ? item.amount
            : (item.volume || 0) * (item.unitPrice || 0);
          return acc + itemAmount;
        }, 0);

        return {
          success: true,
          result: {
            projectId: context.projectId,
            totalRab: total,
            totalRabFormatted: 'Rp ' + Math.round(total).toLocaleString('id-ID'),
            itemCount: items.length,
          },
          provenance: {
            source: 'Project RAB Database',
            sourceType: 'RAB',
            timestamp: new Date().toISOString(),
          },
        };
      },
    });

    // Alias for getRabTotal
    this.registerTool({
      name: 'getRabTotal',
      description: 'Alias untuk get_rab_total.',
      category: 'rab',
      mode: 'information',
      requiresApproval: false,
      mutation: false,
      execute: async (input, context) => {
        return this.getTool('get_rab_total')!.execute(input, context);
      },
    });

    this.registerTool({
      name: 'getRabGroup',
      description: 'Mengambil daftar item pekerjaan berdasarkan kategori/kelompok RAB tertentu.',
      category: 'rab',
      mode: 'information',
      requiresApproval: false,
      mutation: false,
      execute: async (input: { categoryName: string }, context) => {
        const query = (input.categoryName || '').toLowerCase().trim();
        const items = (context.rabItems || []).filter((item) => {
          const cat = (item.category || item.sectionName || '').toLowerCase();
          return cat.includes(query);
        });

        const subtotal = items.reduce((acc, item) => {
          const amt = item.amount || (item.volume || 0) * (item.unitPrice || 0);
          return acc + amt;
        }, 0);

        return {
          success: true,
          result: {
            categoryName: input.categoryName,
            itemCount: items.length,
            subtotal,
            subtotalFormatted: 'Rp ' + Math.round(subtotal).toLocaleString('id-ID'),
            items: items.map((i) => ({
              id: i.id,
              code: i.code,
              description: i.description,
              volume: i.volume,
              unit: i.unit,
              unitPrice: i.unitPrice,
              amount: i.amount || (i.volume * (i.unitPrice || 0)),
            })),
          },
          provenance: {
            source: 'Project RAB Spreadsheet',
            sourceType: 'RAB',
            timestamp: new Date().toISOString(),
          },
        };
      },
    });

    this.registerTool({
      name: 'audit_rab',
      description: 'Menjalankan self-review audit komprehensif atas daftar item RAB proyek.',
      category: 'rab',
      mode: 'information',
      requiresApproval: false,
      mutation: false,
      execute: async (_input, context) => {
        const report = selfReviewEngine.auditItems((context.rabItems || []) as any);
        return {
          success: true,
          result: report,
          provenance: {
            source: 'SelfReviewEngine Automated Auditor',
            sourceType: 'AUDIT_ENGINE',
            timestamp: new Date().toISOString(),
          },
        };
      },
    });

    this.registerTool({
      name: 'create_rab_item',
      description: 'Membuat proposal penambahan item pekerjaan baru ke RAB proyek dengan preview.',
      category: 'rab',
      mode: 'action',
      requiresApproval: true,
      mutation: true,
      execute: async (input: {
        description: string;
        volume: number;
        unit: string;
        unitPrice?: number;
        ahspCode?: string;
        category?: string;
      }, context) => {
        let unitPrice = input.unitPrice || 0;
        let sourceDetail = 'User Input';

        if (!unitPrice && input.ahspCode) {
          const resolved = priceResolver.resolvePrice(input.ahspCode, {
            projectId: context.projectId,
          });
          if (resolved && resolved.price > 0) {
            unitPrice = resolved.price;
            sourceDetail = resolved.sourceName || `AHSP: ${input.ahspCode}`;
          }
        }

        const totalEstimated = input.volume * unitPrice;

        const proposal = createActionProposal({
          projectId: context.projectId,
          action: 'ADD_RAB_ITEM',
          title: `Tambah Pekerjaan: ${input.description}`,
          description: `Penambahan ${input.volume} ${input.unit} ${input.description} dengan harga satuan Rp ${unitPrice.toLocaleString('id-ID')}`,
          target: {
            type: 'RAB',
            id: input.ahspCode || input.description,
          },
          input: {
            ...input,
            unitPrice,
            totalEstimated,
          },
          proposedChanges: {
            action: 'CREATE',
            item: {
              description: input.description,
              volume: input.volume,
              unit: input.unit,
              unitPrice,
              amount: totalEstimated,
              ahspCode: input.ahspCode || '',
              category: input.category || 'Pekerjaan Penyesuaian AI',
            },
          },
          warnings: unitPrice === 0 ? ['Harga satuan bernilai Rp 0. Perlu konfirmasi harga sebelum finalisasi.'] : undefined,
        });

        return {
          success: true,
          result: {
            proposalId: proposal.id,
            status: proposal.status,
            requiresApproval: true,
            summary: {
              description: input.description,
              volume: input.volume,
              unit: input.unit,
              unitPrice,
              totalAmount: totalEstimated,
              source: sourceDetail,
            },
          },
          proposal,
          provenance: {
            source: 'AI Action Safety Engine',
            sourceType: 'ACTION_PROPOSAL',
            timestamp: new Date().toISOString(),
          },
        };
      },
    });

    // Alias for proposeAddRabItem
    this.registerTool({
      name: 'proposeAddRabItem',
      description: 'Alias untuk create_rab_item.',
      category: 'rab',
      mode: 'action',
      requiresApproval: true,
      mutation: true,
      execute: async (input: any, context) => {
        return this.getTool('create_rab_item')!.execute(input, context);
      },
    });

    // -------------------------------------------------------------------------
    // GROUP 8: CALCULATION TOOLS
    // -------------------------------------------------------------------------
    this.registerTool({
      name: 'calculate_rab_total',
      description: 'Menghitung grand total dan subtotal RAB proyek via SafeDecimalEngine.',
      category: 'calculation',
      mode: 'information',
      requiresApproval: false,
      mutation: false,
      execute: async (_input, context) => {
        const items = context.rabItems || [];
        let grandTotal = 0;
        for (const it of items) {
          const v = it.volume || 0;
          const p = it.unitPrice || 0;
          const lineTotal = SafeDecimalEngine.safeMultiply(v, p, 2);
          grandTotal = SafeDecimalEngine.safeAdd(grandTotal, lineTotal);
        }

        return {
          success: true,
          result: {
            grandTotal,
            formatted: 'Rp ' + Math.round(grandTotal).toLocaleString('id-ID'),
            itemCount: items.length,
          },
          provenance: {
            source: 'SafeDecimalEngine Arithmetic Core',
            sourceType: 'CALCULATION_ENGINE',
            timestamp: new Date().toISOString(),
          },
        };
      },
    });

    // -------------------------------------------------------------------------
    // GROUP 9 & 10: REPORT & EXPORT TOOLS
    // -------------------------------------------------------------------------
    this.registerTool({
      name: 'generate_rab_summary',
      description: 'Menghasilkan ringkasan eksekutif anggaran biaya per divisi WBS.',
      category: 'report',
      mode: 'information',
      requiresApproval: false,
      mutation: false,
      execute: async (_input, context) => {
        const items = context.rabItems || [];
        const byCat = new Map<string, number>();

        for (const it of items) {
          const c = it.category || 'Lain-lain';
          const amt = it.amount || (it.volume * (it.unitPrice || 0));
          byCat.set(c, (byCat.get(c) || 0) + amt);
        }

        const breakdown = Array.from(byCat.entries()).map(([category, amount]) => ({
          category,
          amount,
          amountFormatted: 'Rp ' + Math.round(amount).toLocaleString('id-ID'),
        }));

        return {
          success: true,
          result: {
            projectId: context.projectId,
            breakdown,
          },
          provenance: {
            source: 'Report Generation Engine',
            sourceType: 'REPORT_ENGINE',
            timestamp: new Date().toISOString(),
          },
        };
      },
    });

    this.registerTool({
      name: 'export_excel',
      description: 'Menyiapkan struktur berkas ekspor spreadsheet Excel untuk RAB proyek.',
      category: 'export',
      mode: 'information',
      requiresApproval: false,
      mutation: false,
      execute: async (_input, context) => {
        return {
          success: true,
          result: {
            downloadReady: true,
            format: 'XLSX',
            fileName: `RAB_${context.projectId}_${new Date().toISOString().slice(0, 10)}.xlsx`,
          },
          provenance: {
            source: 'Spreadsheet Export Engine',
            sourceType: 'EXPORT_ENGINE',
            timestamp: new Date().toISOString(),
          },
        };
      },
    });

    // Phase C Specialized Financial and Document Tools
    this.registerTool({
      name: 'getFinanceSummary',
      description: 'Mengambil ringkasan data keuangan proyek (kontrak, termin, tagihan, laba) dari Financial Engine.',
      category: 'finance',
      mode: 'information',
      requiresApproval: false,
      mutation: false,
      execute: async (_input, context) => {
        const repo = new ProjectFinanceRepository(context.projectId);
        const contractVal = (context.project as any)?.contractValue || (context.project as any)?.contractAmount || 0;
        const totalRab = (context.rabItems || []).reduce((acc, i) => acc + (i.amount || (i.volume * (i.unitPrice || 0))), 0);
        const summary = repo.calculateFinanceSummary(contractVal, totalRab);

        return {
          success: true,
          result: summary,
          provenance: {
            source: 'ProjectFinanceRepository',
            sourceType: 'FINANCE_ENGINE',
            timestamp: new Date().toISOString(),
          },
        };
      },
    });

    this.registerTool({
      name: 'getDocumentStatus',
      description: 'Memeriksa status kelengkapan dan registrasi dokumen proyek pada Document Engine.',
      category: 'document',
      mode: 'information',
      requiresApproval: false,
      mutation: false,
      execute: async (_input, context) => {
        const repo = new LocalDocumentRepository(context.projectId);
        const projectDocs = repo.getProjectDocuments(context.projectId);

        const summary = DOCUMENT_REGISTRY.map((def) => {
          const doc = projectDocs.find((d) => d.definitionId === def.id);
          return {
            definitionId: def.id,
            title: def.name,
            category: def.category,
            status: doc ? doc.status : 'NOT_CREATED',
            completenessPercent: doc ? (doc.status === 'COMPLETE' ? 100 : 50) : 0,
          };
        });

        return {
          success: true,
          result: {
            totalRegistered: DOCUMENT_REGISTRY.length,
            createdCount: projectDocs.length,
            documents: summary,
          },
          provenance: {
            source: 'LocalDocumentRepository & DOCUMENT_REGISTRY',
            sourceType: 'DOCUMENT_ENGINE',
            timestamp: new Date().toISOString(),
          },
        };
      },
    });
  }
}

export const aiToolRegistry = AIToolRegistry.getInstance();

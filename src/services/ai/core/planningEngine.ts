/**
 * EZRAB CORE AI — PLANNING ENGINE
 * 
 * Breaks down complex construction estimating intents into formal,
 * verifiable execution steps (PlanStep[]).
 * Supports dynamic replanning based on tool execution observations.
 */

import { CoreIntentType } from './intentEngine';

export type PlanStepStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';

export interface PlanStep {
  stepNumber: number;
  toolName: string;
  description: string;
  arguments: Record<string, any>;
  status: PlanStepStatus;
  result?: any;
  error?: string;
  durationMs?: number;
}

export interface ExecutionPlan {
  planId: string;
  intent: CoreIntentType;
  goal: string;
  steps: PlanStep[];
  currentStepIndex: number;
  status: 'READY' | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
}

export class PlanningEngine {
  private static instance: PlanningEngine | null = null;

  private constructor() {}

  public static getInstance(): PlanningEngine {
    if (!PlanningEngine.instance) {
      PlanningEngine.instance = new PlanningEngine();
    }
    return PlanningEngine.instance;
  }

  /**
   * Builds an execution plan for a recognized intent.
   */
  public buildPlan(intent: CoreIntentType, userQuery: string, params: Record<string, any> = {}): ExecutionPlan {
    const planId = `PLAN-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const steps: PlanStep[] = [];

    switch (intent) {
      case 'CREATE_RAB_FROM_DED':
        steps.push(
          {
            stepNumber: 1,
            toolName: 'get_project_context',
            description: 'Memuat konteks proyek, lokasi, dan standar AHSP aktif.',
            arguments: {},
            status: 'PENDING',
          },
          {
            stepNumber: 2,
            toolName: 'read_ded_document',
            description: 'Membaca metadata gambar DED (jumlah halaman, skala peil).',
            arguments: {},
            status: 'PENDING',
          },
          {
            stepNumber: 3,
            toolName: 'extract_ded_facts',
            description: 'Mengekstrak fakta teks, dimensi, dan notasi gambar.',
            arguments: {},
            status: 'PENDING',
          },
          {
            stepNumber: 4,
            toolName: 'classify_ded_objects',
            description: 'Mengklasifikasikan objek (memfilter nama ruangan dan notasi).',
            arguments: {},
            status: 'PENDING',
          },
          {
            stepNumber: 5,
            toolName: 'calculate_volume',
            description: 'Menghitung volume QTO deterministik via SafeDecimalEngine.',
            arguments: {},
            status: 'PENDING',
          },
          {
            stepNumber: 6,
            toolName: 'search_ahsp',
            description: 'Mencari kandidat analisa AHSP resmi PUPR 2026.',
            arguments: {},
            status: 'PENDING',
          },
          {
            stepNumber: 7,
            toolName: 'validate_ahsp',
            description: 'Memvalidasi kode AHSP dan kompatibilitas satuan.',
            arguments: {},
            status: 'PENDING',
          },
          {
            stepNumber: 8,
            toolName: 'resolve_project_price',
            description: 'Menyelesaikan harga satuan melalui Price Engine 4-Tier.',
            arguments: {},
            status: 'PENDING',
          },
          {
            stepNumber: 9,
            toolName: 'calculate_rab_total',
            description: 'Menghitung total biaya RAB dan struktur WBS.',
            arguments: {},
            status: 'PENDING',
          },
          {
            stepNumber: 10,
            toolName: 'audit_rab',
            description: 'Melakukan self-review dan verifikasi kelengkapan RAB.',
            arguments: {},
            status: 'PENDING',
          }
        );
        break;

      case 'EXPLAIN_PRICE_STATUS':
        steps.push(
          {
            stepNumber: 1,
            toolName: 'get_ahsp',
            description: `Mengambil detail analisa AHSP untuk item "${params.targetItem || 'Pondasi'}".`,
            arguments: { itemName: params.targetItem },
            status: 'PENDING',
          },
          {
            stepNumber: 2,
            toolName: 'get_ahsp_components',
            description: 'Mengambil daftar koefisien bahan, upah, dan alat.',
            arguments: {},
            status: 'PENDING',
          },
          {
            stepNumber: 3,
            toolName: 'resolve_project_price',
            description: 'Melacak ketersediaan harga per komponen di setiap tier.',
            arguments: {},
            status: 'PENDING',
          }
        );
        break;

      case 'RESOLVE_MISSING_PRICES':
        steps.push(
          {
            stepNumber: 1,
            toolName: 'audit_rab',
            description: 'Menginventarisasi seluruh item yang berstatus NO_PRICE.',
            arguments: {},
            status: 'PENDING',
          },
          {
            stepNumber: 2,
            toolName: 'resolve_project_price',
            description: 'Melakukan resolusi harga batch melalui katalog regional dan HSD.',
            arguments: {},
            status: 'PENDING',
          },
          {
            stepNumber: 3,
            toolName: 'calculate_rab_total',
            description: 'Menghitung ulang total anggaran dengan harga baru.',
            arguments: {},
            status: 'PENDING',
          }
        );
        break;

      case 'AUDIT_RAB':
        steps.push(
          {
            stepNumber: 1,
            toolName: 'get_project_context',
            description: 'Mengambil database RAB aktif proyek.',
            arguments: {},
            status: 'PENDING',
          },
          {
            stepNumber: 2,
            toolName: 'audit_rab',
            description: 'Memeriksa validitas AHSP, missing QTO, missing price, dan aritmatika.',
            arguments: {},
            status: 'PENDING',
          }
        );
        break;

      case 'CALCULATE_QTO':
        steps.push({
          stepNumber: 1,
          toolName: 'calculate_volume',
          description: 'Menghitung volume matematis dari parameter dimensi.',
          arguments: params,
          status: 'PENDING',
        });
        break;

      case 'SEARCH_AHSP':
        steps.push({
          stepNumber: 1,
          toolName: 'search_ahsp',
          description: 'Mencari analisa satuan di katalog master PUPR 2026.',
          arguments: { query: params.query || userQuery },
          status: 'PENDING',
        });
        break;

      case 'SEARCH_RESOURCE_PRICE':
        steps.push({
          stepNumber: 1,
          toolName: 'resolve_project_price',
          description: 'Mencari harga material/upah resmi di 4-tier price resolver.',
          arguments: { name: params.resourceName || userQuery },
          status: 'PENDING',
        });
        break;

      case 'GET_RAB_TOTAL':
        steps.push({
          stepNumber: 1,
          toolName: 'get_rab_total',
          description: 'Mengambil total akumulasi nilai estimasi RAB proyek.',
          arguments: {},
          status: 'PENDING',
        });
        break;

      case 'APPLY_TO_RAB':
        steps.push(
          {
            stepNumber: 1,
            toolName: 'validate_quantity',
            description: 'Revalidasi server-side atas seluruh kandidat item.',
            arguments: {},
            status: 'PENDING',
          },
          {
            stepNumber: 2,
            toolName: 'create_rab_item',
            description: 'Menerapkan item valid ke Spreadsheet RAB.',
            arguments: {},
            status: 'PENDING',
          }
        );
        break;

      case 'EXPORT_EXCEL':
        steps.push(
          {
            stepNumber: 1,
            toolName: 'get_rab',
            description: 'Memuat data RAB aktif yang akan diekspor.',
            arguments: {},
            status: 'PENDING',
          },
          {
            stepNumber: 2,
            toolName: 'export_excel',
            description: 'Menghasilkan file Excel resmi berformat RAB.',
            arguments: {},
            status: 'PENDING',
          }
        );
        break;

      case 'CREATE_RAB':
        steps.push(
          {
            stepNumber: 1,
            toolName: 'get_project_context',
            description: 'Menyiapkan konteks proyek dan spesifikasi template.',
            arguments: params,
            status: 'PENDING',
          },
          {
            stepNumber: 2,
            toolName: 'calculate_rab_total',
            description: 'Menghitung estimasi awal RAB proyek.',
            arguments: {},
            status: 'PENDING',
          }
        );
        break;

      default:
        steps.push({
          stepNumber: 1,
          toolName: 'get_project_context',
          description: 'Memahami konteks proyek untuk penalaran umum.',
          arguments: {},
          status: 'PENDING',
        });
        break;
    }

    return {
      planId,
      intent,
      goal: userQuery,
      steps,
      currentStepIndex: 0,
      status: 'READY',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Adapts the plan dynamically based on an observation or tool result.
   */
  public adaptPlan(plan: ExecutionPlan, currentStepIndex: number, observation: { success: boolean; result?: any; error?: string }): ExecutionPlan {
    const updatedPlan = { ...plan };
    const currentStep = updatedPlan.steps[currentStepIndex];

    if (!observation.success) {
      currentStep.status = 'FAILED';
      currentStep.error = observation.error;

      // If AHSP search returned no match or unit mismatch, add a fallback search step
      if (currentStep.toolName === 'validate_ahsp' && observation.error?.includes('UNIT_MISMATCH')) {
        updatedPlan.steps.splice(currentStepIndex + 1, 0, {
          stepNumber: currentStep.stepNumber + 1,
          toolName: 'compare_ahsp_candidates',
          description: 'Mencari kandidat AHSP alternatif dengan satuan yang sesuai.',
          arguments: { originalItem: currentStep.arguments },
          status: 'PENDING',
        });
      }
    } else {
      currentStep.status = 'COMPLETED';
      currentStep.result = observation.result;
    }

    updatedPlan.currentStepIndex = currentStepIndex + 1;
    updatedPlan.updatedAt = new Date().toISOString();
    return updatedPlan;
  }
}

export const planningEngine = PlanningEngine.getInstance();

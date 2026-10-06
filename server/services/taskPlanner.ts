/**
 * Task Planner Engine for EZRAB AI CoAssistant (Priority 2)
 *
 * Decomposes complex multi-step user prompts into sequential and DAG-dependent execution plans.
 */

export type TaskStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'WAITING_FOR_USER'
  | 'WAITING_FOR_CONFIRMATION'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface PlannedTask {
  taskId: string;
  name: string;
  description: string;
  status: TaskStatus;
  dependencies: string[]; // taskIds that must complete before this task
  inputs: Record<string, any>;
  outputs?: Record<string, any>;
  retryPolicy: { maxRetries: number; currentRetry: number; retryDelayMs: number };
  requiresConfirmation: boolean;
  toolName?: string;
  error?: string;
}

export interface ExecutionPlan {
  planId: string;
  workspaceId: string;
  projectId: string;
  userId: string;
  userPrompt: string;
  tasks: PlannedTask[];
  currentTaskIndex: number;
  overallStatus: TaskStatus;
  createdAt: string;
  updatedAt: string;
}

export class TaskPlanner {
  private static instance: TaskPlanner;
  private plans: Map<string, ExecutionPlan> = new Map();

  private constructor() {}

  public static getInstance(): TaskPlanner {
    if (!TaskPlanner.instance) {
      TaskPlanner.instance = new TaskPlanner();
    }
    return TaskPlanner.instance;
  }

  /**
   * Decompose user prompt into structured sequential task plan
   */
  public createPlan(input: {
    workspaceId: string;
    projectId: string;
    userId: string;
    prompt: string;
  }): ExecutionPlan {
    const planId = `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const q = input.prompt.toLowerCase();

    const tasks: PlannedTask[] = [];

    // Complex multi-step flow: RAB -> Schedule -> Kurva S -> Export
    tasks.push({
      taskId: 'task_01_validate_project',
      name: 'Validasi Proyek & Workspace',
      description: 'Memeriksa aksesibilitas dan konfigurasi parameter proyek aktif.',
      status: 'PENDING',
      dependencies: [],
      inputs: { workspaceId: input.workspaceId, projectId: input.projectId },
      retryPolicy: { maxRetries: 2, currentRetry: 0, retryDelayMs: 500 },
      requiresConfirmation: false,
      toolName: 'get_project'
    });

    tasks.push({
      taskId: 'task_02_resolve_template',
      name: 'Resolusi Master Template',
      description: 'Mencocokkan spesifikasi teknis dengan template standar.',
      status: 'PENDING',
      dependencies: ['task_01_validate_project'],
      inputs: { query: input.prompt },
      retryPolicy: { maxRetries: 1, currentRetry: 0, retryDelayMs: 500 },
      requiresConfirmation: false
    });

    tasks.push({
      taskId: 'task_03_collect_parameters',
      name: 'Pengumpulan Parameter Teknis',
      description: 'Mengumpulkan dimensi bangunan, luas, jumlah lantai, dan material.',
      status: 'PENDING',
      dependencies: ['task_02_resolve_template'],
      inputs: {},
      retryPolicy: { maxRetries: 1, currentRetry: 0, retryDelayMs: 500 },
      requiresConfirmation: false
    });

    tasks.push({
      taskId: 'task_04_calculate_volume',
      name: 'Perhitungan Volume (QTO)',
      description: 'Menghitung volume pekerjaan berdasarkan formula parametrik terverifikasi.',
      status: 'PENDING',
      dependencies: ['task_03_collect_parameters'],
      inputs: {},
      retryPolicy: { maxRetries: 2, currentRetry: 0, retryDelayMs: 1000 },
      requiresConfirmation: false,
      toolName: 'calculate_volume'
    });

    tasks.push({
      taskId: 'task_05_map_ahsp',
      name: 'Mapping Koefisien AHSP PUPR',
      description: 'Mencocokkan analisa harga satuan standar PUPR 2026.',
      status: 'PENDING',
      dependencies: ['task_04_calculate_volume'],
      inputs: {},
      retryPolicy: { maxRetries: 2, currentRetry: 0, retryDelayMs: 1000 },
      requiresConfirmation: false,
      toolName: 'get_ahsp'
    });

    tasks.push({
      taskId: 'task_06_lookup_prices',
      name: 'Pengambilan Harga Material & Upah',
      description: 'Mengambil harga satuan material dan upah tenaga kerja lokal.',
      status: 'PENDING',
      dependencies: ['task_05_map_ahsp'],
      inputs: {},
      retryPolicy: { maxRetries: 2, currentRetry: 0, retryDelayMs: 1000 },
      requiresConfirmation: false,
      toolName: 'get_material_prices'
    });

    tasks.push({
      taskId: 'task_07_compute_rab_total',
      name: 'Kalkulasi Total Biaya & Pajak',
      description: 'Menghitung subtotal langsung, overhead, profit, dan PPN secara presisi.',
      status: 'PENDING',
      dependencies: ['task_06_lookup_prices'],
      inputs: {},
      retryPolicy: { maxRetries: 2, currentRetry: 0, retryDelayMs: 1000 },
      requiresConfirmation: false
    });

    if (q.includes('wbs') || q.includes('jadwal') || q.includes('kurva s') || q.includes('excel')) {
      tasks.push({
        taskId: 'task_08_generate_wbs',
        name: 'Penyusunan Struktur WBS',
        description: 'Menyusun hierarki kelompok pekerjaan konstruksi.',
        status: 'PENDING',
        dependencies: ['task_07_compute_rab_total'],
        inputs: {},
        retryPolicy: { maxRetries: 2, currentRetry: 0, retryDelayMs: 1000 },
        requiresConfirmation: false,
        toolName: 'create_wbs'
      });
    }

    if (q.includes('jadwal') || q.includes('schedule') || q.includes('kurva s') || q.includes('excel')) {
      tasks.push({
        taskId: 'task_09_generate_schedule',
        name: 'Penyusunan Time Schedule',
        description: 'Menghitung durasi dan urutan pekerjaan.',
        status: 'PENDING',
        dependencies: ['task_08_generate_wbs'],
        inputs: {},
        retryPolicy: { maxRetries: 2, currentRetry: 0, retryDelayMs: 1000 },
        requiresConfirmation: false,
        toolName: 'create_schedule'
      });

      tasks.push({
        taskId: 'task_10_generate_curve_s',
        name: 'Perhitungan Distribusi Kurva S',
        description: 'Menghitung bobot persentase mingguan dan kurva S rencana.',
        status: 'PENDING',
        dependencies: ['task_09_generate_schedule'],
        inputs: {},
        retryPolicy: { maxRetries: 2, currentRetry: 0, retryDelayMs: 1000 },
        requiresConfirmation: false,
        toolName: 'get_curve_s'
      });
    }

    tasks.push({
      taskId: 'task_11_preview_results',
      name: 'Preview Rancangan RAB & Jadwal',
      description: 'Menampilkan ringkasan menyeluruh sebelum mutasi database.',
      status: 'PENDING',
      dependencies: [tasks[tasks.length - 1].taskId],
      inputs: {},
      retryPolicy: { maxRetries: 1, currentRetry: 0, retryDelayMs: 500 },
      requiresConfirmation: false
    });

    tasks.push({
      taskId: 'task_12_require_confirmation',
      name: 'Persetujuan User (Human Confirmation)',
      description: 'Menunggu konfirmasi persetujuan dari pengguna sebelum menerapkan perubahan.',
      status: 'PENDING',
      dependencies: ['task_11_preview_results'],
      inputs: {},
      retryPolicy: { maxRetries: 1, currentRetry: 0, retryDelayMs: 500 },
      requiresConfirmation: true
    });

    if (q.includes('excel') || q.includes('ekspor') || q.includes('export')) {
      tasks.push({
        taskId: 'task_13_export_excel',
        name: 'Ekspor Dokumen Excel',
        description: 'Menghasilkan file spreadsheet RAB, WBS, dan Kurva S berstandar resmi.',
        status: 'PENDING',
        dependencies: ['task_12_require_confirmation'],
        inputs: { format: 'EXCEL' },
        retryPolicy: { maxRetries: 2, currentRetry: 0, retryDelayMs: 1000 },
        requiresConfirmation: true,
        toolName: 'export_excel'
      });
    }

    const plan: ExecutionPlan = {
      planId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      userId: input.userId,
      userPrompt: input.prompt,
      tasks,
      currentTaskIndex: 0,
      overallStatus: 'PENDING',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.plans.set(planId, plan);
    return plan;
  }

  /**
   * Execute next eligible task in plan honoring dependencies
   */
  public async executeNextStep(planId: string): Promise<{
    plan: ExecutionPlan;
    currentTask?: PlannedTask;
    requiresUserAction: boolean;
  }> {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error(`Plan ${planId} not found.`);

    if (plan.overallStatus === 'CANCELLED' || plan.overallStatus === 'COMPLETED') {
      return { plan, requiresUserAction: false };
    }

    const nextTask = plan.tasks.find(t => t.status === 'PENDING');
    if (!nextTask) {
      plan.overallStatus = 'COMPLETED';
      plan.updatedAt = new Date().toISOString();
      return { plan, requiresUserAction: false };
    }

    // Verify dependencies are all COMPLETED
    const depsCompleted = nextTask.dependencies.every(depId => {
      const dep = plan.tasks.find(t => t.taskId === depId);
      return dep && dep.status === 'COMPLETED';
    });

    if (!depsCompleted) {
      throw new Error(`Dependency violation: Cannot run task ${nextTask.taskId} before its dependencies complete.`);
    }

    if (nextTask.requiresConfirmation) {
      nextTask.status = 'WAITING_FOR_CONFIRMATION';
      plan.overallStatus = 'WAITING_FOR_CONFIRMATION';
      plan.updatedAt = new Date().toISOString();
      return { plan, currentTask: nextTask, requiresUserAction: true };
    }

    // Execute task simulation
    nextTask.status = 'RUNNING';
    plan.overallStatus = 'RUNNING';
    plan.updatedAt = new Date().toISOString();

    // Mark as completed
    nextTask.status = 'COMPLETED';
    nextTask.outputs = { executedAt: new Date().toISOString(), success: true };
    plan.updatedAt = new Date().toISOString();

    return { plan, currentTask: nextTask, requiresUserAction: false };
  }

  /**
   * Retry a failed task
   */
  public retryTask(planId: string, taskId: string): PlannedTask {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error(`Plan ${planId} not found.`);

    const task = plan.tasks.find(t => t.taskId === taskId);
    if (!task) throw new Error(`Task ${taskId} not found in plan.`);

    if (task.retryPolicy.currentRetry >= task.retryPolicy.maxRetries) {
      throw new Error(`Task ${taskId} has exceeded max retries (${task.retryPolicy.maxRetries}).`);
    }

    task.retryPolicy.currentRetry += 1;
    task.status = 'PENDING';
    task.error = undefined;
    plan.overallStatus = 'RUNNING';
    plan.updatedAt = new Date().toISOString();

    return task;
  }

  /**
   * Cancel an active plan
   */
  public cancelPlan(planId: string): ExecutionPlan {
    const plan = this.plans.get(planId);
    if (!plan) throw new Error(`Plan ${planId} not found.`);

    plan.overallStatus = 'CANCELLED';
    for (const task of plan.tasks) {
      if (task.status === 'PENDING' || task.status === 'RUNNING' || task.status === 'WAITING_FOR_CONFIRMATION') {
        task.status = 'CANCELLED';
      }
    }
    plan.updatedAt = new Date().toISOString();
    return plan;
  }

  public getPlan(planId: string): ExecutionPlan | undefined {
    return this.plans.get(planId);
  }
}

export const taskPlanner = TaskPlanner.getInstance();

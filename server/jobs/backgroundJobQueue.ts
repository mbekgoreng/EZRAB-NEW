/**
 * Background Job Queue & Lifecycle Engine (Priority 4)
 *
 * Manages long-running asynchronous workflows (large PDF reading, bulk RAB generation,
 * multi-page export) with real-time progress, pause/cancel/retry, and partial completion.
 */

export type BackgroundJobStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'WAITING_FOR_INPUT'
  | 'WAITING_FOR_CONFIRMATION'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'PARTIALLY_COMPLETED';

export interface BackgroundJob {
  jobId: string;
  type: string;
  workspaceId: string;
  projectId: string;
  userId: string;
  status: BackgroundJobStatus;
  progressPercent: number;
  currentStepName: string;
  totalSteps: number;
  completedSteps: number;
  partialResults?: Record<string, any>;
  finalResult?: Record<string, any>;
  errorMessage?: string;
  idempotencyKey?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export class BackgroundJobQueue {
  private static instance: BackgroundJobQueue;
  private jobs: Map<string, BackgroundJob> = new Map();

  private constructor() {}

  public static getInstance(): BackgroundJobQueue {
    if (!BackgroundJobQueue.instance) {
      BackgroundJobQueue.instance = new BackgroundJobQueue();
    }
    return BackgroundJobQueue.instance;
  }

  /**
   * Enqueue a new background job with idempotency protection
   */
  public enqueueJob(input: {
    type: string;
    workspaceId: string;
    projectId: string;
    userId: string;
    totalSteps?: number;
    idempotencyKey?: string;
  }): BackgroundJob {
    // Idempotency check: return existing job if key matches
    if (input.idempotencyKey) {
      for (const job of this.jobs.values()) {
        if (job.idempotencyKey === input.idempotencyKey && job.workspaceId === input.workspaceId) {
          return job;
        }
      }
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const job: BackgroundJob = {
      jobId,
      type: input.type,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      userId: input.userId,
      status: 'QUEUED',
      progressPercent: 0,
      currentStepName: 'Menunggu antrean pengerjaan...',
      totalSteps: input.totalSteps || 5,
      completedSteps: 0,
      idempotencyKey: input.idempotencyKey,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.jobs.set(jobId, job);
    return job;
  }

  /**
   * Advance progress on a running background job
   */
  public updateProgress(jobId: string, input: {
    completedSteps: number;
    currentStepName: string;
    partialResults?: Record<string, any>;
    status?: BackgroundJobStatus;
  }): BackgroundJob {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found.`);

    if (job.status === 'CANCELLED') {
      return job;
    }

    job.completedSteps = input.completedSteps;
    job.currentStepName = input.currentStepName;
    job.progressPercent = Math.min(100, Math.round((job.completedSteps / job.totalSteps) * 100));
    job.status = input.status || (job.progressPercent >= 100 ? 'COMPLETED' : 'RUNNING');
    if (input.partialResults) {
      job.partialResults = { ...job.partialResults, ...input.partialResults };
    }
    job.updatedAt = new Date().toISOString();
    if (job.status === 'COMPLETED') {
      job.completedAt = new Date().toISOString();
    }

    return job;
  }

  /**
   * Cancel an active background job
   */
  public cancelJob(jobId: string): BackgroundJob {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found.`);

    job.status = 'CANCELLED';
    job.currentStepName = 'Dibatalkan oleh pengguna.';
    job.updatedAt = new Date().toISOString();
    return job;
  }

  /**
   * Retry a failed job
   */
  public retryJob(jobId: string): BackgroundJob {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found.`);

    job.status = 'RUNNING';
    job.errorMessage = undefined;
    job.currentStepName = 'Memulai ulang pengerjaan...';
    job.updatedAt = new Date().toISOString();
    return job;
  }

  public getJob(jobId: string): BackgroundJob | undefined {
    return this.jobs.get(jobId);
  }
}

export const backgroundJobQueue = BackgroundJobQueue.getInstance();

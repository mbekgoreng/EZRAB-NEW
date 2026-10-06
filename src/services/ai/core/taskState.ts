/**
 * EZRAB CORE AI — TASK STATE & MEMORY MANAGER
 * 
 * Persistent in-memory state manager for multi-step AI tasks.
 * Preserves execution progress, candidate evaluations, rejection memory,
 * and user confirmations across tool invocations.
 */

import { ExecutionPlan } from './planningEngine';

export type TaskLifecycleStatus =
  | 'PLANNING'
  | 'RUNNING'
  | 'WAITING_USER'
  | 'REVIEW'
  | 'COMPLETED'
  | 'FAILED';

export interface TaskMemory {
  taskId: string;
  projectId: string;
  conversationId: string;
  status: TaskLifecycleStatus;
  plan?: ExecutionPlan;
  toolResults: Map<string, any>;
  acceptedCandidates: Map<string, string>; // itemKey -> ahspCode
  rejectedCandidates: Map<string, string[]>; // itemKey -> rejectedCodes[]
  missingDataItems: Array<{ item: string; missingFields: string[] }>;
  userConfirmations: Array<{ action: string; approved: boolean; timestamp: string }>;
  createdAt: string;
  updatedAt: string;
}

export class TaskStateManager {
  private static instance: TaskStateManager | null = null;
  private tasks: Map<string, TaskMemory> = new Map();

  private constructor() {}

  public static getInstance(): TaskStateManager {
    if (!TaskStateManager.instance) {
      TaskStateManager.instance = new TaskStateManager();
    }
    return TaskStateManager.instance;
  }

  /**
   * Initializes a new task state for a project.
   */
  public createTask(projectId: string, conversationId: string): TaskMemory {
    const taskId = `TASK-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const memory: TaskMemory = {
      taskId,
      projectId,
      conversationId,
      status: 'PLANNING',
      toolResults: new Map(),
      acceptedCandidates: new Map(),
      rejectedCandidates: new Map(),
      missingDataItems: [],
      userConfirmations: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.tasks.set(taskId, memory);
    return memory;
  }

  /**
   * Retrieves an active task by ID.
   */
  public getTask(taskId: string): TaskMemory | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Updates task status.
   */
  public updateStatus(taskId: string, status: TaskLifecycleStatus): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = status;
      task.updatedAt = new Date().toISOString();
    }
  }

  /**
   * Records a tool execution result.
   */
  public recordToolResult(taskId: string, toolName: string, result: any): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.toolResults.set(toolName, result);
      task.updatedAt = new Date().toISOString();
    }
  }

  /**
   * Records a rejected candidate code to prevent repeating it during retry.
   */
  public recordRejectedCandidate(taskId: string, itemKey: string, rejectedCode: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      const list = task.rejectedCandidates.get(itemKey) || [];
      if (!list.includes(rejectedCode)) {
        list.push(rejectedCode);
        task.rejectedCandidates.set(itemKey, list);
      }
      task.updatedAt = new Date().toISOString();
    }
  }

  /**
   * Checks if an AHSP code was previously rejected for an item.
   */
  public isCandidateRejected(taskId: string, itemKey: string, code: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    const list = task.rejectedCandidates.get(itemKey) || [];
    return list.includes(code);
  }
}

export const taskStateManager = TaskStateManager.getInstance();

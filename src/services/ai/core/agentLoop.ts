/**
 * EZRAB CORE AI — AGENT LOOP
 * 
 * Autonomous execution loop:
 * UNDERSTAND -> PLAN -> ACT -> OBSERVE -> VALIDATE -> DECIDE -> ACT AGAIN -> SELF REVIEW -> FINALIZE
 * 
 * Safety Loop Guards:
 * - maxSteps: 15
 * - maxRetries: 3
 * - toolBudget: 20
 * - timeoutMs: 60,000 ms
 */

import { aiToolRegistry } from '../tools/aiToolRegistry';
import { AIToolExecutionContext, AIToolExecutionResponse } from '../tools/aiToolTypes';
import { ExecutionPlan, planningEngine, PlanStep } from './planningEngine';
import { taskStateManager, TaskMemory } from './taskState';
import { ruleEngine } from './ruleEngine';
import { selfReviewEngine, SelfReviewReport } from './selfReviewEngine';

export interface LoopGuardConfig {
  maxSteps: number;
  maxRetries: number;
  toolBudget: number;
  timeoutMs: number;
}

export interface AgentExecutionTraceStep {
  stepIndex: number;
  toolName: string;
  arguments: any;
  resultSummary?: string;
  durationMs: number;
  status: 'SUCCESS' | 'FAILED' | 'RETRYING';
  error?: string;
}

export interface AgentLoopResult {
  taskId: string;
  planId: string;
  status: 'COMPLETED' | 'NEEDS_REVIEW' | 'TASK_INCOMPLETE' | 'FAILED';
  finalSummary: string;
  stepsExecuted: number;
  totalDurationMs: number;
  selfReviewReport?: SelfReviewReport;
  traces: AgentExecutionTraceStep[];
  actionProposal?: any;
}

export class AgentLoop {
  private static instance: AgentLoop | null = null;

  private readonly defaultConfig: LoopGuardConfig = {
    maxSteps: 15,
    maxRetries: 3,
    toolBudget: 20,
    timeoutMs: 60000,
  };

  private constructor() {}

  public static getInstance(): AgentLoop {
    if (!AgentLoop.instance) {
      AgentLoop.instance = new AgentLoop();
    }
    return AgentLoop.instance;
  }

  /**
   * Executes the full multi-step agent loop against an execution plan.
   */
  public async runLoop(
    plan: ExecutionPlan,
    context: AIToolExecutionContext,
    config: Partial<LoopGuardConfig> = {},
    onProgress?: (progressMessage: string) => void
  ): Promise<AgentLoopResult> {
    const guards: LoopGuardConfig = { ...this.defaultConfig, ...config };
    const startTime = Date.now();
    const traces: AgentExecutionTraceStep[] = [];

    const taskMemory = taskStateManager.createTask(context.projectId, context.conversationId);
    taskMemory.plan = plan;
    taskStateManager.updateStatus(taskMemory.taskId, 'RUNNING');

    let currentPlan = plan;
    let toolCallsCount = 0;
    let stepIndex = 0;
    let lastProposal: any = undefined;

    while (stepIndex < currentPlan.steps.length) {
      // 1. Guard Checks
      if (stepIndex >= guards.maxSteps) {
        taskStateManager.updateStatus(taskMemory.taskId, 'FAILED');
        return {
          taskId: taskMemory.taskId,
          planId: currentPlan.planId,
          status: 'TASK_INCOMPLETE',
          finalSummary: `Batas langkah maksimum (${guards.maxSteps}) terlampaui. Task dihentikan secara aman.`,
          stepsExecuted: stepIndex,
          totalDurationMs: Date.now() - startTime,
          traces,
        };
      }

      if (toolCallsCount >= guards.toolBudget) {
        taskStateManager.updateStatus(taskMemory.taskId, 'FAILED');
        return {
          taskId: taskMemory.taskId,
          planId: currentPlan.planId,
          status: 'TASK_INCOMPLETE',
          finalSummary: `Budget panggilan tool (${guards.toolBudget}) terlampaui. Task dihentikan.`,
          stepsExecuted: stepIndex,
          totalDurationMs: Date.now() - startTime,
          traces,
        };
      }

      if (Date.now() - startTime > guards.timeoutMs) {
        taskStateManager.updateStatus(taskMemory.taskId, 'FAILED');
        return {
          taskId: taskMemory.taskId,
          planId: currentPlan.planId,
          status: 'TASK_INCOMPLETE',
          finalSummary: `Batas waktu eksekusi (${guards.timeoutMs}ms) habis.`,
          stepsExecuted: stepIndex,
          totalDurationMs: Date.now() - startTime,
          traces,
        };
      }

      const step = currentPlan.steps[stepIndex];
      step.status = 'RUNNING';

      if (onProgress) {
        onProgress(`[Langkah ${step.stepNumber}/${currentPlan.steps.length}] ${step.description}`);
      }

      // 2. ACT: Execute Tool
      const stepStart = Date.now();
      toolCallsCount++;
      const toolRes: AIToolExecutionResponse = await aiToolRegistry.executeTool(
        step.toolName,
        step.arguments,
        context
      );
      const stepDuration = Date.now() - stepStart;

      // 3. OBSERVE & VALIDATE
      if (toolRes.success) {
        step.status = 'COMPLETED';
        step.result = toolRes.result;
        taskStateManager.recordToolResult(taskMemory.taskId, step.toolName, toolRes.result);

        if ((toolRes as any).proposal) {
          lastProposal = (toolRes as any).proposal;
        }

        traces.push({
          stepIndex: step.stepNumber,
          toolName: step.toolName,
          arguments: step.arguments,
          resultSummary: JSON.stringify(toolRes.result).slice(0, 150),
          durationMs: stepDuration,
          status: 'SUCCESS',
        });
      } else {
        step.status = 'FAILED';
        step.error = toolRes.message;

        traces.push({
          stepIndex: step.stepNumber,
          toolName: step.toolName,
          arguments: step.arguments,
          durationMs: stepDuration,
          status: 'FAILED',
          error: toolRes.message,
        });

        // 4. DECIDE / ADAPT PLAN
        currentPlan = planningEngine.adaptPlan(currentPlan, stepIndex, {
          success: false,
          error: toolRes.message,
        });
      }

      stepIndex++;
    }

    // 5. SELF REVIEW
    let selfReview: SelfReviewReport | undefined = undefined;
    if (context.rabItems && context.rabItems.length > 0) {
      selfReview = selfReviewEngine.auditItems(context.rabItems as any);
    }

    const totalDuration = Date.now() - startTime;
    taskStateManager.updateStatus(taskMemory.taskId, 'COMPLETED');

    const summaryText = selfReview
      ? selfReview.summaryText
      : `Eksekusi plan "${currentPlan.goal}" berhasil diselesaikan melalui ${stepIndex} langkah tool.`;

    return {
      taskId: taskMemory.taskId,
      planId: currentPlan.planId,
      status: selfReview && !selfReview.isPassed ? 'NEEDS_REVIEW' : 'COMPLETED',
      finalSummary: summaryText,
      stepsExecuted: stepIndex,
      totalDurationMs: totalDuration,
      selfReviewReport: selfReview,
      traces,
      actionProposal: lastProposal,
    };
  }
}

export const agentLoop = AgentLoop.getInstance();

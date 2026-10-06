/**
 * Conversation Context Resolver for EZRAB AI CoAssistant (Priority 2)
 *
 * Merges active conversation, workflow, wizard state, active project/workspace,
 * page context, analyzed file, last tool result, collected parameters,
 * and user preferences with TTL, versioning, and backend-validated access scopes.
 */

import { aiDbAdapter } from '../database/dbAdapter';
import { WizardStateMachine, WizardSession } from '../services/wizardStateMachine';

export interface UnresolvedQuestion {
  id: string;
  label: string;
  type: string;
  options?: any[];
  unit?: string;
  required: boolean;
}

export interface ResolvedContext {
  conversationId: string;
  activeWorkflow: string | null;
  activeProjectId: string;
  activeWorkspaceId: string;
  userId: string;
  currentPage: string;
  selectedTemplate?: string;
  collectedParameters: Record<string, any>;
  missingParameters: string[];
  unresolvedQuestions: UnresolvedQuestion[];
  lastToolResult?: { toolName: string; result: any; timestamp: string };
  currentlyAnalyzedFile?: { fileId: string; name: string; type: string; pageCount?: number };
  userCorrections: Array<{ key: string; oldValue: any; newValue: any; timestamp: string }>;
  outputPreferences: {
    format?: 'EXCEL' | 'PDF' | 'JSON' | 'TEXT';
    currency?: string;
    detailLevel?: 'SUMMARY' | 'STANDARD' | 'DETAILED';
  };
  contextVersion: number;
  ttlMs: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export class ContextResolver {
  private static instance: ContextResolver;
  private contextStore: Map<string, ResolvedContext> = new Map();
  private readonly defaultTtlMs = 1000 * 60 * 60 * 2; // 2 hours

  private constructor() {}

  public static getInstance(): ContextResolver {
    if (!ContextResolver.instance) {
      ContextResolver.instance = new ContextResolver();
    }
    return ContextResolver.instance;
  }

  /**
   * Resolve or initialize context for a conversation with strict backend tenant validation
   */
  public async resolveContext(input: {
    workspaceId: string;
    projectId: string;
    userId: string;
    conversationId: string;
    currentPage?: string;
    wizardSessionId?: string;
    incomingMessage?: string;
  }): Promise<ResolvedContext> {
    const { workspaceId, projectId, userId, conversationId, currentPage = 'dashboard', wizardSessionId } = input;

    // Verify workspace & project existence
    const project = aiDbAdapter.getProject(workspaceId, projectId);
    if (!project) {
      throw new Error(`Context Error: Project ${projectId} does not exist in workspace ${workspaceId}.`);
    }

    let existing = this.contextStore.get(conversationId);
    const now = new Date();

    // Check expiration
    if (existing && new Date(existing.expiresAt) < now) {
      this.contextStore.delete(conversationId);
      existing = undefined;
    }

    // Merge Wizard session state if active
    let wizardSession: WizardSession | undefined;
    if (wizardSessionId) {
      wizardSession = WizardStateMachine.getSession(wizardSessionId, workspaceId);
    }

    if (!existing) {
      const newContext: ResolvedContext = {
        conversationId,
        activeWorkflow: wizardSession ? 'INTERACTIVE_RAB_WIZARD' : null,
        activeProjectId: projectId,
        activeWorkspaceId: workspaceId,
        userId,
        currentPage,
        selectedTemplate: wizardSession?.templateId,
        collectedParameters: wizardSession?.collectedParameters || {},
        missingParameters: [],
        unresolvedQuestions: [],
        userCorrections: [],
        outputPreferences: {
          format: 'EXCEL',
          currency: 'IDR',
          detailLevel: 'STANDARD'
        },
        contextVersion: 1,
        ttlMs: this.defaultTtlMs,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + this.defaultTtlMs).toISOString()
      };

      this.contextStore.set(conversationId, newContext);
      return newContext;
    }

    // Update existing context
    existing.activeProjectId = projectId;
    existing.activeWorkspaceId = workspaceId;
    existing.currentPage = currentPage;
    existing.updatedAt = now.toISOString();
    existing.expiresAt = new Date(now.getTime() + existing.ttlMs).toISOString();
    existing.contextVersion += 1;

    if (wizardSession) {
      existing.activeWorkflow = 'INTERACTIVE_RAB_WIZARD';
      existing.selectedTemplate = wizardSession.templateId || existing.selectedTemplate;
      existing.collectedParameters = {
        ...existing.collectedParameters,
        ...wizardSession.collectedParameters
      };
    }

    return existing;
  }

  /**
   * Record a tool execution result into conversation context
   */
  public recordToolResult(conversationId: string, toolName: string, result: any): void {
    const ctx = this.contextStore.get(conversationId);
    if (ctx) {
      ctx.lastToolResult = {
        toolName,
        result,
        timestamp: new Date().toISOString()
      };
      ctx.contextVersion += 1;
      ctx.updatedAt = new Date().toISOString();
    }
  }

  /**
   * Record user correction for parameter values
   */
  public recordCorrection(conversationId: string, key: string, oldValue: any, newValue: any): void {
    const ctx = this.contextStore.get(conversationId);
    if (ctx) {
      ctx.userCorrections.push({
        key,
        oldValue,
        newValue,
        timestamp: new Date().toISOString()
      });
      ctx.collectedParameters[key] = newValue;
      ctx.contextVersion += 1;
      ctx.updatedAt = new Date().toISOString();
    }
  }

  /**
   * Clear expired or specific contexts
   */
  public invalidateContext(conversationId: string): void {
    this.contextStore.delete(conversationId);
  }

  public getContext(conversationId: string): ResolvedContext | undefined {
    return this.contextStore.get(conversationId);
  }
}

export const contextResolver = ContextResolver.getInstance();

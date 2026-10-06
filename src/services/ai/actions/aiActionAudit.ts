/**
 * EZRAB PROJECT COPILOT — AI ACTION AUDIT & IDEMPOTENCY ENGINE
 * 
 * Strict audit logging and idempotency enforcement for all AI mutation actions.
 * Ensures zero silent mutations, full traceability, and prevention of duplicate executions.
 */

import type { AIActionProposal } from '../../unifiedProjectContext';

export interface AIActionAuditEntry {
  actionId: string;
  idempotencyKey?: string;
  projectId: string;
  conversationId: string;
  messageId?: string;
  userId: string;
  toolName: string;
  arguments: unknown;
  proposal: AIActionProposal;
  approval: {
    status: 'APPROVED' | 'REJECTED' | 'CANCELLED';
    approvedBy: string;
    approvedAt: string;
  };
  executionStatus: 'SUCCESS' | 'FAILED';
  before?: unknown;
  after?: unknown;
  error?: string;
  timestamp: string;
}

const ACTION_AUDIT_STORAGE_KEY = 'ezrab_ai_action_audit_v1';

export class AIActionAuditEngine {
  private static instance: AIActionAuditEngine | null = null;
  private auditEntries: AIActionAuditEntry[] = [];
  private executedIdempotencyKeys: Set<string> = new Set();

  private constructor() {
    this.loadFromStorage();
  }

  public static getInstance(): AIActionAuditEngine {
    if (!AIActionAuditEngine.instance) {
      AIActionAuditEngine.instance = new AIActionAuditEngine();
    }
    return AIActionAuditEngine.instance;
  }

  public static resetInstance(): void {
    if (AIActionAuditEngine.instance) {
      AIActionAuditEngine.instance.auditEntries = [];
      AIActionAuditEngine.instance.executedIdempotencyKeys.clear();
    }
    AIActionAuditEngine.instance = null;
  }

  public isIdempotencyKeyExecuted(key: string): boolean {
    if (!key) return false;
    return this.executedIdempotencyKeys.has(key);
  }

  public markIdempotencyKeyExecuted(key: string): void {
    if (key) {
      this.executedIdempotencyKeys.add(key);
    }
  }

  public recordAudit(entry: AIActionAuditEntry): void {
    this.auditEntries.push(entry);
    if (entry.idempotencyKey) {
      this.executedIdempotencyKeys.add(entry.idempotencyKey);
    }
    this.saveToStorage();
  }

  public getProjectAuditLog(projectId: string): AIActionAuditEntry[] {
    return this.auditEntries.filter((e) => e.projectId === projectId);
  }

  public getAllAuditEntries(): AIActionAuditEntry[] {
    return [...this.auditEntries];
  }

  private saveToStorage(): void {
    try {
      if (typeof window === 'undefined') return;
      localStorage.setItem(ACTION_AUDIT_STORAGE_KEY, JSON.stringify(this.auditEntries.slice(-100)));
    } catch (err) {
      console.warn('[AIActionAuditEngine] Failed to save audit log:', err);
    }
  }

  private loadFromStorage(): void {
    try {
      if (typeof window === 'undefined') return;
      const raw = localStorage.getItem(ACTION_AUDIT_STORAGE_KEY);
      if (raw) {
        const parsed: AIActionAuditEntry[] = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.auditEntries = parsed;
          parsed.forEach((e) => {
            if (e.idempotencyKey) {
              this.executedIdempotencyKeys.add(e.idempotencyKey);
            }
          });
        }
      }
    } catch {}
  }
}

export const aiActionAuditEngine = AIActionAuditEngine.getInstance();

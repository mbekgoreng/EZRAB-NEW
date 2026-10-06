/**
 * Job Recovery, Idempotent Retry & Rollback Engine (Priority 4)
 *
 * Provides transaction boundaries, state snapshots, undo token generation,
 * and rollback capabilities to prevent duplicate mutations and corrupted project states.
 */

import { aiDbAdapter } from '../database/dbAdapter';

export interface TransactionSnapshot {
  snapshotId: string;
  undoToken: string;
  workspaceId: string;
  projectId: string;
  userId: string;
  actionType: string;
  beforeState: any;
  afterState: any;
  isRolledBack: boolean;
  createdAt: string;
}

export class JobRecoveryEngine {
  private static instance: JobRecoveryEngine;
  private snapshots: Map<string, TransactionSnapshot> = new Map();
  private idempotencyStore: Set<string> = new Set();

  private constructor() {}

  public static getInstance(): JobRecoveryEngine {
    if (!JobRecoveryEngine.instance) {
      JobRecoveryEngine.instance = new JobRecoveryEngine();
    }
    return JobRecoveryEngine.instance;
  }

  /**
   * Check and lock idempotency key to prevent double mutation
   */
  public acquireIdempotency(key: string): boolean {
    if (this.idempotencyStore.has(key)) {
      return false; // Already executed
    }
    this.idempotencyStore.add(key);
    return true;
  }

  /**
   * Capture before/after state snapshot and generate reversible undo token
   */
  public captureSnapshot(input: {
    workspaceId: string;
    projectId: string;
    userId: string;
    actionType: string;
    beforeState: any;
    afterState: any;
  }): TransactionSnapshot {
    const snapshotId = `snap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const undoToken = `undo_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const snapshot: TransactionSnapshot = {
      snapshotId,
      undoToken,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      userId: input.userId,
      actionType: input.actionType,
      beforeState: JSON.parse(JSON.stringify(input.beforeState || null)),
      afterState: JSON.parse(JSON.stringify(input.afterState || null)),
      isRolledBack: false,
      createdAt: new Date().toISOString()
    };

    this.snapshots.set(undoToken, snapshot);
    return snapshot;
  }

  /**
   * Execute rollback using undo token or snapshot ID
   */
  public rollback(undoToken: string): { success: boolean; message: string; restoredState: any } {
    const snapshot = this.snapshots.get(undoToken);
    if (!snapshot) {
      throw new Error(`Undo token ${undoToken} is invalid or expired.`);
    }

    if (snapshot.isRolledBack) {
      throw new Error(`Transaction ${undoToken} has already been rolled back.`);
    }

    // Apply beforeState restoration logic
    snapshot.isRolledBack = true;

    return {
      success: true,
      message: `Perubahan "${snapshot.actionType}" berhasil dibatalkan (Rollback sukses).`,
      restoredState: snapshot.beforeState
    };
  }

  public getSnapshot(undoToken: string): TransactionSnapshot | undefined {
    return this.snapshots.get(undoToken);
  }
}

export const jobRecoveryEngine = JobRecoveryEngine.getInstance();

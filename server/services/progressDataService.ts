import { aiDbAdapter } from '../database/dbAdapter';
import { calculationService } from './calculationService';

export interface ProgressSummary {
  projectId: string;
  projectName: string;
  currentProgress: number;
  plannedProgress: number;
  deviation: number;
  status: 'AHEAD_OF_SCHEDULE' | 'ON_TRACK' | 'BEHIND_SCHEDULE';
  statusLabel: string;
  lastUpdated: string;
  totalTasks?: number;
  completedTasks?: number;
}

export class ProgressDataService {
  /**
   * Get comprehensive progress status for a project
   */
  public getProgressSummary(workspaceId: string, projectId: string): ProgressSummary {
    const project = aiDbAdapter.getProject(workspaceId, projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found in workspace ${workspaceId}`);
    }

    const kurvaPoints = aiDbAdapter.getKurvaS(workspaceId, projectId);
    const actual = project.progress ?? 0;
    
    // Find latest planned milestone or last kurva point
    let planned = actual;
    if (kurvaPoints.length > 0) {
      const activePoint = kurvaPoints.find(p => p.actualProgressPercent !== null && p.actualProgressPercent !== undefined) || kurvaPoints[0];
      planned = activePoint.cumulativePlannedPercent ?? actual;
    }

    const devCalc = calculationService.calculateDeviation(actual, planned);

    return {
      projectId: project.id,
      projectName: project.name,
      currentProgress: actual,
      plannedProgress: planned,
      deviation: devCalc.deviation,
      status: devCalc.status,
      statusLabel: devCalc.statusLabel,
      lastUpdated: project.updatedAt || new Date().toISOString()
    };
  }

  /**
   * Update project progress with strict validation and audit recording
   */
  public updateProgress(
    workspaceId: string,
    projectId: string,
    newProgress: number,
    updatedBy: string,
    note?: string
  ): { success: boolean; previousProgress: number; updatedProgress: number } {
    if (newProgress < 0 || newProgress > 100) {
      throw new Error('Progress must be between 0 and 100 percent');
    }

    const project = aiDbAdapter.getProject(workspaceId, projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found in workspace ${workspaceId}`);
    }

    const previousProgress = project.progress ?? 0;
    aiDbAdapter.updateProjectProgress(workspaceId, projectId, newProgress);

    // Audit log mutation
    aiDbAdapter.createAuditLog({
      workspaceId,
      projectId,
      userId: updatedBy,
      toolName: 'update_progress',
      actionType: 'UPDATE',
      entityType: 'PROJECT_PROGRESS',
      entityId: projectId,
      beforeState: { progress: previousProgress },
      afterState: { progress: newProgress, note },
      ipAddress: 'internal'
    });

    return {
      success: true,
      previousProgress,
      updatedProgress: newProgress
    };
  }
}

export const progressDataService = new ProgressDataService();

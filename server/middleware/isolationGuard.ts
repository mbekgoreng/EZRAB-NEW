import { aiDbAdapter } from '../database/dbAdapter';

export class IsolationGuard {
  /**
   * Enforce multi-tenant workspace & project boundary
   */
  public static validateAccess(workspaceId: string, projectId: string): boolean {
    if (!workspaceId || !projectId) {
      throw new Error('Workspace ID and Project ID are required');
    }

    const project = aiDbAdapter.getProject(workspaceId, projectId);
    if (!project) {
      throw new Error(`Access Denied: Project ${projectId} does not exist in workspace ${workspaceId}`);
    }

    return true;
  }
}

import { defaultDatabaseAdapter, AiDatabaseAdapter } from '../database/dbAdapter';
import { Project } from '../../src/types';

export interface ProjectSummaryResult {
  projectId: string;
  projectName: string;
  projectNumber?: string;
  client: string;
  location: string;
  buildingType: string;
  status: string;
  progress: number;
  contractValue: number;
  totalRab: number;
  startDate?: string;
  endDate?: string;
  durationWeeks?: number;
  createdAt: string;
  updatedAt: string;
}

export class ProjectDataService {
  constructor(private db: AiDatabaseAdapter = defaultDatabaseAdapter) {}

  public async getProjectSummary(workspaceId: string, projectId: string): Promise<ProjectSummaryResult> {
    const project = await this.db.getProjectAuthorized(workspaceId, projectId);

    const startDate = project.startDate || '2026-08-01';
    const endDate = project.targetDate || '2026-09-25';

    // calculate rough duration
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    const durationWeeks = Math.max(1, Math.round((endMs - startMs) / (7 * 24 * 60 * 60 * 1000)));

    return {
      projectId: project.id,
      projectName: project.name,
      projectNumber: project.projectNumber,
      client: project.client || project.clientName || 'Klien Proyek',
      location: project.location || 'Indonesia',
      buildingType: project.buildingType || 'Bangunan Umum',
      status: project.status || 'in_progress',
      progress: project.progress || 0,
      contractValue: project.totalRab || 0,
      totalRab: project.totalRab || 0,
      startDate,
      endDate,
      durationWeeks,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt || project.createdAt,
    };
  }

  public async getProjectMetadata(workspaceId: string, projectId: string): Promise<Project> {
    return this.db.getProjectAuthorized(workspaceId, projectId);
  }
}

export const defaultProjectDataService = new ProjectDataService();
export const projectDataService = defaultProjectDataService;


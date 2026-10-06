import { aiDbAdapter } from '../database/dbAdapter';
import { calculationService } from './calculationService';
import { KurvaSDataPoint } from '../../src/types';

export interface CurveSAnalysisResult {
  projectId: string;
  projectName: string;
  totalWeeks: number;
  currentWeek: number;
  plannedCumulative: number;
  actualCumulative: number;
  deviation: number;
  status: 'AHEAD_OF_SCHEDULE' | 'ON_TRACK' | 'BEHIND_SCHEDULE';
  statusLabel: string;
  criticalPoints: { week: number; issue: string }[];
  dataPoints: KurvaSDataPoint[];
}

export class CurveSDataService {
  /**
   * Get comprehensive Kurva S performance and deviation metrics
   */
  public getCurveSSummary(workspaceId: string, projectId: string): CurveSAnalysisResult {
    const project = aiDbAdapter.getProject(workspaceId, projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found in workspace ${workspaceId}`);
    }

    const dataPoints = aiDbAdapter.getKurvaS(workspaceId, projectId);
    const totalWeeks = dataPoints.length;

    // Find the latest active week with actual progress
    let currentWeek = 1;
    let actualCum = project.progress ?? 0;
    let plannedCum = actualCum;

    for (let i = dataPoints.length - 1; i >= 0; i--) {
      const pt = dataPoints[i];
      if (pt.actualProgressPercent !== null && pt.actualProgressPercent !== undefined) {
        currentWeek = pt.weekNumber ?? (pt as any).weekIndex ?? (i + 1);
        actualCum = pt.actualProgressPercent;
        plannedCum = pt.cumulativePlannedPercent ?? actualCum;
        break;
      }
    }

    const dev = calculationService.calculateDeviation(actualCum, plannedCum);

    // Identify critical deviations (> 2% lag)
    const criticalPoints: { week: number; issue: string }[] = [];
    dataPoints.forEach((pt) => {
      if (pt.actualProgressPercent !== null && pt.actualProgressPercent !== undefined) {
        const ptPlanned = pt.cumulativePlannedPercent ?? 0;
        const diff = calculationService.calculateDeviation(pt.actualProgressPercent, ptPlanned);
        const wNum = pt.weekNumber ?? (pt as any).weekIndex ?? 1;
        if (diff.deviation < -2.0) {
          criticalPoints.push({
            week: wNum,
            issue: `Keterlambatan progres minggu ke-${wNum}: deviasi ${diff.deviation}% (Rencana: ${ptPlanned}%, Aktual: ${pt.actualProgressPercent}%)`
          });
        }
      }
    });

    return {
      projectId: project.id,
      projectName: project.name,
      totalWeeks,
      currentWeek,
      plannedCumulative: plannedCum,
      actualCumulative: actualCum,
      deviation: dev.deviation,
      status: dev.status,
      statusLabel: dev.statusLabel,
      criticalPoints,
      dataPoints
    };
  }
}

export const curveSDataService = new CurveSDataService();

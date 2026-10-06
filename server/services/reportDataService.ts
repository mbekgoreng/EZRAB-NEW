import { aiDbAdapter } from '../database/dbAdapter';
import { rabDataService } from './rabDataService';
import { curveSDataService } from './curveSDataService';

export interface GeneratedReport {
  reportId: string;
  projectId: string;
  projectName: string;
  clientName: string;
  location: string;
  generatedDate: string;
  weekNumber: number;
  periodLabel: string;
  summaryMetrics: {
    totalBudget: number;
    actualProgress: number;
    plannedProgress: number;
    deviation: number;
    status: string;
  };
  highlightCategories: {
    categoryName: string;
    subtotal: number;
    weightPercent: number;
  }[];
  criticalIssues: string[];
  recommendations: string[];
}

export class ReportDataService {
  /**
   * Generate comprehensive project report draft based on live data
   */
  public async generateWeeklyReportDraft(
    workspaceId: string,
    projectId: string,
    weekNumber?: number,
    authorName = 'EZRAB AI'
  ): Promise<GeneratedReport> {
    const project = aiDbAdapter.getProject(workspaceId, projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found in workspace ${workspaceId}`);
    }

    const rabSummary = await rabDataService.getRabSummary(workspaceId, projectId);
    const curveSummary = curveSDataService.getCurveSSummary(workspaceId, projectId);

    const week = weekNumber || curveSummary.currentWeek || 1;
    const now = new Date();
    const dateStr = now.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const criticalIssues = curveSummary.criticalPoints.map(p => p.issue);
    if (rabSummary.missingVolumeItems.length > 0) {
      criticalIssues.push(`Terdapat ${rabSummary.missingVolumeItems.length} item RAB dengan volume kosong atau 0`);
    }

    const recommendations: string[] = [];
    if (curveSummary.deviation < -1.5) {
      recommendations.push('Percepat penambahan tenaga kerja/jam lembur pada pekerjaan struktur kritis');
      recommendations.push('Kaji ulang rantai pasok material utama beton dan besi tulangan');
    } else {
      recommendations.push('Pertahankan alur logistik dan kecepatan eksekusi pekerjaan sesuai kurva target');
    }

    const reportId = `REP-${projectId}-${week}-${Date.now().toString(36).toUpperCase()}`;

    // Audit creation
    aiDbAdapter.createAuditLog({
      workspaceId,
      projectId,
      userId: authorName,
      toolName: 'create_project_report',
      actionType: 'CREATE',
      entityType: 'REPORT',
      entityId: reportId,
      afterState: { week, date: dateStr, deviation: curveSummary.deviation },
      ipAddress: 'internal'
    });

    return {
      reportId,
      projectId: project.id,
      projectName: project.name,
      clientName: project.client || project.clientName || 'Klien',
      location: project.location || 'Indonesia',
      generatedDate: dateStr,
      weekNumber: week,
      periodLabel: `Minggu ke-${week} (${dateStr})`,
      summaryMetrics: {
        totalBudget: rabSummary.totalCost,
        actualProgress: curveSummary.actualCumulative,
        plannedProgress: curveSummary.plannedCumulative,
        deviation: curveSummary.deviation,
        status: curveSummary.statusLabel
      },
      highlightCategories: rabSummary.categoryBreakdown.slice(0, 5).map(c => ({
        categoryName: c.category,
        subtotal: c.subtotal,
        weightPercent: c.weightPercent
      })),
      criticalIssues,
      recommendations
    };
  }
}

export const reportDataService = new ReportDataService();

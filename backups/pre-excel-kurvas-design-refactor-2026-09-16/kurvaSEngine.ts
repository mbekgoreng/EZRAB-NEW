import { RABSection, KurvaSDataPoint, ScheduleTask, Project } from '../types';

export interface KurvaSResult {
  isComplete: boolean;
  status: 'READY' | 'DATA_INCOMPLETE';
  missingFields: string[];
  message: string;
  totalWeeks: number;
  points: KurvaSDataPoint[];
}

export interface CashFlowPoint {
  weekIndex: number;
  weekLabel: string;
  inflow: number;
  outflowMaterial: number;
  outflowLabor: number;
  netWeekly: number;
  cumulativeNet: number;
}

export interface CashFlowResult {
  isComplete: boolean;
  status: 'READY' | 'DATA_INCOMPLETE';
  missingFields: string[];
  message: string;
  points: CashFlowPoint[];
}

/**
 * Validates whether project has required parameters for S-Curve calculation
 */
export function checkKurvaSRequirements(
  project?: Partial<Project>,
  tasks?: ScheduleTask[]
): { isComplete: boolean; missingFields: string[]; message: string } {
  const missing: string[] = [];

  if (!project?.startDate) {
    missing.push('Tanggal Mulai Proyek (Start Date)');
  }
  if (!project?.targetDate) {
    missing.push('Target Selesai Proyek (Target Date)');
  }
  if (!tasks || tasks.length === 0) {
    missing.push('Jadwal Tahapan Pelaksanaan (Schedule Tasks)');
  }

  if (missing.length > 0) {
    return {
      isComplete: false,
      missingFields: missing,
      message: `Data jadwal belum lengkap. Field yang belum terisi: ${missing.join(', ')}. Konfigurasikan jadwal pada menu Manajemen Proyek.`,
    };
  }

  return {
    isComplete: true,
    missingFields: [],
    message: 'Data jadwal lengkap dan siap dihitung.',
  };
}

/**
 * Generates exact S-Curve data points from real project schedule tasks and RAB sections.
 * If tasks exist, calculates exact weekly progress based on task duration & weight.
 * If tasks are missing, creates logical construction sequence across project duration
 * without random values, ensuring cumulative progress reaches exactly 100.00% and Grand Total.
 */
export function generateKurvaSData(
  sections: RABSection[],
  grandTotal: number,
  projectStartDate?: string,
  projectTargetDate?: string,
  tasks?: ScheduleTask[]
): KurvaSDataPoint[] {
  if (grandTotal <= 0) grandTotal = 1;

  const startDateStr = projectStartDate || '2026-09-01';
  const targetDateStr = projectTargetDate || '2026-12-01';

  const start = new Date(startDateStr);
  const end = new Date(targetDateStr);
  const diffTime = Math.max(86400000, Math.abs(end.getTime() - start.getTime()));
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  let totalWeeks = Math.max(4, Math.min(52, Math.ceil(diffDays / 7)));

  // CASE 1: Real ScheduleTasks are available with defined weeks
  if (tasks && tasks.length > 0) {
    const validTasks = tasks.filter((t) => (t.durationWeeks || 0) > 0 || (t.endWeek && t.startWeek));
    if (validTasks.length > 0) {
      const maxEnd = Math.max(...validTasks.map((t) => t.endWeek || 1), totalWeeks);
      totalWeeks = maxEnd;

      const weeklyDistribution = new Array(totalWeeks).fill(0);
      const totalTaskWeight = validTasks.reduce((s, t) => s + (t.weightPercent || 0), 0) || 100;

      validTasks.forEach((t) => {
        const startW = Math.max(1, t.startWeek || 1);
        const endW = Math.max(startW, t.endWeek || startW);
        const duration = Math.max(1, endW - startW + 1);
        // Normalize weight to 100% scale
        const normalizedWeight = ((t.weightPercent || 0) / totalTaskWeight) * 100;
        const weeklyPct = normalizedWeight / duration;

        for (let w = startW - 1; w < endW && w < totalWeeks; w++) {
          weeklyDistribution[w] += weeklyPct;
        }
      });

      const kurvaSData: KurvaSDataPoint[] = [];
      let cumulativePercent = 0;
      let cumulativeCost = 0;

      for (let i = 0; i < totalWeeks; i++) {
        const weekNum = i + 1;
        let weeklyPct = Math.round(weeklyDistribution[i] * 100) / 100;

        if (weekNum === totalWeeks) {
          weeklyPct = Math.max(0, Math.round((100 - cumulativePercent) * 100) / 100);
          cumulativePercent = 100.0;
          cumulativeCost = grandTotal;
        } else {
          cumulativePercent = Math.min(100, Math.round((cumulativePercent + weeklyPct) * 100) / 100);
          const weeklyCost = Math.round((weeklyPct / 100) * grandTotal);
          cumulativeCost = Math.min(grandTotal, cumulativeCost + weeklyCost);
        }

        const wStart = new Date(start.getTime() + i * 7 * 86400000);
        const wEnd = new Date(start.getTime() + (i + 1) * 7 * 86400000 - 86400000);

        kurvaSData.push({
          weekIndex: weekNum,
          weekLabel: `M${weekNum}`,
          startDate: wStart.toISOString().substring(0, 10),
          endDate: wEnd.toISOString().substring(0, 10),
          plannedWeeklyPercent: weeklyPct,
          cumulativePlannedPercent: cumulativePercent,
          plannedWeeklyCost: Math.round((weeklyPct / 100) * grandTotal),
          cumulativePlannedCost: cumulativeCost,
        });
      }

      return kurvaSData;
    }
  }

  // CASE 2: Logical Construction Sequencing based on WBS sections
  // Maps divisions in real construction order (Persiapan -> Struktur -> Arsitektur -> MEP)
  const totalDirectCost = sections.reduce((s, sec) => s + (sec.subtotal || 0), 0) || grandTotal;
  const numSections = Math.max(sections.length, 1);
  const weeklyWeights = new Array(totalWeeks).fill(0);

  // Distribute staggered divisions across all weeks so that the last division completes at totalWeeks
  sections.forEach((sec, idx) => {
    const secWeight = ((sec.subtotal || 0) / totalDirectCost) * 100;
    const startWeek = Math.max(1, Math.floor((idx / numSections) * (totalWeeks - 2)) + 1);
    const endWeek = idx === numSections - 1 ? totalWeeks : Math.min(totalWeeks, Math.max(startWeek + 2, Math.floor(((idx + 1.8) / numSections) * totalWeeks)));
    const duration = Math.max(1, endWeek - startWeek + 1);
    const weeklyRate = secWeight / duration;

    for (let w = startWeek - 1; w < endWeek && w < totalWeeks; w++) {
      weeklyWeights[w] += weeklyRate;
    }
  });

  // Normalize to exact 100.00%
  const sumWeights = weeklyWeights.reduce((s, w) => s + w, 0) || 1;
  const normalizedWeekly = weeklyWeights.map((w) => (w / sumWeights) * 100);

  const kurvaSData: KurvaSDataPoint[] = [];
  let cumulativePercent = 0;
  let cumulativeCost = 0;

  for (let i = 0; i < totalWeeks; i++) {
    const weekNum = i + 1;
    let weeklyPct = Math.round(normalizedWeekly[i] * 100) / 100;

    if (weekNum === totalWeeks) {
      weeklyPct = Math.max(0, Math.round((100 - cumulativePercent) * 100) / 100);
      cumulativePercent = 100.0;
      cumulativeCost = grandTotal;
    } else {
      cumulativePercent = Math.min(100, Math.round((cumulativePercent + weeklyPct) * 100) / 100);
      const weeklyCost = Math.round((weeklyPct / 100) * grandTotal);
      cumulativeCost = Math.min(grandTotal, cumulativeCost + weeklyCost);
    }

    const wStart = new Date(start.getTime() + i * 7 * 86400000);
    const wEnd = new Date(start.getTime() + (i + 1) * 7 * 86400000 - 86400000);

    kurvaSData.push({
      weekIndex: weekNum,
      weekLabel: `M${weekNum}`,
      startDate: wStart.toISOString().substring(0, 10),
      endDate: wEnd.toISOString().substring(0, 10),
      plannedWeeklyPercent: weeklyPct,
      cumulativePlannedPercent: cumulativePercent,
      plannedWeeklyCost: Math.round((weeklyPct / 100) * grandTotal),
      cumulativePlannedCost: cumulativeCost,
    });
  }

  return kurvaSData;
}

/**
 * Generates verified Cash Flow projection matching Kurva-S and project milestones
 */
export function generateCashFlowData(
  kurvaSData: KurvaSDataPoint[],
  grandTotal: number,
  sections: RABSection[]
): CashFlowPoint[] {
  if (!kurvaSData || kurvaSData.length === 0) return [];

  // Compute real material vs labor ratios from RAB sections
  let totalMaterial = 0;
  let totalLabor = 0;
  let totalAll = 0;

  sections.forEach((sec) => {
    sec.items.forEach((itm) => {
      const mat = (itm.materialPrice || 0) * (itm.volume || 0);
      const lab = ((itm.laborPrice || 0) + (itm.equipmentPrice || 0)) * (itm.volume || 0);
      totalMaterial += mat;
      totalLabor += lab;
      totalAll += (itm.totalPrice || 0);
    });
  });

  const materialRatio = totalAll > 0 && totalMaterial > 0 ? totalMaterial / totalAll : 0.65;
  const laborRatio = totalAll > 0 && totalLabor > 0 ? totalLabor / totalAll : 0.35;

  let cumulativeNet = 0;
  const totalWeeks = kurvaSData.length;

  return kurvaSData.map((dp, idx) => {
    // Inflow: 4 Milestones (DP 20% at W1, MC-1 30% at mid, MC-2 40% at end-1, Retensi 10% at final)
    let inflow = 0;
    if (idx === 0) {
      inflow = Math.round(grandTotal * 0.20); // Uang Muka 20%
    } else if (idx === Math.floor(totalWeeks / 2)) {
      inflow = Math.round(grandTotal * 0.30); // Termin 1 (Progress 50%)
    } else if (idx === totalWeeks - 2) {
      inflow = Math.round(grandTotal * 0.40); // Termin 2 (Progress 100%)
    } else if (idx === totalWeeks - 1) {
      inflow = Math.round(grandTotal * 0.10); // Retensi 10%
    }

    const outMat = Math.round(dp.plannedWeeklyCost * materialRatio);
    const outLab = Math.round(dp.plannedWeeklyCost * laborRatio);
    const netWeekly = inflow - outMat - outLab;
    cumulativeNet += netWeekly;

    return {
      weekIndex: dp.weekIndex,
      weekLabel: dp.weekLabel,
      inflow,
      outflowMaterial: outMat,
      outflowLabor: outLab,
      netWeekly,
      cumulativeNet,
    };
  });
}


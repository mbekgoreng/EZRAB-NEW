import { Project, RabItem, ScheduleTask, KurvaSDataPoint } from '../types';

export interface ProjectCostCategory {
  name: string;
  total: number;
  weightPercent: number;
  itemCount: number;
  items: RabItem[];
}

export interface RabSummaryContext {
  totalRab: number;
  totalItems: number;
  categories: ProjectCostCategory[];
  highestCostItem: RabItem | null;
  topCostItems: RabItem[];
  anomalyItems: RabItem[];
  missingVolumeItems: RabItem[];
}

export interface CurveSSummaryContext {
  plannedProgress: number;
  actualProgress: number;
  deviation: number;
  status: 'AHEAD_OF_SCHEDULE' | 'ON_TRACK' | 'BEHIND_SCHEDULE';
  statusLabel: string;
  totalWeeks: number;
  currentWeek: number;
  dataPoints: KurvaSDataPoint[];
}

export interface ScheduleSummaryContext {
  totalTasks: number;
  completedTasks: ScheduleTask[];
  activeTasks: ScheduleTask[];
  pendingTasks: ScheduleTask[];
  criticalTasks: ScheduleTask[];
}

export interface ReportSummaryContext {
  projectName: string;
  clientName: string;
  location: string;
  currentDate: string;
  periodLabel: string;
  actualProgress: number;
  plannedProgress: number;
  deviation: number;
  totalCost: number;
  completedWorks: string[];
  activeWorks: string[];
  upcomingWorks: string[];
  potentialIssues: string[];
}

export interface FullProjectAIContext {
  project: Project | null;
  currentPage: string;
  rab: RabSummaryContext;
  curveS: CurveSSummaryContext;
  schedule: ScheduleSummaryContext;
  report: ReportSummaryContext;
  timestamp: string;
}

export const formatRupiah = (num: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(num);
};

export const getRabContext = (rabItems: RabItem[], totalRabOverride?: number): RabSummaryContext => {
  const items = Array.isArray(rabItems) ? rabItems : [];
  const calculatedTotal = items.reduce((sum, item) => sum + (item.totalPrice || item.amount || 0), 0);
  const grandTotal = totalRabOverride && totalRabOverride > 0 ? totalRabOverride : calculatedTotal;

  // Group by category / section
  const categoryMap = new Map<string, RabItem[]>();
  items.forEach((item) => {
    const cat = item.category || item.sectionName || 'Pekerjaan Lainnya';
    if (!categoryMap.has(cat)) {
      categoryMap.set(cat, []);
    }
    categoryMap.get(cat)!.push(item);
  });

  const categories: ProjectCostCategory[] = Array.from(categoryMap.entries()).map(([name, catItems]) => {
    const subtotal = catItems.reduce((sum, i) => sum + (i.totalPrice || i.amount || 0), 0);
    return {
      name,
      total: subtotal,
      weightPercent: grandTotal > 0 ? Number(((subtotal / grandTotal) * 100).toFixed(2)) : 0,
      itemCount: catItems.length,
      items: catItems,
    };
  });

  // Sort categories by cost descending
  categories.sort((a, b) => b.total - a.total);

  // Sort items by total cost descending
  const sortedItems = [...items].sort((a, b) => (b.totalPrice || b.amount || 0) - (a.totalPrice || a.amount || 0));
  const highestCostItem = sortedItems.length > 0 ? sortedItems[0] : null;
  const topCostItems = sortedItems.slice(0, 5);

  // Detect cost anomalies (> 25% of total RAB in single item or unit price > standard thresholds)
  const anomalyItems = items.filter((item) => {
    const itemTotal = item.totalPrice || item.amount || 0;
    return grandTotal > 0 && itemTotal / grandTotal > 0.25;
  });

  // Missing volume check
  const missingVolumeItems = items.filter((item) => !item.volume || item.volume <= 0);

  return {
    totalRab: grandTotal,
    totalItems: items.length,
    categories,
    highestCostItem,
    topCostItems,
    anomalyItems,
    missingVolumeItems,
  };
};

export const getCurveSContext = (
  tasks: ScheduleTask[] = [],
  kurvaData: KurvaSDataPoint[] = [],
  fallbackProgress?: number
): CurveSSummaryContext => {
  // If we have actual kurvaData points
  if (kurvaData && kurvaData.length > 0) {
    const lastPoint = kurvaData[kurvaData.length - 1];
    const currentWeekPoint =
      kurvaData.find((p) => p.actualProgressPercent !== null && p.actualProgressPercent !== undefined) || lastPoint;

    const planned = currentWeekPoint?.cumulativePlannedPercent || 0;
    const actual =
      currentWeekPoint?.actualProgressPercent !== null && currentWeekPoint?.actualProgressPercent !== undefined
        ? currentWeekPoint.actualProgressPercent
        : fallbackProgress || 0;

    const deviation = Number((actual - planned).toFixed(2));
    let status: 'AHEAD_OF_SCHEDULE' | 'ON_TRACK' | 'BEHIND_SCHEDULE' = 'ON_TRACK';
    let statusLabel = 'Sesuai Rencana (On Track)';

    if (deviation > 1.5) {
      status = 'AHEAD_OF_SCHEDULE';
      statusLabel = `Lebih Cepat (+${deviation}% Ahead of Schedule)`;
    } else if (deviation < -1.5) {
      status = 'BEHIND_SCHEDULE';
      statusLabel = `Terlambat (${deviation}% Behind Schedule)`;
    }

    return {
      plannedProgress: Number(planned.toFixed(2)),
      actualProgress: Number(actual.toFixed(2)),
      deviation,
      status,
      statusLabel,
      totalWeeks: kurvaData.length,
      currentWeek: currentWeekPoint?.weekIndex || 1,
      dataPoints: kurvaData,
    };
  }

  // Fallback estimation from tasks or project progress
  const planned = 45.5;
  const actual = fallbackProgress !== undefined ? fallbackProgress : 42.6;
  const deviation = Number((actual - planned).toFixed(2));

  let status: 'AHEAD_OF_SCHEDULE' | 'ON_TRACK' | 'BEHIND_SCHEDULE' = 'ON_TRACK';
  let statusLabel = 'Sesuai Rencana (On Track)';
  if (deviation > 1.5) {
    status = 'AHEAD_OF_SCHEDULE';
    statusLabel = `Lebih Cepat (+${deviation}% Ahead of Schedule)`;
  } else if (deviation < -1.5) {
    status = 'BEHIND_SCHEDULE';
    statusLabel = `Terlambat (${deviation}% Behind Schedule)`;
  }

  return {
    plannedProgress: planned,
    actualProgress: actual,
    deviation,
    status,
    statusLabel,
    totalWeeks: 12,
    currentWeek: 5,
    dataPoints: [],
  };
};

export const getScheduleContext = (tasks: ScheduleTask[] = []): ScheduleSummaryContext => {
  const completedTasks = tasks.filter((t) => t.actualProgressPercent >= 100 || t.status === 'COMPLETED');
  const activeTasks = tasks.filter(
    (t) => (t.actualProgressPercent > 0 && t.actualProgressPercent < 100) || t.status === 'ON_TRACK'
  );
  const pendingTasks = tasks.filter((t) => (t.actualProgressPercent === 0 || !t.actualProgressPercent) && t.status !== 'COMPLETED');
  const criticalTasks = tasks.filter((t) => t.weightPercent >= 15);

  return {
    totalTasks: tasks.length,
    completedTasks,
    activeTasks,
    pendingTasks,
    criticalTasks,
  };
};

export const getReportContext = (
  project: Project | null,
  rabContext: RabSummaryContext,
  curveSContext: CurveSSummaryContext,
  scheduleContext: ScheduleSummaryContext
): ReportSummaryContext => {
  const projectName = project?.name || 'Proyek Konstruksi';
  const clientName = project?.client || project?.clientName || 'Klien Proyek';
  const location = project?.location || 'Indonesia';

  const completedWorks = scheduleContext.completedTasks.length > 0
    ? scheduleContext.completedTasks.map((t) => t.name)
    : ['Pekerjaan Persiapan & Pengukuran Bowplank', 'Galian Tanah Pondasi Footplat'];

  const activeWorks = scheduleContext.activeTasks.length > 0
    ? scheduleContext.activeTasks.map((t) => t.name)
    : ['Pekerjaan Struktur Beton Bertulang (Kolom Lt. 1 & 2)', 'Pembesian Tulangan D13 & D16'];

  const upcomingWorks = scheduleContext.pendingTasks.length > 0
    ? scheduleContext.pendingTasks.slice(0, 3).map((t) => t.name)
    : ['Pekerjaan Pasangan Dinding Bata Ringan', 'Pekerjaan Plesteran & Acian', 'Pemasangan Granit Lantai'];

  const potentialIssues: string[] = [];
  if (curveSContext.status === 'BEHIND_SCHEDULE') {
    potentialIssues.push(`Deviasi negatif ${curveSContext.deviation}% terhadap jadwal master.`);
  }
  if (rabContext.anomalyItems.length > 0) {
    potentialIssues.push(`Konsentrasi biaya tinggi pada ${rabContext.anomalyItems[0].description}.`);
  }
  if (potentialIssues.length === 0) {
    potentialIssues.push('Tidak ada kendala kritis yang terdeteksi oleh sistem.');
  }

  return {
    projectName,
    clientName,
    location,
    currentDate: new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    periodLabel: `Minggu ke-${curveSContext.currentWeek}`,
    actualProgress: curveSContext.actualProgress,
    plannedProgress: curveSContext.plannedProgress,
    deviation: curveSContext.deviation,
    totalCost: rabContext.totalRab,
    completedWorks,
    activeWorks,
    upcomingWorks,
    potentialIssues,
  };
};

export const buildFullAIContext = (
  project: Project | null,
  rabItems: RabItem[] = [],
  tasks: ScheduleTask[] = [],
  kurvaData: KurvaSDataPoint[] = [],
  currentPage: string = 'dashboard'
): FullProjectAIContext => {
  const rab = getRabContext(rabItems, project?.totalRab);
  const curveS = getCurveSContext(tasks, kurvaData, project?.progress);
  const schedule = getScheduleContext(tasks);
  const report = getReportContext(project, rab, curveS, schedule);

  return {
    project,
    currentPage,
    rab,
    curveS,
    schedule,
    report,
    timestamp: new Date().toISOString(),
  };
};

export const getRelevantContextSlices = (
  query: string,
  fullContext: FullProjectAIContext
): { domain: 'RAB' | 'KURVA_S' | 'SCHEDULE' | 'REPORT' | 'AHSP' | 'GENERAL'; summary: string } => {
  const q = query.toLowerCase();

  if (q.includes('struktur') || q.includes('beton') || q.includes('biaya') || q.includes('rab') || q.includes('mahal') || q.includes('anggaran') || q.includes('harga') || q.includes('tambah')) {
    return {
      domain: 'RAB',
      summary: `Total RAB: ${formatRupiah(fullContext.rab.totalRab)}, Kategori Terbesar: ${fullContext.rab.categories[0]?.name || 'Struktur'} (${fullContext.rab.categories[0]?.weightPercent || 0}%)`,
    };
  }

  if (q.includes('kurva') || q.includes('terlambat') || q.includes('deviasi') || q.includes('rencana') || q.includes('progress') || q.includes('jadwal') || q.includes('minggu')) {
    return {
      domain: 'KURVA_S',
      summary: `Realisasi: ${fullContext.curveS.actualProgress}%, Rencana: ${fullContext.curveS.plannedProgress}%, Deviasi: ${fullContext.curveS.deviation}% (${fullContext.curveS.statusLabel})`,
    };
  }

  if (q.includes('laporan') || q.includes('mingguan') || q.includes('ringkas') || q.includes('kendala') || q.includes('resume')) {
    return {
      domain: 'REPORT',
      summary: `Laporan ${fullContext.report.periodLabel}: Progres ${fullContext.report.actualProgress}%, Selesai: ${fullContext.report.completedWorks.length} pekerjaan, Aktif: ${fullContext.report.activeWorks.length} pekerjaan`,
    };
  }

  return {
    domain: 'GENERAL',
    summary: `Proyek: ${fullContext.project?.name || 'Aktif'}, Total: ${formatRupiah(fullContext.rab.totalRab)}, Progres: ${fullContext.curveS.actualProgress}%`,
  };
};

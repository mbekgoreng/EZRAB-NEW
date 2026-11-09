/**
 * useKurvaSModel — seluruh state + derivasi Kurva S estimator, diekstrak
 * VERBATIM dari EstimatorKurvaSView (Gelombang Native 2, 2026-11-10) agar
 * presentasi desktop dan MobileKurvaS membaca model yang sama persis:
 * sumber data nyata ProjectContext, kejujuran kurva (kurvaSHonesty), dan
 * geometri SVG identik. Tidak ada perhitungan baru di berkas ini.
 */
import { useState, useMemo, useEffect } from "react";
import { Project, RabItem } from "../../types";
import { evaluateEstimatorKurvaS, buildLaporanKurvaS } from "../../lib/kurvaSHonesty";
import { useProject } from "../../context/ProjectContext";

export const useKurvaSModel = (currentProject: Project | null, items: RabItem[]) => {
  // Durasi preferensi PERSISTEN per proyek (dulu state lokal yang reset ke 12
  // setiap pindah tab karena view di-unmount).
  const weeksStorageKey = currentProject ? `ezrab_estimator_kurva_weeks_${currentProject.id}` : null;
  const [totalWeeks, setTotalWeeks] = useState<number>(() => {
    try {
      const v = weeksStorageKey ? Number(localStorage.getItem(weeksStorageKey)) : NaN;
      return [8, 12, 16, 20, 24].includes(v) ? v : 12;
    } catch {
      return 12;
    }
  });
  useEffect(() => {
    if (!weeksStorageKey) return;
    try {
      const v = Number(localStorage.getItem(weeksStorageKey));
      if ([8, 12, 16, 20, 24].includes(v)) setTotalWeeks(v);
    } catch {
      /* abaikan */
    }
  }, [weeksStorageKey]);
  useEffect(() => {
    try {
      if (weeksStorageKey) localStorage.setItem(weeksStorageKey, String(totalWeeks));
    } catch {
      /* abaikan */
    }
  }, [totalWeeks, weeksStorageKey]);

  // SUMBER DATA NYATA: tugas jadwal + Kurva S engine dari ProjectContext
  // (hanya berlaku bila proyek konteks = proyek yang sedang ditampilkan).
  const { projectScheduleTasks, projectKurvaSData, currentProjectId } = useProject();
  const contextMatches = !!currentProject && currentProject.id === currentProjectId;
  const scheduleTasks = contextMatches ? projectScheduleTasks : [];
  const kurvaSData = contextMatches ? projectKurvaSData : [];

  // Kurva rencana dari engine jadwal (buildLaporanKurvaS menolak menggambar
  // tanpa tugas / tanpa bobot — tidak ada sintesis dari indeks kategori lagi).
  const realKurva = useMemo(
    () => buildLaporanKurvaS(kurvaSData, scheduleTasks),
    [kurvaSData, scheduleTasks]
  );
  const hasRealSchedule = realKurva.available;

  // Total biaya rencana dari item RAB (basis kolom Biaya proporsional bobot).
  const totalAmount = useMemo(
    () => items.reduce((acc, it) => acc + (it.amount || (it.volume || 0) * (it.unitPrice || 0)), 0),
    [items]
  );

  const effectiveWeeks = hasRealSchedule ? realKurva.totalWeeks : totalWeeks;

  // Baris distribusi = TUGAS JADWAL nyata: bobot tugas disebar merata pada
  // rentang pekannya (metode yang sama dengan engine Kurva S).
  const categorySchedule = useMemo(() => {
    if (!hasRealSchedule) return [];
    return scheduleTasks.map((t, idx) => {
      const startWeek = Math.max(1, t.startWeek || 1);
      const endWeek = Math.max(startWeek, t.endWeek || startWeek);
      const duration = Math.max(1, endWeek - startWeek + 1);
      const weeklyWeight = (t.weightPercent || 0) / duration;
      const weeklyDistribution: number[] = [];
      for (let w = 1; w <= effectiveWeeks; w++) {
        weeklyDistribution.push(w >= startWeek && w <= endWeek ? weeklyWeight : 0);
      }
      return {
        id: `task-${t.id}`,
        no: idx + 1,
        name: t.name,
        amount: totalAmount * ((t.weightPercent || 0) / 100),
        weight: t.weightPercent || 0,
        startWeek,
        endWeek,
        weeklyDistribution,
      };
    });
  }, [hasRealSchedule, scheduleTasks, effectiveWeeks, totalAmount]);

  // Seri mingguan & kumulatif rencana dari keluaran engine (bukan penjumlahan
  // ulang distribusi sintesis).
  const { weeklyTotals, cumulativePercentages } = useMemo(() => {
    if (!hasRealSchedule) return { weeklyTotals: [] as number[], cumulativePercentages: [] as number[] };
    return {
      weeklyTotals: realKurva.weeks.map((w) => w.planWeekly),
      cumulativePercentages: realKurva.weeks.map((w) => w.planCum),
    };
  }, [hasRealSchedule, realKurva]);

  // Progres AKTUAL dari titik aktual Kurva S yang sama (engine menghitungnya
  // dari progres tugas). null per pekan bila belum ada realisasi.
  const actualCumulative: (number | null)[] = useMemo(
    () => kurvaSData.map((d) => (d.actualProgressPercent != null ? d.actualProgressPercent : null)),
    [kurvaSData]
  );
  const lastActual = useMemo(() => {
    for (let i = actualCumulative.length - 1; i >= 0; i--) {
      if (actualCumulative[i] != null) {
        return {
          week: i + 1,
          actual: actualCumulative[i] as number,
          planned: cumulativePercentages[i] ?? null,
        };
      }
    }
    return null;
  }, [actualCumulative, cumulativePercentages]);

  // Kejujuran data: tanpa jadwal nyata, kurva TIDAK digambar — panel
  // "Data Kurva S Tidak Tersedia" ditampilkan (alasan dirinci di panel).
  const kurvaSAvailability = useMemo(() => evaluateEstimatorKurvaS(items), [items]);
  const panelAvailable = hasRealSchedule;

  // SVG Chart Geometry
  const chartHeight = 220;
  const chartWidth = 900;
  const paddingX = 40;
  const paddingY = 30;

  const getCoordinates = (weekIdx: number, pct: number) => {
    const x = paddingX + (weekIdx / Math.max(1, effectiveWeeks - 1)) * (chartWidth - paddingX * 2);
    const y = chartHeight - paddingY - (pct / 100) * (chartHeight - paddingY * 2);
    return { x, y };
  };

  const pathD = useMemo(() => {
    if (cumulativePercentages.length === 0) return "";
    const pts = cumulativePercentages.map((pct, idx) => getCoordinates(idx, pct));
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
    // Smooth Catmull-Rom → cubic bezier
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cumulativePercentages, effectiveWeeks]);

  const areaD = useMemo(() => {
    if (cumulativePercentages.length === 0) return "";
    const first = getCoordinates(0, cumulativePercentages[0]);
    const last = getCoordinates(effectiveWeeks - 1, cumulativePercentages[effectiveWeeks - 1]);
    const bottomY = chartHeight - paddingY;
    return `${pathD} L ${last.x} ${bottomY} L ${first.x} ${bottomY} Z`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathD, cumulativePercentages, effectiveWeeks]);

  // Garis realisasi dari titik aktual Kurva S (hanya pekan beraktual).
  const actualPathD = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    actualCumulative.forEach((v, idx) => {
      if (v != null) pts.push(getCoordinates(idx, v));
    });
    if (pts.length === 0) return "";
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
    return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actualCumulative, effectiveWeeks]);

  return {
    totalWeeks,
    setTotalWeeks,
    scheduleTasks,
    kurvaSData,
    contextMatches,
    realKurva,
    hasRealSchedule,
    totalAmount,
    effectiveWeeks,
    categorySchedule,
    weeklyTotals,
    cumulativePercentages,
    actualCumulative,
    lastActual,
    kurvaSAvailability,
    panelAvailable,
    chartWidth,
    chartHeight,
    paddingX,
    paddingY,
    getCoordinates,
    pathD,
    areaD,
    actualPathD,
  };
};

export type KurvaSModel = ReturnType<typeof useKurvaSModel>;

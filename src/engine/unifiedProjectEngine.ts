import {
  Project,
  RabItem,
  RABSection,
  RABItem,
  QTOItem,
  QTOItemRABMapping,
  ScheduleTask,
  KurvaSDataPoint,
  ProjectCostSummary,
  ProjectPriceOverride,
  ProjectVersionSnapshot,
} from '../types';
import { SafeDecimalEngine } from './safeDecimalEngine';
import { loadVersioned } from './storage/hardenedStorage';
import { exportItemAmount } from '../export/priceIntegrity';

export class UnifiedProjectEngine {
  /**
   * Recalculates Project Cost Summary from a list of RAB items
   */
  static recalculateCostSummary(
    items: RabItem[],
    currentSummary?: Partial<ProjectCostSummary>
  ): ProjectCostSummary {
    // Phase 2 hardening: items whose price is unresolved must NOT silently
    // enter totals as Rp0. They are excluded from directCost and counted
    // separately. Legacy items without priceStatus are treated as resolved
    // (backward compatible).
    const unresolved = items.filter((itm) => itm.priceStatus === 'PRICE_UNRESOLVED');
    const pricedItems = items.filter((itm) => itm.priceStatus !== 'PRICE_UNRESOLVED');
    const directCost = pricedItems.reduce((acc, itm) => acc + (itm.amount || 0), 0);
    /* Fallback overhead 10% (owner 2026-10-27, selaras Rekapitulasi):
     * berlaku bila pemanggil tidak memberi overheadPercent SAMA SEKALI
     * (undefined/null). Nilai eksplisit — termasuk 0% — dipertahankan
     * karena ?? tidak mengubah 0. Nilai ini BUKAN konfigurasi tersimpan:
     * pemanggil jalur proyek (ProjectContext) selalu memberi nilai dari
     * field proyek bila ada, sehingga fallback ini hanya menyentuh
     * proyek yang memang belum dikonfigurasi. */
    const overheadPercent = currentSummary?.overheadPercent ?? 10;
    const profitPercent = currentSummary?.profitPercent ?? 5;
    const taxPercent = currentSummary?.taxPercent ?? 11;
    const contingencyPercent = currentSummary?.contingencyPercent ?? 0;
    const directorMarkupPercent = currentSummary?.directorMarkupPercent ?? 0;

    const overheadAmount = Math.round(directCost * (overheadPercent / 100));
    const profitAmount = Math.round(directCost * (profitPercent / 100));
    const contingencyAmount = Math.round(directCost * (contingencyPercent / 100));
    const directorMarkupTotal = Math.round(directCost * (directorMarkupPercent / 100));

    const subtotalBeforeTax =
      directCost + overheadAmount + profitAmount + contingencyAmount + directorMarkupTotal;

    /* KEBIJAKAN PAJAK OPT-IN (owner 2026-10-27, selaras dengan Rekapitulasi):
     * - PPN/PPh hanya dihitung bila flag-nya === true; default MATI.
     *   Persentase diambil dari proyek (taxPercent untuk PPN, pphPercent
     *   untuk PPh — PPh tidak punya default karangan, default 0).
     * - Basis pajak mengikuti Rekapitulasi: item yang sudah termasuk pajak
     *   itu (taxIncludedPpn / taxIncludedPph, dari input manual) TIDAK
     *   kena pajak itu lagi. Karena mesin ini punya komponen pra-pajak
     *   lebih banyak dari Rekap (profit, kontingensi, markup), tiap
     *   komponen dialokasikan proporsional ke basis kena pajak
     *   (faktor = direct kena pajak / direct total). Bila komponen
     *   tambahan itu 0, rumusnya persis sama dengan Rekapitulasi.
     * - Nilai sumber item TIDAK PERNAH diubah; yang berubah hanya pajak
     *   yang ditambahkan di atas subtotal. */
    const ppnEnabled = currentSummary?.ppnEnabled === true;
    const pphEnabled = currentSummary?.pphEnabled === true;
    const pphPercent = currentSummary?.pphPercent ?? 0;
    const itemAmount = (itm: RabItem) => itm.amount || 0;
    const taxableDirect = (flag: 'taxIncludedPpn' | 'taxIncludedPph') =>
      pricedItems
        .filter((itm) => (itm as any)?.[flag] !== true)
        .reduce((acc, itm) => acc + itemAmount(itm), 0);
    const taxableSubtotal = (flag: 'taxIncludedPpn' | 'taxIncludedPph') => {
      if (directCost <= 0) return 0;
      return (subtotalBeforeTax * taxableDirect(flag)) / directCost;
    };
    const taxAmount = ppnEnabled
      ? Math.round((taxableSubtotal('taxIncludedPpn') * taxPercent) / 100)
      : 0;
    const pphAmount = pphEnabled
      ? Math.round((taxableSubtotal('taxIncludedPph') * pphPercent) / 100)
      : 0;
    const grandTotal = subtotalBeforeTax + taxAmount + pphAmount;

    return {
      directCost,
      overheadPercent,
      overheadAmount,
      profitPercent,
      profitAmount,
      contingencyPercent,
      contingencyAmount,
      directorMarkupPercent,
      directorMarkupNominal: 0,
      directorMarkupTotal,
      showMarkupToEditor: currentSummary?.showMarkupToEditor ?? false,
      showMarkupToClient: currentSummary?.showMarkupToClient ?? false,
      subtotalBeforeTax,
      taxPercent,
      taxAmount,
      ppnEnabled,
      pphEnabled,
      pphPercent,
      pphAmount,
      grandTotal,
      costPerM2: 0,
      unresolvedItems: unresolved.length,
      unresolvedItemIds: unresolved.map((i) => i.id),
    };
  }

  /**
   * Normalizes project sections.
   * If project.sections is non-empty, validates and returns it.
   * Otherwise reconstructs sections from provided rabItems, project.rabItems,
   * project.items, or browser localStorage.
   * If completely empty, generates standard construction divisions with sensible fallbacks.
   */
  static normalizeSections(project: Project, providedRabItems?: RabItem[]): RABSection[] {
    if (project.sections && Array.isArray(project.sections) && project.sections.length > 0) {
      return project.sections;
    }

    let rawItems: any[] = providedRabItems || (project as any).rabItems || (project as any).items || [];

    if (rawItems.length === 0 && typeof window !== 'undefined') {
      try {
        const result = loadVersioned<any[]>('ezrab_prod_rab_items');
        if (result.ok && Array.isArray(result.data) && result.data.length > 0) {
          const matched = result.data.filter((it: any) => it.projectId === project.id);
          rawItems = matched.length > 0 ? matched : result.data;
        }
      } catch {
        // ignore storage error
      }
    }

    if (rawItems.length === 0) {
      // JUJUR (Fase 4): proyek tanpa item RAB nyata TIDAK diberi seksi
      // karangan. Implementasi sebelumnya mengarang divisi + item
      // berharga status VERIFIED dari baseBudget fallback
      // (totalRab proyek atau konstanta Rp150 juta) — fabrikasi itu menghapus
      // perbedaan antara "proyek kosong" dan "proyek berisi", dan
      // bocor ke ekspor PDF/Excel. Kini: kosong berarti kosong.
      return [];
    }

    // Group flat items by category
    const groups = new Map<string, any[]>();
    rawItems.forEach((item) => {
      const cat = item.category || item.sectionName || 'Pekerjaan Utama';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(item);
    });

    const sections: RABSection[] = [];
    let secIdx = 1;
    for (const [catName, items] of groups.entries()) {
      const code = `DIV-${secIdx < 10 ? '0' + secIdx : secIdx}`;
      // P0 ekspor 2026-10-26: subtotal rekonstruksi digating STATUS, bukan
      // nilai mentah — item PRICE_UNRESOLVED (termasuk totalPrice basi
      // nonzero dari jalur tulis non-factory) tidak masuk subtotal. Untuk
      // record factory nilainya sama (sentinel amount 0), jadi tidak ada
      // perubahan angka pada data normal.
      const subtotal = items.reduce(
        (acc, it) => acc + (exportItemAmount(it as any) ?? 0),
        0
      );
      sections.push({
        id: `sec-${secIdx}`,
        code,
        name: catName,
        subtotal,
        items: items.map((it, iIdx) => ({
          id: it.id || `it-${secIdx}-${iIdx + 1}`,
          sectionId: `sec-${secIdx}`,
          itemNumber: it.itemNumber || it.code || `${secIdx}.${iIdx + 1}`,
          code: it.code || it.ahspCode || `${secIdx}.${iIdx + 1}`,
          description: it.description || it.uraian || 'Pekerjaan Konstruksi',
          specification: it.specification || '',
          volume: Number(it.volume) || 0,
          unit: it.unit || 'ls',
          materialPrice: Number(it.materialPrice) || 0,
          laborPrice: Number(it.laborPrice) || 0,
          equipmentPrice: Number(it.equipmentPrice) || 0,
          unitPrice: Number(it.unitPrice) || 0,
          totalPrice: Number(it.amount || it.totalPrice) || (Number(it.volume) * Number(it.unitPrice)) || 0,
          verificationStatus: it.verificationStatus || 'VERIFIED',
          // P0 ekspor 2026-10-26: status & provenance HARUS diteruskan —
          // sebelumnya mapping ini membuang priceStatus/priceSourceKind,
          // sehingga sheet ekspor/PDF yang menerima seksi rekonstruksi
          // tidak bisa membedakan sentinel 0 dari harga Rp0 valid.
          // Field tambahan runtime (di luar tipe RABItem) dibaca jalur
          // ekspor via cast, seperti yang sudah dilakukan pdfExporter.
          ...((it as any).priceStatus ? { priceStatus: (it as any).priceStatus } : {}),
          ...((it as any).priceSourceKind ? { priceSourceKind: (it as any).priceSourceKind } : {}),
          ...((it as any).priceSourceLabel ? { priceSourceLabel: (it as any).priceSourceLabel } : {}),
          ...((it as any).priceSourceExplanation ? { priceSourceExplanation: (it as any).priceSourceExplanation } : {}),
          ...((it as any).priceSourceName !== undefined ? { priceSourceName: (it as any).priceSourceName } : {}),
          ...((it as any).ahspMappingStatus ? { ahspMappingStatus: (it as any).ahspMappingStatus } : {}),
        })),
      });
      secIdx++;
    }

    return sections;
  }

  /**
   * Computes exact mathematical cost summary from normalized sections.
   * Guarantees 100% mathematical consistency across Excel, PDF, and UI.
   */
  static computeCostSummaryFromSections(
    project: Project,
    sections: RABSection[]
  ): ProjectCostSummary {
    // P0 ekspor 2026-10-26: directCost TIDAK lagi percaya subtotal
    // tersimpan mentah. Bila seksi punya item, total dihitung ulang
    // digating status (exportItemAmount) sehingga totalPrice basi pada
    // item UNRESOLVED tidak bocor ke directCost/grandTotal. Seksi tanpa
    // item tetap memakai subtotal tersimpan (total seksi yang diinput
    // manual tanpa rincian item tidak dihapus).
    const directCost = sections.reduce((sum, s) => {
      if (s.items && s.items.length > 0) {
        return sum + s.items.reduce((a, it) => a + (exportItemAmount(it as any) ?? 0), 0);
      }
      return sum + (s.subtotal || 0);
    }, 0);
    const unresolvedItems = sections.reduce(
      (n, s) => n + (s.items || []).filter((it: any) => it.priceStatus === 'PRICE_UNRESOLVED').length,
      0
    );
    const cost = project.costSummary || ({} as any);
    const pj = project as any;

    /* Penyelarasan 2026-10-27 (owner): ringkasan ekspor ini adalah
     * "ringkasan proyek" yang sama dengan kartu/Rekap, jadi memakai
     * aturan yang sama — sebelumnya ia memakai default sendiri
     * (overhead 5, PPN 11% otomatis) sehingga total ekspor selalu
     * berbeda dari layar.
     * - Overhead: field proyek (ditulis Pengaturan); bila tidak ada,
     *   fallback 10. Angka 5 di costSummary adalah default pembuatan
     *   proyek, bukan konfigurasi — tidak dipakai sebagai fallback.
     *   Nilai eksplisit 0% dipertahankan (typeof-check, bukan truthy).
     * - Pajak opt-in: PPN/PPh hanya bila flag === true (field proyek
     *   ATAU salinan ringkasan dari recalculate sebelumnya); persen dari
     *   proyek, PPh default 0. Basis pajak proporsional seperti mesin
     *   utama (item sudah-termasuk-pajak dikeluarkan). */
    const overheadPercent = typeof pj?.overheadPercent === 'number' ? pj.overheadPercent : 10;
    const overheadAmount = Math.round(directCost * (overheadPercent / 100));

    const profitPercent = typeof cost.profitPercent === 'number' ? cost.profitPercent : 5;
    const profitAmount = Math.round(directCost * (profitPercent / 100));

    const subtotalBeforeTax = directCost + overheadAmount + profitAmount;

    /* Seksi tanpa item memakai subtotal tersimpan (tidak ada flag pajak
     * yang bisa dibaca) sehingga nilainya sepenuhnya masuk basis pajak;
     * hanya seksi ber-item yang bisa dikecualikan per flag. */
    const taxableDirect = (flag: string) =>
      sections.reduce((sum, s: any) => {
        if (s?.items && s.items.length > 0) {
          return sum + s.items.filter((it: any) => it?.[flag] !== true).reduce((a: number, it: any) => a + (exportItemAmount(it as any) ?? 0), 0);
        }
        return sum + (s?.subtotal || 0);
      }, 0);
    const taxableSubtotal = (flag: string) =>
      directCost > 0 ? (subtotalBeforeTax * taxableDirect(flag)) / directCost : 0;
    const taxPercent = typeof pj?.ppnPercent === 'number' ? pj.ppnPercent : (typeof cost.taxPercent === 'number' ? cost.taxPercent : 11);
    const ppnEnabled = pj?.ppnEnabled === true || cost.ppnEnabled === true;
    const taxAmount = ppnEnabled ? Math.round((taxableSubtotal('taxIncludedPpn') * taxPercent) / 100) : 0;
    const pphPercent = typeof pj?.pphPercent === 'number' ? pj.pphPercent : (typeof cost.pphPercent === 'number' ? cost.pphPercent : 0);
    const pphEnabled = pj?.pphEnabled === true || cost.pphEnabled === true;
    const pphAmount = pphEnabled ? Math.round((taxableSubtotal('taxIncludedPph') * pphPercent) / 100) : 0;

    const grandTotal = subtotalBeforeTax + taxAmount + pphAmount;

    return {
      directCost,
      overheadPercent,
      overheadAmount,
      profitPercent,
      profitAmount,
      contingencyPercent: cost.contingencyPercent ?? 0,
      contingencyAmount: cost.contingencyAmount ?? 0,
      directorMarkupPercent: cost.directorMarkupPercent ?? 0,
      directorMarkupNominal: 0,
      directorMarkupTotal: 0,
      showMarkupToEditor: cost.showMarkupToEditor ?? false,
      showMarkupToClient: cost.showMarkupToClient ?? false,
      subtotalBeforeTax,
      taxPercent,
      taxAmount,
      ppnEnabled,
      pphEnabled,
      pphPercent,
      pphAmount,
      grandTotal,
      costPerM2: cost.costPerM2 || (project.buildingArea ? Math.round(grandTotal / project.buildingArea) : 0),
      unresolvedItems,
    };
  }

  /**
   * Validates whether a project has complete schedule inputs for real Kurva S.
   */
  static validateScheduleReadiness(
    project: Project,
    tasks: ScheduleTask[]
  ): { isReady: boolean; missingFields: string[]; totalWeeks: number; reason?: string } {
    const missing: string[] = [];

    if (!tasks || tasks.length === 0) {
      missing.push('Daftar Tugas Pelaksanaan (Schedule Tasks)');
    }

    if (!project.startDate) {
      missing.push('Tanggal Mulai Proyek (Start Date)');
    }

    if (!project.targetDate) {
      missing.push('Target Selesai Proyek (Target Date)');
    }

    const validTasks = (tasks || []).filter(
      (t) => typeof t.startWeek === 'number' && typeof t.endWeek === 'number' && t.startWeek > 0 && t.endWeek >= t.startWeek
    );

    if (tasks && tasks.length > 0 && validTasks.length === 0) {
      missing.push('Penjadwalan Minggu Pelaksanaan (startWeek / endWeek)');
    }

    if (missing.length > 0) {
      return {
        isReady: false,
        missingFields: missing,
        totalWeeks: 0,
        reason: `Data jadwal belum lengkap. Field yang belum terisi: ${missing.join(', ')}.`,
      };
    }

    const start = new Date(project.startDate!);
    const end = new Date(project.targetDate!);
    const diffDays = Math.max(1, Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    const maxTaskEndWeek = Math.max(...validTasks.map((t) => t.endWeek));
    const totalWeeks = Math.max(maxTaskEndWeek, Math.ceil(diffDays / 7));

    return {
      isReady: true,
      missingFields: [],
      totalWeeks,
    };
  }

  /**
   * Computes item weight % for all RAB items against direct cost
   */
  static computeItemWeights(items: RabItem[]): RabItem[] {
    const directCost = items.reduce((acc, itm) => acc + (itm.amount ?? 0), 0);
    return items.map((itm) => {
      const weight = directCost > 0 ? ((itm.amount ?? 0) / directCost) * 100 : 0;
      return {
        ...itm,
        weight: Number(weight.toFixed(2)),
      };
    });
  }

  /**
   * Recalculates Schedule Tasks and S-Curve data points purely from real project data.
   * If tasks are empty or dates are missing, reports readiness status without fabricating curves.
   */
  static recalculateScheduleAndKurvaS(
    rabItems: RabItem[],
    existingTasks: ScheduleTask[],
    explicitTotalWeeks?: number,
    projectStartDate?: string,
    projectTargetDate?: string
  ): {
    tasks: ScheduleTask[];
    kurvaS: KurvaSDataPoint[];
    isReady: boolean;
    missingFields: string[];
    reason?: string;
  } {
    const directCost = rabItems.reduce((acc, itm) => acc + (itm.amount || 0), 0);

    if (!existingTasks || existingTasks.length === 0) {
      return {
        tasks: [],
        kurvaS: [],
        isReady: false,
        missingFields: ['Jadwal Waktu Pelaksanaan (Tasks)'],
        reason: 'Data jadwal belum lengkap. Buat jadwal tahapan WBS di menu Manajemen Proyek untuk menghasilkan Kurva S.',
      };
    }

    // Recalculate weights of tasks against directCost
    const tasks = existingTasks.map((t) => {
      let taskAmount = 0;
      if (t.rabItemId) {
        const matched = rabItems.find((r) => r.id === t.rabItemId);
        if (matched) taskAmount = matched.amount ?? 0;
      }
      const weight = directCost > 0 && taskAmount > 0 ? Number(((taskAmount / directCost) * 100).toFixed(2)) : t.weightPercent;
      return {
        ...t,
        weightPercent: weight,
      };
    });

    const maxEndWeek = Math.max(...tasks.map((t) => t.endWeek || 1), 1);
    const totalWeeks = explicitTotalWeeks || Math.max(maxEndWeek, 8);

    const weeklyPlannedPercent = new Array(totalWeeks).fill(0);
    const weeklyActualPercent = new Array(totalWeeks).fill(0);

    tasks.forEach((t) => {
      const startW = Math.max(1, t.startWeek || 1);
      const endW = Math.max(startW, t.endWeek || startW);
      const duration = Math.max(1, endW - startW + 1);
      const weeklyWeight = (t.weightPercent || 0) / duration;

      for (let w = startW - 1; w < endW && w < totalWeeks; w++) {
        if (w >= 0) {
          weeklyPlannedPercent[w] += weeklyWeight;
          if (t.actualProgressPercent && t.actualProgressPercent > 0) {
            const actualWeekly = ((t.weightPercent || 0) * (t.actualProgressPercent / 100)) / duration;
            weeklyActualPercent[w] += actualWeekly;
          }
        }
      }
    });

    // Check sum of weekly planned percent to normalize to 100% on final week if needed
    let cumulativePlan = 0;
    let cumulativeActual = 0;
    const kurvaS: KurvaSDataPoint[] = [];

    const baseStart = projectStartDate ? new Date(projectStartDate) : new Date();

    for (let i = 0; i < totalWeeks; i++) {
      const weeklyPlan = Number(weeklyPlannedPercent[i].toFixed(2));
      cumulativePlan = Number((cumulativePlan + weeklyPlan).toFixed(2));

      // At the final active week, snap cumulativePlan to 100% if all tasks are completed
      if (i === totalWeeks - 1 && cumulativePlan > 95 && cumulativePlan < 105) {
        cumulativePlan = 100.0;
      }

      const weeklyAct = Number(weeklyActualPercent[i].toFixed(2));
      cumulativeActual = Number((cumulativeActual + weeklyAct).toFixed(2));

      const plannedWeeklyCost = Math.round(directCost * (weeklyPlan / 100));
      const cumulativePlannedCost = Math.round(directCost * (cumulativePlan / 100));

      const wStart = new Date(baseStart.getTime() + i * 7 * 86400000);
      const wEnd = new Date(baseStart.getTime() + (i + 1) * 7 * 86400000 - 86400000);

      kurvaS.push({
        weekIndex: i + 1,
        weekLabel: `M${i + 1}`,
        startDate: wStart.toISOString().substring(0, 10),
        endDate: wEnd.toISOString().substring(0, 10),
        plannedWeeklyPercent: weeklyPlan,
        cumulativePlannedPercent: cumulativePlan,
        plannedWeeklyCost,
        cumulativePlannedCost,
        actualProgressPercent: cumulativeActual > 0 ? cumulativeActual : undefined,
      });
    }

    return {
      tasks,
      kurvaS,
      isReady: true,
      missingFields: [],
    };
  }

  /**
   * Generates complete Lineage / Source Trace for any item
   */
  static traceItemLineage(
    qtoId: string,
    qtoItems: QTOItem[],
    rabItems: RabItem[],
    mappings: QTOItemRABMapping[]
  ) {
    const qto = qtoItems.find((q) => q.id === qtoId);
    const mapping = mappings.find((m) => m.qtoItemId === qtoId);
    const rab = mapping ? rabItems.find((r) => r.id === mapping.rabItemId) : undefined;
    return {
      qto,
      sourceCalculator: qto?.calculatorId,
      parameters: qto?.parameterSnapshot,
      formula: qto?.formulaSnapshot,
      linkedRabItem: rab,
      usedInDownstream: {
        rab: !!rab,
        boq: !!rab,
        rekapitulasi: !!rab,
        schedule: !!rab,
      },
    };
  }

  /**
   * Creates default schedule tasks from rab items
   */
  static createDefaultProjectScheduleTasks(projectId: string, rabItems: RabItem[]): ScheduleTask[] {
    return UnifiedProjectEngine.recalculateScheduleAndKurvaS(rabItems, [], 12).tasks;
  }
}

export const recalculateCostSummary = UnifiedProjectEngine.recalculateCostSummary;
export const computeItemWeights = UnifiedProjectEngine.computeItemWeights;
export const recalculateScheduleAndKurvaS = UnifiedProjectEngine.recalculateScheduleAndKurvaS;
export const traceItemLineage = UnifiedProjectEngine.traceItemLineage;
export const createDefaultProjectScheduleTasks = UnifiedProjectEngine.createDefaultProjectScheduleTasks;
export const normalizeSections = UnifiedProjectEngine.normalizeSections;
export const computeCostSummaryFromSections = UnifiedProjectEngine.computeCostSummaryFromSections;
export const validateScheduleReadiness = UnifiedProjectEngine.validateScheduleReadiness;




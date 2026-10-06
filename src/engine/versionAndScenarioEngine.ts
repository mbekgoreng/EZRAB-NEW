import { RabItem, EstimateVersion, VersionDiffItem, EstimateScenario } from '../types';
import { formatCurrencyIDR } from '../calculations/decimalEngine';

export class VersionAndScenarioEngine {
  /**
   * Compares two snapshots of RabItem arrays and calculates the granular diff
   */
  public static compareVersions(
    baseItems: RabItem[],
    targetItems: RabItem[]
  ): {
    diffItems: VersionDiffItem[];
    addedCount: number;
    removedCount: number;
    qtyChangedCount: number;
    priceChangedCount: number;
    ahspChangedCount: number;
    baseTotal: number;
    targetTotal: number;
    totalDelta: number;
    percentageDelta: number;
  } {
    const baseMap = new Map<string, RabItem>();
    baseItems.forEach((item) => {
      // Index by id or code
      baseMap.set(item.id, item);
      if (item.code) baseMap.set(item.code, item);
    });

    const targetMap = new Map<string, RabItem>();
    targetItems.forEach((item) => {
      targetMap.set(item.id, item);
      if (item.code) targetMap.set(item.code, item);
    });

    const diffItems: VersionDiffItem[] = [];
    let addedCount = 0;
    let removedCount = 0;
    let qtyChangedCount = 0;
    let priceChangedCount = 0;
    let ahspChangedCount = 0;

    const processedTargetIds = new Set<string>();

    // 1. Scan target items against base items
    targetItems.forEach((tItem) => {
      processedTargetIds.add(tItem.id);
      const bItem = baseMap.get(tItem.id) || (tItem.code ? baseMap.get(tItem.code) : undefined);

      const tAmount = tItem.amount || tItem.totalPrice || tItem.volume * tItem.unitPrice || 0;

      if (!bItem) {
        // Item is Added
        addedCount++;
        diffItems.push({
          id: tItem.id,
          code: tItem.code || 'ITEM.NEW',
          description: tItem.description,
          category: tItem.category || 'Pekerjaan Lain',
          status: 'ADDED',
          targetVolume: tItem.volume,
          targetUnitPrice: tItem.unitPrice,
          targetAmount: tAmount,
          deltaAmount: tAmount,
          deltaPercent: 100,
          notes: 'Item baru ditambahkan pada versi ini',
        });
      } else {
        const bAmount = bItem.amount || bItem.totalPrice || bItem.volume * bItem.unitPrice || 0;
        const deltaAmt = tAmount - bAmount;
        const deltaPct = bAmount > 0 ? (deltaAmt / bAmount) * 100 : 0;

        const isQtyDiff = Math.abs((tItem.volume || 0) - (bItem.volume || 0)) > 0.001;
        const isPriceDiff = Math.abs((tItem.unitPrice || 0) - (bItem.unitPrice || 0)) > 1;
        const isAhspDiff = (tItem.ahspCode || '') !== (bItem.ahspCode || '') || (tItem.unit || '') !== (bItem.unit || '');

        let status: VersionDiffItem['status'] = 'UNCHANGED';
        if (isQtyDiff && isPriceDiff) {
          status = 'PRICE_CHANGED';
          priceChangedCount++;
          qtyChangedCount++;
        } else if (isQtyDiff) {
          status = 'QTY_CHANGED';
          qtyChangedCount++;
        } else if (isPriceDiff) {
          status = 'PRICE_CHANGED';
          priceChangedCount++;
        } else if (isAhspDiff) {
          status = 'AHSP_CHANGED';
          ahspChangedCount++;
        }

        diffItems.push({
          id: tItem.id,
          code: tItem.code || bItem.code || 'ITEM',
          description: tItem.description,
          category: tItem.category || bItem.category || 'Pekerjaan',
          status,
          baseVolume: bItem.volume,
          targetVolume: tItem.volume,
          baseUnitPrice: bItem.unitPrice,
          targetUnitPrice: tItem.unitPrice,
          baseAmount: bAmount,
          targetAmount: tAmount,
          deltaAmount: deltaAmt,
          deltaPercent: deltaPct,
        });
      }
    });

    // 2. Scan for removed items (in base but not in target)
    baseItems.forEach((bItem) => {
      const existsInTarget = targetMap.has(bItem.id) || (bItem.code ? targetMap.has(bItem.code) : false);
      if (!existsInTarget) {
        removedCount++;
        const bAmount = bItem.amount || bItem.totalPrice || bItem.volume * bItem.unitPrice || 0;
        diffItems.push({
          id: bItem.id,
          code: bItem.code || 'ITEM.DEL',
          description: bItem.description,
          category: bItem.category || 'Pekerjaan',
          status: 'REMOVED',
          baseVolume: bItem.volume,
          baseUnitPrice: bItem.unitPrice,
          baseAmount: bAmount,
          deltaAmount: -bAmount,
          deltaPercent: -100,
          notes: 'Item dihapus pada versi target',
        });
      }
    });

    const baseTotal = baseItems.reduce((acc, i) => acc + (i.amount || i.totalPrice || i.volume * i.unitPrice || 0), 0);
    const targetTotal = targetItems.reduce((acc, i) => acc + (i.amount || i.totalPrice || i.volume * i.unitPrice || 0), 0);
    const totalDelta = targetTotal - baseTotal;
    const percentageDelta = baseTotal > 0 ? (totalDelta / baseTotal) * 100 : 0;

    return {
      diffItems,
      addedCount,
      removedCount,
      qtyChangedCount,
      priceChangedCount,
      ahspChangedCount,
      baseTotal,
      targetTotal,
      totalDelta,
      percentageDelta,
    };
  }

  /**
   * Generates default Value Engineering Scenarios based on baseline items
   */
  public static generateDefaultScenarios(
    projectId: string,
    baselineItems: RabItem[]
  ): EstimateScenario[] {
    const baselineDirect = baselineItems.reduce((acc, i) => acc + (i.amount || i.totalPrice || i.volume * i.unitPrice || 0), 0);
    const baselineTotal = Math.round(baselineDirect * 1.15); // +5% overhead +10% profit

    // 1. BASELINE SCENARIO
    const baselineScenario: EstimateScenario = {
      id: `scen-${projectId}-baseline`,
      projectId,
      code: 'BASELINE',
      name: 'Baseline (Rencana Anggaran Kontrak Acuan)',
      description: 'Estimasi standar acuan awal yang telah disetujui tanpa modifikasi spesifikasi atau diskon.',
      targetObjective: 'Menjaga kepatuhan 100% terhadap spesifikasi teknis dan RAB awal',
      isBaseline: true,
      overheadPercent: 5,
      profitPercent: 10,
      items: baselineItems.map((it) => ({ ...it })),
      totalDirectCost: baselineDirect,
      totalRab: baselineTotal,
      differenceFromBaseline: 0,
      percentageFromBaseline: 0,
      updatedAt: new Date().toISOString(),
    };

    // 2. SCENARIO A: VALUE ENGINEERING MATERIAL (-6.5%)
    // Substitutes ready mix additives, eco-cement, and standardized rebar lengths
    const scenarioAItems: RabItem[] = baselineItems.map((item) => {
      const desc = item.description.toLowerCase();
      let factor = 1.0;
      if (desc.includes('besi') || desc.includes('pembesian')) factor = 0.94; // 6% rebar optimization
      else if (desc.includes('beton') || desc.includes('cor')) factor = 0.93; // 7% batching plant direct
      else if (desc.includes('keramik') || desc.includes('dinding')) factor = 0.95; // 5% bulk distributor
      const newPrice = Math.round(item.unitPrice * factor);
      const newAmount = Math.round(item.volume * newPrice);
      return {
        ...item,
        unitPrice: newPrice,
        amount: newAmount,
        totalPrice: newAmount,
      };
    });
    const scenADirect = scenarioAItems.reduce((acc, i) => acc + (i.amount || i.totalPrice || 0), 0);
    const scenATotal = Math.round(scenADirect * 1.15);

    const scenarioA: EstimateScenario = {
      id: `scen-${projectId}-a`,
      projectId,
      code: 'SCENARIO_A',
      name: 'Skenario A — Value Engineering Material & Vendor Langsung',
      description: 'Mengoptimalkan pengadaan material struktural langsung dari produsen semen & pabrikator besi (potongan volume).',
      targetObjective: 'Efisiensi biaya material ~6.5% dengan mutu SNI tetap terjaga',
      isBaseline: false,
      overheadPercent: 5,
      profitPercent: 10,
      items: scenarioAItems,
      totalDirectCost: scenADirect,
      totalRab: scenATotal,
      differenceFromBaseline: scenATotal - baselineTotal,
      percentageFromBaseline: baselineTotal > 0 ? ((scenATotal - baselineTotal) / baselineTotal) * 100 : 0,
      updatedAt: new Date().toISOString(),
    };

    // 3. SCENARIO B: METODE KERJA & ALAT BERAT MODERN (-10.2%)
    // Uses precast modular concrete & high efficiency earthworks
    const scenarioBItems: RabItem[] = baselineItems.map((item) => {
      const desc = item.description.toLowerCase();
      let factor = 1.0;
      if (desc.includes('tanah') || desc.includes('galian')) factor = 0.82; // 18% excavation machinery
      else if (desc.includes('struktur') || desc.includes('balok') || desc.includes('kolom')) factor = 0.91; // 9% precast efficiency
      else if (desc.includes('plesteran') || desc.includes('acian')) factor = 0.88; // 12% spray mortar
      const newPrice = Math.round(item.unitPrice * factor);
      const newAmount = Math.round(item.volume * newPrice);
      return {
        ...item,
        unitPrice: newPrice,
        amount: newAmount,
        totalPrice: newAmount,
      };
    });
    const scenBDirect = scenarioBItems.reduce((acc, i) => acc + (i.amount || i.totalPrice || 0), 0);
    const scenBTotal = Math.round(scenBDirect * 1.14); // 4% overhead 10% profit

    const scenarioB: EstimateScenario = {
      id: `scen-${projectId}-b`,
      projectId,
      code: 'SCENARIO_B',
      name: 'Skenario B — Efisiensi Metode Kerja & Alat Berat Modern',
      description: 'Penerapan precast modular, spray mortar, dan percepatan galian dengan unit excavator kapasitas optimal.',
      targetObjective: 'Penghematan 10.2% dan percepatan durasi pelaksanaan proyek',
      isBaseline: false,
      overheadPercent: 4,
      profitPercent: 10,
      items: scenarioBItems,
      totalDirectCost: scenBDirect,
      totalRab: scenBTotal,
      differenceFromBaseline: scenBTotal - baselineTotal,
      percentageFromBaseline: baselineTotal > 0 ? ((scenBTotal - baselineTotal) / baselineTotal) * 100 : 0,
      updatedAt: new Date().toISOString(),
    };

    // 4. SCENARIO C: STRATEGI TENDER KOMPETITIF (-13.5%)
    // High volume bidding with streamlined overhead
    const scenarioCItems: RabItem[] = baselineItems.map((item) => {
      const factor = 0.90; // Flat 10% direct negotiation
      const newPrice = Math.round(item.unitPrice * factor);
      const newAmount = Math.round(item.volume * newPrice);
      return {
        ...item,
        unitPrice: newPrice,
        amount: newAmount,
        totalPrice: newAmount,
      };
    });
    const scenCDirect = scenarioCItems.reduce((acc, i) => acc + (i.amount || i.totalPrice || 0), 0);
    const scenCTotal = Math.round(scenCDirect * 1.11); // 3% overhead 8% profit

    const scenarioC: EstimateScenario = {
      id: `scen-${projectId}-c`,
      projectId,
      code: 'SCENARIO_C',
      name: 'Skenario C — Strategi Penawaran Tender Kompetitif',
      description: 'Penyesuaian margin laba kompetitif (8%) dan negosiasi paket borongan borong kerja terpadu.',
      targetObjective: 'Maksimalisasi peluang menang tender dengan harga terbaik',
      isBaseline: false,
      overheadPercent: 3,
      profitPercent: 8,
      items: scenarioCItems,
      totalDirectCost: scenCDirect,
      totalRab: scenCTotal,
      differenceFromBaseline: scenCTotal - baselineTotal,
      percentageFromBaseline: baselineTotal > 0 ? ((scenCTotal - baselineTotal) / baselineTotal) * 100 : 0,
      updatedAt: new Date().toISOString(),
    };

    return [baselineScenario, scenarioA, scenarioB, scenarioC];
  }

  /**
   * Calculates category-wise variance between Baseline and a Target Scenario
   */
  public static calculateCategoryVariance(
    baselineItems: RabItem[],
    scenarioItems: RabItem[]
  ): {
    category: string;
    baselineAmount: number;
    scenarioAmount: number;
    deltaAmount: number;
    deltaPercent: number;
  }[] {
    const baseCatMap: Record<string, number> = {};
    const scenCatMap: Record<string, number> = {};

    baselineItems.forEach((it) => {
      const cat = it.category || 'Pekerjaan Lain-lain';
      baseCatMap[cat] = (baseCatMap[cat] || 0) + (it.amount || it.totalPrice || it.volume * it.unitPrice || 0);
    });

    scenarioItems.forEach((it) => {
      const cat = it.category || 'Pekerjaan Lain-lain';
      scenCatMap[cat] = (scenCatMap[cat] || 0) + (it.amount || it.totalPrice || it.volume * it.unitPrice || 0);
    });

    const allCategories = Array.from(new Set([...Object.keys(baseCatMap), ...Object.keys(scenCatMap)]));

    return allCategories.map((cat) => {
      const bAmt = baseCatMap[cat] || 0;
      const sAmt = scenCatMap[cat] || 0;
      const delta = sAmt - bAmt;
      const pct = bAmt > 0 ? (delta / bAmt) * 100 : 0;
      return {
        category: cat,
        baselineAmount: bAmt,
        scenarioAmount: sAmt,
        deltaAmount: delta,
        deltaPercent: pct,
      };
    });
  }
}

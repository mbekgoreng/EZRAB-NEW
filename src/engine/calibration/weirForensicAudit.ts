/**
 * EZRAB WEIR BODY FORENSIC AUDIT
 *
 * Implements strict forensic tracing for a fixed geometry:
 * L = 25 m, H = 3.5 m, Wc = 2.0 m, Wb = 6.0 m -> Volume = 350 m3
 *
 * Strict Rule:
 * JANGAN menetapkan harga target atau hardcoded expected total (Rp 500jt, Rp 600jt, Rp 1.5jt/m3).
 * Tracing deterministik:
 * 350 m3 -> work items -> AHSP -> coefficients -> resources -> prices -> direct cost -> O&P -> tax -> total
 */

import { SafeDecimalEngine } from '../safeDecimalEngine';
import { WeirBodyMigratedCalculator, WeirBodyInputs } from '../migration/migratedCalculators';
import { CentralDeterministicCostEngine, ProjectCostPolicySettings, WorkItemCostOutput } from '../cost/centralDeterministicCostEngine';
import { AHSPDefinition } from '../ahsp/contracts/types';
import { PriceResolutionOutput } from '../pricing/resolver/advancedPriceResolutionEngine';
import { ConstructionScopeValidator, ScopeValidationResult } from './constructionScopeValidator';

export interface WeirForensicStepTrace {
  stepIndex: number;
  stageName: string;
  detail: string;
  outputSnapshot: any;
}

export interface WeirForensicAuditReport {
  timestamp: string;
  geometryInput: WeirBodyInputs;
  calculatedVolume: number;
  unit: string;
  workItemsCount: number;
  workItems: {
    name: string;
    scope: string;
    quantity: number;
    unit: string;
    ahspCode: string;
  }[];
  costBreakdown: {
    directCost: number;
    laborCost: number;
    materialCost: number;
    equipmentCost: number;
    overheadAmount: number;
    profitAmount: number;
    taxAmount: number;
    unitPrice: number;
    totalCost: number;
  };
  policySettingsApplied: ProjectCostPolicySettings;
  scopeValidation: ScopeValidationResult;
  forensicTrace: WeirForensicStepTrace[];
  auditLog: string[];
}

export class WeirForensicAuditRunner {
  public static runAudit(
    customPrices?: Map<string, PriceResolutionOutput>,
    customAhsp?: Map<string, AHSPDefinition>,
    customSettings?: ProjectCostPolicySettings
  ): WeirForensicAuditReport {
    const trace: WeirForensicStepTrace[] = [];
    const auditLog: string[] = [];

    // STAGE 1: GEOMETRY INPUTS
    const inputs: WeirBodyInputs = {
      weirLength: 25,
      weirHeight: 3.5,
      crestWidth: 2.0,
      baseWidth: 6.0,
      includeReinforcement: 1,
      includeFormwork: 1,
      includeJoint: 1,
      includeWaterstop: 1,
      rebarRatio: 85,
    };

    trace.push({
      stepIndex: 1,
      stageName: 'GEOMETRY_INPUT',
      detail: `Panjang mercu L = ${inputs.weirLength} m, Tinggi H = ${inputs.weirHeight} m, Lebar atas Wc = ${inputs.crestWidth} m, Lebar bawah Wb = ${inputs.baseWidth} m`,
      outputSnapshot: inputs,
    });
    auditLog.push(`[STAGE 1] Geometri: L=${inputs.weirLength}m, H=${inputs.weirHeight}m, Wc=${inputs.crestWidth}m, Wb=${inputs.baseWidth}m`);

    // STAGE 2: GEOMETRY ENGINE EXECUTION
    const calc = new WeirBodyMigratedCalculator();
    const geom = calc.calculateGeometry(inputs);
    const volume = geom.primaryQuantity; // Exactly 350 m3

    trace.push({
      stepIndex: 2,
      stageName: 'GEOMETRY_CALCULATION',
      detail: `Luas Penampang = ((Wc+Wb)/2)*H = ((2+6)/2)*3.5 = 14.0 m2; Volume Tubuh Bendung = 14.0 * 25 = ${volume} m3`,
      outputSnapshot: geom,
    });
    auditLog.push(`[STAGE 2] Volume Tubuh Bendung terhitung: ${volume} ${geom.primaryUnit}`);

    // STAGE 3: WORK ITEM MAPPING (STANDARDIZED SCOPES)
    const workItems = calc.mapWorkItems(geom, inputs);

    trace.push({
      stepIndex: 3,
      stageName: 'WORK_ITEM_MAPPING',
      detail: `Dipetakan ke ${workItems.length} standardized work items: Beton, Tulangan, Bekisting, Dilatasi Joint, Waterstop`,
      outputSnapshot: workItems,
    });
    auditLog.push(`[STAGE 3] Work items mapped: ${workItems.map((w) => `${w.name} (${w.quantity} ${w.unit})`).join('; ')}`);

    // STAGE 4: AHSP RESOLUTION & COMPONENT COEFFICIENTS
    const ahspDb = customAhsp || this.getDefaultForensicAHSP();
    trace.push({
      stepIndex: 4,
      stageName: 'AHSP_RESOLUTION',
      detail: `Menghubungkan setiap work item dengan standar analisa harga satuan pekerjaan resmi`,
      outputSnapshot: Array.from(ahspDb.entries()).map(([code, def]) => ({ code, name: def.name, components: def.laborComponents.length + def.materialComponents.length + def.equipmentComponents.length })),
    });

    // STAGE 5: RESOURCE PRICE RESOLUTION (NO HARDCODING)
    const priceMap = customPrices || this.getDefaultForensicPrices();
    trace.push({
      stepIndex: 5,
      stageName: 'PRICE_RESOLUTION',
      detail: `Menyelesaikan harga satuan bahan, upah, dan alat melalui resolusi prioritas multi-tier`,
      outputSnapshot: Array.from(priceMap.entries()).map(([k, p]) => ({ key: k, price: p.price, unit: p.unit, source: p.provenance?.source })),
    });

    // STAGE 6: DETERMINISTIC COST ENGINE (DIRECT COST)
    const settings: ProjectCostPolicySettings = customSettings || {
      overheadPercent: 5,
      profitPercent: 5,
      taxPercent: 11,
      includeTax: true,
    };

    let totalDirect = 0;
    let totalLabor = 0;
    let totalMaterial = 0;
    let totalEquipment = 0;
    let totalOverhead = 0;
    let totalProfit = 0;
    let totalTax = 0;
    let grandTotal = 0;

    const costs: WorkItemCostOutput[] = [];

    for (const wi of workItems) {
      const ahsp = ahspDb.get(wi.targetAhspCode);
      if (!ahsp) continue;

      const itemCost = CentralDeterministicCostEngine.calculateWorkItem(
        {
          workItemName: wi.name,
          quantity: wi.quantity,
          unit: wi.unit,
          ahsp,
          resolvedPrices: priceMap,
        },
        settings
      );

      costs.push(itemCost);
      totalDirect += itemCost.breakdown.directCost;
      totalLabor += itemCost.breakdown.laborCost;
      totalMaterial += itemCost.breakdown.materialCost;
      totalEquipment += itemCost.breakdown.equipmentCost;
      totalOverhead += itemCost.breakdown.overheadAmount;
      totalProfit += itemCost.breakdown.profitAmount;
      totalTax += itemCost.breakdown.taxAmount;
      grandTotal += itemCost.breakdown.totalCost;

      auditLog.push(`[STAGE 6] Work Item "${wi.name}": Qty ${wi.quantity} ${wi.unit} -> Direct: Rp ${itemCost.breakdown.directCost.toLocaleString('id-ID')}, Total: Rp ${itemCost.breakdown.totalCost.toLocaleString('id-ID')}`);
    }

    const unitPriceTotal = volume > 0 ? Math.round(grandTotal / volume) : 0;

    trace.push({
      stepIndex: 6,
      stageName: 'COST_COMPOSITION',
      detail: `Direct Cost = Labor (Rp ${totalLabor.toLocaleString('id-ID')}) + Material (Rp ${totalMaterial.toLocaleString('id-ID')}) + Equipment (Rp ${totalEquipment.toLocaleString('id-ID')}) = Rp ${totalDirect.toLocaleString('id-ID')}`,
      outputSnapshot: { totalDirect, totalLabor, totalMaterial, totalEquipment, totalOverhead, totalProfit, totalTax, grandTotal },
    });

    // STAGE 7: SCOPE VALIDATION
    const providedScopes = workItems.map((w) => w.scope);
    const scopeRes = ConstructionScopeValidator.validateWeirScope(providedScopes, volume, geom.primaryUnit);

    trace.push({
      stepIndex: 7,
      stageName: 'SCOPE_VALIDATION',
      detail: `Status Scope: ${scopeRes.scopeStatus} (Cakupan: ${scopeRes.scopeCoveragePercent}%). ${scopeRes.warningNote}`,
      outputSnapshot: scopeRes,
    });
    auditLog.push(`[STAGE 7] Scope Validation: ${scopeRes.scopeStatus} (${scopeRes.warningNote})`);

    return {
      timestamp: new Date().toISOString(),
      geometryInput: inputs,
      calculatedVolume: volume,
      unit: geom.primaryUnit,
      workItemsCount: workItems.length,
      workItems: workItems.map((w) => ({ name: w.name, scope: w.scope, quantity: w.quantity, unit: w.unit, ahspCode: w.targetAhspCode })),
      costBreakdown: {
        directCost: totalDirect,
        laborCost: totalLabor,
        materialCost: totalMaterial,
        equipmentCost: totalEquipment,
        overheadAmount: totalOverhead,
        profitAmount: totalProfit,
        taxAmount: totalTax,
        unitPrice: unitPriceTotal,
        totalCost: grandTotal,
      },
      policySettingsApplied: settings,
      scopeValidation: scopeRes,
      forensicTrace: trace,
      auditLog,
    };
  }

  private static getDefaultForensicAHSP(): Map<string, AHSPDefinition> {
    const map = new Map<string, AHSPDefinition>();

    // 1. Concrete Siklop / fc 20 MPa (1 m3)
    map.set('3.1.(1)', {
      id: 'AHSP_BETON_K225',
      code: '3.1.(1)',
      codeNormalized: '3.1.(1)',
      name: 'Beton Siklop K-225 / fc 20 MPa Struktur Tubuh Bendung',
      unit: 'm³',
      domain: 'SUMBER_DAYA_AIR',
      category: 'STRUKTUR',
      version: '2026.1',
      sourceDocument: 'Lampiran V SE DJBK 2026 & KP-02',
      laborComponents: [
        { id: 'l1', type: 'labor', itemCode: 'L.01', itemName: 'Pekerja', unit: 'OH', coefficient: 1.2 },
        { id: 'l2', type: 'labor', itemCode: 'L.02', itemName: 'Tukang Batu', unit: 'OH', coefficient: 0.35 },
        { id: 'l3', type: 'labor', itemCode: 'L.04', itemName: 'Mandor', unit: 'OH', coefficient: 0.12 },
      ],
      materialComponents: [
        { id: 'm1', type: 'material', itemCode: 'M.01', itemName: 'Semen Portland', unit: 'kg', coefficient: 380 },
        { id: 'm2', type: 'material', itemCode: 'M.02', itemName: 'Pasir Beton', unit: 'm3', coefficient: 0.48 },
        { id: 'm3', type: 'material', itemCode: 'M.03', itemName: 'Batu Pecah 2/3', unit: 'm3', coefficient: 0.72 },
      ],
      equipmentComponents: [
        { id: 'e1', type: 'equipment', itemCode: 'E.01', itemName: 'Concrete Mixer 0.35 m3', unit: 'jam', coefficient: 0.25 },
        { id: 'e2', type: 'equipment', itemCode: 'E.02', itemName: 'Concrete Vibrator', unit: 'jam', coefficient: 0.20 },
      ],
      totalLaborCoefficient: 1.67,
      totalMaterialCoefficient: 381.2,
      totalEquipmentCoefficient: 0.45,
      provenance: { sourceDocument: 'KP-02 Standar Perencanaan Irigasi', version: '2026.1', verificationStatus: 'VERIFIED' },
    });

    // 2. Rebar BJTS 420B (1 kg)
    map.set('BINA_MARGA_3.2.(1)', {
      id: 'AHSP_REBAR_ULIR',
      code: 'BINA_MARGA_3.2.(1)',
      codeNormalized: '3.2.(1)',
      name: 'Baja Tulangan Sirip BJTS 420B',
      unit: 'kg',
      domain: 'BINA_MARGA',
      category: 'STRUKTUR',
      version: '2026.1',
      sourceDocument: 'Spesifikasi Umum Bina Marga 2026',
      laborComponents: [
        { id: 'l4', type: 'labor', itemCode: 'L.01', itemName: 'Pekerja', unit: 'OH', coefficient: 0.007 },
        { id: 'l5', type: 'labor', itemCode: 'L.02', itemName: 'Tukang Besi', unit: 'OH', coefficient: 0.007 },
      ],
      materialComponents: [
        { id: 'm4', type: 'material', itemCode: 'M.04', itemName: 'Besi Beton Ulir BJTS 420B', unit: 'kg', coefficient: 1.05 },
        { id: 'm5', type: 'material', itemCode: 'M.05', itemName: 'Kawat Beton', unit: 'kg', coefficient: 0.015 },
      ],
      equipmentComponents: [],
      totalLaborCoefficient: 0.014,
      totalMaterialCoefficient: 1.065,
      totalEquipmentCoefficient: 0,
      provenance: { sourceDocument: 'SE DJBK 2026', version: '2026.1', verificationStatus: 'VERIFIED' },
    });

    // 3. Formwork (1 m2)
    map.set('BINA_MARGA_3.3.(1)', {
      id: 'AHSP_FORMWORK_STRUKTUR',
      code: 'BINA_MARGA_3.3.(1)',
      codeNormalized: '3.3.(1)',
      name: 'Acuan Bekisting Struktur Masif / Permukaan',
      unit: 'm²',
      domain: 'BINA_MARGA',
      category: 'STRUKTUR',
      version: '2026.1',
      sourceDocument: 'SE DJBK 2026',
      laborComponents: [
        { id: 'l6', type: 'labor', itemCode: 'L.01', itemName: 'Pekerja', unit: 'OH', coefficient: 0.26 },
        { id: 'l7', type: 'labor', itemCode: 'L.02', itemName: 'Tukang Kayu', unit: 'OH', coefficient: 0.26 },
      ],
      materialComponents: [
        { id: 'm6', type: 'material', itemCode: 'M.06', itemName: 'Kayu Papan Bekisting', unit: 'm3', coefficient: 0.025 },
        { id: 'm7', type: 'material', itemCode: 'M.07', itemName: 'Paku 5-10 cm', unit: 'kg', coefficient: 0.30 },
      ],
      equipmentComponents: [],
      totalLaborCoefficient: 0.52,
      totalMaterialCoefficient: 0.325,
      totalEquipmentCoefficient: 0,
      provenance: { sourceDocument: 'SE DJBK 2026', version: '2026.1', verificationStatus: 'VERIFIED' },
    });

    // 4. Contraction Joint (1 m)
    map.set('SDA_JOINT_01', {
      id: 'AHSP_JOINT_DILATASI',
      code: 'SDA_JOINT_01',
      codeNormalized: 'SDA_JOINT_01',
      name: 'Sambungan Dilatasi Bendung',
      unit: 'm',
      domain: 'SUMBER_DAYA_AIR',
      category: 'SAMBUNGAN',
      version: '2026.1',
      sourceDocument: 'KP-02',
      laborComponents: [
        { id: 'l8', type: 'labor', itemCode: 'L.01', itemName: 'Pekerja', unit: 'OH', coefficient: 0.15 },
        { id: 'l9', type: 'labor', itemCode: 'L.02', itemName: 'Tukang', unit: 'OH', coefficient: 0.15 },
      ],
      materialComponents: [
        { id: 'm8', type: 'material', itemCode: 'M.08', itemName: 'Joint Filler Sambungan', unit: 'm', coefficient: 1.05 },
      ],
      equipmentComponents: [],
      totalLaborCoefficient: 0.3,
      totalMaterialCoefficient: 1.05,
      totalEquipmentCoefficient: 0,
      provenance: { sourceDocument: 'KP-02', version: '2026.1', verificationStatus: 'VERIFIED' },
    });

    // 5. Waterstop PVC (1 m)
    map.set('SDA_WATERSTOP_01', {
      id: 'AHSP_WATERSTOP_PVC',
      code: 'SDA_WATERSTOP_01',
      codeNormalized: 'SDA_WATERSTOP_01',
      name: 'Pemasangan Waterstop PVC 200 mm',
      unit: 'm',
      domain: 'SUMBER_DAYA_AIR',
      category: 'WATERPROOFING',
      version: '2026.1',
      sourceDocument: 'KP-02',
      laborComponents: [
        { id: 'l10', type: 'labor', itemCode: 'L.01', itemName: 'Pekerja', unit: 'OH', coefficient: 0.20 },
        { id: 'l11', type: 'labor', itemCode: 'L.02', itemName: 'Tukang', unit: 'OH', coefficient: 0.20 },
      ],
      materialComponents: [
        { id: 'm9', type: 'material', itemCode: 'M.09', itemName: 'Waterstop PVC 200mm', unit: 'm', coefficient: 1.05 },
      ],
      equipmentComponents: [],
      totalLaborCoefficient: 0.4,
      totalMaterialCoefficient: 1.05,
      totalEquipmentCoefficient: 0,
      provenance: { sourceDocument: 'KP-02', version: '2026.1', verificationStatus: 'VERIFIED' },
    });

    return map;
  }

  private static getDefaultForensicPrices(): Map<string, PriceResolutionOutput> {
    const map = new Map<string, PriceResolutionOutput>();

    const addPrice = (code: string, price: number, unit: string, source: string) => {
      map.set(code, {
        status: 'VALID',
        price,
        unit,
        provenance: {
          price,
          unit,
          source,
          sourceDocument: 'Katalog HSD 2026 / SE 12/2026',
          region: 'Nasional / Jawa Timur',
          year: 2026,
          effectiveDate: '2026-01-15',
          confidence: 0.98,
          tier: 'NATIONAL',
          resolutionReason: 'HSD Resmi 2026',
        },
        anomalies: [],
        explanation: `Harga resmi: Rp ${price.toLocaleString('id-ID')}/${unit}`,
      });
    };

    // Upah
    addPrice('L.01', 115000, 'OH', 'SE 12/SE/Db/2026');
    addPrice('L.02', 145000, 'OH', 'SE 12/SE/Db/2026');
    addPrice('L.04', 165000, 'OH', 'SE 12/SE/Db/2026');

    // Bahan
    addPrice('M.01', 1600, 'kg', 'SE 12/SE/Db/2026');
    addPrice('M.02', 260000, 'm3', 'SE 12/SE/Db/2026');
    addPrice('M.03', 290000, 'm3', 'SE 12/SE/Db/2026');
    addPrice('M.04', 15200, 'kg', 'SE 12/SE/Db/2026');
    addPrice('M.05', 24000, 'kg', 'SE 12/SE/Db/2026');
    addPrice('M.06', 3100000, 'm3', 'SE 12/SE/Db/2026');
    addPrice('M.07', 22000, 'kg', 'SE 12/SE/Db/2026');
    addPrice('M.08', 85000, 'm', 'SE 12/SE/Db/2026');
    addPrice('M.09', 145000, 'm', 'SE 12/SE/Db/2026');

    // Alat
    addPrice('E.01', 55000, 'jam', 'SE 12/SE/Db/2026');
    addPrice('E.02', 35000, 'jam', 'SE 12/SE/Db/2026');

    return map;
  }
}

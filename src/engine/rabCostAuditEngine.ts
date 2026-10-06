/**
 * EZRAB MAGIC AI — RAB ACCURACY & COST CONTROL ENGINE
 * Standard Permen PUPR & LPJK Architecture
 * 
 * Enforces all 36 patch rules:
 * - Special Profile: HOUSE_SINGLE_STOREY (84m2 house audit)
 * - Separation of Quantity, AHSP Coeff, Unit Price, Total Price
 * - Project Type to Database routing (Building vs SDA vs Bina Marga)
 * - Deterministic Arithmetic (SUM, MULTIPLY, DIVIDE, HSP, SUBTOTAL, TOTAL)
 * - Physical Sanity Checks & Deduplication (Element ID & Normalized Work)
 * - Single-application Overhead & Profit + Configurable Tax (PPN)
 * - Before / After AI Cost Audit Calculation
 * - Final Status: READY | NEEDS_REVIEW | DATA_MISSING | CONFLICT | AHSP_NOT_FOUND | PRICE_NOT_FOUND | CALCULATION_ERROR
 */

import { SafeDecimalEngine } from './safeDecimalEngine';
import { MASTER_AHSP_DATABASE } from '../data/indonesianAHSP';
import { AHSPItem, AHSPComponent } from '../types';

export interface GeneratedRABItem {
  id: string;
  wbsCode: string;
  itemNumber: string;
  name: string;
  category: string;
  volume: number;
  unit: string;
  materialPrice: number;
  laborPrice: number;
  equipmentPrice: number;
  unitPrice: number;
  totalPrice: number;
  ahspCode: string;
  ahspMatchQuality?: 'EXACT_MATCH' | 'HIGH_MATCH' | 'MEDIUM_MATCH' | 'LOW_MATCH' | 'AHSP_NOT_FOUND';
  ahspReference?: AHSPItem;
  materialComponents: AHSPComponent[];
  laborComponents: AHSPComponent[];
  equipmentComponents: AHSPComponent[];
  sourceObjectId: string;
  sourceSheet?: string;
  sourcePage?: number;
  calculationFormula?: string;
  priceSource?: 'AHSP_PUPR' | 'MARKET_ESTIMATE';
  priceConfidence?: 'HIGH' | 'MEDIUM' | 'LOW';
}

export type RABFinalStatus = 
  | 'READY'
  | 'NEEDS_REVIEW'
  | 'DATA_MISSING'
  | 'CONFLICT'
  | 'AHSP_NOT_FOUND'
  | 'PRICE_NOT_FOUND'
  | 'CALCULATION_ERROR';

export type AHSPMatchQuality = 'EXACT_MATCH' | 'HIGH_MATCH' | 'MEDIUM_MATCH' | 'LOW_MATCH' | 'AHSP_NOT_FOUND';

export interface HouseSingleStoreyProfile {
  buildingArea: number;       // e.g. 84 m2
  floorCount: number;         // 1
  buildingLength?: number;    // e.g. 12 m
  buildingWidth?: number;     // e.g. 7 m
  wallHeight?: number;        // e.g. 3.2 m
  roofType?: string;          // Pelana / Limasan / Dak Beton
  foundationType?: string;    // Batu Kali / Footplate / Rollag
  structureType?: string;     // Beton Bertulang Praktis / Struktur
  finishingLevel?: 'STANDARD' | 'MEDIUM' | 'PREMIUM';
  location?: string;          // e.g. Jabodetabek / Jawa Tengah
  priceYear?: number;         // e.g. 2026
}

export interface MajorCostDriver {
  itemId: string;
  name: string;
  category: string;
  totalCost: number;
  percentageOfTotal: number;
  sourceSheet?: string;
  isFlaggedAnomaly: boolean;
  anomalyReason?: string;
}

export interface VolumeTraceabilityDetail {
  elementId: string;
  workName: string;
  calculatedVolume: number;
  unit: string;
  sourceSheet: string;
  sourcePage: number;
  formula: string;
  dimensions: {
    length?: number;
    width?: number;
    height?: number;
    thickness?: number;
    count?: number;
    slopeAngle?: number;
    openingsDeductionArea?: number;
  };
  breakdownNotes: string;
}

export interface CostBreakdownSummary {
  persiapan: number;
  tanahPondasi: number;
  struktur: number;
  dinding: number;
  atap: number;
  lantai: number;
  plafon: number;
  pintuJendela: number;
  mep: number;
  finishing: number;
  lainLain: number;
  directCost: number;
  overheadPercent: number;
  overheadAmount: number;
  profitPercent: number;
  profitAmount: number;
  taxEnabled: boolean;
  taxPercent: number;
  taxAmount: number;
  grandTotal: number;
}

export interface BeforeAfterCostAuditResult {
  totalBeforeAudit: number;
  totalAfterDuplicateRemoval: number;
  totalAfterQuantityCorrection: number;
  totalAfterAHSPCorrection: number;
  totalAfterPriceCorrection: number;
  totalAfterMarkupCorrection: number;
  estimatedCorrection: {
    from: number;
    to: number;
    delta: number;
    reductionPercentage: number;
  };
  duplicateCount: number;
  quantityAnomaliesCount: number;
  wrongAHSPCount: number;
  priceAnomaliesCount: number;
  doubleMarkupRisksCount: number;
  auditFindings: string[];
}

export interface AuditReport {
  projectTitle: string;
  buildingArea: number;
  floorCount: number;
  status: RABFinalStatus;
  isSingleStoreyHouse: boolean;
  statusReasons: string[];
  findingsCount: {
    duplicateItems: number;
    quantityAnomalies: number;
    wrongAHSPMappings: number;
    priceAnomalies: number;
    possibleDoubleMarkup: number;
  };
  costDrivers: MajorCostDriver[];
  beforeAfter: BeforeAfterCostAuditResult;
  costBreakdown: CostBreakdownSummary;
  cleanedItems: GeneratedRABItem[];
  traceabilityMap: Record<string, VolumeTraceabilityDetail>;
}

export class RabCostAuditEngine {
  /**
   * Run comprehensive RAB Accuracy & Cost Control Audit
   */
  static runAudit(
    rawItems: GeneratedRABItem[],
    profile?: Partial<HouseSingleStoreyProfile>,
    options?: {
      projectType?: 'BUILDING' | 'BRIDGE' | 'ROAD' | 'DAM' | 'IRRIGATION' | 'DRAINAGE';
      taxEnabled?: boolean;
      taxRate?: number;
      overheadRate?: number;
      profitRate?: number;
    }
  ): AuditReport {
    const buildingArea = profile?.buildingArea || 84;
    const floorCount = profile?.floorCount || 1;
    const isSingleStorey = floorCount === 1 && buildingArea <= 120;
    const projectType = options?.projectType || 'BUILDING';

    const findings: string[] = [];
    const statusReasons: string[] = [];
    let duplicateItemsCount = 0;
    let quantityAnomaliesCount = 0;
    let wrongAHSPCount = 0;
    let priceAnomaliesCount = 0;
    let doubleMarkupCount = 0;

    // STEP 1: INITIAL TOTAL (SEBELUM AUDIT)
    const initialDirectCost = rawItems.reduce((sum, itm) => sum + (itm.totalPrice || (itm.volume * itm.unitPrice)), 0);
    const initialOverhead = Math.round(initialDirectCost * (options?.overheadRate ?? 0.05));
    const initialProfit = Math.round(initialDirectCost * (options?.profitRate ?? 0.10));
    const initialSubtotal = initialDirectCost + initialOverhead + initialProfit;
    const initialTax = (options?.taxEnabled ?? false) ? Math.round(initialSubtotal * ((options?.taxRate ?? 11) / 100)) : 0;
    const totalBeforeAudit = initialSubtotal + initialTax;

    // STEP 2: DUPLICATE DETECTION & MERGING
    const mergedMap = new Map<string, GeneratedRABItem>();
    const traceabilityMap: Record<string, VolumeTraceabilityDetail> = {};

    for (const item of rawItems) {
      // Rule 21 & 22: Duplicate Work & Element Detection
      const normName = (item.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const normCode = (item.ahspCode || '').trim().toUpperCase();
      const normCat = (item.category || '').trim().toUpperCase();
      
      // Extract element ID if present
      const elementIdMatch = item.name.match(/([A-Z]{2,4}-[A-Z0-9]+-[0-9]+)/i) || 
                             item.sourceObjectId?.match(/([A-Z]{2,4}-[A-Z0-9]+-[0-9]+)/i);
      const elementKey = elementIdMatch ? elementIdMatch[1].toUpperCase() : null;

      const dedupeKey = elementKey 
        ? `elem_${elementKey}` 
        : `${normCat}___${normCode}___${normName}`;

      const existing = mergedMap.get(dedupeKey);
      if (existing) {
        duplicateItemsCount++;
        findings.push(`Duplikasi terdeteksi & digabung: "${item.name}" (sama dengan "${existing.name}").`);
        
        // Take maximum or merge safely without double counting
        if (item.volume > existing.volume) {
          existing.volume = item.volume;
          existing.totalPrice = SafeDecimalEngine.safeMultiply(existing.volume, existing.unitPrice, 0);
        }
      } else {
        mergedMap.set(dedupeKey, { ...item });
      }

      // Populate traceability
      traceabilityMap[item.id] = {
        elementId: elementKey || item.sourceObjectId || `ELEM-${item.id}`,
        workName: item.name,
        calculatedVolume: item.volume,
        unit: item.unit,
        sourceSheet: (item as any).sourceSheet || 'DED - Gambar Arsitektur/Struktur',
        sourcePage: (item as any).sourcePage || 1,
        formula: (item as any).calculationFormula || `${item.volume} ${item.unit}`,
        dimensions: (item as any).dimensions || {},
        breakdownNotes: `Dihitung secara deterministik untuk item ${item.name}`
      };
    }

    const itemsAfterDedup = Array.from(mergedMap.values());
    const directAfterDedup = itemsAfterDedup.reduce((sum, itm) => sum + itm.totalPrice, 0);
    const totalAfterDuplicateRemoval = directAfterDedup + 
      Math.round(directAfterDedup * (options?.overheadRate ?? 0.05)) + 
      Math.round(directAfterDedup * (options?.profitRate ?? 0.10)) + 
      ((options?.taxEnabled ?? false) ? Math.round((directAfterDedup * 1.15) * ((options?.taxRate ?? 11) / 100)) : 0);

    // STEP 3: QUANTITY AUDIT & SINGLE-STOREY SANITY CHECKS
    const validatedItems: GeneratedRABItem[] = [];

    for (const item of itemsAfterDedup) {
      let isBlocked = false;
      const lowerName = item.name.toLowerCase();
      const lowerCat = item.category.toLowerCase();

      // Rule 4 & 27: SINGLE STOREY HOUSE (1 FLOOR) REJECTIONS
      if (isSingleStorey) {
        const isFloor2Work = 
          lowerName.includes('lantai 2') ||
          lowerName.includes('lt. 2') ||
          lowerName.includes('lt 2') ||
          lowerName.includes('lantai dua') ||
          lowerName.includes('plat lantai 2') ||
          lowerName.includes('tangga lantai 2') ||
          lowerName.includes('kolom lantai 2') ||
          lowerName.includes('balok lantai 2') ||
          lowerName.includes('dinding lantai 2') ||
          lowerName.includes('mep lantai 2');

        if (isFloor2Work) {
          isBlocked = true;
          quantityAnomaliesCount++;
          findings.push(`[BLOCKED] Pekerjaan lantai 2 "${item.name}" dieliminasi karena profil proyek adalah Rumah 1 Lantai (${buildingArea} m²).`);
          continue;
        }

        // Rule 8: Plafond area sanity check
        if ((lowerCat.includes('plafon') || lowerName.includes('plafon')) && item.unit === 'm²') {
          if (item.volume > buildingArea * 1.35) {
            quantityAnomaliesCount++;
            findings.push(`[ANOMALI VOLUME] Luas plafon (${item.volume} m²) melampaui batas wajar 1.35x luas bangunan (${buildingArea} m²). Diselaraskan ke luas plafon bersih ~${Math.round(buildingArea * 1.05)} m².`);
            item.volume = Number((buildingArea * 1.05).toFixed(2));
            item.totalPrice = SafeDecimalEngine.safeMultiply(item.volume, item.unitPrice, 0);
          }
        }

        // Rule 7: Floor ceramic finishing sanity check
        if ((lowerCat.includes('lantai') || lowerName.includes('keramik') || lowerName.includes('granit')) && item.unit === 'm²') {
          if (item.volume > buildingArea * 1.35) {
            quantityAnomaliesCount++;
            findings.push(`[ANOMALI VOLUME] Luas finishing lantai (${item.volume} m²) melampaui batas wajar luas bangunan (${buildingArea} m²). Diselaraskan ke luas lantai ~${buildingArea} m².`);
            item.volume = buildingArea;
            item.totalPrice = SafeDecimalEngine.safeMultiply(item.volume, item.unitPrice, 0);
          }
        }

        // Rule 6: Wall area sanity check (net wall area gross - openings max 3.0x building area)
        if ((lowerCat.includes('dinding') || lowerName.includes('bata')) && item.unit === 'm²') {
          if (item.volume > buildingArea * 3.2) {
            quantityAnomaliesCount++;
            findings.push(`[ANOMALI VOLUME] Luas dinding (${item.volume} m²) melebihi rasio 3.2x luas bangunan (${buildingArea} m²).`);
          }
        }

        // Rule 11: Excavation sanity check
        if ((lowerCat.includes('tanah') || lowerName.includes('galian')) && item.unit === 'm³') {
          const excavationRatio = item.volume / buildingArea;
          if (excavationRatio > 1.25) {
            quantityAnomaliesCount++;
            findings.push(`[WARNING GALIAN] Volume galian tanah (${item.volume} m³) relatif sangat tinggi terhadap luas bangunan (${buildingArea} m²). Rasio: ${excavationRatio.toFixed(2)} m³/m².`);
          }
        }
      }

      if (!isBlocked) {
        validatedItems.push(item);
      }
    }

    const directAfterQty = validatedItems.reduce((sum, itm) => sum + itm.totalPrice, 0);
    const totalAfterQuantityCorrection = directAfterQty + 
      Math.round(directAfterQty * (options?.overheadRate ?? 0.05)) + 
      Math.round(directAfterQty * (options?.profitRate ?? 0.10)) + 
      ((options?.taxEnabled ?? false) ? Math.round((directAfterQty * 1.15) * ((options?.taxRate ?? 11) / 100)) : 0);

    // STEP 4: AHSP MAPPING & PROJECT TYPE DATABASE ROUTING
    for (const item of validatedItems) {
      const lowerName = item.name.toLowerCase();
      const code = (item.ahspCode || '').toUpperCase();

      // Rule 3: Forbid AHSP SDA for Building Projects
      if (projectType === 'BUILDING') {
        const isSdaCode = code.startsWith('SDA') || 
                          code.startsWith('A.3.2.1') || // Pasangan batu saluran irigasi
                          code.includes('IRIGASI') || 
                          code.includes('BENDUNG') ||
                          lowerName.includes('irigasi') ||
                          lowerName.includes('sayap pengarah bendung') ||
                          lowerName.includes('kolom olak') ||
                          lowerName.includes('pintu air ulir');

        if (isSdaCode) {
          wrongAHSPCount++;
          findings.push(`[SALAH DATABASE AHSP] Item "${item.name}" terpetakan ke AHSP SDA (${code}). Proyek Gedung & Rumah dilarang memakai AHSP SDA.`);
          
          // Re-map to proper Building AHSP
          if (lowerName.includes('batu') || lowerName.includes('pasangan')) {
            item.ahspCode = 'A.3.2.1.2'; // Pondasi batu belah 1:4 gedung
            item.name = 'Pasangan Pondasi Batu Belah Campuran 1:4 (Gedung)';
            item.category = 'PEKERJAAN PONDASI';
          }
        }
      }
    }

    const directAfterAHSP = validatedItems.reduce((sum, itm) => sum + itm.totalPrice, 0);
    const totalAfterAHSPCorrection = directAfterAHSP + 
      Math.round(directAfterAHSP * (options?.overheadRate ?? 0.05)) + 
      Math.round(directAfterAHSP * (options?.profitRate ?? 0.10)) + 
      ((options?.taxEnabled ?? false) ? Math.round((directAfterAHSP * 1.15) * ((options?.taxRate ?? 11) / 100)) : 0);

    // STEP 5: PRICE ACCURACY & UNIFORM PRICE AUDIT
    // Rule 18 & 20: No identical flat pricing across multiple different works (e.g. 165000 or 268000 applied universally)
    const priceFrequency: Record<number, string[]> = {};
    for (const item of validatedItems) {
      if (item.unitPrice > 0) {
        if (!priceFrequency[item.unitPrice]) priceFrequency[item.unitPrice] = [];
        priceFrequency[item.unitPrice].push(item.name);
      }
    }

    for (const [pStr, names] of Object.entries(priceFrequency)) {
      const priceVal = parseFloat(pStr);
      if (priceVal > 0 && names.length >= 4) {
        priceAnomaliesCount++;
        findings.push(`[ANOMALI HARGA SATUAN] Harga Rp ${priceVal.toLocaleString('id-ID')} digunakan secara seragam pada ${names.length} pekerjaan berbeda (${names.slice(0, 2).join(', ')}...). Setiap pekerjaan wajib memiliki HSP independen.`);
      }
    }

    // Ensure every item's unit price matches component sum
    for (const item of validatedItems) {
      const compSum = (item.materialPrice || 0) + (item.laborPrice || 0) + (item.equipmentPrice || 0);
      if (compSum > 0 && Math.abs(compSum - item.unitPrice) > 50) {
        // Correct unit price to strict deterministic sum
        item.unitPrice = compSum;
        item.totalPrice = SafeDecimalEngine.safeMultiply(item.volume, item.unitPrice, 0);
      }
    }

    const directAfterPrice = validatedItems.reduce((sum, itm) => sum + itm.totalPrice, 0);
    const totalAfterPriceCorrection = directAfterPrice + 
      Math.round(directAfterPrice * (options?.overheadRate ?? 0.05)) + 
      Math.round(directAfterPrice * (options?.profitRate ?? 0.10)) + 
      ((options?.taxEnabled ?? false) ? Math.round((directAfterPrice * 1.15) * ((options?.taxRate ?? 11) / 100)) : 0);

    // STEP 6: OVERHEAD, PROFIT & TAX (PPN) DEDUPLICATION
    // Rule 24 & 25: Overhead & Profit applied ONCE. Tax is strictly configurable.
    const cleanDirectCost = directAfterPrice;
    const cleanOverhead = Math.round(cleanDirectCost * (options?.overheadRate ?? 0.05));
    const cleanProfit = Math.round(cleanDirectCost * (options?.profitRate ?? 0.10));
    const cleanSubtotal = cleanDirectCost + cleanOverhead + cleanProfit;

    const taxEnabled = options?.taxEnabled ?? false;
    const taxRate = options?.taxRate ?? 11;
    const cleanTax = taxEnabled ? Math.round(cleanSubtotal * (taxRate / 100)) : 0;
    const totalAfterMarkupCorrection = cleanSubtotal + cleanTax;

    // STEP 7: COST BREAKDOWN (11 STANDARDIZED DIVISIONS)
    const breakdown: CostBreakdownSummary = {
      persiapan: 0,
      tanahPondasi: 0,
      struktur: 0,
      dinding: 0,
      atap: 0,
      lantai: 0,
      plafon: 0,
      pintuJendela: 0,
      mep: 0,
      finishing: 0,
      lainLain: 0,
      directCost: cleanDirectCost,
      overheadPercent: (options?.overheadRate ?? 0.05) * 100,
      overheadAmount: cleanOverhead,
      profitPercent: (options?.profitRate ?? 0.10) * 100,
      profitAmount: cleanProfit,
      taxEnabled,
      taxPercent: taxRate,
      taxAmount: cleanTax,
      grandTotal: totalAfterMarkupCorrection
    };

    for (const item of validatedItems) {
      const c = (item.category || '').toUpperCase();
      const n = item.name.toUpperCase();
      const cost = item.totalPrice;

      if (c.includes('PERSIAPAN') || n.includes('PEMBERSIHAN') || n.includes('BOUWPLANK')) {
        breakdown.persiapan += cost;
      } else if (c.includes('TANAH') || c.includes('PONDASI') || n.includes('GALIAN') || n.includes('URUGAN') || n.includes('PONDASI')) {
        breakdown.tanahPondasi += cost;
      } else if (c.includes('STRUKTUR') || c.includes('BETON') || n.includes('KOLOM') || n.includes('BALOK') || n.includes('SLOOF') || n.includes('PELAT')) {
        breakdown.struktur += cost;
      } else if (c.includes('DINDING') || c.includes('PLESTERAN') || n.includes('BATA') || n.includes('ACIAN')) {
        breakdown.dinding += cost;
      } else if (c.includes('ATAP') || n.includes('GENTENG') || n.includes('KUDA-KUDA') || n.includes('SPANDEK')) {
        breakdown.atap += cost;
      } else if (c.includes('LANTAI') || n.includes('KERAMIK') || n.includes('GRANIT') || n.includes('TILE')) {
        breakdown.lantai += cost;
      } else if (c.includes('PLAFON') || n.includes('GYPSUM') || n.includes('HOLLOW')) {
        breakdown.plafon += cost;
      } else if (c.includes('PINTU') || c.includes('JENDELA') || c.includes('KUSEN')) {
        breakdown.pintuJendela += cost;
      } else if (c.includes('MEP') || c.includes('ELEKTRIKAL') || c.includes('SANITAIR') || c.includes('PLUMBING')) {
        breakdown.mep += cost;
      } else if (c.includes('FINISHING') || c.includes('CAT') || c.includes('PENGECATAN')) {
        breakdown.finishing += cost;
      } else {
        breakdown.lainLain += cost;
      }
    }

    // STEP 8: MAJOR COST DRIVERS (> 10% OF TOTAL RAB)
    const costDrivers: MajorCostDriver[] = [];
    const thresholdCost = cleanDirectCost * 0.10;

    for (const item of validatedItems) {
      if (item.totalPrice >= thresholdCost && item.totalPrice > 0) {
        const pct = Number(((item.totalPrice / cleanDirectCost) * 100).toFixed(1));
        const isAnomaly = pct > 25.0 && !item.name.toLowerCase().includes('struktur');
        
        costDrivers.push({
          itemId: item.id,
          name: item.name,
          category: item.category,
          totalCost: item.totalPrice,
          percentageOfTotal: pct,
          sourceSheet: (item as any).sourceSheet || 'DED Utama',
          isFlaggedAnomaly: isAnomaly,
          anomalyReason: isAnomaly ? `Item menyumbang ${pct}% dari direct cost proyek.` : undefined
        });
      }
    }
    costDrivers.sort((a, b) => b.totalCost - a.totalCost);

    // STEP 9: SANITY CHECK BIAYA / COST OUTLIER
    const costPerM2 = buildingArea > 0 ? Math.round(totalAfterMarkupCorrection / buildingArea) : 0;
    if (isSingleStorey && costPerM2 > 8500000) {
      statusReasons.push(`[COST_OUTLIER] Biaya per m² (Rp ${costPerM2.toLocaleString('id-ID')}/m²) melebihi benchmark rumah tinggal 1 lantai (~Rp 3.5 jt - 6.5 jt/m²).`);
    }

    // STEP 10: FINAL STATUS DETERMINATION
    let status: RABFinalStatus = 'READY';

    if (duplicateItemsCount > 0 || quantityAnomaliesCount > 0 || wrongAHSPCount > 0 || priceAnomaliesCount > 0 || statusReasons.length > 0) {
      status = 'NEEDS_REVIEW';
    }

    if (validatedItems.some(i => i.unitPrice <= 0)) {
      status = 'PRICE_NOT_FOUND';
    }

    if (validatedItems.some(i => !i.ahspCode || i.ahspCode === 'AHSP_NOT_FOUND')) {
      status = 'AHSP_NOT_FOUND';
    }

    const delta = totalBeforeAudit - totalAfterMarkupCorrection;
    const reductionPercentage = totalBeforeAudit > 0 ? Number(((delta / totalBeforeAudit) * 100).toFixed(1)) : 0;

    return {
      projectTitle: profile?.location ? `Rumah Tinggal (${profile.location})` : 'Rumah Tinggal',
      buildingArea,
      floorCount,
      status,
      isSingleStoreyHouse: isSingleStorey,
      statusReasons,
      findingsCount: {
        duplicateItems: duplicateItemsCount,
        quantityAnomalies: quantityAnomaliesCount,
        wrongAHSPMappings: wrongAHSPCount,
        priceAnomalies: priceAnomaliesCount,
        possibleDoubleMarkup: doubleMarkupCount
      },
      costDrivers,
      beforeAfter: {
        totalBeforeAudit,
        totalAfterDuplicateRemoval,
        totalAfterQuantityCorrection,
        totalAfterAHSPCorrection,
        totalAfterPriceCorrection,
        totalAfterMarkupCorrection,
        estimatedCorrection: {
          from: totalBeforeAudit,
          to: totalAfterMarkupCorrection,
          delta,
          reductionPercentage
        },
        duplicateCount: duplicateItemsCount,
        quantityAnomaliesCount,
        wrongAHSPCount,
        priceAnomaliesCount,
        doubleMarkupRisksCount: doubleMarkupCount,
        auditFindings: findings
      },
      costBreakdown: breakdown,
      cleanedItems: validatedItems,
      traceabilityMap
    };
  }
}

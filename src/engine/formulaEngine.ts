import { ProjectCostSummary, RABSection, RABItem } from '../types';
import { SafeDecimalEngine } from './safeDecimalEngine';

/**
 * Format number to Indonesian Rupiah currency string
 * e.g. 1250000 -> "Rp 1.250.000"
 */
export function formatRupiah(amount: number, includeDecimals = false): string {
  if (isNaN(amount) || amount === null || amount === undefined) return 'Rp 0';
  
  const rounded = includeDecimals 
    ? (SafeDecimalEngine.safeRound(amount, 2)).toFixed(2)
    : SafeDecimalEngine.safeRound(amount, 0).toString();

  const parts = rounded.split('.');
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  
  if (includeDecimals && parts[1] && parts[1] !== '00') {
    return `Rp ${integerPart},${parts[1]}`;
  }
  
  return `Rp ${integerPart}`;
}

/**
 * Format number with Indonesian decimal format
 * e.g. 125.4 -> "125,40"
 */
export function formatNumberId(num: number, decimals = 2): string {
  if (isNaN(num) || num === null || num === undefined) return '0';
  const fixed = (SafeDecimalEngine.safeRound(num, decimals)).toFixed(decimals);
  const parts = fixed.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return parts.join(',');
}

/**
 * Safely parse Indonesian number string into JavaScript number
 * Handles "1.250.000,50" -> 1250000.5
 */
export function parseNumberId(str: string | number): number {
  if (typeof str === 'number') return isNaN(str) ? 0 : str;
  if (!str) return 0;
  let clean = str.replace(/Rp\s?/gi, '').trim();
  clean = clean.replace(/\./g, '').replace(/,/g, '.');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

/**
 * Safely evaluate math expression for dimension formula
 * e.g. "(25.08 * 3.00) - 9.36" -> 65.88
 */
export function evaluateFormula(formula: string): number {
  if (!formula) return 0;
  try {
    const sanitized = formula.replace(/[^0-9+\-*/().\s]/g, '');
    if (!sanitized.trim()) return 0;
    const result = new Function(`'use strict'; return (${sanitized})`)();
    return typeof result === 'number' && !isNaN(result) && isFinite(result) 
      ? SafeDecimalEngine.safeRound(result, 2) 
      : 0;
  } catch (err) {
    console.warn(`Formula evaluation error on "${formula}":`, err);
    return 0;
  }
}

/**
 * Recalculate entire RAB project tree with decimal precision and Bobot (%) calculation
 */
export function recalculateProjectCost(
  sections: RABSection[],
  currentSummary: ProjectCostSummary,
  buildingArea: number = 1
): { updatedSections: RABSection[]; updatedSummary: ProjectCostSummary } {
  let directCost = 0;

  // Pass 1: Compute section subtotals & Direct Cost with SafeDecimalEngine
  const pass1Sections = sections.map((section, secIdx) => {
    let sectionSubtotal = 0;

    const updatedItems: RABItem[] = section.items.map((item, itmIdx) => {
      const calculatedUnitPrice = SafeDecimalEngine.safeAdd(
        item.materialPrice || 0,
        item.laborPrice || 0,
        item.equipmentPrice || 0
      );

      const unitPrice = item.unitPrice > 0 && (item.materialPrice || 0) === 0 && (item.laborPrice || 0) === 0
        ? SafeDecimalEngine.sanitize(item.unitPrice, 0, true)
        : calculatedUnitPrice;

      const totalPrice = SafeDecimalEngine.safeMultiply(item.volume || 0, unitPrice, 0);
      sectionSubtotal = SafeDecimalEngine.safeAdd(sectionSubtotal, totalPrice);

      let finalUnitPrice = unitPrice;
      if (item.directorMarkupPercent && item.directorMarkupPercent > 0) {
        const markupAmt = SafeDecimalEngine.safePercent(unitPrice, item.directorMarkupPercent, 0);
        finalUnitPrice = SafeDecimalEngine.safeAdd(finalUnitPrice, markupAmt);
      }
      if (item.directorMarkupNominal && item.directorMarkupNominal > 0) {
        finalUnitPrice = SafeDecimalEngine.safeAdd(finalUnitPrice, item.directorMarkupNominal);
      }
      const finalTotalPrice = SafeDecimalEngine.safeMultiply(item.volume || 0, finalUnitPrice, 0);

      const wbsNumber = item.wbsNumber || `${secIdx + 1}.${itmIdx + 1}`;

      return {
        ...item,
        wbsNumber,
        unitPrice,
        totalPrice,
        finalUnitPrice,
        finalTotalPrice,
      };
    });

    directCost = SafeDecimalEngine.safeAdd(directCost, sectionSubtotal);

    return {
      ...section,
      subtotal: sectionSubtotal,
      items: updatedItems,
    };
  });

  // Calculate project-level overhead, profit, contingency, director markup, and taxes
  const overheadAmount = SafeDecimalEngine.safePercent(directCost, currentSummary.overheadPercent, 0);
  const profitAmount = SafeDecimalEngine.safePercent(directCost, currentSummary.profitPercent, 0);
  const contingencyAmount = SafeDecimalEngine.safePercent(directCost, currentSummary.contingencyPercent, 0);

  const percentMarkupAmount = SafeDecimalEngine.safePercent(directCost, currentSummary.directorMarkupPercent, 0);
  const directorMarkupTotal = SafeDecimalEngine.safeAdd(percentMarkupAmount, currentSummary.directorMarkupNominal || 0);

  const subtotalBeforeTax = SafeDecimalEngine.safeAdd(
    directCost,
    overheadAmount,
    profitAmount,
    contingencyAmount,
    directorMarkupTotal
  );

  const taxAmount = SafeDecimalEngine.safePercent(subtotalBeforeTax, currentSummary.taxPercent, 0);
  const pphPercent = currentSummary.pphPercent ?? 0;
  const pphAmount = SafeDecimalEngine.safePercent(subtotalBeforeTax, pphPercent, 0);
  const grandTotal = SafeDecimalEngine.safeAdd(subtotalBeforeTax, taxAmount, pphAmount);
  
  const validBuildingArea = buildingArea > 0 ? buildingArea : 1;
  const costPerM2 = SafeDecimalEngine.safeRound(grandTotal / validBuildingArea, 0);

  // Pass 2: Calculate Bobot (%) for each item against Direct Cost
  const divisor = directCost > 0 ? directCost : 1;
  const updatedSections = pass1Sections.map(sec => ({
    ...sec,
    items: sec.items.map(item => ({
      ...item,
      weightPercent: SafeDecimalEngine.calculateWeight(item.totalPrice, divisor),
    }))
  }));

  const updatedSummary: ProjectCostSummary = {
    ...currentSummary,
    directCost,
    overheadAmount,
    profitAmount,
    contingencyAmount,
    directorMarkupTotal,
    subtotalBeforeTax,
    taxAmount,
    pphPercent,
    pphAmount,
    grandTotal,
    costPerM2,
  };

  return { updatedSections, updatedSummary };
}

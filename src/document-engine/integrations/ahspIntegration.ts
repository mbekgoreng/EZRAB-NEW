import type { ProjectAhspItem } from '../../project-data/types';

// Batch 4 (addendum): composing a price from cost components is only valid
// when at least one component actually exists. Summing absent components
// produced a silent 0 that defeated the exporters' unresolved-price markers.
const composedPrice = (x: any): number | null => {
  const parts = [x.materialCost, x.laborCost, x.equipmentCost];
  if (!parts.some((v) => v != null && Number.isFinite(Number(v)))) return null;
  return parts.reduce((sum, v) => sum + (Number(v) || 0), 0);
};

export const mapAhspRows = (items: Array<ProjectAhspItem | Record<string, any>> = []) =>
  items.map((x: any) => {
    const unitPrice = x.unitPrice ?? x.price ?? composedPrice(x);
    return {
      code: x.code ?? x.ahspCode,
      description: x.description ?? x.name,
      unit: x.unit,
      coefficient: x.coefficient ?? x.coefficients ?? x.coef ?? 1,
      unitPrice,
      amount: x.amount ?? x.total ?? x.totalCost ?? (unitPrice == null ? null : (x.coefficient ?? x.coefficients ?? x.coef ?? 1) * unitPrice),
    };
  });
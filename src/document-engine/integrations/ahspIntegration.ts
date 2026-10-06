import type { ProjectAhspItem } from '../../project-data/types';

export const mapAhspRows = (items: Array<ProjectAhspItem | Record<string, any>> = []) =>
  items.map((x: any) => ({
    code: x.code ?? x.ahspCode,
    description: x.description ?? x.name,
    unit: x.unit,
    coefficient: x.coefficient ?? x.coefficients ?? x.coef ?? 1,
    unitPrice: x.unitPrice ?? x.price ?? ((Number(x.materialCost) || 0) + (Number(x.laborCost) || 0) + (Number(x.equipmentCost) || 0)),
    amount: x.amount ?? x.total ?? x.totalCost ?? (
      (x.coefficient ?? x.coefficients ?? x.coef ?? 1) *
      (x.unitPrice ?? x.price ?? ((Number(x.materialCost) || 0) + (Number(x.laborCost) || 0) + (Number(x.equipmentCost) || 0)))
    ),
  }));
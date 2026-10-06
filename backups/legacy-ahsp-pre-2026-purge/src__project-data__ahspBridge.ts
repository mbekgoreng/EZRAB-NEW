import { ProjectDataRepository, createProjectEntity } from './repository';
import type { ProjectAhspItem } from './types';
import type { NationalAHSPItem } from '../data/nationalCostDatabase/types';

/**
 * Canonical Project AHSP Bridge Service
 *
 * Guarantees a single persistent source of truth for project-scoped AHSP items
 * using ProjectDataRepository ('ahsp', projectId).
 *
 * Architecture:
 *   AHSP Catalog Selection / Custom User Input
 *         ↓
 *   saveProjectAhspFromCatalog / saveCustomProjectAhsp
 *         ↓
 *   ProjectDataRepository<ProjectAhspItem> ('ahsp', projectId)
 *         ↓
 *   Persistent storage namespace: ezrab:project:{projectId}:ahsp
 *         ↓
 *   ahspIntegration (mapAhspRows)
 *         ↓
 *   DocumentData.ahsp
 */

export const getProjectAhspRepo = (projectId: string): ProjectDataRepository<ProjectAhspItem> => {
  return new ProjectDataRepository<ProjectAhspItem>('ahsp', projectId);
};

export const listProjectAhspItems = (projectId: string): ProjectAhspItem[] => {
  if (!projectId) return [];
  return getProjectAhspRepo(projectId).list();
};

export const saveProjectAhspFromCatalog = (
  projectId: string,
  catalogItem: NationalAHSPItem,
  customization?: Partial<Omit<ProjectAhspItem, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>>
): ProjectAhspItem => {
  const repo = getProjectAhspRepo(projectId);
  const existing = repo.list().find((x) => x.ahspCode === catalogItem.code);

  if (existing) {
    const updated = repo.update(existing.id, {
      description: customization?.description ?? catalogItem.name,
      unit: customization?.unit ?? catalogItem.unit,
      coefficients: customization?.coefficients ?? 1.0,
      materialCost: customization?.materialCost ?? catalogItem.totalMaterial,
      laborCost: customization?.laborCost ?? catalogItem.totalLabor,
      equipmentCost: customization?.equipmentCost ?? catalogItem.totalEquipment,
      sourceReferenceId: catalogItem.id,
      ...customization,
    });
    return updated!;
  }

  const newEntity = createProjectEntity<ProjectAhspItem>(projectId, {
    ahspCode: catalogItem.code,
    description: customization?.description ?? catalogItem.name,
    unit: customization?.unit ?? catalogItem.unit,
    coefficients: customization?.coefficients ?? 1.0,
    materialCost: customization?.materialCost ?? catalogItem.totalMaterial,
    laborCost: customization?.laborCost ?? catalogItem.totalLabor,
    equipmentCost: customization?.equipmentCost ?? catalogItem.totalEquipment,
    sourceReferenceId: catalogItem.id,
    ...customization,
  });

  return repo.save(newEntity);
};

export const saveCustomProjectAhsp = (
  projectId: string,
  data: Omit<ProjectAhspItem, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>
): ProjectAhspItem => {
  const repo = getProjectAhspRepo(projectId);
  const existing = repo.list().find((x) => x.ahspCode === data.ahspCode);

  if (existing) {
    const updated = repo.update(existing.id, data);
    return updated!;
  }

  const entity = createProjectEntity<ProjectAhspItem>(projectId, data);
  return repo.save(entity);
};

export const removeProjectAhspItem = (projectId: string, id: string): void => {
  getProjectAhspRepo(projectId).remove(id);
};

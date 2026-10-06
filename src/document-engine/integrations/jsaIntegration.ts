import type { ProjectJsaItem } from '../../project-data/types';

export const mapJsaRows = (items: Array<ProjectJsaItem | Record<string, any>> = []) =>
  items.map((x: any) => ({
    activity: x.activity,
    hazard: x.hazard,
    risk: x.risk,
    consequence: x.consequence ?? x.risk,
    riskLevel: x.riskLevel ?? x.risk,
    controlMeasure: x.controlMeasure ?? x.control,
    responsible: x.responsible ?? x.responsiblePerson,
    ppe: x.ppe,
  }));
import type { ProjectRkkData } from '../../project-data/types';

export const mapRkkRows = (items: Array<ProjectRkkData | Record<string, any>> = []) =>
  items.map((x: any) => ({
    organization: x.organization,
    hsePersonnel: x.hsePersonnel ?? x.person,
    safetyObjectives: x.safetyObjectives ?? x.objective,
    riskControls: x.riskControls ?? x.control,
    procedures: x.procedures,
  }));
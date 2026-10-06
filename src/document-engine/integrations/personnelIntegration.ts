import type { ProjectPersonnel } from '../../project-data/types';

export const mapPersonnelRows = (items: Array<ProjectPersonnel | Record<string, any>> = []) =>
  items.map((x: any) => ({
    name: x.name,
    position: x.position,
    qualification: x.qualification,
    education: x.education ?? x.qualification,
    experience: x.experience,
    responsibility: x.responsibility,
    certification: x.certification,
  }));
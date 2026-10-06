import { ProjectDataRepository, createProjectEntity } from '../project-data/repository';
import { mapAhspRows } from '../document-engine/integrations/ahspIntegration';
import { mapJsaRows } from '../document-engine/integrations/jsaIntegration';
import { mapPersonnelRows } from '../document-engine/integrations/personnelIntegration';
import { mapEquipmentRows } from '../document-engine/integrations/equipmentIntegration';

import type { ProjectPersonnel, ProjectEquipment, ProjectJsaItem, ProjectAhspItem } from '../project-data/types';

const assert = (value: boolean, message: string) => { if (!value) throw new Error(`FAIL: ${message}`); console.log(`PASS: ${message}`); };
const projectA = 'PH43-A'; const projectB = 'PH43-B';
const personnelA = createProjectEntity<ProjectPersonnel>(projectA, { name: 'A Person', position: 'Engineer' });
const equipmentA = createProjectEntity<ProjectEquipment>(projectA, { name: 'A Crane', type: 'Crane', quantity: 1 });
const jsaA = createProjectEntity<ProjectJsaItem>(projectA, { activity: 'Excavation', hazard: 'Collapse', risk: 'High', control: 'Shoring' });
const ahspA = createProjectEntity<ProjectAhspItem>(projectA, { ahspCode: 'A.1', description: 'Concrete', unit: 'm3', coefficients: 1.2 });
assert(mapAhspRows([ahspA])[0].code === 'A.1', 'AHSP source maps project AHSP code');
assert(mapJsaRows([jsaA])[0].controlMeasure === 'Shoring', 'JSA source maps control');
assert(mapPersonnelRows([personnelA])[0].name === 'A Person', 'Personnel source maps name');
assert(mapEquipmentRows([equipmentA])[0].name === 'A Crane', 'Equipment source maps name');
const repoA = new ProjectDataRepository<ProjectPersonnel>('personnel', projectA); repoA.save(personnelA); const repoB = new ProjectDataRepository<ProjectPersonnel>('personnel', projectB);
assert(repoA.list().length === 1 && repoB.list().length === 0, 'Project source repository isolates projects');
console.log('PHASE 4.3 SOURCE TESTS: PASS');
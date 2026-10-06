import type { DocumentDefinition, DocumentData, ProjectMasterData } from './types';
import type { RABItem, RabItem, ScheduleTask, KurvaSDataPoint } from '../types';
import { mapBoqRows } from './integrations/boqIntegration';
import { mapRabRows } from './integrations/rabIntegration';
import { mapScheduleRows } from './integrations/scheduleIntegration';
import { mapKurvaSData } from './integrations/kurvaSIntegration';
import { mapAhspRows } from './integrations/ahspIntegration';
import { mapRkkRows } from './integrations/rkkIntegration';
import { mapJsaRows } from './integrations/jsaIntegration';
import { mapPersonnelRows } from './integrations/personnelIntegration';
import { mapEquipmentRows } from './integrations/equipmentIntegration';
import type { ProjectAhspItem, ProjectEquipment, ProjectJsaItem, ProjectPersonnel, ProjectRkkData } from '../project-data';

export interface DocumentSourceContext {
  master: ProjectMasterData;
  rabItems?: Array<RABItem | RabItem>;
  scheduleTasks?: ScheduleTask[];
  kurvaSData?: KurvaSDataPoint[];
  ahsp?: Array<Record<string, unknown>>;
  rkk?: Array<Record<string, unknown>>;
  jsa?: Array<Record<string, unknown>>;
  personnel?: Array<Record<string, unknown>>;
  equipment?: Array<Record<string, unknown>>;
  projectAhspItems?: ProjectAhspItem[];
  projectRkk?: ProjectRkkData[];
  projectJsa?: ProjectJsaItem[];
  projectPersonnel?: ProjectPersonnel[];
  projectEquipment?: ProjectEquipment[];
  userFieldValues?: Record<string, any>;
  companyHeaderId?: string;
  revision?: number;
  metadata?: Record<string, unknown>;
}

export const buildDocumentData = (
  definition: DocumentDefinition,
  context: DocumentSourceContext
): DocumentData => {
  const rab = mapRabRows(context.rabItems || []);
  const boq = mapBoqRows(context.rabItems || []);
  const schedule = mapScheduleRows(context.scheduleTasks || []);
  const curveS = mapKurvaSData(context.kurvaSData || []);
  const ahsp = mapAhspRows(context.ahsp || context.projectAhspItems || []);
  const rkk = mapRkkRows(context.rkk || context.projectRkk || []);
  const jsa = mapJsaRows(context.jsa || context.projectJsa || []);
  const personnel = mapPersonnelRows(context.personnel || context.projectPersonnel || []);
  const equipment = mapEquipmentRows(context.equipment || context.projectEquipment || []);

  const revision = context.revision !== undefined ? context.revision : 0;
  const userVals = context.userFieldValues || {};

  const signatoryName = userVals['signatory.name'] || userVals['director_name'] || context.master.director || '';
  const signatoryPosition = userVals['signatory.position'] || userVals['director_position'] || 'Direktur Utama';

  return {
    project: context.master,
    company: {
      name: context.master.companyName || '',
      address: context.master.companyAddress || '',
      phone: context.master.companyPhone || '',
      email: context.master.companyEmail || '',
      logo: context.master.companyLogo,
      signature: context.master.companySignature,
      signatory: signatoryName,
      signatoryPosition: signatoryPosition,
    },
    boq,
    rab,
    ahsp,
    schedule,
    curveS,
    rkk,
    jsa,
    personnel,
    equipment,
    metadata: {
      definitionId: definition.id,
      definitionCode: definition.code,
      definitionName: definition.name,
      sourceModule: definition.existingModule || 'Project Master Data',
      generatedAt: new Date().toISOString(),
      revision,
      ...(context.metadata || {}),
    },
    revision,
  };
};
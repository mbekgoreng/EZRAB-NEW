/**
 * projectClone — logika murni untuk menyalin data proyek (dipakai fitur
 * "Duplikat" draft). Item RAB & QTO disalin dengan id BARU dan projectId
 * tujuan; mapping QTO→RAB di-remap ke id salinan agar keterlacakan tidak
 * putus. Item sumber tidak pernah diubah.
 */

import type { QTOItem, QTOItemRABMapping, RabItem } from '../types';

export type CloneIdFactory = (kind: 'rab' | 'qto' | 'mapping', oldId: string, index: number) => string;

export interface CloneResult {
  rabItems: RabItem[];
  qtoItems: QTOItem[];
  mappings: QTOItemRABMapping[];
  rabIdMap: Map<string, string>;
  qtoIdMap: Map<string, string>;
}

export function cloneProjectItems(
  source: {
    rabItems: RabItem[];
    qtoItems: QTOItem[];
    mappings: QTOItemRABMapping[];
  },
  sourceProjectId: string,
  targetProjectId: string,
  makeId: CloneIdFactory
): CloneResult {
  const qtoIdMap = new Map<string, string>();
  const qtoItems = source.qtoItems
    .filter((q) => q.projectId === sourceProjectId)
    .map((q, idx) => {
      const newId = makeId('qto', q.id, idx);
      qtoIdMap.set(q.id, newId);
      // Salinan tidak lagi terikat run kalkulasi proyek sumber.
      return { ...q, id: newId, projectId: targetProjectId, calculationRunId: undefined };
    });

  const rabIdMap = new Map<string, string>();
  const rabItems = source.rabItems
    .filter((r) => r.projectId === sourceProjectId)
    .map((r, idx) => {
      const newId = makeId('rab', r.id, idx);
      rabIdMap.set(r.id, newId);
      return {
        ...r,
        id: newId,
        projectId: targetProjectId,
        // Tautan ke QTO di-remap ke salinannya bila QTO sumber ikut disalin.
        qtoItemId: r.qtoItemId ? qtoIdMap.get(r.qtoItemId) : r.qtoItemId,
        calculationRunId: undefined,
      };
    });

  const mappings = source.mappings
    .filter((m) => m.projectId === sourceProjectId)
    .map((m, idx) => {
      const qtoItemId = qtoIdMap.get(m.qtoItemId);
      const rabItemId = rabIdMap.get(m.rabItemId);
      if (!qtoItemId || !rabItemId) return null;
      return {
        ...m,
        id: makeId('mapping', m.id, idx),
        projectId: targetProjectId,
        qtoItemId,
        rabItemId,
      };
    })
    .filter((m): m is QTOItemRABMapping => m !== null);

  return { rabItems, qtoItems, mappings, rabIdMap, qtoIdMap };
}

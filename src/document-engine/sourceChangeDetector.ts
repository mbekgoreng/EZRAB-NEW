import type { DocumentRecord } from './types';
import type { DocumentSourceContext } from './documentData';

export interface SourceChangeResult {
  hasChanged: boolean;
  message?: string;
  details?: string[];
  currentHash: string;
  recordedHash?: string;
}

/**
 * Computes a deterministic lightweight fingerprint from canonical project source data
 */
export function computeSourceHash(context: DocumentSourceContext): string {
  const master = context.master || {};
  const rabItems = context.rabItems || [];
  const scheduleTasks = context.scheduleTasks || [];
  const jsa = context.jsa || [];
  const rkk = context.rkk || [];

  // 1. Rab checksum
  const rabTotal = rabItems.reduce((acc, i: any) => {
    const val = Number(i.totalPrice ?? i.amount ?? (Number(i.volume || 0) * Number(i.unitPrice || 0)));
    return acc + (isNaN(val) ? 0 : val);
  }, 0);

  // 2. Schedule checksum
  const taskCount = scheduleTasks.length;

  const keyParts = [
    master.projectName || '',
    master.projectNumber || '',
    master.location || (master as any).address || '',
    String(master.contractValue || ''),
    master.duration || '',
    master.startDate || '',
    master.endDate || '',
    `rabItems:${rabItems.length}`,
    `rabTotal:${Math.round(rabTotal)}`,
    `tasks:${taskCount}`,
    `jsa:${jsa.length}`,
    `rkk:${rkk.length}`,
  ];

  const payload = keyParts.join('|');

  // Simple deterministic 32-bit FNV-1a hash
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return 'shash-' + (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Detects whether the underlying source data has changed since this document was created or last updated
 */
export function detectSourceChanges(
  record: DocumentRecord,
  currentContext: DocumentSourceContext
): SourceChangeResult {
  const currentHash = computeSourceHash(currentContext);

  if (!record.sourceHash) {
    return {
      hasChanged: false,
      currentHash,
      recordedHash: undefined,
    };
  }

  const hasChanged = record.sourceHash !== currentHash;

  if (hasChanged) {
    return {
      hasChanged: true,
      message: 'Data sumber berubah. Dokumen ini perlu diperbarui.',
      details: [
        'Data master proyek, nilai RAB, atau jadwal pekerjaan telah mengalami perubahan sejak revisi dokumen ini dibuat.',
        'Silakan tinjau kembali data dan lakukan pembaruan atau buat revisi baru.',
      ],
      currentHash,
      recordedHash: record.sourceHash,
    };
  }

  return {
    hasChanged: false,
    currentHash,
    recordedHash: record.sourceHash,
  };
}

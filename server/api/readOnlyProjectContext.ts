/**
 * Local-development bridge contract. This validates shape and size only; it is
 * not an authorization boundary because the current application has no server
 * session or trusted project ownership source.
 */
export interface ReadOnlyProjectContextPayload {
  source: 'frontend_project_context' | 'server_official_context';
  project: { available: boolean; id: string | null; name?: string; location?: string; status?: string; progress?: number };
  rab: { available: boolean; items: unknown[]; total: number | null; item_count: number | null };
  work_items: { available: boolean; items: unknown[] };
  qto: { available: boolean; items: unknown[] };
  schedule: { available: boolean; items: unknown[] };
  metadata: { generated_at: string; is_read_only: true; contract_version: '1.0' };
}

const MAX_PAYLOAD_BYTES = 96 * 1024;
const MAX_ITEMS_PER_COLLECTION = 30;
const MAX_NESTING_DEPTH = 6;
const MAX_STRING_LENGTH = 2_000;
const credentialPattern = /(api[_-]?key|authorization|password|secret|token|cookie)/i;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

function hasCredentialKey(value: unknown): boolean {
  const record = asRecord(value);
  if (record) return Object.entries(record).some(([key, child]) => credentialPattern.test(key) || hasCredentialKey(child));
  if (Array.isArray(value)) return value.some(hasCredentialKey);
  return false;
}

function hasUnsafeStructure(value: unknown, depth = 0): boolean {
  if (depth > MAX_NESTING_DEPTH) return true;
  if (typeof value === 'string') return value.length > MAX_STRING_LENGTH;
  if (Array.isArray(value)) return value.some((child) => hasUnsafeStructure(child, depth + 1));
  const record = asRecord(value);
  return record ? Object.values(record).some((child) => hasUnsafeStructure(child, depth + 1)) : false;
}

function validCollection(value: unknown): value is { available: boolean; items: unknown[] } {
  const record = asRecord(value);
  return Boolean(record && typeof record.available === 'boolean' && Array.isArray(record.items) && record.items.length <= MAX_ITEMS_PER_COLLECTION);
}

export function validateReadOnlyProjectContext(value: unknown, expectedProjectId: string): ReadOnlyProjectContextPayload {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_PAYLOAD_BYTES) throw new Error('Project context payload exceeds 96 KB.');
  const context = asRecord(value);
  if (!context || context.source !== 'frontend_project_context') throw new Error('Invalid project context source.');
  if (hasCredentialKey(context)) throw new Error('Project context must not contain credentials.');
  if (hasUnsafeStructure(context)) throw new Error('Project context exceeds nesting or field-length limits.');

  const project = asRecord(context.project);
  const rab = asRecord(context.rab);
  const metadata = asRecord(context.metadata);
  if (!project || project.available !== true || project.id !== expectedProjectId || typeof project.name !== 'string') {
    throw new Error('Project context must match the requested active project.');
  }
  if (!rab || typeof rab.available !== 'boolean' || !Array.isArray(rab.items) || rab.items.length > MAX_ITEMS_PER_COLLECTION ||
      !(typeof rab.total === 'number' || rab.total === null) || !(typeof rab.item_count === 'number' || rab.item_count === null)) {
    throw new Error('Invalid RAB context.');
  }
  if (!validCollection(context.work_items) || !validCollection(context.qto) || !validCollection(context.schedule)) {
    throw new Error('Invalid project context collection.');
  }
  if (!metadata || metadata.is_read_only !== true || metadata.contract_version !== '1.0' || typeof metadata.generated_at !== 'string') {
    throw new Error('Project context must be explicitly read-only.');
  }
  return context as unknown as ReadOnlyProjectContextPayload;
}

export { MAX_PAYLOAD_BYTES };

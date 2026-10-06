import { MAX_PAYLOAD_BYTES, validateReadOnlyProjectContext } from '../api/readOnlyProjectContext.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const validContext = () => ({
  source: 'frontend_project_context',
  project: { available: true, id: 'PRJ-1', name: 'Proyek Uji' },
  rab: { available: true, items: [], total: 0, item_count: 0 },
  work_items: { available: false, items: [] },
  qto: { available: false, items: [] },
  schedule: { available: false, items: [] },
  metadata: { generated_at: '2026-09-13T00:00:00.000Z', is_read_only: true, contract_version: '1.0' },
});

function expectRejected(value: unknown, expectedProjectId: string): void {
  let rejected = false;
  try { validateReadOnlyProjectContext(value, expectedProjectId); } catch { rejected = true; }
  assert(rejected, 'invalid context is rejected');
}

export function runReadOnlyProjectContextTests(): void {
  const accepted = validateReadOnlyProjectContext(validContext(), 'PRJ-1');
  assert(accepted.metadata.is_read_only, 'valid read-only context is accepted');
  expectRejected({ ...validContext(), project: { available: true, id: 'PRJ-OTHER', name: 'Proyek lain' } }, 'PRJ-1');
  expectRejected({ ...validContext(), apiKey: 'not-allowed' }, 'PRJ-1');
  expectRejected({ ...validContext(), rab: { available: true, total: 0, item_count: 31, items: Array(31).fill({}) } }, 'PRJ-1');
  expectRejected({ ...validContext(), padding: 'x'.repeat(MAX_PAYLOAD_BYTES) }, 'PRJ-1');
}

runReadOnlyProjectContextTests();
